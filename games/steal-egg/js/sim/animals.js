// Nest animals (AnimalEggController + AnimalHitTrigger), rules/animals-eggs.md.
// State machine (AnimalEggState): sleep -> chase (an egg of this animal was stolen) -> return (egg secured, placed or
// dropped) -> sleep at the home point. Only a theft wakes an animal; there is no territory alarm and no chase leash.
// A hit while chasing makes the thief DROP the egg where it stands (no return to nest).
// Batches: 2-3 eggs, no repeated prefab inside a batch; the next batch comes eggRespawnDelay (30 s) after the last
// egg of the batch was secured or committed to a farm.
import { agentTo, agentStop } from './agent.js';
import { newItem, removeItem, where, LOC, carriedBy, dropEgg } from './items.js';
import { insideUnitCircle, randInt, d2xz, copy } from './util.js';
import { rivalHitByAnimal } from './rivals.js';

export const ANIMAL = Object.freeze({ SLEEP: 'sleep', CHASE: 'chase', RETURN: 'return' });

export function initAnimals(sim) {
  sim.state.animals = sim.D.animals.map(def => ({
    state: ANIMAL.SLEEP, pos: copy(def.pos), yaw: def.yaw, target: null, egg: null, stolen: [], nests: {},
    respawnAt: null, nextHit: 0, nav: null, moving: false,
  }));
  sim.D.animals.forEach((def, i) => spawnInitialBatch(sim, i));
}

const batchSize = (sim, def) => randInt(sim.state, Math.max(1, def.batch[0]), Math.max(def.batch[0], def.batch[1]) + 1);

// GetRandomEggPrefab: uniform, removed from the per-batch list (no repeat inside a batch).
function takePrefab(sim, list, def) {
  if (!list.length) list.push(...def.pool);
  const i = randInt(sim.state, 0, list.length);
  return list.splice(i, 1)[0];
}

function spawnEgg(sim, i, slot, eggType, pos) {
  const an = sim.state.animals[i];
  an.nests[slot] = copy(pos);
  const id = newItem(sim, { kind: 'egg', eggType, at: { nest: i, slot }, owner: i, secured: false, reservedBy: null,
    waitExit: false, readyAt: null, ready: false, hatch: null });
  return id;
}

// FindRandomGroundPosition: offset |v| in [0.4, 1] * extraEggSpawnRadius, spaced minimumEggSpacing from live eggs,
// 15 tries then the last candidate anyway; snapped to the floor + eggGroundOffset.
function randomGroundPos(sim, i) {
  const def = sim.D.animals[i], c = def.eggCenter, inner = sim.D.code.eggSpawnInnerRadius;
  let cand = null;
  for (let k = 0; k < Math.max(1, def.attempts); k++) {
    let [x, y] = insideUnitCircle(sim.state);
    const m = Math.hypot(x, y);
    if (m * m < inner * inner) {
      if (m <= 1e-5) { x = inner; y = 0; } else { x = x / m * inner; y = y / m * inner; }
    }
    const p = sim.nav.closest([c[0] + def.spawnRadius * x, c[1], c[2] + def.spawnRadius * y]);
    cand = [p[0], p[1] + def.groundOffset, p[2]];
    if (activeEggs(sim, i).every(id => d2xz(eggWorld(sim, id), cand) >= def.spacing * def.spacing)) break;
  }
  return cand;
}

const eggWorld = (sim, id) => {
  const it = sim.state.items[id];
  return where(it) === LOC.NEST ? sim.state.animals[it.at.nest].nests[it.at.slot] : it.at.ground || it.at.pos || sim.state.actors[it.at.carried].pos;
};

// CleanupActiveEggs: the eggs this animal still owns (nest, dropped, or carried unsecured).
export function activeEggs(sim, i) {
  return Object.keys(sim.state.items).filter(id => {
    const it = sim.state.items[id];
    return it.kind === 'egg' && it.owner === i;
  });
}

