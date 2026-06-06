/* =========================================================================
   How Many? — Little Learners · v2
   PWA. Vanilla JS, no build step, no media assets (all audio synthesised).

   v2 changes (all approved):
    1. Adaptive Count Game (skill 1–8 widens range 1–3 → 1–10; choices 4 → 10)
    2. "Count together" teaching moment after 2 misses in a round
    3. "Sound it out" phonics button in Word Builder
    4. Word length unlocks by words solved (12/30/60) + Settings override
    5. Word pools reshuffled every cycle — no predictable repeats
    6. Memory campaign finale celebration after stage 7
    7. Sticker badge trophy shelf (badges persist visibly after book resets)
    8. Calibrated confetti: small burst per answer, full-screen for milestones
    9. Parental gate on Reset (hold 3 seconds)
   10. Master volume slider (music + effects)
   11. Emoji compatibility: replaced 🪆🪵🪜🪟🪴 with widely-supported glyphs
   12. Richer, gentler 16-step music loop
   13. iOS speech fix: speech deferred until first user gesture
   14. Memory Match: per-card DOM updates + proper screen cleanup hooks
   Star-loss logic intentionally unchanged (per owner decision).
   ========================================================================= */
"use strict";

/* ---------------- Constants ---------------- */
const EMOJIS = [
  "🐶","🐱","🦊","🐰","🐻","🐼","🐵","🐸","🐨","🦁","🐯","🐮","🐷","🐔","🐤","🐙","🐠","🦋",
  "🐞","🦄","🐝","🐢","🐳","🦒","🦓","🦜","🌸","🌼","🍓","🍎","🍌","🍇","🍉","🥕","🌽","🚗",
  "✈️","🚀","⚽","🏀","🎈","⭐","🌈",
];

/* v2 #11: 🪆→💍(ring) 🪵→🔑(key) 🪜→🌷(garden) 🪟→❄️(winter) 🪴→🌱 */
const WB_WORDS = {
  3: [["cat","🐱"],["dog","🐶"],["sun","☀️"],["bat","🦇"],["pen","✏️"],["cup","☕"],["hat","🎩"],["pig","🐷"],["map","🗺️"],["bus","🚌"],["key","🔑"],["net","🕸️"],["box","📦"],["jam","🍓"],["fox","🦊"]],
  4: [["ball","🏀"],["star","⭐"],["moon","🌙"],["fish","🐟"],["lion","🦁"],["duck","🦆"],["bird","🐦"],["cake","🎂"],["tree","🌳"],["ring","💍"],["frog","🐸"],["ship","🚢"],["door","🚪"],["book","📖"],["rain","🌧️"]],
  5: [["apple","🍎"],["chair","🪑"],["house","🏠"],["bread","🍞"],["plant","🌱"],["horse","🐴"],["light","💡"],["smile","😊"],["train","🚆"],["tiger","🐯"],["sheep","🐑"],["cloud","☁️"],["water","💧"],["beach","🏖️"],["pizza","🍕"]],
  6: [["school","🏫"],["animal","🐾"],["circle","⭕"],["summer","☀️"],["forest","🌲"],["bottle","🍾"],["winter","❄️"],["rocket","🚀"],["flower","🌸"],["mother","👩"],["banana","🍌"],["orange","🍊"],["garden","🌷"],["castle","🏰"],["cookie","🍪"]],
};

/* v2 #4: word length unlocks by total words solved (any length counts) */
const WB_LENGTH_UNLOCKS = { 4: 12, 5: 30, 6: 60 };

/* v2 #3: approximate letter sounds for the TTS engine */
const LETTER_SOUNDS = {
  a:"ah", b:"buh", c:"kuh", d:"duh", e:"eh", f:"fff", g:"guh", h:"huh", i:"ih",
  j:"juh", k:"kuh", l:"lll", m:"mmm", n:"nnn", o:"o", p:"puh", q:"kwuh", r:"rrr",
  s:"sss", t:"tuh", u:"uh", v:"vvv", w:"wuh", x:"ks", y:"yuh", z:"zzz",
};

const CAMPAIGN_SEQUENCE = [2,3,4,5,6,7,8];
const DIFFICULTY_RANGES = { Easy:[2,3], Medium:[4,5], Hard:[6,7], Insane:[8,8] };
const PRAISE = ["Correct!","Excellent!","Fantastic!","Brilliant!","Great job!","Nice!"];
const VIP_TITLES = ["Explorer 🌱","Helper 🐾","Hero 🦁","Ace 🚀","Champion 🏆","Legend 🌟"];
/* v2 #11: 🛝 (Emoji 14) → 🎠 */
const STICKER_SET = ["🦄","🌈","🌟","🍓","🚀","🎈","🧸","🍭","🦕","🌼","🐳","🎠","🧩","🎨","🎵","🍪","⚽","🐣"];
const BADGES = ["Bronze","Silver","Gold","Legend","Mythic","Eternal"];
const BADGE_EMOJI = ["🥉","🥈","🥇","🏅","💎","👑"];
const MAX_STICKERS = 100;
const MAX_COUNT_SKILL = 8;

