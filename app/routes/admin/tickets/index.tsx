import { api } from "convex/_generated/api";
import { useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { FaCircle } from "react-icons/fa";
import { useNavigate } from "react-router";
import Breadcrumbs from "../components/breadcrumbs";
import Datatable from "../components/datatable";
import PageHeader from "../components/page-header";

const STATUS_LABELS: Record<string, string> = {
    open: "Abierto",
    in_progress: "En progreso",
    resolved: "Resuelto",
    closed: "Cerrado",
};

const STATUS_STYLES: Record<string, string> = {
    open: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_LABELS: Record<string, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
};

const PRIORITY_STYLES: Record<string, string> = {
    low: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.open}`}>
            <FaCircle className="h-2 w-2" />
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

function PriorityBadge({ priority }: { priority: string }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low}`}>
            {PRIORITY_LABELS[priority] ?? priority}
        </span>
    );
}

export function meta() {
    return [{ title: "Atendia — Administración — Tickets de soporte" }];
}

export default function AdminTicketsList() {
    const navigate = useNavigate();
    const tickets = useQuery(api.tickets.list);

    const columns: DataTableColumn[] = [
        {
            accessor: "title",
            title: "Título",
            render: ({ title, adminNote }: any) => (
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {title}
                    </span>
                    {adminNote && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-xs">
                            Respuesta: {adminNote}
                        </span>
                    )}
                </div>
            ),
        },
        {
            accessor: "client",
            title: "Cliente",
            render: ({ client }: any) => (
                <span className="text-slate-600 dark:text-slate-400 text-sm">
                    {client?.name ?? "—"}
                </span>
            ),
        },
        {
            accessor: "profile",
            title: "Usuario",
            render: ({ profile }: any) => (
                <span className="text-slate-600 dark:text-slate-400 text-sm">
                    {profile?.name ?? "—"}
                </span>
            ),
        },
        {
            accessor: "priority",
            title: "Prioridad",
            render: ({ priority }: any) => <PriorityBadge priority={priority} />,
        },
        {
            accessor: "status",
            title: "Estado",
            render: ({ status }: any) => <StatusBadge status={status} />,
        },
        {
            accessor: "_creationTime",
            title: "Creado",
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
            <Breadcrumbs items={[{ label: "Tickets de soporte" }]} />
            <PageHeader
                title="Tickets de soporte"
                button={{ text: "Nuevo ticket", href: "#" }}
            />
            <Datatable
                columns={columns}
                records={tickets}
                onRowClick={(record) => navigate(record._id)}
                emptyState={{
                    text: "No hay tickets de soporte aún...",
                    onClick: () => {},
                }}
            />
        </div>
    );
}
