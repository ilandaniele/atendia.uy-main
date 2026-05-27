import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import type { DataTableColumn } from "mantine-datatable";
import Breadcrumbs from "../components/breadcrumbs";
import PageHeader from "../components/page-header";
import Datatable from "../components/datatable";
import { toast, ToastContainer } from "react-toastify";
import {
    FaMoneyBillWave,
    FaCircleCheck,
    FaCircleXmark,
    FaClock,
    FaBuilding,
    FaPen,
    FaXmark,
    FaSpinner,
    FaMagnifyingGlass,
} from "react-icons/fa6";

export function meta() {
    return [{ title: "Atendia — Administración — Facturación" }];
}

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
    PAID: "Pagada",
    PENDING: "Pendiente",
    REJECTED: "Rechazada",
    CANCELLED: "Cancelada",
    EXPIRED: "Expirada",
};

const STATUS_COLORS: Record<string, string> = {
    PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    CANCELLED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    EXPIRED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const DONUT_COLORS: Record<string, string> = {
    PAID: "#22c55e",
    PENDING: "#eab308",
    REJECTED: "#ef4444",
    CANCELLED: "#94a3b8",
    EXPIRED: "#f97316",
};

// ─── Invoice Edit Modal ───────────────────────────────────────────────────────

type InvoiceRow = {
    _id: string;
    orderId: string;
    status: string;
    _creationTime: number;
    clientName: string;
    clientBusinessName: string;
    planName: string;
    planAmount: number;
    planCurrency: string;
    plan?: string;
};

type DLocalInfo =
    | { manual: true }
    | { manual: false; payment: Record<string, unknown> };

function InvoiceModal({
    invoice,
    onClose,
    onSaved,
}: {
    invoice: InvoiceRow;
    onClose: () => void;
    onSaved: () => void;
}) {
    const updateInvoice = useMutation(api.adminBilling.updateInvoice);
    const getDLocalInfo = useAction(api.adminBilling.getInvoiceDLocalInfo);

    const [status, setStatus] = useState(invoice.status);
    const [isSaving, setIsSaving] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [dlocalInfo, setDlocalInfo] = useState<DLocalInfo | null>(null);
    const [dlocalError, setDlocalError] = useState<string | null>(null);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateInvoice({ id: invoice._id as any, status: status as any });
            toast.success("Factura actualizada");
            onSaved();
            onClose();
        } catch {
            toast.error("Error al actualizar la factura");
        } finally {
            setIsSaving(false);
        }
    };

    const handleFetchDLocal = async () => {
        setIsFetching(true);
        setDlocalError(null);
        setDlocalInfo(null);
        try {
            const result = await getDLocalInfo({ orderId: invoice.orderId });
            setDlocalInfo(result as DLocalInfo);
        } catch (e: any) {
            setDlocalError(e?.message ?? "Error al consultar dLocal Go");
        } finally {
            setIsFetching(false);
        }
    };

    const isManual = invoice.orderId.startsWith("ADMIN-");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Editar factura</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                            ["Cliente", invoice.clientName],
                            ["Empresa", invoice.clientBusinessName],
                            ["Plan", invoice.planName],
                            ["Monto", `${invoice.planCurrency} ${invoice.planAmount.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`],
                            ["Fecha", new Date(invoice._creationTime).toLocaleDateString("es-UY")],
                            ["ID de orden", invoice.orderId],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
                                <p className="font-medium text-slate-700 dark:text-slate-200 break-all">{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Status editor */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Estado</label>
                        <div className="flex gap-2">
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-xl border text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {["PENDING", "PAID", "REJECTED", "CANCELLED", "EXPIRED"].map((s) => (
                                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || status === invoice.status}
                                className="btn-primary px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <FaSpinner className="animate-spin" /> : "Guardar"}
                            </button>
                        </div>
                    </div>

                    {/* dLocal info */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Información en dLocal Go</p>
                            {!isManual && (
                                <button
                                    onClick={handleFetchDLocal}
                                    disabled={isFetching}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                >
                                    {isFetching ? <FaSpinner className="animate-spin w-3 h-3" /> : <FaMagnifyingGlass className="w-3 h-3" />}
                                    Consultar
                                </button>
                            )}
                        </div>

                        {isManual && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3">
                                Factura generada manualmente por el administrador — no tiene registro en dLocal Go.
                            </p>
                        )}

                        {dlocalError && (
                            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">{dlocalError}</p>
                        )}

                        {dlocalInfo && !dlocalInfo.manual && (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="max-h-56 overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <tbody>
                                            {Object.entries((dlocalInfo as { manual: false; payment: Record<string, unknown> }).payment).map(([key, val]) => (
                                                <tr key={key} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                                    <td className="px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400 w-2/5 align-top">{key}</td>
                                                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 break-all">
                                                        {typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── SVG Charts ───────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number }[] }) {
    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const barWidth = 36;
    const gap = 14;
    const chartH = 120;
    const totalW = data.length * (barWidth + gap) - gap;

    return (
        <svg
            viewBox={`0 0 ${totalW + 24} ${chartH + 44}`}
            className="w-full overflow-visible"
            aria-label="Gráfico de barras de facturación por mes"
        >
            {data.map((d, i) => {
                const barH = Math.max((d.value / maxValue) * chartH, d.value > 0 ? 4 : 0);
                const x = 12 + i * (barWidth + gap);
                const y = chartH - barH;
                return (
                    <g key={i}>
                        {/* Background track */}
                        <rect
                            x={x}
                            y={0}
                            width={barWidth}
                            height={chartH}
                            rx={6}
                            className="fill-slate-100 dark:fill-slate-800"
                        />
                        {/* Bar */}
                        <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barH}
                            rx={6}
                            className="fill-primary"
                        />
                        {/* Month label */}
                        <text
                            x={x + barWidth / 2}
                            y={chartH + 18}
                            textAnchor="middle"
                            fontSize={11}
                            className="fill-slate-500 dark:fill-slate-400"
                        >
                            {d.label}
                        </text>
                        {/* Value label */}
                        {d.value > 0 && (
                            <text
                                x={x + barWidth / 2}
                                y={y - 5}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight="600"
                                className="fill-slate-700 dark:fill-slate-200"
                            >
                                {d.value}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

function DonutChart({
    segments,
    total,
}: {
    segments: { label: string; value: number; color: string }[];
    total: number;
}) {
    const r = 36;
    const cx = 50;
    const cy = 50;
    let cumulativeAngle = -90;

    const paths = segments
        .filter((s) => s.value > 0)
        .map((seg) => {
            const angle = (seg.value / total) * 360;
            const startRad = (cumulativeAngle * Math.PI) / 180;
            const endRad = ((cumulativeAngle + angle) * Math.PI) / 180;
            cumulativeAngle += angle;

            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            const largeArc = angle > 180 ? 1 : 0;

            return {
                d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
                color: seg.color,
                label: seg.label,
            };
        });

    return (
        <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0" aria-label="Distribución de estados de factura">
            {total === 0 ? (
                <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={14} />
            ) : (
                paths.map((p, i) => (
                    <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={14} strokeLinecap="butt" />
                ))
            )}
            <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={16}
                fontWeight="bold"
                className="fill-slate-800 dark:fill-slate-100"
            >
                {total}
            </text>
        </svg>
    );
}

// ─── Table columns ─────────────────────────────────────────────────────────

const buildColumns = (onEdit: (row: InvoiceRow) => void): DataTableColumn<InvoiceRow>[] => [
    {
        accessor: "clientName",
        title: "Cliente",
    },
    {
        accessor: "planName",
        title: "Plan",
    },
    {
        accessor: "planAmount",
        title: "Monto",
        render: ({ planAmount, planCurrency }: any) =>
            `${planCurrency} ${planAmount.toLocaleString("es-UY", { minimumFractionDigits: 2 })}`,
    },
    {
        accessor: "status",
        title: "Estado",
        render: ({ status }: any) => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? ""}`}>
                {STATUS_LABELS[status] ?? status}
            </span>
        ),
    },
    {
        accessor: "orderId",
        title: "ID de orden",
        render: ({ orderId }: any) => (
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{orderId}</span>
        ),
    },
    {
        accessor: "_creationTime",
        title: "Fecha",
        sortable: true,
        render: ({ _creationTime }: any) =>
            new Date(_creationTime).toLocaleDateString("es-UY", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
            }),
    },
    {
        accessor: "actions",
        title: "",
        render: (row: InvoiceRow) => (
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Editar factura"
            >
                <FaPen className="w-3 h-3" />
            </button>
        ),
    },
];

// ─── Monthly aggregation (last 6 months) ─────────────────────────────────

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function getLast6Months() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth(), label: MONTH_NAMES[d.getMonth()] });
    }
    return months;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminBilling() {
    const invoices = useQuery(api.adminBilling.listInvoicesWithDetails);
    const stats = useQuery(api.adminBilling.billingStats);
    const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null);

    const columns = useMemo(() => buildColumns(setEditingInvoice), []);

    const last6Months = useMemo(() => getLast6Months(), []);

    const monthlyData = useMemo(() => {
        if (!invoices) return last6Months.map((m) => ({ label: m.label, value: 0 }));
        return last6Months.map((m) => ({
            label: m.label,
            value: invoices.filter((inv) => {
                const d = new Date(inv._creationTime);
                return d.getFullYear() === m.year && d.getMonth() === m.month && inv.status === "PAID";
            }).length,
        }));
    }, [invoices, last6Months]);

    const donutSegments = useMemo(() => {
        const byStatus = stats?.byStatus ?? {};
        return Object.entries(byStatus).map(([status, count]) => ({
            label: STATUS_LABELS[status] ?? status,
            value: count as number,
            color: DONUT_COLORS[status] ?? "#94a3b8",
        }));
    }, [stats]);

    const totalInvoices = stats?.totalInvoices ?? 0;

    const statCards = [
        {
            label: "Ingresos cobrados (USD)",
            value: stats ? `$ ${(stats.paidRevenue["USD"] ?? 0).toLocaleString("es-UY", { minimumFractionDigits: 2 })}` : "—",
            icon: <FaMoneyBillWave className="h-5 w-5" />,
            color: "text-green-600 bg-green-50 dark:bg-green-900/20",
        },
        {
            label: "Ingresos cobrados (UYU)",
            value: stats ? `$ ${(stats.paidRevenue["UYU"] ?? 0).toLocaleString("es-UY", { minimumFractionDigits: 2 })}` : "—",
            icon: <FaMoneyBillWave className="h-5 w-5" />,
            color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
        },
        {
            label: "Facturas pagadas",
            value: stats?.byStatus?.["PAID"] ?? 0,
            icon: <FaCircleCheck className="h-5 w-5" />,
            color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
        },
        {
            label: "Facturas pendientes",
            value: stats?.byStatus?.["PENDING"] ?? 0,
            icon: <FaClock className="h-5 w-5" />,
            color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20",
        },
        {
            label: "Facturas rechazadas / canceladas",
            value: (stats?.byStatus?.["REJECTED"] ?? 0) + (stats?.byStatus?.["CANCELLED"] ?? 0),
            icon: <FaCircleXmark className="h-5 w-5" />,
            color: "text-red-600 bg-red-50 dark:bg-red-900/20",
        },
        {
            label: "Suscripciones activas",
            value: stats?.activeSubscriptions ?? 0,
            icon: <FaBuilding className="h-5 w-5" />,
            color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20",
        },
    ];

    return (
        <div className="flex flex-col gap-6">
            <ToastContainer position="top-right" theme="colored" />
            {editingInvoice && (
                <InvoiceModal
                    invoice={editingInvoice}
                    onClose={() => setEditingInvoice(null)}
                    onSaved={() => setEditingInvoice(null)}
                />
            )}
            <Breadcrumbs items={[{ label: "Facturación" }]} />
            <PageHeader title="Facturación" />

            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {statCards.map((card, i) => (
                    <div
                        key={i}
                        className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm"
                    >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.color}`}>
                            {card.icon}
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{card.value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{card.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bar chart: pagadas por mes */}
                <div className="lg:col-span-2 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                        Facturas pagadas — últimos 6 meses
                    </h2>
                    <BarChart data={monthlyData} />
                </div>

                {/* Donut: status distribution */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                        Distribución por estado
                    </h2>
                    <div className="flex items-center gap-6">
                        <DonutChart segments={donutSegments} total={totalInvoices} />
                        <ul className="flex flex-col gap-2 text-sm">
                            {donutSegments.map((seg) => (
                                <li key={seg.label} className="flex items-center gap-2">
                                    <span
                                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: seg.color }}
                                    />
                                    <span className="text-slate-600 dark:text-slate-300">{seg.label}</span>
                                    <span className="ml-auto font-semibold text-slate-800 dark:text-slate-100">{seg.value}</span>
                                </li>
                            ))}
                            {donutSegments.length === 0 && (
                                <li className="text-slate-400 dark:text-slate-500 text-xs">Sin datos</li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Subscriptions by plan */}
            {stats && stats.subsByPlan.length > 0 && (
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                        Suscripciones activas por plan
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {stats.subsByPlan.map((plan) => {
                            const pct = stats.activeSubscriptions > 0
                                ? Math.round((plan.count / stats.activeSubscriptions) * 100)
                                : 0;
                            return (
                                <div
                                    key={plan.name}
                                    className="flex flex-col gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700"
                                >
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{plan.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {plan.currency} {plan.amount.toLocaleString("es-UY", { minimumFractionDigits: 2 })}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                                            {plan.count}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Invoices table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                    Todas las facturas
                </h2>
                <Datatable
                    columns={columns as any}
                    records={invoices as any}
                    searchPlaceholder="Buscar por cliente, plan, orden..."
                    initialSortStatus={{ columnAccessor: "_creationTime", direction: "desc" }}
                    emptyState={{ text: "No hay facturas para mostrar." }}
                />
            </div>
        </div>
    );
}
