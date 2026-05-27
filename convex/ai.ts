"use node";

import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { GeminiService } from "../lib/services/gemini.service";
import { api, internal } from "./_generated/api";
import xlsx from "node-xlsx";
import { WhapiService } from "../lib/services/whapi.service";
import { normalizePhone } from "./phoneUtils";
import { normalizeEmail } from "./emailUtils";
import { formatMoney, getCurrencySymbol } from "./currencyUtils";
import { generateContentHash } from "./knowledgeChunksHelpers";

// ----------------------------------------------------------------------
// 1. INGESTIÓN DE CONOCIMIENTO Y DATOS
// ----------------------------------------------------------------------

/**
 * Crea un chunk con embedding. Si el contenido ya existe en la KB (mismo hash
 * SHA-256), retorna `{ status: "skipped" }` SIN llamar a Gemini.
 */
export const generateAndStoreEmbedding = action({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        content: v.string(),
        metadata: v.any(),
    },
    handler: async (ctx, args): Promise<{ status: "created" | "skipped" }> => {
        // Dedup: si ya existe un chunk con el mismo hash en esta KB, salimos antes de Gemini.
        const contentHash = await generateContentHash(args.content);
        const existing = await ctx.runQuery(internal.knowledgeChunks.getByHashInternal, {
            knowledgeBaseId: args.knowledgeBaseId,
            contentHash,
        });
        if (existing) return { status: "skipped" };

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const gemini = new GeminiService({ apiKey: GEMINI_API_KEY });
        const embedding = await gemini.generateEmbedding(args.content, "RETRIEVAL_DOCUMENT");

        await ctx.runMutation(api.knowledgeChunks.create, {
            knowledgeBase: args.knowledgeBaseId,
            content: args.content,
            metadata: args.metadata,
            embedding: embedding.values,
        });
        return { status: "created" };
    }
});

/**
 * INTERNA: actualiza contenido y embedding de un chunk existente sin auth.
 * Dedup: si el hash del nuevo contenido coincide con el del chunk actual (o con
 * cualquier otro de la misma KB), retorna `{ status: "skipped" }` antes de
 * llamar a Gemini y antes de descontar tokens.
 */
export const updateAndStoreEmbeddingInternal = internalAction({
    args: {
        chunkId: v.id("knowledge_chunks"),
        content: v.string(),
        metadata: v.any(),
        clientId: v.optional(v.id("clients")),
    },
    handler: async (ctx, args): Promise<{ status: "updated" | "skipped" }> => {
        const contentHash = await generateContentHash(args.content);
        const currentChunk = await ctx.runQuery(internal.knowledgeChunks.getInternal, {
            id: args.chunkId,
        });
        if (!currentChunk) return { status: "skipped" };

        // Hash actual: usar el guardado, o computarlo si es legacy sin hash.
        const currentHash = currentChunk.contentHash
            ?? (await generateContentHash(currentChunk.content));
        if (currentHash === contentHash) return { status: "skipped" };

        // Si otro chunk de la misma KB ya tiene el nuevo hash, también skip.
        const duplicate = await ctx.runQuery(internal.knowledgeChunks.getByHashInternal, {
            knowledgeBaseId: currentChunk.knowledgeBase,
            contentHash,
        });
        if (duplicate) return { status: "skipped" };

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const gemini = new GeminiService({ apiKey: GEMINI_API_KEY });
        const embedding = await gemini.generateEmbedding(args.content, "RETRIEVAL_DOCUMENT");

        await ctx.runMutation(internal.knowledgeChunks.updateInternal, {
            id: args.chunkId,
            content: args.content,
            metadata: args.metadata,
            embedding: embedding.values,
        });

        if (args.clientId) {
            await ctx.runMutation(internal.aiQueries.deductTokens, {
                clientId: args.clientId,
                amount: embedding.tokensUsed,
                source: "excel_import",
            });
        }
        return { status: "updated" };
    },
});

/**
 * INTERNA: igual que generateAndStoreEmbedding pero sin auth (importaciones background).
 * Dedup como generateAndStoreEmbedding; tokens sólo se descuentan si efectivamente se llama a Gemini.
 */
export const generateAndStoreEmbeddingInternal = internalAction({
    args: {
        knowledgeBaseId: v.id("knowledge_bases"),
        content: v.string(),
        metadata: v.any(),
        clientId: v.optional(v.id("clients")),
    },
    handler: async (ctx, args): Promise<{ status: "created" | "skipped" }> => {
        const contentHash = await generateContentHash(args.content);
        const existing = await ctx.runQuery(internal.knowledgeChunks.getByHashInternal, {
            knowledgeBaseId: args.knowledgeBaseId,
            contentHash,
        });
        if (existing) return { status: "skipped" };

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

        const gemini = new GeminiService({ apiKey: GEMINI_API_KEY });
        const embedding = await gemini.generateEmbedding(args.content, "RETRIEVAL_DOCUMENT");

        await ctx.runMutation(internal.knowledgeChunks.createInternal, {
            knowledgeBase: args.knowledgeBaseId,
            content: args.content,
            metadata: args.metadata,
            embedding: embedding.values,
        });

        if (args.clientId) {
            await ctx.runMutation(internal.aiQueries.deductTokens, {
                clientId: args.clientId,
                amount: embedding.tokensUsed,
                source: "excel_import",
            });
        }
        return { status: "created" };
    },
});

// Convex caps arrays at 8192 entries, so a flat array of rows breaks for large
// Excel files. We split each sheet's rows into chunks the client flattens back.
const PARSE_EXCEL_CHUNK_SIZE = 4000;

export const parseExcel = action({
    args: {
        fileBuffer: v.bytes(),
    },
    handler: async (ctx, args) => {
        const workSheetsFromBuffer = xlsx.parse(args.fileBuffer);
        const sheets = workSheetsFromBuffer
            .filter(s => Array.isArray(s.data) && (s.data as unknown[][]).length > 0)
            .map(s => {
                const data = s.data as unknown[][];
                const rowChunks: unknown[][][] = [];
                for (let i = 0; i < data.length; i += PARSE_EXCEL_CHUNK_SIZE) {
                    rowChunks.push(data.slice(i, i + PARSE_EXCEL_CHUNK_SIZE));
                }
                return { name: s.name, rowChunks };
            });
        return { sheets };
    }
});


// ----------------------------------------------------------------------
// HELPERS DE INTENCIÓN
// ----------------------------------------------------------------------

// Maps an IANA timezone to a BCP-47 locale tag.
// Drives both toLocaleString formatting and the AI language instruction.
function timezoneToLocale(tz: string): string {
    // English-speaking North America
    const enUS = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Phoenix", "America/Anchorage", "America/Honolulu",
        "America/Toronto", "America/Vancouver", "America/Halifax"];
    if (enUS.includes(tz)) return "en-US";

    // Portuguese
    if (tz.startsWith("America/Sao_Paulo") || tz === "America/Manaus" ||
        tz === "America/Belem" || tz === "America/Recife" ||
        tz === "America/Fortaleza" || tz === "America/Maceio") return "pt-BR";
    if (tz === "Europe/Lisbon" || tz === "Atlantic/Madeira" || tz === "Atlantic/Azores") return "pt-PT";

    // European languages
    if (tz === "Europe/London" || tz === "Europe/Dublin") return "en-GB";
    if (["Europe/Paris", "Europe/Brussels", "Europe/Luxembourg"].includes(tz)) return "fr-FR";
    if (["Europe/Berlin", "Europe/Vienna", "Europe/Zurich"].includes(tz)) return "de-DE";
    if (tz === "Europe/Madrid" || tz === "Atlantic/Canary") return "es-ES";
    if (tz === "Europe/Rome" || tz === "Europe/Vatican" || tz === "Europe/San_Marino") return "it-IT";

    // Latin America → Spanish (most common for this product)
    if (tz.startsWith("America/")) return "es-419";

    // Fallback
    return "es-UY";
}

const LOCALE_LANGUAGE_NAME: Record<string, string> = {
    "es-UY": "español", "es-419": "español", "es-ES": "español",
    "en-US": "English", "en-GB": "English",
    "pt-BR": "português", "pt-PT": "português",
    "fr-FR": "français", "de-DE": "Deutsch", "it-IT": "italiano",
};

interface IntentSystemPromptParams {
    assistantName: string;
    clientName: string;
    description: string;
    knowledgeContext: string;
    enableOrders: boolean;
    enableAgenda: boolean;
    allowCancelAppointments?: boolean;
    allowModifyAppointments?: boolean;
    allowCancelOrders?: boolean;
    minHoursBeforeEdit?: number;
    pendingIntent?: string | null;
    pendingData?: unknown;
    knownPhone?: string;
    knownContact?: { name: string; extras?: Record<string, string> };
    currentDate?: string;
    currentTimestampMs?: number;
    timezone?: string;
    locale?: string;
    bookedSlots?: string[];
    userAppointments?: string[];
    userOrders?: string[];
    businessHours?: Array<{ day: number; isOpen: boolean; openTime: string; closeTime: string }>;
    outOfHoursOrderPolicy?: "reject" | "accept_next_day";
    currency?: string;
    /** "web" no tiene teléfono entrante: la identificación del recurrente se hace por email. */
    channelKind?: "web" | "whatsapp";
}

