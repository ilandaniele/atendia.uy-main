import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todas las facturas. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        return ctx.db.query("invoices").take(100);
    }
});

/** Miembro del cliente o admin: retorna una factura por ID. */
export const get = query({
    args: { id: v.id("invoices") },
    handler: async (ctx, { id }) => {
        const invoice = await ctx.db.get("invoices", id);
        if (!invoice) return null;
        await requireClientAccess(ctx, invoice.client);
        return invoice;
    }
});

/** Miembro del cliente o admin: lista facturas del cliente. */
export const listByClient = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("invoices")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .order("desc")
            .collect();
    }
});

/**
 * Semi-pública: busca factura por orderId de dLocal.
 * Usada por la acción billing.handleWebhookPayment (Convex action).
 * El orderId es un string opaco generado por dLocal — no es guessable.
 */
export const getByOrderId = query({
    args: { orderId: v.string() },
    handler: async (ctx, { orderId }) => {
        return await ctx.db
            .query("invoices")
            .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
            .first();
    }
});

/**
 * INTERNA: retorna todas las facturas de un cliente.
 * Usado por el cron de Whapi para verificar pagos del mes en curso.
 */
export const getInvoicesByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("invoices")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    },
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Solo admin: elimina una factura. */
export const remove = mutation({
    args: { id: v.id("invoices") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        await ctx.db.delete(id);
        return id;
    }
});

// ── Mutaciones Internas ───────────────────────────────────────────────────────

/**
 * INTERNA: crea una factura.
 * Solo llamable desde billing.handleWebhookPayment (action).
 */
export const create = internalMutation({
    args: {
        plan: v.id("plans"),
        orderId: v.string(),
        status: v.union(
            v.literal("PENDING"),
            v.literal("PAID"),
            v.literal("REJECTED"),
            v.literal("CANCELLED"),
            v.literal("EXPIRED")
        ),
        client: v.id("clients"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("invoices", args);
    }
});

/**
 * INTERNA: actualiza una factura.
 * Solo llamable desde billing.handleWebhookPayment (action).
 */
export const update = internalMutation({
    args: {
        id: v.id("invoices"),
        plan: v.id("plans"),
        orderId: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal("PENDING"),
            v.literal("PAID"),
            v.literal("REJECTED"),
            v.literal("CANCELLED"),
            v.literal("EXPIRED")
        )),
        client: v.optional(v.id("clients")),
    },
    handler: async (ctx, { id, ...args }) => {
        await ctx.db.patch(id, args);
        return id;
    }
});
