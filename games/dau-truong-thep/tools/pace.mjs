// Pace of bot matches per mode and team size: match length, share ending on the clock, kills and respawns, and the numbers that belong to one mode.
//   node tools/pace.mjs                  PACE_N matches per mode and size (default 60), PACE_SIZES=1,2,3,5 (5 = the old 5v5 baseline), PACE_MODES=tdm,nha,chiem,tudo,trum
//   PACE_JS=<dir with js/>  measures another checkout (a before number)       PACE_MD=<file> also writes the table as markdown
//   PACE_RULES='{"tdm":{"3":{"target":11}}}'  what-if: size rows merged over MODES[mode].sizes before the matches (nothing is written)
//   node tools/pace.mjs maps             contact on every layout: seconds to first contact, share of time nobody is within 20 m, mean distance to the nearest enemy
// Teams are mirror-free random draws from the 16 mechs, normal bots. tudo plays 2 * size mechs, trum plays `size` hunters against the boss.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = process.env.PACE_JS ? path.resolve(process.env.PACE_JS, 'js') : path.resolve(HERE, '..', 'js');
const MODES_ALL = ['tdm', 'nha', 'chiem', 'tudo', 'trum'];

async function playJob({ mode, size, n, seed0, maps }) {
  const load = (f) => import(path.join(JS, f));
  const { createMatch, step } = await load('sim.js');
  const { allInputs } = await load('bots.js');
  const { MECH_ORDER, TICK, MODES } = await load('data.js');
  if (process.env.PACE_RULES) for (const [k, rows] of Object.entries(JSON.parse(process.env.PACE_RULES))) for (const [n, o] of Object.entries(rows)) MODES[k].sizes[n] = { ...(MODES[k].sizes[n] || {}), ...o };
  const { mapsFor, MAP_ORDER, NHA_ORDER } = await load('maps.js');
  const { mulberry } = await load('rng.js');
  const rows = [];
  const pool = maps ? (mode === 'nha' ? NHA_ORDER : MAP_ORDER) : mapsFor(mode);
  for (let i = 0; i < n; i++) {
    const rng = mulberry(seed0 * 7919 + i * 31 + size * 101 + mode.length);
    const order = MECH_ORDER.slice().sort(() => rng() - 0.5);
    const roster = [];
    if (mode === 'trum') { for (let k = 0; k < size; k++) roster.push({ team: 0, mech: order[k], name: order[k], bot: true, diff: 'normal' }); roster.push({ team: 1, mech: 'titan', name: 'boss', bot: true, diff: 'normal' }); }
    else if (mode === 'tudo') for (let k = 0; k < 2 * size; k++) roster.push({ team: k % 2, mech: order[k], name: order[k], bot: true, diff: 'normal' });
    else for (let k = 0; k < 2 * size; k++) roster.push({ team: k < size ? 0 : 1, mech: order[k], name: order[k], bot: true, diff: 'normal' });
    const mapKey = maps ? pool[i % pool.length] : pool[i % pool.length];
    const m = createMatch({ map: mapKey, seed: seed0 * 1000 + i, roster, mode });
    const R = { mode, size, map: mapKey, firstSub: -1, main: -1, captures: 0, contact: -1, far: 0, near: 0, dsum: 0, samples: 0 };
    const limit = Math.ceil(m.duration / TICK) + 5;
    for (let t = 0; !m.over && t < limit; t++) {
      step(m, allInputs(m));
      for (const e of m.events) {
        if (e.t === 'towerDown') { if (e.kind === 'sub' && R.firstSub < 0) R.firstSub = m.time; if (e.kind === 'main') R.main = m.time; }
        if (e.t === 'capture') R.captures++;
      }
      if (maps && mode === 'tdm' && t % 6 === 0) {
        let best = 1e9;
        for (const a of m.units) if (a.alive) for (const b of m.units) if (b.alive && b.team !== a.team) best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
        if (best < 1e9) { R.samples++; R.dsum += best; if (best > 20) R.far++; if (R.contact < 0 && best < 14) R.contact = m.time; }
      }
    }
    const units = m.units.filter((u) => !u.def.boss);
    R.time = m.time; R.clock = m.time >= m.duration - 0.05; R.winner = m.winner;
    R.kills = units.reduce((a, u) => a + u.kills, 0); R.deaths = units.reduce((a, u) => a + u.deaths, 0); R.n = units.length;
    R.score = m.score.slice(); R.lives = m.lives;
    R.top = Math.max(...m.score);
    rows.push(R);
  }
  return rows;
}