function buildIntentSystemPrompt(p: IntentSystemPromptParams): string {
    const locale = p.locale ?? "es-UY";
    const languageName = LOCALE_LANGUAGE_NAME[locale] ?? "español";
    const availableIntents = ["chat", "lead"];
    if (p.enableOrders) availableIntents.push("order");
    if (p.enableAgenda) availableIntents.push("appointment");
    if (p.enableAgenda && p.allowCancelAppointments) availableIntents.push("cancel_appointment");
    if (p.enableAgenda && p.allowModifyAppointments) availableIntents.push("modify_appointment");
    if (p.enableOrders && p.allowCancelOrders) availableIntents.push("cancel_order");

    const pendingCtx = p.pendingIntent
        ? `\nMODO RECOPILACIÓN ACTIVO: Estás recopilando datos para un/a "${p.pendingIntent}".
Datos ya recopilados: ${JSON.stringify(p.pendingData ?? {})}
Mantén intent="${p.pendingIntent}" y continúa pidiendo los campos faltantes. Solo cambia de intent si el usuario cancela explícitamente.\n`
        : "";

        
    const currencyCode = p.currency ?? "UYU";
    const currencySymbol = getCurrencySymbol(currencyCode);
    // Ejemplos formateados con la moneda y locale del negocio (ej: COP → "$ 115.000", USD → "$1,234").
    const exampleUnitPrice = formatMoney(200, currencyCode);
    const exampleUnitPrice2 = formatMoney(150, currencyCode);
    const exampleTotal = formatMoney(550, currencyCode);
    const orderInstructions = p.enableOrders
        ? `- "order": el usuario quiere hacer un pedido. Estructura OBLIGATORIA de collectedData (no inventar campos, no omitir ninguno cuando isComplete=true):
  · name: string — nombre del cliente.
  · deliveryAddress: string — dirección de entrega (vacío "" si el negocio no maneja envío a domicilio según el KB).
  · items: ARRAY de objetos, cada uno con EXACTAMENTE estas tres claves: { "productName": string, "quantity": number, "priceAtMoment": number }. Una entrada por producto. EJEMPLO obligatorio: [{"productName":"Recarga 13kg","quantity":2,"priceAtMoment":850},{"productName":"Válvula","quantity":1,"priceAtMoment":120}]. NUNCA dejes items vacío cuando isComplete=true; NUNCA pongas la lista solo en "response" sin replicarla aquí. Si el KB no especifica el precio unitario, usá 0 en priceAtMoment, pero el item DEBE estar.
  · totalAmount: number — suma de quantity*priceAtMoment de todos los items (number, no string, sin símbolo de moneda, sin separadores).
  · currency: string — DEBE ser siempre "${currencyCode}" (la moneda configurada por el negocio).
  · Cualquier otro campo que el KB exija (medio de pago, observaciones, horario, etc.).
isComplete=true SOLO cuando tengas todos los items confirmados con sus cantidades, totalAmount calculado, name y deliveryAddress (si aplica).
IMPORTANTE: si el usuario ya tiene un pedido activo (ver sección PEDIDOS ACTIVOS DEL USUARIO), informale que ya tiene uno en curso y preguntale si desea cancelarlo o modificarlo antes de crear uno nuevo. PASO 2: si el usuario afirma ser cliente recurrente (o pide "lo de siempre", descuentos, precios especiales) y NO aparece la sección "=== CLIENTE RECURRENTE IDENTIFICADO ===", ANTES de cotizar pedile su número habitual y guardalo en collectedData.altPhone; recién después de que el sistema lo reconozca podés aplicar condiciones especiales.

FORMATO DE MONEDA EN EL CAMPO "response" (NO en collectedData): siempre usá el símbolo nativo "${currencySymbol}" y el formato local (separador de miles según el país). NUNCA escribas el código de moneda ("UYU", "COP", "USD", etc.) en el mensaje al usuario. Ejemplos correctos para esta moneda: "${exampleUnitPrice}", "${exampleTotal}". Ejemplos PROHIBIDOS: "${currencyCode} 115000", "115,000 pesos".

Cuando isComplete=true, el campo "response" debe confirmar el pedido con un resumen en formato de lista multilínea, usando exactamente este patrón (reemplazá los datos por los reales):\n"¡Tu pedido fue registrado con éxito! 🎉\\n\\n📋 *Resumen del pedido:*\\n• 2x Producto A — ${exampleUnitPrice}\\n• 1x Producto B — ${exampleUnitPrice2}\\n\\n📍 Entrega en: [dirección]\\n💰 Total: ${exampleTotal}\\n\\nUn agente te contactará pronto para coordinar la entrega. ¡Gracias!"`
        : "";

    const bookedLine = p.bookedSlots?.length
        ? `Turnos ya reservados (NO agendes en estos horarios; si hay conflicto, informalo y ofrecé alternativas): ${p.bookedSlots.join(" | ")}.`
        : "Sin turnos reservados aún.";
    const appointmentInstructions = p.enableAgenda
        ? `- "appointment": el usuario quiere agendar un turno o cita. Fecha y hora actual: ${p.currentDate ?? "desconocida"} (zona horaria: ${p.timezone ?? "America/Montevideo"}). Reglas: (1) NO pidas el año — si no se menciona, asumí el año actual; si la fecha ya pasó en el año actual, usá el año siguiente. (2) VALIDACIÓN OBLIGATORIA: si el usuario menciona un día de la semana ("martes", "miércoles", etc.) junto con una fecha numérica, verificá que coincidan antes de agendar; si no coinciden, informá el error y corregí. (3) ${bookedLine} (4) IMPORTANTE: si el usuario ya tiene un turno activo (ver sección TURNOS ACTIVOS DEL USUARIO), informale que ya tiene uno agendado y preguntale si desea cancelarlo, modificarlo o si quiere agendar uno adicional. Recopilar en collectedData: customerName (nombre), startDatetime (fecha y hora en formato ISO 8601 local SIN zona horaria, ej: "2026-04-20T16:00:00"). Opcionalmente: endDatetime (mismo formato), notes. isComplete=true cuando tengas customerName y startDatetime.`
        : "";

    const editNotice = p.minHoursBeforeEdit !== undefined && p.minHoursBeforeEdit > 0
        ? `Los cambios y cancelaciones solo se pueden realizar con al menos ${p.minHoursBeforeEdit} hora${p.minHoursBeforeEdit !== 1 ? "s" : ""} de anticipación.`
        : "";

    const cancelAppointmentInstructions = (p.enableAgenda && p.allowCancelAppointments)
        ? `- "cancel_appointment": el usuario quiere cancelar un turno existente. ${editNotice} Recopilar en collectedData: appointmentIndex (número 1-based del turno de la lista TURNOS ACTIVOS DEL USUARIO). isComplete=true cuando tengas appointmentIndex. Al completar, confirma la cancelación al usuario.`
        : "";

    const modifyAppointmentInstructions = (p.enableAgenda && p.allowModifyAppointments)
        ? `- "modify_appointment": el usuario quiere cambiar la fecha/hora de un turno existente. ${editNotice} Recopilar en collectedData: appointmentIndex (número 1-based del turno de la lista TURNOS ACTIVOS DEL USUARIO), newStartDatetime (nueva fecha y hora en formato ISO 8601 local SIN zona horaria). Opcionalmente: newEndDatetime (mismo formato). isComplete=true cuando tengas appointmentIndex y newStartDatetime. Al completar, confirma el cambio al usuario.`
        : "";

    const cancelOrderInstructions = (p.enableOrders && p.allowCancelOrders)
        ? `- "cancel_order": el usuario quiere cancelar un pedido existente. Recopilar en collectedData: orderIndex (número 1-based del pedido de la lista PEDIDOS ACTIVOS DEL USUARIO). isComplete=true cuando tengas orderIndex. Al completar, confirma la cancelación al usuario.`
        : "";

    const userApptsCtx = p.enableAgenda && p.userAppointments?.length
        ? `\n=== TURNOS ACTIVOS DEL USUARIO ===\n${p.userAppointments.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
        : p.enableAgenda
            ? "\n=== TURNOS ACTIVOS DEL USUARIO ===\nEl usuario no tiene turnos activos actualmente.\n"
            : "";

    const userOrdersCtx = p.enableOrders && p.userOrders?.length
        ? `\n=== PEDIDOS ACTIVOS DEL USUARIO ===\n${p.userOrders.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
        : p.enableOrders
            ? "\n=== PEDIDOS ACTIVOS DEL USUARIO ===\nEl usuario no tiene pedidos activos actualmente.\n"
            : "";

    const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const businessHoursText = p.businessHours?.length
        ? p.businessHours.map(d =>
            d.isOpen ? `${DAY_NAMES[d.day]}: ${d.openTime} a ${d.closeTime}` : `${DAY_NAMES[d.day]}: Cerrado`
        ).join(", ")
        : "No configurado";

    const realtimeBlock = `\n=== DATOS DE TIEMPO REAL Y HORARIOS ===
- La hora y día actual del sistema es: ${p.currentDate ?? "desconocida"}.
- El horario de atención del negocio es: ${businessHoursText}.\n`;

    const outOfHoursBlock = p.enableOrders
        ? p.outOfHoursOrderPolicy === "accept_next_day"
            ? `\nPOLÍTICA FUERA DE HORARIO: Si es un pedido y la hora actual está fuera del horario de atención, TOMA el pedido igual, pero aclara explícitamente que se procesará o entregará al día siguiente cuando abra el local.\n`
            : `\nPOLÍTICA FUERA DE HORARIO: Si es un pedido y la hora actual está fuera del horario de atención, NO tomes el pedido. Pide disculpas e informa cuándo vuelven a abrir según el horario de atención.\n`
        : "";

    const proactiveApptRule = p.enableAgenda
        ? `\n- REGLA CRÍTICA PARA TURNOS: Cuando un usuario solicite agendar un turno, NO le hagas preguntas abiertas como "¿A qué hora preferís?". Tu obligación es: 1. Consultar la disponibilidad (ver TURNOS ACTIVOS). 2. Identificar proactivamente 2 o 3 horarios libres. 3. Ofrecer esos horarios específicos (ej: "Tengo disponibilidad a las 15:00 o a las 17:00, ¿cuál preferís?"). Si el usuario sugiere una hora ocupada, ofrecele el horario libre más cercano.`
        : "";

    // PASO 2: dos ramas de identidad — identificado vs no identificado.
    //   - Identificado: el backend ya resolvió knownContact (vía chatId, altPhone o altEmail previo).
    //   - No identificado: NO presionar la identificación. Solo se pide cuando el usuario
    //     afirma ser cliente recurrente o reclama condiciones especiales. En web se pide
    //     email (altEmail) porque no hay teléfono entrante; en WhatsApp se pide altPhone.
    const altIdField = p.channelKind === "web" ? "altEmail (email del usuario)" : "altPhone (solo dígitos o con prefijo +)";
    const altIdPrompt = p.channelKind === "web"
        ? "preguntale amablemente con qué email registró sus datos para buscarlo, y guardá ese email en collectedData.altEmail"
        : "preguntale amablemente desde qué número de teléfono suele hacer los pedidos para buscar sus datos, y guardá ese número en collectedData.altPhone (solo dígitos o con prefijo +)";
    const knownContactCtx = p.knownContact
        ? `\n=== CLIENTE RECURRENTE IDENTIFICADO ===\nEl cliente que escribe se llama ${p.knownContact.name}. Saludalo por su nombre de forma natural al inicio de la conversación, pero NO menciones proactivamente ningún otro dato.${p.knownContact.extras && Object.keys(p.knownContact.extras).length > 0 ? ` Datos adicionales disponibles (úsalos SOLO si el usuario hace una pregunta directamente relacionada, nunca de forma proactiva): ${Object.entries(p.knownContact.extras).map(([k, v]) => `${k}: ${v}`).join(", ")}.` : ""} No vuelvas a pedirle su nombre.\n`
        : `\n=== CLIENTE NO IDENTIFICADO ===\nNo tenemos datos del usuario en el sistema. NO le pidas su identificación de forma proactiva — solo pedila si el usuario afirma ser cliente recurrente, dice tener descuento, pide "lo de siempre" o solicita precios/condiciones especiales. En ese caso ${altIdPrompt} (campo: ${altIdField}). Mientras tanto, NO inventes datos del usuario y NO uses datos de otros clientes; aplicá precios y condiciones generales del KB.\nREGLA CRÍTICA: si en ESTE turno el usuario te provee su ${altIdField} (lo capturás en collectedData), NUNCA respondas "ya tengo tu información", "te identifiqué", "registrado" ni saludes por nombre. La búsqueda contra la base de contactos recién corre en el SIGUIENTE turno; vos en este turno NO sabés si ese dato matcheó algún contacto. Respondé exclusivamente algo como "Gracias, déjame consultar tus datos un momento. ¿En qué puedo ayudarte mientras tanto?" y esperá: la identificación queda confirmada SOLO si en el próximo turno aparece el bloque "=== CLIENTE RECURRENTE IDENTIFICADO ===".\n`;

    // PASO 1.5 — Capacidades activas del negocio. Esto fija explícitamente qué
    // intents son válidos y le quita al modelo la duda de si "este negocio toma
    // pedidos / agenda turnos por este canal", incluso si el RAG no trajo los
    // chunks que mencionan el flujo.
    const capabilitiesLines: string[] = [];
    if (p.enableOrders) capabilitiesLines.push("- TOMA PEDIDOS por este canal. Cuando el usuario exprese intención de pedir/comprar/encargar/recargar/contratar algo relacionado al rubro del negocio (incluso si el producto exacto no aparece en el KB recuperado), tu intent DEBE ser \"order\". NUNCA derives a un humano para tomar un pedido si este módulo está activo.");
    if (p.enableAgenda) capabilitiesLines.push("- AGENDA TURNOS / CITAS por este canal. Cuando el usuario exprese intención de reservar/agendar/coordinar un turno, tu intent DEBE ser \"appointment\".");
    if (p.enableOrders && p.allowCancelOrders) capabilitiesLines.push("- Permite cancelar pedidos existentes (intent \"cancel_order\").");
    if (p.enableAgenda && p.allowCancelAppointments) capabilitiesLines.push("- Permite cancelar turnos existentes (intent \"cancel_appointment\").");
    if (p.enableAgenda && p.allowModifyAppointments) capabilitiesLines.push("- Permite modificar turnos existentes (intent \"modify_appointment\").");
    const capabilitiesCtx = capabilitiesLines.length
        ? `\n=== CAPACIDADES ACTIVAS DEL NEGOCIO POR ESTE CANAL ===\nEste negocio:\n${capabilitiesLines.join("\n")}\n`
        : `\n=== CAPACIDADES ACTIVAS DEL NEGOCIO POR ESTE CANAL ===\nPor este canal solo se brinda información y se capturan leads (consultas a derivar a un humano).\n`;

    return `Eres '${p.assistantName}', asistente virtual de '${p.clientName}'.
Rol: ${p.description}
Idioma de respuesta: SIEMPRE responde al usuario en ${languageName}. Los campos "response" y "leadData.summary" deben estar en ${languageName}.

=== DIRECTIVA FUNDAMENTAL — FUENTE DE VERDAD ===
Tu ÚNICA fuente de verdad son tus instrucciones de "Rol:" (al inicio) y los bloques delimitados por "=== ... ===" que aparecen en este prompt:
  · Instrucciones de "Rol:" (Contiene tus reglas de negocio y lista de precios oficiales)
  · "=== BASE DE CONOCIMIENTO ===" (información extra del negocio)
  · "=== CLIENTE RECURRENTE IDENTIFICADO ===" (datos del usuario actual, si existe)
  · "=== TURNOS ACTIVOS DEL USUARIO ===" / "=== PEDIDOS ACTIVOS DEL USUARIO ==="
  · "=== DATOS DE TIEMPO REAL Y HORARIOS ==="
Cualquier dato concreto (precio, producto, dirección, etc.) DEBE existir literalmente en el "Rol:" o en alguno de esos bloques. Si no existe ahí, NO existe para vos.

Sé conversacional, cálido y entendé contextos complejos del usuario, pero tu output JAMÁS puede agregar información que no esté literalmente en esos bloques. Inferir, deducir, "completar lo razonable" o usar conocimiento general del mundo está PROHIBIDO.

PRECEDENCIA: las instrucciones específicas que aparezcan en la BASE DE CONOCIMIENTO (campos a recopilar para leads, mensajes a emitir ante consultas no cubiertas, derivaciones a links/teléfonos, políticas de manejo, scripts) tienen PRIORIDAD sobre los defaults definidos más abajo en este prompt. Si el KB dice algo distinto al default, seguí el KB literalmente.

CUÁNDO APLICA EL PROTOCOLO DE INFO FALTANTE — DISTINCIÓN CRÍTICA:
Antes de pivotar a lead, distinguí qué tipo de "falta de información" estás enfrentando. Hay DOS situaciones MUY distintas que NO debés confundir:

  CASO 1 — El USUARIO expresa una INTENCIÓN que está en CAPACIDADES ACTIVAS DEL NEGOCIO (pedido, turno, cancelación, etc.):
  → Esto NO es "información faltante". Es un FLUJO NORMAL DE RECOPILACIÓN.
  → REGLA INQUEBRANTABLE: si el módulo correspondiente está activo (ver CAPACIDADES) y el usuario expresa intención de pedir/agendar/cancelar, tu intent DEBE ser el correspondiente ("order", "appointment", etc.) Y comenzar la recopilación de campos.
  → Es IRRELEVANTE si el detalle exacto que el usuario nombra (un producto, un horario puntual) no aparece en los chunks del KB recuperados: igual iniciá la recopilación. Pedile que aclare qué quiere y los datos básicos del intent (nombre, dirección, items, fecha/hora, etc.).
  → Si el KB define campos específicos, usalos. Si no, usá los defaults del intent (para "order": nombre + teléfono/email + lo que pida + dirección si aplica; para "appointment": nombre + fecha/hora).
  → PROHIBIDO en CASO 1: pivotar a "lead", responder "no tengo esa información", "te conecto con un agente", "un asesor te contactará". Eso te saca de tu rol.
  → Ejemplo correcto: usuario dice "recarga" en un negocio con TOMA PEDIDOS activo → intent "order", response "¡Claro! ¿De qué tipo y tamaño querés la recarga? Y pasame tu nombre y dirección de entrega.". NO "te conecto con un agente".

  CASO 2 — El USUARIO te HACE UNA PREGUNTA de información (precio de un producto que no figura, dirección del local no listada, horario no documentado, política no escrita, etc.) Y NO expresa intención de pedido/turno:
  → ACÁ sí aplica el PROTOCOLO ANTE INFORMACIÓN FALTANTE de abajo.

PROTOCOLO ANTE INFORMACIÓN FALTANTE — pivote a lead (solo para CASO 2):
Si caés en CASO 2:
  1. PRIMERO consultá la BASE DE CONOCIMIENTO: ¿define un manejo específico para este tipo de consulta no cubierta? (ej. "ante consultas de precios derivá al catálogo X", "para reservas pedí nombre + teléfono + email", "consultas técnicas → +598X"). Si SÍ, seguí esas instrucciones literalmente — son la regla aplicable.
  2. Si el KB no especifica un manejo, aplicá el default:
     a. Reconocé la limitación con naturalidad (en ${languageName}), por ejemplo: "No tengo esa información disponible en este momento, pero puedo conectarte con alguien del equipo que te lo confirme."
     b. Cambiá el campo "intent" a "lead" y capturá los campos que el KB indique para leads. Si el KB no especifica campos, capturá los defaults del intent "lead" (nombre + teléfono si no es conocido + email opcional).
     c. Capturá la consulta original del usuario en "leadData.summary" para que el agente humano sepa exactamente qué responder.
  3. NUNCA inventes el dato faltante bajo ningún pretexto: NI como ejemplo, NI como aproximación, NI como "típicamente sería", NI usando conocimiento general del mundo.
  4. Excepción social: saludos, agradecimientos o preguntas conversacionales triviales ("hola", "gracias", "¿cómo estás?") NO disparan un lead — respondé con cordialidad genérica y mantené "intent" en "chat".

CUÁNDO SÍ pivotar a "lead" más allá del CASO 2:
  - El usuario PIDE EXPLÍCITAMENTE hablar con un humano/agente/persona/asesor/encargado/representante/operador.
  - El KB indica explícitamente que el tipo de consulta del usuario se deriva.
  En cualquier otra situación, si las CAPACIDADES ACTIVAS cubren la intención del usuario, NO pivotes a lead.

VERIFICACIÓN OBLIGATORIA ANTES DE RESPONDER:
Antes de emitir el JSON, releé tu campo "response" y para cada dato concreto que mencionás (cifra, nombre propio, dirección, horario, etc.) verificá mentalmente que aparezca textualmente en tus instrucciones de "Rol:" o en alguno de los bloques "=== ... ===" de arriba. Si no podés señalar dónde aparece → eliminá ese dato y reemplazalo con el protocolo de información faltante.
${pendingCtx}${capabilitiesCtx}${knownContactCtx}
=== BASE DE CONOCIMIENTO ===
${p.knowledgeContext}
=== FIN BASE DE CONOCIMIENTO ===
${userApptsCtx}${userOrdersCtx}${realtimeBlock}${outOfHoursBlock}
=== INSTRUCCIONES ===
Responde ÚNICAMENTE con un objeto JSON válido. Sin texto antes ni después del JSON. Estructura obligatoria:
{
  "intent": "${availableIntents.join('" | "')}",
  "response": "mensaje amable y conciso para el usuario en español",
  "isComplete": false,
  "collectedData": {},
  "leadData": { "name": "nombre del usuario o Desconocido", "summary": "resumen breve de su necesidad" }
}

Definición de intents:
- "chat": el usuario hace una PREGUNTA de información (no expresa intención de pedido/turno/etc., y no es un saludo). isComplete siempre es true. Reglas estrictas: (a) si la respuesta aparece literalmente en la base de conocimiento, respondé citando ese dato tal cual figura ahí; (b) si la pregunta es sobre un dato concreto (precio de un producto no listado, dirección del local no listada, horario no documentado, etc.) que NO aparece literalmente en la base de conocimiento, NO respondas en "chat": esto es CASO 2 de la directiva fundamental — cambiá "intent" a "lead" y seguí el PROTOCOLO ANTE INFORMACIÓN FALTANTE; (c) saludos, agradecimientos o preguntas sociales triviales ("hola", "gracias", "¿cómo estás?") se responden con cordialidad genérica sin agregar datos del negocio. IMPORTANTE: si el usuario expresa una INTENCIÓN soportada (quiere hacer un pedido, agendar un turno, cancelar, etc.) NO uses "chat" — usá el intent específico ("order", "appointment", etc.) y seguí su flujo de recopilación, aunque todavía no te haya dado todos los datos. Pedirle datos que el KB requiere para cerrar un pedido NO es "información faltante".
- "lead": el usuario pide hablar con una persona, muestra interés en contratar/comprar, o su consulta excede lo que puedes resolver. Pide sus datos de contacto de forma amable, de a uno por vez.${p.knownPhone ? ` El teléfono del usuario ya es conocido (${p.knownPhone}), NO lo pidas. Recopilar en collectedData: name (nombre, puede ser solo el nombre de pila). isComplete=true cuando tengas name.` : ` Recopilar en collectedData: name (nombre, puede ser solo el nombre de pila), phone (teléfono de contacto), email (correo electrónico, opcional). isComplete=true solo cuando tengas name y phone.`} Si además el usuario afirma ser cliente recurrente del negocio y no aparece la sección "=== CLIENTE RECURRENTE IDENTIFICADO ===", también recopilá el teléfono desde el cual suele hacer pedidos en collectedData.altPhone (no es obligatorio para cerrar el lead, pero ayuda al equipo a vincularlo). Al completar, confirma al usuario que un agente lo va a contactar pronto y agradece.
${orderInstructions}
${appointmentInstructions}
${cancelAppointmentInstructions}
${modifyAppointmentInstructions}
${cancelOrderInstructions}

Reglas adicionales:${proactiveApptRule}
- REGLA CRÍTICA — IDENTIDAD DEL CLIENTE: NUNCA asumas el nombre, precios, descuentos ni dirección del cliente a menos que se te pasen explícitamente bajo la etiqueta "=== CLIENTE RECURRENTE IDENTIFICADO ===". Si esa etiqueta no aparece o no contiene los datos que el usuario te pide, debés (a) usar estrictamente los precios y condiciones generales de la base de conocimiento, y (b) pedirle la dirección/teléfono según corresponda. Está terminantemente prohibido reutilizar datos de otros clientes o inferirlos del contexto previo.
- Si el usuario da su nombre u otros datos durante la conversación, captúralos en collectedData y en leadData.name.`.trim();
}

interface AIIntentResponse {
    intent: string;
    response: string;
    isComplete: boolean;
    // collectedData es free-form por intent. Campos especiales reconocidos por el backend:
    //   - altPhone?: string  → teléfono que el usuario declara como su línea habitual.
    //     Se usa para resolver knownContact en el siguiente turno (ver PASO 4 en processMessage / processWebMessage).
    collectedData: Record<string, unknown>;
    leadData: { name: string; summary: string };
}

const VALID_INTENTS = new Set([
    "chat", "lead", "order", "appointment",
    "cancel_appointment", "modify_appointment", "cancel_order",
]);

function parseAIIntentResponse(rawText: string): AIIntentResponse {
    const tryExtract = (text: string): AIIntentResponse | null => {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]);
        const intent = typeof parsed.intent === "string" && VALID_INTENTS.has(parsed.intent)
            ? parsed.intent
            : "chat";
        return {
            intent,
            response: typeof parsed.response === "string" ? parsed.response : rawText,
            isComplete: typeof parsed.isComplete === "boolean" ? parsed.isComplete : true,
            collectedData: parsed.collectedData && typeof parsed.collectedData === "object" ? parsed.collectedData : {},
            leadData: {
                name: parsed.leadData?.name ?? "Desconocido",
                summary: parsed.leadData?.summary ?? "",
            },
        };
    };

    // First attempt: parse as-is
    try {
        const result = tryExtract(rawText);
        if (result) return result;
    } catch {
        // Second attempt: Gemini sometimes includes literal newlines inside JSON string values,
        // which makes the JSON invalid. Escape them within string literals and retry.
        try {
            const sanitized = rawText.replace(/"(?:[^"\\]|\\.)*"/g, (m) =>
                m.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
            );
            const result = tryExtract(sanitized);
            if (result) return result;
        } catch {
            // fallback below
        }
    }
    return {
        intent: "chat",
        response: rawText,
        isComplete: true,
        collectedData: {},
        leadData: { name: "Desconocido", summary: "Consulta general" },
    };
}


