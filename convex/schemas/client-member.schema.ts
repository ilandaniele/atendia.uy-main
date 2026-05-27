import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ClientMemberSchema = defineTable({
    client: v.id("clients"),
    profile: v.id("profiles"),
    role: v.union(
        v.literal("owner"),
        v.literal("member")
    )
})
.index("by_client", ["client"])
.index("by_profile", ["profile"]);