// AgentLifeSystem: status timers, poison, heal over time, damage, heal, death, respawn (spec Part 5).
import { f, Vec2, SMath } from '../Core/Vec2.js';
import { next, nextInt } from '../Core/SimRng.js';
import { GamePhase, GoalType, PowerType, StatusFlags, TeamConfig } from '../Data/Enums.js';
import { SimEventType } from '../State/SimEvent.js';
import { has, isDead, hpRatio, hasPower, power } from '../State/MatchState.js';
import {
  SimConst, isSameTeam, onAgentDied, bossHealDivisor, bossDifficulty, bossDmgCoef, playerBossDmgCoef,
} from './GameRules.js';
import { spawnDropBullet } from './BulletSystem.js';
import { resetBotState } from '../Bot/BotBrain.js';

const F01 = f(0.1), F025 = 0.25, F07 = f(0.7), F13 = f(1.3);
const RESPAWN_TIMER = f(SimConst.RespawnDuration + SimConst.DeathAnimDuration);
const HP_EPS = 1 / 65536;

export function update(c, a) {
  const dt = c.dt;
  tickStatusTimer(a, 'invincibilityTimer', StatusFlags.Invincibility, dt);
  tickStatusTimer(a, 'freezeTimer', StatusFlags.Freeze, dt);
  tickStatusTimer(a, 'angryTimer', StatusFlags.Angry, dt);
  tickStatusTimer(a, 'invisibilityTimer', StatusFlags.Invisibility, dt);
  tickStatusTimer(a, 'slowDownTimer', StatusFlags.SlowDown, dt);
  tickStatusTimer(a, 'poisonTimer', StatusFlags.Poison, dt);
  tickStatusTimer(a, 'specialTimer', StatusFlags.Special, dt);

  if (has(a, StatusFlags.Poison) && a.poisonDamagePerTick > 0) {
    a.poisonTickTimer = f(a.poisonTickTimer - dt);
    if (a.poisonTickTimer <= 0) {
      applyDamage(c, a, a.poisonSource, a.poisonDamagePerTick, Vec2.zero(), false, 0, true);
      a.poisonTickTimer = a.poisonTickRate;
    }
  }

  if (a.zoneHitTimer > 0) a.zoneHitTimer = f(a.zoneHitTimer - dt);
  if (!has(a, StatusFlags.Special)) a.flags &= ~StatusFlags.MeleeMode;

  if (has(a, StatusFlags.RespawnWait)) {
    if (a.isBoss) return;
    if (c.s.goal === GoalType.LastSurvivor && a.deathCount >= SimConst.DeathMax) return;
    a.respawnTimer = f(a.respawnTimer - dt);
    if (a.respawnTimer <= 0) respawn(c, a);
  } else if (!isDead(a)) {
    const onTime = power(a, PowerType.HealOnTime), onLow = power(a, PowerType.HealOnLowLife);
    const rate = onLow > 0 && hpRatio(a) < SimConst.LowLife ? onLow : onTime;
    if (rate > 0) applyHeal(c, a, f(dt * f(a.hpMax * rate)), false);
  }
}

// C# passes the timer by ref; here by field name
function tickStatusTimer(a, key, flag, dt) {
  if (a[key] <= 0) return;
  a[key] = f(a[key] - dt);
  if (a[key] > 0) return;
  a[key] = 0;
  a.flags &= ~flag;
}

export function addTimedFlag(a, flag, duration, key) {
  a.flags |= flag;
  if (a[key] < duration) a[key] = duration;
}

export const levelCoef = (a) => (a == null ? 1 : a.levelCoef);

