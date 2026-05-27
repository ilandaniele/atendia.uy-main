import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalQuery, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { requireAdmin, requireAuth, tryGetEffectiveProfile } from "./authHelpers";

// Queries

/** Solo admin: lista todos los perfiles. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const profiles = await ctx.db
            .query("profiles")
            .order("desc")
            .take(100);

        return profiles;
    }
})

export const getById = query({
    args: { id: v.id("profiles") },
    handler: async (ctx, args) => {
        const profile = await ctx.db.get("profiles", args.id);
        return profile;
    }
})

/** Solo admin: retorna perfil por userId. */
export const getByUserId = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const profile = await ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
            .first();
        return profile;
    }
});

/** Solo admin: retorna perfil por email (evita enumeración de emails). */
export const getByEmail = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const profile = await ctx.db
            .query("profiles")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
        return profile;
    }
});

export const isAdmin = query({
    args: {},
    handler: async (ctx) => {
        const profile = await tryGetEffectiveProfile(ctx);
        return profile?.role === "admin";
    }
});

export const me = query({
    args: {},
    handler: async (ctx) => {
        return await tryGetEffectiveProfile(ctx);
    },
});

export const getTokensBalance = query({
    args: {},
    handler: async (ctx) => {
        const profile = await tryGetEffectiveProfile(ctx);
        if (!profile) return null;
        const clientMember = await ctx.db
            .query("client_members")
            .withIndex("by_profile", (q) => q.eq("profile", profile._id))
            .first();
        if (!clientMember) {
            return null;
        }
        const client = await ctx.db.get("clients", clientMember.client);
        if (!client) {
            return null;
        }
        return client?.tokensBalance ?? 0;
    }
});

// Mutations

export const createMyProfile = mutation({
    args: {
        inviteToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("No autenticado");
        }

        // Leer el registro de usuario gestionado por Convex Auth (tiene email garantizado)
        const authUser = (await ctx.db.get(userId)) as any;
        const email = authUser?.email as string | undefined;

        if (!email) {
            throw new Error("El proveedor de autenticación no proporcionó un correo electrónico.");
        }

        const pictureUrl = authUser?.image as string | undefined;

        // Verificar si ya existe el perfil
        const existing = await ctx.db
            .query("profiles")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            // Bloquear acceso si el perfil está inactivo o suspendido
            const status = existing.status ?? "active";
            if (status === "inactive") {
                throw new Error("Tu cuenta está inactiva. Contactá al administrador para reactivarla.");
            }
            if (status === "suspended") {
                throw new Error("Tu cuenta ha sido suspendida. Contactá al administrador.");
            }

            // Vincular el userId de Google si el perfil fue creado manualmente (userId distinto)
            const updates: Record<string, unknown> = {};
            if (existing.userId !== userId) updates.userId = userId;
            if (pictureUrl && pictureUrl !== existing.pictureUrl) updates.pictureUrl = pictureUrl;
            // Actualizar nombre desde Google si el perfil no tenía uno real
            const googleName = authUser?.name || authUser?.givenName;
            if (googleName && googleName !== existing.name) updates.name = googleName;
            if (existing.scheduledDeletionAt) updates.scheduledDeletionAt = undefined;
            if (Object.keys(updates).length > 0) await ctx.db.patch(existing._id, updates);
            return await ctx.db.get(existing._id);
        }

        // Cuenta nueva: verificar si el registro está permitido
        // Las invitaciones válidas siempre pueden registrarse
        const hasValidInvite = args.inviteToken
            ? (() => {
                return ctx.db
                    .query("invites")
                    .withIndex("by_token", (q) => q.eq("token", args.inviteToken!))
                    .first()
                    .then((invite) => !!(invite && !invite.usedAt && invite.expiresAt > Date.now()));
            })()
            : Promise.resolve(false);
        const inviteValid = await hasValidInvite;

        if (!inviteValid) {
            const sysConfig = await ctx.db.query("system_config").first();
            const allowedRegistration = sysConfig?.allowedRegistration ?? true;
            if (!allowedRegistration) {
                throw new Error("El registro de nuevas cuentas está desactivado temporalmente.");
            }
        }

        const siteUrl = process.env.SITE_URL || "https//atendia.uy";

        const { trialDays } = await ctx.runQuery(api.systemConfig.get);
        if (!trialDays) throw new Error("No se pudo obtener la configuración del sistema");

        const name = authUser?.name || authUser?.givenName || email.split("@")[0];

        const profileId = await ctx.db.insert("profiles", {
            userId,
            name,
            email,
            role: "user",
            pictureUrl,
        });

        await ctx.scheduler.runAfter(0, internal.sengrid.sendWelcomeEmail, { 
            email, 
            name, 
            trialDays,
            siteUrl
        });

        return await ctx.db.get("profiles", profileId);
    }
});

/** Solo admin: crea un perfil manualmente desde el panel de administración. */
export const create = mutation({
    args: {
        name: v.string(),
        email: v.string(),
        role: v.union(
            v.literal("admin"),
            v.literal("user")
        )
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);

        // Crear usuario en la tabla 'users' (Convex Auth)
        const userId = await ctx.db.insert("users", {
            email: args.email,
        });

        // Crear el perfil vinculado
        const profile = await ctx.db.insert("profiles", {
            userId: userId,
            name: args.name,
            email: args.email,
            role: args.role
        });

        return profile;
    }
});

/** Solo admin: actualiza nombre, rol o estado de cualquier perfil. */
export const update = mutation({
    args: {
        id: v.id("profiles"),
        name: v.optional(v.string()),
        role: v.optional(v.union(
            v.literal("admin"),
            v.literal("user")
        )),
        status: v.optional(v.union(
            v.literal("active"),
            v.literal("inactive"),
            v.literal("suspended")
        )),
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const data = Object.fromEntries(Object.entries(args).filter(([key, value]) => key !== "id" && value !== undefined));
        const profile = await ctx.db.patch("profiles", args.id, data);
        return profile;
    }
});

