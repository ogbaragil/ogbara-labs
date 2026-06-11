# Ogbara Labs — monorepo

A tiny studio of joyful web apps. Every app is a standalone PWA: installable to
the home screen, fully offline, zero build step, zero bundled media assets (all
audio is synthesised in the browser). Apps are local-first, with an optional
shared Ogbara Labs account (Supabase) for cross-device sync — see
SETUP-SUPABASE.md.

## Layout

| Folder         | App                        | Subdomain                    |
|----------------|----------------------------|------------------------------|
| `home/`        | Landing hub                | `ogbara.com.au` (apex + www) |
| `howmany/`     | How Many? (kids learning)  | `howmany.ogbara.com.au`      |
| `brainytrails/`| Brainy Trails (maths 5–11) | `brainytrails.ogbara.com.au` |
| `lifegrid/`    | Life Grid (life in months) | `lifegrid.ogbara.com.au`     |
| `couples/`     | Couples Snakes & Ladders   | `couples.ogbara.com.au`      |
| `supersnakes/` | Super Snakes (family)      | `supersnakes.ogbara.com.au`  |
| `billminder/`  | Bill Minder (bill tracker) | `billminder.ogbara.com.au`   |
| `kajolacare/`  | Kajola Care (care ops)     | `kajolacare.ogbara.com.au`   |