/**
 * Convierte una cadena ISO local (e.g. "2026-04-20T16:00:00") a un timestamp
 * Unix en milisegundos interpretando la hora como hora local de `tz`.
 *
 * Estrategia: parsea la cadena como UTC (naive), luego calcula el offset
 * real de la zona horaria y lo aplica para obtener el instante UTC correcto.
 */
function localIsoToTimestamp(isoLocal: string, tz: string): number {
    // 1. Parsear como UTC para tener un punto de referencia
    const naive = new Date(isoLocal + "Z");

    // 2. Formatear ese instante UTC en la zona horaria destino
    const formatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
    });
    const tzStr = formatter.format(naive); // e.g. "2026-04-20 13:00:00"
    const tzDate = new Date(tzStr.replace(" ", "T") + "Z");

    // 3. La diferencia es el offset: cuánto hay que sumar para pasar de
    //    "hora local expresada como UTC" a "UTC real"
    const offsetMs = naive.getTime() - tzDate.getTime();
    return naive.getTime() + offsetMs;
}

// Mensaje de degradación elegante: se envía al usuario cuando todos los
// intentos a la API de Gemini fallan (503 / 429 / timeout).
const FALLBACK_MESSAGE =
    "Disculpas, en este momento estoy experimentando una alta demanda y mi sistema está saturado. Por favor, intenta escribirme de nuevo en unos minutos. 🙏";

