import { defineTable } from "convex/server";
import { v } from "convex/values";

export const AvailabilitySchema = defineTable({
    client: v.id("clients"),
    dayOfWeek: v.number(),   // 0=Domingo, 1=Lunes...
    slots: v.array(v.object({
        start: v.string(),   // "09:00"
        end: v.string(),     // "18:00"
    })),
    slotDuration: v.optional(v.number()), // minutos (ej: 30)
}).index("by_client", ["client"]);