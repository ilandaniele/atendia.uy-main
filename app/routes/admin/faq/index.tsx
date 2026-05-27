import { api } from "convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { FaCheckCircle, FaCircle } from "react-icons/fa";
import { FaArrowDown, FaArrowUp, FaYoutube } from "react-icons/fa6";
import { useNavigate } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import Breadcrumbs from "../components/breadcrumbs";
import Datatable from "../components/datatable";
import PageHeader from "../components/page-header";

function StatusBadge({ isPublished }: { isPublished: boolean }) {
    return isPublished ? (
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
    return [{ title: "Atendia — Administración — Preguntas Frecuentes" }];
}

export default function AdminFaqList() {
    const navigate = useNavigate();
    const faqs = useQuery(api.faq.list);
    const reorderMutation = useMutation(api.faq.reorder);
    const toggleMutation = useMutation(api.faq.togglePublish);

    const handleReorder = async (id: string, direction: "up" | "down", e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await reorderMutation({ id: id as any, direction });
        } catch {
            toast.error("Error al reordenar");
        }
    };

    const handleToggle = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await toggleMutation({ id: id as any });
        } catch {
            toast.error("Error al cambiar estado");
        }
    };

    const columns: DataTableColumn[] = [
        {
            accessor: "order",
            title: "#",
            width: 60,
            render: ({ order }: any) => (
                <span className="font-mono text-slate-500 dark:text-slate-400 text-xs">{order + 1}</span>
            ),
        },
        {
            accessor: "question",
            title: "Pregunta",
            render: ({ question, answerType }: any) => (
                <div className="flex items-center gap-2">
                    {answerType === "youtube" && (
                        <FaYoutube className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {question}
                    </span>
                </div>
            ),
        },
        {
            accessor: "keywords",
            title: "Palabras clave",
            render: ({ keywords }: any) =>
                keywords?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {keywords.slice(0, 3).map((kw: string) => (
                            <span
                                key={kw}
                                className="px-1.5 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                            >
                                {kw}
                            </span>
                        ))}
                        {keywords.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-400">
                                +{keywords.length - 3}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-slate-400 text-xs">—</span>
                ),
        },
        {
            accessor: "isPublished",
            title: "Estado",
            render: ({ isPublished }: any) => <StatusBadge isPublished={isPublished} />,
        },
        {
            accessor: "actions",
            title: "",
            render: (record: any) => (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={(e) => handleReorder(record._id, "up", e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Subir"
                    >
                        <FaArrowUp className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => handleReorder(record._id, "down", e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Bajar"
                    >
                        <FaArrowDown className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => handleToggle(record._id, e)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                            record.isPublished
                                ? "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                : "bg-primary text-white hover:bg-primary/90"
                        }`}
                    >
                        {record.isPublished ? "Despublicar" : "Publicar"}
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <ToastContainer position="top-right" theme="colored" />
            <Breadcrumbs items={[{ label: "Preguntas Frecuentes" }]} />
            <PageHeader
                title="Preguntas Frecuentes"
                button={{ text: "Nueva pregunta", href: "nueva" }}
            />
            <Datatable
                columns={columns}
                records={faqs}
                onRowClick={(record) => navigate(record._id)}
                emptyState={{
                    text: "No hay preguntas frecuentes aún...",
                    onClick: () => navigate("nueva"),
                }}
            />
        </div>
    );
}
