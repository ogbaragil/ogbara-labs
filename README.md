# Ogbara Labs — monorepo

A tiny studio of joyful web apps. Every app is a standalone PWA: installable to
the home screen, fully offline, zero build step, zero bundled media assets (all
audio is synthesised in the browser). Apps are local-first, with an optional
shared Ogbara Labs account (Supabase) for cross-device sync — see
SETUP-SUPABASE.md.

## Layout

| Folder         | App                        | Subdomain                     |
|----------------|----------------------------|-------------------------------|
| `home/`        | Landing hub                | `ogbaralabs.xyz` (apex + www) |
| `howmany/`     | How Many? (kids learning)  | `howmany.ogbaralabs.xyz`      |
| `brainytrails/`| Brainy Trails (maths 5–11) | `brainytrails.ogbaralabs.xyz` |
| `lifegrid/`    | Life Grid (life in months) | `lifegrid.ogbaralabs.xyz`     |
| `couples/`     | Couples Snakes & Ladders   | `couples.ogbaralabs.xyz`      |
| `supersnakes/` | Super Snakes (family)      | `supersnakes.ogbaralabs.xyz`  |
| `billminder/`  | Bill Minder (bill tracker) | `billminder.ogbaralabs.xyz`   |

Each folder is self-contained: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`
(How Many? also has a separate `app.js`).

**Bill Minder is the one exception to "pure static."** It still ships as a static
PWA shell (no build step), but its sync, auth, AI bill extraction, and scheduled
email reminders run server-side: a `functions/` directory (Cloudflare Pages
Functions) plus a separate cron Worker in `worker/`. It is therefore the only app
whose Pages project needs secrets, and the only one with a companion Worker. Full
setup is in `SETUP-SUPABASE.md` and `billminder/README.md`.

## Run locally

PWAs need HTTP (not file://). From the repo root:

    python3 -m http.server 8080

Then open e.g. http://localhost:8080/supersnakes/

## Deploy on Cloudflare Pages (one project per app)

Create **five** Pages projects, all connected to this same GitHub repo:

1. Workers & Pages → Create → Pages → Connect to Git → pick this repo
2. Framework preset: **None** · Build command: **(empty)** · Build output directory: **/**
3. **Root directory (advanced)**: set per project → `home`, `howmany`, `brainytrails`, `lifegrid`, `couples`, `supersnakes`
4. Save & Deploy
5. In each project → **Custom domains** → add its subdomain (the `home` project
   gets `ogbaralabs.xyz` and `www.ogbaralabs.xyz`)

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
