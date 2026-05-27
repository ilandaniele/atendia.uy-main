import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import {
    FaSpinner, FaTrash, FaChevronLeft,
    FaPlus, FaPen, FaXmark, FaEye, FaEyeSlash, FaBolt, FaCheck, FaCopy, FaClock,
} from "react-icons/fa6";
import { Link, redirect, useActionData, useLoaderData, useSearchParams, useSubmit, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn, getEnv } from "utils/utils";
import z from "zod";
import Switch from "../components/switch";
import Breadcrumbs from "../components/breadcrumbs";
import ClientMembersModal from "./components/client-members-modal";

interface LoaderData {
    client: Doc<"clients"> | null;
    isNew: boolean;
}

// ─── WebhookModal ─────────────────────────────────────────────────────────────

function WebhookModal({
    webhook,
    saving,
    onSave,
    onClose,
}: {
    webhook: WebhookConfig | null;
    saving: boolean;
    onSave: (wh: WebhookConfig) => Promise<void>;
    onClose: () => void;
}) {
    const [name, setName] = useState(webhook?.name ?? "");
    const [url, setUrl] = useState(webhook?.url ?? "");
    const [secret, setSecret] = useState(webhook?.secret ?? crypto.randomUUID());
    const [showSecret, setShowSecret] = useState(false);
    const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
    const [enabled, setEnabled] = useState(webhook?.enabled ?? true);

    const toggleEvent = (ev: string) =>
        setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
        if (!url.trim() || !/^https?:\/\/.+/.test(url.trim())) { toast.error("La URL no es válida"); return; }
        if (events.length === 0) { toast.error("Selecciona al menos un evento"); return; }
        await onSave({
            id: webhook?.id ?? "",
            name: name.trim(),
            url: url.trim(),
            secret: secret.trim() || undefined,
            events,
            enabled,
        });
    };

    const groups = Array.from(new Set(WEBHOOK_EVENTS.map((e) => e.group)));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        {webhook ? "Editar webhook" : "Nuevo webhook"}
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>

                <form id="webhook-form-admin" onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Nombre */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Nombre</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: CRM HubSpot"
                            className="block w-full px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-slate-400"
                        />
                    </div>

                    {/* URL */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">URL destino</label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://crm.ejemplo.com/webhook"
                            className="block w-full px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-slate-400"
                        />
                    </div>

                    {/* Secret */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Clave secreta (HMAC)
                        </label>
                        {!webhook && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                                Generada automáticamente. Guardala en un lugar seguro para verificar las notificaciones.
                            </p>
                        )}
                        <div className="relative">
                            <input
                                type={showSecret ? "text" : "password"}
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                className="block w-full pr-16 px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => { navigator.clipboard.writeText(secret); toast.success("Clave copiada"); }}
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                    title="Copiar clave"
                                >
                                    <FaCopy className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSecret((v) => !v)}
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                    {showSecret ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Eventos */}
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Eventos</label>
                        {groups.map((group) => (
                            <div key={group}>
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{group}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEBHOOK_EVENTS.filter((e) => e.group === group).map((ev) => (
                                        <button
                                            key={ev.value}
                                            type="button"
                                            onClick={() => toggleEvent(ev.value)}
                                            className={cn(
                                                "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all",
                                                events.includes(ev.value)
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/40"
                                            )}
                                        >
                                            {ev.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Habilitado */}
                    <div className="flex items-center gap-3 pt-1">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => setEnabled((v) => !v)}
                            className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
                                enabled ? "bg-primary" : "bg-slate-200 dark:bg-slate-600"
                            )}
                        >
                            <span className={cn(
                                "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                                enabled ? "translate-x-5" : "translate-x-0.5"
                            )}>
                                {enabled && <FaCheck className="w-2.5 h-2.5 text-primary" />}
                            </span>
                        </button>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                            {enabled ? "Habilitado" : "Deshabilitado"}
                        </span>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className={cn("btn-primary min-w-24", saving && "opacity-70 cursor-wait")}
                        >
                            {saving ? <FaSpinner className="animate-spin" /> : "Guardar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

type WebhookConfig = {
    id: string;
    name: string;
    url: string;
    secret?: string;
    events: string[];
    enabled: boolean;
};

const WEBHOOK_EVENTS = [
    { value: "lead.created",        label: "Cliente potencial captado",     group: "Clientes Potenciales" },
    { value: "lead.updated",        label: "Cliente potencial actualizado", group: "Clientes Potenciales" },
    { value: "lead.deleted",        label: "Cliente potencial eliminado",   group: "Clientes Potenciales" },
    { value: "order.created",       label: "Pedido creado",                 group: "Pedidos"              },
    { value: "order.updated",       label: "Pedido actualizado",            group: "Pedidos"              },
    { value: "appointment.created", label: "Cita creada",                   group: "Citas"                },
    { value: "appointment.updated", label: "Cita actualizada",              group: "Citas"                },
];

const DEFAULT_TOKENS_BALANCE = 50000;
const DEFAULT_TRIAL_DAYS = 7;

const timezones = [
    { value: "America/Montevideo", label: "Montevideo" },
    { value: "America/Argentina/Buenos_Aires", label: "Argentina - Buenos Aires" },
    { value: "America/Argentina/Cordoba", label: "Argentina - Córdoba" },
    { value: "America/Argentina/Mendoza", label: "Argentina - Mendoza" },
    { value: "America/Argentina/Tucuman", label: "Argentina - Tucumán" },
];

const clientSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "El nombre es obligatorio"),
    businessName: z.string().min(1, "La razón social es obligatoria"),
    isActive: z.enum(["true", "false"]),
    timezone: z.string().min(1, "La zona horaria es obligatoria"),
    enableAgenda: z.enum(["true", "false"]),
    enableOrders: z.enum(["true", "false"]),
    updatedBy: z.string().optional(),
});

