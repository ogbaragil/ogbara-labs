/* Islands unlock in order: a later island stays locked until the one
 * before it is fully Proficient. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];
  const PROF = { m: 2, attempts: 9, correct: 9, stars: 3, perfects: 0, nextReview: null, reviewStep: 0 };

  const islands = BT.ISLANDS;
  const firstSkills = islands[0].units.flatMap(u => u.skills);
  const secondSkills = islands[1].units.flatMap(u => u.skills);

  const lockedCount = (ids) => {
    let n = 0;
    walk(h.ids["mapRoot"], e => {
      if (e.dataset && e.dataset.skill && ids.includes(e.dataset.skill)
        && String(e.className).includes("locked")) n++;
    });
    return n;
  };

  // fresh profile → second island fully locked
  BTApp.renderMap();
  t("second island starts fully locked", lockedCount(secondSkills) === secondSkills.length);

  // a locked island shows the unlock hint banner
  let banner = false;
  walk(h.ids["mapRoot"], e => { if (String(e.className).includes("isl-lock")) banner = true; });
  t("locked island shows an unlock hint", banner);

  // make the first island all Proficient → second island opens
  firstSkills.forEach(id => S().skills[id] = { ...PROF });
  BTApp.renderMap();
  t("second island unlocks once the first is all Proficient", lockedCount(secondSkills) < secondSkills.length);

  // first island's nodes are never locked (it's the entry island)
  t("first island is always open", lockedCount(firstSkills) === 0);

  // re-lock by dropping one first-island skill below Proficient
  S().skills[firstSkills[0]].m = 1;
  BTApp.renderMap();
  t("dropping one skill re-locks the next island", lockedCount(secondSkills) === secondSkills.length);
};
