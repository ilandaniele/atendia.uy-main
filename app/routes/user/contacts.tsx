import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
    FaSpinner, FaTrash, FaPencil, FaPlus, FaXmark,
    FaAddressBook, FaMagnifyingGlass, FaChevronLeft,
    FaFileExcel, FaFileCsv, FaCircleCheck, FaPhone, FaUser,
    FaSquareCheck, FaSquare, FaMinus, FaEnvelope,
} from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn } from "utils/utils";
import { COUNTRY_CONFIGS, detectCountryFromPhone, normalizePhone, parsePhone, type SupportedCountry } from "utils/phoneUtils";
import { parseEmail } from "utils/emailUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = Doc<"contacts">;

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Contactos - Atendia" }];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const IMPORT_BATCH = 100;
const DELETE_BATCH = 50;

const INPUT = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder-slate-400 text-sm";

const COUNTRY_OPTIONS = Object.entries(COUNTRY_CONFIGS).map(([code, cfg]) => ({
    code: code as SupportedCountry,
    label: cfg.label,
}));

function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const esc = (v: string | number | null | undefined) => {
        if (v == null) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const content = [headers, ...rows].map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserContacts() {
    const { assistantId } = useParams<{ assistantId: string }>();
    const navigate = useNavigate();

    // ── Page size ────────────────────────────────────────────────────────────
    const [pageSize, setPageSize] = useState<number>(50);

    const assistant = useQuery(
        api.assistants.get,
        assistantId ? { id: assistantId as Id<"assistants"> } : "skip"
    );

    const contactsQuery = usePaginatedQuery(
        api.contacts.getByAssistant,
        assistantId ? { assistantId: assistantId as Id<"assistants"> } : "skip",
        { initialNumItems: pageSize }
    );

    const [filterName, setFilterName] = useState("");
    const [filterPhone, setFilterPhone] = useState("");
    const [filterEmail, setFilterEmail] = useState("");
    const isSearching = filterName.trim().length > 0 || filterPhone.trim().length > 0 || filterEmail.trim().length > 0;

    const searchResults = useQuery(
        api.contacts.searchByAssistant,
        isSearching && assistantId
            ? {
                assistantId: assistantId as Id<"assistants">,
                name: filterName.trim() || undefined,
                phone: filterPhone.trim() || undefined,
                email: filterEmail.trim() || undefined,
            }
            : "skip"
    );

    // Used for CSV export — always fetches all contacts regardless of pagination
    const allContactsForExport = useQuery(
        api.contacts.searchByAssistant,
        assistantId ? { assistantId: assistantId as Id<"assistants"> } : "skip"
    );

    const totalCount = useQuery(
        api.contacts.countByAssistant,
        assistantId ? { assistantId: assistantId as Id<"assistants"> } : "skip"
    );

    const [page, setPage] = useState(0);

    // ── Pagination ───────────────────────────────────────────────────────────
    // Clamp page to the actual data range so deletions never leave an empty page.
    const maxValidPage = isSearching
        ? Math.max(0, Math.ceil((searchResults?.length ?? 0) / pageSize) - 1)
        : Math.max(0, Math.ceil(contactsQuery.results.length / pageSize) - 1);
    const effectivePage = Math.min(page, maxValidPage);

    let visible: Contact[] = [];
    let canPrev = false;
    let canNext = false;
    let pageLabel = "";

    if (isSearching) {
        const results = searchResults ?? [];
        const total = Math.max(1, Math.ceil(results.length / pageSize));
        visible = results.slice(effectivePage * pageSize, (effectivePage + 1) * pageSize);
        canPrev = effectivePage > 0;
        canNext = (effectivePage + 1) * pageSize < results.length;
        pageLabel = results.length > 0
            ? `${effectivePage + 1} / ${total} (${results.length} resultado${results.length !== 1 ? "s" : ""})`
            : "";
    } else {
        const start = effectivePage * pageSize;
        visible = contactsQuery.results.slice(start, start + pageSize);
        canPrev = effectivePage > 0;
        canNext = start + pageSize < contactsQuery.results.length || contactsQuery.status === "CanLoadMore";
        const loaded = Math.max(1, Math.ceil(contactsQuery.results.length / pageSize));
        pageLabel = `Página ${effectivePage + 1}${contactsQuery.status === "Exhausted" ? ` / ${loaded}` : ""}`;
    }

    const handleNext = () => {
        if (!isSearching) {
            const next = (effectivePage + 1) * pageSize;
            if (next >= contactsQuery.results.length && contactsQuery.status === "CanLoadMore") {
                contactsQuery.loadMore(pageSize);
            }
        }
        setPage(effectivePage + 1);
    };

    // ── Selection ────────────────────────────────────────────────────────────
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const allPageSelected = visible.length > 0 && visible.every(c => selected.has(c._id));
    const somePageSelected = visible.some(c => selected.has(c._id)) && !allPageSelected;

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAllPage = () => {
        if (allPageSelected) {
            setSelected(prev => {
                const next = new Set(prev);
                visible.forEach(c => next.delete(c._id));
                return next;
            });
        } else {
            setSelected(prev => {
                const next = new Set(prev);
                visible.forEach(c => next.add(c._id));
                return next;
            });
        }
    };

    const clearSelection = () => { setSelected(new Set()); setSelectAll(false); };

    // ── Bulk delete ──────────────────────────────────────────────────────────
    const [selectAll, setSelectAll] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

    // Auto-load when current page needs more items than are loaded.
    useEffect(() => {
        if (isSearching || bulkDeleting || contactsQuery.status !== "CanLoadMore") return;
        const maxValid = Math.max(0, Math.ceil(contactsQuery.results.length / pageSize) - 1);
        const ep = Math.min(page, maxValid);
        const needed = (ep + 1) * pageSize;
        if (contactsQuery.results.length < needed) {
            contactsQuery.loadMore(pageSize);
        }
    }, [isSearching, bulkDeleting, page, pageSize, contactsQuery.results.length, contactsQuery.status, contactsQuery.loadMore]);

    const removeContact = useMutation(api.contacts.remove);
    const removeBatch = useMutation(api.contacts.removeBatch);
    const removeAllMutation = useMutation(api.contacts.removeAll);
    const importBatch = useMutation(api.contacts.importBatch);

    const handleDelete = async (contact: Contact) => {
        if (!globalThis.confirm(`¿Eliminar el contacto "${contact.name}"?`)) return;
        try {
            await removeContact({ id: contact._id });
            toast.success("Contacto eliminado.");
            setSelected(prev => { const n = new Set(prev); n.delete(contact._id); return n; });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar.");
        }
    };

    const handleBulkDelete = async () => {
        const label = selectAll
            ? `todos los ${totalCount ?? "?"} contactos`
            : `${selected.size} contacto${selected.size !== 1 ? "s" : ""}`;
        if (!globalThis.confirm(`¿Eliminar ${label}?\nEsta acción no se puede deshacer.`)) return;

        setBulkDeleting(true);

        if (selectAll && assistantId) {
            setBulkProgress({ done: 0, total: totalCount ?? 0 });
            try {
                const r = await removeAllMutation({ assistantId: assistantId as Id<"assistants"> });
                toast.success(`${r.removed} contacto${r.removed !== 1 ? "s" : ""} eliminado${r.removed !== 1 ? "s" : ""}.`);
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Error al eliminar.");
            }
        } else {
            const ids = [...selected] as Id<"contacts">[];
            setBulkProgress({ done: 0, total: ids.length });
            let totalRemoved = 0;
            for (let i = 0; i < ids.length; i += DELETE_BATCH) {
                try {
                    const r = await removeBatch({ ids: ids.slice(i, i + DELETE_BATCH) });
                    totalRemoved += r.removed;
                } catch { /* continue */ }
                setBulkProgress({ done: Math.min(i + DELETE_BATCH, ids.length), total: ids.length });
            }
            toast.success(`${totalRemoved} contacto${totalRemoved !== 1 ? "s" : ""} eliminado${totalRemoved !== 1 ? "s" : ""}.`);
        }

        clearSelection();
        setBulkDeleting(false);
        setBulkProgress(null);
    };

    // ── Modals ───────────────────────────────────────────────────────────────
    const [contactModal, setContactModal] = useState<{ open: boolean; editing: Contact | null }>({ open: false, editing: null });
    const [importOpen, setImportOpen] = useState(false);

    const createContact = useMutation(api.contacts.create);
    const updateContact = useMutation(api.contacts.update);

    const handleExportCSV = () => {
        const contacts = isSearching ? (searchResults ?? []) : (allContactsForExport ?? []);
        if (contacts.length === 0) {
            toast.info(allContactsForExport === undefined ? "Cargando contactos…" : "No hay contactos para exportar.");
            return;
        }
        const extraKeys = Array.from(new Set(contacts.flatMap(c => Object.keys(c.extras ?? {}))));
        const headers = ["Nombre", "Teléfono", "Email", ...extraKeys];
        const rows = contacts.map(c => [
            c.name,
            c.phone ? `+${c.phone}` : "",
            c.email ?? "",
            ...extraKeys.map(k => c.extras?.[k] ?? ""),
        ]);
        downloadCSV(`contactos_${assistantId}_${formatDate(Date.now())}.csv`, headers, rows);
    };

    const isLoading = assistant === undefined || contactsQuery.status === "LoadingFirstPage";

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    if (!assistant) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p className="text-slate-500 dark:text-slate-400">Asistente no encontrado.</p>
                <button onClick={() => navigate("/panel/asistentes")} className="btn-primary">
                    Volver a asistentes
                </button>
            </div>
        );
    }

    const statsText = totalCount !== undefined
        ? `${totalCount} contacto${totalCount !== 1 ? "s" : ""}`
        : contactsQuery.status === "Exhausted"
            ? `${contactsQuery.results.length} contacto${contactsQuery.results.length !== 1 ? "s" : ""}`
            : `Más de ${contactsQuery.results.length} contacto${contactsQuery.results.length !== 1 ? "s" : ""}`;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/panel/asistentes")}
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Volver"
                    >
                        <FaChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Contactos</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{assistant.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    <button
                        onClick={handleExportCSV}
                        className="btn-secondary flex items-center gap-2 text-sm"
                    >
                        <FaFileCsv className="w-3.5 h-3.5 text-green-600" />
                        Exportar CSV
                    </button>
                    <button
                        onClick={() => setImportOpen(true)}
                        className="btn-secondary flex items-center gap-2 text-sm"
                    >
                        <FaFileExcel className="w-3.5 h-3.5" />
                        Importar Excel
                    </button>
                    <button
                        onClick={() => setContactModal({ open: true, editing: null })}
                        className="btn-primary flex items-center gap-2"
                    >
                        <FaPlus className="w-3.5 h-3.5" />
                        Agregar
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                    <FaAddressBook className="w-4 h-4" />
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                    {totalCount === undefined ? "Cargando..." : statsText}
                </span>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <FaUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={filterName}
                        onChange={e => { setFilterName(e.target.value); setPage(0); setSelected(new Set()); }}
                        placeholder="Buscar por nombre..."
                        className={cn(INPUT, "pl-10")}
                    />
                </div>
                <div className="relative flex-1">
                    <FaPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={filterPhone}
                        onChange={e => { setFilterPhone(e.target.value); setPage(0); setSelected(new Set()); }}
                        placeholder="Buscar por teléfono..."
                        className={cn(INPUT, "pl-10")}
                    />
                </div>
                <div className="relative flex-1">
                    <FaEnvelope className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={filterEmail}
                        onChange={e => { setFilterEmail(e.target.value); setPage(0); setSelected(new Set()); }}
                        placeholder="Buscar por email..."
                        className={cn(INPUT, "pl-10")}
                    />
                </div>
                {isSearching && (
                    <button
                        onClick={() => { setFilterName(""); setFilterPhone(""); setFilterEmail(""); setPage(0); setSelected(new Set()); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap flex items-center gap-2"
                    >
                        <FaXmark className="w-3.5 h-3.5" />
                        Limpiar
                    </button>
                )}
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl">
                    {bulkDeleting && bulkProgress ? (
                        <>
                            <FaSpinner className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                            <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                                Eliminando {bulkProgress.done} / {bulkProgress.total}...
                            </span>
                            <div className="flex-1 min-w-30 h-1.5 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                                {selectAll
                                    ? `Todos los ${totalCount ?? "?"} contactos seleccionados`
                                    : `${selected.size} seleccionado${selected.size !== 1 ? "s" : ""}`}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                {!selectAll && (
                                    <button
                                        onClick={toggleAllPage}
                                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline underline-offset-2 transition-colors"
                                    >
                                        {allPageSelected ? "Desmarcar página" : "Seleccionar página"}
                                    </button>
                                )}
                                {!selectAll && allPageSelected && totalCount !== undefined && totalCount > selected.size && (
                                    <>
                                        <span className="text-indigo-300 dark:text-indigo-700">·</span>
                                        <button
                                            onClick={() => setSelectAll(true)}
                                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline underline-offset-2 transition-colors"
                                        >
                                            Seleccionar todos los {totalCount}
                                        </button>
                                    </>
                                )}
                                {!selectAll && <span className="text-indigo-300 dark:text-indigo-700">·</span>}
                                <button
                                    onClick={clearSelection}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline underline-offset-2 transition-colors"
                                >
                                    Vaciar selección
                                </button>
                            </div>
                            <button
                                onClick={handleBulkDelete}
                                className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                            >
                                <FaTrash className="w-3.5 h-3.5" />
                                Eliminar {selectAll ? `todos (${totalCount ?? "?"})` : `(${selected.size})`}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Table */}
            {contactsQuery.results.length === 0 && contactsQuery.status === "Exhausted" && !isSearching ? (
                <EmptyState onAddClick={() => setContactModal({ open: true, editing: null })} />
            ) : (
                <>
                    {isSearching && searchResults === undefined ? (
                        <div className="flex justify-center py-10">
                            <FaSpinner className="w-6 h-6 text-primary animate-spin" />
                        </div>
                    ) : visible.length === 0 ? (
                        <p className="text-center text-sm text-slate-400 py-10">
                            No se encontraron contactos con esos filtros.
                        </p>
                    ) : (
                        <ContactTable
                            contacts={visible}
                            selectedIds={selected}
                            allPageSelected={allPageSelected}
                            somePageSelected={somePageSelected}
                            onToggleSelect={toggleSelect}
                            onToggleAll={toggleAllPage}
                            onEdit={c => setContactModal({ open: true, editing: c })}
                            onDelete={handleDelete}
                            disabled={bulkDeleting}
                        />
                    )}

                    {/* Pagination + page size */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                            onClick={() => setPage(Math.max(0, effectivePage - 1))}
                            disabled={!canPrev || bulkDeleting}
                            className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            ← Anterior
                        </button>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex-1 text-center">{pageLabel}</span>
                        <button
                            onClick={handleNext}
                            disabled={!canNext || bulkDeleting}
                            className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Siguiente →
                        </button>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>Mostrar</span>
                            <select
                                value={pageSize}
                                onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                {PAGE_SIZE_OPTIONS.map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </>
            )}

            {/* Contact modal */}
            {contactModal.open && assistantId && (
                <ContactModal
                    assistantId={assistantId as Id<"assistants">}
                    editing={contactModal.editing}
                    onSubmit={async (data, country) => {
                        try {
                            if (contactModal.editing) {
                                await updateContact({
                                    id: contactModal.editing._id,
                                    name: data.name,
                                    phone: data.phone,
                                    email: data.email,
                                    extras: data.extras,
                                    countryHint: country,
                                });
                                toast.success("Contacto actualizado.");
                            } else {
                                await createContact({
                                    assistantId: assistantId as Id<"assistants">,
                                    name: data.name,
                                    phone: data.phone || undefined,
                                    email: data.email || undefined,
                                    extras: data.extras,
                                    countryHint: country,
                                });
                                toast.success("Contacto guardado.");
                            }
                            setContactModal({ open: false, editing: null });
                        } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Error al guardar.");
                        }
                    }}
                    onClose={() => setContactModal({ open: false, editing: null })}
                />
            )}

            {/* Import modal */}
            {importOpen && assistantId && (
                <ImportModal
                    assistantId={assistantId as Id<"assistants">}
                    importBatch={importBatch}
                    onClose={() => setImportOpen(false)}
                />
            )}
        </div>
    );
}

// ─── Contact Table ─────────────────────────────────────────────────────────────

function ContactTable({
    contacts, selectedIds, allPageSelected, somePageSelected,
    onToggleSelect, onToggleAll, onEdit, onDelete, disabled,
}: {
    contacts: Contact[];
    selectedIds: Set<string>;
    allPageSelected: boolean;
    somePageSelected: boolean;
    onToggleSelect: (id: string) => void;
    onToggleAll: () => void;
    onEdit: (c: Contact) => void;
    onDelete: (c: Contact) => void;
    disabled?: boolean;
}) {
    const HeaderCheckIcon = allPageSelected ? FaSquareCheck : somePageSelected ? FaMinus : FaSquare;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <th className="px-4 py-3 w-10">
                                <button
                                    onClick={onToggleAll}
                                    disabled={disabled}
                                    className="text-slate-400 hover:text-primary disabled:opacity-40 transition-colors"
                                    aria-label="Seleccionar toda la página"
                                >
                                    <HeaderCheckIcon className="w-4 h-4" />
                                </button>
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Nombre</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Contacto</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden sm:table-cell">Datos extra</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Actualizado</th>
                            <th className="px-4 py-3 w-20" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {contacts.map(c => {
                            const isSelected = selectedIds.has(c._id);
                            return (
                                <tr
                                    key={c._id}
                                    className={cn(
                                        "transition-colors",
                                        isSelected
                                            ? "bg-indigo-50/60 dark:bg-indigo-950/30"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                    )}
                                >
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => onToggleSelect(c._id)}
                                            disabled={disabled}
                                            className="text-slate-400 hover:text-primary disabled:opacity-40 transition-colors"
                                            aria-label="Seleccionar"
                                        >
                                            {isSelected
                                                ? <FaSquareCheck className="w-4 h-4 text-primary" />
                                                : <FaSquare className="w-4 h-4" />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{c.name}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                                        {c.phone ? `+${c.phone}` : c.email ?? <span className="text-slate-300 dark:text-slate-700">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-500 hidden sm:table-cell">
                                        {c.extras && Object.keys(c.extras).length > 0
                                            ? Object.entries(c.extras).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ")
                                            : <span className="text-slate-300 dark:text-slate-700">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap hidden md:table-cell">
                                        {formatDate((c as any).updatedAt ?? c._creationTime)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => onEdit(c)}
                                                disabled={disabled}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
                                                aria-label="Editar"
                                            >
                                                <FaPencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => onDelete(c)}
                                                disabled={disabled}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                                                aria-label="Eliminar"
                                            >
                                                <FaTrash className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-5">
                <FaAddressBook className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Sin contactos aún</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                Agregá contactos para que el asistente reconozca a tus clientes recurrentes.
            </p>
            <button onClick={onAddClick} className="btn-primary flex items-center gap-2">
                <FaPlus className="w-3.5 h-3.5" />
                Agregar primer contacto
            </button>
        </div>
    );
}

// ─── Country Select ───────────────────────────────────────────────────────────

function CountrySelect({ value, onChange }: { value: SupportedCountry; onChange: (v: SupportedCountry) => void }) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value as SupportedCountry)}
            className={cn(INPUT, "cursor-pointer")}
        >
            {COUNTRY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
            ))}
        </select>
    );
}

