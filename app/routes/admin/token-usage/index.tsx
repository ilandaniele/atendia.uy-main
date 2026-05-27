import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMemo, useState } from "react";
import {
    FaRobot,
    FaWhatsapp,
    FaGlobe,
    FaBuilding,
} from "react-icons/fa6";
import { MdToken } from "react-icons/md";
import Breadcrumbs from "../components/breadcrumbs";
import PageHeader from "../components/page-header";
import { usePaginatedQuery } from "convex/react";

export function meta() {
    return [{ title: "Atendia — Administración — Uso de Tokens" }];
}

const SOURCE_LABELS: Record<string, string> = {
    whatsapp: "WhatsApp",
    web: "Web",
};

const SOURCE_COLORS: Record<string, string> = {
    whatsapp: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    web: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function StatCard({
    icon,
    label,
    value,
    sub,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub?: string;
}) {
    return (
        <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-light dark:bg-slate-800 text-primary dark:text-slate-300 shrink-0">
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-500 dark:text-slate-400 truncate">{label}</p>
                <p className="text-2xl font-bold text-neutral-900 dark:text-slate-100 tabular-nums">{value}</p>
                {sub && <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function fmt(n: number) {
    return n.toLocaleString("es-UY");
}

const PAGE_SIZE = 50;

export default function TokenUsagePage() {
    const [clientFilter, setClientFilter] = useState<string>("");
    const [sourceFilter, setSourceFilter] = useState<string>("");

    const now = Date.now();
    const startOfMonth = useMemo(() => {
        const d = new Date(now);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }, []);
    const startOfToday = useMemo(() => {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }, []);

    const summaryAll = useQuery(api.tokenUsageLogs.summary, {});
    const summaryMonth = useQuery(api.tokenUsageLogs.summary, { fromTs: startOfMonth });
    const summaryToday = useQuery(api.tokenUsageLogs.summary, { fromTs: startOfToday });
    const allClients = useQuery(api.tokenUsageLogs.clients, {});

    const { results, status, loadMore } = usePaginatedQuery(
        api.tokenUsageLogs.list,
        {
            clientId: clientFilter ? (clientFilter as Id<"clients">) : undefined,
            source: sourceFilter ? (sourceFilter as "whatsapp" | "web") : undefined,
        },
        { initialNumItems: PAGE_SIZE }
    );

    return (
        <div className="space-y-6">
            <Breadcrumbs items={[{ label: "Uso de Tokens" }]} />
            <PageHeader title="Uso de Tokens IA" />

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    icon={<MdToken className="h-6 w-6" />}
                    label="Tokens totales consumidos"
                    value={summaryAll ? fmt(summaryAll.totalTokens) : "—"}
                />
                <StatCard
                    icon={<MdToken className="h-6 w-6" />}
                    label="Tokens este mes"
                    value={summaryMonth ? fmt(summaryMonth.totalTokens) : "—"}
                />
                <StatCard
                    icon={<FaWhatsapp className="h-6 w-6" />}
                    label="WhatsApp (total)"
                    value={summaryAll ? fmt(summaryAll.bySource["whatsapp"] ?? 0) : "—"}
                />
                <StatCard
                    icon={<FaGlobe className="h-6 w-6" />}
                    label="Web (total)"
                    value={summaryAll ? fmt(summaryAll.bySource["web"] ?? 0) : "—"}
                />
            </div>

            {/* Top clients */}
            {summaryAll && summaryAll.byClient.length > 0 && (
                <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                    <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                        <FaBuilding className="h-4 w-4 text-neutral-400" />
                        Top cuentas por consumo (total)
                    </h2>
                    <div className="space-y-2">
                        {summaryAll.byClient.map((entry) => {
                            const pct = summaryAll.totalTokens > 0
                                ? Math.round((entry.tokens / summaryAll.totalTokens) * 100)
                                : 0;
                            return (
                                <div key={entry.clientId} className="flex items-center gap-3">
                                    <span className="w-36 truncate text-sm text-neutral-700 dark:text-slate-300 shrink-0">
                                        {entry.clientName}
                                    </span>
                                    <div className="flex-1 bg-neutral-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="h-2 rounded-full bg-primary dark:bg-primary"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-sm tabular-nums text-neutral-600 dark:text-slate-400 w-24 text-right shrink-0">
                                        {fmt(entry.tokens)}
                                    </span>
                                    <span className="text-xs text-neutral-400 dark:text-slate-500 w-10 text-right shrink-0">
                                        {pct}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filters + table */}
            <div className="rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="p-4 border-b border-neutral-100 dark:border-slate-800 flex flex-wrap gap-3 items-center">
                    <h2 className="text-sm font-semibold text-neutral-700 dark:text-slate-200 mr-auto">
                        Registro detallado
                    </h2>

                    {/* Source filter */}
                    <select
                        className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                    >
                        <option value="">Todas las fuentes</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="web">Web</option>
                    </select>

                    {/* Client filter */}
                    <select
                        className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-3 py-1.5 text-neutral-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                    >
                        <option value="">Todas las cuentas</option>
                        {allClients?.map((c) => (
                            <option key={c._id} value={c._id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 dark:bg-slate-800/60 text-left">
                                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-slate-400">Fecha</th>
                                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-slate-400">Cuenta</th>
                                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-slate-400">Canal</th>
                                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-slate-400">Fuente</th>
                                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-slate-400">Identificador</th>
                                <th className="px-4 py-3 font-medium text-neutral-500 dark:text-slate-400 text-right">Tokens</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-slate-800">
                            {results.length === 0 && status !== "LoadingFirstPage" && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-slate-500">
                                        No hay registros
                                    </td>
                                </tr>
                            )}
                            {status === "LoadingFirstPage" && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400 dark:text-slate-500">
                                        Cargando...
                                    </td>
                                </tr>
                            )}
                            {results.map((log) => (
                                <tr
                                    key={log._id}
                                    className="hover:bg-neutral-50 dark:hover:bg-slate-800/40 transition-colors"
                                >
                                    <td className="px-4 py-3 text-neutral-600 dark:text-slate-300 whitespace-nowrap">
                                        {new Date(log._creationTime).toLocaleString("es-UY", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-neutral-800 dark:text-slate-200">
                                        {log.clientName}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 dark:text-slate-400">
                                        {log.channelName}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${SOURCE_COLORS[log.source] ?? ""}`}>
                                            {log.source === "whatsapp"
                                                ? <FaWhatsapp className="h-3 w-3" />
                                                : <FaGlobe className="h-3 w-3" />
                                            }
                                            {SOURCE_LABELS[log.source] ?? log.source}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-500 dark:text-slate-500 font-mono text-xs">
                                        {log.phone ?? log.sessionId ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-800 dark:text-slate-200">
                                        {fmt(log.tokensUsed)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {status === "CanLoadMore" && (
                    <div className="p-4 border-t border-neutral-100 dark:border-slate-800 flex justify-center">
                        <button
                            type="button"
                            onClick={() => loadMore(PAGE_SIZE)}
                            className="rounded-lg border border-neutral-200 dark:border-slate-700 px-4 py-2 text-sm text-neutral-600 dark:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cargar más
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
