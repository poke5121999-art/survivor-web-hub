// Xưởng Tạo Nhân Vật: pick a base hero, wear parts from other heroes of the same skeleton family, recolour each part.
import * as THREE from './vendor/three.module.min.js';
import { decodeHero, assemble, setRecolor, rgb2hex } from './lib/embed-loader.js';

const REV = '20261116a';
const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const status = (s) => { $('status').textContent = s; };
const SLOT_VI = { hair: 'Tóc', top: 'Áo', bottom: 'Váy / quần', underwear: 'Đồ lót', boots: 'Giày', gloves: 'Găng / ống tay', legwear: 'Ống chân', hat: 'Mũ', ears: 'Tai', back: 'Sau lưng', glasses: 'Kính', hairpin: 'Kẹp tóc', horns: 'Sừng', ornament: 'Đồ cài tóc', body: 'Thân (da)', eyes: 'Mắt' };
const CORE = ['skin', 'eyes', 'hair'];
const CORE_VI = { skin: 'Da', eyes: 'Mống mắt', hair: 'Tóc' };
const SWAP = ['hair', 'eyes', 'body', 'top', 'bottom', 'underwear', 'boots', 'gloves', 'legwear', 'hat', 'ears', 'back', 'glasses', 'hairpin', 'horns', 'ornament'];
const MUST = new Set(['hair', 'eyes', 'body']);
// reiko, umi and yuuka have their skin cut away under their own clothes: only full bodies are offered as donors, and a
// cut-body base switches to a full body as soon as one of its own clothes is swapped or removed
const CUT_BODY = new Set(['reiko', 'umi', 'yuuka']);
const bodyOf = (l) => { if (l.wear.body) return l.wear.body; if (!CUT_BODY.has(l.base)) return l.base; return ['top', 'bottom', 'boots', 'underwear'].some((s) => l.wear[s] !== undefined) ? 'matsuko' : l.base; };
const CLIP_VI = { idle: 'Đứng', idle2: 'Thủ thế', run: 'Chạy', attack: 'Đá', combo: 'Combo', hit: 'Trúng đòn', die: 'Ngã' };
const SKIN = ['#fde3d3', '#f6cdb5', '#e8b38f', '#c98d68', '#9a6447', '#6b4330', '#d9e6f2', '#b7d6a8'];
const PRESETS = {
  'Gốc': {},
  'Đêm xanh': { hair: '#2c3e78', top: '#1f2a4d', bottom: '#2b2f45', boots: '#1a1d2c', eyes: '#59d0ff', underwear: '#2c3e78', gloves: '#1f2a4d', hat: '#1f2a4d', back: '#3a4e9a' },
  'Hoa anh đào': { hair: '#f2a7c3', top: '#ffd1e0', bottom: '#f7b6cd', boots: '#e98aa9', eyes: '#d0457a', underwear: '#ffc0d4', hat: '#ffd1e0', back: '#f2a7c3' },
  'Rừng': { hair: '#5b7a3a', top: '#3f6b3a', bottom: '#5e4a2e', boots: '#4a3622', eyes: '#88c34a', gloves: '#5e4a2e', hat: '#3f6b3a', underwear: '#3f6b3a' },
  'Tuyết': { hair: '#eef3f8', top: '#d8e6f3', bottom: '#c7d8ea', boots: '#b9cde2', eyes: '#7fb8e8', skin: '#fde9de', underwear: '#d8e6f3', hat: '#d8e6f3' },
  'Hoàng kim': { hair: '#f2c94c', top: '#b8860b', bottom: '#7a1f1f', boots: '#5a1717', eyes: '#f2994a', gloves: '#b8860b', hat: '#7a1f1f', back: '#b8860b' },
};

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, preserveDrawingBuffer: Q.has('test') });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1ece2);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a890, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1.5, 3, 2.5); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 48), new THREE.MeshBasicMaterial({ color: 0xe2d9c8 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const orbit = { yaw: 0.35, pitch: 0.08, dist: 3.6, target: new THREE.Vector3(0, 0.72, 0) };
function placeCam() { const c = Math.cos(orbit.pitch); camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * c * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * c * orbit.dist); camera.lookAt(orbit.target); }
const CAMS = { full: { yaw: 0.35, pitch: 0.08, dist: 3.6, y: 0.72 }, face: { yaw: 0.2, pitch: 0.02, dist: 0.95, y: 1.2 }, back: { yaw: Math.PI - 0.35, pitch: 0.1, dist: 3.4, y: 0.75 } };
function setCam(k) { const c = CAMS[k]; Object.assign(orbit, { yaw: c.yaw, pitch: c.pitch, dist: c.dist }); orbit.target.y = c.y; placeCam(); }
{ // pointer orbit + wheel / pinch zoom
  const el = renderer.domElement, pts = new Map(); let pinch = 0;
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
  el.addEventListener('pointerup', (e) => { pts.delete(e.pointerId); pinch = 0; });
  el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; const [x0, y0] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { orbit.yaw -= (e.clientX - x0) * 0.008; orbit.pitch = Math.max(-0.6, Math.min(1.2, orbit.pitch + (e.clientY - y0) * 0.006)); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(pinch / d); pinch = d; }
    placeCam();
  });
  const zoom = (f) => { orbit.dist = Math.max(0.5, Math.min(7, orbit.dist * f)); orbit.target.y = 0.72 + (1.2 - 0.72) * Math.max(0, Math.min(1, (3.6 - orbit.dist) / 2.6)); placeCam(); };
  el.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
}
function resize() { const r = $('stage').getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---- hero modules (lazy) ----
let MF = {}; const decoded = {}; const settled = {}; const stats = (window.__stats = {});
async function hero(h) {
  if (decoded[h]) return decoded[h];
  return (decoded[h] = (async () => {
    status(`Đang tải ${h}…`); const t0 = performance.now();
    const E = (await import(`./heroes/${h}.js?v=${REV}`)).default; const t1 = performance.now();
    const H = await decodeHero(E); settled[h] = H; stats[h] = { importMs: Math.round(t1 - t0), decodeMs: Math.round(H.ms), totalMs: Math.round(performance.now() - t0) };
    return H;
  })());
}
const family = (h) => MF[h].family;
const sameFamily = (h) => Object.keys(MF).filter((x) => family(x) === family(h));

// ---- look state ----
const blank = (base) => ({ base, wear: {}, col: {}, clip: 'idle' });
let look = blank('matsuko');
let cur = null, mixer = null, action = null, paused = false, building = 0;
const clock = new THREE.Clock();

async function build() {
  const my = ++building; const t0 = performance.now();
  const B = await hero(look.base);
  const srcs = new Set([look.base, bodyOf(look)]); for (const s of SWAP) { const w = look.wear[s]; if (w) srcs.add(w); }
  const H = {}; for (const h of srcs) H[h] = await hero(h);
  if (my !== building) return;
  const wear = [];
  for (const P of B.parts) if (P.def.slot === 'face') wear.push([B, P]);
  for (const s of SWAP) {
    const w = s === 'body' ? bodyOf(look) : look.wear[s] === undefined ? look.base : look.wear[s]; if (!w) continue;
    for (const P of H[w].parts) if (P.def.slot === s) wear.push([H[w], P]);
  }
  if (cur) { scene.remove(cur.group); cur.group.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
  cur = assemble(B, wear); scene.add(cur.group);
  mixer = new THREE.AnimationMixer(cur.group);
  playClip(look.clip, B);
  applyColors();
  $('baseName').textContent = look.base;
  status(''); stats.lastBuildMs = Math.round(performance.now() - t0);
  renderPanels(B, H);
  window.__ready = true;
}
function playClip(k, B) {
  B = B || settled[look.base]; const clips = B && B.clips; if (!clips || !mixer) return;
  if (!clips[k]) k = 'idle'; look.clip = k;
  if (action) action.stop(); action = mixer.clipAction(clips[k]); action.play();
  if (k === 'die') { action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; }
  document.querySelectorAll('#clips button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
}
function applyColors() {
  if (!cur) return;
  for (const m of cur.meshes) setRecolor(m.material, m.userData.group ? look.col[m.userData.group] : null);
}

// ---- panels ----
function renderHeroes() {
  $('heroes').innerHTML = '';
  for (const h of Object.keys(MF)) {
    const b = document.createElement('button'); b.innerHTML = `${h}<small>${MF[h].family === 'kaoru' ? 'Kaoru' : 'chỉ đổi màu'} · ${(MF[h].bytes / 1e6).toFixed(1)} MB</small>`;
    b.classList.toggle('on', h === look.base); b.onclick = () => { look = blank(h); renderHeroes(); build(); };
    $('heroes').appendChild(b);
  }
}
function domOf(H, slot) { const P = H && H.parts.find((p) => p.def.slot === slot && p.def.dom); return P ? rgb2hex(P.def.dom) : '#888888'; }
function colorRow(parent, key, label, defHex) {
  const r = document.createElement('div'); r.className = 'slot';
  r.innerHTML = `<label>${label}</label><span></span><input type="color" value="${look.col[key] || defHex}"><button class="reset" title="Màu gốc">↺</button>`;
  const inp = r.querySelector('input'); inp.oninput = () => { look.col[key] = inp.value; applyColors(); };
  r.querySelector('.reset').onclick = () => { delete look.col[key]; inp.value = defHex; applyColors(); };
  parent.appendChild(r); return r;
}
function renderPanels(B, H) {
  const kaoru = family(look.base) === 'kaoru';
  const src = (s) => { const w = look.wear[s] === undefined ? look.base : look.wear[s]; return w ? H[w] : null; };
  $('core').innerHTML = '';
  for (const k of CORE) colorRow($('core'), k, CORE_VI[k], domOf(src(k === 'skin' ? 'body' : k) || B, k === 'skin' ? 'body' : k));
  $('slots').innerHTML = '';
  for (const s of SWAP) {
    if (s === 'eyes' || s === 'hair' || s === 'body') { if (!kaoru) continue; }
    const owners = (kaoru ? sameFamily(look.base) : [look.base]).filter((h) => MF[h].slots[s] && (s !== 'body' || !CUT_BODY.has(h) || h === look.base));
    if (!owners.length) continue;
    const r = document.createElement('div'); r.className = 'slot';
    const cw0 = s === 'body' ? bodyOf(look) : look.wear[s] === undefined ? look.base : look.wear[s], cw = owners.includes(cw0) ? cw0 : '';
    const opts = owners.map((h) => `<option value="${h}"${h === cw ? ' selected' : ''}>${h}${h === look.base ? ' (gốc)' : ''}</option>`).join('') + (MUST.has(s) ? '' : `<option value=""${!cw ? ' selected' : ''}>— không —</option>`);
    const recol = !CORE.includes(s) && s !== 'body';
    r.innerHTML = `<label>${SLOT_VI[s] || s}</label><select ${owners.length < 2 && MUST.has(s) ? 'disabled' : ''}>${opts}</select>` + (recol ? `<input type="color" value="${look.col[s] || domOf(src(s), s)}"><button class="reset" title="Màu gốc">↺</button>` : '<span></span><span></span>');
    r.querySelector('select').onchange = (e) => { const v = e.target.value; if (v === look.base) delete look.wear[s]; else look.wear[s] = v; build(); };
    if (recol) { const inp = r.querySelector('input'); inp.oninput = () => { look.col[s] = inp.value; applyColors(); }; r.querySelector('.reset').onclick = () => { delete look.col[s]; inp.value = domOf(src(s), s); applyColors(); }; }
    $('slots').appendChild(r);
  }
  $('clips').innerHTML = '';
  for (const k of Object.keys(B.clips)) { const b = document.createElement('button'); b.textContent = CLIP_VI[k] || k; b.dataset.k = k; b.classList.toggle('on', k === look.clip); b.onclick = () => playClip(k, B); $('clips').appendChild(b); }
}

// ---- randomize / presets / save ----
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const hsl = (h, s, l) => rgb2hex(new THREE.Color().setHSL(h, s, l).toArray());
function randomize() {
  const kaoru = family(look.base) === 'kaoru'; const fam = sameFamily(look.base);
  look.wear = {}; look.col = {};
  if (kaoru) for (const s of SWAP) {
    const owners = fam.filter((h) => MF[h].slots[s] && (s !== 'body' || !CUT_BODY.has(h))); if (!owners.length) continue;
    const pick = !MUST.has(s) && s !== 'top' && Math.random() < 0.45 ? '' : rnd(owners);
    if (pick !== look.base) look.wear[s] = pick;
  }
  const base = Math.random();
  for (const k of ['hair', 'top', 'bottom', 'boots', 'gloves', 'legwear', 'hat', 'back', 'underwear', 'ears']) if (Math.random() < 0.7) look.col[k] = hsl((base + Math.random() * 0.35) % 1, 0.35 + Math.random() * 0.5, 0.25 + Math.random() * 0.5);
  if (Math.random() < 0.6) look.col.eyes = hsl(Math.random(), 0.7, 0.5);
  if (Math.random() < 0.3) look.col.skin = rnd(SKIN);
  build();
}
const encode = (l) => btoa(unescape(encodeURIComponent(JSON.stringify(l))));
const decode = (s) => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));
const LS = 'xtnv.looks.v1';
const readLooks = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const writeLooks = (a) => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch {} };
function renderLooks() {
  $('looks').innerHTML = '';
  readLooks().forEach((L, i) => {
    const r = document.createElement('div'); r.className = 'look';
    r.innerHTML = `<span>${(L.name || L.look.base).replace(/[<>&]/g, '')}</span><button>Mở</button><button title="Xoá">✕</button>`;
    const [open, del] = r.querySelectorAll('button');
    open.onclick = () => loadLook(L.look); del.onclick = () => { const a = readLooks(); a.splice(i, 1); writeLooks(a); renderLooks(); };
    $('looks').appendChild(r);
  });
}
function loadLook(l) {
  if (!l || !MF[l.base]) { status('Mã không hợp lệ'); return; }
  look = { ...blank(l.base), ...l, wear: { ...(l.wear || {}) }, col: { ...(l.col || {}) } };
  for (const [s, h] of Object.entries(look.wear)) if (h && (!MF[h] || family(h) !== family(look.base) || (s === 'body' && CUT_BODY.has(h) && h !== look.base))) delete look.wear[s];
  renderHeroes(); build();
}

