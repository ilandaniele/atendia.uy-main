import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
    FaSpinner, FaTrash, FaPlus, FaXmark, FaChevronLeft,
    FaDatabase, FaPencil, FaFileExcel,
    FaCircleCheck, FaCircleQuestion, FaAlignLeft, FaMagnifyingGlass,
    FaTriangleExclamation,
    FaGoogleDrive, FaLink, FaRotate, FaUpRightFromSquare,
} from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn, colIndexToLetter, colLetterToIndex } from "utils/utils";
import { ExcelImportConfig, isEmptyRow, type SheetCfg, type ParsedSheet } from "~/components/excel-import-config";
import { useRequireOwner } from "./hooks/useRequireOwner";

// ─── Types ─────────────────────────────────────────────────────────────────────

type KnowledgeBase = Doc<"knowledge_bases">;
type Chunk = Doc<"knowledge_chunks">;
type FragmentTab = "text" | "faq" | "excel" | "drive";

// ─── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Mi información - Atendia" }];
}

// ─── Shared input class ────────────────────────────────────────────────────────

const INPUT = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder-slate-400 text-sm";

const MAX_RETRY_PASSES = 2;

// ─── Import timing helpers ─────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m < 1) return `${s} segundos`;
    return `${m} minutos`;
}

// ─── FAQ helpers ───────────────────────────────────────────────────────────────

function isFaqContent(content: string): boolean {
    return content.startsWith("Pregunta:") && content.includes("\nRespuesta:");
}

function parseFaqContent(content: string): { q: string; a: string } {
    const qMatch = content.match(/^Pregunta:\s*([\s\S]+?)(?=\nRespuesta:)/);
    const aMatch = content.match(/\nRespuesta:\s*([\s\S]+)$/);
    return {
        q: qMatch?.[1]?.trim() ?? "",
        a: aMatch?.[1]?.trim() ?? "",
    };
}

