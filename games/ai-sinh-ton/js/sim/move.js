// How a unit covers ground (SCOPE section 5). think() in battle.js has already set u.vx/u.vz from the AI's wish; this
// module owns what the body does with it, per the hero form's `move` = { kind, ...params }:
//   walk     as is                         gallop  +15% speed, built up over a second of running (+ `bonus`)
//   hop      0.35 s hops; mid-hop the body is not blocked by others
//   leap     target 5-9 m away: jump there (0.45 s, in the air), land with damage `dmg` x atk in `r`, cooldown 6 s
//   roll     running more than 3 m: curl up, knock aside (`kb`, `dmg`) what is on the way, never blocked
//   slither  leaves a `trail` of small zones (slow / poison) every 0.5 s while moving
//   fly      u.air: never blocked by ground bodies, melee blows land at 80% (battle.js hurt); `blink` adds a hop-through
//   glide    as fly, low, +5% speed           swimAir as fly, steady speed with soft turns
//   blink    target out of reach: vanish and reappear next to it (or next to the weakest ally), cooldown 5 s
//   burrow   health down more than 15% in 1 s, or target farther than 6 m: dig in for 1.2 s (cannot be hit), come up
//            beside the target with damage `dmg` in `r`
//   stomp    immune to knockback; every step slows foes within `r`
// Flags the view reads: u.air, u.under, u.moveFx ('hop'|'leap'|'roll'|'blink'|'burrow'|'emerge'|'stomp'|null, set on the
// tick it happens). Events: { e: 'move', uid, k, x, z, tx, tz }. Pure and deterministic: any random choice uses B.rng.
const AIR = new Set(['fly', 'glide', 'swimAir']);
const HOP_T = 0.35;
const LEAP = { min: 5, max: 9, t: 0.45, cd: 6 };
const BLINK_CD = 5;
const BURROW = { t: 1.2, cd: 7, far: 6, drop: 0.15 };
const STEP_T = 0.5;
const TRAIL_MAX = 8;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// set up a hero's movement state when it enters the battle
export function moveEnter(B, u) {
  const m = (u.def && u.def.move) || { kind: 'walk' };
  u.mv = { ...m, cd: 1.5, runT: 0, stepT: 0, hopT: 0, rollD: 0, busy: null, hp: [], hpT: 0, trails: [] };
  u.air = AIR.has(m.kind);
  u.under = false; u.moveFx = null; u.ghost = false;
  if (m.kind === 'stomp') u.mods.kbRes = 1;
}

function emitMove(B, u, k, x, z, tx, tz) {
  u.moveFx = k;
  B.emit({ e: 'move', uid: u.uid, k, x, z, tx, tz });
}

// once per tick for every hero, before its AI: runs a leap or a burrow already under way. True while the body is busy.
export function moveTick(B, u, dt) {
  const mv = u.mv; if (!mv) return false;
  u.moveFx = null;
  if (mv.cd > 0) mv.cd -= dt;
  // health samples for the burrow's "hurt fast" trigger: the highest of the last second
  mv.hpT -= dt; if (mv.hpT <= 0) { mv.hpT = 0.25; mv.hp.push(u.hp); if (mv.hp.length > 4) mv.hp.shift(); }
  const b = mv.busy; if (!b) return false;
  b.t -= dt;
  if (b.k === 'leap') {
    const k = 1 - Math.max(0, b.t) / LEAP.t;
    u.x = b.x + (b.tx - b.x) * k; u.z = b.z + (b.tz - b.z) * k;
    if (b.t <= 0) { mv.busy = null; u.air = AIR.has(mv.kind); u.ghost = false; land(B, u, mv.dmg || 0, mv.r || 2, mv.status, mv.pool); }
    return true;
  }
  if (b.k === 'burrow') {
    const t = B.byUid.get(u.target);
    if (t && t.alive) { const a = Math.atan2(u.z - t.z, u.x - t.x); b.tx = t.x + Math.cos(a) * 1.4; b.tz = t.z + Math.sin(a) * 1.4; }
    const d = Math.hypot(b.tx - u.x, b.tz - u.z); const s = u.base.speed * 1.6 * dt;
    if (d > s) { u.x += ((b.tx - u.x) / d) * s; u.z += ((b.tz - u.z) / d) * s; } else { u.x = b.tx; u.z = b.tz; }
    if (b.t <= 0) {
      mv.busy = null; u.under = false; u.untargetable = false;
      emitMove(B, u, 'emerge', b.x, b.z, u.x, u.z);
      land(B, u, mv.dmg || 0, mv.r || 3, mv.status, null);
    }
    return true;
  }
  mv.busy = null;
  return false;
}

