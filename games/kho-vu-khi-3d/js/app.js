import * as THREE from '../lib/three.js';
import { weapons } from '../weapons/index.js';
import cells from '../lib/sheet-layout.js';
import { inHand } from '../lib/attach.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot');            // '1' | '2' -> bare exact-size sheet render for compare shots
const VARIANT = +(Q.get('variant') || 0);
const SHEETS = { 1: { w: 1477, h: 718, cls: 'sheet1' }, 2: { w: 2000, h: 1125, cls: 'sheet2' } };
const $ = (s) => document.querySelector(s);
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
window.__errors = errors;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!SHOT });
renderer.setClearColor(0x000000, 0);
const canvas = renderer.domElement;
$('#stage').appendChild(canvas);

// ---------- environment (gradient dome + softboxes, no files) ----------
function makeEnv() {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 24, 16), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10, c = y > 0 ? new THREE.Color(0.8, 0.82, 0.92).lerp(new THREE.Color(1.15, 1.15, 1.25), y) : new THREE.Color(0.2, 0.19, 0.25).lerp(new THREE.Color(0.08, 0.08, 0.11), -y);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  for (const [x, y, z, s] of [[-6, 6, 6, 5], [7, 3, 4, 3], [0, 7, -7, 4]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.5), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m);
  }
  return new THREE.PMREMGenerator(renderer).fromScene(sc, 0.02).texture;
}
const env = makeEnv();

function addLights(scene) {
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xe6eeff, 0x56506a, 1.15));
  const key = new THREE.DirectionalLight(0xfff3e4, 1.25); key.position.set(-1.2, 1.6, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa9c0ff, 0.55); rim.position.set(2, 0.5, -1); scene.add(rim);
}

// ---------- weapon cache ----------
let _blob = null;
function blobTex() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(8,10,30,0.9)'); g.addColorStop(0.55, 'rgba(8,10,30,0.35)'); g.addColorStop(1, 'rgba(8,10,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); _blob = new THREE.CanvasTexture(c); _blob.colorSpace = THREE.SRGBColorSpace; return _blob;
}
const cache = new Map();
function getWeapon(i, variant = 0, seed = 1) {
  const key = i + ':' + variant + ':' + seed;
  if (!cache.has(key)) cache.set(key, weapons[i].build(seed, { variant }));
  return cache.get(key);
}
const cellFor = (i) => cells[i];

// ---------- sheet / grid view ----------
let mode = 'sheet', sheetNo = 1, scene = null, cam = null, placed = [], viewW = 0, viewH = 0;

function layoutRects(sheetNo) {
  const list = weapons.map((w, i) => ({ i, c: cellFor(i) })).filter((o) => o.c && o.c.sheet === sheetNo);
  if (mode === 'sheet') {
    const S = SHEETS[sheetNo];
    return { W: S.w, H: S.h, items: list.map(({ i, c }) => ({ i, cx: (c.bbox[0] + c.bbox[2]) / 2, cy: (c.bbox[1] + c.bbox[3]) / 2, bw: c.bbox[2] - c.bbox[0], bh: c.bbox[3] - c.bbox[1] })) };
  }
  const cols = innerWidth < 520 ? 3 : innerWidth < 900 ? 5 : 8, cs = 150, rows = Math.ceil(list.length / cols);
  return { W: cols * cs, H: rows * cs, items: list.map(({ i }, n) => ({ i, cx: (n % cols + 0.5) * cs, cy: (Math.floor(n / cols) + 0.5) * cs, bw: cs - 26, bh: cs - 26 })) };
}

function buildSheet() {
  scene = new THREE.Scene(); addLights(scene); placed = [];
  const { W, H, items } = layoutRects(sheetNo);
  viewW = W; viewH = H;
  cam = new THREE.OrthographicCamera(0, W, H, 0, 1, 4000); cam.position.set(0, 0, 2000); cam.updateMatrixWorld();
  for (const it of items) {
    const w = weapons[it.i], g = getWeapon(it.i, VARIANT).clone(true);
    g.traverse((o) => { if (o.isMesh) o.material = getWeapon(it.i, VARIANT).getObjectByName('body').material; });
    const rotDeg = mode === 'sheet' ? (w.rot || 0) : 0;
    const holder = new THREE.Group(); holder.add(g); holder.rotation.z = rotDeg * Math.PI / 180;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true), size = box.getSize(new THREE.Vector3());
    const s = it.bh >= it.bw ? it.bh / Math.max(size.y, 1e-4) : it.bw / Math.max(size.x, 1e-4);
    const ctr = box.getCenter(new THREE.Vector3());
    holder.scale.setScalar(s);
    holder.position.set(it.cx - ctr.x * s, H - it.cy - ctr.y * s, 0);
    scene.add(holder); placed.push({ i: it.i, holder, cx: it.cx, cy: it.cy });
    if (sheetNo === 2 || mode !== 'sheet') {   // soft contact / ground shadow blob
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: sheetNo === 2 ? 0.55 : 0.35 }));
      const bw = (box.max.x - box.min.x) * s * 1.08 + 16, bh = (box.max.y - box.min.y) * s * 1.02 + 16;
      sh.scale.set(bw, bh, 1); sh.position.set(it.cx + (mode === 'sheet' ? 16 : 6), H - it.cy - (mode === 'sheet' ? 22 : 8), -80); sh.renderOrder = -1; scene.add(sh);
    }
  }
  resize();
}

