import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";

type Chunk = Doc<"knowledge_chunks">;
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FaPen, FaTrash, FaPlus, FaFileExcel, FaSpinner,
    FaCircleCheck, FaMagnifyingGlass, FaXmark, FaTriangleExclamation,
} from "react-icons/fa6";
import { useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import Datatable from "../../components/datatable";
import { cn, colIndexToLetter, colLetterToIndex } from "utils/utils";
import { ExcelImportConfig, isEmptyRow, type SheetCfg, type ParsedSheet } from "~/components/excel-import-config";
import Breadcrumbs from "../../components/breadcrumbs";

export function meta() {
    return [{ title: "Atendia — Administración — Base de Conocimiento" }];
}

const PAGE_SIZE = 20;
const MAX_RETRY_PASSES = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFaqContent(content: string) {
    return content.startsWith("Pregunta:") && content.includes("\nRespuesta:");
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function KnowledgeBaseDetail() {
    const { clientId, id } = useParams();
    const kbId = id as Id<"knowledge_bases">;

    // ── Queries ──────────────────────────────────────────────────────────────
    const client       = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
    const knowledgeBase = useQuery(api.knowledgeBases.get, { id: kbId });
    const activeImport = useQuery(api.excelImports.getByKnowledgeBase, { knowledgeBaseId: kbId });

    const chunksQuery = usePaginatedQuery(
        api.knowledgeChunks.getByKnowledgeBasePaginated,
        { knowledgeBaseId: kbId },
        { initialNumItems: PAGE_SIZE }
    );

    // ── Mutations / actions ──────────────────────────────────────────────────
    const updateKb           = useMutation(api.knowledgeBases.update);
    const updateChunk        = useMutation(api.knowledgeChunks.update);
    const removeChunk        = useMutation(api.knowledgeChunks.remove);
    const storeEmbedding     = useAction(api.ai.generateAndStoreEmbedding);
    const parseExcel         = useAction(api.ai.parseExcel);
    const startImportMut     = useMutation(api.excelImports.start);
    const appendImportRowsMut = useMutation(api.excelImports.appendImportRows);
    const finalizeImportMut  = useMutation(api.excelImports.finalizeImport);
    const cancelImport       = useMutation(api.excelImports.cancel);

    // Wrapper que orquesta el flujo nuevo (start → appendImportRows batch loop → finalize)
    // para que la mutation no reciba un array gigante que rompa el límite de 1 MB/doc.
    const startImport = useCallback(async (args: {
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
    }, [startImportMut, appendImportRowsMut, finalizeImportMut]);

    // Filas falladas paginadas (reemplaza el legacy `activeImport.failedRows`).
    const failedRowsQuery = usePaginatedQuery(
        api.excelImports.getFailedRows,
        activeImport?._id ? { importId: activeImport._id } : "skip",
        { initialNumItems: 50 }
    );

    // ── UI state: KB edit ────────────────────────────────────────────────────
    const [editKbOpen, setEditKbOpen]     = useState(false);
    const [kbName, setKbName]             = useState("");
    const [kbDescription, setKbDescription] = useState("");

    // ── UI state: chunk modal ────────────────────────────────────────────────
    const [modalOpen, setModalOpen]           = useState(false);
    const [editingChunk, setEditingChunk]     = useState<Chunk | null>(null);
    const [content, setContent]               = useState("");
    const [fragmentTab, setFragmentTab]       = useState<"general" | "excel">("general");
    const [submitting, setSubmitting]         = useState(false);

    // ── UI state: Excel tab ──────────────────────────────────────────────────
    const [rawSheets, setRawSheets]               = useState<{ name: string; rows: unknown[][] }[] | null>(null);
    const [selectedSheets, setSelectedSheets]     = useState<string[]>([]);
    const [sheetConfigs, setSheetConfigs]         = useState<Record<string, SheetCfg>>({});
    const [customizing, setCustomizing]           = useState(false);
    const [customCols, setCustomCols]             = useState<Record<string, string[]>>({});
    const [keyColumn, setKeyColumn]               = useState<string | null>(null);
    const [duplicateBehavior, setDuplicateBehavior] = useState<"add" | "update">("update");
    const [parsingExcel, setParsingExcel]         = useState(false);

    // ── Derivados ────────────────────────────────────────────────────────────
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

    const getEffectiveCols = (p: ParsedSheet): string[] => {
        if (!customizing) return p.headers;
        const explicit = customCols[p.name];
        if (explicit === undefined) return p.headers;
        return explicit.filter(c => p.headers.includes(c));
    };

    useEffect(() => {
        if (unionColumns.length === 0) { setKeyColumn(null); return; }
        if (keyColumn && !unionColumns.includes(keyColumn)) { setKeyColumn(null); return; }
        if (!keyColumn) {
            const autoKey = unionColumns.find(h => /^(id|código|codigo|code|key|clave)$/i.test(h.trim())) ?? null;
            if (autoKey) setKeyColumn(autoKey);
        }
    }, [unionColumns]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // ── UI state: chunks list ────────────────────────────────────────────────
    const [chunkSearch, setChunkSearch] = useState("");
    const [chunkPage, setChunkPage]     = useState(0);
    const [showFailedRows, setShowFailedRows] = useState(false);

    // ── Import timing ────────────────────────────────────────────────────────
    const [importNow, setImportNow] = useState(Date.now());
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

    // ── Handlers: KB edit ────────────────────────────────────────────────────
    const openEditKb = () => {
        if (!knowledgeBase) return;
        setKbName(knowledgeBase.name);
        setKbDescription(knowledgeBase.description ?? "");
        setEditKbOpen(true);
    };

    const handleUpdateKb = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!kbName.trim()) { toast.error("El nombre es obligatorio"); return; }
        setSubmitting(true);
        try {
            await updateKb({ id: kbId, name: kbName, description: kbDescription });
            toast.success("Base de conocimiento actualizada");
            setEditKbOpen(false);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Handlers: chunk modal ────────────────────────────────────────────────
    const openCreate = () => {
        setEditingChunk(null);
        setContent("");
        setFragmentTab("general");
        resetExcelState();
        setModalOpen(true);
    };

    const openEdit = (chunk: Chunk) => {
        setEditingChunk(chunk);
        setContent(chunk.content.replace(/<[^>]+>/g, "").trim());
        setFragmentTab("general");
        resetExcelState();
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingChunk(null);
        resetExcelState();
    };

    const resetExcelState = () => {
        setRawSheets(null);
        setSelectedSheets([]);
        setSheetConfigs({});
        setCustomizing(false);
        setCustomCols({});
        setKeyColumn(null);
        setDuplicateBehavior("update");
    };

    // ── Handlers: chunk text submit ──────────────────────────────────────────
    const handleTextSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) { toast.error("El contenido es obligatorio"); return; }
        setSubmitting(true);
        try {
            if (editingChunk) {
                await updateChunk({ id: editingChunk._id, content });
                toast.success("Fragmento actualizado");
            } else {
                const result = await storeEmbedding({ knowledgeBaseId: kbId, content, metadata: { source: "manual" } });
                if (result?.status === "skipped") {
                    toast.info("Ya existía un fragmento con este contenido; no se duplicó.");
                } else {
                    toast.success("Fragmento creado");
                }
            }
            closeModal();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al guardar");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Handlers: chunk delete ───────────────────────────────────────────────
    const handleDeleteChunk = async (e: React.MouseEvent, chunkId: Id<"knowledge_chunks">) => {
        e.stopPropagation();
        if (!globalThis.confirm("¿Eliminar este fragmento?")) return;
        try {
            await removeChunk({ id: chunkId });
            toast.success("Fragmento eliminado");
            if (editingChunk?._id === chunkId) closeModal();
        } catch {
            toast.error("Error al eliminar el fragmento");
        }
    };

    // ── Handlers: Excel upload ───────────────────────────────────────────────
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

    // ── Handlers: Excel import (asíncrono) ───────────────────────────────────
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
            closeModal();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al iniciar la importación.");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Chunks list: search + paginate ───────────────────────────────────────
    const isSearching = chunkSearch.trim().length > 0;

    const searchQuery = useQuery(
        api.knowledgeChunks.searchByKnowledgeBase,
        isSearching ? { knowledgeBaseId: kbId, search: chunkSearch.trim() } : "skip"
    );

    let visible: Chunk[] = [];
    let chunkCanGoPrev = false;
    let chunkCanGoNext = false;
    let chunkPageLabel = "";

    if (isSearching) {
        const results = searchQuery ?? [];
        const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
        const safePage = Math.min(chunkPage, totalPages - 1);
        visible = results.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
        chunkCanGoPrev = safePage > 0;
        chunkCanGoNext = (safePage + 1) * PAGE_SIZE < results.length;
        chunkPageLabel = results.length > 0
            ? `${safePage + 1} / ${totalPages} (${results.length} resultado${results.length !== 1 ? "s" : ""})`
            : "";
    } else {
        const startIdx = chunkPage * PAGE_SIZE;
        visible = chunksQuery.results.slice(startIdx, startIdx + PAGE_SIZE);
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

    // ── Datatable columns ────────────────────────────────────────────────────
    const columns = [
        {
            accessor: "content",
            title: "Contenido",
            render: (record: Chunk) => {
                const isFaq = isFaqContent(record.content);
                const isExcel = record.metadata?.source === "excel_import";
                const badge = isFaq ? "FAQ" : isExcel ? "Excel" : null;
                return (
                    <div className="flex items-center gap-2 max-w-xl">
                        {badge && (
                            <span className={cn(
                                "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                                isFaq
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                            )}>
                                {badge}
                            </span>
                        )}
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                            {record.content}
                        </span>
                    </div>
                );
            }
        },
        {
            accessor: "actions",
            title: "Acciones",
            textAlign: "right" as const,
            render: (record: Chunk) => (
                <button
                    onClick={e => handleDeleteChunk(e, record._id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                    <FaTrash size={13} />
                </button>
            ),
        },
    ];

    if (!knowledgeBase) {
        return (
            <div className="flex items-center justify-center py-20">
                <FaSpinner className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <ToastContainer position="top-right" theme="colored" />

            <Breadcrumbs
                items={[
                    { label: "Clientes", href: "/administracion/clientes" },
                    { label: client?.name ?? "Cliente", href: `/administracion/clientes/${clientId}` },
                    { label: "Bases de conocimiento", href: `/administracion/clientes/${clientId}/bases` },
                    { label: knowledgeBase.name },
                ]}
            />

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{knowledgeBase.name}</h1>
                        <button
                            onClick={openEditKb}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Editar"
                        >
                            <FaPen size={13} />
                        </button>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-sm">{knowledgeBase.description || "Sin descripción"}</p>
                </div>
                <button onClick={openCreate} className="btn-primary flex items-center gap-2 shrink-0">
                    <FaPlus size={13} />
                    Nuevo fragmento
                </button>
            </div>

            {/* Import progress */}
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
                            <span className="text-xs text-slate-500">{activeImport.processed} / {activeImport.total}</span>
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
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
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
                            Se importaron {activeImport.processed} de {activeImport.total} filas. El cliente debe recargar créditos para continuar.
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
                            ].filter(Boolean).join(", ")}.
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
                                            knowledgeBaseId: kbId,
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

            {/* Chunks panel */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-4">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                        Fragmentos
                        {chunksQuery.status !== "LoadingFirstPage" && (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                                ({chunksQuery.results.length}{chunksQuery.status !== "Exhausted" ? "+" : ""})
                            </span>
                        )}
                    </h2>
                    {/* Search */}
                    {(chunksQuery.results.length > 0 || isSearching) && (
                        <div className="relative max-w-xs w-full">
                            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={chunkSearch}
                                onChange={e => { setChunkSearch(e.target.value); setChunkPage(0); }}
                                placeholder="Buscar fragmentos…"
                                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder-slate-400"
                            />
                            {chunkSearch && (
                                <button
                                    onClick={() => { setChunkSearch(""); setChunkPage(0); }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    aria-label="Limpiar búsqueda"
                                >
                                    <FaXmark className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 space-y-4">
                    <Datatable
                        columns={columns}
                        records={chunksQuery.status === "LoadingFirstPage" || (isSearching && searchQuery === undefined) ? undefined : visible}
                        onRowClick={record => openEdit(record)}
                        emptyState={{
                            text: chunkSearch
                                ? `Sin resultados para "${chunkSearch}".`
                                : "Esta base de conocimiento aún no tiene fragmentos.",
                            onClick: chunkSearch ? undefined : openCreate,
                        }}
                    />

                    {(chunkCanGoPrev || chunkCanGoNext) && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={handlePrevPage}
                                disabled={!chunkCanGoPrev}
                                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                ← Anterior
                            </button>
                            <span className="text-xs text-slate-500">{chunkPageLabel}</span>
                            <button
                                onClick={handleNextPage}
                                disabled={!chunkCanGoNext}
                                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Siguiente →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modal: editar KB ─────────────────────────────────────────── */}
            {editKbOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Editar base de conocimiento</h3>
                            <button onClick={() => setEditKbOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <FaXmark className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateKb} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre</label>
                                <input
                                    type="text"
                                    value={kbName}
                                    onChange={e => setKbName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                                <textarea
                                    value={kbDescription}
                                    onChange={e => setKbDescription(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none text-sm"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setEditKbOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={submitting} className={cn("btn-primary min-w-28", submitting && "opacity-70 cursor-wait")}>
                                    {submitting ? <FaSpinner className="animate-spin w-4 h-4" /> : "Guardar cambios"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: fragmento ──────────────────────────────────────────── */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90dvh]">

                        {/* Header */}
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                {editingChunk ? "Editar fragmento" : "Nuevo fragmento"}
                            </h3>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <FaXmark className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs (solo al crear) */}
                        {!editingChunk && (
                            <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-800">
                                {(["general", "excel"] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => { setFragmentTab(tab); resetExcelState(); }}
                                        className={cn(
                                            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors border-b-2 translate-y-px",
                                            fragmentTab === tab
                                                ? "border-primary text-primary"
                                                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                        )}
                                    >
                                        {tab === "excel" ? <FaFileExcel className="w-3.5 h-3.5" /> : null}
                                        {tab === "general" ? "Texto general" : "Importar Excel"}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Body */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6">
                            {fragmentTab === "general" ? (
                                <form id="text-form" onSubmit={handleTextSubmit} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Contenido del fragmento
                                        </label>
                                        <textarea
                                            value={content}
                                            onChange={e => setContent(e.target.value)}
                                            rows={12}
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-y font-mono text-sm leading-relaxed"
                                            placeholder="Escribe el contenido aquí…"
                                        />
                                    </div>
                                </form>
                            ) : (
                                /* Excel tab */
                                <div className="space-y-5">
                                    {!rawSheets ? (
                                        <div className="flex flex-col items-center text-center gap-4 py-8">
                                            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                                <FaFileExcel className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-800 dark:text-slate-100">Cargar archivo Excel</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                                                    Subí un <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.xlsx</code>; cada fila se convertirá en un fragmento de conocimiento.
                                                </p>
                                            </div>
                                            <label className={cn("btn-primary inline-flex items-center gap-2 cursor-pointer", parsingExcel && "opacity-70 cursor-wait")}>
                                                {parsingExcel ? <><FaSpinner className="animate-spin w-4 h-4" /> Procesando…</> : <><FaPlus className="w-3.5 h-3.5" /> Seleccionar archivo</>}
                                                <input type="file" accept=".xlsx" className="hidden" onChange={handleExcelUpload} disabled={parsingExcel} />
                                            </label>
                                        </div>
                                    ) : (
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
                                            onReset={resetExcelState}
                                            onImport={handleImportExcel}
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer — el tab Excel con archivo cargado usa los botones del propio ExcelImportConfig */}
                        {!(fragmentTab === "excel" && rawSheets) && (
                            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
                                <div>
                                    {editingChunk && (
                                        <button
                                            type="button"
                                            onClick={e => handleDeleteChunk(e, editingChunk._id)}
                                            disabled={submitting}
                                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                        >
                                            <FaTrash className="w-3.5 h-3.5" /> Eliminar
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    {fragmentTab === "general" && (
                                        <button
                                            type="submit"
                                            form="text-form"
                                            disabled={submitting}
                                            className={cn("btn-primary min-w-32", submitting && "opacity-70 cursor-wait")}
                                        >
                                            {submitting
                                                ? <span className="flex items-center gap-2"><FaSpinner className="animate-spin w-3.5 h-3.5" />{editingChunk ? "Guardando…" : "Generando…"}</span>
                                                : editingChunk ? "Guardar cambios" : "Guardar"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
