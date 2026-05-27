# Google Drive Sync — Production Deployment Runbook

This document consolidates **everything** required to take the Google Drive file sync feature from local dev to a production Atendia deployment. Use it as the single source of truth when promoting the feature.

Companion spec: [`google-drive-sync.spec.md`](./google-drive-sync.spec.md) — what the feature does and why.

## 0. Feature recap (1 paragraph)

Atendia users connect their Google Drive (read-only OAuth scope), paste a Drive file URL (Excel, Google Sheets, or Google Doc), pick a target knowledge base, and Atendia auto-syncs the file content into `knowledge_chunks` whenever Drive's `modifiedTime` changes. Sync cadence is per-client (5 min → 1 month). UI lives in two places: a global tab at `/panel/configuracion → Google Drive` (connection + interval) and a contextual tab inside the "Agregar información" modal on the knowledge bases page (per-KB linking).

**PDFs are deferred to v2.** `pdfjs-dist` requires DOM globals not available in Convex's Node runtime. Excel/Sheets/Docs work.

---

## 1. Pre-deployment: Google Cloud Console setup

All under **the same Google Cloud project** that hosts your existing Calendar / login OAuth credentials. Reuse the same OAuth Web Application client — it's just credentials, scopes are configured at the consent-screen level.

### 1.1 Enable the Drive API

This is the easiest one to miss — OAuth can succeed yet every Drive API call fails with `Google Drive API has not been used in project <id>...`.

```
https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=<YOUR_PROJECT_ID>
```

Click **Enable**. Wait 1-2 minutes for propagation.

### 1.2 Add `drive.readonly` scope to the OAuth consent screen

URL: `https://console.cloud.google.com/auth/scopes` (with the right project selected)

1. **Add or remove scopes**
2. Search `drive.readonly`
3. Tick `https://www.googleapis.com/auth/drive.readonly` — *"See and download all your Google Drive files"*
4. **Update** → **Save**

**Note:** this is a Google **Restricted** scope. Implications:
- During Testing mode → fine, but each user must be added as a test user
- For Production → requires Google verification + third-party security assessment ($5k–$15k/yr from Bishop Fox / Leviathan / etc.)
- Alternative if you skip verification: use `drive.file` scope + Google Picker (see § 8)

### 1.3 Add the Drive callback redirect URI to your OAuth client

URL: `https://console.cloud.google.com/auth/clients` → click your Web client → **Authorized redirect URIs** → **Add URI**:

```
https://<YOUR_PROD_DOMAIN>/api/google-drive/callback
```

Replace `<YOUR_PROD_DOMAIN>` with the production `VITE_SITE_URL` host (e.g. `https://atendia.uy/api/google-drive/callback`).

If you want to keep local dev working from the same OAuth client, also add:
```
http://localhost:5173/api/google-drive/callback
```

### 1.4 Test users (Testing mode only)

URL: `https://console.cloud.google.com/auth/audience`

Manually add every Gmail address that needs to authorize Drive during the testing phase. Limit: 100. Refresh tokens in Testing mode expire after 7 days.

Skip this step once verification is approved.

---

## 2. Environment variables

The Drive feature reads OAuth credentials from **two different runtimes** — both must be configured.

### 2.1 Convex deployment env (used by `convex/googleDrive.ts` server actions)

Set these against your **production** Convex deployment (run from the repo root):

```bash
npx convex env set GOOGLE_DRIVE_CLIENT_ID "<your-client-id>.apps.googleusercontent.com" --prod
npx convex env set GOOGLE_DRIVE_CLIENT_SECRET "GOCSPX-<your-secret>" --prod
```

Replace `--prod` with your specific deployment slug if you use a named env (e.g. `--deployment my-prod-deployment`).

### 2.2 React Router / Node server env (used by `app/routes/api/google-drive/{auth,callback}.ts`)

These run on the Node process that serves the SSR app, **not** inside Convex. The OAuth route handlers read from `process.env`.

For production deploys, set both vars in your hosting platform's env config:

