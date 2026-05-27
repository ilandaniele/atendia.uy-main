import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ConversationStateSchema = defineTable({
    phone: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    status: v.union(
        v.literal("ACTIVE"),
        v.literal("PAUSED"),
        v.literal("IGNORED"),
        v.literal("ARCHIVED")
    ),
    channel: v.id("channels"),
    pendingIntent: v.optional(v.union(
        v.literal("order"),
        v.literal("appointment"),
        v.literal("lead"),
        v.literal("cancel_appointment"),
        v.literal("modify_appointment"),
        v.literal("cancel_order"),
    )),
    pendingData: v.optional(v.any()),
    pendingUserMessage: v.optional(v.boolean()),
    assignedTo: v.optional(v.id("profiles")),
})
.index("by_phone", ["phone"])
.index("by_phone_and_channel", ["phone", "channel"])
.index("by_session_id", ["sessionId"])
.index("by_channel", ["channel"])
.index("by_status", ["status"])
.index("by_assigned_to", ["assignedTo"]);