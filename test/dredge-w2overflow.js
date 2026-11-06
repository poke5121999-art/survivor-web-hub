/*
 * w2overflow (WORLD-GAPS.md §6 W2): kho tràn. Nâng thân với khoang + kho đầy -> đồ thừa vào DR.s.grids.OVERFLOW_STORAGE;
 * mở ở bến phao (chỉ hiện khi còn món), chuyển một món sang khoang bằng chuột; không cất ngược vào được; còn qua lưu/nạp.
 * Chạy: node test/dredge-w2overflow.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-w2overflow)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w2overflow');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const ev = (page, f, a) => page.evaluate(f, a);

async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await br.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);

  // 1. lưới có sẵn từ ván mới, rỗng, đúng cấu hình gốc (OverflowStorage.asset: 9 x 11)
  const g0 = await ev(page, () => { const g = DR.grid('OVERFLOW_STORAGE'); return g && { cfg: DR.s.grids.OVERFLOW_STORAGE.cfg, cols: g.cols, rows: g.rows, n: g.items.length }; });
  ok(g0 && g0.cfg === 'OverflowStorage' && g0.cols === 9 && g0.rows === 11 && g0.n === 0, 'ván mới: OVERFLOW_STORAGE 9x11 rỗng ' + JSON.stringify(g0));

  // 2. kho tràn rỗng: điểm đến không hiện ở bến phao
  await ev(page, () => { DRDock.show({ dockId: 'dock.pontoon-gc' }); });
  await dockReady(page);
  let dests = await ev(page, () => DRDock._debug().dests);
  ok(Array.isArray(dests) && !dests.includes('destination.overflow-storage'), 'kho tràn rỗng: không hiện điểm đến ' + JSON.stringify(dests));

  // 3. nâng thân với khoang (bậc 3) và kho đầy -> đồ thừa vào kho tràn
  const prep = await ev(page, () => {
    const G = DRGrid, ids = Object.keys(DR_ITEMS).filter(k => { const d = DR_ITEMS[k]; return G.subOf(d) === G.SUB.FISH && d.dims.length <= 2; });
    const fill = (key, cfg) => {
      if (cfg) DR.resetGrid(key, cfg, []);
      const g = DR.grid(key); let n = 0;
      for (let k = 0; k < 400; k++) { const def = DR_ITEMS[ids[k % ids.length]]; const s = G.findSpot(g, def, 0, false); if (!s) continue; G.place(g, def, s.x, s.y, s.rot); n++; }
      return n;
    };
    const cfg3 = DR_CONFIG.hullTierGridConfigs[2];
    const inv = fill('INVENTORY', cfg3), sto = fill('STORAGE', 'Storage');
    return { inv, sto, cfg3 };
  });
  const up = await ev(page, () => { const r = DRUpgrade.applyUpgrade('tier-2-hull'); return { overflow: r.overflow.length, sold: r.sold.length, moved: r.moved.length, n: DR.grid('OVERFLOW_STORAGE').items.length, tier: DR.s.hullTier }; });
  ok(prep.inv > 0 && prep.sto > 0, 'đã nhồi khoang và kho ' + JSON.stringify(prep));
  ok(up.overflow > 0 && up.n === up.overflow, 'nâng thân: đồ thừa vào DR.s.grids.OVERFLOW_STORAGE ' + JSON.stringify(up));
  const nOver = up.n;

  // 4. bến phao: điểm đến hiện khi còn món; mở bằng DRDock.visit
  await ev(page, () => { DRDock.show({ dockId: 'dock.pontoon-gc' }); });
  await dockReady(page);
  await sleep(1500);
  dests = await ev(page, () => DRDock._debug().dests);
  ok(dests.includes('destination.overflow-storage'), 'còn món: điểm đến kho tràn hiện ở bến phao ' + JSON.stringify(dests));
  await page.screenshot({ path: path.join(OUT, '1-dock-1280.png') });
  await ev(page, () => DRDock.visit('destination.overflow-storage'));
  await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 8000 });
  await sleep(1500);
  let d = await ev(page, () => DRCargo._debug());
  ok(d.grids.some(g => g.key === 'OVERFLOW_STORAGE' && g.cols === 9 && g.rows === 11 && g.items.length === nOver), 'cửa sổ kho tràn mở với đúng các món ' + JSON.stringify(d.grids.map(g => [g.key, g.items.length])));
  ok(d.grids.some(g => g.key === 'INVENTORY'), 'khoang hiện cùng kho tràn');
  await page.screenshot({ path: path.join(OUT, '2-overflow-1280.png') });

  // 5. chuyển một món sang khoang bằng chuột giữa trên món (QuickMove): bỏ bớt một món khoang để có chỗ
  await ev(page, () => { const g = DR.grid('INVENTORY'); for (let k = 0; k < 4; k++) DRGrid.remove(g, g.items[g.items.length - 1]); DRCargo.refresh(); });
  d = await ev(page, () => DRCargo._debug());
  const og = d.grids.find(g => g.key === 'OVERFLOW_STORAGE'), cs = og.w / og.cols, it = og.items[0];
  await page.mouse.move(og.x + (it.x + 0.5) * cs, og.y + (it.y + 0.5) * cs);
  await sleep(500);
  d = await ev(page, () => DRCargo._debug());
  ok(d.hover && d.hover.key === 'OVERFLOW_STORAGE', 'rê chuột vào món trong kho tràn ' + JSON.stringify(d.hover));
  ok(d.prompts.some(p => p.id === 'to-cargo' && p.bind === 'mmb'), 'có gợi ý "Về khoang" ' + JSON.stringify(d.prompts.map(p => p.id)));
  const invBefore = await ev(page, () => DR.grid('INVENTORY').items.length);
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
  await sleep(400);
  const after = await ev(page, () => ({ o: DR.grid('OVERFLOW_STORAGE').items.length, i: DR.grid('INVENTORY').items.length }));
  ok(after.o === nOver - 1 && after.i === invBefore + 1, 'một món sang khoang: kho tràn ' + nOver + '->' + after.o + ', khoang ' + invBefore + '->' + after.i);

  // 6. chỉ lấy ra: nhặt món từ khoang rồi đặt vào ô trống của kho tràn bị từ chối
  d = await ev(page, () => DRCargo._debug());
  const inv = d.grids.find(g => g.key === 'INVENTORY'), og2 = d.grids.find(g => g.key === 'OVERFLOW_STORAGE'), c2 = inv.w / inv.cols;
  const first = inv.items[0];
  await page.mouse.click(inv.x + (first.x + 0.5) * c2, inv.y + (first.y + 0.5) * c2);
  await sleep(400);
  ok(!!(await ev(page, () => DRCargo.held())), 'nhặt được một món từ khoang');
  const oc = og2.w / og2.cols;
  await page.mouse.move(og2.x + 8.5 * oc, og2.y + 10.5 * oc, { steps: 4 });
  await page.mouse.click(og2.x + 8.5 * oc, og2.y + 10.5 * oc);
  await sleep(400);
  const put = await ev(page, () => ({ held: !!DRCargo.held(), o: DR.grid('OVERFLOW_STORAGE').items.length }));
  ok(put.held && put.o === nOver - 1, 'đặt vào kho tràn bị từ chối (chỉ lấy ra) ' + JSON.stringify(put));
  await page.keyboard.press('Escape'); await sleep(300);          // trả món về chỗ cũ
  ok(!(await ev(page, () => !!DRCargo.held())), 'Esc trả món về chỗ cũ, tay trống');

  // 7. qua lưu / nạp, kho tràn còn nguyên
  await ev(page, () => DR.save());
  const saved = await ev(page, () => JSON.parse(localStorage.getItem(DR.saveKey())).grids.OVERFLOW_STORAGE.items.length);
  ok(saved === nOver - 1, 'lưu ván: kho tràn còn ' + saved);
  await ev(page, () => { DR.load(); });
  const loaded = await ev(page, () => DR.grid('OVERFLOW_STORAGE').items.length);
  ok(loaded === nOver - 1, 'nạp ván: kho tràn còn ' + loaded);

  // 8. 844x390
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '3-overflow-844.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(600);

  ok(errors.length === 0, 'không lỗi trang: ' + errors.join(' | '));
  console.log('w2overflow: ' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + OUT + ')');
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
