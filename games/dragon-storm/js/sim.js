// Dragon Storm stage simulation: pure logic, no DOM, so node tests can drive it directly.
// Per the gameplay clips (~/handoff/dragon-storm-clips.md): one side-view lane, the hero is fixed in the centre and
// never walks, monsters walk in from both edges, the player slashes left or right. Method names mirror the
// original's Scene_Stage (FUC_ATTACKING_LEFT_START, FUC_HIT_MONSTER_FROM_LEFT,
// FUC_FINISH_DELAY_FOR_ATTACKING_MISS, FUC_MONSTER_RUSH_LEFT_RIGHT ...); numbers come from data/stageNN.json, generated
// from libMyGame.so by tools/gen_stages.py (each value tagged with its C++ source there; PLACEHOLDER keys say so).

export const W = 480;
export const H = 800;
export const GROUND_Y = 430;
export const HERO_X = 240;
// spawn point: x = W + W / spawnDiv (right) or -W / spawnDiv (left), spawnDiv 2.0 (SCH_CREATE_MONSTER01 @0x598f8c)
const SPAWN_OUT = W / 2;
const QUEUE_GAP = 46; // web layout: melee monsters in one lane queue this far apart (the original lets them overlap)
const READY_TIME = 1.0;
const FIGHT_TIME = 0.6;
const END_TIME = 2.0;
const MON_ATTACK_TIME = 0.45;
const MON_ATTACK_HIT = 0.25;
const DEAD_BODY_TIME = 0.7;

// Scene_UI::FUC_CALCULATE_DAMAGE @0x607ee0 (no element bonus: both sides element 0 in stages 1-5):
// max(1, 4*atk - 2*def + (atk >= 3 ? (rand() % atk) / 4 : 1))
export function calcDamage(atk, def, rng) {
  const r = atk >= 3 ? Math.floor(Math.floor(rng() * atk) / 4) : 1;
  return Math.max(1, 4 * atk - 2 * def + r);
}

