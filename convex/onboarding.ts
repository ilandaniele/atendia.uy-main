"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { WhapiPartnerService, WhapiService, DEFAULT_WHAPI_WEBHOOK_EVENTS, DEFAULT_WHAPI_MEDIA_SETTINGS } from "../lib/services/whapi.service";

/**
 * Crea el canal en Whapi (Partner API), configura el webhook y actualiza Convex.
 * Se llama desde el onboarding cuando el canal es WhatsApp.
 */
export const setupWhatsAppChannel = action({
    args: { channelId: v.id("channels") },
    handler: async (ctx, args) => {
        const channel: any = await ctx.runQuery(api.channels.get, { id: args.channelId });
        if (!channel) throw new Error("Canal no encontrado");

        const WHAPI_PARTNER_API_KEY = process.env.WHAPI_PARTNER_API_KEY;
        const SITE_URL = process.env.SITE_URL ?? process.env.VITE_SITE_URL;

        if (!WHAPI_PARTNER_API_KEY) throw new Error("WHAPI_PARTNER_API_KEY no configurada");
        if (!SITE_URL) throw new Error("SITE_URL no configurada");

        const partner = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
        const whapiChannel = await partner.createChannel(channel.name);

        if (!whapiChannel) throw new Error("Error al crear canal en Whapi Partner");

        const siteUrl = SITE_URL.replace(/\/$/, "");
        const svc = new WhapiService({ token: whapiChannel.token, apiUrl: whapiChannel.apiUrl });
        await svc.updateChannelSettings({
            media: DEFAULT_WHAPI_MEDIA_SETTINGS,
            webhooks: [{
                mode: "body",
                url: `${siteUrl}/api/webhooks/whapi/${args.channelId}`,
                events: DEFAULT_WHAPI_WEBHOOK_EVENTS,
            }]
        });

        await ctx.runMutation(api.channels.update, {
            id: args.channelId,
            config: {
                whapiChannelId: whapiChannel.id,
                whapiToken: whapiChannel.token,
                whapiApiUrl: whapiChannel.apiUrl as string | undefined,
            }
        });

        return {
            whapiToken: whapiChannel.token,
            whapiApiUrl: whapiChannel.apiUrl as string | undefined,
        };
    }
});

/**
 * Consulta el estado y QR de un canal de WhatsApp via Whapi.
 * Se usa para el polling en el onboarding.
 */
export const getWhatsAppQR = action({
    args: {
        whapiToken: v.string(),
        whapiApiUrl: v.optional(v.string()),
    },
    handler: async (_ctx, args) => {
        const whapi = new WhapiService({ token: args.whapiToken, apiUrl: args.whapiApiUrl });

        try {
            const health = await whapi.checkHealth();
            if (health?.status?.text === "AUTHENTICATED") {
                return { authenticated: true, base64: null as string | null };
            }

            const qr: any = await whapi.getQRCode();
            if (qr?.status === "ALREADY_LOGGED_IN") {
                return { authenticated: true, base64: null as string | null };
            }
            return {
                authenticated: false,
                base64: (qr?.base64 as string | null) ?? null,
            };
        } catch {
            return { authenticated: false, base64: null as string | null };
        }
    }
});

/**
 * Marca el canal de WhatsApp como conectado en Convex.
 */
export const confirmWhatsAppConnected = action({
    args: { channelId: v.id("channels") },
    handler: async (ctx, args) => {
        await ctx.runMutation(api.channels.update, {
            id: args.channelId,
            status: "connected",
        });
    }
});
