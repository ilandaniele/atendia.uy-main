import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type SupportedCountry = "UY" | "AR" | "BR" | "CO" | "VE" | "CL" | "MX" | "PE" | "EC" | "BO" | "PY";

export type PhoneParseResult =
    | { ok: true; phone: string }
    | { ok: false; error: string };

interface CountryConfig {
    callingCode: string;
    label: string;
    /** Expected total digit count after full normalization (including calling code). */
    validLengths: number[];
    /** Transform local digits (no leading 0, no calling code) → full international digits. */
    normalize: (local: string) => string;
}

export const COUNTRY_CONFIGS: Record<SupportedCountry, CountryConfig> = {
    UY: {
        callingCode: "598", label: "Uruguay", validLengths: [11],
        // 09XXXXXXX → remove 0 → 9XXXXXXX (8 digits) → 598 + 8 = 11
        normalize: d => "598" + d,
    },
    AR: {
        callingCode: "54", label: "Argentina", validLengths: [12, 13],
        // Móvil local: [area]15[subscriber] → 549[area][subscriber]
        // Fijo local: [area][subscriber] → 54[area][subscriber]
        normalize: d => {
            const m = d.match(/^(\d{1,4})15(\d{6,8})$/);
            if (m) return "549" + m[1] + m[2];
            return "54" + d;
        },
    },
    BR: {
        callingCode: "55", label: "Brasil", validLengths: [12, 13],
        // 0DDD9XXXXXXXX → remove 0 → DDD9XXXXXXXX (11 d) → 55 + 11 = 13
        // 0DDXXXXXXXX  → remove 0 → DDXXXXXXXX  (10 d) → 55 + 10 = 12
        normalize: d => "55" + d,
    },
    CO: {
        callingCode: "57", label: "Colombia", validLengths: [10, 12],
        // Móvil: 3XXXXXXXXX (10 d, sin 0) → 57 + 10 = 12
        // Fijo:  [area]XXXXXXX (8 d) → 57 + 8 = 10
        normalize: d => "57" + d,
    },
    VE: {
        callingCode: "58", label: "Venezuela", validLengths: [12],
        // 04XXXXXXXXX → remove 0 → 4XXXXXXXXX (10 d) → 58 + 10 = 12
        normalize: d => "58" + d,
    },
    CL: {
        callingCode: "56", label: "Chile", validLengths: [11],
        // 09XXXXXXXX → remove 0 → 9XXXXXXXX (9 d) → 56 + 9 = 11
        normalize: d => "56" + d,
    },
    MX: {
        callingCode: "52", label: "México", validLengths: [12, 13],
        // Móvil (nuevo): XXXXXXXXXX (10 d) → 52 + 10 = 12
        // Móvil (044/045): 044XXXXXXXXXX → remove 0 → 44... → 521 + 10 = 13
        normalize: d => {
            if (d.startsWith("44") || d.startsWith("45")) return "521" + d.slice(2);
            return "52" + d;
        },
    },
    PE: {
        callingCode: "51", label: "Perú", validLengths: [11],
        // 9XXXXXXXX (9 d) → 51 + 9 = 11
        normalize: d => "51" + d,
    },
    EC: {
        callingCode: "593", label: "Ecuador", validLengths: [12],
        // 09XXXXXXXX → remove 0 → 9XXXXXXXX (9 d) → 593 + 9 = 12
        normalize: d => "593" + d,
    },
    BO: {
        callingCode: "591", label: "Bolivia", validLengths: [11],
        // 7XXXXXXX o 6XXXXXXX (8 d) → 591 + 8 = 11
        normalize: d => "591" + d,
    },
    PY: {
        callingCode: "595", label: "Paraguay", validLengths: [12],
        // 09XXXXXXXX → remove 0 → 9XXXXXXXX (9 d) → 595 + 9 = 12
        normalize: d => "595" + d,
    },
};

// Ordered longest-first to avoid partial match (e.g. "598" before "59").
const PREFIX_TO_COUNTRY: { prefix: string; country: SupportedCountry }[] = [
    { prefix: "598", country: "UY" },
    { prefix: "593", country: "EC" },
    { prefix: "595", country: "PY" },
    { prefix: "591", country: "BO" },
    { prefix: "549", country: "AR" },
    { prefix: "521", country: "MX" },
    { prefix: "55", country: "BR" },
    { prefix: "57", country: "CO" },
    { prefix: "58", country: "VE" },
    { prefix: "56", country: "CL" },
    { prefix: "54", country: "AR" },
    { prefix: "52", country: "MX" },
    { prefix: "51", country: "PE" },
];

const KNOWN_CODES = PREFIX_TO_COUNTRY.map(p => p.prefix);

/**
 * Detects the country from an already-normalized international phone (digits only, no +).
 * Returns null if no known prefix matches.
 */
export function detectCountryFromPhone(normalized: string): SupportedCountry | null {
    const digits = normalized.replace(/\D/g, "");
    for (const { prefix, country } of PREFIX_TO_COUNTRY) {
        if (digits.startsWith(prefix)) return country;
    }
    return null;
}

