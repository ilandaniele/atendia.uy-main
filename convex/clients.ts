import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireAuth, requireClientAccess, requireClientOwner } from "./authHelpers";

// Función auxiliar para generar tokens (simple)
function generateToken() {
    return crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
}

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los clientes */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const clients = await ctx.db.query("clients").take(100);
        return clients;
    }
});

/**
 * Pública: retorna un cliente por ID.
 * Usada por el widget de chat (autenticado solo por accessToken del canal)
 * y por el panel de usuario (tras verificar membresía en el layout).
 */
export const get = query({
    args: {
        id: v.id("clients")
    },
    handler: async (ctx, { id }) => {
        const client = await ctx.db.get("clients", id);
        return client;
    }
});

/** Solo admin: busca cliente por nombre interno */
export const getByName = query({
    args: { name: v.string() },
    handler: async (ctx, { name }) => {
        await requireAdmin(ctx);
        return await ctx.db
            .query("clients")
            .withIndex("by_name", q => q.eq("name", name))
            .first();
    }
});

/** Autenticado: verifica si un nombre de negocio ya está en uso (onboarding). */
export const getByBusinessName = query({
    args: { businessName: v.string() },
    handler: async (ctx, { businessName }) => {
        await requireAuth(ctx);
        const client = await ctx.db
            .query("clients")
            .withIndex("by_business_name", (q) => q.eq("businessName", businessName))
            .first();
        // Solo retornar si existe (no exponer datos del cliente ajeno)
        return client ? { exists: true } : null;
    }
});

/**
 * Semi-pública: busca cliente por subscriptionId de dLocal.
 * Usada desde el webhook de pagos (sin sesión de usuario).
 * El webhook ya valida HMAC, por lo que esta exposición es aceptable.
 */
export const getBySubscriptionId = query({
    args: { subscriptionId: v.string() },
    handler: async (ctx, { subscriptionId }) => {
        return await ctx.db
            .query("clients")
            .withIndex("by_subscription", (q) => q.eq("dlocalGoSubscriptionId", subscriptionId))
            .first();
    }
});

/**
 * Autenticado: retorna el estado del onboarding del usuario actual.
 * - "fresh":       no tiene cliente → mostrar onboarding completo
 * - "needsChannel": tiene cliente pero el canal no está conectado → reanudar paso 3
 * - "complete":    canal conectado → acceso normal al panel
 */
