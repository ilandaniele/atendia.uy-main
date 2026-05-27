import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import {
    FaChevronLeft,
    FaChevronRight,
    FaBuilding,
    FaUsers,
    FaDollarSign,
    FaCircleQuestion,
    FaFileLines,
    FaShieldHalved,
    FaHeadset,
    FaPhone,
    FaReceipt,
    FaGear,
    FaChartBar,
    FaBug,
} from "react-icons/fa6";
import { MdDashboard, MdLogout, MdMenu, MdClose } from "react-icons/md";
import { NavLink, useLocation, useNavigate, useNavigation } from "react-router";
import { cn } from "utils/utils";
import { toast } from "react-toastify";
import { LogoSpark } from "logo";

type LinkType = {
    path: string;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
    links?: LinkType[];
};

const BASE_PATH = "/administracion";

const LINKS: LinkType[] = [
    { path: BASE_PATH, label: "Panel de control", icon: <MdDashboard className="h-5 w-5" /> },
    { path: `${BASE_PATH}/facturacion`, label: "Facturación", icon: <FaReceipt className="h-5 w-5" /> },
    { path: `${BASE_PATH}/uso-tokens`, label: "Uso de Tokens", icon: <FaChartBar className="h-5 w-5" /> },
    { path: `${BASE_PATH}/usuarios`, label: "Usuarios", icon: <FaUsers className="h-5 w-5" /> },
    { path: `${BASE_PATH}/clientes`, label: "Clientes", icon: <FaBuilding className="h-5 w-5" /> },
    { path: `${BASE_PATH}/planes`, label: "Planes", icon: <FaDollarSign className="h-5 w-5" /> },
    { path: `${BASE_PATH}/terminos`, label: "Términos y condiciones", icon: <FaFileLines className="h-5 w-5" /> },
    { path: `${BASE_PATH}/privacidad`, label: "Política de privacidad", icon: <FaShieldHalved className="h-5 w-5" /> },
    { path: `${BASE_PATH}/preguntas-frecuentes`, label: "Preguntas frecuentes", icon: <FaCircleQuestion className="h-5 w-5" /> },
    { path: `${BASE_PATH}/tickets`, label: "Tickets de soporte", icon: <FaHeadset className="h-5 w-5" /> },
    { path: `${BASE_PATH}/formularios-de-contacto`, label: "Formulario de contacto", icon: <FaPhone className="h-5 w-5" /> },
    { path: `${BASE_PATH}/debug-live`, label: "Debug en vivo", icon: <FaBug className="h-5 w-5" /> },
    { path: `${BASE_PATH}/configuracion-sistema`, label: "Configuración del sistema", icon: <FaGear className="h-5 w-5" /> },
];

type SectionState = Record<string, boolean>;

type SidebarProps = Readonly<{
    isCollapsed: boolean;
    setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}>;

