import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState, useEffect } from "react";
import {
    FaArrowLeft,
    FaBuilding,
    FaCircle,
    FaEnvelope,
    FaFloppyDisk,
    FaLocationDot,
    FaPhone,
    FaTrash,
    FaUser,
} from "react-icons/fa6";
import { Link, useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import Breadcrumbs from "../components/breadcrumbs";
import { cn } from "utils/utils";

const STATUS_LABELS: Record<string, string> = {
    new: "Nuevo",
    read: "Leído",
    replied: "Respondido",
    archived: "Archivado",
};

const STATUS_STYLES: Record<string, string> = {
    new: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    read: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    replied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    archived: "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500",
};

const STATUS_OPTIONS = ["new", "read", "replied", "archived"] as const;
type ContactFormStatus = (typeof STATUS_OPTIONS)[number];

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.new}`}>
            <FaCircle className="h-2 w-2" />
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

function MetaRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value?: string | null; href?: string }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3 text-sm">
            <span className="text-slate-400 dark:text-slate-500 mt-0.5 shrink-0">{icon}</span>
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
                {href ? (
                    <a href={href} className="font-medium text-primary hover:underline break-all">
                        {value}
                    </a>
                ) : (
                    <span className="font-medium text-slate-700 dark:text-slate-300 wrap-break-word">{value}</span>
                )}
            </div>
        </div>
    );
}

export function meta() {
    return [{ title: "Atendia — Administración — Formulario de contacto" }];
}

export default function AdminContactFormDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const form = useQuery(api.contactForms.get, id ? { id: id as Id<"contact_forms"> } : "skip");
    const updateStatus = useMutation(api.contactForms.updateStatus);
    const saveAdminNote = useMutation(api.contactForms.saveAdminNote);
    const removeForm = useMutation(api.contactForms.remove);

    const [note, setNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Auto-mark as read on open
    useEffect(() => {
        if (form?.status === "new" && id) {
            updateStatus({ id: id as Id<"contact_forms">, status: "read" }).catch(() => {});
        }
    }, [form?._id]);

    useEffect(() => {
        if (form?.adminNote !== undefined) {
            setNote(form.adminNote ?? "");
        }
    }, [form?.adminNote]);

    const handleStatusChange = async (status: ContactFormStatus) => {
        if (!id) return;
        setSavingStatus(true);
        try {
            await updateStatus({ id: id as Id<"contact_forms">, status });
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
            await saveAdminNote({ id: id as Id<"contact_forms">, adminNote: note });
            toast.success("Nota guardada — estado cambiado a Respondido");
        } catch {
            toast.error("Error al guardar la nota");
        } finally {
            setSavingNote(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        if (!globalThis.confirm("¿Seguro que querés eliminar este formulario? Esta acción no se puede deshacer.")) return;
        setDeleting(true);
        try {
            await removeForm({ id: id as Id<"contact_forms"> });
            toast.success("Formulario eliminado");
            navigate("/administracion/formularios-de-contacto");
        } catch {
            toast.error("Error al eliminar el formulario");
            setDeleting(false);
        }
    };

    if (form === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
        );
    }

    if (form === null) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
                <p className="text-slate-500 dark:text-slate-400">Formulario no encontrado.</p>
                <Link to="/administracion/formularios-de-contacto" className="btn-secondary">
                    Volver
                </Link>
            </div>
        );
    }

    const createdAt = new Date(form._creationTime).toLocaleDateString("es-UY", {
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
                    { label: "Formularios de contacto", href: "/administracion/formularios-de-contacto" },
                    { label: form.name },
                ]}
            />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <button
                    type="button"
                    onClick={() => navigate("/administracion/formularios-de-contacto")}
                    className="hidden sm:inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    aria-label="Volver"
                >
                    <FaArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusBadge status={form.status} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {form.subject}
                    </h1>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Recibido el {createdAt} · de{" "}
                        <a href={`mailto:${form.email}`} className="font-medium text-primary hover:underline">
                            {form.name}
                        </a>
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
                    {/* Message */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Mensaje
                        </h2>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {form.message}
                        </p>
                    </section>

                    {/* Admin note */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Nota interna / respuesta
                        </h2>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={4}
                            placeholder="Escribí una nota o el resumen de tu respuesta…"
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
                                {savingNote ? "Guardando..." : "Guardar nota"}
                            </button>
                        </div>
                    </section>
                </div>

                {/* Sidebar */}
                <aside className="flex flex-col gap-4">
                    {/* Status change */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Estado
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
                                        form.status === s
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

                    {/* Contact info */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Datos de contacto
                        </h2>
                        <div className="flex flex-col gap-3">
                            <MetaRow
                                icon={<FaUser className="h-3.5 w-3.5" />}
                                label="Nombre"
                                value={form.name}
                            />
                            <MetaRow
                                icon={<FaEnvelope className="h-3.5 w-3.5" />}
                                label="Correo"
                                value={form.email}
                                href={`mailto:${form.email}`}
                            />
                            <MetaRow
                                icon={<FaPhone className="h-3.5 w-3.5" />}
                                label="Teléfono"
                                value={form.phone}
                                href={form.phone ? `tel:${form.phone}` : undefined}
                            />
                            <MetaRow
                                icon={<FaBuilding className="h-3.5 w-3.5" />}
                                label="Empresa"
                                value={form.company}
                            />
                            <MetaRow
                                icon={<FaLocationDot className="h-3.5 w-3.5" />}
                                label="Dirección"
                                value={form.address}
                            />
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
