import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useState, useMemo, useRef, useEffect } from "react";
import {
    FaChevronDown,
    FaCircle,
    FaCircleCheck,
    FaHeadset,
    FaMagnifyingGlass,
    FaPlus,
    FaSpinner,
    FaXmark,
    FaYoutube,
    FaArrowUpRightFromSquare,
} from "react-icons/fa6";
import { useSubmit } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn, getEnv } from "utils/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high";

type Faq = {
    _id: string;
    question: string;
    answerType: "content" | "youtube";
    content?: string;
    youtubeUrl?: string;
    keywords: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TicketStatus, string> = {
    open: "Abierto",
    in_progress: "En progreso",
    resolved: "Resuelto",
    closed: "Cerrado",
};

const STATUS_STYLES: Record<TicketStatus, string> = {
    open: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
    { value: "low", label: "Baja" },
    { value: "medium", label: "Media" },
    { value: "high", label: "Alta" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(text: string) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ");
}

function matchFaqs(title: string, faqs: Faq[]): Faq[] {
    const normalized = normalizeText(title);
    const words = normalized.split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return [];

    return faqs.filter((faq) =>
        faq.keywords.some((kw) => {
            const normKw = normalizeText(kw);
            return words.some((w) => normKw.includes(w) || w.includes(normKw));
        })
    );
}

function getYoutubeEmbedUrl(url: string): string | null {
    const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const s = status as TicketStatus;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[s] ?? STATUS_STYLES.open}`}>
            <FaCircle className="h-2 w-2" />
            {STATUS_LABELS[s] ?? status}
        </span>
    );
}

function FaqContentModal({ faq, onClose }: { faq: Faq; onClose: () => void }) {
    const embedUrl = faq.answerType === "youtube" && faq.youtubeUrl
        ? getYoutubeEmbedUrl(faq.youtubeUrl)
        : null;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-120 bg-black/60 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
            <div
                className="absolute inset-0"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="relative w-full h-full sm:h-auto sm:max-w-xl bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl border-0 sm:border sm:border-slate-200 sm:dark:border-slate-700 flex flex-col sm:max-h-[90dvh] overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 min-w-0">
                        {faq.answerType === "youtube" && (
                            <FaYoutube className="h-4 w-4 text-red-500 shrink-0" aria-hidden="true" />
                        )}
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                            {faq.question}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                        aria-label="Cerrar"
                    >
                        <FaXmark className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {faq.answerType === "content" && faq.content ? (
                        <div
                            className="prose prose-slate dark:prose-invert max-w-none text-sm prose-headings:font-semibold prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-li:text-slate-600 dark:prose-li:text-slate-400"
                            dangerouslySetInnerHTML={{ __html: faq.content }}
                        />
                    ) : embedUrl ? (
                        <div className="rounded-xl overflow-hidden aspect-video">
                            <iframe
                                src={embedUrl}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                title={faq.question}
                            />
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400">Sin contenido disponible.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function FaqSuggestionItem({ faq, onOpen }: { faq: Faq; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-left transition-colors group"
        >
            <div className="flex items-center gap-2 min-w-0">
                {faq.answerType === "youtube" && (
                    <FaYoutube className="h-3.5 w-3.5 text-red-500 shrink-0" aria-hidden="true" />
                )}
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
                    {faq.question}
                </span>
            </div>
            <FaArrowUpRightFromSquare className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-sky-500 transition-colors" aria-hidden="true" />
        </button>
    );
}

// ─── Create Ticket Modal ──────────────────────────────────────────────────────

interface CreateTicketModalProps {
    clientId: Id<"clients">;
    profileId: Id<"profiles">;
    publishedFaqs: Faq[];
    onClose: () => void;
    onCreated: () => void;
}

function CreateTicketModal({ clientId, profileId, publishedFaqs, onClose, onCreated }: CreateTicketModalProps) {
    const createTicket = useMutation(api.tickets.create);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<TicketPriority>("medium");
    const [submitting, setSubmitting] = useState(false);
    const [faqDismissed, setFaqDismissed] = useState(false);
    const [selectedFaq, setSelectedFaq] = useState<Faq | null>(null);

    const submit = useSubmit();

    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    // Reset FAQ dismissed when title changes significantly
    useEffect(() => {
        setFaqDismissed(false);
    }, [title]);

    const suggestedFaqs = useMemo(
        () => matchFaqs(title, publishedFaqs),
        [title, publishedFaqs]
    );

    const createJiraIssue = async (
        title: string, 
        description: string, 
        priority: TicketPriority,
        clientId: Id<"clients">,
        ticketId: string
    ) => {
        const formdata = new FormData();
        formdata.append("title", title);
        formdata.append("description", description);
        formdata.append("priority", priority);
        formdata.append("clientId", clientId);
        formdata.append("ticketId", ticketId);

        submit(formdata, { method: "POST" });
    };

    const showFaqPanel = !faqDismissed && suggestedFaqs.length > 0 && title.trim().length > 3;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;

        setSubmitting(true);
        try {
            const ticketId = await createTicket({
                 clientId,
                 profileId,
                 title: title.trim(),
                 description: description.trim(),
                 priority,
            }) as string;

            createJiraIssue(title, description, priority, clientId, ticketId);
            toast.success("Consulta enviada correctamente.");
            onCreated();
        } catch {
            toast.error("Error al crear el ticket");
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className="relative w-full h-full sm:h-auto sm:max-w-2xl bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl border-0 sm:border sm:border-slate-200 sm:dark:border-slate-700 flex flex-col sm:max-h-[92dvh] overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Envianos una consulta
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Cerrar"
                    >
                        <FaXmark className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <form id="create-ticket-form" onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
                        {/* Title */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="ticket-title" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                ¿Cuál es tu consulta? <span className="text-red-500">*</span>
                            </label>
                            <input
                                ref={titleRef}
                                id="ticket-title"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Escribí tu pregunta o problema..."
                                maxLength={120}
                                required
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            />
                        </div>

                        {/* FAQ Suggestion Panel */}
                        {showFaqPanel && (
                            <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 overflow-hidden">
                                <div className="flex items-start justify-between gap-3 px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FaMagnifyingGlass className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" aria-hidden="true" />
                                        <p className="text-sm font-medium text-sky-800 dark:text-sky-300">
                                            Puede que esto responda tu duda
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFaqDismissed(true)}
                                        className="h-6 w-6 inline-flex items-center justify-center rounded-full text-sky-400 hover:text-sky-600 dark:hover:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors shrink-0"
                                        aria-label="Descartar sugerencias"
                                    >
                                        <FaXmark className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 px-4 pb-4">
                                    {suggestedFaqs.map((faq) => (
                                        <FaqSuggestionItem key={faq._id} faq={faq} onOpen={() => setSelectedFaq(faq)} />
                                    ))}
                                    <p className="text-xs text-sky-600 dark:text-sky-400 mt-1 flex items-center gap-1.5">
                                        <FaCircleCheck className="h-3.5 w-3.5 shrink-0" />
                                        Si ninguna responde tu pregunta, completá el formulario y te ayudamos.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Priority */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                ¿Qué tan urgente es?
                            </label>
                            <div className="flex gap-2">
                                {PRIORITY_OPTIONS.map(({ value, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setPriority(value)}
                                        className={cn(
                                            "flex-1 py-2 rounded-xl text-sm font-medium border transition-colors",
                                            priority === value
                                                ? value === "high"
                                                    ? "bg-red-500 border-red-500 text-white"
                                                    : value === "medium"
                                                        ? "bg-amber-500 border-amber-500 text-white"
                                                        : "bg-slate-600 border-slate-600 text-white"
                                                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="ticket-desc" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Contanos más <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                id="ticket-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={5}
                                required
                                placeholder="Explicá con más detalle qué pasó o qué necesitás..."
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                            />
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="create-ticket-form"
                        disabled={submitting || !title.trim() || !description.trim()}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <FaSpinner className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <FaPlus className="h-4 w-4 mr-2" />
                        )}
                        {submitting ? "Enviando..." : "Enviar"}
                    </button>
                </div>
            </div>

            {/* FAQ content modal (nested above create modal) */}
            {selectedFaq && (
                <FaqContentModal faq={selectedFaq} onClose={() => setSelectedFaq(null)} />
            )}
        </div>
    );
}

// ─── Ticket Card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: any }) {
    const [expanded, setExpanded] = useState(false);

    const date = new Date(ticket._creationTime).toLocaleDateString("es-UY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    return (
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden transition-shadow hover:shadow-sm">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
                <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                        {ticket.title}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={ticket.status} />
                        <span className="text-xs text-slate-400 dark:text-slate-500">{date}</span>
                    </div>
                </div>
                <FaChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 mt-1 transition-transform duration-200",
                        expanded && "rotate-180"
                    )}
                    aria-hidden="true"
                />
            </button>

            <div className={cn("grid transition-[grid-template-rows] duration-300 ease-in-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden">
                    <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                                Tu consulta
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                                {ticket.description}
                            </p>
                        </div>

                        {ticket.adminNote && (
                            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                                    <FaCircleCheck className="h-3.5 w-3.5" />
                                    Respuesta
                                </p>
                                <p className="text-sm text-emerald-800 dark:text-emerald-300 whitespace-pre-wrap leading-relaxed">
                                    {ticket.adminNote}
                                </p>
                            </div>
                        )}

                        {!ticket.adminNote && ticket.status === "open" && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                                Recibimos tu consulta. Te respondemos pronto.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Soporte — Atendia" }];
}

export async function action({ request }: { request: Request }) {
    const headers = new Headers();

    const formData = await request.formData();
    const title = formData.get("title");
    const description = formData.get("description");
    const priority = formData.get("priority") as TicketPriority;
    const clientId = formData.get("clientId") as Id<"clients">;
    const ticketId = formData.get("ticketId") as string;

    if (typeof title !== "string" || typeof description !== "string" || !priority || !clientId || !ticketId) {
        return Response.json({ success: false }, {
            status: 400,
            headers
        });
    }

    const siteUrl = getEnv("SITE_URL")!;
    const webhookUrl = getEnv("ATLASSIAN_WEBHOOK_URL")!;
    const secret = getEnv("ATLASSIAN_WEBHOOK_SECRET")!;
    const convexUrl = getEnv("VITE_CONVEX_URL")!;

    const convex = new ConvexHttpClient(convexUrl);

    try {
        const client = await convex.query(api.clients.get, { id: clientId });
        if (!client) {
            console.error("Cliente no encontrado para ID:", clientId);
            return Response.json({ success: false }, { status: 404, headers });
        }

        const priorityLabel = priority === "high" ? "Alta" : priority === "medium" ? "Media" : "Baja";
        const issueDescription = `
        *Cliente*: ${client.name} 
        *URL*: ${siteUrl}/administracion/clientes/${clientId}
        *Ticket*: ${siteUrl}/administracion/tickets/${ticketId}
        *Prioridad*: ${priorityLabel}

        *Descripción del problema*:
        ${description}
        `;

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Automation-Webhook-Token": secret,
            },
            body: JSON.stringify({
                data: {
                    title,
                    description: issueDescription,
                }
            })
        });

        if (!response.ok) {
            console.error("No se pudo crear el issue de Jira", await response.text());
            return Response.json({ success: false }, { status: 500, headers });
        }

        return Response.json({ success: true }, { status: 200, headers });
    } catch (error) {
        console.error("Error al crear el issue de Jira", error);
        return Response.json({ success: false }, { status: 500, headers });
    }
}

export default function UserTicketsPage() {
    const [showModal, setShowModal] = useState(false);

    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const publishedFaqs = useQuery(api.faq.listPublished);

    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;

    const tickets = useQuery(
        api.tickets.listByClient,
        clientId ? { clientId } : "skip"
    );

    const isLoading = userProfile === undefined || userClients === undefined || tickets === undefined;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <FaSpinner className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!clientId || !userProfile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
                <FaHeadset className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
                    No podemos identificar tu cuenta. Contactá a tu administrador.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6">
            <ToastContainer position="bottom-right" theme="colored" />

            <div className="max-w-2xl mx-auto flex flex-col gap-6">
                {/* Page header */}
                <header className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
                            Soporte
                        </p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                            Mis consultas
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            ¿Tenés alguna duda o problema? Escribinos acá.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="btn-primary shrink-0"
                    >
                        <FaPlus className="h-4 w-4 mr-2" />
                        Nueva consulta
                    </button>
                </header>

                {/* Tickets list */}
                {tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                        <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <FaHeadset className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-300">
                                Sin consultas aún
                            </p>
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                                ¿Tenés algún problema? Escribinos y te respondemos.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="btn-primary mt-2"
                        >
                            <FaPlus className="h-4 w-4 mr-2" />
                            Hacer una consulta
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {tickets.map((ticket) => (
                            <TicketCard key={ticket._id} ticket={ticket} />
                        ))}
                    </div>
                )}
            </div>

            {/* Create modal */}
            {showModal && (
                <CreateTicketModal
                    clientId={clientId}
                    profileId={userProfile._id}
                    publishedFaqs={(publishedFaqs ?? []) as Faq[]}
                    onClose={() => setShowModal(false)}
                    onCreated={() => setShowModal(false)}
                />
            )}
        </div>
    );
}
