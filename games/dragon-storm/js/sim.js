// Dragon Storm stage simulation: pure logic, no DOM, so node tests can drive it directly.
// One side-view lane, the knight is fixed in the centre, monsters walk in from both edges, the player slashes left or
// right (triangle pads), dashes with the red button (the knight's class skill) and uses Sword Storm with the blue one.
// Every number comes from data/stageNN.json, generated from libMyGame.so by tools/gen_stages.py; each value there is
// tagged with its C++ source (Scene_Stage / Scene_UI function + address) or marked PLACEHOLDER / CLIP-MEASURED.

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
const DEAD_BODY_TIME = 0.7;
const DASH_TIME = 0.45; // web animation length of the dash (the original's EFF_DASH timing was not traced)

// Scene_UI::FUC_CALCULATE_DAMAGE @0x607ee0 (no element bonus: both sides element 0 in stages 1-5):
// max(1, 4*atk - 2*def + (atk >= 3 ? (rand() % atk) / 4 : 1))
export function calcDamage(atk, def, rng) {
  const r = atk >= 3 ? Math.floor(Math.floor(rng() * atk) / 4) : 1;
  return Math.max(1, 4 * atk - 2 * def + r);
}

// opts (from the meta save): hp (knightStats.hpByArmorLevel), atk (atkByWeaponLevel), skill (skillByWeaponLevel:
// player+0x540, the dash's power), def (defByArmorLevel), wlv (weapon level: widens the attack area).
// Defaults = the level-0 knight.
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
    power: opts.skill ?? opts.crit ?? 10,
    wlv: opts.wlv ?? 0,
    hero: { x: HERO_X, offX: 0, hp, hpMax: hp, facing: 1, state: 'idle', st: 0, lock: 0, lockMax: 1, hurt: 0, shield: 0, dashCd: 0, dashMax: h.dash.cooldown, dashT: 0 },
    boss: null,
    zzol: null, // boss minion script in progress { pat, t0, next }
    zzolStart: null, // pending summon { pat, at }
    zzolPhase: 0,
    alerts: [], // boss-wave alerts and edge warnings for the renderer
    pending: [], // alerted waves waiting to spawn { w, at }
    finalPassed: false,
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
    skillCharges: opts.storms ?? 0,
    potions: h.potions,
    shields: h.shields,
    stars: 0,
    events: [],
  };
}

const emit = (s, type, data = {}) => s.events.push({ ...data, type });
export const living = s => s.monsters.filter(m => m.state !== 'dead');
export const totalMonsters = s => s.stage.waves.length;
// stars at T/3, T/2, T with integer division (Scene_UI::FUC_GET_SCORE @0x603100)
export const starScores = st => st.starMarks.map(f => Math.floor(f * st.scoreBar));
const defOf = (s, m) => s.stage.monsters[m.type];
const isRanged = def => !!def.ranged;
const isProjectile = def => !!def.projectileOf;

function setPhase(s, phase) {
  s.phase = phase;
  s.t = 0;
  emit(s, 'phase', { phase });
}

// the knight's attack area on one side: [near, far] distance from the hero (Init_Player @0x57a1b8,
// FUC_SET_PLAYER_ATTAKING_COLLISION @0x5e4dd0)
export function attackArea(s) {
  const a = s.stage.hero.attackArea;
  const near = a.gap * W;
  return { near, far: near + W * (a.width + a.perLevel * Math.min(s.wlv, a.maxLevel)) };
}

// monsters whose hit box overlaps the attack area on `side`
export function inArea(s, side) {
  const { near, far } = attackArea(s);
  return living(s).filter(m => {
    const d = (m.x - s.hero.x) * side;
    const half = defOf(s, m).box / 2;
    return d + half > near && d - half < far;
  });
}

