# Cleared

Cleared is a local-first PWA that scans statements, tracks due dates and amounts owing, sends reminders, and shows history, forecast and insights.

> The product is named **Cleared**. The folder, Cloudflare Pages project, and worker keep the `billminder` name (and `billminder.ogbaralabs.xyz` subdomain) so the existing deployment is preserved. Rename the Pages project and subdomain to `cleared` later if you want the URL to match.

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
- PDF upload with browser-side decoding for text-readable compressed PDFs.
- AI extraction fallback through a Cloudflare Pages Function.
- Add/edit bills with biller, amount, due date, **category**, **recurrence**, reference, and notes.
- Dashboard: a "cleared" status gauge (paid vs outstanding this month), due today/this week/this month/next 30 days cards, upcoming bills, cash-flow forecast, category breakdown, calendar, recent activity, and smart insights.
- Recurring bills (weekly to yearly) that roll the schedule forward when marked paid, powering the forecast.
- Bills, calendar, and forecast views; a bill detail sheet with mark paid / reschedule / edit / delete and payment history.
- Local browser storage with optional cloud sync for bills and reminder settings.
- Email/password login, account signup, and password reset through Supabase Auth, with a "stay signed in" option and automatic session refresh.
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

`OPENAI_MODEL` is optional and defaults to `gpt-4.1-mini`.

Supabase Auth must have email/password signups enabled. For password reset links, add your Cloudflare Pages URL to the Supabase Auth redirect URLs.

The hosted app uses `functions/api/bills.js` for bill sync (GET to load, POST to upsert, DELETE to remove) and `functions/api/settings.js` for reminder settings sync. `functions/api/auth/refresh.js` exchanges a refresh token for a new session so logins survive past the access-token expiry.

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

This first version decodes common text-readable PDF streams in the browser, then asks the user to confirm or correct the fields. Scanned bills still need OCR and should be entered manually until a backend extraction service is added.