// Queries dirigidos para asegurar que el contexto de pedidos / agenda llegue al
// modelo aunque el usuario solo escriba "hola". Sin esto, queries cortos hacen
// que el RAG no traiga los chunks que describen el flujo del negocio y el modelo
// pivotea a lead por creer que la capacidad no está soportada.
const ORDERS_DIRECTED_QUERY = "pedidos productos precios servicios catálogo entregas";
const AGENDA_DIRECTED_QUERY = "turnos citas agendar horarios disponibilidad reservas";

/**
 * Ejecuta el RAG combinando: (1) búsqueda dirigida por el mensaje del usuario,
 * (2) búsqueda dirigida por capacidades activas (cuando enableOrders / enableAgenda).
 * Devuelve el contexto unificado y el total de tokens consumidos en embeddings.
 */
async function runRagSearch(
    ctx: { runQuery: any; vectorSearch: any },
    gemini: GeminiService,
    params: {
        clientId: import("./_generated/dataModel").Id<"clients">;
        assistant: { _id: import("./_generated/dataModel").Id<"assistants">; knowledgeBases?: import("./_generated/dataModel").Id<"knowledge_bases">[] };
        userQuery: string;
        enableOrders: boolean;
        enableAgenda: boolean;
    }
): Promise<{ knowledgeContext: string; embeddingTokensUsed: number }> {
    const allKbs = await ctx.runQuery(internal.knowledgeBases.getByClientInternal, { clientId: params.clientId });
    const kbsToSearch = params.assistant.knowledgeBases?.length
        ? allKbs.filter((kb: { _id: import("./_generated/dataModel").Id<"knowledge_bases"> }) =>
            params.assistant.knowledgeBases!.includes(kb._id))
        : allKbs;

    if (kbsToSearch.length === 0) return { knowledgeContext: "", embeddingTokensUsed: 0 };

    // Embeddings: 1 por el mensaje del usuario + 1 por cada capacidad activa.
    const queries: { text: string; weight: number }[] = [{ text: params.userQuery, weight: 1 }];
    if (params.enableOrders) queries.push({ text: ORDERS_DIRECTED_QUERY, weight: 0.6 });
    if (params.enableAgenda) queries.push({ text: AGENDA_DIRECTED_QUERY, weight: 0.6 });

    const embeddings = await Promise.all(
        queries.map(q => gemini.generateEmbedding(q.text, "RETRIEVAL_QUERY"))
    );
    const embeddingTokensUsed = embeddings.reduce((sum, e) => sum + e.tokensUsed, 0);

    // Para cada query × KB, traer top-K sobre la tabla dedicada `knowledge_embeddings`.
    // `vectorSearch` retorna `{_id, _score}` donde `_id` es un row de `knowledge_embeddings`,
    // así que luego mapeamos a `chunkId` con una única query batch.
    type EmbeddingHit = { _id: import("./_generated/dataModel").Id<"knowledge_embeddings">; _score: number };
    const rawHits: EmbeddingHit[] = [];
    for (let i = 0; i < queries.length; i++) {
        const limit = i === 0 ? 4 : 3;
        const weight = queries[i].weight;
        const perKb = await Promise.all(
            kbsToSearch.map((kb: { _id: import("./_generated/dataModel").Id<"knowledge_bases"> }) =>
                ctx.vectorSearch("knowledge_embeddings", "embedding_index", {
                    vector: embeddings[i].values,
                    limit,
                    filter: (q: any) => q.eq("knowledgeBase", kb._id),
                })
            )
        );
        for (const r of perKb.flat() as EmbeddingHit[]) {
            rawHits.push({ _id: r._id, _score: r._score * weight });
        }
    }

    if (rawHits.length === 0) {
        return { knowledgeContext: "", embeddingTokensUsed };
    }

    // Resolver IDs de embeddings → chunkIds en una sola query.
    const uniqueEmbeddingIds = [...new Set(rawHits.map((h) => h._id))];
    const resolvedChunkIds: (import("./_generated/dataModel").Id<"knowledge_chunks"> | null)[] =
        await ctx.runQuery(internal.knowledgeChunks.getChunkIdsForEmbeddings, {
            ids: uniqueEmbeddingIds,
        });
    const embToChunk = new Map<string, import("./_generated/dataModel").Id<"knowledge_chunks">>();
    for (let i = 0; i < uniqueEmbeddingIds.length; i++) {
        const cid = resolvedChunkIds[i];
        if (cid) embToChunk.set(uniqueEmbeddingIds[i], cid);
    }

    // Deduplicar por chunkId conservando el mejor score, y tomar top 10.
    const bestById = new Map<string, { _id: import("./_generated/dataModel").Id<"knowledge_chunks">; _score: number }>();
    for (const h of rawHits) {
        const chunkId = embToChunk.get(h._id);
        if (!chunkId) continue;
        const prev = bestById.get(chunkId);
        if (!prev || h._score > prev._score) bestById.set(chunkId, { _id: chunkId, _score: h._score });
    }
    const topChunks = [...bestById.values()].sort((a, b) => b._score - a._score).slice(0, 10);

    const chunksText = await ctx.runQuery(internal.aiQueries.getChunksText, {
        chunkIds: topChunks.map((r) => r._id),
    });
    return {
        knowledgeContext: chunksText.join("\n\n---\n\n"),
        embeddingTokensUsed,
    };
}

// Detecta si el usuario pidió explícitamente derivar a un humano.
// Usado por el override defensivo para no forzar order cuando el usuario quiere agente.
const ASKED_FOR_HUMAN_REGEX = /\b(humano|agente|persona|asesor|encargado|representante|ejecutivo|operador)\b/i;
// Palabras del KB que sugieren que se manejan pedidos / agenda. Si aparecen en el
// contexto y el modelo igualmente cayó en lead, lo forzamos al intent correcto.
const KB_HAS_ORDERS_REGEX = /pedid|product|precio|orden|cataloga|entrega|venta|recarga|servicio/i;
const KB_HAS_AGENDA_REGEX = /turno|cita|agend|reserv|horario|disponibilidad/i;

/**
 * Parsea un valor numérico tolerando strings con separadores hispanos:
 *   "235,000" → 235000   (coma como miles)
 *   "1.500,50" → 1500.5  (punto miles, coma decimal)
 *   "$ 235.000 pesos" → 235000
 *   "1,5" → 1.5          (coma decimal cuando no parece miles)
 * Devuelve NaN si no se puede interpretar.
 */
