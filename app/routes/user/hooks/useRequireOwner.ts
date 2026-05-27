import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";

/**
 * Redirige al panel si el usuario autenticado no es propietario (owner) de su cliente.
 * Úsalo en cualquier ruta exclusiva para propietarios.
 */
export function useRequireOwner() {
    const navigate = useNavigate();
    const userProfile = useQuery(api.profiles.me);
    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const isLoading = !userProfile || userClients === undefined;
    const isOwner = userClients?.[0]?.role === "owner";

    useEffect(() => {
        if (isLoading) return;
        if (!isOwner) {
            navigate("/panel", { replace: true });
        }
    }, [isLoading, isOwner, navigate]);

    return { isLoading, isOwner };
}
