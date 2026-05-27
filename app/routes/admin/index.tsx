import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import {
    FaCircle,
    FaTicket,
    FaBuilding,
    FaFileLines,
    FaTriangleExclamation,
} from "react-icons/fa6";
import { MdEmail, MdSmartToy } from "react-icons/md";
import { HiArrowRight, HiExclamationTriangle } from "react-icons/hi2";

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
    const diffMs = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "Ahora mismo";
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "ayer";
    if (diffD < 7) return `hace ${diffD} días`;
    return new Date(ts).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Badge components ────────────────────────────────────────────────────────

const TICKET_STATUS_LABEL: Record<string, string> = {
    open: "Abierto",
    in_progress: "En progreso",
    resolved: "Resuelto",
    closed: "Cerrado",
};
const TICKET_STATUS_STYLE: Record<string, string> = {
    open: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};
const TICKET_PRIORITY_LABEL: Record<string, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
};
const TICKET_PRIORITY_STYLE: Record<string, string> = {
    low: "text-slate-500 dark:text-slate-400",
    medium: "text-amber-600 dark:text-amber-400",
    high: "text-red-600 dark:text-red-400",
};

const FORM_STATUS_STYLE: Record<string, string> = {
    new: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    read: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    replied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    archived: "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500",
};
const FORM_STATUS_LABEL: Record<string, string> = {
    new: "Nuevo",
    read: "Leído",
    replied: "Respondido",
    archived: "Archivado",
};