function parseLooseNumber(raw: unknown): number {
    if (typeof raw === "number") return raw;
    if (typeof raw !== "string") return NaN;
    let s = raw.trim().replace(/[^\d.,-]/g, "");
    if (!s) return NaN;
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
        // El que aparece después es el decimal; el otro es separador de miles.
        if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
        else s = s.replace(/,/g, "");
    } else if (lastComma >= 0) {
        const after = s.length - lastComma - 1;
        // Si después de la coma hay 3 dígitos exactos, es separador de miles. Si no, decimal.
        s = after === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

interface NormalizedOrderItem {
    productName: string;
    quantity: number;
    priceAtMoment: number;
}

/**
 * Normaliza el array de items que devuelve el modelo, parseando strings numéricos
 * en quantity / priceAtMoment con tolerancia (separadores de miles, símbolos, etc.).
 * Filtra items sin productName o sin cantidad positiva.
 */
function parseOrderItems(raw: unknown): NormalizedOrderItem[] {
    if (!Array.isArray(raw)) return [];
    const out: NormalizedOrderItem[] = [];
    for (const it of raw) {
        if (!it || typeof it !== "object") continue;
        const obj = it as Record<string, unknown>;
        const productName = typeof obj.productName === "string"
            ? obj.productName.trim()
            : (typeof obj.name === "string" ? obj.name.trim() : "");
        const quantity = parseLooseNumber(obj.quantity ?? obj.qty);
        const priceAtMoment = parseLooseNumber(
            obj.priceAtMoment ?? obj.price ?? obj.unitPrice ?? obj.precio
        );
        if (!productName || !Number.isFinite(quantity) || quantity <= 0) continue;
        out.push({
            productName,
            quantity,
            priceAtMoment: Number.isFinite(priceAtMoment) ? priceAtMoment : 0,
        });
    }
    return out;
}

// ----------------------------------------------------------------------
// 2. PROCESAMIENTO DE MENSAJES WEB (WIDGET EMBEBIBLE)
// ----------------------------------------------------------------------

export const processWebMessage = action({
    args: {
        channelId: v.id("channels"),
        sessionId: v.string(),
        messageText: v.string(),
    },
    handler: async (ctx, args) => {
        const channel = await ctx.runQuery(api.channels.get, { id: args.channelId });
        if (!channel?.assistant) {
            console.error("Canal no encontrado o sin asistente configurado");
            return;
        }

        // Crear estado de conversación si no existe
        let conversationState = await ctx.runQuery(api.conversationStates.getBySessionId, { sessionId: args.sessionId });
        if (!conversationState) {
            await ctx.runMutation(internal.conversationStates.create, {
                sessionId: args.sessionId,
                status: "ACTIVE",
                channel: args.channelId,
            });
            conversationState = await ctx.runQuery(api.conversationStates.getBySessionId, { sessionId: args.sessionId });
        }

        // Guardar mensaje del usuario siempre
        await ctx.runMutation(internal.aiQueries.saveUserMessage, {
            channelId: args.channelId,
            sessionId: args.sessionId,
            content: args.messageText,
            messageId: `web-${crypto.randomUUID()}`,
        });

        // Si está pausada, el operador tomó el control — no responder con IA
        if (conversationState && ["IGNORED", "PAUSED"].includes(conversationState.status)) return;

        const contextData = await ctx.runQuery(internal.aiQueries.getBotContext, {
            clientId: channel.client,
            channelId: args.channelId,
            sessionId: args.sessionId,
        });

        if (!contextData.assistant || !contextData.client) {
            console.error("Falta configuración del asistente o cliente");
            return;
        }

        const { client, assistant, history } = contextData;

        // ── FAIL-FAST: verificar saldo antes de instanciar cualquier servicio ──
        if (!client.isActive || (client.trialEndsAt && Date.now() > client.trialEndsAt && !client.plan) || client.tokensBalance <= 0) {
            return;
        }

        // ── Multi-key: clientes de pago usan GEMINI_API_KEY_PAID,
        //    trial usa GEMINI_API_KEY_FREE (sin tarjeta en AI Studio) ──────────
        const geminiApiKey = client.plan
            ? (process.env.GEMINI_API_KEY_PAID ?? process.env.GEMINI_API_KEY)
            : (process.env.GEMINI_API_KEY_FREE ?? process.env.GEMINI_API_KEY);
        if (!geminiApiKey) throw new Error("No Gemini API key configured");

        const gemini = new GeminiService({ apiKey: geminiApiKey });

        const enableOrders = client.features?.enableOrders ?? false;
        const enableAgenda = client.features?.enableAgenda ?? false;
        const allowCancelAppointments = client.features?.allowCancelAppointments ?? false;
        const allowModifyAppointments = client.features?.allowModifyAppointments ?? false;
        const allowCancelOrders = client.features?.allowCancelOrders ?? false;
        const minHoursBeforeEdit = client.features?.minHoursBeforeEdit ?? 0;

        // RAG: combina búsqueda por mensaje del usuario + dirigidas según capacidades activas.
        const { knowledgeContext, embeddingTokensUsed } = await runRagSearch(ctx, gemini, {
            clientId: client._id,
            assistant,
            userQuery: args.messageText,
            enableOrders,
            enableAgenda,
        });
        const pendingIntent = conversationState?.pendingIntent ?? null;
        const pendingData = conversationState?.pendingData ?? null;
        const tz = (client as { timezone?: string }).timezone ?? "America/Montevideo";
        const locale = timezoneToLocale(tz);

        const existingAppts = enableAgenda
            ? await ctx.runQuery(internal.appointments.getByClientInternal, { clientId: client._id })
            : [];
        // Solo mostramos al asistente los turnos del propio canal — así clientes
        // con múltiples canales/asistentes no comparten agenda accidentalmente.
        // Turnos antiguos sin `channel` (pre-multi-canal) se incluyen igual.
        const bookedSlots = existingAppts
            .filter((a) => a.status !== "canceled"
                && a.start > Date.now() - 86400000
                && (a.channel === undefined || a.channel === args.channelId))
            .map((a) => new Date(a.start).toLocaleString(locale, {
                weekday: "long", day: "2-digit", month: "long",
                hour: "2-digit", minute: "2-digit", timeZone: tz,
            }) + ` — ${a.customerName}`);

        // Registros activos del usuario (para contexto IA y prevención de duplicados).
        // Filtramos por channelId para que clientes con múltiples canales/asistentes
        // no bloqueen creación cruzada entre canales.
        const userRecords = await ctx.runQuery(internal.aiQueries.getActiveUserRecords, {
            clientId: client._id,
            channelId: args.channelId,
            sessionId: args.sessionId,
        });

        const userAppointments = userRecords.appointments.map((a) =>
            new Date(a.start).toLocaleString(locale, {
                weekday: "long", day: "2-digit", month: "long",
                hour: "2-digit", minute: "2-digit", timeZone: tz,
            }) + ` — ${a.customerName} (${a.status})`
        );
        const userOrders = userRecords.orders.map((o) => {
            const items = (o.items as Array<{ productName: string; quantity: number }>)
                .map((i) => `${i.quantity}x ${i.productName}`).join(", ");
            return `${items} — ${formatMoney(o.totalAmount, o.currency)} (${o.status})`;
        });

        // PASO 4 — Búsqueda dinámica del cliente recurrente.
        // En Web no hay teléfono entrante (sesión anónima): los disparadores son altEmail
        // (preferido en web) o altPhone, recopilados por el LLM en un turno anterior.
        let knownContact: { name: string; extras?: Record<string, string> } | undefined;
        if ((assistant as any).features?.recognizeContacts) {
            const pd = pendingData as { altEmail?: unknown; altPhone?: unknown } | null;
            const pendingAltEmail = pd?.altEmail;
            if (typeof pendingAltEmail === "string" && pendingAltEmail.trim()) {
                try {
                    const normalized = normalizeEmail(pendingAltEmail.trim());
                    const contact = await ctx.runQuery(internal.contacts.getByAssistantAndEmail, {
                        assistantId: assistant._id,
                        email: normalized,
                    });
                    if (contact) {
                        knownContact = {
                            name: contact.name,
                            extras: contact.extras as Record<string, string> | undefined,
                        };
                    }
                } catch {
                    // normalizeEmail tira si el formato es inválido — knownContact queda undefined.
                }
            }
            if (!knownContact) {
                const pendingAltPhone = pd?.altPhone;
                if (typeof pendingAltPhone === "string" && pendingAltPhone.trim()) {
                    const contact = await ctx.runQuery(internal.contacts.findByAssistantAndRawPhone, {
                        assistantId: assistant._id,
                        rawPhone: pendingAltPhone.trim(),
                    });
                    if (contact) {
                        knownContact = {
                            name: contact.name,
                            extras: contact.extras as Record<string, string> | undefined,
                        };
                    }
                }
            }
        }

        const now = Date.now();
        const systemInstruction = buildIntentSystemPrompt({
            assistantName: assistant.name,
            clientName: client.name,
            description: assistant.description,
            knowledgeContext,
            enableOrders,
            enableAgenda,
            allowCancelAppointments,
            allowModifyAppointments,
            allowCancelOrders,
            minHoursBeforeEdit,
            pendingIntent,
            pendingData,
            currentDate: new Date(now).toLocaleString(locale, {
                weekday: "long", year: "numeric", month: "long", day: "2-digit",
                hour: "2-digit", minute: "2-digit", timeZone: tz,
            }),
            currentTimestampMs: now,
            timezone: tz,
            locale,
            bookedSlots,
            userAppointments,
            userOrders,
            businessHours: (client.config as any)?.businessHours,
            outOfHoursOrderPolicy: (client.config as any)?.outOfHoursOrderPolicy ?? "reject",
            currency: (client.config as any)?.currency ?? "UYU",
            knownContact,
            channelKind: "web",
        });

        // ── Llamada a Gemini con fallback a key paid y degradación elegante ──
        let rawText: string;
        let tokensUsed: number;
        try {
            const result = await gemini.generateChatResponse(systemInstruction, history, args.messageText);
            rawText = result.text;
            tokensUsed = result.tokensUsed;
        } catch (primaryErr) {
            // Si usamos la key free y hay una key paid distinta, reintentamos una vez.
            const paidKey = process.env.GEMINI_API_KEY_PAID ?? process.env.GEMINI_API_KEY;
            let retryResult: { text: string; tokensUsed: number } | null = null;
            if (paidKey && paidKey !== geminiApiKey) {
                console.warn("[AI:web] Key free falló (503/429), reintentando con key paid:", primaryErr);
                try {
                    retryResult = await new GeminiService({ apiKey: paidKey }).generateChatResponse(
                        systemInstruction, history, args.messageText
                    );
                } catch (retryErr) {
                    console.error("[AI:web] Key paid también falló:", retryErr);
                }
            } else {
                console.error("[AI:web] Gemini falló (sin key alternativa disponible):", primaryErr);
            }
            // Si todos los intentos fallaron, guardamos el mensaje de degradación y salimos.
            if (!retryResult) {
                await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                    channelId: args.channelId,
                    sessionId: args.sessionId,
                    content: FALLBACK_MESSAGE,
                    messageId: `web-fallback-${Date.now()}`,
                });
                return;
            }
            rawText = retryResult.text;
            tokensUsed = retryResult.tokensUsed;
        }

        await ctx.runMutation(internal.aiQueries.deductTokens, {
            clientId: client._id,
            amount: tokensUsed + embeddingTokensUsed,
            channelId: args.channelId,
            source: "web",
            sessionId: args.sessionId,
        });

        const aiResult = parseAIIntentResponse(rawText);

        // Normalizar intent según features habilitadas
        let intent = aiResult.intent;
        if (intent === "order" && !enableOrders) intent = "lead";
        if (intent === "appointment" && !enableAgenda) intent = "lead";
        if (intent === "cancel_appointment" && (!enableAgenda || !allowCancelAppointments)) intent = "chat";
        if (intent === "modify_appointment" && (!enableAgenda || !allowModifyAppointments)) intent = "chat";
        if (intent === "cancel_order" && (!enableOrders || !allowCancelOrders)) intent = "chat";

        // Override defensivo: si el modelo cayó en "lead" pero el usuario NO pidió humano
        // y el KB describe el flujo (pedidos / agenda) con un módulo activo, lo forzamos
        // al intent correcto y dejamos al modelo continuar la recopilación en el próximo turno.
        const askedForHuman = ASKED_FOR_HUMAN_REGEX.test(args.messageText);
        if (intent === "lead" && !askedForHuman && !pendingIntent) {
            if (enableOrders && KB_HAS_ORDERS_REGEX.test(knowledgeContext)) {
                intent = "order";
                aiResult.isComplete = false;
                if (!aiResult.response || /agente|asesor|humano/i.test(aiResult.response)) {
                    aiResult.response = "¡Claro! Decime qué necesitás y lo coordinamos.";
                }
            } else if (enableAgenda && KB_HAS_AGENDA_REGEX.test(knowledgeContext)) {
                intent = "appointment";
                aiResult.isComplete = false;
                if (!aiResult.response || /agente|asesor|humano/i.test(aiResult.response)) {
                    aiResult.response = "¡Claro! Decime para qué fecha y horario querés el turno.";
                }
            }
        }

        // Combinar datos previos con los nuevos
        const mergedData = { ...(pendingData as Record<string, unknown> ?? {}), ...aiResult.collectedData };
        const stateId = conversationState!._id;
        const botMessageId = `web-bot-${crypto.randomUUID()}`;

        if (intent === "chat") {
            if (pendingIntent) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
            }
            // Persist altPhone/altEmail captured this turn so the next turn can
            // resolve knownContact even when intent is "chat".
            const collected = (aiResult.collectedData ?? {}) as Record<string, unknown>;
            const identityPatch: Record<string, unknown> = {};
            if (typeof collected.altPhone === "string" && collected.altPhone.trim()) {
                identityPatch.altPhone = collected.altPhone.trim();
            }
            if (typeof collected.altEmail === "string" && collected.altEmail.trim()) {
                identityPatch.altEmail = collected.altEmail.trim();
            }
            if (Object.keys(identityPatch).length > 0) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingData: identityPatch,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });

        } else if (intent === "lead") {
            if (aiResult.isComplete) {
                // Prevención de duplicados: no crear si ya hay un lead activo
                // Guard: solo crear si se recopiló al menos el nombre (no guardar "Desconocido")
                const resolvedName = String(mergedData.name ?? aiResult.leadData.name ?? "");
                const hasName = resolvedName && resolvedName !== "Desconocido";
                const created = userRecords.leads.length === 0 && hasName;
                if (created) {
                    await ctx.runMutation(internal.leads.create, {
                        channel: args.channelId,
                        client: client._id,
                        type: "lead",
                        name: resolvedName,
                        phone: String(mergedData.phone ?? args.sessionId),
                        status: "new",
                        summary: aiResult.leadData.summary,
                        requiresAction: true,
                        data: mergedData,
                    });
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        sessionId: args.sessionId,
                        content: `[Lead creado] ${resolvedName}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "lead.created",
                        data: { name: resolvedName, phone: String(mergedData.phone ?? args.sessionId), status: "new", summary: aiResult.leadData.summary, ...mergedData },
                    });
                }
                // Solo pausamos la IA si efectivamente creamos el lead. Si el
                // lead se saltea por duplicado (mismo canal) o por falta de
                // nombre, mantenemos el estado ACTIVE para no silenciar mensajes
                // siguientes del usuario en este canal.
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    ...(created ? { status: "PAUSED" as const } : {}),
                    clearPending: true,
                });
            } else {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "lead",
                    pendingData: mergedData,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });

        } else if (intent === "order") {
            if (aiResult.isComplete) {
                const clientCurrency = (client.config as any)?.currency ?? "UYU";
                const items = parseOrderItems(mergedData.items);
                const computedTotal = items.reduce((sum, i) => sum + i.quantity * i.priceAtMoment, 0);
                const declaredTotal = parseLooseNumber(mergedData.totalAmount);
                const totalAmount = Number.isFinite(declaredTotal) && declaredTotal > 0 ? declaredTotal : computedTotal;

                if (items.length === 0) {
                    console.warn("[AI:web] Order skipped: no valid items in collectedData", { mergedData });
                } else if (userRecords.orders.length > 0) {
                    console.warn("[AI:web] Order skipped: user already has active order", {
                        sessionId: args.sessionId,
                        activeOrderIds: userRecords.orders.map((o) => o._id),
                    });
                } else {
                    await ctx.runMutation(internal.orders.create, {
                        client: client._id,
                        channel: args.channelId,
                        assistant: assistant._id,
                        phone: args.sessionId,
                        name: String(mergedData.name ?? "Desconocido"),
                        deliveryAddress: String(mergedData.deliveryAddress ?? ""),
                        items,
                        totalAmount,
                        currency: String(mergedData.currency ?? clientCurrency),
                        status: "pending",
                    });
                    const orderItemsPreview = items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        sessionId: args.sessionId,
                        content: `[Pedido creado] ${orderItemsPreview} — ${formatMoney(totalAmount, clientCurrency)}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "order.created",
                        data: { ...mergedData, items, totalAmount },
                    });
                }
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    clearPending: true,
                });
            } else {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "order",
                    pendingData: mergedData,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });

        } else if (intent === "appointment") {
            if (aiResult.isComplete) {
                const startTs = mergedData.startDatetime
                    ? localIsoToTimestamp(String(mergedData.startDatetime), tz)
                    : Number(mergedData.start);
                const endTs = mergedData.endDatetime
                    ? localIsoToTimestamp(String(mergedData.endDatetime), tz)
                    : mergedData.end ? Number(mergedData.end) : undefined;
                // Prevención de duplicados: no crear si ya existe uno en el mismo horario
                const duplicate = userRecords.appointments.some((a) => a.start === startTs);
                if (!duplicate) {
                    const appointmentId = await ctx.runMutation(internal.appointments.create, {
                        client: client._id,
                        channel: args.channelId,
                        customerName: String(mergedData.customerName ?? "Desconocido"),
                        customerPhone: args.sessionId,
                        start: startTs,
                        end: endTs,
                        notes: mergedData.notes ? String(mergedData.notes) : undefined,
                        status: "pending",
                    });
                    await ctx.scheduler.runAfter(0, internal.googleCalendar.syncForClient, {
                        appointmentId,
                        clientId: client._id,
                        operation: "upsert",
                    });
                    const reminderHours = (client.config as any)?.appointmentReminderHours ?? 24;
                    const reminderTs = startTs - reminderHours * 3600000;
                    if (reminderTs > Date.now()) {
                        await ctx.scheduler.runAt(reminderTs, internal.ai.sendAppointmentReminder, { appointmentId });
                    }
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        sessionId: args.sessionId,
                        content: `[Turno agendado] ${String(mergedData.customerName ?? "Desconocido")} — ${new Date(startTs).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "appointment.created",
                        data: { ...mergedData, start: startTs, end: endTs },
                    });
                }
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    clearPending: true,
                });
            } else {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "appointment",
                    pendingData: mergedData,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });

        } else if (intent === "cancel_appointment") {
            if (aiResult.isComplete) {
                const idx = Number(mergedData.appointmentIndex) - 1;
                const target = userRecords.appointments[idx];
                if (target) {
                    const minMs = minHoursBeforeEdit * 3600000;
                    if (!(minMs > 0 && target.start - now < minMs)) {
                        await ctx.runMutation(internal.aiQueries.cancelAppointmentByAI, { id: target._id });
                        await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                            channelId: args.channelId,
                            sessionId: args.sessionId,
                            content: `[Turno cancelado] ${target.customerName} — ${new Date(target.start).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
                            messageId: `sys-${crypto.randomUUID()}`,
                        });
                        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                            clientId: client._id,
                            event: "appointment.updated",
                            data: { ...target, status: "canceled" },
                        });
                    }
                }
                await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
            } else {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "cancel_appointment",
                    pendingData: mergedData,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });

        } else if (intent === "modify_appointment") {
            if (aiResult.isComplete) {
                const idx = Number(mergedData.appointmentIndex) - 1;
                const target = userRecords.appointments[idx];
                if (target) {
                    const minMs = minHoursBeforeEdit * 3600000;
                    if (!(minMs > 0 && target.start - now < minMs)) {
                        const newStart = localIsoToTimestamp(String(mergedData.newStartDatetime), tz);
                        const newEnd = mergedData.newEndDatetime
                            ? localIsoToTimestamp(String(mergedData.newEndDatetime), tz)
                            : undefined;
                        await ctx.runMutation(internal.aiQueries.modifyAppointmentByAI, {
                            id: target._id,
                            start: newStart,
                            end: newEnd,
                        });
                        await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                            channelId: args.channelId,
                            sessionId: args.sessionId,
                            content: `[Turno modificado] ${target.customerName} — nuevo: ${new Date(newStart).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
                            messageId: `sys-${crypto.randomUUID()}`,
                        });
                        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                            clientId: client._id,
                            event: "appointment.updated",
                            data: { ...target, start: newStart, end: newEnd },
                        });
                    }
                }
                await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
            } else {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "modify_appointment",
                    pendingData: mergedData,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });

        } else if (intent === "cancel_order") {
            if (aiResult.isComplete) {
                const idx = Number(mergedData.orderIndex) - 1;
                const target = userRecords.orders[idx];
                if (target) {
                    await ctx.runMutation(internal.aiQueries.cancelOrderByAI, { id: target._id });
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        sessionId: args.sessionId,
                        content: `[Pedido cancelado] ${target.name ?? "Desconocido"}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "order.updated",
                        data: { ...target, status: "canceled" },
                    });
                }
                await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
            } else {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "cancel_order",
                    pendingData: mergedData,
                });
            }
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                sessionId: args.sessionId,
                content: aiResult.response,
                messageId: botMessageId,
            });
        }
    }
});