/** AgentLifeSystem.ApplyDamage; returns the damage dealt. */
export function applyDamage(c, target, sourceId, baseAmount, hitPos, isComeBack, distance, isSpecial) {
  const s = c.s;
  if (s.phase === GamePhase.GameOver) return 0;
  if (target == null || isDead(target)) return 0;
  if (has(target, StatusFlags.Invincibility)) {
    if (has(target, StatusFlags.Special)) c.emit(SimEventType.AgentHitBlocked, { agent: target.id });
    return 0;
  }
  const src = c.agent(sourceId);
  let total = 0;
  if (baseAmount > 0) {
    total = computeDamageAmount(c, src, target, baseAmount, isComeBack, distance);
    target.hpCurrent = f(target.hpCurrent - total);
  }
  const dealt = total > 0;
  const now = c.elapsed;
  if (dealt && src != null) {
    src.lastAttackSucceed = true;
    if (src.bot != null) src.bot.timeSinceLastDamageDealt = now;
  }
  c.emit(SimEventType.AgentTookDamage, { agent: target.id, other: sourceId, value: total, pos: hitPos });
  if (dealt && src != null) {
    if (!isSameTeam(s, src, target) && target.bot != null
        && (src.flags & (StatusFlags.Dead | StatusFlags.Invincibility | StatusFlags.Invisibility)) === 0) {
      const bot = target.bot;
      if (bot.target < 0) {
        bot.target = src.id; bot.lastTargetScore = -0.25; bot.timeSinceLastTarget = now; bot.timeSinceLastDamageDealt = now;
      } else if (bot.target !== src.id) {
        bot.lastTargetScore = -0.25; bot.timeSinceLastTarget = 0;
      }
    }
    const hoa = power(src, PowerType.HealOnAttack);
    if (hoa > 0) applyHeal(c, src, f(hoa * total), false);
    if (has(src, StatusFlags.NextAttackLeach)) {
      src.flags &= ~StatusFlags.NextAttackLeach;
      applyHeal(c, src, f(F025 * total), true);
    }
  }
  if (target.hpCurrent < HP_EPS) {
    target.hpCurrent = 0;
    processDeath(c, target, sourceId, isSpecial);
  }
  return total;
}

export function computeDamageAmount(c, src, target, baseAmount, isComeBack, distance) {
  const s = c.s;
  if (src == null) return baseAmount;
  const lc = src.levelCoef;
  let boost = power(src, PowerType.DamageBoost);
  const r = hpRatio(src);
  let v;
  v = power(src, PowerType.DamageBoostOnLowLife); if (v > 0 && r < SimConst.LowLife) boost = f(boost + v);
  v = power(src, PowerType.DamageBoostOnHighLife); if (v > 0 && r > SimConst.HighLife) boost = f(boost + v);
  v = power(src, PowerType.DamageBoostOnLessLife); if (v > 0 && target.hpCurrent > src.hpCurrent) boost = f(boost + v);
  v = power(src, PowerType.DamageBoostOnKillCount); if (v > 0) boost = f(boost + f(v * src.killCount));
  if (target.hpMax > 0) {
    v = power(src, PowerType.DamageBoostOnLowLifeOpponent);
    if (v > 0 && f(target.hpCurrent / target.hpMax) < SimConst.LowLife) boost = f(boost + v);
  }
  if (isComeBack) boost = f(boost + Math.max(power(src, PowerType.DamageBoostOnBulletComeBack), 0));
  if (distance > 0) {
    v = power(src, PowerType.DamageBoostOnBulletDistance);
    if (v > 0) boost = f(boost + f(SMath.clamp(f(distance / 10), 0, 1) * v));
  }
  const bossMode = s.goal === GoalType.KillBoss && s.teams === TeamConfig.OneVersusThree;
  if (bossMode && boost > 0) boost = f(boost / bossHealDivisor(bossDifficulty(s)));

  let coef = f(f(boost + 1) * lc);
  v = power(src, PowerType.CriticalAttack);
  if (v > 0 && next(s.rng, 0, 1) < v) coef = f(coef * 2);
  v = power(src, PowerType.InstantKill);
  if (v > 0 && next(s.rng, 0, 1) < v && !target.isBoss) coef = f(coef * 1000);
  const shield = power(target, PowerType.Shield);
  if (shield > 0) coef = f(coef * SMath.clamp(f(1 - shield), F01, 1));

  const diff = f(s.botDifficultyInt / 100);
  if (!s.isOffline) {
    if (bossMode && src.isBoss) coef = f(coef * (src.isBot ? bossDmgCoef(diff) : playerBossDmgCoef(1)));
  } else if (bossMode) {
    if (src.isBoss) coef = f(coef * (src.isBot ? bossDmgCoef(diff) : playerBossDmgCoef(diff)));
  } else {
    let k;
    if (!src.isBot) k = SMath.lerp(F13, 1, diff);
    else if (humanOnTeamOf(c, src)) k = SMath.lerp(F13, F07, diff);
    else k = SMath.lerp(F07, F13, diff);
    coef = f(coef * k);
  }
  return f(coef * baseAmount);
}

function humanOnTeamOf(c, src) {
  for (const a of c.s.agents)
    if (!a.isBot && !a.isDummy && isSameTeam(c.s, src, a)) return true;
  return false;
}

