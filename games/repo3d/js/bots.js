// Crew mates driven by the game (solo with bots, design-inventory section 1 + tactics.json). Three roles first:
//   loot (+15 % carry): carries loose loot to the active pad; carries the downed player's head to the pad (revive rule)
//   thu  (guard):       stays by the player, hits foes that come close and draws them onto itself (f.prey)
//   soi  (scout, +30 % eye): walks ahead into rooms nobody has seen, opens them on the minimap, marks foes it sees
// Every bot is one of the 14 crew robots and casts its skill by simple rules (SqBotCast in spirit).
// Bots walk with the foes' character controller and nav (G.foes.move), so they share door and stuck handling.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { buildRobot } from './robots.js';
import { CREW } from './skills.js';

const PX = 1 / 24;
// The other six (tactics.json / SqContent role list give names and the % numbers; the behaviour is this port's reading):
//   baoke  (vanguard): walks 3.5 m ahead of the player, hits what it meets first
//   hotong (escort):   sticks to whoever carries loot (loot bot or the player's beam) and hits foes that come for it
//   cuuho  (medic):    stands by the most hurt ally and patches it 3 hp/s; stands a downed bot up after 4 s beside it
//   nhu    (decoy):    walks up to a foe hunting the player, draws it onto itself with noise, then keeps 3-6 m away
//   san    (hunter, +22 % atk): goes after any awake foe within 15 m
//   tiepte (support, skill cooldown -15 %): stays at the player's side, hands a 25 hp kit to an ally under 40 % (every 30 s)
// Fighters never swing at the immune ones (ghost, wallhand, angel): those they leave alone (BOT_TACTIC RUN/IGNORE).
const R0 = { carryK: 1, eyeK: 1, atkK: 1 };
export const ROLES = {
  loot: { ...R0, carryK: 1.15 },
  thu: { ...R0, guardR: 6, leash: 10 },
  soi: { ...R0, eyeK: 1.3, sight: 9 },
  baoke: { ...R0, ahead: 3.5, guardR: 6 },
  hotong: { ...R0, guardR: 4.5 },
  cuuho: { ...R0, hps: 3, healR: 1.4, reviveSec: 4, below: 0.7 },
  nhu: { ...R0, lureR: 10, noiseEvery: 1, kite: [3, 6] },
  san: { ...R0, atkK: 1.22, huntR: 15 },
  tiepte: { ...R0, cdK: 0.85, kitHp: 25, kitCd: 30, kitR: 3, below: 0.4 },
};
export const BOT_RULES = { follow: 2.2, reach: 1.15, atkCd: 0.9, knock: 2.5, aggro: 6, think: 0.2, castEvery: 0.5, markT: 6, pickR: 30, padIn: 0.55, walk: 78 * PX, carrySlow: 0.8, radius: 8 * PX };
const B = BOT_RULES;
export const DEFAULT_MATES = [['tam', 'loot'], ['dung', 'thu'], ['khoi', 'soi']];
const SPARE = ['hai', 'son', 'hue', 'bao', 'mai', 'van', 'tuyet', 'phuc', 'ky', 'linh', 'nga'];

/** Pick 3 mates that are not the lead: the default role trio, a spare crew member where the lead takes a slot. */
export function matesFor(lead, spec) {
  if (spec === '0' || spec === 'none') return [];
  if (spec) return spec.split(',').map((s) => s.split(':')).filter(([id]) => CREW[id]).map(([id, role]) => [id, ROLES[role] ? role : 'loot']);
  const used = new Set([lead]);
  return DEFAULT_MATES.map(([id, role]) => {
    if (used.has(id)) id = SPARE.find((s) => !used.has(s));
    used.add(id); return [id, role];
  });
}

export class Bots {
  constructor(G, mates) {
    this.G = G;
    this.list = [];
    this.time = 0;
    this.log = [];
    this.root = new THREE.Group(); this.root.name = 'bots'; G.scene.add(this.root);
    // seeded from the house so a run replays the same way (tools/run.js drives it in sim time)
    let seed = ((G.house?.layout?.meta?.seed ?? 7) * 2654435761 + 977) >>> 0;
    this.rng = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const sp = G.house?.spawn || { x: 0, z: 0 };
    mates.forEach(([crew, role], i) => this.add(crew, role, sp.x + [1.2, -1.2, 0][i % 3], sp.z + [1, 1, 2][i % 3]));
  }

