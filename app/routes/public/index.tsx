import { Link } from "react-router";
import {
    FaRocket,
    FaBolt,
    FaChartLine,
    FaHeadset,
    FaWhatsapp,
    FaGlobe,
    FaArrowRight,
    FaCheck,
    FaStar,
    FaRegClock,
    FaShieldHalved,
    FaRobot,
    FaComments,
    FaCartShopping,
    FaCalendarCheck,
    FaUserPlus,
} from "react-icons/fa6";

// ─── SEO ──────────────────────────────────────────────────────────────────────

const SITE_URL = "https://atendia.uy";

export function meta() {
    return [
        { title: "Atendia — Chat bot con IA para WhatsApp y Web | Atención al cliente 24/7" },
        {
            name: "description",
            content:
                "Atendia crea chat bots con inteligencia artificial para WhatsApp y web que atienden a tus clientes las 24 horas. Tomá pedidos, agendá turnos y captá clientes potenciales de forma automática. Sin código, con IA Gemini. Prueba gratis.",
        },
        { name: "keywords", content: "chat bot WhatsApp, chat bot Uruguay, chat bot con IA, chatbot WhatsApp, chat bot para empresas, automatizar atención al cliente, bot WhatsApp Uruguay, inteligencia artificial negocios, respuestas automáticas WhatsApp, chat bot web, tomar pedidos por WhatsApp, agendar turnos por WhatsApp, captación de leads, bot para reservas, bot para pedidos" },
        { name: "robots", content: "index, follow" },
        { name: "og:title", content: "Atendia — Chat bot con IA para WhatsApp y Web" },
        {
            name: "og:description",
            content:
                "Automatizá la atención al cliente con un chat bot de IA disponible 24/7. Integrá WhatsApp y tu sitio web en minutos, sin código.",
        },
        { name: "og:type", content: "website" },
        { name: "og:url", content: SITE_URL },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Atendia — Chat bot con IA para WhatsApp y Web" },
        { name: "twitter:description", content: "Chat bot inteligente que responde por vos, 24/7. Sin código, sin complicaciones." },
        { tagName: "link", rel: "canonical", href: SITE_URL },
        {
            "script:ld+json": {
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "Atendia",
                "url": SITE_URL,
                "description": "Plataforma SaaS para crear chat bots con inteligencia artificial para atención al cliente por WhatsApp y web.",
                "contactPoint": {
                    "@type": "ContactPoint",
                    "contactType": "customer support",
                    "url": `${SITE_URL}/contacto`,
                },
            },
        },
        {
            "script:ld+json": {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                "name": "Atendia",
                "applicationCategory": "BusinessApplication",
                "operatingSystem": "Web",
                "description": "Crea chat bots con inteligencia artificial para WhatsApp y web. Automatizá la atención al cliente de tu negocio con IA Gemini.",
                "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD",
                    "description": "Período de prueba gratuito — sin tarjeta de crédito",
                },
                "url": SITE_URL,
            },
        },
    ];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
    {
        icon: <FaBolt className="text-fuchsia-400" size={22} />,
        title: "Respuestas instantáneas con IA",
        desc: "Tu chatbot responde en segundos por WhatsApp o web, sin importar el horario. Nunca más un cliente sin atención.",
    },
    {
        icon: <FaChartLine className="text-purple-400" size={22} />,
        title: "Base de conocimiento propia",
        desc: "Cargá documentos, precios y catálogos: el chat bot responde solo con la información de tu negocio, sin inventar.",
    },
    {
        icon: <FaHeadset className="text-fuchsia-400" size={22} />,
        title: "Derivación inteligente a humanos",
        desc: "Cuando la consulta lo requiere, Atendia deriva al agente humano en el momento justo y sin perder el hilo.",
    },
    {
        icon: <FaShieldHalved className="text-purple-400" size={22} />,
        title: "Seguro y confiable",
        desc: "Tus datos y los de tus clientes están protegidos. El bot nunca comparte información fuera de tu base de conocimiento.",
    },
];

const STEPS = [
    {
        number: "01",
        title: "Creá tu chat bot",
        desc: "Configurá el nombre, tono de voz y cargá la base de conocimiento de tu negocio en minutos.",
    },
    {
        number: "02",
        title: "Conectá WhatsApp o tu web",
        desc: "Integrá tu número de WhatsApp Business o pegá el widget en tu sitio con una sola línea de código.",
    },
    {
        number: "03",
        title: "Empezá a atender",
        desc: "Tu chat bot comienza a responder automáticamente. Vos solo revisás el historial y los leads captados.",
    },
];

