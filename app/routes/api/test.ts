import { api } from "convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { DLocalService, type DLocalServiceConfig } from "lib/services/dlocal.service"
import { getEnv } from "utils/utils";

export async function loader() {
    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const apiUrl = getEnv("DLOCALGO_API_URL");
    const apiKey = getEnv("DLOCALGO_API_KEY");
    const apiSecret = getEnv("DLOCALGO_SECRET_KEY");
    const siteUrl = getEnv("VITE_SITE_URL");

    const dlocal = new DLocalService({
        apiUrl,
        apiKey,
        secretKey: apiSecret,
        siteUrl
    } as DLocalServiceConfig);

    const response = await dlocal.retrieveAllPlans();
    const dlocalActivePlans = response.data.filter(plan => plan.active);
    const dlocalInactivePlans = response.data.filter(plan => !plan.active);

    const convex = new ConvexReactClient(VITE_CONVEX_URL);
    const dbPlans = await convex.query(api.plans.list, {});

    console.log("Planes activos: ", dlocalActivePlans.length);
    console.log("Planes inactivos: ", dlocalInactivePlans.length);

    /*dlocalInactivePlans.forEach(async dlocalPlan => {
        const cancelPlan = await dlocal.cancelPlan(dlocalPlan.id);
        console.log(cancelPlan);
    })*/
    
    return null
}