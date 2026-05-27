import { defineTable } from "convex/server";
import { v } from "convex/values";

export const KnowledgeEmbeddingSchema = defineTable({
    chunkId: v.id("knowledge_chunks"),
    embedding: v.array(v.float64()),
    knowledgeBase: v.optional(v.id("knowledge_bases")),
})
.index("by_chunk", ["chunkId"])
.vectorIndex("embedding_index", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["knowledgeBase"],
});