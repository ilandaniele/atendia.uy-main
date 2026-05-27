import { api } from "convex/_generated/api";
import { useQuery, useMutation, useAction } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { FaPlay, FaPause, FaSpinner, FaPaperPlane, FaRobot, FaUser, FaMessage, FaBan, FaBoxArchive, FaArrowRotateLeft, FaTrash, FaChevronLeft, FaEllipsisVertical, FaUserPlus, FaXmark, FaWhatsapp, FaGlobe, FaAddressBook, FaTriangleExclamation, FaUserTie, FaBoxOpen, FaCalendarPlus, FaPlus, FaMinus, FaCopy } from "react-icons/fa6";
import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { cn } from "utils/utils";
import type { Id } from "convex/_generated/dataModel";
import { toast } from "react-toastify";
import { useDebugCopyId } from "./hooks/useDebugCopyId";

// ── Reproductor de notas de voz ──────────────────────────────────────────────
// Pide el audio al endpoint /api/media con el token Convex en el header,
// lo convierte a blob URL y lo monta en un <audio>. No descarga si Whapi
// ya expiró el media (404 → muestra "no disponible").
function VoicePlayer({ channelId, mediaId }: { channelId: string; mediaId: string }) {
    const authToken = useAuthToken();
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!authToken) return;
        let cancelled = false;
        let blobUrl: string | null = null;
        setLoading(true);
        setError(false);
        fetch(`/api/media/${channelId}/${encodeURIComponent(mediaId)}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                if (cancelled) return;
                blobUrl = URL.createObjectURL(blob);
                setSrc(blobUrl);
            })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [authToken, channelId, mediaId]);

    if (loading) return <div className="text-xs italic opacity-70 flex items-center gap-1"><FaSpinner className="animate-spin w-3 h-3" /> Cargando audio…</div>;
    if (error || !src) return <div className="text-xs italic opacity-70">🎤 Audio no disponible</div>;
    return <audio controls src={src} className="max-w-[280px] h-10" preload="metadata" />;
}

export function meta() {
    return [
        { title: "Mensajes - Atendia" },
    ];
}

type ConvStatus = "ACTIVE" | "PAUSED" | "IGNORED" | "ARCHIVED";
type SidebarTab = "active" | "mine" | "archived" | "ignored";

const formatPhone = (phone: string) => `+${phone.split('@')[0]}`;

const formatIdentifier = (state: { phone?: string; sessionId?: string }) => {
    if (state.phone) return formatPhone(state.phone);
    if (state.sessionId) return `Web #${state.sessionId.slice(0, 8)}`;
    return "Desconocido";
};

const STATUS_LABEL: Record<ConvStatus, string> = {
    ACTIVE: "Asistente activo",
    PAUSED: "Asistente pausado",
    IGNORED: "Ignorada",
    ARCHIVED: "Archivada",
};

const STATUS_DOT: Record<ConvStatus, string> = {
    ACTIVE: "bg-green-500",
    PAUSED: "bg-yellow-500",
    IGNORED: "bg-orange-500",
    ARCHIVED: "bg-slate-400",
};

