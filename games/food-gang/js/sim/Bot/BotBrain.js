// AgentAISystem (spec Part 6). Runs inside Match.step at the AI position of the tick order and writes the
// bot's desired move; think() also returns it as an InputFrame for views and logs.
import { f, FLOAT_MAX, Vec2, SMath } from '../Core/Vec2.js';
import { next, nextInt } from '../Core/SimRng.js';
import { ActionType, DestroyType, GamePhase, GoalType, InputButtons, NavNodeType, StatusFlags } from '../Data/Enums.js';
import { InputFrame } from '../State/InputFrame.js';
import { has, isDead } from '../State/MatchState.js';
import { SimConst, isSameTeam, agentCenter, agentHitRadius } from '../Systems/GameRules.js';
import { linecast as physLinecast, MASK_ALL } from '../Systems/Physics2D.js';
import { bestJumpNodeToward } from './NavGraph.js';

const OFFENSIVE_SPECIAL_RETRY_DELAY = f(0.75);
const DEFAULT_RANGE_MAX = 10;
const NAV_ACCURACY = 0.25;
const JUMP_ACCURACY_MIN = 0.75, JUMP_ACCURACY_MAX = 5;
const JUMP_TRIGGER_LOW_SKILL = 1.5, JUMP_TRIGGER_HIGH_SKILL = 0.5;
const NAV_STUCK_INTERVAL = 0.5;
const BORDER_MARGIN = 2, FLEE_BORDER_MARGIN = 3;
const AIR_DIR_FLIP_MARGIN = 0.75;

const F01 = f(0.1), F015 = f(0.15), F02 = f(0.2), F03 = f(0.3), F035 = f(0.35), F04 = f(0.4), F045 = f(0.45);
const F06 = f(0.6), F065 = f(0.65), F07 = f(0.7), F08 = f(0.8), F005 = f(0.05), F125 = 1.25;

/** Snapshot of a bot's desired move as an InputFrame (pressed = this tick's intents). */
export function desiredAsInput(a) {
  let down = InputButtons.None;
  let pressed = InputButtons.None;
  if (a.jump) pressed |= InputButtons.Jump;
  if (a.action) pressed |= InputButtons.Action;
  if (a.special) pressed |= InputButtons.Special;
  if (a.actionHeld) down |= InputButtons.Action;
  if (a.specialHeld) down |= InputButtons.Special;
  return InputFrame.make(a.directionX, down, pressed);
}

export function resetBotState(b) {
  b.target = -1;
  b.lastTargetScore = -0.25;
  b.isInFleeMode = b.isTooClose = b.isEscaping = false;
  b.escapeReactionEndTime = b.attackReactionEndTime = b.specialReactionEndTime = 0;
  b.timeSinceLastDestination = b.branchEndTime = b.fleeReactionEndTime = 0;
  b.holdMeleeReleaseTime = b.modeEndTime = b.pauseEndTime = b.escapeCooldown = 0;
  b.branchDestination = Vec2.zero();
  b.navCount = b.navIndex = 0;
  b.stuckTimer = 0;
}

export function think(c, a) {
  const s = c.s;
  const bot = a.bot;
  if (s.phase !== GamePhase.Playing) return desiredAsInput(a);
  if ((a.flags & (StatusFlags.Dead | StatusFlags.RespawnWait)) !== 0) return desiredAsInput(a);
  const elapsed = c.elapsed;
  if (bot.escapeCooldown > 0) bot.escapeCooldown = f(bot.escapeCooldown - c.dt);
  if (bot.holdMeleeReleaseTime > 0 && bot.holdMeleeReleaseTime <= elapsed) {
    a.actionHeld = false;
    bot.holdMeleeReleaseTime = 0;
  }
  const cycle = Math.max(1, SMath.roundToInt(SMath.lerp(30, 6, bot.aggressivity)));
  bot.aiCycleCounter++;
  if (bot.aiCycleCounter % cycle === a.id % cycle) evaluate(c, a, elapsed);
  const wasEscaping = bot.isEscaping;
  resolveEscape(c, a, elapsed);
  if (wasEscaping && !bot.isEscaping) {
    bot.timeSinceLastDestination = 0;
    bot.navCount = 0;
    bot.navIndex = 0;
  }
  applyMovement(c, a, elapsed);
  if (s.botNoMove) { a.directionX = 0; a.jump = false; }
  if (s.botNoAction) a.action = a.special = a.actionHeld = a.specialHeld = false;
  return desiredAsInput(a);
}

