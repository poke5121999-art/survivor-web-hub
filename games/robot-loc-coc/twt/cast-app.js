// Cast page for the twt robots (../twt.html): every role and zombie kind, animation and emote chips, a crowd test
// (40 robots + 30 zombie robots, fps and draw calls) and a raid test (zombies walking at a first-person camera, two
// guards, deaths leave corpses). Everything is driven through people-robots.js with desc objects shaped like the twt
// rules layer's (people-test.html in twt-proc does the same for people.js), so the page also checks the adapter.
import * as THREE from '../vendor/three.module.min.js';
import { createPeople } from './people-robots.js';
import { CrewModes, ANIMS as CREW_ANIMS, CREW_ANIM_VI } from './crew-modes.js';
import { CombatModes, W_ACTS, W_ACT_VI, Z_MOVES, Z_MOVE_VI, W_PICK, W_PICK_VI } from './combat-modes.js';

const Q = new URLSearchParams(location.search);
if (Q.get('ui') === '0') document.body.classList.add('noui');
const cv = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, +(Q.get('pr') || 1.5)));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x12151c); scene.fog = new THREE.Fog(0x12151c, 30, 90);
const camera = new THREE.PerspectiveCamera(38, 1, 0.08, 200);

// environment: dim warehouse box with bright panels (as the crew page)
{
  const es = new THREE.Scene(), bm = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
  es.add(new THREE.Mesh(new THREE.BoxGeometry(24, 10, 24), bm(new THREE.Color(0.05, 0.055, 0.07))));
  const panel = (c, p, s, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(...s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...p); m.rotation.set(...r); es.add(m); };
  panel(new THREE.Color(6, 4.6, 3.2), [-3, 4.9, 2], [6, 2], [Math.PI / 2, 0, 0]);
  panel(new THREE.Color(1.2, 1.8, 3.2), [11.9, 2.5, -2], [5, 3], [0, -Math.PI / 2, 0]);
  panel(new THREE.Color(2.5, 2.2, 2), [0, 3, -11.9], [8, 2], [0, 0, 0]);
  panel(new THREE.Color(0.25, 0.2, 0.16), [0, -4.9, 0], [24, 24], [Math.PI / 2, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
}
const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x3b3128, 0.55); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe0bc, 2.6); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; key.shadow.radius = 3;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x86a8ff, 1.4); rim.position.set(6, 5, -9); scene.add(rim);
const raidLight = new THREE.PointLight(0xff4030, 0, 30, 1.6); raidLight.position.set(0, 4, -12); scene.add(raidLight);
function shadowBox(cx, cz, half) { const c = key.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 0.5; c.far = 80; c.updateProjectionMatrix(); key.target.position.set(cx, 0, cz); key.position.set(cx - 8, 16, cz + 10); }

function floorTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512), d = img.data; let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n + 1; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${20 + rnd() * 20},${18 + rnd() * 15},15,${0.05 + rnd() * 0.08})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, 10 + rnd() * 50, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(15,15,18,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.lineWidth = 1.5; g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.82, metalness: 0.05 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// shop shelves and a door frame for scale in the crowd and raid views
const set = new THREE.Group(); scene.add(set);
{
  const shelfM = new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6, metalness: 0.4 }), boxM = [0xc24a3a, 0xe3b23c, 0x3f7fbf, 0x5f9a4a, 0xece7db].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * (4 + r * 3.2), 0, -6);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 5), shelfM); frame.position.y = 0.95; frame.castShadow = frame.receiveShadow = true; g.add(frame);
    for (let k = 0; k < 18; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 0.35), boxM[(k + r) % 5]); b.position.set((k % 2 ? 0.32 : -0.32), 0.45 + (Math.floor(k / 6) * 0.55), -2.1 + (k % 6) * 0.8); b.castShadow = true; g.add(b); }
    set.add(g);
  }
}

// ---------------------------------------------------------------- people + fake rules layer
const people = createPeople({ scene, camera, renderer, quality: { name: 'high' } });
const crew = new CrewModes(scene);
const combat = new CombatModes({ people, fx: people.crowd.fx, scene });
const arenaRing = new THREE.Group(); scene.add(arenaRing);
{ const m = new THREE.Mesh(new THREE.RingGeometry(11.6, 12, 64), new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.6 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.005; arenaRing.add(m);
  const pm = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 8), pm); p.position.set(Math.cos(a) * 12.3, 0.45, Math.sin(a) * 12.3); p.castShadow = true; arenaRing.add(p); }
  arenaRing.visible = false; }
const V = (x, y, z) => ({ x, y, z, clone() { return V(this.x, this.y, this.z); } });
const ROLE_VI = { customer: 'Khách mua', staff: 'Nhân viên', security: 'Bảo vệ', candidate: 'Ứng viên', crew: 'Thợ xây', survivor: 'Người sống sót', scavenger: 'Kẻ nhặt đồ', merchant: 'Thương nhân', helper: 'Stompy (Hulk hiền)' };
const KIND_VI = { Base: 'Zombie thường', Tumour: 'Zombie u bướu', Hulk: 'Hulk', Brute: 'Brute (trùm)', Birther: 'Birther (đẻ con)', Baby: 'Zombie con', Sweaty: 'Sweaty (trùm mập)', TwinBuff: 'Chị song sinh', TwinHeal: 'Em song sinh' };
const H_ANIMS = ['idle', 'walk', 'run', 'browse', 'reach', 'pay', 'basket', 'hurt', 'swing', 'crate', 'cheer', 'listen', 'ready', 'collapse', 'hit'];
const Z_ANIMS = ['idle', 'walk', 'chase', 'attack', 'hit', 'death', 'slam', 'throw', 'jump', 'roar', 'ko'];
const ANIM_VI = { idle: 'Đứng yên', walk: 'Đi bộ', run: 'Chạy trốn', browse: 'Xem hàng', reach: 'Với lấy hàng', pay: 'Trả tiền', basket: 'Xách giỏ', hurt: 'Bị thương', swing: 'Vung gậy / búa', crate: 'Bê thùng', cheer: 'Reo hò', listen: 'Nghe ngóng', ready: 'Thủ thế', collapse: 'Ngã quỵ', hit: 'Trúng đòn', chase: 'Đuổi theo', attack: 'Cào', death: 'Chết, rã xác', slam: 'Đập đất', throw: 'Ném tảng', jump: 'Nhảy dậm', roar: 'Gầm', ko: 'Bất tỉnh' };
const EMO_VI = { auto: 'Tự động', neutral: 'Bình thường', happy: 'Vui', scared: 'Sợ', angry: 'Giận', dizzy: 'Choáng', sleepy: 'Buồn ngủ', love: 'Yêu', dead: 'Chết X', sad: 'Buồn', strain: 'Gồng sức' };
const CINE = { crate: 'CARRY', cheer: 'CHEER', listen: 'LISTEN', ready: 'READY', collapse: 'COLLAPSE' };

