import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import { FaSpinner } from "react-icons/fa6";

export function meta() {
    return [
        { title: "Términos y Condiciones — Atendia" },
        { name: "description", content: "Términos y Condiciones de uso de la plataforma Atendia." },
    ];
}

export default function TermsAndConditionsPage() {
    const terms = useQuery(api.terms.getActive);

    if (terms === undefined) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <FaSpinner className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (terms === null) {
        return (
            <div className="flex items-center justify-center min-h-screen px-4">
                <div className="text-center max-w-md">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">
                        Términos y Condiciones
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Los términos y condiciones aún no están disponibles. Volvé a consultarlos pronto.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950 py-16 px-4">
            <div className="max-w-3xl mx-auto">
                <header className="mb-12 text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                        Versión {terms.version}
                    </p>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">
                        {terms.title}
                    </h1>
                    {terms.publishedAt && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Vigente desde el{" "}
                            {new Date(terms.publishedAt).toLocaleDateString("es-UY", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                            })}
                        </p>
                    )}
                </header>

                <article
                    className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-h2:text-xl prose-h2:mt-10 prose-h3:text-lg prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-li:text-slate-600 dark:prose-li:text-slate-400"
                    dangerouslySetInnerHTML={{ __html: terms.content }}
                />

                <footer className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-400 dark:text-slate-600">
                        © {new Date().getFullYear()} Atendia. Todos los derechos reservados.
                    </p>
                </footer>
            </div>
        </div>
    );
}
