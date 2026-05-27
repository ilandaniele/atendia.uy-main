import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
    FaBookOpen,
    FaCoins,
    FaHeadset,
    FaMagnifyingGlass,
} from "react-icons/fa6";
import { MdMenu } from "react-icons/md";
import { cn } from "utils/utils";
import { LogoSpark } from "logo";
import { useUserNavContext } from "./user-nav-context";
import NotificationsPanel from "./notifications-panel";
import type { SystemAlert } from "./notifications-panel";

type NavbarProps = {
    onOpenSidebar: () => void;
    onOpenCommand: () => void;
    showMenuButton: boolean;
    alerts: SystemAlert[];
};

export default function UserNavbar({
    onOpenSidebar,
    onOpenCommand,
    showMenuButton,
    alerts,
}: NavbarProps) {
    const { userRole, tokensBalance, hasNotifications } = useUserNavContext();

    // Detectar Mac sólo tras hidratar para evitar mismatch SSR.
    const [isMac, setIsMac] = useState(false);
    useEffect(() => {
        if (typeof navigator !== "undefined") {
            setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform));
        }
    }, []);

    return (
        <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300 px-3 sm:px-4 lg:px-6 h-16 flex items-center gap-2 sm:gap-4">
            {/* Hamburguesa móvil */}
            {showMenuButton && (
                <button
                    type="button"
                    onClick={onOpenSidebar}
                    className="md:hidden relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label="Abrir menú"
                >
                    <MdMenu className="h-5 w-5" />
                    {hasNotifications && (
                        <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                </button>
            )}

            {/* Logo */}
            <Link to="/panel" className="flex items-center gap-2.5 shrink-0 group">
                <div className="text-primary group-hover:scale-105 transition-transform">
                    <LogoSpark className="h-8 w-auto" />
                </div>
                <span className="hidden sm:inline text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-primary to-blue-600 dark:from-primary dark:to-blue-400">
                    Atendia
                </span>
            </Link>

            {/* Buscador (gatillo del command palette) */}
            <div className="flex-1 flex justify-center min-w-0">
                <button
                    type="button"
                    onClick={onOpenCommand}
                    className={cn(
                        "group w-full max-w-md flex items-center gap-2.5 h-9 px-3 rounded-xl",
                        "bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80",
                        "text-slate-500 dark:text-slate-400 text-sm",
                        "hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 hover:text-slate-700 dark:hover:text-slate-200",
                        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        "cursor-pointer"
                    )}
                    aria-label="Buscar páginas"
                >
                    <FaMagnifyingGlass className="h-3.5 w-3.5 shrink-0 group-hover:text-primary transition-colors" />
                    <span className="flex-1 text-left truncate">
                        <span className="hidden sm:inline">Buscar páginas…</span>
                        <span className="sm:hidden">Buscar</span>
                    </span>
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                        {isMac ? "⌘" : "Ctrl"} K
                    </kbd>
                </button>
            </div>

            {/* Acciones a la derecha */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <NotificationsPanel alerts={alerts} />

                {userRole === "owner" && tokensBalance !== null && (
                    <Link
                        to="/panel/facturacion"
                        className="hidden sm:flex items-center gap-2 px-3 h-9 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Ver facturación"
                    >
                        <FaCoins className="text-yellow-500 h-4 w-4" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                            {tokensBalance.toLocaleString()}
                        </span>
                    </Link>
                )}

                <a
                    href="https://docs.atendia.uy"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Documentación"
                    title="Documentación"
                    className="inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-medium text-slate-600 hover:text-primary hover:bg-primary/10 dark:text-slate-300 dark:hover:bg-primary/15 transition-colors"
                >
                    <FaBookOpen className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:inline ml-2">Documentación</span>
                </a>

                <Link
                    to="/panel/soporte"
                    aria-label="Soporte"
                    title="Soporte"
                    className="inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors"
                >
                    <FaHeadset className="h-4 w-4 shrink-0" />
                    <span className="hidden lg:inline ml-2">Soporte</span>
                </Link>
            </div>
        </nav>
    );
}
