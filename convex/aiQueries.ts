import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getBotContext = internalQuery({
    args: {
        clientId: v.id("clients"),
        channelId: v.id("channels"),
        chatId: v.optional(v.string()), // phone
        sessionId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const client = await ctx.db.get(args.clientId);
        const channel = await ctx.db.get(args.channelId);

        if (!channel || !channel.assistant) return { client, channel, assistant: null, history: [], conversationState: null };

        // Validar que el canal pertenezca al cliente que se quiere cobrar.
        if (channel.client !== args.clientId) {
            console.error(`[getBotContext] Mismatch: channel.client=${channel.client} != args.clientId=${args.clientId} (channelId=${args.channelId})`);
            return { client, channel: null, assistant: null, history: [], conversationState: null };
        }

        const assistant = await ctx.db.get(channel.assistant);

        // Validar que el asistente del canal pertenezca al mismo cliente.
        if (assistant && assistant.client !== channel.client) {
            console.error(`[getBotContext] Mismatch: assistant.client=${assistant.client} != channel.client=${channel.client} (assistantId=${channel.assistant}, channelId=${args.channelId})`);
            return { client, channel: null, assistant: null, history: [], conversationState: null };
        }

        let query;
        let conversationState = null;

        if (args.chatId) {
            query = ctx.db.query("chats").withIndex("by_channel_and_phone", (q) =>
                q.eq("channelId", args.channelId).eq("phone", args.chatId)
            );
            conversationState = await ctx.db.query("conversation_states")
                .withIndex("by_phone_and_channel", (q) => q.eq("phone", args.chatId!).eq("channel", args.channelId))
                .first();
        } else if (args.sessionId) {
            query = ctx.db.query("chats").withIndex("by_channel_and_session", (q) =>
                q.eq("channelId", args.channelId).eq("sessionId", args.sessionId)
            );
            conversationState = await ctx.db.query("conversation_states")
                .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId!))
                .first();
        }

        const rawHistory = query ? await query.order("desc").take(10) : [];

        return {
            client: client!,
            channel,
            assistant: assistant!,
            history: rawHistory.reverse(),
            conversationState,
        };
    }
});

export const getChunksText = internalQuery({
    args: { chunkIds: v.array(v.id("knowledge_chunks")) },
    handler: async (ctx, args) => {
        const texts = [];
        for (const id of args.chunkIds) {
            const chunk = await ctx.db.get(id);
            if (chunk) texts.push(chunk.content);
        }
        return texts;
    }
});

export const saveBotMessage = internalMutation({
    args: {
        channelId: v.id("channels"),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        content: v.string(),
        messageId: v.string()
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("chats", {
            channelId: args.channelId,
            phone: args.phone,
            sessionId: args.sessionId,
            role: "assistant",
            content: args.content,
            messageId: args.messageId,
        });
        // Limpiar el flag de mensaje pendiente al responder el bot
        const state = args.phone
            ? await ctx.db
                .query("conversation_states")
                .withIndex("by_phone_and_channel", (q) => q.eq("phone", args.phone!).eq("channel", args.channelId))
                .first()
            : args.sessionId
            ? await ctx.db
                .query("conversation_states")
                .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId!))
                .first()
            : null;
        if (state?._id) {
            await ctx.db.patch(state._id, { pendingUserMessage: false });
        }
    }
});

export const saveUserMessage = internalMutation({
    args: {
        channelId: v.id("channels"),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        content: v.string(),
        messageId: v.string()
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("chats", {
            channelId: args.channelId,
            phone: args.phone,
            sessionId: args.sessionId,
            role: "user",
            content: args.content,
            messageId: args.messageId,
        });
    }
});

export const deductTokens = internalMutation({
    args: {
        clientId: v.id("clients"),
        amount: v.number(),
        channelId: v.optional(v.id("channels")),
        source: v.union(v.literal("whatsapp"), v.literal("web"), v.literal("excel_import")),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const client = await ctx.db.get(args.clientId);
        if (!client) throw new Error("Client not found");

        // Si se pasa channelId, validar que el canal pertenezca al cliente que se cobra.
        if (args.channelId) {
            const channel = await ctx.db.get(args.channelId);
            if (!channel) throw new Error("Channel not found");
            if (channel.client !== args.clientId) {
                throw new Error(`deductTokens: channel.client=${channel.client} != clientId=${args.clientId}`);
            }
        }

        const newBalance = Math.max(0, client.tokensBalance - args.amount);
        const patch: Record<string, unknown> = { tokensBalance: newBalance };
        if (newBalance <= 0) { patch.isActive = false; patch.lockedInactive = true; }
        await ctx.db.patch(client._id, patch);

        await ctx.db.insert("token_usage_logs", {
            clientId: args.clientId,
            ...(args.channelId ? { channelId: args.channelId } : {}),
            source: args.source,
            tokensUsed: args.amount,
            phone: args.phone,
            sessionId: args.sessionId,
        });
    }
});

