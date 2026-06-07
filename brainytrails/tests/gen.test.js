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
};