export const getOnboardingStatus = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;

        const profile = await ctx.db
            .query("profiles")
            .withIndex("by_user_id", q => q.eq("userId", userId))
            .first();
        if (!profile) return null;

        const clientMember = await ctx.db
            .query("client_members")
            .withIndex("by_profile", q => q.eq("profile", profile._id))
            .first();

        if (!clientMember) return { status: "fresh" as const };

        // Si ya tiene un asistente, el onboarding fue completado — no volver a mostrarlo
        const assistant = await ctx.db
            .query("assistants")
            .withIndex("by_client", q => q.eq("client", clientMember.client))
            .first();

        if (assistant) return { status: "complete" as const };

        const channel = await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", q => q.eq("client", clientMember.client))
            .filter(q => q.eq(q.field("deletedAt"), undefined))
            .first();

        if (!channel) return { status: "fresh" as const };

        if (channel.status === "connected") {
            return { status: "complete" as const };
        }

        // Canal pendiente y sin asistente → usuario en medio del onboarding inicial
        const kb = await ctx.db
            .query("knowledge_bases")
            .withIndex("by_client", q => q.eq("client", clientMember.client))
            .first();

        const config = channel.config as Record<string, string | undefined>;
        return {
            status: "needsChannel" as const,
            clientId: clientMember.client,
            channelId: channel._id,
            channelType: channel.type as "web" | "whatsapp",
            webToken: config?.accessToken,
            whapiToken: config?.whapiToken,
            whapiApiUrl: config?.whapiApiUrl,
            kbId: kb?._id,
        };
    },
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Autenticado: crea el cliente inicial del usuario (onboarding propio). */
export const onboard = mutation({
    args: {
        name: v.string(),
        businessName: v.string(),
        timezone: v.string(),
        isActive: v.boolean(),
        features: v.object({
            enableAgenda: v.boolean(),
            enableOrders: v.boolean(),
        }),
        tokensBalance: v.number(),
        dlocalGoSubscriptionId: v.optional(v.string()),
        trialEndsAt: v.optional(v.number()),
        assistantConfig: v.optional(v.object({
            name: v.string(),
            description: v.string(),
            model: v.string(),
        })),
        kbConfig: v.optional(v.object({
            name: v.string(),
            description: v.optional(v.string()),
        })),
        channelType: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // El perfil del caller es quien se convierte en owner
        const { profile } = await requireAuth(ctx);

        // Idempotencia: si ya tiene un cliente, no crear otro
        const existingMember = await ctx.db
            .query("client_members")
            .withIndex("by_profile", q => q.eq("profile", profile._id))
            .first();
        if (existingMember) {
            throw new Error("Ya tenés un espacio de trabajo configurado. Recargá la página.");
        }

        // 1. Crear el Cliente
        const clientId = await ctx.db.insert("clients", {
            name: args.name,
            businessName: args.businessName,
            timezone: args.timezone,
            isActive: args.isActive,
            updatedBy: profile._id,
            config: {},
            features: args.features,
            tokensBalance: args.tokensBalance,
            dlocalGoSubscriptionId: args.dlocalGoSubscriptionId,
            trialEndsAt: args.trialEndsAt,
        });

        // 2. Crear una Base de Conocimiento
        const kbId = await ctx.db.insert("knowledge_bases", {
            client: clientId,
            name: args.kbConfig?.name || "Principal",
            description: args.kbConfig?.description || "Base de conocimiento general creada automáticamente",
        });

        // 3. Crear un Asistente conectado a esa KB
        const assistantId = await ctx.db.insert("assistants", {
            client: clientId,
            knowledgeBases: [kbId],
            name: args.assistantConfig?.name || "Asistente Virtual",
            description: args.assistantConfig?.description || "Asistente principal para atención al cliente",
            model: args.assistantConfig?.model || "gemini-2.5-flash",
        });

        // 4. Crear el Canal inicial (Web por defecto) y generar el TOKEN
        const selectedChannelType = args.channelType || "web";
        const webToken = generateToken();

        const channelId = await ctx.db.insert("channels", {
            client: clientId,
            assistant: assistantId,
            type: selectedChannelType,
            name: selectedChannelType === "web" ? "Widget Web" : "WhatsApp",
            isActive: true,
            status: "pending",
            config: selectedChannelType === "web" ? {
                accessToken: webToken,
                allowedDomains: [],
                theme: {
                    primaryColor: "#0ea5e9",
                    position: "bottom-right"
                }
            } : {}
        });

        // 5. Vincular al caller como OWNER del cliente
        await ctx.db.insert("client_members", {
            client: clientId,
            profile: profile._id,
            role: "owner"
        });

        return {
            clientId,
            channelId,
            kbId,
            webToken: selectedChannelType === "web" ? webToken : undefined,
        };
    },
});

/** Solo admin: crea un cliente desde el panel de administración. */
export const create = mutation({
    args: {
        name: v.string(),
        businessName: v.string(),
        config: v.object({
            googleCalendarId: v.optional(v.string()),
            googleRefreshToken: v.optional(v.string()),
            appointmentReminderHours: v.optional(v.number()),
            outOfHoursOrderPolicy: v.optional(v.union(
                v.literal("reject"),
                v.literal("accept_next_day")
            )),
            businessHours: v.optional(v.array(v.object({
                day: v.number(),
                isOpen: v.boolean(),
                openTime: v.string(),
                closeTime: v.string(),
            }))),
            currency: v.optional(v.string()),
        }),
        features: v.object({
            enableAgenda: v.boolean(),
            enableOrders: v.boolean(),
            allowCancelAppointments: v.optional(v.boolean()),
            allowModifyAppointments: v.optional(v.boolean()),
            allowCancelOrders: v.optional(v.boolean()),
            minHoursBeforeEdit: v.optional(v.number()),
            blockMultimedia: v.optional(v.boolean()),
            blockCalls: v.optional(v.boolean()),
            transcribeAudio: v.optional(v.boolean()),
        }),
        isActive: v.boolean(),
        timezone: v.string(),
        plan: v.id("plans"),
        tokensBalance: v.number(),
        dlocalGoSubscriptionId: v.optional(v.string()),
        trialEndsAt: v.optional(v.number()),
        updatedBy: v.id("profiles")
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const clientId = await ctx.db.insert("clients", args);
        return clientId;
    }
});

