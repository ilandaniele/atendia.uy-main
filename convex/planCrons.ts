"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { DLocalService } from "../lib/services/dlocal.service";

function getDLocalService() {
    return new DLocalService({
        apiUrl: process.env.DLOCALGO_API_URL || "https://api.dlocal.com",
        apiKey: process.env.DLOCALGO_API_KEY || "",
        secretKey: process.env.DLOCALGO_SECRET_KEY || "",
        siteUrl: process.env.SITE_URL ?? "https://atendia.uy",
    });
}

/**
 * Cron cada 15 días: renueva el enlace de suscripción de todos los planes
 * desactivando el plan actual en dLocal Go y creando uno nuevo con los mismos
 * parámetros. Actualiza dlocalPlanId y subscriptionUrl en Convex.
 */
export const refreshAllPlanLinks = internalAction({
    args: {},
    handler: async (ctx) => {
        const dlocal = getDLocalService();
        const plans = await ctx.runQuery(internal.plans.listAllInternal);

        for (const plan of plans) {
            if (!plan.dlocalPlanId) continue;

            try {
                // 1. Desactivar el plan actual en dLocal Go
                await dlocal.cancelPlan(plan.dlocalPlanId);

                // 2. Crear uno nuevo con los mismos parámetros
                const newPlan = await dlocal.createPlan({
                    name: plan.name,
                    description: plan.description,
                    amount: plan.amount,
                    frequencyType: plan.frequencyType,
                    frequencyValue: plan.frequencyValue,
                });

                // 3. Actualizar en Convex
                await ctx.runMutation(internal.plans.updateDlocalLinkInternal, {
                    id: plan._id,
                    dlocalPlanId: newPlan.id,
                    subscriptionUrl: newPlan.subscribe_url,
                });

                console.log(`[refreshAllPlanLinks] Plan "${plan.name}" renovado — nuevo dLocal ID: ${newPlan.id}`);
            } catch (err) {
                console.error(`[refreshAllPlanLinks] Error renovando plan "${plan.name}" (${plan._id}):`, err);
            }
        }
    },
});
