import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router";
import {
    FaSpinner, FaBoxOpen, FaCircleCheck, FaTruck, FaBan,
    FaHourglass, FaCheckDouble, FaChevronDown, FaChevronUp, FaTrash,
    FaWhatsapp, FaGlobe, FaMagnifyingGlass, FaXmark,
    FaChevronLeft, FaChevronRight,
} from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn } from "utils/utils";
import { formatMoney } from "utils/currencies";

// ─── Types ────────────────────────────────────────────────────────────────────

type Order = Doc<"orders">;
type OrderStatus = Order["status"];

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Pedidos - Atendia" }];
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, {
    label: string;
    icon: React.ReactNode;
    classes: string;
    dotClass: string;
}> = {
    pending: {
        label: "Pendiente",
        icon: <FaHourglass className="w-3 h-3" />,
        classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
        dotClass: "bg-amber-400",
    },
    confirmed: {
        label: "Confirmado",
        icon: <FaCircleCheck className="w-3 h-3" />,
        classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
        dotClass: "bg-blue-400",
    },
    shipped: {
        label: "En camino",
        icon: <FaTruck className="w-3 h-3" />,
        classes: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800",
        dotClass: "bg-violet-400",
    },
    delivered: {
        label: "Entregado",
        icon: <FaCheckDouble className="w-3 h-3" />,
        classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
        dotClass: "bg-emerald-400",
    },
    canceled: {
        label: "Cancelado",
        icon: <FaBan className="w-3 h-3" />,
        classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
        dotClass: "bg-red-400",
    },
};

