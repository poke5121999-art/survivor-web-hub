/*
 * DREDGE - kiem don vi U5 ravens (js/ravens.js, tools/ravens.py, data/ravens.js), MONSTERS.md 2.6 + 3.3.
 * Chay: node test/dredge-m2ravens.js   (anh: %TEMP%/dredge-m2ravens hoac SHOTS=...)
 * So goc: RavenWorldEvent.cs:41-89 (ravenAttackDelay 6, numAttacksToMake 3, stealableFishSizeThreshold 3, finishDelaySec 5), RavenAttack.anim (events 1,4167 / 1,5333 s),
 * Ravens.prefab. Moc cuop: 6 + 1,5333 = 7,533 s, 13,533 s; con di bi gac: 19,533 s.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m2ravens');
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
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);
  console.log('U5 ravens');
  check('DRRavens nạp và đăng ký Ravens', await ev(() => !!DRRavens && !!DR_RAVENS && DREvents.debug.test('Ravens') !== undefined));
  const D = await ev(() => DR_RAVENS);
  check('dữ liệu gốc: attackDelay 6, 3 lần, ngưỡng 3 ô, finishDelay 5', D.cfg.attackDelay === 6 && D.cfg.numAttacks === 3 && D.cfg.stealSize === 3 && D.cfg.finishDelay === 5, JSON.stringify(D.cfg));
  check('sự kiện clip: 1,4167 Begin, 1,5333 Complete', D.clip.events.length === 2 && near(D.clip.events[0].t, 1.41667, 1e-4) && near(D.clip.events[1].t, 1.53333, 1e-4) && D.clip.events[1].fn === 'OnRavenAttackComplete');

  // một điểm nước thoáng gần bến để thuyền đứng giữa nước
  await ev(() => { DR.s.worldPhase = 0; DR.s.sanity = 0.4; DR_DEBUG.setTime(0.5); });
  const water = await ev(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 60; r < 200; r += 10) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 25) { DR_DEBUG.teleport(x, z, 0); return { x, z }; }
    }
    return null;
  });
  check('tìm được nước thoáng', !!water, JSON.stringify(water));
  await sleep(500);
  const setup = async () => ev(() => {
    const inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (DRGrid.subOf(DR_ITEMS[it.id]) & DRGrid.SUB.FISH) DRGrid.remove(inv, it);
    const ab = Object.keys(DR_ITEMS).find(k => DR_ITEMS[k].subtype === 'FISH' && DR_ITEMS[k].isAberration && DR_ITEMS[k].dims.length <= 3);
    DR.give(ab); DR.give('cod'); DR.give('cod');
    DR.s.eventHistory = {}; DR.s.sanity = 0.4; DR_DEBUG.setTime(0.5);
    const cnt = id => inv.items.filter(i => i.id === id).length;
    window.__ab = ab; window.__cnt = cnt;
    return { ab, cod: cnt('cod'), abN: cnt(ab), fish: inv.items.filter(i => DRGrid.subOf(DR_ITEMS[i.id]) & DRGrid.SUB.FISH).length };
  });
  const s0 = await setup();
  check('khoang: 2 Cod + 1 dị biến (' + s0.ab + ')', s0.cod === 2 && s0.abN === 1 && s0.fish === 3, JSON.stringify(s0));
  check('Ravens thành ứng viên (cá ≤ 3 ô)', (await ev(() => DREvents.debug.test('Ravens'))).ok);

  // ---------------------------------------------------------------- lần 1: mốc 7,533 / 13,533; lần 3 (19,533) chỉ còn dị biến nên kết thúc
  await ev(() => {
    window.__rec = [];
    clearInterval(window.__iv);
    window.__iv = setInterval(() => {
      const s = DRRavens.debug.state();
      window.__rec.push({ t: s ? s.t : null, cod: __cnt('cod'), ab: __cnt(__ab), toast: [...document.querySelectorAll('.hud-toast')].map(e => e.textContent).join('|'), fin: s ? s.finishRequested : null, alive: DRRavens.debug.alive, ev: DREvents.current ? DREvents.current.name : null });
    }, 40);
    DREvents.debug.force('Ravens');
  });
  await page.waitForFunction(() => { const s = DRRavens.debug.state(); return s && s.clipT >= 1.35 && s.attacks === 1; }, null, { timeout: 30000, polling: 30 });
  await page.screenshot({ path: path.join(SHOTS, 'ravens-1280.png') });
  await page.waitForFunction(() => !DRRavens.debug.alive, null, { timeout: 40000, polling: 200 });
  await sleep(300);
  const rec = await ev(() => { clearInterval(window.__iv); return window.__rec; });
  const first = pred => rec.find(r => r.t != null && pred(r));
  const r1 = first(r => r.cod === 1), r0 = first(r => r.cod === 0);
  check('Cod −1 ở ~7,53 s (đo ' + (r1 && r1.t.toFixed(2)) + ')', r1 && r1.t >= 7.45 && r1.t <= 7.75);
  check('Cod −1 nữa ở ~13,53 s (đo ' + (r0 && r0.t.toFixed(2)) + ')', r0 && r0.t >= 13.45 && r0.t <= 13.75);
  check('trước 7,4 s đủ 2 Cod; giữa hai lần còn đúng 1', rec.filter(r => r.t != null && r.t < 7.4).every(r => r.cod === 2) && rec.filter(r => r.t > 7.8 && r.t < 13.4).every(r => r.cod === 1));
  check('dị biến giữ nguyên suốt', rec.every(r => r.ab === 1));
  check('toast chứa "lost to the birds"', rec.some(r => /lost to the birds/.test(r.toast)), (rec.find(r => r.toast) || {}).toast);
  const fin = first(r => r.fin === true);
  check('đợt 3 (t ≥ 18 s) yêu cầu kết thúc (numAttacksToMake 3)', fin && fin.t >= 17.9 && fin.t <= 19.7, fin && fin.t.toFixed(2));
  const gone = rec.filter(r => r.t != null).slice(-1)[0];
  check('sự kiện tự huỷ sau finishDelay 5 s (t cuối ' + gone.t.toFixed(1) + ' ≥ 23)', gone.t >= 22.9, JSON.stringify(gone));
  check('currentEvent về null và lịch sử Ravens được ghi', (await ev(() => DREvents.current)) === null && (await ev(() => 'Ravens' in DREvents.debug.history())));

  // ---------------------------------------------------------------- lần 2: giữ còi 1,5 s
  await setup();
  await ev(() => { DREvents.debug.force('Ravens'); DRAbilities.select('foghorn'); });
  await sleep(1500);
  await page.mouse.move(640, 300);
  await page.mouse.down({ button: 'right' });
  await sleep(1000);
  const h1 = await ev(() => DRRavens.debug.state().finishRequested);
  await sleep(900);
  const h2 = await ev(() => DRRavens.debug.state().finishRequested);
  await page.mouse.up({ button: 'right' });
  check('giữ còi 1,0 s: chưa kết thúc; 1,9 s: đã yêu cầu kết thúc', h1 === false && h2 === true, h1 + ' ' + h2);
  const hold = await ev(() => DRRavens.debug.state());
  await sleep(6500);
  check('sau finishDelay 5 s sự kiện huỷ, không cướp thêm (đủ 2 Cod)', !(await ev(() => DRRavens.debug.alive)) && (await ev(() => __cnt('cod'))) === 2 && hold.stolen.length === 0, JSON.stringify(hold));

  // ---------------------------------------------------------------- lần 3: Xua đuổi; ảnh 844x390
  await setup();
  await page.setViewportSize({ width: 844, height: 390 });
  await ev(() => DREvents.debug.force('Ravens'));
  await page.waitForFunction(() => { const s = DRRavens.debug.state(); return s && s.clipT >= 1.35 && s.attacks === 1; }, null, { timeout: 30000, polling: 30 });
  await page.screenshot({ path: path.join(SHOTS, 'ravens-844.png') });
  await ev(() => { DR.emit('banish', true); });
  await sleep(300);
  check('Banish: yêu cầu kết thúc ngay', await ev(() => DRRavens.debug.state().finishRequested));
  await ev(() => { DR.emit('banish', false); });
  await sleep(6000);
  check('Banish: huỷ xong, đã cướp đúng 1 con (đợt 1 trúng ở 1,53 s)', !(await ev(() => DRRavens.debug.alive)) && (await ev(() => __cnt('cod'))) === 1);
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------------------------------------------------------------- lỗi
  check('không có lỗi trang / console / HTTP ≥ 400', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' ; '));
  await browser.close(); srv.close();
  console.log('m2ravens: ' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
