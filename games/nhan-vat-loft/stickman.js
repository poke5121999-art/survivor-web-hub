// Stickman page: every part (body, outfit, hat) is a set of lofts or plates from data/stickman.js, built into triangles by
// lib/stickman/part.js and skinned to a 22-bone skeleton made from joint positions. No original model is loaded.
import * as THREE from './vendor/three.module.min.js';
import { buildPart, unpack } from './lib/stickman/part.js?v=20261117e';
import T from './data/stickman.js?v=20261117e';

const q = new URLSearchParams(location.search);
const NAMES = T.bones.names, JP = T.bones.joint, PAR = T.bones.parent, bi = (n) => NAMES.indexOf(n);
const CHAIN = { trunk: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'], arm_L: ['LeftArm', 'LeftForeArm', 'LeftHand'], arm_R: ['RightArm', 'RightForeArm', 'RightHand'],
  leg_L: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], leg_R: ['RightUpLeg', 'RightLeg', 'RightFoot'], head: ['Head'] };
// skin weights: project the ring centre onto the chain's joint polyline, blend the two joints around it
function weigher(chain) {
  const ids = CHAIN[chain].map(bi), P = ids.map((i) => JP[i]);
  return (p) => {
    if (ids.length === 1) return [[ids[0], 1]];
    let best = null;
    for (let k = 0; k + 1 < P.length; k++) {
      const a = P[k], b = P[k + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      let s = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
      if (k > 0) s = Math.max(0, s); if (k + 2 < P.length) s = Math.min(1, s);
      const c = [a[0] + ab[0] * s, a[1] + ab[1] * s, a[2] + ab[2] * s], dd = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      if (!best || dd < best.dd) best = { dd, k, s };
    }
    const s = Math.max(0, Math.min(1, best.s));
    return s <= 0 ? [[ids[best.k], 1]] : s >= 1 ? [[ids[best.k + 1], 1]] : [[ids[best.k], 1 - s], [ids[best.k + 1], s]];
  };
}

// ---------- scene ----------
const canvas = document.getElementById('c'), stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: q.has('test') });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe3ea);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(2, 4, 3); scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshToonMaterial({ color: 0xb9d3a0 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const orbit = { yaw: 0.5, pitch: 0.12, dist: 6.4, target: new THREE.Vector3(0, 1.25, 0) };
const applyOrbit = () => { const { yaw, pitch, dist, target } = orbit; camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(yaw) * Math.cos(pitch)); camera.lookAt(target); };
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.008; orbit.pitch = Math.max(-0.4, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.006)); applyOrbit(); });
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = Math.max(2, Math.min(12, orbit.dist * Math.exp(e.deltaY * 0.0012))); applyOrbit(); }, { passive: false });
const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
addEventListener('resize', resize);

// ---------- skeleton from joint positions (rest frames axis-aligned) ----------
const bones = NAMES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
bones.forEach((b, i) => { const p = PAR[i] < 0 ? [0, 0, 0] : JP[PAR[i]]; b.position.set(JP[i][0] - p[0], JP[i][1] - p[1], JP[i][2] - p[2]); if (PAR[i] >= 0) bones[PAR[i]].add(b); });
const root = new THREE.Group(); root.add(bones[0]); scene.add(root); root.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(bones);

const grad = new THREE.DataTexture(new Uint8Array([110, 255]), 2, 1, THREE.RedFormat); grad.needsUpdate = true; grad.minFilter = grad.magFilter = THREE.NearestFilter;
const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, side: THREE.DoubleSide });
const cloth = toon.clone(); cloth.polygonOffset = true; cloth.polygonOffsetFactor = -1; cloth.polygonOffsetUnits = -2;
const ink = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
const wire = new THREE.MeshBasicMaterial({ color: 0x334455, wireframe: true });