const CHANNELS = [
    {
        icon: <FaWhatsapp size={28} className="text-emerald-400" />,
        name: "WhatsApp Business",
        desc: "El canal favorito de tus clientes",
    },
    {
        icon: <FaGlobe size={28} className="text-sky-400" />,
        name: "Chat Web",
        desc: "Widget embebible en tu sitio",
    },
    {
        icon: <FaRegClock size={28} className="text-fuchsia-400" />,
        name: "24 / 7",
        desc: "Sin interrupciones, sin días libres",
    },
];

const USE_CASES = [
    {
        icon: <FaCartShopping className="text-fuchsia-400" size={28} />,
        title: "Toma pedidos",
        desc: "Tu bot recibe y registra pedidos por WhatsApp o web las 24 horas. El cliente elige, confirma y vos recibís el pedido listo para procesar.",
        example: "\"Quiero 2 pizzas de mozzarella para las 20 hs\"",
    },
    {
        icon: <FaCalendarCheck className="text-purple-400" size={28} />,
        title: "Agenda turnos",
        desc: "Automatizá la reserva de citas y turnos. El bot consulta disponibilidad, confirma la hora y envía recordatorios — sin intervención humana.",
        example: "\"Necesito turno para el jueves por la tarde\"",
    },
    {
        icon: <FaUserPlus className="text-emerald-400" size={28} />,
        title: "Capta clientes potenciales",
        desc: "Recolectá nombre, email y teléfono de cada interesado de forma natural en la conversación. Tus leads quedan organizados y listos para el seguimiento.",
        example: "\"Sí, me gustaría recibir más información\"",
    },
];

const STATS = [
    { value: "24/7", label: "Disponibilidad" },
    { value: "< 3s", label: "Tiempo de respuesta" },
    { value: "2", label: "Canales integrados" },
    { value: "0", label: "Líneas de código para integrar" },
];

// ─── Shared decorative blob ───────────────────────────────────────────────────

function GradientBlob({ className }: { className: string }) {
    return (
        <div
            aria-hidden="true"
            className={`absolute rounded-full blur-3xl opacity-20 dark:opacity-15 pointer-events-none ${className}`}
        />
    );
}

// ─── Chat mockup visual ───────────────────────────────────────────────────────

