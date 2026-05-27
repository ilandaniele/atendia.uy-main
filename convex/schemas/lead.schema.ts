import { defineTable } from "convex/server";
import { v } from "convex/values";

export const LeadSchema = defineTable({
    channel: v.id("channels"),
    client: v.id("clients"),
    type: v.string(),
    name: v.string(),
    phone: v.string(),
    status: v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("scheduled"),
        v.literal("closed"),
        v.literal("rejected"),
        v.literal("pending"),
        v.literal("confirmed")
    ),
    summary: v.string(),
    requiresAction: v.boolean(),
    data: v.record(v.string(), v.any()),
    assignedTo: v.optional(v.id("profiles")),
})
.index("by_client", ["client"])
.index("by_assigned_to", ["assignedTo"]);