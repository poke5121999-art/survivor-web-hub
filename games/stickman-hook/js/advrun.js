// Adventure mode, the run itself (no DOM: the node bot drives it too). Ported from AdventurePatternSpawner,
// AdventurePlayerController, Firewall, GravityZone, Portal, TargetAdventure, BumperAdventure and AdventureSkillDto.
// Rules and addresses: README "Phiêu lưu (Adventure)". Data: data/mode-adventure.json (tools/build_adventure.py).
import { Player, PHYS } from './physics.js';
import { NetRandom } from './level.js';
import { deathLimits } from './camera.js';

const F = Math.fround;
const clamp01 = (v) => (v > 1 ? 1 : v < 0 ? 0 : v);

// ---- UnityEngine.Random, read from libunity.so (Thumb): Xorshift128 ---------------------------------------------------
// InitState [libunity 0x22a968]: x = seed, y = x * 1812433253 + 1, z = y * ... + 1, w = z * ... + 1.
// value [0x22aa10]: (w' & 0x7FFFFF) * 1.1920930e-7 (float 0x34000001 = 1 / 8388607).
// Range(float) [0x22a998]: t = value; (1 - t) * max + t * min. Range(int) [0x236128]: min + next % (max - min).
const VALUE_K = F(1 / 8388607);
export class URandom {
  constructor(seed = 0) { this.s = new Uint32Array(4); this.init(seed); }
  init(seed) {
    const s = this.s;
    s[0] = seed;
    s[1] = Math.imul(s[0], 1812433253) + 1;
    s[2] = Math.imul(s[1], 1812433253) + 1;
    s[3] = Math.imul(s[2], 1812433253) + 1;
  }
  next() {
    const s = this.s, t = (s[0] ^ (s[0] << 11)) >>> 0;
    s[0] = s[1]; s[1] = s[2]; s[2] = s[3];
    s[3] = s[3] ^ (s[3] >>> 19) ^ t ^ (t >>> 8);
    return s[3];
  }
  value() { return F((this.next() & 0x7fffff) * VALUE_K); }
  range(min, max) { const t = this.value(); return F(F(F(1 - t) * F(max)) + F(t * F(min))); }
  rangeInt(min, max) {
    if (min < max) return min + (this.next() % (max - min));
    if (min > max) return min - (this.next() % (min - max));
    return min;
  }
}

// AnimationCurve.Evaluate for unweighted keys [time, value, inSlope, outSlope] (cubic Hermite), wrap mode Loop (2).
export function curve(keys, t) {
  const a = keys[0][0], b = keys[keys.length - 1][0];
  if (t < a || t > b) t = a + ((((t - a) % (b - a)) + (b - a)) % (b - a));
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0, , o0] = keys[i], [t1, v1, i1] = keys[i + 1];
  const dt = t1 - t0, s = dt > 0 ? (t - t0) / dt : 0, s2 = s * s, s3 = s2 * s;
  return F((2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * o0 * dt + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * i1 * dt);
}

// AHEasing as MadBox Easings.Interpolate: LINEAR 0, SINE_EASE_IN_OUT 15 (TargetAdventure.movingEasing)
const EASE = { 0: (p) => p, 15: (p) => 0.5 * (1 - Math.cos(p * Math.PI)) };

export const SKILL_IDS = ['bounce_difficulty', 'wind_difficulty', 'hook_difficulty', 'rope_length', 'teleporter_spawn_chance',
  'firewall_difficulty'];

// AdventureSkillDto rows of mode-adventure.json -> objects; `top` = GetSkillLevelMax = maxLevel + the limit-boost card's
// effect at its max level [asm 0x1269d78] (80), which is what a skill's level is divided by.
export function skillDefs(data) {
  const out = {};
  for (const r of data.skills) {
    const [id, maxLevel, min, max, bad, neutral, good, minSize, maxSize, mult, bonusDist, name, card] = r;
    out[id] = { id, maxLevel, min, max, bad, neutral, good, minSize, maxSize, mult, bonusDist, name, top: maxLevel + card };
  }
  return out;
}

