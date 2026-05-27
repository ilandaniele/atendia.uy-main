import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireClientAccess, requireClientOwner } from "./authHelpers";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ─── Public queries ───────────────────────────────────────────────────────────

export const getStatus = query({
    args: {},
    handler: async (ctx) => {
        const { profile } = await requireAuth(ctx);
        return {
            connected: !!profile.googleDriveEnabled && !!profile.googleDriveRefreshToken,
            email: profile.googleDriveEmail ?? null,
            connectedAt: profile.googleDriveConnectedAt ?? null,
        };
    },
});

export const listForClient = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        const links = await ctx.db
            .query("linked_drive_files")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();

        const kbsById = new Map<string, string>();
        for (const link of links) {
            if (!kbsById.has(link.knowledgeBase)) {
                const kb = await ctx.db.get(link.knowledgeBase);
                if (kb) kbsById.set(link.knowledgeBase, kb.name);
            }
        }

        return links
            .sort((a, b) => b._creationTime - a._creationTime)
            .map((link) => ({
                ...link,
                knowledgeBaseName: kbsById.get(link.knowledgeBase) ?? "(eliminada)",
            }));
    },
});

// ─── Public mutations ─────────────────────────────────────────────────────────

export const saveDriveToken = mutation({
    args: {
        refreshToken: v.string(),
        email: v.optional(v.string()),
    },
    handler: async (ctx, { refreshToken, email }) => {
        const { profile } = await requireAuth(ctx);
        await ctx.db.patch(profile._id, {
            googleDriveRefreshToken: refreshToken,
            googleDriveEnabled: true,
            googleDriveEmail: email,
            googleDriveConnectedAt: Date.now(),
        });
        return profile._id;
    },
});

export const disconnectDrive = mutation({
    args: {},
    handler: async (ctx) => {
        const { profile } = await requireAuth(ctx);

        const links = await ctx.db
            .query("linked_drive_files")
            .withIndex("by_profile", (q) => q.eq("linkedByProfile", profile._id))
            .collect();
        for (const link of links) {
            if (link.isActive) {
                await ctx.db.patch(link._id, { isActive: false });
            }
        }

        await ctx.db.patch(profile._id, {
            googleDriveRefreshToken: undefined,
            googleDriveEnabled: false,
            googleDriveEmail: undefined,
            googleDriveConnectedAt: undefined,
        });
    },
});

export const unlinkFile = mutation({
    args: { linkId: v.id("linked_drive_files") },
    handler: async (ctx, { linkId }) => {
        const link = await ctx.db.get(linkId);
        if (!link) throw new Error("Vinculación no encontrada");
        await requireClientAccess(ctx, link.client);
        await ctx.db.patch(linkId, { isActive: false });
    },
});

export const manualSync = mutation({
    args: { linkId: v.id("linked_drive_files") },
    handler: async (ctx, { linkId }) => {
        const link = await ctx.db.get(linkId);
        if (!link) throw new Error("Vinculación no encontrada");
        await requireClientAccess(ctx, link.client);
        // Force re-sync by clearing lastCheckedAt (otherwise the 30s race-guard skips us).
        await ctx.db.patch(linkId, { lastCheckedAt: undefined });
        await ctx.scheduler.runAfter(0, internal.googleDrive.syncSingleFile, { linkId });
    },
});

export const updateSyncInterval = mutation({
    args: {
        clientId: v.id("clients"),
        intervalMinutes: v.union(
            v.literal(5),
            v.literal(15),
            v.literal(30),
            v.literal(60),
        ),
    },
    handler: async (ctx, { clientId, intervalMinutes }) => {
        await requireClientOwner(ctx, clientId);
        const client = await ctx.db.get(clientId);
        if (!client) throw new Error("Cliente no encontrado");
        await ctx.db.patch(clientId, {
            config: { ...client.config, driveSyncIntervalMinutes: intervalMinutes },
        });
    },
});

// ─── Internal queries ─────────────────────────────────────────────────────────

export const getProfileByIdInternal = internalQuery({
    args: { profileId: v.id("profiles") },
    handler: async (ctx, { profileId }) => {
        return await ctx.db.get(profileId);
    },
});

