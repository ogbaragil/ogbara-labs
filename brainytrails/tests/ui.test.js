/* Trail map, HUD, gate, test mode, show-me-how. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  let nodes = 0, rail = 0;
  walk(h.ids["mapRoot"], e => { if (e.dataset && e.dataset.skill) nodes++; });
  walk(h.ids["islRail"], e => { if (String(e.className).includes("rail-dot")) rail++; });
  t("58 trail nodes render", nodes === 58);
  t("island rail: 6 jump dots", rail === 6);
  t("HUD ring paints", String(h.ids["hudLv"].textContent) === "1" && String(h.ids["hud"].style.background).includes("conic"));

  BTApp.startSet("count.to10", "practice");
  BTApp.submit(false, "");
  t("miss reveals the 🎓 show-me-how button", h.ids["teachBtn"].hidden === false);
  BTApp.showMeHow();
  const teach = h.ids["overlay"].children[h.ids["overlay"].children.length - 1];
  let isTeach = false;
  walk(teach, e => { if (String(e._inner || "").includes("Let me show you")) isTeach = true; });
  t("on-demand stepper opens for the missed question", isTeach);
  h.ids["overlay"].children.length = 0;
  await sleep(90);
  BTApp.exitPlay();

  const b = h.ids["parentsBtn"];
  b.onpointerdown({ preventDefault() { }, pointerId: 1 });
  t("gate captures the pointer", b._captured === 1);
  await sleep(180);
  let opened = false;
  walk(h.ids["overlay"], e => { if (String(e._inner || "").includes("Parents")) opened = true; });
  t("hold opens the Parents' Corner", opened);
  h.ids["overlay"].children.length = 0;

  BTApp.enterTestMode();
  let locked = 0;
  walk(h.ids["mapRoot"], e => { if (e.dataset && e.dataset.skill && e.classList.contains("locked")) locked++; });
  t("test mode unlocks everything", BTApp.state().profile === "_test");
  BTApp.exitTestMode();
  t("exit restores the family profile", BTApp.state().profile === "default" && !BTApp.state().profiles._test);
};
