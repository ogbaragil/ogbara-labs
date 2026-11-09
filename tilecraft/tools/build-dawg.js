// Builds a minimised DAWG from a word list and writes it as a flat Uint32 edge array.
// Edge layout (u32): bits 0-4 letter (a=0), bit 5 = word ends here, bit 6 = last edge of node,
// bits 7-31 = index of child node's first edge (0 = leaf). Index 0 is a dummy; root starts at 1.
// Usage: node build-dawg.js <wordlist.txt> <out.bin>
const fs = require("fs");
const [, , inFile, outFile] = process.argv;

const EXTRA = ["qi", "za", "ok", "ew", "zen", "emoji", "vlog", "selfie", "yowza"]; // a few modern additions
// Words the computer never plays (still accepted from humans so the dictionary stays complete).
const words = new Set();
for (const w of fs.readFileSync(inFile, "utf8").split(/\r?\n/)) {
  const t = w.trim().toLowerCase();
  if (/^[a-z]{2,15}$/.test(t)) words.add(t);
}
EXTRA.forEach((w) => words.add(w));
const list = [...words].sort();

// Daciuk incremental minimisation
let nextId = 0;
function mk() { return { id: nextId++, end: false, kids: new Map() }; }
const root = mk();
const register = new Map();
function sig(n) {
  let s = n.end ? "1" : "0";
  for (const [c, k] of [...n.kids].sort()) s += c + k.id + ",";
  return s;
}
function minimise(node) {
  for (const [c, child] of node.kids) {
    if (child.kids.size) minimise(child); // only last child is unregistered in practice
  }
}
let prev = "";
const stack = [root]; // path of nodes for prev word
function replaceOrRegister(node) {
  const entries = [...node.kids];
  const [c, child] = entries[entries.length - 1];
  if (child.kids.size) replaceOrRegister(child);
  const s = sig(child);
  const hit = register.get(s);
  if (hit) node.kids.set(c, hit);
  else register.set(s, child);
}
for (const w of list) {
  let i = 0, node = root;
  while (i < w.length && node.kids.has(w[i])) { node = node.kids.get(w[i]); i++; }
  if (node.kids.size) replaceOrRegister(node);
  for (; i < w.length; i++) { const n = mk(); node.kids.set(w[i], n); node = n; }
  node.end = true;
}
replaceOrRegister(root);

// Encode
const index = new Map(); // node -> first edge index
const edges = [0];
const order = [];
const seen = new Set();
(function walk(n) {
  if (seen.has(n)) return; seen.add(n); order.push(n);
  for (const k of n.kids.values()) walk(k);
})(root);
for (const n of order) { if (n.kids.size) { index.set(n, edges.length); for (let i = 0; i < n.kids.size; i++) edges.push(0); } }
for (const n of order) {
  if (!n.kids.size) continue;
  const base = index.get(n);
  const ks = [...n.kids].sort();
  ks.forEach(([c, k], i) => {
    let e = (c.charCodeAt(0) - 97) | (k.end ? 32 : 0) | (i === ks.length - 1 ? 64 : 0);
    e = (e | ((k.kids.size ? index.get(k) : 0) << 7)) >>> 0;
    edges[base + i] = e;
  });
}
const buf = Buffer.alloc(edges.length * 4);
edges.forEach((e, i) => buf.writeUInt32LE(e >>> 0, i * 4));
fs.writeFileSync(outFile, buf);
console.log(`words=${list.length} nodes=${order.length} edges=${edges.length} bytes=${buf.length}`);