function skinned(lofts, mat, palOverride) {
  const grp = new THREE.Group();
  lofts.forEach((L, k) => {
    const g = buildPart(palOverride ? { ...L, ...palOverride[k] } : L, weigher(L.chain));
    if (!g.idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3)); geo.setAttribute('skinIndex', new THREE.BufferAttribute(g.si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(g.sw, 4));
    geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
    const m = new THREE.SkinnedMesh(geo, S.view === 'wire' ? wire : mat); m.bind(skeleton, new THREE.Matrix4()); m.frustumCulled = false; grp.add(m);
    if (S.view !== 'wire') { // outline: same skinned geometry pushed out along its smooth normals
      const h = geo.clone(), p = h.attributes.position, n = h.attributes.normal, w = 0.009;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w);
      const o = new THREE.SkinnedMesh(h, ink); o.bind(skeleton, new THREE.Matrix4()); o.frustumCulled = false; grp.add(o);
    }
  });
  root.add(grp); return grp;
}

// ---------- state + UI ----------
const LABEL = { Skin_Skirt: 'Váy', Skin_TShirtSuit: 'Áo thun + quần short', Skin_CasualTanktopSkirt: 'Áo ba lỗ + váy', Skin_CasualShirt: 'Sơ mi', Skin_cookGirl: 'Đầu bếp nữ', Skin_cookMan: 'Đầu bếp',
  Skin_FarmerGirl: 'Nông dân nữ', Skin_Farmer: 'Nông dân', Skin_NinjaGirl: 'Ninja nữ', Skin_Ninja: 'Ninja', Skin_Santa: 'Ông già Noel' };
const SKINCOL = (n) => '#' + (T.skins[n] ? T.skins[n][0].pal[0] : T.body[0].pal[0]);
const S = { skin: q.get('skin') || 'Skin_Blue', outfit: q.get('outfit') || 'Skin_cookMan', hat: q.get('hat') || 'Hat_Chef', pose: q.get('pose') || 'walk', view: q.get('view') || 'full' };
let parts = [];
// body rings under an outfit's rings on the same chain sit 10 mm in, so the skin never pokes through the cloth
function tuck(body, outfit) {
  if (!outfit) return body;
  return body.map((B) => {
    const U = unpack(B), spans = outfit.filter((L) => L.chain === B.chain && L.kind !== 'plate').map((L) => [L.st[0], L.st[1]]);
    if (!spans.length) return B;
    return { ...U, r: U.r.map((ring, i) => (spans.some(([a, b]) => U.st[i] >= a - 0.01 && U.st[i] <= b + 0.01) ? ring.map((x) => Math.max(0, x - 10)) : ring)) };
  });
}
function rebuild() {
  parts.forEach((g) => { root.remove(g); g.traverse((o) => o.geometry && o.geometry.dispose()); }); parts = [];
  parts.push(skinned(S.view === 'body' ? T.body : tuck(T.body, T.outfits[S.outfit]), toon, T.skins[S.skin]));
  if (S.view !== 'body') {
    if (T.outfits[S.outfit]) parts.push(skinned(T.outfits[S.outfit], cloth));
    if (T.hats[S.hat]) parts.push(skinned(T.hats[S.hat], cloth));
  }
  let v = 0, t = 0; root.traverse((o) => { if (o.isSkinnedMesh && o.material !== ink) { v += o.geometry.attributes.position.count; t += o.geometry.index.count / 3; } });
  const n = (o) => (o ? o.reduce((s, L) => s + (L.kind === 'plate' ? unpack(L).top.length : L.st[2]), 0) : 0);
  document.getElementById('info').textContent = `${parts.length} part · ${T.body.length + (T.outfits[S.outfit] || []).length + (T.hats[S.hat] || []).length} loft · ${n(T.body) + n(T.outfits[S.outfit]) + n(T.hats[S.hat])} vòng · ${t} tam giác`;
}
function buttons(id, items, key, label, swatch) {
  const el = document.getElementById(id); el.innerHTML = '';
  for (const k of items) {
    const b = document.createElement('button'); b.dataset.k = k;
    if (swatch) { b.className = 'sw'; b.style.background = swatch(k); b.title = k.replace('Skin_', ''); } else b.textContent = label(k);
    b.onclick = () => { S[key] = k; mark(); rebuild(); }; el.appendChild(b);
  }
}
function mark() { for (const [id, key] of [['skins', 'skin'], ['outfits', 'outfit'], ['hats', 'hat'], ['poses', 'pose'], ['views', 'view']]) document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.k === S[key])); }
buttons('skins', ['Skin_Blue', ...Object.keys(T.skins).filter((k) => k !== 'Skin_Blue')], 'skin', null, SKINCOL);
buttons('outfits', ['none', ...Object.keys(T.outfits)], 'outfit', (k) => (k === 'none' ? 'Không' : LABEL[k] || k.replace('Skin_', '')));
buttons('hats', ['none', ...Object.keys(T.hats)], 'hat', (k) => (k === 'none' ? 'Không' : k.replace('Hat_', '').replace(/_/g, ' ')));
buttons('poses', ['bind', 'idle', 'walk', 'run'], 'pose', (k) => ({ bind: 'Chữ T', idle: 'Đứng', walk: 'Đi', run: 'Chạy' })[k]);
buttons('views', ['full', 'body', 'wire'], 'view', (k) => ({ full: 'Đầy đủ', body: 'Chỉ thân', wire: 'Lưới vòng' })[k]);

