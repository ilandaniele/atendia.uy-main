import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import {
    FaBolt,
    FaBuilding,
    FaCheck,
    FaCircleQuestion,
    FaCoins,
    FaCrown,
    FaGem,
    FaRocket,
    FaStar,
    FaSpinner,
    FaClock,
} from "react-icons/fa6";
import { Link } from "react-router";
import { cn } from "utils/utils";

// ─── SEO ──────────────────────────────────────────────────────────────────────

const SITE_URL = "https://atendia.uy";

export function meta() {
    return [
        { title: "Planes y Precios — Chat bot con IA para WhatsApp | Atendia" },
        {
            name: "description",
            content:
                "Conocé los planes de Atendia para automatizar la atención al cliente con un chat bot de IA. Prueba gratuita sin tarjeta, planes mensuales sin contratos. Chat bot para WhatsApp y web desde Uruguay.",
        },
        { name: "keywords", content: "precio chat bot WhatsApp, chat bot Uruguay precio, plan chat bot IA, chatbot WhatsApp precio, bot WhatsApp costo, automatización atención cliente precio" },
        { name: "robots", content: "index, follow" },
        { name: "og:title", content: "Planes y Precios — Chat bot con IA para WhatsApp | Atendia" },
        {
            name: "og:description",
            content:
                "Automatizá la atención al cliente con IA. Planes flexibles con prueba gratuita, sin contratos ni tarjeta de crédito.",
        },
        { name: "og:type", content: "website" },
        { name: "og:url", content: `${SITE_URL}/planes` },
        { tagName: "link", rel: "canonical", href: `${SITE_URL}/planes` },
        {
            "script:ld+json": {
                "@context": "https://schema.org",
                "@type": "WebPage",
                "name": "Planes y Precios — Atendia",
                "description": "Planes de suscripción para el chat bot de IA Atendia. Automatizá la atención al cliente por WhatsApp y web.",
                "url": `${SITE_URL}/planes`,
                "breadcrumb": {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": SITE_URL },
                        { "@type": "ListItem", "position": 2, "name": "Planes", "item": `${SITE_URL}/planes` },
                    ],
                },
            },
        },
        {
            "script:ld+json": {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": "¿Qué son los tokens?",
                        "acceptedAnswer": { "@type": "Answer", "text": "Los tokens son la unidad de consumo de la IA. Cada mensaje procesado por el asistente consume una cantidad de tokens según su longitud y complejidad." },
                    },
                    {
                        "@type": "Question",
                        "name": "¿Puedo cambiar de plan en cualquier momento?",
                        "acceptedAnswer": { "@type": "Answer", "text": "Sí. Podés actualizar o cambiar tu plan cuando quieras desde el panel de facturación de tu cuenta." },
                    },
                    {
                        "@type": "Question",
                        "name": "¿Cómo funciona el período de prueba?",
                        "acceptedAnswer": { "@type": "Answer", "text": "Al registrarte en Atendia obtenés un período de prueba gratuito para que explores todas las funcionalidades antes de elegir un plan." },
                    },
                    {
                        "@type": "Question",
                        "name": "¿Los pagos son seguros?",
                        "acceptedAnswer": { "@type": "Answer", "text": "Absolutamente. Los pagos se procesan a través de dLocal Go, una pasarela de pagos certificada y segura para Latinoamérica." },
                    },
                ],
            },
        },
    ];
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    FaCrown: FaCrown,
    FaRocket: FaRocket,
    FaStar: FaStar,
    FaBolt: FaBolt,
    FaGem: FaGem,
};

function PlanIcon({ name, className }: { name: string; className?: string }) {
    const Icon = ICON_MAP[name] ?? FaStar;
    return <Icon className={className} />;
}

// ─── Frequency label ──────────────────────────────────────────────────────────

function frequencyLabel(type: string) {
    const map: Record<string, string> = {
        MONTHLY: "mes",
        YEARLY: "año",
        WEEKLY: "semana",
        DAILY: "día",
    };
    return map[type] ?? type.toLowerCase();
}

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQS = [
    {
        q: "¿Qué son los tokens?",
        a: "Los tokens son la unidad de consumo de la IA. Cada mensaje procesado por el asistente consume una cantidad de tokens según su longitud y complejidad.",
    },
    {
        q: "¿Puedo cambiar de plan en cualquier momento?",
        a: "Sí. Podés actualizar o cambiar tu plan cuando quieras desde el panel de facturación de tu cuenta.",
    },
    {
        q: "¿Cómo funciona el período de prueba?",
        a: "Al registrarte en Atendia obtenés un período de prueba gratuito para que explores todas las funcionalidades antes de elegir un plan.",
    },
    {
        q: "¿Los pagos son seguros?",
        a: "Absolutamente. Los pagos se procesan a través de dLocal Go, una pasarela de pagos certificada y segura para Latinoamérica.",
    },
];

// ─── Plan card ────────────────────────────────────────────────────────────────

interface Plan {
    _id: string;
    name: string;
    description: string;
    tokens: number;
    icon: string;
    amount: number;
    currency: string;
    frequencyType: string;
    frequencyValue: number;
    subscriptionUrl?: string;
}

