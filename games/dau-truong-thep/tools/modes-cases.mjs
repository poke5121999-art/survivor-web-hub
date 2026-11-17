// Play kinds (Đấu thường, Đấu rank, Phó bản): sim-test.mjs section 50 runs these. Standalone: `node tools/modes-cases.mjs` (fast).
import { createMatch, step } from '../js/sim.js';
import { MODES, MODE_ORDER, PLAYS, PLAY_ORDER, RANK_MODES, RANK_TIERS, RANKS, DIFFICULTY, rankTier, rankPlan, cleanPlay, TEAM_SIZE } from '../js/data.js';
import { mapsFor, pickArena } from '../js/maps.js';
import { soloLineup } from '../js/roster.js';
import { makeMeta } from '../js/meta.js';
import { mulberry } from '../js/rng.js';

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

// Standalone run.
if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runModeCases((name, cond, detail = '') => { if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); } }, (s) => console.log(`\n# ${s}`));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
