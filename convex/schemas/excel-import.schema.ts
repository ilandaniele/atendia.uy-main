import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ExcelImportSchema = defineTable({
    knowledgeBase: v.id("knowledge_bases"),
    client: v.id("clients"),
    status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
    ),
    total: v.number(),
    processed: v.number(),
    ok: v.number(),
    fail: v.number(),
    updated: v.optional(v.number()),
    // Filas omitidas por dedup (mismo hash de contenido ya existía en la KB).
    skipped: v.optional(v.number()),
    // True mientras la frontend está enviando lotes con `appendImportRows`.
    // `_process` no arranca hasta que `seeding === false` (lo setea `finalizeImport`).
    seeding: v.optional(v.boolean()),
    // ID de la scheduled function; permite cancelarla antes de que empiece a ejecutar
    scheduledId: v.optional(v.id("_scheduled_functions")),
    // Manejo de duplicados
    keyColumn: v.optional(v.string()),
    duplicateBehavior: v.optional(v.union(v.literal("add"), v.literal("update"))),
    // Timestamp (ms) de cuando la importación pasó a "processing"
    startedAt: v.optional(v.number()),
    // Razón de cancelación automática (ej: "no_tokens")
    cancelReason: v.optional(v.string()),

    // ── LEGACY (rollback temporal): rows pre-existentes pueden tener estos campos.
    // El código nuevo NO los escribe — las filas viven en `excel_import_rows`.
    // Se eliminarán en un PR de cleanup post-verificación en prod.
    pendingRows: v.optional(v.array(v.string())),
    failedRows: v.optional(v.array(v.object({
        content: v.string(),
        row: v.number(),
        attempts: v.number(),
    }))),
})
    .index("by_knowledge_base", ["knowledgeBase"])
    .index("by_client", ["client"]);