/** Solo admin: elimina un perfil permanentemente. */
export const remove = mutation({
    args: { id: v.id("profiles") },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        return await ctx.db.delete("profiles", args.id);
    }
});

/** Autenticado: actualiza el nombre de su propio perfil. */
export const updateMyName = mutation({
    args: { name: v.string() },
    handler: async (ctx, { name }) => {
        const { profile } = await requireAuth(ctx);
        await ctx.db.patch(profile._id, { name });
        return profile._id;
    }
});

/**
 * Solicita la eliminación de la cuenta. El perfil se elimina permanentemente
 * 90 días después, a menos que el usuario vuelva a iniciar sesión antes.
 * TODO: Configurar un cron job que limpie perfiles con scheduledDeletionAt < Date.now().
 */
export const requestDeletion = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("No autenticado");
        const profile = await ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", userId))
            .first();
        if (!profile) throw new Error("Perfil no encontrado");
        const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
        await ctx.db.patch(profile._id, { scheduledDeletionAt: Date.now() + SIXTY_DAYS_MS });

        // Inactivar el cliente inmediatamente
        const clientMember = await ctx.db
            .query("client_members")
            .withIndex("by_profile", (q) => q.eq("profile", profile._id))
            .first();
        if (clientMember) {
            await ctx.db.patch(clientMember.client, { isActive: false });
            // Limpiar datos operativos inmediatamente (conversaciones, pedidos, turnos)
            await ctx.scheduler.runAfter(0, internal.profiles.cleanupImmediateClientData, {
                clientId: clientMember.client,
            });
        }
    }
});

export const cancelDeletion = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("No autenticado");
        const profile = await ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", userId))
            .first();
        if (!profile) throw new Error("Perfil no encontrado");
        await ctx.db.patch(profile._id, { scheduledDeletionAt: undefined });
    }
});

/**
 * Marca el trial como usado en el perfil para evitar abusos al recrear clientes.
 * Llamar cuando se crea un cliente con trial activo.
 */
/** Autenticado: marca el trial como usado en el propio perfil. */
export const setTrialUsed = mutation({
    args: { id: v.id("profiles") },
    handler: async (ctx, { id }) => {
        const { profile } = await requireAuth(ctx);
        if (profile._id !== id && profile.role !== "admin") {
            throw new Error("Acceso denegado");
        }
        await ctx.db.patch(id, { trialUsedAt: Date.now() });
    }
});

/**
 * Limpia inmediatamente los datos operativos del cliente al solicitar la eliminación:
 * conversaciones (chats), estados de conversación, pedidos y citas/turnos.
 * El resto (canales, asistentes, bases de conocimiento, leads, etc.) se elimina
 * en el cron de los 60 días.
 */
export const cleanupImmediateClientData = internalAction({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        const channels = await ctx.runQuery(api.channels.getByClientAll, { clientId });

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
        }

        const orders = await ctx.runQuery(internal.orders.getByClientInternal, { clientId });
        for (const order of orders) {
            await ctx.runMutation(internal.orders.remove, { id: order._id });
        }

        const appointments = await ctx.runQuery(internal.appointments.getByClientInternal, { clientId });
        for (const appointment of appointments) {
            await ctx.runMutation(internal.appointments.remove, { id: appointment._id });
        }
    }
});

/**
 * INTERNA: elimina un perfil sin verificación de auth.
 * Solo llamable desde deleteExpiredProfiles (internalAction).
 */
export const removeInternal = internalMutation({
    args: { id: v.id("profiles") },
    handler: async (ctx, args) => {
        return await ctx.db.delete("profiles", args.id);
    }
});

/**
 * Retorna todos los perfiles cuya fecha de eliminación ya venció.
 */
/**
 * INTERNA: retorna un perfil por ID sin verificación de auth.
 * Usado por crons de facturación para obtener datos del owner.
 */
export const getOwnerProfileInternal = internalQuery({
    args: { profileId: v.id("profiles") },
    handler: async (ctx, { profileId }) => {
        return await ctx.db.get("profiles", profileId);
    },
});

/** INTERNA: busca un perfil por email sin verificación de auth. Usado por webhooks y crons. */
export const getByEmailInternal = internalQuery({
    args: { email: v.string() },
    handler: async (ctx, { email }) => {
        return await ctx.db
            .query("profiles")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();
    },
});

export const getExpiredProfiles = internalQuery({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const profiles = await ctx.db.query("profiles").collect();
        return profiles.filter(
            (p) => p.scheduledDeletionAt !== undefined && p.scheduledDeletionAt <= now
        );
    }
});

/**
 * Elimina permanentemente los perfiles vencidos y todos sus datos asociados.
 * Llamado por el cron diario.
 */
export const deleteExpiredProfiles = internalAction({
    args: {},
    handler: async (ctx) => {
        const expired = await ctx.runQuery(internal.profiles.getExpiredProfiles);

        for (const profile of expired) {
            // Obtener el client_member del perfil para encontrar su cliente
            const clientMembers = await ctx.runQuery(api.clientMembers.getByProfile, {
                profileId: profile._id,
            });

            for (const member of clientMembers) {
                // Borrar el cliente con toda su información relacionada
                await ctx.runAction(internal.deleteClientInternal.run, {
                    id: member.client,
                });
            }

            // Borrar el perfil
            await ctx.runMutation(internal.profiles.removeInternal, { id: profile._id });
        }
    }
});
