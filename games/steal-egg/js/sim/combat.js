// Player health, attack, hit-stun, knockback, death and revive, rules/combat.md.
// player.combat.state: ok -> knock (1.0 s thrown 50 m/s away from the hitter) -> hitme (2.0 s down) -> ok
//                      ok -> dying (stunDuration 3.0 s ragdoll) -> dead (panel "You are  died", world frozen)
//                      dead -> ok by Revive me (ad, in place) or No thanks (back to startpos), both with full health.
// A rival swing that connects always costs 1 HP (weapon does not matter); the player's swing knocks a rival out for
// 0.3 + 10 s and pays +100 coins. While stunned the player takes no damage.
import { carriedBy } from './items.js';
import { stunRival, onConfirmedPlayerHit, onPlayerDied } from './rivals.js';
import { playerCrossBlocked } from './gates.js';
import { copy } from './util.js';

export const COMBAT = Object.freeze({ OK: 'ok', KNOCK: 'knock', HITME: 'hitme', DYING: 'dying', DEAD: 'dead' });

export function newCombat() {
  return { state: COMBAT.OK, t: 0, dir: [0, 0] };
}

// PlayerManager.Attack: one swing per tap; weapon colliders on from 0.3 s until the swing clip ends (EndAttack).
export function playerAttack(sim) {
  const p = sim.state.actors[0];
  if (p.attack || p.combat.state !== COMBAT.OK) return false;
  p.attack = { t: 0, hits: [] };
  sim.emit('attack', { actor: 0 });
  return true;
}

export function stepCombat(sim, dt) {
  const s = sim.state, p = s.actors[0], c = sim.D.code, P = sim.D.player;
  if (p.attack) {
    p.attack.t += dt;
    if (p.attack.t >= c.playerAttackDelay && p.attack.t < P.attackEnd) {
      // PLACEHOLDER player.attackReach (data/game.json placeholders): the hand weapon collider was not measured.
      const reach = sim.D.placeholders.find(x => x.key === 'player.attackReach').value;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (let a = 1; a < s.actors.length; a++) {
        const r = s.actors[a];
        if (r.brain.stun || p.attack.hits.includes(a)) continue;
        const dx = r.pos[0] - p.pos[0], dz = r.pos[2] - p.pos[2];
        if (Math.hypot(dx, dz) > reach + sim.D.rivals[a - 1].radius || dx * fx + dz * fz < 0) continue;
        p.attack.hits.push(a);
        if (stunRival(sim, a)) {
          sim.addCoins(c.rivalKnockoutCoins, 'knockout');
          sim.emit('hit', { attacker: 0, target: a });
        }
      }
    }
    if (p.attack.t >= P.attackEnd) p.attack = null;
  }
  const cb = p.combat;
  cb.t += dt;
  if (cb.state === COMBAT.KNOCK) {
    // KnockbackRoutine: horizontal distance/time m/s for `time` seconds, sliding on the navmesh.
    const v = c.knockbackDistance / c.knockbackTime;
    const to = [p.pos[0] + cb.dir[0] * v * dt, p.pos[1], p.pos[2] + cb.dir[1] * v * dt];
    const next = sim.nav.clampMove(p.pos, to);
    if (!playerCrossBlocked(sim, p.pos, next)) p.pos = next;
    if (cb.t >= c.knockbackTime) { cb.state = COMBAT.HITME; cb.t = 0; }
  } else if (cb.state === COMBAT.HITME && cb.t >= c.hitmeWait) {
    cb.state = COMBAT.OK; cb.t = 0;
    p.stunUntil = 0;
    sim.emit('recover', { actor: 0 });
  } else if (cb.state === COMBAT.DYING && cb.t >= P.stun) {
    cb.state = COMBAT.DEAD; cb.t = 0;
    sim.emit('deathPanel', {});
  }
}

// PlayerManager.OnTriggerEnter with a rival weapon ("enemyBat").
export function playerHitByRival(sim, a) {
  const p = sim.state.actors[0], c = sim.D.code;
  onConfirmedPlayerHit(sim, a);               // the relay runs before the stun test
  if (p.combat.state !== COMBAT.OK) return;
  p.hp -= c.playerDamage;
  sim.emit('hit', { attacker: a, target: 0, hp: p.hp });
  dropHeldBrainrot(sim);
  p.attack = null;
  if (p.hp < 1) {
    p.combat = { state: COMBAT.DYING, t: 0, dir: [0, 0] };
    p.stunUntil = 1e9;
    sim.emit('death', { actor: 0 });
    onPlayerDied(sim);
    return;
  }
  const r = sim.state.actors[a].pos;
  let dx = p.pos[0] - r[0], dz = p.pos[2] - r[2];
  const L = Math.hypot(dx, dz);
  if (L <= 1e-5) { dx = 0; dz = 0; } else { dx /= L; dz /= L; }
  p.combat = { state: COMBAT.KNOCK, t: 0, dir: [dx, dz] };
  p.stunUntil = sim.state.t + c.knockbackTime + c.hitmeWait;
  sim.emit('stun', { actor: 0, until: p.stunUntil, dir: [dx, dz] });
}

// A held brainrot (PlayerManager.CurrentMemeRot) falls at the player's feet on every hit that does not take it.
function dropHeldBrainrot(sim) {
  const id = carriedBy(sim, 0), it = id && sim.state.items[id];
  if (!it || it.kind !== 'brainrot') return;
  sim.state.actors[0].carry = null;
  it.at = { ground: sim.nav.closest(sim.state.actors[0].pos) };
  sim.emit('drop', { actor: 0, item: id, kind: 'brainrot', pos: copy(it.at.ground) });
}

// Revive me (rewarded ad -> OnWatchAds at once) / No thanks (respawn at startpos).
export function revive(sim, atStart) {
  const p = sim.state.actors[0];
  if (p.combat.state !== COMBAT.DEAD) return false;
  p.combat = { state: COMBAT.OK, t: 0, dir: [0, 0] };
  p.hp = sim.D.player.hp;
  p.stunUntil = 0;
  if (atStart) {
    const st = sim.nav.closest(sim.D.player.start);
    p.pos = st;
    p.yaw = sim.D.player.startYaw;
  }
  sim.emit('revive', { actor: 0, atStart: !!atStart, hp: p.hp });
  return true;
}

// GetHealth.GetPlayerHealth (ad panel shown while health is not full).
export function refillHealth(sim) {
  const p = sim.state.actors[0];
  if (p.hp >= sim.D.player.hp || p.combat.state === COMBAT.DEAD) return false;
  p.hp = sim.D.player.hp;
  sim.emit('health', { hp: p.hp });
  return true;
}

export const isPaused = sim => sim.state.actors[0].combat.state === COMBAT.DEAD;

