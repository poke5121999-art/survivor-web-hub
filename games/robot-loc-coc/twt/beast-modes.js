// "Thú máy" tab: the animal robots (robo-beasts.js) in a line-up (every species, two looks each), a species view
// (six seeded looks of one species) and a small park where they roam and play with each other and with two crowd
// robots: the dog fetches the ball a robot throws and chases the bird, the bird lands on a walking robot's head, the
// octopus juggles, the cat stalks, the frog hops by the pond, the turtle hides when the dog runs past.
import * as THREE from '../vendor/three.module.min.js';
import { BeastSys, SPECIES, SPECIES_IDS } from './robo-beasts.js';
import { B } from './robo-rig.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D = (x, y, z) => ({ x, y, z, clone() { return D(this.x, this.y, this.z); } });
export const BEAST_VIEWS = ['lineup', 'park', ...SPECIES_IDS];
export const BEAST_VIEW_VI = Object.assign({ lineup: 'Hàng ngũ', park: 'Công viên thú máy' }, Object.fromEntries(SPECIES_IDS.map((k) => [k, SPECIES[k].vi])));
const BASE_ACTS = ['idle', 'walk', 'run', 'sig', 'hit', 'fall', 'happy', 'sad', 'scared'];
const BASE_VI = { idle: 'Đứng chơi', walk: 'Đi', run: 'Chạy / bay', sig: 'Chiêu riêng', hit: 'Trúng đòn', fall: 'Ngã rồi dậy', happy: 'Vui', sad: 'Buồn', scared: 'Sợ' };
const SEEDS = [3, 8, 14, 21, 27, 33];

