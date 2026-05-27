const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailParseResult =
    | { ok: true; email: string }
    | { ok: false; error: string };

export function normalizeEmail(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) throw new Error("El email está vacío.");
    if (!EMAIL_REGEX.test(trimmed)) {
        throw new Error(`Email inválido: "${raw}".`);
    }
    return trimmed;
}

export function parseEmail(raw: string): EmailParseResult {
    if (!raw.trim()) return { ok: false, error: "Ingresá un email." };
    try {
        return { ok: true, email: normalizeEmail(raw) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Email inválido." };
    }
}
