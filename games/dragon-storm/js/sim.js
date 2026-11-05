// Dragon Storm stage simulation: pure logic, no DOM, so node tests can drive it directly.
// One side-view lane, the knight is fixed in the centre, monsters walk in from both edges, the player slashes left or
// right (triangle pads), dashes with the red button (the knight's class skill) and uses Sword Storm with the blue one.
// Every number comes from data/stageNN.json, generated from libMyGame.so by tools/gen_stages.py; each value there is
// tagged with its C++ source (Scene_Stage / Scene_UI function + address) or marked PLACEHOLDER / CLIP-MEASURED.

export const W = 480;
export const H = 800;
export const GROUND_Y = 430;
export const HERO_X = 240;
// guardians: fly in after DelayTime(2.0) + MoveTo(0.3) (Init_Guardian @0x57a730); station height and patrol are web values
const GUARD_Y = 230;
const GUARD_DELAY = 2.3;
const GBULLET_SPEED = 280; // MoveTo(5.0 s) over the 1400 px from the guardian to y = -800 (cocos), Guardian_Bullet
const SLASH_BAND = 80; // how far above the lane a flyer can still be slashed (not measured: inferred)
const LANE_Y = 0.48; // monster centre height (GameData+0x124b8 = 0.48*H from the bottom)
const BOMB_R = 60; // explosion radius (FUC_CHECK_BOMB_AREA_AND_HIT_MONSTERS @0x59e8d4; rect size not recovered: web value)
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
// Difficulty (data/meta.json difficulty.modes, Monster::Init_Monster001 @0x5729e8): mode, atkMul (monster ATK), walkMul
// (monster walkTime), coin (value of each coin drop, Scene_UI::FUC_SELECT_ITEM @0x5eda54).
// Boosters carried in (min(owned, cap), Scene_Stage::Init_Data @0x5760cc): potions, shields, storms.
// Defaults = the level-0 knight on NORMAL with no boosters.
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
    // equipped items: crit % added to the knight's 1 (cap 30), "SKILL COOL TIME -v" off the dash timer (floor 5 s)
    // (getPlayerInfo @0x620794). opts.dashStartCd: the stage-1 tutorial starts with the dash charging (TUTO06 fires when
    // the gauge fills; inferred: main.js sets hero.dashCd = dashMax)
    critChance: Math.min(30, h.critChance + (opts.critBonus || 0)),
    // skill cooldown: the hero table says 20 s (35 s Elizabeth; GD+0x95e8, shown as SKILL COOL 20) but the gauge refills in
    // 10 s in the clip, so the clip time scales by hero (inferred: the timer runs at twice the stat)
    hero: { x: HERO_X, offX: 0, hp, hpMax: hp, facing: 1, state: 'idle', st: 0, lock: 0, lockMax: 1, hurt: 0, shield: 0, dashMax: Math.max(Math.min(5, h.dash.cooldown * (opts.cooldown || 20) / 20), h.dash.cooldown * (opts.cooldown || 20) / 20 - (opts.cdCut || 0)), dashCd: 0, dashT: 0 },
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
    potions: opts.potions ?? h.potions,
    shields: opts.shields ?? h.shields,
    mode: opts.mode ?? 0,
    atkMul: opts.atkMul ?? 1,
    walkMul: opts.walkMul ?? 1,
    coinValue: opts.coin ?? 1,
    autoOpen: !!opts.autoOpen, // AUTO play available for this stage + mode
    auto: false,
    won: false,
    tutoHold: false,
    // equipped guardians (WING tab): [{ side 'L'|'R', kind, lv, style, tier, crit }] -> flying helpers (Init_Guardian @0x57a730)
    guardians: (opts.guardians || []).map(g => ({ ...g, x: g.side === 'L' ? 60 : W - 60, y: GUARD_Y, fireT: 0, t: -GUARD_DELAY })),
    gbullets: [],
    gexp: 0, // guardian EXP earned this stage (FUC_GET_SCORE @0x602bc4)
    // pickups (FUC_SELECT_ITEM02): seconds left per effect; durations 10 + ability level (BERSERKER 13 + level)
    buffs: { score: 0, atk: 0, def: 0, berserk: 0 },
    buffTime: { score: 10, atk: 10, def: 10, berserk: 13, ...(opts.buffTime || {}) },
    pickups: [], // flying pickups { type, x, t }
    berserkT: 0,
    reviveOffer: !!opts.reviveOffer, revives: 0, offer: null, baseHp: opts.baseHp ?? hp,
    goldMul: opts.goldMul ?? 1, // Destiny 2x GOLD (x2), Teresa x2
    boosterBonus: opts.boosterBonus ?? 0, // Destiny DROPS BOOSTER OFTEN: +2000 / 10001
    forcedDrops: opts.forcedDrops || null, // stage-2 tutorial: { killCount: type }
    destiny: opts.destiny ?? null,
    gems: [], // big coins flying (render)
    storm: null, // Sword Storm in progress { timer, acc }
    swords: [], // flying storm swords { k, t, x, y }
    used: { potion: 0, shield: 0, storm: 0 },
    stars: 0,
    events: [],
    tally: {}, // event counts for the tests
  };
}