const STATUS_FLOW: OrderStatus[] = ["pending", "confirmed", "shipped", "delivered"];

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserOrders() {
    const navigate = useNavigate();
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const clientId = userClients?.[0]?.client;
    const client = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");

    const orders = useQuery(api.orders.getByClient, clientId ? { clientId } : "skip");
    const channels = useQuery(api.channels.getByClient, clientId ? { clientId } : "skip");
    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");

    const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
    const [selectedChannelId, setSelectedChannelId] = useState<Id<"channels"> | null>(null);
    const [selectedAssistantId, setSelectedAssistantId] = useState<Id<"assistants"> | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;
    const [expandedId, setExpandedId] = useState<Id<"orders"> | null>(null);
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const channelMap = useMemo(
        () => new Map(channels?.map((c) => [c._id, c]) ?? []),
        [channels]
    );
    const assistantMap = useMemo(
        () => new Map(assistants?.map((a) => [a._id, a]) ?? []),
        [assistants]
    );

    // Reset de página cuando cambian filtros / búsqueda
    useEffect(() => { setPage(1); }, [statusFilter, selectedChannelId, selectedAssistantId, searchQuery]);

    const isLoading = !userProfile || userClients === undefined || client === undefined || orders === undefined;

    useEffect(() => {
        if (client && !client.features?.enableOrders) {
            navigate("/panel", { replace: true });
        }
    }, [client, navigate]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    const visibleOrders = (orders ?? []).filter(o => !deletedIds.has(o._id));

    // Filtros encadenados: canal → asistente → estado → búsqueda.
    // Los stat cards reflejan los filtros de canal/asistente para que el conteo
    // por estado sea coherente con la vista actual.
    const scopedOrders = visibleOrders
        .filter(o => !selectedChannelId || (o as any).channel === selectedChannelId)
        .filter(o => !selectedAssistantId || (o as any).assistant === selectedAssistantId);

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searched = normalizedQuery
        ? scopedOrders.filter(o => {
            const haystack = [
                o.name,
                o.phone,
                o.deliveryAddress,
                ...o.items.map(i => i.productName),
            ].join(" ").toLowerCase();
            return haystack.includes(normalizedQuery);
        })
        : scopedOrders;

    const filtered = statusFilter === "all"
        ? searched
        : searched.filter(o => o.status === statusFilter);

    const counts: Record<string, number> = {};
    for (const o of scopedOrders) {
        counts[o.status] = (counts[o.status] ?? 0) + 1;
    }

    // Paginación calculada sobre la lista ya ordenada (más reciente primero).
    const sorted = filtered.slice().sort((a, b) => b._creationTime - a._creationTime);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageOrders = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Pedidos</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Seguimiento y gestión de pedidos recibidos por el asistente.
                </p>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {(Object.entries(STATUS_CONFIG) as [OrderStatus, typeof STATUS_CONFIG[OrderStatus]][]).map(([status, cfg]) => (
                    <StatCard
                        key={status}
                        label={cfg.label}
                        count={counts[status] ?? 0}
                        dotClass={cfg.dotClass}
                        active={statusFilter === status}
                        onClick={() => setStatusFilter(prev => prev === status ? "all" : status)}
                    />
                ))}
            </div>

            {/* Channel + Assistant scope (sólo si hay más de uno) */}
            {((channels && channels.length > 1) || (assistants && assistants.length > 1)) && (
                <div className="flex flex-col gap-2">
                    {channels && channels.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                            <ScopePill
                                label="Todos los canales"
                                active={!selectedChannelId}
                                onClick={() => setSelectedChannelId(null)}
                            />
                            {channels.map(ch => (
                                <ScopePill
                                    key={ch._id}
                                    label={ch.name}
                                    icon={ch.type === "whatsapp"
                                        ? <FaWhatsapp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        : <FaGlobe className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                                    sublabel={assistantMap.get(ch.assistant as Id<"assistants">)?.name}
                                    active={selectedChannelId === ch._id}
                                    onClick={() => setSelectedChannelId(prev => prev === ch._id ? null : ch._id)}
                                />
                            ))}
                        </div>
                    )}
                    {assistants && assistants.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                            <ScopePill
                                label="Todos los asistentes"
                                active={!selectedAssistantId}
                                onClick={() => setSelectedAssistantId(null)}
                            />
                            {assistants.map(a => (
                                <ScopePill
                                    key={a._id}
                                    label={a.name}
                                    active={selectedAssistantId === a._id}
                                    onClick={() => setSelectedAssistantId(prev => prev === a._id ? null : a._id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Search + Filter pills */}
            <div className="flex flex-col gap-3">
                <div className="relative">
                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar por cliente, teléfono, dirección o producto…"
                        className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-slate-400"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                            aria-label="Limpiar búsqueda"
                        >
                            <FaXmark className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Filtrar:</span>
                    <FilterPill
                        label={`Todos (${scopedOrders.length})`}
                        active={statusFilter === "all"}
                        onClick={() => setStatusFilter("all")}
                    />
                    {(Object.entries(STATUS_CONFIG) as [OrderStatus, typeof STATUS_CONFIG[OrderStatus]][])
                        .filter(([s]) => (counts[s] ?? 0) > 0)
                        .map(([status, cfg]) => (
                            <FilterPill
                                key={status}
                                label={`${cfg.label} (${counts[status] ?? 0})`}
                                active={statusFilter === status}
                                onClick={() => setStatusFilter(prev => prev === status ? "all" : status)}
                            />
                        ))}
                </div>
            </div>

            {/* Orders list */}
            {pageOrders.length > 0 ? (
                <>
                    <div className="flex flex-col gap-3">
                        {pageOrders.map(order => (
                            <OrderRow
                                key={order._id}
                                order={order}
                                channel={channelMap.get((order as any).channel)}
                                assistant={assistantMap.get((order as any).assistant)}
                                expanded={expandedId === order._id}
                                onToggle={() => setExpandedId(prev => prev === order._id ? null : order._id)}
                                clientId={clientId!}
                                onDeleted={(id) => { setDeletedIds(prev => new Set([...prev, id])); setExpandedId(null); }}
                            />
                        ))}
                    </div>
                    {totalPages > 1 && (
                        <Pagination
                            page={safePage}
                            totalPages={totalPages}
                            totalItems={sorted.length}
                            pageSize={PAGE_SIZE}
                            onChange={setPage}
                        />
                    )}
                </>
            ) : (
                <EmptyState
                    filtered={statusFilter !== "all" || !!normalizedQuery || !!selectedChannelId || !!selectedAssistantId}
                    onClear={() => {
                        setStatusFilter("all");
                        setSearchQuery("");
                        setSelectedChannelId(null);
                        setSelectedAssistantId(null);
                    }}
                />
            )}
        </div>
    );
}

function formatPhone(raw: string): string {
    const stripped = raw.replace(/@.*$/, "");
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(stripped)) return "Web";
    return `+${stripped}`;
}

function formatRelativeTime(timestamp: number): string {
    const diffMs = timestamp - Date.now();
    const diffSec = Math.round(diffMs / 1000);
    const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
    const abs = Math.abs(diffSec);
    if (abs < 60) return rtf.format(diffSec, "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
    return rtf.format(Math.round(diffSec / 2592000), "month");
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, count, dotClass, active, onClick }: {
    label: string;
    count: number;
    dotClass: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "rounded-2xl border p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30",
                active
                    ? "border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-sm"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            )}
        >
            <div className="flex items-center gap-2 mb-1">
                <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{count}</p>
        </button>
    );
}

// ─── Filter Pill ──────────────────────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/40 bg-white dark:bg-slate-900"
            )}
        >
            {label}
        </button>
    );
}

// ─── Order Row ────────────────────────────────────────────────────────────────

