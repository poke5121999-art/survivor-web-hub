// AgentActionSystem: attack / special state machine, melee, shoot and buff events (spec Part 3).
import { f, SMath, Vec2 } from '../Core/Vec2.js';
import { next } from '../Core/SimRng.js';
import { ActionType, GamePhase, PowerType, StatusFlags } from '../Data/Enums.js';
import { SimEventType } from '../State/SimEvent.js';
import { has, hpRatio, hasPower, power } from '../State/MatchState.js';
import { SimConst, isSameTeam, agentCenter, agentHitRadius } from './GameRules.js';
import { addTimedFlag, applyDamage, applyHeal, levelCoef } from './LifeSystem.js';
import { spawnBullet } from './BulletSystem.js';

const F01 = f(0.1);
const ANIM_FPS = SimConst.AnimFps;

export function update(c, a) {
  if (c.s.phase !== GamePhase.Playing) return;
  if (a.isDummy && a.actionRef < 0) return;
  if ((a.flags & (StatusFlags.Dead | StatusFlags.Freeze)) !== 0) return;
  const dt = c.dt;
  if (a.cooldownAction > 0) a.cooldownAction = f(a.cooldownAction - dt);
  if (a.cooldownSpecial > 0) a.cooldownSpecial = f(a.cooldownSpecial - dt);

  if (!a.isBusy) {
    tryStartAction(c, a);
    updateSpeedMultiplier(c, a);
    return;
  }
  if (!a.currentIsSpecial) {
    if (tryStartSpecial(c, a)) { updateSpeedMultiplier(c, a); return; }
  } else if (tryStartActionAfterSpecial(c, a)) { updateSpeedMultiplier(c, a); return; }

  if (!a.isActioning) {
    advanceActionTimer(c, a);
    updateSpeedMultiplier(c, a);
    return;
  }
  const held = a.currentIsSpecial ? a.specialHeld : a.actionHeld;
  if (!held) { endAction(c, a); updateSpeedMultiplier(c, a); return; }
  advanceActionTimer(c, a);
  updateSpeedMultiplier(c, a);
}

const current = (c, a) => c.act(a.currentIsSpecial ? a.specialRef : a.actionRef);

function tryStartAction(c, a) {
  if (tryStartSpecial(c, a)) return;
  if (!(a.action || a.actionHeld)) return;
  const asset = c.act(a.actionRef);
  if (a.cooldownAction > 0 || asset == null) return;
  if (!asset.hold) startAction(c, a, asset, false);
  else if (a.actionHeld) startHoldAction(c, a, asset, false);
}

function tryStartSpecial(c, a) {
  if (a.cooldownSpecial > 0) return false;
  const asset = c.act(a.specialRef);
  if (asset == null) return false;
  if (!hasPower(a, PowerType.SpecialUnlocked)) return false;
  if (!asset.hold) {
    if (!a.special) return false;
    if (asset.damage < 0 && asset.type === ActionType.Buff && a.hpCurrent >= a.hpMax) return false;
    if (a.isBusy) endAction(c, a);
    startAction(c, a, asset, true);
    return true;
  }
  if (!a.specialHeld) return false;
  if (a.isBusy) endAction(c, a);
  startHoldAction(c, a, asset, true);
  return true;
}

function resetActionState(a, isSpecial) {
  a.isBusy = true;
  a.isActioning = false;
  a.actionTimer = 0;
  a.actionEventIndex = 0;
  a.meleeWindowOpen = false;
  a.currentIsSpecial = isSpecial;
}

function resetActionCooldownIfModeChange(a, asset) {
  if ((asset.statusAddFlags & (StatusFlags.Angry | StatusFlags.MeleeMode)) !== 0) a.cooldownAction = 0;
}

function startAction(c, a, asset, isSpecial) {
  if (has(a, StatusFlags.Invisibility)) {
    // attacking breaks invisibility and arms the next-hit leach
    a.flags = (a.flags & ~(StatusFlags.Invisibility | StatusFlags.Special | StatusFlags.NextAttackLeach)) | StatusFlags.NextAttackLeach;
  }
  applyTimedStatusFlags(a, asset);
  if (isSpecial) {
    resetActionState(a, true);
    a.cooldownSpecial = a.cooldownSpecialMax;
    resetActionCooldownIfModeChange(a, asset);
  } else {
    updateCooldownActionMax(a, asset);
    resetActionState(a, false);
    a.cooldownAction = a.cooldownActionMax;
  }
  if (asset.dashDuration > 0 && Vec2.magnitude(asset.dashDirection) > 0) {
    a.isDashing = true;
    a.dashTimer = asset.dashDuration;
    a.dashDirection = Vec2.copy(asset.dashDirection);
    a.dashIgnoreGravity = asset.dashIgnoreGravity;
    a.dashBackwards = asset.dashBackwards;
    if (hasPower(a, PowerType.DashIgnoreDamage)) addTimedFlag(a, StatusFlags.Invincibility, asset.dashDuration, 'invincibilityTimer');
  }
  c.emit(SimEventType.AgentActionStarted, { agent: a.id, flag: isSpecial, i: asset.index });
}

