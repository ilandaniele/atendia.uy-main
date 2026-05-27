export const cn = (...classes: Array<string | false | null | undefined>) => {
    return classes.filter(Boolean).join(" ");
}

export const getEnv = (key: string) => {
    if (typeof process !== 'undefined') {
        return process.env[key];
    }
    return import.meta.env[key];
}

export const getContrastColor = (hexcolor: string) => {
    if (!hexcolor) return '#ffffff';
    
    let color = hexcolor;
    if (color.startsWith('#')) {
        color = color.slice(1);
    }
    
    // Si es un color abreviado (#FFF) convertirlo a 6 caracteres
    if (color.length === 3) {
        color = color.split('').map(c => c + c).join('');
    }
    
    if (color.length !== 6) return '#ffffff';

    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    
    // YIQ equation
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Retorna negro si el color de fondo es claro (YIQ >= 128)
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

export const isPhoneNumber = (phoneNumber: string) =>
    /^5989\d{7}$/.test(phoneNumber);

export const formatPhoneNumber = (phoneNumber: string) => {
    let digits = (phoneNumber || "").split("").filter((c) => c >= "0" && c <= "9").join("");
    if (digits.startsWith("00")) {
        digits = digits.slice(2);
    }
    if (digits.startsWith("598")) {
        if (digits.length >= 11) {
            digits = digits.slice(0, 11);
        }
        return digits;
    }
    return digits;
}

export const logError = (message: string, error: any) => {
    console.error("%c" + message, "font-weight: bold;", "\n", error);
}

export function generatePassword(length = 8) {
    // Reglas compatibles con Chatwoot:
    // - al menos 1 mayúscula
    // - al menos 1 caracter especial
    // Además incluimos 1 minúscula + 1 número para robustez.
    const minLen = 8;
    const finalLength = Math.max(length, minLen);

    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const special = "!@#$%^&*()_+-=[]{}|\"/\\.,`<>:;?~'";
    const all = upper + lower + digits + special;

    const pick = (chars: string) => {
        const bytes = new Uint8Array(1);
        crypto.getRandomValues(bytes);
        return chars[bytes[0] % chars.length];
    };

    const shuffle = (arr: string[]) => {
        // Fisher–Yates
        for (let i = arr.length - 1; i > 0; i--) {
            const bytes = new Uint8Array(1);
            crypto.getRandomValues(bytes);
            const j = bytes[0] % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const pwdChars: string[] = [
        pick(upper),
        pick(lower),
        pick(digits),
        pick(special),
    ];

    while (pwdChars.length < finalLength) {
        pwdChars.push(pick(all));
    }

    return shuffle(pwdChars).join("");
}

// Convierte el índice de columna 0-based a su letra de Excel (0→A, 25→Z, 26→AA, …).
export function colIndexToLetter(index: number): string {
    let n = Math.max(0, Math.floor(index)) + 1;
    let s = "";
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

// Convierte la letra de columna de Excel (A, B, …, AA) a un índice 0-based.
// Devuelve null si el string no es una letra de columna válida.
export function colLetterToIndex(letter: string): number | null {
    const s = (letter ?? "").trim().toUpperCase();
    if (!/^[A-Z]+$/.test(s)) return null;
    let n = 0;
    for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

export function JSONResponse({
    body,
    status,
    headers,
}: {
    body: any;
    status?: {
        text: string;
        code: number;
    },
    headers: Headers
}) {
    return Response.json(body, {
        headers,
        status: status?.code,
        statusText: status?.text,
    });
}