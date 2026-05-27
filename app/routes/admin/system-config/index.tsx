import { api } from "convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { FaSpinner, FaFloppyDisk } from "react-icons/fa6";
import { toast, ToastContainer } from "react-toastify";
import Switch from "../components/switch";
import PageHeader from "../components/page-header";
import Breadcrumbs from "../components/breadcrumbs";

export function meta() {
    return [{ title: "Atendia — Administración — Configuración del sistema" }];
}

export default function SystemConfigPage() {
    const config = useQuery(api.systemConfig.get);
    const upsert = useMutation(api.systemConfig.upsert);

    const [trialDays, setTrialDays] = useState(7);
    const [defaultTrialTokens, setDefaultTrialTokens] = useState(50000);
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [allowedRegistration, setAllowedRegistration] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (config) {
            setTrialDays(config.trialDays);
            setDefaultTrialTokens(config.defaultTrialTokens);
            setMaintenanceMode(config.maintenanceMode);
            setAllowedRegistration(config.allowedRegistration);
        }
    }, [config]);

    const handleSave = async () => {
        if (!Number.isInteger(trialDays) || trialDays < 1) {
            toast.error("Los días de prueba deben ser un número entero mayor a 0");
            return;
        }
        if (!Number.isInteger(defaultTrialTokens) || defaultTrialTokens < 0) {
            toast.error("Los tokens deben ser un número entero mayor o igual a 0");
            return;
        }
        setIsSaving(true);
        try {
            await upsert({ trialDays, defaultTrialTokens, maintenanceMode, allowedRegistration });
            toast.success("Configuración guardada correctamente");
        } catch (e: any) {
            toast.error(e.message || "Error al guardar la configuración");
        } finally {
            setIsSaving(false);
        }
    };

    if (config === undefined) {
        return (
            <div className="flex items-center justify-center py-20">
                <FaSpinner className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover theme="colored" />
            <Breadcrumbs items={[{ label: "Configuración del sistema" }]} />
            <PageHeader title="Configuración del sistema" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
                {/* Período de prueba */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-neutral-200 dark:border-slate-800 p-5 flex flex-col gap-4">
                    <h2 className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                        Período de prueba
                    </h2>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="trialDays" className="input-label">Días de prueba</label>
                        <input
                            id="trialDays"
                            type="number"
                            min={1}
                            step={1}
                            value={trialDays}
                            onChange={(e) => setTrialDays(Math.max(1, Math.floor(Number(e.target.value))))}
                            className="input-field w-32"
                        />
                        <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
                            Duración del período de prueba al crear un nuevo espacio de trabajo.
                        </p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="defaultTrialTokens" className="input-label">Tokens iniciales de prueba</label>
                        <input
                            id="defaultTrialTokens"
                            type="number"
                            min={0}
                            step={1000}
                            value={defaultTrialTokens}
                            onChange={(e) => setDefaultTrialTokens(Math.max(0, Math.floor(Number(e.target.value))))}
                            className="input-field w-40"
                        />
                        <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
                            Tokens asignados al crear un nuevo espacio de trabajo en período de prueba.
                        </p>
                    </div>
                </div>

                {/* Acceso y disponibilidad */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-neutral-200 dark:border-slate-800 p-5 flex flex-col gap-4">
                    <h2 className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wider">
                        Acceso y disponibilidad
                    </h2>
                    <Switch
                        id="allowedRegistration"
                        checked={allowedRegistration}
                        onChange={setAllowedRegistration}
                        label="Permitir registro de nuevos usuarios"
                    />
                    <p className="text-xs text-neutral-400 dark:text-slate-500 -mt-2">
                        Si está desactivado, no se podrán crear nuevas cuentas. Los usuarios con invitación podrán registrarse igualmente.
                    </p>
                    <Switch
                        id="maintenanceMode"
                        checked={maintenanceMode}
                        onChange={setMaintenanceMode}
                        label="Modo mantenimiento"
                    />
                    <p className="text-xs text-neutral-400 dark:text-slate-500 -mt-2">
                        Muestra una página de mantenimiento en el sitio público y el panel de usuarios. El panel de administración permanece accesible.
                    </p>
                </div>
            </div>

            <div className="max-w-3xl flex justify-end pt-2">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn-primary gap-2"
                >
                    {isSaving
                        ? <FaSpinner className="animate-spin h-4 w-4" />
                        : <FaFloppyDisk className="h-4 w-4" />
                    }
                    Guardar configuración
                </button>
            </div>
        </div>
    );
}
