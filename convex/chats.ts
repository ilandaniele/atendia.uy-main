import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los chats. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const chats = await ctx.db.query("chats").take(100);
        return chats;
    }
});

/** Solo admin: retorna un mensaje por ID. */
export const get = query({
    args: {
        id: v.id("chats")
    },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        return await ctx.db.get("chats", id);
    }
});

/** Solo admin: retorna chats por número de teléfono (visión global). */
export const getByPhone = query({
    args: {
        phone: v.string()
    },
    handler: async (ctx, { phone }) => {
        await requireAdmin(ctx);
        return await ctx.db
            .query("chats")
            .withIndex("by_phone", (q) => q.eq("phone", phone))
            .collect();
    }
});

/**
 * Pública: retorna historial de chat web por sessionId.
 * El sessionId es generado en el cliente y actúa como token de sesión.
 * La combinación channelId + sessionId es suficientemente específica.
 */
export const getWebChatHistory = query({
    args: {
        channelId: v.id("channels"),
        sessionId: v.string()
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("chats")
            .withIndex("by_channel_and_session", (q) =>
                q.eq("channelId", args.channelId).eq("sessionId", args.sessionId)
            )
            .collect();
    }
});

/** Miembro del cliente o admin: retorna todos los chats del cliente (todos sus canales). */
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
                    .query("chats")
                    .withIndex("by_channel_and_session", (q) => q.eq("channelId", ch._id))
                    .collect()
            )
        );
        return results.flat();
    }
});

/** Miembro del cliente o admin: retorna todos los chats de un canal. */
export const getByChannel = query({
    args: {
        channelId: v.id("channels")
    },
    handler: async (ctx, { channelId }) => {
        const channel = await ctx.db.get(channelId);
        if (!channel) return [];
        await requireClientAccess(ctx, channel.client);
        return await ctx.db
            .query("chats")
            .withIndex("by_channel_and_session", (q) => q.eq("channelId", channelId))
            .collect();
    }
});

/**
 * Semi-pública: busca un mensaje por messageId para deduplicación.
 * Usada desde el webhook de WhatsApp. No expone datos sensibles (solo confirma existencia).
 */
export const getByMessageId = query({
    args: {
        messageId: v.string()
    },
    handler: async (ctx, { messageId }) => {
        return await ctx.db
            .query("chats")
            .withIndex("by_message_id", (q) => q.eq("messageId", messageId))
            .first();
    }
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: actualiza un mensaje. */
export const update = mutation({
    args: {
        id: v.id("chats"),
        channelId: v.optional(v.id("channels")),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        role: v.optional(v.union(
            v.literal("user"),
            v.literal("assistant"),
            v.literal("system")
        )),
        content: v.optional(v.string()),
        messageId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const chat = await ctx.db.get("chats", args.id);
        if (!chat) throw new Error("Mensaje no encontrado");
        const channel = await ctx.db.get(chat.channelId);
        if (!channel) throw new Error("Canal no encontrado");
        await requireClientAccess(ctx, channel.client);
        const { id, ...updateData } = args;
        await ctx.db.patch("chats", id, updateData);
        return id;
    }
});

/** Solo admin: crea un mensaje de chat (para inyectar mensajes del sistema desde el panel). */
export const createAdminMessage = mutation({
    args: {
        channelId: v.id("channels"),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        role: v.union(
            v.literal("user"),
            v.literal("assistant"),
            v.literal("system")
        ),
        content: v.string(),
        messageId: v.string()
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const inserted = await ctx.db.insert("chats", args);

        // Pausar la IA cuando el operador toma el control (igual que en WhatsApp)
        const convState = args.sessionId
            ? await ctx.db.query("conversation_states").withIndex("by_session_id", q => q.eq("sessionId", args.sessionId!)).first()
            : args.phone
                ? await ctx.db.query("conversation_states").withIndex("by_phone_and_channel", q => q.eq("phone", args.phone!).eq("channel", args.channelId)).first()
                : null;
        if (convState && convState.status === "ACTIVE") {
            await ctx.db.patch(convState._id, { status: "PAUSED" });
        }

        return inserted;
    }
});

// ── Mutaciones Internas (solo llamables desde acciones de Convex) ─────────────

/**
 * Solo admin: retorna los últimos N mensajes de todos los canales, enriquecidos
 * con nombre de cuenta y canal. Usado para el panel de debug en vivo.
 */
export const listRecentAdmin = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { limit = 150 }) => {
        await requireAdmin(ctx);
        const chats = await ctx.db.query("chats").order("desc").take(limit);
        const enriched = await Promise.all(chats.map(async (chat) => {
            const channel = await ctx.db.get(chat.channelId);
            if (!channel) return { ...chat, channelName: "—", channelType: "—", clientName: "—" };
            const client = await ctx.db.get(channel.client);
            return {
                ...chat,
                channelName: channel.name,
                channelType: channel.type,
                clientName: client?.name ?? "—",
            };
        }));
        return enriched;
    }
});

