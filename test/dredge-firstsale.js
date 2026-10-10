/*
 * DREDGE — lần bán cá đầu tiên theo đúng luồng gốc: ván mới chưa có Người buôn cá; về bến tay không thì vẫn chưa có;
 * mang cá về thì Mayor_Intro_1_Fish chạy <<SetDestinationAvailable destination.gm-fishmonger true>> và bán được ngay.
 * Sổ lưu cũ đã qua Mayor_Intro_1_Fish mà thiếu Người buôn cá thì nạp xong được mở lại (js/yarn.js healDestinations, như SaveData.cs:819).
 * Chạy: node test/dredge-firstsale.js   (DR_URL=... để chạy trên Pages)
 */
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else fail++; console.log((c ? '  ✔ ' : '  ✘ ') + name); };
const FM = 'destination.gm-fishmonger';
(async () => {
  const srv = process.env.DR_URL ? null : await serve();
  const base = process.env.DR_URL || 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a);
  const talk = async () => { for (let i = 0; i < 200; i++) {
    const st = await ev(() => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (!st) break;
    if (st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {}); else await page.keyboard.press('Space');
    await sleep(300);
  } };
  const dests = () => ev(() => DRDock._debug().dests);
  await page.goto(base + '/games/dredge/index.html?fresh=1', { timeout: 60000 });
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await sleep(3000); await talk(); await sleep(1500);
  ok(!(await dests()).includes(FM), 'ván mới, sau Mayor_Intro_0: chưa có Người buôn cá');
  await page.keyboard.press('Space'); await sleep(2500);
  await ev(() => DRDocks.dockAt('dock.greater-marrow', 0)); await sleep(3000); await talk(); await sleep(1000);
  ok(!(await dests()).includes(FM), 'về bến tay không: vẫn chưa có');
  await page.keyboard.press('Space'); await sleep(2500);
  await ev(() => DR_DEBUG.give('cod', { size: 0.5, fresh: 3 }));
  await ev(() => DRDocks.dockAt('dock.greater-marrow', 0)); await sleep(3000); await talk(); await sleep(1500);
  ok(await ev(() => DR.s.visitedNodes.includes('Mayor_Intro_1_Fish')), 'mang cá về: Mayor_Intro_1_Fish chạy');
  ok((await dests()).includes(FM), 'mang cá về: nút Người buôn cá hiện ở bến');
  const fundsBefore = await ev(() => DR.s.funds);
  await page.click('.dk-dest[data-dest="' + FM + '"]').catch(() => page.dispatchEvent('.dk-dest[data-dest="' + FM + '"]', 'click'));
  for (let i = 0; i < 60 && !(await ev(() => DRShop.isOpen() && DRCargo.isOpen())); i++) { await talk(); await sleep(300); }
  ok(await ev(() => DRShop.isOpen()), 'bấm Người buôn cá: cửa hàng mở');
  const cell = await ev(() => { const dk = DRCargo._debug(), gr = dk.grids.find(g => g.key === 'INVENTORY'), it = DR.grid('INVENTORY').items.find(i => i.id === 'cod');
    return it && { x: gr.x + (it.x + 0.5) * dk.cs, y: gr.y + (it.y + 0.5) * dk.cs }; });
  if (cell) { await page.mouse.move(cell.x, cell.y); await sleep(200); await page.keyboard.down('KeyF'); await sleep(750); await page.keyboard.up('KeyF'); await sleep(500); }
  const after = await ev(() => ({ funds: DR.s.funds, cod: DR.grid('INVENTORY').items.some(i => i.id === 'cod') }));
  ok(!after.cod && after.funds > fundsBefore, 'giữ F trên con cá: bán được, tiền ' + fundsBefore + ' → ' + after.funds);
  // sổ lưu cũ: đã qua Mayor_Intro_1_Fish mà thiếu Người buôn cá
  await ev(FM => { const L = DR.s.availableDestinations; L.splice(L.indexOf(FM), 1); DR.emit('load'); }, FM);
  ok(await ev(FM => DR.s.availableDestinations.includes(FM), FM), 'sổ lưu cũ thiếu Người buôn cá: nạp xong được mở lại');
  ok(errs.length === 0, 'không có pageerror ' + errs.slice(0, 2).join(' | '));
  await browser.close(); if (srv) srv.close();
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
