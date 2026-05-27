import { defineTable } from "convex/server";
import { v } from "convex/values";

export const TokenUsageLogSchema = defineTable({
    clientId: v.id("clients"),
    channelId: v.optional(v.id("channels")),
    source: v.union(v.literal("whatsapp"), v.literal("web"), v.literal("excel_import")),
    tokensUsed: v.number(),
    phone: v.optional(v.string()),
    sessionId: v.optional(v.string()),
})
.index("by_client", ["clientId"])
.index("by_source", ["source"]);
