// Duplicate of utils/phoneUtils.ts — Convex cannot import from outside convex/.
// Keep in sync manually when updating normalization logic.

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type SupportedCountry = "UY" | "AR" | "BR" | "CO" | "VE" | "CL" | "MX" | "PE" | "EC" | "BO" | "PY";

interface CountryConfig {
    callingCode: string;
    validLengths: number[];
    normalize: (local: string) => string;
}

const COUNTRY_CONFIGS: Record<SupportedCountry, CountryConfig> = {
    UY: { callingCode: "598", validLengths: [11], normalize: d => "598" + d },
    AR: {
        callingCode: "54", validLengths: [12, 13],
        normalize: d => {
            const m = d.match(/^(\d{1,4})15(\d{6,8})$/);
            if (m) return "549" + m[1] + m[2];
            return "54" + d;
        },
    },
    BR: { callingCode: "55", validLengths: [12, 13], normalize: d => "55" + d },
    CO: { callingCode: "57", validLengths: [10, 12], normalize: d => "57" + d },
    VE: { callingCode: "58", validLengths: [12],     normalize: d => "58" + d },
    CL: { callingCode: "56", validLengths: [11],     normalize: d => "56" + d },
    MX: {
        callingCode: "52", validLengths: [12, 13],
        normalize: d => {
            if (d.startsWith("44") || d.startsWith("45")) return "521" + d.slice(2);
            return "52" + d;
        },
    },
    PE: { callingCode: "51",  validLengths: [11], normalize: d => "51" + d  },
    EC: { callingCode: "593", validLengths: [12], normalize: d => "593" + d },
    BO: { callingCode: "591", validLengths: [11], normalize: d => "591" + d },
    PY: { callingCode: "595", validLengths: [12], normalize: d => "595" + d },
};

const KNOWN_CODES = ["598", "593", "595", "591", "549", "521", "55", "57", "58", "56", "54", "52", "51"];

export function normalizePhone(raw: string, countryHint?: SupportedCountry): string {
    const stripped = raw.split("@")[0].trim();
    const hasPlus = stripped.startsWith("+");
    const digits = stripped.replace(/\D/g, "");

    if (!digits) {
        if (countryHint) throw new Error("El número de teléfono está vacío.");
        return raw;
    }

    if (hasPlus) return validated(digits, countryHint);
    if (digits.startsWith("00")) return validated(digits.slice(2), countryHint);

    if (!digits.startsWith("0")) {
        for (const code of KNOWN_CODES) {
            if (digits.startsWith(code)) return validated(digits, countryHint);
        }
        if (countryHint) {
            return validated(COUNTRY_CONFIGS[countryHint].normalize(digits), countryHint);
        }
        return digits;
    }

    const local = digits.slice(1);
    if (countryHint) {
        return validated(COUNTRY_CONFIGS[countryHint].normalize(local), countryHint);
    }
    return local;
}

function validated(normalized: string, countryHint?: SupportedCountry): string {
    if (!countryHint) return normalized;
    const cfg = COUNTRY_CONFIGS[countryHint];
    if (!cfg.validLengths.includes(normalized.length)) {
        throw new Error(
            `Número inválido: se esperan ${cfg.validLengths.join(" o ")} dígitos en total y se obtuvieron ${normalized.length}.`
        );
    }
    return normalized;
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
