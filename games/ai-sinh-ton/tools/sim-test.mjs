// Behaviour of the battle sim, in Node: what the player is promised, checked on real runs.
// Usage: node games/ai-sinh-ton/tools/sim-test.mjs
import { createBattle, step, castUlt, pickCard, arenaNorm, SPAWN_K, battleReport } from '../js/sim/battle.js';
import { HEROES, HERO } from '../js/data/heroes.js';
import { ENEMIES, ENEMY } from '../js/data/enemies.js';
import { stageDef, bossOf, bossTierOf, HORDE } from '../js/data/stages.js';
import { CARD, CARDS } from '../js/data/cards.js';

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const team = (ids, mul = 1) => ids.map((id) => ({ id, mul }));
const START = ['thep', 'mua', 'yta', 'gio'];

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
  check(B.phase === 'won', `stage 8 with the four starters at level 8 is won (${B.phase}, wave ${B.wave})`);
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
  check(B.heroes.every((u) => u.cards.length === 0 && Object.keys(u.mods).filter((k) => !['dr', 'lifesteal'].includes(k)).length === 0), 'a new stage starts with no cards');
}

// every hero: both skills and the ultimate fire in a real stage, units stay inside the arena
{
  for (const h of HEROES) {
    const ids = [h.id, ...['thep', 'yta', 'mua', 'gio'].filter((x) => x !== h.id)].slice(0, 4);
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
    const { log } = play({ stage, seed: 2, team: team(['thep', 'yta', 'mua', 'ky'], 4), auto: { ult: false, pick: 'best' } });
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
  check(CARDS.length === 62 && new Set(CARDS.map((c) => c.id)).size === 62, `62 cards with unique ids (${CARDS.length})`);
  check(HEROES.length === 13 && HEROES.every((h) => HERO[h.id] && h.s1.ops.length && h.s2.ops.length && h.ult.ops.length), '13 heroes, each with two skills and an ultimate');
}

// the end-of-stage report is counted by the sim: hero damage adds up to the health the enemies really lost
{
  for (const [stage, ids, mul] of [[8, START, 1.6], [15, ['hoa', 'doc', 'sam', 'yta'], 2.2], [30, START, 1]]) {
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
      const mua = R.find((r) => r.id === 'mua'); const yta = R.find((r) => r.id === 'yta');
      check(mua.bySrc.atk > 0 && mua.bySrc.s2 > 0 && mua.bySrc.ult > 0, `Mưa Đạn: attacks ${Math.round(mua.bySrc.atk)}, Lựu Đạn Chùm ${Math.round(mua.bySrc.s2)}, Mưa Thép (drones) ${Math.round(mua.bySrc.ult)} are booked under their own source`);
      check(yta.healed > 0 && yta.bySrc.fx > 0, `Y Tá: healed allies ${Math.round(yta.healed)}, poison booked as effect damage ${Math.round(yta.bySrc.fx)}`);
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
  // twelve seeds: on three the sum swings by a factor of two with the arena shape alone (a longer fight freezes longer)
  for (let seed = 3; seed < 15; seed++) { h += frozenTime(false, seed); flat += frozenTime(true, seed); }
  check(flat > 1 && Math.abs(h - flat) <= 0.25 * flat, `stage 20, twelve seeds: hero freeze time with the horde ${h.toFixed(1)}s vs ${flat.toFixed(1)}s with the multiplier at 1 (within 25%)`);
}

// a wiped team loses
{
  const { B } = play({ stage: 30, seed: 1, team: team(START), auto: { ult: true, pick: 'best' } });
  check(B.phase === 'lost' && B.heroes.every((u) => !u.alive), 'a level-1 team on stage 30 is wiped and the stage is lost');
}

console.log(fails.length ? `\n${fails.length} FAILED\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
