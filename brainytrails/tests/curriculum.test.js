/* School-year curriculum framework + Foundation content integrity.
 * Pure-data: requires curriculum.js directly (no DOM). */
module.exports = async function (t) {
  const BT = require("../curriculum.js");

  // a question is "answerable" if exactly one correct answer can be derived
  const wellFormed = (q) => {
    if (!q || typeof q.prompt !== "string") return false;
    if (q.format === "choice") return q.choices.filter(c => c.correct).length === 1 && q.choices.length >= 2;
    if (q.format === "tf") return typeof q.answer === "boolean";
    if (q.format === "keypad") return Number.isFinite(q.answer);
    if (q.format === "order") return Array.isArray(q.items) && Array.isArray(q.correct)
      && q.items.length === q.correct.length && q.correct.every((v, i, a) => i === 0 || a[i - 1] <= v);
    if (q.format === "tap") return q.items.filter(c => c.correct).length === 1;
    return false;
  };

  t("seven school years are defined", (BT.YEARS || []).length === 7
    && BT.YEARS[0].id === "foundation" && BT.YEARS[6].id === "year6");

  // ---- authored years ----
  for (const yid of ["foundation", "year1", "year2"]) {
    const c = BT.curriculumFor(yid);
    t(`${yid}: authored (not a draft)`, c.draft === false);
    t(`${yid}: 6 unique islands`, c.ISLANDS.length === 6
      && new Set(c.ISLANDS.map(i => i.id)).size === 6);

    let total = 0, allResolve = true, missing = "";
    c.ISLANDS.forEach(i => i.units.forEach(u => u.skills.forEach(id => {
      total++; if (!c.SKILLS[id]) { allResolve = false; missing = id; }
    })));
    t(`${yid}: every island skill exists`, allResolve, missing);
    t(`${yid}: every defined skill is placed on the map`, (() => {
      const placed = new Set(c.ISLANDS.flatMap(i => i.units.flatMap(u => u.skills)));
      return Object.keys(c.SKILLS).every(id => placed.has(id));
    })());

    // every generator, every difficulty, repeated — must stay well-formed
    let genOk = true, bad = "";
    for (const [id, sk] of Object.entries(c.SKILLS)) {
      for (const d of [0, 0.25, 0.5, 0.75, 1]) {
        for (let r = 0; r < 12; r++) {
          let q; try { q = sk.gen(d); } catch (e) { genOk = false; bad = `${id} threw: ${e.message}`; break; }
          if (!wellFormed(q)) { genOk = false; bad = `${id} ill-formed @d=${d} (${q && q.format})`; break; }
        }
        if (!genOk) break;
      }
      if (!genOk) break;
    }
    t(`${yid}: all ${total} lessons generate answerable questions`, genOk, bad);

    // prereqs must reference real skills within the same curriculum
    let prereqOk = true, pbad = "";
    for (const [id, sk] of Object.entries(c.SKILLS))
      for (const p of (sk.prereqs || [])) if (!c.SKILLS[p]) { prereqOk = false; pbad = `${id} → ${p}`; }
    t(`${yid}: all prereqs resolve`, prereqOk, pbad);
  }

  // ---- unauthored years fall back to a fully playable Explorer map ----
  const fb = BT.curriculumFor("year3");
  t("unauthored year falls back to Explorer (flagged draft)", fb.draft === true
    && fb.ISLANDS.length === 6 && fb.ISLANDS[0].id === "sprout");

  // ---- BT.use swaps the live curriculum the app reads ----
  BT.use("foundation");
  t("use(foundation) swaps to the Foundation islands", BT.ISLANDS[0].id === "f.count"
    && BT.YOUNG.has("f.count"));
  BT.use(null);
  t("use(null) restores the Explorer map", BT.ISLANDS[0].id === "sprout"
    && BT.YOUNG.has("sprout") && !BT.YOUNG.has("f.count"));
};
