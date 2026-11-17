// Nhân Vật Loft (thử nghiệm): code-only characters rebuilt from the owner's hero meshes. Everything visible on the
// canvas is generated in the browser from number tables (data/char/*.js) by lib/char.js; the originals appear only as
// pre-rendered reference images.
import * as THREE from './vendor/three.module.min.js';
import { makeCharacter, makeClips, toonGradient, outlineMaterial } from './lib/char-three.js';
import { buildFromParts } from './lib/parts.js';
const REP_NAMES = ['bodyLoft', 'shell', 'strips', 'shCap', 'hairLocks', 'axisLoft'];
let REPS = null;
async function loadReps() { if (!REPS) { REPS = {}; await Promise.all(REP_NAMES.map(async (n) => { REPS[n] = await import(`./lib/rep/${n}.js`); })); } return REPS; }
const SLOT_LABEL = { body: 'Thân', top: 'Áo', bottom: 'Váy', under: 'Đồ lót', limbs: 'Bao tay/chân', feet: 'Giày', hair: 'Tóc', hat: 'Mũ', ears: 'Tai/sừng', back: 'Sau lưng', accessory: 'Phụ kiện' };
import { buildFromSpace } from './lib/space.js';
import { shBasis } from './lib/sph.js';
import { makePolyline, plPoint, plTangent, frame, ringTs, profR } from './lib/loft-core.js';

const HEROES = ['hikari', 'kaiyo', 'kinu', 'matsuko', 'nishi', 'reiko', 'sumiko', 'youta'];
const CLIP_LABEL = { idle: 'Đứng (idle)', run: 'Chạy (run)', attack: 'Đá (attack)', attack2: 'Combo (attack 2)', hit: 'Trúng đòn (hit)', die: 'Ngã (die)', bind: 'Tư thế chữ T' };
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

// ---------- renderer, scene, minimal orbit ----------
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1ece2);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(-1.2, 2.2, 2.0); scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ color: 0xe2d9c8 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const orbit = { yaw: 0.45, pitch: 0.08, dist: 3.6, target: new THREE.Vector3(0, 0.8, 0) };
function applyOrbit() { const { yaw, pitch, dist, target } = orbit; camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(yaw) * Math.cos(pitch)); camera.lookAt(target); }
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, yaw: orbit.yaw, pitch: orbit.pitch, t: orbit.target.clone() }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (drag.b === 2 || e.shiftKey) { const s = orbit.dist * 0.0015; const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); orbit.target.copy(drag.t).addScaledVector(right, -dx * s).add(new THREE.Vector3(0, dy * s, 0)); }
  else { orbit.yaw = drag.yaw - dx * 0.008; orbit.pitch = Math.max(-1.2, Math.min(1.3, drag.pitch + dy * 0.006)); } applyOrbit(); });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = Math.max(0.35, Math.min(9, orbit.dist * Math.exp(e.deltaY * 0.0012))); applyOrbit(); }, { passive: false });
function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize);

// ---------- state ----------
const S = { hero: null, char: null, clips: {}, mixer: null, action: null, clip: 'idle', paused: false, ref: !TEST, mode: 'char', metrics: null, space: null, spaceMesh: null };
const tableCache = {}, clipCache = {}, partsCache = {};
S.build = params.get('build') === 'old' ? 'old' : 'parts'; S.hidden = new Set();
async function loadParts(h) { if (!partsCache[h]) partsCache[h] = (await import(`./data/parts/${h}.js`)).default; return partsCache[h]; }
async function loadTable(h) { if (!tableCache[h]) tableCache[h] = (await import(`./data/char/${h}.js`)).default; return tableCache[h]; }
async function loadClips(h) { if (!clipCache[h]) clipCache[h] = await (await fetch(`./data/clips/${h}.json`)).json(); return clipCache[h]; }

