import { api } from "convex/_generated/api";
import type { Doc, Id } from "convex/_generated/dataModel";
import { useAuthToken } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { FaSpinner, FaTrash, FaUserSecret } from "react-icons/fa6";
import {
    Link,
    redirect,
    useActionData,
    useLoaderData,
    useNavigate,
    useSearchParams,
    useSubmit,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { toast, ToastContainer } from "react-toastify";
import { cn, getEnv } from "utils/utils";
import z from "zod";
import Breadcrumbs from "../components/breadcrumbs";

interface LoaderData {
    profile: Doc<"profiles"> | null;
    isNew: boolean;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

// Para edición: sólo rol y estado son mutables
const editSchema = z.object({
    id: z.string(),
    role: z.enum(["admin", "user"], { message: "El rol es obligatorio" }),
    status: z.enum(["active", "inactive", "suspended"]).default("active"),
});

// Para creación manual: nombre + email + rol (Google completará la foto/nombre real al primer login)
const createSchema = z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    email: z.email("El correo electrónico no es válido"),
    role: z.enum(["admin", "user"], { message: "El rol es obligatorio" }),
});

// ─── Loader ───────────────────────────────────────────────────────────────────

export function meta() {
    return [{ title: "Atendia — Administración — Usuario" }];
}

export async function loader({ params }: LoaderFunctionArgs) {
    const { id } = params;

    if (!id || id === "nuevo") {
        return { profile: null, isNew: true } satisfies LoaderData;
    }

    const convex = new ConvexHttpClient(getEnv("VITE_CONVEX_URL")!);
    const profile = await convex.query(api.profiles.getById, { id: id as Id<"profiles"> });
    if (!profile) throw new Response("Perfil no encontrado", { status: 404 });

    return { profile, isNew: false } satisfies LoaderData;
}

// ─── Action ───────────────────────────────────────────────────────────────────

