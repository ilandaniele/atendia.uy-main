import { useQuery } from "convex/react";
import { useLocation } from "react-router";
import { toast } from "react-toastify";
import { api } from "convex/_generated/api";

/**
 * Hook utilitario para listas del panel cuando hay una sesión de impersonación
 * activa. Expone un flag `enabled` y una función `copy(id)` que copia el id al
 * portapapeles y muestra un toast.
 *
 * No se habilita en /panel/cuenta — esa ruta no debe mostrar herramientas de
 * debugging según el requerimiento del producto.
 */
export function useDebugCopyId() {
    const impersonation = useQuery(api.impersonation.getActive);
    const location = useLocation();
    const isAccountPage = location.pathname === "/panel/cuenta";
    const enabled = !!impersonation && !isAccountPage;

    const copy = async (id: string, label?: string) => {
        try {
            await navigator.clipboard.writeText(id);
            toast.success(label ? `${label} copiado` : "ID copiado", { autoClose: 1500 });
        } catch {
            toast.error("No se pudo copiar al portapapeles");
        }
    };

    return { enabled, copy };
}
