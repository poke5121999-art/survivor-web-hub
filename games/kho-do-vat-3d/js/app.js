import * as THREE from '../vendor/three.module.min.js';
import { PROPS, propInfo } from '../props/registry-safe.js';
import { setGeoQuality } from '../lib/geo.js';
import { sharedMaterials } from '../lib/prop.js';
import { tickFire } from '../lib/fire.js';
function updateProps(groups, dt, t) { tickFire(t); for (const g of groups) g.userData.update?.(dt, t); }

const SHEETS = {
  props:    { img: 'ref/owner-props-sheet.webp', w: 1461, h: 829, elev: 34, fov: 24, dist: 30 },
  // vehicles: every cell has its own perspective camera (the sheet is 6 separate renders, low 3/4 view)
  vehicles: { img: 'ref/owner-vehicles-sheet.webp', w: 1378, h: 773, elev: 10, fov: 13, dist: 55, perCell: { elev: 10, fov: 30 } },
  workshop: { img: 'ref/owner-workshop-scene.webp', w: 1446, h: 848, elev: 34, fov: 24, dist: 30 },
  campfire: { img: 'ref/owner-campfire-scene.webp', w: 1437, h: 761, elev: 22, fov: 24, dist: 30 },
};
const SHEET_OF = { 'owner-props-sheet.webp': 'props', 'owner-vehicles-sheet.webp': 'vehicles', 'owner-workshop-scene.webp': 'workshop', 'owner-campfire-scene.webp': 'campfire' };
const params = new URLSearchParams(location.search);
const SHOOT = params.has('shoot');

// ---------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: SHOOT });
renderer.setPixelRatio(SHOOT ? 1 : Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c1d23');
const hemi = new THREE.HemisphereLight(0xedf0ff, 0x5a544d, 2.1); // big soft fill (the sheets read soft, low contrast)
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1e0, 2.1);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xd6e2ff, 0.7); fill.position.set(6, 6, 14); scene.add(fill);
const rim = new THREE.DirectionalLight(0xe4ecff, 1.1); rim.position.set(5, 7, -12); scene.add(rim); // back rim: separates soft forms from the dark bg
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.42 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 500);

// ---------- tiny orbit controller
const orbit = { target: new THREE.Vector3(), r: 20, theta: 0, phi: 1, enabled: true };
function applyOrbit() {
  const s = Math.sin(orbit.phi);
  camera.position.set(orbit.target.x + orbit.r * s * Math.sin(orbit.theta), orbit.target.y + orbit.r * Math.cos(orbit.phi), orbit.target.z + orbit.r * s * Math.cos(orbit.theta));
  camera.lookAt(orbit.target);
}
{
  const el = renderer.domElement, ptrs = new Map(); let last = null, pinch = 0, moved = 0;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); last = { x: e.clientX, y: e.clientY }; moved = 0; });
  el.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) orbit.r = THREE.MathUtils.clamp(orbit.r * pinch / d, 0.3, 200); pinch = d; pan(dx * 0.5, dy * 0.5);
    } else if (p.b === 2 || e.shiftKey) pan(dx, dy);
    else { orbit.theta -= dx * 0.006; orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.005, 0.08, 1.5); }
    applyOrbit();
  });
  const up = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if (p && moved < 6 && ptrs.size === 0) pick(e.clientX, e.clientY); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); orbit.r = THREE.MathUtils.clamp(orbit.r * Math.exp(e.deltaY * 0.001), 0.3, 200); applyOrbit(); }, { passive: false });
  function pan(dx, dy) {
    const k = orbit.r * 0.0016, right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize(); right.y = 0; right.normalize();
    orbit.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
  }
}

// ---------- data
let BOXES = [];
const layoutGroup = new THREE.Group(); scene.add(layoutGroup);
const inspectGroup = new THREE.Group(); scene.add(inspectGroup);
let live = []; // props needing update
let quality = params.get('q') === 'low' ? 0 : 1;
let sheetName = params.get('sheet') || 'props';
let savedView = null;

