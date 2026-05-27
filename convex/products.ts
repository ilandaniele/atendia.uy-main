import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireClientAccess } from "./authHelpers";

// ── Consultas ─────────────────────────────────────────────────────────────────

/** Solo admin: lista todos los productos. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        const products = await ctx.db.query("products").take(100);
        return products;
    }
});

/** Miembro del cliente o admin: retorna un producto por ID. */
export const get = query({
    args: {
        id: v.id("products")
    },
    handler: async (ctx, { id }) => {
        const product = await ctx.db.get(id);
        if (!product) return null;
        await requireClientAccess(ctx, product.client);
        return product;
    }
});

/** Miembro del cliente o admin: retorna productos del cliente. */
export const getByClient = query({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        await requireClientAccess(ctx, clientId);
        return ctx.db
            .query("products")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Query Interna ─────────────────────────────────────────────────────────────

/** INTERNA: retorna productos por clientId sin verificación de auth. */
export const getByClientInternal = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        return ctx.db
            .query("products")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();
    }
});

// ── Mutaciones ────────────────────────────────────────────────────────────────

/** Miembro del cliente o admin: crea un producto. */
export const create = mutation({
    args: {
        client: v.id("clients"),
        name: v.string(),
        description: v.optional(v.string()),
        price: v.number(),
        isActive: v.boolean(),
        category: v.optional(v.string()),
        isAvailable: v.boolean(),
    },
    handler: async (ctx, args) => {
        await requireClientAccess(ctx, args.client);
        const product = await ctx.db.insert("products", args);
        return product;
    }
});

/** Miembro del cliente o admin: actualiza un producto. */
export const update = mutation({
    args: {
        id: v.id("products"),
        name: v.string(),
        description: v.optional(v.string()),
        price: v.number(),
        isActive: v.boolean(),
        category: v.optional(v.string()),
        isAvailable: v.boolean(),
    },
    handler: async (ctx, args) => {
        const product = await ctx.db.get(args.id);
        if (!product) throw new Error("Producto no encontrado");
        await requireClientAccess(ctx, product.client);
        const { id, ...updateData } = args;
        return ctx.db.patch("products", id, updateData);
    }
});

/** Miembro del cliente o admin: elimina un producto. */
export const remove = mutation({
    args: {
        id: v.id("products")
    },
    handler: async (ctx, { id }) => {
        const product = await ctx.db.get(id);
        if (!product) throw new Error("Producto no encontrado");
        await requireClientAccess(ctx, product.client);
        return ctx.db.delete("products", id);
    }
});
