import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useState, useRef, useEffect, useMemo } from "react";
import { FaWhatsapp, FaGlobe, FaCircle } from "react-icons/fa6";
import { FaBug } from "react-icons/fa6";
import Breadcrumbs from "../components/breadcrumbs";
import PageHeader from "../components/page-header";

export function meta() {
    return [{ title: "Atendia — Administración — Debug en vivo" }];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
    const diffMs = Date.now() - ts;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return "ahora";
    if (diffSec < 60) return `hace ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    return new Date(ts).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtTs(ts: number): string {
    return new Date(ts).toLocaleString("es-UY", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}

const ROLE_STYLE: Record<string, string> = {
    user: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    assistant: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    system: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};
const ROLE_LABEL: Record<string, string> = {
    user: "Usuario",
    assistant: "Bot",
    system: "Sistema",
};

const STATUS_STYLE: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    PAUSED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    IGNORED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    ARCHIVED: "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500",
};

function Badge({ label, style }: { label: string; style: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
            {label}
        </span>
    );
}

function ChannelIcon({ type }: { type: string }) {
    if (type === "whatsapp") return <FaWhatsapp className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    return <FaGlobe className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
}

function formatIdentifier(phone?: string | null, sessionId?: string | null): string {
    if (phone) return `+${phone.split("@")[0]}`;
    if (sessionId) return `Web #${sessionId.slice(0, 8)}`;
    return "—";
}

// ─── Tab: Feed en vivo ────────────────────────────────────────────────────────

