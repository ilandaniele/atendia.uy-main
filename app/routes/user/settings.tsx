import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
    FaSpinner, FaCartShopping, FaCalendarDay, FaPowerOff,
    FaUsers, FaLink, FaCopy, FaTrash, FaCheck, FaUserMinus,
    FaShieldHalved, FaUser, FaXmark, FaPlus,
    FaBolt, FaPen, FaEye, FaEyeSlash, FaCircleCheck, FaTruck, FaBell,
    FaAddressBook, FaCoins, FaMagnifyingGlass, FaChevronDown,
    FaImage,
    FaPhone,
    FaMicrophone,
    FaClock,
} from "react-icons/fa6";
import { usePushNotifications } from "~/hooks/usePushNotifications";
import { toast } from "react-toastify";
import { cn } from "utils/utils";
import { CURRENCIES, DEFAULT_CURRENCY, getCurrency } from "utils/currencies";

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Configuración - Atendia" }];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Tipos y constantes para Webhooks ─────────────────────────────────────────

type WebhookConfig = {
    id: string;
    name: string;
    url: string;
    secret?: string;
    events: string[];
    enabled: boolean;
};

const WEBHOOK_EVENTS = [
    { value: "lead.created",        label: "Cliente potencial captado",     group: "Clientes Potenciales" },
    { value: "lead.updated",        label: "Cliente potencial actualizado", group: "Clientes Potenciales" },
    { value: "lead.deleted",        label: "Cliente potencial eliminado",   group: "Clientes Potenciales" },
    { value: "order.created",       label: "Pedido creado",                 group: "Pedidos"              },
    { value: "order.updated",       label: "Pedido actualizado",            group: "Pedidos"              },
    { value: "appointment.created", label: "Cita creada",                   group: "Citas"                },
    { value: "appointment.updated", label: "Cita actualizada",              group: "Citas"                },
];

