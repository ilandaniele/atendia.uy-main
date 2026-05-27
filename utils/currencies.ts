/**
 * Catálogo de monedas soportadas por el panel.
 * El locale se usa para que `Intl.NumberFormat` muestre el símbolo nativo
 * del país (ej. "$" en COP/UYU/MXN, "US$" en USD, etc.).
 */
export interface CurrencyOption {
    code: string;
    name: string;
    country: string;
    flag: string;
    locale: string;
}

export const CURRENCIES: CurrencyOption[] = [
    { code: "UYU", name: "Peso uruguayo",         country: "Uruguay",              flag: "🇺🇾", locale: "es-UY" },
    { code: "ARS", name: "Peso argentino",        country: "Argentina",            flag: "🇦🇷", locale: "es-AR" },
    { code: "BRL", name: "Real brasileño",        country: "Brasil",               flag: "🇧🇷", locale: "pt-BR" },
    { code: "CLP", name: "Peso chileno",          country: "Chile",                flag: "🇨🇱", locale: "es-CL" },
    { code: "COP", name: "Peso colombiano",       country: "Colombia",             flag: "🇨🇴", locale: "es-CO" },
    { code: "MXN", name: "Peso mexicano",         country: "México",               flag: "🇲🇽", locale: "es-MX" },
    { code: "PEN", name: "Sol peruano",           country: "Perú",                 flag: "🇵🇪", locale: "es-PE" },
    { code: "PYG", name: "Guaraní paraguayo",     country: "Paraguay",             flag: "🇵🇾", locale: "es-PY" },
    { code: "BOB", name: "Boliviano",             country: "Bolivia",              flag: "🇧🇴", locale: "es-BO" },
    { code: "VES", name: "Bolívar venezolano",    country: "Venezuela",            flag: "🇻🇪", locale: "es-VE" },
    { code: "USD", name: "Dólar estadounidense",  country: "Estados Unidos",       flag: "🇺🇸", locale: "en-US" },
    { code: "EUR", name: "Euro",                  country: "Eurozona",             flag: "🇪🇺", locale: "es-ES" },
    { code: "GBP", name: "Libra esterlina",       country: "Reino Unido",          flag: "🇬🇧", locale: "en-GB" },
    { code: "CAD", name: "Dólar canadiense",      country: "Canadá",               flag: "🇨🇦", locale: "en-CA" },
    { code: "DOP", name: "Peso dominicano",       country: "República Dominicana", flag: "🇩🇴", locale: "es-DO" },
    { code: "GTQ", name: "Quetzal",               country: "Guatemala",            flag: "🇬🇹", locale: "es-GT" },
    { code: "HNL", name: "Lempira",               country: "Honduras",             flag: "🇭🇳", locale: "es-HN" },
    { code: "NIO", name: "Córdoba",               country: "Nicaragua",            flag: "🇳🇮", locale: "es-NI" },
    { code: "CRC", name: "Colón costarricense",   country: "Costa Rica",           flag: "🇨🇷", locale: "es-CR" },
    { code: "PAB", name: "Balboa",                country: "Panamá",               flag: "🇵🇦", locale: "es-PA" },
    { code: "SVC", name: "Colón salvadoreño",     country: "El Salvador",          flag: "🇸🇻", locale: "es-SV" },
    { code: "CUP", name: "Peso cubano",           country: "Cuba",                 flag: "🇨🇺", locale: "es-CU" },
];

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const DEFAULT_CURRENCY = "UYU";

export function getCurrency(code?: string | null): CurrencyOption {
    if (code && CURRENCY_BY_CODE.has(code)) return CURRENCY_BY_CODE.get(code)!;
    return CURRENCY_BY_CODE.get(DEFAULT_CURRENCY)!;
}

/**
 * Formatea un monto con el símbolo nativo del país de la moneda.
 * Ej: formatMoney(1234.5, "COP") → "$ 1.234,50"
 *     formatMoney(1234.5, "USD") → "$1,234.50"
 */
export function formatMoney(amount: number, code?: string | null, opts?: { fractionDigits?: number }): string {
    const currency = getCurrency(code);
    const fractionDigits = opts?.fractionDigits ?? 2;
    try {
        return new Intl.NumberFormat(currency.locale, {
            style: "currency",
            currency: currency.code,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }).format(amount);
    } catch {
        return `${currency.code} ${amount.toFixed(fractionDigits)}`;
    }
}
