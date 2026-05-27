import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ProfileSchema = defineTable({
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
    role: v.union(
        v.literal("admin"),
        v.literal("user"),
    ),
    trialUsedAt: v.optional(v.number()),
    pictureUrl: v.optional(v.string()),
    status: v.optional(v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("suspended"),
    )),
    // Soft-delete: si está seteado, la cuenta se elimina permanentemente
    // pasados 90 días. Si el usuario vuelve a iniciar sesión antes, se reactiva.
    scheduledDeletionAt: v.optional(v.number()),
    googleCalendarRefreshToken: v.optional(v.string()),
    googleCalendarEnabled: v.optional(v.boolean()),
    googleCalendarEmail: v.optional(v.string()),
    googleCalendarName: v.optional(v.string()),
    googleCalendarPicture: v.optional(v.string()),
    googleCalendarChannelId: v.optional(v.string()),
    googleCalendarResourceId: v.optional(v.string()),
    googleCalendarChannelExpiry: v.optional(v.number()),

    googleDriveRefreshToken: v.optional(v.string()),
    googleDriveEnabled: v.optional(v.boolean()),
    googleDriveEmail: v.optional(v.string()),
    googleDriveConnectedAt: v.optional(v.number()),
})
.index("by_name", ["name"])
.index("by_email", ["email"])
.index("by_user_id", ["userId"]);