import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireClientAccess } from "./authHelpers";
import type { Id } from "./_generated/dataModel";

function extractKeyValue(content: string, keyColumn: string): string {
    const prefix = `${keyColumn}: `;
    for (const line of content.split("\n")) {
        if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    }
    return "";
}

const MAX_RETRY_PASSES = 2;
const APPEND_MAX_PER_CALL = 2000;          // tope defensivo del lote por llamada
const PARALLEL_BATCH_SIZE = 5;             // sin keyColumn
const PARALLEL_INVOCATION_ROWS = 20;       // sin keyColumn (por scheduler tick)
const SEQUENTIAL_INVOCATION_ROWS = 10;     // con keyColumn

// ── Pública: inicia un job de importación (sin enviar las filas todavía) ──────

export const start = mutation({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        total: v.number(),
        keyColumn: v.optional(v.string()),
        duplicateBehavior: v.optional(v.union(v.literal("add"), v.literal("update"))),
    },
    handler: async (ctx, { knowledgeBaseId, total, keyColumn, duplicateBehavior }) => {
        const kb = await ctx.db.get(knowledgeBaseId);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);

        // Cancela cualquier importación activa previa para esta KB.
        const existing = await ctx.db
            .query("excel_imports")
            .withIndex("by_knowledge_base", q => q.eq("knowledgeBase", knowledgeBaseId))
            .filter(q =>
                q.or(
                    q.eq(q.field("status"), "pending"),
                    q.eq(q.field("status"), "processing"),
                )
            )
            .first();
        if (existing) {
            if (existing.scheduledId) {
                try { await ctx.scheduler.cancel(existing.scheduledId); } catch { /* ya ejecutando */ }
            }
            await ctx.db.patch(existing._id, { status: "cancelled" });
        }

        const importId = await ctx.db.insert("excel_imports", {
            knowledgeBase: knowledgeBaseId,
            client: kb.client,
            status: "pending",
            total,
            processed: 0,
            ok: 0,
            fail: 0,
            updated: 0,
            skipped: 0,
            seeding: true,
            keyColumn,
            duplicateBehavior,
        });

        return importId;
    },
});

// ── Pública: agrega un lote de filas al job en curso (durante el seeding) ────

export const appendImportRows = mutation({
    args: {
        importId: v.id("excel_imports"),
        rows: v.array(v.string()),
        baseIndex: v.number(),
    },
    handler: async (ctx, { importId, rows, baseIndex }) => {
        const job = await ctx.db.get(importId);
        if (!job) throw new Error("Importación no encontrada");
        await requireClientAccess(ctx, job.client);
        if (job.status === "cancelled") throw new Error("Importación cancelada");
        if (!job.seeding) throw new Error("Importación ya finalizó la fase de carga");
        if (rows.length > APPEND_MAX_PER_CALL) {
            throw new Error(`Máximo ${APPEND_MAX_PER_CALL} filas por llamada`);
        }

        for (let i = 0; i < rows.length; i++) {
            // index: 1-based, +1 más por el header del Excel (queda consistente con #row legacy).
            await ctx.db.insert("excel_import_rows", {
                importId,
                index: baseIndex + i + 2,
                content: rows[i],
                status: "pending",
                attempts: 0,
            });
        }
        return rows.length;
    },
});

// ── Pública: finaliza el seeding y arranca el procesamiento ─────────────────

export const finalizeImport = mutation({
    args: { importId: v.id("excel_imports") },
    handler: async (ctx, { importId }) => {
        const job = await ctx.db.get(importId);
        if (!job) throw new Error("Importación no encontrada");
        await requireClientAccess(ctx, job.client);
        if (job.status === "cancelled") return;

        await ctx.db.patch(importId, { seeding: false });
        const scheduledId = await ctx.scheduler.runAfter(0, internal.excelImports._process, {
            importId,
        });
        await ctx.db.patch(importId, { scheduledId });
    },
});

// ── Pública: cancela una importación en curso ─────────────────────────────────

export const cancel = mutation({
    args: { importId: v.id("excel_imports") },
    handler: async (ctx, { importId }) => {
        const job = await ctx.db.get(importId);
        if (!job) throw new Error("Importación no encontrada");
        await requireClientAccess(ctx, job.client);
        if (job.status !== "pending" && job.status !== "processing") return;

        if (job.scheduledId) {
            try { await ctx.scheduler.cancel(job.scheduledId); } catch { /* ya ejecutando */ }
        }
        await ctx.db.patch(importId, { status: "cancelled" });
    },
});

// ── Pública: retorna la importación más reciente de una KB ────────────────────

