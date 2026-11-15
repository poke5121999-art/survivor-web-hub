// Balance by numbers: bot matches with random mirror-free teams (a mech never faces itself and never appears twice),
// every mech's win rate and K/D per mode, checked against a band. A medic is judged on win rate only: healing is its job, so its K/D says little.
//   node tools/balance.mjs [tdm,nha,chiem]      BAL_N=matches per mode (default 120)   BAL_DIFF=normal   BAL_SEED=1
//   BAL_LV=3 plays every mech at that upgrade level on every track. BAL_SIZE=mechs a side (default 3; 5 = the old 5v5).
//   Teams are 2 * BAL_SIZE consecutive picks of a 16-mech shuffle that is redrawn every 16 matches and walked 5 places per match,
//   so every mech plays the same number of matches (16 matches = 2 * BAL_SIZE games each) and never meets itself.
//   Matches run on BAL_THREADS worker threads (default: all cores); the table does not depend on the thread count.
// Exit code 1 when a mech is outside the band.
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createMatch, step, summary } from '../js/sim.js';
import { allInputs } from '../js/bots.js';
import { MECH_ORDER, MECHS, MODES } from '../js/data.js';
import { mulberry } from '../js/rng.js';
import { mapsFor } from '../js/maps.js';

const N = +(process.env.BAL_N || 120), diff = process.env.BAL_DIFF || 'normal', seed0 = +(process.env.BAL_SEED || 1), LV = +(process.env.BAL_LV || 0), SIZE = +(process.env.BAL_SIZE || 3);
const BAND = { win: [0.4, 0.6], kd: [0.45, 2.5], nhaWin: 0.65 };

function playOne(mode, i) {
  const maps = mapsFor(mode);
  const rng = mulberry(seed0 * 7919 + Math.floor(i / 16) * 31 + mode.length);
  const order = MECH_ORDER.slice().sort(() => rng() - 0.5);
  const picks = Array.from({ length: 2 * SIZE }, (_, k) => order[(k + 5 * (i % 16)) % order.length]);
  const swap = Math.floor(i / 16) & 1;
  const roster = picks.map((mech, k) => ({ team: (k < SIZE ? 0 : 1) ^ swap, mech, name: mech, bot: true, diff, mods: { lv: [LV, LV, LV, LV, LV] } }));
  const m = createMatch({ map: maps[i % maps.length], seed: seed0 * 1000 + i, roster, mode });
  while (!m.over) step(m, allInputs(m));
  const sum = summary(m);
  return { time: sum.time, winner: sum.winner, rows: sum.rows.map((r) => ({ mech: r.mech, team: r.team, kills: r.kills, assists: r.assists, deaths: r.deaths, dmg: r.dmg, healed: r.healed })) };
}

if (!isMainThread) {
  parentPort.postMessage(workerData.map(([mode, i]) => [mode, i, playOne(mode, i)]));
} else {
  const modes = (process.argv[2] || 'tdm,nha,chiem').split(',').filter((k) => MODES[k]);
  const jobs = [];
  for (let i = 0; i < N; i++) for (const mode of modes) jobs.push([mode, i]);
  const T = Math.max(1, +(process.env.BAL_THREADS || os.cpus().length));
  const chunks = Array.from({ length: T * 6 }, () => []);
  jobs.forEach((j, k) => chunks[k % chunks.length].push(j));
  const done = new Map();
  await new Promise((resolve) => {
    let next = 0, active = 0;
    const launch = () => {
      while (active < T && next < chunks.length) {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: chunks[next++] }); active++;
        w.on('message', (res) => { for (const [mode, i, r] of res) done.set(mode + ':' + i, r); });
        w.on('error', (e) => { console.error(e); process.exit(2); });
        w.on('exit', () => { active--; if (next >= chunks.length && !active) resolve(); else launch(); });
      }
    };
    launch();
  });
  let failed = 0;
  for (const mode of modes) {
    const stat = Object.fromEntries(MECH_ORDER.map((k) => [k, { games: 0, wins: 0, draws: 0, kills: 0, assists: 0, deaths: 0, dmg: 0, healed: 0 }]));
    let secs = 0, draws = 0;
    for (let i = 0; i < N; i++) {
      const sum = done.get(mode + ':' + i);
      secs += sum.time;
      if (sum.winner < 0) draws++;
      for (const r of sum.rows) {
        const s = stat[r.mech];
        s.games++; s.kills += r.kills; s.assists += r.assists; s.deaths += r.deaths; s.dmg += r.dmg; s.healed += r.healed;
        if (sum.winner === r.team) s.wins++; else if (sum.winner < 0) s.draws++;
      }
    }
    console.log(`\n## ${MODES[mode].name} (${mode}): ${N} trận, ${SIZE}v${SIZE}, bot ${diff}, cấp ${LV}, trung bình ${(secs / N).toFixed(0)} giây, ${draws} trận hòa`);
    console.log('| Cỗ máy | Trận | Thắng % | K/D | Hạ gục / trận | Sát thương / trận | Hồi máu / trận | |');
    console.log('|---|---|---|---|---|---|---|---|');
    const hi = mode === 'nha' ? BAND.nhaWin : BAND.win[1];
    for (const k of MECH_ORDER) {
      const s = stat[k], win = (s.wins + s.draws / 2) / s.games, kd = s.kills / Math.max(1, s.deaths), medic = MECHS[k].roleKey === 'medic';
      const out = win < BAND.win[0] || win > hi || (!medic && (kd < BAND.kd[0] || kd > BAND.kd[1]));
      if (out) failed++;
      console.log(`| ${MECHS[k].name} | ${s.games} | ${(win * 100).toFixed(0)} | ${kd.toFixed(2)} | ${(s.kills / s.games).toFixed(1)} | ${Math.round(s.dmg / s.games)} | ${Math.round(s.healed / s.games)} | ${out ? 'NGOÀI KHOẢNG' : ''} |`);
    }
  }
  console.log(`\nKhoảng: thắng ${BAND.win[0] * 100} đến ${BAND.win[1] * 100}% (Thủ nhà: tối đa ${BAND.nhaWin * 100}%), K/D ${BAND.kd[0]} đến ${BAND.kd[1]}. ${failed ? failed + ' dòng ngoài khoảng' : 'Mọi cỗ máy trong khoảng'}.`);
  process.exit(failed ? 1 : 0);
}