const emit = (s, type, data = {}) => { s.events.push({ ...data, type }); s.tally[type] = (s.tally[type] || 0) + 1; };
export const living = s => s.monsters.filter(m => m.state !== 'dead');
export const totalMonsters = s => s.stage.waves.length;
// stars at T/3, T/2, T with integer division (Scene_UI::FUC_GET_SCORE @0x603100)
export const starScores = st => st.starMarks.map(f => Math.floor(f * st.scoreBar));
const defOf = (s, m) => s.stage.monsters[m.type];
const isRanged = def => !!def.ranged;
const isProjectile = def => !!def.projectileOf;

function setPhase(s, phase) {
  if (phase === 'clear') s.won = true;
  if (phase === 'clear' || phase === 'fail') s.hero.held = null;
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
    const def = defOf(s, m);
    if (def.untargetable || m.ghost || (!def.bandFree && (m.dy || 0) < -SLASH_BAND)) return false;
    const d = (m.x - s.hero.x) * side;
    const half = def.box / 2;
    return d + half > near && d - half < far;
  });
}

// Slash toward side (-1 left, +1 right). Returns 'hit' | 'kill' | 'miss' | null (input ignored). Every monster in the
// area takes a hit (Scene_Stage::update tests each against the collision sprite).
export function attack(s, side) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || hero.lock > 0 || hero.dashT > 0) return null;
  const H_ = s.stage.hero;
  if (hero.held) { // held by a dark-tree arm: two alternating taps break free (FUC_AUTO_PLAY counts them)
    if (hero.held.last !== side) hero.held.taps++;
    hero.held.last = side;
    hero.facing = side;
    emit(s, 'struggle', { taps: hero.held.taps });
    if (hero.held.taps >= hero.held.need) { hero.held.arm.armT = Math.max(hero.held.arm.armT, 99); hero.held = null; emit(s, 'free'); }
    return 'struggle';
  }
  hero.facing = side;
  hero.state = 'attack';
  hero.st = 0;
  s.attacks++;
  const targets = inArea(s, side);
  if (!targets.length && s.buffs.berserk > 0) { hero.lock = hero.lockMax = H_.attackTime; return 'swing'; } // BERSERKER: no miss
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
    let dmg = calcDamage(s.atk * (s.buffs.atk > 0 ? 2 : 1), defOf(s, m).def, s.rng); // x2 ATK pickup
    // "PERFECT": rand()%100 < player+0x560 (1 for the knight) doubles the hit (Scene_Stage::update @0x592744)
    const crit = Math.floor(s.rng() * 100) < (s.critChance ?? H_.critChance);
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
    if (d > -20 && m.x > -10 && m.x < W + 10) damageMonster(s, m, calcDamage(s.power * (s.buffs.atk > 0 ? 2 : 1), defOf(s, m).def, s.rng), side, false);
  }
  return true;
}

// the red button
export const attackFacing = s => (s.hero.held ? attack(s, s.hero.held.last === -1 ? 1 : -1) : dash(s)); // held: the red button struggles too

