import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ContactFormSchema = defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    company: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    status: v.union(
        v.literal("new"),
        v.literal("read"),
        v.literal("replied"),
        v.literal("archived")
    ),
    adminNote: v.optional(v.string()),
}).index("by_status", ["status"]);
