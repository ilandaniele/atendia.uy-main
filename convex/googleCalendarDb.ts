import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

// ─── Internal queries ─────────────────────────────────────────────────────────

export const getMembersWithCalendar = internalQuery({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        const members = await ctx.db
            .query("client_members")
            .withIndex("by_client", (q) => q.eq("client", clientId))
            .collect();

        const profiles = await Promise.all(
            members.map((m) => ctx.db.get(m.profile))
        );

        return profiles.filter(
            (p): p is NonNullable<typeof p> =>
                p !== null && !!p.googleCalendarRefreshToken && p.googleCalendarEnabled === true
        );
    },
});

export const getProfileById = internalQuery({
    args: { profileId: v.id("profiles") },
    handler: async (ctx, { profileId }) => {
        return await ctx.db.get(profileId);
    },
});

export const getAllConnectedProfiles = internalQuery({
    args: {},
    handler: async (ctx) => {
        const profiles = await ctx.db.query("profiles").collect();
        return profiles.filter(
            (p) => !!p.googleCalendarRefreshToken && p.googleCalendarEnabled === true
        );
    },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

export const saveEventId = internalMutation({
    args: {
        appointmentId: v.id("appointments"),
        profileId: v.id("profiles"),
        eventId: v.string(),
    },
    handler: async (ctx, { appointmentId, profileId, eventId }) => {
        const appt = await ctx.db.get(appointmentId);
        if (!appt) return;
        const current = (appt.googleCalendarEventIds as Record<string, string> | undefined) ?? {};
        await ctx.db.patch(appointmentId, {
            googleCalendarEventIds: { ...current, [profileId]: eventId },
        });
    },
});

export const removeEventId = internalMutation({
    args: {
        appointmentId: v.id("appointments"),
        profileId: v.id("profiles"),
    },
    handler: async (ctx, { appointmentId, profileId }) => {
        const appt = await ctx.db.get(appointmentId);
        if (!appt) return;
        const current = { ...(appt.googleCalendarEventIds as Record<string, string> | undefined) };
        delete current[profileId];
        await ctx.db.patch(appointmentId, { googleCalendarEventIds: current });
    },
});

export const saveChannelData = internalMutation({
    args: {
        profileId: v.id("profiles"),
        channelId: v.string(),
        resourceId: v.string(),
        channelExpiry: v.number(),
    },
    handler: async (ctx, { profileId, channelId, resourceId, channelExpiry }) => {
        await ctx.db.patch(profileId, { googleCalendarChannelId: channelId, googleCalendarResourceId: resourceId, googleCalendarChannelExpiry: channelExpiry });
    },
});

export const clearChannelData = internalMutation({
    args: { profileId: v.id("profiles") },
    handler: async (ctx, { profileId }) => {
        await ctx.db.patch(profileId, {
            googleCalendarChannelId: undefined,
            googleCalendarResourceId: undefined,
            googleCalendarChannelExpiry: undefined,
        });
    },
});

// ─── Public mutations ─────────────────────────────────────────────────────────

export const saveCalendarToken = mutation({
    args: {
        refreshToken: v.string(),
        email: v.optional(v.string()),
        name: v.optional(v.string()),
        picture: v.optional(v.string()),
    },
    handler: async (ctx, { refreshToken, email, name, picture }) => {
        const { profile } = await requireAuth(ctx);
        await ctx.db.patch(profile._id, {
            googleCalendarRefreshToken: refreshToken,
            googleCalendarEnabled: true,
            googleCalendarEmail: email,
            googleCalendarName: name,
            googleCalendarPicture: picture,
        });
        return profile._id;
    },
});

export const clearCalendarData = mutation({
    args: {},
    handler: async (ctx) => {
        const { profile } = await requireAuth(ctx);
        await ctx.db.patch(profile._id, {
            googleCalendarRefreshToken: undefined,
            googleCalendarEnabled: false,
            googleCalendarEmail: undefined,
            googleCalendarName: undefined,
            googleCalendarPicture: undefined,
            googleCalendarChannelId: undefined,
            googleCalendarResourceId: undefined,
            googleCalendarChannelExpiry: undefined,
        });
    },
});

// ─── Public queries ───────────────────────────────────────────────────────────

export const saveCalendarProfile = mutation({
    args: {
        email: v.optional(v.string()),
        name: v.optional(v.string()),
        picture: v.optional(v.string()),
    },
    handler: async (ctx, { email, name, picture }) => {
        const { profile } = await requireAuth(ctx);
        await ctx.db.patch(profile._id, { googleCalendarEmail: email, googleCalendarName: name, googleCalendarPicture: picture });
    },
});

export const getStatus = query({
    args: {},
    handler: async (ctx) => {
        const { profile } = await requireAuth(ctx);
        return {
            connected: !!profile.googleCalendarEnabled && !!profile.googleCalendarRefreshToken,
            profileId: profile._id,
            email: profile.googleCalendarEmail ?? null,
            name: profile.googleCalendarName ?? null,
            picture: profile.googleCalendarPicture ?? null,
            hasWebhook: !!profile.googleCalendarChannelId,
        };
    },
});
