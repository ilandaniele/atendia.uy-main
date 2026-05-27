import { api } from "convex/_generated/api"
import { useQuery } from "convex/react"
import { Link, useNavigate } from "react-router";
import Datatable from "../components/datatable";
import type { DataTableColumn } from "mantine-datatable";
import PageHeader from "../components/page-header";
import Breadcrumbs from "../components/breadcrumbs";

const columns: DataTableColumn[] = [
    {
        accessor: "name",
        title: "Nombre",
        textAlign: "center"
    },
    {
        accessor: "email",
        title: "Correo electrónico",
        textAlign: "center"
    },
    {
        accessor: "role",
        title: "Rol",
        render: ({ role }) => {
            const roles: Record<string, string> = {
                admin: "Administrador",
                user: "Usuario",
            };
            return roles[role as string] ?? role;
        }
    },
    {
        accessor: "_creationTime",
        title: "Registro",
        render: ({ _creationTime }) => {
            const date = new Date(_creationTime as any);
            return date.toLocaleDateString("es-UY", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        }
    }
];

export function meta() {
    return [
        { title: "Atendia — Administración — Usuarios" }
    ];
}

export default function AdminUsers() {
    const navigate = useNavigate();

    const profiles = useQuery(api.profiles.list);

    return (
        <div className="w-full">
            <Breadcrumbs 
                items={[
                    { label: "Usuarios" }
                ]} 
            />
            <PageHeader
                title="Usuarios"
                button={{
                    href: "nuevo",
                    text: "Crear usuario"
                }}
            />
            <Datatable
                columns={columns}
                records={profiles}
                onRowClick={(record) => {
                    navigate(record._id)
                }}
                emptyState={{
                    text: "No hay usuarios para mostrar...",
                    onClick: () => navigate("nuevo")
                }}
            />
        </div>
    )
}