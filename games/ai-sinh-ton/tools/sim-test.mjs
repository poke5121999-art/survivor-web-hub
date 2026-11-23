// Behaviour of the battle sim, in Node: what the player is promised, checked on real runs.
// Usage: node games/ai-sinh-ton/tools/sim-test.mjs
import { createBattle, step, castUlt, pickCard, arenaNorm, SPAWN_K, battleReport, _test } from '../js/sim/battle.js';
import { heroDef, branchesOf, formKey } from '../js/data/beasts.js';
import { HEROES, HERO } from '../js/data/heroes.js';
import { ENEMIES, ENEMY } from '../js/data/enemies.js';
import { stageDef, bossOf, bossTierOf, HORDE } from '../js/data/stages.js';
import { CARD, CARDS } from '../js/data/cards.js';

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const team = (ids, mul = 1) => ids.map((id) => ({ id, mul }));
const START = ['tegiap', 'nhim', 'loc', 'chon'];

function play(opts, until) {
  const log = [];
  const B = createBattle({ ...opts, onEvent: (e) => log.push(e) });
  let n = 0;
  while ((B.phase === 'fight' || B.phase === 'pick') && n++ < 30 * 900) {
    if (until && until(B, log)) break;
    if (B.phase === 'pick') { if (opts.manualPick) break; for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B);
  }
  return { B, log };
}

// determinism
{
  const a = play({ stage: 2, seed: 5, team: team(START), auto: { ult: true, pick: 'best' } });
  const b = play({ stage: 2, seed: 5, team: team(START), auto: { ult: true, pick: 'best' } });
  const c = play({ stage: 2, seed: 6, team: team(START), auto: { ult: true, pick: 'best' } });
  const sig = (r) => `${r.B.phase}|${r.B.tick}|${r.B.kills}|${r.B.heroes.map((u) => Math.round(u.dealt)).join(',')}`;
  check(sig(a) === sig(b), `same seed gives the same battle (${sig(a)})`);
  check(sig(a) !== sig(c), 'another seed gives another battle');
}

// a full stage: five waves, the boss on wave 5, heroes target and attack on their own
{
  const { B, log } = play({ stage: 8, seed: 3, team: team(START, 1.6), auto: { ult: true, pick: 'best' } });
  const waves = log.filter((e) => e.e === 'wave');
  let wins = 0;
  for (let seed = 1; seed <= 20; seed++) if (play({ stage: 8, seed, team: team(START, 1.6), auto: { ult: true, pick: 'best' } }).B.phase === 'won') wins++;
  check(wins >= 18, `stage 8 with the four starters at level 8 is won on ${wins} of 20 seeds (at least 18; seed 3 here: ${B.phase}, wave ${B.wave})`);
  check(waves.length === 5 && waves.map((w) => w.n).join('') === '12345', 'five waves start in order');
  check(waves[4].boss === true && waves.slice(0, 4).every((w) => !w.boss), 'only wave 5 is the boss wave');
  const bossEv = log.find((e) => e.e === 'boss');
  check(!!bossEv && bossEv.kind === bossOf(8) && bossEv.t >= waves[4].t, `the stage boss (${bossOf(8)}) spawns in wave 5`);
  check(!log.some((e) => e.e === 'spawn' && e.boss && e.t < waves[4].t), 'no boss before wave 5');
  for (const u of B.heroes) {
    const atk = log.filter((e) => e.e === 'attack' && e.uid === u.uid).length;
    const s1 = log.filter((e) => e.e === 'cast' && e.uid === u.uid && e.slot === 's1').length;
    const s2 = log.filter((e) => e.e === 'cast' && e.uid === u.uid && e.slot === 's2').length;
    check(atk > 20 && s1 > 0 && s2 > 0, `${u.def.name} attacked ${atk} times and cast both skills by itself (${s1} / ${s2})`);
  }
  const targets = new Set(log.filter((e) => e.e === 'attack' && B.heroes.some((u) => u.uid === e.uid)).map((e) => e.to));
  check(targets.size > 30, `heroes spread their attacks over ${targets.size} different enemies`);
  check(log.filter((e) => e.e === 'pick').length === 4 && log.filter((e) => e.e === 'picked').length === 16, 'a pick after each of waves 1-4, one card per hero each time');
  check(B.heroes.every((u) => u.cards.length === 4), 'every hero ends the stage holding 4 cards');
}

