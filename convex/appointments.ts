import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";
import { internal } from "./_generated/api";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los turnos. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const appointments = await ctx.db.query("appointments").take(100);
        return appointments;
    }
});

/** Miembro del cliente o admin: retorna un turno por ID. */
export const get = query({
    args: {
        id: v.id("appointments")
    },
    handler: async (ctx, { id }) => {
        const appointment = await ctx.db.get("appointments", id);
        if (!appointment) return null;
        await requireClientAccess(ctx, appointment.client);
        return appointment;
    }
});

/** Miembro del cliente o admin: retorna turnos del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("appointments")
            .withIndex("by_client_date", (q) => q.eq("client", clientId))
            .collect();
    }
});

/** Solo admin: retorna turnos por estado (visión global). */
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
            .query("appointments")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect();
    }
});

// ── Queries Internas ─────────────────────────────────────────────────────────

/** INTERNA: retorna un turno por ID sin verificación de auth. */
export const getByIdInternal = internalQuery({
    args: { id: v.id("appointments") },
    handler: async (ctx, { id }) => ctx.db.get("appointments", id),
});

/**
 * INTERNA: retorna turnos por clientId sin verificación de auth.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("appointments")
            .withIndex("by_client_date", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: actualiza un turno. */
export const update = mutation({
    args: {
        id: v.id("appointments"),
        client: v.optional(v.id("clients")),
        customerName: v.optional(v.string()),
        customerPhone: v.optional(v.optional(v.string())),
        start: v.optional(v.number()),
        end: v.optional(v.optional(v.number())),
        status: v.optional(v.union(
            v.literal("pending"),
            v.literal("confirmed"),
            v.literal("shipped"),
            v.literal("delivered"),
            v.literal("canceled")
        )),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const appointment = await ctx.db.get("appointments", args.id);
        if (!appointment) throw new Error("Turno no encontrado");
        await requireClientAccess(ctx, appointment.client);
        const { id, ...updateData } = args;
        await ctx.db.patch("appointments", id, updateData);
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: appointment.client,
            event: "appointment.updated",
            data: { ...appointment, ...updateData },
        });
        const newStatus = updateData.status ?? appointment.status;
        await ctx.scheduler.runAfter(0, internal.googleCalendar.syncForClient, {
            appointmentId: id,
            clientId: appointment.client,
            operation: newStatus === "canceled" ? "delete" : "upsert",
        });
        return id;
    }
});

/** Miembro del cliente o admin: elimina un turno cancelado. */
export const removeAppointment = mutation({
    args: { id: v.id("appointments") },
    handler: async (ctx, { id }) => {
        const appt = await ctx.db.get("appointments", id);
        if (!appt) throw new Error("Turno no encontrado");
        await requireClientAccess(ctx, appt.client);
        await ctx.db.delete("appointments", id);
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: appt.client,
            event: "appointment.deleted",
            data: appt,
        });
        return id;
    }
});

/** Miembro del cliente o admin: crea un turno manualmente. */
export const createManual = mutation({
    args: {
        clientId: v.id("clients"),
        channelId: v.optional(v.id("channels")),
        customerName: v.string(),
        customerPhone: v.optional(v.string()),
        start: v.number(),
        end: v.optional(v.number()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.clientId);
        const id = await ctx.db.insert("appointments", {
            client: args.clientId,
            channel: args.channelId,
            customerName: args.customerName,
            customerPhone: args.customerPhone,
            start: args.start,
            end: args.end,
            notes: args.notes,
            status: "pending",
            source: "atendia",
        });
        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
            clientId: args.clientId,
            event: "appointment.created",
            data: { client: args.clientId, ...args, status: "pending" },
        });
        await ctx.scheduler.runAfter(0, internal.googleCalendar.syncForClient, {
            appointmentId: id,
            clientId: args.clientId,
            operation: "upsert",
        });
        return id;
    }
});

// ── Mutaciones Internas ───────────────────────────────────────────────────────

/**
 * INTERNA: crea un turno desde el procesamiento de IA.
 * Solo llamable desde ai.ts (action).
 */
export const create = internalMutation({
    args: {
        client: v.id("clients"),
        channel: v.optional(v.id("channels")),
        customerName: v.string(),
        customerPhone: v.optional(v.string()),
        start: v.number(),
        end: v.optional(v.number()),
        status: v.union(
            v.literal("pending"),
            v.literal("confirmed"),
            v.literal("shipped"),
            v.literal("delivered"),
            v.literal("canceled")
        ),
        notes: v.optional(v.string()),
        source: v.optional(v.union(v.literal("atendia"), v.literal("google_calendar"))),
    },
    handler: async (ctx, args) => {
        const orderId = await ctx.db.insert("appointments", args);
        return orderId;
    }
});

/**
 * INTERNA: elimina un turno.
 * Solo llamable desde acciones internas (cleanupImmediateClientData).
 */
export const remove = internalMutation({
    args: {
        id: v.id("appointments")
    },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("appointments", id);
        return id;
    }
});
