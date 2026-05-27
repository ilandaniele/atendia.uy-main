import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "react-toastify";
import {
    FaGoogleDrive,
    FaPlus,
    FaTrash,
    FaRotate,
    FaFileExcel,
    FaFilePdf,
    FaFileLines,
    FaTable,
    FaSpinner,
    FaCircleCheck,
    FaTriangleExclamation,
    FaLink,
    FaUpRightFromSquare,
} from "react-icons/fa6";
import { cn } from "utils/utils";

type Props = {
    clientId: Id<"clients">;
    isOwner: boolean;
    /** From client.config.driveSyncIntervalMinutes — falls back to 15 if undefined */
    intervalMinutes: number;
};

const INTERVAL_OPTIONS = [5, 15, 30, 60] as const;

export default function GoogleDriveTab({ clientId, isOwner, intervalMinutes }: Props) {
    const status = useQuery(api.googleDriveDb.getStatus);
    const linkedFiles = useQuery(api.googleDriveDb.listForClient, { clientId });
    const userProfile = useQuery(api.profiles.me);

    const disconnect = useMutation(api.googleDriveDb.disconnectDrive);
    const unlinkFile = useMutation(api.googleDriveDb.unlinkFile);
    const updateInterval = useMutation(api.googleDriveDb.updateSyncInterval);
    const linkFile = useAction(api.googleDrive.linkFile);
    const manualSync = useMutation(api.googleDriveDb.manualSync);
    const saveToken = useMutation(api.googleDriveDb.saveDriveToken);

    const [searchParams, setSearchParams] = useSearchParams();
    const [isExchanging, setIsExchanging] = useState(false);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [intervalSaving, setIntervalSaving] = useState(false);

    // Handle OAuth callback redirect
    useEffect(() => {
        const gdriveParam = searchParams.get("gdrive");
        if (!gdriveParam) return;

        if (gdriveParam === "error") {
            toast.error("No se pudo conectar Google Drive. Intentalo de nuevo.");
            const next = new URLSearchParams(searchParams);
            next.delete("gdrive");
            setSearchParams(next, { replace: true });
            return;
        }

        if (gdriveParam === "ok" && !isExchanging) {
            setIsExchanging(true);
            (async () => {
                try {
                    const res = await fetch("/api/google-drive/exchange", { method: "POST" });
                    if (!res.ok) throw new Error("Exchange failed");
                    const { refreshToken, email } = (await res.json()) as {
                        refreshToken: string;
                        email?: string;
                    };
                    await saveToken({ refreshToken, email });
                    toast.success("Google Drive conectado.");
                } catch (err) {
                    console.error("[GDrive] exchange error:", err);
                    toast.error("Error al guardar la conexión. Reintentá.");
                } finally {
                    setIsExchanging(false);
                    const next = new URLSearchParams(searchParams);
                    next.delete("gdrive");
                    setSearchParams(next, { replace: true });
                }
            })();
        }
    }, [searchParams, setSearchParams, saveToken, isExchanging]);

    const handleConnect = () => {
        if (!userProfile?._id) return;
        window.location.href = `/api/google-drive/auth?profileId=${userProfile._id}`;
    };

    const handleDisconnect = async () => {
        if (!confirm("¿Desconectar Google Drive? Los archivos vinculados se desactivarán.")) return;
        try {
            await disconnect();
            toast.success("Google Drive desconectado.");
        } catch {
            toast.error("No se pudo desconectar.");
        }
    };

    const handleUnlink = async (linkId: Id<"linked_drive_files">, name: string) => {
        if (!confirm(`¿Desvincular "${name}"? Los datos ya importados quedan en la base de conocimiento.`)) return;
        try {
            await unlinkFile({ linkId });
            toast.success("Archivo desvinculado.");
        } catch {
            toast.error("No se pudo desvincular.");
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

    const handleIntervalChange = async (newInterval: number) => {
        const valid = (INTERVAL_OPTIONS as readonly number[]).includes(newInterval);
        if (!valid) return;
        setIntervalSaving(true);
        try {
            await updateInterval({
                clientId,
                intervalMinutes: newInterval as 5 | 15 | 30 | 60,
            });
            toast.success(`Frecuencia actualizada a cada ${newInterval} minutos.`);
        } catch {
            toast.error("No se pudo actualizar la frecuencia.");
        } finally {
            setIntervalSaving(false);
        }
    };

    if (status === undefined) {
        return (
            <div className="flex items-center justify-center py-12">
                <FaSpinner className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Connection state */}
            <ConnectionBlock
                connected={status.connected}
                email={status.email}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                isExchanging={isExchanging}
            />

            {/* Interval config (owner-only) */}
            {status.connected && isOwner && (
                <IntervalBlock
                    current={intervalMinutes}
                    saving={intervalSaving}
                    onChange={handleIntervalChange}
                />
            )}

            {/* Linked files */}
            {status.connected && (
                <LinkedFilesBlock
                    files={linkedFiles}
                    onLinkNew={() => setLinkModalOpen(true)}
                    onSync={handleSync}
                    onUnlink={handleUnlink}
                />
            )}

            {/* Link modal */}
            {linkModalOpen && (
                <LinkFileModal
                    clientId={clientId}
                    onClose={() => setLinkModalOpen(false)}
                    onLinkFile={async (driveUrl, kbId) => {
                        const result = await linkFile({
                            clientId,
                            knowledgeBaseId: kbId,
                            driveUrlOrId: driveUrl,
                        });
                        return result;
                    }}
                />
            )}
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConnectionBlock({
    connected,
    email,
    onConnect,
    onDisconnect,
    isExchanging,
}: {
    connected: boolean;
    email: string | null;
    onConnect: () => void;
    onDisconnect: () => void;
    isExchanging: boolean;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                        <FaGoogleDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {connected ? "Google Drive conectado" : "Conectar Google Drive"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {connected && email
                                ? email
                                : "Vinculá archivos de Drive y mantenelos sincronizados automáticamente."}
                        </p>
                    </div>
                </div>
                {connected ? (
                    <button
                        type="button"
                        onClick={onDisconnect}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Desconectar
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onConnect}
                        disabled={isExchanging}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {isExchanging ? (
                            <FaSpinner className="w-4 h-4 animate-spin" />
                        ) : (
                            <FaGoogleDrive className="w-4 h-4" />
                        )}
                        Conectar Drive
                    </button>
                )}
            </div>
        </div>
    );
}

function IntervalBlock({
    current,
    saving,
    onChange,
}: {
    current: number;
    saving: boolean;
    onChange: (v: number) => Promise<void>;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Frecuencia de sincronización
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Cada cuántos minutos Atendia revisa los archivos vinculados en Drive.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={current}
                        disabled={saving}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                    >
                        {INTERVAL_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                                Cada {m} min
                            </option>
                        ))}
                    </select>
                    {saving && <FaSpinner className="w-4 h-4 text-slate-400 animate-spin" />}
                </div>
            </div>
        </div>
    );
}

function LinkedFilesBlock({
    files,
    onLinkNew,
    onSync,
    onUnlink,
}: {
    files: Array<{
        _id: Id<"linked_drive_files">;
        driveFileName: string;
        driveWebViewLink?: string;
        fileKind: "excel" | "gsheet" | "gdoc" | "pdf";
        knowledgeBaseName: string;
        isActive: boolean;
        lastSyncedAt?: number;
        lastSyncError?: string;
        syncCount: number;
    }> | undefined;
    onLinkNew: () => void;
    onSync: (id: Id<"linked_drive_files">) => void;
    onUnlink: (id: Id<"linked_drive_files">, name: string) => void;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Archivos vinculados
                </p>
                <button
                    type="button"
                    onClick={onLinkNew}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                    <FaPlus className="w-3 h-3" />
                    Vincular archivo
                </button>
            </div>

            {files === undefined ? (
                <div className="flex justify-center py-6">
                    <FaSpinner className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
            ) : files.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                    No hay archivos vinculados todavía.
                </div>
            ) : (
                <div className="space-y-2">
                    {files.map((f) => (
                        <FileRow
                            key={f._id}
                            file={f}
                            onSync={() => onSync(f._id)}
                            onUnlink={() => onUnlink(f._id, f.driveFileName)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FileRow({
    file,
    onSync,
    onUnlink,
}: {
    file: {
        _id: Id<"linked_drive_files">;
        driveFileName: string;
        driveWebViewLink?: string;
        fileKind: "excel" | "gsheet" | "gdoc" | "pdf";
        knowledgeBaseName: string;
        isActive: boolean;
        lastSyncedAt?: number;
        lastSyncError?: string;
        syncCount: number;
    };
    onSync: () => void;
    onUnlink: () => void;
}) {
    const Icon =
        file.fileKind === "excel"
            ? FaFileExcel
            : file.fileKind === "gsheet"
                ? FaTable
                : file.fileKind === "gdoc"
                    ? FaFileLines
                    : FaFilePdf;

    const lastSyncedLabel = useMemo(() => {
        if (file.lastSyncError) return `Error: ${file.lastSyncError}`;
        if (!file.lastSyncedAt) return "Pendiente de primera sincronización";
        const ageMs = Date.now() - file.lastSyncedAt;
        const minutes = Math.floor(ageMs / 60000);
        if (minutes < 1) return "Sincronizado hace unos segundos";
        if (minutes < 60) return `Sincronizado hace ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Sincronizado hace ${hours} h`;
        const days = Math.floor(hours / 24);
        return `Sincronizado hace ${days} d`;
    }, [file.lastSyncedAt, file.lastSyncError]);

    return (
        <div
            className={cn(
                "rounded-xl border p-3 flex items-center gap-3 transition-colors",
                file.lastSyncError
                    ? "border-amber-200 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10"
                    : !file.isActive
                        ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 opacity-60"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
            )}
        >
            <Icon className="w-5 h-5 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {file.driveFileName}
                    </p>
                    {file.driveWebViewLink && (
                        <a
                            href={file.driveWebViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-primary shrink-0"
                            title="Abrir en Drive"
                        >
                            <FaUpRightFromSquare className="w-3 h-3" />
                        </a>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {file.knowledgeBaseName}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span
                        className={cn(
                            "text-xs flex items-center gap-1",
                            file.lastSyncError
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-slate-500 dark:text-slate-400",
                        )}
                    >
                        {file.lastSyncError ? (
                            <FaTriangleExclamation className="w-3 h-3" />
                        ) : file.lastSyncedAt ? (
                            <FaCircleCheck className="w-3 h-3 text-emerald-500" />
                        ) : (
                            <FaSpinner className="w-3 h-3" />
                        )}
                        {lastSyncedLabel}
                    </span>
                    {file.syncCount > 0 && (
                        <span className="text-xs text-slate-400">
                            ({file.syncCount} sync{file.syncCount === 1 ? "" : "s"})
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <button
                    type="button"
                    onClick={onSync}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-colors"
                    title="Sincronizar ahora"
                >
                    <FaRotate className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={onUnlink}
                    className="p-2 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                    title="Desvincular"
                >
                    <FaTrash className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

function LinkFileModal({
    clientId,
    onClose,
    onLinkFile,
}: {
    clientId: Id<"clients">;
    onClose: () => void;
    onLinkFile: (
        driveUrl: string,
        kbId: Id<"knowledge_bases">,
    ) => Promise<{ ok: true; linkId: Id<"linked_drive_files"> } | { ok: false; error: string }>;
}) {
    const kbs = useQuery(api.knowledgeBases.getByClient, { clientId });
    const [url, setUrl] = useState("");
    const [kbId, setKbId] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!url.trim() || !kbId) return;
        setSubmitting(true);
        try {
            const result = await onLinkFile(url.trim(), kbId as Id<"knowledge_bases">);
            if (result.ok) {
                toast.success("Archivo vinculado. Sincronizando…");
                onClose();
            } else {
                toast.error(humanizeLinkError(result.error));
            }
        } catch (err) {
            console.error("[GDrive] link error:", err);
            toast.error("No se pudo vincular el archivo.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                        <FaLink className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Vincular archivo de Drive
                    </h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">
                            URL del archivo de Google Drive
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Pegá la URL desde el navegador. Soportamos Excel, Sheets, Docs y PDFs.
                        </p>
                    </div>

                    <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">
                            Base de conocimiento destino
                        </label>
                        <select
                            value={kbId}
                            onChange={(e) => setKbId(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="">Seleccioná una base…</option>
                            {kbs?.map((kb) => (
                                <option key={kb._id} value={kb._id}>
                                    {kb.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !url.trim() || !kbId}
                        className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting && <FaSpinner className="w-3.5 h-3.5 animate-spin" />}
                        Vincular
                    </button>
                </div>
            </div>
        </div>
    );
}

function humanizeLinkError(code: string): string {
    if (code === "drive_not_connected") return "Conectá Google Drive primero.";
    if (code === "invalid_url") return "La URL no es de un archivo de Google Drive válido.";
    if (code === "knowledge_base_not_found") return "La base de conocimiento seleccionada no existe.";
    if (code === "pdf_unsupported") return "PDFs aún no están soportados (próximamente). Por ahora podés vincular Excel, Sheets y Docs.";
    if (code.startsWith("unsupported_mime")) return "Ese tipo de archivo no está soportado (solo Excel, Sheets y Docs por ahora).";
    if (code.startsWith("drive_fetch_failed")) return "Atendia no pudo leer el archivo. Verificá los permisos de Drive.";
    return "No se pudo vincular el archivo.";
}
