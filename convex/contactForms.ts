import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./authHelpers";

/** Solo admin: lista todos los formularios de contacto. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        await requireAdmin(ctx);
        return await ctx.db
            .query("contact_forms")
            .order("desc")
            .collect();
    },
});

/** Solo admin: retorna un formulario por ID. */
export const get = query({
    args: { id: v.id("contact_forms") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        return await ctx.db.get(id);
    },
});

/** Internal: inserta el registro tras verificar reCAPTCHA. */
export const createInternal = internalMutation({
    args: {
        name: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        address: v.optional(v.string()),
        company: v.optional(v.string()),
        subject: v.string(),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("contact_forms", {
            ...args,
            status: "new",
        });
    },
});

/** Pública: envía un formulario de contacto verificando reCAPTCHA Enterprise. */
export const create = action({
    args: {
        name: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        address: v.optional(v.string()),
        company: v.optional(v.string()),
        subject: v.string(),
        message: v.string(),
        recaptchaToken: v.string(),
    },
    handler: async (ctx, { recaptchaToken, ...formData }): Promise<Id<"contact_forms">> => {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const apiKey = process.env.GOOGLE_RECAPTCHA_API_KEY;
        const siteKey = process.env.GOOGLE_RECAPTCHA_ID;

        if (!projectId || !apiKey || !siteKey) {
            throw new Error("Configuración de reCAPTCHA incompleta en el servidor.");
        }

        const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event: { token: recaptchaToken, siteKey, expectedAction: "contact_form" },
            }),
        });

        if (!res.ok) {
            throw new Error("Error al verificar reCAPTCHA.");
        }

        const assessment = await res.json();

        if (!assessment.tokenProperties?.valid) {
            throw new Error(`Token de reCAPTCHA inválido: ${assessment.tokenProperties?.invalidReason}`);
        }

        const score: number = assessment.riskAnalysis?.score ?? 0;
        if (score < 0.5) {
            throw new Error("Verificación de seguridad fallida. Por favor, intentá de nuevo.");
        }

        return await ctx.runMutation(internal.contactForms.createInternal, formData);
    },
});

/** Solo admin: actualiza el estado de un formulario. */
export const updateStatus = mutation({
    args: {
        id: v.id("contact_forms"),
        status: v.union(
            v.literal("new"),
            v.literal("read"),
            v.literal("replied"),
            v.literal("archived")
        ),
    },
    handler: async (ctx, { id, status }) => {
        await requireAdmin(ctx);
        await ctx.db.patch(id, { status });
    },
});

/** Solo admin: guarda una nota de respuesta. */
export const saveAdminNote = mutation({
    args: {
        id: v.id("contact_forms"),
        adminNote: v.string(),
    },
    handler: async (ctx, { id, adminNote }) => {
        await requireAdmin(ctx);
        await ctx.db.patch(id, { adminNote, status: "replied" });
    },
});

/** Solo admin: elimina un formulario. */
export const remove = mutation({
    args: { id: v.id("contact_forms") },
    handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        await ctx.db.delete(id);
    },
});
