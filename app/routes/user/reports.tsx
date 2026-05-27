import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo, useState, useRef, useEffect } from "react";
import { Navigate, Link } from "react-router";
import {
    FaUsers,
    FaCartShopping,
    FaCalendarDay,
    FaChevronLeft,
    FaChevronRight,
    FaSpinner,
    FaFileCsv,
    FaPrint,
    FaFilter,
    FaChartBar,
    FaXmark,
    FaCalendar,
} from "react-icons/fa6";
import { cn } from "utils/utils";
import { LogoSpark } from "logo";

export function meta() {
    return [{ title: "Reportes - Atendia" }];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange = "all" | "today" | "7d" | "30d" | "90d" | "year" | "custom";
type TabKey = "clients" | "orders" | "appointments";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

const DATE_RANGES: { key: DateRange; label: string }[] = [
    { key: "all", label: "Todo" },
    { key: "today", label: "Hoy" },
    { key: "7d", label: "7 días" },
    { key: "30d", label: "30 días" },
    { key: "90d", label: "90 días" },
    { key: "year", label: "Este año" },
    { key: "custom", label: "Personalizado" },
];

const LEAD_STATUS_CFG: Record<string, { label: string; color: string }> = {
    new: { label: "Nuevo", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    pending: { label: "Pendiente", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    contacted: { label: "Contactado", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
    scheduled: { label: "Agendado", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    confirmed: { label: "Confirmado", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    closed: { label: "Cerrado", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    rejected: { label: "Rechazado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const ORDER_STATUS_CFG: Record<string, { label: string; color: string }> = {
    pending: { label: "Pendiente", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    confirmed: { label: "Confirmado", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    shipped: { label: "Enviado", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
    delivered: { label: "Entregado", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    canceled: { label: "Cancelado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const APPT_STATUS_CFG: Record<string, { label: string; color: string }> = {
    pending: { label: "Pendiente", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    confirmed: { label: "Confirmada", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    scheduled: { label: "Agendada", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
    done: { label: "Realizada", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    canceled: { label: "Cancelada", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

// Chart accent colors (explicit hex for SVG, no Tailwind dynamic classes)
const C = {
    blue: "#3b82f6",
    green: "#22c55e",
    amber: "#f59e0b",
    red: "#ef4444",
    indigo: "#6366f1",
    emerald: "#10b981",
};

// ─── Phone utilities ──────────────────────────────────────────────────────────

/** Strips WhatsApp suffixes like @s.whatsapp.net */
function normalizePhone(raw: string | undefined | null): string {
    if (!raw) return "";
    return raw.split("@")[0];
}

/** Human-readable phone: +XXXXXXXXX or "Web" for UUID sessions */
function formatPhone(raw: string | undefined | null): string {
    if (!raw) return "—";
    const clean = normalizePhone(raw);
    if (!clean) return "—";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(clean)) return "Web";
    if (/^\d+$/.test(clean)) return `+${clean}`;
    return clean;
}

function isWebSession(raw: string | undefined | null): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(normalizePhone(raw));
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function getDateRangeStart(range: DateRange): number | null {
    const now = Date.now();
    switch (range) {
        case "all":
        case "custom": return null;
        case "today": { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
        case "7d": return now - 7 * 86_400_000;
        case "30d": return now - 30 * 86_400_000;
        case "90d": return now - 90 * 86_400_000;
        case "year": { const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d.getTime(); }
    }
}

function filterByDate<T extends { _creationTime: number }>(
    items: T[],
    range: DateRange,
    customFrom: Date | null,
    customTo: Date | null,
): T[] {
    if (range === "custom") {
        if (!customFrom || !customTo) return items;
        const from = customFrom.getTime();
        const to = customTo.getTime();
        return items.filter(i => i._creationTime >= from && i._creationTime <= to);
    }
    const start = getDateRangeStart(range);
    if (!start) return items;
    return items.filter(i => i._creationTime >= start);
}

/** Groups items into time buckets for bar charts. */
function groupByTime(
    items: { _creationTime: number }[],
    range: DateRange,
    customFrom: Date | null,
    customTo: Date | null,
): { label: string; value: number }[] {
    const now = new Date();
    type Bucket = { start: number; end: number; label: string };
    let buckets: Bucket[] = [];

    if (range === "today") {
        const h = now.getHours();
        buckets = Array.from({ length: h + 1 }, (_, i) => {
            const d = new Date(); d.setHours(i, 0, 0, 0);
            const e = new Date(); e.setHours(i, 59, 59, 999);
            return { start: d.getTime(), end: e.getTime(), label: `${i}h` };
        });
    } else if (range === "7d") {
        buckets = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
            const e = new Date(d); e.setHours(23, 59, 59, 999);
            return { start: d.getTime(), end: e.getTime(), label: d.toLocaleDateString("es-UY", { weekday: "short" }) };
        });
    } else if (range === "30d") {
        // 6 buckets of 5 days — legible bars without crowding
        buckets = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (5 - i) * 5);
            const e = new Date(d); e.setDate(e.getDate() + 4); e.setHours(23, 59, 59, 999);
            return { start: d.getTime(), end: e.getTime(), label: `${d.getDate()}/${d.getMonth() + 1}` };
        });
    } else if (range === "90d") {
        buckets = Array.from({ length: 13 }, (_, i) => {
            const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (12 - i) * 7);
            const e = new Date(d); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
            return { start: d.getTime(), end: e.getTime(), label: `${d.getDate()}/${d.getMonth() + 1}` };
        });
    } else if (range === "year") {
        buckets = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), i, 1);
            const e = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59, 999);
            return { start: d.getTime(), end: e.getTime(), label: d.toLocaleDateString("es-UY", { month: "short" }) };
        });
    } else if (range === "custom" && customFrom && customTo) {
        const diffDays = Math.ceil((customTo.getTime() - customFrom.getTime()) / 86_400_000);
        if (diffDays <= 31) {
            buckets = Array.from({ length: diffDays + 1 }, (_, i) => {
                const d = new Date(customFrom); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
                const e = new Date(d); e.setHours(23, 59, 59, 999);
                return { start: d.getTime(), end: e.getTime(), label: `${d.getDate()}/${d.getMonth() + 1}` };
            });
        } else {
            const weeks = Math.min(Math.ceil(diffDays / 7), 26);
            buckets = Array.from({ length: weeks }, (_, i) => {
                const d = new Date(customFrom); d.setDate(d.getDate() + i * 7); d.setHours(0, 0, 0, 0);
                const e = new Date(d); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
                return { start: d.getTime(), end: e.getTime(), label: `${d.getDate()}/${d.getMonth() + 1}` };
            });
        }
    } else {
        // "all" → last 12 months
        buckets = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            const e = new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 0, 23, 59, 59, 999);
            return { start: d.getTime(), end: e.getTime(), label: d.toLocaleDateString("es-UY", { month: "short" }) };
        });
    }

    return buckets.map(b => ({
        label: b.label,
        value: items.filter(item => item._creationTime >= b.start && item._creationTime <= b.end).length,
    }));
}

function getPeriodLabel(range: DateRange, customFrom: Date | null, customTo: Date | null): string {
    const fmt = (d: Date) => d.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" });
    switch (range) {
        case "all": return "Todos los datos";
        case "today": return "Hoy";
        case "7d": return "Últimos 7 días";
        case "30d": return "Últimos 30 días";
        case "90d": return "Últimos 90 días";
        case "year": return "Este año";
        case "custom": return customFrom && customTo ? `${fmt(customFrom)} – ${fmt(customTo)}` : "Período personalizado";
    }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const esc = (v: string | number | null | undefined) => {
        if (v == null) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const content = [headers, ...rows].map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

function formatDateTime(ts: number) {
    return new Date(ts).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function paginate<T>(items: T[], page: number) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    return { pageItems: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), totalPages, total };
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
    if (!data.length || data.every(d => d.value === 0)) {
        return (
            <p className="text-sm text-center text-slate-400 dark:text-slate-600 py-8">
                Sin actividad en este período
            </p>
        );
    }
    const max = Math.max(...data.map(d => d.value));
    const W = 520;
    const H = 220;
    const padL = 28; const padR = 8; const padT = 22; const padB = 30;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const step = chartW / data.length;
    const barW = Math.max(4, step * 0.55);
    const ticks = max <= 1 ? [0, 1] : [0, Math.ceil(max / 2), max];

    return (
        <div className="overflow-x-auto">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ minWidth: Math.max(280, data.length * 18), height: H }}
                aria-hidden="true"
            >
                {ticks.map(t => {
                    const y = padT + chartH - (max > 0 ? (t / max) * chartH : 0);
                    return (
                        <g key={t}>
                            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
                            <text x={padL - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.4">{t}</text>
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    const barH = max > 0 ? (d.value / max) * chartH : 0;
                    const cx = padL + i * step + step / 2;
                    const x = cx - barW / 2;
                    const y = padT + chartH - barH;
                    return (
                        <g key={i}>
                            <rect x={x} y={padT} width={barW} height={chartH} rx={2} fill="currentColor" fillOpacity="0.04" />
                            {barH > 0 && <rect x={x} y={y} width={barW} height={barH} rx={2} fill={color} fillOpacity="0.85" />}
                            {d.value > 0 && (
                                <text x={cx} y={y - 4} textAnchor="middle" fontSize="9" fill={color} fontWeight="600">{d.value}</text>
                            )}
                            <text x={cx} y={H - 5} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.45">{d.label}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function KpiCard({ label, value, sub, colorClass }: { label: string; value: string | number; sub?: string; colorClass: string }) {
    return (
        <div className={cn("rounded-2xl p-5 border", colorClass)}>
            <p className="text-sm font-medium opacity-75">{label}</p>
            <p className="text-3xl font-bold mt-1 leading-none">{value}</p>
            {sub && <p className="text-xs mt-1.5 opacity-60">{sub}</p>}
        </div>
    );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", color)}>{label}</span>;
}

function SectionTable({ children }: { children: React.ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm min-w-140">{children}</table>
        </div>
    );
}

function TableHead({ cols }: { cols: string[] }) {
    return (
        <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                {cols.map(c => (
                    <th key={c} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{c}</th>
                ))}
            </tr>
        </thead>
    );
}

function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
    if (totalPages <= 1) return null;
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    return (
        <div className="flex items-center justify-end gap-2 mt-4 print:hidden">
            <span className="text-sm text-slate-500 dark:text-slate-400 mr-2">{from}–{to} de {total}</span>
            <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <FaChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-300 min-w-14 text-center">{page} / {totalPages}</span>
            <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <FaChevronRight className="h-3 w-3" />
            </button>
        </div>
    );
}

function EmptySection({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-5 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4">
                <FaChartBar className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">{label}</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Prueba cambiar el período de tiempo</p>
        </div>
    );
}

function StatusDistribution({ data, total }: { data: { label: string; count: number; color: string }[]; total: number }) {
    const filtered = data.filter(d => d.count > 0);
    if (total === 0 || !filtered.length) return null;
    return (
        <div className="flex flex-wrap gap-2.5">
            {filtered.map(d => (
                <div key={d.label} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700/50">
                    <StatusBadge label={d.label} color={d.color} />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{d.count}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{Math.round((d.count / total) * 100)}%</span>
                </div>
            ))}
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">{title}</p>
            {children}
        </div>
    );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);
    return (
        <div
            className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4"
        >
            <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200 sm:max-h-[90dvh] sm:rounded-2xl sm:max-w-sm">
                {children}
            </div>
        </div>
    );
}

function StatusFilterBar({ options, active, onSelect }: { options: { key: string; label: string; count: number }[]; active: string; onSelect: (k: string) => void }) {
    return (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none print:hidden">
            {options.map(o => (
                <button key={o.key} onClick={() => onSelect(o.key)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                        active === o.key
                            ? "bg-primary text-white shadow-sm"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:text-primary"
                    )}>
                    {o.label}
                    <span className={cn("ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none",
                        active === o.key ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400")}>
                        {o.count}
                    </span>
                </button>
            ))}
        </div>
    );
}

function ExportButton({ onClick }: { onClick: () => void }) {
    return (
        <button onClick={onClick}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors print:hidden">
            <FaFileCsv className="h-4 w-4 text-green-600" />
            Exportar CSV
        </button>
    );
}

// ─── Print header (only visible when printing) ────────────────────────────────

function PrintHeader({ period, tab }: { period: string; tab: string }) {
    return (
        <div className="hidden print:block mb-8 pb-6 border-b border-slate-300">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <LogoSpark className="h-8 w-auto" />
                    <span className="text-xl font-bold text-slate-800">Atendia</span>
                </div>
                <p className="text-sm text-slate-500">
                    Generado el {new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Reporte · {tab}</h2>
            <p className="text-sm text-slate-500 mt-1">Período: {period}</p>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserReports() {

    // ── Auth & client ─────────────────────────────────────────────────────────
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(api.clientMembers.getByProfile, userProfile ? { profileId: userProfile._id } : "skip");
    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;
    const userRole = activeClientMember?.role ?? "member";

    const client = useQuery(api.clients.get, activeClientMember ? { id: activeClientMember.client } : "skip");
    const features = {
        enableOrders: client?.features?.enableOrders ?? false,
        enableAgenda: client?.features?.enableAgenda ?? false,
    };

    // ── Data (all guarded — Convex valida requireClientAccess en backend) ──────
    const leads = useQuery(api.leads.getByClient, clientId ? { clientId } : "skip");
    const conversationStates = useQuery(api.conversationStates.getByClient, clientId ? { clientId } : "skip");
    const orders = useQuery(api.orders.getByClient, clientId && features.enableOrders ? { clientId } : "skip");
    const appointments = useQuery(api.appointments.getByClient, clientId && features.enableAgenda ? { clientId } : "skip");
    const channels = useQuery(api.channels.getByClient, clientId ? { clientId } : "skip");
    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");
    const contactPhonesNeeded = useMemo(() => {
        const set = new Set<string>();
        for (const s of conversationStates ?? []) {
            const clean = normalizePhone(s.phone);
            if (clean && !isWebSession(s.phone)) set.add(clean);
        }
        for (const l of leads ?? []) {
            const clean = normalizePhone(l.phone);
            if (clean && !isWebSession(l.phone)) set.add(clean);
        }
        return Array.from(set);
    }, [conversationStates, leads]);

    const allContactsList = useQuery(
        api.contacts.getByClientForPhones,
        clientId && conversationStates && leads
            ? { clientId, phones: contactPhonesNeeded }
            : "skip"
    );

    // ── UI state ──────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<TabKey>("clients");
    const [tabInitialized, setTabInitialized] = useState(false);
    useEffect(() => {
        if (tabInitialized || !client) return;
        if (features.enableOrders) setActiveTab("orders");
        else if (features.enableAgenda) setActiveTab("appointments");
        setTabInitialized(true);
    }, [client, tabInitialized, features.enableOrders, features.enableAgenda]);
    const [dateRange, setDateRange] = useState<DateRange>("30d");
    const [customFromStr, setCustomFromStr] = useState("");
    const [customToStr, setCustomToStr] = useState("");
    const [customModalOpen, setCustomModalOpen] = useState(false);
    const [tempFromStr, setTempFromStr] = useState("");
    const [tempToStr, setTempToStr] = useState("");
    const [clientsPage, setClientsPage] = useState(1);
    const [ordersPage, setOrdersPage] = useState(1);
    const [apptPage, setApptPage] = useState(1);
    const [leadsFilter, setLeadsFilter] = useState("all");
    const [ordersFilter, setOrdersFilter] = useState("all");
    const [apptFilter, setApptFilter] = useState("all");
    const [assistantFilter, setAssistantFilter] = useState("all");
    const [channelFilter, setChannelFilter] = useState("all");
    const [contactsOnlyFilter, setContactsOnlyFilter] = useState(false);

    const customFrom = useMemo(() => customFromStr ? new Date(customFromStr + "T00:00:00") : null, [customFromStr]);
    const customTo = useMemo(() => customToStr ? new Date(customToStr + "T23:59:59") : null, [customToStr]);
    const periodLabel = getPeriodLabel(dateRange, customFrom, customTo);

    const channelMap = useMemo(() => new Map((channels ?? []).map(c => [c._id, c])), [channels]);
    const assistantMap = useMemo(() => new Map((assistants ?? []).map(a => [a._id, a])), [assistants]);
    const contactPhoneMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const c of (allContactsList ?? [])) {
            if (c.phone) m.set(c.phone, c.name);
        }
        return m;
    }, [allContactsList]);

    const getContactName = (rawPhone: string | undefined | null): string | null => {
        if (!rawPhone) return null;
        const clean = normalizePhone(rawPhone);
        return contactPhoneMap.get(clean) ?? null;
    };

    // ── Filtered leads & orders & appointments ────────────────────────────────

    const filteredLeads = useMemo(() => {
        if (!leads) return [];
        let result = filterByDate(leads, dateRange, customFrom, customTo);
        if (channelFilter !== "all") result = result.filter(l => l.channel === channelFilter);
        if (assistantFilter !== "all") {
            const ch = channels ?? [];
            const chIds = new Set(ch.filter(c => (c as any).assistant === assistantFilter).map(c => c._id));
            result = result.filter(l => chIds.has(l.channel));
        }
        return result.sort((a, b) => b._creationTime - a._creationTime);
    }, [leads, dateRange, customFrom, customTo, channelFilter, assistantFilter, channels]);

    const filteredOrders = useMemo(() => {
        if (!orders) return [];
        let byDate = filterByDate(orders, dateRange, customFrom, customTo);
        if (channelFilter !== "all") byDate = byDate.filter(o => (o as any).channel === channelFilter);
        if (assistantFilter !== "all") {
            const ch = channels ?? [];
            const chIds = new Set(ch.filter(c => (c as any).assistant === assistantFilter).map(c => c._id));
            byDate = byDate.filter(o => chIds.has((o as any).channel));
        }
        return (ordersFilter === "all" ? byDate : byDate.filter(o => o.status === ordersFilter))
            .sort((a, b) => b._creationTime - a._creationTime);
    }, [orders, dateRange, customFrom, customTo, ordersFilter, channelFilter, assistantFilter, channels]);

    const filteredAppts = useMemo(() => {
        if (!appointments) return [];
        let byDate = filterByDate(appointments, dateRange, customFrom, customTo);
        if (channelFilter !== "all") byDate = byDate.filter(a => (a as any).channel === channelFilter);
        if (assistantFilter !== "all") {
            const ch = channels ?? [];
            const chIds = new Set(ch.filter(c => (c as any).assistant === assistantFilter).map(c => c._id));
            byDate = byDate.filter(a => chIds.has((a as any).channel));
        }
        return (apptFilter === "all" ? byDate : byDate.filter(a => a.status === apptFilter))
            .sort((a, b) => a.start - b.start);
    }, [appointments, dateRange, customFrom, customTo, apptFilter, channelFilter, assistantFilter, channels]);

    // ── Merged contacts (Clientes tab) ────────────────────────────────────────
    type ContactRow = {
        key: string;
        name: string;
        rawPhone: string;
        isWeb: boolean;
        lead: (typeof filteredLeads)[0] | null;
        createdAt: number;
    };

    const allContacts = useMemo<ContactRow[]>(() => {
        if (!conversationStates || !leads) return [];

        let filteredStates = filterByDate(conversationStates, dateRange, customFrom, customTo);
        if (channelFilter !== "all") filteredStates = filteredStates.filter(s => (s as any).channelId === channelFilter);
        if (assistantFilter !== "all") {
            const ch = channels ?? [];
            const chIds = new Set(ch.filter(c => (c as any).assistant === assistantFilter).map(c => c._id));
            filteredStates = filteredStates.filter(s => chIds.has((s as any).channelId));
        }

        const map = new Map<string, ContactRow>();

        // Base: conversation states in period
        for (const s of filteredStates) {
            const raw = s.phone ?? s.sessionId ?? "";
            const key = normalizePhone(raw);
            if (!key) continue;
            if (!map.has(key)) {
                const contactName = !isWebSession(raw) ? (contactPhoneMap.get(key) ?? null) : null;
                map.set(key, { key, name: contactName ?? "—", rawPhone: raw, isWeb: isWebSession(raw), lead: null, createdAt: s._creationTime });
            }
        }

        // Enrich/add from leads in period — most recent lead per phone wins as display lead
        for (const lead of filteredLeads) {
            const key = normalizePhone(lead.phone);
            if (!key) continue;
            const contactName = !isWebSession(lead.phone) ? (contactPhoneMap.get(key) ?? null) : null;
            const existing = map.get(key);
            if (existing) {
                if (!existing.lead || lead._creationTime > existing.lead._creationTime) {
                    existing.lead = lead;
                    if (!contactName) existing.name = lead.name;
                    else existing.name = contactName;
                }
            } else {
                map.set(key, { key, name: contactName ?? lead.name, rawPhone: lead.phone, isWeb: isWebSession(lead.phone), lead, createdAt: lead._creationTime });
            }
        }

        let result = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
        if (contactsOnlyFilter) result = result.filter(c => contactPhoneMap.has(c.key));
        return result;
    }, [conversationStates, filteredLeads, leads, dateRange, customFrom, customTo, channelFilter, assistantFilter, channels, contactPhoneMap, contactsOnlyFilter]);

    const filteredContactsByLead = useMemo(() => {
        if (leadsFilter === "all") return allContacts;
        if (leadsFilter === "nolead") return allContacts.filter(c => !c.lead);
        return allContacts.filter(c => c.lead?.status === leadsFilter);
    }, [allContacts, leadsFilter]);

    // ── Chart data ────────────────────────────────────────────────────────────

    const leadsChartData = useMemo(
        () => groupByTime(filteredLeads, dateRange, customFrom, customTo),
        [filteredLeads, dateRange, customFrom, customTo]
    );
    const ordersChartData = useMemo(
        () => groupByTime(filterByDate(orders ?? [], dateRange, customFrom, customTo), dateRange, customFrom, customTo),
        [orders, dateRange, customFrom, customTo]
    );
    const apptsChartData = useMemo(
        () => groupByTime(filterByDate(appointments ?? [], dateRange, customFrom, customTo), dateRange, customFrom, customTo),
        [appointments, dateRange, customFrom, customTo]
    );

    // ── KPIs ──────────────────────────────────────────────────────────────────

    const clientsKpis = useMemo(() => {
        const total = allContacts.length;
        const withLead = allContacts.filter(c => c.lead !== null).length;
        const convRate = total > 0 ? Math.round((withLead / total) * 100) : 0;
        return { total, withLead, convRate };
    }, [allContacts]);

    const ordersKpis = useMemo(() => {
        const all = filterByDate(orders ?? [], dateRange, customFrom, customTo);
        const total = all.length;
        const pending = all.filter(o => o.status === "pending").length;
        const delivered = all.filter(o => o.status === "delivered").length;
        const nonCanceled = all.filter(o => o.status !== "canceled");
        const revenue = nonCanceled.reduce((s, o) => s + o.totalAmount, 0);
        const currency = nonCanceled[0]?.currency ?? "";
        return { total, pending, delivered, revenue, currency };
    }, [orders, dateRange, customFrom, customTo]);

    const apptKpis = useMemo(() => {
        const all = filterByDate(appointments ?? [], dateRange, customFrom, customTo);
        const now = Date.now();
        const total = all.length;
        const upcoming = all.filter(a => a.start > now && a.status !== "canceled").length;
        const confirmed = all.filter(a => a.status === "confirmed").length;
        const canceled = all.filter(a => a.status === "canceled").length;
        return { total, upcoming, confirmed, canceled };
    }, [appointments, dateRange, customFrom, customTo]);

    // ── Pagination ────────────────────────────────────────────────────────────

    const { pageItems: clientsItems, totalPages: clientsTotal, total: clientsCount } =
        useMemo(() => paginate(filteredContactsByLead, clientsPage), [filteredContactsByLead, clientsPage]);
    const { pageItems: ordersItems, totalPages: ordersTotal, total: ordersCount } =
        useMemo(() => paginate(filteredOrders, ordersPage), [filteredOrders, ordersPage]);
    const { pageItems: apptItems, totalPages: apptTotal, total: apptCount } =
        useMemo(() => paginate(filteredAppts, apptPage), [filteredAppts, apptPage]);

    // ── CSV exports ───────────────────────────────────────────────────────────

    const exportClientsCSV = () => downloadCSV(
        `clientes_${formatDate(Date.now())}.csv`,
        ["Nombre", "Teléfono", "Lead / Estado", "Tipo", "Canal", "Fecha"],
        filteredContactsByLead.map(c => [
            c.name,
            c.isWeb ? "Web" : `+${c.key}`,
            c.lead ? (LEAD_STATUS_CFG[c.lead.status]?.label ?? c.lead.status) : "Sin lead",
            c.lead?.type ?? "",
            c.lead ? (channelMap.get(c.lead.channel)?.name ?? "") : "",
            formatDateTime(c.createdAt),
        ])
    );

    const exportOrdersCSV = () => downloadCSV(
        `pedidos_${formatDate(Date.now())}.csv`,
        ["Nombre", "Teléfono", "Estado", "Total", "Moneda", "Dirección", "Items", "Fecha"],
        filteredOrders.map(o => [o.name, o.phone, ORDER_STATUS_CFG[o.status]?.label ?? o.status, o.totalAmount, o.currency, o.deliveryAddress, o.items.map(i => `${i.quantity}x ${i.productName}`).join("; "), formatDateTime(o._creationTime)])
    );

    const exportApptsCSV = () => downloadCSV(
        `citas_${formatDate(Date.now())}.csv`,
        ["Cliente", "Teléfono", "Estado", "Inicio", "Fin", "Notas"],
        filteredAppts.map(a => [a.customerName, a.customerPhone ?? "", APPT_STATUS_CFG[a.status]?.label ?? a.status, formatDateTime(a.start), a.end ? formatDateTime(a.end) : "", a.notes ?? ""])
    );

    // ── Helpers ───────────────────────────────────────────────────────────────

    const resetPages = () => {
        setClientsPage(1); setOrdersPage(1); setApptPage(1);
        setAssistantFilter("all"); setChannelFilter("all"); setContactsOnlyFilter(false);
    };

    const handleDateRange = (r: Exclude<DateRange, "custom">) => { setDateRange(r); resetPages(); };

    const handleLeadsFilter = (f: string) => { setLeadsFilter(f); setClientsPage(1); };
    const handleOrdersFilter = (f: string) => { setOrdersFilter(f); setOrdersPage(1); };
    const handleApptFilter = (f: string) => { setApptFilter(f); setApptPage(1); };

    // ── Loading guard ─────────────────────────────────────────────────────────

    if (!userProfile || userClients === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    if (userRole !== "owner") return <Navigate to="/panel" />;

    const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
        ...(features.enableOrders ? [{ key: "orders" as TabKey, label: "Pedidos", icon: <FaCartShopping className="h-4 w-4" /> }] : []),
        ...(features.enableAgenda ? [{ key: "appointments" as TabKey, label: "Citas", icon: <FaCalendarDay className="h-4 w-4" /> }] : []),
        { key: "clients", label: "Clientes potenciales", icon: <FaUsers className="h-4 w-4" /> },
    ];

    const activeTabLabel = tabs.find(t => t.key === activeTab)?.label ?? "";

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            {/* Print CSS — injected once, hides the layout header during print */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    header, .topbar { display: none !important; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    @page { margin: 15mm; size: A4; }
                }
            ` }} />

            <div className="space-y-0 pb-10 animate-in fade-in duration-500">

                {/* ── Print header (hidden on screen) ─────────────────────── */}
                <PrintHeader period={periodLabel} tab={activeTabLabel} />

                {/* ── Page header ─────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between pb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                            <span className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                                <FaChartBar className="h-6 w-6" />
                            </span>
                            Reportes
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 ml-1">
                            Actividad e insights de tu asistente
                        </p>
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors print:hidden shrink-0"
                    >
                        <FaPrint className="h-4 w-4" />
                        Imprimir / PDF
                    </button>
                </div>

                {/* ── Tab navigation (first interactive element) ──────────── */}
                <div className="print:hidden">
                    <div className="flex overflow-x-auto overflow-y-hidden scrollbar-none">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 shrink-0",
                                    activeTab === tab.key
                                        ? "border-primary text-primary bg-primary/5"
                                        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-slate-800" />
                </div>

                {/* ── Period filter (second element) ──────────────────────── */}
                <div className="pt-5 pb-4 print:hidden">
                    <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden scrollbar-none">
                        <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 shrink-0">
                            <FaFilter className="h-3 w-3" />
                            Período:
                        </span>
                        {DATE_RANGES.map(dr => (
                            <button
                                key={dr.key}
                                onClick={() => {
                                    if (dr.key === "custom") {
                                        setTempFromStr(customFromStr);
                                        setTempToStr(customToStr);
                                        setCustomModalOpen(true);
                                    } else {
                                        handleDateRange(dr.key);
                                    }
                                }}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all shrink-0 whitespace-nowrap",
                                    dateRange === dr.key
                                        ? "bg-primary text-white shadow-sm"
                                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:text-primary"
                                )}
                            >
                                {dr.key === "custom" && dateRange === "custom" && customFromStr && customToStr
                                    ? `${customFromStr.slice(8, 10)}/${customFromStr.slice(5, 7)} – ${customToStr.slice(8, 10)}/${customToStr.slice(5, 7)}`
                                    : dr.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Assistant / channel / contacts filter ───────────────── */}
                {(assistants && assistants.length > 1 || channels && channels.length > 1 || allContactsList && allContactsList.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2 pb-2 print:hidden">
                        {assistants && assistants.length > 1 && (
                            <select
                                value={assistantFilter}
                                onChange={e => { setAssistantFilter(e.target.value); setChannelFilter("all"); setClientsPage(1); setOrdersPage(1); setApptPage(1); }}
                                className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="all">Todos los asistentes</option>
                                {assistants.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
                            </select>
                        )}
                        {channels && channels.length > 1 && (
                            <select
                                value={channelFilter}
                                onChange={e => { setChannelFilter(e.target.value); setClientsPage(1); setOrdersPage(1); setApptPage(1); }}
                                className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="all">Todos los canales</option>
                                {(assistantFilter === "all" ? channels : channels.filter(c => (c as any).assistant === assistantFilter))
                                    .map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        )}
                        {allContactsList && allContactsList.length > 0 && activeTab === "clients" && (
                            <button
                                onClick={() => { setContactsOnlyFilter(v => !v); setClientsPage(1); }}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border",
                                    contactsOnlyFilter
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:text-primary"
                                )}
                            >
                                Solo contactos guardados
                            </button>
                        )}
                        {(assistantFilter !== "all" || channelFilter !== "all" || contactsOnlyFilter) && (
                            <button
                                onClick={() => { setAssistantFilter("all"); setChannelFilter("all"); setContactsOnlyFilter(false); setClientsPage(1); setOrdersPage(1); setApptPage(1); }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <FaXmark className="h-3 w-3" />
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                )}

                {/* ── Custom date modal ────────────────────────────────────── */}
                {customModalOpen && (
                    <ModalOverlay onClose={() => setCustomModalOpen(false)}>
                        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <div className="flex items-center gap-2">
                                <FaCalendar className="h-4 w-4 text-primary" />
                                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Período personalizado</h3>
                            </div>
                            <button onClick={() => setCustomModalOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <FaXmark className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Desde</label>
                                <input
                                    type="date"
                                    value={tempFromStr}
                                    onChange={e => setTempFromStr(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Hasta</label>
                                <input
                                    type="date"
                                    value={tempToStr}
                                    min={tempFromStr}
                                    onChange={e => setTempToStr(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                            <button
                                onClick={() => setCustomModalOpen(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                disabled={!tempFromStr || !tempToStr}
                                onClick={() => {
                                    setCustomFromStr(tempFromStr);
                                    setCustomToStr(tempToStr);
                                    setDateRange("custom");
                                    resetPages();
                                    setCustomModalOpen(false);
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Aplicar
                            </button>
                        </div>
                    </ModalOverlay>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* Tab: Clientes                                             */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === "clients" && (
                    <div className="space-y-6">
                        {/* KPIs */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <KpiCard label="Total contactos" value={clientsKpis.total}
                                colorClass="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100" />
                            <KpiCard label="Generaron un lead" value={clientsKpis.withLead}
                                colorClass="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-800 dark:text-blue-200" />
                            <KpiCard label="Tasa de conversión" value={`${clientsKpis.convRate}%`}
                                sub="Contactos que se convirtieron en lead"
                                colorClass="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200" />
                        </div>

                        {/* Chart */}
                        <ChartCard title="Nuevos leads por período">
                            {leads === undefined
                                ? <div className="flex justify-center py-8"><FaSpinner className="animate-spin text-primary text-2xl" /></div>
                                : <BarChart data={leadsChartData} color={C.blue} />
                            }
                        </ChartCard>

                        {/* Lead status distribution */}
                        {filteredLeads.length > 0 && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">Distribución de leads por estado</p>
                                <StatusDistribution
                                    total={filteredLeads.length}
                                    data={Object.entries(LEAD_STATUS_CFG).map(([key, cfg]) => ({
                                        label: cfg.label,
                                        count: filteredLeads.filter(l => l.status === key).length,
                                        color: cfg.color,
                                    }))}
                                />
                            </div>
                        )}

                        {/* Status filter + table */}
                        {allContacts.length > 0 && (
                            <StatusFilterBar
                                active={leadsFilter}
                                onSelect={handleLeadsFilter}
                                options={[
                                    { key: "all", label: "Todos", count: allContacts.length },
                                    { key: "nolead", label: "Sin lead", count: allContacts.filter(c => !c.lead).length },
                                    ...Object.entries(LEAD_STATUS_CFG)
                                        .map(([key, cfg]) => ({ key, label: cfg.label, count: allContacts.filter(c => c.lead?.status === key).length }))
                                        .filter(o => o.count > 0),
                                ]}
                            />
                        )}

                        <div>
                            <div className="flex justify-end mb-3"><ExportButton onClick={exportClientsCSV} /></div>
                            {conversationStates === undefined || leads === undefined ? (
                                <div className="flex justify-center py-12"><FaSpinner className="animate-spin text-primary text-3xl" /></div>
                            ) : allContacts.length === 0 ? (
                                <EmptySection label="No hay contactos en este período" />
                            ) : (
                                <>
                                    <SectionTable>
                                        <TableHead cols={["Contacto", "Teléfono", "Lead", "Canal", "Visto"]} />
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {clientsItems.map(c => {
                                                const contactName = !c.isWeb ? getContactName(c.rawPhone) : null;
                                                const displayName = contactName ?? (c.name !== "—" ? c.name : null);
                                                return (
                                                <tr key={c.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                                        {displayName
                                                            ? <span className="flex items-center gap-1.5">
                                                                {contactName && <span title="Contacto guardado" className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 inline-block" />}
                                                                {displayName}
                                                              </span>
                                                            : <span className="text-slate-400 italic text-xs">Sin nombre</span>}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                                                        <Link
                                                            to={`/panel/mensajes?phone=${encodeURIComponent(c.rawPhone)}${c.lead?.channel ? `&channel=${c.lead.channel}` : ""}`}
                                                            className="text-primary hover:underline"
                                                        >
                                                            {formatPhone(c.rawPhone)}
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {c.lead
                                                            ? <StatusBadge label={LEAD_STATUS_CFG[c.lead.status]?.label ?? c.lead.status} color={LEAD_STATUS_CFG[c.lead.status]?.color ?? ""} />
                                                            : <span className="text-xs text-slate-400 dark:text-slate-600 italic">Sin lead</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                                        {c.lead ? (channelMap.get(c.lead.channel)?.name ?? "—") : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                        {formatDate(c.createdAt)}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </SectionTable>
                                    <Pager page={clientsPage} totalPages={clientsTotal} total={clientsCount} onPage={setClientsPage} />
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* Tab: Pedidos                                              */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === "orders" && features.enableOrders && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <KpiCard label="Total pedidos" value={ordersKpis.total}
                                colorClass="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100" />
                            <KpiCard label="Pendientes" value={ordersKpis.pending}
                                colorClass="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200" />
                            <KpiCard label="Entregados" value={ordersKpis.delivered}
                                colorClass="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-200" />
                            <KpiCard
                                label="Facturado (est.)"
                                value={`${ordersKpis.currency} ${ordersKpis.revenue.toLocaleString("es-UY", { minimumFractionDigits: 0 })}`}
                                sub="Excluyendo cancelados"
                                colorClass="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200"
                            />
                        </div>

                        <ChartCard title="Pedidos por período">
                            {orders === undefined
                                ? <div className="flex justify-center py-8"><FaSpinner className="animate-spin text-primary text-2xl" /></div>
                                : <BarChart data={ordersChartData} color={C.amber} />
                            }
                        </ChartCard>

                        {filteredOrders.length > 0 && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">Distribución por estado</p>
                                <StatusDistribution
                                    total={filterByDate(orders ?? [], dateRange, customFrom, customTo).length}
                                    data={Object.entries(ORDER_STATUS_CFG).map(([key, cfg]) => ({
                                        label: cfg.label,
                                        count: filterByDate(orders ?? [], dateRange, customFrom, customTo).filter(o => o.status === key).length,
                                        color: cfg.color,
                                    }))}
                                />
                            </div>
                        )}

                        {(orders?.length ?? 0) > 0 && (
                            <StatusFilterBar active={ordersFilter} onSelect={handleOrdersFilter}
                                options={[
                                    { key: "all", label: "Todos", count: filterByDate(orders ?? [], dateRange, customFrom, customTo).length },
                                    ...Object.entries(ORDER_STATUS_CFG).map(([key, cfg]) => ({
                                        key, label: cfg.label,
                                        count: filterByDate(orders ?? [], dateRange, customFrom, customTo).filter(o => o.status === key).length,
                                    })).filter(o => o.count > 0),
                                ]}
                            />
                        )}

                        <div>
                            <div className="flex justify-end mb-3"><ExportButton onClick={exportOrdersCSV} /></div>
                            {orders === undefined ? (
                                <div className="flex justify-center py-12"><FaSpinner className="animate-spin text-primary text-3xl" /></div>
                            ) : filteredOrders.length === 0 ? (
                                <EmptySection label="No hay pedidos en este período" />
                            ) : (
                                <>
                                    <SectionTable>
                                        <TableHead cols={["Cliente", "Teléfono", "Estado", "Total", "Items", "Fecha"]} />
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {ordersItems.map(o => {
                                                const oContactName = getContactName(o.phone);
                                                return (
                                                <tr key={o._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                                        {oContactName
                                                            ? <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 inline-block" />{oContactName}</span>
                                                            : o.name}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs">
                                                        <Link
                                                            to={`/panel/mensajes?phone=${encodeURIComponent(o.phone)}`}
                                                            className="text-primary hover:underline"
                                                        >
                                                            {formatPhone(o.phone)}
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge label={ORDER_STATUS_CFG[o.status]?.label ?? o.status} color={ORDER_STATUS_CFG[o.status]?.color ?? ""} />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                        {o.currency} {o.totalAmount.toLocaleString("es-UY", { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-55">
                                                        <span className="line-clamp-2">{o.items.map(i => `${i.quantity}× ${i.productName}`).join(", ")}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{formatDate(o._creationTime)}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </SectionTable>
                                    <Pager page={ordersPage} totalPages={ordersTotal} total={ordersCount} onPage={setOrdersPage} />
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* Tab: Citas                                                */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === "appointments" && features.enableAgenda && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <KpiCard label="Total citas" value={apptKpis.total}
                                colorClass="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100" />
                            <KpiCard label="Próximas" value={apptKpis.upcoming} sub="Aún no ocurridas"
                                colorClass="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/50 text-indigo-800 dark:text-indigo-200" />
                            <KpiCard label="Confirmadas" value={apptKpis.confirmed}
                                colorClass="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-200" />
                            <KpiCard label="Canceladas" value={apptKpis.canceled}
                                colorClass="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200" />
                        </div>

                        <ChartCard title="Citas agendadas por período">
                            {appointments === undefined
                                ? <div className="flex justify-center py-8"><FaSpinner className="animate-spin text-primary text-2xl" /></div>
                                : <BarChart data={apptsChartData} color={C.indigo} />
                            }
                        </ChartCard>

                        {filteredAppts.length > 0 && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">Distribución por estado</p>
                                <StatusDistribution
                                    total={filterByDate(appointments ?? [], dateRange, customFrom, customTo).length}
                                    data={Object.entries(APPT_STATUS_CFG).map(([key, cfg]) => ({
                                        label: cfg.label,
                                        count: filterByDate(appointments ?? [], dateRange, customFrom, customTo).filter(a => a.status === key).length,
                                        color: cfg.color,
                                    }))}
                                />
                            </div>
                        )}

                        {(appointments?.length ?? 0) > 0 && (
                            <StatusFilterBar active={apptFilter} onSelect={handleApptFilter}
                                options={[
                                    { key: "all", label: "Todas", count: filterByDate(appointments ?? [], dateRange, customFrom, customTo).length },
                                    ...Object.entries(APPT_STATUS_CFG).map(([key, cfg]) => ({
                                        key, label: cfg.label,
                                        count: filterByDate(appointments ?? [], dateRange, customFrom, customTo).filter(a => a.status === key).length,
                                    })).filter(o => o.count > 0),
                                ]}
                            />
                        )}

                        <div>
                            <div className="flex justify-end mb-3"><ExportButton onClick={exportApptsCSV} /></div>
                            {appointments === undefined ? (
                                <div className="flex justify-center py-12"><FaSpinner className="animate-spin text-primary text-3xl" /></div>
                            ) : filteredAppts.length === 0 ? (
                                <EmptySection label="No hay citas en este período" />
                            ) : (
                                <>
                                    <SectionTable>
                                        <TableHead cols={["Cliente", "Teléfono", "Estado", "Inicio", "Fin", "Notas"]} />
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {apptItems.map(a => {
                                                const isPast = a.start < Date.now();
                                                return (
                                                    <tr key={a._id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors", isPast && a.status !== "canceled" && "opacity-60")}>
                                                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                                            {(() => {
                                                                const aContactName = a.customerPhone ? getContactName(a.customerPhone) : null;
                                                                return aContactName
                                                                    ? <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 inline-block" />{aContactName}</span>
                                                                    : a.customerName;
                                                            })()}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-xs">
                                                            {a.customerPhone ? (
                                                                <Link
                                                                    to={`/panel/mensajes?phone=${encodeURIComponent(a.customerPhone)}${a.channel ? `&channel=${a.channel}` : ""}`}
                                                                    className="text-primary hover:underline"
                                                                >
                                                                    {formatPhone(a.customerPhone)}
                                                                </Link>
                                                            ) : "—"}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <StatusBadge label={APPT_STATUS_CFG[a.status]?.label ?? a.status} color={APPT_STATUS_CFG[a.status]?.color ?? ""} />
                                                        </td>
                                                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateTime(a.start)}</td>
                                                        <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{a.end ? formatDateTime(a.end) : "—"}</td>
                                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                                                            <span className="line-clamp-2">{a.notes ?? "—"}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </SectionTable>
                                    <Pager page={apptPage} totalPages={apptTotal} total={apptCount} onPage={setApptPage} />
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
