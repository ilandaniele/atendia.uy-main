import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { FaBug, FaXmark, FaCopy, FaArrowRotateRight, FaCode, FaUserSecret, FaArrowRightFromBracket, FaDatabase } from "react-icons/fa6";
import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";

type ImpersonationInfo = {
    sessionId: Id<"impersonation_sessions">;
    startedAt: number;
    expiresAt: number;
    adminProfile: {
        _id: Id<"profiles">;
        name: string;
        email: string;
        pictureUrl?: string;
    };
    targetProfile: {
        _id: Id<"profiles">;
        name: string;
        email: string;
        pictureUrl?: string;
        role: "admin" | "user";
        status?: "active" | "inactive" | "suspended";
    };
};

type Props = {
    impersonation: ImpersonationInfo;
    client: Doc<"clients"> | null | undefined;
    activeMember: Doc<"client_members"> | null | undefined;
};

export default function DebugPanel({ impersonation, client, activeMember }: Props) {
    const [open, setOpen] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const [showSnapshot, setShowSnapshot] = useState(false);
    const navigate = useNavigate();
    const endImpersonation = useMutation(api.impersonation.end);

    const snapshot = useQuery(
        api.impersonation.getClientSnapshot,
        showSnapshot && client?._id ? { clientId: client._id } : "skip"
    );

    const expiresIn = Math.max(0, Math.floor((impersonation.expiresAt - Date.now()) / 60_000));

    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copiado`, { autoClose: 1500 });
        } catch {
            toast.error("No se pudo copiar");
        }
    };

    const copyContext = async () => {
        const ctx = {
            sessionId: impersonation.sessionId,
            admin: impersonation.adminProfile,
            target: impersonation.targetProfile,
            client: client ? {
                _id: client._id,
                name: client.name,
                businessName: client.businessName,
                isActive: client.isActive,
                plan: client.plan,
                tokensBalance: client.tokensBalance,
                trialEndsAt: client.trialEndsAt,
                features: client.features,
            } : null,
            membership: activeMember ? {
                _id: activeMember._id,
                role: activeMember.role,
            } : null,
        };
        await copy(JSON.stringify(ctx, null, 2), "Contexto");
    };

    const handleEndImpersonation = async () => {
        try {
            await endImpersonation();
            toast.success("Sesión de impersonación terminada");
            navigate(`/administracion/usuarios/${impersonation.targetProfile._id}`);
        } catch {
            toast.error("No se pudo terminar la sesión");
        }
    };

    return (
        <>
            {/* Botón flotante (cuando está cerrado) */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    aria-label="Abrir panel de debugging"
                    className="fixed bottom-4 right-4 z-[200] w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg flex items-center justify-center transition-colors"
                >
                    <FaBug className="w-5 h-5" />
                </button>
            )}

            {/* Panel expandido */}
            {open && (
                <div className="fixed bottom-4 right-4 z-[200] w-[360px] max-w-[calc(100vw-2rem)] max-h-[80vh] bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-purple-600 text-white">
                        <div className="flex items-center gap-2 min-w-0">
                            <FaUserSecret className="w-4 h-4 shrink-0" />
                            <span className="text-sm font-bold truncate">Modo impersonación</span>
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            aria-label="Cerrar panel"
                            className="p-1 rounded hover:bg-white/20 transition-colors shrink-0"
                        >
                            <FaXmark className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-700 dark:text-slate-300">
                        <Section title="Sesión">
                            <Row label="Admin real" value={`${impersonation.adminProfile.name} (${impersonation.adminProfile.email})`} />
                            <Row label="Target" value={`${impersonation.targetProfile.name} (${impersonation.targetProfile.email})`} />
                            <Row label="Expira en" value={`${expiresIn} min`} />
                            <CopyableId label="sessionId" id={impersonation.sessionId} onCopy={copy} />
                        </Section>

                        <Section title="Perfil objetivo">
                            <CopyableId label="profileId" id={impersonation.targetProfile._id} onCopy={copy} />
                            <Row label="Rol global" value={impersonation.targetProfile.role} />
                            <Row label="Estado" value={impersonation.targetProfile.status ?? "active"} />
                        </Section>

                        <Section title="Cliente activo">
                            {client ? (
                                <>
                                    <CopyableId label="clientId" id={client._id} onCopy={copy} />
                                    <Row label="Nombre" value={client.businessName} />
                                    <Row label="isActive" value={client.isActive ? "sí" : "no"} />
                                    <Row label="Tokens" value={client.tokensBalance.toLocaleString()} />
                                    {client.plan && <CopyableId label="planId" id={client.plan} onCopy={copy} />}
                                    {client.trialEndsAt && (
                                        <Row label="Trial vence" value={new Date(client.trialEndsAt).toLocaleDateString("es-UY")} />
                                    )}
                                    <Row label="Agenda" value={client.features.enableAgenda ? "on" : "off"} />
                                    <Row label="Pedidos" value={client.features.enableOrders ? "on" : "off"} />
                                </>
                            ) : (
                                <p className="italic text-slate-500">Sin cliente activo</p>
                            )}
                        </Section>

                        <Section title="Membresía">
                            {activeMember ? (
                                <>
                                    <CopyableId label="memberId" id={activeMember._id} onCopy={copy} />
                                    <Row label="Rol en cliente" value={activeMember.role} />
                                </>
                            ) : (
                                <p className="italic text-slate-500">Sin membresía activa</p>
                            )}
                        </Section>
                    </div>

                    {/* Acciones */}
                    <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <ActionButton onClick={() => window.location.reload()} icon={<FaArrowRotateRight />} label="Recargar" />
                            <ActionButton onClick={copyContext} icon={<FaCopy />} label="Copiar ctx" />
                            <ActionButton onClick={() => setShowJson(true)} icon={<FaCode />} label="Ver cliente" />
                            <ActionButton onClick={() => setShowSnapshot(true)} icon={<FaDatabase />} label="Snapshot completo" />
                        </div>
                        <button
                            onClick={handleEndImpersonation}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 text-xs font-semibold transition-colors"
                        >
                            <FaArrowRightFromBracket className="w-3.5 h-3.5" />
                            Salir de impersonación
                        </button>
                    </div>
                </div>
            )}

            {/* Dialog JSON — solo datos del cliente doc */}
            {showJson && (
                <div
                    className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4"
                    onClick={() => setShowJson(false)}
                >
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Datos del cliente (JSON crudo)</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => copy(JSON.stringify(client ?? {}, null, 2), "JSON del cliente")}
                                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
                                    aria-label="Copiar JSON"
                                >
                                    <FaCopy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setShowJson(false)}
                                    aria-label="Cerrar"
                                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <FaXmark className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <pre className="flex-1 overflow-auto p-4 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap">
                            {JSON.stringify(client ?? { client: null }, null, 2)}
                        </pre>
                    </div>
                </div>
            )}

            {/* Dialog snapshot completo */}
            {showSnapshot && (
                <div
                    className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4"
                    onClick={() => setShowSnapshot(false)}
                >
                    <div
                        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <FaDatabase className="w-4 h-4 text-purple-600" />
                                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Snapshot completo del cliente</h3>
                                {!snapshot && <span className="text-xs text-slate-400 italic">Cargando…</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                {snapshot && (
                                    <button
                                        onClick={() => copy(JSON.stringify(snapshot, null, 2), "Snapshot completo")}
                                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
                                        aria-label="Copiar snapshot"
                                    >
                                        <FaCopy className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowSnapshot(false)}
                                    aria-label="Cerrar"
                                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <FaXmark className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {snapshot ? (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {/* Barra de resumen */}
                                <div className="flex flex-wrap gap-3 px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900/30 text-xs text-purple-700 dark:text-purple-300">
                                    <span><strong>{snapshot.channels.length}</strong> canales</span>
                                    <span><strong>{snapshot.assistants.length}</strong> asistentes</span>
                                    <span><strong>{snapshot.knowledgeBases.length}</strong> bases de conocimiento</span>
                                    <span><strong>{snapshot.members.length}</strong> miembros</span>
                                    <span><strong>{snapshot.assistants.reduce((sum, a) => sum + a.contactsCount, 0)}</strong> contactos totales</span>
                                </div>
                                <pre className="flex-1 overflow-auto p-4 text-xs bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap">
                                    {JSON.stringify(snapshot, null, 2)}
                                </pre>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h4 className="text-[10px] uppercase tracking-wider font-bold text-purple-600 dark:text-purple-400 mb-1.5">
                {title}
            </h4>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{value}</span>
        </div>
    );
}

function CopyableId({ label, id, onCopy }: { label: string; id: string; onCopy: (v: string, l: string) => void }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <button
                onClick={() => onCopy(id, label)}
                className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors min-w-0"
                title="Copiar"
            >
                <span className="truncate">{id}</span>
                <FaCopy className="w-3 h-3 shrink-0 opacity-60" />
            </button>
        </div>
    );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium transition-colors"
        >
            <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
            {label}
        </button>
    );
}
