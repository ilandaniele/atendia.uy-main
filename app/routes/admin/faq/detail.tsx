import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { FaCheckCircle } from "react-icons/fa";
import {
    FaCircle,
    FaFloppyDisk,
    FaRotate,
    FaSpinner,
    FaTrash,
    FaWandMagicSparkles,
    FaYoutube,
} from "react-icons/fa6";
import { useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn } from "utils/utils";
import Breadcrumbs from "../components/breadcrumbs";
import WYSIWYGEditor from "../components/wysiwyg-editor";

export function meta() {
    return [{ title: "Atendia — Administración — Pregunta Frecuente" }];
}

type AnswerType = "content" | "youtube";

export default function AdminFaqDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const isNew = !id || id === "nueva";

    const existing = useQuery(
        api.faq.get,
        isNew ? "skip" : { id: id as Id<"faq"> }
    );

    const createMutation = useMutation(api.faq.create);
    const updateMutation = useMutation(api.faq.update);
    const toggleMutation = useMutation(api.faq.togglePublish);
    const removeMutation = useMutation(api.faq.remove);
    const generateKeywordsAction = useAction(api.faqAI.generateKeywords);

    const [question, setQuestion] = useState("");
    const [answerType, setAnswerType] = useState<AnswerType>("content");
    const [content, setContent] = useState("");
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [isEditable, setIsEditable] = useState(isNew);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (existing) {
            setQuestion(existing.question);
            setAnswerType(existing.answerType);
            setContent(existing.content ?? "");
            setYoutubeUrl(existing.youtubeUrl ?? "");
        }
    }, [existing]);

    const triggerKeywordGeneration = async (faqId: Id<"faq">) => {
        setIsGenerating(true);
        try {
            await generateKeywordsAction({ id: faqId });
            toast.success("Palabras clave generadas automáticamente");
        } catch (err: any) {
            toast.warn(err?.message || "No se pudieron generar las palabras clave");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!question.trim()) return toast.error("La pregunta es obligatoria");
        if (answerType === "content" && !content.trim())
            return toast.error("El contenido es obligatorio");
        if (answerType === "youtube" && !youtubeUrl.trim())
            return toast.error("La URL de YouTube es obligatoria");

        setIsSaving(true);
        try {
            const payload = {
                question: question.trim(),
                answerType,
                content: answerType === "content" ? content : undefined,
                youtubeUrl: answerType === "youtube" ? youtubeUrl.trim() : undefined,
                keywords: existing?.keywords ?? [],
            };

            if (isNew) {
                const newId = await createMutation(payload);
                toast.success("Pregunta creada");
                navigate(`/administracion/preguntas-frecuentes/${newId}`, { replace: true });
                // Auto-generate keywords after creation
                triggerKeywordGeneration(newId as Id<"faq">);
            } else {
                await updateMutation({ id: id as Id<"faq">, ...payload });
                toast.success("Cambios guardados");
                setIsEditable(false);
                // Re-generate keywords since content may have changed
                triggerKeywordGeneration(id as Id<"faq">);
            }
        } catch (err: any) {
            toast.error(err?.message || "Error al guardar");
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = async () => {
        if (!existing) return;
        setIsToggling(true);
        try {
            await toggleMutation({ id: id as Id<"faq"> });
            toast.success(existing.isPublished ? "Pregunta despublicada" : "Pregunta publicada");
        } catch (err: any) {
            toast.error(err?.message || "Error al cambiar estado");
        } finally {
            setIsToggling(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Eliminar esta pregunta? Esta acción no se puede deshacer.")) return;
        setIsDeleting(true);
        try {
            await removeMutation({ id: id as Id<"faq"> });
            toast.success("Pregunta eliminada");
            navigate("/administracion/preguntas-frecuentes");
        } catch (err: any) {
            toast.error(err?.message || "Error al eliminar");
            setIsDeleting(false);
        }
    };

    const isLoading = !isNew && existing === undefined;
    const isPublished = existing?.isPublished ?? false;
    const keywords = existing?.keywords ?? [];

    const youtubeEmbedUrl = (() => {
        if (!youtubeUrl) return null;
        const match = youtubeUrl.match(
            /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
        );
        return match ? `https://www.youtube.com/embed/${match[1]}` : null;
    })();

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />

            <div className="w-full max-w-4xl px-4">
                <Breadcrumbs
                    items={[
                        { label: "Preguntas Frecuentes", href: "/administracion/preguntas-frecuentes" },
                        {
                            label: isNew
                                ? "Nueva pregunta"
                                : existing?.question
                                  ? existing.question.slice(0, 40) + (existing.question.length > 40 ? "…" : "")
                                  : "Detalle",
                        },
                    ]}
                />

                <div className="flex flex-row justify-between items-center mb-8 gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                            {isNew ? "Nueva pregunta" : isEditable ? "Editar pregunta" : "Detalle"}
                        </h1>
                        {!isNew && existing && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                                    isPublished
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                )}
                            >
                                {isPublished ? <FaCheckCircle className="h-3 w-3" /> : <FaCircle className="h-3 w-3" />}
                                {isPublished ? "Publicada" : "Borrador"}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Regenerar palabras clave — always visible for existing FAQs */}
                        {!isNew && existing && (
                            <button
                                type="button"
                                onClick={() => triggerKeywordGeneration(id as Id<"faq">)}
                                disabled={isGenerating}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors",
                                    "border-primary/40 text-primary hover:bg-primary/5 dark:hover:bg-primary/10",
                                    isGenerating && "opacity-60 cursor-wait"
                                )}
                                title="Regenerar palabras clave con IA"
                            >
                                {isGenerating ? (
                                    <FaSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <FaRotate className="h-4 w-4" />
                                )}
                                {isGenerating ? "Generando..." : "Regenerar palabras clave"}
                            </button>
                        )}

                        {!isNew && !isEditable && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleToggle}
                                    disabled={isToggling}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                                        isPublished
                                            ? "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                            : "bg-emerald-600 text-white hover:bg-emerald-700",
                                        isToggling && "opacity-50 cursor-wait"
                                    )}
                                >
                                    {isToggling ? <FaSpinner className="h-4 w-4 animate-spin" /> : <FaCheckCircle className="h-4 w-4" />}
                                    {isPublished ? "Despublicar" : "Publicar"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsEditable(true)}
                                    className="btn-primary"
                                >
                                    Editar
                                </button>
                            </>
                        )}

                        {!isNew && isEditable && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors",
                                    isDeleting && "opacity-50 cursor-not-allowed"
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
                        {/* Question */}
                        <div className="space-y-2">
                            <label htmlFor="question" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Pregunta
                            </label>
                            <input
                                id="question"
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                disabled={!isEditable}
                                placeholder="Ej: ¿Cómo puedo integrar un canal de WhatsApp?"
                                className={cn(
                                    "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    !isEditable
                                        ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                )}
                            />
                        </div>

                        {/* Answer type toggle */}
                        <div className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Tipo de respuesta
                            </span>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    disabled={!isEditable}
                                    onClick={() => isEditable && setAnswerType("content")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors",
                                        answerType === "content"
                                            ? "bg-primary text-white border-primary"
                                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400",
                                        !isEditable && "cursor-default opacity-70"
                                    )}
                                >
                                    Contenido
                                </button>
                                <button
                                    type="button"
                                    disabled={!isEditable}
                                    onClick={() => isEditable && setAnswerType("youtube")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors",
                                        answerType === "youtube"
                                            ? "bg-red-600 text-white border-red-600"
                                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400",
                                        !isEditable && "cursor-default opacity-70"
                                    )}
                                >
                                    <FaYoutube className="h-4 w-4" />
                                    Video de YouTube
                                </button>
                            </div>
                        </div>

                        {/* Answer content */}
                        {answerType === "content" ? (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Contenido / Pasos
                                </label>
                                {isEditable ? (
                                    <WYSIWYGEditor markdown={content} onChange={(html) => setContent(html)} />
                                ) : (
                                    <div
                                        className="min-h-50 p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 prose prose-slate dark:prose-invert max-w-none text-sm"
                                        dangerouslySetInnerHTML={{ __html: content || "<p class='text-slate-400'>Sin contenido</p>" }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="youtubeUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                        URL de YouTube
                                    </label>
                                    <input
                                        id="youtubeUrl"
                                        type="url"
                                        value={youtubeUrl}
                                        onChange={(e) => setYoutubeUrl(e.target.value)}
                                        disabled={!isEditable}
                                        placeholder="Ej: https://www.youtube.com/watch?v=..."
                                        className={cn(
                                            "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                            !isEditable
                                                ? "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 cursor-default"
                                                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500"
                                        )}
                                    />
                                </div>

                                {youtubeEmbedUrl ? (
                                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video">
                                        <iframe
                                            src={youtubeEmbedUrl}
                                            className="w-full h-full"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                            title="Vista previa YouTube"
                                        />
                                    </div>
                                ) : youtubeUrl ? (
                                    <p className="text-sm text-red-500">URL de YouTube inválida</p>
                                ) : null}
                            </div>
                        )}

                        {/* Keywords — auto-generated, read-only */}
                        {!isNew && (
                            <div className="space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2">
                                    <FaWandMagicSparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Palabras clave generadas por IA
                                    </span>
                                    <span className="text-xs text-slate-400 font-normal">(invisibles para el usuario)</span>
                                </div>

                                {isGenerating ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
                                        <FaSpinner className="h-3.5 w-3.5 animate-spin" />
                                        Analizando contenido y generando palabras clave...
                                    </div>
                                ) : keywords.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {keywords.map((kw) => (
                                            <span
                                                key={kw}
                                                className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary dark:bg-primary/20"
                                            >
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic py-1">
                                        Sin palabras clave aún. Guardá la pregunta para generarlas automáticamente.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Save/Cancel */}
                        {isEditable && (
                            <div className="pt-2 flex items-center justify-end gap-4">
                                {!isNew && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (existing) {
                                                setQuestion(existing.question);
                                                setAnswerType(existing.answerType);
                                                setContent(existing.content ?? "");
                                                setYoutubeUrl(existing.youtubeUrl ?? "");
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
                                        <><FaFloppyDisk className="h-4 w-4" /> {isNew ? "Crear pregunta" : "Guardar cambios"}</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