if (!isMainThread) {
  playJob(workerData).then((rows) => parentPort.postMessage(rows));
} else {
  const args = process.argv.slice(2), maps = args[0] === 'maps';
  const N = +(process.env.PACE_N || (maps ? 24 : 60)), seed0 = +(process.env.PACE_SEED || 1);
  const sizes = (process.env.PACE_SIZES || (maps ? '3,5' : '1,2,3,5')).split(',').map(Number);
  const modes = maps ? ['tdm', 'nha'] : (process.env.PACE_MODES || MODES_ALL.join(',')).split(',').filter((k) => MODES_ALL.includes(k));
  const jobs = [];
  const SPLIT = 4;
  for (const mode of modes) for (const size of sizes) for (let s = 0; s < SPLIT; s++) jobs.push({ mode, size, n: Math.ceil(N / SPLIT), seed0: seed0 + s * 977, maps });
  const results = new Map();
  let next = 0;
  const run = () => new Promise((resolve) => {
    let active = 0;
    const launch = () => {
      while (active < os.cpus().length && next < jobs.length) {
        const job = jobs[next++]; active++;
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: job });
        w.on('message', (rows) => { const k = job.mode + ':' + job.size; results.set(k, (results.get(k) || []).concat(rows)); });
        w.on('error', (e) => { console.error(e); process.exit(2); });
        w.on('exit', () => { active--; if (next >= jobs.length && !active) resolve(); else launch(); });
      }
    };
    launch();
  });
  await run();
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const f0 = (v) => (v < 0 || Number.isNaN(v) ? '-' : v.toFixed(0)), f1 = (v) => v.toFixed(1);
  const lines = [];
  if (maps) {
    lines.push('| Layout | Size | Matches | First contact (s) | Nobody within 20 m (%) | Mean nearest enemy (m) |', '|---|---|---|---|---|---|');
    const by = new Map();
    for (const rows of results.values()) for (const r of rows) { const k = r.map + ':' + r.size; by.set(k, (by.get(k) || []).concat(r)); }
    for (const k of [...by.keys()].sort()) {
      const rs = by.get(k).filter((r) => r.mode === 'tdm'); if (!rs.length) continue;
      const smp = rs.reduce((a, r) => a + r.samples, 0);
      lines.push(`| ${k.split(':')[0]} | ${k.split(':')[1]} | ${rs.length} | ${f1(avg(rs.filter((r) => r.contact >= 0).map((r) => r.contact)))} | ${f1(100 * rs.reduce((a, r) => a + r.far, 0) / Math.max(1, smp))} | ${f1(rs.reduce((a, r) => a + r.dsum, 0) / Math.max(1, smp))} |`);
    }
  } else {
    lines.push('| Mode | Size | Matches | Mean len (s) | p10 | p90 | On clock % | Kills/min | Deaths/mech | Mode specific |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const mode of modes) for (const size of sizes) {
      const rs = results.get(mode + ':' + size) || [];
      if (!rs.length) continue;
      const t = rs.map((r) => r.time), mins = avg(t) / 60;
      let extra = '';
      if (mode === 'nha') {
        const ended = rs.filter((r) => r.main >= 0);
        extra = `first sub ${f0(avg(rs.filter((r) => r.firstSub >= 0).map((r) => r.firstSub)))} s, main ${f0(avg(ended.map((r) => r.main)))} s, tower finish ${f0(100 * ended.length / rs.length)}%`;
      } else if (mode === 'chiem') extra = `score ${f1(avg(rs.map((r) => (r.score[0] + r.score[1]) / (r.time / 60))))}/min, captures ${f1(avg(rs.map((r) => r.captures)))}, winner score ${f0(avg(rs.map((r) => r.top)))}`;
      else if (mode === 'trum') {
        const won = rs.filter((r) => r.winner === 0);
        extra = `boss killed ${f0(100 * won.length / rs.length)}% at ${f0(avg(won.map((r) => r.time)))} s`;
      } else if (mode === 'tudo') extra = `winner kills ${f1(avg(rs.map((r) => r.top)))}`;
      else extra = `winner score ${f1(avg(rs.map((r) => r.top)))}`;
      lines.push(`| ${mode} | ${size}v${size} | ${rs.length} | ${f0(avg(t))} | ${f0(pct(t, 0.1))} | ${f0(pct(t, 0.9))} | ${f0(100 * rs.filter((r) => r.clock).length / rs.length)} | ${f1(avg(rs.map((r) => r.kills)) / mins)} | ${f1(avg(rs.map((r) => r.deaths / r.n)))} | ${extra} |`);
    }
  }
  console.log(lines.join('\n'));
  if (process.env.PACE_MD) fs.writeFileSync(process.env.PACE_MD, lines.join('\n') + '\n');
}
