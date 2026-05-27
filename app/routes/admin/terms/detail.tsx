import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import {
    FaCircle,
    FaFloppyDisk,
    FaSpinner,
    FaTrash,
} from "react-icons/fa6";
import { FaCheckCircle } from "react-icons/fa";
import { useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn } from "utils/utils";
import Breadcrumbs from "../components/breadcrumbs";
import WYSIWYGEditor from "../components/wysiwyg-editor";

export function meta() {
    return [{ title: "Atendia — Administración — Términos y Condiciones" }];
}

export default function AdminTermsDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const isNew = !id || id === "nueva";

    const existingTerms = useQuery(
        api.terms.get,
        isNew ? "skip" : { id: id as Id<"terms"> }
    );

    const createMutation = useMutation(api.terms.create);
    const updateMutation = useMutation(api.terms.update);
    const publishMutation = useMutation(api.terms.publish);
    const unpublishMutation = useMutation(api.terms.unpublish);
    const removeMutation = useMutation(api.terms.remove);

    const [version, setVersion] = useState("");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isEditable, setIsEditable] = useState(isNew);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    useEffect(() => {
        if (existingTerms) {
            setVersion(existingTerms.version);
            setTitle(existingTerms.title);
            setContent(existingTerms.content);
        }
    }, [existingTerms]);

    const handleSave = async () => {
        if (!version.trim()) return toast.error("La versión es obligatoria");
        if (!title.trim()) return toast.error("El título es obligatorio");
        if (!content.trim()) return toast.error("El contenido es obligatorio");

        setIsSaving(true);
        try {
            if (isNew) {
                const newId = await createMutation({ version: version.trim(), title: title.trim(), content });
                toast.success("Versión creada correctamente");
                navigate(`/administracion/terminos/${newId}`, { replace: true });
            } else {
                await updateMutation({ id: id as Id<"terms">, version: version.trim(), title: title.trim(), content });
                toast.success("Cambios guardados");
                setIsEditable(false);
            }
        } catch (err: any) {
            toast.error(err?.message || "Error al guardar");
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!existingTerms) return;
        setIsPublishing(true);
        try {
            if (existingTerms.isActive) {
                await unpublishMutation({ id: id as Id<"terms"> });
                toast.success("Versión despublicada");
            } else {
                await publishMutation({ id: id as Id<"terms"> });
                toast.success(`Versión ${existingTerms.version} publicada`);
            }
        } catch (err: any) {
            toast.error(err?.message || "Error al cambiar estado");
        } finally {
            setIsPublishing(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Eliminar esta versión? Esta acción no se puede deshacer.")) return;
        setIsDeleting(true);
        try {
            await removeMutation({ id: id as Id<"terms"> });
            toast.success("Versión eliminada");
            navigate("/administracion/terminos");
        } catch (err: any) {
            toast.error(err?.message || "Error al eliminar");
            setIsDeleting(false);
        }
    };

    const isLoading = !isNew && existingTerms === undefined;
    const isActive = existingTerms?.isActive ?? false;

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />

            <div className="w-full max-w-4xl px-4">
                <Breadcrumbs
                    items={[
                        { label: "Términos y Condiciones", href: "/administracion/terminos" },
                        { label: isNew ? "Nueva versión" : (existingTerms?.version ? `v${existingTerms.version}` : "Detalle") },
                    ]}
                />

                <div className="flex flex-row justify-between items-center mb-8 gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                            {isNew ? "Nueva versión" : isEditable ? "Editar versión" : `Versión ${existingTerms?.version ?? ""}`}
                        </h1>
                        {!isNew && existingTerms && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                                    isActive
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                )}
                            >
                                {isActive ? <FaCheckCircle className="h-3 w-3" /> : <FaCircle className="h-3 w-3" />}
                                {isActive ? "Publicada" : "Borrador"}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {!isNew && !isEditable && (
                            <>
                                <button
                                    type="button"
                                    onClick={handlePublish}
                                    disabled={isPublishing}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                                        isActive
                                            ? "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                            : "bg-emerald-600 text-white hover:bg-emerald-700",
                                        isPublishing && "opacity-50 cursor-wait"
                                    )}
                                >
                                    {isPublishing ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaCheckCircle className="h-4 w-4" />}
                                    {isActive ? "Despublicar" : "Publicar"}
                                </button>
                                <button type="button" onClick={() => setIsEditable(true)} className="btn-primary">
                                    Editar
                                </button>
                            </>
                        )}

                        {!isNew && isEditable && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting || isActive}
                                title={isActive ? "No se puede eliminar la versión activa" : ""}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors",
                                    (isDeleting || isActive) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                {isDeleting ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaTrash className="h-4 w-4" />}
                                Eliminar
                            </button>
                        )}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <FaSpinner className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label htmlFor="version" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Versión
                                </label>
                                <input
                                    id="version"
                                    type="text"
                                    value={version}
                                    onChange={(e) => setVersion(e.target.value)}
                                    disabled={!isEditable}
                                    placeholder="Ej: 1.0"
                                    className={cn(
                                        "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                        !isEditable
                                            ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                    )}
                                />
                            </div>

                            <div className="md:col-span-2 space-y-2">
                                <label htmlFor="title" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Título del documento
                                </label>
                                <input
                                    id="title"
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={!isEditable}
                                    placeholder="Ej: Términos y Condiciones de Atendia"
                                    className={cn(
                                        "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                        !isEditable
                                            ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                    )}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Contenido
                            </label>
                            {isEditable ? (
                                <WYSIWYGEditor markdown={content} onChange={(html) => setContent(html)} />
                            ) : (
                                <div
                                    className="min-h-[350px] p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 prose prose-slate dark:prose-invert max-w-none text-sm"
                                    dangerouslySetInnerHTML={{ __html: content || "<p class='text-slate-400'>Sin contenido</p>" }}
                                />
                            )}
                        </div>

                        {isEditable && (
                            <div className="pt-2 flex items-center justify-end gap-4">
                                {!isNew && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (existingTerms) {
                                                setVersion(existingTerms.version);
                                                setTitle(existingTerms.title);
                                                setContent(existingTerms.content);
                                            }
                                            setIsEditable(false);
                                        }}
                                        className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className={cn("btn-primary min-w-36 flex items-center gap-2", isSaving && "opacity-70 cursor-wait")}
                                >
                                    {isSaving ? (
                                        <><FaSpinner className="h-4 w-4 animate-spin" /> Guardando...</>
                                    ) : (
                                        <><FaFloppyDisk className="h-4 w-4" /> {isNew ? "Crear versión" : "Guardar cambios"}</>
                                    )}
                                </button>
                            </div>
                        )}

                        {!isNew && existingTerms?.publishedAt && (
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                    Publicada el{" "}
                                    {new Date(existingTerms.publishedAt).toLocaleDateString("es-UY", {
                                        day: "2-digit",
                                        month: "long",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