async function loadHero(h) {
  if (S.char) { scene.remove(S.char.group); S.char.mesh.geometry.dispose(); }
  const [t, cj] = await Promise.all([loadTable(h), loadClips(h)]);
  let arr = null;
  if (S.build === 'parts') {
    if (h !== S.hero) S.hidden = new Set();
    const [pf, reps] = await Promise.all([loadParts(h), loadReps()]); S.partsFile = pf;
    arr = buildFromParts(t, { ...pf, parts: pf.parts.filter((p) => !S.hidden.has(p.id)) }, reps);
  }
  const c = makeCharacter(t, { arr, springs: params.has('nospring') ? false : undefined, springOpts: { noCollide: params.has('nocol') } });
  scene.add(c.group); S.char = c; S.hero = h; S.table = t;
  S.clips = makeClips(cj, c.bones); S.mixer = new THREE.AnimationMixer(c.root);
  setClip(S.clip);
  updatePanels();
  return c.stats;
}
function setClip(name) {
  S.clip = name; if (!S.mixer) return;
  S.mixer.stopAllAction();
  if (name === 'bind' || !S.clips[name]) { S.char.skeleton.pose(); restPose(); }
  else { const a = S.mixer.clipAction(S.clips[name]); a.reset().play(); S.action = a; }
  if (S.char.springs) S.char.springs.reset();
  document.querySelectorAll('#clips button').forEach((b) => b.classList.toggle('on', b.dataset.clip === name));
}
function restPose() { const t = S.table; t.skel.names.forEach((n, i) => { const b = S.char.bones[n]; const r = t.skel.trs[i]; b.position.set(r[0], r[1], r[2]); b.quaternion.set(r[3], r[4], r[5], r[6]); b.scale.set(r[7], r[8], r[9]); }); }

