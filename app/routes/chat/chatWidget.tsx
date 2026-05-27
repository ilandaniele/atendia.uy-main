import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { useQuery, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import { getContrastColor } from "utils/utils";
import { FaPaperPlane, FaSpinner, FaTimes } from "react-icons/fa";

function renderInline(text: string): ReactNode[] {
    const parts = text.split(/(\*\*[^*\n]+\*\*|https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (/^https?:\/\//.test(part))
            return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all">{part}</a>;
        return <span key={i}>{part}</span>;
    });
}

function renderMarkdown(text: string): ReactNode {
    const lines = text.split("\n");
    const elements: ReactNode[] = [];
    let bullets: string[] = [];

    const flushBullets = () => {
        if (!bullets.length) return;
        elements.push(
            <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-0.5 my-1 pl-1">
                {bullets.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
            </ul>
        );
        bullets = [];
    };

    for (const line of lines) {
        const bulletMatch = line.match(/^\*\s+(.+)/);
        if (bulletMatch) {
            bullets.push(bulletMatch[1]);
        } else {
            flushBullets();
            if (line.trim()) {
                elements.push(<p key={elements.length} className="mb-1 last:mb-0">{renderInline(line)}</p>);
            }
        }
    }
    flushBullets();
    return <>{elements}</>;
}

export default function ChatWidgetUI() {
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();
    const host = searchParams.get("host");

    // Origen del padre: validado para postMessage (evita wildcard '*')
    const parentOrigin = host ? `https://${host}` : null;

    const channel = useQuery(api.channels.getByAccessToken, token ? { accessToken: token } : "skip");
    const assistant = useQuery(api.assistants.get, channel ? { id: channel.assistant } : "skip");
    const client = useQuery(api.clients.get, channel ? { id: channel.client } : "skip");

    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messageInput, setMessageInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [optimisticUserMsg, setOptimisticUserMsg] = useState<string | null>(null);
    const [isWidgetOpen, setIsWidgetOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const prevBotCountRef = useRef<number | null>(null);

    const processWebMessage = useAction(api.ai.processWebMessage);

    // Derivados del tema — con optional chaining para que sean seguros antes de que carguen los datos
    const primaryColor: string = channel?.config?.theme?.primaryColor ?? "#0ea5e9";
    const position: string = channel?.config?.theme?.position ?? "bottom-right";
    const headerTextColor = getContrastColor(primaryColor);
    const timezone: string = client?.timezone ?? "America/Montevideo";

    // Inicializar sesión
    useEffect(() => {
        const storedSession = localStorage.getItem("atendia_session_id");
        if (storedSession) {
            setSessionId(storedSession);
        } else {
            const newSession = crypto.randomUUID();
            localStorage.setItem("atendia_session_id", newSession);
            setSessionId(newSession);
        }
    }, []);

    // Traer historial
    const history = useQuery(api.chats.getWebChatHistory, 
        channel && sessionId 
            ? { channelId: channel._id, sessionId } 
            : "skip"
    );

    // Validación estricta de dominios
    useEffect(() => {
        if (channel === undefined) return; 
        if (channel === null) {
            setIsAuthorized(false);
            return;
        }

        const isProd = import.meta.env.PROD;
        const allowedDomains = (channel.config?.allowedDomains ?? []).filter(d => d.trim().length > 0);

        if (isProd && allowedDomains.length > 0) {
            const isAllowed = !!host && allowedDomains.some((domain: string) => host.includes(domain));
            setIsAuthorized(isAllowed);
        } else {
            setIsAuthorized(true); // Sin dominios configurados → sin restricciones
        }
    }, [channel, host]);

    // Sonido de notificación cuando llega una respuesta del asistente
    const playNotificationSound = () => {
        try {
            const ctx = audioCtxRef.current ?? new AudioContext();
            audioCtxRef.current = ctx;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.35);
        } catch {
            // El navegador bloqueó el audio o no está soportado
        }
    };

    // Limpiar mensaje optimista cuando Convex confirma el insert
    useEffect(() => {
        if (!optimisticUserMsg || !history) return;
        if (history.some(m => m.role === "user" && m.content === optimisticUserMsg)) {
            setOptimisticUserMsg(null);
        }
    }, [history, optimisticUserMsg]);

    useEffect(() => {
        if (!history) return;
        const botCount = history.filter(m => m.role !== "user").length;
        if (prevBotCountRef.current !== null && botCount > prevBotCountRef.current) {
            const newMsgs = botCount - prevBotCountRef.current;
            if (!isWidgetOpen || document.hidden) {
                playNotificationSound();
                setUnreadCount(prev => prev + newMsgs);
            }
        }
        prevBotCountRef.current = botCount;
    }, [history, isWidgetOpen]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [history, isSending, optimisticUserMsg]);

    // Escuchar mensajes del padre con validación de origen
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            // Validar origen: solo aceptar mensajes del dominio padre conocido
            if (parentOrigin && event.origin !== parentOrigin) return;
            if (!event.data || typeof event.data.type !== 'string') return;

            if (event.data.type === 'atendia:opened') {
                setIsWidgetOpen(true);
                setUnreadCount(0);
            } else if (event.data.type === 'atendia:closed') {
                setIsWidgetOpen(false);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [parentOrigin]);

    // Sincronizar unreadCount con el padre (origen específico)
    useEffect(() => {
        const target = parentOrigin ?? '*';
        window.parent.postMessage({ type: 'atendia:unread', count: unreadCount }, target);
    }, [unreadCount, parentOrigin]);

    // Notificar al padre la posición y color configurados desde la BD
    useEffect(() => {
        const target = parentOrigin ?? '*';
        window.parent.postMessage({ type: 'atendia:ready', position, primaryColor }, target);
    }, [position, primaryColor, parentOrigin]);

    const handleClose = () => {
        const target = parentOrigin ?? '*';
        window.parent.postMessage({ type: 'atendia:close' }, target);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = messageInput.trim();
        if (!text || !channel || !sessionId || isSending) return;

        setMessageInput("");
        setOptimisticUserMsg(text); // aparece inmediatamente; se limpia cuando Convex confirma
        setUnreadCount(0);
        setIsSending(true);

        try {
            await processWebMessage({
                channelId: channel._id,
                sessionId,
                messageText: text
            });
        } catch (error) {
            console.error("Error enviando mensaje:", error);
            setOptimisticUserMsg(null); // limpiar si hubo error
        } finally {
            setIsSending(false);
        }
    };

    if (isAuthorized === false) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 text-center p-6 font-sans">
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-red-100 max-w-sm w-full">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaTimes size={20} />
                    </div>
                    <p className="text-slate-800 font-bold mb-2">Acceso Denegado</p>
                    <p className="text-slate-500 text-sm">Este dominio no está autorizado para cargar el widget de atención.</p>
                </div>
            </div>
        );
    }

    if (!channel || !assistant || !client) {
        return (
            <div className="flex h-screen items-center justify-center bg-white">
                <FaSpinner className="animate-spin text-primary text-3xl" />
            </div>
        );
    }

    if (!channel.isActive) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 text-center p-6 font-sans">
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full">
                    <p className="text-slate-800 font-bold mb-2">Canal no disponible</p>
                    <p className="text-slate-500 text-sm">Este canal de atención está temporalmente desactivado.</p>
                </div>
            </div>
        );
    }

    const initialGreeting = `¡Hola! Soy ${assistant.name} de ${client.name}, ¿en qué te puedo ayudar hoy?`;

    return (
        <div className="flex flex-col bg-slate-50 font-sans overflow-hidden absolute inset-0 w-full h-full">
            {/* Header */}
            <header
                className="flex-none flex justify-between items-center px-4 shadow-sm z-10"
                style={{
                    backgroundColor: primaryColor,
                    color: headerTextColor,
                    paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
                    paddingBottom: "0.75rem",
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm shadow-inner text-sm font-bold">
                        {assistant.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-base font-bold m-0 leading-tight">{assistant.name}</h2>
                        <span className="flex items-center gap-1 text-[10px] opacity-80 leading-tight">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            Conectado
                        </span>
                    </div>
                </div>
                <button 
                    onClick={handleClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
                    style={{ color: headerTextColor }}
                    aria-label="Cerrar chat"
                >
                    <FaTimes size={18} />
                </button>
            </header>

            {/* Historial de mensajes */}
            <main className="flex-1 min-h-0 overflow-y-auto p-4 bg-[#E5DDD5] dark:bg-slate-900 custom-scrollbar flex flex-col gap-3">
                {/* Primer mensaje predefinido (siempre visible, sin coste de IA) */}
                <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700 max-w-[85%] text-sm text-slate-800 dark:text-slate-200">
                        {initialGreeting}
                    </div>
                </div>

                {history?.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                        <div key={msg._id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`p-3 rounded-2xl shadow-sm max-w-[85%] text-sm ${
                                    isUser
                                        ? "rounded-tr-sm text-white whitespace-pre-wrap"
                                        : "bg-white dark:bg-slate-800 rounded-tl-sm border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                                }`}
                                style={isUser ? { backgroundColor: primaryColor, color: headerTextColor } : {}}
                            >
                                {isUser ? msg.content : renderMarkdown(msg.content)}
                                <div className={`text-[10px] mt-1 text-right ${isUser ? "opacity-70" : "text-slate-400"}`}>
                                    {new Date(msg._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: timezone })}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Mensaje optimista: aparece al instante, desaparece cuando Convex lo confirma */}
                {optimisticUserMsg && !history?.some(m => m.role === "user" && m.content === optimisticUserMsg) && (
                    <div className="flex justify-end">
                        <div
                            className="p-3 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] text-sm whitespace-pre-wrap text-white opacity-80"
                            style={{ backgroundColor: primaryColor, color: headerTextColor }}
                        >
                            {optimisticUserMsg}
                        </div>
                    </div>
                )}

                {/* Dots sólo cuando la IA está procesando, no mientras se guarda el mensaje del usuario */}
                {isSending && !optimisticUserMsg && (
                    <div className="flex justify-start">
                        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} className="h-1" />
            </main>

            {/* Área de input */}
            <footer
                className="flex-none p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-10 flex flex-col gap-1.5"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
            >
                <form className="flex gap-2" onSubmit={handleSendMessage}>
                    <input 
                        type="text" 
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        disabled={isSending}
                        placeholder="Escribe un mensaje..." 
                        className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-transparent rounded-xl outline-none focus:ring-2 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 disabled:opacity-50"
                    />
                    <button 
                        type="submit" 
                        disabled={!messageInput.trim() || isSending}
                        className="flex items-center justify-center w-11 h-11 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95"
                        style={{ backgroundColor: primaryColor, color: headerTextColor }}
                        aria-label="Enviar mensaje"
                    >
                        {isSending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane size={16} className="-ml-0.5" />}
                    </button>
                </form>

                <div className="text-center mt-1 pb-1">
                    <a 
                        href="https://atendia.uy?utm_source=widget&utm_medium=watermark" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] text-slate-400 dark:text-slate-500 no-underline hover:text-slate-600 dark:hover:text-slate-300 transition-colors inline-flex items-center justify-center gap-1 font-medium"
                    >
                        <span>⚡ Powered by</span>
                        <span className="font-bold tracking-wide text-slate-500 dark:text-slate-400">Atendia</span>
                    </a>
                </div>
            </footer>
        </div>
    );
}