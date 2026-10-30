// BulletSystem: projectiles, zones, boomerangs, explosions (spec Part 4).
import { f, Vec2, SMath, DEG2RAD } from '../Core/Vec2.js';
import { sinf, cosf } from '../Core/CrtMath.js';
import { next } from '../Core/SimRng.js';
import { DestroyType, GamePhase, PowerType, StatusFlags, Trajectory } from '../Data/Enums.js';
import { SimEventType } from '../State/SimEvent.js';
import { createBulletState, has, isDead, hasPower, power } from '../State/MatchState.js';
import { SimConst, isSameTeam, agentCenter, agentHitRadius } from './GameRules.js';
import { linecast, MASK_NO_WALL } from './Physics2D.js';
import { applyDamage, applyHeal, levelCoef } from './LifeSystem.js';

const LOB_GRAVITY = 25;
const DEFAULT_HIT_RADIUS = f(0.45);
const CATCH_DISTANCE = f(1.2);
const WALL_PULL_BACK = f(0.05);
const SNAP_NORMAL_Y = f(0.7);
const SCALE_DISTANCE_FULL = 10;
const DEFAULT_POISON_DURATION = 2, DEFAULT_POISON_TICK = 0.5, DEFAULT_SLOW_DURATION = 0.5;
const ZONE_JITTER = f(0.2);
const F08 = f(0.8), F12 = f(1.2), EPS6 = f(1e-6);

function sourceIsDead(c, b) {
  const s = c.agent(b.source);
  return s == null || isDead(s);
}

const shootOffset = (c, a) => c.skinOf(a).shootOffset;

export function spawnBullet(c, src, action, ev, isSpecial, extraBullets) {
  if (action == null || action.bullet < 0) return;
  const data = c.db.bullets[action.bullet];
  const left = src.facingLeft;
  const baseDir = left ? Vec2.rotate(Vec2.left(), -ev.angleOffset) : Vec2.rotate(Vec2.right(), ev.angleOffset);
  let spawn;
  if (!data.stayOnAgent) {
    let so = shootOffset(c, src);
    let offY = ev.offsetY;
    if (src.isBoss) { so = Vec2.scale(so, SimConst.BossScale); offY = f(offY * SimConst.BossScale); }
    spawn = Vec2.add(src.pos, { x: left ? -so.x : so.x, y: f(so.y + offY) });
    const center = agentCenter(c.db, src);
    const hit = linecast(c.map, center, spawn, MASK_NO_WALL);
    if (hit.hit) spawn = Vec2.sub(hit.point, Vec2.scale(baseDir, WALL_PULL_BACK));
  } else spawn = Vec2.add(src.pos, { x: 0, y: 1 });

  const pierce = hasPower(src, PowerType.BulletPierce);
  let powerRebound = 0;
  if (hasPower(src, PowerType.BulletRebound)) {
    const v = power(src, PowerType.BulletRebound);
    powerRebound = v <= 0 ? 2 : Math.floor(v);
  }
  const speedBoost = power(src, PowerType.BulletSpeedBoost);
  const lifeBoost = isSpecial ? 0 : power(src, PowerType.BulletLifeTimeBoost);
  let scaleDist = isSpecial ? 0 : power(src, PowerType.BulletScaleOnDistance);
  if (scaleDist <= 0) scaleDist = 0;
  let dmgMult = 1;
  if (src.lastAttackSucceed) {
    const v = power(src, PowerType.DamageBoostOnAttackSucceed);
    dmgMult = v <= 0 ? 1 : f(1 + v);
    src.lastAttackSucceed = false;
  }
  const n = Math.max(1, data.number) + extraBullets;
  const spread = data.angleSpread;
  const step = n > 1 ? f(spread / (n - 1)) : 0;
  const start = f(-spread / 2);
  const sign = left ? -1 : 1;
  for (let i = 0; i < n; i++) {
    let ang = f(start + f(i * step));
    if (data.randomizeSpread > 0) ang = f(ang + next(c.s.rng, -data.randomizeSpread, data.randomizeSpread));
    const dir = Vec2.rotate(baseDir, f(ang * sign));
    const speedCoef = data.randomizeSpread > 0 ? next(c.s.rng, F08, F12) : 0;
    spawnOne(c, src, data, action.damage, action.pushBackDuration, action.pushBackEffect, dir, spawn, speedCoef,
      pierce, powerRebound, speedBoost, scaleDist, dmgMult, lifeBoost, 0, isSpecial);
  }
}

