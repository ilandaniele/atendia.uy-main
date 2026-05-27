import { redirect } from "react-router";
import { getEnv } from "utils/utils";

/**
 * Callback OAuth de Google Calendar.
 * Verifica el nonce CSRF, intercambia el code por tokens,
 * guarda el refresh_token en una cookie temporal HttpOnly,
 * y redirige al panel de agenda.
 */
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
        return redirect("/panel/agenda?gcal=error");
    }

    // Verify CSRF nonce
    const cookieHeader = request.headers.get("Cookie") ?? "";
    const nonceCookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("gcal_nonce="))
        ?.split("=")[1];

    if (!nonceCookie || nonceCookie !== state) {
        return redirect("/panel/agenda?gcal=error");
    }

    try {
        const clientId = getEnv("GOOGLE_CALENDAR_CLIENT_ID");
        const clientSecret = getEnv("GOOGLE_CALENDAR_CLIENT_SECRET");
        const siteUrl = getEnv("VITE_SITE_URL");
        const redirectUri = `${siteUrl}/api/google-calendar/callback`;

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }),
        });

        const tokens = await tokenRes.json() as { refresh_token?: string; access_token?: string; error?: string };

        if (!tokenRes.ok || !tokens.refresh_token) {
            return redirect("/panel/agenda?gcal=error");
        }

        // Fetch connected account info
        let calEmail = "", calName = "", calPicture = "";
        if (tokens.access_token) {
            try {
                const uiRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                    headers: { Authorization: `Bearer ${tokens.access_token}` },
                });
                const ui = await uiRes.json() as { email?: string; name?: string; picture?: string };
                calEmail = ui.email ?? "";
                calName = ui.name ?? "";
                calPicture = ui.picture ?? "";
            } catch { /* non-fatal */ }
        }

        const cookieOpts = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300";
        const clearNonce = "gcal_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

        const headers = new Headers({
            Location: "/panel/agenda?gcal=ok",
        });
        headers.append("Set-Cookie", `gcal_token=${encodeURIComponent(tokens.refresh_token)}; ${cookieOpts}`);
        headers.append("Set-Cookie", `gcal_email=${encodeURIComponent(calEmail)}; ${cookieOpts}`);
        headers.append("Set-Cookie", `gcal_name=${encodeURIComponent(calName)}; ${cookieOpts}`);
        headers.append("Set-Cookie", `gcal_picture=${encodeURIComponent(calPicture)}; ${cookieOpts}`);
        headers.append("Set-Cookie", clearNonce);

        return new Response(null, { status: 302, headers });
    } catch (err) {
        console.error("[GCal callback] Unexpected error:", err);
        return redirect("/panel/agenda?gcal=error");
    }
}