function startHoldAction(c, a, asset, isSpecial) {
  if (isSpecial) {
    resetActionState(a, true);
    a.isActioning = true;
    a.cooldownSpecial = a.cooldownSpecialMax;
    resetActionCooldownIfModeChange(a, asset);
  } else {
    updateCooldownActionMax(a, asset);
    resetActionState(a, false);
    a.isActioning = true;
    a.cooldownAction = a.cooldownActionMax;
  }
  if (asset.type === ActionType.MeleeAttack && asset.meleeWindows.length === 0) {
    a.meleeWindowOpen = true;
    clearMeleeHits(a);
    c.emit(SimEventType.AgentMeleeWindowOpened, { agent: a.id });
  }
  if (asset.statusAddFlags !== 0) a.flags |= asset.statusAddFlags;
  c.emit(SimEventType.AgentActionStarted, { agent: a.id, flag: isSpecial, i: asset.index });
}

function tryStartActionAfterSpecial(c, a) {
  if (!(a.action || a.actionHeld)) return false;
  if (a.cooldownAction > 0 || a.actionRef < 0) return false;
  const sp = c.act(a.specialRef);
  if (sp == null || sp.hold || sp.clearStatusOnEnd) return false;
  if (!payloadDelivered(a, sp, f(a.actionTimer * ANIM_FPS))) return false;
  const act = c.act(a.actionRef);
  if (act == null) return false;
  endAction(c, a);
  if (!act.hold) startAction(c, a, act, false);
  else if (a.actionHeld) startHoldAction(c, a, act, false);
  return true;
}

function payloadDelivered(a, asset, elapsed) {
  if (a.meleeWindowOpen) return false;
  switch (asset.type) {
    case ActionType.Shoot: return a.actionEventIndex >= asset.shoots.length;
    case ActionType.MeleeAttack: return asset.meleeWindows.length === 0 ? a.actionEventIndex > 0 : a.actionEventIndex >= asset.meleeWindows.length;
    case ActionType.Buff: return a.actionEventIndex >= asset.buffs.length;
    default: {
      let last = 0;
      for (const s of asset.shoots) last = Math.max(last, s.frame);
      for (const w of asset.meleeWindows) last = Math.max(last, w.frameEnd);
      return last < elapsed;
    }
  }
}

export function endAction(c, a) {
  const asset = current(c, a);
  if (asset != null && asset.clearStatusOnEnd && asset.statusAddFlags !== 0) a.flags &= ~asset.statusAddFlags;
  a.isBusy = false;
  a.isActioning = false;
  a.actionTimer = 0;
  a.actionEventIndex = 0;
  a.meleeWindowOpen = false;
  c.emit(SimEventType.AgentActionEnded, { agent: a.id });
}

function advanceActionTimer(c, a) {
  const asset = current(c, a);
  if (asset == null) { endAction(c, a); return; }
  a.actionTimer = f(a.actionTimer + c.dt);
  let elapsed = f(a.actionTimer * ANIM_FPS);
  switch (asset.type) {
    case ActionType.Shoot:
      processShootEvents(c, a, asset, elapsed);
      break;
    case ActionType.MeleeAttack:
      if (!asset.hold || asset.meleeWindows.length > 0) elapsed = processMeleeEvents(c, a, asset, elapsed);
      if (a.meleeWindowOpen) applyMeleeDamage(c, a, asset);
      break;
    case ActionType.Buff:
      processBuffEvents(c, a, asset, elapsed);
      break;
    case ActionType.MeleeShoot: {
      const isMelee = has(a, StatusFlags.MeleeMode);
      if (!asset.requiresMeleeMode || isMelee) {
        if (!asset.hold || asset.meleeWindows.length > 0) elapsed = processMeleeEvents(c, a, asset, elapsed);
        if (a.meleeWindowOpen) applyMeleeDamage(c, a, asset);
      }
      if (!isMelee) processShootEventsStateless(c, a, asset, elapsed);
      break;
    }
  }
  let total = asset.totalFrames;
  if (asset.hold && total === 0) return;
  if (total < 2) total = 1;
  if (elapsed < total) return;
  if (a.meleeWindowOpen) {
    a.meleeWindowOpen = false;
    c.emit(SimEventType.AgentMeleeWindowClosed, { agent: a.id });
  }
  endAction(c, a);
}

