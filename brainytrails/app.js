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
  year: null,                 // school-year curriculum (null → Explorer map until chosen)
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
  if (p.year === undefined) p.year = null;
  if (p.settings.sound === undefined) p.settings.sound = true;
  if (p.settings.music === undefined) p.settings.music = true;
  // legacy premium-voice settings are retired; the app uses device voices only
  delete p.settings.kokoroVoice;
  delete p.settings.premiumVoice;
  if (p.settings.voiceURI === undefined) p.settings.voiceURI = null;
  if (p.settings.volume === undefined) p.settings.volume = 80;
  if (p.treasuresSeen === undefined) p.treasuresSeen = Math.floor(Object.values(p.skills || {}).filter(x => x.m >= 2).length / 5);
  for (const [id, b] of Object.entries(p.bosses)) if (b === true) p.bosses[id] = { won: true, best: 0 };
  return p;
}
Object.values(state.profiles).forEach(migrateProfile);
const P = () => state.profiles[state.profile];
/* settings of the active child, tolerant of a momentarily-missing profile
   (mid profile-switch, after a delete, or leaving test mode) so audio and
   render callbacks can never throw on `P().settings` */
const settingsOf = () => (P() && P().settings) || {};
/* master volume (0–1) scales every sound: effects, music and speech */
const masterVol = () => { const v = settingsOf().volume; return v == null ? 0.8 : Math.max(0, Math.min(1, v / 100)); };

/* point the live curriculum (BT.ISLANDS / BT.SKILLS / BT.YOUNG) at the active
   child's chosen school year. Unauthored years fall back to the Explorer map. */
function applyYear() { try { if (window.BT && BT.use) BT.use(P() ? P().year : null); } catch { } }
const yearLabelOf = (yid) => { const y = (window.BT && BT.YEARS || []).find(x => x.id === yid); return y ? y.label : "All levels (Explorer)"; };
applyYear();
const sk = (id) => {
  const st = P().skills[id] || (P().skills[id] = { m: 0, attempts: 0, correct: 0, stars: 0, perfects: 0, nextReview: null, reviewStep: 0 });
  if (st.reviewStep === undefined) st.reviewStep = 0;
  if (st.perfects === undefined) st.perfects = 0;
  return st;
};
const bosses = () => P().bosses || (P().bosses = {});
const SK0 = Object.freeze({ m: 0, attempts: 0, correct: 0, stars: 0, perfects: 0, nextReview: null, reviewStep: 0 });
const APP_V = "32";
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
let prevProfile = null;   // the child to return to when leaving test mode
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

/* an island is "complete" when every skill on it is Proficient (m≥2) */
const islandComplete = (isl) => isl.units.flatMap(u => u.skills).every(id => skv(id).m >= 2);
/* islands unlock in order: an island opens only once every island before it is complete */
function islandOpen(islandId) {
  if (inTest()) return true;
  const arr = (window.BT && BT.ISLANDS) || [];
  const idx = arr.findIndex(i => i.id === islandId);
  if (idx <= 0) return true;
  for (let k = 0; k < idx; k++) if (!islandComplete(arr[k])) return false;
  return true;
}
/* the first not-yet-complete island before this one (the thing blocking it) */
const islandBlocker = (islandId) => {
  const arr = (window.BT && BT.ISLANDS) || [];
  const idx = arr.findIndex(i => i.id === islandId);
  for (let k = 0; k < idx; k++) if (!islandComplete(arr[k])) return arr[k];
  return null;
};

