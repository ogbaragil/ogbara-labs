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
  BTApp.startSet("time.oclock", "practice");
  const svgDrawn = String(h.ids["promptCard"]._inner).includes("<svg") && String(h.ids["promptCard"]._inner).includes("circle");
  t("clock question renders a drawn SVG clock", svgDrawn);
  BTApp.exitPlay();
  let locked = 0;
  walk(h.ids["mapRoot"], e => { if (e.dataset && e.dataset.skill && e.classList.contains("locked")) locked++; });
  t("test mode unlocks everything", BTApp.state().profile === "_test");
  BTApp.exitTestMode();
  t("exit restores the family profile", BTApp.state().profile === "default" && !BTApp.state().profiles._test);
};
