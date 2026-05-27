import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { useNavigate } from "react-router";
import PageHeader from "../components/page-header";
import Datatable from "../components/datatable";
import Breadcrumbs from "../components/breadcrumbs";

const columns: DataTableColumn[] = [
    {
        accessor: "name",
        title: "Nombre"
    },
    {
        accessor: "businessName",
        title: "Razón Social"
    },
    {
        accessor: "isActive",
        title: "Estado",
        render: ({ isActive }) => {
            return isActive ? "Activo" : "Inactivo";
        }
    },
    {
        accessor: "plan",
        title: "Plan",
        render: ({ plan }: any) => {
            if (!plan) return "-";
            const plans: Record<string, string> = {
                trial: "Prueba",
                basic: "Básico",
                premium: "Premium"
            };
            return plans[plan] || plan;
        }
    },
    {
        accessor: "tokensBalance",
        title: "Saldo de tokens",
        render: ({ tokensBalance }: any) => {
            return tokensBalance !== undefined && tokensBalance !== null 
                ? Number(tokensBalance).toLocaleString() 
                : "-";
        }
    },
    {
        accessor: "trialEndsAt",
        title: "Fin periodo prueba",
        render: ({ trialEndsAt }: any) => {
            if (!trialEndsAt) return "-";
            // Si el timestamp es en segundos (ej: 1773674423), lo multiplicamos por 1000 para ms
            const timestamp = Number(trialEndsAt) < 10000000000 ? Number(trialEndsAt) * 1000 : Number(trialEndsAt);
            return new Date(timestamp).toLocaleDateString("es-ES", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        }
    },
    {
        accessor: "timezone",
        title: "Zona horaria"
    }
];

export function meta() {
    return [
        { title: "Atendia — Administración — Clientes" }
    ];
}

export default function AdminClients() {
    const navigate = useNavigate();

    const clients = useQuery(api.clients.list);

    return (
        <div className="flex flex-col gap-4">
            <Breadcrumbs 
                items={[
                    { label: "Clientes" }
                ]} 
            />
            <PageHeader 
                title="Clientes" 
                button={{ 
                    text: "Nuevo cliente", 
                    href: "nuevo" }}
            />

            <Datatable
                columns={columns}
                records={clients}
                onRowClick={(record) => {
                    console.log(record)
                    navigate(record._id)
                }}
                emptyState={{
                    text: "No hay clientes para mostrar...",
                    onClick: () => navigate("nuevo")
                }}
            />
        </div>
    );
}