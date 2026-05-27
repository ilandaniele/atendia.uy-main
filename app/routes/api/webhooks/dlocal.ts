import { api } from "convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { getEnv, JSONResponse } from "utils/utils";
import devug from "@mafer.solutions/devug";
import crypto from "crypto";

/**
 * Webhook de dLocal — recibe notificaciones de pago.
 *
 * Seguridad:
 * 1. Verifica la firma HMAC-SHA256 usando DLOCALGO_SECRET_KEY.
 * 2. Delega el procesamiento a billing.handleWebhookPayment (Convex action),
 *    que usa internalMutations para addTokens, activateSubscription, etc.
 *    La acción Convex re-verifica la firma como segunda línea de defensa.
 */
export async function action({ request }: { request: Request }) {
    const headers = new Headers();

    try {
        const apiKey = getEnv("DLOCALGO_API_KEY") ?? "";
        const secretKey = getEnv("DLOCALGO_SECRET_KEY") ?? "";

        const rawBody = await request.text();
        const authHeader = request.headers.get("Authorization") ?? "";

        // ── 1. Verificación HMAC ───────────────────────────────────────────
        const signatureMatch = authHeader.match(/Signature:\s*([a-f0-9]+)/i);
        const receivedSignature = signatureMatch ? signatureMatch[1] : null;

        if (!receivedSignature) {
            devug.error("No se encontró la firma en el webhook dLocal");
            return JSONResponse({
                body: { error: "Missing signature" },
                status: { code: 401, text: "Unauthorized" },
                headers
            });
        }

        const message = apiKey + rawBody;
        const expectedSignature = crypto
            .createHmac("sha256", secretKey)
            .update(message)
            .digest("hex");

        if (!timingSafeEqual(receivedSignature, expectedSignature)) {
            devug.error("Firma HMAC inválida en webhook dLocal");
            return JSONResponse({
                body: { error: "Invalid signature" },
                status: { code: 403, text: "Forbidden" },
                headers
            });
        }

        // ── 2. Delegar a Convex action (usa internalMutations) ─────────────
        const convex = new ConvexHttpClient(getEnv("VITE_CONVEX_URL"));
        const result = await convex.action(api.billing.handleWebhookPayment, {
            payload: rawBody,
            signature: receivedSignature,
        });

        return JSONResponse({
            body: result,
            status: { code: 200, text: "OK" },
            headers
        });

    } catch (error) {
        devug.error("Error crítico procesando webhook dLocal:", error);
        return JSONResponse({
            body: { error: "Internal Error" },
            status: { code: 500, text: "Internal Server Error" },
            headers
        });
    }
}

/**
 * Comparación de strings en tiempo constante para prevenir timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
}
