/* Adventure layer: treasure milestones (every 5 Proficient skills) feed both the
   kid's map banner / unlock celebration and the parent's "next reward" strip. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];
  const ids = BT.ISLANDS.flatMap(i => i.units.flatMap(u => u.skills));
  const mkProf = (id) => S().skills[id] = { m: 2, attempts: 9, correct: 9, stars: 3, perfects: 2, nextReview: null, reviewStep: 0 };

  // --- treasure math ---
  let ts = BTApp.treasureState(S());
  t("fresh: first treasure is 5 away", ts.earnedCount === 0 && ts.toNext === 5 && ts.next.n === "Dragon Egg");
  ids.slice(0, 5).forEach(mkProf);
  ts = BTApp.treasureState(S());
  t("5 Proficient → 1 earned, next is 5 away", ts.earnedCount === 1 && ts.toNext === 5 && ts.next.n === "Golden Key");
  ids.slice(5, 7).forEach(mkProf);
  ts = BTApp.treasureState(S());
  t("7 Proficient → 1 earned, 3 to go, 2 into the step", ts.earnedCount === 1 && ts.toNext === 3 && ts.inStep === 2);

  // --- map banner ---
  BTApp.renderMap();
  let banner = null;
  walk(h.ids["mapRoot"], e => { if (String(e.className).includes("treasure-banner")) banner = e; });
  t("map shows a treasure banner", !!banner && String(banner._inner).includes("Next treasure"));

  // --- unlock celebration: the 5th Proficient skill banks a treasure ---
  S().skills = {}; S().treasuresSeen = 0;
  ids.filter(id => id !== "count.to10").slice(0, 4).forEach(mkProf);   // 4 banked
  S().skills["count.to10"] = { m: 1, attempts: 7, correct: 7, stars: 3, perfects: 1, nextReview: null, reviewStep: 0 };
  BTApp.startSet("count.to10", "practice");
  const n = BTApp.sess().total;
  for (let i = 0; i < n; i++) { BTApp.submit(true, ""); await sleep(60); }
  await sleep(70);
  t("the 5th Proficient skill banks a treasure", S().treasuresSeen === 1);
  const modal = h.ids["overlay"].children[h.ids["overlay"].children.length - 1];
  let won = false; walk(modal, e => { if (String(e._inner || "").includes("Treasure unlocked")) won = true; });
  t("result screen celebrates the unlock", won);
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  // --- parents' adventure strip ---
  BTApp.openParents();
  let cells = 0, reward = false;
  walk(h.ids["overlay"], e => { const c = String(e.className || ""); if (c.split(" ").includes("pj-cell")) cells++; if (c.includes("pj-reward")) reward = true; });
  t("parents' corner shows the adventure strip with a reward cell", cells >= 3 && reward);
};
