"use node";

import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { google } from "googleapis";
import type { Doc, Id } from "./_generated/dataModel";
import xlsx from "node-xlsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MINUTES = 15;
const MIN_RECHECK_GAP_MS = 30 * 1000;
const MAX_CHUNK_LEN = 1000;

const MIME_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME_EXCEL_OLD = "application/vnd.ms-excel";
const MIME_GSHEET = "application/vnd.google-apps.spreadsheet";
const MIME_GDOC = "application/vnd.google-apps.document";
const MIME_PDF = "application/pdf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    );
}

/** Accepts a raw Drive file ID OR any common Drive sharing URL. */
function extractDriveFileId(input: string): string | null {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
    const docsMatch = trimmed.match(
        /docs\.google\.com\/(?:spreadsheets|document|presentation)\/d\/([a-zA-Z0-9_-]+)/,
    );
    if (docsMatch) return docsMatch[1];
    const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];
    const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (openMatch) return openMatch[1];
    return null;
}

function kindForMimeType(mime: string): "excel" | "gsheet" | "gdoc" | "pdf" | null {
    if (mime === MIME_EXCEL || mime === MIME_EXCEL_OLD) return "excel";
    if (mime === MIME_GSHEET) return "gsheet";
    if (mime === MIME_GDOC) return "gdoc";
    if (mime === MIME_PDF) return "pdf";
    return null;
}

// PDF parsing is deferred to v2: pdfjs-dist (used by pdf-parse) requires
// DOM globals (DOMMatrix, ImageData, Path2D) that Convex's Node runtime
// does not provide. Re-enable once a Node-only PDF text extractor is added.
const PDF_SUPPORTED = false;

/** Pack paragraphs into <=maxLen chunks; hard-split paragraphs that exceed maxLen. */
function chunkText(text: string, maxLen = MAX_CHUNK_LEN): string[] {
    const paragraphs = text
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
    const chunks: string[] = [];
    let cur = "";
    for (const p of paragraphs) {
        if (cur.length + p.length + 2 <= maxLen) {
            cur = cur ? `${cur}\n\n${p}` : p;
        } else {
            if (cur) chunks.push(cur);
            if (p.length <= maxLen) {
                cur = p;
            } else {
                for (let i = 0; i < p.length; i += maxLen) {
                    chunks.push(p.slice(i, i + maxLen));
                }
                cur = "";
            }
        }
    }
    if (cur) chunks.push(cur);
    return chunks;
}

async function fetchFileMetadata(refreshToken: string, fileId: string) {
    const auth = makeOAuth2Client();
    auth.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,modifiedTime,webViewLink",
        supportsAllDrives: true,
    });
    return res.data;
}

async function downloadFileBytes(refreshToken: string, fileId: string): Promise<Buffer> {
    const auth = makeOAuth2Client();
    auth.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
}

