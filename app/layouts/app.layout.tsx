import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import "react-toastify/dist/ReactToastify.css";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Outlet, Link, useRouteError, isRouteErrorResponse } from "react-router";
import { getEnv } from "utils/utils";
import { FaArrowLeft, FaEnvelope } from "react-icons/fa6";
import { LogoSpark } from "../../logo";

const convex = new ConvexReactClient(getEnv("VITE_CONVEX_URL")!);

// Este boundary corre por ENCIMA de ConvexAuthProvider, por lo que no puede
// usar hooks de Convex. Debe ser completamente estático.
export function ErrorBoundary() {
    const error = useRouteError();

    let status: number | null = null;
    let title = "Algo salió mal";
    let description = "Ocurrió un error inesperado. Si el problema persiste, contactanos y te ayudamos.";

    if (isRouteErrorResponse(error)) {
        status = error.status;
        if (error.status === 404) {
            title = "Página no encontrada";
            description = "La página que buscás no existe o fue movida. Si creés que es un error, no dudes en contactarnos.";
        } else if (error.status === 403) {
            title = "Acceso denegado";
            description = "No tenés permiso para ver esta página. Si creés que es un error, contactanos y lo revisamos.";
        }
    }

    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 font-sans">
            {/* Minimal navbar */}
            <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-6 h-16 flex items-center">
                <Link to="/" className="flex items-center gap-2.5 group">
                    <LogoSpark className="w-9 h-9" />
                    <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-primary transition-colors">
                        Atendia
                    </span>
                </Link>
            </header>

            {/* Content */}
            <main className="flex-1 flex items-center justify-center px-4 py-20">
                <div className="max-w-lg w-full text-center flex flex-col items-center gap-10">
                    {/* Visual */}
                    {status ? (
                        <span className="text-8xl sm:text-9xl font-black bg-linear-to-r from-fuchsia-700 to-purple-800 bg-clip-text text-transparent select-none leading-none">
                            {status}
                        </span>
                    ) : (
                        <div className="relative">
                            <div className="absolute inset-0 bg-linear-to-r from-fuchsia-400 to-purple-500 rounded-full blur-2xl opacity-20" />
                            <LogoSpark className="relative w-20 h-20" />
                        </div>
                    )}

                    {/* Copy */}
                    <div className="flex flex-col gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                            {title}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                            {description}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <FaArrowLeft className="h-3.5 w-3.5" />
                            Volver al inicio
                        </Link>
                        <Link
                            to="/contacto"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-md shadow-lg text-sm font-semibold text-white bg-linear-to-r from-fuchsia-700 to-purple-800 hover:from-fuchsia-800 hover:to-purple-900 transition-all w-full sm:w-auto justify-center"
                        >
                            <FaEnvelope className="h-3.5 w-3.5" />
                            Contactar soporte
                        </Link>
                    </div>
                </div>
            </main>

            {/* Minimal footer */}
            <footer className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-6 py-4 text-center text-xs text-slate-400 dark:text-slate-600">
                © {new Date().getFullYear()} Atendia. Todos los derechos reservados.
            </footer>
        </div>
    );
}

export const links = () => [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
    },
];

export default function AppLayout() {
    return (
        <ConvexAuthProvider client={convex}>
            {/* ColorSchemeScript en body está soportado por Mantine, evita flash de color */}
            <ColorSchemeScript defaultColorScheme="auto" />
            <MantineProvider defaultColorScheme="auto">
                <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
                    <Outlet />
                </div>
            </MantineProvider>
        </ConvexAuthProvider>
    );
}
