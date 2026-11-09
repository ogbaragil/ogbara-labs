# Check Mate

Chess for phones, tablets and desktops. Three ways to play:

- **Solo** against the computer (Easy, Medium or Hard), as White, Black or random
- **Pass & play** on one device, with an option to turn the board for each player
- **Online** on two devices, joined with a four-character code or an invite link

Every mode can be played on the flat **2D board** or a **3D board** (tap the 3D
button or the menu). In 3D, drag to turn the board, pinch or scroll to zoom, and
tap pieces and squares as usual.

Full rules are built in: castling, en passant, promotion, check, checkmate,
stalemate, threefold repetition, the fifty-move rule and insufficient material.
Moves are shown in standard notation and can be copied as PGN.

## Folder layout

| Path | What it is |
|------|------------|
| `public/` | The game: `index.html`, `engine.js`, `ai.js`, `manifest.webmanifest`, `sw.js`, `icons/` |
| `public/engine.js` | Rules, notation, draw rules and the computer player. Used by the app, the AI worker **and** the Cloudflare Worker |
| `public/ai.js` | Web worker that runs the computer's search off the main thread |
| `public/board3d.js` | The 3D board, bundled with the parts of three.js it uses (MIT). Loaded only when a player turns 3D on |
| `tools/board3d.src.js` | Source for `board3d.js` — rebuild with `npm run build:3d` |
| `src/worker.js` | Serves `public/` and runs online games |
| `wrangler.toml` | Cloudflare settings (Worker, static assets, Durable Object) |

No build step to deploy. (`board3d.js` is prebuilt and committed; you only rebuild it if you change the 3D board.) The piece artwork is original SVG in `index.html`, and all sound
is made in the browser.

## Why this one is a Worker, not a Pages project

Same reason as Iron Squad and Tilecraft: online games need a **Durable Object**,
which Pages can't host. The Worker serves `public/` and adds:

- `/api/ping` so the app knows online play is available (if not, the Online
  option stays hidden and solo / pass & play still work)
- `/ws?room=CODE&role=host|guest&name=…&token=…`, the game connection

The Durable Object is the **referee**. It keeps the move list, checks every move
with `engine.js`, and decides the result (checkmate, stalemate, repetition,
fifty-move rule, insufficient material, resignation or an agreed draw).

- colours are random for the first game and swap on each rematch
- either player can close the app and come back; their seat is kept by a token
  saved on their device (**Rejoin online game** on the menu)
- draw offers: offer, accept or decline; making a move clears any offer
- opening the same game on a second screen takes over from the first
- quiet games are deleted after 14 days

## Deploy

1. Cloudflare dashboard: **Workers & Pages → Create → Import a repository** →
   pick this repo.
2. Set **Root directory** (under advanced settings) to `checkmate`.
3. Leave the build command empty. The deploy command is `npx wrangler deploy`.
4. Deploy. Then open the Worker's **Settings → Domains & Routes** and add the
   custom domain `checkmate.ogbara.com.au`.
5. Optional: in **Settings → Build → Build watch paths**, include `checkmate/*`.

## Run locally

```
cd checkmate
npm install
npx wrangler dev
```

Open http://localhost:8787 in a normal and a private window to try online play.

## Releasing an update

Edit files in `public/`, then bump `CACHE` in `public/sw.js`
(`checkmate-v1` → `checkmate-v2`). If you change `engine.js` or `ai.js`, also
bump their `?v=` everywhere they're referenced (`index.html`, `ai.js`, `sw.js`).

To change the 3D board, edit `tools/board3d.src.js`, then:

```
npm install
npm run build:3d
```

and bump the `?v=` on `board3d.js` in `public/index.html`.
