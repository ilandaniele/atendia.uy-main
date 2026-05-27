import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import {
    FaUsers,
    FaGlobe,
    FaWhatsapp,
    FaPhone,
    FaTrash,
    FaChevronDown,
    FaChevronUp,
    FaInbox,
    FaSpinner,
    FaCommentDots,
    FaUserPlus,
    FaXmark,
    FaMagnifyingGlass,
    FaChevronLeft,
    FaChevronRight,
} from "react-icons/fa6";
import { Link } from "react-router";
import { cn } from "utils/utils";

export function meta() {
    return [{ title: "Clientes Potenciales - Atendia" }];
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type LeadStatus =
    | "new"
    | "pending"
    | "contacted"
    | "scheduled"
    | "confirmed"
    | "closed"
    | "rejected";

// ─── Configuración de estados ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<
    LeadStatus,
    { label: string; badge: string; dot: string }
> = {
    new: {
        label: "Nuevo",
        badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        dot: "bg-blue-500",
    },
    pending: {
        label: "Pendiente",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        dot: "bg-amber-500",
    },
    contacted: {
        label: "Contactado",
        badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
        dot: "bg-indigo-500",
    },
    scheduled: {
        label: "Agendado",
        badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
        dot: "bg-purple-500",
    },
    confirmed: {
        label: "Confirmado",
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        dot: "bg-emerald-500",
    },
    closed: {
        label: "Cerrado",
        badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        dot: "bg-green-500",
    },
    rejected: {
        label: "Rechazado",
        badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        dot: "bg-red-500",
    },
};

const FILTER_TABS: { key: string; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "new", label: "Nuevos" },
    { key: "pending", label: "Pendientes" },
    { key: "contacted", label: "Contactados" },
    { key: "scheduled", label: "Agendados" },
    { key: "confirmed", label: "Confirmados" },
    { key: "closed", label: "Cerrados" },
    { key: "rejected", label: "Rechazados" },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function UserLeads() {
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;

    const leads = useQuery(
        api.leads.getByClient,
        clientId ? { clientId } : "skip"
    );
    const channels = useQuery(
        api.channels.getByClient,
        clientId ? { clientId } : "skip"
    );
    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");
    const membersWithProfiles = useQuery(api.clientMembers.getMembersWithProfiles, clientId ? { clientId } : "skip");

    const updateLead = useMutation(api.leads.update);
    const removeLead = useMutation(api.leads.remove);

    const [activeFilter, setActiveFilter] = useState("all");
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
    const [selectedAssistantId, setSelectedAssistantId] = useState<Id<"assistants"> | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;
    const [expandedId, setExpandedId] = useState<Id<"leads"> | null>(null);
    const [loadingId, setLoadingId] = useState<Id<"leads"> | null>(null);

    const channelMap = useMemo(
        () => new Map(channels?.map((c) => [c._id, c]) ?? []),
        [channels]
    );
    const assistantMap = useMemo(
        () => new Map(assistants?.map(a => [a._id, a]) ?? []),
        [assistants]
    );

    useEffect(() => { setPage(1); }, [activeFilter, selectedChannelId, selectedAssistantId, searchQuery]);

    const filteredLeads = useMemo(() => {
        if (!leads) return [];
        let base = activeFilter === "all" ? leads : leads.filter((l) => l.status === activeFilter);
        if (selectedChannelId) base = base.filter((l) => l.channel === selectedChannelId);
        if (selectedAssistantId) {
            base = base.filter((l) => {
                const ch = channelMap.get(l.channel);
                return ch?.assistant === selectedAssistantId;
            });
        }
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            base = base.filter((l) => {
                const dataValues = Object.values(l.data ?? {})
                    .filter(v => typeof v === "string" || typeof v === "number")
                    .map(v => String(v));
                const haystack = [
                    l.name,
                    l.phone,
                    l.summary,
                    ...dataValues,
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            });
        }
        return [...base].sort((a, b) => b._creationTime - a._creationTime);
    }, [leads, activeFilter, selectedChannelId, selectedAssistantId, searchQuery, channelMap]);

    const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageLeads = filteredLeads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // ── Acciones ──────────────────────────────────────────────────────────────

    const handleAssign = async (id: Id<"leads">, profileId: string | null) => {
        setLoadingId(id);
        try {
            await updateLead({ id, assignedTo: profileId as any });
            toast.success(profileId ? "Lead asignado" : "Asignación eliminada");
        } catch {
            toast.error("Error al asignar lead");
        } finally {
            setLoadingId(null);
        }
    };

    const handleStatusChange = async (
        id: Id<"leads">,
        status: LeadStatus
    ) => {
        setLoadingId(id);
        try {
            await updateLead({ id, status });
        } finally {
            setLoadingId(null);
        }
    };

    const handleDelete = async (id: Id<"leads">) => {
        if (!confirm("¿Eliminar este cliente potencial? Esta acción no se puede deshacer.")) return;
        setLoadingId(id);
        try {
            await removeLead({ id });
        } catch {
            toast.error("Error al eliminar el lead");
        } finally {
            setLoadingId(null);
        }
    };

    // ── Estados de carga y vacío ──────────────────────────────────────────────

    if (!userProfile || userClients === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            {/* Cabecera */}
            <div>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                    <span className="p-2 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl">
                        <FaUsers className="h-6 w-6" />
                    </span>
                    Clientes Potenciales
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 ml-1">
                    Personas interesadas que contactaron tu asistente
                </p>
            </div>

            {/* Filtro por canal (sólo si hay más de uno) */}
            {channels && channels.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                        onClick={() => setSelectedChannelId(null)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                            !selectedChannelId
                                ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
                        )}
                    >
                        Todos los canales
                    </button>
                    {channels.map(ch => {
                        const assistant = assistantMap.get(ch.assistant as any);
                        return (
                            <button
                                key={ch._id}
                                onClick={() => setSelectedChannelId(prev => prev === ch._id ? null : ch._id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                                    selectedChannelId === ch._id
                                        ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
                                        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
                                )}
                            >
                                {ch.type === "whatsapp"
                                    ? <FaWhatsapp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                    : <FaGlobe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                }
                                <span>{ch.name}</span>
                                {assistant && (
                                    <span className="text-[10px] opacity-60 font-normal hidden sm:inline">· {assistant.name}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Filtro por asistente (sólo si hay más de uno) */}
            {assistants && assistants.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                        onClick={() => setSelectedAssistantId(null)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                            !selectedAssistantId
                                ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
                        )}
                    >
                        Todos los asistentes
                    </button>
                    {assistants.map(a => (
                        <button
                            key={a._id}
                            onClick={() => setSelectedAssistantId(prev => prev === a._id ? null : a._id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                                selectedAssistantId === a._id
                                    ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
                                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600"
                            )}
                        >
                            <span>{a.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Búsqueda */}
            <div className="relative">
                <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre, teléfono o resumen…"
                    className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-slate-400"
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

            {/* Tabs de filtro */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {FILTER_TABS.map((tab) => {
                    const count =
                        tab.key === "all"
                            ? leads?.length ?? 0
                            : leads?.filter((l) => l.status === tab.key).length ?? 0;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                                activeFilter === tab.key
                                    ? "bg-primary text-white shadow-sm"
                                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:text-primary"
                            )}
                        >
                            {tab.label}
                            <span
                                    className={cn(
                                        "text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none",
                                        activeFilter === tab.key
                                            ? "bg-white/20 text-white"
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                    )}
                                >
                                    {count}
                                </span>
                        </button>
                    );
                })}
            </div>

            {/* Lista de leads */}
            {leads === undefined ? (
                <div className="flex items-center justify-center py-20">
                    <FaSpinner className="animate-spin text-primary text-3xl" />
                </div>
            ) : filteredLeads.length === 0 ? (
                <EmptyState
                    hasLeads={(leads?.length ?? 0) > 0}
                    filter={activeFilter}
                />
            ) : (
                <>
                    <div className="space-y-4">
                        {pageLeads.map((lead) => (
                            <LeadCard
                                key={lead._id}
                                lead={lead as any}
                                channel={channelMap.get(lead.channel)}
                                membersWithProfiles={membersWithProfiles}
                                isExpanded={expandedId === lead._id}
                                isLoading={loadingId === lead._id}
                                onToggleExpand={() =>
                                    setExpandedId(
                                        expandedId === lead._id ? null : lead._id
                                    )
                                }
                                onStatusChange={(status) =>
                                    handleStatusChange(lead._id, status)
                                }
                                onAssign={(profileId) => handleAssign(lead._id, profileId)}
                                onDelete={() => handleDelete(lead._id)}
                            />
                        ))}
                    </div>
                    {totalPages > 1 && (
                        <Pagination
                            page={safePage}
                            totalPages={totalPages}
                            totalItems={filteredLeads.length}
                            pageSize={PAGE_SIZE}
                            onChange={setPage}
                        />
                    )}
                </>
            )}
        </div>
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

// ─── Tarjeta de Lead ──────────────────────────────────────────────────────────

interface Member {
    _id: string;
    profile: { _id: string; name?: string } | null;
}

interface LeadCardProps {
    lead: {
        _id: Id<"leads">;
        _creationTime: number;
        name: string;
        phone: string;
        status: LeadStatus;
        summary: string;
        type: string;
        channel: Id<"channels">;
        data: Record<string, unknown>;
        assignedTo?: string;
    };
    channel: { type: string; name: string } | undefined;
    membersWithProfiles: Member[] | undefined;
    isExpanded: boolean;
    isLoading: boolean;
    onToggleExpand: () => void;
    onStatusChange: (status: LeadStatus) => void;
    onAssign: (profileId: string | null) => void;
    onDelete: () => void;
}

function LeadCard({
    lead,
    channel,
    membersWithProfiles,
    isExpanded,
    isLoading,
    onToggleExpand,
    onStatusChange,
    onAssign,
    onDelete,
}: LeadCardProps) {
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const assignMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isAssignOpen) return;
        const handler = (e: MouseEvent) => {
            if (assignMenuRef.current && !assignMenuRef.current.contains(e.target as Node)) {
                setIsAssignOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isAssignOpen]);

    const statusCfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new;
    const isWhatsapp = channel?.type === "whatsapp";
    const webSession = isWebSessionId(lead.phone);
    const dataEntries = Object.entries(lead.data ?? {}).filter(
        ([, v]) => v !== null && v !== undefined && v !== ""
    );
    const createdAt = new Date(lead._creationTime);
    const timeAgo = formatTimeAgo(createdAt);

    // Link a la conversación en mensajes
    const conversationHref = `/panel/mensajes?phone=${encodeURIComponent(lead.phone)}&channel=${lead.channel}`;

    // Tipo mostrable (solo para order/appointment, nunca para "lead" crudo)
    const KNOWN_TYPES: Record<string, string> = {
        order: "Pedido",
        appointment: "Cita",
    };
    const typeLabel = KNOWN_TYPES[lead.type];

    return (
        <div
            className={cn(
                "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all",
                isLoading && "opacity-60 pointer-events-none"
            )}
        >

            <div className="p-4 sm:p-5">
                {/* Fila principal */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    {/* Avatar → link a conversación */}
                    <Link
                        to={conversationHref}
                        title="Ver conversación"
                        className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-base shrink-0 hover:ring-2 hover:ring-violet-400 transition-all"
                    >
                        {lead.name.charAt(0).toUpperCase()}
                    </Link>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Link
                                to={conversationHref}
                                className="text-base font-semibold text-slate-800 dark:text-slate-100 hover:text-primary dark:hover:text-primary transition-colors truncate"
                            >
                                {lead.name}
                            </Link>
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                                    statusCfg.badge
                                )}
                            >
                                <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
                                {statusCfg.label}
                            </span>
                            {typeLabel && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                                    {typeLabel}
                                </span>
                            )}
                            {lead.assignedTo && (() => {
                                const m = membersWithProfiles?.find(m => m.profile?._id === lead.assignedTo);
                                const initials = m?.profile?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "?";
                                return (
                                    <span
                                        className="shrink-0 h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center"
                                        title={`Asignado a: ${m?.profile?.name ?? "Miembro"}`}
                                    >
                                        {initials}
                                    </span>
                                );
                            })()}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {/* Teléfono: ocultar UUIDs de sesión web */}
                            {!webSession && (
                                <span className="flex items-center gap-1.5">
                                    <FaPhone className="h-3 w-3" />
                                    {formatPhone(lead.phone)}
                                </span>
                            )}
                            <span className="flex items-center gap-1.5">
                                {isWhatsapp ? (
                                    <FaWhatsapp className="h-3 w-3 text-green-500" />
                                ) : (
                                    <FaGlobe className="h-3 w-3 text-blue-400" />
                                )}
                                {channel?.name ?? (isWhatsapp ? "WhatsApp" : "Web")}
                            </span>
                            <span>{timeAgo}</span>
                        </div>

                        {lead.summary && (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                                {lead.summary}
                            </p>
                        )}
                    </div>

                    {/* Acciones de la esquina superior derecha */}
                    <div className="flex items-center gap-1 self-start">
                        {/* Asignar */}
                        <div className="relative" ref={assignMenuRef}>
                            <button
                                onClick={() => setIsAssignOpen(v => !v)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Asignar lead"
                            >
                                <FaUserPlus className="h-3.5 w-3.5" />
                            </button>
                            {isAssignOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-48">
                                    <p className="px-3 pt-1 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Asignar a</p>
                                    {membersWithProfiles?.map(member => {
                                        const isAssigned = lead.assignedTo === member.profile?._id;
                                        return (
                                            <button
                                                key={member._id}
                                                onClick={() => { onAssign(isAssigned ? null : member.profile!._id); setIsAssignOpen(false); }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors",
                                                    isAssigned
                                                        ? "bg-primary/10 text-primary"
                                                        : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200"
                                                )}
                                            >
                                                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                                    {member.profile?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                                                </span>
                                                <span className="flex-1 truncate">{member.profile?.name ?? "Miembro"}</span>
                                                {isAssigned && <FaXmark className="h-3 w-3 shrink-0 opacity-60" />}
                                            </button>
                                        );
                                    })}
                                    {lead.assignedTo && (
                                        <>
                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                            <button
                                                onClick={() => { onAssign(null); setIsAssignOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                            >
                                                <FaXmark className="h-3 w-3 shrink-0" />
                                                Quitar asignación
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Ver conversación */}
                        <Link
                            to={conversationHref}
                            title="Ver conversación"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                            <FaCommentDots className="h-4 w-4" />
                        </Link>

                        {/* Expandir datos adicionales */}
                        {dataEntries.length > 0 && (
                            <button
                                onClick={onToggleExpand}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title={isExpanded ? "Ocultar datos" : "Ver datos recopilados"}
                            >
                                {isExpanded ? (
                                    <FaChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                    <FaChevronDown className="h-3.5 w-3.5" />
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Datos recopilados (expandible) */}
                {isExpanded && dataEntries.length > 0 && (
                    <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                            Datos recopilados
                        </p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {dataEntries.map(([key, value]) => (
                                <div key={key}>
                                    <dt className="text-xs text-slate-400 dark:text-slate-500 capitalize">
                                        {formatDataKey(key)}
                                    </dt>
                                    <dd className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                                        {String(value)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}

                {/* Barra de acciones */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    {/* Selector de estado */}
                    <select
                        value={lead.status}
                        onChange={(e) =>
                            onStatusChange(e.target.value as LeadStatus)
                        }
                        disabled={isLoading}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors cursor-pointer"
                    >
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <option key={key} value={key}>
                                {cfg.label}
                            </option>
                        ))}
                    </select>

                    {/* Eliminar */}
                    <div className="ml-auto flex items-center gap-1.5">
                        <button
                            onClick={onDelete}
                            disabled={isLoading}
                            title="Eliminar lead"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                            <FaTrash className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Estado vacío ──────────────────────────────────────────────────────────────

function EmptyState({
    hasLeads,
    filter,
}: {
    hasLeads: boolean;
    filter: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4">
                <FaInbox className="h-10 w-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
                {hasLeads
                    ? `Sin leads ${
                          FILTER_TABS.find((t) => t.key === filter)?.label.toLowerCase() ??
                          ""
                      }`
                    : "Aún no hay contactos interesados"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                {hasLeads
                    ? "Prueba seleccionando un filtro diferente."
                    : "Cuando alguien se muestre interesado, vas a verlo acá."}
            </p>
        </div>
    );
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Detecta si el valor es un UUID (sessionId de canal web) y no un teléfono real. */
function isWebSessionId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Normaliza un número de teléfono para mostrar al usuario.
 * WhatsApp: "59895626871@s.whatsapp.net" → "+59895626871"
 * Web (ingresado manualmente): se muestra tal cual, sin agregar "+".
 */
function formatPhone(value: string): string {
    if (value.includes("@")) {
        return `+${value.replace(/@.*$/, "")}`;
    }
    return value;
}

function formatTimeAgo(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "Ahora mismo";
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `hace ${diffHrs} h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `hace ${diffDays} d`;
    return date.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

function formatDataKey(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()
        .trim();
}
