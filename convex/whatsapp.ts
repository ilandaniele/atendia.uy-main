"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { WhapiService } from "../lib/services/whapi.service";
import devug from "@mafer.solutions/devug";
import type { Id } from "./_generated/dataModel";

/**
 * Acción pública que procesa un mensaje entrante de WhatsApp.
 * Llamada desde el webhook de WhatsApp (app/routes/api/webhooks/whapi.ts)
 * DESPUÉS de que el webhook validó la firma HMAC.
 *
 * Al ser una action (no una mutation), tiene acceso a funciones internas
 * y puede llamar internalMutations sin requerir sesión de usuario.
 */
export const handleInboundMessage = action({
    args: {
        channelId: v.id("channels"),
        message: v.object({
            id: v.string(),
            from_me: v.boolean(),
            chat_id: v.string(),
            type: v.optional(v.string()),
            text: v.optional(v.object({ body: v.string() })),
            voice: v.optional(v.object({
                id: v.string(),
                mime_type: v.string(),
                seconds: v.number(),
            })),
        }),
    },
    handler: async (ctx, { channelId, message }) => {
        const isFromMe = message.from_me;
        const text = message.text?.body ?? "";
        const chatId = message.chat_id;
        const isVoice = message.type === "voice" && !!message.voice;

        // 1. Obtener canal y cliente
        const channel = await ctx.runQuery(api.channels.get, { id: channelId });
        if (!channel || !channel.isActive) return { success: true, note: "Channel inactive or not found" };

        const client = await ctx.runQuery(api.clients.get, { id: channel.client });
        if (!client || !client.isActive) return { success: true, note: "Client inactive" };

        // 2. Gestionar estado de conversación (internalMutations) — necesario antes
        //    del claim porque queremos crear el state aunque deduplichemos abajo.
        const conversationState = await ctx.runQuery(api.conversationStates.getByPhoneAndChannel, { phone: chatId, channelId: channel._id });
        let stateId: Id<"conversation_states"> | undefined = conversationState?._id;

        if (!conversationState) {
            stateId = await ctx.runMutation(internal.conversationStates.create, {
                phone: chatId,
                status: "ACTIVE",
                channel: channel._id
            });
        }

        const currentStatus = conversationState?.status ?? "ACTIVE";
        const transcribeEnabled = isVoice && !isFromMe && client.features?.transcribeAudio === true;

        // Tipos no-texto conocidos que NO deben disparar IA (no hay contenido procesable).
        const NON_TEXT_TYPES = new Set([
            "image", "video", "sticker", "audio", "document", "location",
            "contact", "contacts", "gif", "ptv",
        ]);
        const messageType = message.type ?? "";
        const isNonTextMultimedia = !isVoice && !text.trim() && NON_TEXT_TYPES.has(messageType);

        // 3. CLAIM atómico del messageId. Si Whapi reenvía el mismo evento o
        //    dos webhooks paralelos llegan con el mismo messageId, solo el primero
        //    obtiene `isNew=true` y avanza con el resto del flujo (envío de respuesta,
        //    schedule IA). Cuando hay voz con transcripción activa, NO insertamos
        //    el chat acá — lo crea processMessage con la transcripción ya hecha,
        //    pero usamos un messageId pseudo-placeholder para reservar el slot.
        if (transcribeEnabled) {
            // Reservar el slot para que un segundo webhook con el mismo messageId
            // detecte que ya está en proceso. Insertamos un chat oculto (rol=user,
            // content="") y luego processMessage lo reemplazará. Para evitar que se
            // muestre vacío en el chat UI hasta que termine la transcripción,
            // marcamos un media tentativo y lo updateamos al final.
            // Más simple: NO insertamos acá; usamos un claim por mensaje aparte.
            const claim = await ctx.runMutation(internal.chats.claimInboundMessage, {
                channelId: channel._id,
                phone: String(chatId),
                role: "user",
                content: "",
                messageId: String(message.id),
                ...(message.voice ? {
                    media: {
                        type: "voice" as const,
                        mediaId: message.voice.id,
                        mimeType: message.voice.mime_type,
                        seconds: message.voice.seconds,
                    },
                } : {}),
            });
            if (!claim.isNew) return { success: true, note: "Message already processed" };
        } else {
            const claim = await ctx.runMutation(internal.chats.claimInboundMessage, {
                channelId: channel._id,
                phone: String(chatId),
                role: isFromMe ? "system" : "user",
                content: String(text),
                messageId: String(message.id),
                ...(isVoice && message.voice ? {
                    media: {
                        type: "voice" as const,
                        mediaId: message.voice.id,
                        mimeType: message.voice.mime_type,
                        seconds: message.voice.seconds,
                    },
                } : {}),
            });
            if (!claim.isNew) return { success: true, note: "Message already processed" };
        }

        // 5b. Actualizar flag de mensaje pendiente en el estado de conversación.
        // Si el operador responde manualmente desde WhatsApp, pausar la IA para
        // que no retome el control en el próximo mensaje del usuario.
        if (stateId) {
            const operatorManualReply = isFromMe && currentStatus === "ACTIVE";
            await ctx.runMutation(internal.conversationStates.updateInternal, {
                id: stateId,
                pendingUserMessage: !isFromMe,
                ...(operatorManualReply ? { status: "PAUSED" } : {}),
            });
        }

        // 6. Notificación push para mensajes entrantes del cliente
        if (!isFromMe && (text.trim() !== "" || isVoice || isNonTextMultimedia)) {
            await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToClient, {
                clientId: client._id,
                title: "Nuevo mensaje de WhatsApp",
                body: isVoice ? "🎤 Nota de voz"
                    : isNonTextMultimedia ? "📎 Contenido multimedia"
                    : (text.length > 100 ? text.slice(0, 97) + "…" : text),
                url: "/panel/mensajes",
            });
        }

        // 7. Disparar IA asíncronamente.
        // Solo si:
        //   - la conversación está ACTIVE y el mensaje no es del operador.
        //   - hay texto para procesar O hay voz transcribible.
        // Para multimedia no-texto: no transcribimos ni razonamos, pero respondemos
        // UNA sola vez con el aviso de blockMultimedia (si está activo) directamente acá.
        const shouldRunAI =
            currentStatus === "ACTIVE" &&
            !isFromMe &&
            (text.trim() !== "" || (transcribeEnabled && !!message.voice));

        if (shouldRunAI) {
            await ctx.scheduler.runAfter(0, api.ai.processMessage, {
                chatId: chatId,
                clientId: client._id,
                channelId: channel._id,
                messageText: text,
                ...(transcribeEnabled && message.voice ? {
                    messageVoice: {
                        id: message.voice.id,
                        mimeType: message.voice.mime_type,
                        seconds: message.voice.seconds,
                        messageId: message.id,
                    },
                } : {}),
            });
        } else if (
            !isFromMe &&
            currentStatus === "ACTIVE" &&
            (isNonTextMultimedia || (isVoice && !transcribeEnabled)) &&
            client.features?.blockMultimedia === true
        ) {
            // Aviso único por mensaje multimedia bloqueado.
            // No tocamos pendingIntent/pendingData del estado de conversación.
            const whapiSvc = new WhapiService({ token: channel.config.whapiToken });
            const blockMsg = "Disculpá, soy un asistente virtual y por ahora solo puedo entender mensajes de texto. Por favor, escribime lo que necesitás y haré lo posible por ayudarte.";
            let sentMessageId = `bot-blocked-${message.id}`;
            try {
                const sent = await whapiSvc.sendMessage(chatId, blockMsg);
                if (sent?.id) sentMessageId = sent.id;
            } catch (err) {
                console.error("Error enviando aviso de multimedia bloqueada:", err);
            }
            await ctx.runMutation(internal.chats.create, {
                channelId: channel._id,
                phone: String(chatId),
                role: "assistant",
                content: blockMsg,
                messageId: sentMessageId,
            });
        }

        return { success: true };
    }
});


