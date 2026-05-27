import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ImpersonationSessionSchema = defineTable({
    adminProfileId: v.id("profiles"),
    targetProfileId: v.id("profiles"),
    startedAt: v.number(),
    expiresAt: v.number(),
    endedAt: v.optional(v.number()),
})
    .index("by_admin", ["adminProfileId"])
    .index("by_target", ["targetProfileId"]);
