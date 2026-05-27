import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState, useEffect } from "react";
import {
    FaArrowLeft,
    FaCircle,
    FaFloppyDisk,
    FaTrash,
} from "react-icons/fa6";
import { Link, useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import Breadcrumbs from "../components/breadcrumbs";
import { cn } from "utils/utils";

const STATUS_LABELS: Record<string, string> = {
    open: "Abierto",
    in_progress: "En progreso",
    resolved: "Resuelto",
    closed: "Cerrado",
};

const STATUS_STYLES: Record<string, string> = {
    open: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_LABELS: Record<string, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
};

const PRIORITY_STYLES: Record<string, string> = {
    low: "text-slate-500 dark:text-slate-400",
    medium: "text-amber-600 dark:text-amber-400",
    high: "text-red-600 dark:text-red-400",
};

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"] as const;

type TicketStatus = (typeof STATUS_OPTIONS)[number];

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.open}`}>
            <FaCircle className="h-2 w-2" />
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

export function meta() {
    return [{ title: "Atendia — Administración — Ticket" }];
}

export default function AdminTicketDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const ticket = useQuery(api.tickets.get, id ? { id: id as Id<"tickets"> } : "skip");
    const updateStatus = useMutation(api.tickets.updateStatus);
    const saveAdminNote = useMutation(api.tickets.saveAdminNote);
    const removeTicket = useMutation(api.tickets.remove);

    const [note, setNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (ticket?.adminNote !== undefined) {
            setNote(ticket.adminNote ?? "");
        }
    }, [ticket?.adminNote]);

    const handleStatusChange = async (status: TicketStatus) => {
        if (!id) return;
        setSavingStatus(true);
        try {
            await updateStatus({ id: id as Id<"tickets">, status });
            toast.success("Estado actualizado");
        } catch {
            toast.error("Error al actualizar el estado");
        } finally {
            setSavingStatus(false);
        }
    };

    const handleSaveNote = async () => {
        if (!id) return;
        setSavingNote(true);
        try {
            await saveAdminNote({ id: id as Id<"tickets">, adminNote: note });
            toast.success("Respuesta guardada");
        } catch {
            toast.error("Error al guardar la respuesta");
        } finally {
            setSavingNote(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        if (!globalThis.confirm("¿Seguro que querés eliminar este ticket? Esta acción no se puede deshacer.")) return;
        setDeleting(true);
        try {
            await removeTicket({ id: id as Id<"tickets"> });
            toast.success("Ticket eliminado");
            navigate("/administracion/tickets");
        } catch {
            toast.error("Error al eliminar el ticket");
            setDeleting(false);
        }
    };

    if (ticket === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
        );
    }

    if (ticket === null) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
                <p className="text-slate-500 dark:text-slate-400">Ticket no encontrado.</p>
                <Link to="/administracion/tickets" className="btn-secondary">
                    Volver
                </Link>
            </div>
        );
    }

    const createdAt = new Date(ticket._creationTime).toLocaleDateString("es-UY", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div className="flex flex-col gap-6 max-w-4xl">
            <ToastContainer position="top-right" theme="colored" />

            <Breadcrumbs
                items={[
                    { label: "Tickets de soporte", href: "/administracion/tickets" },
                    { label: ticket.title },
                ]}
            />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <button
                    type="button"
                    onClick={() => navigate("/administracion/tickets")}
                    className="hidden sm:inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    aria-label="Volver"
                >
                    <FaArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusBadge status={ticket.status} />
                        <span className={`text-xs font-semibold ${PRIORITY_STYLES[ticket.priority] ?? ""}`}>
                            Prioridad {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {ticket.title}
                    </h1>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Creado el {createdAt}
                        {ticket.profile && (
                            <> · por{" "}
                                <Link
                                    to={`/administracion/usuarios/${ticket.profileId}`}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {(ticket.profile as any).name}
                                </Link>
                            </>
                        )}
                        {ticket.client && (
                            <> · cliente{" "}
                                <Link
                                    to={`/administracion/clientes/${ticket.clientId}`}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {(ticket.client as any).name}
                                </Link>
                            </>
                        )}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                >
                    <FaTrash className="h-3.5 w-3.5" />
                    Eliminar
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main content */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Description */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Descripción del problema
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                            {ticket.description}
                        </p>
                    </section>

                    {/* Admin response */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Respuesta del administrador
                        </h2>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={6}
                            placeholder="Escribí tu respuesta aquí..."
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                        />
                        <div className="flex justify-end mt-3">
                            <button
                                type="button"
                                onClick={handleSaveNote}
                                disabled={savingNote}
                                className="btn-primary"
                            >
                                <FaFloppyDisk className="h-4 w-4 mr-2" />
                                {savingNote ? "Guardando..." : "Guardar respuesta"}
                            </button>
                        </div>
                    </section>
                </div>

                {/* Sidebar */}
                <aside className="flex flex-col gap-4">
                    {/* Status change */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Cambiar estado
                        </h2>
                        <div className="flex flex-col gap-2">
                            {STATUS_OPTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    disabled={savingStatus}
                                    onClick={() => handleStatusChange(s)}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                                        ticket.status === s
                                            ? `${STATUS_STYLES[s]} ring-2 ring-current ring-offset-1 dark:ring-offset-slate-900`
                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
                                    )}
                                >
                                    <FaCircle className="h-2 w-2 shrink-0" />
                                    {STATUS_LABELS[s]}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Metadata */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Información
                        </h2>
                        <dl className="flex flex-col gap-2.5 text-sm">
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400 dark:text-slate-500">Cliente</dt>
                                <dd className="text-right truncate">
                                    {ticket.client ? (
                                        <Link
                                            to={`/administracion/clientes/${ticket.clientId}`}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {(ticket.client as any).name}
                                        </Link>
                                    ) : "—"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400 dark:text-slate-500">Usuario</dt>
                                <dd className="text-right truncate">
                                    {ticket.profile ? (
                                        <Link
                                            to={`/administracion/usuarios/${ticket.profileId}`}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {(ticket.profile as any).name}
                                        </Link>
                                    ) : "—"}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400 dark:text-slate-500">Prioridad</dt>
                                <dd className={`font-semibold text-right ${PRIORITY_STYLES[ticket.priority] ?? ""}`}>
                                    {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400 dark:text-slate-500">Creado</dt>
                                <dd className="font-medium text-slate-700 dark:text-slate-300 text-right">
                                    {new Date(ticket._creationTime).toLocaleDateString("es-UY")}
                                </dd>
                            </div>
                        </dl>
                    </section>
                </aside>
            </div>
        </div>
    );
}