/**
 * Manejo de llamadas entrantes de WhatsApp.
 * Llamada desde el webhook de WhatsApp (app/routes/api/webhooks/whapi.ts)
 * DESPUÉS de que el webhook validó la firma HMAC.
 */
export const handleInboundCall = action({
    args: {
        channelId: v.id("channels"),
        call: v.object({
            id: v.string(),
            from: v.string(),
            chat_id: v.string(),
            status: v.union(
                v.literal("initiated"),
                v.literal("ringing"),
                v.literal("answered"),
                v.literal("missed"),
            ),
            timestamp: v.number(),
        })
    },
    handler: async (ctx, { channelId, call }) => {
        const chatId = call.chat_id;
        const currentStatus = call.status;

        // 1. Obtener canal y cliente
        const channel = await ctx.runQuery(api.channels.get, { id: channelId });
        if (!channel || !channel.isActive) return { success: true, note: "Channel inactive or not found" };

        const client = await ctx.runQuery(api.clients.get, { id: channel.client });
        if (!client || !client.isActive) return { success: true, note: "Client inactive" };

        const blockCallsEnabled = (client.features?.blockCalls ?? false) && currentStatus === "initiated";

        // 2. Deduplicación: verificar si el evento de llamada ya fue procesado
        const existing = await ctx.runQuery(api.chats.getByMessageId, { messageId: `call-${call.id}` });
        if (existing) return { success: true, note: "Message already processed" };

        // 3. Rechazo de llamadas entrantes si el cliente tiene blockCalls activo
        const whapiSvc = new WhapiService({ token: channel.config.whapiToken });
        if (blockCallsEnabled) {
            try {
                await whapiSvc.rejectCall(call.id, call.from);
                devug.info(`Llamada ${call.id} de ${chatId} rechazada por configuración de cliente.`);
            } catch (err) {
                devug.error(`Error al rechazar llamada ${call.id}:`, err);
            }
        }

        /*
        // 4. Gestionar estado de conversación (internalMutations)
        const conversationState = await ctx.runQuery(api.conversationStates.getByPhoneAndChannel, { phone: chatId, channelId: channel._id });
        let stateId: Id<"conversation_states"> | undefined = conversationState?._id;

        if (!conversationState) {
            stateId = await ctx.runMutation(internal.conversationStates.create, {
                phone: chatId,
                status: "ACTIVE",
                channel: channel._id
            });
        }

        const conversationStatus = conversationState?.status ?? "ACTIVE";

        // 5. Guardar el evento de llamada en el historial (internalMutation)
        await ctx.runMutation(internal.chats.create, {
            channelId: channel._id,
            phone: String(chatId),
            role: "user",
            content: `[${blockCallsEnabled ? "Llamada bloqueada" : "Llamada entrante"}]`,
            messageId: `call-${call.id}`
        });

        // 6. Aviso por WhatsApp al llamante: este número no recibe llamadas.
        // Usamos internal.chats.create directamente (no saveBotMessage) para no alterar
        // el estado de conversación (pendingIntent/pendingData/pendingUserMessage).
        if (blockCallsEnabled) {
            const blockCallsMsg = "Disculpá, este número no recibe llamadas, sólo mensajes de texto. Si necesitás algo, escribime por acá y te ayudo.";

            let sentMessageId = `bot-local-call-${call.id}`;
            try {
                const whapiResult = await whapiSvc.sendMessage(chatId, blockCallsMsg);
                if (whapiResult?.id) sentMessageId = whapiResult.id;
            } catch (err) {
                devug.error(`Error enviando mensaje de llamada bloqueada a ${chatId}:`, err);
            }

            await ctx.runMutation(internal.chats.create, {
                channelId: channel._id,
                phone: String(chatId),
                role: "assistant",
                content: blockCallsMsg,
                messageId: sentMessageId,
            });
        }

        // 7. Notificación push para llamadas entrantes bloqueadas
        if (blockCallsEnabled && conversationStatus === "ACTIVE") {
            await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToClient, {
                clientId: client._id,
                title: `${blockCallsEnabled ? "Llamada bloqueada" : "Llamada entrante"}`,
                body: `Se ${blockCallsEnabled ? "bloqueó" : "recibió"} una llamada entrante de ${chatId}.`,
                url: "/panel/mensajes",
            });
        }
        */

        return { success: true };

    }
})