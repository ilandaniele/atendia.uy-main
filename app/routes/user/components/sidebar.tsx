import { useEffect, useMemo } from "react";
import {
    FaChevronLeft,
    FaChevronRight,
    FaArrowRightFromBracket,
    FaUser,
} from "react-icons/fa6";
import { MdClose } from "react-icons/md";
import { NavLink, useLocation, useNavigate, useNavigation } from "react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { cn } from "utils/utils";
import { useUserNavContext } from "./user-nav-context";
import {
    PANEL_ROUTES,
    SECTION_LABELS,
    filterAccessibleRoutes,
    type BadgeKey,
    type PanelRoute,
    type PanelSection,
} from "./panel-routes";

const SIDEBAR_STORAGE_KEY = "atendia_sidebar_collapsed";

const BADGE_COLOR: Record<BadgeKey, string> = {
    leads: "bg-red-500",
    messages: "bg-red-500",
    orders: "bg-amber-500",
    appointments: "bg-indigo-500",
};

type SidebarProps = {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
    mobileOpen: boolean;
    setMobileOpen: (value: boolean) => void;
};

function initials(name: string | undefined | null) {
    const raw = (name || "").trim();
    if (!raw) return "?";
    const parts = raw.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
    return (first + last).toUpperCase() || "?";
}

