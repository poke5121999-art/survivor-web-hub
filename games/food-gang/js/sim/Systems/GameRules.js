// SimConst + GameStateSystem: timer, win rules, teams.
import { f, SMath } from '../Core/Vec2.js';
import { GoalType, TeamConfig, GamePhase, StatusFlags } from '../Data/Enums.js';
import { SimEventType } from '../State/SimEvent.js';
import { has, isDead } from '../State/MatchState.js';

export const SimConst = Object.freeze({
  BossScale: 1.5,
  BossSpeedCoef: f(0.8),
  BossLifeMin: 6, BossLifeMax: 10,
  BossDamageMin: 1.5, BossDamageMax: 2.5,
  KillTargetFfa: 5,
  KillTargetTeam: 9,
  DeathMax: 3,
  DeathAnimDuration: 0.25,
  RespawnDuration: 3.0,
  SpawnInvincibility: 2.0,
  LowLife: f(0.4), HighLife: f(0.6),
  AnimFps: 60,
  MaxLevel: 20,
});

/** How a goal ends the match before the timer (CheckEndConditions dispatch). */
export const EndRule = Object.freeze({ TimerOnly: 0, KillTarget: 1, LastSurvivor: 2, BossDeath: 3 });

/** Who wins when the timer runs out (ResolveTimerWinner). */
export const TimeOutRule = Object.freeze({ TopScore: 0, BossTeam: 1 });

const Goals = Object.freeze([
  Object.freeze({ goal: GoalType.DeathMatch, timerMax: 90, end: EndRule.TimerOnly, timeOut: TimeOutRule.TopScore }),
  Object.freeze({ goal: GoalType.Kill5, timerMax: 0, end: EndRule.KillTarget, timeOut: TimeOutRule.TopScore }),
  Object.freeze({ goal: GoalType.LastSurvivor, timerMax: 0, end: EndRule.LastSurvivor, timeOut: TimeOutRule.TopScore }),
  Object.freeze({ goal: GoalType.KillBoss, timerMax: 60, end: EndRule.BossDeath, timeOut: TimeOutRule.BossTeam }),
]);

export const goalRule = (g) => Goals[g];

/** GetTeamForSlot: 1-based team ids. */
export function teamOfSlot(slot, cfg, bossOnLeft) {
  switch (cfg) {
    case TeamConfig.OneVersusThree: return bossOnLeft ? (slot === 0 ? 1 : 2) : (slot === 3 ? 2 : 1);
    case TeamConfig.TwoVersusTwo: return slot <= 1 ? 1 : 2;
    default: return slot + 1;
  }
}

export const bossSlot = (s) => (s.bossOnLeft ? 0 : 3);

export function isSameTeam(s, a, b) {
  if (a == null || b == null || s.teams === TeamConfig.FreeForAll) return false;
  return a.team > -1 && a.slot >= 0 && b.slot >= 0 && a.team === b.team;
}

export function agentHitRadius(db, a) {
  let r = db.skins[a.skin].hitRadius;
  if (r <= 0) r = 0.5;
  return a.isBoss ? f(r * SimConst.BossScale) : r;
}

export function agentCenter(db, a, pos = a.pos) {
  let off = db.skins[a.skin].hitCenterOffsetY;
  if (off <= 0) off = 1;
  if (a.isBoss) off = f(off * SimConst.BossScale);
  return { x: pos.x, y: f(pos.y + off) };
}

export function teamScore(s, team) {
  let sum = 0;
  for (let slot = 0; slot < 4; slot++) if (teamOfSlot(slot, s.teams, s.bossOnLeft) === team) sum += s.killSlot[slot];
  return sum;
}

function isSlotActive(s, slot) {
  for (const a of s.agents) if (a.slot === slot) return true;
  return false;
}

export function update(c) {
  const s = c.s;
  if (s.phase !== GamePhase.Playing || s.timerMax <= 0) return;
  s.timerElapsed = f(s.timerElapsed + c.dt);
  if (s.timerElapsed < s.timerMax) return;
  triggerGameOver(c, resolveTimerWinner(s), -1, true);
}

/** GameStateSystem.OnAgentDied (killer first, dead second). */
export function onAgentDied(c, killer, dead) {
  const s = c.s;
  if (s.phase !== GamePhase.Playing) return;
  if (dead.isDummy) return;
  const k = c.agent(killer);
  const ks = k != null ? k.slot : -1, ds = dead.slot;
  if (ks >= 0 && ks !== ds) setKill(s, ks, s.killSlot[ks] + 1);
  if (ds >= 0) setDeath(s, ds, s.deathSlot[ds] + 1);
  checkEndConditions(c);
}

function setKill(s, slot, v) { s.killSeqCounter++; s.killSlot[slot] = v; s.lastKillSeq[slot] = s.killSeqCounter; }
function setDeath(s, slot, v) { s.deathSeqCounter++; s.deathSlot[slot] = v; s.lastDeathSeq[slot] = s.deathSeqCounter; }

function checkEndConditions(c) {
  switch (goalRule(c.s.goal).end) {
    case EndRule.KillTarget: checkKill5(c); break;
    case EndRule.LastSurvivor: checkLastSurvivor(c); break;
    case EndRule.BossDeath: checkKillBoss(c); break;
  }
}

