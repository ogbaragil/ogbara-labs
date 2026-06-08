#!/usr/bin/env node
/* =====================================================================
   Brainy Trails · release.js — bump every version stamp in lockstep.

   Version skew between the cached shell and its scripts blanks the map on
   stale caches, so a release must bump THREE coupled places at once:
     1. sw.js          → CACHE = "brainytrails-vN"
     2. sw.js          → the ?v=N query strings in ASSETS
     3. index.html     → the matching ?v=N on curriculum/cloud/app.js
   This script does all three (plus the APP_V diagnostics stamp in app.js)
   so they can never drift apart again.

   Usage (from the brainytrails/ folder or anywhere):
     node release.js            # bump cache vN → v(N+1)
     node release.js 23         # set the cache version explicitly to 23
   Then run the suite and commit:
     node tests/run-all.js
   ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const swPath = path.join(DIR, "sw.js");
const htmlPath = path.join(DIR, "index.html");
const appPath = path.join(DIR, "app.js");

function read(p) { return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.writeFileSync(p, s); }

const sw = read(swPath);
const cur = (sw.match(/brainytrails-v(\d+)/) || [])[1];
if (cur === undefined) { console.error("✗ could not find brainytrails-vN in sw.js"); process.exit(1); }

const arg = process.argv[2];
const next = arg !== undefined ? parseInt(arg, 10) : parseInt(cur, 10) + 1;
if (!Number.isInteger(next) || next < 0) { console.error("✗ bad target version:", arg); process.exit(1); }
if (next <= parseInt(cur, 10) && arg === undefined) { console.error("✗ refusing to go backwards"); process.exit(1); }

const reV = new RegExp("\\?v=" + cur + "\\b", "g");

// 1 & 2 — service worker: cache name + every ?v= asset stamp
let newSw = sw.replace(new RegExp("brainytrails-v" + cur + "\\b", "g"), "brainytrails-v" + next)
              .replace(reV, "?v=" + next);

// 3 — index.html: the ?v= stamps on the three scripts
const html = read(htmlPath);
const newHtml = html.replace(reV, "?v=" + next);

// bonus — APP_V diagnostics stamp (its own monotonic counter)
const app = read(appPath);
const appVCur = (app.match(/const APP_V = "(\d+)"/) || [])[1];
const appVNext = appVCur === undefined ? null : (parseInt(appVCur, 10) + 1);
const newApp = appVCur === undefined ? app : app.replace(/const APP_V = "\d+"/, `const APP_V = "${appVNext}"`);

let changed = 0;
if (newSw !== sw) { write(swPath, newSw); changed++; }
if (newHtml !== html) { write(htmlPath, newHtml); changed++; }
if (newApp !== app) { write(appPath, newApp); changed++; }

console.log(`✓ cache version  v${cur} → v${next}   (sw.js CACHE + ASSETS, index.html ?v=)`);
if (appVCur !== undefined) console.log(`✓ APP_V          ${appVCur} → ${appVNext}   (app.js diagnostics stamp)`);
console.log(`✓ ${changed} file${changed === 1 ? "" : "s"} updated. Next: node tests/run-all.js, then commit & push.`);