function ChatMockup() {
    return (
        <div
            aria-hidden="true"
            className="w-full max-w-xs mx-auto rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl shadow-fuchsia-500/15 bg-white dark:bg-slate-900 select-none"
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <FaWhatsapp size={18} />
                </div>
                <div>
                    <p className="text-sm font-semibold leading-none">Chat bot Atendia</p>
                    <p className="text-xs text-emerald-100 mt-0.5">En línea ahora</p>
                </div>
            </div>
            {/* Messages */}
            <div className="px-4 py-4 flex flex-col gap-3 bg-slate-50 dark:bg-slate-900/60 min-h-[180px]">
                {/* User */}
                <div className="flex justify-end animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="bg-emerald-100 dark:bg-emerald-900/40 text-slate-800 dark:text-slate-200 text-xs px-3 py-2 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                        ¿Cuáles son los horarios?
                    </div>
                </div>
                {/* Bot */}
                <div className="flex items-end gap-2 animate-in fade-in slide-in-from-left-4 duration-500 delay-200">
                    <div className="w-7 h-7 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/40 flex items-center justify-center shrink-0 mb-1">
                        <FaRobot size={12} className="text-fuchsia-600 dark:text-fuchsia-400" />
                    </div>
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs px-3 py-2 rounded-2xl rounded-tl-sm max-w-[80%] shadow-sm">
                        ¡Hola! Atendemos de lunes a viernes de 9 a 18 hs. ¿En qué más puedo ayudarte? 😊
                    </div>
                </div>
                {/* User 2 */}
                <div className="flex justify-end animate-in fade-in slide-in-from-right-4 duration-500 delay-400">
                    <div className="bg-emerald-100 dark:bg-emerald-900/40 text-slate-800 dark:text-slate-200 text-xs px-3 py-2 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                        Quiero hacer un pedido
                    </div>
                </div>
                {/* Bot typing */}
                <div className="flex items-end gap-2 animate-in fade-in slide-in-from-left-4 duration-500 delay-500">
                    <div className="w-7 h-7 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/40 flex items-center justify-center shrink-0 mb-1">
                        <FaRobot size={12} className="text-fuchsia-600 dark:text-fuchsia-400" />
                    </div>
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex gap-1.5 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                </div>
            </div>
            {/* Input bar */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex-1 h-8 rounded-full bg-slate-100 dark:bg-slate-800" />
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <FaWhatsapp size={14} className="text-white" />
                </div>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
    return (
        <div className="overflow-x-hidden">

            {/* ══════════════════════════════════════════
                HERO
            ══════════════════════════════════════════ */}
            <section className="relative py-20 sm:py-28 px-4 overflow-hidden">
                <GradientBlob className="w-96 h-96 bg-fuchsia-500 -top-24 -left-32" />
                <GradientBlob className="w-80 h-80 bg-purple-600 -top-16 -right-24" />

                <div className="relative max-w-5xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
                    {/* Left — Copy */}
                    <div className="flex-1 flex flex-col items-center lg:items-start gap-6 text-center lg:text-left animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* H1 — keyword principal para SEO, visualmente se ve como badge */}
                        <h1 className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300">
                            <FaStar size={10} />
                            Chat bot con IA para WhatsApp y Web
                        </h1>

                        <p className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
                            Tu negocio atiende{" "}
                            <span className="bg-linear-to-r from-fuchsia-500 to-purple-600 bg-clip-text text-transparent">
                                24/7
                            </span>{" "}
                            sin que vos estés
                        </p>

                        <p className="text-base sm:text-lg text-slate-500 dark:text-slate-400 max-w-xl">
                            Atendia crea <strong className="text-slate-700 dark:text-slate-300">chat bots con inteligencia artificial</strong> que responden por WhatsApp y web de forma automática, rápida y natural — sin código, sin complicaciones.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                            <Link to="/panel" className="btn-primary w-full sm:w-auto px-7 py-3 text-base">
                                Empezar gratis
                                <FaArrowRight className="ml-2" />
                            </Link>
                            <Link
                                to="/planes"
                                className="w-full sm:w-auto px-7 py-3 rounded-md text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-center"
                            >
                                Ver planes y precios
                            </Link>
                        </div>

                        <ul className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-slate-400 dark:text-slate-500" role="list">
                            {["Sin tarjeta de crédito", "Período de prueba gratis", "Cancelá cuando quieras"].map((t) => (
                                <li key={t} className="flex items-center gap-1.5">
                                    <FaCheck className="text-emerald-400" size={10} />
                                    {t}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Right — Chat visual */}
                    <div className="flex-shrink-0 w-full max-w-xs lg:max-w-sm animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-200">
                        <div className="relative">
                            {/* Glow behind mockup */}
                            <div
                                aria-hidden="true"
                                className="absolute inset-0 bg-linear-to-br from-fuchsia-500/20 to-purple-600/20 rounded-3xl blur-2xl scale-90 -z-10"
                            />
                            <ChatMockup />
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                STATS
            ══════════════════════════════════════════ */}
            <section aria-label="Datos clave" className="py-10 px-4 border-y border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                    {STATS.map(({ value, label }, i) => (
                        <div
                            key={label}
                            className={`flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-${i * 100}`}
                        >
                            <span className="text-3xl sm:text-4xl font-extrabold bg-linear-to-r from-fuchsia-500 to-purple-600 bg-clip-text text-transparent">
                                {value}
                            </span>
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════
                CANALES
            ══════════════════════════════════════════ */}
            <section className="py-14 px-4" aria-labelledby="channels-heading">
                <div className="max-w-3xl mx-auto">
                    <p
                        id="channels-heading"
                        className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-8"
                    >
                        Disponible en los canales que ya usás
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {CHANNELS.map(({ icon, name, desc }, i) => (
                            <div
                                key={name}
                                className={`group flex sm:flex-col items-center sm:text-center gap-4 sm:gap-3 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-fuchsia-200 dark:hover:border-fuchsia-900 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-${i * 100}`}
                            >
                                <div className="shrink-0 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:scale-110 transition-transform duration-200">
                                    {icon}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{name}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                CASOS DE USO
            ══════════════════════════════════════════ */}
            <section className="relative py-20 px-4 overflow-hidden" aria-labelledby="use-cases-heading">
                <GradientBlob className="w-80 h-80 bg-fuchsia-500 -top-20 -right-32" />

                <div className="relative max-w-5xl mx-auto">
                    <div className="text-center mb-12 flex flex-col gap-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Para qué sirve Atendia
                        </p>
                        <h2
                            id="use-cases-heading"
                            className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100"
                        >
                            Más que atención al cliente
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
                            Atendia automatiza las tareas que más tiempo te consumen: pedidos, turnos y captación de leads, todo en la misma conversación.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {USE_CASES.map(({ icon, title, desc, example }, i) => (
                            <div
                                key={title}
                                className={`group flex flex-col gap-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-fuchsia-200 dark:hover:border-fuchsia-900 hover:-translate-y-0.5 transition-all animate-in fade-in slide-in-from-bottom-3 duration-500 delay-${i * 100}`}
                            >
                                <div className="shrink-0 self-start p-3 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:scale-110 transition-transform duration-200">
                                    {icon}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                                    <div className="mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                        <p className="text-xs text-slate-400 dark:text-slate-500 italic">{example}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                FEATURES
            ══════════════════════════════════════════ */}
            <section className="relative py-20 px-4 overflow-hidden bg-slate-50/50 dark:bg-slate-900/30 border-y border-slate-100 dark:border-slate-800" aria-labelledby="features-heading">
                <GradientBlob className="w-96 h-96 bg-purple-500 bottom-0 -right-40" />

                <div className="relative max-w-5xl mx-auto">
                    <div className="text-center mb-12 flex flex-col gap-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Por qué Atendia
                        </p>
                        <h2
                            id="features-heading"
                            className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100"
                        >
                            Todo lo que tu negocio necesita para automatizar la atención
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
                            Una plataforma completa de chat bot con IA para no perder ninguna consulta ni oportunidad de venta.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {FEATURES.map(({ icon, title, desc }, i) => (
                            <div
                                key={title}
                                className={`group flex gap-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-fuchsia-200 dark:hover:border-fuchsia-900 hover:-translate-y-0.5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-${i * 100}`}
                            >
                                <div className="shrink-0 self-start p-3 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:bg-fuchsia-50 dark:group-hover:bg-fuchsia-950/30 group-hover:scale-110 transition-all duration-200">
                                    {icon}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                INTEGRACIONES
            ══════════════════════════════════════════ */}
            <section className="py-14 px-4 border-y border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30" aria-labelledby="integrations-heading">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-10">
                    <div className="flex-1 flex flex-col gap-4 text-center sm:text-left">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Integraciones</p>
                        <h2 id="integrations-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                            Tu asistente habla con tus herramientas
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg">
                            Cuando el asistente capta un cliente potencial, registra un pedido o agenda un turno, esa información puede llegar automáticamente a donde la necesitás — sin copiar ni pegar nada.
                        </p>
                    </div>
                    <div className="shrink-0 flex flex-wrap justify-center gap-2.5 max-w-xs">
                        {["Make", "n8n", "HubSpot", "Zapier", "Google Sheets", "Slack", "y más…"].map((tool) => (
                            <span
                                key={tool}
                                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm"
                            >
                                {tool}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                CÓMO FUNCIONA
            ══════════════════════════════════════════ */}
            <section
                className="py-20 px-4"
                aria-labelledby="how-heading"
            >
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12 flex flex-col gap-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Cómo funciona
                        </p>
                        <h2
                            id="how-heading"
                            className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100"
                        >
                            Configurá tu chatbot en 3 pasos
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
                            Sin instalaciones complicadas ni conocimientos técnicos. Cualquier persona puede configurar su chat bot con IA.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        {STEPS.map(({ number, title, desc }, i) => (
                            <div
                                key={number}
                                className={`relative flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-${i * 150}`}
                            >
                                {/* Conector entre steps en desktop */}
                                {i < STEPS.length - 1 && (
                                    <div
                                        aria-hidden="true"
                                        className="hidden sm:block absolute top-6 left-[calc(100%-1rem)] w-8 h-px bg-linear-to-r from-fuchsia-300 to-purple-300 dark:from-fuchsia-800 dark:to-purple-800"
                                    />
                                )}
                                <div className="flex items-start gap-4 sm:flex-col sm:gap-3">
                                    <span className="shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl bg-linear-to-br from-fuchsia-500 to-purple-700 text-white font-extrabold text-lg shadow-lg shadow-fuchsia-500/20 hover:scale-105 transition-transform duration-200">
                                        {number}
                                    </span>
                                    <div className="flex flex-col gap-1.5 pt-1 sm:pt-0">
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                DEMO VIDEO
            ══════════════════════════════════════════ */}
            <section className="py-20 px-4" aria-labelledby="demo-heading">
                <div className="max-w-4xl mx-auto flex flex-col items-center gap-8">
                    <div className="text-center flex flex-col gap-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                            Demo en vivo
                        </p>
                        <h2
                            id="demo-heading"
                            className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100"
                        >
                            Mirá Atendia en acción
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
                            Una tienda de ropa que atiende consultas y toma pedidos de forma automática, con el catálogo cargado directamente desde Excel.
                        </p>
                    </div>
                    <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl shadow-fuchsia-500/10 aspect-video">
                        <iframe
                            src="https://www.youtube.com/embed/qeLZ9Fk6K_I"
                            title="Demo Atendia — tienda de ropa con catálogo desde Excel"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full"
                        />
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                TRUST / IA DESTACADA
            ══════════════════════════════════════════ */}
            <section className="py-14 px-4 bg-slate-50/70 dark:bg-slate-900/40 border-y border-slate-100 dark:border-slate-800" aria-label="Tecnología y confianza">
                <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                    {[
                        {
                            icon: <FaRobot size={24} className="text-fuchsia-500" />,
                            title: "Powered by Gemini AI",
                            desc: "Respuestas inteligentes, precisas y naturales gracias a la IA de Google.",
                        },
                        {
                            icon: <FaComments size={24} className="text-emerald-500" />,
                            title: "Historial completo",
                            desc: "Todas las conversaciones quedan registradas para que tu equipo pueda revisar y tomar el control.",
                        },
                        {
                            icon: <FaShieldHalved size={24} className="text-purple-500" />,
                            title: "Datos protegidos",
                            desc: "Tus datos y los de tus clientes nunca se comparten. El bot responde solo con tu información.",
                        },
                    ].map(({ icon, title, desc }) => (
                        <div key={title} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow duration-200">
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                                {icon}
                            </div>
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════
                PLANES TEASER
            ══════════════════════════════════════════ */}
            <section className="relative py-20 px-4 overflow-hidden" aria-labelledby="plans-teaser-heading">
                <GradientBlob className="w-80 h-80 bg-fuchsia-500 -bottom-20 -left-32" />

                <div className="relative max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Planes y precios</p>
                    <h2
                        id="plans-teaser-heading"
                        className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100"
                    >
                        Precios claros, sin sorpresas
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-md">
                        Empezá con el período de prueba gratuito y escalá cuando estés listo. Sin contratos, cancelá cuando quieras.
                    </p>

                    <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left" role="list">
                        {[
                            { label: "Prueba gratis", desc: "Explorá sin costo, sin tarjeta" },
                            { label: "Plan Básico", desc: "Para negocios en crecimiento" },
                            { label: "Plan Premium", desc: "Escala sin límites" },
                        ].map(({ label, desc }, i) => (
                            <li
                                key={label}
                                className={`flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-${i * 100}`}
                            >
                                <FaCheck className="shrink-0 text-emerald-400" size={14} />
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">{desc}</p>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <Link to="/planes" className="btn-primary px-8 py-3 text-base">
                        Ver todos los planes y precios
                        <FaArrowRight className="ml-2" />
                    </Link>
                </div>
            </section>

            {/* ══════════════════════════════════════════
                CTA FINAL
            ══════════════════════════════════════════ */}
            <section className="py-20 px-4">
                <div className="max-w-3xl mx-auto relative overflow-hidden rounded-3xl bg-linear-to-br from-fuchsia-600 to-purple-800 p-10 sm:p-14 text-center shadow-2xl shadow-fuchsia-500/20">
                    <div aria-hidden="true" className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div aria-hidden="true" className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

                    <div className="relative flex flex-col items-center gap-6">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold">
                            <FaRocket size={10} />
                            Empezá hoy mismo — gratis
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
                            ¿Listo para automatizar la atención al cliente de tu negocio?
                        </h2>
                        <p className="text-white/70 text-sm sm:text-base max-w-md">
                            Registrate gratis y en minutos tenés tu primer chat bot con IA funcionando en WhatsApp o tu web.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <Link
                                to="/panel"
                                className="w-full sm:w-auto px-8 py-3 rounded-md text-sm font-semibold bg-white text-fuchsia-700 hover:bg-fuchsia-50 shadow-lg transition-colors text-center"
                            >
                                Crear mi cuenta gratis
                            </Link>
                            <Link
                                to="/contacto"
                                className="w-full sm:w-auto px-8 py-3 rounded-md text-sm font-semibold border border-white/30 text-white hover:bg-white/10 transition-colors text-center"
                            >
                                Hablar con el equipo
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
}
