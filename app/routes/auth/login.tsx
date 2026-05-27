import { Link, useSearchParams } from "react-router";
import { LogoSpark } from "logo";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { toast, ToastContainer } from "react-toastify";
import { useState, useEffect } from "react";
import { FaGoogle, FaCircleNotch, FaUserPlus, FaBan, FaTriangleExclamation } from "react-icons/fa6";

export function meta() {
    return [
        { title: "Atendia — Ingreso" },
        { name: "robots", content: "noindex, nofollow" },
    ];
}

export default function LoginPage() {
    const { signIn } = useAuthActions();
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get("invite");

    const blockedMsg = searchParams.get("blocked");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inviteTimeout, setInviteTimeout] = useState(false);

    const systemConfig = useQuery(api.systemConfig.get);
    const registrationOpen = systemConfig?.allowedRegistration ?? true;

    // Consulta pública: nombre del cliente al que pertenece la invitación
    const inviteInfo = useQuery(
        api.invites.getPublicInfo,
        inviteToken ? { token: inviteToken } : "skip"
    );

    // Si la verificación no responde en 4s, dejar pasar igual (validación real ocurre en callback)
    useEffect(() => {
        if (!inviteToken || inviteInfo !== undefined) return;
        const t = setTimeout(() => setInviteTimeout(true), 4000);
        return () => clearTimeout(t);
    }, [inviteToken, inviteInfo]);

    const handleGoogleLogin = async () => {
        setIsSubmitting(true);
        try {
            const redirectTo = inviteToken
                ? `/auth/callback?invite=${inviteToken}`
                : "/auth/callback";
            await signIn("google", { redirectTo });
        } catch (error: unknown) {
            console.error(error);
            toast.error("Error al iniciar sesión con Google");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-200 dark:from-slate-950 dark:to-slate-900 p-4 transition-colors duration-300">
            <ToastContainer position="top-center" autoClose={3000} hideProgressBar={false} newestOnTop closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="colored" />

            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-2xl">
                <div className="p-8 sm:p-10">
                    <div className="flex justify-center mb-8">
                        <LogoSpark className="h-16 w-auto" />
                    </div>

                    {/* Banner registro cerrado */}
                    {!registrationOpen && !inviteToken && (
                        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <FaTriangleExclamation className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                El registro de nuevas cuentas está desactivado temporalmente. Si ya tenés una cuenta podés iniciar sesión normalmente.
                            </p>
                        </div>
                    )}

                    {/* Banner cuenta bloqueada */}
                    {blockedMsg && (
                        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <FaBan className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-red-700 dark:text-red-300">{blockedMsg}</p>
                        </div>
                    )}

                    {/* Banner de invitación */}
                    {inviteToken && (
                        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
                            <FaUserPlus className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                {inviteInfo === undefined && !inviteTimeout
                                    ? "Verificando invitación..."
                                    : inviteInfo === null || inviteTimeout
                                        ? inviteTimeout && inviteInfo === undefined
                                            ? "No se pudo verificar la invitación. Puedes continuar igual."
                                            : "Esta invitación no es válida o ya fue utilizada."
                                        : <>Fuiste invitado a unirte a <strong>{inviteInfo?.clientName}</strong>. Inicia sesión para aceptar.</>
                                }
                            </p>
                        </div>
                    )}

                    <h1 className="text-2xl sm:text-3xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2 transition-colors">
                        Bienvenido
                    </h1>
                    <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-8 transition-colors">
                        Inicia sesión para acceder a la plataforma
                    </p>

                    <div className="space-y-4">
                        <button
                            type="button"
                            onClick={handleGoogleLogin}
                            disabled={isSubmitting || (inviteToken !== null && inviteInfo === null && !inviteTimeout)}
                            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <FaCircleNotch className="animate-spin h-5 w-5 text-slate-500" />
                            ) : (
                                <FaGoogle className="h-5 w-5 text-red-500" />
                            )}
                            <span>Continuar con Google</span>
                        </button>
                    </div>

                    <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                        Al continuar, aceptás los{" "}
                        <Link to="/terminos-y-condiciones" className="underline hover:text-primary transition-colors">
                            Términos y condiciones
                        </Link>{" "}
                        y la{" "}
                        <Link to="/politica-de-privacidad" className="underline hover:text-primary transition-colors">
                            Política de privacidad
                        </Link>{" "}
                        de Atendia.
                    </p>

                    <div className="mt-6 text-center border-t border-slate-100 dark:border-slate-800 pt-6">
                        <Link to="/" className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors block">
                            Volver al inicio
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
