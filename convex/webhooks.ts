"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Normaliza el objeto raw de Convex a un payload limpio sin internals de la BD.
function normalizeData(event: string, raw: any): Record<string, unknown> {
    const type = event.split(".")[0];

    if (type === "lead") {
        return {
            id:             raw._id,
            name:           raw.name,
            phone:          raw.phone?.replace("@s.whatsapp.net", "") ?? null,
            status:         raw.status,
            summary:        raw.summary,
            type:           raw.type,
            requiresAction: raw.requiresAction ?? false,
        };
    }

    if (type === "order") {
        return {
            id:              raw._id,
            name:            raw.name,
            phone:           raw.phone?.replace("@s.whatsapp.net", "") ?? null,
            deliveryAddress: raw.deliveryAddress,
            items:           raw.items ?? [],
            totalAmount:     raw.totalAmount,
            currency:        raw.currency,
            status:          raw.status,
        };
    }

    if (type === "appointment") {
        return {
            id:            raw._id,
            customerName:  raw.customerName,
            customerPhone: raw.customerPhone?.replace("@s.whatsapp.net", "") ?? null,
            start:         raw.start != null ? new Date(raw.start).toISOString() : null,
            end:           raw.end   != null ? new Date(raw.end).toISOString()   : null,
            status:        raw.status,
            notes:         raw.notes ?? null,
        };
    }

    // Fallback genérico: elimina internals de Convex
    const { _id, _creationTime, client, channel, ...rest } = raw;
    return { id: _id, ...rest };
}

/**
 * Despacha una notificación HTTP POST a todos los webhooks configurados en el
 * cliente que estén habilitados y suscritos al evento dado.
 *
 * Se invoca siempre de forma asíncrona (ctx.scheduler.runAfter) para no
 * bloquear la mutación/acción que lo origina.
 */
export const dispatch = internalAction({
    args: {
        clientId: v.id("clients"),
        event: v.string(),
        data: v.any(),
    },
    handler: async (ctx, args) => {
        const client = await ctx.runQuery(api.clients.get, { id: args.clientId });
        const webhooks = (client as any)?.webhooks ?? [];
        if (webhooks.length === 0) return;

        const payload = JSON.stringify({
            event:     args.event,
            timestamp: new Date().toISOString(),
            data:      normalizeData(args.event, args.data),
        });

        for (const wh of webhooks) {
            if (!wh.enabled) continue;
            if (!wh.events.includes(args.event)) continue;

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "User-Agent":   "Atendia-Webhooks/1.0",
            };

            if (wh.secret) {
                const { createHmac } = await import("crypto");
                const sig = createHmac("sha256", wh.secret).update(payload).digest("hex");
                headers["X-Atendia-Signature"] = `sha256=${sig}`;
            }

            try {
                const res = await fetch(wh.url, {
                    method:  "POST",
                    headers,
                    body:    payload,
                    signal:  AbortSignal.timeout(10_000),
                });
                if (!res.ok) {
                    console.warn(`[Webhook] ${wh.name} → ${wh.url} respondió ${res.status}`);
                }
            } catch (err) {
                console.error(`[Webhook] Error enviando a ${wh.url}:`, err);
            }
        }
    },
});