  add(crew, role, x, z) {
    const c = CREW[crew], G = this.G;
    const robot = buildRobot({ kind: 'crew', id: crew });
    this.root.add(robot.root);
    const nav = G.nav;
    if (nav && !nav.okW(x, z)) { const i = nav.nearest(x, z, 4); if (i >= 0) ({ x, z } = nav.center(i)); }
    const h = Math.min(1.7, Math.max(0.9, robot.height)), r = B.radius, hh = Math.max(0.05, (h - 2 * r) / 2);
    const b = {
      isBot: true, crew, role, R: ROLES[role], x, z, y0: r + hh + 0.1, gy: nav ? nav.heightAt(x, z) : 0, y: 0, h, r, hh, yaw: 0,
      hp: c.hp, maxHp: c.hp, atk: c.atk * ROLES[role].atkK, def: { beh: 'bot', speed: B.walk * c.spd }, kind: 'bot:' + crew,
      knock: { x: 0, z: 0 }, path: null, pathI: 0, pathGoal: null, repathT: 0, stuckT: 0, stuckRef: { x, z }, detour: null,
      down: false, carry: null, want: null, task: 'follow', thinkT: this.rng() * B.think, castT: 0, atkCd: 0, atkT: 0, moveSpeed: 0,
      invisT: 0, noDownT: 0, gongT: 0, hurtT: 0, robot, delivered: 0, hits: 0,
    };
    b.y = b.y0 + b.gy;
    const { R, world } = G.phys;
    b.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, b.y, z));
    // a sensor: walls still stop the bot (the controller sweeps its shape), but it never blocks the player or shoves loot;
    // no torch light of its own (three extra spot lights cost ~5 fps at 1280x720 in house 1)
    b.col = world.createCollider(R.ColliderDesc.capsule(hh, r).setSensor(true), b.body);
    this.list.push(b);
    return b;
  }

  isCol(c) { return this.list.some((b) => b.col === c); }
  alive() { return this.list.filter((b) => !b.down); }

  // ---------------------------------------------------------------- damage, revive
  hurt(b, dmg, from) {
    if (b.down || !(dmg > 0)) return 0;
    if (this.G.passives) { dmg = this.G.passives.onHurt(b, dmg); if (!(dmg > 0)) return 0; }
    if (b.noDownT > 0) dmg = Math.min(dmg, Math.max(0, b.hp - 1));
    b.hp = Math.max(0, b.hp - dmg); b.hurtT = 0.35;
    this.log.push(['hurt', b.crew, +dmg.toFixed(1), +b.hp.toFixed(1), from?.kind]);
    if (b.hp <= 0) this.goDown(b);
    return dmg;
  }
  goDown(b) {
    b.down = true; b.hp = 0; this.drop(b);
    b.col.setEnabled(false);
    this.log.push(['down', b.crew]);
    this.G.events.emit('bot:down', { bot: b });
  }
  revive(b, at, hpK = 0.35) {
    if (!b.down) return;
    b.down = false; b.hp = Math.max(1, Math.round(b.maxHp * hpK));
    if (at) this.teleport(b, at.x, at.z);
    b.col.setEnabled(true);
    this.log.push(['revive', b.crew]);
  }
  teleport(b, x, z) { b.x = x; b.z = z; b.path = null; b.gy = this.G.nav ? this.G.nav.heightAt(x, z) : 0; b.y = b.y0 + b.gy; b.body.setTranslation({ x, y: b.y, z }, true); b.body.setNextKinematicTranslation({ x, y: b.y, z }); }

  // ---------------------------------------------------------------- carrying (same hold as the brat's)
  take(b, it) {
    if (this.G.grab?.held === it) return false;
    it.carrier = b; it.held = true; it.grabbable = false; it.col.setEnabled?.(false); it.body.setGravityScale(0, true);
    b.carry = it; it.reservedBy = null;
    this.log.push(['take', b.crew, it.isHead ? 'head' : it.material]);
    return true;
  }
  hold(b) {
    const it = b.carry; if (!it || it.dead) { b.carry = null; return; }
    const half = it.isHead ? 0.17 : CFG.loot.sizes[it.size]?.half || 0.2;
    it.body.setTranslation({ x: b.x + Math.sin(b.yaw) * 0.2, y: b.gy + b.h + half + 0.05, z: b.z + Math.cos(b.yaw) * 0.2 }, true);
    it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setAngvel({ x: 0, y: 0.5, z: 0 }, true);
  }
  drop(b, at) {
    const it = b.carry; if (!it) return null;
    b.carry = null;
    it.carrier = null; it.held = false; it.grabbable = true; it.col.setEnabled?.(true); it.body.setGravityScale(1, true);
    if (at) it.body.setTranslation({ x: at.x, y: (this.G.nav ? this.G.nav.heightAt(at.x, at.z) : 0) + 0.5 + (CFG.loot.sizes[it.size]?.half || 0.2), z: at.z }, true);
    it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    it.grabbedAt = -99; it.hitAt = this.G.loot.time;   // set down gently: no fall damage
    return it;
  }

  // ---------------------------------------------------------------- per physics tick
  step(dt) {
    this.time += dt;
    const G = this.G, F = G.foes;
    if (!F || this.paused) return;   // paused: tests that use bots only as allies
    for (const b of this.list) {
      b.hurtT = Math.max(0, b.hurtT - dt); b.atkCd = Math.max(0, b.atkCd - dt); b.atkT = Math.max(0, b.atkT - dt);
      if (b.down || b.hold || b.heldBy) { b.moveSpeed = 0; continue; }   // hold: tests freeze one bot; heldBy: a foe holds it
      b.thinkT -= dt;
      if (b.thinkT <= 0) { b.thinkT += B.think; this.think(b); }
      b.castT -= dt;
      if (b.castT <= 0) { b.castT = B.castEvery; this.autoCast(b); }
      let speed = b.def.speed * (b.carry && !(b.gongT > 0) ? (G.passives ? G.passives.weightMul(B.carrySlow, b) : B.carrySlow) : 1);
      if (b.task === 'carryHead' || b.task === 'flee') speed *= 1.35;
      const g = b.want;
      const far = g && Math.hypot(g.x - b.x, g.z - b.z) > (g.stop ?? 0.35);
      F.move(b, dt, far ? g : null, far ? speed : 0, b.face || null);
      if (b.carry) this.hold(b);
      this.act(b, dt);
      if (b.role === 'soi' || b.task === 'explore') G.runner?.markSeen?.({ x: b.x, z: b.z });
    }
  }

  /** 5 Hz: choose the task and the goal. */
  think(b) {
    const G = this.G, P = G.player, pp = P.position;
    b.face = null;
    // the downed player's head goes to the pad: the loot bot first, anyone if the loot bot is down
    const head = P.down && P.head && !P.head.dead ? P.head : null;
    if (head && (b.role === 'loot' || !this.list.some((o) => o.role === 'loot' && !o.down))) {
      const pad = this.pad();
      if (b.carry === head) { b.task = 'carryHead'; b.want = pad ? { x: pad.x, z: pad.z, stop: 0.3 } : null; return; }
      const onPad = pad && this.G.extract.onPad(pad, head.body.translation());
      if (onPad && !head.held) { this.follow(b); return; }   // it lies on the pad: leave it there while the revive counts
      if (!b.carry && !head.held && !head.carrier) { const t = head.body.translation(); b.task = 'carryHead'; b.want = { x: t.x, z: t.z, stop: 0.5, it: head }; return; }
    }
    // in danger and weak: back to the player
    const threat = this.threat(b);
    if (threat && b.hp < b.maxHp * 0.3 && b.role !== 'thu') { b.task = 'flee'; b.want = this.away(b, threat); return; }
    if (b.role === 'loot') return this.thinkLoot(b);
    if (b.role === 'thu') return this.thinkGuard(b);
    if (b.role === 'soi') return this.thinkScout(b);
    if (b.role === 'baoke') return this.thinkVanguard(b);
    if (b.role === 'hotong') return this.thinkEscort(b);
    if (b.role === 'cuuho') return this.thinkMedic(b);
    if (b.role === 'nhu') return this.thinkDecoy(b);
    if (b.role === 'san') return this.thinkHunter(b);
    if (b.role === 'tiepte') return this.follow(b, 1.5);
    this.follow(b);
  }

  follow(b, dist = B.follow) {
    const P = this.G.player, p = P.down && P.head ? P.head.body.translation() : P.position;
    b.task = 'follow';
    b.want = Math.hypot(p.x - b.x, p.z - b.z) > dist + 0.6 ? { x: p.x, z: p.z, stop: dist } : null;
  }

  /** Nearest foe a fighter may swing at that matches pick(f, dist to bot), or null. */
  fightable(b, pick) {
    let tgt = null, bd = 1e9;
    for (const f of this.G.foes.list) {
      if (f.dead || f.def.immune || f.state === 'sleep' || (f.kind === 'impostor' && f.state !== 'chase')) continue;
      const db = Math.hypot(f.x - b.x, f.z - b.z);
      if (db < bd && pick(f, db)) { bd = db; tgt = f; }
    }
    return tgt;
  }
  fight(b, f) { b.task = 'fight'; b.target = f; b.want = { x: f.x, z: f.z, stop: B.reach * 0.8 }; b.face = { x: f.x, z: f.z }; }

  thinkVanguard(b) {
    const P = this.G.player, p = P.position, nav = this.G.nav;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const f = this.fightable(b, (f, db) => db < b.R.guardR || Math.hypot(f.x - p.x, f.z - p.z) < b.R.guardR);
    if (f) return this.fight(b, f);
    b.target = null;
    let k = b.R.ahead, x = p.x + fx * k, z = p.z + fz * k;
    while (k > 1 && nav && !(nav.okW(x, z) && nav.los(p.x, p.z, x, z))) { k -= 0.5; x = p.x + fx * k; z = p.z + fz * k; }
    b.task = 'vanguard'; b.want = { x, z, stop: 0.5 };
  }

  /** The one the escort guards: a loot bot carrying, the player holding loot in the beam, else the player. */
  ward() {
    const lb = this.list.find((o) => o.role === 'loot' && !o.down && o.carry);
    if (lb) return { x: lb.x, z: lb.z, who: lb };
    const P = this.G.player, h = this.G.grab?.held, p = P.position;
    return { x: p.x, z: p.z, who: h && !h.isHead ? 'beam' : 'player' };
  }
  thinkEscort(b) {
    const w = this.ward();
    const f = this.fightable(b, (f) => Math.hypot(f.x - w.x, f.z - w.z) < b.R.guardR || (w.who !== 'player' && w.who !== 'beam' && f.prey === w.who));
    if (f) return this.fight(b, f);
    b.target = null; b.task = 'escort'; b.ward = w.who;
    b.want = Math.hypot(w.x - b.x, w.z - b.z) > 2.1 ? { x: w.x, z: w.z, stop: 1.5 } : null;
  }

  thinkMedic(b) {
    const S = this.G.skills;
    const downed = this.list.find((o) => o !== b && o.down);
    if (downed) { b.task = 'revive'; b.patient = downed; b.want = { x: downed.x, z: downed.z, stop: 0.8 }; return; }
    let pt = null, low = b.R.below;
    for (const a of S.allies()) { if (a === b || a.down) continue; const k = a.hp / S.maxHp(a); if (k < low) { low = k; pt = a; } }
    if (pt) { const q = S.pos(pt); b.task = 'heal'; b.patient = pt; b.want = { x: q.x, z: q.z, stop: 1.0 }; return; }
    b.patient = null; this.follow(b);
  }

  thinkDecoy(b) {
    const P = this.G.player, p = P.position;
    const mine = this.G.foes.list.find((f) => !f.dead && f.prey === b && f.def.speed > 0);
    if (mine) {   // kite: keep 3-6 m from the foe it carries away
      const d = Math.hypot(mine.x - b.x, mine.z - b.z);
      b.task = 'lure'; b.target = mine;
      if (d < b.R.kite[0]) { const s = this.awayFrom(b, mine); b.want = s ? { ...s, stop: 0.4 } : null; }
      else if (d > b.R.kite[1]) b.want = { x: mine.x, z: mine.z, stop: b.R.kite[1] - 0.5 };
      else b.want = null;
      b.face = { x: mine.x, z: mine.z };
      return;
    }
    const f = this.G.foes.list.find((f) => !f.dead && f.def.speed > 0 && f.def.beh !== 'ghost' && (f.state === 'chase' || f.state === 'attack') && Math.hypot(f.x - p.x, f.z - p.z) < b.R.lureR);
    if (f) { b.task = 'lure'; b.target = f; b.want = { x: f.x, z: f.z, stop: 4 }; return; }
    b.target = null; this.follow(b);
  }
  awayFrom(b, f) {
    const dx = b.x - f.x, dz = b.z - f.z, d = Math.hypot(dx, dz) || 1, nav = this.G.nav;
    for (const k of [3, 2, 1.2]) { const x = b.x + dx / d * k, z = b.z + dz / d * k; if (nav.okW(x, z)) return { x, z }; }
    return nav.randomNear(this.rng, b.x, b.z, 1.5, 4);
  }

  thinkHunter(b) {
    const f = this.fightable(b, (f, db) => db < b.R.huntR && this.G.nav.los(b.x, b.z, f.x, f.z) || db < 4);
    if (f) return this.fight(b, f);
    b.target = null; this.follow(b);
  }

  pad() { const X = this.G.extract; const p = X?.pads?.[X.active]; return p && !p.done ? p : null; }

  thinkLoot(b) {
    const pad = this.pad();
    if (b.carry) {
      if (!pad) { this.drop(b); return this.follow(b); }
      b.task = 'deliver'; b.want = { x: pad.x, z: pad.z, stop: 0.3 }; return;
    }
    if (!pad) return this.follow(b);
    let best = b.want?.it && !b.want.it.dead && !b.want.it.held && b.want.it.reservedBy === b ? b.want.it : null;
    if (!best) {
      let bd = B.pickR;
      for (const it of this.G.loot.items) {
        if (it.dead || it.held || it.carrier || it.isHead || (it.reservedBy && it.reservedBy !== b) || !(it.value > 0)) continue;
        const t = it.body.translation();
        if (t.y > 2.2 || this.G.extract.pads.some((p) => this.G.extract.onPad(p, t))) continue;
        const d = Math.hypot(t.x - b.x, t.z - b.z) + 0.5 * Math.hypot(t.x - pad.x, t.z - pad.z);
        if (d < bd && this.G.nav.okW(t.x, t.z) !== false) { bd = d; best = it; }
      }
      if (best) best.reservedBy = b;
    }
    if (!best) return this.follow(b);
    const t = best.body.translation();
    b.task = 'fetch'; b.want = { x: t.x, z: t.z, stop: 0.6, it: best };
  }

  thinkGuard(b) {
    const P = this.G.player, pp = P.position;
    let tgt = null, bd = 1e9;
    for (const f of this.G.foes.list) {
      if (f.dead || f.def.immune || f.state === 'sleep' || f.kind === 'impostor' && f.state !== 'chase') continue;
      const dp = Math.hypot(f.x - pp.x, f.z - pp.z), db = Math.hypot(f.x - b.x, f.z - b.z);
      const hunting = f.state === 'chase' || f.state === 'attack' || (f.prey && !f.prey.down);
      if ((dp < b.R.guardR || (hunting && db < b.R.leash)) && db < bd) { bd = db; tgt = f; }
    }
    if (tgt) { b.task = 'fight'; b.target = tgt; b.want = { x: tgt.x, z: tgt.z, stop: B.reach * 0.8 }; b.face = { x: tgt.x, z: tgt.z }; return; }
    b.target = null; this.follow(b);
  }

  thinkScout(b) {
    const G = this.G, R = G.run, L = G.house?.layout, F = G.foes, nav = G.nav;
    // mark what it sees (scout eye +30 %)
    const sight = b.R.sight * b.R.eyeK * (G.passives?.seeMul() ?? 1);
    for (const f of F.list) if (!f.dead && Math.hypot(f.x - b.x, f.z - b.z) < sight && nav.los(b.x, b.z, f.x, f.z)) { if (!(f.markT > 0)) this.log.push(['mark', f.kind]); f.markT = B.markT; }
    if (!L || !R?.seen) return this.follow(b);
    // nearest room nobody has seen, by path length estimate
    if (!b.explore || R.seen.has(b.explore.id) || this.time - b.exploreAt > 25) {
      let best = null, bd = 1e9;
      for (const r of L.rooms) {
        if (R.seen.has(r.id)) continue;
        const cx = r.x + r.w / 2, cz = r.y + r.h / 2, i = nav.nearest(cx, cz, 3);
        if (i < 0) continue;
        const d = Math.hypot(cx - b.x, cz - b.z);
        if (d < bd) { bd = d; best = { id: r.id, ...nav.center(i) }; }
      }
      b.explore = best; b.exploreAt = this.time;
    }
    if (!b.explore) return this.follow(b);
    b.task = 'explore'; b.want = { x: b.explore.x, z: b.explore.z, stop: 0.5 };
  }

  threat(b) {
    let t = null, bd = 3.5;
    for (const f of this.G.foes.list) if (!f.dead && f.state !== 'sleep' && f.def.speed > 0 && (f.prey === b || f.state === 'chase')) { const d = Math.hypot(f.x - b.x, f.z - b.z); if (d < bd) { bd = d; t = f; } }
    return t;
  }
  away(b, f) {
    const P = this.G.player.position;
    if (Math.hypot(P.x - f.x, P.z - f.z) > 3) return { x: P.x, z: P.z, stop: 1.2 };
    const s = this.G.nav.randomNear(this.rng, b.x + (b.x - f.x), b.z + (b.z - f.z), 1, 4);
    return s ? { ...s, stop: 0.4 } : null;
  }

  /** Close-range actions after moving: pick up, set down, hit. */
  act(b, dt = 0) {
    const G = this.G, w = b.want, S = G.skills;
    // medic: patch the patient within reach, stand a downed bot up after 4 s beside it
    if (b.task === 'heal' && b.patient && S && Math.hypot(S.pos(b.patient).x - b.x, S.pos(b.patient).z - b.z) <= b.R.healR) { S.heal(b.patient, b.R.hps * dt); b.healed = (b.healed || 0) + b.R.hps * dt; }
    if (b.task === 'revive' && b.patient?.down && Math.hypot(b.patient.x - b.x, b.patient.z - b.z) <= 1.2) {
      b.reviveT = (b.reviveT || 0) + dt;
      if (b.reviveT >= b.R.reviveSec) { this.revive(b.patient, null, 0.35); this.log.push(['medic', b.crew, b.patient.crew]); b.reviveT = 0; b.thinkT = 0; }
    } else if (b.task !== 'revive') b.reviveT = 0;
    // decoy: get noticed (noise every 1 s, the foe takes it as prey)
    if (b.task === 'lure' && b.target && !b.target.dead && Math.hypot(b.target.x - b.x, b.target.z - b.z) < 7) {
      b.lureT = (b.lureT || 0) - dt;
      if (b.lureT <= 0) { b.lureT = b.R.noiseEvery; G.noise?.emit({ x: b.x, z: b.z, r: 7, str: 1.3, src: 'decoy' }); G.foes.provoke(b.target, b, 4); this.log.push(['lure', b.crew, b.target.kind]); }
    }
    // support: a kit to an ally under 40 % within 3 m
    if (b.role === 'tiepte' && S) {
      b.kitT = Math.max(0, (b.kitT || 0) - dt);
      if (b.kitT <= 0) for (const a of S.allies()) {
        if (a === b || a.down || a.hp >= S.maxHp(a) * b.R.below) continue;
        const q = S.pos(a); if (Math.hypot(q.x - b.x, q.z - b.z) > b.R.kitR) continue;
        S.heal(a, b.R.kitHp); b.kitT = b.R.kitCd; this.log.push(['kit', b.crew, a.isBot ? a.crew : 'player']); break;
      }
    }
    if ((b.task === 'fetch' || b.task === 'carryHead') && !b.carry && w?.it && !w.it.dead) {
      const t = w.it.body.translation();
      if (Math.hypot(t.x - b.x, t.z - b.z) < 0.9 && !w.it.held && this.take(b, w.it)) b.thinkT = 0;
    } else if (b.carry && (b.task === 'deliver' || b.task === 'carryHead')) {
      const pad = this.pad();
      if (pad && Math.abs(b.x - pad.x) < pad.half * B.padIn && Math.abs(b.z - pad.z) < pad.half * B.padIn) {
        const it = this.drop(b, { x: pad.x + (this.rng() - 0.5) * pad.half * 0.6, z: pad.z + (this.rng() - 0.5) * pad.half * 0.6 });
        if (it && !it.isHead) b.delivered += it.value;
        this.log.push(['deliver', b.crew, it?.isHead ? 'head' : it?.value]);
        b.thinkT = 0;
      }
    } else if (b.task === 'fight' && b.target && !b.target.dead) {
      const f = b.target, d = Math.hypot(f.x - b.x, f.z - b.z);
      if (d < B.reach + f.r && b.atkCd <= 0) {
        const dir = { x: (f.x - b.x) / (d || 1), z: (f.z - b.z) / (d || 1) };
        G.foes.hurtFoe(f, b.atk, dir, B.knock);
        G.foes.provoke?.(f, b, B.aggro);
        G.passives?.chill(f, b);
        b.atkCd = B.atkCd; b.atkT = 0.3; b.hits++;
        this.log.push(['hit', b.crew, f.kind, +b.atk.toFixed(1)]);
      }
    }
  }

  // ---------------------------------------------------------------- skill rules
  autoCast(b) {
    const S = this.G.skills; if (!S || !S.ready(b)) return;
    const c = CREW[b.crew], P = this.G.player, pp = S.pos(P), me = { x: b.x, z: b.z };
    const awake = (p, r) => S.foesNear(p, r, (f) => f.state !== 'sleep' && (f.state === 'chase' || f.state === 'attack' || f.prey));
    const allies = S.allies(), hurt = (k) => allies.filter((o) => !o.down && o.hp < S.maxHp(o) * k);
    const downed = allies.filter((o) => o !== b && o.down);
    let go = false;
    switch (c.skill) {
      case 'flash': case 'shock': go = awake(me, c.r * 0.85).length > 0; break;
      case 'freeze': go = awake(me, c.r * 0.7).length >= 1 && (awake(pp, 3).length > 0 || awake(me, 3).length > 0); break;
      case 'cage': go = awake(me, 2.5).length > 0 || awake(pp, 2.5).length > 0; break;
      case 'healring': go = hurt(0.7).some((o) => Math.hypot(S.pos(o).x - b.x, S.pos(o).z - b.z) < c.r); break;
      case 'unlock': go = hurt(0.6).length > 0 || (this.G.house?.jammedNear?.(b.x, b.z, c.r) || 0) > 0; break;
      case 'gong': go = !!b.carry; break;
      case 'vanish': go = b.hp < b.maxHp * 0.5 && !!this.threat(b); break;
      case 'decoy': go = awake(pp, 8).length > 0 && !P.down; break;
      case 'rescue': go = downed.some((o) => Math.hypot(S.pos(o).x - b.x, S.pos(o).z - b.z) < c.r); break;
      case 'blink': go = !!this.threat(b) && b.hp < b.maxHp * 0.6; break;
      case 'reveal': go = this.G.run?.phase === 'loot'; break;
      case 'pull': go = this.G.loot.items.filter((it) => !it.dead && !it.held && !it.isHead && Math.hypot(it.body.translation().x - b.x, it.body.translation().z - b.z) < c.r).length >= 2; break;
      case 'angel': go = downed.length > 0 || hurt(0.25).some((o) => awake(S.pos(o), 3).length > 0); break;
    }
    if (go) { const r = S.cast(b); if (r.ok) this.log.push(['cast', b.crew, c.skill]); }
  }

  // ---------------------------------------------------------------- render
  render(dt, camPos) {
    for (const b of this.list) {
      const vis = Math.hypot(b.x - camPos.x, b.z - camPos.z) < 32;
      b.robot.root.visible = vis; if (!vis) continue;
      b.robot.root.position.set(b.x, b.gy || 0, b.z); b.robot.root.rotation.y = b.yaw;
      b.robot.animate(dt, { speed: b.moveSpeed, carrying: !!b.carry, attack: b.atkT > 0 ? 0.5 - b.atkT : 0, hurt: b.hurtT > 0 ? 1 : 0, down: b.down });
    }
  }

  dispose() {
    const w = this.G.phys.world;
    for (const b of this.list) { this.drop(b); w.removeRigidBody(b.body); b.robot.dispose(); }
    this.G.scene.remove(this.root);
    this.list = [];
  }
}
