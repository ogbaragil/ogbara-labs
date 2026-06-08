/* =====================================================================
   Brainy Trails · app.js — engine
   Mastery machine · adaptive practice loop · island map · persistence
   Requires curriculum.js (window.BT). DOM ids in index.html.
   ===================================================================== */
"use strict";

/* ---------------- helpers ---------------- */
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);
const FAST = typeof window !== "undefined" && window.__BT_FAST;
const MS_OK = FAST ? 40 : 950, MS_BAD = FAST ? 60 : 1700;

/* ---------------- store ---------------- */
const Store = (() => {
  const KEY = "bt_state_v1";
  return {
    load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } },
    save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { } },
  };
})();

const FRESH_PROFILE = () => ({
  skills: {},                 // id → {m,attempts,correct,stars,nextReview}
  taught: {},                 // id → date first taught (Learn-it-first screen seen)
  xp: 0,
  streak: { count: 0, last: null },
  settings: { speech: true },
});

let state = Store.load();
if (!state || state.v !== 1) state = { v: 1, profile: "default", profiles: { default: FRESH_PROFILE() } };
if (!state.profiles[state.profile]) state.profiles[state.profile] = FRESH_PROFILE();
if (!state.deletedProfiles) state.deletedProfiles = {};
function migrateProfile(p) {
  if (!p.settings) p.settings = { speech: true };
  if (!p.badges) p.badges = {};
  if (!p.taught) p.taught = {};
  if (!p.timeByDay) p.timeByDay = {};
  if (!p.bosses) p.bosses = {};
  if (!p.name) p.name = "Explorer";
  if (!p.avatar) p.avatar = "🦊";
  if (!p.streak) p.streak = { count: 0, last: null };
  if (p.settings.sound === undefined) p.settings.sound = true;
  if (p.settings.music === undefined) p.settings.music = true;
  if (p.settings.kokoroVoice !== undefined) {
    if (p.settings.premiumVoice === undefined) p.settings.premiumVoice = p.settings.kokoroVoice;
    delete p.settings.kokoroVoice;
  }
  for (const [id, b] of Object.entries(p.bosses)) if (b === true) p.bosses[id] = { won: true, best: 0 };
  return p;
}
Object.values(state.profiles).forEach(migrateProfile);
const P = () => state.profiles[state.profile];
const sk = (id) => {
  const st = P().skills[id] || (P().skills[id] = { m: 0, attempts: 0, correct: 0, stars: 0, nextReview: null, reviewStep: 0 });
  if (st.reviewStep === undefined) st.reviewStep = 0;
  return st;
};
const bosses = () => P().bosses || (P().bosses = {});
const SK0 = Object.freeze({ m: 0, attempts: 0, correct: 0, stars: 0, nextReview: null, reviewStep: 0 });
const APP_V = "17";
/* keep the last few errors (not just the latest) so a parent can copy a report */
function logErr(rec) {
  try {
    let log = [];
    try { log = JSON.parse(localStorage.getItem("bt_errlog") || "[]"); } catch { }
    log.unshift(rec);
    localStorage.setItem("bt_errlog", JSON.stringify(log.slice(0, 5)));
  } catch { }
}
window.onerror = (m, src, line) => logErr({ m: String(m).slice(0, 160), f: String(src || "").split("/").pop(), l: line || 0, at: new Date().toISOString().slice(0, 16), v: APP_V });
try { window.addEventListener("unhandledrejection", (e) => logErr({ m: "promise: " + String((e.reason && e.reason.message) || e.reason || "?").slice(0, 150), f: "promise", l: 0, at: new Date().toISOString().slice(0, 16), v: APP_V })); } catch { }
const TESTP = "_test";
const inTest = () => state.profile === TESTP;
const skv = (id) => P().skills[id] || SK0;   // read-only view: never creates records

function save() { Store.save(state); if (window.Cloud && Cloud.schedulePush) Cloud.schedulePush(); }

/* level curve: gentle early, slower later */
const levelOf = (xp) => 1 + Math.floor(Math.sqrt(xp / 120));

/* spaced-review intervals (days), used from Proficient onward */
const REVIEW_DAYS = [2, 7, 21, 60];
/* date stamps in LOCAL time (not UTC) so "today"/"yesterday" roll over at the child's midnight */
const localISO = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const isoPlusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localISO(d); };

const today = () => localISO();
const dueSkills = () => Object.keys(P().skills).filter(id => {
  if (!BT.SKILLS[id]) return false;   // synced state may know skills this curriculum doesn't
  const st = P().skills[id];
  return st.m >= 2 && st.nextReview && st.nextReview <= today();
});

/* unlock rule: every prerequisite at least Familiar */
const unlocked = (id) => inTest() || BT.SKILLS[id].prereqs.every(p => (P().skills[p] || {}).m >= 1);

/* ---------------- cloud merge (everything earned crosses devices) ---------------- */
function mergeRemote(remote) {
  if (!remote || remote.v !== 1) return;
  if (remote.profiles) delete remote.profiles[TESTP];   // sandbox never syncs in
  for (const [pid, when] of Object.entries(remote.deletedProfiles || {})) {
    if (!state.deletedProfiles[pid]) state.deletedProfiles[pid] = when;
  }
  for (const [pid, rp] of Object.entries(remote.profiles || {})) {
    if (pid === TESTP || state.deletedProfiles[pid]) continue;
    const lp = migrateProfile(state.profiles[pid] || (state.profiles[pid] = FRESH_PROFILE()));
    for (const [sid, rs] of Object.entries(rp.skills || {})) {
      const ls = lp.skills[sid];
      if (!ls || rs.m > ls.m || (rs.m === ls.m && rs.attempts > ls.attempts)) lp.skills[sid] = rs;
    }
    if ((rp.xp || 0) > lp.xp) lp.xp = rp.xp;
    if (rp.settings) lp.settings = { ...lp.settings, ...rp.settings };
    /* earned things are permanent — union them */
    for (const [bid, when] of Object.entries(rp.badges || {})) if (!lp.badges[bid]) lp.badges[bid] = when;
    for (const [sid, when] of Object.entries(rp.taught || {})) if (!lp.taught[sid]) lp.taught[sid] = when;
    for (const [iid, bs] of Object.entries(rp.bosses || {})) {
      const rb = bs === true ? { won: true, best: 0 } : bs;
      const cur = lp.bosses[iid];
      lp.bosses[iid] = { won: !!(cur && cur.won) || !!rb.won, best: Math.max(cur ? cur.best || 0 : 0, rb.best || 0) };
    }
    if (rp.streak && rp.streak.last && (!lp.streak.last || rp.streak.last > lp.streak.last ||
        (rp.streak.last === lp.streak.last && rp.streak.count > lp.streak.count))) lp.streak = { ...rp.streak };
    for (const [d, secs] of Object.entries(rp.timeByDay || {})) lp.timeByDay[d] = Math.max(lp.timeByDay[d] || 0, secs);
    if ((rp.lightningBest || 0) > (lp.lightningBest || 0)) lp.lightningBest = rp.lightningBest;
    if (rp.name && rp.name !== "Explorer" && lp.name === "Explorer") lp.name = rp.name;
    if (rp.avatar && rp.avatar !== "🦊" && lp.avatar === "🦊") lp.avatar = rp.avatar;
  }
  if (remote.syncNudged) state.syncNudged = true;
  /* honour deletions arriving from other devices */
  for (const pid of Object.keys(state.deletedProfiles)) {
    if (pid !== TESTP && state.profiles[pid]) {
      if (state.profile === pid) {
        const alt = childIds().find(x => x !== pid);
        if (alt) state.profile = alt; else continue;   // never delete the last child
      }
      delete state.profiles[pid];
    }
  }
  if (!childIds().length) { state.profiles.default = migrateProfile(FRESH_PROFILE()); state.profile = "default"; delete state.deletedProfiles.default; }
}

