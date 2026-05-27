import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAuth, requireClientAccess } from "./authHelpers";

/** Solo admin: lista todos los tickets con datos de perfil y cliente. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const tickets = await ctx.db
            .query("tickets")
            .order("desc")
            .collect();

        return Promise.all(
            tickets.map(async (ticket) => {
                const profile = await ctx.db.get(ticket.profileId);
                const client = await ctx.db.get(ticket.clientId);
                return { ...ticket, profile, client };
            })
        );
    },
});

/** Miembro del cliente o admin: lista tickets del cliente. */
export const listByClient = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("tickets")
            .withIndex("by_client", (q) => q.eq("clientId", clientId))
            .order("desc")
            .collect();
    },
});

/** Miembro del cliente o admin: retorna un ticket por ID. */
export const get = query({
    args: { id: v.id("tickets") },
    handler: async (ctx, { id }) => {
        const ticket = await ctx.db.get(id);
        if (!ticket) return null;
        await requireClientAccess(ctx, ticket.clientId);
        const profile = await ctx.db.get(ticket.profileId);
        const client = await ctx.db.get(ticket.clientId);
        return { ...ticket, profile, client };
    },
});

/** Autenticado: crea un ticket de soporte para su propio cliente. */
export const create = mutation({
    args: {
        clientId: v.id("clients"),
        profileId: v.id("profiles"),
        title: v.string(),
        description: v.string(),
        priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.clientId);
        return await ctx.db.insert("tickets", {
            ...args,
            status: "open",
        });
    },
});

/** Solo admin: actualiza el estado de un ticket. */
export const updateStatus = mutation({
    args: {
        id: v.id("tickets"),
        status: v.union(
            v.literal("open"),
            v.literal("in_progress"),
            v.literal("resolved"),
            v.literal("closed")
        ),
    },
    handler: async (ctx, { id, status }) => {
        await requireAdmin(ctx);
        await ctx.db.patch(id, { status });
    },
});

/** Solo admin: guarda una nota en un ticket. */
export const saveAdminNote = mutation({
    args: {
        id: v.id("tickets"),
        adminNote: v.string(),
    },
    handler: async (ctx, { id, adminNote }) => {
        await requireAdmin(ctx);
        await ctx.db.patch(id, { adminNote });
    },
});

/** Solo admin: elimina un ticket. */
export const remove = mutation({
    args: { id: v.id("tickets") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        await ctx.db.delete(id);
    },
});
