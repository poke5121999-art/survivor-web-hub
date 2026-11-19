// Signature moves, part 2 (parity.md section 5): wallhand, gacha, mummy, hunter, headthrower, impostor. Mixed into
// Foes.prototype like foe-moves.js. Behaviour text and hp/dmg/cd/speed from docs/design-inventory.md section 5; every
// other number is marked "chưa xác định" (set so the move works; parity.md lists them for checking against Unity).
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

// wallhand: "hides in a wall, grabs anyone passing; victim cannot move/use skill/items; mash left/right alternately to
// break free; hand relocates 15 s later". chưa xác định: grab range 1.0 m, 10 alternations, a bot breaks free in 3 s
export const WH = { grabR: 1.0, mash: 10, relocate: 15, botHold: 3, from: 6 };
// gacha: "grabs a player, spins a wheel (miss / partial heal / full heal / lose hp / instant knockdown); 4 hits make it
// release". chưa xác định: spin 2.5 s, slice weights, heal 20, loss 25, 6 s before the next grab
export const GA = { spin: 2.5, hits: 4, after: 6, heal: 20, loss: 25, wheel: [['miss', 30], ['heal', 20], ['full', 10], ['hurt', 30], ['down', 10]] };
// mummy: "throws a cloth tether: hits person -> pulls them to it, hits wall -> it swings to the wall; line breaks if it
// is stunned". chưa xác định: thrown from 3-8 m, 0.5 s wind-up, 14 m/s, pull 4 m/s up to 2.5 s, swing 6 m/s, 5 s between
export const MU = { from: 3, to: 8, wind: 0.5, fly: 14, pull: 4, hold: 2.5, swing: 6, cd: 5, latch: 0.7 };
// hunter: "picks one crew member and always knows where they are (through walls); slow; two fists hover then slam (red
// circle warns), big knockback". chưa xác định: slam from 2.6 m, 1.0 s warning, circle r 1.6 m, knock 7 m/s
export const HU = { from: 2.6, warn: 1.0, r: 1.6, knock: 7, recover: 1.2 };
// headthrower: "throws a blue-fire head that bounces to you and explodes, leaving toxic gas (2 dps for 3 s); you can pick
// up the head and throw it back (hurts other foes, not owner)". chưa xác định: thrown from 3-9 m, wind-up 0.6 s, fuse
// 2.4 s, blast r 2.2 m pow 0.6, gas r 1.8 m, a new head 5 s after
export const HT = { from: 3, to: 9, wind: 0.6, fuse: 2.4, r: 2.2, pow: 0.6, gasR: 1.8, gasT: 3, gasDps: 2, regrow: 5, mass: 3 };
// impostor: "looks like a crew member walking around; reveals and attacks when you are close". chưa xác định: reveals
// within 2.5 m in sight, or when hit; 0.8 s reveal before the chase
export const IM = { reveal: 2.5, grow: 0.8 };

