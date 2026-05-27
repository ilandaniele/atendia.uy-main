import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los estados de conversación. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const states = await ctx.db.query("conversation_states").take(100);
        return states;
    }
});

/** Solo admin: retorna un estado por ID. */
export const get = query({
    args: {
        id: v.id("conversation_states")
    },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        return await ctx.db.get("conversation_states", id);
    }
});

/**
 * Semi-pública: busca estado de conversación por teléfono.
 * Usada por la acción handleInboundMessage — no expone datos sensibles directamente.
 */
export const getByPhone = query({
    args: {
        phone: v.string()
    },
    handler: async (ctx, { phone }) => {
        return await ctx.db
            .query("conversation_states")
            .withIndex("by_phone", (q) => q.eq("phone", phone))
            .first();
    }
});

/**
 * Semi-pública: busca estado de conversación por teléfono Y canal.
 * Usada por handleInboundMessage para no confundir estados entre distintos canales.
 */
export const getByPhoneAndChannel = query({
    args: {
        phone: v.string(),
        channelId: v.id("channels"),
    },
    handler: async (ctx, { phone, channelId }) => {
        return await ctx.db
            .query("conversation_states")
            .withIndex("by_phone_and_channel", (q) =>
                q.eq("phone", phone).eq("channel", channelId)
            )
            .first();
    }
});

/** Semi-pública: busca estado de conversación por sessionId del widget. */
export const getBySessionId = query({
    args: {
        sessionId: v.string()
    },
    handler: async (ctx, { sessionId }) => {
        return await ctx.db
            .query("conversation_states")
            .withIndex("by_session_id", (q) => q.eq("sessionId", sessionId))
            .first();
    }
});

/** Miembro del cliente o admin: retorna todos los estados de conversación del cliente. */
export const getByClient = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        const channels = await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();
        const results = await Promise.all(
            channels.map((ch) =>
                ctx.db
                    .query("conversation_states")
                    .withIndex("by_channel", (q) => q.eq("channel", ch._id))
                    .collect()
            )
        );
        return results.flat();
    }
});

/** Miembro del cliente o admin: retorna estados por canal. */
export const getByChannel = query({
    args: {
        channelId: v.id("channels")
    },
    handler: async (ctx, { channelId }) => {
        const channel = await ctx.db.get(channelId);
        if (!channel) return [];
        await requireClientAccess(ctx, channel.client);
        return await ctx.db
            .query("conversation_states")
            .withIndex("by_channel", (q) => q.eq("channel", channelId))
            .collect();
    }
});

/**
 * Solo admin: retorna los últimos N estados de conversación enriquecidos con
 * nombre de cuenta y canal. Usado para el panel de debug en vivo.
 */
export const listRecentAdmin = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { limit = 200 }) => {
        await requireAdmin(ctx);
        const states = await ctx.db.query("conversation_states").order("desc").take(limit);
        const enriched = await Promise.all(states.map(async (state) => {
            const channel = await ctx.db.get(state.channel);
            if (!channel) return { ...state, channelName: "—", channelType: "—", clientName: "—" };
            const client = await ctx.db.get(channel.client);
            return {
                ...state,
                channelName: channel.name,
                channelType: channel.type,
                clientName: client?.name ?? "—",
            };
        }));
        return enriched;
    }
});

// ── Queries Internas ─────────────────────────────────────────────────────────

