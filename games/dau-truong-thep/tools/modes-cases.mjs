// Play kinds (Đấu thường, Đấu rank, Phó bản): sim-test.mjs section 50 runs these. Standalone: `node tools/modes-cases.mjs` (fast).
import { createMatch, step, armorOf } from '../js/sim.js';
import { MODES, MODE_ORDER, PLAYS, PLAY_ORDER, RANK_MODES, RANK_TIERS, RANKS, DIFFICULTY, rankTier, rankPlan, cleanPlay, TEAM_SIZE, BOSSES, PVE_ORDER, PVE_FOES, pveStage, pveStars, railAt, TICK } from '../js/data.js';
import { allInputs } from '../js/bots.js';
import { roster as netRoster, createMirror } from '../js/netstate.js';
import { mapsFor, pickArena, compileMap, solidAt } from '../js/maps.js';
import { soloLineup, pveLineup } from '../js/roster.js';
import { makeMeta, pveOpen } from '../js/meta.js';
import { mulberry } from '../js/rng.js';
import { oldK16 } from './k16-cases.mjs';   // kit lane k16: the boss stages run on fixture kits

const KEY = 'dtt.save.v1';
const store = (raw) => { const m = new Map(raw === undefined ? [] : [[KEY, JSON.stringify(raw)]]); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const choice = (o) => ({ play: 'casual', mech: 'trau', diff: 'normal', mode: 'tdm', size: 3, mods: { lv: [4, 4, 4, 4, 4] }, skin: null, ...o });
const lineup = (c, seed, tier) => soloLineup(c, { rng: mulberry(seed ^ 0x51ed), seed, tier, playerName: 'P' });
const teamRows = (team) => ({ rows: [{ id: 0, team: 0, mech: 'trau', kills: 2, assists: 1, deaths: 1, dmg: 3000, healed: 0 }, { id: 1, team: 1, mech: 'soi', kills: 1, assists: 0, deaths: 2, dmg: 2000, healed: 0 }], mvp: 0, mode: 'tdm', winner: team, score: [3, 1] });

export function runModeCases(check, section) {
  section('50 play kinds: mode list, Đấu rank tiers and line-up, trophies only in rank, old saves');
  check('50a MODE_ORDER is the PvP list (tdm, nha, chiem, tudo): trum left the menu but stays in MODES', MODE_ORDER.join() === 'tdm,nha,chiem,tudo' && !!MODES.trum, MODE_ORDER.join());
  check('50b three play kinds in order with names', PLAY_ORDER.join() === 'casual,rank,pve' && PLAY_ORDER.every((k) => PLAYS[k].name) && cleanPlay('x') === 'casual' && cleanPlay('rank') === 'rank');
  check('50c one RANK_TIERS row per RANKS tier, bot level and damage never go down, every diff is a DIFFICULTY row',
    RANK_TIERS.length === RANKS.length && RANK_TIERS.every((t, i) => DIFFICULTY[t.diff] && (i === 0 || (t.botLv >= RANK_TIERS[i - 1].botLv && t.foeDmg >= RANK_TIERS[i - 1].foeDmg && t.foeHp >= RANK_TIERS[i - 1].foeHp))) &&
    RANK_TIERS[0].diff === 'easy' && RANK_TIERS[RANK_TIERS.length - 1].diff === 'hard' && RANK_TIERS[RANK_TIERS.length - 1].botLv > RANK_TIERS[0].botLv);
  check('50d rankTier clamps the index (-3 -> first row, 99 -> last row)', rankTier(-3) === RANK_TIERS[0] && rankTier(99) === RANK_TIERS[RANK_TIERS.length - 1]);
  {
    const seen = {};
    let same = true;
    for (let s = 1; s <= 200; s++) { const p = rankPlan(2, s); seen[p.mode] = (seen[p.mode] || 0) + 1; same = same && rankPlan(2, s).mode === p.mode && RANK_MODES.includes(p.mode); }
    check('50e rankPlan: same seed same mode, only PvP modes, all four drawn over 200 seeds with none under 25', same && RANK_MODES.every((k) => seen[k] >= 25) && !seen.trum, JSON.stringify(seen));
  }
  {
    let ok = true, info = '';
    for (let tier = 0; tier < RANK_TIERS.length; tier++) for (let seed = 11; seed < 17; seed++) {
      const L = lineup(choice({ play: 'rank', diff: 'easy', size: 1, mode: 'chiem' }), seed, tier), T = RANK_TIERS[tier];
      const me = L.roster[0], foes = L.roster.filter((r) => r.team !== me.team), allies = L.roster.slice(1).filter((r) => r.team === me.team);
      const want = L.mode === 'tudo' ? 6 : 6;
      const good = L.play === 'rank' && L.tier === T && L.mode === rankPlan(tier, seed).mode && L.size === TEAM_SIZE && L.roster.length === want &&
        me.mods.lv.join() === '4,4,4,4,4' && !me.bot && L.roster.every((r) => r.diff === T.diff) &&
        foes.every((r) => r.mods.lv.every((l) => l === T.botLv) && r.mods.dmg === T.foeDmg && r.mods.hp === T.foeHp) && allies.every((r) => r.mods.lv.every((l) => l === T.allyLv));
      if (!good) { ok = false; info = `tier ${tier} seed ${seed} ${L.mode} ${JSON.stringify(L.roster.map((r) => [r.team, r.diff, r.mods && r.mods.lv]))}`; }
    }
    check('50f rank line-up: 3v3 whatever the menu size, every bot at the tier diff, enemy bots at botLv/foeDmg/foeHp, allies at allyLv, the player keeps own levels', ok, info);
  }
  {
    const L = lineup(choice({ play: 'casual', diff: 'hard', size: 2, mode: 'nha' }), 5, 5);
    const foes = L.roster.filter((r) => r.team === 1);
    check('50g casual line-up ignores the tier: chosen mode, size and diff; enemy bots take the diff share of the player levels',
      L.play === 'casual' && L.tier === null && L.mode === 'nha' && L.roster.length === 4 && L.roster.every((r) => r.diff === 'hard') && foes.every((r) => r.mods.lv.join() === '4,4,4,4,4' && r.mods.dmg === DIFFICULTY.hard.foeDmg), JSON.stringify(L.roster.map((r) => r.mods)));
  }
  {
    // A ranked match through the real sim: arena from pickArena('random'), units carry the tier multipliers.
    const seed = 77, tier = 4, L = lineup(choice({ play: 'rank' }), seed, tier), a = pickArena('random', 'random', seed, L.mode);
    const m = createMatch({ map: a.map, theme: a.theme, seed, roster: L.roster, mode: L.mode });
    for (let i = 0; i < 60; i++) step(m, {});
    const foe = m.units.find((u) => u.team !== m.units[0].team), T = RANK_TIERS[tier];
    check('50h a ranked match runs: arena from the mode pool, enemy hp x foeHp, dmgMod x foeDmg', mapsFor(L.mode).includes(m.map.key) && m.mode === L.mode && near(foe.dmgMod, T.foeDmg * (foe.def.dmgUp || 1)) && foe.maxHp === Math.round(foe.def.hp * T.foeHp), `${m.map.key} ${foe.dmgMod} ${foe.maxHp}`);
  }
  {
    const meta = makeMeta({ storage: store({ trophies: 120 }), now: () => 1e12 });
    const casual = meta.applyResult(teamRows(0), 0);
    const t1 = meta.get().trophies;
    const won = meta.applyResult(teamRows(0), 0, { play: 'rank' });
    const lost = meta.applyResult(teamRows(1), 0, { play: 'rank' });
    check('50i Đấu thường pays coins and xp but moves no trophies; Đấu rank win +22, loss -12', casual.coins > 0 && casual.xp > 0 && !casual.trophy && t1 === 120 && won.trophy && won.trophiesAfter === 142 && lost.trophiesAfter === 130 && won.play === 'rank', JSON.stringify([t1, won.trophiesAfter, lost.trophiesAfter]));
    const ffa = { rows: [0, 1, 2, 3, 4, 5].map((i) => ({ id: i, team: i, mech: 'trau', kills: 5 - i, assists: 0, deaths: i, dmg: 100, healed: 0 })), mvp: 0, mode: 'tudo', winner: 0, score: [5, 4, 3, 2, 1, 0] };
    const f = meta.applyResult(ffa, 0, { play: 'rank' });
    check('50j a ranked Hỗn chiến moves trophies too (1st place +22)', f.trophy && f.trophiesAfter - f.trophiesBefore === 22, JSON.stringify([f.trophiesBefore, f.trophiesAfter]));
  }
  {
    const old = makeMeta({ storage: store({ v: 3, mode: 'trum', trophies: 300, coins: 50, lv: { trau: [1, 2, 3, 0, 0] } }) }).get();
    const fresh = makeMeta({ storage: store() }).get();
    const kept = makeMeta({ storage: store({ v: 3, mode: 'chiem', play: 'rank' }) }).get();
    check('50k old save with mode trum loads: mode falls back to tdm, play casual, trophies, coins and levels kept; play is saved', old.mode === 'tdm' && old.play === 'casual' && old.trophies === 300 && old.coins === 50 && old.lv.trau.join() === '1,2,3,0,0' && fresh.play === 'casual' && kept.play === 'rank' && kept.mode === 'chiem', JSON.stringify([old.mode, old.play, kept.play]));
  }
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const pveMatch = (id, seed = 5, lv = 1) => {
  const L = pveLineup(id, [{ mech: 'trau', name: 'P', mods: { lv: [lv, lv, lv, lv, lv] } }], { rng: mulberry(seed) });
  return createMatch({ map: L.map, theme: L.theme, seed, roster: L.roster, mode: 'pve', stage: id, duration: L.duration });
};
// Bring every monster of a wave to half a hit point and let one tick pass with the player's bots shooting: they fall to real damage.
const wipe = (m, w) => {
  for (let i = 0; i < 600 && m.units.some((u) => u.team === 1 && u.wave === w && u.alive); i++) {
    for (const u of m.units) if (u.team === 1 && u.wave === w && u.alive) { u.hp = Math.min(u.hp, 1); u.invulnT = 0; u.shield = 0; u.maxHp = Math.max(1, u.maxHp); }
    for (const u of m.units) if (u.team === 0) { u.invulnT = 5; u.hp = u.maxHp; }
    step(m, allInputs(m, {}));
  }
};

export function runPveCases(check, section) {
  section('51 Phó bản: stages, line-up, waves, lives, rewards, unlocks, mirror');
  {
    let bad = '';
    let prevRec = -1;
    for (const id of PVE_ORDER) {
      const S = pveStage(id);
      const keys = S.waves.flat();
      if (!keys.every((k) => BOSSES[k])) bad += id + ' unknown monster; ';
      if (S.boss !== (S.st === 5) || (S.boss && !BOSSES[S.waves[S.waves.length - 1][0]].boss)) bad += id + ' boss; ';
      if (!(S.reward.first > S.reward.repeat && S.reward.repeat > S.reward.fail && S.reward.fail > 0)) bad += id + ' reward; ';
      if (S.recLv < prevRec || S.par <= 0 || S.waves.length < 2) bad += id + ' rec/par/waves; ';
      for (const w of S.waves) if (w.filter((k) => k === 'khienve').length > 1 || w.filter((k) => k === 'uphao').length > 2) bad += id + ' heavy; ';
      prevRec = S.recLv;
    }
    check('51a 24 stages (4 chapters x 6): known monsters, stage 6 ends on a boss, first > repeat > fail > 0 coins, recommended level climbs, heavy caps', PVE_ORDER.length === 24 && !bad, bad);
    check('51b five monster kinds, none a boss, each with a weapon and three skills; each has a telegraphed attack (nova windup, barrage delay or lob)',
      Object.keys(PVE_FOES).length >= 5 && Object.values(PVE_FOES).every((d) => !d.boss && d.monster && d.weapon && d.skills.length === 3 && (d.weapon.lob || d.skills.some((s) => (s.do === 'nova' && s.windup >= 0.7) || (s.do === 'barrage' && s.delay >= 1)))));
  }
  {
    const S = pveStage('1-3'), L = pveLineup('1-3', [{ mech: 'soi', name: 'P', mods: { lv: [2, 2, 2, 2, 2] } }], { rng: mulberry(3) });
    const team0 = L.roster.filter((r) => r.team === 0), foes = L.roster.filter((r) => r.team === 1);
    check('51c line-up: the human plus 2 allied bots at the stage ally level, every wave of monsters on team 1 with its wave index and the stage multipliers',
      team0.length === TEAM_SIZE && !team0[0].bot && team0[0].mods.lv.join() === '2,2,2,2,2' && team0.slice(1).every((r) => r.bot && r.mods.lv.every((l) => l === S.allyLv)) &&
      foes.length === S.waves.flat().length && foes.every((r) => r.wave >= 0 && r.wave < S.waves.length && r.mods.hp === S.hp && r.mods.dmg === S.dmg), JSON.stringify(foes.map((r) => [r.mech, r.wave])));
    const L3 = pveLineup('1-3', [{ mech: 'soi', name: 'A', pid: 'p0' }, { mech: 'soi', name: 'B', pid: 'p1' }, { mech: 'hac', name: 'C', pid: 'p2' }], { rng: mulberry(3) });
    check('51d co-op line-up: three humans fill team 0 (no bot ally), each keeps its pid', L3.roster.filter((r) => r.team === 0).map((r) => r.pid + (r.bot ? 'b' : '')).join() === 'p0,p1,p2');
  }
  {
    const m = pveMatch('1-3');
    const w0 = m.units.filter((u) => u.team === 1 && u.wave === 0), later = m.units.filter((u) => u.team === 1 && u.wave > 0);
    check('51e match start: waves counted, target = waves, only wave 0 alive, later waves wait dead, lives from the rule (3 hunters: 6)',
      m.waves === 3 && m.target === 3 && m.wave === 0 && w0.every((u) => u.alive) && later.every((u) => !u.alive && u.respawnT >= 1e8) && m.lives === 6, `${m.waves} ${m.lives}`);
    wipe(m, 0);
    const deadOk = w0.every((u) => !u.alive && u.respawnT >= 1e8);
    let ev = [];
    for (let i = 0; i < 80 && m.wave === 0; i++) { step(m, {}); ev = ev.concat(m.events); }
    const w1 = m.units.filter((u) => u.team === 1 && u.wave === 1);
    check('51f wave 0 down: its monsters never respawn; 2.5 s later wave 1 appears (respawn events, wave event 1/3, spawn guard on)',
      deadOk && m.wave === 1 && w1.every((u) => u.alive && u.invulnT > 0) && ev.filter((e) => e.t === 'respawn').length === w1.length && ev.some((e) => e.t === 'wave' && e.n === 1 && e.of === 3) && !m.over, `wave ${m.wave}`);
    wipe(m, 1);
    for (let i = 0; i < 80 && m.wave === 1; i++) step(m, {});
    wipe(m, 2);
    for (let i = 0; i < 3 && !m.over; i++) step(m, {});
    check('51g the last wave cleared ends the stage: winner 0', m.over && m.winner === 0, `over ${m.over} winner ${m.winner} wave ${m.wave}`);
  }
  {
    const m = pveMatch('1-1');
    m.lives = 2;
    let guard = 0, deaths = 0;
    while (!m.over && guard++ < 30 * 120) { for (const u of m.units) if (u.team === 0 && u.alive) { u.hp = Math.min(u.hp, 1); u.invulnT = 0; u.shield = 0; } step(m, allInputs(m, {})); deaths += m.events.filter((e) => e.t === 'death' && m.units[e.id].team === 0).length; }
    check('51h each death of the team costs a shared life; none left ends the stage: winner 1', m.over && m.winner === 1 && m.lives <= 0 && deaths >= 2, `over ${m.over} winner ${m.winner} lives ${m.lives} deaths ${deaths}`);
  }
  {
    const m = pveMatch('1-5', 7), t = m.units.find((u) => u.team === 1 && u.alive && u.mech === 'uphao') || m.units.find((u) => u.team === 1 && u.alive);
    t.hp = t.maxHp * 0.4; t.combatT = 99;
    for (let i = 0; i < 300; i++) step(m, {});
    check('51i monsters neither regenerate out of combat nor heal at their base pad', t.hp <= t.maxHp * 0.4 + 1e-6, `${t.hp} / ${t.maxHp}`);
  }
  {
    const play = () => { const m = pveMatch('2-3', 9); for (let i = 0; i < 900 && !m.over; i++) step(m, allInputs(m, {})); return JSON.stringify([m.tick, m.wave, m.lives, m.units.map((u) => [u.alive, Math.round(u.hp), Math.round(u.x * 100)])]); };
    check('51j a Phó bản bot run is deterministic: same seed, same state after 30 s', play() === play());
  }
  {
    const m = pveMatch('1-6', 4), R = netRoster(m), mir = createMirror(R);
    check('51k netstate roster keeps stage and wave: the mirror has the same waves, boss and dead later waves',
      R.stage === '1-6' && mir.stage === '1-6' && mir.waves === m.waves && mir.units.every((u, i) => u.wave === m.units[i].wave && u.alive === m.units[i].alive && u.maxHp === m.units[i].maxHp), JSON.stringify([R.stage, mir.waves, m.waves]));
  }
  {
    const ok = [];
    for (const [id, seed] of [['1-1', 1], ['1-2', 2], ['2-1', 3]]) {
      const m = pveMatch(id, seed, 2);
      while (!m.over) step(m, allInputs(m, {}));
      ok.push(`${id}:${m.winner === 0 ? 'win' : 'lose'}@${Math.round(m.time)}`);
    }
    check('51l three bots at the recommended level clear 1-1, 1-2 and 2-1 before the clock', ok.every((s) => s.includes('win')), ok.join(' '));
  }
  {
    const meta = makeMeta({ storage: store({ coins: 0 }), now: () => 1e12 });
    const S = pveStage('1-1'), sum = (won, time) => ({ rows: [{ id: 0, team: 0, mech: 'trau', kills: 3, assists: 0, deaths: 0, dmg: 5000, healed: 0 }], mvp: 0, mode: 'pve', stage: '1-1', winner: won ? 0 : 1, time, wave: 1, waves: 2 });
    check('51m 1-1 open, 1-2 locked on a fresh save', pveOpen(meta.get(), '1-1') && !pveOpen(meta.get(), '1-2'));
    const a = meta.applyResult(sum(true, S.par * 2), 0), b = meta.applyResult(sum(true, S.par - 1), 0), c = meta.applyResult(sum(false, 30), 0);
    const d = meta.get();
    check('51n first clear pays reward.first, a repeat reward.repeat, a loss reward.fail; coins only (no xp, gems, trophies)',
      a.coins === S.reward.first && a.first && b.coins === S.reward.repeat && !b.first && c.coins === S.reward.fail && d.coins === S.reward.first + S.reward.repeat + S.reward.fail && d.xp === 0 && d.gems === 0 && d.trophies === 0, JSON.stringify([a.coins, b.coins, c.coins, d.coins]));
    check('51o stars: 1 for a slow clear, 3 at par, the best is kept; clears counted; 1-2 opens', a.stars === 1 && b.stars === 3 && d.pve.best['1-1'] === 3 && d.pve.clears['1-1'] === 2 && pveOpen(d, '1-2') && a.next === '1-2' && pveStars(S, S.par) === 3, JSON.stringify(d.pve));
    const g = makeMeta({ storage: store({ pve: { best: { '1-1': 9, '9-9': 3, '1-2': 'x' }, clears: { '1-1': -4 }, sel: 'zz' } }) }).get();
    check('51p garbage Phó bản save cleans up: stars capped at 3, unknown ids and bad numbers dropped, bad pick -> 1-1', g.pve.best['1-1'] === 3 && !g.pve.best['9-9'] && !g.pve.best['1-2'] && !g.pve.clears['1-1'] && g.pve.sel === '1-1', JSON.stringify(g.pve));
  }
}

const bossMatch = (id, seed = 5) => {
  // the stage and boss logic is under test, not the roster: kits remade by the kit lanes play their old fixture kits here
  // (kit lane k16: the 4-6 lineup draws Natsu, whose new kit sent his bot after a crate instead of the 1-hp alien in 52m)
  const m = oldK16(pveMatch(id, seed, 3));
  // jump straight to the boss wave: the earlier waves fall without a fight
  for (const u of m.units) if (u.team === 1 && u.wave < m.waves - 1) { u.alive = false; u.hp = 0; u.deaths = 1; u.respawnT = 1e9; }
  for (let i = 0; i < 90 && m.wave < m.waves - 1; i++) step(m, {});
  return m;
};
const unitOf = (m, k) => m.units.find((u) => u.mech === k);

export function runBossCases(check, section) {
  section('52 Phó bản bosses: giant tank, warship, train, alien; every attack telegraphed');
  {
    const want = { '1-6': ['cuthan', 'denrung'], '2-6': ['chienham', 'bentau'], '3-6': ['dautau', 'ganhray'], '4-6': ['ngoaitinh', 'mienglua'] };
    const got = Object.keys(want).map((id) => { const S = pveStage(id), w = S.waves[S.waves.length - 1]; return [id, w[0], S.map]; });
    check('52a each chapter ends on its own boss: Cự Thần (tank), Chiến Hạm (warship, Bến Tàu Băng), Đầu Tàu (train, Ga Ray), Ngoại Tinh (alien)',
      got.every(([id, b, map]) => want[id][0] === b && want[id][1] === map && BOSSES[b].boss && BOSSES[b].script), JSON.stringify(got));
    const tele = [];
    for (const k of ['cuthan', 'chienham', 'chphao', 'dautau', 'toaxe', 'ngoaitinh']) {
      const d = BOSSES[k];
      if (!d.weapon.lob) tele.push(k + ' weapon');
      for (const s of d.skills) if ((s.do === 'nova' && !(s.windup >= 1)) || (s.do === 'barrage' && !(s.delay >= 1.2)) || (s.do === 'sweep' && !(s.windup >= 1)) || ['dash', 'volley', 'beam', 'leap'].includes(s.do)) tele.push(k + ':' + s.id);
    }
    check('52b every boss attack is telegraphed: weapons lob (marked landing), novas wind up >= 1 s, barrages land >= 1.2 s after their marks, sweeps wind up >= 1 s, no untelegraphed dash or volley', !tele.length, tele.join(' '));
  }
  {
    const map = compileMap('ganhray'), R = BOSSES.dautau.rail;
    let bad = 0;
    for (let i = 0; i < 200; i++) { const p = railAt(R, i / 200 * railAt(R, 0).len); if (solidAt(map, p.x, p.z, BOSSES.toaxe.radius + 0.2)) bad++; }
    const lane = compileMap('bentau'), L = BOSSES.chienham.lane;
    let wet = 0;
    for (let x = -L.x - 4.2; x <= L.x + 4.2; x += 0.5) if (solidAt(lane, x, L.z, 1.2)) wet++;
    const far = Math.min(...map.spawns[0].map((p) => Math.abs(Math.hypot(p[0] / R.rx, p[1] / R.rz) - 1) * R.rz));
    check('52c the rail of Ga Ray and the lane of Bến Tàu Băng are clear of every wall and rock, and no spawn pad sits on the rail', bad === 0 && wet === 0 && far > R.width + 1, `rail ${bad} lane ${wet} pad ${far.toFixed(1)}`);
  }
  {
    const m = bossMatch('1-6'), b = unitOf(m, 'cuthan');
    for (let i = 0; i < 5; i++) step(m, {});
    b.hp = b.maxHp * 0.49;
    let ev = [];
    const z0 = m.zones.length;
    step(m, {}); ev = ev.concat(m.events);
    check('52d giant tank: under half hp it raises its phase once, rings itself with 10 marked shells and fires a third faster',
      ev.some((e) => e.t === 'bossPhase' && e.id === b.id) && m.zones.filter((z) => z.kind === 'strike' && z.owner === b.id && z.delay > 1).length >= 10 && b.rapidF === 1.35 && b.rapidT > 1000, `${m.zones.length - z0}`);
  }
  {
    const m = bossMatch('2-6'), b = unitOf(m, 'chienham'), guns = m.units.filter((u) => u.mech === 'chphao');
    const L = b.def.lane, xs = [];
    for (let i = 0; i < 30 * 10; i++) { step(m, {}); if (i % 30 === 0) xs.push(b.x); }
    const moved = Math.max(...xs) - Math.min(...xs), at = b.def.parts[0].at;
    check('52e warship cruises its lane (x moves, z stays on the lane), its three deck guns ride at -4.2, 0, 4.2 m',
      moved > 8 && Math.abs(b.z - L.z) < 1e-9 && guns.length === 3 && guns.every((g, i) => Math.abs(g.x - b.x - at[i]) < 1e-6 && g.z === L.z), `${moved.toFixed(1)} ${guns.map((g) => (g.x - b.x).toFixed(1))}`);
    const armed = armorOf(m, b);
    for (const g of guns) { g.hp = 0.5; g.invulnT = 0; g.shield = 0; }
    // the hunters stand on the quay next to the guns and shoot them down
    const hunters = m.units.filter((u) => u.team === 0);
    for (let i = 0; i < 300 && guns.some((g) => g.alive); i++) { hunters.forEach((h, k) => { const g = guns.find((q) => q.alive) || b; h.x = h.px = g.x + (k - 1) * 1.5; h.z = h.pz = L.z + 3.4; h.invulnT = 1; }); step(m, allInputs(m, {})); }
    // a hunter may be Medusa (kit lane k17): her curse marks take armour off for 3 s, so let them run out first
    for (let i = 0; i < 10 || (b.stkN > 0 && b.stkT > 0 && i < 150); i++) step(m, {});
    check('52f warship hull shrugs off 60% while a deck gun stands, back to its own armour once they are sunk', near(armed, 0.6, 1e-9) && guns.every((g) => !g.alive) && near(armorOf(m, b), b.def.armor, 1e-9), `${armed} -> ${armorOf(m, b)}`);
  }
  {
    const m = bossMatch('3-6'), e = unitOf(m, 'dautau'), cars = m.units.filter((u) => u.mech === 'toaxe'), R = e.def.rail;
    const d0 = e.bs ? e.bs.d : 0;
    for (let i = 0; i < 30; i++) step(m, {});
    const on = cars.every((c, i) => { const p = railAt(R, e.bs.d - (i + 1) * R.gap); return Math.hypot(c.x - p.x, c.z - p.z) < 1e-6; });
    const p0 = railAt(R, e.bs.d);
    check('52g train: the engine runs the rail at its speed, three carriages follow gap apart on the rail, the engine takes x1.5 (weak point)',
      on && Math.hypot(e.x - p0.x, e.z - p0.z) < 1e-6 && near(e.bs.d - d0, R.speed * TICK * 30, 1e-6) && e.ampF === 0.5 && e.def.armor === 0 && cars.every((c) => c.def.armor > 0.3), `${e.bs.d}`);
    // a hunter standing on the far side of the loop: the rail burns it every half second, the train rams it when it comes by
    const h = m.units.find((u) => u.team === 0 && u.alive), far = railAt(R, e.bs.d + railAt(R, 0).len / 2);
    let burns = 0, rams = 0, hp = 0;
    for (let i = 0; i < 30 * 14; i++) {
      h.x = h.px = far.x; h.z = h.pz = far.z; h.invulnT = 0; h.hp = h.maxHp; h.shield = 0; h.kx = h.kz = 0; h.alive = true;
      step(m, {});
      for (const ev of m.events) { if (ev.t === 'hit' && ev.id === h.id && ev.by === e.id) { burns++; hp += ev.amt; } if (ev.t === 'ram' && ev.id === e.id) rams++; }
    }
    check('52h standing on the rail burns twice a second; the passing train rams (at most once a second per victim)', burns >= 20 && rams >= 1 && rams <= 6, `burns ${burns} rams ${rams}`);
    e.hp = 1; e.invulnT = 0; e.shield = 0;
    // the hunters ride beside the engine and shoot it
    const hs = m.units.filter((u) => u.team === 0);
    for (let i = 0; i < 300 && e.alive; i++) { hs.forEach((q, k) => { q.x = q.px = e.x * 0.8; q.z = q.pz = e.z * 0.8 + k; q.invulnT = 1; q.alive = true; q.hp = q.maxHp; }); step(m, allInputs(m, {})); }
    for (let i = 0; i < 3; i++) step(m, {});
    check('52i the engine down derails the carriages: they fall with it and the stage is cleared', !e.alive && cars.every((c) => !c.alive) && m.over && m.winner === 0, `${e.alive} ${cars.map((c) => c.alive)} ${m.over}`);
  }
  {
    const m = bossMatch('4-6'), a = unitOf(m, 'ngoaitinh'), drones = m.units.filter((u) => u.summon);
    check('52j alien: its drones wait dead in its wave until called', drones.length === a.def.summons.n && drones.every((d) => !d.alive));
    let warp = null, mark = null, summons = 0;
    for (let i = 0; i < 30 * 12; i++) {
      step(m, {});
      for (const e of m.events) { if (e.t === 'zone' && e.kind === 'strike' && !mark && a.bs && a.bs.to) mark = { x: a.bs.to.x, z: a.bs.to.z, tick: m.tick }; if (e.t === 'warp' && e.id === a.id && !warp) warp = { x: e.x, z: e.z, tick: m.tick }; if (e.t === 'summon') summons += e.n; }
    }
    check('52k alien blink: the landing spot is marked first, it arrives there blink.delay later', mark && warp && warp.x === mark.x && warp.z === mark.z && Math.abs((warp.tick - mark.tick) * TICK - a.def.blink.delay) < 0.1, JSON.stringify([mark, warp]));
    check('52l alien calls up to summons.per drones at a time around itself', summons >= 1 && summons <= a.def.summons.per * 2 && drones.filter((d) => d.alive).length <= a.def.summons.per * 2, `${summons}`);
    a.hp = 1; a.invulnT = 0; a.shield = 0;
    for (let i = 0; i < 300 && a.alive; i++) step(m, allInputs(m, {}));
    for (let i = 0; i < 3; i++) step(m, {});
    check('52m the alien down takes its drones with it and ends the stage', !a.alive && drones.every((d) => !d.alive) && m.over && m.winner === 0);
  }
  {
    const run = (id) => { const m = bossMatch(id, 11); for (let i = 0; i < 30 * 25 && !m.over; i++) step(m, allInputs(m, {})); return JSON.stringify(m.units.map((u) => [u.alive, Math.round(u.hp), Math.round(u.x * 100), Math.round(u.z * 100)])); };
    check('52n boss fights are deterministic (25 s of each, same seed twice)', ['1-6', '2-6', '3-6', '4-6'].every((id) => run(id) === run(id)));
  }
  {
    const out = [];
    for (const id of ['1-6', '2-6', '3-6', '4-6']) {
      let w = 0;
      for (const seed of [21, 22, 23]) { const m = pveMatch(id, seed, Math.round(pveStage(id).recLv / 5)); while (!m.over) step(m, allInputs(m, {})); if (m.winner === 0) w++; }
      out.push(`${id}:${w}/3`);
    }
    check('52o three bots at the recommended level beat every chapter boss in at least 2 of 3 runs (a human dodges the marks better)', out.every((s) => +s.split(':')[1][0] >= 2), out.join(' '));
  }
}

// Standalone run.
if (process.argv[1] && process.argv[1].endsWith('modes-cases.mjs')) {
  let failed = 0, passed = 0;
  const ck = (name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, sec = (s) => console.log(`\n# ${s}`);
  runModeCases(ck, sec); runPveCases(ck, sec); runBossCases(ck, sec);
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
