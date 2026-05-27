import { defineTable } from "convex/server";
import { v } from "convex/values";

export const PushSubscriptionSchema = defineTable({
    userId: v.string(),
    subscription: v.any(),
});