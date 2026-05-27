import { defineTable } from "convex/server";
import { v } from "convex/values";

export const LinkedDriveFileSchema = defineTable({
    client: v.id("clients"),
    linkedByProfile: v.id("profiles"),
    knowledgeBase: v.id("knowledge_bases"),

    driveFileId: v.string(),
    driveFileName: v.string(),
    driveMimeType: v.string(),
    driveWebViewLink: v.optional(v.string()),

    fileKind: v.union(
        v.literal("excel"),
        v.literal("gsheet"),
        v.literal("gdoc"),
        v.literal("pdf"),
    ),

    isActive: v.boolean(),

    lastSyncedModifiedTime: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    lastCheckedAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    syncCount: v.number(),

    excelImportId: v.optional(v.id("excel_imports")),
})
    .index("by_client", ["client"])
    .index("by_client_and_active", ["client", "isActive"])
    .index("by_drive_file_id", ["driveFileId"])
    .index("by_profile", ["linkedByProfile"]);
