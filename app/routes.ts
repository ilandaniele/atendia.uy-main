import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
    // Widget de chat: layout mínimo sin auth ni Mantine
    layout("layouts/chat.layout.tsx", [
        route("/chat/:token", "routes/chat/chatWidget.tsx"),
    ]),

    // Embed script — sirve el JS con VITE_SITE_URL inyectado
    route("/widget/v1/atendia-widget.js", "routes/api/widget-script.ts"),

    // API
    ...prefix("api", [
        route("/test", "routes/api/test.ts"),
        route("/media/:channelId/:mediaId", "routes/api/media.ts"),
        // Google Calendar
        ...prefix("google-calendar", [
            route("auth", "routes/api/google-calendar/auth.ts"),
            route("callback", "routes/api/google-calendar/callback.ts"),
            route("exchange", "routes/api/google-calendar/exchange.ts"),
        ]),
        // Google Drive
        ...prefix("google-drive", [
            route("auth", "routes/api/google-drive/auth.ts"),
            route("callback", "routes/api/google-drive/callback.ts"),
            route("exchange", "routes/api/google-drive/exchange.ts"),
        ]),
        ...prefix("webhooks", [
            route("/whapi/:channelId", "routes/api/webhooks/whapi.ts"),
            route("/dlocal", "routes/api/webhooks/dlocal.ts"),
        ]),
    ]),

    // Resto de la app: ConvexAuthProvider + Mantine
    layout("layouts/app.layout.tsx", [
        // Autenticación
        layout("layouts/auth.layout.tsx", [
            route("ingreso", "routes/auth/login.tsx"),
            route("auth/callback", "routes/auth/callback.tsx"),
        ]),

        // Páginas públicas
        layout("layouts/public.layout.tsx", [
            index("routes/public/index.tsx"),
            route("terminos-y-condiciones", "routes/public/terms-and-conditions.tsx"),
            route("politica-de-privacidad", "routes/public/privacy-policy.tsx"),
            route("contacto", "routes/public/contact-us.tsx"),
            route("planes", "routes/public/plans.tsx"),
            route("*", "routes/public/not-found.tsx"),
        ]),

        // Administración
        ...prefix("administracion", [
            layout("layouts/admin.layout.tsx", [
                index("routes/admin/index.tsx"),

                ...prefix("usuarios", [
                    index("routes/admin/users/index.tsx"),
                    route("/nuevo", "routes/admin/users/detail.tsx", { id: "create_user" }),
                    route("/:id", "routes/admin/users/detail.tsx", { id: "edit_user" }),
                ]),

                ...prefix("clientes", [
                    index("routes/admin/clients/index.tsx"),
                    route("/nuevo", "routes/admin/clients/detail.tsx", { id: "create_client" }),
                    route("/:id", "routes/admin/clients/detail.tsx", { id: "edit_client" }),

                    ...prefix("/:clientId/asistentes", [
                        index("routes/admin/clients/assistants/index.tsx"),
                        route("/nuevo", "routes/admin/clients/assistants/detail.tsx", { id: "create_assistant" }),
                        route("/:id", "routes/admin/clients/assistants/detail.tsx", { id: "edit_assistant" }),

                        ...prefix("/:assistantId/canales", [
                            index("routes/admin/clients/assistants/channels/index.tsx"),
                            route("/nuevo", "routes/admin/clients/assistants/channels/detail.tsx", { id: "create_channel" }),
                            route("/:id", "routes/admin/clients/assistants/channels/detail.tsx", { id: "edit_channel" }),
                        ]),

                        ...prefix("/:assistantId/contactos", [
                            index("routes/admin/clients/assistants/contacts/index.tsx"),
                            route("/nuevo", "routes/admin/clients/assistants/contacts/detail.tsx", { id: "create_contact" }),
                            route("/:id", "routes/admin/clients/assistants/contacts/detail.tsx", { id: "edit_contact" }),
                        ]),
                    ]),

                    ...prefix("/:clientId/bases", [
                        index("routes/admin/clients/knowledge-bases/index.tsx"),
                        route("/nuevo", "routes/admin/clients/knowledge-bases/detail.tsx", { id: "create_knowledge_base" }),
                        route("/:id", "routes/admin/clients/knowledge-bases/detail.tsx", { id: "edit_knowledge_base" }),
                    ]),
                ]),

                ...prefix("planes", [
                    index("routes/admin/plans/index.tsx"),
                    route("/nuevo", "routes/admin/plans/detail.tsx", { id: "create_plan" }),
                    route("/:id", "routes/admin/plans/detail.tsx", { id: "edit_plan" }),
                ]),

                ...prefix("terminos", [
                    index("routes/admin/terms/index.tsx"),
                    route("/nueva", "routes/admin/terms/detail.tsx", { id: "create_terms" }),
                    route("/:id", "routes/admin/terms/detail.tsx", { id: "edit_terms" }),
                ]),

                ...prefix("privacidad", [
                    index("routes/admin/privacy/index.tsx"),
                    route("/nueva", "routes/admin/privacy/detail.tsx", { id: "create_privacy" }),
                    route("/:id", "routes/admin/privacy/detail.tsx", { id: "edit_privacy" }),
                ]),

                ...prefix("preguntas-frecuentes", [
                    index("routes/admin/faq/index.tsx"),
                    route("/nueva", "routes/admin/faq/detail.tsx", { id: "create_faq" }),
                    route("/:id", "routes/admin/faq/detail.tsx", { id: "edit_faq" }),
                ]),

                ...prefix("tickets", [
                    index("routes/admin/tickets/index.tsx"),
                    route("/:id", "routes/admin/tickets/detail.tsx", { id: "ticket_detail" }),
                ]),

                ...prefix("/formularios-de-contacto", [
                    index("routes/admin/contact-forms/index.tsx"),
                    route("/:id", "routes/admin/contact-forms/detail.tsx")
                ]),

                ...prefix("facturacion", [
                    index("routes/admin/billing/index.tsx"),
                ]),

                ...prefix("uso-tokens", [
                    index("routes/admin/token-usage/index.tsx"),
                ]),

                route("debug-live", "routes/admin/debug-live/index.tsx"),

                route("configuracion-sistema", "routes/admin/system-config/index.tsx"),
            ]),
        ]),

        // Panel de usuario
        ...prefix("panel", [
            layout("layouts/user.layout.tsx", [
                index("routes/user/index.tsx"),
                route("agenda", "routes/user/agenda.tsx"),
                route("asistentes", "routes/user/assistants.tsx"),
                route("canales", "routes/user/channels.tsx"),
                route("clientes-potenciales", "routes/user/leads.tsx"),
                route("configuracion", "routes/user/settings.tsx"),
                route("cuenta", "routes/user/account.tsx"),
                route("mensajes", "routes/user/chats.tsx"),
                route("bases-de-conocimiento", "routes/user/knowledge-bases.tsx"),
                route("contactos/:assistantId", "routes/user/contacts.tsx"),
                route("pedidos", "routes/user/orders.tsx"),
                route("reportes", "routes/user/reports.tsx"),

                ...prefix("facturacion", [
                    index("routes/user/billing/index.tsx"),
                ]),

                ...prefix("soporte", [
                    index("routes/user/support/index.tsx"),
                    route("preguntas-frecuentes", "routes/user/support/faq.tsx"),
                    route("tickets", "routes/user/support/tickets.tsx"),
                ]),
            ]),
        ]),
    ]),
] satisfies RouteConfig;