$('random').onclick = randomize;
$('resetAll').onclick = () => { look = blank(look.base); build(); };
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '▶ Chạy' : '⏸ Dừng'; };
document.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => setCam(b.dataset.cam)));
for (const [name, p] of Object.entries(PRESETS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => { look.col = { ...p }; build(); }; $('presets').appendChild(b); }
for (const c of SKIN) { const b = document.createElement('button'); b.style.background = c; b.title = c; b.onclick = () => { look.col.skin = c; applyColors(); renderPanels(settled[look.base], settled); }; $('skinSw').appendChild(b); }
$('save').onclick = () => { const a = readLooks(); a.unshift({ name: $('lookName').value || '', look: JSON.parse(JSON.stringify(look)) }); writeLooks(a.slice(0, 30)); renderLooks(); status('Đã lưu'); setTimeout(() => status(''), 1200); };
$('copy').onclick = async () => { const code = encode(look); try { await navigator.clipboard.writeText(code); status('Đã chép mã vào bộ nhớ tạm'); } catch { prompt('Mã kiểu nhân vật:', code); } setTimeout(() => status(''), 1500); };
$('paste').onclick = () => { const s = prompt('Dán mã kiểu nhân vật:'); if (!s) return; try { loadLook(decode(s)); } catch { status('Mã không hợp lệ'); } };

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (mixer && !paused) mixer.update(dt);
  renderer.render(scene, camera);
}

window.__api = { get look() { return look; }, loadLook, randomize, setCam, encode, decode, playClip: (k) => playClip(k, settled[look.base]), pause: (v) => { paused = v; }, seek: (t) => { if (action) { action.time = t; mixer.update(0); } } };

(async () => {
  resize(); setCam('full');
  MF = await (await fetch(`./heroes/manifest.json?v=${REV}`)).json();
  const start = Q.get('look'); let l0 = null; try { if (start) l0 = decode(start); } catch {}
  look = l0 && MF[l0.base] ? { ...blank(l0.base), ...l0 } : blank(Q.get('base') && MF[Q.get('base')] ? Q.get('base') : 'matsuko');
  renderHeroes(); renderLooks();
  await build();
  tick();
})();