function LiveFeedTab() {
    const chats = useQuery(api.chats.listRecentAdmin, { limit: 150 });
    const [filterRole, setFilterRole] = useState<string>("");
    const [filterType, setFilterType] = useState<string>("");
    const [autoScroll, setAutoScroll] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const prevCountRef = useRef(0);

    // Auto-scroll cuando llegan mensajes nuevos
    useEffect(() => {
        if (!chats) return;
        if (autoScroll && chats.length !== prevCountRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
        prevCountRef.current = chats.length;
    }, [chats?.length, autoScroll]);

    const filtered = (chats ?? []).filter((c) => {
        if (filterRole && c.role !== filterRole) return false;
        if (filterType && c.channelType !== filterType) return false;
        return true;
    });

    // Invertir para mostrar más reciente arriba
    const displayed = [...filtered].reverse();

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1.5 mr-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {chats === undefined ? "Conectando…" : `${filtered.length} mensajes`}
                    </span>
                </div>

                <select
                    className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                >
                    <option value="">Todos los roles</option>
                    <option value="user">Usuario</option>
                    <option value="assistant">Bot</option>
                    <option value="system">Sistema</option>
                </select>

                <select
                    className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">Todos los canales</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="web">Widget web</option>
                </select>

                <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="rounded"
                    />
                    Auto-scroll
                </label>
            </div>

            {/* Tabla */}
            <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="overflow-x-auto max-h-150 overflow-y-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-neutral-50 dark:bg-slate-800/90 text-left">
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400 whitespace-nowrap">Hora</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Canal</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Cuenta</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Identificador</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Rol</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Mensaje</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400 whitespace-nowrap">Msg ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                            {chats === undefined && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-neutral-400 dark:text-slate-500">
                                        Cargando…
                                    </td>
                                </tr>
                            )}
                            {chats !== undefined && displayed.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-neutral-400 dark:text-slate-500">
                                        Sin mensajes registrados todavía.
                                    </td>
                                </tr>
                            )}
                            {displayed.map((chat) => (
                                <tr
                                    key={chat._id}
                                    className="hover:bg-neutral-50 dark:hover:bg-slate-800/40 transition-colors"
                                >
                                    <td className="px-3 py-2 text-neutral-500 dark:text-slate-500 whitespace-nowrap font-mono">
                                        <span title={fmtTs(chat._creationTime)}>{relativeTime(chat._creationTime)}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5 text-neutral-600 dark:text-slate-300">
                                            <ChannelIcon type={chat.channelType} />
                                            <span className="truncate max-w-28">{chat.channelName}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-neutral-700 dark:text-slate-300 font-medium truncate max-w-28">
                                        {chat.clientName}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-neutral-500 dark:text-slate-500 truncate max-w-32">
                                        {formatIdentifier(chat.phone, chat.sessionId)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <Badge label={ROLE_LABEL[chat.role] ?? chat.role} style={ROLE_STYLE[chat.role] ?? ""} />
                                    </td>
                                    <td className="px-3 py-2 text-neutral-700 dark:text-slate-300 max-w-xs">
                                        <span className="line-clamp-2 wrap-break-word">{chat.content || <em className="text-neutral-400 dark:text-slate-600">vacío</em>}</span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-neutral-400 dark:text-slate-600 truncate max-w-28">
                                        {chat.messageId}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div ref={bottomRef} />
                </div>
            </div>
        </div>
    );
}

// ─── Tab: Estados de conversación ─────────────────────────────────────────────

function ConvStateTab() {
    const states = useQuery(api.conversationStates.listRecentAdmin, { limit: 200 });
    const [filterStatus, setFilterStatus] = useState<string>("");
    const [filterType, setFilterType] = useState<string>("");

    const filtered = (states ?? []).filter((s) => {
        if (filterStatus && s.status !== filterStatus) return false;
        if (filterType && s.channelType !== filterType) return false;
        return true;
    });

    const pausedCount = (states ?? []).filter((s) => s.status === "PAUSED").length;

    return (
        <div className="space-y-3">
            {/* Alerta de conversaciones pausadas */}
            {pausedCount > 0 && (
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    <FaCircle className="h-2 w-2 shrink-0" />
                    <span>
                        <strong>{pausedCount}</strong> conversación{pausedCount !== 1 ? "es" : ""} en estado PAUSED — el bot no responderá hasta que se ejecute <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">/continuar</code>.
                    </span>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                    {states === undefined ? "Cargando…" : `${filtered.length} estados`}
                </span>

                <select
                    className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="">Todos los estados</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED">PAUSED</option>
                    <option value="IGNORED">IGNORED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                </select>

                <select
                    className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">Todos los canales</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="web">Widget web</option>
                </select>
            </div>

            {/* Tabla */}
            <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="overflow-x-auto max-h-150 overflow-y-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-neutral-50 dark:bg-slate-800/90 text-left">
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400 whitespace-nowrap">Creado</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Canal</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Cuenta</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Identificador</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Estado</th>
                                <th className="px-3 py-2.5 font-medium text-neutral-500 dark:text-slate-400">Msg pendiente</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                            {states === undefined && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-8 text-center text-neutral-400 dark:text-slate-500">Cargando…</td>
                                </tr>
                            )}
                            {states !== undefined && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-8 text-center text-neutral-400 dark:text-slate-500">Sin estados registrados.</td>
                                </tr>
                            )}
                            {filtered.map((s) => (
                                <tr
                                    key={s._id}
                                    className={`hover:bg-neutral-50 dark:hover:bg-slate-800/40 transition-colors ${s.status === "PAUSED" ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
                                >
                                    <td className="px-3 py-2 text-neutral-500 dark:text-slate-500 whitespace-nowrap font-mono">
                                        <span title={fmtTs(s._creationTime)}>{relativeTime(s._creationTime)}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5 text-neutral-600 dark:text-slate-300">
                                            <ChannelIcon type={s.channelType} />
                                            <span className="truncate max-w-28">{s.channelName}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-neutral-700 dark:text-slate-300 font-medium truncate max-w-28">
                                        {s.clientName}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-neutral-500 dark:text-slate-500 truncate max-w-32">
                                        {formatIdentifier(s.phone, s.sessionId)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <Badge label={s.status} style={STATUS_STYLE[s.status] ?? ""} />
                                    </td>
                                    <td className="px-3 py-2">
                                        {s.pendingUserMessage
                                            ? <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold"><FaCircle className="h-1.5 w-1.5" />Sí</span>
                                            : <span className="text-neutral-400 dark:text-slate-600">No</span>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── Tab: Diagnóstico ─────────────────────────────────────────────────────────

function DiagnosticsTab() {
    const chats = useQuery(api.chats.listRecentAdmin, { limit: 150 });
    const states = useQuery(api.conversationStates.listRecentAdmin, { limit: 200 });

    if (!chats || !states) {
        return <div className="py-12 text-center text-sm text-neutral-400 dark:text-slate-500">Cargando datos…</div>;
    }

    // Agrupar mensajes por (channelId + phone/sessionId)
    type ConvKey = string;
    const convMap = new Map<ConvKey, typeof chats>();
    for (const chat of chats) {
        const key = `${chat.channelId}::${chat.phone ?? chat.sessionId ?? ""}`;
        if (!convMap.has(key)) convMap.set(key, []);
        convMap.get(key)!.push(chat);
    }

    // Para cada conversación, detectar si hay mensajes de usuario sin respuesta bot posterior
    const diagnostics: Array<{
        key: ConvKey;
        clientName: string;
        channelName: string;
        channelType: string;
        identifier: string;
        messages: typeof chats;
        lastUserMsg: (typeof chats)[0] | undefined;
        hasSubsequentBot: boolean;
        convState: (typeof states)[0] | undefined;
    }> = [];

    for (const [key, msgs] of convMap.entries()) {
        const sorted = [...msgs].sort((a, b) => a._creationTime - b._creationTime);
        const first = sorted[0];
        const identifier = formatIdentifier(first.phone, first.sessionId);

        const convState = states.find(
            (s) => s.channel === first.channelId && (s.phone === first.phone || s.sessionId === first.sessionId)
        );

        // Último mensaje de usuario
        const userMsgs = sorted.filter((m) => m.role === "user");
        const lastUserMsg = userMsgs.at(-1);

        // ¿Hay un mensaje del bot DESPUÉS del último mensaje de usuario?
        const hasSubsequentBot = lastUserMsg
            ? sorted.some((m) => m.role === "assistant" && m._creationTime > lastUserMsg._creationTime)
            : true;

        diagnostics.push({
            key,
            clientName: first.clientName,
            channelName: first.channelName,
            channelType: first.channelType,
            identifier,
            messages: sorted,
            lastUserMsg,
            hasSubsequentBot,
            convState,
        });
    }

    // Ordenar: problemas primero, luego por tiempo del último mensaje
    diagnostics.sort((a, b) => {
        const aProb = !a.hasSubsequentBot ? 0 : 1;
        const bProb = !b.hasSubsequentBot ? 0 : 1;
        if (aProb !== bProb) return aProb - bProb;
        const aLast = a.messages.at(-1)?._creationTime ?? 0;
        const bLast = b.messages.at(-1)?._creationTime ?? 0;
        return bLast - aLast;
    });

    const problemCount = diagnostics.filter((d) => !d.hasSubsequentBot).length;

    return (
        <div className="space-y-4">
            {problemCount > 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                    <FaBug className="h-4 w-4 shrink-0" />
                    <span>
                        <strong>{problemCount}</strong> conversación{problemCount !== 1 ? "es" : ""} con mensaje de usuario sin respuesta del bot.
                        Verificá el estado de conversación y los logs de Convex.
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                    <FaCircle className="h-2 w-2 shrink-0" />
                    <span>Todas las conversaciones recientes tienen respuesta del bot.</span>
                </div>
            )}

            <div className="space-y-3">
                {diagnostics.map((d) => {
                    const isProblem = !d.hasSubsequentBot;
                    const lastMsg = d.messages.at(-1);
                    return (
                        <div
                            key={d.key}
                            className={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden ${
                                isProblem
                                    ? "border-red-200 dark:border-red-800"
                                    : "border-neutral-200 dark:border-slate-700"
                            }`}
                        >
                            {/* Header */}
                            <div className={`flex flex-wrap items-center gap-3 px-4 py-3 border-b ${
                                isProblem
                                    ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
                                    : "bg-neutral-50 dark:bg-slate-800/60 border-neutral-100 dark:border-slate-800"
                            }`}>
                                <ChannelIcon type={d.channelType} />
                                <span className="font-semibold text-sm text-neutral-800 dark:text-slate-200">{d.clientName}</span>
                                <span className="text-xs text-neutral-500 dark:text-slate-400">{d.channelName}</span>
                                <span className="font-mono text-xs text-neutral-500 dark:text-slate-400">{d.identifier}</span>
                                {d.convState && (
                                    <Badge label={d.convState.status} style={STATUS_STYLE[d.convState.status] ?? ""} />
                                )}
                                {isProblem && (
                                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                                        <FaBug className="h-3.5 w-3.5" />
                                        Sin respuesta del bot
                                    </span>
                                )}
                                {!isProblem && lastMsg && (
                                    <span className="ml-auto text-xs text-neutral-400 dark:text-slate-500">
                                        último: {relativeTime(lastMsg._creationTime)}
                                    </span>
                                )}
                            </div>

                            {/* Últimos mensajes */}
                            <div className="px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                                {d.messages.slice(-6).map((m) => (
                                    <div key={m._id} className="flex items-start gap-2">
                                        <span className="shrink-0 w-16 text-right font-mono text-[10px] text-neutral-400 dark:text-slate-600 pt-0.5">
                                            {relativeTime(m._creationTime)}
                                        </span>
                                        <Badge label={ROLE_LABEL[m.role] ?? m.role} style={ROLE_STYLE[m.role] ?? ""} />
                                        <span className={`text-xs wrap-break-word flex-1 ${
                                            isProblem && m.role === "user" && m._id === d.lastUserMsg?._id
                                                ? "font-semibold text-red-600 dark:text-red-400"
                                                : "text-neutral-700 dark:text-slate-300"
                                        }`}>
                                            {m.content || <em className="text-neutral-400 dark:text-slate-600">vacío</em>}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Causas posibles si hay problema */}
                            {isProblem && d.convState && (
                                <div className="px-4 py-2.5 border-t border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/5">
                                    <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Posibles causas:</p>
                                    <ul className="text-xs text-red-500 dark:text-red-500 list-disc list-inside space-y-0.5">
                                        {d.convState.status === "PAUSED" && (
                                            <li>Estado PAUSED — enviá <code className="font-mono bg-red-100 dark:bg-red-900/40 px-0.5 rounded">/continuar</code> desde WhatsApp para reactivar el bot.</li>
                                        )}
                                        {d.convState.status === "ACTIVE" && (
                                            <li>Estado ACTIVE pero sin respuesta — revisar logs de Convex: posible error en <code className="font-mono bg-red-100 dark:bg-red-900/40 px-0.5 rounded">ai.processMessage</code> o en la acción de Whapi.</li>
                                        )}
                                        {d.convState.status === "IGNORED" && (
                                            <li>Estado IGNORED — el bot no responde en este estado por diseño.</li>
                                        )}
                                        {d.lastUserMsg && d.lastUserMsg.content.trim() === "" && (
                                            <li>El último mensaje del usuario está vacío — el bot no dispara IA con mensajes en blanco (paso 7 de handleInboundMessage).</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                            {isProblem && !d.convState && (
                                <div className="px-4 py-2.5 border-t border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/5">
                                    <p className="text-xs text-red-500 dark:text-red-400">
                                        No se encontró estado de conversación para este chat — puede que el webhook no haya procesado el mensaje correctamente.
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Tab: Por conversación (agrupado por teléfono/sesión) ─────────────────────

const EVENT_STYLE: Record<string, string> = {
    "[Lead creado]": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    "[Pedido creado]": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    "[Turno agendado]": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "[Turno cancelado]": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "[Turno modificado]": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "[Pedido cancelado]": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function eventBadgeStyle(content: string): string {
    for (const prefix of Object.keys(EVENT_STYLE)) {
        if (content.startsWith(prefix)) return EVENT_STYLE[prefix];
    }
    return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

function eventLabel(content: string): string {
    const bracket = content.match(/^\[([^\]]+)\]/);
    return bracket ? bracket[1] : content;
}

function ConversationsByPhoneTab() {
    const chats = useQuery(api.chats.listRecentAdmin, { limit: 300 });
    const [filterType, setFilterType] = useState<string>("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const groups = useMemo(() => {
        if (!chats) return [];
        const map = new Map<string, typeof chats>();
        for (const chat of chats) {
            const key = chat.phone ?? chat.sessionId ?? "unknown";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(chat);
        }
        const result: Array<{
            key: string;
            msgs: typeof chats;
            events: typeof chats;
            lastTs: number;
            first: (typeof chats)[0];
        }> = [];
        for (const [key, msgs] of map.entries()) {
            const sorted = [...msgs].sort((a, b) => a._creationTime - b._creationTime);
            result.push({
                key,
                msgs: sorted,
                events: sorted.filter((m) => m.role === "system"),
                lastTs: sorted.at(-1)?._creationTime ?? 0,
                first: sorted[0],
            });
        }
        result.sort((a, b) => b.lastTs - a.lastTs);
        return result;
    }, [chats]);

    const filtered = filterType
        ? groups.filter((g) => g.first.channelType === filterType)
        : groups;

    const toggle = (key: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                    {chats === undefined ? "Cargando…" : `${filtered.length} conversaciones`}
                </span>
                <select
                    className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">Todos los canales</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="web">Widget web</option>
                </select>
            </div>

            {/* Conversation cards */}
            <div className="space-y-2">
                {chats === undefined && (
                    <div className="py-8 text-center text-sm text-neutral-400 dark:text-slate-500">Cargando…</div>
                )}
                {chats !== undefined && filtered.length === 0 && (
                    <div className="py-8 text-center text-sm text-neutral-400 dark:text-slate-500">Sin conversaciones.</div>
                )}
                {filtered.map(({ key, msgs, events, lastTs, first }) => {
                    const isExpanded = expanded.has(key);
                    const identifier = formatIdentifier(first.phone, first.sessionId);
                    const preview = isExpanded ? msgs : msgs.slice(-4);

                    return (
                        <div
                            key={key}
                            className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden"
                        >
                            {/* Header */}
                            <button
                                type="button"
                                onClick={() => toggle(key)}
                                className="w-full flex flex-wrap items-center gap-2.5 px-4 py-3 bg-neutral-50 dark:bg-slate-800/60 hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors text-left"
                            >
                                <ChannelIcon type={first.channelType} />
                                <span className="font-mono text-xs font-semibold text-neutral-700 dark:text-slate-200">
                                    {identifier}
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-slate-400">{first.clientName}</span>
                                <span className="text-xs text-neutral-400 dark:text-slate-500">{first.channelName}</span>

                                {/* Event badges */}
                                {events.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {events.map((e) => (
                                            <span
                                                key={e._id}
                                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${eventBadgeStyle(e.content)}`}
                                                title={e.content}
                                            >
                                                {eventLabel(e.content)}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <span className="ml-auto text-[10px] text-neutral-400 dark:text-slate-600 whitespace-nowrap">
                                    {msgs.length} msg{msgs.length !== 1 ? "s" : ""} · {relativeTime(lastTs)}
                                </span>
                                <span className="text-neutral-400 dark:text-slate-500 text-[10px]">
                                    {isExpanded ? "▲" : "▼"}
                                </span>
                            </button>

                            {/* Messages */}
                            <div className="px-4 py-3 space-y-1.5">
                                {!isExpanded && msgs.length > 4 && (
                                    <p className="text-[10px] text-neutral-400 dark:text-slate-600 text-center pb-1">
                                        … {msgs.length - 4} mensajes anteriores
                                    </p>
                                )}
                                {preview.map((m) => (
                                    <div key={m._id} className="flex items-start gap-2">
                                        <span className="shrink-0 w-16 text-right font-mono text-[10px] text-neutral-400 dark:text-slate-600 pt-0.5">
                                            {relativeTime(m._creationTime)}
                                        </span>
                                        <Badge
                                            label={ROLE_LABEL[m.role] ?? m.role}
                                            style={ROLE_STYLE[m.role] ?? ""}
                                        />
                                        <span
                                            className={`text-xs wrap-break-word flex-1 ${
                                                m.role === "system"
                                                    ? "font-medium text-slate-500 dark:text-slate-400"
                                                    : "text-neutral-700 dark:text-slate-300"
                                            }`}
                                        >
                                            {m.content || <em className="text-neutral-400 dark:text-slate-600">vacío</em>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = [
    { id: "feed", label: "Feed en vivo" },
    { id: "conversations", label: "Por conversación" },
    { id: "states", label: "Estados de conversación" },
    { id: "diagnostics", label: "Diagnóstico" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function DebugLivePage() {
    const [tab, setTab] = useState<TabId>("feed");

    return (
        <div className="space-y-5">
            <Breadcrumbs items={[{ label: "Debug en vivo" }]} />
            <PageHeader title="Debug en vivo" />

            {/* Tabs */}
            <div className="flex gap-1 bg-neutral-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            tab === t.id
                                ? "bg-white dark:bg-slate-900 text-neutral-900 dark:text-slate-100 shadow-sm"
                                : "text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === "feed" && <LiveFeedTab />}
            {tab === "conversations" && <ConversationsByPhoneTab />}
            {tab === "states" && <ConvStateTab />}
            {tab === "diagnostics" && <DiagnosticsTab />}
        </div>
    );
}
