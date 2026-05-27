"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { SendGridService } from "../lib/services/sendgrid.service";

function getSendGrid(): SendGridService {
    const API_KEY = process.env.SENDGRID_API_KEY;
    if (!API_KEY) throw new Error("SENDGRID_API_KEY no está definida");
    return new SendGridService({ apiKey: API_KEY });
}

const FROM_EMAIL = "no-responder@atendia.uy";

// ─── Bienvenida ───────────────────────────────────────────────────────────────

export const sendWelcomeEmail = internalAction({
    args: {
        siteUrl: v.string(),
        name: v.string(),
        email: v.string(),
        trialDays: v.number(),
    },
    handler: async (_ctx, { name, email, trialDays, siteUrl }) => {
        const svc = getSendGrid();
        return await svc.send({
            from: FROM_EMAIL,
            to: email,
            templateId: "d-8c5296b4157c49b69e7876a5dc08366e",
            dynamicTemplateData: { name, trialDays, siteUrl },
        });
    },
});

// ─── Invitación de equipo ─────────────────────────────────────────────────────

export const sendTeamInvite = internalAction({
    args: {
        email: v.string(),
        inviterName: v.string(),
        businessName: v.string(),
        inviteUrl: v.string(),
    },
    handler: async (_ctx, { email, inviterName, businessName, inviteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_TEAM_INVITE ?? "",
                dynamicTemplateData: { inviterName, businessName, inviteUrl },
            });
        } catch (err) {
            console.error("[sendTeamInvite] Error al enviar email:", err);
        }
    },
});

// ─── Trial terminando (24 hs) ─────────────────────────────────────────────────

export const sendTrialEndingWarning = internalAction({
    args: {
        email: v.string(),
        name: v.string(),
        businessName: v.string(),
        siteUrl: v.string(),
    },
    handler: async (_ctx, { email, name, businessName, siteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_TRIAL_ENDING ?? "",
                dynamicTemplateData: {
                    name,
                    businessName,
                    billingUrl: `${siteUrl}/panel/facturacion`,
                },
            });
        } catch (err) {
            console.error("[sendTrialEndingWarning] Error al enviar email:", err);
        }
    },
});

// ─── Trial expirado ───────────────────────────────────────────────────────────

export const sendTrialExpired = internalAction({
    args: {
        email: v.string(),
        name: v.string(),
        businessName: v.string(),
        siteUrl: v.string(),
    },
    handler: async (_ctx, { email, name, businessName, siteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_TRIAL_EXPIRED ?? "",
                dynamicTemplateData: {
                    name,
                    businessName,
                    billingUrl: `${siteUrl}/panel/facturacion`,
                },
            });
        } catch (err) {
            console.error("[sendTrialExpired] Error al enviar email:", err);
        }
    },
});

// ─── Tokens bajos ─────────────────────────────────────────────────────────────

export const sendLowTokensWarning = internalAction({
    args: {
        email: v.string(),
        name: v.string(),
        businessName: v.string(),
        tokensLeft: v.number(),
        siteUrl: v.string(),
    },
    handler: async (_ctx, { email, name, businessName, tokensLeft, siteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_LOW_TOKENS ?? "",
                dynamicTemplateData: {
                    name,
                    businessName,
                    tokensLeft,
                    billingUrl: `${siteUrl}/panel/facturacion`,
                },
            });
        } catch (err) {
            console.error("[sendLowTokensWarning] Error al enviar email:", err);
        }
    },
});

// ─── Pago fallido ─────────────────────────────────────────────────────────────

export const sendPaymentFailed = internalAction({
    args: {
        email: v.string(),
        name: v.string(),
        businessName: v.string(),
        siteUrl: v.string(),
    },
    handler: async (_ctx, { email, name, businessName, siteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_PAYMENT_FAILED ?? "",
                dynamicTemplateData: {
                    name,
                    businessName,
                    billingUrl: `${siteUrl}/panel/facturacion`,
                },
            });
        } catch (err) {
            console.error("[sendPaymentFailed] Error al enviar email:", err);
        }
    },
});

// ─── Suscripción cancelada ────────────────────────────────────────────────────

export const sendSubscriptionCanceled = internalAction({
    args: {
        email: v.string(),
        name: v.string(),
        businessName: v.string(),
        endDate: v.string(),
        siteUrl: v.string(),
    },
    handler: async (_ctx, { email, name, businessName, endDate, siteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_SUB_CANCELED ?? "",
                dynamicTemplateData: {
                    name,
                    businessName,
                    endDate,
                    billingUrl: `${siteUrl}/panel/facturacion`,
                },
            });
        } catch (err) {
            console.error("[sendSubscriptionCanceled] Error al enviar email:", err);
        }
    },
});

// ─── Canal Whapi desconectado ─────────────────────────────────────────────────

export const sendWhapiDisconnected = internalAction({
    args: {
        email: v.string(),
        name: v.string(),
        channelName: v.string(),
        siteUrl: v.string(),
    },
    handler: async (_ctx, { email, name, channelName, siteUrl }) => {
        try {
            const svc = getSendGrid();
            await svc.send({
                from: FROM_EMAIL,
                to: email,
                templateId: process.env.SENDGRID_TEMPLATE_WHAPI_DISCONNECTED ?? "",
                dynamicTemplateData: {
                    name,
                    channelName,
                    channelsUrl: `${siteUrl}/panel/canales`,
                },
            });
        } catch (err) {
            console.error("[sendWhapiDisconnected] Error al enviar email:", err);
        }
    },
});
