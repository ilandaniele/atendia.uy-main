import { defineTable } from "convex/server";
import { v } from "convex/values";

export const InviteSchema = defineTable({
    token: v.string(),
    client: v.id("clients"),
    inviteeEmail: v.optional(v.string()),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    usedBy: v.optional(v.id("profiles")),
})
.index("by_token", ["token"])
.index("by_client", ["client"]);
