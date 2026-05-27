import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { FaSpinner, FaTrash, FaEye, FaEyeSlash, FaXmark } from "react-icons/fa6";
import { Link, redirect, useActionData, useLoaderData, useSearchParams, useSubmit, type ActionFunctionArgs, type LoaderFunctionArgs, useParams, useFetcher } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn, getEnv } from "utils/utils";
import type { WhapiChannel } from "types/whapi.d.ts";
import z from "zod";
import Switch from "../../../components/switch";
import { WhapiPartnerService, WhapiService, DEFAULT_WHAPI_WEBHOOK_EVENTS, DEFAULT_WHAPI_MEDIA_SETTINGS } from "lib/services/whapi.service";
import Breadcrumbs from "../../../components/breadcrumbs";

interface LoaderData {
    channel: Doc<"channels"> | null;
    assistantId: string;
    clientId: string;
    isNew: boolean;
    whapiChannel?: WhapiChannel;
}

const channelSchema = z.object({
    id: z.string().optional(),
    clientId: z.string().min(1, "El ID del cliente es obligatorio"),
    assistantId: z.string().min(1, "El ID del asistente es obligatorio"),
    name: z.string().min(1, "El nombre es obligatorio"),
    type: z.string().min(1, "El tipo es obligatorio"),
    externalId: z.string().optional(),
    status: z.string().optional(),
    isActive: z.enum(["true", "false"]),
});

export function meta() {
    return [
        { title: "Atendia — Administración — Canal" }
    ];
}

export async function loader({ params }: LoaderFunctionArgs) {
    const { id, clientId, assistantId } = params;

    if (!clientId || !assistantId) {
        throw new Response("Parámetros incompletos", { status: 400 });
    }

    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const convex = new ConvexHttpClient(VITE_CONVEX_URL!);

    if (!id || id === "nuevo") {
        return { channel: null, isNew: true, clientId, assistantId };
    }

    const channel = await convex.query(api.channels.get, { id: id as Id<"channels"> });
    if (!channel) throw new Response("Canal no encontrado", { status: 404 });

    const whapiChannelId = channel.config.whapiChannelId;
    let whapiChannel: WhapiChannel = {
        apiUrl: "",
        id: "",
        creationTS: 0,
        ownerId: "",
        activeTill: 0,
        server: 1,
        token: "",
        stopped: false,
        trial: 0,
        status: "inactive",
        mode: "trial",
        name: "",
        phone: "",
        projectId: ""
    };

    if (channel.type === "whatsapp" && whapiChannelId) {
        const WHAPI_PARTNER_API_KEY = getEnv("WHAPI_PARTNER_API_KEY");
        const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
        whapiChannel = await whapi.getChannel(whapiChannelId) as WhapiChannel;
    }

    return {
        channel,
        isNew: false,
        clientId,
        assistantId,
        whapiChannel
    };
}

