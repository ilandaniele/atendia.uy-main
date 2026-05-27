import { defineTable } from "convex/server";
import { v } from "convex/values";

export const InvoiceSchema = defineTable({
    plan: v.optional(v.id("plans")),
    orderId: v.string(),
    status: v.union(
        v.literal("PENDING"),
        v.literal("PAID"),
        v.literal("REJECTED"),
        v.literal("CANCELLED"),
        v.literal("EXPIRED")
    ),
    client: v.id("clients"),
})
.index("by_client", ["client"])
.index("by_orderId", ["orderId"]);