// opts (from the meta save): hp = max HP (knightStats.hpByArmorLevel), atk = ATK (atkByWeaponLevel), crit = CRIT
// (critByWeaponLevel), def = DEF (defByArmorLevel). Defaults = the level-0 knight (130 / 10 / 10 / 5).
export function createSim(stage, seed = 1, opts = {}) {
  const h = stage.hero;
  let r = (seed * 48271) % 2147483647 || 1;
  const hp = opts.hp ?? 130;
  return {
    stage,
    rng: () => (r = (r * 16807) % 2147483647) / 2147483647,
    phase: 'ready', // ready -> play -> clear|fail -> result
    t: 0,
    clock: 0,
    paused: false,
    atk: opts.atk ?? 10,
    def: opts.def ?? 5,
    crit: opts.crit ?? 10,
    hero: { x: HERO_X, offX: 0, hp, hpMax: hp, facing: 1, state: 'idle', st: 0, lock: 0, lockMax: 1, hurt: 0, shield: 0 },
    boss: null,
    zzol: null, // boss minion script in progress { pat, t0 }
    zzolNext: 0, // next pattern index
    zzolAt: 0, // clock time of the next pattern call
    alerts: [], // boss-wave alerts and wolf warnings for the renderer
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
const defOf = (s, m) => s.stage.monsters[m.type];
const isRanged = def => !!def.ranged;
const isProjectile = def => !!def.projectileOf;
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
    if (d > -10 && d <= defOf(s, m).contact + H_.reach && (!target || d < (target.x - hero.x) * side)) target = m;
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
  // knight ATK vs monster DEF (Scene_Stage::update @0x59273c)
  let dmg = calcDamage(s.atk, defOf(s, target).def, s.rng);
  // critical: rand()%100 < CRIT + 15 doubles the hit (Scene_Stage::update @0x590ef8, EFF_CRITICAL)
  let crit = false;
  if (Math.floor(s.rng() * 100) < s.crit + 15) { dmg *= 2; crit = true; }
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
  // kill score = monster score + current combo (Scene_UI::FUC_GET_SCORE @0x602c30; combo before this hit)
  const pts = def.score + Math.max(0, s.combo - 1);
  s.score += pts;
  s.gold += def.gold;
  if (s.kills % s.stage.hero.skillEvery === 0) { s.skillCharges++; emit(s, 'skillCharge', { charges: s.skillCharges }); }
  if (s.boss === m) emit(s, 'bossDown', { id: m.id });
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

// walk speed that covers spawn -> stop point in the recovered MoveTo duration (walkTime, / fastDiv on fast waves)
function walkSpeed(def, fromX, stopDist, fast) {
  const t = fast ? def.walkTime / def.fastDiv : def.walkTime;
  return Math.max(1, Math.abs(fromX - HERO_X) - stopDist) / t;
}

function spawn(s, w, at) {
  const def = s.stage.monsters[w.type];
  const side = w.side === 'L' ? -1 : 1;
  const x = at ?? (side < 0 ? -SPAWN_OUT : W + SPAWN_OUT);
  const stop = isRanged(def) ? def.ranged.stopFromHero : def.contact;
  const m = {
    id: s.nextId++, type: w.type, side, x, speed: walkSpeed(def, x, stop, w.fast),
    hp: def.hp, hpMax: def.hp, state: 'walk', st: 0, atkCd: 0.35, flash: 0, kx: 0, hitDone: false,
  };
  s.monsters.push(m);
  emit(s, 'spawn', { id: m.id, mtype: m.type, side });
  if (w.alert) { // mode 1: S_BOSS_ALERT + blinking in_eff_alert at the entry side (SCH_PLAY_BY_SCENARIO @0x59f4c4)
    s.alerts.push({ k: 'alert', side, t: 0, dur: 1.2 });
    emit(s, 'alert', { side });
  }
  if (def.typeId === 1 || def.typeId === 23) { // wolves: Scene_UI::EFF_MARK_ALERT @0x612288 (kind 1 / 23)
    s.alerts.push({ k: 'wolf', side, id: m.id, t: 0, dur: 3, dy: [0, 10, 20][Math.floor(s.rng() * 3)] });
  }
  if (def.ai === 4 && !s.boss) {
    s.boss = m;
    if (s.stage.zzol) s.zzolAt = s.clock + (s.stage.zzol.first ?? s.stage.zzol.every);
    emit(s, 'boss', { id: m.id });
  }
  return m;
}

function hurtHero(s, m) {
  const hero = s.hero;
  if (hero.state === 'dead') return;
  if (hero.shield > 0) { emit(s, 'blocked', { id: m.id }); return; }
  const def = s.stage.monsters[m.type];
  // monster ATK vs knight DEF (Scene_Stage::FUC_HIT_BY_MONSTER @0x5b9dd4)
  const dmg = calcDamage(def.atk, s.def, s.rng);
  hero.hp = Math.max(0, hero.hp - dmg);
  s.damageTaken += dmg;
  s.combo = 0;
  hero.hurt = s.stage.hero.hurtTime;
  emit(s, 'heroHurt', { id: m.id, dmg });
  if (hero.hp <= 0) {
    hero.state = 'dead';
    hero.st = 0;
    emit(s, 'heroDie', {});
    setPhase(s, 'fail');
  }
}

function stepCommon(m, dt) {
  m.flash = Math.max(0, m.flash - dt);
  if (m.kx) {
    m.x += m.kx * dt;
    m.kx *= Math.pow(0.0005, dt);
    if (Math.abs(m.kx) < 8) m.kx = 0;
  }
  m.st += dt;
}

// walk toward stopX; returns true once standing there
function walkTo(m, stopX, dt) {
  const dir = -m.side;
  const ahead = (stopX - m.x) * dir;
  if (ahead > 0.5) {
    m.x += dir * Math.min(m.speed * dt, ahead);
    if (m.state !== 'walk') { m.state = 'walk'; m.st = 0; }
    return false;
  }
  if (m.state === 'walk') { m.state = 'wait'; m.st = 0; }
  return true;
}

function updateMonsters(s, dt) {
  const hero = s.hero;
  const canAct = hero.state !== 'dead' && s.phase === 'play';
  for (const side of [-1, 1]) {
    const lane = living(s).filter(m => m.side === side && !isRanged(defOf(s, m)) && !isProjectile(defOf(s, m)))
      .sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x));
    let limit = null;
    lane.forEach((m, i) => {
      const def = defOf(s, m);
      const dir = -side;
      const stopX = i === 0 ? hero.x - dir * def.contact : limit - dir * QUEUE_GAP;
      stepCommon(m, dt);
      if (m.state === 'attack') {
        if (!m.hitDone && m.st >= MON_ATTACK_HIT) {
          m.hitDone = true;
          if (i === 0 && Math.abs(m.x - hero.x) <= def.contact + 6) hurtHero(s, m);
        }
        if (m.st >= MON_ATTACK_TIME) { m.state = 'wait'; m.st = 0; m.atkCd = def.atkEvery - MON_ATTACK_TIME; }
      } else if (walkTo(m, stopX, dt) && i === 0 && canAct) {
        m.atkCd -= dt;
        if (m.atkCd <= 0) {
          m.state = 'attack'; m.st = 0; m.hitDone = false;
          emit(s, 'monsterAttack', { id: m.id, mtype: m.type });
        }
      }
      limit = m.x;
    });
  }
  // archers: stop at range and shoot arrows; arrows fly to the hero and hit once
  for (const m of living(s)) {
    const def = defOf(s, m);
    if (isRanged(def)) {
      stepCommon(m, dt);
      if (m.state === 'attack') {
        if (!m.hitDone && m.st >= MON_ATTACK_HIT) {
          m.hitDone = true;
          if (canAct) {
            const a = spawn(s, { type: def.ranged.projectile, side: m.side > 0 ? 'R' : 'L' }, m.x);
            m.shots = (m.shots || 0) + 1;
            emit(s, 'shoot', { id: m.id, arrow: a.id });
          }
        }
        if (m.st >= MON_ATTACK_TIME) { m.state = 'wait'; m.st = 0; m.atkCd = def.atkEvery - MON_ATTACK_TIME; }
      } else if (walkTo(m, hero.x + m.side * ((m.shots || 0) >= def.ranged.shots ? def.contact : def.ranged.stopFromHero), dt) && canAct) {
        m.atkCd -= dt;
        if (m.atkCd <= 0) {
          m.state = 'attack'; m.st = 0; m.hitDone = false;
          emit(s, 'monsterAttack', { id: m.id, mtype: m.type });
        }
      }
    } else if (isProjectile(def)) {
      stepCommon(m, dt);
      if (walkTo(m, hero.x + m.side * def.contact, dt)) {
        if (canAct) hurtHero(s, m);
        m.hp = 0; m.state = 'dead'; m.st = 0; m.spent = true;
      }
    }
  }
  for (const m of s.monsters) if (m.state === 'dead') m.st += dt;
  s.monsters = s.monsters.filter(m => m.state !== 'dead' || m.st < DEAD_BODY_TIME);
  for (const a of s.alerts) {
    a.t += dt;
    if (a.k === 'wolf') { // the warning leaves once its wolf is on screen
      const m = s.monsters.find(x => x.id === a.id);
      if (!m || m.state === 'dead' || (m.x > 0 && m.x < W)) a.t = Math.max(a.t, a.dur);
    }
  }
  s.alerts = s.alerts.filter(a => a.t < a.dur);
}

