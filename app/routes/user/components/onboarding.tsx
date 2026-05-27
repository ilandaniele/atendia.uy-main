import { useState, useEffect, useRef } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import {
    FaBuilding, FaRobot, FaChevronRight, FaChevronLeft, FaRocket,
    FaWhatsapp, FaGlobe, FaCopy, FaCheck, FaPlus, FaTrash,
    FaSpinner, FaCircleCheck, FaQrcode, FaTriangleExclamation,
} from "react-icons/fa6";
import { cn } from "utils/utils";
import Switch from "../../admin/components/switch";

interface ResumeData {
    clientId: Id<"clients">;
    channelId: Id<"channels">;
    channelType: "web" | "whatsapp";
    webToken?: string;
    whapiToken?: string;
    whapiApiUrl?: string;
    kbId?: Id<"knowledge_bases">;
}

interface OnboardingProps {
    onComplete: () => void;
    resumeData?: ResumeData;
}

const TIMEZONES = [
    { value: "America/Montevideo", label: "Montevideo (UY)" },
    { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (AR)" },
    { value: "America/Sao_Paulo", label: "São Paulo (BR)" },
    { value: "America/Santiago", label: "Santiago (CL)" },
    { value: "America/Bogota", label: "Bogotá (CO)" },
    { value: "America/Lima", label: "Lima (PE)" },
    { value: "America/Mexico_City", label: "Ciudad de México (MX)" },
];

const CDN_URL = "https://cdn.atendia.uy/widget/v1/atendia-widget.min.js";

function buildSnippet(token: string) {
    return `<script>
  (function(w,d,s,o,f,js,fjs){
    w['AtendiaWidgetObject']=o;
    w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','atendia','${CDN_URL}'));
  atendia('init',{token:'${token}'});
</script>`;
}

export default function UserOnboarding({ onComplete, resumeData }: OnboardingProps) {
    // ── Estado de pasos ─────────────────────────────────────────────────
    // Si hay resumeData, empezar directamente en el paso 3
    const [step, setStep] = useState(resumeData ? 3 : 0);
    const TOTAL_STEPS = 4;

    // ── Datos del formulario ────────────────────────────────────────────
    const [clientData, setClientData] = useState({
        name: "",
        businessName: "",
        timezone: "America/Montevideo",
        enableAgenda: false,
        enableOrders: false,
    });
    const [channelType, setChannelType] = useState<"web" | "whatsapp">(resumeData?.channelType ?? "web");
    const [assistantName, setAssistantName] = useState("Asistente Virtual");
    const [assistantDescription, setAssistantDescription] = useState("");

    // ── Resultado del onboarding ────────────────────────────────────────
    const [onboardResult, setOnboardResult] = useState<{
        clientId: Id<"clients">;
        channelId: Id<"channels">;
        kbId: Id<"knowledge_bases">;
        webToken?: string;
    } | null>(
        resumeData
            ? {
                clientId: resumeData.clientId,
                channelId: resumeData.channelId,
                kbId: resumeData.kbId as Id<"knowledge_bases">,
                webToken: resumeData.webToken,
            }
            : null
    );

    // ── WhatsApp ────────────────────────────────────────────────────────
    const [whapiToken, setWhapiToken] = useState<string | null>(resumeData?.whapiToken ?? null);
    const [whapiApiUrl, setWhapiApiUrl] = useState<string | null>(resumeData?.whapiApiUrl ?? null);
    const [qrBase64, setQrBase64] = useState<string | null>(null);
    const [whatsappConnected, setWhatsappConnected] = useState(false);
    const [isSettingUpWhatsApp, setIsSettingUpWhatsApp] = useState(false);

    // ── WhatsApp connection mode ────────────────────────────────────────
    const [connectionMode, setConnectionMode] = useState<"qr" | "pairing">("qr");
    const [pairingPhone, setPairingPhone] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [pairingLoading, setPairingLoading] = useState(false);
    const [pairingError, setPairingError] = useState("");
    const [phoneValid, setPhoneValid] = useState(false);
    const [pairingCodeCopied, setPairingCodeCopied] = useState(false);

    // ── Preguntas frecuentes (step 4) ───────────────────────────────────
    const [faqs, setFaqs] = useState([{ q: "", a: "" }]);
    const [isSavingFaqs, setIsSavingFaqs] = useState(false);

    // ── General ─────────────────────────────────────────────────────────
    const [isCreating, setIsCreating] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // ── Convex ──────────────────────────────────────────────────────────
    const userProfile = useQuery(api.profiles.me);
    const systemConfig = useQuery(api.systemConfig.get);
    const existingBusiness = useQuery(
        api.clients.getByBusinessName,
        clientData.businessName.trim().length > 2
            ? { businessName: clientData.businessName.trim() }
            : "skip"
    );

    const onboard = useMutation(api.clients.onboard);
    const setTrialUsed = useMutation(api.profiles.setTrialUsed);
    const updateChannel = useMutation(api.channels.update);
    const generateEmbedding = useAction(api.ai.generateAndStoreEmbedding);
    const setupWhatsApp = useAction(api.onboarding.setupWhatsAppChannel);
    const getQR = useAction(api.onboarding.getWhatsAppQR);
    const confirmConnected = useAction(api.onboarding.confirmWhatsAppConnected);
    const generatePairingCode = useAction(api.whapiActions.generatePairingCode);

    // ── Suprimir el diálogo "¿Salir del sitio?" del browser ────────────
    // Se usa capture:true para correr antes que cualquier otro listener y
    // se limpia returnValue para evitar que el browser muestre el diálogo.
    useEffect(() => {
        const suppress = (e: BeforeUnloadEvent) => {
            e.stopImmediatePropagation();
            delete (e as any).returnValue;
        };
        window.addEventListener("beforeunload", suppress, { capture: true });
        return () => window.removeEventListener("beforeunload", suppress, { capture: true });
    }, []);

    // ── WhatsApp QR Polling (only in QR mode) ──────────────────────────
    const pollingRef = useRef(false);
    useEffect(() => {
        if (step !== 3 || channelType !== "whatsapp" || !whapiToken || whatsappConnected || connectionMode !== "qr") return;
        pollingRef.current = true;

        async function poll() {
            if (!pollingRef.current || !whapiToken) return;
            try {
                const result = await getQR({
                    whapiToken,
                    whapiApiUrl: whapiApiUrl ?? undefined,
                });
                if (!pollingRef.current) return;
                if (result.authenticated) {
                    setWhatsappConnected(true);
                    if (onboardResult?.channelId) {
                        await confirmConnected({ channelId: onboardResult.channelId });
                    }
                } else if (result.base64) {
                    setQrBase64(result.base64);
                }
            } catch {
                // silently retry
            }
        }

        poll();
        const interval = setInterval(poll, 3000);
        return () => {
            pollingRef.current = false;
            clearInterval(interval);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, channelType, whapiToken, whatsappConnected, connectionMode]);

    // ── WhatsApp Pairing Polling (after pairing code is shown) ─────────
    useEffect(() => {
        if (!pairingCode || !whapiToken || whatsappConnected) return;

        const interval = setInterval(async () => {
            try {
                const result = await getQR({
                    whapiToken,
                    whapiApiUrl: whapiApiUrl ?? undefined,
                });
                if (result.authenticated) {
                    setWhatsappConnected(true);
                    if (onboardResult?.channelId) {
                        await confirmConnected({ channelId: onboardResult.channelId });
                    }
                }
            } catch {
                // silently retry
            }
        }, 4000);

        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pairingCode, whapiToken, whatsappConnected]);

    // ── Helpers ─────────────────────────────────────────────────────────
    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePairingPhoneChange = (value: string) => {
        const clean = value.replace(/[^0-9]/g, "");
        setPairingPhone(clean);
        setPairingError("");
        setPhoneValid(clean.length >= 7 && clean.length <= 15);
    };

    const handleGeneratePairingCode = async () => {
        if (!pairingPhone.trim() || !phoneValid || !onboardResult?.channelId) {
            setPairingError("Ingresá un número válido con código de país. Ej: 59899123456");
            return;
        }
        setPairingError("");
        setPairingCode("");
        setPairingLoading(true);
        try {
            const result = await generatePairingCode({
                phoneNumber: pairingPhone,
                channelId: onboardResult.channelId,
            });
            setPairingCode(result.code);
        } catch (err: any) {
            setPairingError(err?.message || "No se pudo generar el código. Verificá el número e intentá de nuevo.");
        } finally {
            setPairingLoading(false);
        }
    };

    const handleConnectionModeChange = (mode: "qr" | "pairing") => {
        setConnectionMode(mode);
    };

    const handleAddFaq = () => setFaqs([...faqs, { q: "", a: "" }]);
    const handleRemoveFaq = (i: number) => setFaqs(faqs.filter((_, idx) => idx !== i));
    const handleFaqChange = (i: number, field: "q" | "a", val: string) => {
        const updated = [...faqs];
        updated[i][field] = val;
        setFaqs(updated);
    };

    // ── Navegación ──────────────────────────────────────────────────────

    const goToStep1 = () => setStep(1);

    const handleStep1Next = () => {
        setError(null);
        if (!clientData.name.trim() || !clientData.businessName.trim()) {
            setError("Por favor completa el nombre comercial y la razón social.");
            return;
        }
        if (existingBusiness === undefined) {
            setError("Verificando disponibilidad del nombre…");
            return;
        }
        if (existingBusiness !== null) {
            setError("Esa razón social ya está registrada. Usá otro nombre.");
            return;
        }
        setStep(2);
    };

    const handleStep2Next = async () => {
        setError(null);
        if (!assistantName.trim()) {
            setError("Por favor ingresá el nombre de tu asistente.");
            return;
        }
        if (!userProfile) return;

        setIsCreating(true);
        setLoadingMessage("Creando tu espacio de trabajo…");
        try {
            const hasUsedTrial = !!userProfile.trialUsedAt;
            const trialDays = systemConfig?.trialDays ?? 7;
            const trialTokens = systemConfig?.defaultTrialTokens ?? 50000;
            const trialEndsAt = !hasUsedTrial
                ? Date.now() + trialDays * 24 * 60 * 60 * 1000
                : undefined;

            const result = await onboard({
                name: clientData.name.trim(),
                businessName: clientData.businessName.trim(),
                timezone: clientData.timezone,
                isActive: true,
                features: {
                    enableAgenda: clientData.enableAgenda,
                    enableOrders: clientData.enableOrders,
                },
                tokensBalance: !hasUsedTrial ? trialTokens : 0,
                trialEndsAt,
                assistantConfig: {
                    name: assistantName.trim(),
                    description: assistantDescription.trim() || "Asistente inteligente para atención al cliente.",
                    model: "gemini-2.5-flash",
                },
                kbConfig: { name: "Información General" },
                channelType,
            });

            if (!hasUsedTrial) {
                await setTrialUsed({ id: userProfile._id });
            }

            setOnboardResult(result);

            if (channelType === "whatsapp") {
                setLoadingMessage("Configurando canal de WhatsApp…");
                const whapiData = await setupWhatsApp({ channelId: result.channelId });
                setWhapiToken(whapiData.whapiToken);
                setWhapiApiUrl(whapiData.whapiApiUrl ?? null);
            }

            setStep(3);
        } catch (e: any) {
            setError(e.message || "Error al crear el espacio de trabajo. Intentá de nuevo.");
        } finally {
            setIsCreating(false);
            setLoadingMessage("");
        }
    };

    const handleStep3Next = async () => {
        // Para canales web, marcar como conectado al confirmar que se vio el script
        if (channelType === "web" && onboardResult?.channelId) {
            try {
                await updateChannel({ id: onboardResult.channelId, status: "connected" });
            } catch {
                // No bloqueamos el avance si falla el patch
            }
        }
        setStep(4);
    };

    const handleStep4Next = async () => {
        setError(null);
        const validFaqs = faqs.filter(f => f.q.trim() && f.a.trim());
        if (validFaqs.length > 0 && onboardResult?.kbId) {
            setIsSavingFaqs(true);
            try {
                for (const faq of validFaqs) {
                    const content = `Pregunta: ${faq.q.trim()}\nRespuesta: ${faq.a.trim()}`;
                    await generateEmbedding({
                        knowledgeBaseId: onboardResult.kbId,
                        content,
                        metadata: { type: "faq", source: "onboarding" },
                    });
                }
            } catch {
                // No bloqueamos el avance por errores de embedding
            } finally {
                setIsSavingFaqs(false);
            }
        }
        onComplete();
    };

    // ── Render ──────────────────────────────────────────────────────────

    const progress = step > 0 ? (step / TOTAL_STEPS) * 100 : 0;

    // Loading overlay durante la creación
    if (isCreating) {
        return (
            <div className="fixed inset-0 z-200 flex items-center justify-center bg-slate-50 dark:bg-slate-950 animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-6 text-center px-6">
                    <div className="relative w-20 h-20">
                        <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                        <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center text-primary">
                            <FaRocket size={24} className="animate-pulse" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Preparando tu espacio…</h3>
                        <p className="text-sm text-slate-500 animate-pulse font-medium">{loadingMessage}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Pantalla de bienvenida ──────────────────────────────────────────
    if (step === 0) {
        return (
            <div className="w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-10 sm:p-16 text-center space-y-8">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-primary/10 rounded-3xl text-primary animate-bounce mx-auto">
                        <FaRocket size={48} />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-4xl sm:text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                            ¡Bienvenido a Atendia!
                        </h1>
                        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                            Vamos a configurar tu espacio de trabajo inteligente en pocos pasos.
                        </p>
                    </div>
                    <button
                        onClick={goToStep1}
                        className="group flex items-center justify-center gap-3 px-12 py-5 bg-primary text-white rounded-2xl font-bold text-lg hover:bg-primary/90 active:scale-95 transition-all w-full sm:w-auto mx-auto"
                    >
                        Comenzar
                        <FaChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header con progreso (oculto en modo reanudación) */}
            <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 px-4", resumeData && "invisible")}>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl text-primary shrink-0">
                        <FaRocket size={20} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Configuración inicial</h1>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-48">
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <span className="text-xs font-bold text-slate-400 tabular-nums">{step}/{TOTAL_STEPS}</span>
                </div>
            </div>

            {/* Contenido del paso */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col mx-4">
                <div className="p-8 sm:p-10 flex-1">

                    {/* Error global */}
                    {error && (
                        <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* ── Paso 1: Tu Empresa ─────────────────────────── */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <StepHeader
                                icon={<FaBuilding />}
                                color="text-blue-500"
                                title="Tu Empresa"
                                sub="Paso 1 de 4 · Información básica"
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField label="Nombre comercial" hint="Como lo conocen tus clientes">
                                    <input
                                        type="text"
                                        value={clientData.name}
                                        onChange={e => setClientData({ ...clientData, name: e.target.value })}
                                        placeholder="Ej: Mi Tienda Online"
                                        className={INPUT_CLS}
                                    />
                                </FormField>
                                <FormField
                                    label="Nombre legal"
                                    hint="Nombre legal único de tu empresa"
                                    suffix={
                                        clientData.businessName.trim().length > 2
                                            ? existingBusiness === undefined
                                                ? <span className="text-slate-400 text-xs">Verificando…</span>
                                                : existingBusiness !== null
                                                    ? <span className="text-red-500 text-xs">Ya registrado</span>
                                                    : <span className="text-emerald-500 text-xs flex items-center gap-1"><FaCheck size={10} /> Disponible</span>
                                            : null
                                    }
                                >
                                    <input
                                        type="text"
                                        value={clientData.businessName}
                                        onChange={e => setClientData({ ...clientData, businessName: e.target.value })}
                                        placeholder="Ej: Mi Empresa S.A."
                                        className={cn(INPUT_CLS, existingBusiness && "border-red-300 dark:border-red-700")}
                                    />
                                </FormField>
                            </div>

                            <FormField label="Zona horaria">
                                <select
                                    value={clientData.timezone}
                                    onChange={e => setClientData({ ...clientData, timezone: e.target.value })}
                                    className={INPUT_CLS}
                                >
                                    {TIMEZONES.map(tz => (
                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                    ))}
                                </select>
                            </FormField>

                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-4">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Funcionalidades</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <ToggleRow
                                        id="agenda"
                                        label="Agenda de turnos"
                                        desc="Reservas automáticas con tus clientes."
                                        checked={clientData.enableAgenda}
                                        onChange={v => setClientData({ ...clientData, enableAgenda: v })}
                                    />
                                    <ToggleRow
                                        id="orders"
                                        label="Gestión de pedidos"
                                        desc="Toma pedidos y carrito desde el chat."
                                        checked={clientData.enableOrders}
                                        onChange={v => setClientData({ ...clientData, enableOrders: v })}
                                    />
                                </div>
                            </div>

                            <FormField label="¿Por dónde van a contactarte tus clientes?">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                                    <ChannelCard
                                        icon={<FaGlobe size={18} />}
                                        label="Chat para mi web"
                                        desc="Chat en tu sitio web"
                                        selected={channelType === "web"}
                                        color="bg-blue-500"
                                        onClick={() => setChannelType("web")}
                                    />
                                    <ChannelCard
                                        icon={<FaWhatsapp size={18} />}
                                        label="WhatsApp"
                                        desc="Conectá tu número"
                                        selected={channelType === "whatsapp"}
                                        color="bg-green-500"
                                        onClick={() => setChannelType("whatsapp")}
                                    />
                                </div>
                            </FormField>
                        </div>
                    )}

                    {/* ── Paso 2: Tu Asistente ───────────────────────── */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <StepHeader
                                icon={<FaRobot />}
                                color="text-emerald-500"
                                title="Tu Asistente Virtual"
                                sub="Paso 2 de 4 · Nombre y personalidad"
                            />

                            <FormField
                                label="¿Cómo se va a llamar?"
                                hint="Es el nombre que verán tus clientes en el chat"
                            >
                                <input
                                    type="text"
                                    value={assistantName}
                                    onChange={e => setAssistantName(e.target.value)}
                                    placeholder="Ej: Sofía, Max, Atendia…"
                                    className={INPUT_CLS}
                                />
                            </FormField>

                            <FormField
                                label="¿Cómo debe comportarse?"
                                hint="Instrucciones sobre su tono, límites o especialidad (opcional)"
                            >
                                <textarea
                                    rows={5}
                                    value={assistantDescription}
                                    onChange={e => setAssistantDescription(e.target.value)}
                                    placeholder={`Ej: Soy ${assistantName || "Sofía"}, asistente de ${clientData.name || "tu empresa"}. Respondo preguntas sobre productos, horarios y envíos. Si no sé algo, derivo al equipo humano.`}
                                    className={cn(INPUT_CLS, "resize-none")}
                                />
                            </FormField>

                            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                💡 No te preocupes si no tenés todo claro ahora — podés ajustar el asistente en cualquier momento desde el panel.
                            </div>
                        </div>
                    )}

                    {/* ── Paso 3: Conectar Canal ─────────────────────── */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            {resumeData && (
                                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                                    <strong>Tu asistente aún no está activo.</strong> Para que el chatbot comience a funcionar, necesitás completar la configuración del canal.
                                </div>
                            )}
                            <StepHeader
                                icon={channelType === "whatsapp" ? <FaWhatsapp /> : <FaGlobe />}
                                color={channelType === "whatsapp" ? "text-green-500" : "text-blue-500"}
                                title="Conectar Canal"
                                sub={resumeData
                                    ? `Reanudando · ${channelType === "whatsapp" ? "Conectá tu WhatsApp" : "Instalá el chat en tu web"}`
                                    : `Paso 3 de 4 · ${channelType === "whatsapp" ? "Conectá tu WhatsApp" : "Instalá el chat en tu web"}`
                                }
                            />

                            {channelType === "web" && onboardResult?.webToken && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        Pegá el siguiente código antes del <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">&lt;/body&gt;</code> de tu sitio web.
                                    </p>
                                    <div className="relative">
                                        <pre className="p-4 rounded-2xl bg-slate-900 text-green-400 text-xs overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">
                                            {buildSnippet(onboardResult.webToken)}
                                        </pre>
                                        <button
                                            onClick={() => handleCopy(buildSnippet(onboardResult!.webToken!))}
                                            className="absolute top-3 right-3 p-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-all"
                                            aria-label="Copiar código"
                                        >
                                            {copied ? <FaCheck size={14} /> : <FaCopy size={14} />}
                                        </button>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                                        🌐 El chat va a aparecer como un botón flotante en tu sitio. Podés personalizar el color y la posición desde el panel.
                                    </div>
                                </div>
                            )}

                            {channelType === "whatsapp" && (
                                <div className="space-y-6">
                                    {isSettingUpWhatsApp && (
                                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                                            <FaSpinner className="animate-spin text-primary text-3xl" />
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Configurando canal de WhatsApp…</p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                                                Esto puede tardar unos minutos. Podés cerrar esta página y volver más tarde, tu configuración no se perderá.
                                            </p>
                                        </div>
                                    )}

                                    {!isSettingUpWhatsApp && whatsappConnected && (
                                        <div className="flex flex-col items-center gap-4 py-8">
                                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-500 text-4xl">
                                                <FaCircleCheck />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">¡WhatsApp conectado!</p>
                                                <p className="text-sm text-slate-500 mt-1">Tu asistente ya puede recibir mensajes.</p>
                                            </div>
                                        </div>
                                    )}

                                    {!isSettingUpWhatsApp && !whatsappConnected && (
                                        <>
                                            {/* Mode tabs */}
                                            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => handleConnectionModeChange("qr")}
                                                    className={cn(
                                                        "flex-1 py-2.5 text-sm font-medium transition-colors",
                                                        connectionMode === "qr"
                                                            ? "bg-primary text-white"
                                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    )}
                                                >
                                                    Escanear QR
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleConnectionModeChange("pairing")}
                                                    className={cn(
                                                        "flex-1 py-2.5 text-sm font-medium transition-colors",
                                                        connectionMode === "pairing"
                                                            ? "bg-primary text-white"
                                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    )}
                                                >
                                                    Vincular por número
                                                </button>
                                            </div>

                                            {/* QR tab */}
                                            {connectionMode === "qr" && (
                                                <div className="flex flex-col items-center gap-4 text-center">
                                                    {qrBase64 ? (
                                                        <>
                                                            <div className="p-4 bg-white rounded-2xl border border-slate-200 inline-block shadow-sm">
                                                                <img
                                                                    src={qrBase64}
                                                                    alt="Código QR de WhatsApp"
                                                                    className="w-52 h-52 object-contain"
                                                                />
                                                            </div>
                                                            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs">
                                                                Abrí WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo → Escaneá este código.
                                                            </p>
                                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                <FaSpinner className="animate-spin" />
                                                                Esperando conexión…
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FaQrcode className="text-slate-300 dark:text-slate-700 text-6xl" />
                                                            <p className="text-sm text-slate-500">Generando código QR…</p>
                                                            <FaSpinner className="animate-spin text-primary" />
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {/* Pairing tab */}
                                            {connectionMode === "pairing" && (
                                                <div className="space-y-5">
                                                    {!pairingCode ? (
                                                        <>
                                                            <div className="space-y-2">
                                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                                    Tu número de WhatsApp
                                                                </label>
                                                                <div className="relative">
                                                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                                                                        <FaWhatsapp className={cn("w-4 h-4 transition-colors", phoneValid ? "text-green-500" : "text-slate-400")} />
                                                                    </div>
                                                                    <input
                                                                        type="tel"
                                                                        inputMode="numeric"
                                                                        value={pairingPhone}
                                                                        onChange={e => handlePairingPhoneChange(e.target.value)}
                                                                        onKeyDown={e => e.key === "Enter" && phoneValid && !pairingLoading && handleGeneratePairingCode()}
                                                                        placeholder="59899123456"
                                                                        className={cn(
                                                                            "w-full px-4 py-3 pl-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
                                                                            pairingError && "border-red-400 dark:border-red-600 focus:ring-red-400/50"
                                                                        )}
                                                                        disabled={pairingLoading}
                                                                    />
                                                                </div>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                    Con código de país, sin espacios ni +. Ej: <span className="font-mono">598</span> para Uruguay.
                                                                </p>
                                                            </div>
                                                            {pairingError && (
                                                                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                                                    <FaTriangleExclamation className="w-3.5 h-3.5 shrink-0" />
                                                                    {pairingError}
                                                                </p>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={handleGeneratePairingCode}
                                                                disabled={pairingLoading || !phoneValid}
                                                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-2xl font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {pairingLoading ? (
                                                                    <>
                                                                        <FaSpinner className="animate-spin w-4 h-4" />
                                                                        Generando...
                                                                    </>
                                                                ) : "Generar código"}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="flex flex-col items-center gap-3 py-4">
                                                                <p className="text-sm text-slate-500 dark:text-slate-400">Tu código de vinculación</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(pairingCode);
                                                                        setPairingCodeCopied(true);
                                                                        setTimeout(() => setPairingCodeCopied(false), 2000);
                                                                    }}
                                                                    className="group relative bg-slate-100 dark:bg-slate-800 rounded-2xl px-8 py-5 border-2 border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary transition-colors cursor-pointer"
                                                                    title="Tocar para copiar"
                                                                >
                                                                    <span className="font-mono text-4xl font-bold tracking-widest text-slate-900 dark:text-slate-100">
                                                                        {pairingCode}
                                                                    </span>
                                                                    <span className="absolute bottom-1.5 right-3 text-[10px] font-medium text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                                        {pairingCodeCopied ? "¡Copiado!" : "Tocar para copiar"}
                                                                    </span>
                                                                </button>
                                                                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                                                    <FaSpinner className="animate-spin w-3 h-3" />
                                                                    Esperando que ingreses el código en WhatsApp...
                                                                </div>
                                                            </div>
                                                            <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                                                                <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">1.</span> Abrí WhatsApp en tu teléfono</li>
                                                                <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">2.</span> Andá a <strong>Dispositivos vinculados</strong></li>
                                                                <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">3.</span> Tocá <strong>Vincular un dispositivo</strong></li>
                                                                <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">4.</span> Tocá <strong>Vincular con el número de teléfono</strong></li>
                                                                <li className="flex gap-2"><span className="font-semibold text-primary shrink-0">5.</span> Ingresá el código que aparece arriba</li>
                                                            </ol>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setPairingCode(""); setPairingPhone(""); }}
                                                                className="text-sm w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                            >
                                                                Generar otro código
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Paso 4: Preguntas Frecuentes ──────────────── */}
                    {step === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <StepHeader
                                icon={<FaRobot />}
                                color="text-purple-500"
                                title="Enseñale a tu asistente"
                                sub="Paso 4 de 4 · Preguntas frecuentes"
                            />

                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Agregá las preguntas más comunes de tus clientes y sus respuestas. Tu asistente las aprenderá para contestar automáticamente.
                            </p>

                            <div className="space-y-4 overflow-y-auto pr-1" style={{ maxHeight: "clamp(240px, 40dvh, 400px)" }}>
                                {faqs.map((faq, i) => (
                                    <div key={i} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pregunta {i + 1}</span>
                                            {faqs.length > 1 && (
                                                <button
                                                    onClick={() => handleRemoveFaq(i)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                >
                                                    <FaTrash size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            value={faq.q}
                                            onChange={e => handleFaqChange(i, "q", e.target.value)}
                                            placeholder="¿Cuáles son los métodos de pago disponibles?"
                                            className={cn(INPUT_CLS, "py-3.5 text-base")}
                                        />
                                        <textarea
                                            rows={3}
                                            value={faq.a}
                                            onChange={e => handleFaqChange(i, "a", e.target.value)}
                                            placeholder="Aceptamos efectivo, tarjeta de crédito/débito y transferencia bancaria."
                                            className={cn(INPUT_CLS, "resize-none py-3.5 text-base")}
                                        />
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={handleAddFaq}
                                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                                <FaPlus size={12} /> Agregar otra pregunta
                            </button>

                            <p className="text-xs text-slate-400">
                                También podés agregar más contenido desde <strong>Mi Información</strong> en el panel.
                            </p>
                        </div>
                    )}

                </div>

                {/* Footer de navegación */}
                <div className="p-5 sm:p-8 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3 shrink-0">
                    {/* Botón Atrás (oculto en modo reanudación o en paso 3 sin pasos previos) */}
                    <button
                        onClick={() => step > 1 && setStep(step - 1)}
                        className={cn(
                            "group flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all",
                            (step <= 1 || resumeData) ? "invisible" : "text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 active:scale-95"
                        )}
                    >
                        <FaChevronLeft size={12} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="hidden sm:inline">Atrás</span>
                    </button>

                    <div className="flex items-center gap-2">
                        {/* Botón "Saltar" en paso 4 (FAQs es opcional) */}
                        {step === 4 && (
                            <button
                                onClick={onComplete}
                                className="px-4 py-3 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all active:scale-95"
                            >
                                Saltar
                            </button>
                        )}

                        {/* Paso 3 + WA no conectado: sólo indicador, sin botón */}
                        {step === 3 && channelType === "whatsapp" && !whatsappConnected && (
                            <span className="flex items-center gap-2 text-sm text-slate-400 font-medium px-3">
                                <FaSpinner className="animate-spin shrink-0" size={13} />
                                <span className="hidden sm:inline">Esperando conexión…</span>
                            </span>
                        )}

                        {/* Botón principal (oculto mientras espera WA) */}
                        {!(step === 3 && channelType === "whatsapp" && !whatsappConnected) && step < 5 && (
                            <button
                                onClick={
                                    step === 1 ? handleStep1Next :
                                    step === 2 ? handleStep2Next :
                                    step === 3 ? handleStep3Next :
                                    step === 4 ? handleStep4Next :
                                    undefined
                                }
                                disabled={
                                    (step === 1 && (!clientData.name || !clientData.businessName)) ||
                                    (step === 2 && !assistantName.trim()) ||
                                    isSavingFaqs
                                }
                                className={cn(
                                    "group flex items-center gap-2 px-6 sm:px-8 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-primary/90 active:scale-95 transition-all",
                                    "disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                            >
                                {isSavingFaqs ? (
                                    <><FaSpinner className="animate-spin" /><span className="hidden sm:inline">Guardando…</span></>
                                ) : (
                                    <><span className="hidden sm:inline">Siguiente</span> <FaChevronRight size={12} className="group-hover:translate-x-1 transition-transform" /></>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Componentes auxiliares ─────────────────────────────────────────────────

const INPUT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder-slate-400 text-sm";

function StepHeader({ icon, color, title, sub }: { icon: React.ReactNode; color: string; title: string; sub: string }) {
    return (
        <div className="space-y-1 mb-2">
            <div className={cn("flex items-center gap-3", color)}>
                <span className="text-lg">{icon}</span>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{sub}</p>
        </div>
    );
}

function FormField({
    label, hint, suffix, children
}: {
    label: string;
    hint?: string;
    suffix?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</label>
                {suffix}
            </div>
            {hint && <p className="text-xs text-slate-400">{hint}</p>}
            {children}
        </div>
    );
}

function ToggleRow({ id, label, desc, checked, onChange }: { id: string; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-1">
                <label htmlFor={id} className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">{label}</label>
                <Switch id={id} checked={checked} onChange={onChange} />
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">{desc}</p>
        </div>
    );
}

function ChannelCard({ icon, label, desc, selected, color, onClick }: { icon: React.ReactNode; label: string; desc: string; selected: boolean; color: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all w-full",
                selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
            )}
        >
            <div className={cn("p-2.5 rounded-lg text-white shrink-0", color)}>{icon}</div>
            <div>
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{label}</p>
                <p className="text-[11px] text-slate-500">{desc}</p>
            </div>
            {selected && <FaCheck className="ml-auto text-primary shrink-0" size={14} />}
        </button>
    );
}
