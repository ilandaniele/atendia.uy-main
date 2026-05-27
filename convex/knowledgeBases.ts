import { mutation, query, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin, requireClientAccess } from "./authHelpers";

// ── Consultas ─────────────────────────────────────────────────────────────────

/** Solo admin: lista todas las bases de conocimiento. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const kbs = await ctx.db.query("knowledge_bases").take(100);
        return kbs;
    }
});

/** Miembro del cliente o admin: retorna una KB por ID. */
export const get = query({
    args: {
        id: v.id("knowledge_bases")
    },
    handler: async (ctx, { id }) => {
        const kb = await ctx.db.get(id);
        if (!kb) return null;
        await requireClientAccess(ctx, kb.client);
        return kb;
    }
});

/** Miembro del cliente o admin: retorna KBs del cliente. */
export const getByClient = query({
    args: {
        clientId: v.id("clients")
    },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return await ctx.db
            .query("knowledge_bases")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Query Interna ─────────────────────────────────────────────────────────────

/** INTERNA: retorna KBs por clientId sin verificación de auth. */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return await ctx.db
            .query("knowledge_bases")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ────────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: crea una KB. */
export const create = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        client: v.id("clients")
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.client);
        const kbId = await ctx.db.insert("knowledge_bases", args);
        return kbId;
    }
});

/** Miembro del cliente o admin: actualiza una KB. */
export const update = mutation({
    args: {
        id: v.id("knowledge_bases"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        client: v.optional(v.id("clients"))
    },
    handler: async (ctx, args) => {
        const kb = await ctx.db.get(args.id);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);
        const { id, ...updateData } = args;
        await ctx.db.patch("knowledge_bases", id, updateData);
        return id;
    }
});

/** Miembro del cliente o admin: elimina una KB y agenda la limpieza asíncrona de sus chunks. */
export const remove = mutation({
    args: {
        id: v.id("knowledge_bases")
    },
    handler: async (ctx, { id }) => {
        const kb = await ctx.db.get(id);
        if (!kb) throw new Error("Base de conocimiento no encontrada");
        await requireClientAccess(ctx, kb.client);
        await ctx.db.delete(id);
        await ctx.scheduler.runAfter(0, internal.knowledgeBases._deleteChunks, { knowledgeBaseId: id });
        return id;
    }
});

// ── Eliminación asíncrona de chunks ──────────────────────────────────────────

/** INTERNA: elimina hasta 100 chunks de una KB (y sus embeddings). Retorna true si quedan más. */
export const _deleteChunksBatch = internalMutation({
    args: { knowledgeBaseId: v.id("knowledge_bases") },
    handler: async (ctx, { knowledgeBaseId }) => {
        const batch = await ctx.db
            .query("knowledge_chunks")
            .withIndex("by_knowledge_base", q => q.eq("knowledgeBase", knowledgeBaseId))
            .take(100);
        for (const chunk of batch) {
            // Cascada: borrar el row asociado de knowledge_embeddings.
            const emb = await ctx.db
                .query("knowledge_embeddings")
                .withIndex("by_chunk", q => q.eq("chunkId", chunk._id))
                .first();
            if (emb) await ctx.db.delete(emb._id);
            await ctx.db.delete(chunk._id);
        }
        return batch.length === 100;
    },
});

/** INTERNA: elimina todos los chunks de una KB en batches de 100. */
export const _deleteChunks = internalAction({
    args: { knowledgeBaseId: v.id("knowledge_bases") },
    handler: async (ctx, { knowledgeBaseId }) => {
        let hasMore = true;
        while (hasMore) {
            hasMore = await ctx.runMutation(internal.knowledgeBases._deleteChunksBatch, { knowledgeBaseId });
        }
    },
});