/* ---------------- Persistent store (localStorage, fail-safe) ---------------- */
const Store = (() => {
  let mem = {};
  let ok = true;
  try { localStorage.setItem("__t","1"); localStorage.removeItem("__t"); }
  catch { ok = false; }
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
  volume: Math.min(1, Math.max(0, Store.num("volume", 0.8))),      // v2 #10
  countSkill: Math.min(MAX_COUNT_SKILL, Math.max(1, Store.num("count.skill", 1))), // v2 #1
  wbMode: Store.str("wb.mode", "Guided"),
  wbLenOverride: Store.str("wb.lenOverride", "auto"),               // v2 #4
  wbStats: Store.json("wb.stats", { solved:0, currentStreak:0, bestStreak:0, totalMistakes:0, totalTimeMs:0, avgTimeMs:0, last:{word:"",timeMs:0,mistakes:0} }),
  mmMode: Store.str("mm.mode", "Campaign"),
  mmFreeDiff: Store.str("mm.freeDiff", "Medium"),
  mmCampaignIdx: Store.num("mm.campaignIdx", 0),
};
function persist() {
  Store.set("stars", S.stars); Store.set("correct", S.correct); Store.set("vip", S.vip);
  Store.set("stickers.count", S.stickerCount); Store.set("stickers.tier", S.stickerTier); Store.set("stickers.total", S.stickerTotal);
  Store.set("sound", S.soundOn); Store.set("music", S.musicOn); Store.set("speech", S.speechOn); Store.set("speech.rate", S.speechRate);
  Store.set("volume", S.volume);
  Store.set("count.skill", S.countSkill);
  Store.set("wb.mode", S.wbMode); Store.set("wb.lenOverride", S.wbLenOverride); Store.setJSON("wb.stats", S.wbStats);
  Store.set("mm.mode", S.mmMode); Store.set("mm.freeDiff", S.mmFreeDiff); Store.set("mm.campaignIdx", S.mmCampaignIdx);
  if (window.Cloud) Cloud.schedulePush();
}

/* ---------------- Helpers ---------------- */
const shuffle = (arr) => { const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const rand = (n) => Math.floor(Math.random()*n);
const pick = (arr) => arr[rand(arr.length)];
const el = (tag, cls, html) => { const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; };
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* v2 #13/#14: track first user gesture; screens can register teardown */
let userInteracted = false;
let screenCleanup = null;

/* ---------------- Audio engine: synthesised SFX + music ---------------- */
const Sound = (() => {
  let ctx = null, musicNodes = null;
  const ensure = () => { if (!ctx) { try { ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch {} } if (ctx && ctx.state === "suspended") ctx.resume(); return ctx; };
  const vol = () => S.volume; // v2 #10: every sound scales by master volume

  function tone(freq, t0, dur, type="sine", gain=0.2, glideTo=null, dest=null) {
    const c = ensure(); if (!c) return;
    const g0 = gain * vol(); if (g0 <= 0.0001) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0+dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(g0, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g).connect(dest || c.destination); o.start(t0); o.stop(t0+dur+0.02);
  }
  function noise(t0, dur, gain=0.15, hp=300) {
    const c = ensure(); if (!c) return;
    const g0 = gain * vol(); if (g0 <= 0.0001) return;
    const n = Math.floor(c.sampleRate*dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = (Math.random()*2-1)*(1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = g0;
    src.connect(f).connect(g).connect(c.destination); src.start(t0);
  }

  /* v2 #12: a longer, gentler lullaby loop — 16 melody steps + soft bass */
  const MELODY = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0,
                  523.25, 659.25, 587.33, 523.25, 440.0, 493.88, 523.25, 392.0];
  const BASS   = [261.63, 196.0, 220.0, 196.0];
  const MUSIC_BASE_GAIN = 0.06;

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
      tone(196,t,1.2,"sine",0.12,392); tone(294,t+0.1,1.1,"sine",0.08,440);
      [1568,1760,2093].forEach((f,i)=>tone(f,t+0.5+i*0.12,0.08,"sine",0.1)); },
    pop() { const c=ensure(); if(!c||!S.soundOn) return; tone(880,c.currentTime,0.05,"sine",0.12); },
    tick() { const c=ensure(); if(!c||!S.soundOn) return; tone(988,c.currentTime,0.07,"sine",0.14); },
    levelup() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime;
      [392,523,659,784,1046].forEach((f,i)=>tone(f,t+i*0.08,0.2,"triangle",0.22)); },
    fanfare() { const c=ensure(); if(!c||!S.soundOn) return; const t=c.currentTime; // v2 #6
      [[523,0],[523,0.12],[523,0.24],[659,0.4],[784,0.6],[1046,0.85],[1318,1.05]]
        .forEach(([f,o])=>tone(f,t+o,0.3,"triangle",0.22));
      noise(t+0.85,0.7,0.09,900); },
    startMusic() {
      const c = ensure(); if (!c || musicNodes) return;
      const master = c.createGain();
      master.gain.value = S.musicOn ? MUSIC_BASE_GAIN * S.volume : 0.0001;
      master.connect(c.destination);
      let step = 0;
      const tick = () => {
        if (!musicNodes) return;
        const t = c.currentTime;
        const f = MELODY[step % MELODY.length];
        // lead voice
        const o = c.createOscillator(), g = c.createGain();
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t+0.18); g.gain.linearRampToValueAtTime(0.0001, t+0.52);
        o.connect(g).connect(master); o.start(t); o.stop(t+0.56);
        // soft octave-below shimmer
        const o2 = c.createOscillator(), g2 = c.createGain();
        o2.type = "sine"; o2.frequency.value = f/2;
        g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(0.45, t+0.2); g2.gain.linearRampToValueAtTime(0.0001, t+0.5);
        o2.connect(g2).connect(master); o2.start(t); o2.stop(t+0.54);
        // bass on every 4th step
        if (step % 4 === 0) {
          const b = c.createOscillator(), gb = c.createGain();
          b.type = "sine"; b.frequency.value = BASS[(step/4) % BASS.length];
          gb.gain.setValueAtTime(0.0001, t); gb.gain.linearRampToValueAtTime(0.8, t+0.25); gb.gain.linearRampToValueAtTime(0.0001, t+1.6);
          b.connect(gb).connect(master); b.start(t); b.stop(t+1.7);
        }
        step++;
      };
      const id = setInterval(tick, 430); tick();
      musicNodes = { master, id };
    },
    setMusic(on) {
      if (!musicNodes) { if (on) api.startMusic(); return; }
      const c = ensure();
      musicNodes.master.gain.setTargetAtTime(on ? MUSIC_BASE_GAIN * S.volume : 0.0001, c.currentTime, 0.1);
    },
    applyVolume() { // v2 #10: live music volume; SFX pick it up per-note
      if (!musicNodes) return;
      const c = ensure();
      musicNodes.master.gain.setTargetAtTime(S.musicOn ? MUSIC_BASE_GAIN * S.volume : 0.0001, c.currentTime, 0.05);
    },
  };
  return api;
})();

