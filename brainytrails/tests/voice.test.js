/* Voice stack: device (Web Speech) voices only — auto-pick, user choice,
   persistence, fallback, full-prompt reading, and the picker UI. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  let spoken = [];
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const V = (name, lang) => ({ name, lang, voiceURI: name, localService: true });
  global.speechSynthesis = {
    getVoices: () => [V("Karen", "en-AU"), V("Daniel", "en-GB"), V("Samantha", "en-US"), V("Fred", "en-US"), V("Amelie", "fr-FR")],
    cancel() { }, speak(u) { spoken.push(u); }, addEventListener() { },
  };
  global.Cloud = { isSignedIn: () => false, schedulePush() { } };
  // pre-seed a legacy profile carrying retired premium settings → migration cleans them
  h.store["bt_state_v1"] = JSON.stringify({ v: 1, profile: "default", profiles: { default: {
    skills: {}, xp: 0, streak: { count: 0, last: null },
    settings: { speech: true, kokoroVoice: true, premiumVoice: true } } } });
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];

  // migration retires the old premium settings and defaults voice to Auto
  t("retired premium settings are removed", S().settings.kokoroVoice === undefined && S().settings.premiumVoice === undefined);
  t("voice defaults to Auto (null)", S().settings.voiceURI === null);

  // auto-pick prefers the en-AU voice; the picker lists English voices only
  t("auto voice prefers en-AU 'Karen'", (BTApp.pickWebVoice() || {}).name === "Karen");
  const list = BTApp.listVoices();
  t("picker lists the English device voices only", list.length === 4 && list.every(v => /^en/.test(v.lang)) && !list.find(v => v.name === "Amelie"));

  // choosing a voice persists and is used when speaking
  BTApp.setVoice("Daniel");
  t("chosen voice persists", S().settings.voiceURI === "Daniel");
  t("pick honours the chosen voice", (BTApp.pickWebVoice() || {}).name === "Daniel");
  spoken = [];
  BTApp.startSet("count.to10", "practice");
  await sleep(20);
  t("speaking uses the chosen voice", spoken.length >= 1 && spoken[0].voice && spoken[0].voice.name === "Daniel");
  BTApp.exitPlay();

  // a chosen voice that isn't installed falls back to auto
  BTApp.setVoice("Cortana-not-installed");
  t("missing chosen voice falls back to auto", (BTApp.pickWebVoice() || {}).name === "Karen");

  // back to Auto clears the choice
  BTApp.setVoice("");
  t("Auto clears the saved choice", S().settings.voiceURI === null);

  // there is no network path any more: speaking is local only
  let fetched = 0; global.fetch = async () => { fetched++; return { ok: true }; };
  spoken = [];
  BTApp.startSet("count.to10", "practice");
  await sleep(20);
  t("speech is local only (no network)", spoken.length >= 1 && fetched === 0);
  BTApp.exitPlay();

  // the spoken question is the WHOLE prompt, maths symbols voiced as words
  spoken = [];
  BTApp.startSet("add.to100", "practice");
  await sleep(20);
  const utt = (spoken.find(u => u && /plus/.test(u.text)) || {}).text || "";
  t("spoken question reads the full prompt, symbols as words", /\d+\s+plus\s+\d+/.test(utt) && !utt.includes("+") && !utt.includes("="));
  BTApp.exitPlay();

  // Parents' Corner shows a tappable voice picker
  BTApp.openParents();
  let chips = [], danielChip = null;
  walk(h.ids["overlay"], e => { const c = String(e.className || ""); if (c.includes("voice-chip")) { chips.push(e); if (String(e._inner || "").includes("Daniel")) danielChip = e; } });
  t("voice picker renders a chip per voice (plus Auto)", chips.length === 5);
  danielChip.onclick();
  t("tapping a voice chip selects it", S().settings.voiceURI === "Daniel" && (BTApp.pickWebVoice() || {}).name === "Daniel");
  h.ids["overlay"].children.length = 0;
};
