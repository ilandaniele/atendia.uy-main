import { Link } from "react-router";
import { FaLinkedin, FaInstagram, FaFacebook, FaYoutube, FaTiktok } from "react-icons/fa6";
import { LogoSpark } from "../../../../logo";

const NAV_LINKS = [
    { label: "Inicio", to: "/" },
    { label: "Planes", to: "/planes" },
    { label: "Contacto", to: "/contacto" },
    { label: "Documentación", to: "https://docs.atendia.uy", external: true },
];

const LEGAL_LINKS = [
    { label: "Política de Privacidad", to: "/politica-de-privacidad" },
    { label: "Términos y Condiciones", to: "/terminos-y-condiciones" },
];

const SOCIAL_LINKS = [
    {
        label: "LinkedIn de Atendia",
        href: "https://www.linkedin.com/company/atendia",
        icon: <FaLinkedin size={18} />,
    },
    {
        label: "Instagram de Atendia",
        href: "https://www.instagram.com/atendia.uy/",
        icon: <FaInstagram size={18} />,
    },
    {
        label: "Facebook de Atendia",
        href: "https://www.facebook.com/profile.php?id=61585229774074",
        icon: <FaFacebook size={18} />,
    },
    {
        label: "YouTube de Atendia",
        href: "https://www.youtube.com/@AtendiaUY",
        icon: <FaYoutube size={18} />,
    },
    {
        label: "TikTok de Atendia",
        href: "https://www.tiktok.com/@atendia.uy",
        icon: <FaTiktok size={18} />,
    },
];

export default function PublicFooter() {
    return (
        <footer
            className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
            aria-label="Pie de página"
        >
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">

                    {/* Columna 1 — Marca */}
                    <div className="flex flex-col gap-4">
                        <Link
                            to="/"
                            className="flex items-center gap-2.5 group w-fit"
                            aria-label="Atendia — Ir al inicio"
                        >
                            <LogoSpark className="w-9 h-9" />
                            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-primary transition-colors">
                                Atendia
                            </span>
                        </Link>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                            Automatizá la atención al cliente de tu negocio con inteligencia artificial, disponible 24/7.
                        </p>
                        {/* Redes sociales */}
                        <div className="flex items-center gap-3 mt-1" aria-label="Redes sociales">
                            {SOCIAL_LINKS.map(({ label, href, icon }) => (
                                <a
                                    key={href}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={label}
                                    className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary hover:bg-primary/8 dark:hover:bg-primary/12 transition-colors"
                                >
                                    {icon}
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Columna 2 — Navegación */}
                    <nav aria-label="Enlaces del sitio">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                            Sitio
                        </p>
                        <ul className="flex flex-col gap-2.5" role="list">
                            {NAV_LINKS.map(({ label, to, external }) => (
                                <li key={to}>
                                    {external ? (
                                        <a
                                            href={to}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors"
                                        >
                                            {label}
                                        </a>
                                    ) : (
                                        <Link
                                            to={to}
                                            className="text-sm text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors"
                                        >
                                            {label}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </nav>

                    {/* Columna 3 — Legal */}
                    <nav aria-label="Información legal">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                            Legal
                        </p>
                        <ul className="flex flex-col gap-2.5" role="list">
                            {LEGAL_LINKS.map(({ label, to }) => (
                                <li key={to}>
                                    <Link
                                        to={to}
                                        className="text-sm text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors"
                                    >
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                </div>

                {/* Separador + copyright */}
                <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-slate-400 dark:text-slate-600 text-center sm:text-left">
                        © {new Date().getFullYear()} Atendia. Todos los derechos reservados.
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-600">
                        Hecho con ❤️ en Uruguay
                    </p>
                </div>
            </div>
        </footer>
    );
}