/* ---------------- Speech (Web Speech API) ----------------
   v2 #13: utterances requested before the first user gesture are queued and
   spoken right after it, instead of being silently blocked (iOS). */
const Speech = (() => {
  let voice = null, pendingText = null;
  function chooseVoice() {
    const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    if (!voices.length) return;
    voice = voices.find(v => /en-AU/i.test(v.lang))
        || voices.find(v => /en[-_]GB/i.test(v.lang))
        || voices.find(v => /^en/i.test(v.lang))
        || voices[0];
  }
  if (window.speechSynthesis) { chooseVoice(); speechSynthesis.onvoiceschanged = chooseVoice; }
  function speakNow(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.rate = S.speechRate; u.pitch = 1.05; if (voice) { u.voice = voice; u.lang = voice.lang; }
      speechSynthesis.speak(u);
    } catch {}
  }
  return {
    say(text) {
      if (!S.speechOn || !text || !window.speechSynthesis) return;
      if (!userInteracted) { pendingText = String(text); return; }
      speakNow(text);
    },
    flushPending() {
      if (pendingText && S.speechOn && window.speechSynthesis) { speakNow(pendingText); }
      pendingText = null;
    },
  };
})();

/* ---------------- Haptics ---------------- */
const buzzHaptic = (ms=20) => { if (navigator.vibrate) try { navigator.vibrate(ms); } catch {} };

/* ---------------- Confetti (canvas) ----------------
   v2 #8: start(n) full-screen for milestones; burst() small for routine wins */
