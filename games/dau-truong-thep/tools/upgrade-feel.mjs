// How an upgraded mech fares against easy bots, in whole bot matches (team deathmatch 3v3, Node, no browser).
// The "player" is a hard bot on team 0 at garage level 0 or max; team 0's other bots are normal at half its level and
// team 1's are easy, built exactly as main.js does for a solo match. Prints the player's deaths per minute, the median
// time it lives once it engages, and team 0's win share, over many seeds and mechs.
//   node tools/upgrade-feel.mjs [seeds]
import { createMatch, step } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { MAP_ORDER } from '../js/maps.js';
import { MECH_ORDER, DIFFICULTY, UPGRADE, TICK } from '../js/data.js';

const SEEDS = Number(process.argv[2] || 24);
const run = (lvN) => {
  let deaths = 0, minutes = 0, wins = 0, games = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const pick = MECH_ORDER[s % MECH_ORDER.length], lv = [lvN, lvN, lvN, lvN, lvN], E = DIFFICULTY.easy;
    const foes = [1, 2, 3].map((k) => MECH_ORDER[(s * 7 + k * 5) % MECH_ORDER.length]);
    const roster = [{ team: 0, mech: pick, name: 'P', bot: true, diff: 'hard', mods: { lv } },
      ...[1, 2].map((k) => ({ team: 0, mech: MECH_ORDER[(s * 3 + k) % MECH_ORDER.length], name: 'A' + k, bot: true, diff: 'normal', mods: { lv: lv.map((l) => Math.floor(l / 2)) } })),
      ...foes.map((mech, k) => ({ team: 1, mech, name: 'E' + k, bot: true, diff: 'easy', mods: { lv: lv.map((l) => Math.floor(l * (E.foeLv ?? 0.5))), dmg: E.foeDmg ?? 1 } }))];
    const m = createMatch({ seed: s, mode: 'tdm', map: MAP_ORDER[s % MAP_ORDER.length], roster });
    const limit = Math.ceil(m.duration / TICK) + 5;
    let t = 0, wasAlive = true;
    while (!m.over && t < limit) {
      step(m, allInputs(m)); t++;
      const p = m.units[0];
      if (wasAlive && !p.alive) deaths++;
      wasAlive = p.alive;
    }
    minutes += t * TICK / 60; games++;
    if (m.score && m.score[0] > m.score[1]) wins++;
  }
  return { deathsPerMin: deaths / minutes, deaths, winShare: wins / games };
};
const a = run(0), b = run(UPGRADE.max);
console.log(`level 0  : ${a.deaths} deaths, ${a.deathsPerMin.toFixed(2)}/min, team 0 wins ${(a.winShare * 100).toFixed(0)}%`);
console.log(`level max: ${b.deaths} deaths, ${b.deathsPerMin.toFixed(2)}/min, team 0 wins ${(b.winShare * 100).toFixed(0)}%`);