export const getLinkByIdInternal = internalQuery({
    args: { linkId: v.id("linked_drive_files") },
    handler: async (ctx, { linkId }) => {
        return await ctx.db.get(linkId);
    },
});

export const getActiveLinksByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("linked_drive_files")
            .withIndex("by_client_and_active", (q) => q.eq("client", clientId).eq("isActive", true))
            .collect();
    },
});

export const getClientsWithActiveLinksInternal = internalQuery({
    args: {},
    handler: async (ctx) => {
        const allActive = await ctx.db.query("linked_drive_files").collect();
        const clientIds = new Set<string>();
        for (const link of allActive) {
            if (link.isActive) clientIds.add(link.client);
        }
        const clients = await Promise.all(
            Array.from(clientIds).map((id) => ctx.db.get(id as Id<"clients">)),
        );
        return clients.filter((c): c is NonNullable<typeof c> => c !== null && c.isActive);
    },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

export const insertLinkInternal = internalMutation({
    args: {
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
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("linked_drive_files", {
            ...args,
            isActive: true,
            syncCount: 0,
        });
    },
});

export const markSyncedInternal = internalMutation({
    args: {
        linkId: v.id("linked_drive_files"),
        modifiedTime: v.string(),
        excelImportId: v.optional(v.id("excel_imports")),
    },
    handler: async (ctx, { linkId, modifiedTime, excelImportId }) => {
        const link = await ctx.db.get(linkId);
        if (!link) return;
        await ctx.db.patch(linkId, {
            lastSyncedAt: Date.now(),
            lastCheckedAt: Date.now(),
            lastSyncedModifiedTime: modifiedTime,
            lastSyncError: undefined,
            syncCount: link.syncCount + 1,
            excelImportId: excelImportId ?? link.excelImportId,
        });
    },
});

export const markCheckedInternal = internalMutation({
    args: { linkId: v.id("linked_drive_files") },
    handler: async (ctx, { linkId }) => {
        await ctx.db.patch(linkId, { lastCheckedAt: Date.now() });
    },
});

export const setSyncErrorInternal = internalMutation({
    args: { linkId: v.id("linked_drive_files"), error: v.string() },
    handler: async (ctx, { linkId, error }) => {
        await ctx.db.patch(linkId, {
            lastSyncError: error.slice(0, 500),
            lastCheckedAt: Date.now(),
        });
    },
});

export const updateClientDispatchInternal = internalMutation({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        const client = await ctx.db.get(clientId);
        if (!client) return;
        await ctx.db.patch(clientId, {
            config: { ...client.config, driveLastDispatchAt: Date.now() },
        });
    },
});

// ─── Knowledge chunks ingestion helper ────────────────────────────────────────

/**
 * Replace all chunks tagged with a specific driveFileId in a knowledge base.
 * Used when re-syncing a Doc or PDF: old chunks deleted, new ones inserted.
 */
export const replaceChunksForDriveFileInternal = internalMutation({
    args: {
        knowledgeBase: v.id("knowledge_bases"),
        driveFileId: v.string(),
        chunks: v.array(v.string()),
        sourceLabel: v.string(),
    },
    handler: async (ctx, { knowledgeBase, driveFileId, chunks, sourceLabel }) => {
        const existing = await ctx.db
            .query("knowledge_chunks")
            .withIndex("by_knowledge_base", (q) => q.eq("knowledgeBase", knowledgeBase))
            .collect();

        let deleted = 0;
        for (const chunk of existing) {
            const md = chunk.metadata as { driveFileId?: string } | undefined;
            if (md?.driveFileId === driveFileId) {
                const emb = await ctx.db
                    .query("knowledge_embeddings")
                    .withIndex("by_chunk", (q) => q.eq("chunkId", chunk._id))
                    .first();
                if (emb) await ctx.db.delete(emb._id);
                await ctx.db.delete(chunk._id);
                deleted++;
            }
        }

        let inserted = 0;
        for (const content of chunks) {
            const trimmed = content.trim();
            if (!trimmed) continue;
            await ctx.db.insert("knowledge_chunks", {
                knowledgeBase,
                content: trimmed,
                metadata: { source: sourceLabel, driveFileId },
            });
            inserted++;
        }

        return { deleted, inserted };
    },
});
