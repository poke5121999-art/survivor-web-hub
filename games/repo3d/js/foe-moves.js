// Signature moves of the foe kinds that only had stats (parity.md section 5). Mixed into Foes.prototype (foes.js), so every
// function runs with `this` = the Foes system. Numbers from docs/design-inventory.md section 5; the ones it does not give
// are marked "chưa xác định" here and in docs/parity.md (a value is set so the move works, to be checked against Unity).
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const PX = 1 / 24;
// gunner: "stops, draws a red line, then fires; keeps 6 tiles, shoots from <= 9 tiles, only retreats; wall blocks bullets"
// chưa xác định: aim 0.7 s (the line follows you, then locks for the last 0.25 s), hitscan bullet, recover 0.4 s
export const GUN = { range: 9, keep: 6, aim: 0.7, lock: 0.25, recover: 0.4, maxRay: 24, noiseR: 9 };
// rook: "locks a line, stomps 3 times, charges straight and cannot steer; still charges to the last seen spot; hurts foes"
// chưa xác định: 3 stomps x 0.32 s, charge 8 m/s up to 12 m, knock 6 m/s, stunned 1.2 s when it hits a wall
export const ROOK = { stomps: 3, stompT: 0.32, speed: 8, maxRun: 12, from: 9, knock: 6, wallStun: 1.2, hitR: 0.75, foeMul: 1 };