/* unlock rule: the skill's island must be open AND every prerequisite at least Familiar */
const unlocked = (id) => inTest() || (islandOpen(BT.SKILLS[id].island) && BT.SKILLS[id].prereqs.every(p => (P().skills[p] || {}).m >= 1));

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
    if (!settingsOf().sound) return null;
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
      g.gain.setValueAtTime(vol * masterVol(), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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

/* ---------------- treasures: a reward every few skills (powers the kid's
   chests on the map AND the parent's "next reward" card) ---------------- */
const TREASURE_STEP = 5;                       // one treasure per 5 skills made Proficient
const TREASURES = [
  { e: "🥚", n: "Dragon Egg" }, { e: "🗝️", n: "Golden Key" }, { e: "💎", n: "Crystal Gem" },
  { e: "🪄", n: "Magic Wand" }, { e: "🧭", n: "Explorer's Compass" }, { e: "🏺", n: "Ancient Relic" },
  { e: "🐉", n: "Baby Dragon" }, { e: "👑", n: "Jewelled Crown" }, { e: "🛡️", n: "Hero's Shield" },
  { e: "⚔️", n: "Legendary Sword" }, { e: "🏆", n: "Champion's Trophy" }, { e: "🌟", n: "Star of Brilliance" },
];
const treasureFor = (i) => TREASURES[((i % TREASURES.length) + TREASURES.length) % TREASURES.length];
function treasureState(p) {
  const prof = countM(p, 2);
  const earnedCount = Math.floor(prof / TREASURE_STEP);
  const nextThreshold = (earnedCount + 1) * TREASURE_STEP;
  return {
    proficient: prof, earnedCount, nextThreshold, toNext: nextThreshold - prof,
    inStep: prof % TREASURE_STEP,              // 0..STEP-1 progress toward the next chest
    next: treasureFor(earnedCount),
    earned: Array.from({ length: earnedCount }, (_, i) => ({ idx: i, threshold: (i + 1) * TREASURE_STEP, ...treasureFor(i) })),
  };
}
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
/* Web Speech only — voices come from the child's device. They can pick any
   installed voice (different accents, male/female); we remember the choice and
   otherwise auto-pick the best-sounding English voice available. */
const allVoices = () => { try { return speechSynthesis.getVoices() || []; } catch { return []; } };
function voiceScore(v) {
  let sc = 0; const n = (v.name || "").toLowerCase(), l = (v.lang || "").toLowerCase();
  if (l.startsWith("en-au")) sc += 40; else if (l.startsWith("en-gb")) sc += 30; else if (l.startsWith("en")) sc += 15;
  if (/karen|catherine|matilda|olivia|lee/.test(n)) sc += 8;
  if (/premium|enhanced|natural|neural/.test(n)) sc += 20;
  if (/google/.test(n)) sc += 8;
  if (v.localService) sc += 3;
  return sc;
}
/* English voices to offer in the picker, best-sounding first */
function englishVoices() {
  const all = allVoices();
  const en = all.filter(v => /^en/i.test(v.lang || ""));
  return (en.length ? en : all).slice().sort((a, b) => voiceScore(b) - voiceScore(a));
}
const voiceId = (v) => v && (v.voiceURI || v.name) || "";
/* the voice to speak with: the child's chosen one if still installed, else best auto-pick */
function pickWebVoice() {
  const vs = allVoices(); if (!vs.length) return null;
  const chosen = P() && P().settings ? P().settings.voiceURI : null;
  if (chosen) { const hit = vs.find(v => voiceId(v) === chosen); if (hit) return hit; }
  return englishVoices()[0] || vs[0] || null;
}
/* remember a chosen voice (id ""/null → Auto) and re-pick on next utterance */
function setVoice(id) { if (P() && P().settings) { P().settings.voiceURI = id || null; _wv = null; save(); } }
let _wv = null;
try { if ("speechSynthesis" in window && speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", () => { _wv = pickWebVoice(); }); } catch { }
function webSay(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    if (!_wv) _wv = pickWebVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (_wv) { u.voice = _wv; u.lang = _wv.lang; }
    u.rate = 0.95; u.pitch = 1.05; u.volume = masterVol();
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { }
}

/* (Premium cloud voice removed — the app now uses only the device's built-in
   Web Speech voices, chosen by the parent in the Voice & sound settings.) */

/* Sprout & Bridge are for 4–7 year olds: typing multi-digit answers is a motor
   tax, so any keypad question on those islands becomes four tappable choices. */
const YOUNG_ISLANDS = new Set(["sprout", "bridge"]);
const isYoung = (island) => ((window.BT && BT.YOUNG) || YOUNG_ISLANDS).has(island);
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
  if (!settingsOf().speech) return;
  webSay(text);
}
/* Turn an on-screen prompt into something that reads well aloud: maths symbols
   become words, fractions become spoken fractions, "❓"/"= ?" become "what".
   Emoji are kept — voices read them by name (🍎 → "apple"), which is the content
   we want spoken. This guarantees the WHOLE question is read, not a short label. */
const FRAC_WORD = { 2: "half", 3: "third", 4: "quarter", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth" };
function speechify(s) {
  let t = " " + String(s == null ? "" : s) + " ";
  t = t.replace(/(\d+)\s*\/\s*(\d+)/g, (m, a, b) => {       // 3/4 → "3 quarters", 1/2 → "1 half"
    const w = FRAC_WORD[+b]; if (!w) return `${a} over ${b}`;
    const plural = +a === 1 ? w : (b === "2" ? "halves" : w + "s");
    return `${a} ${plural}`;
  });
  t = t.replace(/=\s*\?/g, " equals what ")
    .replace(/❓/g, " what ")
    .replace(/×/g, " times ").replace(/÷/g, " divided by ")
    .replace(/[−–]/g, " minus ")
    .replace(/(^|[\s(,])-(?=\d)/g, "$1 negative ")          // "(-3, 2)" → "negative 3, 2"
    .replace(/\+/g, " plus ").replace(/=/g, " equals ")
    .replace(/%/g, " percent ")
    .replace(/°C/g, " degrees Celsius ").replace(/°/g, " degrees ")
    .replace(/\//g, " over ");                              // any leftover slash
  return t.replace(/\s+([,.?!…])/g, "$1").replace(/\s+/g, " ").trim();
}
/* full spoken form of a question: read the entire prompt, cleaned for speech,
   falling back to the author's `say` only if a prompt somehow isn't present */
const spokenQ = (q) => (q && q.prompt ? speechify(q.prompt) : (q && q.say) || "");
/* read several lines in order (used by the Learn screen to read every step) */
function sayLines(lines) {
  const list = (lines || []).map(t => String(t).trim()).filter(Boolean);
  if (!list.length || !settingsOf().speech) return;
  if (!("speechSynthesis" in window)) return;
  try {
    if (!_wv) _wv = pickWebVoice();
    speechSynthesis.cancel();
    list.forEach(t => {
      const u = new SpeechSynthesisUtterance(t);
      if (_wv) { u.voice = _wv; u.lang = _wv.lang; }
      u.rate = 0.95; u.pitch = 1.05; u.volume = masterVol();
      speechSynthesis.speak(u);   // queued, not cancelled between lines
    });
  } catch { }
}
addEventListener("pointerdown", function prime() {
  if (!speechPrimed && "speechSynthesis" in window) { try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { } speechPrimed = true; }
  Music.start();   // browsers only let audio start inside a user gesture
  removeEventListener("pointerdown", prime);
});

/* ---------------- map theme music (same loop as How Many?) ---------------- */
const Music = (() => {
  let el = null;
  const wanted = () => settingsOf().music !== false;            // default on
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
    try { e.volume = 0.3 * masterVol(); } catch { }
    if (wanted() && onMap() && visible()) { const p = e.play && e.play(); if (p && p.catch) p.catch(() => { }); }
    else { try { e.pause(); } catch { } }
  }
  return {
    start() { sync(); },
    sync,
    on: () => wanted(),
    toggle() { const pf = P(); if (pf) pf.settings.music = !wanted(); save(); sync(); paintMusicBtn(); },
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
  if (!settingsOf().sound) return;
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

  /* current player, beside the ring */
  const who = $("whoChip"), wa = $("whoAva"), wn = $("whoName");
  if (who && wa && wn) {
    const inT = inTest();
    const nm = inT ? "Tester" : P().name;
    const multi = childIds().length > 1;
    const named = nm && nm !== "Explorer";
    if (inT || multi || named) {
      wa.textContent = inT ? "🧪" : P().avatar;
      wn.textContent = nm;
      who.hidden = false;
      const tappable = multi && !inT;
      who.onclick = tappable ? openWho : null;
      who.style.cursor = tappable ? "pointer" : "default";
      const label = tappable ? `Playing as ${nm} — tap to switch player` : `Playing as ${nm}`;
      who.setAttribute("aria-label", label);
      who.title = label;
    } else {
      who.hidden = true;
    }
  }
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

/* ---------------- per-island themes (art direction from the asset library) ---------------- */
const ISLAND_THEMES = [
  { key: "plaza",  bg: "assets/island-1.jpg", accent: "#7c4dff", glow: "rgba(124,77,255,.55)", tag: "Build strong number foundations!", mentor: { e: "🐉", n: "Cinder the Dragon", line: "Great work! Strong number foundations carry you everywhere." } },
  { key: "springs",bg: "assets/island-2.jpg", accent: "#2f8fe0", glow: "rgba(47,143,224,.55)", tag: "Add, subtract and solve with strategy!", mentor: { e: "🦫", n: "Flo the Platypus", line: "Strategy is choosing the smartest path — you've got this!" } },
  { key: "grove",  bg: "assets/island-3.jpg", accent: "#3fae5a", glow: "rgba(63,174,90,.55)", tag: "Multiply, divide and explore patterns!", mentor: { e: "🦔", n: "Chrono the Echidna", line: "Patterns are everywhere — look closely and think smart!" } },
  { key: "shore",  bg: "assets/island-4.jpg", accent: "#1f8fd6", glow: "rgba(31,143,214,.55)", tag: "Explore shapes and solve with precision!", mentor: { e: "🐦", n: "Mario the Heron", line: "Observation is the key — look carefully and shapes make sense." } },
  { key: "lagoon", bg: "assets/island-5.jpg", accent: "#8b5cf6", glow: "rgba(139,92,246,.55)", tag: "Think logically and solve clever puzzles!", mentor: { e: "🦅", n: "Mario the Heron", line: "Logic helps you solve big problems — keep using your brainpower!" } },
  { key: "summit", bg: "assets/island-6.jpg", accent: "#a855f7", glow: "rgba(168,85,247,.55)", tag: "Master every skill and become a problem solver!", mentor: { e: "🐲", n: "Drako the Dragon", line: "Mastery is never giving up and always thinking your best." } },
];
const themeFor = (idx) => ISLAND_THEMES[((idx % ISLAND_THEMES.length) + ISLAND_THEMES.length) % ISLAND_THEMES.length];
const islandIndexOf = (id) => BT.ISLANDS.findIndex(isl => isl.units.some(u => u.skills.includes(id)));
const progWord = (done, total) => !done ? "Just getting started" : done >= total ? "Perfect!" : done / total >= 0.66 ? "Brilliant work!" : done / total >= 0.33 ? "On the right track!" : "Keep it up!";

/* a soft ambient loop per island (drops in assets/ambient-N.mp3 when present; silent otherwise) */
const IslandFx = (() => {
  let amb = null, curSrc = null;
  function play(idx) {
    const src = idx == null ? null : `assets/ambient-${idx + 1}.mp3`;
    if (src === curSrc) return;
    curSrc = src;
    try { if (amb) { amb.pause(); amb = null; } } catch { }
    if (!src || typeof Audio === "undefined") return;
    try { amb = new Audio(src); amb.loop = true; amb.volume = 0.22 * masterVol(); const p = amb.play && amb.play(); if (p && p.catch) p.catch(() => { }); } catch { }
  }
  return { play, stop: () => play(null) };
})();

let curIsland = null;   // index of the open island, or null on the World Map

function renderMap(scrollToHere) {
  applyYear();
  paintHeader();
  paintDaily();
  paintTestChip();
  renderWorld();
  if (curIsland != null && BT.ISLANDS[curIsland]) renderIsland(curIsland);

  /* review + continue + lightning live on the World Map */
  const due = dueSkills();
  const banner = $("reviewBanner");
  if (banner) {
    if (due.length) {
      banner.hidden = false;
      banner.innerHTML = due.length > 8
        ? `🛡 Defend <b>8</b> of your islands! (${due.length} waiting — one bite at a time)`
        : `🛡 Defend your islands! <b>${due.length}</b> skill${due.length > 1 ? "s" : ""} need${due.length > 1 ? "" : "s"} you`;
      banner.onclick = () => startReview();
    } else banner.hidden = true;
  }
  const frontier = frontierSkill();
  const cont = $("continueBtn");
  if (cont) {
    if (frontier) {
      cont.hidden = false;
      cont.innerHTML = `<span class="cont-main">▶ Continue Adventure</span><span class="cont-sub">Next: ${esc(BT.SKILLS[frontier].name)}</span>`;
      cont.onclick = () => { const ix = islandIndexOf(frontier); if (ix >= 0) enterIsland(ix); openSkill(frontier); };
    } else cont.hidden = true;
  }
  const lb = $("lightningBtn");
  if (lb) {
    if (lightningPool().length >= 5) {
      lb.hidden = false;
      const best = P().lightningBest || 0;
      lb.innerHTML = `${best ? `<span class="best">${best}</span>` : ""}<span class="bolt">⚡</span>`;
      lb.setAttribute("aria-label", best ? `Lightning Round — best ${best}` : "Lightning Round");
      lb.onclick = () => strikeLightning(() => startLightning());
    } else lb.hidden = true;
  }
  maybeSyncNudge();
  paintMusicBtn();
  Music.sync();
}

/* ---------------- World Map: the six islands only ---------------- */
function renderWorld() {
  const root = $("mapRoot");
  if (!root) return;
  root.innerHTML = "";

  /* treasure trail keeps its place at the top of the world */
  const tre = treasureState(P());
  const tbar = el("button", "treasure-banner");
  const tpct = Math.round(100 * tre.inStep / TREASURE_STEP);
  tbar.innerHTML = `<span class="tb-ico">${tre.next.e}</span>
    <span class="tb-mid"><b>Next treasure: ${esc(tre.next.n)}</b>
      <span class="tb-bar"><span style="width:${tpct}%"></span></span>
      <small>${tre.toNext} more skill${tre.toNext > 1 ? "s" : ""} to unlock it</small></span>
    <span class="tb-haul">${tre.earned.length ? tre.earned.slice(-3).map(t => t.e).join("") : "🗺️"}</span>`;
  tbar.onclick = () => openTreasures();
  root.appendChild(tbar);

  root.appendChild(el("p", "world-title", "🗺️ Choose your island"));
  const frontier = frontierSkill();
  BT.ISLANDS.forEach((isl, i) => {
    const th = themeFor(i);
    const skills = isl.units.flatMap(u => u.skills);
    const done = skills.filter(id => skv(id).m >= 2).length;
    const open = islandOpen(isl.id);
    const beaten = !!(bosses()[isl.id] && bosses()[isl.id].won);
    const hasFrontier = skills.includes(frontier);
    const blk = open ? null : islandBlocker(isl.id);
    const card = el("button", "world-isle" + (open ? "" : " locked-island") + (beaten ? " conquered" : "") + (hasFrontier ? " current" : ""));
    card.dataset.isl = isl.id;
    if (card.style) { card.style.setProperty && card.style.setProperty("--isle-accent", th.accent); card.style.setProperty && card.style.setProperty("--isle-glow", th.glow); }
    const pct = skills.length ? Math.round(100 * done / skills.length) : 0;
    card.innerHTML = `<span class="wi-bg" style="background-image:url('${th.bg}')"></span>
      <span class="wi-shade"></span>
      <span class="wi-row">
        <span class="wi-num">Island ${i + 1}</span>
        ${beaten ? '<span class="wi-flag">👑 Cleared</span>' : hasFrontier ? '<span class="wi-flag now">You are here</span>' : ""}
      </span>
      <span class="wi-name">${esc(isl.name)}</span>
      <span class="wi-tag">${esc(th.tag)}</span>
      <span class="wi-foot">${open
        ? `<span class="wi-prog"><span class="wi-bar"><span style="width:${pct}%"></span></span>${done}/${skills.length}</span><span class="wi-go">${hasFrontier ? "▶ Play" : beaten ? "Replay" : "Enter"}</span>`
        : `<span class="isl-lock">🔒 Finish ${esc(blk ? blk.name : "the island before")} to unlock</span>`}</span>`;
    card.onclick = () => open ? enterIsland(i)
      : toast("🔒", "Locked", `Reach Proficient on every skill in ${blk ? blk.name : "the previous island"} first.`);
    root.appendChild(card);
  });
}

/* ---------------- Island scene: one immersive themed island ---------------- */
function renderIsland(idx) {
  const isl = BT.ISLANDS[idx];
  const root = $("islandRoot");
  if (!isl || !root) return;
  const th = themeFor(idx);
  const scr = $("scrIsland");
  if (scr && scr.style && scr.style.setProperty) { scr.style.setProperty("--iz-accent", th.accent); scr.style.setProperty("--iz-glow", th.glow); }
  const bg = $("islandBg");
  if (bg && bg.style) bg.style.backgroundImage = `url('${th.bg}')`;
  root.innerHTML = "";

  const skills = isl.units.flatMap(u => u.skills);
  const done = skills.filter(id => skv(id).m >= 2).length;
  const frontier = frontierSkill();
  const islOpen = islandOpen(isl.id);

  const head = el("div", "iz-head");
  const backB = el("button", "iz-back", "‹ World Map");
  backB.onclick = exitIsland;
  head.appendChild(backB);
  head.appendChild(el("div", "iz-banner", `Island ${idx + 1}`));
  head.appendChild(el("h2", "iz-name", esc(isl.name)));
  head.appendChild(el("p", "iz-tag", esc(th.tag)));
  head.appendChild(el("div", "iz-prog", `<span class="izp-star">⭐</span> ${done}/${skills.length} <span class="izp-word">${progWord(done, skills.length)}</span>`));
  root.appendChild(head);

  const trail = el("div", "iz-trail");
  let n = 0, zig = 0;
  for (const u of isl.units) {
    for (const id of u.skills) {
      n++;
      const s = BT.SKILLS[id], st = skv(id), open = unlocked(id);
      const node = el("button", "iz-node " + (open ? M_CLASS[st.m] : "locked") + (id === frontier ? " frontier" : "") + (zig++ % 2 ? " r" : " l"));
      node.dataset.skill = id;
      node.setAttribute("aria-label", `${s.name}: ${open ? M_LABEL[st.m] : "locked"}`);
      const stars = st.stars || 0;
      node.innerHTML = `<span class="izn-stars">${"⭐".repeat(stars)}${"☆".repeat(Math.max(0, 3 - stars))}</span>
        <span class="izn-disc">${open ? n : "🔒"}${st.m >= 2 ? '<span class="izn-tick">✓</span>' : ""}</span>
        <span class="izn-name">${esc(s.name)}</span>
        ${id === frontier ? '<span class="izn-here">📍</span>' : ""}`;
      node.onclick = () => open ? openSkill(id)
        : !islOpen ? toast("🔒", "Island locked", "Finish the island before this one first.")
          : toast("🔒", "Not yet!", "Finish the skills before it first.");
      trail.appendChild(node);
    }
  }
  root.appendChild(trail);

  const bossReady = inTest() || skills.every(id => skv(id).m >= 2);
  const beaten = !!bosses()[isl.id];
  const guard = el("button", "iz-guardian" + (beaten ? " beaten" : bossReady ? " ready" : " waiting"));
  guard.innerHTML = `<span class="izg-face">${isl.boss.emoji}</span>
    <span class="izg-banner">${beaten ? "👑 Guardian defeated" : "Boss Challenge"}</span>
    <small>${beaten ? `Best ${bosses()[isl.id].best || "?"}/10 — tap to rematch.` : bossReady ? "Beat the boss to unlock the next island!" : "Reach Proficient on every skill to summon the Guardian."}</small>
    ${beaten || bossReady ? "" : '<span class="izg-lock">🔒</span>'}`;
  guard.onclick = () => beaten || bossReady ? bossIntro(isl, beaten)
    : toast("🔒", "Not yet!", `${isl.boss.name} waits until every skill is Proficient.`);
  root.appendChild(guard);

  const best = (bosses()[isl.id] && bosses()[isl.id].best) || 0;
  const mentor = el("div", "iz-mentor");
  mentor.innerHTML = `<div class="izm-face">${th.mentor.e}</div>
    <div class="izm-body"><b>${esc(th.mentor.n)}</b><p>${esc(th.mentor.line)}</p>${best ? `<small class="izm-best">Best: ${best}/10 — keep going!</small>` : ""}</div>
    <div class="izm-rewards"><span class="izr">👑<b>10</b></span><span class="izr">💎<b>50</b></span><span class="izr xp">XP<b>100</b></span></div>`;
  root.appendChild(mentor);

  const fHere = skills.includes(frontier) ? frontier : null;
  const cont = el("button", "iz-continue");
  cont.innerHTML = `<span class="izc-main">▶ Continue Adventure</span><span class="izc-sub">${fHere ? "Next: " + esc(BT.SKILLS[fHere].name) : beaten ? "Island complete! 🎉" : bossReady ? "Face the Guardian!" : "Keep going!"}</span>`;
  cont.onclick = () => fHere ? openSkill(fHere) : (bossReady && !beaten ? bossIntro(isl, false) : exitIsland());
  root.appendChild(cont);
}

function enterIsland(idx) {
  if (!BT.ISLANDS[idx]) return;
  curIsland = idx;
  renderIsland(idx);
  const scr = $("scrIsland");
  if (scr) { scr.hidden = false; if (scr.classList) { scr.classList.remove("zoom-in"); void (scr.offsetWidth); scr.classList.add("zoom-in"); } }
  if (document.body && document.body.classList) document.body.classList.add("in-island");
  const m = $("scrMap"); if (m) m.hidden = true;
  try { const ir = $("islandRoot"); if (ir) ir.scrollTop = 0; } catch { }
  IslandFx.play(idx);
}
function exitIsland() {
  curIsland = null;
  const scr = $("scrIsland"); if (scr) scr.hidden = true;
  if (document.body && document.body.classList) document.body.classList.remove("in-island");
  const m = $("scrMap"); if (m) m.hidden = false;
  IslandFx.stop();
  renderMap();
}
function leaveIsland() {   // silently drop island state (profile switch / test mode)
  curIsland = null;
  const scr = $("scrIsland"); if (scr) scr.hidden = true;
  if (document.body && document.body.classList) document.body.classList.remove("in-island");
  IslandFx.stop();
}
function maybeSyncNudge() {
  if (state.syncNudged || inTest()) return;
  // Auth is enforced up front now, so a "set up sync" nudge is redundant
  // once the player is signed in.
  if (window.Cloud && Cloud.isSignedIn && Cloud.isSignedIn()) return;
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
  const best = P().lightningBest || 0;
  box.innerHTML = `<p class="result-head">⚡</p><h2>${record ? "NEW BEST SCORE!" : "Time's up!"}</h2>
    <p class="sheet-acc">You answered <b>${correct}</b> in 60 seconds.</p>
    <p class="result-best">🏆 Best score: <b>${best}</b></p>
    <p class="result-xp">+${xpGain} XP ⭐</p>${ex.html}`;
  if ((record || ex.pop) && !matchMediaSafe()) confetti();
  const again = el("button", "gold-btn", "⚡ Go again!");
  again.onclick = () => { back.remove(); $("scrPlay").hidden = true; document.body.classList.remove("in-play"); startLightning(); };
  const map = el("button", "soft-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.append(again, map); back.appendChild(box);
  $("overlay").appendChild(back);
  say(record ? `New best score! ${correct}! Your best is now ${best}.` : `Time's up! You scored ${correct}. Your best is ${best}.`);
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
  const readAll = () => sayLines([s.name, ...steps].map(speechify));
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
    const pf = st.perfects || 0;
    box.appendChild(el("p", "sheet-acc", pf >= 1
      ? "✨ One more perfect practice (everything right) levels this up to Proficient!"
      : "✨ Ace two perfect practices to level up — or take the Level Up below."));
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
  const lim = settingsOf().dailyLimit || 0;
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
  { const si = $("scrIsland"); if (si) si.hidden = true; }
  document.body.classList.add("in-play");
  Music.sync();
  $("playTitle").textContent = cfg.title;
  $("reviewBanner").hidden = true;
  $("continueBtn").hidden = true;
  Sess.outcomes = [];
  nextQ();
}

/* younger islands pass Level Up at 4/5; older ones keep 5/5 (with the
   one-slip redemption question that follows, that's an effective 5/6) */
const levelupNeed = (id) => isYoung(BT.SKILLS[id].island) ? 4 : 5;
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
  $("scrPlay").hidden = true;
  document.body.classList.remove("in-play");
  if (curIsland != null && BT.ISLANDS[curIsland]) {            // back into the island you were exploring
    const si = $("scrIsland"); if (si) si.hidden = false;
    if (document.body && document.body.classList) document.body.classList.add("in-island");
  } else {
    $("scrMap").hidden = false;
  }
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
  if (Sess.q.format === "keypad" && !Sess.q.decimal && isYoung(BT.SKILLS[Sess.curSkill].island)) Sess.q = youngify(Sess.q);
  Sess.lock = false; Sess.orderPicked = [];
  Sess.qTries = 0; Sess.resetEntry = null;
  applyPlayTheme(curIsland != null ? curIsland : islandIndexOf(Sess.curSkill));
  if (Sess.kind === "review" || Sess.kind === "boss") $("playTitle").textContent =
    (Sess.kind === "review" ? "🛡 " : "") + BT.SKILLS[Sess.curSkill].name;
  paintPips();
  renderQuestion(Sess.q);
  say(spokenQ(Sess.q));
}

function applyPlayTheme(idx) {
  const scr = $("scrPlay"); if (!scr) return;
  const th = (idx != null && idx >= 0 && BT.ISLANDS[idx]) ? themeFor(idx) : null;
  if (th) {
    if (scr.style && scr.style.setProperty) { scr.style.setProperty("--pl-accent", th.accent); scr.style.setProperty("--pl-glow", th.glow); }
    if (scr.classList) scr.classList.add("themed");
    const bg = $("playBg"); if (bg && bg.style) bg.style.backgroundImage = `url('${th.bg}')`;
    const mf = $("playMentorFace"); if (mf) mf.textContent = th.mentor.e;
    const mn = $("playMentorName"); if (mn) mn.textContent = th.mentor.n;
  } else {
    if (scr.classList) scr.classList.remove("themed");
    const bg = $("playBg"); if (bg && bg.style) bg.style.backgroundImage = "";
  }
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
    const placed = [];   // chip buttons in pick order, parallel to Sess.orderPicked
    const undoAt = (k) => {
      if (Sess.lock || k < 0 || k >= Sess.orderPicked.length) return;
      const chip = placed.splice(k, 1)[0];
      Sess.orderPicked.splice(k, 1);
      if (chip) { chip.disabled = false; if (chip.classList) chip.classList.remove("used"); }
      paintSlots();
    };
    const paintSlots = () => {
      slots.innerHTML = "";
      for (let k = 0; k < q.items.length; k++) {
        const filled = Sess.orderPicked[k] !== undefined;
        if (filled && !Sess.lock) {            // tap a placed tile to send it back
          const s = el("button", "slot filled", String(Sess.orderPicked[k]));
          s.title = "Tap to undo";
          s.setAttribute("aria-label", `Remove ${Sess.orderPicked[k]} — tap to undo`);
          s.onclick = () => undoAt(k);
          slots.appendChild(s);
        } else {
          slots.appendChild(el("span", "slot" + (filled ? " filled" : ""), filled ? String(Sess.orderPicked[k]) : ""));
        }
      }
    };
    paintSlots();
    const chipBtns = [];
    q.items.forEach(v => {
      const b = el("button", "chip", String(v));
      b.onclick = () => {
        if (Sess.lock || b.disabled) return;
        b.disabled = true; b.classList.add("used");
        Sess.orderPicked.push(v); placed.push(b); paintSlots();
        if (Sess.orderPicked.length === q.items.length) {
          submit(JSON.stringify(Sess.orderPicked) === JSON.stringify(q.correct), q.correct.join(" → "), slots);
        }
      };
      chips.appendChild(b); chipBtns.push({ b, v });
    });
    Sess.resetEntry = () => {
      Sess.orderPicked = []; placed.length = 0;
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
  if (ok && !FAST && Sess.kind !== "lightning" && settingsOf().speech) delay = Math.max(delay, speechMs(spokenPraise) + 250);
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
  let headline, sub, levelled = false, becameProficient = false;
  /* Two perfect runs fast-track a skill straight to Proficient (complete),
     skipping the separate Level Up step. */
  const perfect = correct === total;
  if (perfect && (kind === "practice" || kind === "levelup") && st.m < 2) {
    st.perfects = (st.perfects || 0) + 1;
  }
  const fastProf = (st.perfects || 0) >= 2 && st.m < 2;
  if (kind === "practice") {
    const stars = Math.max(0, correct - (total - 3));     // 5/7→1★ 6/7→2★ 7/7→3★
    if (stars > st.stars) st.stars = stars;
    if (correct >= 5 && st.m < 1) { st.m = 1; levelled = true; }
    if (fastProf) {
      st.m = 2; st.nextReview = isoPlusDays(REVIEW_DAYS[0]); levelled = true; becameProficient = true;
      headline = "⚡ PROFICIENT! ⚡";
      sub = `Two perfect runs — this skill is complete! It comes back for review in ${REVIEW_DAYS[0]} days to be mastered.`;
    } else {
      headline = stars ? "⭐".repeat(stars) : "Good try!";
      sub = `${correct} of ${total} right` + (levelled ? " — you're now FAMILIAR with this skill!" : "")
        + (st.m === 1 && (st.perfects || 0) === 1 ? " One more perfect run levels you up!" : "");
    }
  } else {
    const pass = need || 5;
    if (correct >= pass || fastProf) {
      if (st.m < 2) { st.m = 2; levelled = true; becameProficient = true; }
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
  /* did this set cross a treasure milestone? */
  let treasureWon = null;
  const earnedNow = Math.floor(countM(P(), 2) / TREASURE_STEP);
  if (earnedNow > (P().treasuresSeen || 0)) { treasureWon = treasureFor(earnedNow - 1); P().treasuresSeen = earnedNow; save(); }
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="result-head">${headline}</p><p class="sheet-acc">${esc(sub)}</p>
    <p class="result-xp">+${xpGain} XP ⭐</p>${ex.html}` +
    (treasureWon ? `<p class="result-treasure">🎁 Treasure unlocked! <span class="rt-ico">${treasureWon.e}</span> <b>${esc(treasureWon.n)}</b></p>` : "");
  if ((levelled || ex.pop || treasureWon) && !matchMediaSafe()) confetti();
  if (treasureWon) SFX.fanfare();
  const map = el("button", "primary-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.appendChild(map);
  if (!becameProficient) {                 // once Proficient, the skill moves to spaced review — no more free practice
    const again = el("button", "soft-btn", "Practice again");
    again.onclick = () => { back.remove(); $("scrPlay").hidden = true; startSet(id, "practice"); };
    box.appendChild(again);
  }
  back.appendChild(box);
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
  if (state.profile !== TESTP) prevProfile = state.profile;
  state.profile = TESTP;
  save(); paintTestChip(); renderMap(true);
  toast("🧪", "Test mode", "Every skill and boss is open. Nothing here counts or syncs — tap the amber chip to go back.");
}
function exitTestMode() {
  if (Sess) { Sess = null; $("scrPlay").hidden = true; $("scrMap").hidden = false; document.body.classList.remove("in-play"); }
  delete state.profiles[TESTP];
  // return to the child we came from; fall back to any real profile that exists
  let back = (prevProfile && prevProfile !== TESTP && state.profiles[prevProfile]) ? prevProfile
    : (state.profiles.default ? "default" : childIds()[0]);
  if (!back || !state.profiles[back]) { state.profiles.default = migrateProfile(FRESH_PROFILE()); back = "default"; }
  state.profile = back; prevProfile = null;
  leaveIsland(); save(); paintTestChip(); renderMap(true);
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
  leaveIsland();
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
  const id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

/* ---------------- school-year picker (onboarding + Parents' Corner) ---------------- */
function openYearPicker(forId, onDone) {
  const pid = forId || state.profile;
  const prof = state.profiles[pid];
  if (!prof) { if (onDone) onDone(null); return; }
  const back = el("div", "modal-back"), box = el("div", "modal year-modal");
  const who = prof.name && prof.name !== "Explorer" ? esc(prof.name) + "'s" : "your";
  box.innerHTML = `<p class="sheet-icon">📚</p><h2>Pick ${who} school year</h2>
    <p class="sheet-acc">This sets the maths trail. You can change it any time in Parents' Corner.</p>`;
  const list = el("div", "year-list");
  (BT.YEARS || []).forEach(y => {
    const ready = !BT.curriculumFor(y.id).draft;
    const b = el("button", "year-card" + (y.id === prof.year ? " on" : ""),
      `<span class="year-emoji">${y.emoji}</span><span class="year-name">${esc(y.label)}</span>` +
      `<span class="year-tag ${ready ? "rdy" : "soon"}">${ready ? "Ready to play" : "Coming soon"}</span>`);
    b.onclick = () => {
      prof.year = y.id; save();
      back.remove();
      if (state.profile === pid) { applyYear(); renderMap(true); }
      if (onDone) onDone(y.id);
    };
    list.appendChild(b);
  });
  box.appendChild(list);
  const skip = el("button", "soft-btn", "Maybe later");
  skip.onclick = () => { back.remove(); if (onDone) onDone(null); };
  box.appendChild(skip);
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}
function openTreasures() {
  const p = P(), ts = treasureState(p);
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">\u{1F381}</p><h2>Treasure Trail</h2>
    <p class="sheet-acc">Earn a treasure for every ${TREASURE_STEP} skills you make Proficient. You've found <b>${ts.earnedCount}</b> so far!</p>`;
  const grid = el("div", "treasure-grid");
  const show = ts.earnedCount + 4;            // everything earned, plus a few to chase
  for (let i = 0; i < show; i++) {
    const t = treasureFor(i), got = i < ts.earnedCount, isNext = i === ts.earnedCount;
    const cell = el("div", "treasure-cell" + (got ? " got" : isNext ? " next" : " locked"));
    cell.innerHTML = `<span class="tc-ico">${got || isNext ? t.e : "\u{1F512}"}</span>
      <span class="tc-name">${got || isNext ? esc(t.n) : "Mystery"}</span>
      <span class="tc-sub">${got ? "Unlocked" : isNext ? `${ts.toNext} to go` : `${(i + 1) * TREASURE_STEP} skills`}</span>`;
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  const cl = el("button", "primary-btn", "Keep exploring \u{1F5FA}\uFE0F");
  cl.onclick = () => back.remove();
  box.appendChild(cl); back.appendChild(box); $("overlay").appendChild(back);
}
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
const fmtClock = (secs) => { const m = Math.round(secs / 60), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
function weekSecs(p) {
  let s = 0;
  for (let k = 0; k < 7; k++) { const d = new Date(); d.setDate(d.getDate() - k); s += p.timeByDay[localISO(d)] || 0; }
  return s;
}
/* — per-child progress helpers (work for any child, on their own curriculum) — */
const ISLE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#7c4dff", "#14b8a6", "#eab308"];
const RANKS = [
  { e: "🌱", t: "New Explorer" }, { e: "🍃", t: "Forest Explorer" }, { e: "🌉", t: "Bridge Builder" },
  { e: "⛰️", t: "Mountain Climber" }, { e: "🏔", t: "Mountain Master" }, { e: "🌋", t: "Volcano Hero" },
  { e: "💎", t: "Crystal Sage" }, { e: "🏆", t: "Grand Champion" },
];
const curOf = (p) => BT.curriculumFor(p.year);
const allSkillIds = (cur) => cur.ISLANDS.flatMap(i => i.units.flatMap(u => u.skills));
const islSkillIds = (isl) => isl.units.flatMap(u => u.skills);
const profCount = (p, ids) => ids.filter(id => (p.skills[id] || {}).m >= 2).length;
function childIslandOpen(p, cur, islandId) {
  const idx = cur.ISLANDS.findIndex(i => i.id === islandId);
  if (idx <= 0) return true;
  for (let k = 0; k < idx; k++) if (!islSkillIds(cur.ISLANDS[k]).every(id => (p.skills[id] || {}).m >= 2)) return false;
  return true;
}
function childFrontier(p, cur) {
  const ids = allSkillIds(cur);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i], s = cur.SKILLS[id], st = p.skills[id] || { m: 0 };
    const open = childIslandOpen(p, cur, s.island) && s.prereqs.every(pr => (p.skills[pr] || {}).m >= 1);
    if (open && (st.m || 0) < 2) return { id, idx: i + 1, name: s.name };
  }
  return null;
}
function rankOf(p, cur) {
  const ids = allSkillIds(cur), frac = ids.length ? profCount(p, ids) / ids.length : 0;
  return RANKS[Math.min(RANKS.length - 1, Math.floor(frac * RANKS.length))];
}
function accuracyPct(p) {
  let c = 0, a = 0;
  for (const st of Object.values(p.skills)) if (st.attempts) { c += st.correct; a += st.attempts; }
  return a ? Math.round(100 * c / a) : 0;
}
function weakSkills(p, cur, n = 5, minAtt = 3) {
  return Object.entries(p.skills).filter(([id, st]) => cur.SKILLS[id] && st.attempts >= minAtt)
    .map(([id, st]) => ({ id, acc: st.correct / st.attempts, st }))
    .sort((a, b) => a.acc - b.acc).slice(0, n);
}
const islandOfSkill = (cur, id) => cur.ISLANDS.find(i => islSkillIds(i).includes(id));
const shortTopic = (cur, id) => { const isl = islandOfSkill(cur, id); return isl ? isl.name : cur.SKILLS[id].name; };

function openParents() {
  const FACES = ["🦊", "🐸", "🦄", "🐯", "🐼", "🦖", "🐙", "🦉", "🚀", "🌟"];
  const back = el("div", "modal-back"), box = el("div", "modal parents");

  /* header */
  const head = el("div", "pc-head");
  const backB = el("button", "pc-back", "‹");
  backB.setAttribute("aria-label", "Back to the map");
  backB.onclick = () => { back.remove(); renderMap(); };
  const sub = el("p", "pc-sub", "");
  const titleCol = el("div", "pc-title");
  titleCol.append(el("div", "pc-badge", "👨‍👩‍👧"), (() => { const d = el("div"); d.append(el("h2", null, "Parents' Corner"), sub); return d; })());
  head.append(backB, titleCol);
  box.appendChild(head);

  /* tab bar */
  const SUBS = {
    progress: "See how your children are learning and growing.",
    children: "Manage your children and their learning adventures.",
    settings: "Adjust settings that help your kids learn and play.",
  };
  const tabBar = el("div", "pc-tabs");
  const panels = {};
  const setTab = (id) => {
    sub.textContent = SUBS[id];
    for (const k of Object.keys(panels)) panels[k].hidden = k !== id;
    Array.from(tabBar.children).forEach(t => { const on = t.dataset.tab === id; t.className = "pc-tab" + (on ? " on" : ""); });
  };
  [["progress", "📈 Progress"], ["children", "👨‍👩‍👧 Children"], ["settings", "⚙️ Settings"]].forEach(([id, label]) => {
    const t = el("button", "pc-tab", label); t.dataset.tab = id; t.onclick = () => setTab(id); tabBar.appendChild(t);
  });
  box.appendChild(tabBar);

  /* shared little modal helper */
  const sheet = (build) => {
    const b2 = el("div", "modal-back"), x2 = el("div", "modal");
    build(x2, () => b2.remove());
    const cl = el("button", "soft-btn", "Close"); cl.onclick = () => b2.remove();
    x2.appendChild(cl); b2.appendChild(x2); $("overlay").appendChild(b2);
  };
  const sampleSkill = (cur, id, st) => sheet((x2) => {
    const q = cur.SKILLS[id].gen(0.5);
    x2.innerHTML = `<p class="sheet-icon">${cur.SKILLS[id].icon}</p><h2>${esc(cur.SKILLS[id].name)}</h2>
      <p class="sheet-state ${st ? "m" + st.m : ""}">${st ? M_LABEL[st.m] : "Not started"}</p>
      ${st && st.attempts ? `<p class="sheet-acc">${st.correct}/${st.attempts} right (${Math.round(100 * st.correct / st.attempts)}%)</p>` : ""}
      <p class="p-section">Sample question</p>
      <p class="sheet-acc" style="font-weight:800; color:var(--ink);">${esc(q.prompt)}</p>
      ${q.pic ? `<div class="q-pic">${pic(q.pic)}</div>` : ""}
      ${q.visual ? `<p class="sheet-acc">${esc(q.visual).replace(/\n/g, "<br>")}</p>` : ""}
      <p class="sheet-acc">Answer: <b>${esc(correctLabel(q))}</b></p>`;
  });

  /* tile builder for the stat strips */
  const jcell = (icon, big, lbl, reward) => {
    const c = el("div", "pj-cell" + (reward ? " pj-reward" : ""));
    c.append(el("div", "pj-ico", icon), el("div", "pj-big", String(big)), el("div", "pj-lbl", esc(lbl)));
    return c;
  };
  const tile = (icon, label, val, o = {}) => {
    const t = el("div", "pc-stat" + (o.needs ? " tile-needs" : ""));
    t.append(el("div", "stat-ico", icon), el("div", "stat-lbl", esc(label)), el("div", "stat-val" + (o.needs ? " needs" : ""), esc(val)));
    if (typeof o.pct === "number") {
      const bar = el("div", "stat-bar"), fill = el("div", "stat-fill" + (o.green ? " green" : ""));
      fill.style.width = Math.max(0, Math.min(100, o.pct)) + "%"; bar.appendChild(fill); t.appendChild(bar);
      if (o.showPct) t.appendChild(el("div", "stat-foot", o.pct + "%"));
    }
    if (o.sub) t.appendChild(el("div", "stat-foot" + (o.green ? " good" : ""), esc(o.sub)));
    if (o.see) { const s = el("button", "tile-see", "See details"); s.onclick = o.see; t.appendChild(s); }
    return t;
  };

  /* ============ PROGRESS ============ */
  const pProg = el("div", "pc-panel"); panels.progress = pProg;
  let viewId = inTest() ? childIds()[0] : (childIds().includes(state.profile) ? state.profile : childIds()[0]);
  const renderProg = () => {
    pProg.innerHTML = "";
    const cp = state.profiles[viewId], cur = curOf(cp);

    const sel = el("div", "pc-sel");
    childIds().forEach(id => {
      const c = state.profiles[id];
      const b = el("button", "pc-pill" + (id === viewId ? " on" : ""),
        `<span class="pill-ava">${esc(c.avatar)}</span><span class="pill-txt"><b>${esc(c.name)}</b><small>${esc(yearLabelOf(c.year))}</small></span>`);
      b.onclick = () => { viewId = id; renderProg(); };
      sel.appendChild(b);
    });
    const rep = el("button", "view-report", "📄 View report");
    rep.onclick = () => openReport(cp, cur);
    sel.appendChild(rep);
    pProg.appendChild(sel);

    const ids = allSkillIds(cur), total = ids.length || 1, prof = profCount(cp, ids);
    const acc = accuracyPct(cp), wk = weekSecs(cp), weak = weakSkills(cp, cur), needs = weak[0];
    const stats = el("div", "pc-stats");
    stats.append(
      tile("🕐", "Time This Week", fmtClock(wk), { sub: `Daily average: ${fmtMins(Math.round(wk / 7))}` }),
      tile("✅", "Quests Completed", `${prof} / ${total}`, { pct: Math.round(100 * prof / total), showPct: true }),
      tile("⭐", "Overall Mastery", acc ? `${acc}%` : "—", { pct: acc, green: true, sub: acc >= 80 ? "Great job!" : acc >= 50 ? "Coming along!" : acc ? "Keep going!" : "Just getting started" }),
      tile("❤️", "Needs Practice", needs ? shortTopic(cur, needs.id) : "—", { needs: true, see: needs ? (() => setTab("progress")) : null }),
    );
    pProg.appendChild(stats);

    const ts = treasureState(cp);
    const streak = (cp.streak && cp.streak.count) || 0;
    const dailyDone = !!(cp.streak && cp.streak.last === today());
    pProg.appendChild(secHead("🗺", "The adventure", null));
    const journey = el("div", "pc-journey");
    journey.append(
      jcell("🔥", streak, streak === 1 ? "day streak" : "day streak"),
      jcell(dailyDone ? "✅" : "🕒", dailyDone ? "Done" : "Open", "today's challenge"),
      jcell(ts.next.e, ts.toNext, `to ${ts.next.n}`, true),
    );
    pProg.appendChild(journey);

    const unlockedN = cur.ISLANDS.filter(isl => childIslandOpen(cp, cur, isl.id)).length;
    pProg.appendChild(secHead("🏝", "Island Progress", `${unlockedN} of ${cur.ISLANDS.length} islands unlocked`));
    const isleList = el("div", "isle-list");
    cur.ISLANDS.forEach((isl, ii) => {
      const sk = islSkillIds(isl), tot = sk.length, pr = profCount(cp, sk), color = ISLE_COLORS[ii % ISLE_COLORS.length];
      const open = childIslandOpen(cp, cur, isl.id);
      const row = el("button", "isle-row" + (open ? "" : " isle-locked"));
      const segs = sk.map((id, si) => `<span class="seg"${si < pr ? ` style="background:${color}"` : ""}></span>`).join("");
      const subt = isl.units.map(u => u.name).join(" · ");
      row.innerHTML = `<div class="isle-ico">${isl.emoji}</div>
        <div class="isle-main"><b>${esc(isl.name)}</b><small>${esc(subt)}</small></div>
        <div class="isle-segs">${segs}</div>
        <div class="isle-num">${pr} / ${tot}</div>
        <div class="isle-pct" style="color:${color}">${Math.round(100 * pr / tot)}%</div>
        <div class="isle-go">${open ? "›" : "🔒"}</div>`;
      row.onclick = () => openIsland(cp, cur, isl);
      isleList.appendChild(row);
    });
    pProg.appendChild(isleList);

    pProg.appendChild(secHead("❤️", "Needs a hand", null, weak.length > 1 ? { label: "View all", on: () => openWeakAll(cp, cur, weak) } : null));
    if (needs) {
      const card = el("div", "nah-card");
      const pctv = Math.round(needs.acc * 100);
      card.innerHTML = `<div class="nah-ico">${cur.SKILLS[needs.id].icon}</div>
        <div class="nah-body">
          <div class="nah-h"><b>${esc(cur.SKILLS[needs.id].name)}</b><span class="nah-tag">Needs practice</span></div>
          <div class="nah-acc">Accuracy: <b>${pctv}%</b><span class="acc-bar"><span class="acc-fill" style="width:${pctv}%"></span></span></div>
          <p class="nah-desc">${esc(cp.name)} is still building confidence with ${esc(cur.SKILLS[needs.id].name.toLowerCase())}. A short practice set together will help it click.</p>
        </div>`;
      const act = el("div", "nah-act");
      const startB = el("button", "nah-start", "▶ Start practice");
      startB.onclick = () => { back.remove(); if (viewId !== state.profile) switchProfile(viewId); startSet(needs.id, "practice"); };
      const tipsB = el("button", "nah-tips", "📖 View parent tips");
      tipsB.onclick = () => openTips(cp, cur, needs.id);
      act.append(startB, tipsB); card.appendChild(act);
      pProg.appendChild(card);
    } else {
      pProg.appendChild(el("p", "stat-line", "Not enough answers yet — after a few sessions we'll highlight where a little help goes a long way."));
    }
    pProg.appendChild(el("p", "pc-foot", "🔒 Your children's data is private and secure."));
  };

  const secHead = (icon, title, right, link) => {
    const h = el("div", "sec-head");
    h.innerHTML = `<span class="sec-ico">${icon}</span><b>${esc(title)}</b>`;
    if (right) h.appendChild(el("span", "sec-right", esc(right)));
    if (link) { const a = el("button", "sec-link", esc(link.label) + " ›"); a.onclick = link.on; h.appendChild(a); }
    return h;
  };
  const openReport = (cp, cur) => sheet((x2) => {
    x2.innerHTML = `<h2>📄 ${esc(cp.name)}'s report</h2><p class="sheet-acc">Every skill on the trail. Tap one to preview a question.</p>`;
    for (const isl of cur.ISLANDS) {
      const blk = el("div", "matrix-isl", `<small>${isl.emoji} ${esc(isl.name)}</small>`);
      const grid = el("div", "matrix");
      for (const id of islSkillIds(isl)) {
        const st = cp.skills[id], m = st ? st.m : null, cls = !st ? "locked" : m >= 1 ? "m" + m : "";
        const sq = el("button", "sq " + cls);
        sq.title = `${cur.SKILLS[id].name} — ${st ? M_LABEL[st.m] : "Not started"}`;
        sq.onclick = () => sampleSkill(cur, id, st);
        grid.appendChild(sq);
      }
      blk.appendChild(grid); x2.appendChild(blk);
    }
    x2.appendChild(el("p", "legend", "▢ not started · ▣ Familiar · ■ violet Proficient · ■ gold Mastered"));
  });
  const openIsland = (cp, cur, isl) => sheet((x2) => {
    const sk = islSkillIds(isl), pr = profCount(cp, sk);
    x2.innerHTML = `<p class="sheet-icon">${isl.emoji}</p><h2>${esc(isl.name)}</h2>
      <p class="sheet-acc">${pr} of ${sk.length} skills proficient${childIslandOpen(cp, cur, isl.id) ? "" : " · 🔒 locked until the island before is complete"}</p>`;
    for (const id of sk) {
      const st = cp.skills[id];
      const r = el("button", "rep-row", `<span class="rep-ico">${cur.SKILLS[id].icon}</span><span class="rep-name">${esc(cur.SKILLS[id].name)}</span><span class="rep-state ${st ? "m" + st.m : ""}">${st ? M_LABEL[st.m] : "—"}</span>`);
      r.onclick = () => sampleSkill(cur, id, st);
      x2.appendChild(r);
    }
  });
  const openTips = (cp, cur, id) => sheet((x2) => {
    const nm = cur.SKILLS[id].name;
    x2.innerHTML = `<p class="sheet-icon">${cur.SKILLS[id].icon}</p><h2>Tips: ${esc(nm)}</h2>
      <p class="sheet-acc" style="text-align:left">Little and often beats long sessions. Try these together:</p>
      <ul class="tips-list">
        <li>Talk through one example out loud before they try — model your thinking.</li>
        <li>Use everyday objects (blocks, coins, food) to make “${esc(nm.toLowerCase())}” concrete.</li>
        <li>Celebrate effort and good strategies, not just right answers.</li>
        <li>Keep it to 5–10 minutes, then stop on a win.</li>
      </ul>`;
    const go = el("button", "primary-btn", "▶ Practise this together");
    go.onclick = () => { x2.parentElement.remove(); back.remove(); if (viewId !== state.profile) switchProfile(viewId); startSet(id, "practice"); };
    x2.appendChild(go);
  });
  const openWeakAll = (cp, cur, weak) => sheet((x2) => {
    x2.innerHTML = `<h2>❤️ Needs a hand</h2><p class="sheet-acc">Lowest accuracy right now. Tap to practise together.</p>`;
    weak.forEach(w => {
      const r = el("button", "rep-row", `<span class="rep-ico">${cur.SKILLS[w.id].icon}</span><span class="rep-name">${esc(cur.SKILLS[w.id].name)}</span><span class="rep-state">${Math.round(w.acc * 100)}%</span>`);
      r.onclick = () => { x2.parentElement.remove(); back.remove(); if (viewId !== state.profile) switchProfile(viewId); startSet(w.id, "practice"); };
      x2.appendChild(r);
    });
  });
  renderProg();

  /* ============ CHILDREN ============ */
  const pKids = el("div", "pc-panel"); panels.children = pKids;
  const renderKids = () => {
    pKids.innerHTML = "";
    for (const id of childIds()) {
      const cp = state.profiles[id], cur = curOf(cp), fr = childFrontier(cp, cur), rank = rankOf(cp, cur);
      const ids = allSkillIds(cur), total = ids.length || 1, prof = profCount(cp, ids);
      const acc = accuracyPct(cp), wk = weekSecs(cp), weak = weakSkills(cp, cur, 1)[0];
      const card = el("div", "kid-card");

      const headR = el("div", "kid-head");
      const idCol = el("div", "kid-id");
      idCol.appendChild(el("b", "kid-name", esc(cp.name)));
      const yb = el("button", "kid-year", `📚 ${esc(yearLabelOf(cp.year))} <span class="yb-caret">▾</span>`);
      yb.onclick = () => openYearPicker(id, () => renderKids());
      idCol.appendChild(yb);
      const right = el("div", "kid-right");
      if (id === state.profile && !inTest()) right.appendChild(el("span", "kid-now", "● Playing now"));
      else { const cont = el("button", "kid-cont", "▶ Continue"); cont.onclick = () => { switchProfile(id); back.remove(); renderMap(); }; right.appendChild(cont); }
      const keb = el("button", "kid-keb", "⋮");
      const actbar = el("div", "kid-actbar"); actbar.hidden = true;
      keb.onclick = () => { actbar.hidden = !actbar.hidden; };
      right.appendChild(keb);
      headR.append(el("div", "kid-ava", esc(cp.avatar)), idCol, right);
      card.append(headR, actbar);

      // kebab actions: rename · change face · delete
      const nameI = el("input"); nameI.type = "text"; nameI.value = cp.name; nameI.maxLength = 16; nameI.className = "kid-rename";
      nameI.oninput = () => { cp.name = nameI.value.trim() || "Explorer"; save(); };
      const faceB = el("button", "kid-face", `${esc(cp.avatar)} change`);
      faceB.onclick = () => { cp.avatar = FACES[(FACES.indexOf(cp.avatar) + 1) % FACES.length]; faceB.innerHTML = `${cp.avatar} change`; save(); renderKids(); };
      actbar.append(nameI, faceB);
      if (childIds().length > 1) {
        const del = el("button", "kid-del", "🗑 Delete child"); let armed = false;
        del.onclick = () => { if (!armed) { armed = true; del.textContent = "Tap again — permanent"; return; } deleteChild(id); renderKids(); renderProg(); };
        actbar.appendChild(del);
      }

      card.appendChild(el("div", "kid-rank", `${rank.e} ${esc(rank.t)}`));
      card.appendChild(el("div", "kid-quest", fr ? `Current Quest: ${fr.idx} – ${esc(fr.name)}` : "All quests complete! 🎉"));
      const kts = treasureState(cp);
      const kstreak = (cp.streak && cp.streak.count) || 0;
      card.appendChild(el("div", "kid-journey",
        `🔥 ${kstreak} day streak · ${kts.next.e} ${esc(kts.next.n)} ${kts.toNext} away`));

      const stats = el("div", "pc-stats kid-stats");
      stats.append(
        tile("✅", "Quests Completed", `${prof} / ${total}`, { pct: Math.round(100 * prof / total), showPct: true }),
        tile("⭐", "Mastery", acc ? `${acc}%` : "—", { pct: acc, green: true }),
        tile("🕐", "Time This Week", fmtClock(wk), { sub: `Daily average: ${fmtMins(Math.round(wk / 7))}` }),
        tile("❤️", "Needs Practice", weak ? shortTopic(cur, weak.id) : "—", { needs: true, see: weak ? (() => { setTab("progress"); viewId = id; renderProg(); }) : null }),
      );
      card.appendChild(stats);
      pKids.appendChild(card);
    }
    if (childIds().length < 4) {
      const add = el("button", "add-kid", `<div class="add-ico">＋</div><div class="add-txt"><b>Add a child</b><small>Create a new profile and start their adventure.</small></div><span class="add-go">›</span>`);
      add.onclick = () => { const nid = addChild("Explorer", FACES[childIds().length % FACES.length]); renderKids(); renderProg(); if (nid) openYearPicker(nid, () => { renderKids(); renderProg(); }); };
      pKids.appendChild(add);
    }
    pKids.appendChild(el("p", "pc-foot", "🔒 Each child's data is private and secure."));
  };
  renderKids();

  /* ============ SETTINGS ============ */
  const pSet = el("div", "pc-panel"); panels.settings = pSet;
  const p = P();
  const card = (icon, bg, title, desc, open, danger) => {
    const c = el("div", "pc-card" + (danger ? " danger" : ""));
    const h = el("button", "pc-card-head");
    h.innerHTML = `<div class="pc-ico" style="background:${bg}">${icon}</div><div class="pc-cardttl"><b>${esc(title)}</b><small>${esc(desc)}</small></div>`;
    const caret = el("span", "pc-caret", open ? "▾" : "▸"); h.appendChild(caret);
    const body = el("div", "pc-card-body"); body.hidden = !open;
    h.onclick = () => { body.hidden = !body.hidden; caret.textContent = body.hidden ? "▸" : "▾"; };
    c.append(h, body); pSet.appendChild(c); return body;
  };

  /* Voice & sound */
  const gVoice = card("🔊", "#efe9ff", "Voice & sound", "Customize audio, effects and music.", true);
  const volRow = el("div", "vol-row");
  volRow.appendChild(el("div", "sw-ico", "🔊"));
  const volMid = el("div", "vol-mid");
  volMid.appendChild(el("b", "vol-lbl", "Master volume"));
  const slider = el("input"); slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "5";
  slider.value = String(p.settings.volume == null ? 80 : p.settings.volume); slider.className = "vol-range";
  const volVal = el("span", "vol-val", (p.settings.volume == null ? 80 : p.settings.volume) + "%");
  slider.oninput = () => { p.settings.volume = +slider.value; volVal.textContent = slider.value + "%"; save(); Music.sync(); };
  volMid.appendChild(slider);
  volRow.append(volMid, volVal);
  gVoice.appendChild(volRow);

  const swRow = (icon, title, desc, key, after) => {
    const row = el("div", "sw-row");
    row.innerHTML = `<div class="sw-ico">${icon}</div><div class="sw-txt"><b>${esc(title)}</b><small>${esc(desc)}</small></div>`;
    const sw = el("button", "switch" + (p.settings[key] ? " on" : "")); sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(!!p.settings[key]));
    sw.onclick = () => { p.settings[key] = !p.settings[key]; sw.className = "switch" + (p.settings[key] ? " on" : ""); sw.setAttribute("aria-checked", String(!!p.settings[key])); save(); if (after) after(); };
    row.appendChild(sw); return row;
  };
  gVoice.append(
    swRow("💬", "Voice guidance", "Play helpful instructions and feedback aloud.", "speech"),
    swRow("🎮", "Sound effects", "Play game sounds and rewards.", "sound"),
    swRow("🎵", "Background music", "Play ambient music during quests.", "music", () => { Music.sync(); paintMusicBtn(); }),
  );

  const voiceName = () => { const id = p.settings.voiceURI; if (!id) return "Friendly Voice (Default)"; const v = englishVoices().find(x => voiceId(x) === id); return v ? `${v.name} (${v.lang})` : "Friendly Voice (Default)"; };
  const vrow = el("div", "sw-row voice-row");
  vrow.innerHTML = `<div class="sw-ico">🎙</div><div class="sw-txt"><b>Voice</b><small>Choose the voice for instructions.</small></div>`;
  const trig = el("button", "voice-trigger"); trig.innerHTML = `<span class="vt-name">${esc(voiceName())}</span> <span class="vt-caret">▾</span>`;
  const vlist = el("div", "voice-list"); vlist.hidden = true;
  const renderVoiceList = () => {
    vlist.innerHTML = "";
    const voices = englishVoices();
    if (!voices.length) { vlist.appendChild(el("p", "stat-line", "Your device is still loading its voices — reopen in a moment.")); return; }
    const cur = p.settings.voiceURI || "";
    const chip = (val, label, subl) => {
      const on = (val || "") === cur;
      const b = el("button", "voice-chip" + (on ? " on" : ""), `<b>${esc(label)}</b>${subl ? `<small>${esc(subl)}</small>` : ""}`);
      b.onclick = () => { setVoice(val); trig.innerHTML = `<span class="vt-name">${esc(voiceName())}</span> <span class="vt-caret">▾</span>`; renderVoiceList(); say("G'day! I'm your reading voice. Let's go adventuring!"); };
      return b;
    };
    vlist.appendChild(chip("", "Friendly Voice (Default)", "Best for this device"));
    voices.forEach(v => vlist.appendChild(chip(voiceId(v), v.name, v.lang)));
  };
  renderVoiceList();
  trig.onclick = () => { vlist.hidden = !vlist.hidden; };
  vrow.appendChild(trig);
  gVoice.append(vrow, vlist);

  /* Limits, account & data */
  const gLim = card("🛡", "#e7f7ee", "Limits, account & data", "Set limits, manage data and privacy.", false);
  gLim.appendChild(el("p", "p-section", "Daily play limit (gentle nudge, never a lock)"));
  const limRow = el("div", "tgl-row");
  [0, 15, 30, 45].forEach(v => {
    const lb = el("button", "tgl" + ((p.settings.dailyLimit || 0) === v ? " on" : ""), v === 0 ? "Off" : v + " min");
    lb.onclick = () => { p.settings.dailyLimit = v; save(); Array.from(limRow.children).forEach(c => c.className = "tgl"); lb.className = "tgl on"; };
    limRow.appendChild(lb);
  });
  gLim.appendChild(limRow);

  /* Test mode */
  const gTest = card("🧪", "#fff3e0", "Test mode (throwaway)", "Try every skill without affecting progress.", false);
  const testB = el("button", "soft-btn", inTest() ? "🧪 Exit test mode" : "🧪 Enter test mode");
  testB.onclick = () => { back.remove(); inTest() ? exitTestMode() : enterTestMode(); };
  gTest.appendChild(testB);

  /* Account & sync */
  const gAcc = card("☁️", "#e7f0ff", "Account & sync", "Manage your account and sync across devices.", false);
  const acct = el("button", "soft-btn", "☁️ Account & sync");
  acct.onclick = () => { const c = document.getElementById("cloudChip"); if (c && c.click) c.click(); else toast("☁️", "Sync not configured", "Cloud sync isn't set up on this build."); };
  gAcc.appendChild(acct);

  /* Diagnostics */
  const gDiag = card("🐛", "#efe9ff", "Diagnostics", "View app health, logs and error reports.", false);
  let errLog = [];
  try { errLog = JSON.parse(localStorage.getItem("bt_errlog") || "[]"); } catch { }
  if (!errLog.length) { try { const old = JSON.parse(localStorage.getItem("bt_lasterr") || "null"); if (old) errLog = [old]; } catch { } }
  const newest = errLog[0];
  gDiag.appendChild(el("p", "stat-line", `App v${APP_V} · ` + (newest
    ? `${errLog.length} recent error${errLog.length > 1 ? "s" : ""} — latest ${esc(newest.at)}: ${esc(newest.m)} (${esc(newest.f)}:${newest.l})`
    : "no recent errors 🎉")));
  if (errLog.length) {
    const report = errLog.map(e => `${e.at} v${e.v || "?"} ${e.f}:${e.l} ${e.m}`).join("\n");
    const copy = el("button", "soft-btn", "📋 Copy error report");
    copy.onclick = () => { try { navigator.clipboard.writeText(report).then(() => { copy.textContent = "Copied ✓"; }, () => { copy.textContent = report.slice(0, 64); }); } catch { copy.textContent = report.slice(0, 64); } };
    const ce = el("button", "soft-btn", "Clear error log");
    ce.onclick = () => { try { localStorage.removeItem("bt_errlog"); localStorage.removeItem("bt_lasterr"); } catch { } copy.remove(); ce.remove(); };
    gDiag.append(copy, ce);
  }

  /* Danger zone */
  const gDz = card("⚠️", "#fde8ec", "Danger zone", "Irreversible actions. Please be careful.", true, true);
  const dzRow = (icon, title, desc, run) => {
    const r = el("button", "dz-row");
    r.innerHTML = `<div class="dz-ico">${icon}</div><div class="dz-txt"><b>${esc(title)}</b><small>${esc(desc)}</small></div><span class="dz-go">›</span>`;
    let armed = false;
    r.onclick = () => { if (!armed) { armed = true; r.classList.add("armed"); r.children[1].children[0].textContent = "Tap again to confirm — cannot be undone"; return; } run(); };
    return r;
  };
  gDz.appendChild(dzRow("🗑", `Erase ${P().name}'s progress`, `Delete all of ${P().name}'s progress, quests and data.`, () => {
    state.profiles[state.profile] = migrateProfile(FRESH_PROFILE()); save(); back.remove(); renderMap(true);
  }));
  if (childIds().length > 1) gDz.appendChild(dzRow("👤", "Delete child", "Permanently remove this child's profile and data.", () => {
    deleteChild(state.profile); back.remove(); renderMap(true);
  }));
  gDz.appendChild(dzRow("🗄", "Clear local data", "Remove all downloaded content and cached data.", async () => {
    try { if (typeof caches !== "undefined") { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch { }
    try { if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } } catch { }
    try { location.reload(); } catch { }
  }));

  /* assemble */
  for (const k of ["progress", "children", "settings"]) box.appendChild(panels[k]);
  const done = el("button", "primary-btn pc-done", "Done");
  done.onclick = () => { back.remove(); renderMap(); };
  box.appendChild(done);
  setTab("progress");
  back.appendChild(box); $("overlay").appendChild(back);
}
function openParentGate() {
  const back = el("div", "modal-back"), box = el("div", "modal");
  box.innerHTML = `<p class="sheet-icon">👨‍👩‍👧</p><h2>Grown-ups only</h2>
    <p class="sheet-acc">What year were you born?</p>`;
  const disp = el("div", "pad-display", "");
  box.appendChild(disp);
  let entry = "";

  let onKey = null;
  const close = () => {
    if (onKey && document.removeEventListener) document.removeEventListener("keydown", onKey);
    back.remove();
  };
  const sub = el("p", "sheet-acc", "");

  /* shared by the on-screen keypad and a physical keyboard */
  const press = (kk) => {
    if (kk === "⌫") entry = entry.slice(0, -1);
    else if (kk === "OK") {
      const y = parseInt(entry, 10);
      const nowY = parseInt(today().slice(0, 4), 10);
      if (entry.length === 4 && y >= 1900 && nowY - y >= 18) { close(); openParents(); return; }
      /* no clue about the rule — just redirect gently */
      entry = "";
      disp.textContent = "";
      disp.classList.add("shake"); setTimeout(() => disp.classList.remove("shake"), 400);
      sub.textContent = "Please pass the device to a grown-up 😊";
      return;
    }
    else if (entry.length < 4 && /^[0-9]$/.test(kk)) entry += kk;
    disp.textContent = entry;
  };

  const grid = el("div", "keypad");
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].forEach(kk => {
    const b = el("button", "key" + (kk === "OK" ? " ok" : kk === "⌫" ? " back" : ""), kk);
    b.onclick = () => press(kk);
    grid.appendChild(b);
  });
  box.appendChild(grid);
  box.appendChild(sub);
  const cancel = el("button", "soft-btn", "Back to the map");
  cancel.onclick = close;
  box.appendChild(cancel);
  back.appendChild(box);

  /* physical keyboard: digits type, Backspace deletes, Enter submits, Esc closes */
  onKey = (e) => {
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === "Backspace") { press("⌫"); e.preventDefault(); }
    else if (e.key === "Enter") { press("OK"); e.preventDefault(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  if (document.addEventListener) document.addEventListener("keydown", onKey);

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
$("promptCard").onclick = () => { if (Sess && Sess.q) say(spokenQ(Sess.q)); };
$("playMentor") && ($("playMentor").onclick = () => { if (Sess && Sess.q) say(spokenQ(Sess.q)); });

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
  }, { requireAuth: true });
}

/* ---------------- boot ---------------- */
try {
  renderMap(true);
  if (childIds().length > 1) openWho();
  /* first run with no year chosen → ask which school year (real browser only) */
  else if (!inTest() && !window.__BT_FAST && P().year == null) openYearPicker(state.profile);
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
window.BTApp = { state: () => state, sess: () => Sess, startSet, startReview, startBoss, startDaily, submit, renderMap, enterIsland, exitIsland, renderIsland, openHelp, openBackpack, openParents, openTreasures, treasureState, openSkill, learnSkill, pic, exitPlay, dueSkills, checkBadges, BADGES, enterTestMode, exitTestMode, APP_V, speechMs, deleteChild, pickWebVoice, setVoice, listVoices: () => englishVoices().map(v => ({ name: v.name, lang: v.lang, id: voiceId(v) })), voice: () => ({ name: (pickWebVoice() || {}).name || null, count: englishVoices().length, chosen: (P().settings && P().settings.voiceURI) || null }),
  mergeRemote, addChild, switchProfile, openWho, openParentGate, startLightning, finishLightning, childIds, openYearPicker, applyYear };

if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { }));
