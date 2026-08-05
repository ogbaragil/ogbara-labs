# Cleared

Cleared is a local-first PWA that scans statements, tracks due dates and amounts owing, sends reminders, and shows history, forecast and insights.

> The product is named **Cleared**. The folder, Cloudflare Pages project, and worker keep the `billminder` name (and `billminder.ogbara.com.au` subdomain) so the existing deployment is preserved. Rename the Pages project and subdomain to `cleared` later if you want the URL to match.

## Run locally

```sh
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## What it does

- Installable PWA shell with offline caching.
- PDF or photo upload with AI-powered extraction (the only extraction path — see note below).
- Add/edit bills with biller, amount, due date, **category**, **recurrence**, reference, and notes.
- Keeps the uploaded scan in Supabase Storage so you (and any household member) can view it while the bill is unpaid; it's deleted automatically the moment the bill is marked paid.
- Dashboard: a "cleared" status gauge (paid vs outstanding this month), due today/this week/this month/next 30 days cards, upcoming bills, cash-flow forecast, category breakdown, calendar, recent activity, and smart insights.
- Recurring bills (weekly to yearly) that roll the schedule forward when marked paid, powering the forecast.
- Bills, calendar, and forecast views; a bill detail sheet with mark paid / reschedule / edit / delete and payment history.
- Local browser storage with optional cloud sync for bills and reminder settings.
- Email/password login, account signup, and password reset through Supabase Auth, with a "stay signed in" option and automatic session refresh.
- Shared households: invite a partner by email; once they accept, both people see and edit one pooled set of bills and both receive reminders.
- JSON export and import for backups and device transfers.
- Synced email reminder settings per signed-in user.
- Scheduled email reminders through a Cloudflare Worker Cron Trigger and Resend.

## Supabase

Run `supabase/schema.sql` in a Supabase project SQL editor. Re-run it after this update so the new `category`, `recurrence`, and `anchor_day` columns (plus `user_settings`, payment note fields, `user_id`, `client_bill_id`, indexes, and authenticated policies) are created. The statements are idempotent, so re-running is safe.

The MVP policy allows anon sync only when the request includes the browser's generated sync secret. Add Supabase Auth and per-user row-level security before using this for real shared or sensitive production data.
Logged-in users sync through Supabase Auth and `user_id`. The hosted app requires sign-in before the dashboard can be used.

## Cloudflare Pages

This is a static site. In Cloudflare Pages, set:

- Build command: none
- Build output directory: `.`

Add this Cloudflare Pages secret:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`OPENAI_MODEL` is optional and defaults to `gpt-4.1-mini`. `SUPABASE_SERVICE_ROLE_KEY` is required only for the shared-household (partner) feature; the invite/accept/leave functions use it to make the cross-user changes that row-level security deliberately blocks for normal users. Keep it server-side only.

Supabase Auth must have email/password signups enabled. For password reset links, add your Cloudflare Pages URL to the Supabase Auth redirect URLs.

The hosted app uses `functions/api/bills.js` for bill sync (GET to load, POST to upsert, DELETE to remove) and `functions/api/settings.js` for reminder settings sync. `functions/api/auth/refresh.js` exchanges a refresh token for a new session so logins survive past the access-token expiry. `functions/api/household.js`, `functions/api/household/invite.js`, and `functions/api/household/accept.js` power partner sharing.

The included `_headers`, `wrangler.toml`, and `functions/` directory are ready for Cloudflare Pages.

## Reminder Worker

Guaranteed email reminders need the included Cloudflare Worker in `worker/reminder-worker.js`.

Create a separate Worker using `wrangler.reminders.toml`, then add these Worker secrets:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional Worker secrets:

- `RESEND_ALLOWED_TO`
- `REMINDER_CRON_SECRET`

The Worker cron is set to `0 18 * * *`, which runs daily at 18:00 UTC. It checks each user's saved timezone and reminder lead time, sends due reminder emails, and marks each bill as reminded so duplicate emails are avoided.

## Extraction note

AI extraction is now the only extraction path — there is no browser-side PDF.js text extraction, offline regex parser, or on-device OCR anymore. Every uploaded PDF or photo is sent straight to the AI extractor, which runs through a Cloudflare Pages Function to the OpenAI Responses API as `input_file` (PDFs) or `input_image` (photos) items, constrained to a bill-details JSON schema. This runs automatically as soon as a file is selected, dropped, or scanned with the camera; the "Retry AI extract" button re-runs it on demand. Because this depends on the hosted Cloudflare Pages Function, AI extraction — and therefore all extraction — is unavailable when running purely locally without that backend; bills must be entered manually in that case.

## Scanned document storage

When you attach a PDF or photo to a bill, Cleared uploads it to a private `bill-documents` bucket in Supabase Storage via `functions/api/documents.js`. While the bill is unpaid, a "View scanned document" button on the bill's detail sheet fetches a short-lived signed URL and shows it. The moment the bill is marked paid — including via the recurring-bill auto-advance — the stored file is deleted. Deleting a bill (or clearing all bills) also removes its stored document. As a safety net, `functions/api/bills.js` also purges any document for a bill it receives marked as paid or deleted, in case the direct delete call never reached the server (e.g. the app was closed offline).

Documents are scoped the same way bills are: by household, by signed-in user, or — for anonymous/local-only use — by the device's `appInstanceId` + `syncSecret` pair. The server never trusts a path the client sends; it always recomputes the storage path itself from the caller's identity, so a request can only ever reach its own scope's documents. The upload/view/delete endpoints use the `SUPABASE_SERVICE_ROLE_KEY` secret (already required for household sharing) — the browser never receives it. Since document storage runs through the hosted Cloudflare Function, it's unavailable when running purely locally without that backend.

Create the storage bucket once, from the Supabase SQL editor:

```sql
insert into storage.buckets (id, name, public)
values ('bill-documents', 'bill-documents', false)
on conflict (id) do nothing;
```

No storage RLS policies are needed on this bucket — all access goes through the Pages Function using the service-role key, which bypasses RLS, with authorization enforced in the function itself.

