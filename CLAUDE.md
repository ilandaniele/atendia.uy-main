# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at localhost:5173
npm run build        # Production build
npm start            # Serve production build
npm run typecheck    # Generate React Router types + TypeScript check
npm run build:widget # Build standalone chat widget (separate Vite config)
npx convex dev       # Start Convex backend (separate terminal)
```

## Architecture

**Atendia** is a B2B SaaS CRM/communication platform with AI assistants, WhatsApp and web integration, and payment processing.

**Stack:**
- **Frontend**: React Router 7 (SSR enabled) with TypeScript and Tailwind CSS 4
- **Backend**: Convex (serverless functions, NoSQL database, real-time subscriptions, cron jobs)
- **Auth**: Convex Auth with Google OAuth
- **AI**: Google Gemini via `lib/services/gemini.service.ts`
- **Payments**: dLocalGo (Latin American processor) via `lib/services/dlocal.service.ts`
- **Messaging**: WhatsApp via Whapi (`lib/services/whapi.service.ts`)
- **Email**: SendGrid via `lib/services/sendgrid.service.ts`

## Project Structure

```
app/
  routes/         # File-based routing (React Router 7)
  layouts/        # Nested layout wrappers (admin, auth, user, chat, public)
  hooks/          # Custom React hooks
convex/           # All serverless backend functions
  schemas/        # Per-table schema definitions (imported by schema.ts)
  authHelpers.ts  # requireAuth / requireAdmin / requireClientAccess / requireClientOwner
  auth.ts         # Auth setup
  http.ts         # HTTP action router (Google Calendar webhook)
  crons.ts        # Scheduled jobs (billing checks, Calendar renewal, dLocal links)
  ai.ts           # Core AI message processing (web + WhatsApp)
  webhooks.ts     # Outbound webhook dispatcher (lead/order/appointment events)
  *.ts            # Domain functions (chats, clients, assistants, channels, etc.)
