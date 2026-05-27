"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { DLocalService } from "../lib/services/dlocal.service";
import { WhapiPartnerService } from "../lib/services/whapi.service";
import devug from "@mafer.solutions/devug";
import crypto from "crypto";

/**
 * Acción autenticada que cancela la suscripción activa de un cliente en dLocal Go
 * y elimina el vínculo plan/subscripción en Convex.
 *
 * Solo puede ejecutarla el owner del cliente.
 * El acceso al servicio se corta cuando el cron diario detecte que no hay
 * factura PAID en los últimos 35 días.
 */
export const cancelSubscription = action({
    args: {
        clientId: v.id("clients"),
    },
    handler: async (ctx, { clientId }) => {
        // ── Verificar que el caller es owner del cliente ─────────────────────
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile) throw new Error("No autenticado");

        const memberships = await ctx.runQuery(api.clientMembers.getByProfile, { profileId: profile._id });
        const isOwner = memberships.some((m: any) => m.client === clientId && m.role === "owner");
        if (!isOwner) throw new Error("Solo el propietario puede cancelar el plan");

        // ── Obtener cliente y plan ───────────────────────────────────────────
        const client = await ctx.runQuery(api.clients.get, { id: clientId });
        if (!client) throw new Error("Cliente no encontrado");
        if (!client.plan || !client.dlocalGoSubscriptionId) {
            throw new Error("El cliente no tiene una suscripción activa para cancelar");
        }

        const planDetails = await ctx.runQuery(api.plans.get, { planId: client.plan });
        if (!planDetails?.dlocalPlanId) {
            throw new Error("No se encontró el identificador del plan en dLocal Go");
        }

        // ── Cancelar en dLocal Go ────────────────────────────────────────────
        const dlocal = new DLocalService({
            apiKey: process.env.DLOCALGO_API_KEY!,
            secretKey: process.env.DLOCALGO_SECRET_KEY!,
            apiUrl: process.env.DLOCALGO_API_URL!,
            siteUrl: process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "",
        });

        await dlocal.cancelPlanSubscription(
            planDetails.dlocalPlanId,
            parseInt(client.dlocalGoSubscriptionId, 10),
        );

        // ── Eliminar vínculo en Convex ───────────────────────────────────────
        await ctx.runMutation(internal.clients.removeSubscription, { clientId });

        devug.log(`[billing] Suscripción cancelada para cliente ${clientId} (plan ${planDetails.dlocalPlanId})`);
        return { success: true };
    },
});

/**
 * Solo admin: cancela la suscripción de un cliente.
 * Si tiene `dlocalGoSubscriptionId`, la cancela en dLocal Go.
 * Siempre limpia plan y subscripción en Convex (cubre el caso de planes asignados manualmente).
 */
export const adminCancelSubscription = action({
    args: {
        clientId: v.id("clients"),
    },
    handler: async (ctx, { clientId }) => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile || profile.role !== "admin") throw new Error("Acceso denegado");

        const client = await ctx.runQuery(api.clients.get, { id: clientId });
        if (!client) throw new Error("Cliente no encontrado");
        if (!client.plan) throw new Error("El cliente no tiene un plan asignado");

        if (client.dlocalGoSubscriptionId) {
            const planDetails = await ctx.runQuery(api.plans.get, { planId: client.plan });
            if (!planDetails?.dlocalPlanId) {
                throw new Error("No se encontró el identificador del plan en dLocal Go");
            }
            const dlocal = new DLocalService({
                apiKey: process.env.DLOCALGO_API_KEY!,
                secretKey: process.env.DLOCALGO_SECRET_KEY!,
                apiUrl: process.env.DLOCALGO_API_URL!,
                siteUrl: process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "",
            });
            await dlocal.cancelPlanSubscription(
                planDetails.dlocalPlanId,
                parseInt(client.dlocalGoSubscriptionId, 10),
            );
        }

        await ctx.runMutation(internal.clients.removeSubscription, { clientId });

        devug.log(`[billing] (admin) Plan removido del cliente ${clientId}`);
        return { success: true };
    },
});

