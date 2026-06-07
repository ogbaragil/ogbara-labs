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
const MS_OK = FAST ? 40 : 950, MS_BAD = FAST ? 60 : 2300;

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
  xp: 0,
  streak: { count: 0, last: null },
  settings: { speech: true },
});

let state = Store.load();
if (!state || state.v !== 1) state = { v: 1, profile: "default", profiles: { default: FRESH_PROFILE() } };
if (!state.profiles[state.profile]) state.profiles[state.profile] = FRESH_PROFILE();
const P = () => state.profiles[state.profile];
const sk = (id) => P().skills[id] || (P().skills[id] = { m: 0, attempts: 0, correct: 0, stars: 0, nextReview: null });

function save() { Store.save(state); if (window.Cloud) Cloud.schedulePush(); }

/* level curve: gentle early, slower later */
const levelOf = (xp) => 1 + Math.floor(Math.sqrt(xp / 120));

/* spaced-review intervals (days), used from Proficient onward */
const REVIEW_DAYS = [2, 7, 21, 60];
const isoPlusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* unlock rule: every prerequisite at least Familiar */
const unlocked = (id) => BT.SKILLS[id].prereqs.every(p => (P().skills[p] || {}).m >= 1);

/* ---------------- speech ---------------- */
let speechPrimed = false;
function say(text) {
  if (!P().settings.speech || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { }
}
addEventListener("pointerdown", function prime() {
  if (!speechPrimed && "speechSynthesis" in window) { try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { } speechPrimed = true; }
  removeEventListener("pointerdown", prime);
});

/* ---------------- header ---------------- */
function paintHeader() {
  const xp = P().xp;
  $("xpChip").innerHTML = `⭐ Level ${levelOf(xp)} <small>· ${xp} XP</small>`;
}

/* ---------------- map ---------------- */
const M_CLASS = ["m0", "m1", "m2", "m3"];
const M_LABEL = ["New", "Familiar", "Proficient", "Mastered"];

function frontierSkill() {
  for (const isl of BT.ISLANDS) for (const u of isl.units) for (const id of u.skills) {
    if (unlocked(id) && sk(id).m < 2) return id;
  }
  return null;
}

function renderMap() {
  paintHeader();
  const root = $("mapRoot");
  root.innerHTML = "";
  const frontier = frontierSkill();
  for (const isl of BT.ISLANDS) {
    const skillsHere = isl.units.flatMap(u => u.skills);
    const done = skillsHere.filter(id => sk(id).m >= 2).length;
    const card = el("section", "island");
    card.appendChild(el("h2", "isl-name", `${isl.emoji} ${esc(isl.name)} <span class="isl-progress">${done}/${skillsHere.length}</span>`));
    for (const u of isl.units) {
      card.appendChild(el("p", "unit-name", esc(u.name)));
      const row = el("div", "node-row");
      for (const id of u.skills) {
        const s = BT.SKILLS[id], st = sk(id);
        const open = unlocked(id);
        const node = el("button", "node " + (open ? M_CLASS[st.m] : "locked") + (id === frontier ? " frontier" : ""));
        node.dataset.skill = id;
        node.innerHTML = `<span class="node-face">${open ? s.icon : "🔒"}</span>
          <span class="node-name">${esc(s.name)}</span>
          <span class="node-stars">${st.stars ? "⭐".repeat(st.stars) : ""}</span>`;
        node.onclick = () => open ? openSkill(id) : toast("🔒", "Not yet!", "Finish the skills before it first.");
        row.appendChild(node);
      }
      card.appendChild(row);
    }
    root.appendChild(card);
  }
  const cont = $("continueBtn");
  if (frontier) { cont.hidden = false; cont.innerHTML = `▶ Continue: ${esc(BT.SKILLS[frontier].name)} ${BT.SKILLS[frontier].icon}`; cont.onclick = () => openSkill(frontier); }
  else { cont.hidden = true; }
}

/* ---------------- skill sheet ---------------- */
function openSkill(id) {
  const s = BT.SKILLS[id], st = sk(id);
  const back = el("div", "modal-back"), box = el("div", "modal sheet");
  const acc = st.attempts ? Math.round(100 * st.correct / st.attempts) : null;
  box.innerHTML = `<p class="sheet-icon">${s.icon}</p><h2>${esc(s.name)}</h2>
    <p class="sheet-state ${M_CLASS[st.m]}">${M_LABEL[st.m]}${st.stars ? " · " + "⭐".repeat(st.stars) : ""}</p>
    ${acc !== null ? `<p class="sheet-acc">${st.correct}/${st.attempts} right so far (${acc}%)</p>` : `<p class="sheet-acc">Ready for your first try!</p>`}`;
  const practice = el("button", "primary-btn", "Practice · 7 questions");
  practice.onclick = () => { back.remove(); startSet(id, "practice"); };
  box.appendChild(practice);
  if (st.m >= 1 && st.m < 2) {
    const lvl = el("button", "gold-btn", "⚡ Level Up · 5 perfect questions");
    lvl.onclick = () => { back.remove(); startSet(id, "levelup"); };
    box.appendChild(lvl);
  }
  const close = el("button", "soft-btn", "Back to map");
  close.onclick = () => back.remove();
  box.appendChild(close);
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}

/* ---------------- session ---------------- */
let Sess = null;

function startSet(id, kind) {
  const st = sk(id);
  Sess = {
    id, kind,
    total: kind === "levelup" ? 5 : 7,
    i: 0, correct: 0, misses: 0, xpGain: 0,
    d: kind === "levelup" ? 1 : Math.min(0.9, 0.35 + 0.15 * st.m),
    taught: false, q: null, lock: false, orderPicked: [],
  };
  $("scrMap").hidden = true; $("scrPlay").hidden = false;
  $("playTitle").textContent = BT.SKILLS[id].name;
  nextQ();
}

function exitPlay() {
  Sess = null;
  $("scrPlay").hidden = true; $("scrMap").hidden = false;
  renderMap(); save();
}
$("exitBtn") && ($("exitBtn").onclick = exitPlay);

function paintPips() {
  const pips = $("pips"); pips.innerHTML = "";
  for (let k = 0; k < Sess.total; k++) pips.appendChild(el("span", "pip" + (k < Sess.i ? " done" : k === Sess.i ? " now" : "")));
}

function nextQ() {
  if (!Sess) return;
  if (Sess.i >= Sess.total) return finishSet();
  Sess.q = BT.SKILLS[Sess.id].gen(Sess.d);
  Sess.lock = false; Sess.orderPicked = [];
  paintPips();
  renderQuestion(Sess.q);
  say(Sess.q.say);
}

function renderQuestion(q) {
  const card = $("promptCard");
  card.innerHTML = `<p class="q-prompt">${esc(q.prompt)}</p>` +
    (q.visual ? `<p class="q-visual">${esc(q.visual).replace(/\n/g, "<br>")}</p>` : "");
  const dock = $("answerArea");
  dock.innerHTML = "";
  if (q.format === "choice" || q.format === "tf") {
    const choices = q.format === "tf"
      ? [{ label: "✔ TRUE", correct: q.answer === true }, { label: "✘ FALSE", correct: q.answer === false }]
      : q.choices;
    const grid = el("div", q.format === "tf" ? "tf-grid" : "choice-grid");
    choices.forEach(c => {
      const b = el("button", "choice-btn" + (q.format === "tf" ? (c.label.includes("TRUE") ? " true" : " false") : ""), esc(c.label));
      b.onclick = () => submit(c.correct, correctLabel(q));
      grid.appendChild(b);
    });
    dock.appendChild(grid);
  } else if (q.format === "keypad") {
    const disp = el("div", "pad-display", "&nbsp;");
    const grid = el("div", "keypad");
    let entry = "";
    const paint = () => disp.textContent = entry || " ";
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].forEach(kk => {
      const b = el("button", "key" + (kk === "OK" ? " ok" : kk === "⌫" ? " back" : ""), kk);
      b.onclick = () => {
        if (Sess.lock) return;
        if (kk === "⌫") entry = entry.slice(0, -1);
        else if (kk === "OK") { if (entry !== "") submit(parseInt(entry, 10) === q.answer, String(q.answer)); return; }
        else if (entry.length < 3) entry += kk;
        paint();
      };
      grid.appendChild(b);
    });
    dock.append(disp, grid);
  } else if (q.format === "order") {
    const slots = el("div", "order-slots");
    const chips = el("div", "order-chips");
    const paintSlots = () => { slots.innerHTML = ""; for (let k = 0; k < q.items.length; k++) slots.appendChild(el("span", "slot" + (Sess.orderPicked[k] !== undefined ? " filled" : ""), Sess.orderPicked[k] !== undefined ? String(Sess.orderPicked[k]) : "")); };
    paintSlots();
    q.items.forEach(v => {
      const b = el("button", "chip", String(v));
      b.onclick = () => {
        if (Sess.lock || b.disabled) return;
        b.disabled = true; b.classList.add("used");
        Sess.orderPicked.push(v); paintSlots();
        if (Sess.orderPicked.length === q.items.length) {
          submit(JSON.stringify(Sess.orderPicked) === JSON.stringify(q.correct), q.correct.join(" → "));
        }
      };
      chips.appendChild(b);
    });
    dock.append(slots, chips);
  } else if (q.format === "tap") {
    const grid = el("div", q.numberline ? "line-grid" : "tap-grid");
    q.items.forEach(c => {
      const b = el("button", q.numberline ? "line-tick" : "tap-tile", esc(c.label));
      b.onclick = () => submit(c.correct, q.items.find(i => i.correct).label);
      grid.appendChild(b);
    });
    dock.appendChild(grid);
  }
}