// the ultimate: never by itself, flame event at full charge, the tap casts it and empties the charge
{
  const { B, log } = play({ stage: 1, seed: 9, team: team(START), auto: { ult: false, pick: 'best' } }, (b, l) => l.some((e) => e.e === 'ult_ready'));
  const ready = log.find((e) => e.e === 'ult_ready');
  check(!!ready, 'a hero reaches full charge and the ult_ready event fires');
  const u = B.heroes[ready.slot];
  check(u.ult >= 1 && u.ultReady === true, `${u.def.name} holds a full charge`);
  for (let i = 0; i < 90; i++) step(B);
  check(!log.some((e) => e.e === 'ult'), 'three seconds later nobody has cast an ultimate without the tap');
  const other = B.heroes.find((h) => h.ult < 1 && h.alive);
  check(other && castUlt(B, other.slot) === false, `tapping ${other ? other.def.name : '?'} below full charge does nothing`);
  const before = log.length;
  check(castUlt(B, u.slot) === true, 'the tap on the full hero casts');
  const ev = log.slice(before).find((e) => e.e === 'ult');
  check(!!ev && ev.uid === u.uid && ev.name === u.def.ult.name && u.ult === 0 && u.ultReady === false, `the ult event names ${u.def.ult.name} and the charge is back to 0`);
  check(castUlt(B, u.slot) === false, 'a second tap right after does nothing');
}

// the pick: the fight waits, each hero gets three different cards, the chosen card changes that hero only
{
  const { B } = play({ stage: 1, seed: 4, team: team(START), auto: { ult: true, pick: false }, manualPick: true });
  check(B.phase === 'pick' && B.wave === 1, 'after wave 1 the battle is in the pick phase');
  check(B.offers.length === 4 && B.offers.every((o) => o.length === 3 && new Set(o).size === 3 && o.every((id) => CARD[id])), 'each of the 4 heroes is offered 3 different cards');
  check(B.offers.every((o, i) => o.every((id) => !CARD[id].hero || CARD[id].hero === B.heroes[i].kind)), 'hero-only cards are offered to their hero only');
  const tick = B.tick; for (let i = 0; i < 60; i++) step(B);
  check(B.tick === tick, 'the fight does not run while cards are being picked');
  const u = B.heroes[0]; const hp0 = u.maxHp; const mods0 = JSON.stringify(u.mods); const other0 = JSON.stringify(B.heroes[1].mods);
  u.cards.length = 0; B.offers[0] = ['hp1', 'atk1', 'crit1'];
  check(pickCard(B, 0, 0) === true && Math.abs(u.maxHp - hp0 * 1.2) < 1e-6, `Bữa No raises ${u.def.name}'s max health by 20% (${Math.round(hp0)} -> ${Math.round(u.maxHp)})`);
  check(JSON.stringify(u.mods) !== mods0 && JSON.stringify(B.heroes[1].mods) === other0, 'the card changed that hero and not the next one');
  check(pickCard(B, 0, 1) === false, 'a hero cannot pick twice in one pick');
  check(B.phase === 'pick', 'the next wave waits for the other heroes');
  pickCard(B, 1, 0); pickCard(B, 2, 0); pickCard(B, 3, 0);
  check(B.phase === 'fight' && B.wave === 2, 'when all four have picked, wave 2 starts');
}

// cards are lost when the stage ends: a new battle starts clean
{
  const B = createBattle({ stage: 1, seed: 1, team: team(START) });
  const own = (u) => { const m = {}; if (u.def.dr) m.dr = u.def.dr; if (u.def.lifesteal) m.lifesteal = u.def.lifesteal; for (const p of u.def.passives) for (const k in p.mods || {}) m[k] = (m[k] || 0) + p.mods[k]; if (u.mv && u.mv.kind === 'stomp') m.kbRes = 1; return m; };
  check(B.heroes.every((u) => u.cards.length === 0 && JSON.stringify(u.mods) === JSON.stringify(own(u))), 'a new stage starts with no cards: the mods are the beast\'s own passives only');
}

