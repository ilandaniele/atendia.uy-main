import { defineTable } from "convex/server";
import { v } from "convex/values";

export const FaqSchema = defineTable({
    question: v.string(),
    answerType: v.union(v.literal("content"), v.literal("youtube")),
    content: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
    keywords: v.array(v.string()),
    order: v.number(),
    isPublished: v.boolean(),
})
    .index("by_published", ["isPublished"])
    .index("by_order", ["order"]);
