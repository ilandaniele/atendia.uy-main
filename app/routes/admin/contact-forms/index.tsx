import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { FaCircle } from "react-icons/fa6";
import { useNavigate } from "react-router";
import Breadcrumbs from "../components/breadcrumbs";
import Datatable from "../components/datatable";
import PageHeader from "../components/page-header";

const STATUS_LABELS: Record<string, string> = {
    new: "Nuevo",
    read: "Leído",
    replied: "Respondido",
    archived: "Archivado",
};

const STATUS_STYLES: Record<string, string> = {
    new: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    read: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    replied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    archived: "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.new}`}>
            <FaCircle className="h-2 w-2" />
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

export function meta() {
    return [{ title: "Atendia — Administración — Formularios de contacto" }];
}

export default function AdminContactFormsList() {
    const navigate = useNavigate();
    const forms = useQuery(api.contactForms.list);

    const columns: DataTableColumn[] = [
        {
            accessor: "name",
            title: "Nombre",
            render: ({ name, subject }: any) => (
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {name}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-xs">
                        {subject}
                    </span>
                </div>
            ),
        },
        {
            accessor: "email",
            title: "Correo",
            render: ({ email }: any) => (
                <span className="text-slate-600 dark:text-slate-400 text-sm tabular-nums">
                    {email}
                </span>
            ),
        },
        {
            accessor: "phone",
            title: "Teléfono",
            render: ({ phone }: any) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm">
                    {phone ?? "—"}
                </span>
            ),
        },
        {
            accessor: "status",
            title: "Estado",
            render: ({ status }: any) => <StatusBadge status={status} />,
        },
        {
            accessor: "_creationTime",
            title: "Recibido",
            render: ({ _creationTime }: any) => (
                <span className="text-slate-400 dark:text-slate-500 text-xs tabular-nums">
                    {new Date(_creationTime).toLocaleDateString("es-UY", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                    })}
                </span>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <Breadcrumbs items={[{ label: "Formularios de contacto" }]} />
            <PageHeader title="Formularios de contacto" />
            <Datatable
                columns={columns}
                records={forms}
                onRowClick={(record) => navigate(record._id)}
                emptyState={{
                    text: "No hay formularios de contacto aún."
                }}
            />
        </div>
    );
}
