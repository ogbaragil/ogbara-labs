/* Mastery engine: practice, level-up redemption, review decay, boss, daily, limits. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];
  const yest = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

  BTApp.startSet("count.to10", "practice");
  for (let i = 0; i < 7; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  t("practice 7/7 → Familiar, 3 stars", S().skills["count.to10"].m === 1 && S().skills["count.to10"].stars === 3);
  t("difficulty persists for the next climb", typeof S().skills["count.to10"].lastD === "number");
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  BTApp.startSet("count.to10", "levelup");
  t("level-up starts kinder (d=0.85)", BTApp.sess().d === 0.85);
  BTApp.submit(false, ""); await sleep(90);
  t("one slip earns a redemption question", BTApp.sess().total === 6);
  for (let i = 0; i < 5; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  t("5 correct after a slip still reaches Proficient", S().skills["count.to10"].m === 2);
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  const realIds = BT.ISLANDS.flatMap(i => i.units.flatMap(u => u.skills)).slice(1, 11);
  realIds.forEach(id => S().skills[id] = { m: 2, attempts: 9, correct: 9, stars: 3, nextReview: yest(), reviewStep: 0 });
  S().skills["ghost.skill"] = { m: 2, attempts: 9, correct: 9, stars: 3, nextReview: yest(), reviewStep: 0 };   // synced-from-the-future skill
  S().skills["count.to10"].nextReview = yest();
  BTApp.renderMap();
  t("big backlog banner frames the bite of 8", String(h.ids["reviewBanner"]._inner).includes("8") && String(h.ids["reviewBanner"]._inner).includes("waiting"));
  BTApp.startReview();
  t("challenge caps at 8 and skips unknown synced skills", BTApp.sess().total === 8 && !BTApp.sess().queue.includes("ghost.skill"));
  const first = BTApp.sess().curSkill;
  BTApp.submit(true, ""); await sleep(70);
  t("defended skill → Mastered", S().skills[first].m === 3);
  const second = BTApp.sess().curSkill;
  BTApp.submit(false, ""); await sleep(90);
  t("failed review drops a level", S().skills[second].m === 1);
  for (let i = 2; i < 8; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  const modal = h.ids["overlay"].children[h.ids["overlay"].children.length - 1];
  let hasMore = false;
  walk(modal, e => { if (String(e._inner || "").includes("more!")) hasMore = true; });
  t("finisher offers the next bite", hasMore);
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  BT.ISLANDS[0].units.flatMap(u => u.skills).forEach(id => { if (!S().skills[id] || S().skills[id].m < 1) S().skills[id] = { m: 1, attempts: 7, correct: 6, stars: 1, nextReview: null, reviewStep: 0 }; });
  BTApp.renderMap();
  const xp0 = S().xp;
  BTApp.startBoss("sprout");
  for (let i = 0; i < 10; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  t("boss conquest: won flag + best score + 100 XP bonus", S().bosses.sprout.won === true && S().bosses.sprout.best === 10 && S().xp >= xp0 + 100);
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  BTApp.startDaily();
  for (let i = 0; i < 5; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  t("daily campfire lights the streak", S().streak.count === 1);
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  S().settings.dailyLimit = 15;
  S().timeByDay[new Date().toISOString().slice(0, 10)] = 16 * 60;
  BTApp.startSet("count.to10", "practice");
  t("soft limit interposes a break (no session yet)", BTApp.sess() === null);
  const brk = h.ids["overlay"].children[h.ids["overlay"].children.length - 1];
  let moreBtn = null;
  walk(brk, e => { if (e.tag === "button" && String(e._inner || e.textContent).includes("One more")) moreBtn = e; });
  moreBtn.onclick();
  t("…but never locks: one-more-set proceeds", BTApp.sess() !== null && BTApp.sess().kind === "practice");
};
