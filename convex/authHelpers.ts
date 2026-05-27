import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

type AnyCtx = QueryCtx | MutationCtx;

/**
 * Resuelve el perfil real del caller (sin tener en cuenta impersonación).
 * Lanza un error si no hay sesión activa o si el perfil está inactivo/suspendido.
 */
async function resolveRealProfile(ctx: AnyCtx) {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("No autenticado");

    const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .first();

    if (!profile) throw new Error("Perfil no encontrado");
    if (profile.status === "inactive") throw new Error("Cuenta inactiva");
    if (profile.status === "suspended") throw new Error("Cuenta suspendida");

    return { userId, profile };
}

/**
 * Si el realProfile es admin y tiene una sesión de impersonación activa, retorna
 * el profile objetivo y el id de la sesión. Si no, retorna null.
 */
export async function resolveImpersonationOverride(ctx: AnyCtx, realProfile: Doc<"profiles">) {
    if (realProfile.role !== "admin") return null;

    const session = await ctx.db
        .query("impersonation_sessions")
        .withIndex("by_admin", (q) => q.eq("adminProfileId", realProfile._id))
        .filter((q) => q.eq(q.field("endedAt"), undefined))
        .first();

    if (!session) return null;
    if (session.expiresAt <= Date.now()) return null;

    const target = await ctx.db.get(session.targetProfileId);
    if (!target) return null;
    if (target.status === "inactive" || target.status === "suspended") return null;

    return { profile: target, sessionId: session._id };
}

/**
 * Variante "soft" de requireAuth: no lanza errores. Retorna el perfil efectivo
 * (target durante impersonación) o null si no hay auth válida. Pensada para
 * queries del frontend que pueden ejecutarse antes del login o durante el
 * onboarding (ej. profiles.me, profiles.isAdmin).
 */
export async function tryGetEffectiveProfile(ctx: AnyCtx) {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const realProfile = await ctx.db
        .query("profiles")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .first();
    if (!realProfile) return null;
    if (realProfile.status === "inactive" || realProfile.status === "suspended") return null;

    const override = await resolveImpersonationOverride(ctx, realProfile);
    if (override) return override.profile;
    return realProfile;
}

/**
 * Verifica que el caller está autenticado.
 * Lanza un error si no hay sesión activa.
 * Retorna el userId, el perfil efectivo (target durante impersonación), el perfil real
 * del admin y, si aplica, el id de la sesión de impersonación activa.
 */
export async function requireAuth(ctx: AnyCtx) {
    const { userId, profile: realProfile } = await resolveRealProfile(ctx);
    const override = await resolveImpersonationOverride(ctx, realProfile);

    if (override) {
        return {
            userId,
            profile: override.profile,
            realProfile,
            impersonationSessionId: override.sessionId as Id<"impersonation_sessions">,
        };
    }

    return {
        userId,
        profile: realProfile,
        realProfile,
        impersonationSessionId: null as Id<"impersonation_sessions"> | null,
    };
}

/**
 * Verifica que el caller real es administrador. Esta validación ignora la
 * impersonación a propósito: el realProfile sigue siendo admin, pero las funciones
 * que llaman a requireAdmin son operaciones que solo deben funcionar fuera del
 * modo impersonación. Para impedir el acceso al panel admin durante la
 * impersonación se chequea adicionalmente que NO haya sesión activa.
 */
export async function requireAdmin(ctx: AnyCtx) {
    const { userId, profile: realProfile } = await resolveRealProfile(ctx);
    if (realProfile.role !== "admin") {
        throw new Error("Acceso denegado: se requiere rol administrador");
    }

    const override = await resolveImpersonationOverride(ctx, realProfile);
    if (override) {
        throw new Error("Acceso denegado: hay una sesión de impersonación activa");
    }

    return { userId, profile: realProfile };
}

/**
 * Verifica que el caller es miembro (owner o member) del cliente indicado.
 * Si el caller es admin, se permite igualmente.
 * Lanza un error si no tiene acceso.
 * Retorna el profile efectivo y el registro de membresía (o null si es admin).
 */
export async function requireClientAccess(
    ctx: AnyCtx,
    clientId: Id<"clients">
) {
    const { profile } = await requireAuth(ctx);

    // Los admins (sin impersonación activa) tienen acceso a todos los clientes
    if (profile.role === "admin") return { profile, member: null };

    const member = await ctx.db
        .query("client_members")
        .withIndex("by_client", (q) => q.eq("client", clientId))
        .filter((q) => q.eq(q.field("profile"), profile._id))
        .first();

    if (!member) throw new Error("Acceso denegado: no eres miembro de este cliente");

    return { profile, member };
}

/**
 * Verifica que el caller es owner del cliente indicado.
 * Si el caller es admin, se permite igualmente.
 */
export async function requireClientOwner(
    ctx: AnyCtx,
    clientId: Id<"clients">
) {
    const { profile } = await requireAuth(ctx);

    if (profile.role === "admin") return { profile, member: null };

    const member = await ctx.db
        .query("client_members")
        .withIndex("by_client", (q) => q.eq("client", clientId))
        .filter((q) => q.eq(q.field("profile"), profile._id))
        .first();

    if (!member) throw new Error("Acceso denegado: no eres miembro de este cliente");
    if (member.role !== "owner") throw new Error("Acceso denegado: se requiere rol owner");

    return { profile, member };
}
