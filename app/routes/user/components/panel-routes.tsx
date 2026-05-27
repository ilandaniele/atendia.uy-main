import type { ReactNode } from "react";
import {
    FaHouse,
    FaMessage,
    FaUsers,
    FaCartShopping,
    FaCalendarDay,
    FaWhatsapp,
    FaFile,
    FaChartBar,
    FaGear,
    FaCoins,
    FaUser,
} from "react-icons/fa6";
import { MdAssistant } from "react-icons/md";

export const PANEL_BASE = "/panel";

export type PanelSection = "main" | "billing" | "account";

export type BadgeKey = "leads" | "messages" | "orders" | "appointments";

export type AccessRule =
    | "all"
    | "owner"
    | "feature:enableOrders"
    | "feature:enableAgenda";

export type PanelRoute = {
    path: string;
    label: string;
    description: string;
    keywords?: string[];
    icon: ReactNode;
    section: PanelSection;
    access: AccessRule;
    badgeKey?: BadgeKey;
};

export type PanelFeatures = {
    enableOrders: boolean;
    enableAgenda: boolean;
};

const icon = (node: ReactNode) => node;

export const PANEL_ROUTES: PanelRoute[] = [
    {
        path: PANEL_BASE,
        label: "Panel de control",
        description: "Resumen de actividad: mensajes, leads, pedidos y próximos turnos.",
        keywords: ["inicio", "dashboard", "home"],
        icon: icon(<FaHouse className="h-5 w-5" />),
        section: "main",
        access: "all",
    },
    {
        path: `${PANEL_BASE}/mensajes`,
        label: "Mensajes",
        description: "Conversaciones en tiempo real con tus clientes.",
        keywords: ["chats", "conversaciones", "whatsapp"],
        icon: icon(<FaMessage className="h-5 w-5" />),
        section: "main",
        access: "all",
        badgeKey: "messages",
    },
    {
        path: `${PANEL_BASE}/clientes-potenciales`,
        label: "Clientes potenciales",
        description: "Leads capturados por el asistente, con seguimiento y estado.",
        keywords: ["leads", "interesados", "contactos"],
        icon: icon(<FaUsers className="h-5 w-5" />),
        section: "main",
        access: "all",
        badgeKey: "leads",
    },
    {
        path: `${PANEL_BASE}/pedidos`,
        label: "Pedidos",
        description: "Órdenes recibidas con seguimiento de estado y entrega.",
        keywords: ["ordenes", "compras", "ventas"],
        icon: icon(<FaCartShopping className="h-5 w-5" />),
        section: "main",
        access: "feature:enableOrders",
        badgeKey: "orders",
    },
    {
        path: `${PANEL_BASE}/agenda`,
        label: "Agenda",
        description: "Calendario de turnos confirmados, pendientes y cancelados.",
        keywords: ["turnos", "citas", "calendario", "reservas"],
        icon: icon(<FaCalendarDay className="h-5 w-5" />),
        section: "main",
        access: "feature:enableAgenda",
        badgeKey: "appointments",
    },
    {
        path: `${PANEL_BASE}/asistentes`,
        label: "Asistentes",
        description: "Crear y configurar asistentes IA por canal.",
        keywords: ["bots", "ia", "ai"],
        icon: icon(<MdAssistant className="h-5 w-5" />),
        section: "main",
        access: "owner",
    },
    {
        path: `${PANEL_BASE}/canales`,
        label: "Canales",
        description: "Integración de WhatsApp, web y otros canales de mensajería.",
        keywords: ["whatsapp", "web", "integraciones"],
        icon: icon(<FaWhatsapp className="h-5 w-5" />),
        section: "main",
        access: "owner",
    },
    {
        path: `${PANEL_BASE}/bases-de-conocimiento`,
        label: "Mi información",
        description: "Bases de conocimiento que alimentan a tus asistentes.",
        keywords: ["bases", "conocimiento", "rag", "faq", "documentos"],
        icon: icon(<FaFile className="h-5 w-5" />),
        section: "main",
        access: "owner",
    },
    {
        path: `${PANEL_BASE}/reportes`,
        label: "Reportes",
        description: "Análisis de clientes, pedidos y turnos por período.",
        keywords: ["analytics", "estadísticas", "metricas"],
        icon: icon(<FaChartBar className="h-5 w-5" />),
        section: "main",
        access: "owner",
    },
    {
        path: `${PANEL_BASE}/configuracion`,
        label: "Configuración",
        description: "Ajustes generales del negocio, equipo y notificaciones.",
        keywords: ["settings", "preferencias", "ajustes"],
        icon: icon(<FaGear className="h-5 w-5" />),
        section: "main",
        access: "owner",
    },
    {
        path: `${PANEL_BASE}/facturacion`,
        label: "Facturación",
        description: "Plan actual, historial de pagos y balance de tokens.",
        keywords: ["pagos", "plan", "suscripcion", "tokens", "billing"],
        icon: icon(<FaCoins className="h-5 w-5" />),
        section: "billing",
        access: "owner",
    },
    {
        path: `${PANEL_BASE}/cuenta`,
        label: "Mi cuenta",
        description: "Perfil personal, vinculación de Google y privacidad.",
        keywords: ["perfil", "profile", "account"],
        icon: icon(<FaUser className="h-5 w-5" />),
        section: "account",
        access: "all",
    },
];

export function filterAccessibleRoutes(
    routes: PanelRoute[],
    role: "owner" | "member",
    features: PanelFeatures
): PanelRoute[] {
    return routes.filter((r) => {
        if (r.access === "all") return true;
        if (r.access === "owner") return role === "owner";
        if (r.access === "feature:enableOrders") return features.enableOrders;
        if (r.access === "feature:enableAgenda") return features.enableAgenda;
        return false;
    });
}

export const SECTION_LABELS: Record<PanelSection, string> = {
    main: "Operación",
    billing: "Facturación",
    account: "Cuenta",
};