| Variable | Value | Where it goes |
|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | Same client ID as 2.1 | Hosting platform env (Vercel/Render/Fly env vars, or `.env.production`) |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Same secret as 2.1 | Same |
| `VITE_SITE_URL` | `https://<YOUR_PROD_DOMAIN>` | Same — required for OAuth redirect URI construction |
| `SITE_URL` | `https://<YOUR_PROD_DOMAIN>` | Same |

**For Docker** (`docker-compose.yml` already references the existing `GOOGLE_*` vars — add Drive ones too):

```yaml
environment:
  - GOOGLE_DRIVE_CLIENT_ID=${GOOGLE_DRIVE_CLIENT_ID}
  - GOOGLE_DRIVE_CLIENT_SECRET=${GOOGLE_DRIVE_CLIENT_SECRET}
```

### 2.3 Local dev reference (`.env`)

For your own local laptop dev (NOT committed; `.gitignore` covers `.env`):

```env
GOOGLE_DRIVE_CLIENT_ID=269432817235-rs806tgbpnada904c6hl6kkl4kvl5q2r.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-<your-secret>
```

---

## 3. Schema changes (auto-applied by `npx convex deploy`)

All schema diffs are **backward-compatible** — every new field is `v.optional()`, every new table is purely additive. No data migration required.

### 3.1 New table: `linked_drive_files`

Defined in `convex/schemas/linked-drive-file.schema.ts`. Registered in `convex/schema.ts`. Indexes:
- `by_client`
- `by_client_and_active` (drives the `listForClient` query — must exist before deploy)
- `by_drive_file_id`
- `by_profile`

### 3.2 `profiles` schema extensions

Added optional fields (existing rows unaffected):
- `googleDriveRefreshToken: v.optional(v.string())`
- `googleDriveEnabled: v.optional(v.boolean())`
- `googleDriveEmail: v.optional(v.string())`
- `googleDriveConnectedAt: v.optional(v.number())`

### 3.3 `clients.config` extensions

Added optional fields:
- `driveSyncIntervalMinutes: v.optional(v.union(v.literal(5), v.literal(15), v.literal(30), v.literal(60), v.literal(360), v.literal(720), v.literal(1440), v.literal(10080), v.literal(43200)))`
- `driveLastDispatchAt: v.optional(v.number())`

Default when unset: 15 min (handled in `convex/googleDrive.ts:DEFAULT_INTERVAL_MINUTES`).

### 3.4 New cron job

Added in `convex/crons.ts`:

```typescript
crons.interval(
    "Despachar sincronizacion de archivos de Google Drive",
    { minutes: 5 },
    internal.googleDrive.dispatchDriveSyncs,
);
```

Fires every 5 min. The dispatcher gates per-client based on `driveSyncIntervalMinutes`, so polling cost stays bounded regardless of how many clients have linked files.

---

## 4. File-by-file change manifest

For code review / pre-deploy diff inspection.

### New files

| Path | Purpose |
|---|---|
| `convex/schemas/linked-drive-file.schema.ts` | Linked-files table schema |
| `convex/googleDriveDb.ts` | DB queries/mutations (edge runtime — fast, transactional) |
| `convex/googleDrive.ts` | `"use node"` actions — OAuth, Drive API, sync, xlsx parsing |
| `app/routes/api/google-drive/auth.ts` | OAuth initiation — nonce + redirect to Google |
| `app/routes/api/google-drive/callback.ts` | OAuth callback — code → tokens → temp HTTP cookies |
| `app/routes/api/google-drive/exchange.ts` | POST endpoint — reads temp cookies, returns refresh token to authenticated browser |
| `app/routes/user/components/google-drive-tab.tsx` | Settings-page tab UI: connect / interval / global file list |
| `docs/google-drive-sync.spec.md` | Feature spec |
| `docs/google-drive-sync.deploy.md` | This file |

### Modified files