function sheetCam(sh, aspect) {
  const c = new THREE.PerspectiveCamera(sh.fov, aspect ?? sh.w / sh.h, 0.05, 500);
  const e = THREE.MathUtils.degToRad(sh.elev);
  c.position.set(0, Math.sin(e) * sh.dist, Math.cos(e) * sh.dist); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return c;
}
function groundAt(cam, sh, px, py) {
  const ndc = new THREE.Vector2((px / sh.w) * 2 - 1, 1 - (py / sh.h) * 2);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
  const t = -ray.ray.origin.y / ray.ray.direction.y;
  return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
}
function projBox(cam, sh, obj) { // projected bounds of the actual mesh vertices (not the AABB)
  obj.updateMatrixWorld(true);
  const v = new THREE.Vector3(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  obj.traverse((m) => {
    if (!m.isMesh || !m.visible || m.material?.transparent && m.renderOrder === 2) return;
    const p = m.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 1500));
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(cam);
      const px = (v.x + 1) / 2 * sh.w, py = (1 - v.y) / 2 * sh.h;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
  });
  return [x0, y0, x1, y1];
}
// Place obj so its projected bbox fills `box` (sheet pixels).
function fitToBox(cam, sh, obj, box) {
  const [bx0, by0, bx1, by1] = box, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  obj.position.copy(groundAt(cam, sh, cx, by1 - (by1 - by0) * 0.18));
  for (let it = 0; it < 5; it++) {
    const [x0, y0, x1, y1] = projBox(cam, sh, obj);
    const k = Math.min((bx1 - bx0) / Math.max(1, x1 - x0), (by1 - by0) / Math.max(1, y1 - y0));
    obj.scale.multiplyScalar(THREE.MathUtils.clamp(k, 0.3, 3));
    const [a0, b0, a1, b1] = projBox(cam, sh, obj);
    const g0 = groundAt(cam, sh, (a0 + a1) / 2, (b0 + b1) / 2), g1 = groundAt(cam, sh, cx, cy);
    obj.position.add(g1.sub(g0).setY(0));
  }
}

