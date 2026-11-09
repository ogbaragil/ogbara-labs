// Tilecraft online play.
// Serves the game from /public and runs each online game inside a Durable Object keyed by a
// 4-character code. The Durable Object is the referee: it holds the board, the bag and both racks,
// checks every move against the same engine the app uses, and only ever sends a player their own
// tiles. Games survive either phone closing the app, and are deleted after 14 quiet days.
import { DurableObject } from "cloudflare:workers";
import "../public/engine.js";

const TC = globalThis.TC;
const EXPIRE_MS = 14 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Z0-9]{4}$/;

let dict = null; // shared across rooms in this isolate
function loadDict(env) {
  if (TC.ready()) return null;
  dict = dict || env.ASSETS.fetch(new Request("https://assets.local/words.dawg"))
    .then((r) => { if (!r.ok) throw new Error("word list missing"); return r.arrayBuffer(); })
    .then((b) => TC.loadDawg(b))
    .catch((e) => { dict = null; throw e; });
  return dict;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ping") {
      return Response.json({ game: "tilecraft" }, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket connection", { status: 426 });
      const room = (url.searchParams.get("room") || "").toUpperCase();
      if (!CODE_RE.test(room)) return new Response("Invalid game code", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      const fwd = new URL(request.url); fwd.searchParams.set("room", room);
      return stub.fetch(new Request(fwd, request));
    }
    return env.ASSETS.fetch(request);
  },
};