export const getByKnowledgeBase = query({
    args: { knowledgeBaseId: v.id("knowledge_bases") },
    handler: async (ctx, { knowledgeBaseId }) => {
        const kb = await ctx.db.get(knowledgeBaseId);
        if (!kb) return null;
        await requireClientAccess(ctx, kb.client);
        return await ctx.db
            .query("excel_imports")
            .withIndex("by_knowledge_base", q => q.eq("knowledgeBase", knowledgeBaseId))
            .order("desc")
            .first();
    },
});

// ── Pública: filas falladas paginadas (para el listado en UI) ─────────────────

export const getFailedRows = query({
    args: {
        importId: v.id("excel_imports"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { importId, paginationOpts }) => {
        const job = await ctx.db.get(importId);
        if (!job) throw new Error("Importación no encontrada");
        await requireClientAccess(ctx, job.client);

        return await ctx.db
            .query("excel_import_rows")
            .withIndex("by_import_and_status", q =>
                q.eq("importId", importId).eq("status", "failed")
            )
            .paginate({
                ...paginationOpts,
                numItems: Math.min(paginationOpts.numItems, 50),
            });
    },
});

// ── Internas: progreso, status liviano, lookup de job ────────────────────────

export const _updateProgress = internalMutation({
    args: {
        importId: v.id("excel_imports"),
        processed: v.optional(v.number()),
        ok: v.optional(v.number()),
        fail: v.optional(v.number()),
        updated: v.optional(v.number()),
        skipped: v.optional(v.number()),
        status: v.optional(v.union(
            v.literal("processing"),
            v.literal("cancelled"),
            v.literal("completed"),
            v.literal("failed"),
        )),
        cancelReason: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.importId);
        if (!job || job.status === "cancelled") return;
        const { importId, status, ...rest } = args;
        await ctx.db.patch(importId, {
            ...rest,
            ...(status ? { status } : {}),
            ...(status === "processing" && !job.startedAt ? { startedAt: Date.now() } : {}),
        });
    },
});

export const _updateScheduledId = internalMutation({
    args: { importId: v.id("excel_imports"), scheduledId: v.id("_scheduled_functions") },
    handler: async (ctx, { importId, scheduledId }) => {
        const job = await ctx.db.get(importId);
        if (!job || job.status === "cancelled") return;
        await ctx.db.patch(importId, { scheduledId });
    },
});

export const _getJob = internalQuery({
    args: { importId: v.id("excel_imports") },
    handler: async (ctx, { importId }) => ctx.db.get(importId),
});

/** Versión ligera de `_getJob` para chequear cancelación sin releer todo el doc. */
export const _getJobStatus = internalQuery({
    args: { importId: v.id("excel_imports") },
    handler: async (ctx, { importId }) => {
        const job = await ctx.db.get(importId);
        return job ? { status: job.status, seeding: job.seeding ?? false } : null;
    },
});

// ── Internas: manipular rows ─────────────────────────────────────────────────

export const _takePendingRows = internalQuery({
    args: { importId: v.id("excel_imports"), limit: v.number() },
    handler: async (ctx, { importId, limit }) => {
        return await ctx.db
            .query("excel_import_rows")
            .withIndex("by_import_and_status", q =>
                q.eq("importId", importId).eq("status", "pending")
            )
            .take(limit);
    },
});

export const _takeFailedRowsForRetry = internalQuery({
    args: { importId: v.id("excel_imports"), limit: v.number() },
    handler: async (ctx, { importId, limit }) => {
        const rows = await ctx.db
            .query("excel_import_rows")
            .withIndex("by_import_and_status", q =>
                q.eq("importId", importId).eq("status", "failed")
            )
            .take(limit);
        return rows.filter(r => r.attempts < MAX_RETRY_PASSES + 1);
    },
});

export const _markRowDone = internalMutation({
    args: {
        rowId: v.id("excel_import_rows"),
        status: v.union(
            v.literal("done"),
            v.literal("skipped"),
            v.literal("failed"),
        ),
        lastError: v.optional(v.string()),
    },
    handler: async (ctx, { rowId, status, lastError }) => {
        const row = await ctx.db.get(rowId);
        if (!row) return;
        await ctx.db.patch(rowId, {
            status,
            attempts: row.attempts + 1,
            ...(lastError !== undefined ? { lastError } : {}),
        });
    },
});

export const _resetRowsToPending = internalMutation({
    args: { rowIds: v.array(v.id("excel_import_rows")) },
    handler: async (ctx, { rowIds }) => {
        for (const id of rowIds) await ctx.db.patch(id, { status: "pending" });
    },
});

// ── Interna: paginated count de rows por status para finalizar/retry ─────────