// ---------------------------------------------------------------- helpers

const meleeOrShootMode = (a) => (a.flags & (StatusFlags.MeleeMode | StatusFlags.ShootMode)) !== 0;

const isDefensiveSpecial = (sp) => sp.damage < 0 || (sp.statusAddFlags & (StatusFlags.Invincibility | StatusFlags.Invisibility)) !== 0;

const isValidEnemy = (c, self, cand) =>
  cand !== self && !isSameTeam(c.s, self, cand)
  && (cand.flags & (StatusFlags.Dead | StatusFlags.RespawnWait | StatusFlags.Invincibility | StatusFlags.Invisibility)) === 0;

const linecast = (c, a, b) => physLinecast(c.map, a, b, MASK_ALL).hit;

const headroomBlocked = (c, a) => linecast(c, Vec2.add(a.pos, { x: 0, y: 1 }), Vec2.add(a.pos, { x: 0, y: 4 }));

const pct = (c) => next(c.s.rng, 0, 100);

function specialModeActive(c, a) {
  const sp = c.act(a.specialRef);
  return meleeOrShootMode(a) || (sp != null && sp.statusAddFlags !== 0 && has(a, StatusFlags.Special));
}

const requestPath = (c, a, to) => c.nav.requestPath(c.map.nav, a.bot, a.pos, to);

// ---------------------------------------------------------------- Evaluate

function evaluate(c, a, elapsed) {
  const bot = a.bot;
  a.action = a.special = a.jump = false;
  if (bot.holdMeleeReleaseTime === 0) a.actionHeld = false;
  if (!a.isBusy) a.specialHeld = false;
  searchTarget(c, a, elapsed);
  const mos = meleeOrShootMode(a);
  const sp = c.act(a.specialRef);
  const blockSpecial = mos || (sp != null && sp.statusAddFlags !== 0 && has(a, StatusFlags.Special));
  const attacked = evaluateAttack(c, a, false, elapsed);
  if (sp != null && !attacked && bot.specialUnlocked) {
    if (sp.damage >= 0 && (sp.statusAddFlags & (StatusFlags.Invincibility | StatusFlags.Invisibility)) === 0 && sp.type !== ActionType.Buff && !blockSpecial)
      evaluateAttack(c, a, true, elapsed);
    else evaluateBuff(c, a, sp, elapsed);
  }
  checkCooldownReset(c, a, elapsed);
  evaluateMove(c, a, elapsed);
}

function searchTarget(c, a, elapsed) {
  const s = c.s;
  const bot = a.bot;
  const mos = meleeOrShootMode(a);
  if (bot.target >= 0) {
    const t = c.agent(bot.target);
    const bad = t == null || !isValidEnemy(c, a, t);
    const stale = !bot.isInFleeMode && !mos && !has(a, StatusFlags.Special) && f(elapsed - bot.timeSinceLastDamageDealt) > 8;
    if (bad || stale) { bot.target = -1; bot.lastTargetScore = -0.25; }
  }
  if (bot.target >= 0 && f(elapsed - bot.timeSinceLastTarget) <= SMath.lerp(5, 0.5, bot.aggressivity)) return;

  const aggr = bot.aggressivity;
  const wHp = SMath.lerp(1.5, 0.5, aggr), wDist = SMath.lerp(0.5, 1.5, aggr);
  const act = c.act(a.actionRef);
  const dmg = act != null ? act.damage : 0;
  let best = bot.target;
  let bestScore = bot.lastTargetScore;
  for (const cand of s.agents) {
    if (!isValidEnemy(c, a, cand)) continue;
    let sc = F01;
    if (dmg > 0) sc = f(sc + f(wHp * SMath.clamp01(f(1 - f(cand.hpCurrent / f(3 * dmg))))));
    sc = f(sc + f(wDist * SMath.lerp(1, 0, SMath.clamp(f(Vec2.distance(a.pos, cand.pos) / 25), 0, 1))));
    if (cand.hpMax > 0) sc = f(sc + f(wHp * SMath.clamp01(f(1 - f(cand.hpCurrent / f(0.25 * cand.hpMax))))));
    if (s.goal === GoalType.DeathMatch || s.goal === GoalType.Kill5) sc = f(sc + f(2 * SMath.clamp01(f((cand.killCount - a.killCount) / 3))));
    else if (s.goal === GoalType.LastSurvivor) sc = f(sc + f(2 * SMath.clamp01(f((3 - cand.deathCount) / 3))));
    if (sc > f(bestScore + (bot.target >= 0 ? 0.5 : 0))) { best = cand.id; bestScore = sc; }
  }
  if (best !== bot.target) {
    bot.target = best;
    bot.timeSinceLastTarget = elapsed;
    bot.timeSinceLastDamageDealt = elapsed;
  }
  bot.lastTargetScore = bestScore;
}