// Slash toward side (-1 left, +1 right). Returns 'hit' | 'kill' | 'miss' | null (input ignored). Every monster in the
// area takes a hit (Scene_Stage::update tests each against the collision sprite).
export function attack(s, side) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || hero.lock > 0 || hero.dashT > 0) return null;
  const H_ = s.stage.hero;
  hero.facing = side;
  hero.state = 'attack';
  hero.st = 0;
  s.attacks++;
  const targets = inArea(s, side);
  if (!targets.length) {
    hero.lock = hero.lockMax = H_.missLock;
    s.misses++;
    s.combo = 0;
    emit(s, 'miss', { side });
    return 'miss';
  }
  hero.lock = hero.lockMax = H_.attackTime;
  s.hits++;
  let res = 'hit';
  for (const m of targets) {
    let dmg = calcDamage(s.atk, defOf(s, m).def, s.rng);
    // "PERFECT": rand()%100 < player+0x560 (1 for the knight) doubles the hit (Scene_Stage::update @0x592744)
    const crit = Math.floor(s.rng() * 100) < H_.critChance;
    if (crit) dmg *= 2;
    if (damageMonster(s, m, dmg, side, crit) === 'kill') res = 'kill';
  }
  return res;
}

// red button: the knight's dash (FUC_SKILL_START, EFF_DASH): runs along the facing side and hits every monster on
// that side of the screen with FUC_CALCULATE_DAMAGE(skill power, DEF) (Scene_Stage::update @0x591a28)
export function dash(s, side = s.hero.facing) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || hero.dashCd > 0 || hero.dashT > 0) return false;
  hero.facing = side;
  hero.dashCd = hero.dashMax;
  hero.dashT = DASH_TIME;
  hero.lock = 0;
  emit(s, 'dash', { side });
  for (const m of living(s)) {
    const d = (m.x - hero.x) * side;
    if (d > -20 && m.x > -10 && m.x < W + 10) damageMonster(s, m, calcDamage(s.power, defOf(s, m).def, s.rng), side, false);
  }
  return true;
}

// the red button
export const attackFacing = s => dash(s);

function damageMonster(s, m, dmg, side, crit) {
  m.hp -= dmg;
  m.flash = 0.12;
  const def = defOf(s, m);
  if (m.hp > 0) {
    if (!isProjectile(def)) m.kx = side * 260; // knocked back (web; FUC_MONSTER_PUSHING not modelled)
    if (m.state === 'attack') { m.state = 'wait'; m.st = 0; m.atkCd = def.atkDelay; }
    emit(s, 'hit', { id: m.id, x: m.x, side, dmg, crit });
    if (m === s.boss) bossHit(s);
    return 'hit';
  }
  killMonster(s, m, side, dmg, crit);
  return 'kill';
}

function killMonster(s, m, side, dmg, crit) {
  const def = defOf(s, m);
  m.hp = 0;
  m.state = 'dead';
  m.st = 0;
  s.kills++;
  // kill score = monster score + the combo so far, then the combo counts this kill (FUC_HIT_MONSTER_FROM_LEFT @0x594f54:
  // Scene_UI::FUC_GET_SCORE, then FUC_GET_COMBO)
  const pts = def.score + s.combo;
  s.score += pts;
  s.combo++;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  // coins: rand()%10001 < GameData+0x7698[stage]; a boss always drops 5; projectiles (AI 3) drop nothing
  // (Scene_UI::FUC_SELECT_ITEM @0x5ed398 / @0x5ed40c)
  const gold = isProjectile(def) ? 0 : def.ai === 4 ? s.stage.bossCoins : (s.rng() < s.stage.coinChance ? 1 : 0);
  s.gold += gold;
  if (s.boss === m) emit(s, 'bossDown', { id: m.id });
  emit(s, 'kill', { id: m.id, mtype: m.type, x: m.x, side, combo: s.combo, dmg, pts, gold, crit });
  checkClear(s, m);
}

