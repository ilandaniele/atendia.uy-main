// Espejo de utils/currencies.ts — Convex no puede importar fuera de convex/.
// Mantener sincronizado al actualizar el catálogo o el formato.

interface CurrencyMeta {
    code: string;
    locale: string;
}

const CURRENCY_BY_CODE: Record<string, CurrencyMeta> = {
    UYU: { code: "UYU", locale: "es-UY" },
    ARS: { code: "ARS", locale: "es-AR" },
    BRL: { code: "BRL", locale: "pt-BR" },
    CLP: { code: "CLP", locale: "es-CL" },
    COP: { code: "COP", locale: "es-CO" },
    MXN: { code: "MXN", locale: "es-MX" },
    PEN: { code: "PEN", locale: "es-PE" },
    PYG: { code: "PYG", locale: "es-PY" },
    BOB: { code: "BOB", locale: "es-BO" },
    VES: { code: "VES", locale: "es-VE" },
    USD: { code: "USD", locale: "en-US" },
    EUR: { code: "EUR", locale: "es-ES" },
    GBP: { code: "GBP", locale: "en-GB" },
    CAD: { code: "CAD", locale: "en-CA" },
    DOP: { code: "DOP", locale: "es-DO" },
    GTQ: { code: "GTQ", locale: "es-GT" },
    HNL: { code: "HNL", locale: "es-HN" },
    NIO: { code: "NIO", locale: "es-NI" },
    CRC: { code: "CRC", locale: "es-CR" },
    PAB: { code: "PAB", locale: "es-PA" },
    SVC: { code: "SVC", locale: "es-SV" },
    CUP: { code: "CUP", locale: "es-CU" },
};

const DEFAULT_CURRENCY: CurrencyMeta = CURRENCY_BY_CODE.UYU;

function getCurrencyMeta(code?: string | null): CurrencyMeta {
    if (code && CURRENCY_BY_CODE[code]) return CURRENCY_BY_CODE[code];
    return DEFAULT_CURRENCY;
}

/**
 * Formatea un monto con el símbolo nativo del país de la moneda.
 * Ej: formatMoney(115000, "COP") → "$ 115.000"
 *     formatMoney(1234.5, "USD") → "$1,234.50"
 *     formatMoney(115000, "UYU") → "$ 115.000"
 */
export function formatMoney(amount: number, code?: string | null, opts?: { fractionDigits?: number }): string {
    const meta = getCurrencyMeta(code);
    // Por defecto sin decimales — la mayoría de monedas LATAM se muestran enteras
    // en pedidos (ej: "$ 115.000"); decimales solo si el monto los requiere.
    const fractionDigits = opts?.fractionDigits ?? (Number.isInteger(amount) ? 0 : 2);
    try {
        return new Intl.NumberFormat(meta.locale, {
            style: "currency",
            currency: meta.code,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }).format(amount);
    } catch {
        return `${meta.code} ${amount.toFixed(fractionDigits)}`;
    }
}

/**
 * Devuelve solo el símbolo nativo del país (ej "$", "R$", "€", "US$").
 * Útil para incluir en el prompt como guía de formato al modelo.
 */
export function getCurrencySymbol(code?: string | null): string {
    const meta = getCurrencyMeta(code);
    try {
        // formatToParts permite extraer la parte "currency" sin el monto.
        const parts = new Intl.NumberFormat(meta.locale, {
            style: "currency",
            currency: meta.code,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).formatToParts(0);
        const symbol = parts.find((p) => p.type === "currency")?.value;
        return symbol ?? meta.code;
    } catch {
        return meta.code;
    }
}