let actors = [], mode = 'roles', anim = 'idle', emote = 'auto', T = 0;
const SETS = {
  roles: () => [
    ...[0, 3, 6, 9, 12, 15].map((s) => ({ seed: s, kind: null, opts: { role: 'customer' }, label: ROLE_VI.customer })),
    { seed: 2, kind: null, opts: { role: 'staff' }, label: ROLE_VI.staff, job: 1 }, { seed: 7, kind: null, opts: { role: 'staff' }, label: ROLE_VI.security, job: 3 }, { seed: 11, kind: null, opts: { role: 'staff' }, label: ROLE_VI.staff, job: 2 },
    { seed: 5, kind: null, opts: { role: 'staff', hired: false }, label: ROLE_VI.candidate },
    { seed: 0, kind: null, opts: { role: 'crew' }, label: ROLE_VI.crew }, { seed: 3, kind: null, opts: { role: 'crew' }, label: ROLE_VI.crew },
    { seed: 0x51a7c0de, kind: null, opts: { role: 'survivor' }, label: ROLE_VI.survivor }, { seed: 0x0bad5eed, kind: null, opts: { role: 'scavenger' }, label: ROLE_VI.scavenger }, { seed: 1, kind: null, opts: { role: 'merchant' }, label: ROLE_VI.merchant },
  ],
  looks: () => Array.from({ length: 16 }, (_, i) => ({ seed: i, kind: null, opts: { role: 'customer' }, label: 'Khách #' + i })),
  staff: () => Array.from({ length: 16 }, (_, i) => ({ seed: i, kind: null, opts: { role: 'staff' }, label: (i % 4 === 1 ? ROLE_VI.security : ROLE_VI.staff) + ' #' + i, job: i % 4 === 1 ? 3 : 1 })),
  zombies: () => [
    ...[3, 8, 14, 21].map((s) => ({ seed: s * 977, kind: 'Base', label: KIND_VI.Base })), { seed: 51, kind: 'Tumour', label: KIND_VI.Tumour }, { seed: 77, kind: 'Baby', label: KIND_VI.Baby }, { seed: 78, kind: 'Baby', label: KIND_VI.Baby },
    { seed: 1, kind: 'TwinBuff', label: KIND_VI.TwinBuff }, { seed: 1, kind: 'TwinHeal', label: KIND_VI.TwinHeal },
    { seed: 2, kind: 'Hulk', label: KIND_VI.Hulk }, { seed: 0x57a9, kind: 'Hulk', opts: { role: 'helper' }, label: ROLE_VI.helper }, { seed: 1, kind: 'Birther', label: KIND_VI.Birther }, { seed: 1, kind: 'Brute', label: KIND_VI.Brute }, { seed: 1, kind: 'Sweaty', label: KIND_VI.Sweaty },
  ],
};
function spawnActor(e, x, z, yaw) {
  const opts = Object.assign({}, e.opts || {}); if (!e.kind && CINE[anim] && mode !== 'crowd' && mode !== 'raid') opts.cine = true;
  const p = people.spawn(e.seed, e.kind || null, V(x, 0, z), opts);
  if (emote !== 'auto') p.setEmote(emote);
  return { e, p, x, z, x0: x, z0: z, yaw, phase: Math.random() * 6, wind: 0.5, stagger: 0.3, dying: 0, timer: 3, pay_t: 0.9, act: 0, act_t: 0, air: 5, special: 20, swing: 0.45, k: 0, rest: 0.01, t: 0, hp: 100 };
}
function clear() { for (const A of actors) A.p.despawn(); actors = []; for (const c of corpses) { scene.remove(c.f); c.f.userData.dispose(); } corpses = []; }
function lineup() {
  clear(); T = 0;
  const list = SETS[mode](), portrait = innerWidth / innerHeight < 0.85;
  let rows = mode === 'looks' || mode === 'staff' || mode === 'zombies' ? 2 : 1, per = mode === 'zombies' ? 9 : Math.ceil(list.length / rows);
  if (portrait) { per = mode === 'zombies' ? 3 : 4; rows = Math.ceil(list.length / per); }
  list.forEach((e, i) => {
    const r = Math.floor(i / per), c = i % per, big = e.kind && /Hulk|Brute|Sweaty|Birther/.test(e.kind) ? (e.kind === 'Brute' || e.kind === 'Sweaty' ? 2.6 : 1.7) : 1;
    actors.push(Object.assign(spawnActor(e, 0, -r * (mode === 'zombies' ? 4.5 : 2.6), Math.PI), { big, row: r, col: c }));
  });
  // lay out by width so the bosses get room
  for (let r = 0; r < rows; r++) { const rowA = actors.filter((A) => A.row === r); let w = 0; for (const A of rowA) w += 1.25 * A.big; let x = -w / 2; for (const A of rowA) { A.x = A.x0 = x + 0.625 * A.big; x += 1.25 * A.big; } }
  frameLineup(true);
}

