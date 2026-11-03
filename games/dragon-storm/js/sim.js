// Dragon Storm stage simulation: pure logic, no DOM, so node tests can drive it directly.
// Per the gameplay clips (~/handoff/dragon-storm-clips.md): one side-view lane, the hero is fixed in the centre and
// never walks, monsters walk in from both edges, the player slashes left or right. Method names mirror the
// original's Scene_Stage (FUC_ATTACKING_LEFT_START, FUC_HIT_MONSTER_FROM_LEFT,
// FUC_FINISH_DELAY_FOR_ATTACKING_MISS, FUC_MONSTER_RUSH_LEFT_RIGHT ...); numbers come from data/stageNN.json and are
// placeholders (see its _note).

export const W = 480;
export const H = 800;
export const GROUND_Y = 430;
export const HERO_X = 240;
const SPAWN_PAD = 70; // spawn this far outside the screen
const QUEUE_GAP = 46; // monsters in one lane keep this distance from the one ahead
const READY_TIME = 1.0;
const FIGHT_TIME = 0.6;
const END_TIME = 2.0;
const MON_ATTACK_TIME = 0.45;
const MON_ATTACK_HIT = 0.25;
const DEAD_BODY_TIME = 0.7;

// opts (from the meta save): hp = max HP (knightStats.hpByArmorLevel), atk = ATK (atkByWeaponLevel), crit = CRIT
// (critByWeaponLevel). Real values; how ATK turns into damage is still the placeholder range scaled by atk/10 until
// the C++ damage formula (Scene_UI::FUC_CALCULATE_DAMAGE_*) is recovered in M4.
export function createSim(stage, seed = 1, opts = {}) {
  const h = stage.hero;
  let r = (seed * 48271) % 2147483647 || 1;
  return {
    stage,
    rng: () => (r = (r * 16807) % 2147483647) / 2147483647,
    phase: 'ready', // ready -> play -> clear|fail -> result
    t: 0,
    clock: 0,
    paused: false,
    atkScale: opts.atk ? opts.atk / 10 : 1,
    crit: opts.crit ?? null,
    hero: { x: HERO_X, offX: 0, hp: opts.hp ?? h.hp, hpMax: opts.hp ?? h.hp, facing: 1, state: 'idle', st: 0, lock: 0, lockMax: 1, hurt: 0, shield: 0 },
    monsters: [],
    nextWave: 0,
    nextId: 1,
    kills: 0,
    score: 0,
    gold: 0,
    books: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    attacks: 0,
    damageTaken: 0,
    skillCharges: h.skillStart,
    potions: h.potions,
    shields: h.shields,
    stars: 0,
    events: [],
  };
}

const emit = (s, type, data = {}) => s.events.push({ ...data, type });
export const living = s => s.monsters.filter(m => m.state !== 'dead');
export const totalMonsters = s => s.stage.waves.length;
export const starScores = st => st.starMarks.map(f => Math.round(f * st.scoreBar));

function setPhase(s, phase) {
  s.phase = phase;
  s.t = 0;
  emit(s, 'phase', { phase });
}

// Slash toward side (-1 left, +1 right). Returns 'hit' | 'kill' | 'miss' | null (input ignored).
export function attack(s, side) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || hero.lock > 0) return null;
  const H_ = s.stage.hero;
  hero.facing = side;
  hero.state = 'attack';
  hero.st = 0;
  s.attacks++;
  let target = null;
  for (const m of living(s)) {
    const d = (m.x - hero.x) * side;
    if (d > -10 && d <= H_.range && (!target || d < (target.x - hero.x) * side)) target = m;
  }
  if (!target) {
    hero.lock = hero.lockMax = H_.missLock;
    s.misses++;
    s.combo = 0;
    emit(s, 'miss', { side });
    return 'miss';
  }
  hero.lock = hero.lockMax = H_.attackTime;
  s.hits++;
  s.combo++;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  const [lo, hi] = H_.damage;
  let dmg = Math.round((lo + s.rng() * (hi - lo)) * s.atkScale);
  // critical: rand()%100 < CRIT + 15 doubles the hit (Scene_Stage::update @0x590ef8, EFF_CRITICAL)
  let crit = false;
  if (s.crit !== null && Math.floor(s.rng() * 100) < s.crit + 15) { dmg *= 2; crit = true; }
  s.lastCrit = crit;
  return damageMonster(s, target, dmg, side);
}

