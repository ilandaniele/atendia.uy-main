import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireClientAccess, requireClientOwner } from "./authHelpers";
import { internal } from "./_generated/api";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 horas

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Pública: devuelve nombre del cliente para mostrar en el banner de login. Sin datos sensibles. */
export const getPublicInfo = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const invite = await ctx.db
            .query("invites")
            .withIndex("by_token", (q) => q.eq("token", token))
            .first();

        if (!invite || invite.usedAt || invite.expiresAt < Date.now()) return null;

        const client = await ctx.db.get(invite.client);
        return { clientName: client?.name ?? "una empresa" };
    },
});

/** Owner del cliente o admin: lista las invitaciones del cliente. */
export const listByClient = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return ctx.db
            .query("invites")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Owner del cliente o admin: crea una nueva invitación con token único y TTL de 48 h. */
export const create = mutation({
    args: {
        clientId: v.id("clients"),
        inviteeEmail: v.string(),
    },
    handler: async (ctx, { clientId, inviteeEmail }) => {
        const { profile: ownerProfile } = await requireClientOwner(ctx, clientId);

        // Verificar si el email ya pertenece a un miembro del cliente
        const existingProfile = await ctx.db
            .query("profiles")
            .withIndex("by_email", (q) => q.eq("email", inviteeEmail))
            .first();
        if (existingProfile) {
            const existingMember = await ctx.db
                .query("client_members")
                .withIndex("by_client", (q) => q.eq("client", clientId))
                .filter((q) => q.eq(q.field("profile"), existingProfile._id))
                .first();
            if (existingMember) {
                throw new Error("ALREADY_MEMBER");
            }
        }

        // Verificar si ya existe una invitación pendiente para este email
        const pendingInvites = await ctx.db
            .query("invites")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .filter((q) => q.eq(q.field("inviteeEmail"), inviteeEmail))
            .collect();
        const hasPending = pendingInvites.some((inv) => !inv.usedAt && inv.expiresAt > Date.now());
        if (hasPending) {
            throw new Error("ALREADY_INVITED");
        }

        const token = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
        const expiresAt = Date.now() + INVITE_TTL_MS;
        const id = await ctx.db.insert("invites", { token, client: clientId, inviteeEmail, expiresAt });

        // Enviar email de invitación de forma asíncrona; si falla no interrumpe la mutación
        const client = await ctx.db.get(clientId);
        const siteUrl = process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? "https://atendia.uy";
        const inviteUrl = `${siteUrl}/ingreso?invite=${token}`;
        await ctx.scheduler.runAfter(0, internal.sengrid.sendTeamInvite, {
            email: inviteeEmail,
            inviterName: ownerProfile.name,
            businessName: client?.businessName ?? client?.name ?? "",
            inviteUrl,
        });

        return { id, token };
    },
});

/**
 * Autenticado: consume un token válido.
 * Crea el client_member y marca la invitación como usada.
 * Idempotente: si el perfil ya es miembro, solo marca el token como usado.
 */
export const consume = mutation({
    args: {
        token: v.string(),
        profileId: v.id("profiles"),
    },
    handler: async (ctx, { token, profileId }) => {
        await requireAuth(ctx);
        const invite = await ctx.db
            .query("invites")
            .withIndex("by_token", (q) => q.eq("token", token))
            .first();

        if (!invite) throw new Error("Invitación no encontrada.");
        if (invite.usedAt) throw new Error("La invitación ya fue utilizada.");
        if (invite.expiresAt < Date.now()) throw new Error("La invitación ha expirado.");

        const existing = await ctx.db
            .query("client_members")
            .withIndex("by_profile", (q) => q.eq("profile", profileId))
            .first();

        if (!existing) {
            await ctx.db.insert("client_members", {
                client: invite.client,
                profile: profileId,
                role: "member",
            });
        }

        await ctx.db.patch(invite._id, { usedAt: Date.now(), usedBy: profileId });

        return { clientId: invite.client };
    },
});

/** Owner del cliente o admin: revoca (elimina) una invitación pendiente. */
export const remove = mutation({
    args: { id: v.id("invites") },
    handler: async (ctx, { id }) => {
        const invite = await ctx.db.get(id);
        if (!invite) throw new Error("Invitación no encontrada");
        await requireClientOwner(ctx, invite.client);
        await ctx.db.delete(id);
    },
});
