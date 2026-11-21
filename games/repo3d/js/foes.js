// Foes: robot monsters that sleep, wake, notice the player by sight / hearing / noise, chase, attack and can be hit.
// Numbers come from the source table (CFG/foes.json + G10_FoeKinds sight/hear), speeds px/s / 24.
// State machine per foe: sleep -> patrol -> investigate (noise) -> chase (sight) -> attack -> recover, plus behaviour states.
// Walkers are Rapier kinematic capsules moved by one shared character controller; the ghost has no collider at all.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { buildRobot } from './robots.js';
import { navFor } from './nav.js';
import { moves } from './foe-moves.js';
import { moves2 } from './foe-moves-b.js';
import { moves3 } from './foe-moves-c.js';
import { moves4, BOSS } from './bosses.js';

const PX = 1 / 24;
const TAU = Math.PI * 2;

// beh: behaviour key; generic = melee chaser on the kind's own stats
export const FOE_KINDS = {
  gunner: { hp: 110, dmg: 22, cd: 0.9, speed: 58, sight: 9, hear: 0, beh: 'gunner' },
  rook: { hp: 160, dmg: 26, cd: 1.2, speed: 54, sight: 9, hear: 0, beh: 'rook' },
  banger: { hp: 50, dmg: 0, cd: 0.9, speed: 54, sight: 6, hear: 4.5, beh: 'banger', noLoot: true },
  gnome: { hp: 20, dmg: 5, cd: 0.7, speed: 76, sight: 7, hear: 5, beh: 'melee', lootDmg: 9, wind: 0.34, noLoot: true },
  mimic: { hp: 70, dmg: 18, cd: 0.75, speed: 82, sight: 8, hear: 7, beh: 'melee' },
  ghost: { hp: 999, dmg: 14, cd: 1.4, speed: 20, sight: 14, hear: 0, beh: 'ghost', immune: true, noLoot: true },
  wallhand: { hp: 999, dmg: 6, cd: 1.5, speed: 0, sight: 2.5, hear: 0, beh: 'wallhand', immune: true, noLoot: true, fixed: true },
  mummy: { hp: 240, dmg: 18, cd: 1.3, speed: 34, sight: 9, hear: 3, beh: 'mummy' },
  brat: { hp: 50, dmg: 0, cd: 1, speed: 96, sight: 8, hear: 6, beh: 'brat' },
  headthrower: { hp: 60, dmg: 0, cd: 1, speed: 50, sight: 9, hear: 3, beh: 'headthrower' },
  minelayer: { hp: 50, dmg: 0, cd: 1, speed: 64, sight: 6, hear: 5, beh: 'minelayer' },
  impostor: { hp: 70, dmg: 16, cd: 0.9, speed: 90, sight: 9, hear: 5, beh: 'impostor' },
  gacha: { hp: 50, dmg: 0, cd: 1, speed: 66, sight: 9, hear: 5, beh: 'gacha' },
  hunter: { hp: 360, dmg: 32, cd: 1, speed: 24, sight: 0, hear: 0, beh: 'hunter', omniscient: true },
  angel: { hp: 999, dmg: 30, cd: 6, speed: 60, sight: 9, hear: 0, beh: 'angel', immune: true, noLoot: true, fixed: true },
  // theme bosses (bosses.js): no respawn, stun capped, little knockback
  vampire: { hp: 450, dmg: 12, cd: 1, speed: 0, sight: 0, hear: 0, beh: 'vampire', boss: true },
  nurse: { hp: 160, dmg: 12, cd: 1, speed: 42, sight: 9, hear: 5, beh: 'nurse', boss: true, laser: 0xff5ab4 },
  joker: { hp: 150, dmg: 20, cd: 1, speed: 60, sight: 9, hear: 5, beh: 'joker', boss: true },
  alien: { hp: 420, dmg: 22, cd: 1, speed: 58, sight: 9, hear: 5, beh: 'alien', boss: true, laser: 0xa040ff },
  pharaoh: { hp: 520, dmg: 30, cd: 1.6, speed: 20, sight: 9, hear: 3, beh: 'pharaoh', boss: true },
  mirror: { hp: 84, dmg: 10, cd: 1.2, speed: 58, sight: 9, hear: 0, beh: 'mirror', noLoot: true, fixed: true },
};
export const GENERIC_KINDS = Object.keys(FOE_KINDS).filter((k) => FOE_KINDS[k].beh === 'melee' && k !== 'gnome');

// stage_theme_houses (identical for the 5 themes)
export const HOUSE_ROSTER = {
  1: { hpMul: 1, dmgMul: 1, foeCount: 3, kindCount: 2, foes: ['banger', 'brat'] },
  2: { hpMul: 1.2, dmgMul: 1, foeCount: 5, kindCount: 3, foes: ['banger', 'gnome', 'minelayer', 'ghost'] },
  3: { hpMul: 1.5, dmgMul: 1.1, foeCount: 7, kindCount: 4, foes: ['rook', 'gnome', 'headthrower', 'wallhand', 'gacha', 'banger', 'angel'] },
  4: { hpMul: 1.7, dmgMul: 1.2, foeCount: 7, kindCount: 5, foes: ['rook', 'gunner', 'mummy', 'impostor', 'hunter', 'brat', 'gnome', 'angel'] },
  5: { hpMul: 2, dmgMul: 1.35, foeCount: 11, kindCount: 6, foes: ['rook', 'gunner', 'mummy', 'headthrower', 'wallhand', 'impostor', 'ghost', 'minelayer', 'gacha', 'hunter', 'mirror', 'angel'] },
};

export const FOE_RULES = {
  radius: 9 * PX, chaseMul: 1.25, reach: 1.2, reachY: 1.6, bayEvery: 2, bayR: 2.2, bayV: 2.5, whiff: 1.25, wind: 0.45, lootDmg: 4,
  seeStand: 1.0, seeCrouch: 2.5, cone: 1.1, closeSee: 3, awareDecay: 0.35,
  sleep: [20, 30], respawn: 45, giveUp: 7, lookAround: 3, stuckSec: 2.5, stuckDist: 10 * PX,
  hitMinSpeed: 3, hitK: 0.022, hitMin: 5, hitMax: 200, knockMax: 7,
  fuse: 2.5, fuseClose: 0.5, blastR: 3.5, blastLoot: 420, blastFoe: 340, blastPlayer: 55,
  mineEvery: [8, 12], mineMax: 4, mineArm: 1.5, mineR: 2.5, minePow: 0.8, mineTrigger: 0.7,
  bratBreath: 2, bratThrowR: 9, bratHits: 4, bratThrowDmg: 12, bratLossMax: 500,
  ghostTrack: 9, maxOrbs: 3,
};
const F = FOE_RULES;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const sizeForValue = (v) => (v <= 1100 ? 'small' : v <= 3200 ? 'medium' : 'big');

