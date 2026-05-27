import { api } from "convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { FaTrash, FaPlus, FaXmark, FaSpinner } from "react-icons/fa6";
import { toast } from "react-toastify";
import { cn } from "utils/utils";
import type { Id } from "convex/_generated/dataModel";
import { Link } from "react-router";

export default function ClientMembersModal({ 
    clientId, 
    isOpen, 
    onClose 
}: { 
    clientId: Id<"clients">;
    isOpen: boolean;
    onClose: () => void;
}) {
    const [selectedProfileId, setSelectedProfileId] = useState("");
    const [selectedRole, setSelectedRole] = useState<"owner" | "member">("member");
    const [isAdding, setIsAdding] = useState(false);

    // Queries
    const members = useQuery(api.clientMembers.getByClient, { clientId });
    const allProfiles = useQuery(api.profiles.list); // This might need pagination later

    // Mutations
    const addMember = useMutation(api.clientMembers.create);
    const removeMember = useMutation(api.clientMembers.remove);
    const updateMember = useMutation(api.clientMembers.update);

    // Filter profiles that are not already members
    const availableProfiles = useMemo(() => {
        if (!allProfiles || !members) return [];
        const memberProfileIds = members.map(m => m.profile);
        return allProfiles.filter(p => !memberProfileIds.includes(p._id));
    }, [allProfiles, members]);

    const handleAddMember = async () => {
        if (!selectedProfileId) {
            toast.error("Selecciona un usuario");
            return;
        }

        setIsAdding(true);
        try {
            await addMember({
                client: clientId,
                profile: selectedProfileId as Id<"profiles">,
                role: selectedRole
            });
            toast.success("Miembro agregado correctamente");
            setSelectedProfileId("");
            setSelectedRole("member");
        } catch (error) {
            toast.error("Error al agregar el miembro");
            console.error(error);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveMember = async (id: Id<"client_members">) => {
        if (!confirm("¿Estás seguro de remover a este miembro?")) return;

        try {
            await removeMember({ id });
            toast.success("Miembro removido correctamente");
        } catch (error) {
            toast.error("Error al remover el miembro");
            console.error(error);
        }
    };

    const handleUpdateRole = async (id: Id<"client_members">, role: "owner" | "member") => {
        try {
            await updateMember({ id, role });
            toast.success("Rol actualizado correctamente");
        } catch (error) {
            toast.error("Error al actualizar el rol");
            console.error(error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                        Miembros del Cliente
                    </h3>
                    <button 
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <FaXmark size={20} />
                    </button>
                </div>
                
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {/* Add new member section */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-4 border border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Agregar nuevo miembro</h4>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <select
                                value={selectedProfileId}
                                onChange={(e) => setSelectedProfileId(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="">Seleccionar usuario...</option>
                                {availableProfiles.map(profile => (
                                    <option key={profile._id} value={profile._id}>
                                        {profile.name} ({profile.email})
                                    </option>
                                ))}
                            </select>
                            
                            <select
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value as "owner" | "member")}
                                className="w-full sm:w-32 px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="member">Miembro</option>
                                <option value="owner">Dueño</option>
                            </select>
                            
                            <button
                                onClick={handleAddMember}
                                disabled={isAdding || !selectedProfileId}
                                className={cn(
                                    "btn-primary flex items-center justify-center px-4 py-2 text-sm whitespace-nowrap",
                                    (isAdding || !selectedProfileId) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                {isAdding ? <FaSpinner className="animate-spin mr-2" /> : <FaPlus className="mr-2" />}
                                Agregar
                            </button>
                        </div>
                    </div>

                    {/* Members List */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Miembros actuales</h4>
                        
                        {!members ? (
                            <div className="flex justify-center p-8">
                                <FaSpinner className="animate-spin text-primary text-2xl" />
                            </div>
                        ) : members.length === 0 ? (
                            <div className="text-center p-8 text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                                No hay miembros asignados a este cliente.
                            </div>
                        ) : (
                            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-700">
                                {members.map((member) => (
                                    <MemberRow
                                        key={member._id}
                                        member={member}
                                        onRemove={() => handleRemoveMember(member._id)}
                                        onChangeRole={(role) => handleUpdateRole(member._id, role)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Subcomponente para renderizar la fila con los datos del perfil
function MemberRow({
    member,
    onRemove,
    onChangeRole,
}: {
    member: any,
    onRemove: () => void,
    onChangeRole: (role: "owner" | "member") => Promise<void>,
}) {
    const profile = useQuery(api.profiles.getById, { id: member.profile });
    const [isUpdatingRole, setIsUpdatingRole] = useState(false);

    if (!profile) return null;

    const handleRoleChange = async (role: "owner" | "member") => {
        if (role === member.role) return;
        setIsUpdatingRole(true);
        try {
            await onChangeRole(role);
        } finally {
            setIsUpdatingRole(false);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
            <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    <Link to={`/administracion/usuarios/${profile._id}`}>{profile.name}</Link>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {profile.email}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <div className="relative">
                    <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(e.target.value as "owner" | "member")}
                        disabled={isUpdatingRole}
                        className={cn(
                            "text-xs font-medium pl-2.5 pr-7 py-1 rounded-full border-0 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors",
                            member.role === 'owner'
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                            isUpdatingRole && "opacity-60 cursor-wait"
                        )}
                    >
                        <option value="member">Miembro</option>
                        <option value="owner">Dueño</option>
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-current">
                        {isUpdatingRole ? (
                            <FaSpinner className="animate-spin w-2.5 h-2.5" />
                        ) : (
                            <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </span>
                </div>
                <button
                    onClick={onRemove}
                    className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remover miembro"
                >
                    <FaTrash size={14} />
                </button>
            </div>
        </div>
    );
}