function spawnOne(c, src, data, damage, pushDur, pushEff, dir, pos, speedCoef, pierce, powerRebound, speedAdd,
  scaleOnDistance, dmgMult, lifeBoost, lifeOverride, isSpecial) {
  let speed = data.speed;
  if (speedCoef > 0) speed = f(speed * speedCoef);
  if (speedAdd > 0) speed = f(speed * f(1 + speedAdd));
  let life = lifeOverride > 0 ? lifeOverride : data.lifeTime;
  if (lifeOverride <= 0 && lifeBoost > 0) life = f(life * f(1 + lifeBoost));
  const b = createBulletState();
  b.id = c.s.nextBulletId++;
  b.data = data.index;
  b.source = src.id;
  b.pos = Vec2.copy(pos);
  b.direction = Vec2.copy(dir);
  b.velocity = data.trajectory === Trajectory.Lob ? Vec2.scale(dir, speed) : Vec2.zero();
  b.lifeTimer = life;
  b.speed = speed;
  b.damageAmount = dmgMult > 1 ? f(damage * dmgMult) : damage;
  b.pushBackDuration = pushDur;
  b.pushBackEffect = pushEff;
  b.scaleOnDistance = scaleOnDistance;
  b.forcePierce = pierce;
  b.powerRebound = powerRebound;
  b.fromBoss = src.isBoss;
  b.isSpecial = isSpecial;
  c.s.bullets.push(b);
  c.emit(SimEventType.BulletSpawned, { agent: src.id, i: data.index, pos, bullet: b.id, flag: isSpecial });
  return b;
}

/** DropOnDeath power: one copy of the owner's normal bullet, no powers, lifetime = power value. */
export function spawnDropBullet(c, src, actionIdx, pos, angle, lifetime) {
  const act = c.act(actionIdx);
  if (act == null || act.bullet < 0) return;
  const data = c.db.bullets[act.bullet];
  const r = f(angle * DEG2RAD);
  const dir = { x: cosf(r), y: sinf(r) };
  spawnOne(c, src, data, act.damage, 0, 0, dir, pos, 0, false, 0, 0, 0, 1, 0, lifetime, false);
}

function spawnZone(c, origin, zoneIdx, pos, normal) {
  if (zoneIdx < 0) return;
  const zone = c.db.bullets[zoneIdx];
  const count = zone.zoneCount;
  if (count < 2) { spawnOneZone(c, origin, zone, pos, Vec2.zero()); return; }
  let axis;
  if (Vec2.sqrMagnitude(normal) < EPS6) { axis = Vec2.right(); normal = Vec2.up(); }
  else axis = { x: normal.y, y: -normal.x };
  const spread = f(zone.zoneSpread * (origin.fromBoss ? SimConst.BossScale : 1));
  const step = f(spread / (count - 1));
  const jitter = zone.zoneRandomizeSpread ? ZONE_JITTER : 0;
  for (let i = 0; i < count; i++) {
    let off = f(f(i * step) - f(spread / 2));
    if (jitter > 0) off = f(off + next(c.s.rng, -jitter, jitter));
    spawnOneZone(c, origin, zone, Vec2.add(pos, Vec2.scale(axis, off)), normal);
  }
}

function spawnOneZone(c, origin, zone, pos, dir) {
  let speed = zone.speed;
  if (zone.zoneRandomizeSpread) speed = f(speed * next(c.s.rng, F08, F12));
  const b = createBulletState();
  b.id = c.s.nextBulletId++;
  b.data = zone.index;
  b.source = origin.source;
  b.pos = Vec2.copy(pos);
  b.direction = Vec2.copy(dir);
  b.velocity = zone.trajectory === Trajectory.Lob ? Vec2.scale(dir, speed) : Vec2.zero();
  b.speed = speed;
  b.lifeTimer = zone.lifeTime;
  b.damageAmount = origin.damageAmount;
  b.fromBoss = origin.fromBoss;
  b.isSpecial = origin.isSpecial;
  c.s.bullets.push(b);
  c.emit(SimEventType.BulletSpawned, { agent: b.source, i: zone.index, pos, bullet: b.id, flag: b.isSpecial });
}