// AdventureSkillDto.GetValueAtLevelAndDistance [asm 0x126a060]:
// lerp(min, max, clamp01(progression(clamp01((1 + bonus(clamp01(distance / maxBonusDistance)) * mult) * level / top))))
export function skillValue(data, s, level, distance = 0) {
  const c = data.cfg.curves;
  const b = curve(c.bonus, clamp01(F(F(distance) / s.bonusDist)));
  const x = clamp01(F(F(F(1 + F(b * s.mult)) * F(level)) / s.top));
  const k = clamp01(curve(c.prog, x));
  return F(s.min + F(F(s.max - s.min) * k));
}

// AdventureSkillDto.GetDifficulty [asm 0x126ac08]: 0 BAD, 1 NEUTRAL, 2 GOOD
export function difficulty(s, v) {
  const bn = F(s.bad + s.neutral), x = F(F(bn + s.good) * v);
  return x > bn ? 2 : x > s.bad ? 1 : 0;
}

// v = r + (min(1, r + size) - r) * skill: the roll every Adventure object makes with its skill
function biased(r, size, skill) {
  const top = Math.min(1, F(r + size));
  return F(r + F(F(top - r) * skill));
}

export const TARGET = { NORMAL: 0, ONE_TIME: 1, TIMED: 2, MOVING: 3, SPINNING: 4 };
export const BUMPER = { NORMAL: 0, SAME: 1, ONE_TIME: 2, LOW: 3, HIGH: 4 };
export const ZONE = { UP: 0, DOWN: 1 };
const SHRINK = 0.1; // ShrinkToNothing(0.1) of one-time / timed targets and one-time bumpers
const TELE_SPEED = 20; // TeleportRoutine: t += dt / distance * 20 [asm 0x12a14d0..0x12a14ec]
const TELE_EXIT = [14.7087, 2.94174]; // velocity after a teleport [asm 0x12a1660..0x12a1678]

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
// trigger overlap of the player's circle with a polygon (world points)
function circlePoly(x, y, r, pts) {
  if (inPoly(x, y, pts)) return true;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) if (segDist(x, y, pts[j], pts[j + 1], pts[i], pts[i + 1]) < r) return true;
  return false;
}

// The Adventure player: PlayerDefault's body and spring rope, plus AdventurePlayerController / PlayerHookController
// ropeLength / AdventurePlayerInputController grab-on-hold.
export class AdvPlayer extends Player {
  constructor(spawn, run) {
    super(spawn);
    this.run = run;
    this.eg = [0, 0]; // extraGravity, set by gravity zone triggers
    this.egOn = false;
    this.nearest = -1; // closestTargetRope: the nearest target, also out of rope range (rope indicator)
    this.alpha = 1;
    this.tele = null;
  }