| Path | Change |
|---|---|
| `convex/schema.ts` | Register `linked_drive_files` |
| `convex/schemas/profile.schema.ts` | Add Drive-related profile fields |
| `convex/schemas/client.schema.ts` | Add Drive-related client config fields |
| `convex/crons.ts` | Add 5-min Drive sync dispatcher |
| `app/routes.ts` | Register 3 new API routes under `prefix("api", [...])` |
| `app/routes/user/settings.tsx` | Add `google_drive` nav section + render `<GoogleDriveTab />` |
| `app/routes/user/knowledge-bases.tsx` | Add `drive` tab to `FragmentModal`, new `DriveTabContent` component |

### NOT modified but worth knowing

- `package.json` / `package-lock.json` — no new runtime deps (initially added `pdf-parse`, removed when PDF support was deferred)
- `Dockerfile` — unchanged
- CI workflows — unchanged (none exist yet)

---

## 5. Deployment order

Execute in this exact sequence:

```bash
# 1. Make sure main is clean and up to date
git checkout main
git pull --ff-only

# 2. Push schema + functions to production Convex
npx convex deploy --prod
# (Auto-applies schema diff; idempotent — safe to re-run)

# 3. Set Convex env vars (one-time per env)
npx convex env set GOOGLE_DRIVE_CLIENT_ID "..." --prod
npx convex env set GOOGLE_DRIVE_CLIENT_SECRET "..." --prod

# 4. Set Node server env vars in your hosting platform
#    (Vercel / Render / Fly / Docker compose — wherever VITE_SITE_URL lives)

# 5. Build + deploy the frontend
npm run build
# Then push the build artifact however you deploy
#   (e.g. `vercel --prod`, or `docker build && docker push`)

# 6. Trigger a deploy on your hosting platform; wait for the new image to go live
```

**Order matters:** Convex must accept the schema before the frontend tries to call the new functions, otherwise users hit `Could not find function for 'googleDrive:linkFile'`.

---

## 6. Post-deploy smoke test

5 minutes of checks, in this order:

1. **Convex deploy succeeded** — `npx convex env list --prod` shows `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET`.
2. **Frontend reachable** — open `https://<prod>/panel/configuracion` → "Google Drive" section appears in the sidebar.
3. **OAuth flow completes** — click "Conectar Drive" → Google consent (with Drive scope listed) → redirect back → tab shows "Drive conectado como: <email>".
4. **Link works** — open a knowledge base → Agregar información → Google Drive tab → paste a Sheet URL → Vincular → row appears with "Sincronizado hace unos segundos".
5. **Cron fires** — wait 5–15 min depending on your `driveSyncIntervalMinutes`; check Convex logs for `internal.googleDrive.dispatchDriveSyncs` invocations.
6. **Re-ingest on Drive change** — edit the Sheet in Drive → wait one cron tick → file row's "Sincronizado hace X min" updates.

If step 3 fails with `Acceso bloqueado` → consent screen / test users / API-enable issue (see § 7).
If step 4 fails → check Convex logs for the action error (now exposes the real Drive error text).

---

## 7. Common errors → fixes

