import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Consultas

export const list = query({
    args: {},
    handler: async (ctx) =>
        ctx.db.query("terms").order("desc").take(50),
});

export const get = query({
    args: { id: v.id("terms") },
    handler: (ctx, args) => ctx.db.get(args.id),
});

export const getActive = query({
    args: {},
    handler: (ctx) =>
        ctx.db
            .query("terms")
            .withIndex("by_active", (q) => q.eq("isActive", true))
            .first(),
});

// Mutaciones

export const create = mutation({
    args: {
        version: v.string(),
        title: v.string(),
        content: v.string(),
    },
    handler: (ctx, args) =>
        ctx.db.insert("terms", {
            ...args,
            isActive: false,
        }),
});

export const update = mutation({
    args: {
        id: v.id("terms"),
        version: v.optional(v.string()),
        title: v.optional(v.string()),
        content: v.optional(v.string()),
    },
    handler: (ctx, args) => {
        const { id, ...data } = args;
        return ctx.db.patch(id, data);
    },
});

export const publish = mutation({
    args: { id: v.id("terms") },
    handler: async (ctx, args) => {
        const allActive = await ctx.db
            .query("terms")
            .withIndex("by_active", (q) => q.eq("isActive", true))
            .collect();

        await Promise.all(allActive.map((t) => ctx.db.patch(t._id, { isActive: false })));

        await ctx.db.patch(args.id, {
            isActive: true,
            publishedAt: Date.now(),
        });
    },
});

export const unpublish = mutation({
    args: { id: v.id("terms") },
    handler: (ctx, args) =>
        ctx.db.patch(args.id, { isActive: false }),
});

export const remove = mutation({
    args: { id: v.id("terms") },
    handler: async (ctx, args) => {
        const terms = await ctx.db.get(args.id);
        if (terms?.isActive) {
            throw new Error("No se puede eliminar la versión publicada actualmente.");
        }
        return ctx.db.delete(args.id);
    },
});