export const moves2 = {
  // ------------------------------------------------------------------ holding someone (wallhand, gacha)
  holdOn(f, who) {
    const G = this.G, P = this.player;
    f.victim = who; f.tickT = 0; f.holdHits = 0;
    if (who === 'P') { P.heldBy = f; P.mash = 0; P.mashSide = 0; if (G.grab?.held) G.grab.release(false); }
    else who.heldBy = f;
    this.log.push(['grabbed', f.kind, who === 'P' ? 'player' : who.crew, +this.time.toFixed(2)]); G.events.emit('foe:grab', { foe: f, who });
    G.audio?.play('punch_hit', { x: f.x, y: f.gy + 1, z: f.z }, 0.6, 0.6);
  },
  letGo(f, why) {
    const P = this.player, v = f.victim;
    if (v === 'P') { if (P.heldBy === f) P.heldBy = null; } else if (v && v.heldBy === f) v.heldBy = null;
    this.log.push(['released', f.kind, why, +this.time.toFixed(2)]); this.G.events.emit('foe:release', { foe: f, why });
    f.victim = null;
  },
  victimPos(f) { const v = f.victim; return v === 'P' ? this.player.position : v ? { x: v.x, z: v.z } : null; },
  victimDown(f) { const v = f.victim; return v === 'P' ? this.player.down : !v || v.down; },
  hurtVictim(f, dmg) { const v = f.victim; if (v === 'P') this.player.hurt(dmg, { x: f.x, z: f.z, kind: f.kind }); else if (v) this.G.bots.hurt(v, dmg, f); },
  /** The player or a crew bot within r of (x, z) on f's floor that is free to grab, or null. */
  grabbable(f, r) {
    const P = this.player;
    if (this.playerAlive() && !P.heldBy && !(P.invisT > 0)) { const p = P.position; if (Math.hypot(p.x - f.x, p.z - f.z) < r && this.reachY(f, P) && this.nav.los(f.x, f.z, p.x, p.z)) return 'P'; }
    for (const b of this.G.bots?.list || []) if (!b.down && !b.heldBy && !(b.invisT > 0) && Math.hypot(b.x - f.x, b.z - f.z) < r && Math.abs((b.gy || 0) - f.gy) < 1) return b;
    return null;
  },

  // ------------------------------------------------------------------ wallhand
  bWallhand(f, dt) {
    if (!f.spot) this.whPlace(f);
    if (f.state === 'hold') {
      if (this.victimDown(f)) { this.letGo(f, 'down'); this.setState(f, 'gone'); return [null, 0, null]; }
      f.tickT += dt; if (f.tickT >= f.def.cd) { f.tickT -= f.def.cd; this.hurtVictim(f, f.dmg); }
      const P = this.player;
      if (f.victim === 'P' && f.stateT < 0.5) {   // the grab yanks your view to the hand
        const p = P.position, want = Math.atan2(-(f.x - p.x), -(f.z - p.z)); let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        P.yaw += d * Math.min(1, dt * 9); P.pitch += (0.3 - P.pitch) * Math.min(1, dt * 9);
      }
      if (f.victim === 'P' && P.mash >= WH.mash) { this.letGo(f, 'mash'); this.setState(f, 'gone'); return [null, 0, null]; }
      if (f.victim !== 'P' && f.stateT > WH.botHold) { this.letGo(f, 'bot'); this.setState(f, 'gone'); return [null, 0, null]; }
      return [null, 0, this.victimPos(f)];
    }
    if (f.state === 'gone') { if (f.stateT > WH.relocate) { this.whPlace(f); this.setState(f, 'lurk'); } return [null, 0, null]; }
    if (f.state === 'recover') { this.setState(f, 'gone'); return [null, 0, null]; }   // stunned off its victim
    if (f.state !== 'lurk') this.setState(f, 'lurk');
    const who = this.grabbable(f, WH.grabR);
    if (who) { this.holdOn(f, who); this.setState(f, 'hold'); }
    return [null, 0, null];
  },
  /** A spot in a wall beside a walkable cell, near home and away from the player; the hand faces out of the wall. */
  whPlace(f) {
    const nav = this.nav, P = this.player, p = this.playerAlive() ? P.position : { x: 1e9, z: 1e9 }, out = [];
    for (let i = 0; i < nav.W * nav.H; i++) {   // every walkable cell (nav.cells keeps only open ones, never by a wall)
      if (!nav.walk[i]) continue;
      const c = nav.center(i); if (Math.hypot(c.x - f.home.x, c.z - f.home.z) > 16 || Math.hypot(c.x - p.x, c.z - p.z) < WH.from) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const gx = Math.floor(c.x) + dx, gz = Math.floor(c.z) + dz; if (this.L.grid[gz * this.L.w + gx] === 2) { out.push({ x: c.x + dx * 0.42, z: c.z + dz * 0.42, yaw: Math.atan2(-dx, -dz) }); break; } }
    }
    const s = out.length ? out[Math.floor(this.rng() * out.length)] : { x: f.home.x, z: f.home.z, yaw: f.yaw };
    f.spot = s; f.x = s.x; f.z = s.z; f.yaw = s.yaw; f.gy = this.nav.heightAt(s.x - Math.sin(s.yaw) * 0.5, s.z - Math.cos(s.yaw) * 0.5); f.y = f.y0 + f.gy;
    if (f.body) { f.body.setTranslation({ x: f.x, y: f.y, z: f.z }, true); f.body.setNextKinematicTranslation({ x: f.x, y: f.y, z: f.z }); }
    if (f.col) f.col.setEnabled(false);   // a hand in the wall, not a pillar in the corridor
    this.log.push(['whPlace', +s.x.toFixed(1), +s.z.toFixed(1)]);
  },

  // ------------------------------------------------------------------ gacha
  bGacha(f, dt) {
    if (f.state === 'hold') {
      if (this.victimDown(f)) { this.letGo(f, 'down'); f.cdT = GA.after; this.setState(f, 'recover'); return [null, 0, null]; }
      if (f.holdHits >= GA.hits) { this.letGo(f, 'hits'); f.cdT = GA.after; f.spinOut = null; this.setState(f, 'recover'); return [null, 0, null]; }
      f.spinK = f.stateT / GA.spin;
      if (f.stateT >= GA.spin) { this.gachaSpin(f); f.cdT = GA.after; this.setState(f, 'recover'); }
      return [null, 0, this.victimPos(f)];
    }
    if (f.state === 'recover') { if (f.stateT > 1) this.setState(f, 'chase'); return [null, 0, null]; }
    // otherwise a chaser that grabs at arm's reach instead of swinging
    const b = this.preyOf(f), P = this.player;
    if (!b && !(f.aware >= 1 && this.playerAlive())) return this.wander(f, dt);
    if (f.state !== 'chase') this.setState(f, 'chase');
    const p = b || P.position;
    if (!b) { if (!f.seen) f.lostT += dt; if (f.lostT > 7 || !f.lastSeen) { f.aware = 0.3; f.target = f.lastSeen; this.setState(f, f.lastSeen ? 'investigate' : 'patrol'); return [null, 0, null]; } }
    if (f.cdT <= 0 && this.dist(f, p) < 1.1) { const who = this.grabbable(f, 1.1); if (who && (who === 'P') === !b) { this.holdOn(f, who); f.spinOut = null; this.setState(f, 'hold'); return [null, 0, p]; } }
    return [b || f.seen ? { x: p.x, z: p.z } : f.lastSeen, f.speed * 1.25, this.dist(f, p) < 3 ? p : null];
  },
  gachaSpin(f) {
    let total = 0; for (const [, w] of GA.wheel) total += w;
    let r = this.rng() * total, out = GA.wheel[0][0]; for (const [k, w] of GA.wheel) { if ((r -= w) < 0) { out = k; break; } }
    if (this.forceSpin) out = this.forceSpin;
    const v = f.victim, P = this.player, max = v === 'P' ? (this.G.run?.hpMax ?? CFG.player.hp) : v.maxHp;
    const heal = (n) => { if (v === 'P') P.hp = Math.min(max, P.hp + n); else v.hp = Math.min(max, v.hp + n); };
    if (out === 'heal') heal(GA.heal); else if (out === 'full') heal(max);
    else if (out === 'hurt') this.hurtVictim(f, GA.loss * this.roster.dmgMul);
    else if (out === 'down') { if (v === 'P') { P.noDownT = 0; P.hurt(P.hp + 999, { x: f.x, z: f.z, kind: f.kind }); } else this.G.bots.hurt(v, v.hp + 999, f); }
    f.spinOut = out; this.log.push(['spin', out]); this.G.events.emit('foe:spin', { foe: f, out });
    this.letGo(f, 'spin');
  },

  // ------------------------------------------------------------------ mummy
  bMummy(f, dt) {
    const P = this.player, G = this.G;
    if (f.state === 'throwAim') {
      f.atk = Math.min(0.5, f.stateT / MU.wind * 0.5);
      if (f.stateT >= MU.wind) {
        const p = P.position, dx = p.x - f.x, dz = p.z - f.z, L = Math.hypot(dx, dz) || 1;
        const hand = { x: f.x, y: f.gy + 1.3, z: f.z }, dir = { x: dx / L, z: dz / L };
        const ray = new this.R.Ray(hand, { x: dir.x, y: 0, z: dir.z });
        const hit = G.phys.world.castRay(ray, 12, true, this.R.QueryFilterFlags.EXCLUDE_DYNAMIC | this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, f.col, undefined, (c) => !this.isActorCollider(c));
        f.tether = { dir, len: 0, wall: hit ? hit.timeOfImpact : 12, mode: 'fly', t: 0 };
        f.cdT = MU.cd; this.setState(f, 'tether'); G.audio?.play('whoosh', { x: f.x, y: f.gy + 1.2, z: f.z }, 0.7, 0.7); this.log.push(['tether', 'throw']);
      }
      return [null, 0, P.position];
    }
    if (f.state === 'tether') return this.tetherStep(f, dt);
    if (f.state === 'swing') {
      const tp = f.swingTo; if (!tp || this.dist(f, tp) < 0.45 || f.driveBlocked || f.stateT > 2) { f.drive = null; f.driveBlocked = false; f.swingTo = null; this.setState(f, 'chase'); return [null, 0, null]; }
      return [null, 0, tp];
    }
    if ((f.mummyCd || 0) > 0) f.mummyCd -= dt;
    if (!f.prey && f.state === 'chase' && f.seen && f.aware >= 1 && this.playerAlive() && f.cdT <= 0) {
      const d = this.dist(f, P.position);
      if (d > MU.from && d < MU.to) { this.setState(f, 'throwAim'); f.atk = 0; return [null, 0, P.position]; }
    }
    return this.bMelee(f, dt);
  },
  tetherStep(f, dt) {
    const T = f.tether, P = this.player;
    T.t += dt;
    if (T.mode === 'fly') {
      T.len += MU.fly * dt;
      const tip = { x: f.x + T.dir.x * T.len, z: f.z + T.dir.z * T.len };
      if (this.playerAlive()) { const p = P.position; if (Math.hypot(p.x - tip.x, p.z - tip.z) < MU.latch && this.reachY(f, P)) { T.mode = 'reel'; T.t = 0; this.log.push(['tether', 'latch']); this.G.events.emit('foe:tether', { foe: f, on: 'player' }); return [null, 0, p]; } }
      if (T.len >= T.wall) {   // the wall: it swings itself over there
        if (T.wall < 12) { f.swingTo = { x: f.x + T.dir.x * (T.wall - 0.6), z: f.z + T.dir.z * (T.wall - 0.6) }; f.drive = { x: T.dir.x * MU.swing, z: T.dir.z * MU.swing }; f.tether = null; this.log.push(['tether', 'wall']); this.setState(f, 'swing'); return [null, 0, f.swingTo]; }
        f.tether = null; this.setState(f, 'chase'); return [null, 0, null];
      }
      return [null, 0, tip];
    }
    // reel the player in
    const p = P.position, dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
    if (!this.playerAlive() || T.t > MU.hold || d < F_REACH) { this.cutTether(f, d < F_REACH ? 'reached' : 'time'); return [null, 0, p]; }
    P.push = { x: dx / d * MU.pull, z: dz / d * MU.pull };
    return [null, 0, p];
  },
  cutTether(f, why) { if (!f.tether) return; if (f.tether.mode === 'reel') this.player.push = null; f.tether = null; this.log.push(['tether', 'cut:' + why]); this.G.events.emit('foe:tetherCut', { foe: f, why }); if (f.state === 'tether') this.setState(f, 'chase'); },

  // ------------------------------------------------------------------ hunter
  bHunter(f, dt) {
    const G = this.G, P = this.player;
    const okMark = (m) => m && (m === 'P' ? this.playerAlive() : !m.down);
    if (!okMark(f.mark)) {
      const c = []; if (this.playerAlive()) c.push('P'); for (const b of G.bots?.list || []) if (!b.down) c.push(b);
      f.mark = c.length ? c[Math.floor(this.rng() * c.length)] : null; if (f.mark) this.log.push(['mark', f.mark === 'P' ? 'player' : f.mark.crew]);
    }
    if (!f.mark) return this.wander(f, dt);
    const mp = f.mark === 'P' ? P.position : f.mark;
    if (f.state === 'warn') {
      if (f.stateT >= HU.warn) this.hunterSlam(f);
      return [null, 0, f.slamAt];
    }
    if (f.state === 'recover') { if (f.stateT > HU.recover) this.setState(f, 'chase'); return [null, 0, mp]; }
    if (f.state !== 'chase') this.setState(f, 'chase');
    f.aware = 1; f.lastSeen = { x: mp.x, z: mp.z };
    if (f.cdT <= 0 && this.dist(f, mp) < HU.from && Math.abs(this.nav.heightAt(mp.x, mp.z) - f.gy) < 1) {
      f.slamAt = { x: mp.x, z: mp.z, y: this.nav.heightAt(mp.x, mp.z) }; this.setState(f, 'warn'); G.audio?.play('roar', { x: f.x, y: f.gy + 1.6, z: f.z }, 0.8, 0.7); this.log.push(['warn', +this.time.toFixed(2)]);
      return [null, 0, f.slamAt];
    }
    return [{ x: mp.x, z: mp.z }, f.speed * 1.25, this.dist(f, mp) < 3 ? mp : null];
  },
  hunterSlam(f) {
    const G = this.G, P = this.player, s = f.slamAt, hit = [];
    // thrown out from the centre of the circle; who stands on the centre is thrown away from the hunter
    const push = (x, z) => { let dx = x - s.x, dz = z - s.z; if (Math.hypot(dx, dz) < 0.3) { dx = x - f.x; dz = z - f.z; } const L = Math.hypot(dx, dz) || 1; return { x: dx / L * HU.knock, z: dz / L * HU.knock }; };
    if (this.playerAlive()) { const p = P.position; if (Math.hypot(p.x - s.x, p.z - s.z) < HU.r && Math.abs(p.y - 0.85 - s.y) < 1.2) { P.hurt(f.dmg, { x: f.x, z: f.z, kind: f.kind }); const k = push(p.x, p.z); P.shove(k.x, k.z); hit.push('player'); } }
    for (const b of G.bots?.list || []) if (!b.down && Math.hypot(b.x - s.x, b.z - s.z) < HU.r) { G.bots.hurt(b, f.dmg, f); hit.push(b.crew); this.log.push(['hitBot', f.kind, b.crew, +f.dmg.toFixed(1)]); }
    for (const o of this.list) if (o !== f && !o.dead && o.def.beh !== 'ghost' && Math.hypot(o.x - s.x, o.z - s.z) < HU.r) { const k = push(o.x, o.z); this.hurtFoe(o, f.dmg, { x: k.x / HU.knock, z: k.z / HU.knock }, HU.knock); hit.push('foe:' + o.kind); }
    G.audio?.play('stomp', { x: s.x, y: s.y + 0.1, z: s.z }, 1.2, 0.8); G.noise?.emit({ x: s.x, z: s.z, r: 8, str: 1.5, src: 'slam' });
    G.melee?.fx?.burst?.(new THREE.Vector3(s.x, s.y + 0.1, s.z), new THREE.Vector3(0, 1, 0), 14, 4);
    this.log.push(['slam', hit]); G.events.emit('foe:slam', { foe: f, hit });
    f.atkEnd = this.time; f.cdT = f.def.cd; this.setState(f, 'recover');
  },

  // ------------------------------------------------------------------ headthrower
  bHeadthrower(f, dt) {
    const P = this.player;
    if ((f.regrowT || 0) > 0) f.regrowT -= dt;
    if (f.state === 'throwAim') { f.atk = Math.min(0.5, f.stateT / HT.wind * 0.5); if (f.stateT >= HT.wind) { this.throwHead(f); f.cdT = f.def.cd; this.setState(f, 'chase'); } return [null, 0, P.position]; }
    if (!(f.aware >= 1 && this.playerAlive())) return this.wander(f, dt);
    if (f.state !== 'chase') this.setState(f, 'chase');
    const p = P.position, d = this.dist(f, p);
    if (!f.seen) f.lostT += dt;
    if (f.lostT > 7 || !f.lastSeen) { f.aware = 0.3; f.target = f.lastSeen; this.setState(f, f.lastSeen ? 'investigate' : 'patrol'); return [null, 0, null]; }
    if (f.seen && !(f.regrowT > 0) && f.cdT <= 0 && d >= HT.from && d <= HT.to) { this.setState(f, 'throwAim'); return [null, 0, p]; }
    if (f.seen && d < HT.from) return [this.backOff(f, p), f.speed, p];
    if (f.seen && d <= HT.to) return [null, 0, p];
    return [f.seen ? { x: p.x, z: p.z } : f.lastSeen, f.speed, f.seen ? p : null];
  },
  throwHead(f) {
    const G = this.G, P = this.player, { R, world } = G.phys, p = P.position;
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw), at = { x: f.x + s * 0.5, y: f.gy + 1.7, z: f.z + c * 0.5 };
    const dx = p.x - at.x, dz = p.z - at.z, L = Math.hypot(dx, dz) || 1, T = Math.max(0.5, L / 8);   // a lob that lands at your feet, then bounces
    const vy = ((p.y - 0.8) - at.y + 0.5 * CFG.gravity * T * T) / T;
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setLinvel(dx / T, vy, dz / T).setCcdEnabled(true).setLinearDamping(0.1));
    const col = world.createCollider(R.ColliderDesc.ball(0.2).setRestitution(0.55).setFriction(0.6).setDensity(HT.mass / (4 / 3 * Math.PI * 0.008)), body);
    const g = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4, metalness: 0.6, emissive: 0x1a6aff, emissiveIntensity: 0.6 }));
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x48a8ff, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    fire.position.y = 0.26; g.add(skull, fire); for (const ex of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a20, toneMapped: false })); e.position.set(ex, 0.03, 0.17); g.add(e); }
    G.scene.add(g);
    const rec = { body, col, mesh: g, tag: 'head', grabbable: true, kg: HT.mass, mass: HT.mass, size: 'small', prevVel: { x: 0, y: 0, z: 0 }, foeHead: true, owner: f, fuse: HT.fuse, fire };
    G.phys.props.push(rec); (this.heads ||= []).push(rec);
    f.regrowT = HT.regrow; f.atkEnd = this.time;
    G.audio?.play('whoosh', { x: at.x, y: at.y, z: at.z }, 0.8, 0.8); this.log.push(['head', 'throw']); G.events.emit('foe:head', { foe: f, rec });
  },
  /** Heads burn down and blow (not hurting their owner), gas clouds hurt 2 hp/s. Called every step. */
  stepHeads(dt) {
    const G = this.G, P = this.player;
    for (const h of [...(this.heads || [])]) {
      if (h.dead) continue;
      h.fuse -= dt; h.fire.scale.setScalar(0.8 + 0.4 * Math.random()); h.fire.material.opacity = 0.5 + 0.4 * Math.random();
      if (h.fuse > 0) continue;
      if (G.grab?.held === h) G.grab.release(false);
      const t = h.body.translation(); this.explode(t.x, t.z, HT.r, HT.pow, h.owner);
      (this.gas ||= []).push({ x: t.x, z: t.z, y: this.nav.heightAt(t.x, t.z), t: 0, mesh: this.gasMesh(t.x, this.nav.heightAt(t.x, t.z), t.z) });
      h.dead = true; G.scene.remove(h.mesh); const i = G.phys.props.indexOf(h); if (i >= 0) G.phys.props.splice(i, 1); G.phys.world.removeRigidBody(h.body);
      this.heads.splice(this.heads.indexOf(h), 1); this.log.push(['head', 'blow']);
    }
    for (const g of [...(this.gas || [])]) {
      g.t += dt; g.acc = (g.acc || 0) + dt;
      g.mesh.material.opacity = 0.35 * Math.min(1, (HT.gasT - g.t) / 0.6); g.mesh.scale.setScalar(1 + 0.15 * Math.sin(g.t * 3));
      if (g.acc >= 0.5) {   // 2 hp/s, dealt every half second
        g.acc -= 0.5;
        if (this.playerAlive()) { const p = P.position; if (Math.hypot(p.x - g.x, p.z - g.z) < HT.gasR && Math.abs(p.y - 0.85 - g.y) < 1.5) { P.hurt(HT.gasDps * 0.5, { x: g.x, z: g.z, kind: 'gas' }); this.log.push(['gas', 'player']); } }
        for (const b of G.bots?.list || []) if (!b.down && Math.hypot(b.x - g.x, b.z - g.z) < HT.gasR) G.bots.hurt(b, HT.gasDps * 0.5, null);
      }
      if (g.t >= HT.gasT) { this.root.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); this.gas.splice(this.gas.indexOf(g), 1); }
    }
  },
  gasMesh(x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(HT.gasR, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6aff70, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    m.position.set(x, y, z); m.scale.y = 0.6; this.root.add(m); return m;
  },

  // ------------------------------------------------------------------ impostor
  bImpostor(f, dt) {
    const P = this.player;
    if (!f.revealed) {
      f.quiet = true; f.aware = 0;
      if (this.playerAlive() && !(P.invisT > 0)) { const p = P.position; if (this.dist(f, p) < IM.reveal && this.nav.los(f.x, f.z, p.x, p.z) && this.reachY(f, P)) this.impReveal(f); }
      if (!f.revealed) {   // walks the house like a crew bot would
        if (f.state !== 'patrol') this.setState(f, 'patrol');
        if (!f.target || this.dist(f, f.target) < 0.7 || f.stateT > 20) { f.target = this.nav.randomNear(this.rng, f.x, f.z, 4, 14); f.stateT = 0; }
        return [f.target, CFG.player.walk * 0.9, null];
      }
    }
    if (f.state === 'reveal') { if (f.stateT >= IM.grow) { f.aware = 1; f.lastSeen = this.playerAlive() ? { x: P.position.x, z: P.position.z } : null; this.setState(f, 'chase'); } return [null, 0, this.playerAlive() ? P.position : null]; }
    return this.bMelee(f, dt);
  },
  impReveal(f) {
    if (f.revealed) return;
    f.revealed = true; f.quiet = false; this.setState(f, 'reveal');
    this.G.audio?.play('roar', { x: f.x, y: f.gy + 1.4, z: f.z }, 1, 1.1); this.log.push(['reveal', +this.time.toFixed(2)]); this.G.events.emit('foe:reveal', { foe: f });
  },

  // ------------------------------------------------------------------ looks
  movesFxB(dt) {
    const G = this.G, P = this.player;
    // mummy cloth line: from its hand to the tip (flying) or to your chest (reeling)
    if (!this.clothGeo) {
      this.clothGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true); this.clothGeo.translate(0, 0.5, 0);
      this.clothMat = new THREE.MeshStandardMaterial({ color: 0xd9caa0, roughness: 0.9 }); this.cloths = [];
      this.ringGeo = new THREE.RingGeometry(0.9, 1, 48); this.ringGeo.rotateX(-Math.PI / 2);
      this.discGeo = new THREE.CircleGeometry(1, 48); this.discGeo.rotateX(-Math.PI / 2);
      this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
      this.discMat = new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false });
      this.rings = [];
    }
    const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(); let n = 0, k = 0;
    for (const f of this.list) {
      if (f.dead) continue;
      if (f.tether) {
        const a = { x: f.x, y: f.gy + 1.3, z: f.z }, T = f.tether;
        const b = T.mode === 'reel' ? (() => { const p = P.position; return { x: p.x, y: p.y + 0.1, z: p.z }; })() : { x: f.x + T.dir.x * T.len, y: a.y - 0.1, z: f.z + T.dir.z * T.len };
        let c = this.cloths[n]; if (!c) { c = new THREE.Mesh(this.clothGeo, this.clothMat); c.frustumCulled = false; this.root.add(c); this.cloths.push(c); }
        v.set(b.x - a.x, b.y - a.y, b.z - a.z); const L = v.length(); v.multiplyScalar(1 / (L || 1));
        c.position.set(a.x, a.y, a.z); c.quaternion.setFromUnitVectors(up, v); c.scale.set(1, L, 1); c.visible = true; n++;
      }
      if (f.state === 'warn' && f.slamAt) {
        let r = this.rings[k]; if (!r) { r = { ring: new THREE.Mesh(this.ringGeo, this.ringMat), disc: new THREE.Mesh(this.discGeo, this.discMat) }; r.ring.renderOrder = r.disc.renderOrder = 6; this.root.add(r.ring, r.disc); this.rings.push(r); }
        const s = f.slamAt, q = Math.min(1, f.stateT / HU.warn);
        r.ring.position.set(s.x, s.y + 0.03, s.z); r.ring.scale.setScalar(HU.r); r.disc.position.set(s.x, s.y + 0.025, s.z); r.disc.scale.setScalar(HU.r * q);
        r.ring.visible = r.disc.visible = true; k++;
      }
    }
    for (let i = n; i < this.cloths.length; i++) this.cloths[i].visible = false;
    for (let i = k; i < this.rings.length; i++) this.rings[i].ring.visible = this.rings[i].disc.visible = false;
    this.ringMat.opacity = 0.6 + 0.35 * Math.abs(Math.sin(this.time * 10));
    this.heldHud();
  },
  /** While held: two arrows to mash (wallhand) or a spinning wheel (gacha), drawn, no words (HUD rule). */
  heldHud() {
    const P = this.player, f = P.heldBy, root = document.querySelector('.hx');
    if (!root) return;
    let el = this.hudEl;
    if (!el) {
      el = this.hudEl = document.createElement('div'); el.className = 'hx-held';
      Object.assign(el.style, { position: 'absolute', left: '50%', top: '62%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', display: 'none' });
      const seg = GA.wheel.map((w, i) => { const a0 = i / GA.wheel.length * Math.PI * 2, a1 = (i + 1) / GA.wheel.length * Math.PI * 2, c = ['#5a5f66', '#5ad07a', '#3ac0ff', '#ff6a4a', '#1a1a1a'][i];
        return `<path d="M0 0 L${(Math.sin(a0) * 40).toFixed(1)} ${(-Math.cos(a0) * 40).toFixed(1)} A40 40 0 0 1 ${(Math.sin(a1) * 40).toFixed(1)} ${(-Math.cos(a1) * 40).toFixed(1)} Z" fill="${c}" stroke="#111" stroke-width="2"/>`; }).join('');
      el.innerHTML = `<svg class="mash" width="150" height="60" viewBox="0 0 150 60"><path class="l" d="M10 30 L45 8 L45 52 Z" fill="#fff"/><path class="r" d="M140 30 L105 8 L105 52 Z" fill="#fff"/><rect x="55" y="26" width="40" height="8" rx="4" fill="#333"/><rect class="bar" x="55" y="26" width="0" height="8" rx="4" fill="#6df0a8"/></svg>` +
        `<svg class="wheel" width="96" height="104" viewBox="-48 -56 96 104"><g class="w">${seg}</g><path d="M0 -42 L-7 -54 L7 -54 Z" fill="#ffd040"/></svg>`;
      root.appendChild(el);
    }
    const kind = f?.def?.beh;   // only the wall hand (mash) and the gacha (wheel) have a prompt; a cage or a vampire does not
    if (kind !== 'wallhand' && kind !== 'gacha') { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const gacha = kind === 'gacha';
    el.querySelector('.mash').style.display = gacha ? 'none' : 'block'; el.querySelector('.wheel').style.display = gacha ? 'block' : 'none';
    if (gacha) el.querySelector('.w').setAttribute('transform', `rotate(${(f.stateT * 720 * Math.max(0.2, 1 - f.stateT / GA.spin)).toFixed(1)})`);
    else { const side = P.mashSide || 0; el.querySelector('.l').setAttribute('fill', side < 0 ? '#ffd040' : '#fff'); el.querySelector('.r').setAttribute('fill', side > 0 ? '#ffd040' : '#fff'); el.querySelector('.bar').setAttribute('width', (40 * Math.min(1, (P.mash || 0) / WH.mash)).toFixed(1)); }
  },
};
const F_REACH = 1.1;