export function meta() {
    return [
        { title: "Atendia — Administración — Cliente" }
    ];
}

export async function loader({ params }: LoaderFunctionArgs) {
    const { id } = params;

    if (!id || id === "nuevo") {
        return { client: null, isNew: true };
    }

    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const convex = new ConvexHttpClient(VITE_CONVEX_URL!);
    const client = await convex.query(api.clients.get, { id: id as Id<"clients"> });
    if (!client) throw new Response("Cliente no encontrado", { status: 404 });

    return {
        client,
        isNew: false
    };
}

function convexErrorMessage(error: any): string {
    const raw: string = error?.message ?? "Ocurrió un error inesperado";
    const match = raw.match(/Uncaught Error:\s*(.+)/);
    return match ? match[1].trim() : raw;
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const authToken = formData.get("authToken") as string | null;
    const formValues = Object.fromEntries(formData);

    const VITE_CONVEX_URL_FOR_CONFIG = getEnv("VITE_CONVEX_URL");
    const convexForConfig = new ConvexHttpClient(VITE_CONVEX_URL_FOR_CONFIG!);
    if (authToken) convexForConfig.setAuth(authToken);
    const sysConfig = await convexForConfig.query(api.systemConfig.get, {});
    const trialDays = sysConfig?.trialDays ?? DEFAULT_TRIAL_DAYS;
    const initialTokens = sysConfig?.defaultTrialTokens ?? DEFAULT_TOKENS_BALANCE;

    const getTrialEndDate = () => new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).getTime();

    // Validar el formulario
    const parsedData = clientSchema.safeParse(formValues);

    if (!parsedData.success) {
        const errors: Record<string, string> = {};
        parsedData.error.issues.forEach((issue) => {
            const path = issue.path.join(".");
            errors[path] = issue.message;
        });
        return { errors };
    }

    const {
        id,
        name,
        businessName,
        isActive,
        timezone,
        enableAgenda,
        enableOrders,
        updatedBy
    } = parsedData.data;

    try {
        const convex = convexForConfig;
        
        // Validar si el nombre ya existe en otro cliente
        const existingClient = await convex.query(api.clients.getByName, { name });
        if (existingClient) {
            if (!id || (id && existingClient._id !== id)) {
                return { errors: { name: "El nombre ya está registrado por otro cliente" } };
            }
        }

        const profileId = updatedBy as Id<"profiles">;

        if (id) {
            // Actualizar en Convex
            await convex.mutation(api.clients.update, {
                id: id as Id<"clients">,
                name,
                businessName,
                isActive: isActive === "true",
                timezone,
                features: {
                    enableAgenda: enableAgenda === "true",
                    enableOrders: enableOrders === "true"
                },
                updatedBy: profileId
            });

            return redirect(`/administracion/clientes/${id}?updated=true`);
        } else {
            // Crear cliente
            if (id) {
                // Fallback logic derived from original code structure
                await convex.mutation(api.clients.update, {
                    id: id as Id<"clients">,
                    name,
                    businessName,
                    isActive: isActive === "true",
                    timezone,
                    features: {
                        enableAgenda: enableAgenda === "true",
                        enableOrders: enableOrders === "true"
                    },
                    updatedBy: profileId
                });

                return redirect(`/administracion/clientes/${id}?updated=true`);
            } else {
                const clientId = await convex.mutation(api.clients.onboard, {
                    name,
                    businessName,
                    isActive: isActive === "true",
                    timezone,
                    features: {
                        enableAgenda: enableAgenda === "true",
                        enableOrders: enableOrders === "true"
                    },
                    tokensBalance: initialTokens,
                    trialEndsAt: getTrialEndDate()

                });
                return redirect(`/administracion/clientes/${clientId}`);
            }
        }
    } catch (error: any) {
        if (error instanceof Response) {
            throw error;
        }

        console.error("Error en action:", error);
        return { formError: convexErrorMessage(error) };
    }
}