function clearGroup(g) {
  for (const c of [...g.children]) { g.remove(c); c.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
}
function build(info, seed, opts) {
  let g;
  try { g = info.build(seed, { quality, ...opts }); }
  catch (e) { console.error(`build ${info.id} failed: ${e.stack || e.message}`); g = new THREE.Group(); g.userData = { prop: info.id, tris: 0, draws: 0 }; }
  g.userData.info = info;
  live.push(g);
  return g;
}

function layoutSheet(name) {
  sheetName = name; clearGroup(layoutGroup); clearGroup(inspectGroup); live = [];
  document.querySelectorAll('[data-sheet]').forEach((b) => b.classList.toggle('on', b.dataset.sheet === name));
  cellMode = false;
  if (name === 'variants') return layoutVariants();
  const sh = SHEETS[name], cam = sheetCam(sh);
  const cells = BOXES.filter((c) => SHEET_OF[c.sheet] === name);
  cellMode = !!sh.perCell;
  const missing = [];
  for (const c of cells) {
    const info = propInfo(c.prop);
    if (!info) { missing.push(c.prop); continue; }
    const v = (c.variant ?? info.sheetVariant) ?? null;
    const cfg = v != null && info.variants?.[v] ? info.variants[v] : { seed: 1, opts: {} };
    const g = build(info, cfg.seed, { ...cfg.opts, ...(info.sheetOpts || {}), ...(c.opts || {}) });
    let yaw = info.yaw ?? 0.3;
    if (c.view === 'back') yaw = info.backYaw ?? yaw + Math.PI;
    if (c.yaw !== undefined) yaw = c.yaw;
    if (name === 'workshop' || name === 'campfire') yaw += info.sceneYaw ?? 0;
    g.rotation.y = yaw;
    layoutGroup.add(g);
    if (sh.perCell) { g.position.x = layoutGroup.children.length * 40; g.userData.box = c.box; g.userData.cam = cellCam(g, sh, c.box); }
    else fitToBox(cam, sh, g, c.box);
    g.userData.cell = c.cell;
  }
  if (missing.length) console.info('chưa có prop:', missing.join(', '));
  frameSheet();
  fitShadow(layoutGroup);
}
// Camera of its own for one cell: perspective at (elev, fov), framed so the prop fills its box.
function cellCam(obj, sh, box) {
  const pc = sh.perCell, bw = box[2] - box[0], bh = box[3] - box[1];
  const c = new THREE.PerspectiveCamera(pc.fov, bw / bh, 0.05, 500);
  const b = new THREE.Box3().setFromObject(obj, true), tgt = b.getCenter(new THREE.Vector3());
  const e = THREE.MathUtils.degToRad(pc.elev), dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
  let dist = b.getSize(new THREE.Vector3()).length() / (2 * Math.tan(THREE.MathUtils.degToRad(pc.fov / 2)));
  const v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  for (let it = 0; it < 8; it++) {
    c.position.copy(tgt).addScaledVector(dir, dist); c.lookAt(tgt); c.updateMatrixWorld(); c.updateProjectionMatrix();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    obj.traverse((m) => {
      if (!m.isMesh || !m.visible) return;
      const p = m.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 3000));
      for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(c); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    });
    const k = Math.min(2 / (x1 - x0), 2 / (y1 - y0)) * 0.97;
    const hh = dist * Math.tan(THREE.MathUtils.degToRad(pc.fov / 2)), hw = hh * c.aspect;
    right.setFromMatrixColumn(c.matrixWorld, 0); up.setFromMatrixColumn(c.matrixWorld, 1);
    tgt.addScaledVector(right, ((x0 + x1) / 2) * hw).addScaledVector(up, ((y0 + y1) / 2) * hh);
    dist /= Math.pow(k, 0.9);
  }
  c.position.copy(tgt).addScaledVector(dir, dist); c.lookAt(tgt); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return c;
}
let cellMode = false;
function sheetRect(box) { // sheet-pixel box -> canvas rect (contain-fit, same as the reference overlay)
  const sh = SHEETS[sheetName], w = innerWidth, h = innerHeight, s = Math.min(w / sh.w, h / sh.h);
  const ox = (w - sh.w * s) / 2, oy = (h - sh.h * s) / 2;
  return { x: ox + box[0] * s, y: oy + box[1] * s, w: (box[2] - box[0]) * s, h: (box[3] - box[1]) * s };
}
function renderCells() {
  const w = innerWidth, h = innerHeight, all = layoutGroup.children;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h); renderer.clear();
  renderer.setScissorTest(true);
  for (const g of all) {
    const r = sheetRect(g.userData.box), y = h - r.y - r.h;
    for (const o of all) o.visible = o === g && g.userData.hidden !== true;
    fitShadow(g);
    renderer.setViewport(r.x, y, r.w, r.h); renderer.setScissor(r.x, y, r.w, r.h);
    renderer.render(scene, g.userData.cam);
  }
  for (const o of all) o.visible = o.userData.hidden !== true;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
}
function layoutVariants() {
  let x = 0, z = 0, rowH = 0; const maxW = 16;
  for (const info of PROPS) {
    const vars = info.variants?.length ? info.variants : [{ seed: 1, opts: {} }];
    for (const v of vars) {
      const g = build(info, v.seed, v.opts); g.rotation.y = info.yaw ?? 0.3;
      const b = new THREE.Box3().setFromObject(g, true), s = b.getSize(new THREE.Vector3());
      const w = Math.max(s.x, s.z) + 0.5;
      if (x + w > maxW) { x = 0; z += rowH + 0.5; rowH = 0; }
      g.position.set(x + w / 2 - maxW / 2, 0, z); x += w; rowH = Math.max(rowH, Math.max(s.z, s.x));
      layoutGroup.add(g);
    }
  }
  orbit.target.set(0, 0, z / 2); orbit.r = Math.max(18, z * 1.3); orbit.theta = 0; orbit.phi = 0.9; applyOrbit();
  fitShadow(layoutGroup);
}
function frameSheet() {
  const sh = SHEETS[sheetName];
  const e = THREE.MathUtils.degToRad(sh.elev);
  orbit.target.set(0, 0, 0); orbit.r = sh.dist; orbit.theta = 0; orbit.phi = Math.PI / 2 - e; applyOrbit();
  resize();
}
function fitShadow(group) {
  const b = new THREE.Box3().setFromObject(group, true); if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2 + 1;
  key.position.copy(c).add(new THREE.Vector3(-0.5, 1, 0.85).normalize().multiplyScalar(r * 2));
  key.target.position.copy(c);
  const sc = key.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.1; sc.far = r * 4; sc.updateProjectionMatrix();
}

