import { defineTable } from "convex/server";
import { v } from "convex/values";

export const AppointmentSchema = defineTable({
    client: v.id("clients"),
    channel: v.optional(v.id("channels")),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    start: v.number(),       // Timestamp inicio
    end: v.optional(v.number()),         // Timestamp fin
    status: v.string(),      // "scheduled", "canceled", "done"
    notes: v.optional(v.string()),
    googleCalendarEventIds: v.optional(v.any()),
    source: v.optional(v.union(v.literal("atendia"), v.literal("google_calendar"))),
})
.index("by_client_date", ["client", "start"])
.index("by_status", ["status"]);