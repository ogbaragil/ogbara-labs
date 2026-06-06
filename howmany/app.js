/* =========================================================================
   How Many? — Little Learners  (PWA clone of the Expo app, but better)
   Vanilla JS. No build step. No external assets — all sound is synthesised.
   ========================================================================= */
"use strict";

/* ---------------- Constants (mirrors the original) ---------------- */
const EMOJIS = [
  "🐶","🐱","🦊","🐰","🐻","🐼","🐵","🐸","🐨","🦁","🐯","🐮","🐷","🐔","🐤","🐙","🐠","🦋",
  "🐞","🦄","🐝","🐢","🐳","🦒","🦓","🦜","🌸","🌼","🍓","🍎","🍌","🍇","🍉","🥕","🌽","🚗",
  "✈️","🚀","⚽","🏀","🎈","⭐","🌈",
];
const ANSWER_RANGE = [1,2,3,4,5,6,7,8,9,10];

const WB_WORDS = {
  3: [["cat","🐱"],["dog","🐶"],["sun","☀️"],["bat","🦇"],["pen","✏️"],["cup","☕"],["hat","🎩"],["pig","🐷"],["map","🗺️"],["bus","🚌"],["log","🪵"],["net","🕸️"],["box","📦"],["jam","🍓"],["fox","🦊"]],
  4: [["ball","🏀"],["star","⭐"],["moon","🌙"],["fish","🐟"],["lion","🦁"],["duck","🦆"],["bird","🐦"],["cake","🎂"],["tree","🌳"],["doll","🪆"],["frog","🐸"],["ship","🚢"],["door","🚪"],["book","📖"],["rain","🌧️"]],
  5: [["apple","🍎"],["chair","🪑"],["house","🏠"],["bread","🍞"],["plant","🪴"],["horse","🐴"],["light","💡"],["smile","😊"],["train","🚆"],["tiger","🐯"],["sheep","🐑"],["cloud","☁️"],["water","💧"],["beach","🏖️"],["pizza","🍕"]],
  6: [["school","🏫"],["animal","🐾"],["circle","⭕"],["summer","☀️"],["forest","🌲"],["bottle","🍾"],["window","🪟"],["rocket","🚀"],["flower","🌸"],["mother","👩"],["banana","🍌"],["orange","🍊"],["ladder","🪜"],["castle","🏰"],["cookie","🍪"]],
};
const CAMPAIGN_SEQUENCE = [2,3,4,5,6,7,8];
const DIFFICULTY_RANGES = { Easy:[2,3], Medium:[4,5], Hard:[6,7], Insane:[8,8] };
const PRAISE = ["Correct!","Excellent!","Fantastic!","Brilliant!","Great job!","Nice!"];
const VIP_TITLES = ["Explorer 🌱","Helper 🐾","Hero 🦁","Ace 🚀","Champion 🏆","Legend 🌟"];
const STICKER_SET = ["🦄","🌈","🌟","🍓","🚀","🎈","🧸","🍭","🦕","🌼","🐳","🛝","🧩","🎨","🎵","🍪","⚽","🐣"];
const BADGES = ["Bronze","Silver","Gold","Legend","Mythic","Eternal"];
const MAX_STICKERS = 100;

/* ---------------- Persistent store (localStorage, fail-safe) ---------------- */
const Store = (() => {
  let mem = {};
  let ok = true;
  try { localStorage.setItem("__t","1"); localStorage.removeItem("__t"); }
  catch { ok = false; } // private mode / sandbox — fall back to memory
  const get = (k, d) => {
    if (!ok) return k in mem ? mem[k] : d;
    const v = localStorage.getItem(k);
    return v === null ? d : v;
  };
  const set = (k, v) => { if (ok) { try { localStorage.setItem(k, v); } catch {} } else mem[k] = v; };
  return {
    num: (k, d) => Number(get(k, d)),
    bool: (k, d) => { const v = get(k, null); return v === null ? d : v === "true"; },
    str: (k, d) => get(k, d),
    json: (k, d) => { try { return JSON.parse(get(k, "null")) ?? d; } catch { return d; } },
    set,
    setJSON: (k, v) => set(k, JSON.stringify(v)),
  };
})();