function convexErrorMessage(error: any): string {
    const raw: string = error?.message ?? "Ocurrió un error inesperado";
    const match = raw.match(/Uncaught Error:\s*(.+)/);
    return match ? match[1].trim() : raw;
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const intent = formData.get("intent");
    const authToken = formData.get("authToken") as string | null;

    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const convex = new ConvexHttpClient(VITE_CONVEX_URL!);
    if (authToken) convex.setAuth(authToken);

    // Manejo de guardado de configuración
    if (intent === "save_config") {
        const id = formData.get("id") as string;
        const allowedDomainsStr = formData.get("allowedDomains") as string;
        const allowedDomains = allowedDomainsStr.split("\n").filter(d => d.trim() !== "");

        try {
            await convex.mutation(api.channels.update, {
                id: id as Id<"channels">,
                config: {
                    allowedDomains
                }
            });
            return { success: true, message: "Configuración guardada correctamente" };
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    // Manejo de actualización de estado
    if (intent === "update_status") {
        const id = formData.get("id") as string;
        const status = formData.get("status") as string;

        try {
            await convex.mutation(api.channels.update, {
                id: id as Id<"channels">,
                status
            });
            return { success: true, message: "Estado actualizado correctamente" };
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    if (intent === "regenerate_whapi") {
        const id = formData.get("id") as string;
        const clientId = formData.get("clientId") as string;
        const assistantId = formData.get("assistantId") as string;

        try {
            const existingChannel = await convex.query(api.channels.get, { id: id as Id<"channels"> });
            if (!existingChannel) return { formError: "Canal no encontrado" };

            const WHAPI_PARTNER_API_KEY = getEnv("WHAPI_PARTNER_API_KEY");
            if (!WHAPI_PARTNER_API_KEY) return { formError: "WHAPI_PARTNER_API_KEY no configurada en el entorno" };

            const VITE_SITE_URL = getEnv("VITE_SITE_URL");
            if (!VITE_SITE_URL) return { formError: "VITE_SITE_URL no configurada en el entorno" };

            const client = await convex.query(api.clients.get, { id: existingChannel.client as Id<"clients"> });
            const channelName = `${existingChannel.name} - ${client?.businessName || "Cliente"}`;

            const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
            const newWhapiChannel = await whapi.createChannel(channelName);
            if (!newWhapiChannel) return { formError: "Error al crear canal en Whapi" };

            const channelWhapiService = new WhapiService({ token: newWhapiChannel.token, apiUrl: newWhapiChannel.apiUrl });
            await channelWhapiService.updateChannelSettings({
                media: DEFAULT_WHAPI_MEDIA_SETTINGS,
                webhooks: [{
                    mode: "body",
                    url: `${VITE_SITE_URL}/api/webhooks/whapi/${id}`,
                    events: DEFAULT_WHAPI_WEBHOOK_EVENTS,
                }]
            });

            await convex.mutation(api.channels.update, {
                id: id as Id<"channels">,
                config: {
                    ...existingChannel.config,
                    whapiChannelId: newWhapiChannel.id,
                    whapiToken: newWhapiChannel.token,
                    whapiApiUrl: newWhapiChannel.apiUrl,
                }
            });

            return redirect(`/administracion/clientes/${clientId}/asistentes/${assistantId}/canales/${id}?configOpen=1`);
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    if (intent === "resync_webhooks") {
        const id = formData.get("id") as string;
        const whapiToken = formData.get("whapiToken") as string;
        const whapiApiUrl = (formData.get("whapiApiUrl") as string) || undefined;

        try {
            const VITE_SITE_URL = getEnv("VITE_SITE_URL");
            if (!VITE_SITE_URL) return { formError: "VITE_SITE_URL no configurada en el entorno" };
            if (!whapiToken) return { formError: "El canal no tiene token de Whapi configurado" };

            const svc = new WhapiService({ token: whapiToken, apiUrl: whapiApiUrl });
            const result = await svc.updateChannelSettings({
                media: DEFAULT_WHAPI_MEDIA_SETTINGS,
                webhooks: [{
                    mode: "body",
                    url: `${VITE_SITE_URL}/api/webhooks/whapi/${id}`,
                    events: DEFAULT_WHAPI_WEBHOOK_EVENTS,
                }]
            });
            if (!result) return { formError: "Whapi rechazó la actualización del webhook." };

            return { success: true, message: "Webhook reconfigurado correctamente." };
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    if (intent === "logout_channel") {
        const id = formData.get("id") as string;
        const whapiToken = formData.get("whapiToken") as string;

        try {
            const whapi = new WhapiService({ token: whapiToken });
            await whapi.logout();

            await convex.mutation(api.channels.update, {
                id: id as Id<"channels">,
                status: "disconnected",
            });

            return { success: true, disconnected: true, message: "Canal desconectado correctamente" };
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    if (intent === "delete_channel") {
        const id = formData.get("id") as string;
        const whapiChannelId = formData.get("whapiChannelId") as string;

        try {
            await convex.mutation(api.channels.remove, { id: id as Id<"channels"> });
            
            if (whapiChannelId) {
                const WHAPI_PARTNER_API_KEY = getEnv("WHAPI_PARTNER_API_KEY") || getEnv("VITE_WHAPI_PARTNER_API_KEY");
                if (WHAPI_PARTNER_API_KEY) {
                    const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
                    await whapi.deleteChannel(whapiChannelId);
                }
            }

            return redirect(`/administracion/clientes/${formData.get("clientId")}/asistentes/${formData.get("assistantId")}/canales`);
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    // Manejo de creación/edición del canal
    const formValues = Object.fromEntries(formData);
    const parsedData = channelSchema.safeParse(formValues);

    if (!parsedData.success) {
        const errors: Record<string, string> = {};
        parsedData.error.issues.forEach((issue) => {
            const path = issue.path.join(".");
            errors[path] = issue.message;
        });
        return { errors };
    }

    const config: {
        allowedDomains?: string[];
        accessToken?: string;
        whapiToken?: string;
        whapiChannelId?: string;
    } = {};

    const { 
        id, 
        clientId,
        assistantId,
        name, 
        type,
        externalId,
        status,
        isActive
    } = parsedData.data;

    try {
        let configToSave: any = {};

        // Función helper para crear canal en Whapi
        const ensureWhapiChannel = async (convexChannelId: string) => {
            const WHAPI_PARTNER_API_KEY = getEnv("WHAPI_PARTNER_API_KEY");
            if (!WHAPI_PARTNER_API_KEY) {
                throw new Response("WHAPI_PARTNER_API_KEY no configurada en el entorno", { status: 500 });
            }

            const VITE_SITE_URL = getEnv("VITE_SITE_URL");
            if (!VITE_SITE_URL) {
                throw new Response("VITE_SITE_URL no configurada en el entorno", { status: 500 });
            }

            const client = await convex.query(api.clients.get, { id: clientId as Id<"clients"> });
            const channelName = `${name} - ${client?.businessName || "Cliente"}`;

            const whapi = new WhapiPartnerService({ token: WHAPI_PARTNER_API_KEY });
            const channel = await whapi.createChannel(channelName);
            
            if (!channel) {
                throw new Response("Error al crear canal en Whapi", { status: 500 });
            }

            const channelWhapi = new WhapiService({ token: channel.token, apiUrl: channel.apiUrl });
            await channelWhapi.updateChannelSettings({
                media: DEFAULT_WHAPI_MEDIA_SETTINGS,
                webhooks: [
                    {
                        mode: "body",
                        url: `${VITE_SITE_URL}/api/webhooks/whapi/${convexChannelId}`,
                        events: DEFAULT_WHAPI_WEBHOOK_EVENTS,
                    }
                ]
            });
            
            return {
                whapiChannelId: channel.id,
                whapiToken: channel.token
            };
        };

        if (id) {
            const existingChannel = await convex.query(api.channels.get, { id: id as Id<"channels"> });
            if (!existingChannel) {
                throw new Response("Canal no encontrado para actualizar", { status: 404 });
            }

            // Si es WhatsApp y no tiene configuración de Whapi, la creamos
            if (type === "whatsapp" && !existingChannel.config?.whapiChannelId) {
                const whapiData = await ensureWhapiChannel(id);
                configToSave = { ...existingChannel.config, ...whapiData };
            } else {
                configToSave = existingChannel.config;
            }

            await convex.mutation(api.channels.update, {
                id: id as Id<"channels">,
                name,
                type,
                externalId: externalId || "",
                status: status || "disconnected",
                isActive: isActive === "true",
                client: clientId as Id<"clients">,
                assistant: assistantId as Id<"assistants">,
                config: configToSave
            });

             return redirect(`/administracion/clientes/${clientId}/asistentes/${assistantId}/canales`);
        } else {
            // Creación de nuevo canal
            let externalIdToSave = externalId;
            let configToSaveInitial = {};

            // Si es tipo WEB y no tiene token, lo generamos automáticamente
            if (type === "web" && !externalId) {
                // Generamos un token aleatorio similar al de convex/clients.ts
                externalIdToSave = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
                configToSaveInitial = {
                    accessToken: externalIdToSave,
                    allowedDomains: [],
                    theme: {
                        primaryColor: "#000000",
                        position: "bottom-right"
                    }
                };
            }

            const newChannelId = await convex.mutation(api.channels.create, {
                name,
                type,
                externalId: externalIdToSave || crypto.randomUUID(),
                status: status || (type === "web" ? "connected" : "pending"),
                isActive: isActive === "true",
                client: clientId as Id<"clients">,
                assistant: assistantId as Id<"assistants">,
                config: configToSaveInitial
            });

            if (type === "whatsapp") {
                const whapiData = await ensureWhapiChannel(newChannelId);
                await convex.mutation(api.channels.update, {
                    id: newChannelId,
                    config: whapiData
                });
            }

            return redirect(`/administracion/clientes/${clientId}/asistentes/${assistantId}/canales`);
        }

    } catch (error: any) {
        console.error("Error en action:", error);
        return { formError: convexErrorMessage(error) };
    }
}

export default function ChannelDetail() {
    const loaderData = useLoaderData<LoaderData>();
    const actionData = useActionData<{ errors?: Record<string, string>, formError?: string, success?: boolean, message?: string }>();
    const [searchParams] = useSearchParams();
    const fetcher = useFetcher();
    
    const authToken = useAuthToken();
    const isNew = loaderData.isNew;
    const mode = searchParams.get("mode");
    const configOpen = searchParams.get("configOpen");
    const [isEditable, setIsEditable] = useState(isNew || mode === "edit");
    const whapiChannel = loaderData.whapiChannel;
    
    const [isLoading, setIsLoading] = useState(false);
    const [title, setTitle] = useState(isNew ? "Crear canal" : "Ver canal");
    
    const [name, setName] = useState(loaderData.channel?.name || "");
    const [type, setType] = useState(loaderData.channel?.type || "web");
    const [isActive, setIsActive] = useState(loaderData.channel?.isActive ?? true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRegeneratingWhapi, setIsRegeneratingWhapi] = useState(false);
    const [showDisconnectedView, setShowDisconnectedView] = useState(false);
    const [externalId, setExternalId] = useState(loaderData.channel?.externalId || "");
    const [status, setStatus] = useState(loaderData.channel?.status || "pending");
    
    // Config modal states
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(!!configOpen);
    const [allowedDomains, setAllowedDomains] = useState<string[]>(loaderData.channel?.config?.allowedDomains || []);
    const [domainInput, setDomainInput] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [qrLoading, setQrLoading] = useState(true);
    const [qrError, setQrError] = useState<string | null>(null);
    const [qrCode, setQrCode] = useState("");
    const [readQrCode, setReadQrCode] = useState(true);

    const formRef = useRef<HTMLFormElement>(null);
    const submit = useSubmit();

    const client = useQuery(api.clients.get, { id: loaderData.clientId as Id<"clients"> });
    const assistant = useQuery(api.assistants.get, { id: loaderData.assistantId as Id<"assistants"> });
    const removeChannel = useMutation(api.channels.remove);

    useEffect(() => {
        if (isNew) {
            setTitle("Crear canal");
            setIsEditable(true);
            setStatus("pending");
        } else if (mode === "edit") {
            setTitle("Editar canal");
            setIsEditable(true);
        } else {
            setTitle("Ver canal");
            setIsEditable(false);
        }
        setIsLoading(false);
    }, [isNew, mode, loaderData]);

    useEffect(() => {
        if (actionData?.errors) {
            Object.values(actionData.errors).forEach(error => toast.error(error));
            setIsLoading(false);
        }
        if (actionData?.formError) {
            toast.error(actionData.formError);
            setIsLoading(false);
        }
    }, [actionData]);

    // Efecto para manejar respuesta del fetcher (guardado de config)
    useEffect(() => {
        if (fetcher.data?.disconnected) {
            toast.success(fetcher.data.message);
            setStatus("disconnected");
            setReadQrCode(false);
            setQrLoading(false);
            setQrError(null);
            setShowDisconnectedView(true);
        } else if (fetcher.data?.success) {
            toast.success(fetcher.data.message);
            setIsConfigModalOpen(false);
        } else if (fetcher.data?.formError) {
            toast.error(fetcher.data.formError);
        }
    }, [fetcher.data]);

    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        async function checkConnectionAndQR() {
            if (!whapiChannel || !whapiChannel.token) {
                setQrError("No se encontró token de Whapi. Por favor verifica la configuración del canal.");
                setQrLoading(false);
                return;
            }
            
            const whapi = new WhapiService({ token: whapiChannel.token });
            
            try {
                // 1. Verificar estado actual
                const health = await whapi.checkHealth();
                
                // Si el estado no es AUTH_QR (código 3 en Whapi suele ser espera de QR, o 0/null si no auth)
                // Ajustar lógica según respuesta real de Whapi. Asumiremos que si channel está activo/autenticado es éxito.
                // Whapi health returns status.text = "AUTHENTICATED" or code != simple wait
                if (health && health.status && health.status.text === "AUTHENTICATED") {
                    setReadQrCode(false);
                    setQrLoading(false);
                    setQrError(null);
                    
                    // Actualizar estado en Convex si aún no está 'connected'
                    if (status !== "connected") {
                        setStatus("connected");
                        const formData = new FormData();
                        formData.set("intent", "update_status");
                        formData.set("id", loaderData.channel?._id || "");
                        formData.set("status", "connected");
                        if (authToken) formData.set("authToken", authToken);
                        fetcher.submit(formData, { method: "POST" });
                    }
                    return; // Ya conectado, no pedir QR
                }

                // 2. Si no está conectado, pedir QR
                if (readQrCode) {
                    const response = await whapi.getQRCode();
                    console.log("Whapi QR response:", response);
                    
                    // @ts-ignore
                    if (response?.status === "ALREADY_LOGGED_IN") {
                         setReadQrCode(false);
                         setQrLoading(false);
                         setQrError(null);
                         
                         // Actualizar estado en Convex si aún no está 'connected'
                         if (status !== "connected") {
                             setStatus("connected"); // Actualiza UI
                             // Enviar actualización al servidor sin recargar
                             const formData = new FormData();
                             formData.set("intent", "update_status");
                             formData.set("id", loaderData.channel?._id || "");
                             formData.set("status", "connected");
                             if (authToken) formData.set("authToken", authToken);
                             fetcher.submit(formData, { method: "POST" });
                         }
                         return;
                    }

                    // @ts-ignore
                    if (response && (response.status === "OK" || response.base64 || (response.code === 200 && response.base64))) {
                        // @ts-ignore
                        setQrCode(response.base64 as string);
                        setQrLoading(false);
                        setQrError(null);
                    } else if (response === null) {
                         setQrError("Error al conectar con el servicio de WhatsApp. Intenta de nuevo en unos momentos.");
                         setQrLoading(false);
                    } else {
                        console.warn("Respuesta QR desconocida:", response);
                    }
                }
            } catch (error) {
                console.error("Error checking Whapi status", error);
                setQrError("Ocurrió un error al intentar obtener el código QR.");
                setQrLoading(false);
            }
        }

        if (type === "whatsapp" && isConfigModalOpen && readQrCode) {
            // Cargar inmediatamente
            checkConnectionAndQR();
            // Polling cada 3 segundos para respuesta rápida
            intervalId = setInterval(checkConnectionAndQR, 3000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [type, whapiChannel, isConfigModalOpen, readQrCode, authToken]);

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        
        if (!name || !type) {
            toast.error("Por favor completa todos los campos obligatorios");
            setIsLoading(false);
            return;
        }

        const formData = new FormData(formRef.current!);
        if (status) formData.set("status", status);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    const handleDelete = async (id: string) => {
        if (!globalThis.confirm("¿Estás seguro de que deseas eliminar este canal? Esta acción no se puede deshacer.")) {
            return;
        }

        setIsDeleting(true);

        const formData = new FormData();
        formData.set("intent", "delete_channel");
        formData.set("id", id);
        formData.set("clientId", loaderData.clientId);
        formData.set("assistantId", loaderData.assistantId);
        if (loaderData.channel?.config?.whapiChannelId) {
            formData.set("whapiChannelId", loaderData.channel.config.whapiChannelId);
        }
        if (authToken) formData.set("authToken", authToken);

        submit(formData, { method: "POST" });
    }

    const handleLogoutWhapi = () => {
        if (!whapiChannel?.token) return;
        if (!globalThis.confirm("¿Desconectar el canal de WhatsApp? Podrás volver a conectarlo escaneando un nuevo código QR.")) return;
        const formData = new FormData();
        formData.set("intent", "logout_channel");
        formData.set("id", loaderData.channel!._id);
        formData.set("whapiToken", whapiChannel.token);
        if (authToken) formData.set("authToken", authToken);
        fetcher.submit(formData, { method: "POST" });
    };

    const handleRegenerateWhapi = () => {
        if (!globalThis.confirm("¿Generar un nuevo canal de Whapi? Si ya existía uno, quedará huérfano en la plataforma de Whapi.")) return;
        setIsRegeneratingWhapi(true);
        const formData = new FormData();
        formData.set("intent", "regenerate_whapi");
        formData.set("id", loaderData.channel!._id);
        formData.set("clientId", loaderData.clientId);
        formData.set("assistantId", loaderData.assistantId);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    const handleResyncWebhooks = () => {
        if (!whapiChannel?.token) return;
        if (!globalThis.confirm("¿Resincronizar los webhooks de este canal con la configuración actual (mensajes, llamadas y multimedia)?")) return;
        const formData = new FormData();
        formData.set("intent", "resync_webhooks");
        formData.set("id", loaderData.channel!._id);
        formData.set("whapiToken", whapiChannel.token);
        if ((loaderData.channel?.config as any)?.whapiApiUrl) {
            formData.set("whapiApiUrl", (loaderData.channel?.config as any).whapiApiUrl);
        }
        if (authToken) formData.set("authToken", authToken);
        fetcher.submit(formData, { method: "POST" });
    };

    const handleCopyToken = () => {
        if (externalId) {
            navigator.clipboard.writeText(externalId);
            toast.success("Token copiado al portapapeles");
        }
    };

    const handleSaveConfig = () => {
        // Usar fetcher para enviar configuración sin recargar ni navegar
        const formData = new FormData();
        formData.set("intent", "save_config");
        formData.set("id", loaderData.channel?._id || "");
        // Enviamos los dominios unidos por salto de línea para que el action lo procese igual
        formData.set("allowedDomains", allowedDomains.join("\n"));
        if (authToken) formData.set("authToken", authToken);

        fetcher.submit(formData, { method: "POST" });
    };

    const handleAddDomain = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const domain = domainInput.trim();
            if (!domain) return;

            // Validación de dominio
            const isValid = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain);
            
            if (!isValid) {
                toast.error("Formato de dominio inválido (ej: dominio.com)");
                return;
            }

            if (allowedDomains.includes(domain)) {
                toast.error("El dominio ya está en la lista");
                setDomainInput("");
                return;
            }

            setAllowedDomains([...allowedDomains, domain]);
            setDomainInput("");
        }
    };

    const removeDomain = (domainToRemove: string) => {
        setAllowedDomains(allowedDomains.filter(d => d !== domainToRemove));
    };

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />
            
            {/* Modal de Configuración */}
            {isConfigModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                                Configuración de {type === 'web' ? 'Widget Web' : 'WhatsApp'}
                            </h3>
                            <button 
                                onClick={() => setIsConfigModalOpen(false)}
                                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            {type === 'web' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Token de Acceso
                                        </label>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <div className="relative flex-1">
                                                <input 
                                                    type={showToken ? "text" : "password"} 
                                                    value={externalId} 
                                                    readOnly 
                                                    onClick={(e) => e.currentTarget.select()}
                                                    className="block w-full pl-4 pr-10 py-2 rounded-xl border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowToken(!showToken)}
                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                                >
                                                    {showToken ? <FaEyeSlash /> : <FaEye />}
                                                </button>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={handleCopyToken}
                                                className="btn-secondary whitespace-nowrap"
                                            >
                                                Copiar
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Haz clic para seleccionar todo. Usa este token para inicializar el widget.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Dominios permitidos
                                        </label>
                                        
                                        <div className="min-h-30 block w-full px-4 py-3 rounded-xl border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 transition-all">
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {allowedDomains.map((domain, index) => (
                                                    <span 
                                                        key={index} 
                                                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 group"
                                                    >
                                                        {domain}
                                                        <button
                                                            type="button"
                                                            onClick={() => removeDomain(domain)}
                                                            className="ml-1.5 h-3.5 w-3.5 rounded-full inline-flex items-center justify-center text-primary/60 hover:bg-primary/20 hover:text-primary transition-colors"
                                                        >
                                                            <FaXmark size={10} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                            <input
                                                type="text"
                                                value={domainInput}
                                                onChange={(e) => setDomainInput(e.target.value)}
                                                onKeyDown={handleAddDomain}
                                                placeholder={allowedDomains.length === 0 ? "ejemplo.com (Presiona Enter)" : "Agregar otro..."}
                                                className="block w-full bg-transparent border-none p-0 text-sm focus:ring-0 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Ingresa el dominio y presiona Enter. No incluyas 'https://' ni 'www'.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {type === 'whatsapp' && (
                                <div className="py-4 text-center space-y-6">
                                    {showDisconnectedView ? (
                                        <div className="flex flex-col items-center space-y-4 py-8">
                                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                                                <FaXmark className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                                            </div>
                                            <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                                                Canal desconectado
                                            </h4>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                La sesión de WhatsApp fue cerrada correctamente.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowDisconnectedView(false);
                                                    setQrLoading(true);
                                                    setQrError(null);
                                                    setReadQrCode(true);
                                                }}
                                                className="btn-primary text-sm flex items-center gap-2"
                                            >
                                                Volver a conectar
                                            </button>
                                        </div>
                                    ) : qrError ? (
                                        <div className="flex flex-col items-center justify-center space-y-4 py-8">
                                            <div className="text-red-500 bg-red-100 dark:bg-red-900/30 p-4 rounded-xl max-w-xs">
                                                <p className="text-sm font-medium">{qrError}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <button
                                                    onClick={() => { setQrLoading(true); setQrError(null); setReadQrCode(true); }}
                                                    className="btn-secondary text-xs"
                                                >
                                                    Reintentar conexión
                                                </button>
                                                {!whapiChannel?.token && (
                                                    <button
                                                        onClick={handleRegenerateWhapi}
                                                        disabled={isRegeneratingWhapi}
                                                        className={cn("btn-primary text-xs", isRegeneratingWhapi && "opacity-70 cursor-wait")}
                                                    >
                                                        {isRegeneratingWhapi ? (
                                                            <><FaSpinner className="animate-spin mr-1 inline" />Generando...</>
                                                        ) : "Generar canal Whapi"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : qrLoading ? (
                                        <div className="flex flex-col items-center justify-center space-y-4 py-12">
                                            <FaSpinner className="w-10 h-10 text-primary animate-spin" />
                                            <p className="text-slate-500 dark:text-slate-400">Generando código QR...</p>
                                        </div>
                                    ) : (
                                        readQrCode ? (
                                            <div className="flex flex-col items-center space-y-4">
                                                <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
                                                    {qrCode && <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />}
                                                </div>
                                                <div className="space-y-2">
                                                    <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                                                        Escanea el código QR
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                                                        Abre WhatsApp en tu teléfono, ve a Dispositivos vinculados y escanea este código.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center space-y-4 py-8">
                                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                                                    ¡Conectado exitosamente!
                                                </h4>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    El canal de WhatsApp está activo y listo para usar.
                                                </p>
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleResyncWebhooks}
                                                        disabled={fetcher.state === "submitting"}
                                                        className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors flex items-center gap-2",
                                                            fetcher.state === "submitting" && "opacity-50 cursor-wait"
                                                        )}
                                                        title="Vuelve a registrar los eventos (mensajes, llamadas, multimedia) en Whapi sin regenerar el token."
                                                    >
                                                        {fetcher.state === "submitting" && <FaSpinner className="animate-spin w-3.5 h-3.5" />}
                                                        Resincronizar webhooks
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleLogoutWhapi}
                                                        disabled={fetcher.state === "submitting"}
                                                        className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800/50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2",
                                                            fetcher.state === "submitting" && "opacity-50 cursor-wait"
                                                        )}
                                                    >
                                                        {fetcher.state === "submitting" && <FaSpinner className="animate-spin w-3.5 h-3.5" />}
                                                        Desconectar
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                            <button 
                                onClick={() => setIsConfigModalOpen(false)}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            {type === 'web' && (
                                <button 
                                    onClick={handleSaveConfig}
                                    disabled={fetcher.state === "submitting"}
                                    className={cn("btn-primary", fetcher.state === "submitting" && "opacity-70 cursor-wait")}
                                >
                                    {fetcher.state === "submitting" ? "Guardando..." : "Guardar configuración"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-2xl px-4">
                <Breadcrumbs 
                    items={[
                        { label: "Clientes", href: "/administracion/clientes" },
                        { label: client?.name || "Cliente", href: `/administracion/clientes/${loaderData.clientId}` },
                        { label: "Asistentes", href: `/administracion/clientes/${loaderData.clientId}/asistentes` },
                        { label: assistant?.name || "Asistente", href: `/administracion/clientes/${loaderData.clientId}/asistentes/${loaderData.assistantId}` },
                        { label: "Canales", href: `/administracion/clientes/${loaderData.clientId}/asistentes/${loaderData.assistantId}/canales` },
                        { label: isNew ? "Nuevo" : (loaderData.channel?.name || "Detalle") }
                    ]} 
                />
                <div className="flex flex-row justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
                    {!isNew && (
                        <div className="flex flex-row justify-center align-middle gap-2">
                            <button 
                                onClick={() => setIsConfigModalOpen(true)}
                                className="btn-secondary"
                            >
                                Configurar conexión
                            </button>
                            {!isEditable && (
                                <Link to="?mode=edit" className="btn-primary no-underline">
                                    Editar canal
                                </Link>
                            )}
                        </div>
                    )}
                    
                    {!isNew && isEditable && (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleDelete(loaderData.channel!._id)}
                                className={cn(
                                    "flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors",
                                    isDeleting && "pointer-events-none opacity-50 cursor-not-allowed"
                                )}
                            >
                                <FaTrash className="mr-2" />
                                Eliminar
                            </button>
                        </div>
                    )}
                </div>

                <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-6">
                    {loaderData.channel?._id && <input type="hidden" name="id" value={loaderData.channel._id} />}
                    <input type="hidden" name="clientId" value={loaderData.clientId} />
                    <input type="hidden" name="assistantId" value={loaderData.assistantId} />

                    <div className="space-y-2">
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Nombre
                        </label>
                        <input
                            name="name"
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!isEditable}
                            placeholder="Nombre del canal"
                            className={cn(
                                "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                (!isEditable || isDeleting) 
                                    ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="type" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Tipo
                            </label>
                            <select
                                name="type"
                                id="type"
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                disabled={!isEditable}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting) 
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            >
                                <option value="web">Web Widget</option>
                                <option value="whatsapp">WhatsApp</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <Switch
                                id="isActive"
                                checked={isActive}
                                onChange={setIsActive}
                                label="Estado"
                                disabled={!isEditable}
                            />
                            <span className={cn("text-sm", isActive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{isActive ? "Activo" : "Inactivo"}</span>
                            <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
                        </div>
                    </div>

                    {(isEditable && !isDeleting) && (
                        <div className="pt-4 flex items-center justify-end gap-4">
                            {!isNew && (
                                <Link 
                                    to="." 
                                    onClick={() => setIsEditable(false)}
                                    className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                                >
                                    Cancelar
                                </Link>
                            )}
                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className={cn("btn-primary min-w-30", isLoading && "opacity-70 cursor-wait")}
                            >
                                {isLoading ? (
                                    <>
                                        <FaSpinner className="animate-spin mr-2" />
                                        Guardando...
                                    </>
                                ) : "Guardar canal"}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
