# Attendly

Attendly is a reusable QR-based event attendance system for schools and organizations. This repository contains **Iterations 1–5 — Foundation, Core Admin, QR Attendance, Reporting, and Design + UX**: a secure Supabase data/RPC layer, polished operational workflows, a production mobile scanner, and live reporting/export tools.

The starter department is Information Technology (`IT`), and events and students use department relationships so each organization can add its own structure.

## Implemented scope

- Username/password staff login backed by Supabase email/password Auth
- Roles: `super_admin`, `faculty`, and `officer`; students never have accounts
- Departments, students, soft deletes, active/inactive students, and profile/session controls
- Validated CSV/XLSX student import with preview, source-row errors, optional matching-record updates, and database revalidation
- One-time and atomic batch student QR credential issuance with SHA-256 hashes only in the database
- Branded QR card rendering with the student's name, ID number, sex, department/year, individual PNG downloads, regeneration, and printable batch sheets
- Department CRUD with protected soft deletion and restoration
- Searchable/filterable student and user management, deleted-student restoration, profile editing, password reset, disabling, and session revocation
- Events, department/year audiences, expected-student functions, assignments, statuses, and hashed six-digit PINs
- Temporary 12-hour PIN access grants for assigned scanners
- Atomic QR/manual attendance RPCs with database time, eligibility/window checks, late calculation, check-out updates, and duplicate-race handling
- Super Admin attendance-correction RPC and administrative audit infrastructure
- RLS on every application table and restricted table/column grants
- Super Admin bootstrap script and seven privileged Edge Functions
- Improved event CRUD, schedule validation, audience summaries, secure PIN lifecycle, status controls, and scanner assignments
- Mobile phone-camera QR scanning with environment-camera preference and a dedicated scan frame
- Event PIN gate, check-in/check-out direction, three-second repeat cooldown, and serial scan processing
- Clear visual results plus optional sound and vibration feedback
- Realtime attendance counters with a polling fallback and recent session activity
- Eligible-student manual attendance search using the same secure attendance rules
- Realtime operational dashboard and event attendance reports
- Department/year-level charts, absent lists, student attendance history, and report filtering
- True `.xlsx` exports with attendance, summary, and absent-list worksheets
- Audited Super Admin attendance correction and removal interface
- Explicit officer event-assignment counts, shortcuts, and empty-state guidance
- Role-based frontend and development-only attendance test panel
- Responsive SaaS interface with a fixed desktop sidebar, mobile navigation, consistent forms, polished tables, and accessible modal dialogs
- Persistent light/dark themes with a no-flash initial load and system-theme default
- Guided loading and empty states plus in-app confirmation dialogs for destructive actions
- Mobile scanner controls, framing guidance, and immediate scan feedback optimized for one-handed use

Iteration 5 intentionally does not include PWA installation or offline support; those remain part of the final deployment iteration.

## Technology

- React, TypeScript, Vite, React Router, and Tailwind CSS
- React Hook Form and Zod
- Papa Parse, read-excel-file, write-excel-file, QRCode, and ZXing Browser for import, real XLSX export, rendering, and camera scanning
- Supabase Auth, PostgreSQL, Row Level Security, RPC functions, Edge Functions, and CLI migrations
- PostgreSQL `pgcrypto` for event PIN hashing

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A Supabase project
- Supabase CLI (the commands below use `npx`, so a global install is optional)

The hosted-project workflow below does not require a separate Node/Express server or a local Docker dependency.

## Install and run the frontend

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` with the browser-safe values from **Supabase Dashboard → Project Settings → API**:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Never put the service-role key in `.env` or any `VITE_` variable. Then run:

```powershell
npm run dev
```

Open `http://localhost:5173`. Production verification commands are:

```powershell
npm run lint
npm run build
npm run preview
```

## Supabase setup