function resize() {
  if (mode === 'inspect') return;
  const wrap = $('#stage'), avail = SHOT ? viewW : wrap.clientWidth || innerWidth;
  const cw = SHOT ? viewW : Math.min(avail, viewW * 1.6), ch = Math.round(cw * viewH / viewW);
  renderer.setPixelRatio(SHOT ? 1 : Math.min(devicePixelRatio, 2));
  renderer.setSize(cw, ch); canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  wrap.style.height = ch + 'px';
}

// ---------- inspector ----------
let insp = null;
const orbit = { az: 0.35, pol: 1.25, dist: 2.6, tx: 0, ty: 0, tz: 0 };
const ptr = new Map();
let showSock = true, showHand = false, inspVariant = 0, inspSeed = 1;
const SOCK_COL = { grip: 0xff3b30, grip2: 0xff9f0a, muzzle: 0xffe14a, tip: 0x32e6ff, edge: 0x34e07a };

function openInspect(i) {
  mode = 'inspect'; document.body.classList.add('inspecting');
  insp = { i, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(32, 1, 0.01, 50) };
  addLights(insp.scene); rebuildInspect();
  $('#panel').hidden = false; resizeInspect();
  history.replaceState(null, '', '#' + weapons[i].id);
}
function rebuildInspect() {
  const i = insp.i, w = weapons[i];
  if (insp.group) insp.scene.remove(insp.group);
  const g = w.build(inspSeed, { variant: inspVariant }), meta = g.userData.weapon;
  const grp = new THREE.Group(); grp.add(g);
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const s = 1.3 / Math.max(size.x, size.y, size.z);
  g.position.sub(ctr); grp.scale.setScalar(s);
  insp.group = grp; insp.s = s; insp.weapon = g;
  const marks = new THREE.Group(); insp.marks = marks; grp.add(marks);
  const addDot = (p, c, r = 0.012) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r / s, 10, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); m.position.copy(p).sub(ctr); m.renderOrder = 10; marks.add(m); };
  for (const n of ['grip', 'grip2', 'muzzle', 'tip']) if (meta[n]) addDot(meta[n].pos || meta[n], SOCK_COL[n]);
  if (meta.edge) { addDot(meta.edge.a, SOCK_COL.edge, 0.008); addDot(meta.edge.b, SOCK_COL.edge, 0.008); }
  marks.visible = showSock;
  insp.hand = null;
  if (showHand && meta.grip) {
    const hand = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0xe0a47a, roughness: 0.8 });
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), skin), arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 8), skin);
    arm.rotation.z = Math.PI / 2; arm.position.x = -0.17; hand.add(fist, arm);
    const aim = new THREE.Vector3(1, 0, 0);
    g.position.set(0, 0, 0); inHand(g, hand, 'r', aim, new THREE.Vector3(0, 1, 0));
    hand.position.set(0, 0, 0); grp.add(hand); insp.hand = hand;
    marks.visible = false;
    // recenter hand+weapon
    grp.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(grp), c2 = b2.getCenter(new THREE.Vector3());
    hand.position.sub(c2.divideScalar(s)); grp.scale.setScalar(s);
  }
  insp.scene.add(grp);
  const rot = (w.kind === 'gun' || w.id.includes('rake')) ? 0 : 0;
  orbit.dist = 2.6; orbit.az = 0.35; orbit.pol = 1.3;
  const wi = $('#winfo');
  const sz = meta.size, dims = [sz.x, sz.y, sz.z].map((v) => (v * 100).toFixed(0));
  wi.innerHTML = `<h2>${w.name}</h2><div class="muted">#${String(i + 1).padStart(2, '0')} · ${w.id} · ${w.kind} · ${w.hands}-handed</div>
    <div class="kv"><span>triangles</span><b>${meta.tris}</b><span>size cm</span><b>${dims[0]} × ${dims[1]} × ${dims[2]}</b>
    <span>sockets</span><b>${['grip', 'grip2', 'muzzle', 'tip', 'edge'].filter((n) => meta[n]).join(', ')}</b></div>`;
}
function resizeInspect() {
  const wrap = $('#stage'), w = wrap.clientWidth, h = Math.max(320, Math.min(innerHeight * 0.62, w * 0.9));
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, h);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; wrap.style.height = h + 'px';
  insp.cam.aspect = w / h; insp.cam.updateProjectionMatrix();
}
function closeInspect() {
  mode = document.body.classList.contains('grid') ? 'grid' : 'sheet'; insp = null; document.body.classList.remove('inspecting'); $('#panel').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  buildSheet();
}