const Confetti = (() => {
  const cv = document.getElementById("confetti");
  const ctx = cv.getContext("2d");
  let parts = [], raf = null;
  const COLORS = ["#22c55e","#fde68a","#86efac","#f472b6","#60a5fa","#fb923c","#a78bfa"];
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener("resize", resize); resize();
  function spawn(n, x, y, spread) {
    if (reduceMotion) return;
    for (let i=0;i<n;i++) parts.push({
      x, y, vx:(Math.random()-0.5)*spread, vy: Math.random()*4+2,
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
  return {
    start: (n=160) => spawn(n, innerWidth/2, -20, 8),          // milestone: full sky
    burst: (n=24)  => spawn(n, innerWidth/2, innerHeight*0.45, 5), // routine: small pop
  };
})();

/* ---------------- Leo the lion mascot (v3) ----------------
   A persistent host who reacts: jumps on wins, wobbles on misses. */
const Mascot = (() => {
  let root = null, face = null, bubble = null, tmr = null;
  function ensure() {
    if (root) return;
    root = el("div"); root.id = "mascot"; root.setAttribute("aria-hidden","true");
    root.innerHTML = `<span class="m-bubble"></span><span class="m-face">🦁</span>`;
    document.body.appendChild(root);
    face = root.querySelector(".m-face");
    bubble = root.querySelector(".m-bubble");
  }
  function react(cls, text, ms) {
    ensure();
    if (reduceMotion) cls = null;
    face.classList.remove("m-cheer","m-oops","m-talk");
    if (cls) { void face.offsetWidth; face.classList.add(cls); }
    if (text) {
      bubble.textContent = text;
      bubble.classList.remove("show"); void bubble.offsetWidth; bubble.classList.add("show");
    }
    clearTimeout(tmr);
    tmr = setTimeout(() => { bubble.classList.remove("show"); if (cls) face.classList.remove(cls); }, ms);
  }
  return {
    ensure,
    cheer: () => react("m-cheer", pick(["⭐","🎉","👏","💪","✨"]), 1100),
    big:   (t) => react("m-cheer", t ?? "🎉🎉", 1900),
    oops:  () => react("m-oops", pick(["💭","🤔"]), 900),
    hello: () => react("m-talk", "👋", 1500),
  };
})();

/* ---------------- Toasts / banners ---------------- */
function flashBanner(cls, msg, ms=1100) {
  const layer = document.getElementById("overlay");
  const b = el("div", cls, msg); layer.appendChild(b);
  requestAnimationFrame(() => b.classList.add("show"));
  setTimeout(() => { b.classList.remove("show"); setTimeout(()=>b.remove(), 250); }, ms);
}
const toast  = (m, ms) => flashBanner("toast", m, ms);
const ribbon = (m, ms) => flashBanner("ribbon", m, ms);

/* ---------------- Reward logic (stars / stickers / VIP) ----------------
   NOTE: star-loss behaviour intentionally unchanged. */
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
    Confetti.start(180); Sound.levelup();          // milestone: full confetti
    toast(`🏅 New Badge: ${BADGES[(S.stickerTier-1)%BADGES.length] || "#"+S.stickerTier}!`, 1600);
  }
  // Stars / VIP
  starFly();
  S.stars += 1;
  if (S.stars >= 100) {
    S.stars = 0; S.vip += 1;
    const title = VIP_TITLES[(S.vip-1)%VIP_TITLES.length] || ("VIP "+S.vip);
    Confetti.start(200); Sound.levelup();          // milestone: full confetti
    ribbon(`🎉 VIP Level Up — you're now a ${title}!`, 2000);
    document.getElementById("vipBadge")?.animate(
      [{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(1)"}],
      {duration:340, easing:"ease-out"});
  }
  persist(); renderHUD();
}
function loseStar() { S.stars = Math.max(0, S.stars-1); persist(); renderHUD(); }

/* v2 #8: two tiers of celebration */
function cheerSmall() { buzzHaptic(12); Confetti.burst(22); Mascot.cheer(); }
function cheerBig(msg) { buzzHaptic(18); Confetti.start(150); if (msg) ribbon(msg, 1500); Mascot.big(); }
function wrong() { buzzHaptic(40); Sound.error(); Mascot.oops(); }

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

/* ---------------- Parental gate (v2 #9): hold 3 seconds to reset ---------------- */
function gatedReset() {
  const back = el("div","modal-back");
  const box = el("div","modal");
  box.innerHTML = `
    <p style="font-weight:800;margin:0 0 6px;color:#064e3b;font-size:17px">Grown-ups only 🔒</p>
    <p style="margin:0 0 14px;color:#065f46;font-size:14px">This wipes all stars, stickers and progress. To confirm, press and HOLD the red button for 3 seconds.</p>`;
  const hold = el("button","modal-opt hold-btn");
  hold.innerHTML = `<span class="hold-fill"></span><span class="lbl">Hold to reset…</span>`;
  hold.style.background = "#fee2e2"; hold.style.color = "#991b1b";
  const cancel = el("button","modal-close","Cancel");
  box.append(hold, cancel); back.appendChild(box);
  back.onclick = (e)=>{ if (e.target===back) back.remove(); };
  cancel.onclick = ()=> back.remove();
  document.getElementById("overlay").appendChild(back);

  const fill = hold.querySelector(".hold-fill");
  const lbl = hold.querySelector(".lbl");
  let timer = null, startAt = 0;
  const HOLD_MS = 3000;
  const stop = () => { if (timer){ clearInterval(timer); timer=null; } fill.style.width="0%"; lbl.textContent="Hold to reset…"; };
  const begin = (e) => {
    e.preventDefault();
    startAt = performance.now();
    timer = setInterval(() => {
      const p = Math.min(1, (performance.now()-startAt)/HOLD_MS);
      fill.style.width = (p*100)+"%";
      lbl.textContent = p < 1 ? `Keep holding… ${Math.ceil((1-p)*3)}` : "Resetting…";
      if (p >= 1) {
        clearInterval(timer); timer = null;
        doReset(); back.remove();
      }
    }, 50);
  };
  hold.addEventListener("pointerdown", begin);
  ["pointerup","pointerleave","pointercancel"].forEach(ev => hold.addEventListener(ev, stop));
}
function doReset() {
  S.stars=0; S.correct=0; S.vip=0;
  S.stickerCount=0; S.stickerTier=0; S.stickerTotal=0;
  S.countSkill=1;
  S.wbStats={ solved:0,currentStreak:0,bestStreak:0,totalMistakes:0,totalTimeMs:0,avgTimeMs:0,last:{word:"",timeMs:0,mistakes:0} };
  S.mmCampaignIdx=0;
  persist(); render();
  toast("Progress reset");
}

/* ===================================================================== */
/*  SCREENS                                                              */
/* ===================================================================== */
const app = () => document.getElementById("app");
function go(screen) { S.screen = screen; render(); }

function render() {
  if (screenCleanup) { try { screenCleanup(); } catch {} screenCleanup = null; } // v2 #14
  document.body.className = "t-" + (S.screen || "home");   // v3: per-screen mood tint
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
  /* v3: jungle scene dressing */
  ["🌿","🍃","🌴"].forEach((g,i)=> banner.appendChild(el("span","deco d"+(i+1), g)));

  /* v3: the whole card is one giant picture button — no reading required */
  const feats = el("div","features");
  const tap = (icon, title, sub, tone, fn) => {
    const b = el("button","feature-tap "+tone);
    b.innerHTML = `<span class="ft-emoji">${icon}</span><span class="ft-title">${title}</span><span class="ft-sub">${sub}</span>`;
    b.setAttribute("aria-label", title);
    b.onclick = fn; return b;
  };
  feats.append(
    tap("🦁","Count!","How many animals?","tone-amber",()=>go("count")),
    tap("🦜","Words!","Build with letters","tone-sky",()=>go("word")),
    tap("🦥","Memory!","Find the pairs","",()=>{ Sound.jungle(); go("memory"); }),
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

/* ---- Count Game (v2 #1 adaptive · v2 #2 count-together) ---- */
function CountGame(root) {
  let target = 1, emoji = "🍇", locked = false;
  let missesThisRound = 0, taughtThisRound = false;
  let streakUp = 0, streakDown = 0;
  const token = { cancelled: false, gen: 0 };   // gen guards async loops across rounds
  screenCleanup = () => { token.cancelled = true; };

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

  /* v2 #1: skill → number range and choice count */
  const maxN = () => Math.min(10, 2 + S.countSkill);                 // skill 1→3 … 8→10
  const numChoices = () => Math.min(10, 3 + S.countSkill);           // skill 1→4 … 7+→10
  function buildChoices(t) {
    const k = numChoices();
    const set = new Set([t]);
    // prefer near-miss distractors (teaches discrimination), then fill randomly
    const near = shuffle([t-3,t-2,t-1,t+1,t+2,t+3].filter(v => v>=1 && v<=10));
    for (const v of near) { if (set.size >= k) break; set.add(v); }
    const rest = shuffle(Array.from({length:10},(_,i)=>i+1).filter(v=>!set.has(v)));
    for (const v of rest) { if (set.size >= k) break; set.add(v); }
    return [...set].sort((a,b)=>a-b);
  }
  function bumpSkill(up) {
    if (up) {
      streakDown = 0; streakUp += 1;
      if (streakUp >= 2 && S.countSkill < MAX_COUNT_SKILL) { S.countSkill += 1; streakUp = 0; persist(); }
    } else {
      streakUp = 0; streakDown += 1;
      if (streakDown >= 2 && S.countSkill > 1) { S.countSkill -= 1; streakDown = 0; persist(); }
    }
  }

  function setup() {
    token.gen += 1;                              // invalidates any in-flight teaching loop
    target = 1 + rand(maxN()); emoji = pick(EMOJIS);
    locked = false; missesThisRound = 0; taughtThisRound = false;
    animals.innerHTML = ""; animals.classList.remove("shake");
    for (let i=0;i<target;i++) animals.appendChild(el("span","animal", emoji));
    const choices = buildChoices(target);
    answers.innerHTML = "";
    answers.style.gridTemplateColumns = `repeat(${Math.min(choices.length,5)},1fr)`;
    choices.forEach(n => { const b = el("button","answer-btn", n); b.onclick = ()=>submit(n); answers.appendChild(b); });
    setTimeout(()=> { if (!token.cancelled) Speech.say("How many do you see?"); }, 120);
  }

  /* v2 #2: after 2 misses, count the animals together, aloud and highlighted */
  async function countTogether() {
    taughtThisRound = true;
    locked = true;
    const myGen = token.gen;
    const dead = () => token.cancelled || token.gen !== myGen;
    const spans = [...animals.children];
    Speech.say("Let's count together!");
    await delay(900); if (dead()) return;
    for (let i=0;i<spans.length;i++) {
      if (dead()) return;
      spans[i].classList.add("counted");
      Sound.tick();
      Speech.say(String(i+1));
      await delay(800);
    }
    if (dead()) return;
    await delay(250);
    spans.forEach(s => s.classList.remove("counted"));
    Speech.say(`${target}! Now you try!`);
    locked = false;
  }

  function submit(n) {
    if (locked) return;
    if (n === target) {
      locked = true; S.correct += 1;
      bumpSkill(true);
      addStar(); cheerSmall(); Sound.correct();   // v2 #8: small burst per answer
      Speech.say(pick(PRAISE));
      const myGen = token.gen;
      setTimeout(()=>{ if (!token.cancelled && token.gen === myGen) setup(); }, 900);
    } else {
      wrong(); loseStar();                        // star-loss kept by design
      missesThisRound += 1;
      bumpSkill(false);
      animals.classList.remove("shake"); void animals.offsetWidth; animals.classList.add("shake");
      if (missesThisRound >= 2 && !taughtThisRound) countTogether();
    }
  }
  setup();
}

/* ---- Word Builder (v2 #3 phonics · #4 progression · #5 shuffled pools) ---- */
function WordBuilder(root) {
  let queue = [], entry = null, lastWord = "";
  let slots = [], bank = [], startMs = Date.now(), mistakes = 0;
  let soundingOut = false;
  const token = { cancelled: false };
  screenCleanup = () => { token.cancelled = true; };

  /* v2 #4: length from solved-count unlocks, or the Settings override */
  function lenForNow() {
    if (S.wbLenOverride !== "auto") {
      const n = Number(S.wbLenOverride);
      if (WB_WORDS[n]) return n;
    }
    const solved = S.wbStats.solved;
    if (solved >= WB_LENGTH_UNLOCKS[6]) return 6;
    if (solved >= WB_LENGTH_UNLOCKS[5]) return 5;
    if (solved >= WB_LENGTH_UNLOCKS[4]) return 4;
    return 3;
  }
  const poolNow = () => WB_WORDS[lenForNow()] || WB_WORDS[3];

  /* v2 #5: a reshuffled queue per cycle; refilled if the length tier changed */
  function drawNext() {
    const p = poolNow();
    if (!queue.length || queue[0][0].length !== lenForNow()) {
      queue = shuffle(p.slice());
      if (queue.length > 1 && queue[0][0] === lastWord) queue.push(queue.shift()); // no immediate repeat across cycles
    }
    entry = queue.shift();
    lastWord = entry[0];
  }

  const page = el("div","page");
  const card = el("div","card game-card wb");
  card.innerHTML = `
    <div class="clue" id="clue"></div>
    <div class="wb-slots" id="slots"></div>
    <div class="wb-bank" id="bank"></div>
    <div class="toolbar wb-toolbar">
      <div class="row" style="justify-content:space-between">
        <button class="btn btn-ghost wb-icon" id="wbHome" aria-label="Home">🏠</button>
        <button class="btn btn-green" id="wbSound">🔤 Sounds</button>
        <button class="btn btn-amber" id="wbHint">💡 Hint −1⭐</button>
      </div>
      <div class="row modes" id="modes"></div>
      <p class="wb-progress" id="wbProg"></p>
    </div>`;
  page.append(card, Footer()); root.appendChild(page);

  const clueEl = card.querySelector("#clue");
  const slotsEl = card.querySelector("#slots");
  const bankEl = card.querySelector("#bank");
  const progEl = card.querySelector("#wbProg");
  card.querySelector("#wbHome").onclick = ()=>go("home");
  card.querySelector("#wbHint").onclick = hint;
  card.querySelector("#wbSound").onclick = soundItOut;

  const modesEl = card.querySelector("#modes");
  ["Guided","Free","Decoy"].forEach(m => {
    const b = el("button","chip"+(S.wbMode===m?" active":""), m);
    b.onclick = ()=>{ S.wbMode=m; persist(); newWord(); paintModes(); };
    modesEl.appendChild(b);
  });
  function paintModes(){ [...modesEl.children].forEach(c=>c.classList.toggle("active", c.textContent===S.wbMode)); }

  function paintProgress() {
    const len = lenForNow();
    if (S.wbLenOverride !== "auto") { progEl.textContent = `${len}-letter words (set by a grown-up)`; return; }
    const nextLen = len < 6 ? len+1 : null;
    if (!nextLen) { progEl.textContent = `6-letter words — top level! ${S.wbStats.solved} words solved`; return; }
    const need = WB_LENGTH_UNLOCKS[nextLen] - S.wbStats.solved;
    progEl.textContent = `${len}-letter words · solve ${need} more to unlock ${nextLen}-letter words!`;
  }

  const word = () => entry[0];
  const clue = () => entry[1];
  const expectedAt = (i) => word()[i];
  const nextEmpty = () => slots.findIndex(s=>!s);

  function newWord() {
    token.cancelled = false; soundingOut = false;
    drawNext();
    slots = Array(word().length).fill(""); mistakes = 0; startMs = Date.now();
    let letters = shuffle(word().split(""));
    if (S.wbMode === "Decoy") {
      const V = ["a","e","i","o","u"];
      const poolD = shuffle([...new Set([...word(), ...V])]);
      for (let i=0;i<2;i++){ const p = poolD.find(ch=>!letters.includes(ch)) || poolD[i%poolD.length] || "a"; letters.push(p); }
      letters = shuffle(letters);
    }
    bank = letters;
    paint(); paintProgress();
    setTimeout(()=> { if (!token.cancelled) Speech.say(word()); }, 120);
  }

  function paint() {
    clueEl.innerHTML = `<button class="clue-btn" aria-label="Say the word">${clue()}</button>`;
    clueEl.querySelector("button").onclick = ()=> Speech.say(word());
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

  /* v2 #3: speak each letter sound, then blend into the whole word */
  async function soundItOut() {
    if (soundingOut || !entry) return;
    soundingOut = true;
    const w = word();
    const btn = card.querySelector("#wbSound");
    btn.disabled = true; btn.style.opacity = 0.55;
    for (const ch of w) {
      if (token.cancelled || word() !== w) break;
      Speech.say(LETTER_SOUNDS[ch] || ch);
      Sound.pop();
      await delay(650);
    }
    if (!token.cancelled && word() === w) { await delay(150); Speech.say(w); }
    btn.disabled = false; btn.style.opacity = 1;
    soundingOut = false;
  }

  function placeFromBank(letter, bankIdx) {
    const i = nextEmpty(); if (i<0) return;
    if (S.wbMode==="Guided" && letter !== expectedAt(i)) { Sound.pop(); mistakes++; loseStar(); wrong(); return; } // star-loss kept
    slots[i] = letter; bank.splice(bankIdx,1); Sound.pop(); paint(); check();
  }
  function removeFromSlot(i) {
    if (!slots[i]) return; bank.push(slots[i]); slots[i]=""; Sound.pop();
    if (S.wbMode!=="Guided") mistakes++; paint();
  }
  function check() {
    if (slots.join("") === word()) finish(Date.now()-startMs);
  }
  function finish(elapsed) {
    const prevLen = lenForNow();
    addStar(); Sound.yay();
    cheerBig(pick(PRAISE));                              // v2 #8: word completed = milestone
    const st = S.wbStats;
    st.solved += 1; st.totalTimeMs += elapsed; st.avgTimeMs = Math.round(st.totalTimeMs/st.solved);
    st.currentStreak += 1; st.bestStreak = Math.max(st.bestStreak, st.currentStreak);
    st.totalMistakes += mistakes; st.last = { word: word(), timeMs: elapsed, mistakes };
    persist();
    /* v2 #4: announce a tier unlock the moment it happens */
    if (S.wbLenOverride === "auto" && lenForNow() > prevLen) {
      setTimeout(()=> {
        Confetti.start(180); Sound.fanfare();
        ribbon(`🔓 ${lenForNow()}-letter words unlocked!`, 2200);
        Speech.say(`Amazing! ${lenForNow()} letter words unlocked!`);
      }, 600);
      setTimeout(()=>{ if (!token.cancelled) newWord(); }, 2400);
    } else {
      setTimeout(()=>{ if (!token.cancelled) newWord(); }, 900);
    }
  }
  function hint() {
    const i = nextEmpty(); if (i<0) return;
    loseStar(); buzzHaptic(10);                          // hint price kept
    const t = expectedAt(i); const j = bank.indexOf(t);
    if (j !== -1) placeFromBank(t, j);
  }
  newWord();
}

/* ---- Memory Match (v2 #6 finale · #14 per-card updates + cleanup) ---- */
function MemoryMatch(root) {
  let cards = [], cardEls = [], first = null, lock = false, found = 0;
  let previewActive = false, info = "";
  let pairsUsed = CAMPAIGN_SEQUENCE[S.mmCampaignIdx] || 2, timer = null;
  screenCleanup = () => clearTimer();                    // v2 #14: proper teardown

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
      mk("Shuffle", ()=>{ cards = shuffle(cards); buildGrid(); }),
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
  const paintStatus = () => statusEl.textContent = statusText();
  function clearTimer(){ if (timer){ clearInterval(timer); timer=null; } }
  function startPreview() {
    clearTimer(); let secs = previewSeconds(); previewActive = true;
    const tick = () => { info = S.mmMode==="Campaign" ? `Preview: ${secs}s • Stage ${S.mmCampaignIdx+1}/7` : `Preview: ${secs}s • ${S.mmFreeDiff}`; paintStatus(); };
    tick();
    timer = setInterval(()=>{ secs-=1; if (secs<0){ clearTimer(); endPreview(); } else tick(); }, 1000);
  }
  function endPreview() {
    previewActive=false;
    cards.forEach((c,i)=>{ if(!c.matched && c.face){ c.face=false; updateCard(i); } });
    paintStatus();
  }
  function dealDeck(pairs) {
    const chosen = shuffle(EMOJIS.slice()).slice(0,pairs);
    return shuffle([...chosen,...chosen]).map((sym,i)=>({ sym, key:`c-${i}-${Math.random().toString(36).slice(2,6)}`, face:true, matched:false }));
  }
  function newBoard(keepStage=true) {
    clearTimer();
    paintTabs(); paintTools();
    let p = pairsForBoard();
    if (S.mmMode==="Campaign" && keepStage) p = CAMPAIGN_SEQUENCE[S.mmCampaignIdx % CAMPAIGN_SEQUENCE.length];
    pairsUsed = p; cards = dealDeck(p); found=0; lock=false; first=null;
    buildGrid(); setTimeout(startPreview, 60);
  }

  /* v2 #14: build the grid once per board; flips touch only the changed card */
  function buildGrid() {
    gridEl.style.setProperty("--cols", 4);
    gridEl.innerHTML = ""; cardEls = [];
    cards.forEach((c,i) => {
      const b = el("button","mm-card");
      b.onclick = ()=>flip(i);
      gridEl.appendChild(b); cardEls.push(b);
      updateCard(i);
    });
    paintStatus();
  }
  function updateCard(i) {
    const c = cards[i], b = cardEls[i];
    if (!b) return;
    b.className = "mm-card" + (c.matched?" matched":"") + (c.face?" face":"");
    b.disabled = c.matched;
    b.textContent = (c.face || c.matched) ? c.sym : "❓";
  }

  /* v2 #6: stage-7 finale */
  function campaignFinale() {
    Sound.fanfare();
    Confetti.start(240);
    ribbon("🏆 Campaign Champion — all 7 stages!", 2600);
    toast("Starting a brand-new campaign…", 2200);
    Speech.say("Campaign champion! You beat all seven stages!");
    setTimeout(()=>{ S.mmCampaignIdx = 0; persist(); newBoard(true); }, 2600);
  }

  function flip(i) {
    if (lock) return;
    if (previewActive){ clearTimer(); endPreview(); }
    const c = cards[i]; if (c.face || c.matched) return;
    Sound.pop(); c.face = true; updateCard(i);
    if (first==null){ first=i; return; }
    lock = true;
    const a = cards[first], b = cards[i], fi = first;
    setTimeout(()=>{
      if (a.sym === b.sym) {
        a.face=false; a.matched=true; b.face=false; b.matched=true;
        updateCard(fi); updateCard(i);
        found+=1;
        Sound.correct(); cheerSmall();                       // v2 #8: pair = small
        if (found >= pairsUsed) {
          addStar();
          if (S.mmMode==="Campaign") {
            const lastStage = S.mmCampaignIdx === CAMPAIGN_SEQUENCE.length - 1;
            if (lastStage) { campaignFinale(); }
            else {
              cheerBig("Board cleared! 🎉");                  // v2 #8: board = milestone
              setTimeout(()=>{ S.mmCampaignIdx=(S.mmCampaignIdx+1)%CAMPAIGN_SEQUENCE.length; persist(); newBoard(true); }, 1200);
            }
          } else {
            cheerBig("Board cleared! 🎉");
            setTimeout(()=>newBoard(false), 1200);
          }
        }
      } else {
        a.face=false; b.face=false;
        updateCard(fi); updateCard(i);
        wrong(); loseStar();                                  // star-loss kept
      }
      first=null; lock=false; paintStatus();
    }, 460);
  }
  newBoard(true);
}

/* ---- Sticker Book (v2 #7 trophy shelf) ---- */
function StickerBook(root) {
  const badge = BADGES[S.stickerTier % BADGES.length] || ("Tier "+S.stickerTier);
  const page = el("div","page");
  const card = el("div","card game-card");
  card.innerHTML = `
    <h2 class="title">Sticker Book • working on ${badge}</h2>
    <p class="subtitle">${S.stickerCount}/${MAX_STICKERS} to next badge • ${S.stickerTotal} stickers earned ever</p>
    <div class="trophy-shelf" id="shelf"></div>
    <div class="prog"><span style="width:${(S.stickerCount/MAX_STICKERS)*100}%"></span></div>
    <div class="sticker-grid" id="sg"></div>
    <div class="row-spread">
      <button class="btn btn-ghost" id="sbHome">🏠 Home</button>
      <button class="btn btn-amber" id="sbCheer">Play Cheer</button>
    </div>`;
  page.append(card, Footer()); root.appendChild(page);

  /* v2 #7: earned badges stay visible forever */
  const shelf = card.querySelector("#shelf");
  if (S.stickerTier === 0) {
    shelf.appendChild(el("p","trophy-hint","Fill the book with 100 stickers to earn your first badge! 🥉"));
  } else {
    for (let t=0; t<S.stickerTier; t++) {
      const name = BADGES[t % BADGES.length];
      const medal = BADGE_EMOJI[t % BADGE_EMOJI.length];
      shelf.appendChild(el("span","trophy",`${medal} ${name}${t >= BADGES.length ? " "+(Math.floor(t/BADGES.length)+1) : ""}`));
    }
  }

  const grid = card.querySelector("#sg");
  for (let i=0;i<MAX_STICKERS;i++) {
    const got = i < S.stickerCount;
    const cell = el("div","sticker"+(got?"":" empty"), got ? STICKER_SET[i%STICKER_SET.length] : "⋆");
    grid.appendChild(cell);
  }
  card.querySelector("#sbHome").onclick = ()=>go("home");
  card.querySelector("#sbCheer").onclick = ()=>{ cheerBig("Hooray!"); Sound.yay(); };
}

/* ---- Settings (v2 #4 word length · #9 gated reset · #10 volume) ---- */
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

  /* v2 #10: master volume */
  const volRow = el("div","set-row"); volRow.innerHTML = `<span>🔉 Volume</span>`;
  const volSlider = el("input"); volSlider.type="range"; volSlider.min="0"; volSlider.max="100"; volSlider.step="5";
  volSlider.value = Math.round(S.volume*100); volSlider.className="slider";
  volSlider.oninput = ()=>{ S.volume = Number(volSlider.value)/100; persist(); Sound.applyVolume(); };
  volSlider.onchange = ()=> Sound.correct();   // little demo chime at the new volume
  volRow.appendChild(volSlider); sl.appendChild(volRow);

  const rate = el("div","set-row"); rate.innerHTML = `<span>🐢 Speech speed</span>`;
  const slider = el("input"); slider.type="range"; slider.min="0.6"; slider.max="1.3"; slider.step="0.1"; slider.value=S.speechRate; slider.className="slider";
  slider.oninput = ()=>{ S.speechRate = Number(slider.value); persist(); };
  slider.onchange = ()=> Speech.say("Hello! Let's learn together.");
  rate.appendChild(slider); sl.appendChild(rate);

  /* v2 #4: word length override */
  const wlRow = el("div","set-col");
  wlRow.innerHTML = `<span class="set-col-label">🔤 Word Builder length</span>
    <span class="set-col-hint">Auto unlocks longer words as your child solves more (12 → 4-letter, 30 → 5-letter, 60 → 6-letter).</span>`;
  const seg = el("div","seg-row");
  ["auto","3","4","5","6"].forEach(v => {
    const b = el("button","seg-btn"+(S.wbLenOverride===v?" sel":""), v==="auto"?"Auto":v+" letters");
    b.onclick = ()=>{ S.wbLenOverride=v; persist(); [...seg.children].forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); };
    seg.appendChild(b);
  });
  wlRow.appendChild(seg); sl.appendChild(wlRow);

  /* v3: cloud account access lives here, away from little fingers */
  const cloudRow = el("div","set-row"); cloudRow.innerHTML = `<span>☁️ Account & sync</span>`;
  const cloudBtn = el("button","switch on","Open");
  cloudBtn.onclick = () => {
    const chip = document.getElementById("cloudChip");
    if (chip) chip.click();
    else toast("Cloud sync isn't set up yet");
  };
  cloudRow.appendChild(cloudBtn); sl.appendChild(cloudRow);

  const stats = S.wbStats;
  const info = el("div","set-stats");
  info.innerHTML = `<b>Your progress</b><br>
    ⭐ Stars this round: ${S.stars} · 🏅 VIP ${S.vip}<br>
    🎯 Total correct: ${S.correct} · 🟡 Stickers earned: ${S.stickerTotal} · 🏆 Badges: ${S.stickerTier}<br>
    🔤 Words solved: ${stats.solved} · 🔥 Best streak: ${stats.bestStreak}<br>
    🔢 Counting level: ${S.countSkill}/${MAX_COUNT_SKILL} (numbers up to ${Math.min(10, 2+S.countSkill)})`;
  sl.appendChild(info);

  card.querySelector("#setHome").onclick = ()=>go("home");
  card.querySelector("#setReset").onclick = gatedReset;   // v2 #9
}

function Footer() { return el("p","footer","Made with ❤️ for little learners"); }

/* ---------------- Boot ---------------- */
function unlockAudioOnce() {
  userInteracted = true;       // v2 #13
  Sound.unlock();
  if (S.musicOn) Sound.startMusic();
  Speech.flushPending();       // v2 #13: speak any prompt queued before first tap
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
Mascot.ensure();
setTimeout(() => Mascot.hello(), 700);

/* ---------------- Cloud sync (optional account) ---------------- */
if (window.Cloud) Cloud.init("howmany", {
  collect: () => ({
    stars:S.stars, correct:S.correct, vip:S.vip,
    stickerCount:S.stickerCount, stickerTier:S.stickerTier, stickerTotal:S.stickerTotal,
    soundOn:S.soundOn, musicOn:S.musicOn, speechOn:S.speechOn, speechRate:S.speechRate,
    volume:S.volume, countSkill:S.countSkill,
    wbMode:S.wbMode, wbLenOverride:S.wbLenOverride, wbStats:S.wbStats,
    mmMode:S.mmMode, mmFreeDiff:S.mmFreeDiff, mmCampaignIdx:S.mmCampaignIdx,
  }),
  apply: (st) => {
    const KEYS = ["stars","correct","vip","stickerCount","stickerTier","stickerTotal",
      "soundOn","musicOn","speechOn","speechRate","volume","countSkill",
      "wbMode","wbLenOverride","wbStats","mmMode","mmFreeDiff","mmCampaignIdx"];
    for (const k of KEYS) if (st[k] !== undefined) S[k] = st[k];
    S.volume = Math.min(1, Math.max(0, Number(S.volume) || 0.8));
    S.countSkill = Math.min(MAX_COUNT_SKILL, Math.max(1, Number(S.countSkill) || 1));
    persist(); Sound.applyVolume(); render();
  },
});
