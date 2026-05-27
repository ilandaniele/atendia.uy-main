"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// ── Acciones internas ─────────────────────────────────────────────────────────

/**
 * INTERNA: envía una notificación push a todos los miembros de un cliente.
 * Elimina automáticamente suscripciones expiradas (HTTP 410/404).
 */
export const sendToClient = internalAction({
    args: {
        clientId: v.id("clients"),
        title: v.string(),
        body: v.string(),
        url: v.optional(v.string()),
    },
    handler: async (ctx, { clientId, title, body, url }) => {
        const members = await ctx.runQuery(internal.clientMembers.getByClientInternal, { clientId });
        if (!members || members.length === 0) return;

        const userIds = members.map((m: any) => String(m.profile));
        const subscriptions = await ctx.runQuery(internal.pushSubscriptions.getSubscriptionsForUsers, { userIds });
        if (subscriptions.length === 0) return;

        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@atendia.uy";

        if (!vapidPublicKey || !vapidPrivateKey) {
            console.error("[Push] VAPID keys no configuradas — saltando envío");
            return;
        }

        const webpush = (await import("web-push")).default;
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

        const payload = JSON.stringify({ title, body, url: url ?? "/panel" });
        const toRemove: any[] = [];

        await Promise.allSettled(
            subscriptions.map(async (sub: any) => {
                try {
                    await webpush.sendNotification(sub.subscription, payload);
                } catch (err: any) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        toRemove.push(sub._id);
                    } else {
                        console.error("[Push] Error al enviar:", err?.message);
                    }
                }
            })
        );

        for (const id of toRemove) {
            await ctx.runMutation(internal.pushSubscriptions.internalRemove, { id });
        }
    }
});

/**
 * INTERNA: envía una notificación push a los miembros del cliente dueño de un canal.
 */
export const sendToChannel = internalAction({
    args: {
        channelId: v.id("channels"),
        title: v.string(),
        body: v.string(),
        url: v.optional(v.string()),
    },
    handler: async (ctx, { channelId, title, body, url }) => {
        const channel = await ctx.runQuery(api.channels.get, { id: channelId });
        if (!channel) return;
        await ctx.runAction(internal.pushNotifications.sendToClient, {
            clientId: channel.client,
            title,
            body,
            url: url ?? "/panel/mensajes",
        });
    }
});
