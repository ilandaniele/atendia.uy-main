import { redirect } from "react-router";
import { getEnv } from "utils/utils";
import crypto from "node:crypto";

/**
 * Inicia el flujo OAuth de Google Drive (scope drive.readonly).
 * El cliente navega a esta URL con ?profileId=xxx.
 * Genera un nonce CSRF, lo guarda en cookie, y redirige a Google.
 */
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const profileId = url.searchParams.get("profileId");
    if (!profileId) return redirect("/panel/configuracion");

    const clientId = getEnv("GOOGLE_DRIVE_CLIENT_ID");
    const siteUrl = getEnv("VITE_SITE_URL");
    const redirectUri = `${siteUrl}/api/google-drive/callback`;

    const nonce = crypto.randomUUID();

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.readonly",
        access_type: "offline",
        prompt: "consent",
        state: nonce,
    });

    const cookieOpts = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600";
    const headers = new Headers({
        Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        "Set-Cookie": `gdrive_nonce=${nonce}; ${cookieOpts}`,
    });

    return new Response(null, { status: 302, headers });
}
