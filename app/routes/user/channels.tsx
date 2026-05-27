import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { useQuery, useAction } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import { useEffect, useRef, useState } from "react";
import {
    FaSpinner, FaTrash, FaEye, FaEyeSlash, FaXmark, FaPlus,
    FaWhatsapp, FaGlobe, FaCode, FaCheck, FaGear,
    FaTriangleExclamation, FaToggleOn, FaToggleOff,
} from "react-icons/fa6";
import { useFetcher } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { useRequireOwner } from "./hooks/useRequireOwner";
import { toast } from "react-toastify";
import { cn, getEnv, getContrastColor } from "utils/utils";
import { WhapiPartnerService, WhapiService, DEFAULT_WHAPI_WEBHOOK_EVENTS, DEFAULT_WHAPI_MEDIA_SETTINGS } from "lib/services/whapi.service";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = Doc<"channels">;
type Assistant = Doc<"assistants">;

interface ActionResult {
    success?: boolean;
    message?: string;
    formError?: string;
    qrCode?: string;
    connected?: boolean;
    disconnected?: boolean;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Canales - Atendia" }];
}

// ─── Action (server-side: Whapi operations & channel creation) ────────────────

export async function action({ request }: ActionFunctionArgs): Promise<ActionResult> {
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const convex = new ConvexHttpClient(VITE_CONVEX_URL);
    const authToken = formData.get("authToken") as string | null;
    if (authToken) convex.setAuth(authToken);

    // ── Create channel (web or WhatsApp) ────────────────────────────────────
    if (intent === "create_channel") {
        const clientId = formData.get("clientId") as string;
        const assistantId = formData.get("assistantId") as string;
        const name = formData.get("name") as string;
        const type = formData.get("type") as string;

        if (!clientId || !assistantId || !name || !type) {
            return { formError: "Todos los campos son obligatorios." };
        }

        try {
            let externalId: string;
            let config: Record<string, unknown> = {};
            let status: string;

            if (type === "web") {
                externalId = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
                const primaryColor = (formData.get("primaryColor") as string) || "#0ea5e9";
                config = {
                    accessToken: externalId,
                    allowedDomains: [],
                    theme: { primaryColor, position: "bottom-right" },
                };
                status = "connected";
            } else {
                externalId = crypto.randomUUID();
                config = { testMode: true, testPhones: [] };
                status = "pending";
            }

            const channelId = await convex.mutation(api.channels.create, {
                client: clientId as Id<"clients">,
                assistant: assistantId as Id<"assistants">,
                name,
                type,
                externalId,
                config,
                isActive: true,
                status,
            });

            // For WhatsApp, set up Whapi and configure the webhook
            if (type === "whatsapp") {
                const WHAPI_PARTNER_API_KEY = getEnv("WHAPI_PARTNER_API_KEY");
                const VITE_SITE_URL = getEnv("VITE_SITE_URL");

                if (!WHAPI_PARTNER_API_KEY) {
                    return { formError: "Configuración de WhatsApp no disponible. Contacta al soporte." };
                }

                const client = await convex.query(api.clients.get, { id: clientId as Id<"clients"> });
                const channelDisplayName = `${name} - ${client?.businessName ?? "Cliente"}`;

                const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
                const whapiChannel = await whapi.createChannel(channelDisplayName);

                if (!whapiChannel) {
                    return { formError: "No se pudo crear el canal en WhatsApp. Intenta de nuevo." };
                }

                if (VITE_SITE_URL) {
                    const channelService = new WhapiService({
                        token: whapiChannel.token,
                        apiUrl: whapiChannel.apiUrl,
                    });
                    await channelService.updateChannelSettings({
                        media: DEFAULT_WHAPI_MEDIA_SETTINGS,
                        webhooks: [{
                            mode: "body",
                            url: `${VITE_SITE_URL}/api/webhooks/whapi/${channelId}`,
                            events: DEFAULT_WHAPI_WEBHOOK_EVENTS,
                        }],
                    });
                }

                await convex.mutation(api.channels.update, {
                    id: channelId,
                    config: {
                        whapiChannelId: whapiChannel.id,
                        whapiToken: whapiChannel.token,
                        testMode: true,
                        testPhones: [],
                    } as any,
                });
            }

            return { success: true, message: "Canal creado correctamente." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error inesperado al crear el canal.";
            return { formError: msg };
        }
    }

    // ── Get WhatsApp QR code ─────────────────────────────────────────────────
    if (intent === "get_qr") {
        const whapiToken = formData.get("whapiToken") as string;
        const channelId = formData.get("channelId") as string;

        if (!whapiToken) {
            return { formError: "Token de WhatsApp no encontrado." };
        }

        try {
            const whapi = new WhapiService({ token: whapiToken });
            const health = await whapi.checkHealth();

            if (health?.status?.text === "AUTHENTICATED") {
                if (channelId) {
                    await convex.mutation(api.channels.update, {
                        id: channelId as Id<"channels">,
                        status: "connected",
                    });
                }
                return { success: true, connected: true };
            }

            const response = await whapi.getQRCode() as Record<string, unknown> | null;

            // @ts-ignore
            if (response?.status === "ALREADY_LOGGED_IN") {
                if (channelId) {
                    await convex.mutation(api.channels.update, {
                        id: channelId as Id<"channels">,
                        status: "connected",
                    });
                }
                return { success: true, connected: true };
            }

            // @ts-ignore
            if (response?.base64) {
                return { success: true, qrCode: response.base64 as string };
            }

            return { formError: "No se pudo generar el código QR. Intenta de nuevo en unos momentos." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al obtener el código QR.";
            return { formError: msg };
        }
    }

    // ── Save web channel config (allowed domains) ────────────────────────────
    if (intent === "save_config") {
        const channelId = formData.get("channelId") as string;
        const allowedDomainsRaw = formData.get("allowedDomains") as string;
        const allowedDomains = allowedDomainsRaw
            ? allowedDomainsRaw.split("\n").map(d => d.trim()).filter(Boolean)
            : [];

        try {
            await convex.mutation(api.channels.update, {
                id: channelId as Id<"channels">,
                config: { allowedDomains },
            });
            return { success: true, message: "Configuración guardada." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al guardar la configuración.";
            return { formError: msg };
        }
    }

    // ── Save web channel appearance (theme color) ───────────────────────────
    if (intent === "save_appearance") {
        const channelId = formData.get("channelId") as string;
        const primaryColor = formData.get("primaryColor") as string;
        const position = (formData.get("position") as string) || "bottom-right";
        try {
            await convex.mutation(api.channels.update, {
                id: channelId as Id<"channels">,
                config: { theme: { primaryColor, position } },
            });
            return { success: true, message: "Apariencia guardada." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al guardar la apariencia.";
            return { formError: msg };
        }
    }

    // ── Toggle channel active/inactive ──────────────────────────────────────
    if (intent === "toggle_channel") {
        const channelId = formData.get("channelId") as string;
        const isActive = formData.get("isActive") === "true";

        try {
            await convex.mutation(api.channels.update, {
                id: channelId as Id<"channels">,
                isActive: !isActive,
            });
            return { success: true, message: isActive ? "Canal desactivado." : "Canal activado." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al actualizar el canal.";
            return { formError: msg };
        }
    }

    // ── Logout WhatsApp channel ──────────────────────────────────────────────
    if (intent === "logout_channel") {
        const whapiToken = formData.get("whapiToken") as string;
        const channelId = formData.get("channelId") as string;

        if (!whapiToken || !channelId) {
            return { formError: "Datos del canal incompletos." };
        }

        try {
            const whapi = new WhapiService({ token: whapiToken });
            await whapi.logout();

            await convex.mutation(api.channels.update, {
                id: channelId as Id<"channels">,
                status: "disconnected",
            });

            return { success: true, disconnected: true, message: "Canal desconectado." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al desconectar el canal.";
            return { formError: msg };
        }
    }

    // ── Save test mode configuration (solo aplica a canales WhatsApp) ─────────
    if (intent === "save_test_mode") {
        const channelId = formData.get("channelId") as string;
        const testMode = formData.get("testMode") === "true";
        const testPhones = (formData.getAll("testPhones") as string[]).filter(p => p.length >= 7);
        try {
            const channel = await convex.query(api.channels.get, { id: channelId as Id<"channels"> });
            if (channel?.type !== "whatsapp") {
                return { formError: "El modo de pruebas solo aplica a canales de WhatsApp." };
            }
            await convex.mutation(api.channels.update, {
                id: channelId as Id<"channels">,
                config: { testMode, testPhones } as any,
            });
            return { success: true, message: testMode ? "Modo de pruebas activado." : "Modo en vivo activado." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al guardar el modo.";
            return { formError: msg };
        }
    }

    // ── Delete channel ───────────────────────────────────────────────────────
    if (intent === "delete_channel") {
        const channelId = formData.get("channelId") as string;
        const whapiChannelId = formData.get("whapiChannelId") as string;

        try {
            await convex.mutation(api.channels.remove, { id: channelId as Id<"channels"> });

            if (whapiChannelId) {
                const WHAPI_PARTNER_API_KEY = getEnv("WHAPI_PARTNER_API_KEY");
                if (WHAPI_PARTNER_API_KEY) {
                    const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
                    await whapi.deleteChannel(whapiChannelId);
                }
            }

            return { success: true, message: "Canal eliminado." };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al eliminar el canal.";
            return { formError: msg };
        }
    }

    return { formError: "Acción no reconocida." };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserChannels() {
    const { isLoading: isOwnerLoading } = useRequireOwner();
    const authToken = useAuthToken();
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;

    const client = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");
    const channels = useQuery(api.channels.getByClient, clientId ? { clientId } : "skip");
    const assistants = useQuery(api.assistants.getByClient, clientId ? { clientId } : "skip");

    const fetcher = useFetcher<ActionResult>();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [configChannel, setConfigChannel] = useState<Channel | null>(null);

    const isLoading = isOwnerLoading || !userProfile || userClients === undefined || channels === undefined;

    // Business rules: trial check
    const isOnTrial = client?.trialEndsAt ? Date.now() < client.trialEndsAt : false;
    const whatsappChannels = channels?.filter(c => c.type === "whatsapp") ?? [];
    const canCreateWhatsApp = whatsappChannels.length === 0 || !isOnTrial;

    // React to fetcher results
    useEffect(() => {
        if (fetcher.data?.success && fetcher.data.message) {
            toast.success(fetcher.data.message);
            setIsCreateModalOpen(false);
        } else if (fetcher.data?.formError) {
            toast.error(fetcher.data.formError);
        }
    }, [fetcher.data]);

    const submitWithAuth = (fd: FormData) => {
        if (authToken) fd.set("authToken", authToken);
        fetcher.submit(fd, { method: "POST" });
    };

    const handleToggle = (channel: Channel) => {
        const fd = new FormData();
        fd.set("intent", "toggle_channel");
        fd.set("channelId", channel._id);
        fd.set("isActive", String(channel.isActive));
        submitWithAuth(fd);
    };

    const handleDelete = (channel: Channel) => {
        if (!globalThis.confirm(`¿Eliminar el canal "${channel.name}"? Esta acción no se puede deshacer.`)) return;

        const fd = new FormData();
        fd.set("intent", "delete_channel");
        fd.set("channelId", channel._id);
        if (channel.config?.whapiChannelId) fd.set("whapiChannelId", channel.config.whapiChannelId);
        submitWithAuth(fd);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    const assistantMap = new Map((assistants ?? []).map(a => [a._id, a]));

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Canales</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Conectá tu asistente con WhatsApp o con tu página web.
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="btn-primary flex items-center gap-2 self-start sm:self-auto"
                >
                    <FaPlus className="w-3.5 h-3.5" />
                    Nuevo canal
                </button>
            </div>

            {/* Trial notice for extra WhatsApp channels */}
            {isOnTrial && whatsappChannels.length > 0 && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-amber-700 dark:text-amber-400">
                    <FaTriangleExclamation className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-sm">
                        Estás en período de prueba. Solo podés tener un canal de WhatsApp.
                        Para agregar más, actualizá tu plan.
                    </p>
                </div>
            )}

            {/* Channel grid */}
            {channels && channels.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {channels.map(channel => (
                        <ChannelCard
                            key={channel._id}
                            channel={channel}
                            assistant={assistantMap.get(channel.assistant) ?? null}
                            onConfigure={() => setConfigChannel(channel)}
                            onToggle={() => handleToggle(channel)}
                            onDelete={() => handleDelete(channel)}
                            isDeleting={fetcher.state !== "idle"}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState onCreateClick={() => setIsCreateModalOpen(true)} />
            )}

            {/* Create channel modal */}
            {isCreateModalOpen && (
                <CreateChannelModal
                    clientId={clientId!}
                    assistants={assistants ?? []}
                    canCreateWhatsApp={canCreateWhatsApp}
                    isSubmitting={fetcher.state !== "idle"}
                    onSubmit={submitWithAuth}
                    onClose={() => setIsCreateModalOpen(false)}
                />
            )}

            {/* Configure modal */}
            {configChannel && (
                <ConfigureModal
                    channel={configChannel}
                    isSubmitting={fetcher.state !== "idle"}
                    fetcherData={fetcher.data}
                    onSubmit={submitWithAuth}
                    onClose={() => setConfigChannel(null)}
                />
            )}
        </div>
    );
}

// ─── Channel Card ─────────────────────────────────────────────────────────────

interface ChannelCardProps {
    channel: Channel;
    assistant: Assistant | null;
    onConfigure: () => void;
    onToggle: () => void;
    onDelete: () => void;
    isDeleting: boolean;
}

function ChannelCard({ channel, assistant, onConfigure, onToggle, onDelete, isDeleting }: ChannelCardProps) {
    const isWhatsApp = channel.type === "whatsapp";

    const statusConfig = {
        connected: { label: "Conectado", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
        pending: { label: "Pendiente", classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
        disconnected: { label: "Desconectado", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    } as const;

    const status = channel.isActive
        ? (statusConfig[channel.status as keyof typeof statusConfig] ?? statusConfig.disconnected)
        : { label: "Inactivo", classes: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2.5 rounded-xl",
                        isWhatsApp
                            ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            : "bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
                    )}>
                        {isWhatsApp ? <FaWhatsapp className="w-5 h-5" /> : <FaGlobe className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">{channel.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {isWhatsApp ? "WhatsApp" : "Chat Web"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    {channel.type === "whatsapp" && (channel.config as any)?.testMode && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase tracking-wide">
                            Pruebas
                        </span>
                    )}
                    <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", status.classes)}>
                        {status.label}
                    </span>
                </div>
            </div>

            {assistant && (
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block shrink-0" />
                    Asistente: <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{assistant.name}</span>
                </div>
            )}

            <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                    onClick={onConfigure}
                    className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
                >
                    <FaGear className="w-3.5 h-3.5" />
                    Configurar
                </button>
                <button
                    onClick={onToggle}
                    disabled={isDeleting}
                    className={cn(
                        "p-2.5 rounded-xl transition-colors disabled:opacity-50",
                        channel.isActive
                            ? "text-emerald-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    )}
                    aria-label={channel.isActive ? "Desactivar canal" : "Activar canal"}
                    title={channel.isActive ? "Desactivar canal" : "Activar canal"}
                >
                    {channel.isActive
                        ? <FaToggleOn className="w-5 h-5" />
                        : <FaToggleOff className="w-5 h-5" />
                    }
                </button>
                <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    aria-label="Eliminar canal"
                >
                    <FaTrash className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-5">
                <FaGlobe className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Sin conexiones aún</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                Creá una conexión para que tu asistente pueda atender a tus clientes.
            </p>
            <button onClick={onCreateClick} className="btn-primary flex items-center gap-2">
                <FaPlus className="w-3.5 h-3.5" />
                Crear primer canal
            </button>
        </div>
    );
}

// ─── Mini Widget Preview ──────────────────────────────────────────────────────

function MiniWidgetPreview({ primaryColor }: { primaryColor: string }) {
    const textColor = getContrastColor(primaryColor);
    return (
        <div className="w-40 rounded-xl overflow-hidden shadow-md border border-slate-200 dark:border-slate-700 shrink-0 select-none">
            <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: primaryColor }}>
                <div
                    className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ color: textColor }}
                >
                    A
                </div>
                <div>
                    <p className="text-[10px] font-semibold leading-none" style={{ color: textColor }}>Asistente</p>
                    <p className="text-[8px] opacity-70 leading-none mt-0.5" style={{ color: textColor }}>● Conectado</p>
                </div>
            </div>
            <div className="bg-[#E5DDD5] p-2 space-y-1.5">
                <div className="flex justify-start">
                    <div className="bg-white rounded-xl rounded-tl-sm px-2 py-1.5 text-slate-700 max-w-[85%] text-[9px] leading-tight shadow-sm">
                        ¡Hola! ¿En qué puedo ayudarte?
                    </div>
                </div>
                <div className="flex justify-end">
                    <div
                        className="rounded-xl rounded-tr-sm px-2 py-1.5 max-w-[85%] text-[9px] leading-tight shadow-sm"
                        style={{ backgroundColor: primaryColor, color: textColor }}
                    >
                        Necesito información
                    </div>
                </div>
                <div className="flex justify-start">
                    <div className="bg-white rounded-xl rounded-tl-sm px-2 py-1.5 text-slate-700 max-w-[85%] text-[9px] leading-tight shadow-sm">
                        ¡Con gusto te ayudo!
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-2 py-1.5 flex items-center gap-1.5 border-t border-slate-200">
                <div className="flex-1 bg-slate-100 rounded-lg h-5 text-[8px] flex items-center px-2 text-slate-400">
                    Escribe un mensaje...
                </div>
                <div
                    className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: primaryColor }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2.5" className="w-2.5 h-2.5">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </div>
            </div>
        </div>
    );
}

// ─── Create Channel Modal ─────────────────────────────────────────────────────

interface CreateChannelModalProps {
    clientId: Id<"clients">;
    assistants: Assistant[];
    canCreateWhatsApp: boolean;
    isSubmitting: boolean;
    onSubmit: (fd: FormData) => void;
    onClose: () => void;
}

function CreateChannelModal({
    clientId,
    assistants,
    canCreateWhatsApp,
    isSubmitting,
    onSubmit,
    onClose,
}: CreateChannelModalProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const [name, setName] = useState("");
    const [type, setType] = useState("web");
    const [assistantId, setAssistantId] = useState(assistants[0]?._id ?? "");
    const [primaryColor, setPrimaryColor] = useState("#0ea5e9");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !assistantId) {
            toast.error("Completa todos los campos.");
            return;
        }
        if (type === "whatsapp" && !canCreateWhatsApp) {
            toast.error("No puedes crear más canales de WhatsApp durante el período de prueba.");
            return;
        }
        const fd = new FormData();
        fd.set("intent", "create_channel");
        fd.set("clientId", clientId);
        fd.set("assistantId", assistantId);
        fd.set("name", name.trim());
        fd.set("type", type);
        if (type === "web") fd.set("primaryColor", primaryColor);
        onSubmit(fd);
    };

    return (
        <ModalOverlay onClose={onClose}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Nueva conexión</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    ¿Dónde querés conectar tu asistente?
                </p>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Scrollable fields */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Channel name */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ej: Canal principal"
                            autoFocus
                            className="input-field"
                        />
                    </div>

                    {/* Channel type */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Tipo de conexión <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <ChannelTypeOption
                                value="web"
                                selected={type === "web"}
                                onClick={() => setType("web")}
                                icon={<FaGlobe className="w-5 h-5" />}
                                label="Chat para mi web"
                                description="Se muestra en tu página web"
                                badge="Ilimitados"
                                badgeColor="sky"
                            />
                            <ChannelTypeOption
                                value="whatsapp"
                                selected={type === "whatsapp"}
                                onClick={() => canCreateWhatsApp && setType("whatsapp")}
                                icon={<FaWhatsapp className="w-5 h-5" />}
                                label="WhatsApp"
                                description={canCreateWhatsApp ? "Usá un número de WhatsApp" : "Requiere plan activo"}
                                badge={canCreateWhatsApp ? "1 gratis" : "Bloqueado"}
                                badgeColor={canCreateWhatsApp ? "green" : "red"}
                                disabled={!canCreateWhatsApp}
                            />
                        </div>
                    </div>

                    {/* Color picker — only for web channels */}
                    {type === "web" && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Color principal del widget
                            </label>
                            <div className="flex items-start gap-4">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={primaryColor}
                                            onChange={e => setPrimaryColor(e.target.value)}
                                            className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer p-0.5 bg-white dark:bg-slate-900"
                                        />
                                        <span className="font-mono text-sm text-slate-600 dark:text-slate-400 uppercase">{primaryColor}</span>
                                    </div>
                                </div>
                                <MiniWidgetPreview primaryColor={primaryColor} />
                            </div>
                        </div>
                    )}

                    {/* Assistant selector */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Asistente <span className="text-red-500">*</span>
                        </label>
                        {assistants.length === 0 ? (
                            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                                Aún no tienes asistentes. Crea uno antes de crear un canal.
                            </p>
                        ) : (
                            <select
                                value={assistantId}
                                onChange={e => setAssistantId(e.target.value as Id<"assistants">)}
                                className="input-field"
                            >
                                {assistants.map(a => (
                                    <option key={a._id} value={a._id}>{a.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* Footer — sticky at bottom */}
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
                        disabled={isSubmitting || assistants.length === 0}
                        className={cn("btn-primary min-w-32", isSubmitting && "opacity-70 cursor-wait")}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <FaSpinner className="animate-spin w-3.5 h-3.5" />
                                Creando...
                            </span>
                        ) : "Crear canal"}
                    </button>
                </div>
            </form>
        </ModalOverlay>
    );
}

interface ChannelTypeOptionProps {
    value: string;
    selected: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    description: string;
    badge: string;
    badgeColor: "sky" | "green" | "red";
    disabled?: boolean;
}

function ChannelTypeOption({
    selected, onClick, icon, label, description, badge, badgeColor, disabled,
}: ChannelTypeOptionProps) {
    const badgeClasses = {
        sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
        green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
                selected
                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600",
                disabled && "opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-slate-700"
            )}
        >
            <div className={cn(
                "p-2 rounded-lg",
                selected ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
            )}>
                {icon}
            </div>
            <div>
                <p className="font-medium text-sm text-slate-800 dark:text-slate-100">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
            </div>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full mt-auto", badgeClasses[badgeColor])}>
                {badge}
            </span>
        </button>
    );
}

// ─── Configure Modal ──────────────────────────────────────────────────────────

interface ConfigureModalProps {
    channel: Channel;
    isSubmitting: boolean;
    fetcherData: ActionResult | undefined;
    onSubmit: (fd: FormData) => void;
    onClose: () => void;
}

function ConfigureModal({ channel, isSubmitting, fetcherData, onSubmit, onClose }: ConfigureModalProps) {
    return (
        <ModalOverlay onClose={onClose}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                        Configurar: {channel.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {channel.type === "web" ? "Widget Web" : "WhatsApp"}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors"
                >
                    <FaXmark className="w-5 h-5" />
                </button>
            </div>

            {channel.type === "web" ? (
                <WebChannelConfig
                    channel={channel}
                    isSubmitting={isSubmitting}
                    fetcherData={fetcherData}
                    onSubmit={onSubmit}
                    onClose={onClose}
                />
            ) : (
                <WhatsAppChannelConfig
                    channel={channel}
                    isSubmitting={isSubmitting}
                    fetcherData={fetcherData}
                    onSubmit={onSubmit}
                    onClose={onClose}
                />
            )}
        </ModalOverlay>
    );
}

// ─── Web Channel Config ────────────────────────────────────────────────────────

interface WebChannelConfigProps {
    channel: Channel;
    isSubmitting: boolean;
    fetcherData: ActionResult | undefined;
    onSubmit: (fd: FormData) => void;
    onClose: () => void;
}

function WebChannelConfig({ channel, isSubmitting, fetcherData, onSubmit, onClose }: WebChannelConfigProps) {
    const [showToken, setShowToken] = useState(false);
    const [activeTab, setActiveTab] = useState<"snippet" | "domains" | "appearance">("snippet");
    const [allowedDomains, setAllowedDomains] = useState<string[]>(channel.config?.allowedDomains ?? []);
    const [domainInput, setDomainInput] = useState("");
    const [primaryColor, setPrimaryColor] = useState(channel.config?.theme?.primaryColor ?? "#0ea5e9");

    const token = channel.config?.accessToken ?? channel.externalId ?? "";
    const siteUrl = typeof window !== "undefined"
        ? window.location.origin
        : "https://atendia.uy";

    const snippet = [
        `<!-- Atendia Chat Widget -->`,
        `<script>`,
        `  window.AtendiaWidgetObject = 'Atendia';`,
        `  window.Atendia = window.Atendia || function() {`,
        `    (window.Atendia.q = window.Atendia.q || []).push(arguments);`,
        `  };`,
        `  Atendia('init', { token: '${token}' });`,
        `</script>`,
        `<script src="${siteUrl}/widget/v1/atendia-widget.js" async></script>`,
    ].join("\n");

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copiado al portapapeles.`);
    };

    const normalizeDomain = (raw: string): string => {
        return raw.trim().toLowerCase()
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .replace(/\/.*$/, "");
    };

    const addDomain = () => {
        const domain = normalizeDomain(domainInput);
        if (!domain) return;

        const isValid = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(domain);
        if (!isValid) {
            toast.error("Formato inválido. Ingresá solo el dominio, ej: midominio.com");
            return;
        }
        if (allowedDomains.includes(domain)) {
            toast.error("El dominio ya está en la lista.");
            setDomainInput("");
            return;
        }
        setAllowedDomains([...allowedDomains, domain]);
        setDomainInput("");
    };

    const handleAddDomain = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        addDomain();
    };

    const handleSaveDomains = () => {
        const fd = new FormData();
        fd.set("intent", "save_config");
        fd.set("channelId", channel._id);
        fd.set("allowedDomains", allowedDomains.join("\n"));
        onSubmit(fd);
    };

    const handleSaveAppearance = () => {
        const fd = new FormData();
        fd.set("intent", "save_appearance");
        fd.set("channelId", channel._id);
        fd.set("primaryColor", primaryColor);
        fd.set("position", channel.config?.theme?.position ?? "bottom-right");
        onSubmit(fd);
    };

    // Close on success
    useEffect(() => {
        if (fetcherData?.success && fetcherData.message === "Configuración guardada.") {
            // Keep modal open, just show success toast
        }
    }, [fetcherData]);

    return (
        <>
            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 shrink-0">
                {(["snippet", "domains", "appearance"] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                            activeTab === tab
                                ? "border-primary text-primary"
                                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                    >
                        {tab === "snippet" ? (
                            <span className="flex items-center gap-2"><FaCode className="w-3.5 h-3.5" />Snippet</span>
                        ) : tab === "domains" ? (
                            <span className="flex items-center gap-2"><FaGlobe className="w-3.5 h-3.5" />Dominios</span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                    <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                                </svg>
                                Apariencia
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Token */}
                <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Token de acceso
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type={showToken ? "text" : "password"}
                                value={token}
                                readOnly
                                onClick={e => e.currentTarget.select()}
                                className="input-field pr-10 cursor-pointer font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            >
                                {showToken ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleCopy(token, "Token")}
                            className="btn-secondary shrink-0"
                        >
                            Copiar
                        </button>
                    </div>
                </div>

                {/* Snippet tab */}
                {activeTab === "snippet" && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Código de instalación
                            </label>
                            <button
                                type="button"
                                onClick={() => handleCopy(snippet, "Snippet")}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                <FaCode className="w-3 h-3" /> Copiar código
                            </button>
                        </div>
                        <pre className="bg-slate-950 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre select-all">
                            {snippet}
                        </pre>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Pega este código antes del cierre del tag <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">&lt;/body&gt;</code> en tu sitio web.
                        </p>
                    </div>
                )}

                {/* Appearance tab */}
                {activeTab === "appearance" && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Color principal del widget
                            </label>
                            <div className="flex items-start gap-4">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={primaryColor}
                                            onChange={e => setPrimaryColor(e.target.value)}
                                            className="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer p-0.5 bg-white dark:bg-slate-900"
                                        />
                                        <span className="font-mono text-sm text-slate-600 dark:text-slate-400 uppercase">{primaryColor}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Este color se aplica al encabezado, mensajes del usuario y botón de envío.
                                    </p>
                                </div>
                                <MiniWidgetPreview primaryColor={primaryColor} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Domains tab */}
                {activeTab === "domains" && (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Dominios permitidos
                            </label>
                            <div className="min-h-24 block w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {allowedDomains.map(domain => (
                                        <span
                                            key={domain}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                                        >
                                            {domain}
                                            <button
                                                type="button"
                                                onClick={() => setAllowedDomains(allowedDomains.filter(d => d !== domain))}
                                                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                                            >
                                                <FaXmark className="w-2.5 h-2.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={domainInput}
                                        onChange={e => setDomainInput(e.target.value)}
                                        onKeyDown={handleAddDomain}
                                        placeholder={allowedDomains.length === 0 ? "ej: midominio.com" : "Agregar otro..."}
                                        className="flex-1 bg-transparent border-none p-0 text-sm focus:ring-0 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-slate-100"
                                    />
                                    {domainInput.trim() && (
                                        <button
                                            type="button"
                                            onClick={addDomain}
                                            className="shrink-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors px-1"
                                        >
                                            <FaPlus className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                                Sin dominios configurados, el widget funciona en cualquier sitio. Agrega dominios para restringir su uso.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    Cerrar
                </button>
                {activeTab === "domains" && (
                    <button
                        onClick={handleSaveDomains}
                        disabled={isSubmitting}
                        className={cn("btn-primary min-w-32", isSubmitting && "opacity-70 cursor-wait")}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <FaSpinner className="animate-spin w-3.5 h-3.5" /> Guardando...
                            </span>
                        ) : "Guardar dominios"}
                    </button>
                )}
                {activeTab === "appearance" && (
                    <button
                        onClick={handleSaveAppearance}
                        disabled={isSubmitting}
                        className={cn("btn-primary min-w-36", isSubmitting && "opacity-70 cursor-wait")}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <FaSpinner className="animate-spin w-3.5 h-3.5" /> Guardando...
                            </span>
                        ) : "Guardar apariencia"}
                    </button>
                )}
            </div>
        </>
    );
}

// ─── WhatsApp Channel Config ──────────────────────────────────────────────────

interface WhatsAppChannelConfigProps {
    channel: Channel;
    isSubmitting: boolean;
    fetcherData: ActionResult | undefined;
    onSubmit: (fd: FormData) => void;
    onClose: () => void;
}

function WhatsAppChannelConfig({ channel, isSubmitting, fetcherData, onSubmit, onClose }: WhatsAppChannelConfigProps) {
    const [waTab, setWaTab] = useState<"connection" | "mode">("connection");
    const [connectionMode, setConnectionMode] = useState<"qr" | "pairing">("qr");
    const [qrCode, setQrCode] = useState("");
    const [qrLoading, setQrLoading] = useState(true);
    const [connected, setConnected] = useState(channel.status === "connected");
    const [pollActive, setPollActive] = useState(channel.status !== "connected");
    const [showDisconnected, setShowDisconnected] = useState(false);

    // Pairing code states
    const [pairingPhone, setPairingPhone] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [pairingLoading, setPairingLoading] = useState(false);
    const [pairingError, setPairingError] = useState("");
    const [phoneValid, setPhoneValid] = useState(false);
    const [pairingCodeCopied, setPairingCodeCopied] = useState(false);

    // Test mode states
    const [testMode, setTestMode] = useState<boolean>((channel.config as any)?.testMode ?? true);
    const [testPhones, setTestPhones] = useState<string[]>((channel.config as any)?.testPhones ?? []);

    const generatePairingCodeAction = useAction(api.whapiActions.generatePairingCode);

    const whapiToken = channel.config?.whapiToken;

    const requestQR = () => {
        if (!whapiToken) return;
        setQrLoading(true);
        const fd = new FormData();
        fd.set("intent", "get_qr");
        fd.set("whapiToken", whapiToken);
        fd.set("channelId", channel._id);
        onSubmit(fd);
    };

    const handleLogout = () => {
        if (!whapiToken) return;
        if (!globalThis.confirm("¿Desconectar el canal de WhatsApp? Podrás volver a conectarlo escaneando un nuevo código QR.")) return;
        const fd = new FormData();
        fd.set("intent", "logout_channel");
        fd.set("whapiToken", whapiToken);
        fd.set("channelId", channel._id);
        onSubmit(fd);
    };

    // Handle QR / connection response
    useEffect(() => {
        if (!fetcherData) return;

        if (fetcherData.disconnected) {
            setConnected(false);
            setPollActive(false);
            setQrLoading(false);
            setQrCode("");
            setShowDisconnected(true);
            return;
        }

        if (fetcherData.connected) {
            setConnected(true);
            setPollActive(false);
            setQrLoading(false);
            return;
        }

        if (fetcherData.qrCode) {
            setQrCode(fetcherData.qrCode);
            setQrLoading(false);
            return;
        }

        if (fetcherData.formError) {
            setQrLoading(false);
        }
    }, [fetcherData]);

    // Poll for QR / connection only when in QR mode
    useEffect(() => {
        if (!pollActive || !whapiToken || connectionMode !== "qr") return;

        requestQR();
        const interval = setInterval(() => {
            if (!connected) requestQR();
        }, 4000);

        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pollActive, whapiToken, connectionMode]);

    // Poll for connection after pairing code is shown
    useEffect(() => {
        if (!pairingCode || !whapiToken || connected) return;

        const interval = setInterval(() => {
            requestQR();
        }, 4000);

        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pairingCode, whapiToken, connected]);

    const handlePairingPhoneChange = (value: string) => {
        const clean = value.replace(/[^0-9]/g, "");
        setPairingPhone(clean);
        setPairingError("");
        setPhoneValid(clean.length >= 7 && clean.length <= 15);
    };

    const handleGeneratePairingCode = async () => {
        if (!pairingPhone.trim() || !phoneValid) {
            setPairingError("Ingresá un número válido con código de país. Ej: 59899123456");
            return;
        }
        setPairingError("");
        setPairingCode("");
        setPairingLoading(true);
        try {
            const result = await generatePairingCodeAction({ phoneNumber: pairingPhone, channelId: channel._id });
            setPairingCode(result.code);
        } catch (err: any) {
            setPairingError(err?.message || "No se pudo generar el código. Verificá el número e intentá de nuevo.");
        } finally {
            setPairingLoading(false);
        }
    };

    const handleSaveTestMode = () => {
        const fd = new FormData();
        fd.set("intent", "save_test_mode");
        fd.set("channelId", channel._id);
        fd.set("testMode", String(testMode));
        testPhones.filter(p => p.length >= 7).forEach(p => fd.append("testPhones", p));
        onSubmit(fd);
    };

    const handleReconnect = () => {
        setShowDisconnected(false);
        setConnectionMode("qr");
        setPollActive(true);
        setQrLoading(true);
    };

    const handleModeChange = (mode: "qr" | "pairing") => {
        setConnectionMode(mode);
        if (mode === "qr" && !qrCode && !qrLoading) {
            setQrLoading(true);
            requestQR();
        }
    };

    return (
        <>
            {/* Tab bar: Conexión | Modo */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 shrink-0">
                {(["connection", "mode"] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setWaTab(tab)}
                        className={cn(
                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                            waTab === tab
                                ? "border-primary text-primary"
                                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                    >
                        {tab === "connection"
                            ? <span className="flex items-center gap-2"><FaWhatsapp className="w-3.5 h-3.5" />Conexión</span>
                            : <span className="flex items-center gap-2"><FaToggleOn className="w-3.5 h-3.5" />Modo</span>
                        }
                    </button>
                ))}
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {waTab === "connection" && (!whapiToken ? (
                    <div className="text-center py-8 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-6">
                        <FaTriangleExclamation className="w-8 h-8 mx-auto mb-3" />
                        <p className="text-sm font-medium">Canal sin configuración de WhatsApp.</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Contactá al soporte si el problema persiste.</p>
                    </div>
                ) : connected ? (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                            <FaCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="text-center">
                            <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100">¡Conectado!</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                El canal de WhatsApp está activo y listo para recibir mensajes.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800/50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSubmitting ? <FaSpinner className="animate-spin w-3.5 h-3.5" /> : null}
                            Desconectar
                        </button>
                    </div>
                ) : showDisconnected ? (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                            <FaXmark className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                        </div>
                        <div className="text-center">
                            <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Canal desconectado</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                La sesión de WhatsApp fue cerrada correctamente.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleReconnect}
                            className="btn-primary text-sm flex items-center gap-2"
                        >
                            Volver a conectar
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Mode tabs */}
                        <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => handleModeChange("qr")}
                                className={cn(
                                    "flex-1 py-2.5 text-sm font-medium transition-colors",
                                    connectionMode === "qr"
                                        ? "bg-primary text-white"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                )}
                            >
                                Escanear QR
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange("pairing")}
                                className={cn(
                                    "flex-1 py-2.5 text-sm font-medium transition-colors",
                                    connectionMode === "pairing"
                                        ? "bg-primary text-white"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                )}
                            >
                                Vincular por número
                            </button>
                        </div>

                        {/* QR tab content */}
                        {connectionMode === "qr" && (
                            qrLoading ? (
                                <div className="flex flex-col items-center gap-4 py-12">
                                    <FaSpinner className="w-10 h-10 text-primary animate-spin" />
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Generando código QR...</p>
                                </div>
                            ) : fetcherData?.formError ? (
                                <div className="flex flex-col items-center gap-4 py-8">
                                    <div className="text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center max-w-xs">
                                        <FaTriangleExclamation className="w-6 h-6 mx-auto mb-2" />
                                        <p className="text-sm">{fetcherData.formError}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setQrLoading(true); requestQR(); }}
                                        className="btn-secondary text-sm"
                                    >
                                        Reintentar
                                    </button>
                                </div>
                            ) : qrCode ? (
                                <div className="flex flex-col items-center gap-5">
                                    <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700">
                                        <img src={qrCode} alt="Código QR de WhatsApp" className="w-56 h-56 sm:w-64 sm:h-64" />
                                    </div>
                                    <div className="text-center space-y-1.5">
                                        <h4 className="font-semibold text-slate-800 dark:text-slate-100">Escaneá el código QR</h4>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                                            Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo y escaneá este código.
                                        </p>
                                    </div>
                                </div>
                            ) : null
                        )}

                        {/* Pairing code tab content */}
                        {connectionMode === "pairing" && (
                            <div className="space-y-5">
                                {!pairingCode ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Tu número de WhatsApp
                                            </label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                                                    <FaWhatsapp className={cn("w-4 h-4 transition-colors", phoneValid ? "text-green-500" : "text-slate-400")} />
                                                </div>
                                                <input
                                                    type="tel"
                                                    inputMode="numeric"
                                                    value={pairingPhone}
                                                    onChange={e => handlePairingPhoneChange(e.target.value)}
                                                    onKeyDown={e => e.key === "Enter" && phoneValid && !pairingLoading && handleGeneratePairingCode()}
                                                    placeholder="59899123456"
                                                    className={cn(
                                                        "input-field pl-10 pr-4 font-mono tracking-wider",
                                                        pairingError && "border-red-400 dark:border-red-600 focus:ring-red-400/50"
                                                    )}
                                                    disabled={pairingLoading}
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Con código de país, sin espacios ni +. Ej: <span className="font-mono">598</span> para Uruguay.
                                            </p>
                                        </div>
                                        {pairingError && (
                                            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                                <FaTriangleExclamation className="w-3.5 h-3.5 shrink-0" />
                                                {pairingError}
                                            </p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleGeneratePairingCode}
                                            disabled={pairingLoading || !phoneValid}
                                            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {pairingLoading ? (
                                                <>
                                                    <FaSpinner className="animate-spin w-4 h-4" />
                                                    Generando...
                                                </>
                                            ) : "Generar código"}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex flex-col items-center gap-3 py-4">
                                            <p className="text-sm text-slate-500 dark:text-slate-400">Tu código de vinculación</p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(pairingCode);
                                                    setPairingCodeCopied(true);
                                                    toast.success("Código copiado al portapapeles");
                                                    setTimeout(() => setPairingCodeCopied(false), 2000);
                                                }}
                                                className="group relative bg-slate-100 dark:bg-slate-800 rounded-2xl px-8 py-5 border-2 border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary transition-colors cursor-pointer"
                                                title="Tocar para copiar"
                                            >
                                                <span className="font-mono text-4xl font-bold tracking-widest text-slate-900 dark:text-slate-100">
                                                    {pairingCode}
                                                </span>
                                                <span className="absolute bottom-1.5 right-3 text-[10px] font-medium text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                    {pairingCodeCopied ? "¡Copiado!" : "Tocar para copiar"}
                                                </span>
                                            </button>
                                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                                <FaSpinner className="animate-spin w-3 h-3" />
                                                Esperando que ingreses el código en WhatsApp...
                                            </div>
                                        </div>
                                        <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                                            <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">1.</span> Abrí WhatsApp en tu teléfono</li>
                                            <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">2.</span> Andá a <strong>Dispositivos vinculados</strong></li>
                                            <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">3.</span> Tocá <strong>Vincular un dispositivo</strong></li>
                                            <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">4.</span> Tocá <strong>Vincular con el número de teléfono</strong></li>
                                            <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">5.</span> Ingresá el código que aparece arriba</li>
                                        </ol>
                                        <button
                                            type="button"
                                            onClick={() => { setPairingCode(""); setPairingPhone(""); }}
                                            className="btn-secondary text-sm w-full"
                                        >
                                            Generar otro código
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                ))}

                {waTab === "mode" && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div>
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {testMode ? "Modo de pruebas" : "Modo en vivo"}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {testMode
                                        ? "El bot solo responde a los números habilitados abajo."
                                        : "El bot responde a todos los mensajes entrantes."}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setTestMode(!testMode)}
                                className={cn(
                                    "shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors",
                                    testMode
                                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
                                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                )}
                            >
                                {testMode ? "En pruebas" : "En vivo"}
                            </button>
                        </div>

                        {testMode && (
                            <>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Números habilitados para pruebas
                                    </label>
                                    <div className="space-y-2">
                                        {testPhones.map((phone, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={phone}
                                                    onChange={e => {
                                                        const val = e.target.value.replace(/\D/g, "");
                                                        const clean = val.startsWith("0") ? val.slice(1) : val;
                                                        setTestPhones(prev => prev.map((p, i) => i === idx ? clean : p));
                                                    }}
                                                    placeholder="59899123456"
                                                    className="input-field font-mono text-sm flex-1"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setTestPhones(prev => prev.filter((_, i) => i !== idx))}
                                                    className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                >
                                                    <FaXmark className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setTestPhones(prev => [...prev, ""])}
                                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                                        >
                                            <FaPlus className="w-3 h-3" /> Agregar número
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Con código de país, sin + ni espacios (ej: 59899123456). El bot solo responderá a estos números.
                                    </p>
                                </div>
                                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                                    <FaTriangleExclamation className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>Los mensajes de números no habilitados son recibidos pero el bot no responde.</span>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    Cerrar
                </button>
                {waTab === "mode" && (
                    <button
                        onClick={handleSaveTestMode}
                        disabled={isSubmitting}
                        className={cn("btn-primary min-w-36", isSubmitting && "opacity-70 cursor-wait")}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <FaSpinner className="animate-spin w-3.5 h-3.5" /> Guardando...
                            </span>
                        ) : "Guardar modo"}
                    </button>
                )}
            </div>
        </>
    );
}

// ─── Modal Overlay ────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    // Close on Escape
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