export function applyHeal(c, target, amount, fireEvent) {
  if (target == null || isDead(target)) return;
  if (target.isBoss) {
    const div = bossHealDivisor(bossDifficulty(c.s));
    amount = div !== 0 ? f(amount / div) : 0;
  }
  if (target.hpCurrent < target.hpMax) {
    target.hpCurrent = Math.min(f(target.hpCurrent + amount), target.hpMax);
    if (fireEvent) c.emit(SimEventType.AgentTookDamage, { agent: target.id, other: -1, value: -amount });
  }
}

function processDeath(c, target, sourceId, isSpecial) {
  if (isDead(target)) return;
  const s = c.s;
  target.flags |= StatusFlags.Dead;
  target.lastKiller = sourceId;
  target.deathCount++;
  const src = c.agent(sourceId);
  if (src != null && src !== target) {
    src.killCount++;
    let v = power(src, PowerType.HealOnKill);
    if (v > 0) applyHeal(c, src, f(src.hpMax * v), true);
    if (hasPower(src, PowerType.CooldownResetOnKill)) { src.cooldownAction = 0; src.cooldownSpecial = 0; }
    v = power(src, PowerType.LifeBoostOnKillCount);
    if (v > 0 && src.hpBase > 0) {
      const add = f(src.hpBase * v);
      src.hpMax = f(src.hpMax + add);
      applyHeal(c, src, add, false);
    }
  }
  if (hasPower(target, PowerType.CooldownResetOnDeath)) { target.cooldownAction = 0; target.cooldownSpecial = 0; }
  const drop = power(target, PowerType.DropOnDeath);
  if (drop > 0 && target.actionRef >= 0) {
    const dx = next(s.rng, -2, 2), dy = next(s.rng, 1, 3), angle = next(s.rng, 0, 360);
    spawnDropBullet(c, target, target.actionRef, Vec2.add(target.pos, { x: dx, y: dy }), angle, drop);
  }
  c.emit(SimEventType.AgentDied, { agent: target.id, other: sourceId, i: target.deathCount, flag: isSpecial });
  onAgentDied(c, sourceId, target);
  if (!target.isDummy) {
    target.flags |= StatusFlags.RespawnWait;
    target.respawnTimer = RESPAWN_TIMER;
  }
}

function respawn(c, a) {
  const s = c.s;
  a.hpCurrent = a.hpMax;
  a.angryTimer = a.freezeTimer = a.invisibilityTimer = a.slowDownTimer = a.poisonTimer = a.specialTimer = a.zoneHitTimer = 0;
  a.poisonTickTimer = a.poisonTickRate = a.poisonDamagePerTick = 0;
  a.poisonSource = -1;
  a.flags &= 0xFFFFF202 | 0;
  addTimedFlag(a, StatusFlags.Invincibility, SimConst.SpawnInvincibility, 'invincibilityTimer');

  a.lastAttackSucceed = false;
  a.cooldownAction = 0;
  a.isBusy = a.isActioning = false;
  a.actionEventIndex = 0;
  a.actionTimer = 0;
  a.meleeWindowOpen = false;
  a.currentIsSpecial = false;
  for (let i = 0; i < 4; i++) a.meleeHit[i] = -1;

  a.action = a.actionHeld = a.special = a.specialHeld = a.jump = false;
  a.directionX = 0;
  a.velocity = Vec2.zero();
  a.isDashing = a.dashIgnoreGravity = a.dashBackwards = false;
  a.dashTimer = 0;
  a.dashDirection = Vec2.zero();
  a.isPushback = false;
  a.pushbackTimer = a.pushbackValue = 0;
  a.isJumping = a.isFalling = false;

  if (a.bot != null) resetBotState(a.bot);

  const map = c.map;
  let arr;
  let random = false;
  switch (s.teams) {
    case TeamConfig.OneVersusThree: arr = s.bossOnLeft ? map.spawnTeam1v3 : map.spawnTeam3v1; break;
    case TeamConfig.TwoVersusTwo: arr = map.spawnTeam2v2; break;
    default: arr = map.ffaRespawns != null && map.ffaRespawns.length > 0 ? map.ffaRespawns : map.ffaSpawns; random = true; break;
  }
  if (arr != null && arr.length > 0) {
    if (random) a.pos = Vec2.copy(arr[nextInt(s.rng, 0, arr.length)]);
    else if (a.slot >= 0) a.pos = Vec2.copy(arr[a.slot % arr.length]);
  }
  a.facingLeft = a.pos.x > 0;
  c.emit(SimEventType.AgentRespawned, { agent: a.id, pos: a.pos });
}

export const LifeSystem = Object.freeze({ update, addTimedFlag, levelCoef, applyDamage, computeDamageAmount, applyHeal });