interface OrderRowProps {
    order: Order;
    channel?: { type: string; name: string };
    assistant?: { name: string };
    expanded: boolean;
    onToggle: () => void;
    clientId: Id<"clients">;
}

function OrderRow({ order, channel, assistant, expanded, onToggle, clientId, onDeleted }: OrderRowProps & { onDeleted: (id: Id<"orders">) => void }) {
    const updateOrder = useMutation(api.orders.update);
    const removeOrder = useMutation(api.orders.removeOrder);
    const sendNotification = useAction(api.orders.sendStatusNotification);
    const [updating, setUpdating] = useState(false);
    const cfg = STATUS_CONFIG[order.status];
    const date = new Date(order._creationTime);

    const handleStatusChange = async (status: OrderStatus) => {
        setUpdating(true);
        try {
            await updateOrder({ id: order._id, status });
            toast.success(`Estado actualizado a "${STATUS_CONFIG[status].label}".`);
            if (status === "confirmed" || status === "shipped") {
                sendNotification({ orderId: order._id, status }).catch(() => {});
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar.");
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Eliminar este pedido? Esta acción no se puede deshacer.")) return;
        setUpdating(true);
        try {
            await removeOrder({ id: order._id });
            toast.success("Pedido eliminado.");
            onDeleted(order._id);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar.");
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className={cn(
            "bg-white dark:bg-slate-900 rounded-2xl border transition-all shadow-sm",
            expanded
                ? "border-primary/40 shadow-md"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
        )}>
            {/* Row header — always visible */}
            <button
                onClick={onToggle}
                className="w-full text-left p-4 sm:p-5 flex items-center gap-3 sm:gap-4"
            >
                {/* Icon */}
                <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-500 dark:text-orange-400 shrink-0">
                    <FaBoxOpen className="w-4 h-4" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {order.name}
                        </span>
                        <StatusBadge status={order.status} />
                        {channel && (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium"
                                title={assistant ? `Asistente: ${assistant.name}` : undefined}
                            >
                                {channel.type === "whatsapp"
                                    ? <FaWhatsapp className="h-2.5 w-2.5 text-green-500 shrink-0" />
                                    : <FaGlobe className="h-2.5 w-2.5 text-blue-400 shrink-0" />}
                                {channel.name}
                                {assistant && (
                                    <span className="opacity-60 hidden sm:inline">· {assistant.name}</span>
                                )}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-600">·</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {formatMoney(order.totalAmount, order.currency)}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-600 hidden sm:block">·</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                            {date.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-600 hidden sm:block">·</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block" title={date.toLocaleString("es-UY")}>
                            {formatRelativeTime(order._creationTime)}
                        </span>
                    </div>
                </div>

                {/* Chevron */}
                <div className="shrink-0 text-slate-400 dark:text-slate-600">
                    {expanded ? <FaChevronUp className="w-3.5 h-3.5" /> : <FaChevronDown className="w-3.5 h-3.5" />}
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 sm:px-5 pb-5 pt-4 space-y-5">
                    {/* Info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InfoField label="Cliente" value={order.name} />
                        <InfoField
                            label="Teléfono / Sesión"
                            value={formatPhone(order.phone)}
                            href={`/panel/mensajes?phone=${encodeURIComponent(order.phone)}`}
                            mono
                        />
                        <InfoField label="Dirección de entrega" value={order.deliveryAddress} className="sm:col-span-2" />
                        <InfoField
                            label="Fecha del pedido"
                            value={date.toLocaleString("es-UY", {
                                day: "2-digit", month: "long", year: "numeric",
                                hour: "2-digit", minute: "2-digit"
                            })}
                        />
                        <InfoField
                            label="Total"
                            value={formatMoney(order.totalAmount, order.currency)}
                            highlight
                        />
                    </div>

                    {/* Items table */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                            Ítems del pedido
                        </p>
                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/60">
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Producto</th>
                                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Cant.</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Precio unit.</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, i) => (
                                        <tr
                                            key={i}
                                            className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                                        >
                                            <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">{item.productName}</td>
                                            <td className="px-3 py-3 text-center text-slate-600 dark:text-slate-400">{item.quantity}</td>
                                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                                                {formatMoney(item.priceAtMoment, order.currency)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                                                {formatMoney(item.quantity * item.priceAtMoment, order.currency)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                                        <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                            Total
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">
                                            {formatMoney(order.totalAmount, order.currency)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Status pipeline + actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        {/* Status flow */}
                        {order.status !== "canceled" && (
                            <StatusPipeline current={order.status} />
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                            {order.status === "pending" && (
                                <>
                                    <ActionButton
                                        label="Confirmar"
                                        color="blue"
                                        loading={updating}
                                        onClick={() => handleStatusChange("confirmed")}
                                    />
                                    <ActionButton
                                        label="Cancelar"
                                        color="red"
                                        loading={updating}
                                        onClick={() => handleStatusChange("canceled")}
                                    />
                                </>
                            )}
                            {order.status === "confirmed" && (
                                <ActionButton
                                    label="Marcar en camino"
                                    color="violet"
                                    loading={updating}
                                    onClick={() => handleStatusChange("shipped")}
                                />
                            )}
                            {order.status === "shipped" && (
                                <ActionButton
                                    label="Marcar entregado"
                                    color="green"
                                    loading={updating}
                                    onClick={() => handleStatusChange("delivered")}
                                />
                            )}
                            <button
                                onClick={handleDelete}
                                disabled={updating}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {updating ? <FaSpinner className="w-3 h-3 animate-spin" /> : <FaTrash className="w-3 h-3" />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", cfg.classes)}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

// ─── Status Pipeline ──────────────────────────────────────────────────────────

function StatusPipeline({ current }: { current: OrderStatus }) {
    const currentIdx = STATUS_FLOW.indexOf(current);
    return (
        <div className="flex items-center gap-1">
            {STATUS_FLOW.map((s, i) => {
                const cfg = STATUS_CONFIG[s];
                const done = i <= currentIdx;
                const isActive = i === currentIdx;
                return (
                    <div key={s} className="flex items-center gap-1">
                        <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                            isActive
                                ? cn("border", cfg.classes)
                                : done
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600"
                                    : "text-slate-300 dark:text-slate-700"
                        )}>
                            {isActive && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotClass)} />}
                            {cfg.label}
                        </div>
                        {i < STATUS_FLOW.length - 1 && (
                            <span className={cn(
                                "text-slate-300 dark:text-slate-700 text-xs select-none",
                                done && i < currentIdx ? "text-slate-400 dark:text-slate-600" : ""
                            )}>›</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Info Field ───────────────────────────────────────────────────────────────

function InfoField({ label, value, mono, highlight, href, className }: {
    label: string;
    value: string;
    mono?: boolean;
    highlight?: boolean;
    href?: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
            {href ? (
                <Link
                    to={href}
                    className={cn(
                        "text-sm text-primary hover:underline",
                        mono && "font-mono text-xs"
                    )}
                >
                    {value}
                </Link>
            ) : (
                <p className={cn(
                    "text-sm text-slate-700 dark:text-slate-300",
                    mono && "font-mono text-xs",
                    highlight && "font-bold text-slate-900 dark:text-slate-100 text-base"
                )}>
                    {value}
                </p>
            )}
        </div>
    );
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionButton({ label, color, loading, onClick }: {
    label: string;
    color: "blue" | "green" | "red" | "violet";
    loading: boolean;
    onClick: () => void;
}) {
    const colors = {
        blue: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500/30",
        green: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/30",
        red: "bg-red-600 hover:bg-red-700 focus:ring-red-500/30",
        violet: "bg-violet-600 hover:bg-violet-700 focus:ring-violet-500/30",
    };
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className={cn(
                "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm",
                "focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed",
                colors[color]
            )}
        >
            {loading && <FaSpinner className="w-3 h-3 animate-spin" />}
            {label}
        </button>
    );
}

// ─── Scope Pill (channel / assistant filter) ─────────────────────────────────

function ScopePill({ label, sublabel, icon, active, onClick }: {
    label: string;
    sublabel?: string;
    icon?: React.ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                active
                    ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
            )}
        >
            {icon}
            <span>{label}</span>
            {sublabel && (
                <span className="text-[10px] opacity-60 font-normal hidden sm:inline">· {sublabel}</span>
            )}
        </button>
    );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, totalItems, pageSize, onChange }: {
    page: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onChange: (p: number) => void;
}) {
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalItems);
    return (
        <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
                Mostrando <strong>{from}</strong>–<strong>{to}</strong> de <strong>{totalItems}</strong>
            </span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onChange(page - 1)}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                    aria-label="Página anterior"
                >
                    <FaChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 px-2 tabular-nums">
                    {page} / {totalPages}
                </span>
                <button
                    onClick={() => onChange(page + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                    aria-label="Página siguiente"
                >
                    <FaChevronRight className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-900/20 text-orange-400 dark:text-orange-500 flex items-center justify-center mb-4">
                <FaBoxOpen className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {filtered ? "Sin pedidos con ese estado" : "Todavía no hay pedidos"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {filtered
                    ? "Prueba cambiando o quitando el filtro activo."
                    : "Los pedidos generados por el asistente aparecerán aquí automáticamente."}
            </p>
            {filtered && (
                <button
                    onClick={onClear}
                    className="mt-4 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/40 hover:text-primary transition-all"
                >
                    Quitar filtro
                </button>
            )}
        </div>
    );
}
