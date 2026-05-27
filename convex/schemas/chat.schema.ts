import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ChatSchema = defineTable({
    channelId: v.id("channels"),
    phone: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system"),
        v.literal("event")
    ),
    content: v.string(),
    messageId: v.string(),
    media: v.optional(v.object({
        type: v.literal("voice"),
        mediaId: v.string(),
        mimeType: v.optional(v.string()),
        seconds: v.optional(v.number()),
    })),
})
.index("by_channel_and_session", ["channelId", "sessionId"])
.index("by_channel_and_phone", ["channelId", "phone"])
.index("by_phone", ["phone"])
.index("by_message_id", ["messageId"]);