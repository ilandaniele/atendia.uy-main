# Google Drive File Sync — Specification

## 1. Objective

Allow Atendia users to link files stored in their personal Google Drive directly into the platform (Excel sheets, Google Sheets, Google Docs, PDFs). Atendia should automatically detect changes to those files in Drive and re-ingest the latest version on a configurable polling interval, eliminating manual re-uploads.

## 2. Scope

### In scope (v1)
- OAuth-based "Connect Google Drive" flow, decoupled from login auth, scoped under user settings.
- Per-client (multi-tenant) linking of Drive files. Owner/member who connected sets up; other client members benefit.
- Supported file types:
  - `.xlsx` / `.xls` (Excel) → parsed via `node-xlsx` → `knowledge_chunks` (one chunk per row)
  - `application/vnd.google-apps.spreadsheet` (Google Sheets) → exported as `.xlsx` → same pipeline
  - `application/vnd.google-apps.document` (Google Docs) → exported as `text/plain` → chunked text → `knowledge_chunks`
  - **PDF: deferred to v2.** `pdfjs-dist` (the engine behind every Node PDF text extractor) requires DOM globals (`DOMMatrix`, `ImageData`, `Path2D`) that Convex's Node runtime does not provide. Module load fails. To re-enable: either run PDF extraction in a separate worker/service, or wait for a Convex-runtime-compatible Node PDF library. UI surfaces `pdf_unsupported` if a user tries to link one.
- Configurable polling interval per client (5, 15, 30, 60 min; default 15).
- Manual "Sync now" button per linked file.
- Drive file picker via Drive URL/ID paste (Google Picker API is out of scope — too much surface area for v1).
- UI: new `google_drive` section in `app/routes/user/settings.tsx` `NAV_SECTIONS`.

