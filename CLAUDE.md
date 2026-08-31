# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm run dev              # Vite dev server at http://localhost:5173
npm run build            # tsc -b (type-check, project refs) then vite build
npm run lint             # eslint . (fails the build gate if it errors)
npm run preview          # serve the production build locally
npm run bootstrap:admin  # scripts/create-super-admin.mjs — creates the first super_admin
```

There is **no unit-test runner** in this repo. Verification is `npm run lint && npm run build && npm run preview` plus the manual end-to-end script in `README.md` ("Quick end-to-end backend test").

### Supabase (schema + backend live in `supabase/`)

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push            # apply migrations — the ONLY way to change schema
npx supabase config push        # push supabase/config.toml (auth settings, per-function verify_jwt)
npx supabase functions deploy <name> --use-api   # deploy one Edge Function
```

Edge Functions: `create-user`, `update-user`, `delete-user`, `reset-user-password`, `issue-student-qr`, `batch-issue-student-qrs`, `view-student-qr`, `create-event`, `reset-event-pin`, `view-event-pin`. The QR/PIN view functions need the `QR_ESCROW_KEY` secret (see README).

## Architecture

Single-page React app (React 19, TypeScript strict, Vite, React Router 7, Tailwind 3) talking directly to a Supabase project. There is no custom Node server. All trust and business rules live in PostgreSQL; the frontend is a thin, role-aware client.

### Frontend layers (`src/`)

- `app/App.tsx` — all routes. Every route is lazy-loaded and wrapped in `ProtectedRoute` (optionally with a `roles` allowlist). Officers are redirected from `/` to `/events`.
- `pages/` — one component per screen; owns data fetching + local state for that screen.
- `features/<domain>/` — domain UI + logic (auth, events, students, attendance, reports, users, audit, theme, pwa). `features/auth/AuthProvider.tsx` and `features/theme`, `features/pwa` are app-wide context providers mounted in `main.tsx`.
- `services/` — the **only** place that calls Supabase for data (`supabase.from(...)`, `.rpc(...)`, `invokeFunction(...)`). Pages import from here; they do not build queries inline. `services/functions.ts#invokeFunction` is the wrapper for Edge Function calls and error unwrapping.
- `lib/supabase.ts` — the singleton client. Missing env vars produce a placeholder client + `environmentError` string rather than a hard crash.
- `types/app.ts` — shared domain types and RPC row/result shapes. Keep in sync with migration return types.
- `utils/dates.ts` — **all event scheduling is Asia/Manila**. `datetime-local` inputs are interpreted as Manila time (`+08:00`) and stored as UTC ISO. Use these helpers, never raw `new Date(input)`. The event form's "duration" field is a UI convenience only — the database stores `start_at` and a computed `end_at`.
- `utils/auth.ts` — username normalization (trim, lowercase, 3–40 of `[a-z0-9_.]`), mapped to the internal email `username@auth.attendly.local`. The same rules are duplicated in `supabase/functions/_shared/http.ts` and in SQL — change all three together.

### Backend (`supabase/`)

- `migrations/` — **forward-only, the source of truth for schema, RPCs, RLS, and grants.** Never edit the database from the Studio dashboard and never rewrite a deployed migration; add a new timestamped migration instead. `seed.sql` seeds the `IT` department.
- Data-changing operations go through `SECURITY DEFINER` RPCs (`process_attendance_scan`, `process_manual_attendance`, `admin_correct_attendance`, `bulk_import_students`, `verify_event_pin`, event roster RPCs, etc.) that re-check authorization, eligibility, and time windows server-side. `attendance`, `student_qr_credentials`, and `events.pin_hash` have no direct authenticated write/select grants.
- Absence is derived (expected students minus attendance rows), not stored. Attendance timestamps come from PostgreSQL `now()`, never the scanner device. A unique `(event_id, student_id)` constraint plus conflict-aware inserts prevent duplicate scans. Normal deletes are soft deletes.
- The **event attendance roster** (`event_guest_attendance` table + roster RPCs, the newest feature area) supports spreadsheet-style editing, temporary/guest attendees, bulk actions, undo, and *finalization* that locks the roster (`attendance_finalized_at`). Historical events can be created already-closed with imported attendance.
- `audit_logs` records state-changing actions only and is purged after 30 days (`202608310002_audit_log_retention.sql`).
- Queries that can exceed Supabase's 1,000-row `max_rows` are paginated in 500-row batches (`QUERY_PAGE_SIZE` in the services) — preserve this when touching student/report/roster/log queries.
- Privileged operations (anything needing the service-role key: creating auth users, issuing QR credentials, generating event PINs) go through Edge Functions in `functions/`. `functions/_shared/http.ts#requireActor` is the standard gate — it verifies the JWT, loads the profile, checks `is_enabled` + `session_revoked_at` vs `last_sign_in_at`, and enforces a role allowlist. Edge Functions are Deno (`npm:`/`Deno.env` imports) and are excluded from eslint and tsconfig.

### Auth / session model

Username-only login (no email shown). Sessions have a **12-hour hard cap** enforced in `AuthProvider` (`sessionStorage` timestamp) *and* in DB authorization helpers via `session_revoked_at`, so revocation and expiry don't depend on UI polling. `AuthProvider` re-verifies the profile every 60s / on tab focus / on reconnect, and tolerates offline reads using a cached profile. Public signup is disabled (`config.toml` + hosted Auth settings).

### Roles

`super_admin` > `admin` > `faculty` > `officer`.

- **super_admin** — everything. Sole access to departments, audit/activity log, raw QR viewing, event PIN re-viewing, the `/dev` test page (also gated by `import.meta.env.DEV`), and every user action (create, edit, enable/disable, password reset, force logout).
- **admin** — reaches the Users page but can only *assign events* and *delete Faculty/Officer accounts*; all other user management is super-admin-only (`isSuperAdmin` gate in `UsersPage.tsx`). Manages students, events, reports, corrections.
- **officer** — scans assigned events only; cannot write attendance directly (RPC enforces this).

The Super Admin is protected by the `protect_super_admin_profile` trigger and the `delete_user` RPC — demote/disable/delete are blocked in the database, not just hidden in the UI.

### Deployment

Frontend is on Vercel (`npx vercel --prod --yes`), production at `attendlysystem.vercel.app`. `vercel.json`: SPA rewrites to `index.html`, strict CSP (`connect-src` limited to `*.supabase.co`), camera-only Permissions-Policy, immutable `/assets` caching. PWA via `vite-plugin-pwa` with `registerType: 'prompt'` — offline launch serves cached assets only; all data operations still require the network.

### Note on README.md

`README.md` is largely accurate on architecture and security but its "Roadmap" / "Known limitations" sections are stale — they describe PWA work and pagination as not-yet-done, but both shipped. Trust the migrations and code over the README's status claims.