// desc for one actor (fields as the twt sim writes them)
function descOf(A, dt) {
  const zombie = !!A.e.kind, d = { pos: V(A.x, 0, A.z), yaw: A.yaw, moving: false, phase: A.phase, seed: A.e.seed };
  A.t += dt;
  const walkLike = zombie ? { walk: 1.3, chase: 4.0 } : { walk: 1.5, run: 3.4, hurt: 1.1, basket: 1.5, crate: 1.2 };
  let speed = walkLike[anim] || 0;
  if (zombie && (A.e.kind === 'Hulk' || A.e.kind === 'Brute')) speed *= anim === 'chase' ? 0.8 : 0.75;
  if (zombie && A.e.kind === 'Baby') speed *= 0.8;
  if (speed) { A.yaw = -Math.PI / 2; A.x += speed * dt; d.moving = true; A.phase += dt * (zombie ? speed * 2.6 : 7.5); }
  else A.yaw = Math.PI;
  d.pos = V(A.x, 0, A.z); d.yaw = A.yaw; d.phase = A.phase;
  if (!zombie) {
    Object.assign(d, { state: 'Walk', goal: 'Buy', timer: 0, pay_t: 0, basket: false });
    if (anim === 'idle' || anim === 'ready') d.state = 'Queue';
    if (anim === 'browse') { d.state = 'Look'; A.timer -= dt; if (A.timer < 0) A.timer = 3.2; d.timer = A.timer; }
    if (anim === 'reach') { d.state = 'Look'; A.timer -= dt; if (A.timer < -0.6) A.timer = 0.55; d.timer = Math.max(0, A.timer); }
    if (anim === 'pay') { A.pay_t -= dt; if (A.pay_t < -0.6) A.pay_t = 0.9; d.pay_t = Math.max(0, A.pay_t); }
    if (anim === 'hurt') d.goal = 'Medical';
    if (anim === 'basket') d.basket = true;
    const role = A.e.opts && A.e.opts.role;
    if (role === 'staff') { d.job = A.e.job !== undefined ? A.e.job : 1; d.swing = 0; d.visible = true; if (anim === 'swing') { if (A.e.job !== 3) d.job = 3; A.swing -= dt; if (A.swing < -0.9) A.swing = 0.45; d.swing = Math.max(0, A.swing); } }
    if (role === 'crew') { A.swing -= dt; if (A.swing < -0.9) A.swing = 0.45; d.swing = anim === 'swing' ? Math.max(0, A.swing) : 0; }
    if (CINE[anim]) { d.act_name = CINE[anim]; A.k = (A.k + dt / 2.5) % 1.6; d.k = Math.min(1, A.k); d.fall = d.act_name === 'COLLAPSE' ? Math.min(A.k * 1.5, 1) * (A.k < 1.3 ? 1 : Math.max(0, 1 - (A.k - 1.3) * 4)) : 0; if (A.k > 1.3) d.act_name = 'RISE'; }
    if (anim === 'hit') { A.stagger -= dt; if (A.stagger < -0.9) { A.stagger = 0.3; A.p.body.stagger(1); } }
  } else {
    Object.assign(d, { kind: A.e.kind, wind: 0, stagger: 0, dying: 0, chasing: anim === 'chase', act: 0, act_t: 0, air: 0, special: A.special, hp: A.hp, hp_max: 100 });
    const body = A.p.body, k = A.e.kind;
    if (anim === 'attack') { A.wind -= dt; if (A.wind < -0.9) A.wind = 0.5; d.wind = Math.max(0, A.wind); }
    if (anim === 'hit') { A.stagger -= dt; if (A.stagger < -0.9) { A.stagger = 0.3; A.hp = A.hp > 30 ? A.hp - 20 : 100; } d.stagger = Math.max(0, A.stagger); d.hp = A.hp; }
    if (anim === 'death') { A.dying = Math.min(0.55, A.dying + dt); d.dying = A.dying; d.fall = A.dying / 0.55; d.pos = V(A.x, d.fall * 0.1, A.z); if (A.t > 4.5) A.reset = true; }
    if ((anim === 'slam' || anim === 'throw') && k === 'Brute') { if (A.act === 0) { A.rest = (A.rest || 0) - dt; if (A.rest <= 0) { A.act = anim === 'slam' ? 1 : 2; A.act_t = A.act === 1 ? 2.0 : 2.33; } } else { A.act_t -= dt; if (A.act_t <= 0) { A.act = 0; A.rest = 1.5; } } d.act = A.act; d.act_t = A.act_t; }
    else if (anim === 'slam' || anim === 'throw') { A.k = (A.k + dt / 2.2) % 1; A.p.preview = [anim, Math.min(1, A.k * 1.15)]; }
    if (anim === 'jump' && k === 'Sweaty') { A.air -= dt; if (A.air < -1.5) A.air = 5; d.air = Math.max(0, A.air); const h = d.air > 0 ? Math.min((5 - d.air) * 30, 60, d.air * 100) : 0; d.pos = V(A.x, Math.min(h, 2.2), A.z); }
    else if (anim === 'jump') { A.k = (A.k + dt / 2.4) % 1; A.p.preview = ['jump', A.k]; }
    if (anim === 'roar' && k === 'Birther') { A.special -= dt; if (A.special < 17) A.special = 20; d.special = A.special; if (A.special > 19.98) d.special = 20; }
    else if (anim === 'roar') { A.k = (A.k + dt / 2.0) % 1; A.p.preview = ['roar', A.k]; }
    if (A.e.opts && A.e.opts.role === 'helper') { d.swing = 0; d.show = true; d.lean = anim === 'ko' ? -1.45 : 0; if (anim === 'attack') { A.swing -= dt; if (A.swing < -0.9) A.swing = 0.45; d.swing = Math.max(0, A.swing); } }
    else if (anim === 'ko') A.p.preview = ['down', 1];
  }
  return d;
}

