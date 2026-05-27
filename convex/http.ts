import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

auth.addHttpRoutes(http);

// Google Calendar push notification endpoint
http.route({
    path: "/gcal/webhook",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
        const resourceState = req.headers.get("X-Goog-Resource-State") ?? "";
        const profileId = req.headers.get("X-Goog-Channel-Token") ?? "";

        // Initial handshake — just acknowledge
        if (resourceState === "sync" || !profileId) {
            return new Response(null, { status: 200 });
        }

        await ctx.runAction(internal.googleCalendar.syncForProfile, {
            profileId: profileId as Id<"profiles">,
        });

        return new Response(null, { status: 200 });
    }),
});

export default http;
