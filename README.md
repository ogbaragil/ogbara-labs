# Ogbara Labs — monorepo

A tiny studio of joyful web apps. Every app is a standalone PWA: installable to
the home screen, fully offline, zero build step, zero external assets (all audio
is synthesised in the browser, all data stays on the user's device).

## Layout

| Folder         | App                        | Subdomain                     |
|----------------|----------------------------|-------------------------------|
| `home/`        | Landing hub                | `ogbaralabs.com` (apex + www) |
| `howmany/`     | How Many? (kids learning)  | `howmany.ogbaralabs.com`      |
| `lifegrid/`    | Life Grid (life in months) | `lifegrid.ogbaralabs.com`     |
| `couples/`     | Couples Snakes & Ladders   | `couples.ogbaralabs.com`      |
| `supersnakes/` | Super Snakes (family)      | `supersnakes.ogbaralabs.com`  |

Each folder is self-contained: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`
(How Many? also has a separate `app.js`).

## Run locally

PWAs need HTTP (not file://). From the repo root:

    python3 -m http.server 8080

Then open e.g. http://localhost:8080/supersnakes/

## Deploy on Cloudflare Pages (one project per app)

Create **five** Pages projects, all connected to this same GitHub repo:

1. Workers & Pages → Create → Pages → Connect to Git → pick this repo
2. Framework preset: **None** · Build command: **(empty)** · Build output directory: **/**
3. **Root directory (advanced)**: set per project → `home`, `howmany`, `lifegrid`, `couples`, `supersnakes`
4. Save & Deploy
5. In each project → **Custom domains** → add its subdomain (the `home` project
   gets `ogbaralabs.com` and `www.ogbaralabs.com`)

Optional: in each project's Settings → Builds → **Build watch paths**, set the
include path to that app's folder (e.g. `supersnakes/*`) so a push only rebuilds
the apps that changed.

## Updating an app

Edit, commit, push — Cloudflare redeploys automatically. When you ship changes,
bump the cache version in that app's `sw.js` (e.g. `supersnakes-v1` → `-v2`)
so installed users pick up the new version promptly.

## Notes per app

- **How Many?** — sounds synthesised (Web Audio), speech via Web Speech API,
  progress in localStorage.
- **Life Grid** — text data in localStorage; photos are downscaled and stored
  in IndexedDB. Nothing ever leaves the device.
- **Couples S&L** — names/settings in localStorage (same `snl_*` keys as the
  original Expo app), optional photo avatars in IndexedDB, romantic music loop
  synthesised.
- **Super Snakes** — editable family names with emoji avatars by default and
  optional photos (IndexedDB). Quest rules, power-ups, and the exact-100 rule
  match the original.