/**
 * INTERNA: retorna los registros activos (turnos, pedidos, leads) de un usuario
 * identificado por su teléfono o sessionId. Usado por la IA para prevenir
 * duplicados y habilitar cancelación/modificación.
 *
 * Si se pasa channelId, los registros se filtran a registros que pertenezcan al
 * mismo canal. Esto evita que un cliente con varios canales (cada uno con su
 * propio asistente) bloquee la creación de leads/pedidos/turnos en un canal
 * por la presencia de uno previo en otro canal del mismo cliente.
 *
 * Para compatibilidad: registros antiguos sin `channel` (creados antes del
 * fix multi-canal) se incluyen igual cuando channelId está presente, así no
 * pierden la prevención de duplicados ni la posibilidad de cancelarlos vía IA.
 */
export const getActiveUserRecords = internalQuery({
    args: {
        clientId: v.id("clients"),
        channelId: v.optional(v.id("channels")),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identifier = args.phone ?? args.sessionId;
        if (!identifier) return { appointments: [], orders: [], leads: [] };

        const now = Date.now();
        const matchesChannel = <T extends { channel?: unknown }>(rec: T): boolean => {
            if (!args.channelId) return true;
            return rec.channel === undefined || rec.channel === args.channelId;
        };

        const allAppointments = await ctx.db
            .query("appointments")
            .withIndex("by_client_date", (q) => q.eq("client", args.clientId))
            .collect();
        const appointments = allAppointments.filter(
            (a) => a.customerPhone === identifier
                && a.status !== "canceled"
                && a.start > now - 86400000
                && matchesChannel(a)
        );

        const allOrders = await ctx.db
            .query("orders")
            .withIndex("by_client", (q) => q.eq("client", args.clientId))
            .collect();
        const orders = allOrders.filter(
            (o) => o.phone === identifier
                && !["canceled", "delivered"].includes(o.status)
                && matchesChannel(o)
        );

        const allLeads = await ctx.db
            .query("leads")
            .withIndex("by_client", (q) => q.eq("client", args.clientId))
            .collect();
        const leads = allLeads.filter(
            (l) => l.phone === identifier
                && !["closed", "rejected"].includes(l.status)
                && matchesChannel(l)
        );

        return { appointments, orders, leads };
    },
});

/** INTERNA: guarda un evento de sistema en el historial de chats (ej: "Lead creado", "Turno agendado"). */
export const saveSystemEvent = internalMutation({
    args: {
        channelId: v.id("channels"),
        phone: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        content: v.string(),
        messageId: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("chats", {
            channelId: args.channelId,
            phone: args.phone,
            sessionId: args.sessionId,
            role: "event",
            content: args.content,
            messageId: args.messageId,
        });
    },
});

/** INTERNA: cancela un turno desde la IA. */
export const cancelAppointmentByAI = internalMutation({
    args: { id: v.id("appointments") },
    handler: async (ctx, { id }) => {
        await ctx.db.patch(id, { status: "canceled" });
    },
});

/** INTERNA: modifica fecha/hora de un turno desde la IA. */
export const modifyAppointmentByAI = internalMutation({
    args: {
        id: v.id("appointments"),
        start: v.number(),
        end: v.optional(v.number()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { id, ...fields } = args;
        const patch: Record<string, unknown> = { start: fields.start };
        if (fields.end !== undefined) patch.end = fields.end;
        if (fields.notes !== undefined) patch.notes = fields.notes;
        await ctx.db.patch(id, patch);
    },
});

/** INTERNA: cancela un pedido desde la IA. */
export const cancelOrderByAI = internalMutation({
    args: { id: v.id("orders") },
    handler: async (ctx, { id }) => {
        await ctx.db.patch(id, { status: "canceled" });
    },
});

export const updateConversationState = internalMutation({
    args: {
        id: v.id("conversation_states"),
        status: v.optional(v.union(
            v.literal("ACTIVE"),
            v.literal("PAUSED"),
            v.literal("IGNORED"),
            v.literal("ARCHIVED")
        )),
        pendingIntent: v.optional(v.union(
            v.literal("order"),
            v.literal("appointment"),
            v.literal("lead"),
            v.literal("cancel_appointment"),
            v.literal("modify_appointment"),
            v.literal("cancel_order"),
        )),
        pendingData: v.optional(v.any()),
        clearPending: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { id, clearPending, ...rest } = args;

        // Identity fields (altPhone/altEmail) must survive intent transitions
        // so a contact recognized via "give me your usual phone/email" stays
        // attached to the conversation across follow-up chat turns.
        const existing = await ctx.db.get(id);
        const existingPending = (existing?.pendingData ?? {}) as Record<string, unknown>;
        const identity: Record<string, unknown> = {};
        if (existingPending.altPhone !== undefined) identity.altPhone = existingPending.altPhone;
        if (existingPending.altEmail !== undefined) identity.altEmail = existingPending.altEmail;

        if (clearPending) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await ctx.db.patch("conversation_states", id, {
                ...(rest.status !== undefined ? { status: rest.status } : {}),
                pendingIntent: undefined,
                pendingData: Object.keys(identity).length > 0 ? identity : undefined,
            } as any);
        } else {
            const patch: Record<string, unknown> = {};
            if (rest.status !== undefined) patch.status = rest.status;
            if (rest.pendingIntent !== undefined) patch.pendingIntent = rest.pendingIntent;
            if (rest.pendingData !== undefined) {
                const incoming = (rest.pendingData ?? {}) as Record<string, unknown>;
                patch.pendingData = { ...identity, ...incoming };
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await ctx.db.patch("conversation_states", id, patch as any);
        }
    }
});