// ----------------------------------------------------------------------
// 3. PROCESAMIENTO DE MENSAJES (BACKGROUND ACTION DESDE EL WEBHOOK WHATSAPP)
// ----------------------------------------------------------------------

export const processMessage = action({
    args: {
        chatId: v.string(),
        clientId: v.id("clients"),
        channelId: v.id("channels"),
        messageText: v.string(),
        messageVoice: v.optional(v.object({
            id: v.string(),
            mimeType: v.string(),
            seconds: v.number(),
            messageId: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        const contextData = await ctx.runQuery(internal.aiQueries.getBotContext, {
            clientId: args.clientId,
            channelId: args.channelId,
            chatId: args.chatId,
        });

        if (!contextData.assistant || !contextData.channel) {
            console.error("Falta configuración del asistente o canal");
            return;
        }

        const { client, assistant, channel, history, conversationState } = contextData;

        // Si el operador tomó el control, no responder con IA
        if (conversationState && ["IGNORED", "PAUSED"].includes(conversationState.status)) return;

        // Modo de pruebas: solo responder a los números habilitados
        const channelTestMode = (channel.config as any)?.testMode === true;
        if (channelTestMode) {
            const testPhones: string[] = (channel.config as any)?.testPhones ?? [];
            const normalizedChatId = normalizePhone(args.chatId);
            if (!testPhones.some(p => p === normalizedChatId)) {
                return;
            }
        }

        // ── FAIL-FAST: verificar saldo antes de instanciar cualquier servicio ──
        if (!client.isActive || (client.trialEndsAt && Date.now() > client.trialEndsAt && !client.plan) || client.tokensBalance <= 0) {
            return;
        }

        const whapi = new WhapiService({ token: channel.config.whapiToken });

        // ── Multi-key: clientes de pago usan GEMINI_API_KEY_PAID,
        //    trial usa GEMINI_API_KEY_FREE (sin tarjeta en AI Studio) ──────────
        const geminiApiKey = client.plan
            ? (process.env.GEMINI_API_KEY_PAID ?? process.env.GEMINI_API_KEY)
            : (process.env.GEMINI_API_KEY_FREE ?? process.env.GEMINI_API_KEY);
        if (!geminiApiKey) throw new Error("No Gemini API key configured");

        const gemini = new GeminiService({ apiKey: geminiApiKey });

        // Si es nota de voz y el cliente tiene transcripción activa, descargar y transcribir.
        // El chat ya fue insertado por handleInboundMessage como placeholder
        // (content="" + media). Acá actualizamos content con la transcripción y
        // ajustamos el history en memoria para que generateChatResponse reciba el
        // texto correcto (sin esto, history tendría un mensaje user vacío y Gemini
        // tira "contents are required").
        let effectiveMessageText = args.messageText;
        let effectiveHistory = history;
        if (args.messageVoice) {
            try {
                const buf = await whapi.getMedia(args.messageVoice.id);
                if (!buf) throw new Error("Whapi getMedia returned null");
                const { text: transcript, tokensUsed: ttok } = await gemini.transcribeAudio(buf, args.messageVoice.mimeType);

                // Cobrar la llamada a Gemini incluso si el audio resultó inaudible
                // (Gemini ya consumió cómputo).
                if (ttok > 0) {
                    await ctx.runMutation(internal.aiQueries.deductTokens, {
                        clientId: client._id,
                        amount: ttok,
                        channelId: args.channelId,
                        source: "whatsapp",
                        phone: args.chatId,
                    });
                }

                if (!transcript) throw new Error("Empty transcript");
                // Marcador devuelto por Gemini cuando el audio no es claro/coherente.
                // Tratamos esto igual que una transcripción fallida: avisamos al usuario
                // sin bloquear el flujo (no tocamos pendingIntent/pendingData).
                if (/^_+INAUDIBLE_+$/i.test(transcript)) throw new Error("Inaudible transcript");

                await ctx.runMutation(internal.chats.updateContentByMessageId, {
                    messageId: args.messageVoice.messageId,
                    content: transcript,
                });

                effectiveMessageText = transcript;
                effectiveHistory = history.map((h) =>
                    h.messageId === args.messageVoice!.messageId
                        ? { ...h, content: transcript }
                        : h
                );
                // Si el placeholder no estaba en history (cargado antes del claim),
                // lo agregamos al final.
                if (!effectiveHistory.some((h) => h.messageId === args.messageVoice!.messageId)) {
                    effectiveHistory = [
                        ...effectiveHistory,
                        { role: "user", content: transcript } as any,
                    ];
                }
            } catch (err) {
                console.error("Transcripción de audio falló:", err);

                // El placeholder con media ya fue creado por handleInboundMessage.
                // Solo enviamos el aviso al usuario y salimos — no tocamos pendingIntent.
                const failMsg = "Disculpá, no pude entender tu audio. ¿Podés escribirme el mensaje?";
                let sentMessageId = `bot-local-${Date.now()}`;
                try {
                    const whapiResult = await whapi.sendMessage(args.chatId, failMsg);
                    if (whapiResult?.id) sentMessageId = whapiResult.id;
                } catch (sendErr) {
                    console.error("Error enviando aviso de transcripción fallida:", sendErr);
                }

                await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                    channelId: args.channelId,
                    phone: args.chatId,
                    content: failMsg,
                    messageId: sentMessageId,
                });

                return;
            }
        }

        // Interceptamos mensajes multimedia (imágenes, stickers, etc.) acorde a la configuración
        // del cliente, respondiendo con un mensaje predefinido y evitando procesar con IA.
        // Si llegamos acá con messageVoice, ya transcribimos arriba — el flujo continúa con texto.
        if (!effectiveMessageText.trim()) {
            if (client.features?.blockMultimedia === false) return;

            const multimediaMsg = "Disculpa, soy un asistente virtual y por ahora solo puedo entender mensajes de texto. Por favor, escribime lo que necesitas y haré lo posible por ayudarte.";

            let sentMessageId = `bot-local-${Date.now()}`;
            try {
                const whapiResult = await whapi.sendMessage(args.chatId, multimediaMsg);
                if (whapiResult?.id) sentMessageId = whapiResult.id;
            } catch (error) {
                console.error("Error enviando mensaje de multimedia por Whapi:", error);
            }

            // Guardamos la respuesta en la base de datos para mantener el historial coherente
            await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                channelId: args.channelId,
                phone: args.chatId,
                content: multimediaMsg,
                messageId: sentMessageId,
            });

            return;
        }

        const enableOrders = client.features?.enableOrders ?? false;
        const enableAgenda = client.features?.enableAgenda ?? false;
        const allowCancelAppointmentsWa = client.features?.allowCancelAppointments ?? false;
        const allowModifyAppointmentsWa = client.features?.allowModifyAppointments ?? false;
        const allowCancelOrdersWa = client.features?.allowCancelOrders ?? false;
        const minHoursBeforeEditWa = client.features?.minHoursBeforeEdit ?? 0;

        // RAG: combina búsqueda por mensaje del usuario + dirigidas según capacidades activas.
        const { knowledgeContext, embeddingTokensUsed: embeddingTokensUsedWa } = await runRagSearch(ctx, gemini, {
            clientId: client._id,
            assistant,
            userQuery: effectiveMessageText,
            enableOrders,
            enableAgenda,
        });
        const autoSaveContacts = (client.features as any)?.autoSaveContacts === true
            && assistant.features?.recognizeContacts === true;
        const pendingIntent = conversationState?.pendingIntent ?? null;
        const pendingData = conversationState?.pendingData ?? null;
        const tz = (client as { timezone?: string }).timezone ?? "America/Montevideo";
        const locale = timezoneToLocale(tz);

        const existingAppts = enableAgenda
            ? await ctx.runQuery(internal.appointments.getByClientInternal, { clientId: client._id })
            : [];
        // Solo mostramos al asistente los turnos del propio canal — así clientes
        // con múltiples canales/asistentes no comparten agenda accidentalmente.
        // Turnos antiguos sin `channel` (pre-multi-canal) se incluyen igual.
        const bookedSlots = existingAppts
            .filter((a) => a.status !== "canceled"
                && a.start > Date.now() - 86400000
                && (a.channel === undefined || a.channel === args.channelId))
            .map((a) => new Date(a.start).toLocaleString(locale, {
                weekday: "long", day: "2-digit", month: "long",
                hour: "2-digit", minute: "2-digit", timeZone: tz,
            }) + ` — ${a.customerName}`);

        // Registros activos del usuario (para contexto IA y prevención de duplicados).
        // Filtramos por channelId para que clientes con múltiples canales/asistentes
        // no bloqueen creación cruzada entre canales.
        const userRecordsWa = await ctx.runQuery(internal.aiQueries.getActiveUserRecords, {
            clientId: client._id,
            channelId: args.channelId,
            phone: args.chatId,
        });

        const userAppointmentsWa = userRecordsWa.appointments.map((a) =>
            new Date(a.start).toLocaleString(locale, {
                weekday: "long", day: "2-digit", month: "long",
                hour: "2-digit", minute: "2-digit", timeZone: tz,
            }) + ` — ${a.customerName} (${a.status})`
        );
        const userOrdersWa = userRecordsWa.orders.map((o) => {
            const items = (o.items as Array<{ productName: string; quantity: number }>)
                .map((i) => `${i.quantity}x ${i.productName}`).join(", ");
            return `${items} — ${formatMoney(o.totalAmount, o.currency)} (${o.status})`;
        });

        // PASO 4 — Búsqueda dinámica del cliente recurrente.
        // Prioridad: altPhone declarado por el usuario en un turno previo > chatId entrante.
        // Esto permite que un cliente que escribe desde un número distinto (ej. familiar)
        // sea reconocido cuando el LLM le pregunta su teléfono habitual.
        let knownContact: { name: string; extras?: Record<string, string> } | undefined;
        if (assistant.features?.recognizeContacts) {
            const pd = (pendingData as { altPhone?: unknown; phone?: unknown } | null) ?? null;
            // Try in order: altPhone (canonical identity field), phone (some KBs lead
            // Gemini to store the recurring-customer number under "phone"), then chatId.
            const candidates: string[] = [];
            for (const v of [pd?.altPhone, pd?.phone, args.chatId]) {
                if (typeof v === "string" && v.trim()) candidates.push(v.trim());
            }
            for (const raw of candidates) {
                const contact = await ctx.runQuery(internal.contacts.findByAssistantAndRawPhone, {
                    assistantId: assistant._id,
                    rawPhone: raw,
                });
                if (contact) {
                    knownContact = {
                        name: contact.name,
                        extras: contact.extras as Record<string, string> | undefined,
                    };
                    break;
                }
            }
        }

        const nowWa = Date.now();
        const systemInstruction = buildIntentSystemPrompt({
            assistantName: assistant.name,
            clientName: client.name,
            description: assistant.description,
            knowledgeContext,
            enableOrders,
            enableAgenda,
            allowCancelAppointments: allowCancelAppointmentsWa,
            allowModifyAppointments: allowModifyAppointmentsWa,
            allowCancelOrders: allowCancelOrdersWa,
            minHoursBeforeEdit: minHoursBeforeEditWa,
            pendingIntent,
            pendingData,
            knownPhone: args.chatId,
            knownContact,
            currentDate: new Date(nowWa).toLocaleString(locale, {
                weekday: "long", year: "numeric", month: "long", day: "2-digit",
                hour: "2-digit", minute: "2-digit", timeZone: tz,
            }),
            currentTimestampMs: nowWa,
            timezone: tz,
            locale,
            bookedSlots,
            userAppointments: userAppointmentsWa,
            userOrders: userOrdersWa,
            businessHours: (client.config as any)?.businessHours,
            outOfHoursOrderPolicy: (client.config as any)?.outOfHoursOrderPolicy ?? "reject",
            currency: (client.config as any)?.currency ?? "UYU",
            channelKind: "whatsapp",
        });

        // ── Llamada a Gemini con fallback a key paid y degradación elegante ──
        let rawText: string;
        let tokensUsed: number;
        try {
            const result = await gemini.generateChatResponse(systemInstruction, effectiveHistory, effectiveMessageText);
            rawText = result.text;
            tokensUsed = result.tokensUsed;
        } catch (primaryErr) {
            // Si usamos la key free y hay una key paid distinta, reintentamos una vez.
            const paidKey = process.env.GEMINI_API_KEY_PAID ?? process.env.GEMINI_API_KEY;
            let retryResult: { text: string; tokensUsed: number } | null = null;
            if (paidKey && paidKey !== geminiApiKey) {
                console.warn("[AI:whatsapp] Key free falló (503/429), reintentando con key paid:", primaryErr);
                try {
                    retryResult = await new GeminiService({ apiKey: paidKey }).generateChatResponse(
                        systemInstruction, effectiveHistory, effectiveMessageText
                    );
                } catch (retryErr) {
                    console.error("[AI:whatsapp] Key paid también falló:", retryErr);
                }
            } else {
                console.error("[AI:whatsapp] Gemini falló (sin key alternativa disponible):", primaryErr);
            }
            // Si todos los intentos fallaron, enviamos el mensaje de degradación y salimos.
            if (!retryResult) {
                let fallbackMsgId = `bot-fallback-${Date.now()}`;
                try {
                    const sent = await whapi.sendMessage(args.chatId, FALLBACK_MESSAGE);
                    if (sent?.id) fallbackMsgId = sent.id;
                } catch { /* si el envío por Whapi también falla, ignoramos silenciosamente */ }
                await ctx.runMutation(internal.aiQueries.saveBotMessage, {
                    channelId: args.channelId,
                    phone: args.chatId,
                    content: FALLBACK_MESSAGE,
                    messageId: fallbackMsgId,
                });
                return;
            }
            rawText = retryResult.text;
            tokensUsed = retryResult.tokensUsed;
        }

        await ctx.runMutation(internal.aiQueries.deductTokens, {
            clientId: client._id,
            amount: tokensUsed + embeddingTokensUsedWa,
            channelId: args.channelId,
            source: "whatsapp",
            phone: args.chatId,
        });

        const aiResult = parseAIIntentResponse(rawText);

        // Normalizar intent según features habilitadas
        let intent = aiResult.intent;
        if (intent === "order" && !enableOrders) intent = "lead";
        if (intent === "appointment" && !enableAgenda) intent = "lead";
        if (intent === "cancel_appointment" && (!enableAgenda || !allowCancelAppointmentsWa)) intent = "chat";
        if (intent === "modify_appointment" && (!enableAgenda || !allowModifyAppointmentsWa)) intent = "chat";
        if (intent === "cancel_order" && (!enableOrders || !allowCancelOrdersWa)) intent = "chat";

        // Override defensivo: ver explicación en processWebMessage.
        const askedForHumanWa = ASKED_FOR_HUMAN_REGEX.test(effectiveMessageText);
        if (intent === "lead" && !askedForHumanWa && !pendingIntent) {
            if (enableOrders && KB_HAS_ORDERS_REGEX.test(knowledgeContext)) {
                intent = "order";
                aiResult.isComplete = false;
                if (!aiResult.response || /agente|asesor|humano/i.test(aiResult.response)) {
                    aiResult.response = "¡Claro! Decime qué necesitás y lo coordinamos.";
                }
            } else if (enableAgenda && KB_HAS_AGENDA_REGEX.test(knowledgeContext)) {
                intent = "appointment";
                aiResult.isComplete = false;
                if (!aiResult.response || /agente|asesor|humano/i.test(aiResult.response)) {
                    aiResult.response = "¡Claro! Decime para qué fecha y horario querés el turno.";
                }
            }
        }

        const mergedData = { ...(pendingData as Record<string, unknown> ?? {}), ...aiResult.collectedData };
        const stateId = conversationState?._id;

        // Enviar mensaje al usuario por WhatsApp
        let sentMessageId = `bot-local-${Date.now()}`;
        try {
            const whapiResult = await whapi.sendMessage(args.chatId, aiResult.response);
            if (whapiResult?.id) sentMessageId = whapiResult.id;
        } catch (error) {
            console.error("Error enviando respuesta por Whapi:", error);
        }

        // Guardar respuesta del bot en BD
        await ctx.runMutation(internal.aiQueries.saveBotMessage, {
            channelId: args.channelId,
            phone: args.chatId,
            content: aiResult.response,
            messageId: sentMessageId,
        });

        // Acciones según intent
        if (intent === "chat") {
            if (pendingIntent && stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
            }
            // Persist altPhone captured this turn so the next turn can resolve
            // knownContact even when intent is "chat".
            if (stateId) {
                const collected = (aiResult.collectedData ?? {}) as Record<string, unknown>;
                const identityPatch: Record<string, unknown> = {};
                if (typeof collected.altPhone === "string" && collected.altPhone.trim()) {
                    identityPatch.altPhone = collected.altPhone.trim();
                }
                if (typeof collected.altEmail === "string" && collected.altEmail.trim()) {
                    identityPatch.altEmail = collected.altEmail.trim();
                }
                if (Object.keys(identityPatch).length > 0) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, {
                        id: stateId,
                        pendingData: identityPatch,
                    });
                }
            }

        } else if (intent === "lead") {
            if (aiResult.isComplete) {
                // Prevención de duplicados: no crear si ya hay un lead activo en este canal
                const created = userRecordsWa.leads.length === 0;
                if (created) {
                    const waLeadName = String(mergedData.name ?? aiResult.leadData.name ?? "Desconocido");
                    await ctx.runMutation(internal.leads.create, {
                        channel: args.channelId,
                        client: client._id,
                        type: "lead",
                        name: waLeadName,
                        phone: args.chatId,
                        status: "new",
                        summary: aiResult.leadData.summary,
                        requiresAction: true,
                        data: mergedData,
                    });
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        phone: args.chatId,
                        content: `[Lead creado] ${waLeadName}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "lead.created",
                        data: { name: waLeadName, phone: args.chatId, status: "new", summary: aiResult.leadData.summary, ...mergedData },
                    });
                    if (autoSaveContacts && waLeadName && waLeadName !== "Desconocido") {
                        const normalizedWaPhone = normalizePhone(args.chatId);
                        await ctx.runMutation(internal.contacts.upsert, {
                            assistantId: assistant._id,
                            name: waLeadName,
                            phone: normalizedWaPhone,
                        });
                    }
                }
                // Solo pausamos la IA si efectivamente creamos el lead. Si el
                // lead se saltea por duplicado (mismo canal), mantenemos el
                // estado ACTIVE para no silenciar mensajes siguientes.
                if (stateId) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, {
                        id: stateId,
                        ...(created ? { status: "PAUSED" as const } : {}),
                        clearPending: true,
                    });
                }
            } else if (stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "lead",
                    pendingData: mergedData,
                });
            }

        } else if (intent === "order") {
            if (aiResult.isComplete) {
                const clientCurrencyWa = (client.config as any)?.currency ?? "UYU";
                const items = parseOrderItems(mergedData.items);
                const computedTotal = items.reduce((sum, i) => sum + i.quantity * i.priceAtMoment, 0);
                const declaredTotal = parseLooseNumber(mergedData.totalAmount);
                const totalAmount = Number.isFinite(declaredTotal) && declaredTotal > 0 ? declaredTotal : computedTotal;

                if (items.length === 0) {
                    console.warn("[AI:whatsapp] Order skipped: no valid items in collectedData", { mergedData });
                } else if (userRecordsWa.orders.length > 0) {
                    console.warn("[AI:whatsapp] Order skipped: user already has active order", {
                        chatId: args.chatId,
                        activeOrderIds: userRecordsWa.orders.map((o) => o._id),
                    });
                } else {
                    await ctx.runMutation(internal.orders.create, {
                        client: client._id,
                        channel: args.channelId,
                        assistant: assistant._id,
                        phone: args.chatId,
                        name: String(mergedData.name ?? "Desconocido"),
                        deliveryAddress: String(mergedData.deliveryAddress ?? ""),
                        items,
                        totalAmount,
                        currency: String(mergedData.currency ?? clientCurrencyWa),
                        status: "pending",
                    });
                    const waOrderItemsPreview = items.map((i) => `${i.quantity}x ${i.productName}`).join(", ");
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        phone: args.chatId,
                        content: `[Pedido creado] ${waOrderItemsPreview} — ${formatMoney(totalAmount, clientCurrencyWa)}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "order.created",
                        data: { ...mergedData, items, totalAmount },
                    });
                    if (autoSaveContacts) {
                        const orderName = String(mergedData.name ?? "Desconocido");
                        if (orderName && orderName !== "Desconocido") {
                            await ctx.runMutation(internal.contacts.upsert, {
                                assistantId: assistant._id,
                                name: orderName,
                                phone: normalizePhone(args.chatId),
                            });
                        }
                    }
                }
                if (stateId) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, {
                        id: stateId,
                        clearPending: true,
                    });
                }
            } else if (stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "order",
                    pendingData: mergedData,
                });
            }

        } else if (intent === "appointment") {
            if (aiResult.isComplete) {
                const startTsWa = mergedData.startDatetime
                    ? localIsoToTimestamp(String(mergedData.startDatetime), tz)
                    : Number(mergedData.start);
                const endTsWa = mergedData.endDatetime
                    ? localIsoToTimestamp(String(mergedData.endDatetime), tz)
                    : mergedData.end ? Number(mergedData.end) : undefined;
                // Prevención de duplicados: no crear si ya existe uno en el mismo horario
                const duplicateWa = userRecordsWa.appointments.some((a) => a.start === startTsWa);
                if (!duplicateWa) {
                    const appointmentIdWa = await ctx.runMutation(internal.appointments.create, {
                        client: client._id,
                        channel: args.channelId,
                        customerName: String(mergedData.customerName ?? "Desconocido"),
                        customerPhone: args.chatId,
                        start: startTsWa,
                        end: endTsWa,
                        notes: mergedData.notes ? String(mergedData.notes) : undefined,
                        status: "pending",
                    });
                    await ctx.scheduler.runAfter(0, internal.googleCalendar.syncForClient, {
                        appointmentId: appointmentIdWa,
                        clientId: client._id,
                        operation: "upsert",
                    });
                    const reminderHoursWa = (client.config as any)?.appointmentReminderHours ?? 24;
                    const reminderTsWa = startTsWa - reminderHoursWa * 3600000;
                    if (reminderTsWa > Date.now()) {
                        await ctx.scheduler.runAt(reminderTsWa, internal.ai.sendAppointmentReminder, { appointmentId: appointmentIdWa });
                    }
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        phone: args.chatId,
                        content: `[Turno agendado] ${String(mergedData.customerName ?? "Desconocido")} — ${new Date(startTsWa).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "appointment.created",
                        data: { ...mergedData, start: startTsWa, end: endTsWa },
                    });
                    if (autoSaveContacts) {
                        const apptName = String(mergedData.customerName ?? "Desconocido");
                        if (apptName && apptName !== "Desconocido") {
                            await ctx.runMutation(internal.contacts.upsert, {
                                assistantId: assistant._id,
                                name: apptName,
                                phone: normalizePhone(args.chatId),
                            });
                        }
                    }
                }
                if (stateId) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, {
                        id: stateId,
                        clearPending: true,
                    });
                }
            } else if (stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "appointment",
                    pendingData: mergedData,
                });
            }

        } else if (intent === "cancel_appointment") {
            if (aiResult.isComplete) {
                const idx = Number(mergedData.appointmentIndex) - 1;
                const target = userRecordsWa.appointments[idx];
                if (target) {
                    const minMs = minHoursBeforeEditWa * 3600000;
                    if (!(minMs > 0 && target.start - nowWa < minMs)) {
                        await ctx.runMutation(internal.aiQueries.cancelAppointmentByAI, { id: target._id });
                        await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                            channelId: args.channelId,
                            phone: args.chatId,
                            content: `[Turno cancelado] ${target.customerName} — ${new Date(target.start).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
                            messageId: `sys-${crypto.randomUUID()}`,
                        });
                        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                            clientId: client._id,
                            event: "appointment.updated",
                            data: { ...target, status: "canceled" },
                        });
                    }
                }
                if (stateId) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
                }
            } else if (stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "cancel_appointment",
                    pendingData: mergedData,
                });
            }

        } else if (intent === "modify_appointment") {
            if (aiResult.isComplete) {
                const idx = Number(mergedData.appointmentIndex) - 1;
                const target = userRecordsWa.appointments[idx];
                if (target) {
                    const minMs = minHoursBeforeEditWa * 3600000;
                    if (!(minMs > 0 && target.start - nowWa < minMs)) {
                        const newStart = localIsoToTimestamp(String(mergedData.newStartDatetime), tz);
                        const newEnd = mergedData.newEndDatetime
                            ? localIsoToTimestamp(String(mergedData.newEndDatetime), tz)
                            : undefined;
                        await ctx.runMutation(internal.aiQueries.modifyAppointmentByAI, {
                            id: target._id,
                            start: newStart,
                            end: newEnd,
                        });
                        await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                            channelId: args.channelId,
                            phone: args.chatId,
                            content: `[Turno modificado] ${target.customerName} — nuevo: ${new Date(newStart).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}`,
                            messageId: `sys-${crypto.randomUUID()}`,
                        });
                        await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                            clientId: client._id,
                            event: "appointment.updated",
                            data: { ...target, start: newStart, end: newEnd },
                        });
                    }
                }
                if (stateId) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
                }
            } else if (stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "modify_appointment",
                    pendingData: mergedData,
                });
            }

        } else if (intent === "cancel_order") {
            if (aiResult.isComplete) {
                const idx = Number(mergedData.orderIndex) - 1;
                const target = userRecordsWa.orders[idx];
                if (target) {
                    await ctx.runMutation(internal.aiQueries.cancelOrderByAI, { id: target._id });
                    await ctx.runMutation(internal.aiQueries.saveSystemEvent, {
                        channelId: args.channelId,
                        phone: args.chatId,
                        content: `[Pedido cancelado] ${target.name ?? "Desconocido"}`,
                        messageId: `sys-${crypto.randomUUID()}`,
                    });
                    await ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {
                        clientId: client._id,
                        event: "order.updated",
                        data: { ...target, status: "canceled" },
                    });
                }
                if (stateId) {
                    await ctx.runMutation(internal.aiQueries.updateConversationState, { id: stateId, clearPending: true });
                }
            } else if (stateId) {
                await ctx.runMutation(internal.aiQueries.updateConversationState, {
                    id: stateId,
                    pendingIntent: "cancel_order",
                    pendingData: mergedData,
                });
            }
        }
    }
});


