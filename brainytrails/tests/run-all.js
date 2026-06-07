/* node tests/run-all.js — runs every suite, exits non-zero on failure. */
(async () => {
  let pass = 0, fail = 0;
  const t = (name, cond, extra) => {
    console.log((cond ? "✅" : "❌"), name + (cond || !extra ? "" : " — " + extra));
    cond ? pass++ : fail++;
  };
  for (const suite of ["gen.test", "engine.test", "ui.test", "voice.test"]) {
    console.log(`\n── ${suite} ──`);
    try { await require("./" + suite)(t); }
    catch (e) { console.log("❌ SUITE CRASH:", suite, e.message, (e.stack.split("\n")[1] || "").trim()); fail++; }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
