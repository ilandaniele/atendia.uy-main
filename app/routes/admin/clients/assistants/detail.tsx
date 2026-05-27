import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { FaSpinner, FaTrash } from "react-icons/fa6";
import { Link, redirect, useActionData, useLoaderData, useSearchParams, useSubmit, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn, getEnv } from "utils/utils";
import z from "zod";
import Breadcrumbs from "../../components/breadcrumbs";
import Switch from "../../components/switch";

interface LoaderData {
    isNew: boolean;
    clientId: string;
    assistantId: string | null;
}

const assistantSchema = z.object({
    id: z.string().optional(),
    clientId: z.string().min(1, "El ID del cliente es obligatorio"),
    name: z.string().min(1, "El nombre es obligatorio"),
    description: z.string().min(1, "La descripción es obligatoria"),
    model: z.string().min(1, "El modelo es obligatorio"),
    knowledgeBase: z.string().min(1, "La base de conocimiento es obligatoria"),
    recognizeContacts: z.string().optional(),
});

export function meta() {
    return [
        { title: "Atendia — Administración — Asistente" }
    ];
}

export async function loader({ params }: LoaderFunctionArgs) {
    const { id, clientId } = params;

    if (!clientId) {
        throw new Response("Cliente no especificado", { status: 400 });
    }

    const isNew = !id || id === "nuevo";

    return {
        isNew,
        clientId,
        assistantId: isNew ? null : id,
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

    // Validar el formulario
    const parsedData = assistantSchema.safeParse(formValues);

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
        clientId,
        name,
        description,
        model,
        knowledgeBase,
        recognizeContacts,
    } = parsedData.data;

    const features = { recognizeContacts: recognizeContacts === "true" || undefined };

    try {
        const VITE_CONVEX_URL = getEnv("VITE_CONVEX_URL");
        const convex = new ConvexHttpClient(VITE_CONVEX_URL!);
        if (authToken) convex.setAuth(authToken);

        if (id) {
            await convex.mutation(api.assistants.update, {
                id: id as Id<"assistants">,
                name,
                description,
                model,
                knowledgeBases: knowledgeBase ? [knowledgeBase as Id<"knowledge_bases">] : [],
                client: clientId as Id<"clients">,
                features,
            });

             return redirect(`/administracion/clientes/${clientId}/asistentes`);
        } else {
            await convex.mutation(api.assistants.create, {
                name,
                description,
                model,
                knowledgeBases: knowledgeBase ? [knowledgeBase as Id<"knowledge_bases">] : [],
                client: clientId as Id<"clients">,
                features,
            });

            return redirect(`/administracion/clientes/${clientId}/asistentes`);
        }

    } catch (error: any) {
        console.error("Error en action:", error);
        return { formError: convexErrorMessage(error) };
    }
}

