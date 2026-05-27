import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";
import { api, internal } from "./_generated/api";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los pedidos de todos los clientes. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const orders = await ctx.db.query("orders").take(100);
        return orders;
    }
});

/** Miembro del cliente o admin: retorna un pedido por ID. */
export const get = query({
    args: {
        id: v.id("orders")
    },
    handler: async (ctx, { id }) => {
        const order = await ctx.db.get("orders", id);
        if (!order) return null;
        await requireClientAccess(ctx, order.client);
        return order;
    }
});

/** Miembro del cliente o admin: retorna todos los pedidos del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("orders")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

/** Solo admin: retorna pedidos por estado (visión global). */
export const getByStatus = query({
    args: {
        status: v.union(
            v.literal("pending"),
            v.literal("confirmed"),
            v.literal("shipped"),
            v.literal("delivered"),
            v.literal("canceled")
        )
    },
    handler: async (ctx, { status }) => {
        await requireAdmin(ctx);
        return await ctx.db
            .query("orders")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect();
    }
});

// ── Queries Internas ─────────────────────────────────────────────────────────

/**
 * INTERNA: retorna pedidos por clientId sin verificación de auth.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("orders")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: actualiza un pedido existente. */
export const update = mutation({
    args: {
        id: v.id("orders"),
        client: v.optional(v.id("clients")),
        phone: v.optional(v.string()),
        name: v.optional(v.string()),
        deliveryAddress: v.optional(v.string()),
        items: v.optional(v.array(v.object({
            productName: v.string(),
            quantity: v.number(),
            priceAtMoment: v.number()
        }))),
        totalAmount: v.optional(v.number()),
        currency: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal("pending"),
            v.literal("confirmed"),
            v.literal("shipped"),
            v.literal("delivered"),
            v.literal("canceled")
        ))
    },
    handler: async (ctx, args) => {
        const order = await ctx.db.get("orders", args.id);
        if (!order) throw new Error("Pedido no encontrado");
        await requireClientAccess(ctx, order.client);
        const { id, ...updateData } = args;
        await ctx.db.patch("orders", id, updateData);
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: order.client,
            event: "order.updated",
            data: { ...order, ...updateData },
        });
        return id;
    }
});

/** Miembro del cliente o admin: elimina un pedido cancelado. */
export const removeOrder = mutation({
    args: { id: v.id("orders") },
    handler: async (ctx, { id }) => {
        const order = await ctx.db.get("orders", id);
        if (!order) throw new Error("Pedido no encontrado");
        await requireClientAccess(ctx, order.client);
        await ctx.db.delete("orders", id);
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: order.client,
            event: "order.deleted",
            data: order,
        });
        return id;
    }
});

/** Miembro del cliente o admin: crea un pedido manualmente. */
export const createManual = mutation({
    args: {
        clientId: v.id("clients"),
        channelId: v.optional(v.id("channels")),
        assistantId: v.optional(v.id("assistants")),
        name: v.string(),
        phone: v.string(),
        deliveryAddress: v.string(),
        items: v.array(v.object({
            productName: v.string(),
            quantity: v.number(),
            priceAtMoment: v.number()
        })),
        currency: v.string(),
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.clientId);
        const totalAmount = args.items.reduce((s, i) => s + i.quantity * i.priceAtMoment, 0);
        const id = await ctx.db.insert("orders", {
            client: args.clientId,
            ...(args.channelId ? { channel: args.channelId } : {}),
            ...(args.assistantId ? { assistant: args.assistantId } : {}),
            phone: args.phone,
            name: args.name,
            deliveryAddress: args.deliveryAddress,
            items: args.items,
            totalAmount,
            currency: args.currency,
            status: "pending",
        });
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: args.clientId,
            event: "order.created",
            data: { client: args.clientId, ...args, totalAmount, status: "pending" },
        });
        return id;
    }
});

// ── Mutaciones Internas (solo llamables desde acciones de Convex) ─────────────

/**
 * Envía un mensaje al cliente cuando el pedido pasa a "confirmed" o "shipped",
 * si el cliente tiene esa notificación habilitada en sus features.
 */
export const sendStatusNotification = action({
    args: {
        orderId: v.id("orders"),
        status: v.union(v.literal("confirmed"), v.literal("shipped")),
    },
    handler: async (ctx, { orderId, status }) => {
        const order = await ctx.runQuery(api.orders.get, { id: orderId });
        if (!order) return;

        const client = await ctx.runQuery(api.clients.get, { id: order.client });
        if (!client) return;

        const featureEnabled = status === "confirmed"
            ? client.features?.notifyOrderConfirmed
            : client.features?.notifyOrderShipped;
        if (!featureEnabled) return;

        const message = status === "confirmed"
            ? "✅ Tu pedido fue confirmado."
            : "🚚 Tu pedido está en camino.";

        const phone = order.phone;
        const isWeb = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(phone.replace(/@.*$/, ""));

        // Resolver el canal por el que llegó el pedido. Pedidos creados después
        // del fix multi-canal ya traen `channel`; los previos al fix caen al
        // viejo comportamiento (primer canal del tipo correspondiente).
        let channelId = order.channel ?? null;
        if (!channelId) {
            if (isWeb) {
                const channels = await ctx.runQuery(api.channels.getByClientAndType, {
                    clientId: order.client,
                    type: "web",
                });
                channelId = channels?.[0]?._id ?? null;
            } else {
                const fallback = await ctx.runQuery(internal.channels.getWhapiChannelByClientInternal, {
                    clientId: order.client,
                });
                channelId = fallback?._id ?? null;
            }
        }
        if (!channelId) return;

        if (isWeb) {
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId,
                sessionId: phone,
                content: message,
                messageId: `order-notify-${Date.now()}`,
            });
        } else {
            await ctx.runAction(api.whapiActions.sendMessage, {
                channelId,
                phone,
                content: message,
            });
        }
    },
});

/**
 * INTERNA: crea un pedido desde el procesamiento de IA.
 * No requiere sesión de usuario — solo llamable desde ai.ts (action).
 */
export const create = internalMutation({
    args: {
        client: v.id("clients"),
        channel: v.optional(v.id("channels")),
        assistant: v.optional(v.id("assistants")),
        phone: v.string(),
        name: v.string(),
        deliveryAddress: v.string(),
        items: v.array(v.object({
            productName: v.string(),
            quantity: v.number(),
            priceAtMoment: v.number()
        })),
        totalAmount: v.number(),
        currency: v.string(),
        status: v.union(
            v.literal("pending"),
            v.literal("confirmed"),
            v.literal("shipped"),
            v.literal("delivered"),
            v.literal("canceled")
        )
    },
    handler: async (ctx, args) => {
        const orderId = await ctx.db.insert("orders", args);
        const itemsSummary = args.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
        await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToClient, {
            clientId: args.client,
            title: `Nuevo pedido de ${args.name}`,
            body: itemsSummary.length > 100 ? itemsSummary.slice(0, 97) + "…" : itemsSummary,
            url: "/panel/pedidos",
        });
        return orderId;
    }
});

/**
 * INTERNA: elimina un pedido desde limpieza de cuenta.
 * Solo llamable desde acciones internas (profiles.cleanupImmediateClientData).
 */
export const remove = internalMutation({
    args: {
        id: v.id("orders")
    },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("orders", id);
        return id;
    }
});
