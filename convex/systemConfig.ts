import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./authHelpers";
import { v } from "convex/values";

const DEFAULTS = {
    trialDays: 7,
    defaultTrialTokens: 50000,
    maintenanceMode: false,
    allowedRegistration: true,
};

/** Retorna la configuración del sistema. Si no existe, devuelve los valores por defecto sin persistirlos. */
export const get = query({
    args: {},
    handler: async (ctx) => {
        const config = await ctx.db.query("system_config").first();
        return config ?? { ...DEFAULTS };
    },
});

/** Solo admin: crea o actualiza la única fila de configuración del sistema. */
export const upsert = mutation({
    args: {
        trialDays: v.number(),
        defaultTrialTokens: v.number(),
        maintenanceMode: v.boolean(),
        allowedRegistration: v.boolean(),
    },
    handler: async (ctx, args) => {
        await requireAdmin(ctx);
        const existing = await ctx.db.query("system_config").first();
        if (existing) {
            await ctx.db.patch(existing._id, args);
        } else {
            await ctx.db.insert("system_config", args);
        }
    },
});