function StatusBadge({ label, style }: { label: string; style: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
            <FaCircle className="h-1.5 w-1.5" />
            {label}
        </span>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({
    title,
    href,
    children,
    badge,
}: {
    title: string;
    href: string;
    children: React.ReactNode;
    badge?: number;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
                    {badge !== undefined && badge > 0 && (
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
                            {badge}
                        </span>
                    )}
                </div>
                <Link
                    to={href}
                    className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                    Ver todos <HiArrowRight className="h-3 w-3" />
                </Link>
            </div>
            <div className="flex-1">{children}</div>
        </div>
    );
}

function EmptyRow({ text }: { text: string }) {
    return (
        <div className="px-6 py-8 text-center text-sm text-slate-400 dark:text-slate-500">{text}</div>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Atendia — Panel de administración" }];
}

export default function AdminDashboard() {
    const tickets = useQuery(api.tickets.list);
    const contactForms = useQuery(api.contactForms.list);
    const leads = useQuery(api.leads.list);
    const clients = useQuery(api.clients.list);
    const invoices = useQuery(api.invoices.list);

    // ── Derived counts ──
    const openTickets = tickets?.filter((t) => t.status === "open" || t.status === "in_progress") ?? [];
    const newForms = contactForms?.filter((f) => f.status === "new") ?? [];
    const actionLeads = leads?.filter((l) => l.requiresAction) ?? [];
    const activeClients = clients?.filter((c) => c.isActive) ?? [];
    const pendingInvoices = invoices?.filter((i) => i.status === "PENDING") ?? [];

    // ── Sorted slices for display ──
    const recentTickets = [...(tickets ?? [])]
        .sort((a, b) => {
            // Priority: high > medium > low, then by creation time
            const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            const pDiff = (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
            if (pDiff !== 0) return pDiff;
            return b._creationTime - a._creationTime;
        })
        .filter((t) => t.status === "open" || t.status === "in_progress")
        .slice(0, 6);

    const recentForms = [...newForms]
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 6);

    const recentLeads = [...actionLeads]
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 6);

    const recentInvoices = [...(invoices ?? [])]
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 5);

    // ── KPI cards config ──
    const kpis = [
        {
            label: "Tickets abiertos",
            value: tickets === undefined ? "—" : openTickets.length,
            icon: <FaTicket className="h-5 w-5" />,
            color: "text-sky-600 bg-sky-50 dark:bg-sky-900/20",
            alert: openTickets.some((t) => t.priority === "high"),
        },
        {
            label: "Formularios nuevos",
            value: contactForms === undefined ? "—" : newForms.length,
            icon: <MdEmail className="h-5 w-5" />,
            color: "text-violet-600 bg-violet-50 dark:bg-violet-900/20",
            alert: false,
        },
        {
            label: "Leads con acción",
            value: leads === undefined ? "—" : actionLeads.length,
            icon: <FaTriangleExclamation className="h-5 w-5" />,
            color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
            alert: false,
        },
        {
            label: "Clientes activos",
            value: clients === undefined ? "—" : activeClients.length,
            icon: <FaBuilding className="h-5 w-5" />,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
            alert: false,
        },
        {
            label: "Pagos pendientes",
            value: invoices === undefined ? "—" : pendingInvoices.length,
            icon: <FaFileLines className="h-5 w-5" />,
            color: "text-rose-600 bg-rose-50 dark:bg-rose-900/20",
            alert: pendingInvoices.length > 0,
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Panel de control</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                    Resumen operativo de Atendia · {new Date().toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpis.map((kpi) => (
                    <div
                        key={kpi.label}
                        className="relative p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3"
                    >
                        {kpi.alert && (
                            <span className="absolute top-3 right-3">
                                <HiExclamationTriangle className="h-4 w-4 text-red-500" />
                            </span>
                        )}
                        <div className={`w-fit p-2.5 rounded-xl ${kpi.color}`}>
                            {kpi.icon}
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{kpi.value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{kpi.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tickets + Formularios de contacto */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Tickets de soporte */}
                <SectionCard
                    title="Tickets de soporte"
                    href="/administracion/tickets"
                    badge={openTickets.length}
                >
                    {recentTickets.length === 0 ? (
                        <EmptyRow text="No hay tickets abiertos." />
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recentTickets.map((ticket: any) => (
                                <li key={ticket._id}>
                                    <Link
                                        to={`/administracion/tickets/${ticket._id}`}
                                        className="flex items-start gap-3 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-50">
                                                    {ticket.title}
                                                </span>
                                                <StatusBadge
                                                    label={TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
                                                    style={TICKET_STATUS_STYLE[ticket.status] ?? ""}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                                    {ticket.client?.name ?? "Sin cliente"}
                                                </span>
                                                <span className="text-slate-300 dark:text-slate-700">·</span>
                                                <span className={`text-xs font-medium ${TICKET_PRIORITY_STYLE[ticket.priority] ?? ""}`}>
                                                    {TICKET_PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
                                                </span>
                                                <span className="text-slate-300 dark:text-slate-700">·</span>
                                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                                    {relativeTime(ticket._creationTime)}
                                                </span>
                                            </div>
                                        </div>
                                        <HiArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 mt-1" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                {/* Formularios de contacto nuevos */}
                <SectionCard
                    title="Formularios de contacto"
                    href="/administracion/formularios-contacto"
                    badge={newForms.length}
                >
                    {recentForms.length === 0 ? (
                        <EmptyRow text="No hay formularios nuevos." />
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recentForms.map((form: any) => (
                                <li key={form._id}>
                                    <Link
                                        to={`/administracion/formularios-contacto/${form._id}`}
                                        className="flex items-start gap-3 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-45">
                                                    {form.name}
                                                </span>
                                                <StatusBadge
                                                    label={FORM_STATUS_LABEL[form.status] ?? form.status}
                                                    style={FORM_STATUS_STYLE[form.status] ?? ""}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-50">
                                                    {form.subject}
                                                </span>
                                                <span className="text-slate-300 dark:text-slate-700">·</span>
                                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                                    {relativeTime(form._creationTime)}
                                                </span>
                                            </div>
                                        </div>
                                        <HiArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 mt-1" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>
            </div>

            {/* Leads con acción + Últimas facturas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Leads con acción requerida */}
                <SectionCard
                    title="Leads con acción requerida"
                    href="/administracion/clientes"
                    badge={actionLeads.length}
                >
                    {recentLeads.length === 0 ? (
                        <EmptyRow text="No hay leads pendientes de acción." />
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recentLeads.map((lead: any) => (
                                <li key={lead._id} className="flex items-start gap-3 px-6 py-3.5">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <MdSmartToy className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-45">
                                                {lead.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-55">
                                                {lead.summary ?? lead.phone ?? "Sin resumen"}
                                            </span>
                                            <span className="text-slate-300 dark:text-slate-700">·</span>
                                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                                {relativeTime(lead._creationTime)}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                                        Pendiente
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                {/* Últimas facturas */}
                <SectionCard
                    title="Últimas facturas"
                    href="/administracion/facturacion"
                    badge={pendingInvoices.length}
                >
                    {recentInvoices.length === 0 ? (
                        <EmptyRow text="No hay facturas registradas." />
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {recentInvoices.map((invoice: any) => {
                                const statusStyle: Record<string, string> = {
                                    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                                    PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                                    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                                    CANCELLED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                                    EXPIRED: "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500",
                                };
                                const statusLabel: Record<string, string> = {
                                    PENDING: "Pendiente",
                                    PAID: "Pagado",
                                    REJECTED: "Rechazado",
                                    CANCELLED: "Cancelado",
                                    EXPIRED: "Expirado",
                                };
                                return (
                                    <li key={invoice._id} className="flex items-center gap-3 px-6 py-3.5">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block max-w-50">
                                                {invoice.orderId}
                                            </span>
                                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                                {relativeTime(invoice._creationTime)}
                                            </span>
                                        </div>
                                        <StatusBadge
                                            label={statusLabel[invoice.status] ?? invoice.status}
                                            style={statusStyle[invoice.status] ?? ""}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SectionCard>
            </div>

            {/* Estado del sistema */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Estado del sistema</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800">
                    {[
                        { label: "Servicios API", status: "Operativo" },
                        { label: "Base de datos (Convex)", status: "Operativo" },
                        { label: "WhatsApp (Whapi)", status: "Operativo" },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between px-6 py-4">
                            <span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                {item.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
