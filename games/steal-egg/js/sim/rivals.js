// AI rivals (EnemyAI), rules/ai-rivals.md. Two explicit machines per rival, as in the original:
//   brain.state     STATE: patrol 0, chase 1, attack 2, cooldown 3, gotoTarget 4         (player logic, section 3)
//   brain.objective OBJ:   none 0, goToEgg 1, stealEgg 2, returnEgg 3, goToBrainrot 4, stealBrainrot 5, returnBrainrot 6
// plus two timed routines kept as data (coroutines): brain.atk (AttackRoutine / RevengeAttackRoutine) and brain.stun
// (GotHitRagdoll). Rivals use the same item functions as the player (items.js) for carrying, dropping and securing.
// AI_01 has no player reference in the scene (never chases or revenges); that is data (rivals[i].hasPlayer).
import { agentTo, agentStop, face } from './agent.js';
import { itemPos, carriedBy, canAIPickup, tryReserveEgg, releaseEgg, pickEgg, dropEgg, secureCarriedEgg, carryBrainrot } from './items.js';
import { randInt, randRange, d2xz, dxz, copy } from './util.js';
import { enemyPlaceEgg, enemyPlaceBrainrot, tryEnemyStealBrainrot, reserveClosestBrainrotForAI, releaseBrainrot } from './farm.js';
import { playerHitByRival } from './combat.js';

export const STATE = Object.freeze({ PATROL: 0, CHASE: 1, ATTACK: 2, COOLDOWN: 3, GOTO: 4 });
export const OBJ = Object.freeze({ NONE: 0, GO_EGG: 1, STEAL_EGG: 2, RETURN_EGG: 3, GO_BRAINROT: 4, STEAL_BRAINROT: 5, RETURN_BRAINROT: 6 });

const def = (sim, a) => sim.D.rivals[a - 1];
const stopping = d => Math.max(0.05, d.attackRange * 0.9); // EnemyAI.Start agent.stoppingDistance

export function newRivalBrain(sim, a) {
  const d = def(sim, a), c = sim.D.code;
  return {
    state: STATE.PATROL, objective: OBJ.NONE, patrolIndex: 0, patrolTimer: 0, chaseTimer: 0, cooldownTimer: 0,
    attackBusy: false, atk: null, isTargeting: false, externalTarget: null,
    targetEgg: null, targetBrainrot: null, stealTimer: 0,
    nextObjectiveCheck: sim.state.t + randRange(sim.state, c.objectiveFirstCheckMin, Math.max(1.1, d.objectiveCheckInterval)),
    tracked: OBJ.NONE, blockedTimer: 0, lastObjDist: 1e9,
    revenge: { active: false, item: null, timer: 0, attackBusy: false },
    waitingNormal: false, normalStole: false, waitingRevenge: false, revengeRecovered: false,
    checkTimer: 0, temptime: 0, lastChecked: null, stun: null,
  };
}

const carryType = (sim, a) => {
  const id = carriedBy(sim, a);
  return id ? sim.state.items[id].kind : null;
};
const isNear = (sim, a, p) => dxz(sim.state.actors[a].pos, p) <= Math.max(def(sim, a).interactionDistance, stopping(def(sim, a)) + 0.1);
const playerDist = (sim, a) => (def(sim, a).hasPlayer && !sim.state.actors[0].gone ? dxz(sim.state.actors[a].pos, sim.state.actors[0].pos) : Infinity);

function moveTo(sim, a, p, speed, dt) {
  const actor = sim.state.actors[a];
  actor.speed = speed;
  return agentTo(sim, actor, p, speed, dt, stopping(def(sim, a)));
}

function goToNextPatrolPoint(sim, a) {
  const b = sim.state.actors[a].brain, pts = def(sim, a).patrol;
  b.patrolIndex = randInt(sim.state, 0, pts.length);
  agentStop(sim.state.actors[a]);
}

function releaseReservations(sim, a) {
  const b = sim.state.actors[a].brain;
  releaseEgg(sim, a, b.targetEgg);
  releaseBrainrot(sim, a, b.targetBrainrot);
}

function resetTracking(b) {
  b.tracked = OBJ.NONE; b.blockedTimer = 0; b.lastObjDist = 1e9;
}

