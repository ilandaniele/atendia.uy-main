import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Rows individuales de un import de Excel. Vivían como `pendingRows`/`failedRows`
 * dentro del doc `excel_imports`, lo que excedía el límite de 1 MB por documento
 * para Excels grandes. Ahora cada fila es su propio row, con su status y attempts.
 */
export const ExcelImportRowSchema = defineTable({
    importId: v.id("excel_imports"),
    // # de fila en el Excel original (1-based, +1 si la planilla tenía header).
    index: v.number(),
    content: v.string(),
    status: v.union(
        v.literal("pending"),
        v.literal("done"),
        v.literal("skipped"),
        v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
})
    .index("by_import_and_status", ["importId", "status"])
    .index("by_import", ["importId"]);
