import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { getEnv, JSONResponse } from "utils/utils";
import devug from "@mafer.solutions/devug";

/**
 * Webhook de WhatsApp — recibe mensajes entrantes de Whapi.
 *
 * Seguridad:
 * 1. Verifica que el canal existe en la BD y no está eliminado.
 *    El ID del canal en la URL es el secreto: Whapi registra esta URL
 *    durante la creación del canal y nadie más la conoce.
 * 2. Delega el procesamiento a la Convex action handleInboundMessage,
 *    que usa internalMutations y no expone mutaciones públicas.
 */
export async function action({
    request,
    params
}: {
    request: Request;
    params: { channelId: Id<"channels"> }
}) {
    const headers = new Headers();

    try {
        const rawBody = await request.text();
        const convex = new ConvexHttpClient(getEnv("VITE_CONVEX_URL"));        

        // 1. Verificar que el canal existe y está activo
        const channel = await convex.query(api.channels.get, { id: params.channelId });
        if (!channel) {
            devug.warn("Webhook recibido para canal inexistente o eliminado:", params.channelId);
            return JSONResponse({
                body: { error: "Not found" },
                status: { text: "Not Found", code: 404 },
                headers
            });
        }

        // 2. Parse del payload
        const payload = JSON.parse(rawBody);

        const message = payload.messages?.[0];
        const call = payload.calls?.[0];

        // 3. Enviar a Convex para procesamiento asíncrono

        // 3.1. Procesar  mensaje
        if (typeof message === "object" && message !== null) {
            // La deduplicación en handleInboundMessage (chats.getByMessageId)
            // garantiza que los reintentos de Whapi no generen duplicados.
            convex.action(api.whatsapp.handleInboundMessage, {
                channelId: params.channelId,
                message: {
                    id: String(message.id),
                    from_me: Boolean(message.from_me),
                    chat_id: String(message.chat_id),
                    type: typeof message.type === "string" ? message.type : undefined,
                    text: message.text ? { body: String(message.text.body ?? "") } : undefined,
                    voice: message.voice ? {
                        id: String(message.voice.id),
                        mime_type: String(message.voice.mime_type ?? "audio/ogg"),
                        seconds: Number(message.voice.seconds ?? 0),
                    } : undefined,
                },
            }).catch((err) => devug.error("Error en handleInboundMessage (background):", err));
        }

        // 3.2. Procesar llamada entrante
        if (typeof call === "object" && call !== null && "status" in call) {
            convex.action(api.whatsapp.handleInboundCall, {
                channelId: params.channelId,
                call: {
                    id: String(call.id),
                    from: String(call.from),
                    chat_id: String(call.chat_id),
                    status: String(call.status) as "initiated" | "ringing" | "answered" | "missed",
                    timestamp: Number(call.timestamp),
                },
            }).catch((err) => devug.error("Error en handleInboundCall (background):", err));
        }

        // 4. Responder 200 inmediatamente
        // Fire-and-forget: no esperamos que Convex complete el procesamiento.
        // Esto libera a Whapi de inmediato y corta el bucle de reintentos.

        if (!message && !call) {
            return JSONResponse({
                body: { success: true, note: "No messages to process" },
                status: { text: "OK", code: 200 },
                headers
            });
        }

        return JSONResponse({
            body: { success: true },
            status: { text: "OK", code: 200 },
            headers
        });

    } catch (error) {
        devug.error("Error crítico en webhook WhatsApp:", error);
        return JSONResponse({
            body: { error: "Internal Error" },
            status: { text: "Internal Server Error", code: 500 },
            headers
        });
    }
}
