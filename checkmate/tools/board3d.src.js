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
  const cam = { az: 0, azTarget: 0, polar: 0.86, dist: 12.5, user: 0, k: 0 };
  function placeCamera() {
    const az = cam.az + cam.user;
    camera.position.set(Math.sin(az) * Math.sin(cam.polar) * cam.dist, Math.cos(cam.polar) * cam.dist, Math.cos(az) * Math.sin(cam.polar) * cam.dist);
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
      const k = Math.min(1, (t - tw.start) / tw.dur);
      tw.step(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, k);
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
    const hit = ray.intersectObjects(pieces.children, true)[0];
    if (hit) { let o = hit.object; while (o && o.userData.sq == null) o = o.parent; if (o) pieceSq = o.userData.sq; }
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

    // Same position and nothing to animate: just lift the selected piece (keeps running tweens intact).
    const key = v.board.join(",");
    if (key === lastKey && !v.anim) {
      for (const sq in bySq) { const g = bySq[sq]; if (!g.userData.tweening) g.position.y = +sq === v.sel ? 0.12 : 0; }
      kick(); return;
    }
    lastKey = key;
    // pieces: rebuild from the board, then animate the move that produced it
    pieces.clear();
    bySq = {};
    v.board.forEach((p, sq) => {
      if (!p) return;
      const g = makePiece(p); g.position.set(sqX(sq), 0, sqZ(sq)); g.userData.sq = sq;
      if (p === "n" || p === "N") g.children[1].rotation.y = sqX(sq) < 0 ? Math.PI : 0; // knights look toward the centre
      if (sq === v.sel) g.position.y = 0.12;
      pieces.add(g); bySq[sq] = g;
    });
    const a = v.anim;
    if (a) {
      const slide = (from, to, hop) => {
        const g = bySq[to]; if (!g) return;
        const fx = sqX(from), fz = sqZ(from), tx = sqX(to), tz = sqZ(to);
        g.position.set(fx, 0, fz); g.userData.tweening = true;
        tweens.push({ dur: 300, step: (e) => { g.position.set(fx + (tx - fx) * e, Math.sin(Math.PI * e) * hop, fz + (tz - fz) * e); }, done: () => { g.userData.tweening = false; } });
      };
      const knight = a.p && a.p.toLowerCase() === "n";
      const far = Math.hypot(sqX(a.from) - sqX(a.to), sqZ(a.from) - sqZ(a.to));
      slide(a.from, a.to, knight ? 0.7 : Math.min(0.35, 0.08 + far * 0.04));
      if (a.f === "k") slide(a.to + 1, a.to - 1, 0.25);
      if (a.f === "q") slide(a.to - 2, a.to + 1, 0.25);
      if (a.cap) { // captured piece shrinks away
        const capSq = a.f === "e" ? a.to + (a.cap === "p" ? 8 : -8) : a.to;
        const g = makePiece(a.cap); g.position.set(sqX(capSq), 0, sqZ(capSq)); scene.add(g);
        tweens.push({ dur: 320, step: (e, k) => { const s = 1 - k; g.scale.set(s, s, s); }, done: () => scene.remove(g) });
      }
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
