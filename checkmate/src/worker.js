// Check Mate online play.
// Serves the game from /public and runs each online game inside a Durable Object keyed by a
// 4-character code. The Durable Object is the referee: it keeps the move list, checks every move
// with the same engine the app uses, and decides results (checkmate, draws, resignation).
// Games survive either phone closing the app, and are deleted after 14 quiet days.
import { DurableObject } from "cloudflare:workers";
import "../public/engine.js";

const CM = globalThis.CM;
const EXPIRE_MS = 14 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Z0-9]{4}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ping") {
      return Response.json({ game: "checkmate" }, { headers: { "cache-control": "no-store" } });
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

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.seats = (await ctx.storage.get("seats")) || [];  // [{token, name}]
      this.g = (await ctx.storage.get("g")) || null;         // game once both have joined
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
      server.accept();
      server.send(JSON.stringify({ t: "err", e: error }));
      server.close(4000, error);
      return new Response(null, { status: 101, webSocket: client });
    }

    for (const old of this.ctx.getWebSockets("s" + seat)) { try { old.close(4001, "replaced"); } catch (e) {} }
    this.ctx.acceptWebSocket(server, ["s" + seat]);
    if (!this.g && this.seats.length === 2) this.newGame(Math.random() < 0.5 ? 0 : 1);
    await this.persist();
    server.send(JSON.stringify({ t: "welcome", seat, token: this.seats[seat].token, code: this.code }));
    this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  // whiteSeat plays white
  newGame(whiteSeat) {
    const colors = whiteSeat === 0 ? ["w", "b"] : ["b", "w"];
    this.g = { moves: [], colors, over: null, drawOffer: -1, rematch: [false, false], n: this.g ? this.g.n + 1 : 1 };
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
      players: this.seats.map((s, k) => ({ name: s.name, color: g ? g.colors[k] : "", online: this.online(k, except) })),
      moves: g ? g.moves : [], over: g ? g.over : null, drawOffer: g ? g.drawOffer : -1,
      rematch: g ? g.rematch : [false, false],
    };
  }

  broadcastState(except) {
    for (let k = 0; k < this.seats.length; k++)
      for (const ws of this.ctx.getWebSockets("s" + k)) {
        if (ws === except) continue;
        try { ws.send(JSON.stringify(this.stateFor(k, except))); } catch (e) {}
      }
  }

  // A rejected move is followed by the true state so the app can undo its optimistic move.
  reject(ws, seat, msg) {
    try { ws.send(JSON.stringify({ t: "reject", msg })); ws.send(JSON.stringify(this.stateFor(seat))); } catch (e) {}
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 2048) return;
    let m; try { m = JSON.parse(message); } catch (e) { return; }
    const seat = +this.ctx.getTags(ws)[0].slice(1);
    const g = this.g;
    if (m.t === "hello") { ws.send(JSON.stringify(this.stateFor(seat))); return; }
    if (!g) return this.reject(ws, seat, "Waiting for the other player to join.");
    const color = g.colors[seat];

    if (m.t === "rematch") {
      if (!g.over) return;
      g.rematch[seat] = true;
      // Swap colours for the rematch.
      if (g.rematch.every(Boolean)) this.newGame(g.colors.indexOf("b"));
    } else if (g.over) {
      return this.reject(ws, seat, "The game is over.");
    } else if (m.t === "resign") {
      g.over = { result: color === "w" ? "0-1" : "1-0", reason: "resignation" };
      g.drawOffer = -1;
    } else if (m.t === "draw") {
      if (g.drawOffer === 1 - seat) { g.over = { result: "1/2-1/2", reason: "agreement" }; g.drawOffer = -1; }
      else g.drawOffer = seat;
    } else if (m.t === "decline") {
      if (g.drawOffer === 1 - seat) g.drawOffer = -1; else return;
    } else if (m.t === "move") {
      const game = CM.replay(g.moves);
      if (game.s.turn !== color) return this.reject(ws, seat, "It's not your move.");
      const from = m.from | 0, to = m.to | 0, promo = /^[qrbn]$/.test(m.promo) ? m.promo : "";
      const mv = CM.legal(game.s).find((x) => x.from === from && x.to === to && x.promo === (x.promo ? promo || "q" : ""));
      if (!mv) return this.reject(ws, seat, "That move isn't allowed.");
      g.moves.push({ from, to, promo: mv.promo });
      if (g.drawOffer === 1 - seat) g.drawOffer = -1; // making a move declines an offer
      else if (g.drawOffer === seat) g.drawOffer = -1; // and withdraws your own
      const after = CM.replay(g.moves);
      if (after.status) g.over = after.status;
    } else return;

    await this.persist();
    this.broadcastState();
  }

  webSocketClose(ws, code) {
    this.broadcastState(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye"); } catch (e) {}
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
