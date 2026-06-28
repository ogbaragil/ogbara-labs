/* Islands unlock in order: a later island stays locked until the one
 * before it is fully Proficient. Lock state now lives on the World Map cards. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];
  const PROF = { m: 2, attempts: 9, correct: 9, stars: 3, perfects: 0, nextReview: null, reviewStep: 0 };

  const islands = BT.ISLANDS;
  const firstSkills = islands[0].units.flatMap(u => u.skills);

  const islandLocked = (islId) => {
    let locked = false;
    walk(h.ids["mapRoot"], e => {
      if (e.dataset && e.dataset.isl === islId && String(e.className).split(" ").includes("locked-island")) locked = true;
    });
    return locked;
  };

  // fresh profile → second island locked
  BTApp.renderMap();
  t("second island starts locked", islandLocked(islands[1].id));

  // a locked island shows the unlock hint banner
  let banner = false;
  walk(h.ids["mapRoot"], e => { if (String(e._inner || "").includes("isl-lock") || String(e._inner || "").includes("to unlock")) banner = true; });
  t("locked island shows an unlock hint", banner);

  // make the first island all Proficient → still locked until its Guardian falls
  firstSkills.forEach(id => S().skills[id] = { ...PROF });
  BTApp.renderMap();
  t("Proficient-but-boss-alive keeps the next island locked", islandLocked(islands[1].id));

  // defeat the first island's Guardian → second island opens
  S().bosses[islands[0].id] = { won: true, best: 10 };
  BTApp.renderMap();
  t("second island unlocks once the first is Proficient AND its boss is beaten", !islandLocked(islands[1].id));

  // first island is never locked (it's the entry island)
  t("first island is always open", !islandLocked(islands[0].id));

  // re-lock by dropping one first-island skill below Proficient
  S().skills[firstSkills[0]].m = 1;
  BTApp.renderMap();
  t("dropping one skill re-locks the next island", islandLocked(islands[1].id));
};