export function update(c) {
  const s = c.s;
  if (s.phase !== GamePhase.Playing && s.phase !== GamePhase.GameOver) return;
  const dt = c.dt;
  const count = s.bullets.length;
  for (let i = 0; i < count; i++) {
    const b = s.bullets[i];
    if (!b.alive) continue;
    const data = c.db.bullets[b.data];
    if (!data.stayOnAgent) {
      if (!b.snapped) {
        const prev = b.pos;
        if (b.isReturning) {
          if (sourceIsDead(c, b)) { destroyBullet(c, b, b.pos, false, Vec2.zero()); continue; }
          updateReturnDirection(c, b);
        }
        if (data.trajectory === Trajectory.Lob) {
          const g = data.gravityScale > 0 ? data.gravityScale : 1;
          b.velocity.y = f(b.velocity.y + f(dt * f(-LOB_GRAVITY * g)));
          b.pos = Vec2.add(b.pos, Vec2.scale(b.velocity, dt));
        } else {
          const sp = b.speed > 0 ? b.speed : data.speed;
          b.pos = Vec2.add(b.pos, Vec2.scale(b.direction, f(sp * dt)));
        }
        b.distanceTraveled = f(b.distanceTraveled + Vec2.distance(b.pos, prev));
        if (checkAgentHits(c, b, data)) continue;
        if (checkObstacleHit(c, b, data, prev)) continue;
      }
    } else {
      if (sourceIsDead(c, b)) { destroyBullet(c, b, b.pos, false, Vec2.zero()); continue; }
      b.pos = Vec2.add(c.agent(b.source).pos, { x: 0, y: 1 });
    }
    if (data.tickRate > 0 && data.tickRadius > 0) {
      b.tickTimer = f(b.tickTimer - dt);
      if (b.tickTimer <= 0) {
        b.tickTimer = data.tickRate;
        const offY = f(data.tickRadiusOffsetY * (b.fromBoss ? SimConst.BossScale : 1));
        applyTickZone(c, b, data, Vec2.add(b.pos, { x: 0, y: offY }));
      }
    }
    if (data.lifeTime > 0) {
      b.lifeTimer = f(b.lifeTimer - dt);
      if (b.lifeTimer <= 0 && !b.isReturning) {
        if (data.comeBack && !sourceIsDead(c, b)) startReturn(b);
        else destroyBullet(c, b, b.pos, false, Vec2.zero());
      }
    }
  }
  let w = 0;
  for (let i = 0; i < s.bullets.length; i++) if (s.bullets[i].alive) s.bullets[w++] = s.bullets[i];
  s.bullets.length = w;
}

function updateReturnDirection(c, b) {
  const src = c.agent(b.source);
  const oy = f(shootOffset(c, src).y * (src.isBoss ? SimConst.BossScale : 1));
  const v = Vec2.sub(Vec2.add(src.pos, { x: 0, y: oy }), b.pos);
  if (Vec2.sqrMagnitude(v) > 0) b.direction = Vec2.normalized(v);
}

function startReturn(b) {
  b.isReturning = true;
  for (let i = 0; i < 4; i++) b.hitAgent[i] = -1;
}

function hitRadius(b, data) {
  let r = data.hitRadius;
  if (r <= 0) r = DEFAULT_HIT_RADIUS;
  if (b.fromBoss) r = f(r * SimConst.BossScale);
  let sod = b.scaleOnDistance;
  if (sod <= 0) sod = data.scaleOnDistance;
  if (sod > 0) r = f(r * SMath.lerp(1, sod, SMath.clamp01(f(b.distanceTraveled / SCALE_DISTANCE_FULL))));
  return r;
}

function hasBeenHit(b, id) {
  for (let i = 0; i < 4; i++) if (b.hitAgent[i] === id) return true;
  return false;
}