/* ---------------- Global state ---------------- */
const S = {
  screen: "home",
  stars: Store.num("stars", 0),
  correct: Store.num("correct", 0),
  vip: Store.num("vip", 0),
  stickerCount: Store.num("stickers.count", 0),
  stickerTier: Store.num("stickers.tier", 0),
  stickerTotal: Store.num("stickers.total", 0),
  soundOn: Store.bool("sound", true),
  musicOn: Store.bool("music", true),
  speechOn: Store.bool("speech", true),
  speechRate: Store.num("speech.rate", 1),
  wbMode: Store.str("wb.mode", "Guided"),
  wbStats: Store.json("wb.stats", { solved:0, currentStreak:0, bestStreak:0, totalMistakes:0, totalTimeMs:0, avgTimeMs:0, last:{word:"",timeMs:0,mistakes:0} }),
  mmMode: Store.str("mm.mode", "Campaign"),
  mmFreeDiff: Store.str("mm.freeDiff", "Medium"),
  mmCampaignIdx: Store.num("mm.campaignIdx", 0),
};
function persist() {
  Store.set("stars", S.stars); Store.set("correct", S.correct); Store.set("vip", S.vip);
  Store.set("stickers.count", S.stickerCount); Store.set("stickers.tier", S.stickerTier); Store.set("stickers.total", S.stickerTotal);
  Store.set("sound", S.soundOn); Store.set("music", S.musicOn); Store.set("speech", S.speechOn); Store.set("speech.rate", S.speechRate);
  Store.set("wb.mode", S.wbMode); Store.setJSON("wb.stats", S.wbStats);
  Store.set("mm.mode", S.mmMode); Store.set("mm.freeDiff", S.mmFreeDiff); Store.set("mm.campaignIdx", S.mmCampaignIdx);
}

/* ---------------- Helpers ---------------- */
const shuffle = (arr) => { const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const rand = (n) => Math.floor(Math.random()*n);
const pick = (arr) => arr[rand(arr.length)];
const el = (tag, cls, html) => { const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; };
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- Audio engine: synthesised SFX + music ---------------- */
const Sound = (() => {
  let ctx = null, musicNodes = null;
  const ensure = () => { if (!ctx) { try { ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch {} } if (ctx && ctx.state === "suspended") ctx.resume(); return ctx; };

  function tone(freq, t0, dur, type="sine", gain=0.2, glideTo=null) {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0+dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0+dur+0.02);
  }
  function noise(t0, dur, gain=0.15, hp=300) {
    const c = ensure(); if (!c) return;
    const n = Math.floor(c.sampleRate*dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = (Math.random()*2-1)*(1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination); src.start(t0);
  }

  const api = {
    unlock: () => ensure(),
    correct() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime;
      [[523.25,0],[659.25,0.09],[783.99,0.18]].forEach(([f,o])=>tone(f,t+o,0.16,"triangle",0.22)); },
    error() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime;
      tone(207.65,t,0.18,"sawtooth",0.16,150); tone(155,t+0.06,0.2,"square",0.1,110); },
    yay() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime;
      [[523,0],[659,0.1],[784,0.2],[1046,0.32]].forEach(([f,o])=>tone(f,t+o,0.22,"triangle",0.22));
      noise(t+0.32,0.5,0.08,1200); },
    jungle() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime;
      // soft "into the jungle" rising pad + bird chirps
      tone(196,t,1.2,"sine",0.12,392); tone(294,t+0.1,1.1,"sine",0.08,440);
      [1568,1760,2093].forEach((f,i)=>tone(f,t+0.5+i*0.12,0.08,"sine",0.1)); },
    pop() { const c=ensure(); if(!c||!S.soundOn) return; tone(880,c.currentTime,0.05,"sine",0.12); },
    levelup() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime;
      [392,523,659,784,1046].forEach((f,i)=>tone(f,t+i*0.08,0.2,"triangle",0.22)); },
    startMusic() {
      const c = ensure(); if (!c || musicNodes) return;
      const master = c.createGain(); master.gain.value = S.musicOn ? 0.06 : 0.0001; master.connect(c.destination);
      // gentle looping arpeggio pad
      const notes = [261.63,329.63,392.0,329.63,261.63,392.0,440.0,392.0];
      let i = 0;
      const tick = () => {
        if (!musicNodes) return;
        const t = c.currentTime, f = notes[i % notes.length];
        const o = c.createOscillator(), g = c.createGain();
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t+0.2); g.gain.linearRampToValueAtTime(0.0001, t+0.55);
        o.connect(g).connect(master); o.start(t); o.stop(t+0.6); i++;
      };
      const id = setInterval(tick, 480); tick();
      musicNodes = { master, id };
    },
    setMusic(on) {
      if (!musicNodes) { if (on) api.startMusic(); return; }
      const c = ensure(); musicNodes.master.gain.setTargetAtTime(on ? 0.06 : 0.0001, c.currentTime, 0.1);
    },
  };
  return api;
})();