export function abortObjective(sim, a) {
  const b = sim.state.actors[a].brain;
  releaseReservations(sim, a);
  b.targetEgg = b.targetBrainrot = null;
  b.objective = OBJ.NONE;
  resetTracking(b);
  b.state = STATE.PATROL;
  b.nextObjectiveCheck = sim.state.t + Math.max(0.5, def(sim, a).objectiveRetryDelay);
  goToNextPatrolPoint(sim, a);
}

function finishObjective(sim, a) {
  abortObjective(sim, a);
  sim.emit('rivalCarry', { actor: a, carry: false });
}

function clearCarry(sim, a) {
  sim.state.actors[a].carry = null;
  sim.emit('rivalCarry', { actor: a, carry: false });
}

// --- per frame ------------------------------------------------------------------------------------------------------

export function stepRivals(sim, dt) {
  for (let a = 1; a < sim.state.actors.length; a++) stepRival(sim, a, dt);
}

function stepRival(sim, a, dt) {
  const actor = sim.state.actors[a], b = actor.brain, d = def(sim, a);
  actor.moving = false;
  stepAttackRoutine(sim, a, dt);
  if (b.stun) { stepStun(sim, a, dt); return; }
  if (b.revenge.active) { updateRevenge(sim, a, dt); return; }
  if (updateFarmGameplay(sim, a, dt)) return;
  const dist = playerDist(sim, a);
  switch (b.state) {
    case STATE.PATROL:
      patrol(sim, a, dt);
      if (dist <= d.chaseRange) beginChase(sim, a);
      break;
    case STATE.CHASE:
      if (dist === Infinity) { stopChase(sim, a); break; }
      if (dist <= d.attackRange) { beginAttack(sim, a); break; }
      moveTo(sim, a, sim.state.actors[0].pos, d.runSpeed, dt);
      b.chaseTimer -= dt;
      if (b.chaseTimer <= 0) stopChase(sim, a);
      break;
    case STATE.ATTACK:
      if (dist === Infinity) { stopChase(sim, a); break; }
      if (dist <= d.attackRange) beginAttack(sim, a);
      face(actor, sim.state.actors[0].pos);
      break;
    case STATE.COOLDOWN:
      b.cooldownTimer -= dt;
      if (b.cooldownTimer <= 0) { b.state = STATE.PATROL; goToNextPatrolPoint(sim, a); }
      break;
    case STATE.GOTO:
      if (!b.isTargeting || !b.externalTarget) { b.isTargeting = false; b.state = STATE.PATROL; break; }
      moveTo(sim, a, b.externalTarget, d.runSpeed, dt);
      if (isNear(sim, a, b.externalTarget)) {
        b.isTargeting = false; b.externalTarget = null; b.state = STATE.PATROL;
        goToNextPatrolPoint(sim, a);
      }
      break;
  }
}

function patrol(sim, a, dt) {
  const actor = sim.state.actors[a], b = actor.brain, d = def(sim, a), c = sim.D.code;
  const r = moveTo(sim, a, d.patrol[b.patrolIndex], d.walkSpeed, dt);
  if (r.remaining <= stopping(d) + 1e-3 || r.invalid) {
    b.patrolTimer += dt;
    if (b.patrolTimer >= d.patrolWaitTime) { goToNextPatrolPoint(sim, a); b.patrolTimer = 0; }
  }
  // Stuck detector (EnemyAI.Patrol): every 0.5 s, less than 0.05 m moved adds up; past 1.0 s pick another point.
  b.checkTimer += dt;
  if (b.checkTimer >= c.patrolStuckCheck) {
    if (b.lastChecked && dxz(actor.pos, b.lastChecked) < c.patrolStuckMove) {
      b.temptime += b.checkTimer;
      if (b.temptime > c.patrolStuckTime) { goToNextPatrolPoint(sim, a); b.temptime = 0; }
    } else b.temptime = 0;
    b.lastChecked = copy(actor.pos);
    b.checkTimer = 0;
  }
}

function beginChase(sim, a) {
  const b = sim.state.actors[a].brain;
  if (carryType(sim, a) || b.objective !== OBJ.NONE) return;
  b.state = STATE.CHASE;
  b.chaseTimer = def(sim, a).chaseDuration;
  sim.emit('rivalChase', { actor: a });
}

export function stopChase(sim, a) {
  const b = sim.state.actors[a].brain;
  b.state = STATE.COOLDOWN;
  b.cooldownTimer = def(sim, a).detectionCooldown;
  agentStop(sim.state.actors[a]);
}