// ---------- inspect
const side = document.getElementById('side');
let cur = null;
function pick(x, y) {
  if (!layoutGroup.visible) return;
  if (cellMode) {
    for (const g of layoutGroup.children) { const r = sheetRect(g.userData.box); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return inspect(g.userData.info, g.userData.seed ?? 1, g.userData.cell); }
    return;
  }
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2), camera);
  const hit = ray.intersectObjects(layoutGroup.children, true)[0];
  if (!hit) return;
  let o = hit.object; while (o && !o.userData.info) o = o.parent;
  if (o) inspect(o.userData.info, o.userData.seed ?? 1, o.userData.cell);
}
function inspect(info, seed = 1, cell = null, opts = {}) {
  savedView = savedView || { ...orbit, target: orbit.target.clone() };
  layoutGroup.visible = false; clearGroup(inspectGroup);
  live = live.filter((g) => g.parent === layoutGroup);
  cur = { info, seed, opts: { wear: 0.6, ...opts }, cell };
  rebuildInspect(true);
  side.classList.add('show'); resize();
  document.getElementById('pname').textContent = `${info.name} — ${info.id}`;
  document.getElementById('pseed').value = seed; document.getElementById('pseedv').textContent = seed;
  const vrow = document.getElementById('pvars'); vrow.innerHTML = '';
  (info.variants || []).forEach((v) => { const b = document.createElement('button'); b.textContent = v.label; b.onclick = () => { cur.seed = v.seed; cur.opts = { wear: 0.6, ...v.opts }; document.getElementById('pwear').value = cur.opts.wear; rebuildInspect(false); }; vrow.appendChild(b); });
  const c = cell || BOXES.find((b) => b.prop === info.id)?.cell;
  const img = document.getElementById('pref'); if (c) { img.src = `ref/cells/${c}.png`; img.style.display = ''; } else img.style.display = 'none';
}
function rebuildInspect(reframe) {
  clearGroup(inspectGroup); live = [];
  const g = build(cur.info, cur.seed, cur.opts); inspectGroup.add(g); g.rotation.y = cur.info.yaw ?? 0.3;
  const b = new THREE.Box3().setFromObject(g, true), r = b.getSize(new THREE.Vector3()).length() / 2;
  if (reframe) { orbit.target.copy(b.getCenter(new THREE.Vector3())); orbit.r = r * 3.2 + 0.3; orbit.phi = 1.05; orbit.theta = 0.35; applyOrbit(); }
  fitShadow(inspectGroup);
  document.getElementById('pmeta').textContent = `${g.userData.tris} tam giác · ${g.userData.draws} draw · ${(b.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2)).join(' × '))} m`;
  const pp = document.getElementById('pparams'); pp.innerHTML = '';
  for (const [k, v] of Object.entries(g.userData.params || {})) {
    const l = document.createElement('label'); l.innerHTML = `<span>${k}</span>`;
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = v.range[0]; inp.max = v.range[1]; inp.step = (v.range[1] - v.range[0]) / 100; inp.value = v.value;
    inp.oninput = () => { g.userData.set(k, +inp.value); cur.opts[k] = +inp.value; };
    l.appendChild(inp); pp.appendChild(l);
  }
}
document.getElementById('pseed').oninput = (e) => { cur.seed = +e.target.value; document.getElementById('pseedv').textContent = cur.seed; rebuildInspect(false); };
document.getElementById('pwear').oninput = (e) => { cur.opts.wear = +e.target.value; rebuildInspect(false); };
document.getElementById('back').onclick = () => {
  side.classList.remove('show'); clearGroup(inspectGroup); layoutGroup.visible = true; cur = null; resize();
  live = []; layoutGroup.children.forEach((g) => live.push(g));
  if (savedView) { Object.assign(orbit, savedView); orbit.target = savedView.target; savedView = null; applyOrbit(); }
  fitShadow(layoutGroup);
};

