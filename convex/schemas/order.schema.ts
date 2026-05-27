import { defineTable } from "convex/server";
import { v } from "convex/values";

export const OrderSchema = defineTable({
    client: v.id("clients"),
    // Optional para mantener retrocompatibilidad con pedidos creados antes
    // de que el sistema soportara multi-canal/multi-asistente.
    channel: v.optional(v.id("channels")),
    assistant: v.optional(v.id("assistants")),
    phone: v.string(),
    name: v.string(),
    deliveryAddress: v.string(),
    items: v.array(v.object({
        productName: v.string(),
        quantity: v.number(),
        priceAtMoment: v.number()
    })),
    totalAmount: v.number(),
    currency: v.string(),
    status: v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("shipped"),
        v.literal("delivered"),
        v.literal("canceled"),
    )
})
.index("by_status", ["status"])
.index("by_client", ["client"])
.index("by_channel", ["channel"])
.index("by_assistant", ["assistant"]);