/**
 * Normalizes a phone number to international format (digits only, no +).
 *
 * Handles:
 * - WhatsApp suffix:  "59899123123@s.whatsapp.net" → "59899123123"
 * - Plus prefix:      "+598 99 123 123"            → "59899123123"
 * - 00 prefix:        "00598 99 123 123"           → "59899123123"
 * - Local with 0:     "099344948" + UY             → "59899344948"
 * - Local without 0:  "93456789"  + UY             → "59893456789"
 * - Already intl:     "59894567412" + UY           → "59894567412" (validated)
 *
 * Throws if the resulting number fails the per-country length validation.
 * When no countryHint is given, normalization is best-effort and never throws.
 */
export function normalizePhone(raw: string, countryHint?: SupportedCountry): string {
    const stripped = raw.split("@")[0].trim();
    const hasPlus = stripped.startsWith("+");
    const digits = stripped.replace(/\D/g, "");

    if (!digits) {
        if (countryHint) throw new Error("El número de teléfono está vacío.");
        return raw;
    }

    // Explicit international prefix
    if (hasPlus) return validated(digits, countryHint);
    if (digits.startsWith("00")) return validated(digits.slice(2), countryHint);

    // No leading 0 — check if already in international format
    if (!digits.startsWith("0")) {
        for (const code of KNOWN_CODES) {
            if (digits.startsWith(code)) return validated(digits, countryHint);
        }
        // Not matching any known code → treat as local digits without the leading 0
        if (countryHint) {
            return validated(COUNTRY_CONFIGS[countryHint].normalize(digits), countryHint);
        }
        return digits;
    }

    // Starts with 0 → local number, strip the 0 and apply country normalize
    const local = digits.slice(1);
    if (countryHint) {
        return validated(COUNTRY_CONFIGS[countryHint].normalize(local), countryHint);
    }
    return local; // best-effort: just strip the leading 0
}

function validated(normalized: string, countryHint?: SupportedCountry): string {
    if (!countryHint) return normalized;
    const cfg = COUNTRY_CONFIGS[countryHint];
    if (!cfg.validLengths.includes(normalized.length)) {
        throw new Error(
            `Número inválido para ${cfg.label}. Se esperan ${cfg.validLengths.join(" o ")} dígitos en total y se obtuvieron ${normalized.length} ("${normalized}").`
        );
    }
    return normalized;
}

/**
 * Safe wrapper for UI — returns a result object instead of throwing.
 */
export function parsePhone(raw: string, countryHint?: SupportedCountry): PhoneParseResult {
    if (!raw.trim()) return { ok: false, error: "Ingresá un número de teléfono." };
    try {
        return { ok: true, phone: normalizePhone(raw, countryHint) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Número inválido." };
    }
}

/**
 * Whether a normalized string looks like a valid international number.
 * Used for UI warnings when no country hint is available.
 */
export function looksInternational(normalized: string): boolean {
    if (normalized.length < 10 || normalized.length > 15) return false;
    return KNOWN_CODES.some(code => normalized.startsWith(code));
}

/**
 * Detects the country of a stored international phone (digits only, no +) using libphonenumber-js.
 */
export function detectCountryISO(intlDigits: string): CountryCode | undefined {
    if (!intlDigits) return undefined;
    return parsePhoneNumberFromString("+" + intlDigits.replace(/\D/g, ""))?.country;
}

/**
 * Best-effort parse of a raw phone input to international format (digits only, no +).
 *
 * Order:
 *   1. Explicit + or 00 prefix → parse as international, return if valid.
 *   2. If candidates were provided, try each in order. Do NOT fall through to a
 *      "+digits" guess here, because libphonenumber will eagerly accept a wrong
 *      country (e.g. "+31..." parses as Netherlands) and shadow the right one.
 *   3. No candidates → try as already-international digits with a synthetic +.
 *
 * Returns null if no valid parse is found.
 */
export function tryParseIntl(raw: string, candidates?: CountryCode[]): string | null {
    const stripped = raw.split("@")[0].trim();
    if (!stripped) return null;

    if (stripped.startsWith("+") || stripped.startsWith("00")) {
        const intl = stripped.startsWith("00") ? "+" + stripped.slice(2) : stripped;
        const direct = parsePhoneNumberFromString(intl);
        if (direct?.isValid()) return direct.number.replace("+", "");
        return null;
    }

    if (candidates && candidates.length > 0) {
        for (const country of candidates) {
            const parsed = parsePhoneNumberFromString(stripped, country);
            if (parsed?.isValid()) return parsed.number.replace("+", "");
        }
        return null;
    }

    const digits = stripped.replace(/\D/g, "");
    if (digits) {
        const withPlus = parsePhoneNumberFromString("+" + digits);
        if (withPlus?.isValid()) return withPlus.number.replace("+", "");
    }
    return null;
}