export const _countRowsByStatus = internalQuery({
    args: {
        importId: v.id("excel_imports"),
        status: v.union(
            v.literal("pending"),
            v.literal("done"),
            v.literal("skipped"),
            v.literal("failed"),
        ),
    },
    handler: async (ctx, { importId, status }) => {
        // Pagina hasta encontrar el primero o agotar (cheap si hay 0).
        let count = 0;
        let cursor: string | null = null;
        let done = false;
        while (!done) {
            const page = await ctx.db
                .query("excel_import_rows")
                .withIndex("by_import_and_status", q =>
                    q.eq("importId", importId).eq("status", status)
                )
                .paginate({ cursor, numItems: 500 });
            count += page.page.length;
            done = page.isDone;
            cursor = page.continueCursor;
        }
        return count;
    },
});

// ── Interna: procesa pending rows en background ──────────────────────────────

export const _process = internalAction({
    args: { importId: v.id("excel_imports") },
    handler: async (ctx, { importId }) => {
        const job = await ctx.runQuery(internal.excelImports._getJob, { importId });
        if (!job || job.status === "cancelled") return;
        if (job.seeding) return; // seguridad — finalizeImport debería haberlo apagado

        // Marca como "processing" la primera vez.
        if (job.status === "pending") {
            await ctx.runMutation(internal.excelImports._updateProgress, {
                importId, status: "processing",
            });
        }

        const keyColumn = job.keyColumn ?? null;
        const shouldUpdate = keyColumn !== null && job.duplicateBehavior === "update";

        const balance = await ctx.runQuery(internal.clients.getTokenBalanceInternal, { clientId: job.client });
        if (balance <= 0) {
            await ctx.runMutation(internal.excelImports._updateProgress, {
                importId,
                status: "cancelled",
                cancelReason: "no_tokens",
            });
            return;
        }

        // Pre-cargar existingMap si corresponde (paginado, ya safe).
        const existingMap = new Map<string, Id<"knowledge_chunks">>();
        if (shouldUpdate && keyColumn) {
            let cursor: string | null = null;
            let mapDone = false;
            while (!mapDone) {
                const page: {
                    isDone: boolean;
                    continueCursor: string;
                    page: Array<{ _id: Id<"knowledge_chunks">; excelId: string | null }>;
                } = await ctx.runQuery(
                    internal.knowledgeChunks.getExcelIdsByKnowledgeBaseInternal,
                    { knowledgeBaseId: job.knowledgeBase, cursor, numItems: 200 }
                );
                for (const c of page.page) {
                    if (c.excelId != null && c.excelId.trim() !== "") {
                        existingMap.set(c.excelId, c._id);
                    }
                }
                mapDone = page.isDone;
                cursor = page.continueCursor;
            }
        }

        const invocationLimit = keyColumn ? SEQUENTIAL_INVOCATION_ROWS : PARALLEL_INVOCATION_ROWS;
        const pending = await ctx.runQuery(internal.excelImports._takePendingRows, {
            importId,
            limit: invocationLimit,
        });

        if (pending.length === 0) {
            // No queda nada pendiente: o finalizamos o disparamos retry.
            const failed = await ctx.runQuery(internal.excelImports._countRowsByStatus, {
                importId, status: "failed",
            });
            if (failed > 0) {
                const scheduledId = await ctx.scheduler.runAfter(0, internal.excelImports._retry, {
                    importId, pass: 1,
                });
                await ctx.runMutation(internal.excelImports._updateScheduledId, { importId, scheduledId });
            } else {
                await ctx.runMutation(internal.excelImports._updateProgress, {
                    importId, status: "completed",
                });
            }
            return;
        }

        let okDelta = 0, failDelta = 0, updatedDelta = 0, skippedDelta = 0;

        if (!keyColumn) {
            // Sin columna clave: paralelo en batches.
            for (let i = 0; i < pending.length; i += PARALLEL_BATCH_SIZE) {
                const statusCheck = await ctx.runQuery(internal.excelImports._getJobStatus, { importId });
                if (!statusCheck || statusCheck.status === "cancelled") return;

                const batch = pending.slice(i, i + PARALLEL_BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map(row =>
                        ctx.runAction(internal.ai.generateAndStoreEmbeddingInternal, {
                            knowledgeBaseId: job.knowledgeBase,
                            content: row.content,
                            clientId: job.client,
                            metadata: { source: "excel_import", row: row.index },
                        })
                    )
                );
                for (let bi = 0; bi < results.length; bi++) {
                    const r = results[bi];
                    const row = batch[bi];
                    if (r.status === "fulfilled") {
                        if (r.value?.status === "skipped") {
                            await ctx.runMutation(internal.excelImports._markRowDone, {
                                rowId: row._id, status: "skipped",
                            });
                            skippedDelta++;
                        } else {
                            await ctx.runMutation(internal.excelImports._markRowDone, {
                                rowId: row._id, status: "done",
                            });
                            okDelta++;
                        }
                    } else {
                        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
                        await ctx.runMutation(internal.excelImports._markRowDone, {
                            rowId: row._id, status: "failed", lastError: message,
                        });
                        failDelta++;
                    }
                }
            }
        } else {
            // Con columna clave: secuencial.
            for (const row of pending) {
                const statusCheck = await ctx.runQuery(internal.excelImports._getJobStatus, { importId });
                if (!statusCheck || statusCheck.status === "cancelled") return;

                const metadata: Record<string, unknown> = { source: "excel_import", row: row.index };
                try {
                    const keyValue = extractKeyValue(row.content, keyColumn);
                    const existingId = keyValue ? existingMap.get(keyValue) : undefined;

                    if (existingId) {
                        if (keyValue) metadata.excelId = keyValue;
                        const result = await ctx.runAction(internal.ai.updateAndStoreEmbeddingInternal, {
                            chunkId: existingId, content: row.content, metadata, clientId: job.client,
                        });
                        if (result.status === "skipped") {
                            await ctx.runMutation(internal.excelImports._markRowDone, {
                                rowId: row._id, status: "skipped",
                            });
                            skippedDelta++;
                        } else {
                            await ctx.runMutation(internal.excelImports._markRowDone, {
                                rowId: row._id, status: "done",
                            });
                            updatedDelta++;
                        }
                    } else {
                        if (keyValue) metadata.excelId = keyValue;
                        const result = await ctx.runAction(internal.ai.generateAndStoreEmbeddingInternal, {
                            knowledgeBaseId: job.knowledgeBase, content: row.content, metadata, clientId: job.client,
                        });
                        if (result.status === "skipped") {
                            await ctx.runMutation(internal.excelImports._markRowDone, {
                                rowId: row._id, status: "skipped",
                            });
                            skippedDelta++;
                        } else {
                            await ctx.runMutation(internal.excelImports._markRowDone, {
                                rowId: row._id, status: "done",
                            });
                            okDelta++;
                            if (keyValue) existingMap.set(keyValue, "new" as Id<"knowledge_chunks">);
                        }
                    }
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    await ctx.runMutation(internal.excelImports._markRowDone, {
                        rowId: row._id, status: "failed", lastError: message,
                    });
                    failDelta++;
                }
            }
        }

        // Actualizar counters del job parent y avanzar.
        await ctx.runMutation(internal.excelImports._updateProgress, {
            importId,
            processed: job.processed + pending.length,
            ok: job.ok + okDelta,
            fail: job.fail + failDelta,
            updated: (job.updated ?? 0) + updatedDelta,
            skipped: (job.skipped ?? 0) + skippedDelta,
        });

        // Encolar la siguiente tanda.
        const scheduledId = await ctx.scheduler.runAfter(0, internal.excelImports._process, { importId });
        await ctx.runMutation(internal.excelImports._updateScheduledId, { importId, scheduledId });
    },
});