export class BeastModes {
  constructor(ctx) {
    this.c = ctx; this.sys = new BeastSys(ctx.scene); this.view = 'lineup'; this.act = 'idle'; this.list = []; this.robots = []; this.props = null; this.T = 0;
    this.balls = []; this.puffs = [];
  }
  acts() { if (SPECIES[this.view]) { const sig = Object.keys(SPECIES[this.view].acts).filter((k) => !['hit', 'fall', 'happy', 'sad', 'scared'].includes(k)); return ['idle', 'walk', 'run', ...sig, 'hit', 'fall', 'happy', 'sad', 'scared']; } return this.view === 'park' ? [] : BASE_ACTS; }
  actsVi() { const o = Object.assign({}, BASE_VI); if (SPECIES[this.view]) for (const [k, a] of Object.entries(SPECIES[this.view].acts)) o[k] = a.vi; return o; }
  clear() { this.sys.clear(); for (const R2 of this.robots) R2.p.despawn(); this.robots = []; this.list = []; if (this.props) this.props.visible = false; for (const b of this.balls) b.m.visible = false; this.balls = []; for (const p of this.puffs) this.c.scene.remove(p.m); this.puffs = []; this.mode = null; }
  show(view) {
    this.clear(); this.view = view || this.view; this.mode = 'beasts'; this.T = 0;
    const portrait = innerWidth / innerHeight < 0.85;
    if (this.view === 'park') { this.park(); return { park: true }; }
    const items = this.view === 'lineup' ? SPECIES_IDS.flatMap((sp, i) => [[sp, SEEDS[i % 6]], [sp, SEEDS[(i + 3) % 6] + 40]]) : SEEDS.map((s) => [this.view, s]);
    const per = this.view === 'lineup' ? (portrait ? 4 : 6) : (portrait ? 2 : 3), sp = this.view === 'lineup' ? (portrait ? 0.85 : 1.0) : (portrait ? 0.85 : 0.9), gap = this.view === 'lineup' ? (portrait ? 1.1 : 1.35) : 1.05;
    const rows = Math.ceil(items.length / per), pts = [];
    items.forEach(([s, seed], i) => {
      const r = Math.floor(i / per), c = i % per, n = Math.min(per, items.length - r * per), x = (c - (n - 1) / 2) * sp + (r % 2 && n === per ? sp * 0.5 : 0), z = -r * gap;
      const b = this.sys.spawn(s, seed, { x, z, yaw: 0.65 }); b.home = [x, z]; b.label = SPECIES[s].vi; pts.push([x, z]); this.list.push(b);
    });
    this.setAct(this.act);
    return { rows, span: per * sp, pts, h: 0.8, pitch: portrait ? 0.78 : 0.5 };
  }
  setAct(a) {
    this.act = a; for (const b of this.list) { b.act = null; b.mood = null; b.speed = 0; b.loop = false; b.cd = 0.1 + Math.random() * 0.5; b.sigI = 0; }
  }
  // line-up / species view: the chosen act loops on everyone (signature acts cycle per species)
  stepLine(dt) {
    for (const b of this.list) {
      const a = this.act, sp = b.sp; b.cd -= dt; b.x = b.home[0]; b.z = b.home[1];
      if (a === 'walk' || a === 'run') {
        const run = a === 'run';
        if (sp === 'snake') { b.loop = true; b.speed = run ? 1 : 0.3; }
        else if (sp === 'bird') { b.speed = run ? 0 : 0.3; if (run && !b.act && b.cd <= 0) { b.do('takeoff'); b.cd = 0.4; } }
        else if (sp === 'octo') b.speed = run ? 0.9 : 0.3;
        else if (sp === 'crab') b.speed = run ? 0.9 : 0.35;
        else if (sp === 'turtle') b.speed = run ? 0.3 : 0.15;
        else if (sp === 'frog') b.speed = run ? 0.6 : 0.3;
        else b.speed = run ? 1.8 : 0.45;
      } else { b.speed = 0; b.loop = false; }
      if (b.act || b.cd > 0) continue;
      if (a === 'sig') { const sigs = Object.keys(SPECIES[sp].acts).filter((k) => !['hit', 'fall', 'happy', 'sad', 'scared'].includes(k)); b.do(sigs[b.sigI++ % sigs.length]); b.cd = 0.4; }
      else if (a !== 'idle' && a !== 'walk' && a !== 'run') { if (b.do(a)) b.cd = a === 'hit' ? 0.7 : 0.5; }
    }
  }
  /* ---------------- park ---------------- */
  park() {
    const sc = this.c.scene;
    if (!this.props) this.props = buildPark(); sc.add(this.props); this.props.visible = true;
    const S = (sp, seed, x, z) => { const b = this.sys.spawn(sp, seed, { x, z, yaw: Math.random() * 6 }); b.home = [x, z]; b.label = SPECIES[sp].vi; b.st = 'idle'; b.tgt = null; b.cd = 1 + Math.random() * 2; this.list.push(b); return b; };
    this.dog = S('dog', 3, -1, 1); this.dog2 = S('dog', 47, 2.5, -2.5); this.bird = S('bird', 2, 1.5, 0.5); this.bird2 = S('bird', 5, -2.5, -1.5);
    this.octo = S('octo', 3, 3.6, 2.2); this.cat = S('cat', 8, -3, 2.5); this.crab = S('crab', 21, 4.4, 3.4); this.snake = S('snake', 14, -4, -3); this.frog = S('frog', 27, 2.6, 3.8); this.frog2 = S('frog', 33, 4.9, 1.2);
    this.turtle = S('turtle', 8, -1.5, -3.5); this.bee = S('bee', 3, -4.2, 3.6); this.bee2 = S('bee', 14, -3.6, 4.4);
    this.octo.juggling = true; this.octo.yaw = -2.4;
    const people = this.c.people;
    const mk = (seed, role, x, z) => { const p = people.spawn(seed, null, D(x, 0, z), { role, manual: true }); return { p, x, z, yaw: 0, phase: 0, moving: false }; };
    this.thrower = mk(4, 'customer', -0.5, 2.6); this.walker = mk(7, 'staff', 0, -1.2); this.robots = [this.thrower, this.walker];
    this.ball = { m: this.props.userData.ball, p: V(-0.5, 0.05, 2.0), v: V(), held: 'thrower', rest: true }; this.ball.m.visible = true; this.balls = [this.ball];
    this.dog.st = 'wait'; this.bird.st = 'ground'; this.bird.tp = 0; this.walkA = 0; this.throwCd = 2;
  }
  wander(b, dt, cx, cz, R2, sp) {
    if (!b.tgt || Math.hypot(b.tgt[0] - b.x, b.tgt[1] - b.z) < 0.25) { const a = Math.random() * 6.28, r = Math.random() * R2; b.tgt = [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; b.pause = Math.random() < 0.4 ? 1 + Math.random() * 2 : 0; }
    if (b.pause > 0) { b.pause -= dt; b.speed = 0; return; }
    this.goTo(b, b.tgt[0], b.tgt[1], sp, dt);
  }
  goTo(b, x, z, sp, dt, side = false) {
    const dx = x - b.x, dz = z - b.z, l = Math.hypot(dx, dz); if (l < 0.05) { b.speed = 0; return true; }
    let want = Math.atan2(dx, dz); if (side) want -= Math.PI / 2; let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 4);
    const s = Math.min(sp, l / dt) * (Math.abs(dy) < 1.2 ? 1 : 0.3); b.x += dx / l * s * dt; b.z += dz / l * s * dt; b.speed = s; return l < 0.2;
  }
  robotHead(R2) { return R2.p.bpoint(B.HEAD, 0, 0.3, 0); }
  stepPark(dt) {
    this.T += dt;
    // robots: the walker loops around, the thrower turns to the dog
    this.walkA += dt * 0.16; const wx = Math.sin(this.walkA) * 2.2, wz = -1.2 + Math.cos(this.walkA) * 1.4, W = this.walker;
    const wdx = wx - W.x, wdz = wz - W.z; W.yaw = Math.atan2(wdx, wdz); W.x = wx; W.z = wz; W.phase += dt * 6.5; W.p.update({ pos: D(W.x, 0, W.z), yaw: W.yaw, moving: true, phase: W.phase });
    const T = this.thrower, dg = this.dog; T.yaw = Math.atan2(dg.x - T.x, dg.z - T.z) * 0.6 + T.yaw * 0.4; T.p.update({ pos: D(T.x, 0, T.z), yaw: T.yaw, moving: false, phase: 0 });
    // ball: thrown by the robot, fetched by the dog
    const bl = this.ball;
    if (bl.held === 'thrower') { bl.p.copy(T.p.bpoint(B.RHAND, 0, -0.05, 0)); this.throwCd -= dt; if (this.throwCd <= 0 && dg.st === 'wait') { T.p.body.play('serve', 0.25, 0.4); const a = (Math.random() - 0.5) * 2.2 + Math.PI * 1.0, d = 3 + Math.random() * 2; bl.v.set(Math.sin(a) * d * 0.9, 4.2, Math.cos(a) * d * 0.9); bl.held = null; bl.rest = false; dg.st = 'chase'; dg.do('bark'); } }
    else if (bl.held === 'dog') { bl.m.visible = false; }
    else { bl.v.y -= 9.8 * dt; bl.p.addScaledVector(bl.v, dt); if (bl.p.y < 0.05) { bl.p.y = 0.05; bl.v.y = Math.abs(bl.v.y) * 0.45; bl.v.x *= 0.7; bl.v.z *= 0.7; if (bl.v.length() < 0.3) { bl.v.set(0, 0, 0); bl.rest = true; } } const r = Math.hypot(bl.p.x, bl.p.z); if (r > 6.6) { bl.p.x *= 6.6 / r; bl.p.z *= 6.6 / r; bl.v.x *= -0.5; bl.v.z *= -0.5; } }
    if (bl.held !== 'dog') { bl.m.visible = true; bl.m.position.copy(bl.p); bl.m.rotation.x += bl.v.z * dt * 8; bl.m.rotation.z -= bl.v.x * dt * 8; }
    // dog: wait by the thrower -> chase -> grab -> bring back -> drop; chases the bird when it lands near
    if (dg.st === 'wait') { this.goTo(dg, T.x + 0.4, T.z - 0.8, 1.2, dt); if (dg.speed < 0.05) { dg.yaw += (Math.atan2(T.x - dg.x, T.z - dg.z) - dg.yaw) * 0.05; if (!dg.act && Math.random() < dt * 0.15) dg.do(Math.random() < 0.5 ? 'tilt' : 'sit'); }
      if (this.bird.st === 'ground' && Math.hypot(this.bird.x - dg.x, this.bird.z - dg.z) < 2.2 && !dg.act) { dg.st = 'chaseBird'; dg.do('bark'); } }
    else if (dg.st === 'chase') { if (bl.rest || Math.hypot(bl.p.x - dg.x, bl.p.z - dg.z) < 1.5) { if (this.goTo(dg, bl.p.x, bl.p.z, 2.4, dt) && bl.p.y < 0.2) { dg.st = 'grab'; dg.do('fetch'); dg.grabT = 0; } } else this.goTo(dg, bl.p.x, bl.p.z, 2.4, dt); }
    else if (dg.st === 'grab') { dg.speed = 0; dg.grabT += dt; if (dg.grabT > 1.2) { bl.held = 'dog'; dg.carry = true; dg.st = 'back'; dg.act = null; } }
    else if (dg.st === 'back') { if (this.goTo(dg, T.x + 0.2, T.z - 0.6, 2.0, dt)) { dg.carry = false; bl.held = 'thrower'; dg.st = 'wait'; dg.do('happy'); this.throwCd = 2.5 + Math.random() * 2; } }
    else if (dg.st === 'chaseBird') { const bd = this.bird; this.goTo(dg, bd.x, bd.z, 2.2, dt); if (bd.st !== 'ground' || Math.hypot(bd.x - dg.x, bd.z - dg.z) < 0.5) { dg.st = 'wait'; dg.do('bark'); } }
    // turtle hides when a dog runs close
    for (const dd of [this.dog, this.dog2]) if (Math.hypot(dd.x - this.turtle.x, dd.z - this.turtle.z) < 1.3 && dd.speed > 1 && !this.turtle.is('hide')) this.turtle.do('hide');
    this.stepBird(this.bird, dt); this.stepBird2(this.bird2, dt);
    // the rest wander in their corners with their own signature acts
    const roam = (b, cx, cz, R2, sp, sigs, p = 0.12) => { if (b.act && !['happy', 'sad', 'scared'].includes(b.act.name)) { b.speed = 0; return; } this.wander(b, dt, cx, cz, R2, sp); if (Math.random() < dt * p && sigs.length) b.do(sigs[Math.floor(Math.random() * sigs.length)]); };
    roam(this.dog2, 2.5, -2.5, 1.8, 1.0, ['sit', 'tilt', 'bark']);
    roam(this.cat, -3, 2.3, 1.5, 0.5, ['stretch', 'sit', 'pounce']);
    this.octo.speed = 0; if (!this.octo.act && Math.random() < dt * 0.08) this.octo.do(Math.random() < 0.5 ? 'ink' : 'reach');
    roam(this.crab, 4.3, 3.2, 0.9, 0.35, ['snap', 'wave', 'dig']); if (this.crab.speed > 0) { this.crab.yaw += 0; }
    roam(this.snake, -4, -3, 1.6, 0.35, ['coil', 'rattle', 'strike'], 0.08);
    roam(this.frog, 3.3, 3.6, 1.0, 0.35, ['croak', 'tongue', 'jump']); roam(this.frog2, 4.6, 1.6, 0.8, 0.35, ['croak', 'tongue']);
    roam(this.turtle, -1.5, -3.5, 1.2, 0.12, ['sleep'], 0.04);
    roam(this.bee, -4, 3.9, 0.9, 0.6, ['buzz', 'pollen'], 0.15); roam(this.bee2, -3.7, 4.2, 0.9, 0.6, ['pollen', 'buzz'], 0.15);
    for (const b of this.list) { const r = Math.hypot(b.x, b.z); if (r > 6.8) { b.x *= 6.8 / r; b.z *= 6.8 / r; } }
  }
  // bird 1: pecks on the ground, flies to the walking robot's head, rides it, flies back down; flees the dog
  stepBird(b, dt) {
    const W = this.walker;
    b.tp += dt;
    if (b.st === 'ground') { b.fly = 0; b.y = 0; this.wander(b, dt, 1.2, 0.8, 1.2, 0.35); if (!b.act && Math.random() < dt * 0.3) b.do(Math.random() < 0.7 ? 'peck' : 'flap');
      const dg = this.dog; if ((Math.hypot(dg.x - b.x, dg.z - b.z) < 1.0 && dg.speed > 0.8) || (Math.hypot(this.cat.x - b.x, this.cat.z - b.z) < 1.2) || b.tp > 9) { b.st = 'up'; b.tp = 0; b.act = null; b.mood = null; if (Math.hypot(this.cat.x - b.x, this.cat.z - b.z) < 1.2) this.cat.do('pounce'); } }
    else if (b.st === 'up' || b.st === 'toHead') { const h = this.robotHead(W); b.fly = Math.min(1, b.fly + dt * 4); b.flyFlap = b.st === 'up' ? 1 : 0.35; b.speed = 0;
      const dx = h.x - b.x, dz = h.z - b.z, dy = h.y - b.y, l = Math.hypot(dx, dz); const s = Math.min(l / dt, 2.6) * dt; if (l > 0.01) { b.x += dx / l * s; b.z += dz / l * s; b.yaw = Math.atan2(dx, dz); }
      b.y += Math.sign(dy + 0.4 * Math.min(1, l)) * Math.min(Math.abs(dy + 0.4 * Math.min(1, l)), dt * 1.6); if (b.y > 0.8) b.st = 'toHead';
      if (l < 0.08 && Math.abs(dy) < 0.06) { b.st = 'perch'; b.tp = 0; b.do('happy'); } }
    else if (b.st === 'perch') { const h = this.robotHead(W); b.x = h.x; b.z = h.z; b.y = h.y; b.yaw = W.yaw; b.fly = Math.max(0, b.fly - dt * 3); b.speed = 0; if (!b.act && Math.random() < dt * 0.3) b.do('flap'); if (b.tp > 8) { b.st = 'down'; b.tp = 0; b.dst = [1.2 + (Math.random() - 0.5) * 2, 0.8 + (Math.random() - 0.5) * 2]; } }
    else if (b.st === 'down') { b.fly = Math.min(1, b.fly + dt * 4); b.flyFlap = 0.4; const dx = b.dst[0] - b.x, dz = b.dst[1] - b.z, l = Math.hypot(dx, dz); const s = Math.min(l / dt, 2.2) * dt; if (l > 0.01) { b.x += dx / l * s; b.z += dz / l * s; b.yaw = Math.atan2(dx, dz); } b.y = Math.max(0, b.y - dt * (l < 0.6 ? 1.2 : 0.4)); if (l < 0.05 && b.y <= 0.001) { b.st = 'ground'; b.tp = 0; b.fly = 0; } }
  }
  // bird 2 (crow / parrot): perches on a post, takes off for a glide loop now and then
  stepBird2(b, dt) {
    if (!b.post) { const p = this.props.userData.post; b.post = [p.x, p.z, p.y]; }
    if (!b.is('takeoff')) { b.x = b.post[0]; b.z = b.post[1]; b.y = b.post[2]; b.speed = 0; if (Math.random() < dt * 0.08) b.do('takeoff'); else if (!b.act && Math.random() < dt * 0.2) b.do(Math.random() < 0.5 ? 'flap' : 'peck'); }
  }
  step(dt) {
    if (this.view === 'park') this.stepPark(dt); else this.stepLine(dt);
    const st = this.sys.frame(dt, this.c.camera);
    // events: ink puffs, dig sand, pollen, barks
    for (const b of this.sys.list) { for (const e of b.ev) this.fx(b, e); b.ev.length = 0; }
    for (let i = this.puffs.length - 1; i >= 0; i--) { const p = this.puffs[i]; p.t += dt; const k = p.t / p.life; p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.exp(-dt * 2)); p.m.scale.setScalar(p.s * (0.5 + k * 1.5)); p.m.material.opacity = 0.75 * (1 - k); if (k >= 1) { this.c.scene.remove(p.m); this.puffs.splice(i, 1); } }
    this.stats = st; return st;
  }
  puff(p, v, s, col, life = 1.2) { if (this.puffs.length > 60) return; const m = new THREE.Mesh(PUFF_G, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false })); m.position.copy(p); m.scale.setScalar(s); this.c.scene.add(m); this.puffs.push({ m, v, s, t: 0, life }); }
  fx(b, e) {
    const fx = this.sys.crowd.fx;
    if (e.e === 'ink') for (let i = 0; i < 9; i++) this.puff(b.bpoint('head', 0, 0.12, -0.15), V((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8).add(V(-Math.sin(b.yaw), 0, -Math.cos(b.yaw)).multiplyScalar(0.8)), 0.08 + Math.random() * 0.06, 0x1a1530, 1.6);
    if (e.e === 'dig') this.puff(b.bpoint('shell', (Math.random() - 0.5) * 0.2, -0.05, -0.1), V((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8), 0.03, 0xc9a66b, 0.8);
    if (e.e === 'pollen') fx.emit(b.bpoint('head', 0, 0, 0.05), { x: (Math.random() - 0.5) * 0.5, y: 0.3, z: (Math.random() - 0.5) * 0.5 }, 0, 0.6, 0.03);
    if (e.e === 'bark' || e.e === 'croak') this.puff(b.bpoint('head', 0, 0.06, 0.2), V(-Math.sin(-b.yaw) * 0, 0.15, 0).add(V(Math.sin(b.yaw), 0, Math.cos(b.yaw)).multiplyScalar(0.6)), 0.04, 0xf5f0e0, 0.5);
    if (e.e === 'snap') fx.burst(b.bpoint('clawL', 0, 0, 0.1), 4, 0.8, 1, 0.02);
  }
  counts() { const n = this.sys.list.length; return this.view === 'park' ? `${n} thú máy · 2 robot · chó: ${({ wait: 'chờ ném', chase: 'đuổi bóng', grab: 'ngậm bóng', back: 'mang về', chaseBird: 'đuổi chim' })[this.dog?.st] || ''}` : `${n} thú máy · ${new Set(this.sys.list.map((b) => b.look.key)).size} mẫu`; }
  hot() { if (this.view !== 'park') return null; let x = 0, z = 0; const w = [[this.dog, 3], [this.bird, 2], [this.walker, 1], [this.octo, 1]]; let s = 0; for (const [b, k] of w) { x += b.x * k; z += b.z * k; s += k; } return { x: x / s * 0.5, z: z / s * 0.5, r: 5 }; }
  labels() { return this.view === 'park' ? [] : this.list.map((b) => ({ p: { mesh: { position: V(b.x, 0, b.z) } }, e: { label: b.label } })); }
}
const PUFF_G = new THREE.SphereGeometry(1, 10, 8);

// park props: grass, pond, flower patch, a post for the crow, the fetch ball (one merged mesh per material)
function buildPark() {
  const g = new THREE.Group(); g.name = 'beast-park';
  const mat = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const grass = new THREE.Mesh(new THREE.CircleGeometry(7.2, 64), mat(0x3f6b3a, 0.95)); grass.rotation.x = -Math.PI / 2; grass.position.y = 0.004; grass.receiveShadow = true; g.add(grass);
  const path = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.3, 64), mat(0x8a7558, 0.95)); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.006, -1.2); path.scale.set(1.3, 0.75, 1); path.receiveShadow = true; g.add(path);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), mat(0x2e6f9e, 0.08, 0.2)); pond.rotation.x = -Math.PI / 2; pond.position.set(3.9, 0.012, 2.6); g.add(pond);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 6, 40), mat(0x8d8f93, 0.7, 0.2)); rim.rotation.x = -Math.PI / 2; rim.position.set(3.9, 0.03, 2.6); rim.castShadow = true; g.add(rim);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(0.9, 30), mat(0xd9c49b, 0.95)); sand.rotation.x = -Math.PI / 2; sand.position.set(4.6, 0.008, 3.6); g.add(sand);
  // flowers for the bees
  const stems = [], heads = []; for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 0.3 + (i % 5) * 0.16, x = -3.9 + Math.cos(a) * r, z = 4 + Math.sin(a) * r * 0.8, h = 0.25 + (i % 3) * 0.1; const st = new THREE.CylinderGeometry(0.01, 0.012, h, 5); st.translate(x, h / 2, z); stems.push(st); const hd = new THREE.SphereGeometry(0.05, 8, 6); hd.scale(1, 0.5, 1); hd.translate(x, h, z); heads.push(hd); }
  const mergeG = (list) => { const out = new THREE.BufferGeometry(); let n = 0; const pos = [], nor = [], idx = []; for (const q of list) { const gg = q.index ? q : q; const p = gg.attributes.position.array, nn = gg.attributes.normal.array; for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(nn[i]); } for (const i of gg.index.array) idx.push(i + n); n += p.length / 3; } out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx); return out; };
  const sm = new THREE.Mesh(mergeG(stems), mat(0x2f7a3a)); sm.castShadow = true; g.add(sm);
  const hm = new THREE.Mesh(mergeG(heads), mat(0xf28cc0, 0.6)); hm.castShadow = true; g.add(hm);
  // perch post for the crow / parrot
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 10), mat(0x7e5230, 0.8)); post.position.set(-2.6, 0.55, -1.8); post.castShadow = true; g.add(post);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), mat(0x9c6b3e, 0.8)); bar.rotation.z = Math.PI / 2; bar.position.set(-2.6, 1.1, -1.8); bar.castShadow = true; g.add(bar);
  g.userData.post = V(-2.6, 1.12, -1.8);
  // fence posts around the edge
  const fp = []; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, q = new THREE.BoxGeometry(0.08, 0.5, 0.08); q.translate(Math.cos(a) * 7.0, 0.25, Math.sin(a) * 7.0); fp.push(q); }
  const fm = new THREE.Mesh(mergeG(fp), mat(0xe8e1d0, 0.7)); fm.castShadow = true; g.add(fm);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mat(0xe8b923, 0.4)); ball.castShadow = true; g.add(ball); g.userData.ball = ball;
  return g;
}
