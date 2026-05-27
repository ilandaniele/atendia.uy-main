import { Outlet, Navigate, Link, useRouteError, isRouteErrorResponse, useLocation, useNavigate } from "react-router";
import UserNavbar from "~/routes/user/components/navbar";
import UserSidebar from "~/routes/user/components/sidebar";
import CommandPalette from "~/routes/user/components/command-palette";
import { UserNavProvider } from "~/routes/user/components/user-nav-context";
import type { SystemAlert } from "~/routes/user/components/notifications-panel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { cn } from "utils/utils";
import { ToastContainer } from "react-toastify";
import { FaTriangleExclamation, FaBan, FaWrench, FaBell, FaArrowLeft, FaRotateRight, FaWhatsapp, FaGear, FaUserSecret, FaArrowRightFromBracket } from "react-icons/fa6";
import { useEffect, useState } from "react";
import { usePushNotifications } from "~/hooks/usePushNotifications";
import { LogoSpark } from "logo";
import UserOnboarding from "~/routes/user/components/onboarding";
import DebugPanel from "~/routes/user/components/debug-panel";
import { toast } from "react-toastify";

const LOW_TOKEN_THRESHOLD = 10_000;

// Habilita la instalación PWA sólo dentro de /panel: el manifest define start_url
// y scope acotados al panel, así el prompt de instalación no aparece en la web pública.
export const links = () => [
    { rel: "manifest", href: "/manifest.webmanifest" },
    { rel: "apple-touch-icon", href: "/favicon.png" },
];