function damageMonster(s, m, dmg, side, crit) {
  m.hp -= dmg;
  m.flash = 0.12;
  const def = defOf(s, m);
  if (m.hp > 0) {
    if (!isProjectile(def) && !def.noKnockback && !def.move) m.kx = side * 260; // knocked back (web; FUC_MONSTER_PUSHING not modelled)
    if (def.collapse && !isProjectile(def)) m.collapse = def.collapse.time; // skeleton falls to bones and rebuilds
    if (def.move) m.harmless = true; // rushers / swoopers: a slash makes them harmless until the next pass
    if (def.counter && s.rng() < def.counter.chance) { // mummy throws a bandage ball back
      const b = spawn(s, { type: def.counter.projectile, side: m.side > 0 ? 'R' : 'L' }, m.x);
      emit(s, 'shoot', { id: m.id, arrow: b.id });
    }
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
  const pts = (def.score + s.combo) * (s.buffs.score > 0 ? 2 : 1); // x2 SCORE pickup
  s.score += pts;
  // guardian EXP: kill points * 0.1 for monsters whose class field is 6 (Scene_UI::FUC_GET_SCORE @0x602bc4; inferred meaning)
  if (def.cls === 6 || def.cls2 === 6) s.gexp += pts * 0.1 * (s.gexpMul || 1); // x2 with DESTINY 2x G WING EXP
  s.combo++;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  // coins: rand()%10001 < GameData+0x7698[stage]; a boss always drops 5; projectiles (AI 3) drop nothing
  // (Scene_UI::FUC_SELECT_ITEM @0x5ed398 / @0x5ed40c)
  const coins = isProjectile(def) ? 0 : def.ai === 4 ? s.stage.bossCoins : (s.rng() < s.stage.coinChance ? 1 : 0);
  let gold = coins * s.coinValue * s.goldMul; // each coin is worth 1 / 2 (HARD) / 3 or 4 (HELL), x2 with 2x GOLD
  // big coin (a gem worth 10 / 20 / 30 gold): Scene_UI::FUC_SELECT_GEM @0x5ee5b8, rolled on every kill
  if (!isProjectile(def) && s.stage.bigCoinChance && s.rng() < s.stage.bigCoinChance) {
    const r = Math.floor(s.rng() * 1000);
    const k = r < 500 ? 0 : r < 800 ? 1 : 2;
    const v = s.stage.bigCoinValues[k] * s.coinValue * s.goldMul;
    gold += v;
    s.gemDrops = (s.gemDrops || 0) + 1;
    emit(s, 'gem', { x: m.x, kind: k, value: v });
  }
  s.gold += gold;
  // booster pickup: 2.5% per kill (+20% with DROPS BOOSTER OFTEN, cap 30%); type rand()%5 with 3 rerolled
  if (!isProjectile(def)) {
    let type = s.forcedDrops ? s.forcedDrops[s.kills] : undefined;
    if (type === undefined && s.rng() < Math.min(0.3, (s.stage.boosterChance || 0) + s.boosterBonus)) {
      do type = Math.floor(s.rng() * 5); while (type === 3);
    }
    if (type !== undefined) { s.pickups.push({ type, x: m.x, t: 0 }); emit(s, 'drop', { ptype: type, x: m.x }); }
  }
  if (s.boss === m) emit(s, 'bossDown', { id: m.id });
  emit(s, 'kill', { id: m.id, mtype: m.type, x: m.x, side, combo: s.combo, dmg, pts, gold, coins, crit });
  checkClear(s, m);
}

// FUC_HIT_MONSTER_FROM_LEFT/RIGHT @0x595248: a required monster dying after the end (9999) or final (7777) marker
// with no other required monster alive clears the stage; so does a boss dying after 7777. FUC_CLEAR_PROCCESS then
// kills what is left.
// The script has run out (9999 passed), every required monster that came is dead and none is waiting: clear. The C++
// clear test runs on a required kill after the end marker (FUC_HIT_MONSTER_FROM_LEFT/RIGHT @0x595248); a required boss
// that dies before the marker (stage 10's dark tree) would never meet it, so the web also checks when the script ends
// (inferred: the flags at +0x4a / +0x4b were not traced).
function endOfScript(s) {
  if (!s.requiredDied || s.phase !== 'play') return;
  const ended = s.clock >= s.stage.scriptEnd && s.nextWave >= s.stage.waves.length && !s.pending.length;
  if (ended && !living(s).some(o => o.required)) { for (const o of living(s)) { o.hp = 0; o.state = 'dead'; o.st = 0; } finishStage(s); }
}

function checkClear(s, m) {
  if (m.required) s.requiredDied = true;
  if (s.phase !== 'play') return;
  const ended = s.clock >= s.stage.scriptEnd && s.nextWave >= s.stage.waves.length && !s.pending.length;
  if (s.stage.tower) return; // the tower moves floor by floor (towerStep)
  let clear = false;
  if (m.required) clear = (ended || s.finalPassed) && !living(s).some(o => o.required) && !s.pending.some(p => p.w.required);
  else if (s.finalPassed && defOf(s, m).ai === 4) clear = true;
  if (!clear) return;
  for (const o of living(s)) { o.hp = 0; o.state = 'dead'; o.st = 0; }
  finishStage(s);
}

// Blue button: Sword Storm (Spirit of the Sword booster, up to 2 per stage). Call_Back_Ready_To_Sword_Storm @0x5c3844
// sets a timer of 5 s (+ GameData+0x9460 + 0x9478, both 0); SCH_CREATE_STORM_SWORD (every 0.08 s, Scene_Stage::init
// @0x575b10) takes 0.24 off it per tick while it is above 0 and throws a sword on each of 13 angles (0..180 deg, 15 deg
// apart) with a 50% roll. Each sword starts at the screen centre, flies one screen width in 0.6 s (MoveTo) and is
// spent on the first monster it touches: FUC_CALCULATE_DAMAGE(ceil(ATK/2), DEF) (Guardian_Bullet type 4, update
// @0x590fe8, removeObject @0x591150).
export function skill(s) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || s.skillCharges <= 0 || s.storm) return false;
  s.skillCharges--;
  s.used.storm++;
  s.storm = { timer: s.stage.hero.swordStorm.timer, acc: 0 };
  emit(s, 'skill', {});
  return true;
}

function updateStorm(s, dt) {
  const c = s.stage.hero.swordStorm;
  if (s.storm) {
    s.storm.acc += dt;
    while (s.storm && s.storm.acc >= c.tick) {
      s.storm.acc -= c.tick;
      if (s.storm.timer > 0) {
        s.storm.timer -= c.timerStep;
        for (let k = 0; k < c.angles; k++) if (s.rng() < c.chance) s.swords.push({ k, t: 0, x: c.startX, y: c.startY, id: s.nextId++ });
      } else s.storm = null;
    }
  }
  const atk = s.atk - Math.floor(s.atk / 2); // ceil(ATK/2) (SCH_CREATE_STORM_SWORD @0x58c398)
  for (const sw of s.swords) {
    sw.t += dt;
    const f = Math.min(1, sw.t / c.flight);
    const a = (sw.k * c.angleStep * Math.PI) / 180;
    sw.x = c.startX + Math.cos(a) * W * f;
    sw.y = c.startY - Math.sin(a) * W * f;
    // the sword sprite (35 x 58) points along its flight: its box half-extents for this angle
    const hw = (c.h / 2) * Math.abs(Math.cos(a)) + (c.w / 2) * Math.abs(Math.sin(a));
    const hh = (c.h / 2) * Math.abs(Math.sin(a)) + (c.w / 2) * Math.abs(Math.cos(a));
    for (const m of living(s)) {
      const box = defOf(s, m).box;
      if (Math.abs(m.x - sw.x) < hw + box / 2 && Math.abs(c.monsterY - sw.y) < hh + box / 2) {
        damageMonster(s, m, calcDamage(atk, defOf(s, m).def, s.rng), m.x < c.startX ? -1 : 1, false);
        sw.spent = true;
        break;
      }
    }
    if (f >= 1) sw.spent = true;
  }
  s.swords = s.swords.filter(sw => !sw.spent);
}

