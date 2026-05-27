import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useRequireOwner } from "./hooks/useRequireOwner";
import {
    FaSpinner, FaTrash, FaPlus, FaPencil, FaXmark,
    FaRobot, FaDatabase, FaCheck, FaAddressBook,
} from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn } from "utils/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Assistant = Doc<"assistants">;
type KnowledgeBase = Doc<"knowledge_bases">;

// ─── Available models ─────────────────────────────────────────────────────────

const MODELS = [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Rápido y eficiente" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Máxima capacidad" },
] as const;

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Asistentes - Atendia" }];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserAssistants() {
    const navigate = useNavigate();
    const { isLoading: isOwnerLoading } = useRequireOwner();
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const clientId = userClients?.[0]?.client;

    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");
    const knowledgeBases = useQuery(api.knowledgeBases.getByClient, clientId ? { clientId } : "skip");

    const createAssistant = useMutation(api.assistants.create);
    const updateAssistant = useMutation(api.assistants.update);
    const removeAssistant = useMutation(api.assistants.remove);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isLoading = isOwnerLoading || !userProfile || userClients === undefined || assistants === undefined;

    const handleCreate = async (data: AssistantFormData) => {
        if (!clientId) return;
        setSubmitting(true);
        try {
            await createAssistant({
                client: clientId,
                name: data.name,
                description: data.description,
                model: data.model,
                knowledgeBases: data.knowledgeBases.length ? data.knowledgeBases : undefined,
                features: data.features,
            });
            toast.success("Asistente creado correctamente.");
            setCreateModalOpen(false);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al crear el asistente.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (id: Id<"assistants">, data: AssistantFormData) => {
        setSubmitting(true);
        try {
            await updateAssistant({
                id,
                name: data.name,
                description: data.description,
                model: data.model,
                knowledgeBases: data.knowledgeBases.length ? data.knowledgeBases : undefined,
                features: data.features,
            });
            toast.success("Asistente actualizado.");
            setEditingAssistant(null);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar el asistente.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (assistant: Assistant) => {
        if (!globalThis.confirm(`¿Eliminar el asistente "${assistant.name}"? Esta acción no se puede deshacer.`)) return;
        try {
            await removeAssistant({ id: assistant._id });
            toast.success("Asistente eliminado.");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar el asistente.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Asistentes</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Administrá los asistentes que responden a tus clientes.
                    </p>
                </div>
                <button
                    onClick={() => setCreateModalOpen(true)}
                    className="btn-primary flex items-center gap-2 self-start sm:self-auto"
                >
                    <FaPlus className="w-3.5 h-3.5" />
                    Nuevo asistente
                </button>
            </div>

            {/* Grid */}
            {assistants && assistants.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {assistants.map(assistant => (
                        <AssistantCard
                            key={assistant._id}
                            assistant={assistant}
                            knowledgeBases={knowledgeBases ?? []}
                            onEdit={() => setEditingAssistant(assistant)}
                            onDelete={() => handleDelete(assistant)}
                            onViewContacts={() => navigate(`/panel/contactos/${assistant._id}`)}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState onCreateClick={() => setCreateModalOpen(true)} />
            )}

            {/* Create modal */}
            {createModalOpen && (
                <AssistantModal
                    mode="create"
                    knowledgeBases={knowledgeBases ?? []}
                    submitting={submitting}
                    onSubmit={handleCreate}
                    onClose={() => setCreateModalOpen(false)}
                />
            )}

            {/* Edit modal */}
            {editingAssistant && (
                <AssistantModal
                    mode="edit"
                    assistant={editingAssistant}
                    knowledgeBases={knowledgeBases ?? []}
                    submitting={submitting}
                    onSubmit={(data) => handleUpdate(editingAssistant._id, data)}
                    onClose={() => setEditingAssistant(null)}
                />
            )}
        </div>
    );
}

// ─── Assistant Card ───────────────────────────────────────────────────────────

interface AssistantCardProps {
    assistant: Assistant;
    knowledgeBases?: KnowledgeBase[];
    onEdit: () => void;
    onDelete: () => void;
    onViewContacts: () => void;
}

function AssistantCard({ assistant, knowledgeBases, onEdit, onDelete, onViewContacts }: AssistantCardProps) {
    const modelLabel = MODELS.find(m => m.value === assistant.model)?.label ?? assistant.model;
    const kbLabel = assistant.knowledgeBases?.length
        ? (assistant.knowledgeBases.length === 1
            ? (knowledgeBases?.find(kb => kb._id === assistant.knowledgeBases![0])?.name ?? "1 fuente")
            : `${assistant.knowledgeBases.length} fuentes`)
        : "Todas";

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-5 flex flex-col gap-4">
            {/* Icon + name */}
            <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 shrink-0">
                    <FaRobot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{assistant.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{assistant.description}</p>
                </div>
            </div>

            {/* Metadata pills */}
            <div className="flex flex-col gap-2">
                <InfoPill
                    icon={<FaRobot className="w-3 h-3" />}
                    label="Motor"
                    value={modelLabel}
                    color="purple"
                />
                <InfoPill
                    icon={<FaDatabase className="w-3 h-3" />}
                    label="Información"
                    value={kbLabel}
                    color="sky"
                />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                    onClick={onEdit}
                    className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
                >
                    <FaPencil className="w-3.5 h-3.5" />
                    Editar
                </button>
                {assistant.features?.recognizeContacts && (
                    <button
                        onClick={onViewContacts}
                        className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        aria-label="Ver contactos"
                        title="Contactos"
                    >
                        <FaAddressBook className="w-4 h-4" />
                    </button>
                )}
                <button
                    onClick={onDelete}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Eliminar asistente"
                >
                    <FaTrash className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

function InfoPill({ icon, label, value, color }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: "purple" | "sky";
}) {
    const colors = {
        purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300",
        sky: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300",
    };
    return (
        <div className={cn("flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium", colors[color])}>
            {icon}
            <span className="text-slate-500 dark:text-slate-400 font-normal">{label}:</span>
            <span className="truncate">{value}</span>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-5">
                <FaRobot className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Sin asistentes aún</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                Creá tu primer asistente y conectalo con la información de tu negocio.
            </p>
            <button onClick={onCreateClick} className="btn-primary flex items-center gap-2">
                <FaPlus className="w-3.5 h-3.5" />
                Crear primer asistente
            </button>
        </div>
    );
}

// ─── Assistant Modal (create / edit) ─────────────────────────────────────────

type AssistantFormData = {
    name: string;
    description: string;
    model: string;
    knowledgeBases: Id<"knowledge_bases">[];
    features: { recognizeContacts?: boolean };
};

interface AssistantModalProps {
    mode: "create" | "edit";
    assistant?: Assistant;
    knowledgeBases: KnowledgeBase[];
    submitting: boolean;
    onSubmit: (data: AssistantFormData) => void;
    onClose: () => void;
}

function AssistantModal({ mode, assistant, knowledgeBases, submitting, onSubmit, onClose }: AssistantModalProps) {
    const [name, setName] = useState(assistant?.name ?? "");
    const [description, setDescription] = useState(assistant?.description ?? "");
    const [model, setModel] = useState(assistant?.model ?? MODELS[0].value);
    const [selectedKbs, setSelectedKbs] = useState<Set<string>>(
        new Set(assistant?.knowledgeBases ?? [])
    );
    const [recognizeContacts, setRecognizeContacts] = useState(
        assistant?.features?.recognizeContacts ?? false
    );

    const toggleKb = (id: string) => {
        setSelectedKbs(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !description.trim() || !model) {
            toast.error("Completá todos los campos.");
            return;
        }
        onSubmit({
            name: name.trim(),
            description: description.trim(),
            model,
            knowledgeBases: [...selectedKbs] as Id<"knowledge_bases">[],
            features: { recognizeContacts: recognizeContacts || undefined },
        });
    };

    const isCreate = mode === "create";

    return (
        <ModalOverlay onClose={onClose}>
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                        {isCreate ? "Nuevo asistente" : "Editar asistente"}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {isCreate
                            ? "Configurá tu nuevo asistente."
                            : "Actualizá los datos del asistente."}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors"
                >
                    <FaXmark className="w-5 h-5" />
                </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ej: Asistente de ventas"
                            autoFocus
                            className="input-field"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Descripción <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Para qué sirve este asistente..."
                            rows={3}
                            className="input-field resize-none"
                        />
                    </div>

                    {/* Model */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Velocidad de respuesta <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {MODELS.map(m => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setModel(m.value)}
                                    className={cn(
                                        "flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all",
                                        model === m.value
                                            ? "border-primary bg-primary/5 dark:bg-primary/10"
                                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                    )}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                                        {model === m.value && <FaCheck className="w-3 h-3 text-primary shrink-0" />}
                                    </div>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{m.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Knowledge bases */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Información que usa
                        </label>
                        {knowledgeBases.length === 0 ? (
                            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                                Primero tenés que crear una sección de información.{" "}
                                <a href="/panel/bases-de-conocimiento" className="underline font-medium">
                                    Ir a Mi Información
                                </a>
                            </p>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Sin selección = usa todas las fuentes disponibles.
                                </p>
                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                                    {knowledgeBases.map(kb => {
                                        const checked = selectedKbs.has(kb._id);
                                        return (
                                            <label
                                                key={kb._id}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none",
                                                    checked
                                                        ? "bg-primary/5 dark:bg-primary/10"
                                                        : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                                )}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleKb(kb._id)}
                                                    className="w-4 h-4 rounded accent-primary shrink-0"
                                                />
                                                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{kb.name}</span>
                                                {checked && <FaCheck className="w-3 h-3 text-primary ml-auto shrink-0" />}
                                            </label>
                                        );
                                    })}
                                </div>
                                {selectedKbs.size === 0 && (
                                    <p className="text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                                        <FaDatabase className="w-3 h-3 shrink-0" />
                                        Usará todas las fuentes ({knowledgeBases.length})
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Recognize contacts toggle */}
                    <div className="flex items-center justify-between gap-4 py-1">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Reconocer clientes recurrentes</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                El asistente identificará contactos registrados por su número de WhatsApp.
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={recognizeContacts}
                            onClick={() => setRecognizeContacts(v => !v)}
                            className={cn(
                                "relative shrink-0 inline-flex h-6 w-10 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                recognizeContacts ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
                            )}
                        >
                            <span className={cn(
                                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                                recognizeContacts ? "translate-x-4" : "translate-x-0.5"
                            )} />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className={cn("btn-primary min-w-32", submitting && "opacity-70 cursor-wait")}
                    >
                        {submitting ? (
                            <span className="flex items-center gap-2">
                                <FaSpinner className="animate-spin w-3.5 h-3.5" />
                                Guardando...
                            </span>
                        ) : isCreate ? "Crear asistente" : "Guardar cambios"}
                    </button>
                </div>
            </form>
        </ModalOverlay>
    );
}

// ─── Modal Overlay ────────────────────────────────────────────────────────────

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
            <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-w-lg sm:rounded-2xl sm:max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in sm:zoom-in-95 duration-200">
                {children}
            </div>
        </div>
    );
}