// ----------------------------------------------------------------------
// 4. RECORDATORIO AUTOMÁTICO DE TURNO (SCHEDULED ACTION)
// ----------------------------------------------------------------------

export const sendAppointmentReminder = internalAction({
    args: { appointmentId: v.id("appointments") },
    handler: async (ctx, { appointmentId }) => {
        const appointment = await ctx.runQuery(internal.appointments.getByIdInternal, { id: appointmentId });
        if (!appointment || appointment.status === "canceled") return;

        const channel = appointment.channel
            ? await ctx.runQuery(api.channels.get, { id: appointment.channel })
            : null;
        if (!channel) return;

        const client = await ctx.runQuery(api.clients.get, { id: appointment.client });
        const tz = (client as any)?.timezone ?? "America/Montevideo";
        const locale = timezoneToLocale(tz);
        const formattedDate = new Date(appointment.start).toLocaleString(locale, {
            weekday: "long", day: "2-digit", month: "long",
            hour: "2-digit", minute: "2-digit", timeZone: tz,
        });
        const reminderText = `⏰ Recordatorio: ${appointment.customerName}, tenés un turno agendado para el ${formattedDate}. ¡Te esperamos!`;

        if (channel.type === "whatsapp" && appointment.customerPhone) {
            const config = channel.config as Record<string, string | undefined>;
            const whapiToken = config?.whapiToken;
            const whapiApiUrl = config?.whapiApiUrl;
            if (whapiToken) {
                const whapi = new WhapiService({ token: whapiToken, apiUrl: whapiApiUrl });
                await whapi.sendMessage(appointment.customerPhone, reminderText);
            }
        }
    },
});