// every hero: both skills and the ultimate fire in a real stage, units stay inside the arena
{
  for (const h of HEROES) {
    const ids = [h.id, ...['tegiap', 'loc', 'nhim', 'chon'].filter((x) => x !== h.id)].slice(0, 4);
    let out = 0;
    const { B, log } = play({ stage: 10, seed: 11, team: team(ids, 1.5), auto: { ult: true, pick: 'best' } }, (b) => { for (const u of b.heroes) if (arenaNorm(u.x, u.z) > 0.9 + 1e-6) out++; for (const e of b.enemies) if (arenaNorm(e.x, e.z) > SPAWN_K + 0.1) out++; return false; });
    const u = B.heroes[0];
    const c = (slot) => log.filter((e) => (e.e === 'cast' || e.e === 'ult') && e.uid === u.uid && e.slot === (slot === 'ult' ? 0 : slot)).length;
    const ults = log.filter((e) => e.e === 'ult' && e.uid === u.uid).length;
    check(c('s1') > 0 && c('s2') > 0 && ults > 0 && u.dealt > 0 && out === 0, `${h.name}: ${h.s1.name} x${c('s1')}, ${h.s2.name} x${c('s2')}, ${h.ult.name} x${ults}, dealt ${Math.round(u.dealt)}, every unit stayed inside the arena ellipse`);
  }
}

// every enemy kind fights, every boss casts every skill of its tier
{
  for (const e of ENEMIES.filter((x) => !x.boss)) {
    const stage = { ...stageDef(1), waves: [{ groups: [{ kind: e.id, n: Math.round(14 / e.cost), at: 0, ang: 0, spread: 1 }], boss: null }] };
    const { B, log } = play({ stage, seed: 2, team: team(START, 1.2), auto: { ult: false, pick: 'best' } });
    const hurt = B.heroes.reduce((s, u) => s + u.taken, 0);
    check(B.phase === 'won' && hurt > 0 && log.filter((x) => x.e === 'die').length >= Math.round(14 / e.cost), `${e.name}: ${Math.round(14 / e.cost)} of them hurt the team (${Math.round(hurt)}) and die`);
  }
  for (const e of ENEMIES.filter((x) => x.boss)) {
    const base = stageDef(1);
    const stage = { ...base, bossTier: 3, bossHp: 6, waves: [{ groups: [{ kind: e.id, n: 1, at: 0, ang: 0, spread: 0 }], boss: e.id }] };
    const { log } = play({ stage, seed: 2, team: team(['tegiap', 'loc', 'nhim', 'haily'], 4), auto: { ult: false, pick: 'best' } });
    const cast = new Set(log.filter((x) => x.e === 'cast' && x.boss).map((x) => x.name));
    const missing = e.skills.map((s) => s.name).filter((n) => !cast.has(n));
    check(missing.length === 0, `${e.name} (bậc 3) cast all ${e.skills.length} skills${missing.length ? ', missing: ' + missing.join(', ') : ''}`);
  }
}

// stage table
{
  check(bossTierOf(1) === 1 && bossTierOf(6) === 2 && bossTierOf(18) === 3, 'Khổng Lồ is tier 1 at stage 1, tier 2 at 6, tier 3 at 18');
  let ok = true; let prev = stageDef(1);
  for (let n = 2; n <= 60; n++) { const s = stageDef(n); if (!(s.hpMul > prev.hpMul && s.atkMul > prev.atkMul) || s.waves.length !== 5 || !s.waves[4].boss || !ENEMY[s.boss]) ok = false; prev = s; }
  check(ok, 'stages 1..60: enemy health and damage rise every stage, 5 waves, a boss on wave 5');
  check(stageDef(5).spike && stageDef(30).spike && !stageDef(4).spike, 'stages 5, 10, ... are the spike stages');
  check(JSON.stringify(stageDef(7)) === JSON.stringify(stageDef(7)), 'a stage is the same every time it is built');
  check(CARDS.length === 65 && new Set(CARDS.map((c) => c.id)).size === 65, `65 cards with unique ids (${CARDS.length})`);
  check(HEROES.length === 14 && HEROES.every((h) => HERO[h.id] && h.s1.ops.length && h.s2.ops.length && h.ult.ops.length), '14 beasts, each with two skills and an ultimate');
}

