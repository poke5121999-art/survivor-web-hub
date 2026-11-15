// Showcase: weapons hung on a painted concrete wall under Saltline's sun + sky light, or in a labelled grid.
// Click one to take it off the wall and orbit it up close. URL: ?q=low|high, ?view=grid, ?inspect=<id>,
// ?only=<id>&shot=1 (single weapon framed for screenshots; &yaw=deg &pitch=deg &rot=deg &dist=m), ?wet=1, ?variant=1.
import * as THREE from '../vendor/three.module.min.js';
import { Render } from './render.js';
import { Mats } from './mats.js';
import { setMats, REGISTRY } from './weapon.js';
import { planeUV } from './sl/mats-sl.js';

const P = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const $ = (id) => document.getElementById(id);
if (P.has('shot')) document.body.classList.add('shot');
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));

let qName = P.get('q') || (matchMedia('(max-width: 700px)').matches ? 'low' : 'high');
const R = new Render(canvas, qName);
const mats = new Mats(R.renderer, qName === 'low' ? 512 : 1024);
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 60);
const state = { view: P.get('view') || 'sheet', items: [], inspect: null, labels: true, socks: false, variant: +(P.get('variant') || 0) };

await mats.ready;
setMats(mats);
await import('../weapons/index.js');
$('boot').remove();

// ---------- wall ----------
const WALL_W = 11, WALL_H = 9;
const wallMat = mats.sl.get('concrete', { color: 0x8a919c });
const wall = new THREE.Mesh(planeUV(WALL_W * 1.6, WALL_H * 1.6), wallMat);
wall.receiveShadow = true; R.scene.add(wall);
const floor = new THREE.Mesh(planeUV(WALL_W, 4).rotateX(-Math.PI / 2), mats.sl.get('concrete'));
floor.receiveShadow = true; R.scene.add(floor);

// ---------- build ----------
const t0 = performance.now();
const only = P.get('only');
const list = only ? REGISTRY.filter((w) => w.id === only) : REGISTRY;
if (only && !list.length) throw new Error('weapon not found: ' + only);
for (const w of list) {
  const g = w.build(1, { variant: state.variant });
  const holder = new THREE.Group(); holder.add(g); R.scene.add(holder);
  state.items.push({ w, g, holder, meta: g.userData.weapon });
}
const buildMs = performance.now() - t0;
const totalTris = state.items.reduce((a, it) => a + it.meta.tris, 0);
console.log('[kit] built', state.items.length, 'weapons,', totalTris, 'tris in', buildMs.toFixed(0), 'ms');

// ---------- layout ----------
// sheet rows follow the owner's sheets: combat sheet rows 1-4 (row 4 = guns + the TR-9 port), tools sheet last
const ROWS = [[1, 16], [17, 32], [33, 51], [52, 59], [60, 73]];
function layout() {
  const items = state.items;
  if (only) {
    const it = items[0]; const b = it.meta.bounds, c = b.getCenter(new THREE.Vector3());
    it.holder.position.set(0, 0, 0); it.holder.rotation.set(0, 0, (+(P.get('rot') || 0)) * Math.PI / 180); it.holder.scale.setScalar(1);
    it.g.position.set(-c.x, -c.y + 1.2, -c.z + 0.5);
    placeWall(0.5 - Math.max(0.05, it.meta.size.z * 0.5) - 0.12);
    return;
  }
  if (state.view === 'sheet') {
    let y = WALL_H - 0.55;
    ROWS.forEach(([a, b]) => {
      const row = items.slice(a - 1, b); if (!row.length) return;
      const gap = 0.12; const widths = row.map((it) => it.meta.size.x); const H = Math.max(...row.map((it) => it.meta.size.y));
      let x = -(widths.reduce((s, v) => s + v, 0) + gap * (row.length - 1)) / 2;
      row.forEach((it, i) => {
        const bb = it.meta.bounds, c = bb.getCenter(new THREE.Vector3());
        it.holder.scale.setScalar(1); it.holder.rotation.set(0, 0, 0);
        it.holder.position.set(x + widths[i] / 2 - c.x, y - H / 2 - c.y, 0.18 - c.z);
        it.g.position.set(0, 0, 0); it.home = it.holder.position.clone();
        x += widths[i] + gap;
      });
      y -= H + 0.22;
    });
  } else {
    const n = items.length, cols = Math.max(5, Math.round(Math.sqrt(n * 1.15 * Math.max(0.4, camera.aspect)))), cell = 0.62;
    items.forEach((it, i) => {
      const r = Math.floor(i / cols), cI = i % cols; const s = it.meta.size, m = Math.max(s.x, s.y);
      const sc = Math.min(1.6, (cell * 0.84) / m); const c = it.meta.bounds.getCenter(new THREE.Vector3());
      it.holder.scale.setScalar(sc); it.holder.rotation.set(0, 0, 0);
      it.holder.position.set((cI - (cols - 1) / 2) * cell - c.x * sc, WALL_H - 0.45 - r * cell - c.y * sc, 0.16 - c.z * sc);
      it.g.position.set(0, 0, 0); it.home = it.holder.position.clone();
    });
  }
  placeWall(0);
}
function placeWall(z) {
  wall.position.set(0, WALL_H / 2 - 0.2, z); floor.position.set(0, -0.2, z + 2);
  R.lastBox = new THREE.Box3(new THREE.Vector3(-WALL_W / 2, -0.25, z - 0.1), new THREE.Vector3(WALL_W / 2, WALL_H, z + 1.8));
  R.fitShadow(R.lastBox);
}

