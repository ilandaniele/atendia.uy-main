import { api } from "convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useEffect } from "react";
import { Navigate, Outlet, Link, useRouteError, isRouteErrorResponse } from "react-router";
import { cn } from "utils/utils";
import Sidebar from "~/routes/admin/components/sidebar";
import { FaBug, FaArrowLeft, FaRotateRight, FaChevronDown, FaChevronUp } from "react-icons/fa6";
import { LogoSpark } from "logo";

export function ErrorBoundary() {
    const error = useRouteError();
    const [showStack, setShowStack] = useState(false);

    let status: number | null = null;
    let statusText: string | null = null;
    let message = "Ocurrió un error inesperado.";
    let stack: string | null = null;
    let errorType = "UnknownError";

    if (isRouteErrorResponse(error)) {
        status = error.status;
        statusText = error.statusText;
        message = typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2);
        errorType = "RouteErrorResponse";
    } else if (error instanceof Error) {
        message = error.message;
        stack = error.stack ?? null;
        errorType = error.name;
    } else if (typeof error === "string") {
        message = error;
    }

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
            {/* Minimal branded header */}
            <header className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 h-16 flex items-center justify-between">
                <Link to="/administracion" className="flex items-center gap-2.5 group">
                    <LogoSpark className="w-8 h-8" />
                    <div className="flex flex-col leading-tight">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-primary transition-colors">
                            Atendia
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Administración
                        </span>
                    </div>
                </Link>
                {status && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-mono font-bold">
                        {status} {statusText}
                    </span>
                )}
            </header>

            {/* Content */}
            <main className="flex-1 flex items-start justify-center px-4 py-12">
                <div className="w-full max-w-2xl flex flex-col gap-6">
                    {/* Title row */}
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-linear-to-br from-fuchsia-100 to-purple-100 dark:from-fuchsia-900/30 dark:to-purple-900/30 flex items-center justify-center shrink-0">
                            <FaBug className="h-4.5 w-4.5 text-fuchsia-600 dark:text-fuchsia-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                Excepción no controlada
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Los detalles técnicos se muestran a continuación.
                            </p>
                        </div>
                    </div>

                    {/* Error card */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        {/* Top accent bar */}
                        <div className="h-1 bg-linear-to-r from-fuchsia-600 to-purple-700" />

                        {/* Type + message */}
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-500 dark:text-fuchsia-400">
                                {errorType}
                            </span>
                            <p className="text-sm font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap wrap-break-word leading-relaxed">
                                {message}
                            </p>
                        </div>

                        {/* Stack trace (collapsible) */}
                        {stack && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowStack((v) => !v)}
                                    className="w-full px-5 py-3 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                >
                                    <span className="font-semibold">Stack trace</span>
                                    {showStack ? <FaChevronUp className="h-3 w-3" /> : <FaChevronDown className="h-3 w-3" />}
                                </button>
                                {showStack && (
                                    <pre className="px-5 pb-5 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-pre-wrap wrap-break-word overflow-x-auto leading-relaxed border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                                        {stack}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="btn-primary gap-2"
                        >
                            <FaRotateRight className="h-3.5 w-3.5" />
                            Recargar
                        </button>
                        <Link
                            to="/administracion"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        >
                            <FaArrowLeft className="h-3.5 w-3.5" />
                            Volver al inicio
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function AdminLayout() {
    const { isLoading, isAuthenticated } = useConvexAuth();
    const { signOut } = useAuthActions();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const isAdmin = useQuery(api.profiles.isAdmin);
    const userProfile = useQuery(api.profiles.me);

    // Si el perfil fue eliminado, cerrar sesión automáticamente
    useEffect(() => {
        if (!isLoading && isAuthenticated && userProfile === null) {
            signOut();
        }
    }, [isLoading, isAuthenticated, userProfile]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/ingreso" />;
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
                    Acceso denegado. No tienes permisos para acceder a esta página.
                </h1>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <Sidebar
                isCollapsed={isSidebarCollapsed}
                setIsCollapsed={setIsSidebarCollapsed}
            />

            <main className={cn(
                "min-h-screen transition-all duration-300 ease-in-out",
                // En móviles no hay margen (el sidebar es overlay)
                "ml-0",
                // En escritorio, margen según si está colapsado o no
                isSidebarCollapsed ? "md:ml-20" : "md:ml-64" // w-20 = 80px, w-64 = 256px
            )}>
                <div className="p-4 sm:p-6">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
