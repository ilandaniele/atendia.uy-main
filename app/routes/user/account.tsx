import { api } from "convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "react-router";
import { useState } from "react";
import { FaGoogle, FaArrowRightFromBracket, FaTriangleExclamation, FaCircleCheck, FaRotateLeft, FaUserSecret } from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn } from "utils/utils";
import Breadcrumbs from "../admin/components/breadcrumbs";

export function meta() {
    return [{ title: "Mi Cuenta - Atendia" }];
}

export default function UserAccount() {
    const { signOut } = useAuthActions();
    const navigate = useNavigate();

    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );
    const activeClientMember = userClients?.[0];
    const isOwner = activeClientMember?.role === "owner";

    const client = useQuery(
        api.clients.get,
        activeClientMember ? { id: activeClientMember.client } : "skip"
    );

    const requestDeletion = useMutation(api.profiles.requestDeletion);
    const cancelDeletion = useMutation(api.profiles.cancelDeletion);
    const endImpersonation = useMutation(api.impersonation.end);

    const impersonation = useQuery(api.impersonation.getActive);
    const isImpersonating = !!impersonation;
    const blockedTitle = isImpersonating ? "No disponible durante la impersonación" : undefined;

    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExitingImpersonation, setIsExitingImpersonation] = useState(false);

    const handleExitImpersonation = async () => {
        setIsExitingImpersonation(true);
        try {
            await endImpersonation();
            toast.success("Sesión de impersonación terminada");
            navigate(`/administracion/usuarios/${impersonation?.targetProfile._id ?? ""}`);
        } catch {
            toast.error("No se pudo terminar la sesión");
            setIsExitingImpersonation(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        navigate("/");
    };

    const handleRequestDeletion = async () => {
        setIsSubmitting(true);
        try {
            await requestDeletion();
            toast.success("Tu cuenta ha sido programada para eliminación.");
            setConfirmDelete(false);
            await signOut();
            navigate("/ingreso");
        } catch {
            toast.error("Ocurrió un error. Intenta de nuevo.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelDeletion = async () => {
        setIsSubmitting(true);
        try {
            await cancelDeletion();
            toast.success("La eliminación de tu cuenta fue cancelada.");
        } catch {
            toast.error("Ocurrió un error. Intenta de nuevo.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!userProfile) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    const scheduledDeletionAt = userProfile.scheduledDeletionAt;
    const isDeletionScheduled = !!scheduledDeletionAt && scheduledDeletionAt > Date.now();
    const deletionDate = scheduledDeletionAt
        ? new Date(scheduledDeletionAt).toLocaleDateString("es-UY", { day: "numeric", month: "long", year: "numeric" })
        : null;
    const daysLeft = scheduledDeletionAt
        ? Math.ceil((scheduledDeletionAt - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

    const avatarSrc = userProfile.pictureUrl
        ?? `https://api.dicebear.com/7.x/initials/svg?seed=${userProfile.name}&backgroundColor=0ea5e9`;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-2xl">
            <Breadcrumbs
                items={[
                    { label: "Panel", href: "/panel" },
                    { label: "Mi Cuenta" },
                ]}
            />

            {/* Aviso de modo impersonación */}
            {isImpersonating && (
                <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-xl text-purple-700 dark:text-purple-400">
                    <FaUserSecret className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1 text-sm">
                        <p className="font-semibold">Estás viendo esta cuenta en modo impersonación</p>
                        <p className="mt-0.5 opacity-90">
                            Las acciones destructivas (cerrar sesión, eliminar o cancelar eliminación) están deshabilitadas. Para hacer cambios, salí del modo impersonación.
                        </p>
                    </div>
                    <button
                        onClick={handleExitImpersonation}
                        disabled={isExitingImpersonation}
                        className="shrink-0 text-xs font-semibold underline hover:no-underline disabled:opacity-50"
                    >
                        {isExitingImpersonation ? "Saliendo…" : "Salir"}
                    </button>
                </div>
            )}

            {/* Aviso de eliminación programada */}
            {isDeletionScheduled && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-amber-700 dark:text-amber-400">
                    <FaTriangleExclamation className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1 text-sm">
                        <p className="font-semibold">Tu cuenta está programada para eliminación</p>
                        <p className="mt-0.5 opacity-90">
                            Se eliminará el <strong>{deletionDate}</strong> ({daysLeft} día{daysLeft === 1 ? "" : "s"} restante{daysLeft === 1 ? "" : "s"}).
                            Si volvés a iniciar sesión antes de esa fecha, tu cuenta se reactivará automáticamente. Los datos operativos (conversaciones, pedidos, turnos) ya fueron eliminados.
                        </p>
                    </div>
                    <button
                        onClick={handleCancelDeletion}
                        disabled={isSubmitting || isImpersonating}
                        title={blockedTitle}
                        className="shrink-0 text-xs font-semibold underline hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {/* Perfil */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">Perfil</h2>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    {/* Avatar */}
                    <div className="shrink-0">
                        <img
                            src={avatarSrc}
                            alt={userProfile.name}
                            className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700 shadow-sm"
                            referrerPolicy="no-referrer"
                        />
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-3 text-center sm:text-left">
                        <div>
                            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{userProfile.name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{userProfile.email}</p>
                        </div>

                        {/* Google badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <FaGoogle className="text-[#4285F4]" />
                            Cuenta de Google conectada
                        </div>
                    </div>
                </div>

                {/* Acciones */}
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
                    <button
                        onClick={handleSignOut}
                        disabled={isImpersonating}
                        title={blockedTitle}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                        <FaArrowRightFromBracket className="w-4 h-4" />
                        Cerrar sesión
                    </button>
                </div>
            </div>

            {/* Zona de peligro */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-red-600 dark:text-red-500 mb-1">Zona de peligro</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    Acciones irreversibles o de alto impacto sobre tu cuenta.
                </p>

                <div className="space-y-4">
                    {isDeletionScheduled ? (
                        /* Ya solicitó eliminación → opción de cancelar */
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                            <div>
                                <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">
                                    Eliminación programada
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Tu cuenta se eliminará el {deletionDate}.
                                </p>
                            </div>
                            <button
                                onClick={handleCancelDeletion}
                                disabled={isSubmitting || isImpersonating}
                                title={blockedTitle}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                                <FaRotateLeft className="w-3.5 h-3.5" />
                                Cancelar eliminación
                            </button>
                        </div>
                    ) : confirmDelete ? (
                        /* Confirmación de eliminación */
                        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 space-y-3">
                            <div className="flex items-start gap-3">
                                <FaTriangleExclamation className="text-red-600 dark:text-red-500 w-4 h-4 mt-0.5 shrink-0" />
                                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
                                    <p className="font-semibold text-red-700 dark:text-red-400">¿Confirmar eliminación?</p>
                                    {isOwner ? (
                                        <>
                                            <p>Como <strong>propietario</strong> de <strong>{client?.businessName ?? "tu negocio"}</strong>, al confirmar:</p>
                                            <ul className="space-y-1 pl-1">
                                                <li className="flex items-start gap-2">
                                                    <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                                                    <span><strong>De inmediato</strong> se eliminarán todas las conversaciones, estados de conversación, pedidos y citas/turnos de todos tus canales.</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                                                    <span><strong>En 60 días</strong> se eliminará el resto: canales, asistentes, mi información, leads y tu cuenta completa, a menos que vuelvas a iniciar sesión.</span>
                                                </li>
                                            </ul>
                                        </>
                                    ) : (
                                        <p>Tu cuenta quedará <strong>inactiva por 60 días</strong>. Durante ese tiempo podés reactivarla iniciando sesión nuevamente.</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRequestDeletion}
                                    disabled={isSubmitting || isImpersonating}
                                    title={blockedTitle}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed",
                                        isSubmitting && "opacity-70 cursor-wait",
                                        isImpersonating && "opacity-50"
                                    )}
                                >
                                    {isSubmitting ? "Procesando..." : "Sí, eliminar mi cuenta"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Estado inicial */
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">
                                    Eliminar cuenta
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Tu cuenta quedará inactiva 60 días. Podés reactivarla iniciando sesión antes de que venza el plazo.
                                </p>
                            </div>
                            <button
                                onClick={() => setConfirmDelete(true)}
                                disabled={isImpersonating}
                                title={blockedTitle}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/50 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                                <FaTriangleExclamation className="w-3.5 h-3.5" />
                                Solicitar eliminación
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
