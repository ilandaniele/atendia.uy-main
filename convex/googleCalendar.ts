"use node";

import { internalAction, action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { google } from "googleapis";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import crypto from "node:crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    );
}

function buildCalendarEvent(appt: {
    customerName: string;
    start: number;
    end?: number;
    notes?: string;
    status: string;
    customerPhone?: string;
}, tz: string) {
    const startDt = new Date(appt.start).toISOString();
    const endDt = new Date(appt.end ?? appt.start + 60 * 60 * 1000).toISOString();
    const statusLabel = appt.status === "canceled" ? " (Cancelado)" : "";

    return {
        summary: `${appt.customerName}${statusLabel}`,
        description: [
            appt.customerPhone ? `Tel: ${appt.customerPhone.split("@")[0]}` : null,
            appt.notes ?? null,
        ].filter(Boolean).join("\n") || undefined,
        start: { dateTime: startDt, timeZone: tz },
        end: { dateTime: endDt, timeZone: tz },
        status: appt.status === "canceled" ? "cancelled" : "confirmed",
    };
}

async function stopChannel(refreshToken: string, channelId: string, resourceId: string) {
    try {
        const auth = makeOAuth2Client();
        auth.setCredentials({ refresh_token: refreshToken });
        const calendar = google.calendar({ version: "v3", auth });
        await calendar.channels.stop({ requestBody: { id: channelId, resourceId } });
    } catch { /* non-fatal */ }
}

// Core import logic shared by importFromCalendar and syncForProfile
async function doImportForProfile(
    ctx: ActionCtx,
    profile: { _id: Id<"profiles">; googleCalendarRefreshToken: string },
    clientId: Id<"clients">,
): Promise<{ imported: number; deleted: number }> {
    const auth = makeOAuth2Client();
    auth.setCredentials({ refresh_token: profile.googleCalendarRefreshToken });
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const res = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        showDeleted: true,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
    });

    const events = res.data.items ?? [];
    const existingAppts = await ctx.runQuery(internal.appointments.getByClientInternal, { clientId });

    const apptByEventId = new Map<string, typeof existingAppts[number]>();
    for (const appt of existingAppts) {
        const ids = appt.googleCalendarEventIds as Record<string, string> | undefined;
        if (ids) {
            for (const eventId of Object.values(ids)) {
                apptByEventId.set(eventId, appt);
            }
        }
    }

    let imported = 0;
    let deleted = 0;

    for (const event of events) {
        if (!event.id) continue;

        if (event.status === "cancelled") {
            const appt = apptByEventId.get(event.id);
            if (appt && (appt as any).source === "google_calendar") {
                await ctx.runMutation(internal.appointments.remove, { id: appt._id });
                deleted++;
            }
            continue;
        }

        if (!event.summary) continue;
        const startStr = event.start?.dateTime;
        if (!startStr) continue;
        if (apptByEventId.has(event.id)) continue;

        const startTs = new Date(startStr).getTime();
        const endStr = event.end?.dateTime;
        const endTs = endStr ? new Date(endStr).getTime() : undefined;

        const appointmentId = await ctx.runMutation(internal.appointments.create, {
            client: clientId,
            customerName: event.summary,
            start: startTs,
            end: endTs,
            notes: event.description?.slice(0, 500) ?? undefined,
            status: "confirmed",
            source: "google_calendar",
        });

        await ctx.runMutation(internal.googleCalendarDb.saveEventId, {
            appointmentId,
            profileId: profile._id,
            eventId: event.id,
        });

        imported++;
    }

    return { imported, deleted };
}

// ─── Internal action: sync one appointment for all connected profiles ─────────