From the repository root:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase config push
npx supabase functions deploy create-user --use-api
npx supabase functions deploy reset-user-password --use-api
npx supabase functions deploy issue-student-qr --use-api
npx supabase functions deploy create-event --use-api
npx supabase functions deploy reset-event-pin --use-api
npx supabase functions deploy batch-issue-student-qrs --use-api
npx supabase functions deploy update-user --use-api
```

`supabase/config.toml` disables public signup for CLI-managed configuration. Confirm in the hosted project's Auth settings that public user signup is disabled before production use. Do not create tables manually in the dashboard; `supabase db push` applies the versioned migrations and seeds `IT`.

The Edge Function environment automatically receives `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from Supabase. Do not add the service-role key to frontend environment variables.

Optional linked-project database lint:

```powershell
npx supabase db lint --linked --level warning
```

## Bootstrap the first Super Admin

Get the project URL and service-role key from the Supabase project settings. Set them only in the terminal running the bootstrap command:

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY'
npm run bootstrap:admin
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

The script prompts for username, full name, and a password of 12–128 characters. Non-interactive username/full-name values are also accepted:

```powershell
npm run bootstrap:admin -- --username admin --full-name "Attendly Administrator"
```

No credentials are hard-coded. The script creates the Supabase Auth user, creates the `super_admin` profile, writes a safe audit entry, and deletes the Auth user again if profile creation fails.

## Username authentication

Users only see a username field. The same normalization is used by the frontend, Edge Function, bootstrap script, and database:

1. Trim and lowercase the username.
2. Allow 3–40 letters, numbers, underscores, or dots.
3. Map it internally to `username@auth.attendly.local`.
4. Call Supabase Auth email/password sign-in.

The internal email is not stored in `profiles` and is never displayed in the normal UI. Public signup is disabled; Super Admin creates staff accounts through the `create-user` Edge Function.

Application sessions have a 12-hour frontend maximum. Disabled accounts and sessions older than `session_revoked_at` are also rejected by database authorization helpers, so revocation is not dependent only on the UI polling interval.

## QR credential security

`issue-student-qr` and `batch-issue-student-qrs` create 256 bits of cryptographically secure randomness per credential and prepend `ATTENDLY_`. They return raw credentials to the authorized Super Admin once. The browser renders temporary QR cards for immediate PNG download or printing.

Before storage, the function computes SHA-256 and calls a service-role-only transactional RPC. PostgreSQL locks issuance for each student, revokes any active credential, stores only the hash and a non-secret prefix, and enforces one active credential per student with a partial unique index. Batch operations are all-or-nothing and accept at most 500 students. A scanner later hashes the received raw value and compares hashes inside the protected attendance RPC. Names, student numbers, and other personal data are never encoded in the credential.

## Event PIN security

The `create-event` and `reset-event-pin` Edge Functions generate a uniform random six-digit PIN. A service-role-only database RPC hashes it using `pgcrypto` Blowfish/bcrypt and stores only `pin_hash`. The plaintext PIN is returned once. Resetting it removes prior access grants.

Assigned staff call `verify_event_pin`; a correct PIN creates or refreshes a 12-hour event access grant. Non-admin attendance processing requires an assignment and a current grant. Super Admin bypasses the PIN grant solely for administration and development testing.

## Database design

Migration `202608280001_foundation.sql` creates:

- `profiles`
- `departments`
- `students`
- `student_qr_credentials`
- `events`
- `event_departments`
- `event_year_levels`
- `event_assignments`
- `event_access_grants`
- `attendance`
- `audit_logs`

Migration `202608280002_secure_functions.sql` creates the principal API functions:

- `get_event_expected_students` / `get_event_expected_count`
- `verify_event_pin`
- `process_attendance_scan` / `process_manual_attendance`
- `admin_correct_attendance`
- `set_user_enabled` / `force_user_logout`
- `update_event_details` / `soft_delete_event`
- service-role-only QR issuance, event creation, and PIN-reset functions

