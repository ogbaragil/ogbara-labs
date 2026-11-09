# Iron Squad

A retro tank-defence arcade game for phones. Guard the beacon across ten
sectors, beat the Ironclad boss, build your own maps, or play online co-op
with a friend using a four-letter code.

## Folder layout

| Path | What it is |
|------|------------|
| `public/` | The game itself: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` |
| `src/worker.js` | Serves `public/` and relays co-op messages between two phones |
| `wrangler.toml` | Cloudflare settings (Worker, static assets, Durable Object) |

The whole game is `public/index.html`. There's no build step, and all sound
and music is made in the browser.

## Why this one is a Worker, not a Pages project

Online co-op needs a **Durable Object** to pair two phones by game code, and
Pages projects can't host one on their own. So Iron Squad deploys as a
**Worker with static assets**. The Worker serves the files in `public/` and
handles two extra routes:

- `/api/ping` lets the game check that co-op is available. If it isn't, the
  co-op buttons stay hidden and everything else still works.
- `/ws?room=CODE&role=host|guest` is the WebSocket relay. The host's phone runs
  the game, and the Worker only passes messages between the two players.

Durable Objects that use SQLite storage are included in the free Workers plan.

## Deploy

1. Cloudflare dashboard: **Workers & Pages → Create → Import a repository** →
   pick this repo.
2. Set **Root directory** (under advanced settings) to `ironsquad`.
3. Leave the build command empty. The deploy command is `npx wrangler deploy`.
4. Deploy. Then open the Worker's **Settings → Domains & Routes** and add the
   custom domain `ironsquad.ogbara.com.au`.
5. Optional: in **Settings → Build → Build watch paths**, include `ironsquad/*`
   so only Iron Squad changes redeploy it.

## Run locally

```
cd ironsquad
npm install
npx wrangler dev
```

Open http://localhost:8787 in two browser windows to try co-op.

You can also serve `public/` with `python3 -m http.server`. Solo play works
that way, but co-op stays hidden because there's no Worker.

## Releasing an update

Edit `public/index.html`, then bump `CACHE` in `public/sw.js`
(`ironsquad-v1` → `ironsquad-v2`) so installed players get the new version.

## Data

Progress is stored in the player's browser (`localStorage`): best score,
unlocked sectors, stars, Workshop credits and upgrades, control settings, and
up to 12 custom maps. Nothing is sent anywhere except co-op game messages,
which pass through the Worker while a game is on and aren't stored.