lib/services/     # External service clients (all require "use node";)
src/widget/       # Chat widget source — bootstraper.ts is the IIFE entry point
types/            # TypeScript types (mostly Whapi integration)
docs/             # Integration docs (webhooks, payments, WhatsApp)
vite.widget.config.ts  # Separate build for embeddable chat widget
```

## Route Sections

- `/` — Public landing, pricing, legal pages
- `/ingreso` — Google OAuth login
- `/panel` — User dashboard (agenda, assistants, channels, leads, messages, billing)
- `/administracion` — Admin panel (users, clients, plans, tokens, billing, config)
- `/api` — Webhook endpoints (Whapi, dLocal), widget script
- `/chat/:token` — Embeddable chat widget (minimal layout, separate bundle)

## Auth Patterns

`convex/authHelpers.ts` exports four helpers called at the top of nearly every query/mutation:

- `requireAuth(ctx)` — verifies logged-in user with an active profile
- `requireAdmin(ctx)` — admin-only access
- `requireClientAccess(ctx, clientId)` — verifies caller is an owner or member of the client
- `requireClientOwner(ctx, clientId)` — owner-only of a client

Usage: `const { user, profile } = await requireClientAccess(ctx, clientId);`

## AI Message Processing

The core AI loop lives in `convex/ai.ts` and runs identically for both channels:
- **`processWebMessage`** — handles web widget sessions (identified by `sessionId`)
- **`processMessage`** — handles WhatsApp messages (identified by `chatId`/phone)

Both use the same RAG + intent pipeline:
1. Vector-search `knowledge_chunks` with the user's question
2. Build a system prompt via `buildIntentSystemPrompt()` with RAG context, booked slots, and user's active appointments/orders
3. Call Gemini (free key for trials, paid key for plan clients; automatic fallback between keys)
4. Parse the JSON response into one of: `chat | lead | order | appointment | cancel_appointment | modify_appointment | cancel_order`
5. Execute the intent (create DB records, dispatch outbound webhooks via `ctx.scheduler.runAfter`)

**Conversation state** (`conversation_states` table) tracks `pendingIntent`/`pendingData` for multi-turn data collection. If status is `PAUSED` or `IGNORED`, AI is suppressed (operator took over).

**Token deduction** happens after every Gemini call; clients with `tokensBalance <= 0` are fail-fasted before any AI call.

## Convex Patterns

- All schemas are defined per-table in `convex/schemas/` and imported into `convex/schema.ts`
- **Public** functions (`query`, `mutation`, `action`) enforce auth via authHelpers; **internal** functions (`internalQuery`, `internalMutation`, `internalAction`) bypass auth and are only callable from other Convex functions
- Files with `"use node";` at the top run in a Node.js environment (required for HTTP calls, crypto, file parsing); all others run in the Convex edge runtime
- Outbound webhooks are always dispatched asynchronously: `ctx.scheduler.runAfter(0, internal.webhooks.dispatch, {...})`
- Appointment reminders are scheduled with `ctx.scheduler.runAt(reminderTs, internal.ai.sendAppointmentReminder, {...})`
- Google Calendar sync is triggered after every appointment create/update via `internal.googleCalendar.syncForClient`

### Schema Validators
- `v.union(v.literal("a"), v.literal("b"))` for enum fields (Lead.status, Order.status, Channel.type)
- `v.optional()` for conditional fields throughout
- Nested config is stored as plain `v.object({})` in the same table (not split into separate tables): `client.config`, `client.features`, `channel.config`
- Multi-field indexes: `.index("by_client_and_type", ["clientId", "type"])`

### Internal vs. Public Functions
- `internalQuery`/`internalMutation`/`internalAction` are called via `internal.module.functionName` from cron jobs, schedulers, or HTTP handlers — never from the client
- `query`/`mutation`/`action` are exposed as `api.module.functionName` and callable from React via `useQuery`/`useMutation`

## Chat Widget

`vite.widget.config.ts` builds `src/widget/bootstraper.ts` as an IIFE (`atendia-widget.min.js`). The widget exposes a global `window.atendia()` call queue, renders a floating button + iframe, and communicates with the host page via `postMessage` using `atendia:*` message types. It is a completely isolated bundle with no shared state with the main app.

## Key Patterns

- **Convex queries/mutations** are the primary data layer — use `useQuery`/`useMutation` from `convex/react` in components
- **Real-time** updates happen automatically via Convex subscriptions
- **Path alias**: `~/*` maps to `./app/*` (configured in tsconfig and vite)
- **VITE_*** env vars are baked into the build at compile time; backend secrets live in Convex environment variables
- **Multi-tenant**: every entity (assistants, channels, chats, etc.) belongs to a `client`. The `client_members` table maps users to clients

## WhatsApp Operator Commands

Operators can send commands from their own WhatsApp number (messages where `from_me=true` starting with `/`). These are processed in `convex/whatsapp.ts:handleInboundMessage` before any AI logic.

## Cron Jobs (`convex/crons.ts`)

- Daily at 03:00 UTC — delete expired profiles
- Daily at 10:00 UTC — alert trials ending in 24h
- Daily at 10:30 UTC — deactivate expired trials
- Daily at 11:00 UTC — deactivate Whapi channels without active subscription
- Daily at 08:00 UTC — renew Google Calendar webhooks
- Every 360 hours — refresh dLocalGo payment links

## Environment Variables

Split across `.env`, `.env.development`, and `.env.local`:
- `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL` — Convex connection
- `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URL` — OAuth
- `GEMINI_API_KEY` — AI (fallback); `GEMINI_API_KEY_FREE` / `GEMINI_API_KEY_PAID` — separate keys per tier
- `WHAPI_PARTNER_API_KEY` — WhatsApp
- `DLOCALGO_API_URL/KEY/SECRET` — Payments
- `SENDGRID_API_KEY` — Email
- `VITE_SITE_URL` — Public URL (used in widget embed code)
- `GOOGLE_RECAPTCHA_ID` — reCAPTCHA v3

`VITE_*` variables must be passed as Docker build args — they are baked in at compile time. In Docker/production, pass them via `args` in `docker-compose.yml`. Required at build: `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_SITE_URL`, `VITE_VAPID_PUBLIC_KEY`.