function beginAttack(sim, a) {
  const b = sim.state.actors[a].brain;
  if (carryType(sim, a) || b.objective !== OBJ.NONE || b.attackBusy) return;
  b.state = STATE.ATTACK;
  b.attackBusy = true;
  agentStop(sim.state.actors[a]);
  b.atk = { revenge: false, phase: 'windup', t: 0, hit: false };
  sim.emit('rivalAttack', { actor: a });
}

// AttackRoutine / RevengeAttackRoutine: wind-up 0.4 s, weapon collider on for 0.1 s, then attackCooldown 2.0 s
// unless the swing took a brainrot.
function stepAttackRoutine(sim, a, dt) {
  const actor = sim.state.actors[a], b = actor.brain, k = b.atk, d = def(sim, a), c = sim.D.code;
  if (!k) return;
  k.t += dt;
  if (k.phase === 'windup' && k.t >= c.rivalAttackWindup) {
    k.phase = 'window'; k.t = 0;
    if (k.revenge) { b.waitingRevenge = true; b.revengeRecovered = false; } else { b.waitingNormal = true; b.normalStole = false; }
  }
  if (k.phase === 'window') {
    if (!k.hit && !b.stun && d.hasPlayer && dxz(actor.pos, sim.state.actors[0].pos) <= d.attackRange + sim.D.player.radius) {
      k.hit = true;
      playerHitByRival(sim, a);
    }
    if (k.t >= c.rivalAttackWindow) {
      b.waitingNormal = b.waitingRevenge = false;
      if (k.revenge && b.revengeRecovered) {
        b.revenge.attackBusy = false; b.revenge.active = false; b.revenge.item = null; b.atk = null;
        return;
      }
      if (!k.revenge && b.normalStole) { b.attackBusy = false; b.atk = null; return; }
      k.phase = 'cool'; k.t = 0;
    }
  }
  if (k.phase === 'cool' && k.t >= d.attackCooldown) {
    b.atk = null;
    if (k.revenge) { b.revenge.attackBusy = false; return; }
    b.attackBusy = false;
    if (d.hasPlayer && b.chaseTimer > 0) b.state = playerDist(sim, a) > d.attackRange ? STATE.CHASE : STATE.ATTACK;
  }
}

// EnemyBrainrotHitRelay.ConfirmPlayerHit -> OnConfirmedPlayerHit: a connecting swing takes the brainrot the player holds.
export function onConfirmedPlayerHit(sim, a) {
  const b = sim.state.actors[a].brain;
  if (b.revenge.active && b.waitingRevenge && !b.revengeRecovered) {
    if (takeFromPlayer(sim, a, b.revenge.item)) { b.revengeRecovered = true; sim.emit('rivalRecovered', { actor: a, item: b.revenge.item }); }
  } else if (b.waitingNormal && !b.normalStole) {
    const id = carriedBy(sim, 0);
    if (id && sim.state.items[id].kind === 'brainrot' && takeFromPlayer(sim, a, id)) {
      b.normalStole = true;
      sim.emit('rivalTookCarried', { actor: a, item: id });
    }
  }
}

// PlayerCarryController.TryGiveBrainrotToEnemy
function takeFromPlayer(sim, a, id) {
  if (!id || carriedBy(sim, 0) !== id) return false;
  sim.state.actors[0].carry = null;
  sim.state.actors[a].carry = null;
  carryBrainrot(sim, a, id);
  sim.emit('rivalCarry', { actor: a, carry: true, item: id });
  return true;
}

// --- farm objectives ------------------------------------------------------------------------------------------------

function updateFarmGameplay(sim, a, dt) {
  const b = sim.state.actors[a].brain, d = def(sim, a);
  if (!d.farmGameplay) return false;
  if (b.objective !== OBJ.NONE) { updateObjective(sim, a, dt); return true; }
  if (carryType(sim, a)) { startReturn(sim, a, dt); return true; }
  if (b.state === STATE.PATROL && !b.isTargeting && !b.attackBusy && sim.state.t >= b.nextObjectiveCheck) {
    b.nextObjectiveCheck = sim.state.t + Math.max(0.5, d.objectiveCheckInterval);
    tryChooseObjective(sim, a);
    return b.objective !== OBJ.NONE;
  }
  return false;
}

