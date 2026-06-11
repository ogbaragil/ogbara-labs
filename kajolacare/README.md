# Kajola Care

Kajola Care is an NDIS care-operations workspace: clients, invoices (with PDF
generation), transactions, staff/worker management, schedules and shifts, plus an
**employee portal** where staff sign in with their own username/password to view
and update only their own shifts. It is part of the Ogbara Labs monorepo.

Unlike the other Ogbara Labs apps (zero-build static PWAs), Kajola Care is a
**Vite + React** single-page app, so it has a real build step.

## Run locally

```sh
cd kajolacare
npm install
npm run dev      # Vite dev server, prints a localhost URL
```

Build the production bundle (what Cloudflare serves):

```sh
npm run build    # outputs dist/
npm run preview  # serve the built dist/ locally to check it
```

## Routes

- `/` — main app (admin sign-in via Supabase Auth).
- `/employee`, `/employee-portal`, `/worker`, `/staff` — employee portal
  (username/password sign-in only). These are client-side routes; production
  hosting must fall back to `index.html` (handled by `public/_redirects`).

## Supabase

This app shares the one Ogbara Labs Supabase project but uses its own tables and
RPCs. Run `supabase/schema.sql` once in the Supabase SQL Editor (idempotent — safe
to re-run). Full steps, including the employee-portal RPCs and the Cloudflare
Pages build settings, are in the repo root `SETUP-SUPABASE.md`.

Config resolution order (first match wins), handled in `src/supabaseClient.js`:
1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Cloudflare Pages build vars)
2. `window.LG_FLOW_SUPABASE_CONFIG` from `public/supabase-config.js` (shipped
   pre-filled with the shared Ogbara Labs project values)
3. A config saved in the browser from the in-app setup screen

## Deploy

One Cloudflare Pages project, root directory `kajolacare`, build command
`npm run build`, output directory `dist`, custom domain
`kajolacare.ogbara.com.au`. See `SETUP-SUPABASE.md` → "Kajola Care".

> The committed `dist/` from the original standalone repo was intentionally left
> out of the monorepo — Cloudflare rebuilds it from source on every push, and the
> old `dist/` carried ~46 MB of duplicated build artifacts.

---

## Changelog

### v16.7 — Schedule Load Fix + Employee Portal Route
- Fixed Schedule page loading by normalising shift records before rendering.
- Stronger null-safety for workers, clients and shift data from Supabase/local snapshots.
- Independent employee portal routes: `/employee`, `/employee-portal`, `/worker`, `/staff`
  (employee username/password sign-in only).
- Admin login remains on the main app route `/`.
- Employee shift actions auto-save to Supabase through the employee-portal RPC functions.
- Admin auto-loads cloud data on sign-in but does not auto-backup edits unless manually synced.
