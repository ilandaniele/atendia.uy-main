import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { FaChevronLeft, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { Link, useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import Datatable from "../../components/datatable";
import PageHeader from "../../components/page-header";
import { cn } from "utils/utils";
import Breadcrumbs from "../../components/breadcrumbs";

export function meta() {
    return [
        { title: "Atendia — Administración — Bases de Conocimiento" }
    ];
}

export default function ClientKnowledgeBases() {
    const { clientId } = useParams();
    const navigate = useNavigate();
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingKb, setEditingKb] = useState<Doc<"knowledge_bases"> | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const client = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
    const knowledgeBases = useQuery(api.knowledgeBases.getByClient, { clientId: clientId as Id<"clients"> });
    const createKb = useMutation(api.knowledgeBases.create);
    const updateKb = useMutation(api.knowledgeBases.update);
    const removeKb = useMutation(api.knowledgeBases.remove);

    const handleOpenCreate = () => {
        setEditingKb(null);
        setName("");
        setDescription("");
        setIsModalOpen(true);
    };

    const handleOpenEdit = (e: React.MouseEvent, kb: Doc<"knowledge_bases">) => {
        e.stopPropagation();
        setEditingKb(kb);
        setName(kb.name);
        setDescription(kb.description || "");
        setIsModalOpen(true);
    };

    const handleDelete = async (e: React.MouseEvent, id: Id<"knowledge_bases">) => {
        e.stopPropagation();
        if (!confirm("¿Estás seguro de que deseas eliminar esta base de conocimiento?")) return;
        
        try {
            await removeKb({ id });
            toast.success("Base de conocimiento eliminada");
        } catch (error) {
            toast.error("Error al eliminar la base de conocimiento");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return toast.error("El nombre es obligatorio");
        
        setIsSubmitting(true);
        try {
            if (editingKb) {
                await updateKb({
                    id: editingKb._id,
                    name,
                    description
                });
                toast.success("Base de conocimiento actualizada");
            } else {
                await createKb({
                    name,
                    description,
                    client: clientId as Id<"clients">
                });
                toast.success("Base de conocimiento creada");
            }
            setIsModalOpen(false);
        } catch (error) {
            toast.error("Error al guardar la base de conocimiento");
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns = [
        {
            accessor: "name",
            title: "Nombre",
        },
        {
            accessor: "description",
            title: "Descripción",
        },
        {
            accessor: "actions",
            title: "Acciones",
            textAlign: "right" as const,
            render: (record: Doc<"knowledge_bases">) => (
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={(e) => handleDelete(e, record._id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                        <FaTrash size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="flex flex-col gap-4">
            <ToastContainer position="top-right" theme="colored" />
            
            <Breadcrumbs 
                items={[
                    { label: "Clientes", href: "/administracion/clientes" },
                    { label: client?.name || "Cliente", href: `/administracion/clientes/${clientId}` },
                    { label: "Bases de conocimiento" }
                ]} 
            />
            
            <PageHeader 
                title="Bases de conocimiento" 
                button={{ 
                    text: "Nueva base", 
                    onClick: handleOpenCreate 
                }}
            />

            <Datatable
                columns={columns}
                records={knowledgeBases}
                onRowClick={(record) => {
                    navigate(`${record._id}`)
                }}
                emptyState={{
                    text: "No hay bases de conocimiento para mostrar...",
                    onClick: handleOpenCreate
                }}
            />

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                {editingKb ? "Editar base de conocimiento" : "Nueva base de conocimiento"}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Nombre <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    autoFocus
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Descripción
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none text-sm"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={cn("btn-primary min-w-28", isSubmitting && "opacity-70 cursor-wait")}
                                >
                                    {isSubmitting ? "Guardando…" : editingKb ? "Guardar cambios" : "Crear"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
