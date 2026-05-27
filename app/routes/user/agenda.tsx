import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useMutation, useQuery, useAction } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router";
import {
    FaSpinner, FaCalendarDay, FaCircleCheck, FaBan,
    FaHourglass, FaCheckDouble, FaChevronDown, FaChevronUp,
    FaCalendarXmark, FaClock, FaUser, FaPhone, FaNoteSticky,
    FaList, FaCalendarDays, FaCommentDots, FaGoogle,
    FaLinkSlash, FaCalendarCheck, FaTrash,
    FaCalendarWeek, FaCalendar, FaChevronLeft, FaChevronRight,
    FaWhatsapp, FaGlobe, FaMagnifyingGlass, FaXmark,
} from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn } from "utils/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Appointment = Doc<"appointments">;
type ApptStatus = "pending" | "confirmed" | "delivered" | "canceled";

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Agenda - Atendia" }];
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApptStatus, {
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
        label: "Confirmada",
        icon: <FaCircleCheck className="w-3 h-3" />,
        classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
        dotClass: "bg-blue-400",
    },
    delivered: {
        label: "Completada",
        icon: <FaCheckDouble className="w-3 h-3" />,
        classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
        dotClass: "bg-emerald-400",
    },
    canceled: {
        label: "Cancelada",
        icon: <FaBan className="w-3 h-3" />,
        classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
        dotClass: "bg-red-400",
    },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as ApptStatus[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte "59899344948@s.whatsapp.net" → "+59899344948" */
function formatPhone(raw: string) {
    return `+${raw.split("@")[0]}`;
}

function formatTime(ts: number, tz?: string) {
    return new Date(ts).toLocaleTimeString("es-UY", {
        hour: "2-digit", minute: "2-digit",
        timeZone: tz ?? "America/Montevideo",
    });
}

function formatDate(ts: number, tz?: string) {
    return new Date(ts).toLocaleDateString("es-UY", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
        timeZone: tz ?? "America/Montevideo",
    });
}

function formatDateShort(ts: number, tz?: string) {
    return new Date(ts).toLocaleDateString("es-UY", {
        day: "2-digit", month: "short", year: "numeric",
        timeZone: tz ?? "America/Montevideo",
    });
}

/** Returns "YYYY-MM-DD" in the given timezone for grouping */
function toDateKey(ts: number, tz = "America/Montevideo") {
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit",
        timeZone: tz,
    }).format(new Date(ts));
}

function getStatusKey(status: string): ApptStatus {
    return (STATUS_CONFIG[status as ApptStatus] ? status : "pending") as ApptStatus;
}

// ─── Date helpers for week/month views ───────────────────────────────────────