// Corner items: the potion is tapped (onTouchesBegan @0x5c5b04); the Divine Shield is not, it fires by itself when a
// monster hits (see hurtHero).
export function usePotion(s) {
  const hero = s.hero;
  if (s.phase !== 'play' || s.paused || hero.state === 'dead' || s.potions <= 0 || hero.hp >= hero.hpMax) return false;
  s.potions--;
  s.used.potion++;
  hero.hp = Math.min(hero.hpMax, hero.hp + Math.round(hero.hpMax * s.stage.hero.potionHeal));
  emit(s, 'potion', {});
  return true;
}

// kept for the keyboard / corner tap: the original has no tap on the shield slot, so this does nothing
export const useShield = () => false;

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
  const t = (w.fast ? def.walkTime / def.fastDiv : def.walkTime) * s.walkMul; // HELL: walkTime x0.85
  const m = {
    id: s.nextId++, type: w.type, side, x, speed: Math.max(1, Math.abs(x - HERO_X) - stop) / t, stop,
    hp: def.hp, hpMax: def.hp, state: 'walk', st: 0, atkCd: def.atkDelay, flash: 0, kx: 0, hitDone: false,
    required: !!w.required,
  };
  if (def.move) initMove(s, m, def, w);
  if (def.lob) { m.x0 = m.x; m.dy = 0; m.lt = 0; }
  s.monsters.push(m);
  emit(s, 'spawn', { id: m.id, mtype: m.type, side });
  if (!isProjectile(def) && !def.untargetable && (x < 0 || x > W)) {
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
  if (hero.shield > 0) { emit(s, 'blocked', { id: m.id }); return; } // still in UNDEAD mode after a shield
  if (s.shields > 0) { // Divine Shield: one used, no damage, combo kept, UNDEAD 0.7 s (FUC_HIT_BY_MONSTER @0x5b9de4)
    s.shields--;
    s.used.shield++;
    hero.shield = s.stage.hero.shieldInvuln;
    emit(s, 'shieldUsed', { id: m.id });
    return;
  }
  const def = s.stage.monsters[m.type];
  // monster ATK (x1.5 HARD, x2 HELL) vs knight DEF (Scene_Stage::FUC_HIT_BY_MONSTER @0x5b9dd4)
  // x2 DEF pickup doubles DEF and keeps the combo ("2x DEF will also protect you from combo break", loading tip)
  const dmg = calcDamage(Math.trunc(def.atk * s.atkMul), s.def * (s.buffs.def > 0 ? 2 : 1), s.rng);
  hero.hp = Math.max(0, hero.hp - dmg);
  s.damageTaken += dmg;
  if (!(s.buffs.def > 0)) s.combo = 0;
  hero.hurt = s.stage.hero.hurtTime;
  emit(s, 'heroHurt', { id: m.id, dmg });
  if (hero.hp <= 0) {
    hero.state = 'dead';
    hero.st = 0;
    emit(s, 'heroDie', {});
    // the revive offer (USE POTION OF LIFE TO RESURRECT NOW, FUC_REVIVAL @0x592dc4) holds the stage until it is answered
    if (s.reviveOffer) { s.offer = { cost: 5 * (s.revives + 1), t: 0 }; emit(s, 'reviveOffer', { cost: s.offer.cost }); }
    else setPhase(s, 'fail');
  }
}

// Revive: full base HP (armor table, no equipment), a burst that hits the monsters around, a short invulnerability, and
// every pickup effect cleared (Scene_Stage::FUC_REVIVAL @0x592dc4, FUC_CHECK_REVIVAL_AREA_AND_HIT_MONSTERS @0x5c4530)
export function revive(s) {
  if (!s.offer) return false;
  const hero = s.hero;
  s.offer = null;
  s.revives++;
  hero.hp = hero.hpMax = s.baseHp;
  hero.state = 'idle'; hero.st = 0; hero.shield = 2.0;
  for (const k of Object.keys(s.buffs)) s.buffs[k] = 0;
  for (const m of living(s)) if (Math.abs(m.x - hero.x) < 160 && !defOf(s, m).untargetable) damageMonster(s, m, calcDamage(s.atk * 2, defOf(s, m).def, s.rng), m.x < hero.x ? -1 : 1, false); // burst radius / power: web values
  emit(s, 'revive', {});
  return true;
}
export function declineRevive(s) { if (!s.offer) return false; s.offer = null; setPhase(s, 'fail'); return true; }

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
    const T = def.walkTime * s.walkMul * r.retreatTimeMul;
    const f = Math.min(1, m.st / T);
    m.x = m.x0 + m.side * W * r.retreat * (f >= 1 ? 1 : 1 - Math.pow(2, -10 * f));
    if (m.st >= T + r.removeDelay) { m.hp = 0; m.state = 'dead'; m.st = DEAD_BODY_TIME; m.gone = true; emit(s, 'gone', { id: m.id }); }
  }
}