function spawnInitialBatch(sim, i) {
  const def = sim.D.animals[i], n = batchSize(sim, def), list = [...def.pool];
  const ids = [];
  if (def.startingEgg) ids.push(spawnEgg(sim, i, 0, def.startingEgg.egg, def.eggCenter));
  else ids.push(spawnEgg(sim, i, 0, takePrefab(sim, list, def), def.eggCenter));
  for (let k = 1; k < n; k++) ids.push(spawnEgg(sim, i, k, takePrefab(sim, list, def), randomGroundPos(sim, i)));
  refreshCurrentEgg(sim, i);
  sim.emit('eggBatch', { animal: i, items: ids });
}

function spawnBatch(sim, i, n) {
  const def = sim.D.animals[i], an = sim.state.animals[i];
  an.nests = {};
  an.stolen = [];
  const list = [...def.pool], ids = [];
  ids.push(spawnEgg(sim, i, 0, takePrefab(sim, list, def), def.eggCenter));
  for (let k = 1; k < Math.max(1, n); k++) ids.push(spawnEgg(sim, i, k, takePrefab(sim, list, def), randomGroundPos(sim, i)));
  refreshCurrentEgg(sim, i);
  sim.emit('eggBatch', { animal: i, items: ids, respawn: true });
}

function refreshCurrentEgg(sim, i) {
  sim.state.animals[i].egg = activeEggs(sim, i)[0] || null;
}

// --- notifications from items.js ------------------------------------------------------------------------------------

export function onEggStolen(sim, i, egg, actor) {
  const an = sim.state.animals[i], it = sim.state.items[egg];
  if (!it || it.secured) return;
  const k = an.stolen.findIndex(e => e[0] === egg);
  if (k >= 0) an.stolen[k][1] = actor; else an.stolen.push([egg, actor]);
  an.egg = egg;
  refreshChaseOrReturnHome(sim, i);
}

export function onEggDroppedOutside(sim, i, egg) {
  const an = sim.state.animals[i];
  an.stolen = an.stolen.filter(e => e[0] !== egg);
  refreshChaseOrReturnHome(sim, i);
}

// OnPlayerReachedSafeZone and OnEggCommittedToFarm: RemoveConsumedEgg, stop chasing it, maybe schedule the batch.
export function onEggSecured(sim, i, egg) {
  consume(sim, i, egg);
}
export function onEggCommitted(sim, i, egg) {
  consume(sim, i, egg);
}

function consume(sim, i, egg) {
  const an = sim.state.animals[i];
  an.stolen = an.stolen.filter(e => e[0] !== egg);
  refreshCurrentEgg(sim, i);
  refreshChaseOrReturnHome(sim, i);
  if (activeEggs(sim, i).length < 1 && an.respawnAt == null) an.respawnAt = sim.state.t + Math.max(0, sim.D.animals[i].respawn);
}

function refreshChaseOrReturnHome(sim, i) {
  const an = sim.state.animals[i];
  an.stolen = an.stolen.filter(([egg, actor]) => {
    const it = sim.state.items[egg];
    return it && !it.secured && it.owner === i && sim.state.actors[actor] != null;
  });
  if (an.stolen.length) {
    const [egg, actor] = an.stolen[0];
    if (an.state !== ANIMAL.CHASE) sim.emit('animalWake', { animal: i, target: actor, item: egg });
    an.state = ANIMAL.CHASE;
    an.egg = egg;
    an.target = actor;
    return;
  }
  refreshCurrentEgg(sim, i);
  an.target = null;
  if (an.state === ANIMAL.CHASE) {
    an.state = ANIMAL.RETURN;
    agentStop(an);
    sim.emit('animalReturn', { animal: i });
  }
}

// IsCurrentChaseStillValid
function chaseValid(sim, i) {
  const an = sim.state.animals[i], it = an.egg && sim.state.items[an.egg];
  if (!it || it.secured || it.owner !== i || an.target == null) return false;
  const e = an.stolen.find(x => x[0] === an.egg);
  return !!e && e[1] === an.target;
}

// --- per frame ------------------------------------------------------------------------------------------------------

