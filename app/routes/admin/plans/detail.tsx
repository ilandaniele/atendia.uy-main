import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { FaSpinner, FaTrash, FaFloppyDisk, FaChevronLeft, FaClock, FaRocket, FaCrown, FaStar, FaBolt, FaGem, FaCircleXmark, FaArrowsRotate, FaBoxArchive } from "react-icons/fa6";
import { Link, redirect, useActionData, useLoaderData, useSearchParams, useSubmit, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn, getEnv } from "utils/utils";
import z from "zod";
import Breadcrumbs from "../components/breadcrumbs";
import { DLocalService } from "lib/services/dlocal.service";

import type { Plan as DLocalPlan } from "lib/services/dlocal.service";

interface LoaderData {
    plan: Doc<"plans"> | null;
    isNew: boolean;
    dlocalPlan: DLocalPlan | null;
}

const AVAILABLE_ICONS = [
    { id: "FaClock", icon: <FaClock /> },
    { id: "FaRocket", icon: <FaRocket /> },
    { id: "FaCrown", icon: <FaCrown /> },
    { id: "FaStar", icon: <FaStar /> },
    { id: "FaBolt", icon: <FaBolt /> },
    { id: "FaGem", icon: <FaGem /> },
];

const planSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "El nombre es obligatorio"),
    description: z.string().min(1, "La descripción es obligatoria"),
    tokens: z.coerce.number().min(0, "Los tokens deben ser mayor o igual a 0"),
    icon: z.string().min(1, "El ícono es obligatorio"),
    amount: z.coerce.number().min(0, "El monto debe ser mayor o igual a 0"),
    currency: z.enum(["USD", "UYU"]),
    frequencyType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    frequencyValue: z.coerce.number().min(1, "El valor de frecuencia debe ser al menos 1"),
    archived: z.preprocess((val) => val === "true" || val === true, z.boolean()),
});

export function meta() {
    return [
        { title: "Atendia — Administración — Plan" }
    ];
}

export async function loader({ params }: LoaderFunctionArgs) {
    const { id } = params;

    if (!id || id === "nuevo") {
        return { plan: null, isNew: true, dlocalPlan: null };
    }

    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const convex = new ConvexHttpClient(VITE_CONVEX_URL!);
    const plan = await convex.query(api.plans.get, { planId: id as Id<"plans"> });
    if (!plan) throw new Response("Plan no encontrado", { status: 404 });

    let dlocalPlan: DLocalPlan | null = null;
    if (plan.dlocalPlanId) {
        try {
            const apiUrl = getEnv("DLOCALGO_API_URL");
            const apiKey = getEnv("DLOCALGO_API_KEY");
            const secretKey = getEnv("DLOCALGO_SECRET_KEY");
            const siteUrl = getEnv("SITE_URL") ?? "https://atendia.uy";
            if (apiUrl && apiKey && secretKey) {
                const dlocalSvc = new DLocalService({ apiUrl, apiKey, secretKey, siteUrl });
                dlocalPlan = await dlocalSvc.retrievePlan(plan.dlocalPlanId);
            }
        } catch {
            // dLocal no disponible, continúa sin el dato
        }
    }

    return { plan, isNew: false, dlocalPlan };
}