// FUC_HIT_MONSTER_FROM_LEFT/RIGHT @0x595248: a required monster dying after the end (9999) or final (7777) marker
// with no other required monster alive clears the stage; so does a boss dying after 7777. FUC_CLEAR_PROCCESS then
// kills what is left.
function checkClear(s, m) {
  if (s.phase !== 'play') return;
  const ended = s.clock >= s.stage.scriptEnd && s.nextWave >= s.stage.waves.length && !s.pending.length;
  let clear = false;
  if (m.required) clear = (ended || s.finalPassed) && !living(s).some(o => o.required) && !s.pending.some(p => p.w.required);
  else if (s.finalPassed && defOf(s, m).ai === 4) clear = true;
  if (!clear) return;
  for (const o of living(s)) { o.hp = 0; o.state = 'dead'; o.st = 0; }
  finishStage(s);
}

// Blue button: Sword Storm, only with a booster charge (none in this build). PLACEHOLDER damage.
export function skill(s) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || s.skillCharges <= 0) return false;
  s.skillCharges--;
  emit(s, 'skill', {});
  for (const m of living(s)) {
    if (m.x > -20 && m.x < W + 20) damageMonster(s, m, s.stage.hero.swordStorm.damage, m.x < hero.x ? -1 : 1, false);
  }
  return true;
}

// Corner items (0 without boosters, as in the clips): potion heals, winged shield blocks hits a while.
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

// where a monster stops: melee at contact, archers at W - 0.3*frameW*scale (FUC_START_MONSTER_AI @0x59b7a0)
function stopDist(def, fw) {
  if (isRanged(def)) return W / 2 - def.ranged.stopFrac * fw * def.scale;
  return def.contact;
}

function spawn(s, w, at) {
  const def = s.stage.monsters[w.type];
  const side = w.side === 'L' ? -1 : 1;
  const x = at ?? (side < 0 ? -SPAWN_OUT : W + SPAWN_OUT);
  const stop = isProjectile(def) ? def.contact : stopDist(def, def.contact * 2 / def.scale);
  // walk speed covers spawn -> stop point in walkTime (/ fastDiv on fast waves)
  const t = w.fast ? def.walkTime / def.fastDiv : def.walkTime;
  const m = {
    id: s.nextId++, type: w.type, side, x, speed: Math.max(1, Math.abs(x - HERO_X) - stop) / t, stop,
    hp: def.hp, hpMax: def.hp, state: 'walk', st: 0, atkCd: def.atkDelay, flash: 0, kx: 0, hitDone: false,
    required: !!w.required,
  };
  s.monsters.push(m);
  emit(s, 'spawn', { id: m.id, mtype: m.type, side });
  if (!isProjectile(def) && (x < 0 || x > W)) {
    // incoming warning at the edge (Scene_UI::EFF_MARK_ALERT @0x612288: wolf head for kinds 1 / 23, "!" otherwise)
    const wolf = def.typeId === 1 || def.typeId === 23;
    if (!isProjectile(def)) s.alerts.push({ k: wolf ? 'wolf' : 'warn', side, id: m.id, t: 0, dur: 3, dy: [0, 10, 20][Math.floor(s.rng() * 3)] });
  }
  if (def.ai === 4 && !s.boss) {
    s.boss = m;
    emit(s, 'boss', { id: m.id });
  }
  return m;
}