export default function UserChats() {
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;
    const isOwner = activeClientMember?.role === "owner";
    const debugCopyId = useDebugCopyId();
    const client = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");

    const channels = useQuery(api.channels.getByClient, clientId ? { clientId } : "skip");
    const allStates = useQuery(api.conversationStates.getByClient, clientId ? { clientId } : "skip");
    const allChats = useQuery(api.chats.getByClient, clientId ? { clientId } : "skip");
    const membersWithProfiles = useQuery(api.clientMembers.getMembersWithProfiles, clientId ? { clientId } : "skip");
    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");

    const conversationPhones = useMemo(() => {
        if (!allStates) return [];
        const set = new Set<string>();
        for (const s of allStates) {
            if (!s.phone) continue;
            const clean = s.phone.split("@")[0];
            if (clean) set.add(clean);
        }
        return Array.from(set);
    }, [allStates]);

    const allContacts = useQuery(
        api.contacts.getByClientForPhones,
        clientId && allStates ? { clientId, phones: conversationPhones } : "skip"
    );

    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<SidebarTab>("active");
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
    const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
    const [isAssignMenuOpen, setIsAssignMenuOpen] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const assignMenuRef = useRef<HTMLDivElement>(null);

    // Audio
    const audioCtxRef = useRef<AudioContext | null>(null);
    const prevConvMsgCountsRef = useRef<Record<string, number>>({});
    const prevConvCountRef = useRef<number | null>(null);
    const selectedStateIdRef = useRef<string | null>(null);
    const chatsInitializedRef = useRef(false);

    const getAudioCtx = () => {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        return audioCtxRef.current;
    };

    const playNewMessageSound = () => {
        try {
            const ctx = getAudioCtx();
            [0, 0.12].forEach((delay) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = "sine";
                osc.frequency.setValueAtTime(660, ctx.currentTime + delay);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + delay + 0.08);
                gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.15);
            });
        } catch { /* audio bloqueado */ }
    };

    const playNewConversationSound = () => {
        try {
            const ctx = getAudioCtx();
            [1046, 880, 698].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
                gain.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.13);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.18);
                osc.start(ctx.currentTime + i * 0.13);
                osc.stop(ctx.currentTime + i * 0.13 + 0.18);
            });
        } catch { /* audio bloqueado */ }
    };

    // Todas las conversaciones enriquecidas con chats
    const conversations = useMemo(() => {
        if (!channels || !allStates || !allChats) return [];
        const channelIds = channels.map(c => c._id);
        return allStates
            .filter(s => channelIds.includes(s.channel))
            .map(state => {
                const stateChats = allChats
                    .filter(c => c.channelId === state.channel && (state.phone ? c.phone === state.phone : c.sessionId === state.sessionId))
                    .sort((a, b) => b._creationTime - a._creationTime);
                const lastMessage = stateChats.find(c => c.role !== "event");
                return { ...state, lastMessage, chats: stateChats.reverse() };
            })
            .sort((a, b) => {
                const tA = a.lastMessage?._creationTime || a._creationTime;
                const tB = b.lastMessage?._creationTime || b._creationTime;
                return tB - tA;
            });
    }, [channels, allStates, allChats]);

    const activeConversations = useMemo(
        () => conversations.filter(c => c.status === "ACTIVE" || c.status === "PAUSED"),
        [conversations]
    );
    const myConversations = useMemo(
        () => conversations.filter(c =>
            (c.status === "ACTIVE" || c.status === "PAUSED") &&
            userProfile && c.assignedTo === userProfile._id
        ),
        [conversations, userProfile]
    );
    const archivedConversations = useMemo(
        () => conversations.filter(c => c.status === "ARCHIVED"),
        [conversations]
    );
    const ignoredConversations = useMemo(
        () => conversations.filter(c => c.status === "IGNORED"),
        [conversations]
    );

    const channelMap = useMemo(
        () => new Map(channels?.map(c => [c._id, c]) ?? []),
        [channels]
    );
    const assistantMap = useMemo(
        () => new Map(assistants?.map(a => [a._id, a]) ?? []),
        [assistants]
    );
    // phone (no @suffix) → contact name, only for channels whose assistant has recognizeContacts
    const { contactMap, contactChannels } = useMemo(() => {
        const contactMap = new Map<string, string>();
        const contactChannels = new Set<string>();
        if (!allContacts || !assistants || !channels) return { contactMap, contactChannels };
        const recognizeIds = new Set(
            assistants.filter(a => (a as any).features?.recognizeContacts).map(a => a._id)
        );
        channels.filter(ch => recognizeIds.has((ch as any).assistant)).forEach(ch => contactChannels.add(ch._id));
        for (const c of allContacts) {
            if (c.phone) contactMap.set(c.phone, c.name);
        }
        return { contactMap, contactChannels };
    }, [allContacts, assistants, channels]);

    const getDisplayName = (conv: { phone?: string; sessionId?: string; channel: string }) => {
        if (conv.phone && contactChannels.has(conv.channel)) {
            const name = contactMap.get(conv.phone.split("@")[0]);
            if (name) return name;
        }
        return formatIdentifier(conv);
    };

    const tabConversations = activeTab === "mine" ? myConversations
        : activeTab === "active" ? activeConversations
        : activeTab === "archived" ? archivedConversations
        : ignoredConversations;

    const uniqueAssistants = useMemo(() => {
        if (!channels || !assistants) return [];
        const assistantIds = new Set(channels.map(ch => (ch as any).assistant).filter(Boolean));
        return assistants.filter(a => assistantIds.has(a._id));
    }, [channels, assistants]);

    const visibleConversations = useMemo(() => {
        let result = tabConversations;
        if (selectedChannelId) {
            result = result.filter(c => c.channel === selectedChannelId);
        }
        if (selectedAssistantId) {
            const channelsWithAssistant = new Set(
                channels?.filter(ch => (ch as any).assistant === selectedAssistantId).map(ch => ch._id) ?? []
            );
            result = result.filter(c => channelsWithAssistant.has(c.channel));
        }
        return result;
    }, [tabConversations, selectedChannelId, selectedAssistantId, channels]);

    const activeConversation = useMemo(
        () => conversations.find(c => c._id === selectedStateId) ?? null,
        [selectedStateId, conversations]
    );

    const [contactModalOpen, setContactModalOpen] = useState(false);
    const [createLeadOpen, setCreateLeadOpen] = useState(false);
    const [createOrderOpen, setCreateOrderOpen] = useState(false);
    const [createApptOpen, setCreateApptOpen] = useState(false);

    const activeConversationContact = useMemo(() => {
        if (!activeConversation?.phone || !allContacts) return null;
        const normalizedPhone = activeConversation.phone.split("@")[0];
        const ch = channelMap.get(activeConversation.channel);
        const assistantId = (ch as any)?.assistant as string | undefined;
        if (!assistantId) return null;
        return allContacts.find(c => c.phone === normalizedPhone && c.assistantId === assistantId) ?? null;
    }, [activeConversation, allContacts, channelMap]);

    useEffect(() => { setContactModalOpen(false); }, [selectedStateId]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-seleccionar conversación cuando se navega desde leads (?phone=...)
    useEffect(() => {
        const phoneParam = searchParams.get("phone");
        if (!phoneParam || !conversations.length || selectedStateId) return;

        const match = conversations.find(
            (c) => c.phone === phoneParam || c.sessionId === phoneParam
        );
        if (!match) return;

        // Cambiar al tab correcto según el estado de la conversación
        if (match.status === "ARCHIVED") setActiveTab("archived");
        else if (match.status === "IGNORED") setActiveTab("ignored");
        else setActiveTab("active");

        setSelectedStateId(match._id);
        // Limpiar el query param para no re-seleccionar en futuras cargas
        setSearchParams({}, { replace: true });
    }, [conversations, searchParams]);

    useEffect(() => {
        if (activeConversation?.chats.length) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [activeConversation?.chats.length, selectedStateId]);

    useEffect(() => { selectedStateIdRef.current = selectedStateId; }, [selectedStateId]);

    // Sonido: nuevo mensaje de usuario en conversación activa no seleccionada
    useEffect(() => {
        if (!activeConversations.length) return;
        let shouldPlay = false;
        activeConversations.forEach(conv => {
            const userMsgCount = conv.chats.filter(c => c.role === "user").length;
            const prev = prevConvMsgCountsRef.current[conv._id];
            if (prev !== undefined && userMsgCount > prev && conv._id !== selectedStateIdRef.current) {
                shouldPlay = true;
            }
            prevConvMsgCountsRef.current[conv._id] = userMsgCount;
        });
        if (shouldPlay) playNewMessageSound();
    }, [activeConversations]);

    // Sonido: conversación nueva
    useEffect(() => {
        if (allStates === undefined) return; // datos aún cargando
        const count = activeConversations.length;
        if (!chatsInitializedRef.current) {
            // Primera carga real: guardar baseline sin sonar
            chatsInitializedRef.current = true;
            prevConvCountRef.current = count;
            return;
        }
        if (prevConvCountRef.current !== null && count > prevConvCountRef.current) {
            playNewConversationSound();
        }
        prevConvCountRef.current = count;
    }, [activeConversations.length, allStates]);

    // Cerrar menús al hacer clic fuera
    useEffect(() => {
        if (!isActionsMenuOpen && !isAssignMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
                setIsActionsMenuOpen(false);
            }
            if (assignMenuRef.current && !assignMenuRef.current.contains(e.target as Node)) {
                setIsAssignMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isActionsMenuOpen, isAssignMenuOpen]);

    // Mutations
    const updateState = useMutation(api.conversationStates.update);
    const removeState = useMutation(api.conversationStates.remove);
    const bulkUpdateStatus = useMutation(api.conversationStates.bulkUpdateStatus);
    const bulkDeleteMutation = useMutation(api.conversationStates.bulkDelete);

    const [bulkLoading, setBulkLoading] = useState<"activate" | "pause" | "delete" | null>(null);

    const handleAssign = async (stateId: Id<"conversation_states">, profileId: Id<"profiles"> | null) => {
        try {
            await updateState({ id: stateId, assignedTo: profileId });
            setIsAssignMenuOpen(false);
            toast.success(profileId ? "Conversación asignada" : "Asignación eliminada");
        } catch {
            toast.error("Error al asignar conversación");
        }
    };

    const handleSetStatus = async (stateId: Id<"conversation_states">, status: ConvStatus, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            await updateState({ id: stateId, status });
            const labels: Record<ConvStatus, string> = {
                ACTIVE: "Conversación activada",
                PAUSED: "Asistente pausado",
                IGNORED: "Conversación ignorada",
                ARCHIVED: "Conversación archivada",
            };
            toast.success(labels[status]);
        } catch (error) {
            toast.error("Error al cambiar estado");
            console.error(error);
        }
    };

    const handleDeleteConversation = async () => {
        if (!selectedStateId || !isOwner) return;
        try {
            await removeState({ id: selectedStateId as Id<"conversation_states"> });
            setSelectedStateId(null);
            toast.success("Conversación eliminada");
        } catch (error) {
            toast.error("Error al eliminar conversación");
            console.error(error);
        }
    };

    const handleBulkActivate = async () => {
        const ids = visibleConversations
            .filter(c => c.status === "PAUSED")
            .map(c => c._id as Id<"conversation_states">);
        if (!ids.length || !clientId) return;
        if (!confirm(`¿Activar el asistente en ${ids.length} conversación${ids.length !== 1 ? "es" : ""}?`)) return;
        setBulkLoading("activate");
        try {
            await bulkUpdateStatus({ clientId, stateIds: ids, status: "ACTIVE" });
            toast.success(`${ids.length} conversación${ids.length !== 1 ? "es" : ""} activada${ids.length !== 1 ? "s" : ""}`);
        } catch {
            toast.error("Error al activar conversaciones");
        } finally {
            setBulkLoading(null);
        }
    };

    const handleBulkPause = async () => {
        const ids = visibleConversations
            .filter(c => c.status === "ACTIVE")
            .map(c => c._id as Id<"conversation_states">);
        if (!ids.length || !clientId) return;
        if (!confirm(`¿Pausar el asistente en ${ids.length} conversación${ids.length !== 1 ? "es" : ""}?`)) return;
        setBulkLoading("pause");
        try {
            await bulkUpdateStatus({ clientId, stateIds: ids, status: "PAUSED" });
            toast.success(`${ids.length} conversación${ids.length !== 1 ? "es" : ""} pausada${ids.length !== 1 ? "s" : ""}`);
        } catch {
            toast.error("Error al pausar conversaciones");
        } finally {
            setBulkLoading(null);
        }
    };

    const handleBulkDelete = async () => {
        const ids = visibleConversations.map(c => c._id as Id<"conversation_states">);
        if (!ids.length || !clientId) return;
        if (!confirm(`¿Eliminar las ${ids.length} conversación${ids.length !== 1 ? "es" : ""} visibles y todos sus mensajes? Esta acción no se puede deshacer.`)) return;
        setBulkLoading("delete");
        try {
            await bulkDeleteMutation({ clientId, stateIds: ids });
            toast.success(`${ids.length} conversación${ids.length !== 1 ? "es" : ""} eliminada${ids.length !== 1 ? "s" : ""}`);
            setSelectedStateId(null);
        } catch {
            toast.error("Error al eliminar conversaciones");
        } finally {
            setBulkLoading(null);
        }
    };

    if (!userProfile || !userClients) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    if (!clientId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">No tenés una cuenta asignada</h2>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6 w-full h-[calc(100vh-160px)] min-h-125 animate-in fade-in duration-500 overflow-hidden">
            {/* Sidebar */}
            <div className={cn(
                "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden shrink-0 transition-all duration-300",
                selectedStateId ? "hidden md:flex md:w-[320px] lg:w-95" : "flex w-full md:w-[320px] lg:w-95"
            )}>
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">Mensajes</h2>
                    {/* Tabs */}
                    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                        {([
                            { key: "mine", label: "Mías", count: myConversations.length },
                            { key: "active", label: "Todas", count: activeConversations.length },
                            { key: "archived", label: "Arch.", count: archivedConversations.length },
                            { key: "ignored", label: "Ign.", count: ignoredConversations.length },
                        ] as const).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors",
                                    activeTab === tab.key
                                        ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                )}
                            >
                                {tab.label}
                                {tab.count > 0 && (
                                    <span className={cn(
                                        "ml-1 px-1.5 py-0.5 rounded-full text-[10px] inline-flex items-center justify-center leading-none",
                                        activeTab === tab.key ? "bg-primary text-white" : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"
                                    )}>{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>
                    {channels && channels.length > 1 && (
                        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none mt-2">
                            <button
                                onClick={() => { setSelectedChannelId(null); setSelectedAssistantId(null); }}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                                    !selectedChannelId && !selectedAssistantId
                                        ? "bg-primary text-white"
                                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                )}
                            >
                                Todos
                            </button>
                            {channels.map(ch => {
                                const assistant = assistantMap.get(ch.assistant as any);
                                return (
                                    <button
                                        key={ch._id}
                                        onClick={() => { setSelectedChannelId(ch._id); setSelectedAssistantId(null); }}
                                        title={assistant ? `Asistente: ${assistant.name}` : ch.name}
                                        className={cn(
                                            "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                                            selectedChannelId === ch._id
                                                ? "bg-primary text-white"
                                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                        )}
                                    >
                                        {ch.type === "whatsapp"
                                            ? <FaWhatsapp className="h-3 w-3 shrink-0" />
                                            : <FaGlobe className="h-3 w-3 shrink-0" />
                                        }
                                        {ch.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {uniqueAssistants.length > 1 && (
                        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none mt-1">
                            {uniqueAssistants.map(asst => (
                                <button
                                    key={asst._id}
                                    onClick={() => { setSelectedAssistantId(selectedAssistantId === asst._id ? null : asst._id); setSelectedChannelId(null); }}
                                    className={cn(
                                        "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                                        selectedAssistantId === asst._id
                                            ? "bg-violet-500 text-white"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    )}
                                >
                                    <FaRobot className="h-3 w-3 shrink-0" />
                                    {asst.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Acciones masivas */}
                {visibleConversations.length > 0 && (
                    <div className="px-3 py-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                        <span className="text-[11px] text-slate-400">
                            {visibleConversations.length} conversación{visibleConversations.length !== 1 ? "es" : ""}
                        </span>
                        <div className="flex items-center">
                            {visibleConversations.some(c => c.status === "PAUSED") && (
                                <button
                                    onClick={handleBulkActivate}
                                    disabled={bulkLoading !== null}
                                    title={`Activar asistente en las ${visibleConversations.filter(c => c.status === "PAUSED").length} pausadas`}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                                >
                                    {bulkLoading === "activate" ? <FaSpinner className="animate-spin h-3 w-3" /> : <FaPlay className="h-3 w-3" />}
                                </button>
                            )}
                            {visibleConversations.some(c => c.status === "ACTIVE") && (
                                <button
                                    onClick={handleBulkPause}
                                    disabled={bulkLoading !== null}
                                    title={`Pausar asistente en las ${visibleConversations.filter(c => c.status === "ACTIVE").length} activas`}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-yellow-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                                >
                                    {bulkLoading === "pause" ? <FaSpinner className="animate-spin h-3 w-3" /> : <FaPause className="h-3 w-3" />}
                                </button>
                            )}
                            {isOwner && (
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={bulkLoading !== null}
                                    title={`Eliminar las ${visibleConversations.length} conversaciones visibles`}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                                >
                                    {bulkLoading === "delete" ? <FaSpinner className="animate-spin h-3 w-3" /> : <FaTrash className="h-3 w-3" />}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!channels || !allStates || !allChats ? (
                        <div className="flex justify-center p-8">
                            <FaSpinner className="animate-spin text-primary text-xl" />
                        </div>
                    ) : visibleConversations.length === 0 ? (
                        <div className="text-center p-8 text-sm text-slate-500 dark:text-slate-400">
                            Nada por aquí.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {visibleConversations.map((conv) => (
                                <div
                                    key={conv._id}
                                    onClick={() => setSelectedStateId(conv._id)}
                                    className={cn(
                                        "p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-3",
                                        selectedStateId === conv._id && "bg-slate-50 dark:bg-slate-800/80 border-l-4 border-l-primary"
                                    )}
                                >
                                    <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-500">
                                        <FaUser className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                                {getDisplayName(conv)}
                                            </h3>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {debugCopyId.enabled && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            debugCopyId.copy(conv._id, "conversationStateId");
                                                        }}
                                                        title={`Copiar conversationStateId: ${conv._id}`}
                                                        className="p-1 rounded text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                                                    >
                                                        <FaCopy className="w-2.5 h-2.5" />
                                                    </button>
                                                )}
                                                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                                    {conv.lastMessage
                                                        ? new Date(conv.lastMessage._creationTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                        : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">
                                                {conv.lastMessage?.content || (conv.lastMessage ? "📎 Multimedia" : "Nuevo mensaje")}
                                            </p>
                                            {conv.assignedTo && (() => {
                                                const m = membersWithProfiles?.find(m => m.profile?._id === conv.assignedTo);
                                                const initials = m?.profile?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "?";
                                                return (
                                                    <span className="shrink-0 h-4 w-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center" title={m?.profile?.name ?? ""}>
                                                        {initials}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    {/* Mini status badge + canal */}
                                    <div className="shrink-0 flex flex-col items-center gap-1 mt-1">
                                        <span className={cn("h-2 w-2 rounded-full block", STATUS_DOT[conv.status as ConvStatus])} />
                                        {channels && channels.length > 1 && (() => {
                                            const ch = channelMap.get(conv.channel);
                                            return ch?.type === "whatsapp"
                                                ? <FaWhatsapp className="h-2.5 w-2.5 text-green-500" />
                                                : <FaGlobe className="h-2.5 w-2.5 text-blue-400" />;
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Chat View */}
            {selectedStateId && activeConversation ? (
                <div className={cn(
                    "flex flex-col bg-white dark:bg-slate-900 overflow-hidden",
                    // Mobile: cubre toda la pantalla bajo el navbar sticky (h-16)
                    "fixed inset-x-0 top-16 bottom-0 z-90 md:static md:z-auto md:inset-auto",
                    "md:flex-1 md:min-w-0 md:rounded-2xl md:border md:border-slate-200 md:dark:border-slate-800 md:shadow-sm",
                )}>
                    {/* Header */}
                    <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 flex items-center gap-2.5">
                        <button
                            onClick={() => { setSelectedStateId(null); setIsActionsMenuOpen(false); }}
                            className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors shrink-0"
                            title="Volver"
                        >
                            <FaChevronLeft size={14} />
                        </button>
                        <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-500">
                            <FaUser className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {getDisplayName(activeConversation)}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[activeConversation.status as ConvStatus])} />
                                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {STATUS_LABEL[activeConversation.status as ConvStatus]}
                                </span>
                                {(() => {
                                    const ch = channelMap.get(activeConversation.channel);
                                    const asst = ch ? assistantMap.get(ch.assistant as any) : null;
                                    if (!ch) return null;
                                    return (
                                        <>
                                            <span className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                                            {ch.type === "whatsapp"
                                                ? <FaWhatsapp className="h-3 w-3 text-green-500 shrink-0" />
                                                : <FaGlobe className="h-3 w-3 text-blue-400 shrink-0" />
                                            }
                                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-28">{ch.name}</span>
                                            {asst && (
                                                <>
                                                    <span className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                                                    <FaRobot className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                                                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-28">{asst.name}</span>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Guardar contacto */}
                        {activeConversation.phone && contactChannels.has(activeConversation.channel) && (
                            <button
                                onClick={() => setContactModalOpen(true)}
                                title={activeConversationContact ? "Editar contacto" : "Guardar como contacto"}
                                className={cn(
                                    "p-2 rounded-xl transition-colors shrink-0",
                                    activeConversationContact
                                        ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                                )}
                            >
                                <FaAddressBook size={14} />
                            </button>
                        )}

                        {/* Asignación */}
                        <div className="relative shrink-0" ref={assignMenuRef}>
                            <button
                                onClick={() => setIsAssignMenuOpen(v => !v)}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                                title="Asignar conversación"
                            >
                                <FaUserPlus size={14} />
                            </button>
                            {isAssignMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-48">
                                    <p className="px-3 pt-1 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Asignar a</p>
                                    {membersWithProfiles?.map(member => {
                                        const isAssigned = activeConversation.assignedTo === member.profile?._id;
                                        return (
                                            <button
                                                key={member._id}
                                                onClick={() => handleAssign(activeConversation._id, isAssigned ? null : member.profile!._id)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors",
                                                    isAssigned
                                                        ? "bg-primary/10 text-primary"
                                                        : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200"
                                                )}
                                            >
                                                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                                    {member.profile?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                                                </span>
                                                <span className="flex-1 truncate">{member.profile?.name ?? "Miembro"}</span>
                                                {isAssigned && <FaXmark size={11} className="shrink-0 opacity-60" />}
                                            </button>
                                        );
                                    })}
                                    {activeConversation.assignedTo && (
                                        <>
                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                            <button
                                                onClick={() => handleAssign(activeConversation._id, null)}
                                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                            >
                                                <FaXmark size={11} className="shrink-0" />
                                                Quitar asignación
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Menú de acciones (tres puntos) */}
                        <div className="relative shrink-0" ref={actionsMenuRef}>
                            <button
                                onClick={() => setIsActionsMenuOpen(v => !v)}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                                title="Acciones"
                            >
                                <FaEllipsisVertical size={15} />
                            </button>
                            {isActionsMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-42.5">
                                    {/* Pausar / Reanudar */}
                                    {(activeConversation.status === "ACTIVE" || activeConversation.status === "PAUSED") && (
                                        <button
                                            onClick={() => { handleSetStatus(activeConversation._id, activeConversation.status === "PAUSED" ? "ACTIVE" : "PAUSED"); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            {activeConversation.status === "PAUSED"
                                                ? <><FaPlay size={12} className="text-yellow-500 shrink-0" /><span className="text-slate-700 dark:text-slate-200">Reanudar asistente</span></>
                                                : <><FaPause size={12} className="text-green-600 shrink-0" /><span className="text-slate-700 dark:text-slate-200">Pausar asistente</span></>}
                                        </button>
                                    )}
                                    {/* Activar */}
                                    {(activeConversation.status === "ARCHIVED" || activeConversation.status === "IGNORED") && (
                                        <button
                                            onClick={() => { handleSetStatus(activeConversation._id, "ACTIVE"); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <FaArrowRotateLeft size={12} className="text-green-600 shrink-0" />
                                            <span className="text-slate-700 dark:text-slate-200">Activar</span>
                                        </button>
                                    )}
                                    {/* Crear registros */}
                                    <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                    <button
                                        onClick={() => { setCreateLeadOpen(true); setIsActionsMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                        <FaUserTie size={12} className="text-violet-500 shrink-0" />
                                        <span className="text-slate-700 dark:text-slate-200">Nuevo lead</span>
                                    </button>
                                    {client?.features?.enableOrders && (
                                        <button
                                            onClick={() => { setCreateOrderOpen(true); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <FaBoxOpen size={12} className="text-orange-500 shrink-0" />
                                            <span className="text-slate-700 dark:text-slate-200">Nuevo pedido</span>
                                        </button>
                                    )}
                                    {client?.features?.enableAgenda && (
                                        <button
                                            onClick={() => { setCreateApptOpen(true); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <FaCalendarPlus size={12} className="text-sky-500 shrink-0" />
                                            <span className="text-slate-700 dark:text-slate-200">Nueva cita</span>
                                        </button>
                                    )}
                                    <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

                                    {/* Ignorar */}
                                    {activeConversation.status !== "IGNORED" && (
                                        <button
                                            onClick={() => { handleSetStatus(activeConversation._id, "IGNORED"); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <FaBan size={12} className="text-orange-500 shrink-0" />
                                            <span className="text-slate-700 dark:text-slate-200">Ignorar</span>
                                        </button>
                                    )}
                                    {/* Archivar */}
                                    {activeConversation.status !== "ARCHIVED" && (
                                        <button
                                            onClick={() => { handleSetStatus(activeConversation._id, "ARCHIVED"); setIsActionsMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <FaBoxArchive size={12} className="text-slate-400 shrink-0" />
                                            <span className="text-slate-700 dark:text-slate-200">Archivar</span>
                                        </button>
                                    )}
                                    {/* Eliminar — sólo owners */}
                                    {isOwner && (
                                        <>
                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                            <button
                                                onClick={() => { handleDeleteConversation(); setIsActionsMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            >
                                                <FaTrash size={12} className="text-red-400 shrink-0" />
                                                <span className="text-red-600 dark:text-red-400">Eliminar</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Test mode banner — solo aplica a canales WhatsApp */}
                    {(() => {
                        const ch = channelMap.get(activeConversation.channel);
                        if (ch?.type !== "whatsapp") return null;
                        if (!((ch?.config as any)?.testMode)) return null;
                        return (
                            <div className="shrink-0 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50 px-4 py-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                                <FaTriangleExclamation className="w-3 h-3 shrink-0" />
                                <span><strong>Modo de pruebas:</strong> Solo responde a los números habilitados en la configuración del canal. Configuralo en <em>Canales → Modo</em>.</span>
                            </div>
                        );
                    })()}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950 custom-scrollbar">
                        {activeConversation.chats.filter(c => c.role !== "event").map((chat) => {
                            const isUser = chat.role === "user";
                            return (
                                <div key={chat._id} className={cn("flex flex-col max-w-[85%]", isUser ? "self-start" : "self-end items-end")}>
                                    <div className={cn(
                                        "px-4 py-2 rounded-2xl",
                                        isUser
                                            ? "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm"
                                            : "bg-primary text-white rounded-tr-sm"
                                    )}>
                                        {(chat as any).media?.type === "voice" ? (
                                            <div className="flex flex-col gap-1">
                                                <VoicePlayer channelId={chat.channelId} mediaId={(chat as any).media.mediaId} />
                                                {chat.content && (
                                                    <p className="text-xs italic opacity-70 whitespace-pre-wrap">"{chat.content}"</p>
                                                )}
                                            </div>
                                        ) : chat.content ? (
                                            <p className="text-sm whitespace-pre-wrap">{chat.content}</p>
                                        ) : (
                                            <p className="text-sm italic opacity-60">📎 Contenido multimedia</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 px-1">
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(chat._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {!isUser && chat.role === "assistant" && (
                                            <FaRobot className="h-2.5 w-2.5 text-slate-400" title="Enviado por IA" />
                                        )}
                                        {!isUser && chat.role === "system" && (
                                            <FaUser className="h-2.5 w-2.5 text-slate-400" title="Enviado por operador" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                        <ChatInput
                            channelId={activeConversation.channel}
                            phone={activeConversation.phone}
                            sessionId={activeConversation.sessionId}
                        />
                    </div>
                </div>
            ) : (
                <div className="hidden md:flex flex-1 min-w-0 items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="text-center space-y-4">
                        <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300 dark:text-slate-600">
                            <FaMessage size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Tus mensajes</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                            Seleccioná una conversación para ver los mensajes.
                        </p>
                    </div>
                </div>
            )}
            {/* Contact save modal */}
            {contactModalOpen && activeConversation?.phone && (
                <ContactSaveModal
                    phone={activeConversation.phone.split("@")[0]}
                    assistantId={(channelMap.get(activeConversation.channel) as any)?.assistant}
                    existingContact={activeConversationContact}
                    onClose={() => setContactModalOpen(false)}
                />
            )}

            {/* Create lead modal */}
            {createLeadOpen && activeConversation && clientId && (
                <CreateLeadModal
                    clientId={clientId}
                    channelId={activeConversation.channel}
                    phone={activeConversation.phone?.split("@")[0] ?? activeConversation.sessionId ?? ""}
                    displayName={getDisplayName(activeConversation)}
                    onClose={() => setCreateLeadOpen(false)}
                />
            )}

            {/* Create order modal */}
            {createOrderOpen && activeConversation && clientId && (
                <CreateOrderModal
                    clientId={clientId}
                    phone={activeConversation.phone?.split("@")[0] ?? activeConversation.sessionId ?? ""}
                    displayName={getDisplayName(activeConversation)}
                    onClose={() => setCreateOrderOpen(false)}
                />
            )}

            {/* Create appointment modal */}
            {createApptOpen && activeConversation && clientId && (
                <CreateApptModal
                    clientId={clientId}
                    channelId={activeConversation.channel}
                    phone={activeConversation.phone ? `+${activeConversation.phone.split("@")[0]}` : undefined}
                    displayName={getDisplayName(activeConversation)}
                    onClose={() => setCreateApptOpen(false)}
                />
            )}
        </div>
    );
}

function ContactSaveModal({
    phone,
    assistantId,
    existingContact,
    onClose,
}: {
    phone: string;
    assistantId: string | undefined;
    existingContact: { _id: string; name: string } | null;
    onClose: () => void;
}) {
    const [name, setName] = useState(existingContact?.name ?? "");
    const [saving, setSaving] = useState(false);
    const createContact = useMutation(api.contacts.create);
    const updateContact = useMutation(api.contacts.update);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !assistantId) return;
        setSaving(true);
        try {
            if (existingContact) {
                await updateContact({ id: existingContact._id as any, name: name.trim() });
            } else {
                await createContact({ assistantId: assistantId as any, name: name.trim(), phone });
            }
            toast.success(existingContact ? "Contacto actualizado." : "Contacto guardado.");
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al guardar.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-200 bg-black/50 backdrop-blur-sm flex items-end sm:items-center sm:justify-center sm:p-4"
        >
            <div className="bg-white dark:bg-slate-900 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                            <FaAddressBook className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                            {existingContact ? "Editar contacto" : "Guardar contacto"}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors">
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>
                <form onSubmit={handleSave} className="p-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">Teléfono</label>
                        <p className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-600 dark:text-slate-400">+{phone}</p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ej: Juan García"
                            autoFocus
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all"
                        />
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving || !name.trim()}
                            className={cn("flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2", (saving || !name.trim()) && "opacity-60 cursor-not-allowed")}>
                            {saving
                                ? <><FaSpinner className="animate-spin w-3.5 h-3.5" />Guardando...</>
                                : existingContact ? "Actualizar" : "Guardar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ChatInput({ channelId, phone, sessionId }: { channelId?: Id<"channels">, phone?: string, sessionId?: string }) {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const sendWhatsApp = useAction(api.whapiActions.sendMessage);
    const sendWebMessage = useMutation(api.chats.createAdminMessage);

    const isWebChannel = !phone && !!sessionId;
    const canSend = !!channelId && (!!phone || !!sessionId);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || !canSend || isSending) return;

        setIsSending(true);
        try {
            if (isWebChannel) {
                await sendWebMessage({
                    channelId: channelId!,
                    sessionId,
                    role: "system",
                    content: message.trim(),
                    messageId: crypto.randomUUID(),
                });
            } else {
                await sendWhatsApp({ channelId: channelId!, phone: phone!, content: message.trim() });
            }
            setMessage("");
        } catch (error) {
            toast.error("Error al enviar mensaje");
            console.error(error);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <form onSubmit={handleSend} className="flex gap-2">
            <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder-slate-400"
            />
            <button
                type="submit"
                disabled={!message.trim() || isSending || !canSend}
                className={cn(
                    "flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                    (!message.trim() || isSending || !canSend) ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/90 hover:scale-105 active:scale-95"
                )}
            >
                {isSending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane className="ml-1" />}
            </button>
        </form>
    );
}

// ─── Shared modal shell ───────────────────────────────────────────────────────

function ModalShell({ title, icon, onClose, children }: {
    title: string;
    icon: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-200 bg-black/50 backdrop-blur-sm flex items-end sm:items-center sm:justify-center sm:p-4"
        >
            <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">{icon}</div>
                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors">
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ─── Create Lead Modal ────────────────────────────────────────────────────────

function CreateLeadModal({ clientId, channelId, phone, displayName, onClose }: {
    clientId: Id<"clients">;
    channelId: Id<"channels">;
    phone: string;
    displayName: string;
    onClose: () => void;
}) {
    const [name, setName] = useState(displayName.startsWith("+") ? "" : displayName);
    const [summary, setSummary] = useState("");
    const [saving, setSaving] = useState(false);
    const createLead = useMutation(api.leads.createManual);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !summary.trim()) return;
        setSaving(true);
        try {
            await createLead({ clientId, channelId, name: name.trim(), phone, summary: summary.trim() });
            toast.success("Lead creado.");
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear lead.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title="Nuevo lead" icon={<FaUserTie className="w-3.5 h-3.5" />} onClose={onClose}>
            <form onSubmit={handleSave} className="p-5 space-y-4">
                <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Juan García" autoFocus
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Resumen <span className="text-red-500">*</span></label>
                    <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="Describe brevemente el interés o situación del cliente..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all resize-none" />
                </div>
                <div className="flex gap-3 pt-1">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                    <button type="submit" disabled={saving || !name.trim() || !summary.trim()} className={cn("flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2", (saving || !name.trim() || !summary.trim()) && "opacity-60 cursor-not-allowed")}>
                        {saving ? <><FaSpinner className="animate-spin w-3.5 h-3.5" />Guardando...</> : "Crear lead"}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}

// ─── Create Order Modal ───────────────────────────────────────────────────────

type OrderItem = { productName: string; quantity: number; priceAtMoment: number };

function CreateOrderModal({ clientId, phone, displayName, onClose }: {
    clientId: Id<"clients">;
    phone: string;
    displayName: string;
    onClose: () => void;
}) {
    const [name, setName] = useState(displayName.startsWith("+") ? "" : displayName);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [currency, setCurrency] = useState("UYU");
    const [items, setItems] = useState<OrderItem[]>([{ productName: "", quantity: 1, priceAtMoment: 0 }]);
    const [saving, setSaving] = useState(false);
    const createOrder = useMutation(api.orders.createManual);

    const total = items.reduce((s, i) => s + i.quantity * i.priceAtMoment, 0);

    const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !deliveryAddress.trim() || items.some(i => !i.productName.trim())) return;
        setSaving(true);
        try {
            await createOrder({ clientId, name: name.trim(), phone, deliveryAddress: deliveryAddress.trim(), items, currency });
            toast.success("Pedido creado.");
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear pedido.");
        } finally {
            setSaving(false);
        }
    };

    const canSubmit = name.trim() && deliveryAddress.trim() && items.length > 0 && items.every(i => i.productName.trim() && i.quantity > 0);

    return (
        <ModalShell title="Nuevo pedido" icon={<FaBoxOpen className="w-3.5 h-3.5" />} onClose={onClose}>
            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nombre del cliente <span className="text-red-500">*</span></label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Juan García" autoFocus
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Dirección de entrega <span className="text-red-500">*</span></label>
                        <input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Ej: Av. 18 de Julio 1234"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Moneda</label>
                        <select value={currency} onChange={e => setCurrency(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all">
                            <option value="UYU">UYU</option>
                            <option value="USD">USD</option>
                            <option value="ARS">ARS</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ítems <span className="text-red-500">*</span></label>
                        <button type="button" onClick={() => setItems(prev => [...prev, { productName: "", quantity: 1, priceAtMoment: 0 }])}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                            <FaPlus className="w-2.5 h-2.5" /> Añadir
                        </button>
                    </div>
                    {items.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                            <input type="text" value={item.productName} onChange={e => updateItem(idx, "productName", e.target.value)} placeholder="Producto"
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all" />
                            <input type="number" value={item.quantity} min={1} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                                className="w-14 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                            <input type="number" value={item.priceAtMoment} min={0} step="0.01" onChange={e => updateItem(idx, "priceAtMoment", parseFloat(e.target.value) || 0)} placeholder="Precio"
                                className="w-24 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                            {items.length > 1 && (
                                <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                                    <FaMinus className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                    <div className="text-right text-sm font-semibold text-slate-700 dark:text-slate-300 pt-1">
                        Total: {currency} {total.toLocaleString("es-UY", { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="flex gap-3 pt-1">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                    <button type="submit" disabled={saving || !canSubmit} className={cn("flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2", (saving || !canSubmit) && "opacity-60 cursor-not-allowed")}>
                        {saving ? <><FaSpinner className="animate-spin w-3.5 h-3.5" />Guardando...</> : "Crear pedido"}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}

// ─── Create Appointment Modal ─────────────────────────────────────────────────

function CreateApptModal({ clientId, channelId, phone, displayName, onClose }: {
    clientId: Id<"clients">;
    channelId: Id<"channels">;
    phone?: string;
    displayName: string;
    onClose: () => void;
}) {
    const [customerName, setCustomerName] = useState(displayName.startsWith("+") ? "" : displayName);
    const [customerPhone, setCustomerPhone] = useState(phone ?? "");
    const [startDate, setStartDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const createAppt = useMutation(api.appointments.createManual);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customerName.trim() || !startDate || !startTime) return;
        setSaving(true);
        try {
            const start = new Date(`${startDate}T${startTime}`).getTime();
            const end = endTime ? new Date(`${startDate}T${endTime}`).getTime() : undefined;
            if (end && end <= start) { toast.error("La hora de fin debe ser posterior al inicio."); setSaving(false); return; }
            await createAppt({
                clientId,
                channelId,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim() || undefined,
                start,
                end,
                notes: notes.trim() || undefined,
            });
            toast.success("Cita creada.");
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear cita.");
        } finally {
            setSaving(false);
        }
    };

    const canSubmit = customerName.trim() && startDate && startTime;

    return (
        <ModalShell title="Nueva cita" icon={<FaCalendarPlus className="w-3.5 h-3.5" />} onClose={onClose}>
            <form onSubmit={handleSave} className="p-5 space-y-4">
                <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nombre del cliente <span className="text-red-500">*</span></label>
                    <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ej: Juan García" autoFocus
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Teléfono</label>
                    <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+598..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5 col-span-3 sm:col-span-1">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Fecha <span className="text-red-500">*</span></label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                    </div>
                    <div className="space-y-1.5 col-span-3 sm:col-span-1">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Hora inicio <span className="text-red-500">*</span></label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                    </div>
                    <div className="space-y-1.5 col-span-3 sm:col-span-1">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Hora fin</label>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">Notas</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas opcionales..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-400 transition-all resize-none" />
                </div>
                <div className="flex gap-3 pt-1">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                    <button type="submit" disabled={saving || !canSubmit} className={cn("flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2", (saving || !canSubmit) && "opacity-60 cursor-not-allowed")}>
                        {saving ? <><FaSpinner className="animate-spin w-3.5 h-3.5" />Guardando...</> : "Crear cita"}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}