export const meta = () => [
    { name: "theme-color", content: "#7e22ce" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { name: "apple-mobile-web-app-title", content: "Atendia" },
    { name: "application-name", content: "Atendia" },
];

export function ErrorBoundary() {
    const error = useRouteError();

    let status: number | null = null;
    let title = "Algo salió mal";
    let description = "Ocurrió un error inesperado. Podés intentar recargar la página o volver al inicio del panel.";

    if (isRouteErrorResponse(error)) {
        status = error.status;
        if (error.status === 404) {
            title = "Sección no encontrada";
            description = "La sección que buscás no existe o fue movida. Volvé al inicio del panel.";
        } else if (error.status === 403) {
            title = "Sin permiso";
            description = "No tenés acceso a esta sección. Si creés que es un error, contactá al administrador.";
        }
    }

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
            {/* Minimal branded header */}
            <header className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 h-16 flex items-center">
                <Link to="/panel" className="flex items-center gap-2.5 group">
                    <LogoSpark className="w-8 h-8" />
                    <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-primary transition-colors">
                        Atendia
                    </span>
                </Link>
            </header>

            {/* Content */}
            <main className="flex-1 flex items-center justify-center px-4 py-16">
                <div className="max-w-md w-full text-center flex flex-col items-center gap-10">
                    {/* Visual */}
                    {status ? (
                        <span className="text-8xl sm:text-9xl font-black bg-linear-to-r from-fuchsia-700 to-purple-800 bg-clip-text text-transparent select-none leading-none">
                            {status}
                        </span>
                    ) : (
                        <div className="relative">
                            <div className="absolute inset-0 bg-linear-to-r from-fuchsia-400 to-purple-500 rounded-full blur-2xl opacity-20" />
                            <LogoSpark className="relative w-16 h-16" />
                        </div>
                    )}

                    {/* Copy */}
                    <div className="flex flex-col gap-3">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                            {title}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                            {description}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors w-full sm:w-auto justify-center"
                        >
                            <FaRotateRight className="h-3.5 w-3.5" />
                            Recargar página
                        </button>
                        <Link
                            to="/panel"
                            className="btn-primary gap-2 w-full sm:w-auto"
                        >
                            <FaArrowLeft className="h-3.5 w-3.5" />
                            Volver al panel
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function UserLayout() {
    const { isLoading, isAuthenticated } = useConvexAuth();
    const { signOut } = useAuthActions();
    const location = useLocation();
    const navigate = useNavigate();
    const userProfile = useQuery(api.profiles.me);
    const systemConfig = useQuery(api.systemConfig.get);
    const isMaintenanceMode = systemConfig?.maintenanceMode ?? false;
    const impersonation = useQuery(api.impersonation.getActive);
    const endImpersonation = useMutation(api.impersonation.end);
    const isAccountPage = location.pathname === "/panel/cuenta";
    const showImpersonationUI = !!impersonation && !isAccountPage;
    const handleEndImpersonation = async () => {
        try {
            await endImpersonation();
            toast.success("Sesión de impersonación terminada");
            navigate(`/administracion/usuarios/${impersonation?.targetProfile._id ?? ""}`);
        } catch {
            toast.error("No se pudo terminar la sesión");
        }
    };

    // ── Onboarding gate ─────────────────────────────────────────────────────
    // null = aún determinando, true = mostrar onboarding, false = acceso libre
    const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
    const onboardingStatus = useQuery(
        api.clients.getOnboardingStatus,
        isAuthenticated ? {} : "skip"
    );

    useEffect(() => {
        if (showOnboarding !== null || onboardingStatus === undefined) return;
        setShowOnboarding(onboardingStatus?.status !== "complete");
    }, [showOnboarding, onboardingStatus]);

    // ── Resto del estado del layout ────────────────────────────────────────
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const activeClientMember = userClients?.[0];
    const isOwner = activeClientMember?.role === "owner";
    const client = useQuery(api.clients.get, activeClientMember ? { id: activeClientMember.client } : "skip");

    // ── Canal de WhatsApp pendiente (post-onboarding) ──────────────────────
    // Verifica reactivamente si hay algún canal WhatsApp sin conectar.
    const channels = useQuery(
        api.channels.getByClient,
        client?._id ? { clientId: client._id } : "skip"
    );
    const hasPendingWhatsApp =
        showOnboarding === false &&
        channels !== undefined &&
        channels.some(c => c.type === "whatsapp" && c.status !== "connected");
    // Permitir acceso a la página de canales para que pueda configurar el QR
    const isOnChannelsPage = location.pathname === "/panel/canales";

    const hasClient = userClients && userClients.length > 0;
    const tokensBalance = client?.tokensBalance ?? null;
    const isClientInactive = client !== undefined && client !== null && !client.isActive;
    const isLowTokens = isOwner && tokensBalance !== null && tokensBalance > 0 && tokensBalance < LOW_TOKEN_THRESHOLD;

    const { permission, isSubscribed, isLoading: pushLoading, subscribe } = usePushNotifications(
        userProfile?._id ? String(userProfile._id) : undefined
    );
    const [pushBannerDismissed, setPushBannerDismissed] = useState(() =>
        typeof window !== "undefined" && localStorage.getItem("atendia_push_dismissed") === "1"
    );
    const dismissPushBanner = () => {
        localStorage.setItem("atendia_push_dismissed", "1");
        setPushBannerDismissed(true);
    };
    const showPushBanner = permission !== "unsupported" && permission !== "denied" && !isSubscribed && hasClient && !showOnboarding && !pushBannerDismissed;

    // ── Estado de la barra lateral y del command palette ──────────────────
    // Se inicializa siempre en false para evitar mismatches con SSR; al
    // hidratar leemos la preferencia guardada y actualizamos.
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    useEffect(() => {
        try {
            if (window.localStorage.getItem("atendia_sidebar_collapsed") === "1") {
                setIsSidebarCollapsed(true);
            }
        } catch {
            /* storage bloqueado */
        }
    }, []);

    // Si el perfil fue eliminado, cerrar sesión automáticamente
    useEffect(() => {
        if (!isLoading && isAuthenticated && userProfile === null) {
            signOut();
        }
    }, [isLoading, isAuthenticated, userProfile, signOut]);

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

    // Datos para reanudar el onboarding en el paso 3 (canal pendiente)
    const resumeData = onboardingStatus?.status === "needsChannel"
        ? {
            clientId: onboardingStatus.clientId as Id<"clients">,
            channelId: onboardingStatus.channelId as Id<"channels">,
            channelType: onboardingStatus.channelType,
            webToken: onboardingStatus.webToken,
            whapiToken: onboardingStatus.whapiToken,
            whapiApiUrl: onboardingStatus.whapiApiUrl,
            kbId: onboardingStatus.kbId as Id<"knowledge_bases"> | undefined,
        }
        : undefined;

    const showSidebar: boolean = !!(
        hasClient &&
        !showOnboarding &&
        !(hasPendingWhatsApp && !isOnChannelsPage)
    );

    // ── Construir la lista de alertas del sistema para el panel de notificaciones
    const alerts: SystemAlert[] = [];
    if (showPushBanner) {
        alerts.push({
            id: "push-notifications",
            severity: "info",
            icon: <FaBell className="h-4 w-4" />,
            title: "Activá las notificaciones",
            description:
                "Recibí alertas en este dispositivo cuando lleguen nuevos mensajes, pedidos o leads.",
            action: {
                label: "Activar notificaciones",
                onClick: subscribe,
                loading: pushLoading,
                loadingLabel: "Activando…",
                disabled: pushLoading,
            },
            onDismiss: dismissPushBanner,
        });
    }
    if (isMaintenanceMode) {
        alerts.push({
            id: "maintenance",
            severity: "warning",
            icon: <FaWrench className="h-4 w-4" />,
            title: "Plataforma en mantenimiento",
            description:
                "Algunas funciones pueden no estar disponibles temporalmente. Estamos trabajando para restablecerlas lo antes posible.",
        });
    }
    if (isClientInactive && isOwner && !showOnboarding) {
        alerts.push({
            id: "client-inactive",
            severity: "danger",
            icon: <FaBan className="h-4 w-4" />,
            title: "Tu cuenta está inactiva",
            description:
                "Tus asistentes están pausados. Contactá a soporte o actualizá tu plan para reactivar el servicio.",
            action: {
                label: "Ir a facturación",
                onClick: () => navigate("/panel/facturacion"),
            },
        });
    }
    if (!isClientInactive && isLowTokens && !showOnboarding) {
        alerts.push({
            id: "low-tokens",
            severity: "warning",
            icon: <FaTriangleExclamation className="h-4 w-4" />,
            title: "Tus tokens se están por acabar",
            description: `Quedan ${tokensBalance?.toLocaleString() ?? 0} tokens. Sin saldo el asistente se pausará automáticamente.`,
            action: {
                label: "Actualizar plan",
                onClick: () => navigate("/panel/facturacion"),
            },
        });
    }

    return (
        <UserNavProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <header className="sticky top-0 z-[100] shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                <UserNavbar
                    onOpenSidebar={() => setMobileSidebarOpen(true)}
                    onOpenCommand={() => setCommandOpen(true)}
                    showMenuButton={showSidebar}
                    alerts={alerts}
                />
                {showImpersonationUI && impersonation && (
                    <div className="bg-purple-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium">
                        <FaUserSecret className="shrink-0" />
                        <span>
                            Modo impersonación: estás operando como <strong>{impersonation.targetProfile.name}</strong> ({impersonation.targetProfile.email}). Sesión expira a las {new Date(impersonation.expiresAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}.
                        </span>
                        <button
                            onClick={handleEndImpersonation}
                            className="inline-flex items-center gap-1.5 underline underline-offset-2 font-bold hover:opacity-80 transition-opacity cursor-pointer"
                        >
                            <FaArrowRightFromBracket className="w-3.5 h-3.5" />
                            Salir
                        </button>
                    </div>
                )}
            </header>

            <div className="flex-1 flex w-full">
                {showSidebar && (
                    <UserSidebar
                        isCollapsed={isSidebarCollapsed}
                        setIsCollapsed={setIsSidebarCollapsed}
                        mobileOpen={mobileSidebarOpen}
                        setMobileOpen={setMobileSidebarOpen}
                    />
                )}

                <main className={cn(
                    "flex-1 min-w-0 flex flex-col transition-[margin] duration-300 ease-out",
                    showSidebar && (isSidebarCollapsed ? "md:ml-20" : "md:ml-64"),
                    showOnboarding || hasPendingWhatsApp || !hasClient
                        ? "justify-center items-center p-4"
                        : "px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
                )}>
                    <div className={cn(
                        "w-full flex flex-col flex-1",
                        !(showOnboarding || hasPendingWhatsApp || !hasClient) && "max-w-7xl mx-auto"
                    )}>
                        {showOnboarding === null ? (
                            // Esperando determinar si se necesita onboarding
                            <div className="flex items-center justify-center min-h-[50vh]">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                            </div>
                        ) : showOnboarding ? (
                            <UserOnboarding
                                onComplete={() => setShowOnboarding(false)}
                                resumeData={resumeData}
                            />
                        ) : hasPendingWhatsApp && !isOnChannelsPage ? (
                            <PendingWhatsAppBlock />
                        ) : (
                            <Outlet />
                        )}
                    </div>
                </main>
            </div>

            <CommandPalette open={commandOpen} setOpen={setCommandOpen} />

            {showImpersonationUI && impersonation && (
                <DebugPanel
                    impersonation={impersonation}
                    client={client}
                    activeMember={activeClientMember}
                />
            )}
            <ToastContainer position="bottom-right" theme="colored" />
        </div>
        </UserNavProvider>
    );
}

// ── Bloqueo por canal de WhatsApp pendiente ────────────────────────────────────

function PendingWhatsAppBlock() {
    return (
        <div className="w-full max-w-sm mx-auto text-center space-y-6 py-8 animate-in fade-in duration-300">
            <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto">
                <FaWhatsapp className="text-amber-500 text-4xl" />
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                    Canal de WhatsApp sin conectar
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Tu asistente no puede recibir mensajes hasta que el canal de WhatsApp esté conectado. Completá la configuración para comenzar a operar.
                </p>
            </div>
            <Link
                to="/panel/canales"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-primary/90 active:scale-95 transition-all"
            >
                <FaGear className="w-4 h-4" />
                Configurar canal
            </Link>
        </div>
    );
}