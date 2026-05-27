import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./authHelpers";

// ── Consultas (públicas — catálogo de planes visible para todos) ───────────────

export const list = query({
    args: {},
    handler: async (ctx) => {
        const plans = await ctx.db.query("plans").take(100);
        return plans.filter((p) => !p.archived);
    }
});

/** Solo admin: lista todos los planes, incluidos los archivados. */
export const listAll = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        return ctx.db.query("plans").take(100);
    }
});

export const get = query({
    args: { planId: v.id("plans") },
    handler: (ctx, args) => ctx.db.get("plans", args.planId)
});

export const getByName = query({
    args: { name: v.string() },
    handler: (ctx, args) => ctx.db
        .query("plans")
        .withIndex("by_name", (name) => name.eq("name", args.name))
        .take(1)
});

export const getByDlocalPlanId = query({
    args: { dlocalPlanId: v.number() },
    handler: async (ctx, { dlocalPlanId }) => {
        const plans = await ctx.db.query("plans").collect();
        return plans.find((p) => p.dlocalPlanId === dlocalPlanId) ?? null;
    }
});

// ── Mutaciones (solo admin) ───────────────────────────────────────────────────

/** Solo admin: crea un plan. */
export const create = mutation({
    args: {
        name: v.string(),
        description: v.string(),
        tokens: v.number(),
        icon: v.string(),
        amount: v.number(),
        currency: v.union(
            v.literal("USD"),
            v.literal("UYU")
        ),
        frequencyType: v.union(
            v.literal("DAILY"),
            v.literal("WEEKLY"),
            v.literal("MONTHLY"),
            v.literal("YEARLY")
        ),
        frequencyValue: v.number(),
        subscriptionUrl: v.optional(v.string()),
        dlocalPlanId: v.optional(v.number()),
        archived: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        return ctx.db.insert("plans", { ...args, archived: args.archived ?? false });
    }
});

/** Solo admin: actualiza un plan. */
export const update = mutation({
    args: {
        id: v.id("plans"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        tokens: v.optional(v.number()),
        icon: v.optional(v.string()),
        amount: v.optional(v.number()),
        currency: v.optional(v.union(
            v.literal("USD"),
            v.literal("UYU")
        )),
        frequencyType: v.optional(v.union(
            v.literal("DAILY"),
            v.literal("WEEKLY"),
            v.literal("MONTHLY"),
            v.literal("YEARLY")
        )),
        frequencyValue: v.optional(v.number()),
        subscriptionUrl: v.optional(v.string()),
        dlocalPlanId: v.optional(v.number()),
        archived: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const { id, ...updateData } = args;
        return ctx.db.patch("plans", id, updateData);
    }
});

// ── Internas (usadas por crons) ───────────────────────────────────────────────

export const listAllInternal = internalQuery({
    args: {},
    handler: (ctx) => ctx.db.query("plans").collect(),
});

/**
 * One-shot migration: backfill `archived: false` on plans that don't have the field set.
 * Run once with `npx convex run plans:backfillArchived` after deploying the optional schema.
 */
export const backfillArchived = internalMutation({
    args: {},
    handler: async (ctx) => {
        const plans = await ctx.db.query("plans").collect();
        let patched = 0;
        for (const plan of plans) {
            if (plan.archived === undefined) {
                await ctx.db.patch(plan._id, { archived: false });
                patched++;
            }
        }
        return { scanned: plans.length, patched };
    },
});

export const updateDlocalLinkInternal = internalMutation({
    args: {
        id: v.id("plans"),
        dlocalPlanId: v.number(),
        subscriptionUrl: v.string(),
    },
    handler: (ctx, { id, dlocalPlanId, subscriptionUrl }) =>
        ctx.db.patch("plans", id, { dlocalPlanId, subscriptionUrl }),
});

/** Solo admin: elimina un plan. */
export const remove = mutation({
    args: { planId: v.id("plans") },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        return ctx.db.delete("plans", args.planId);
    }
});