// ReserveClosestEgg: any owned, unsecured egg in a nest or on the ground that this rival can reserve.
function reserveClosestEgg(sim, a) {
  const me = sim.state.actors[a].pos;
  let best = null, bestD = Infinity;
  for (const id of Object.keys(sim.state.items)) {
    const it = sim.state.items[id];
    if (it.kind !== 'egg' || !canAIPickup(sim, a, id)) continue;
    const dd = d2xz(me, itemPos(sim, id));
    if (dd < bestD) { bestD = dd; best = id; }
  }
  if (best && !tryReserveEgg(sim, a, best)) return null;
  return best;
}

function tryChooseObjective(sim, a) {
  const b = sim.state.actors[a].brain, d = def(sim, a);
  const egg = d.stealEggs ? reserveClosestEgg(sim, a) : null;
  const br = d.stealPlayerBrainrots ? reserveClosestBrainrotForAI(sim, a) : null;
  if (!egg && !br) return;
  let pickBr = !egg;
  if (egg && br) pickBr = sim.rand() <= d.brainrotStealChance;
  if (pickBr) {
    releaseEgg(sim, a, egg);
    b.targetEgg = null; b.targetBrainrot = br; b.objective = OBJ.GO_BRAINROT;
  } else {
    releaseBrainrot(sim, a, br);
    b.targetEgg = egg; b.targetBrainrot = null; b.objective = OBJ.GO_EGG;
  }
  agentStop(sim.state.actors[a]);
  sim.emit('rivalObjective', { actor: a, objective: b.objective, item: egg && !pickBr ? egg : br });
}

function startReturn(sim, a, dt) {
  const b = sim.state.actors[a].brain, k = carryType(sim, a);
  b.objective = k === 'egg' ? OBJ.RETURN_EGG : k === 'brainrot' ? OBJ.RETURN_BRAINROT : OBJ.NONE;
  moveTo(sim, a, sim.D.rivalFarms[def(sim, a).farm].returnPoint, def(sim, a).runSpeed, dt);
}

function stopForSteal(sim, a) {
  agentStop(sim.state.actors[a]);
  sim.emit('rivalSteal', { actor: a });
}

function updateObjective(sim, a, dt) {
  const actor = sim.state.actors[a], b = actor.brain, d = def(sim, a), s = sim.state;
  const ret = sim.D.rivalFarms[d.farm].returnPoint;
  switch (b.objective) {
    case OBJ.GO_EGG: {
      if (!b.targetEgg || !canAIPickup(sim, a, b.targetEgg)) { abortObjective(sim, a); return; }
      const p = itemPos(sim, b.targetEgg);
      moveTo(sim, a, p, d.runSpeed, dt);
      if (isNear(sim, a, p)) { stopForSteal(sim, a); b.objective = OBJ.STEAL_EGG; b.stealTimer = d.stealDuration; }
      return;
    }
    case OBJ.STEAL_EGG: {
      if (!b.targetEgg || !canAIPickup(sim, a, b.targetEgg)) { abortObjective(sim, a); return; }
      face(actor, itemPos(sim, b.targetEgg));
      b.stealTimer -= dt;
      if (b.stealTimer > 0) return;
      if (!isEmptyHand(sim, a)) { abortObjective(sim, a); return; }
      const id = b.targetEgg;
      b.targetEgg = null;
      pickEgg(sim, a, id);
      sim.emit('rivalCarry', { actor: a, carry: true, item: id });
      startReturn(sim, a, dt);
      return;
    }
    case OBJ.RETURN_EGG: {
      const id = carriedBy(sim, a);
      if (!id || s.items[id].kind !== 'egg') { clearCarry(sim, a); abortObjective(sim, a); return; }
      moveTo(sim, a, ret, d.runSpeed, dt);
      if (isNear(sim, a, ret)) {
        secureCarriedEgg(sim, a);
        if (enemyPlaceEgg(sim, a, id)) finishObjective(sim, a);
      }
      return;
    }
    case OBJ.GO_BRAINROT: {
      const id = b.targetBrainrot, it = id && s.items[id];
      if (!it || it.at.farm !== 0) { abortObjective(sim, a); return; }
      const p = it.at.pos;
      const r = moveTo(sim, a, p, d.runSpeed, dt);
      if (blockedObjective(sim, a, p, r, dt)) {
        sim.emit('rivalBlocked', { actor: a, item: id });
        abortObjective(sim, a);
        return;
      }
      if (isNear(sim, a, p)) {
        resetTracking(b);
        stopForSteal(sim, a);
        sim.toast('Some one is stealing your Brainrot');
        sim.tutorial('AIStealingWarning', id);
        b.objective = OBJ.STEAL_BRAINROT;
        b.stealTimer = d.stealDuration;
      }
      return;
    }
    case OBJ.STEAL_BRAINROT: {
      const id = b.targetBrainrot, it = id && s.items[id];
      if (!it || it.at.farm !== 0) { abortObjective(sim, a); return; }
      face(actor, it.at.pos);
      b.stealTimer -= dt;
      if (b.stealTimer > 0) return;
      if (!tryEnemyStealBrainrot(sim, id)) { abortObjective(sim, a); return; }
      b.targetBrainrot = null;
      carryBrainrot(sim, a, id);
      sim.emit('rivalStole', { actor: a, item: id, from: 0 });
      sim.emit('rivalCarry', { actor: a, carry: true, item: id });
      startReturn(sim, a, dt);
      return;
    }
    case OBJ.RETURN_BRAINROT: {
      const id = carriedBy(sim, a);
      if (!id || s.items[id].kind !== 'brainrot') { clearCarry(sim, a); abortObjective(sim, a); return; }
      moveTo(sim, a, ret, d.runSpeed, dt);
      if (isNear(sim, a, ret) && enemyPlaceBrainrot(sim, a, id)) finishObjective(sim, a);
      return;
    }
  }
}

