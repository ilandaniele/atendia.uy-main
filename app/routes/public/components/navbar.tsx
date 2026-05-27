import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router";
import { FaBars, FaXmark } from "react-icons/fa6";
import { LogoSpark } from "../../../../logo";
import { cn } from "utils/utils";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";

const NAV_LINKS = [
    { label: "Inicio", to: "/" },
    { label: "Planes", to: "/planes" },
    { label: "Contacto", to: "/contacto" },
];

export default function PublicNavbar() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const userProfile = useQuery(api.profiles.me);

    // Sombra al hacer scroll
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Cerrar menú al cambiar de ruta
    const closeMenu = () => setMenuOpen(false);

    const panelHref = userProfile?.role === "admin" ? "/administracion" : "/panel";

    return (
        <header
            className={cn(
                "sticky top-0 z-50 w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b transition-shadow duration-200",
                scrolled
                    ? "border-slate-200 dark:border-slate-800 shadow-sm"
                    : "border-transparent"
            )}
            role="banner"
        >
            <nav
                className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16"
                aria-label="Navegación principal"
            >
                {/* Logo */}
                <Link
                    to="/"
                    onClick={closeMenu}
                    className="flex items-center gap-2.5 group"
                    aria-label="Atendia — Ir al inicio"
                >
                    <LogoSpark className="w-9 h-9" />
                    <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-primary transition-colors">
                        Atendia
                    </span>
                </Link>

                {/* Links — desktop */}
                <ul className="hidden sm:flex items-center gap-1" role="list">
                    {NAV_LINKS.map(({ label, to }) => (
                        <li key={to}>
                            <NavLink
                                to={to}
                                end={to === "/"}
                                onClick={closeMenu}
                                className={({ isActive }) =>
                                    cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                                        isActive
                                            ? "text-primary bg-primary/8 dark:bg-primary/12"
                                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                                    )
                                }
                            >
                                {label}
                            </NavLink>
                        </li>
                    ))}
                </ul>

                {/* CTA — desktop */}
                <div className="hidden sm:block">
                    <Link to={panelHref} className="btn-primary text-sm">
                        Ir al panel
                    </Link>
                </div>

                {/* Hamburger — mobile */}
                <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="sm:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-menu"
                    aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                >
                    {menuOpen ? <FaXmark size={20} /> : <FaBars size={20} />}
                </button>
            </nav>

            {/* Menú mobile */}
            {menuOpen && (
                <div
                    id="mobile-menu"
                    className="sm:hidden border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 pb-5 pt-3 flex flex-col gap-1 animate-in slide-in-from-top-2 duration-150"
                >
                    {NAV_LINKS.map(({ label, to }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === "/"}
                            onClick={closeMenu}
                            className={({ isActive }) =>
                                cn(
                                    "px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                                    isActive
                                        ? "text-primary bg-primary/8 dark:bg-primary/12"
                                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                                )
                            }
                        >
                            {label}
                        </NavLink>
                    ))}
                    <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <Link
                            to={panelHref}
                            onClick={closeMenu}
                            className="btn-primary w-full justify-center"
                        >
                            Ir al panel
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}