/**
 * INTERNA: retorna estados de conversación por canal sin verificación de auth.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const getByChannelInternal = internalQuery({
    args: { channelId: v.id("channels") },
    handler: async (ctx, { channelId }) => {
        return await ctx.db
            .query("conversation_states")
            .withIndex("by_channel", (q) => q.eq("channel", channelId))
            .collect();
    }
});

// ── Mutaciones Públicas (estado de conversación) ─────────────────────────────

/** Miembro del cliente o admin: actualiza el estado de una conversación. */
export const update = mutation({
    args: {
        id: v.id("conversation_states"),
        phone: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal("ACTIVE"),
            v.literal("PAUSED"),
            v.literal("IGNORED"),
            v.literal("ARCHIVED")
        )),
        channel: v.optional(v.id("channels")),
        pendingIntent: v.optional(v.union(
            v.literal("order"),
            v.literal("appointment"),
            v.literal("lead")
        )),
        pendingData: v.optional(v.any()),
        assignedTo: v.optional(v.union(v.id("profiles"), v.null())),
    },
    handler: async (ctx, args) => {
        const state = await ctx.db.get("conversation_states", args.id);
        if (!state) throw new Error("Estado no encontrado");
        const channel = await ctx.db.get(state.channel);
        if (!channel) throw new Error("Canal no encontrado");
        await requireClientAccess(ctx, channel.client);
        const { id, assignedTo, ...rest } = args;
        const resolvedAssignedTo = assignedTo === null ? undefined : assignedTo;
        const patch = { ...rest, ...(assignedTo !== undefined ? { assignedTo: resolvedAssignedTo } : {}) };
        await ctx.db.patch("conversation_states", id, patch);

        // Sincronizar assignedTo con el lead correspondiente
        if (assignedTo !== undefined) {
            const identifier = state.phone ?? state.sessionId;
            if (identifier) {
                const matchingLead = await ctx.db.query("leads")
                    .withIndex("by_client", q => q.eq("client", channel.client))
                    .filter(q => q.and(
                        q.eq(q.field("phone"), identifier),
                        q.eq(q.field("channel"), state.channel)
                    ))
                    .first();
                if (matchingLead) {
                    await ctx.db.patch("leads", matchingLead._id, { assignedTo: resolvedAssignedTo });
                }
            }
        }

        return id;
    }
});

/** Miembro del cliente o admin: elimina un estado de conversación. */
export const remove = mutation({
    args: {
        id: v.id("conversation_states")
    },
    handler: async (ctx, { id }) => {
        const state = await ctx.db.get("conversation_states", id);
        if (!state) throw new Error("Estado no encontrado");
        const channel = await ctx.db.get(state.channel);
        if (!channel) throw new Error("Canal no encontrado");
        await requireClientAccess(ctx, channel.client);
        let chatsToDelete: { _id: import("./_generated/dataModel").Id<"chats"> }[] = [];
        if (state.phone) {
            chatsToDelete = await ctx.db
                .query("chats")
                .withIndex("by_channel_and_phone", q =>
                    q.eq("channelId", state.channel).eq("phone", state.phone!))
                .collect();
        } else if (state.sessionId) {
            chatsToDelete = await ctx.db
                .query("chats")
                .withIndex("by_channel_and_session", q =>
                    q.eq("channelId", state.channel).eq("sessionId", state.sessionId!))
                .collect();
        }
        for (const chat of chatsToDelete) {
            await ctx.db.delete("chats", chat._id);
        }
        await ctx.db.delete("conversation_states", id);
        return id;
    }
});

// ── Mutaciones Internas (solo llamables desde acciones de Convex) ─────────────

/**
 * INTERNA: crea un estado de conversación.
 * Solo llamable desde la acción handleInboundMessage (WhatsApp) o processWebMessage (IA).
 */
export const create = internalMutation({
    args: {
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        status: v.union(
            v.literal("ACTIVE"),
            v.literal("PAUSED"),
            v.literal("IGNORED"),
            v.literal("ARCHIVED")
        ),
        channel: v.id("channels")
    },
    handler: async (ctx, args) => {
        const stateId = await ctx.db.insert("conversation_states", args);
        return stateId;
    }
});

/**
 * INTERNA: actualiza un estado de conversación.
 * Solo llamable desde acciones internas.
 */
export const updateInternal = internalMutation({
    args: {
        id: v.id("conversation_states"),
        phone: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal("ACTIVE"),
            v.literal("PAUSED"),
            v.literal("IGNORED"),
            v.literal("ARCHIVED")
        )),
        channel: v.optional(v.id("channels")),
        pendingIntent: v.optional(v.union(
            v.literal("order"),
            v.literal("appointment"),
            v.literal("lead")
        )),
        pendingData: v.optional(v.any()),
        pendingUserMessage: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { id, ...updateData } = args;
        await ctx.db.patch("conversation_states", id, updateData);
        return id;
    }
});

/**
 * INTERNA: elimina un estado de conversación.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const removeInternal = internalMutation({
    args: {
        id: v.id("conversation_states")
    },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("conversation_states", id);
        return id;
    }
});

// ── Operaciones masivas (async via scheduler) ────────────────────────────────

const BULK_BATCH_SIZE = 50;

/**
 * INTERNA: actualiza el estado de un lote de conversaciones (máx BULK_BATCH_SIZE por ejecución).
 * Encadena el siguiente batch via scheduler si quedan más.
 */