// ---------------------------------------------------------------- crowd and raid
let corpses = [];
function crowdSet() {
  clear(); T = 0;
  const H = [];
  for (let i = 0; i < 22; i++) H.push({ seed: i * 3 + 1, kind: null, opts: { role: 'customer' }, beh: 'shop' });
  for (let i = 0; i < 8; i++) H.push({ seed: i * 5 + 2, kind: null, opts: { role: 'staff' }, job: i < 2 ? 3 : 1, beh: 'staff' });
  for (let i = 0; i < 5; i++) H.push({ seed: i, kind: null, opts: { role: 'crew' }, beh: 'crew' });
  H.push({ seed: 4, kind: null, opts: { role: 'staff', hired: false }, beh: 'shop' }, { seed: 0x51a7c0de, kind: null, opts: { role: 'survivor' }, beh: 'shop' }, { seed: 0x0bad5eed, kind: null, opts: { role: 'scavenger' }, beh: 'shop' }, { seed: 1, kind: null, opts: { role: 'merchant' }, beh: 'shop' }, { seed: 9, kind: null, opts: { role: 'staff', hired: false }, beh: 'shop' });
  const Z = [];
  for (let i = 0; i < 19; i++) Z.push({ seed: 1000 + i * 977, kind: 'Base' });
  Z.push({ seed: 11, kind: 'Tumour' }, { seed: 12, kind: 'Tumour' }, { seed: 13, kind: 'Tumour' }, { seed: 2, kind: 'Hulk' }, { seed: 1, kind: 'Brute' }, { seed: 1, kind: 'Birther' }, { seed: 5, kind: 'Baby' }, { seed: 6, kind: 'Baby' }, { seed: 1, kind: 'Sweaty' }, { seed: 1, kind: 'TwinBuff' }, { seed: 1, kind: 'TwinHeal' });
  const rnd = mulberry(5);
  for (const e of H) { const A = spawnActor(e, (rnd() - 0.5) * 16, -2 + (rnd() - 0.5) * 10, rnd() * 6); A.goal = null; A.wait = rnd() * 3; actors.push(A); }
  for (const e of Z) { const A = spawnActor(e, (rnd() - 0.5) * 22, -16 - rnd() * 14, 0); A.wait = 0; actors.push(A); }
  CROWD.rnd = rnd;
}
const CROWD = { rnd: null };
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function steer(A, tx, tz, sp, dt) {
  const dx = tx - A.x, dz = tz - A.z, l = Math.hypot(dx, dz);
  if (l < 0.15) return true;
  const want = Math.atan2(-dx, -dz); let dy = want - A.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); A.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 7);
  const s = Math.min(sp, l / dt) * Math.max(0, Math.cos(dy)); A.x += -Math.sin(A.yaw) * s * dt; A.z += -Math.cos(A.yaw) * s * dt; A.phase += dt * 7.5 * (s > 0.05 ? 1 : 0); A.mv = s > 0.05;
  return false;
}
function crowdDesc(A, dt) {
  const e = A.e, zombie = !!e.kind, rnd = CROWD.rnd; A.t += dt; A.mv = false;
  if (!zombie) {
    const d = { state: 'Walk', goal: 'Buy', timer: 0, pay_t: 0, basket: (e.seed % 2) === 1 };
    if (e.beh === 'crew') { A.swing = Math.max(-1, (A.swing ?? 0) - dt); if (A.swing < -0.9 && rnd() < 0.02) A.swing = 0.45; d.swing = Math.max(0, A.swing); }
    else if (A.wait > 0) { A.wait -= dt; if (A.look) { d.state = 'Look'; d.timer = A.wait; } if (A.paying) d.pay_t = Math.max(0, A.wait); }
    else if (!A.goal) { A.goal = [(rnd() - 0.5) * 16, -2 + (rnd() - 0.5) * 10]; A.look = false; A.paying = false; }
    else if (steer(A, A.goal[0], A.goal[1], e.beh === 'staff' ? 1.4 : 1.5, dt)) { A.goal = null; A.wait = 1 + rnd() * 3; A.look = rnd() < 0.6; A.paying = !A.look && rnd() < 0.5; if (A.paying) A.wait = 0.9; }
    if (e.beh === 'staff') { d.job = e.job; d.swing = 0; d.visible = true; if (e.job === 3) { A.swing = (A.swing ?? 0) - dt; if (A.swing < -1.5) A.swing = 0.45; d.swing = Math.max(0, A.swing); } }
    return Object.assign(d, { pos: V(A.x, 0, A.z), yaw: A.yaw, moving: !!A.mv, phase: A.phase });
  }
  // zombies: shamble toward the shop, some chase, attack when close
  const big = /Hulk|Brute|Sweaty/.test(e.kind), tx = (e.seed % 7 - 3) * 1.6, tz = -1;
  const chase = (e.seed % 3) === 0, sp = (chase ? (e.kind === 'Sweaty' ? 3 : 2.6) : 1.3) * (big ? 0.75 : 1);
  const d = { kind: e.kind, wind: 0, stagger: 0, dying: 0, chasing: chase, act: 0, act_t: 0, air: 0, special: 20, hp: 100, hp_max: 100 };
  const arrived = steer(A, tx, tz + (e.seed % 5) * 0.4, sp, dt);
  A.phase += dt * sp * 2.6 * (A.mv ? 1 : 0) - dt * 7.5 * (A.mv ? 1 : 0);
  if (arrived || Math.hypot(A.x - tx, A.z - tz) < 1.9) { A.wind = (A.wind ?? 0.5) - dt; if (A.wind < -1.0) A.wind = 0.5; d.wind = Math.max(0, A.wind); if (A.t > 14 + (e.seed % 9)) { A.x = (rnd() - 0.5) * 22; A.z = -18 - rnd() * 10; A.t = 0; A.p.first = true; } }
  return Object.assign(d, { pos: V(A.x, 0, A.z), yaw: A.yaw, moving: !!A.mv, phase: A.phase });
}
// raid: zombies walk at the first-person camera, two guards swing, two hits kill, corpses stay a while
const RAID = { cam: new THREE.Vector3(0, 1.65, 6), target: [0, 2.2] };
function raidSet() {
  clear(); T = 0; const rnd = CROWD.rnd = mulberry(9);
  const kinds = ['Base', 'Base', 'Base', 'Base', 'Base', 'Base', 'Tumour', 'Base', 'Base', 'Baby', 'Base', 'Hulk', 'Base', 'Base', 'Tumour', 'Base', 'TwinBuff', 'TwinHeal', 'Base', 'Base', 'Base', 'Brute', 'Base', 'Base', 'Birther', 'Base', 'Base', 'Sweaty', 'Base', 'Base'];
  kinds.forEach((k, i) => { const A = spawnActor({ seed: 500 + i * 131, kind: k }, (rnd() - 0.5) * 16, -12 - rnd() * 40, 0); A.hp = /Hulk|Brute|Sweaty|Birther/.test(k) ? 6 : 2; A.hp0 = A.hp; actors.push(A); });
  actors.push(spawnActor({ seed: 7, kind: null, opts: { role: 'staff' }, job: 3, guard: true }, -2.4, 1.6, 0), spawnActor({ seed: 13, kind: null, opts: { role: 'staff' }, job: 3, guard: true }, 2.4, 1.6, 0));
}
function raidStep(dt) {
  const rnd = CROWD.rnd, guards = actors.filter((A) => A.e.guard);
  for (const A of actors) {
    const e = A.e; A.t += dt;
    if (e.guard) {
      // swing at the nearest zombie in reach
      let best = null, bd = 2.2; for (const Z of actors) { if (!Z.e.kind || Z.dying) continue; const dd = Math.hypot(Z.x - A.x, Z.z - A.z); if (dd < bd) { bd = dd; best = Z; } }
      A.swing = (A.swing ?? 0) - dt;
      if (best) { A.yaw = Math.atan2(-(best.x - A.x), -(best.z - A.z)); if (A.swing < -0.5) { A.swing = 0.45; best.stag = 0.3; best.hp--; if (best.hp <= 0) best.dying = 0.001; } }
      A.p.update({ pos: V(A.x, 0, A.z), yaw: A.yaw, moving: false, phase: A.phase, job: 3, swing: Math.max(0, A.swing), visible: true, state: 'Queue' });
      continue;
    }
    const d = { kind: e.kind, wind: 0, stagger: 0, dying: 0, chasing: true, act: 0, act_t: 0, air: 0, special: 20, hp: A.hp, hp_max: A.hp0, raid: true };
    if (A.dying) {
      A.dying = Math.min(0.55, A.dying + dt); d.dying = A.dying; d.fall = A.dying / 0.55;
      if (A.dying >= 0.55) { // the sim turns it into a corpse prop: despawn the body, drop a corpse figure
        A.p.despawn(); const f = people.corpseFigure(Math.imul(500 + A.t * 1000 | 0, 977) >>> 0, e.kind === 'Tumour' ? 1 : /Hulk|Brute|Sweaty|Birther/.test(e.kind) ? 2 : 0);
        f.position.set(A.x, 0, A.z); f.rotation.y = A.yaw + Math.PI; scene.add(f); corpses.push({ f, t: 0 });
        Object.assign(A, spawnActor(e, (rnd() - 0.5) * 16, -30 - rnd() * 20, 0)); A.hp = A.hp0; A.dying = 0; continue;
      }
    } else {
      const tx = RAID.target[0] + (e.seed % 5 - 2) * 0.7, tz = RAID.target[1] - 1.2;
      const big = /Hulk|Brute|Sweaty/.test(e.kind), sp = (e.kind === 'Sweaty' ? 3 : e.kind === 'Baby' ? 2.4 : 2.0) * (big ? 0.8 : 1) * (A.stag > 0 ? 0 : 1);
      A.mv = false; const arrived = steer(A, tx, tz, sp, dt); A.phase += dt * sp * 2.6 * (A.mv ? 1 : 0) - dt * 7.5 * (A.mv ? 1 : 0);
      if (arrived || Math.hypot(A.x - tx, A.z - tz) < 1.7) { A.wind = (A.wind ?? 0.5) - dt; if (A.wind < -0.8) A.wind = 0.5; d.wind = Math.max(0, A.wind); if (A.t > 25) { A.hp = 0; A.dying = 0.001; } }
      if (A.stag > 0) { A.stag -= dt; d.stagger = A.stag; }
      d.chasing = Math.hypot(A.x - tx, A.z - tz) < 14;
    }
    A.p.update(Object.assign(d, { pos: V(A.x, (d.fall || 0) * 0.1, A.z), yaw: A.yaw, moving: !!A.mv, phase: A.phase }));
  }
  for (const c of corpses) c.t += dt;
  while (corpses.length && corpses[0].t > 9) { const c = corpses.shift(); scene.remove(c.f); c.f.userData.dispose(); }
}

