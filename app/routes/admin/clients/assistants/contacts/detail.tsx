import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { FaSpinner, FaTrash, FaPlus, FaXmark } from "react-icons/fa6";
import { useNavigate, useParams } from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn } from "utils/utils";
import { COUNTRY_CONFIGS, parsePhone, type SupportedCountry } from "utils/phoneUtils";
import Breadcrumbs from "../../../components/breadcrumbs";

export function meta() {
    return [{ title: "Atendia — Administración — Contacto" }];
}

export default function AdminContactDetail() {
    const { assistantId, clientId, id } = useParams();
    const navigate = useNavigate();
    const isNew = !id || id === "nuevo";

    const client = useQuery(api.clients.get, { id: clientId as Id<"clients"> });
    const assistant = useQuery(api.assistants.get, { id: assistantId as Id<"assistants"> });
    const contact = useQuery(
        api.contacts.searchByAssistant,
        !isNew ? { assistantId: assistantId as Id<"assistants"> } : "skip"
    );
    const existing = !isNew ? contact?.find(c => c._id === id) : undefined;

    const createContact = useMutation(api.contacts.create);
    const updateContact = useMutation(api.contacts.update);
    const removeContact = useMutation(api.contacts.remove);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [country, setCountry] = useState<SupportedCountry>("UY");
    const [extras, setExtras] = useState<{ key: string; value: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (existing) {
            setName(existing.name);
            setPhone(existing.phone ?? "");
            setExtras(
                existing.extras
                    ? Object.entries(existing.extras).map(([key, value]) => ({ key, value }))
                    : []
            );
        }
    }, [existing]);

    const phoneResult = phone.trim() ? parsePhone(phone.trim(), country) : null;

    const addExtra = () => setExtras(prev => [...prev, { key: "", value: "" }]);
    const removeExtra = (i: number) => setExtras(prev => prev.filter((_, idx) => idx !== i));
    const updateExtra = (i: number, field: "key" | "value", val: string) =>
        setExtras(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

    const buildExtras = () => {
        const result: Record<string, string> = {};
        for (const { key, value } of extras) {
            if (key.trim()) result[key.trim()] = value.trim();
        }
        return Object.keys(result).length > 0 ? result : undefined;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) {
            toast.error("Nombre y teléfono son obligatorios.");
            return;
        }
        setSubmitting(true);
        try {
            if (isNew) {
                await createContact({
                    assistantId: assistantId as Id<"assistants">,
                    name: name.trim(),
                    phone: phone.trim(),
                    countryHint: country,
                    extras: buildExtras(),
                });
                toast.success("Contacto creado.");
            } else {
                await updateContact({
                    id: id as Id<"contacts">,
                    name: name.trim(),
                    phone: phone.trim(),
                    countryHint: country,
                    extras: buildExtras(),
                });
                toast.success("Contacto actualizado.");
            }
            navigate(`/administracion/clientes/${clientId}/asistentes/${assistantId}/contactos`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al guardar.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!globalThis.confirm("¿Eliminar este contacto? Esta acción no se puede deshacer.")) return;
        setDeleting(true);
        try {
            await removeContact({ id: id as Id<"contacts"> });
            toast.success("Contacto eliminado.");
            navigate(`/administracion/clientes/${clientId}/asistentes/${assistantId}/contactos`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar.");
        } finally {
            setDeleting(false);
        }
    };

    const inputClass = "block w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500";

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />

            <div className="w-full max-w-2xl px-4">
                <Breadcrumbs
                    items={[
                        { label: "Clientes", href: "/administracion/clientes" },
                        { label: client?.name || "Cliente", href: `/administracion/clientes/${clientId}` },
                        { label: "Asistentes", href: `/administracion/clientes/${clientId}/asistentes` },
                        { label: assistant?.name || "Asistente", href: `/administracion/clientes/${clientId}/asistentes/${assistantId}` },
                        { label: "Contactos", href: `/administracion/clientes/${clientId}/asistentes/${assistantId}/contactos` },
                        { label: isNew ? "Nuevo" : (existing?.name || "Detalle") },
                    ]}
                />

                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                        {isNew ? "Nuevo contacto" : "Editar contacto"}
                    </h1>
                    {!isNew && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors",
                                deleting && "opacity-50 pointer-events-none"
                            )}
                        >
                            <FaTrash className="w-3.5 h-3.5" />
                            Eliminar
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Nombre del contacto"
                            autoFocus
                            className={inputClass}
                        />
                    </div>

                    {/* Country + Phone */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Teléfono <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={country}
                                onChange={e => setCountry(e.target.value as SupportedCountry)}
                                className="px-3 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
                            >
                                {(Object.entries(COUNTRY_CONFIGS) as [SupportedCountry, typeof COUNTRY_CONFIGS[SupportedCountry]][]).map(
                                    ([code, cfg]) => (
                                        <option key={code} value={code}>
                                            {cfg.label} (+{cfg.callingCode})
                                        </option>
                                    )
                                )}
                            </select>
                            <input
                                type="text"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="099 123 456 o +598 99 123 456"
                                className={cn(inputClass, phoneResult?.ok === false && "border-red-400 focus:border-red-400 focus:ring-red-300")}
                            />
                        </div>
                        {phoneResult && (
                            <p className={cn("text-xs", phoneResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                {phoneResult.ok ? `Guardado como: +${phoneResult.phone}` : phoneResult.error}
                            </p>
                        )}
                    </div>

                    {/* Extras */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Datos adicionales
                            </label>
                            <button
                                type="button"
                                onClick={addExtra}
                                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                                <FaPlus className="w-3 h-3" />
                                Agregar campo
                            </button>
                        </div>
                        {extras.length === 0 ? (
                            <p className="text-xs text-slate-400 dark:text-slate-500">Sin datos adicionales.</p>
                        ) : (
                            <div className="space-y-2">
                                {extras.map((extra, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <input
                                            type="text"
                                            value={extra.key}
                                            onChange={e => updateExtra(i, "key", e.target.value)}
                                            placeholder="Campo"
                                            className={cn(inputClass, "flex-1")}
                                        />
                                        <input
                                            type="text"
                                            value={extra.value}
                                            onChange={e => updateExtra(i, "value", e.target.value)}
                                            placeholder="Valor"
                                            className={cn(inputClass, "flex-1")}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeExtra(i)}
                                            className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                        >
                                            <FaXmark className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    <div className="pt-2 flex items-center justify-end gap-4">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className={cn("btn-primary min-w-32", submitting && "opacity-70 cursor-wait")}
                        >
                            {submitting ? (
                                <span className="flex items-center gap-2">
                                    <FaSpinner className="animate-spin w-3.5 h-3.5" />
                                    Guardando...
                                </span>
                            ) : isNew ? "Crear contacto" : "Guardar cambios"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
