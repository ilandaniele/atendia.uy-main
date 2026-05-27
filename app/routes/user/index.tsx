import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { FaMessage, FaCartShopping, FaCalendarDay, FaUsers, FaArrowRight } from "react-icons/fa6";
import { useMemo, useEffect, useRef } from "react";
import { cn } from "utils/utils";

export function meta() {
    return [{ title: "Panel de control - Atendia" }];
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "ahora";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d === 1) return "ayer";
    return `${d}d`;
}

function formatPhone(raw: string): string {
    const num = raw.replace(/@.*/, "");
    return `+${num}`;
}

function formatApptDate(ts: number): string {
    return new Date(ts).toLocaleDateString("es", {
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
    });
}

// Colores de estado reutilizables
const STATUS_DOT: Record<string, string> = {
    // conversaciones
    ACTIVE: "bg-blue-500", PAUSED: "bg-amber-500", IGNORED: "bg-orange-400", ARCHIVED: "bg-slate-400",
    // contactos / leads
    new: "bg-violet-500", pending: "bg-amber-500", contacted: "bg-sky-500",
    scheduled: "bg-indigo-500", confirmed: "bg-green-500", closed: "bg-slate-400", rejected: "bg-red-500",
    // pedidos
    shipped: "bg-indigo-500", delivered: "bg-green-500", canceled: "bg-red-500",
    // citas (pending / confirmed / delivered / canceled ya cubiertos)
};

const STATUS_LABEL: Record<string, string> = {
    ACTIVE: "Activa", PAUSED: "Pausada", IGNORED: "Ignorada", ARCHIVED: "Archivada",
    new: "Nuevo", pending: "Pendiente", contacted: "Contactado",
    scheduled: "Agendado", confirmed: "Confirmado", closed: "Cerrado", rejected: "Rechazado",
    shipped: "En camino", delivered: "Entregado", canceled: "Cancelado",
};

// ─── Componentes ──────────────────────────────────────────────────────────────

interface SummaryMetric {
    label: string;
    value: number;
    color: string;
    urgent?: boolean;
}

interface RecentRow {
    id: string;
    primary: string;
    secondary?: string;
    right: string;
    status: string;
}

