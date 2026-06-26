/* Leaving test mode must return to the child you were on, and must never strand
   the app on a profile id that doesn't exist — that dangling state was the cause
   of the "undefined is not an object (evaluating 'P().settings')" crash. */
const { makeHarness, boot, sleep } = require("./harness");
module.exports = async function (t) {
  const h = makeHarness();
  boot(require("path").join(__dirname, ".."));
  await sleep(30);
  const st = () => BTApp.state();
  const active = () => st().profiles[st().profile];

  // add a second child and make them the active one
  const kid = BTApp.addChild("Kid B", "🐸");
  BTApp.switchProfile(kid);
  t("active child is the newly added one", st().profile === kid);

  // round-trip through test mode returns to the SAME child (was hard-coded to 'default')
  BTApp.enterTestMode();
  t("test mode swaps to the sandbox", st().profile === "_test");
  BTApp.exitTestMode();
  t("leaving test mode returns to the same child", st().profile === kid);
  t("active profile resolves with settings (no undefined P())", !!active() && !!active().settings);

  // even if the original 'default' child has been removed, exit lands on a real profile
  if (st().profiles.default && BTApp.childIds().length >= 2) {
    BTApp.switchProfile(kid);
    BTApp.deleteChild("default");
    BTApp.enterTestMode();
    BTApp.exitTestMode();
    t("exit lands on a real profile when 'default' is gone", st().profile !== "_test" && !!active() && !!active().settings);
  }
};