/* ---------------- maths pictures (pic spec → inline SVG) ---------------- */
function pic(p) {
  const INK = "var(--ink)", VIO = "var(--violet)", LINE = "#cfc6e6", FILL = "#efe9ff";
  const wrap = (vb, body, h) => `<svg class="qpic" viewBox="${vb}" style="max-height:${h || 130}px" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  try {
    if (p.kind === "pie") {
      const cx = 70, cy = 70, r = 56, n = p.n, k = p.k;
      let body = "";
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        body += `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z"
          fill="${i < k ? VIO : "#fff"}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
      }
      return wrap("0 0 140 140", body, 132);
    }
    if (p.kind === "clock") {
      const cx = 70, cy = 70;
      let body = `<circle cx="${cx}" cy="${cy}" r="62" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        body += `<line x1="${cx + 54 * Math.sin(a)}" y1="${cy - 54 * Math.cos(a)}" x2="${cx + 60 * Math.sin(a)}" y2="${cy - 60 * Math.cos(a)}" stroke="${INK}" stroke-width="${i % 3 ? 2 : 3.5}"/>`;
        const num = i === 0 ? 12 : i;
        body += `<text x="${cx + 44 * Math.sin(a)}" y="${cy - 44 * Math.cos(a) + 4.5}" text-anchor="middle" font-size="12" font-weight="800" fill="${INK}">${num}</text>`;
      }
      const hourA = ((p.h % 12) / 12 + (p.half ? 1 / 24 : 0)) * 2 * Math.PI;
      const minA = p.half ? Math.PI : 0;
      body += `<line x1="${cx}" y1="${cy}" x2="${cx + 26 * Math.sin(hourA)}" y2="${cy - 26 * Math.cos(hourA)}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
      body += `<line x1="${cx}" y1="${cy}" x2="${cx + 42 * Math.sin(minA)}" y2="${cy - 42 * Math.cos(minA)}" stroke="${VIO}" stroke-width="3.5" stroke-linecap="round"/>`;
      body += `<circle cx="${cx}" cy="${cy}" r="4" fill="${INK}"/>`;
      return wrap("0 0 140 140", body, 140);
    }
    if (p.kind === "blocks") {
      let body = "", x = 6;
      for (let i = 0; i < p.tens; i++) {
        body += `<rect x="${x}" y="8" width="16" height="84" rx="3" fill="${VIO}" stroke="${INK}" stroke-width="2"/>`;
        for (let j = 1; j < 10; j++) body += `<line x1="${x}" y1="${8 + j * 8.4}" x2="${x + 16}" y2="${8 + j * 8.4}" stroke="#fff" stroke-width="1.4" opacity=".75"/>`;
        x += 24;
      }
      x += p.tens ? 8 : 0;
      for (let i = 0; i < p.ones; i++) {
        const col = Math.floor(i / 5), row = i % 5;
        body += `<rect x="${x + col * 20}" y="${8 + row * 17}" width="15" height="15" rx="3" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
      }
      const w = x + Math.ceil(p.ones / 5) * 20 + 6;
      return wrap(`0 0 ${Math.max(w, 60)} 100`, body, 110);
    }
    if (p.kind === "rect") {
      const unit = Math.min(24, 180 / Math.max(p.l, p.w, 1));   // to scale: longer side ≤180px
      const W = Math.max(28, Math.round(p.l * unit)), H = Math.max(20, Math.round(p.w * unit));
      return wrap(`0 0 ${W + 60} ${H + 44}`,
        `<rect x="25" y="10" width="${W}" height="${H}" rx="6" fill="${FILL}" stroke="${INK}" stroke-width="3"/>
         <text x="${25 + W / 2}" y="${H + 34}" text-anchor="middle" font-size="16" font-weight="900" fill="${INK}">${p.l}</text>
         <text x="${W + 42}" y="${10 + H / 2 + 6}" text-anchor="middle" font-size="16" font-weight="900" fill="${INK}">${p.w}</text>`, 132);
    }
    if (p.kind === "angle") {
      const cx = 75, cy = 100, L = 66, rad = (p.deg * Math.PI) / 180;   // centred so obtuse & straight angles stay on-canvas
      const x2 = cx + L * Math.cos(rad), y2 = cy - L * Math.sin(rad);
      let body = `<line x1="${cx}" y1="${cy}" x2="${cx + L}" y2="${cy}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
      if (p.deg === 90) body += `<path d="M${cx + 16},${cy} L${cx + 16},${cy - 16} L${cx},${cy - 16}" fill="none" stroke="${VIO}" stroke-width="2.5"/>`;
      else {
        const r = 22, ex = cx + r * Math.cos(rad), ey = cy - r * Math.sin(rad);
        body += `<path d="M${cx + r},${cy} A${r},${r} 0 ${p.deg > 180 ? 1 : 0} 0 ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${VIO}" stroke-width="2.5"/>`;
      }
      return wrap("0 0 150 120", body, 110);
    }
    if (p.kind === "suppl") {
      const cx = 110, cy = 78, rad = (p.a * Math.PI) / 180;
      return wrap("0 0 220 92",
        `<line x1="8" y1="${cy}" x2="212" y2="${cy}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
         <line x1="${cx}" y1="${cy}" x2="${(cx + 80 * Math.cos(rad)).toFixed(1)}" y2="${(cy - 80 * Math.sin(rad)).toFixed(1)}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
         <text x="${cx + 34 * Math.cos(rad / 2)}" y="${cy - 30 * Math.sin(rad / 2) + 4}" font-size="14" font-weight="900" fill="${VIO}">${p.a}°</text>
         <text x="${cx - 36}" y="${cy - 12}" font-size="15" font-weight="900" fill="${INK}">?</text>`, 90);
    }
    if (p.kind === "bars") {
      const max = Math.max(...p.items.map(i => i.val));
      let body = "";
      p.items.forEach((it, i) => {
        const y = 8 + i * 30;
        body += `<text x="14" y="${y + 16}" font-size="17" text-anchor="middle">${it.label}</text>
          <rect x="30" y="${y}" width="${(150 * it.val) / max}" height="21" rx="6" fill="${VIO}" stroke="${INK}" stroke-width="2"/>
          <text x="${36 + (150 * it.val) / max}" y="${y + 15.5}" font-size="12" font-weight="900" fill="${INK}">${it.val}</text>`;
      });
      return wrap(`0 0 210 ${8 + p.items.length * 30}`, body, 26 + p.items.length * 30);
    }
    if (p.kind === "coins") {
      const R = { 5: 17, 10: 20, 20: 23, 50: 27, 100: 22, 200: 25 };
      const COL = { 5: "#cdd3da", 10: "#cdd3da", 20: "#cdd3da", 50: "#c7ccd3", 100: "#f1c75a", 200: "#e9b949" };
      const maxR = 27, baseY = maxR + 5, gap = 11;
      let x = 6, body = "";
      p.values.forEach(v => {
        const r = R[v] || 22, cx = x + r;
        body += `<circle cx="${cx}" cy="${baseY}" r="${r}" fill="${COL[v] || "#f1c75a"}" stroke="${INK}" stroke-width="2.5"/>
          <circle cx="${cx}" cy="${baseY}" r="${r - 4.5}" fill="none" stroke="${INK}" stroke-width="1" opacity=".3"/>
          <text x="${cx}" y="${baseY + r * 0.22}" text-anchor="middle" font-size="${Math.max(11, Math.round(r * 0.62))}" font-weight="900" fill="${INK}">${v >= 100 ? "$" + v / 100 : v + "c"}</text>`;
        x += 2 * r + gap;
      });
      return wrap(`0 0 ${x} ${baseY + maxR + 4}`, body, baseY + maxR + 8);
    }
    if (p.kind === "compare") {
      const max = Math.max(p.a.len, p.b.len);
      const row = (it, y) => `<rect x="6" y="${y}" width="${(190 * it.len) / max}" height="20" rx="6" fill="${y === 8 ? VIO : "#38bdf8"}" stroke="${INK}" stroke-width="2"/>
        <text x="${14 + (190 * it.len) / max}" y="${y + 15}" font-size="13" font-weight="900" fill="${INK}">${it.label}</text>`;
      return wrap("0 0 264 64", row(p.a, 8) + row(p.b, 38), 66);
    }
    if (p.kind === "numline") {
      const W = 220, lo = p.lo, hi = p.hi;
      const X = (v) => 14 + ((v - lo) / (hi - lo)) * W;
      let body = `<line x1="14" y1="40" x2="${14 + W}" y2="40" stroke="${INK}" stroke-width="3"/>`;
      const step = (hi - lo) / (p.ticks || 10);
      for (let v = lo; v <= hi; v += step)
        body += `<line x1="${X(v)}" y1="34" x2="${X(v)}" y2="46" stroke="${INK}" stroke-width="2"/>`;
      body += `<text x="${X(lo)}" y="62" text-anchor="middle" font-size="13" font-weight="900" fill="${INK}">${lo}</text>
        <text x="${X(hi)}" y="62" text-anchor="middle" font-size="13" font-weight="900" fill="${INK}">${hi}</text>
        <circle cx="${X(p.mark)}" cy="40" r="6.5" fill="${VIO}" stroke="${INK}" stroke-width="2"/>
        <text x="${X(p.mark)}" y="20" text-anchor="middle" font-size="14" font-weight="900" fill="var(--violet)">${p.mark}</text>`;
      return wrap(`0 0 ${W + 28} 68`, body, 70);
    }
  } catch { }
  return "";
}

/* ---------------- sound effects ---------------- */
const SFX = (() => {
  let ctx = null;
  const ensure = () => {
    if (!P().settings.sound) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch { return null; }
  };
  const tone = (c, f, t, dur = 0.12, type = "sine", vol = 0.12) => {
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch { }
  };
  return {
    ok() { const c = ensure(); if (!c) return; const t = c.currentTime; tone(c, 660, t, 0.1); tone(c, 880, t + 0.09, 0.14); },
    no() { const c = ensure(); if (!c) return; tone(c, 175, c.currentTime, 0.16, "triangle", 0.10); },
    star() { const c = ensure(); if (!c) return; const t = c.currentTime; [784, 988, 1175].forEach((f, i) => tone(c, f, t + i * 0.07, 0.12, "sine", 0.10)); },
    fanfare() { const c = ensure(); if (!c) return; const t = c.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone(c, f, t + i * 0.1, 0.22, "triangle", 0.13)); },
  };
})();

/* ---------------- badges (earned things never disappear) ---------------- */
const countM = (p, m) => Object.values(p.skills).filter(x => x.m >= m).length;
const totalStars = (p) => Object.values(p.skills).reduce((a, x) => a + (x.stars || 0), 0);
const BADGES = [
  { id: "first_fam", name: "First Steps", emoji: "👣", test: p => countM(p, 1) >= 1 },
  { id: "first_prof", name: "Level Upper", emoji: "⚡", test: p => countM(p, 2) >= 1 },
  { id: "first_master", name: "Island Defender", emoji: "🛡", test: p => countM(p, 3) >= 1 },
  { id: "fam10", name: "Explorer ×10", emoji: "🧭", test: p => countM(p, 1) >= 10 },
  { id: "prof10", name: "Trailblazer ×10", emoji: "🔥", test: p => countM(p, 2) >= 10 },
  { id: "master5", name: "Guardian ×5", emoji: "🏅", test: p => countM(p, 3) >= 5 },
  { id: "island_hero", name: "Island Hero", emoji: "🗺", test: p => BT.ISLANDS.some(i => i.units.flatMap(u => u.skills).every(id => (p.skills[id] || {}).m >= 2)) },
  { id: "boss1", name: "Boss Beater", emoji: "⚔️", test: p => Object.values(p.bosses || {}).filter(Boolean).length >= 1 },
  { id: "boss_all", name: "Crown Collector", emoji: "👑", test: p => Object.values(p.bosses || {}).filter(Boolean).length >= 6 },
  { id: "stars25", name: "Star Catcher", emoji: "⭐", test: p => totalStars(p) >= 25 },
  { id: "lv5", name: "Level 5 Hero", emoji: "🌟", test: p => levelOf(p.xp) >= 5 },
  { id: "lv10", name: "Level 10 Legend", emoji: "💫", test: p => levelOf(p.xp) >= 10 },
  { id: "streak3", name: "Campfire Keeper", emoji: "🔥", test: p => p.streak && p.streak.count >= 3 },
  { id: "streak7", name: "Week of Flame", emoji: "🎆", test: p => p.streak && p.streak.count >= 7 },
  { id: "light10", name: "Speed Star", emoji: "💨", test: p => (p.lightningBest || 0) >= 10 },
  { id: "light20", name: "Lightning Legend", emoji: "🌩", test: p => (p.lightningBest || 0) >= 20 },
];
function checkBadges() {
  const p = P(); if (!p.badges) p.badges = {};
  const fresh = [];
  for (const b of BADGES) if (!p.badges[b.id] && b.test(p)) { p.badges[b.id] = today(); fresh.push(b); }
  if (fresh.length) save();
  return fresh;
}
function setExtras(lvFrom) {
  const lv = levelOf(P().xp);
  let html = "", pop = false;
  if (lv > lvFrom) { html += `<p class="result-lv">🎉 LEVEL ${lv}! 🎉</p>`; pop = true; SFX.fanfare(); }
  const fresh = checkBadges();
  if (fresh.length) { html += fresh.map(b => `<p class="result-badge">New badge! ${b.emoji} <b>${esc(b.name)}</b></p>`).join(""); pop = true; if (lv <= lvFrom) SFX.star(); }
  return { html, pop };
}

/* ---------------- play-time tracking (for the Parents' Corner) ---------------- */
function addPlayTime() {
  if (!Sess || !Sess.t0) return;
  const d = today();
  P().timeByDay[d] = (P().timeByDay[d] || 0) + Math.round((Date.now() - Sess.t0) / 1000);
  Sess.t0 = null;
  const keys = Object.keys(P().timeByDay).sort();
  while (keys.length > 30) delete P().timeByDay[keys.shift()];
}

