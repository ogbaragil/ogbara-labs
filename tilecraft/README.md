# Tilecraft

A crossword tile game for phones, tablets and desktops. Build words on a 15×15
board with the standard 100 tiles, premium squares and +50 bingo. Three ways to
play:

- **Solo** against the computer (Easy, Medium or Hard)
- **Same device**: pass-and-play for two, with racks hidden between turns
- **Online**: two devices, joined with a four-character code or an invite link

## Folder layout

| Path | What it is |
|------|------------|
| `public/` | The game: `index.html`, `engine.js`, `words.dawg`, `manifest.webmanifest`, `sw.js`, `icons/` |
| `public/engine.js` | Rules, scoring, word checking and the computer player. Used by the app **and** the Worker |
| `public/words.dawg` | The ENABLE word list (public domain, ~170k words) packed into a 475 KB graph |
| `src/worker.js` | Serves `public/` and runs online games |
| `wrangler.toml` | Cloudflare settings (Worker, static assets, Durable Object) |
| `tools/build-dawg.js` | Rebuilds `words.dawg` from a plain word list |

There's no build step and all sound is made in the browser.

## Why this one is a Worker, not a Pages project

Online games need a **Durable Object** to hold each game, and Pages projects
can't host one. So Tilecraft deploys the same way as Iron Squad: a **Worker
with static assets**. The Worker serves `public/` and adds two routes:

- `/api/ping` lets the app check that online play is available. If it isn't
  (e.g. served by `python3 -m http.server`), the Online option stays hidden and
  solo and same-device play still work.
- `/ws?room=CODE&role=host|guest&name=…&token=…` is the game connection.

Unlike Iron Squad's relay, the Durable Object is the **referee**: it keeps the
board, the bag and both racks, checks every move with the same `engine.js`, and
only sends each player their own tiles. That means:

- either player can close the app and come back later; the game waits
- a player's seat is kept by a token saved on their device, so reopening the app
  (or the **Rejoin online game** button) puts them straight back in
- opening the same game on a second screen takes over from the first
- quiet games are deleted after 14 days

Durable Objects that use SQLite storage are included in the free Workers plan.

## Deploy

1. Cloudflare dashboard: **Workers & Pages → Create → Import a repository** →
   pick this repo.
2. Set **Root directory** (under advanced settings) to `tilecraft`.
3. Leave the build command empty. The deploy command is `npx wrangler deploy`.
4. Deploy. Then open the Worker's **Settings → Domains & Routes** and add the
   custom domain `tilecraft.ogbara.com.au`.
5. Optional: in **Settings → Build → Build watch paths**, include `tilecraft/*`
   so only Tilecraft changes redeploy it.

## Run locally

```
cd tilecraft
npm install
npx wrangler dev
```

Open http://localhost:8787 in two browser windows (or one normal and one
private window, so each has its own seat) to try online play.

## Releasing an update

Edit files in `public/`, then bump `CACHE` in `public/sw.js`
(`tilecraft-v2` → `tilecraft-v3`). If you change `engine.js`, also bump its
`?v=` in both `public/index.html` and `public/sw.js`. The Worker picks up
`engine.js` changes on deploy, so app and referee stay in step.

To change the word list:

```
node tools/build-dawg.js my-words.txt public/words.dawg
```
