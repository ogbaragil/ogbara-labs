/* Validation for remote play.
   Runs the REAL remote.js against an in-memory fake of the Supabase
   Realtime Broadcast + Presence API, with two independent peers, proving:
     - pure core (codes, turn ownership, quest ownership, hello merge)
     - host/guest handshake (guest hello -> host authoritative sync)
     - bidirectional state sync over broadcast (self:false honoured)
     - presence-driven resync on (re)connection
   No DOM and no network required. Run: node --test tests/
*/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const REMOTE_PATH = path.resolve(__dirname, "../remote.js");
const tick = () => new Promise((r) => setTimeout(r, 5));

/* ---------------- Fake Supabase Realtime ---------------- */
function makeFakeSupabase() {
  const buses = new Map(); // channelName -> Set<FakeChannel>
  function bus(name) { if (!buses.has(name)) buses.set(name, new Set()); return buses.get(name); }

  class FakeChannel {
    constructor(name, cfg) {
      this.name = name;
      this.key = (cfg && cfg.config && cfg.config.presence && cfg.config.presence.key) || "anon";
      this.self = !(cfg && cfg.config && cfg.config.broadcast && cfg.config.broadcast.self === false);
      this.bcast = {}; this.pres = {}; this.meta = null; this.subbed = false;
    }
    on(type, filter, cb) {
      if (type === "broadcast") this.bcast[filter.event] = cb;
      else if (type === "presence") this.pres[filter.event] = cb;
      return this;
    }
    async subscribe(statusCb) {
      this.subbed = true; bus(this.name).add(this);
      await tick();
      if (statusCb) statusCb("SUBSCRIBED");
      return this;
    }
    async track(meta) {
      this.meta = meta;
      for (const ch of bus(this.name)) {
        if (ch.pres.sync) ch.pres.sync({});
        if (ch !== this && ch.pres.join) ch.pres.join({ key: this.key });
      }
      return "ok";
    }
    presenceState() {
      const st = {};
      for (const ch of bus(this.name)) if (ch.meta) st[ch.key] = [ch.meta];
      return st;
    }
    send(msg) {
      for (const ch of bus(this.name)) {
        if (ch === this && !this.self) continue;
        const cb = ch.bcast[msg.event];
        if (cb) cb({ payload: msg.payload });
      }
      return Promise.resolve("ok");
    }
    async unsubscribe() {
      bus(this.name).delete(this);
      for (const ch of bus(this.name)) if (ch.pres.leave) ch.pres.leave({ key: this.key });
      return "ok";
    }
  }
  return { createClient: () => ({ channel: (name, cfg) => new FakeChannel(name, cfg) }) };
}

/* Load a fresh, independent instance of remote.js (own closure state). */
function loadRemote(fakeSupabase) {
  global.window = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", supabase: fakeSupabase };
  delete require.cache[REMOTE_PATH];
  return require(REMOTE_PATH);
}

/* A minimal "game" peer: a plain serialisable state + the same hook
   shape index.html wires into Remote. */
function makePeer(role, Remote, me) {
  const G = role === "host"
    ? { p1: { name: me.name, gender: me.gender, position: 0 }, p2: { name: "", gender: "male", position: 0 }, current: 1, winner: null }
    : { p1: { name: "", gender: "female", position: 0 }, p2: { name: me.name, gender: me.gender, position: 0 }, current: 1, winner: null };
  const flags = { started: false, hello: null };
  const hooks = {
    getState: () => JSON.parse(JSON.stringify(G)),
    applyState: (s) => { Object.assign(G, JSON.parse(JSON.stringify(s))); },
    onHello: (h) => { flags.hello = h; if (h.player === 1) { G.p1.name = h.name; G.p1.gender = h.gender; } else { G.p2.name = h.name; G.p2.gender = h.gender; } },
    onStart: () => { flags.started = true; },
    onPeer: () => {}, onStatus: () => {},
  };
  return { G, hooks, flags, Remote, me };
}

/* ============================ PURE CORE ============================ */
test("genCode: 4 chars, no ambiguous glyphs", () => {
  const fake = makeFakeSupabase(); const R = loadRemote(fake);
  for (let i = 0; i < 500; i++) {
    const c = R.genCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.ok(![..."IOL01"].some((x) => c.includes(x)), "no ambiguous chars");
    assert.ok(R.validCode(c), "validCode accepts its own output");
  }
});

test("validCode rejects malformed codes", () => {
  const R = loadRemote(makeFakeSupabase());
  for (const bad of ["", "ABC", "ABCDE", "AB1D", "AB0D", "ABID", "ab%d", null, 1234])
    assert.equal(R.validCode(bad), false, "rejects " + bad);
});

