import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ContactSchema = defineTable({
    assistantId: v.id("assistants"),
    name: v.string(),
    // Phone XOR email: cada contacto se identifica por uno u otro (al menos uno).
    phone: v.optional(v.string()), // normalizado: solo dígitos, formato internacional
    email: v.optional(v.string()), // normalizado: lowercase, trim
    extras: v.optional(v.record(v.string(), v.string())),
    updatedAt: v.optional(v.number()),
})
    .index("by_assistant", ["assistantId"])
    .index("by_assistant_and_phone", ["assistantId", "phone"])
    .index("by_assistant_and_email", ["assistantId", "email"]);
