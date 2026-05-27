import { defineTable } from "convex/server";
import { v } from "convex/values";

export const KnowledgeBaseSchema = defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    client: v.id("clients")
})
.index("by_name", ["name"])
.index("by_client", ["client"]);