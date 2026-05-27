import { defineTable } from "convex/server";
import { v } from "convex/values";

export const SystemConfigSchema = defineTable({
    trialDays: v.number(),
    defaultTrialTokens: v.number(),
    maintenanceMode: v.boolean(),
    allowedRegistration: v.boolean(),
});