export const _bulkUpdateStatusJob = internalMutation({
    args: {
        clientId: v.id("clients"),
        stateIds: v.array(v.id("conversation_states")),
        status: v.union(
            v.literal("ACTIVE"),
            v.literal("PAUSED"),
            v.literal("IGNORED"),
            v.literal("ARCHIVED")
        ),
    },
    handler: async (ctx, { clientId, stateIds, status }) => {
        const batch = stateIds.slice(0, BULK_BATCH_SIZE);
        const remaining = stateIds.slice(BULK_BATCH_SIZE);
        for (const id of batch) {
            const state = await ctx.db.get("conversation_states", id);
            if (!state) continue;
            const channel = await ctx.db.get(state.channel);
            if (!channel || channel.client !== clientId) continue;
            await ctx.db.patch("conversation_states", id, { status });
        }
        if (remaining.length > 0) {
            await ctx.scheduler.runAfter(0, internal.conversationStates._bulkUpdateStatusJob, { clientId, stateIds: remaining, status });
        }
    },
});

/**
 * INTERNA: elimina un lote de conversaciones y sus chats asociados (máx BULK_BATCH_SIZE por ejecución).
 * Usa índices para evitar full-table scans. Encadena el siguiente batch via scheduler.
 */
export const _bulkDeleteJob = internalMutation({
    args: {
        clientId: v.id("clients"),
        stateIds: v.array(v.id("conversation_states")),
    },
    handler: async (ctx, { clientId, stateIds }) => {
        const batch = stateIds.slice(0, BULK_BATCH_SIZE);
        const remaining = stateIds.slice(BULK_BATCH_SIZE);
        for (const id of batch) {
            const state = await ctx.db.get("conversation_states", id);
            if (!state) continue;
            const channel = await ctx.db.get(state.channel);
            if (!channel || channel.client !== clientId) continue;
            let chats: { _id: import("./_generated/dataModel").Id<"chats"> }[] = [];
            if (state.phone) {
                chats = await ctx.db
                    .query("chats")
                    .withIndex("by_channel_and_phone", q =>
                        q.eq("channelId", state.channel).eq("phone", state.phone!))
                    .collect();
            } else if (state.sessionId) {
                chats = await ctx.db
                    .query("chats")
                    .withIndex("by_channel_and_session", q =>
                        q.eq("channelId", state.channel).eq("sessionId", state.sessionId!))
                    .collect();
            } else {
                chats = [];
            }
            for (const chat of chats) {
                await ctx.db.delete("chats", chat._id);
            }
            await ctx.db.delete("conversation_states", id);
        }
        if (remaining.length > 0) {
            await ctx.scheduler.runAfter(0, internal.conversationStates._bulkDeleteJob, { clientId, stateIds: remaining });
        }
    },
});

/**
 * Miembro del cliente o admin: actualiza en bloque el estado de varias conversaciones.
 * Retorna inmediatamente — el trabajo real corre en background via scheduler.
 */
export const bulkUpdateStatus = mutation({
    args: {
        clientId: v.id("clients"),
        stateIds: v.array(v.id("conversation_states")),
        status: v.union(
            v.literal("ACTIVE"),
            v.literal("PAUSED"),
            v.literal("IGNORED"),
            v.literal("ARCHIVED")
        ),
    },
    handler: async (ctx, { clientId, stateIds, status }) => {
        await requireClientAccess(ctx, clientId);
        if (stateIds.length === 0) return 0;
        await ctx.scheduler.runAfter(0, internal.conversationStates._bulkUpdateStatusJob, { clientId, stateIds, status });
        return stateIds.length;
    },
});

/**
 * Miembro del cliente o admin: elimina en bloque varias conversaciones y sus chats.
 * Retorna inmediatamente — el trabajo real corre en background via scheduler.
 */
export const bulkDelete = mutation({
    args: {
        clientId: v.id("clients"),
        stateIds: v.array(v.id("conversation_states")),
    },
    handler: async (ctx, { clientId, stateIds }) => {
        await requireClientAccess(ctx, clientId);
        if (stateIds.length === 0) return 0;
        await ctx.scheduler.runAfter(0, internal.conversationStates._bulkDeleteJob, { clientId, stateIds });
        return stateIds.length;
    },
});