  // UpdateClosestTarget(0) with ropeLength > 0 [asm 0x120a58c]: the current closest is dropped when it is farther than
  // the rope; the nearest active target becomes the closest only when it is within the rope.
  updateClosest(world) {
    const ts = world.targets, rope = this.run.rope;
    if (this.closest >= 0 && rope > 0) {
      const c = ts[this.closest];
      if (!c || c.gone || Math.hypot(c.x - this.x, c.y - this.y) > rope) this.closest = -1;
    }
    let best = -1, bd = Infinity;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (!t.active || t.gone) continue;
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (d < bd) { bd = d; best = i; }
    }
    this.nearest = best;
    const cand = best >= 0 && (rope <= 0 || bd <= rope) ? best : -1;
    if (cand < 0 && rope > 0) return;
    this.closest = cand;
  }

  grab(world) {
    if (this.tele) return;
    const was = this.hooked;
    super.grab(world);
    if (this.hooked >= 0 && was < 0) this.run.onGrab(world.targets[this.hooked]);
  }

  ungrab() {
    if (this.hooked < 0) return;
    const t = this.run.world.targets[this.hooked];
    super.ungrab();
    if (t) this.run.onUngrab(t);
  }

  step(dt, world, hold) {
    if (this.tele) { this.time += dt; this.age += dt; return { bumper: -1, finished: false }; }
    // _grabOnHold: while the button is held, Grab every frame until a target is in range [asm 0x12a18f8..0x12a1940]
    if (hold && this.hooked < 0 && this.run.cfg.grabOnHold) this.wasHold = false;
    return super.step(dt, world, hold);
  }

  // AdventurePlayerController.FixedUpdate [asm 0x12a0920]: AddForce(extraGravity) unless hooked and moving against it;
  // speed capped at _playerMaxVelocity. TargetAdventure.FixedUpdate of a hooked SPINNING target lifts the speed to
  // minMagnitude [asm 0x11fca84].
  beforeFixedStep(dt, world) {
    const [ex, ey] = this.eg, el = Math.hypot(ex, ey);
    let on = el > 1e-5;
    if (on && this.hooked >= 0) {
      const v = Math.hypot(this.vx, this.vy);
      on = v > 1e-5 && (ex / el) * (this.vx / v) + (ey / el) * (this.vy / v) > 0;
    }
    this.egOn = on;
    const max = this.run.cfg.maxVel, sp = Math.hypot(this.vx, this.vy);
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
    if (this.hooked >= 0) {
      const t = world.targets[this.hooked];
      const s = Math.hypot(this.vx, this.vy), m = this.run.cfg.target.minMag;
      if (t && t.type === TARGET.SPINNING && t.isHooked && s < m) {
        if (s > 1e-5) { this.vx *= m / s; this.vy *= m / s; } else { this.vx = 0; this.vy = 0; }
      }
    }
  }

  accel(world) {
    const a = super.accel(world);
    if (this.egOn) { a[0] += this.eg[0] / PHYS.mass; a[1] += this.eg[1] / PHYS.mass; }
    return a;
  }
}

// One Adventure run. opts: {seed (Leaderboard.Seed), levels: {skillId: level}, aspect (camera width / height),
// last, best (score lines)}.
export class AdvRun {
  constructor(data, opts) {
    this.data = data;
    this.cfg = data.cfg;
    this.skills = skillDefs(data);
    this.levels = opts.levels || {};
    this.seed = opts.seed | 0;
    this.aspect = opts.aspect || 9 / 16;
    this.lines = { last: opts.last || 0, best: opts.best || 0 };
    this.U = new URandom(0);
    this.index = 0; // AdventurePatternSpawner._index
    // Target._targetsCount, BumperAdventure._bumpersCount: static, only Start increments them, never reset after
    // launch [asm 0x120114c, 0x11faac0]: `opts.counts` is the page's pair (adventure.js COUNTS), so a second run of the
    // same session goes on from where the first stopped, as in the original; a page load (app launch) starts at 0.
    this.counts = opts.counts || { target: 0, bumper: 0 };
    this.spawned = [];
    this.world = { targets: [], bumpers: [], caps: [], polys: [], finishX: Infinity };
    this.time = 0;
    this.dead = null;
    // PlayerHookController.ropeLength = rope_length at distance 0 (AdventurePlayerController.Awake [asm 0x12a081c])
    this.rope = this.value('rope_length', 0);
    const fw = this.cfg.firewall;
    // Firewall.Init: position (0, 0, 0), speed = minSpeed, skillValue = firewall_difficulty [asm 0x11fb4cc..0x11fb51c]
    this.fire = { x: 0, speed: fw.minSpeed, moving: false, timer: 0, skill: this.value('firewall_difficulty', 0) };
    for (let i = 0; i < this.cfg.initialPatterns; i++) this.load();
    const sp = this.data.patterns[this.spawned[0].name].spawn;
    this.spawn = { x: sp[0], y: sp[1] };
    this.player = new AdvPlayer(this.spawn, this);
    this.startX = this.spawn.x; // PlayerController.StartingX
    this.distance = 0; // AdventurePlayerController.lastDistance
    this.cam = { x: 0, y: 0, zoom: 5 };
    this.cam.x = this.clampCam(this.spawn.x);
    this.events = []; // for the renderer: {type, x, y, t}
  }