export default function UserSidebar({
    isCollapsed,
    setIsCollapsed,
    mobileOpen,
    setMobileOpen,
}: SidebarProps) {
    const { signOut } = useAuthActions();
    const navigate = useNavigate();
    const navigation = useNavigation();
    const { pathname } = useLocation();

    const { userProfile, userRole, features, badgeCounts } = useUserNavContext();

    const accessibleRoutes = useMemo(
        () => filterAccessibleRoutes(PANEL_ROUTES, userRole, features),
        [userRole, features]
    );

    const groupedRoutes = useMemo(() => {
        const groups: { section: PanelSection; routes: PanelRoute[] }[] = [];
        for (const section of ["main", "billing"] as PanelSection[]) {
            const routes = accessibleRoutes.filter((r) => r.section === section);
            if (routes.length > 0) groups.push({ section, routes });
        }
        return groups;
    }, [accessibleRoutes]);

    // Persistir colapso
    useEffect(() => {
        try {
            window.localStorage.setItem(
                SIDEBAR_STORAGE_KEY,
                isCollapsed ? "1" : "0"
            );
        } catch {
            /* storage bloqueado */
        }
    }, [isCollapsed]);

    // Cerrar drawer móvil al navegar
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname, setMobileOpen]);

    const pendingPath = navigation.location?.pathname;
    const isPendingFor = (path: string) =>
        pendingPath
            ? pendingPath === path || pendingPath.startsWith(`${path}/`)
            : false;

    const handleSignOut = async () => {
        await signOut();
        navigate("/");
    };

    const widthClass = isCollapsed ? "md:w-20" : "md:w-64";

    const NavList = (collapsed: boolean) => (
        <nav className="flex flex-col gap-5" aria-label="Navegación principal">
            {groupedRoutes.map(({ section, routes }) => (
                <div key={section}>
                    {!collapsed && (
                        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {SECTION_LABELS[section]}
                        </p>
                    )}
                    <ul className="space-y-0.5">
                        {routes.map((route) => {
                            const count = route.badgeKey
                                ? badgeCounts[route.badgeKey]
                                : 0;
                            const badgeColor = route.badgeKey
                                ? BADGE_COLOR[route.badgeKey]
                                : "bg-red-500";

                            return (
                                <li key={route.path}>
                                    <NavLink
                                        to={route.path}
                                        end={route.path === "/panel"}
                                        title={collapsed ? route.label : undefined}
                                        className={({ isActive }) =>
                                            cn(
                                                "group relative flex items-center gap-3 rounded-lg text-sm transition-colors",
                                                collapsed
                                                    ? "justify-center px-2 py-2.5"
                                                    : "px-3 py-2.5",
                                                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                                isActive || isPendingFor(route.path)
                                                    ? "bg-primary/10 text-primary font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-primary before:rounded-r"
                                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                            )
                                        }
                                    >
                                        <span className="relative shrink-0">
                                            {route.icon}
                                            {count > 0 && collapsed && (
                                                <span
                                                    className={cn(
                                                        "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900",
                                                        badgeColor
                                                    )}
                                                />
                                            )}
                                        </span>
                                        {!collapsed && (
                                            <>
                                                <span className="flex-1 truncate">
                                                    {route.label}
                                                </span>
                                                {count > 0 && (
                                                    <span
                                                        className={cn(
                                                            "min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center leading-none",
                                                            badgeColor
                                                        )}
                                                    >
                                                        {count > 99 ? "99+" : count}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );

    const UserBlock = (collapsed: boolean) => (
        <div
            className={cn(
                "border-t border-slate-200 dark:border-slate-800 mt-2",
                collapsed ? "px-2 py-2 flex flex-col gap-1" : "p-3 flex flex-col gap-2"
            )}
        >
            {collapsed ? (
                <NavLink
                    to="/panel/cuenta"
                    title={userProfile?.name ?? "Mi cuenta"}
                    className={({ isActive }) =>
                        cn(
                            "flex items-center justify-center rounded-lg p-2 transition-colors",
                            isActive
                                ? "bg-primary/10"
                                : "hover:bg-slate-100 dark:hover:bg-slate-800"
                        )
                    }
                >
                    {userProfile?.pictureUrl ? (
                        <img
                            src={userProfile.pictureUrl}
                            alt={userProfile.name ?? ""}
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                        />
                    ) : (
                        <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                            {initials(userProfile?.name)}
                        </span>
                    )}
                </NavLink>
            ) : (
                <div className="flex items-center gap-3 px-1">
                    {userProfile?.pictureUrl ? (
                        <img
                            src={userProfile.pictureUrl}
                            alt={userProfile.name ?? ""}
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                    ) : (
                        <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                            {initials(userProfile?.name)}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {userProfile?.name ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {userProfile?.email ?? ""}
                        </p>
                    </div>
                </div>
            )}

            {!collapsed && (
                <NavLink
                    to="/panel/cuenta"
                    className={({ isActive }) =>
                        cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            isActive
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        )
                    }
                >
                    <FaUser className="h-4 w-4 shrink-0" />
                    <span>Mi cuenta</span>
                </NavLink>
            )}

            <button
                type="button"
                onClick={handleSignOut}
                title={collapsed ? "Cerrar sesión" : undefined}
                className={cn(
                    "flex items-center rounded-lg text-sm text-red-600 dark:text-red-400 transition-colors",
                    "hover:bg-red-50 dark:hover:bg-red-900/20",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300",
                    collapsed
                        ? "justify-center p-2"
                        : "gap-3 px-3 py-2 font-medium"
                )}
            >
                <FaArrowRightFromBracket className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Cerrar sesión</span>}
            </button>
        </div>
    );

    // ─── Desktop ───────────────────────────────────────────────────────────
    const Desktop = (
        <aside
            aria-label="Barra lateral"
            className={cn(
                "hidden md:flex md:flex-col md:fixed md:top-16 md:left-0 md:bottom-0 z-40",
                "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800",
                "transition-[width] duration-300 ease-out",
                widthClass
            )}
        >
            <div
                className={cn(
                    "flex items-center px-3 py-3 border-b border-slate-200 dark:border-slate-800",
                    isCollapsed ? "justify-center" : "justify-end"
                )}
            >
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label={isCollapsed ? "Expandir menú" : "Colapsar menú"}
                    aria-pressed={isCollapsed}
                >
                    {isCollapsed ? (
                        <FaChevronRight className="h-3.5 w-3.5" />
                    ) : (
                        <FaChevronLeft className="h-3.5 w-3.5" />
                    )}
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
                {NavList(isCollapsed)}
            </div>

            {UserBlock(isCollapsed)}
        </aside>
    );

    // ─── Mobile drawer ─────────────────────────────────────────────────────
    const Mobile = mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-[110]" role="dialog" aria-modal="true">
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
            />
            <aside
                className="absolute left-0 top-0 h-full w-4/5 max-w-xs bg-white dark:bg-slate-900 shadow-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col animate-in slide-in-from-left duration-200"
                aria-label="Menú de navegación"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Menú
                    </span>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Cerrar menú"
                    >
                        <MdClose className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
                    {NavList(false)}
                </div>

                {UserBlock(false)}
            </aside>
        </div>
    ) : null;

    return (
        <>
            {Desktop}
            {Mobile}
        </>
    );
}
