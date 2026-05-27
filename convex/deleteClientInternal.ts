"use node"

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { DLocalService } from "../lib/services/dlocal.service";
import type { DLocalServiceConfig } from "../lib/services/dlocal.service";
import { WhapiPartnerService } from "../lib/services/whapi.service";
import { api, internal } from "./_generated/api";

/**
 * INTERNA: elimina todos los datos externos e internos de un cliente.
 * Llamada desde el wrapper público (deleteClient.ts) o desde el cron de perfiles vencidos.
 */
export const run = internalAction({
    args: { id: v.id("clients") },
    handler: async (ctx, { id }) => {
        const DLOCALGO_API_URL = process.env.DLOCALGO_API_URL;
        const DLOCALGO_API_KEY = process.env.DLOCALGO_API_KEY;
        const DLOCALGO_SECRET_KEY = process.env.DLOCALGO_SECRET_KEY;
        const WHAPI_PARTNER_API_KEY = process.env.WHAPI_PARTNER_API_KEY;
        if (!DLOCALGO_API_URL || !DLOCALGO_API_KEY || !DLOCALGO_SECRET_KEY || !WHAPI_PARTNER_API_KEY) return { success: false };

        const client = await ctx.runQuery(api.clients.get, { id });
        if (!client) return { success: false };

        // Cancelar suscripción de DLocalGo
        const subscriptionId = Number(client.dlocalGoSubscriptionId);
        if (!isNaN(subscriptionId) && client.plan) {
            const plan = await ctx.runQuery(api.plans.get, { planId: client.plan });
            if (plan) {
                const dlocal = new DLocalService({
                    apiUrl: DLOCALGO_API_URL,
                    apiKey: DLOCALGO_API_KEY,
                    secretKey: DLOCALGO_SECRET_KEY
                } as DLocalServiceConfig);
                await dlocal.cancelPlanSubscription(Number(plan._id), subscriptionId);
            }
        }

        // Canales: borrar chats, estados de conversación, canal en Whapi y registro
        const channels = await ctx.runQuery(api.channels.getByClientAll, { clientId: id });
        const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
        for (const channel of channels) {
            const chats = await ctx.runQuery(internal.chats.getByChannelInternal, { channelId: channel._id });
            for (const chat of chats) {
                await ctx.runMutation(internal.chats.remove, { id: chat._id });
            }

            const conversationStates = await ctx.runQuery(
                internal.conversationStates.getByChannelInternal,
                { channelId: channel._id }
            );
            for (const cs of conversationStates) {
                await ctx.runMutation(internal.conversationStates.removeInternal, { id: cs._id });
            }

            const { whapiChannelId } = channel.config;
            if (whapiChannelId) {
                await whapi.deleteChannel(whapiChannelId);
            }

            await ctx.runMutation(api.channels.permanentDelete, { id: channel._id });
        }

        // Asistentes
        const assistants = await ctx.runQuery(internal.assistants.getByClientInternal, { clientId: id });
        for (const assistant of assistants) {
            await ctx.runMutation(api.assistants.remove, { id: assistant._id });
        }

        // Bases de conocimiento y sus fragmentos.
        // Delegamos al action `_deleteChunks` (batches de 100, cascada a knowledge_embeddings)
        // para no cargar todos los chunks en memoria — bomba si una KB tiene miles.
        const knowledgeBases = await ctx.runQuery(internal.knowledgeBases.getByClientInternal, { clientId: id });
        for (const kb of knowledgeBases) {
            await ctx.runAction(internal.knowledgeBases._deleteChunks, { knowledgeBaseId: kb._id });
            await ctx.runMutation(api.knowledgeBases.remove, { id: kb._id });
        }

        // Leads
        const leads = await ctx.runQuery(internal.leads.getByClientInternal, { clientId: id });
        for (const lead of leads) {
            await ctx.runMutation(internal.leads._remove, { id: lead._id });
        }

        // Órdenes
        const orders = await ctx.runQuery(internal.orders.getByClientInternal, { clientId: id });
        for (const order of orders) {
            await ctx.runMutation(internal.orders.remove, { id: order._id });
        }

        // Citas/turnos
        const appointments = await ctx.runQuery(internal.appointments.getByClientInternal, { clientId: id });
        for (const appointment of appointments) {
            await ctx.runMutation(internal.appointments.remove, { id: appointment._id });
        }

        // Productos
        const products = await ctx.runQuery(internal.products.getByClientInternal, { clientId: id });
        for (const product of products) {
            await ctx.runMutation(api.products.remove, { id: product._id });
        }

        // Miembros
        const members = await ctx.runQuery(internal.clientMembers.getByClientInternal, { clientId: id });
        for (const member of members) {
            await ctx.runMutation(api.clientMembers.remove, { id: member._id });
        }

        // Borrar el cliente (al final)
        await ctx.runMutation(api.clients.remove, { id });

        return { success: true };
    }
});
