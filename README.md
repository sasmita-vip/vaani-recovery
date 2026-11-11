# Vaani Recovery — Collections Dashboard

Operations dashboard for a voice-agent ("Vaani agent") that calls borrowers about overdue loans. It shows
live calls and transcripts, promises to pay, the human escalation queue, call history and compliance
monitoring. All data comes from Supabase; the UI is React + Vite + TypeScript + Tailwind.

## Stack

- React 18, Vite, TypeScript, Tailwind CSS, lucide-react
- Supabase (Postgres, Auth, Realtime) via `@supabase/supabase-js`
- Supabase Edge Function (Deno) proxying **Gnani Prisma** (speech-to-text) and **Gnani Timbre** (text-to-speech)
- Vitest for unit tests of the formatting, calling-window and conversation-policy helpers

## What is in the app

| Screen | Purpose |
| --- | --- |
| Overview | Today's KPIs (IST), promises per hour, call outcomes, promises due today, oldest open escalations |
| Live Calls | Voice demo (mic → Prisma → agent policy → Timbre), in-progress calls with live timers and transcript, "Transfer to officer" |
| Escalation Queue | Human handoffs: assign, resolve, notes, callbacks inside calling hours, audit trail |
| Promises to Pay | States derived from `promised_date`/`paid_at`, bulk SMS queueing, per-row message status |
| Call History | Server-paginated call list with filters, sorting, CSV export |
| Call Detail | Full transcript from `call_turns`, outcome, compliance checks and escalation audit entries |
| Compliance | Live compliance metrics and flagged calls (no seeded numbers) |
| Settings | Manager-only calling hours, PTP limits, approved options, handoff phone, webhook; telephony heartbeat |

The dashboard is **public**: anyone can open it and browse data without signing in. Signed-out visitors get a
read-only "Guest viewer" identity — no escalation edits, no settings changes, no CSV export, no SMS/callbacks,
and phone numbers stay masked. Signing in (top bar or sidebar, or `#/signin`) unlocks the role below.

Role behaviour is enforced by Postgres RLS, not just the UI:

- **manager** — everything, including settings.
- **officer** — works escalations (status, assignee, notes), exports CSV, sees full phone numbers.
- **compliance** — read-only: no escalation edits, no settings edits, phone numbers masked.

Phone numbers are masked in lists (`+91 98••• ••710`); the full number is shown only inside the
call/escalation drawer to officers and managers.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Put the project ref into `supabase/config.toml` (`project_id`) — it ships with this repo's ref already.
   Then apply the migrations **in order**:

   ```bash
   npx supabase login          # once per machine
   npx supabase db push        # applies the four migrations in order
   ```

   Without the CLI, open **SQL Editor** and run the four files in order instead. The screens that read
   `calls.ended_at`, `escalations.created_at` or `promises_to_pay.created_at` return
   `column ... does not exist` (HTTP 400) until migrations 2–4 have been applied.

   Migration order:

   1. `supabase/migrations/20261110040232_vaani_recovery_schema_and_seed.sql` — original schema (kept unchanged).
   2. `supabase/migrations/20261110120000_profiles_and_roles.sql` — profiles/roles, RLS hardening, settings constraints.
   3. `supabase/migrations/20261110130000_live_data_model.sql` — `call_turns`, audit log, outbound messages,
      callbacks with calling-hours trigger, timestamps, live SQL views, realtime publication.
   4. `supabase/migrations/20261110140000_public_read_access.sql` — anonymous read-only access so the
      dashboard works without signing in. Writes stay authenticated. This is a deliberate demo choice;
      the file documents how to revoke it for a production deployment with real borrower data.

3. Demo data: `supabase/seed.sql` (dated November 2026, IST). `supabase db push` does **not** run it, so paste the
   file into **SQL Editor** and execute it once. It is idempotent (`on conflict do nothing`). Skip it for a real
   production project with live borrower data.

### First manager user

1. In Supabase → Authentication → Users, create a user with email + password (there is no self sign-up in the app).
2. In the SQL editor, create the matching profile:

   ```sql
   insert into public.profiles (id, full_name, email, role)
   values ('<auth-user-uuid>', 'Your Name', 'you@lender.in', 'manager');
   ```

   The `handle_new_user` trigger already inserts a profile with role `officer` when a user is created;
   updating that row to `manager` is enough:

   ```sql
   update public.profiles set role = 'manager' where email = 'you@lender.in';
   ```

3. Add further officers/compliance users the same way. A user without a profile row can still view the
   public dashboard, but cannot perform any actions.

## Environment variables

