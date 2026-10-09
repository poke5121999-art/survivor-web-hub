/*
 * DREDGE - kiem don vi U7 infection (js/infection.js), MONSTERS.md 2.7 + 3.3.
 * Chay: node test/dredge-m3infect.js   (anh: %TEMP%/dredge-m3infect hoac SHOTS=...)
 * So goc: InfectionHelper.cs:15-91 (nhip 0,2 ngay, 8 o lan can, 0,15), GridManager.cs:744-752 (doi di bien 0,15), GameConfigDataProd.asset:264-266.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m3infect');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/games/dredge/index.html?fresh=1', { timeout: 60000 });
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await settle(page);
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(500);
  return { page, errors };
}

// đi hết hội thoại ở bến cho tới khi giao diện bến hiện
async function settle(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}



(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);
  console.log('U7 infection');
  check('DRInfection nạp; số gốc 0,2 ngày / 0,15 / 0,15', await ev(() => !!DRInfection && DRInfection.INTERVAL === 0.2 && DRInfection.CHANCE === 0.15 && DRInfection.SWAP === 0.15));

  // bố trí: Cod nhiễm, 1 Anchovy sát bên (láng giềng), 1 Anchovy cách >= 2 ô
  const lay = await ev(() => {
    const G = DRGrid, inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (G.subOf(DR_ITEMS[it.id]) & G.SUB.FISH) G.remove(inv, it);
    DR.s.sanity = 1; DR_DEBUG.setTime(0.5);
    const p = G.findSpot(inv, DR_ITEMS.cod, 0), cod = G.place(inv, DR_ITEMS.cod, p.x, p.y, p.rot);
    const an = DR_ITEMS.anchovy, near = [], far = [];
    for (let y = 0; y < inv.rows; y++) for (let x = 0; x < inv.cols; x++) {
      if (!G.canPlace(inv, an, x, y, 0)) continue;
      const d = Math.min(...cod.cells.map(c => Math.max(Math.abs(c[0] - x), Math.abs(c[1] - y))));
      if (d === 1) near.push([x, y]); else if (d >= 3) far.push([x, y]);
    }
    const n = G.place(inv, an, near[0][0], near[0][1], 0);
    const f = G.place(inv, an, far[far.length - 1][0], far[far.length - 1][1], 0);
    cod.infected = true; cod.fresh = 0;
    window.__cod = cod; window.__n = n; window.__f = f;
    return { cod: cod.cells, n: n.cells, f: f.cells };
  });
  check('bố trí: Cod nhiễm, 1 láng giềng, 1 xa', !!lay && lay.n.length === 1 && lay.f.length === 1, JSON.stringify(lay));

  // nhịp: 0,19 ngày chưa chạy, 0,21 ngày mới chạy
  await ev(() => { DRInfection.rng = () => 0.9; DR.s.lastInfectTime = DR.s.time - 0.19; });
  check('0,19 ngày: chưa có nhịp', (await ev(() => DRInfection.tick())) === null);
  await ev(() => { DR.s.lastInfectTime = DR.s.time - 0.21; });
  const r1 = await ev(() => { const c = DRInfection.tick(); return { c, last: DR.s.lastInfectTime, time: DR.s.time, n: __n.infected === true }; });
  check('0,21 ngày: nhịp chạy, mốc = thời gian hiện tại; rng 0,9 → không ai nhiễm', Array.isArray(r1.c) && r1.c.length === 0 && Math.abs(r1.last - r1.time) < 1e-9 && !r1.n, JSON.stringify(r1));

  // rng: lần tung lây 0,01 (qua), lần đổi dị biến 0,9 (không đổi)
  const r2 = await ev(() => {
    let k = 0; DRInfection.rng = () => (k++ % 2 === 0 ? 0.01 : 0.9); DR.s.lastInfectTime = DR.s.time - 0.21;
    const c = DRInfection.tick();
    return { c, n: __n.infected === true, f: __f.infected === true, nfresh: __n.fresh, still: DR.grid('INVENTORY').items.includes(__n), toast: [...document.querySelectorAll('.hud-toast')].map(e => e.textContent).join('|') };
  });
  check('láng giềng nhiễm (fresh 0), không đổi dị biến (rng 0,9)', r2.n && r2.nfresh === 0 && r2.still, JSON.stringify(r2));
  check('con xa (>= 3 ô) KHÔNG nhiễm', !r2.f);
  check('toast spread-1 (trước 1, sau 2)', /mùi hôi thối bốc lên/i.test(r2.toast), r2.toast);

  // đổi dị biến: rng 0,01 mọi lần → Anchovy thành dị biến của nó, nhiễm, giữ ô, giữ size/fresh
  const r4 = await ev(() => {
    const G = DRGrid, inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (G.subOf(DR_ITEMS[it.id]) & G.SUB.FISH) G.remove(inv, it);
    const p = G.findSpot(inv, DR_ITEMS.cod, 0), cod = G.place(inv, DR_ITEMS.cod, p.x, p.y, p.rot);
    cod.infected = true; cod.fresh = 0;
    const an = DR_ITEMS.anchovy; let n = null;
    for (let y = 0; y < inv.rows && !n; y++) for (let x = 0; x < inv.cols && !n; x++)
      if (G.canPlace(inv, an, x, y, 0) && Math.min(...cod.cells.map(c => Math.max(Math.abs(c[0] - x), Math.abs(c[1] - y)))) === 1) n = G.place(inv, an, x, y, 0, { size: 0.77, fresh: 1.1 });
    const pos = [n.x, n.y];
    DRInfection.rng = () => 0.01; DR.s.lastInfectTime = DR.s.time - 0.21;
    DRInfection.tick();
    const now = G.itemAt(inv, pos[0], pos[1]);
    return { id: now.id, ab: DR_ITEMS.anchovy.aberrations.includes(now.id), inf: now.infected === true, size: now.size, fresh: now.fresh, gone: !inv.items.includes(n), cnt: inv.items.filter(i => G.subOf(DR_ITEMS[i.id]) & G.SUB.FISH).length };
  });
  check('đổi dị biến: Anchovy → ' + r4.id + ' (nhiễm, cùng ô, size 0,77, cá cũ đã gỡ)', r4.ab && r4.inf && r4.size === 0.77 && r4.gone && r4.cnt === 2, JSON.stringify(r4));
  check('dị biến / canBeInfected=false không lây; Cod lây được', await ev(() => { const a = Object.keys(DR_ITEMS).find(k => DR_ITEMS[k].isAberration && DR_ITEMS[k].subtype === 'FISH'); return !DRInfection.canInfect({ id: a }) && !DRInfection.canInfect({ id: 'deep-form-ab-1' }) && DRInfection.canInfect({ id: 'cod' }); }));

  // cá nhiễm không ươn
  const rot = await ev(() => { const inv = DR.grid('INVENTORY'); const r = DRGrid.tickFreshness(DR_CONFIG, inv, DR_ITEMS, 50); return { rotted: r.rotted.length, inf: inv.items.filter(i => i.infected).length }; });
  check('cá nhiễm đứng độ tươi 0, không thành Rot', rot.rotted === 0 && rot.inf >= 1, JSON.stringify(rot));

  // lưới Storage cũng lây
  const r5 = await ev(() => {
    const G = DRGrid; if (!DR.s.grids.STORAGE) return null;
    const st = DR.grid('STORAGE');
    const p = G.findSpot(st, DR_ITEMS.cod, 0), cod = G.place(st, DR_ITEMS.cod, p.x, p.y, p.rot);
    cod.infected = true; cod.fresh = 0;
    let n = null; const an = DR_ITEMS.anchovy;
    for (let y = 0; y < st.rows && !n; y++) for (let x = 0; x < st.cols && !n; x++)
      if (G.canPlace(st, an, x, y, 0) && Math.min(...cod.cells.map(c => Math.max(Math.abs(c[0] - x), Math.abs(c[1] - y)))) === 1) n = G.place(st, an, x, y, 0);
    let k = 0; DRInfection.rng = () => (k++ % 2 === 0 ? 0.01 : 0.9); DR.s.lastInfectTime = DR.s.time - 0.21;
    DRInfection.tick();
    return n.infected === true;
  });
  check('lưới STORAGE cũng lây', r5 === true, String(r5));
  check('DR.s.lastInfectTime là số và đi theo sổ lưu', await ev(() => typeof DR.s.lastInfectTime === 'number' && JSON.parse(JSON.stringify(DR.s)).lastInfectTime === DR.s.lastInfectTime));

  // rng thật: tỉ lệ ≈ 0,15 mỗi cặp liền kề (Anchovy 1x1 nhiễm cạnh Anchovy 1x1: 1 ô lân cận)
  const rate = await ev(() => {
    DRInfection.rng = Math.random;
    const G = DRGrid, inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (G.subOf(DR_ITEMS[it.id]) & G.SUB.FISH) G.remove(inv, it);
    let hit = 0; const N = 3000;
    for (let i = 0; i < N; i++) {
      const a = G.place(inv, DR_ITEMS.anchovy, 1, 1, 0), b = G.place(inv, DR_ITEMS.anchovy, 2, 1, 0);
      if (!a || !b) return null;
      a.infected = true;
      DRInfection.spread('INVENTORY', false);
      if (b.infected) hit++;
      G.remove(inv, a); G.remove(inv, b);
    }
    return hit / N;
  });
  check('tỉ lệ lây thật ≈ 0,15 (đo ' + rate + ')', rate != null && rate > 0.13 && rate < 0.17);

  // vòng lặp tự chạy thật (không gọi tick tay): nhịp tới mà rng 0,01 thì láng giềng nhiễm trong vài khung
  const live = await ev(async () => {
    const G = DRGrid, inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (G.subOf(DR_ITEMS[it.id]) & G.SUB.FISH) G.remove(inv, it);
    const a = G.place(inv, DR_ITEMS.anchovy, 1, 1, 0), b = G.place(inv, DR_ITEMS.anchovy, 2, 1, 0);
    a.infected = true;
    let k = 0; DRInfection.rng = () => (k++ % 2 === 0 ? 0.01 : 0.9);
    DR.s.lastInfectTime = DR.s.time - 0.25;
    await new Promise(r => setTimeout(r, 400));
    return b.infected === true;
  });
  check('vòng lặp rAF tự chạy nhịp lây', live === true);

  // ảnh: hộp hàng mở, cá nhiễm hiện hạt
  await ev(() => {
    DRInfection.rng = Math.random;
    const G = DRGrid, inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (G.subOf(DR_ITEMS[it.id]) & G.SUB.FISH) G.remove(inv, it);
    for (const id of ['cod', 'cod', 'mackerel', 'anchovy', 'anchovy', 'squid']) { const p = DR_ITEMS[id] && G.findSpot(inv, DR_ITEMS[id], 0); if (p) G.place(inv, DR_ITEMS[id], p.x, p.y, p.rot, { size: 1, fresh: 1.5 }); }
    const fish = inv.items.filter(i => G.subOf(DR_ITEMS[i.id]) & G.SUB.FISH);
    fish[0].infected = true; fish[0].fresh = 0;
    DRInfection.infectItem(fish[2], 'INVENTORY', false);
    DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' });
  });
  await sleep(2500);
  await page.screenshot({ path: path.join(SHOTS, 'infection-1280.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(1500);
  await page.screenshot({ path: path.join(SHOTS, 'infection-844.png') });
  check('hạt nhiễm vẽ trong hộp hàng (canvas .cg-inf >= 2)', (await ev(() => document.querySelectorAll('canvas.cg-inf').length)) >= 2);
  await page.setViewportSize({ width: 1280, height: 720 });
  check('không có lỗi trang / console / HTTP >= 400', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' ; '));
  await browser.close(); srv.close();
  console.log('m3infect: ' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