function getInitials(name: unknown) {
    const raw = String(name || "").trim();
    if (!raw) return "U";
    const parts = raw.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const second = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
    const v = `${first}${second}`.toUpperCase();
    return v || "U";
}

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
    const { signOut } = useAuthActions();
    const navigation = useNavigation();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const [mobileOpen, setMobileOpen] = useState(false);
    const [sections, setSections] = useState<SectionState>({});
    const [isAdmin, setIsAdmin] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [requiresActionCount, setRequiresActionCount] = useState(0);

    const currentProfile = useQuery(api.profiles.me);

    const handleLogout = async () => {
        await signOut();
        toast.success("Sesión cerrada");
        navigate("/ingreso");
    };

    useEffect(() => {
        const next: SectionState = {};
        LINKS.forEach((item) => {
            if (item.links?.length) {
                next[item.label] = item.links.some((c) => pathname === c.path || pathname.startsWith(`${c.path}/`));
            }
        });
        setSections((prev) => ({ ...prev, ...next }));
    }, [pathname]);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    const pendingPath = navigation.location?.pathname;
    const isPendingFor = (path: string) =>
        pendingPath ? pendingPath === path || pendingPath.startsWith(`${path}/`) : false;

    const desktopWidth = useMemo(() => (isCollapsed ? "w-20" : "w-64"), [isCollapsed]);

    const LinksList = (
        <ul className="space-y-1">
            {LINKS.map((item) => {
                const hasChildren = !!item.links?.length;

                if (!hasChildren) {
                    if (item.adminOnly && !isAdmin) return null;

                    return (
                        <li key={`${item.label}-${item.path}`}>
                            <NavLink
                                to={item.path}
                                className={(args) =>
                                    cn(
                                        "group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                                        "hover:bg-primary-light dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-slate-600",
                                        (args.isActive || isPendingFor(item.path))
                                            ? "bg-primary-dark text-secondary-light dark:bg-slate-800 dark:text-primary"
                                            : "text-neutral-700 dark:text-slate-300",
                                        (isCollapsed && "justify-center") as string
                                    )
                                }
                                title={isCollapsed ? item.label : undefined}
                                end={item.path === BASE_PATH}
                            >
                                <span aria-hidden="true" className="relative">
                                    {item.icon}
                                    {item.path === `${BASE_PATH}/solicitudes-demo` && pendingCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                                            {pendingCount > 9 ? "9+" : pendingCount}
                                        </span>
                                    )}
                                    {item.path === `${BASE_PATH}/interesados` && requiresActionCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                                            {requiresActionCount > 9 ? "9+" : requiresActionCount}
                                        </span>
                                    )}
                                </span>
                                {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
                            </NavLink>
                        </li>
                    );
                }

                const open = !!sections[item.label];
                const hasActiveChild = item.links!.some(
                    (child) => pathname === child.path || pathname.startsWith(`${child.path}/`)
                );

                return (
                    <li key={`${item.label}-group`}>
                        <button
                            type="button"
                            onClick={() => setSections((s) => ({ ...s, [item.label]: !s[item.label] }))}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                                "hover:bg-neutral-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-slate-600",
                                (hasActiveChild && "bg-neutral-50 dark:bg-slate-800") as string,
                                "text-neutral-700 dark:text-slate-300",
                                (isCollapsed && "justify-center") as string
                            )}
                            aria-expanded={open}
                            aria-controls={`section-${item.label}`}
                            title={isCollapsed ? item.label : undefined}
                        >
                            <span aria-hidden="true">{item.icon}</span>
                            {!isCollapsed ? (
                                <>
                                    <span className="flex-1 truncate">{item.label}</span>
                                    <FaChevronRight
                                        className={cn("h-4 w-4 transition-transform", open ? "rotate-90" : "rotate-0")}
                                        aria-hidden="true"
                                    />
                                </>
                            ) : null}
                        </button>

                        <div
                            id={`section-${item.label}`}
                            className={cn(
                                "overflow-hidden pl-2 transition-[max-height] duration-300",
                                (isCollapsed && "hidden") as string,
                                open ? "max-h-64" : "max-h-0"
                            )}
                        >
                            <ul className="mt-1 space-y-1 border-l border-neutral-200 dark:border-slate-700 pl-3">
                                {item.links!.map((child) => (
                                    <li key={`${child.label}-${child.path}`}>
                                        <NavLink
                                            to={child.path}
                                            end
                                            className={(args) =>
                                                cn(
                                                    "group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                                                    "hover:bg-neutral-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-slate-600",
                                                    args.isActive ? "bg-primary-dark text-secondary-light dark:bg-slate-800 dark:text-primary" : "text-neutral-700 dark:text-slate-300"
                                                )
                                            }
                                        >
                                            <span aria-hidden="true">{child.icon}</span>
                                            <span className="truncate">{child.label}</span>
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </li>
                );
            })}
        </ul>
    );

    const DesktopSidebar = (
        <aside
            className={cn(
                "hidden md:flex md:flex-col md:fixed md:top-0 md:left-0 md:h-screen shrink-0",
                "border-r border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200",
                "transition-[width,colors] duration-300 z-30",
                desktopWidth
            )}
            aria-label="Barra lateral (escritorio)"
        >
            <div className={cn("flex items-center px-4 py-3", isCollapsed ? "justify-center" : "justify-between")}>
                <p className={cn("text-sm font-bold", isCollapsed ? "hidden" : "")}>Consola de administración</p>
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-gray-900 dark:bg-slate-700 text-white transition hover:bg-gray-700 dark:hover:bg-slate-600"
                    aria-label={isCollapsed ? "Expandir menú" : "Colapsar menú"}
                >
                    {isCollapsed ? <FaChevronRight className="h-4 w-4" /> : <FaChevronLeft className="h-4 w-4" />}
                </button>
            </div>

            <div className="mb-6 flex items-center justify-center px-4">
                <LogoSpark className="w-20 h-20" />
            </div>

            <div className="flex-1 min-h-0 px-2">
                <nav className="h-full overflow-y-auto" aria-label="Secciones">
                    {LinksList}
                </nav>
            </div>

            <div className="mt-auto border-t border-neutral-200 dark:border-slate-800 p-2 flex flex-col gap-1">
                {/* User info — not clickable */}
                <div className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2",
                    isCollapsed ? "justify-center" : ""
                )}>
                    {currentProfile?.pictureUrl ? (
                        <img
                            src={currentProfile.pictureUrl}
                            alt={currentProfile.name}
                            className="h-7 w-7 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-slate-700"
                        />
                    ) : (
                        <span className="h-7 w-7 rounded-full border border-neutral-200 dark:border-slate-700 bg-neutral-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-semibold text-neutral-600 dark:text-slate-300 shrink-0">
                            {getInitials(currentProfile?.name)}
                        </span>
                    )}
                    {!isCollapsed && (
                        <span className="truncate text-sm font-medium text-neutral-700 dark:text-slate-300">
                            {currentProfile?.name ?? "—"}
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-red-600 dark:text-red-400 transition-colors",
                        "hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 dark:focus-visible:ring-red-900",
                        isCollapsed ? "justify-center" : ""
                    )}
                    aria-label="Cerrar sesión"
                    onClick={handleLogout}
                >
                    <MdLogout className="h-5 w-5" />
                    {isCollapsed ? null : <span className="truncate">Cerrar sesión</span>}
                </button>
            </div>
        </aside>
    );

    const MobileNav = (
        <div className="md:hidden" aria-label="Navegación móvil">
            <div className="flex items-center justify-between px-3 py-3 border-b border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 fixed top-0 left-0 right-0 z-40 transition-colors">
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-neutral-700 dark:text-slate-200 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-slate-600"
                    aria-label="Abrir menú"
                >
                    <MdMenu className="h-5 w-5" />
                </button>

                <LogoSpark className="h-8 w-auto" />
                <span className="inline-block h-9 w-9" />
            </div>

            <div className="h-16"></div>

            {mobileOpen ? (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
                    <aside
                        className="absolute left-0 top-0 h-full w-4/5 max-w-xs bg-white dark:bg-slate-900 shadow-xl border-r border-neutral-200 dark:border-slate-800 flex flex-col transition-colors"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menú móvil"
                    >
                        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-slate-800 px-3 py-3">
                            <LogoSpark className="h-10 w-auto" />
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-slate-800 text-neutral-700 dark:text-slate-200 border border-neutral-300 dark:border-slate-700 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-slate-600"
                                aria-label="Cerrar menú"
                            >
                                <MdClose className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 px-2 mt-2">
                            <nav className="h-full overflow-y-auto py-2" aria-label="Secciones">
                                {LinksList}
                            </nav>
                        </div>

                        <div className="border-t border-neutral-200 dark:border-slate-800 p-2 flex flex-col gap-1">
                            {/* User info — not clickable */}
                            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                                {currentProfile?.pictureUrl ? (
                                    <img
                                        src={currentProfile.pictureUrl}
                                        alt={currentProfile.name}
                                        className="h-7 w-7 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-slate-700"
                                    />
                                ) : (
                                    <span className="h-7 w-7 rounded-full border border-neutral-200 dark:border-slate-700 bg-neutral-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-semibold text-neutral-600 dark:text-slate-300 shrink-0">
                                        {getInitials(currentProfile?.name)}
                                    </span>
                                )}
                                <span className="truncate text-sm font-medium text-neutral-700 dark:text-slate-300">
                                    {currentProfile?.name ?? "—"}
                                </span>
                            </div>

                            <button
                                type="button"
                                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 dark:focus-visible:ring-red-900"
                                aria-label="Cerrar sesión"
                                onClick={handleLogout}
                            >
                                <MdLogout className="h-5 w-5" />
                                <span className="truncate">Cerrar sesión</span>
                            </button>
                        </div>
                    </aside>
                </div>
            ) : null}
        </div>
    );

    return (
        <>
            {DesktopSidebar}
            {MobileNav}
        </>
    );
}
