import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "convex/_generated/api";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { FaSpinner } from "react-icons/fa6";

export default function AuthCallback() {
    const { isAuthenticated, isLoading } = useConvexAuth();
    const { signOut } = useAuthActions();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get("invite");

    const profile = useQuery(api.profiles.me);

    const createProfile = useMutation(api.profiles.createMyProfile);
    const consumeInvite = useMutation(api.invites.consume);

    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [creationError, setCreationError] = useState<string | null>(null);

    useEffect(() => {
        if (isLoading) return;
        if (creationError) return;

        if (!isAuthenticated) {
            navigate("/ingreso");
            return;
        }

        if (profile === undefined) return; // aún cargando

        const redirectAfterInvite = async (profileId: string) => {
            if (inviteToken) {
                try {
                    await consumeInvite({ token: inviteToken, profileId: profileId as any });
                } catch (err) {
                    // Si el token es inválido/expirado, simplemente continuar
                    console.warn("Invite consume failed:", err);
                }
            }
        };

        if (profile) {
            // Verificar estado de la cuenta
            const status = profile.status ?? "active";
            if (status === "inactive" || status === "suspended") {
                const msg = status === "suspended"
                    ? "Tu cuenta ha sido suspendida. Contactá al administrador."
                    : "Tu cuenta está inactiva. Contactá al administrador para reactivarla.";
                signOut().finally(() => navigate(`/ingreso?blocked=${encodeURIComponent(msg)}`));
                return;
            }

            // Perfil existente — consumir invitación si la hay y redirigir
            redirectAfterInvite(profile._id).then(() => {
                if (profile.role === "admin") {
                    navigate("/administracion");
                } else {
                    navigate("/panel");
                }
            });
        } else if (!isCreatingProfile) {
            setIsCreatingProfile(true);
            createProfile({ inviteToken: inviteToken ?? undefined })
                .then(async (newProfile) => {
                    if (newProfile) {
                        await redirectAfterInvite(newProfile._id);
                        navigate("/panel");
                    }
                })
                .catch((err) => {
                    console.error("Error creando perfil:", err);
                    setCreationError(err.message || "Error al crear perfil");
                    setIsCreatingProfile(false);
                });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, isAuthenticated, profile, isCreatingProfile, creationError]);

    if (creationError) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
                <p className="text-red-500 font-medium mb-4">Error: {creationError}</p>
                <button
                    onClick={() => navigate("/ingreso")}
                    className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                >
                    Volver al ingreso
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <FaSpinner className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Verificando cuenta...</p>
        </div>
    );
}