  level(id) { return this.levels[id] || 0; }
  value(id, distance) { return skillValue(this.data, this.skills[id], this.level(id), distance); }

  // FindLastIndex(_index >= increaseDifficultyEveryXPatterns[k]), clamped to the pools [asm 0x11f8e3c..0x11f8ee0]
  tier() {
    const inc = this.cfg.inc;
    let k = -1;
    for (let i = 0; i < inc.length; i++) if (this.index >= inc[i]) k = i;
    return Math.max(0, Math.min(k, this.data.tiers.length - 1));
  }

  // LoadNewAdventurePattern [asm 0x11f9300]
  load() {
    const pats = this.data.patterns, last = this.spawned[this.spawned.length - 1];
    const seed = (this.seed + this.index) | 0; // Leaderboard.Seed + _index [asm 0x11f950c]
    const exit = last ? last.exit : 7;
    const cands = this.data.tiers[this.tier()].filter((n) => (pats[n].entry & exit) !== 0); // Intersects [asm 0x12a242c]
    if (!cands.length) return null; // "No pattern found for difficulty {0} and last exit position {1}"
    const name = cands[new NetRandom(seed).next(cands.length)]; // RandomElement: Next(0, count) [asm 0x17501a8]
    const p = pats[name];
    const ox = last ? last.endX : 0, oy = last ? last.endY : 0; // previous end, or Vector3.zero [asm 0x11f9700..0x11f9774]
    const inst = {
      name, ox, oy, endX: ox + p.end[0], endY: oy + p.end[1], entry: p.entry, exit: p.exit, index: this.index,
      targets: p.targets.map(([x, y, ini]) => ({ x: x + ox, y: y + oy, x0: x + ox, y0: y + oy, ini, active: true, type: 0 })),
      bumpers: p.bumpers.map((b) => ({ cap: [b.cap[0] + ox, b.cap[1] + oy, b.cap[2] + ox, b.cap[3] + oy, b.cap[4]],
        m: [b.m[0], b.m[1], b.m[2], b.m[3], b.m[4] + ox, b.m[5] + oy], ini: b.ini, active: true, anim: -1, type: 0 })),
      caps: p.caps.map((c) => [c[0] + ox, c[1] + oy, c[2] + ox, c[3] + oy, c[4]]),
      polys: p.polys.map((q) => q.map((v, i) => v + (i % 2 ? oy : ox))),
      sp: (p.sp || []).map(([x, y]) => [x + ox, y + oy]),
      draw: p.draw, zone: null, portal: null,
    };
    this.zone(inst, seed);
    this.portal(inst, seed);
    this.spawned.push(inst);
    this.index++;
    // Target.Start / BumperAnimationController.Start of the new pattern's objects. [ĐỀ XUẤT] in hierarchy order, right
    // after the spawn (Unity runs them before their first Update); each one re-seeds Random with its own counter.
    for (const s of p.seq) {
      const i = +s.slice(1);
      if (s[0] === 't') this.startTarget(inst.targets[i]); else this.startBumper(inst.bumpers[i]);
    }
    this.rebuild();
    return inst;
  }

