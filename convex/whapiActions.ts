import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const generatePairingCode = action({
    args: {
        phoneNumber: v.string(),
        channelId: v.id("channels"),
    },
    handler: async (ctx, args) => {
        const channel: any = await ctx.runQuery(api.channels.get, { id: args.channelId });
        if (!channel?.config?.whapiToken) {
            throw new Error("Canal no encontrado o sin configuración de WhatsApp.");
        }

        const token: string = channel.config.whapiToken;
        const apiUrl: string = channel.config.whapiApiUrl || "https://gate.whapi.cloud";
        const cleanPhone = args.phoneNumber.replace(/[^0-9]/g, "");

        const res = await fetch(`${apiUrl}/users/login/${cleanPhone}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({})) as Record<string, any>;
            throw new Error(
                data?.error?.message ||
                data?.message ||
                "No se pudo generar el código. Verificá el número e intentá de nuevo."
            );
        }

        const data = await res.json() as Record<string, any>;
        if (!data?.code) {
            throw new Error("No se recibió el código. Verificá el número e intentá de nuevo.");
        }

        return { code: data.code as string };
    },
});

export const sendMessage = action({
    args: {
        channelId: v.id("channels"),
        phone: v.string(),
        content: v.string()
    },
    handler: async (ctx, args) => {
        const channel: any = await ctx.runQuery(api.channels.get, { id: args.channelId });
        if (!channel || !channel.config || !channel.config.whapiToken) {
            throw new Error("Canal no encontrado o sin configuración de Whapi");
        }

        const token = channel.config.whapiToken;
        const apiUrl: string = channel.config.whapiApiUrl || "https://gate.whapi.cloud";
        const chatId = args.phone; // Usar el ID original (ej: 59899344948@s.whatsapp.net) para mantener consistencia con el webhook

        const res: Response = await fetch(`${apiUrl}/messages/text`, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                to: chatId,
                body: args.content,
                typing_time: 0
            })
        });

        if (!res.ok) {
            console.error("Whapi error:", await res.text());
            throw new Error(`Error en Whapi: ${res.statusText}`);
        }

        const data: any = await res.json();

        await ctx.runMutation(internal.chats.create, {
            channelId: args.channelId,
            phone: chatId,
            role: "system",
            content: args.content,
            messageId: data.message?.id || crypto.randomUUID()
        });

        // Pausar la IA: el operador tomó el control desde el panel.
        const convState = await ctx.runQuery(api.conversationStates.getByPhoneAndChannel, {
            phone: chatId,
            channelId: args.channelId,
        });
        if (convState && convState.status === "ACTIVE") {
            await ctx.runMutation(internal.conversationStates.updateInternal, {
                id: convState._id,
                status: "PAUSED",
            });
        }

        return { success: true, messageId: data.message?.id };
    }
});