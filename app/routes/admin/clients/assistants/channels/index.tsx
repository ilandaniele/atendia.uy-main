import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { Link, useNavigate, useParams } from "react-router";
import PageHeader from "../../../components/page-header";
import Datatable from "../../../components/datatable";
import { FaChevronLeft } from "react-icons/fa6";
import Breadcrumbs from "../../../components/breadcrumbs";

const columns: DataTableColumn[] = [
    {
        accessor: "name",
        title: "Nombre"
    },
    {
        accessor: "type",
        title: "Tipo",
        render: ({ type }) => {
            const types: Record<string, string> = {
                web: "Web Widget",
                whatsapp: "WhatsApp",
            };
            return types[type as string] || type as string;
        }
    },
    {
        accessor: "isActive",
        title: "Estado",
        render: ({ isActive }) => {
            return isActive ? "Activo" : "Inactivo";
        }
    },
    {
        accessor: "status",
        title: "Estado de Conexión",
        render: ({ status }) => {
            const statuses: Record<string, string> = {
                connected: "Conectado",
                disconnected: "Desconectado",
                pending: "Pendiente"
            };
            return statuses[status as string] || status as string;
        }
    }
];

export function meta() {
    return [
        { title: "Atendia — Administración — Canales" }
    ];
}

export default function AssistantChannels() {
    const { assistantId, clientId } = useParams();
    const navigate = useNavigate();

    const client = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
    const assistant = useQuery(api.assistants.get, { id: assistantId as Id<"assistants"> });
    const channels = useQuery(api.channels.getByAssistant, { assistantId: assistantId as Id<"assistants"> });

    return (
        <div className="flex flex-col gap-4">
            <Breadcrumbs 
                items={[
                    { label: "Clientes", href: "/administracion/clientes" },
                    { label: client?.name || "Cliente", href: `/administracion/clientes/${clientId}` },
                    { label: "Asistentes", href: `/administracion/clientes/${clientId}/asistentes` },
                    { label: assistant?.name || "Asistente", href: `/administracion/clientes/${clientId}/asistentes/${assistantId}` },
                    { label: "Canales" }
                ]} 
            />
            <PageHeader 
                title="Canales" 
                button={{ 
                    text: "Nuevo canal", 
                    href: "nuevo" }}
            />

            <Datatable
                columns={columns}
                records={channels}
                onRowClick={(record) => {
                    navigate(record._id)
                }}
                emptyState={{
                    text: "No hay canales configurados para este asistente...",
                    onClick: () => navigate("nuevo")
                }}
            />
        </div>
    );
}