  // SpawnGravityZone [asm 0x11f9950]
  zone(inst, seed) {
    const U = this.U, g = this.cfg.gz, s = this.skills.wind_difficulty;
    U.init(seed);
    if (!(U.value() < this.cfg.gzChance)) return;
    const w = g.size[0];
    // left edge anywhere in [start, end - width]: position = start + right * width / 2 + right * span * value
    const span = F(F(inst.endX - inst.ox) - w);
    const x = F(F(inst.ox + F(w * 0.5)) + F(span * U.value())), y = inst.oy;
    const size = U.range(s.minSize, s.maxSize), r = U.value(); // Range first, then value [asm 0x11f9cb8, 0x11f9cc4]
    const d = difficulty(s, biased(r, size, this.value(s.id, Math.trunc(x))));
    // BAD -> SetType(DOWN), GOOD -> SetType(UP), NEUTRAL -> no SetType (gravityType stays UP, no render group)
    const type = d === 0 ? ZONE.DOWN : ZONE.UP;
    const pts = [];
    for (let i = 0; i < g.poly.length; i += 2) pts.push(x + g.poly[i] * g.size[0], y + g.poly[i + 1] * g.size[1]);
    inst.zone = { x, y, type, shown: d !== 1, pts, force: type === ZONE.UP ? g.up : g.down };
  }

  // SpawnPortal [asm 0x11f9e1c]
  portal(inst, seed) {
    const U = this.U, c = this.cfg, s = this.skills.teleporter_spawn_chance;
    U.init(seed);
    const prev = this.spawned[this.spawned.length - 1];
    let gate;
    if (!prev || prev.ox < c.portalBonusDist) {
      // the bonus gate: clamp01((1 - portalBonusCurve(_index / 300)) * chance) <= chance, so it always passes
      gate = clamp01(F(F(1 - curve(c.curves.bonus, F(this.index / c.portalBonusDist))) * c.portalChance));
    } else gate = U.value();
    if (gate > c.portalChance) return;
    const r = U.value(), size = U.range(s.minSize, s.maxSize); // value first, then Range [asm 0x11fa0b4, 0x11fa0ec]
    if (difficulty(s, biased(r, size, this.value(s.id, Math.trunc(inst.ox)))) !== 2) return;
    if (!inst.sp.length) return;
    const [px, py] = inst.sp[U.rangeInt(0, inst.sp.length)];
    const pts = [], q = c.portalPoly;
    inst.portal = { x: px + 1, y: py, killed: -1, inst }; // spawn point + Vector3.right [asm 0x11fa3a8..0x11fa3bc]
    for (let i = 0; i < q.length; i += 2) pts.push(inst.portal.x + q[i], py + q[i + 1]);
    inst.portal.pts = pts;
  }

  // Target.Start in Adventure [asm 0x1200e74] + TargetAdventure.SetType [asm 0x11fcc48]
  startTarget(t) {
    const U = this.U, s = this.skills.hook_difficulty, c = this.cfg.target;
    U.init((this.seed + this.counts.target++) | 0);
    const r = U.value(), size = U.range(s.minSize, s.maxSize);
    const d = difficulty(s, biased(r, size, this.value(s.id, Math.trunc(t.x))));
    // GOOD -> SPINNING, NEUTRAL -> NORMAL, BAD -> Random.Range(0, 3) + 1: ONE_TIME / TIMED / MOVING
    let type = d === 2 ? TARGET.SPINNING : d === 1 ? TARGET.NORMAL : U.rangeInt(0, 3) + 1;
    if (t.ini) type = TARGET.NORMAL; // parent name contains "INITIAL" [asm 0x11fcde8..0x11fcdf4]
    t.type = type;
    t.isHooked = false; t.once = false; t.rot = 0; t.shrink = -1;
    if (type === TARGET.TIMED) t.timer = c.timer;
    if (type === TARGET.MOVING) {
      // direction Random.Range(0, 4) (Scrollbar.Direction): start and end half the distance either side
      const dir = U.rangeInt(0, 4), h = c.distance / 2;
      const ax = [[-h, 0, h, 0], [h, 0, -h, 0], [0, -h, 0, h], [0, h, 0, -h]][dir];
      t.dir = dir;
      t.mv = { a: [t.x0 + ax[0], t.y0 + ax[1]], b: [t.x0 + ax[2], t.y0 + ax[3]], t: 0, leg: 0 };
    }
  }