// ─── Nav sections ─────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
    { id: "opciones",       label: "Opciones",        Icon: FaShieldHalved },
    { id: "estado",         label: "Estado",          Icon: FaPowerOff     },
    { id: "miembros",       label: "Equipo",          Icon: FaUsers        },
    { id: "notificaciones", label: "Notificaciones",  Icon: FaBell         },
    { id: "webhooks",       label: "Webhooks",        Icon: FaBolt         },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export default function UserSettings() {
    const navigate = useNavigate();

    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const clientMembership = userClients?.[0];
    const clientId = clientMembership?.client;
    const isOwner = clientMembership?.role === "owner";

    const client = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");
    const membersWithProfiles = useQuery(
        api.clientMembers.getMembersWithProfiles,
        clientId ? { clientId } : "skip"
    );
    const pendingInvites = useQuery(
        api.invites.listByClient,
        clientId && isOwner ? { clientId } : "skip"
    );

    const updateClient = useMutation(api.clients.update);
    const removeMember = useMutation(api.clientMembers.remove);
    const createInvite = useMutation(api.invites.create);
    const removeInvite = useMutation(api.invites.remove);

    const isLoading = !userProfile || userClients === undefined || client === undefined;

    // Webhooks — se sincroniza desde la query reactiva de Convex
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    useEffect(() => {
        if (client) setWebhooks((client as any).webhooks ?? []);
    }, [client]);

    // Horarios de atención — estado local sincronizado desde config
    const DEFAULT_BUSINESS_HOURS = [
        { day: 0, isOpen: true,  openTime: "09:00", closeTime: "18:00" },
        { day: 1, isOpen: true,  openTime: "09:00", closeTime: "18:00" },
        { day: 2, isOpen: true,  openTime: "09:00", closeTime: "18:00" },
        { day: 3, isOpen: true,  openTime: "09:00", closeTime: "18:00" },
        { day: 4, isOpen: true,  openTime: "09:00", closeTime: "18:00" },
        { day: 5, isOpen: false, openTime: "09:00", closeTime: "13:00" },
        { day: 6, isOpen: false, openTime: "09:00", closeTime: "13:00" },
    ];
    const [businessHours, setBusinessHours] = useState(DEFAULT_BUSINESS_HOURS);
    useEffect(() => {
        if (client) {
            const bh = (client.config as any)?.businessHours;
            if (bh?.length) setBusinessHours(bh);
        }
    }, [client]);
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
    const [savingWebhooks, setSavingWebhooks] = useState(false);
    const [docsModalOpen, setDocsModalOpen] = useState(false);

    // Invite modal
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteEmails, setInviteEmails] = useState([""]);
    const [emailErrors, setEmailErrors] = useState<string[]>([""]);
    const [isSendingInvites, setIsSendingInvites] = useState(false);

    // Redirect non-owners
    useEffect(() => {
        if (userClients !== undefined && !isOwner) {
            navigate("/panel", { replace: true });
        }
    }, [userClients, isOwner, navigate]);

    // Section navigation
    const [activeSection, setActiveSection] = useState<string>("opciones");
    useEffect(() => {
        if (isLoading) return;
        const handleScroll = () => {
            // Normal: última sección cuyo top cruzó el umbral
            for (const { id } of [...NAV_SECTIONS].reverse()) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top <= 140) {
                    setActiveSection(id);
                    return;
                }
            }
            // Ninguna cruzó el umbral: al principio → primera sección;
            // al fondo → última sección visible en el viewport
            if (window.scrollY < 50) {
                setActiveSection(NAV_SECTIONS[0].id);
                return;
            }
            for (const { id } of [...NAV_SECTIONS].reverse()) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top < window.innerHeight) {
                    setActiveSection(id);
                    return;
                }
            }
            setActiveSection(NAV_SECTIONS[0].id);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, [isLoading]);

    const scrollToSection = (id: string) => {
        setActiveSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const { permission: pushPermission, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: subscribePush } = usePushNotifications(
        userProfile?._id ? String(userProfile._id) : undefined
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <FaSpinner className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    if (!client || !isOwner) return null;

    const siteUrl = import.meta.env.VITE_SITE_URL ?? "";
    const activePendingInvites = (pendingInvites ?? []).filter(
        (inv) => !inv.usedAt && inv.expiresAt > Date.now()
    );

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleUpdateConfig = async (updates: Record<string, unknown>) => {
        try {
            await updateClient({
                id: client._id,
                updatedBy: userProfile!._id,
                config: {
                    googleCalendarId: (client.config as any)?.googleCalendarId,
                    googleRefreshToken: (client.config as any)?.googleRefreshToken,
                    appointmentReminderHours: (client.config as any)?.appointmentReminderHours,
                    outOfHoursOrderPolicy: (client.config as any)?.outOfHoursOrderPolicy,
                    businessHours: (client.config as any)?.businessHours,
                    ...updates,
                } as any,
            });
            toast.success("Configuración actualizada.");
        } catch {
            toast.error("Error al actualizar la configuración.");
        }
    };

    const handleUpdateFeatures = async (updates: Partial<typeof client.features>) => {
        try {
            await updateClient({
                id: client._id,
                updatedBy: userProfile!._id,
                features: {
                    enableOrders: client.features?.enableOrders ?? false,
                    enableAgenda: client.features?.enableAgenda ?? false,
                    allowCancelAppointments: client.features?.allowCancelAppointments,
                    allowModifyAppointments: client.features?.allowModifyAppointments,
                    allowCancelOrders: client.features?.allowCancelOrders,
                    minHoursBeforeEdit: client.features?.minHoursBeforeEdit,
                    notifyOrderConfirmed: client.features?.notifyOrderConfirmed,
                    notifyOrderShipped: client.features?.notifyOrderShipped,
                    autoSaveContacts: (client.features as any)?.autoSaveContacts,
                    blockMultimedia: (client.features as any)?.blockMultimedia,
                    blockCalls: (client.features as any)?.blockCalls,
                    transcribeAudio: (client.features as any)?.transcribeAudio,
                    ...updates,
                } as any,
            });
            toast.success("Configuración actualizada.");
        } catch {
            toast.error("Error al actualizar la configuración.");
        }
    };

    const handleToggleFeature = async (feature: "enableOrders" | "enableAgenda", value: boolean) =>
        handleUpdateFeatures({ [feature]: value });

    const handleToggleActive = async (value: boolean) => {
        try {
            await updateClient({ id: client._id, updatedBy: userProfile!._id, isActive: value });
            toast.success(value ? "Cliente activado." : "Cliente desactivado.");
        } catch {
            toast.error("Error al actualizar el estado.");
        }
    };

    const handleRemoveMember = async (memberId: Id<"client_members">, memberName: string) => {
        if (!globalThis.confirm(`¿Eliminar a "${memberName}" del equipo? Ya no podrá entrar al panel.`)) return;
        try {
            await removeMember({ id: memberId });
            toast.success("Miembro eliminado.");
        } catch {
            toast.error("Error al eliminar el miembro.");
        }
    };

    const validateEmails = (emails: string[]): string[] =>
        emails.map((e) => {
            const trimmed = e.trim();
            if (!trimmed) return "";
            if (!EMAIL_RE.test(trimmed)) return "Correo inválido";
            return "";
        });

    const handleSendInvites = async () => {
        const errors = validateEmails(inviteEmails);
        setEmailErrors(errors);
        const hasErrors = errors.some((e) => e !== "");
        const validEmails = inviteEmails.map(e => e.trim()).filter(e => e.length > 0);
        if (hasErrors || validEmails.length === 0) return;
        setIsSendingInvites(true);
        try {
            for (const email of validEmails) {
                try {
                    await createInvite({ clientId: client._id, inviteeEmail: email });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes("ALREADY_MEMBER")) {
                        toast.error(`${email} ya es miembro de este equipo.`);
                    } else if (msg.includes("ALREADY_INVITED")) {
                        toast.error(`${email} ya tiene una invitación pendiente.`);
                    } else {
                        toast.error(`Error al invitar a ${email}.`);
                    }
                    return;
                }
            }
            toast.success(`Invitación${validEmails.length > 1 ? "es" : ""} enviada${validEmails.length > 1 ? "s" : ""} correctamente.`);
            setIsInviteModalOpen(false);
            setInviteEmails([""]);
            setEmailErrors([""]);
        } finally {
            setIsSendingInvites(false);
        }
    };

    // ── Webhook handlers ──────────────────────────────────────────────────────

    const saveWebhooks = async (updated: WebhookConfig[]) => {
        setSavingWebhooks(true);
        try {
            await updateClient({
                id: client._id,
                updatedBy: userProfile!._id,
                webhooks: updated,
            });
            setWebhooks(updated);
        } catch {
            toast.error("Error al guardar los webhooks.");
        } finally {
            setSavingWebhooks(false);
        }
    };

    const handleSaveWebhook = async (wh: WebhookConfig) => {
        const existing = webhooks.find((w) => w.id === wh.id);
        const updated = existing
            ? webhooks.map((w) => (w.id === wh.id ? wh : w))
            : [...webhooks, { ...wh, id: crypto.randomUUID() }];
        await saveWebhooks(updated);
        setWebhookModalOpen(false);
        setEditingWebhook(null);
        toast.success(existing ? "Webhook actualizado." : "Webhook agregado.");
    };

    const handleDeleteWebhook = async (id: string) => {
        if (!globalThis.confirm("¿Eliminar este webhook?")) return;
        await saveWebhooks(webhooks.filter((w) => w.id !== id));
        toast.success("Webhook eliminado.");
    };

    const handleToggleWebhook = async (id: string) => {
        await saveWebhooks(webhooks.map((w) => w.id === id ? { ...w, enabled: !w.enabled } : w));
    };

    const handleCopyLink = async (token: string) => {
        const link = `${siteUrl}/ingreso?invite=${token}`;
        await navigator.clipboard.writeText(link);
        toast.success("Enlace copiado.");
    };

    const handleRevokeInvite = async (id: Id<"invites">) => {
        try {
            await removeInvite({ id });
            toast.success("Invitación revocada.");
        } catch {
            toast.error("Error al revocar la invitación.");
        }
    };

    return (
        <>
        <div className="animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Configuración</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    Ajustes generales de <strong>{client.name}</strong>.
                </p>
            </div>

            {/* Mobile nav — horizontal pills */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
                {NAV_SECTIONS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => scrollToSection(id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-all",
                            activeSection === id
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-primary/40"
                        )}
                    >
                        <Icon className="w-3 h-3" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Two-column layout */}
            <div className="flex gap-8 items-start">
                {/* Sidebar nav — desktop */}
                <aside className="hidden lg:flex flex-col gap-0.5 w-44 shrink-0 sticky top-24">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-3 mb-1">Secciones</p>
                    {NAV_SECTIONS.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => scrollToSection(id)}
                            className={cn(
                                "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-left transition-all w-full",
                                activeSection === id
                                    ? "bg-primary/10 text-primary dark:bg-primary/15"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            )}
                        >
                            <Icon className={cn("w-4 h-4 shrink-0 transition-colors", activeSection === id ? "text-primary" : "text-slate-400 dark:text-slate-500")} />
                            {label}
                        </button>
                    ))}
                </aside>

                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-6">

            {/* ── Funcionalidades ───────────────────────────────────────────── */}
            <Section
                id="opciones"
                icon={<FaShieldHalved className="w-4 h-4" />}
                title="Opciones"
                description="Activá o desactivá las funciones de tu cuenta."
            >
                <TimezoneRow
                    value={client.timezone ?? "America/Montevideo"}
                    onChange={async (tz) => {
                        try {
                            await updateClient({
                                id: client._id,
                                updatedBy: userProfile!._id,
                                timezone: tz,
                            });
                            toast.success("Zona horaria actualizada.");
                        } catch {
                            toast.error("Error al actualizar la zona horaria.");
                        }
                    }}
                />
                <ToggleRow
                    icon={<FaCartShopping className="w-4 h-4 text-amber-500" />}
                    label="Pedidos"
                    description="Tu asistente puede recibir pedidos de clientes."
                    checked={client.features?.enableOrders ?? false}
                    onChange={(v) => handleToggleFeature("enableOrders", v)}
                />
                {(client.features?.enableOrders) && (<>
                    <CurrencyRow
                        value={(client.config as any)?.currency ?? DEFAULT_CURRENCY}
                        onChange={(v) => handleUpdateConfig({ currency: v })}
                    />
                    <ToggleRow
                        icon={<FaXmark className="w-4 h-4 text-red-400" />}
                        label="Cancelación de pedidos"
                        description="Los clientes pueden cancelar sus pedidos activos a través del asistente."
                        checked={client.features?.allowCancelOrders ?? false}
                        onChange={(v) => handleUpdateFeatures({ allowCancelOrders: v })}
                    />
                    <ToggleRow
                        icon={<FaCircleCheck className="w-4 h-4 text-blue-400" />}
                        label="Notificar pedido confirmado"
                        description='Al confirmar un pedido, el cliente recibe un mensaje automático: "Tu pedido fue confirmado".'
                        checked={client.features?.notifyOrderConfirmed ?? false}
                        onChange={(v) => handleUpdateFeatures({ notifyOrderConfirmed: v })}
                    />
                    <ToggleRow
                        icon={<FaTruck className="w-4 h-4 text-violet-400" />}
                        label="Notificar pedido en camino"
                        description='Al marcar un pedido en camino, el cliente recibe un mensaje automático: "Tu pedido está en camino".'
                        checked={client.features?.notifyOrderShipped ?? false}
                        onChange={(v) => handleUpdateFeatures({ notifyOrderShipped: v })}
                    />
                </>)}
                <ToggleRow
                    icon={<FaCalendarDay className="w-4 h-4 text-purple-500" />}
                    label="Agenda"
                    description="Tu asistente puede agendar citas y turnos."
                    checked={client.features?.enableAgenda ?? false}
                    onChange={(v) => handleToggleFeature("enableAgenda", v)}
                />
                {(client.features?.enableAgenda) && (<>
                    <ToggleRow
                        icon={<FaXmark className="w-4 h-4 text-red-400" />}
                        label="Cancelación de turnos"
                        description="Los clientes pueden cancelar sus turnos a través del asistente."
                        checked={client.features?.allowCancelAppointments ?? false}
                        onChange={(v) => handleUpdateFeatures({ allowCancelAppointments: v })}
                    />
                    <ToggleRow
                        icon={<FaCalendarDay className="w-4 h-4 text-blue-400" />}
                        label="Modificación de turnos"
                        description="Los clientes pueden cambiar la fecha u hora de sus turnos a través del asistente."
                        checked={client.features?.allowModifyAppointments ?? false}
                        onChange={(v) => handleUpdateFeatures({ allowModifyAppointments: v })}
                    />
                </>)}
                <ToggleRow
                    icon={<FaAddressBook className="w-4 h-4 text-teal-500" />}
                    label="Guardar contactos automáticamente"
                    description="Cuando el asistente capta un lead, pedido o turno de un cliente de WhatsApp, lo agrega automáticamente a la lista de contactos del asistente (requiere tener 'Reconocer clientes recurrentes' activado en al menos un asistente)."
                    checked={(client.features as any)?.autoSaveContacts ?? false}
                    onChange={(v) => handleUpdateFeatures({ autoSaveContacts: v } as any)}
                />
                <ToggleRow
                    icon={<FaMicrophone className="w-4 h-4 text-blue-500" />}
                    label="Aceptar mensajes de audio"
                    description="Convierte las notas de voz de WhatsApp en texto y las procesa como cualquier mensaje. Consume tokens del cliente. Si está activo, 'Bloquear multimedia' solo aplica a imágenes y stickers."
                    checked={(client.features as any)?.transcribeAudio ?? false}
                    onChange={(v) => handleUpdateFeatures({ transcribeAudio: v } as any)}
                />
                <ToggleRow
                    icon={<FaImage className="w-4 h-4 text-green-500" />}
                    label={client.features?.transcribeAudio ? "Bloquear multimedia (excepto audios)" : "Bloquear multimedia"}
                    description={client.features?.transcribeAudio
                        ? "Evitar que el asistente reciba imágenes, stickers y otros archivos multimedia, pero permití las notas de voz."
                        : "Evitar que el asistente reciba cualquier archivo multimedia. Solo se procesarán mensajes de texto."}
                    checked={(client.features as any)?.blockMultimedia ?? false}
                    onChange={(v) => handleUpdateFeatures({ blockMultimedia: v } as any)}
                />
                <ToggleRow
                    icon={<FaPhone className="w-4 h-4 text-yellow-500" />}
                    label="Bloquear llamadas entrantes"
                    description="Evitar que el asistente reciba llamadas de voz."
                    checked={(client.features as any)?.blockCalls ?? false}
                    onChange={(v) => handleUpdateFeatures({ blockCalls: v } as any)}
                />
                {(client.features?.allowCancelOrders || client.features?.allowCancelAppointments || client.features?.allowModifyAppointments) && (
                    <MinHoursRow
                        value={client.features?.minHoursBeforeEdit ?? 0}
                        onChange={(v) => handleUpdateFeatures({ minHoursBeforeEdit: v })}
                    />
                )}
                {client.features?.enableAgenda && (
                    <ReminderHoursRow
                        value={(client.config as any)?.appointmentReminderHours ?? 24}
                        onChange={(v) => handleUpdateConfig({ appointmentReminderHours: v })}
                    />
                )}
                {client.features?.enableOrders && (
                    <OutOfHoursPolicyRow
                        value={(client.config as any)?.outOfHoursOrderPolicy ?? "reject"}
                        onChange={(v) => handleUpdateConfig({ outOfHoursOrderPolicy: v })}
                    />
                )}
                <BusinessHoursSection
                    hours={businessHours}
                    onChange={async (updated) => {
                        setBusinessHours(updated);
                        await handleUpdateConfig({ businessHours: updated });
                    }}
                />
            </Section>

            {/* ── Estado del cliente ────────────────────────────────────────── */}
            <Section
                id="estado"
                icon={<FaPowerOff className="w-4 h-4" />}
                title="Estado de tu cuenta"
                description="Si lo desactivás, tu asistente deja de responder."
            >
                <ToggleRow
                    icon={<FaPowerOff className={cn("w-4 h-4", client.isActive ? "text-emerald-500" : "text-slate-400")} />}
                    label="Cuenta activa"
                    description={client.lockedInactive
                        ? "Tu cuenta fue desactivada por el sistema. Contactá al soporte para reactivarla."
                        : client.isActive
                            ? "Tu asistente está activo y respondiendo."
                            : "Tu asistente está pausado y no responde."}
                    checked={client.isActive}
                    onChange={handleToggleActive}
                    danger={!client.isActive}
                    disabled={!!client.lockedInactive}
                />
            </Section>

            {/* ── Miembros ──────────────────────────────────────────────────── */}
            <Section
                id="miembros"
                icon={<FaUsers className="w-4 h-4" />}
                title="Miembros del equipo"
                description="Personas que pueden usar este panel."
            >
                {/* Member list */}
                <div className="flex flex-col gap-2">
                    {(membersWithProfiles ?? []).map((member) => {
                        const isSelf = member.profile?._id === userProfile?._id;
                        return (
                            <div
                                key={member._id}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                            >
                                {/* Avatar */}
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                                    {member.profile?.name ? (
                                        <img
                                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.profile.name}&backgroundColor=0ea5e9`}
                                            alt={member.profile.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <FaUser className="w-4 h-4 text-primary" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                        {member.profile?.name ?? "Usuario desconocido"}
                                        {isSelf && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(tú)</span>}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {member.profile?.email}
                                    </p>
                                </div>

                                {/* Role badge */}
                                <span className={cn(
                                    "hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                    member.role === "owner"
                                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                )}>
                                    {member.role === "owner" ? "Propietario" : "Miembro"}
                                </span>

                                {/* Remove button (not self, not other owner) */}
                                {!isSelf && member.role !== "owner" && (
                                    <button
                                        onClick={() => handleRemoveMember(member._id, member.profile?.name ?? "este miembro")}
                                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        title="Eliminar miembro"
                                    >
                                        <FaUserMinus className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Pending invites */}
                {activePendingInvites.length > 0 && (
                    <div className="mt-4">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                            Invitaciones pendientes
                        </p>
                        <div className="flex flex-col gap-2">
                            {activePendingInvites.map((inv) => {
                                const expiresIn = Math.ceil((inv.expiresAt - Date.now()) / 3600000);
                                return (
                                    <div
                                        key={inv._id}
                                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                    >
                                        <FaLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <p className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate">
                                            {inv.inviteeEmail ?? "—"}
                                        </p>
                                        <span className="text-xs text-slate-400 shrink-0">
                                            vence en {expiresIn}h
                                        </span>
                                        <button
                                            onClick={() => handleCopyLink(inv.token)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors"
                                            title="Copiar enlace de invitación"
                                        >
                                            <FaCopy className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleRevokeInvite(inv._id)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="Revocar invitación"
                                        >
                                            <FaTrash className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Generate invite button */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={() => { setInviteEmails([""]); setEmailErrors([""]); setIsInviteModalOpen(true); }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <FaLink className="w-3.5 h-3.5" />
                        Invitar a un miembro
                    </button>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        Le enviaremos un correo con un enlace para entrar al panel.
                    </p>
                </div>
            </Section>
            {/* ── Notificaciones ────────────────────────────────────────────── */}
            <Section
                id="notificaciones"
                icon={<FaBell className="w-4 h-4" />}
                title="Notificaciones del panel"
                description="Recibí alertas en este dispositivo cuando lleguen mensajes, pedidos o leads."
            >
                <PushNotificationRow
                    permission={pushPermission}
                    isSubscribed={pushSubscribed}
                    isLoading={pushLoading}
                    onSubscribe={subscribePush}
                />
            </Section>

            {/* ── Webhooks ──────────────────────────────────────────────────── */}
            <Section
                id="webhooks"
                icon={<FaBolt className="w-4 h-4" />}
                title="Webhooks"
                description="Notificaciones HTTP automáticas a sistemas externos (CRMs, ERPs, Make, n8n…)."
            >
                {webhooks.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Sin webhooks configurados. Agregá uno para integrar con tu CRM u otras herramientas.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {webhooks.map((wh) => (
                            <div
                                key={wh.id}
                                className="flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                            {wh.name}
                                        </span>
                                        <span className={cn(
                                            "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                                            wh.enabled
                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                                        )}>
                                            {wh.enabled ? <FaCheck className="w-2 h-2" /> : <FaXmark className="w-2 h-2" />}
                                            {wh.enabled ? "Activo" : "Inactivo"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                        {wh.url}
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {wh.events.map((ev) => (
                                            <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                {ev}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleWebhook(wh.id)}
                                        disabled={savingWebhooks}
                                        title={wh.enabled ? "Desactivar" : "Activar"}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                    >
                                        {wh.enabled ? <FaEye className="w-3.5 h-3.5" /> : <FaEyeSlash className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setEditingWebhook(wh); setWebhookModalOpen(true); }}
                                        title="Editar"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                    >
                                        <FaPen className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteWebhook(wh.id)}
                                        disabled={savingWebhooks}
                                        title="Eliminar"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                        <FaTrash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                    <button
                        type="button"
                        onClick={() => { setEditingWebhook(null); setWebhookModalOpen(true); }}
                        className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <FaPlus className="w-3.5 h-3.5" />
                        Agregar webhook
                    </button>
                    <button
                        type="button"
                        onClick={() => setDocsModalOpen(true)}
                        className="self-start inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                        ¿Cómo funciona? Ver guía
                    </button>
                </div>
            </Section>
                </div>{/* end flex-1 content */}
            </div>{/* end flex gap-8 */}
        </div>{/* end outer */}

        {/* Docs Modal */}
        {docsModalOpen && (
            <WebhookDocsModal onClose={() => setDocsModalOpen(false)} />
        )}

        {/* Webhook Modal */}
        {webhookModalOpen && (
            <WebhookModal
                webhook={editingWebhook}
                saving={savingWebhooks}
                onSave={handleSaveWebhook}
                onClose={() => { setWebhookModalOpen(false); setEditingWebhook(null); }}
            />
        )}

        {/* Invite Modal */}
        {isInviteModalOpen && (
            <div className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
                <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-w-md sm:rounded-2xl sm:max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in sm:zoom-in-95 duration-200">
                    <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Invitar a alguien</h2>
                        <button onClick={() => { setIsInviteModalOpen(false); setEmailErrors([""]); }} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <FaXmark size={14} />
                        </button>
                    </div>
                    <div className="p-5 sm:p-6 space-y-3 overflow-y-auto flex-1">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Escribí el correo de la persona que querés invitar. Le enviaremos un enlace para ingresar.
                        </p>
                        {inviteEmails.map((email, i) => (
                            <div key={i} className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => {
                                            const updated = [...inviteEmails];
                                            updated[i] = e.target.value;
                                            setInviteEmails(updated);
                                            if (emailErrors[i]) {
                                                const errs = [...emailErrors];
                                                errs[i] = "";
                                                setEmailErrors(errs);
                                            }
                                        }}
                                        onBlur={e => {
                                            const trimmed = e.target.value.trim();
                                            if (!trimmed) return;
                                            const errs = [...emailErrors];
                                            errs[i] = EMAIL_RE.test(trimmed) ? "" : "Correo inválido";
                                            setEmailErrors(errs);
                                        }}
                                        placeholder="correo@empresa.com"
                                        className={cn(
                                            "flex-1 px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 outline-none transition-all placeholder-slate-400 text-sm",
                                            emailErrors[i]
                                                ? "border-red-400 focus:ring-red-200 focus:border-red-400"
                                                : "border-slate-200 dark:border-slate-700 focus:ring-primary/20 focus:border-primary"
                                        )}
                                    />
                                    {inviteEmails.length > 1 && (
                                        <button
                                            onClick={() => {
                                                setInviteEmails(inviteEmails.filter((_, idx) => idx !== i));
                                                setEmailErrors(emailErrors.filter((_, idx) => idx !== i));
                                            }}
                                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                                        >
                                            <FaTrash size={12} />
                                        </button>
                                    )}
                                </div>
                                {emailErrors[i] && (
                                    <p className="text-xs text-red-500 pl-1">{emailErrors[i]}</p>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={() => { setInviteEmails([...inviteEmails, ""]); setEmailErrors([...emailErrors, ""]); }}
                            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                            <FaPlus size={12} /> Agregar otro correo
                        </button>
                    </div>
                    <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end shrink-0">
                        <button
                            onClick={() => { setIsInviteModalOpen(false); setEmailErrors([""]); }}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSendInvites}
                            disabled={isSendingInvites || inviteEmails.every(e => !e.trim())}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSendingInvites ? <><FaSpinner className="animate-spin" /> Enviando…</> : <><FaLink size={13} /> Enviar invitación</>}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, icon, title, description, children }: {
    id?: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div id={id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden scroll-mt-6">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400">{icon}</span>
                <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                </div>
            </div>
            <div className="px-6 py-5 space-y-4">
                {children}
            </div>
        </div>
    );
}

// ─── Min Hours Row ────────────────────────────────────────────────────────────

function MinHoursRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [local, setLocal] = useState(String(value));
    const [saving, setSaving] = useState(false);

    useEffect(() => { setLocal(String(value)); }, [value]);

    const handleBlur = async () => {
        const n = parseInt(local, 10);
        const clamped = isNaN(n) || n < 0 ? 0 : n;
        setLocal(String(clamped));
        if (clamped === value) return;
        setSaving(true);
        try { await onChange(clamped); } finally { setSaving(false); }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0"><FaCalendarDay className="w-4 h-4 text-slate-400" /></span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Anticipación mínima para cambios</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Horas mínimas de antelación para cancelar o modificar. Poner 0 para no limitar.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <input
                    type="number"
                    min={0}
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    onBlur={handleBlur}
                    className="w-20 px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-right"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 w-8">{saving ? <FaSpinner className="animate-spin" /> : "hs"}</span>
            </div>
        </div>
    );
}

// ─── Reminder Hours Row ───────────────────────────────────────────────────────

function ReminderHoursRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [local, setLocal] = useState(String(value));
    const [saving, setSaving] = useState(false);

    useEffect(() => { setLocal(String(value)); }, [value]);

    const handleBlur = async () => {
        const n = parseInt(local, 10);
        const clamped = isNaN(n) || n < 1 ? 1 : n;
        setLocal(String(clamped));
        if (clamped === value) return;
        setSaving(true);
        try { await onChange(clamped); } finally { setSaving(false); }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0"><FaBell className="w-4 h-4 text-slate-400" /></span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Anticipación de recordatorio de turno</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Horas antes del turno en que el asistente enviará un recordatorio automático al cliente.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <input
                    type="number"
                    min={1}
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    onBlur={handleBlur}
                    className="w-20 px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-right"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 w-8">{saving ? <FaSpinner className="animate-spin" /> : "hs"}</span>
            </div>
        </div>
    );
}

// ─── Out Of Hours Policy Row ──────────────────────────────────────────────────

function OutOfHoursPolicyRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [saving, setSaving] = useState(false);

    const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSaving(true);
        try { await onChange(e.target.value); } finally { setSaving(false); }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0"><FaCartShopping className="w-4 h-4 text-slate-400" /></span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Pedidos fuera de horario</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Qué hace el asistente cuando recibe un pedido fuera del horario de atención.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {saving && <FaSpinner className="animate-spin text-slate-400 w-4 h-4" />}
                <select
                    value={value}
                    onChange={handleChange}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                    <option value="reject">No tomar e informar horario de apertura</option>
                    <option value="accept_next_day">Tomar para el día siguiente</option>
                </select>
            </div>
        </div>
    );
}

// ─── Timezone Row ─────────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
    { value: "America/Montevideo",              label: "Montevideo (UY)" },
    { value: "America/Argentina/Buenos_Aires",  label: "Buenos Aires (AR)" },
    { value: "America/Sao_Paulo",               label: "São Paulo (BR)" },
    { value: "America/Santiago",                label: "Santiago (CL)" },
    { value: "America/Bogota",                  label: "Bogotá (CO)" },
    { value: "America/Lima",                    label: "Lima (PE)" },
    { value: "America/Mexico_City",             label: "Ciudad de México (MX)" },
    { value: "America/Caracas",                 label: "Caracas (VE)" },
    { value: "America/La_Paz",                  label: "La Paz (BO)" },
    { value: "America/Asuncion",                label: "Asunción (PY)" },
    { value: "America/Guayaquil",               label: "Guayaquil (EC)" },
    { value: "America/New_York",                label: "Nueva York (US)" },
    { value: "America/Los_Angeles",             label: "Los Ángeles (US)" },
    { value: "Europe/Madrid",                   label: "Madrid (ES)" },
    { value: "Europe/Lisbon",                   label: "Lisboa (PT)" },
];

function TimezoneRow({ value, onChange }: { value: string; onChange: (v: string) => Promise<void> | void }) {
    const [saving, setSaving] = useState(false);
    // Si el cliente tiene una zona horaria que no está en la lista predefinida,
    // la mostramos igual para no perderla al renderizar el select.
    const options = TIMEZONE_OPTIONS.some((o) => o.value === value)
        ? TIMEZONE_OPTIONS
        : [{ value, label: value }, ...TIMEZONE_OPTIONS];

    const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (e.target.value === value) return;
        setSaving(true);
        try { await onChange(e.target.value); } finally { setSaving(false); }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0"><FaClock className="w-4 h-4 text-slate-400" /></span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Zona horaria</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Usada por el asistente para fechas, horarios de atención y recordatorios.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {saving && <FaSpinner className="animate-spin text-slate-400 w-4 h-4" />}
                <select
                    value={value}
                    onChange={handleChange}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

// ─── Currency Row ─────────────────────────────────────────────────────────────

function CurrencyRow({ value, onChange }: { value: string; onChange: (v: string) => Promise<void> | void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [saving, setSaving] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = getCurrency(value);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 50);
        else setQuery("");
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return CURRENCIES;
        return CURRENCIES.filter(c =>
            c.code.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.country.toLowerCase().includes(q)
        );
    }, [query]);

    const handleSelect = async (code: string) => {
        setOpen(false);
        if (code === value) return;
        setSaving(true);
        try { await onChange(code); } finally { setSaving(false); }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0"><FaCoins className="w-4 h-4 text-amber-500" /></span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Moneda de los pedidos</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Se usa al registrar pedidos y al mostrar precios. Buscá por país, nombre o código.
                    </p>
                </div>
            </div>

            <div ref={wrapperRef} className="relative shrink-0">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    disabled={saving}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors min-w-44"
                >
                    <span className="text-base leading-none">{selected.flag}</span>
                    <span className="flex-1 text-left">
                        <span className="font-semibold">{selected.code}</span>
                        <span className="text-slate-400 dark:text-slate-500"> · {selected.country}</span>
                    </span>
                    {saving
                        ? <FaSpinner className="w-3 h-3 animate-spin text-slate-400" />
                        : <FaChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform", open && "rotate-180")} />}
                </button>

                {open && (
                    <div className="absolute right-0 mt-1.5 w-72 max-h-72 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden flex flex-col">
                        <div className="relative p-2 border-b border-slate-100 dark:border-slate-800">
                            <FaMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar país o moneda…"
                                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-slate-400"
                            />
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {filtered.length === 0 ? (
                                <p className="px-3 py-4 text-xs text-center text-slate-400 dark:text-slate-500">Sin resultados</p>
                            ) : filtered.map((c) => {
                                const isSelected = c.code === value;
                                return (
                                    <button
                                        key={c.code}
                                        type="button"
                                        onClick={() => handleSelect(c.code)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors",
                                            isSelected && "bg-primary/5 dark:bg-primary/10"
                                        )}
                                    >
                                        <span className="text-base leading-none shrink-0">{c.flag}</span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block font-medium text-slate-800 dark:text-slate-100 truncate">
                                                {c.country}
                                            </span>
                                            <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                {c.name} · {c.code}
                                            </span>
                                        </span>
                                        {isSelected && <FaCheck className="w-3 h-3 text-primary shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Business Hours Section ───────────────────────────────────────────────────

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type BusinessHourEntry = { day: number; isOpen: boolean; openTime: string; closeTime: string };

function BusinessHoursSection({
    hours,
    onChange,
}: {
    hours: BusinessHourEntry[];
    onChange: (updated: BusinessHourEntry[]) => Promise<void>;
}) {
    const [saving, setSaving] = useState(false);

    const update = async (day: number, patch: Partial<BusinessHourEntry>) => {
        const updated = hours.map((h) => h.day === day ? { ...h, ...patch } : h);
        setSaving(true);
        try { await onChange(updated); } finally { setSaving(false); }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <FaCalendarDay className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Horarios de atención</p>
                {saving && <FaSpinner className="animate-spin text-slate-400 w-3 h-3" />}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                Configurá el horario de cada día. El asistente lo usará para gestionar pedidos y turnos.
            </p>
            <div className="grid gap-2">
                {hours.map((h) => (
                    <div
                        key={h.day}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition-colors",
                            h.isOpen
                                ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                : "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                        )}
                    >
                        {/* Toggle isOpen */}
                        <button
                            type="button"
                            onClick={() => update(h.day, { isOpen: !h.isOpen })}
                            className={cn(
                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
                                h.isOpen ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                            )}
                            aria-label={h.isOpen ? "Cerrar" : "Abrir"}
                        >
                            <span className={cn(
                                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                                h.isOpen ? "translate-x-4.5" : "translate-x-0.5"
                            )} />
                        </button>

                        {/* Day name */}
                        <span className={cn(
                            "w-20 shrink-0 font-medium",
                            h.isOpen ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
                        )}>
                            {DAY_LABELS[h.day]}
                        </span>

                        {h.isOpen ? (
                            <div className="flex items-center gap-2 flex-1">
                                <input
                                    type="time"
                                    value={h.openTime}
                                    onChange={(e) => update(h.day, { openTime: e.target.value })}
                                    className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                                <span className="text-slate-400 text-xs">a</span>
                                <input
                                    type="time"
                                    value={h.closeTime}
                                    onChange={(e) => update(h.day, { closeTime: e.target.value })}
                                    className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 flex-1">Cerrado</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Webhook Modal ────────────────────────────────────────────────────────────

function WebhookModal({
    webhook,
    saving,
    onSave,
    onClose,
}: {
    webhook: WebhookConfig | null;
    saving: boolean;
    onSave: (wh: WebhookConfig) => Promise<void>;
    onClose: () => void;
}) {
    const [name, setName] = useState(webhook?.name ?? "");
    const [url, setUrl] = useState(webhook?.url ?? "");
    const [secret, setSecret] = useState(webhook?.secret ?? crypto.randomUUID());
    const [showSecret, setShowSecret] = useState(false);
    const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
    const [enabled, setEnabled] = useState(webhook?.enabled ?? true);

    const toggleEvent = (ev: string) =>
        setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
        if (!url.trim() || !/^https?:\/\/.+/.test(url.trim())) { toast.error("La URL no es válida."); return; }
        if (events.length === 0) { toast.error("Seleccioná al menos un evento."); return; }
        await onSave({
            id: webhook?.id ?? "",
            name: name.trim(),
            url: url.trim(),
            secret: secret.trim() || undefined,
            events,
            enabled,
        });
    };

    const groups = Array.from(new Set(WEBHOOK_EVENTS.map((e) => e.group)));

    return (
        <div className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-w-lg sm:rounded-2xl sm:max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in sm:zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        {webhook ? "Editar webhook" : "Nuevo webhook"}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <FaXmark size={14} />
                    </button>
                </div>

                <form id="webhook-form" onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                    {/* Nombre */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Nombre</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: CRM HubSpot"
                            className="block w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-slate-400"
                        />
                    </div>

                    {/* URL */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">URL destino</label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://crm.ejemplo.com/webhook"
                            className="block w-full px-4 py-3 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-slate-400"
                        />
                    </div>

                    {/* Secret */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Clave secreta (HMAC)
                        </label>
                        {!webhook && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                                Generada automáticamente. Guardala en un lugar seguro para verificar las notificaciones.
                            </p>
                        )}
                        <div className="relative">
                            <input
                                type={showSecret ? "text" : "password"}
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                className="block w-full pr-16 px-4 py-3 rounded-xl border text-sm bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => { navigator.clipboard.writeText(secret); toast.success("Clave copiada."); }}
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                    title="Copiar clave"
                                >
                                    <FaCopy className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSecret((v) => !v)}
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                    {showSecret ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Eventos */}
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Eventos</label>
                        {groups.map((group) => (
                            <div key={group}>
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">{group}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEBHOOK_EVENTS.filter((e) => e.group === group).map((ev) => (
                                        <button
                                            key={ev.value}
                                            type="button"
                                            onClick={() => toggleEvent(ev.value)}
                                            className={cn(
                                                "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all",
                                                events.includes(ev.value)
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/40"
                                            )}
                                        >
                                            {ev.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Habilitado */}
                    <div className="flex items-center gap-3 pt-1">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => setEnabled((v) => !v)}
                            className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
                                enabled ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                            )}
                        >
                            <span className={cn(
                                "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                                enabled ? "translate-x-5" : "translate-x-0.5"
                            )}>
                                {enabled && <FaCheck className="w-2.5 h-2.5 text-primary" />}
                            </span>
                        </button>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                            {enabled ? "Habilitado" : "Deshabilitado"}
                        </span>
                    </div>
                </form>

                <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        form="webhook-form"
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <><FaSpinner className="animate-spin" /> Guardando…</> : "Guardar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Webhook Docs Modal ───────────────────────────────────────────────────────

function WebhookDocsModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-110 bg-black/50 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
            <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-w-xl sm:rounded-2xl sm:max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in sm:zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <FaBolt className="w-4 h-4 text-violet-500" />
                        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">¿Cómo funcionan los webhooks?</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <FaXmark size={14} />
                    </button>
                </div>
                <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 text-sm text-slate-600 dark:text-slate-300">
                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">¿Qué es un webhook?</h3>
                        <p>
                            Es un aviso automático que Atendia envía a otra aplicación cuando pasa algo en tu cuenta.
                            Por ejemplo: cuando tu asistente capta un nuevo cliente potencial, podés recibir ese dato
                            directamente en tu CRM o en una hoja de cálculo, sin hacer nada a mano.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">¿Qué podés hacer con esto?</h3>
                        <ul className="space-y-1.5 list-none">
                            {[
                                "Guardar automáticamente cada nuevo cliente potencial en tu CRM (HubSpot, Pipedrive, etc.)",
                                "Recibir una notificación en Slack o WhatsApp cuando se hace un pedido nuevo",
                                "Crear un evento en Google Calendar cuando tu asistente agenda un turno",
                                "Conectar con Make, n8n, Zapier u otras herramientas de automatización",
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                    <FaCheck className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">¿Cómo configurarlo?</h3>
                        <ol className="space-y-2 list-none counter-reset-none">
                            {[
                                { n: "1", text: "Hacé clic en \"Agregar webhook\" y poné un nombre que te ayude a identificarlo (ej: \"Mi CRM\")." },
                                { n: "2", text: "Ingresá la URL de destino — es la dirección que te da la herramienta a la que querés conectar." },
                                { n: "3", text: "Elegí los eventos que querés recibir (nuevos clientes, pedidos, turnos, etc.)." },
                                { n: "4", text: "Guardá la clave secreta que se genera automáticamente — la vas a necesitar para verificar que los avisos son reales." },
                            ].map(({ n, text }) => (
                                <li key={n} className="flex items-start gap-3">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{n}</span>
                                    <span>{text}</span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wide">Eventos disponibles</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {[
                                { label: "Cliente potencial captado",     when: "El asistente capta un nuevo interesado" },
                                { label: "Cliente potencial actualizado", when: "Cambiás el estado desde el panel" },
                                { label: "Cliente potencial eliminado",   when: "Eliminás un cliente potencial desde el panel" },
                                { label: "Pedido creado",                 when: "El asistente recibe un pedido nuevo" },
                                { label: "Pedido actualizado",            when: "Cambiás el estado de un pedido" },
                                { label: "Turno nuevo",                   when: "El asistente agenda un turno" },
                                { label: "Turno actualizado",             when: "Se confirma, cancela o modifica un turno" },
                            ].map(({ label, when }) => (
                                <div key={label} className="flex flex-col">
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{when}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">¿Qué datos recibís?</h3>
                        <p className="mb-3 text-slate-500 dark:text-slate-400">
                            Cada notificación llega como un mensaje JSON con el tipo de evento y los datos del registro.
                            Por ejemplo, cuando el asistente capta un nuevo cliente potencial, recibís algo así:
                        </p>
                        <pre className="bg-slate-900 dark:bg-slate-950 text-slate-300 text-xs rounded-xl p-4 overflow-x-auto leading-relaxed">{`{
  "event": "lead.created",
  "timestamp": "2026-04-18T14:30:00.000Z",
  "data": {
    "id": "abc123...",
    "name": "María García",
    "phone": "59899123456",
    "status": "new",
    "summary": "Interesada en el plan premium",
    "type": "lead",
    "requiresAction": false
  }
}`}</pre>
                        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                            Para turnos, el campo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">start</code> llega como fecha y hora en formato estándar (ISO 8601). Para pedidos, incluye los ítems, el monto total y la dirección de entrega.
                        </p>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 space-y-2">
                        <p className="font-semibold text-amber-700 dark:text-amber-400">Verificar que el aviso es legítimo</p>
                        <p className="text-amber-700 dark:text-amber-300">
                            Cada notificación viene firmada con tu clave secreta. Atendia incluye un código de seguridad
                            en el header <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-xs">X-Atendia-Signature</code> de
                            cada request. Si usás Make o n8n, podés configurar ese nodo para verificar la firma y
                            rechazar cualquier mensaje que no venga de Atendia.
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                            No es obligatorio verificar la firma, pero es una buena práctica de seguridad.
                        </p>
                        <details className="mt-1">
                            <summary className="text-xs font-semibold text-amber-700 dark:text-amber-400 cursor-pointer hover:opacity-80">
                                Ver ejemplo técnico (Node.js)
                            </summary>
                            <pre className="mt-2 bg-slate-900 dark:bg-slate-950 text-slate-300 text-xs rounded-xl p-3 overflow-x-auto leading-relaxed">{`const crypto = require("crypto");

function verificar(bodyRaw, secret, header) {
  const esperado = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(bodyRaw)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(esperado),
    Buffer.from(header)
  );
}`}</pre>
                        </details>
                    </div>
                </div>
                <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Push Notification Row ────────────────────────────────────────────────────

function PushNotificationRow({ permission, isSubscribed, isLoading, onSubscribe }: {
    permission: NotificationPermission | "unsupported";
    isSubscribed: boolean;
    isLoading: boolean;
    onSubscribe: () => void;
}) {
    if (permission === "unsupported") {
        return (
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Tu navegador no soporta notificaciones push.
            </p>
        );
    }
    if (permission === "denied") {
        return (
            <div className="flex items-start gap-3">
                <FaBell className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Notificaciones bloqueadas</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Habilitá el permiso de notificaciones para este sitio en la configuración de tu navegador.
                    </p>
                </div>
            </div>
        );
    }
    if (isSubscribed) {
        return (
            <div className="flex items-center gap-3">
                <FaBell className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Notificaciones activas en este dispositivo.
                </p>
            </div>
        );
    }
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <FaBell className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Notificaciones desactivadas</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Activá para recibir alertas de mensajes, pedidos y leads en este dispositivo.
                    </p>
                </div>
            </div>
            <button
                onClick={onSubscribe}
                disabled={isLoading}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading && <FaSpinner className="w-3 h-3 animate-spin" />}
                Activar
            </button>
        </div>
    );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({ icon, label, description, checked, onChange, danger, disabled }: {
    icon: React.ReactNode;
    label: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    danger?: boolean;
    disabled?: boolean;
}) {
    const [loading, setLoading] = useState(false);

    const handleChange = async () => {
        if (disabled) return;
        setLoading(true);
        try {
            await onChange(!checked);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0">{icon}</span>
                <div className="min-w-0">
                    <p className={cn(
                        "text-sm font-medium",
                        danger && !checked ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"
                    )}>
                        {label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
                </div>
            </div>
            <button
                onClick={handleChange}
                disabled={loading || disabled}
                aria-checked={checked}
                role="switch"
                className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed",
                    checked
                        ? danger ? "bg-emerald-500 focus:ring-emerald-400" : "bg-primary focus:ring-primary"
                        : danger ? "bg-red-400 focus:ring-red-400" : "bg-slate-200 dark:bg-slate-700 focus:ring-slate-400"
                )}
            >
                <span className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                    checked ? "translate-x-5" : "translate-x-0.5"
                )}>
                    {loading
                        ? <FaSpinner className="w-2.5 h-2.5 text-slate-400 animate-spin" />
                        : checked && <FaCheck className="w-2.5 h-2.5 text-primary" />
                    }
                </span>
            </button>
        </div>
    );
}
