import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess, requireClientOwner } from "./authHelpers";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los canales. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const channels = await ctx.db
            .query("channels")
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .take(100);
        return channels;
    }
});

/**
 * Semi-pública: retorna un canal por ID.
 * Usada por el webhook de WhatsApp (sin sesión) y por el widget.
 */
export const get = query({
    args: {
        id: v.id("channels")
    },
    handler: async (ctx, { id }) => {
        const channel = await ctx.db.get(id);
        if (!channel || channel.deletedAt) return null;
        return channel;
    }
});

/**
 * Miembro del cliente: retorna solo el token Whapi de un canal.
 * Usado por el endpoint /api/media para descargar audios on-demand.
 */
export const getWhapiTokenForAccess = query({
    args: { id: v.id("channels") },
    handler: async (ctx, { id }) => {
        const channel = await ctx.db.get(id);
        if (!channel || channel.deletedAt) return null;
        await requireClientAccess(ctx, channel.client);
        const token = (channel.config as { whapiToken?: string })?.whapiToken;
        if (!token) return null;
        return { whapiToken: token };
    }
});

/** Pública (interna en cleanup + usada por webhook): retorna todos los canales de un cliente incluyendo eliminados. */
export const getByClientAll = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId))
            .collect();
    }
});

/** Miembro del cliente o admin: retorna canales activos del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();
    }
});

/** Miembro del cliente o admin: retorna canales activos del cliente filtrados por tipo. */
export const getByClientAndType = query({
    args: {
        clientId: v.id("clients"),
        type: v.string()
    },
    handler: async (ctx, { clientId, type }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId).eq("type", type))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();
    }
});

/** Miembro del cliente o admin: retorna canales por asistente. */
export const getByAssistant = query({
    args: {
        assistantId: v.id("assistants")
    },
    handler: async (ctx, { assistantId }) => {
        const assistant = await ctx.db.get(assistantId);
        if (!assistant) return [];
        await requireClientAccess(ctx, assistant.client);
        return await ctx.db
            .query("channels")
            .withIndex("by_assistant", (q) => q.eq("assistant", assistantId))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();
    }
});

/**
 * Pública: busca canal por accessToken.
 * El accessToken ES la credencial del widget — sin él no se puede acceder al canal.
 */
export const getByAccessToken = query({
    args: { accessToken: v.string() },
    handler: (ctx, { accessToken }) => ctx.db
        .query("channels")
        .withIndex("by_access_token", (q) => q.eq("config.accessToken", accessToken))
        .first()
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: crea un nuevo canal. */
export const create = mutation({
    args: {
        client: v.id("clients"),
        type: v.string(),
        name: v.string(),
        externalId: v.string(),
        config: v.object({
            accessToken: v.optional(v.string()),
            allowedDomains: v.optional(v.array(v.string())),
            theme: v.optional(v.object({
                primaryColor: v.optional(v.string()),
                position: v.optional(v.string()),
            })),
            whapiToken: v.optional(v.string()),
            whapiChannelId: v.optional(v.string()),
            whapiApiUrl: v.optional(v.string()),
            testMode: v.optional(v.boolean()),
            testPhones: v.optional(v.array(v.string())),
        }),
        isActive: v.boolean(),
        assistant: v.id("assistants"),
        status: v.string()
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.client);
        const channelId = await ctx.db.insert("channels", args);
        return channelId;
    }
});

/** Miembro del cliente o admin: actualiza un canal existente. */
export const update = mutation({
    args: {
        id: v.id("channels"),
        client: v.optional(v.id("clients")),
        type: v.optional(v.string()),
        name: v.optional(v.string()),
        externalId: v.optional(v.string()),
        config: v.optional(v.object({
            accessToken: v.optional(v.string()),
            allowedDomains: v.optional(v.array(v.string())),
            theme: v.optional(v.object({
                primaryColor: v.optional(v.string()),
                position: v.optional(v.string()),
            })),
            whapiToken: v.optional(v.string()),
            whapiChannelId: v.optional(v.string()),
            whapiApiUrl: v.optional(v.string()),
            testMode: v.optional(v.boolean()),
            testPhones: v.optional(v.array(v.string())),
        })),
        isActive: v.optional(v.boolean()),
        assistant: v.optional(v.id("assistants")),
        status: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const channel = await ctx.db.get(args.id);
        if (!channel) throw new Error("Canal no encontrado");
        await requireClientAccess(ctx, channel.client);
        const { id, config, ...rest } = args;
        const patchData: Record<string, unknown> = { ...rest };
        if (config !== undefined) {
            patchData.config = { ...channel.config, ...config };
        }
        await ctx.db.patch("channels", id, patchData);
        return id;
    }
});

/**
 * INTERNA: retorna el canal de WhatsApp (con whapiChannelId) de un cliente.
 * Usado por billing y billingCrons para gestionar el modo del canal en Whapi.
 *
 * AVISO: en clientes con múltiples canales WhatsApp devuelve solo el primero.
 * No usar para enrutar mensajes/notificaciones del usuario final; en ese caso
 * resolver el canal a partir del registro origen (order.channel, lead.channel,
 * appointment.channel) o usar `getWhapiChannelsByClientInternal` de abajo.
 */
export const getWhapiChannelByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId).eq("type", "whatsapp"))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .first();
    },
});

/**
 * INTERNA: retorna TODOS los canales de WhatsApp activos de un cliente.
 * Útil para clientes con múltiples canales/asistentes — para iterar sobre todos
 * (billing, sincronización) sin perder canales secundarios.
 */
export const getWhapiChannelsByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId).eq("type", "whatsapp"))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();
    },
});

/** Solo admin: elimina permanentemente un canal. */
export const permanentDelete = mutation({
    args: {
        id: v.id("channels")
    },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        return ctx.db.delete("channels", id);
    }
});

/** Owner del cliente o admin: soft-delete de un canal. */
export const remove = mutation({
    args: {
        id: v.id("channels")
    },
    handler: async (ctx, { id }) => {
        const channel = await ctx.db.get(id);
        if (!channel) throw new Error("Canal no encontrado");
        await requireClientOwner(ctx, channel.client);
        const now = new Date();
        await ctx.db.patch("channels", id, { deletedAt: now.toLocaleString("es-UY") });
        return id;
    }
});
