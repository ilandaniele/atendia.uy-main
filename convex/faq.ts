import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./authHelpers";

/** Solo admin: lista todas las preguntas frecuentes (panel). */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        return await ctx.db
            .query("faq")
            .withIndex("by_order")
            .order("asc")
            .collect();
    },
});

/** Pública: lista solo las preguntas publicadas (página pública). */
export const listPublished = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db
            .query("faq")
            .withIndex("by_published", (q) => q.eq("isPublished", true))
            .order("asc")
            .collect();
    },
});

/** Solo admin: retorna una pregunta por ID. */
export const get = query({
    args: { id: v.id("faq") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        return await ctx.db.get(id);
    },
});

/** Solo admin: crea una pregunta frecuente. */
export const create = mutation({
    args: {
        question: v.string(),
        answerType: v.union(v.literal("content"), v.literal("youtube")),
        content: v.optional(v.string()),
        youtubeUrl: v.optional(v.string()),
        keywords: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const existing = await ctx.db.query("faq").withIndex("by_order").order("desc").first();
        const order = existing ? existing.order + 1 : 0;
        return await ctx.db.insert("faq", {
            ...args,
            order,
            isPublished: false,
        });
    },
});

/** Solo admin: actualiza una pregunta frecuente. */
export const update = mutation({
    args: {
        id: v.id("faq"),
        question: v.string(),
        answerType: v.union(v.literal("content"), v.literal("youtube")),
        content: v.optional(v.string()),
        youtubeUrl: v.optional(v.string()),
        keywords: v.array(v.string()),
    },
    handler: async (ctx, { id, ...rest }) => {
        await requireAdmin(ctx);
        await ctx.db.patch(id, rest);
    },
});

/** Solo admin: publica/despublica una pregunta. */
export const togglePublish = mutation({
    args: { id: v.id("faq") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        const faq = await ctx.db.get(id);
        if (!faq) throw new Error("Pregunta no encontrada");
        await ctx.db.patch(id, { isPublished: !faq.isPublished });
    },
});

/** Solo admin: reordena preguntas. */
export const reorder = mutation({
    args: {
        id: v.id("faq"),
        direction: v.union(v.literal("up"), v.literal("down")),
    },
    handler: async (ctx, { id, direction }) => {
        await requireAdmin(ctx);
        const all = await ctx.db.query("faq").withIndex("by_order").order("asc").collect();
        const idx = all.findIndex((f) => f._id === id);
        if (idx === -1) return;

        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= all.length) return;

        const a = all[idx];
        const b = all[swapIdx];
        await ctx.db.patch(a._id, { order: b.order });
        await ctx.db.patch(b._id, { order: a.order });
    },
});

/** Solo admin: guarda palabras clave de una pregunta. */
export const saveKeywords = mutation({
    args: { id: v.id("faq"), keywords: v.array(v.string()) },
    handler: async (ctx, { id, keywords }) => {
        await requireAdmin(ctx);
        await ctx.db.patch(id, { keywords });
    },
});

/** Solo admin: elimina una pregunta frecuente. */
export const remove = mutation({
    args: { id: v.id("faq") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        await ctx.db.delete(id);
    },
});