/** Admin o owner del cliente: actualiza datos del cliente. */
export const update = mutation({
    args: {
        id: v.id("clients"),
        name: v.optional(v.string()),
        businessName: v.optional(v.string()),
        config: v.optional(v.object({
            googleCalendarId: v.optional(v.string()),
            googleRefreshToken: v.optional(v.string()),
            appointmentReminderHours: v.optional(v.number()),
            outOfHoursOrderPolicy: v.optional(v.union(
                v.literal("reject"),
                v.literal("accept_next_day")
            )),
            businessHours: v.optional(v.array(v.object({
                day: v.number(),
                isOpen: v.boolean(),
                openTime: v.string(),
                closeTime: v.string(),
            }))),
            currency: v.optional(v.string()),
        })),
        features: v.optional(v.object({
            enableAgenda: v.boolean(),
            enableOrders: v.boolean(),
            allowCancelAppointments: v.optional(v.boolean()),
            allowModifyAppointments: v.optional(v.boolean()),
            allowCancelOrders: v.optional(v.boolean()),
            minHoursBeforeEdit: v.optional(v.number()),
            notifyOrderConfirmed: v.optional(v.boolean()),
            notifyOrderShipped: v.optional(v.boolean()),
            autoSaveContacts: v.optional(v.boolean()),
            blockMultimedia: v.optional(v.boolean()),
            blockCalls: v.optional(v.boolean()),
            transcribeAudio: v.optional(v.boolean()),
        })),
        isActive: v.optional(v.boolean()),
        timezone: v.optional(v.string()),
        plan: v.optional(v.id("plans")),
        tokensBalance: v.optional(v.number()),
        dlocalGoSubscriptionId: v.optional(v.string()),
        webhooks: v.optional(v.array(v.object({
            id: v.string(),
            name: v.string(),
            url: v.string(),
            secret: v.optional(v.string()),
            events: v.array(v.string()),
            enabled: v.boolean(),
        }))),
        updatedBy: v.id("profiles")
    },
    handler: async (ctx, args) => {
        const { profile } = await requireAuth(ctx);

        // plan y tokensBalance solo pueden ser modificados por admin
        // isActive puede ser modificado por el owner, salvo que el sistema lo haya bloqueado
        if (profile.role !== "admin") {
            if (args.plan !== undefined || args.tokensBalance !== undefined) {
                throw new Error("Acceso denegado: solo el administrador puede modificar estos campos");
            }
            await requireClientOwner(ctx, args.id);
            if (args.isActive === true) {
                const current = await ctx.db.get("clients", args.id);
                if (current?.lockedInactive) {
                    throw new Error("Acceso denegado: la cuenta fue desactivada por el sistema y no puede reactivarse desde aquí");
                }
            }
        }

        const { id, ...updateData } = args;
        await ctx.db.patch("clients", id, updateData);
        return id;
    }
});

/**
 * Solo admin: elimina un cliente y dispara la cascada async batched para
 * todos sus recursos.
 *
 * El path "oficial" desde la UI es `deleteClient.deleteClientExternalData`,
 * que orquesta limpiezas externas (dLocal, Whapi) antes de llegar acá.
 * Para cuando esta mutation se ejecuta, casi todos los recursos ya fueron
 * borrados; lo que queda lo limpiamos paginando para no romper el límite
 * de 16 MB por invocación cuando una KB con miles de chunks aún existiera.
 */
export const remove = mutation({
    args: {
        id: v.id("clients")
    },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);

        // Assistants — tabla chica por cliente, safe inline.
        const assistants = await ctx.db
            .query("assistants")
            .withIndex("by_client", (q) => q.eq("client", id))
            .collect();
        for (const assistant of assistants) {
            await ctx.db.delete(assistant._id);
        }

        // KBs: por cada una, agendamos la limpieza batched de sus chunks
        // (ya cascadea a knowledge_embeddings). Borramos el doc de la KB sync.
        const knowledgeBases = await ctx.db
            .query("knowledge_bases")
            .withIndex("by_client", (q) => q.eq("client", id))
            .collect();
        for (const kb of knowledgeBases) {
            await ctx.scheduler.runAfter(0, internal.knowledgeBases._deleteChunks, {
                knowledgeBaseId: kb._id,
            });
            await ctx.db.delete(kb._id);
        }

        // Channels: soft-delete (tabla chica por cliente).
        const channels = await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", id))
            .collect();
        for (const channel of channels) {
            const now = new Date();
            await ctx.db.patch(channel._id, { deletedAt: now.toLocaleString("es-UY") });
        }

        // Members.
        const members = await ctx.db
            .query("client_members")
            .withIndex("by_client", (q) => q.eq("client", id))
            .collect();
        for (const member of members) {
            await ctx.db.delete(member._id);
        }

        await ctx.db.delete(id);
        return id;
    }
});

/**
 * INTERNA: vincula una suscripción de dLocal a un cliente.
 * Solo llamable desde la acción handleWebhookPayment (billing).
 */
export const activateSubscription = internalMutation({
    args: {
        clientId: v.id("clients"),
        planId: v.id("plans"),
        dlocalGoSubscriptionId: v.string(),
    },
    handler: async (ctx, { clientId, planId, dlocalGoSubscriptionId }) => {
        await ctx.db.patch(clientId, {
            plan: planId,
            dlocalGoSubscriptionId,
            trialEndsAt: undefined,
        });
    }
});

