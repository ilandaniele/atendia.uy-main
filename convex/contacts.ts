import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireClientAccess } from "./authHelpers";
import { normalizePhone, detectCountryISO, tryParseIntl, type SupportedCountry } from "./phoneUtils";
import { normalizeEmail } from "./emailUtils";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function verifyAssistantAccess(ctx: MutationCtx | QueryCtx, assistantId: Id<"assistants">) {
    const assistant = await ctx.db.get(assistantId);
    if (!assistant) throw new Error("Asistente no encontrado");
    await requireClientAccess(ctx, assistant.client);
    return assistant;
}

// ─── Queries ───────────────────────────────────────────────────────────────────

export const getByAssistant = query({
    args: {
        assistantId: v.id("assistants"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { assistantId, paginationOpts }) => {
        await verifyAssistantAccess(ctx, assistantId);
        return await ctx.db
            .query("contacts")
            .withIndex("by_assistant", q => q.eq("assistantId", assistantId))
            .paginate(paginationOpts);
    },
});

export const searchByAssistant = query({
    args: {
        assistantId: v.id("assistants"),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
    },
    handler: async (ctx, { assistantId, name, phone, email }) => {
        await verifyAssistantAccess(ctx, assistantId);
        const all = await ctx.db
            .query("contacts")
            .withIndex("by_assistant", q => q.eq("assistantId", assistantId))
            .collect();

        const phoneRaw = phone?.trim() ?? "";
        const phoneDigits = phoneRaw.replace(/\D/g, "");
        const emailLower = email ? email.toLowerCase() : "";

        return all.filter(c => {
            const matchName = name ? c.name.toLowerCase().includes(name.toLowerCase()) : true;
            const matchEmail = emailLower ? (c.email ?? "").includes(emailLower) : true;

            let matchPhone = true;
            if (phoneRaw) {
                const stored = c.phone ?? "";
                if (phoneDigits && stored.includes(phoneDigits)) {
                    matchPhone = true;
                } else if (stored) {
                    const country = detectCountryISO(stored);
                    const parsed = tryParseIntl(phoneRaw, country ? [country] : undefined);
                    matchPhone = parsed === stored;
                } else {
                    matchPhone = false;
                }
            }
            return matchName && matchPhone && matchEmail;
        });
    },
});

export const countByAssistant = query({
    args: { assistantId: v.id("assistants") },
    handler: async (ctx, { assistantId }) => {
        await verifyAssistantAccess(ctx, assistantId);
        const all = await ctx.db
            .query("contacts")
            .withIndex("by_assistant", q => q.eq("assistantId", assistantId))
            .collect();
        return all.length;
    },
});

export const getByClientForPhones = query({
    args: {
        clientId: v.id("clients"),
        phones: v.array(v.string()),
    },
    handler: async (ctx, { clientId, phones }) => {
        await requireClientAccess(ctx, clientId);
        if (phones.length === 0) return [];

        const assistants = await ctx.db
            .query("assistants")
            .withIndex("by_client", q => q.eq("client", clientId))
            .collect();

        const uniquePhones = Array.from(new Set(phones.map(p => p.split("@")[0]).filter(Boolean)));
        if (uniquePhones.length === 0) return [];

        const lookups = assistants.flatMap(a =>
            uniquePhones.map(phone =>
                ctx.db
                    .query("contacts")
                    .withIndex("by_assistant_and_phone", q =>
                        q.eq("assistantId", a._id).eq("phone", phone)
                    )
                    .first()
            )
        );
        const results = await Promise.all(lookups);
        return results.filter((c): c is NonNullable<typeof c> => c !== null);
    },
});

export const getAllByAssistant = internalQuery({
    args: { assistantId: v.id("assistants") },
    handler: async (ctx, { assistantId }) => {
        return await ctx.db
            .query("contacts")
            .withIndex("by_assistant", q => q.eq("assistantId", assistantId))
            .collect();
    },
});

export const getByAssistantAndPhone = internalQuery({
    args: {
        assistantId: v.id("assistants"),
        phone: v.string(),
    },
    handler: async (ctx, { assistantId, phone }) => {
        return await ctx.db
            .query("contacts")
            .withIndex("by_assistant_and_phone", q =>
                q.eq("assistantId", assistantId).eq("phone", phone)
            )
            .first();
    },
});

/**
 * Smart phone lookup: parses the raw input against each contact's country
 * (detected from the stored international format) and returns the contact
 * whose stored phone matches the parsed result.
 *
 * Lets the AI find a contact when the user types a local number like "092123123"
 * or "3155427956" without knowing the country in advance.
 */
export const findByAssistantAndRawPhone = internalQuery({
    args: {
        assistantId: v.id("assistants"),
        rawPhone: v.string(),
    },
    handler: async (ctx, { assistantId, rawPhone }) => {
        const trimmed = rawPhone.trim();
        if (!trimmed) return null;

        const directIntl = tryParseIntl(trimmed);
        if (directIntl) {
            const exact = await ctx.db
                .query("contacts")
                .withIndex("by_assistant_and_phone", q =>
                    q.eq("assistantId", assistantId).eq("phone", directIntl)
                )
                .first();
            if (exact) return exact;
        }

        // Also try a raw digit-only exact match — handles inputs that are already
        // in international format but without a "+" (e.g. "573155427956").
        const trimmedDigits = trimmed.split("@")[0].replace(/\D/g, "");
        if (trimmedDigits) {
            const exactDigits = await ctx.db
                .query("contacts")
                .withIndex("by_assistant_and_phone", q =>
                    q.eq("assistantId", assistantId).eq("phone", trimmedDigits)
                )
                .first();
            if (exactDigits) return exactDigits;
        }

        const all = await ctx.db
            .query("contacts")
            .withIndex("by_assistant", q => q.eq("assistantId", assistantId))
            .collect();

        for (const contact of all) {
            if (!contact.phone) continue;
            const country = detectCountryISO(contact.phone);
            if (!country) continue;
            const parsed = tryParseIntl(trimmed, [country]);
            if (parsed === contact.phone) return contact;
        }
        return null;
    },
});

export const getByAssistantAndEmail = internalQuery({
    args: {
        assistantId: v.id("assistants"),
        email: v.string(),
    },
    handler: async (ctx, { assistantId, email }) => {
        return await ctx.db
            .query("contacts")
            .withIndex("by_assistant_and_email", q =>
                q.eq("assistantId", assistantId).eq("email", email)
            )
            .first();
    },
});

// ─── Mutations ─────────────────────────────────────────────────────────────────

export const create = mutation({
    args: {
        assistantId: v.id("assistants"),
        name: v.string(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        extras: v.optional(v.record(v.string(), v.string())),
        countryHint: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await verifyAssistantAccess(ctx, args.assistantId);

        const rawPhone = args.phone?.trim() ?? "";
        const rawEmail = args.email?.trim() ?? "";
        if (!rawPhone && !rawEmail) {
            throw new Error("Debés indicar un teléfono o un email.");
        }

        const phone = rawPhone
            ? normalizePhone(rawPhone, args.countryHint as SupportedCountry | undefined)
            : undefined;
        const email = rawEmail ? normalizeEmail(rawEmail) : undefined;

        if (phone) {
            const dup = await ctx.db
                .query("contacts")
                .withIndex("by_assistant_and_phone", q =>
                    q.eq("assistantId", args.assistantId).eq("phone", phone)
                )
                .first();
            if (dup) throw new Error("Ya existe un contacto con ese teléfono para este asistente.");
        }
        if (email) {
            const dup = await ctx.db
                .query("contacts")
                .withIndex("by_assistant_and_email", q =>
                    q.eq("assistantId", args.assistantId).eq("email", email)
                )
                .first();
            if (dup) throw new Error("Ya existe un contacto con ese email para este asistente.");
        }

        return await ctx.db.insert("contacts", {
            assistantId: args.assistantId,
            name: args.name.trim(),
            phone,
            email,
            extras: args.extras,
        });
    },
});

export const update = mutation({
    args: {
        id: v.id("contacts"),
        name: v.optional(v.string()),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        extras: v.optional(v.record(v.string(), v.string())),
        countryHint: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const contact = await ctx.db.get(args.id);
        if (!contact) throw new Error("Contacto no encontrado");
        await verifyAssistantAccess(ctx, contact.assistantId);

        const patch: {
            name?: string;
            phone?: string | undefined;
            email?: string | undefined;
            extras?: Record<string, string>;
        } = {};
        if (args.name !== undefined) patch.name = args.name.trim();
        if (args.extras !== undefined) patch.extras = args.extras;

        let nextPhone: string | undefined = contact.phone;
        let nextEmail: string | undefined = contact.email;

        if (args.phone !== undefined) {
            const raw = args.phone.trim();
            if (raw) {
                const phone = normalizePhone(raw, args.countryHint as SupportedCountry | undefined);
                if (phone !== contact.phone) {
                    const dup = await ctx.db
                        .query("contacts")
                        .withIndex("by_assistant_and_phone", q =>
                            q.eq("assistantId", contact.assistantId).eq("phone", phone)
                        )
                        .first();
                    if (dup) throw new Error("Ya existe un contacto con ese teléfono para este asistente.");
                    patch.phone = phone;
                    nextPhone = phone;
                }
            } else if (contact.phone !== undefined) {
                patch.phone = undefined;
                nextPhone = undefined;
            }
        }

        if (args.email !== undefined) {
            const raw = args.email.trim();
            if (raw) {
                const email = normalizeEmail(raw);
                if (email !== contact.email) {
                    const dup = await ctx.db
                        .query("contacts")
                        .withIndex("by_assistant_and_email", q =>
                            q.eq("assistantId", contact.assistantId).eq("email", email)
                        )
                        .first();
                    if (dup) throw new Error("Ya existe un contacto con ese email para este asistente.");
                    patch.email = email;
                    nextEmail = email;
                }
            } else if (contact.email !== undefined) {
                patch.email = undefined;
                nextEmail = undefined;
            }
        }

        if (!nextPhone && !nextEmail) {
            throw new Error("El contacto debe conservar un teléfono o un email.");
        }

        await ctx.db.patch(args.id, patch);
    },
});

export const remove = mutation({
    args: { id: v.id("contacts") },
    handler: async (ctx, { id }) => {
        const contact = await ctx.db.get(id);
        if (!contact) throw new Error("Contacto no encontrado");
        await verifyAssistantAccess(ctx, contact.assistantId);
        await ctx.db.delete(id);
    },
});

export const removeBatch = mutation({
    args: { ids: v.array(v.id("contacts")) },
    handler: async (ctx, { ids }) => {
        if (ids.length === 0) return { removed: 0 };
        const first = await ctx.db.get(ids[0]);
        if (!first) return { removed: 0 };
        await verifyAssistantAccess(ctx, first.assistantId);
        let removed = 0;
        for (const id of ids) {
            const c = await ctx.db.get(id);
            if (c?.assistantId === first.assistantId) {
                await ctx.db.delete(id);
                removed++;
            }
        }
        return { removed };
    },
});

export const removeAll = mutation({
    args: { assistantId: v.id("assistants") },
    handler: async (ctx, { assistantId }) => {
        await verifyAssistantAccess(ctx, assistantId);
        const all = await ctx.db
            .query("contacts")
            .withIndex("by_assistant", q => q.eq("assistantId", assistantId))
            .collect();
        for (const c of all) {
            await ctx.db.delete(c._id);
        }
        return { removed: all.length };
    },
});

export const importBatch = mutation({
    args: {
        assistantId: v.id("assistants"),
        contacts: v.array(v.object({
            name: v.string(),
            phone: v.optional(v.string()),
            email: v.optional(v.string()),
            extras: v.optional(v.record(v.string(), v.string())),
        })),
        countryHint: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await verifyAssistantAccess(ctx, args.assistantId);
        const country = args.countryHint as SupportedCountry | undefined;

        let ok = 0;
        let updated = 0;
        let skipped = 0;

        for (const item of args.contacts) {
            const rawPhone = item.phone?.trim() ?? "";
            const rawEmail = item.email?.trim() ?? "";
            const name = item.name.trim();
            if (!name || (!rawPhone && !rawEmail)) { skipped++; continue; }

            // Si vienen ambos, priorizamos phone como identidad (regla acordada).
            let phone: string | undefined;
            let email: string | undefined;
            try {
                if (rawPhone) phone = normalizePhone(rawPhone, country);
                else if (rawEmail) email = normalizeEmail(rawEmail);
            } catch {
                skipped++;
                continue;
            }

            const existing = phone
                ? await ctx.db
                    .query("contacts")
                    .withIndex("by_assistant_and_phone", q =>
                        q.eq("assistantId", args.assistantId).eq("phone", phone)
                    )
                    .first()
                : await ctx.db
                    .query("contacts")
                    .withIndex("by_assistant_and_email", q =>
                        q.eq("assistantId", args.assistantId).eq("email", email!)
                    )
                    .first();

            const now = Date.now();
            if (existing) {
                await ctx.db.patch(existing._id, { name, extras: item.extras, updatedAt: now });
                updated++;
            } else {
                await ctx.db.insert("contacts", {
                    assistantId: args.assistantId,
                    name,
                    phone,
                    email,
                    extras: item.extras,
                    updatedAt: now,
                });
                ok++;
            }
        }

        return { ok, updated, skipped };
    },
});

/**
 * Upsert genérico usado por la IA para guardar leads/contactos automáticamente.
 * Identidad: phone (si viene) o email (si viene). Al menos uno requerido.
 */
export const upsert = internalMutation({
    args: {
        assistantId: v.id("assistants"),
        name: v.string(),
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
    },
    handler: async (ctx, { assistantId, name, phone, email }) => {
        if (!phone && !email) return;
        const now = Date.now();
        const existing = phone
            ? await ctx.db
                .query("contacts")
                .withIndex("by_assistant_and_phone", q =>
                    q.eq("assistantId", assistantId).eq("phone", phone)
                )
                .first()
            : await ctx.db
                .query("contacts")
                .withIndex("by_assistant_and_email", q =>
                    q.eq("assistantId", assistantId).eq("email", email!)
                )
                .first();
        if (existing) {
            await ctx.db.patch(existing._id, { name, updatedAt: now });
        } else {
            await ctx.db.insert("contacts", { assistantId, name, phone, email, updatedAt: now });
        }
    },
});