export function stepAnimals(sim, dt) {
  const s = sim.state;
  s.animals.forEach((an, i) => {
    const def = sim.D.animals[i];
    if (an.state === ANIMAL.RETURN) {
      agentTo(sim, an, def.home, def.returnSpeed, dt, def.stoppingDistance);
      if (Math.hypot(an.pos[0] - def.home[0], an.pos[2] - def.home[2]) <= def.stoppingDistance + 1e-3) {
        an.pos = copy(def.home);
        an.yaw = def.homeYaw;
        an.state = ANIMAL.SLEEP;
        agentStop(an);
        refreshCurrentEgg(sim, i);
        sim.emit('animalSleep', { animal: i });
      }
    } else if (an.state === ANIMAL.CHASE) {
      if (!chaseValid(sim, i)) refreshChaseOrReturnHome(sim, i);
      if (an.state === ANIMAL.CHASE) {
        agentTo(sim, an, s.actors[an.target].pos, def.chaseSpeed, dt, def.stoppingDistance);
        hits(sim, i);
      }
    }
    if (an.respawnAt != null && s.t >= an.respawnAt) {
      an.respawnAt = null;
      if (activeEggs(sim, i).length === 0) spawnBatch(sim, i, batchSize(sim, def));
    }
  });
}

// Attack collider (the animal's own BoxCollider, enabled while awake) against every actor capsule. AnimalHitTrigger
// cooldown 1.0 s starts on any player/rival contact.
function hits(sim, i) {
  const s = sim.state, an = s.animals[i], def = sim.D.animals[i];
  if (s.t < an.nextHit) return;
  for (let a = 0; a < s.actors.length; a++) {
    const actor = s.actors[a];
    if (actor.gone) continue;
    if (!touches(sim, i, actor.pos, a === 0 ? sim.D.player.radius : sim.D.rivals[a - 1].radius)) continue;
    an.nextHit = s.t + def.hitCooldown;
    const id = carriedBy(sim, a), it = id && s.items[id];
    if (an.state !== ANIMAL.CHASE || !it || it.kind !== 'egg' || it.owner !== i || it.secured) break;
    sim.emit('animalHit', { animal: i, actor: a, item: id });
    if (a === 0) dropEgg(sim, 0, { waitExit: true, height: sim.D.player.dropHeight });
    else rivalHitByAnimal(sim, a, i);
    break;
  }
}

// The exported hit box is in world space at the scene pose; express it relative to the animal's yaw once.
function localHitBox(sim, i) {
  const def = sim.D.animals[i];
  if (def._hit) return def._hit;
  const b = def.hitBox, y0 = def.yaw, c = Math.cos(y0), sn = Math.sin(y0);
  const inv = (x, z) => [x * c - z * sn, x * sn + z * c];
  const axes = [], h = [];
  for (let k = 0; k < 3; k++) if (Math.abs(b.ax[k][1]) <= 0.7) { axes.push(inv(b.ax[k][0], b.ax[k][2])); h.push(b.h[k]); }
  return (def._hit = { off: inv(b.c[0] - def.pos[0], b.c[2] - def.pos[2]), axes, h });
}

export function touches(sim, i, p, radius) {
  const an = sim.state.animals[i], L = localHitBox(sim, i), c = Math.cos(an.yaw), sn = Math.sin(an.yaw);
  const rot = (x, z) => [x * c + z * sn, -x * sn + z * c];
  const off = rot(L.off[0], L.off[1]);
  const dx = p[0] - an.pos[0] - off[0], dz = p[2] - an.pos[2] - off[1];
  let out = 0;
  L.axes.forEach((ax, k) => {
    const w = rot(ax[0], ax[1]);
    const over = Math.abs(dx * w[0] + dz * w[1]) - L.h[k];
    if (over > 0) out += over * over;
  });
  return Math.sqrt(out) <= radius;
}

// Eggs lying in nests are dropped when a scene reload rebuilds the batches (save.js).
export function clearNests(sim) {
  for (const id of Object.keys(sim.state.items)) {
    const it = sim.state.items[id];
    if (it.kind === 'egg' && (where(it) === LOC.NEST || where(it) === LOC.GROUND)) removeItem(sim, id);
  }
}
