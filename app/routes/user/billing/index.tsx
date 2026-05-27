import { api } from "convex/_generated/api";
import { useQuery, useAction } from "convex/react";
import type { DataTableColumn } from "mantine-datatable";
import { useFetcher } from "react-router";
import PageHeader from "../../admin/components/page-header";
import Datatable from "../../admin/components/datatable";
import Breadcrumbs from "../../admin/components/breadcrumbs";
import { FaFileInvoiceDollar, FaCircleCheck, FaClock, FaCircleXmark, FaCoins, FaCrown, FaRocket, FaRotate, FaArrowRight, FaStar, FaBolt, FaGem, FaSpinner, FaTriangleExclamation } from "react-icons/fa6";
import { cn } from "utils/utils";
import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { useRequireOwner } from "../hooks/useRequireOwner";

export function meta() {
    return [
        { title: "Facturación - Atendia" }
    ];
}

const IconComponent = ({ name, className }: { name: string, className?: string }) => {
    const icons: Record<string, any> = {
        FaClock: FaClock,
        FaRocket: FaRocket,
        FaCrown: FaCrown,
        FaStar: FaStar,
        FaBolt: FaBolt,
        FaGem: FaGem
    };
    const Icon = icons[name] || FaStar;
    return <Icon className={className} />;
};