const clean = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 14);
const token = () => crypto.randomUUID();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      this.seats = (await ctx.storage.get("seats")) || [];   // [{token, name}]
      this.g = (await ctx.storage.get("g")) || null;          // game state once both have joined
      this.code = (await ctx.storage.get("code")) || "";
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "host" ? "host" : "guest";
    const tok = url.searchParams.get("token") || "";
    const name = clean(url.searchParams.get("name"));
    const [client, server] = Object.values(new WebSocketPair());

    let seat = this.seats.findIndex((s) => s.token && s.token === tok);
    let error = null;
    if (seat < 0) {
      if (role === "host") {
        if (this.seats.length) error = "taken";
        else { this.seats = [{ token: token(), name: name || "Player 1" }]; seat = 0; this.code = url.searchParams.get("room") || ""; }
      } else {
        if (!this.seats.length) error = "nohost";
        else if (this.seats.length >= 2) error = "full";
        else { this.seats.push({ token: token(), name: name || "Player 2" }); seat = 1; }
      }
    }
    if (error) {
      // Rejected sockets never join the room.
      server.accept();
      server.send(JSON.stringify({ t: "err", e: error }));
      server.close(4000, error);
      return new Response(null, { status: 101, webSocket: client });
    }

    // A newer connection for the same seat replaces the old one (e.g. reopened app).
    for (const old of this.ctx.getWebSockets("s" + seat)) { try { old.close(4001, "replaced"); } catch (e) {} }
    this.ctx.acceptWebSocket(server, ["s" + seat]);

    if (!this.g && this.seats.length === 2) {
      try { await loadDict(this.env); } catch (e) {}
      this.newGame(Math.random() < 0.5 ? 0 : 1);
    }
    await this.persist();
    server.send(JSON.stringify({ t: "welcome", seat, token: this.seats[seat].token, code: this.code }));
    this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  newGame(first) {
    const bag = TC.newBag();
    const players = this.seats.map(() => ({ score: 0, rack: [] }));
    for (const p of players) while (p.rack.length < TC.RACK) p.rack.push(bag.pop());
    this.g = { board: Array(225).fill(null), bag, players, turn: first, first, moves: [], scoreless: 0,
               over: false, last: [], rematch: [false, false], resigned: -1, n: (this.g ? this.g.n + 1 : 1) };
  }

  async persist() {
    await this.ctx.storage.put({ seats: this.seats, g: this.g, code: this.code });
    await this.ctx.storage.setAlarm(Date.now() + EXPIRE_MS);
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(4002, "expired"); } catch (e) {} }
    await this.ctx.storage.deleteAll();
    this.seats = []; this.g = null;
  }

  online(k, except) { return this.ctx.getWebSockets("s" + k).some((ws) => ws !== except); }

  stateFor(seat, except) {
    const g = this.g;
    return {
      t: "state", seat, code: this.code, started: !!g, n: g ? g.n : 0,
      players: this.seats.map((s, k) => ({ name: s.name, score: g ? g.players[k].score : 0,
        tiles: g ? g.players[k].rack.length : 0, online: this.online(k, except) })),
      board: g ? g.board : Array(225).fill(null), bag: g ? g.bag.length : 0,
      turn: g ? g.turn : 0, moves: g ? g.moves : [], scoreless: g ? g.scoreless : 0,
      over: g ? g.over : false, last: g ? g.last : [], rematch: g ? g.rematch : [false, false],
      resigned: g ? g.resigned : -1, rack: g ? g.players[seat].rack : [],
    };
  }

  broadcastState(except) {
    for (let k = 0; k < this.seats.length; k++)
      for (const ws of this.ctx.getWebSockets("s" + k)) {
        if (ws === except) continue;
        try { ws.send(JSON.stringify(this.stateFor(k, except))); } catch (e) {}
      }
  }

  reject(ws, msg) { try { ws.send(JSON.stringify({ t: "reject", msg })); } catch (e) {} }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 8192) return;
    let m; try { m = JSON.parse(message); } catch (e) { return; }
    const seat = +this.ctx.getTags(ws)[0].slice(1);
    const g = this.g;
    if (m.t === "hello") { ws.send(JSON.stringify(this.stateFor(seat))); return; }
    if (!g) return this.reject(ws, "Waiting for the other player to join.");

    if (m.t === "rematch") {
      if (!g.over) return;
      g.rematch[seat] = true;
      if (g.rematch.every(Boolean)) this.newGame(1 - (g.first | 0)); // loser of the coin toss goes first next time
      await this.persist(); this.broadcastState(); return;
    }
    if (m.t === "resign") {
      if (g.over) return;
      g.resigned = seat; g.over = true;
      g.moves.push({ p: seat, t: "resign" });
      await this.persist(); this.broadcastState(); return;
    }
    if (g.over) return this.reject(ws, "The game is over.");
    if (g.turn !== seat) return this.reject(ws, "It's not your turn.");
    const me = g.players[seat];

    if (m.t === "play") {
      try { await loadDict(this.env); } catch (e) { return this.reject(ws, "Word list unavailable, try again."); }
      const raw = Array.isArray(m.placements) ? m.placements.slice(0, 7) : [];
      const used = new Set(), sqs = new Set(), pl = [];
      for (const p of raw) {
        const tile = me.rack.find((t) => t.id === p.id);
        if (!tile || used.has(p.id)) return this.reject(ws, "Those tiles aren't on your rack.");
        const sq = p.sq | 0;
        if (sq < 0 || sq > 224 || p.sq !== sq || g.board[sq] || sqs.has(sq)) return this.reject(ws, "That square is taken.");
        const l = String(p.l || "");
        if (tile.l === "?") { if (!/^[a-z]$/.test(l)) return this.reject(ws, "Pick a letter for the blank."); }
        else if (l !== tile.l) return this.reject(ws, "Those tiles aren't on your rack.");
        used.add(p.id); sqs.add(sq);
        pl.push({ sq, l, b: tile.l === "?" });
      }
      const res = TC.validate(g.board, pl);
      if (!res.ok) return this.reject(ws, res.error);
      for (const p of pl) g.board[p.sq] = { l: p.l, b: p.b };
      me.rack = me.rack.filter((t) => !used.has(t.id));
      me.score += res.score;
      g.last = pl.map((p) => p.sq);
      g.moves.push({ p: seat, t: "play", s: res.score, words: res.words.map((w) => w.w), bingo: res.bingo });
      g.scoreless = res.score > 0 ? 0 : g.scoreless + 1;
      while (me.rack.length < TC.RACK && g.bag.length) me.rack.push(g.bag.pop());
      if (!me.rack.length && !g.bag.length) this.finish(seat);
      else g.turn = 1 - seat;
    } else if (m.t === "swap") {
      const ids = new Set((Array.isArray(m.ids) ? m.ids : []).filter((id) => me.rack.some((t) => t.id === id)));
      if (!ids.size) return this.reject(ws, "Pick tiles to swap.");
      if (g.bag.length < TC.RACK) return this.reject(ws, "Not enough tiles left in the bag to swap.");
      const out = me.rack.filter((t) => ids.has(t.id));
      me.rack = me.rack.filter((t) => !ids.has(t.id));
      while (me.rack.length < TC.RACK && g.bag.length) me.rack.push(g.bag.pop());
      g.bag.push(...out); shuffle(g.bag);
      g.moves.push({ p: seat, t: "swap", n: out.length }); g.scoreless++; g.last = [];
      if (g.scoreless >= 6) this.finish(-1); else g.turn = 1 - seat;
    } else if (m.t === "pass") {
      g.moves.push({ p: seat, t: "pass" }); g.scoreless++; g.last = [];
      if (g.scoreless >= 6) this.finish(-1); else g.turn = 1 - seat;
    } else return;

    await this.persist();
    this.broadcastState();
  }

  // outIdx: player who went out (gains rival's leftover tiles), or -1 after six scoreless turns.
  finish(outIdx) {
    const g = this.g;
    const vals = g.players.map((p) => p.rack.reduce((a, t) => a + TC.VALUES[t.l], 0));
    g.players.forEach((p, i) => { if (i !== outIdx && vals[i]) { p.score -= vals[i]; g.moves.push({ p: i, t: "end", s: -vals[i] }); } });
    if (outIdx >= 0) {
      const bonus = vals.reduce((a, v, i) => a + (i === outIdx ? 0 : v), 0);
      if (bonus) { g.players[outIdx].score += bonus; g.moves.push({ p: outIdx, t: "end", s: bonus }); }
    }
    g.over = true;
  }

  webSocketClose(ws, code) {
    this.broadcastState(ws); // tell the other player this one went offline
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye"); } catch (e) {}
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
