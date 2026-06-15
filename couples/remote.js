/* =====================================================================
   Ogbara Labs · remote.js — Couples remote play over Supabase Realtime
   Two devices, one game. Transport is Supabase Realtime *Broadcast*
   (ephemeral channels, no database table, no RLS — works with the same
   anon config already used for cloud sync).

   Model: host = Player 1, guest = Player 2. The active player's device
   is the only one that mutates the game, then broadcasts a full state
   snapshot. The other device applies it. Turns serialise the writes, so
   last-write-wins never conflicts during normal play. Your own moves are
   rendered locally and instantly; only the partner's move crosses the
   network, so the roller perceives no lag.

   This file is UMD-wrapped: in the browser it attaches window.Remote; in
   Node it exports the pure protocol core so it can be unit-tested without
   a DOM or a live connection (see tests/remote.test.js).
   ===================================================================== */
(function (factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod; // Node (tests)
  if (typeof window !== "undefined") window.Remote = mod;                    // Browser
})(function () {
  "use strict";

  /* ============================ PURE CORE ============================ */
  /* No window / no Supabase references here — safe to require in Node. */

  // Room-code alphabet: omit visually ambiguous chars (I, O, L, 0, 1).
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const CODE_LEN = 4;

  function genCode(rng) {
    rng = rng || Math.random;
    let s = "";
    for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    return s;
  }
  function validCode(c) {
    if (typeof c !== "string" || c.length !== CODE_LEN) return false;
    for (const ch of c.toUpperCase()) if (ALPHABET.indexOf(ch) === -1) return false;
    return true;
  }
  function normCode(c) { return typeof c === "string" ? c.trim().toUpperCase() : ""; }

  function playerForRole(role) { return role === "host" ? 1 : 2; }

  // Can THIS device roll right now?  Local play: always. Remote: only on your turn.
  function canAct(mode, current, myPlayer) {
    return mode !== "remote" || current === myPlayer;
  }
  // Can THIS device tick a quest's Done/Pass?  Only the player who triggered it.
  function canControlQuest(mode, quest, myPlayer) {
    if (mode !== "remote") return true;
    if (!quest) return false;
    return quest.actor === myPlayer;
  }

  // Host merges a guest "hello" (their chosen name/gender) into shared state.
  function applyHello(state, hello) {
    if (!state || !hello) return state;
    const slot = hello.player === 1 ? "p1" : "p2";
    if (state[slot]) {
      if (hello.name) state[slot].name = hello.name;
      if (hello.gender) state[slot].gender = hello.gender;
    }
    return state;
  }

  function helloMsg(player, name, gender) {
    return { player: player, name: name || "", gender: gender || "" };
  }

  const Core = {
    ALPHABET, CODE_LEN, genCode, validCode, normCode, playerForRole,
    canAct, canControlQuest, applyHello, helloMsg,
  };

  /* ========================= BROWSER TRANSPORT ====================== */
  /* Everything below only runs when actually started in a browser.    */

  const Remote = Object.assign({}, Core);
  Remote.core = Core; // expose for tests / debugging

  let client = null, channel = null, role = null, code = "", hooks = {};
  let me = { name: "", gender: "female" }, started = false, gotSync = false;

  Remote.isActive = () => !!channel;
  Remote.getCode = () => code;
  Remote.getRole = () => role;
  Remote.myPlayer = () => (role ? playerForRole(role) : null);

  function injectStyles() {
    if (document.getElementById("remoteStyles")) return;
    const css = `
      #remoteBanner{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:96;
        max-width:calc(100vw - 24px);display:flex;align-items:center;gap:10px;
        background:rgba(20,22,28,.92);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.16);
        color:#f1f3f7;border-radius:999px;padding:7px 12px;font:600 13px system-ui,-apple-system,sans-serif;
        box-shadow:0 8px 22px rgba(0,0,0,.4);}
      #remoteBanner .rb-dot{width:9px;height:9px;border-radius:50%;background:#9aa0a6;flex:none;}
      #remoteBanner.ok .rb-dot{background:#34d399;} #remoteBanner.wait .rb-dot{background:#fbbf24;}
      #remoteBanner.err .rb-dot{background:#f87171;}
      #remoteBanner .rb-code{font-weight:800;letter-spacing:2px;}
      #remoteBanner .rb-copy,#remoteBanner .rb-leave{background:rgba(255,255,255,.1);border:none;color:#f1f3f7;
        border-radius:999px;padding:4px 9px;font:700 12px system-ui;cursor:pointer;}
      #remoteBanner .rb-leave{color:#f8a;}
      .die-btn.waiting{opacity:.4;pointer-events:none;filter:grayscale(.4);}`;
    const s = document.createElement("style"); s.id = "remoteStyles"; s.textContent = css;
    document.head.appendChild(s);
  }

  Remote.setBanner = function (state, text, opts) {
    injectStyles();
    opts = opts || {};
    let b = document.getElementById("remoteBanner");
    if (!b) { b = document.createElement("div"); b.id = "remoteBanner"; document.body.appendChild(b); }
    b.className = state || "";
    b.innerHTML = `<span class="rb-dot"></span><span class="rb-text"></span>`;
    b.querySelector(".rb-text").textContent = text || "";
    if (opts.code) {
      const c = document.createElement("span"); c.className = "rb-code"; c.textContent = opts.code; b.appendChild(c);
      const cp = document.createElement("button"); cp.className = "rb-copy"; cp.textContent = "Copy";
      cp.onclick = () => { try { navigator.clipboard.writeText(opts.code); cp.textContent = "Copied"; } catch {} };
      b.appendChild(cp);
    }
    const lv = document.createElement("button"); lv.className = "rb-leave"; lv.textContent = "Leave";
    lv.onclick = () => { Remote.leave(); if (hooks.onLeave) hooks.onLeave(); };
    b.appendChild(lv);
  };
  Remote.clearBanner = function () { const b = document.getElementById("remoteBanner"); if (b) b.remove(); };

  function configOk() {
    return !!(typeof window !== "undefined" && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase);
  }
  Remote.available = configOk;

  Remote.start = async function (opts) {
    if (!configOk()) throw new Error("Remote play needs the cloud service, which isn't configured.");
    role = opts.role; code = normCode(opts.code) || genCode();
    me = { name: (opts.me && opts.me.name) || "", gender: (opts.me && opts.me.gender) || "female" };
    hooks = opts.hooks || {};
    started = false; gotSync = false;

    try {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY,
        { realtime: { params: { eventsPerSecond: 10 } } });
    } catch (e) { throw new Error("Could not start the realtime client: " + (e.message || e)); }

    channel = client.channel("couples-room-" + code, {
      config: { broadcast: { self: false }, presence: { key: role } },
    });

    // Guest announces itself → host replies with a full snapshot.
    channel.on("broadcast", { event: "hello" }, ({ payload }) => {
      if (role !== "host") return;
      if (hooks.onHello) hooks.onHello(payload);
      pushNow(); // reply with authoritative state
    });

    // Full game snapshot from the active device.
    channel.on("broadcast", { event: "sync" }, ({ payload }) => {
      gotSync = true;
      if (hooks.applyState && payload && payload.state) hooks.applyState(payload.state);
      if (!started) { started = true; if (hooks.onStart) hooks.onStart(); }
    });

    const peers = () => {
      try {
        const st = channel.presenceState() || {};
        return Object.keys(st).filter((k) => k !== role).length;
      } catch { return 0; }
    };
    const onPresence = () => {
      const n = peers();
      if (n > 0) {
        if (hooks.onPeer) hooks.onPeer("join");
        // Re-establish state on (re)connection, covering subscribe-order races.
        if (role === "host") pushNow();
        else if (!gotSync) sendHello();
        if (role === "host" && !started) { started = true; if (hooks.onStart) hooks.onStart(); }
      } else if (hooks.onPeer) hooks.onPeer("leave");
    };
    channel.on("presence", { event: "sync" }, onPresence);
    channel.on("presence", { event: "join" }, onPresence);
    channel.on("presence", { event: "leave" }, onPresence);

    await channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try { await channel.track({ name: me.name, player: Remote.myPlayer() }); } catch {}
        if (role === "guest") sendHello();
        if (hooks.onStatus) hooks.onStatus("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (hooks.onStatus) hooks.onStatus("error");
      } else if (status === "CLOSED") {
        if (hooks.onStatus) hooks.onStatus("closed");
      }
    });
    return code;
  };

  function sendHello() {
    if (!channel) return;
    channel.send({ type: "broadcast", event: "hello",
      payload: helloMsg(Remote.myPlayer(), me.name, me.gender) }).catch(() => {});
  }

  function pushNow() {
    if (!channel || !hooks.getState) return;
    channel.send({ type: "broadcast", event: "sync", payload: { state: hooks.getState() } }).catch(() => {});
  }
  Remote.push = pushNow;

  Remote.leave = async function () {
    try { if (channel) await channel.unsubscribe(); } catch {}
    channel = null; role = null; code = ""; started = false; gotSync = false;
    Remote.clearBanner();
  };

  return Remote;
});
