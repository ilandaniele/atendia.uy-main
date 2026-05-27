import { defineTable } from "convex/server";
import { v } from "convex/values";

export const PrivacySchema = defineTable({
    version: v.string(),
    title: v.string(),
    content: v.string(),
    isActive: v.boolean(),
    publishedAt: v.optional(v.number()),
})
    .index("by_version", ["version"])
    .index("by_active", ["isActive"]);