/* ---------------- Speech (Web Speech API) ---------------- */
const Speech = (() => {
  let voice = null;
  function chooseVoice() {
    const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    if (!voices.length) return;
    voice = voices.find(v => /en-AU/i.test(v.lang))
        || voices.find(v => /en[-_]GB/i.test(v.lang))
        || voices.find(v => /^en/i.test(v.lang))
        || voices[0];
  }
  if (window.speechSynthesis) { chooseVoice(); speechSynthesis.onvoiceschanged = chooseVoice; }
  return {
    say(text) {
      if (!S.speechOn || !text || !window.speechSynthesis) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        u.rate = S.speechRate; u.pitch = 1.05; if (voice) { u.voice = voice; u.lang = voice.lang; }
        speechSynthesis.speak(u);
      } catch {}
    }
  };
})();

/* ---------------- Haptics (best-effort) ---------------- */
const buzzHaptic = (ms=20) => { if (navigator.vibrate) try { navigator.vibrate(ms); } catch {} };

/* ---------------- Confetti (canvas) ---------------- */
const Confetti = (() => {
  const cv = document.getElementById("confetti");
  const ctx = cv.getContext("2d");
  let parts = [], raf = null;
  const COLORS = ["#22c55e","#fde68a","#86efac","#f472b6","#60a5fa","#fb923c","#a78bfa"];
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener("resize", resize); resize();
  function start(n=140) {
    if (reduceMotion) return;
    for (let i=0;i<n;i++) parts.push({
      x: innerWidth/2, y: -20, vx:(Math.random()-0.5)*8, vy: Math.random()*4+2,
      r: Math.random()*7+4, c: pick(COLORS), a: 1, rot: Math.random()*6, vr:(Math.random()-0.5)*0.3,
    });
    if (!raf) loop();
  }
  function loop() {
    ctx.clearRect(0,0,cv.width,cv.height);
    parts.forEach(p => { p.vy += 0.15; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.a -= 0.006;
      ctx.save(); ctx.globalAlpha = Math.max(0,p.a); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*0.6); ctx.restore(); });
    parts = parts.filter(p => p.a > 0 && p.y < cv.height+40);
    if (parts.length) raf = requestAnimationFrame(loop); else { raf = null; ctx.clearRect(0,0,cv.width,cv.height); }
  }
  return { start };
})();

/* ---------------- Toasts / banners ---------------- */
function flashBanner(cls, msg, ms=1100) {
  const layer = document.getElementById("overlay");
  const b = el("div", cls, msg); layer.appendChild(b);
  requestAnimationFrame(() => b.classList.add("show"));
  setTimeout(() => { b.classList.remove("show"); setTimeout(()=>b.remove(), 250); }, ms);
}
const toast  = (m) => flashBanner("toast", m);
const ribbon = (m) => flashBanner("ribbon", m);