export default function AssistantDetail() {
    const loaderData = useLoaderData<LoaderData>();
    const actionData = useActionData<{ errors?: Record<string, string>, formError?: string }>();
    const [searchParams] = useSearchParams();

    const authToken = useAuthToken();
    const isNew = loaderData.isNew;
    const mode = searchParams.get("mode");
    const [isEditable, setIsEditable] = useState(isNew || mode === "edit");

    const [isLoading, setIsLoading] = useState(false);
    const [title, setTitle] = useState(isNew ? "Crear asistente" : "Ver asistente");

    const client = useQuery(api.clients.get, { id: loaderData.clientId as Id<"clients"> });
    const knowledgeBases = useQuery(api.knowledgeBases.getByClient, { clientId: loaderData.clientId as Id<"clients"> });
    const assistant = useQuery(
        api.assistants.get,
        loaderData.assistantId ? { id: loaderData.assistantId as Id<"assistants"> } : "skip"
    );

    // Estados del formulario
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [model, setModel] = useState("gemini-2.5-flash");
    const [knowledgeBase, setKnowledgeBase] = useState("");
    const [recognizeContacts, setRecognizeContacts] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const submit = useSubmit();

    const removeAssistant = useMutation(api.assistants.remove);

    // Sync form state when assistant data loads
    useEffect(() => {
        if (assistant) {
            setName(assistant.name || "");
            setDescription(assistant.description || "");
            setModel(assistant.model || "gemini-2.5-flash");
            setKnowledgeBase(assistant.knowledgeBases?.[0] || "");
            setRecognizeContacts(assistant.features?.recognizeContacts ?? false);
        }
    }, [assistant]);

    useEffect(() => {
        if (isNew) {
            setTitle("Crear asistente");
            setIsEditable(true);
        } else if (mode === "edit") {
            setTitle("Editar asistente");
            setIsEditable(true);
        } else {
            setTitle("Ver asistente");
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
        
        if (!name || !description || !model || !knowledgeBase) {
            toast.error("Por favor completa todos los campos obligatorios");
            setIsLoading(false);
            return;
        }

        const formData = new FormData(formRef.current!);
        if (authToken) formData.set("authToken", authToken);
        submit(formData, { method: "POST" });
    };

    const handleDelete = async (id: string) => {
        if (!globalThis.confirm("¿Estás seguro de que deseas eliminar este asistente? Esta acción no se puede deshacer.")) {
            return;
        }

        setIsDeleting(true);

        try {
            await removeAssistant({ id: id as Id<"assistants"> });
            toast.success("Asistente eliminado correctamente");
            globalThis.location.href = `/administracion/clientes/${loaderData.clientId}/asistentes`;
        } catch (error) {
            toast.error("Hubo un error al eliminar el asistente");
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />
            
            <div className="w-full max-w-2xl px-4">
                <Breadcrumbs 
                    items={[
                        { label: "Clientes", href: "/administracion/clientes" },
                        { label: client?.name || "Cliente", href: `/administracion/clientes/${loaderData.clientId}` },
                        { label: "Asistentes", href: `/administracion/clientes/${loaderData.clientId}/asistentes` },
                        { label: isNew ? "Nuevo" : (assistant?.name || "Detalle") }
                    ]} 
                />
                <div className="flex flex-row justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
                    {!isNew && !isEditable && (
                        <div className="flex flex-wrap justify-end gap-2">
                            {recognizeContacts && (
                                <Link to="contactos" className="btn-secondary no-underline">
                                    Contactos
                                </Link>
                            )}
                            <Link to="canales" className="btn-secondary no-underline">
                                Canales
                            </Link>
                            <Link to="?mode=edit" className="btn-primary no-underline">
                                Editar asistente
                            </Link>
                        </div>
                    )}
                    {!isNew && isEditable && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleDelete(assistant!._id)}
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
                    {assistant?._id && <input type="hidden" name="id" value={assistant._id} />}
                    <input type="hidden" name="clientId" value={loaderData.clientId} />
                    <input type="hidden" name="recognizeContacts" value={String(recognizeContacts)} />

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
                            placeholder="Nombre del asistente"
                            className={cn(
                                "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                (!isEditable || isDeleting) 
                                    ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                            )}
                        />
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
                            placeholder="Descripción del asistente"
                            rows={3}
                            className={cn(
                                "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none",
                                (!isEditable || isDeleting) 
                                    ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="model" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Modelo
                            </label>
                            <input
                                name="model"
                                id="model"
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                disabled={!isEditable}
                                placeholder="gemini-2.5-flash"
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting) 
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                )}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="knowledgeBase" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Base de Conocimiento
                            </label>
                            <select
                                name="knowledgeBase"
                                id="knowledgeBase"
                                value={knowledgeBase}
                                onChange={(e) => setKnowledgeBase(e.target.value)}
                                disabled={!isEditable}
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    (!isEditable || isDeleting) 
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default" 
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary"
                                )}
                            >
                                <option value="" disabled>Seleccionar base de conocimiento</option>
                                {(knowledgeBases ?? []).map((kb) => (
                                    <option key={kb._id} value={kb._id}>{kb.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Recognize contacts toggle */}
                    <Switch
                        id="recognizeContacts"
                        label="Reconocer clientes recurrentes (WhatsApp)"
                        checked={recognizeContacts}
                        onChange={setRecognizeContacts}
                        disabled={!isEditable}
                    />

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
                                ) : "Guardar asistente"}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
