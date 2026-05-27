# Google Drive Sync — Production Deployment Runbook

This document consolidates **everything** required to take the Google Drive file sync feature from local dev to a production Atendia deployment. Use it as the single source of truth when promoting the feature.

Companion spec: [`google-drive-sync.spec.md`](./google-drive-sync.spec.md) — what the feature does and why.

## 0. Feature recap (1 paragraph)

Atendia users connect their Google Drive (read-only OAuth scope), paste a Drive file URL (Excel, Google Sheets, or Google Doc), pick a target knowledge base, and Atendia auto-syncs the file content into `knowledge_chunks` whenever Drive's `modifiedTime` changes. Sync cadence is per-client (5 min → 1 month). UI lives in two places: a global tab at `/panel/configuracion → Google Drive` (connection + interval) and a contextual tab inside the "Agregar información" modal on the knowledge bases page (per-KB linking).

**PDFs are deferred to v2.** `pdfjs-dist` requires DOM globals not available in Convex's Node runtime. Excel/Sheets/Docs work.

---

## 1. Pre-deployment: Google Cloud Console setup

All steps live under **a single Google Cloud project** — the same one that hosts your existing Calendar / login OAuth credentials. Reuse the same OAuth Web Application client; OAuth scopes are configured at the consent-screen level, not the client level.

**Time required:** ~10 minutes if the project + consent screen already exist. ~30 minutes if starting from scratch.

### 1.0 Prerequisites: confirm you have a Google Cloud project

Open https://console.cloud.google.com/ → top bar → **project selector** (the dropdown next to "Google Cloud").

**If you already have an Atendia project** (e.g. you set up Google OAuth login earlier): pick it. Note the **Project ID** shown in the project info card on the home page — it looks like `ascendia-dev-497614`. Keep this ID handy; URLs in the steps below need it.

**If you don't have one yet:**
1. Project selector → **New Project**
2. **Project name**: e.g. `Atendia Production`
3. **Organization / Location**: pick yours (or "No organization" for personal)
4. **Create** → wait ~30 seconds → switch to the new project from the dropdown
5. Note the auto-generated **Project ID** (it's *not* the project name — it's a unique slug like `atendia-prod-499821`)

### 1.1 Find your Project ID and Project Number

You'll need both:
- **Project ID** (string, e.g. `ascendia-dev-497614`) — used in URLs and `gcloud` commands
- **Project Number** (numeric, e.g. `269432817235`) — appears in OAuth client IDs and some error messages

Both are visible at https://console.cloud.google.com/welcome → "Project info" card on the home page. Copy them to a scratchpad — you'll paste them into URLs throughout this section.

### 1.2 Enable the Google Drive API