function addHit(b, id) {
  for (let i = 0; i < 4; i++) if (b.hitAgent[i] < 0) { b.hitAgent[i] = id; return; }
  b.hitAgent[3] = id;
}

function checkAgentHits(c, b, data) {
  if (data.destroyType === DestroyType.Lifetime) return false;
  const r = hitRadius(b, data);
  if (b.forcePierce || data.destroyType === DestroyType.OnHitObstacleOnly) {
    for (let i = 0; i < 4; i++) {
      const ag = c.agent(b.hitAgent[i]);
      if (ag == null) continue;
      if (Vec2.distance(b.pos, agentCenter(c.db, ag)) > f(agentHitRadius(c.db, ag) + r)) b.hitAgent[i] = -1;
    }
  }
  const src = c.agent(b.source);
  for (const t of c.s.agents) {
    if (isDead(t)) continue;
    const center = agentCenter(c.db, t);
    if (b.isReturning && t.id === b.source) {
      if (Vec2.distance(b.pos, center) <= CATCH_DISTANCE) { destroyBullet(c, b, b.pos, false, Vec2.zero()); return true; }
      continue;
    }
    if (t.id === b.source) continue;
    if (isSameTeam(c.s, src, t)) continue;
    if (hasBeenHit(b, t.id)) continue;
    if (Vec2.distance(b.pos, center) > f(agentHitRadius(c.db, t) + r)) continue;
    if (data.explosionRadius <= 0)
      applyDamage(c, t, b.source, b.damageAmount, t.pos, b.isReturning, b.distanceTraveled, b.isSpecial);
    if (data.onHitApplyPoison) applyPoison(t, b, data);
    applyPushbackWithPower(c, t, b, b.pos, false);
    if (!data.comeBack && !b.forcePierce && (data.destroyType === DestroyType.OnHit || data.destroyType === DestroyType.OnHitPlayerOnly)) {
      destroyBullet(c, b, b.pos, false, Vec2.zero());
      return true;
    }
    addHit(b, t.id);
  }
  return false;
}

function applyPoison(t, b, data) {
  if (has(t, StatusFlags.Invincibility)) return;
  const dur = data.onHitPoisonDuration > 0 ? data.onHitPoisonDuration : DEFAULT_POISON_DURATION;
  t.flags |= StatusFlags.Poison;
  t.poisonTimer = Math.max(t.poisonTimer, dur);
  t.poisonSource = b.source;
  t.poisonDamagePerTick = b.damageAmount;
  t.poisonTickRate = data.tickRate > 0 ? data.tickRate : DEFAULT_POISON_TICK;
  t.poisonTickTimer = 0;
}

function checkObstacleHit(c, b, data, from) {
  if (data.destroyType === DestroyType.OnHitPlayerOnly) return false;
  const to = b.pos;
  const d = Vec2.sub(to, from);
  if (Vec2.sqrMagnitude(d) <= 0) return false;
  const r = hitRadius(b, data);
  const rayEnd = Vec2.add(to, Vec2.scale(Vec2.normalized(d), r));
  const hit = linecast(c.map, from, rayEnd, MASK_NO_WALL);
  if (!hit.hit) return false;
  if (data.snapOnGround && hit.normal.y > SNAP_NORMAL_Y) {
    if (data.zone < 0) {
      b.snapped = true;
      b.velocity = Vec2.zero();
      b.pos = Vec2.copy(hit.point);
      return false;
    }
    b.pos = Vec2.copy(hit.point);
    spawnZone(c, b, data.zone, hit.point, hit.normal);
    destroyBullet(c, b, hit.point, true, Vec2.zero());
    return true;
  }
  if (data.destroyType === DestroyType.Lifetime) {
    const bo = data.bounciness > 0 ? data.bounciness : 1;
    b.velocity = Vec2.scale(Vec2.reflect(b.velocity, hit.normal), bo);
    b.direction = Vec2.reflect(b.direction, hit.normal);
    b.pos = Vec2.copy(from);
    c.emit(SimEventType.BulletRebounded, { agent: b.source, pos: from, bullet: b.id });
    return false;
  }
  if (data.comeBack && !b.isReturning) {
    startReturn(b);
    b.pos = Vec2.copy(from);
    return false;
  }
  if (b.powerRebound + data.rebound <= b.reboundCount) {
    destroyBullet(c, b, hit.point, false, hit.normal);
    return true;
  }
  b.reboundCount++;
  b.direction = Vec2.reflect(b.direction, hit.normal);
  b.velocity = Vec2.reflect(b.velocity, hit.normal);
  b.pos = Vec2.copy(from);
  c.emit(SimEventType.BulletRebounded, { agent: b.source, pos: from, bullet: b.id });
  return false;
}

