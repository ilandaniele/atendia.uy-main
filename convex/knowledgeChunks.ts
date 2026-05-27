import { mutation, query, internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateContentHash } from "./knowledgeChunksHelpers";

// ── Helpers internos para sincronizar `knowledge_embeddings` ─────────────────

/**
 * Upsert del embedding del chunk en la tabla dedicada `knowledge_embeddings`.
 * Guarda `knowledgeBase` denormalizado para que el `vectorIndex` pueda filtrar
 * por KB sin tener que hacer un join previo.
 */
async function syncChunkEmbedding(
    ctx: MutationCtx,
    chunkId: Id<"knowledge_chunks">,
    knowledgeBase: Id<"knowledge_bases">,
    embedding: number[],
): Promise<void> {
    const existing = await ctx.db
        .query("knowledge_embeddings")
        .withIndex("by_chunk", (q) => q.eq("chunkId", chunkId))
        .first();
    if (existing) {
        await ctx.db.patch(existing._id, { embedding, knowledgeBase });
    } else {
        await ctx.db.insert("knowledge_embeddings", { chunkId, knowledgeBase, embedding });
    }
}

/** Borra el row de `knowledge_embeddings` asociado a un chunk (no-op si no existe). */
async function removeChunkEmbedding(
    ctx: MutationCtx,
    chunkId: Id<"knowledge_chunks">,
): Promise<void> {
    const existing = await ctx.db
        .query("knowledge_embeddings")
        .withIndex("by_chunk", (q) => q.eq("chunkId", chunkId))
        .first();
    if (existing) await ctx.db.delete(existing._id);
}

// ── Consultas ─────────────────────────────────────────────────────────────────

/** Solo admin: lista los primeros 100 fragmentos para inspección. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        return await ctx.db.query("knowledge_chunks").take(100);
    }
});

/** Miembro del cliente o admin: retorna un fragmento por ID. */
export const get = query({
    args: { id: v.id("knowledge_chunks") },
    handler: async (ctx, { id }) => {
        const chunk = await ctx.db.get(id);
        if (!chunk) return null;
        const kb = await ctx.db.get(chunk.knowledgeBase);
        if (!kb) return null;
        await requireClientAccess(ctx, kb.client);
        return chunk;
    }
});

const MAX_PAGE_SIZE = 50;

/**
 * Miembro del cliente o admin: retorna fragmentos de una KB paginados (sin embedding).
 *
 * Clampeo `numItems` server-side para no acercarnos al límite de 16 MB
 * de bytes leídos: chunks legacy aún cargan embedding (~12 KB) hasta que
 * la migración + cleanup futuro lo elimine.
 */
export const getByKnowledgeBasePaginated = query({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { knowledgeBaseId, paginationOpts }) => {
        const kb = await ctx.db.get(knowledgeBaseId);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);
        const safeOpts = {
            ...paginationOpts,
            numItems: Math.min(paginationOpts.numItems, MAX_PAGE_SIZE),
        };
        const result = await ctx.db
            .query("knowledge_chunks")
            .withIndex("by_knowledge_base", (q) => q.eq("knowledgeBase", knowledgeBaseId))
            .paginate(safeOpts);
        return result;
    }
});

/** Miembro del cliente o admin: busca fragmentos por texto en una KB (máx 100). */
export const searchByKnowledgeBase = query({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        search: v.string(),
    },
    handler: async (ctx, { knowledgeBaseId, search }) => {
        const kb = await ctx.db.get(knowledgeBaseId);
        if (!kb) return [];
        await requireClientAccess(ctx, kb.client);
        return await ctx.db
            .query("knowledge_chunks")
            .withSearchIndex("search_content", (q) =>
                q.search("content", search).eq("knowledgeBase", knowledgeBaseId)
            )
            .take(100);
    }
});

// ── Queries internas ─────────────────────────────────────────────────────────

/** INTERNA: retorna un chunk por ID sin verificación de auth. */
export const getInternal = internalQuery({
    args: { id: v.id("knowledge_chunks") },
    handler: async (ctx, { id }) => ctx.db.get(id),
});

/** INTERNA: chequea si un chunk con este hash ya existe en la KB (índice O(1)). */
export const getByHashInternal = internalQuery({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        contentHash: v.string(),
    },
    handler: async (ctx, { knowledgeBaseId, contentHash }) => {
        return await ctx.db
            .query("knowledge_chunks")
            .withIndex("by_kb_and_hash", (q) =>
                q.eq("knowledgeBase", knowledgeBaseId).eq("contentHash", contentHash)
            )
            .first();
    }
});