const columns: DataTableColumn[] = [
    {
        accessor: "_creationTime",
        title: "Fecha",
        render: ({ _creationTime }: any) => {
            return new Date(_creationTime).toLocaleDateString("es-ES", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        }
    },
    {
        accessor: "description",
        title: "Descripción"
    },
    {
        accessor: "amount",
        title: "Monto",
        render: ({ amount }: any) => {
            return `$ ${amount?.toLocaleString() ?? "-"}`;
        }
    },
    {
        accessor: "status",
        title: "Estado",
        render: ({ status }: any) => {
            const statusMap: Record<string, { label: string, icon: any, color: string }> = {
                paid: { label: "Pagado", icon: <FaCircleCheck />, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50" },
                pending: { label: "Pendiente", icon: <FaClock />, color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50" },
                canceled: { label: "Cancelado", icon: <FaCircleXmark />, color: "text-red-600 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50" },
            };

            const config = statusMap[status] || { label: status, icon: null, color: "text-slate-600 bg-slate-50 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800/50" };

            return (
                <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", config.color)}>
                    {config.icon}
                    {config.label}
                </div>
            );
        }
    }
];

export default function UserBilling() {
    useRequireOwner();
    const fetcher = useFetcher();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    const cancelSubscription = useAction(api.billing.cancelSubscription);

    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const activeClientMember = userClients?.[0];
    const clientId = activeClientMember?.client;
    const isOwner = activeClientMember?.role === "owner";

    const client = useQuery(api.clients.get, clientId ? { id: clientId } : "skip");
    const invoices = useQuery(api.invoices.listByClient, clientId ? { clientId } : "skip");
    const dbPlans = useQuery(api.plans.list);

    const handleUpdatePlan = async (plan: any) => {
        if (!clientId || !client || !userProfile) return;
        if (!plan.subscriptionUrl) return;

        const url = new URL(plan.subscriptionUrl);
        if (userProfile.email) url.searchParams.set("email", userProfile.email);
        globalThis.location.replace(url.toString());
    };

    const handleCancelSubscription = async () => {
        if (!clientId) return;
        setIsCancelling(true);
        try {
            await cancelSubscription({ clientId });
            setIsCancelModalOpen(false);
            toast.success("Suscripción cancelada. Tu acceso se mantiene hasta el final del período actual.");
        } catch (err: any) {
            toast.error(err?.message ?? "Error al cancelar la suscripción. Intentá de nuevo.");
        } finally {
            setIsCancelling(false);
        }
    };

    useEffect(() => {
        if (fetcher.data && (fetcher.data as any).error) {
            toast.error((fetcher.data as any).error);
        }
    }, [fetcher.data]);

    const getDaysLeft = (trialEndsAt?: number) => {
        if (!trialEndsAt) return null;
        const diff = trialEndsAt - Date.now();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 0;
    };

    const currentPlan = dbPlans?.find(p => p._id === client?.plan);
    const isTrial = !client?.plan && !!client?.trialEndsAt;
    const hasNoActivePlan = !client?.plan && !client?.trialEndsAt;
    const daysLeft = getDaysLeft(client?.trialEndsAt);
    const trialActive = isTrial && daysLeft !== null && daysLeft > 0;
    const trialExpired = isTrial && (daysLeft === null || daysLeft === 0);

    // Badge
    const badgeConfig = currentPlan
        ? { label: currentPlan.name, color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" }
        : trialActive
            ? { label: "Período de Prueba", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" }
            : trialExpired
                ? { label: "Prueba terminada", color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" }
                : { label: "Sin plan activo", color: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-10">
            <Breadcrumbs
                items={[
                    { label: "Panel", href: "/panel" },
                    { label: "Facturación" }
                ]}
            />

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Resumen del Plan Actual */}
                <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            Tu plan actual
                        </h2>
                        <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
                            badgeConfig.color
                        )}>
                            {badgeConfig.label}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg shadow-sm text-primary">
                                    <FaCoins size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Créditos disponibles</p>
                                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                        {client?.tokensBalance?.toLocaleString() ?? 0}
                                    </p>
                                </div>
                            </div>

                            {isTrial && (
                                <div className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border",
                                    trialActive
                                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800"
                                        : "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800"
                                )}>
                                    <div className={cn("p-3 bg-white dark:bg-slate-900 rounded-lg shadow-sm", trialActive ? "text-blue-500" : "text-amber-500")}>
                                        <FaClock size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                            {trialActive ? "Días de prueba restantes" : "Período de prueba terminado"}
                                        </p>
                                        <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                            {trialActive ? `${daysLeft} día${daysLeft === 1 ? "" : "s"}` : "Elegí un plan para continuar"}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Panel de acción */}
                        <div className="flex flex-col justify-center items-center p-6 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 gap-3">

                            {/* Estado: trial activo → puede suscribirse anticipadamente */}
                            {trialActive && (
                                <>
                                    <p className="text-sm text-blue-600 dark:text-blue-400 text-center font-medium">
                                        Tu período de prueba está activo
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                        Podés suscribirte ahora y tu plan se activará de inmediato.
                                    </p>
                                    <button
                                        onClick={() => setIsModalOpen(true)}
                                        disabled={!isOwner}
                                        className={cn("btn-primary w-full max-w-50", !isOwner && "opacity-50 cursor-not-allowed")}
                                    >
                                        <FaRocket className="mr-2" />
                                        Suscribirme ahora
                                    </button>
                                    {!isOwner && <p className="text-[10px] text-red-500">Solo el dueño puede cambiar el plan</p>}
                                </>
                            )}

                            {/* Estado: plan activo → puede cambiar o cancelar */}
                            {currentPlan && (
                                <>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                                        ¿Necesitás más créditos o funciones?
                                    </p>
                                    <button
                                        onClick={() => setIsModalOpen(true)}
                                        disabled={!isOwner}
                                        className={cn("btn-primary w-full max-w-50", !isOwner && "opacity-50 cursor-not-allowed")}
                                    >
                                        <FaRotate className="mr-2" />
                                        Cambiar Plan
                                    </button>
                                    <button
                                        onClick={() => setIsCancelModalOpen(true)}
                                        disabled={!isOwner}
                                        className={cn(
                                            "text-xs text-red-500 dark:text-red-400 hover:underline mt-1",
                                            !isOwner && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        Cancelar suscripción
                                    </button>
                                    {!isOwner && <p className="text-[10px] text-red-500">Solo el dueño puede modificar el plan</p>}
                                </>
                            )}

                            {/* Estado: sin plan (trial expirado o suscripción cancelada) */}
                            {(trialExpired || hasNoActivePlan) && (
                                <>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                                        {trialExpired
                                            ? "Tu período de prueba terminó. Elegí un plan para continuar."
                                            : "No tenés un plan activo. Elegí uno para restablecer el servicio."}
                                    </p>
                                    <button
                                        onClick={() => setIsModalOpen(true)}
                                        disabled={!isOwner}
                                        className={cn("btn-primary w-full max-w-50", !isOwner && "opacity-50 cursor-not-allowed")}
                                    >
                                        <FaArrowRight className="mr-2" />
                                        Suscribirme ahora
                                    </button>
                                    {!isOwner && <p className="text-[10px] text-red-500">Solo el dueño puede cambiar el plan</p>}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabla de Facturas */}
            <div className="space-y-4 pb-12">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Mis pagos</h2>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <Datatable
                        columns={columns}
                        records={invoices}
                        emptyState={{
                            text: "Aún no tienes facturas registradas.",
                        }}
                    />
                </div>
            </div>

            {/* ── Modal: Selección de Plan ──────────────────────────────────── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-110 bg-black/60 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
                    <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-w-4xl sm:rounded-2xl sm:max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in sm:zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Elegí tu plan</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2">
                                <FaCircleXmark size={20} />
                            </button>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto flex-1">
                            {!dbPlans ? (
                                <div className="col-span-full py-20 flex justify-center">
                                    <FaSpinner className="animate-spin text-primary text-3xl" />
                                </div>
                            ) : [...dbPlans].sort((a, b) => a.amount - b.amount).map((plan) => (
                                <div
                                    key={plan._id}
                                    className={cn(
                                        "relative flex flex-col p-6 rounded-2xl border-2 transition-all group",
                                        client?.plan === plan._id
                                            ? "border-primary bg-primary/5"
                                            : "border-slate-200 dark:border-slate-800 hover:border-primary/50"
                                    )}
                                >
                                    {client?.plan === plan._id && (
                                        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-primary text-white px-2 py-0.5 rounded-full">
                                            Actual
                                        </span>
                                    )}
                                    <div className="flex flex-col items-center text-center space-y-4 mb-6">
                                        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm text-3xl group-hover:scale-110 transition-transform text-primary">
                                            <IconComponent name={plan.icon} />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">{plan.name}</h4>
                                            <div className="flex flex-col items-center gap-1 mt-1">
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{plan.tokens.toLocaleString()} créditos</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-baseline justify-center gap-1 mb-6">
                                            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">${plan.amount}</span>
                                            <span className="text-sm text-slate-500 dark:text-slate-400">/ {plan.frequencyType === 'MONTHLY' ? 'Mes' : plan.frequencyType}</span>
                                        </div>

                                        <button
                                            onClick={() => handleUpdatePlan(plan)}
                                            disabled={client?.plan === plan._id}
                                            className={cn(
                                                "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                                                client?.plan === plan._id
                                                    ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
                                                    : "bg-primary text-white hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-95"
                                            )}
                                        >
                                            {plan.amount > 0 ? <><FaArrowRight /> Suscribirse</> : "Seleccionar"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Los planes de pago te redirigirán a dLocal Go de forma segura.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Confirmación de Cancelación ───────────────────────── */}
            {isCancelModalOpen && (
                <div className="fixed inset-0 z-110 bg-black/60 backdrop-blur-sm flex sm:items-center sm:justify-center sm:p-4">
                    <div className="bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:max-w-md sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in sm:zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                                <FaTriangleExclamation />
                                Cancelar suscripción
                            </h3>
                            <button
                                onClick={() => setIsCancelModalOpen(false)}
                                disabled={isCancelling}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2"
                            >
                                <FaCircleXmark size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                Estás a punto de cancelar tu suscripción a <strong>{currentPlan?.name}</strong>.
                            </p>
                            <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
                                <li>No se realizarán más cobros automáticos.</li>
                                <li>Tu canal de WhatsApp se desactivará en las próximas 24 horas.</li>
                                <li>Podés volver a suscribirte en cualquier momento.</li>
                            </ul>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Esta acción no puede deshacerse.
                            </p>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end shrink-0">
                            <button
                                onClick={() => setIsCancelModalOpen(false)}
                                disabled={isCancelling}
                                className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Volver
                            </button>
                            <button
                                onClick={handleCancelSubscription}
                                disabled={isCancelling}
                                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                            >
                                {isCancelling ? <FaSpinner className="animate-spin" /> : <FaCircleXmark />}
                                {isCancelling ? "Cancelando…" : "Confirmar cancelación"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