/** Solo admin: asigna un plan manualmente a un cliente y acredita sus tokens. Crea una factura PAID para que quede registrada en la sección de facturación del cliente. */
export const adminAssignPlan = mutation({
    args: {
        clientId: v.id("clients"),
        planId: v.id("plans"),
    },
    handler: async (ctx, { clientId, planId }) => {
        await requireAdmin(ctx);
        const client = await ctx.db.get("clients", clientId);
        if (!client) throw new Error("Cliente no encontrado");
        const plan = await ctx.db.get("plans", planId);
        if (!plan) throw new Error("Plan no encontrado");

        await ctx.db.patch(clientId, {
            plan: planId,
            trialEndsAt: undefined,
            tokensBalance: plan.tokens,
        });

        await ctx.db.insert("invoices", {
            plan: planId,
            orderId: `ADMIN-${clientId}-${Date.now()}`,
            status: "PAID",
            client: clientId,
        });

        return client.tokensBalance + plan.tokens;
    },
});

/** Solo admin: acredita tokens adicionales al balance de un cliente (regalo/ajuste manual). */
export const giftTokens = mutation({
    args: {
        clientId: v.id("clients"),
        amount: v.number(),
    },
    handler: async (ctx, { clientId, amount }) => {
        await requireAdmin(ctx);
        const client = await ctx.db.get("clients", clientId);
        if (!client) throw new Error("Cliente no encontrado");
        await ctx.db.patch("clients", clientId, { tokensBalance: client.tokensBalance + amount });
        return client.tokensBalance + amount;
    },
});

/** Solo admin: extiende el período de prueba del cliente en `days` días. Si no había trial activo, lo inicia desde ahora. */
export const extendTrial = mutation({
    args: {
        clientId: v.id("clients"),
        days: v.number(),
    },
    handler: async (ctx, { clientId, days }) => {
        await requireAdmin(ctx);
        if (!Number.isFinite(days) || days <= 0) {
            throw new Error("La cantidad de días debe ser mayor a 0");
        }
        const client = await ctx.db.get("clients", clientId);
        if (!client) throw new Error("Cliente no encontrado");
        if (client.plan) {
            throw new Error("El cliente tiene un plan activo: no se puede extender el trial");
        }
        const now = Date.now();
        const base = client.trialEndsAt && client.trialEndsAt > now ? client.trialEndsAt : now;
        const newTrialEndsAt = base + days * 24 * 60 * 60 * 1000;
        await ctx.db.patch("clients", clientId, {
            trialEndsAt: newTrialEndsAt,
            isActive: true,
            lockedInactive: false,
        });
        return newTrialEndsAt;
    },
});

/**
 * INTERNA: acredita tokens al balance de un cliente.
 * Solo llamable desde la acción handleWebhookPayment (billing).
 */
export const addTokens = internalMutation({
    args: {
        clientId: v.id("clients"),
        amount: v.number(),
    },
    handler: async (ctx, args) => {
        const { amount, clientId } = args;
        const client = await ctx.db.get("clients", clientId);
        if (!client) return null;

        const { tokensBalance } = client;
        return ctx.db.patch(
            "clients",
            clientId,
            { tokensBalance: tokensBalance + amount }
        );
    }
});

/**
 * INTERNA: retorna todos los clientes activos que tienen un trial configurado.
 * Usado por los crons de facturación para detectar trials terminando/expirados.
 */
export const getActiveTrialClientsInternal = internalQuery({
    args: {},
    handler: async (ctx) => {
        const clients = await ctx.db.query("clients").collect();
        return clients.filter((c) => c.isActive && c.trialEndsAt !== undefined);
    },
});

/**
 * INTERNA: retorna todos los clientes activos que tienen suscripción de pago (plan vinculado).
 * Usado por el cron de verificación de canales Whapi.
 */
export const getSubscribedClientsInternal = internalQuery({
    args: {},
    handler: async (ctx) => {
        const clients = await ctx.db.query("clients").collect();
        return clients.filter(
            (c) => c.isActive && c.plan !== undefined
        );
    },
});

/**
 * INTERNA: elimina el plan y la suscripción de dLocal de un cliente.
 * Llamada desde billing.cancelSubscription tras cancelar en dLocal Go.
 */
export const removeSubscription = internalMutation({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await ctx.db.patch(clientId, {
            plan: undefined,
            dlocalGoSubscriptionId: undefined,
        });
    },
});

/**
 * INTERNA: desactiva un cliente (isActive = false).
 * Usado por el cron de trial expirado.
 */
export const deactivateInternal = internalMutation({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await ctx.db.patch(clientId, { isActive: false, lockedInactive: true });
    },
});


/** INTERNA: retorna el balance de tokens de un cliente. */
export const getTokenBalanceInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        const client = await ctx.db.get(clientId);
        return client?.tokensBalance ?? 0;
    },
});