/**
 * INTERNA: retorna todos los chats de un canal sin verificación de auth.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const getByChannelInternal = internalQuery({
    args: { channelId: v.id("channels") },
    handler: async (ctx, { channelId }) => {
        return await ctx.db
            .query("chats")
            .withIndex("by_channel_and_session", (q) => q.eq("channelId", channelId))
            .collect();
    }
});

/**
 * INTERNA: crea un mensaje de chat.
 * Solo llamable desde handleInboundMessage (WhatsApp webhook via action) o la IA.
 * Usar aiQueries.saveBotMessage / aiQueries.saveUserMessage para mensajes de IA.
 */
export const create = internalMutation({
    args: {
        channelId: v.id("channels"),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        role: v.union(
            v.literal("user"),
            v.literal("assistant"),
            v.literal("system")
        ),
        content: v.string(),
        messageId: v.string(),
        media: v.optional(v.object({
            type: v.literal("voice"),
            mediaId: v.string(),
            mimeType: v.optional(v.string()),
            seconds: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const chatId = await ctx.db.insert("chats", args);
        return chatId;
    }
});

/**
 * Actualiza `content` de un chat existente identificado por messageId.
 * Usado por processMessage para volcar la transcripción de un audio en el
 * placeholder que dejó handleInboundMessage al claim.
 */
export const updateContentByMessageId = internalMutation({
    args: {
        messageId: v.string(),
        content: v.string(),
    },
    handler: async (ctx, { messageId, content }) => {
        const existing = await ctx.db
            .query("chats")
            .withIndex("by_message_id", (q) => q.eq("messageId", messageId))
            .first();
        if (!existing) return null;
        await ctx.db.patch(existing._id, { content });
        return existing._id;
    }
});

/**
 * Idempotente: reserva un chat para un messageId entrante.
 * Si ya existía un chat con ese messageId, devuelve `{ isNew: false }` sin insertar.
 * Convex serializa esta mutation, así que dos webhooks paralelos para el mismo
 * messageId producen una sola creación; el caller usa `isNew` para decidir si
 * dispara IA / envía respuesta o ya lo está manejando otro flujo.
 */
export const claimInboundMessage = internalMutation({
    args: {
        channelId: v.id("channels"),
        phone: v.string(),
        role: v.union(v.literal("user"), v.literal("system")),
        content: v.string(),
        messageId: v.string(),
        media: v.optional(v.object({
            type: v.literal("voice"),
            mediaId: v.string(),
            mimeType: v.optional(v.string()),
            seconds: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("chats")
            .withIndex("by_message_id", (q) => q.eq("messageId", args.messageId))
            .first();
        if (existing) return { id: existing._id, isNew: false };
        const id = await ctx.db.insert("chats", args);
        return { id, isNew: true };
    }
});

/**
 * INTERNA: elimina un mensaje de chat.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const remove = internalMutation({
    args: {
        id: v.id("chats")
    },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("chats", id);
        return id;
    }
});