> ⚠ **Easiest step to forget.** OAuth can succeed entirely yet every Drive API call returns `Google Drive API has not been used in project <id> before or it is disabled`. The user-facing error in Atendia surfaces this message verbatim now (PR #3), but you can skip the user-side error by enabling it preemptively.

**Direct URL** (replace `<PROJECT_ID>`):
```
https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=<PROJECT_ID>
```

Steps:
1. Open the URL above with your project ID
2. You'll see a "Google Drive API" page with a big blue **Enable** button at the top
3. Click **Enable**
4. The button changes to "Manage" → API is now enabled
5. **Wait 1-2 minutes** for propagation across Google's edge — calls made immediately after enabling sometimes still return the "not enabled" error during this window

**Verify it worked:**
```
https://console.cloud.google.com/apis/api/drive.googleapis.com/metrics?project=<PROJECT_ID>
```
Should show a metrics dashboard (will be empty until first call).

### 1.3 Configure the OAuth consent screen (one-time per project)

Skip this section if you already configured it for Calendar/login OAuth.

**URL:** https://console.cloud.google.com/auth/overview

Steps:
1. **Get started** (only appears first time)
2. **App information:**
   - **App name**: `Atendia` (this is what users see on the consent screen)
   - **User support email**: your email
3. **Audience type:**
   - **External** (recommended for SaaS) — any Google account can log in once verified; during Testing mode only listed test users
   - **Internal** (only if you have Google Workspace) — only accounts in your Workspace domain
4. **Contact information**: your email
5. **Agree to Google's terms** → **Continue**
6. **Create**

After creation you can edit it at https://console.cloud.google.com/auth/branding to add your logo, app domain, privacy policy URL, and terms of service URL. **Privacy policy and ToS are required to submit for verification** (see §8.2) but not required during Testing mode.

### 1.4 Add the `drive.readonly` scope

**URL:** https://console.cloud.google.com/auth/scopes

Steps:
1. Verify the project selector at the top shows the right project
2. Click **Add or remove scopes** (large button)
3. A side panel opens with a scope filter at the top
4. In the filter, paste either:
   - `https://www.googleapis.com/auth/drive.readonly` (the full URL), or
   - `drive.readonly` (just the suffix — Google filters)
5. Tick the checkbox next to the scope. The display label reads: **"See and download all your Google Drive files"**
6. Click **Update** at the bottom of the side panel
7. The scope now appears in the "Your sensitive scopes" or "Your restricted scopes" list (Drive readonly is **Restricted**)
8. Scroll to the bottom of the page → click **Save**

> ⚠ **Restricted scope warning.** `drive.readonly` is a Google "Restricted" scope. Implications:
> - **Testing mode** → works fine, but each user must be added as a test user (§1.6). Refresh tokens expire after 7 days.
> - **Production** → requires Google verification + third-party security assessment. Costs $5k–$15k/yr from approved firms (Bishop Fox, Leviathan, NCC Group, etc.). Review takes 4–8 weeks.
> - **Workaround if cost is prohibitive:** switch to `drive.file` scope (non-restricted) + Google Picker UI. See §8.3 for the migration path.

### 1.5 Add the Drive callback redirect URI to your OAuth client

**URL:** https://console.cloud.google.com/auth/clients

Steps:
1. You'll see a list of OAuth 2.0 Client IDs. Find your Web client (Type column = "Web application"). If you don't have one yet, **Create client** → Application type **Web application** → name it `Atendia` → continue
2. Click on the client name (or the pencil/edit icon)
3. Scroll to **Authorized redirect URIs**
4. Click **+ Add URI** and paste your production callback URL:
   ```
   https://<YOUR_PROD_DOMAIN>/api/google-drive/callback
   ```
   Examples:
   - `https://atendia.uy/api/google-drive/callback`
   - `https://app.atendia.uy/api/google-drive/callback`
5. If you want the same OAuth client to also work for local development, click **+ Add URI** again and add:
   ```
   http://localhost:5173/api/google-drive/callback
   ```
6. Click **Save** at the bottom

> 💡 You can have many redirect URIs on the same client. Add one per environment (prod, staging, local). Google enforces an exact-match check — `https://atendia.uy/` vs `https://atendia.uy` differ; `http://` vs `https://` differ; trailing slash differs. Paste verbatim.

**Copy the Client ID and Secret** from the same page:
- **Client ID** — looks like `269432817235-xxx.apps.googleusercontent.com`
- **Client secret** — looks like `GOCSPX-xxxxxxxxx`. If you don't see the secret displayed, click **Reset Secret** to generate a new one. ⚠ Resetting invalidates the old secret — any other app using it will break.

These two values go into both your **Convex env** and your **Node server env** in §2.

### 1.6 Add test users (Testing mode only)

Skip this if you've submitted for verification AND been approved.

**URL:** https://console.cloud.google.com/auth/audience

Steps:
1. Verify project selector
2. Scroll to **Test users** section
3. Click **+ Add users**
4. Paste Gmail addresses (one per line, or comma-separated, up to 100 total)
5. Click **Add** → **Save**

> ⚠ **Quirks:**
> - Changes can take a few minutes to propagate. If a user gets `access_denied` immediately after being added, wait 2-5 min and retry.
> - Some restricted scopes force re-validation of test users when the scope set changes. If you add `drive.readonly` to an existing consent screen, you may need to re-add test users.
> - Refresh tokens issued in Testing mode **expire after 7 days**. Users will need to re-consent weekly. This is a Google limitation, not configurable.

### 1.7 (Optional but recommended) Verification submission

**Required to go truly public** with `drive.readonly`. Not required for internal teams using Testing mode.

URL: https://console.cloud.google.com/auth/verification

Requirements at minimum:
- Privacy Policy URL (must be reachable, mention each scope's use)
- Terms of Service URL
- App home page URL
- Authorized domains list (e.g. `atendia.uy`)
- **YouTube demo video** showing the OAuth flow + how each scope is used
- **Annual independent security assessment** (mandatory for restricted scopes — $5k–$15k from a Google-approved CASA assessor)

Review takes 4-8 weeks for first-time apps. Plan accordingly.

### 1.8 Final verification checklist before §2

Before moving to env var setup, confirm in the Cloud Console:

- [ ] You're in the correct project (top-bar selector matches your Project ID)
- [ ] Google Drive API is enabled (§1.2 verify URL shows the metrics page, not a "Get started" page)
- [ ] OAuth consent screen exists with an app name set
- [ ] `https://www.googleapis.com/auth/drive.readonly` appears in the scopes list
- [ ] Your OAuth Web client has the production callback URI added
- [ ] (Testing mode) every user who needs Drive access is in the test users list
- [ ] You've copied the OAuth Client ID and Client Secret to a secure scratchpad

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
