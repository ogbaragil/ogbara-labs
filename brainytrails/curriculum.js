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
  const numChoices = (ans, lo, hi, n = 4) =>
    shuffle([{ label: String(ans), correct: true },
      ...nearby(ans, n - 1, lo, hi).map(v => ({ label: String(v), correct: false }))]);

  /* exactly 4 pills: the answer + up to 3 distinct distractors (first-come from cands) */
  const fourChoices = (right, cands) => {
    const seen = new Set([String(right)]);
    const out = [{ label: String(right), correct: true }];
    for (const c of cands) { const s = String(c); if (out.length < 4 && !seen.has(s)) { seen.add(s); out.push({ label: s, correct: false }); } }
    return shuffle(out);
  };

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
        const opts = shuffle(SHAPES).slice(0, 4);
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
        const D = shuffle(["🍎", "🍌", "⭐", "🐸", "🎈", "⚽"]).find(x => x !== A && x !== B && x !== C);
        const choices = [{ label: next, correct: true },
          ...[A, B, C, D].filter(x => x !== next).slice(0, 3).map(x => ({ label: x, correct: false }))];
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
          visual: null,
          pic: { kind: "blocks", tens: t, ones: o },
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

    /* ---------- Island 1 additions ---------- */
    "count.to20": {
      name: "Big Counting", icon: "🔢", island: "sprout", unit: "count", prereqs: ["count.to10"],
      gen(d) {
        const n = ri(lerp(10, 13, d), lerp(15, 19, d));
        const after = Math.random() < 0.5;
        return {
          format: "keypad",
          prompt: `What number comes right ${after ? "AFTER" : "BEFORE"} ${n}?`,
          say: `What number comes right ${after ? "after" : "before"} ${n}?`,
          visual: null,
          answer: after ? n + 1 : n - 1,
          hint: `Count ${after ? "up" : "back"} from ${n} by one.`,
          steps: [`Say ${n} out loud.`, after ? "Take one step up the number ladder." : "Take one step down the number ladder.", `${after ? n + 1 : n - 1} is the answer!`],
        };
      },
    },
    "pos.ordinal": {
      name: "Line Leaders", icon: "🚶", island: "sprout", unit: "count", prereqs: ["count.to10"],
      gen(d) {
        const ANIMALS = shuffle(["🦁", "🐰", "🐢", "🦊", "🐧", "🐮"]).slice(0, 4);
        const ORD = ["1st", "2nd", "3rd", "4th", "5th"];
        const k = ri(0, ANIMALS.length - 1);
        return {
          format: "choice",
          prompt: `Who is ${ORD[k]} in line?`,
          say: `The line starts on the left. Who is ${ORD[k]} in line?`,
          visual: "👉 " + ANIMALS.join(" "),
          choices: shuffle(ANIMALS.map((a, i) => ({ label: a, correct: i === k }))),
          hint: "Start counting from the pointing finger!",
          steps: ["The line starts at 👉.", `Count along: ${ORD.slice(0, k + 1).join(", ")}.`, `That's the ${ORD[k]} one!`],
        };
      },
    },

    /* ---------- Island 2 additions ---------- */
    "time.oclock": {
      name: "Clock Climb", icon: "🕒", island: "bridge", unit: "timemoney", prereqs: ["count.to10"],
      gen(d) {
        const h = ri(1, 12);
        const half = d > 0.45 && Math.random() < 0.5;
        const CLOCKS_O = ["🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙","🕚","🕛"];
        const CLOCKS_H = ["🕜","🕝","🕞","🕟","🕠","🕡","🕢","🕣","🕤","🕥","🕦","🕧"];
        const face = half ? CLOCKS_H[h - 1] : CLOCKS_O[h - 1];
        const right = half ? `half past ${h}` : `${h} o'clock`;
        const wrongs = new Set();
        while (wrongs.size < 3) {
          const wh = ri(1, 12);
          const w = Math.random() < 0.5 ? `${wh} o'clock` : `half past ${wh}`;
          if (w !== right) wrongs.add(w);
        }
        return {
          format: "choice",
          prompt: "What time is it?",
          say: "Look at the clock. What time is it?",
          visual: null,
          pic: { kind: "clock", h, half },
          choices: shuffle([{ label: right, correct: true }, ...[...wrongs].map(w => ({ label: w, correct: false }))]),
          hint: half ? "The long hand points straight down for half past." : "The long hand points straight up for o'clock.",
          steps: ["The short hand tells the hour.", half ? "The long hand at the bottom means half past." : "The long hand at the top means o'clock.", `So it's ${right}!`],
        };
      },
    },
    "money.aud": {
      name: "Coin Cove", icon: "🪙", island: "bridge", unit: "timemoney", prereqs: ["add.to10"],
      gen(d) {
        const COINS = [5, 10, 20, 50];
        const n = d > 0.5 ? 3 : 2;
        const picks = Array.from({ length: n }, () => pick(COINS));
        const sum = picks.reduce((a, b) => a + b, 0);
        return {
          format: "keypad",
          prompt: `${picks.map(c => c + "c").join(" + ")} = ❓ cents`,
          say: `How many cents is ${picks.map(c => c + " cents").join(" plus ")}?`,
          visual: null,
          pic: { kind: "coins", values: picks },
          answer: sum,
          hint: "Add the biggest coin first!",
          steps: [`Start with the biggest: ${Math.max(...picks)}c.`, "Count on the others one at a time.", `All together that's ${sum} cents!`],
        };
      },
    },
    "double.halve": {
      name: "Double Trouble", icon: "👯", island: "bridge", unit: "bonds", prereqs: ["add.to10"],
      gen(d) {
        const dbl = Math.random() < 0.5;
        if (dbl) {
          const n = ri(2, lerp(6, 12, d));
          return { format: "keypad", prompt: `Double ${n} = ?`, say: `What is double ${n}?`, visual: null, answer: n * 2,
            hint: `Double means ${n} + ${n}.`, steps: [`Double means two lots of ${n}.`, `${n} + ${n}…`, `…makes ${n * 2}!`] };
        }
        const h = ri(2, lerp(6, 12, d));
        return { format: "keypad", prompt: `Half of ${h * 2} = ?`, say: `What is half of ${h * 2}?`, visual: null, answer: h,
          hint: `Split ${h * 2} into two equal teams.`, steps: [`Share ${h * 2} into two equal groups.`, "Deal them out one each, one each…", `Each group gets ${h}!`] };
      },
    },
    "count.back": {
      name: "Rocket Count-Back", icon: "🚀", island: "bridge", unit: "bonds", prereqs: ["count.order"],
      gen(d) {
        const k = d > 0.5 ? 4 : 3, hi = lerp(10, 20, d);
        const set = new Set();
        while (set.size < k) set.add(ri(1, hi));
        const correct = [...set].sort((a, b) => b - a);
        return {
          format: "order",
          prompt: "Countdown! Tap from BIGGEST to smallest!",
          say: "Tap the numbers from biggest to smallest, like a rocket countdown.",
          visual: "🚀",
          items: shuffle(correct), correct,
          hint: "Find the biggest number first — that starts the countdown.",
          steps: ["A countdown starts at the biggest number.", "Tap it, then the next biggest.", "Blast off at the smallest!"],
        };
      },
    },

    /* ---------- Island 3 · Cascade Cliffs ---------- */
    "add.to100": {
      name: "Hundred Hop", icon: "🦘", island: "cascade", unit: "hundreds", prereqs: ["add.bonds10", "pv.tensones"],
      gen(d) {
        const a = ri(11, lerp(40, 85, d)), b = ri(lerp(3, 10, d), lerp(9, 40, d));
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, visual: null, answer: a + b,
          hint: "Add the tens first, then the ones.",
          steps: [`Tens first: ${Math.floor(a / 10) * 10} + ${Math.floor(b / 10) * 10} = ${Math.floor(a / 10) * 10 + Math.floor(b / 10) * 10}.`, `Ones next: ${a % 10} + ${b % 10} = ${a % 10 + b % 10}.`, `Put them together: ${a + b}!`] };
      },
    },
    "sub.to100": {
      name: "Cliff Drop", icon: "🧗", island: "cascade", unit: "hundreds", prereqs: ["sub.to10", "pv.tensones"],
      gen(d) {
        const a = ri(lerp(20, 50, d), lerp(50, 99, d)), b = ri(lerp(2, 11, d), a - 10);
        return { format: "keypad", prompt: `${a} − ${b} = ?`, say: `What is ${a} take away ${b}?`, visual: null, answer: a - b,
          hint: `Count back to a friendly ten, then keep going.`,
          steps: [`Take away the tens: ${a} − ${Math.floor(b / 10) * 10} = ${a - Math.floor(b / 10) * 10}.`, `Now take away the ones: ${b % 10} more.`, `You land on ${a - b}!`] };
      },
    },
    "missing.addend": {
      name: "Mystery Number", icon: "🕵️", island: "cascade", unit: "hundreds", prereqs: ["add.to100"],
      gen(d) {
        const a = ri(lerp(5, 20, d), lerp(30, 60, d)), total = a + ri(lerp(3, 10, d), lerp(20, 40, d));
        return { format: "keypad", prompt: `${a} + ❓ = ${total}`, say: `${a} plus what makes ${total}?`, visual: null, answer: total - a,
          hint: `Think: how far is it from ${a} up to ${total}?`,
          steps: [`The mystery number is the jump from ${a} to ${total}.`, `Jump to the next ten, then count the rest.`, `The jump is ${total - a}!`] };
      },
    },
    "skip.count": {
      name: "Skip Stones", icon: "🪨", island: "cascade", unit: "skipstack", prereqs: ["count.to20"],
      gen(d) {
        const step = d < 0.5 ? pick([2, 5, 10]) : pick([2, 3, 4, 5, 10]);
        const start = step * ri(1, 3);
        const seq = Array.from({ length: 4 }, (_, i) => start + i * step);
        const ans = start + 4 * step;
        return { format: "choice", prompt: "What number comes next?",
          say: `Skip counting! ${seq.join(", ")} — what comes next?`,
          visual: seq.join(", ") + ", ❓",
          choices: numChoices(ans, Math.max(1, ans - step * 2), ans + step * 2),
          hint: `The jumps go up by ${step} each time.`,
          steps: [`Look at the jumps: each one adds ${step}.`, `Last stone was ${seq[3]}.`, `${seq[3]} + ${step} = ${ans}!`] };
      },
    },
    "arrays.intro": {
      name: "Array Bay", icon: "🧇", island: "cascade", unit: "skipstack", prereqs: ["skip.count"],
      gen(d) {
        const r = ri(2, lerp(3, 5, d)), c = ri(2, lerp(4, 5, d)), e = pick(["🍪", "🧁", "🍓"]);
        return { format: "keypad", prompt: `${r} rows of ${c} — how many in all?`,
          say: `There are ${r} rows with ${c} in each row. How many altogether?`,
          visual: Array(r).fill(rep(e, c)).join("\n"),
          answer: r * c,
          hint: `Count one row, then skip count ${r} times.`,
          steps: [`One row has ${c}.`, `Skip count by ${c}: ${Array.from({ length: r }, (_, i) => (i + 1) * c).join(", ")}.`, `${r} rows of ${c} makes ${r * c}!`] };
      },
    },
    "measure.pick": {
      name: "Measure Meadow", icon: "📏", island: "cascade", unit: "measure", prereqs: ["count.to20"],
      gen() {
        const THINGS = [["an ant", "mm"], ["a pencil", "cm"], ["a door", "m"], ["a swimming pool", "m"], ["a road trip", "km"], ["your finger", "cm"], ["a football field", "m"], ["the way to another city", "km"]];
        const [thing, unit] = pick(THINGS);
        const units = ["mm", "cm", "m", "km"];
        return { format: "choice", prompt: `Best unit to measure ${thing}?`,
          say: `Which unit would you use to measure ${thing}?`,
          visual: null,
          choices: shuffle(units.map(u => ({ label: u, correct: u === unit }))).slice(0, 4).some(c => c.correct)
            ? shuffle(units.map(u => ({ label: u, correct: u === unit })))
            : shuffle(units.map(u => ({ label: u, correct: u === unit }))),
          hint: "mm is tiny, cm is hand-sized, m is room-sized, km is for journeys.",
          steps: ["mm = tiny things, cm = things you can hold.", "m = rooms and buildings, km = long journeys.", `So ${thing} is measured in ${unit}!`] };
      },
    },
    "measure.compare": {
      name: "Longer or Shorter", icon: "🦒", island: "cascade", unit: "measure", prereqs: ["pv.tensones"],
      gen(d) {
        const m = ri(1, lerp(2, 4, d));
        const cm = ri(1, 3) * 50 + (Math.random() < 0.5 ? 0 : 50);
        const truthy = m * 100 > cm;
        const claim = Math.random() < 0.5;
        return { format: "tf",
          prompt: `${m} m is ${claim ? "longer" : "shorter"} than ${cm} cm`,
          say: `True or false: ${m} metres is ${claim ? "longer" : "shorter"} than ${cm} centimetres?`,
          visual: null,
          pic: { kind: "compare", a: { label: m + " m", len: m * 100 }, b: { label: cm + " cm", len: cm } },
          answer: claim ? truthy : !truthy,
          hint: "1 metre is 100 centimetres.",
          steps: [`Change metres to centimetres: ${m} m = ${m * 100} cm.`, `Compare ${m * 100} cm with ${cm} cm.`, `${m * 100} is ${truthy ? "bigger" : "smaller"}, so the claim is ${(claim ? truthy : !truthy) ? "TRUE" : "FALSE"}!`] };
      },
    },
    "frac.intro": {
      name: "Pizza Party", icon: "🍕", island: "cascade", unit: "fractions", prereqs: ["shape.names2d"],
      gen(d) {
        const n = pick(d < 0.5 ? [2, 4] : [2, 3, 4, 8]);
        const k = ri(1, n - 1);
        const right = `${k}/${n}`;
        const wrongSet = [`${n}/${k}`, `${k}/${n + 1}`, `${k + 1}/${n}`, `${k}/${Math.max(2, n - 1)}`, `${k + 1}/${n + 1}`];
        return { format: "choice",
          prompt: `A pizza is cut into ${n} equal slices. You eat ${k}. What fraction did you eat?`,
          say: `A pizza is cut into ${n} equal slices and you eat ${k}. What fraction is that?`,
          visual: null,
          pic: { kind: "pie", n, k },
          choices: fourChoices(right, wrongSet),
          hint: "Slices you ate on top, total slices on the bottom.",
          steps: [`The bottom number is ALL the slices: ${n}.`, `The top number is what you ate: ${k}.`, `So it's ${right}!`] };
      },
    },
    "frac.ofnum": {
      name: "Fraction Snatch", icon: "🫳", island: "cascade", unit: "fractions", prereqs: ["frac.intro", "double.halve"],
      gen(d) {
        const den = pick(d < 0.5 ? [2, 4] : [2, 3, 4, 5, 10]);
        const ans = ri(2, lerp(5, 10, d));
        const n = den * ans;
        const NAME = { 2: "Half", 3: "A third", 4: "A quarter", 5: "A fifth", 10: "A tenth" };
        return { format: "keypad", prompt: `${NAME[den]} of ${n} = ?`,
          say: `What is ${NAME[den].toLowerCase()} of ${n}?`, visual: null, answer: ans,
          hint: `Share ${n} into ${den} equal groups.`,
          steps: [`${NAME[den]} means split into ${den} equal groups.`, `${n} shared into ${den} groups…`, `…is ${ans} each!`] };
      },
    },
    "odd.even": {
      name: "Odd Sock", icon: "🧦", island: "cascade", unit: "skipstack", prereqs: ["skip.count"],
      gen(d) {
        const n = ri(2, lerp(30, 99, d));
        const sayEven = Math.random() < 0.5;
        return { format: "tf", prompt: `${n} is an ${sayEven ? "EVEN" : "ODD"} number`,
          say: `True or false: ${n} is an ${sayEven ? "even" : "odd"} number?`,
          visual: null,
          answer: sayEven === (n % 2 === 0),
          hint: "Even numbers end in 0, 2, 4, 6 or 8.",
          steps: [`Look only at the last digit: ${n % 10}.`, `${n % 10} is ${n % 2 === 0 ? "even" : "odd"}.`, `So ${n} is ${n % 2 === 0 ? "even" : "odd"} — the claim is ${(sayEven === (n % 2 === 0)) ? "TRUE" : "FALSE"}!`] };
      },
    },

    /* ---------- Island 4 · Ember Plains ---------- */
    "mult.easy": {
      name: "Times Sprout", icon: "🌿", island: "ember", unit: "times", prereqs: ["arrays.intro", "skip.count"],
      gen(d) { const t = pick([2, 5, 10]), a = ri(1, lerp(6, 10, d));
        return tableQ(t, a); },
    },
    "mult.mid": {
      name: "Times Grower", icon: "🌻", island: "ember", unit: "times", prereqs: ["mult.easy"],
      gen(d) { const t = pick([3, 4, 6]), a = ri(2, lerp(6, 10, d));
        return tableQ(t, a); },
    },
    "mult.hard": {
      name: "Times Master", icon: "🌳", island: "ember", unit: "times", prereqs: ["mult.mid"],
      gen(d) { const t = pick([7, 8, 9]), a = ri(2, lerp(6, 12, d));
        return tableQ(t, a); },
    },
    "mult.missing": {
      name: "Missing Factor", icon: "🧩", island: "ember", unit: "times", prereqs: ["mult.mid"],
      gen(d) {
        const t = pick(d < 0.5 ? [2, 3, 4, 5] : [3, 4, 6, 7, 8]), a = ri(2, lerp(6, 10, d));
        return { format: "keypad", prompt: `❓ × ${t} = ${a * t}`, say: `What times ${t} makes ${a * t}?`, visual: null, answer: a,
          hint: `Count by ${t}s up to ${a * t}.`,
          steps: [`Skip count by ${t}: ${Array.from({ length: a }, (_, i) => (i + 1) * t).join(", ")}.`, `That took ${a} jumps.`, `So ${a} × ${t} = ${a * t}!`] };
      },
    },
    "div.facts": {
      name: "Fair Shares", icon: "➗", island: "ember", unit: "sharing", prereqs: ["mult.easy"],
      gen(d) {
        const k = pick(d < 0.5 ? [2, 5, 10] : [2, 3, 4, 5, 6, 10]), q = ri(2, lerp(6, 10, d));
        return { format: "keypad", prompt: `${k * q} ÷ ${k} = ?`, say: `What is ${k * q} divided by ${k}?`, visual: null, answer: q,
          hint: `Think: how many ${k}s make ${k * q}?`,
          steps: [`Division is the times table backwards.`, `❓ × ${k} = ${k * q}…`, `…and that's ${q}!`] };
      },
    },
    "div.share": {
      name: "Sharing Shed", icon: "🍓", island: "ember", unit: "sharing", prereqs: ["div.facts"],
      gen(d) {
        const k = ri(2, lerp(4, 6, d)), each = ri(2, lerp(5, 9, d)), n = k * each;
        return { format: "keypad",
          prompt: `${n} strawberries shared between ${k} friends. How many each?`,
          say: `${n} strawberries are shared fairly between ${k} friends. How many does each friend get?`,
          visual: "🍓", answer: each,
          hint: `Deal them out: one each, one each…`,
          steps: [`Sharing fairly means dividing.`, `${n} ÷ ${k} = ?`, `Each friend gets ${each}!`] };
      },
    },
    "frac.equiv": {
      name: "Twin Fractions", icon: "👯‍♀️", island: "ember", unit: "fracforge", prereqs: ["frac.intro"],
      gen(d) {
        const base = pick(d < 0.5 ? [[1, 2], [1, 4]] : [[1, 2], [1, 3], [1, 4], [3, 4], [2, 3]]);
        const m = ri(2, 4);
        const right = `${base[0] * m}/${base[1] * m}`;
        const t = base[0] * m, bb = base[1] * m;
        const wrongs = [`${t + 1}/${bb}`, `${t}/${bb + 1}`, `${t}/${bb - 1}`, `${t + 2}/${bb}`, `${t}/${bb + 2}`];
        return { format: "choice", prompt: `Which equals ${base[0]}/${base[1]}?`,
          say: `Which fraction is the same as ${base[0]} over ${base[1]}?`,
          visual: null,
          pic: { kind: "pie", n: base[1], k: base[0] },
          choices: fourChoices(right, wrongs),
          hint: "Multiply the top AND bottom by the same number.",
          steps: [`Multiply top and bottom of ${base[0]}/${base[1]} by ${m}.`, `Top: ${base[0]} × ${m} = ${base[0] * m}. Bottom: ${base[1]} × ${m} = ${base[1] * m}.`, `So ${base[0]}/${base[1]} = ${right} — twins!`] };
      },
    },
    "frac.line": {
      name: "Fraction Leap", icon: "🦗", island: "ember", unit: "fracforge", prereqs: ["frac.intro", "numline.leap"],
      gen(d) {
        const fam = d < 0.5 ? ["0", "1/4", "1/2", "3/4", "1"] : pick([["0", "1/4", "1/2", "3/4", "1"], ["0", "1/3", "2/3", "1"]]);
        const ti = ri(1, fam.length - 2);
        return { format: "tap", prompt: `Tap ${fam[ti]} on the line!`,
          say: `Find ${fam[ti].replace("/", " over ")} on the number line.`,
          visual: "🦗", numberline: true,
          items: fam.map((f, i) => ({ label: f, correct: i === ti })),
          hint: "0 is the start, 1 is the end — fractions live between.",
          steps: ["The line goes from 0 to 1.", `Count the equal jumps.`, `${fam[ti]} is jump number ${ti}!`] };
      },
    },
    "peri.rect": {
      name: "Fence It", icon: "🚧", island: "ember", unit: "sizer", prereqs: ["add.to100"],
      gen(d) {
        const l = ri(2, lerp(6, 12, d)), w = ri(1, l - 1);
        return { format: "keypad", prompt: `A rectangle is ${l} long and ${w} wide. Perimeter?`,
          say: `A rectangle is ${l} long and ${w} wide. What is its perimeter?`,
          visual: null,
          pic: { kind: "rect", l, w }, answer: 2 * (l + w),
          hint: "Perimeter = all the way around the outside.",
          steps: [`Add length and width: ${l} + ${w} = ${l + w}.`, "That's only halfway around — double it.", `${l + w} × 2 = ${2 * (l + w)}!`] };
      },
    },
    "area.rect": {
      name: "Tile It", icon: "🟫", island: "ember", unit: "sizer", prereqs: ["mult.easy"],
      gen(d) {
        const l = ri(2, lerp(6, 12, d)), w = ri(2, lerp(5, 9, d));
        return { format: "keypad", prompt: `A rectangle is ${l} long and ${w} wide. Area?`,
          say: `A rectangle is ${l} long and ${w} wide. What is its area?`,
          visual: null,
          pic: { kind: "rect", l, w }, answer: l * w,
          hint: "Area = length × width.",
          steps: [`Imagine ${w} rows of ${l} tiles.`, `${l} × ${w}…`, `…is ${l * w} tiles of area!`] };
      },
    },

    /* ---------- Island 5 · Storm Peaks ---------- */
    "mult.big": {
      name: "Mega Multiply", icon: "⛰️", island: "storm", unit: "megamult", prereqs: ["mult.hard"],
      gen(d) {
        const a = ri(lerp(12, 20, d), lerp(25, 60, d)), b = ri(2, lerp(4, 8, d));
        const tens = Math.floor(a / 10) * 10;
        return { format: "keypad", prompt: `${a} × ${b} = ?`, say: `What is ${a} times ${b}?`, visual: null, answer: a * b,
          hint: `Split ${a} into ${tens} and ${a % 10}.`,
          steps: [`${tens} × ${b} = ${tens * b}.`, `${a % 10} × ${b} = ${(a % 10) * b}.`, `Add them: ${tens * b} + ${(a % 10) * b} = ${a * b}!`] };
      },
    },
    "div.big": {
      name: "Mega Divide", icon: "🪓", island: "storm", unit: "megamult", prereqs: ["div.facts"],
      gen(d) {
        const k = ri(3, lerp(6, 9, d)), q = ri(lerp(11, 14, d), lerp(15, 25, d));
        return { format: "keypad", prompt: `${k * q} ÷ ${k} = ?`, say: `What is ${k * q} divided by ${k}?`, visual: null, answer: q,
          hint: `How many ${k}s in ${k * q}? Try tens first.`,
          steps: [`Ten ${k}s make ${k * 10}.`, `That leaves ${k * q - k * 10} — that's ${q - 10} more ${k}s.`, `10 + ${q - 10} = ${q}!`] };
      },
    },
    "round.num": {
      name: "Rounding Ridge", icon: "🏔️", island: "storm", unit: "megamult", prereqs: ["pv.tensones"],
      gen(d) {
        const toHundred = d > 0.55;
        if (toHundred) {
          let n = ri(110, 940);   // keep rounded result ≤ 900 (keypad is 3 digits)
          if (n % 100 === 50) n += ri(1, 9);
          const ans = Math.round(n / 100) * 100;
          return { format: "keypad", prompt: `Round ${n} to the nearest 100`, say: `Round ${n} to the nearest hundred.`, visual: null,
            pic: { kind: "numline", lo: Math.floor(n / 100) * 100, hi: Math.floor(n / 100) * 100 + 100, mark: n, ticks: 10 },
            answer: ans,
            hint: "Look at the tens digit: 5 or more rounds up.",
            steps: [`${n} sits between ${Math.floor(n / 100) * 100} and ${Math.floor(n / 100) * 100 + 100}.`, `The tens digit is ${Math.floor(n / 10) % 10}.`, `So it rounds to ${ans}!`] };
        }
        let n = ri(11, 98);
        if (n % 10 === 5) n += ri(1, 4);
        const ans = Math.round(n / 10) * 10;
        return { format: "keypad", prompt: `Round ${n} to the nearest 10`, say: `Round ${n} to the nearest ten.`, visual: null,
          pic: { kind: "numline", lo: Math.floor(n / 10) * 10, hi: Math.floor(n / 10) * 10 + 10, mark: n, ticks: 10 },
          answer: ans,
          hint: "Look at the ones digit: 5 or more rounds up.",
          steps: [`${n} sits between ${Math.floor(n / 10) * 10} and ${Math.floor(n / 10) * 10 + 10}.`, `The ones digit is ${n % 10}.`, `So it rounds to ${ans}!`] };
      },
    },
    "dec.place": {
      name: "Decimal Detective", icon: "🔎", island: "storm", unit: "decimals", prereqs: ["pv.tensones", "frac.intro"],
      gen(d) {
        const whole = ri(1, 9), tn = ri(1, 9), hd = ri(1, 9);
        const useHund = d > 0.5;
        const num = useHund ? `${whole}.${tn}${hd}` : `${whole}.${tn}`;
        const which = useHund && Math.random() < 0.5 ? "hundredths" : "tenths";
        const ans = which === "tenths" ? tn : hd;
        return { format: "keypad", prompt: `In ${num}, which digit is in the ${which} place?`,
          say: `Look at ${num}. Which digit is in the ${which} place?`, visual: null, answer: ans,
          hint: "Tenths come right after the decimal point.",
          steps: ["The decimal point splits wholes from parts.", `First spot after the point = tenths${useHund ? ", second = hundredths" : ""}.`, `The ${which} digit is ${ans}!`] };
      },
    },
    "dec.add": {
      name: "Decimal Drop", icon: "💧", island: "storm", unit: "decimals", prereqs: ["dec.place", "add.to100"],
      gen(d) {
        const a = ri(10, lerp(40, 80, d)) / 10, b = ri(5, lerp(30, 60, d)) / 10;
        const ans = Math.round((a + b) * 10) / 10;
        return { format: "keypad", decimal: true,
          prompt: `${a.toFixed(1)} + ${b.toFixed(1)} = ?`,
          say: `What is ${a.toFixed(1)} plus ${b.toFixed(1)}?`, visual: null, answer: ans,
          hint: "Line up the decimal points, then add.",
          steps: [`Add the tenths: ${Math.round(a * 10) % 10} + ${Math.round(b * 10) % 10} tenths.`, `Add the wholes: ${Math.floor(a)} + ${Math.floor(b)}.`, `Together: ${ans.toFixed(1)}!`] };
      },
    },
    "dec.compare": {
      name: "Bigger Decimal", icon: "🐘", island: "storm", unit: "decimals", prereqs: ["dec.place"],
      gen(d) {
        let a = ri(1, 99) / (d > 0.5 ? 100 : 10), b = ri(1, 99) / (d > 0.5 ? 100 : 10);
        while (a === b) b = ri(1, 99) / (d > 0.5 ? 100 : 10);
        const claim = Math.random() < 0.5 ? ">" : "<";
        const truthy = claim === ">" ? a > b : a < b;
        const f = (x) => (d > 0.5 ? x.toFixed(2) : x.toFixed(1));
        return { format: "tf", prompt: `${f(a)} ${claim} ${f(b)}`,
          say: `True or false: ${f(a)} is ${claim === ">" ? "bigger" : "smaller"} than ${f(b)}?`,
          visual: null, answer: truthy,
          hint: "Compare tenths first, then hundredths.",
          steps: ["Compare the whole numbers first.", "Then the tenths digit, then the hundredths.", `${f(a)} is ${a > b ? "bigger" : "smaller"} than ${f(b)} — so it's ${truthy ? "TRUE" : "FALSE"}!`] };
      },
    },
    "angle.classify": {
      name: "Angle Spotter", icon: "📐", island: "storm", unit: "angles", prereqs: ["shape.names2d"],
      gen(d) {
        const KINDS = [["acute", () => ri(10, 80)], ["right", () => 90], ["obtuse", () => ri(100, 170)], ["straight", () => 180]];
        const pool = KINDS;
        const [kind, gen] = pick(pool);
        const deg = gen();
        return { format: "choice", prompt: `An angle measures ${deg}°. What kind is it?`,
          say: `An angle measures ${deg} degrees. What kind of angle is it?`,
          visual: null,
          pic: { kind: "angle", deg },
          choices: shuffle(pool.map(([k]) => ({ label: k, correct: k === kind }))),
          hint: "Right = exactly 90°. Less is acute, more is obtuse.",
          steps: ["A right angle is exactly 90°, a straight line is 180°.", `Smaller than 90° = acute, between 90° and 180° = obtuse.`, `${deg}° is ${kind}!`] };
      },
    },
    "angle.facts": {
      name: "Angle Wisdom", icon: "🦉", island: "storm", unit: "angles", prereqs: ["angle.classify", "sub.to100"],
      gen(d) {
        if (d < 0.45) {
          const F = [["a right angle", 90], ["a straight line", 180], ["a full turn", 360]];
          const [name, deg] = pick(F);
          return { format: "keypad", prompt: `How many degrees in ${name}?`, say: `How many degrees are in ${name}?`, visual: null, answer: deg,
            hint: "Right = quarter turn, straight = half turn.",
            steps: ["A full turn is 360°.", "Half of that is a straight line: 180°.", "Quarter of that is a right angle: 90°."] };
        }
        const a = ri(15, 160);
        return { format: "keypad", prompt: `Two angles make a straight line. One is ${a}°. The other?`,
          say: `Two angles together make a straight line. One is ${a} degrees. What is the other?`, visual: null,
          pic: { kind: "suppl", a },
          answer: 180 - a,
          hint: "A straight line is 180° in total.",
          steps: ["Angles on a straight line add to 180°.", `180 − ${a}…`, `…is ${180 - a}!`] };
      },
    },
    "data.read": {
      name: "Graph Reader", icon: "📊", island: "storm", unit: "data", prereqs: ["count.to20"],
      gen(d) {
        const k = pick(d < 0.5 ? [1, 2] : [2, 5]);
        const fruits = shuffle(FRUITS).slice(0, 3);
        const bars = fruits.map(() => ri(1, 5));
        const ti = ri(0, 2);
        return { format: "keypad",
          prompt: `Each ▇ = ${k}. How many ${fruits[ti]}?`,
          say: `On this graph, each block is worth ${k}. How many of the ${ti === 0 ? "first" : ti === 1 ? "second" : "third"} fruit are there?`,
          visual: null,
          pic: { kind: "bars", items: fruits.map((f, i) => ({ label: f, val: bars[i] })) },
          answer: bars[ti] * k,
          hint: `Count the blocks, then multiply by ${k}.`,
          steps: [`${fruits[ti]} has ${bars[ti]} blocks.`, `Each block = ${k}.`, `${bars[ti]} × ${k} = ${bars[ti] * k}!`] };
      },
    },
    "data.compare": {
      name: "Graph Battle", icon: "⚔️", island: "storm", unit: "data", prereqs: ["data.read"],
      gen(d) {
        const fruits = shuffle(FRUITS).slice(0, 4);
        const bars = shuffle(Array.from({ length: fruits.length }, (_, i) => i + 1));
        const most = Math.random() < 0.5;
        const targetVal = most ? Math.max(...bars) : Math.min(...bars);
        const ti = bars.indexOf(targetVal);
        return { format: "choice",
          prompt: `Which has the ${most ? "MOST" : "FEWEST"}?`,
          say: `Look at the graph. Which one has the ${most ? "most" : "fewest"}?`,
          visual: null,
          pic: { kind: "bars", items: fruits.map((f, i) => ({ label: f, val: bars[i] })) },
          choices: shuffle(fruits.map((f, i) => ({ label: f, correct: i === ti }))),
          hint: `The ${most ? "longest" : "shortest"} bar wins.`,
          steps: ["Compare the lengths of the bars.", `The ${most ? "longest" : "shortest"} bar belongs to ${fruits[ti]}.`, "That's the answer!"] };
      },
    },

    /* ---------- Island 6 · Aurora Summit ---------- */
    "frac.addlike": {
      name: "Fraction Stack", icon: "🥞", island: "aurora", unit: "fracsummit", prereqs: ["frac.equiv"],
      gen(d) {
        const den = pick(d < 0.5 ? [4, 5, 8] : [5, 8, 10, 12]);
        const a = ri(1, den - 2), b = ri(1, den - a - 1);
        const right = `${a + b}/${den}`;
        const wrongs = [`${a + b}/${den * 2}`, `${a + b + 1}/${den}`, `${a * b}/${den}`, `${a + b}/${den + 1}`, `${Math.max(1, a + b - 1)}/${den}`];
        return { format: "choice", prompt: `${a}/${den} + ${b}/${den} = ?`,
          say: `${a} over ${den} plus ${b} over ${den} equals what?`,
          visual: null,
          choices: fourChoices(right, wrongs),
          hint: "Same bottoms? Just add the tops!",
          steps: ["The bottoms match, so they stay the same.", `Add the tops: ${a} + ${b} = ${a + b}.`, `Answer: ${right}!`] };
      },
    },
    "frac.addunlike": {
      name: "Fraction Fusion", icon: "⚗️", island: "aurora", unit: "fracsummit", prereqs: ["frac.addlike"],
      gen(d) {
        const FAMS = d < 0.5 ? [[2, 4]] : [[2, 4], [3, 6], [2, 8], [5, 10]];
        const [s, b] = pick(FAMS);
        const m = b / s;
        const a1 = 1, a2 = ri(1, b - m - 1);
        const top = a1 * m + a2;
        const right = `${top}/${b}`;
        const wrongs = [`${a1 + a2}/${s + b}`, `${top + 1}/${b}`, `${a1 + a2}/${b}`, `${top}/${b + 1}`, `${Math.max(1, top - 1)}/${b}`];
        return { format: "choice", prompt: `${a1}/${s} + ${a2}/${b} = ?`,
          say: `${a1} over ${s} plus ${a2} over ${b} equals what?`,
          visual: null,
          choices: fourChoices(right, wrongs),
          hint: `Turn ${a1}/${s} into ${b}ths first.`,
          steps: [`${a1}/${s} = ${m}/${b} (multiply top and bottom by ${m}).`, `Now the bottoms match: ${m}/${b} + ${a2}/${b}.`, `Add the tops: ${right}!`] };
      },
    },
    "frac.simplify": {
      name: "Shrink Ray", icon: "🔬", island: "aurora", unit: "fracsummit", prereqs: ["frac.equiv", "div.facts"],
      gen(d) {
        const BASE = d < 0.5 ? [[1, 2], [1, 3], [3, 4]] : [[1, 2], [1, 3], [2, 3], [3, 4], [2, 5]];
        const [p, q] = pick(BASE);
        const m = ri(2, Math.max(2, Math.min(4, Math.floor(12 / q))));   // pie stays ≤12 slices — drawable
        const right = `${p}/${q}`;
        const wrongs = [`${p * m}/${q}`, `${p}/${q * m}`, `${p + 1}/${q + 1}`, `${p}/${q + 1}`, `${p + 1}/${q}`];
        return { format: "choice", prompt: `Simplify ${p * m}/${q * m}`,
          say: `Make ${p * m} over ${q * m} as simple as possible.`,
          visual: null,
          pic: { kind: "pie", n: q * m, k: p * m },
          choices: fourChoices(right, wrongs),
          hint: `Divide top and bottom by the same number.`,
          steps: [`Both ${p * m} and ${q * m} can be divided by ${m}.`, `Top: ${p * m} ÷ ${m} = ${p}. Bottom: ${q * m} ÷ ${m} = ${q}.`, `Shrunk to ${right}!`] };
      },
    },
    "pct.convert": {
      name: "Percent Portal", icon: "🌀", island: "aurora", unit: "percent", prereqs: ["frac.equiv", "dec.place"],
      gen(d) {
        const POOL = d < 0.5 ? [[1, 2, 50], [1, 4, 25], [3, 4, 75], [1, 10, 10]] : [[1, 2, 50], [1, 4, 25], [3, 4, 75], [1, 10, 10], [1, 5, 20], [2, 5, 40], [1, 100, 1], [7, 10, 70]];
        const [p, q, pct] = pick(POOL);
        return { format: "keypad", prompt: `${p}/${q} = ❓%`,
          say: `${p} over ${q} is what percent?`, visual: null, answer: pct,
          hint: "Percent means out of 100.",
          steps: [`Make the bottom 100: multiply by ${100 / q}.`, `Top becomes ${p} × ${100 / q} = ${pct}.`, `${p}/${q} = ${pct}%!`] };
      },
    },
    "pct.of": {
      name: "Percent Power", icon: "⚡", island: "aurora", unit: "percent", prereqs: ["pct.convert", "mult.easy"],
      gen(d) {
        const P = d < 0.5 ? [50, 10] : [50, 25, 10, 20, 75];
        const pct = pick(P);
        const base = (pct === 25 || pct === 75 ? 4 : pct === 20 ? 5 : pct === 10 ? 10 : 2) * ri(2, lerp(6, 12, d));
        return { format: "keypad", prompt: `${pct}% of ${base} = ?`,
          say: `What is ${pct} percent of ${base}?`, visual: null, answer: base * pct / 100,
          hint: pct === 50 ? "50% is a half." : pct === 25 ? "25% is a quarter." : pct === 10 ? "10% means divide by 10." : "Find 25% or 10% first, then build up.",
          steps: [`${pct}% means ${pct} out of every 100.`, pct === 50 ? `Half of ${base}…` : pct === 25 ? `Quarter of ${base}…` : pct === 10 ? `${base} ÷ 10…` : pct === 20 ? `10% is ${base / 10}, double it…` : `25% is ${base / 4}, times 3…`, `…is ${base * pct / 100}!`] };
      },
    },
    "neg.line": {
      name: "Below Zero", icon: "🧊", island: "aurora", unit: "belowzero", prereqs: ["numline.leap", "sub.to100"],
      gen(d) {
        const start = ri(0, lerp(2, 4, d));
        const hop = ri(start + 1, start + lerp(3, 6, d));
        const ans = start - hop;
        const lo = ans - ri(1, 2);
        const items = Array.from({ length: 6 }, (_, i) => ({ label: String(lo + i), correct: lo + i === ans }));
        return { format: "tap", prompt: `The penguin is on ${start}. It slides ${hop} BACK. Tap where it lands!`,
          say: `The penguin is on ${start} and slides ${hop} backwards, below zero. Where does it land?`,
          visual: "🐧", numberline: true, items,
          hint: "Keep counting back past zero: 1, 0, −1, −2…",
          steps: [`Start at ${start} and count back ${hop}.`, "When you pass 0, the numbers get a minus sign.", `You land on ${ans}!`] };
      },
    },
    "neg.addsub": {
      name: "Frost Maths", icon: "❄️", island: "aurora", unit: "belowzero", prereqs: ["neg.line"],
      gen(d) {
        const a = -ri(1, lerp(5, 9, d));
        const add = Math.random() < 0.6;
        const b = ri(1, lerp(6, 12, d));
        const ans = add ? a + b : a - b;
        return { format: "choice", prompt: `${a} ${add ? "+" : "−"} ${b} = ?`,
          say: `What is negative ${-a} ${add ? "plus" : "minus"} ${b}?`,
          visual: null,
          choices: numChoices(ans, ans - 4, ans + 4),
          hint: add ? "Adding moves RIGHT along the line." : "Subtracting moves LEFT, even further below zero.",
          steps: [`Start at ${a} on the number line.`, add ? `Move ${b} steps right.` : `Move ${b} steps left.`, `You land on ${ans}!`] };
      },
    },
    "bodmas": {
      name: "Order Wizard", icon: "🧙", island: "aurora", unit: "puzzle", prereqs: ["mult.mid", "add.to100"],
      gen(d) {
        const a = ri(2, 9), b = ri(2, 9), c = ri(2, 9);
        if (d > 0.55 && Math.random() < 0.5) {
          return { format: "keypad", prompt: `(${a} + ${b}) × ${c} = ?`,
            say: `Open bracket ${a} plus ${b} close bracket, times ${c}.`, visual: null, answer: (a + b) * c,
            hint: "Brackets first!",
            steps: [`Brackets first: ${a} + ${b} = ${a + b}.`, `Then multiply: ${a + b} × ${c}.`, `Answer: ${(a + b) * c}!`] };
        }
        return { format: "keypad", prompt: `${a} + ${b} × ${c} = ?`,
          say: `${a} plus ${b} times ${c}. Careful with the order!`, visual: null, answer: a + b * c,
          hint: "Multiplication before addition — no exceptions!",
          steps: [`Multiply first: ${b} × ${c} = ${b * c}.`, `Then add: ${a} + ${b * c}.`, `Answer: ${a + b * c}!`] };
      },
    },
    "mean.avg": {
      name: "Balance Point", icon: "⚖️", island: "aurora", unit: "puzzle", prereqs: ["div.facts", "add.to100"],
      gen(d) {
        const n = d < 0.5 ? 3 : pick([3, 4]);
        const avg = ri(3, lerp(8, 15, d));
        const nums = Array.from({ length: n - 1 }, () => avg + ri(-2, 2));
        nums.push(avg * n - nums.reduce((x, y) => x + y, 0));
        if (nums.some(x => x < 1)) return this.gen(d);
        return { format: "keypad", prompt: `Average of ${shuffle(nums).join(", ")} = ?`,
          say: `What is the average of ${nums.join(", ")}?`, visual: null, answer: avg,
          hint: "Add them all, then share equally.",
          steps: [`Add them up: ${nums.join(" + ")} = ${avg * n}.`, `Share between ${n}: ${avg * n} ÷ ${n}.`, `The average is ${avg}!`] };
      },
    },
    "word.2step": {
      name: "Puzzle Peak", icon: "🗻", island: "aurora", unit: "puzzle", prereqs: ["mult.easy", "sub.to100"],
      gen(d) {
        if (Math.random() < 0.5) {
          const packs = ri(2, lerp(4, 6, d)), per = ri(3, lerp(6, 10, d)), eaten = ri(1, packs * per - 1);
          return { format: "keypad",
            prompt: `You buy ${packs} packs of ${per} stickers, then give away ${eaten}. How many left?`,
            say: `You buy ${packs} packs with ${per} stickers in each, then give away ${eaten}. How many are left?`,
            visual: "✨", answer: packs * per - eaten,
            hint: "First find how many you bought in total.",
            steps: [`Step 1 — total bought: ${packs} × ${per} = ${packs * per}.`, `Step 2 — give some away: ${packs * per} − ${eaten}.`, `${packs * per - eaten} stickers left!`] };
        }
        const kids = ri(2, lerp(3, 5, d)), kidP = ri(2, lerp(4, 8, d)), adultP = kidP + ri(2, 6);
        return { format: "keypad",
          prompt: `Kid tickets cost $${kidP}, adult tickets $${adultP}. Cost for ${kids} kids and 1 adult?`,
          say: `Kid tickets cost ${kidP} dollars and adult tickets ${adultP} dollars. How much for ${kids} kids and one adult?`,
          visual: "🎟️", answer: kids * kidP + adultP,
          hint: "Work out the kids' total first.",
          steps: [`Step 1 — kids: ${kids} × $${kidP} = $${kids * kidP}.`, `Step 2 — add the adult: $${kids * kidP} + $${adultP}.`, `Total: $${kids * kidP + adultP}!`] };
      },
    },
  };

  /* shared times-table question builder */
  function tableQ(t, a) {
    return { format: "keypad", prompt: `${a} × ${t} = ?`, say: `What is ${a} times ${t}?`, visual: null, answer: a * t,
      hint: `Skip count by ${t}, ${a} times.`,
      steps: [`Skip count by ${t}: ${Array.from({ length: a }, (_, i) => (i + 1) * t).join(", ")}.`, `That's ${a} jumps of ${t}.`, `${a} × ${t} = ${a * t}!`] };
  }

  /* ===================== MAP ===================== */
  const ISLANDS = [
    { id: "sprout", name: "Sprout Isle", emoji: "🌱",
      boss: { name: "Sprig the Sapling", emoji: "🌳", line: "Show me your counting magic and my branches will bloom!" },
      units: [
        { id: "count", name: "Counting Cove", skills: ["count.to10", "count.compare", "count.order", "count.to20", "pos.ordinal"] },
        { id: "shape", name: "Shape Shore", skills: ["shape.names2d", "shape.tap"] },
        { id: "pattern", name: "Pattern Path", skills: ["pattern.next"] },
      ] },
    { id: "bridge", name: "Bridge Bay", emoji: "🌉",
      boss: { name: "Captain Pontoon", emoji: "⛵", line: "Only true adders may cross my bay!" },
      units: [
        { id: "bonds", name: "Number Bonds", skills: ["add.to10", "add.bonds10", "sub.to10", "double.halve", "count.back"] },
        { id: "place", name: "Place Value Pier", skills: ["pv.tensones", "numline.leap"] },
        { id: "timemoney", name: "Time & Money Market", skills: ["time.oclock", "money.aud"] },
        { id: "truth", name: "Truth Tower", skills: ["tf.numfacts"] },
      ] },
    { id: "cascade", name: "Cascade Cliffs", emoji: "🌊",
      boss: { name: "Misty the Waterfall Wyrm", emoji: "💧", line: "My cliffs count by hundreds — can you keep up?" },
      units: [
        { id: "hundreds", name: "Hundred Heights", skills: ["add.to100", "sub.to100", "missing.addend"] },
        { id: "skipstack", name: "Skip & Stack", skills: ["skip.count", "arrays.intro", "odd.even"] },
        { id: "measure", name: "Measure Meadow", skills: ["measure.pick", "measure.compare"] },
        { id: "fractions", name: "Fraction Falls", skills: ["frac.intro", "frac.ofnum"] },
      ] },
    { id: "ember", name: "Ember Plains", emoji: "🔥",
      boss: { name: "Cinder the Dragon", emoji: "🐉", line: "My flames burn in times tables. Face them!" },
      units: [
        { id: "times", name: "Times Table Trail", skills: ["mult.easy", "mult.mid", "mult.hard", "mult.missing"] },
        { id: "sharing", name: "Sharing Shed", skills: ["div.facts", "div.share"] },
        { id: "fracforge", name: "Fraction Forge", skills: ["frac.equiv", "frac.line"] },
        { id: "sizer", name: "Shape Sizer", skills: ["peri.rect", "area.rect"] },
      ] },
    { id: "storm", name: "Storm Peaks", emoji: "⛈️",
      boss: { name: "Gale the Thunderbird", emoji: "🦅", line: "Big numbers ride my winds. Hold steady!" },
      units: [
        { id: "megamult", name: "Multiplying Mountains", skills: ["mult.big", "div.big", "round.num"] },
        { id: "decimals", name: "Decimal Drifts", skills: ["dec.place", "dec.add", "dec.compare"] },
        { id: "angles", name: "Angle Aerie", skills: ["angle.classify", "angle.facts"] },
        { id: "data", name: "Graph Gorge", skills: ["data.read", "data.compare"] },
      ] },
    { id: "aurora", name: "Aurora Summit", emoji: "🌌",
      boss: { name: "Professor Polaris", emoji: "🦉", line: "The summit's final riddles await, young explorer." },
      units: [
        { id: "fracsummit", name: "Fraction Summit", skills: ["frac.addlike", "frac.addunlike", "frac.simplify"] },
        { id: "percent", name: "Percent Peaks", skills: ["pct.convert", "pct.of"] },
        { id: "belowzero", name: "Below Zero", skills: ["neg.line", "neg.addsub"] },
        { id: "puzzle", name: "Puzzle Peak", skills: ["bodmas", "mean.avg", "word.2step"] },
      ] },
  ];

  /* ===================== FOUNDATION (Prep) — Year 1 of the school-year curricula ===================== */
  const F_ANIMALS = ["🐶", "🐱", "🐭", "🐰", "🐥", "🐸", "🐢", "🐝", "🦆", "🐞"];
  const F_THINGS = ["🍎", "🍌", "🍓", "⭐", "🎈", "🚗", "🌸", "🐚"];

  const FSKILLS = {
    /* — 🐣 Counting Cove — */
    "f.count.dots": {
      name: "How Many?", icon: "🔵", island: "f.count", unit: "f.count1", prereqs: [],
      gen(d) { const n = ri(1, lerp(4, 6, d)), e = pick(F_ANIMALS);
        return { format: "choice", prompt: "How many?", say: "How many do you see?", visual: rep(e, n),
          choices: numChoices(n, 1, 6), hint: "Count them one by one.",
          steps: ["Point to each one.", "Say the numbers: 1, 2, 3…", "The last number is the answer!"] }; }
    },
    "f.count.to10": {
      name: "Counting Critters", icon: "🐞", island: "f.count", unit: "f.count1", prereqs: ["f.count.dots"],
      gen(d) { const n = ri(3, lerp(6, 10, d)), e = pick(CRITTERS);
        return { format: "choice", prompt: "How many are there?", say: "How many can you count?", visual: rep(e, n),
          choices: numChoices(n, 1, 10), hint: "Touch each one as you count!",
          steps: ["Point to each " + e + ".", "Count: 1, 2, 3…", "The last number is how many!"] }; }
    },
    "f.count.to20": {
      name: "Big Counting", icon: "🔢", island: "f.count", unit: "f.count2", prereqs: ["f.count.to10"],
      gen(d) { const n = ri(11, lerp(14, 20, d)), e = pick(FRUITS);
        return { format: "choice", prompt: "How many?", say: "Count them all!", visual: rep(e, n),
          choices: numChoices(n, 8, 20), hint: "Count the first ten, then keep going.",
          steps: ["Count the first ten.", "Keep going: 11, 12, 13…", "Say the last number!"] }; }
    },
    "f.count.next": {
      name: "What Comes Next", icon: "➡️", island: "f.count", unit: "f.count2", prereqs: ["f.count.to10"],
      gen(d) { const hi = lerp(8, 18, d), n = ri(1, hi);
        return { format: "choice", prompt: `What number comes after ${n}?`, say: `What comes after ${n}?`, visual: null,
          choices: numChoices(n + 1, 1, 20), hint: "Count up by one.",
          steps: [`Start at ${n}.`, "Count one more.", `${n}, then ${n + 1}!`] }; }
    },
    "f.count.order": {
      name: "Number Train", icon: "🚂", island: "f.count", unit: "f.count2", prereqs: ["f.count.to10"],
      gen(d) { const k = d > 0.5 ? 4 : 3, hi = lerp(6, 12, d), set = new Set();
        while (set.size < k) set.add(ri(1, hi)); const correct = [...set].sort((a, b) => a - b);
        return { format: "order", prompt: "Tap from smallest to biggest!", say: "Tap from smallest to biggest.", visual: null,
          items: shuffle(correct), correct, hint: "Find the tiniest number first.",
          steps: ["Tap the smallest.", "Then the next smallest.", "Keep going!"] }; }
    },

    /* — ⚖️ More & Less Marsh — */
    "f.compare.more": {
      name: "More or Fewer", icon: "⚖️", island: "f.compare", unit: "f.cmp", prereqs: ["f.count.to10"],
      gen(d) { const max = lerp(4, 9, d); let a = ri(1, max), b = ri(1, max); while (b === a) b = ri(1, max);
        const [e1, e2] = shuffle(FRUITS).slice(0, 2), wantMore = Math.random() < 0.5, aWins = wantMore ? a > b : a < b;
        return { format: "choice", prompt: `Which group has ${wantMore ? "MORE" : "FEWER"}?`, say: `Which has ${wantMore ? "more" : "fewer"}?`,
          visual: rep(e1, a) + "\n" + rep(e2, b),
          choices: shuffle([{ label: `${e1} group`, correct: aWins }, { label: `${e2} group`, correct: !aWins }]),
          hint: "Match them in pairs — who has spares?",
          steps: ["Pair one with one.", "Keep pairing.", "Extras left over = more!"] }; }
    },
    "f.compare.same": {
      name: "Just the Same", icon: "🟰", island: "f.compare", unit: "f.cmp", prereqs: ["f.count.to10"],
      gen(d) { const max = lerp(4, 8, d), a = ri(1, max), same = Math.random() < 0.5;
        let b = a; if (!same) { b = ri(1, max); while (b === a) b = ri(1, max); }
        const [e1, e2] = shuffle(F_THINGS).slice(0, 2);
        return { format: "tf", prompt: "Do the two groups have the SAME number?", say: "Do the groups have the same number?",
          visual: rep(e1, a) + "\n" + rep(e2, b), answer: a === b, hint: "Count each group, then compare.",
          steps: ["Count the top group.", "Count the bottom group.", "Same number means equal!"] }; }
    },
    "f.compare.bigger": {
      name: "Bigger Number", icon: "🔝", island: "f.compare", unit: "f.cmp2", prereqs: ["f.count.to20"],
      gen(d) { const hi = lerp(10, 20, d); let a = ri(1, hi), b = ri(1, hi); while (b === a) b = ri(1, hi); const big = Math.max(a, b);
        return { format: "choice", prompt: "Which number is BIGGER?", say: "Which number is bigger?", visual: null,
          choices: shuffle([{ label: String(a), correct: a === big }, { label: String(b), correct: b === big }]),
          hint: "The bigger number comes later when you count.",
          steps: ["Count upwards.", "Whichever you reach later is bigger.", `${big} is bigger!`] }; }
    },
    "f.compare.order3": {
      name: "Line Them Up", icon: "📊", island: "f.compare", unit: "f.cmp2", prereqs: ["f.compare.bigger"],
      gen(d) { const hi = lerp(9, 15, d), set = new Set(); while (set.size < 3) set.add(ri(1, hi));
        const correct = [...set].sort((a, b) => a - b);
        return { format: "order", prompt: "Tap from least to most!", say: "Tap from least to most.", visual: null,
          items: shuffle(correct), correct, hint: "Smallest goes first.",
          steps: ["Find the least.", "Then the next.", "The most goes last!"] }; }
    },

    /* — ➕ Together Grove (add & take away within 10) — */
    "f.add.within5": {
      name: "Adding Up", icon: "➕", island: "f.addsub", unit: "f.add", prereqs: ["f.count.to10"],
      gen(d) { const a = ri(1, 3), b = ri(1, lerp(2, 4, d)), e = pick(CRITTERS);
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, visual: rep(e, a) + "   ➕   " + rep(e, b),
          answer: a + b, hint: "Count them all together.",
          steps: [`Start with ${a}.`, `Count on ${b} more.`, `${a} + ${b} = ${a + b}!`] }; }
    },
    "f.add.within10": {
      name: "Adding Acorns", icon: "🌰", island: "f.addsub", unit: "f.add", prereqs: ["f.add.within5"],
      gen(d) { let a = ri(1, 6), b = ri(1, lerp(3, 5, d)); if (a + b > 10) b = Math.max(1, 10 - a);
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, visual: null, answer: a + b,
          hint: "Count on from the bigger number.",
          steps: [`Start at ${Math.max(a, b)}.`, `Count on ${Math.min(a, b)} more.`, `That makes ${a + b}!`] }; }
    },
    "f.add.story": {
      name: "More Come Along", icon: "🦆", island: "f.addsub", unit: "f.add", prereqs: ["f.add.within10"],
      gen(d) { const e = pick(["🦆", "🐥", "🐸", "🐰"]); let a = ri(1, 5), b = ri(1, lerp(2, 4, d)); if (a + b > 10) b = Math.max(1, 10 - a);
        return { format: "keypad", prompt: `${a} ${e} here. ${b} more come. How many now?`, say: `${a} plus ${b} more. How many altogether?`,
          visual: rep(e, a) + "   …and " + rep(e, b) + " more", answer: a + b, hint: "Put the two groups together.",
          steps: [`There are ${a}.`, `${b} more arrive.`, `${a} + ${b} = ${a + b}!`] }; }
    },
    "f.sub.within10": {
      name: "Take-Away Treats", icon: "🍪", island: "f.addsub", unit: "f.sub", prereqs: ["f.add.within10"],
      gen(d) { const a = ri(3, lerp(6, 10, d)), b = ri(1, a - 1);
        return { format: "keypad", prompt: `${a} − ${b} = ?`, say: `What is ${a} take away ${b}?`, visual: null, answer: a - b,
          hint: "Start at the big number and count back.",
          steps: [`Start at ${a}.`, `Count back ${b}.`, `That leaves ${a - b}!`] }; }
    },
    "f.bond.five": {
      name: "Friends of Five & Ten", icon: "🖐️", island: "f.addsub", unit: "f.sub", prereqs: ["f.add.within5"],
      gen(d) { const target = (d < 0.4 || Math.random() < 0.5) ? 5 : 10, a = ri(0, target);
        return { format: "keypad", prompt: `${a} + ❓ = ${target}`, say: `${a} plus what makes ${target}?`, visual: null, answer: target - a,
          hint: `How many more to reach ${target}?`,
          steps: [`Start at ${a}.`, `Count up to ${target}.`, `You need ${target - a} more!`] }; }
    },

    /* — 🔺 Shape Sands — */
    "f.shape.name2d": {
      name: "Shape Spotter", icon: "🔷", island: "f.shape", unit: "f.shape2d", prereqs: [],
      gen(d) { const SH = [["circle", "⚫"], ["square", "🟦"], ["triangle", "🔺"], ["star", "⭐"], ["heart", "❤️"], ["rectangle", "🟧"]];
        const t = pick(SH), others = shuffle(SH.filter(s => s[0] !== t[0])).slice(0, 3);
        return { format: "choice", prompt: "What shape is this?", say: "What shape is this?", visual: t[1],
          choices: shuffle([{ label: t[0], correct: true }, ...others.map(o => ({ label: o[0], correct: false }))]),
          hint: "Look at the sides and corners.", steps: ["Look at the shape.", "Count its sides.", "Match its name!"] }; }
    },
    "f.shape.sides": {
      name: "Count the Sides", icon: "📐", island: "f.shape", unit: "f.shape2d", prereqs: ["f.shape.name2d"],
      gen(d) { const SH = [["triangle", "🔺", 3], ["square", "🟦", 4], ["rectangle", "🟧", 4]], t = pick(SH);
        return { format: "choice", prompt: `How many sides does a ${t[0]} have?`, say: `How many sides does a ${t[0]} have?`, visual: t[1],
          choices: numChoices(t[2], 3, 6), hint: "Trace around the edge.",
          steps: ["Start at one corner.", "Count each straight edge.", `A ${t[0]} has ${t[2]} sides!`] }; }
    },
    "f.shape.find": {
      name: "Find the Shape", icon: "🔍", island: "f.shape", unit: "f.shape2d", prereqs: ["f.shape.name2d"],
      gen(d) { const SH = [["circle", "⚫"], ["square", "🟦"], ["triangle", "🔺"], ["star", "⭐"], ["heart", "❤️"]];
        const t = pick(SH); let pool = shuffle(SH).slice(0, 4); if (!pool.find(s => s[0] === t[0])) pool[0] = t;
        return { format: "tap", prompt: `Tap the ${t[0]}!`, say: `Tap the ${t[0]}.`, visual: null,
          items: shuffle(pool.map(s => ({ label: s[1], correct: s[0] === t[0] }))), hint: "Picture the shape's name.",
          steps: ["Think of the shape.", "Find the matching one.", "Tap it!"] }; }
    },
    "f.shape.solid": {
      name: "Solid Shapes", icon: "📦", island: "f.shape", unit: "f.shape3d", prereqs: ["f.shape.name2d"],
      gen(d) { const SO = [["ball", "⚽"], ["box", "📦"], ["can", "🥫"], ["cone", "🍦"]]; const t = pick(SO), others = shuffle(SO.filter(s => s[0] !== t[0])).slice(0, 3);
        return { format: "choice", prompt: "What solid is this like?", say: "What solid shape is this like?", visual: t[1],
          choices: shuffle([{ label: t[0], correct: true }, ...others.map(o => ({ label: o[0], correct: false }))]),
          hint: "Think of its real-life shape.", steps: ["Look at the object.", "Round, flat, or pointy?", "Match the solid!"] }; }
    },

    /* — 🎨 Pattern Path — */
    "f.pattern.next": {
      name: "Pattern Magic", icon: "🎨", island: "f.pattern", unit: "f.pat", prereqs: [],
      gen(d) { const it = shuffle(F_THINGS).slice(0, 2), reps = lerp(2, 3, d), seq = [];
        for (let i = 0; i < reps; i++) seq.push(it[0], it[1]);
        return { format: "choice", prompt: "What comes next?", say: "What comes next in the pattern?", visual: seq.join(" ") + " ❓",
          choices: shuffle([{ label: it[0], correct: true }, { label: it[1], correct: false }]),
          hint: "Say the pattern out loud.", steps: ["Read the pattern.", "Find what repeats.", "What comes next?"] }; }
    },
    "f.pattern.abc": {
      name: "Three-Step Pattern", icon: "🌈", island: "f.pattern", unit: "f.pat", prereqs: ["f.pattern.next"],
      gen(d) { const it = shuffle(F_THINGS).slice(0, 3), seq = [];
        for (let i = 0; i < 2; i++) seq.push(it[0], it[1], it[2]);
        return { format: "choice", prompt: "What comes next?", say: "What comes next?", visual: seq.join(" ") + " ❓",
          choices: shuffle(it.map((x, i) => ({ label: x, correct: i === 0 }))),
          hint: "This pattern has three parts.", steps: ["Read: 1, 2, 3, 1, 2, 3…", "After 3 comes 1 again.", "Pick it!"] }; }
    },
    "f.pattern.size": {
      name: "Big & Small", icon: "🔺", island: "f.pattern", unit: "f.pat", prereqs: ["f.pattern.next"],
      gen(d) { const start = Math.random() < 0.5 ? "big" : "small", other = start === "big" ? "small" : "big";
        const seq = [start, other, start, other, start];
        return { format: "choice", prompt: `${seq.join(", ")}, … What comes next?`, say: `${start}, ${other}, ${start}… what comes next?`, visual: null,
          choices: shuffle([{ label: other, correct: true }, { label: start, correct: false }]),
          hint: "It keeps swapping.", steps: ["Read the pattern.", `${start}, ${other}, ${start}, ${other}…`, `Next is ${other}!`] }; }
    },

    /* — 📏 Measure Meadow — */
    "f.measure.long": {
      name: "Longer or Shorter", icon: "📏", island: "f.measure", unit: "f.meas", prereqs: [],
      gen(d) { const PAIRS = [["🐛 a worm", "🐍 a snake"], ["✏️ a pencil", "🚌 a bus"], ["🌱 a sprout", "🌳 a tree"], ["🐭 a mouse", "🐘 an elephant"]];
        const [shortT, longT] = pick(PAIRS), askLonger = Math.random() < 0.5;
        return { format: "choice", prompt: `Which is ${askLonger ? "LONGER" : "SHORTER"}?`, say: `Which is ${askLonger ? "longer" : "shorter"}?`, visual: null,
          choices: shuffle([{ label: longT, correct: askLonger }, { label: shortT, correct: !askLonger }]),
          hint: "Picture them side by side.", steps: ["Imagine both.", "Compare their length.", "Pick the right one!"] }; }
    },
    "f.measure.heavy": {
      name: "Heavy or Light", icon: "🪨", island: "f.measure", unit: "f.meas", prereqs: [],
      gen(d) { const PAIRS = [["🪶 a feather", "🪨 a rock"], ["🐭 a mouse", "🐘 an elephant"], ["🍎 an apple", "🚗 a car"], ["🎈 a balloon", "📚 a stack of books"]];
        const [lightT, heavyT] = pick(PAIRS), askHeavy = Math.random() < 0.5;
        return { format: "choice", prompt: `Which is ${askHeavy ? "HEAVIER" : "LIGHTER"}?`, say: `Which is ${askHeavy ? "heavier" : "lighter"}?`, visual: null,
          choices: shuffle([{ label: heavyT, correct: askHeavy }, { label: lightT, correct: !askHeavy }]),
          hint: "Which is harder to lift?", steps: ["Imagine lifting each.", "Heavier is harder to lift.", "Choose!"] }; }
    },
    "f.measure.full": {
      name: "Holds More", icon: "🥤", island: "f.measure", unit: "f.meas", prereqs: [],
      gen(d) { const askMore = Math.random() < 0.5, full = "🥛 a full cup", empty = "🫙 an almost-empty jar";
        return { format: "choice", prompt: `Which holds ${askMore ? "MORE" : "LESS"}?`, say: `Which holds ${askMore ? "more" : "less"}?`, visual: null,
          choices: shuffle([{ label: full, correct: askMore }, { label: empty, correct: !askMore }]),
          hint: "More inside means it holds more.", steps: ["Look at how full each is.", "Fuller holds more.", "Pick it!"] }; }
    },
    "f.sequence": {
      name: "What Comes First?", icon: "🔢", island: "f.measure", unit: "f.pos", prereqs: [],
      gen(d) { const SEQ = [["🥚 egg", "🐣 chick", "🐓 hen"], ["🌱 seed", "🌿 sprout", "🌳 tree"], ["🌅 morning", "☀️ midday", "🌙 night"]];
        const ordered = pick(SEQ), askFirst = Math.random() < 0.5, target = askFirst ? ordered[0] : ordered[2];
        return { format: "choice", prompt: `Which comes ${askFirst ? "FIRST" : "LAST"}?`, say: `Which comes ${askFirst ? "first" : "last"}?`, visual: shuffle(ordered).join("    "),
          choices: shuffle(ordered.map(x => ({ label: x, correct: x === target }))),
          hint: "Think about the order in real life.", steps: ["Picture the order.", "First → next → last.", `Pick the ${askFirst ? "first" : "last"}!`] }; }
    },
  };

  const FISLANDS = [
    { id: "f.count", name: "Counting Cove", emoji: "🐣", young: true,
      boss: { name: "Hatch the Chick", emoji: "🐥", line: "Count with me and I'll hatch!" },
      units: [
        { id: "f.count1", name: "First Counts", skills: ["f.count.dots", "f.count.to10"] },
        { id: "f.count2", name: "Bigger Counts", skills: ["f.count.to20", "f.count.next", "f.count.order"] },
      ] },
    { id: "f.compare", name: "More & Less Marsh", emoji: "⚖️", young: true,
      boss: { name: "Croaky the Frog", emoji: "🐸", line: "More or fewer? Show me to cross!" },
      units: [
        { id: "f.cmp", name: "Compare Groups", skills: ["f.compare.more", "f.compare.same"] },
        { id: "f.cmp2", name: "Compare Numbers", skills: ["f.compare.bigger", "f.compare.order3"] },
      ] },
    { id: "f.addsub", name: "Together Grove", emoji: "➕", young: true,
      boss: { name: "Acorn the Squirrel", emoji: "🐿️", line: "Add and take away to fill my store!" },
      units: [
        { id: "f.add", name: "Adding", skills: ["f.add.within5", "f.add.within10", "f.add.story"] },
        { id: "f.sub", name: "Taking Away", skills: ["f.sub.within10", "f.bond.five"] },
      ] },
    { id: "f.shape", name: "Shape Sands", emoji: "🔺", young: true,
      boss: { name: "Sandy the Crab", emoji: "🦀", line: "Name my shapes and pass!" },
      units: [
        { id: "f.shape2d", name: "Flat Shapes", skills: ["f.shape.name2d", "f.shape.sides", "f.shape.find"] },
        { id: "f.shape3d", name: "Solid Shapes", skills: ["f.shape.solid"] },
      ] },
    { id: "f.pattern", name: "Pattern Path", emoji: "🎨", young: true,
      boss: { name: "Iris the Butterfly", emoji: "🦋", line: "Finish my patterns to set me free!" },
      units: [
        { id: "f.pat", name: "Patterns", skills: ["f.pattern.next", "f.pattern.abc", "f.pattern.size"] },
      ] },
    { id: "f.measure", name: "Measure Meadow", emoji: "📏", young: true,
      boss: { name: "Tilly the Turtle", emoji: "🐢", line: "Compare and order — then race me!" },
      units: [
        { id: "f.meas", name: "Compare Size", skills: ["f.measure.long", "f.measure.heavy", "f.measure.full"] },
        { id: "f.pos", name: "Order & Sequence", skills: ["f.sequence"] },
      ] },
  ];

  /* ===================== YEAR 1 (ACARA v9) ===================== */
  /* Number to 120 & place value · +/− within 20 & money · skip-counting,
     sharing & patterns · informal-unit length & time · 2D/3D shapes &
     position · categorical data. */
  const CLOCK_HOUR = ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"];
  const CLOCK_HALF = ["🕧", "🕜", "🕝", "🕞", "🕟", "🕠", "🕡", "🕢", "🕣", "🕤", "🕥", "🕦"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const hourLabels = (h, half) => { const out = new Set([half ? `half past ${h}` : `${h} o'clock`]); while (out.size < 4) { const x = ri(1, 12); out.add(half ? `half past ${x}` : `${x} o'clock`); } return shuffle([...out]).map(l => ({ label: l, correct: l === (half ? `half past ${h}` : `${h} o'clock`) })); };
  const distinctCounts = (k, lo, hi) => { const s = new Set(); while (s.size < k) s.add(ri(lo, hi)); return [...s]; };

  const Y1SKILLS = {
    /* — 🔢 Number Town — */
    "y1.num.after": {
      name: "After & Before", icon: "🔢", island: "y1.num", unit: "y1.n1", prereqs: [],
      gen(d) { const n = ri(1, lerp(20, 119, d)), after = Math.random() < 0.6, ans = after ? n + 1 : n - 1;
        return { format: "choice", prompt: `What number comes ${after ? "AFTER" : "BEFORE"} ${n}?`, say: `What comes ${after ? "after" : "before"} ${n}?`,
          visual: null, choices: numChoices(ans, 0, 120), hint: after ? "Count up one." : "Count back one.",
          steps: [`Start at ${n}.`, after ? "Count one more." : "Count one back.", `The answer is ${ans}!`] }; }
    },
    "y1.num.order": {
      name: "Order to 120", icon: "🚂", island: "y1.num", unit: "y1.n1", prereqs: ["y1.num.after"],
      gen(d) { const hi = lerp(20, 120, d), set = new Set(); while (set.size < 4) set.add(ri(1, hi)); const correct = [...set].sort((a, b) => a - b);
        return { format: "order", prompt: "Tap from smallest to biggest!", say: "Order them smallest to biggest.", visual: null,
          items: shuffle(correct), correct, hint: "Smallest first.", steps: ["Find the smallest.", "Then the next.", "Build the train!"] }; }
    },
    "y1.num.compare": {
      name: "Which is Bigger", icon: "🔝", island: "y1.num", unit: "y1.n1", prereqs: ["y1.num.after"],
      gen(d) { const hi = lerp(20, 120, d); let a = ri(1, hi), b = ri(1, hi); while (b === a) b = ri(1, hi); const big = Math.max(a, b);
        return { format: "choice", prompt: "Which number is BIGGER?", say: "Which is bigger?", visual: null,
          choices: shuffle([{ label: String(a), correct: a === big }, { label: String(b), correct: b === big }]),
          hint: "Compare the tens first.", steps: ["Look at the tens.", "More tens means bigger.", `${big} wins!`] }; }
    },
    "y1.num.tens": {
      name: "Tens & Ones", icon: "🧱", island: "y1.num", unit: "y1.n2", prereqs: ["y1.num.after"],
      gen(d) { let n = ri(11, 99); const askTens = Math.random() < 0.5; const ans = askTens ? Math.floor(n / 10) : n % 10;
        return { format: "keypad", prompt: `In ${n}, how many ${askTens ? "TENS" : "ONES"}?`, say: `How many ${askTens ? "tens" : "ones"} in ${n}?`,
          visual: null, answer: ans, hint: askTens ? "The first digit counts the tens." : "The last digit counts the ones.",
          steps: [`Look at ${n}.`, askTens ? "The tens digit is on the left." : "The ones digit is on the right.", `Answer: ${ans}!`] }; }
    },
    "y1.num.partition": {
      name: "Break It Up", icon: "🔨", island: "y1.num", unit: "y1.n2", prereqs: ["y1.num.tens"],
      gen(d) { let n = ri(11, 99); if (n % 10 === 0) n += ri(1, 9); const tens = Math.floor(n / 10) * 10, ones = n % 10;
        return { format: "keypad", prompt: `${n} = ${tens} + ❓`, say: `${n} equals ${tens} plus what?`, visual: null, answer: ones,
          hint: "How many ones are left over?", steps: [`${n} has ${tens} and some ones.`, `Take away ${tens}.`, `That leaves ${ones}!`] }; }
    },

    /* — ➕ Add & Take Bridge — */
    "y1.add.to20": {
      name: "Add to 20", icon: "➕", island: "y1.addsub", unit: "y1.a", prereqs: [],
      gen(d) { const a = ri(1, lerp(6, 12, d)), b = ri(1, 20 - a);
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `${a} plus ${b}?`, visual: null, answer: a + b,
          hint: "Count on from the bigger number.", steps: [`Start at ${Math.max(a, b)}.`, `Count on ${Math.min(a, b)}.`, `That's ${a + b}!`] }; }
    },
    "y1.sub.to20": {
      name: "Take from 20", icon: "➖", island: "y1.addsub", unit: "y1.a", prereqs: ["y1.add.to20"],
      gen(d) { const a = ri(3, lerp(10, 20, d)), b = ri(1, a - 1);
        return { format: "keypad", prompt: `${a} − ${b} = ?`, say: `${a} take away ${b}?`, visual: null, answer: a - b,
          hint: "Count back from the big number.", steps: [`Start at ${a}.`, `Count back ${b}.`, `That leaves ${a - b}!`] }; }
    },
    "y1.add.bond": {
      name: "Missing Part", icon: "🧩", island: "y1.addsub", unit: "y1.a", prereqs: ["y1.add.to20"],
      gen(d) { const t = lerp(10, 20, d), a = ri(0, t), ans = t - a;
        return { format: "keypad", prompt: `${a} + ❓ = ${t}`, say: `${a} plus what makes ${t}?`, visual: null, answer: ans,
          hint: `How many more to reach ${t}?`, steps: [`Start at ${a}.`, `Count up to ${t}.`, `You need ${ans}!`] }; }
    },
    "y1.money.dollars": {
      name: "Money Market", icon: "🪙", island: "y1.addsub", unit: "y1.money", prereqs: ["y1.add.to20"],
      gen(d) { const COINS = [1, 2, 5, 10]; let a = pick(COINS), b = pick(COINS); while (a + b > 20) { a = pick(COINS); b = pick(COINS); }
        return { format: "keypad", prompt: `A $${a} and a $${b}. How many dollars in all?`, say: `${a} dollars and ${b} dollars together?`,
          visual: `💲${a}  +  💲${b}`, answer: a + b, hint: "Add the two amounts.", steps: [`You have $${a}.`, `And $${b}.`, `Together that's $${a + b}!`] }; }
    },
    "y1.addsub.story": {
      name: "Story Sums", icon: "📖", island: "y1.addsub", unit: "y1.money", prereqs: ["y1.sub.to20"],
      gen(d) { const e = pick(["🍎", "🐟", "🎈", "🚗", "⭐"]); const add = Math.random() < 0.5;
        if (add) { const a = ri(2, 10), b = ri(1, Math.min(9, 20 - a)); return { format: "keypad", prompt: `${a} ${e} and ${b} more come. How many now?`, say: `${a} plus ${b} more?`, visual: rep(e, a) + " + " + rep(e, b), answer: a + b, hint: "Put them together.", steps: [`There are ${a}.`, `${b} more arrive.`, `${a + b} in all!`] }; }
        const a = ri(4, 15), b = ri(1, a - 1); return { format: "keypad", prompt: `${a} ${e}, then ${b} go away. How many left?`, say: `${a} take away ${b}?`, visual: rep(e, a), answer: a - b, hint: "Take some away.", steps: [`Start with ${a}.`, `${b} leave.`, `${a - b} stay!`] }; }
    },

    /* — 🐾 Skip & Share Savanna — */
    "y1.skip.count": {
      name: "Skip Count", icon: "🦘", island: "y1.skip", unit: "y1.s", prereqs: [],
      gen(d) { const step = pick([2, 5, 10]), start = step * ri(0, 3), seq = [start, start + step, start + 2 * step], ans = start + 3 * step;
        return { format: "choice", prompt: `${seq.join(", ")}, … what's next?`, say: `Skip counting by ${step}. What comes next?`, visual: null,
          choices: numChoices(ans, Math.max(0, ans - 12), ans + 12), hint: `Add ${step} each time.`,
          steps: [`The jump is ${step}.`, `Add ${step} to ${seq[2]}.`, `That's ${ans}!`] }; }
    },
    "y1.skip.fill": {
      name: "Missing Skip", icon: "🌀", island: "y1.skip", unit: "y1.s", prereqs: ["y1.skip.count"],
      gen(d) { const step = pick([2, 5, 10]), start = step * ri(1, 3), ans = start + step;
        return { format: "choice", prompt: `${start}, ❓, ${start + 2 * step}`, say: "What number is missing?", visual: null,
          choices: numChoices(ans, Math.max(0, ans - 12), ans + 12), hint: `Counting by ${step}.`,
          steps: [`From ${start} add ${step}.`, `That's the missing one.`, `It's ${ans}!`] }; }
    },
    "y1.share.equal": {
      name: "Fair Shares", icon: "🤝", island: "y1.skip", unit: "y1.grp", prereqs: [],
      gen(d) { const g = ri(2, 5), per = ri(1, lerp(3, 5, d)), total = g * per;
        return { format: "keypad", prompt: `Share ${total} ${pick(["🍪", "🍓", "🟡"])} equally between ${g}. How many each?`, say: `${total} shared between ${g}?`,
          visual: null, answer: per, hint: "Deal them out one at a time.", steps: [`${total} to share.`, `Give one to each of the ${g}.`, `Each gets ${per}!`] }; }
    },
    "y1.groups.count": {
      name: "Equal Groups", icon: "👥", island: "y1.skip", unit: "y1.grp", prereqs: ["y1.skip.count"],
      gen(d) { const g = ri(2, 5), per = ri(2, lerp(3, 5, d));
        return { format: "keypad", prompt: `${g} groups of ${per}. How many in all?`, say: `${g} groups of ${per}?`,
          visual: (rep("🟢", per) + "  ").repeat(g).trim(), answer: g * per, hint: `Count ${per}, ${g} times.`,
          steps: [`There are ${g} groups.`, `Each has ${per}.`, `Altogether ${g * per}!`] }; }
    },
    "y1.pattern.unit": {
      name: "Pattern Maker", icon: "🎨", island: "y1.skip", unit: "y1.grp", prereqs: [],
      gen(d) { const it = shuffle(FRUITS).slice(0, 2), reps = lerp(2, 3, d), seq = [];
        for (let i = 0; i < reps; i++) seq.push(it[0], it[1]);
        return { format: "choice", prompt: "What comes next?", say: "What comes next in the pattern?", visual: seq.join(" ") + " ❓",
          choices: shuffle([{ label: it[0], correct: true }, { label: it[1], correct: false }]),
          hint: "Find the part that repeats.", steps: ["Read the pattern.", "Spot the repeat.", "What's next?"] }; }
    },

    /* — 📏 Measure Cliffs — */
    "y1.measure.long": {
      name: "Longer or Shorter", icon: "📏", island: "y1.measure", unit: "y1.m", prereqs: [],
      gen(d) { const PAIRS = [["🐛 a worm", "🐍 a snake"], ["✏️ a pencil", "🚌 a bus"], ["🌱 a sprout", "🌳 a tree"]];
        const [s, l] = pick(PAIRS), askL = Math.random() < 0.5;
        return { format: "choice", prompt: `Which is ${askL ? "LONGER" : "SHORTER"}?`, say: `Which is ${askL ? "longer" : "shorter"}?`, visual: null,
          choices: shuffle([{ label: l, correct: askL }, { label: s, correct: !askL }]),
          hint: "Picture them side by side.", steps: ["Imagine both.", "Compare length.", "Pick one!"] }; }
    },
    "y1.measure.units": {
      name: "How Many Long", icon: "🧮", island: "y1.measure", unit: "y1.m", prereqs: [],
      gen(d) { const len = ri(2, lerp(5, 9, d));
        return { format: "keypad", prompt: "How many blocks long is the stick?", say: "How many blocks long?", visual: "📏 " + rep("🟫", len),
          answer: len, hint: "Count each block.", steps: ["Line up the blocks.", "Count them.", `It's ${len} long!`] }; }
    },
    "y1.measure.mass": {
      name: "Heavy or Light", icon: "🪨", island: "y1.measure", unit: "y1.m", prereqs: [],
      gen(d) { const PAIRS = [["🪶 a feather", "🪨 a rock"], ["🐭 a mouse", "🐘 an elephant"], ["🍎 an apple", "🚗 a car"]];
        const [li, he] = pick(PAIRS), askH = Math.random() < 0.5;
        return { format: "choice", prompt: `Which is ${askH ? "HEAVIER" : "LIGHTER"}?`, say: `Which is ${askH ? "heavier" : "lighter"}?`, visual: null,
          choices: shuffle([{ label: he, correct: askH }, { label: li, correct: !askH }]),
          hint: "Which is harder to lift?", steps: ["Imagine lifting each.", "Heavier is harder.", "Choose!"] }; }
    },
    "y1.time.oclock": {
      name: "O'Clock", icon: "🕒", island: "y1.measure", unit: "y1.time", prereqs: [],
      gen(d) { const h = ri(1, 12);
        return { format: "choice", prompt: "What time is it?", say: "What o'clock is it?", visual: CLOCK_HOUR[h % 12],
          choices: hourLabels(h, false), hint: "The short hand points to the hour.", steps: ["Find the short hand.", "It points to the hour.", `It's ${h} o'clock!`] }; }
    },
    "y1.time.half": {
      name: "Half Past", icon: "🕜", island: "y1.measure", unit: "y1.time", prereqs: ["y1.time.oclock"],
      gen(d) { const h = ri(1, 12);
        return { format: "choice", prompt: "What time is it?", say: "What time is it?", visual: CLOCK_HALF[h % 12],
          choices: hourLabels(h, true), hint: "Half past is when the long hand points down.", steps: ["The long hand points to 6.", "That's half past.", `Half past ${h}!`] }; }
    },

    /* — 🔷 Shape & Space Shore — */
    "y1.shape.name2d": {
      name: "Name the Shape", icon: "🔷", island: "y1.space", unit: "y1.sh", prereqs: [],
      gen(d) { const SH = [["circle", "⚫"], ["square", "🟦"], ["triangle", "🔺"], ["rectangle", "🟧"], ["star", "⭐"], ["heart", "❤️"]];
        const t = pick(SH), others = shuffle(SH.filter(s => s[0] !== t[0])).slice(0, 3);
        return { format: "choice", prompt: "What shape is this?", say: "What shape is this?", visual: t[1],
          choices: shuffle([{ label: t[0], correct: true }, ...others.map(o => ({ label: o[0], correct: false }))]),
          hint: "Look at the sides.", steps: ["Look at the shape.", "Count its sides.", "Name it!"] }; }
    },
    "y1.shape.sides": {
      name: "How Many Sides", icon: "📐", island: "y1.space", unit: "y1.sh", prereqs: ["y1.shape.name2d"],
      gen(d) { const SH = [["triangle", "🔺", 3], ["square", "🟦", 4], ["rectangle", "🟧", 4]], t = pick(SH);
        return { format: "choice", prompt: `How many sides does a ${t[0]} have?`, say: `How many sides does a ${t[0]} have?`, visual: t[1],
          choices: numChoices(t[2], 3, 6), hint: "Trace the edges.", steps: ["Start at a corner.", "Count each edge.", `${t[2]} sides!`] }; }
    },
    "y1.shape.solid": {
      name: "Solid Shapes", icon: "📦", island: "y1.space", unit: "y1.sh", prereqs: ["y1.shape.name2d"],
      gen(d) { const SO = [["cube", "📦"], ["ball", "⚽"], ["can", "🥫"], ["cone", "🍦"]], t = pick(SO), others = shuffle(SO.filter(s => s[0] !== t[0])).slice(0, 3);
        return { format: "choice", prompt: "What solid is this like?", say: "What solid shape is this?", visual: t[1],
          choices: shuffle([{ label: t[0], correct: true }, ...others.map(o => ({ label: o[0], correct: false }))]),
          hint: "Think of its real shape.", steps: ["Look at the object.", "Round, flat or pointy?", "Match it!"] }; }
    },
    "y1.position": {
      name: "Where in the Row", icon: "📍", island: "y1.space", unit: "y1.pos", prereqs: [],
      gen(d) { const row = shuffle(["🐶", "🐱", "🐭", "🐰", "🐥"]).slice(0, ri(3, 5)); const where = pick(["FIRST", "LAST", "MIDDLE"]);
        const idx = where === "FIRST" ? 0 : where === "LAST" ? row.length - 1 : Math.floor((row.length - 1) / 2);
        const note = where === "MIDDLE" && row.length % 2 === 0 ? " (the left-middle one)" : "";
        return { format: "choice", prompt: `Which is ${where}${note}?`, say: `Which one is ${where.toLowerCase()}?`, visual: row.join("   "),
          choices: shuffle(row.map((x, i) => ({ label: x, correct: i === idx }))),
          hint: "Look along the row.", steps: ["Read left to right.", `Find the ${where.toLowerCase()} one.`, "Tap it!"] }; }
    },
    "y1.shape.find": {
      name: "Find the Shape", icon: "🔍", island: "y1.space", unit: "y1.pos", prereqs: ["y1.shape.name2d"],
      gen(d) { const SH = [["circle", "⚫"], ["square", "🟦"], ["triangle", "🔺"], ["star", "⭐"], ["heart", "❤️"]]; const t = pick(SH);
        let pool = shuffle(SH).slice(0, 4); if (!pool.find(s => s[0] === t[0])) pool[0] = t;
        return { format: "tap", prompt: `Tap the ${t[0]}!`, say: `Tap the ${t[0]}.`, visual: null,
          items: shuffle(pool.map(s => ({ label: s[1], correct: s[0] === t[0] }))), hint: "Picture the shape.", steps: ["Think of it.", "Find the match.", "Tap!"] }; }
    },

    /* — 📊 Data Den — */
    "y1.data.most": {
      name: "Most Votes", icon: "📊", island: "y1.data", unit: "y1.d", prereqs: [],
      gen(d) { const es = shuffle(["🍎", "🍌", "🍓", "🍊"]).slice(0, 3), cs = distinctCounts(3, 1, 6);
        const maxi = cs.indexOf(Math.max(...cs));
        return { format: "choice", prompt: "Which got the MOST?", say: "Which has the most?", visual: es.map((e, i) => `${e}  ${rep(e, cs[i])}`).join("\n"),
          choices: shuffle(es.map((e, i) => ({ label: e, correct: i === maxi }))), hint: "Find the longest row.",
          steps: ["Compare the rows.", "Longest = most.", `${es[maxi]} wins!`] }; }
    },
    "y1.data.count": {
      name: "Read the Graph", icon: "🔎", island: "y1.data", unit: "y1.d", prereqs: [],
      gen(d) { const es = shuffle(["🍎", "🍌", "🍓", "🍊"]).slice(0, 3), cs = distinctCounts(3, 1, 6), t = ri(0, 2);
        return { format: "keypad", prompt: `How many chose ${es[t]}?`, say: `How many for ${es[t]}?`, visual: es.map((e, i) => `${e}  ${rep(e, cs[i])}`).join("\n"),
          answer: cs[t], hint: "Count that row.", steps: [`Find the ${es[t]} row.`, "Count them.", `That's ${cs[t]}!`] }; }
    },
    "y1.data.compare": {
      name: "How Many More", icon: "➕", island: "y1.data", unit: "y1.d2", prereqs: ["y1.data.count"],
      gen(d) { const es = shuffle(["🍎", "🍌", "🍓"]).slice(0, 2), cs = distinctCounts(2, 1, 6);
        const hi = cs[0] > cs[1] ? 0 : 1, lo = 1 - hi;
        return { format: "keypad", prompt: `How many MORE ${es[hi]} than ${es[lo]}?`, say: `How many more ${es[hi]} than ${es[lo]}?`,
          visual: es.map((e, i) => `${e}  ${rep(e, cs[i])}`).join("\n"), answer: cs[hi] - cs[lo], hint: "Find the difference.",
          steps: [`${es[hi]}: ${cs[hi]}.`, `${es[lo]}: ${cs[lo]}.`, `${cs[hi]} − ${cs[lo]} = ${cs[hi] - cs[lo]}!`] }; }
    },
    "y1.data.total": {
      name: "Altogether", icon: "🧮", island: "y1.data", unit: "y1.d2", prereqs: ["y1.data.count"],
      gen(d) { const es = shuffle(["🍎", "🍌", "🍓"]).slice(0, 3), cs = distinctCounts(3, 1, 5), sum = cs.reduce((a, b) => a + b, 0);
        return { format: "keypad", prompt: "How many votes ALTOGETHER?", say: "How many altogether?", visual: es.map((e, i) => `${e}  ${rep(e, cs[i])}`).join("\n"),
          answer: sum, hint: "Add all the rows.", steps: ["Count each row.", "Add them up.", `Total ${sum}!`] }; }
    },
  };

  const Y1ISLANDS = [
    { id: "y1.num", name: "Number Town", emoji: "🔢",
      boss: { name: "Mayor Hundred", emoji: "🎩", line: "Count past one hundred and the town is yours!" },
      units: [
        { id: "y1.n1", name: "Counting & Order", skills: ["y1.num.after", "y1.num.order", "y1.num.compare"] },
        { id: "y1.n2", name: "Tens & Ones", skills: ["y1.num.tens", "y1.num.partition"] },
      ] },
    { id: "y1.addsub", name: "Add & Take Bridge", emoji: "➕",
      boss: { name: "Captain Twenty", emoji: "⛵", line: "Add and take to twenty to cross my bridge!" },
      units: [
        { id: "y1.a", name: "To Twenty", skills: ["y1.add.to20", "y1.sub.to20", "y1.add.bond"] },
        { id: "y1.money", name: "Money & Stories", skills: ["y1.money.dollars", "y1.addsub.story"] },
      ] },
    { id: "y1.skip", name: "Skip & Share Savanna", emoji: "🦘",
      boss: { name: "Zara the Zebra", emoji: "🦓", line: "Skip, share and pattern to race me!" },
      units: [
        { id: "y1.s", name: "Skip Counting", skills: ["y1.skip.count", "y1.skip.fill"] },
        { id: "y1.grp", name: "Groups & Patterns", skills: ["y1.share.equal", "y1.groups.count", "y1.pattern.unit"] },
      ] },
    { id: "y1.measure", name: "Measure Cliffs", emoji: "📏",
      boss: { name: "Tick-Tock the Owl", emoji: "🦉", line: "Measure and tell the time to pass!" },
      units: [
        { id: "y1.m", name: "Compare & Measure", skills: ["y1.measure.long", "y1.measure.units", "y1.measure.mass"] },
        { id: "y1.time", name: "Telling Time", skills: ["y1.time.oclock", "y1.time.half"] },
      ] },
    { id: "y1.space", name: "Shape & Space Shore", emoji: "🔷",
      boss: { name: "Sandy the Crab", emoji: "🦀", line: "Name my shapes and find your way!" },
      units: [
        { id: "y1.sh", name: "Shapes", skills: ["y1.shape.name2d", "y1.shape.sides", "y1.shape.solid"] },
        { id: "y1.pos", name: "Position", skills: ["y1.position", "y1.shape.find"] },
      ] },
    { id: "y1.data", name: "Data Den", emoji: "📊",
      boss: { name: "Pip the Magpie", emoji: "🐦", line: "Read my graphs and the den is yours!" },
      units: [
        { id: "y1.d", name: "Read Data", skills: ["y1.data.most", "y1.data.count"] },
        { id: "y1.d2", name: "Compare Data", skills: ["y1.data.compare", "y1.data.total"] },
      ] },
  ];

  /* ===================== YEAR 2 (ACARA v9) ===================== */
  /* Numbers to 1000 & place value · +/− strategies & additive patterns ·
     ×2 facts, arrays, sharing, double/halve · halves/quarters/eighths ·
     informal units, clock to quarter-hour, turns, calendar · shapes & maps. */
  const Y2SKILLS = {
    /* — 🏯 Place Value Plaza — */
    "y2.pv.compare": {
      name: "Bigger to 1000", icon: "🔝", island: "y2.pv", unit: "y2.p1", prereqs: [],
      gen(d) { const hi = lerp(100, 1000, d); let a = ri(10, hi), b = ri(10, hi); while (b === a) b = ri(10, hi); const big = Math.max(a, b);
        return { format: "choice", prompt: "Which number is BIGGER?", say: "Which is bigger?", visual: null,
          choices: shuffle([{ label: String(a), correct: a === big }, { label: String(b), correct: b === big }]),
          hint: "Compare hundreds, then tens.", steps: ["Look at the hundreds.", "More hundreds wins.", `${big} is bigger!`] }; }
    },
    "y2.pv.order": {
      name: "Order to 1000", icon: "🚂", island: "y2.pv", unit: "y2.p1", prereqs: ["y2.pv.compare"],
      gen(d) { const hi = lerp(100, 1000, d), set = new Set(); while (set.size < 4) set.add(ri(10, hi)); const correct = [...set].sort((a, b) => a - b);
        return { format: "order", prompt: "Tap from smallest to biggest!", say: "Order smallest to biggest.", visual: null,
          items: shuffle(correct), correct, hint: "Compare hundreds first.", steps: ["Smallest first.", "Then next.", "Order them all!"] }; }
    },
    "y2.pv.place": {
      name: "Place Value", icon: "🏯", island: "y2.pv", unit: "y2.p2", prereqs: ["y2.pv.compare"],
      gen(d) { const n = ri(100, 999); const places = ["HUNDREDS", "TENS", "ONES"], pi = ri(0, 2);
        const ans = pi === 0 ? Math.floor(n / 100) : pi === 1 ? Math.floor(n / 10) % 10 : n % 10;
        return { format: "keypad", prompt: `In ${n}, which digit is in the ${places[pi]} place?`, say: `Which digit is in the ${places[pi].toLowerCase()} place of ${n}?`,
          visual: null, answer: ans, hint: "Hundreds, tens, ones — left to right.", steps: [`Read ${n}.`, `Find the ${places[pi].toLowerCase()} column.`, `That digit is ${ans}!`] }; }
    },
    "y2.pv.partition": {
      name: "Pull Apart", icon: "🔨", island: "y2.pv", unit: "y2.p2", prereqs: ["y2.pv.place"],
      gen(d) { let n = ri(111, 999); if (Math.floor(n / 10) % 10 === 0) n += 10; const h = Math.floor(n / 100) * 100, o = n % 10, tens = Math.floor(n / 10) % 10 * 10;
        return { format: "keypad", prompt: `${n} = ${h} + ❓ + ${o}`, say: `${n} equals ${h} plus what plus ${o}?`, visual: null, answer: tens,
          hint: "What are the tens worth?", steps: [`${n} = hundreds + tens + ones.`, `Hundreds ${h}, ones ${o}.`, `The tens are ${tens}!`] }; }
    },
    "y2.pv.morestep": {
      name: "Ten & Hundred More", icon: "⬆️", island: "y2.pv", unit: "y2.p2", prereqs: ["y2.pv.place"],
      gen(d) { const step = pick([10, 100]), n = ri(100, 899);
        return { format: "keypad", prompt: `${step} more than ${n} = ?`, say: `What is ${step} more than ${n}?`, visual: null, answer: n + step,
          hint: step === 10 ? "The tens digit goes up by one." : "The hundreds digit goes up by one.",
          steps: [`Start at ${n}.`, `Add ${step}.`, `That's ${n + step}!`] }; }
    },

    /* — ➕ Strategy Springs — */
    "y2.add.2dig": {
      name: "Add Bigger", icon: "➕", island: "y2.addsub", unit: "y2.a", prereqs: [],
      gen(d) { const a = ri(10, lerp(40, 80, d)), b = ri(5, 99 - a);
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `${a} plus ${b}?`, visual: null, answer: a + b,
          hint: "Add the tens, then the ones.", steps: [`Tens: ${Math.floor(a / 10) * 10} + ${Math.floor(b / 10) * 10}.`, `Then the ones.`, `Total ${a + b}!`] }; }
    },
    "y2.sub.2dig": {
      name: "Take Bigger", icon: "➖", island: "y2.addsub", unit: "y2.a", prereqs: ["y2.add.2dig"],
      gen(d) { const a = ri(lerp(30, 60, d), 99), b = ri(5, a - 1);
        return { format: "keypad", prompt: `${a} − ${b} = ?`, say: `${a} take away ${b}?`, visual: null, answer: a - b,
          hint: "Count back, or take tens then ones.", steps: [`Start at ${a}.`, `Take away ${b}.`, `That leaves ${a - b}!`] }; }
    },
    "y2.add.facts": {
      name: "Facts to 20", icon: "⚡", island: "y2.addsub", unit: "y2.a", prereqs: [],
      gen(d) { const a = ri(1, 19), b = ri(1, 20 - a);
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `${a} plus ${b}?`, visual: null, answer: a + b,
          hint: "You know these by heart!", steps: [`${a} plus ${b}.`, "Recall the fact.", `${a + b}!`] }; }
    },
    "y2.missing": {
      name: "Find the Unknown", icon: "🧩", island: "y2.addsub", unit: "y2.a", prereqs: ["y2.add.2dig"],
      gen(d) { const t = ri(lerp(15, 40, d), 99), a = ri(1, t), ans = t - a;
        return { format: "keypad", prompt: `${a} + ❓ = ${t}`, say: `${a} plus what makes ${t}?`, visual: null, answer: ans,
          hint: "Subtract to find the missing part.", steps: [`${t} take away ${a}.`, "That's the missing number.", `It's ${ans}!`] }; }
    },
    "y2.pattern.add": {
      name: "Growing Patterns", icon: "📈", island: "y2.addsub", unit: "y2.pat", prereqs: [],
      gen(d) { const step = pick([2, 3, 5, 10]), up = Math.random() < 0.6, start = up ? step * ri(0, 3) : step * ri(5, 9);
        const seq = [0, 1, 2, 3, 4].map(i => start + (up ? 1 : -1) * i * step), miss = ri(1, 3), ans = seq[miss];
        const shown = seq.map((v, i) => i === miss ? "❓" : v).join(", ");
        return { format: "keypad", prompt: `${shown}`, say: "What number is missing?", visual: null, answer: ans,
          hint: `It ${up ? "grows" : "shrinks"} by ${step}.`, steps: [`The jump is ${step}.`, up ? "Each step adds it." : "Each step takes it away.", `Missing: ${ans}!`] }; }
    },

    /* — ✖️ Times & Groups Grove — */
    "y2.mult.twos": {
      name: "Two Times", icon: "✖️", island: "y2.mult", unit: "y2.x", prereqs: [],
      gen(d) { const a = ri(1, lerp(5, 10, d));
        return { format: "keypad", prompt: `2 × ${a} = ?`, say: `Two times ${a}?`, visual: null, answer: 2 * a,
          hint: "Double it!", steps: [`Two groups of ${a}.`, `${a} + ${a}.`, `That's ${2 * a}!`] }; }
    },
    "y2.mult.array": {
      name: "Array Bay", icon: "🧇", island: "y2.mult", unit: "y2.x", prereqs: ["y2.mult.twos"],
      gen(d) { const r = ri(2, lerp(3, 5, d)), c = ri(2, 5);
        return { format: "keypad", prompt: `${r} rows of ${c}. How many?`, say: `${r} rows of ${c}?`, visual: (rep("🟦", c) + "\n").repeat(r).trim(),
          answer: r * c, hint: "Rows times columns.", steps: [`${r} rows.`, `${c} in each.`, `${r} × ${c} = ${r * c}!`] }; }
    },
    "y2.mult.repeat": {
      name: "Repeated Add", icon: "🔁", island: "y2.mult", unit: "y2.x", prereqs: ["y2.mult.twos"],
      gen(d) { const g = ri(2, lerp(3, 6, d)), per = pick([2, 5, 10]);
        return { format: "keypad", prompt: `${g} groups of ${per} = ?`, say: `${g} groups of ${per}?`, visual: Array(g).fill(per).join(" + "),
          answer: g * per, hint: `Add ${per}, ${g} times.`, steps: [`${Array(g).fill(per).join(" + ")}.`, `Skip count by ${per}.`, `That's ${g * per}!`] }; }
    },
    "y2.div.share": {
      name: "Share It Out", icon: "➗", island: "y2.mult", unit: "y2.div", prereqs: ["y2.mult.twos"],
      gen(d) { const g = ri(2, 5), per = ri(2, lerp(3, 6, d)), total = g * per;
        return { format: "keypad", prompt: `${total} ÷ ${g} = ?`, say: `${total} shared between ${g}?`, visual: null, answer: per,
          hint: "How many in each group?", steps: [`Share ${total} into ${g} groups.`, "Deal them out.", `Each gets ${per}!`] }; }
    },
    "y2.double": {
      name: "Double & Halve", icon: "👯", island: "y2.mult", unit: "y2.div", prereqs: [],
      gen(d) { if (Math.random() < 0.5) { const n = ri(2, lerp(10, 20, d)); return { format: "keypad", prompt: `Double ${n} = ?`, say: `Double ${n}?`, visual: null, answer: 2 * n, hint: "Add it to itself.", steps: [`${n} + ${n}.`, "Double it.", `${2 * n}!`] }; }
        const h = ri(2, lerp(6, 12, d)); return { format: "keypad", prompt: `Half of ${2 * h} = ?`, say: `Half of ${2 * h}?`, visual: null, answer: h, hint: "Split into two equal parts.", steps: [`Halve ${2 * h}.`, "Two equal parts.", `Each is ${h}!`] }; }
    },

    /* — 🍕 Fraction Fields — */
    "y2.frac.name": {
      name: "Name the Fraction", icon: "🍕", island: "y2.frac", unit: "y2.f", prereqs: [],
      gen(d) { const den = pick([2, 4, 8]), NAME = { 2: "halves", 4: "quarters", 8: "eighths" };
        const cand = ["1/2", "1/4", "1/8"]; const right = `1/${den}`;
        return { format: "choice", prompt: `A whole is cut into ${den} equal parts. 1 part is shaded. What fraction is that?`, say: `One of ${den} equal parts?`,
          visual: rep("🟩", 1) + rep("⬜", den - 1), choices: shuffle(cand.map(l => ({ label: l, correct: l === right }))),
          hint: `${den} equal parts means ${NAME[den]}.`, steps: [`The whole has ${den} parts.`, "One is shaded.", `That's ${right}!`] }; }
    },
    "y2.frac.half": {
      name: "Half Of", icon: "🌗", island: "y2.frac", unit: "y2.f", prereqs: [],
      gen(d) { const k = ri(1, lerp(5, 12, d)), n = 2 * k;
        return { format: "keypad", prompt: `Half of ${n} = ?`, say: `Half of ${n}?`, visual: null, answer: k,
          hint: "Share into 2 equal parts.", steps: [`Split ${n} in two.`, "Equal parts.", `Each is ${k}!`] }; }
    },
    "y2.frac.quarter": {
      name: "Quarter Of", icon: "🍰", island: "y2.frac", unit: "y2.f", prereqs: ["y2.frac.half"],
      gen(d) { const k = ri(1, lerp(3, 6, d)), n = 4 * k;
        return { format: "keypad", prompt: `A quarter of ${n} = ?`, say: `A quarter of ${n}?`, visual: null, answer: k,
          hint: "Share into 4 equal parts.", steps: [`Split ${n} into 4.`, "Equal parts.", `Each is ${k}!`] }; }
    },
    "y2.frac.eighth": {
      name: "Eighth Of", icon: "🍫", island: "y2.frac", unit: "y2.f2", prereqs: ["y2.frac.quarter"],
      gen(d) { const k = ri(1, lerp(2, 5, d)), n = 8 * k;
        return { format: "keypad", prompt: `An eighth of ${n} = ?`, say: `One eighth of ${n}?`, visual: null, answer: k,
          hint: "Share into 8 equal parts.", steps: [`Split ${n} into 8.`, "Equal parts.", `Each is ${k}!`] }; }
    },
    "y2.frac.whole": {
      name: "Make a Whole", icon: "⭕", island: "y2.frac", unit: "y2.f2", prereqs: ["y2.frac.name"],
      gen(d) { const den = pick([2, 4, 8]), NAME = { 2: "halves", 4: "quarters", 8: "eighths" };
        return { format: "keypad", prompt: `How many ${NAME[den]} make one whole?`, say: `How many ${NAME[den]} in a whole?`, visual: null, answer: den,
          hint: "Count the equal parts.", steps: [`A whole splits into ${den}.`, `That's all the ${NAME[den]}.`, `Answer: ${den}!`] }; }
    },

    /* — 📐 Measure & Time Mesa — */
    "y2.meas.units": {
      name: "Measure It", icon: "📐", island: "y2.meastime", unit: "y2.me", prereqs: [],
      gen(d) { const len = ri(3, lerp(6, 12, d));
        return { format: "keypad", prompt: "How many paperclips long?", say: "How many units long?", visual: "📏 " + rep("📎", len),
          answer: len, hint: "Count each unit, no gaps.", steps: ["Line them up.", "Count them.", `It's ${len} long!`] }; }
    },
    "y2.meas.compare": {
      name: "Order Lengths", icon: "📊", island: "y2.meastime", unit: "y2.me", prereqs: ["y2.meas.units"],
      gen(d) { const set = new Set(); while (set.size < 3) set.add(ri(2, 12)); const correct = [...set].sort((a, b) => a - b);
        return { format: "order", prompt: "Order the lengths shortest to longest (units)!", say: "Order shortest to longest.", visual: correct.map ? null : null,
          items: shuffle(correct), correct, hint: "Fewer units = shorter.", steps: ["Compare the unit counts.", "Smallest first.", "Order them!"] }; }
    },
    "y2.time.read": {
      name: "Clock Reader", icon: "🕒", island: "y2.meastime", unit: "y2.t", prereqs: [],
      gen(d) { const h = ri(1, 12), half = Math.random() < 0.5;
        return { format: "choice", prompt: "What time is it?", say: "What time is it?", visual: half ? CLOCK_HALF[h % 12] : CLOCK_HOUR[h % 12],
          choices: hourLabels(h, half), hint: "Short hand = hour, long hand = minutes.", steps: ["Read the short hand.", half ? "Long hand down = half past." : "Long hand up = o'clock.", `It's ${half ? "half past " + h : h + " o'clock"}!`] }; }
    },
    "y2.time.quarter": {
      name: "Quarter Past", icon: "🕓", island: "y2.meastime", unit: "y2.t", prereqs: ["y2.time.read"],
      gen(d) { const h = ri(1, 12);
        const opts = [`${h}:15`, `${h}:30`, `${h}:45`, `${h}:00`];
        return { format: "choice", prompt: `What is QUARTER PAST ${h} on a digital clock?`, say: `Quarter past ${h}?`, visual: null,
          choices: shuffle(opts.map(l => ({ label: l, correct: l === `${h}:15` }))), hint: "A quarter of an hour is 15 minutes.",
          steps: ["An hour has 60 minutes.", "A quarter is 15.", `So ${h}:15!`] }; }
    },
    "y2.turns": {
      name: "Turns", icon: "🔄", island: "y2.meastime", unit: "y2.t", prereqs: [],
      gen(d) { const opt = pick([["a HALF", 2], ["a THREE-QUARTER", 3], ["a FULL", 4]]);
        return { format: "keypad", prompt: `${opt[0]} turn is how many QUARTER turns?`, say: `${opt[0]} turn is how many quarter turns?`, visual: null, answer: opt[1],
          hint: "Four quarter turns make a full turn.", steps: ["A full turn = 4 quarters.", "Count the quarters.", `That's ${opt[1]}!`] }; }
    },
    "y2.calendar": {
      name: "Calendar Clues", icon: "📅", island: "y2.meastime", unit: "y2.cal", prereqs: [],
      gen(d) { if (Math.random() < 0.5) { const FACTS = [["days in a week", 7], ["months in a year", 12], ["days in a fortnight", 14], ["seasons in a year", 4]]; const f = pick(FACTS);
          return { format: "keypad", prompt: `How many ${f[0]}?`, say: `How many ${f[0]}?`, visual: null, answer: f[1], hint: "A calendar fact to remember.", steps: ["Think of the calendar.", "Recall the fact.", `It's ${f[1]}!`] }; }
        const mi = ri(0, 11), next = MONTHS[(mi + 1) % 12], others = shuffle(MONTHS.filter(m => m !== next)).slice(0, 3);
        return { format: "choice", prompt: `Which month comes after ${MONTHS[mi]}?`, say: `What comes after ${MONTHS[mi]}?`, visual: null,
          choices: shuffle([{ label: next, correct: true }, ...others.map(m => ({ label: m, correct: false }))]),
          hint: "Say the months in order.", steps: [`Start at ${MONTHS[mi]}.`, "Say the next month.", `It's ${next}!`] }; }
    },

    /* — 🧭 Shape & Map Marsh — */
    "y2.shape.sides": {
      name: "Side Count", icon: "📐", island: "y2.space", unit: "y2.sh", prereqs: [],
      gen(d) { const SH = [["triangle", 3], ["square", 4], ["pentagon", 5], ["hexagon", 6], ["octagon", 8]], t = pick(SH);
        return { format: "choice", prompt: `How many sides does a ${t[0]} have?`, say: `How many sides on a ${t[0]}?`, visual: null,
          choices: numChoices(t[1], 3, 8), hint: "Each name tells the number of sides.", steps: [`A ${t[0]}…`, "count its sides.", `${t[1]} sides!`] }; }
    },
    "y2.shape.classify": {
      name: "Shape by Sides", icon: "🔷", island: "y2.space", unit: "y2.sh", prereqs: ["y2.shape.sides"],
      gen(d) { const SH = [["triangle", 3], ["square", 4], ["pentagon", 5], ["hexagon", 6]], t = pick(SH), others = shuffle(SH.filter(s => s[1] !== t[1])).slice(0, 3);
        return { format: "choice", prompt: `Which shape has ${t[1]} sides?`, say: `Which shape has ${t[1]} sides?`, visual: null,
          choices: shuffle([{ label: t[0], correct: true }, ...others.map(o => ({ label: o[0], correct: false }))]),
          hint: "Match the side count to the name.", steps: [`I need ${t[1]} sides.`, "Find that shape.", `It's a ${t[0]}!`] }; }
    },
    "y2.solid.faces": {
      name: "Cube Features", icon: "🧊", island: "y2.space", unit: "y2.sh", prereqs: ["y2.shape.sides"],
      gen(d) { const F = [["faces", 6], ["corners", 8], ["edges", 12]], f = pick(F);
        return { format: "keypad", prompt: `How many ${f[0]} does a cube have?`, say: `How many ${f[0]} on a cube?`, visual: "🧊", answer: f[1],
          hint: "Picture a dice.", steps: ["Think of a cube.", `Count its ${f[0]}.`, `That's ${f[1]}!`] }; }
    },
    "y2.position.dir": {
      name: "Which Way", icon: "🧭", island: "y2.space", unit: "y2.map", prereqs: [],
      gen(d) { const targetRight = Math.random() < 0.5;
        const row = targetRight ? "🐢 ⬜ ⬜ 🏁" : "🏁 ⬜ ⬜ 🐢";
        return { format: "choice", prompt: "Which way must 🐢 go to reach 🏁?", say: "Which way to the flag?", visual: row,
          choices: shuffle([{ label: "right ➡️", correct: targetRight }, { label: "left ⬅️", correct: !targetRight }]),
          hint: "Look where the flag is.", steps: ["Find 🐢 and 🏁.", "Which side is the flag?", `Go ${targetRight ? "right" : "left"}!`] }; }
    },
    "y2.position.ordinal": {
      name: "Which Position", icon: "📍", island: "y2.space", unit: "y2.map", prereqs: [],
      gen(d) { const row = shuffle(["🏠", "🏪", "🏫", "🏥", "🏦"]).slice(0, ri(4, 5)); const ORD = ["1st", "2nd", "3rd", "4th", "5th"]; const n = ri(0, row.length - 1);
        return { format: "choice", prompt: `Which building is ${ORD[n]} from the LEFT?`, say: `Which is ${ORD[n]} from the left?`, visual: row.join("   "),
          choices: shuffle(row.map((x, i) => ({ label: x, correct: i === n }))), hint: "Count from the left.",
          steps: ["Start at the left.", `Count to ${ORD[n]}.`, "Tap it!"] }; }
    },
  };

  const Y2ISLANDS = [
    { id: "y2.pv", name: "Place Value Plaza", emoji: "🏯",
      boss: { name: "Grand Thousand", emoji: "👑", line: "Master hundreds, tens and ones to enter!" },
      units: [
        { id: "y2.p1", name: "Compare & Order", skills: ["y2.pv.compare", "y2.pv.order"] },
        { id: "y2.p2", name: "Place Value", skills: ["y2.pv.place", "y2.pv.partition", "y2.pv.morestep"] },
      ] },
    { id: "y2.addsub", name: "Strategy Springs", emoji: "➕",
      boss: { name: "Flo the Platypus", emoji: "🦫", line: "Add, take and spot the pattern to pass!" },
      units: [
        { id: "y2.a", name: "Add & Subtract", skills: ["y2.add.2dig", "y2.sub.2dig", "y2.add.facts", "y2.missing"] },
        { id: "y2.pat", name: "Patterns", skills: ["y2.pattern.add"] },
      ] },
    { id: "y2.mult", name: "Times & Groups Grove", emoji: "✖️",
      boss: { name: "Cinder the Dragon", emoji: "🐉", line: "Show me groups and shares to pass!" },
      units: [
        { id: "y2.x", name: "Multiply", skills: ["y2.mult.twos", "y2.mult.array", "y2.mult.repeat"] },
        { id: "y2.div", name: "Share & Double", skills: ["y2.div.share", "y2.double"] },
      ] },
    { id: "y2.frac", name: "Fraction Fields", emoji: "🍕",
      boss: { name: "Pippa the Possum", emoji: "🐨", line: "Split it fairly and the fields are yours!" },
      units: [
        { id: "y2.f", name: "Halves & Quarters", skills: ["y2.frac.name", "y2.frac.half", "y2.frac.quarter"] },
        { id: "y2.f2", name: "Eighths & Wholes", skills: ["y2.frac.eighth", "y2.frac.whole"] },
      ] },
    { id: "y2.meastime", name: "Measure & Time Mesa", emoji: "📐",
      boss: { name: "Chrono the Echidna", emoji: "🦔", line: "Measure, turn and tell the time to pass!" },
      units: [
        { id: "y2.me", name: "Measuring", skills: ["y2.meas.units", "y2.meas.compare"] },
        { id: "y2.t", name: "Time & Turns", skills: ["y2.time.read", "y2.time.quarter", "y2.turns"] },
        { id: "y2.cal", name: "Calendar", skills: ["y2.calendar"] },
      ] },
    { id: "y2.space", name: "Shape & Map Marsh", emoji: "🧭",
      boss: { name: "Marlo the Heron", emoji: "🦢", line: "Sort my shapes and read the map to pass!" },
      units: [
        { id: "y2.sh", name: "Shapes", skills: ["y2.shape.sides", "y2.shape.classify", "y2.solid.faces"] },
        { id: "y2.map", name: "Position & Maps", skills: ["y2.position.dir", "y2.position.ordinal"] },
      ] },
  ];

  /* ===================== SCHOOL YEARS ===================== */
  /* Each school year is a self-contained curriculum: 6 unique islands of lessons.
     Years not yet authored fall back to the Explorer map (the original spiral)
     so every selection is fully playable while the remaining years are built. */
  const YEARS = [
    { id: "foundation", label: "Prep / Foundation", emoji: "🐣" },
    { id: "year1", label: "Year 1", emoji: "1️⃣" },
    { id: "year2", label: "Year 2", emoji: "2️⃣" },
    { id: "year3", label: "Year 3", emoji: "3️⃣" },
    { id: "year4", label: "Year 4", emoji: "4️⃣" },
    { id: "year5", label: "Year 5", emoji: "5️⃣" },
    { id: "year6", label: "Year 6", emoji: "6️⃣" },
  ];
  const EXPLORER = { islands: ISLANDS, skills: SKILLS, young: ["sprout", "bridge"] };
  const CURRICULA = {
    foundation: { islands: FISLANDS, skills: FSKILLS },
    year1: { islands: Y1ISLANDS, skills: Y1SKILLS },
    year2: { islands: Y2ISLANDS, skills: Y2SKILLS },
  };
  const youngOf = (c) => c.young || c.islands.filter(i => i.young).map(i => i.id);
  function curriculumFor(yearId) {
    const c = CURRICULA[yearId];
    if (c) return { ISLANDS: c.islands, SKILLS: c.skills, YOUNG: new Set(youngOf(c)), year: yearId, draft: false };
    return { ISLANDS: EXPLORER.islands, SKILLS: EXPLORER.skills, YOUNG: new Set(EXPLORER.young), year: yearId || null, draft: true };
  }

  const BT = { ISLANDS, SKILLS, YEARS, curriculumFor, YOUNG: new Set(EXPLORER.young), activeYear: null, activeDraft: true };
  /* swap the live curriculum the app reads (BT.ISLANDS / BT.SKILLS / BT.YOUNG) */
  BT.use = function (yearId) {
    const c = curriculumFor(yearId);
    BT.ISLANDS = c.ISLANDS; BT.SKILLS = c.SKILLS; BT.YOUNG = c.YOUNG;
    BT.activeYear = c.year; BT.activeDraft = c.draft;
    return c;
  };
  return BT;
})();

if (typeof window !== "undefined") window.BT = BT;
if (typeof module !== "undefined" && module.exports) module.exports = BT;
