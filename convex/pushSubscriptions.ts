import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Consultas

export const list = query({
    args: {},
    handler: async (ctx) => {
        const subscriptions = await ctx.db.query("push_subscriptions").take(100);
        return subscriptions;
    }
});

export const get = query({
    args: {
        id: v.id("push_subscriptions")
    },
    handler: async (ctx, { id }) => {
        return await ctx.db.get("push_subscriptions", id);
    }
});

// Mutaciones

export const create = mutation({
    args: {
        userId: v.string(),
        subscription: v.any()
    },
    handler: async (ctx, args) => {
        const subId = await ctx.db.insert("push_subscriptions", args);
        return subId;
    }
});

export const update = mutation({
    args: {
        id: v.id("push_subscriptions"),
        userId: v.optional(v.string()),
        subscription: v.optional(v.any())
    },
    handler: async (ctx, args) => {
        const { id, ...updateData } = args;
        await ctx.db.patch("push_subscriptions", id, updateData);
        return id;
    }
});

export const remove = mutation({
    args: {
        id: v.id("push_subscriptions")
    },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("push_subscriptions", id);
        return id;
    }
});

/** INTERNA: retorna todas las suscripciones push de una lista de usuarios (por profileId). */
export const getSubscriptionsForUsers = internalQuery({
    args: { userIds: v.array(v.string()) },
    handler: async (ctx, { userIds }) => {
        const results = [];
        for (const userId of userIds) {
            const subs = await ctx.db
                .query("push_subscriptions")
                .filter((q) => q.eq(q.field("userId"), userId))
                .collect();
            results.push(...subs);
        }
        return results;
    }
});

/** INTERNA: elimina una suscripción expirada desde el action de push. */
export const internalRemove = internalMutation({
    args: { id: v.id("push_subscriptions") },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("push_subscriptions", id);
    }
});

/**
 * Crea o actualiza la suscripción push de un usuario para este dispositivo.
 * Se identifica el dispositivo por el endpoint de la suscripción.
 */
export const upsertForUser = mutation({
    args: {
        userId: v.string(),
        subscription: v.any(),
    },
    handler: async (ctx, { userId, subscription }) => {
        const endpoint = (subscription as { endpoint: string }).endpoint;
        const existing = await ctx.db
            .query("push_subscriptions")
            .filter((q) => q.eq(q.field("userId"), userId))
            .collect();
        const match = existing.find((s: any) => s.subscription?.endpoint === endpoint);
        if (match) {
            await ctx.db.patch(match._id, { subscription });
        } else {
            await ctx.db.insert("push_subscriptions", { userId, subscription });
        }
    }
});

/** Elimina todas las suscripciones push de un usuario (para un dispositivo específico por endpoint). */
export const removeForUser = mutation({
    args: {
        userId: v.string(),
        endpoint: v.string(),
    },
    handler: async (ctx, { userId, endpoint }) => {
        const existing = await ctx.db
            .query("push_subscriptions")
            .filter((q) => q.eq(q.field("userId"), userId))
            .collect();
        for (const sub of existing) {
            if ((sub.subscription as any)?.endpoint === endpoint) {
                await ctx.db.delete(sub._id);
            }
        }
    }
});
