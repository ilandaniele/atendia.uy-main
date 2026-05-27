import { defineTable } from "convex/server";
import { v } from "convex/values";

export const KnowledgeChunkSchema = defineTable({
    knowledgeBase: v.id("knowledge_bases"),
    content: v.string(),
    metadata: v.any(),
    // LEGACY: residual de un pipeline anterior. Convex rechaza el push si existen
    // rows con el campo y el validator no lo incluye, así que lo dejamos opcional
    // hasta que una migración de cleanup vacíe el campo en todas las filas.
    embedding: v.optional(v.array(v.float64())),
    // SHA-256 del content (trim) para deduplicar chunks antes de gastar tokens Gemini.
    contentHash: v.optional(v.string()),
})
    .index("by_knowledge_base", ["knowledgeBase"])
    .index("by_kb_and_hash", ["knowledgeBase", "contentHash"])
    .searchIndex("search_content", {
        searchField: "content",
        filterFields: ["knowledgeBase"],
    });
