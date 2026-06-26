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

  /* ===================== YEARS 3–6 (ACARA v9) ===================== */
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const fracChoice = (right, pool) => { const seen = new Set([right]); const out = [{ label: right, correct: true }]; for (const c of shuffle(pool)) { if (out.length < 4 && !seen.has(c)) { seen.add(c); out.push({ label: c, correct: false }); } } return shuffle(out); };
  const PCT = [10, 20, 25, 50, 75, 100];

  /* ---------- YEAR 3 ---------- */
  const Y3SKILLS = {
    "y3.num.place": { name: "Place Value", icon: "🔢", island: "y3.num", unit: "y3.n1", prereqs: [],
      gen(d) { const n = ri(1000, lerp(3000, 9999, d)), PL = ["thousands", "hundreds", "tens", "ones"], pi = ri(0, 3), digs = String(n).padStart(4, "0");
        return { format: "keypad", prompt: `In ${n}, which digit is in the ${PL[pi]} place?`, say: `Which digit is in the ${PL[pi]} place of ${n}?`, visual: null, answer: +digs[pi], hint: "Thousands, hundreds, tens, ones.", steps: [`Read ${n}.`, `Find the ${PL[pi]} column.`, `It's ${+digs[pi]}!`] }; } },
    "y3.num.compare": { name: "Compare Big", icon: "🔝", island: "y3.num", unit: "y3.n1", prereqs: ["y3.num.place"],
      gen(d) { const hi = lerp(1000, 9999, d); let a = ri(100, hi), b = ri(100, hi); while (b === a) b = ri(100, hi); const big = Math.max(a, b);
        return { format: "choice", prompt: "Which is BIGGER?", say: "Which is bigger?", visual: null, choices: shuffle([{ label: String(a), correct: a === big }, { label: String(b), correct: b === big }]), hint: "Compare the thousands first.", steps: ["Line up the digits.", "Compare left to right.", `${big} wins!`] }; } },
    "y3.num.order": { name: "Order to 9999", icon: "🚂", island: "y3.num", unit: "y3.n1", prereqs: ["y3.num.compare"],
      gen(d) { const hi = lerp(1000, 9999, d), s = new Set(); while (s.size < 4) s.add(ri(100, hi)); const correct = [...s].sort((a, b) => a - b);
        return { format: "order", prompt: "Tap smallest to biggest!", say: "Order smallest to biggest.", visual: null, items: shuffle(correct), correct, hint: "Smallest first.", steps: ["Find the smallest.", "Then the next.", "Order them!"] }; } },
    "y3.num.round10": { name: "Round to 10", icon: "🎯", island: "y3.num", unit: "y3.n2", prereqs: ["y3.num.place"],
      gen(d) { const n = ri(11, lerp(99, 499, d));
        return { format: "keypad", prompt: `Round ${n} to the nearest 10`, say: `Round ${n} to the nearest ten.`, visual: null, answer: Math.round(n / 10) * 10, hint: "Look at the ones digit.", steps: [`Ones digit of ${n}.`, "5 or more rounds up.", `It's ${Math.round(n / 10) * 10}!`] }; } },
    "y3.num.round100": { name: "Round to 100", icon: "💯", island: "y3.num", unit: "y3.n2", prereqs: ["y3.num.round10"],
      gen(d) { const n = ri(50, lerp(499, 999, d));
        return { format: "keypad", prompt: `Round ${n} to the nearest 100`, say: `Round ${n} to the nearest hundred.`, visual: null, answer: Math.round(n / 100) * 100, hint: "Look at the tens digit.", steps: [`Tens digit of ${n}.`, "5 or more rounds up.", `It's ${Math.round(n / 100) * 100}!`] }; } },

    "y3.add.3dig": { name: "Add Big", icon: "➕", island: "y3.addsub", unit: "y3.a", prereqs: [],
      gen(d) { const a = ri(20, lerp(200, 500, d)), b = ri(20, Math.min(499, 999 - a));
        return { format: "keypad", prompt: `${a} + ${b} = ?`, say: `${a} plus ${b}?`, visual: null, answer: a + b, hint: "Add hundreds, tens, then ones.", steps: ["Add the hundreds.", "Add tens and ones.", `Total ${a + b}!`] }; } },
    "y3.sub.3dig": { name: "Take Big", icon: "➖", island: "y3.addsub", unit: "y3.a", prereqs: ["y3.add.3dig"],
      gen(d) { const a = ri(lerp(120, 400, d), 999), b = ri(10, a - 1);
        return { format: "keypad", prompt: `${a} − ${b} = ?`, say: `${a} take away ${b}?`, visual: null, answer: a - b, hint: "Subtract place by place.", steps: [`Start at ${a}.`, `Take ${b}.`, `Leaves ${a - b}!`] }; } },
    "y3.missing": { name: "Find Unknown", icon: "🧩", island: "y3.addsub", unit: "y3.a", prereqs: ["y3.add.3dig"],
      gen(d) { const t = ri(lerp(30, 200, d), 500), a = ri(1, t), ans = t - a;
        return { format: "keypad", prompt: `${a} + ❓ = ${t}`, say: `${a} plus what makes ${t}?`, visual: null, answer: ans, hint: "Subtract to find it.", steps: [`${t} − ${a}.`, "That's the missing part.", `${ans}!`] }; } },
    "y3.money.change": { name: "Money & Change", icon: "🪙", island: "y3.addsub", unit: "y3.money", prereqs: [],
      gen(d) { const cost = ri(2, 9), paid = pick([10, 20]);
        return { format: "keypad", prompt: `A toy costs $${cost}. You pay with $${paid}. Change?`, say: `Change from ${paid} dollars?`, visual: null, answer: paid - cost, hint: "Take the cost from what you paid.", steps: [`Paid $${paid}.`, `Cost $${cost}.`, `Change $${paid - cost}!`] }; } },

    "y3.mult.facts": { name: "Times Tables", icon: "✖️", island: "y3.mult", unit: "y3.x", prereqs: [],
      gen(d) { const t = pick([3, 4, 5, 10]), a = ri(1, lerp(6, 10, d));
        return { format: "keypad", prompt: `${t} × ${a} = ?`, say: `${t} times ${a}?`, visual: null, answer: t * a, hint: `Skip count by ${t}.`, steps: [`${a} groups of ${t}.`, `Skip count by ${t}.`, `${t * a}!`] }; } },
    "y3.div.facts": { name: "Division Facts", icon: "➗", island: "y3.mult", unit: "y3.x", prereqs: ["y3.mult.facts"],
      gen(d) { const t = pick([3, 4, 5, 10]), q = ri(1, lerp(6, 10, d)), total = t * q;
        return { format: "keypad", prompt: `${total} ÷ ${t} = ?`, say: `${total} divided by ${t}?`, visual: null, answer: q, hint: "How many groups?", steps: [`Share ${total} into ${t}s.`, "Count the groups.", `${q}!`] }; } },
    "y3.mult.missing": { name: "Missing Factor", icon: "🔍", island: "y3.mult", unit: "y3.x", prereqs: ["y3.mult.facts"],
      gen(d) { const t = pick([3, 4, 5, 10]), a = ri(2, 10);
        return { format: "keypad", prompt: `${t} × ❓ = ${t * a}`, say: `${t} times what makes ${t * a}?`, visual: null, answer: a, hint: "Divide to undo.", steps: [`${t * a} ÷ ${t}.`, "Find the factor.", `${a}!`] }; } },
    "y3.mult.pattern": { name: "Multiple Patterns", icon: "📈", island: "y3.mult", unit: "y3.pat", prereqs: ["y3.mult.facts"],
      gen(d) { const t = pick([3, 4, 5]), start = t * ri(1, 3), seq = [start, start + t, start + 2 * t], ans = start + 3 * t;
        return { format: "choice", prompt: `${seq.join(", ")}, … next?`, say: "What comes next?", visual: null, choices: numChoices(ans, Math.max(0, ans - 12), ans + 12), hint: `Multiples of ${t}.`, steps: [`Adding ${t}.`, `${seq[2]} + ${t}.`, `${ans}!`] }; } },

    "y3.frac.name": { name: "Name Fraction", icon: "🍕", island: "y3.frac", unit: "y3.f", prereqs: [],
      gen(d) { const den = pick([2, 3, 4, 5]), num = ri(1, den - 1), right = `${num}/${den}`;
        return { format: "choice", prompt: "What fraction is shaded?", say: "What fraction is shaded?", visual: rep("🟩", num) + rep("⬜", den - num), choices: fracChoice(right, [`${den - num}/${den}`, `${num}/${den + 1}`, `${num + 1}/${den}`, `1/${den}`]), hint: "Shaded over total parts.", steps: [`${den} parts in all.`, `${num} shaded.`, `${right}!`] }; } },
    "y3.frac.ofqty": { name: "Fraction Of", icon: "🍰", island: "y3.frac", unit: "y3.f", prereqs: ["y3.frac.name"],
      gen(d) { const den = pick([2, 3, 4, 5]), k = ri(1, lerp(3, 6, d)), n = den * k;
        return { format: "keypad", prompt: `1/${den} of ${n} = ?`, say: `One ${den === 2 ? "half" : den + "th"} of ${n}?`, visual: null, answer: k, hint: `Share ${n} into ${den} equal parts.`, steps: [`Split ${n} into ${den}.`, "Equal groups.", `Each is ${k}!`] }; } },
    "y3.frac.compare": { name: "Which is Bigger", icon: "⚖️", island: "y3.frac", unit: "y3.f", prereqs: ["y3.frac.name"],
      gen(d) { const dens = shuffle([2, 3, 4, 5]).slice(0, 2), big = Math.min(...dens);
        return { format: "choice", prompt: "Which fraction is BIGGER?", say: "Which is bigger?", visual: null, choices: shuffle(dens.map(x => ({ label: `1/${x}`, correct: x === big }))), hint: "Fewer parts means bigger pieces.", steps: ["Same top (1).", "Smaller bottom = bigger piece.", `1/${big}!`] }; } },
    "y3.frac.multiple": { name: "Count Fractions", icon: "🔢", island: "y3.frac", unit: "y3.f2", prereqs: ["y3.frac.name"],
      gen(d) { const den = pick([3, 4, 5]), k = ri(1, den - 1), ans = `${k + 1}/${den}`;
        return { format: "choice", prompt: `${[...Array(k)].map((_, i) => `${i + 1}/${den}`).join(", ")}, … next?`, say: "What comes next?", visual: null, choices: fracChoice(ans, [`${k}/${den}`, `${k + 2}/${den}`, `1/${den}`]), hint: `Count up by 1/${den}.`, steps: [`Add 1/${den}.`, `After ${k}/${den}.`, `${ans}!`] }; } },

    "y3.measure.unit": { name: "Best Unit", icon: "📐", island: "y3.measure", unit: "y3.m", prereqs: [],
      gen(d) { const T = [["the length of a pencil", "cm"], ["the distance to school", "km"], ["a bag of apples", "kg"], ["water in a bottle", "L"], ["a feather", "g"]]; const t = pick(T), opts = ["cm", "km", "kg", "L", "g"];
        const choices = shuffle([{ label: t[1], correct: true }, ...shuffle(opts.filter(o => o !== t[1])).slice(0, 3).map(o => ({ label: o, correct: false }))]);
        return { format: "choice", prompt: `Best unit to measure ${t[0]}?`, say: `Best unit for ${t[0]}?`, visual: null, choices, hint: "Match the size to the unit.", steps: ["Think of the size.", "Pick the right unit.", `${t[1]}!`] }; } },
    "y3.time.convert": { name: "Time Units", icon: "⏱", island: "y3.measure", unit: "y3.m", prereqs: [],
      gen(d) { const F = [["minutes in an hour", 60], ["hours in a day", 24], ["minutes in half an hour", 30], ["seconds in a minute", 60]]; const f = pick(F);
        return { format: "keypad", prompt: `How many ${f[0]}?`, say: `How many ${f[0]}?`, visual: null, answer: f[1], hint: "A time fact.", steps: ["Recall the unit.", "Count it.", `${f[1]}!`] }; } },
    "y3.time.elapsed": { name: "How Long", icon: "🕐", island: "y3.measure", unit: "y3.m", prereqs: ["y3.time.convert"],
      gen(d) { const start = ri(1, 9), mins = pick([10, 15, 20, 30, 45]);
        return { format: "keypad", prompt: `A show starts at ${start}:00 and ends at ${start}:${String(mins).padStart(2, "0")}. How many minutes long?`, say: `How many minutes long?`, visual: null, answer: mins, hint: "Count from the start.", steps: [`Start ${start}:00.`, `End ${start}:${String(mins).padStart(2, "0")}.`, `${mins} minutes!`] }; } },
    "y3.angle.right": { name: "Right Angle?", icon: "📐", island: "y3.measure", unit: "y3.ang", prereqs: [],
      gen(d) { const deg = pick([30, 45, 60, 90, 120, 150]), ans = deg < 90 ? "smaller" : deg === 90 ? "a right angle" : "bigger";
        return { format: "choice", prompt: `An angle of ${deg}°. Compared to a right angle (90°) it is…`, say: `${deg} degrees compared to a right angle?`, visual: null, choices: shuffle([{ label: "smaller", correct: ans === "smaller" }, { label: "a right angle", correct: ans === "a right angle" }, { label: "bigger", correct: ans === "bigger" }]), hint: "A right angle is 90°.", steps: ["Right angle = 90°.", `Compare ${deg}°.`, `It's ${ans}!`] }; } },
    "y3.symmetry": { name: "Line Symmetry", icon: "🦋", island: "y3.measure", unit: "y3.ang", prereqs: [],
      gen(d) { const SYM = ["❤️", "⭐", "🟦", "🔺", "🦋", "🔷"], NO = ["🐟", "🅿️", "🌙", "✋", "🦶"]; const yes = Math.random() < 0.5; const e = yes ? pick(SYM) : pick(NO);
        return { format: "tf", prompt: `Does ${e} have matching halves (a line of symmetry)?`, say: "Does it have matching halves?", visual: e, answer: yes, hint: "Could you fold it onto itself?", steps: ["Imagine folding it.", "Do the halves match?", yes ? "Yes!" : "No!"] }; } },

    "y3.data.read": { name: "Read Graph", icon: "📊", island: "y3.data", unit: "y3.d", prereqs: [],
      gen(d) { const es = shuffle(["🍎", "🍌", "🍓", "🍊"]).slice(0, 3), cs = (() => { const s = new Set(); while (s.size < 3) s.add(ri(1, 6)); return [...s]; })(), t = ri(0, 2);
        return { format: "keypad", prompt: `How many chose ${es[t]}?`, say: `How many for ${es[t]}?`, visual: es.map((e, i) => `${e}  ${rep(e, cs[i])}`).join("\n"), answer: cs[t], hint: "Count that row.", steps: [`Find ${es[t]}.`, "Count it.", `${cs[t]}!`] }; } },
    "y3.data.compare": { name: "How Many More", icon: "➕", island: "y3.data", unit: "y3.d", prereqs: ["y3.data.read"],
      gen(d) { const es = shuffle(["🍎", "🍌", "🍓"]).slice(0, 2), cs = (() => { const s = new Set(); while (s.size < 2) s.add(ri(1, 6)); return [...s]; })(), hi = cs[0] > cs[1] ? 0 : 1, lo = 1 - hi;
        return { format: "keypad", prompt: `How many MORE ${es[hi]} than ${es[lo]}?`, say: "How many more?", visual: es.map((e, i) => `${e}  ${rep(e, cs[i])}`).join("\n"), answer: cs[hi] - cs[lo], hint: "Find the difference.", steps: [`${cs[hi]} and ${cs[lo]}.`, "Subtract.", `${cs[hi] - cs[lo]}!`] }; } },
    "y3.chance.word": { name: "How Likely", icon: "🎲", island: "y3.data", unit: "y3.ch", prereqs: [],
      gen(d) { const EV = [["The sun will rise tomorrow", "certain"], ["A pig will fly", "impossible"], ["You will roll a 7 on a normal dice", "impossible"], ["Tomorrow comes after today", "certain"], ["It might rain this week", "might happen"], ["You flip a coin and get heads", "might happen"]]; const e = pick(EV);
        return { format: "choice", prompt: `"${e[0]}" — how likely?`, say: "How likely is it?", visual: null, choices: shuffle([{ label: "certain", correct: e[1] === "certain" }, { label: "might happen", correct: e[1] === "might happen" }, { label: "impossible", correct: e[1] === "impossible" }]), hint: "Will it always, sometimes, or never happen?", steps: ["Think it through.", "Always? Sometimes? Never?", `It's ${e[1]}!`] }; } },
  };
  const Y3ISLANDS = [
    { id: "y3.num", name: "Number Nest", emoji: "🔢", boss: { name: "Rok the Eagle", emoji: "🦅", line: "Master big numbers to fly!" }, units: [{ id: "y3.n1", name: "Place & Order", skills: ["y3.num.place", "y3.num.compare", "y3.num.order"] }, { id: "y3.n2", name: "Rounding", skills: ["y3.num.round10", "y3.num.round100"] }] },
    { id: "y3.addsub", name: "Add & Take Trail", emoji: "➕", boss: { name: "Bramble the Bear", emoji: "🐻", line: "Add and take in the hundreds to pass!" }, units: [{ id: "y3.a", name: "3-Digit", skills: ["y3.add.3dig", "y3.sub.3dig", "y3.missing"] }, { id: "y3.money", name: "Money", skills: ["y3.money.change"] }] },
    { id: "y3.mult", name: "Times Table Trail", emoji: "✖️", boss: { name: "Cinder the Dragon", emoji: "🐉", line: "Know your tables to face my flames!" }, units: [{ id: "y3.x", name: "× and ÷", skills: ["y3.mult.facts", "y3.div.facts", "y3.mult.missing"] }, { id: "y3.pat", name: "Patterns", skills: ["y3.mult.pattern"] }] },
    { id: "y3.frac", name: "Fraction Falls", emoji: "🍕", boss: { name: "Misty the Wyrm", emoji: "💧", line: "Split it fairly to cross my falls!" }, units: [{ id: "y3.f", name: "Fractions", skills: ["y3.frac.name", "y3.frac.ofqty", "y3.frac.compare"] }, { id: "y3.f2", name: "Counting Fractions", skills: ["y3.frac.multiple"] }] },
    { id: "y3.measure", name: "Measure Mesa", emoji: "📐", boss: { name: "Quill the Echidna", emoji: "🦔", line: "Measure, time and angle to pass!" }, units: [{ id: "y3.m", name: "Units & Time", skills: ["y3.measure.unit", "y3.time.convert", "y3.time.elapsed"] }, { id: "y3.ang", name: "Angles & Symmetry", skills: ["y3.angle.right", "y3.symmetry"] }] },
    { id: "y3.data", name: "Data & Chance Den", emoji: "📊", boss: { name: "Pip the Magpie", emoji: "🐦", line: "Read my data and guess the chance!" }, units: [{ id: "y3.d", name: "Data", skills: ["y3.data.read", "y3.data.compare"] }, { id: "y3.ch", name: "Chance", skills: ["y3.chance.word"] }] },
  ];

  /* ---------- YEAR 4 ---------- */
  const Y4SKILLS = {
    "y4.num.place": { name: "Big Place Value", icon: "🔢", island: "y4.num", unit: "y4.n1", prereqs: [],
      gen(d) { const n = ri(10000, lerp(40000, 99999, d)), PL = ["ten-thousands", "thousands", "hundreds", "tens", "ones"], pi = ri(0, 4), digs = String(n).padStart(5, "0");
        return { format: "keypad", prompt: `In ${n}, which digit is in the ${PL[pi]} place?`, say: `Which digit is in the ${PL[pi]} place?`, visual: null, answer: +digs[pi], hint: "Read the columns left to right.", steps: [`Read ${n}.`, `Find ${PL[pi]}.`, `It's ${+digs[pi]}!`] }; } },
    "y4.num.round": { name: "Round to 1000", icon: "🎯", island: "y4.num", unit: "y4.n1", prereqs: ["y4.num.place"],
      gen(d) { const n = ri(1100, lerp(9000, 49999, d));
        return { format: "keypad", prompt: `Round ${n} to the nearest 1000`, say: `Round ${n} to the nearest thousand.`, visual: null, answer: Math.round(n / 1000) * 1000, hint: "Look at the hundreds digit.", steps: ["Hundreds digit.", "5+ rounds up.", `${Math.round(n / 1000) * 1000}!`] }; } },
    "y4.num.oddeven": { name: "Odd or Even", icon: "🔵", island: "y4.num", unit: "y4.n1", prereqs: [],
      gen(d) { const n = ri(2, lerp(50, 200, d)), even = n % 2 === 0;
        return { format: "choice", prompt: `Is ${n} odd or even?`, say: `Is ${n} odd or even?`, visual: null, choices: shuffle([{ label: "even", correct: even }, { label: "odd", correct: !even }]), hint: "Even numbers end in 0,2,4,6,8.", steps: [`Last digit of ${n}.`, "0/2/4/6/8 = even.", even ? "Even!" : "Odd!"] }; } },
    "y4.mult.facts": { name: "Tables to 10×10", icon: "✖️", island: "y4.num", unit: "y4.x", prereqs: [],
      gen(d) { const a = ri(2, lerp(6, 10, d)), b = ri(2, 10);
        return { format: "keypad", prompt: `${a} × ${b} = ?`, say: `${a} times ${b}?`, visual: null, answer: a * b, hint: "Recall your tables.", steps: [`${a} times ${b}.`, "Use a known fact.", `${a * b}!`] }; } },
    "y4.div.facts": { name: "Division to 100", icon: "➗", island: "y4.num", unit: "y4.x", prereqs: ["y4.mult.facts"],
      gen(d) { const a = ri(2, 10), b = ri(2, lerp(6, 10, d)), p = a * b;
        return { format: "keypad", prompt: `${p} ÷ ${a} = ?`, say: `${p} divided by ${a}?`, visual: null, answer: b, hint: "Use the matching times fact.", steps: [`${a} times what is ${p}?`, "Find it.", `${b}!`] }; } },
    "y4.factor": { name: "Factor Pairs", icon: "🔗", island: "y4.num", unit: "y4.x", prereqs: ["y4.mult.facts"],
      gen(d) { const a = ri(2, 9), b = ri(2, 9);
        return { format: "keypad", prompt: `${a} × ❓ = ${a * b}`, say: `${a} times what makes ${a * b}?`, visual: null, answer: b, hint: "A missing factor.", steps: [`${a * b} ÷ ${a}.`, "Find the factor.", `${b}!`] }; } },

    "y4.dec.tenths": { name: "Tenths", icon: "🔟", island: "y4.dec", unit: "y4.d1", prereqs: [],
      gen(d) { const t = ri(1, 9);
        return { format: "keypad", decimal: true, prompt: `${t} tenths as a decimal = ?`, say: `What is ${t} tenths as a decimal?`, visual: null, answer: t / 10, hint: "Tenths go after the point.", steps: [`${t} tenths.`, "Write 0 point.", `0.${t}!`] }; } },
    "y4.dec.place": { name: "Decimal Place", icon: "🔢", island: "y4.dec", unit: "y4.d1", prereqs: ["y4.dec.tenths"],
      gen(d) { const whole = ri(1, 9), ten = ri(1, 9);
        return { format: "keypad", prompt: `In ${whole}.${ten}, which digit is in the TENTHS place?`, say: `Which digit is in the tenths place?`, visual: null, answer: ten, hint: "Tenths is just after the point.", steps: [`Look after the point.`, "First spot = tenths.", `${ten}!`] }; } },
    "y4.dec.x10": { name: "Times Ten", icon: "⏫", island: "y4.dec", unit: "y4.d2", prereqs: ["y4.dec.tenths"],
      gen(d) { const t = ri(1, 9);
        return { format: "keypad", prompt: `0.${t} × 10 = ?`, say: `Zero point ${t} times ten?`, visual: null, answer: t, hint: "×10 moves digits one place left.", steps: [`0.${t} × 10.`, "Shift left.", `${t}!`] }; } },
    "y4.dec.compare": { name: "Compare Decimals", icon: "⚖️", island: "y4.dec", unit: "y4.d2", prereqs: ["y4.dec.tenths"],
      gen(d) { let a = ri(1, 9) / 10, b = ri(1, 9) / 10; while (b === a) b = ri(1, 9) / 10; const big = Math.max(a, b);
        return { format: "choice", prompt: "Which decimal is BIGGER?", say: "Which is bigger?", visual: null, choices: shuffle([{ label: a.toFixed(1), correct: a === big }, { label: b.toFixed(1), correct: b === big }]), hint: "Compare the tenths.", steps: ["Look after the point.", "Bigger tenths wins.", `${big.toFixed(1)}!`] }; } },

    "y4.frac.equiv": { name: "Equivalent", icon: "🟰", island: "y4.frac", unit: "y4.f", prereqs: [],
      gen(d) { const base = pick([2, 3, 4, 5]), mult = ri(2, 4);
        return { format: "keypad", prompt: `1/${base} = ❓/${base * mult}`, say: `One ${base}th equals how many ${base * mult}ths?`, visual: null, answer: mult, hint: "Multiply top and bottom the same.", steps: [`Bottom ×${mult}.`, "Top ×same.", `${mult}!`] }; } },
    "y4.frac.ofqty": { name: "Fraction Of", icon: "🍰", island: "y4.frac", unit: "y4.f", prereqs: [],
      gen(d) { const den = pick([2, 3, 4, 5]), num = ri(1, den - 1), k = ri(1, lerp(3, 6, d)), n = den * k;
        return { format: "keypad", prompt: `${num}/${den} of ${n} = ?`, say: `${num} ${den}ths of ${n}?`, visual: null, answer: num * k, hint: `Find 1/${den}, then ×${num}.`, steps: [`1/${den} of ${n} = ${k}.`, `Then ×${num}.`, `${num * k}!`] }; } },
    "y4.frac.compare": { name: "Same Bottom", icon: "⚖️", island: "y4.frac", unit: "y4.f", prereqs: [],
      gen(d) { const den = pick([4, 5, 6, 8]); let a = ri(1, den - 1), b = ri(1, den - 1); while (b === a) b = ri(1, den - 1); const big = Math.max(a, b);
        return { format: "choice", prompt: "Which fraction is BIGGER?", say: "Which is bigger?", visual: null, choices: shuffle([{ label: `${a}/${den}`, correct: a === big }, { label: `${b}/${den}`, correct: b === big }]), hint: "Same bottom — bigger top wins.", steps: ["Bottoms match.", "Compare the tops.", `${big}/${den}!`] }; } },
    "y4.frac.count": { name: "Count by Fractions", icon: "🔢", island: "y4.frac", unit: "y4.f2", prereqs: ["y4.frac.compare"],
      gen(d) { const den = pick([3, 4, 5]), k = ri(1, den - 1), ans = k + 1 === den ? "1 whole" : `${k + 1}/${den}`;
        return { format: "choice", prompt: `${[...Array(k)].map((_, i) => `${i + 1}/${den}`).join(", ")}, … next?`, say: "What comes next?", visual: null, choices: fracChoice(ans, [`${k}/${den}`, `${k + 2 <= den ? k + 2 : k}/${den}`, `1/${den}`]), hint: `Add 1/${den} each time.`, steps: [`Add 1/${den}.`, `After ${k}/${den}.`, `${ans}!`] }; } },

    "y4.meas.scale": { name: "Read the Scale", icon: "📏", island: "y4.meas", unit: "y4.m", prereqs: [],
      gen(d) { const cm = ri(3, lerp(8, 20, d));
        return { format: "keypad", prompt: `The pencil ends at the ${cm} mark. How many cm long?`, say: "How many centimetres?", visual: "📏 " + rep("▪️", cm), answer: cm, hint: "Read where it ends.", steps: ["Find the end.", "Read the number.", `${cm} cm!`] }; } },
    "y4.temp": { name: "Temperature", icon: "🌡", island: "y4.meas", unit: "y4.m", prereqs: [],
      gen(d) { const a = ri(10, 30), b = ri(1, 15);
        return { format: "keypad", prompt: `It was ${a}°C, then rose ${b}°C. New temperature?`, say: "New temperature?", visual: null, answer: a + b, hint: "Add the rise.", steps: [`Start ${a}°C.`, `Up ${b}°C.`, `${a + b}°C!`] }; } },
    "y4.time.convert": { name: "Convert Time", icon: "⏱", island: "y4.meas", unit: "y4.m", prereqs: [],
      gen(d) { const F = [["minutes in", "hours", 60], ["days in", "weeks", 7], ["hours in", "days", 24]]; const f = pick(F), n = ri(2, 5);
        return { format: "keypad", prompt: `How many ${f[0]} ${n} ${f[1]}?`, say: `How many ${f[0]} ${n} ${f[1]}?`, visual: null, answer: n * f[2], hint: `One ${f[1].slice(0, -1)} = ${f[2]}.`, steps: [`1 = ${f[2]}.`, `×${n}.`, `${n * f[2]}!`] }; } },
    "y4.angle.classify": { name: "Classify Angle", icon: "📐", island: "y4.meas", unit: "y4.ang", prereqs: [],
      gen(d) { const A = [[30, "acute"], [45, "acute"], [90, "right"], [120, "obtuse"], [150, "obtuse"]]; const a = pick(A);
        return { format: "choice", prompt: `An angle of ${a[0]}° is…`, say: `${a[0]} degrees is what kind of angle?`, visual: null, choices: shuffle([{ label: "acute", correct: a[1] === "acute" }, { label: "right", correct: a[1] === "right" }, { label: "obtuse", correct: a[1] === "obtuse" }]), hint: "Less than 90 = acute, 90 = right, more = obtuse.", steps: ["Compare to 90°.", a[0] < 90 ? "Smaller." : a[0] === 90 ? "Exactly 90." : "Bigger.", `It's ${a[1]}!`] }; } },

    "y4.sym.lines": { name: "Lines of Symmetry", icon: "🔷", island: "y4.sym", unit: "y4.s", prereqs: [],
      gen(d) { const S = [["square", 4], ["rectangle", 2], ["equilateral triangle", 3]]; const s = pick(S);
        return { format: "keypad", prompt: `How many lines of symmetry does a ${s[0]} have?`, say: `How many lines of symmetry?`, visual: null, answer: s[1], hint: "Lines that fold it onto itself.", steps: [`Picture a ${s[0]}.`, "Find folding lines.", `${s[1]}!`] }; } },
    "y4.sym.has": { name: "Symmetry?", icon: "🦋", island: "y4.sym", unit: "y4.s", prereqs: [],
      gen(d) { const SYM = ["❤️", "⭐", "🟦", "🦋", "🔷", "🔺"], NO = ["🐟", "🅿️", "🌙", "✋"]; const yes = Math.random() < 0.5, e = yes ? pick(SYM) : pick(NO);
        return { format: "tf", prompt: `Does ${e} have a line of symmetry?`, say: "Does it have a line of symmetry?", visual: e, answer: yes, hint: "Could you fold it onto itself?", steps: ["Imagine folding.", "Do halves match?", yes ? "Yes!" : "No!"] }; } },
    "y4.data.manyone": { name: "Many-to-One", icon: "📊", island: "y4.sym", unit: "y4.d", prereqs: [],
      gen(d) { const per = pick([2, 5, 10]), stars = ri(2, 5);
        return { format: "keypad", prompt: `Each ⭐ stands for ${per} votes. A fruit has ${stars} stars. How many votes?`, say: `${stars} stars of ${per}?`, visual: rep("⭐", stars), answer: per * stars, hint: `Each star is ${per}.`, steps: [`${stars} stars.`, `×${per}.`, `${per * stars}!`] }; } },
    "y4.chance.likely": { name: "More Likely", icon: "🎲", island: "y4.sym", unit: "y4.d", prereqs: [],
      gen(d) { const n1 = ri(2, 5); // ways to roll <=n1 vs roll a 6
        return { format: "choice", prompt: `On a dice: roll ${n1} or less, OR roll a 6 — which is MORE likely?`, say: "Which is more likely?", visual: null, choices: shuffle([{ label: `${n1} or less`, correct: n1 >= 1 }, { label: "a 6", correct: false }]), hint: "More winning numbers = more likely.", steps: [`${n1} or less has ${n1} numbers.`, "A 6 has just 1.", `${n1} or less!`] }; } },
  };
  const Y4ISLANDS = [
    { id: "y4.num", name: "Big Number Butte", emoji: "🔢", boss: { name: "Gale the Thunderbird", emoji: "🦅", line: "Big numbers and tables — show me!" }, units: [{ id: "y4.n1", name: "Place & Round", skills: ["y4.num.place", "y4.num.round", "y4.num.oddeven"] }, { id: "y4.x", name: "× and ÷", skills: ["y4.mult.facts", "y4.div.facts", "y4.factor"] }] },
    { id: "y4.dec", name: "Decimal Drifts", emoji: "🔟", boss: { name: "Dot the Dolphin", emoji: "🐬", line: "Master tenths to swim my drifts!" }, units: [{ id: "y4.d1", name: "Tenths", skills: ["y4.dec.tenths", "y4.dec.place"] }, { id: "y4.d2", name: "Use Decimals", skills: ["y4.dec.x10", "y4.dec.compare"] }] },
    { id: "y4.frac", name: "Fraction Forge", emoji: "🍕", boss: { name: "Ferro the Fox", emoji: "🦊", line: "Forge equal fractions to pass!" }, units: [{ id: "y4.f", name: "Equivalence", skills: ["y4.frac.equiv", "y4.frac.ofqty", "y4.frac.compare"] }, { id: "y4.f2", name: "Counting", skills: ["y4.frac.count"] }] },
    { id: "y4.meas", name: "Measure & Angle Mesa", emoji: "📐", boss: { name: "Chrono the Echidna", emoji: "🦔", line: "Measure and angle to pass!" }, units: [{ id: "y4.m", name: "Measure & Time", skills: ["y4.meas.scale", "y4.temp", "y4.time.convert"] }, { id: "y4.ang", name: "Angles", skills: ["y4.angle.classify"] }] },
    { id: "y4.sym", name: "Symmetry & Data Shore", emoji: "🔷", boss: { name: "Marlo the Heron", emoji: "🦢", line: "Mirror, graph and guess to pass!" }, units: [{ id: "y4.s", name: "Symmetry", skills: ["y4.sym.lines", "y4.sym.has"] }, { id: "y4.d", name: "Data & Chance", skills: ["y4.data.manyone", "y4.chance.likely"] }] },
    { id: "y4.review", name: "Explorer's Rest", emoji: "🏕", boss: { name: "Sage the Wombat", emoji: "🐨", line: "Bring it all together to rest here!" }, units: [{ id: "y4.r", name: "Mixed Mastery", skills: ["y4.mult.facts", "y4.frac.ofqty", "y4.dec.compare"] }] },
  ];

  /* ---------- YEAR 5 ---------- */
  const Y5SKILLS = {
    "y5.factor": { name: "Factors", icon: "🔗", island: "y5.num", unit: "y5.n1", prereqs: [],
      gen(d) { const base = pick([12, 18, 20, 24, 30]); const facs = []; for (let i = 1; i <= base; i++) if (base % i === 0) facs.push(i); const f = pick(facs.filter(x => x > 1 && x < base)); const nons = []; for (let i = 2; i < base; i++) if (base % i !== 0) nons.push(i);
        return { format: "choice", prompt: `Which is a FACTOR of ${base}?`, say: `Which is a factor of ${base}?`, visual: null, choices: shuffle([{ label: String(f), correct: true }, ...shuffle(nons).slice(0, 3).map(x => ({ label: String(x), correct: false }))]), hint: "A factor divides it with no remainder.", steps: [`Does it divide ${base}?`, "No leftovers.", `${f} does!`] }; } },
    "y5.multiple": { name: "Multiples", icon: "🔢", island: "y5.num", unit: "y5.n1", prereqs: [],
      gen(d) { const base = pick([3, 4, 6, 7, 8]), k = ri(2, 6), right = base * k; const nons = []; for (let i = 0; i < 6; i++) { const x = right + pick([-1, 1, 2, -2]); if (x % base !== 0 && x > 0) nons.push(x); }
        return { format: "choice", prompt: `Which is a MULTIPLE of ${base}?`, say: `Which is a multiple of ${base}?`, visual: null, choices: shuffle([{ label: String(right), correct: true }, ...[...new Set(nons)].slice(0, 3).map(x => ({ label: String(x), correct: false }))]), hint: `Count by ${base}s.`, steps: [`Multiples of ${base}.`, `${base}×${k}.`, `${right}!`] }; } },
    "y5.num.place": { name: "Place to 100000", icon: "🔢", island: "y5.num", unit: "y5.n1", prereqs: [],
      gen(d) { const n = ri(100000, 999999), PL = ["hundred-thousands", "ten-thousands", "thousands", "hundreds", "tens", "ones"], pi = ri(0, 5), digs = String(n);
        return { format: "keypad", prompt: `In ${n}, which digit is in the ${PL[pi]} place?`, say: `Which digit is in the ${PL[pi]} place?`, visual: null, answer: +digs[pi], hint: "Read the columns.", steps: [`Read ${n}.`, `Find ${PL[pi]}.`, `${+digs[pi]}!`] }; } },
    "y5.mult.large": { name: "Multiply Big", icon: "✖️", island: "y5.ops", unit: "y5.o", prereqs: [],
      gen(d) { const a = ri(12, lerp(30, 99, d)), b = ri(2, 9);
        return { format: "keypad", prompt: `${a} × ${b} = ?`, say: `${a} times ${b}?`, visual: null, answer: a * b, hint: "Split into tens and ones.", steps: [`${Math.floor(a / 10) * 10}×${b} + ${a % 10}×${b}.`, "Add them.", `${a * b}!`] }; } },
    "y5.div.single": { name: "Divide Big", icon: "➗", island: "y5.ops", unit: "y5.o", prereqs: ["y5.mult.large"],
      gen(d) { const b = ri(2, 9), q = ri(11, lerp(20, 50, d)), p = b * q;
        return { format: "keypad", prompt: `${p} ÷ ${b} = ?`, say: `${p} divided by ${b}?`, visual: null, answer: q, hint: "How many groups of the divisor?", steps: [`Share ${p} into ${b}s.`, "Count groups.", `${q}!`] }; } },
    "y5.inverse": { name: "Inverse", icon: "🔁", island: "y5.ops", unit: "y5.o", prereqs: ["y5.mult.large"],
      gen(d) { const a = ri(3, 9), b = ri(3, 9), p = a * b;
        return { format: "keypad", prompt: `If ${a} × ${b} = ${p}, then ${p} ÷ ${a} = ?`, say: `${p} divided by ${a}?`, visual: null, answer: b, hint: "Division undoes multiplication.", steps: [`${a}×${b}=${p}.`, "So divide back.", `${b}!`] }; } },

    "y5.frac.addsame": { name: "Add Fractions", icon: "➕", island: "y5.frac", unit: "y5.f", prereqs: [],
      gen(d) { const den = pick([5, 6, 8, 10]); let a = ri(1, den - 2), b = ri(1, den - a - 1); const sum = a + b; const right = sum === den ? "1 whole" : `${sum}/${den}`;
        return { format: "choice", prompt: `${a}/${den} + ${b}/${den} = ?`, say: `${a} ${den}ths plus ${b} ${den}ths?`, visual: null, choices: fracChoice(right, [`${a + b + 1}/${den}`, `${Math.max(1, a + b - 1)}/${den}`, `${a}/${den}`]), hint: "Same bottom — add the tops.", steps: ["Bottoms match.", `${a}+${b}=${sum}.`, `${right}!`] }; } },
    "y5.frac.subsame": { name: "Subtract Fractions", icon: "➖", island: "y5.frac", unit: "y5.f", prereqs: ["y5.frac.addsame"],
      gen(d) { const den = pick([5, 6, 8, 10]); let a = ri(2, den - 1), b = ri(1, a - 1); const right = `${a - b}/${den}`;
        return { format: "choice", prompt: `${a}/${den} − ${b}/${den} = ?`, say: `${a} ${den}ths minus ${b} ${den}ths?`, visual: null, choices: fracChoice(right, [`${a - b + 1}/${den}`, `${a + b}/${den}`, `${a}/${den}`]), hint: "Same bottom — subtract the tops.", steps: ["Bottoms match.", `${a}−${b}=${a - b}.`, `${right}!`] }; } },
    "y5.frac.related": { name: "Related Bottoms", icon: "🔗", island: "y5.frac", unit: "y5.f", prereqs: ["y5.frac.addsame"],
      gen(d) { const pairs = [["1/2", "1/4", "3/4"], ["1/2", "1/6", "4/6"], ["1/3", "1/6", "3/6"], ["1/4", "2/4", "3/4"]]; const p = pick(pairs);
        return { format: "choice", prompt: `${p[0]} + ${p[1]} = ?`, say: `${p[0]} plus ${p[1]}?`, visual: null, choices: fracChoice(p[2], ["1/2", "2/3", "5/6", "1 whole"].filter(x => x !== p[2])), hint: "Make the bottoms match first.", steps: ["Match the bottoms.", "Add the tops.", `${p[2]}!`] }; } },
    "y5.frac.ofqty": { name: "Fraction Of", icon: "🍰", island: "y5.frac", unit: "y5.f2", prereqs: [],
      gen(d) { const den = pick([3, 4, 5, 6]), num = ri(1, den - 1), k = ri(2, 6), n = den * k;
        return { format: "keypad", prompt: `${num}/${den} of ${n} = ?`, say: `${num} ${den}ths of ${n}?`, visual: null, answer: num * k, hint: `1/${den}, then ×${num}.`, steps: [`1/${den} of ${n} = ${k}.`, `×${num}.`, `${num * k}!`] }; } },

    "y5.pct.fromfrac": { name: "Fraction to %", icon: "💯", island: "y5.pct", unit: "y5.p", prereqs: [],
      gen(d) { const F = [["1/2", 50], ["1/4", 25], ["3/4", 75], ["1/10", 10], ["1/5", 20], ["1/1", 100]]; const f = pick(F);
        return { format: "keypad", prompt: `${f[0]} as a percentage = ?%`, say: `${f[0]} as a percent?`, visual: null, answer: f[1], hint: "Per cent means out of 100.", steps: [`${f[0]} of 100.`, "Work it out.", `${f[1]}%!`] }; } },
    "y5.pct.ofqty": { name: "Percent Of", icon: "🏷", island: "y5.pct", unit: "y5.p", prereqs: ["y5.pct.fromfrac"],
      gen(d) { const pc = pick([10, 25, 50, 75, 100]), base = pick([20, 40, 60, 80, 100]);
        return { format: "keypad", prompt: `${pc}% of ${base} = ?`, say: `${pc} percent of ${base}?`, visual: null, answer: Math.round(pc / 100 * base), hint: "50% is half, 25% is a quarter.", steps: [`${pc}% = ${pc}/100.`, `Of ${base}.`, `${Math.round(pc / 100 * base)}!`] }; } },
    "y5.pct.todec": { name: "Percent to Decimal", icon: "🔟", island: "y5.pct", unit: "y5.p2", prereqs: ["y5.pct.fromfrac"],
      gen(d) { const pc = pick([10, 20, 30, 50, 70, 90]);
        return { format: "keypad", decimal: true, prompt: `${pc}% as a decimal = ?`, say: `${pc} percent as a decimal?`, visual: null, answer: pc / 100, hint: "Divide by 100.", steps: [`${pc} ÷ 100.`, "Move the point.", `${(pc / 100).toFixed(1)}!`] }; } },
    "y5.dec.powers": { name: "Powers of Ten", icon: "⏫", island: "y5.pct", unit: "y5.p2", prereqs: [],
      gen(d) { const t = ri(1, 9), mul = pick([10, 100]);
        return { format: "keypad", prompt: `0.${t} × ${mul} = ?`, say: `Zero point ${t} times ${mul}?`, visual: null, answer: t / 10 * mul, hint: "Each ×10 shifts one place.", steps: [`0.${t} × ${mul}.`, "Shift the digits.", `${t / 10 * mul}!`] }; } },

    "y5.angle.line": { name: "Angles on a Line", icon: "📐", island: "y5.meas", unit: "y5.m", prereqs: [],
      gen(d) { const a = pick([30, 45, 60, 110, 120, 135]);
        return { format: "keypad", prompt: `Two angles sit on a straight line. One is ${a}°. The other?`, say: `The other angle on the line?`, visual: null, answer: 180 - a, hint: "A straight line is 180°.", steps: ["Line = 180°.", `180 − ${a}.`, `${180 - a}°!`] }; } },
    "y5.angle.classify": { name: "Angle Type", icon: "🔺", island: "y5.meas", unit: "y5.m", prereqs: [],
      gen(d) { const A = [[40, "acute"], [90, "right"], [130, "obtuse"], [180, "straight"]]; const a = pick(A);
        return { format: "choice", prompt: `An angle of ${a[0]}° is…`, say: `${a[0]} degrees is what kind?`, visual: null, choices: shuffle([{ label: "acute", correct: a[1] === "acute" }, { label: "right", correct: a[1] === "right" }, { label: "obtuse", correct: a[1] === "obtuse" }, { label: "straight", correct: a[1] === "straight" }]), hint: "90 right, 180 straight, between = obtuse.", steps: ["Compare to 90 and 180.", "Classify.", `${a[1]}!`] }; } },
    "y5.area.rect": { name: "Area", icon: "🟧", island: "y5.meas", unit: "y5.m", prereqs: [],
      gen(d) { const l = ri(3, lerp(6, 12, d)), w = ri(2, 9);
        return { format: "keypad", prompt: `A rectangle ${l} by ${w}. Area (squares)?`, say: `Area of ${l} by ${w}?`, visual: null, answer: l * w, hint: "Length × width.", steps: [`${l} × ${w}.`, "Multiply.", `${l * w}!`] }; } },
    "y5.convert": { name: "Convert Units", icon: "📏", island: "y5.meas", unit: "y5.m2", prereqs: [],
      gen(d) { const U = [["m", "cm", 100], ["km", "m", 1000], ["L", "mL", 1000], ["kg", "g", 1000]]; const u = pick(U), n = ri(2, 8);
        return { format: "keypad", prompt: `${n} ${u[0]} = ❓ ${u[1]}`, say: `${n} ${u[0]} in ${u[1]}?`, visual: null, answer: n * u[2], hint: `1 ${u[0]} = ${u[2]} ${u[1]}.`, steps: [`1 ${u[0]} = ${u[2]}.`, `×${n}.`, `${n * u[2]}!`] }; } },
    "y5.time.2412": { name: "24-Hour Time", icon: "🕘", island: "y5.meas", unit: "y5.m2", prereqs: [],
      gen(d) { const h = ri(1, 11); const opts = [`${h} pm`, `${h} am`, `${h + 1} pm`, `${(h + 11) % 12 + 1} am`];
        return { format: "choice", prompt: `${h + 12}:00 in 12-hour time is…`, say: `${h + 12} hundred in twelve hour time?`, visual: null, choices: shuffle([...new Set(opts)].map(l => ({ label: l, correct: l === `${h} pm` }))), hint: "After 12:00 it's pm; subtract 12.", steps: [`${h + 12} − 12 = ${h}.`, "Afternoon = pm.", `${h} pm!`] }; } },

    "y5.coord.read": { name: "Coordinates", icon: "🧭", island: "y5.space", unit: "y5.sp", prereqs: [],
      gen(d) { const x = ri(1, 6), y = ri(1, 6); const askX = Math.random() < 0.5;
        return { format: "keypad", prompt: `A point is ${x} across and ${y} up. What is the ${askX ? "ACROSS" : "UP"} coordinate?`, say: `What is the ${askX ? "across" : "up"} number?`, visual: null, answer: askX ? x : y, hint: "Across first, then up.", steps: ["Across = first.", "Up = second.", `${askX ? x : y}!`] }; } },
    "y5.coord.move": { name: "Move a Point", icon: "➡️", island: "y5.space", unit: "y5.sp", prereqs: ["y5.coord.read"],
      gen(d) { const x = ri(1, 5), step = ri(1, 4);
        return { format: "keypad", prompt: `Start at across = ${x}. Move right ${step}. New across?`, say: "New across number?", visual: null, answer: x + step, hint: "Right adds to across.", steps: [`From ${x}.`, `+${step}.`, `${x + step}!`] }; } },
    "y5.net": { name: "Nets", icon: "📦", island: "y5.space", unit: "y5.sp", prereqs: [],
      gen(d) { const N = [["6 equal squares", "cube"], ["a circle and a curved part", "cylinder"], ["a circle and a triangle part", "cone"], ["4 triangles and a square", "pyramid"]]; const n = pick(N), opts = ["cube", "cylinder", "cone", "pyramid"];
        return { format: "choice", prompt: `A net made of ${n[0]} folds into a…`, say: `What solid does it make?`, visual: null, choices: shuffle(opts.map(o => ({ label: o, correct: o === n[1] }))), hint: "Picture it folding up.", steps: ["Imagine folding.", "What forms?", `${n[1]}!`] }; } },
    "y5.transform": { name: "Transformations", icon: "🔄", island: "y5.space", unit: "y5.st", prereqs: [],
      gen(d) { const T = [["slid across", "translation"], ["flipped over", "reflection"], ["turned around a point", "rotation"]]; const t = pick(T), opts = ["translation", "reflection", "rotation"];
        return { format: "choice", prompt: `A shape is ${t[0]}. This is a…`, say: `What transformation is it?`, visual: null, choices: shuffle(opts.map(o => ({ label: o, correct: o === t[1] }))), hint: "Slide, flip or turn.", steps: ["Slide = translation.", "Flip = reflection.", `It's a ${t[1]}!`] }; } },
    "y5.data.mode": { name: "Mode", icon: "📊", island: "y5.space", unit: "y5.st", prereqs: [],
      gen(d) { const mode = ri(1, 6); const arr = shuffle([mode, mode, mode, ri(1, 6), ri(1, 6)]);
        return { format: "keypad", prompt: `The MODE (most common) of ${arr.join(", ")} = ?`, say: "What is the mode?", visual: null, answer: mode, hint: "The value that appears most.", steps: ["Find repeats.", "Most common wins.", `${mode}!`] }; } },
  };
  const Y5ISLANDS = [
    { id: "y5.num", name: "Factor Forest", emoji: "🌳", boss: { name: "Rooty the Stag", emoji: "🦌", line: "Find factors and multiples to pass!" }, units: [{ id: "y5.n1", name: "Factors & Multiples", skills: ["y5.factor", "y5.multiple", "y5.num.place"] }] },
    { id: "y5.ops", name: "Big Ops Basin", emoji: "✖️", boss: { name: "Boulder the Bison", emoji: "🦬", line: "Multiply and divide big to cross!" }, units: [{ id: "y5.o", name: "× and ÷", skills: ["y5.mult.large", "y5.div.single", "y5.inverse"] }] },
    { id: "y5.frac", name: "Fraction Falls", emoji: "🍕", boss: { name: "Misty the Wyrm", emoji: "💧", line: "Add and take fractions to flow on!" }, units: [{ id: "y5.f", name: "Add & Subtract", skills: ["y5.frac.addsame", "y5.frac.subsame", "y5.frac.related"] }, { id: "y5.f2", name: "Fraction Of", skills: ["y5.frac.ofqty"] }] },
    { id: "y5.pct", name: "Percent Peak", emoji: "💯", boss: { name: "Percy the Falcon", emoji: "🦅", line: "Master percents to reach the peak!" }, units: [{ id: "y5.p", name: "Percentages", skills: ["y5.pct.fromfrac", "y5.pct.ofqty"] }, { id: "y5.p2", name: "Decimals & %", skills: ["y5.pct.todec", "y5.dec.powers"] }] },
    { id: "y5.meas", name: "Measure & Angle Mesa", emoji: "📐", boss: { name: "Chrono the Echidna", emoji: "🦔", line: "Measure, angle and convert to pass!" }, units: [{ id: "y5.m", name: "Angles & Area", skills: ["y5.angle.line", "y5.angle.classify", "y5.area.rect"] }, { id: "y5.m2", name: "Convert & Time", skills: ["y5.convert", "y5.time.2412"] }] },
    { id: "y5.space", name: "Coordinate Cove", emoji: "🧭", boss: { name: "Marlo the Heron", emoji: "🦢", line: "Plot, fold and transform to pass!" }, units: [{ id: "y5.sp", name: "Coordinates & Nets", skills: ["y5.coord.read", "y5.coord.move", "y5.net"] }, { id: "y5.st", name: "Transform & Data", skills: ["y5.transform", "y5.data.mode"] }] },
  ];

  /* ---------- YEAR 6 ---------- */
  const Y6SKILLS = {
    "y6.int.compare": { name: "Compare Integers", icon: "➖", island: "y6.int", unit: "y6.i", prereqs: [],
      gen(d) { let a = ri(-9, 9), b = ri(-9, 9); while (b === a) b = ri(-9, 9); const big = Math.max(a, b);
        return { format: "choice", prompt: "Which is BIGGER?", say: "Which is bigger?", visual: null, choices: shuffle([{ label: String(a), correct: a === big }, { label: String(b), correct: b === big }]), hint: "On a number line, right is bigger.", steps: ["Picture a number line.", "Right = bigger.", `${big}!`] }; } },
    "y6.int.order": { name: "Order Integers", icon: "🔢", island: "y6.int", unit: "y6.i", prereqs: ["y6.int.compare"],
      gen(d) { const s = new Set(); while (s.size < 4) s.add(ri(-9, 9)); const correct = [...s].sort((a, b) => a - b);
        return { format: "order", prompt: "Tap from smallest to biggest!", say: "Order smallest to biggest.", visual: null, items: shuffle(correct), correct, hint: "Negatives are smallest.", steps: ["Most negative first.", "Work up to positive.", "Order them!"] }; } },
    "y6.int.line": { name: "Below Zero", icon: "🌡", island: "y6.int", unit: "y6.i", prereqs: ["y6.int.compare"],
      gen(d) { const start = ri(1, 6), drop = ri(start + 1, start + 8), ans = start - drop;
        return { format: "choice", prompt: `It is ${start}°C, then drops ${drop}°C. New temperature?`, say: "New temperature?", visual: null, choices: shuffle([{ label: `${ans}°C`, correct: true }, { label: `${ans + 2}°C`, correct: false }, { label: `${start + drop}°C`, correct: false }, { label: `${ans - 1}°C`, correct: false }]), hint: "Count down past zero.", steps: [`From ${start}.`, `Down ${drop}.`, `${ans}°C!`] }; } },
    "y6.bodmas": { name: "Order of Operations", icon: "🧮", island: "y6.int", unit: "y6.op", prereqs: [],
      gen(d) { const a = ri(2, 9), b = ri(2, 6), c = ri(2, 6);
        return { format: "keypad", prompt: `${a} + ${b} × ${c} = ?`, say: `${a} plus ${b} times ${c}?`, visual: null, answer: a + b * c, hint: "Multiply before you add.", steps: [`${b}×${c} first = ${b * c}.`, `Then + ${a}.`, `${a + b * c}!`] }; } },
    "y6.bodmas.bracket": { name: "Brackets First", icon: "🔣", island: "y6.int", unit: "y6.op", prereqs: ["y6.bodmas"],
      gen(d) { const a = ri(2, 9), b = ri(2, 6), c = ri(2, 5);
        return { format: "keypad", prompt: `(${a} + ${b}) × ${c} = ?`, say: `Bracket ${a} plus ${b}, times ${c}?`, visual: null, answer: (a + b) * c, hint: "Do the brackets first.", steps: [`${a}+${b} = ${a + b}.`, `× ${c}.`, `${(a + b) * c}!`] }; } },

    "y6.prime.is": { name: "Prime?", icon: "🔢", island: "y6.prime", unit: "y6.pr", prereqs: [],
      gen(d) { const PR = [2, 3, 5, 7, 11, 13, 17, 19, 23], CO = [4, 6, 8, 9, 10, 12, 15, 21, 25]; const isP = Math.random() < 0.5, n = isP ? pick(PR) : pick(CO);
        return { format: "tf", prompt: `Is ${n} a prime number?`, say: `Is ${n} prime?`, visual: null, answer: isP, hint: "A prime has only 1 and itself as factors.", steps: [`Factors of ${n}?`, "Only two means prime.", isP ? "Prime!" : "Not prime!"] }; } },
    "y6.prime.pick": { name: "Find the Prime", icon: "✨", island: "y6.prime", unit: "y6.pr", prereqs: ["y6.prime.is"],
      gen(d) { const PR = [2, 3, 5, 7, 11, 13], CO = [4, 6, 8, 9, 10, 12, 14, 15]; const p = pick(PR);
        return { format: "choice", prompt: "Which is a PRIME number?", say: "Which is prime?", visual: null, choices: shuffle([{ label: String(p), correct: true }, ...shuffle(CO).slice(0, 3).map(x => ({ label: String(x), correct: false }))]), hint: "Only factors are 1 and itself.", steps: ["Check each.", "Only two factors?", `${p}!`] }; } },
    "y6.ops4": { name: "Four Operations", icon: "🧮", island: "y6.prime", unit: "y6.op4", prereqs: [],
      gen(d) { const a = ri(20, lerp(60, 200, d)), b = ri(10, 50); const op = pick(["+", "−", "×"]); const ans = op === "+" ? a + b : op === "−" ? a - b : a * (b % 9 + 2);
        const prompt = op === "×" ? `${a} × ${b % 9 + 2} = ?` : `${a} ${op} ${b} = ?`;
        return { format: "keypad", prompt, say: "Work it out.", visual: null, answer: ans, hint: "Use an efficient strategy.", steps: ["Read the operation.", "Calculate carefully.", `${ans}!`] }; } },
    "y6.multiple": { name: "Common Multiple", icon: "🔗", island: "y6.prime", unit: "y6.op4", prereqs: [],
      gen(d) { const a = pick([2, 3, 4]), b = pick([3, 4, 5]); const lcm = a * b / gcd(a, b); const k = ri(1, 4), right = lcm * k;
        const distract = new Set(); let guard = 0;
        while (distract.size < 3 && guard++ < 80) { const x = right + pick([-2, -1, 1, 2, 3, a, b, lcm + 1]); if (x > 0 && x !== right && !(x % a === 0 && x % b === 0)) distract.add(x); }
        const choices = shuffle([{ label: String(right), correct: true }, ...[...distract].slice(0, 3).map(x => ({ label: String(x), correct: false }))]);
        return { format: "choice", prompt: `Which is a multiple of BOTH ${a} and ${b}?`, say: `A multiple of ${a} and ${b}?`, visual: null, choices, hint: "It must divide evenly by both.", steps: [`Multiples of ${a} and ${b}.`, "Find a shared one.", `${right}!`] }; } },

    "y6.frac.add": { name: "Add Related", icon: "➕", island: "y6.fd", unit: "y6.f", prereqs: [],
      gen(d) { const pairs = [["1/2", "1/4", "3/4"], ["1/3", "1/6", "1/2"], ["1/2", "1/6", "2/3"], ["2/3", "1/6", "5/6"]]; const p = pick(pairs);
        return { format: "choice", prompt: `${p[0]} + ${p[1]} = ?`, say: `${p[0]} plus ${p[1]}?`, visual: null, choices: fracChoice(p[2], ["1/2", "3/4", "5/6", "2/3", "1 whole"].filter(x => x !== p[2])), hint: "Make the bottoms the same.", steps: ["Common bottom.", "Add the tops.", `${p[2]}!`] }; } },
    "y6.dec.mult": { name: "Multiply Decimals", icon: "🔟", island: "y6.fd", unit: "y6.f", prereqs: [],
      gen(d) { const t = ri(1, 9), w = ri(2, 5);
        return { format: "keypad", decimal: true, prompt: `0.${t} × ${w} = ?`, say: `Zero point ${t} times ${w}?`, visual: null, answer: Math.round(t * w) / 10, hint: "Multiply, then place the point.", steps: [`${t} × ${w} = ${t * w}.`, "One decimal place.", `${(t * w / 10).toFixed(1)}!`] }; } },
    "y6.dec.div10": { name: "Divide by 10", icon: "⏬", island: "y6.fd", unit: "y6.f2", prereqs: [],
      gen(d) { const n = ri(11, 99);
        return { format: "keypad", decimal: true, prompt: `${n} ÷ 10 = ?`, say: `${n} divided by ten?`, visual: null, answer: n / 10, hint: "÷10 shifts digits one place right.", steps: [`${n} ÷ 10.`, "Shift right.", `${(n / 10).toFixed(1)}!`] }; } },
    "y6.fdp": { name: "Decimal to %", icon: "💯", island: "y6.fd", unit: "y6.f2", prereqs: [],
      gen(d) { const t = pick([1, 2, 5, 25, 50, 75]); const dec = t / 100;
        return { format: "keypad", prompt: `${dec.toFixed(2)} as a percentage = ?%`, say: `${dec} as a percent?`, visual: null, answer: t, hint: "× 100 to get percent.", steps: [`${dec} × 100.`, "Shift the point.", `${t}%!`] }; } },

    "y6.pct.ofqty": { name: "Percent Of", icon: "🏷", island: "y6.pct", unit: "y6.p", prereqs: [],
      gen(d) { const pc = pick([10, 20, 25, 50, 75]), base = pick([20, 40, 60, 80, 200]);
        return { format: "keypad", prompt: `${pc}% of ${base} = ?`, say: `${pc} percent of ${base}?`, visual: null, answer: Math.round(pc / 100 * base), hint: "Find 10% or 50% first.", steps: [`${pc}% of ${base}.`, "Use easy chunks.", `${Math.round(pc / 100 * base)}!`] }; } },
    "y6.pct.discount": { name: "Discounts", icon: "🛍", island: "y6.pct", unit: "y6.p", prereqs: ["y6.pct.ofqty"],
      gen(d) { const pc = pick([10, 20, 25, 50]), price = pick([20, 40, 60, 80, 100]);
        return { format: "keypad", prompt: `A $${price} item is ${pc}% off. How many $ is the discount?`, say: `${pc} percent off ${price} dollars?`, visual: null, answer: Math.round(pc / 100 * price), hint: "Find the percentage of the price.", steps: [`${pc}% of $${price}.`, "Calculate.", `$${Math.round(pc / 100 * price)}!`] }; } },
    "y6.pct.fromfrac": { name: "Fraction to %", icon: "💯", island: "y6.pct", unit: "y6.p2", prereqs: [],
      gen(d) { const F = [["1/2", 50], ["1/4", 25], ["3/4", 75], ["1/5", 20], ["3/5", 60], ["1/10", 10]]; const f = pick(F);
        return { format: "keypad", prompt: `${f[0]} as a percentage = ?%`, say: `${f[0]} as a percent?`, visual: null, answer: f[1], hint: "Out of 100.", steps: [`${f[0]} of 100.`, "Work it out.", `${f[1]}%!`] }; } },
    "y6.fdp.order": { name: "Order F/D/%", icon: "📊", island: "y6.pct", unit: "y6.p2", prereqs: ["y6.pct.fromfrac"],
      gen(d) { const items = [["1/2", 0.5], ["0.25", 0.25], ["75%", 0.75]]; const big = items.reduce((m, x) => x[1] > m[1] ? x : m);
        return { format: "choice", prompt: "Which is the BIGGEST?", say: "Which is biggest?", visual: null, choices: shuffle(items.map(x => ({ label: x[0], correct: x === big }))), hint: "Turn them all into decimals.", steps: ["Convert each.", "Compare.", `${big[0]}!`] }; } },

    "y6.area.rect": { name: "Rectangle Area", icon: "🟧", island: "y6.meas", unit: "y6.m", prereqs: [],
      gen(d) { const l = ri(4, lerp(8, 20, d)), w = ri(3, 12);
        return { format: "keypad", prompt: `Rectangle ${l} cm by ${w} cm. Area in cm²?`, say: `Area of ${l} by ${w}?`, visual: null, answer: l * w, hint: "Area = length × width.", steps: [`${l} × ${w}.`, "Multiply.", `${l * w} cm²!`] }; } },
    "y6.area.tri": { name: "Triangle Area", icon: "🔺", island: "y6.meas", unit: "y6.m", prereqs: ["y6.area.rect"],
      gen(d) { const b = pick([4, 6, 8, 10]), h = pick([3, 5, 7, 9]);
        return { format: "keypad", prompt: `A triangle with base ${b} and height ${h}. Area?`, say: `Area of the triangle?`, visual: null, answer: b * h / 2, hint: "Half of base × height.", steps: [`${b} × ${h} = ${b * h}.`, "Halve it.", `${b * h / 2}!`] }; } },
    "y6.angle.unknown": { name: "Find the Angle", icon: "📐", island: "y6.meas", unit: "y6.m", prereqs: [],
      gen(d) { const around = Math.random() < 0.5; const total = around ? 360 : 180; const a = ri(40, total - 40);
        return { format: "keypad", prompt: `Angles ${around ? "around a point" : "on a line"} add to ${total}°. One is ${a}°. The other?`, say: "The other angle?", visual: null, answer: total - a, hint: `They total ${total}°.`, steps: [`Total ${total}°.`, `${total} − ${a}.`, `${total - a}°!`] }; } },
    "y6.convert": { name: "Convert Units", icon: "📏", island: "y6.meas", unit: "y6.m2", prereqs: [],
      gen(d) { const U = [["m", "cm", 100], ["km", "m", 1000], ["kg", "g", 1000], ["L", "mL", 1000]]; const u = pick(U), n = ri(2, 9);
        return { format: "keypad", prompt: `${n} ${u[0]} = ❓ ${u[1]}`, say: `${n} ${u[0]} in ${u[1]}?`, visual: null, answer: n * u[2], hint: `1 ${u[0]} = ${u[2]} ${u[1]}.`, steps: [`1 ${u[0]} = ${u[2]}.`, `×${n}.`, `${n * u[2]}!`] }; } },
    "y6.timetable": { name: "Timetables", icon: "🚌", island: "y6.meas", unit: "y6.m2", prereqs: [],
      gen(d) { const h = ri(1, 9), m1 = pick([0, 10, 15, 20]), dur = pick([20, 30, 40, 45]); const totalM = m1 + dur; const eh = h + Math.floor(totalM / 60), em = totalM % 60;
        return { format: "keypad", prompt: `A bus leaves ${h}:${String(m1).padStart(2, "0")} and takes ${dur} min. How many minutes is the trip?`, say: "How many minutes?", visual: null, answer: dur, hint: "The trip length is given.", steps: ["Read the duration.", "That's the trip.", `${dur} minutes!`] }; } },

    "y6.coord.quad": { name: "Quadrants", icon: "🧭", island: "y6.space", unit: "y6.sp", prereqs: [],
      gen(d) { const x = pick([-3, -2, 2, 3]), y = pick([-3, -2, 2, 3]); const q = x > 0 && y > 0 ? "1st" : x < 0 && y > 0 ? "2nd" : x < 0 && y < 0 ? "3rd" : "4th";
        return { format: "choice", prompt: `Which quadrant is the point (${x}, ${y}) in?`, say: `Which quadrant?`, visual: null, choices: shuffle(["1st", "2nd", "3rd", "4th"].map(o => ({ label: o, correct: o === q }))), hint: "(+,+)=1st, then anticlockwise.", steps: [`Across ${x}, up ${y}.`, "Check the signs.", `${q}!`] }; } },
    "y6.coord.move": { name: "Move Point", icon: "➡️", island: "y6.space", unit: "y6.sp", prereqs: ["y6.coord.quad"],
      gen(d) { const x = ri(1, 4), step = ri(x + 1, x + 5), ans = x - step;
        const distract = new Set(); for (const cand of [x + step, ans + 1, ans - 1, -x, x, ans + 2]) if (cand !== ans) distract.add(cand);
        const choices = shuffle([{ label: String(ans), correct: true }, ...[...distract].slice(0, 3).map(v => ({ label: String(v), correct: false }))]);
        return { format: "choice", prompt: `Start at across = ${x}. Move LEFT ${step}. New across coordinate?`, say: "New across coordinate?", visual: null, choices, hint: "Left subtracts; you may pass zero.", steps: [`From ${x}.`, `−${step}.`, `${ans}!`] }; } },
    "y6.transform": { name: "Transformations", icon: "🔄", island: "y6.space", unit: "y6.sp", prereqs: [],
      gen(d) { const T = [["slid across", "translation"], ["flipped over", "reflection"], ["turned around a point", "rotation"]]; const t = pick(T), opts = ["translation", "reflection", "rotation"];
        return { format: "choice", prompt: `A shape is ${t[0]}. This is a…`, say: "Which transformation?", visual: null, choices: shuffle(opts.map(o => ({ label: o, correct: o === t[1] }))), hint: "Slide, flip or turn.", steps: ["Match the action.", "Name it.", `${t[1]}!`] }; } },
    "y6.prob": { name: "Probability", icon: "🎲", island: "y6.space", unit: "y6.pr", prereqs: [],
      gen(d) { const F = [["a coin landing heads", 50], ["rolling an even number on a dice", 50], ["rolling a 1 on a dice", 17], ["a certain event", 100], ["an impossible event", 0]]; const f = pick(F);
        return { format: "keypad", prompt: `Chance of ${f[0]}, as a percentage (nearest whole)?`, say: `Chance of ${f[0]} as a percent?`, visual: null, answer: f[1], hint: "0% impossible, 100% certain, 50% even chance.", steps: ["Think of the chance.", "As a percent.", `${f[1]}%!`] }; } },
    "y6.mean": { name: "Mean & Range", icon: "📊", island: "y6.space", unit: "y6.pr", prereqs: [],
      gen(d) { if (Math.random() < 0.5) { const a = ri(2, 9), b = ri(2, 9), c = ri(2, 9); const arr = [a, b, c]; const sum = a + b + c; if (sum % 3 !== 0) arr[0] += 3 - sum % 3; const m = (arr[0] + b + c) / 3;
          return { format: "keypad", prompt: `The MEAN (average) of ${arr.join(", ")} = ?`, say: "What is the mean?", visual: null, answer: m, hint: "Add them up, divide by how many.", steps: [`Sum = ${arr[0] + b + c}.`, "Divide by 3.", `${m}!`] }; }
        const s = new Set(); while (s.size < 4) s.add(ri(1, 20)); const arr = [...s]; const range = Math.max(...arr) - Math.min(...arr);
        return { format: "keypad", prompt: `The RANGE of ${arr.join(", ")} = ?`, say: "What is the range?", visual: null, answer: range, hint: "Biggest minus smallest.", steps: [`Max ${Math.max(...arr)}, min ${Math.min(...arr)}.`, "Subtract.", `${range}!`] }; } },
  };
  const Y6ISLANDS = [
    { id: "y6.int", name: "Integer Isle", emoji: "➖", boss: { name: "Frost the Yeti", emoji: "🧊", line: "Brave the negatives and order to pass!" }, units: [{ id: "y6.i", name: "Integers", skills: ["y6.int.compare", "y6.int.order", "y6.int.line"] }, { id: "y6.op", name: "Order of Operations", skills: ["y6.bodmas", "y6.bodmas.bracket"] }] },
    { id: "y6.prime", name: "Prime Plains", emoji: "🔢", boss: { name: "Sage the Owl", emoji: "🦉", line: "Know primes and operations to pass!" }, units: [{ id: "y6.pr", name: "Primes", skills: ["y6.prime.is", "y6.prime.pick"] }, { id: "y6.op4", name: "Operations", skills: ["y6.ops4", "y6.multiple"] }] },
    { id: "y6.fd", name: "Fraction & Decimal Forge", emoji: "🍕", boss: { name: "Ember the Phoenix", emoji: "🔥", line: "Forge fractions and decimals to rise!" }, units: [{ id: "y6.f", name: "Add & Multiply", skills: ["y6.frac.add", "y6.dec.mult"] }, { id: "y6.f2", name: "Divide & Convert", skills: ["y6.dec.div10", "y6.fdp"] }] },
    { id: "y6.pct", name: "Percent Peak", emoji: "💯", boss: { name: "Percy the Falcon", emoji: "🦅", line: "Master percents and discounts to summit!" }, units: [{ id: "y6.p", name: "Percent Of", skills: ["y6.pct.ofqty", "y6.pct.discount"] }, { id: "y6.p2", name: "Convert & Order", skills: ["y6.pct.fromfrac", "y6.fdp.order"] }] },
    { id: "y6.meas", name: "Area & Angle Aerie", emoji: "📐", boss: { name: "Chrono the Echidna", emoji: "🦔", line: "Area, angles and units — show me!" }, units: [{ id: "y6.m", name: "Area & Angles", skills: ["y6.area.rect", "y6.area.tri", "y6.angle.unknown"] }, { id: "y6.m2", name: "Convert & Time", skills: ["y6.convert", "y6.timetable"] }] },
    { id: "y6.space", name: "Cartesian Cove", emoji: "🧭", boss: { name: "Professor Polaris", emoji: "🦉", line: "The summit's final riddles await!" }, units: [{ id: "y6.sp", name: "Coordinates", skills: ["y6.coord.quad", "y6.coord.move", "y6.transform"] }, { id: "y6.pr", name: "Chance & Data", skills: ["y6.prob", "y6.mean"] }] },
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
    year3: { islands: Y3ISLANDS, skills: Y3SKILLS },
    year4: { islands: Y4ISLANDS, skills: Y4SKILLS },
    year5: { islands: Y5ISLANDS, skills: Y5SKILLS },
    year6: { islands: Y6ISLANDS, skills: Y6SKILLS },
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
