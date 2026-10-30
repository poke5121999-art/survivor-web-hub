// FoodGangPlayerSystem: SpawnAgent, BuildPowers, ResolveStatsIndex, OnPlayerDisconnected.
import { f, Vec2, SMath } from '../Core/Vec2.js';
import { next } from '../Core/SimRng.js';
import { GoalType, PowerType, TeamConfig } from '../Data/Enums.js';
import { SimEventType } from '../State/SimEvent.js';
import { createAgentState, createBotState, hasPower, power } from '../State/MatchState.js';
import { SimConst, teamOfSlot, bossSlot, playerBossHpCoef, bossHpCoef } from './GameRules.js';

const F01 = f(0.1), F005 = f(0.05), F095 = f(0.95);

export function resolveSkin(c, skinId, slot) {
  const skins = c.db.skins;
  if (skinId > 0) {
    for (let i = 0; i < skins.length; i++) if (skins[i].skinId === skinId) return i;
    throw new Error('skin id ' + skinId + ' not in GameDb');
  }
  if (skinId === 0) {
    const seed = c.s.seed >>> 0;
    const v = ((Math.imul(seed, 0x19660D) + Math.imul(slot >>> 0, 0x3C6EF35F)) & 0x7FFFFFFF) >>> 0;
    return (v % (skins.length - 1)) + 1;
  }
  throw new Error('skin id ' + skinId + ' is negative');
}

export function buildPowers(skin, level, a) {
  a.level = level;
  a.levelCoef = f(F095 + f(level * F005));
  for (let i = 0; i < 4; i++) {
    a.powerTypes[i] = PowerType.None;
    a.powerValues[i] = 0;
    const unlocked = (i === 0 && level >= 5) || (i === 1 && level >= 10) || (i === 2 && level >= 15) || (i === 3 && level >= 20);
    if (unlocked && skin.powerTypes != null && i < skin.powerTypes.length) {
      a.powerTypes[i] = skin.powerTypes[i];
      a.powerValues[i] = skin.powerValues[i];
    }
  }
}

function spawnArray(map, s) {
  switch (s.teams) {
    case TeamConfig.OneVersusThree: return s.bossOnLeft ? map.spawnTeam1v3 : map.spawnTeam3v1;
    case TeamConfig.TwoVersusTwo: return map.spawnTeam2v2;
    default: return map.ffaSpawns;
  }
}

const nextOrdered = (rng, a, b) => (a <= b ? next(rng, a, b) : next(rng, b, a));

export function spawnAgent(c, sl) {
  const s = c.s;
  const skinIdx = resolveSkin(c, sl.skinId, sl.slot);
  const skin = c.db.skins[skinIdx];
  const a = createAgentState();
  a.id = s.agents.length;
  a.slot = sl.slot;
  a.team = teamOfSlot(sl.slot, s.teams, s.bossOnLeft);
  a.skin = skinIdx;
  a.isBot = sl.isBot;
  a.difficulty = SMath.clamp01(f(sl.botDifficulty));
  a.isBoss = s.goal === GoalType.KillBoss && s.teams === TeamConfig.OneVersusThree && sl.slot === bossSlot(s);

  const arr = spawnArray(c.map, s);
  a.pos = arr != null && arr.length > 0 ? Vec2.copy(arr[sl.slot % arr.length]) : Vec2.zero();
  a.velocity = Vec2.zero();

  const level = Math.max(1, Math.min(SimConst.MaxLevel, sl.level));
  buildPowers(skin, level, a);

  const hpBase = skin.hpBase >= 1 ? skin.hpBase : 100;
  let hpMax = f(f(a.levelCoef + power(a, PowerType.LifeBoost)) * hpBase);
  if (hpMax <= 0) hpMax = 100;
  if (a.isBoss) {
    let d = f(s.botDifficultyInt / 100);
    let coef;
    if (!a.isBot) {
      if (!s.isOffline) d = 0.5;
      coef = playerBossHpCoef(d);
    } else coef = bossHpCoef(d);
    hpMax = f(hpMax * coef);
  }
  a.hpBase = hpBase;
  a.hpMax = a.hpCurrent = hpMax;

  let ms = skin.moveSpeed > 0 ? skin.moveSpeed : 5;
  if (a.isBoss) ms = f(ms * SimConst.BossSpeedCoef);
  a.moveSpeed = ms;
  a.speedMultiplier = 1;
  a.facingLeft = a.pos.x > 0;
  a.kccMaxSpeed = ms;

  a.actionRef = skin.action;
  a.specialRef = skin.special;
  const act = c.act(a.actionRef);
  const sp = c.act(a.specialRef);
  let cdA = act != null ? act.cooldown : 0;
  cdA = f(cdA * SMath.clamp(f(1 - power(a, PowerType.CooldownBoost)), F01, 1));
  a.cooldownAction = 0;
  a.cooldownActionMax = cdA;
  a.cooldownSpecial = a.cooldownSpecialMax = sp != null ? sp.cooldown : 0;

  if (a.isBot) {
    const d = a.difficulty;
    const rng = s.rng;
    const b = createBotState();
    b.aggressivity = SMath.clamp01(f(next(rng, -F01, F01) + d));
    b.reactionTime = nextOrdered(rng, SMath.lerp(F01, 0, d), SMath.lerp(1, F01, d));
    b.escapeSkill = nextOrdered(rng, SMath.lerp(5, 65, d), SMath.lerp(30, 90, d));
    b.specialUnlocked = hasPower(a, PowerType.SpecialUnlocked);
    b.lastTargetScore = -0.25;
    b.stuckTimer = 0.5;
    a.bot = b;
  }

  s.agents.push(a);
  if (a.isBoss) c.emit(SimEventType.BossSpawned, { agent: a.id });
  return a;
}

export function makeDisconnectedBot(c, a) {
  const s = c.s;
  const d = f(s.botDifficultyInt / 100);
  const rng = s.rng;
  a.isBot = true;
  a.difficulty = SMath.clamp01(d);
  const b = createBotState();
  b.aggressivity = SMath.clamp01(f(d + next(rng, -F01, F01)));
  b.reactionTime = nextOrdered(rng, SMath.lerp(F01, 0, d), SMath.lerp(1, F01, d));
  b.escapeSkill = nextOrdered(rng, SMath.lerp(50, 70, d), SMath.lerp(70, 90, d));
  b.specialUnlocked = hasPower(a, PowerType.SpecialUnlocked);
  b.lastTargetScore = -0.25;
  b.stuckTimer = 0.5;
  a.bot = b;
}

export const Spawner = Object.freeze({ resolveSkin, buildPowers, spawnAgent, makeDisconnectedBot });