// ---------- procedural poses (rest frames are world-aligned, so rotations read as world axes) ----------
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const armDir = (s) => new THREE.Vector3(...[0, 1, 2].map((k) => JP[bi(s + 'Hand')][k] - JP[bi(s + 'Arm')][k])).normalize();
const lower = { Left: new THREE.Quaternion(), Right: new THREE.Quaternion() };
for (const s of ['Left', 'Right']) { const d = armDir(s); lower[s].setFromUnitVectors(d, d.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, -1, 0)).normalize()); }
const hips0 = bones[0].position.clone();
function pose(t) {
  bones.forEach((b) => b.quaternion.identity()); bones[0].position.copy(hips0);
  if (S.pose === 'bind') return;
  const run = S.pose === 'run', walk = S.pose === 'walk' || run, w = run ? 11 : 7, ph = t * w;
  const sw = walk ? (run ? 0.75 : 0.5) * Math.sin(ph) : 0, breathe = Math.sin(t * 2) * 0.012;
  bones[0].position.y = hips0.y + (walk ? Math.abs(Math.cos(ph)) * (run ? 0.06 : 0.035) : breathe);
  bones[bi('Spine')].quaternion.setFromAxisAngle(X, run ? 0.18 : walk ? 0.05 : 0);
  bones[bi('Hips')].quaternion.setFromAxisAngle(Y, walk ? 0.12 * Math.sin(ph) : 0);
  for (const [s, sg] of [['Left', 1], ['Right', -1]]) {
    const leg = sg * sw, knee = walk ? Math.max(0, -sg * Math.sin(ph + 0.6)) * (run ? 1.1 : 0.6) : 0;
    bones[bi(s + 'UpLeg')].quaternion.setFromAxisAngle(X, -leg);
    bones[bi(s + 'Leg')].quaternion.setFromAxisAngle(X, knee);
    qa.setFromAxisAngle(X, sg * sw * (run ? 1.1 : 0.8)); qb.copy(lower[s]);
    bones[bi(s + 'Arm')].quaternion.copy(qa).multiply(qb);
    bones[bi(s + 'ForeArm')].quaternion.setFromAxisAngle(X, run ? -0.9 : -0.25);
  }
}

rebuild(); mark(); resize(); applyOrbit();
const clock = new THREE.Clock();
function frame() { pose(clock.getElapsedTime()); renderer.render(scene, camera); requestAnimationFrame(frame); }
frame();
window.ST = { S, rebuild, pose, renderer, scene, camera, orbit, applyOrbit, snap: () => { renderer.render(scene, camera); return canvas.toDataURL('image/png'); }, set: (k, v) => { S[k] = v; mark(); rebuild(); } };
window.__ready = true;
