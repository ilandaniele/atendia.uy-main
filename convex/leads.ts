import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";
import { internal } from "./_generated/api";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los leads de todos los clientes. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const leads = await ctx.db.query("leads").take(100);
        return leads;
    }
});

/** Miembro del cliente o admin: retorna un lead por ID. */
export const get = query({
    args: {
        id: v.id("leads")
    },
    handler: async (ctx, { id }) => {
        const lead = await ctx.db.get("leads", id);
        if (!lead) return null;
        await requireClientAccess(ctx, lead.client);
        return lead;
    }
});

/** Miembro del cliente o admin: retorna todos los leads del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("leads")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

/** INTERNA: retorna leads por clientId sin verificación de auth. */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("leads")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: actualiza un lead existente. */
export const update = mutation({
    args: {
        id: v.id("leads"),
        channel: v.optional(v.id("channels")),
        client: v.optional(v.id("clients")),
        type: v.optional(v.string()),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal("new"),
            v.literal("contacted"),
            v.literal("scheduled"),
            v.literal("closed"),
            v.literal("rejected"),
            v.literal("pending"),
            v.literal("confirmed")
        )),
        summary: v.optional(v.string()),
        requiresAction: v.optional(v.boolean()),
        data: v.optional(v.record(v.string(), v.any())),
        assignedTo: v.optional(v.union(v.id("profiles"), v.null())),
    },
    handler: async (ctx, args) => {
        const lead = await ctx.db.get("leads", args.id);
        if (!lead) throw new Error("Lead no encontrado");
        await requireClientAccess(ctx, lead.client);
        const { id, assignedTo, ...rest } = args;
        const resolvedAssignedTo = assignedTo ?? undefined;
        const updateData = { ...rest, assignedTo: resolvedAssignedTo };
        await ctx.db.patch("leads", id, updateData);

        // Sincronizar assignedTo con el conversation_state correspondiente
        if (assignedTo !== undefined) {
            const isWebSession = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.phone);
            const convState = isWebSession
                ? await ctx.db.query("conversation_states").withIndex("by_session_id", q => q.eq("sessionId", lead.phone)).first()
                : await ctx.db.query("conversation_states").withIndex("by_phone_and_channel", q => q.eq("phone", lead.phone).eq("channel", lead.channel)).first();
            if (convState) {
                await ctx.db.patch("conversation_states", convState._id, { assignedTo: resolvedAssignedTo });
            }
        }

        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: lead.client,
            event: "lead.updated",
            data: { ...lead, ...updateData },
        });
        return id;
    }
});

/** Miembro del cliente o admin: elimina un lead. */
export const remove = mutation({
    args: {
        id: v.id("leads")
    },
    handler: async (ctx, { id }) => {
        const lead = await ctx.db.get("leads", id);
        if (!lead) throw new Error("Lead no encontrado");
        await requireClientAccess(ctx, lead.client);
        await ctx.db.delete("leads", id);
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: lead.client,
            event: "lead.deleted",
            data: lead,
        });
        return id;
    }
});

/** Miembro del cliente o admin: crea un lead manualmente. */
export const createManual = mutation({
    args: {
        clientId: v.id("clients"),
        channelId: v.id("channels"),
        name: v.string(),
        phone: v.string(),
        summary: v.string(),
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.clientId);
        const id = await ctx.db.insert("leads", {
            channel: args.channelId,
            client: args.clientId,
            type: args.type ?? "lead",
            name: args.name,
            phone: args.phone,
            status: "new",
            summary: args.summary,
            requiresAction: true,
            data: {},
        });
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: args.clientId,
            event: "lead.created",
            data: { client: args.clientId, ...args, status: "new" },
        });
        return id;
    }
});

// ── Mutaciones Internas (solo llamables desde acciones de Convex) ─────────────

/**
 * INTERNA: crea un lead desde el procesamiento de IA.
 * Solo llamable desde ai.ts (action).
 */
export const create = internalMutation({
    args: {
        channel: v.id("channels"),
        client: v.id("clients"),
        type: v.string(),
        name: v.string(),
        phone: v.string(),
        status: v.union(
            v.literal("new"),
            v.literal("contacted"),
            v.literal("scheduled"),
            v.literal("closed"),
            v.literal("rejected"),
            v.literal("pending"),
            v.literal("confirmed")
        ),
        summary: v.string(),
        requiresAction: v.boolean(),
        data: v.record(v.string(), v.any())
    },
    handler: async (ctx, args) => {
        const leadId = await ctx.db.insert("leads", args);
        const typeLabel: Record<string, string> = {
            lead: "Cliente potencial",
            order: "Pedido",
            appointment: "Cita",
        };
        const label = typeLabel[args.type] ?? "Lead";
        await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToClient, {
            clientId: args.client,
            title: `Nuevo ${label.toLowerCase()} de ${args.name}`,
            body: args.summary.length > 100 ? args.summary.slice(0, 97) + "…" : args.summary,
            url: "/panel/leads",
        });
        return leadId;
    }
});

/**
 * INTERNA: elimina un lead.
 * Solo llamable desde acciones internas.
 */
export const _remove = internalMutation({
    args: {
        id: v.id("leads")
    },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("leads", id);
        return id;
    }
});