/* ---------------- speech ---------------- */
let speechPrimed = false;
/* Web Speech: pick the best installed voice instead of the platform default. */
function pickWebVoice() {
  try {
    const vs = speechSynthesis.getVoices() || [];
    if (!vs.length) return null;
    const score = (v) => {
      let sc = 0;
      const n = (v.name || "").toLowerCase(), l = (v.lang || "").toLowerCase();
      if (l.startsWith("en-au")) sc += 40; else if (l.startsWith("en-gb")) sc += 30; else if (l.startsWith("en")) sc += 15;
      if (/karen/.test(n)) sc += 25;
      if (/premium|enhanced|natural|neural/.test(n)) sc += 20;
      if (/google/.test(n)) sc += 8;
      if (v.localService) sc += 3;
      return sc;
    };
    return vs.slice().sort((a, b) => score(b) - score(a))[0] || null;
  } catch { return null; }
}
let _wv = null;
try { if ("speechSynthesis" in window && speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", () => { _wv = pickWebVoice(); }); } catch { }
function webSay(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    if (!_wv) _wv = pickWebVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (_wv) { u.voice = _wv; u.lang = _wv.lang; }
    u.rate = 0.95; u.pitch = 1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { }
}

/* Premium voice: Google Cloud TTS (en-AU Neural2) behind our Cloudflare Worker.
   Phrases are edge-cached server-side, memory-cached here, and stored in the
   page Cache API so repeated phrases keep working offline. Unlocked by sync
   sign-in; configured per-deployment via window.TTS_PROXY (see /tts-worker). */
const TTS_VOICE = "en-AU-Neural2-A";
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
const TTS = {
  mem: new Map(), el: null, lastErr: null,
  proxy: () => String(window.TTS_PROXY || "").trim(),
  unlocked() { return !!this.proxy() && !!(window.Cloud && Cloud.isSignedIn && Cloud.isSignedIn()); },
  enabled: () => !!P().settings.premiumVoice,
  prime() {   // iOS: one user-gesture play unlocks this element for all later srcs
    try {
      if (!this.el && typeof Audio !== "undefined") {
        this.el = new Audio(SILENT_WAV);
        this.el.play().catch(() => { });
      }
    } catch { }
  },
  async fetchClip(text) {
    if (this.mem.has(text)) return this.mem.get(text);
    const cacheUrl = this.proxy() + "?t=" + encodeURIComponent(text) + "&v=" + TTS_VOICE;
    let blob = null;
    try {
      if (typeof caches !== "undefined") {
        const c = await caches.open("bt-tts-v1");
        const hit = await c.match(cacheUrl);
        if (hit) blob = await hit.blob();
      }
    } catch { }
    if (!blob) {
      let signal;
      try { const ac = new AbortController(); signal = ac.signal; setTimeout(() => ac.abort(), 3500); } catch { }
      const r = await fetch(this.proxy(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: TTS_VOICE }),
        signal,
      });
      if (!r.ok) throw new Error("tts " + r.status);
      blob = await r.blob();
      try {
        if (typeof caches !== "undefined") {
          const c = await caches.open("bt-tts-v1");
          await c.put(cacheUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
        }
      } catch { }
    }
    const url = URL.createObjectURL(blob);
    if (this.mem.size > 150) { const k = this.mem.keys().next().value; try { URL.revokeObjectURL(this.mem.get(k)); } catch { } this.mem.delete(k); }
    this.mem.set(text, url);
    return url;
  },
  async say(text) {
    try {
      const url = await this.fetchClip(text);
      if (this.el) { try { this.el.pause(); } catch { } this.el.src = url; this.el.play().catch(() => { }); }
      else { const a = new Audio(url); this.el = a; a.play().catch(() => { }); }
    } catch (e) { this.lastErr = String(e && e.message || e); webSay(text); }
  },
  prefetch(arr) { if (this.enabled() && this.unlocked()) arr.forEach(t => this.fetchClip(t).catch(() => { })); },
  async sayQueue(lines) {   // play clips back-to-back; a newer call supersedes us
    const seq = (this._seq = (this._seq || 0) + 1);
    try {
      for (const t of lines) {
        if (seq !== this._seq) return;
        const url = await this.fetchClip(t);
        if (seq !== this._seq) return;
        if (!this.el) this.el = new Audio();
        await new Promise(res => {
          this.el.onended = res; this.el.onerror = res;
          try { this.el.pause(); } catch { }
          this.el.src = url; this.el.play().catch(() => res());
        });
      }
    } catch (e) { this.lastErr = String(e && e.message || e); }
  },
};

/* Sprout & Bridge are for 4–7 year olds: typing multi-digit answers is a motor
   tax, so any keypad question on those islands becomes four tappable choices. */
const YOUNG_ISLANDS = new Set(["sprout", "bridge"]);
function youngify(q) {
  const a = q.answer;
  const set = new Set([a]);
  for (const x of shuffleArr([a - 1, a + 1, a - 2, a + 2, a + 10, a - 10, a + 3, a + 5])) {
    if (set.size >= 4) break;
    if (x >= 0 && x <= 999 && x !== a) set.add(x);
  }
  let bump = 4;
  while (set.size < 4) { set.add(a + bump); bump += 3; }
  return Object.assign({}, q, {
    format: "choice",
    choices: shuffleArr([...set]).map(x => ({ label: String(x), correct: x === a })),
  });
}

/* estimate how long a spoken line needs, so cards never cut praise short */
const speechMs = (t) => Math.min(4500, Math.max(900, 350 + String(t).length * 65));
const TRY_AGAIN = ["Try again! 💪", "Have another go!", "Almost — try once more!", "Hmm — one more try!"];
const PRAISE = ["Brilliant!", "You got it!", "Super!", "Nice thinking!", "Yes! Exactly right!", "Wonderful!", "Sharp work!", "That's the one!", "Champion!", "Beautiful maths!", "Too easy for you!", "Spot on!", "Cracked it!", "Legend!"];
const NOT_QUITE = ["Not quite!", "So close!", "Good try!", "Almost!"];
function say(text) {
  if (!P().settings.speech) return;
  if (TTS.enabled() && TTS.unlocked()) { TTS.say(text); return; }
  webSay(text);
}
/* read several lines in order (used by the Learn screen to read every step) */
function sayLines(lines) {
  const list = (lines || []).map(t => String(t).trim()).filter(Boolean);
  if (!list.length || !P().settings.speech) return;
  if (TTS.enabled() && TTS.unlocked()) { TTS.sayQueue(list); return; }
  if (!("speechSynthesis" in window)) return;
  try {
    if (!_wv) _wv = pickWebVoice();
    speechSynthesis.cancel();
    list.forEach(t => {
      const u = new SpeechSynthesisUtterance(t);
      if (_wv) { u.voice = _wv; u.lang = _wv.lang; }
      u.rate = 0.95; u.pitch = 1.05;
      speechSynthesis.speak(u);   // queued, not cancelled between lines
    });
  } catch { }
}
addEventListener("pointerdown", function prime() {
  if (!speechPrimed && "speechSynthesis" in window) { try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { } speechPrimed = true; }
  TTS.prime();
  Music.start();   // browsers only let audio start inside a user gesture
  removeEventListener("pointerdown", prime);
});

/* ---------------- map theme music (same loop as How Many?) ---------------- */
const Music = (() => {
  let el = null;
  const wanted = () => P().settings.music !== false;            // default on
  const onMap = () => { try { return !document.body.classList.contains("in-play"); } catch { return true; } };
  const visible = () => { try { return document.visibilityState !== "hidden"; } catch { return true; } };
  const ensure = () => {
    if (el || typeof Audio === "undefined") return el;
    try { el = new Audio("kids-happy-music.mp3"); el.loop = true; el.preload = "auto"; el.volume = 0.3; }
    catch { el = null; }
    return el;
  };
  function sync() {
    const e = ensure(); if (!e) return;
    if (wanted() && onMap() && visible()) { const p = e.play && e.play(); if (p && p.catch) p.catch(() => { }); }
    else { try { e.pause(); } catch { } }
  }
  return {
    start() { sync(); },
    sync,
    on: () => wanted(),
    toggle() { P().settings.music = !wanted(); save(); sync(); paintMusicBtn(); },
  };
})();
function paintMusicBtn() {
  const b = $("musicBtn"); if (!b) return;
  const on = Music.on();
  b.textContent = on ? "🎶" : "🔇";
  b.classList.toggle("off", !on);
  b.setAttribute("aria-label", on ? "Music on — tap to mute" : "Music off — tap to play");
}
try { document.addEventListener("visibilitychange", () => Music.sync()); } catch { }

/* ---------------- lightning strike (dramatic tap → flash + thunder → round) ---------------- */
let _thunder = null;
function playThunder() {
  if (!P().settings.sound) return;
  try {
    if (!_thunder && typeof Audio !== "undefined") { _thunder = new Audio("thunder.mp3"); _thunder.volume = 0.55; }
    if (_thunder) { _thunder.currentTime = 0; const p = _thunder.play(); if (p && p.catch) p.catch(() => { }); }
  } catch { }
}
const BOLT_SVG = `<svg viewBox="0 0 140 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="80,0 18,172 64,172 38,340 128,150 80,150 122,0"
    fill="#fde68a" stroke="#7c4dff" stroke-width="7" stroke-linejoin="round"/></svg>`;
/* a tap forks a bolt across the screen and rumbles, then drops into the round.
   Kept to two soft flashes and skipped entirely under reduced-motion (photosensitivity). */
function strikeLightning(then) {
  playThunder();
  if (matchMediaSafe()) { then && then(); return; }
  try {
    const f = el("div", "bolt-flash", `<div class="sheet"></div>${BOLT_SVG}`);
    document.body.appendChild(f);
    setTimeout(() => { try { f.remove(); } catch { } }, 760);
  } catch { }
  setTimeout(() => { then && then(); }, 430);   // begin the round mid-strike for snap
}

/* keyboard play: each question installs Sess.onKey; we only forward keys while a
   question is live (no modal open, not mid-feedback, focus not in a text field) */
addEventListener("keydown", (e) => {
  if (!Sess || Sess.lock || !Sess.onKey) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
  if (document.querySelector(".modal-back")) return;   // a dialog owns the keyboard
  Sess.onKey(e);
});

/* ---------------- HUD ring (level inside an XP-progress ring) ---------------- */
function paintHeader() {
  const xp = P().xp, lv = levelOf(xp);
  const lo = 120 * (lv - 1) * (lv - 1), hi = 120 * lv * lv;
  const pct = Math.min(100, Math.round(100 * (xp - lo) / (hi - lo)));
  const hud = $("hud"), hudLv = $("hudLv");
  if (!hud || !hudLv) return;          // tolerate a skewed shell — never blank the map
  hudLv.textContent = lv;
  hud.style.background = `conic-gradient(var(--violet) ${pct}%, #ece7f7 ${pct}% 100%)`;
  hud.title = `Level ${lv} · ${xp} XP · ${hi - xp} to next level`;
}

/* ---------------- map ---------------- */
const M_CLASS = ["m0", "m1", "m2", "m3"];
const M_LABEL = ["New", "Familiar", "Proficient", "Mastered"];

function frontierSkill() {
  for (const isl of BT.ISLANDS) for (const u of isl.units) for (const id of u.skills) {
    if (unlocked(id) && skv(id).m < 2) return id;
  }
  return null;
}

function renderMap(scrollToHere) {
  paintHeader();
  paintDaily();
  paintTestChip();
  const root = $("mapRoot");
  root.innerHTML = "";
  const frontier = frontierSkill();
  let frontierEl = null;
  const rail = $("islRail");
  if (rail) rail.innerHTML = "";
  let zig = 0;   // alternates left/right down the whole trail
  for (const isl of BT.ISLANDS) {
    const skillsHere = isl.units.flatMap(u => u.skills);
    const done = skillsHere.filter(id => skv(id).m >= 2).length;
    const beatenIsl = !!(bosses()[isl.id] && bosses()[isl.id].won);
    const card = el("section", "island" + (beatenIsl ? " conquered" : ""));
    card.dataset.isl = isl.id;
    card.setAttribute("data-emoji", isl.emoji);
    card.appendChild(el("h2", "isl-name", `${isl.emoji} ${esc(isl.name)} <span class="isl-progress">${done}/${skillsHere.length}</span>`));
    for (const u of isl.units) {
      card.appendChild(el("p", "unit-name", esc(u.name)));
      const row = el("div", "trail");
      for (const id of u.skills) {
        const s = BT.SKILLS[id], st = skv(id);
        const open = unlocked(id);
        const node = el("button", "node " + (open ? M_CLASS[st.m] : "locked") + (id === frontier ? " frontier" : "") + (zig++ % 2 ? " r" : " l"));
        node.dataset.skill = id;
        node.setAttribute("aria-label", `${s.name}: ${open ? M_LABEL[st.m] : "locked"}`);
        const due = st.m >= 2 && st.nextReview && st.nextReview <= today();
        node.innerHTML = `${id === frontier ? '<span class="here">📍</span>' : ""}
          <span class="node-face">${open ? s.icon : "🔒"}</span>
          <span class="node-name">${esc(s.name)}</span>
          <span class="node-badge">${due ? "🛡" : (st.stars ? "⭐".repeat(st.stars) : "")}</span>`;
        node.onclick = () => open ? openSkill(id) : toast("🔒", "Not yet!", "Finish the skills before it first.");
        if (id === frontier) frontierEl = node;
        row.appendChild(node);
      }
      card.appendChild(row);
    }
    /* island boss gate: opens once every skill here is Proficient — the same
       bar the n/n island counter shows, so "boss beaten" means "island full" */
    const bossReady = inTest() || skillsHere.every(id => skv(id).m >= 2);
    const beaten = !!bosses()[isl.id];
    const bossBtn = el("button", "boss-node" + (beaten ? " beaten" : bossReady ? " ready" : " waiting"));
    bossBtn.innerHTML = `<span class="boss-face">${isl.boss.emoji}</span>
      <span class="boss-meta"><b>${beaten ? "👑 " : ""}${esc(isl.boss.name)}</b>
      <small>${beaten ? `“You truly are a master of my island!” Best: ${bosses()[isl.id].best || "?"}/10 — tap for a rematch.` : bossReady ? `“${esc(isl.boss.line)}” — ⚔️ tap to challenge!` : `“${esc(isl.boss.line)}” <i>(level up every skill to Proficient first)</i>`}</small></span>`;
    bossBtn.onclick = () => beaten || bossReady ? bossIntro(isl, beaten)
      : toast("🔒", "Not yet!", `${isl.boss.name} waits until every skill on ${isl.name} is Proficient.`);
    card.appendChild(bossBtn);
    root.appendChild(card);
    if (rail) {
      const dot = el("button", "rail-dot" + (skillsHere.includes(frontier) ? " here" : ""), isl.emoji);
      dot.title = isl.name;
      dot.setAttribute("aria-label", "Jump to " + isl.name);
      dot.onclick = () => { try { card.scrollIntoView({ block: "start", behavior: "smooth" }); } catch { } };
      rail.appendChild(dot);
    }
  }
  /* defend-your-islands banner when reviews are due */
  const due = dueSkills();
  const banner = $("reviewBanner");
  if (!banner) return;
  if (due.length) {
    banner.hidden = false;
    banner.innerHTML = due.length > 8
      ? `🛡 Defend <b>8</b> of your islands! (${due.length} waiting — one bite at a time)`
      : `🛡 Defend your islands! <b>${due.length}</b> skill${due.length > 1 ? "s" : ""} need${due.length > 1 ? "" : "s"} you`;
    banner.onclick = () => startReview();
  } else banner.hidden = true;
  const cont = $("continueBtn");
  if (!cont) return;
  if (frontier) { cont.hidden = false; cont.innerHTML = `▶ Continue: ${esc(BT.SKILLS[frontier].name)} ${BT.SKILLS[frontier].icon}`; cont.onclick = () => openSkill(frontier); }
  else { cont.hidden = true; }
  if (scrollToHere && frontierEl) { try { frontierEl.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { } }
  const lb = $("lightningBtn");
  if (lb) {
    if (lightningPool().length >= 5) {
      lb.hidden = false;
      const best = P().lightningBest || 0;
      lb.innerHTML = `<span class="bolt">⚡</span><span class="best">${best ? "Best " + best : "Go!"}</span>`;
      lb.setAttribute("aria-label", best ? `Lightning Round — best ${best}` : "Lightning Round");
      lb.onclick = () => strikeLightning(() => startLightning());
    } else lb.hidden = true;
  }
  maybeSyncNudge();
  paintMusicBtn();
  Music.sync();
}
function maybeSyncNudge() {
  if (state.syncNudged || inTest()) return;
  if (Object.keys(P().timeByDay || {}).length < 3) return;
  if (!document.getElementById("cloudChip")) return;
  state.syncNudged = true; save();
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">💾</p><h2>Protect this progress</h2>
    <p class="sheet-acc">Three days of adventuring lives only on this device right now. A free sync account keeps the trail safe if the browser is ever cleared — and lets it follow you to other devices.</p>`;
  const go = el("button", "primary-btn", "☁️ Set up sync");
  go.onclick = () => { back.remove(); const c = document.getElementById("cloudChip"); if (c && c.click) c.click(); };
  const later = el("button", "soft-btn", "Maybe later");
  later.onclick = () => back.remove();
  box.append(go, later); back.appendChild(box);
  $("overlay").appendChild(back);
}

/* ---------------- daily campfire ---------------- */
const yesterIso = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localISO(d); };
function paintDaily() {
  const fire = $("campfire"); if (!fire) return;
  const st = P().streak;
  const doneToday = st.last === today();
  const flame = st.count >= 7 ? "🎆" : "🔥";
  fire.hidden = false;
  fire.className = doneToday ? "lit" : "pending";
  if (st.count > 0) fire.classList.add("has-streak");
  fire.innerHTML = `<span class="flame">${flame}</span><span class="streak">${st.count || ""}</span>`;
  fire.setAttribute("aria-label", doneToday
    ? `Campfire glowing — ${st.count}-day streak`
    : "Daily Campfire — tap to light today's fire");
  fire.onclick = () => doneToday
    ? toast(flame, "Glowing bright!", `${st.count}-day streak. The fire is happy until tomorrow!`)
    : startDaily();
}
function startDaily() {
  const due = shuffleArr(dueSkills());
  const practiced = shuffleArr(Object.keys(P().skills).filter(id => BT.SKILLS[id] && sk(id).m >= 1 && unlocked(id)));
  const queue = [...due, ...practiced];
  const fr = frontierSkill();
  while (queue.length < 5) queue.push(fr || practiced[0] || "count.to10");
  beginSession({ kind: "daily", queue: queue.slice(0, 5), total: 5, d: 0.55, adaptive: false, title: "🔥 Daily Campfire" });
}
/* ---------------- lightning round (timed endgame loop) ---------------- */
const LIGHT_MS = FAST ? 1200 : 60000;
function lightningPool() {
  let pool = Object.keys(P().skills).filter(id => BT.SKILLS[id] && skv(id).m >= 2);
  if (pool.length < 5) pool = Object.keys(P().skills).filter(id => BT.SKILLS[id] && skv(id).m >= 1);
  return pool;
}
function startLightning() {
  const pool = lightningPool();
  if (pool.length < 5) return;
  const queue = [];
  while (queue.length < 80) queue.push(...shuffleArr(pool));
  beginSession({
    kind: "lightning", queue: queue.slice(0, 80), total: 80,
    d: 0.7, adaptive: false, title: "⚡ Lightning Round",
    msOk: FAST ? 40 : 350, msBad: FAST ? 60 : 950,
  });
  const t0 = Date.now();
  Sess.timerId = setInterval(() => {
    if (!Sess || Sess.kind !== "lightning") return;
    const left = Math.max(0, Math.ceil((LIGHT_MS - (Date.now() - t0)) / 1000));
    const pips = $("pips"); if (pips) pips.innerHTML = `<span class="pip">⏱ ${left}s</span>`;
    const ti = $("playTitle"); if (ti) ti.textContent = `⚡ ${Sess.correct}`;
    if (Date.now() - t0 >= LIGHT_MS) finishLightning();
  }, 250);
}
function finishLightning() {
  if (!Sess || Sess.kind !== "lightning") return;
  clearInterval(Sess.timerId);
  addPlayTime();
  const { correct, xpGain, lvFrom } = Sess;
  Sess = null;
  const prevBest = P().lightningBest || 0;
  const record = correct > prevBest;
  if (record) P().lightningBest = correct;
  save();
  const ex = setExtras(lvFrom);
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="result-head">⚡</p><h2>${record ? "NEW RECORD!" : "Time's up!"}</h2>
    <p class="sheet-acc">You answered <b>${correct}</b> in 60 seconds${record ? "" : ` — your best is <b>${prevBest}</b>`}.</p>
    <p class="result-xp">+${xpGain} XP ⭐</p>${ex.html}`;
  if ((record || ex.pop) && !matchMediaSafe()) confetti();
  const again = el("button", "gold-btn", "⚡ Go again!");
  again.onclick = () => { back.remove(); $("scrPlay").hidden = true; document.body.classList.remove("in-play"); startLightning(); };
  const map = el("button", "soft-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.append(again, map); back.appendChild(box);
  $("overlay").appendChild(back);
  say(record ? `New record! ${correct} in sixty seconds!` : `Time's up! ${correct} answers!`);
}

function finishDaily() {
  addPlayTime();
  const lvFrom = Sess.lvFrom, correct = Sess.correct, total = Sess.total, xpGain = Sess.xpGain;
  Sess = null;
  const st = P().streak;
  st.count = st.last === yesterIso() ? st.count + 1 : 1;
  st.last = today();
  save();
  const ex = setExtras(lvFrom);
  const flame = st.count >= 7 ? "🎆" : st.count >= 3 ? "🔥🔥" : "🔥";
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="result-head">${flame}</p><h2>Campfire lit!</h2>
    <p class="sheet-acc">${correct}/${total} right · <b>${st.count}-day streak</b>${st.count > 1 ? " — it's growing!" : ""}</p>
    <p class="result-xp">+${xpGain} XP ⭐</p>${ex.html}`;
  if (ex.pop && !matchMediaSafe()) confetti();
  const map = el("button", "primary-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.appendChild(map); back.appendChild(box);
  $("overlay").appendChild(back);
  say(`Campfire lit! ${st.count} day streak!`);
}

/* ---------------- skill sheet ---------------- */
/* ---------------- learn-it-first: teach the concept before the first practice ---------------- */
function answerText(q) {
  if (q.format === "choice") return q.choices.find(c => c.correct).label;
  if (q.format === "tf") return q.answer ? "TRUE" : "FALSE";
  if (q.format === "keypad") return q.decimal ? q.answer.toFixed(1) : String(q.answer);
  if (q.format === "order") return q.correct.join(" → ");
  if (q.format === "tap") return (q.items.find(i => i.correct) || {}).label || "";
  return "";
}
function learnSkill(id) {
  const s = BT.SKILLS[id];
  let q = null; try { q = s.gen(0.4); } catch { }
  const back = el("div", "modal-back"), box = el("div", "modal teach learn");
  const eg = q ? `<div class="learn-eg">
      <p class="eg-prompt">${esc(q.prompt)}</p>
      ${q.pic ? `<div class="q-pic">${pic(q.pic)}</div>` : ""}
      ${q.visual ? `<p class="eg-visual">${esc(q.visual).replace(/\n/g, "<br>")}</p>` : ""}
      <p class="eg-ans">Answer: <b>${esc(answerText(q))}</b></p>
    </div>` : "";
  box.innerHTML = `<p class="sheet-icon">${s.icon}</p><h2>Let's learn: ${esc(s.name)}</h2>
    <p class="sheet-acc">Here's how it works — then you'll try it yourself.</p>${eg}`;
  const list = el("div", "teach-steps");
  const steps = (q && q.steps) || [];
  steps.forEach(stp => list.appendChild(el("p", "step", esc(stp))));
  box.appendChild(list);
  const go = el("button", "primary-btn", "I'm ready — let's practice! 🚀");
  go.onclick = () => { P().taught[id] = today(); save(); back.remove(); startSet(id, "practice"); };
  const hear = el("button", "soft-btn", "🔊 Read it to me again");
  const readAll = () => sayLines([s.name, ...steps]);
  hear.onclick = readAll;
  const later = el("button", "soft-btn", "Back to map");
  later.onclick = () => back.remove();
  box.append(go, hear, later);
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
  readAll();
}

function openSkill(id) {
  const s = BT.SKILLS[id], st = sk(id);
  /* first ever encounter → teach the concept before any practice (Khan-style) */
  if (!inTest() && st.attempts === 0 && !P().taught[id]) return learnSkill(id);
  const back = el("div", "modal-back"), box = el("div", "modal sheet");
  const acc = st.attempts ? Math.round(100 * st.correct / st.attempts) : null;
  box.innerHTML = `<p class="sheet-icon">${s.icon}</p><h2>${esc(s.name)}</h2>
    <p class="sheet-state ${M_CLASS[st.m]}">${M_LABEL[st.m]}${st.stars ? " · " + "⭐".repeat(st.stars) : ""}</p>
    ${acc !== null ? `<p class="sheet-acc">${st.correct}/${st.attempts} right so far (${acc}%)</p>` : `<p class="sheet-acc">Ready for your first try!</p>`}
    ${st.m >= 2 && st.nextReview ? `<p class="sheet-acc">🛡 ${st.nextReview <= today() ? "Review due now — defend it!" : "Comes back for review on " + st.nextReview}</p>` : ""}`;
  const practice = el("button", "primary-btn", "Practice · 7 questions");
  practice.onclick = () => { back.remove(); startSet(id, "practice"); };
  box.appendChild(practice);
  if (st.m >= 1 && st.m < 2) {
    const lvl = el("button", "gold-btn", `⚡ Level Up · ${levelupNeed(id)} of 5 to pass`);
    lvl.onclick = () => { back.remove(); startSet(id, "levelup"); };
    box.appendChild(lvl);
  }
  const learn = el("button", "soft-btn", "📘 Learn it again");
  learn.onclick = () => { back.remove(); learnSkill(id); };
  box.appendChild(learn);
  const close = el("button", "soft-btn", "Back to map");
  close.onclick = () => back.remove();
  box.appendChild(close);
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}

/* ---------------- session ---------------- */
let Sess = null;

function overLimit() {
  const lim = P().settings.dailyLimit || 0;
  return lim > 0 && (P().timeByDay[today()] || 0) >= lim * 60;
}
function beginSession(cfg) {
  if (!cfg._force && overLimit() && !inTest()) {
    const back = el("div", "modal-back"), box = el("div", "modal");
    box.innerHTML = `<p class="sheet-icon">🌙</p><h2>Big brain, big rest!</h2>
      <p class="sheet-acc">You've played ${fmtMins(P().timeByDay[today()] || 0)} today — your brain grows while it rests, too.</p>`;
    const rest = el("button", "primary-btn", "Back to the map 🗺");
    rest.onclick = () => back.remove();
    const more = el("button", "soft-btn", "One more set");
    more.onclick = () => { back.remove(); beginSession(Object.assign({ _force: true }, cfg)); };
    box.append(rest, more); back.appendChild(box);
    $("overlay").appendChild(back);
    return;
  }
  Sess = Object.assign({
    i: 0, correct: 0, misses: 0, xpGain: 0,
    taught: false, q: null, lock: false, orderPicked: [],
    results: [],            // review: per-skill outcomes
    lvFrom: levelOf(P().xp), t0: Date.now(),
  }, cfg);
  $("scrMap").hidden = true; $("scrPlay").hidden = false;
  document.body.classList.add("in-play");
  Music.sync();
  $("playTitle").textContent = cfg.title;
  $("reviewBanner").hidden = true;
  $("continueBtn").hidden = true;
  {
    const nm = P().name && P().name !== "Explorer" ? P().name : null;
    const lines = [...PRAISE, ...NOT_QUITE, ...TRY_AGAIN.map(t => t.replace(" 💪", ""))];
    if (nm) PRAISE.forEach(t => lines.push(t.replace("!", `, ${nm}!`)));
    TTS.prefetch(lines);
  }
  Sess.outcomes = [];
  nextQ();
}

/* younger islands pass Level Up at 4/5; older ones keep 5/5 (with the
   one-slip redemption question that follows, that's an effective 5/6) */
const levelupNeed = (id) => YOUNG_ISLANDS.has(BT.SKILLS[id].island) ? 4 : 5;
function startSet(id, kind) {
  const st = sk(id);
  beginSession({
    kind, queue: Array(kind === "levelup" ? 5 : 7).fill(id),
    total: kind === "levelup" ? 5 : 7,
    need: kind === "levelup" ? levelupNeed(id) : 5,
    d: kind === "levelup" ? 0.85 : Math.min(0.9, (st.lastD || (0.35 + 0.15 * st.m))),
    adaptive: kind === "practice", title: BT.SKILLS[id].name,
  });
}

function startReview() {
  const due = shuffleArr(dueSkills()).slice(0, 8);
  if (!due.length) return;
  beginSession({ kind: "review", queue: due, total: due.length, d: 0.85, adaptive: false, title: "🛡 Mastery Challenge" });
}

function bossIntro(isl, rematch) {
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">${isl.boss.emoji}</p><h2>${esc(isl.boss.name)}</h2>
    <p class="sheet-acc">“${esc(isl.boss.line)}”</p>
    <p class="sheet-acc">10 mixed questions from ${esc(isl.name)}. Get <b>8 or more</b> to ${rematch ? "win glory again" : "conquer the island"}!</p>`;
  const go = el("button", "gold-btn", "⚔️ I'm ready!");
  go.onclick = () => { back.remove(); startBoss(isl.id); };
  const flee = el("button", "soft-btn", "Maybe later");
  flee.onclick = () => back.remove();
  box.append(go, flee); back.appendChild(box);
  $("overlay").appendChild(back);
}

function startBoss(islandId) {
  const isl = BT.ISLANDS.find(i => i.id === islandId);
  const pool = isl.units.flatMap(u => u.skills);
  const queue = [];
  while (queue.length < 10) queue.push(...shuffleArr(pool));
  beginSession({ kind: "boss", islandId, queue: queue.slice(0, 10), total: 10,
    d: 0.8, adaptive: false, title: `${isl.boss.emoji} ${isl.boss.name}` });
}
const shuffleArr = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

function exitPlay() {
  if (Sess && Sess.timerId) clearInterval(Sess.timerId);
  addPlayTime();
  Sess = null;
  $("scrPlay").hidden = true; $("scrMap").hidden = false;
  document.body.classList.remove("in-play");
  renderMap(true); save();
}
$("exitBtn") && ($("exitBtn").onclick = () => {
  if (Sess && Sess.i > 0 && Sess.i < Sess.total) {
    const back = el("div", "modal-back"), box = el("div", "modal");
    box.innerHTML = `<p class="sheet-icon">🗺</p><h2>Leave the quest?</h2>
      <p class="sheet-acc">Your XP is safe, but this set won't finish.</p>`;
    const stay = el("button", "primary-btn", "Keep playing! 💪"); stay.onclick = () => back.remove();
    const go = el("button", "soft-btn", "Back to the map"); go.onclick = () => { back.remove(); exitPlay(); };
    box.append(stay, go); back.appendChild(box);
    $("overlay").appendChild(back);
  } else exitPlay();
});