// the end-of-stage report is counted by the sim: hero damage adds up to the health the enemies really lost
{
  for (const [stage, ids, mul] of [[8, START, 1.6], [15, ['kyda', 'oc', 'bosat', 'loc'], 2.2], [30, START, 1]]) {
    const { B } = play({ stage, seed: 21, team: team(ids, mul), auto: { ult: true, pick: 'best' } });
    const R = battleReport(B);
    const heroDealt = R.reduce((s, r) => s + r.dealt, 0);
    const left = B.enemies.reduce((s, e) => s + (e.alive ? Math.max(0, e.hp) : 0), 0);
    const lost = B.book.enemyIn - left;
    check(Math.abs(B.book.enemyLost - lost) < 1e-6 * lost + 1e-3, `stage ${stage} (${B.phase}): health enemies came with (${Math.round(B.book.enemyIn)}) minus what is left (${Math.round(left)}) equals the health booked as lost (${Math.round(B.book.enemyLost)})`);
    check(Math.abs(heroDealt + B.book.other - B.book.enemyLost) < 1e-6 * lost + 1e-3, `stage ${stage}: hero damage ${Math.round(heroDealt)} + other causes ${Math.round(B.book.other)} = enemy health lost ${Math.round(B.book.enemyLost)}`);
    check(R.every((r) => Math.abs(r.bySrc.atk + r.bySrc.s1 + r.bySrc.s2 + r.bySrc.ult + r.bySrc.fx - r.dealt) < 1e-6 * r.dealt + 1e-3), `stage ${stage}: for every hero the five sources add up to its damage`);
    check(Math.abs(R.reduce((s, r) => s + r.share, 0) - 1) < 1e-9 && R.filter((r) => r.mvp).length === 1, `stage ${stage}: shares add to 100% and one hero is marked as carrying (${R.find((r) => r.mvp).id}, ${Math.round(R.find((r) => r.mvp).share * 100)}%)`);
    check(R.every((r) => Math.abs(r.aliveT + r.downT - B.t) < 0.05 && r.over >= 0 && r.cards.length === B.heroes[r.slot].cards.length), `stage ${stage}: time alive + time down = stage time (${B.t.toFixed(1)}s) for every hero`);
    if (stage === 8) {
      const mua = R.find((r) => r.id === 'nhim'); const yta = R.find((r) => r.id === 'loc');
      check(mua.bySrc.atk > 0 && mua.bySrc.s2 > 0 && mua.bySrc.ult > 0, `Nhím Gai: attacks ${Math.round(mua.bySrc.atk)}, Chùm Gai ${Math.round(mua.bySrc.s2)}, Mưa Kim (drones) ${Math.round(mua.bySrc.ult)} are booked under their own source`);
      check(yta.healed > 0 && yta.bySrc.fx > 0, `Lộc Đèn: healed allies ${Math.round(yta.healed)}, poison booked as effect damage ${Math.round(yta.bySrc.fx)}`);
      check(R.every((r) => r.end.atk >= r.start.atk && r.end.hp >= r.start.hp), 'end-of-stage stats are at least the starting stats after four cards');
    }
  }
}

// review defect 4: the report shows permanent stats only, so a slow or a timed buff at the final tick changes nothing
{
  const { B } = play({ stage: 8, seed: 21, team: team(START, 1.6), auto: { ult: true, pick: 'best' } });
  const clean = JSON.stringify(battleReport(B).map((r) => [r.start, r.end]));
  B.heroes[0].status.slow = { v: 0.6, t: 5 };
  B.heroes[1].buffs.push({ mods: { atk: 0.8, aspd: 0.5, crit: 0.4 }, t: 3 });
  const dirty = battleReport(B).map((r) => [r.start, r.end]);
  check(JSON.stringify(dirty) === clean, `a slowed hero and a hero with a timed attack buff report the same stats as without (${JSON.stringify(dirty[0][1])} vs ${JSON.stringify(JSON.parse(clean)[0][1])})`);
  check(battleReport(B).every((r) => ['atk', 'hp', 'aspd', 'crit'].every((k) => r.start[k] <= r.end[k] + 1e-9)), 'an untouched permanent stat shows no loss between start and end');
}