// ---------------------------------------------------------------- camera
const ctl = { target: new THREE.Vector3(0, 1, 0), dist: 10, yaw: 0, pitch: 0.18, follow: true };
function frameLineup(snap) {
  if (!actors.length) return;
  let cx = 0; for (const A of actors) cx += A.x; cx /= actors.length;
  const xs = actors.map((A) => A.x), span = Math.max(...actors.map((A) => A.x + 0.7 * (A.big || 1))) - Math.min(...actors.map((A) => A.x - 0.7 * (A.big || 1))) + 1, rows = Math.max(...actors.map((A) => A.row || 0)) + 1;
  const big = Math.max(...actors.map((A) => A.p.scale * A.p.def.spec.heightM));
  const tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect;
  const rowGap = mode === 'zombies' ? 4.5 : 2.6, tz = -(rows - 1) * rowGap * 0.5;
  const d = Math.max(4, span / 2 / tanH * 1.05, big * 0.75 / tanV, rows > 2 ? (rows * rowGap) * 0.55 / tanV : 0);
  if (snap || ctl.follow) { ctl.target.set(cx, Math.min(big * 0.5, 1.4) + 0.1, tz); if (snap) { ctl.dist = d; ctl.yaw = 0; ctl.pitch = rows > 2 ? 0.75 : rows > 1 ? 0.32 : 0.14; } }
  shadowBox(cx, tz, Math.max(span, 8) * 0.6 + 2);
}
function camUpdate() {
  if (mode === 'raid' && ctl.fp) { camera.position.copy(RAID.cam); camera.lookAt(0, 1.2, -12); return; }
  const cp = Math.cos(ctl.pitch); camera.position.set(ctl.target.x + Math.sin(ctl.yaw) * cp * ctl.dist, ctl.target.y + Math.sin(ctl.pitch) * ctl.dist, ctl.target.z + Math.cos(ctl.yaw) * cp * ctl.dist); camera.lookAt(ctl.target);
}
const ptrs = new Map(); let downAt = null, moved = 0, pinch0 = 0;
cv.addEventListener('pointerdown', (e) => { ctl.userT = performance.now(); cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY]; moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; ctl.userT = performance.now(); const pr = ptrs.get(e.pointerId), dx = e.clientX - pr[0], dy = e.clientY - pr[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 1) { ctl.fp = false; ctl.yaw -= dx * 0.006; ctl.pitch = Math.max(0.02, Math.min(1.3, ctl.pitch + dy * 0.004)); }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) ctl.dist = Math.max(1, Math.min(60, ctl.dist * pinch0 / d)); pinch0 = d; }
});
const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (downAt && moved < 8 && e.type === 'pointerup') pickAt(e.clientX, e.clientY); downAt = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', (e) => { e.preventDefault(); ctl.userT = performance.now(); ctl.fp = false; ctl.dist = Math.max(1, Math.min(60, ctl.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
// pick: nearest robot chest on screen
let sel = null;
function pickAt(x, y) {
  const r = cv.getBoundingClientRect(); let best = null, bd = 60;
  for (const A of actors) { const p = A.p.mesh.position.clone(); p.y += A.p.scale * A.p.def.spec.heightM * 0.6; p.project(camera); const sx = (p.x + 1) / 2 * r.width, sy = (1 - p.y) / 2 * r.height, d = Math.hypot(sx - x, sy - y); if (p.z < 1 && d < bd) { bd = d; best = A; } }
  select(best);
}
function select(A) {
  sel = A; const tag = document.getElementById('tag');
  if (!A) { tag.classList.remove('show'); if (mode !== 'crowd' && mode !== 'raid') frameLineup(true); return; }
  const def = A.p.def, sp = def.spec;
  document.getElementById('tagH').textContent = A.e.label || (A.e.kind ? KIND_VI[A.e.kind] : ROLE_VI[A.p.role]) || '';
  document.getElementById('tagP').textContent = `${def.key} · thân ${sp.torsoDef || sp.torso} · đầu ${sp.head} · ${A.p.proto.tris.toLocaleString('vi')} tam giác · cao ${(A.p.scale * sp.heightM).toFixed(2)} m`;
  tag.classList.add('show');
  const h = A.p.scale * sp.heightM; ctl.follow = false; ctl.target.set(A.x, h * 0.62, A.z); ctl.dist = Math.max(2.2, h * 1.5); ctl.pitch = 0.12;
}

