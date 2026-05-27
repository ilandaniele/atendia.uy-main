import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ClientSchema = defineTable({    
    name: v.string(),
    businessName: v.string(),
    timezone: v.string(),
    isActive: v.boolean(),
    config: v.object({
        googleRefreshToken: v.optional(v.string()),
        googleCalendarId: v.optional(v.string()),
        appointmentReminderHours: v.optional(v.number()),
        outOfHoursOrderPolicy: v.optional(v.union(
            v.literal("reject"),
            v.literal("accept_next_day")
        )),
        businessHours: v.optional(v.array(v.object({
            day: v.number(),
            isOpen: v.boolean(),
            openTime: v.string(),
            closeTime: v.string(),
        }))),
        currency: v.optional(v.string()),
        driveSyncIntervalMinutes: v.optional(v.union(
            v.literal(5),
            v.literal(15),
            v.literal(30),
            v.literal(60),     // 1 hour
            v.literal(360),    // 6 hours
            v.literal(720),    // 12 hours
            v.literal(1440),   // 1 day
            v.literal(10080),  // 1 week
            v.literal(43200),  // 30 days (≈ 1 month)
        )),
        driveLastDispatchAt: v.optional(v.number()),
    }),
    features: v.object({
        enableAgenda: v.boolean(),
        enableOrders: v.boolean(),
        allowCancelAppointments: v.optional(v.boolean()),
        allowModifyAppointments: v.optional(v.boolean()),
        allowCancelOrders: v.optional(v.boolean()),
        minHoursBeforeEdit: v.optional(v.number()),
        notifyOrderConfirmed: v.optional(v.boolean()),
        notifyOrderShipped: v.optional(v.boolean()),
        autoSaveContacts: v.optional(v.boolean()),
        blockMultimedia: v.optional(v.boolean()),
        blockCalls: v.optional(v.boolean()),
        transcribeAudio: v.optional(v.boolean()),
    }),
    plan: v.optional(v.id("plans")),
    tokensBalance: v.number(),
    dlocalGoSubscriptionId: v.optional(v.string()),
    trialEndsAt: v.optional(v.number()),
    lockedInactive: v.optional(v.boolean()),
    webhooks: v.optional(v.array(v.object({
        id: v.string(),
        name: v.string(),
        url: v.string(),
        secret: v.optional(v.string()),
        events: v.array(v.string()),
        enabled: v.boolean(),
    }))),
    updatedBy: v.id("profiles")
})
.index("by_name", ["name"])
.index("by_business_name", ["businessName"])
.index("by_subscription", ["dlocalGoSubscriptionId"]);