// boss minions: Init_ZZoL_Scenario patterns (see stage05.json zzol for what is recovered and what is PLACEHOLDER)
function updateZzol(s) {
  const z = s.stage.zzol;
  if (!z || !s.boss) return;
  if (s.boss.state === 'dead') { s.zzol = null; return; }
  if (!s.zzol && s.clock >= s.zzolAt) {
    s.zzol = { pat: s.zzolNext % z.patterns.length, t0: s.clock, next: 0 };
    s.zzolNext++;
    emit(s, 'summon', { pattern: s.zzol.pat });
  }
  if (s.zzol) {
    const pat = z.patterns[s.zzol.pat];
    while (s.zzol.next < pat.length && s.zzol.t0 + pat[s.zzol.next].k * z.tick <= s.clock) spawn(s, pat[s.zzol.next++]);
    if (s.clock >= s.zzol.t0 + z.end[s.zzol.pat] * z.tick) { s.zzol = null; s.zzolAt = s.clock + z.every; }
  }
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
      updateZzol(s);
      updateHero(s, dt);
      updateMonsters(s, dt);
      // clear: the script's 9999 end marker has passed and nothing is left alive
      const done = s.nextWave >= waves.length && s.clock >= (s.stage.scriptEnd || 0) && !s.zzol;
      if (s.phase === 'play' && done && living(s).length === 0) finishStage(s);
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
      if (d > s.stage.monsters[m.type].contact + s.stage.hero.reach) { seen.delete(m.id); continue; }
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
