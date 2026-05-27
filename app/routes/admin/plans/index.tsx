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
        accessor: "amount",
        title: "Monto",
        render: ({ amount, currency }: any) => {
            return `${currency} ${amount.toLocaleString()}`;
        }
    },
    {
        accessor: "frequencyType",
        title: "Frecuencia",
        render: ({ frequencyType, frequencyValue }: any) => {
            const types: Record<string, string> = {
                DAILY: "Día(s)",
                WEEKLY: "Semana(s)",
                MONTHLY: "Mes(es)",
                YEARLY: "Año(s)"
            };
            return `Cada ${frequencyValue} ${types[frequencyType] || frequencyType}`;
        }
    },
    {
        accessor: "dlocalPlanId",
        title: "ID dLocal",
        render: ({ dlocalPlanId }: any) => dlocalPlanId || "-"
    },
    {
        accessor: "archived",
        title: "Estado",
        render: ({ archived }: any) => archived
            ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">Archivado</span>
            : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">Activo</span>
    }
];

export function meta() {
    return [
        { title: "Atendia — Administración — Planes" }
    ];
}

export default function AdminPlans() {
    const navigate = useNavigate();
    const plans = useQuery(api.plans.listAll);

    return (
        <div className="flex flex-col gap-4">
            <Breadcrumbs 
                items={[
                    { label: "Planes" }
                ]} 
            />
            <PageHeader 
                title="Planes" 
                button={{ 
                    text: "Nuevo plan", 
                    href: "nuevo" }}
            />

            <Datatable
                columns={columns}
                records={plans}
                onRowClick={(record) => {
                    navigate(record._id)
                }}
                emptyState={{
                    text: "No hay planes para mostrar...",
                    onClick: () => navigate("nuevo")
                }}
            />
        </div>
    );
}