// the red button: slash the way the hero is facing
export const attackFacing = s => attack(s, s.hero.facing);

function damageMonster(s, m, dmg, side) {
  m.hp -= dmg;
  m.flash = 0.12;
  if (m.hp > 0) {
    m.kx = side * 260; // knocked back away from the hero
    m.state = 'walk';
    m.st = 0;
    emit(s, 'hit', { id: m.id, x: m.x, side, dmg, crit: !!s.lastCrit });
    return 'hit';
  }
  killMonster(s, m, side, dmg);
  return 'kill';
}

function killMonster(s, m, side, dmg) {
  const def = s.stage.monsters[m.type];
  m.hp = 0;
  m.state = 'dead';
  m.st = 0;
  s.kills++;
  const pts = def.score + Math.floor(s.combo / 5);
  s.score += pts;
  s.gold += def.gold;
  if (s.kills % s.stage.hero.skillEvery === 0) { s.skillCharges++; emit(s, 'skillCharge', { charges: s.skillCharges }); }
  emit(s, 'kill', { id: m.id, mtype: m.type, x: m.x, side, combo: s.combo, dmg, pts, gold: def.gold, crit: !!s.lastCrit });
}

// Blue button. Placeholder for Sword Storm: spend one charge, hit every monster on screen.
export function skill(s) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || s.skillCharges <= 0) return false;
  s.skillCharges--;
  s.lastCrit = false;
  emit(s, 'skill', {});
  for (const m of living(s)) {
    if (m.x > -20 && m.x < W + 20) damageMonster(s, m, s.stage.hero.skillDamage, m.x < hero.x ? -1 : 1);
  }
  return true;
}

// Corner items (counts are 0 at stage 1 start, as in the clips): potion heals, winged shield blocks hits a while.
export function usePotion(s) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || s.potions <= 0 || hero.hp >= hero.hpMax) return false;
  s.potions--;
  hero.hp = Math.min(hero.hpMax, hero.hp + Math.round(hero.hpMax * s.stage.hero.potionHeal));
  emit(s, 'potion', {});
  return true;
}

export function useShield(s) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || s.shields <= 0) return false;
  s.shields--;
  hero.shield = s.stage.hero.shieldTime;
  emit(s, 'shield', {});
  return true;
}

function spawn(s, w) {
  const def = s.stage.monsters[w.type];
  const side = w.side === 'L' ? -1 : 1;
  const m = {
    id: s.nextId++, type: w.type, side, x: side < 0 ? -SPAWN_PAD : W + SPAWN_PAD,
    hp: def.hp, hpMax: def.hp, state: 'walk', st: 0, atkCd: 0.35, flash: 0, kx: 0, hitDone: false,
  };
  s.monsters.push(m);
  emit(s, 'spawn', { id: m.id, mtype: m.type, side });
}

function hurtHero(s, m) {
  const hero = s.hero;
  if (hero.state === 'dead') return;
  if (hero.shield > 0) { emit(s, 'blocked', { id: m.id }); return; }
  const def = s.stage.monsters[m.type];
  hero.hp = Math.max(0, hero.hp - def.atk);
  s.damageTaken += def.atk;
  s.combo = 0;
  hero.hurt = s.stage.hero.hurtTime;
  emit(s, 'heroHurt', { id: m.id, dmg: def.atk });
  if (hero.hp <= 0) {
    hero.state = 'dead';
    hero.st = 0;
    emit(s, 'heroDie', {});
    setPhase(s, 'fail');
  }
}