const isEmptyHand = (sim, a) => !sim.state.actors[a].carry;

// ShouldAbortBlockedBrainrotObjective: 4 s without 0.15 m of progress, or an invalid path at once.
function blockedObjective(sim, a, p, moveResult, dt) {
  const b = sim.state.actors[a].brain, d = def(sim, a);
  const dist = dxz(sim.state.actors[a].pos, p);
  if (b.objective !== b.tracked) {
    b.tracked = b.objective; b.blockedTimer = 0; b.lastObjDist = dist;
    if (!moveResult.invalid) return false;
  }
  if (dist < b.lastObjDist - Math.max(0.01, d.objectiveProgressDistance)) {
    b.blockedTimer = 0; b.lastObjDist = dist;
    return false;
  }
  b.blockedTimer = isNear(sim, a, p) ? 0 : b.blockedTimer + dt;
  if (moveResult.invalid) b.blockedTimer = Math.max(b.blockedTimer, d.blockedObjectiveTimeout);
  b.lastObjDist = Math.min(b.lastObjDist, dist);
  return b.blockedTimer >= Math.max(1.0, d.blockedObjectiveTimeout);
}

// EnemyAI.HandleAnimalHit: drop the egg at the rival (+0.2 up), the animal goes home, the objective is aborted.
export function rivalHitByAnimal(sim, a, animal) {
  const id = carriedBy(sim, a), it = id && sim.state.items[id];
  if (!it || it.kind !== 'egg' || it.owner !== animal) return;
  dropEgg(sim, a, { waitExit: false, height: sim.D.code.aiDropHeight });
  sim.emit('rivalCarry', { actor: a, carry: false });
  abortObjective(sim, a);
}

// DropCurrentCarry (revenge start): egg -> DropAtByAI; brainrot -> back into the world on the ground.
function dropCurrentCarry(sim, a) {
  const id = carriedBy(sim, a);
  if (!id) return;
  const it = sim.state.items[id];
  if (it.kind === 'egg') dropEgg(sim, a, { waitExit: false, height: sim.D.code.aiDropHeight });
  else {
    sim.state.actors[a].carry = null;
    it.at = { ground: sim.nav.closest(sim.state.actors[a].pos) };
    sim.emit('drop', { actor: a, item: id, kind: 'brainrot', pos: copy(it.at.ground) });
  }
  sim.emit('rivalCarry', { actor: a, carry: false });
}

// --- revenge --------------------------------------------------------------------------------------------------------

export function onBrainrotStolenFromMyFarm(sim, a, id) {
  const actor = sim.state.actors[a], b = actor.brain, d = def(sim, a);
  if (!d.revenge || !id || b.stun) return;
  releaseReservations(sim, a);
  b.atk = null;                          // StopAllCoroutines
  b.attackBusy = false; b.revenge.attackBusy = false;
  b.targetEgg = b.targetBrainrot = null;
  b.objective = OBJ.NONE;
  b.isTargeting = false; b.externalTarget = null;
  agentStop(actor);
  if (carryType(sim, a)) dropCurrentCarry(sim, a);
  b.revenge.item = id; b.revenge.active = true; b.revenge.timer = Math.max(2.0, d.revengeGiveUpTime);
  b.state = STATE.PATROL;
  sim.emit('rivalRevenge', { actor: a, item: id });
}