function canAttack(c, a, withJump, isSpecial) {
  let asset = (meleeOrShootMode(a) || isSpecial) ? c.act(a.specialRef) : c.act(a.actionRef);
  if (asset == null || asset.rangeMax === 0) asset = c.act(a.actionRef);
  if (asset == null) return -1;
  let range = asset.rangeMax > 0 ? asset.rangeMax : DEFAULT_RANGE_MAX;
  if (a.isBoss) range = f(range * SimConst.BossScale);
  let origin = agentCenter(c.db, a);
  if (withJump) {
    const probe = Vec2.add(origin, { x: 0, y: 4 });
    if (linecast(c, origin, probe)) return -1;
    origin = probe;
  }
  const passesWalls = asset.bullet >= 0 && c.db.bullets[asset.bullet].destroyType === DestroyType.OnHitPlayerOnly;
  for (const e of c.s.agents) {
    if (!isValidEnemy(c, a, e)) continue;
    const ec = agentCenter(c.db, e);
    if (Vec2.distance(origin, ec) > f(agentHitRadius(c.db, e) + range)) continue;
    if (!passesWalls && linecast(c, origin, ec)) continue;
    return e.id;
  }
  return -1;
}

function evaluateAttack(c, a, isSpecial, elapsed) {
  const bot = a.bot;
  const aggr = bot.aggressivity;
  const cd = isSpecial ? a.cooldownSpecial : a.cooldownAction;
  let tgt = canAttack(c, a, false, isSpecial);
  if (tgt < 0 && canAttack(c, a, true, isSpecial) >= 0 && a.grounded) {
    if (!headroomBlocked(c, a)) a.jump = true;
    return false;
  }
  // C# binds a ref to one of the two reaction timers
  const reactKey = isSpecial ? 'specialReactionEndTime' : 'attackReactionEndTime';
  if (tgt < 0) bot[reactKey] = 0;
  else if (bot[reactKey] === 0) bot[reactKey] = f(elapsed + f(0.5 * bot.reactionTime));
  const ready = tgt < 0 || bot[reactKey] <= elapsed;
  let whiff = false;
  const curTarget = c.agent(bot.target);
  if (tgt < 0 && !isSpecial && curTarget != null && !isSameTeam(c.s, a, curTarget) && cd <= 0 && !a.isBusy)
    whiff = pct(c) <= SMath.lerp(0, 2, aggr);
  if (!(ready && (whiff || tgt >= 0))) return false;
  const roll = tgt >= 0 && next(c.s.rng, 0, 1) <= SMath.lerp(0.5, 1, aggr);
  const fleeRoll = bot.isInFleeMode && !isSpecial && pct(c) <= SMath.lerp(1, 15, aggr);
  if (cd > 0 || !(whiff || roll || fleeRoll) || a.isBusy) {
    if (!a.isBusy) {
      if (isSpecial) a.specialHeld = false;
      else if (bot.holdMeleeReleaseTime === 0) a.actionHeld = false;
    }
    bot[reactKey] = 0;
    return false;
  }
  if (tgt < 0) tgt = bot.target;
  const t = c.agent(tgt);
  if (t != null) {
    const left = t.pos.x < a.pos.x;
    a.directionX = left ? -1 : 1;
    a.facingLeft = left;
  }
  if (isSpecial) {
    a.special = true;
    const spa = c.act(a.specialRef);
    if (spa != null && spa.hold) a.specialHeld = true;
    bot.specialReactionEndTime = 0;
    return true;
  }
  const asset = c.act(a.actionRef);
  if (asset != null && asset.hold && asset.type === ActionType.MeleeAttack) {
    a.actionHeld = true;
    bot.holdMeleeReleaseTime = f(elapsed + (asset.totalFrames >= 1 ? f(asset.totalFrames / 60) : SMath.lerp(F03, F08, aggr)));
  } else {
    a.action = true;
    a.actionHeld = false;
  }
  bot.timeSinceLastAttack = elapsed;
  if (a.cooldownActionMax > 0.75) bot.timeSinceLastDestination = 0;
  bot.attackReactionEndTime = 0;
  return true;
}

