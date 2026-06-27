/* Play-screen UX: order picks can be undone, and reaching Proficient on a
   practice set drops the "Practice again" card (the skill moves to review). */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];
  const resultModal = () => h.ids["overlay"].children[h.ids["overlay"].children.length - 1];
  const modalHas = (m, text) => { let f = false; walk(m, e => { if ((String(e._inner || "") + String(e.textContent || "")).includes(text)) f = true; }); return f; };
  const playSet = async () => { const n = BTApp.sess().total; for (let i = 0; i < n; i++) { BTApp.submit(true, ""); await sleep(60); } await sleep(70); };

  /* --- Fix 2: first perfect practice still offers "Practice again" --- */
  S().skills["count.to10"] = { m: 0, attempts: 0, correct: 0, stars: 0, perfects: 0, nextReview: null, reviewStep: 0 };
  BTApp.startSet("count.to10", "practice");
  await playSet();
  t("first perfect run reaches Familiar (not Proficient)", S().skills["count.to10"].m === 1);
  t("Familiar result still offers Practice again", modalHas(resultModal(), "Practice again") && modalHas(resultModal(), "Back to the map"));
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  /* --- Fix 2: the run that reaches Proficient hides "Practice again" --- */
  S().skills["count.to10"].perfects = 1;   // one perfect run already banked
  BTApp.startSet("count.to10", "practice");
  await playSet();
  t("second perfect run reaches Proficient", S().skills["count.to10"].m === 2);
  t("Proficient result keeps only Back to map", !modalHas(resultModal(), "Practice again") && modalHas(resultModal(), "Back to the map"));
  h.ids["overlay"].children.length = 0; BTApp.exitPlay();

  /* --- Fix 1: an order pick can be undone by tapping the placed tile --- */
  let orderId = null;
  for (const id of Object.keys(BT.SKILLS)) {
    let allOrder = true;
    for (let k = 0; k < 6; k++) { if (BT.SKILLS[id].gen(0.4 + k * 0.09).format !== "order") { allOrder = false; break; } }
    if (allOrder) { orderId = id; break; }
  }
  t("found a deterministic order skill", !!orderId);
  BTApp.enterTestMode();                    // bypass gating so any order skill starts
  BTApp.startSet(orderId, "practice");
  const q = BTApp.sess().q;
  const chips = [];
  walk(h.ids["answerArea"], e => { if (e.tag === "button" && String(e.className).split(" ").includes("chip")) chips.push(e); });
  t("order chips rendered", chips.length === q.items.length && chips.length >= 3);
  chips[0].onclick(); chips[1].onclick();
  t("two tiles placed and their chips disabled", BTApp.sess().orderPicked.length === 2 && chips[0].disabled === true && chips[1].disabled === true);
  const filled = [];
  walk(h.ids["answerArea"], e => { if (e.tag === "button" && String(e.className).includes("slot") && String(e.className).includes("filled")) filled.push(e); });
  t("placed tiles are tappable slots", filled.length === 2);
  filled[0].onclick();                      // undo the first placement
  t("undo removes the pick", BTApp.sess().orderPicked.length === 1);
  t("undone chip is selectable again", chips[0].disabled === false);
  BTApp.exitTestMode();

  // ── the island theme carries into the lesson ──
  BTApp.startSet("count.to10", "practice");   // count.to10 lives on island 1
  const scr = h.ids["scrPlay"];
  t("play screen picks up the island theme", scr.classList.contains("themed"));
  t("play screen carries the island skin", String(scr.dataset.isle) === "plaza");
  t("the island mentor reads the question", String(h.ids["playMentorFace"].textContent) === "🐉");
  BTApp.exitPlay();
};