const TRIAL_FEATURES = [
    "Acceso completo a la plataforma",
    "Sin tarjeta de crédito",
    "Chat bot de IA incluido",
];

// Tarjeta estática de prueba — siempre aparece primero en el grid.
// Respeta la misma estructura de 4 filas que PlanCard para el subgrid.
function TrialCard() {
    return (
        <article
            aria-label="Plan de Prueba gratuito"
            className="relative row-span-4 grid grid-rows-subgrid rounded-2xl border-2 border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-lg transition-all duration-200 overflow-hidden bg-white dark:bg-slate-900"
        >
            {/* Fila 1 — Icono + nombre */}
            <div className="flex flex-col items-center text-center gap-3 px-6 pt-6 pb-4">
                <div className="p-4 rounded-2xl text-3xl shadow-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <FaClock />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        Plan de Prueba
                    </h2>
                    <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                        <FaCoins className="shrink-0 text-amber-400" aria-hidden="true" />
                        50.000 tokens
                    </p>
                </div>
            </div>

            {/* Fila 2 — Precio */}
            <div className="text-center px-6 py-5">
                <div className="flex items-end justify-center gap-1.5">
                    <span className="text-4xl font-extrabold text-slate-800 dark:text-slate-100">
                        Gratis
                    </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    durante 5 días
                </p>
            </div>

            {/* Fila 3 — Features */}
            <div className="px-6 py-4">
                <ul className="flex flex-col gap-2.5">
                    {TRIAL_FEATURES.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                            <FaCheck className="shrink-0 mt-0.5 text-emerald-500" aria-hidden="true" />
                            {f}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Fila 4 — CTA */}
            <div className="px-6 py-5 self-end">
                <Link to="/panel" className="btn-primary w-full justify-center">
                    Suscribirme
                </Link>
            </div>
        </article>
    );
}

const ENTERPRISE_FEATURES = [
    "Volumen ilimitado de mensajes",
    "Integraciones personalizadas",
    "Soporte dedicado y SLA",
    "Onboarding a medida",
];

