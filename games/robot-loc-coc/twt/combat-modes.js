// Combat modes of the combined page: the weapon showcase (every weapon, every move on chips) and the arena (armed
// robots against waves of zombie robots, fighting on their own). Actors are crowd robots spawned through
// people-robots.js with opts.manual, posed by RoboBody's combat layer (robo-combat.js); hits are decided here from
// the bodies' events (impact, fire, release, spit, land).
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS } from './robo-weapons.js';
import { B } from './robo-rig.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D = (x, y, z) => ({ x, y, z, clone() { return D(this.x, this.y, this.z); } });
export const W_ACTS = ['idle', 'combo', 'guard', 'dodge', 'aim', 'fire', 'reload', 'throw', 'hitF', 'hitB', 'knock', 'die'];
export const W_ACT_VI = { idle: 'Cầm sẵn', combo: 'Đánh liên hoàn', guard: 'Đỡ đòn', dodge: 'Né', aim: 'Ngắm', fire: 'Bắn', reload: 'Nạp đạn', throw: 'Ném', hitF: 'Trúng đòn trước', hitB: 'Trúng đòn sau', knock: 'Văng ra', die: 'Chết, rã xác' };
export const Z_MOVES = ['claw2', 'lunge', 'grab', 'bite', 'spit'];
export const Z_MOVE_VI = { claw2: 'Cào liên hoàn', lunge: 'Vồ', grab: 'Túm', bite: 'Húc / cắn', spit: 'Phun' };
export const W_PICK = ['mix', 'fists', 'bat', 'pipe', 'wrench', 'machete', 'axe', 'sledge', 'pistol', 'pistol2', 'smg', 'rifle', 'shotgun', 'grenade', 'can'];
export const W_PICK_VI = Object.assign({ mix: 'Mỗi con một món' }, Object.fromEntries(Object.entries(WEAPONS).map(([k, v]) => [k, v.vi])));
const LOOKS = [[2, 'staff'], [0, 'crew'], [7, 'staff'], [0x51a7c0de, 'survivor'], [3, 'crew'], [11, 'staff'], [4, 'customer'], [1, 'crew'], [5, 'staff'], [0x0bad5eed, 'scavenger'], [9, 'customer'], [2, 'crew'], [13, 'staff'], [6, 'customer']];
const MIX = ['bat', 'pipe', 'wrench', 'machete', 'axe', 'sledge', 'fists', 'pistol', 'pistol2', 'smg', 'rifle', 'shotgun', 'grenade', 'can'];