function SummaryCard({ icon, title, href, iconBg, iconColor, metrics, recent, empty }: {
    icon: React.ReactNode;
    title: string;
    href: string;
    iconBg: string;
    iconColor: string;
    metrics: SummaryMetric[];
    recent: RecentRow[];
    empty?: string;
}) {
    const hasMetrics = metrics.some((m) => m.value > 0);

    return (
        <Link
            to={href}
            className="group flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary/40 transition-all p-4 sm:p-5 gap-4"
        >
            {/* Cabecera */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className={cn("p-2 rounded-xl shrink-0", iconBg)}>
                        <span className={cn("text-sm", iconColor)}>{icon}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</span>
                </div>
                <FaArrowRight className="text-slate-300 dark:text-slate-700 group-hover:text-primary group-hover:translate-x-0.5 transition-all text-xs shrink-0" />
            </div>

            {/* Métricas */}
            {!hasMetrics ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">{empty ?? "Sin novedades"}</p>
            ) : (
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                    {metrics.filter((m) => m.value > 0).map((m) => (
                        <div key={m.label} className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                                <span className={cn("text-3xl font-bold leading-none tabular-nums", m.color)}>
                                    {m.value > 999 ? "999+" : m.value}
                                </span>
                                {m.urgent && (
                                    <span className="relative flex h-2 w-2 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{m.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Últimos ítems */}
            {recent.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {recent.map((row) => (
                        <div key={row.id} className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                STATUS_DOT[row.status] ?? "bg-slate-400"
                            )} />
                            <span className="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">
                                {row.primary}
                            </span>
                            {row.secondary && (
                                <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[35%]">
                                    {row.secondary}
                                </span>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-auto pl-1">
                                {row.right}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </Link>
    );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function UserDashboard() {
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;

    const client       = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");
    const enableOrders = client?.features?.enableOrders ?? false;
    const enableAgenda = client?.features?.enableAgenda ?? false;

    const conversationStates = useQuery(api.conversationStates.getByClient, clientId ? { clientId } : "skip");
    const leads              = useQuery(api.leads.getByClient, clientId ? { clientId } : "skip");
    const orders             = useQuery(api.orders.getByClient, clientId && enableOrders ? { clientId } : "skip");
    const appointments       = useQuery(api.appointments.getByClient, clientId && enableAgenda ? { clientId } : "skip");

    // ── Mensajes
    const pendingMessages = useMemo(
        () => conversationStates?.filter((s) => s.pendingUserMessage === true).length ?? 0,
        [conversationStates]
    );
    const pausedConvs = useMemo(
        () => conversationStates?.filter((s) => s.status === "PAUSED").length ?? 0,
        [conversationStates]
    );
    const recentConvs = useMemo<RecentRow[]>(() => {
        if (!conversationStates) return [];
        return [...conversationStates]
            .sort((a, b) => b._creationTime - a._creationTime)
            .slice(0, 3)
            .map((s) => ({
                id: s._id,
                primary: s.phone ? formatPhone(s.phone) : s.sessionId ? `Web #${s.sessionId.slice(0, 8)}` : "Desconocido",
                right: timeAgo(s._creationTime),
                status: s.status,
            }));
    }, [conversationStates]);

    // ── Contactos
    const newContacts    = useMemo(() => leads?.filter((l) => l.status === "new").length ?? 0, [leads]);
    const actionContacts = useMemo(
        () => leads?.filter((l) => l.requiresAction && !["closed", "rejected"].includes(l.status)).length ?? 0,
        [leads]
    );
    const recentLeads = useMemo<RecentRow[]>(() => {
        if (!leads) return [];
        return [...leads]
            .sort((a, b) => b._creationTime - a._creationTime)
            .slice(0, 3)
            .map((l) => ({
                id: l._id,
                primary: l.name,
                secondary: STATUS_LABEL[l.status],
                right: timeAgo(l._creationTime),
                status: l.status,
            }));
    }, [leads]);

    // ── Pedidos
    const pendingOrders   = useMemo(() => orders?.filter((o) => o.status === "pending").length ?? 0, [orders]);
    const confirmedOrders = useMemo(() => orders?.filter((o) => o.status === "confirmed").length ?? 0, [orders]);
    const recentOrders = useMemo<RecentRow[]>(() => {
        if (!orders) return [];
        return [...orders]
            .sort((a, b) => b._creationTime - a._creationTime)
            .slice(0, 3)
            .map((o) => ({
                id: o._id,
                primary: o.name,
                secondary: `${o.currency} ${o.totalAmount.toLocaleString()}`,
                right: timeAgo(o._creationTime),
                status: o.status,
            }));
    }, [orders]);

    // ── Citas
    const now = Date.now();
    const todayStart     = new Date().setHours(0, 0, 0, 0);
    const pendingAppts   = useMemo(
        () => appointments?.filter((a) => a.start > now && a.status === "pending").length ?? 0,
        [appointments]
    );
    const confirmedAppts = useMemo(
        () => appointments?.filter((a) => a.start > now && a.status === "confirmed").length ?? 0,
        [appointments]
    );
    const todayAppts = useMemo(
        () => appointments?.filter((a) => a.start >= todayStart && a.start < todayStart + 86_400_000 && a.status !== "canceled").length ?? 0,
        [appointments]
    );
    // Próximas 3 citas futuras no canceladas, ordenadas por fecha
    const recentAppts = useMemo<RecentRow[]>(() => {
        if (!appointments) return [];
        return [...appointments]
            .filter((a) => a.start > now && a.status !== "canceled")
            .sort((a, b) => a.start - b.start)
            .slice(0, 3)
            .map((a) => ({
                id: a._id,
                primary: a.customerName,
                secondary: STATUS_LABEL[a.status],
                right: formatApptDate(a.start),
                status: a.status,
            }));
    }, [appointments]);

    // Sonido en pedido nuevo
    const prevPending = useRef(0);
    useEffect(() => {
        if (!orders) return;
        if (pendingOrders > prevPending.current && prevPending.current !== 0) {
            try { new Audio("/notification.mp3").play().catch(() => {}); } catch {}
        }
        prevPending.current = pendingOrders;
    }, [pendingOrders, orders]);

    if (!userProfile || userClients === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    const cardCount = 2 + (enableOrders ? 1 : 0) + (enableAgenda ? 1 : 0);
    const gridClass =
        cardCount <= 2 ? "sm:grid-cols-2" :
        cardCount === 3 ? "sm:grid-cols-2 lg:grid-cols-3" :
        "sm:grid-cols-2 lg:grid-cols-4";

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                    Hola, {userProfile.name.split(" ")[0]} 👋
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                    Aquí tienes un resumen de lo que está pendiente.
                </p>
            </div>

            <div className={cn("grid grid-cols-1 gap-4", gridClass)}>

                <SummaryCard
                    icon={<FaMessage />}
                    title="Mensajes"
                    href="/panel/mensajes"
                    iconBg="bg-blue-50 dark:bg-blue-900/20"
                    iconColor="text-blue-600"
                    empty="Ninguna conversación pendiente"
                    metrics={[
                        { label: "esperando respuesta", value: pendingMessages, color: "text-blue-600 dark:text-blue-400", urgent: true },
                        { label: "operador tomó control", value: pausedConvs, color: "text-amber-600 dark:text-amber-400" },
                    ]}
                    recent={recentConvs}
                />

                <SummaryCard
                    icon={<FaUsers />}
                    title="Clientes potenciales"
                    href="/panel/clientes-potenciales"
                    iconBg="bg-violet-50 dark:bg-violet-900/20"
                    iconColor="text-violet-600"
                    empty="Sin contactos nuevos"
                    metrics={[
                        { label: "nuevos", value: newContacts, color: "text-violet-600 dark:text-violet-400", urgent: true },
                        { label: "requieren acción", value: actionContacts, color: "text-amber-600 dark:text-amber-400" },
                    ]}
                    recent={recentLeads}
                />

                {enableOrders && (
                    <SummaryCard
                        icon={<FaCartShopping />}
                        title="Pedidos"
                        href="/panel/pedidos"
                        iconBg="bg-amber-50 dark:bg-amber-900/20"
                        iconColor="text-amber-600"
                        empty="Sin pedidos pendientes"
                        metrics={[
                            { label: "pendientes", value: pendingOrders, color: "text-amber-600 dark:text-amber-400", urgent: true },
                            { label: "confirmados", value: confirmedOrders, color: "text-blue-600 dark:text-blue-400" },
                        ]}
                        recent={recentOrders}
                    />
                )}

                {enableAgenda && (
                    <SummaryCard
                        icon={<FaCalendarDay />}
                        title="Citas"
                        href="/panel/agenda"
                        iconBg="bg-indigo-50 dark:bg-indigo-900/20"
                        iconColor="text-indigo-600"
                        empty="Sin citas próximas"
                        metrics={[
                            { label: "hoy", value: todayAppts, color: "text-indigo-600 dark:text-indigo-400", urgent: todayAppts > 0 },
                            { label: "pendientes de confirmar", value: pendingAppts, color: "text-amber-600 dark:text-amber-400" },
                            { label: "confirmadas próximas", value: confirmedAppts, color: "text-blue-600 dark:text-blue-400" },
                        ]}
                        recent={recentAppts}
                    />
                )}

            </div>
        </div>
    );
}