function evaluateBuff(c, a, sp, elapsed) {
  const bot = a.bot;
  const aggr = bot.aggressivity;
  if (a.cooldownSpecial > 0 || a.isBusy || has(a, StatusFlags.Special) || sp == null) { a.specialHeld = false; return; }
  let use;
  if (sp.damage < 0 || (sp.statusAddFlags & (StatusFlags.Invincibility | StatusFlags.Invisibility)) !== 0) {
    const hp = a.hpMax > 0 ? f(a.hpCurrent / a.hpMax) : 0;
    const thr = SMath.lerp(0.25, F045, aggr);
    use = hp <= thr && (bot.target >= 0 || hp <= f(F07 * thr));
  } else {
    use = bot.target >= 0 && !bot.isInFleeMode && f(elapsed - bot.timeSinceLastOffensiveSpecialAttempt) >= OFFENSIVE_SPECIAL_RETRY_DELAY;
    if (use) {
      bot.timeSinceLastOffensiveSpecialAttempt = elapsed;
      const range = f(SMath.lerp(6, 10, aggr) * (a.isBoss ? SimConst.BossScale : 1));
      const t = c.agent(bot.target);
      use = t != null && Vec2.distance(a.pos, t.pos) <= range;
      use = use && next(c.s.rng, 0, 1) <= SMath.lerp(F045, 1, aggr);
    }
  }
  if (use) {
    a.special = true;
    a.specialHeld = true;
    bot.isInFleeMode = false;
    if (!isDefensiveSpecial(sp)) { bot.timeSinceLastDestination = 0; bot.timeRefreshDestination = 0; }
    return;
  }
  a.specialHeld = false;
}

function checkCooldownReset(c, a, elapsed) {
  const bot = a.bot;
  if (bot.target < 0 || a.cooldownAction > 0) return;
  const lim = f(a.cooldownActionMax + 2);
  if (f(elapsed - bot.timeSinceLastAttack) > lim && f(elapsed - bot.timeSinceLastCooldownReset) > lim) {
    bot.timeSinceLastDestination = 0;
    bot.timeSinceLastCooldownReset = elapsed;
    bot.isInFleeMode = false;
    bot.modeEndTime = f(elapsed + SMath.lerp(2, 4, bot.aggressivity));
  }
}

// ---------------------------------------------------------------- movement decision