// ---------- per-frame ----------
const clock = new THREE.Clock();
function tick(dt) {
  if (S.mode === 'char' && S.char && S.mixer) {
    if (S.clip !== 'bind') S.mixer.update(dt); else restPose();
    if (S.char.springs) S.char.springs.step(dt);
    // blink every 2.5-4.5 s for 0.12 s
    S.blinkT = (S.blinkT || 0) + dt; if (!S.nextBlink) S.nextBlink = 2.5 + Math.random() * 2;
    const fm = S.char.faceMesh; if (fm && fm.userData.setBlink) { if (S.blinkT > S.nextBlink) { fm.userData.setBlink(true); if (S.blinkT > S.nextBlink + 0.12) { fm.userData.setBlink(false); S.blinkT = 0; S.nextBlink = 2.5 + Math.random() * 2; } } }
  }
}
function loop() { const dt = Math.min(0.05, clock.getDelta()); if (!S.paused) tick(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }

// ---------- panels ----------
const pct = (x) => (x * 100).toFixed(1) + ' %';
function updatePanels() {
  const h = S.hero, m = S.metrics && S.metrics[h];
  $('#heroName').textContent = h;
  const st = S.char.stats;
  let html = `<div class="kv"><b>${st.verts.toLocaleString()}</b> đỉnh · <b>${st.tris.toLocaleString()}</b> tam giác</div><div class="kv">dựng trong trình duyệt: <b>${st.msTotal.toFixed(0)} ms</b></div>`;
  if (m) html += `<table class="num"><tr><th></th><th>IoU</th><th>sai lệch</th></tr>
    <tr><td>cả nhân vật</td><td>${m.full.iou.toFixed(3)}</td><td>${(m.full.dist * 1000).toFixed(1)} mm</td></tr>
    <tr><td>trước / bên / 3-4</td><td colspan="2">${m.full.views.map((x) => x.toFixed(3)).join(' / ')}</td></tr>
    <tr><td>thân + áo</td><td>${m.body.iou.toFixed(3)}</td><td>${(m.body.dist * 1000).toFixed(1)} mm</td></tr>
    <tr><td>tóc + đầu</td><td>${m.hair.iou.toFixed(3)}</td><td>${(m.hair.dist * 1000).toFixed(1)} mm</td></tr>
    <tr><td>số trong bảng</td><td colspan="2">${m.params.toLocaleString()}</td></tr></table>`;
  if (m && m.gates) html += `<div class="gates"><b>Kiểm tra xuyên thấu</b> (30 khung/clip, số đỉnh lớn nhất trong một khung):<br>${Object.entries(m.gates).map(([c, g]) => `${c}: ${Object.entries(g).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('<br>')}</div>`;
  if (S.build === 'parts' && S.partsFile) {
    html += `<h2>Các part (mỗi mesh con của bản gốc là một part code)</h2><table class="num parts"><tr><th></th><th>part</th><th>cách dựng</th><th>sai lệch</th></tr>` +
      S.partsFile.parts.map((p) => `<tr><td><input type="checkbox" data-part="${p.id}" ${S.hidden.has(p.id) ? '' : 'checked'}></td><td>${SLOT_LABEL[p.slot] || p.slot}<br><small>${p.id.split('.').slice(1, 2).join('')}</small></td><td>${p.rep}</td><td>${p.score != null && isFinite(p.score) ? p.score.toFixed(1) + ' mm' : '–'}</td></tr>`).join('') + '</table>';
  }
  $('#numbers').innerHTML = html;
  document.querySelectorAll('#numbers input[data-part]').forEach((cb) => (cb.onchange = () => { cb.checked ? S.hidden.delete(cb.dataset.part) : S.hidden.add(cb.dataset.part); loadHero(S.hero); }));
  $('#refImg1').src = `./ref/${h}-front.png`; $('#refImg2').src = `./ref/${h}-q34.png`;
  document.querySelectorAll('#heroes button').forEach((b) => b.classList.toggle('on', b.dataset.hero === h));
}
function buildUI() {
  $('#heroes').innerHTML = HEROES.map((h) => `<button data-hero="${h}">${h}</button>`).join('');
  $('#heroes').onclick = (e) => { const h = e.target.dataset.hero; if (h) { setMode('char'); loadHero(h); } };
  $('#clips').innerHTML = Object.entries(CLIP_LABEL).map(([k, v]) => `<button data-clip="${k}">${v}</button>`).join('');
  $('#clips').onclick = (e) => { const c = e.target.dataset.clip; if (c) setClip(c); };
  $('#refToggle').onchange = (e) => { S.ref = e.target.checked; document.body.classList.toggle('noref', !S.ref); document.body.classList.toggle('bare', params.has('bare')); resize(); };
  $('#build').innerHTML = `<button data-build="parts">Theo part</button><button data-build="old">Gộp (bản cũ)</button>`;
  $('#build').onclick = (e) => { const b = e.target.dataset.build; if (b && b !== S.build) { S.build = b; markBuild(); loadHero(S.hero); } };
  markBuild();
  $('#pause').onclick = () => { S.paused = !S.paused; $('#pause').textContent = S.paused ? '▶ Chạy tiếp' : '⏸ Dừng'; };
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  document.querySelectorAll('.cam button').forEach((b) => (b.onclick = () => camPreset(b.dataset.cam)));
}
function markBuild() { document.querySelectorAll('#build button').forEach((b) => b.classList.toggle('on', b.dataset.build === S.build)); }
function camPreset(k) {
  const P = { full: [0.45, 0.08, 3.6, 0.8], front: [0, 0.02, 3.6, 0.8], side: [Math.PI / 2, 0.02, 3.6, 0.8], face: [0.25, 0.05, 0.75, 1.42], hands: [1.2, 0.1, 1.0, 0.85], skirt: [0.3, 0.05, 1.6, 0.7] }[k];
  if (!P) return; orbit.yaw = P[0]; orbit.pitch = P[1]; orbit.dist = P[2]; orbit.target.set(k === 'hands' ? 0.55 : 0, P[3], 0); applyOrbit();
}
async function setMode(m) {
  S.mode = m; document.body.dataset.mode = m;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  if (S.char) S.char.group.visible = m === 'char';
  if (S.spaceMesh) S.spaceMesh.visible = m === 'space';
  if (m === 'space') await showSpace();
  if (m === 'run') showRunTest();
  resize();
}

// ---------- run test: 25 fps strips of the skirt heroes + the interpenetration gates ----------
const STRIP_HEROES = ['hikari', 'kaiyo', 'kinu', 'matsuko', 'sumiko', 'youta'];
const GATE_LABEL = { armTorso: 'tay xuyên thân', thighThigh: 'đùi xuyên đùi', handHip: 'tay xuyên hông', hairFace: 'tóc xuyên mặt', hairBody: 'tóc xuyên thân/vai', clothLeg: 'váy/áo choàng xuyên chân', skirtPoke: 'chân lòi qua váy' };
function showRunTest() {
  const box = $('#runtest'); if (box.dataset.done) return; box.dataset.done = 1;
  let html = '<h2 style="margin-top:0">Chạy thử: 25 khung/giây, nhìn trước (hàng trên) và nhìn bên (hàng dưới)</h2><p style="color:var(--mute)">Mỗi khung là nhân vật code chạy clip gốc của hero, tóc và váy/áo choàng do lò xo + va chạm với chân, thân, đầu. Số trong bảng: số đỉnh xuyên vào nhiều nhất trong một khung (30 khung mỗi clip, vòng lặp thứ hai), so với tư thế chữ T.</p>';
  for (const h of STRIP_HEROES) {
    html += `<h3>${h}</h3>`;
    const g = S.metrics && S.metrics[h] && S.metrics[h].gatesRaw;
    if (g) { const keys = Object.keys(GATE_LABEL); html += '<table class="num" style="max-width:900px"><tr><th>clip</th>' + keys.map((k) => `<th>${GATE_LABEL[k]}</th>`).join('') + '</tr>' + Object.entries(g).map(([c, v]) => `<tr><td>${c === 'bind' ? 'chữ T (gốc so sánh)' : c}</td>${keys.map((k) => `<td>${v.worst[k] ?? 0}${v.frames && v.frames[k] ? ` <span style="color:var(--mute)">(${v.frames[k]}/30)</span>` : ''}</td>`).join('')}</tr>`).join('') + '</table>'; }
    html += `<div style="color:var(--mute);font-size:12px;margin-top:6px">Chạy (run)</div><img loading="lazy" src="./strips/${h}-run.jpg" alt="${h} chạy"><div style="color:var(--mute);font-size:12px">Đá (attack)</div><img loading="lazy" src="./strips/${h}-attack.jpg" alt="${h} đá">`;
  }
  box.innerHTML = html;
}

// ---------- body space demo ----------
async function showSpace() {
  if (!S.space) {
    S.space = (await import('./data/space.js')).default;
    const box = $('#sliders'); box.innerHTML = S.space.sigma.map((_, k) => `<label>PC${k + 1} <span>${(S.space.explained[k] * 100).toFixed(0)} %</span><input type="range" min="-2.5" max="2.5" step="0.05" value="0" data-k="${k}"></label>`).join('') + '<button id="spaceReset">Về trung bình</button>';
    box.oninput = () => rebuildSpace(); $('#spaceReset').onclick = () => { box.querySelectorAll('input').forEach((i) => (i.value = 0)); rebuildSpace(); };
  }
  rebuildSpace();
}
function rebuildSpace() {
  const w = [...document.querySelectorAll('#sliders input')].map((i) => +i.value);
  const t0 = performance.now(); const a = buildFromSpace(S.space, { w }); const ms = performance.now() - t0;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.color.map((c) => Math.pow(c, 2.2)), 3)); g.setIndex(new THREE.BufferAttribute(a.index, 1)); g.computeVertexNormals(); g.setAttribute('olw', new THREE.BufferAttribute(new Float32Array(a.position.length / 3).fill(1), 1));
  if (S.spaceMesh) { scene.remove(S.spaceMesh); S.spaceMesh.traverse((o) => o.geometry && o.geometry.dispose()); }
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }))); grp.add(new THREE.Mesh(g, outlineMaterial(0.004)));
  S.spaceMesh = grp; scene.add(grp); $('#spaceInfo').textContent = `${(a.position.length / 3).toLocaleString()} đỉnh · dựng ${ms.toFixed(0)} ms · w = [${w.map((x) => x.toFixed(1)).join(', ')}]`;
}

// ---------- test hooks (interpenetration gates, strips) ----------
// "inside" is tested against the rest-pose lofts themselves: a world point is taken back into the rest pose of the bone
// that drives a chain segment, then compared with that ring's profile radius (x0.9), so plain contact is not counted.
const _v = new THREE.Vector3(), _p = new THREE.Vector3();
const _M = new THREE.Matrix4();
function chainGeom(t, name) {
  const ch = t.chains.find((c) => c.name === name); if (!ch) return null;
  const W = S.char.arr.joints, pl = makePolyline(ch.joints.map((n) => W[n]), ch.ext), ts = ringTs(pl, ch.counts);
  return { ch, pl, ts, ref: t.ref[ch.ref] };
}
function insideChain(G, q, shrink) { // q: [x,y,z] in rest space
  const { pl, ts, ch, ref } = G; let best = Infinity, bt = 0;
  for (let i = 0; i < pl.D.length; i++) {
    const a = pl.P[i], d = pl.D[i], L = pl.S[i + 1] - pl.S[i]; const w = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const s = Math.max(0, Math.min(L, w[0] * d[0] + w[1] * d[1] + w[2] * d[2]));
    const e = [w[0] - d[0] * s, w[1] - d[1] * s, w[2] - d[2] * s], dd = e[0] * e[0] + e[1] * e[1] + e[2] * e[2]; if (dd < best) { best = dd; bt = pl.S[i] + s; }
  }
  if (bt <= 0.002 || bt >= pl.L - 0.002) return { inside: false, t: bt };
  let i = 0; while (i < ts.length - 2 && ts[i + 1] < bt) i++; const f = (bt - ts[i]) / Math.max(1e-9, ts[i + 1] - ts[i]);
  const p = ch.rings[i].map((x, k) => x + (ch.rings[i + 1][k] - x) * f);
  const O = plPoint(pl, bt), T = plTangent(pl, bt), { u, v } = frame(T, ref);
  const w = [q[0] - O[0], q[1] - O[1], q[2] - O[2]];
  const x = w[0] * u[0] + w[1] * u[1] + w[2] * u[2] - p[0], y = w[0] * v[0] + w[1] * v[1] + w[2] * v[2] - p[1];
  const r = Math.hypot(x, y), th = Math.atan2(y, x);
  return { inside: r < profR(ch.kind, p, th) * shrink, t: bt };
}
function toRest(boneName, p) { // world point -> the rest world of the bone's frame
  const b = S.char.bones[boneName]; const i = S.table.skel.names.indexOf(boneName);
  _M.copy(b.matrixWorld).invert(); const q = p.clone().applyMatrix4(_M); q.applyMatrix4(new THREE.Matrix4().fromArray(Array.from(S.char.arr.restWorld[i]))); return [q.x, q.y, q.z];
}
// a chain segment driven by one bone: inside test in that bone's rest frame, accepted only inside that segment's span
function insideSeg(G, bone, p, j0, j1, shrink = 0.9) { if (!G) return false; const r = insideChain(G, toRest(bone, p), shrink); return r.inside && r.t >= G.pl.S[j0] - 0.02 && r.t <= G.pl.S[j1] + 0.02; }
let GC = null;
function restPoseTmp() { const t = S.table; const b = S.char.bones.Head_M; const i = t.skel.names.indexOf('Head_M'); b.matrixWorld.fromArray(Array.from(S.char.arr.restWorld[i])); }
function gateFrame() {
  const c = S.char, arr = c.arr, t = S.table, mesh = c.mesh; c.root.updateMatrixWorld(true); c.skeleton.update();
  if (!GC || GC.hero !== S.hero) { GC = { hero: S.hero }; for (const n of ['trunk', 'leg_L', 'leg_R', 'arm_L', 'arm_R']) GC[n] = chainGeom(t, n); }
  const torso = (p) => insideSeg(GC.trunk, 'Root_M', p, 0, 2) || insideSeg(GC.trunk, 'Chest_M', p, 2, 3);
  const leg = (sd, p, sh) => insideSeg(GC['leg_' + sd], 'Hip_' + sd, p, 1, 2, sh) || insideSeg(GC['leg_' + sd], 'Knee_' + sd, p, 2, 3, sh);
  const upperArm = (sd, p) => insideSeg(GC['arm_' + sd], 'Shoulder_' + sd, p, 1, 2);
  const head = c.bones.Head_M; if (!c.headLocal) { c.root.updateMatrixWorld(true); const bw = head.matrixWorld.clone(); restPoseTmp(); c.headLocal = head.worldToLocal(new THREE.Vector3().fromArray(t.head.center)); head.matrixWorld.copy(bw); } const hc = head.localToWorld(c.headLocal.clone());
  const iH = t.skel.names.indexOf('Head_M'); const restHead = new THREE.Matrix4().fromArray(Array.from(arr.restWorld[iH]));
  const qRest = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(restHead)), qNow = head.getWorldQuaternion(new THREE.Quaternion());
  const qInv = qNow.clone().multiply(qRest.clone().invert()).invert();
  const shR = (d) => { const B = shBasis(t.head.L, d.x, d.y, d.z); let r = 0; for (let k = 0; k < B.length; k++) r += t.head.coef[k] * B[k]; return r; };
  let browY = Infinity; for (const e of t.face.eyes) { const ir = e.iris || e.line; if (ir) browY = Math.min(browY, ir.c[1] + ir.h * 0.75); }
  const counts = { armTorso: 0, thighThigh: 0, handHip: 0, hairFace: 0, hairBody: 0, clothLeg: 0, skirtPoke: 0 };
  // skinned closed-skirt vertices (trunk rings below the crotch) with an outward direction from their ring centre;
  // a leg vertex is poking through when it lies more than 6 mm outside the skirt surface at the nearest skirt vertex
  const tr = arr.chains.find((x) => x.name === 'trunk'), trunkT = t.chains.find((x) => x.name === 'trunk'); const sk = [];
  if (tr && trunkT && trunkT.ext[0] > 0.095) {
    const rows = tr.starts.map((s0, ri) => [s0, ri]).filter(([, ri]) => tr.ringT[ri] < tr.tRoot - 0.08);
    rows.forEach(([s0, ri], k) => {
      if (k < 3) return; // the hem rings: legs below them are simply below the skirt
      const pts = []; const c = new THREE.Vector3();
      for (let a2 = 0; a2 < tr.S; a2++) { const q = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, s0 + a2); mesh.applyBoneTransform(s0 + a2, q); pts.push(q); c.add(q); }
      c.multiplyScalar(1 / tr.S); for (const q of pts) sk.push({ q, out: q.clone().sub(c).setY(0).normalize() });
    });
  }
  const skirtPoke = (P) => { let best = Infinity, bi = null; for (const e of sk) { const d = e.q.distanceToSquared(P); if (d < best) { best = d; bi = e; } } if (!bi || best > 0.05 * 0.05) return false; return _v.subVectors(P, bi.q).dot(bi.out) > 0.006; };
  const polyDist = (x, z, poly) => { let b = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[j], [bx, bz] = poly[i]; const ex = bx - ax, ez = bz - az; const f = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); b = Math.min(b, Math.hypot(x - ax - ex * f, z - az - ez * f)); } return b; };
  const nv = arr.position.length / 3, pn = arr.partNames;
  for (let i = 0; i < nv; i++) {
    const name = pn[arr.part[i]], tf = arr.tfrac[i];
    const isArm = name.startsWith('arm_'), isLeg = name.startsWith('leg_'), isHand = name.startsWith('palm_') || /^(thumb|index|middle|ring|pinky)_/.test(name);
    const isHair = name.startsWith('hair'), isCloth = name.startsWith('cloth');
    if (!(isArm || isLeg || isHand || isHair || isCloth)) continue;
    if (isArm && tf < 0.45) continue; if (isLeg && tf < 0.3) continue; if (isHair && tf < 0.25) continue; if (isCloth && tf < 0.12) continue;
    _p.fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.applyBoneTransform(i, _p); const P = _p.clone();
    if (isArm && torso(P)) counts.armTorso++;
    if (isLeg) {
      const sd = name.endsWith('_L') ? 'R' : 'L'; if (leg(sd, P)) counts.thighThigh++;
      if (sk.length && skirtPoke(P)) counts.skirtPoke++;
    }
    if (isHand && (insideSeg(GC.trunk, 'Root_M', P, 0, 2) || leg('L', P) || leg('R', P))) counts.handHip++;
    if (isHair) {
      const d = _v.subVectors(P, hc); const r = d.length(); d.normalize().applyQuaternion(qInv);
      const front = d.z > 0.3 && (t.head.center[1] + d.y * r) < browY;
      if (front && r < shR(d) * 0.97) counts.hairFace++; else if (torso(P) || upperArm('L', P) || upperArm('R', P)) counts.hairBody++;
    }
    if (isCloth && (leg('L', P, 0.85) || leg('R', P, 0.85) || torso(P))) counts.clothLeg++;
  }
  return counts;
}
async function runGates(clipNames, samples = 30) {
  const out = {};
  setClip('bind'); S.char.root.updateMatrixWorld(true); out.bind = { worst: gateFrame(), frames: {} };
  for (const cn of clipNames) {
    const clip = S.clips[cn]; if (!clip) continue; setClip(cn); const dt = 1 / 60, T = clip.duration;
    const worst = {}; let frames = {}; let tnow = 0; const next = [];
    for (let k = 0; k < samples; k++) next.push((k + 0.5) / samples * T + T); // second loop: springs warmed up
    S.mixer.setTime(0); S.char.springs && S.char.springs.reset();
    for (const ts of next) { while (tnow + dt <= ts) { S.mixer.update(dt); S.char.springs && S.char.springs.step(dt); tnow += dt; }
      const c = gateFrame(); for (const [k, v] of Object.entries(c)) { worst[k] = Math.max(worst[k] || 0, v); if (v > 0) frames[k] = (frames[k] || 0) + 1; } }
    out[cn] = { worst, frames };
  }
  setClip('idle');
  return out;
}
async function poseAt(cn, time) { setClip(cn); if (cn === 'bind') { renderer.render(scene, camera); return; } const dt = 1 / 60; S.mixer.setTime(0); S.char.springs && S.char.springs.reset(); let t = 0; while (t + dt <= time) { S.mixer.update(dt); S.char.springs && S.char.springs.step(dt); t += dt; } renderer.render(scene, camera); }
function snap() { return canvas.toDataURL('image/png'); }
window.T = { loadHero, setClip, runGates, poseAt, snap, camPreset, orbit, applyOrbit, renderer, scene, camera, S, setMode, resize, rebuildSpace,
  setView(v) { const yaw = { front: 0, side: Math.PI / 2, q34: 0.75, back: Math.PI }[v] ?? v; orbit.yaw = yaw; applyOrbit(); } };

// ---------- boot ----------
document.body.classList.toggle('noref', !S.ref); document.body.classList.toggle('bare', params.has('bare'));
buildUI(); applyOrbit(); resize();
fetch('./data/metrics.json').then((r) => (r.ok ? r.json() : null)).then((m) => { S.metrics = m; if (S.hero) updatePanels(); }).catch(() => {});
await loadHero(params.get('hero') || HEROES[0]);
if (params.get('mode')) await setMode(params.get('mode'));
if (!TEST) loop(); else renderer.render(scene, camera);
window.__ready = true;