/**
 * INTERNA: mapea IDs de rows de `knowledge_embeddings` a su `chunkId`,
 * preservando el orden. Se usa tras `ctx.vectorSearch` (que sólo retorna
 * `{_id, _score}` del row de embeddings) para resolver el chunk.
 */
export const getChunkIdsForEmbeddings = internalQuery({
    args: { ids: v.array(v.id("knowledge_embeddings")) },
    handler: async (ctx, { ids }) => {
        const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
        return rows.map((r) => r?.chunkId ?? null);
    }
});

/**
 * INTERNA: pagina pares {_id, excelId} para construir el mapa de duplicados
 * por keyColumn en imports de Excel. Mantiene `numItems` bajo porque los
 * rows legacy aún incluyen el embedding completo.
 */
export const getExcelIdsByKnowledgeBaseInternal = internalQuery({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        cursor: v.union(v.string(), v.null()),
        numItems: v.number(),
    },
    handler: async (ctx, { knowledgeBaseId, cursor, numItems }) => {
        const result = await ctx.db
            .query("knowledge_chunks")
            .withIndex("by_knowledge_base", (q) => q.eq("knowledgeBase", knowledgeBaseId))
            .paginate({ cursor, numItems });
        return {
            isDone: result.isDone,
            continueCursor: result.continueCursor,
            page: result.page.map((c) => ({
                _id: c._id,
                excelId: c.metadata?.excelId != null ? String(c.metadata.excelId) : null,
            })),
        };
    }
});

// ── Mutaciones ────────────────────────────────────────────────────────────────

/** INTERNA: actualiza contenido + embedding de un chunk sin auth. */
export const updateInternal = internalMutation({
    args: {
        id: v.id("knowledge_chunks"),
        content: v.string(),
        metadata: v.any(),
        embedding: v.array(v.float64()),
    },
    handler: async (ctx, { id, content, metadata, embedding }) => {
        const chunk = await ctx.db.get(id);
        if (!chunk) throw new Error("Fragmento no encontrado");
        const contentHash = await generateContentHash(content);
        // El embedding NO se guarda en `knowledge_chunks` — vive en la tabla dedicada.
        await ctx.db.patch(id, { content, metadata, contentHash });
        await syncChunkEmbedding(ctx, id, chunk.knowledgeBase, embedding);
        return id;
    },
});

/** INTERNA: crea un fragmento sin auth (para importaciones background). */
export const createInternal = internalMutation({
    args: {
        knowledgeBase: v.id("knowledge_bases"),
        content: v.string(),
        metadata: v.any(),
        embedding: v.array(v.float64()),
    },
    handler: async (ctx, { knowledgeBase, content, metadata, embedding }) => {
        const contentHash = await generateContentHash(content);
        const chunkId = await ctx.db.insert("knowledge_chunks", {
            knowledgeBase,
            content,
            metadata,
            contentHash,
        });
        await syncChunkEmbedding(ctx, chunkId, knowledgeBase, embedding);
        return chunkId;
    },
});

/** Miembro del cliente o admin: crea un fragmento de KB. */
export const create = mutation({
    args: {
        knowledgeBase: v.id("knowledge_bases"),
        content: v.string(),
        metadata: v.any(),
        embedding: v.array(v.float64()),
    },
    handler: async (ctx, { knowledgeBase, content, metadata, embedding }) => {
        const kb = await ctx.db.get(knowledgeBase);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);

        const contentHash = await generateContentHash(content);
        const chunkId = await ctx.db.insert("knowledge_chunks", {
            knowledgeBase,
            content,
            metadata,
            contentHash,
        });
        await syncChunkEmbedding(ctx, chunkId, knowledgeBase, embedding);
        return chunkId;
    }
});