Copy `.env.example` to `.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon key (never the service role key) |
| `VITE_API_BASE_URL` | no | Voice backend base URL for live call transfers |

`.env` is gitignored. Only the public anon key belongs in the front end.

## Local development

```bash
npm install
cp .env.example .env   # fill in the Supabase values
npm run dev
```

Checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Deploying

The build is a static bundle in `dist/`, so any static host works.

- **Netlify** — build command `npm run build`, publish directory `dist`. Add the environment variables in
  Site settings → Environment variables. No rewrite rules are needed because routing uses URL hashes.
- **Vercel** — framework preset "Vite", build command `npm run build`, output directory `dist`. Add the same
  environment variables in Project settings.

## Gnani voice demo

The Live Calls screen has a **Voice demo** card that runs a real speech loop:

1. The browser records up to 20 seconds from the mic and re-encodes it as mono 16-bit WAV.
2. `POST /voice/transcribe` sends the audio to **Gnani Prisma** (`POST /stt/v3`, default `prisma-v3.0` with
   `language_code=indic-auto`, so Hinglish and mixed-language speech is detected automatically).
3. The transcript goes to `POST /voice/turn`, which writes the customer turn, runs the Vaani conversation policy
   (`supabase/functions/_shared/agent.ts`) and writes the agent turn. Promises to pay and escalations are written
   to their real tables, so the dashboard, queue and audit views react immediately.
4. `POST /voice/speak` sends the reply to **Gnani Timbre** (`POST /api/v1/tts/inference`) and the audio plays in the card.

`POST /voice/session` creates the demo call row (from the first seeded loan, or a supplied `loanId`) and returns
Vaani's opening line. No login is needed, which keeps the public demo usable by judges.

### Deploying the function

```bash
npx supabase secrets set GNANI_API_KEY=<your-gnani-key>   # never commit or paste this key in chat
npx supabase functions deploy voice
curl -s https://<project-ref>.supabase.co/functions/v1/voice/health
# {"ok":true,"gnaniKeyConfigured":true,...}
```

`supabase/config.toml` sets `[functions.voice] verify_jwt = false` so the public demo can call the function with the
anonymous key; leave it on for a private deployment and send a signed-in user's token instead.

Optional secrets: `GNANI_TTS_VOICE` (default `Nalini`, see Gnani's voice catalog), `GNANI_TTS_MODEL`,
`GNANI_STT_MODEL`, `GNANI_STT_LANGUAGE`, `GNANI_BASE_URL`, `ALLOWED_ORIGIN` (lock CORS to your site).
`GNANI_API_KEY` is read only inside the function; the browser never receives it.

Local development, once the Supabase CLI and Docker are available:

```bash
cp supabase/functions/.env.example supabase/functions/.env   # add the key
supabase functions serve voice --env-file supabase/functions/.env
```

Then point `VITE_SUPABASE_URL` at the local API (`http://localhost:54321`) and run `npm run dev`.

### Notes and limits

- Prisma's REST endpoint accepts clips up to 30 seconds; the recorder auto-stops at 20 seconds.
- Every turn consumes programme credits (one STT request + one TTS request), so keep demo recordings short.
- The policy is deterministic on purpose: it needs no extra LLM key, and demo answers stay predictable.
- `service_role` is used only inside the function to write call turns, promises and escalations; the dashboard
  schema revokes those writes from normal users.
- The function is reachable by anyone on the public demo. Inputs are size-capped, but for a real deployment add
  rate limiting or put it behind the signed-in auth check.

## Voice backend (optional, for real phone calls)

Realtime dashboard data comes from Supabase Realtime. Placing actual telephone calls (Twilio/Exotel + a
media-stream bridge) is outside this repo. The "Transfer to officer" button calls

```
POST {VITE_API_BASE_URL}/v1/calls/{call_id}/transfer
Authorization: Bearer <Supabase access token>
```

If `VITE_API_BASE_URL` is empty the button stays disabled with a "Backend not connected" tooltip.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `column calls.ended_at does not exist` (or `escalations.created_at`, `promises_to_pay.created_at`) | Only the first migration was applied | Run `npx supabase db push` (or all four SQL files, in order) |
| `Could not reach the voice function at https://…/functions/v1/voice` | Function not deployed, or the browser blocked the request | `npx supabase functions deploy voice`, set `GNANI_API_KEY`, then reload. The message now includes the browser's reason |
| `Prisma could not transcribe that clip` | Gnani rejected the audio or the key is missing/out of credits | Check `GNANI_API_KEY`, keep clips under 30 s, watch the function logs |
| `Invalid login credentials` | No such user, wrong password, or the user was never created | Create the user in Supabase → Authentication → Users, then set the profile role |
| `VITE_SUPABASE_URL is not a valid project URL` | Quotes, a path, or a dashboard URL in the variable | Use the bare `https://<ref>.supabase.co` origin and rebuild |
| Dashboard works but every table is empty | `supabase/seed.sql` was never run | Execute it in the SQL editor (development only) |

## Data notes

- All dates and times are displayed in IST (`Asia/Kolkata`) with `en-IN` number formatting (`₹1,25,000`).
- `calls.started_at` is `timestamptz`; `waiting_minutes`, `days_past_due` and promise state are computed rather
  than stored.
- Escalation reasons are stored as codes and labelled in the UI.
- Callbacks are rejected by a database trigger outside the configured calling hours, and the UI blocks them too.
- Dashboard summary numbers come from the `daily_kpis`, `hourly_promises`, `flagged_calls` and
  `compliance_metrics` views for the current IST day.
- CSV exports are audit-logged (`audit_log.action = 'export.csv'`) for officers and managers.
