/* Tilecraft engine: dictionary (DAWG), rules, scoring and the computer opponent.
   No DOM access, so it runs in the browser and in Node for tests. */
(function (root) {
  "use strict";
  const N = 15, CENTER = 112, RACK = 7, BINGO = 50;
  const VALUES = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10,"?":0 };
  const COUNTS = { a:9,b:2,c:2,d:4,e:12,f:2,g:3,h:2,i:9,j:1,k:1,l:4,m:2,n:6,o:8,p:2,q:1,r:6,s:4,t:6,u:4,v:2,w:2,x:1,y:2,z:1,"?":2 };
  // T = triple word, D = double word, t = triple letter, d = double letter, * = centre (double word)
  const HALF = ["T..d...T...d..T", ".D...t...t...D.", "..D...d.d...D..", "d..D...d...D..d",
                "....D.....D....", ".t...t...t...t.", "..d...d.d...d..", "T..d...*...d..T"];
  const LAYOUT = HALF.concat(HALF.slice(0, 7).reverse()).join("");
  const PREMIUM = [...LAYOUT].map((ch) => ({ T:{w:3,l:1,k:"tw"}, D:{w:2,l:1,k:"dw"}, "*":{w:2,l:1,k:"star"},
    t:{w:1,l:3,k:"tl"}, d:{w:1,l:2,k:"dl"} }[ch] || { w:1, l:1, k:"" }));

  // ---------- Dictionary ----------
  let E = null; // Uint32Array of DAWG edges
  function loadDawg(buffer) { E = new Uint32Array(buffer); }
  function ready() { return !!E; }
  function child(node, code) { // edge index or -1
    if (!node) return -1;
    for (let j = node; ; j++) { const e = E[j]; if ((e & 31) === code) return j; if (e & 64) return -1; }
  }
  function isWord(w) {
    w = w.toLowerCase(); if (w.length < 2) return false;
    let n = 1;
    for (let i = 0; i < w.length; i++) {
      const j = child(n, w.charCodeAt(i) - 97); if (j < 0) return false;
      if (i === w.length - 1) return !!(E[j] & 32);
      n = E[j] >>> 7;
    }
    return false;
  }

  // ---------- Bag ----------
  function newBag(rand) {
    rand = rand || Math.random;
    const bag = []; let id = 0;
    for (const l in COUNTS) for (let i = 0; i < COUNTS[l]; i++) bag.push({ id: id++, l });
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    return bag;
  }

  // ---------- Scoring & validation ----------
  // board: Array(225) of null | {l, b}. placements: [{sq, l, b}] (l = letter played, b = blank)
  function scoreMove(board, placements) {
    const tmp = new Map(placements.map((p) => [p.sq, p]));
    const get = (sq) => tmp.get(sq) || board[sq];
    let across;
    if (placements.length > 1) across = Math.floor(placements[0].sq / N) === Math.floor(placements[1].sq / N);
    else {
      const s = placements[0].sq, c = s % N;
      across = (c > 0 && board[s - 1]) || (c < N - 1 && board[s + 1]);
    }
    const words = [];
    function wordAt(sq, horiz) {
      const step = horiz ? 1 : N;
      const okPrev = (x) => horiz ? x % N !== 0 : x >= N;
      const okNext = (x) => horiz ? x % N !== N - 1 : x < N * (N - 1);
      let s = sq; while (okPrev(s) && get(s - step)) s -= step;
      let w = "", sum = 0, mult = 1, sqs = [];
      for (let x = s; ; x += step) {
        const t = get(x); if (!t) break;
        let v = t.b ? 0 : VALUES[t.l];
        if (tmp.has(x)) { v *= PREMIUM[x].l; mult *= PREMIUM[x].w; }
        w += t.l; sum += v; sqs.push(x);
        if (!okNext(x)) break;
      }
      return { w, s: sum * mult, sqs };
    }
    const main = wordAt(placements[0].sq, !!across);
    if (main.w.length >= 2) words.push(main);
    for (const p of placements) { const x = wordAt(p.sq, !across); if (x.w.length >= 2) words.push(x); }
    let score = words.reduce((a, w) => a + w.s, 0);
    const bingo = placements.length === RACK;
    if (bingo) score += BINGO;
    return { score, words, bingo, across: !!across };
  }

  function validate(board, placements) {
    if (!placements.length) return { ok: false, error: "Place some tiles first." };
    const sqs = placements.map((p) => p.sq).sort((a, b) => a - b);
    const rows = new Set(sqs.map((s) => Math.floor(s / N))), cols = new Set(sqs.map((s) => s % N));
    if (rows.size > 1 && cols.size > 1) return { ok: false, error: "Tiles must be in one row or column." };
    const empty = board.every((t) => !t);
    const tmp = new Set(sqs);
    const step = rows.size === 1 ? 1 : N;
    if (sqs.length > 1) for (let x = sqs[0]; x <= sqs[sqs.length - 1]; x += step)
      if (!tmp.has(x) && !board[x]) return { ok: false, error: "Leave no gaps between tiles." };
    if (empty) {
      if (!tmp.has(CENTER)) return { ok: false, error: "The first word must cover the centre star." };
      if (sqs.length < 2) return { ok: false, error: "The first word needs at least two letters." };
    } else {
      const touches = sqs.some((s) => { const c = s % N;
        return (c > 0 && board[s - 1]) || (c < N - 1 && board[s + 1]) || (s >= N && board[s - N]) || (s < N * (N - 1) && board[s + N]); });
      if (!touches) return { ok: false, error: "Connect to the tiles already on the board." };
    }
    const r = scoreMove(board, placements);
    if (!r.words.length) return { ok: false, error: "Make a word of two or more letters." };
    const bad = r.words.filter((w) => !isWord(w.w)).map((w) => w.w.toUpperCase());
    if (bad.length) return { ok: false, error: "Not in the word list: " + bad.join(", "), bad, ...r };
    return { ok: true, ...r };
  }

  // ---------- Move generator (Appel–Jacobson, anchors + cross-checks) ----------
  const ALL = (1 << 26) - 1;
  function generate(board, rackLetters) {
    const L = new Int8Array(N * N).fill(-1);
    let any = false;
    board.forEach((t, i) => { if (t) { L[i] = t.l.charCodeAt(0) - 97; any = true; } });
    const cnt = new Int8Array(27);
    for (const l of rackLetters) cnt[l === "?" ? 26 : l.charCodeAt(0) - 97]++;
    const rackSize = rackLetters.length;
    const out = [], seen = new Set();
    for (let dir = 0; dir < 2; dir++) {
      const idx = dir === 0 ? (r, c) => r * N + c : (r, c) => c * N + r;
      const at = (r, c) => L[idx(r, c)];
      for (let r = 0; r < N; r++) {
        const cross = new Int32Array(N), anchor = new Uint8Array(N);
        for (let c = 0; c < N; c++) {
          if (at(r, c) >= 0) continue;
          let up = "", dn = "";
          for (let k = r - 1; k >= 0 && at(k, c) >= 0; k--) up = String.fromCharCode(97 + at(k, c)) + up;
          for (let k = r + 1; k < N && at(k, c) >= 0; k++) dn += String.fromCharCode(97 + at(k, c));
          if (!up && !dn) cross[c] = ALL;
          else { let m = 0; for (let l = 0; l < 26; l++) if (isWord(up + String.fromCharCode(97 + l) + dn)) m |= 1 << l; cross[c] = m; }
          const nb = (c > 0 && at(r, c - 1) >= 0) || (c < N - 1 && at(r, c + 1) >= 0) || up || dn;
          anchor[c] = any ? (nb ? 1 : 0) : (idx(r, c) === CENTER ? 1 : 0);
        }
        const w = [], bl = [];
        const record = (end) => {
          const start = end - w.length, pl = [];
          for (let i = 0; i < w.length; i++) if (at(r, start + i) < 0) pl.push({ sq: idx(r, start + i), l: String.fromCharCode(97 + w[i]), b: bl[i] });
          const key = pl.map((p) => p.sq + p.l + (p.b ? "?" : "")).sort().join("|");
          if (!seen.has(key)) { seen.add(key); out.push(pl); }
        };
        const extend = (node, col, term, anc) => {
          if (col >= N || at(r, col) < 0) {
            if (term && col > anc) record(col);
            if (col >= N || !node) return;
            for (let j = node; ; j++) {
              const e = E[j], l = e & 31;
              if (cross[col] & (1 << l)) {
                if (cnt[l] > 0) { cnt[l]--; w.push(l); bl.push(false); extend(e >>> 7, col + 1, !!(e & 32), anc); w.pop(); bl.pop(); cnt[l]++; }
                if (cnt[26] > 0) { cnt[26]--; w.push(l); bl.push(true); extend(e >>> 7, col + 1, !!(e & 32), anc); w.pop(); bl.pop(); cnt[26]++; }
              }
              if (e & 64) break;
            }
          } else {
            const j = child(node, at(r, col)); if (j < 0) return;
            w.push(at(r, col)); bl.push(false); extend(E[j] >>> 7, col + 1, !!(E[j] & 32), anc); w.pop(); bl.pop();
          }
        };
        const left = (node, limit, anc) => {
          extend(node, anc, false, anc);
          if (limit <= 0 || !node) return;
          for (let j = node; ; j++) {
            const e = E[j], l = e & 31;
            if (cnt[l] > 0) { cnt[l]--; w.push(l); bl.push(false); left(e >>> 7, limit - 1, anc); w.pop(); bl.pop(); cnt[l]++; }
            if (cnt[26] > 0) { cnt[26]--; w.push(l); bl.push(true); left(e >>> 7, limit - 1, anc); w.pop(); bl.pop(); cnt[26]++; }
            if (e & 64) break;
          }
        };
        for (let c = 0; c < N; c++) {
          if (!anchor[c]) continue;
          if (c > 0 && at(r, c - 1) >= 0) {
            let s = c - 1; while (s > 0 && at(r, s - 1) >= 0) s--;
            let node = 1, ok = true;
            for (let k = s; k < c; k++) { const j = child(node, at(r, k)); if (j < 0) { ok = false; break; } w.push(at(r, k)); bl.push(false); node = E[j] >>> 7; }
            if (ok && node) extend(node, c, false, c);
            w.length = 0; bl.length = 0;
          } else {
            let lim = 0; for (let k = c - 1; k >= 0 && at(r, k) < 0 && !anchor[k]; k--) lim++;
            left(1, Math.min(lim, rackSize - 1), c);
          }
        }
      }
    }
    return out.map((pl) => ({ placements: pl, ...scoreMove(board, pl) }));
  }

  // Value of the tiles kept after a move (rough "leave" heuristic for the hard computer).
  const KEEP = { "?":24, s:7, z:2, x:3, e:1.5, r:1, a:.5, n:.5, t:.5, l:.5, i:-.5, o:-1, d:.5, h:.5, c:.5, m:.5,
                 u:-2.5, v:-4, w:-3, q:-7, j:-2, k:-1, b:-2, f:-1.5, g:-1.5, p:-.5, y:-.5 };
  function leaveValue(letters) {
    let v = 0; const seen = {};
    let vow = 0;
    for (const l of letters) {
      v += KEEP[l] || 0; seen[l] = (seen[l] || 0) + 1;
      if (seen[l] > 1 && l !== "?") v -= 3;
      if ("aeiou".includes(l)) vow++;
    }
    if (letters.includes("q") && letters.includes("u")) v += 6;
    const cons = letters.length - vow - letters.filter((l) => l === "?").length;
    if (letters.length) v -= Math.abs(vow - cons * 0.7) * 1.5;
    return v;
  }

  // Choose a move for the computer. level: easy | medium | hard. Returns move or null.
  function chooseMove(board, rackLetters, level, bagCount, rand) {
    rand = rand || Math.random;
    const moves = generate(board, rackLetters);
    if (!moves.length) return null;
    if (level === "hard") {
      let best = null, bestEq = -1e9;
      for (const m of moves) {
        const rest = rackLetters.slice();
        for (const p of m.placements) rest.splice(rest.indexOf(p.b ? "?" : p.l), 1);
        let eq = m.score + (bagCount > 0 ? leaveValue(rest) : -rest.reduce((a, l) => a + VALUES[l], 0) * 2);
        if (eq > bestEq) { bestEq = eq; best = m; }
      }
      return best;
    }
    moves.sort((a, b) => b.score - a.score);
    let pool;
    if (level === "medium") {
      pool = moves.slice(Math.floor(moves.length * 0.03), Math.max(1, Math.ceil(moves.length * 0.15)));
      pool = pool.filter((m) => !m.placements.some((p) => p.b) || m.score > 30);
    } else {
      const short = moves.filter((m) => m.words[0].w.length <= 5 && !m.placements.some((p) => p.b));
      const src = short.length ? short : moves;
      pool = src.slice(Math.floor(src.length * 0.35), Math.max(1, Math.ceil(src.length * 0.75)));
    }
    if (!pool.length) pool = moves;
    return pool[Math.floor(rand() * pool.length)];
  }

  root.TC = { N, CENTER, RACK, BINGO, VALUES, COUNTS, PREMIUM, loadDawg, ready, isWord, newBag, scoreMove, validate, generate, chooseMove, leaveValue };
})(typeof window !== "undefined" ? window : globalThis);
