/* Voice stack: web-voice picking, Kokoro gating, routing, clip cache. */
const { makeHarness, boot, sleep, walk } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  // browser audio shims
  let spoken = [];
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  global.speechSynthesis = {
    getVoices: () => [
      { name: "Fred", lang: "en-US", localService: true },
      { name: "Karen", lang: "en-AU", localService: true },
      { name: "Google UK English Female", lang: "en-GB" },
    ],
    cancel() { }, speak(u) { spoken.push(u); }, addEventListener() { },
  };
  global.Blob = class { constructor(parts, opts) { this.size = 1; } };
  global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() { } };
  global.Audio = class { constructor(u) { this.src = u; } play() { return { catch() { } }; } pause() { } };
  boot(require("path").join(__dirname, ".."));
  await sleep(30);

  const best = BTApp.pickWebVoice();
  t("voice picker prefers the en-AU 'Karen' voice", best && best.name === "Karen");

  // signed-out gating
  delete global.Cloud;
  BTApp.openParents();
  let cta = false;
  walk(h.ids["overlay"], e => { if (String(e._inner || "").includes("Sign in to unlock")) cta = true; });
  t("signed out: premium voice shows a sign-in CTA", cta && !BTApp.voice().unlocked);
  h.ids["overlay"].children.length = 0;

  // signed-in gating + stubbed download
  global.Cloud = { isSignedIn: () => true, schedulePush() { } };
  global.__KOKORO_TEST = {
    KokoroTTS: {
      from_pretrained: async (id, opts) => {
        if (opts && opts.progress_callback) opts.progress_callback({ progress: 100 });
        return { generate: async (text) => ({ audio: new Float32Array(64), sampling_rate: 22050 }) };
      },
    },
  };
  BTApp.openParents();
  let dlBtn = null;
  walk(h.ids["overlay"], e => { if (e.tag === "button" && String(e._inner || e.textContent).includes("Download premium voice")) dlBtn = e; });
  t("signed in: download button appears", !!dlBtn);
  await dlBtn.onclick();
  await sleep(30);
  t("download completes: status ready + setting on", BTApp.voice().status === "ready" && BTApp.voice().enabled);
  h.ids["overlay"].children.length = 0;

  // routing: say() goes through Kokoro and caches the clip
  spoken = [];
  BTApp.startSet("count.to10", "practice");
  await sleep(60);
  t("question speech routes through Kokoro (clip cached)", BTApp.voice().cached >= 1);
  t("…and web speech stays silent", spoken.length === 0);
  BTApp.exitPlay();

  // toggle off → falls back to (picked) web voice
  const S = BTApp.state().profiles[BTApp.state().profile];
  S.settings.kokoroVoice = false;
  BTApp.startSet("count.to10", "practice");
  await sleep(60);
  t("toggled off: web speech speaks with the picked voice", spoken.length >= 1 && spoken[0].voice && spoken[0].voice.name === "Karen");
  BTApp.exitPlay();
};