function buildFaqContent(q: string, a: string): string {
    return `Pregunta: ${q.trim()}\nRespuesta: ${a.trim()}`;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function UserKnowledgeBases() {
    const { isLoading: isOwnerLoading } = useRequireOwner();
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const clientId = userClients?.[0]?.client;

    const knowledgeBases = useQuery(
        api.knowledgeBases.getByClient,
        clientId ? { clientId } : "skip"
    );

    const createKb = useMutation(api.knowledgeBases.create);
    const updateKb = useMutation(api.knowledgeBases.update);
    const removeKb = useMutation(api.knowledgeBases.remove);

    // Selected KB → detail view
    const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

    // Keep selectedKb in sync with live Convex data
    useEffect(() => {
        if (!selectedKb || !knowledgeBases) return;
        const fresh = knowledgeBases.find(kb => kb._id === selectedKb._id);
        if (fresh) setSelectedKb(fresh);
    }, [knowledgeBases]);

    // KB create/edit modal
    const [kbModal, setKbModal] = useState<{ open: boolean; editing: KnowledgeBase | null }>({
        open: false,
        editing: null,
    });
    const [kbSubmitting, setKbSubmitting] = useState(false);

    const openKbCreate = () => setKbModal({ open: true, editing: null });
    const openKbEdit = (kb: KnowledgeBase) => setKbModal({ open: true, editing: kb });
    const closeKbModal = () => setKbModal({ open: false, editing: null });

    const handleKbSubmit = async (name: string, description: string) => {
        if (!clientId) return;
        setKbSubmitting(true);
        try {
            if (kbModal.editing) {
                await updateKb({ id: kbModal.editing._id, name, description });
                toast.success("Información actualizada.");
            } else {
                await createKb({ name, description, client: clientId });
                toast.success("Información creada.");
            }
            closeKbModal();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al guardar.");
        } finally {
            setKbSubmitting(false);
        }
    };

    const handleKbDelete = async (kb: KnowledgeBase) => {
        if (!globalThis.confirm(`¿Eliminar "${kb.name}"? Se eliminarán todos sus fragmentos.`)) return;
        try {
            await removeKb({ id: kb._id });
            if (selectedKb?._id === kb._id) setSelectedKb(null);
            toast.success("Información eliminada.");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar.");
        }
    };

    const isLoading = isOwnerLoading || !userProfile || userClients === undefined || knowledgeBases === undefined;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">

            {selectedKb ? (
                <KnowledgeBaseDetail
                    kb={selectedKb}
                    onBack={() => setSelectedKb(null)}
                    onEditKb={() => openKbEdit(selectedKb)}
                />
            ) : (
                <>
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                                Mi Información
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">
                                Acá guardás lo que sabe tu asistente.
                            </p>
                        </div>
                        <button
                            onClick={openKbCreate}
                            className="btn-primary flex items-center gap-2 self-start sm:self-auto"
                        >
                            <FaPlus className="w-3.5 h-3.5" />
                            Nueva sección
                        </button>
                    </div>

                    {/* Grid */}
                    {knowledgeBases.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {knowledgeBases.map(kb => (
                                <KnowledgeBaseCard
                                    key={kb._id}
                                    kb={kb}
                                    onOpen={() => setSelectedKb(kb)}
                                    onEdit={() => openKbEdit(kb)}
                                    onDelete={() => handleKbDelete(kb)}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState onCreateClick={openKbCreate} />
                    )}
                </>
            )}

            {/* KB create/edit modal */}
            {kbModal.open && (
                <KbModal
                    editing={kbModal.editing}
                    submitting={kbSubmitting}
                    onSubmit={handleKbSubmit}
                    onClose={closeKbModal}
                />
            )}
        </div>
    );
}

// ─── Knowledge Base Card ───────────────────────────────────────────────────────

function KnowledgeBaseCard({
    kb, onOpen, onEdit, onDelete,
}: {
    kb: KnowledgeBase;
    onOpen: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 shrink-0">
                    <FaDatabase className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{kb.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {kb.description || "Sin descripción"}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                    onClick={onOpen}
                    className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
                >
                    Abrir
                </button>
                <button
                    onClick={onEdit}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                    aria-label="Editar"
                >
                    <FaPencil className="w-4 h-4" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Eliminar"
                >
                    <FaTrash className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-5">
                <FaDatabase className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Aún sin información
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                Creá una sección con información de tu negocio para que tu asistente pueda responder correctamente.
            </p>
            <button onClick={onCreateClick} className="btn-primary flex items-center gap-2">
                <FaPlus className="w-3.5 h-3.5" />
                Crear primera sección
            </button>
        </div>
    );
}

// ─── KB Create / Edit Modal ────────────────────────────────────────────────────

function KbModal({
    editing, submitting, onSubmit, onClose,
}: {
    editing: KnowledgeBase | null;
    submitting: boolean;
    onSubmit: (name: string, description: string) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(editing?.name ?? "");
    const [description, setDescription] = useState(editing?.description ?? "");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
        onSubmit(name.trim(), description.trim());
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                    {editing ? "Editar sección" : "Nueva sección de información"}
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors">
                    <FaXmark className="w-5 h-5" />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ej: Información General"
                            autoFocus
                            className={INPUT}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Descripción
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="¿De qué trata esta sección? (opcional)"
                            rows={3}
                            className={cn(INPUT, "resize-none")}
                        />
                    </div>
                </div>
                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        Cancelar
                    </button>
                    <button type="submit" disabled={submitting} className={cn("btn-primary min-w-32", submitting && "opacity-70 cursor-wait")}>
                        {submitting
                            ? <span className="flex items-center gap-2"><FaSpinner className="animate-spin w-3.5 h-3.5" />Guardando...</span>
                            : editing ? "Guardar cambios" : "Crear sección"}
                    </button>
                </div>
            </form>
        </ModalOverlay>
    );
}

// ─── Knowledge Base Detail ─────────────────────────────────────────────────────

function KnowledgeBaseDetail({
    kb, onBack, onEditKb,
}: {
    kb: KnowledgeBase;
    onBack: () => void;
    onEditKb: () => void;
}) {
    const PAGE_SIZE = 20;

    const chunksQuery = usePaginatedQuery(
        api.knowledgeChunks.getByKnowledgeBasePaginated,
        { knowledgeBaseId: kb._id },
        { initialNumItems: PAGE_SIZE }
    );
    const activeImport = useQuery(api.excelImports.getByKnowledgeBase, { knowledgeBaseId: kb._id });
    const removeChunk = useMutation(api.knowledgeChunks.remove);
    const updateChunk = useMutation(api.knowledgeChunks.update);
    const generateAndStoreEmbedding = useAction(api.ai.generateAndStoreEmbedding);
    const startImportMut = useMutation(api.excelImports.start);
    const appendImportRowsMut = useMutation(api.excelImports.appendImportRows);
    const finalizeImportMut = useMutation(api.excelImports.finalizeImport);
    const cancelImport = useMutation(api.excelImports.cancel);

    // Wrapper que orquesta el flujo nuevo (start → appendImportRows batch loop → finalize)
    // para que la mutation no reciba un array gigante que rompa el límite de 1 MB/doc.
    const startImport = async (args: {
        knowledgeBaseId: Id<"knowledge_bases">;
        rows: string[];
        keyColumn?: string;
        duplicateBehavior?: "add" | "update";
    }): Promise<Id<"excel_imports">> => {
        const APPEND_BATCH = 2000;
        const importId = await startImportMut({
            knowledgeBaseId: args.knowledgeBaseId,
            total: args.rows.length,
            keyColumn: args.keyColumn,
            duplicateBehavior: args.duplicateBehavior,
        });
        for (let i = 0; i < args.rows.length; i += APPEND_BATCH) {
            await appendImportRowsMut({
                importId,
                rows: args.rows.slice(i, i + APPEND_BATCH),
                baseIndex: i,
            });
        }
        await finalizeImportMut({ importId });
        return importId;
    };

    // Filas falladas (sólo se cargan cuando el import terminó con failures).
    const failedRowsQuery = usePaginatedQuery(
        api.excelImports.getFailedRows,
        activeImport?._id ? { importId: activeImport._id } : "skip",
        { initialNumItems: 50 }
    );

    const [fragmentModalOpen, setFragmentModalOpen] = useState(false);
    const [editingChunk, setEditingChunk] = useState<Chunk | null>(null);
    const [chunkSearch, setChunkSearch] = useState("");
    const [chunkPage, setChunkPage] = useState(0);

    const isSearching = chunkSearch.trim().length > 0;

    const searchQuery = useQuery(
        api.knowledgeChunks.searchByKnowledgeBase,
        isSearching ? { knowledgeBaseId: kb._id, search: chunkSearch.trim() } : "skip"
    );

    // Derive visible chunks, pagination state
    let chunkVisible: Chunk[] = [];
    let chunkCanGoPrev = false;
    let chunkCanGoNext = false;
    let chunkPageLabel = "";

    if (isSearching) {
        const results = searchQuery ?? [];
        const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
        const safePage = Math.min(chunkPage, totalPages - 1);
        chunkVisible = results.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
        chunkCanGoPrev = safePage > 0;
        chunkCanGoNext = (safePage + 1) * PAGE_SIZE < results.length;
        chunkPageLabel = results.length > 0
            ? `${safePage + 1} / ${totalPages} (${results.length} resultado${results.length !== 1 ? "s" : ""})`
            : "";
    } else {
        const startIdx = chunkPage * PAGE_SIZE;
        chunkVisible = chunksQuery.results.slice(startIdx, startIdx + PAGE_SIZE);
        chunkCanGoPrev = chunkPage > 0;
        chunkCanGoNext = startIdx + PAGE_SIZE < chunksQuery.results.length || chunksQuery.status === "CanLoadMore";
        const loadedPages = Math.ceil(chunksQuery.results.length / PAGE_SIZE);
        chunkPageLabel = `Página ${chunkPage + 1}${chunksQuery.status === "Exhausted" ? ` / ${loadedPages}` : ""}`;
    }

    const handleNextPage = () => {
        if (!isSearching) {
            const nextStart = (chunkPage + 1) * PAGE_SIZE;
            if (nextStart >= chunksQuery.results.length && chunksQuery.status === "CanLoadMore") {
                chunksQuery.loadMore(PAGE_SIZE);
            }
        }
        setChunkPage(p => p + 1);
    };

    const handlePrevPage = () => setChunkPage(p => Math.max(0, p - 1));

    // ── Import timing ──────────────────────────────────────────────────────────
    const [importNow, setImportNow] = useState(Date.now());
    const [showFailedRows, setShowFailedRows] = useState(false);
    const importActive = activeImport?.status === "pending" || activeImport?.status === "processing";
    useEffect(() => {
        if (!importActive) return;
        const id = setInterval(() => setImportNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [importActive]);

    const importElapsedSec = activeImport?.startedAt
        ? (importNow - activeImport.startedAt) / 1000
        : null;
    const importRate = importElapsedSec && importElapsedSec > 2 && activeImport && activeImport.processed > 0
        ? activeImport.processed / importElapsedSec
        : null;
    const importEtaSec = importRate && activeImport
        ? (activeImport.total - activeImport.processed) / importRate
        : null;

    const handleDeleteChunk = async (chunk: Chunk) => {
        if (!globalThis.confirm("¿Eliminar este fragmento?")) return;
        try {
            await removeChunk({ id: chunk._id });
            toast.success("Fragmento eliminado.");
        } catch {
            toast.error("Error al eliminar el fragmento.");
        }
    };

    const openCreate = () => { setEditingChunk(null); setFragmentModalOpen(true); };
    const openEdit = (chunk: Chunk) => { setEditingChunk(chunk); setFragmentModalOpen(true); };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Volver"
                    >
                        <FaChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{kb.name}</h1>
                            <button
                                onClick={onEditKb}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                aria-label="Editar base"
                            >
                                <FaPencil className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {kb.description && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{kb.description}</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={openCreate}
                    className="btn-primary flex items-center gap-2 self-start sm:self-auto"
                >
                    <FaPlus className="w-3.5 h-3.5" />
                    Agregar información
                </button>
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                    <FaDatabase className="w-4 h-4" />
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                    {chunksQuery.status === "LoadingFirstPage"
                        ? "Cargando..."
                        : chunksQuery.results.length === 0 && chunksQuery.status === "Exhausted"
                            ? "Sin información aún"
                            : chunksQuery.status === "Exhausted"
                                ? `${chunksQuery.results.length} dato${chunksQuery.results.length !== 1 ? "s" : ""} guardado${chunksQuery.results.length !== 1 ? "s" : ""}`
                                : `Más de ${chunksQuery.results.length} dato${chunksQuery.results.length !== 1 ? "s" : ""} guardado${chunksQuery.results.length !== 1 ? "s" : ""}`}
                </span>
            </div>

            {/* Barra de progreso de importación Excel asíncrona */}
            {activeImport && (activeImport.status === "pending" || activeImport.status === "processing") && (
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                            <FaSpinner className="animate-spin w-3.5 h-3.5" />
                            {activeImport.seeding
                                ? "Cargando filas…"
                                : activeImport.processed >= activeImport.total && activeImport.status === "processing"
                                    ? "Reintentando filas con errores…"
                                    : "Importando planilla Excel…"}
                        </span>
                        <div className="flex items-center gap-3">
                            <span className="text-slate-500 dark:text-slate-400 text-xs">
                                {activeImport.processed} / {activeImport.total}
                            </span>
                            <button
                                onClick={async () => {
                                    if (!globalThis.confirm("¿Cancelar la importación en curso?")) return;
                                    try {
                                        await cancelImport({ importId: activeImport._id });
                                        toast.info("Importación cancelada.");
                                    } catch {
                                        toast.error("No se pudo cancelar la importación.");
                                    }
                                }}
                                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                            style={{ width: activeImport.total > 0 ? `${(activeImport.processed / activeImport.total) * 100}%` : "0%" }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                        <span>
                            {importElapsedSec !== null
                                ? `Transcurrido: ${formatDuration(importElapsedSec)}`
                                : "Iniciando…"}
                        </span>
                        {importEtaSec !== null && importEtaSec > 1 && (
                            <span>Resta aprox. {formatDuration(importEtaSec)}</span>
                        )}
                    </div>
                    {((activeImport.skipped ?? 0) > 0 || activeImport.fail > 0) && (
                        <div className="flex items-center gap-3 text-xs">
                            {(activeImport.skipped ?? 0) > 0 && (
                                <span className="text-slate-500 dark:text-slate-400">
                                    {activeImport.skipped} omitida{activeImport.skipped !== 1 ? "s" : ""} (ya existían).
                                </span>
                            )}
                            {activeImport.fail > 0 && (
                                <span className="text-amber-500">
                                    {activeImport.fail} fila{activeImport.fail !== 1 ? "s" : ""} no se {activeImport.fail !== 1 ? "pudieron" : "pudo"} importar.
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}
            {activeImport?.status === "cancelled" && activeImport.cancelReason === "no_tokens" && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                    <FaTriangleExclamation className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">Importación detenida por falta de créditos</p>
                        <p className="text-xs mt-0.5 text-red-600 dark:text-red-500">
                            Se importaron {activeImport.processed} de {activeImport.total} filas.
                            Recargá tus créditos para continuar.
                        </p>
                    </div>
                </div>
            )}
            {activeImport?.status === "completed" && (
                <>
                    <div className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border text-sm",
                        activeImport.fail > 0
                            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                            : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                    )}>
                        <FaCircleCheck className="w-4 h-4 shrink-0" />
                        <span>
                            Importación completada —{" "}
                            {[
                                activeImport.ok > 0 && `${activeImport.ok} agregado${activeImport.ok !== 1 ? "s" : ""}`,
                                (activeImport.updated ?? 0) > 0 && `${activeImport.updated} actualizado${activeImport.updated !== 1 ? "s" : ""}`,
                                (activeImport.skipped ?? 0) > 0 && `${activeImport.skipped} omitido${activeImport.skipped !== 1 ? "s" : ""} (ya existían)`,
                                activeImport.fail > 0 && `${activeImport.fail} no se pudieron importar`,
                            ].filter(Boolean).join(", ")}
                            .
                        </span>
                    </div>

                    {failedRowsQuery.results.length > 0 && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                                    <FaTriangleExclamation className="w-4 h-4" />
                                    {activeImport.fail} fila{activeImport.fail !== 1 ? "s" : ""} no se pud{activeImport.fail !== 1 ? "ieron" : "o"} importar tras {MAX_RETRY_PASSES + 1} intentos
                                </span>
                                <button
                                    onClick={() => setShowFailedRows(v => !v)}
                                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                                >
                                    {showFailedRows ? "Ocultar" : "Ver detalle"}
                                </button>
                            </div>

                            {showFailedRows && (
                                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                    {failedRowsQuery.results.map((fr) => (
                                        <div key={fr._id} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg px-3 py-1.5">
                                            <span className="shrink-0 font-mono text-amber-500">#{fr.index}</span>
                                            <span className="truncate">{fr.content.slice(0, 120)}{fr.content.length > 120 ? "…" : ""}</span>
                                        </div>
                                    ))}
                                    {failedRowsQuery.status === "CanLoadMore" && (
                                        <button
                                            onClick={() => failedRowsQuery.loadMore(50)}
                                            className="w-full text-center text-xs text-amber-600 dark:text-amber-400 hover:underline py-2"
                                        >
                                            Cargar más
                                        </button>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={async () => {
                                    if (!failedRowsQuery.results.length) return;
                                    try {
                                        await startImport({
                                            knowledgeBaseId: kb._id,
                                            rows: failedRowsQuery.results.map(r => r.content),
                                            keyColumn: activeImport.keyColumn,
                                            duplicateBehavior: activeImport.duplicateBehavior,
                                        });
                                        toast.info(`Re-importación iniciada — ${failedRowsQuery.results.length} fila${failedRowsQuery.results.length !== 1 ? "s" : ""}.`);
                                    } catch {
                                        toast.error("Error al iniciar la re-importación.");
                                    }
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                            >
                                <FaFileExcel className="w-3 h-3" />
                                Re-importar filas falladas (cargadas)
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Chunks list */}
            {chunksQuery.status === "LoadingFirstPage" ? (
                <div className="flex justify-center py-12">
                    <FaSpinner className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : chunksQuery.results.length === 0 && chunksQuery.status === "Exhausted" && !isSearching ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4">
                        <FaAlignLeft className="w-7 h-7 text-slate-400" />
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">Sin información</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500 max-w-xs mb-5">
                        Agregá información para que tu asistente pueda responder.
                    </p>
                    <button onClick={openCreate} className="btn-primary flex items-center gap-2">
                        <FaPlus className="w-3.5 h-3.5" /> Agregar información
                    </button>
                </div>
            ) : (
                <>
                    {/* Search */}
                    <div className="relative">
                        <FaMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={chunkSearch}
                            onChange={e => { setChunkSearch(e.target.value); setChunkPage(0); }}
                            placeholder="Buscar en esta sección..."
                            className={cn(INPUT, "pl-10", chunkSearch && "pr-10")}
                        />
                        {chunkSearch && (
                            <button
                                onClick={() => { setChunkSearch(""); setChunkPage(0); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                aria-label="Limpiar búsqueda"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {isSearching && searchQuery === undefined ? (
                        <div className="flex justify-center py-8">
                            <FaSpinner className="w-6 h-6 text-primary animate-spin" />
                        </div>
                    ) : chunkVisible.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 gap-3">
                                {chunkVisible.map(chunk => (
                                    <ChunkCard
                                        key={chunk._id}
                                        chunk={chunk}
                                        onEdit={() => openEdit(chunk)}
                                        onDelete={() => handleDeleteChunk(chunk)}
                                    />
                                ))}
                            </div>

                            {/* Pagination */}
                            {(chunkCanGoPrev || chunkCanGoNext) && (
                                <div className="flex items-center justify-between pt-2">
                                    <button
                                        onClick={handlePrevPage}
                                        disabled={!chunkCanGoPrev}
                                        className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        ← Anterior
                                    </button>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{chunkPageLabel}</span>
                                    <button
                                        onClick={handleNextPage}
                                        disabled={!chunkCanGoNext}
                                        className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Siguiente →
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-center text-sm text-slate-400 py-10">
                            {isSearching
                                ? `No se encontraron fragmentos para "${chunkSearch}".`
                                : "Sin información aún."}
                        </p>
                    )}
                </>
            )}

            {/* Fragment modal */}
            {fragmentModalOpen && (
                <FragmentModal
                    kbId={kb._id}
                    editingChunk={editingChunk}
                    generateAndStoreEmbedding={generateAndStoreEmbedding}
                    updateChunk={updateChunk}
                    startImport={startImport}
                    onClose={() => { setFragmentModalOpen(false); setEditingChunk(null); }}
                />
            )}
        </div>
    );
}

// ─── Chunk Card ────────────────────────────────────────────────────────────────

function ChunkCard({ chunk, onEdit, onDelete }: { chunk: Chunk; onEdit: () => void; onDelete: () => void }) {
    const isFaq = isFaqContent(chunk.content);
    const isExcel = chunk.metadata?.source === "excel_import";
    const faq = isFaq ? parseFaqContent(chunk.content) : null;

    return (
        <div
            className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
            onClick={onEdit}
        >
            <div className={cn(
                "p-2 rounded-lg shrink-0 mt-0.5",
                isFaq
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    : isExcel
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            )}>
                {isFaq
                    ? <FaCircleQuestion className="w-3.5 h-3.5" />
                    : isExcel
                        ? <FaFileExcel className="w-3.5 h-3.5" />
                        : <FaAlignLeft className="w-3.5 h-3.5" />}
            </div>

            {isFaq && faq ? (
                <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {faq.q}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {faq.a}
                    </p>
                </div>
            ) : (
                <p className="flex-1 text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed min-w-0">
                    {chunk.content}
                </p>
            )}

            <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="shrink-0 p-2 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                aria-label="Eliminar"
            >
                <FaTrash className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ─── Fragment Modal ────────────────────────────────────────────────────────────

interface FragmentModalProps {
    kbId: Id<"knowledge_bases">;
    editingChunk: Chunk | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateAndStoreEmbedding: (args: { knowledgeBaseId: Id<"knowledge_bases">; content: string; metadata: any }) => Promise<{ status: "created" | "skipped" } | null | undefined>;
    updateChunk: (args: { id: Id<"knowledge_chunks">; content: string }) => Promise<Id<"knowledge_chunks">>;
    startImport: (args: { knowledgeBaseId: Id<"knowledge_bases">; rows: string[]; keyColumn?: string; duplicateBehavior?: "add" | "update" }) => Promise<Id<"excel_imports">>;
    onClose: () => void;
}

function FragmentModal({ kbId, editingChunk, generateAndStoreEmbedding, updateChunk, startImport, onClose }: FragmentModalProps) {
    const isEditing = editingChunk !== null;
    const isEditingFaq = isEditing && isFaqContent(editingChunk.content);

    const [activeTab, setActiveTab] = useState<FragmentTab>(isEditingFaq ? "faq" : "text");
    const [submitting, setSubmitting] = useState(false);

    // Tab: text (only used for plain-text chunks)
    const [textContent, setTextContent] = useState(
        isEditing && !isEditingFaq ? editingChunk.content : ""
    );

    // Tab: FAQ — pre-filled when editing a FAQ chunk
    const [faqs, setFaqs] = useState<{ q: string; a: string }[]>(
        isEditingFaq
            ? [parseFaqContent(editingChunk.content)]
            : [{ q: "", a: "" }]
    );

    // Tab: Excel
    // Cada hoja del archivo tiene su propia config (fila de encabezados + columna inicial).
    // `expanded` controla el accordion de configuración por hoja.
    const [rawSheets, setRawSheets] = useState<{ name: string; rows: unknown[][] }[] | null>(null);
    const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
    const [sheetConfigs, setSheetConfigs] = useState<Record<string, SheetCfg>>({});
    const [customizing, setCustomizing] = useState(false);
    // `customCols[sheetName]` undefined → todas las columnas incluidas (default).
    // Si está definido, sólo se importan las columnas listadas.
    const [customCols, setCustomCols] = useState<Record<string, string[]>>({});
    const [keyColumn, setKeyColumn] = useState<string | null>(null);
    const [duplicateBehavior, setDuplicateBehavior] = useState<"add" | "update">("update");
    const [parsingExcel, setParsingExcel] = useState(false);
    const parseExcel = useAction(api.ai.parseExcel);

    // ── Derivados ──────────────────────────────────────────────────────────────
    const parsedSheets: ParsedSheet[] = useMemo(() => {
        if (!rawSheets) return [];
        return rawSheets.map(s => {
            const cfg = sheetConfigs[s.name];
            const headerRow = cfg ? parseInt(cfg.headerRowInput, 10) : 1;
            const headerIdx = Number.isFinite(headerRow) && headerRow > 0 ? headerRow - 1 : 0;
            const colIdx = cfg ? (colLetterToIndex(cfg.startColInput) ?? 0) : 0;
            const sliced = s.rows.slice(headerIdx).map(r => (Array.isArray(r) ? (r as unknown[]) : []).slice(colIdx));
            if (sliced.length < 1) return { name: s.name, headers: [], rows: [], cfgValid: false };
            const headers = (sliced[0] ?? []).map((h, i) =>
                h != null && String(h).trim() !== "" ? String(h).trim() : `Columna ${colIndexToLetter(colIdx + i)}`
            );
            const dataRows = sliced.slice(1).filter(r => !isEmptyRow(r));
            return { name: s.name, headers, rows: dataRows, cfgValid: true };
        });
    }, [rawSheets, sheetConfigs]);

    const activeParsedSheets = useMemo(
        () => parsedSheets.filter(p => selectedSheets.includes(p.name)),
        [parsedSheets, selectedSheets]
    );

    const unionColumns = useMemo(() => {
        const set = new Set<string>();
        for (const p of activeParsedSheets) for (const h of p.headers) set.add(h);
        return Array.from(set);
    }, [activeParsedSheets]);

    const totalRows = useMemo(
        () => activeParsedSheets.reduce((sum, p) => sum + p.rows.length, 0),
        [activeParsedSheets]
    );

    const multiSheet = selectedSheets.length > 1;

    // Devuelve las columnas que se importarán de una hoja, considerando el modo "personalizar".
    const getEffectiveCols = (p: ParsedSheet): string[] => {
        if (!customizing) return p.headers;
        const explicit = customCols[p.name];
        if (explicit === undefined) return p.headers;
        return explicit.filter(c => p.headers.includes(c));
    };

    // Re-detección de keyColumn cuando cambia el set de columnas disponibles.
    useEffect(() => {
        if (unionColumns.length === 0) { setKeyColumn(null); return; }
        // Si el keyColumn actual ya no existe, lo limpiamos.
        if (keyColumn && !unionColumns.includes(keyColumn)) { setKeyColumn(null); return; }
        // Auto-detección sólo si todavía no hay uno seleccionado.
        if (!keyColumn) {
            const autoKey = unionColumns.find(h => /^(id|código|codigo|code|key|clave)$/i.test(h.trim())) ?? null;
            if (autoKey) setKeyColumn(autoKey);
        }
    }, [unionColumns]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Helpers ────────────────────────────────────────────────────────────────
    const updateSheetCfg = (name: string, patch: Partial<SheetCfg>) => {
        setSheetConfigs(prev => {
            const current: SheetCfg = prev[name] ?? { headerRowInput: "1", startColInput: "A", expanded: false };
            return { ...prev, [name]: { ...current, ...patch } };
        });
    };

    const toggleSheetSelection = (name: string) => {
        setSelectedSheets(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    };

    const toggleCustomCol = (sheetName: string, headers: string[], col: string) => {
        setCustomCols(prev => {
            const current = prev[sheetName] ?? headers;
            return {
                ...prev,
                [sheetName]: current.includes(col) ? current.filter(c => c !== col) : [...current, col],
            };
        });
    };

    const resetCustomColsToAll = () => setCustomCols({});

    // ── Text submit ────────────────────────────────────────────────────────────
    const handleTextSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!textContent.trim()) { toast.error("El contenido no puede estar vacío."); return; }
        setSubmitting(true);
        try {
            if (isEditing) {
                await updateChunk({ id: editingChunk._id, content: textContent.trim() });
                toast.success("Fragmento actualizado.");
            } else {
                const result = await generateAndStoreEmbedding({
                    knowledgeBaseId: kbId,
                    content: textContent.trim(),
                    metadata: { source: "manual" },
                });
                if (result?.status === "skipped") {
                    toast.info("Ya existía un fragmento con este contenido; no se duplicó.");
                } else {
                    toast.success("Fragmento guardado correctamente.");
                }
            }
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al guardar el fragmento.");
        } finally {
            setSubmitting(false);
        }
    };

    // ── FAQ submit ─────────────────────────────────────────────────────────────
    const handleFaqSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const valid = faqs.filter(f => f.q.trim() && f.a.trim());
        if (valid.length === 0) { toast.error("Agrega al menos una pregunta y respuesta."); return; }
        setSubmitting(true);
        try {
            if (isEditingFaq && editingChunk) {
                await updateChunk({
                    id: editingChunk._id,
                    content: buildFaqContent(valid[0].q, valid[0].a),
                });
                toast.success("Pregunta actualizada.");
            } else {
                let created = 0;
                let skipped = 0;
                for (const faq of valid) {
                    const result = await generateAndStoreEmbedding({
                        knowledgeBaseId: kbId,
                        content: buildFaqContent(faq.q, faq.a),
                        metadata: { source: "faq" },
                    });
                    if (result?.status === "skipped") skipped++;
                    else created++;
                }
                if (created === 0 && skipped > 0) {
                    toast.info(`Las ${skipped === 1 ? "pregunta ya existía" : `${skipped} preguntas ya existían`}; no se duplicaron.`);
                } else if (skipped > 0) {
                    toast.success(`${created} pregunta${created !== 1 ? "s" : ""} guardada${created !== 1 ? "s" : ""}, ${skipped} ya existía${skipped !== 1 ? "n" : ""}.`);
                } else {
                    toast.success(`${created} pregunta${created !== 1 ? "s" : ""} guardada${created !== 1 ? "s" : ""}.`);
                }
            }
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al guardar las preguntas.");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Excel upload ───────────────────────────────────────────────────────────
    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParsingExcel(true);
        try {
            const buffer = await file.arrayBuffer();
            const parsed = await parseExcel({ fileBuffer: buffer });
            if (!parsed || !Array.isArray((parsed as { sheets?: unknown }).sheets)) {
                console.error("[parseExcel] respuesta inesperada:", parsed);
                toast.error("Respuesta inesperada del servidor. Reiniciá `npx convex dev` y recargá la página.");
                return;
            }
            const sheets = parsed.sheets.map(s => ({
                name: s.name,
                rows: s.rowChunks.flat() as unknown[][],
            })).filter(s => s.rows.length > 0);
            if (sheets.length === 0) {
                toast.error("El archivo no tiene hojas con datos.");
                return;
            }
            setRawSheets(sheets);
            setSelectedSheets(sheets.map(s => s.name));
            setSheetConfigs(Object.fromEntries(
                sheets.map(s => [s.name, { headerRowInput: "1", startColInput: "A", expanded: false }])
            ));
            setCustomizing(false);
            setCustomCols({});
            setKeyColumn(null);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al leer el archivo.");
        } finally {
            setParsingExcel(false);
            e.target.value = "";
        }
    };

    const handleImportExcel = async () => {
        if (activeParsedSheets.length === 0) {
            toast.error("Seleccioná al menos una hoja para importar.");
            return;
        }

        const rows: string[] = [];
        for (const p of activeParsedSheets) {
            if (!p.cfgValid) continue;
            const cols = getEffectiveCols(p);
            if (cols.length === 0) continue;
            const indices = cols.map(col => p.headers.indexOf(col)).filter(i => i >= 0);
            const sheetPrefix = multiSheet ? `Hoja: ${p.name}\n` : "";
            for (const row of p.rows) {
                const parts = indices
                    .map(idx => {
                        const val = (row as unknown[])[idx];
                        return val != null && String(val).trim() !== ""
                            ? `${p.headers[idx]}: ${String(val).trim()}`
                            : null;
                    })
                    .filter(Boolean) as string[];
                if (parts.length > 0) rows.push(sheetPrefix + parts.join("\n"));
            }
        }

        if (rows.length === 0) {
            toast.error("No hay filas con datos en las columnas seleccionadas.");
            return;
        }

        setSubmitting(true);
        try {
            await startImport({
                knowledgeBaseId: kbId,
                rows,
                keyColumn: keyColumn ?? undefined,
                duplicateBehavior: keyColumn ? duplicateBehavior : undefined,
            });
            toast.success(`Importación iniciada — ${rows.length} fila${rows.length !== 1 ? "s" : ""} en proceso.`);
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al iniciar la importación.");
        } finally {
            setSubmitting(false);
        }
    };

    const TABS: { id: FragmentTab; label: string; icon: React.ReactNode }[] = [
        { id: "text", label: "Texto", icon: <FaAlignLeft className="w-3.5 h-3.5" /> },
        { id: "faq", label: "Preguntas frecuentes", icon: <FaCircleQuestion className="w-3.5 h-3.5" /> },
        { id: "excel", label: "Subir planilla", icon: <FaFileExcel className="w-3.5 h-3.5" /> },
        { id: "drive", label: "Google Drive", icon: <FaGoogleDrive className="w-3.5 h-3.5" /> },
    ];

    return (
        <ModalOverlay onClose={onClose} wide>
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                    {isEditing ? "Editar información" : "Agregar información"}
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors">
                    <FaXmark className="w-5 h-5" />
                </button>
            </div>

            {/* Tabs — only show when creating */}
            {!isEditing && (
                <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-800">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors translate-y-px border-b-2",
                                activeTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            )}
                        >
                            {tab.icon}
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">{tab.id === "text" ? "Texto" : tab.id === "faq" ? "FAQ" : tab.id === "excel" ? "Excel" : "Drive"}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col">
                {/* ── Text tab ─────────────────────────────────────────────── */}
                {activeTab === "text" && (
                    <form id="text-form" onSubmit={handleTextSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Tu información
                            </label>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Escribí sobre tu negocio: horarios, precios, servicios, etc.
                            </p>
                            <textarea
                                value={textContent}
                                onChange={e => setTextContent(e.target.value)}
                                rows={10}
                                placeholder="Ej: Ofrecemos servicios de plomería, electricidad y pintura. Trabajamos en toda la ciudad. Los presupuestos son sin cargo y se coordinan por WhatsApp..."
                                className={cn(INPUT, "resize-y font-mono text-sm leading-relaxed")}
                            />
                        </div>
                    </form>
                )}

                {/* ── FAQ tab ───────────────────────────────────────────────── */}
                {activeTab === "faq" && (
                    <form id="faq-form" onSubmit={handleFaqSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                        {isEditingFaq ? (
                            /* Editing a single existing FAQ chunk */
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Pregunta
                                    </label>
                                    <input
                                        type="text"
                                        value={faqs[0].q}
                                        onChange={e => setFaqs([{ ...faqs[0], q: e.target.value }])}
                                        placeholder="¿Cuáles son los medios de pago disponibles?"
                                        autoFocus
                                        className={INPUT}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Respuesta
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={faqs[0].a}
                                        onChange={e => setFaqs([{ ...faqs[0], a: e.target.value }])}
                                        placeholder="Aceptamos efectivo, tarjeta de crédito/débito y transferencia bancaria."
                                        className={cn(INPUT, "resize-none")}
                                    />
                                </div>
                            </div>
                        ) : (
                            /* Creating one or more new FAQ chunks */
                            <>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Agrega las preguntas frecuentes de tus clientes. Cada par se guarda por separado.
                                </p>

                                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                                    {faqs.map((faq, i) => (
                                        <div
                                            key={i}
                                            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                    Pregunta {i + 1}
                                                </span>
                                                {faqs.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))}
                                                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                    >
                                                        <FaTrash className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                value={faq.q}
                                                onChange={e => {
                                                    const updated = [...faqs];
                                                    updated[i].q = e.target.value;
                                                    setFaqs(updated);
                                                }}
                                                placeholder="¿Cuáles son los medios de pago disponibles?"
                                                className={INPUT}
                                            />
                                            <textarea
                                                rows={2}
                                                value={faq.a}
                                                onChange={e => {
                                                    const updated = [...faqs];
                                                    updated[i].a = e.target.value;
                                                    setFaqs(updated);
                                                }}
                                                placeholder="Aceptamos efectivo, tarjeta de crédito/débito y transferencia bancaria."
                                                className={cn(INPUT, "resize-none")}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setFaqs([...faqs, { q: "", a: "" }])}
                                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                                >
                                    <FaPlus className="w-3 h-3" /> Agregar otra pregunta
                                </button>
                            </>
                        )}
                    </form>
                )}

                {/* ── Excel tab ─────────────────────────────────────────────── */}
                {!isEditing && activeTab === "excel" && (
                    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                        {!rawSheets ? (
                            /* Upload step */
                            <div className="flex flex-col items-center text-center gap-5 py-8">
                                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                    <FaFileExcel className="w-7 h-7" />
                                </div>
                                <div>
                                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
                                        Cargar archivo Excel
                                    </h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                                        Sube un archivo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.xlsx</code>, elige qué columnas incluir y cada fila se convertirá en un fragmento.
                                    </p>
                                </div>
                                <label className="cursor-pointer">
                                    <div className={cn(
                                        "btn-primary inline-flex items-center gap-2 px-6",
                                        parsingExcel && "opacity-70 cursor-wait"
                                    )}>
                                        {parsingExcel
                                            ? <><FaSpinner className="animate-spin w-4 h-4" /> Procesando...</>
                                            : <><FaPlus className="w-3.5 h-3.5" /> Seleccionar archivo</>}
                                    </div>
                                    <input
                                        type="file"
                                        accept=".xlsx"
                                        className="hidden"
                                        onChange={handleExcelUpload}
                                        disabled={parsingExcel}
                                    />
                                </label>
                            </div>
                        ) : (
                            /* Column mapping step */
                            <ExcelImportConfig
                                rawSheets={rawSheets}
                                parsedSheets={parsedSheets}
                                activeParsedSheets={activeParsedSheets}
                                selectedSheets={selectedSheets}
                                sheetConfigs={sheetConfigs}
                                customizing={customizing}
                                customCols={customCols}
                                keyColumn={keyColumn}
                                duplicateBehavior={duplicateBehavior}
                                unionColumns={unionColumns}
                                totalRows={totalRows}
                                multiSheet={multiSheet}
                                submitting={submitting}
                                getEffectiveCols={getEffectiveCols}
                                onToggleSheet={toggleSheetSelection}
                                onUpdateSheetCfg={updateSheetCfg}
                                onToggleCustomizing={() => setCustomizing(v => !v)}
                                onResetCustomCols={resetCustomColsToAll}
                                onToggleCustomCol={toggleCustomCol}
                                onChangeKeyColumn={setKeyColumn}
                                onChangeDuplicateBehavior={setDuplicateBehavior}
                                onReset={() => setRawSheets(null)}
                                onImport={handleImportExcel}
                            />
                        )}
                    </div>
                )}

                {/* ── Google Drive tab ─────────────────────────────────────── */}
                {activeTab === "drive" && (
                    <DriveTabContent kbId={kbId} onClose={onClose} />
                )}
            </div>

            {/* Footer */}
            {(activeTab === "text" || activeTab === "faq") && (
                <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form={activeTab === "faq" ? "faq-form" : "text-form"}
                        disabled={submitting}
                        className={cn("btn-primary min-w-36", submitting && "opacity-70 cursor-wait")}
                    >
                        {submitting
                            ? <span className="flex items-center gap-2"><FaSpinner className="animate-spin w-3.5 h-3.5" />{isEditing ? "Guardando..." : "Generando..."}</span>
                            : isEditing ? "Guardar cambios" : "Guardar"}
                    </button>
                </div>
            )}
        </ModalOverlay>
    );
}


// ─── Drive tab content ────────────────────────────────────────────────────────

function DriveTabContent({ kbId, onClose }: { kbId: Id<"knowledge_bases">; onClose: () => void }) {
    const kb = useQuery(api.knowledgeBases.get, { id: kbId });
    const driveStatus = useQuery(api.googleDriveDb.getStatus);
    const allLinks = useQuery(
        api.googleDriveDb.listForClient,
        kb ? { clientId: kb.client } : "skip"
    );
    const linkFile = useAction(api.googleDrive.linkFile);
    const manualSync = useMutation(api.googleDriveDb.manualSync);
    const unlinkFile = useMutation(api.googleDriveDb.unlinkFile);

    const [url, setUrl] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const filesForThisKb = useMemo(
        () => (allLinks ?? []).filter((f) => f.knowledgeBase === kbId && f.isActive),
        [allLinks, kbId],
    );

    const handleLink = async () => {
        if (!url.trim() || !kb) return;
        setSubmitting(true);
        try {
            const result = await linkFile({
                clientId: kb.client,
                knowledgeBaseId: kbId,
                driveUrlOrId: url.trim(),
            });
            if (result.ok) {
                toast.success("Archivo vinculado. Sincronizando…");
                setUrl("");
            } else {
                toast.error(humanizeDriveLinkError(result.error));
            }
        } catch (err) {
            console.error("[GDrive link]", err);
            toast.error("No se pudo vincular el archivo.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSync = async (linkId: Id<"linked_drive_files">) => {
        try {
            await manualSync({ linkId });
            toast.info("Sincronización en curso.");
        } catch {
            toast.error("No se pudo iniciar la sincronización.");
        }
    };

    const handleUnlink = async (linkId: Id<"linked_drive_files">, name: string) => {
        if (!confirm(`¿Desvincular "${name}"?`)) return;
        try {
            await unlinkFile({ linkId });
            toast.success("Archivo desvinculado.");
        } catch {
            toast.error("No se pudo desvincular.");
        }
    };

    if (driveStatus === undefined || kb === undefined) {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <FaSpinner className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
        );
    }

    if (!driveStatus.connected) {
        return (
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-800/40 text-center space-y-3">
                    <FaGoogleDrive className="w-10 h-10 text-blue-500 mx-auto" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Google Drive aún no está conectado
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Conectá tu cuenta de Drive desde Configuración para poder vincular archivos que se sincronicen automáticamente.
                    </p>
                    <Link
                        to="/panel/configuracion"
                        onClick={onClose}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                    >
                        <FaGoogleDrive className="w-3.5 h-3.5" />
                        Ir a Configuración
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
            {/* Connected pill */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <FaCircleCheck className="w-3 h-3 text-emerald-500" />
                Drive conectado como <strong className="text-slate-700 dark:text-slate-200">{driveStatus.email ?? "—"}</strong>
            </div>

            {/* Link new file */}
            <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Vincular archivo de Google Drive
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pegá la URL del archivo (Excel, Google Sheets o Google Doc). Atendia lo descargará y mantendrá sincronizado.
                </p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className={INPUT}
                        disabled={submitting}
                    />
                    <button
                        type="button"
                        onClick={handleLink}
                        disabled={submitting || !url.trim()}
                        className={cn(
                            "btn-primary inline-flex items-center gap-2 px-4 shrink-0",
                            (submitting || !url.trim()) && "opacity-60 cursor-not-allowed",
                        )}
                    >
                        {submitting ? <FaSpinner className="w-3.5 h-3.5 animate-spin" /> : <FaLink className="w-3.5 h-3.5" />}
                        Vincular
                    </button>
                </div>
            </div>

            {/* Existing files for this KB */}
            <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Archivos vinculados a esta base
                </p>
                {allLinks === undefined ? (
                    <div className="flex justify-center py-4">
                        <FaSpinner className="w-4 h-4 text-slate-400 animate-spin" />
                    </div>
                ) : filesForThisKb.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                        Todavía no hay archivos vinculados a esta base de conocimiento.
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {filesForThisKb.map((f) => (
                            <div
                                key={f._id}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl border p-3",
                                    f.lastSyncError
                                        ? "border-amber-200 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10"
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
                                )}
                            >
                                <FaGoogleDrive className="w-4 h-4 text-blue-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                            {f.driveFileName}
                                        </p>
                                        {f.driveWebViewLink && (
                                            <a
                                                href={f.driveWebViewLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-slate-400 hover:text-primary shrink-0"
                                                title="Abrir en Drive"
                                            >
                                                <FaUpRightFromSquare className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                    <p
                                        className={cn(
                                            "text-xs",
                                            f.lastSyncError
                                                ? "text-amber-700 dark:text-amber-400"
                                                : "text-slate-500 dark:text-slate-400",
                                        )}
                                    >
                                        {f.lastSyncError
                                            ? `Error: ${f.lastSyncError}`
                                            : f.lastSyncedAt
                                                ? `Sincronizado · ${f.syncCount} sync${f.syncCount === 1 ? "" : "s"}`
                                                : "Pendiente de primera sincronización"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleSync(f._id)}
                                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-colors shrink-0"
                                    title="Sincronizar ahora"
                                >
                                    <FaRotate className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleUnlink(f._id, f.driveFileName)}
                                    className="p-2 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors shrink-0"
                                    title="Desvincular"
                                >
                                    <FaTrash className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function humanizeDriveLinkError(code: string): string {
    if (code === "drive_not_connected") return "Conectá Google Drive primero desde Configuración.";
    if (code === "invalid_url") return "La URL no es de un archivo de Google Drive válido.";
    if (code === "knowledge_base_not_found") return "La base de conocimiento no existe.";
    if (code === "pdf_unsupported") return "PDFs aún no están soportados. Por ahora podés vincular Excel, Sheets y Docs.";
    if (code.startsWith("unsupported_mime")) return "Tipo de archivo no soportado (solo Excel, Sheets y Docs por ahora).";
    if (code.startsWith("drive_fetch_failed")) {
        const detail = code.slice("drive_fetch_failed:".length).trim();
        return detail
            ? `Drive rechazó la petición: ${detail}`
            : "Atendia no pudo leer el archivo. Verificá permisos en Drive.";
    }
    return "No se pudo vincular el archivo.";
}

// ─── Modal Overlay ─────────────────────────────────────────────────────────────

function ModalOverlay({
    children, onClose, wide = false,
}: {
    children: React.ReactNode;
    onClose: () => void;
    wide?: boolean;
}) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4"
        >
            <div className={cn(
                "bg-white dark:bg-slate-900 w-full h-full sm:h-auto shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200 sm:max-h-[90dvh] sm:rounded-2xl",
                wide ? "sm:max-w-2xl" : "sm:max-w-lg"
            )}>
                {children}
            </div>
        </div>
    );
}
