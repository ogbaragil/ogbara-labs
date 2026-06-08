/* Regression cover for the v12 fixes:
 *  - Level Up passes at 4/5 on younger islands, 5/5 elsewhere
 *  - the island boss gate now opens at Proficient (matching the n/n counter) */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];

  // ── Level Up threshold is island-aware ──
  BTApp.startSet("count.to10", "levelup");   // sprout = young island
  t("young island level-up needs 4 of 5", BTApp.sess().need === 4);
  document.getElementById("overlay").children.length = 0; BTApp.exitPlay();

  // 4 right + 1 wrong on a young island still reaches Proficient
  S().skills["count.to10"] = { m: 1, attempts: 7, correct: 6, stars: 1, nextReview: null, reviewStep: 0 };
  BTApp.startSet("count.to10", "levelup");
  BTApp.submit(false, "");                   // first slip → free retry
  await sleep(80);
  BTApp.submit(false, "");                   // miss it for real (1 wrong)
  await sleep(90);
  const { clickThroughTeach } = require("./harness");
  await clickThroughTeach(h); await sleep(30);
  for (let i = 0; i < 5; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  t("4/5 (after a miss) reaches Proficient on a young island", S().skills["count.to10"].m === 2);
  document.getElementById("overlay").children.length = 0; BTApp.exitPlay();

  // older island keeps the 5-of-5 bar
  BTApp.startSet("add.to100", "levelup");    // cascade = older island
  t("older island level-up still needs 5 of 5", BTApp.sess().need === 5);
  document.getElementById("overlay").children.length = 0; BTApp.exitPlay();

  // ── Boss gate matches the Proficient counter ──
  const sproutSkills = BT.ISLANDS[0].units.flatMap(u => u.skills);
  sproutSkills.forEach(id => S().skills[id] = { m: 1, attempts: 7, correct: 6, stars: 1, nextReview: null, reviewStep: 0 });
  BTApp.renderMap();
  let waitingAtFamiliar = false;
  walk(h.ids["mapRoot"], e => { const c = String(e.className); if (c.includes("boss-node") && c.includes("waiting")) waitingAtFamiliar = true; });
  t("boss stays locked while skills are only Familiar", waitingAtFamiliar);

  sproutSkills.forEach(id => S().skills[id].m = 2);
  BTApp.renderMap();
  let readyAtProficient = false;
  walk(h.ids["mapRoot"], e => { const c = String(e.className); if (c.includes("boss-node") && c.includes("ready")) readyAtProficient = true; });
  t("boss opens once every skill is Proficient", readyAtProficient);
};
