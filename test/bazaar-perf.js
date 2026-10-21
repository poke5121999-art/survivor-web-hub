/* Đo độ nặng của Chợ Phiên: máy chủ tĩnh cục bộ trên bản sao (gzip như Pages), hoặc BZ_URL=<gốc Pages> để đo bản đã đưa lên.
   Chạy: node test/bazaar-perf.js   Biến: BZ_ROOT (gốc repo/bản sao, mặc định cha của test/), BZ_URL, HARD (ms), NOEXTRA=1 (bỏ ca mạng chậm/CPU chậm),
   BZ_SAVE=<tệp> ghi số đo làm đường cơ sở, BZ_BASELINE=<tệp> so với đường cơ sở (mặc định test/bazaar-perf.baseline.json). Hạn giờ cứng, đóng trình duyệt khi xong. */
'use strict';
const path = require('path'), fs = require('fs');
const http = require('http'), zlib = require('zlib');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
let chromium; try { ({ chromium } = require(PW)); } catch (e) { ({ chromium } = require('playwright')); }
const REPO = path.resolve(process.env.BZ_ROOT || path.join(__dirname, '..'));
let BASE = (process.env.BZ_URL || '').replace(/\/$/, ''), URL_ = '';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', ogg: 'audio/ogg', mp3: 'audio/mpeg', woff2: 'font/woff2', atlas: 'text/plain', skel: 'application/octet-stream' };
function serve() { // máy chủ tĩnh: gzip chữ như GitHub Pages, ảnh/âm thanh để nguyên
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(REPO, p);
      if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      const e = path.extname(f).slice(1), h = { 'content-type': MIME[e] || 'application/octet-stream', 'cache-control': 'max-age=600' };
      let b = fs.readFileSync(f);
      if (/^(html|js|css|json|svg|atlas)$/.test(e) && /gzip/.test(q.headers['accept-encoding'] || '')) { b = zlib.gzipSync(b, { level: 6 }); h['content-encoding'] = 'gzip'; }
      h['content-length'] = b.length; r.writeHead(200, h); r.end(b);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
// ---- chế độ con: node bazaar-perf.js --trace full|lazy  → in băm trạng thái từng bước của các run chơi ngẫu nhiên có hạt giống
if (process.argv[2] === '--trace') {
  const lazy = process.argv[3] === 'lazy', crypto = require('crypto'), D = path.join(REPO, 'games/bazaar');
  globalThis.window = globalThis;
  const load = f => require(path.join(D, f));
  if (lazy) { load('data/cards-common.js'); load('data/cards-stubs.js'); } else { load('data/cards.js'); load('data/ghosts.js'); }
  ['heroes', 'monsters', 'mode', 'encounters'].forEach(f => load('data/' + f + '.js'));
  load('js/sim/index.js'); const R = load('js/run/index.js');
  const loaded = {};
  if (lazy) { // loader.js trong Node: <script> chèn vào head = require tệp rồi gọi onload
    globalThis.document = { createElement: () => ({}), head: { appendChild: s => { const f = s.src.split('?')[0]; loaded[f] = 1; try { load(f); } catch (e) { setImmediate(() => s.onerror && s.onerror(e)); return; } setImmediate(() => s.onload()); } } };
    globalThis.BZ_REV = 'x';
    load('js/ui/loader.js');
  }
  const U = globalThis.BZUI && globalThis.BZUI.data;
  const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const H = require(path.join(D, 'data/heroes.js')) && globalThis.BZ_HEROES, heroes = (H.order || Object.keys(H.heroes)).filter(h => H.heroes[h] && H.heroes[h].playable);
  const NS = +(process.env.LAZY_SEEDS || 4), out = [], only = process.argv[4] ? [process.argv[4], +process.argv[5]] : null;
  (async () => {
    for (const hero of heroes) for (let seed = 1; seed <= NS; seed++) {
      if (only && (only[0] !== hero || only[1] !== seed)) continue;
      const rnd = mul(seed * 7919 + hero.length), tr = { hero, seed, steps: [], loads: [] };
      let run = R.newRun({ seed });
      for (let i = 0; i < 500; i++) {
        if (run.phase.kind === 'end') break;
        const L = R.legal(run).filter(c => c.t !== 'move' && c.t !== 'sell' && c.t !== 'swap' && c.t !== 'pickHero' || (c.t === 'pickHero' && c.hero === hero));
        if (!L.length) break;
        let cmd = run.phase.kind === 'heroSelect' ? { t: 'pickHero', hero } : L[Math.floor(rnd() * L.length)];
        if (run.phase.kind !== 'heroSelect' && rnd() < 0.5) { const pr = L.filter(c => /^(fight|leave|next|choose|pick|buy|reroll)$/.test(c.t)); if (pr.length) cmd = pr[Math.floor(rnd() * pr.length)]; }
        if (lazy) {
          if (cmd.t === 'pickHero') await U.loadHero(cmd.hero);
          else {
            const base = JSON.stringify(run), fn = () => R.apply(JSON.parse(base), cmd);
            if (U.needs(fn)) { const before = Object.keys(loaded).join(); await U.ensure(fn); tr.loads.push([i, cmd.t, Object.keys(loaded).filter(k => !before.includes(k)).map(k => k.replace(/^.*\//, '')).join('+')]); }
          }
        }
        const x = R.apply(run, cmd);
        if (!x.ok) { tr.steps.push('rej'); continue; }
        run = x.run;
        if (process.env.LAZY_DUMP === hero + ':' + seed) (tr.dump = tr.dump || []).push([JSON.stringify(cmd), JSON.stringify(run), JSON.stringify(x.events)]);
        tr.steps.push(crypto.createHash('md5').update(JSON.stringify(run) + JSON.stringify(x.events)).digest('hex').slice(0, 10));
      }
      tr.end = run.phase.kind; tr.wins = run.wins; tr.day = run.day;
      out.push(tr);
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  })();
  return;
}
const HARD = +(process.env.HARD || 420000);
setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, HARD).unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- dựng run bằng reducer ở Node (giống test/bazaar-capture.js)
globalThis.window = globalThis;
['cards', 'monsters', 'mode', 'encounters'].forEach(f => require(path.join(REPO, 'games/bazaar/data', f + '.js')));
require(path.join(REPO, 'games/bazaar/js/sim/index.js'));
const R = require(path.join(REPO, 'games/bazaar/js/run/index.js'));
function policy(run, st) {
  const L = R.legal(run).filter(c => c.t !== 'move' && c.t !== 'sell'), has = t => L.filter(c => c.t === t), ph = run.phase;
  if (ph.kind === 'heroSelect') return { t: 'pickHero', hero: st.hero };
  if (ph.kind === 'event' && ph.eventId === 'start') { const i = ph.choices.findIndex(c => c.key === 'income'); return { t: 'choose', i: i < 0 ? 0 : i }; }
  if (ph.kind === 'merchant') { const b = has('buy'); if (b.length && (st.n++ % 2 === 0)) return b[0]; return { t: 'leave' }; }
  if (ph.kind === 'choose') { const mi = ph.options.findIndex(o => o.type === 'merchant'), k = (st.n++) % 3; return { t: 'pick', i: (mi >= 0 && run.gold >= 4 && k !== 2) ? mi : Math.min(k, ph.options.length - 1) }; }
  for (const t of ['choose', 'fight', 'next', 'leave']) { const x = has(t); if (x.length) return x[0]; }
  return null;
}
function find(pred, hero) {
  for (let seed = 1; seed <= 40; seed++) {
    let run = R.apply(R.newRun({ seed }), { t: 'pickHero', hero }).run; const st = { hero, n: 0 };
    for (let i = 0; i < 400; i++) {
      if (run.phase.kind === 'end') break;
      if (pred(run)) return { run, seed };
      const c = policy(run, st); if (!c) break; const x = R.apply(run, c); if (!x.ok) break; run = x.run;
    }
  }
  return null;
}
const RUNS = {
  hour: find(r => r.phase.kind === 'choose' && r.hour !== R.TUNING.PVE_HOUR && r.phase.options.length === 3, 'Vanessa'),
  merchant: find(r => r.phase.kind === 'merchant' && R.legal(r).some(c => c.t === 'buy'), 'Vanessa'),
  fight: find(r => r.phase.kind === 'fight' && r.phase.combatType === 'PVE', 'Vanessa')
};

const INIT = "(() => { window.__lt = []; window.__paint = {};" +
  "try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}" +
  "try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__paint[e.name] = Math.round(e.startTime))).observe({ type: 'paint', buffered: true }); } catch (e) {} })();";

function kind(url, mime) {
  const u = url.split('?')[0], e = (u.match(/\.(\w+)$/) || [])[1] || '';
  if (/fonts\.(gstatic|googleapis)/.test(url) || /woff|ttf/.test(e)) return 'fonts';
  if (/\/audio\//.test(u) || /ogg|mp3|wav|m4a/.test(e)) return 'audio';
  if (/skel|atlas/.test(e) || /spine/i.test(u)) return 'spine';
  if (/png|webp|jpe?g|gif|svg/.test(e) || /^image\//.test(mime || '')) return 'art';
  if (e === 'js' && /\/data\//.test(u)) return 'data(js)';
  if (e === 'js') return 'js';
  if (e === 'css') return 'css';
  if (e === 'html' || e === '') return 'html/other';
  return e;
}

// nạp theo nhu cầu phải cho đúng kết quả như nạp đủ: cùng run (hero, hạt giống, lệnh ngẫu nhiên có hạt) chạy ở tiến trình nạp đủ và ở tiến trình
// mới tinh chỉ có thẻ chung + stub + loader.js (mỗi run một tiến trình, vì thẻ đã nạp nằm lại trong tiến trình); băm trạng thái + sự kiện từng bước phải khớp
async function lazyCheck() {
  const cp = require('child_process');
  const run = (...a) => new Promise((res, rej) => cp.execFile(process.execPath, [__filename, '--trace', ...a], { maxBuffer: 1 << 28, env: process.env }, (e, o) => e ? rej(e) : res(JSON.parse(o))));
  const full = await run('full'), res = [];
  for (let i = 0; i < full.length; i += 3) await Promise.all(full.slice(i, i + 3).map(async f => { const l = (await run('lazy', f.hero, String(f.seed)))[0]; res.push([f, l]); }));
  const bad = res.filter(([f, l]) => JSON.stringify(f.steps) !== JSON.stringify(l.steps));
  bad.forEach(([f, l]) => { let k = 0; while (k < f.steps.length && f.steps[k] === l.steps[k]) k++; console.log('KHÁC', f.hero, f.seed, 'bước', k, '/', f.steps.length, l.steps.length, JSON.stringify(l.loads)); });
  const need = res.filter(([f, l]) => l.loads.length), at = need.map(([f, l]) => l.loads[0][0]).sort((a, b) => a - b), tot = res.reduce((s, [f]) => s + f.steps.length, 0);
  const kinds = {}; need.forEach(([f, l]) => l.loads.forEach(x => { kinds[x[1] + '→' + x[2].replace(/cards-/g, '').replace(/\.js/g, '')] = (kinds[x[1] + '→' + x[2].replace(/cards-/g, '').replace(/\.js/g, '')] || 0) + 1; }));
  console.log('nạp theo nhu cầu: ' + res.length + ' run (' + tot + ' bước), giống nạp đủ ' + (res.length - bad.length) + '/' + res.length + '; run phải nạp thêm ' + need.length + ', lần nạp đầu ở bước ' + (at.length ? at[0] + '..' + at[at.length - 1] + ' (giữa ' + at[at.length >> 1] + ')' : '-'));
  console.log('  cái gì kích nạp: ' + JSON.stringify(kinds));
  return !bad.length;
}
let browser, srv;
async function session(name, o) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); // ngữ cảnh mới = cache lạnh
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Performance.enable');
  if (o.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: o.net.lat, downloadThroughput: o.net.mbps * 125000, uploadThroughput: 125000 });
  if (o.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  const reqs = {};
  cdp.on('Network.requestWillBeSent', e => { reqs[e.requestId] = { url: e.request.url, enc: 0, dec: 0 }; });
  cdp.on('Network.responseReceived', e => { const r = reqs[e.requestId]; if (r) { r.mime = e.response.mimeType; r.status = e.response.status; } });
  cdp.on('Network.dataReceived', e => { const r = reqs[e.requestId]; if (r) r.dec += e.dataLength; });
  cdp.on('Network.loadingFinished', e => { const r = reqs[e.requestId]; if (r) { r.enc = e.encodedDataLength; r.done = true; } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  if (o.save) await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, ['bz.run.v1', o.save]);
  else await page.addInitScript(() => { try { localStorage.removeItem('bz.run.v1'); } catch (e) {} });
  await page.addInitScript(INIT);
  const T0 = Date.now();
  await page.goto(URL_, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => window.BZ_READY === true, null, { timeout: 90000 });
  const tReady = Date.now() - T0;
  await page.waitForSelector(o.ready, { timeout: 60000 });
  const tUI = Date.now() - T0;
  await sleep(1500);
  const snap = () => {
    const a = Object.values(reqs).filter(r => r.done);
    return { n: a.length, enc: a.reduce((s, r) => s + r.enc, 0), dec: a.reduce((s, r) => s + r.dec, 0) };
  };
  const atUI = snap();
  const out = { name, tReadyMs: tReady, tUiMs: tUI, atInteractive: atUI };
  if (o.after) await o.after(page, cdp, out, snap);
  await sleep(3000); // nạp ngầm các hero khác + ghosts
  out.final = snap();
  const top = Object.values(reqs).filter(r => r.done).map(r => ({ url: r.url.replace(BASE, ''), type: kind(r.url, r.mime), enc: r.enc, dec: r.dec })).sort((a, b) => b.enc - a.enc);
  const grp = {}; top.forEach(r => { const g = grp[r.type] = grp[r.type] || { n: 0, enc: 0, dec: 0 }; g.n++; g.enc += r.enc; g.dec += r.dec; });
  out.byType = grp; out.top25 = top.slice(0, 25); out.all = top.map(r => [r.url.replace(/\?v=\w+/, '?v'), r.enc]);
  out.web = await page.evaluate(() => { const nav = performance.getEntriesByType('navigation')[0] || {}; return { paint: window.__paint, longtasks: window.__lt, dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), mem: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null }; });
  const lt = out.web.longtasks; out.web.ltN = lt.length; out.web.ltSum = lt.reduce((s, x) => s + x[1], 0); out.web.ltMax = lt.reduce((s, x) => Math.max(s, x[1]), 0); out.web.ltTop = lt.slice().sort((a, b) => b[1] - a[1]).slice(0, 6);
  out.errors = errs.slice(0, 3);
  out.cdpMetrics = (await cdp.send('Performance.getMetrics')).metrics.filter(m => /JSHeap|Nodes|ScriptDuration|TaskDuration|LayoutDuration|RecalcStyle|Documents|JSEventListeners/.test(m.name)).reduce((a, m) => (a[m.name] = Math.round(m.value * 1000) / 1000, a), {});
  return { out, page, ctx, cdp };
}
// lấy mẫu rAF + CPU trong ms
async function frames(page, cdp, ms) {
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const m0 = await get();
  const d = await page.evaluate(ms => new Promise(res => { const a = []; let last = performance.now(); const t0 = last; (function f(t) { a.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(a.slice(2)); })(last); }), ms);
  const m1 = await get();
  d.sort((a, b) => a - b); const q = p => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * p))] * 10) / 10;
  const mean = d.reduce((s, x) => s + x, 0) / d.length, per = k => Math.round((m1[k] - m0[k]) / (ms / 1000) * 1000);
  return { frames: d.length, meanMs: Math.round(mean * 10) / 10, fps: Math.round(1000 / mean * 10) / 10, p50: q(0.5), p95: q(0.95), p99: q(0.99), maxMs: Math.round(d[d.length - 1] * 10) / 10,
    over33: d.filter(x => x > 33.4).length, cpuTaskMsPerS: per('TaskDuration'), scriptMsPerS: per('ScriptDuration'), layoutMsPerS: per('LayoutDuration'), styleMsPerS: per('RecalcStyleDuration') };
}
function table(steps) {
  const g = n => steps.find(x => x.name === n), M = {}, kb = v => Math.round(v / 1024);
  const put = (k, v) => { if (v != null && !Number.isNaN(v)) M[k] = v; };
  [['lobby', 'sảnh'], ['merchant', 'merchant'], ['hour-choice', 'hour-choice']].forEach(([n, l]) => {
    const x = g(n); if (!x) return;
    put(l + ' request lúc tương tác', x.atInteractive.n); put(l + ' enc KB lúc tương tác', kb(x.atInteractive.enc)); put(l + ' dec KB lúc tương tác', kb(x.atInteractive.dec));
    put(l + ' enc KB sau nạp ngầm', kb(x.final.enc)); put(l + ' dec KB sau nạp ngầm', kb(x.final.dec));
    put(l + ' FCP ms', x.web.paint && x.web.paint['first-contentful-paint']); put(l + ' tương tác ms', x.tUiMs);
    if (x.idleFrames) { put(l + ' fps', x.idleFrames.fps); put(l + ' CPU ms/s', x.idleFrames.cpuTaskMsPerS); put(l + ' script ms/s', x.idleFrames.scriptMsPerS); }
  });
  const c = g('combat'); if (c && c.combatFrames) { put('trận fps', c.combatFrames.fps); put('trận script ms/s', c.combatFrames.scriptMsPerS); }
  ['lobby@10Mbps/40ms', 'lobby@1.6Mbps/150ms'].forEach(n => { const x = g(n); if (x) { put(n + ' FCP ms', x.web.paint && x.web.paint['first-contentful-paint']); put(n + ' tương tác ms', x.tUiMs); put(n + ' enc KB lúc tương tác', kb(x.atInteractive.enc)); } });
  const m4 = g('merchant@cpu4x'); if (m4) { put('merchant@cpu4x tương tác ms', m4.tUiMs); put('merchant@cpu4x FCP ms', m4.web.paint && m4.web.paint['first-contentful-paint']); }
  return M;
}
(async () => {
  if (!process.env.NOLAZY && !process.env.BZ_URL && !(await lazyCheck())) { console.error('nạp theo nhu cầu KHÁC nạp đủ'); process.exit(1); }
  if (process.env.ONLYLAZY) process.exit(0);
  if (!BASE) { srv = await serve(); BASE = 'http://127.0.0.1:' + srv.address().port; }
  URL_ = BASE + '/games/bazaar/index.html';
  browser = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const res = { url: URL_, when: new Date().toISOString(), viewport: '1280x720', note: 'headless Chromium, cache lạnh; GPU phần mềm nên thời gian khung trên máy thật có GPU thấp hơn' };
  const steps = [];
  let s = await session('lobby', { save: null, ready: '.rs-screen.lobby .lb-ready', after: async (page, cdp, out) => { out.idleFrames = await frames(page, cdp, 3000); } });
  steps.push(s.out); await s.ctx.close();
  if (RUNS.hour) { s = await session('hour-choice', { save: R.serialize(RUNS.hour.run), ready: '.rs-top .rs-enc', after: async (page, cdp, out) => { out.idleFrames = await frames(page, cdp, 3000); } }); steps.push(s.out); await s.ctx.close(); } else res.hourNote = 'không dựng được run hour';
  if (RUNS.merchant) { s = await session('merchant', { save: R.serialize(RUNS.merchant.run), ready: '.rs-cards .bz-card', after: async (page, cdp, out) => { out.idleFrames = await frames(page, cdp, 5000); out.heapAfterIdle = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize); } }); steps.push(s.out); await s.ctx.close(); } else res.merchantNote = 'không dựng được run merchant';
  if (RUNS.fight) {
    s = await session('combat', { save: R.serialize(RUNS.fight.run), ready: '.bz-card', after: async (page, cdp, out, snap) => {
      const b = snap(); await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'fight' })); await sleep(2500);
      const a = snap(); out.afterFightClick = { extraReq: a.n - b.n, extraEnc: a.enc - b.enc };
      out.combatFrames = await frames(page, cdp, 6000);
      out.heapAfterCombat = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize);
    } });
    steps.push(s.out); await s.ctx.close();
  } else res.fightNote = 'không dựng được run fight';
  if (!process.env.NOEXTRA) {
    s = await session('lobby@10Mbps/40ms', { save: null, net: { mbps: 10, lat: 40 }, ready: '.rs-screen.lobby .lb-ready' }); steps.push(s.out); await s.ctx.close();
    s = await session('lobby@1.6Mbps/150ms', { save: null, net: { mbps: 1.6, lat: 150 }, ready: '.rs-screen.lobby .lb-ready' }); steps.push(s.out); await s.ctx.close();
    if (RUNS.merchant) { s = await session('merchant@cpu4x', { save: R.serialize(RUNS.merchant.run), cpu: 4, ready: '.rs-cards .bz-card', after: async (page, cdp, out) => { out.idleFrames = await frames(page, cdp, 4000); } }); steps.push(s.out); await s.ctx.close(); }
    if (RUNS.fight) { s = await session('combat@cpu4x', { save: R.serialize(RUNS.fight.run), cpu: 4, ready: '.bz-card', after: async (page, cdp, out) => { await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'fight' })); await sleep(2500); out.combatFrames = await frames(page, cdp, 6000); } }); steps.push(s.out); await s.ctx.close(); }
  }
  res.steps = steps;
  const M = table(steps);
  if (process.env.BZ_SAVE) fs.writeFileSync(process.env.BZ_SAVE, JSON.stringify({ when: res.when, M, raw: steps.map(x => ({ n: x.name, final: x.final, atInteractive: x.atInteractive, byType: x.byType, err: x.errors })) }, null, 1));
  fs.writeFileSync(path.join(require('os').tmpdir(), 'bazaar-perf.json'), JSON.stringify(res, null, 1));
  const bf = process.env.BZ_BASELINE || path.join(__dirname, 'bazaar-perf.baseline.json'), B = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, 'utf8')).M : null;
  console.log('' + 'chỉ số'.padEnd(44) + 'nền'.padStart(11) + 'nay'.padStart(11) + 'đổi'.padStart(9));
  Object.keys(M).forEach(k => {
    const a = B && B[k], b = M[k], d = a != null && b != null && a ? Math.round((b - a) / a * 100) + '%' : '';
    console.log(k.padEnd(44) + String(a == null ? '-' : a).padStart(11) + String(b == null ? '-' : b).padStart(11) + d.padStart(9));
  });
  const errs = steps.filter(x => x.errors && x.errors.length); if (errs.length) console.log('LỖI TRANG:', JSON.stringify(errs.map(x => [x.name, x.errors])));
  await browser.close(); if (srv) srv.close(); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); try { browser.close(); } catch (x) {} process.exit(1); });