function paintPips() {
  if (Sess && Sess.kind === "lightning") return;   // the timer owns this slot
  const pips = $("pips"); pips.innerHTML = "";
  for (let k = 0; k < Sess.total; k++) {
    const done = k < Sess.i;
    const cls = "pip" + (done ? (Sess.outcomes[k] ? "" : " miss") : k === Sess.i ? " now" : "");
    pips.appendChild(el("span", cls, done ? (Sess.outcomes[k] ? "⭐" : "▫️") : k === Sess.i ? "👉" : "▫️"));
  }
}

function nextQ() {
  if (!Sess) return;
  if (Sess.i >= Sess.total) return finishSet();
  Sess.curSkill = Sess.queue[Sess.i];
  /* reviews meet each skill near its own practised difficulty, not a flat bar */
  const dEff = Sess.kind === "review"
    ? Math.min(0.95, Math.max(0.5, (skv(Sess.curSkill).lastD || 0.6) + 0.1))
    : Sess.d;
  Sess.q = BT.SKILLS[Sess.curSkill].gen(dEff);
  if (Sess.q.format === "keypad" && !Sess.q.decimal && YOUNG_ISLANDS.has(BT.SKILLS[Sess.curSkill].island)) Sess.q = youngify(Sess.q);
  Sess.lock = false; Sess.orderPicked = [];
  Sess.qTries = 0; Sess.resetEntry = null;
  if (Sess.kind === "review" || Sess.kind === "boss") $("playTitle").textContent =
    (Sess.kind === "review" ? "🛡 " : "") + BT.SKILLS[Sess.curSkill].name;
  paintPips();
  renderQuestion(Sess.q);
  say(Sess.q.say);
}

