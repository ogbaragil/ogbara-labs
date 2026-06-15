/* Validates the quest packs and the deck-draw used by remote modes.
   Extracts the REAL LOVE_QUESTS / LOVE_QUESTS_APART decks and drawQuest()
   from index.html and exercises them in a sandbox (no DOM needed).
   Run: node --test tests/quests.test.js
*/
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("const COLS"));
assert.ok(inline, "found inline game script");

function slice(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, "missing start: " + start);
  const b = src.indexOf(end, a);
  assert.ok(b >= 0, "missing end after: " + start);
  return src.slice(a, b);
}
const lq = slice(inline, "const LOVE_QUESTS = {", "\n};\n/* Long-distance") + "\n};\n";
const lqa = slice(inline, "const LOVE_QUESTS_APART = {", "\n};\n/* Heart tiles") + "\n};\n";
const dq = slice(inline, "const _deck = {};", "return deck[idx];") + "return deck[idx];\n}\n";
const src = lq + lqa + dq + "\nmodule.exports = { drawQuest, LOVE_QUESTS, LOVE_QUESTS_APART };";

const sandbox = { module: { exports: {} }, Math };
vm.runInNewContext(src, sandbox);
const { drawQuest, LOVE_QUESTS, LOVE_QUESTS_APART } = sandbox.module.exports;

const MOODS = ["Romantic", "Fun", "Spicy"];

test("both packs expose the three moods, 30 prompts each, all non-empty strings", () => {
  for (const pack of [LOVE_QUESTS, LOVE_QUESTS_APART]) {
    for (const mood of MOODS) {
      assert.ok(Array.isArray(pack[mood]), mood + " is an array");
      assert.equal(pack[mood].length, 30, mood + " has 30 prompts");
      for (const q of pack[mood]) { assert.equal(typeof q, "string"); assert.ok(q.trim().length > 0); }
    }
  }
});

test("apart pack is genuinely different content from the together pack", () => {
  for (const mood of MOODS) {
    const same = LOVE_QUESTS[mood].filter((q) => LOVE_QUESTS_APART[mood].includes(q)).length;
    assert.ok(same < 8, mood + ": apart deck should be mostly rewritten (overlap " + same + ")");
  }
});

test("drawQuest pulls from the correct pack", () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(LOVE_QUESTS_APART.Romantic.includes(drawQuest("Romantic", "apart")), "apart draw is from apart deck");
    assert.ok(LOVE_QUESTS.Romantic.includes(drawQuest("Romantic", "together")), "together draw is from together deck");
  }
});

test("drawQuest cycles a full deck with no repeats, and no repeat across the cycle seam", () => {
  const deck = LOVE_QUESTS_APART.Spicy;
  const first = []; for (let i = 0; i < 30; i++) first.push(drawQuest("Spicy", "apart"));
  assert.equal(new Set(first).size, 30, "first pass shows all 30 once");
  const seamA = first[29];
  const second = []; for (let i = 0; i < 30; i++) second.push(drawQuest("Spicy", "apart"));
  assert.equal(new Set(second).size, 30, "second pass shows all 30 once");
  assert.notEqual(second[0], seamA, "no back-to-back repeat across the cycle boundary");
  for (const q of first.concat(second)) assert.ok(deck.includes(q));
});

test("together and apart decks keep independent shuffle state", () => {
  // Drawing from one pack must not consume the other's cycle.
  const t = new Set(); for (let i = 0; i < 30; i++) t.add(drawQuest("Fun", "together"));
  const a = new Set(); for (let i = 0; i < 30; i++) a.add(drawQuest("Fun", "apart"));
  assert.equal(t.size, 30); assert.equal(a.size, 30);
});