/* ---------------- Reward logic (stars / stickers / VIP) ---------------- */
function starFly() {
  if (reduceMotion) return;
  const hud = document.getElementById("starBadge"); if (!hud) return;
  const r = hud.getBoundingClientRect();
  const s = el("div","star-fly","⭐"); document.getElementById("overlay").appendChild(s);
  s.style.left = (r.left+6)+"px"; s.style.top = (r.top+4)+"px";
  requestAnimationFrame(()=> s.classList.add("go"));
  setTimeout(()=> s.remove(), 750);
}
function addStar() {
  // Stickers first
  S.stickerCount += 1; S.stickerTotal += 1;
  if (S.stickerCount >= MAX_STICKERS) {
    S.stickerCount = 0; S.stickerTier += 1;
    Confetti.start(); Sound.levelup();
    toast(`🏅 New Badge: ${BADGES[(S.stickerTier-1)%BADGES.length] || "#"+S.stickerTier}!`);
  }
  // Stars / VIP
  starFly();
  S.stars += 1;
  if (S.stars >= 100) {
    S.stars = 0; S.vip += 1;
    const title = VIP_TITLES[(S.vip-1)%VIP_TITLES.length] || ("VIP "+S.vip);
    Confetti.start(); Sound.levelup();
    ribbon(`🎉 VIP Level Up — you're now a ${title}!`);
    document.getElementById("vipBadge")?.animate(
      [{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(1)"}],
      {duration:340, easing:"ease-out"});
  }
  persist(); renderHUD();
}
function loseStar() { S.stars = Math.max(0, S.stars-1); persist(); renderHUD(); }
function cheer() { buzzHaptic(15); Confetti.start(); ribbon("Great job!"); toast("Nice!"); }
function wrong() { buzzHaptic(40); Sound.error(); }

/* ---------------- HUD ---------------- */
function renderHUD() {
  const hud = document.getElementById("hud");
  const prog = Math.min(1, Math.max(0, S.stars/100));
  hud.innerHTML = "";
  const left = el("div","badge"); left.id = "starBadge"; left.innerHTML = `⭐ <b>${S.stars}</b>`;
  const right = el("div","badge vip"); right.id = "vipBadge";
  right.innerHTML = `🏅 VIP <b>${S.vip}</b><span class="bar"><span style="width:${prog*100}%"></span></span>`;
  hud.append(left, right);
}

/* ===================================================================== */
/*  SCREENS                                                              */
/* ===================================================================== */
const app = () => document.getElementById("app");
function go(screen) { S.screen = screen; render(); }

function render() {
  renderHUD();
  const root = app(); root.innerHTML = "";
  ({ home:Home, count:CountGame, word:WordBuilder, memory:MemoryMatch, stickers:StickerBook, settings:Settings }[S.screen] || Home)(root);
}

/* ---- Home ---- */
function Home(root) {
  const page = el("div","page");
  const banner = el("div","banner card");
  banner.innerHTML = `
    <h1 class="title-xl">How Many? 🌿</h1>
    <p class="sub">Count animals, build words, and play memory!</p>`;
  const feats = el("div","features");
  const card = (icon, title, text, tone, fn) => {
    const c = el("div","feature-card");
    c.innerHTML = `<div class="fc-emoji">${icon}</div><h3>${title}</h3><p>${text}</p>`;
    const b = el("button","btn "+tone,"Open"); b.onclick = fn; c.appendChild(b); return c;
  };
  feats.append(
    card("🦁","Count Game","How many animals can you spot?","btn-amber",()=>go("count")),
    card("🦜","Word Builder","Guided • Free • Decoy","btn-amber",()=>go("word")),
    card("🦥","Memory Match","Campaign or Free Play","btn-green",()=>{ Sound.jungle(); go("memory"); }),
  );
  banner.appendChild(feats);

  const util = el("div","util-row");
  const ub = (label, fn, cls="btn-ghost") => { const b = el("button","btn "+cls, label); b.onclick = fn; return b; };
  util.append(
    ub("🟡 Sticker Book", ()=>go("stickers")),
    ub("⚙️ Settings", ()=>go("settings")),
    ub(S.soundOn?"🔊 Sound On":"🔇 Sound Off", function(){ S.soundOn=!S.soundOn; persist(); this.textContent=S.soundOn?"🔊 Sound On":"🔇 Sound Off"; }, "btn-amber"),
    ub(S.musicOn?"🎵 Music On":"🎵 Music Off", function(){ S.musicOn=!S.musicOn; persist(); Sound.setMusic(S.musicOn); this.textContent=S.musicOn?"🎵 Music On":"🎵 Music Off"; }, "btn-amber"),
  );
  banner.appendChild(util);
  page.appendChild(banner);
  page.appendChild(Footer());
  root.appendChild(page);
}

/* ---- Count Game ---- */
function CountGame(root) {
  let target = 1, emoji = "🍇", locked = false;
  const page = el("div","page");
  const card = el("div","card game-card");
  card.innerHTML = `<p class="question">How many do you see?</p>
    <div class="animals-box" id="animals"></div>
    <div class="answers-grid" id="answers"></div>`;
  const toolbar = el("div","toolbar");
  const home = el("button","btn btn-ghost","🏠 Home"); home.onclick = ()=>go("home");
  const next = el("button","btn btn-amber","Next ➡️"); next.onclick = setup;
  toolbar.append(home, next); card.appendChild(toolbar);
  page.append(card, Footer()); root.appendChild(page);

  const animals = card.querySelector("#animals");
  const answers = card.querySelector("#answers");

  function setup() {
    target = 1 + rand(10); emoji = pick(EMOJIS); locked = false;
    animals.innerHTML = ""; animals.classList.remove("shake");
    for (let i=0;i<target;i++) { const s = el("span","animal", emoji); animals.appendChild(s); }
    answers.innerHTML = "";
    ANSWER_RANGE.forEach(n => { const b = el("button","answer-btn", n); b.onclick = ()=>submit(n); answers.appendChild(b); });
    setTimeout(()=> Speech.say("How many do you see?"), 120);
  }
  function submit(n) {
    if (locked) return;
    if (n === target) {
      locked = true; S.correct += 1; addStar(); cheer(); Sound.correct();
      Speech.say(pick(PRAISE)); setTimeout(setup, 850);
    } else { wrong(); loseStar(); animals.classList.remove("shake"); void animals.offsetWidth; animals.classList.add("shake"); }
  }
  setup();
}

/* ---- Word Builder ---- */
function WordBuilder(root) {
  let idx = 0, slots = [], bank = [], startMs = Date.now(), mistakes = 0;
  const lengthForVip = S.vip>=3?6:S.vip>=2?5:S.vip>=1?4:3;
  const pool = WB_WORDS[lengthForVip] || WB_WORDS[3];
  const current = () => pool[idx % pool.length];

  const page = el("div","page");
  const card = el("div","card game-card wb");
  card.innerHTML = `
    <div class="clue" id="clue"></div>
    <div class="wb-slots" id="slots"></div>
    <div class="wb-bank" id="bank"></div>
    <div class="toolbar wb-toolbar">
      <div class="row">
        <button class="btn btn-ghost" id="wbHome">🏠 Home</button>
        <button class="btn btn-amber" id="wbHint">💡 Hint (-1⭐)</button>
      </div>
      <div class="row modes" id="modes"></div>
    </div>`;
  page.append(card, Footer()); root.appendChild(page);

  const clueEl = card.querySelector("#clue");
  const slotsEl = card.querySelector("#slots");
  const bankEl = card.querySelector("#bank");
  card.querySelector("#wbHome").onclick = ()=>go("home");
  card.querySelector("#wbHint").onclick = hint;

  const modesEl = card.querySelector("#modes");
  ["Guided","Free","Decoy"].forEach(m => {
    const b = el("button","chip"+(S.wbMode===m?" active":""), m);
    b.onclick = ()=>{ S.wbMode=m; persist(); newWord(); paintModes(); };
    modesEl.appendChild(b);
  });
  function paintModes(){ [...modesEl.children].forEach(c=>c.classList.toggle("active", c.textContent===S.wbMode)); }

  const expectedAt = (i) => current()[0][i];
  const nextEmpty = () => slots.findIndex(s=>!s);

  function newWord() {
    const word = current()[0];
    slots = Array(word.length).fill(""); mistakes = 0; startMs = Date.now();
    let letters = shuffle(word.split(""));
    if (S.wbMode === "Decoy") {
      const V = ["a","e","i","o","u"];
      const poolD = shuffle([...new Set([...word, ...V])]);
      for (let i=0;i<2;i++){ const p = poolD.find(ch=>!letters.includes(ch)) || poolD[i%poolD.length] || "a"; letters.push(p); }
      letters = shuffle(letters);
    }
    bank = letters;
    paint();
    setTimeout(()=> Speech.say(word), 120);
  }
  function paint() {
    const [word, clue] = current();
    clueEl.innerHTML = `<button class="clue-btn" aria-label="Say the word">${clue}</button>`;
    clueEl.querySelector("button").onclick = ()=> Speech.say(word);
    slotsEl.innerHTML = "";
    slots.forEach((ch,i) => {
      const isNext = S.wbMode==="Guided" && i===nextEmpty();
      const s = el("button","wb-slot"+(isNext?" next":"")+(ch?" filled":""), ch?ch.toUpperCase():"");
      if (ch) s.onclick = ()=>removeFromSlot(i);
      slotsEl.appendChild(s);
    });
    bankEl.innerHTML = "";
    bank.forEach((ch,i) => { const b = el("button","wb-letter", ch.toUpperCase()); b.onclick = ()=>placeFromBank(ch,i); bankEl.appendChild(b); });
  }
  function placeFromBank(letter, bankIdx) {
    const i = nextEmpty(); if (i<0) return;
    if (S.wbMode==="Guided" && letter !== expectedAt(i)) { Sound.pop(); mistakes++; loseStar(); wrong(); return; }
    slots[i] = letter; bank.splice(bankIdx,1); Sound.pop(); paint(); check();
  }
  function removeFromSlot(i) {
    if (!slots[i]) return; bank.push(slots[i]); slots[i]=""; Sound.pop();
    if (S.wbMode!=="Guided") mistakes++; paint();
  }
  function check() {
    const [word] = current();
    if (slots.join("") === word) finish(Date.now()-startMs);
  }
  function finish(elapsed) {
    addStar(); cheer(); Sound.yay();
    const st = S.wbStats;
    st.solved += 1; st.totalTimeMs += elapsed; st.avgTimeMs = Math.round(st.totalTimeMs/st.solved);
    st.currentStreak += 1; st.bestStreak = Math.max(st.bestStreak, st.currentStreak);
    st.totalMistakes += mistakes; st.last = { word: current()[0], timeMs: elapsed, mistakes };
    persist();
    setTimeout(()=>{ idx += 1; newWord(); }, 850);
  }
  function hint() {
    const i = nextEmpty(); if (i<0) return;
    loseStar(); buzzHaptic(10);
    const t = expectedAt(i); const j = bank.indexOf(t);
    if (j !== -1) placeFromBank(t, j);
  }
  newWord();
}

/* ---- Memory Match ---- */
function MemoryMatch(root) {
  let cards = [], first = null, lock = false, found = 0, previewActive = false, info = "";
  let pairsUsed = CAMPAIGN_SEQUENCE[S.mmCampaignIdx] || 2, timer = null;

  Sound.jungle();
  const page = el("div","page");
  const card = el("div","card game-card");
  card.innerHTML = `
    <div class="row-between mm-top">
      <div class="tabs" id="tabs"></div>
      <div class="badge" id="status"></div>
    </div>
    <div class="mm-grid-wrap"><div class="mm-grid" id="grid"></div></div>
    <div class="toolbar mm-toolbar" id="mmTools"></div>`;
  page.append(card, Footer()); root.appendChild(page);

  const tabsEl = card.querySelector("#tabs");
  const statusEl = card.querySelector("#status");
  const gridEl = card.querySelector("#grid");
  const toolsEl = card.querySelector("#mmTools");

  function paintTabs() {
    tabsEl.innerHTML = "";
    ["Campaign","Free"].forEach(m => {
      const t = el("button","tab"+(S.mmMode===m?" active":""), m);
      t.onclick = ()=>{ S.mmMode=m; persist(); newBoard(true); };
      tabsEl.appendChild(t);
    });
  }
  function paintTools() {
    toolsEl.innerHTML = "";
    const mk = (label, fn, cls="") => { const b = el("button","btn mm-btn "+cls, label); b.onclick = fn; return b; };
    toolsEl.append(
      mk("Home", ()=>go("home")),
      mk("New", ()=>newBoard(S.mmMode==="Campaign"), "btn-amber"),
      mk("Shuffle", ()=>{ cards = shuffle(cards); paintGrid(); }),
    );
    if (S.mmMode === "Free") toolsEl.append(mk("Level", openPicker, "btn-green"));
  }
  function openPicker() {
    const back = el("div","modal-back");
    const box = el("div","modal");
    ["Easy","Medium","Hard","Insane"].forEach(d => {
      const o = el("button","modal-opt"+(d===S.mmFreeDiff?" sel":""), d);
      o.onclick = ()=>{ S.mmFreeDiff=d; persist(); back.remove(); newBoard(false); };
      box.appendChild(o);
    });
    const close = el("button","modal-close","Close"); close.onclick = ()=>back.remove();
    box.appendChild(close); back.appendChild(box);
    back.onclick = (e)=>{ if (e.target===back) back.remove(); };
    document.getElementById("overlay").appendChild(back);
  }
  const previewSeconds = () => (S.mmMode==="Free" && (S.mmFreeDiff==="Hard"||S.mmFreeDiff==="Insane")) ? 8 : 5;
  const pairsForBoard = () => {
    if (S.mmMode==="Campaign") return CAMPAIGN_SEQUENCE[S.mmCampaignIdx % CAMPAIGN_SEQUENCE.length];
    const [lo,hi] = DIFFICULTY_RANGES[S.mmFreeDiff] || [4,5]; return lo + rand(hi-lo+1);
  };
  function statusText() {
    if (previewActive) return info;
    return S.mmMode==="Campaign" ? `Stage ${S.mmCampaignIdx+1}/7 • ${pairsUsed} Pairs` : `${S.mmFreeDiff}: ${pairsUsed} Pairs`;
  }
  function clearTimer(){ if (timer){ clearInterval(timer); timer=null; } }
  function startPreview() {
    clearTimer(); let secs = previewSeconds(); previewActive = true;
    const tick = () => { info = S.mmMode==="Campaign" ? `Preview: ${secs}s • Stage ${S.mmCampaignIdx+1}/7` : `Preview: ${secs}s • ${S.mmFreeDiff}`; statusEl.textContent = statusText(); };
    tick();
    timer = setInterval(()=>{ secs-=1; if (secs<0){ clearTimer(); endPreview(); } else tick(); }, 1000);
  }
  function endPreview() { previewActive=false; cards.forEach(c=>{ if(!c.matched) c.face=false; }); paintGrid(); statusEl.textContent = statusText(); }
  function dealDeck(pairs) {
    const chosen = shuffle(EMOJIS.slice()).slice(0,pairs);
    return shuffle([...chosen,...chosen]).map((sym,i)=>({ sym, key:`c-${i}-${Math.random().toString(36).slice(2,6)}`, face:true, matched:false }));
  }
  function newBoard(keepStage=true) {
    paintTabs(); paintTools();
    let p = pairsForBoard();
    if (S.mmMode==="Campaign" && keepStage) p = CAMPAIGN_SEQUENCE[S.mmCampaignIdx % CAMPAIGN_SEQUENCE.length];
    pairsUsed = p; cards = dealDeck(p); found=0; lock=false; first=null;
    paintGrid(); setTimeout(startPreview, 60);
  }
  function paintGrid() {
    gridEl.style.setProperty("--cols", 4);
    gridEl.innerHTML = "";
    cards.forEach((c,i) => {
      const b = el("button","mm-card"+(c.matched?" matched":"")+(c.face?" face":""), (c.face||c.matched)?c.sym:"❓");
      b.disabled = c.matched; b.onclick = ()=>flip(i); gridEl.appendChild(b);
    });
    statusEl.textContent = statusText();
  }
  function flip(i) {
    if (lock) return;
    if (previewActive){ clearTimer(); endPreview(); }
    const c = cards[i]; if (c.face || c.matched) return;
    Sound.pop(); c.face = true; paintGrid();
    if (first==null){ first=i; return; }
    lock = true;
    const a = cards[first], b = cards[i];
    setTimeout(()=>{
      if (a.sym === b.sym) {
        a.face=false; a.matched=true; b.face=false; b.matched=true; found+=1; cheer(); Sound.correct();
        if (found >= pairsUsed) {
          addStar();
          if (S.mmMode==="Campaign") setTimeout(()=>{ S.mmCampaignIdx=(S.mmCampaignIdx+1)%CAMPAIGN_SEQUENCE.length; persist(); newBoard(true); }, 650);
          else setTimeout(()=>newBoard(false), 650);
        }
      } else { a.face=false; b.face=false; wrong(); loseStar(); }
      first=null; lock=false; paintGrid();
    }, 460);
  }
  // tear down timer when leaving
  const obs = new MutationObserver(()=>{ if (!document.body.contains(page)){ clearTimer(); obs.disconnect(); } });
  obs.observe(app(), { childList:true });
  newBoard(true);
}

/* ---- Sticker Book ---- */
function StickerBook(root) {
  const badge = BADGES[S.stickerTier % BADGES.length] || ("Tier "+S.stickerTier);
  const page = el("div","page");
  const card = el("div","card game-card");
  card.innerHTML = `
    <h2 class="title">Sticker Book • ${badge} Badge</h2>
    <p class="subtitle">${S.stickerCount}/${MAX_STICKERS} to next badge • Tier ${S.stickerTier}</p>
    <div class="prog"><span style="width:${(S.stickerCount/MAX_STICKERS)*100}%"></span></div>
    <div class="sticker-grid" id="sg"></div>
    <div class="row-spread">
      <button class="btn btn-ghost" id="sbHome">🏠 Home</button>
      <button class="btn btn-amber" id="sbCheer">Play Cheer</button>
    </div>`;
  page.append(card, Footer()); root.appendChild(page);
  const grid = card.querySelector("#sg");
  for (let i=0;i<MAX_STICKERS;i++) {
    const got = i < S.stickerCount;
    const cell = el("div","sticker"+(got?"":" empty"), got ? STICKER_SET[i%STICKER_SET.length] : "⋆");
    grid.appendChild(cell);
  }
  card.querySelector("#sbHome").onclick = ()=>go("home");
  card.querySelector("#sbCheer").onclick = ()=>{ cheer(); Sound.yay(); };
}

/* ---- Settings (new — "but better") ---- */
function Settings(root) {
  const page = el("div","page");
  const card = el("div","card game-card");
  card.innerHTML = `
    <h2 class="title">Settings ⚙️</h2>
    <div class="set-list" id="sl"></div>
    <div class="row-spread">
      <button class="btn btn-ghost" id="setHome">🏠 Home</button>
      <button class="btn btn-amber" id="setReset">↺ Reset Progress</button>
    </div>`;
  page.append(card, Footer()); root.appendChild(page);
  const sl = card.querySelector("#sl");

  const toggle = (label, val, fn) => {
    const r = el("div","set-row"); r.innerHTML = `<span>${label}</span>`;
    const b = el("button","switch"+(val?" on":""), val?"On":"Off");
    b.onclick = ()=>{ const nv = fn(); b.classList.toggle("on", nv); b.textContent = nv?"On":"Off"; };
    r.appendChild(b); return r;
  };
  sl.append(
    toggle("🔊 Sound effects", S.soundOn, ()=>{ S.soundOn=!S.soundOn; persist(); return S.soundOn; }),
    toggle("🎵 Background music", S.musicOn, ()=>{ S.musicOn=!S.musicOn; persist(); Sound.setMusic(S.musicOn); return S.musicOn; }),
    toggle("🗣️ Spoken words", S.speechOn, ()=>{ S.speechOn=!S.speechOn; persist(); return S.speechOn; }),
  );
  const rate = el("div","set-row"); rate.innerHTML = `<span>🐢 Speech speed</span>`;
  const slider = el("input"); slider.type="range"; slider.min="0.6"; slider.max="1.3"; slider.step="0.1"; slider.value=S.speechRate; slider.className="slider";
  slider.oninput = ()=>{ S.speechRate = Number(slider.value); persist(); };
  slider.onchange = ()=> Speech.say("Hello! Let's learn together.");
  rate.appendChild(slider); sl.appendChild(rate);

  const stats = S.wbStats;
  const info = el("div","set-stats");
  info.innerHTML = `<b>Your progress</b><br>
    ⭐ Stars this round: ${S.stars} · 🏅 VIP ${S.vip}<br>
    🎯 Total correct: ${S.correct} · 🟡 Stickers earned: ${S.stickerTotal}<br>
    🔤 Words solved: ${stats.solved} · 🔥 Best streak: ${stats.bestStreak}`;
  sl.appendChild(info);

  card.querySelector("#setHome").onclick = ()=>go("home");
  card.querySelector("#setReset").onclick = ()=>{
    const back = el("div","modal-back"); const box = el("div","modal");
    box.innerHTML = `<p style="font-weight:800;margin:0 0 10px;color:#064e3b">Reset all stickers and score?</p>`;
    const yes = el("button","modal-opt","Yes, reset"); const no = el("button","modal-close","Cancel");
    yes.onclick = ()=>{ S.stars=S.correct=S.vip=S.stickerCount=S.stickerTier=S.stickerTotal=0;
      S.wbStats={ solved:0,currentStreak:0,bestStreak:0,totalMistakes:0,totalTimeMs:0,avgTimeMs:0,last:{word:"",timeMs:0,mistakes:0} };
      S.mmCampaignIdx=0; persist(); back.remove(); render(); };
    no.onclick = ()=>back.remove();
    box.append(yes, no); back.appendChild(box);
    back.onclick = (e)=>{ if(e.target===back) back.remove(); };
    document.getElementById("overlay").appendChild(back);
  };
}

function Footer() { return el("p","footer","Made with ❤️ for little learners"); }

/* ---------------- Boot ---------------- */
function unlockAudioOnce() {
  Sound.unlock();
  if (S.musicOn) Sound.startMusic();
  window.removeEventListener("pointerdown", unlockAudioOnce);
}
window.addEventListener("pointerdown", unlockAudioOnce);

// Install prompt
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e;
  const btn = document.getElementById("installBtn");
  if (btn) { btn.hidden = false; btn.onclick = async ()=>{ btn.hidden=true; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; }; }
});

// Service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", ()=> navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}

render();