function processShootEvents(c, a, asset, elapsed) {
  let shoots = asset.shoots;
  let extra = 0;
  if (!a.currentIsSpecial && hasPower(a, PowerType.BulletNumberBoost)) {
    if (asset.shootsBoosted.length > 0) shoots = asset.shootsBoosted;
    else {
      const v = power(a, PowerType.BulletNumberBoost);
      if (v >= 1) extra = Math.floor(v);
      else if (v > 0) extra = next(c.s.rng, 0, 1) < v ? 1 : 0;
    }
  }
  for (let i = a.actionEventIndex; i < shoots.length; i++) {
    const ev = shoots[i];
    if (elapsed < ev.frame) break;
    c.emit(SimEventType.AgentShootTriggered, { agent: a.id, value: ev.angleOffset, value2: ev.offsetY, flag: a.currentIsSpecial });
    spawnBullet(c, a, asset, ev, a.currentIsSpecial, extra);
    a.actionEventIndex = i + 1;
  }
}

function processShootEventsStateless(c, a, asset, elapsed) {
  const prev = f(elapsed - f(ANIM_FPS * c.dt));
  for (const ev of asset.shoots) {
    if (!(prev < ev.frame && ev.frame <= elapsed)) continue;
    if (ev.requiresShootMode && !has(a, StatusFlags.Angry)) continue;
    c.emit(SimEventType.AgentShootTriggered, { agent: a.id, value: ev.angleOffset, value2: ev.offsetY, flag: a.currentIsSpecial });
    spawnBullet(c, a, asset, ev, a.currentIsSpecial, 0);
  }
}

function clearMeleeHits(a) {
  for (let i = 0; i < 4; i++) a.meleeHit[i] = -1;
}

// C# takes elapsed by ref; the new value is returned
function processMeleeEvents(c, a, asset, elapsed) {
  const w = asset.meleeWindows;
  if (w.length === 0) {
    if (a.actionEventIndex !== 0) return elapsed;
    a.meleeWindowOpen = true;
    clearMeleeHits(a);
    c.emit(SimEventType.AgentMeleeWindowOpened, { agent: a.id });
    a.actionEventIndex = 1;
    return elapsed;
  }
  if (asset.hold && asset.totalFrames === 0 && a.actionEventIndex >= w.length) {
    if (elapsed >= w[w.length - 1].frameEnd) {
      a.actionTimer = 0;
      a.actionEventIndex = 0;
      elapsed = 0;
    }
    return elapsed;
  }
  while (a.actionEventIndex < w.length) {
    const cur = w[a.actionEventIndex];
    if (!a.meleeWindowOpen) {
      if (elapsed < cur.frameStart) return elapsed;
      a.meleeWindowOpen = true;
      clearMeleeHits(a);
      c.emit(SimEventType.AgentMeleeWindowOpened, { agent: a.id });
    } else {
      if (elapsed < cur.frameEnd) return elapsed;
      a.meleeWindowOpen = false;
      c.emit(SimEventType.AgentMeleeWindowClosed, { agent: a.id });
      a.actionEventIndex++;
    }
  }
  return elapsed;
}

function meleeAlreadyHit(a, id) {
  for (let i = 0; i < 4; i++) if (a.meleeHit[i] === id) return true;
  return false;
}

function addMeleeHit(a, id) {
  for (let i = 0; i < 4; i++) if (a.meleeHit[i] < 0) { a.meleeHit[i] = id; return; }
  a.meleeHit[3] = id;
}

function applyMeleeDamage(c, a, asset) {
  if (asset.damage <= 0) return;
  const facing = a.facingLeft ? -1 : 1;
  let offX = asset.meleeOffset.x;
  if (offX <= 0) offX = 2;
  let size = asset.meleeSize.x;
  if (size <= 0) size = 1.5;
  if (a.isBoss) { offX = f(offX * SimConst.BossScale); size = f(size * SimConst.BossScale); }
  const center = agentCenter(c.db, a);
  const hit = { x: f(a.pos.x + f(offX * facing)), y: f(asset.meleeOffset.y + center.y) };
  for (const t of c.s.agents) {
    if (t === a || isSameTeam(c.s, a, t)) continue;
    if ((t.flags & (StatusFlags.Dead | StatusFlags.Invincibility)) !== 0) continue;
    if (meleeAlreadyHit(a, t.id)) continue;
    const tc = agentCenter(c.db, t);
    const r = agentHitRadius(c.db, t);
    if (Vec2.distance(hit, tc) > f(r + size)) continue;
    const contact = { x: f(f(hit.x + tc.x) * 0.5), y: f(f(hit.y + tc.y) * 0.5) };
    const dealt = applyDamage(c, t, a.id, asset.damage, contact, false, 0, false);
    if (dealt > 0 && has(a, StatusFlags.Angry)) {
      const sp = c.act(a.specialRef);
      if (sp != null && sp.meleeDrainRate > 0) applyHeal(c, a, f(sp.meleeDrainRate * dealt), true);
    }
    let pd = asset.pushBackDuration;
    const pe = asset.pushBackEffect;
    if (pd <= 0 && pe > 0 && power(a, PowerType.PushBack) > 0) pd = power(a, PowerType.PushBack);
    if (pd > 0 && pe > 0) {
      const dir = a.pos.x < tc.x ? 1 : -1;
      t.isPushback = true;
      t.pushbackTimer = pd;
      t.pushbackValue = f(pe * dir);
    }
    addMeleeHit(a, t.id);
  }
}