// review defect 5: a horde of frost corpses must not freeze the heroes much longer than the same waves without the horde multiplier
{
  const frozenTime = (horde1, seed) => {
    const keep = { ...HORDE };
    if (horde1) Object.assign(HORDE, { base: 1, perWave: 0, bossWave: 1 });
    let last = 0, total = 0, stage;
    try {
      stage = stageDef(20);
    } finally { Object.assign(HORDE, keep); }
    play({ stage, seed, team: team(START, 3), auto: { ult: true, pick: 'best' } }, (B) => { const dt = B.t - last; last = B.t; if (dt > 0) for (const u of B.heroes) if (u.alive && u.status.freeze) total += dt; return false; });
    return total;
  };
  let h = 0, flat = 0;
  // 160 seeds: one window of forty still swings by a third either way with nothing but the seeds changed
  for (let seed = 3; seed < 163; seed++) { h += frozenTime(false, seed); flat += frozenTime(true, seed); }
  check(flat > 1 && Math.abs(h - flat) <= 0.25 * flat, `stage 20, 160 seeds: hero freeze time with the horde ${h.toFixed(1)}s vs ${flat.toFixed(1)}s with the multiplier at 1 (within 25%)`);
}


// every form of every beast: its kit fires, its gait leaves its own mark, its hook passive acts
const FORMS = HEROES.flatMap((h) => [{ id: h.id, form: 1 }, { id: h.id, form: 2 }, ...(branchesOf(h.id).length ? branchesOf(h.id).map((b) => ({ id: h.id, form: 3, branch: b })) : [{ id: h.id, form: 3 }])]);
{
  check(FORMS.length === 47 && new Set(FORMS.map((f) => formKey(f.id, f.form, f.branch))).size === 47, `47 forms (14 beasts x 3, five of them branching at form 3): ${FORMS.length}`);
  const seenHooks = new Set();
  for (const spec of FORMS) {
    const def = heroDef(spec); const key = formKey(spec.id, spec.form, spec.branch);
    const mates = ['tegiap', 'loc', 'nhim', 'chon'].filter((x) => x !== spec.id).slice(0, 3).map((id) => ({ id, mul: 1.5 }));
    const air = []; const fx = new Set(); let out = 0;
    const { B, log } = play({ stage: 10, seed: 11, team: [{ ...spec, mul: 1.5 }, ...mates], auto: { ult: true, pick: 'best' } }, (b) => {
      const u = b.heroes[0]; if (u.alive) { air.push(!!u.air || !!u.mv.busy); if (u.moveFx) fx.add(u.moveFx); }
      for (const h of b.heroes) if (arenaNorm(h.x, h.z) > 0.9 + 1e-6 && !h.mv.busy) out++;
      return false;
    });
    const u = B.heroes[0];
    const n = (e, f) => log.filter((x) => x.e === e && x.uid === u.uid && (!f || f(x))).length;
    // a skill gated on a moment (Giáp Đá below 60% health) may not come in one won run: seeds 12 and 13 add their casts
    const kit = { s1: n('cast', (x) => x.slot === 's1'), s2: n('cast', (x) => x.slot === 's2'), ult: n('ult') }; let seeds = 1;
    for (let sd = 12; sd <= 13 && !(kit.s1 && kit.s2 && kit.ult); sd++, seeds++) {
      const r = play({ stage: 10, seed: sd, team: [{ ...spec, mul: 1.5 }, ...mates], auto: { ult: true, pick: 'best' } });
      const m = (e, f) => r.log.filter((x) => x.e === e && x.uid === r.B.heroes[0].uid && (!f || f(x))).length;
      kit.s1 += m('cast', (x) => x.slot === 's1'); kit.s2 += m('cast', (x) => x.slot === 's2'); kit.ult += m('ult');
    }
    check(kit.s1 > 0 && kit.s2 > 0 && kit.ult > 0 && u.dealt > 0 && out === 0,
      `${key} ${def.formName}: ${def.s1.name} x${kit.s1}, ${def.s2.name} x${kit.s2}, ${def.ult.name} x${kit.ult} over ${seeds} seed${seeds > 1 ? 's' : ''}, dealt ${Math.round(u.dealt)}, inside the arena`);
    const k = def.move.kind; const mv = (m) => n('move', (x) => x.k === m);
    const gait = {
      walk: () => [!air.some(Boolean), 'on the ground'],
      gallop: () => [!air.some(Boolean), 'on the ground'],
      hop: () => [fx.has('hop'), `hops (${[...fx]})`],
      leap: () => [mv('leap') > 0, `${mv('leap')} leaps`],
      roll: () => [mv('roll') > 0, `${mv('roll')} rolls`],
      slither: () => [!def.move.trail || log.some((x) => x.e === 'zone' && x.key === 'web'), def.move.trail ? 'leaves a trail' : 'slithers'],
      fly: () => [air.length > 0 && air.every(Boolean) && (!def.move.blink || mv('blink') > 0), `airborne every tick${def.move.blink ? `, ${mv('blink')} blinks` : ''}`],
      glide: () => [air.length > 0 && air.every(Boolean), 'airborne every tick'],
      swimAir: () => [air.length > 0 && air.every(Boolean) && (!def.move.blink || mv('blink') > 0), `airborne every tick${def.move.blink ? `, ${mv('blink')} blinks` : ''}`],
      blink: () => [mv('blink') > 0, `${mv('blink')} blinks`],
      burrow: () => [mv('burrow') > 0 && mv('emerge') === mv('burrow') - (u.under ? 1 : 0), `${mv('burrow')} digs, ${mv('emerge')} come-ups`],
      stomp: () => [fx.has('stomp') && u.mods.kbRes === 1, 'stomps and cannot be knocked back'],
    }[k]();
    check(gait[0], `${key} moves by ${k}: ${gait[1]}`);
    for (const p of def.passives) if (p.hook && n('passive', (x) => x.k === p.hook) > 0) seenHooks.add(spec.id + ':' + p.hook);
  }
  // hooks that need a moment a stage may not bring (an ally falling, low health, standing in ink): forced below
  const forced = new Set(['loc:guardian', 'kyda:rage', 'muc:inkRegen', 'tegiap:reflect']);
  const want = [...new Set(FORMS.flatMap((f) => heroDef(f).passives.filter((p) => p.hook).map((p) => f.id + ':' + p.hook)))];
  const missing = want.filter((h) => !seenHooks.has(h) && !forced.has(h));
  check(missing.length === 0, `every hook passive acted in a real stage (${want.length - missing.length - [...forced].filter((h) => !seenHooks.has(h)).length} of ${want.length}${missing.length ? '; missing ' + missing.join(', ') : ''})`);
}

