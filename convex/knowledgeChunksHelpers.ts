/**
 * Genera un hash SHA-256 hex del contenido (con trim) para deduplicar chunks
 * antes de gastar tokens en Gemini.
 *
 * Usa Web Crypto API (`crypto.subtle`) para que funcione tanto en el runtime
 * V8 de Convex como en acciones "use node" — importar `node:crypto` rompe el
 * bundling V8 ("Could not resolve 'crypto'").
 */
export async function generateContentHash(content: string): Promise<string> {
    const data = new TextEncoder().encode(content.trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
