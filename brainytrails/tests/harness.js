/* Headless DOM shim + app loader for Brainy Trails tests.
 * Run suites via: node tests/run-all.js  (from the brainytrails folder or repo root)
 * Conventions that matter (learned the hard way):
 *  - assert on dataset/classList state, not className substrings (" l" matches " locked")
 *  - textContent stores raw values; String() before comparing
 *  - sleeps must stay inside __BT_FAST windows (MS_OK 40 / MS_BAD 60)
 */
function makeHarness() {
  const buttons = [];
  function makeEl(tag) {
    const kids = [];
    const e = {
      tag, className: "", _inner: "", style: {}, dataset: {}, textContent: "", hidden: false,
      value: "", type: "", maxLength: 0, title: "",
      set innerHTML(v) { this._inner = v; kids.length = 0; },
      get innerHTML() { return this._inner; },
      appendChild(c) { kids.push(c); return c; },
      append(...cs) { cs.forEach(c => typeof c === "object" && kids.push(c)); },
      remove() { e._removed = true; },
      querySelector(sel) {
        const f = [];
        (function w(x) { if (sel === '[data-correct="1"]' && x.dataset && x.dataset.correct === "1") f.push(x); (x.children || []).forEach(w); })(e);
        return f[0] || null;
      },
      querySelectorAll() { return []; },
      setAttribute(k, v) { e["_attr_" + k] = v; },
      addEventListener() { }, scrollIntoView() { e._scrolled = true; }, setPointerCapture(id) { e._captured = id; },
      get children() { return kids; },
      onclick: null, oninput: null, onpointerdown: null, onpointerup: null,
      onpointercancel: null, oncontextmenu: null, click() { if (e.onclick) e.onclick(); },
    };
    e.classList = {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle() { }, contains: (c) => e.classList._s.has(c),
    };
    if (tag === "button") buttons.push(e);
    return e;
  }
  const ids = {};
  const store = {};
  global.document = {
    createElement: makeEl,
    getElementById: (id) => ids[id] || (ids[id] = makeEl("button")),
    body: { appendChild() { }, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } },
    head: { appendChild() { } },
    addEventListener() { },
  };
  global.window = global;
  global.__BT_FAST = true;
  global.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
  global.addEventListener = () => { }; global.removeEventListener = () => { };
  global.matchMedia = () => ({ matches: true });
  global.navigator = { serviceWorker: { register: async () => { } } };
  return { ids, buttons, store };
}
function boot(dir) {
  const fs = require("fs"), path = require("path");
  global.BT = require(path.join(dir, "curriculum.js"));
  (0, eval)(fs.readFileSync(path.join(dir, "app.js"), "utf8"));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function walk(root, fn) { (function w(e) { fn(e); (e.children || []).forEach(w); })(root); }
/* failed-twice questions open the worked-steps modal; click through it */
async function clickThroughTeach(h) {
  for (let guard = 0; guard < 10; guard++) {
    let btn = null, found = false;
    for (const back of h.ids["overlay"].children) {
      if (back._removed) continue;
      walk(back, e => { if (String(e._inner || "").includes("Let me show you")) found = true; });
      if (found) { walk(back, e => { if (e.tag === "button" && String(e.className).includes("primary-btn")) btn = e; }); break; }
    }
    if (!found || !btn) return;
    btn.onclick();
    await sleep(20);
  }
}
/* fail a question fully: retry slip, then final fail, then walk the teach modal */
async function failQuestion(BTApp, h) {
  BTApp.submit(false, "");
  await sleep(80);          // retry unlock window (FAST 60ms)
  BTApp.submit(false, "");
  await sleep(90);          // MS_BAD before the teach modal opens
  await clickThroughTeach(h);
  await sleep(30);
}
module.exports = { makeHarness, boot, sleep, walk, clickThroughTeach, failQuestion };
