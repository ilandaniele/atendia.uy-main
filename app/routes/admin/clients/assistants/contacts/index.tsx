import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import PageHeader from "../../../components/page-header";
import Datatable from "../../../components/datatable";
import Breadcrumbs from "../../../components/breadcrumbs";
import type { DataTableColumn } from "mantine-datatable";

export function meta() {
    return [{ title: "Atendia — Administración — Contactos" }];
}

const columns: DataTableColumn[] = [
    { accessor: "name", title: "Nombre" },
    { accessor: "phone", title: "Teléfono" },
    {
        accessor: "extras",
        title: "Datos adicionales",
        render: ({ extras }) => {
            if (!extras || typeof extras !== "object") return "—";
            const pairs = Object.entries(extras as Record<string, string>);
            if (pairs.length === 0) return "—";
            return pairs.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ");
        },
    },
];

export default function AdminContacts() {
    const { assistantId, clientId } = useParams();
    const navigate = useNavigate();

    const [nameFilter, setNameFilter] = useState("");
    const [phoneFilter, setPhoneFilter] = useState("");

    const client = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
    const assistant = useQuery(api.assistants.get, { id: assistantId as Id<"assistants"> });

    const isFiltering = nameFilter.trim().length > 0 || phoneFilter.trim().length > 0;

    const contacts = useQuery(api.contacts.searchByAssistant, {
        assistantId: assistantId as Id<"assistants">,
        name: nameFilter.trim() || undefined,
        phone: phoneFilter.trim() || undefined,
    });

    const removeContact = useMutation(api.contacts.remove);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!globalThis.confirm("¿Eliminar este contacto? Esta acción no se puede deshacer.")) return;
        try {
            await removeContact({ id: id as Id<"contacts"> });
            toast.success("Contacto eliminado.");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar.");
        }
    };

    const clearFilters = () => {
        setNameFilter("");
        setPhoneFilter("");
    };

    return (
        <div className="flex flex-col gap-4">
            <ToastContainer position="top-right" theme="colored" />

            <Breadcrumbs
                items={[
                    { label: "Clientes", href: "/administracion/clientes" },
                    { label: client?.name || "Cliente", href: `/administracion/clientes/${clientId}` },
                    { label: "Asistentes", href: `/administracion/clientes/${clientId}/asistentes` },
                    { label: assistant?.name || "Asistente", href: `/administracion/clientes/${clientId}/asistentes/${assistantId}` },
                    { label: "Contactos" },
                ]}
            />

            <PageHeader
                title="Contactos"
                button={{ text: "Nuevo contacto", href: "nuevo" }}
            />

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative">
                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Filtrar por nombre..."
                        value={nameFilter}
                        onChange={e => setNameFilter(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <div className="relative">
                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Filtrar por teléfono..."
                        value={phoneFilter}
                        onChange={e => setPhoneFilter(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                {isFiltering && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                        <FaXmark className="w-3.5 h-3.5" />
                        Limpiar
                    </button>
                )}
            </div>

            <Datatable
                columns={columns}
                records={contacts}
                onRowClick={record => navigate(record._id)}
                emptyState={{
                    text: isFiltering ? "No se encontraron contactos con esos filtros." : "No hay contactos registrados para este asistente.",
                    onClick: () => navigate("nuevo"),
                }}
            />
        </div>
    );
}