### Out of scope (v1)
- Drive Push Notifications (webhooks) — requires public URL, blocks local dev.
- Folder sync (only individual files).
- Writing back to Drive.
- Google Slides, images, videos.
- File picker UI via Google Picker API.
- Permission-share UI (caller must have read access; we don't manage Drive ACLs).
- Per-knowledge-base file routing — for v1, the linker picks the target knowledge base from a dropdown at link time.

## 3. User stories

**US1**: As a client owner, I connect my Google Drive once from settings; my refresh token is stored on my profile so future syncs run without re-consent.

**US2**: As a client owner or member, I link a Google Drive file (by pasting its URL) to a specific knowledge base; Atendia downloads + ingests it immediately.

**US3**: As a client owner, I configure how often Atendia checks for Drive updates (5/15/30/60 min) for my client.

**US4**: As a client owner, I see a list of linked Drive files with: file name, type, target knowledge base, last sync timestamp, last sync status (success/error), and a "Sync now" button.

**US5**: As a client owner, I unlink a Drive file; the historical ingested data stays, but future syncs stop.

**US6**: As a client owner, I disconnect my Drive account entirely; the refresh token is wiped and all linked files become inactive.

## 4. Acceptance criteria (Gherkin)

### AC1: Connect Drive

```gherkin
GIVEN a logged-in client owner with no Drive connection
WHEN they navigate to /panel/configuracion → Google Drive tab
AND click "Conectar Google Drive"
AND complete the Google consent flow granting drive.readonly
THEN their profile has googleDriveRefreshToken populated
AND the tab shows their connected Drive email + a "Desconectar" button
AND a "Linked files" empty-state is visible
```

### AC2: Link a file by URL

```gherkin
GIVEN a connected user on the Google Drive tab
WHEN they paste a Drive file URL (e.g. https://docs.google.com/spreadsheets/d/<id>/edit)
AND select a target knowledge base from the dropdown
AND click "Vincular"
THEN Atendia extracts the file ID from the URL
AND calls Drive API to fetch file metadata (name, mimeType, modifiedTime)
AND inserts a row in linked_drive_files
AND triggers an immediate sync (download + ingest into the target knowledge base)
AND the file appears in the linked files list with "Sincronizado ahora" status
```

### AC3: Auto-sync on Drive change

```gherkin
GIVEN a linked Drive file with lastSyncedModifiedTime = T1
AND the user edits the Drive file at T2 > T1
WHEN the per-client cron fires (configurable interval)
THEN Atendia calls Drive API to check modifiedTime
AND because T2 > T1, downloads the new version
AND re-ingests it (replacing previous chunks for that file)
AND updates lastSyncedModifiedTime = T2
AND updates lastSyncedAt = now
AND increments syncCount
```

### AC4: No-op when unchanged

```gherkin
GIVEN a linked Drive file with lastSyncedModifiedTime = T1
AND the Drive file has NOT been modified since T1
WHEN the per-client cron fires
THEN Atendia calls Drive API only for metadata (cheap, ~1KB)
AND skips download + re-ingest
AND updates lastCheckedAt = now (NOT lastSyncedAt)
AND syncCount is unchanged
```

### AC5: Configurable polling interval

```gherkin
GIVEN a client owner on the Google Drive tab
WHEN they change "Frecuencia de sincronización" from "15 min" to "5 min"
AND click save
THEN client.config.driveSyncIntervalMinutes = 5
AND the next cron tick for this client checks at the new interval
```

### AC6: Manual sync now

```gherkin
GIVEN a linked Drive file in the list
WHEN the user clicks "Sincronizar ahora"
THEN Atendia immediately triggers syncFile for that file
AND the row's status flips to "Sincronizando..." then to "Sincronizado ahora" on success
```

### AC7: Permission revoked at Drive

```gherkin
GIVEN a linked Drive file
AND the user has revoked Atendia's Drive access in their Google account settings
WHEN the cron attempts to sync
THEN the Drive API call returns 401/403
AND lastSyncError is set on the linked_drive_files row
AND the row displays "Error: acceso revocado — reconectar" in the UI
AND the file is NOT auto-unlinked (user must explicitly unlink or reconnect)
```

### AC8: Disconnect Drive

```gherkin
GIVEN a connected user with N linked files
WHEN they click "Desconectar Google Drive"
THEN profile.googleDriveRefreshToken is cleared
AND profile.googleDriveEnabled = false
AND all linked_drive_files for this client (linked by this profile) have isActive = false
AND future cron runs skip these files
AND the historical ingested chunks remain (not deleted)
```

### AC9: Multi-tenant isolation

```gherkin
GIVEN Client A's owner has connected Drive and linked file F1
AND Client B's owner has also connected Drive
WHEN Client B queries the linked files list
THEN they see only their own linked files (not F1)
AND requireClientAccess gates every query/mutation
```

## 5. Schema changes

### 5.1 Extend `profiles` schema (`convex/schemas/profile.schema.ts`)

Add optional fields:

```typescript
googleDriveRefreshToken: v.optional(v.string()),
googleDriveEnabled: v.optional(v.boolean()),
googleDriveEmail: v.optional(v.string()),
googleDriveConnectedAt: v.optional(v.number()),
```

(Mirrors the Calendar fields already present.)

### 5.2 Extend `clients.config` (used in `convex/schemas/client.schema.ts`)

The `config` field is `v.object({})` currently — extend its inline shape (or in the validator if typed):

```typescript
config: v.object({
    // ... existing fields
    driveSyncIntervalMinutes: v.optional(
        v.union(v.literal(5), v.literal(15), v.literal(30), v.literal(60))
    ),
}),
```

Default at read time: `15` minutes if unset.

### 5.3 New table: `linked_drive_files`

New file: `convex/schemas/linked-drive-file.schema.ts`:

```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const LinkedDriveFileSchema = defineTable({
    client: v.id("clients"),
    linkedByProfile: v.id("profiles"),
    knowledgeBase: v.id("knowledge_bases"),

    driveFileId: v.string(),
    driveFileName: v.string(),
    driveMimeType: v.string(),
    driveWebViewLink: v.optional(v.string()),

    fileKind: v.union(
        v.literal("excel"),
        v.literal("gsheet"),
        v.literal("gdoc"),
        v.literal("pdf"),
    ),

    isActive: v.boolean(),

    lastSyncedModifiedTime: v.optional(v.string()), // RFC3339 from Drive
    lastSyncedAt: v.optional(v.number()),           // ms timestamp
    lastCheckedAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    syncCount: v.number(),

    excelImportId: v.optional(v.id("excel_imports")), // for spreadsheets
})
    .index("by_client", ["client"])
    .index("by_client_and_active", ["client", "isActive"])
    .index("by_drive_file_id", ["driveFileId"])
    .index("by_profile", ["linkedByProfile"]);
```

Register in `convex/schema.ts`.

## 6. OAuth scope additions

Mirror the existing Calendar OAuth flow.

### 6.1 Env vars (Convex deployment)

| Var | Purpose |
|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth Web Application client ID. Can be the SAME credential as `GOOGLE_CALENDAR_CLIENT_ID` — just needs Drive scope added to the consent screen. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth Web Application client secret. Same as Calendar if reusing. |

### 6.2 Scope requested

```
https://www.googleapis.com/auth/drive.readonly
```

Read-only is sufficient. We never write to Drive in v1.

### 6.3 Routes (mirror Calendar pattern)

- `app/routes/api/google-drive/auth.ts` — initiates OAuth, sets CSRF nonce cookie, redirects to Google
- `app/routes/api/google-drive/callback.ts` — handles redirect from Google, validates nonce, exchanges code for refresh token, stores on profile
- `app/routes/api/google-drive/exchange.ts` — if needed for token refresh flows

### 6.4 Manual setup (user must do in Google Cloud Console)

In the same OAuth consent screen as Calendar:
- Add scope: `https://www.googleapis.com/auth/drive.readonly`
- Add Authorized redirect URI: `${VITE_SITE_URL}/api/google-drive/callback`
  - For local dev: `http://localhost:5173/api/google-drive/callback`

## 7. Sync mechanism

### 7.1 Cron job

Add to `convex/crons.ts`:

```typescript
crons.interval(
    "drive sync — fire every 5 min, dispatch per-client based on their interval",
    { minutes: 5 },
    internal.googleDrive.dispatchDriveSyncs,
);
```

`dispatchDriveSyncs` (internal action) iterates active clients with at least one active linked file, checks whether each client is due (now - lastClientSyncRunAt >= driveSyncIntervalMinutes), and schedules `internal.googleDrive.syncForClient` per due client.

### 7.2 Per-client sync action (`internal.googleDrive.syncForClient`)

For each active `linked_drive_files` row in the client:
1. Fetch a fresh access token using the profile's refresh token.
2. Call Drive API: `files.get?fields=id,modifiedTime,name`.
3. If `modifiedTime` <= `lastSyncedModifiedTime`: update `lastCheckedAt`, skip.
4. Otherwise: route to the per-`fileKind` ingestion path:
   - `excel` / `gsheet`: download via `files/export` (Sheets) or `files/<id>?alt=media` (Excel) → run through `internal.excelImports.startImportFromBuffer` (a new shim around existing logic that accepts a Buffer instead of file upload).
   - `gdoc`: export `text/plain` → `internal.googleDrive.ingestTextIntoKnowledgeBase`.
   - `pdf`: download `application/pdf` → `pdf-parse` → text chunks → ingest into knowledge base.
5. Update `lastSyncedAt`, `lastSyncedModifiedTime`, increment `syncCount`, clear `lastSyncError`.
6. On any error: store error in `lastSyncError`, do NOT increment `syncCount`.

### 7.3 Rate limiting

- Drive API quota: 1B requests/day per project (effectively unlimited for this use case).
- Limit: per client, max 1 concurrent sync; per file, max 1 concurrent sync (lock via row mutation).

## 8. File parsing strategy

| File kind | Drive download path | Parser | Target table |
|---|---|---|---|
| Excel | `files/<id>?alt=media` | `node-xlsx` (already in deps) via existing `excelImports.ts` shim | `excel_imports` + `excel_import_rows` |
| Google Sheets | `files/<id>/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `node-xlsx` | `excel_imports` + `excel_import_rows` |
| Google Docs | `files/<id>/export?mimeType=text/plain` | none (already text) → chunk to 1000-char windows | `knowledge_chunks` (+ `knowledge_embeddings`) |
| PDF | `files/<id>?alt=media` | **`pdf-parse`** (new dep) → text → chunk | `knowledge_chunks` (+ `knowledge_embeddings`) |

### New dependency

None for the v1 shipped scope. PDF support (deferred) would have required `pdf-parse`, but it doesn't load in the Convex Node runtime (pdfjs DOM globals issue), so we removed it.

## 9. UI specification

### 9.1 Settings tab

Add to `NAV_SECTIONS` in `app/routes/user/settings.tsx:53`:

```typescript
{ id: "google_drive", label: "Google Drive", Icon: FaGoogleDrive },
```

`FaGoogleDrive` from `react-icons/fa6`.

### 9.2 Tab content (when `activeSection === "google_drive"`)

**Section A: Connection**
- If not connected: "Conectar Google Drive" button → `GET /api/google-drive/auth?profileId=<id>`
- If connected: shows `googleDriveEmail` + "Desconectar" button

**Section B: Frecuencia de sincronización** (owner-only, gated by `isOwner`)
- Dropdown: 5 min / 15 min / 30 min / 60 min (default 15)
- Save on change via `clients.update` mutation

**Section C: Archivos vinculados**
- Table: file name | type icon | knowledge base | last sync | status | actions
- "Vincular nuevo archivo" button → modal with:
  - Drive URL input field (e.g. paste `https://docs.google.com/spreadsheets/d/.../edit`)
  - Knowledge base dropdown (load via `api.knowledgeBases.getByClient`)
  - "Vincular" button → calls `api.googleDrive.linkFile`
- Per-row actions: "Sincronizar ahora" + "Desvincular"

## 10. Edge cases

| Case | Behavior |
|---|---|
| Drive URL malformed | Validation error in UI before submit |
| Drive file deleted at source | Sync returns 404 → set `lastSyncError = "file not found at source"`, mark inactive after 3 consecutive 404s |
| File MIME type changes (e.g. Doc converted to Sheet) | Sync detects mismatch → flag `lastSyncError`, require manual unlink+relink |
| Knowledge base deleted while file linked | Cascade: linked_drive_files for that KB become inactive |
| Refresh token revoked at Google | All sync attempts return 401 → set `lastSyncError`, do NOT auto-disconnect |
| Two users in same client both connect Drive and link same file | Both rows exist (different `linkedByProfile`); both sync independently. Acceptable for v1; dedup in v2 |
| Excel file with >50k rows | Inherits existing `excel_imports` chunking; no additional limit |
| Concurrent sync triggered (manual + cron) | Lock via lastCheckedAt: if updated within last 30s, skip cron-triggered |
| Sheets with multiple tabs | Existing Excel parser handles multi-sheet; same applies |

## 11. Security considerations

- **OAuth state CSRF**: nonce stored in HttpOnly cookie, validated in callback (same pattern as Calendar).
- **Refresh token storage**: stored on `profiles.googleDriveRefreshToken`. Profiles are only readable by their owner via `requireAuth`. Never exposed in any public query.
- **Scope minimization**: `drive.readonly` only, NOT `drive` or `drive.file`. Cannot modify or delete user's Drive files.
- **Multi-tenant isolation**: `requireClientAccess(ctx, clientId)` on all queries/mutations that touch `linked_drive_files`. Tested in AC9.
- **File content boundaries**: ingested content goes into the chosen knowledge base; KB is already client-scoped.
- **Token leakage to logs**: never log refresh or access tokens. Log only `driveFileId`, `lastSyncError` messages.
- **Drive URL parsing**: regex extracts file ID; reject if no match. Prevents arbitrary URL fetches.

## 12. File path checklist

### New files (12)

- `convex/schemas/linked-drive-file.schema.ts`
- `convex/googleDrive.ts` (actions: connect/disconnect, linkFile, syncForClient, dispatchDriveSyncs, manualSync, listForClient, unlinkFile)
- `convex/googleDriveDb.ts` (DB helpers: get/list/upsert linked_drive_files, profile token CRUD)
- `lib/services/googleDrive.service.ts` (Drive API HTTP client wrapper using `googleapis`)
- `app/routes/api/google-drive/auth.ts`
- `app/routes/api/google-drive/callback.ts`
- `app/routes/user/components/google-drive-tab.tsx` (the tab UI)
- `app/routes/user/components/link-drive-file-modal.tsx` (the link modal)
- `docs/google-drive-sync.spec.md` (this file)
- (3 more if test scaffolding added)

### Modified files (6)

- `convex/schemas/profile.schema.ts` — add Drive fields
- `convex/schemas/client.schema.ts` — extend config validator
- `convex/schema.ts` — register `linked_drive_files`
- `convex/crons.ts` — add Drive sync cron
- `convex/clients.ts` — extend update mutation for `driveSyncIntervalMinutes`
- `app/routes/user/settings.tsx` — add `google_drive` to `NAV_SECTIONS`, render `<GoogleDriveTab />`
- `CLAUDE.md` — add Drive integration to architecture section
- `package.json` — add `pdf-parse` + `@types/pdf-parse`

## 13. Manual setup required (post-deploy)

1. Google Cloud Console → OAuth consent screen → add scope `drive.readonly`.
2. Google Cloud Console → Credentials → edit existing OAuth Web client (or create new) → add redirect URI for each environment.
3. Convex env vars (`npx convex env set`):
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
4. Restart Convex dev/deploy.

## 14. Out of crew-pipeline scope

This spec was implemented manually (not via crew-build pipeline) because the Convex backend stack is not in the crew agent allowlist. Patterns follow existing Atendia conventions (per-table schemas, `authHelpers.requireClientAccess`, `internalMutation`/`internalAction`, `ctx.scheduler.runAfter` for async).
