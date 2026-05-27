import { internalMutation, mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";

// ── Consultas ─────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los asistentes. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const assistants = await ctx.db.query("assistants").take(100);
        return assistants;
    }
});

/**
 * Semi-pública: retorna un asistente por ID.
 * Usada por el widget de chat (autenticado solo por accessToken del canal).
 * El ID del asistente solo se conoce si ya se tiene acceso al canal.
 */
export const get = query({
    args: {
        id: v.id("assistants")
    },
    handler: async (ctx, { id }) => {
        return await ctx.db.get(id) ?? null;
    }
});

/** Miembro del cliente o admin: retorna asistentes del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("assistants")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Query Interna ─────────────────────────────────────────────────────────────

/** INTERNA: retorna asistentes por clientId sin verificación de auth. */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("assistants")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ────────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: crea un asistente. */
export const create = mutation({
    args: {
        client: v.id("clients"),
        name: v.string(),
        description: v.string(),
        knowledgeBases: v.optional(v.array(v.id("knowledge_bases"))),
        model: v.string(),
        features: v.optional(v.object({
            recognizeContacts: v.optional(v.boolean()),
        })),
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.client);
        const assistantId = await ctx.db.insert("assistants", args);
        return assistantId;
    }
});

/** Miembro del cliente o admin: actualiza un asistente. */
export const update = mutation({
    args: {
        id: v.id("assistants"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        client: v.optional(v.id("clients")),
        knowledgeBases: v.optional(v.array(v.id("knowledge_bases"))),
        model: v.optional(v.string()),
        features: v.optional(v.object({
            recognizeContacts: v.optional(v.boolean()),
        })),
    },
    handler: async (ctx, args) => {
        const assistant = await ctx.db.get(args.id);
        if (!assistant) throw new Error("Asistente no encontrado");
        await requireClientAccess(ctx, assistant.client);
        const { id, ...updateData } = args;
        await ctx.db.patch("assistants", id, updateData);
        return id;
    }
});

/** Miembro del cliente o admin: elimina un asistente y hace soft-delete de sus canales. */
export const remove = mutation({
    args: {
        id: v.id("assistants")
    },
    handler: async (ctx, { id }) => {
        const assistant = await ctx.db.get(id);
        if (!assistant) throw new Error("Asistente no encontrado");
        await requireClientAccess(ctx, assistant.client);

        const channels = await ctx.db
            .query("channels")
            .withIndex("by_assistant", (q) => q.eq("assistant", id))
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();

        const deletedAt = new Date().toLocaleString("es-UY");
        await Promise.all(
            channels.map((ch) => ctx.db.patch("channels", ch._id, { deletedAt, isActive: false }))
        );

        await ctx.db.delete("assistants", id);
        return id;
    }
});