function addDays(dateKey: string, days: number): string {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekDays(dateKey: string): string[] {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dow = date.getDay();
    const daysBack = dow === 0 ? 6 : dow - 1;
    const monday = addDays(dateKey, -daysBack);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getMonthGrid(dateKey: string): string[][] {
    const [y, m] = dateKey.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const dow = firstDay.getDay();
    const daysBack = dow === 0 ? 6 : dow - 1;
    const gridStartKey = addDays(`${y}-${String(m).padStart(2, "0")}-01`, -daysBack);
    const rows: string[][] = [];
    let cur = gridStartKey;
    for (let row = 0; row < 6; row++) {
        const week: string[] = [];
        for (let col = 0; col < 7; col++) {
            week.push(cur);
            cur = addDays(cur, 1);
        }
        rows.push(week);
        if (row >= 3 && parseInt(cur.split("-")[1]) !== m) break;
    }
    return rows;
}

// ─── Main component ───────────────────────────────────────────────────────────

type ViewMode = "list" | "calendar" | "week" | "month";

export default function UserAppointments() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const clientId = userClients?.[0]?.client;
    const client = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");
    const appointments = useQuery(api.appointments.getByClient, clientId ? { clientId } : "skip");
    const channels = useQuery(api.channels.getByClient, clientId ? { clientId } : "skip");
    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");

    const [statusFilter, setStatusFilter] = useState<ApptStatus | "all">("all");
    const [selectedChannelId, setSelectedChannelId] = useState<Id<"channels"> | null>(null);
    const [selectedAssistantId, setSelectedAssistantId] = useState<Id<"assistants"> | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [expandedId, setExpandedId] = useState<Id<"appointments"> | null>(null);
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

    const channelMap = useMemo(
        () => new Map(channels?.map((c) => [c._id, c]) ?? []),
        [channels]
    );
    const assistantMap = useMemo(
        () => new Map(assistants?.map((a) => [a._id, a]) ?? []),
        [assistants]
    );

    useEffect(() => { setPage(1); }, [statusFilter, selectedChannelId, selectedAssistantId, searchQuery, viewMode]);

    // Google Calendar
    const calendarStatus = useQuery(api.googleCalendarDb.getStatus);
    const saveCalendarToken = useMutation(api.googleCalendarDb.saveCalendarToken);
    const disconnectCalendarAction = useAction(api.googleCalendar.disconnect);
    const bulkSync = useAction(api.googleCalendar.bulkSync);
    const importFromCalendar = useAction(api.googleCalendar.importFromCalendar);
    const setupWebhook = useAction(api.googleCalendar.setupWebhook);
    const refreshCalendarProfile = useAction(api.googleCalendar.refreshCalendarProfile);
    const [calendarConnecting, setCalendarConnecting] = useState(false);

    // Week / month navigation
    const [refDateKey, setRefDateKey] = useState(() => toDateKey(Date.now(), "America/Montevideo"));
    const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);

    const tz = client?.timezone ?? "America/Montevideo";

    const isLoading = !userProfile || userClients === undefined || client === undefined || appointments === undefined;

    useEffect(() => {
        if (client && !client.features?.enableAgenda) {
            navigate("/panel", { replace: true });
        }
    }, [client, navigate]);

    // Auto-init: fetch profile info and register webhook for already-connected accounts
    useEffect(() => {
        if (!calendarStatus?.connected) return;
        if (!calendarStatus.name) {
            refreshCalendarProfile();
        }
        if (!calendarStatus.hasWebhook) {
            setupWebhook();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarStatus?.connected, calendarStatus?.name, calendarStatus?.hasWebhook]);

    // Handle redirect back from Google OAuth
    useEffect(() => {
        const gcal = searchParams.get("gcal");
        if (!gcal) return;

        if (gcal === "ok") {
            (async () => {
                setCalendarConnecting(true);
                try {
                    const res = await fetch("/api/google-calendar/exchange", { method: "POST" });
                    const data = await res.json() as { refreshToken?: string; email?: string; name?: string; picture?: string; error?: string };
                    if (data.refreshToken) {
                        await saveCalendarToken({ refreshToken: data.refreshToken, email: data.email, name: data.name, picture: data.picture });
                        await Promise.all([bulkSync(), importFromCalendar()]);
                        await setupWebhook();
                        toast.success("Google Calendar conectado. Las citas se sincronizan automáticamente.");
                    } else {
                        toast.error("No se pudo obtener el token de Google Calendar.");
                    }
                } catch {
                    toast.error("Error al conectar Google Calendar.");
                } finally {
                    setCalendarConnecting(false);
                    setSearchParams((prev) => { prev.delete("gcal"); return prev; }, { replace: true });
                }
            })();
        } else if (gcal === "error") {
            toast.error("No se pudo conectar Google Calendar. Intenta de nuevo.");
            setSearchParams((prev) => { prev.delete("gcal"); return prev; }, { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleConnectCalendar = () => {
        if (!userProfile) return;
        window.location.href = `/api/google-calendar/auth?profileId=${userProfile._id}`;
    };

    const handleDisconnectCalendar = async () => {
        try {
            await disconnectCalendarAction();
            toast.success("Google Calendar desconectado.");
        } catch {
            toast.error("Error al desconectar Google Calendar.");
        }
    };

    const visibleAppointments = useMemo(
        () => (appointments ?? []).filter(a => !deletedIds.has(a._id)),
        [appointments, deletedIds]
    );

    // Filtrado por scope (canal y asistente) — el asistente se infiere a partir
    // del canal, ya que appointments aún no persiste assistantId directamente.
    const scopedAppointments = useMemo(() => {
        return visibleAppointments.filter(a => {
            if (selectedChannelId && a.channel !== selectedChannelId) return false;
            if (selectedAssistantId) {
                const ch = a.channel ? channelMap.get(a.channel) : undefined;
                if (!ch || ch.assistant !== selectedAssistantId) return false;
            }
            return true;
        });
    }, [visibleAppointments, selectedChannelId, selectedAssistantId, channelMap]);

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searchedAppointments = useMemo(() => {
        if (!normalizedQuery) return scopedAppointments;
        return scopedAppointments.filter(a => {
            const haystack = [
                a.customerName,
                a.customerPhone ?? "",
                a.notes ?? "",
            ].join(" ").toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [scopedAppointments, normalizedQuery]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const a of scopedAppointments) {
            const k = getStatusKey(a.status);
            c[k] = (c[k] ?? 0) + 1;
        }
        return c;
    }, [scopedAppointments]);

    const filtered = useMemo(() => {
        const list = searchedAppointments.slice().sort((a, b) => a.start - b.start);
        return statusFilter === "all" ? list : list.filter(a => getStatusKey(a.status) === statusFilter);
    }, [searchedAppointments, statusFilter]);

    // Paginación solo para la vista "list" — las vistas de calendario muestran
    // todo el rango temporal sin truncar.
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageAppointments = viewMode === "list"
        ? filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
        : filtered;

    // Group by date — shared across calendar / week / month views
    const appointmentsByDay = useMemo(() => {
        const map = new Map<string, Appointment[]>();
        for (const a of filtered) {
            const key = toDateKey(a.start, tz);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(a);
        }
        return map;
    }, [filtered, tz]);

    const groupedByDate = useMemo(() =>
        Array.from(appointmentsByDay.entries()).sort(([a], [b]) => a.localeCompare(b)),
    [appointmentsByDay]);

    const todayKey = toDateKey(Date.now(), tz);
    const weekDays = useMemo(() => getWeekDays(refDateKey), [refDateKey]);
    const monthGrid = useMemo(() => getMonthGrid(refDateKey), [refDateKey]);
    const [refYear, refMonth] = refDateKey.split("-").map(Number);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    const upcoming = visibleAppointments.filter(a =>
        a.start > Date.now() && getStatusKey(a.status) !== "canceled"
    ).length;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Citas y turnos</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Gestiona las citas agendadas por el asistente.
                    </p>
                </div>
                {/* View toggle */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 self-start flex-wrap">
                    <ViewToggleBtn active={viewMode === "list"} icon={<FaList className="w-3.5 h-3.5" />} label="Lista" onClick={() => setViewMode("list")} />
                    <ViewToggleBtn active={viewMode === "calendar"} icon={<FaCalendarDays className="w-3.5 h-3.5" />} label="Por día" onClick={() => setViewMode("calendar")} />
                    <ViewToggleBtn active={viewMode === "week"} icon={<FaCalendarWeek className="w-3.5 h-3.5" />} label="Semana" onClick={() => { setViewMode("week"); setRefDateKey(toDateKey(Date.now(), tz)); }} />
                    <ViewToggleBtn active={viewMode === "month"} icon={<FaCalendar className="w-3.5 h-3.5" />} label="Mes" onClick={() => { setViewMode("month"); setRefDateKey(toDateKey(Date.now(), tz)); setSelectedMonthDay(null); }} />
                </div>
            </div>

            {/* Google Calendar panel */}
            <GoogleCalendarPanel
                connected={calendarStatus?.connected ?? false}
                connecting={calendarConnecting}
                email={calendarStatus?.email ?? null}
                name={calendarStatus?.name ?? null}
                picture={calendarStatus?.picture ?? null}
                onConnect={handleConnectCalendar}
                onDisconnect={handleDisconnectCalendar}
            />

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

            {/* Search */}
            <div className="relative">
                <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar por cliente, teléfono o notas…"
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

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ALL_STATUSES.map(status => {
                    const cfg = STATUS_CONFIG[status];
                    return (
                        <StatCard
                            key={status}
                            label={cfg.label}
                            count={counts[status] ?? 0}
                            dotClass={cfg.dotClass}
                            active={statusFilter === status}
                            onClick={() => setStatusFilter(prev => prev === status ? "all" : status)}
                        />
                    );
                })}
            </div>

            {/* Upcoming banner */}
            {upcoming > 0 && statusFilter === "all" && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <FaCalendarDay className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                        Tienes <strong>{upcoming}</strong> {upcoming === 1 ? "cita próxima" : "citas próximas"} activas.
                    </p>
                </div>
            )}

            {/* Filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Filtrar:</span>
                <FilterPill
                    label={`Todas (${visibleAppointments.length})`}
                    active={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                />
                {ALL_STATUSES
                    .filter(s => (counts[s] ?? 0) > 0)
                    .map(status => (
                        <FilterPill
                            key={status}
                            label={`${STATUS_CONFIG[status].label} (${counts[status] ?? 0})`}
                            active={statusFilter === status}
                            onClick={() => setStatusFilter(prev => prev === status ? "all" : status)}
                        />
                    ))}
            </div>

            {/* Content */}
            {viewMode === "week" ? (
                <WeekView
                    weekDays={weekDays}
                    appointmentsByDay={appointmentsByDay}
                    tz={tz}
                    expandedId={expandedId}
                    onToggle={(id) => setExpandedId(prev => prev === id ? null : id)}
                    onDeleted={(id) => { setDeletedIds(prev => new Set([...prev, id])); setExpandedId(null); }}
                    calendarConnected={calendarStatus?.connected ?? false}
                    profileId={calendarStatus?.profileId}
                    todayKey={todayKey}
                    onNavigate={(dir) => dir === 0
                        ? setRefDateKey(toDateKey(Date.now(), tz))
                        : setRefDateKey(prev => addDays(prev, dir * 7))
                    }
                />
            ) : viewMode === "month" ? (
                <MonthView
                    monthGrid={monthGrid}
                    appointmentsByDay={appointmentsByDay}
                    tz={tz}
                    todayKey={todayKey}
                    refYear={refYear}
                    refMonth={refMonth}
                    selectedDay={selectedMonthDay}
                    onSelectDay={(dk) => setSelectedMonthDay(prev => prev === dk ? null : dk)}
                    expandedId={expandedId}
                    onToggle={(id) => setExpandedId(prev => prev === id ? null : id)}
                    onDeleted={(id) => { setDeletedIds(prev => new Set([...prev, id])); setExpandedId(null); }}
                    calendarConnected={calendarStatus?.connected ?? false}
                    profileId={calendarStatus?.profileId}
                    onNavigate={(dir) => {
                        setSelectedMonthDay(null);
                        if (dir === 0) { setRefDateKey(toDateKey(Date.now(), tz)); return; }
                        const d = new Date(refYear, refMonth - 1 + dir, 1);
                        setRefDateKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
                    }}
                />
            ) : filtered.length === 0 ? (
                <EmptyState filtered={statusFilter !== "all"} onClear={() => setStatusFilter("all")} />
            ) : viewMode === "list" ? (
                <>
                    <div className="flex flex-col gap-3">
                        {pageAppointments.map(appt => {
                            const ch = appt.channel ? channelMap.get(appt.channel) : undefined;
                            const asst = ch?.assistant ? assistantMap.get(ch.assistant as Id<"assistants">) : undefined;
                            return (
                                <AppointmentRow
                                    key={appt._id}
                                    appt={appt}
                                    tz={tz}
                                    channel={ch}
                                    assistant={asst}
                                    expanded={expandedId === appt._id}
                                    onToggle={() => setExpandedId(prev => prev === appt._id ? null : appt._id)}
                                    onDeleted={(id) => { setDeletedIds(prev => new Set([...prev, id])); setExpandedId(null); }}
                                    calendarConnected={calendarStatus?.connected ?? false}
                                    profileId={calendarStatus?.profileId}
                                />
                            );
                        })}
                    </div>
                    {totalPages > 1 && (
                        <Pagination
                            page={safePage}
                            totalPages={totalPages}
                            totalItems={filtered.length}
                            pageSize={PAGE_SIZE}
                            onChange={setPage}
                        />
                    )}
                </>
            ) : (
                <div className="space-y-6">
                    {groupedByDate.map(([dateKey, appts]) => (
                        <DayGroup
                            key={dateKey}
                            dateKey={dateKey}
                            appts={appts}
                            tz={tz}
                            expandedId={expandedId}
                            onToggle={(id) => setExpandedId(prev => prev === id ? null : id)}
                            onDeleted={(id) => { setDeletedIds(prev => new Set([...prev, id])); setExpandedId(null); }}
                            calendarConnected={calendarStatus?.connected ?? false}
                            profileId={calendarStatus?.profileId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── View Toggle Button ───────────────────────────────────────────────────────

function ViewToggleBtn({ active, icon, label, onClick }: {
    active: boolean;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                active
                    ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            )}
        >
            {icon}
            {label}
        </button>
    );
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

// ─── Day Group (calendar view) ────────────────────────────────────────────────

function DayGroup({ dateKey, appts, tz, expandedId, onToggle, onDeleted, calendarConnected, profileId }: {
    dateKey: string;
    appts: Appointment[];
    tz: string;
    expandedId: Id<"appointments"> | null;
    onToggle: (id: Id<"appointments">) => void;
    onDeleted?: (id: Id<"appointments">) => void;
    calendarConnected: boolean;
    profileId?: Id<"profiles">;
}) {
    const ts = new Date(dateKey + "T00:00:00").getTime();
    const isToday = toDateKey(Date.now(), tz) === dateKey;
    const isPast = ts < new Date(toDateKey(Date.now(), tz) + "T00:00:00").getTime();

    return (
        <div>
            {/* Date header */}
            <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
                    isToday
                        ? "bg-primary text-white shadow-sm"
                        : isPast
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600"
                            : "bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
                )}>
                    {new Date(dateKey + "T12:00:00").getDate()}
                </div>
                <div>
                    <p className={cn(
                        "text-sm font-semibold capitalize",
                        isToday ? "text-primary" : "text-slate-700 dark:text-slate-300"
                    )}>
                        {isToday ? "Hoy" : formatDate(new Date(dateKey + "T12:00:00").getTime(), tz).split(",")[0]}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 capitalize">
                        {new Date(dateKey + "T12:00:00").toLocaleDateString("es-UY", {
                            month: "long", year: "numeric"
                        })}
                    </p>
                </div>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800 ml-1" />
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                    {appts.length} {appts.length === 1 ? "cita" : "citas"}
                </span>
            </div>

            <div className="flex flex-col gap-2 pl-0 sm:pl-13">
                {appts.map(appt => (
                    <AppointmentRow
                        key={appt._id}
                        appt={appt}
                        tz={tz}
                        expanded={expandedId === appt._id}
                        onToggle={() => onToggle(appt._id)}
                        onDeleted={onDeleted}
                        calendarConnected={calendarConnected}
                        profileId={profileId}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Appointment Row ──────────────────────────────────────────────────────────

interface AppointmentRowProps {
    appt: Appointment;
    tz: string;
    channel?: { type: string; name: string };
    assistant?: { name: string };
    expanded: boolean;
    onToggle: () => void;
    onDeleted?: (id: Id<"appointments">) => void;
    calendarConnected: boolean;
    profileId?: Id<"profiles">;
}

function AppointmentRow({ appt, tz, channel, assistant, expanded, onToggle, onDeleted, calendarConnected, profileId }: AppointmentRowProps) {
    const isSyncedToCalendar = calendarConnected && profileId
        ? !!(appt as any).googleCalendarEventIds?.[profileId]
        : false;
    const updateAppt = useMutation(api.appointments.update);
    const removeAppt = useMutation(api.appointments.removeAppointment);
    const [updating, setUpdating] = useState(false);
    const status = getStatusKey(appt.status);
    const cfg = STATUS_CONFIG[status];
    const isUpcoming = appt.start > Date.now() && status !== "canceled";
    const conversationHref = appt.customerPhone && appt.channel
        ? `/panel/mensajes?phone=${encodeURIComponent(appt.customerPhone)}&channel=${appt.channel}`
        : null;

    const handleStatusChange = async (newStatus: ApptStatus) => {
        setUpdating(true);
        try {
            await updateAppt({ id: appt._id, status: newStatus });
            toast.success(`Cita marcada como "${STATUS_CONFIG[newStatus].label}".`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar.");
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
            {/* Collapsed header */}
            <button
                onClick={onToggle}
                className="w-full text-left p-4 sm:p-5 flex items-center gap-3 sm:gap-4"
            >
                {/* Time block */}
                <div className={cn(
                    "flex flex-col items-center justify-center rounded-xl px-3 py-2 shrink-0 min-w-14 border",
                    isUpcoming
                        ? "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                )}>
                    <FaClock className="w-3 h-3 mb-0.5 opacity-70" />
                    <span className="text-sm font-bold leading-none">{formatTime(appt.start, tz)}</span>
                    {appt.end && (
                        <span className="text-[10px] opacity-70 mt-0.5">{formatTime(appt.end, tz)}</span>
                    )}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        {conversationHref ? (
                            <Link
                                to={conversationHref}
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-slate-800 dark:text-slate-100 truncate hover:text-primary transition-colors"
                            >
                                {appt.customerName}
                            </Link>
                        ) : (
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {appt.customerName}
                            </span>
                        )}
                        <StatusBadge status={status} />
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
                        <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block capitalize">
                            {formatDateShort(appt.start, tz)}
                        </span>
                        {appt.customerPhone && (
                            <>
                                <span className="text-xs text-slate-400 dark:text-slate-600 hidden sm:block">·</span>
                                {conversationHref ? (
                                    <Link
                                        to={conversationHref}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs text-primary hover:underline hidden sm:block font-mono"
                                    >
                                        {formatPhone(appt.customerPhone)}
                                    </Link>
                                ) : (
                                    <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block font-mono">
                                        {formatPhone(appt.customerPhone)}
                                    </span>
                                )}
                            </>
                        )}
                        {appt.notes && (
                            <>
                                <span className="text-xs text-slate-400 dark:text-slate-600">·</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-45">
                                    {appt.notes}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {isSyncedToCalendar && (
                        <span
                            title="Sincronizado con Google Calendar"
                            className="p-1.5 text-emerald-500 dark:text-emerald-400"
                        >
                            <FaCalendarCheck className="w-3.5 h-3.5" />
                        </span>
                    )}
                    {conversationHref && (
                        <Link
                            to={conversationHref}
                            title="Ver conversación"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                            <FaCommentDots className="w-3.5 h-3.5" />
                        </Link>
                    )}
                    <span className="text-slate-400 dark:text-slate-600 p-1.5">
                        {expanded ? <FaChevronUp className="w-3.5 h-3.5" /> : <FaChevronDown className="w-3.5 h-3.5" />}
                    </span>
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 sm:px-5 pb-5 pt-4 space-y-5">
                    {/* Info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InfoField
                            icon={<FaUser className="w-3 h-3" />}
                            label="Nombre del cliente"
                            value={appt.customerName}
                            href={conversationHref ?? undefined}
                        />
                        {appt.customerPhone && (
                            <InfoField
                                icon={<FaPhone className="w-3 h-3" />}
                                label="Teléfono / Sesión"
                                value={formatPhone(appt.customerPhone)}
                                href={conversationHref ?? undefined}
                                mono
                            />
                        )}
                        <InfoField
                            icon={<FaClock className="w-3 h-3" />}
                            label="Inicio"
                            value={formatDate(appt.start, tz) + " — " + formatTime(appt.start, tz)}
                        />
                        {appt.end && (
                            <InfoField
                                icon={<FaClock className="w-3 h-3" />}
                                label="Fin"
                                value={formatDate(appt.end, tz) + " — " + formatTime(appt.end, tz)}
                            />
                        )}
                        {appt.notes && (
                            <InfoField
                                icon={<FaNoteSticky className="w-3 h-3" />}
                                label="Notas"
                                value={appt.notes}
                                className="sm:col-span-2"
                            />
                        )}
                    </div>

                    {/* Duration chip */}
                    {appt.end && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Duración:</span>
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {formatDuration(appt.end - appt.start)}
                            </span>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                        {status === "pending" && (
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
                        {status === "confirmed" && (
                            <>
                                <ActionButton
                                    label="Marcar completada"
                                    color="green"
                                    loading={updating}
                                    onClick={() => handleStatusChange("delivered")}
                                />
                                <ActionButton
                                    label="Cancelar"
                                    color="red"
                                    loading={updating}
                                    onClick={() => handleStatusChange("canceled")}
                                />
                            </>
                        )}
                        {status === "canceled" && (
                            <ActionButton
                                label="Reactivar"
                                color="amber"
                                loading={updating}
                                onClick={() => handleStatusChange("pending")}
                            />
                        )}
                        {onDeleted && (
                            <button
                                onClick={async () => {
                                    if (!confirm("¿Eliminar este turno? Esta acción no se puede deshacer.")) return;
                                    setUpdating(true);
                                    try {
                                        await removeAppt({ id: appt._id });
                                        toast.success("Turno eliminado.");
                                        onDeleted(appt._id);
                                    } catch (err: unknown) {
                                        toast.error(err instanceof Error ? err.message : "Error al eliminar.");
                                    } finally {
                                        setUpdating(false);
                                    }
                                }}
                                disabled={updating}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {updating ? <FaSpinner className="w-3 h-3 animate-spin" /> : <FaTrash className="w-3 h-3" />}
                                Eliminar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApptStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
            cfg.classes
        )}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

// ─── Info Field ───────────────────────────────────────────────────────────────

function InfoField({ icon, label, value, mono, href, className }: {
    icon?: React.ReactNode;
    label: string;
    value: string;
    mono?: boolean;
    href?: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <div className="flex items-center gap-1.5 mb-0.5">
                {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</p>
            </div>
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
                    mono && "font-mono text-xs"
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
    color: "blue" | "green" | "red" | "amber";
    loading: boolean;
    onClick: () => void;
}) {
    const colors = {
        blue: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500/30",
        green: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/30",
        red: "bg-red-600 hover:bg-red-700 focus:ring-red-500/30",
        amber: "bg-amber-500 hover:bg-amber-600 focus:ring-amber-500/30",
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

// ─── Duration helper ──────────────────────────────────────────────────────────

function formatDuration(ms: number) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ─── Shared nav bar for week/month ───────────────────────────────────────────

function CalNavBar({ label, onPrev, onNext, onToday }: {
    label: string;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <button onClick={onPrev} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <FaChevronLeft className="w-3 h-3" />
            </button>
            <button onClick={onNext} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <FaChevronRight className="w-3 h-3" />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize flex-1">
                {label}
            </span>
            <button onClick={onToday} className="px-3 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/40 hover:text-primary transition-colors">
                Hoy
            </button>
        </div>
    );
}

// ─── Week View ────────────────────────────────────────────────────────────────

const DAY_NAMES_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function WeekView({ weekDays, appointmentsByDay, tz, expandedId, onToggle, onDeleted, calendarConnected, profileId, todayKey, onNavigate }: {
    weekDays: string[];
    appointmentsByDay: Map<string, Appointment[]>;
    tz: string;
    expandedId: Id<"appointments"> | null;
    onToggle: (id: Id<"appointments">) => void;
    onDeleted?: (id: Id<"appointments">) => void;
    calendarConnected: boolean;
    profileId?: Id<"profiles">;
    todayKey: string;
    onNavigate: (dir: -1 | 1 | 0) => void;
}) {
    const [ws, we] = [weekDays[0], weekDays[6]];
    const wsDate = new Date(ws + "T12:00:00");
    const weDate = new Date(we + "T12:00:00");
    const sameMonth = wsDate.getMonth() === weDate.getMonth();
    const label = sameMonth
        ? `${wsDate.getDate()}–${weDate.getDate()} de ${MONTH_NAMES[wsDate.getMonth()]} ${wsDate.getFullYear()}`
        : `${wsDate.getDate()} ${MONTH_NAMES[wsDate.getMonth()]} – ${weDate.getDate()} ${MONTH_NAMES[weDate.getMonth()]} ${weDate.getFullYear()}`;

    const expandedAppt = expandedId
        ? weekDays.flatMap(dk => appointmentsByDay.get(dk) ?? []).find(a => a._id === expandedId)
        : null;

    return (
        <div className="space-y-4">
            <CalNavBar label={label} onPrev={() => onNavigate(-1)} onNext={() => onNavigate(1)} onToday={() => onNavigate(0)} />

            <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-px min-w-140 bg-slate-200 dark:bg-slate-700 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                    {/* Day headers */}
                    {weekDays.map((dk, i) => {
                        const d = new Date(dk + "T12:00:00");
                        const isToday = dk === todayKey;
                        const count = appointmentsByDay.get(dk)?.length ?? 0;
                        return (
                            <div key={dk} className={cn(
                                "flex flex-col items-center py-3 gap-1",
                                isToday ? "bg-primary/10 dark:bg-primary/20" : "bg-slate-50 dark:bg-slate-900"
                            )}>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                    {DAY_NAMES_SHORT[i]}
                                </span>
                                <span className={cn(
                                    "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
                                    isToday ? "bg-primary text-white" : "text-slate-700 dark:text-slate-200"
                                )}>
                                    {d.getDate()}
                                </span>
                                {count > 0 && (
                                    <span className="text-[10px] font-medium text-primary">{count} cita{count !== 1 ? "s" : ""}</span>
                                )}
                            </div>
                        );
                    })}

                    {/* Appointment columns */}
                    {weekDays.map((dk, i) => {
                        const appts = appointmentsByDay.get(dk) ?? [];
                        const isToday = dk === todayKey;
                        return (
                            <div key={dk} className={cn(
                                "min-h-24 p-1.5 space-y-1",
                                isToday ? "bg-primary/5 dark:bg-primary/10" : "bg-white dark:bg-slate-900"
                            )}>
                                {appts.length === 0 ? null : appts.map(appt => {
                                    const status = getStatusKey(appt.status);
                                    const cfg = STATUS_CONFIG[status];
                                    const isExpanded = expandedId === appt._id;
                                    return (
                                        <button
                                            key={appt._id}
                                            onClick={() => onToggle(appt._id)}
                                            className={cn(
                                                "w-full text-left px-2 py-1.5 rounded-lg text-xs border transition-all hover:opacity-90",
                                                isExpanded ? "ring-2 ring-primary/40" : "",
                                                cfg.classes
                                            )}
                                        >
                                            <div className="font-semibold truncate">{formatTime(appt.start, tz)}</div>
                                            <div className="truncate opacity-80 leading-tight mt-0.5">{appt.customerName}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {expandedAppt && (
                <AppointmentRow
                    appt={expandedAppt}
                    tz={tz}
                    expanded={true}
                    onToggle={() => onToggle(expandedAppt._id)}
                    onDeleted={onDeleted}
                    calendarConnected={calendarConnected}
                    profileId={profileId}
                />
            )}

            {weekDays.every(dk => (appointmentsByDay.get(dk)?.length ?? 0) === 0) && (
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">Sin citas esta semana.</p>
            )}
        </div>
    );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ monthGrid, appointmentsByDay, tz, todayKey, refYear, refMonth, selectedDay, onSelectDay, expandedId, onToggle, onDeleted, calendarConnected, profileId, onNavigate }: {
    monthGrid: string[][];
    appointmentsByDay: Map<string, Appointment[]>;
    tz: string;
    todayKey: string;
    refYear: number;
    refMonth: number;
    selectedDay: string | null;
    onSelectDay: (dk: string) => void;
    expandedId: Id<"appointments"> | null;
    onToggle: (id: Id<"appointments">) => void;
    onDeleted?: (id: Id<"appointments">) => void;
    calendarConnected: boolean;
    profileId?: Id<"profiles">;
    onNavigate: (dir: -1 | 1 | 0) => void;
}) {
    const label = `${MONTH_NAMES[refMonth - 1]} ${refYear}`;
    const selectedAppts = selectedDay ? (appointmentsByDay.get(selectedDay) ?? []) : [];

    return (
        <div className="space-y-4">
            <CalNavBar label={label} onPrev={() => onNavigate(-1)} onNext={() => onNavigate(1)} onToday={() => onNavigate(0)} />

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Day name headers */}
                <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    {DAY_NAMES_SHORT.map(name => (
                        <div key={name} className="text-center py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            {name}
                        </div>
                    ))}
                </div>

                {/* Calendar grid */}
                {monthGrid.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                        {week.map(dk => {
                            const [, cellMonth] = dk.split("-").map(Number);
                            const isCurrentMonth = cellMonth === refMonth;
                            const isToday = dk === todayKey;
                            const isSelected = dk === selectedDay;
                            const appts = appointmentsByDay.get(dk) ?? [];
                            const dayNum = parseInt(dk.split("-")[2]);

                            return (
                                <button
                                    key={dk}
                                    onClick={() => appts.length > 0 && onSelectDay(dk)}
                                    className={cn(
                                        "min-h-16 p-1.5 text-left border-r border-slate-100 dark:border-slate-800 last:border-r-0 transition-colors",
                                        appts.length > 0 ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : "cursor-default",
                                        isSelected ? "bg-primary/5 dark:bg-primary/10" : "",
                                        !isCurrentMonth ? "bg-slate-50/50 dark:bg-slate-900/20" : "bg-white dark:bg-slate-900"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                                            isToday ? "bg-primary text-white" : isCurrentMonth ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-600",
                                            isSelected && !isToday ? "ring-2 ring-primary/40" : ""
                                        )}>
                                            {dayNum}
                                        </span>
                                        {appts.length > 2 && (
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500">+{appts.length - 2}</span>
                                        )}
                                    </div>
                                    <div className="space-y-0.5">
                                        {appts.slice(0, 2).map(appt => {
                                            const cfg = STATUS_CONFIG[getStatusKey(appt.status)];
                                            return (
                                                <div key={appt._id} className={cn(
                                                    "truncate text-[10px] px-1.5 py-0.5 rounded font-medium border",
                                                    cfg.classes
                                                )}>
                                                    {formatTime(appt.start, tz)} {appt.customerName}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Selected day detail */}
            {selectedDay && selectedAppts.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">
                        {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    {selectedAppts.map(appt => (
                        <AppointmentRow
                            key={appt._id}
                            appt={appt}
                            tz={tz}
                            expanded={expandedId === appt._id}
                            onToggle={() => onToggle(appt._id)}
                            onDeleted={onDeleted}
                            calendarConnected={calendarConnected}
                            profileId={profileId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Google Calendar Panel ────────────────────────────────────────────────────

function GoogleCalendarPanel({ connected, connecting, email, name, picture, onConnect, onDisconnect }: {
    connected: boolean;
    connecting: boolean;
    email: string | null;
    name: string | null;
    picture: string | null;
    onConnect: () => void;
    onDisconnect: () => void;
}) {
    return (
        <div className={cn(
            "flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl border",
            connected
                ? "bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800"
                : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
        )}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
                {connected && picture ? (
                    <img
                        src={picture}
                        alt={name ?? ""}
                        className="w-8 h-8 rounded-full shrink-0 object-cover ring-2 ring-emerald-200 dark:ring-emerald-700"
                    />
                ) : (
                    <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        connected
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                    )}>
                        {connecting
                            ? <FaSpinner className="w-3.5 h-3.5 animate-spin" />
                            : <FaGoogle className="w-3.5 h-3.5" />}
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {connected ? (name ?? "Google Calendar conectado") : "Google Calendar"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {connected
                            ? (email ?? "Las citas se sincronizan automáticamente.")
                            : "Conectá tu cuenta para sincronizar citas automáticamente."}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {connected ? (
                    <button
                        onClick={onDisconnect}
                        title="Desconectar Google Calendar"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-red-300 hover:text-red-600 dark:hover:border-red-700 dark:hover:text-red-400 transition-all"
                    >
                        <FaLinkSlash className="w-3 h-3" />
                        Desconectar
                    </button>
                ) : (
                    <button
                        onClick={onConnect}
                        disabled={connecting}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {connecting ? <FaSpinner className="w-3.5 h-3.5 animate-spin" /> : <FaGoogle className="w-3.5 h-3.5" />}
                        {connecting ? "Conectando…" : "Conectar con Google"}
                    </button>
                )}
            </div>
        </div>
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
            <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-900/20 text-sky-400 dark:text-sky-500 flex items-center justify-center mb-4">
                <FaCalendarXmark className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {filtered ? "Sin citas con ese estado" : "Todavía no hay citas"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {filtered
                    ? "Prueba cambiando o quitando el filtro activo."
                    : "Las citas agendadas por el asistente aparecerán aquí automáticamente."}
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
