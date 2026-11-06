// All mutable match state as plain data (FG.Sim.MatchState / AgentState / BotState / BulletState): same fields
// in camelCase, enums as ints, Vec2 as {x, y}, no references to GameDb. JSON.stringify and structuredClone work
// on it, and a C# MatchState dump diffs field by field.
import { createSimRng } from '../Core/SimRng.js';
import { PowerType, StatusFlags } from '../Data/Enums.js';
import { f } from '../Core/Vec2.js';

export function createMatchState() {
  return {
    tick: 0,
    rng: createSimRng(1),
    seed: 0,
    // RuntimeConfig, frozen at create
    mapIndex: 0,
    goal: 0,
    teams: 0,
    bossOnLeft: false,
    isOffline: false,
    noTimer: false,
    botDifficultyInt: 50,
    botNoMove: false,
    botNoAction: false,
    playerCount: 0,
    // GameState component
    phase: 0,
    timerElapsed: 0,
    timerMax: 0,
    killSlot: [0, 0, 0, 0],
    deathSlot: [0, 0, 0, 0],
    lastKillSeq: [0, 0, 0, 0],
    lastDeathSeq: [0, 0, 0, 0],
    killSeqCounter: 0,
    deathSeqCounter: 0,
    winnerSlot: -1,
    winnerTeam: 0,
    timeOut: false,
    agents: [],
    bullets: [],
    nextBulletId: 1,
  };
}

/** One agent = the Quantum entity with AgentLife, AgentMovement, AgentAction, KCC, AgentDesiredMove, AgentPowers (+ bot). */
export function createAgentState() {
  return {
    // identity
    id: 0, slot: 0, team: 0, skin: 0, isBot: false, isBoss: false, isDummy: false, difficulty: 0,
    // Transform2D + CharacterController2D
    pos: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, grounded: false, kccMaxSpeed: 0, kccJumped: false,
    // AgentMovement
    moveSpeed: 0, speedMultiplier: 1, facingLeft: false, isJumping: false, isFalling: false,
    isDashing: false, dashIgnoreGravity: false, dashBackwards: false, dashTimer: 0, dashDirection: { x: 0, y: 0 },
    isPushback: false, pushbackTimer: 0, pushbackValue: 0,
    // AgentDesiredMove
    directionX: 0, jump: false, action: false, actionHeld: false, special: false, specialHeld: false, prevButtons: 0,
    // AgentLife
    deathCount: 0, killCount: 0, flags: 0, lastKiller: -1, poisonSource: -1, hpBase: 0, hpCurrent: 0, hpMax: 0,
    angryTimer: 0, freezeTimer: 0, invincibilityTimer: 0, invisibilityTimer: 0, poisonTimer: 0, slowDownTimer: 0, specialTimer: 0, zoneHitTimer: 0,
    poisonDamagePerTick: 0, poisonTickRate: 0, poisonTickTimer: 0, respawnTimer: 0,
    // AgentPowers
    level: 0, levelCoef: 1, powerTypes: [PowerType.None, PowerType.None, PowerType.None, PowerType.None], powerValues: [0, 0, 0, 0],
    // AgentAction (refs index GameDb.actions)
    actionRef: -1, specialRef: -1, actionEventIndex: 0,
    currentIsSpecial: false, isActioning: false, isBusy: false, lastAttackSucceed: false, meleeWindowOpen: false,
    meleeHit: [-1, -1, -1, -1],
    actionTimer: 0, cooldownAction: 0, cooldownActionMax: 0, cooldownSpecial: 0, cooldownSpecialMax: 0,
    // AgentBotState + AgentNavPath (null for humans)
    bot: null,
  };
}

export function createBotState() {
  return {
    aggressivity: 0, reactionTime: 0, escapeSkill: 0,
    target: -1,
    lastTargetScore: -0.25,
    specialUnlocked: false,
    aiCycleCounter: 0,
    timeSinceLastTarget: 0, timeSinceLastDamageDealt: 0, timeSinceLastAttack: 0, timeSinceLastCooldownReset: 0, timeSinceLastOffensiveSpecialAttempt: 0,
    attackReactionEndTime: 0, specialReactionEndTime: 0, escapeReactionEndTime: 0, fleeReactionEndTime: 0,
    holdMeleeReleaseTime: 0, modeEndTime: 0, pauseEndTime: 0, escapeCooldown: 0, branchEndTime: 0,
    timeSinceLastDestination: 0, timeRefreshDestination: 0,
    destination: { x: 0, y: 0 }, branchDestination: { x: 0, y: 0 },
    isInFleeMode: false, isTooClose: false, isEscaping: false,
    escapeDirectionX: 0,
    // AgentNavPath
    navCount: 0, navIndex: 0,
    navPath: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    stuckTimer: 0.5,
    lastPos: { x: 0, y: 0 },
  };
}

export function createBulletState() {
  return {
    id: 0, alive: true, data: 0, source: -1,
    pos: { x: 0, y: 0 }, direction: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
    lifeTimer: 0, speed: 0, damageAmount: 0, pushBackDuration: 0, pushBackEffect: 0, tickTimer: 0, distanceTraveled: 0, scaleOnDistance: 0,
    isReturning: false, snapped: false, forcePierce: false, fromBoss: false, isSpecial: false,
    reboundCount: 0, powerRebound: 0,
    hitAgent: [-1, -1, -1, -1],
  };
}

/** MatchState.Clone: independent deep copy (the snapshot is plain data). */
export function cloneMatchState(s) {
  return structuredClone(s);
}

export function elapsed(s, dt) { return f(s.tick * dt); }

export function agentInSlot(s, slot) {
  for (const a of s.agents) if (a.slot === slot) return a;
  return null;
}

// AgentState helpers
export const has = (a, flag) => (a.flags & flag) !== 0;
export const isDead = (a) => (a.flags & StatusFlags.Dead) !== 0;
export const hpRatio = (a) => (a.hpMax < 1 ? 1 : f(a.hpCurrent / a.hpMax));

export function hasPower(a, t) {
  const p = a.powerTypes;
  return p[0] === t || p[1] === t || p[2] === t || p[3] === t;
}

/** AgentPowersHelper.GetValue: first slot with this type, else 0. */
export function power(a, t) {
  const p = a.powerTypes;
  for (let i = 0; i < 4; i++) if (p[i] === t) return a.powerValues[i];
  return 0;
}