export default function ClientDetail() {
    const loaderData = useLoaderData<LoaderData>();
    const actionData = useActionData<{ errors?: Record<string, string>, formError?: string }>();
    const [searchParams] = useSearchParams();

    const deleteClient = useAction(api.deleteClient.deleteClientExternalData);
    const giftTokens = useMutation(api.clients.giftTokens);
    const extendTrial = useMutation(api.clients.extendTrial);
    const adminAssignPlan = useMutation(api.clients.adminAssignPlan);
    const adminCancelSubscription = useAction(api.billing.adminCancelSubscription);
    const updateClient = useMutation(api.clients.update);
    const plans = useQuery(api.plans.list);

    const liveClient = useQuery(
        api.clients.get,
        loaderData.client?._id ? { id: loaderData.client._id } : "skip"
    );

    const [giftAmount, setGiftAmount] = useState("");
    const [isGifting, setIsGifting] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState<string>("");
    const [isAssigningPlan, setIsAssigningPlan] = useState(false);
    const [trialDays, setTrialDays] = useState("");
    const [isExtendingTrial, setIsExtendingTrial] = useState(false);
    const [isCancelingPlan, setIsCancelingPlan] = useState(false);

    const authToken = useAuthToken();
    const isNew = loaderData.isNew;
    const mode = searchParams.get("mode");
    const [isEditable, setIsEditable] = useState(isNew || mode === "edit");

    const [isLoading, setIsLoading] = useState(false);
    const [title, setTitle] = useState(isNew ? "Crear cliente" : "Ver cliente");

    // Estados del formulario
    const [name, setName] = useState(loaderData.client?.name || "");
    const [businessName, setBusinessName] = useState(loaderData.client?.businessName || "");
    const [isActive, setIsActive] = useState(loaderData.client?.isActive ?? true);
    const [timezone, setTimezone] = useState(loaderData.client?.timezone || "");
    const [enableAgenda, setEnableAgenda] = useState(loaderData.client?.features.enableAgenda ?? false);
    const [enableOrders, setEnableOrders] = useState(loaderData.client?.features.enableOrders ?? false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

    // ── Webhooks ──────────────────────────────────────────────────────────────
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>(
        (loaderData.client as any)?.webhooks ?? []
    );
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
    const [savingWebhooks, setSavingWebhooks] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const submit = useSubmit();
    
    const me = useQuery(api.profiles.me);

    useEffect(() => {
        if (isNew) {
            setTitle("Crear cliente");
            setIsEditable(true);
        } else if (mode === "edit") {
            setTitle("Editar cliente");
            setIsEditable(true);
        } else {
            setTitle("Ver cliente");
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

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        if (!name || !businessName || !timezone) {
            toast.error("Por favor completa todos los campos obligatorios");
            setIsLoading(false);
            return;
        }

        const formData = new FormData(formRef.current!);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    const handleGiftTokens = async () => {
        const amount = parseInt(giftAmount, 10);
        if (!amount || amount <= 0) {
            toast.error("Ingresa una cantidad válida de tokens");
            return;
        }
        setIsGifting(true);
        try {
            const newBalance = await giftTokens({ clientId: loaderData.client!._id, amount });
            toast.success(`Se acreditaron ${amount.toLocaleString()} tokens. Nuevo balance: ${newBalance?.toLocaleString()}`);
            setGiftAmount("");
        } catch (error) {
            toast.error("Error al acreditar los tokens");
            console.error(error);
        } finally {
            setIsGifting(false);
        }
    };

    const handleAssignPlan = async () => {
        if (!selectedPlanId) {
            toast.error("Selecciona un plan");
            return;
        }
        setIsAssigningPlan(true);
        try {
            const newBalance = await adminAssignPlan({
                clientId: loaderData.client!._id,
                planId: selectedPlanId as Id<"plans">,
            });
            const plan = plans?.find((p) => p._id === selectedPlanId);
            toast.success(`Plan "${plan?.name}" asignado. Tokens acreditados: ${plan?.tokens.toLocaleString()}. Nuevo balance: ${newBalance?.toLocaleString()}`);
            setSelectedPlanId("");
        } catch (error) {
            toast.error("Error al asignar el plan");
            console.error(error);
        } finally {
            setIsAssigningPlan(false);
        }
    };

    const handleCancelPlan = async () => {
        const currentClient = liveClient ?? loaderData.client;
        if (!currentClient?.plan) return;
        const hasDlocalSub = !!currentClient.dlocalGoSubscriptionId;
        const message = hasDlocalSub
            ? "Esto cancelará la suscripción en dLocal Go y removerá el plan del cliente. ¿Continuar?"
            : "Esto removerá el plan del cliente. ¿Continuar?";
        if (!globalThis.confirm(message)) return;
        setIsCancelingPlan(true);
        try {
            await adminCancelSubscription({ clientId: loaderData.client!._id });
            toast.success("Plan removido correctamente");
        } catch (error: any) {
            toast.error(error?.message?.replace(/^.*Uncaught Error:\s*/, "") || "Error al cancelar el plan");
            console.error(error);
        } finally {
            setIsCancelingPlan(false);
        }
    };

    const handleExtendTrial = async () => {
        const days = parseInt(trialDays, 10);
        if (!days || days <= 0) {
            toast.error("Ingresa una cantidad válida de días");
            return;
        }
        setIsExtendingTrial(true);
        try {
            const newTrialEndsAt = await extendTrial({ clientId: loaderData.client!._id, days });
            toast.success(`Período de prueba extendido hasta ${new Date(newTrialEndsAt).toLocaleDateString()}`);
            setTrialDays("");
        } catch (error: any) {
            toast.error(error?.message?.replace(/^.*Uncaught Error:\s*/, "") || "Error al extender el período de prueba");
            console.error(error);
        } finally {
            setIsExtendingTrial(false);
        }
    };

    const saveWebhooks = async (updated: WebhookConfig[]) => {
        if (!loaderData.client || !me) return;
        setSavingWebhooks(true);
        try {
            await updateClient({
                id: loaderData.client._id,
                webhooks: updated,
                updatedBy: me._id,
            });
            setWebhooks(updated);
        } catch {
            toast.error("Error al guardar los webhooks");
        } finally {
            setSavingWebhooks(false);
        }
    };

    const handleSaveWebhook = async (wh: WebhookConfig) => {
        const existing = webhooks.find((w) => w.id === wh.id);
        const updated = existing
            ? webhooks.map((w) => (w.id === wh.id ? wh : w))
            : [...webhooks, { ...wh, id: crypto.randomUUID() }];
        await saveWebhooks(updated);
        setWebhookModalOpen(false);
        setEditingWebhook(null);
        toast.success(existing ? "Webhook actualizado" : "Webhook agregado");
    };

    const handleDeleteWebhook = async (id: string) => {
        if (!globalThis.confirm("¿Eliminar este webhook?")) return;
        await saveWebhooks(webhooks.filter((w) => w.id !== id));
        toast.success("Webhook eliminado");
    };

    const handleToggleWebhook = async (id: string) => {
        await saveWebhooks(webhooks.map((w) => w.id === id ? { ...w, enabled: !w.enabled } : w));
    };

    const handleDelete = async (id: string) => {
        if (!globalThis.confirm("¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.")) {
            return;
        }

        setIsDeleting(true);

        try {
            const clientId = id as Id<"clients">;
            await deleteClient({ id: clientId });
            toast.success("Cliente eliminado correctamente");
            globalThis.location.href = "/administracion/clientes";
        } catch (error) {
            toast.error("Hubo un error al eliminar el cliente");
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="w-full flex flex-col items-center min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />

            <div className="w-full max-w-2xl px-4">
                <Breadcrumbs 
                    items={[
                        { label: "Clientes", href: "/administracion/clientes" },
                        { label: isNew ? "Nuevo" : (loaderData.client?.name || "Detalle") }
                    ]} 
                />
                <div className="flex flex-row justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
                    {!isNew && !isEditable && (
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsMembersModalOpen(true)}
                                className="btn-secondary"
                            >
                                Miembros
                            </button>
                            <Link to="asistentes" className="btn-secondary no-underline">
                                Asistentes
                            </Link>
                            <Link to="bases" className="btn-secondary no-underline">
                                Bases
                            </Link>
                            <Link to="?mode=edit" className="btn-primary no-underline">
                                Editar cliente
                            </Link>
                        </div>
                    )}
                    {!isNew && isEditable && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleDelete(loaderData.client!._id)}
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
                    {loaderData.client?._id && <input type="hidden" name="id" value={loaderData.client._id} />}
                    {me && <input type="hidden" name="updatedBy" value={me._id} />}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                placeholder="Nombre del cliente"
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting)
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                )}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="businessName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Razón Social
                            </label>
                            <input
                                name="businessName"
                                id="businessName"
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                disabled={!isEditable}
                                placeholder="Razón social"
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting)
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                )}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Zona Horaria
                            </label>
                            <select
                                name="timezone"
                                id="timezone"
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                disabled={!isEditable}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting)
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            >
                                <option value="" disabled>Seleccionar zona horaria</option>
                                {timezones.map((tz) => (
                                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                                ))}
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

                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Funcionalidades</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-1">
                                <Switch
                                    id="enableAgenda"
                                    checked={enableAgenda}
                                    onChange={(v) => setEnableAgenda(v)}
                                    label="Agenda"
                                    disabled={!isEditable}
                                />
                                <input type="hidden" name="enableAgenda" value={enableAgenda ? "true" : "false"} />
                            </div>

                            <div className="flex flex-col gap-1">
                                <Switch
                                    id="enableOrders"
                                    checked={enableOrders}
                                    onChange={(v) => setEnableOrders(v)}
                                    label="Pedidos"
                                    disabled={!isEditable}
                                />
                                <input type="hidden" name="enableOrders" value={enableOrders ? "true" : "false"} />
                            </div>
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
                                ) : "Guardar cliente"}
                            </button>
                        </div>
                    )}
                </form>
            </div>
            
            {!isNew && loaderData.client && (
                <div className="w-full max-w-2xl px-4 mt-6">
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Tokens</h2>
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                Balance actual: <span className="font-semibold text-slate-700 dark:text-slate-200">{(liveClient?.tokensBalance ?? loaderData.client.tokensBalance)?.toLocaleString()}</span>
                            </span>
                        </div>
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="giftAmount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Tokens a acreditar
                                </label>
                                <input
                                    id="giftAmount"
                                    type="number"
                                    min="1"
                                    value={giftAmount}
                                    onChange={(e) => setGiftAmount(e.target.value)}
                                    placeholder="Ej: 10000"
                                    className="block w-full px-4 py-3 rounded-xl border text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleGiftTokens}
                                disabled={isGifting || !giftAmount}
                                className={cn("btn-primary h-11.5", (isGifting || !giftAmount) && "opacity-50 cursor-not-allowed")}
                            >
                                {isGifting ? <FaSpinner className="animate-spin" /> : "Acreditar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isNew && loaderData.client && !(liveClient?.plan ?? loaderData.client.plan) && (
                <div className="w-full max-w-2xl px-4 mt-6">
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <FaClock className="w-4 h-4 text-amber-500" />
                                Período de prueba
                            </h2>
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                {(() => {
                                    const trialEndsAt = liveClient?.trialEndsAt ?? loaderData.client.trialEndsAt;
                                    if (!trialEndsAt) return <span>Sin trial activo</span>;
                                    const now = Date.now();
                                    const expired = trialEndsAt <= now;
                                    return (
                                        <>
                                            {expired ? "Vencido el " : "Vence el "}
                                            <span className={cn("font-semibold", expired ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200")}>
                                                {new Date(trialEndsAt).toLocaleDateString()}
                                            </span>
                                        </>
                                    );
                                })()}
                            </span>
                        </div>
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="trialDays" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Días a extender
                                </label>
                                <input
                                    id="trialDays"
                                    type="number"
                                    min="1"
                                    value={trialDays}
                                    onChange={(e) => setTrialDays(e.target.value)}
                                    placeholder="Ej: 7"
                                    className="block w-full px-4 py-3 rounded-xl border text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleExtendTrial}
                                disabled={isExtendingTrial || !trialDays}
                                className={cn("btn-primary h-11.5", (isExtendingTrial || !trialDays) && "opacity-50 cursor-not-allowed")}
                            >
                                {isExtendingTrial ? <FaSpinner className="animate-spin" /> : "Extender"}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Si el trial está vigente, se suman los días al vencimiento. Si está vencido o no existe, comienza desde hoy.
                        </p>
                    </div>
                </div>
            )}

            {!isNew && loaderData.client && (
                <div className="w-full max-w-2xl px-4 mt-6">
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Plan</h2>
                            {(liveClient?.plan ?? loaderData.client.plan) && (
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                        Plan actual:{" "}
                                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                                            {plans?.find((p) => p._id === (liveClient?.plan ?? loaderData.client?.plan))?.name ?? "—"}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleCancelPlan}
                                        disabled={isCancelingPlan}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors",
                                            isCancelingPlan && "opacity-50 cursor-not-allowed"
                                        )}
                                        title={(liveClient?.dlocalGoSubscriptionId ?? loaderData.client.dlocalGoSubscriptionId) ? "Cancelar suscripción en dLocal Go y quitar plan" : "Quitar plan asignado"}
                                    >
                                        {isCancelingPlan ? <FaSpinner className="animate-spin w-3 h-3" /> : <FaXmark className="w-3 h-3" />}
                                        Quitar plan
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 space-y-2">
                                <label htmlFor="planSelect" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Asignar plan manualmente
                                </label>
                                <select
                                    id="planSelect"
                                    value={selectedPlanId}
                                    onChange={(e) => setSelectedPlanId(e.target.value)}
                                    className="block w-full px-4 py-3 rounded-xl border text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                >
                                    <option value="">Seleccionar plan...</option>
                                    {plans?.map((plan) => (
                                        <option key={plan._id} value={plan._id}>
                                            {plan.name} — {plan.tokens.toLocaleString()} tokens / {plan.amount} {plan.currency}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={handleAssignPlan}
                                disabled={isAssigningPlan || !selectedPlanId}
                                className={cn("btn-primary h-11.5", (isAssigningPlan || !selectedPlanId) && "opacity-50 cursor-not-allowed")}
                            >
                                {isAssigningPlan ? <FaSpinner className="animate-spin" /> : "Asignar"}
                            </button>
                        </div>
                        {selectedPlanId && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Se acreditarán <span className="font-semibold">{plans?.find((p) => p._id === selectedPlanId)?.tokens.toLocaleString()}</span> tokens y se registrará una factura pagada en la sección de facturación del cliente.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {!isNew && loaderData.client && (
                <div className="w-full max-w-2xl px-4 mt-6">
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <FaBolt className="w-4 h-4 text-violet-500" />
                                    Webhooks
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Notificaciones HTTP a sistemas externos
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setEditingWebhook(null); setWebhookModalOpen(true); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
                            >
                                <FaPlus className="w-3 h-3" />
                                Agregar
                            </button>
                        </div>

                        {webhooks.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 dark:text-slate-600">
                                <FaBolt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Sin webhooks configurados</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {webhooks.map((wh) => (
                                    <div
                                        key={wh.id}
                                        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                                        {wh.name}
                                                    </span>
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                                                        wh.enabled
                                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                                                    )}>
                                                        {wh.enabled ? <FaCheck className="w-2 h-2" /> : <FaXmark className="w-2 h-2" />}
                                                        {wh.enabled ? "Activo" : "Inactivo"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                                    {wh.url}
                                                </p>
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {wh.events.map((ev) => (
                                                        <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                            {ev}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleWebhook(wh.id)}
                                                    disabled={savingWebhooks}
                                                    title={wh.enabled ? "Desactivar" : "Activar"}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                                >
                                                    {wh.enabled ? <FaEye className="w-3.5 h-3.5" /> : <FaEyeSlash className="w-3.5 h-3.5" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingWebhook(wh); setWebhookModalOpen(true); }}
                                                    title="Editar"
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                                >
                                                    <FaPen className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteWebhook(wh.id)}
                                                    disabled={savingWebhooks}
                                                    title="Eliminar"
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                >
                                                    <FaTrash className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {webhookModalOpen && (
                <WebhookModal
                    webhook={editingWebhook}
                    saving={savingWebhooks}
                    onSave={handleSaveWebhook}
                    onClose={() => { setWebhookModalOpen(false); setEditingWebhook(null); }}
                />
            )}

            {!isNew && loaderData.client && (
                <ClientMembersModal
                    clientId={loaderData.client._id}
                    isOpen={isMembersModalOpen}
                    onClose={() => setIsMembersModalOpen(false)}
                />
            )}
        </div>
    );
}