// ---------- camera ----------
const orbit = { target: new THREE.Vector3(), yaw: 0, pitch: 0, dist: 8, min: 0.06, max: 14 };
function frameAll() {
  const box = new THREE.Box3(); state.items.forEach((it) => box.expandByObject(it.holder));
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const fov = camera.fov * Math.PI / 180, fit = Math.max(s.y / 2 / Math.tan(fov / 2), s.x / 2 / Math.tan(fov / 2) / camera.aspect);
  orbit.target.copy(c); orbit.yaw = 0; orbit.pitch = 0.04; orbit.dist = fit * 1.06 + 0.3; orbit.min = 0.5; orbit.max = fit * 2;
}
function frameItem(it, close = false) {
  const box = new THREE.Box3().setFromObject(it.holder); const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const fov = camera.fov * Math.PI / 180; const m = Math.max(s.x / camera.aspect, s.y);
  orbit.target.copy(c); orbit.dist = (m / 2) / Math.tan(fov / 2) * (close ? 1.3 : 1.45); orbit.min = 0.05; orbit.max = Math.max(3, orbit.dist * 3);
}
function applyCam() {
  const { target: t, yaw, pitch, dist } = orbit;
  camera.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * dist, t.y + Math.sin(pitch) * dist, t.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(t); camera.near = Math.max(0.005, dist * 0.02); camera.far = 60; camera.updateProjectionMatrix();
}

// ---------- inspect ----------
const sockGroup = new THREE.Group(); R.scene.add(sockGroup);
function inspect(it) {
  if (state.inspect && state.inspect !== it) uninspect(false);
  state.inspect = it; document.body.classList.add('inspect');
  // take it off the wall: 0.9 m in front, at eye height
  it.holder.position.copy(it.home).add(new THREE.Vector3(0, 0, 0.9)); it.holder.scale.setScalar(1);
  if (state.view === 'grid') { const c = it.meta.bounds.getCenter(new THREE.Vector3()); it.holder.position.set(it.home.x, it.home.y, 1.1 - c.z); }
  frameItem(it, true); orbit.yaw = 0.35; orbit.pitch = 0.18;
  const m = it.meta;
  $('wname').textContent = m.name;
  const f = (v) => v.toArray().map((x) => x.toFixed(3)).join(', ');
  $('winfo').innerHTML = [['id', m.id], ['loại', m.kind + ', ' + m.hands + ' tay'], ['tam giác', m.tris.toLocaleString()], ['cỡ (m)', f(m.size)],
    ['grip', m.grip ? f(m.grip.pos) : '-'], ['muzzle/tip', m.muzzle ? f(m.muzzle.pos) : m.tip ? f(m.tip) : '-']].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  showSockets();
  history.replaceState(null, '', '?inspect=' + m.id + (qName !== 'high' ? '&q=' + qName : ''));
}
function uninspect(reframe = true) {
  const it = state.inspect; if (!it) return;
  if (state.view === 'grid') layout(); else { it.holder.position.copy(it.home); }
  state.inspect = null; document.body.classList.remove('inspect'); sockGroup.clear();
  if (reframe) frameAll();
  history.replaceState(null, '', location.pathname);
}
function showSockets() {
  sockGroup.clear(); const it = state.inspect; if (!it || !state.socks) return;
  const cols = { grip: 0xff3030, grip2: 0xff9a20, muzzle: 0xffe040, tip: 0x40e0ff, edge: 0x40ff70 };
  it.holder.updateMatrixWorld(true);
  for (const n of Object.keys(cols)) { const o = it.g.getObjectByName(n); if (!o) continue;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[n]).multiplyScalar(4) }));
    o.getWorldPosition(s.position); sockGroup.add(s); }
}

