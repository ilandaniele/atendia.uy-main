import { defineTable } from "convex/server";
import { v } from "convex/values";

export const TicketSchema = defineTable({
    clientId: v.id("clients"),
    profileId: v.id("profiles"),
    title: v.string(),
    description: v.string(),
    status: v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("closed")
    ),
    priority: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high")
    ),
    adminNote: v.optional(v.string()),
})
    .index("by_client", ["clientId"])
    .index("by_profile", ["profileId"])
    .index("by_status", ["status"]);
