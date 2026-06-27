/* Trail map, HUD, gate, test mode, show-me-how. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  let isles = 0;
  walk(h.ids["mapRoot"], e => { if (String(e.className).split(" ").includes("world-isle")) isles++; });
  t("world map shows the six islands", isles === 6);
  BTApp.enterIsland(0);
  let nodes = 0;
  walk(h.ids["islandRoot"], e => { if (e.dataset && e.dataset.skill) nodes++; });
  t("entering island 1 renders its lesson nodes", nodes === BT.ISLANDS[0].units.flatMap(u => u.skills).length);
  let bossCard = false, bossFace = false, coach = false;
  walk(h.ids["islandRoot"], e => {
    const c = String(e.className).split(" ");
    if (c.includes("iz-boss")) { bossCard = true; if (String(e._inner || "").includes(BT.ISLANDS[0].boss.emoji)) bossFace = true; }
    if (c.includes("iz-mentor")) coach = true;
  });
  t("island shows a mega boss card (no coach)", bossCard && bossFace && !coach);
  BTApp.exitIsland();
  t("HUD ring paints", String(h.ids["hudLv"].textContent) === "1" && String(h.ids["hud"].style.background).includes("conic"));

  BTApp.startSet("count.to10", "practice");
  const i0 = BTApp.sess().i;
  BTApp.submit(false, "");
  t("first slip stays on the same question (free retry)", BTApp.sess().i === i0 && BTApp.sess().outcomes[i0] === undefined);
  let revealed = false;
  walk(h.ids["answerArea"], e => { if (e.classList && e.classList.contains("reveal")) revealed = true; });
  t("retry keeps the answer secret (nothing revealed)", !revealed);
  let tryMsg = false;
  walk(h.ids["hintSlot"], e => { if (/try|another go|once more|one more/i.test(String(e._inner || ""))) tryMsg = true; });
  t("try-again encouragement shows with the hint", tryMsg);
  const promptBefore = String(h.ids["promptCard"]._inner);
  await sleep(80);
  BTApp.submit(false, "");
  await sleep(90);
  let coachInline = false;
  walk(h.ids["hintSlot"], e => { if (String(e._inner || "").includes("Let me show you")) coachInline = true; });
  const liveModals = h.ids["overlay"] ? h.ids["overlay"].children.filter(c => !c._removed).length : 0;
  t("failed-twice coach appears UNDER the card (no modal)", coachInline && liveModals === 0);
  t("the question card stays on screen for context", String(h.ids["promptCard"]._inner) === promptBefore);
  let coachBtn = null;
  walk(h.ids["answerArea"], e => { if (e.tag === "button" && String(e.className).includes("coach-next")) coachBtn = e; });
  t("coach controls live in the answer dock", !!coachBtn);
  const { clickThroughTeach } = require("./harness");
  await clickThroughTeach(h);
  await sleep(30);
  t("coach done → moves to the next question", BTApp.sess().i === i0 + 1);
  if (h.ids["overlay"]) h.ids["overlay"].children.length = 0;
  BTApp.exitPlay();

  // year-of-birth gate
  h.ids["parentsBtn"].onclick();
  let gate = h.ids["overlay"].children[h.ids["overlay"].children.length - 1];
  let asked = false;
  walk(gate, e => { if (String(e._inner || "").includes("year were you born")) asked = true; });
  t("gate asks for year of birth", asked);
  const press = (root, label) => { let hit = null; walk(root, e => { if (e.tag === "button" && String(e._inner || e.textContent) === label) hit = e; }); hit.onclick(); };
  // child enters their own year → gentle redirect, no rule leaked
  ["2", "0", "1", "8", "OK"].forEach(k => press(gate, k));
  let msg = "";
  walk(gate, e => { if (String(e.textContent || "").includes("grown-up")) msg = String(e.textContent); });
  t("child year: pass-to-a-grown-up message", msg.includes("grown-up"));
  t("…with no clue about the rule", !msg.includes("18") && !msg.toLowerCase().includes("year") && !msg.toLowerCase().includes("old"));
  let opened = false;
  walk(h.ids["overlay"], e => { if (String(e._inner || "").includes("Parents' Corner</h2>") || String(e._inner || "").includes("Parents' Corner")) { } });
  // adult year on the same pad → opens
  ["1", "9", "8", "5", "OK"].forEach(k => press(gate, k));
  walk(h.ids["overlay"], e => { if (String(e._inner || "").includes("👧 Children")) opened = true; });
  t("adult year opens the Parents' Corner", opened);
  h.ids["overlay"].children.length = 0;

  BTApp.enterTestMode();
  BTApp.startSet("count.to20", "practice");
  const yq = BTApp.sess().q;
  t("young island keypad becomes 4 choices", yq.format === "choice" && yq.choices.length === 4 && yq.choices.filter(c => c.correct).length === 1);
  BTApp.exitPlay();
  BTApp.startSet("add.to100", "practice");
  t("older island keeps the keypad", BTApp.sess().q.format === "keypad");
  BTApp.exitPlay();
  BTApp.startSet("time.oclock", "practice");
  const svgDrawn = String(h.ids["promptCard"]._inner).includes("<svg") && String(h.ids["promptCard"]._inner).includes("circle");
  t("clock question renders a drawn SVG clock", svgDrawn);
  BTApp.exitPlay();
  t("test mode unlocks everything", BTApp.state().profile === "_test");
  BTApp.exitTestMode();
  t("exit restores the family profile", BTApp.state().profile === "default" && !BTApp.state().profiles._test);
};
