import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { Link, useNavigate, useParams } from "react-router";
import PageHeader from "../../components/page-header";
import Datatable from "../../components/datatable";
import { FaChevronLeft } from "react-icons/fa6";
import Breadcrumbs from "../../components/breadcrumbs";

const columns: DataTableColumn[] = [
    {
        accessor: "name",
        title: "Nombre"
    },
    {
        accessor: "description",
        title: "Descripción"
    },
    {
        accessor: "model",
        title: "Modelo"
    }
];

export function meta() {
    return [
        { title: "Atendia — Administración — Asistentes" }
    ];
}

export default function ClientAssistants() {
    const { clientId } = useParams();
    const navigate = useNavigate();

    const client = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
    const assistants = useQuery(api.assistants.getByClient, { clientId: clientId as Id<"clients"> });

    return (
        <div className="flex flex-col gap-4">
            <Breadcrumbs 
                items={[
                    { label: "Clientes", href: "/administracion/clientes" },
                    { label: client?.name || "Cliente", href: `/administracion/clientes/${clientId}` },
                    { label: "Asistentes" }
                ]} 
            />
            <PageHeader 
                title="Asistentes" 
                button={{ 
                    text: "Nuevo asistente", 
                    href: "nuevo" }}
            />

            <Datatable
                columns={columns}
                records={assistants}
                onRowClick={(record) => {
                    navigate(record._id)
                }}
                emptyState={{
                    text: "No hay asistentes para mostrar...",
                    onClick: () => navigate("nuevo")
                }}
            />
        </div>
    );
}
