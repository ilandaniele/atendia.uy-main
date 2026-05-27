import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin, requireClientAccess, requireClientOwner } from "./authHelpers";

// ── Consultas ────────────────────────────────────────────────────────────────

/** Solo admin: lista todas las membresías. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const clientMembers = await ctx.db.query("client_members").take(100);
        return clientMembers;
    }
});

/** Solo admin: retorna una membresía por ID. */
export const get = query({
    args: {
        id: v.id("client_members")
    },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        return await ctx.db.get("client_members", id);
    }
});

/** Miembro del cliente o admin: lista los miembros del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("client_members")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

/**
 * Semi-pública: retorna membresías por profileId.
 * Usada desde el webhook dLocal (sin sesión) y por el propio usuario para saber
 * a qué clientes pertenece. Se valida que el caller sea el propio perfil o admin.
 */
export const getByProfile = query({
    args: {
        profileId: v.id("profiles")
    },
    handler: async (ctx, { profileId }) => {
        // Permitir si no hay sesión (caso webhook dLocal — ya verificó HMAC)
        // Permitir si el caller es admin
        // Permitir si el caller es el propio perfil
        const userId = await getAuthUserId(ctx);
        if (userId) {
            const callerProfile = await ctx.db
                .query("profiles")
                .withIndex("by_user_id", (q) => q.eq("userId", userId))
                .first();
            if (callerProfile && callerProfile.role !== "admin" && callerProfile._id !== profileId) {
                throw new Error("Acceso denegado");
            }
        }
        // Sin userId: viene de webhook (acepted — el webhook valida HMAC)
        return await ctx.db
            .query("client_members")
            .withIndex("by_profile", (q) => q.eq("profile", profileId))
            .collect();
    }
});

/** Miembro del cliente o admin: retorna miembros con datos de perfil resueltos. */
export const getMembersWithProfiles = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        const members = await ctx.db
            .query("client_members")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();

        return Promise.all(
            members.map(async (member) => {
                const profile = await ctx.db.get(member.profile);
                return { ...member, profile };
            })
        );
    },
});

/** INTERNA: retorna miembros por clientId sin verificación de auth. */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("client_members")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ───────────────────────────────────────────────────────────────

/** Owner del cliente o admin: agrega un miembro al cliente. */
export const create = mutation({
    args: {
        client: v.id("clients"),
        profile: v.id("profiles"),
        role: v.union(
            v.literal("owner"),
            v.literal("member")
        )
    },
    handler: async (ctx, args) => {
        await requireClientOwner(ctx, args.client);
        const memberId = await ctx.db.insert("client_members", args);
        return memberId;
    }
});

/** Owner del cliente o admin: actualiza el rol de un miembro. */
export const update = mutation({
    args: {
        id: v.id("client_members"),
        client: v.optional(v.id("clients")),
        profile: v.optional(v.id("profiles")),
        role: v.optional(v.union(
            v.literal("owner"),
            v.literal("member")
        ))
    },
    handler: async (ctx, args) => {
        const member = await ctx.db.get("client_members", args.id);
        if (!member) throw new Error("Membresía no encontrada");
        await requireClientOwner(ctx, member.client);
        const { id, ...updateData } = args;
        await ctx.db.patch("client_members", id, updateData);
        return id;
    }
});

/** Owner del cliente o admin: elimina un miembro del cliente. */
export const remove = mutation({
    args: {
        id: v.id("client_members")
    },
    handler: async (ctx, { id }) => {
        const member = await ctx.db.get("client_members", id);
        if (!member) throw new Error("Membresía no encontrada");
        await requireClientOwner(ctx, member.client);
        await ctx.db.delete("client_members", id);
        return id;
    }
});