function destroyBullet(c, b, pos, skipZone, normal) {
  if (!b.alive) return;
  const data = c.db.bullets[b.data];
  if (data.explosionRadius > 0) applyExplosionDamage(c, b, data, pos);
  if (!skipZone && data.zone >= 0) spawnZone(c, b, data.zone, pos, normal);
  if (data.stayOnAgent) {
    const src = c.agent(b.source);
    if (src != null) { src.flags &= ~StatusFlags.Special; src.specialTimer = 0; }
  }
  b.alive = false;
  c.emit(SimEventType.BulletDestroyed, { agent: b.source, i: b.data, pos, bullet: b.id, flag: b.fromBoss });
}

const isEnemy = (c, a, b) => a !== b.id && !isSameTeam(c.s, c.agent(a), b);

function applyExplosionDamage(c, b, data, pos) {
  const R = f(data.explosionRadius * (b.fromBoss ? SimConst.BossScale : 1));
  for (const t of c.s.agents) {
    if (!isEnemy(c, b.source, t)) continue;
    if ((t.flags & (StatusFlags.Dead | StatusFlags.Invincibility)) !== 0) continue;
    if (Vec2.distance(pos, agentCenter(c.db, t)) > f(R + agentHitRadius(c.db, t))) continue;
    applyDamage(c, t, b.source, b.damageAmount, t.pos, false, 0, b.isSpecial);
    applyPushbackWithPower(c, t, b, pos, true);
    if (data.onHitApplyPoison) applyPoison(t, b, data);
  }
}

function applyPushbackWithPower(c, t, b, bulletPos, fromExplosion) {
  if (b.pushBackEffect <= 0) return;
  if (has(t, StatusFlags.Invincibility)) return;
  let dur = b.pushBackDuration;
  const src = c.agent(b.source);
  if (dur <= 0) {
    dur = src != null ? power(src, PowerType.PushBack) : 0;
    if (dur <= 0) return;
  }
  const refX = fromExplosion || src == null ? bulletPos.x : src.pos.x;
  const dir = refX < t.pos.x ? 1 : -1;
  t.isPushback = true;
  t.pushbackTimer = dur;
  t.pushbackValue = f(b.pushBackEffect * dir);
}

function applyTickZone(c, b, data, pos) {
  const R = f(data.tickRadius * (b.fromBoss ? SimConst.BossScale : 1));
  const src = c.agent(b.source);
  for (const t of c.s.agents) {
    if (isDead(t)) continue;
    if (Vec2.distance(pos, agentCenter(c.db, t)) > f(R + agentHitRadius(c.db, t))) continue;
    if (b.damageAmount < 0) {
      if (!isEnemy(c, b.source, t)) applyHeal(c, t, -f(levelCoef(src) * b.damageAmount), true);
    } else if (!data.tickApplySlow) {
      if (isEnemy(c, b.source, t) && t.zoneHitTimer <= 0) {
        applyDamage(c, t, b.source, b.damageAmount, t.pos, false, 0, b.isSpecial);
        t.zoneHitTimer = f(2 * c.dt);
      }
    } else if (isEnemy(c, b.source, t) && !has(t, StatusFlags.Invincibility)) {
      t.flags |= StatusFlags.SlowDown;
      t.slowDownTimer = Math.max(t.slowDownTimer, data.tickSlowDuration > 0 ? data.tickSlowDuration : DEFAULT_SLOW_DURATION);
    }
  }
}

export const BulletSystem = Object.freeze({ spawnBullet, spawnDropBullet, update });