// ---------------------------------------------------------------- UI
const $ = (s) => document.querySelector(s);
const MODES = { crew: 'Hàng ngũ', play: 'Sân chơi', roles: 'Robot thợ', zombies: 'Zombie', weapons: 'Vũ khí & đánh', arena: 'Võ đài', raid: 'Đợt tấn công', crowd: 'Đám đông 40+30' };
function chips(el, items, labels, onPick, cur, cls = '') {
  el.innerHTML = ''; for (const k of items) { const b = document.createElement('button'); b.className = 'chip ' + cls + (k === cur ? ' on' : ''); b.textContent = labels[k]; b.dataset.k = k; b.onclick = () => { onPick(k); for (const x of el.children) x.classList.toggle('on', x === b); }; el.appendChild(b); }
}
function buildUI() {
  const m = $('#modes'); m.innerHTML = '';
  for (const k in MODES) { const b = document.createElement('button'); b.textContent = MODES[k]; b.className = k === mode ? 'on' : ''; b.onclick = () => setMode(k); m.appendChild(b); }
  const z = mode === 'zombies', cm = mode === 'crew' || mode === 'play', wm = mode === 'weapons';
  const ZL = Object.assign({}, ANIM_VI, Z_MOVE_VI);
  if (cm) chips($('#anims'), CREW_ANIMS, CREW_ANIM_VI, (a) => crew.setAnim(a), crew.anim);
  else if (wm) chips($('#anims'), W_ACTS, W_ACT_VI, (a) => combat.setAct(a), combat.act);
  else chips($('#anims'), mode === 'crowd' || mode === 'raid' || mode === 'arena' ? [] : z ? Z_ANIMS.concat(Z_MOVES) : H_ANIMS, z ? ZL : ANIM_VI, setAnim, anim, z ? 'z' : '');
  if (wm) chips($('#emotes'), W_PICK, W_PICK_VI, (w) => { const r = combat.setPick(w); frameCombat(r); }, combat.pick);
  else chips($('#emotes'), Object.keys(EMO_VI), EMO_VI, (e) => { if (cm) crew.setEmote(e); else setEmote(e); }, emote);
  $('#anims').parentElement.style.display = mode === 'crowd' || mode === 'raid' || mode === 'arena' ? 'none' : '';
  $('#emotes').parentElement.style.display = mode === 'arena' ? 'none' : '';
  $('#emoLabel').textContent = wm ? 'Vũ khí' : 'Biểu cảm';
}
function setMode(m) {
  mode = m; anim = 'idle'; sel = null; $('#tag').classList.remove('show'); ctl.follow = true; ctl.fp = false;
  raidLight.intensity = 0; scene.fog.color.set(0x12151c); scene.background.set(0x12151c); set.visible = m === 'crowd' || m === 'raid'; hemi.intensity = 0.55; key.intensity = 2.6;
  crew.clear(); combat.clear(); clear(); arenaRing.visible = m === 'arena';
  const portrait = innerWidth / innerHeight < 0.85;
  if (m === 'crew') { const L = crew.lineup(); ctl.follow = false; ctl.target.set(0, 0.3, 0.1); ctl.dist = portrait ? 11.5 : 7.4; ctl.yaw = 0; ctl.pitch = portrait ? 0.66 : 0.5; shadowBox(0, 0, Math.max(L.w, L.d) * 0.62 + 0.6); }
  else if (m === 'play') { crew.play(); ctl.follow = false; ctl.target.set(0.35, 0, 0.75); ctl.dist = portrait ? 12.5 : 9.2; ctl.yaw = 0.5; ctl.pitch = 0.8; shadowBox(0, 0, 3.8); }
  else if (m === 'weapons') { frameCombat(combat.showcase()); }
  else if (m === 'arena') { combat.arena(); ctl.follow = false; ctl.userT = 0; ctl.target.set(0, 0.6, 0); ctl.dist = portrait ? 16 : 12; ctl.yaw = 0.4; ctl.pitch = portrait ? 0.9 : 0.68; shadowBox(0, 0, 13); }
  else if (m === 'crowd') { crowdSet(); ctl.target.set(0, 0.5, -8); ctl.dist = 30; ctl.yaw = 0.35; ctl.pitch = 0.62; ctl.follow = false; shadowBox(0, -8, 22); }
  else if (m === 'raid') { raidSet(); ctl.fp = true; raidLight.intensity = 60; scene.fog.color.set(0x1a1013); scene.background.set(0x1a1013); hemi.intensity = 0.35; key.intensity = 1.6; shadowBox(0, -12, 26); }
  else lineup();
  buildUI();
}
function setAnim(a) {
  const wasCine = !!CINE[anim], cine = !!CINE[a], prevAnim = anim; anim = a;
  if (wasCine !== cine || prevAnim === 'death' || a === 'death') { lineup(); }
  for (const A of actors) { A.x = A.x0; A.z = A.z0; A.t = 0; A.dying = 0; A.k = 0; A.act = 0; A.rest = 0.01; A.air = 5; A.p.preview = null; A.p.first = true; if (A.p.forced) A.p.release(); A.p.body.release(); }
  if (a === 'death') for (const A of actors) A.reset = true;
}
function setEmote(e) { emote = e; for (const A of actors) A.p.setEmote(e); }
// fit the whole weapon line-up between the header and the chip dock: walk the camera in until a robot box (with
// its weapon and the label under its feet) would leave the free part of the screen
// arena camera: glides to the busiest cluster, slowly orbits and zooms with the spread of the fight; a drag, pinch or
// wheel hands yaw / pitch / zoom to the user for 6 s (the target keeps following the fight)
function arenaCam(dt) {
  const h = combat.hot(); if (!h) return;
  const portrait = innerWidth / innerHeight < 0.85, k = 1 - Math.exp(-dt * 1.6);
  ctl.target.x += (h.x - ctl.target.x) * k; ctl.target.z += (h.z - ctl.target.z) * k; ctl.target.y += (0.6 - ctl.target.y) * k;
  if (performance.now() - (ctl.userT || 0) < 6000) return;
  ctl.yaw += dt * 0.07;
  const want = Math.max(portrait ? 11 : 8, Math.min(portrait ? 21 : 17, h.r * (portrait ? 2.6 : 2.0) + (portrait ? 6 : 4)));
  ctl.dist += (want - ctl.dist) * (1 - Math.exp(-dt * 0.8)); ctl.pitch += ((portrait ? 0.9 : 0.68) - ctl.pitch) * (1 - Math.exp(-dt * 0.8));
}
function frameCombat(r) {
  const pts = r.pts || [[0, 0]], xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const hb = (document.querySelector('header') || { getBoundingClientRect: () => ({ bottom: 60 }) }).getBoundingClientRect().bottom + (innerWidth > 640 ? 34 : 40);
  const db = innerHeight - ($('#dock') ? $('#dock').getBoundingClientRect().height : 100) - 22;
  const top = 1 - 2 * hb / innerHeight, bot = 1 - 2 * db / innerHeight, side = 1 - 2 * 14 / innerWidth;
  ctl.follow = false; ctl.yaw = 0; ctl.pitch = r.rows > 2 ? 1.05 : r.rows > 1 ? 0.74 : 0.16;
  const cam = camera.clone(), v = new THREE.Vector3(), probe = [];
  for (const [x, z] of pts) for (const dx of [-0.95, 0.95]) for (const y of [-0.12, 1.75]) probe.push([x + dx, y, z + (y < 0 ? 0.25 : -0.1)]);
  let lo = 2, hi = 80, ty = 0.8;
  const fits = (d) => { for (let it = 0; it < 2; it++) { const cp = Math.cos(ctl.pitch); cam.position.set(cx, ty + Math.sin(ctl.pitch) * d, cz + cp * d); cam.lookAt(cx, ty, cz); cam.updateMatrixWorld(); }
    let ymin = 9, ymax = -9; for (const p of probe) { v.set(...p).project(cam); if (Math.abs(v.x) > side) return null; ymin = Math.min(ymin, v.y); ymax = Math.max(ymax, v.y); } return [ymin, ymax]; };
  for (let k = 0; k < 3; k++) { // binary search on distance, then re-centre vertically in the free band
    lo = 2; hi = 80; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, f = fits(m); if (f && f[1] - f[0] < (top - bot)) hi = m; else lo = m; }
    const f = fits(hi); if (!f) break; const mid = (f[0] + f[1]) / 2, want = (top + bot) / 2; ty += (mid - want) * hi * Math.tan(camera.fov * Math.PI / 360) * 0.9;
  }
  ctl.target.set(cx, ty, cz); ctl.dist = hi * 1.02; shadowBox(cx, cz, Math.max(r.span * 0.6, (Math.max(...zs) - Math.min(...zs)) * 0.7) + 2);
}