function stopRevenge(sim, a) {
  const b = sim.state.actors[a].brain;
  b.revenge.active = false; b.revenge.item = null; b.revenge.attackBusy = false;
  b.waitingNormal = b.normalStole = b.waitingRevenge = b.revengeRecovered = false;
  b.state = STATE.PATROL;
  b.nextObjectiveCheck = sim.state.t + Math.max(0.5, def(sim, a).objectiveRetryDelay);
  goToNextPatrolPoint(sim, a);
  sim.emit('rivalRevengeEnd', { actor: a });
}

function updateRevenge(sim, a, dt) {
  const actor = sim.state.actors[a], b = actor.brain, d = def(sim, a), s = sim.state;
  b.revenge.timer -= dt;
  const id = b.revenge.item, it = id && s.items[id];
  if (!it || !d.hasPlayer) { stopRevenge(sim, a); return; }
  if (it.at.carried === 0 || it.at.stowed === 0) {
    if (b.revenge.timer <= 0) { stopRevenge(sim, a); return; }
    const dist = dxz(actor.pos, s.actors[0].pos);
    if (dist <= d.attackRange) {
      face(actor, s.actors[0].pos);
      if (!b.revenge.attackBusy) {
        b.revenge.attackBusy = true;
        agentStop(actor);
        b.atk = { revenge: true, phase: 'windup', t: 0, hit: false };
        sim.emit('rivalAttack', { actor: a, revenge: true });
      }
    } else moveTo(sim, a, s.actors[0].pos, Math.max(d.runSpeed, d.revengeRunSpeed), dt);
    return;
  }
  if (it.at.farm !== 0) { stopRevenge(sim, a); return; }
  // The player placed it on his farm: revenge becomes a normal steal of that brainrot.
  b.revenge.active = false; b.revenge.item = null;
  b.targetBrainrot = id; b.state = STATE.PATROL; b.objective = OBJ.GO_BRAINROT;
  moveTo(sim, a, it.at.pos, d.runSpeed, dt);
}

// --- stun (GotHitRagdoll) -------------------------------------------------------------------------------------------

export function stunRival(sim, a) {
  const actor = sim.state.actors[a], b = actor.brain;
  if (b.stun) return false;
  b.revenge.active = false; b.revenge.attackBusy = false; b.revenge.item = null;
  b.objective = OBJ.NONE;                // reservations and carry are kept (ai-rivals.md 7)
  b.stun = { phase: 'lead', t: 0 };
  agentStop(actor);
  actor.stunUntil = sim.state.t + sim.D.code.rivalStunLead + def(sim, a).stunDuration;
  sim.emit('stun', { actor: a, until: actor.stunUntil });
  return true;
}

function stepStun(sim, a, dt) {
  const actor = sim.state.actors[a], b = actor.brain, d = def(sim, a);
  b.stun.t += dt;
  if (b.stun.phase === 'lead' && b.stun.t >= sim.D.code.rivalStunLead) { b.stun.phase = 'down'; b.stun.t = 0; }
  if (b.stun.phase === 'down' && b.stun.t >= d.stunDuration) {
    b.stun = null;
    actor.pos = copy(d.home);
    actor.yaw = d.homeYaw;
    actor.stunUntil = 0;
    b.state = STATE.PATROL;
    b.nextObjectiveCheck = sim.state.t + d.objectiveRetryDelay;
    sim.emit('recover', { actor: a });
  }
}

// AIGateController -> EnemyAI.GotoSteal: refused while targeting, chasing or busy with an objective.
export function gotoSteal(sim, a, p) {
  const b = sim.state.actors[a].brain;
  if (!p || b.isTargeting || b.state === STATE.CHASE || b.objective !== OBJ.NONE) return false;
  b.isTargeting = true; b.externalTarget = copy(p); b.state = STATE.GOTO;
  return true;
}

// EventManager.OnPlayerDied -> EnemyAI.PlayerDied
export function onPlayerDied(sim) {
  for (let a = 1; a < sim.state.actors.length; a++) {
    const b = sim.state.actors[a].brain;
    if (!b.stun) { b.chaseTimer = 0; stopChase(sim, a); }
  }
}

