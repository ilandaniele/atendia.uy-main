import { api } from "convex/_generated/api";
import { useAction } from "convex/react";
import { useState } from "react";
import { GoogleReCaptcha, GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import {
    FaBuilding,
    FaCircleCheck,
    FaEnvelope,
    FaLocationDot,
    FaPhone,
    FaSpinner,
    FaUser,
} from "react-icons/fa6";
import { useLoaderData } from "react-router";
import { getEnv } from "utils/utils";

interface LoaderData {
    recaptchaKey: string;
}

export async function loader() {
    const recaptchaKey = getEnv("GOOGLE_RECAPTCHA_ID");
    return { recaptchaKey } as LoaderData;
}

const SITE_URL = "https://atendia.uy";

export function meta() {
    return [
        { title: "Contacto — Hablá con el equipo de Atendia" },
        {
            name: "description",
            content:
                "¿Tenés dudas sobre nuestro chatbot con IA para WhatsApp? Contactá al equipo de Atendia. Respondemos a la brevedad para ayudarte a automatizar la atención al cliente de tu negocio.",
        },
        { name: "keywords", content: "contacto Atendia, soporte chatbot IA, consulta asistente virtual, demo chatbot WhatsApp" },
        { name: "robots", content: "index, follow" },
        { name: "og:title", content: "Contacto — Atendia" },
        { name: "og:description", content: "Contactá al equipo de Atendia. Estamos para ayudarte a automatizar la atención al cliente de tu negocio con IA." },
        { name: "og:type", content: "website" },
        { name: "og:url", content: `${SITE_URL}/contacto` },
        { tagName: "link", rel: "canonical", href: `${SITE_URL}/contacto` },
        {
            "script:ld+json": {
                "@context": "https://schema.org",
                "@type": "ContactPage",
                "name": "Contacto — Atendia",
                "description": "Formulario de contacto para consultas sobre el chatbot de IA Atendia.",
                "url": `${SITE_URL}/contacto`,
                "breadcrumb": {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": SITE_URL },
                        { "@type": "ListItem", "position": 2, "name": "Contacto", "item": `${SITE_URL}/contacto` },
                    ],
                },
            },
        },
    ];
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
    label,
    required,
    icon,
    children,
}: {
    label: string;
    required?: boolean;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <div className="relative">
                {icon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
                        {icon}
                    </span>
                )}
                {children}
            </div>
        </div>
    );
}

const INPUT_CLASS =
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all";
const INPUT_WITH_ICON = "pl-10 " + INPUT_CLASS;

// ─── Form (inner — needs reCaptcha context) ───────────────────────────────────

function ContactForm() {
    const createContactForm = useAction(api.contactForms.create);

    const [token, setToken] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [company, setCompany] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) {
            setError("La verificación reCAPTCHA aún no completó. Intentá de nuevo en un momento.");
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            await createContactForm({
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim() || undefined,
                address: address.trim() || undefined,
                company: company.trim() || undefined,
                subject: subject.trim(),
                message: message.trim(),
                recaptchaToken: token,
            });
            setSubmitted(true);
        } catch {
            setError("Ocurrió un error al enviar el formulario. Por favor, intentá de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Success state ─────────────────────────────────────────────────────────
    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center">
                <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <FaCircleCheck className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        ¡Mensaje enviado!
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
                        Recibimos tu consulta. Te contactaremos a la brevedad al correo{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setSubmitted(false);
                        setName(""); setEmail(""); setPhone(""); setAddress("");
                        setCompany(""); setSubject(""); setMessage("");
                    }}
                    className="text-sm text-primary hover:underline font-medium"
                >
                    Enviar otro mensaje
                </button>
            </div>
        );
    }

    // ─── Form ──────────────────────────────────────────────────────────────────
    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <GoogleReCaptcha action="contact_form" onVerify={setToken} />

            {/* Row: Nombre + Empresa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Nombre" required icon={<FaUser className="h-4 w-4" />}>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tu nombre completo"
                        required
                        maxLength={100}
                        className={INPUT_WITH_ICON}
                    />
                </Field>
                <Field label="Empresa / Organización" icon={<FaBuilding className="h-4 w-4" />}>
                    <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Opcional"
                        maxLength={100}
                        className={INPUT_WITH_ICON}
                    />
                </Field>
            </div>

            {/* Row: Email + Teléfono */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Correo electrónico" required icon={<FaEnvelope className="h-4 w-4" />}>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        required
                        maxLength={150}
                        className={INPUT_WITH_ICON}
                    />
                </Field>
                <Field label="Teléfono" icon={<FaPhone className="h-4 w-4" />}>
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+598 99 000 000"
                        maxLength={30}
                        className={INPUT_WITH_ICON}
                    />
                </Field>
            </div>

            {/* Dirección */}
            <Field label="Dirección" icon={<FaLocationDot className="h-4 w-4" />}>
                <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ciudad, país (opcional)"
                    maxLength={200}
                    className={INPUT_WITH_ICON}
                />
            </Field>

            {/* Asunto */}
            <Field label="Asunto" required>
                <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    className={INPUT_CLASS}
                >
                    <option value="" disabled>Seleccioná un asunto…</option>
                    <option value="Información general">Información general</option>
                    <option value="Solicitud de demo">Solicitud de demo</option>
                    <option value="Facturación y precios">Facturación y precios</option>
                    <option value="Alianzas y partnerships">Alianzas y partnerships</option>
                    <option value="Otro">Otro</option>
                </select>
            </Field>

            {/* Mensaje */}
            <Field label="Mensaje" required>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Contanos en qué podemos ayudarte..."
                    required
                    rows={5}
                    maxLength={2000}
                    className={`${INPUT_CLASS} resize-none`}
                />
                <span className="absolute bottom-2 right-3 text-xs text-slate-400 tabular-nums pointer-events-none">
                    {message.length}/2000
                </span>
            </Field>

            {/* Error */}
            {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                    {error}
                </p>
            )}

            {/* Submit */}
            <button
                type="submit"
                disabled={submitting || !name.trim() || !email.trim() || !subject || !message.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {submitting ? (
                    <FaSpinner className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {submitting ? "Enviando…" : "Enviar mensaje"}
            </button>

            <p className="text-center text-xs text-slate-400 dark:text-slate-600">
                Este sitio está protegido por reCAPTCHA v3.{" "}
                <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-slate-500"
                >
                    Política de privacidad
                </a>{" "}
                y{" "}
                <a
                    href="https://policies.google.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-slate-500"
                >
                    Términos de servicio
                </a>{" "}
                de Google.
            </p>
        </form>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactUsPage() {
    const { recaptchaKey } = useLoaderData<LoaderData>();

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950 py-16 px-4">
            <div className="max-w-2xl mx-auto flex flex-col gap-10">
                {/* Header */}
                <header className="text-center flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                        Contacto
                    </p>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
                        Hablemos
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-md mx-auto">
                        Completá el formulario y nos comunicamos con vos a la brevedad.
                    </p>
                </header>

                {/* Card */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6 sm:p-8">
                    <GoogleReCaptchaProvider reCaptchaKey={recaptchaKey} language="es">
                        <ContactForm />
                    </GoogleReCaptchaProvider>
                </div>

                {/* Footer */}
                <footer className="text-center text-xs text-slate-400 dark:text-slate-600">
                    © {new Date().getFullYear()} Atendia. Todos los derechos reservados.
                </footer>
            </div>
        </div>
    );
}