// a wave entry: mode 1 / 3 waves raise the alert first and spawn after `delay` (SCH_PLAY_BY_SCENARIO @0x59f478 / @0x59f408)
function playWave(s, w) {
  if (w.alert) {
    s.alerts.push({ k: 'alert', side: w.side === 'L' ? -1 : 1, t: 0, dur: w.delay });
    emit(s, 'alert', { side: w.side });
    s.pending.push({ w, at: s.clock + w.delay });
  } else spawn(s, w);
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

// FUC_MONSTER_ATTACK loop: Delay(atkDelay) -> frames, the hit lands after atkHitAt frames -> rest + atkPause -> again
function attackCycle(s, m, def, dt, canAct, onHit) {
  if (m.state === 'attack') {
    if (!m.hitDone && m.st >= def.atkHitAt * def.atkFrame) { m.hitDone = true; if (canAct) onHit(); }
    if (m.st >= def.atkFrames * def.atkFrame + def.atkPause) { m.state = 'wait'; m.st = 0; m.atkCd = def.atkDelay; }
    return;
  }
  if (!canAct) return;
  m.atkCd -= dt;
  if (m.atkCd <= 0) {
    m.state = 'attack'; m.st = 0; m.hitDone = false;
    emit(s, 'monsterAttack', { id: m.id, mtype: m.type });
  }
}

// AI 2 archer (FUC_MONSTER_ATTACK @0x598180): walk in to the stop point, "!" (EFF_ALERT02) + aim 2 frames x 0.06 s,
// DelayTime(0.66), one arrow (CREATE_SHOOTING_OBJECT) while EaseExponentialOut(MoveBy(walkTime*3, W/2 away)),
// DelayTime(0.2), FUC_REMOVE_MONSTER (gone, no kill)
function archerStep(s, m, def, dt, canAct) {
  const r = def.ranged;
  stepCommon(m, dt);
  if (m.state === 'walk' || m.state === 'wait' && !m.aimed) {
    if (!walkTo(m, s.hero.x + m.side * m.stop, dt)) return;
    m.aimed = true; m.state = 'aim'; m.st = 0;
    s.alerts.push({ k: 'aim', side: m.side, id: m.id, t: 0, dur: r.aimFrames * r.aimFrame + r.shootDelay });
    emit(s, 'monsterAttack', { id: m.id, mtype: m.type });
    return;
  }
  if (m.state === 'aim' && m.st >= r.aimFrames * r.aimFrame + r.shootDelay) {
    m.state = 'retreat'; m.st = 0; m.x0 = m.x;
    if (canAct) {
      m.shots = (m.shots || 0) + 1;
      const a = spawn(s, { type: r.projectile, side: m.side > 0 ? 'R' : 'L' }, m.x);
      emit(s, 'shoot', { id: m.id, arrow: a.id });
    }
    return;
  }
  if (m.state === 'retreat') {
    const T = def.walkTime * r.retreatTimeMul;
    const f = Math.min(1, m.st / T);
    m.x = m.x0 + m.side * W * r.retreat * (f >= 1 ? 1 : 1 - Math.pow(2, -10 * f));
    if (m.st >= T + r.removeDelay) { m.hp = 0; m.state = 'dead'; m.st = DEAD_BODY_TIME; m.gone = true; emit(s, 'gone', { id: m.id }); }
  }
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
      if (m.state === 'attack' || walkTo(m, stopX, dt)) {
        if (i === 0 || m.state === 'attack') attackCycle(s, m, def, dt, canAct && i === 0, () => {
          if (Math.abs(m.x - hero.x) <= def.contact + 6) hurtHero(s, m);
        });
      }
      limit = m.x;
    });
  }
  for (const m of living(s)) {
    const def = defOf(s, m);
    if (isRanged(def)) archerStep(s, m, def, dt, canAct);
    else if (isProjectile(def)) { // arrows fly to the hero and hit once
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
    if (a.id) { // an edge warning leaves once its monster is on screen; an archer's "!" goes with the archer
      const m = s.monsters.find(x => x.id === a.id);
      if (!m || m.state === 'dead' || (a.k !== 'aim' && m.x > 0 && m.x < W)) a.t = Math.max(a.t, a.dur);
    }
  }
  s.alerts = s.alerts.filter(a => a.t < a.dur);
}

// boss minions: each HP phase calls one Init_ZZoL_Scenario script once, after DelayTime(boss walkTime)
function bossHit(s) {
  const z = s.stage.zzol;
  if (!z || s.zzol || s.zzolStart || s.zzolPhase >= z.phases.length) return;
  const b = s.boss;
  const raw = b.hpMax * 2; // the C++ compares with the raw GameData HP (x2)
  const ph = z.phases[s.zzolPhase];
  if (b.hp > raw * ph.hpLo && b.hp <= raw * ph.hpHi) {
    const pat = ph.pattern === 'rand3' ? Math.floor(s.rng() * 3) : ph.pattern;
    s.zzolPhase++;
    s.zzolStart = { pat, at: s.clock + defOf(s, b).walkTime };
  }
}