function updateMonsters(s, dt) {
  const hero = s.hero;
  for (const side of [-1, 1]) {
    const lane = living(s).filter(m => m.side === side).sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x));
    let limit = null;
    lane.forEach((m, i) => {
      const def = s.stage.monsters[m.type];
      const dir = -side; // walk toward the hero
      const stopX = i === 0 ? hero.x - dir * def.contact : limit - dir * QUEUE_GAP;
      m.flash = Math.max(0, m.flash - dt);
      if (m.kx) {
        m.x += m.kx * dt;
        m.kx *= Math.pow(0.0005, dt);
        if (Math.abs(m.kx) < 8) m.kx = 0;
      }
      m.st += dt;
      if (m.state === 'attack') {
        if (!m.hitDone && m.st >= MON_ATTACK_HIT) {
          m.hitDone = true;
          if (i === 0 && Math.abs(m.x - hero.x) <= def.contact + 6) hurtHero(s, m);
        }
        if (m.st >= MON_ATTACK_TIME) { m.state = 'wait'; m.st = 0; m.atkCd = def.atkEvery - MON_ATTACK_TIME; }
      } else {
        const ahead = (stopX - m.x) * dir;
        if (ahead > 0.5) {
          m.x += dir * Math.min(def.speed * dt, ahead);
          if (m.state !== 'walk') { m.state = 'walk'; m.st = 0; }
        } else {
          if (m.state === 'walk') { m.state = 'wait'; m.st = 0; }
          if (i === 0 && hero.state !== 'dead' && s.phase === 'play') {
            m.atkCd -= dt;
            if (m.atkCd <= 0) {
              m.state = 'attack'; m.st = 0; m.hitDone = false;
              emit(s, 'monsterAttack', { id: m.id, mtype: m.type });
            }
          }
        }
      }
      limit = m.x;
    });
  }
  for (const m of s.monsters) if (m.state === 'dead') m.st += dt;
  s.monsters = s.monsters.filter(m => m.state !== 'dead' || m.st < DEAD_BODY_TIME);
}

function updateHero(s, dt) {
  const hero = s.hero;
  const H_ = s.stage.hero;
  hero.st += dt;
  hero.lock = Math.max(0, hero.lock - dt);
  hero.hurt = Math.max(0, hero.hurt - dt);
  hero.shield = Math.max(0, hero.shield - dt);
  if (hero.state === 'attack' && hero.st >= H_.attackTime) { hero.state = 'idle'; hero.st = 0; }
  // the hero stays planted; a slash lunges the sprite toward the target and back
  hero.offX = hero.state === 'attack' ? hero.facing * H_.lunge * Math.sin(Math.PI * Math.min(1, hero.st / H_.attackTime)) : 0;
}

function finishStage(s) {
  s.stars = starScores(s.stage).filter(th => s.score >= th).length;
  setPhase(s, 'clear');
  emit(s, 'clear', { stars: s.stars });
}

export function update(s, dt) {
  if (s.paused) return;
  s.t += dt;
  switch (s.phase) {
    case 'ready':
      updateHero(s, dt);
      if (s.t >= READY_TIME + FIGHT_TIME) setPhase(s, 'play');
      break;
    case 'play': {
      s.clock += dt;
      const waves = s.stage.waves;
      while (s.nextWave < waves.length && waves[s.nextWave].t <= s.clock) spawn(s, waves[s.nextWave++]);
      updateHero(s, dt);
      updateMonsters(s, dt);
      if (s.phase === 'play' && s.nextWave >= waves.length && living(s).length === 0) finishStage(s);
      break;
    }
    case 'clear':
    case 'fail':
      updateHero(s, dt);
      updateMonsters(s, dt);
      if (s.t >= END_TIME) setPhase(s, 'result');
      break;
    default:
      break;
  }
}

// Auto-player for ?bot and the tests. opts.react: seconds before reacting to a monster entering range,
// opts.err: chance of slashing the wrong way, rng: () => [0,1).
export function createBot(opts = {}, rng = Math.random) {
  const react = opts.react ?? 0;
  const err = opts.err ?? 0;
  const seen = new Map();
  return function bot(s, dt) {
    if (s.phase !== 'play' || s.paused || s.hero.state === 'dead') return;
    if (s.skillCharges > 0 && living(s).filter(m => Math.abs(m.x - s.hero.x) < 160).length >= 3) { skill(s); return; }
    let best = null;
    for (const m of living(s)) {
      const d = Math.abs(m.x - s.hero.x);
      if (d > s.stage.hero.range) { seen.delete(m.id); continue; }
      seen.set(m.id, (seen.get(m.id) || 0) + dt);
      if (seen.get(m.id) >= react && (!best || d < Math.abs(best.x - s.hero.x))) best = m;
    }
    if (best && s.hero.lock <= 0) {
      let side = best.x < s.hero.x ? -1 : 1;
      if (rng() < err) side = -side;
      attack(s, side);
    }
  };
}
