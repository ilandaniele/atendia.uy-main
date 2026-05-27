import { defineTable } from "convex/server";
import { v } from "convex/values";

export const AssistantSchema = defineTable({
    client: v.id("clients"),
    name: v.string(),
    description: v.string(),
    knowledgeBases: v.optional(v.array(v.id("knowledge_bases"))),
    model: v.string(),
    features: v.optional(v.object({
        recognizeContacts: v.optional(v.boolean()),
    })),
})
.index("by_name", ["name"])
.index("by_client", ["client"]);