export const syncForClient = internalAction({
    args: {
        appointmentId: v.id("appointments"),
        clientId: v.id("clients"),
        operation: v.union(v.literal("upsert"), v.literal("delete")),
    },
    handler: async (ctx, { appointmentId, clientId, operation }) => {
        const appt = await ctx.runQuery(internal.appointments.getByIdInternal, { id: appointmentId });
        if (!appt) return;

        const client = await ctx.runQuery(api.clients.get, { id: clientId });
        const tz = (client as any)?.timezone ?? "America/Montevideo";

        const profiles = await ctx.runQuery(internal.googleCalendarDb.getMembersWithCalendar, { clientId });

        for (const profile of profiles) {
            const refreshToken = profile.googleCalendarRefreshToken!;
            const existingIds = (appt.googleCalendarEventIds as Record<string, string> | undefined) ?? {};
            const existingEventId = existingIds[profile._id];

            const auth = makeOAuth2Client();
            auth.setCredentials({ refresh_token: refreshToken });
            const calendar = google.calendar({ version: "v3", auth });

            try {
                if (operation === "delete" && existingEventId) {
                    await calendar.events.delete({ calendarId: "primary", eventId: existingEventId });
                    await ctx.runMutation(internal.googleCalendarDb.removeEventId, {
                        appointmentId,
                        profileId: profile._id,
                    });
                } else if (operation === "upsert") {
                    const event = buildCalendarEvent(appt, tz);
                    if (existingEventId) {
                        await calendar.events.update({
                            calendarId: "primary",
                            eventId: existingEventId,
                            requestBody: event,
                        });
                    } else {
                        const res = await calendar.events.insert({
                            calendarId: "primary",
                            requestBody: event,
                        });
                        if (res.data.id) {
                            await ctx.runMutation(internal.googleCalendarDb.saveEventId, {
                                appointmentId,
                                profileId: profile._id,
                                eventId: res.data.id,
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`[GCal] Error syncing appointment ${appointmentId} for profile ${profile._id}:`, err);
            }
        }
    },
});

// ─── Internal action: triggered by webhook notification ───────────────────────

export const syncForProfile = internalAction({
    args: { profileId: v.id("profiles") },
    handler: async (ctx, { profileId }) => {
        const profile = await ctx.runQuery(internal.googleCalendarDb.getProfileById, { profileId });
        if (!profile?.googleCalendarRefreshToken || !profile.googleCalendarEnabled) return;

        const members = await ctx.runQuery(api.clientMembers.getByProfile, { profileId: profile._id });
        const clientId = members?.[0]?.client;
        if (!clientId) return;

        await doImportForProfile(ctx, { _id: profile._id, googleCalendarRefreshToken: profile.googleCalendarRefreshToken }, clientId);
    },
});

// ─── Public action: import + detect deletions (used on initial connect) ───────

export const importFromCalendar = action({
    args: {},
    handler: async (ctx): Promise<{ imported: number; deleted: number }> => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile?.googleCalendarRefreshToken || !profile.googleCalendarEnabled) {
            return { imported: 0, deleted: 0 };
        }

        const members = await ctx.runQuery(api.clientMembers.getByProfile, { profileId: profile._id });
        const clientId = members?.[0]?.client;
        if (!clientId) return { imported: 0, deleted: 0 };

        return doImportForProfile(ctx, { _id: profile._id, googleCalendarRefreshToken: profile.googleCalendarRefreshToken }, clientId);
    },
});

// ─── Public action: bulk sync upcoming appointments for the current user ──────

export const bulkSync = action({
    args: {},
    handler: async (ctx) => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile?.googleCalendarRefreshToken || !profile.googleCalendarEnabled) return;

        const members = await ctx.runQuery(api.clientMembers.getByProfile, { profileId: profile._id });
        const clientId = members?.[0]?.client;
        if (!clientId) return;

        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const allAppts = await ctx.runQuery(internal.appointments.getByClientInternal, { clientId });
        const upcoming = allAppts.filter((a) => a.start >= sevenDaysAgo && a.status !== "canceled");

        const client = await ctx.runQuery(api.clients.get, { id: clientId });
        const tz = (client as any)?.timezone ?? "America/Montevideo";
        const auth = makeOAuth2Client();
        auth.setCredentials({ refresh_token: profile.googleCalendarRefreshToken });
        const calendar = google.calendar({ version: "v3", auth });

        for (const appt of upcoming) {
            const existingIds = (appt.googleCalendarEventIds as Record<string, string> | undefined) ?? {};
            const existingEventId = existingIds[profile._id];
            const event = buildCalendarEvent(appt, tz);

            try {
                if (existingEventId) {
                    await calendar.events.update({
                        calendarId: "primary",
                        eventId: existingEventId,
                        requestBody: event,
                    });
                } else {
                    const res = await calendar.events.insert({
                        calendarId: "primary",
                        requestBody: event,
                    });
                    if (res.data.id) {
                        await ctx.runMutation(internal.googleCalendarDb.saveEventId, {
                            appointmentId: appt._id,
                            profileId: profile._id,
                            eventId: res.data.id,
                        });
                    }
                }
            } catch (err) {
                console.error(`[GCal] Error bulk syncing appointment ${appt._id}:`, err);
            }
        }
    },
});

// ─── Public action: register Google Calendar watch webhook ────────────────────