function updateMonsters(s, dt) {
  const hero = s.hero;
  const canAct = hero.state !== 'dead' && s.phase === 'play';
  for (const side of [-1, 1]) {
    const lane = living(s).filter(m => m.side === side && !isRanged(defOf(s, m)) && !isProjectile(defOf(s, m)) && !defOf(s, m).move)
      .sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x));
    let limit = null;
    lane.forEach((m, i) => {
      const def = defOf(s, m);
      const dir = -side;
      const stopX = i === 0 ? hero.x - dir * def.contact : limit - dir * QUEUE_GAP;
      stepCommon(m, dt);
      if (m.collapse > 0) { m.collapse -= dt; limit = m.x; return; }
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
    if (def.move) moveStep(s, m, def, dt, canAct);
    else if (isRanged(def)) archerStep(s, m, def, dt, canAct);
    else if (def.lob) lobStep(s, m, def, dt, canAct);
    else if (isProjectile(def)) { // arrows fly to the hero and hit once
      stepCommon(m, dt);
      if (walkTo(m, hero.x + m.side * def.contact, dt)) {
        if (canAct) { hurtHero(s, m); if (def.blind) s.blind = def.blind.time; }
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
    s.zzolStart = { pat, at: s.clock + defOf(s, b).walkTime * s.walkMul };
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
  s.blind = Math.max(0, (s.blind || 0) - dt);
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
  if (s.paused || s.tutoHold || s.offer) return; // tutoHold: a tutorial step is on screen (js/ftue.js, FUC_UI_PAUSE); offer: revive popup
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
      updateStorm(s, dt);
      updateGuardians(s, dt);
      updatePickups(s, dt);
      if (s.stage.tower) towerStep(s);
      else endOfScript(s);
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

// AUTO play (Scene_Stage::FUC_AUTO_PLAY @0x59854c, run from update while GameData+0x4b42 is set): the nearest monster on
// each side; when its hit box meets the attack area the knight slashes that way (Call_Back_Attack_Left / _Right). No
// dash, no items, no misses.
export function autoPlay(s) {
  if (!s.auto || s.phase !== 'play' || s.paused || s.hero.state === 'dead' || s.hero.lock > 0 || s.hero.dashT > 0) return;
  if (s.hero.held) { attack(s, s.hero.held.last === -1 ? 1 : -1); return; }
  let best = null;
  for (const side of [-1, 1]) for (const m of inArea(s, side)) if (!best || Math.abs(m.x - s.hero.x) < Math.abs(best.m.x - s.hero.x)) best = { m, side };
  if (best) attack(s, best.side);
}

export function toggleAuto(s) {
  if (!s.autoOpen || s.phase === 'result') return false;
  s.auto = !s.auto;
  emit(s, 'auto', { on: s.auto });
  return true;
}

// Auto-player for ?bot and the tests. opts.react: seconds before reacting to a monster entering the area,
// opts.err: chance of slashing the wrong way, rng: () => [0,1). Dashes toward a side with 2+ monsters on screen.
export function createBot(opts = {}, rng = Math.random) {
  const react = opts.react ?? 0;
  const err = opts.err ?? 0;
  const seen = new Map();
  return function bot(s, dt) {
    if (s.phase !== 'play' || s.paused || s.hero.state === 'dead' || s.hero.dashT > 0) return;
    if (s.hero.held) { attack(s, s.hero.held.last === -1 ? 1 : -1); return; } // break free: alternate sides
    if (s.potions > 0 && s.hero.hp < s.hero.hpMax * 0.4) usePotion(s);
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

// Guardians (WING tab). Each one patrols its side above the lane and fires by style (SCH_CREATE_MISSILE_* @0x58c5f8 ...):
// straight / homing every 0.12 s (0.0843 s for LEGEND), bomb every 0.7 s, item maker: pickups are not built (no shot).
// Bullet damage 2*(level+1); tier >= 1 crits x2 when rand()%100 < crit + 15; a guardian bullet never takes a monster
// below 1 HP (FUC_CALCULATE_DAMAGE_FOR_GUARDAIN @0x607e84): the knight lands the kill.
function updateGuardians(s, dt) {
  if (!s.guardians.length && !s.gbullets.length) return;
  const F = { interval: [0.12, 0.12, 0.7, null], legend: 0.0843 };
  for (const g of s.guardians) {
    g.t += dt;
    if (g.t < 0) continue;
    const dir = g.side === 'L' ? -1 : 1;
    g.x = HERO_X + dir * (125 + 70 * Math.sin(g.t * 1.3)); // patrol (FUC_START_LEFT_GUARDIAN_MOVE @0x58db1c; path is a web value)
    g.y = GUARD_Y + 10 * Math.sin(g.t * 2.1);
    // ITEM style: makes a booster every max(10, 20 - 0.5 * level) s (Init_Guardian @0x57a730); the type uses the kill-drop
    // roll (rand()%5, 3 rerolled) - inferred, the maker's own roll was not traced
    const iv = g.tier === 2 ? F.legend : g.style === 3 ? Math.max(10, 20 - 0.5 * g.lv) : F.interval[g.style];
    if (!iv) continue;
    if (g.style === 3) {
      if (g.fireT === 0) g.fireT = iv; // the first item comes one interval after the guardian arrives
      g.fireT -= dt;
      if (g.fireT > 0) continue;
      g.fireT += iv;
      let type;
      do type = Math.floor(s.rng() * 5); while (type === 3);
      s.pickups.push({ type, x: g.x, t: 0 });
      emit(s, 'drop', { ptype: type, x: g.x, guardian: true });
      continue;
    }
    g.fireT -= dt;
    if (g.fireT > 0) continue;
    g.fireT += iv;
    const shot = dx => s.gbullets.push({ x: g.x + dx, y: g.y + 20, style: g.style, tier: g.tier, crit: g.crit, dmg: 2 * (g.lv + 1), side: g.side, vx: 0, vy: GBULLET_SPEED, t: 0 });
    shot(0);
    if (g.kind === 24) shot(-18); // DRAGONVALKYRIE: double shot (createGuardian_Bullet, tier 2)
  }
  const hitOne = (b, m) => {
    let dmg = Math.max(1, b.dmg);
    const crit = b.tier >= 1 && Math.floor(s.rng() * 100) < b.crit + 15;
    if (crit) dmg *= 2;
    m.hp = Math.max(1, m.hp - dmg);
    emit(s, 'ghit', { id: m.id, x: m.x, dmg, crit });
  };
  const live = s.monsters.filter(m => m.state !== 'dead' && !isProjectile(defOf(s, m)));
  for (const b of s.gbullets) {
    b.t += dt;
    if (b.style === 1) { // homing: steer toward the closest monster
      let best = null;
      for (const m of live) if (!best || Math.abs(m.x - b.x) < Math.abs(best.x - b.x)) best = m;
      if (best) {
        const dx = best.x - b.x;
        const dy = GROUND_Y - 40 - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.vx = (dx / d) * GBULLET_SPEED;
        b.vy = (dy / d) * GBULLET_SPEED;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < GROUND_Y - 90) continue;
    const m = live.find(o => Math.abs(o.x - b.x) <= (defOf(s, o).box || 50) / 2 + 6);
    if (b.style === 2 && (m || b.y >= GROUND_Y - 20)) {
      for (const o of live) if (Math.abs(o.x - b.x) <= BOMB_R) hitOne(b, o);
      emit(s, 'gbomb', { x: b.x });
      b.dead = true;
    } else if (m) { hitOne(b, m); b.dead = true; }
    if (b.y > GROUND_Y + 40 || b.t > 5) b.dead = true;
  }
  s.gbullets = s.gbullets.filter(b => !b.dead);
}

// DEATH TOWER: a floor is done when its script has run out and nothing spawned is left (the last entry carries mode 1 on
// most floors); then the lift goes up (FUC_MOVE_TO_NEXT_FLOOR @0x70709c ... 04, S_GOINGUP) and the next floor's script
// starts. Floors are min(floor, 49) in the original; the web stops after the last floor it has (finishStage = clear).
function towerStep(s) {
  const T = s.stage.tower;
  const ended = s.clock >= s.stage.scriptEnd && s.nextWave >= s.stage.waves.length && !s.pending.length;
  if (!ended || living(s).length) return;
  if (T.floor + 1 >= T.floors.length) { s.towerTop = true; finishStage(s); return; }
  T.floor++;
  const f = T.floors[T.floor];
  s.stage.waves = f.waves;
  s.stage.scriptEnd = f.scriptEnd;
  s.nextWave = 0;
  s.clock = -T.lift; // the lift ride before the next floor's first entry
  s.score += T.floorBonus;
  emit(s, 'floor', { floor: T.floor + 1 });
}

// ---- stages 6-15 movers (meta/re_notes/monsters_6_15.md). Heights are cocos fractions of H (y up); m.dy is the screen
// offset from the lane (negative = higher). ----
const dyOf = yf => (LANE_Y - yf) * H;
const bez = (p0, c1, c2, p1, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1; };
function initMove(s, m, def, w) {
  const mv = def.move;
  const fw = def.fw || def.contact * 2;
  const T = (w.fast ? def.walkTime / def.fastDiv : def.walkTime) * s.walkMul;
  m.mv = { ph: 'in', t: 0, T };
  if (mv.kind === 'fly') {
    const [fx, fy] = mv.from[m.side > 0 ? 'R' : 'L'];
    m.x0 = fx * W; m.y0 = dyOf(fy); m.x = m.x0; m.dy = m.y0;
    m.x1 = HERO_X + m.side * def.contact; m.y1 = dyOf(mv.toY);
  } else if (mv.kind === 'swoop') {
    m.dy = dyOf(mv.y0);
  } else if (mv.kind === 'tree') {
    m.x = HERO_X; m.side = 1; m.dy = 300;
    m.y1 = -(0.48 * H + 50 + 0.6 * 271 - LANE_Y * H); // trunk centre at 0.48H + 50 + 0.6*271 (CREATE_BOSS @0x5a05d8)
    m.mv.armsAt = mv.armsAt; m.mv.next = mv.armsAt + mv.armIn; // the left arm's MoveTo(0.5 s) calls the first pass
    m.ghost = true; // FUC_RESUME_UPDATE comes after the rise: no hits until then (inferred)
  } else if (mv.kind === 'lich') {
    m.ghost = true; m.mv.k = 0; m.mv.ph = 'flicker'; m.alpha = 0;
  } else if (mv.kind === 'arm') {
    m.dy = dyOf(0.5); m.armT = 99;
  }
  if (mv.kind === 'rush' || mv.kind === 'swoop') {
    m.mv.edge = m.side > 0 ? W - (mv.edgeFrac ?? mv.toEdge) * fw : (mv.edgeFrac ?? mv.toEdge) * fw;
    m.speed = Math.abs(m.x - m.mv.edge) / (mv.kind === 'swoop' ? 0.6 : T); // the swoop's first MoveTo is 0.3 s from its spawn spot (web: 0.3 s x2 from off screen)
  }
}
function contactHit(s, m, canAct, reach = 34) {
  if (!canAct || m.harmless || m.hitPass) return;
  if (Math.abs(m.x - s.hero.x) < reach && (m.dy || 0) > -SLASH_BAND) { m.hitPass = true; hurtHero(s, m); }
}
function moveStep(s, m, def, dt, canAct) {
  const mv = def.move;
  const st = m.mv;
  m.flash = Math.max(0, m.flash - dt);
  st.t += dt;
  m.st += dt;
  const fw = def.fw || def.contact * 2;
  if (mv.kind === 'rush') { // walk to the edge, "!", wind-up, dash across, reappear on the other side
    if (st.ph === 'in') {
      if (walkTo(m, st.edge, dt)) { st.ph = 'pause'; st.t = 0; m.state = 'aim'; s.alerts.push({ k: 'aim', side: m.side, id: m.id, t: 0, dur: mv.pause }); }
    } else if (st.ph === 'pause' && st.t >= mv.pause) { st.ph = 'wind'; st.t = 0; m.state = 'attack'; m.st = 0; emit(s, 'monsterAttack', { id: m.id, mtype: m.type }); }
    else if (st.ph === 'wind' && st.t >= mv.wind) { st.ph = 'dash'; st.t = 0; m.st = 0.12; }
    else if (st.ph === 'dash') {
      m.x -= m.side * (W / st.T) * dt;
      contactHit(s, m, canAct);
      if (st.t >= st.T) { // RESET: the other side, off screen, flipped
        m.side = -m.side; m.x = m.side > 0 ? W + fw : -fw; st.edge = m.side > 0 ? W - mv.edgeFrac * fw : mv.edgeFrac * fw;
        st.ph = 'in'; st.t = 0; m.harmless = false; m.hitPass = false; m.state = 'walk'; m.speed = Math.abs(st.edge - m.x) / st.T;
      }
    }
    return;
  }
  if (mv.kind === 'swoop') { // to the edge at 0.75H, wait, Bezier dip across the knight, flip, again
    if (st.ph === 'in') {
      m.x += Math.sign(st.edge - m.x) * Math.min(Math.abs(st.edge - m.x), m.speed * dt * 2);
      if (Math.abs(st.edge - m.x) < 1) { st.ph = 'wait'; st.t = 0; }
    } else if (st.ph === 'wait' && st.t >= mv.wait) { st.ph = 'swoop'; st.t = 0; st.x0 = m.x; m.state = 'walk'; }
    else if (st.ph === 'swoop') {
      const p = Math.min(1, st.t / st.T);
      const x1 = W - st.x0;
      const y0 = mv.y0 * H;
      m.x = bez(st.x0, x1, HERO_X, x1, p);
      m.dy = dyOf(bez(y0, y0, mv.ctrlY * H, y0, p) / H);
      contactHit(s, m, canAct, 40);
      if (p >= 1) { m.side = -m.side; st.ph = 'wait'; st.t = 0; m.harmless = false; m.hitPass = false; }
    }
    return;
  }
  if (mv.kind === 'fly') { // straight MoveTo to the knight's side at 0.5H, then the walker attack loop
    if (st.ph === 'in') {
      const p = Math.min(1, st.t / st.T);
      m.x = m.x0 + (m.x1 - m.x0) * p;
      m.dy = m.y0 + (m.y1 - m.y0) * p;
      m.state = 'walk';
      if (p >= 1) { st.ph = 'fight'; m.state = 'wait'; m.st = 0; }
    } else attackCycle(s, m, def, dt, canAct, () => { if (Math.abs(m.x - s.hero.x) <= def.contact + 6) hurtHero(s, m); });
    return;
  }
  if (mv.kind === 'tree') { // rises from below (Delay 1.0, MoveTo 3.0 s), then sends an arm at the knight every 2.9 s
    const [d0, rise] = mv.rise;
    const p = Math.max(0, Math.min(1, (st.t - d0) / rise));
    m.dy = 300 + (m.y1 - 300) * p;
    if (st.t >= d0 + rise) m.ghost = false;
    if (!st.arms && st.t >= st.armsAt) {
      st.arms = ['L', 'R'].map(sd => spawn(s, { type: def.armType || 'tree_arm', side: sd }, sd === 'L' ? -128 + 0.1 * W : W + 128 - 0.1 * W));
    }
    if (st.arms && st.t >= st.next) {
      st.next = st.t + mv.armEvery;
      const arm = st.arms[Math.floor(s.rng() * 2)];
      if (arm && arm.state !== 'dead') arm.armT = 0;
    }
    if (st.arms) for (const a of st.arms) if (a.state !== 'dead') armStep(s, a, mv, dt, canAct);
    return;
  }
  if (mv.kind === 'lich') return lichStep(s, m, def, mv, dt, canAct);
}
// a dark-tree arm: in over 0.4 s to x = W/2 -+ 128 (its tip at the knight), hold 1.0 s, back over 0.4 s; touching the
// knight holds him (FUC_SHAKE_MONSTER_FOR_HOLDING @0x5baebc; no damage found)
function armStep(s, a, mv, dt, canAct) {
  const rest = a.side < 0 ? -128 + 0.1 * W : W + 128 - 0.1 * W;
  const peak = a.side < 0 ? 0.5 * W - 128 : 0.5 * W + 128;
  a.armT += dt;
  const tin = 0.4;
  const t = a.armT;
  const p = t < tin ? t / tin : t < tin + mv.armHold ? 1 : t < 2 * tin + mv.armHold ? 1 - (t - tin - mv.armHold) / tin : 0;
  a.x = rest + (peak - rest) * p;
  a.state = p > 0 ? 'attack' : 'wait';
  if (p >= 1 && canAct && !s.hero.held && !a.grabbed) {
    a.grabbed = true;
    s.hero.held = { arm: a, taps: 0, need: mv.freeTaps, last: 0 };
    s.hero.dashT = 0; s.hero.offX = 0; s.hero.state = 'idle'; // the hold stops whatever the knight was doing
    emit(s, 'held', { side: a.side });
  }
  if (p === 0) a.grabbed = false;
}
// lich: four attack-less flickers, then random left/right x high/low spots; the low spots slide in and attack
function lichStep(s, m, def, mv, dt, canAct) {
  const st = m.mv;
  const fw = def.fw || 124;
  const spot = k => ({ x: k & 1 ? W - fw / 2 : fw / 2, side: k & 1 ? 1 : -1, high: !(k & 2) });
  if (st.ph === 'flicker') {
    const order = [0, 1, 3, 2]; // left-high, right-high, right-low, left-low
    const sp = spot(order[st.k]);
    m.x = sp.x; m.side = sp.side; m.dy = sp.high ? dyOf(mv.highY) : 0;
    const u = st.t;
    m.alpha = u < 0.1 ? 0 : u < 0.35 ? (u - 0.1) / 0.25 : u < 0.6 ? 1 - (u - 0.35) / 0.25 : 0;
    m.ghost = true;
    if (u === dt) emit(s, 'ghost');
    if (u >= mv.flicker) { st.k++; st.t = 0; if (st.k >= mv.flickers) { st.ph = 'pick'; } }
    return;
  }
  if (st.ph === 'pick') {
    const sp = spot(Math.floor(s.rng() * 4));
    Object.assign(st, { ph: 'appear', t: 0, sp, x0: sp.x });
    m.x = sp.x; m.side = sp.side; m.dy = sp.high ? dyOf(mv.highY) : 0;
    return;
  }
  const atkT = def.atkDelay + 3 * def.atkFrame;
  if (st.ph === 'appear') {
    m.alpha = Math.min(1, st.t / mv.fade);
    if (!st.sp.high) m.x = st.x0 - st.sp.side * fw * mv.lowIn * Math.min(1, st.t / mv.lowTime);
    if (st.t >= (st.sp.high ? mv.fade : mv.lowTime)) { st.ph = 'attack'; st.t = 0; m.state = 'attack'; m.st = 0; m.hitDone = false; m.ghost = false; emit(s, 'monsterAttack', { id: m.id, mtype: m.type }); }
    return;
  }
  if (st.ph === 'attack') {
    if (!m.hitDone && st.t >= def.atkDelay + 2 * def.atkFrame) { m.hitDone = true; if (canAct && !st.sp.high) hurtHero(s, m); }
    if (st.t >= atkT) { st.ph = 'fade'; st.t = 0; m.state = 'wait'; }
    return;
  }
  if (st.ph === 'fade') {
    m.alpha = Math.max(0, 1 - st.t / mv.fade);
    if (st.t >= mv.fade) m.ghost = true;
    if (st.t >= mv.fade + mv.rest) { st.ph = 'pick'; st.t = 0; }
  }
}
// bandage ball: BezierTo(3.0 s) from the mummy to the knight, high arc; harmless for the first 1.1 s
function lobStep(s, m, def, dt, canAct) {
  m.flash = Math.max(0, m.flash - dt);
  m.lt += dt;
  m.st += dt;
  const p = Math.min(1, m.lt / def.lob.time);
  const dir = -m.side;
  const y0 = LANE_Y * H;
  m.x = bez(m.x0, m.x0 + dir * 0.4 * W, m.x0 + dir * 0.4 * W, HERO_X, p);
  m.dy = dyOf(bez(y0, y0, y0 + 0.4 * H, y0, p) / H);
  if (p >= 1) {
    if (canAct) hurtHero(s, m);
    m.hp = 0; m.state = 'dead'; m.st = 0; m.spent = true;
  }
}

const PICKUP_KEYS = ['score', 'atk', 'def', null, 'berserk'];
// pickups: tossed for 0.5 s (BezierTo), then collected by themselves (no tap) and applied; re-picking resets the timer
// (FUC_ITEM_DISSAPPEAR_AND_APPLY_EFFECT @0x5eff08). BERSERKER: the knight keeps slashing the way he faces, never missing.
function updatePickups(s, dt) {
  for (const p of s.pickups) {
    p.t += dt;
    if (p.t >= 0.5 && !p.got) {
      p.got = true;
      const k = PICKUP_KEYS[p.type];
      if (k) { s.buffs[k] = s.buffTime[k]; emit(s, 'pickup', { ptype: p.type, key: k }); }
    }
  }
  s.pickups = s.pickups.filter(p => p.t < 0.9);
  for (const k of Object.keys(s.buffs)) s.buffs[k] = Math.max(0, s.buffs[k] - dt);
  if (s.buffs.berserk > 0 && s.hero.state !== 'dead' && s.hero.lock <= 0 && !s.hero.held && s.hero.dashT <= 0) {
    s.berserkT -= dt;
    if (s.berserkT <= 0 && inArea(s, s.hero.facing).length) { s.berserkT = 0.15; attack(s, s.hero.facing); }
  }
}