// screen labels under the line-up
const labelsEl = $('#labels'); let labelEls = [];
function drawLabels() {
  const show = (mode !== 'crowd' && mode !== 'raid' && mode !== 'arena') && !sel && (innerWidth > 700 || mode === 'weapons');
  const src = mode === 'weapons' ? combat.list.map((A) => ({ p: A.p, e: { label: A.label } })) : mode === 'crew' || mode === 'play' ? [] : actors;
  while (labelEls.length < actors.length) { const d = document.createElement('div'); d.className = 'lb'; labelsEl.appendChild(d); labelEls.push(d); }
  while (labelEls.length < src.length) { const d = document.createElement('div'); d.className = 'lb'; labelsEl.appendChild(d); labelEls.push(d); }
  labelEls.forEach((d, i) => { const A = src[i]; if (!show || !A) { d.style.display = 'none'; return; } const p = new THREE.Vector3(A.p.mesh.position.x, -0.05, A.p.mesh.position.z).project(camera); d.style.display = ''; d.className = 'lb' + (A.e.kind ? ' z' : ''); d.textContent = A.e.label; d.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - p.y) / 2 * innerHeight + 4) + 'px'; });
}

// ---------------------------------------------------------------- loop
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.85 ? 52 : 38; camera.updateProjectionMatrix(); }
addEventListener('resize', () => { resize(); if (['roles', 'zombies', 'looks', 'staff'].includes(mode)) frameLineup(true); if (mode === 'weapons') frameCombat(combat.showcase()); });
let last = performance.now(), frames = 0, fpsT = 0, fpsE = 0, updMs = 0;
function stepSim(dt) {
  T += dt;
  if (mode === 'crew' || mode === 'play') crew.update(dt, camera);
  else if (mode === 'weapons') combat.stepShowcase(dt);
  else if (mode === 'arena') { combat.stepArena(dt); arenaCam(dt); }
  else if (mode === 'crowd') for (const A of actors) { A.p.update(crowdDesc(A, dt)); A.p.evq.length = 0; }
  else if (mode === 'raid') { raidStep(dt); for (const A of actors) if (A.p) A.p.evq.length = 0; }
  else {
    for (const A of actors) {
      if (A.reset && A.t > 4.5) { const i = actors.indexOf(A); A.p.despawn(); const N = spawnActor(A.e, A.x0, A.z0, Math.PI); Object.assign(A, N, { big: A.big, row: A.row, col: A.col, reset: anim === 'death' }); continue; }
      A.p.update(descOf(A, dt));
      if (A.p.preview) { const [n, u] = A.p.preview; A.p.body.force(n, u); }
      if (Z_MOVES.includes(anim) && A.e.kind && !A.p.body.actS) { A.zc = (A.zc || 0) - dt; if (A.zc <= 0) { A.p.body.act(anim); A.zc = 0.7; } }
      A.p.evq.length = 0;
    }
    if (ctl.follow) frameLineup(false);
  }
  const t0 = performance.now(); people.update(dt); updMs = updMs * 0.9 + (performance.now() - t0) * 0.1;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  stepSim(dt);
  camUpdate();
  renderer.render(scene, camera);
  drawLabels();
  frames++; fpsT += dt;
  if (fpsT >= 0.5) {
    fpsE = frames / fpsT; frames = 0; fpsT = 0; const i = renderer.info.render, st = people.stats();
    const nz = actors.filter((A) => A.e.kind && !A.dying).length, nh = actors.length - nz;
    const line2 = mode === 'crew' || mode === 'play' ? `${crew.bots.length} robot chi tiết (mỗi bộ phận một lệnh vẽ)` : mode === 'arena' ? combat.counts() : mode === 'weapons' ? `${combat.list.length} robot cầm vũ khí` : `${nh} robot người · ${nz} robot zombie`;
    $('#stats').innerHTML = `<b>${fpsE.toFixed(0)}</b> fps · <b>${i.calls}</b> lệnh vẽ (chưa tính bóng) · ${(i.triangles / 1000).toFixed(0)}k tam giác<br>${line2} · cập nhật ${updMs.toFixed(2)} ms`;
    Object.assign(window.TW, { fps: fpsE, calls: i.calls, tris: i.triangles, robotCalls: st.calls, updMs, protos: st.protos });
  }
}
window.TW = {
  ready: false, people, actors: () => actors, camera, ctl, setMode, setAnim: (a) => { setAnim(a); buildUI(); }, setEmote, select: (i) => select(i === null ? null : actors[i]),
  combat, crew,
  view: (t, dist, yaw, pitch) => { ctl.follow = false; ctl.fp = false; ctl.target.set(...t); ctl.dist = dist; ctl.yaw = yaw; ctl.pitch = pitch; },
  fp: (on) => { ctl.fp = on; }, raidCam: RAID.cam, stats: () => people.stats(), mode: () => mode,
};
resize(); setMode(Q.get('mode') || 'crew'); if (Q.get('anim')) window.TW.setAnim(Q.get('anim'));
window.TW.ready = true;
requestAnimationFrame(frame);
