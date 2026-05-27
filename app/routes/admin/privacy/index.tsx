import { api } from "convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { useState } from "react";
import { FaCheckCircle, FaCircle } from "react-icons/fa";
import { useNavigate } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import Breadcrumbs from "../components/breadcrumbs";
import Datatable from "../components/datatable";
import PageHeader from "../components/page-header";

function StatusBadge({ isActive }: { isActive: boolean }) {
    return isActive ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <FaCheckCircle className="h-3 w-3" />
            Publicada
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <FaCircle className="h-3 w-3" />
            Borrador
        </span>
    );
}

export function meta() {
    return [{ title: "Atendia — Administración — Política de Privacidad" }];
}

export default function AdminPrivacyList() {
    const navigate = useNavigate();
    const policies = useQuery(api.privacy.list);
    const publishMutation = useMutation(api.privacy.publish);
    const [publishingId, setPublishingId] = useState<string | null>(null);

    const columns: DataTableColumn[] = [
        {
            accessor: "version",
            title: "Versión",
            render: ({ version }: any) => (
                <span className="font-mono font-semibold text-primary">v{version}</span>
            ),
        },
        {
            accessor: "title",
            title: "Título",
        },
        {
            accessor: "isActive",
            title: "Estado",
            render: ({ isActive }: any) => <StatusBadge isActive={isActive} />,
        },
        {
            accessor: "publishedAt",
            title: "Publicada el",
            render: ({ publishedAt }: any) =>
                publishedAt
                    ? new Date(publishedAt).toLocaleDateString("es-UY", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                      })
                    : "—",
        },
        {
            accessor: "_creationTime",
            title: "Creada el",
            render: ({ _creationTime }: any) =>
                new Date(_creationTime).toLocaleDateString("es-UY", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                }),
        },
        {
            accessor: "actions",
            title: "",
            render: (record: any) =>
                !record.isActive ? (
                    <button
                        type="button"
                        onClick={async (e) => {
                            e.stopPropagation();
                            setPublishingId(record._id);
                            try {
                                await publishMutation({ id: record._id });
                                toast.success(`Versión ${record.version} publicada correctamente`);
                            } catch {
                                toast.error("Error al publicar la versión");
                            } finally {
                                setPublishingId(null);
                            }
                        }}
                        disabled={publishingId === record._id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    >
                        {publishingId === record._id ? "Publicando..." : "Publicar"}
                    </button>
                ) : null,
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <ToastContainer position="top-right" theme="colored" />
            <Breadcrumbs items={[{ label: "Política de Privacidad" }]} />
            <PageHeader
                title="Política de Privacidad"
                button={{ text: "Nueva versión", href: "nueva" }}
            />
            <Datatable
                columns={columns}
                records={policies}
                onRowClick={(record) => navigate(record._id)}
                emptyState={{
                    text: "No hay versiones de política de privacidad aún...",
                    onClick: () => navigate("nueva"),
                }}
            />
        </div>
    );
}