// ─── Contact Modal ────────────────────────────────────────────────────────────

type ContactFormData = { name: string; phone?: string; email?: string; extras?: Record<string, string> };

function ContactModal({
    assistantId, editing, onSubmit, onClose,
}: {
    assistantId: Id<"assistants">;
    editing: Contact | null;
    onSubmit: (data: ContactFormData, country: string) => Promise<void>;
    onClose: () => void;
}) {
    // Identificación: phone o email (uno u otro). Si el contacto editado tiene phone, arrancamos en "phone".
    const initialMode: "phone" | "email" = editing?.email && !editing?.phone ? "email" : "phone";
    const [mode, setMode] = useState<"phone" | "email">(initialMode);
    const [name, setName] = useState(editing?.name ?? "");
    const [phone, setPhone] = useState(editing?.phone ?? "");
    const [email, setEmail] = useState(editing?.email ?? "");
    const [country, setCountry] = useState<SupportedCountry>(
        () => (editing?.phone ? detectCountryFromPhone(editing.phone) : null) ?? "UY"
    );
    const [extras, setExtras] = useState<{ key: string; value: string }[]>(
        editing?.extras ? Object.entries(editing.extras).map(([k, v]) => ({ key: k, value: v })) : []
    );
    const [submitting, setSubmitting] = useState(false);

    const phoneResult = mode === "phone" && phone.trim() ? parsePhone(phone.trim(), country) : null;
    const emailResult = mode === "email" && email.trim() ? parseEmail(email.trim()) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
        if (mode === "phone" && !phone.trim()) { toast.error("Ingresá un teléfono."); return; }
        if (mode === "email" && !email.trim()) { toast.error("Ingresá un email."); return; }
        if (mode === "email" && emailResult && !emailResult.ok) { toast.error(emailResult.error); return; }
        const extrasObj = extras.reduce<Record<string, string>>((acc, { key, value }) => {
            if (key.trim() && value.trim()) acc[key.trim()] = value.trim();
            return acc;
        }, {});
        setSubmitting(true);
        try {
            // Solo enviamos el campo del modo activo. En edición, el otro campo lo limpiamos pasando "".
            const payload: ContactFormData = {
                name: name.trim(),
                phone: mode === "phone" ? phone.trim() : (editing ? "" : undefined),
                email: mode === "email" ? email.trim() : (editing ? "" : undefined),
                extras: Object.keys(extrasObj).length ? extrasObj : undefined,
            };
            await onSubmit(payload, country);
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90dvh] sm:max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200 sm:rounded-2xl">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                        {editing ? "Editar contacto" : "Nuevo contacto"}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors">
                        <FaXmark className="w-5 h-5" />
                    </button>
                </div>
                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="p-6 space-y-4 overflow-y-auto flex-1">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Nombre <span className="text-red-500">*</span>
                            </label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="Ej: Juan García" autoFocus className={INPUT} />
                        </div>
                        {/* Mode toggle: phone or email (mutually exclusive) */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Identificar por <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setMode("phone")}
                                    className={cn(
                                        "flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                        mode === "phone"
                                            ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    <FaPhone className="w-3.5 h-3.5" />
                                    Teléfono
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode("email")}
                                    className={cn(
                                        "flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                        mode === "email"
                                            ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    <FaEnvelope className="w-3.5 h-3.5" />
                                    Email
                                </button>
                            </div>
                        </div>

                        {mode === "phone" ? (
                            <>
                                {/* Country */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        País (para normalización)
                                    </label>
                                    <CountrySelect value={country} onChange={setCountry} />
                                </div>
                                {/* Phone */}
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Teléfono <span className="text-red-500">*</span>
                                    </label>
                                    <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                                        placeholder="Ej: 099123123 o +59899123123"
                                        className={cn(INPUT, phoneResult?.ok === false && "border-red-400 focus:border-red-500")} />
                                    {phoneResult && (
                                        <p className={cn("text-xs mt-1", phoneResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                            {phoneResult.ok ? `✓ Guardado como: +${phoneResult.phone}` : `✗ ${phoneResult.error}`}
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Email */
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                    placeholder="Ej: cliente@ejemplo.com"
                                    className={cn(INPUT, emailResult?.ok === false && "border-red-400 focus:border-red-500")} />
                                {emailResult && (
                                    <p className={cn("text-xs mt-1", emailResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                        {emailResult.ok ? `✓ Guardado como: ${emailResult.email}` : `✗ ${emailResult.error}`}
                                    </p>
                                )}
                            </div>
                        )}
                        {/* Extras */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Datos adicionales
                            </label>
                            {extras.map((ex, i) => (
                                <div key={i} className="flex gap-2">
                                    <input type="text" value={ex.key}
                                        onChange={e => { const a = [...extras]; a[i].key = e.target.value; setExtras(a); }}
                                        placeholder="Campo" className={cn(INPUT, "flex-1")} />
                                    <input type="text" value={ex.value}
                                        onChange={e => { const a = [...extras]; a[i].value = e.target.value; setExtras(a); }}
                                        placeholder="Valor" className={cn(INPUT, "flex-1")} />
                                    <button type="button" onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                                        className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 transition-colors">
                                        <FaXmark className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={() => setExtras([...extras, { key: "", value: "" }])}
                                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                                <FaPlus className="w-3 h-3" /> Agregar campo
                            </button>
                        </div>
                    </div>
                    {/* Footer */}
                    <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={submitting}
                            className={cn("btn-primary min-w-32", submitting && "opacity-70 cursor-wait")}>
                            {submitting
                                ? <span className="flex items-center gap-2"><FaSpinner className="animate-spin w-3.5 h-3.5" />Guardando...</span>
                                : editing ? "Guardar cambios" : "Crear contacto"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({
    assistantId, importBatch, onClose,
}: {
    assistantId: Id<"assistants">;
    importBatch: ReturnType<typeof useMutation<typeof api.contacts.importBatch>>;
    onClose: () => void;
}) {
    const parseExcel = useAction(api.ai.parseExcel);
    const [country, setCountry] = useState<SupportedCountry>("UY");
    const [parsing, setParsing] = useState(false);
    const [excelData, setExcelData] = useState<{ headers: string[]; rows: unknown[][] } | null>(null);
    const [nameCol, setNameCol] = useState<string | null>(null);
    const [phoneCol, setPhoneCol] = useState<string | null>(null);
    const [emailCol, setEmailCol] = useState<string | null>(null);
    const [extraCols, setExtraCols] = useState<string[]>([]);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<{ ok: number; updated: number; skipped: number } | null>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !importing) onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, importing]);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParsing(true);
        try {
            const buffer = await file.arrayBuffer();
            const parsed = await parseExcel({ fileBuffer: buffer });
            const data = (parsed?.sheets[0]?.rowChunks ?? []).flat();
            if (!data || data.length < 2) { toast.error("El archivo está vacío o sin datos."); return; }
            const headers = data[0] as string[];
            setExcelData({ headers, rows: data.slice(1) });
            // Auto-detect columns
            const autoName = headers.find(h => /^(nombre|name|cliente|contact)/i.test(h.trim())) ?? null;
            const autoPhone = headers.find(h => /^(tel[eé]fono|tel|phone|celular|m[oó]vil|whatsapp)/i.test(h.trim())) ?? null;
            const autoEmail = headers.find(h => /^(email|correo|e-?mail|mail)/i.test(h.trim())) ?? null;
            setNameCol(autoName);
            setPhoneCol(autoPhone);
            setEmailCol(autoEmail);
            setExtraCols([]);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al leer el archivo.");
        } finally {
            setParsing(false);
            e.target.value = "";
        }
    };

    const toggleExtra = (h: string) => {
        setExtraCols(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
    };

    const handleImport = async () => {
        if (!excelData || !nameCol || (!phoneCol && !emailCol)) {
            toast.error("Seleccioná la columna de nombre y al menos una de teléfono o email.");
            return;
        }
        const nameIdx = excelData.headers.indexOf(nameCol);
        const phoneIdx = phoneCol ? excelData.headers.indexOf(phoneCol) : -1;
        const emailIdx = emailCol ? excelData.headers.indexOf(emailCol) : -1;
        const extraIdxs = extraCols.map(c => ({ col: c, idx: excelData.headers.indexOf(c) }));

        const rows = excelData.rows
            .map(row => {
                const r = row as unknown[];
                const name = String(r[nameIdx] ?? "").trim();
                const phone = phoneIdx >= 0 ? String(r[phoneIdx] ?? "").trim() : "";
                const email = emailIdx >= 0 ? String(r[emailIdx] ?? "").trim() : "";
                if (!name || (!phone && !email)) return null;
                const extras: Record<string, string> = {};
                for (const { col, idx } of extraIdxs) {
                    const val = String(r[idx] ?? "").trim();
                    if (val) extras[col] = val;
                }
                // Si la fila trae phone Y email, priorizamos phone como identidad.
                return {
                    name,
                    phone: phone || undefined,
                    email: !phone && email ? email : undefined,
                    extras: Object.keys(extras).length ? extras : undefined,
                };
            })
            .filter(Boolean) as { name: string; phone?: string; email?: string; extras?: Record<string, string> }[];

        if (rows.length === 0) { toast.error("No hay filas con datos válidos."); return; }

        setImporting(true);
        setProgress({ done: 0, total: rows.length });
        let totalOk = 0, totalUpdated = 0, totalSkipped = 0;

        for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
            const batch = rows.slice(i, i + IMPORT_BATCH);
            try {
                const r = await importBatch({ assistantId, contacts: batch, countryHint: country });
                totalOk += r.ok;
                totalUpdated += r.updated;
                totalSkipped += r.skipped;
            } catch {
                totalSkipped += batch.length;
            }
            setProgress({ done: Math.min(i + IMPORT_BATCH, rows.length), total: rows.length });
        }

        setResult({ ok: totalOk, updated: totalUpdated, skipped: totalSkipped });
        setImporting(false);
    };

    return (
        <div className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200 sm:rounded-2xl">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Importar desde Excel</h3>
                    <button onClick={onClose} disabled={importing}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors disabled:opacity-40">
                        <FaXmark className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                    {result ? (
                        /* Resultado final */
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                                <FaCircleCheck className="w-5 h-5" />
                                Importación completada
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                                {result.ok > 0 && <p>✓ {result.ok} contacto{result.ok !== 1 ? "s" : ""} nuevo{result.ok !== 1 ? "s" : ""}</p>}
                                {result.updated > 0 && <p>✓ {result.updated} actualizado{result.updated !== 1 ? "s" : ""}</p>}
                                {result.skipped > 0 && <p>✗ {result.skipped} omitido{result.skipped !== 1 ? "s" : ""} (sin nombre o teléfono)</p>}
                            </div>
                            <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
                        </div>
                    ) : !excelData ? (
                        /* Paso 1: subir archivo */
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">País de los contactos</label>
                                <CountrySelect value={country} onChange={setCountry} />
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Usado para normalizar números locales (ej: 099123123 → +598...).
                                </p>
                            </div>
                            <div className="flex flex-col items-center text-center gap-5 py-8">
                                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                    <FaFileExcel className="w-7 h-7" />
                                </div>
                                <div>
                                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">Cargar archivo Excel</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                                        Subí un archivo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.xlsx</code> con columnas de nombre y teléfono.
                                    </p>
                                </div>
                                <label className="cursor-pointer">
                                    <div className={cn("btn-primary inline-flex items-center gap-2 px-6", parsing && "opacity-70 cursor-wait")}>
                                        {parsing ? <><FaSpinner className="animate-spin w-4 h-4" /> Procesando...</> : <><FaPlus className="w-3.5 h-3.5" /> Seleccionar archivo</>}
                                    </div>
                                    <input type="file" accept=".xlsx" className="hidden" onChange={handleFile} disabled={parsing} />
                                </label>
                            </div>
                        </div>
                    ) : (
                        /* Paso 2: mapear columnas */
                        <div className="space-y-5">
                            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                <FaCircleCheck className="w-4 h-4" />
                                {excelData.rows.length} fila{excelData.rows.length !== 1 ? "s" : ""} detectada{excelData.rows.length !== 1 ? "s" : ""}
                            </div>

                            {/* País */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">País</label>
                                <CountrySelect value={country} onChange={setCountry} />
                            </div>

                            {/* Nombre col */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Columna de <span className="text-primary">Nombre</span> <span className="text-red-500">*</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {excelData.headers.map(h => (
                                        <button key={h} type="button" onClick={() => setNameCol(h)}
                                            className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all",
                                                nameCol === h
                                                    ? "bg-primary/10 border-primary text-primary font-medium"
                                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300")}>
                                            {h || "(sin nombre)"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Phone col */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Columna de <span className="text-primary">Teléfono</span> <span className="text-slate-400 text-xs">(opcional si hay email)</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {excelData.headers.map(h => (
                                        <button key={h} type="button" onClick={() => setPhoneCol(phoneCol === h ? null : h)}
                                            className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all",
                                                phoneCol === h
                                                    ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-medium"
                                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300")}>
                                            {h || "(sin nombre)"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Email col */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Columna de <span className="text-primary">Email</span> <span className="text-slate-400 text-xs">(opcional si hay teléfono)</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {excelData.headers.map(h => (
                                        <button key={h} type="button" onClick={() => setEmailCol(emailCol === h ? null : h)}
                                            className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all",
                                                emailCol === h
                                                    ? "bg-amber-100 dark:bg-amber-900/30 border-amber-500 text-amber-700 dark:text-amber-400 font-medium"
                                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300")}>
                                            {h || "(sin nombre)"}
                                        </button>
                                    ))}
                                </div>
                                {phoneCol && emailCol && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Si una fila trae ambos, se prioriza el teléfono como identidad del contacto.
                                    </p>
                                )}
                            </div>

                            {/* Extras */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Columnas adicionales (datos extra)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {excelData.headers
                                        .filter(h => h !== nameCol && h !== phoneCol && h !== emailCol)
                                        .map(h => (
                                            <button key={h} type="button" onClick={() => toggleExtra(h)}
                                                className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all",
                                                    extraCols.includes(h)
                                                        ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-400 text-indigo-700 dark:text-indigo-400 font-medium"
                                                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300")}>
                                                {h}
                                            </button>
                                        ))}
                                </div>
                            </div>

                            {/* Preview */}
                            {nameCol && (phoneCol || emailCol) && excelData.rows.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Vista previa — primera fila</p>
                                    <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono space-y-1">
                                        <p>Nombre: {String((excelData.rows[0] as unknown[])[excelData.headers.indexOf(nameCol)] ?? "—")}</p>
                                        {phoneCol && (() => {
                                            const raw = String((excelData.rows[0] as unknown[])[excelData.headers.indexOf(phoneCol)] ?? "");
                                            if (!raw) return <p>Teléfono: <span className="text-slate-500">—</span></p>;
                                            const result = parsePhone(raw, country);
                                            return result.ok
                                                ? <p>Teléfono: {raw} → <span className="text-emerald-400">+{result.phone}</span></p>
                                                : <p>Teléfono: {raw} → <span className="text-red-400">✗ {result.error}</span></p>;
                                        })()}
                                        {emailCol && (() => {
                                            const raw = String((excelData.rows[0] as unknown[])[excelData.headers.indexOf(emailCol)] ?? "");
                                            if (!raw) return <p>Email: <span className="text-slate-500">—</span></p>;
                                            const result = parseEmail(raw);
                                            return result.ok
                                                ? <p>Email: {raw} → <span className="text-amber-400">{result.email}</span></p>
                                                : <p>Email: {raw} → <span className="text-red-400">✗ {result.error}</span></p>;
                                        })()}
                                        {extraCols.map(c => (
                                            <p key={c}>{c}: {String((excelData.rows[0] as unknown[])[excelData.headers.indexOf(c)] ?? "—")}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Progress */}
                            {importing && progress && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                                        <span className="flex items-center gap-2">
                                            <FaSpinner className="animate-spin w-3.5 h-3.5" />
                                            Importando...
                                        </span>
                                        <span>{progress.done} / {progress.total}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary transition-all duration-300 rounded-full"
                                            style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" onClick={() => setExcelData(null)} disabled={importing}
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                                    Cambiar archivo
                                </button>
                                <button type="button" onClick={handleImport}
                                    disabled={importing || !nameCol || (!phoneCol && !emailCol)}
                                    className={cn("btn-primary flex-1", (importing || !nameCol || (!phoneCol && !emailCol)) && "opacity-70 cursor-not-allowed")}>
                                    {importing
                                        ? <span className="flex items-center justify-center gap-2"><FaSpinner className="animate-spin w-3.5 h-3.5" />Importando...</span>
                                        : "Iniciar importación"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