Migration `202608280003_iteration_2_admin.sql` adds:

- `bulk_import_students` with a 2,000-row limit, per-source-row results, and server-side validation
- `get_student_qr_statuses`, batch QR issuance, and student restoration
- protected department deletion/restoration and department audit events
- validated event status changes
- service-role-only user profile updates coordinated with Supabase Auth

Migration `202608280004_iteration_3_scanner.sql` adds:

- authorized live event attendance summaries
- authorized eligible-student search for manual attendance
- the attendance table in the Supabase Realtime publication

Migration `202608280005_iteration_4_reporting.sql` adds:

- secure event attendance report and student history RPCs for Super Admin and authorized faculty
- expected/attended student reconciliation that preserves historical attendance rows
- audited Super Admin attendance removal for correcting an erroneous record back to absent

All important timestamps use `timestamptz`. Attendance timestamps come from PostgreSQL `now()` and never from the scanner client. Absence is derived from expected students minus attendance rows. Check-out updates the original attendance row. Critical historical foreign keys use `ON DELETE RESTRICT`, and normal student/event/department deletion is soft deletion.

## Security model

- Every public application table has RLS enabled.
- Anonymous users receive no application table or RPC access.
- Enabled staff may read only role-appropriate records.
- Faculty may manage events they created and read active students.
- Officers see assigned events and active students but cannot directly write attendance.
- Super Admin manages application records and reads audit logs.
- `student_qr_credentials` has no authenticated select policy or grant.
- `events.pin_hash` is excluded with column-level select privileges.
- Attendance has no authenticated insert/update/delete grant; all normal writes use security-definer RPCs that repeat authorization and eligibility checks.
- The service-role key is used only by Edge Functions and the local bootstrap process.
- Unique `(event_id, student_id)` plus conflict-aware inserts prevents duplicate attendance during concurrent scans.
- Audit metadata never contains passwords, raw QR credentials, or plaintext event PINs.

## Quick end-to-end backend test

1. Apply migrations and deploy all functions.
2. Bootstrap an admin, start the frontend, and sign in with its username/password.
3. In **Students**, create an active IT student or download the CSV template and import a student batch. Correct any source-row validation errors shown in the preview.
4. Select one or more students and issue QR credentials. Download individual PNGs or print the batch sheet before closing the one-time result.
5. In **Events**, create an event targeting IT. Set its check-in window around the current Manila time, save the one-time PIN, assign an officer, and click **Open**.
6. In **Events**, select **Scan** for the open event. Assigned faculty/officers enter the one-time event PIN; Super Admin can open the scanner directly.
7. Allow camera permission and scan a student's Attendly QR card, or use manual attendance search when a card cannot be scanned.
8. Repeat to confirm `already_checked_in`. If the late threshold has passed, the first result is `success_late`; otherwise it is `success_present`.
9. For a `check_in_out` event whose checkout window is open, select `check_out` to verify the existing row is updated and a repeat returns `already_checked_out`.
10. Open **Reports**, select the event, filter its attendance table, inspect department/year summaries, and export the three-sheet Excel workbook.
11. As Super Admin, use **Correct** to edit a check-in or remove an erroneous record. Confirm the report updates automatically.

The development scan page is guarded by Super Admin authorization and `import.meta.env.DEV`; it is not linked in production builds.

## Known Iteration 5 limitations

- CSV and `.xlsx` student imports are supported; legacy `.xls` files must first be saved as `.xlsx` or CSV
- Reports export `.xlsx`; PDF report export is not included
- Attendance history derives eligibility from the student's current department/year because historical profile versions are not stored
- The in-app browser was unavailable during Iteration 5, so final cross-device visual acceptance should be completed on real desktop and mobile devices
- No PWA installation or offline mode yet

## Roadmap

The next explicitly requested phase is **Iteration 6 — PWA, performance, final security review, and deployment QA**.
