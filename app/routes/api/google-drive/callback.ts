import { redirect } from "react-router";
import { getEnv } from "utils/utils";

/**
 * Callback OAuth de Google Drive.
 * Verifica el nonce CSRF, intercambia el code por tokens,
 * guarda el refresh_token en una cookie temporal HttpOnly,
 * y redirige al panel de configuración.
 */
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
        return redirect("/panel/configuracion?gdrive=error");
    }

    const cookieHeader = request.headers.get("Cookie") ?? "";
    const nonceCookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("gdrive_nonce="))
        ?.split("=")[1];

    if (!nonceCookie || nonceCookie !== state) {
        return redirect("/panel/configuracion?gdrive=error");
    }

    try {
        const clientId = getEnv("GOOGLE_DRIVE_CLIENT_ID");
        const clientSecret = getEnv("GOOGLE_DRIVE_CLIENT_SECRET");
        const siteUrl = getEnv("VITE_SITE_URL");
        const redirectUri = `${siteUrl}/api/google-drive/callback`;

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

        const tokens = (await tokenRes.json()) as {
            refresh_token?: string;
            access_token?: string;
            error?: string;
        };

        if (!tokenRes.ok || !tokens.refresh_token) {
            return redirect("/panel/configuracion?gdrive=error");
        }

        let driveEmail = "";
        if (tokens.access_token) {
            try {
                const uiRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                    headers: { Authorization: `Bearer ${tokens.access_token}` },
                });
                const ui = (await uiRes.json()) as { email?: string };
                driveEmail = ui.email ?? "";
            } catch {
                /* non-fatal */
            }
        }

        const cookieOpts = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300";
        const clearNonce =
            "gdrive_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

        const headers = new Headers({ Location: "/panel/configuracion?gdrive=ok" });
        headers.append(
            "Set-Cookie",
            `gdrive_token=${encodeURIComponent(tokens.refresh_token)}; ${cookieOpts}`,
        );
        headers.append(
            "Set-Cookie",
            `gdrive_email=${encodeURIComponent(driveEmail)}; ${cookieOpts}`,
        );
        headers.append("Set-Cookie", clearNonce);

        return new Response(null, { status: 302, headers });
    } catch (err) {
        console.error("[GDrive callback] Unexpected error:", err);
        return redirect("/panel/configuracion?gdrive=error");
    }
}
