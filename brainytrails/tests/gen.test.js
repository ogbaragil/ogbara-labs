/* Generator contract + curriculum graph integrity. */
module.exports = async function (t) {
  const path = require("path");
  const BT = require(path.join(__dirname, "..", "curriculum.js"));
  let fails = [];
  const check = (id, d, q) => {
    const fail = (why) => fails.push(`${id}@${d}: ${why}`);
    if (!q) return fail("undefined");
    if (!q.prompt || !q.say || !q.hint || !Array.isArray(q.steps) || q.steps.length < 2) return fail("missing prose");
    if (q.format === "choice") {
      if (!q.choices || q.choices.filter(c => c.correct).length !== 1) return fail("choice corrupt");
      if (new Set(q.choices.map(c => String(c.label))).size !== q.choices.length) return fail("dup labels");
    } else if (q.format === "keypad") {
      if (typeof q.answer !== "number" || !isFinite(q.answer) || q.answer < 0 || q.answer > 999) return fail("answer " + q.answer);
      if (!q.decimal && !Number.isInteger(q.answer)) return fail("float w/o flag");
      if (q.decimal && Math.round(q.answer * 10) !== q.answer * 10) return fail(">1dp");
    } else if (q.format === "order") {
      const asc = [...q.items].sort((a, b) => a - b), desc = [...q.items].sort((a, b) => b - a);
      const c = JSON.stringify(q.correct);
      if (c !== JSON.stringify(asc) && c !== JSON.stringify(desc)) return fail("order corrupt");
    } else if (q.format === "tap") {
      if (!q.items || q.items.filter(i => i.correct).length !== 1) return fail("tap corrupt");
    } else if (q.format === "tf") {
      if (typeof q.answer !== "boolean") return fail("tf corrupt");
    } else return fail("unknown format");
    if (q.pic) {
      const KINDS = { pie: ["n", "k"], clock: ["h"], blocks: ["tens", "ones"], rect: ["l", "w"], angle: ["deg"], suppl: ["a"], bars: ["items"], coins: ["values"], compare: ["a", "b"], numline: ["lo", "hi", "mark"], turn: ["q"], measure: ["n"] };
      if (!KINDS[q.pic.kind]) return fail("unknown pic kind " + q.pic.kind);
      for (const key of KINDS[q.pic.kind]) if (q.pic[key] === undefined) return fail(`pic ${q.pic.kind} missing ${key}`);
      if (q.pic.kind === "pie" && (q.pic.k > q.pic.n || q.pic.n > 12)) return fail("pie corrupt");
      if (q.pic.kind === "turn" && (q.pic.q < 1 || q.pic.q > 4)) return fail("turn out of range");
      if (q.pic.kind === "numline" && (q.pic.mark < q.pic.lo || q.pic.mark > q.pic.hi)) return fail("numline mark outside range");
      if (q.pic.kind === "blocks" && (q.pic.tens > 9 || q.pic.ones > 9)) return fail("blocks overflow");
    }
  };
  for (const id of Object.keys(BT.SKILLS))
    for (const d of [0, 0.5, 1])
      for (let i = 0; i < 150 && fails.length < 10; i++) {
        try { check(id, d, BT.SKILLS[id].gen(d)); } catch (e) { fails.push(`${id}@${d}: THROW ${e.message}`); break; }
      }
  t("all generators honour the contract", fails.length === 0, fails.slice(0, 5).join(" | "));
  const ids = Object.keys(BT.SKILLS);
  const mapSkills = BT.ISLANDS.flatMap(i => i.units.flatMap(u => u.skills));
  t("map covers every skill exactly once", new Set(mapSkills).size === mapSkills.length && mapSkills.length === ids.length);
  const seen = {}, stack = {};
  const cyc = (id) => { if (stack[id]) return true; if (seen[id]) return false; seen[id] = stack[id] = 1; const c = BT.SKILLS[id].prereqs.some(cyc); delete stack[id]; return c; };
  t("prerequisite graph is acyclic", !ids.some(cyc));
  const reach = new Set(ids.filter(i => !BT.SKILLS[i].prereqs.length));
  let grew = true;
  while (grew) { grew = false; for (const i of ids) if (!reach.has(i) && BT.SKILLS[i].prereqs.every(p => reach.has(p))) { reach.add(i); grew = true; } }
  t("every skill is reachable", reach.size === ids.length);
  const withPics = ids.filter(id => { try { return !!BT.SKILLS[id].gen(0.6).pic || !!BT.SKILLS[id].gen(0.3).pic; } catch { return false; } });
  t("14 skills carry maths pictures", withPics.length >= 14, "got " + withPics.length + ": " + withPics.join(","));
  const choiceCounts = {};
  for (const id of ids) for (const d of [0, 0.3, 0.6, 1]) for (let i = 0; i < 60; i++) {
    let q; try { q = BT.SKILLS[id].gen(d); } catch { continue; }
    if (q.format === "choice") (choiceCounts[id] = choiceCounts[id] || new Set()).add(q.choices.length);
  }
  const odd = Object.entries(choiceCounts).filter(([, s]) => [...s].some(n => n !== 2 && n !== 4)).map(([id]) => id);
  t("multiple-choice is uniform (4 pills, or 2 for binary)", odd.length === 0, odd.join(","));
};