function updateZzol(s) {
  const z = s.stage.zzol;
  if (!z) return;
  if (s.zzolStart && s.clock >= s.zzolStart.at) {
    s.zzol = { pat: s.zzolStart.pat, t0: s.clock, next: 0 };
    s.zzolStart = null;
    emit(s, 'summon', { pattern: s.zzol.pat });
  }
  if (s.zzol) {
    const pat = z.patterns[s.zzol.pat];
    while (s.zzol.next < pat.length && s.zzol.t0 + pat[s.zzol.next].k * z.tick <= s.clock) spawn(s, pat[s.zzol.next++]);
    if (s.clock >= s.zzol.t0 + z.end[s.zzol.pat] * z.tick) s.zzol = null;
  }
}

function updateHero(s, dt) {
  const hero = s.hero;
  const H_ = s.stage.hero;
  hero.st += dt;
  hero.lock = Math.max(0, hero.lock - dt);
  hero.hurt = Math.max(0, hero.hurt - dt);
  hero.shield = Math.max(0, hero.shield - dt);
  if (s.phase === 'play') hero.dashCd = Math.max(0, hero.dashCd - dt);
  if (hero.dashT > 0) {
    hero.dashT = Math.max(0, hero.dashT - dt);
    const p = 1 - hero.dashT / DASH_TIME;
    hero.offX = hero.facing * (W / 2 - 40) * Math.sin(Math.PI * p);
    hero.state = hero.dashT > 0 ? 'dash' : 'idle';
    return;
  }
  if (hero.state === 'attack' && hero.st >= H_.attackTime) { hero.state = 'idle'; hero.st = 0; }
  hero.offX = 0;
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
      while (s.nextWave < waves.length && waves[s.nextWave].t <= s.clock) playWave(s, waves[s.nextWave++]);
      if (s.stage.finalMarker !== undefined && s.clock >= s.stage.finalMarker) s.finalPassed = true;
      for (const p of s.pending.filter(q => q.at <= s.clock)) spawn(s, p.w);
      s.pending = s.pending.filter(q => q.at > s.clock);
      updateZzol(s);
      updateHero(s, dt);
      updateMonsters(s, dt);
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

// Auto-player for ?bot and the tests. opts.react: seconds before reacting to a monster entering the area,
// opts.err: chance of slashing the wrong way, rng: () => [0,1). Dashes toward a side with 2+ monsters on screen.
export function createBot(opts = {}, rng = Math.random) {
  const react = opts.react ?? 0;
  const err = opts.err ?? 0;
  const seen = new Map();
  return function bot(s, dt) {
    if (s.phase !== 'play' || s.paused || s.hero.state === 'dead' || s.hero.dashT > 0) return;
    if (s.skillCharges > 0 && living(s).filter(m => Math.abs(m.x - s.hero.x) < 160).length >= 3) { skill(s); return; }
    if (s.hero.dashCd <= 0) { // the dash pays off on a crowded side
      for (const side of [-1, 1]) {
        const n = living(s).filter(m => (m.x - s.hero.x) * side > 0 && m.x > 0 && m.x < W && !s.stage.monsters[m.type].projectileOf).length;
        if (n >= 2) { dash(s, side); return; }
      }
    }
    let best = null;
    for (const side of [-1, 1]) {
      for (const m of inArea(s, side)) {
        seen.set(m.id, (seen.get(m.id) || 0) + dt);
        if (seen.get(m.id) >= react && (!best || Math.abs(m.x - s.hero.x) < Math.abs(best.x - s.hero.x))) best = m;
      }
    }
    if (best && s.hero.lock <= 0) {
      let side = best.x < s.hero.x ? -1 : 1;
      if (rng() < err) side = -side;
      attack(s, side);
    }
  };
}