function renderQuestion(q) {
  $("hintSlot").innerHTML = "";
  const card = $("promptCard");
  card.innerHTML = `<p class="q-prompt">${esc(q.prompt)}</p>` +
    (q.pic ? `<div class="q-pic">${pic(q.pic)}</div>` : "") +
    (q.visual ? `<p class="q-visual">${esc(q.visual).replace(/\n/g, "<br>")}</p>` : "") +
    `<button class="say-btn" aria-label="Hear it again">🔊 Hear it</button>`;
  const dock = $("answerArea");
  dock.innerHTML = "";
  Sess.onKey = null;   // each format installs its own keyboard shortcuts below
  if (q.format === "choice" || q.format === "tf") {
    const choices = q.format === "tf"
      ? [{ label: "✔ TRUE", correct: q.answer === true }, { label: "✘ FALSE", correct: q.answer === false }]
      : q.choices;
    const grid = el("div", q.format === "tf" ? "tf-grid" : "choice-grid");
    const btns = [];
    choices.forEach(c => {
      const b = el("button", "choice-btn" + (q.format === "tf" ? (c.label.includes("TRUE") ? " true" : " false") : ""), esc(c.label));
      if (c.correct) b.dataset.correct = "1";
      b.onclick = () => submit(c.correct, correctLabel(q), b);
      grid.appendChild(b); btns.push(b);
    });
    dock.appendChild(grid);
    Sess.onKey = (e) => {
      if (q.format === "tf" && /^[tf]$/i.test(e.key)) { e.preventDefault(); btns[/t/i.test(e.key) ? 0 : 1].click(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length) { e.preventDefault(); btns[n - 1].click(); }
    };
  } else if (q.format === "keypad") {
    const disp = el("div", "pad-display", "&nbsp;");
    const grid = el("div", "keypad");
    let entry = "";
    const paint = () => disp.textContent = entry || " ";
    const keys = q.decimal ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫", "OK"] : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
    const keyBtns = {};
    keys.forEach(kk => {
      const b = el("button", "key" + (kk === "OK" ? " ok" : kk === "⌫" ? " back" : ""), kk);
      if (kk === "OK" && q.decimal) b.style.gridColumn = "span 3";
      b.onclick = () => {
        if (Sess.lock) return;
        if (kk === "⌫") entry = entry.slice(0, -1);
        else if (kk === "OK") {
          if (entry !== "" && entry !== ".") {
            const v = parseFloat(entry);
            submit(Math.abs(v - q.answer) < 0.001, q.decimal ? q.answer.toFixed(1) : String(q.answer), disp);
          }
          return;
        }
        else if (kk === "." ) { if (!entry.includes(".") && entry.length < 4) entry += entry === "" ? "0." : "."; }
        else if (entry.length < (q.decimal ? 5 : 3)) entry += kk;
        paint();
      };
      grid.appendChild(b); keyBtns[kk] = b;
    });
    Sess.resetEntry = () => { entry = ""; paint(); };
    dock.append(disp, grid);
    Sess.onKey = (e) => {
      let label = null;
      if (/^[0-9]$/.test(e.key)) label = e.key;
      else if (e.key === "Backspace") label = "⌫";
      else if (e.key === "Enter") label = "OK";
      else if (e.key === "." && q.decimal) label = ".";
      if (label && keyBtns[label]) { e.preventDefault(); keyBtns[label].click(); }
    };
  } else if (q.format === "order") {
    const slots = el("div", "order-slots");
    const chips = el("div", "order-chips");
    const paintSlots = () => { slots.innerHTML = ""; for (let k = 0; k < q.items.length; k++) slots.appendChild(el("span", "slot" + (Sess.orderPicked[k] !== undefined ? " filled" : ""), Sess.orderPicked[k] !== undefined ? String(Sess.orderPicked[k]) : "")); };
    paintSlots();
    const chipBtns = [];
    q.items.forEach(v => {
      const b = el("button", "chip", String(v));
      b.onclick = () => {
        if (Sess.lock || b.disabled) return;
        b.disabled = true; b.classList.add("used");
        Sess.orderPicked.push(v); paintSlots();
        if (Sess.orderPicked.length === q.items.length) {
          submit(JSON.stringify(Sess.orderPicked) === JSON.stringify(q.correct), q.correct.join(" → "), slots);
        }
      };
      chips.appendChild(b); chipBtns.push({ b, v });
    });
    Sess.resetEntry = () => {
      Sess.orderPicked = [];
      paintSlots();
      Array.from(chips.children).forEach(c => { c.disabled = false; if (c.classList) c.classList.remove("used"); });
    };
    dock.append(slots, chips);
    Sess.onKey = (e) => {
      const n = parseInt(e.key, 10);
      if (isNaN(n)) return;
      const hit = chipBtns.find(x => x.v === n && !x.b.disabled);   // type the value you want next
      if (hit) { e.preventDefault(); hit.b.click(); }
    };
  } else if (q.format === "tap") {
    const grid = el("div", q.numberline ? "line-grid" : "tap-grid");
    const tiles = [];
    q.items.forEach(c => {
      const b = el("button", q.numberline ? "line-tick" : "tap-tile", esc(c.label));
      if (c.correct) b.dataset.correct = "1";
      b.onclick = () => submit(c.correct, q.items.find(i => i.correct).label, b);
      grid.appendChild(b); tiles.push(b);
    });
    dock.appendChild(grid);
    Sess.onKey = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= tiles.length) { e.preventDefault(); tiles[n - 1].click(); }
    };
  }
}

