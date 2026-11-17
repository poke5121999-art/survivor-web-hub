// Phó bản balance probe: all-bot runs of stages, prints outcome, time, waves, lives. node tools/pve-probe.mjs [ids] [seeds] [lv]
import { createMatch, step } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { PVE_ORDER, pveStage, pveStars, MECH_ORDER } from '../js/data.js';
import { pveLineup } from '../js/roster.js';
import { mulberry } from '../js/rng.js';

const ids = process.argv[2] ? process.argv[2].split(',') : PVE_ORDER;
const seeds = +(process.argv[3] || 2), LV = process.argv[4] !== undefined ? +process.argv[4] : null;
for (const id of ids) {
  const S = pveStage(id), lv = LV === null ? Math.round(S.recLv / 5) : LV;
  const out = [];
  let think = 0;
  for (let s = 1; s <= seeds; s++) {
    const seed = 1000 + s;
    const L = pveLineup(id, [{ mech: MECH_ORDER[(s * 7) % 16], name: 'P', bot: true, mods: { lv: [lv, lv, lv, lv, lv] } }], { rng: mulberry(seed) });
    const m = createMatch({ map: L.map, theme: L.theme, seed, roster: L.roster, mode: 'pve', stage: id, duration: L.duration });
    const t0 = Date.now();
    while (!m.over) step(m, allInputs(m, {}));
    think += Date.now() - t0;
    out.push(`${m.winner === 0 ? 'WIN ' + pveStars(S, m.time) + '*' : 'lose'} ${Math.round(m.time)}s w${m.wave + 1}/${m.waves} lives ${m.lives}`);
  }
  console.log(`${id.padEnd(4)} par ${S.par} units ${S.waves.map((w) => w.join('+')).join(' | ')} :: ${out.join(' ; ')}  (${(think / seeds / 1000).toFixed(1)} s cpu)`);
}