function land(B, u, dmg, r, status, pool) {
  const F = B.fn;
  if (dmg > 0) {
    B.emit({ e: 'fx', key: 'quake', part: 'burst', x: u.x, z: u.z, r, team: u.team, by: u.uid });
    F.withTag(B, 'fx', () => { for (const f of F.inRadius(B, 1 - u.team, u.x, u.z, r)) { F.hurt(B, u, f, F.atkOf(u) * dmg, { canCrit: true, melee: true }); F.addStatus(B, u, f, status, F.atkOf(u)); } });
  }
  if (pool) F.zone(B, u, { x: u.x, z: u.z, key: 'fire_pool', ...pool });
}

// the movement's own actions, when the AI has a target and is free to act: a leap, a blink or a dig. True if it acted.
export function moveAct(B, u, t) {
  const mv = u.mv; if (!mv || mv.busy || mv.cd > 0 || !t) return false;
  const d = dist(u, t); const reach = (u.attack ? u.attack.range : 2) + t.r;
  const kind = mv.kind;
  if (kind === 'leap' && d >= LEAP.min && d <= LEAP.max) {
    const a = Math.atan2(t.z - u.z, t.x - u.x); const stop = Math.max(1.2, Math.min(reach * 0.8, d - 1.2));
    const p = B.fn.clampR(t.x - Math.cos(a) * stop, t.z - Math.sin(a) * stop, 0.9);
    mv.busy = { k: 'leap', t: LEAP.t, x: u.x, z: u.z, tx: p.x, tz: p.z }; mv.cd = LEAP.cd;
    u.air = true; u.ghost = true; u.face = a; u.anim = 'run'; u.animT = 0;
    emitMove(B, u, 'leap', u.x, u.z, p.x, p.z);
    return true;
  }
  const blinkCd = kind === 'blink' ? BLINK_CD : mv.blink;
  // a blink to the weakest ally: when one is under 60% and more than 4 m away
  const weak = blinkCd && mv.to === 'weakAlly' ? B.fn.lowestAlly(B, u) : null;
  const toAlly = weak && weak !== u && weak.hp < weak.maxHp * 0.6 && dist(u, weak) > 4;
  // a ranged blinker steps out of a foe's face to the far side of its target
  const back = u.role === 'ranged' || u.role === 'healer';
  const crowded = blinkCd && back && !toAlly && d < 2.5;
  if (crowded) {
    const a = Math.atan2(u.z - t.z, u.x - t.x) + (B.rng() - 0.5);
    const p = B.fn.clampR(u.x + Math.cos(a) * 6, u.z + Math.sin(a) * 6, 0.85);
    const x0 = u.x; const z0 = u.z; u.x = p.x; u.z = p.z; u.face = Math.atan2(t.z - u.z, t.x - u.x); mv.cd = blinkCd;
    emitMove(B, u, 'blink', x0, z0, p.x, p.z);
    if (u.hooks && u.hooks.blinkCrit) u.sureCrit = true;
    return true;
  }
  if (blinkCd && (toAlly || (!mv.to && d > reach + 1.5))) {
    const to = toAlly ? weak : t;
    const a = to === t ? Math.atan2(u.z - t.z, u.x - t.x) : B.rng() * 6.283;
    const off = to === t ? Math.max(1.2, Math.min(reach * 0.8, 1.2 + (u.role === 'ranged' || u.role === 'healer' ? reach * 0.5 : 0))) : 1.4;
    const p = B.fn.clampR(to.x + Math.cos(a) * off, to.z + Math.sin(a) * off, 0.9);
    const x0 = u.x; const z0 = u.z;
    u.x = p.x; u.z = p.z; u.face = Math.atan2(t.z - u.z, t.x - u.x); mv.cd = blinkCd;
    emitMove(B, u, 'blink', x0, z0, p.x, p.z);
    if (u.hooks && u.hooks.blinkCrit) u.sureCrit = true;
    return true;
  }
  if (kind === 'burrow') {
    const top = mv.hp.length ? Math.max(...mv.hp) : u.hp;
    if (top - u.hp > BURROW.drop * u.maxHp || d > BURROW.far) {
      mv.busy = { k: 'burrow', t: BURROW.t, x: u.x, z: u.z, tx: t.x, tz: t.z }; mv.cd = BURROW.cd; mv.hp.length = 0;
      u.under = true; u.untargetable = true; u.anim = 'run'; u.animT = 0;
      emitMove(B, u, 'burrow', u.x, u.z, t.x, t.z);
      return true;
    }
  }
  return false;
}