Most folders are self-contained: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`
(How Many? also has a separate `app.js`).

**Two apps are exceptions to "pure static."**

**Bill Minder** still ships as a static PWA shell (no build step), but its sync,
auth, AI bill extraction, and scheduled email reminders run server-side: a
`functions/` directory (Cloudflare Pages Functions) plus a separate cron Worker
in `worker/`. It needs Pages secrets and has a companion Worker. Full setup is in
`SETUP-SUPABASE.md` and `billminder/README.md`.

**Kajola Care** is the one app with a real **build step**: it is a Vite + React
single-page app (NDIS care-operations workspace — clients, invoices, transactions,
staff shifts, and an employee portal). Its Pages project runs `npm install` and
`npm run build` to produce `dist/`, instead of serving the folder as-is. It has
its own Supabase tables (additive to the shared project, like Bill Minder) and an
employee-portal sign-in. Full setup is in `SETUP-SUPABASE.md` and
`kajolacare/README.md`. (The committed `dist/` from the standalone repo was left
out on purpose — Cloudflare rebuilds it on every push.)

## Run locally

PWAs need HTTP (not file://). From the repo root:

    python3 -m http.server 8080

Then open e.g. http://localhost:8080/supersnakes/

**Kajola Care is the exception** — it's a Vite app, so it has its own dev server:

    cd kajolacare && npm install && npm run dev

(then open the URL Vite prints, e.g. http://localhost:5173/). `npm run build`
produces `dist/`, which is what Cloudflare serves in production.

## Deploy on Cloudflare Pages (one project per app)

Create **one Pages project per app**, all connected to this same GitHub repo:

1. Workers & Pages → Create → Pages → Connect to Git → pick this repo
2. Framework preset: **None** · Build command: **(empty)** · Build output directory: **/**
3. **Root directory (advanced)**: set per project → `home`, `howmany`, `brainytrails`, `lifegrid`, `couples`, `supersnakes`
4. Save & Deploy
5. In each project → **Custom domains** → add its subdomain (the `home` project
   gets `ogbara.com.au` and `www.ogbara.com.au`)

**Kajola Care's project is configured differently** because it builds:
- Root directory: `kajolacare`
- Framework preset: **Vite** (or None)
- Build command: **`npm run build`**
- Build output directory: **`dist`**
- Custom domain: `kajolacare.ogbara.com.au`
- Add a **catch-all rewrite to `index.html`** so the employee-portal routes
  (`/employee`, `/employee-portal`, `/worker`, `/staff`) resolve in this SPA.
  `kajolacare/public/_redirects` already contains `/* /index.html 200`, which
  Cloudflare Pages honours automatically.
- Supabase env vars are optional (the app falls back to the values baked into
  `kajolacare/public/supabase-config.js`); see `SETUP-SUPABASE.md`.

Optional: in each project's Settings → Builds → **Build watch paths**, set the
include path to that app's folder (e.g. `supersnakes/*`) so a push only rebuilds
the apps that changed.

## Updating an app

Edit, commit, push — Cloudflare redeploys automatically. When you ship changes,
bump the cache version in that app's `sw.js` (e.g. `supersnakes-v1` → `-v2`)
so installed users pick up the new version promptly.

## Premium voice (optional, free)

Brainy Trails can speak with a studio-quality Australian voice (Google Cloud TTS)
proxied through a tiny Cloudflare Worker so the API key never reaches clients.
Setup takes ~10 minutes — full steps in `tts-worker/README.md`. Once deployed,
set `window.TTS_PROXY` in `brainytrails/supabase-config.js` and release as usual.
Leave it `""` and the app simply uses the best installed device voice.

## Releasing a Brainy Trails update

Version skew between the shell and scripts blanks the map on stale caches, so every release bumps the cache version everywhere at once. This used to mean hand-editing three places in lockstep; now one command does it:

```
cd brainytrails && node release.js        # vN → v(N+1), or: node release.js 23
```

It rewrites all coupled stamps together — `sw.js` `CACHE`, the `?v=` strings in `sw.js` `ASSETS`, the matching `?v=` on `curriculum.js`/`cloud.js`/`app.js` in `index.html`, and the `APP_V` diagnostics stamp in `app.js`.

Run the regression suite before pushing — all suites must pass (generator contract, prerequisite graph, mastery engine, UI, the v12 fixes):

```
cd brainytrails && node tests/run-all.js
```

After deploying, load the site once in a browser so the new service worker takes over.

**Manual smoke checklist** (the headless suite can't see CSS/layout — these five caught every real-device bug so far):
1. Map renders all six islands; 📍 marker bounces on the frontier.
2. Start a practice set: answers sit in the bottom dock; tapped buttons flash/shake.
3. Tap the 👨‍👩‍👧 button: gate asks for year of birth; a child year shows only "pass the device to a grown-up".
4. Premium voice sample speaks within ~1 s (signed in, proxy configured).
5. With 2+ children: "Who's playing?" appears at startup and switching keeps progress separate.

Also set a **Google Cloud budget alert** (Billing → Budgets, e.g. $1) so a TTS quota surprise emails you before it bills you.
Developer testing: Parents' Corner (hold the 👨‍👩‍👧 button 3 s) → "🧪 Test mode" unlocks every skill and boss in a throwaway sandbox profile that never syncs and resets on each entry.

## Cloud sync (optional)

Each app folder contains `cloud.js` (shared sync module) and
`supabase-config.js` (empty by default). With the config empty, apps are 100%
local. Fill in your Supabase URL + anon key (same values in all four apps) and
a ☁️ account button appears: email+password sign-in, automatic state sync
(last-write-wins), and photo/avatar upload to a private storage bucket.
Full setup including SQL: **SETUP-SUPABASE.md**.

## Notes per app

- **How Many?** — sounds synthesised (Web Audio), speech via Web Speech API,
  progress in localStorage; cloud-syncs stars/VIP/stickers/settings.
- **Life Grid** — months/profile in localStorage, photos downscaled into
  IndexedDB; cloud-syncs the journal and uploads photos to storage so they
  follow you to new devices.
- **Couples S&L** — names/settings in localStorage (same `snl_*` keys as the
  original Expo app), avatars in IndexedDB; cloud-syncs prefs + avatars.
- **Super Snakes** — editable family names, emoji avatars with optional photos;
  cloud-syncs the family roster + avatars. Quest rules, power-ups, and the
  exact-100 rule match the original.
