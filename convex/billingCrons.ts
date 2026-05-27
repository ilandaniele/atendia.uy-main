"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { WhapiPartnerService } from "../lib/services/whapi.service";

const SITE_URL = () => process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "https://atendia.uy";

const H24 = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;

// 35 días en ms — margen para suscripciones mensuales con posibles retrasos de pago
const SUBSCRIPTION_GRACE_PERIOD_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * Cron diario: verifica que cada cliente con suscripción paga tenga un pago
 * reciente (últimos 35 días). Si no lo tiene, cambia el canal de Whapi a
 * modo 'dev_archive' (inactivo) hasta que el próximo cobro se acredite.
 *
 * El modo se restaura automáticamente en billing.handleWebhookPayment
 * cuando se recibe un pago exitoso (solo en la primera suscripción).
 * Para renovaciones mensuales el canal ya está en 'live' y no se toca.
 */
export const checkWhapiChannelSubscriptions = internalAction({
    args: {},
    handler: async (ctx) => {
        const partnerToken = process.env.WHAPI_PARTNER_TOKEN;
        if (!partnerToken) {
            console.warn("[checkWhapiChannelSubscriptions] WHAPI_PARTNER_TOKEN no configurado, omitiendo.");
            return;
        }

        const now = Date.now();
        const whapi = new WhapiPartnerService({ token: partnerToken });

        // Clientes activos con suscripción de pago (tienen plan + subscriptionId)
        const subscribedClients = await ctx.runQuery(internal.clients.getSubscribedClientsInternal);

        for (const client of subscribedClients) {
            try {
                const invoices = await ctx.runQuery(internal.invoices.getInvoicesByClientInternal, {
                    clientId: client._id,
                });

                // ¿Tiene al menos un pago exitoso en los últimos 35 días?
                const hasRecentPaidInvoice = invoices.some(
                    (inv) => inv.status === "PAID" && (now - inv._creationTime) <= SUBSCRIPTION_GRACE_PERIOD_MS
                );

                if (hasRecentPaidInvoice) continue;

                // Sin pago reciente → desactivar canal de WhatsApp en Whapi
                const whapiChannel = await ctx.runQuery(internal.channels.getWhapiChannelByClientInternal, {
                    clientId: client._id,
                });

                if (!whapiChannel?.config?.whapiChannelId) continue;

                await whapi.changeChannelMode(whapiChannel.config.whapiChannelId, "dev_archive");
                console.log(
                    `[checkWhapiChannelSubscriptions] Canal ${whapiChannel.config.whapiChannelId} ` +
                    `desactivado (dev_archive) para cliente ${client._id} — sin pago en 35 días`
                );
            } catch (err) {
                console.error(`[checkWhapiChannelSubscriptions] Error procesando cliente ${client._id}:`, err);
            }
        }
    },
});

/**
 * Cron diario: detecta clientes activos cuyo trial vence en las próximas 24-48 hs
 * y envía un email de advertencia al owner.
 */
export const checkTrialEnding = internalAction({
    args: {},
    handler: async (ctx) => {
        const siteUrl = SITE_URL();
        const now = Date.now();
        const windowStart = now + H24;
        const windowEnd = now + H48;

        const trialClients = await ctx.runQuery(internal.clients.getActiveTrialClientsInternal);

        for (const client of trialClients) {
            // Solo los que vencen en las próximas 24-48 hs (ventana)
            if (!client.trialEndsAt || client.trialEndsAt < windowStart || client.trialEndsAt > windowEnd) {
                continue;
            }
            // Si ya tiene plan pagado, no alertar
            if (client.plan) continue;

            try {
                const members = await ctx.runQuery(internal.clientMembers.getByClientInternal, {
                    clientId: client._id,
                });
                const ownerMember = members.find((m) => m.role === "owner");
                if (!ownerMember) continue;

                const profile = await ctx.runQuery(internal.profiles.getOwnerProfileInternal, {
                    profileId: ownerMember.profile,
                });
                if (!profile?.email) continue;

                await ctx.runAction(internal.sengrid.sendTrialEndingWarning, {
                    email: profile.email,
                    name: profile.name,
                    businessName: client.businessName,
                    siteUrl,
                });
            } catch (err) {
                console.error(`[checkTrialEnding] Error procesando cliente ${client._id}:`, err);
            }
        }
    },
});

/**
 * Cron diario: detecta clientes activos cuyo trial ya venció y no tienen plan.
 * Los desactiva y envía email de trial expirado al owner.
 */
export const checkTrialExpired = internalAction({
    args: {},
    handler: async (ctx) => {
        const siteUrl = SITE_URL();
        const now = Date.now();

        const trialClients = await ctx.runQuery(internal.clients.getActiveTrialClientsInternal);

        for (const client of trialClients) {
            // Solo vencidos y sin plan
            if (!client.trialEndsAt || client.trialEndsAt > now) continue;
            if (client.plan) continue;

            try {
                // Desactivar el cliente
                await ctx.runMutation(internal.clients.deactivateInternal, { clientId: client._id });

                const members = await ctx.runQuery(internal.clientMembers.getByClientInternal, {
                    clientId: client._id,
                });
                const ownerMember = members.find((m) => m.role === "owner");
                if (!ownerMember) continue;

                const profile = await ctx.runQuery(internal.profiles.getOwnerProfileInternal, {
                    profileId: ownerMember.profile,
                });
                if (!profile?.email) continue;

                await ctx.runAction(internal.sengrid.sendTrialExpired, {
                    email: profile.email,
                    name: profile.name,
                    businessName: client.businessName,
                    siteUrl,
                });
            } catch (err) {
                console.error(`[checkTrialExpired] Error procesando cliente ${client._id}:`, err);
            }
        }
    },
});