function checkKill5(c) {
  const s = c.s;
  if (s.teams === TeamConfig.FreeForAll) {
    for (let slot = 0; slot < 4; slot++)
      if (s.killSlot[slot] >= SimConst.KillTargetFfa) { triggerGameOver(c, 0, slot, false); return; }
    return;
  }
  const s1 = teamScore(s, 1), s2 = teamScore(s, 2);
  if (s1 >= SimConst.KillTargetTeam) triggerGameOver(c, 1, -1, false);
  else if (s2 >= SimConst.KillTargetTeam) triggerGameOver(c, 2, -1, false);
}

const slotAlive = (s, slot) => isSlotActive(s, slot) && s.deathSlot[slot] < SimConst.DeathMax;

function checkLastSurvivor(c) {
  const s = c.s;
  if (s.teams === TeamConfig.FreeForAll) {
    let count = 0, last = -1;
    for (let slot = 0; slot < 4; slot++) if (slotAlive(s, slot)) { count++; last = slot; }
    if (count > 1) return;
    triggerGameOver(c, 0, last, false);
    return;
  }
  let anyTeam1 = false, anyOther = false;
  for (let slot = 0; slot < 4; slot++) {
    if (!slotAlive(s, slot)) continue;
    if (teamOfSlot(slot, s.teams, s.bossOnLeft) === 1) anyTeam1 = true; else anyOther = true;
  }
  if (anyTeam1) {
    if (anyOther) return;
    triggerGameOver(c, 1, -1, false);
  } else triggerGameOver(c, 2, -1, false);
}

function checkKillBoss(c) {
  const s = c.s;
  if (s.teams !== TeamConfig.OneVersusThree) return;
  const playersTeam = s.bossOnLeft ? 2 : 1;
  if (s.deathSlot[bossSlot(s)] > 0) triggerGameOver(c, playersTeam, -1, false);
}

export function resolveTimerWinner(s) {
  if (goalRule(s.goal).timeOut === TimeOutRule.BossTeam) {
    if (s.teams === TeamConfig.OneVersusThree || s.teams === TeamConfig.TwoVersusTwo) return s.bossOnLeft ? 1 : 2;
    return s.bossOnLeft ? 1 : 4;
  }
  if (s.teams === TeamConfig.FreeForAll) return 0;
  const s1 = teamScore(s, 1), s2 = teamScore(s, 2);
  return s1 > s2 ? 1 : s1 < s2 ? 2 : 0;
}

export function triggerGameOver(c, winTeam, winSlot, timeOut) {
  const s = c.s;
  if (s.phase === GamePhase.GameOver) return;
  if (timeOut && winTeam === 0 && s.teams === TeamConfig.FreeForAll) {
    let best = -1;
    winSlot = -1;
    for (let slot = 0; slot < 4; slot++) {
      if (!isSlotActive(s, slot)) continue;   // [ĐỀ XUẤT] empty slots of a 1v1 cannot win
      if (s.killSlot[slot] > best) { best = s.killSlot[slot]; winSlot = slot; }
    }
  }
  s.phase = GamePhase.GameOver;
  s.winnerSlot = winSlot;
  s.winnerTeam = winTeam;
  s.timeOut = timeOut;
  cleanupAgentStatesForGameOver(c);
  c.emit(SimEventType.GameOverTriggered, { other: winSlot, i: winTeam, flag: timeOut });
}

function cleanupAgentStatesForGameOver(c) {
  const s = c.s;
  for (const a of s.agents) {
    if (!isDead(a)) {
      a.flags &= ~StatusFlags.Poison;
      a.flags &= 0xFFFFFA85 | 0;
      a.poisonTimer = a.angryTimer = a.freezeTimer = a.invincibilityTimer = a.invisibilityTimer = a.slowDownTimer = a.specialTimer = 0;
      a.isBusy = a.isActioning = false;
      a.actionTimer = 0;
      a.action = a.actionHeld = a.special = a.specialHeld = false;
    } else if (has(a, StatusFlags.RespawnWait) && !a.isBoss && !(s.goal === GoalType.LastSurvivor && a.deathCount > 2)) {
      a.respawnTimer = 0;
    }
  }
}

// Boss coefficients (GameStateSystem @0x040C5F84 ...)
export const bossHpCoef = (d) => SMath.lerp(SimConst.BossLifeMin, SimConst.BossLifeMax, d);
export const playerBossHpCoef = (d) => SMath.lerp(SimConst.BossLifeMax, SimConst.BossLifeMin, d);
export const bossDmgCoef = (d) => SMath.lerp(SimConst.BossDamageMin, SimConst.BossDamageMax, d);
export const playerBossDmgCoef = (d) => SMath.lerp(SimConst.BossDamageMax, SimConst.BossDamageMin, d);
export const bossHealDivisor = (d) => SMath.lerp(SimConst.BossLifeMax, SimConst.BossLifeMin, d);

/** GetBossDifficulty. [ĐỀ XUẤT] always 0.5 (spec §0.8 item 8): bot bosses have no RuntimePlayer. */
export const bossDifficulty = (_s) => 0.5;

export const GameRules = Object.freeze({
  goalRule, teamOfSlot, bossSlot, isSameTeam, agentHitRadius, agentCenter, teamScore, update, onAgentDied,
  resolveTimerWinner, triggerGameOver, bossHpCoef, playerBossHpCoef, bossDmgCoef, playerBossDmgCoef, bossHealDivisor, bossDifficulty,
});