function evaluateMove(c, a, elapsed) {
  const bot = a.bot;
  if (!a.grounded || !(f(elapsed - bot.timeSinceLastDestination) > bot.timeRefreshDestination)) return;
  const aggr = bot.aggressivity;
  const hp = a.hpMax > 0 ? f(a.hpCurrent / a.hpMax) : 1;
  const M = specialModeActive(c, a);
  const mos = meleeOrShootMode(a);
  if (!M && hp < (bot.target < 0 ? 0.75 : F065) && tryMoveToHealZone(c, a, elapsed)) return;
  if (tryAvoidDangerZone(c, a, elapsed)) return;

  const map = c.map;
  const nodes = map.nav;
  if (bot.target < 0) {
    if (nodes.length === 0 || !map.hasNavBounds) return;
    const start = nextInt(c.s.rng, 0, nodes.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < nodes.length; k++) {
        const nd = nodes[(start + k) % nodes.length];
        if (nd.type !== NavNodeType.Walkable) continue;
        if (pass === 0 && (Vec2.distance(nd.pos, a.pos) < 3 || nd.pos.x < f(map.navMinX + BORDER_MARGIN) || nd.pos.x > f(map.navMaxX - BORDER_MARGIN))) continue;
        bot.destination = Vec2.copy(nd.pos);
        bot.timeSinceLastDestination = elapsed;
        bot.timeRefreshDestination = 3;
        requestPath(c, a, bot.destination);
        return;
      }
    }
    bot.timeSinceLastDestination = elapsed;
    bot.destination = Vec2.copy(a.pos);
    bot.timeRefreshDestination = 1;
    return;
  }

  const tgt = c.agent(bot.target);
  if (tgt == null) return;
  const T = Vec2.copy(tgt.pos);
  let attackAsset = (mos || M) ? c.act(a.specialRef) : null;
  if (attackAsset == null || attackAsset.rangeMax === 0) attackAsset = c.act(a.actionRef);
  if (attackAsset == null) return;
  let rangeMax = attackAsset.rangeMax > 0 ? attackAsset.rangeMax : DEFAULT_RANGE_MAX;
  let rangeMin = attackAsset.rangeMin;
  const isShootType = attackAsset.type === ActionType.Shoot;
  if (a.isBoss) {
    rangeMax = f(rangeMax * SimConst.BossScale);
    if (attackAsset.type !== ActionType.MeleeAttack) rangeMin = f(rangeMin * SimConst.BossScale);
  }
  if (!M) evaluateFleeBehavior(c, a, tgt, elapsed);
  else { bot.isInFleeMode = false; bot.modeEndTime = 0; }
  const dx = f(T.x - a.pos.x), dy = f(T.y - a.pos.y);
  const nearLimit = bot.isTooClose ? f(rangeMin + 1) : rangeMin;
  bot.isTooClose = rangeMin > 0 && Math.abs(dy) < 2 && Math.abs(dx) < nearLimit && (mos || !M);

  let standing = false;
  if (isShootType && !bot.isInFleeMode && !M && rangeMax >= Math.abs(dx) && Math.abs(dy) <= 4 && hp > F04
      && Math.abs(dx) > Math.max(f(rangeMin + 1), 2)) {
    if (elapsed < bot.pauseEndTime) standing = true;
    else if (next(c.s.rng, 0, 1) <= SMath.lerp(F035, F015, aggr)) {
      bot.timeSinceLastDestination = elapsed;
      bot.timeRefreshDestination = 0.25;
      return;
    } else {
      const p = SMath.lerp(F08, F02, aggr);
      bot.timeSinceLastDestination = elapsed;
      bot.pauseEndTime = f(elapsed + p);
      bot.timeRefreshDestination = p;
      return;
    }
  }
  if ((attackAsset.type === ActionType.MeleeAttack || attackAsset.type === ActionType.MeleeShoot) && !bot.isInFleeMode && !M) {
    const w = SMath.lerp(0.5, 0, aggr);
    const since = f(elapsed - bot.timeSinceLastAttack);
    if (w > 0 && since <= w && f(w - since) !== 0 && bot.pauseEndTime <= elapsed) {
      bot.timeSinceLastDestination = elapsed;
      bot.pauseEndTime = f(elapsed + f(w - since));
      bot.timeRefreshDestination = 1;
      return;
    }
  }
  if (!standing) {
    if (!bot.isTooClose && !bot.isInFleeMode) chase(c, a, T, dx, rangeMax, elapsed);
    else retreat(c, a, dx, rangeMin, elapsed);
  }
  bot.timeSinceLastDestination = elapsed;
  bot.timeRefreshDestination = a.cooldownAction > 0 ? 1 : F06;
}

function chase(c, a, T, dx, rangeMax, elapsed) {
  const bot = a.bot;
  const nodes = c.map.nav;
  let dest = T;
  if (Math.abs(dx) > f(rangeMax + 4)) {
    let branchActive = elapsed < bot.branchEndTime && !(bot.branchDestination.x === 0 && bot.branchDestination.y === 0);
    if (bot.branchEndTime <= elapsed && next(c.s.rng, 0, 1) < F015 && nodes.length > 0) {
      const start = nextInt(c.s.rng, 0, nodes.length);
      let best = -1;
      let bd = FLOAT_MAX;
      for (let k = 0; k < nodes.length; k++) {
        const i = (start + k) % nodes.length;
        const nd = nodes[i];
        if (nd.type !== NavNodeType.Walkable || Math.abs(f(nd.pos.y - a.pos.y)) > 1) continue;
        const ox = f(nd.pos.x - a.pos.x);
        if (dx > 0 ? ox <= 3 : ox >= -3) continue;
        const d = Vec2.distance(nd.pos, a.pos);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) {
        bot.branchDestination = Vec2.copy(nodes[best].pos);
        bot.branchEndTime = f(f(elapsed + F125) + next(c.s.rng, 0, 1));
        branchActive = true;
      }
    }
    if (branchActive) {
      const passed = dx > 0 ? bot.branchDestination.x < a.pos.x : a.pos.x < bot.branchDestination.x;
      if (Vec2.distance(a.pos, bot.branchDestination) < 2 || passed || Math.abs(dx) <= f(rangeMax + 2)) bot.branchEndTime = 0;
      else dest = bot.branchDestination;
    }
  }
  const moved = Vec2.distance(dest, bot.destination);
  bot.destination = Vec2.copy(dest);
  if (!(moved <= 3 && bot.navCount !== 0)) requestPath(c, a, dest);
}