function convexErrorMessage(error: any): string {
    const raw: string = error?.message ?? "Ocurrió un error inesperado";
    // Convex wraps errors: "[CONVEX M(...)] [...] Server Error\nUncaught Error: <message>\n..."
    const match = raw.match(/Uncaught Error:\s*(.+)/);
    return match ? match[1].trim() : raw;
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const intent = formData.get("intent");
    const id = formData.get("id") as string;
    const authToken = formData.get("authToken") as string | null;

    const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
    const convex = new ConvexHttpClient(VITE_CONVEX_URL!);
    if (authToken) convex.setAuth(authToken);

    const DLOCALGO_API_URL = getEnv("DLOCALGO_API_URL");
    const DLOCALGO_API_KEY = getEnv("DLOCALGO_API_KEY");
    const DLOCALGO_SECRET_KEY = getEnv("DLOCALGO_SECRET_KEY");
    const SITE_URL = getEnv("SITE_URL");
    if (!DLOCALGO_API_URL || !DLOCALGO_API_KEY || !DLOCALGO_SECRET_KEY || !SITE_URL) {
        return { formError: "La configuración de dLocal Go no está completa. Verifica las variables de entorno." };
    }

    const dlocalSvc = new DLocalService({
        apiUrl: DLOCALGO_API_URL!,
        apiKey: DLOCALGO_API_KEY!,
        secretKey: DLOCALGO_SECRET_KEY!,
        siteUrl: SITE_URL!,
    });

    if (intent === "delete") {
        try {
            const plan = await convex.query(api.plans.get, { planId: id as Id<"plans"> });
            if (plan?.dlocalPlanId) {
                await dlocalSvc.cancelPlan(plan.dlocalPlanId);
            }
            await convex.mutation(api.plans.remove, { planId: id as Id<"plans"> });
            return redirect("/administracion/planes");
        } catch (error: any) {
            return { formError: convexErrorMessage(error) };
        }
    }

    if (intent === "refresh") {
        return { formError: "La renovación de enlace de dLocal está temporalmente deshabilitada." };
    }

    const formValues = Object.fromEntries(formData);
    const parsedData = planSchema.safeParse(formValues);

    if (!parsedData.success) {
        const errors: Record<string, string> = {};
        parsedData.error.issues.forEach((issue) => {
            const path = issue.path.join(".");
            errors[path] = issue.message;
        });
        return { errors };
    }

    const data = parsedData.data;
    const successUrl = formData.get("successUrl") as string | null;
    const errorUrl = formData.get("errorUrl") as string | null;
    const backUrl = formData.get("backUrl") as string | null;
    const notificationUrl = formData.get("notificationUrl") as string | null;

    try {
        if (id) {
            const existingPlan = await convex.query(api.plans.get, { planId: id as Id<"plans"> });
            if (!existingPlan) throw new Error("Plan no encontrado");

            if (existingPlan.dlocalPlanId && !data.archived) {
                await dlocalSvc.updatePlan(existingPlan.dlocalPlanId, {
                    name: data.name,
                    description: data.name,
                    amount: data.amount,
                    ...(successUrl ? { success_url: successUrl } : {}),
                    ...(errorUrl ? { error_url: errorUrl } : {}),
                    ...(backUrl ? { back_url: backUrl } : {}),
                    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
                });
            }

            const { id: _schemaId, ...updateData } = data;
            await convex.mutation(api.plans.update, {
                id: id as Id<"plans">,
                ...updateData
            });

            return redirect("/administracion/planes");
        } else {
            const dlocalPlan = await dlocalSvc.createPlan({
                name: data.name,
                description: data.name,
                amount: data.amount,
                frequencyType: data.frequencyType as any,
                frequencyValue: data.frequencyValue,
            });

            await convex.mutation(api.plans.create, {
                ...data,
                dlocalPlanId: dlocalPlan.id,
                subscriptionUrl: dlocalPlan.subscribe_url
            });

            return redirect("/administracion/planes");
        }
    } catch (error: any) {
        console.error("Error en action:", error);
        return { formError: convexErrorMessage(error) };
    }
}