export const setupWebhook = action({
    args: {},
    handler: async (ctx) => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile?.googleCalendarRefreshToken || !profile.googleCalendarEnabled) return;

        const siteUrl = process.env.VITE_CONVEX_SITE_URL;
        if (!siteUrl) {
            console.error("[GCal] VITE_CONVEX_SITE_URL not set in Convex dashboard");
            return;
        }

        // Stop existing channel if any
        if (profile.googleCalendarChannelId && profile.googleCalendarResourceId) {
            await stopChannel(
                profile.googleCalendarRefreshToken,
                profile.googleCalendarChannelId,
                profile.googleCalendarResourceId,
            );
        }

        const auth = makeOAuth2Client();
        auth.setCredentials({ refresh_token: profile.googleCalendarRefreshToken });
        const calendar = google.calendar({ version: "v3", auth });

        const channelId = crypto.randomUUID();

        try {
            const res = await calendar.events.watch({
                calendarId: "primary",
                requestBody: {
                    id: channelId,
                    type: "web_hook",
                    address: `${siteUrl}/gcal/webhook`,
                    token: profile._id,
                    params: { ttl: "604800" },
                },
            });

            if (res.data.resourceId && res.data.expiration) {
                await ctx.runMutation(internal.googleCalendarDb.saveChannelData, {
                    profileId: profile._id,
                    channelId,
                    resourceId: res.data.resourceId,
                    channelExpiry: Number(res.data.expiration),
                });
            }
        } catch (err) {
            console.error("[GCal] Error setting up webhook:", err);
        }
    },
});

// ─── Public action: disconnect — stops channel and clears DB ──────────────────

export const disconnect = action({
    args: {},
    handler: async (ctx) => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile) return;

        if (profile.googleCalendarChannelId && profile.googleCalendarResourceId && profile.googleCalendarRefreshToken) {
            await stopChannel(
                profile.googleCalendarRefreshToken,
                profile.googleCalendarChannelId,
                profile.googleCalendarResourceId,
            );
        }

        await ctx.runMutation(api.googleCalendarDb.clearCalendarData);
    },
});

// ─── Public action: fetch and save profile info for already-connected accounts ─

export const refreshCalendarProfile = action({
    args: {},
    handler: async (ctx) => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile?.googleCalendarRefreshToken || !profile.googleCalendarEnabled) return;

        try {
            const auth = makeOAuth2Client();
            auth.setCredentials({ refresh_token: profile.googleCalendarRefreshToken });
            const { credentials } = await auth.refreshAccessToken();
            if (!credentials.access_token) return;

            const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: { Authorization: `Bearer ${credentials.access_token}` },
            });
            const info = await res.json() as { email?: string; name?: string; picture?: string };
            await ctx.runMutation(api.googleCalendarDb.saveCalendarProfile, {
                email: info.email,
                name: info.name,
                picture: info.picture,
            });
        } catch { /* non-fatal */ }
    },
});

// ─── Internal action: renew channels expiring in less than 2 days ─────────────

export const renewWebhooks = internalAction({
    args: {},
    handler: async (ctx) => {
        const profiles = await ctx.runQuery(internal.googleCalendarDb.getAllConnectedProfiles);
        const twoDaysFromNow = Date.now() + 2 * 24 * 60 * 60 * 1000;

        for (const profile of profiles) {
            if (!profile.googleCalendarChannelExpiry || profile.googleCalendarChannelExpiry > twoDaysFromNow) continue;
            if (!profile.googleCalendarRefreshToken) continue;

            if (profile.googleCalendarChannelId && profile.googleCalendarResourceId) {
                await stopChannel(profile.googleCalendarRefreshToken, profile.googleCalendarChannelId, profile.googleCalendarResourceId);
            }

            const siteUrl = process.env.VITE_CONVEX_SITE_URL;
            if (!siteUrl) continue;

            const auth = makeOAuth2Client();
            auth.setCredentials({ refresh_token: profile.googleCalendarRefreshToken });
            const calendar = google.calendar({ version: "v3", auth });
            const channelId = crypto.randomUUID();

            try {
                const res = await calendar.events.watch({
                    calendarId: "primary",
                    requestBody: {
                        id: channelId,
                        type: "web_hook",
                        address: `${siteUrl}/gcal/webhook`,
                        token: profile._id,
                        params: { ttl: "604800" },
                    },
                });

                if (res.data.resourceId && res.data.expiration) {
                    await ctx.runMutation(internal.googleCalendarDb.saveChannelData, {
                        profileId: profile._id,
                        channelId,
                        resourceId: res.data.resourceId,
                        channelExpiry: Number(res.data.expiration),
                    });
                }
            } catch (err) {
                console.error(`[GCal] Error renewing webhook for profile ${profile._id}:`, err);
            }
        }
    },
});