// ---------- UI
document.querySelectorAll('[data-sheet]').forEach((b) => b.onclick = () => { side.classList.remove('show'); layoutGroup.visible = true; savedView = null; cur = null; layoutSheet(b.dataset.sheet); });
const qBtn = document.getElementById('q');
function applyQuality() {
  setGeoQuality(quality); sharedMaterials(quality);
  renderer.shadowMap.enabled = quality > 0; key.castShadow = quality > 0;
  renderer.setPixelRatio(SHOOT ? 1 : (quality > 0 ? Math.min(2, devicePixelRatio) : 1));
  qBtn.textContent = 'Chất lượng: ' + (quality ? 'Cao' : 'Thấp');
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}
qBtn.onclick = () => { quality = 1 - quality; applyQuality(); if (cur) rebuildInspect(false); else layoutSheet(sheetName); resize(); };
let refImg = null;
document.getElementById('ref').onclick = (e) => {
  if (refImg) { refImg.remove(); refImg = null; e.target.classList.remove('on'); return; }
  if (sheetName === 'variants') return;
  refImg = document.createElement('img'); refImg.src = SHEETS[sheetName].img;
  Object.assign(refImg.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', objectFit: 'contain', opacity: 0.5, pointerEvents: 'none' });
  document.body.appendChild(refImg); e.target.classList.add('on');
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, !SHOOT ? true : false);
  camera.aspect = w / h;
  const sh = SHEETS[sheetName];
  if (sh && !cur) { // contain-fit the sheet frame (matches the reference overlay)
    const sa = sh.w / sh.h, ca = w / h;
    camera.fov = ca >= sa ? sh.fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(sh.fov / 2)) * sa / ca));
  } else camera.fov = 35;
  // phone inspect: the panel covers the lower half, so shift the view up
  if (cur && w <= 640) camera.setViewOffset(w, h, 0, h * 0.22, w, h); else camera.clearViewOffset();
  document.body.classList.toggle('inspecting', !!cur);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- loop
const stats = document.getElementById('stats');
const clock = new THREE.Clock(); let t = 0, fpsT = 0, frames = 0, fps = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  updateProps(live, dt, t);
  if (cellMode && layoutGroup.visible && !cur) renderCells(); else renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  const info = renderer.info.render;
  stats.textContent = `${live.length} đồ · ${info.triangles.toLocaleString()} tam giác · ${info.calls} draw · ${fps} fps`;
  requestAnimationFrame(frame);
}

// ---------- boot
const res = await fetch('ref/boxes.json'); BOXES = await res.json();
setGeoQuality(quality); applyQuality();
resize(); layoutSheet(sheetName);
frame();
// Playwright hooks
window.SP = {
  ready: true, PROPS, BOXES,
  async sheet(name) { layoutSheet(name); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return { count: layoutGroup.children.length, tris: renderer.info.render.triangles }; },
  isolate(cell) { layoutGroup.children.forEach((g) => { g.visible = cell == null || g.userData.cell === cell; g.userData.hidden = !g.visible; }); if (cellMode) renderCells(); else renderer.render(scene, camera); },
  cams() { return layoutGroup.children.map((g) => { const c = g.userData.cam; if (!c) return null; const d = new THREE.Vector3(); c.getWorldDirection(d); return { cell: g.userData.cell, pos: c.position.toArray().map((v) => +v.toFixed(2)), dir: d.toArray().map((v) => +v.toFixed(3)), fov: c.fov, aspect: +c.aspect.toFixed(2), gpos: g.position.toArray() }; }); },
  perProp() { return layoutGroup.children.map((g) => ({ id: g.userData.prop, cell: g.userData.cell, tris: g.userData.tris, draws: g.userData.draws })); },
  allProps() { const out = []; for (const info of PROPS) { const vars = info.variants?.length ? info.variants : [{ label: '-', seed: 1, opts: {} }]; for (const v of vars) { let g; try { g = info.build(v.seed, { quality, ...v.opts }); } catch (e) { out.push({ id: info.id, variant: v.label, error: String(e.message) }); continue; } out.push({ id: info.id, variant: v.label, tris: g.userData.tris, draws: g.userData.draws, params: Object.keys(g.userData.params || {}) }); g.traverse((o) => o.isMesh && o.geometry.dispose()); } } return out; },
  inspect(id, seed = 1, opts = {}) { inspect(propInfo(id), seed, null, opts); },
  view(theta, phi) { if (!isNaN(theta)) orbit.theta = theta; if (!isNaN(phi)) orbit.phi = phi; applyOrbit(); },
};
