import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./authHelpers";
import { DLocalService } from "../lib/services/dlocal.service";

export const listInvoicesWithDetails = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);

        const invoices = await ctx.db.query("invoices").order("desc").take(500);

        const enriched = await Promise.all(
            invoices.map(async (invoice) => {
                const client = await ctx.db.get(invoice.client);
                const plan = invoice.plan ? await ctx.db.get(invoice.plan) : null;
                return {
                    ...invoice,
                    clientName: client?.name ?? "—",
                    clientBusinessName: client?.businessName ?? "—",
                    planName: plan?.name ?? "—",
                    planAmount: plan?.amount ?? 0,
                    planCurrency: plan?.currency ?? "USD",
                };
            })
        );

        return enriched;
    },
});

export const billingStats = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);

        const invoices = await ctx.db.query("invoices").take(500);
        const clients = await ctx.db.query("clients").collect();
        const plans = await ctx.db.query("plans").collect();

        const planMap = new Map(plans.map((p) => [p._id, p]));

        const byStatus = invoices.reduce(
            (acc, inv) => {
                acc[inv.status] = (acc[inv.status] ?? 0) + 1;
                return acc;
            },
            {} as Record<string, number>
        );

        const paidRevenue: Record<string, number> = {};
        for (const inv of invoices) {
            if (inv.status === "PAID" && inv.plan) {
                const plan = planMap.get(inv.plan);
                if (plan) {
                    paidRevenue[plan.currency] = (paidRevenue[plan.currency] ?? 0) + plan.amount;
                }
            }
        }

        const activeSubscriptions = clients.filter((c) => c.isActive && c.plan).length;

        const subsByPlan: Record<string, { name: string; count: number; currency: string; amount: number }> = {};
        for (const client of clients) {
            if (client.plan) {
                const plan = planMap.get(client.plan);
                if (plan) {
                    if (!subsByPlan[client.plan]) {
                        subsByPlan[client.plan] = {
                            name: plan.name,
                            count: 0,
                            currency: plan.currency,
                            amount: plan.amount,
                        };
                    }
                    subsByPlan[client.plan].count++;
                }
            }
        }

        return {
            totalInvoices: invoices.length,
            byStatus,
            paidRevenue,
            activeSubscriptions,
            subsByPlan: Object.values(subsByPlan),
            totalClients: clients.length,
        };
    },
});

// ── Mutaciones ────────────────────────────────────────────────────────────────

const INVOICE_STATUSES = ["PENDING", "PAID", "REJECTED", "CANCELLED", "EXPIRED"] as const;

/** Solo admin: actualiza el estado de una factura. */
export const updateInvoice = mutation({
    args: {
        id: v.id("invoices"),
        status: v.union(...INVOICE_STATUSES.map((s) => v.literal(s))),
    },
    handler: async (ctx, { id, status }) => {
        await requireAdmin(ctx);
        const invoice = await ctx.db.get(id);
        if (!invoice) throw new Error("Factura no encontrada");
        await ctx.db.patch(id, { status });
        return id;
    },
});

// ── Interno ───────────────────────────────────────────────────────────────────

export const isCurrentUserAdminInternal = internalQuery({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return false;
        const profile = await ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", userId))
            .first();
        return profile?.role === "admin";
    },
});

// ── Acciones ──────────────────────────────────────────────────────────────────

/** Solo admin: obtiene información de un pago en dLocal Go por su ID de orden. */
export const getInvoiceDLocalInfo = action({
    args: { orderId: v.string() },
    handler: async (ctx, { orderId }) => {
        const isAdmin = await ctx.runQuery(internal.adminBilling.isCurrentUserAdminInternal);
        if (!isAdmin) throw new Error("Acceso denegado");

        if (orderId.startsWith("ADMIN-")) {
            return { manual: true } as const;
        }

        const apiUrl = process.env.DLOCALGO_API_URL;
        const apiKey = process.env.DLOCALGO_API_KEY;
        const secretKey = process.env.DLOCALGO_SECRET_KEY;
        const siteUrl = process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "https://atendia.uy";

        if (!apiUrl || !apiKey || !secretKey) throw new Error("Credenciales de dLocal no configuradas");

        const dlocal = new DLocalService({ apiUrl, apiKey, secretKey, siteUrl });
        const payment = await dlocal.retrievePayment(orderId);
        return { manual: false, payment } as const;
    },
});