// one tick of walking-type movement with u.vx/u.vz already set
export function moveUnit(B, u, dt) {
  const mv = u.mv;
  if (!mv) { u.x += u.vx * dt; u.z += u.vz * dt; return; }
  u.stillT = 0;
  let k = 1;
  const kind = mv.kind;
  // a stop of more than a few ticks starts the stride over
  if (B.t - (mv.lastRun || -1) > 0.15) mv.runT = 0;
  mv.lastRun = B.t; mv.runT += dt;
  if (kind === 'gallop') k = 1 + (0.15 + (mv.bonus || 0)) * Math.min(1, mv.runT);
  else if (kind === 'glide') k = 1.05;
  else if (kind === 'swimAir') k = 1 + (mv.bonus || 0);
  else if (kind === 'roll') k = mv.rolling ? 1.3 : 1;
  let vx = u.vx * k; let vz = u.vz * k;
  if (kind === 'swimAir') {
    // soft turns: the velocity leans toward the wish instead of snapping
    const a = Math.min(1, dt * 5); mv.svx = (mv.svx || 0) + (vx - (mv.svx || 0)) * a; mv.svz = (mv.svz || 0) + (vz - (mv.svz || 0)) * a; vx = mv.svx; vz = mv.svz;
  }
  if (kind === 'hop') {
    mv.hopT -= dt;
    if (mv.hopT <= 0) { mv.hopT += HOP_T; u.moveFx = 'hop'; }
    // the body leaves the ground in the middle of a hop
    u.ghost = mv.hopT > HOP_T * 0.2 && mv.hopT < HOP_T * 0.8;
  }
  u.x += vx * dt; u.z += vz * dt;
  const t = B.byUid.get(u.target);
  if (kind === 'roll') {
    const far = t && dist(u, t) > 3;
    if (far && !mv.rolling) { mv.rolling = true; u.ghost = true; emitMove(B, u, 'roll', u.x, u.z, t.x, t.z); }
    else if (!far && mv.rolling) { mv.rolling = false; u.ghost = false; }
    if (mv.rolling) bowl(B, u, mv, dt);
  }
  mv.stepT -= dt;
  if (mv.stepT <= 0) {
    mv.stepT += STEP_T;
    if (kind === 'stomp') stomp(B, u, mv);
    if ((kind === 'slither' || mv.trail) && mv.trail) trail(B, u, mv);
  }
}

// a rolling body throws aside what it runs into, each foe at most every 0.6 s
function bowl(B, u, mv, dt) {
  const F = B.fn; mv.hit = mv.hit || new Map();
  for (const f of F.inRadius(B, 1 - u.team, u.x, u.z, u.r + 0.6)) {
    if ((mv.hit.get(f.uid) || -1) > B.t) continue;
    mv.hit.set(f.uid, B.t + 0.6);
    F.withTag(B, 'fx', () => { if (mv.dmg) F.hurt(B, u, f, F.atkOf(u) * mv.dmg, { melee: true }); if (mv.status) F.addStatus(B, u, f, mv.status, F.atkOf(u)); });
    if (f.alive && !f.boss && !F.M(f, 'kbRes')) F.push(B, f, u.x, u.z, mv.kb || 1, u);
  }
  if (mv.hit.size > 64) for (const [k, v] of mv.hit) if (v < B.t) mv.hit.delete(k);
}

function stomp(B, u, mv) {
  const F = B.fn; u.moveFx = 'stomp';
  for (const f of F.inRadius(B, 1 - u.team, u.x, u.z, mv.r || 2)) F.addStatus(B, u, f, { k: 'slow', dur: 1, v: mv.slow || 0.3 }, 0);
}

function trail(B, u, mv) {
  const T = mv.trail;
  // only the newest few pieces of a trail live, so a long run never floods the zone list
  mv.trails = mv.trails.filter((z) => z.t > 0);
  if (mv.trails.length >= TRAIL_MAX) mv.trails.shift().t = 0;
  mv.trails.push(B.fn.zone(B, u, { x: u.x, z: u.z, r: T.r || 1.1, dur: T.dur || 2, every: T.every || 0.5, dmg: T.dmg || 0, status: T.status, key: 'web' }));
}
