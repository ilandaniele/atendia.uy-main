import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { getEnv } from "utils/utils";
import { WhapiService } from "../../../lib/services/whapi.service";
import devug from "@mafer.solutions/devug";

/**
 * Proxy on-demand para descargar audios de Whapi.
 * GET /api/media/:channelId/:mediaId
 *
 * Auth: el frontend pasa el token Convex en `Authorization: Bearer <token>` o `?token=`.
 * El acceso al canal se valida con `requireClientAccess` en la query Convex.
 * No se almacena nada — si Whapi devuelve null, se responde 404.
 */
export async function loader({
    request,
    params,
}: {
    request: Request;
    params: { channelId: Id<"channels">; mediaId: string };
}) {
    try {
        const { channelId, mediaId } = params;

        const url = new URL(request.url);
        const authHeader = request.headers.get("Authorization") ?? "";
        const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        const queryToken = url.searchParams.get("token") ?? "";
        const token = bearer || queryToken;

        if (!token) {
            return new Response("Unauthorized", { status: 401 });
        }

        const convex = new ConvexHttpClient(getEnv("VITE_CONVEX_URL"));
        convex.setAuth(token);

        const access = await convex.query(api.channels.getWhapiTokenForAccess, { id: channelId });
        if (!access?.whapiToken) {
            return new Response("Forbidden", { status: 403 });
        }

        const whapi = new WhapiService({ token: access.whapiToken });
        const buffer = await whapi.getMedia(mediaId);
        if (!buffer) {
            return new Response("Audio no disponible", { status: 404 });
        }

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/ogg",
                "Cache-Control": "private, max-age=300",
            },
        });
    } catch (err) {
        devug.error("[api/media] error:", err);
        return new Response("Internal Error", { status: 500 });
    }
}
