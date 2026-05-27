import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

const SESSION_DURATION_MS = 60 * 60 * 1000; // 60 minutos
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

type AnyCtx = QueryCtx | MutationCtx;

/**
 * Resuelve el perfil real del caller leyendo directamente del userId del token.
 * No usa requireAuth para evitar la lógica de impersonación: estas funciones
 * deben razonar sobre el admin real, no sobre el target.
 */
async function resolveRealAdminProfile(ctx: AnyCtx): Promise<Doc<"profiles"> | null> {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .first();
    if (!profile) return null;
    if (profile.role !== "admin") return null;
    if (profile.status === "inactive" || profile.status === "suspended") return null;
    return profile;
}

async function findActiveSessionForAdmin(ctx: AnyCtx, adminProfileId: Doc<"profiles">["_id"]) {
    return await ctx.db
        .query("impersonation_sessions")
        .withIndex("by_admin", (q) => q.eq("adminProfileId", adminProfileId))
        .filter((q) => q.eq(q.field("endedAt"), undefined))
        .first();
}

/**
 * Inicia una sesión de impersonación. Solo administradores activos pueden
 * impersonar perfiles con role="user" y status="active". Cierra cualquier
 * sesión preexistente del mismo admin.
 */
export const start = mutation({
    args: { targetProfileId: v.id("profiles") },
    handler: async (ctx, { targetProfileId }) => {
        const realProfile = await resolveRealAdminProfile(ctx);
        if (!realProfile) throw new Error("Acceso denegado: se requiere rol administrador");

        const target = await ctx.db.get(targetProfileId);
        if (!target) throw new Error("Perfil objetivo no encontrado");
        if (target._id === realProfile._id) throw new Error("No podés impersonarte a vos mismo");
        if (target.role !== "user") throw new Error("Solo se puede impersonar perfiles con rol user");
        if (target.status === "inactive" || target.status === "suspended") {
            throw new Error("No se puede impersonar cuentas inactivas o suspendidas");
        }

        const now = Date.now();

        // Cerrar cualquier sesión activa del admin
        const existing = await findActiveSessionForAdmin(ctx, realProfile._id);
        if (existing) {
            await ctx.db.patch(existing._id, { endedAt: now });
        }

        const sessionId = await ctx.db.insert("impersonation_sessions", {
            adminProfileId: realProfile._id,
            targetProfileId: target._id,
            startedAt: now,
            expiresAt: now + SESSION_DURATION_MS,
        });

        return { sessionId, targetProfileId: target._id };
    },
});

/**
 * Termina la sesión de impersonación activa del admin actual, si existe.
 */
export const end = mutation({
    args: {},
    handler: async (ctx) => {
        const realProfile = await resolveRealAdminProfile(ctx);
        if (!realProfile) return { ended: false };

        const session = await findActiveSessionForAdmin(ctx, realProfile._id);
        if (!session) return { ended: false };

        await ctx.db.patch(session._id, { endedAt: Date.now() });
        return { ended: true };
    },
});

/**
 * Retorna la sesión de impersonación activa del admin actual, enriquecida
 * con datos del admin y del target. Si no hay sesión o el caller no es admin,
 * retorna null.
 */
export const getActive = query({
    args: {},
    handler: async (ctx) => {
        const realProfile = await resolveRealAdminProfile(ctx);
        if (!realProfile) return null;

        const session = await findActiveSessionForAdmin(ctx, realProfile._id);
        if (!session) return null;
        if (session.expiresAt <= Date.now()) return null;

        const target = await ctx.db.get(session.targetProfileId);
        if (!target) return null;

        return {
            sessionId: session._id,
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
            adminProfile: {
                _id: realProfile._id,
                name: realProfile.name,
                email: realProfile.email,
                pictureUrl: realProfile.pictureUrl,
            },
            targetProfile: {
                _id: target._id,
                name: target.name,
                email: target.email,
                pictureUrl: target.pictureUrl,
                role: target.role,
                status: target.status,
            },
        };
    },
});

/**
 * Solo admin: devuelve un snapshot completo del cliente asociado a la sesión
 * de impersonación activa. Incluye canales, asistentes, bases de conocimiento
 * (con conteo de chunks), miembros del cliente y conteo de contactos por asistente.
 * Los tokens sensibles (accessToken, whapiToken) se omiten del snapshot.
 */
export const getClientSnapshot = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        const realProfile = await resolveRealAdminProfile(ctx);
        if (!realProfile) throw new Error("Acceso denegado: se requiere rol administrador");

        const client = await ctx.db.get(clientId);
        if (!client) return null;

        // Canales (sin tokens sensibles)
        const rawChannels = await ctx.db
            .query("channels")
            .withIndex("by_client_and_type", (q) => q.eq("client", clientId))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();
        const channels = rawChannels.map(({ config, ...ch }) => ({
            ...ch,
            config: {
                allowedDomains: config.allowedDomains,
                theme: config.theme,
                testMode: config.testMode,
                testPhones: config.testPhones,
                whapiChannelId: config.whapiChannelId,
                whapiApiUrl: config.whapiApiUrl,
                // accessToken y whapiToken omitidos
            },
        }));

        // Asistentes + conteo de contactos por asistente
        const assistants = await ctx.db
            .query("assistants")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();

        const assistantsWithContacts = await Promise.all(
            assistants.map(async (a) => {
                const contacts = await ctx.db
                    .query("contacts")
                    .withIndex("by_assistant", (q) => q.eq("assistantId", a._id))
                    .collect();
                return { ...a, contactsCount: contacts.length };
            })
        );

        // Bases de conocimiento + conteo de chunks
        const kbs = await ctx.db
            .query("knowledge_bases")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();

        const kbsWithChunks = await Promise.all(
            kbs.map(async (kb) => {
                const chunks = await ctx.db
                    .query("knowledge_chunks")
                    .withIndex("by_knowledge_base", (q) => q.eq("knowledgeBase", kb._id))
                    .collect();
                return { ...kb, chunksCount: chunks.length };
            })
        );

        // Miembros del cliente
        const members = await ctx.db
            .query("client_members")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();

        const membersWithProfile = await Promise.all(
            members.map(async (m) => {
                const profile = await ctx.db.get(m.profile);
                return {
                    _id: m._id,
                    role: m.role,
                    profileId: m.profile,
                    name: profile?.name,
                    email: profile?.email,
                };
            })
        );

        return {
            client,
            channels,
            assistants: assistantsWithContacts,
            knowledgeBases: kbsWithChunks,
            members: membersWithProfile,
        };
    },
});

/**
 * INTERNA: limpia sesiones cerradas o vencidas con más de RETENTION_MS de antigüedad.
 * Llamada por el cron diario.
 */
export const purgeOld = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - RETENTION_MS;
        const sessions = await ctx.db.query("impersonation_sessions").collect();
        let deleted = 0;
        for (const s of sessions) {
            const closed = s.endedAt !== undefined ? s.endedAt : s.expiresAt;
            if (closed < cutoff) {
                await ctx.db.delete(s._id);
                deleted++;
            }
        }
        return { deleted };
    },
});