  // BumperAnimationController.Start in Adventure [asm 0x11ff9f4] + BumperAdventure.SetType [asm 0x11fa948]
  startBumper(b) {
    const U = this.U, s = this.skills.bounce_difficulty, bo = this.cfg.bounce;
    U.rangeInt(0, 4); // the initial type, overwritten by SetType below [asm 0x11ffbe8]
    U.init((this.seed + this.counts.bumper++) | 0);
    const r = U.value(), size = U.range(s.minSize, s.maxSize);
    const d = difficulty(s, biased(r, size, this.value(s.id, Math.trunc(b.m[4]))));
    // NEUTRAL -> NORMAL, GOOD -> HIGH_BUMP, BAD -> Random.Range(0, 2): 0 LOW_BUMP, 1 ONE_TIME
    let type = d === 1 ? BUMPER.NORMAL : d === 2 ? BUMPER.HIGH : U.rangeInt(0, 2) === 0 ? BUMPER.LOW : BUMPER.ONE_TIME;
    if (b.ini) type = BUMPER.SAME;
    b.type = type;
    // bounciness by type: default 1.3 / SAME keeps the 1.0 left in the float register / low 0.5 / high 1.5 [asm 0x11fad94]
    b.bounce = [bo[0], 1, bo[0], bo[1], bo[2]][type];
  }

  // flat arrays for physics.js; the hooked / closest indices follow their objects
  rebuild() {
    const w = this.world, p = this.player;
    const hooked = p && p.hooked >= 0 ? w.targets[p.hooked] : null, closest = p && p.closest >= 0 ? w.targets[p.closest] : null;
    w.targets = []; w.bumpers = []; w.caps = []; w.polys = [];
    for (const s of this.spawned) {
      for (const t of s.targets) if (!t.gone) w.targets.push(t);
      for (const b of s.bumpers) if (!b.gone) w.bumpers.push(b);
      for (const c of s.caps) w.caps.push(c);
      for (const q of s.polys) w.polys.push(q);
    }
    if (p) {
      p.hooked = hooked ? w.targets.indexOf(hooked) : -1;
      p.closest = closest ? w.targets.indexOf(closest) : -1;
    }
  }

  // AdventurePatternSpawner.SpawnNextPatternIfNecessary, every frame after PlayerController.Update [asm 0x11f8f0c]
  spawnNext() {
    const max = this.cfg.maxPatterns, px = this.player.x;
    const last = this.spawned[this.spawned.length - 1];
    if (this.spawned.length <= max || last.ox - px < 100) this.load();
    if (this.spawned.length >= max && this.spawned[1].ox - px < -100) { this.spawned.shift(); this.rebuild(); }
  }

  // TargetAdventure.OnGrab [asm 0x11fdeb4]; the firewall starts on the first grab (Firewall.OnStartedPlaying)
  onGrab(t) {
    if (t.type === TARGET.TIMED && !t.once) t.expire = this.cfg.target.timer + 0.5; // TimedRoutine: destroy after
    t.isHooked = true; t.once = true;
    this.fire.moving = true;
  }

  // TargetAdventure.OnUngrab [asm 0x11fdfd0]: a one-time target dies once let go
  onUngrab(t) {
    t.isHooked = false;
    if (t.type === TARGET.ONE_TIME && t.active) { t.active = false; t.shrink = 0; this.events.push({ type: 'pop', x: t.x, y: t.y, t: this.time }); }
  }

  clampCam(x) {
    const halfW = this.aspect * this.cam.zoom, lo = (this.data.patterns[this.spawned[0].name].cam[0] ?? 0) + halfW;
    return Math.max(lo, x);
  }

