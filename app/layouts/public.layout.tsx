import { Outlet, Link, useRouteError, isRouteErrorResponse } from "react-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { FaWrench, FaArrowLeft, FaEnvelope } from "react-icons/fa6";
import PublicNavbar from "../routes/public/components/navbar";
import PublicFooter from "../routes/public/components/footer";
import { LogoSpark } from "logo";
import AtendiaWidget from "../../src/atendia-widget";
import GoogleAnalytics from "../../src/google-analytics";

function MaintenancePage() {
    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
            <PublicNavbar />
            <main className="flex-1 flex items-center justify-center p-8">
                <div className="max-w-md text-center flex flex-col items-center gap-6">
                    <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <FaWrench className="h-7 w-7 text-amber-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                            En mantenimiento
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                            Estamos realizando tareas de mantenimiento para mejorar la plataforma.
                            Volvé en unos minutos.
                        </p>
                    </div>
                </div>
            </main>
            <PublicFooter />
        </div>
    );
}

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
        <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
            <PublicNavbar />
            <main className="flex-1 flex items-center justify-center px-4 py-20">
                <div className="max-w-lg w-full text-center flex flex-col items-center gap-10">
                    {/* Brand visual */}
                    <div className="flex flex-col items-center gap-4">
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
                    </div>

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
                            className="btn-primary gap-2 w-full sm:w-auto"
                        >
                            <FaEnvelope className="h-3.5 w-3.5" />
                            Contactar soporte
                        </Link>
                    </div>
                </div>
            </main>
            <PublicFooter />
        </div>
    );
}

export default function PublicLayout() {
    const systemConfig = useQuery(api.systemConfig.get);

    if (systemConfig?.maintenanceMode) {
        return <MaintenancePage />;
    }

    return (
        <>        
            <GoogleAnalytics />
            <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
                <PublicNavbar />
                <main className="flex-1">
                    <Outlet />
                </main>
                <PublicFooter />
                <AtendiaWidget />
            </div>
        </>
    );
}