export default function AdminPlanDetail() {
    const loaderData = useLoaderData<LoaderData>();
    const actionData = useActionData<{ errors?: Record<string, string>, formError?: string, refreshSuccess?: boolean }>();
    const [searchParams] = useSearchParams();
    const submit = useSubmit();

    const authToken = useAuthToken();
    const isNew = loaderData.isNew;
    const mode = searchParams.get("mode");
    const [isEditable, setIsEditable] = useState(isNew || mode === "edit");
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        setIsEditable(isNew || mode === "edit");
    }, [isNew, mode]);

    const [successUrl, setSuccessUrl] = useState(loaderData.dlocalPlan?.success_url ?? "");
    const [errorUrl, setErrorUrl] = useState(loaderData.dlocalPlan?.error_url ?? "");
    const [backUrl, setBackUrl] = useState(loaderData.dlocalPlan?.back_url ?? "");
    const [notificationUrl, setNotificationUrl] = useState(loaderData.dlocalPlan?.notification_url ?? "");

    const [name, setName] = useState(loaderData.plan?.name || "");
    const [description, setDescription] = useState(loaderData.plan?.description || "");
    const [tokens, setTokens] = useState(loaderData.plan?.tokens || 0);
    const [icon, setIcon] = useState(loaderData.plan?.icon || "FaRocket");
    const [amount, setAmount] = useState(loaderData.plan?.amount || 0);
    const [currency, setCurrency] = useState(loaderData.plan?.currency || "USD");
    const [frequencyType, setFrequencyType] = useState(loaderData.plan?.frequencyType || "MONTHLY");
    const [frequencyValue, setFrequencyValue] = useState(loaderData.plan?.frequencyValue || 1);
    const [archived, setArchived] = useState<boolean>(loaderData.plan?.archived ?? false);

    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (actionData?.errors || actionData?.formError) {
            setIsLoading(false);
            setIsRefreshing(false);
            if (actionData.formError) toast.error(actionData.formError);
        }
        if (actionData?.refreshSuccess) {
            setIsRefreshing(false);
            toast.success("Enlace de suscripción renovado correctamente");
        }
    }, [actionData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(formRef.current!);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    const handleRefresh = () => {
        if (!confirm("¿Renovar el enlace de suscripción? El plan actual en dLocal Go se desactivará y se creará uno nuevo.")) return;
        setIsRefreshing(true);
        const formData = new FormData();
        formData.set("intent", "refresh");
        formData.set("id", loaderData.plan!._id);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    const handleDelete = () => {
        if (!confirm("¿Estás seguro de eliminar este plan? Esto también lo desactivará en dLocal.")) return;
        setIsDeleting(true);
        const formData = new FormData();
        formData.set("intent", "delete");
        formData.set("id", loaderData.plan!._id);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />

            <div className="w-full max-w-2xl px-4">
                <Breadcrumbs 
                    items={[
                        { label: "Planes", href: "/administracion/planes" },
                        { label: isNew ? "Nuevo" : (loaderData.plan?.name || "Detalle") }
                    ]} 
                />
                
                <div className="flex flex-row justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                        {isNew ? "Crear plan" : (isEditable ? "Editar plan" : "Ver plan")}
                    </h1>
                    
                    {!isNew && !isEditable && (
                        <Link to="?mode=edit" className="btn-primary no-underline">
                            Editar plan
                        </Link>
                    )}

                    {!isNew && isEditable && (
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className={cn(
                                "flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors",
                                isDeleting && "pointer-events-none opacity-50 cursor-not-allowed"
                            )}
                        >
                            {isDeleting ? <FaSpinner className="animate-spin mr-2" /> : <FaTrash className="mr-2" />}
                            Eliminar
                        </button>
                    )}
                </div>

                <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-6">
                    {loaderData.plan?._id && <input type="hidden" name="id" value={loaderData.plan._id} />}
                    
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
                            placeholder="Nombre del plan"
                            className={cn(
                                "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                (!isEditable || isDeleting) 
                                    ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                            )}
                        />
                        {actionData?.errors?.name && <p className="text-xs text-red-500">{actionData.errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Descripción
                        </label>
                        <textarea
                            name="description"
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={!isEditable}
                            placeholder="Describe los beneficios del plan..."
                            className={cn(
                                "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-25 resize-none",
                                (!isEditable || isDeleting) 
                                    ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                            )}
                        />
                        {actionData?.errors?.description && <p className="text-xs text-red-500">{actionData.errors.description}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="tokens" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Tokens incluidos
                            </label>
                            <input
                                name="tokens"
                                id="tokens"
                                type="number"
                                value={tokens}
                                onChange={(e) => setTokens(Number(e.target.value))}
                                disabled={!isEditable}
                                placeholder="Ej: 2000000"
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting) 
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                )}
                            />
                            {actionData?.errors?.tokens && <p className="text-xs text-red-500">{actionData.errors.tokens}</p>}
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="icon" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Ícono
                            </label>
                            <div className="flex gap-2">
                                <select
                                    name="icon"
                                    id="icon"
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    disabled={!isEditable}
                                    className={cn(
                                        "flex-1 px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                        (!isEditable || isDeleting) 
                                            ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                    )}
                                >
                                    {AVAILABLE_ICONS.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.id}
                                        </option>
                                    ))}
                                </select>
                                <div className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl text-primary border border-slate-200 dark:border-slate-700 shadow-sm">
                                    {AVAILABLE_ICONS.find(i => i.id === icon)?.icon || <FaStar />}
                                </div>
                            </div>
                            {actionData?.errors?.icon && <p className="text-xs text-red-500">{actionData.errors.icon}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Monto
                            </label>
                            <input
                                name="amount"
                                id="amount"
                                type="number"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                disabled={!isEditable}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting) 
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Moneda
                            </label>
                            <select
                                name="currency"
                                id="currency"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value as any)}
                                disabled={!isEditable}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting) 
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            >
                                <option value="USD">USD</option>
                                <option value="UYU">UYU</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="frequencyType" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Tipo de Frecuencia
                            </label>
                            {!isNew && <input type="hidden" name="frequencyType" value={frequencyType} />}
                            <select
                                id="frequencyType"
                                name={isNew ? "frequencyType" : undefined}
                                value={frequencyType}
                                onChange={(e) => setFrequencyType(e.target.value as any)}
                                disabled={!isEditable || !isNew}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting || !isNew)
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            >
                                <option value="DAILY">Diario</option>
                                <option value="WEEKLY">Semanal</option>
                                <option value="MONTHLY">Mensual</option>
                                <option value="YEARLY">Anual</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="frequencyValue" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Valor de Frecuencia
                            </label>
                            {!isNew && <input type="hidden" name="frequencyValue" value={frequencyValue} />}
                            <input
                                id="frequencyValue"
                                name={isNew ? "frequencyValue" : undefined}
                                type="number"
                                value={frequencyValue}
                                onChange={(e) => setFrequencyValue(Number(e.target.value))}
                                disabled={!isEditable || !isNew}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting || !isNew)
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            />
                        </div>
                    </div>

                    {!isNew && loaderData.plan?.subscriptionUrl && (
                        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Enlace de suscripción</h2>
                                {/* Renovar enlace deshabilitado hasta nuevo aviso */}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    readOnly
                                    value={loaderData.plan.subscriptionUrl}
                                    className="flex-1 px-4 py-2 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 text-xs focus:outline-none"
                                />
                                <a
                                    href={loaderData.plan.subscriptionUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary whitespace-nowrap text-sm flex items-center justify-center no-underline"
                                >
                                    Abrir link
                                </a>
                            </div>
                        </div>
                    )}

                    {!isNew && loaderData.plan?.dlocalPlanId && (
                        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                                    dLocal Go
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    ID de plan: <span className="font-mono font-semibold">{loaderData.plan.dlocalPlanId}</span>
                                    {loaderData.dlocalPlan && (
                                        <span className={`ml-3 font-medium ${loaderData.dlocalPlan.active ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                            {loaderData.dlocalPlan.active ? "Activo" : "Inactivo"}
                                        </span>
                                    )}
                                </p>
                            </div>

                            {loaderData.dlocalPlan ? (
                                <div className="grid grid-cols-1 gap-4">
                                    {[
                                        { label: "URL de éxito", name: "successUrl", value: successUrl, setter: setSuccessUrl },
                                        { label: "URL de error", name: "errorUrl", value: errorUrl, setter: setErrorUrl },
                                        { label: "URL de retorno", name: "backUrl", value: backUrl, setter: setBackUrl },
                                        { label: "URL de notificación", name: "notificationUrl", value: notificationUrl, setter: setNotificationUrl },
                                    ].map(({ label, name, value, setter }) => (
                                        <div key={name} className="space-y-1.5">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
                                            <input
                                                type="url"
                                                name={name}
                                                value={value}
                                                onChange={(e) => setter(e.target.value)}
                                                disabled={!isEditable}
                                                placeholder="https://..."
                                                className={cn(
                                                    "block w-full px-4 py-3 rounded-xl border text-sm font-mono transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                                    !isEditable
                                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400"
                                                )}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                                    No se pudo obtener información de dLocal Go.
                                </p>
                            )}
                        </div>
                    )}

                    <input type="hidden" name="archived" value={archived ? "true" : "false"} />

                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/50 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className={cn(
                                "p-2.5 rounded-xl shadow-sm",
                                archived
                                    ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                                    : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}>
                                <FaBoxArchive />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                                    {archived ? "Plan archivado" : "Plan activo"}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md">
                                    Los planes archivados no se muestran a los clientes en la landing ni en la página de facturación. Los clientes ya suscritos siguen activos y no se desuscriben de dLocal Go.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={!archived}
                            aria-label={archived ? "Activar plan" : "Archivar plan"}
                            disabled={!isEditable || isDeleting}
                            onClick={() => setArchived((v) => !v)}
                            className={cn(
                                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
                                archived ? "bg-slate-300 dark:bg-slate-700" : "bg-emerald-500",
                                (!isEditable || isDeleting) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition-transform",
                                    archived ? "translate-x-0" : "translate-x-5"
                                )}
                            />
                        </button>
                    </div>

                    {isEditable && (
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
                                ) : (
                                    <>
                                        <FaFloppyDisk className="mr-2" />
                                        {isNew ? "Crear plan" : "Guardar cambios"}
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