// ---------- input ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const pts = new Map(); let drag = null, pinch0 = 0, moved = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } drag = [e.clientX, e.clientY]; });
canvas.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) zoom(pinch0 / d); pinch0 = d; moved += 10; return; }
  if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
  if (state.inspect) { orbit.yaw -= dx * 0.008; orbit.pitch = Math.max(-1.45, Math.min(1.45, orbit.pitch + dy * 0.008)); }
  else { orbit.target.x -= dx * orbit.dist * 0.0012; orbit.target.y += dy * orbit.dist * 0.0012; }
});
const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
  if (moved < 6 && e.type === 'pointerup') click(e); drag = null; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
function zoom(f) { orbit.dist = Math.max(orbit.min, Math.min(orbit.max, orbit.dist * f)); }
function click(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(state.items.map((it) => it.holder), true);
  if (!hits.length) { if (state.inspect) uninspect(); return; }
  let o = hits[0].object; while (o && !state.items.find((it) => it.holder === o)) o = o.parent;
  const it = state.items.find((x) => x.holder === o); if (it) inspect(it);
}
document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { uninspect(false); state.view = b.dataset.view;
  document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); layout(); frameAll(); });
$('q').onclick = () => { qName = qName === 'high' ? 'low' : 'high'; R.setQuality(qName); $('q').textContent = 'Chất lượng: ' + (qName === 'high' ? 'cao' : 'thấp'); };
$('q').textContent = 'Chất lượng: ' + (qName === 'high' ? 'cao' : 'thấp');
$('tm').onclick = () => { R.agxMix = R.agxMix > 0.5 ? 0.25 : 1; $('tm').textContent = R.agxMix > 0.5 ? 'AgX' : 'ACES/AgX'; };
$('wet').onclick = () => { const w = $('wet').classList.toggle('on'); mats.setWet(w ? 1 : 0); $('wet').textContent = w ? 'Ướt mưa' : 'Khô'; };
$('lbl').onclick = () => { state.labels = !state.labels; $('lbl').classList.toggle('on', state.labels); };
$('lbl').classList.toggle('on', state.labels);
$('back').onclick = () => uninspect();
const step = (d) => { const i = state.items.indexOf(state.inspect); const it = state.items[(i + d + state.items.length) % state.items.length]; uninspect(false); inspect(it); };
$('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
$('socks').onclick = () => { state.socks = !state.socks; $('socks').classList.toggle('on', state.socks); showSockets(); };
$('variant').onclick = () => { const it = state.inspect; if (!it) return; const v = it.meta.variant ? 0 : 1;
  it.holder.remove(it.g); it.g = it.w.build(1 + v, { variant: v }); it.meta = it.g.userData.weapon; it.holder.add(it.g); $('variant').classList.toggle('on', !!v); inspect(it); };
if (P.get('wet') === '1') { mats.setWet(1); $('wet').classList.add('on'); $('wet').textContent = 'Ướt mưa'; }

// ---------- labels ----------
const labelBox = $('labels'); const labelEls = state.items.map((it) => { const d = document.createElement('div'); d.innerHTML = `${it.meta.name}<b>${it.meta.tris}</b>`; labelBox.appendChild(d); return d; });
const tmpV = new THREE.Vector3();
function updLabels() {
  const show = state.labels && !state.inspect && !only && !state.solo && orbit.dist < 6.5;
  labelBox.style.display = show ? '' : 'none'; if (!show) return;
  state.items.forEach((it, i) => { const b = new THREE.Box3().setFromObject(it.holder); tmpV.set((b.min.x + b.max.x) / 2, b.min.y, b.max.z).project(camera);
    const el = labelEls[i]; el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px'; el.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight + 2) + 'px'; });
}

// ---------- loop ----------
function resize() { R.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
layout();
if (only) {
  const it = state.items[0]; frameItem(it, true);
  orbit.yaw = (+(P.get('yaw') || 0)) * Math.PI / 180; orbit.pitch = (+(P.get('pitch') || 0)) * Math.PI / 180;
  if (P.get('dist')) orbit.dist = +P.get('dist');
  if (P.get('fov')) { camera.fov = +P.get('fov'); frameItem(it, true); if (P.get('dist')) orbit.dist = +P.get('dist'); }
} else frameAll();
if (P.get('inspect')) { const it = state.items.find((x) => x.w.id === P.get('inspect')); if (it) inspect(it); }
document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === state.view));
$('stat').textContent = `${state.items.length} món · ${totalTris.toLocaleString()} tam giác`;
let frames = 0; const clock = new THREE.Clock();
function frame() {
  applyCam(); R.render(camera, clock.getElapsedTime()); updLabels();
  if (++frames === 3) { window.__ready = true; console.log('[kit] mats', JSON.stringify(mats.stats())); }
  requestAnimationFrame(frame);
}
frame();
// solo(id, rotDeg, yawDeg, pitchDeg): show one weapon alone in front of the wall, framed (used by tools/compare.mjs)
function solo(id, rot = 0, yaw = 0, pitch = 0, close = true) {
  uninspect(false); let found = null;
  for (const it of state.items) { const on = it.w.id === id; it.holder.visible = on; if (on) found = it; }
  if (!found) throw new Error('weapon not found: ' + id);
  const it = found, c = it.meta.bounds.getCenter(new THREE.Vector3());
  it.holder.scale.setScalar(1); it.holder.rotation.set(0, 0, rot * Math.PI / 180); it.holder.position.set(0, 0, 0);
  it.g.position.set(-c.x, -c.y + 1.4, -c.z + 0.45);
  placeWall(0.45 - Math.max(0.03, it.meta.size.z * 0.5) - 0.12);
  frameItem(it, close); orbit.yaw = yaw * Math.PI / 180; orbit.pitch = pitch * Math.PI / 180; applyCam();
  labelBox.style.display = 'none'; state.solo = true;
  return { id, tris: it.meta.tris, size: it.meta.size.toArray() };
}
// viewmodel(id): Saltline's hip pose (weapon.md §5: p [.118,-.122,-.275] r [.034,.085,-.03], view fov 54) for side-by-sides
function viewmodel(id) {
  solo(id); const it = state.items.find((x) => x.w.id === id);
  camera.fov = 54; camera.updateProjectionMatrix();
  const cam = new THREE.Vector3(0, 1.45, 1.6); orbit.target.set(0, 1.45, 0); orbit.yaw = 0; orbit.pitch = 0; orbit.dist = 1.6; applyCam();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.034, 0.085, -0.03, 'YXZ')).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  it.holder.quaternion.copy(q); it.g.position.set(0, 0, 0);
  it.holder.position.copy(cam).add(new THREE.Vector3(0.118, -0.122, -0.275));
  placeWall(-0.6);
  return true;
}
window.__api = { viewmodel, state, R, mats, camera, orbit, inspect: (id) => inspect(state.items.find((x) => x.w.id === id)), solo, REGISTRY };