| Error / symptom | Cause | Fix |
|---|---|---|
| `OAuth client was not found` / `Error 401: invalid_client` | `GOOGLE_DRIVE_CLIENT_ID` is empty in the Node server env (not Convex) | Set the var in your hosting platform's env config (§ 2.2); restart the Node server |
| `Atendia Dev no ha completado el proceso de verificación` / `access_denied` | User not in test users list, OR consent screen in Testing mode but app not verified for restricted scopes | Add user as test user (§ 1.4) OR submit for verification (§ 8) |
| `Drive rechazó la petición: Google Drive API has not been used in project X...` | Drive API not enabled in the Cloud project | Visit the URL Google gives in the error and click Enable (§ 1.1) |
| `Drive rechazó la petición: File not found` | The Drive account that connected doesn't have access to the file (someone else's file, or shared-drive without permission) | Use a file that the connected Google account can open in Drive UI |
| `Drive rechazó la petición: Insufficient Permission` | OAuth grant doesn't include drive.readonly (token from a different scope) | Disconnect → Conectar Drive again to force fresh consent |
| Linked file row shows "Pendiente de primera sincronización" indefinitely | Cron not running, OR `dispatchDriveSyncs` erroring silently | Check Convex dashboard → Logs → search for `dispatchDriveSyncs` |
| Re-sync doesn't pick up Drive changes | `lastSyncedModifiedTime === remoteMTime` check skips re-ingest | Click "Sincronizar ahora" — manual sync now force-clears that gate (PR #3) |
| Unlinked file still appears in list | Cached query before fix | Hard-refresh; `listForClient` now filters to active-only (PR #3) |

---

## 8. Future production hardening (deferred work)

### 8.1 PDF support

`pdfjs-dist` requires `DOMMatrix` / `ImageData` / `Path2D` browser globals that Convex's Node runtime lacks. Module fails to load at import time. Options to re-enable:
- Run PDF extraction in a separate worker service outside Convex (e.g. a tiny Cloud Run function that returns text), call it from the action
- Wait for a Node-pure PDF text extractor that doesn't depend on pdfjs
- Use a 3rd-party text-extraction API (AWS Textract, Google Document AI)

### 8.2 Restricted scope verification

`drive.readonly` is a Google Restricted scope. For non-test-user production access, requires:
- Privacy Policy URL, Terms of Service URL, in-app links to both
- YouTube demo showing the OAuth flow + how the app uses the scope
- App verification submission (free, ~weeks of review)
- **Annual third-party security assessment** ($5k–$15k from Bishop Fox / Leviathan / NCC Group / etc.) — mandatory for restricted scopes

### 8.3 Workaround: switch to `drive.file` scope + Google Picker

If you want to skip restricted-scope verification:
- Change OAuth scope from `drive.readonly` → `drive.file` (non-restricted)
- Replace the URL-paste UX with the Google Picker JS API — user picks files via Google's modal, which grants per-file access
- Backend code stays mostly the same (still fetches by file ID once granted)
- ~1-2 days of frontend work; no fees, no test user limits

### 8.4 Drive Push Notifications (real-time sync)

Currently polling-based (per-client cron). For near-instant updates:
- Register a watch channel per file (`drive.files.watch`)
- Drive POSTs to a webhook URL on file change
- Requires a publicly-reachable webhook endpoint
- Channels expire every 7 days → need a renewal cron
- Worth doing if customers complain about polling lag; not worth it pre-launch

### 8.5 Token / cost limiting

Re-syncing replaces all chunks. If your chunk pipeline auto-generates Gemini embeddings, each re-sync costs tokens proportional to file size. For large workbooks on aggressive polling, this adds up. Consider:
- Per-client monthly Drive-sync token budget
- Diff-based chunk replacement (compare row hashes, only re-embed changed rows)

---

## 9. Rollback

If production breaks after the deploy:

```bash
# Revert all 3 Drive PRs from main
git checkout main
git pull --ff-only
git revert --no-edit 80d8e0e 86e71c9 1b93ba3
git push origin main

# Redeploy Convex with the reverted state
npx convex deploy --prod

# Redeploy frontend
npm run build && <your deploy command>
```

The reverted state still has the schema additions in Convex (Convex doesn't drop columns/tables on revert) — that's fine, they're all optional fields and unused tables, just dead weight.

To fully wipe the Drive feature from prod DB (only if you're SURE you won't restore):
- Open Convex dashboard → Data → `linked_drive_files` → delete all rows
- Drop the table from `convex/schema.ts` (next deploy will remove it from the schema)
- Delete `driveSync*` fields from any `clients.config` rows (in dashboard)
- Delete `googleDrive*` fields from any `profiles` rows (in dashboard)

---

## 10. Change history

| PR | Commit | Title |
|---|---|---|
| #1 | `1b93ba3` | feat(drive): sync linked Google Drive files into knowledge bases |
| #2 | `86e71c9` | fix(drive): expose Google Drive as a 4th tab inside "Agregar información" modal |
| #3 | `80d8e0e` | fix(drive): production-readiness pass — better errors, more intervals, multi-tab, soft-delete UX |