/** Miembro del cliente o admin: actualiza un fragmento. */
export const update = mutation({
    args: {
        id: v.id("knowledge_chunks"),
        knowledgeBase: v.optional(v.id("knowledge_bases")),
        content: v.optional(v.string()),
        metadata: v.optional(v.any()),
        embedding: v.optional(v.array(v.float64())),
    },
    handler: async (ctx, args) => {
        const chunk = await ctx.db.get(args.id);
        if (!chunk) throw new Error("Fragmento no encontrado");
        const kb = await ctx.db.get(chunk.knowledgeBase);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);

        const { id, embedding, ...chunkUpdateData } = args;

        if (chunkUpdateData.content !== undefined) {
            (chunkUpdateData as Record<string, unknown>).contentHash =
                await generateContentHash(chunkUpdateData.content);
        }

        await ctx.db.patch(id, chunkUpdateData);

        const finalKb = chunkUpdateData.knowledgeBase ?? chunk.knowledgeBase;
        if (embedding !== undefined) {
            await syncChunkEmbedding(ctx, id, finalKb, embedding);
        } else if (
            chunkUpdateData.knowledgeBase !== undefined &&
            chunkUpdateData.knowledgeBase !== chunk.knowledgeBase
        ) {
            // Cambió la KB sin cambiar el embedding: actualizar el denormalizado.
            const existingEmb = await ctx.db
                .query("knowledge_embeddings")
                .withIndex("by_chunk", (q) => q.eq("chunkId", id))
                .first();
            if (existingEmb) await ctx.db.patch(existingEmb._id, { knowledgeBase: finalKb });
        }
        return id;
    }
});

/**
 * One-shot cleanup: borra chunks huérfanos sin embedding (residuos de un pipeline viejo
 * basado en contentHash). Ejecutar con `npx convex run knowledgeChunks:cleanupOrphanChunks`.
 */
export const cleanupOrphanChunks = internalMutation({
    args: {},
    handler: async (ctx) => {
        const chunks = await ctx.db.query("knowledge_chunks").collect();
        let deletedNoEmbedding = 0;
        let deletedContentHash = 0;
        for (const chunk of chunks) {
            const c = chunk as { embedding?: number[]; contentHash?: string };
            const noEmbedding = !c.embedding || c.embedding.length === 0;
            const hasContentHash = c.contentHash != null;
            if (noEmbedding) {
                await ctx.db.delete(chunk._id);
                deletedNoEmbedding++;
            } else if (hasContentHash) {
                await ctx.db.delete(chunk._id);
                deletedContentHash++;
            }
        }
        return {
            scanned: chunks.length,
            deletedNoEmbedding,
            deletedContentHash,
        };
    },
});

/** Miembro del cliente o admin: elimina un fragmento. */
export const remove = mutation({
    args: { id: v.id("knowledge_chunks") },
    handler: async (ctx, { id }) => {
        const chunk = await ctx.db.get(id);
        if (!chunk) throw new Error("Fragmento no encontrado");
        const kb = await ctx.db.get(chunk.knowledgeBase);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);
        await removeChunkEmbedding(ctx, id);
        await ctx.db.delete(id);
        return id;
    }
});

// ── Migración: backfill de contentHash ────────────────────────────────────────

const BACKFILL_BATCH_SIZE = 100;

/**
 * INTERNA (sin auth → consola de Convex): dispara el backfill de `contentHash`
 * en chunks legacy. Idempotente (los chunks que ya tienen hash se saltan).
 */
export const backfillContentHashes = internalMutation({
    args: {},
    handler: async (ctx) => {
        await ctx.scheduler.runAfter(0, internal.knowledgeChunks.backfillContentHashesBatch, {
            cursor: null,
            processed: 0,
            updated: 0,
        });
        return { started: true };
    }
});

export const backfillContentHashesBatch = internalMutation({
    args: {
        cursor: v.union(v.string(), v.null()),
        processed: v.number(),
        updated: v.number(),
    },
    handler: async (ctx, { cursor, processed, updated }) => {
        const result = await ctx.db
            .query("knowledge_chunks")
            .paginate({ cursor, numItems: BACKFILL_BATCH_SIZE });

        let batchUpdated = 0;
        for (const chunk of result.page) {
            if (chunk.contentHash) continue;
            const contentHash = await generateContentHash(chunk.content);
            await ctx.db.patch(chunk._id, { contentHash });
            batchUpdated++;
        }

        const totalProcessed = processed + result.page.length;
        const totalUpdated = updated + batchUpdated;

        if (!result.isDone) {
            await ctx.scheduler.runAfter(0, internal.knowledgeChunks.backfillContentHashesBatch, {
                cursor: result.continueCursor,
                processed: totalProcessed,
                updated: totalUpdated,
            });
        }
        return { processed: totalProcessed, updated: totalUpdated, isDone: result.isDone };
    }
});

