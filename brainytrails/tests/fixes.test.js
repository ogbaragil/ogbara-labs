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
  BTApp.enterIsland(0);
  let waitingAtFamiliar = false;
  walk(h.ids["islandRoot"], e => { const c = String(e.className); if (c.includes("iz-boss") && c.includes("waiting")) waitingAtFamiliar = true; });
  BTApp.exitIsland();
  t("boss stays locked while skills are only Familiar", waitingAtFamiliar);

  sproutSkills.forEach(id => S().skills[id].m = 2);
  BTApp.enterIsland(0);
  let readyAtProficient = false;
  walk(h.ids["islandRoot"], e => { const c = String(e.className); if (c.includes("iz-boss") && c.includes("ready")) readyAtProficient = true; });
  BTApp.exitIsland();
  t("boss opens once every skill is Proficient", readyAtProficient);

  // ── v14: illustration geometry ──
  let angleOut = [];
  for (let deg = 10; deg <= 180; deg += 5) {
    const svg = BTApp.pic({ kind: "angle", deg });
    const vb = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    const W = +vb[1], H = +vb[2];
    for (const m of svg.matchAll(/(x1|y1|x2|y2)="(-?\d+(?:\.\d+)?)"/g)) {
      const v = +m[2], lim = /x/.test(m[1]) ? W : H;
      if (v < -0.5 || v > lim + 0.5) angleOut.push(`${deg}:${m[1]}=${v}`);
    }
  }
  t("angle rays stay on-canvas for 10-180 deg", angleOut.length === 0, angleOut.slice(0, 4).join(" "));

  const coinSvg = BTApp.pic({ kind: "coins", values: [5, 50, 20] });
  const radii = [...coinSvg.matchAll(/<circle[^>]*r="(\d+(?:\.\d+)?)"/g)].map(m => +m[1]);
  t("coins sized by value (distinct radii)", new Set(radii).size > 1);
  const cw = +(coinSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?)/) || [])[1];
  let coinsFit = true;
  for (const m of coinSvg.matchAll(/<circle cx="(\d+(?:\.\d+)?)"[^>]*r="(\d+(?:\.\d+)?)"/g)) if (+m[1] + +m[2] > cw + 0.5) coinsFit = false;
  t("coins fit inside the viewBox", coinsFit);

  const dimOf = (l, w) => { const m = BTApp.pic({ kind: "rect", l, w }).match(/<rect[^>]*width="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/); return { W: +m[1], H: +m[2] }; };
  const longRect = dimOf(8, 2), square = dimOf(5, 5);
  t("rectangle drawn to scale (faithful aspect ratio)", Math.abs(longRect.W / longRect.H - 4) < 0.6 && Math.abs(square.W / square.H - 1) < 0.15);

  // ── v14: learn-it-first ──
  const id = "count.to10";
  delete S().skills[id]; delete S().taught[id];
  document.getElementById("overlay").children.length = 0;
  BTApp.openSkill(id);
  let teaching = false, ansShown = false, goBtn = null;
  walk(document.getElementById("overlay"), e => {
    const txt = String(e._inner || "");
    if (txt.includes("Let's learn")) teaching = true;
    if (txt.includes("Answer:")) ansShown = true;
    if (e.tag === "button" && txt.includes("let's practice")) goBtn = e;
  });
  t("first encounter teaches before practice", teaching && BTApp.sess() === null);
  t("learn screen shows a worked example with the answer", ansShown);
  goBtn.onclick();
  t("ready marks the skill taught and starts practice", !!S().taught[id] && BTApp.sess() && BTApp.sess().kind === "practice");
  document.getElementById("overlay").children.length = 0; BTApp.exitPlay();

  BTApp.openSkill(id);
  let normalSheet = false, learnBtn = false;
  walk(document.getElementById("overlay"), e => {
    if (String(e._inner || "").includes("Practice · 7 questions")) normalSheet = true;
    if (e.tag === "button" && String(e._inner || "").includes("Learn it again")) learnBtn = true;
  });
  t("taught skill opens straight to the sheet", normalSheet && BTApp.sess() === null);
  t("sheet keeps a Learn-it-again button", learnBtn);
  document.getElementById("overlay").children.length = 0;

  // ── v15: campfire is dull when pending, glowing when today's daily is done ──
  S().streak = { count: 2, last: "2000-01-01" };   // has a streak but not lit today
  BTApp.renderMap();
  const fire = document.getElementById("campfire");
  t("campfire is dull/pending before today's daily", String(fire.className).includes("pending"));
  t("campfire shows the streak count", String(fire._inner).includes("2"));
  S().streak = { count: 3, last: new Date().toISOString().slice(0, 10) };   // done today
  BTApp.renderMap();
  t("campfire glows once today's daily is done", String(document.getElementById("campfire").className).includes("lit"));
};
