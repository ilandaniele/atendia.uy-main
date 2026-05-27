import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ChannelSchema = defineTable({
    client: v.id("clients"),
    type: v.string(),
    name: v.string(),
    externalId: v.optional(v.string()),
    config: v.object({
        accessToken: v.optional(v.string()),
        allowedDomains: v.optional(v.array(v.string())),
        theme: v.optional(v.object({
            primaryColor: v.optional(v.string()),
            position: v.optional(v.string()),
        })),
        whapiToken: v.optional(v.string()),
        whapiChannelId: v.optional(v.string()),
        whapiApiUrl: v.optional(v.string()),
        testMode: v.optional(v.boolean()),
        testPhones: v.optional(v.array(v.string())),
    }),
    isActive: v.boolean(),
    assistant: v.id("assistants"),
    status: v.string(),
    deletedAt: v.optional(v.string()),
})
.index("by_client_and_type", ["client", "type"])
.index("by_assistant", ["assistant"])
.index("by_access_token", ["config.accessToken"]);
