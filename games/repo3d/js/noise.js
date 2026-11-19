// Sounds in the house. A noise event is { x, z, r, str, src, t }: r is its reach in tiles for a foe with the
// baseline hearing 5 (source NoiseRules.refHear), so a foe hears it when dist < r * foe.hear / 5.
// Player footsteps follow the source: noise = 0.25 sneak / 1 walk / 2.6 run, radius = noise * 5 * 0.6 tiles.
// The player's meter (0..12 tiles) is max(footstep radius, latest event peak), the peak holds 0.5 s then falls 10/s.
const R = {
  refHear: 5, floorK: 0.5, footK: 0.6, fall: 10, hold: 0.5, max: 12,
  sneak: 0.25, walk: 1, run: 2.6, footEvery: 0.25,
  dropR: 2, dropSizeStep: 0.5, dropStr: 0.8,
  impactR0: 2, impactR1: 7, impactStr: 1.4, impactGap: 0.3,
  throwR: 3.5, throwStr: 1.5, extractR: 30, extractStr: 2.2, doorR: 11, doorStr: 1.6,
  life: 0.6,
};
import { CFG } from './config.js';

const SIZE_IDX = { small: 0, medium: 1, big: 2 };

export class Noise {
  constructor(G) {
    this.G = G;
    this.events = [];
    this.time = 0;
    this.meter = 0;
    this.peak = 0;
    this.holdT = 0;
    this.footT = 0;
    this.src = 'none';
    this.lastHeld = null;
    this.impactAt = new Map();
    const ev = G.events;
    ev.on('loot:hit', (e) => this.onImpact(e));
    ev.on('pad:extract', (e) => this.emit({ x: e.pad.x, z: e.pad.z, r: R.extractR, str: R.extractStr, src: 'extract' }));
    ev.on('door:slam', (e) => this.emit({ x: e.x, z: e.z, r: R.doorR, str: R.doorStr, src: 'door' }));
    ev.on('noise', (e) => this.emit(e));
  }

  /** Add an event. `mine` = the player caused it, so it also bumps the HUD meter. */
  emit({ x, z, r, str = 1, src = 'misc', mine = false }) {
    const e = { x, z, r, str, src, t: this.time, id: (this.seq = (this.seq || 0) + 1), floor: this.floorAt(x, z) };
    this.events.push(e);
    if (mine && r >= this.peak) { this.peak = Math.min(R.max, r); this.holdT = R.hold; this.src = src; }
    return e;
  }

  floorAt(x, z) { const nav = this.G.foes?.nav || this.G.nav; return nav?.floorAt ? nav.floorAt(x, z) : 0; }

  /** Strongest event newer than id `after` that a listener at (x, z) with hearing `hear` catches. A noise on another
   *  floor carries R.floorK (about half) as far (design: through a floor). */
  heard(x, z, hear, after = 0) {
    if (!(hear > 0)) return null;
    let best = null;
    const lf = this.floorAt(x, z);
    for (const e of this.events) {
      if (e.id <= after) continue;
      const reach = e.r * hear / R.refHear * (e.floor === lf ? 1 : R.floorK);
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > reach) continue;
      if (!best || e.str > best.str) best = e;
    }
    return best;
  }

  lastId() { return this.seq || 0; }

  onImpact(e) {
    const it = e.item, p = e.point;
    const last = this.impactAt.get(it);
    if (last !== undefined && this.time - last < R.impactGap) return;
    this.impactAt.set(it, this.time);
    if (this.impactAt.size > 96) this.impactAt.clear();
    const th = CFG.loot.materials[it.material]?.thresh || 4;
    const force = Math.max(0, Math.min(1, (e.dv - th) / th * 2));
    const mine = this.G.time - (it.grabbedAt ?? -99) < 4 || this.G.grab?.held === it;
    this.emit({ x: p.x, z: p.z, r: R.impactR0 + (R.impactR1 - R.impactR0) * force, str: R.impactStr, src: 'impact', mine });
  }

  /** Footsteps of the player, drop / throw detection from the beam, meter decay, event expiry. */
  step(dt, player, grab) {
    this.time += dt;
    let noise = 0;
    if (player && !player.down && !(player.invisT > 0)) {   // Shade's vanish: unheard
      const moving = (player.horizSpeed || 0) > 0.4 && player.grounded;
      const crouched = player.eye < (CFG.player.eye + CFG.player.crouchEye) / 2;
      noise = !moving ? 0 : player.sprinting ? R.run : crouched ? R.sneak : R.walk;
      this.footT -= dt;
      if (noise > 0 && this.footT <= 0) {
        this.footT = R.footEvery;
        const t = player.position;
        this.emit({ x: t.x, z: t.z, r: noise * R.refHear * R.footK * (this.G.passives?.noiseMul() ?? 1), str: noise, src: player.sprinting ? 'run' : crouched ? 'sneak' : 'walk' });
      }
    }
    // beam release: fast = a throw, slow = a drop
    const held = grab?.held || null;
    if (this.lastHeld && held !== this.lastHeld && !this.lastHeld.dead) {
      const b = this.lastHeld.body, v = b.linvel(), t = b.translation();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 4) this.emit({ x: t.x, z: t.z, r: R.throwR, str: R.throwStr, src: 'throw', mine: true });
      else this.emit({ x: t.x, z: t.z, r: R.dropR + R.dropSizeStep * (SIZE_IDX[this.lastHeld.size] || 0), str: R.dropStr, src: 'drop', mine: true });
    }
    this.lastHeld = held;
    if (this.holdT > 0) this.holdT = Math.max(0, this.holdT - dt);
    else if (this.peak > 0) this.peak = Math.max(0, this.peak - R.fall * dt);
    const foot = noise * R.refHear * R.footK * (this.G.passives?.noiseMul() ?? 1);   // Shade's cat feet
    this.meter = Math.min(R.max, Math.max(foot, this.peak));
    if (foot > 0 && foot >= this.peak) this.src = player.sprinting ? 'run' : noise < 1 ? 'sneak' : 'walk';
    else if (this.peak <= 0) this.src = 'none';
    if (this.events.length && this.time - this.events[0].t > R.life) this.events = this.events.filter((e) => this.time - e.t <= R.life);
  }

  /** 0..12 tiles, what the HUD noise bar shows (red from 70 %). */
  level() { return this.meter; }
}

export const NOISE_RULES = R;
