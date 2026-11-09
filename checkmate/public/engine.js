/* Check Mate engine: chess rules, notation, draw rules and the computer player.
   No DOM access, so the same file runs in the app, the AI web worker and the Cloudflare Worker.
   Squares are 0..63 with 0 = a8 and 63 = h1. Pieces are FEN letters (upper = white). */
(function (root) {
  "use strict";
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FILES = "abcdefgh";
  const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
  const sqIndex = (n) => (8 - +n[1]) * 8 + FILES.indexOf(n[0]);
  const isWhite = (p) => p && p === p.toUpperCase();
  const colorOf = (p) => (p ? (isWhite(p) ? "w" : "b") : "");

  // ---------- FEN ----------
  function parseFEN(fen) {
    const [pos, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
    const board = [];
    for (const ch of pos.replace(/\//g, "")) {
      if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) board.push("");
      else board.push(ch);
    }
    return { board, turn: turn || "w", castling: cast && cast !== "-" ? cast : "",
             ep: ep && ep !== "-" ? sqIndex(ep) : -1, half: +half || 0, full: +full || 1 };
  }
  function toFEN(s, short) {
    let out = "";
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let c = 0; c < 8; c++) {
        const p = s.board[r * 8 + c];
        if (!p) e++; else { if (e) { out += e; e = 0; } out += p; }
      }
      if (e) out += e;
      if (r < 7) out += "/";
    }
    out += ` ${s.turn} ${s.castling || "-"} ${s.ep >= 0 ? sqName(s.ep) : "-"}`;
    return short ? out : out + ` ${s.half} ${s.full}`;
  }
  const clone = (s) => ({ board: s.board.slice(), turn: s.turn, castling: s.castling, ep: s.ep, half: s.half, full: s.full });
  // Position key for repetition: ep square only counts if a capture there is actually possible.
  function key(s) {
    let ep = "-";
    if (s.ep >= 0) {
      const pawn = s.turn === "w" ? "P" : "p", r = s.ep >> 3, c = s.ep & 7, rr = s.turn === "w" ? r + 1 : r - 1;
      for (const dc of [-1, 1]) { const cc = c + dc; if (cc >= 0 && cc < 8 && s.board[rr * 8 + cc] === pawn) ep = sqName(s.ep); }
    }
    return s.board.map((p) => p || ".").join("") + s.turn + (s.castling || "-") + ep;
  }

  // ---------- attacks ----------
  const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]], ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
  function attacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7, w = by === "w";
    const P = w ? "P" : "p", N = w ? "N" : "n", B = w ? "B" : "b", R = w ? "R" : "r", Q = w ? "Q" : "q", K = w ? "K" : "k";
    const pr = w ? r + 1 : r - 1; // attacking pawn sits one rank "behind" the square
    if (pr >= 0 && pr < 8) for (const dc of [-1, 1]) { const cc = c + dc; if (cc >= 0 && cc < 8 && b[pr * 8 + cc] === P) return true; }
    for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === N) return true; }
    for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === K) return true; }
    for (const [dr, dc] of DIAG) for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) {
      const p = b[rr * 8 + cc]; if (p) { if (p === B || p === Q) return true; break; } }
    for (const [dr, dc] of ORTH) for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) {
      const p = b[rr * 8 + cc]; if (p) { if (p === R || p === Q) return true; break; } }
    return false;
  }
  function kingSq(b, color) { const K = color === "w" ? "K" : "k"; return b.indexOf(K); }
  function inCheck(s, color) { color = color || s.turn; const k = kingSq(s.board, color); return k >= 0 && attacked(s.board, k, color === "w" ? "b" : "w"); }

  // ---------- move generation ----------
  // move: {from, to, p (piece), cap (captured piece or ""), promo ("q","r","b","n" or ""), f (flag)}
  // flags: "" normal, "b" double pawn push, "e" en passant, "k" castle king side, "q" castle queen side
  function pseudo(s, capsOnly) {
    const b = s.board, us = s.turn, them = us === "w" ? "b" : "w", out = [];
    const push = (from, to, p, f, promo) => {
      const cap = f === "e" ? (us === "w" ? "p" : "P") : b[to];
      if (capsOnly && !cap && !promo) return;
      out.push({ from, to, p, cap, promo: promo || "", f: f || "" });
    };
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || colorOf(p) !== us) continue;
      const r = i >> 3, c = i & 7, t = p.toLowerCase();
      if (t === "p") {
        const dir = us === "w" ? -1 : 1, start = us === "w" ? 6 : 1, last = us === "w" ? 0 : 7;
        const r1 = r + dir;
        if (r1 >= 0 && r1 < 8) {
          const one = r1 * 8 + c;
          if (!b[one]) {
            if (r1 === last) for (const pr of "qrbn") push(i, one, p, "", pr);
            else if (!capsOnly) {
              push(i, one, p);
              const two = (r + 2 * dir) * 8 + c;
              if (r === start && !b[two]) push(i, two, p, "b");
            }
          }
          for (const dc of [-1, 1]) {
            const cc = c + dc; if (cc < 0 || cc > 7) continue;
            const to = r1 * 8 + cc;
            if (b[to] && colorOf(b[to]) === them) {
              if (r1 === last) for (const pr of "qrbn") push(i, to, p, "", pr); else push(i, to, p);
            } else if (to === s.ep) push(i, to, p, "e");
          }
        }
      } else if (t === "n" || t === "k") {
        for (const [dr, dc] of t === "n" ? KN : KG) {
          const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc; if (!b[to] || colorOf(b[to]) === them) push(i, to, p);
        }
        if (t === "k" && !capsOnly) {
          const w = us === "w", home = w ? 60 : 4, rights = s.castling;
          if (i === home && !attacked(b, home, them)) {
            if (rights.includes(w ? "K" : "k") && !b[home + 1] && !b[home + 2] && b[home + 3] === (w ? "R" : "r")
                && !attacked(b, home + 1, them) && !attacked(b, home + 2, them)) push(i, home + 2, p, "k");
            if (rights.includes(w ? "Q" : "q") && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (w ? "R" : "r")
                && !attacked(b, home - 1, them) && !attacked(b, home - 2, them)) push(i, home - 2, p, "q");
          }
        }
      } else {
        const dirs = t === "b" ? DIAG : t === "r" ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) {
          const to = rr * 8 + cc;
          if (!b[to]) { push(i, to, p); continue; }
          if (colorOf(b[to]) === them) push(i, to, p);
          break;
        }
      }
    }
    return out;
  }
  const CASTLE_MASK = { 0: "q", 7: "k", 56: "Q", 63: "K" };
  function make(s, m) {
    const b = s.board, u = { castling: s.castling, ep: s.ep, half: s.half, full: s.full };
    b[m.to] = m.promo ? (s.turn === "w" ? m.promo.toUpperCase() : m.promo) : m.p;
    b[m.from] = "";
    if (m.f === "e") b[m.to + (s.turn === "w" ? 8 : -8)] = "";
    else if (m.f === "k") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ""; }
    else if (m.f === "q") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ""; }
    let cr = s.castling;
    if (cr) {
      if (m.p === "K") cr = cr.replace(/[KQ]/g, ""); else if (m.p === "k") cr = cr.replace(/[kq]/g, "");
      if (CASTLE_MASK[m.from]) cr = cr.replace(CASTLE_MASK[m.from], "");
      if (CASTLE_MASK[m.to]) cr = cr.replace(CASTLE_MASK[m.to], "");
      s.castling = cr;
    }
    s.ep = m.f === "b" ? (m.from + m.to) >> 1 : -1;
    s.half = m.p === "P" || m.p === "p" || m.cap ? 0 : s.half + 1;
    if (s.turn === "b") s.full++;
    s.turn = s.turn === "w" ? "b" : "w";
    return u;
  }
  function unmake(s, m, u) {
    const b = s.board;
    s.turn = s.turn === "w" ? "b" : "w";
    b[m.from] = m.p;
    if (m.f === "e") { b[m.to] = ""; b[m.to + (s.turn === "w" ? 8 : -8)] = m.cap; }
    else b[m.to] = m.cap;
    if (m.f === "k") { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = ""; }
    else if (m.f === "q") { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = ""; }
    s.castling = u.castling; s.ep = u.ep; s.half = u.half; s.full = u.full;
  }
  function legal(s, capsOnly) {
    const us = s.turn, out = [];
    for (const m of pseudo(s, capsOnly)) {
      const u = make(s, m);
      if (!inCheck(s, us)) out.push(m);
      unmake(s, m, u);
    }
    return out;
  }

  // ---------- notation ----------
  function san(s, m, moves) {
    moves = moves || legal(s);
    let out;
    if (m.f === "k") out = "O-O";
    else if (m.f === "q") out = "O-O-O";
    else {
      const t = m.p.toLowerCase();
      if (t === "p") out = (m.cap ? FILES[m.from & 7] + "x" : "") + sqName(m.to) + (m.promo ? "=" + m.promo.toUpperCase() : "");
      else {
        const rivals = moves.filter((o) => o.p === m.p && o.to === m.to && o.from !== m.from);
        let dis = "";
        if (rivals.length) {
          const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7)), sameRank = rivals.some((o) => o.from >> 3 === m.from >> 3);
          dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : sqName(m.from);
        }
        out = t.toUpperCase() + dis + (m.cap ? "x" : "") + sqName(m.to);
      }
    }
    const u = make(s, m);
    if (inCheck(s)) out += legal(s).length ? "+" : "#";
    unmake(s, m, u);
    return out;
  }
  function findMove(s, from, to, promo) {
    const ms = legal(s).filter((m) => m.from === from && m.to === to);
    if (!ms.length) return null;
    return ms.find((m) => m.promo === (promo || "q")) || ms.find((m) => !m.promo) || ms[0];
  }

  // ---------- game: replay a move list and work out the result ----------
  // moves: [{from, to, promo}] → {s, keys, list (with san), status}
  function replay(moves, startFen) {
    const s = parseFEN(startFen || START), keys = [key(s)], list = [];
    for (const mv of moves || []) {
      const m = findMove(s, mv.from, mv.to, mv.promo);
      if (!m) break;
      const n = san(s, m);
      make(s, m); keys.push(key(s));
      list.push({ from: m.from, to: m.to, promo: m.promo, san: n, cap: m.cap, p: m.p, f: m.f });
    }
    return { s, keys, list, status: status(s, keys) };
  }
  function insufficient(b) {
    const pcs = b.filter((p) => p && p.toLowerCase() !== "k");
    if (!pcs.length) return true;
    if (pcs.some((p) => "pPrRqQ".includes(p))) return false;
    if (pcs.length === 1) return true; // K+minor v K
    if (pcs.every((p) => p.toLowerCase() === "b")) { // bishops all on one colour
      const cols = new Set(); b.forEach((p, i) => { if (p && p.toLowerCase() === "b") cols.add(((i >> 3) + (i & 7)) % 2); });
      return cols.size === 1;
    }
    return false;
  }
  // Returns null while play continues, else {result: "1-0" | "0-1" | "1/2-1/2", reason}
  function status(s, keys) {
    const ms = legal(s);
    if (!ms.length) {
      if (inCheck(s)) return { result: s.turn === "w" ? "0-1" : "1-0", reason: "checkmate" };
      return { result: "1/2-1/2", reason: "stalemate" };
    }
    if (insufficient(s.board)) return { result: "1/2-1/2", reason: "insufficient material" };
    if (s.half >= 100) return { result: "1/2-1/2", reason: "fifty-move rule" };
    if (keys && keys.length) { const k = keys[keys.length - 1]; if (keys.filter((x) => x === k).length >= 3) return { result: "1/2-1/2", reason: "threefold repetition" }; }
    return null;
  }
  function pgn(list, tags) {
    let head = "";
    for (const k in tags || {}) head += `[${k} "${String(tags[k]).replace(/"/g, "'")}"]\n`;
    let body = "";
    list.forEach((m, i) => { if (i % 2 === 0) body += (i / 2 + 1) + ". "; body += m.san + " "; });
    return head + "\n" + body + ((tags && tags.Result) || "*") + "\n";
  }

  // ---------- evaluation ----------
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // Piece-square tables from white's point of view, a8..h1.
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
  };
  function evaluate(s) { // from side to move
    const b = s.board;
    let score = 0, nonPawn = 0;
    for (let i = 0; i < 64; i++) { const p = b[i]; if (p && "nbrqNBRQ".includes(p)) nonPawn += VAL[p.toLowerCase()]; }
    const endgame = nonPawn <= 1600;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue;
      const t = p.toLowerCase(), w = p !== t;
      const tbl = t === "k" && endgame ? PST.ke : PST[t];
      const v = VAL[t] + tbl[w ? i : i ^ 56];
      score += w ? v : -v;
    }
    return s.turn === "w" ? score : -score;
  }
  function material(b) { // {w, b} piece points (pawn = 1) for captured-piece displays
    const pts = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }; let w = 0, bl = 0;
    for (const p of b) if (p) { if (isWhite(p)) w += pts[p.toLowerCase()]; else bl += pts[p]; }
    return { w, b: bl };
  }

  // ---------- search ----------
  const MATE = 100000;
  function think(fen, opts) {
    opts = opts || {};
    const s = parseFEN(fen);
    const keys = opts.keys || [];
    const level = opts.level || "medium";
    const rand = opts.rand || Math.random;
    const root = legal(s);
    if (!root.length) return null;
    if (level === "easy" && rand() < 0.3) return root[Math.floor(rand() * root.length)];
    const maxDepth = level === "easy" ? 1 : level === "medium" ? 3 : 64;
    const deadline = Date.now() + (opts.ms || (level === "hard" ? 1500 : 800));
    const noise = level === "easy" ? 160 : level === "medium" ? 25 : 0;
    let nodes = 0, stop = false;
    const killers = [];
    const order = (ms, ply, pv) => {
      for (const m of ms) {
        m.o = (m.cap ? 10 * VAL[m.cap.toLowerCase()] - VAL[m.p.toLowerCase()] / 10 + 10000 : 0) + (m.promo ? 9000 : 0);
        const k = killers[ply]; if (k && k.from === m.from && k.to === m.to) m.o += 5000;
        if (pv && pv.from === m.from && pv.to === m.to && pv.promo === m.promo) m.o += 100000;
      }
      return ms.sort((a, b) => b.o - a.o);
    };
    const tick = () => { if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true; return stop; };
    function quiesce(alpha, beta, qd) {
      if (tick()) return 0;
      const stand = evaluate(s);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (qd > 6) return alpha;
      const us = s.turn;
      for (const m of order(pseudo(s, true), 99)) {
        const u = make(s, m);
        if (inCheck(s, us)) { unmake(s, m, u); continue; }
        const v = -quiesce(-beta, -alpha, qd + 1);
        unmake(s, m, u);
        if (stop) return 0;
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }
    const path = keys.slice(-12);
    function search(depth, alpha, beta, ply) {
      if (tick()) return 0;
      const chk = inCheck(s);
      if (chk && ply < 12) depth++;
      if (depth <= 0) return quiesce(alpha, beta, 0);
      const k = key(s);
      if (ply > 0 && (s.half >= 100 || path.includes(k))) return 0; // repetition = draw
      const ms = legal(s);
      if (!ms.length) return chk ? -MATE + ply : 0;
      path.push(k);
      let best = -Infinity;
      for (const m of order(ms, ply)) {
        const u = make(s, m);
        const v = -search(depth - 1, -beta, -alpha, ply + 1);
        unmake(s, m, u);
        if (stop) { path.pop(); return 0; }
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) { if (!m.cap) killers[ply] = m; break; }
      }
      path.pop();
      return best;
    }
    let bestMove = root[0], pv = null;
    const scores = new Map();
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -Infinity, iterBest = null, iterScore = -Infinity;
      path.push(key(s));
      for (const m of order(root, 0, pv)) {
        const u = make(s, m);
        // Levels with noise need exact scores for every move, so they search each with a full window.
        let v = -search(d - 1, -Infinity, noise ? Infinity : -alpha, 1);
        unmake(s, m, u);
        if (stop) break;
        v += noise ? (rand() * 2 - 1) * noise : 0;
        scores.set(m, v);
        if (v > iterScore) { iterScore = v; iterBest = m; }
        if (v > alpha) alpha = v;
      }
      path.pop();
      if (stop && !iterBest) break;
      if (iterBest) { bestMove = iterBest; pv = iterBest; }
      if (stop || Math.abs(iterScore) > MATE - 100) break;
      if (Date.now() > deadline - 50) break;
    }
    return { from: bestMove.from, to: bestMove.to, promo: bestMove.promo, nodes };
  }

  root.CM = { START, FILES, sqName, sqIndex, isWhite, colorOf, parseFEN, toFEN, clone, key, attacked, inCheck,
              pseudo, legal, make, unmake, san, findMove, replay, status, pgn, evaluate, material, think };
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