// ── Interna: reintenta filas falladas (hasta MAX_RETRY_PASSES) ───────────────

export const _retry = internalAction({
    args: { importId: v.id("excel_imports"), pass: v.number() },
    handler: async (ctx, { importId, pass }) => {
        const job = await ctx.runQuery(internal.excelImports._getJob, { importId });
        if (!job || job.status === "cancelled") return;

        const balance = await ctx.runQuery(internal.clients.getTokenBalanceInternal, { clientId: job.client });
        if (balance <= 0) {
            await ctx.runMutation(internal.excelImports._updateProgress, {
                importId, status: "completed",
            });
            return;
        }

        // Tomar un lote de filas falladas que todavía pueden reintentarse.
        const toRetry = await ctx.runQuery(internal.excelImports._takeFailedRowsForRetry, {
            importId, limit: 200,
        });

        if (toRetry.length === 0 || pass > MAX_RETRY_PASSES) {
            // Listo: completar (las que quedaron failed se ven en getFailedRows).
            await ctx.runMutation(internal.excelImports._updateProgress, {
                importId, status: "completed",
            });
            return;
        }

        // Reset a pending y volver al loop de _process.
        await ctx.runMutation(internal.excelImports._resetRowsToPending, {
            rowIds: toRetry.map(r => r._id),
        });

        const scheduledId = await ctx.scheduler.runAfter(0, internal.excelImports._process, { importId });
        await ctx.runMutation(internal.excelImports._updateScheduledId, { importId, scheduledId });

        // Encolar siguiente pass por si quedan más failed que no entraron en este lote.
        if (toRetry.length === 200) {
            await ctx.scheduler.runAfter(5000, internal.excelImports._retry, { importId, pass });
        }
    },
});