test("canAct: local always; remote only on your turn", () => {
  const R = loadRemote(makeFakeSupabase());
  assert.equal(R.canAct("local", 1, 2), true);
  assert.equal(R.canAct("remote", 1, 1), true);
  assert.equal(R.canAct("remote", 2, 1), false);
  assert.equal(R.canAct("remote", 2, 2), true);
});

test("canControlQuest: only the triggering player, remote", () => {
  const R = loadRemote(makeFakeSupabase());
  const q = { actor: 1 };
  assert.equal(R.canControlQuest("local", null, 2), true);
  assert.equal(R.canControlQuest("remote", q, 1), true);
  assert.equal(R.canControlQuest("remote", q, 2), false);
  assert.equal(R.canControlQuest("remote", null, 1), false);
});

test("applyHello writes name/gender into the right player slot", () => {
  const R = loadRemote(makeFakeSupabase());
  const s = { p1: { name: "A" }, p2: { name: "" } };
  R.applyHello(s, { player: 2, name: "Dayo", gender: "male" });
  assert.equal(s.p2.name, "Dayo");
  assert.equal(s.p2.gender, "male");
  assert.equal(s.p1.name, "A", "other slot untouched");
});

/* ====================== TWO-PEER TRANSPORT ====================== */
test("handshake: guest hello -> host authoritative sync; both see both names", async () => {
  const fake = makeFakeSupabase();
  const host = makePeer("host", loadRemote(fake), { name: "Amara", gender: "female" });
  const guest = makePeer("guest", loadRemote(fake), { name: "Dayo", gender: "male" });

  await host.Remote.start({ role: "host", code: "WXYZ", me: host.me, hooks: host.hooks });
  await guest.Remote.start({ role: "guest", code: "WXYZ", me: guest.me, hooks: guest.hooks });
  await tick(); await tick();

  assert.equal(host.G.p2.name, "Dayo", "host learned guest name via hello");
  assert.equal(guest.G.p1.name, "Amara", "guest received host name via sync");
  assert.equal(guest.G.p2.name, "Dayo", "guest's own name present in synced state");
  assert.equal(guest.flags.started, true, "guest game started on first sync");
});

test("bidirectional sync: each player's move reaches the other; turns gate correctly", async () => {
  const fake = makeFakeSupabase();
  const host = makePeer("host", loadRemote(fake), { name: "Amara", gender: "female" });
  const guest = makePeer("guest", loadRemote(fake), { name: "Dayo", gender: "male" });
  await host.Remote.start({ role: "host", code: "ROOM", me: host.me, hooks: host.hooks });
  await guest.Remote.start({ role: "guest", code: "ROOM", me: guest.me, hooks: guest.hooks });
  await tick(); await tick();

  // Host's turn (current=1). Host may act, guest may not.
  assert.equal(host.Remote.canAct("remote", host.G.current, 1), true);
  assert.equal(guest.Remote.canAct("remote", guest.G.current, 2), false);

  // Host rolls -> moves to 5, turn passes to guest.
  host.G.p1.position = 5; host.G.current = 2;
  host.Remote.push(host.hooks.getState());
  await tick();
  assert.equal(guest.G.p1.position, 5, "guest sees host move");
  assert.equal(guest.G.current, 2, "turn advanced on guest");

  // Now guest's turn. Guest may act, host may not.
  assert.equal(guest.Remote.canAct("remote", guest.G.current, 2), true);
  assert.equal(host.Remote.canAct("remote", host.G.current, 1), false);

  // Guest rolls -> moves to 7, turn passes back.
  guest.G.p2.position = 7; guest.G.current = 1;
  guest.Remote.push(guest.hooks.getState());
  await tick();
  assert.equal(host.G.p2.position, 7, "host sees guest move");
  assert.equal(host.G.current, 1, "turn returned to host");
});

test("presence resync: a late/rejoining host re-pushes state to the guest", async () => {
  const fake = makeFakeSupabase();
  const host = makePeer("host", loadRemote(fake), { name: "Amara", gender: "female" });
  const guest = makePeer("guest", loadRemote(fake), { name: "Dayo", gender: "male" });

  // Guest connects FIRST (before host) — its initial hello has no host to hear it.
  await guest.Remote.start({ role: "guest", code: "LATE", me: guest.me, hooks: guest.hooks });
  await tick();
  assert.equal(guest.G.p1.name, "", "no host yet, so no sync");

  // Host advances its own state, then connects.
  host.G.p1.position = 9;
  await host.Remote.start({ role: "host", code: "LATE", me: host.me, hooks: host.hooks });
  await tick(); await tick();

  // Presence join (+ guest's hello resend) must reconcile them.
  assert.equal(guest.G.p1.name, "Amara", "guest synced after host joined");
  assert.equal(guest.G.p1.position, 9, "guest received host's prior progress");
  assert.equal(host.G.p2.name, "Dayo", "host learned guest name");
});