export const moves = {
  // ------------------------------------------------------------------ gunner
  /** The crew bot this foe hunts, if it still may (the same rules as the melee chasers), else null. */
  preyOf(f) {
    const P = this.player;
    if (f.prey && (f.prey.down || f.prey.invisT > 0 || this.time > f.preyUntil)) f.prey = null;
    if (f.prey && f.aware >= 1 && this.playerAlive() && this.dist(f, P.position) < this.dist(f, f.prey)) f.prey = null;
    return f.prey;
  },
  bGunner(f, dt) {
    const P = this.player;
    if (f.state === 'aim') return this.gunAim(f, dt);
    const b = this.preyOf(f);
    if (f.state === 'recover') { if (f.stateT > GUN.recover) this.setState(f, b || (this.playerAlive() && f.aware >= 1) ? 'chase' : 'patrol'); return [null, 0, b || (this.playerAlive() ? P.position : null)]; }
    if (!b && !(f.aware >= 1 && this.playerAlive())) { f.laser = 0; return this.wander(f, dt); }
    if (f.state !== 'chase') this.setState(f, 'chase');
    const p = b || P.position, d = this.dist(f, p), seen = b ? d <= f.def.sight && this.nav.los(f.x, f.z, b.x, b.z) : f.seen;
    if (!b) {
      if (!seen) f.lostT += dt;
      if (f.lostT > 7 || !f.lastSeen) { f.aware = 0.3; f.target = f.lastSeen; this.setState(f, f.lastSeen ? 'investigate' : 'patrol'); return [null, 0, null]; }
    }
    if (seen && d <= GUN.range && f.cdT <= 0 && this.gunClear(f, this.gunTarget(f))) { this.setState(f, 'aim'); f.aimT = 0; f.aimAt = this.gunTarget(f); this.G.audio?.play('aim_beep', { x: f.x, y: f.gy + 1.2, z: f.z }, 0.6); return [null, 0, p]; }
    if (seen && d < GUN.keep) { const back = this.backOff(f, p); return [back, f.speed * 1.1, p]; }   // only retreats
    if (seen && d <= GUN.range) return [null, 0, p];
    return [seen || b ? { x: p.x, z: p.z } : f.lastSeen, f.speed, seen ? p : null];
  },
  gunTarget(f) { const b = f && f.prey; if (b) return { x: b.x, y: (b.gy || 0) + 0.8, z: b.z }; const c = this.player.camPos; return { x: c.x, y: c.y - 0.45, z: c.z }; },
  gunMuzzle(f) { const s = Math.sin(f.yaw), c = Math.cos(f.yaw); return { x: f.x + s * 0.45 + c * 0.12, y: f.gy + Math.min(1.25, f.h * 0.72), z: f.z + c * 0.45 - s * 0.12 }; },
  /** Nothing solid between the gun and the point (walls, doors, furniture; loot and actors do not count). */
  gunClear(f, to) {
    const m = this.gunMuzzle(f), dx = to.x - m.x, dy = to.y - m.y, dz = to.z - m.z, L = Math.hypot(dx, dy, dz);
    const ray = new this.R.Ray(m, { x: dx / L, y: dy / L, z: dz / L });
    const hit = this.G.phys.world.castRay(ray, L, true, this.R.QueryFilterFlags.EXCLUDE_DYNAMIC | this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, f.col, undefined, (c) => !this.isActorCollider(c));
    return !hit || hit.timeOfImpact > L - 0.4;
  },
  gunAim(f, dt) {
    const P = this.player;
    f.aimT += dt;
    if (f.aimT < GUN.aim - GUN.lock && (f.prey || this.playerAlive())) {
      f.aimAt = this.gunTarget(f);
      if (!f.prey && !f.seen && f.aimT > 0.2) { f.laser = 0; f.cdT = 0.3; this.setState(f, 'chase'); return [null, 0, null]; }   // lost you before the lock
    }
    f.laser = Math.min(1, f.aimT / (GUN.aim - GUN.lock));
    if (f.aimT >= GUN.aim) { this.gunFire(f); f.cdT = f.def.cd; f.laser = 0; this.setState(f, 'recover'); }
    return [null, 0, f.aimAt];
  },
  /** Hitscan along the locked line: the first thing it meets takes it (player, a crew bot, another foe, loot or a wall). */
  gunFire(f) {
    const G = this.G, P = this.player, m = this.gunMuzzle(f), a = f.aimAt;
    const dx = a.x - m.x, dy = a.y - m.y, dz = a.z - m.z, L = Math.hypot(dx, dy, dz), dir = { x: dx / L, y: dy / L, z: dz / L };
    const ray = new this.R.Ray(m, dir);
    const hit = G.phys.world.castRay(ray, GUN.maxRay, true, this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, f.col);
    let end = GUN.maxRay, what = 'air';
    // crew bots are sensors: test their capsules along the ray up to the first solid hit
    const solid = hit ? hit.timeOfImpact : GUN.maxRay;
    let bot = null, botT = solid;
    for (const b of G.bots?.list || []) { if (b.down) continue; const t = rayCapsule(m, dir, b.x, (b.gy || 0), b.z, 0.32, 1.3); if (t >= 0 && t < botT) { bot = b; botT = t; } }
    const dmg = f.def.beh === 'alien' ? 0 : f.dmg;   // the alien's ink blinds, it does not hurt
    if (bot) { end = botT; what = 'bot'; G.bots.hurt(bot, dmg, f); this.log.push(['hitBot', f.kind, bot.crew, +dmg.toFixed(1)]); }
    else if (hit) {
      end = hit.timeOfImpact; const h = hit.collider.handle;
      if (P.col && h === P.col.handle) { what = 'player'; P.hurt(dmg, { x: f.x, z: f.z, kind: f.kind }); if (f.def.boss) this.rangedHit(f); const held = G.grab?.held; if (held && !held.isHead && !G.passives?.keepsValue()) this.cutItem(held, dmg * 4, f); }
      else {
        const o = this.list.find((q) => q.col && q.col.handle === h && !q.dead);
        if (o) { what = 'foe:' + o.kind; this.hurtFoe(o, dmg * (CFG.foes?.friendlyFireMul ?? 1), { x: dir.x, z: dir.z }, 2); }
        else { const rec = G.phys.props.find((q) => q.col === hit.collider); if (rec && rec.body && !rec.dead) { what = 'loot'; rec.body.applyImpulse({ x: dir.x * 2.5 * (rec.mass || 1), y: 0.5, z: dir.z * 2.5 * (rec.mass || 1) }, true); } else what = 'wall'; }
      }
    }
    const e = { x: m.x + dir.x * end, y: m.y + dir.y * end, z: m.z + dir.z * end };
    this.shotFx(m, e, what);
    G.noise?.emit({ x: f.x, z: f.z, r: GUN.noiseR, str: 1.5, src: 'gun' });
    G.audio?.play('gun_foe', { x: m.x, y: m.y, z: m.z }, 1);
    this.log.push(['shot', f.kind, what, +end.toFixed(2)]);
    G.events.emit('foe:shot', { foe: f, what, from: m, to: e });
  },
  /** A spot 2-4 m further from p, reachable; falls back to standing. */
  backOff(f, p) {
    const ax = f.x - p.x, az = f.z - p.z, L = Math.hypot(ax, az) || 1;
    for (const k of [3, 2, 4]) for (const tw of [0, 0.6, -0.6, 1.2, -1.2]) {
      const c = Math.cos(tw), s = Math.sin(tw), ux = (ax * c - az * s) / L, uz = (ax * s + az * c) / L, x = f.x + ux * k, z = f.z + uz * k;
      if (this.nav.okW(x, z) && this.nav.clear(f.x, f.z, x, z, 0.35)) return { x, z };
    }
    return null;
  },

  // ------------------------------------------------------------------ rook
  bRook(f, dt) {
    const P = this.player;
    if (f.state === 'stomp') {
      const n = Math.floor(f.stateT / ROOK.stompT);
      if (n > (f.stompN ?? -1) && n < ROOK.stomps) { f.stompN = n; this.G.audio?.play('stomp', { x: f.x, y: f.gy + 0.1, z: f.z }, 0.9); this.G.events.emit('foe:stomp', { foe: f, n }); }
      if (f.stateT >= ROOK.stomps * ROOK.stompT) { this.rookGo(f); }
      return [null, 0, f.lane.to];
    }
    if (f.state === 'charge') return this.rookRun(f, dt);
    if (f.state === 'recover') { f.drive = null; if (f.stateT > Math.max(f.def.cd, f.dazed ? ROOK.wallStun : 0)) { f.dazed = false; this.setState(f, this.playerAlive() && f.aware >= 1 ? 'chase' : 'patrol'); } return [null, 0, null]; }
    const b = this.preyOf(f);
    if (!b && !(f.aware >= 1 && this.playerAlive())) return this.wander(f, dt);
    if (f.state !== 'chase') this.setState(f, 'chase');
    const p = b || P.position, seen = b ? true : f.seen;
    if (!b) {
      if (!seen) f.lostT += dt;
      if (f.lostT > 7 || !f.lastSeen) { f.aware = 0.3; f.target = f.lastSeen; this.setState(f, f.lastSeen ? 'investigate' : 'patrol'); return [null, 0, null]; }
    }
    // a straight lane to the target (or to where it last saw the player): lock it and stomp
    const to = seen ? { x: p.x, z: p.z } : f.lastSeen;
    if (f.cdT <= 0 && this.dist(f, to) <= ROOK.from && this.dist(f, to) > 1 && this.nav.clear(f.x, f.z, to.x, to.z, 0.35)) {
      const dx = to.x - f.x, dz = to.z - f.z, L = Math.hypot(dx, dz);
      f.lane = { dir: { x: dx / L, z: dz / L }, to: { x: f.x + dx / L * 20, z: f.z + dz / L * 20 }, x0: f.x, z0: f.z };
      f.stompN = -1; this.setState(f, 'stomp'); this.log.push(['lock', f.kind, +this.time.toFixed(2)]);
      return [null, 0, to];
    }
    return [to, f.speed, seen ? p : null];
  },
  rookGo(f) { f.drive = { x: f.lane.dir.x * ROOK.speed, z: f.lane.dir.z * ROOK.speed }; f.hitSet = new Set(); this.setState(f, 'charge'); this.G.audio?.play('roar', { x: f.x, y: f.gy + 1, z: f.z }, 0.7, 1.4); },
  /** The charge: straight on, no steering; hits everything in the way once; a wall stops it dazed. */
  rookRun(f, dt) {
    const G = this.G, P = this.player, ran = Math.hypot(f.x - f.lane.x0, f.z - f.lane.z0), dir = f.lane.dir;
    const hit = (x, z, r) => { const ax = x - f.x, az = z - f.z, along = ax * dir.x + az * dir.z, side = Math.abs(ax * dir.z - az * dir.x); return along > -0.3 && along < f.r + r + 0.35 && side < f.r + r + 0.15; };
    if (this.playerAlive() && !f.hitSet.has('P')) { const p = P.position; if (hit(p.x, p.z, CFG.player.radius) && this.reachY(f, P)) {
      f.hitSet.add('P'); P.hurt(f.dmg, { x: f.x, z: f.z, kind: f.kind }); P.shove?.(dir.x * ROOK.knock, dir.z * ROOK.knock); this.log.push(['rookHit', 'player', +f.dmg.toFixed(1)]); G.events.emit('foe:rookHit', { foe: f, who: 'player' }); } }
    for (const b of G.bots?.list || []) if (!b.down && !f.hitSet.has(b) && hit(b.x, b.z, 0.32)) { f.hitSet.add(b); G.bots.hurt(b, f.dmg, f); b.knock && (b.knock.x += dir.x * ROOK.knock, b.knock.z += dir.z * ROOK.knock); this.log.push(['rookHit', 'bot', b.crew]); this.log.push(['hitBot', f.kind, b.crew, +f.dmg.toFixed(1)]); }
    for (const o of this.list) if (o !== f && !o.dead && !f.hitSet.has(o) && o.def.beh !== 'ghost' && hit(o.x, o.z, o.r)) { f.hitSet.add(o); this.hurtFoe(o, f.dmg * ROOK.foeMul, dir, ROOK.knock); o.flyT = 0.3; this.log.push(['rookHit', 'foe', o.kind]); }
    if (f.driveBlocked) {   // the wall: a thud, dazed
      f.drive = null; f.driveBlocked = false; f.dazed = true; f.cdT = f.def.cd + ROOK.wallStun;
      G.audio?.play('punch_wall', { x: f.x, y: f.gy + 1, z: f.z }, 1, 0.6); G.events.emit('foe:rookWall', { foe: f }); this.log.push(['rookWall', +ran.toFixed(2)]);
      this.setState(f, 'recover'); return [null, 0, null];
    }
    if (ran >= ROOK.maxRun || f.stateT > ROOK.maxRun / ROOK.speed + 0.5) { f.drive = null; f.cdT = f.def.cd; this.setState(f, 'recover'); return [null, 0, null]; }
    return [null, 0, f.lane.to];
  },

  // ------------------------------------------------------------------ looks
  /** Red aim lines (gunner) and bullet tracers. Called from render. */
  movesFx(dt) {
    if (!this.lasers) {
      // per aiming gunner: a thin glowing tube (unit length along +y, scaled) and a dot where it lands
      this.laserGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6, 1, true); this.laserGeo.translate(0, 0.5, 0);
      this.laserMat = new THREE.MeshBasicMaterial({ color: 0xff2418, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
      this.dotGeo = new THREE.SphereGeometry(0.035, 8, 6);
      this.lasers = []; this.tracers = [];
    }
    let n = 0; const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
    for (const f of this.list) {
      if (f.dead || f.state !== 'aim' || !f.aimAt) continue;
      const m = this.gunMuzzle(f), a = f.aimAt, dx = a.x - m.x, dy = a.y - m.y, dz = a.z - m.z, L = Math.hypot(dx, dy, dz);
      const ray = new this.R.Ray(m, { x: dx / L, y: dy / L, z: dz / L });
      const hit = this.G.phys.world.castRay(ray, GUN.maxRay, true, this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, f.col);
      const t = hit ? hit.timeOfImpact : GUN.maxRay;
      let l = this.lasers[n]; if (!l) { l = { tube: new THREE.Mesh(this.laserGeo, this.laserMat), dot: new THREE.Mesh(this.dotGeo, this.laserMat) }; l.tube.frustumCulled = l.dot.frustumCulled = false; l.tube.renderOrder = l.dot.renderOrder = 7; this.root.add(l.tube, l.dot); this.lasers.push(l); }
      const col = f.def.laser || 0xff2418; if (l.col !== col) { l.col = col; l.tube.material = l.dot.material = (this.laserMats ||= {})[col] ||= Object.assign(this.laserMat.clone(), {}); l.tube.material.color.setHex(col); }
      v.set(dx / L, dy / L, dz / L); l.tube.position.set(m.x, m.y, m.z); l.tube.quaternion.setFromUnitVectors(up, v);
      const locked = f.aimT > GUN.aim - GUN.lock, w = locked ? 1.8 : 1;   // the lock: thicker and flickering
      l.tube.scale.set(w, t, w); l.dot.position.set(m.x + v.x * t, m.y + v.y * t, m.z + v.z * t); l.dot.scale.setScalar(locked ? 1.4 : 1);
      l.tube.visible = l.dot.visible = !locked || Math.sin(this.time * 60) > -0.6; n++;
    }
    for (let k = n; k < this.lasers.length; k++) this.lasers[k].tube.visible = this.lasers[k].dot.visible = false;
    this.laserMat.opacity = 0.6 + 0.35 * Math.abs(Math.sin(this.time * 18)); for (const k in this.laserMats || {}) this.laserMats[k].opacity = this.laserMat.opacity;
    for (let i = this.tracers.length - 1; i >= 0; i--) { const tr = this.tracers[i]; tr.t += dt; tr.mesh.material.opacity = Math.max(0, 1 - tr.t / 0.12); if (tr.t > 0.12) { this.root.remove(tr.mesh); tr.mesh.geometry.dispose(); tr.mesh.material.dispose(); this.tracers.splice(i, 1); } }
  },
  shotFx(a, b, what) {
    if (!this.tracers) this.movesFx(0);
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
    const mesh = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 1, toneMapped: false, depthWrite: false }));
    mesh.frustumCulled = false; this.root.add(mesh); this.tracers.push({ mesh, t: 0 });
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    this.G.melee?.fx?.burst?.(new THREE.Vector3(b.x, b.y, b.z), new THREE.Vector3((a.x - b.x) / L, (a.y - b.y) / L, (a.z - b.z) / L), what === 'wall' ? 10 : 5, what === 'wall' ? 2 : 0);
  },
};

/** Ray (origin o, unit dir d) against a vertical capsule at (x, z) from y0 to y0 + h with radius r: distance or -1. */
function rayCapsule(o, d, x, y0, z, r, h) {
  const ox = o.x - x, oz = o.z - z, a = d.x * d.x + d.z * d.z;
  if (a < 1e-6) return -1;
  const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r, disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a; if (t < 0) return -1;
  const y = o.y + d.y * t; return y >= y0 && y <= y0 + h ? t : -1;
}
export { PX };
