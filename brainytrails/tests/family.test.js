/* Cloud merge completeness, multi-child isolation, lightning round, boss bests. */
const { makeHarness, boot, sleep, walk, failQuestion } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  delete global.Cloud; delete global.__KOKORO_TEST;   // suites share a process — scrub leaks
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state();
  const todayIso = new Date().toISOString().slice(0, 10);

  // ── cloud merge: everything earned crosses devices ──
  const me = S().profiles.default;
  me.badges = { first_fam: "2026-06-01" };
  me.bosses = { sprout: { won: true, best: 9 } };
  me.streak = { count: 2, last: "2026-06-05" };
  BTApp.mergeRemote({
    v: 1, profile: "default", syncNudged: true,
    profiles: {
      default: {
        skills: { "add.to10": { m: 3, attempts: 20, correct: 19, stars: 3, nextReview: "2026-07-01", reviewStep: 2 } },
        xp: 500, settings: { speech: true },
        badges: { first_prof: "2026-06-02" },
        bosses: { sprout: true, ember: { won: true, best: 8 } },
        streak: { count: 6, last: todayIso },
        timeByDay: { [todayIso]: 300 },
        lightningBest: 14,
        name: "Maya", avatar: "🦄",
      },
      _test: { skills: {}, xp: 9999, settings: {} },
    },
  });
  t("badges union across devices", me.badges.first_fam && me.badges.first_prof);
  t("crowns union, best scores kept (legacy true normalised)", me.bosses.sprout.won && me.bosses.sprout.best === 9 && me.bosses.ember.best === 8);
  t("fresher streak wins", me.streak.count === 6 && me.streak.last === todayIso);
  t("skills/xp/lightning/time merge", me.skills["add.to10"].m === 3 && me.xp === 500 && me.lightningBest === 14 && me.timeByDay[todayIso] === 300);
  t("remote identity adopted over defaults", me.name === "Maya" && me.avatar === "🦄");
  t("remote sandbox never merges in", !S().profiles._test || S().profiles._test.xp !== 9999);
  t("sync-nudge flag carries", S().syncNudged === true);

  // ── multi-child ──
  const id2 = BTApp.addChild("Theo", "🐯");
  t("second child added", BTApp.childIds().length === 2 && S().profiles[id2].name === "Theo");
  BTApp.openWho();
  let cards = 0;
  walk(h.ids["overlay"], e => { if (String(e.className).includes("who-card")) cards++; });
  t("who-picker lists both children", cards === 2);
  h.ids["overlay"].children.length = 0;
  BTApp.switchProfile(id2);
  BTApp.startSet("count.to10", "practice");
  for (let i = 0; i < 7; i++) { BTApp.submit(true, ""); await sleep(70); }
  await sleep(80);
  t("Theo's progress lands on Theo only", S().profiles[id2].skills["count.to10"].m === 1 && !S().profiles.default.skills["count.to10"]);
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();
  BTApp.switchProfile("default");
  t("switching back restores Maya intact", S().profile === "default" && S().profiles.default.name === "Maya" && S().profiles.default.xp === 500);

  // ── delete child + tombstone ──
  const id3 = BTApp.addChild("Zoe", "🐼");
  t("third child added", BTApp.childIds().length === 3);
  t("delete removes and tombstones", BTApp.deleteChild(id3) === true && !S().profiles[id3] && !!S().deletedProfiles[id3]);
  BTApp.mergeRemote({ v: 1, profile: "default", profiles: { [id3]: { skills: {}, xp: 50, settings: { speech: true } } } });
  t("cloud merge cannot resurrect a deleted child", !S().profiles[id3]);
  t("the last child can never be deleted", (() => { const ids = BTApp.childIds(); let p = true; for (const x of ids.slice(1)) BTApp.deleteChild(x); p = BTApp.childIds().length === 1 && BTApp.deleteChild(BTApp.childIds()[0]) === false; return p; })());
  // restore the second child for the isolation expectations below... (already consumed) re-add:
  t("speech pacing estimator: longer praise → longer pause, capped", BTApp.speechMs("Hi!") >= 900 && BTApp.speechMs("Brilliant, Maya!") > BTApp.speechMs("Hi!") && BTApp.speechMs("x".repeat(500)) === 4500);

  // ── lightning round ──
  const realIds = BT.ISLANDS.flatMap(i => i.units.flatMap(u => u.skills)).slice(0, 6);
  realIds.forEach(id => S().profiles.default.skills[id] = { m: 2, attempts: 9, correct: 9, stars: 3, nextReview: null, reviewStep: 0, lastD: 0.7 });
  S().profiles.default.lightningBest = 0;   // the merge test above set 14 — start this record chase clean
  BTApp.renderMap();
  t("lightning bolt button appears once 5+ skills are proficient", h.ids["lightningBtn"].hidden === false && String(h.ids["lightningBtn"]._inner).includes("bolt"));
  h.ids["lightningBtn"].onclick();   // dramatic strike → starts the round (instant under reduced-motion)
  t("lightning session running", BTApp.sess() && BTApp.sess().kind === "lightning");
  for (let i = 0; i < 4; i++) { BTApp.submit(true, ""); await sleep(60); }
  await sleep(1400);   // FAST lightning timer = 1200ms
  t("timer expiry records the best score", !BTApp.sess() && S().profiles.default.lightningBest === 4);
  let again = null;
  walk(h.ids["overlay"], e => { if (e.tag === "button" && String(e._inner || "").includes("Go again")) again = e; });
  t("result offers an immediate rematch", !!again);
  h.ids["overlay"].children.length = 0;
  document.body.classList.remove("in-play");
  BTApp.exitPlay();

  // ── boss best on rematch ──
  BT.ISLANDS[0].units.flatMap(u => u.skills).forEach(id => { if (!S().profiles.default.skills[id] || S().profiles.default.skills[id].m < 1) S().profiles.default.skills[id] = { m: 1, attempts: 7, correct: 6, stars: 1, nextReview: null, reviewStep: 0 }; });
  BTApp.startBoss("sprout");
  for (let i = 0; i < 8; i++) { BTApp.submit(true, ""); await sleep(70); }
  await failQuestion(BTApp, h);
  await failQuestion(BTApp, h);
  await sleep(80);
  t("rematch below best keeps the record (9)", S().profiles.default.bosses.sprout.best === 9 && S().profiles.default.bosses.sprout.won === true);
  h.ids["overlay"].children.length = 0;
  BTApp.exitPlay();
};