async function exportFileBytes(
    refreshToken: string,
    fileId: string,
    mimeType: string,
): Promise<Buffer> {
    const auth = makeOAuth2Client();
    auth.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.export(
        { fileId, mimeType },
        { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
}

// ─── Public action: link a Drive file ─────────────────────────────────────────

export const linkFile = action({
    args: {
        clientId: v.id("clients"),
        knowledgeBaseId: v.id("knowledge_bases"),
        driveUrlOrId: v.string(),
    },
    handler: async (
        ctx,
        { clientId, knowledgeBaseId, driveUrlOrId },
    ): Promise<{ ok: true; linkId: Id<"linked_drive_files"> } | { ok: false; error: string }> => {
        const profile = await ctx.runQuery(api.profiles.me);
        if (!profile) return { ok: false, error: "no_auth" };
        if (!profile.googleDriveRefreshToken || !profile.googleDriveEnabled) {
            return { ok: false, error: "drive_not_connected" };
        }

        const kb = await ctx.runQuery(api.knowledgeBases.get, { id: knowledgeBaseId });
        if (!kb || kb.client !== clientId) {
            return { ok: false, error: "knowledge_base_not_found" };
        }

        const fileId = extractDriveFileId(driveUrlOrId);
        if (!fileId) return { ok: false, error: "invalid_url" };

        let meta;
        try {
            meta = await fetchFileMetadata(profile.googleDriveRefreshToken, fileId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            return { ok: false, error: `drive_fetch_failed: ${msg}` };
        }
        if (!meta.mimeType) return { ok: false, error: "no_mime_type" };
        const fileKind = kindForMimeType(meta.mimeType);
        if (!fileKind) return { ok: false, error: `unsupported_mime: ${meta.mimeType}` };
        if (fileKind === "pdf" && !PDF_SUPPORTED) return { ok: false, error: "pdf_unsupported" };

        const linkId: Id<"linked_drive_files"> = await ctx.runMutation(
            internal.googleDriveDb.insertLinkInternal,
            {
                client: clientId,
                linkedByProfile: profile._id,
                knowledgeBase: knowledgeBaseId,
                driveFileId: fileId,
                driveFileName: meta.name ?? "(sin nombre)",
                driveMimeType: meta.mimeType,
                driveWebViewLink: meta.webViewLink ?? undefined,
                fileKind,
            },
        );

        await ctx.scheduler.runAfter(0, internal.googleDrive.syncSingleFile, { linkId });
        return { ok: true, linkId };
    },
});

// `manualSync` lives in googleDriveDb.ts (mutation) so it can gate on
// requireClientAccess from QueryCtx. The mutation schedules
// internal.googleDrive.syncSingleFile, which is exported below.

// ─── Cron entry point ─────────────────────────────────────────────────────────

export const dispatchDriveSyncs = internalAction({
    args: {},
    handler: async (ctx) => {
        const clients: Array<Doc<"clients">> = await ctx.runQuery(
            internal.googleDriveDb.getClientsWithActiveLinksInternal,
        );
        const now = Date.now();
        for (const client of clients) {
            const intervalMin = client.config.driveSyncIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
            const lastDispatch = client.config.driveLastDispatchAt ?? 0;
            const elapsedMin = (now - lastDispatch) / 60000;
            if (elapsedMin < intervalMin) continue;
            await ctx.runMutation(internal.googleDriveDb.updateClientDispatchInternal, {
                clientId: client._id,
            });
            await ctx.scheduler.runAfter(0, internal.googleDrive.syncForClient, {
                clientId: client._id,
            });
        }
    },
});

export const syncForClient = internalAction({
    args: { clientId: v.id("clients") },
    handler: async (ctx, { clientId }) => {
        const links: Array<Doc<"linked_drive_files">> = await ctx.runQuery(
            internal.googleDriveDb.getActiveLinksByClientInternal,
            { clientId },
        );
        for (const link of links) {
            await ctx.scheduler.runAfter(0, internal.googleDrive.syncSingleFile, {
                linkId: link._id,
            });
        }
    },
});

export const syncSingleFile = internalAction({
    args: { linkId: v.id("linked_drive_files") },
    handler: async (ctx, { linkId }) => {
        const link: Doc<"linked_drive_files"> | null = await ctx.runQuery(
            internal.googleDriveDb.getLinkByIdInternal,
            { linkId },
        );
        if (!link || !link.isActive) return;

        if (link.lastCheckedAt && Date.now() - link.lastCheckedAt < MIN_RECHECK_GAP_MS) return;

        const owner: Doc<"profiles"> | null = await ctx.runQuery(
            internal.googleDriveDb.getProfileByIdInternal,
            { profileId: link.linkedByProfile },
        );
        if (!owner?.googleDriveRefreshToken || !owner.googleDriveEnabled) {
            await ctx.runMutation(internal.googleDriveDb.setSyncErrorInternal, {
                linkId,
                error: "owner desconectó Google Drive",
            });
            return;
        }

        let meta;
        try {
            meta = await fetchFileMetadata(owner.googleDriveRefreshToken, link.driveFileId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            await ctx.runMutation(internal.googleDriveDb.setSyncErrorInternal, {
                linkId,
                error: `metadata: ${msg}`,
            });
            return;
        }

        const remoteMTime = meta.modifiedTime ?? "";
        if (remoteMTime && link.lastSyncedModifiedTime === remoteMTime) {
            await ctx.runMutation(internal.googleDriveDb.markCheckedInternal, { linkId });
            return;
        }

        try {
            const chunks = await ingestForKind(owner.googleDriveRefreshToken, link);
            await ctx.runMutation(internal.googleDriveDb.replaceChunksForDriveFileInternal, {
                knowledgeBase: link.knowledgeBase,
                driveFileId: link.driveFileId,
                chunks,
                sourceLabel: `drive:${link.driveFileName}`,
            });
            await ctx.runMutation(internal.googleDriveDb.markSyncedInternal, {
                linkId,
                modifiedTime: remoteMTime,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            await ctx.runMutation(internal.googleDriveDb.setSyncErrorInternal, {
                linkId,
                error: `ingest: ${msg}`,
            });
        }
    },
});

// ─── Ingestion ───────────────────────────────────────────────────────────────

async function ingestForKind(
    refreshToken: string,
    link: Doc<"linked_drive_files">,
): Promise<string[]> {
    switch (link.fileKind) {
        case "excel": {
            const buf = await downloadFileBytes(refreshToken, link.driveFileId);
            return spreadsheetToRows(buf);
        }
        case "gsheet": {
            const buf = await exportFileBytes(refreshToken, link.driveFileId, MIME_EXCEL);
            return spreadsheetToRows(buf);
        }
        case "gdoc": {
            const buf = await exportFileBytes(refreshToken, link.driveFileId, "text/plain");
            return chunkText(buf.toString("utf-8"));
        }
        case "pdf": {
            throw new Error("PDF support is not yet available in this environment");
        }
    }
}

function spreadsheetToRows(buffer: Buffer): string[] {
    const sheets = xlsx.parse(buffer);
    const nonEmptySheets = sheets.filter((s) => {
        const data = s.data as unknown[][] | undefined;
        return Array.isArray(data) && data.length > 1;
    });
    const multiSheet = nonEmptySheets.length > 1;
    const rows: string[] = [];
    for (const sheet of nonEmptySheets) {
        const data = sheet.data as unknown[][];
        const header = (data[0] ?? []).map((c) => String(c ?? "").trim());
        const sheetName = String(sheet.name ?? "").trim();
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.every((c) => c == null || c === "")) continue;
            const lines: string[] = [];
            // Label each row with its source tab when the workbook has multiple
            // tabs — gives the AI enough context to tell "Stock: 10 (Inventario)"
            // apart from "Stock: 10 (Pedidos)".
            if (multiSheet && sheetName) {
                lines.push(`Hoja: ${sheetName}`);
            }
            for (let j = 0; j < header.length; j++) {
                const val = row[j];
                if (val == null || val === "") continue;
                lines.push(`${header[j]}: ${String(val)}`);
            }
            if (lines.length > 0) rows.push(lines.join("\n"));
        }
    }
    return rows;
}