// the passives that need a set-up moment
{
  const fresh = (team) => createBattle({ stage: 10, seed: 4, team, auto: { ult: false, pick: 'best' } });
  const ev = (B) => { const log = []; B.emit = (e) => { e.t = B.t; log.push(e); }; return log; };
  // Đèn Giữ Hồn: an ally falling is stood up once per wave at 30%
  {
    const B = fresh([{ id: 'loc', form: 3, branch: 'a', mul: 2 }, { id: 'chon', mul: 2 }]); const log = ev(B);
    const a = B.heroes[1]; const e = B.enemies.find((x) => x.alive) || B.camp[0];
    _test.hurt(B, e, a, a.hp + a.shield + 10, { sure: true });
    const up1 = a.alive && Math.abs(a.hp - a.maxHp * 0.3) < 1e-6;
    a.state.invuln = 0; _test.hurt(B, e, a, a.hp + 10, { sure: true });
    check(up1 && !a.alive && log.some((x) => x.e === 'passive' && x.k === 'guardian'), `Đèn Giữ Hồn: the first fall of a wave stands Chồn up at 30% (${up1}), the second one in the wave is a real fall (${!a.alive})`);
  }
  // Máu Sôi: below half health the lizard attacks 20% faster
  {
    const B = fresh([{ id: 'kyda', form: 2, mul: 2 }]); const u = B.heroes[0];
    const before = _test.M(u, 'aspd'); u.hp = u.maxHp * 0.4; step(B);
    check(before === 0 && Math.abs(_test.M(u, 'aspd') - 0.2) < 1e-9, `Máu Sôi: attack speed mod ${before} at full health, ${_test.M(u, 'aspd').toFixed(2)} below half`);
  }
  // Tắm Mực: inside its own ink it heals 1% a second
  {
    const B = fresh([{ id: 'muc', form: 2, mul: 2 }]); const u = B.heroes[0];
    B.zones.push({ x: u.x, z: u.z, r: 3, t: 5, every: 0.5, tick: 9, dmg: 0, src: u.uid, team: 0, power: 1, atk: 1, ink: 0.1, vx: 0, vz: 0, id: 999 });
    u.hp = u.maxHp * 0.5; u.lockT = 2; u.state.invuln = 2; const h0 = u.hp; for (let i = 0; i < 30; i++) step(B);
    const got = (u.hp - h0) / u.maxHp;
    check(got > 0.008 && got < 0.013, `Tắm Mực: one second in its ink heals ${(got * 100).toFixed(2)}% (1%)`);
  }
  // Phản Chấn: what the stone guard held back comes out as a wave when it drops
  {
    const B = fresh([{ id: 'tegiap', form: 2, mul: 2 }]); const log = ev(B); const u = B.heroes[0];
    const e = B.camp[0] || B.enemies[0]; u.state.invuln = 0.2;
    _test.hurt(B, e, u, 500, {}); const held = u.blocked;
    const near = B.camp.slice(0, 3); for (const f of near) { B.enemies.push(f); f.x = u.x + 1; f.z = u.z; B.byUid.set(f.uid, f); }
    for (let i = 0; i < 10; i++) step(B);
    check(held === 500 && log.some((x) => x.e === 'passive' && x.k === 'reflect'), `Phản Chấn: 500 blocked under the guard (${held}) came back as a wave`);
  }
  // mods passives, checked on the damage they change
  {
    const B = fresh([{ id: 'tegiap', mul: 1 }, { id: 'cu', mul: 1 }, { id: 'duoi', form: 2, mul: 1 }, { id: 'muc', mul: 1 }]);
    const [te, cu, duoi, muc] = B.heroes; const e = B.camp[0]; e.mods = {}; e.buffs = [];
    check(Math.abs(_test.hurt(B, e, te, 100, {}) - 90) < 1e-9, 'Da Đá: Tê Giáp takes 90 of a 100 blow');
    const t = B.camp[1]; t.hp = t.maxHp; const full = _test.hurt(B, cu, t, 10, {}); t.hp = t.maxHp * 0.4; const low = _test.hurt(B, cu, t, 10, {});
    check(Math.abs(full - 10) < 1e-9 && Math.abs(low - 11.5) < 1e-9, `Mắt Đêm: Cú Bóng hits a foe under half health for ${low} instead of ${full}`);
    t.hp = t.maxHp; t.status.freeze = { t: 2, v: 0 }; const fr = _test.hurt(B, duoi, t, 10, {}); delete t.status.freeze;
    check(Math.abs(fr - 12) < 1e-9, `Băng Giòn: a frozen foe takes ${fr} of 10 from Đuối Gai Sương`);
    t.inkT = B.t + 1; t.inkAmp = 0.1; const ink = _test.hurt(B, te, t, 10, {}); t.inkT = 0;
    check(Math.abs(ink - 11) < 1e-9, `Mực Đánh Dấu: a foe in ink takes ${ink} of 10 from anyone`);
  }
  // a flier takes 80% of a melee blow; a blinded foe misses
  {
    const B = fresh([{ id: 'duoi', form: 3, mul: 1 }, { id: 'tegiap', mul: 1 }]); const [d, te] = B.heroes; const e = B.camp[0]; e.mods = {};
    const air = _test.hurt(B, e, d, 100, { melee: true }); const ranged = _test.hurt(B, e, d, 100, { ranged: true });
    check(d.air && Math.abs(air - 80) < 1e-9 && Math.abs(ranged - 100) < 1e-9, `fly: Đuối Băng Hà takes ${air} of a 100 bite, ${ranged} of a 100 shot`);
    e.status.blind = { t: 9, v: 1 }; const miss = _test.hurt(B, e, te, 100, { melee: true }); delete e.status.blind;
    check(miss === 0, 'a foe blinded at 100% misses its blow');
  }
  // a flier is not blocked by a ground body; a walker is
  {
    const shove = (spec) => { const B = fresh([{ ...spec, mul: 1 }]); const u = B.heroes[0]; const e = B.camp[0]; B.enemies.push(e); B.units.push(e); B.byUid.set(e.uid, e); e.x = u.x + 0.2; e.z = u.z; e.lockT = 9; u.lockT = 9; const x0 = u.x; step(B); return Math.abs(u.x - x0); };
    const fl = shove({ id: 'duoi', form: 3 }); const wk = shove({ id: 'tegiap' });
    check(fl < 1e-9 && wk > 0.05, `a flier overlapping a zombie is not pushed (${fl.toFixed(3)} m), a walker is (${wk.toFixed(3)} m)`);
  }
  // gallop: up to 15% faster after a second of running
  {
    // one zombie on the far side and nothing else: a long run across the arena
    const B = fresh([{ id: 'chon', mul: 1 }]); const u = B.heroes[0]; B.queue = []; B.camp = [];
    B.enemies.forEach((e, i) => { if (i) { e.alive = false; e.hp = 0; } else { e.x = 8.2; e.z = 0; e.lockT = 99; } }); u.x = -7.5; u.z = 0;
    let best = 0; let px = u.x; let pz = u.z;
    for (let i = 0; i < 90; i++) { step(B); const v = Math.hypot(u.x - px, u.z - pz) * 30; px = u.x; pz = u.z; if (u.anim === 'run' && !u.status.slow) best = Math.max(best, v / (u.base.speed * (1 + _test.M(u, 'speed')))); }
    check(best > 1.13 && best < 1.17, `gallop: Chồn Gió runs at ${best.toFixed(3)}x its speed once in stride (1.15)`);
  }
}

