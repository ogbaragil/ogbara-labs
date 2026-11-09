/* Check Mate 3D board (three.js). Source file: build with tools/build-3d.sh into public/board3d.js.
   Only loaded when a player switches to the 3D view.

   createBoard3D(container, { onSquare(sq) }) → { update(view), resize(), dispose() }
   view = { board: [64 FEN letters], bottom: "w"|"b", last: {from,to}|null, sel, targets: [{to,cap}],
            hint: [sq], check: sq|-1, anim: {from,to,f,cap}|null, interactive: bool }
   Squares are 0..63 with 0 = a8 and 63 = h1, as in engine.js. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, HemisphereLight, DirectionalLight, AmbientLight,
  Mesh, Group, BoxGeometry, PlaneGeometry, CircleGeometry, RingGeometry, SphereGeometry, CylinderGeometry,
  LatheGeometry, ExtrudeGeometry, Shape, Vector2, Vector3, MeshStandardMaterial, MeshBasicMaterial,
  CanvasTexture, SRGBColorSpace, PCFSoftShadowMap, Raycaster, ACESFilmicToneMapping,
} from "three";

const FILES = "abcdefgh";
const sqX = (sq) => (sq & 7) - 3.5;
const sqZ = (sq) => (sq >> 3) - 3.5; // rank 8 at -z, rank 1 at +z (white sits at +z)

// ---------- piece models ----------
const LATHE = {
  p: [[0,0],[.32,0],[.32,.05],[.27,.09],[.23,.11],[.15,.16],[.11,.32],[.17,.34],[.17,.37],[.09,.39],[0,.39]],
  r: [[0,0],[.34,0],[.34,.06],[.29,.1],[.25,.12],[.21,.18],[.19,.5],[.25,.53],[.25,.66],[0,.66]],
  b: [[0,0],[.33,0],[.33,.06],[.28,.1],[.24,.12],[.16,.2],[.11,.45],[.18,.47],[.18,.5],[.1,.52],[.15,.58],[.17,.66],[.14,.75],[.08,.82],[.03,.85],[0,.85]],
  q: [[0,0],[.35,0],[.35,.06],[.3,.1],[.26,.12],[.17,.22],[.12,.6],[.2,.63],[.2,.66],[.12,.68],[.15,.8],[.21,.9],[.18,.92],[.1,.88],[0,.88]],
  k: [[0,0],[.35,0],[.35,.06],[.3,.1],[.26,.12],[.17,.22],[.12,.62],[.2,.65],[.2,.68],[.12,.7],[.15,.82],[.2,.92],[.1,.96],[0,.96]],
  n: [[0,0],[.33,0],[.33,.06],[.28,.1],[.25,.13],[0,.13]],
};
const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }
function lathe(t) { return geo("l" + t, () => new LatheGeometry(LATHE[t].map(([x, y]) => new Vector2(x, y)), 40)); }
function knightGeo() {
  return geo("knight", () => {
    // Same silhouette as the 2D knight (100×100 SVG units, y down) scaled to board units.
    const k = 0.011, X = (x) => (x - 51) * k, Y = (y) => (77 - y) * k;
    const s = new Shape();
    s.moveTo(X(33), Y(77));
    s.bezierCurveTo(X(33), Y(66), X(37), Y(59), X(44), Y(53));
    s.bezierCurveTo(X(38), Y(54), X(33), Y(54), X(29), Y(50));
    s.bezierCurveTo(X(25), Y(46), X(26), Y(41), X(30), Y(38));
    s.lineTo(X(47), Y(23));
    s.bezierCurveTo(X(47), Y(19), X(46), Y(15), X(48), Y(11));
    s.lineTo(X(55), Y(18));
    s.bezierCurveTo(X(68), Y(21), X(75), Y(33), X(73), Y(50));
    s.bezierCurveTo(X(72), Y(60), X(69), Y(68), X(69), Y(77));
    s.lineTo(X(33), Y(77));
    const g = new ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 18 });
    g.translate(0, 0.12, -0.13);
    return g;
  });
}
const MAT = {
  w: new MeshStandardMaterial({ color: 0xf1ead9, roughness: 0.42, metalness: 0.04 }),
  b: new MeshStandardMaterial({ color: 0x27323d, roughness: 0.38, metalness: 0.08 }),
};
// Loser's pieces fade to these at the end of a game; winner's pieces briefly glow gold.
const DIM_TO = { w: new Color(0x8c877d), b: new Color(0x151b21) };
const DIM = { w: MAT.w.clone(), b: MAT.b.clone() };
DIM.w.color.copy(DIM_TO.w); DIM.b.color.copy(DIM_TO.b);
const GLOW = { w: MAT.w.clone(), b: MAT.b.clone() };
for (const c of ["w", "b"]) { GLOW[c].emissive.setHex(0xe9b949); GLOW[c].emissiveIntensity = 0; }
function paint(g, mat) { g.traverse((o) => { if (o.isMesh) o.material = mat; }); }
const colorOf = (p) => (p === p.toUpperCase() ? "w" : "b");
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k * k;
function bounce(k) { // ease-out bounce
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}
function makePiece(p) {
  const t = p.toLowerCase(), c = p === t ? "b" : "w", m = MAT[c], g = new Group();
  const add = (geometry, x = 0, y = 0, z = 0) => { const me = new Mesh(geometry, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; };
  add(lathe(t));
  if (t === "p") add(geo("ph", () => new SphereGeometry(0.135, 28, 18)), 0, 0.5, 0);
  if (t === "r") for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, me = add(geo("rm", () => new BoxGeometry(0.1, 0.1, 0.09)), Math.cos(a) * 0.19, 0.71, Math.sin(a) * 0.19);
    me.rotation.y = -a;
  }
  if (t === "b") add(geo("bb", () => new SphereGeometry(0.055, 18, 12)), 0, 0.89, 0);
  if (t === "q") {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(geo("qb", () => new SphereGeometry(0.04, 14, 10)), Math.cos(a) * 0.19, 0.93, Math.sin(a) * 0.19); }
    add(geo("qt", () => new SphereGeometry(0.07, 18, 12)), 0, 0.93, 0);
  }
  if (t === "k") {
    add(geo("kv", () => new BoxGeometry(0.06, 0.24, 0.06)), 0, 1.07, 0);
    add(geo("kh", () => new BoxGeometry(0.18, 0.06, 0.06)), 0, 1.09, 0);
  }
  if (t === "n") add(knightGeo()); // turned to face the centre in update()
  g.userData.piece = p;
  return g;
}

// ---------- board texture (squares, frame, coordinates) ----------
function boardTexture(light, dark, frame, label, flip) {
  const px = 128, m = 40, size = px * 8 + m * 2;
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const x = cv.getContext("2d");
  x.fillStyle = frame; x.fillRect(0, 0, size, size);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { x.fillStyle = (r + c) % 2 ? dark : light; x.fillRect(m + c * px, m + r * px, px, px); }
  x.fillStyle = label; x.font = "700 24px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  // Labels read upright for whoever sits at the bottom (flip = Black's side).
  const txt = (t, lx, ly) => { x.save(); x.translate(lx, ly); if (flip) x.rotate(Math.PI); x.fillText(t, 0, 0); x.restore(); };
  for (let i = 0; i < 8; i++) {
    txt(FILES[i], m + i * px + px / 2, size - m / 2); txt(FILES[i], m + i * px + px / 2, m / 2);
    txt(String(8 - i), m / 2, m + i * px + px / 2); txt(String(8 - i), size - m / 2, m + i * px + px / 2);
  }
  const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  return { tex, extent: (size / px) };
}

export function createBoard3D(container, handlers = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;border-radius:14px";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  scene.add(new HemisphereLight(0xffffff, 0x3a4a55, 1.1));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 9, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Board
  const { tex, extent } = boardTexture("#e9e3d0", "#5f8c80", "#2b4252", "#c9d6de", false);
  const texB = boardTexture("#e9e3d0", "#5f8c80", "#2b4252", "#c9d6de", true).tex;
  const slab = new Mesh(new BoxGeometry(extent, 0.35, extent), [
    new MeshStandardMaterial({ color: 0x223644, roughness: 0.6 }), new MeshStandardMaterial({ color: 0x223644, roughness: 0.6 }),
    new MeshStandardMaterial({ map: tex, roughness: 0.55 }), new MeshStandardMaterial({ color: 0x223644 }),
    new MeshStandardMaterial({ color: 0x223644, roughness: 0.6 }), new MeshStandardMaterial({ color: 0x223644, roughness: 0.6 }),
  ]);
  slab.position.y = -0.175; slab.receiveShadow = true;
  scene.add(slab);

  // Per-square overlays and move markers
  const overlays = [], dots = [], rings = [];
  const ovGeo = new PlaneGeometry(1, 1), dotGeo = new CircleGeometry(0.16, 32), ringGeo = new RingGeometry(0.38, 0.47, 40);
  for (let sq = 0; sq < 64; sq++) {
    const o = new Mesh(ovGeo, new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    o.rotation.x = -Math.PI / 2; o.position.set(sqX(sq), 0.004, sqZ(sq)); o.visible = false; scene.add(o); overlays.push(o);
    const d = new Mesh(dotGeo, new MeshBasicMaterial({ color: 0x0a1e28, transparent: true, opacity: 0.35, depthWrite: false }));
    d.rotation.x = -Math.PI / 2; d.position.set(sqX(sq), 0.008, sqZ(sq)); d.visible = false; scene.add(d); dots.push(d);
    const r = new Mesh(ringGeo, d.material);
    r.rotation.x = -Math.PI / 2; r.position.set(sqX(sq), 0.008, sqZ(sq)); r.visible = false; scene.add(r); rings.push(r);
  }
  const pieces = new Group(); scene.add(pieces);

  // ---------- camera orbit ----------
  const cam = { az: 0, azTarget: 0, polar: 0.86, dist: 12.5, user: 0, k: 0, shake: 0 };
  function placeCamera() {
    const az = cam.az + cam.user;
    camera.position.set(Math.sin(az) * Math.sin(cam.polar) * cam.dist + Math.cos(az) * cam.shake, Math.cos(cam.polar) * cam.dist, Math.cos(az) * Math.sin(cam.polar) * cam.dist - Math.sin(az) * cam.shake);
    camera.lookAt(Math.sin(az) * cam.k, -0.3, Math.cos(az) * cam.k); // aim slightly toward the viewer to centre the board
  }

  // ---------- render loop (only runs while something moves) ----------
  const tweens = [];
  let dirty = true, raf = 0, disposed = false;
  function kick() { dirty = true; if (!raf && !disposed) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    let busy = false;
    if (Math.abs(cam.az - cam.azTarget) > 0.001) { cam.az += (cam.azTarget - cam.az) * 0.12; busy = true; } else cam.az = cam.azTarget;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.start == null) tw.start = t;
      const el = t - tw.start - (tw.delay || 0);
      if (el < 0) { busy = true; continue; }
      const k = Math.min(1, el / tw.dur);
      tw.step(tw.ease ? tw.ease(k) : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, k);
      if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); } else busy = true;
    }
    placeCamera();
    renderer.render(scene, camera);
    dirty = false;
    if (busy) kick();
  }

  // Move the camera back until all four corners of the board are on screen (any aspect ratio).
  function fit() {
    const h = extent / 2, corners = [[-h, -h], [h, -h], [-h, h], [h, h]], v = new Vector3();
    const proj = () => { placeCamera(); camera.updateMatrixWorld(); return corners.map(([x, z]) => v.set(x, 0, z).project(camera).clone()); };
    for (let pass = 0; pass < 4; pass++) {
      for (let d = 7; d < 40; d += 0.2) { cam.dist = d; if (proj().every((p) => Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.86)) break; }
      const ys = proj().map((p) => p.y), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      cam.k = Math.max(-2, Math.min(3, cam.k - mid * 2.5));
    }
    maxDist = cam.dist * 1.6;
  }
  let maxDist = 22;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit(); kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  // ---------- input: drag to orbit, tap to pick a square ----------
  const ray = new Raycaster(), ndc = new Vector2();
  let ptr = null, interactive = false;
  const el = renderer.domElement;
  const pinch = new Map();
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    ptr = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  });
  el.addEventListener("pointermove", (e) => {
    if (!ptr) return;
    if (pinch.size === 2) {
      const prev = [...pinch.values()]; pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const cur = [...pinch.values()];
      const d0 = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y), d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
      if (d0 > 0) cam.dist = Math.max(7.5, Math.min(maxDist, cam.dist * d0 / d1));
      ptr.moved = true; kick(); return;
    }
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) < 7) return;
    ptr.moved = true;
    cam.user -= dx * 0.008;
    cam.polar = Math.max(0.15, Math.min(1.2, cam.polar - dy * 0.006));
    ptr.x = e.clientX; ptr.y = e.clientY; kick();
  });
  const end = (e) => {
    pinch.delete(e.pointerId);
    if (!ptr) return;
    const p = ptr; if (!pinch.size) ptr = null;
    if (p.moved || e.type === "pointercancel" || !interactive) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // Report both the piece under the finger and the board square under it: a tall piece in front can
    // cover part of the square behind it, so the app decides which one the player meant.
    let pieceSq = -1, boardSq = -1;
    for (const hit of ray.intersectObjects(pieces.children, true)) { // pieces still flying in don't count
      let o = hit.object; while (o && o.userData.sq == null) o = o.parent;
      if (o && !o.userData.tweening) { pieceSq = o.userData.sq; break; }
    }
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (t > 0) {
      const x = ray.ray.origin.x + ray.ray.direction.x * t, z = ray.ray.origin.z + ray.ray.direction.z * t;
      const c = Math.floor(x + 4), rr = Math.floor(z + 4);
      if (c >= 0 && c < 8 && rr >= 0 && rr < 8) boardSq = rr * 8 + c;
    }
    if ((pieceSq >= 0 || boardSq >= 0) && handlers.onSquare) handlers.onSquare(pieceSq >= 0 ? pieceSq : boardSq, boardSq);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist = Math.max(7.5, Math.min(maxDist, cam.dist * (1 + e.deltaY * 0.001))); kick(); }, { passive: false });

  // ---------- update from game state ----------
  let lastBottom = null, lastKey = "", bySq = {};
  function update(v) {
    interactive = !!v.interactive;
    // Camera faces from the bottom player's side; spin smoothly when that changes.
    const want = v.bottom === "b" ? Math.PI : 0;
    if (lastBottom === null) { cam.az = cam.azTarget = want; }
    else if (v.bottom !== lastBottom) { cam.azTarget = want; cam.user = 0; }
    if (v.bottom !== lastBottom) { slab.material[2].map = v.bottom === "b" ? texB : tex; slab.material[2].needsUpdate = true; }
    lastBottom = v.bottom;

    // overlays
    const color = new Array(64).fill(null);
    if (v.last) { color[v.last.from] = [0xf0c446, 0.45]; color[v.last.to] = [0xf0c446, 0.45]; }
    for (const s of v.hint || []) color[s] = [0x78aaff, 0.6];
    if (v.sel >= 0) color[v.sel] = [0x3cc6a0, 0.6];
    if (v.check >= 0) color[v.check] = [0xff3c32, 0.75];
    overlays.forEach((o, i) => { const c = color[i]; o.visible = !!c; if (c) { o.material.color.setHex(c[0]); o.material.opacity = c[1]; } });
    dots.forEach((d) => (d.visible = false)); rings.forEach((r) => (r.visible = false));
    for (const t of v.targets || []) (t.cap ? rings : dots)[t.to].visible = true;

    const reduced = !!v.reduced, fx = reduced ? null : v.fx, a = reduced ? null : v.anim;
    const over = v.over && v.over.loser ? v.over : null;
    const lift = (g, y) => { // smooth pick-up / put-down of the selected piece
      if (g.userData.tweening || Math.abs(g.position.y - y) < 0.001) return;
      if (reduced) { g.position.y = y; return; }
      const y0 = g.position.y; g.userData.tweening = true;
      tweens.push({ dur: 140, ease: easeOut, step: (e) => { g.position.y = y0 + (y - y0) * e; }, done: () => { g.userData.tweening = false; } });
    };

    // Same position and nothing new to show: only the selection changes (running animations keep going).
    const key = v.board.join(",") + "|" + (over ? over.loser + over.down : "");
    if (key === lastKey && !a && !fx) {
      for (const sq in bySq) lift(bySq[sq], +sq === v.sel ? 0.18 : 0);
      kick(); return;
    }
    lastKey = key;

    // Rebuild pieces from the board, then animate what changed.
    pieces.clear();
    bySq = {};
    const fallenSq = over && over.down ? v.board.indexOf(over.loser === "w" ? "K" : "k") : -1;
    const lieDown = (g) => { g.rotation.z = -1.38; g.position.x += 0.34; g.position.y = 0.13; };
    v.board.forEach((p, sq) => {
      if (!p) return;
      const g = makePiece(p); g.position.set(sqX(sq), 0, sqZ(sq)); g.userData.sq = sq;
      if (p === "n" || p === "N") g.children[1].rotation.y = sqX(sq) < 0 ? Math.PI : 0; // knights look toward the centre
      if (over && colorOf(p) === over.loser) paint(g, DIM[over.loser]);
      if (sq === fallenSq && !(fx && fx.type === "mate")) lieDown(g);
      if (sq === v.sel) g.position.y = 0.18;
      pieces.add(g); bySq[sq] = g;
    });
    if (over && !(fx && fx.type === "mate")) DIM[over.loser].color.copy(DIM_TO[over.loser]);

    // ----- the move -----
    if (a) {
      const land = (g) => tweens.push({ dur: 200, ease: (k) => k, step: (e, k) => {
        const s = Math.sin(Math.PI * k) * 0.1; g.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5); }, done: () => g.scale.set(1, 1, 1) });
      const slide = (g, from, to, hop, delay, after) => {
        const fx0 = sqX(from), fz0 = sqZ(from), tx = sqX(to), tz = sqZ(to);
        g.position.set(fx0, 0, fz0); g.userData.tweening = true;
        tweens.push({ dur: 300, delay, step: (e) => { g.position.set(fx0 + (tx - fx0) * e, Math.sin(Math.PI * e) * hop, fz0 + (tz - fz0) * e); },
          done: () => { g.userData.tweening = false; g.position.y = 0; (after || land)(g); } });
      };
      const knight = a.p && a.p.toLowerCase() === "n";
      const far = Math.hypot(sqX(a.from) - sqX(a.to), sqZ(a.from) - sqZ(a.to));
      const hop = knight ? 0.75 : Math.min(0.4, 0.12 + far * 0.04);
      const moved = bySq[a.to];
      if (moved && a.promo) {
        // Promotion: the pawn makes the trip, then becomes the new piece with a flash.
        moved.visible = false;
        const pawn = makePiece(colorOf(a.p) === "w" ? "P" : "p"); scene.add(pawn);
        slide(pawn, a.from, a.to, hop, 0, () => {
          scene.remove(pawn); moved.visible = true;
          const c = colorOf(a.p), mat = GLOW[c].clone(); paint(moved, mat);
          tweens.push({ dur: 650, ease: (k) => k, step: (e, k) => {
            const sc = k < 0.6 ? 0.3 + (k / 0.6) * 0.95 : 1.25 - ((k - 0.6) / 0.4) * 0.25; moved.scale.set(sc, sc, sc);
            mat.emissiveIntensity = 1.2 * (1 - k); }, done: () => { moved.scale.set(1, 1, 1); paint(moved, MAT[c]); } });
          const ring = new Mesh(new RingGeometry(0.3, 0.4, 48), new MeshBasicMaterial({ color: 0xe9b949, transparent: true, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.set(sqX(a.to), 0.02, sqZ(a.to)); scene.add(ring);
          tweens.push({ dur: 700, ease: easeOut, step: (e) => { const sc = 1 + e * 2.4; ring.scale.set(sc, sc, sc); ring.material.opacity = 1 - e; },
            done: () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } });
        });
      } else if (moved) slide(moved, a.from, a.to, hop, 0);
      // Castling: the rook follows the king.
      if (a.f === "k" && bySq[a.to - 1]) slide(bySq[a.to - 1], a.to + 1, a.to - 1, 0.45, 130);
      if (a.f === "q" && bySq[a.to + 1]) slide(bySq[a.to + 1], a.to - 2, a.to + 1, 0.45, 130);
      if (a.cap) {
        // Captured piece is knocked over in the direction of travel, then slides off the capturer's edge.
        const capSq = a.f === "e" ? a.to + (a.cap === "p" ? 8 : -8) : a.to;
        const g = makePiece(a.cap), sx = sqX(capSq), sz = sqZ(capSq); g.position.set(sx, 0, sz); scene.add(g);
        let dx = sqX(a.to) - sqX(a.from), dz = sqZ(a.to) - sqZ(a.from); const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
        // Off the nearest side edge, drifting toward the capturer's half.
        const ex = (sx === 0 ? (dx || 1) : Math.sign(sx)) * 5.6, ez = sz * 0.4 + (colorOf(a.p) === "w" ? 1.8 : -1.8);
        tweens.push({ dur: 900, delay: 140, ease: (k) => k, step: (e, k) => {
          const tip = Math.min(1, k / 0.3), ang = easeOut(tip) * 1.45;
          g.rotation.set(dz * ang, 0, -dx * ang);
          const m = Math.max(0, (k - 0.25) / 0.75), mm = easeIn(m);
          g.position.set(sx + (ex - sx) * mm + dx * 0.3 * tip, 0.08 * tip + Math.sin(Math.PI * m) * 0.5, sz + (ez - sz) * mm + dz * 0.3 * tip);
          const sc = 1 - m * m * 0.9; g.scale.set(sc, sc, sc);
        }, done: () => scene.remove(g) });
      }
    }

    // ----- game moments -----
    const king = (c) => bySq[v.board.indexOf(c === "w" ? "K" : "k")];
    if (fx && fx.type === "intro") {
      // Pieces drop onto the board rank by rank, far side first.
      for (const sq in bySq) {
        const g = bySq[sq], row = v.bottom === "w" ? sq >> 3 : 7 - (sq >> 3), col = v.bottom === "w" ? sq & 7 : 7 - (sq & 7);
        g.position.y = 5; g.userData.tweening = true;
        tweens.push({ dur: 520, delay: row * 70 + col * 12, ease: bounce, step: (e) => { g.position.y = 5 * (1 - e); }, done: () => { g.userData.tweening = false; g.position.y = 0; } });
      }
    }
    if (fx && fx.type === "check" && v.check >= 0) {
      const o = overlays[v.check], k = bySq[v.check];
      tweens.push({ dur: 1300, ease: (q) => q, step: (e, q) => { o.material.opacity = 0.45 + 0.45 * Math.abs(Math.sin(q * Math.PI * 4)); }, done: () => { o.material.opacity = 0.75; } });
      if (k) tweens.push({ dur: 600, delay: 250, ease: (q) => q, step: (e, q) => { k.rotation.z = Math.sin(q * Math.PI * 4) * 0.14 * (1 - q); }, done: () => { k.rotation.z = 0; } });
      tweens.push({ dur: 420, delay: 250, ease: (q) => q, step: (e, q) => { cam.shake = Math.sin(q * 38) * 0.14 * (1 - q); }, done: () => { cam.shake = 0; } });
    }
    if (fx && fx.type === "mate" && over) {
      const k = bySq[fallenSq], lc = over.loser, wc = lc === "w" ? "b" : "w";
      if (k) {
        const x0 = k.position.x;
        tweens.push({ dur: 1100, delay: 300, ease: (q) => q, step: (e, q) => {
          // Rock back a touch, then topple over and bounce to rest.
          if (q < 0.25) { k.rotation.z = 0.18 * Math.sin((q / 0.25) * Math.PI / 2); return; }
          const b = bounce((q - 0.25) / 0.75);
          k.rotation.z = 0.18 + (-1.38 - 0.18) * b; k.position.x = x0 + 0.34 * b; k.position.y = 0.13 * b;
        }, done: () => { k.rotation.z = -1.38; k.position.x = x0 + 0.34; k.position.y = 0.13; } });
      }
      // Loser fades, winner glows.
      const from = MAT[lc].color.clone();
      tweens.push({ dur: 900, delay: 400, step: (e) => { DIM[lc].color.lerpColors(from, DIM_TO[lc], e); } });
      DIM[lc].color.copy(from);
      const winners = Object.values(bySq).filter((g) => colorOf(g.userData.piece) === wc);
      winners.forEach((g) => paint(g, GLOW[wc]));
      tweens.push({ dur: 1600, delay: 500, ease: (q) => q, step: (e, q) => { GLOW[wc].emissiveIntensity = 0.22 * Math.sin(Math.PI * q); },
        done: () => { GLOW[wc].emissiveIntensity = 0; winners.forEach((g) => paint(g, MAT[wc])); } });
    }
    if (fx && fx.type === "draw") {
      for (const c of ["w", "b"]) { const k = king(c); if (k) tweens.push({ dur: 1100, delay: 200, ease: (q) => q, step: (e, q) => { k.rotation.x = Math.sin(q * Math.PI * 4) * 0.2 * (1 - q); }, done: () => { k.rotation.x = 0; } }); }
    }
    kick();
  }

  function dispose() {
    disposed = true; cancelAnimationFrame(raf); ro.disconnect();
    renderer.dispose(); el.remove();
  }
  // Screen position of a square's centre (used by tests and could drive tooltips).
  function project(sq, y = 0) {
    placeCamera(); camera.updateMatrixWorld();
    const v = new Vector3(sqX(sq), y, sqZ(sq)).project(camera), r = el.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  resize();
  return { update, resize, dispose, project };
}