function EnterpriseCard() {
    return (
        <article
            aria-label="Plan Enterprise"
            className="mt-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-lg transition-all duration-200 overflow-hidden bg-linear-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950"
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center p-6 md:p-8">
                <div className="md:col-span-2 flex flex-col sm:flex-row items-start gap-4">
                    <div className="p-4 rounded-2xl text-3xl shadow-sm bg-primary/10 text-primary shrink-0">
                        <FaBuilding />
                    </div>
                    <div className="flex flex-col gap-3">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                                Plan Empresas
                            </h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                ¿Necesitás algo más? Soluciones a medida para empresas con grandes volúmenes y requisitos específicos.
                            </p>
                        </div>
                        <ul className="flex flex-col gap-2">
                            {ENTERPRISE_FEATURES.map((f) => (
                                <li key={f} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <FaCheck className="shrink-0 text-emerald-500" aria-hidden="true" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="flex md:justify-end">
                    <a
                        href="mailto:ventas@atendia.uy?subject=Consulta%20Plan%20Empresas"
                        className="btn-primary w-full md:w-auto justify-center"
                    >
                        Contactar con ventas
                    </a>
                </div>
            </div>
        </article>
    );
}

// Cada card usa row-span-4 + grid-rows-subgrid para que las 4 secciones
// (header, precio, features, botón) compartan las mismas filas del grid padre
// y todas las cards queden perfectamente alineadas sin importar el contenido.
function PlanCard({ plan, highlighted }: { plan: Plan; highlighted: boolean }) {
    const isPaid = plan.amount > 0;
    const features = plan.description
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

    return (
        <article
            aria-label={`Plan ${plan.name}`}
            className={cn(
                "relative row-span-4 grid grid-rows-subgrid rounded-2xl border-2 transition-all duration-200 overflow-hidden bg-white dark:bg-slate-900",
                highlighted
                    ? "border-primary shadow-xl shadow-primary/10"
                    : "border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-lg"
            )}
        >
            {/* Popular badge — absoluto, no ocupa espacio en el subgrid */}
            {highlighted && (
                <div className="absolute top-0 inset-x-0 flex justify-center z-10">
                    <span className="bg-primary text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-b-xl">
                        Más popular
                    </span>
                </div>
            )}

            {/* Fila 1 — Icono + nombre + tokens */}
            <div className={cn(
                "flex flex-col items-center text-center gap-3 px-6 pt-6 pb-4",
                highlighted && "pt-10"
            )}>
                <div className={cn(
                    "p-4 rounded-2xl text-3xl shadow-sm",
                    highlighted
                        ? "bg-primary/10 text-primary"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                )}>
                    <PlanIcon name={plan.icon} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        {plan.name}
                    </h2>
                    <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                        <FaCoins className="shrink-0 text-amber-400" aria-hidden="true" />
                        {plan.tokens.toLocaleString("es-UY")} tokens
                    </p>
                </div>
            </div>

            {/* Fila 2 — Precio */}
            <div className="text-center px-6 py-5">
                {isPaid ? (
                    <>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                {plan.currency}
                            </span>
                            <span className="text-4xl font-extrabold text-slate-800 dark:text-slate-100">
                                {plan.amount.toLocaleString("es-UY")}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            por {frequencyLabel(plan.frequencyType)}
                        </p>
                    </>
                ) : (
                    <>
                        <span className="text-4xl font-extrabold text-slate-800 dark:text-slate-100">
                            Gratis
                        </span>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            período de prueba
                        </p>
                    </>
                )}
            </div>

            {/* Fila 3 — Features */}
            <div className="px-6 py-4">
                <ul className="flex flex-col gap-2.5">
                    {features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                            <FaCheck className="shrink-0 mt-0.5 text-emerald-500" aria-hidden="true" />
                            {f}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Fila 4 — CTA */}
            <div className="px-6 py-5 self-end">
                <Link
                    to="/panel/facturacion"
                    className="btn-primary w-full justify-center"
                >
                    {isPaid ? "Suscribirme" : "Empezar gratis"}
                </Link>
            </div>
        </article>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlansPage() {
    const plans = useQuery(api.plans.list);

    const sortedPlans = plans ? [...(plans as Plan[])].sort((a, b) => a.amount - b.amount) : null;

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950">
            {/* ── Hero ── */}
            <section className="pt-20 pb-12 px-4 text-center">
                <div className="max-w-2xl mx-auto flex flex-col gap-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                        Precios
                    </p>
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                        Elegí el plan ideal para tu negocio
                    </h1>
                    <p className="text-base sm:text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                        Automatizá la atención al cliente con inteligencia artificial. Sin contratos, cancelá cuando quieras.
                    </p>
                </div>
            </section>

            {/* ── Plans grid ── */}
            <section aria-label="Planes disponibles" className="px-4 pb-20">
                <div className="max-w-5xl mx-auto">
                    {sortedPlans === null ? (
                        /* Loading */
                        <div className="flex justify-center py-24">
                            <FaSpinner className="animate-spin text-primary text-4xl" aria-label="Cargando planes…" />
                        </div>
                    ) : sortedPlans.length === 0 ? (
                        /* Empty */
                        <div className="text-center py-24 text-slate-400 dark:text-slate-600">
                            <p className="text-lg font-medium">Próximamente</p>
                            <p className="text-sm mt-1">Los planes estarán disponibles en breve.</p>
                        </div>
                    ) : (
                        // total = trial card (siempre) + planes de la BD
                        <div
                            className={cn(
                                "grid gap-x-6 gap-y-6 grid-rows-[auto_auto_auto_auto]",
                                sortedPlans.length === 1 && "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto",
                                sortedPlans.length >= 2 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                            )}
                        >
                            <TrialCard />
                            {sortedPlans.map((plan, i) => (
                                <PlanCard
                                    key={plan._id}
                                    plan={plan}
                                    highlighted={i === 0}
                                />
                            ))}
                        </div>
                    )}

                    <EnterpriseCard />
                </div>
            </section>

            {/* ── Trustbar ── */}
            <section className="bg-slate-50 dark:bg-slate-900/50 border-y border-slate-100 dark:border-slate-800 py-10 px-4">
                <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                    {[
                        { icon: "🔒", title: "Pagos seguros", desc: "Procesados por dLocal Go, certificado para Latinoamérica." },
                        { icon: "🤖", title: "Chat bot incluido", desc: "Chat bot con IA listo para usar desde el primer día." },
                        { icon: "📊", title: "Sin contratos", desc: "Cancelá o cambiá de plan en cualquier momento, sin penalidades." },
                    ].map(({ icon, title, desc }) => (
                        <div key={title} className="flex flex-col items-center gap-2">
                            <span className="text-3xl" role="img" aria-label={title}>{icon}</span>
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── FAQ ── */}
            <section className="py-20 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-10 flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</p>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                            Preguntas frecuentes
                        </h2>
                    </div>
                    <dl className="flex flex-col gap-4">
                        {FAQS.map(({ q, a }) => (
                            <div
                                key={q}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex gap-4"
                            >
                                <FaCircleQuestion
                                    className="shrink-0 mt-0.5 text-primary text-lg"
                                    aria-hidden="true"
                                />
                                <div className="flex flex-col gap-1.5">
                                    <dt className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                                        {q}
                                    </dt>
                                    <dd className="text-sm text-slate-500 dark:text-slate-400">{a}</dd>
                                </div>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="pb-20 px-4">
                <div className="max-w-2xl mx-auto bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-10 text-center flex flex-col items-center gap-5">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        ¿Todavía tenés dudas?
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                        Nuestro equipo está listo para ayudarte a elegir el plan que mejor se adapta a tu negocio.
                    </p>
                    <Link
                        to="/contacto"
                        className="btn-primary"
                    >
                        Contactanos
                    </Link>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="pb-10 text-center">
                <p className="text-xs text-slate-400 dark:text-slate-600">
                    © {new Date().getFullYear()} Atendia. Todos los derechos reservados.
                </p>
            </footer>
        </div>
    );
}
