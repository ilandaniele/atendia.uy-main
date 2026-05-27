import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { FaChevronDown, FaMagnifyingGlass, FaSpinner, FaYoutube } from "react-icons/fa6";
import { cn } from "utils/utils";

export function meta() {
    return [
        { title: "Preguntas Frecuentes — Atendia" },
        { name: "description", content: "Encontrá respuestas a las preguntas más comunes sobre Atendia." },
    ];
}

function getYoutubeEmbedUrl(url: string): string | null {
    const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

type Faq = {
    _id: string;
    question: string;
    answerType: "content" | "youtube";
    content?: string;
    youtubeUrl?: string;
    keywords: string[];
};

function FaqItem({ faq, isOpen, onToggle }: { faq: Faq; isOpen: boolean; onToggle: () => void }) {
    const embedUrl = faq.answerType === "youtube" && faq.youtubeUrl
        ? getYoutubeEmbedUrl(faq.youtubeUrl)
        : null;

    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden transition-shadow hover:shadow-sm">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
                <div className="flex items-center gap-3 min-w-0">
                    {faq.answerType === "youtube" && (
                        <FaYoutube className="h-4 w-4 text-red-500 shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                        {faq.question}
                    </span>
                </div>
                <FaChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                        isOpen && "rotate-180"
                    )}
                    aria-hidden="true"
                />
            </button>

            <div
                className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-in-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
            >
                <div className="overflow-hidden">
                    <div className="px-5 pb-5 pt-1 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                        {faq.answerType === "content" && faq.content ? (
                            <div
                                className="prose prose-slate dark:prose-invert max-w-none text-sm prose-headings:font-semibold prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-li:text-slate-600 dark:prose-li:text-slate-400"
                                dangerouslySetInnerHTML={{ __html: faq.content }}
                            />
                        ) : embedUrl ? (
                            <div className="rounded-xl overflow-hidden aspect-video mt-2">
                                <iframe
                                    src={embedUrl}
                                    className="w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    title={faq.question}
                                />
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400">Sin contenido disponible.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function FrequentAskedQuestions() {
    const faqs = useQuery(api.faq.listPublished);
    const [openId, setOpenId] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        if (!faqs) return [];
        const q = search.trim().toLowerCase();
        if (!q) return faqs;
        return faqs.filter(
            (f) =>
                f.question.toLowerCase().includes(q) ||
                f.keywords.some((kw) => kw.toLowerCase().includes(q))
        );
    }, [faqs, search]);

    if (faqs === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <FaSpinner className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <header className="text-center mb-10">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                        Soporte
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
                        Preguntas frecuentes
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">
                        Encontrá respuestas rápidas a las dudas más comunes.
                    </p>
                </header>

                {/* Search */}
                {faqs.length > 0 && (
                    <div className="relative mb-8">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                            <FaMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setOpenId(null);
                            }}
                            placeholder="Buscar pregunta..."
                            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
                        />
                    </div>
                )}

                {/* FAQ list */}
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            {search
                                ? "No se encontraron preguntas para tu búsqueda."
                                : "No hay preguntas frecuentes disponibles aún."}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {filtered.map((faq) => (
                            <FaqItem
                                key={faq._id}
                                faq={faq as Faq}
                                isOpen={openId === faq._id}
                                onToggle={() => setOpenId(openId === faq._id ? null : faq._id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