canvas.addEventListener('pointerdown', (e) => { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false }); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  const p = ptr.get(e.pointerId);
  if (p && mode === 'inspect') {
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 1) { orbit.az -= dx * 0.008; orbit.pol = Math.min(3.0, Math.max(0.15, orbit.pol - dy * 0.008)); }
  }
  if (p && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 5) p.moved = true;
  if (!p && mode === 'sheet') { const h = hit(e); canvas.style.cursor = h ? 'pointer' : 'default'; $('#tip').textContent = h ? weapons[h.i].name + ' · ' + (h.tris) + ' tris' : ''; }
});
canvas.addEventListener('pointerup', (e) => {
  const p = ptr.get(e.pointerId); ptr.delete(e.pointerId);
  if (p && !p.moved && mode === 'sheet') { const h = hit(e); if (h) openInspect(h.i); }
});
canvas.addEventListener('wheel', (e) => { if (mode === 'inspect') { e.preventDefault(); orbit.dist = Math.min(6, Math.max(0.6, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1))); } }, { passive: false });
let pinch = 0;
canvas.addEventListener('touchmove', (e) => { if (mode === 'inspect' && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) orbit.dist = Math.min(6, Math.max(0.6, orbit.dist * pinch / d)); pinch = d; e.preventDefault(); } }, { passive: false });
canvas.addEventListener('touchend', () => { pinch = 0; });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(e) {
  if (!scene) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  let best = null;
  for (const p of placed) {
    const mesh = p.holder.getObjectByName('body'); if (!mesh) continue;
    const h = ray.intersectObject(mesh, false)[0];
    if (h && (!best || h.distance < best.d)) best = { i: p.i, d: h.distance, tris: mesh.geometry.attributes.position.count / 3 };
  }
  return best;
}

// ---------- UI ----------
function buildList() {
  const rows = weapons.map((w, i) => ({ w, i, t: getWeapon(i, 0).userData.weapon.tris, c: cells[i] }));
  const total = rows.reduce((a, r) => a + r.t, 0);
  $('#total').textContent = `${weapons.length} weapons · ${total.toLocaleString()} tris total · avg ${Math.round(total / weapons.length)} · max ${Math.max(...rows.map((r) => r.t))}`;
  $('#list').innerHTML = rows.map((r) => `<button data-i="${r.i}"><span>${String(r.i + 1).padStart(2, '0')} ${r.w.name}</span><b>${r.t}</b></button>`).join('');
  $('#list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { scrollTo({ top: 0 }); openInspect(+b.dataset.i); } });
}
function setSheet(n) { sheetNo = n; document.body.dataset.sheet = n; document.querySelectorAll('button[data-sheet]').forEach((b) => b.classList.toggle('on', +b.dataset.sheet === n)); if (mode !== 'inspect') buildSheet(); }

function frame() {
  requestAnimationFrame(frame);
  if (mode === 'inspect' && insp) {
    const c = insp.cam, d = orbit.dist;
    c.position.set(d * Math.sin(orbit.pol) * Math.sin(orbit.az), d * Math.cos(orbit.pol), d * Math.sin(orbit.pol) * Math.cos(orbit.az));
    c.lookAt(0, 0, 0); renderer.render(insp.scene, c);
  } else if (scene) renderer.render(scene, cam);
}

async function main() {
  buildList();
  if (SHOT) {
    document.body.classList.add('shot'); sheetNo = +SHOT; document.body.dataset.sheet = SHOT;
    buildSheet(); renderer.render(scene, cam); renderer.render(scene, cam);
    window.__ready = true; return;
  }
  document.querySelectorAll('button[data-sheet]').forEach((b) => b.addEventListener('click', () => setSheet(+b.dataset.sheet)));
  $('#back').addEventListener('click', closeInspect);
  $('#view').addEventListener('click', () => { document.body.classList.toggle('grid'); mode = 'sheet'; mode = document.body.classList.contains('grid') ? 'grid' : 'sheet'; buildSheet(); });
  $('#variant').addEventListener('click', () => { inspVariant ^= 1; $('#variant').textContent = 'Wear variant ' + (inspVariant + 1); rebuildInspect(); });
  $('#reseed').addEventListener('click', () => { inspSeed = (inspSeed % 9) + 1; rebuildInspect(); });
  $('#socks').addEventListener('change', (e) => { showSock = e.target.checked; if (insp) insp.marks.visible = showSock && !showHand; });
  $('#hand').addEventListener('change', (e) => { showHand = e.target.checked; if (insp) rebuildInspect(); });
  $('#prev').addEventListener('click', () => { insp.i = (insp.i + weapons.length - 1) % weapons.length; rebuildInspect(); });
  $('#next').addEventListener('click', () => { insp.i = (insp.i + 1) % weapons.length; rebuildInspect(); });
  addEventListener('resize', () => { if (mode === 'inspect') resizeInspect(); else buildSheet(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'inspect') closeInspect(); });
  if (innerWidth < 720) document.body.classList.add('grid'), mode = 'grid';
  setSheet(1);
  const h = decodeURIComponent(location.hash.slice(1)), hi = weapons.findIndex((w) => w.id === h);
  if (hi >= 0) openInspect(hi);
  window.__ready = true;
  frame();
}
main();
window.__app = { weapons, openInspect, getWeapon, hit };
