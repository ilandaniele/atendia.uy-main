import { FaCircleQuestion, FaHeadset, FaChevronRight, FaYoutube } from "react-icons/fa6";
import { Link } from "react-router";

export function meta() {
    return [
        { title: "Soporte — Atendia" },
        { name: "description", content: "Centro de soporte de Atendia." },
    ];
}

const TOP_SECTIONS = [
    {
        href: "/panel/soporte/preguntas-frecuentes",
        icon: <FaCircleQuestion className="h-8 w-8" />,
        iconBg: "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400",
        title: "Preguntas frecuentes",
        description:
            "Encontrá respuestas rápidas a las dudas más comunes sobre el uso de la plataforma.",
        cta: "Ver preguntas frecuentes",
        accent: "group-hover:border-violet-300 dark:group-hover:border-violet-700",
        ctaColor: "text-violet-600 dark:text-violet-400",
        external: false,
    },
    {
        href: "https://www.youtube.com/@AtendiaUY",
        icon: <FaYoutube className="h-8 w-8" />,
        iconBg: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
        title: "Canal de YouTube",
        description:
            "Mirá demostraciones y tutoriales sobre cómo sacarle el máximo provecho a Atendia.",
        cta: "Ver canal",
        accent: "group-hover:border-red-300 dark:group-hover:border-red-700",
        ctaColor: "text-red-600 dark:text-red-400",
        external: true,
    },
];

const BOTTOM_SECTION = {
    href: "/panel/soporte/tickets",
    icon: <FaHeadset className="h-8 w-8" />,
    iconBg: "bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400",
    title: "Soporte técnico",
    description:
        "Reportá un problema, pedí ayuda o consultá sobre tu cuenta. El equipo de Atendia te responderá a la brevedad.",
    cta: "Ver mis tickets",
    accent: "group-hover:border-sky-300 dark:group-hover:border-sky-700",
    ctaColor: "text-sky-600 dark:text-sky-400",
    external: false,
};

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto flex flex-col gap-10">
                {/* Header */}
                <header className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                        Centro de ayuda
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
                        ¿En qué podemos ayudarte?
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-md mx-auto">
                        Elegí la opción que mejor se adapte a tu consulta.
                    </p>
                </header>

                {/* Cards */}
                <div className="flex flex-col gap-4 sm:gap-6">
                    {/* Top row — 2 columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        {TOP_SECTIONS.map((section) => {
                            const cardClass = `group flex flex-col gap-5 p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 ${section.accent}`;
                            const inner = (
                                <>
                                    <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${section.iconBg} transition-transform duration-200 group-hover:scale-105`}>
                                        {section.icon}
                                    </div>
                                    <div className="flex flex-col gap-2 flex-1">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                            {section.title}
                                        </h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                            {section.description}
                                        </p>
                                    </div>
                                    <div className={`flex items-center gap-1.5 text-sm font-semibold ${section.ctaColor} mt-auto`}>
                                        {section.cta}
                                        <FaChevronRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                                    </div>
                                </>
                            );
                            return section.external ? (
                                <a key={section.href} href={section.href} target="_blank" rel="noopener noreferrer" className={cardClass}>
                                    {inner}
                                </a>
                            ) : (
                                <Link key={section.href} to={section.href} className={cardClass}>
                                    {inner}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Bottom row — full width */}
                    <Link
                        to={BOTTOM_SECTION.href}
                        className={`group flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 ${BOTTOM_SECTION.accent}`}
                    >
                        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${BOTTOM_SECTION.iconBg} transition-transform duration-200 group-hover:scale-105`}>
                            {BOTTOM_SECTION.icon}
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                {BOTTOM_SECTION.title}
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                {BOTTOM_SECTION.description}
                            </p>
                        </div>
                        <div className={`flex items-center gap-1.5 text-sm font-semibold shrink-0 ${BOTTOM_SECTION.ctaColor}`}>
                            {BOTTOM_SECTION.cta}
                            <FaChevronRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