function correctLabel(q) {
  if (q.format === "choice") return q.choices.find(c => c.correct).label;
  if (q.format === "tf") return q.answer ? "TRUE" : "FALSE";
  return "";
}

/* central answer path — every format funnels here */
function submit(ok, correctShown) {
  if (!Sess || Sess.lock) return;
  Sess.lock = true;
  const st = sk(Sess.id);
  st.attempts++;
  if (ok) {
    st.correct++; Sess.correct++;
    const gain = Math.round(6 + 8 * Sess.d);
    Sess.xpGain += gain; P().xp += gain;
    Sess.d = Math.min(1, Sess.d + 0.12);
    feedback(true, pick(["Brilliant!", "You got it!", "Super!", "Nice thinking!"]), "+" + gain + " XP");
  } else {
    Sess.misses++;
    Sess.d = Math.max(0.15, Sess.d - 0.18);
    feedback(false, "Not quite!", (correctShown ? `It was <b>${esc(correctShown)}</b>. ` : "") + esc(Sess.q.hint));
  }
  paintHeader(); save();
  const needTeach = !ok && Sess.misses >= 2 && !Sess.taught;
  setTimeout(() => {
    if (!Sess) return;
    Sess.i++;
    if (needTeach) { Sess.taught = true; Sess.d = Math.max(0.15, Sess.d * 0.6); teach(); }
    else nextQ();
  }, ok ? MS_OK : MS_BAD);
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function feedback(ok, title, sub) {
  const t = el("div", "fb " + (ok ? "good" : "soft"));
  t.innerHTML = `<p class="fb-big">${ok ? "✅" : "💛"}</p><p class="fb-title">${esc(title)}</p><p class="fb-sub">${sub}</p>`;
  $("scrPlay").appendChild(t);
  if (ok) say(title);
  setTimeout(() => t.remove(), ok ? MS_OK : MS_BAD);
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
function teach() {
  const q = Sess.q;
  const back = el("div", "modal-back"), box = el("div", "modal teach");
  box.innerHTML = `<p class="sheet-icon">🤝</p><h2>Let me show you!</h2>`;
  const list = el("div", "teach-steps");
  box.appendChild(list);
  const btn = el("button", "primary-btn", "Next step ▶");
  let i = 0;
  const reveal = () => {
    if (i < q.steps.length) {
      list.appendChild(el("p", "step", esc(q.steps[i])));
      say(q.steps[i]); i++;
      if (i === q.steps.length) btn.textContent = "Let's try again! 💪";
    } else { back.remove(); nextQ(); }
  };
  btn.onclick = reveal;
  box.appendChild(btn); back.appendChild(box);
  $("overlay").appendChild(back);
  reveal();
}

/* ---------------- set completion & mastery ---------------- */
function finishSet() {
  const { id, kind, correct, total, xpGain } = Sess;
  const st = sk(id);
  let headline, sub, levelled = false;
  if (kind === "practice") {
    const stars = Math.max(0, correct - (total - 3));     // 5/7→1★ 6/7→2★ 7/7→3★
    if (stars > st.stars) st.stars = stars;
    if (correct >= 5 && st.m < 1) { st.m = 1; levelled = true; }
    headline = stars ? "⭐".repeat(stars) : "Good try!";
    sub = `${correct} of ${total} right` + (levelled ? " — you're now FAMILIAR with this skill!" : "");
  } else {
    if (correct === total) {
      if (st.m < 2) { st.m = 2; levelled = true; }
      st.nextReview = isoPlusDays(REVIEW_DAYS[0]);
      headline = "⚡ PROFICIENT! ⚡";
      sub = `Perfect ${total}/${total}! This skill comes back for review in ${REVIEW_DAYS[0]} days — keep it strong to master it.`;
    } else {
      headline = "So close!";
      sub = `Level Up needs a perfect run — you got ${correct}/${total}. A little more practice and you'll smash it!`;
    }
  }
  Sess = null;
  save();
  const back = el("div", "modal-back"), box = el("div", "modal result");
  box.innerHTML = `<p class="result-head">${headline}</p><p class="sheet-acc">${esc(sub)}</p>
    <p class="result-xp">+${xpGain} XP ⭐</p>`;
  if (levelled && !matchMediaSafe()) confetti();
  const again = el("button", "soft-btn", "Practice again");
  again.onclick = () => { back.remove(); $("scrPlay").hidden = true; startSet(id, "practice"); };
  const map = el("button", "primary-btn", "Back to the map 🗺");
  map.onclick = () => { back.remove(); exitPlay(); };
  box.append(map, again); back.appendChild(box);
  $("overlay").appendChild(back);
  say(typeof headline === "string" && headline.includes("⭐") ? "Amazing work!" : headline.replace(/[^a-zA-Z !']/g, ""));
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

/* ---------------- help ---------------- */
function openHelp() {
  const back = el("div", "modal-back"), box = el("div", "modal help-modal");
  box.innerHTML = `<h2>How Brainy Trails works 🧭</h2><ul class="help-list">
    <li>🗺 Tap a glowing skill on the map to start a 7-question practice.</li>
    <li>⭐ Get 5 or more right to become <b>Familiar</b> and earn stars.</li>
    <li>⚡ Then take the Level Up — 5 perfect answers makes you <b>Proficient</b>.</li>
    <li>🤝 Stuck twice? A friendly helper shows you step by step.</li>
    <li>🔊 Every question is read aloud — tap it to hear it again.</li>
    <li>🧑‍🤝‍🧑 Grown-ups: a full progress dashboard is on its way.</li></ul>`;
  const ok = el("button", "primary-btn", "Got it!"); ok.onclick = () => back.remove();
  box.appendChild(ok); back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  $("overlay").appendChild(back);
}
$("helpBtn").onclick = openHelp;
$("promptCard").onclick = () => { if (Sess && Sess.q) say(Sess.q.say); };

/* ---------------- cloud (basic wiring; per-skill best-wins merge) ---------------- */
if (window.Cloud) {
  Cloud.init("brainytrails", {
    collect: () => state,
    apply: async (remote) => {
      if (!remote || remote.v !== 1) return;
      for (const [pid, rp] of Object.entries(remote.profiles || {})) {
        const lp = state.profiles[pid] || (state.profiles[pid] = FRESH_PROFILE());
        for (const [sid, rs] of Object.entries(rp.skills || {})) {
          const ls = lp.skills[sid];
          if (!ls || rs.m > ls.m || (rs.m === ls.m && rs.attempts > ls.attempts)) lp.skills[sid] = rs;
        }
        if ((rp.xp || 0) > lp.xp) lp.xp = rp.xp;
        if (rp.settings) lp.settings = { ...lp.settings, ...rp.settings };
      }
      Store.save(state);
      renderMap();
    },
  });
}

/* ---------------- boot ---------------- */
renderMap();

/* small debug surface (used by the headless test harness) */
window.BTApp = { state: () => state, sess: () => Sess, startSet, submit, renderMap, openHelp, exitPlay };

if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { }));