  // One fixed step (0.02 s): physics, triggers (gravity zones, portals, the firewall), bumper hits, deaths.
  fixed(dt, hold) {
    if (this.dead) return;
    const p = this.player, w = this.world;
    const ev = p.step(dt, w, hold && !p.tele);
    this.time += dt;
    if (ev.bumper >= 0) {
      const b = w.bumpers[ev.bumper];
      b.anim = 0;
      // BumperAdventure.OnCollisionEnter2D: a one-time bumper shrinks away [asm 0x11fa810..0x11fa850]
      if (b.type === BUMPER.ONE_TIME && b.active) { b.active = false; b.shrink = 0; }
    }
    if (p.tele) return;
    const R = PHYS.radius;
    // GravityZone triggers: enter sets extraGravity, exit clears it [asm 0x129fe3c..0x129fe94, 0x12a0628..0x12a0678]
    for (const s of this.spawned) {
      const z = s.zone;
      if (!z) continue;
      const inside = circlePoly(p.x, p.y, R, z.pts);
      if (inside && !z.in) p.eg = [z.force[0], z.force[1]];
      if (!inside && z.in) p.eg = [0, 0];
      z.in = inside;
    }
    // Portal trigger -> HandlePortalCollision [asm 0x129ff2c]
    for (const s of this.spawned) {
      const o = s.portal;
      if (o && o.killed < 0.5 && circlePoly(p.x, p.y, R, o.pts)) { this.teleport(o); return; }
    }
    // the firewall's trigger box kills (TryKillPlayer) [asm 0x129fdcc]
    const [bx, by, bw, bh] = this.cfg.firewall.box, fx = this.fire.x;
    const qx = Math.max(fx + bx - bw / 2, Math.min(p.x, fx + bx + bw / 2)), qy = Math.max(by - bh / 2, Math.min(p.y, by + bh / 2));
    if (Math.hypot(p.x - qx, p.y - qy) < R) { this.die('fire'); return; }
    // camera edges (CameraLimitsBottom / Left, camera.js deathLimits), like every mode, while not hooked
    const d = deathLimits(this.aspect, R);
    if (p.hooked < 0 && (p.y < this.cam.y + d.bottom || p.x < this.cam.x + d.left)) this.die('fall');
  }

  // HandlePortalCollision [asm 0x129ff2c]: Random.Range(1, 3) patterns ahead, one of its spawn points, 1 unit left of it
  teleport(o) {
    const p = this.player, U = this.U;
    p.eg = [0, 0];
    const i = this.spawned.indexOf(o.inst);
    const dst = this.spawned[Math.min(i + U.rangeInt(1, 3), this.spawned.length - 1)];
    if (!dst.sp.length) return; // "Portal error"
    const [sx, sy] = dst.sp[U.rangeInt(0, dst.sp.length)];
    p.ungrab();
    p.alpha = 0.3; // SetAlpha(0.3) [asm 0x12a02b0]
    p.vx = 0; p.vy = 0;
    p.tele = { from: [p.x, p.y], to: [sx - 1, sy], t: 0, end: { x: sx - 1, y: sy, t: this.time } };
    this.events.push({ type: 'tele', x: sx - 1, y: sy, t: this.time });
  }

  die(why) {
    if (this.dead) return;
    this.player.ungrab();
    this.dead = { why, at: this.time };
  }