// evolved teams: same seed, same battle
{
  const T = [{ id: 'tegiap', form: 3, branch: 'b', mul: 2 }, { id: 'kyda', form: 3, branch: 'a', mul: 2 }, { id: 'muc', form: 3, mul: 2 }, { id: 'ech', form: 2, mul: 2 }];
  const sig = (r) => `${r.B.phase}|${r.B.tick}|${r.B.kills}|${r.B.heroes.map((u) => Math.round(u.dealt)).join(',')}|${r.log.filter((e) => e.e === 'move').length}`;
  const a = play({ stage: 12, seed: 7, team: T, auto: { ult: true, pick: 'best' } }); const b = play({ stage: 12, seed: 7, team: T, auto: { ult: true, pick: 'best' } });
  check(sig(a) === sig(b) && a.log.some((e) => e.e === 'move'), `evolved team with roll, burrow, blink and leap: same seed gives the same battle (${sig(a)})`);
  const d1 = heroDef({ id: 'tegiap' }); const d2 = heroDef({ id: 'tegiap', form: 2 }); const d3 = heroDef({ id: 'tegiap', form: 3, branch: 'a' });
  check(d2.hp === 2000 && d3.hp === 2560 && d1.hp === 1600 && d3.passives.length === 3 && d3.s2.name === d2.s2.name && d3.ult.name !== d1.ult.name, `forms stack: health 1600 -> ${d2.hp} -> ${d3.hp}, three passives at form 3, form 3 keeps form 2's charge (${d3.s2.name})`);
  check(heroDef({ id: 'thep' }) === d1 && heroDef({ id: 'gio' }).id === 'chon', 'an old hero id fights as its beast (thep -> tegiap, gio -> chon)');
}

// a wiped team loses
{
  const { B } = play({ stage: 30, seed: 1, team: team(START), auto: { ult: true, pick: 'best' } });
  check(B.phase === 'lost' && B.heroes.every((u) => !u.alive), 'a level-1 team on stage 30 is wiped and the stage is lost');
}

console.log(fails.length ? `\n${fails.length} FAILED\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