function processBuffEvents(c, a, asset, elapsed) {
  for (let i = a.actionEventIndex; i < asset.buffs.length; i++) {
    if (elapsed < asset.buffs[i]) break;
    if (asset.damage < 0) applyHeal(c, a, f(-asset.damage * levelCoef(a)), true);
    applyTimedStatusFlags(a, asset);
    c.emit(SimEventType.AgentBuffTriggered, { agent: a.id });
    a.actionEventIndex = i + 1;
  }
}

function applyTimedStatusFlags(a, asset) {
  const fl = asset.statusAddFlags;
  if (fl === 0) return;
  let dur = asset.statusDuration;
  if (!asset.clearStatusOnEnd && dur <= 0) return;
  const b = power(a, PowerType.BuffDurationBoost);
  if (b > 0) dur = f(dur * f(1 + b));
  applyStatusFlag(a, fl, StatusFlags.Special, dur, 'specialTimer');
  applyStatusFlag(a, fl, StatusFlags.Invincibility, dur, 'invincibilityTimer');
  applyStatusFlag(a, fl, StatusFlags.Angry, dur, 'angryTimer');
  applyStatusFlag(a, fl, StatusFlags.Invisibility, dur, 'invisibilityTimer');
  applyStatusFlag(a, fl, StatusFlags.SlowDown, dur, 'slowDownTimer');
  if ((fl & StatusFlags.MeleeMode) !== 0) a.flags |= StatusFlags.MeleeMode;
}

function applyStatusFlag(a, fl, flag, dur, key) {
  if ((fl & flag) === 0) return;
  if (dur > 0) addTimedFlag(a, flag, dur, key);
  a.flags |= flag;
}

/** UpdateCooldownActionMax: Cooldown x Clamp(1 - sum of cooldown boosts, 0.1, 1). */
export function updateCooldownActionMax(a, asset) {
  if (asset.cooldown <= 0) return;
  const hp = hpRatio(a);
  let boost = power(a, PowerType.CooldownBoost);
  const low = power(a, PowerType.CooldownBoostOnLowLife);
  if (low > 0 && hp < SimConst.LowLife) boost = f(boost + low);
  const high = power(a, PowerType.CooldownBoostOnHighLife);
  if (high > 0 && hp > SimConst.HighLife) boost = f(boost + high);
  a.cooldownActionMax = f(SMath.clamp(f(1 - boost), F01, 1) * asset.cooldown);
}

function updateSpeedMultiplier(c, a) {
  a.speedMultiplier = 1;
  let v = power(a, PowerType.SpeedBoost);
  if (v > 0) a.speedMultiplier = f(a.speedMultiplier + v);
  if (a.hpMax > 0) {
    const hp = f(a.hpCurrent / a.hpMax);
    v = power(a, PowerType.SpeedBoostOnLowLife);
    if (v > 0 && hp < SimConst.LowLife) a.speedMultiplier = f(a.speedMultiplier + v);
    v = power(a, PowerType.SpeedBoostOnHighLife);
    if (v > 0 && hp > SimConst.HighLife) a.speedMultiplier = f(a.speedMultiplier + v);
  }
  if (a.isBusy && a.isActioning) {
    const cur = current(c, a);
    if (cur != null && cur.slowdownEffect > 0 && !has(a, StatusFlags.Angry)) a.speedMultiplier = f(a.speedMultiplier * f(1 - cur.slowdownEffect));
  }
  if (has(a, StatusFlags.Special)) {
    const sp = c.act(a.specialRef);
    if (sp != null && sp.specialSpeedBoost > 0) a.speedMultiplier = f(a.speedMultiplier * f(1 + sp.specialSpeedBoost));
  }
}

export const ActionSystem = Object.freeze({ update, endAction, updateCooldownActionMax });