function retreat(c, a, dx, rangeMin, elapsed) {
  const bot = a.bot;
  const map = c.map;
  let sum = 0;
  let n = 0;
  for (const e of c.s.agents) {
    if (e === a || isSameTeam(c.s, a, e) || isDead(e)) continue;
    if (Vec2.distance(a.pos, e.pos) > 15) continue;
    sum = f(sum + e.pos.x);
    n++;
  }
  const away = n === 0 ? -dx : f(a.pos.x - f(sum / n));
  const dist = bot.isInFleeMode ? 10 : f(rangeMin + 2);
  let x = f(a.pos.x + f((away > 0 ? 1 : -1) * dist));
  if (map.hasNavBounds) x = SMath.clamp(x, f(map.navMinX + FLEE_BORDER_MARGIN), f(map.navMaxX - FLEE_BORDER_MARGIN));
  bot.destination = { x, y: a.pos.y };
  requestPath(c, a, bot.destination);
}

function evaluateFleeBehavior(c, a, target, elapsed) {
  const s = c.s;
  const bot = a.bot;
  const aggr = bot.aggressivity;
  const hp = a.hpMax > 0 ? f(a.hpCurrent / a.hpMax) : 0;
  let lo, hi;
  if (s.goal === GoalType.Kill5 || (s.goal === GoalType.KillBoss && !a.isBoss)) { lo = F02; hi = F01; }
  else if (a.isBoss) { lo = 0.5; hi = F07; }
  else if (s.goal === GoalType.LastSurvivor) { if (a.deathCount < 2) { lo = F02; hi = F06; } else { lo = 0.5; hi = F08; } }
  else { lo = F02; hi = F035; }
  let thr = SMath.lerp(lo, hi, aggr);
  if (has(target, StatusFlags.Special)) thr = f(thr + SMath.lerp(F015, 0, aggr));
  const near = a.isBoss ? 12 : 8;
  let count = 0;
  for (const e of s.agents)
    if (e !== a && !isSameTeam(s, a, e) && !isDead(e) && Vec2.distance(a.pos, e.pos) < near) count++;
  if (count >= 2) thr = f(thr + SMath.lerp(F015, F005, aggr));
  if (hp < thr) {
    if (bot.fleeReactionEndTime === 0) bot.fleeReactionEndTime = f(elapsed + f(4 * bot.reactionTime));
    const shouldFlee = bot.fleeReactionEndTime <= elapsed;
    if (!shouldFlee) { bot.isInFleeMode = false; bot.modeEndTime = 0; }
    else if (bot.modeEndTime <= elapsed) {
      bot.isInFleeMode = !bot.isInFleeMode;
      const dur = bot.isInFleeMode ? SMath.lerp(4, 1, aggr) : SMath.lerp(0.5, 2, aggr);
      bot.modeEndTime = f(elapsed + dur);
    }
  } else {
    bot.fleeReactionEndTime = 0;
    bot.modeEndTime = 0;
    bot.isInFleeMode = false;
  }
}

function tryMoveToHealZone(c, a, elapsed) {
  const bot = a.bot;
  if (!(pct(c) < bot.escapeSkill)) return false;
  for (const b of c.s.bullets) {
    if (!b.alive) continue;
    const src = c.agent(b.source);
    if (!(b.source === a.id || isSameTeam(c.s, a, src))) continue;
    const d = c.db.bullets[b.data];
    if (!(d.tickRate > 0 && d.tickRadius > 0) || b.damageAmount >= 0) continue;
    if (Vec2.distance(b.pos, a.pos) > 20) continue;
    bot.destination = Vec2.copy(b.pos);
    bot.timeSinceLastDestination = elapsed;
    bot.timeRefreshDestination = 1;
    requestPath(c, a, bot.destination);
    return true;
  }
  return false;
}