export class CombatModes {
  constructor(ctx) { this.c = ctx; this.list = []; this.act = 'idle'; this.pick = 'mix'; this.mode = null; this.T = 0; }
  get people() { return this.c.people; }
  clear() { for (const A of this.list) if (!A.gone) A.p.despawn(); this.list = []; this.mode = null; }
  spawnBot(seed, role, wid, x, z, yaw) {
    const p = this.people.spawn(seed, null, D(x, 0, z), { role, manual: true, weapon: wid });
    p.body.explode = true; return { p, seed, role, wid, x, z, x0: x, z0: z, yaw, vx: 0, vz: 0, t: 0, cd: 0, hp: 100, phase: 0, human: true };
  }
  spawnZ(seed, kind, x, z, yaw) {
    const p = this.people.spawn(seed, kind, D(x, 0, z), { manual: true });
    const big = /Hulk|Brute|Sweaty/.test(kind);
    return { p, seed, kind, x, z, yaw, vx: 0, vz: 0, t: 0, cd: 1 + Math.random(), hp: big ? 220 : kind === 'Baby' ? 30 : 60, phase: Math.random() * 6, big };
  }
  // ---------------- showcase ----------------
  showcase() {
    this.clear(); this.mode = 'weapons'; const portrait = innerWidth / innerHeight < 0.85;
    const ids = this.pick === 'mix' ? MIX : Array(portrait ? 6 : 8).fill(this.pick);
    const per = portrait ? 4 : 7, rows = Math.ceil(ids.length / per);
    ids.forEach((w, i) => { const r = Math.floor(i / per), c = i % per; const [s, role] = LOOKS[i % LOOKS.length]; const x = (c - (Math.min(per, ids.length - r * per) - 1) / 2) * 1.35, z = -r * 2.2; this.list.push(Object.assign(this.spawnBot(s, role, w, x, z, Math.PI), { row: r, label: WEAPONS[w].vi })); });
    this.setAct(this.act);
    return { rows, span: per * 1.35 };
  }
  setAct(a) { this.act = a; for (const A of this.list) { const b = A.p.body; b.guard = 0; b.aim = 0; b.actS = null; b.release(); A.t = 0; A.cd = 0.2 + Math.random() * 0.3; if (A.dead) this.respawn(A); } }
  setPick(w) { this.pick = w; return this.showcase(); }
  respawn(A) { A.p.despawn(); const N = this.spawnBot(A.seed, A.role, A.wid, A.x0, A.z0, Math.PI); Object.assign(A, N, { row: A.row, label: A.label }); A.dead = false; }
  stepShowcase(dt) {
    for (const A of this.list) {
      const b = A.p.body, d = WEAPONS[A.wid], k = d.kind, gun = !!d.muzzle; A.t += dt; A.cd -= dt;
      const a = this.act;
      if (a === 'combo' && !b.actS && A.cd <= 0 && (k === 'm1' || k === 'm2' || k === 'fist')) { b.act('combo'); A.cd = 0.5; }
      if (a === 'guard') { b.guard = k === 'm1' || k === 'm2' ? 1 : 0; if (k === 'fist' && !b.actS && A.cd <= 0) { b.act('shove'); A.cd = 1.2; } if (b.guard && A.cd <= 0) { b.tTilt[0].v -= 5; b.squash.v += 1.5; this.c.fx.burst(A.p.wpoint([0, 0.25, 0]) || A.p.bpoint(B.TORSO), 6, 1.2, 1.5, 0.03); A.cd = 1.1; } }
      if (a === 'dodge' && !b.actS && A.cd <= 0) { b.act(A.side ? 'dodgeL' : 'dodgeR'); A.side = !A.side; A.cd = 0.8; }
      if (a === 'aim' || a === 'fire' || a === 'reload') b.aim = gun ? 1 : 0;
      if (a === 'fire' && gun) this.gunLoop(A, dt, null);
      if (a === 'reload' && gun && !b.actS && A.cd <= 0) { b.act('reload'); A.cd = 0.6; }
      if (a === 'throw' && k === 'throw' && !b.actS && A.cd <= 0) { b.act('throw'); A.cd = 1.5; }
      if ((a === 'hitF' || a === 'hitB') && !b.actS && A.cd <= 0) { b.act(a); A.cd = 1.3; this.c.fx.burst(A.p.bpoint(B.TORSO, 0, b.D.T.h * 0.6, a === 'hitF' ? b.D.T.d : -b.D.T.d), 10, 1.5, 2, 0.035); }
      if (a === 'knock' && !b.actS && A.cd <= 0) { b.act('knock'); A.cd = 2.4; }
      if (a === 'die') { if (!A.dead) { A.dead = true; A.dt = 0; this.c.fx.burst(A.p.bpoint(B.TORSO, 0, b.D.T.neck, 0), 18, 2.2, 2.4, 0.045); } A.dt += dt; b.force('die', Math.min(1, A.dt / 0.55)); if (A.dt > 4) this.respawn(A); }
      A.p.update({ pos: D(A.x, 0, A.z), yaw: A.yaw, moving: false, phase: 0 });
      this.handleEvents(A, null);
    }
  }
  // gun cadence: fire, pump, reload when empty; target point or actor
  gunLoop(A, dt, tgt) {
    const b = A.p.body, d = WEAPONS[A.wid];
    if (b.actS) return;
    if (b.ammo <= 0) { b.act('reload'); return; }
    if (A.cd > 0) return;
    if (b.fire()) { A.cd = d.rate * (0.9 + Math.random() * 0.3); A.tgt = tgt; if (d.kind === 'shotgun') A.pumpIn = 0.12; }
  }
  // fire / impact / throw events of one actor -> fx and hits (targets: list of actors or null)
  handleEvents(A, foes) {
    const q = A.p.evq, b = A.p.body, d = b.wdef, fx = this.c.fx, Wl = this.people.weapons;
    if (A.pumpIn !== undefined) { A.pumpIn -= 1 / 60; if (A.pumpIn <= 0) { delete A.pumpIn; if (!b.actS) b.act('pump'); } }
    if (!q.length) return;
    for (const e of q) {
      if (e.e === 'fire' && d) {
        const m = A.p.wpoint(d.muzzle); if (!m) continue;
        const fwd = V3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, A.p.mesh.rotation.y, 0)));
        const n = d.pellets || 1;
        for (let i = 0; i < n; i++) {
          let end, hitA = null;
          const T = A.tgt && !A.tgt.dead && A.tgt.p ? A.tgt : null;
          if (T && Math.random() < (n > 1 ? 0.55 : 0.82)) { hitA = T; end = T.p.bpoint(B.TORSO, (Math.random() - 0.5) * 0.15, T.p.body.D.T.h * (0.3 + Math.random() * 0.5), 0); }
          else { const sp = n > 1 ? 0.12 : 0.04; end = m.clone().addScaledVector(fwd.clone().add(V3((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp * 2)).normalize(), T ? m.distanceTo(T.p.mesh.position) + 3 : 14); if (end.y < 0.02) end.y = 0.02; }
          Wl.tr.add(m, end, 0.12); fx.burst(end, hitA ? 6 : 3, 1.2, 1.8, 0.03);
          if (hitA) this.damage(hitA, d.dmg, A, n > 1 ? 0.3 : d.kind === 'rifle' ? 1 : 0.4);
        }
      }
      if (e.e === 'impact' && foes) {
        const reach = (d ? d.reach || 1.0 : 0.95) * (A.p.scale * 1.0) + (A.big ? 0.8 : 0.2);
        const fwd = V3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, A.p.mesh.rotation.y, 0)));
        for (const F of foes) { if (F.dead || F.gone) continue; const dx = F.x - A.x, dz = F.z - A.z, dist = Math.hypot(dx, dz); if (dist > reach + 0.3) continue; if ((dx * fwd.x + dz * fwd.z) / (dist || 1) < 0.2) continue;
          const dmg = A.human ? (d ? d.dmg || 10 : 10) * (e.k ? 1.4 : 1) : (A.big ? 22 : 9) * (e.k ? 1.5 : 1);
          this.damage(F, dmg, A, e.k ? 1 : 0.35); fx.burst(F.p.bpoint(B.TORSO, 0, F.p.body.D.T.h * 0.6, 0), 12, 1.8, 2.4, 0.04); }
      }
      if (e.e === 'land' && e.proj === 'grenade' && foes) { this.boom(e.p, foes, A); }
      if (e.e === 'splat' && foes) { for (const F of foes) if (!F.dead && Math.hypot(F.x - e.p.x, F.z - e.p.z) < 1.2) this.damage(F, 12, A, 0.3); }
      if (e.e === 'release' && foes && A.tgt) { /* projectile flies on its own (adapter); aim was set by facing */ }
    }
    q.length = 0;
  }
  boom(p, foes, A) {
    const Wl = this.people.weapons, fx = this.c.fx; Wl.flashes.add(V3(p.x, p.y + 0.3, p.z), 1.6, 0.18, 9); fx.burst(V3(p.x, 0.2, p.z), 40, 4, 6, 0.07); for (let i = 0; i < 10; i++) fx.emit(V3(p.x, 0.3, p.z), { x: (Math.random() - 0.5) * 2, y: 1 + Math.random(), z: (Math.random() - 0.5) * 2 }, 1, 1.6, 0.4);
    if (foes) for (const F of foes) { if (F.dead) continue; const dd = Math.hypot(F.x - p.x, F.z - p.z); if (dd < 2.8) { this.damage(F, 70 * (1 - dd / 3), A, 1.6, p); } }
  }
  // damage + react + knockback (k 0..1+)
  damage(F, dmg, src, k, from) {
    if (F.dead) return; F.hp -= dmg; const b = F.p.body;
    const ox = from ? from.x : src.x, oz = from ? from.z : src.z, dx = F.x - ox, dz = F.z - oz, l = Math.hypot(dx, dz) || 1;
    const fwd = V3(-Math.sin(F.yaw), 0, -Math.cos(F.yaw)); const front = (fwd.x * -dx + fwd.z * -dz) / l > 0;
    F.vx += dx / l * 2.2 * k; F.vz += dz / l * 2.2 * k; b.flash = 1;
    if (F.hp <= 0) { F.dead = true; F.dt = 0; this.c.fx.burst(F.p.bpoint(B.TORSO, 0, b.D.T.neck, 0), 18, 2.2, 2.4, 0.045); b.actS = null; return; }
    if (!b.actS || b.actS.name.startsWith('hit')) b.act(k >= 1 && !F.big ? 'knock' : front ? 'hitF' : 'hitB', { k: Math.min(1.4, 0.6 + k) });
  }
  // ---------------- arena ----------------
  arena() {
    this.clear(); this.mode = 'arena'; this.T = 0; this.zs = []; this.bots = []; this.kills = 0; this.spawnT = 0;
    const kit = [['sledge', 0, 'crew'], ['bat', 7, 'staff'], ['machete', 0x51a7c0de, 'survivor'], ['rifle', 2, 'staff'], ['shotgun', 3, 'crew'], ['pistol2', 11, 'staff'], ['smg', 0x0bad5eed, 'scavenger'], ['grenade', 1, 'crew']];
    kit.forEach(([w, s, r], i) => { const a = i / kit.length * Math.PI * 2; const B2 = this.spawnBot(s, r, w, Math.cos(a) * 2.2, Math.sin(a) * 2.2, a); B2.home = [Math.cos(a) * 2.2, Math.sin(a) * 2.2]; this.bots.push(B2); });
    this.list = this.bots.concat(this.zs);
  }
  waveZ() {
    const kinds = ['Base', 'Base', 'Base', 'Tumour', 'Base', 'Baby', 'Base', 'Hulk', 'Base', 'TwinBuff', 'Base', 'Baby', 'Base', 'TwinHeal'];
    const k = kinds[(this.kills + this.zs.length) % kinds.length], a = Math.random() * Math.PI * 2, r = 11;
    const Z = this.spawnZ(4000 + Math.floor(Math.random() * 90000), k, Math.cos(a) * r, Math.sin(a) * r, 0); this.zs.push(Z); this.list = this.bots.concat(this.zs);
  }
  nearest(A, list) { let best = null, bd = 1e9; for (const F of list) { if (F.dead || F.gone) continue; const d = Math.hypot(F.x - A.x, F.z - A.z); if (d < bd) { bd = d; best = F; } } return [best, bd]; }
  face(A, F, dt, rate = 8) { const want = Math.atan2(-(F.x - A.x), -(F.z - A.z)); let dy = want - A.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); A.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * rate); return Math.abs(dy); }
  move(A, tx, tz, sp, dt) { const dx = tx - A.x, dz = tz - A.z, l = Math.hypot(dx, dz); if (l < 0.05) return 0; const s = Math.min(sp, l / dt); A.x += dx / l * s * dt; A.z += dz / l * s * dt; return s; }
  stepArena(dt) {
    this.T += dt; this.spawnT -= dt;
    const alive = this.zs.filter((z) => !z.dead).length;
    if (alive < 11 && this.spawnT <= 0) { this.waveZ(); this.spawnT = 0.9; }
    const bots = this.bots.filter((x) => !x.dead), zs = this.zs;
    for (const A of this.bots) {
      const b = A.p.body, d = WEAPONS[A.wid], gun = !!d.muzzle; A.cd -= dt; let moving = 0;
      if (A.dead) { A.dt += dt; b.force('die', Math.min(1, A.dt / 0.55)); if (A.dt > 5) { A.p.despawn(); const N = this.spawnBot(A.seed, A.role, A.wid, A.home[0], A.home[1], 0); Object.assign(A, N, { home: A.home }); } A.p.update({ pos: D(A.x, 0, A.z), yaw: A.yaw, moving: false, phase: A.phase }); this.handleEvents(A, zs); continue; }
      if (A.hp < 100) A.hp += dt * 3;
      const [F, dist] = this.nearest(A, zs);
      const busy = b.actS && !['pump', 'reload'].includes(b.actS.name);
      if (F) {
        if (gun) {
          b.aim = dist < 14 ? 1 : 0; this.face(A, F, dt, 6);
          if (dist < 3.2 && !busy) moving = this.move(A, A.x - (F.x - A.x), A.z - (F.z - A.z), 1.6, dt); // back off
          else if (dist > 9 && !busy) moving = this.move(A, F.x, F.z, 1.4, dt);
          if (dist < 12) this.gunLoop(A, dt, F);
        } else if (d.kind === 'throw') {
          this.face(A, F, dt, 6); if (dist < 3 && !busy) moving = this.move(A, A.x - (F.x - A.x), A.z - (F.z - A.z), 1.6, dt);
          if (dist > 4 && dist < 9 && !b.actS && A.cd <= 0) { b.act('throw'); A.cd = 3; A.tgt = F; }
        } else {
          const reach = (d.reach || 1) * A.p.scale * 0.9 + (F.big ? 0.7 : 0.25);
          const off = this.face(A, F, dt, 9);
          if (dist > reach && !busy) moving = this.move(A, F.x, F.z, 2.3, dt);
          else if (!b.actS && A.cd <= 0 && off < 0.5) { if (Math.random() < 0.15) { b.act(Math.random() < 0.5 ? 'dodgeL' : 'dodgeR'); A.cd = 0.5; } else { b.act('combo'); A.cd = 0.25; } }
          b.guard = !b.actS && dist < reach + 1 && A.cd > 0 ? 1 : 0;
        }
      }
      A.x += A.vx * dt; A.z += A.vz * dt; A.vx *= Math.exp(-dt * 5); A.vz *= Math.exp(-dt * 5);
      const rr = Math.hypot(A.x, A.z), lim = 6.5; if (rr > lim) { A.x *= lim / rr; A.z *= lim / rr; }
      if (moving) A.phase += dt * 7.5;
      A.p.update({ pos: D(A.x, 0, A.z), yaw: A.yaw, moving: moving > 0.05, phase: A.phase });
      this.handleEvents(A, zs);
    }
    for (let i = zs.length - 1; i >= 0; i--) {
      const Z = zs[i], b = Z.p.body; Z.cd -= dt; let moving = 0;
      if (Z.dead) { Z.dt += dt; b.force('die', Math.min(1, Z.dt / 0.55)); Z.p.update({ pos: D(Z.x, 0, Z.z), yaw: Z.yaw, moving: false, phase: Z.phase }); if (Z.dt > 3.5) { Z.p.despawn(); Z.gone = true; zs.splice(i, 1); this.kills++; this.list = this.bots.concat(zs); } continue; }
      const [F, dist] = this.nearest(Z, bots);
      const busy = !!b.actS;
      if (F) {
        this.face(Z, F, dt, 4);
        const reach = Z.big ? 1.5 : Z.kind === 'Baby' ? 0.7 : 1.05;
        const sp = Z.kind === 'Baby' ? 2.2 : Z.big ? 1.1 : 1.5;
        if (Z.kind === 'Tumour' && dist < 6 && dist > 2.5 && !busy && Z.cd <= 0) { b.act('spit'); Z.cd = 3; }
        else if (dist > reach && !busy) { moving = this.move(Z, F.x, F.z, sp, dt); if (Z.kind === 'Baby' && dist < 2.4 && Z.cd <= 0) { b.act('lunge'); Z.cd = 2; } }
        else if (!busy && Z.cd <= 0) {
          if (Z.big) b.play('smash', 0.45, 0.5); else { const r = Math.random(); b.act(r < 0.5 ? 'claw2' : r < 0.75 ? 'bite' : 'grab'); }
          Z.cd = Z.big ? 1.6 : 0.8;
          if (Z.big) { Z.smashT = 0.45; }
        }
        if (Z.smashT !== undefined) { Z.smashT -= dt; if (Z.smashT <= 0) { delete Z.smashT; Z.p.evq.push({ e: 'impact', k: 1 }); } }
      }
      Z.x += Z.vx * dt; Z.z += Z.vz * dt; Z.vx *= Math.exp(-dt * 4); Z.vz *= Math.exp(-dt * 4);
      if (moving) Z.phase += dt * moving * 2.6;
      Z.p.update({ pos: D(Z.x, 0, Z.z), yaw: Z.yaw, moving: moving > 0.05, phase: Z.phase });
      this.handleEvents(Z, bots);
    }
    // keep bodies apart
    const all = this.list.filter((x) => !x.dead && !x.gone);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], c = all[j], dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz), rr = 0.55 * ((a.big ? 1.8 : 1) + (c.big ? 1.8 : 1)) * 0.5; if (l < rr && l > 1e-4) { const k = (rr - l) / l * 0.5; a.x -= dx * k; a.z -= dz * k; c.x += dx * k; c.z += dz * k; } }
  }
  counts() { if (this.mode !== 'arena') return ''; return `${this.bots.filter((b) => !b.dead).length} robot cầm vũ khí · ${this.zs.filter((z) => !z.dead).length} zombie · đã hạ ${this.kills}`; }
}
