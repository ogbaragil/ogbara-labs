/* Voice stack: web-voice picking, premium gating, remote routing, caching, fallback, migration. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  let spoken = [], fetches = [];
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  global.speechSynthesis = {
    getVoices: () => [
      { name: "Fred", lang: "en-US", localService: true },
      { name: "Karen", lang: "en-AU", localService: true },
      { name: "Google UK English Female", lang: "en-GB" },
    ],
    cancel() { }, speak(u) { spoken.push(u); }, addEventListener() { },
  };
  global.Blob = class { };
  global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() { } };
  global.Audio = class { constructor(u) { this.src = u; } play() { return { catch() { } }; } pause() { } };
  global.fetch = async (url, opts) => { fetches.push({ url, opts }); return { ok: true, blob: async () => new Blob() }; };
  global.AbortController = class { constructor() { this.signal = {}; } abort() { } };
  // pre-seed a v13-era profile with the old setting name → migration must rename it
  h.store["bt_state_v1"] = JSON.stringify({ v: 1, profile: "default", profiles: { default: {
    skills: {}, xp: 0, streak: { count: 0, last: null }, settings: { speech: true, kokoroVoice: true } } } });
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const S = () => BTApp.state().profiles[BTApp.state().profile];

  t("voice picker prefers the en-AU 'Karen' voice", (BTApp.pickWebVoice() || {}).name === "Karen");
  t("kokoroVoice migrates to premiumVoice", S().settings.premiumVoice === true && S().settings.kokoroVoice === undefined);

  // gating: no proxy configured → locked regardless of sign-in
  global.Cloud = { isSignedIn: () => true, schedulePush() { } };
  global.TTS_PROXY = "";
  t("no proxy configured → premium locked", BTApp.voice().unlocked === false);
  BTApp.openParents();
  let note = false;
  walk(h.ids["overlay"], e => { if (String(e._inner || "").includes("isn't configured")) note = true; });
  t("parents' corner explains missing config", note);
  h.ids["overlay"].children.length = 0;

  // proxy set + signed out → CTA
  global.TTS_PROXY = "https://tts.test";
  global.Cloud = undefined;
  BTApp.openParents();
  let cta = false;
  walk(h.ids["overlay"], e => { if (String(e._inner || "").includes("Sign in to unlock")) cta = true; });
  t("signed out: sign-in CTA shown", cta);
  h.ids["overlay"].children.length = 0;

  // proxy + signed in + enabled → say() routes remotely, caches, never double-speaks
  global.Cloud = { isSignedIn: () => true, schedulePush() { } };
  spoken = []; fetches = [];
  BTApp.startSet("count.to10", "practice");
  await sleep(60);
  t("premium say() fetches from the proxy", fetches.length >= 1 && fetches[0].url === "https://tts.test");
  t("clip cached in memory", BTApp.voice().cached >= 1);
  t("feedback phrases prefetched at session start", fetches.length >= 5);
  t("web speech stays silent on the premium path", spoken.length === 0);
  BTApp.exitPlay();

  // network failure → graceful fallback to the picked web voice
  global.fetch = async () => { throw new Error("offline"); };
  spoken = [];
  const before = BTApp.voice().cached;
  BTApp.startSet("count.compare", "practice");
  await sleep(60);
  t("offline premium falls back to web speech", spoken.length >= 1 && spoken[0].voice && spoken[0].voice.name === "Karen");
  BTApp.exitPlay();

  // toggled off → straight to web speech, no fetches
  S().settings.premiumVoice = false;
  global.fetch = async (u, o) => { fetches.push({ u, o }); return { ok: true, blob: async () => new Blob() }; };
  fetches = []; spoken = [];
  BTApp.startSet("count.to10", "practice");
  await sleep(60);
  t("toggled off: web voice speaks, proxy untouched", spoken.length >= 1 && fetches.length === 0);
  BTApp.exitPlay();
};
