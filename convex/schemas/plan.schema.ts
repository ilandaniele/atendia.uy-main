import { defineTable } from "convex/server";
import { v } from "convex/values";

export const PlanSchema = defineTable({
    name: v.string(),
    description: v.string(),
    tokens: v.number(),
    icon: v.string(),
    amount: v.number(),
    currency: v.union(
        v.literal("USD"),
        v.literal("UYU")
    ),
    frequencyType: v.union(
        v.literal("DAILY"),
        v.literal("WEEKLY"),
        v.literal("MONTHLY"),
        v.literal("YEARLY")
    ),
    frequencyValue: v.number(),
    subscriptionUrl: v.optional(v.string()),
    dlocalPlanId: v.optional(v.number()),
    archived: v.optional(v.boolean()),
})
.index("by_name", ["name"]);