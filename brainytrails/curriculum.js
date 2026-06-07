/* =====================================================================
   Brainy Trails · curriculum.js — pure data + question generators.
   NO DOM access in this file: it is unit-tested headlessly in Node.
   Every skill is a parametric generator:
     gen(d) → { format, prompt, say, visual, hint, steps[], ...formatFields }
   d ∈ [0,1] difficulty. Formats:
     choice : { choices:[{label, correct}] }            (exactly one correct)
     keypad : { answer:Number }                          (numeric entry)
     order  : { items:[Number], correct:[Number] }       (tap in order)
     tap    : { items:[{label, correct}] }               (tap the target)
     tf     : { answer:Boolean, statement }              (true / false)
   ===================================================================== */
const BT = (() => {
  "use strict";

  /* ---------- tiny random helpers ---------- */
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[ri(0, arr.length - 1)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rep = (e, n) => Array(n).fill(e).join(" ");
  const lerp = (a, b, d) => Math.round(a + (b - a) * d);

  /* widely-supported emoji only */
  const CRITTERS = ["🐞", "🐠", "🦆", "🐢", "🐸", "🐝"];
  const FRUITS = ["🍎", "🍌", "🍓", "🍊"];

  /* unique numeric distractors near the answer, within [lo,hi] */
  function nearby(ans, count, lo, hi) {
    const out = new Set();
    let span = 1;
    while (out.size < count && span < 50) {
      for (const c of [ans - span, ans + span, ans - span - 1, ans + span + 1]) {
        if (out.size < count && c >= lo && c <= hi && c !== ans) out.add(c);
      }
      span += 2;
    }
    let f = lo;
    while (out.size < count) { if (f !== ans && !out.has(f)) out.add(f); f++; }
    return [...out].slice(0, count);
  }
  const numChoices = (ans, lo, hi, n = 3) =>
    shuffle([{ label: String(ans), correct: true },
      ...nearby(ans, n - 1, lo, hi).map(v => ({ label: String(v), correct: false }))]);

  /* ===================== SKILLS ===================== */
  const SKILLS = {

    /* ---------- Island 1 · Sprout Isle ---------- */
    "count.to10": {
      name: "Counting Critters", icon: "🐞", island: "sprout", unit: "count", prereqs: [],
      gen(d) {
        const max = lerp(4, 10, d), n = ri(1, max), e = pick(CRITTERS);
        return {
          format: "choice",
          prompt: "How many are there?",
          say: "How many can you count?",
          visual: rep(e, n),
          choices: numChoices(n, 1, 10),
          hint: "Touch each one as you count!",
          steps: ["Point to each " + e + " one at a time.", "Count out loud: 1, 2, 3…", "The last number you say is how many there are!"],
        };
      },
    },

    "count.compare": {
      name: "More or Less", icon: "⚖️", island: "sprout", unit: "count", prereqs: ["count.to10"],
      gen(d) {
        const max = lerp(5, 9, d);
        let a = ri(1, max), b = ri(1, max);
        while (b === a) b = ri(1, max);
        const [e1, e2] = shuffle(FRUITS).slice(0, 2);
        const wantMore = Math.random() < 0.5;
        const aWins = wantMore ? a > b : a < b;
        return {
          format: "choice",
          prompt: `Which group has ${wantMore ? "MORE" : "FEWER"}?`,
          say: `Which group has ${wantMore ? "more" : "fewer"}?`,
          visual: rep(e1, a) + "\n" + rep(e2, b),
          choices: shuffle([
            { label: `${e1} group`, correct: aWins },
            { label: `${e2} group`, correct: !aWins },
          ]),
          hint: "Match them up in pairs — who has spares?",
          steps: ["Pair one " + e1 + " with one " + e2 + ".", "Keep pairing until one group runs out.", "The group with extras left over has more!"],
        };
      },
    },

    "count.order": {
      name: "Number Train", icon: "🚂", island: "sprout", unit: "count", prereqs: ["count.to10"],
      gen(d) {
        const k = d > 0.5 ? 4 : 3, hi = lerp(8, 20, d);
        const set = new Set();
        while (set.size < k) set.add(ri(1, hi));
        const correct = [...set].sort((x, y) => x - y);
        return {
          format: "order",
          prompt: "Tap the numbers from smallest to biggest!",
          say: "Tap the numbers from smallest to biggest.",
          visual: null,
          items: shuffle(correct),
          correct,
          hint: "Find the tiniest number first.",
          steps: ["Look for the smallest number — tap it first.", "Then find the next smallest.", "Keep going until the train is full!"],
        };
      },
    },

    "shape.names2d": {
      name: "Shape Spotter", icon: "🔷", island: "sprout", unit: "shape", prereqs: [],
      gen(d) {
        const SHAPES = [["circle", "⚫"], ["square", "🟦"], ["triangle", "🔺"], ["star", "⭐"], ["heart", "❤️"], ["diamond", "🔶"]];
        const n = d > 0.5 ? 4 : 3;
        const opts = shuffle(SHAPES).slice(0, n);
        const target = pick(opts);
        return {
          format: "choice",
          prompt: `Which one is the ${target[0].toUpperCase()}?`,
          say: `Which one is the ${target[0]}?`,
          visual: null,
          choices: shuffle(opts.map(s => ({ label: s[1], correct: s[0] === target[0] }))),
          hint: target[0] === "triangle" ? "It has 3 pointy corners!" : target[0] === "square" ? "It has 4 sides all the same!" : "Look carefully at the sides and corners.",
          steps: ["Say each shape's name as you look at it.", `A ${target[0]} looks like ${target[1]}.`, "Tap it when you spot it!"],
        };
      },
    },

    "shape.tap": {
      name: "Shape Hunt", icon: "🔍", island: "sprout", unit: "shape", prereqs: ["shape.names2d"],
      gen(d) {
        const SHAPES = [["circle", "⚫"], ["square", "🟦"], ["triangle", "🔺"], ["star", "⭐"], ["heart", "❤️"], ["diamond", "🔶"]];
        const n = lerp(4, 6, d);
        const opts = shuffle(SHAPES);
        const target = opts[0];
        const items = [{ label: target[1], correct: true }];
        for (let i = 1; i < n; i++) items.push({ label: opts[1 + ((i - 1) % (opts.length - 1))][1], correct: false });
        return {
          format: "tap",
          prompt: `Tap the ${target[0].toUpperCase()}!`,
          say: `Tap the ${target[0]}!`,
          visual: null,
          items: shuffle(items),
          hint: "Take your time — only one is right.",
          steps: [`A ${target[0]} looks like ${target[1]}.`, "Check each shape one by one.", "Tap the one that matches!"],
        };
      },
    },

    "pattern.next": {
      name: "Pattern Magic", icon: "🎨", island: "sprout", unit: "pattern", prereqs: [],
      gen(d) {
        const [A, B, C] = shuffle(["🍎", "🍌", "⭐", "🐸", "🎈", "⚽"]).slice(0, 3);
        const kind = d < 0.4 ? "AB" : pick(["AB", "AAB", "ABB"]);
        const unit = kind === "AB" ? [A, B] : kind === "AAB" ? [A, A, B] : [A, B, B];
        const seq = [];
        while (seq.length < 6) seq.push(unit[seq.length % unit.length]);
        const next = unit[seq.length % unit.length];
        const wrong = next === A ? B : A;
        const choices = [{ label: next, correct: true }, { label: wrong, correct: false }];
        if (d > 0.6) choices.push({ label: C, correct: false });
        return {
          format: "choice",
          prompt: "What comes next?",
          say: "Look at the pattern. What comes next?",
          visual: seq.join(" ") + " ❓",
          choices: shuffle(choices),
          hint: "Read the pattern out loud and feel the beat!",
          steps: ["Say the pattern out loud: " + seq.join(", ") + "…", "Hear how it repeats?", "Say it once more and the next one pops out!"],
        };
      },
    },

    /* ---------- Island 2 · Bridge Bay ---------- */
    "add.to10": {
      name: "Adding Acorns", icon: "🌰", island: "bridge", unit: "bonds", prereqs: ["count.to10"],
      gen(d) {
        const a = ri(1, lerp(3, 8, d)), b = ri(1, Math.max(1, Math.min(9, 10 - a)));
        return {
          format: "keypad",
          prompt: `${a} + ${b} = ?`,
          say: `What is ${a} plus ${b}?`,
          visual: rep("🌰", a) + "  ➕  " + rep("🌰", b),
          answer: a + b,
          hint: `Start at ${a} and count on ${b} more.`,
          steps: [`Hold ${a} in your head.`, `Count on: ${Array.from({ length: b }, (_, i) => a + i + 1).join(", ")}.`, `So ${a} + ${b} = ${a + b}!`],
        };
      },
    },

    "add.bonds10": {
      name: "Make Ten", icon: "🔟", island: "bridge", unit: "bonds", prereqs: ["add.to10"],
      gen(d) {
        const a = d < 0.4 ? pick([1, 2, 5, 8, 9]) : ri(1, 9);
        return {
          format: "keypad",
          prompt: `${a} + ❓ = 10`,
          say: `${a} plus what makes ten?`,
          visual: rep("🟣", a) + "  " + rep("⚪", 10 - a),
          answer: 10 - a,
          hint: `You have ${a} — how many more to reach 10?`,
          steps: [`Show ${a} fingers.`, "Count the fingers still down.", `${a} and ${10 - a} are best friends — they make 10!`],
        };
      },
    },

    "sub.to10": {
      name: "Take-Away Treats", icon: "🍪", island: "bridge", unit: "bonds", prereqs: ["add.to10"],
      gen(d) {
        const a = ri(3, lerp(6, 10, d)), b = ri(1, a - 1);
        return {
          format: "keypad",
          prompt: `${a} − ${b} = ?`,
          say: `What is ${a} take away ${b}?`,
          visual: rep("🍪", a - b) + " " + rep("❌", b),
          answer: a - b,
          hint: `Start at ${a} and count back ${b}.`,
          steps: [`Start with ${a} cookies.`, `${b} get munched — count back: ${Array.from({ length: b }, (_, i) => a - i - 1).join(", ")}.`, `${a} take away ${b} leaves ${a - b}!`],
        };
      },
    },

    "pv.tensones": {
      name: "Tens & Ones", icon: "🧱", island: "bridge", unit: "place", prereqs: ["count.to10"],
      gen(d) {
        const t = ri(1, lerp(3, 9, d)), o = ri(0, 9);
        return {
          format: "keypad",
          prompt: `${t} tens and ${o} ones make…?`,
          say: `${t} tens and ${o} ones make what number?`,
          visual: rep("📦", t) + (o ? "  " + rep("🔹", o) : ""),
          answer: t * 10 + o,
          hint: "Each 📦 is worth ten. Each 🔹 is worth one.",
          steps: [`Count the tens: ${Array.from({ length: t }, (_, i) => (i + 1) * 10).join(", ")}.`, `Now add the ${o} ones.`, `${t * 10} and ${o} make ${t * 10 + o}!`],
        };
      },
    },

    "numline.leap": {
      name: "Number Line Leap", icon: "🐸", island: "bridge", unit: "place", prereqs: ["count.order", "add.to10"],
      gen(d) {
        const start = ri(0, lerp(8, 14, d));
        const hop = ri(1, lerp(3, 5, d));
        const ans = start + hop;
        const lo = Math.max(0, ans - ri(1, 3));
        const items = Array.from({ length: 6 }, (_, i) => ({ label: String(lo + i), correct: lo + i === ans }));
        return {
          format: "tap",
          prompt: `The frog is on ${start}. It hops ${hop} forward. Tap where it lands!`,
          say: `The frog is on ${start} and hops ${hop} forward. Where does it land?`,
          visual: "🐸",
          items,
          numberline: true,
          hint: `Start at ${start} and hop: ${Array.from({ length: hop }, (_, i) => start + i + 1).join(", ")}!`,
          steps: [`Put your finger on ${start}.`, `Hop forward ${hop} times, counting each hop.`, `You land on ${ans}!`],
        };
      },
    },

    "tf.numfacts": {
      name: "True or False Tower", icon: "🏰", island: "bridge", unit: "truth", prereqs: ["add.to10"],
      gen(d) {
        const hi = lerp(10, 20, d);
        const a = ri(1, hi - 1), b = ri(1, hi - a);
        const truth = Math.random() < 0.5;
        const shown = truth ? a + b : a + b + pick([-2, -1, 1, 2]);
        const ok = shown === a + b;
        return {
          format: "tf",
          prompt: `${a} + ${b} = ${shown}`,
          say: `True or false: ${a} plus ${b} equals ${shown}?`,
          visual: null,
          answer: ok,
          hint: `Work out ${a} + ${b} on your fingers first.`,
          steps: [`Add it yourself: ${a} + ${b} = ${a + b}.`, `The tower says ${shown}.`, ok ? "They match — it's TRUE!" : `${a + b} is not ${shown} — it's FALSE!`],
        };
      },
    },
  };

  /* ===================== MAP ===================== */
  const ISLANDS = [
    {
      id: "sprout", name: "Sprout Isle", emoji: "🌱",
      units: [
        { id: "count", name: "Counting Cove", skills: ["count.to10", "count.compare", "count.order"] },
        { id: "shape", name: "Shape Shore", skills: ["shape.names2d", "shape.tap"] },
        { id: "pattern", name: "Pattern Path", skills: ["pattern.next"] },
      ],
    },
    {
      id: "bridge", name: "Bridge Bay", emoji: "🌉",
      units: [
        { id: "bonds", name: "Number Bonds", skills: ["add.to10", "add.bonds10", "sub.to10"] },
        { id: "place", name: "Place Value Pier", skills: ["pv.tensones", "numline.leap"] },
        { id: "truth", name: "Truth Tower", skills: ["tf.numfacts"] },
      ],
    },
  ];

  return { ISLANDS, SKILLS };
})();

if (typeof window !== "undefined") window.BT = BT;
if (typeof module !== "undefined" && module.exports) module.exports = BT;
