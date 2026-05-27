"use node"

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

/**
 * Público (solo admin): wrapper que verifica autenticación antes de eliminar un cliente.
 * Llamado desde el panel de administración.
 */
export const deleteClientExternalData = action({
    args: { id: v.id("clients") },
    handler: async (ctx, { id }): Promise<{ success: boolean }> => {
        const isAdmin = await ctx.runQuery(api.profiles.isAdmin);
        if (!isAdmin) throw new Error("Acceso denegado: se requiere rol administrador");
        return ctx.runAction(internal.deleteClientInternal.run, { id });
    }
});