export const createPaymentLink = action({
    args: {
        clientId: v.id("clients"),
        planId: v.number(),
    },
    handler: async (ctx, args) => {
        const dlocal = new DLocalService({
            apiUrl: process.env.DLOCALGO_API_URL!,
            apiKey: process.env.DLOCALGO_API_KEY!,
            secretKey: process.env.DLOCALGO_SECRET_KEY!,
            siteUrl: (process.env.SITE_URL ?? process.env.VITE_SITE_URL)!
        });

        const planDetails = await dlocal.retrievePlan(args.planId);

        if (!planDetails || !planDetails.subscribe_url) {
            throw new Error("No se pudo obtener el enlace de suscripción de dLocal Go");
        }

        return planDetails.subscribe_url;
    }
});

/**
 * Acción pública que procesa el payload de un webhook de dLocal.
 * Llamada desde app/routes/api/webhooks/dlocal.ts DESPUÉS de que el
 * webhook validó la firma HMAC.
 *
 * Al ser una action, puede llamar internalMutations sin sesión de usuario.
 */
export const handleWebhookPayment = action({
    args: {
        payload: v.string(),      // rawBody del webhook (JSON string)
        signature: v.string(),    // firma HMAC recibida en el header
    },
    handler: async (ctx, { payload, signature }) => {
        // Verificación de firma como segunda línea de defensa (ya validada en el webhook route)
        const apiKey = process.env.DLOCALGO_API_KEY ?? "";
        const secretKey = process.env.DLOCALGO_SECRET_KEY ?? "";
        const apiUrl = process.env.DLOCALGO_API_URL ?? "";

        const message = apiKey + payload;
        const expectedSignature = crypto
            .createHmac("sha256", secretKey)
            .update(message)
            .digest("hex");

        if (signature !== expectedSignature) {
            devug.error("Firma HMAC inválida en billing.handleWebhookPayment");
            throw new Error("Firma inválida");
        }

        const parsedPayload = JSON.parse(payload);

        const dlocal = new DLocalService({
            apiKey, secretKey, apiUrl,
            siteUrl: process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? ""
        });

        // ── CAMINO A: Suscripción recurrente ────────────────────────────────
        if (parsedPayload.subscriptionId) {
            const subscriptionId: number = parsedPayload.subscriptionId;
            const invoiceId: string = parsedPayload.invoiceId;

            // Idempotencia
            const existingInvoice = await ctx.runQuery(api.invoices.getByOrderId, { orderId: invoiceId });
            if (existingInvoice?.status === "PAID") {
                devug.log(`Webhook duplicado ignorado: ${invoiceId}`);
                return { received: true, type: "subscription", duplicate: true };
            }

            const execution = await dlocal.retrieveSubscriptionExecution(subscriptionId, invoiceId);
            const dlocalPlanId = execution.subscription.plan.id;
            const internalPlan = await ctx.runQuery(api.plans.getByDlocalPlanId, { dlocalPlanId });

            if (!internalPlan) {
                devug.error(`No se encontró plan interno para dlocalPlanId: ${dlocalPlanId}`);
                return { error: "Plan not found" };
            }

            const subIdStr = subscriptionId.toString();
            let client = await ctx.runQuery(api.clients.getBySubscriptionId, { subscriptionId: subIdStr });

            if (!client) {
                const subscriberEmail = execution.subscription.client_email;
                const profile = await ctx.runQuery(internal.profiles.getByEmailInternal, { email: subscriberEmail });

                if (!profile) {
                    devug.error(`No se encontró perfil para el email: ${subscriberEmail}`);
                    return { error: "Profile not found" };
                }

                const clientMembers = await ctx.runQuery(api.clientMembers.getByProfile, { profileId: profile._id });
                const ownerMember = clientMembers.find((m) => m.role === "owner");

                if (!ownerMember) {
                    devug.error(`El perfil ${profile._id} no es owner de ningún cliente`);
                    return { error: "Owner not found" };
                }

                client = await ctx.runQuery(api.clients.get, { id: ownerMember.client });

                if (!client) {
                    devug.error(`Cliente no encontrado: ${ownerMember.client}`);
                    return { error: "Client not found" };
                }

                // Primera suscripción: vincular plan y subscriptionId al cliente
                await ctx.runMutation(internal.clients.activateSubscription, {
                    clientId: client._id,
                    planId: internalPlan._id,
                    dlocalGoSubscriptionId: subIdStr,
                });

                // Activar canal Whapi: trial → live (solo ocurre una vez)
                try {
                    const partnerToken = process.env.WHAPI_PARTNER_TOKEN;
                    if (partnerToken) {
                        const whapiChannel = await ctx.runQuery(internal.channels.getWhapiChannelByClientInternal, {
                            clientId: client._id,
                        });
                        if (whapiChannel?.config?.whapiChannelId) {
                            const whapi = new WhapiPartnerService({ token: partnerToken });
                            await whapi.changeChannelMode(whapiChannel.config.whapiChannelId, "live");
                            devug.log(`[billing] Canal Whapi ${whapiChannel.config.whapiChannelId} activado a modo 'live' para cliente ${client._id}`);
                        }
                    }
                } catch (err) {
                    devug.error("[billing] Error activando canal Whapi en primera suscripción:", err);
                }
            } else {
                // Renovación: reactivar canal si fue desactivado por falta de pago (dev_archive → live)
                try {
                    const partnerToken = process.env.WHAPI_PARTNER_TOKEN;
                    if (partnerToken) {
                        const whapiChannel = await ctx.runQuery(internal.channels.getWhapiChannelByClientInternal, {
                            clientId: client._id,
                        });
                        if (whapiChannel?.config?.whapiChannelId) {
                            const whapi = new WhapiPartnerService({ token: partnerToken });
                            await whapi.changeChannelMode(whapiChannel.config.whapiChannelId, "live");
                            devug.log(`[billing] Canal Whapi ${whapiChannel.config.whapiChannelId} reactivado a 'live' para cliente ${client._id}`);
                        }
                    }
                } catch (err) {
                    devug.error("[billing] Error reactivando canal Whapi en renovación:", err);
                }
            }

            // Acreditar tokens
            if (internalPlan.tokens > 0) {
                await ctx.runMutation(internal.clients.addTokens, {
                    clientId: client._id,
                    amount: internalPlan.tokens
                });
            }

            // Registrar la factura
            await ctx.runMutation(internal.invoices.create, {
                client: client._id,
                plan: internalPlan._id,
                orderId: invoiceId,
                status: "PAID",
            });

            return { received: true, type: "subscription" };
        }

        // ── CAMINO B: Pago único ─────────────────────────────────────────────
        const paymentId = parsedPayload.payment_id;
        if (!paymentId) return { error: "Missing payment identifiers" };

        const payment = await dlocal.retrievePayment(paymentId);
        const invoice = await ctx.runQuery(api.invoices.getByOrderId, { orderId: payment.id.toString() });

        if (invoice) {
            if (invoice.status === "PENDING" && payment.status === "PAID") {
                await ctx.runMutation(internal.invoices.update, {
                    id: invoice._id,
                    status: "PAID",
                    plan: invoice.plan as any,
                });

                if (invoice.plan) {
                    const planDetails = await ctx.runQuery(api.plans.get, { planId: invoice.plan });
                    if (planDetails && planDetails.tokens > 0) {
                        await ctx.runMutation(internal.clients.addTokens, {
                            clientId: invoice.client,
                            amount: planDetails.tokens
                        });
                    }
                }
            } else if (payment.status === "REJECTED" || payment.status === "CANCELLED") {
                await ctx.runMutation(internal.invoices.update, {
                    id: invoice._id,
                    status: "REJECTED",
                    plan: invoice.plan as any,
                });

                // Notificar al owner del cliente sobre el pago fallido
                try {
                    const siteUrl = process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "";
                    const invoiceClient = await ctx.runQuery(api.clients.get, { id: invoice.client });
                    if (invoiceClient) {
                        const members = await ctx.runQuery(internal.clientMembers.getByClientInternal, {
                            clientId: invoice.client,
                        });
                        const ownerMember = members.find((m) => m.role === "owner");
                        if (ownerMember) {
                            const profile = await ctx.runQuery(internal.profiles.getOwnerProfileInternal, {
                                profileId: ownerMember.profile,
                            });
                            if (profile?.email) {
                                await ctx.runAction(internal.sengrid.sendPaymentFailed, {
                                    email: profile.email,
                                    name: profile.name,
                                    businessName: invoiceClient.businessName,
                                    siteUrl,
                                });
                            }
                        }
                    }
                } catch (err) {
                    devug.error("[billing] Error enviando email de pago fallido:", err);
                }
            }
        } else {
            devug.error("No se encontró factura con orderId:", payment.id);
        }

        return { received: true };
    }
});