  // Per frame (Update): teleport routine, targets, bumpers, portals, the firewall, the spawner, distance, camera.
  update(dt) {
    const p = this.player, c = this.cfg;
    let changed = false;
    if (p.tele) {
      // TeleportRoutine (LINEAR): kinematic, no collider, no grab, at 20 units/s; then velocity (14.7, 2.9), alpha 1
      const T = p.tele, d = Math.hypot(T.to[0] - T.from[0], T.to[1] - T.from[1]) || 1e-3;
      if (T.t < 1) {
        const k = clamp01(T.t);
        p.x = T.from[0] + (T.to[0] - T.from[0]) * k; p.y = T.from[1] + (T.to[1] - T.from[1]) * k;
        T.t += (dt / d) * TELE_SPEED;
      } else {
        p.x = T.to[0]; p.y = T.to[1];
        p.vx = TELE_EXIT[0]; p.vy = TELE_EXIT[1];
        p.alpha = 1;
        p.tele = null;
      }
    }
    for (const s of this.spawned) {
      for (const t of s.targets) {
        if (t.gone) continue;
        if (t.type === TARGET.SPINNING) t.rot += 180 * dt; // Update: Rotate(0, 0, 180 * dt) [asm 0x11fc988]
        if (t.type === TARGET.TIMED && t.once && t.active) {
          // Update: the chrono runs once hooked, also after letting go [asm 0x11fc93c..0x11fc9ec]
          t.timer -= dt;
          if (t.timer <= 0) { t.active = false; t.shrink = 0; }
        }
        if (t.expire !== undefined && (t.expire -= dt) <= 0 && !t.gone) { t.gone = true; changed = true; }
        if (t.shrink >= 0 && (t.shrink += dt) >= SHRINK && !t.gone) { t.gone = true; changed = true; }
        if (t.mv) {
          // MovingRoutine [asm 0x11fe2ac]: position = lerp(from, to, ease(timer)), timer += dt * speed / distance; at 1 the
          // leg flips (start -> end, then end -> start)
          const m = t.mv, a = m.leg ? m.b : m.a, b = m.leg ? m.a : m.b;
          const k = clamp01(EASE[c.target.easing](m.t));
          t.x = a[0] + (b[0] - a[0]) * k; t.y = a[1] + (b[1] - a[1]) * k;
          m.t += (dt * c.target.speed) / c.target.distance;
          if (m.t >= 1) { m.t = 0; m.leg ^= 1; }
        }
      }
      for (const b of s.bumpers) {
        if (b.anim >= 0) { b.anim += dt; if (b.anim > 0.1667) b.anim = -1; }
        if (b.shrink >= 0 && (b.shrink += dt) >= SHRINK && !b.gone) { b.gone = true; changed = true; }
      }
      // Portal.Update: the player past it closes it [asm 0x12a1b50..0x12a1b58]
      const o = s.portal;
      if (o) { if (o.killed < 0 && p.x > o.x) o.killed = 0; else if (o.killed >= 0) o.killed += dt; }
    }
    if (changed) {
      // PlayerHookController.Update: hooked to a destroyed target -> UnGrab [asm 0x120adb8..0x120ae30]
      if (p.hooked >= 0 && this.world.targets[p.hooked].gone) p.ungrab();
      this.rebuild();
    }
    this.updateFire(dt);
    if (!this.dead) this.spawnNext();
    // GetDistance: lastDistance = floor(max(lastDistance, x - StartingX)) [asm 0x129fa54]
    this.distance = Math.max(this.distance, Math.floor(p.x - this.startX));
    this.updateCamera(dt);
  }

  // Firewall.Update, mode ACCELERATE_OVER_TIME [asm 0x11fb98c]: after startDelay s from the first grab; never more than
  // maxDistance behind the player; speed += speedGainPerSecond * dt * skill (no cap: maxSpeed is unused in this mode)
  updateFire(dt) {
    const f = this.fire, c = this.cfg.firewall;
    if (!f.moving || this.dead) return;
    f.timer += dt;
    if (f.timer < c.delay) return;
    const dx = this.player.x - f.x;
    if (c.mode === 1) {
      f.speed = c.minSpeed + f.skill * (c.maxSpeed - c.minSpeed) * clamp01((dx - c.minDist) / (c.maxDist - c.minDist));
    } else {
      if (dx > c.maxDist) f.x = this.player.x - c.maxDist;
      f.speed = F(f.speed + F(F(c.gain * dt) * f.skill));
    }
    f.x += f.speed * dt;
  }

  // [ĐỀ XUẤT] camera: main.js's follow with lead, y fixed at 0, no right bound (the run never ends)
  updateCamera(dt) {
    const p = this.player;
    if (this.time <= 0) return;
    const lead = Math.max(-1.2, Math.min(1.2, p.vx * 0.2));
    const want = this.clampCam(p.x + lead);
    this.cam.x += (want - this.cam.x) * Math.min(1, dt * 6);
  }
}