function convexErrorMessage(error: any): string {
    const raw: string = error?.message ?? "Ocurrió un error inesperado";
    const match = raw.match(/Uncaught Error:\s*(.+)/);
    return match ? match[1].trim() : raw;
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const authToken = formData.get("authToken") as string | null;
    const raw = Object.fromEntries(formData);
    const convex = new ConvexHttpClient(getEnv("VITE_CONVEX_URL")!);
    if (authToken) convex.setAuth(authToken);

    // Edit path
    if (raw.id) {
        const parsed = editSchema.safeParse(raw);
        if (!parsed.success) {
            const errors: Record<string, string> = {};
            parsed.error.issues.forEach((i) => { errors[i.path.join(".")] = i.message; });
            return { errors };
        }
        const { id, role, status } = parsed.data;
        try {
            await convex.mutation(api.profiles.update, {
                id: id as Id<"profiles">,
                role: role as "admin" | "user",
                status: status as "active" | "inactive" | "suspended",
            });
            return redirect(`/administracion/usuarios/${id}?updated=true`);
        } catch (err: any) {
            return { formError: convexErrorMessage(err) };
        }
    }

    // Create path
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
        const errors: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errors[i.path.join(".")] = i.message; });
        return { errors };
    }
    const { name, email, role } = parsed.data;
    try {
        const existing = await convex.query(api.profiles.getByEmail, { email });
        if (existing) return { errors: { email: "El correo ya está registrado por otro usuario" } };

        const profileId = await convex.mutation(api.profiles.create, {
            name,
            email,
            role: role as "admin" | "user",
        });
        return redirect(`/administracion/usuarios/${profileId}`);
    } catch (err: any) {
        return { formError: convexErrorMessage(err) };
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const READONLY_INPUT = "block w-full px-4 py-3 rounded-xl border border-transparent text-sm bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default";
const EDITABLE_INPUT = "block w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary placeholder-slate-400 dark:placeholder-slate-500";
const EDITABLE_SELECT = "block w-full px-4 py-3 rounded-xl border text-sm appearance-none transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-primary";
const DISABLED_SELECT = "block w-full px-4 py-3 rounded-xl border border-transparent text-sm appearance-none bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default opacity-80";

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{children}</label>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{children}</p>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserDetail() {
    const loaderData = useLoaderData<LoaderData>();
    const actionData = useActionData<{ errors?: Record<string, string>; formError?: string }>();
    const [searchParams] = useSearchParams();

    const authToken = useAuthToken();
    const isNew = loaderData.isNew;
    const mode = searchParams.get("mode");

    // Detect if we're looking at ourselves (client-side)
    const me = useQuery(api.profiles.me);
    const isCurrentUser = !isNew && !!me && !!loaderData.profile && me._id === loaderData.profile._id;

    // isEditable: never for self, always for new, depends on ?mode=edit for others
    const isEditable = !isCurrentUser && (isNew || mode === "edit");

    const [isLoading, setIsLoading] = useState(false);
    const [role, setRole] = useState(loaderData.profile?.role ?? "");
    const [status, setStatus] = useState<string>((loaderData.profile as any)?.status ?? "active");
    const [isDeleting, setIsDeleting] = useState(false);

    // Creation-only fields
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const formRef = useRef<HTMLFormElement>(null);
    const submit = useSubmit();
    const removeProfile = useMutation(api.profiles.remove);
    const startImpersonation = useMutation(api.impersonation.start);
    const navigate = useNavigate();
    const [isTakingControl, setIsTakingControl] = useState(false);

    const targetStatus = (loaderData.profile as Doc<"profiles"> | null)?.status ?? "active";
    const canImpersonate =
        !isNew &&
        !isCurrentUser &&
        !!loaderData.profile &&
        loaderData.profile.role === "user" &&
        targetStatus === "active";

    const handleTakeControl = async () => {
        if (!loaderData.profile) return;
        setIsTakingControl(true);
        try {
            await startImpersonation({ targetProfileId: loaderData.profile._id });
            toast.success("Sesión de impersonación iniciada");
            navigate("/panel");
        } catch (err: any) {
            toast.error(convexErrorMessage(err));
            setIsTakingControl(false);
        }
    };

    useEffect(() => {
        if (actionData?.errors) {
            Object.values(actionData.errors).forEach((e) => toast.error(e));
            setIsLoading(false);
        }
        if (actionData?.formError) {
            toast.error(actionData.formError);
            setIsLoading(false);
        }
    }, [actionData]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(formRef.current!);
        if (!formData.get("role") && role) formData.append("role", role);
        if (!formData.get("status") && status) formData.append("status", status);
        if (authToken) formData.set("authToken", authToken);

        submit(formData, { method: "POST" });
    };

    const handleDelete = async () => {
        if (!loaderData.profile) return;
        if (!globalThis.confirm("¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.")) return;

        setIsDeleting(true);
        try {
            await removeProfile({ id: loaderData.profile._id });
            toast.success("Usuario eliminado correctamente");
            globalThis.location.href = "/administracion/usuarios";
        } catch {
            toast.error("Hubo un error al eliminar el usuario");
            setIsDeleting(false);
        }
    };

    const profile = loaderData.profile;
    const title = isNew ? "Crear usuario" : (isEditable ? "Editar usuario" : "Ver usuario");

    return (
        <div className="w-full flex justify-center items-start min-h-[calc(100vh-100px)] py-10">
            <ToastContainer position="top-right" theme="colored" />

            <div className="w-full max-w-2xl px-4">
                <Breadcrumbs
                    items={[
                        { label: "Usuarios", href: "/administracion/usuarios" },
                        { label: isNew ? "Nuevo" : (profile?.name ?? "Detalle") },
                    ]}
                />

                {/* Header */}
                <div className="flex items-center justify-between mb-8 gap-3">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
                    <div className="flex items-center gap-2">
                        {canImpersonate && !isEditable && (
                            <button
                                type="button"
                                onClick={handleTakeControl}
                                disabled={isTakingControl}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors",
                                    isTakingControl && "opacity-50 cursor-wait"
                                )}
                                title="Operar el panel del usuario aplicando sus permisos reales"
                            >
                                {isTakingControl ? (
                                    <FaSpinner className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <FaUserSecret className="h-3.5 w-3.5" />
                                )}
                                Tomar control
                            </button>
                        )}
                        {!isNew && !isCurrentUser && !isEditable && (
                            <Link to="?mode=edit" className="btn-primary no-underline">
                                Editar usuario
                            </Link>
                        )}
                        {!isNew && !isCurrentUser && isEditable && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors",
                                    isDeleting && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <FaTrash className="h-3.5 w-3.5" />
                                Eliminar
                            </button>
                        )}
                    </div>
                </div>

                {/* Notice for self */}
                {isCurrentUser && (
                    <div className="mb-6 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                        No podés editar ni eliminar tu propia cuenta desde aquí.
                    </div>
                )}

                <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-6">
                    {profile?._id && <input type="hidden" name="id" value={profile._id} />}

                    {/* ── Nombre ── */}
                    <div className="space-y-1.5">
                        <FieldLabel>
                            Nombre
                            {!isNew && (
                                <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                                    (sincronizado desde Google)
                                </span>
                            )}
                        </FieldLabel>
                        {isNew ? (
                            <input
                                name="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nombre completo"
                                required
                                className={EDITABLE_INPUT}
                            />
                        ) : (
                            <div className="flex items-center gap-3">
                                {profile?.pictureUrl && (
                                    <img
                                        src={profile.pictureUrl}
                                        alt={profile.name}
                                        className="h-9 w-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                    />
                                )}
                                <input
                                    type="text"
                                    value={profile?.name ?? ""}
                                    readOnly
                                    disabled
                                    className={`${READONLY_INPUT} flex-1`}
                                />
                            </div>
                        )}
                    </div>

                    {/* ── Correo ── */}
                    <div className="space-y-1.5">
                        <FieldLabel>
                            Correo electrónico
                            <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                                {isNew ? "(se usará para vincular la cuenta de Google)" : "(gestionado por Google)"}
                            </span>
                        </FieldLabel>
                        {isNew ? (
                            <input
                                name="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="usuario@ejemplo.com"
                                required
                                className={EDITABLE_INPUT}
                            />
                        ) : (
                            <input
                                type="email"
                                value={profile?.email ?? ""}
                                readOnly
                                disabled
                                className={READONLY_INPUT}
                            />
                        )}
                    </div>

                    {/* ── Rol ── */}
                    <div className="space-y-1.5">
                        <FieldLabel>Rol</FieldLabel>
                        <select
                            name="role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            disabled={!isEditable}
                            className={isEditable ? EDITABLE_SELECT : DISABLED_SELECT}
                        >
                            <option value="" disabled>Seleccioná un rol</option>
                            <option value="user">Usuario</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>

                    {/* ── Estado ── (sólo en edición/vista, no en creación) */}
                    {!isNew && (
                        <div className="space-y-1.5">
                            <FieldLabel>Estado de la cuenta</FieldLabel>
                            <select
                                name="status"
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                disabled={!isEditable}
                                className={isEditable ? EDITABLE_SELECT : DISABLED_SELECT}
                            >
                                <option value="active">Activo</option>
                                <option value="inactive">Inactivo</option>
                                <option value="suspended">Suspendido</option>
                            </select>
                            {isEditable && status !== "active" && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                    ⚠ El usuario no podrá iniciar sesión mientras su cuenta no esté Activa.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Actions ── */}
                    {isEditable && !isDeleting && (
                        <div className="pt-4 flex items-center justify-end gap-4">
                            {!isNew && (
                                <Link
                                    to="."
                                    className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                                >
                                    Cancelar
                                </Link>
                            )}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={cn("btn-primary min-w-30", isLoading && "opacity-70 cursor-wait")}
                            >
                                {isLoading ? (
                                    <>
                                        <FaSpinner className="animate-spin mr-2" />
                                        Guardando...
                                    </>
                                ) : "Guardar"}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