function correctLabel(q) {
  if (q.format === "choice") return q.choices.find(c => c.correct).label;
  if (q.format === "tf") return q.answer ? "TRUE" : "FALSE";
  return "";
}

/* central answer path — every format funnels here */
let spokenPraise = "";
function submit(ok, correctShown, btn) {
  if (!Sess || Sess.lock) return;
  /* first slip = a free retry on the SAME question, answer kept secret
     (Lightning stays single-try — it's the timed endgame for older kids) */
  if (!ok && !Sess.qTries && Sess.kind !== "lightning") {
    Sess.qTries = 1;
    Sess.lock = true;
    if (btn && btn.classList) btn.classList.add("shake");
    SFX.no();
    feedback(false, pick(TRY_AGAIN), esc(Sess.q.hint));
    say("Try again!");
    setTimeout(() => {
      if (!Sess) return;
      if (btn && btn.classList) btn.classList.remove("shake");
      if (Sess.resetEntry) Sess.resetEntry();
      Sess.lock = false;
    }, FAST ? 60 : 1100);
    return;
  }
  Sess.lock = true;
  const firstTry = !Sess.qTries;
  const finalFail = !ok;
  Sess.outcomes[Sess.i] = !!ok;
  paintPips();
  if (btn && btn.classList) btn.classList.add(ok ? "hit" : "shake");
  if (finalFail) {
    try {
      const right = $("answerArea").querySelector('[data-correct="1"]');
      if (right) right.classList.add("reveal");
    } catch { }
  }
  const st = sk(Sess.curSkill);
  st.attempts++;
  if (ok) {
    st.correct++; Sess.correct++;
    const gain = Math.round(firstTry ? 6 + 8 * Sess.d : 3 + 4 * Sess.d);   // retry success = half XP
    Sess.xpGain += gain; P().xp += gain;
    if (Sess.adaptive && firstTry) Sess.d = Math.min(1, Sess.d + 0.12);
    SFX.ok();
    let praise = pick(PRAISE);
    if (Math.random() < 0.22 && P().name && P().name !== "Explorer") praise = praise.replace("!", `, ${P().name}!`);
    spokenPraise = praise;
    feedback(true, praise, "+" + gain + " XP");
  } else {
    Sess.misses++;
    if (Sess.adaptive) Sess.d = Math.max(0.15, Sess.d - 0.18);
    SFX.no();
    feedback(false, pick(NOT_QUITE), (correctShown ? `It was <b>${esc(correctShown)}</b>. ` : "") + esc(Sess.q.hint));
  }
  /* level-up kindness: one failed question earns a redemption question */
  if (finalFail && Sess.kind === "levelup" && Sess.misses === 1 && Sess.total === 5) {
    Sess.total = 6;
    Sess.queue.push(Sess.curSkill);
  }
  /* spaced-review transitions happen on the question's final outcome */
  if (Sess.kind === "review") {
    if (ok) {
      const mastered = st.m === 2;
      if (st.m < 3) st.m = 3;
      st.reviewStep = Math.min((st.reviewStep || 0) + 1, REVIEW_DAYS.length - 1);
      st.nextReview = isoPlusDays(REVIEW_DAYS[st.reviewStep]);
      Sess.results.push({ id: Sess.curSkill, ok: true, mastered });
    } else {
      st.m = Math.max(1, st.m - 1);
      st.reviewStep = 0;
      st.nextReview = st.m >= 2 ? isoPlusDays(REVIEW_DAYS[0]) : null;
      Sess.results.push({ id: Sess.curSkill, ok: false });
    }
  }
  paintHeader(); save();
  const failedQ = Sess.q;
  /* give the spoken praise room to finish before the next card appears */
  let delay = ok ? (Sess.msOk || MS_OK) : (Sess.msBad || MS_BAD);
  if (ok && !FAST && Sess.kind !== "lightning" && P().settings.speech) delay = Math.max(delay, speechMs(spokenPraise) + 250);
  setTimeout(() => {
    if (!Sess) return;
    Sess.i++;
    /* failed twice → coach through the worked answer right under the card */
    if (finalFail && Sess.kind !== "lightning") inlineTeach(failedQ);
    else nextQ();
  }, delay);
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function feedback(ok, title, sub) {
  if (ok) {
    const t = el("div", "xp-pop", `✨ ${esc(title)} ${esc(sub)}`);
    document.body.appendChild(t);
    say(title);
    setTimeout(() => t.remove(), MS_OK + 250);
  } else {
    const bar = el("div", "hintbar", `💛 <b>${esc(title)}</b> ${sub}`);
    $("hintSlot").innerHTML = "";
    $("hintSlot").appendChild(bar);
  }
}

function toast(emoji, title, sub) {
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">${emoji}</p><h2>${esc(title)}</h2><p class="sheet-acc">${esc(sub)}</p>`;
  const ok = el("button", "primary-btn", "Okay!"); ok.onclick = () => back.remove();
  box.appendChild(ok); back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}

/* teaching moment: worked steps, one at a time, with speech */
function inlineTeach(q) {
  /* the question card stays put — the coach appears right beneath it */
  const slot = $("hintSlot");
  slot.innerHTML = "";
  const coach = el("div", "coach", `<p class="coach-head">🤝 Let me show you!</p>`);
  const list = el("div", "teach-steps");
  coach.appendChild(list);
  slot.appendChild(coach);
  const dock = $("answerArea");
  dock.innerHTML = "";
  const btn = el("button", "coach-next", "Next step ▶");
  let i = 0;
  const reveal = () => {
    if (i < q.steps.length) {
      list.appendChild(el("p", "step", esc(q.steps[i])));
      say(q.steps[i]); i++;
      if (i === q.steps.length) btn.innerHTML = "Got it — next question 💪";
    } else { if (Sess) nextQ(); }
  };
  btn.onclick = reveal;
  dock.appendChild(btn);
  reveal();
}

/* ---------------- set completion & mastery ---------------- */
function finishSet() {
  const { kind, correct, total, xpGain, need } = Sess;
  if (kind === "review") return finishReview();
  if (kind === "boss") return finishBoss();
  if (kind === "daily") return finishDaily();
  if (kind === "lightning") return finishLightning();
  const id = Sess.queue[0];
  const st = sk(id);
  let headline, sub, levelled = false;
  if (kind === "practice") {
    const stars = Math.max(0, correct - (total - 3));     // 5/7→1★ 6/7→2★ 7/7→3★
    if (stars > st.stars) st.stars = stars;
    if (correct >= 5 && st.m < 1) { st.m = 1; levelled = true; }
    headline = stars ? "⭐".repeat(stars) : "Good try!";
    sub = `${correct} of ${total} right` + (levelled ? " — you're now FAMILIAR with this skill!" : "");
  } else {
    const pass = need || 5;
    if (correct >= pass) {
      if (st.m < 2) { st.m = 2; levelled = true; }
      st.nextReview = isoPlusDays(REVIEW_DAYS[0]);
      headline = "⚡ PROFICIENT! ⚡";
      sub = `${correct === total ? "Perfect" : "Strong"} ${correct}/${total}! This skill comes back for review in ${REVIEW_DAYS[0]} days — keep it strong to master it.`;
    } else {
      headline = "So close!";
      sub = `Level Up needs ${pass} right — you got ${correct}/${total}. A little more practice and you'll smash it!`;
    }
  }
  if (kind === "practice") st.lastD = Math.round(Sess.d * 100) / 100;   // remember the climb
  addPlayTime();
  const lvFrom = Sess.lvFrom;
  Sess = null;
  save();
  const ex = setExtras(lvFrom);
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="result-head">${headline}</p><p class="sheet-acc">${esc(sub)}</p>
    <p class="result-xp">+${xpGain} XP ⭐</p>${ex.html}`;
  if ((levelled || ex.pop) && !matchMediaSafe()) confetti();
  const again = el("button", "soft-btn", "Practice again");
  again.onclick = () => { back.remove(); $("scrPlay").hidden = true; startSet(id, "practice"); };
  const map = el("button", "primary-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.append(map, again); back.appendChild(box);
  $("overlay").appendChild(back);
  say(typeof headline === "string" && headline.includes("⭐") ? "Amazing work!" : headline.replace(/[^a-zA-Z !']/g, ""));
}

function finishReview() {
  addPlayTime();
  const { results, xpGain, lvFrom } = Sess;
  Sess = null; save();
  const ex = setExtras(lvFrom);
  const defended = results.filter(r => r.ok).length;
  const mastered = results.filter(r => r.mastered).length;
  const slipped = results.filter(r => !r.ok);
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="result-head">🛡</p>
    <h2>${defended === results.length ? "Islands defended!" : "Battle report"}</h2>
    <p class="sheet-acc">You defended <b>${defended}/${results.length}</b> skills.${mastered ? ` ${mastered} newly <b>MASTERED</b>! 🏅` : ""}</p>
    ${slipped.length ? `<p class="sheet-acc">Slipped back (practice them soon!): ${slipped.map(r => esc(BT.SKILLS[r.id].name)).join(", ")}</p>` : ""}
    <p class="result-xp">+${xpGain} XP ⭐</p>${ex.html}`;
  if ((mastered || ex.pop) && !matchMediaSafe()) confetti();
  const remaining = dueSkills().length;
  if (remaining) {
    const more = el("button", "gold-btn", `🛡 Defend ${Math.min(8, remaining)} more!`);
    more.onclick = () => { back.remove(); $("scrPlay").hidden = true; document.body.classList.remove("in-play"); startReview(); };
    box.appendChild(more);
  }
  const map = el("button", remaining ? "soft-btn" : "primary-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.appendChild(map); back.appendChild(box);
  $("overlay").appendChild(back);
  say(defended === results.length ? "Islands defended! Amazing!" : "Good battle! Keep practicing.");
}

function finishBoss() {
  addPlayTime();
  const { islandId, correct, total, xpGain, lvFrom } = Sess;
  Sess = null;
  const isl = BT.ISLANDS.find(i => i.id === islandId);
  const won = correct >= 8;
  const prev = bosses()[islandId];
  const firstWin = won && !(prev && prev.won);
  let bonus = 0;
  if (firstWin) { bonus = 100; P().xp += bonus; }
  bosses()[islandId] = { won: !!(prev && prev.won) || won, best: Math.max(prev ? prev.best || 0 : 0, correct) };
  save();
  const ex = setExtras(lvFrom);
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="sheet-icon">${isl.boss.emoji}</p>
    <h2>${won ? `${esc(isl.name)} conquered! 👑` : "So close, explorer!"}</h2>
    <p class="sheet-acc">${won ? `${esc(isl.boss.name)}: “You truly are a master of my island!”` : `${esc(isl.boss.name)}: “${correct} of ${total}! Train a little more and face me again.”`}</p>
    <p class="result-xp">+${xpGain}${bonus ? " + " + bonus + " bonus" : ""} XP ⭐</p>
    <p class="sheet-acc">Best score: ${bosses()[islandId].best}/10</p>${ex.html}`;
  if ((won || ex.pop) && !matchMediaSafe()) confetti();
  const map = el("button", "primary-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.appendChild(map); back.appendChild(box);
  $("overlay").appendChild(back);
  say(won ? "Island conquered! Incredible!" : "So close! Try again soon.");
}

function matchMediaSafe() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }

function confetti() {
  const wrap = el("div", "confetti");
  const COLORS = ["#a78bfa", "#fbbf24", "#34d399", "#38bdf8", "#fb7185"];
  for (let k = 0; k < 70; k++) {
    const p = el("span");
    p.style.left = (Math.random() * 100) + "%";
    p.style.background = COLORS[k % COLORS.length];
    p.style.animationDelay = (Math.random() * 0.7) + "s";
    p.style.animationDuration = (2.2 + Math.random() * 1.5) + "s";
    wrap.appendChild(p);
  }
  $("overlay").appendChild(wrap);
  setTimeout(() => wrap.remove(), 4600);
}

/* ---------------- test mode (grown-ups: try everything, throw it away) ---------------- */
function paintTestChip() {
  const c = $("testChip");
  if (!c) return;
  c.hidden = !inTest();
}
function enterTestMode() {
  const p = FRESH_PROFILE();                       // fresh sandbox on every entry
  p.badges = {}; p.timeByDay = {}; p.bosses = {}; p.name = "Tester"; p.avatar = "🧪";
  p.streak = { count: 0, last: null }; p.settings.sound = true;
  state.profiles[TESTP] = p;
  state.profile = TESTP;
  save(); paintTestChip(); renderMap(true);
  toast("🧪", "Test mode", "Every skill and boss is open. Nothing here counts or syncs — tap the amber chip to go back.");
}
function exitTestMode() {
  if (Sess) { Sess = null; $("scrPlay").hidden = true; $("scrMap").hidden = false; document.body.classList.remove("in-play"); }
  state.profile = "default";
  delete state.profiles[TESTP];
  save(); paintTestChip(); renderMap(true);
}
(function wireTestChip() {
  const c = $("testChip"); if (!c) return;
  c.onclick = exitTestMode;
})();

/* ---------------- children (multi-profile) ---------------- */
const childIds = () => Object.keys(state.profiles).filter(id => id !== TESTP);
function switchProfile(id) {
  if (!state.profiles[id]) return;
  if (Sess) { if (Sess.timerId) clearInterval(Sess.timerId); Sess = null; $("scrPlay").hidden = true; $("scrMap").hidden = false; document.body.classList.remove("in-play"); }
  state.profile = id;
  save(); renderMap(true);
}
function deleteChild(id) {
  if (!state.profiles[id] || childIds().length < 2) return false;
  state.deletedProfiles[id] = today();          // tombstone: sync can't bring them back
  if (state.profile === id) state.profile = childIds().find(x => x !== id);
  delete state.profiles[id];
  save();
  return true;
}
function addChild(name, avatar) {
  if (childIds().length >= 4) return null;
  const id = "c" + Date.now();
  const p = migrateProfile(FRESH_PROFILE());
  p.name = (name || "Explorer").slice(0, 16);
  p.avatar = avatar || "🐸";
  state.profiles[id] = p;
  save();
  return id;
}
function openWho() {
  const kids = childIds();
  if (kids.length < 2) return;
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">👋</p><h2>Who's playing?</h2>`;
  kids.forEach(id => {
    const p = state.profiles[id];
    const b = el("button", "who-card" + (id === state.profile ? " here" : ""),
      `<span class="who-face">${esc(p.avatar)}</span><b>${esc(p.name)}</b><small>Level ${levelOf(p.xp)} · ⭐ ${totalStars(p)}</small>`);
    b.onclick = () => { back.remove(); switchProfile(id); };
    box.appendChild(b);
  });
  $("overlay").appendChild(back);
  back.appendChild(box);
}

/* ---------------- backpack (trophy room) ---------------- */
function openBackpack() {
  const p = P();
  const back = el("div", "modal-back"), box = el("div", "modal");
  const crowns = BT.ISLANDS.map(i =>
    `<div class="crown ${p.bosses[i.id] ? "won" : ""}" title="${esc(i.boss.name)}">${p.bosses[i.id] ? i.boss.emoji : "❔"}<small>${esc(i.name.split(" ")[0])}</small></div>`).join("");
  const earned = BADGES.filter(b => p.badges[b.id]);
  const locked = BADGES.filter(b => !p.badges[b.id]);
  box.innerHTML = `<p class="sheet-icon">${esc(p.avatar)}</p><h2>${esc(p.name)}'s Backpack</h2>
    <p class="sheet-acc">Level ${levelOf(p.xp)} · ${p.xp} XP · ⭐ ${totalStars(p)} stars · 🔥 ${p.streak.count || 0}-day streak</p>
    <p class="bp-title">👑 Boss Crowns</p><div class="crowns">${crowns}</div>
    <p class="bp-title">🏅 Badges · ${earned.length}/${BADGES.length}</p>
    <div class="badges">${earned.map(b => `<div class="badge won">${b.emoji}<small>${esc(b.name)}</small></div>`).join("")}${locked.map(b => `<div class="badge">❔<small>${esc(b.name)}</small></div>`).join("")}</div>`;
  if (childIds().length > 1) {
    const sw = el("button", "soft-btn", "👥 Switch player");
    sw.onclick = () => { back.remove(); openWho(); };
    box.appendChild(sw);
  }
  const ok = el("button", "primary-btn", "Back to my trail!");
  ok.onclick = () => back.remove();
  box.appendChild(ok); back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}
$("hud").onclick = openBackpack;

/* ---------------- Parents' Corner (hold 3s gate) ---------------- */
const fmtMins = (secs) => secs < 60 ? "under a minute" : Math.round(secs / 60) + " min";
function weekSecs(p) {
  let s = 0;
  for (let k = 0; k < 7; k++) { const d = new Date(); d.setDate(d.getDate() - k); s += p.timeByDay[localISO(d)] || 0; }
  return s;
}
function openParents() {
  const back = el("div", "modal-back"), box = el("div", "modal parents");
  box.innerHTML = `<h2>👨‍👩‍👧 Parents' Corner</h2>`;
  const group = (title, openByDefault) => {
    const wrapEl = el("div", "pgroup");
    const head = el("button", "pgroup-head", `${title} <span class="caret">${openByDefault ? "▾" : "▸"}</span>`);
    const bodyEl = el("div", "pgroup-body");
    bodyEl.hidden = !openByDefault;
    head.onclick = () => {
      bodyEl.hidden = !bodyEl.hidden;
      head.innerHTML = `${title} <span class="caret">${bodyEl.hidden ? "▸" : "▾"}</span>`;
    };
    wrapEl.append(head, bodyEl);
    box.appendChild(wrapEl);
    return bodyEl;
  };

  /* ── 👧 Children ── */
  const gKids = group("👧 Children", true);
  const FACES = ["🦊", "🐸", "🦄", "🐯", "🐼", "🦖", "🐙", "🦉", "🚀", "🌟"];
  const renderKids = () => {
    gKids.innerHTML = "";
    for (const id of childIds()) {
      const cp = state.profiles[id];
      const row = el("div", "child-row");
      const faceB = el("button", "face-btn", esc(cp.avatar));
      faceB.onclick = () => { cp.avatar = FACES[(FACES.indexOf(cp.avatar) + 1) % FACES.length]; faceB.textContent = cp.avatar; save(); };
      const nameI = el("input"); nameI.type = "text"; nameI.value = cp.name; nameI.maxLength = 16;
      nameI.oninput = () => { cp.name = nameI.value.trim() || "Explorer"; save(); };
      row.append(faceB, nameI);
      if (id === state.profile) row.appendChild(el("span", "active-tag", "playing"));
      else {
        const act = el("button", "mini-btn", "▶ play");
        act.onclick = () => { switchProfile(id); renderKids(); };
        row.appendChild(act);
      }
      if (childIds().length > 1) {
        const del = el("button", "mini-btn del", "✕");
        let armedDel = false;
        del.onclick = () => {
          if (!armedDel) { armedDel = true; del.textContent = "Remove forever?"; del.classList.add("armed"); return; }
          deleteChild(id);
          renderKids();
        };
        row.appendChild(del);
      }
      gKids.appendChild(row);
    }
    if (childIds().length < 4) {
      const add = el("button", "soft-btn", "➕ Add a child");
      add.onclick = () => { addChild("Explorer", FACES[childIds().length % FACES.length]); renderKids(); };
      gKids.appendChild(add);
    }
    if (childIds().length > 1) gKids.appendChild(el("p", "stat-line", "Each child gets their own trail, streak, badges and crowns. The app asks who's playing at startup."));
  };
  renderKids();

  /* ── 📈 Progress (viewable per child) ── */
  const gProg = group("📈 Progress", true);
  let viewId = state.profile === TESTP ? childIds()[0] : state.profile;
  const progBody = el("div");
  const renderProg = () => {
    progBody.innerHTML = "";
    const p = state.profiles[viewId];
    if (childIds().length > 1) {
      const tabs = el("div", "tgl-row");
      childIds().forEach(id => {
        const tb = el("button", "tgl" + (id === viewId ? " on" : ""), `${state.profiles[id].avatar} ${esc(state.profiles[id].name)}`);
        tb.onclick = () => { viewId = id; renderProg(); };
        tabs.appendChild(tb);
      });
      progBody.appendChild(tabs);
    }
    const todaySecs = p.timeByDay[today()] || 0;
    progBody.appendChild(el("p", "stat-line",
      `⏱ Played <b>${fmtMins(todaySecs)}</b> today · <b>${fmtMins(weekSecs(p))}</b> this week<br>` +
      `⭐ Level ${levelOf(p.xp)} · ${countM(p, 1)} skills started · ${countM(p, 2)} proficient · ${countM(p, 3)} mastered` +
      (p.lightningBest ? ` · ⚡ best ${p.lightningBest}` : "")));
    for (const isl of BT.ISLANDS) {
      const blk = el("div", "matrix-isl", `<small>${isl.emoji} ${esc(isl.name)}</small>`);
      const grid = el("div", "matrix");
      for (const id of isl.units.flatMap(u => u.skills)) {
        const st = p.skills[id];
        const m = st ? st.m : null;
        const cls = !st ? "locked" : m >= 1 ? "m" + m : "";
        const sq = el("button", "sq " + cls);
        sq.title = `${BT.SKILLS[id].name} — ${st ? M_LABEL[st.m] : "Not started"}`;
        sq.setAttribute("aria-label", sq.title);
        sq.onclick = () => {
          const q = BT.SKILLS[id].gen(0.5);
          const b2 = el("div", "modal-back"), x2 = el("div", "modal");
          x2.innerHTML = `<p class="sheet-icon">${BT.SKILLS[id].icon}</p><h2>${esc(BT.SKILLS[id].name)}</h2>
            <p class="sheet-state ${st ? "m" + st.m : ""}">${st ? M_LABEL[st.m] : "Not started"}</p>
            ${st && st.attempts ? `<p class="sheet-acc">${st.correct}/${st.attempts} right (${Math.round(100 * st.correct / st.attempts)}%)</p>` : ""}
            <p class="p-section">Sample question</p>
            <p class="sheet-acc" style="font-weight:800; color:var(--ink);">${esc(q.prompt)}</p>
            ${q.pic ? `<div class="q-pic">${pic(q.pic)}</div>` : ""}
            ${q.visual ? `<p class="sheet-acc">${esc(q.visual).replace(/\n/g, "<br>")}</p>` : ""}
            <p class="sheet-acc">Answer: <b>${esc(correctLabel(q))}</b></p>`;
          const cl = el("button", "soft-btn", "Close");
          cl.onclick = () => b2.remove();
          x2.appendChild(cl); b2.appendChild(x2);
          $("overlay").appendChild(b2);
        };
        grid.appendChild(sq);
      }
      blk.appendChild(grid); progBody.appendChild(blk);
    }
    progBody.appendChild(el("p", "legend", "▢ not started · ▣ outline = Familiar · ■ violet = Proficient · ■ gold = Mastered"));
    progBody.appendChild(el("p", "p-section", "Needs a hand"));
    const weak = Object.entries(p.skills)
      .filter(([id, st]) => BT.SKILLS[id] && st.attempts >= 5)
      .map(([id, st]) => ({ id, acc: st.correct / st.attempts, st }))
      .sort((a, b) => a.acc - b.acc).slice(0, 3);
    if (weak.length) weak.forEach(w => {
      const row = el("button", "weak-row",
        `${BT.SKILLS[w.id].icon} ${esc(BT.SKILLS[w.id].name)} — ${Math.round(w.acc * 100)}% right (${w.st.correct}/${w.st.attempts})<small>▶ Tap to start a practice set together right now.</small>`);
      row.onclick = () => { back.remove(); if (viewId !== state.profile) switchProfile(viewId); startSet(w.id, "practice"); };
      progBody.appendChild(row);
    });
    else progBody.appendChild(el("p", "stat-line", "Not enough answers yet — check back after a few sessions!"));
  };
  renderProg();
  gProg.appendChild(progBody);

  /* ── 🔊 Voice & sound ── */
  const gVoice = group("🔊 Voice & sound", false);
  const p = P();
  gVoice.appendChild(el("p", "p-section", "Premium voice"));
  const pv = el("div");
  const renderPV = () => {
    pv.innerHTML = "";
    if (!TTS.proxy()) {
      pv.appendChild(el("p", "stat-line", "Premium voice isn't configured on this deployment — see tts-worker/README.md in the repo to set it up (free)."));
    } else if (!TTS.unlocked()) {
      pv.appendChild(el("p", "stat-line", "A studio-quality Australian reading voice is unlocked with a sync account. It streams instantly and repeated phrases work offline."));
      const sb = el("button", "soft-btn", "☁️ Sign in to unlock");
      sb.onclick = () => { const c = document.getElementById("cloudChip"); if (c && c.click) c.click(); };
      pv.appendChild(sb);
    } else {
      const on = !!p.settings.premiumVoice;
      const tg = el("button", "tgl" + (on ? " on" : ""), `✨ Premium voice: ${on ? "On" : "Off"}`);
      tg.onclick = () => { p.settings.premiumVoice = !p.settings.premiumVoice; save(); renderPV(); if (p.settings.premiumVoice) say("G'day! I'm your new reading voice. Let's go adventuring!"); };
      pv.appendChild(tg);
      if (on) {
        const tryB = el("button", "soft-btn", "🔊 Hear a sample");
        tryB.onclick = () => say("Three tens and four ones make thirty four. Brilliant!");
        pv.appendChild(tryB);
      }
    }
  };
  renderPV();
  gVoice.appendChild(pv);
  const tgls = el("div", "tgl-row");
  const mk = (key, label) => {
    const b = el("button", "tgl" + (p.settings[key] ? " on" : ""), `${label}: ${p.settings[key] ? "On" : "Off"}`);
    b.onclick = () => { p.settings[key] = !p.settings[key]; b.className = "tgl" + (p.settings[key] ? " on" : ""); b.textContent = `${label}: ${p.settings[key] ? "On" : "Off"}`; save(); };
    return b;
  };
  const musicTgl = mk("music", "🎶 Music");
  const flipMusic = musicTgl.onclick;
  musicTgl.onclick = () => { flipMusic(); Music.sync(); paintMusicBtn(); };
  tgls.append(mk("speech", "🔊 Speech"), mk("sound", "🎵 Sounds"), musicTgl);
  gVoice.appendChild(tgls);

  /* ── ⚙️ Limits, account & data ── */
  const gAdv = group("⚙️ Limits, account & data", false);
  gAdv.appendChild(el("p", "p-section", "Daily play limit (gentle nudge, never a lock)"));
  const limRow = el("div", "tgl-row");
  [0, 15, 30, 45].forEach(v => {
    const lb = el("button", "tgl" + ((p.settings.dailyLimit || 0) === v ? " on" : ""), v === 0 ? "Off" : v + " min");
    lb.onclick = () => {
      p.settings.dailyLimit = v; save();
      Array.from(limRow.children).forEach(c => c.className = "tgl");
      lb.className = "tgl on";
    };
    limRow.appendChild(lb);
  });
  gAdv.appendChild(limRow);

  const testB = el("button", "soft-btn", inTest() ? "🧪 Exit test mode" : "🧪 Test mode — try every skill (throwaway)");
  testB.onclick = () => { back.remove(); inTest() ? exitTestMode() : enterTestMode(); };
  gAdv.appendChild(testB);
  const acct = el("button", "soft-btn", "☁️ Account & sync");
  acct.onclick = () => { const c = document.getElementById("cloudChip"); if (c && c.click) c.click(); else toast("☁️", "Sync not configured", "Cloud sync isn't set up on this build."); };
  gAdv.appendChild(acct);

  gAdv.appendChild(el("p", "p-section", "Diagnostics"));
  let errLog = [];
  try { errLog = JSON.parse(localStorage.getItem("bt_errlog") || "[]"); } catch { }
  if (!errLog.length) {                                  // adopt a pre-v12 single error if present
    try { const old = JSON.parse(localStorage.getItem("bt_lasterr") || "null"); if (old) errLog = [old]; } catch { }
  }
  const newest = errLog[0];
  gAdv.appendChild(el("p", "stat-line", `App v${APP_V} · ` + (newest
    ? `${errLog.length} recent error${errLog.length > 1 ? "s" : ""} — latest ${esc(newest.at)}: ${esc(newest.m)} (${esc(newest.f)}:${newest.l})`
    : "no recent errors 🎉")));
  if (errLog.length) {
    const report = errLog.map(e => `${e.at} v${e.v || "?"} ${e.f}:${e.l} ${e.m}`).join("\n");
    const copy = el("button", "soft-btn", "📋 Copy error report");
    copy.onclick = () => {
      try { navigator.clipboard.writeText(report).then(() => { copy.textContent = "Copied ✓"; }, () => { copy.textContent = report.slice(0, 64); }); }
      catch { copy.textContent = report.slice(0, 64); }
    };
    const ce = el("button", "soft-btn", "Clear error log");
    ce.onclick = () => { try { localStorage.removeItem("bt_errlog"); localStorage.removeItem("bt_lasterr"); } catch { } copy.remove(); ce.remove(); };
    gAdv.append(copy, ce);
  }

  const danger = el("button", "danger-btn", `Erase ${esc(P().name)}'s progress`);
  let armed = false;
  danger.onclick = () => {
    if (!armed) { armed = true; danger.textContent = `Tap again to erase ${P().name}'s EVERYTHING — cannot be undone`; return; }
    state.profiles[state.profile] = migrateProfile(FRESH_PROFILE());
    save(); back.remove(); renderMap(true);
  };
  gAdv.appendChild(danger);

  const close = el("button", "primary-btn", "Done");
  close.onclick = () => { back.remove(); renderMap(); };
  box.appendChild(close); back.appendChild(box);
  $("overlay").appendChild(back);
}
function openParentGate() {
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">👨‍👩‍👧</p><h2>Grown-ups only</h2>
    <p class="sheet-acc">What year were you born?</p>`;
  const disp = el("div", "pad-display", "");
  box.appendChild(disp);
  let entry = "";
  const grid = el("div", "keypad");
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].forEach(kk => {
    const b = el("button", "key" + (kk === "OK" ? " ok" : kk === "⌫" ? " back" : ""), kk);
    b.onclick = () => {
      if (kk === "⌫") entry = entry.slice(0, -1);
      else if (kk === "OK") {
        const y = parseInt(entry, 10);
        const nowY = parseInt(today().slice(0, 4), 10);
        if (entry.length === 4 && y >= 1900 && nowY - y >= 18) { back.remove(); openParents(); return; }
        /* no clue about the rule — just redirect gently */
        entry = "";
        disp.textContent = "";
        box.children.length && (disp.classList.add("shake"), setTimeout(() => disp.classList.remove("shake"), 400));
        sub.textContent = "Please pass the device to a grown-up 😊";
        return;
      }
      else if (entry.length < 4) entry += kk;
      disp.textContent = entry;
    };
    grid.appendChild(b);
  });
  box.appendChild(grid);
  const sub = el("p", "sheet-acc", "");
  box.appendChild(sub);
  const cancel = el("button", "soft-btn", "Back to the map");
  cancel.onclick = () => back.remove();
  box.appendChild(cancel);
  back.appendChild(box);
  $("overlay").appendChild(back);
}
(function wireParentsGate() {
  const b = $("parentsBtn"); if (!b) return;
  b.onclick = openParentGate;
})();

/* ---------------- help ---------------- */
function openHelp() {
  const back = el("div", "modal-back"), box = el("div", "modal help-modal");
  box.innerHTML = `<h2>How Brainy Trails works 🧭</h2><ul class="help-list">
    <li>🗺 Tap a glowing skill on the map — a new one teaches you first, then you practise.</li>
    <li>⭐ Get 5 or more right to become <b>Familiar</b> and earn stars.</li>
    <li>⚡ Then take the Level Up to become <b>Proficient</b>.</li>
    <li>📘 Want a reminder? Open any skill and tap <b>Learn it again</b>.</li>
    <li>🤝 Stuck twice? A friendly helper shows you step by step.</li>
    <li>🔊 Every question is read aloud — tap the speaker to hear it again.</li>
    <li>⌨️ On a keyboard: press <b>1–4</b> to pick an answer, or type a number and <b>Enter</b>.</li>
    <li>🔥 Light the Daily Campfire every day to grow your streak.</li>
    <li>🎒 Tap your level ring (top corner) to open your Backpack of crowns and badges.</li>
    <li>👨‍👩‍👧 Grown-ups: tap the 👨‍👩‍👧 button in the top corner and answer the grown-up question.</li></ul>`;
  const ok = el("button", "primary-btn", "Got it!"); ok.onclick = () => back.remove();
  box.appendChild(ok); back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}
$("helpBtn").onclick = openHelp;
$("musicBtn") && ($("musicBtn").onclick = () => Music.toggle());
$("promptCard").onclick = () => { if (Sess && Sess.q) say(Sess.q.say); };

/* ---------------- cloud (basic wiring; per-skill best-wins merge) ---------------- */
if (window.Cloud && Cloud.init) {
  Cloud.init("brainytrails", {
    collect: () => {
      const out = { ...state, profiles: { ...state.profiles } };
      delete out.profiles[TESTP];                 // sandbox never syncs
      if (out.profile === TESTP) out.profile = "default";
      return out;
    },
    apply: async (remote) => { mergeRemote(remote); Store.save(state); renderMap(); },
  });
}

/* ---------------- boot ---------------- */
try {
  renderMap(true);
  if (childIds().length > 1) openWho();
} catch (e) {
  try {
    $("mapRoot").innerHTML = `<div class="island" style="text-align:center; padding:26px;">
      <p style="font-size:40px;">🛠</p>
      <p style="font-weight:900; margin-top:6px;">The trail is updating!</p>
      <p class="sheet-acc">Please close and reopen the app, or pull down to refresh.</p></div>`;
  } catch { }
  console.error("Brainy Trails boot:", e);
}

/* small debug surface (used by the headless test harness) */
window.BTApp = { state: () => state, sess: () => Sess, startSet, startReview, startBoss, startDaily, submit, renderMap, openHelp, openBackpack, openParents, openSkill, learnSkill, pic, exitPlay, dueSkills, checkBadges, BADGES, enterTestMode, exitTestMode, APP_V, speechMs, deleteChild, pickWebVoice, voice: () => ({ cached: TTS.mem.size, enabled: TTS.enabled(), unlocked: TTS.unlocked(), lastErr: TTS.lastErr }),
  mergeRemote, addChild, switchProfile, openWho, openParentGate, startLightning, finishLightning, childIds };

if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { }));