export class Foes {
  constructor(G, house) {
    this.G = G;
    this.house = house;
    this.L = house.layout;
    this.nav = navFor(house.layout);
    this.list = [];
    this.mines = [];
    this.fx = [];
    this.time = 0;
    this.log = [];
    const hi = Math.max(1, Math.min(5, this.L.meta?.houseIndex || 1));
    this.houseIndex = hi;
    this.roster = HOUSE_ROSTER[hi];
    this.rng = mulberry32(((this.L.meta?.seed ?? 7) * 7349 + hi * 31) | 0);
    const { R, world } = G.phys;
    this.R = R;
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setSlideEnabled(true);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    this.foeBodies = new Set();
    this.foeCols = new Set();
    // ramps and the solid rows under them: foes walk the nav height map there instead of colliding (house3d stairCols)
    this.stairH = new Set(); for (const b of house?.stairCols || []) for (let i = 0; i < b.numColliders(); i++) this.stairH.add(b.collider(i).handle);
    this.root = new THREE.Group(); this.root.name = 'foes'; G.scene.add(this.root);
    this.mineGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.07, 14);
    this.mineMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 });
    this.mineLed = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
    this.ledGeo = new THREE.SphereGeometry(0.03, 8, 6);
    this.blastGeo = new THREE.SphereGeometry(1, 20, 14);
  }

  // ------------------------------------------------------------------ spawning
  /** Spawn the house roster at layout foe points away from the truck room. opts: { kinds, sleep } */
  spawnRoster(opts = {}) {
    const rs = this.roster, rng = this.rng, L = this.L;
    const st = this.house.spawn;
    const truckId = L.truck?.roomId ?? 0;
    let pts = L.foes.filter((p) => p.roomId !== truckId && Math.hypot(p.x + 0.5 - st.x, p.y + 0.5 - st.z) > 10);
    if (!pts.length) pts = L.foes.slice();
    pts = shuffle(pts.slice(), rng);
    let kinds = opts.kinds;
    if (!kinds) {
      const extra = rs.foes.filter((k) => k === 'angel' || k === 'mirror');
      const base = shuffle(rs.foes.filter((k) => k !== 'angel' && k !== 'mirror'), rng).slice(0, rs.kindCount);
      kinds = [];
      for (let i = 0; i < rs.foeCount; i++) kinds.push(base[i % base.length]);
      kinds.push(...extra);
    }
    const out = [];
    kinds.forEach((k, i) => {
      const p = pts[i % pts.length];
      const off = i >= pts.length ? 0.8 * Math.floor(i / pts.length) : 0;
      const sleep = opts.sleep ?? (F.sleep[0] + (F.sleep[1] - F.sleep[0]) * rng());
      out.push(this.spawn(k, p.x + 0.5 + off, p.y + 0.5, { sleep, yaw: rng() * TAU }));
    });
    return out;
  }

  /** Spawn one foe at world (x, z). opts: { sleep, yaw, state } */
  spawn(kind, x, z, opts = {}) {
    const def = FOE_KINDS[kind];
    if (!def) throw new Error(`foe kind not found: ${kind}`);
    const rs = this.roster;
    const robot = buildRobot({ kind: def.boss ? 'boss' : 'foe', id: kind });
    robot.root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    this.root.add(robot.root);
    const h = Math.min(1.9, Math.max(0.6, robot.height));
    const r = F.radius;
    const hh = Math.max(0.05, (h - 2 * r) / 2);
    const i = this.nav.nearest(x, z, 4);
    if (i >= 0 && def.beh !== 'ghost') { const c = this.nav.center(i); if (!this.nav.okW(x, z)) { x = c.x; z = c.z; } }
    const f = {
      id: (this.nextId = (this.nextId || 0) + 1), kind, def, robot, h, r, hh,
      hp: def.hp * (def.immune ? 1 : rs.hpMul), maxHp: def.hp * (def.immune ? 1 : rs.hpMul), dmg: def.dmg * rs.dmgMul,
      speed: def.speed * PX, x, z, y0: r + hh + 0.1, gy: this.nav.heightAt(x, z), y: 0, yaw: opts.yaw ?? 0, home: { x, z },
      state: opts.sleep > 0 ? 'sleep' : (opts.state || 'patrol'), stateT: 0, sleep: opts.sleep || 0,
      aware: 0, target: null, lastSeen: null, seen: false, lostT: 0,
      path: null, pathI: 0, pathGoal: null, repathT: 0, stuckT: 0, stuckRef: { x, z },
      cdT: 0, swingT: 0, atk: 0, hurtT: 0, knock: { x: 0, z: 0 }, moveSpeed: 0,
      carry: null, carryHits: 0, fuse: -1, noiseId: this.G.noise?.lastId() || 0, waitT: 0, mineT: 8 + 4 * this.rng(),
      thinkT: this.rng() * 0.1, dead: false, downT: 0, respawnT: 0, orbs: 0, stealCd: 0,
    };
    f.y = f.y0 + f.gy;
    if (def.beh !== 'ghost') {
      const { R, world } = this.G.phys;
      f.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, f.y, z));
      f.col = world.createCollider(R.ColliderDesc.capsule(hh, r).setFriction(0.2), f.body);
      this.foeBodies.add(f.body.handle);
      this.foeCols.add(f.col.handle);
    }
    this.list.push(f);
    if (def.beh === 'wallhand') this.whPlace(f);   // into a wall right away, also while asleep
    if (def.beh === 'mirror') { f.sleep = 0; this.mirrorSetup(f, opts.partnerOf || null); }   // a glass in a wall, paired
    if (def.boss) f.noRespawn = true;
    if (def.beh === 'angel') { f.sleep = 0; f.state = 'away'; f.awayT = this.angelWait(); if (f.col) f.col.setEnabled(false); }
    this.place(f);
    return f;
  }

  // ------------------------------------------------------------------ helpers
  get player() { return this.G.player; }
  playerAlive() { return this.player && !this.player.down; }
  setState(f, s) { if (f.state !== s) { f.state = s; f.stateT = 0; } }
  dist(f, p) { return Math.hypot(p.x - f.x, p.z - f.z); }

  /** Can f see the player now? Cone, grid LOS, then a physics ray (closed doors and furniture block it). */
  canSee(f) {
    const P = this.player; if (!this.playerAlive() || P.invisT > 0) return false;
    const def = f.def;
    if (def.omniscient) return true;
    const p = P.position, d = this.dist(f, p);
    if (def.beh === 'ghost') return d < (f.state === 'chase' ? def.sight : F.ghostTrack);
    if (!(def.sight > 0) || d > def.sight) return false;
    const a = Math.atan2(p.x - f.x, p.z - f.z);
    if (Math.abs(angDiff(a, f.yaw)) > F.cone && d > F.closeSee) return false;
    if (!this.nav.los(f.x, f.z, p.x, p.z)) return false;
    const eye = { x: f.x, y: f.gy + Math.min(1.3, f.h * 0.8), z: f.z };
    const tgt = P.camPos;
    const dx = tgt.x - eye.x, dy = tgt.y - 0.25 - eye.y, dz = tgt.z - eye.z, L = Math.hypot(dx, dy, dz);
    const ray = new this.R.Ray(eye, { x: dx / L, y: dy / L, z: dz / L });
    const hit = this.G.phys.world.castRay(ray, L, true, this.R.QueryFilterFlags.EXCLUDE_DYNAMIC | this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, f.col);
    if (!hit || hit.timeOfImpact > L - 0.3) return true;
    const hc = hit.collider.handle;
    return hc === P.col.handle || this.foeCols.has(hc);
  }

  crouched() { return this.player.eye < (CFG.player.eye + CFG.player.crouchEye) / 2; }

  // ------------------------------------------------------------------ main step
  step(dt) {
    this.time += dt;
    const P = this.player;
    this.lootHits(dt);
    this.projectiles();
    this.stepHeads(dt);
    this.stepAngelLights(dt);
    this.stepBosses(dt);
    for (const f of this.list) {
      if (f.dead) { this.stepDead(f, dt); continue; }
      f.stateT += dt;
      f.cdT = Math.max(0, f.cdT - dt);
      f.hurtT = Math.max(0, f.hurtT - dt);
      if (f.spin) { f.spinA = (f.spinA || 0) + f.spin * dt; f.spin *= Math.exp(-dt * 5); f.spinA *= Math.exp(-dt * 3); if (Math.abs(f.spin) < 0.01) f.spin = 0; }
      if (f.flyT > 0) f.flyT = Math.max(0, f.flyT - dt);
      f.stealCd = Math.max(0, f.stealCd - dt);
      if (f.vulnT > 0) f.vulnT = Math.max(0, f.vulnT - dt);
      if (f.slowT > 0) f.slowT = Math.max(0, f.slowT - dt);
      if (f.markT > 0) f.markT = Math.max(0, f.markT - dt);
      // skills (js/skills.js): stunned / frozen foes stand still; a lured foe walks to the decoy and ignores everyone
      if (f.stunT > 0 && (f.tether || f.victim)) { this.cutTether(f, 'stun'); if (f.victim) this.letGo(f, 'stun'); if (f.state === 'hold' || f.state === 'tether') this.setState(f, 'recover'); }   // a stun breaks a tether and a hold
      if (f.stunT > 0) { f.stunT = Math.max(0, f.stunT - dt); if (f.stunT === 0) f.frozen = false; f.atk = 0; this.move(f, dt, null, 0, null); if (f.carry) this.holdCarry(f); continue; }
      if (f.lureT > 0) {
        f.lureT = Math.max(0, f.lureT - dt); f.aware = 0; f.lastSeen = null; f.prey = null;
        if (f.state !== 'investigate') this.setState(f, 'investigate');
        f.target = f.lure;
        const far = this.dist(f, f.lure) > 0.9;
        this.move(f, dt, far ? f.lure : null, far ? f.speed * F.chaseMul : 0, f.lure);
        if (f.carry) this.holdCarry(f);
        continue;
      }
      let goal = null, speed = 0, face = null;
      if (f.state === 'sleep') {
        f.sleep -= dt;
        const e = this.G.noise?.heard(f.x, f.z, f.def.hear || 3, f.noiseId);
        if (e) f.noiseId = e.id;
        if (e && e.str >= 1.2) { this.wake(f); this.investigate(f, e); }
        else if (f.sleep <= 0) { this.wake(f); this.setState(f, 'patrol'); }
      } else {
        f.thinkT -= dt;
        if (f.thinkT <= 0) { this.think(f, 0.1); f.thinkT += 0.1; }
        [goal, speed, face] = this.behave(f, dt);
      }
      this.move(f, dt, goal, speed, face);
      if (f.carry) this.holdCarry(f);
    }
    this.stepMines(dt);
    if (P && !P.down && P.hp <= 0) P.goDown?.();
  }

  wake(f) { f.sleep = 0; if (f.state === 'sleep') this.setState(f, 'patrol'); }

  investigate(f, e) {
    if (f.state === 'chase' || f.state === 'fuse' || f.carry) return;
    f.target = { x: e.x, z: e.z };
    this.setState(f, 'investigate');
    this.log.push(['investigate', f.kind, e.src, +this.time.toFixed(2)]);
  }

  /** 10 Hz perception: sight builds awareness over time, noise sends it to look. */
  think(f, dt) {
    const P = this.player;
    f.seen = this.canSee(f);
    if (f.seen) {
      const rate = 1 / (this.crouched() ? F.seeCrouch : F.seeStand);
      f.aware = Math.min(1, f.aware + dt * rate * (f.def.beh === 'ghost' || f.def.omniscient ? 4 : 1));
      if (f.aware >= 1) {
        const p = P.position; f.lastSeen = { x: p.x, z: p.z }; f.lostT = 0;
        if (f.spottedAt === undefined) { f.spottedAt = this.time; this.log.push(['spot', f.kind, +this.time.toFixed(2)]); this.G.events.emit('foe:spot', { foe: f }); }
      }
    } else if (f.state !== 'chase') f.aware = Math.max(0, f.aware - dt * F.awareDecay);
    const e = this.G.noise?.heard(f.x, f.z, f.def.hear, f.noiseId);
    if (e) {
      f.noiseId = e.id;
      if (e.src === 'walk' || e.src === 'run' || e.src === 'sneak') {
        f.aware = Math.min(1, f.aware + 0.4 * Math.min(1, e.str));
        if (f.aware >= 1 && this.playerAlive()) { f.lastSeen = { x: e.x, z: e.z }; f.lostT = 0; }
        else this.investigate(f, e);
      } else this.investigate(f, e);
    }
    if (!this.playerAlive()) { f.aware = 0; f.lastSeen = null; if (f.state === 'chase') this.setState(f, 'patrol'); }
    if (!f.seen && !f.prey && (f.def.beh === 'melee' || f.def.beh === 'gunner' || f.def.beh === 'rook' || f.def.beh === 'gacha' || f.def.beh === 'mummy' || (f.def.beh === 'impostor' && f.revealed)) && f.def.speed > 0 && f.state !== 'chase' && f.state !== 'attack') {
      const b = this.botInSight(f); if (b) this.provoke(f, b, 4);
    }
  }

  /** A crew bot this foe can see (cone + grid LOS), or null. */
  botInSight(f) {
    const bots = this.G.bots?.list; if (!bots || !(f.def.sight > 0)) return null;
    for (const b of bots) {
      if (b.down || b.invisT > 0) continue;
      const d = Math.hypot(b.x - f.x, b.z - f.z); if (d > f.def.sight) continue;
      if (Math.abs(angDiff(Math.atan2(b.x - f.x, b.z - f.z), f.yaw)) > F.cone && d > F.closeSee) continue;
      if (this.nav.los(f.x, f.z, b.x, b.z)) return b;
    }
    return null;
  }

  /** f hunts bot b for t seconds (a guard hit it, or it saw the bot). */
  provoke(f, b, t) {
    if (f.dead || !b || b.down) return;
    if (f.prey !== b) this.log.push(['prey', f.kind, b.crew]);
    f.prey = b; f.preyUntil = this.time + t;
    if (f.state === 'sleep') this.wake(f);
  }

  /** Behaviour dispatch -> [goal {x,z} | null, speed m/s, face {x,z} | null]. */
  behave(f, dt) {
    switch (f.def.beh) {
      case 'banger': return this.bBanger(f, dt);
      case 'brat': return this.bBrat(f, dt);
      case 'minelayer': return this.bMinelayer(f, dt);
      case 'gunner': return this.bGunner(f, dt);
      case 'rook': return this.bRook(f, dt);
      case 'wallhand': return this.bWallhand(f, dt);
      case 'gacha': return this.bGacha(f, dt);
      case 'mummy': return this.bMummy(f, dt);
      case 'hunter': return this.bHunter(f, dt);
      case 'headthrower': return this.bHeadthrower(f, dt);
      case 'impostor': return this.bImpostor(f, dt);
      case 'angel': return this.bAngel(f, dt);
      case 'mirror': return this.bMirror(f, dt);
      case 'vampire': return this.bVampire(f, dt);
      case 'nurse': return this.bNurse(f, dt);
      case 'alien': return this.bAlien(f, dt);
      case 'pharaoh': return this.bPharaoh(f, dt);
      case 'joker': return this.bJoker(f, dt);
      default: return this.bMelee(f, dt);
    }
  }

  // patrol / investigate shared by every behaviour
  wander(f, dt) {
    if (f.state === 'investigate' && f.target) {
      const d = this.dist(f, f.target);
      if (d > 0.8 && f.stateT < 12) return [f.target, f.speed, null];
      if (f.lookT === undefined || f.stateT < 0.2) f.lookT = 0;
      f.lookT += dt;
      if (f.lookT > F.lookAround) { f.lookT = undefined; this.setState(f, 'patrol'); f.target = null; }
      f.yaw += dt * 1.6 * Math.sin(f.stateT * 1.3);
      return [null, 0, null];
    }
    if (f.state !== 'patrol') this.setState(f, 'patrol');
    if (f.waitT > 0) { f.waitT -= dt; return [null, 0, null]; }
    if (f.noPathAt !== undefined && this.time - f.noPathAt < 0.2) { f.noPathAt = undefined; f.target = null; }
    if (!f.target || this.dist(f, f.target) < 0.7 || f.stateT > 20) {
      if (f.target) { f.waitT = 1 + 2 * this.rng(); f.target = null; f.stateT = 0; return [null, 0, null]; }
      f.target = f.def.beh === 'ghost' ? this.ghostSpot(f) : this.nav.randomNear(this.rng, f.x, f.z, 4, 14);
      f.stateT = 0;
    }
    return [f.target, f.speed * 0.8, null];
  }

  ghostSpot(f) {
    for (let k = 0; k < 20; k++) {
      const c = this.nav.randomNear(this.rng, f.x, f.z, 4, 12);
      if (c) return c;
    }
    return { x: f.home.x, z: f.home.z };
  }

  /** Chase + melee swing with a wind-up you can step out of. Used by every generic kind, gnome and ghost. */
  bMelee(f, dt) {
    const P = this.player;
    if (f.prey && (f.prey.down || f.prey.invisT > 0 || this.time > f.preyUntil)) f.prey = null;
    if (f.prey && f.state !== 'attack' && f.state !== 'recover' && f.aware >= 1 && this.playerAlive() && this.dist(f, P.position) < this.dist(f, f.prey)) f.prey = null;
    if (f.prey) return this.bPrey(f, dt);
    if (f.aware >= 1 && this.playerAlive() && f.def.speed >= 0) {
      if (f.state !== 'chase' && f.state !== 'attack' && f.state !== 'recover') this.setState(f, 'chase');
    }
    if (f.state === 'attack') return this.swing(f, dt);
    if (f.state === 'recover') {
      if (f.stateT > f.def.cd * 0.6) this.setState(f, this.playerAlive() ? 'chase' : 'patrol');
      const p = P.position;
      return [null, 0, p];
    }
    if (f.state === 'chase') {
      if (!this.playerAlive()) { this.setState(f, 'patrol'); return [null, 0, null]; }
      const p = P.position, d = this.dist(f, p);
      if (!f.seen) f.lostT += dt;
      if (f.lostT > F.giveUp || !f.lastSeen) { f.aware = 0.3; f.target = f.lastSeen; this.setState(f, f.lastSeen ? 'investigate' : 'patrol'); return [null, 0, null]; }
      const goal = f.seen ? { x: p.x, z: p.z } : f.lastSeen;
      if (!f.seen && this.dist(f, goal) < 0.6) { f.target = goal; this.setState(f, 'investigate'); return [null, 0, null]; }
      if (f.seen && d < F.reach && f.cdT <= 0 && this.reachY(f, this.G.player)) { this.setState(f, 'attack'); f.swingT = f.def.wind || F.wind; f.swingLen = f.swingT; return [null, 0, p]; }
      // the player stands out of reach above it (on something tall, same floor level): it waits under them looking up and
      // every bayEvery seconds shoves the loose loot around it (new design, trail.tsv); it never stands idle and blank
      if (f.seen && d < F.reach * 1.8 && !this.reachY(f, this.G.player) && Math.abs(this.floorY(p.x, p.z) - f.gy) < 0.6) {
        f.bayT = (f.bayT || 0) + dt; f.baying = true;
        if (f.bayT >= F.bayEvery) { f.bayT = 0; this.shoveNear(f, p); }
        return [null, 0, p];
      }
      f.baying = false;
      if (f.def.speed <= 0) return [null, 0, p];
      return [goal, f.speed * F.chaseMul, d < 3 ? p : null];
    }
    return this.wander(f, dt);
  }

  /** Chase and hit a crew bot (f.prey). */
  bPrey(f, dt) {
    const b = f.prey;
    if (f.state === 'attack') return this.swing(f, dt);
    if (f.state === 'recover') { if (f.stateT > f.def.cd * 0.6) this.setState(f, 'chase'); return [null, 0, b]; }
    if (f.state !== 'chase') this.setState(f, 'chase');
    const d = this.dist(f, b);
    if (d < F.reach && f.cdT <= 0) { this.setState(f, 'attack'); f.swingT = f.def.wind || F.wind; f.swingLen = f.swingT; return [null, 0, b]; }
    return [{ x: b.x, z: b.z }, f.speed * F.chaseMul, d < 3 ? b : null];
  }

  swing(f, dt) {
    const P = this.player, p = f.prey || P.position;
    f.swingT -= dt;
    f.atk = Math.min(0.5, 0.5 * (1 - f.swingT / f.swingLen));
    if (f.swingT <= 0 && f.prey) {
      f.cdT = f.def.cd;
      const b = f.prey, dmg = f.dmg > 0 ? f.dmg : 8 * this.roster.dmgMul;
      if (this.dist(f, b) < F.reach * F.whiff && !b.down) { this.G.bots.hurt(b, dmg, f); this.log.push(['hitBot', f.kind, b.crew, +dmg.toFixed(1)]); }
      else this.log.push(['whiff', f.kind]);
      f.atkEnd = this.time;
      this.setState(f, 'recover');
      return [null, 0, p];
    }
    if (f.swingT <= 0) {
      f.cdT = f.def.cd;
      const d = this.dist(f, p);
      if (this.playerAlive() && d < F.reach * F.whiff && this.reachY(f, this.G.player)) {
        const dmg = f.dmg > 0 ? f.dmg : 8 * this.roster.dmgMul;
        P.hurt(dmg, { x: f.x, z: f.z, kind: f.kind });
        this.log.push(['hit', f.kind, +dmg.toFixed(1), +P.hp.toFixed(1)]);
        const held = this.G.grab?.held;
        if (held && !held.isHead && !this.G.passives?.keepsValue()) this.cutItem(held, dmg * (f.def.lootDmg || F.lootDmg), f);   // Quake keeps the value
      } else this.log.push(['whiff', f.kind]);
      f.atkEnd = this.time;
      this.setState(f, 'recover');
    }
    return [null, 0, p];
  }

  /** A blow lands on a carried item: source damageLoot with the blow as the impulse (px/s), no threshold. */
  cutItem(it, impulsePx, f) {
    const mat = CFG.loot.materials[it.material]; if (!mat || it.dead) return;
    const lost = Math.min(it.value, Math.round(it.value0 * mat.frag * CFG.loot.dmgScale * impulsePx * PX / mat.thresh));
    if (lost <= 0) return;
    it.value -= lost;
    if (mat.shatter && it.value < it.value0 * CFG.loot.shatterBelow) it.value = 0;
    const t = it.body.translation();
    this.G.events.emit('loot:hit', { item: it, lost, dv: impulsePx * PX, point: { x: t.x, y: t.y, z: t.z }, by: f.kind });
    if (it.value <= 0) this.G.loot.destroy(it, true);
  }

  // ---- banger: lights a fuse on sight, runs at you, blows up (people, loot and other foes)
  bBanger(f, dt) {
    const P = this.player;
    if (f.fuse < 0 && f.aware >= 1 && this.playerAlive()) { f.fuse = F.fuse; this.setState(f, 'fuse'); this.log.push(['fuse', +this.time.toFixed(2)]); }
    if (f.fuse >= 0) {
      f.fuse -= dt;
      const p = P.position, d = this.dist(f, p);
      if (d < 1.4) f.fuse = Math.min(f.fuse, F.fuseClose);
      if (f.fuse <= 0) { this.explode(f.x, f.z, F.blastR, 1, f); this.takeDown(f, true); return [null, 0, null]; }
      const goal = this.playerAlive() ? (f.seen ? { x: p.x, z: p.z } : f.lastSeen) : null;
      return [goal, f.speed * F.chaseMul, null];
    }
    return this.wander(f, dt);
  }

  // ---- brat: steals the nearest loot (even from the beam), runs off, catches breath, throws it at you
  bBrat(f, dt) {
    const P = this.player, p = this.playerAlive() ? P.position : null;
    if (f.carry) {
      if (f.state !== 'flee' && f.state !== 'breath' && f.state !== 'approach' && f.state !== 'throwAim') { this.setState(f, 'flee'); f.target = this.fleeSpot(f, p); }
      if (f.state === 'flee') {
        if (!f.target || this.dist(f, f.target) < 0.8 || f.stateT > 8) { this.setState(f, 'breath'); return [null, 0, null]; }
        return [f.target, f.speed * F.chaseMul, null];
      }
      if (f.state === 'breath') {
        if (f.stateT > F.bratBreath && p) this.setState(f, f.seen && this.dist(f, p) < F.bratThrowR ? 'throwAim' : 'approach');
        return [null, 0, p && f.seen ? p : null];
      }
      if (f.state === 'approach') {
        // creep back toward the player until a throw is on
        if (!p || f.stateT > 12) { this.setState(f, 'breath'); f.stateT = -4; return [null, 0, null]; }
        if (f.seen && this.dist(f, p) < F.bratThrowR - 2) { this.setState(f, 'throwAim'); return [null, 0, p]; }
        return [{ x: p.x, z: p.z }, f.speed, null];
      }
      if (f.state === 'throwAim') {
        if (!p) { this.setState(f, 'breath'); return [null, 0, null]; }
        f.atk = Math.min(0.5, f.stateT / 0.5);
        if (f.stateT > 0.5) { this.throwCarry(f, P); f.stealCd = 4; this.setState(f, 'patrol'); f.atk = 0; }
        return [null, 0, p];
      }
    }
    if (f.stealCd <= 0) {
      const it = this.nearestLoot(f);
      if (it) {
        if (f.state !== 'steal') this.setState(f, 'steal');
        const t = it.body.translation();
        const d = Math.hypot(t.x - f.x, t.z - f.z);
        if (d < 1.15 && t.y < 2.2) { this.takeItem(f, it); return [null, 0, null]; }
        return [{ x: t.x, z: t.z }, f.speed * F.chaseMul, d < 2.5 ? t : null];
      }
    }
    if (f.state === 'steal') this.setState(f, 'patrol');
    // empty-handed and you are close: keep away
    if (p && this.dist(f, p) < 3 && f.seen) { if (f.state !== 'flee') { this.setState(f, 'flee'); f.target = this.fleeSpot(f, p); } }
    if (f.state === 'flee') {
      if (!f.target || this.dist(f, f.target) < 0.8 || f.stateT > 5) { this.setState(f, 'patrol'); f.target = null; }
      else return [f.target, f.speed * F.chaseMul, null];
    }
    return this.wander(f, dt);
  }

  nearestLoot(f) {
    let best = null, bd = f.def.sight;
    for (const it of this.G.loot.items) {
      if (it.dead || it.carrier || it.isHead) continue;
      const t = it.body.translation();
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (d >= bd || t.y > 2.4) continue;
      if (!this.nav.los(f.x, f.z, t.x, t.z)) continue;
      bd = d; best = it;
    }
    return best;
  }

  takeItem(f, it) {
    const grab = this.G.grab;
    const fromBeam = grab?.held === it;
    if (fromBeam) grab.release(false);
    it.carrier = f; it.held = true; it.grabbable = false;
    it.col.setEnabled?.(false);
    it.body.setGravityScale(0, true);
    f.carry = it; f.carryHits = 0;
    this.log.push(['steal', it.material, it.size, fromBeam]);
    this.setState(f, 'flee');
    f.target = this.fleeSpot(f, this.playerAlive() ? this.player.position : null);
  }

  holdCarry(f) {
    const it = f.carry;
    if (it.dead) { f.carry = null; return; }
    const half = CFG.loot.sizes[it.size]?.half || 0.2;
    it.body.setTranslation({ x: f.x + Math.sin(f.yaw) * 0.15, y: f.gy + f.h + half + 0.05, z: f.z + Math.cos(f.yaw) * 0.15 }, true);
    it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    it.body.setAngvel({ x: 0, y: 0.6, z: 0 }, true);
  }

  dropCarry(f, vel) {
    const it = f.carry; if (!it) return null;
    f.carry = null;
    it.carrier = null; it.held = false; it.grabbable = true;
    it.col.setEnabled?.(true);
    it.body.setGravityScale(1, true);
    if (vel) it.body.setLinvel(vel, true);
    it.grabbedAt = -99;
    it.hitAt = this.G.loot.time - CFG.loot.invulnAfterHit + 0.15;
    return it;
  }

  throwCarry(f, P) {
    const it = f.carry; if (!it) return;
    const half = CFG.loot.sizes[it.size]?.half || 0.2;
    const from = { x: f.x + Math.sin(f.yaw) * 0.45, y: f.gy + f.h * 0.85, z: f.z + Math.cos(f.yaw) * 0.45 };
    it.body.setTranslation(from, true);
    const t = P.position, tgt = { x: t.x, y: P.camPos.y - 0.45, z: t.z };
    const dx = tgt.x - from.x, dz = tgt.z - from.z, dh = Math.hypot(dx, dz) || 1;
    const v = Math.max(130, 560 * 30 / (30 + 2.2 * it.mass)) * PX * 1.2;
    const tt = dh / v;
    const vy = (tgt.y - from.y) / tt + 0.5 * CFG.gravity * tt;
    this.dropCarry(f, { x: dx / dh * v, y: vy, z: dz / dh * v });
    it.thrownBy = f; it.thrownAt = this.time;
    void half;
    this.G.noise?.emit({ x: f.x, z: f.z, r: 3.5, str: 1.5, src: 'throw' });
    this.log.push(['throw', it.material, +v.toFixed(2)]);
  }

  /** Thrown-by-foe items that reach the player hurt and lose value. */
  projectiles() {
    const P = this.player;
    if (!P || P.down) return;
    const p = P.position;
    for (const it of this.G.loot.items) {
      if (!it.thrownBy || it.dead) continue;
      if (this.time - it.thrownAt > 1.6) { it.thrownBy = null; continue; }
      const t = it.body.translation();
      const half = CFG.loot.sizes[it.size]?.half || 0.2;
      if (Math.hypot(t.x - p.x, t.z - p.z) < CFG.player.radius + half + 0.15 && t.y < p.y + 1.1 && t.y > p.y - 1.0) {
        P.hurt(F.bratThrowDmg * this.roster.dmgMul, { x: t.x, z: t.z, kind: it.thrownBy.kind });
        const lost = Math.min(it.value, F.bratLossMax, Math.round(it.value * 0.2));
        it.value -= lost;
        this.G.events.emit('loot:hit', { item: it, lost, dv: 5, point: { x: t.x, y: t.y, z: t.z }, by: 'brat' });
        this.log.push(['thrownHit', lost]);
        it.thrownBy = null;
        if (it.value <= 0) this.G.loot.destroy(it, true);
      }
    }
  }

  fleeSpot(f, p) {
    let best = null, bs = -1;
    for (let k = 0; k < 10; k++) {
      const c = this.nav.randomNear(this.rng, f.x, f.z, 6, 14);
      if (!c) continue;
      const s = p ? Math.hypot(c.x - p.x, c.z - p.z) : 10;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  // ---- minelayer: afraid of people, wanders and plants mines
  bMinelayer(f, dt) {
    const P = this.player;
    f.mineT -= dt;
    if (f.mineT <= 0) {
      f.mineT = F.mineEvery[0] + (F.mineEvery[1] - F.mineEvery[0]) * this.rng();
      const alive = this.mines.filter((m) => !m.dead && m.owner === f).length;
      if (alive < F.mineMax && !this.mines.some((m) => !m.dead && Math.hypot(m.x - f.x, m.z - f.z) < 3)) this.plantMine(f);
    }
    if (f.seen && this.playerAlive() && this.dist(f, P.position) < f.def.sight && f.aware > 0.3) {
      if (f.state !== 'flee' || f.stateT > 3) { this.setState(f, 'flee'); f.target = this.fleeSpot(f, P.position); }
    }
    if (f.state === 'flee') {
      if (!f.target || this.dist(f, f.target) < 0.8 || f.stateT > 6) { this.setState(f, 'patrol'); f.target = null; f.aware = 0; }
      else return [f.target, f.speed * F.chaseMul, null];
    }
    return this.wander(f, dt);
  }

  plantMine(f) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.mineGeo, this.mineMat); m.position.y = 0.035; m.castShadow = true; g.add(m);
    const led = new THREE.Mesh(this.ledGeo, this.mineLed); led.position.y = 0.08; g.add(led);
    g.position.set(f.x - Math.sin(f.yaw) * 0.4, f.gy, f.z - Math.cos(f.yaw) * 0.4);
    this.root.add(g);
    this.mines.push({ x: g.position.x, z: g.position.z, arm: F.mineArm, owner: f, mesh: g, led, dead: false });
    this.log.push(['mine', +g.position.x.toFixed(1), +g.position.z.toFixed(1)]);
  }

  stepMines(dt) {
    const P = this.player;
    for (const m of this.mines) {
      if (m.dead) continue;
      m.arm -= dt;
      m.led.visible = m.arm > 0 ? true : Math.sin(this.time * 9) > 0;
      if (m.arm > 0) continue;
      let boom = false;
      if (P && !P.down && Math.hypot(P.position.x - m.x, P.position.z - m.z) < F.mineTrigger) boom = true;
      for (const f of this.list) if (!boom && !f.dead && f !== m.owner && f.def.beh !== 'ghost' && Math.hypot(f.x - m.x, f.z - m.z) < F.mineTrigger) boom = true;
      if (boom) { m.dead = true; this.root.remove(m.mesh); this.explode(m.x, m.z, F.mineR, F.minePow, null); }
    }
    if (this.mines.length > 24) this.mines = this.mines.filter((m) => !m.dead);
  }

  // ------------------------------------------------------------------ blasts and hits
  /** Explosion: hurts the player, other foes, and loot (value loss through the source damageLoot rule + impulse). */
  explode(x, z, r, pow, src) {
    const G = this.G, P = this.player;
    if (P && !P.down) {
      const p = P.position, d = Math.hypot(p.x - x, p.z - z);
      if (d < r) P.hurt(F.blastPlayer * pow * (1 - d / r) * this.roster.dmgMul, { x, z, kind: 'blast' });
    }
    for (const f of this.list) {
      if (f === src || f.dead) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < r) this.hurtFoe(f, F.blastFoe * pow * (1 - d / r), { x: (f.x - x) / (d || 1), z: (f.z - z) / (d || 1) }, 4 * (1 - d / r));
    }
    let lootLost = 0;
    for (const it of [...G.loot.items]) {
      if (it.dead) continue;
      const t = it.body.translation();
      const d = Math.hypot(t.x - x, t.z - z, t.y - 0.4);
      if (d >= r) continue;
      if (it.carrier) this.dropCarry(it.carrier);
      const k = 1 - d / r, mat = CFG.loot.materials[it.material];
      const imp = F.blastLoot * pow * k;   // px/s
      const th = mat.thresh / PX;
      if (imp > th) {
        const lost = Math.min(it.value, Math.round(it.value0 * mat.frag * CFG.loot.dmgScale * (imp - th) / th));
        if (lost > 0) {
          it.value -= lost; lootLost += lost;
          if (mat.shatter && it.value < it.value0 * CFG.loot.shatterBelow) it.value = 0;
          it.hitAt = G.loot.time;
          G.events.emit('loot:hit', { item: it, lost, dv: imp * PX, point: { x: t.x, y: t.y, z: t.z }, by: 'blast' });
        }
      }
      if (it.value <= 0) { G.loot.destroy(it, true); continue; }
      const dx = (t.x - x) / (d || 1), dz = (t.z - z) / (d || 1), sp = 7 * pow * k;
      const v = it.body.linvel();
      it.body.setLinvel({ x: v.x + dx * sp, y: v.y + 3.5 * pow * k, z: v.z + dz * sp }, true);
    }
    G.noise?.emit({ x, z, r: 11, str: 2, src: 'blast' });
    this.log.push(['blast', +x.toFixed(1), +z.toFixed(1), +pow.toFixed(2), lootLost]);
    // flash
    const mesh = new THREE.Mesh(this.blastGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
    mesh.position.set(x, this.nav.heightAt(x, z) + 0.6, z); mesh.scale.setScalar(0.3);
    const light = new THREE.PointLight(0xffa040, 40 * pow, r * 3, 2); light.position.set(x, 1, z);
    this.root.add(mesh, light);
    this.fx.push({ mesh, light, t: 0, life: 0.45, r });
  }

  /** Thrown or swung loot that hits a foe fast enough: damage = mass * speed(px/s) * 0.022 clamped 5..200, knockback. */
  lootHits() {
    const items = this.G.loot.items;
    for (const f of this.list) {
      if (f.dead || f.def.immune) continue;
      for (const it of items) {
        if (it.dead || it.carrier || it.isHead) continue;
        const pv = it.prevVel, sp = Math.hypot(pv.x, pv.y, pv.z);
        if (sp < F.hitMinSpeed) continue;
        const t = it.body.translation();
        const half = CFG.loot.sizes[it.size]?.half || 0.2;
        const dx = f.x - t.x, dz = f.z - t.z, d = Math.hypot(dx, dz);
        const ry = t.y - (f.gy || 0);   // above the foe's own floor (was absolute y: thrown loot never hit on a basement or upper floor)
        if (d > f.r + half * 1.2 + 0.25 || ry > f.h + 0.3 || ry < -0.2) continue;
        if ((dx * pv.x + dz * pv.z) <= 0) continue;   // moving away
        it.foeHitT = it.foeHitT || new Map();
        if (this.time - (it.foeHitT.get(f.id) ?? -9) < 0.5) continue;
        it.foeHitT.set(f.id, this.time);
        const dmg = Math.max(F.hitMin, Math.min(F.hitMax, it.mass * (sp / PX) * F.hitK));
        const hl = Math.hypot(pv.x, pv.z) || 1;
        this.hurtFoe(f, dmg, { x: pv.x / hl, z: pv.z / hl }, Math.min(F.knockMax, sp * it.mass / 40));
        if (!(it.thrownBy && this.time - it.thrownAt < 3)) this.G.passives?.chill(f, this.G.player);   // the player's throw (Frost)
        this.log.push(['foeHit', f.kind, Math.round(dmg), +sp.toFixed(2), Math.max(0, Math.round(f.hp))]);
        if (f.state === 'sleep') this.wake(f);
        if (!f.dead && this.playerAlive()) { f.aware = 1; const p = this.player.position; f.lastSeen = { x: p.x, z: p.z }; f.lostT = 0; }
      }
    }
  }

  hurtFoe(f, dmg, dir, knock = 0) {
    if (f.dead || f.def.immune || !(dmg > 0)) return;
    if (f.vulnT > 0) dmg *= 1.5;   // Frost: +50 % while frozen
    f.hp -= dmg;
    f.hurtT = 0.35;
    if (f.def.boss) knock *= BOSS.knockMul;   // bosses barely move
    if (dir && knock > 0 && !f.def.fixed) { f.knock.x += dir.x * knock; f.knock.z += dir.z * knock; }
    if (f.carry && ++f.carryHits >= F.bratHits) this.dropCarry(f);
    if (f.def.beh === 'gacha' && f.state === 'hold') f.holdHits = (f.holdHits || 0) + 1;   // 4 hits make it let go
    if (f.def.beh === 'impostor' && !f.revealed) this.impReveal(f);
    if (f.state === 'attack') { f.swingT = 0; f.cdT = f.def.cd; this.setState(f, 'recover'); }
    if (f.hp <= 0) {
      if (f.def.beh === 'banger') { this.explode(f.x, f.z, F.blastR, 0.5, f); this.takeDown(f, true); }
      else this.takeDown(f, false);
    }
  }

  /** Taken down: drop what it carries, maybe drop a soul orb, fall, respawn later at a foe point out of sight. */
  takeDown(f, blew) {
    if (f.dead) return;
    if (f.victim) this.letGo(f, 'down'); if (f.tether) this.cutTether(f, 'down'); f.drive = null;
    if (f.def.beh === 'mirror') this.mirrorBreak(f);
    f.dead = true; f.hp = 0; f.downT = 0; f.respawnT = this.escape ? 1 : F.respawn; f.atk = 0; f.fuse = -1;
    this.dropCarry(f);
    if (f.col) f.col.setEnabled(false);
    let orb = null;
    if (!f.def.noLoot && !blew && f.orbs < F.maxOrbs) {
      let v = Math.round((f.maxHp * 9 + f.dmg * 60) / 50) * 50;
      const size = sizeForValue(v), [lo, hi] = CFG.loot.sizes[size].value;
      v = Math.max(lo, Math.min(hi, v));
      orb = this.G.loot.spawn({ material: 'soul', size, value: v, pos: { x: f.x, y: f.gy + 0.7, z: f.z } });
      f.orbs++;
    }
    this.log.push(['down', f.kind, orb ? orb.value : 0]);
    this.G.events.emit('foe:down', { foe: f, orb });
  }

  stepDead(f, dt) {
    f.downT += dt;
    if (f.downT > 1.4) f.robot.root.visible = false;
    if (f.noRespawn) return;   // a broken mirror stays broken
    f.respawnT -= dt;
    if (f.respawnT > 0) return;
    if (this.escape) {   // escape phase: back in ~1 s, in the rooms next to the truck room
      const sp = this.escape.spots, q = sp[Math.floor(this.rng() * sp.length)];
      if (q) { this.revive(f, q.x, q.z); return; }
    }
    // respawn at a foe point far from the player and out of line of sight
    const P = this.player, p = P ? P.position : { x: 0, z: 0 };
    const pts = this.L.foes.filter((q) => Math.hypot(q.x + 0.5 - p.x, q.y + 0.5 - p.z) > 15 && !this.nav.los(q.x + 0.5, q.y + 0.5, p.x, p.z));
    if (!pts.length) { f.respawnT = 5; return; }
    const q = pts[Math.floor(this.rng() * pts.length)];
    this.revive(f, q.x + 0.5, q.y + 0.5);
  }

  revive(f, x, z) {
    Object.assign(f, { stunT: 0, lureT: 0, vulnT: 0, prey: null, dead: false, hp: f.maxHp, x, z, state: 'patrol', stateT: 0, aware: 0, fuse: -1, target: null, path: null, lastSeen: null, spottedAt: undefined });
    f.knock.x = f.knock.z = 0;
    if (f.body) { f.body.setTranslation({ x: f.x, y: f.y, z: f.z }, true); f.col.setEnabled(true); }
    f.robot.root.visible = true;
    f.respawnAt = { x, z };
    if (this.escape) { f.target = { x: this.escape.hornX, z: this.escape.hornZ }; this.setState(f, 'investigate'); }
  }

  /** Escape phase (run.js): dead foes come back after 1 s at `spots` ({x, z} cells next to the truck room) and head for the horn. */
  startEscape(spots, hornX, hornZ) {
    this.escape = { spots, hornX, hornZ };
    for (const f of this.list) if (f.dead) f.respawnT = Math.min(f.respawnT, 1);
  }

  /** Everything awake that can hear walks to (x, z). */
  alertAll(x, z) {
    for (const f of this.list) if (!f.dead && f.def.beh !== 'ghost' && f.def.speed > 0) { this.wake(f); this.investigate(f, { x, z, src: 'horn' }); }
  }

  // ------------------------------------------------------------------ movement
  move(f, dt, goal, speed, face) {
    let vx = 0, vz = 0;
    if (goal && speed > 0) {
      const wp = f.def.beh === 'ghost' ? goal : this.waypoint(f, goal, dt);
      if (wp) {
        const dx = wp.x - f.x, dz = wp.z - f.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { const s = Math.min(speed * (f.slowT > 0 ? 0.75 : 1), d / dt); vx = dx / d * s; vz = dz / d * s; }   // Frost's chill
      }
    }
    // a fresh hit staggers (no walking for 0.2 s) and a hard knock throws it: only the knock moves it then
    if (f.flyT > 0 || f.hurtT > 0.15) { vx = 0; vz = 0; }
    if (f.drive) { vx = f.drive.x; vz = f.drive.z; }   // a rook's charge: straight on, no path, no stagger
    // knockback decays
    vx += f.knock.x; vz += f.knock.z;
    const kd = Math.exp(-6 * dt); f.knock.x *= kd; f.knock.z *= kd;
    if (Math.abs(f.knock.x) + Math.abs(f.knock.z) < 0.02) f.knock.x = f.knock.z = 0;
    let mx = vx * dt, mz = vz * dt;
    if (f.body && (mx || mz)) {
      // Loot is shoved, not walked around; door leaves block until the door opens for a nearby foe.
      this.kcc.computeColliderMovement(f.col, { x: mx, y: 0, z: mz }, this.R.QueryFilterFlags.EXCLUDE_DYNAMIC | this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => c !== f.col && !this.isActorCollider(c) && !this.stairH.has(c.handle));
      const m = this.kcc.computedMovement();
      // a knocked foe that slams a wall (melee): losing a quarter of the knock along its direction (a wall ahead, or sliding
      // off one at 45 degrees) is a second beat (js/melee.js)
      const ks = Math.hypot(f.knock.x, f.knock.z);
      if (ks > 3 && f.flyT > 0 && !f.wallHit && (m.x * f.knock.x + m.z * f.knock.z) / ks < 0.75 * (mx * f.knock.x + mz * f.knock.z) / ks) { f.wallHit = true; this.G.melee?.wallSlam(f, ks); f.knock.x *= -0.25; f.knock.z *= -0.25; }
      if (f.drive && Math.hypot(m.x, m.z) < 0.4 * Math.hypot(mx, mz)) f.driveBlocked = true;
      mx = m.x; mz = m.z;
      [mx, mz] = this.keepApart(f, mx, mz);
    }
    f.x += mx; f.z += mz;
    this.ground(f, dt);
    if (f.body) f.body.setNextKinematicTranslation({ x: f.x, y: f.y, z: f.z });
    f.moveSpeed = Math.hypot(mx, mz) / dt;
    // facing
    let want = null;
    if (face) want = Math.atan2(face.x - f.x, face.z - f.z);
    else if (Math.hypot(vx, vz) > 0.1) want = Math.atan2(vx, vz);
    if (want !== null) {
      const dd = angDiff(want, f.yaw), turn = 7 * dt;
      f.yaw += Math.max(-turn, Math.min(turn, dd));
    }
    // stuck: moving state but less than 10 px in 2.5 s -> reroute
    if (goal && speed > 0) {
      f.stuckT += dt;
      if (f.stuckT >= F.stuckSec) {
        if (Math.hypot(f.x - f.stuckRef.x, f.z - f.stuckRef.z) < F.stuckDist) {
          f.path = null; f.repathT = 0;
          const side = this.nav.randomNear(this.rng, f.x, f.z, 1.5, 4);
          if (side) { f.detour = side; f.detourT = 1.2; }
          this.log.push(['stuck', f.kind]);
        }
        f.stuckT = 0; f.stuckRef.x = f.x; f.stuckRef.z = f.z;
      }
    } else { f.stuckT = 0; f.stuckRef.x = f.x; f.stuckRef.z = f.z; }
  }

  /** Floors: stand on the nav height (ramps), drop down a stairwell edge instead of snapping (knocked off a landing). */
  ground(f, dt) {
    const g = this.nav.heightAt(f.x, f.z);
    if (g < f.gy - 0.7) { f.fallV = (f.fallV || 0) + 9.81 * dt; f.gy = Math.max(g, f.gy - f.fallV * dt); } else { f.gy = g; f.fallV = 0; }
    f.y = f.y0 + f.gy;
  }
  /** A swing reaches the player only within REACH_Y of height (owner rule: standing on a table or a landing is not safe
   *  up to about 1.6 m, higher is out of reach). */
  floorY(x, z) { return this.G.house?.heightAt ? this.G.house.heightAt(x, z) : 0; }
  /** A foe that cannot reach the player knocks the loose loot near it about (value loss by the usual impact rule). */
  shoveNear(f, p) {
    let n = 0;
    for (const it of this.G.loot?.items || []) {
      if (it.dead || it.held || n >= 2) continue;
      const t = it.body.translation(); if (Math.hypot(t.x - f.x, t.z - f.z) > F.bayR || Math.abs(t.y - f.gy) > 1.4) continue;
      const a = Math.atan2(p.z - f.z, p.x - f.x) + (Math.random() - 0.5) * 1.6, m = it.body.mass();
      it.body.applyImpulse({ x: Math.cos(a) * F.bayV * m, y: F.bayV * 0.6 * m, z: Math.sin(a) * F.bayV * m }, true); n++;
    }
    this.log.push(['bay', f.kind, n, +this.time.toFixed(2)]); this.G.events.emit('foe:bay', { foe: f, shoved: n });
  }
  reachY(f, P) { const t = P.position, feet = t.y - CFG.player.halfHeight - CFG.player.radius; return Math.abs(feet - f.gy) <= F.reachY; }

  /** Do not step into the player or another walker: cancel the part of the step that closes in on them. */
  isActorCollider(c) {
    return c === this.G.player.col || this.list.some((o) => o.col === c) || !!this.G.bots?.isCol(c);
  }

  keepApart(f, mx, mz) {
    const P = this.player;
    const push = (ox, oz, minD) => {
      const nx = f.x + mx - ox, nz = f.z + mz - oz, d = Math.hypot(nx, nz);
      if (d >= minD || d < 1e-4) return;
      const cx = f.x - ox, cz = f.z - oz, dc = Math.hypot(cx, cz) || 1;
      const ux = cx / dc, uz = cz / dc, into = mx * ux + mz * uz;
      if (into < 0) { mx -= into * ux; mz -= into * uz; }
    };
    if (P && !P.down) { const p = P.position; push(p.x, p.z, f.r + CFG.player.radius + 0.04); }
    for (const o of this.list) if (o !== f && !o.dead && o.body) push(o.x, o.z, f.r + o.r);
    for (const b of this.G.bots?.list || []) if (b !== f && !b.down) push(b.x, b.z, f.r + b.r);
    if (!f.isBot) for (const c of this.G.skills?.cages || []) if (Math.hypot(f.x - c.x, f.z - c.z) >= c.r - 0.05) push(c.x, c.z, c.r + f.r);   // Barb's shields
    return [mx, mz];
  }

  waypoint(f, goal, dt) {
    if (f.detour) {
      f.detourT -= dt;
      if (f.detourT <= 0 || Math.hypot(f.detour.x - f.x, f.detour.z - f.z) < 0.4) f.detour = null;
      else return f.detour;
    }
    const nav = this.nav;
    f.repathT -= dt;
    if (nav.clear(f.x, f.z, goal.x, goal.z, 0.3)) { f.path = null; return goal; }
    const moved = !f.pathGoal || Math.hypot(goal.x - f.pathGoal.x, goal.z - f.pathGoal.z) > 1.0;
    if (!f.path || (moved && f.repathT <= 0)) {
      f.path = nav.path(f.x, f.z, goal.x, goal.z);
      f.pathI = 0; f.pathGoal = { x: goal.x, z: goal.z }; f.repathT = 0.5;
      if (!f.path) { f.noPathAt = this.time; return null; }
    }
    while (f.pathI < f.path.length - 1) {
      const w = f.path[f.pathI];
      if (Math.hypot(w.x - f.x, w.z - f.z) < 0.45) { f.pathI++; continue; }
      const n = f.path[f.pathI + 1];
      if (nav.clear(f.x, f.z, n.x, n.z, 0.3)) { f.pathI++; continue; }
      break;
    }
    const w = f.path[f.pathI];
    if (f.pathI === f.path.length - 1 && Math.hypot(w.x - f.x, w.z - f.z) < 0.45) return goal;
    return w;
  }

  place(f) {
    const ro = f.robot.root;
    const hover = f.def.beh === 'ghost' ? 0.15 + 0.08 * Math.sin(this.time * 1.7 + f.id) : 0;
    // melee: a stagger spin that settles, and a hop while a hard knock throws it (light foes fly)
    const fly = f.flyT > 0 ? Math.sin(Math.PI * (1 - f.flyT / 0.6)) * 0.35 : 0;
    ro.position.set(f.x, (f.gy || 0) + hover + fly, f.z);
    ro.rotation.y = f.yaw + (f.spinA || 0);
  }

  // ------------------------------------------------------------------ render
  render(dt, camPos) {
    for (const f of this.list) {
      const d = Math.hypot(f.x - camPos.x, f.z - camPos.z);
      const vis = d < 32 && !(f.dead && f.downT > 1.4) && !(f.def.beh === 'wallhand' && f.state !== 'hold')   // the hand shows only when it grabs
        && !(f.def.beh === 'angel' && f.state !== 'watch' && f.state !== 'strike') && !(f.def.beh === 'mirror' && !(f.ghost && f.ghost.out)) && !(f.def.beh === 'vampire' && f.state === 'hidden');   // angel: when it is there; mirror: its ghost
      f.robot.root.visible = vis;
      if (!vis) continue;
      this.place(f);
      let atk = 0;
      if (f.state === 'attack' || f.state === 'throwAim') atk = f.atk;
      else if (f.state === 'aim') atk = 0.32;   // gunner: arm up, gun on the line
      else if (f.state === 'hold' && f.def.beh !== 'wallhand') atk = 0.3 + 0.1 * Math.sin(this.time * 9);
      else if (f.state === 'warn') atk = 0.45 * Math.min(1, f.stateT / 0.6);
      else if (f.state === 'stomp') atk = 0.15 + 0.2 * Math.abs(Math.sin(f.stateT * Math.PI / 0.32));
      else if (f.atkEnd !== undefined && this.time - f.atkEnd < 0.3) atk = 0.5 + 0.5 * (this.time - f.atkEnd) / 0.3;
      else if (f.baying && f.state === 'chase') atk = 0.2 + 0.3 * Math.max(0, Math.sin(this.time * 5 + f.id));   // swiping up at the player out of reach
      const look = f.state === 'investigate' ? 0.6 * Math.sin(this.time * 1.4 + f.id) : 0;
      // stalk while it searches or senses you, lunge when it closes in or strikes
      const prey = f.prey || (this.playerAlive() ? this.player.position : null), dP = prey ? Math.hypot(prey.x - f.x, prey.z - f.z) : 99;
      const lunge = f.state === 'attack' || f.state === 'charge' || (f.state === 'chase' && dP < 3.5) ? 1 : 0;
      const stalk = !lunge && (f.state === 'investigate' || f.state === 'chase' || f.aware > 0.25) ? 1 : 0;
      f.robot.animate(dt, { speed: f.moveSpeed, attack: atk >= 1 ? 0 : atk, hurt: f.hurtT > 0 ? 1 : 0, down: f.dead || f.state === 'sleep', carrying: !!f.carry, look, stalk: f.quiet ? 0 : stalk, lunge: f.quiet ? 0 : lunge, reveal: f.def.beh === 'impostor' ? (f.revealed ? 1 : 0) : undefined });
      if (f.def.beh === 'mirror' && f.ghost && f.ghost.out) { f.robot.root.position.set(f.ghost.x, f.ghost.from.gy || 0, f.ghost.z); f.robot.root.rotation.y = f.ghost.yaw; }   // the ghost walks out of the glass
      if (f.state === 'stomp') f.robot.root.position.y -= 0.06 * Math.max(0, Math.sin(f.stateT * Math.PI / 0.32));
      // the wall hand: the arm robot lies flat, shoulder buried in the wall, the hand out at chest height toward its victim
      if (f.def.beh === 'wallhand') { // above the victim's eyes, reaching down at the collar, so the one it holds sees it coming out of the wall
        // (the arm mesh hangs 0.42 m to the robot's right of its root, hand at the bottom: shift it back onto the spot)
        // It comes out 0.55 m to the side of its spot and reaches across and down, so it is seen along its length.
        const ro = f.robot.root, k = Math.min(1, f.stateT / 0.25), out = 0.15 + 0.75 * k + 0.04 * Math.sin(this.time * 7), cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
        const ex = f.x - cy * 0.55, ez = f.z + sy * 0.55, yw = f.yaw - 0.75, c2 = Math.cos(yw), s2 = Math.sin(yw);
        ro.rotation.set(-Math.PI / 2 + 0.45, yw, 0.08 * Math.sin(this.time * 5), 'YXZ'); ro.position.set(ex + s2 * out + c2 * 0.42, (f.gy || 0) + 1.42 - 0.35 * out, ez + c2 * out - s2 * 0.42); }
      else f.robot.root.rotation.order = 'XYZ';
      if (f.def.beh === 'banger' && f.fuse >= 0) {
        const blink = Math.sin(this.time * (8 + 30 * (1 - f.fuse / F.fuse))) > 0;
        f.robot.root.scale.setScalar(blink ? 1.06 : 1);
      }
    }
    this.movesFx(dt);
    this.movesFxB(dt);
    this.movesFxC(dt);
    this.movesFxD(dt);
    for (const x of this.fx) {
      x.t += dt;
      const k = x.t / x.life;
      x.mesh.scale.setScalar(0.3 + x.r * 0.8 * Math.sqrt(Math.min(1, k)));
      x.mesh.material.opacity = 0.9 * (1 - k);
      x.light.intensity *= 0.82;
      if (k >= 1) { this.root.remove(x.mesh, x.light); x.mesh.material.dispose(); x.dead = true; }
    }
    if (this.fx.some((x) => x.dead)) this.fx = this.fx.filter((x) => !x.dead);
  }

  /** Take a foe out of the world for good (tests, scripted events). */
  remove(f) {
    if (f.carry) this.dropCarry(f);
    if (f.body) { this.foeBodies.delete(f.body.handle); this.foeCols.delete(f.col.handle); this.G.phys.world.removeRigidBody(f.body); f.body = null; f.col = null; }
    this.root.remove(f.robot.root); f.robot.dispose();
    this.list = this.list.filter((o) => o !== f);
  }

  /** Small summary for the HUD and tests. */
  summary() {
    return this.list.map((f) => ({ id: f.id, kind: f.kind, state: f.state, hp: Math.round(f.hp), aware: +f.aware.toFixed(2), x: +f.x.toFixed(2), z: +f.z.toFixed(2), dead: f.dead }));
  }

  dispose() {
    const w = this.G.phys.world;
    for (const f of this.list) { if (f.body) { try { w.removeRigidBody(f.body); } catch (e) { /* gone */ } } f.robot.dispose(); }
    this.G.scene.remove(this.root);
    this.list = [];
  }
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
Object.assign(Foes.prototype, moves, moves2, moves3, moves4);
