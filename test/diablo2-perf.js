/*
 * Đo hiệu năng games/diablo2 (Ác Quỷ II): thời gian nạp, thời gian khung, giật khi vào khu, bộ nhớ.
 * Chạy: node test/diablo2-perf.js [--cpu 4] [--json out.json] [--areas a,b,c] [--quick]
 *   --cpu N    làm chậm CPU N lần (CDP Emulation.setCPUThrottlingRate) để giống điện thoại tầm trung
 *   --json f   ghi số đo ra tệp, để so lần sau: node test/diablo2-perf.js --cmp truoc.json sau.json
 * Biến môi trường: PLAYWRIGHT_PATH, D2_URL (mặc định bản file:// trong repo).
 *
 * Không phải bộ kiểm đúng/sai: in số, việc so trước/sau làm bằng --cmp. Thao tác dựng cảnh đi qua D2DBG
 * (dịch chuyển, sinh quái); phép đánh đi qua chuột phải thật.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const repo = path.resolve(__dirname, '..');
const root = 'file:///' + repo.split(path.sep).join('/').replace(/^\//, '');
const URL = process.env.D2_URL || (root + '/games/diablo2/index.html');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const CPU = +(opt('--cpu') || 1);
const QUICK = argv.includes('--quick');
const SAMPLE_MS = QUICK ? 1500 : 4000;
const AREAS = (opt('--areas') || [
  'den_of_evil', 'cold_plains', 'catacombs_level_2', 'lut_gholein', 'arcane_sanctuary',
  'kurast_docks', 'flayer_jungle', 'travincal', 'the_pandemonium_fortress', 'the_chaos_sanctuary',
  'harrogath', 'frigid_highlands', 'worldstone_keep_level_2', 'throne_of_destruction'
].join(',')).split(',');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = v => Math.round(v * 10) / 10;

if (opt('--cmp')) {
  const i = argv.indexOf('--cmp'), A = JSON.parse(fs.readFileSync(argv[i + 1])), B = JSON.parse(fs.readFileSync(argv[i + 2]));
  const keys = Object.keys(A).filter(k => typeof A[k] === 'number' && typeof B[k] === 'number');
  console.log('chỉ số'.padEnd(46) + 'trước'.padStart(12) + 'sau'.padStart(12) + 'đổi'.padStart(10));
  keys.forEach(k => {
    const d = A[k] ? ((B[k] - A[k]) / Math.abs(A[k]) * 100) : 0;
    console.log(k.padEnd(46) + String(A[k]).padStart(12) + String(B[k]).padStart(12) + ((d > 0 ? '+' : '') + d.toFixed(0) + '%').padStart(10));
  });
  process.exit(0);
}

// khung hình đo bằng requestAnimationFrame riêng (khoảng cách giữa hai khung, gồm cả GC và giải mã ảnh)
const INSTALL = () => {
  const T = window.__perf = { fr: [], long: [], on: false };
  let last = 0;
  const tick = t => { if (T.on && last) T.fr.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver(l => { if (T.on) l.getEntries().forEach(e => T.long.push(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
};

async function window_(p, ms) {
  await p.evaluate(() => { window.__perf.fr = []; window.__perf.long = []; window.__perf.on = true; window.__perf.t0 = performance.now(); });
  const cpu = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await sleep(Math.min(2000, ms - (Date.now() - t0))); cpu.push(await p.evaluate(() => D2DBG.perf())); }
  const r = await p.evaluate(() => { window.__perf.on = false; return { fr: window.__perf.fr, long: window.__perf.long, dt: performance.now() - window.__perf.t0 }; });
  return {
    frames: r.fr.length, fps: r1(r.fr.length / (r.dt / 1000)),
    p50: r1(q(r.fr, 0.5)), p95: r1(q(r.fr, 0.95)), p99: r1(q(r.fr, 0.99)), max: r1(Math.max(0, ...r.fr)),
    over50: r.fr.filter(v => v > 50).length, longTasks: r.long.length, longMax: r1(Math.max(0, ...r.long)),
    cpuAvg: r1(cpu.reduce((s, c) => s + c.avg, 0) / Math.max(1, cpu.length)), cpuMax: r1(Math.max(0, ...cpu.map(c => c.max)))
  };
}

function rssMB(pid) {
  // tổng RSS của tiến trình trình duyệt và mọi tiến trình con (renderer, GPU), đọc /proc trên Linux
  try {
    const kids = {}; fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).forEach(d => {
      try { const st = fs.readFileSync('/proc/' + d + '/stat', 'utf8').split(') ')[1].split(' '); (kids[st[1]] = kids[st[1]] || []).push(d); } catch (e) {}
    });
    let tot = 0; const walk = id => { try { tot += +/VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/' + id + '/status', 'utf8'))[1]; } catch (e) {} (kids[id] || []).forEach(walk); };
    walk(String(pid)); return Math.round(tot / 1024);
  } catch (e) { return 0; }
}
async function memory(p, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  // Chrome là tiến trình con của chính node này; trừ RSS của node
  const rss = rssMB(process.pid) - Math.round(process.memoryUsage().rss / 1048576);
  return Object.assign({ rssMB: rss }, await p.evaluate(() => {
    let px = 0, n = 0;
    Object.keys(D2.E.images).forEach(k => { const r = D2.E.images[k]; if (r.ok) { n++; px += r.img.naturalWidth * r.img.naturalHeight; } });
    return { heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), images: n, imageMB: Math.round(px * 4 / 1048576) };
  }));
}

(async () => {
  const { chromium } = require(PW);
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 600 } });
  await ctx.addInitScript(INSTALL);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const reqs = [];
  p.on('request', r => reqs.push({ url: r.url(), t: Date.now() }));

  const out = {}, lines = [];
  const put = (k, v) => { out[k] = v; };
  const row = (name, w, m) => {
    lines.push(name.padEnd(30) + ['fps ' + w.fps, 'p50 ' + w.p50, 'p95 ' + w.p95, 'p99 ' + w.p99, 'max ' + w.max, '>50ms ' + w.over50,
      'cpu ' + w.cpuAvg + '/' + w.cpuMax].map(s => s.padEnd(12)).join('') + (m ? ' heap ' + m.heapMB + 'MB img ' + m.images + '/' + m.imageMB + 'MB rss ' + m.rssMB + 'MB' : ''));
  };

  // ---------------------------------------------------------------- nạp
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForSelector('.screen.title .tmenu', { timeout: 60000 });
  const tTitle = Date.now() - t0;
  const bootReqs = reqs.slice();
  await p.click('.tmenu button:has-text("Trò chơi mới")');
  await p.waitForSelector('.ccard');
  await p.click('.ccard[data-cls=sorceress]');
  await p.fill('#pname', 'Perf');
  const t1 = Date.now();
  await p.click('#pgo');
  await p.waitForFunction(() => window.D2DBG && D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 60000 });
  const tPlay = Date.now() - t1;
  const sizeOf = list => {
    let raw = 0, gz = 0;
    list.forEach(r => {
      if (!/^file:/.test(r.url)) return;
      const f = decodeURIComponent(r.url.replace(/^file:\/\//, '').replace(/\?.*$/, ''));
      if (!fs.existsSync(f)) return;
      const buf = fs.readFileSync(f); raw += buf.length;
      gz += /\.(js|json|css|html)$/.test(f) ? zlib.gzipSync(buf, { level: 6 }).length : buf.length;
    });
    return { raw: Math.round(raw / 1024), gz: Math.round(gz / 1024) };
  };
  const bootSz = sizeOf(bootReqs), playSz = sizeOf(reqs);
  put('boot_title_ms', tTitle); put('boot_play_ms', tPlay);
  put('boot_title_KB', bootSz.raw); put('boot_title_gzKB', bootSz.gz); put('boot_play_KB', playSz.raw); put('boot_play_gzKB', playSz.gz);
  put('boot_requests', reqs.length);
  lines.push('nạp: tới màn đầu ' + tTitle + ' ms (' + bootReqs.length + ' tệp, ' + bootSz.raw + ' KB, gzip ' + bootSz.gz + ' KB); ' +
    'bấm vào game tới khi chơi được ' + tPlay + ' ms (tổng ' + reqs.length + ' tệp, ' + playSz.raw + ' KB, gzip ' + playSz.gz + ' KB)');

  await p.evaluate(() => {
    const S = D2DBG.S; S.char.hp = 1e6;
    Object.keys(D2DATA.quests).forEach(k => { S.char.quests[k] = 'done'; });
    D2DBG.give({ skills: { frozen_orb: 20, blizzard: 20, fire_ball: 20, cold_mastery: 10 } });
  });

  // ---------------------------------------------------------------- cảnh cố định
  await sleep(1500);
  let w = await window_(p, SAMPLE_MS), m = await memory(p, cdp);
  row('rogue_encampment đứng yên', w, m); put('town_p95', w.p95); put('town_cpu', w.cpuAvg); put('town_heapMB', m.heapMB); put('town_imageMB', m.imageMB); put('town_rssMB', m.rssMB);

  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await p.waitForFunction(() => D2DBG.getState().area === 'blood_moor', null, { timeout: 60000 });
  await sleep(1500);
  w = await window_(p, SAMPLE_MS); m = await memory(p, cdp);
  row('blood_moor đứng yên', w, m); put('moor_p95', w.p95); put('moor_cpu', w.cpuAvg);

  // trận đông: 40 quái quanh hero, giữ chuột phải bắn Frozen Orb liên tục
  await p.evaluate(() => {
    const S = D2DBG.S, h = S.hero, ids = D2DBG.monIds();
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r = 4 + (i % 4) * 1.5; D2DBG.spawn(ids[i % ids.length], 1, Math.cos(a) * r, Math.sin(a) * r); }
    S.char.mp = 1e6; D2DBG.setSkills('attack', 'frozen_orb');
  });
  const c = await p.evaluate(() => { const h = D2DBG.getState().hero; return D2DBG.client(h.x + 3, h.y - 1, 20); });
  await p.mouse.move(c.x, c.y); await p.mouse.down({ button: 'right' });
  const keepMana = setInterval(() => p.evaluate(() => { D2DBG.S.char.mp = 1e6; D2DBG.S.char.hp = 1e6; }).catch(() => {}), 500);
  w = await window_(p, SAMPLE_MS * 1.5);
  clearInterval(keepMana);
  await p.mouse.up({ button: 'right' });
  m = await memory(p, cdp);
  const nm = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'mon').length + ' quái, ' + D2DBG.S.ents.filter(e => e.kind === 'missile').length + ' đạn');
  row('blood_moor 40 quái + Frozen Orb', w, m); put('fight_p95', w.p95); put('fight_p99', w.p99); put('fight_cpu', w.cpuAvg); put('fight_cpuMax', w.cpuMax); put('fight_over50', w.over50);
  lines.push('    (' + nm + ')');

  // ---------------------------------------------------------------- vào khu: thời gian dựng + giật ngay sau khi vào
  let sumGo = 0, sumHitch = 0, nGo = 0;
  for (const id of AREAS) {
    const ta = Date.now();
    const ok = await p.evaluate(id => D2DBG.goto(id).then(r => r !== false, e => 'ERR ' + e.message), id);
    const tGo = Date.now() - ta;
    if (ok !== true) { lines.push(id.padEnd(30) + 'không vào được: ' + ok); continue; }
    await p.evaluate(() => { D2DBG.S.char.hp = 1e6; });
    const wh = await window_(p, 1500);
    const ws = await window_(p, QUICK ? 1000 : 2500);
    m = await memory(p, cdp);
    row(id, ws, m);
    lines.push('    vào khu ' + tGo + ' ms, giật 1,5 s đầu: max ' + wh.max + ' ms, ' + wh.over50 + ' khung > 50 ms');
    put('go_' + id + '_ms', tGo); put('go_' + id + '_hitch', wh.max); put('area_' + id + '_p95', ws.p95); put('area_' + id + '_cpu', ws.cpuAvg);
    sumGo += tGo; sumHitch += wh.max; nGo++;
  }
  put('go_avg_ms', Math.round(sumGo / Math.max(1, nGo))); put('go_avg_hitch', Math.round(sumHitch / Math.max(1, nGo)));
  m = await memory(p, cdp);
  put('end_heapMB', m.heapMB); put('end_images', m.images); put('end_imageMB', m.imageMB); put('end_rssMB', m.rssMB);
  lines.push('cuối: heap ' + m.heapMB + ' MB, ' + m.images + ' ảnh đã nạp = ' + m.imageMB + ' MB điểm ảnh đã giải mã, RSS Chrome ' + m.rssMB + ' MB');

  console.log('Ác Quỷ II, đo hiệu năng' + (CPU > 1 ? ' (CPU chậm ' + CPU + 'x)' : '') + ' - ' + URL);
  console.log(lines.join('\n'));
  if (errs.length) console.log('LỖI TRANG:\n  ' + errs.slice(0, 10).join('\n  '));
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