function tryAvoidDangerZone(c, a, elapsed) {
  const bot = a.bot;
  const map = c.map;
  if (!(pct(c) < bot.escapeSkill)) return false;
  for (const b of c.s.bullets) {
    if (!b.alive) continue;
    const src = c.agent(b.source);
    if (b.source === a.id || isSameTeam(c.s, a, src)) continue;
    const d = c.db.bullets[b.data];
    if (!(d.tickRate > 0 && d.tickRadius > 0) || b.damageAmount <= 0) continue;
    if (Vec2.distance(b.pos, a.pos) > 5) continue;
    let x = f(a.pos.x + (b.pos.x > a.pos.x ? -5 : 5));
    if (map.hasNavBounds) x = SMath.clamp(x, f(map.navMinX + FLEE_BORDER_MARGIN), f(map.navMaxX - FLEE_BORDER_MARGIN));
    bot.destination = { x, y: a.pos.y };
    bot.timeSinceLastDestination = elapsed;
    bot.timeRefreshDestination = 1;
    requestPath(c, a, bot.destination);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- escape + steering (every tick)

function resolveEscape(c, a, elapsed) {
  const bot = a.bot;
  const map = c.map;
  if (bot.escapeCooldown > 0) {
    if (!a.grounded) bot.isEscaping = false;
    return;
  }
  if (!a.grounded) { bot.isEscaping = false; return; }
  let threat = null;
  for (const b of c.s.bullets) {
    if (!b.alive) continue;
    if (b.source === a.id || isSameTeam(c.s, a, c.agent(b.source))) continue;
    const d = c.db.bullets[b.data];
    const dist = Vec2.distance(b.pos, a.pos);
    const zone = d.tickRate > 0 && d.tickRadius > 0 && b.damageAmount > 0 && dist < f(d.tickRadius + 1);
    const shot = d.tickRate === 0 && b.damageAmount > 0 && dist < 4 && Math.abs(f(b.pos.y - a.pos.y)) < 2;
    if (zone || shot) { threat = b; break; }
  }
  if (threat == null) {
    bot.escapeReactionEndTime = 0;
    if (!map.hasNavBounds) { bot.isEscaping = false; return; }
    if (a.pos.x < f(map.navMinX + BORDER_MARGIN)) { bot.escapeDirectionX = 1; bot.isEscaping = true; }
    else if (a.pos.x > f(map.navMaxX - BORDER_MARGIN)) { bot.escapeDirectionX = -1; bot.isEscaping = true; }
    else bot.isEscaping = false;
    return;
  }
  const away = threat.pos.x < a.pos.x ? 1 : -1;
  if (bot.escapeReactionEndTime === 0) bot.escapeReactionEndTime = f(elapsed + f(F015 * bot.reactionTime));
  if (bot.escapeReactionEndTime <= elapsed) {
    bot.escapeDirectionX = chooseEscapeDirection(c, a, away);
    bot.isEscaping = true;
    bot.escapeReactionEndTime = f(elapsed + bot.reactionTime);
    if (!headroomBlocked(c, a) && pct(c) < bot.escapeSkill) {
      a.jump = true;
      bot.escapeCooldown = f(SMath.lerp(1, 0.5, bot.aggressivity) + next(c.s.rng, 0, F02));
    }
  }
}

function chooseEscapeDirection(c, a, pref) {
  const knee = Vec2.add(a.pos, { x: 0, y: 1 });
  if (linecast(c, knee, Vec2.add(knee, { x: pref, y: 0 })) && !linecast(c, knee, Vec2.add(knee, { x: -pref, y: 0 }))) return -pref;
  return pref;
}

function resolveDirX(a, dx) {
  const want = dx > 0 ? 1 : -1;
  if (a.grounded) return want;
  const cur = a.directionX;
  if (cur === 0 || cur === want) return want;
  if (Math.abs(dx) >= f(AIR_DIR_FLIP_MARGIN + f(0.5 * SMath.clamp01(a.bot.reactionTime)))) return want;
  return cur;
}

function steer(a, dx, actionFrame) {
  if (!actionFrame && dx !== 0) a.directionX = dx > 0 ? 1 : -1;
}

function applyMovement(c, a, elapsed) {
  const bot = a.bot;
  const nodes = c.map.nav;
  const actionFrame = a.action || a.special;
  if (elapsed < bot.pauseEndTime && !bot.isEscaping && a.grounded) {
    if (!actionFrame) a.directionX = 0;
    return;
  }
  if (a.isDashing && !a.actionHeld && !a.specialHeld) return;
  if (bot.isEscaping) {
    if (!actionFrame) a.directionX = bot.escapeDirectionX;
    return;
  }
  bot.stuckTimer = f(bot.stuckTimer - c.dt);
  if (bot.stuckTimer <= 0) {
    bot.stuckTimer = NAV_STUCK_INTERVAL;
    if (bot.navCount > 0 && a.grounded && Math.abs(f(a.pos.x - bot.lastPos.x)) < 0.5 && Math.abs(f(a.pos.y - bot.lastPos.y)) < 0.5)
      bot.navCount = 0;
    bot.lastPos = Vec2.copy(a.pos);
  }
  if (bot.navCount !== 0 && bot.navIndex < bot.navCount) {
    const idx = bot.navPath[bot.navIndex];
    if (idx < 0 || idx >= nodes.length) { bot.navCount = 0; return; }
    const node = nodes[idx];
    const x = a.pos.x, y = a.pos.y;
    switch (node.type) {
      case NavNodeType.Fall: {
        const dxN = f(node.pos.x - x);
        if (Math.abs(dxN) >= NAV_ACCURACY && a.grounded) { steer(a, dxN, actionFrame); return; }
        bot.navIndex++;
        if (bot.navIndex < bot.navCount) {
          steer(a, f(nodes[bot.navPath[bot.navIndex]].pos.x - x), actionFrame);
          return;
        }
        break;
      }
      case NavNodeType.Jump: {
        const nxt = bot.navIndex + 1 < bot.navCount ? nodes[bot.navPath[bot.navIndex + 1]] : null;
        const span = nxt != null ? f(nxt.pos.x - node.pos.x) : 0;
        const awayN = nxt != null ? Math.abs(f(x - nxt.pos.x)) : 0;
        const dj = f(node.pos.x - x);
        const trigger = SMath.clamp(
          f(next(c.s.rng, SMath.lerp(JUMP_TRIGGER_LOW_SKILL, JUMP_TRIGGER_HIGH_SKILL, bot.aggressivity), JUMP_TRIGGER_LOW_SKILL) * awayN),
          JUMP_ACCURACY_MIN, JUMP_ACCURACY_MAX);
        const near = Math.abs(dj) < trigger;
        if (!actionFrame) {
          if (near || !a.grounded) { if (span !== 0) a.directionX = span > 0 ? 1 : -1; }
          else steer(a, dj, false);
        }
        if (near && a.grounded) a.jump = true;
        if (a.grounded) return;
        if (Math.abs(f(y - node.pos.y)) >= 1 || Math.abs(f(x - node.pos.x)) >= JUMP_ACCURACY_MIN) return;
        bot.navIndex++;
        break;
      }
      default: {
        const dxN = f(node.pos.x - x), dyN = f(node.pos.y - y);
        let closeX = Math.abs(dxN) < NAV_ACCURACY, closeY = Math.abs(dyN) < NAV_ACCURACY;
        if (bot.navIndex + 1 < bot.navCount) {
          const nxt = nodes[bot.navPath[bot.navIndex + 1]];
          if (nxt.type === NavNodeType.Walkable) {
            const passed = Math.abs(f(nxt.pos.x - x)) < f(Math.abs(f(node.pos.x - nxt.pos.x)) + Math.abs(dxN));
            closeX = closeX || passed;
            closeY = closeY || passed;
          }
        }
        if (!(closeX && closeY)) {
          if (!actionFrame) a.directionX = resolveDirX(a, dxN);
          return;
        }
        bot.navIndex++;
        break;
      }
    }
    if (bot.navIndex >= bot.navCount) { bot.navIndex = 0; bot.navCount = 0; }
    return;
  }
  let dest = bot.destination;
  if (dest.y > f(a.pos.y + 1) && nodes.length > 0) {
    const j = bestJumpNodeToward(nodes, a.pos, dest);
    if (j >= 0) dest = nodes[j].pos;
  }
  applyDirectMovement(c, a, dest, actionFrame);
}

function applyDirectMovement(c, a, dest, actionFrame) {
  const dx = f(dest.x - a.pos.x);
  if (Math.abs(dx) < F03) {
    if (!actionFrame) a.directionX = 0;
    return;
  }
  const dir = resolveDirX(a, dx);
  if (a.grounded && !a.jump) {
    const knee = Vec2.add(a.pos, { x: 0, y: 1 });
    if (linecast(c, knee, Vec2.add(knee, { x: f(F08 * dir), y: 0 })) && !headroomBlocked(c, a)) a.jump = true;
  }
  if (!actionFrame) a.directionX = dir;
}

export const BotBrain = Object.freeze({ desiredAsInput, resetBotState, think });
