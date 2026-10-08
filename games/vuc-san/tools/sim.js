#!/usr/bin/env node
/*
 * Chạy các trận toàn bot không cần trình duyệt, để cân bằng: bên nào thắng, trận dài bao lâu, tốn bao nhiêu ms.
 * Dùng:  node games/vuc-san/tools/sim.js --matches 20 --map A01 --seed 1 [--quiet]
 *   --map all   lần lượt qua mọi bản đồ trong VS.MAPS
 * Mỗi trận bốc đội hình ngẫu nhiên (4 thợ lặn, 2 cá mập, không trùng) từ hạt giống của trận; cùng --seed thì ra cùng kết quả.
 */
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', '..', '..', 'test', 'vuc-san-lib.js'));

function parseArgs(argv) {
  const o = { matches: 20, map: 'A01', seed: 1, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--matches') o.matches = parseInt(argv[++i], 10);
    else if (k === '--map') o.map = argv[++i];
    else if (k === '--seed') o.seed = parseInt(argv[++i], 10);
    else if (k === '--quiet') o.quiet = true;
    else { console.error('tham số lạ: ' + k + '\nDùng: node tools/sim.js --matches N --map ID|all --seed S [--quiet]'); process.exit(2); }
  }
  if (!(o.matches > 0) || !Number.isFinite(o.seed)) { console.error('--matches và --seed phải là số'); process.exit(2); }
  return o;
}

function pick(rng, ids, n) {
  return rng.shuffle(ids.slice()).slice(0, n);
}

function lineupFor(VS, seed) {
  const rng = VS.rng((seed ^ 0xa5a5a5a5) >>> 0), M = VS.TUNING.match;
  const dv = pick(rng, Object.keys(VS.DIVERS), M.divers), sh = pick(rng, Object.keys(VS.SHARKS), M.sharks);
  return dv.map((id, i) => ({ team: 'diver', defId: id, name: 'T' + (i + 1), ctrl: 'bot' }))
    .concat(sh.map((id, i) => ({ team: 'shark', defId: id, name: 'C' + (i + 1), ctrl: 'bot' })));
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const W = T.nodeSim(T.SIM_FILES), VS = W.VS;
  const maps = opt.map === 'all' ? VS.MAPS.map((x) => x.id) : [opt.map];
  const dt = 1 / 60, guard = Math.ceil((VS.TUNING.match.intro + VS.TUNING.match.length + 60) / dt);
  const wins = { diver: 0, shark: 0 }, reasons = {};
  let totLen = 0, totMs = 0, maxMs = 0;

  for (let i = 0; i < opt.matches; i++) {
    const seed = opt.seed + i, mapId = maps[i % maps.length];
    const lineup = lineupFor(VS, seed);
    const t0 = process.hrtime.bigint();
    const m = VS.sim.createMatch({ seed, mapId, lineup });
    let steps = 0;
    while (m.phase !== 'end' && steps++ < guard) { VS.sim.step(m, dt); m.events.length = 0; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (m.phase !== 'end') { console.error('trận ' + (i + 1) + ' không kết thúc sau ' + guard + ' bước (seed ' + seed + ', ' + mapId + ')'); process.exitCode = 1; continue; }
    const r = m.result, divers = m.actors.filter((a) => a.team === 'diver'), sharks = m.actors.filter((a) => a.team === 'shark');
    const sum = (list, k) => list.reduce((s, a) => s + a.stats[k], 0);
    wins[r.winner]++; reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    totLen += m.t; totMs += ms; if (ms > maxMs) maxMs = ms;
    if (!opt.quiet) {
      console.log('#' + String(i + 1).padStart(2, '0') + ' ' + mapId.padEnd(4) + ' seed=' + String(seed).padEnd(4) +
        ' winner=' + r.winner.padEnd(5) + ' reason=' + r.reason.padEnd(6) + ' t=' + m.t.toFixed(1).padStart(5) + 's' +
        ' banked=' + m.score.banked + '/' + m.score.target + ' bites=' + sum(sharks, 'bites') + ' downs=' + sum(divers, 'downs') +
        ' outs=' + sum(divers, 'outs') + ' sharkOuts=' + sum(divers, 'sharkOuts') + ' tickets=' + m.tickets + ' ms=' + ms.toFixed(0));
    }
  }
  const n = wins.diver + wins.shark;
  if (!n) { console.log('không có trận nào kết thúc'); return; }
  const pct = (v) => Math.round(100 * v / n) + '%';
  console.log('tóm tắt: ' + n + ' trận, map=' + opt.map + ', seed ' + opt.seed + '..' + (opt.seed + opt.matches - 1) +
    ' | thợ lặn thắng ' + wins.diver + ' (' + pct(wins.diver) + '), cá mập thắng ' + wins.shark + ' (' + pct(wins.shark) + ')' +
    ' | lý do ' + Object.keys(reasons).sort().map((k) => k + ':' + reasons[k]).join(' ') +
    ' | dài TB ' + (totLen / n).toFixed(1) + 's | ' + (totMs / n).toFixed(0) + ' ms/trận (tối đa ' + maxMs.toFixed(0) + ')');
}

main();
