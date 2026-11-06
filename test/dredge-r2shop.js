/*
 * DREDGE — Biển Mù: kiểm chợ / xưởng tàu dạng HAI LƯỚI (js/shop.js trên mối nối js/cargo.js) bằng chuột / phím thật của Playwright.
 *   ván mới → bến Greater Marrow → bấm "Thợ đóng tàu" → hội thoại (Space / bấm lựa chọn) → bảng hàng bên trái + khoang bên phải
 *   → vị trí bảng, tiêu đề, thứ tự tab → rê món: "Mua [$giá]" trắng / đỏ khi thiếu tiền → bấm mua: tiền trừ đúng giá, món dính con trỏ
 *   → đặt vào khoang (giữ 0,6 s "Lắp [2h]") → bán lại (giữ F 0,75 s) được nửa giá, món về lưới hàng → mua lại rồi F hoàn tiền
 *   → cá trong khoang không có prompt Bán ở xưởng tàu → T vào chế độ sửa, bấm ô hỏng "Sửa [$30.00]", giữ R "Sửa tất cả"
 *   → Người buôn cá: F bán một con cá (trừ 15% nợ), tab bẫy cua mở sau node CaughtToOrder_Step3_Details, giữ F "Bán hết cá".
 * Chạy:  node test/dredge-r2shop.js            (tự dựng máy chủ tĩnh ở gốc repo; cỡ 1920x1080 rồi 844x390)
 *        ONLY=full|phone                       chỉ chạy một cỡ
 * Ảnh ra %TEMP%/dredge-r2shop/ ; ghép cạnh ảnh thật bằng D:\dredge-ref\notes\sbs.py: sbs-shipwright.png (gog_30), sbs-market.png (gog_18).
 *
 * Số kỳ vọng tính TAY từ bản gốc, không lấy từ js/shop.js:
 *   ShipyardSlidePanel 650x800 neo trái giữa (y 0) → trên 140. TitleContainer cao 60 pivot y 0 thụt 50 → (50, 80, 550, 60).
 *   TopBar 50, Tabs thụt 50 → (50, 140, 550, 50). Panels: TabbedPanelContainer (-2,2) size -4 → 646x796 trên 140;
 *   Panels pos y -25 size -50 → trên 190, cao 746; ShopGrid pos (-11,-19) size (-22,-82) → 624x664, trái 0, trên 190 + 41 + 19 = 250;
 *   lưới 8x9 ô 60 giữa vùng → trái (624-480)/2 = 72, trên 250 + (664-540)/2 = 312.
 *   RepairAllButton 350x50 neo trên giữa của Container (y -5) → (148, 195, 350, 50).
 *   Giá: ItemManager.GetItemValue BUY = value x (2 - bartering 1): rod18 75, rod2 150; SELL ở gm-shipwright x sellValueModifier 0,5 → rod18 37,50.
 *   Cá mackerel value 10, cỡ 0,5 → lerp(0,75; 1,25) = 1, tươi 3 → x1 → 10,00; ở gm-fishmonger trừ nợ 15% → +8,50, trả nợ 1,50.
 *   Sửa: hullRepairCostPerSquare 30; potRepairCostPerDay 5 (bẫy cua thiếu 2 ngày → 10).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r2shop');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const SBS = process.env.DR_SBS || 'D:/dredge-ref/notes/sbs.py';
const REAL = 'D:/dredge-ref/shots-real/';
const ONLY = process.env.ONLY || '';
const SW = 'destination.gm-shipwright', FM = 'destination.gm-fishmonger';
const NEG = 'rgb(220, 44, 56)', POS = 'rgb(116, 210, 122)';                   // GameConfigData.colors: NEGATIVE #dc2c38, POSITIVE #74d27a

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const eq = (name, got, want) => check(name, same(got, want), 'được ' + JSON.stringify(got) + (same(got, want) ? '' : ', cần ' + JSON.stringify(want)));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r1 = v => Math.round(v * 10) / 10;
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
function watch(page) {
  const errors = [];
  page.on('pageerror', e => { if (process.env.DBG) console.log(e.stack); errors.push('pageerror: ' + e.message); });
  page.on('console', m => { if (process.env.DBG) console.log('[console]', m.type(), m.text()); if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// Bước chuẩn bị (không phải phần đang kiểm): ván mới, mở sẵn điểm đến, bỏ màn mở đầu, đi hết hội thoại của bến.
async function toDock(page, base, funds) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.evaluate(() => { window.__ev = []; for (const n of ['passTime', 'itemPurchased', 'itemSold', 'itemsRepaired']) DR.on(n, (a, b) => window.__ev.push([n, a, b])); });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(([f, d]) => { DR.s.availableDestinations.push(...d); DR.s.funds = f; }, [funds, [SW, FM]]);
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
}
// bến sẵn sàng: phase 'ui' và không còn hội thoại sống (xem ghi chú trong test/dredge-upgrade.js về DRDialogue.isOpen() kẹt)
async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 30000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
// bấm nút điểm đến rồi đi hết hội thoại (Space, lựa chọn đầu) tới khi bảng hàng / khoang hiện
async function openDest(page, id) {
  const sel = '.dk-dest[data-dest="' + id + '"]';
  try { await page.click(sel, { timeout: 3000 }); } catch (e) { await page.dispatchEvent(sel, 'click'); }   // điện thoại: .dk-boat có thể đè nút
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => DRShop.isOpen() && DRCargo.isOpen())) break;
    const st = await page.evaluate(() => { const s = window.DRDialogue && DRDialogue.isOpen() && DRDialogue.state(); return s ? s.kind : null; });
    if (st === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(350);
  }
  if (!(await page.evaluate(() => DRShop.isOpen()))) throw new Error('shop never opened: ' + id);
  await sleep(900);                                                     // SlidePanel trượt vào 0,5 s
}

async function run(browser, base, W, H, full) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !full });
  const page = await ctx.newPage();
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const ev = (f, a) => page.evaluate(f, a);
  const k = H / 1080;
  const tol = 2 * k + 0.6;
  const rect = sel => ev(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
  const funds = () => ev(() => DR.s.funds);
  const dbg = () => ev(() => DRCargo._debug());
  // tâm ô (x, y) của lưới key trên màn
  const cellXY = (key, x, y, w, h) => ev(([key, x, y, w, h]) => {
    const g = document.querySelector('.cg-grid[data-key="' + key + '"]'), r = g.getBoundingClientRect(), cs = DRCargo._debug().cs;
    return { x: r.left + (x + (w || 1) / 2) * cs, y: r.top + (y + (h || 1) / 2) * cs };
  }, [key, x, y, w, h]);
  const moveTo = async p => { await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250); };
  const itemOf = (key, id) => ev(([key, id]) => { const g = DR.grid(key); const i = g && g.items.find(i => i.id === id); return i ? { x: i.x, y: i.y, rot: i.rot, cells: i.cells } : null; }, [key, id]);
  const hoverItem = async (key, id) => { const it = await itemOf(key, id); const c = it.cells[0]; await moveTo(await cellXY(key, c[0], c[1])); return it; };
  const prompt = id => ev(id => (DRCargo._debug().prompts || []).find(p => p.id === id) || null, id);
  const chipColor = id => ev(id => { const c = document.querySelector('.cg-tip.on .pr[data-act="' + id + '"] .price'); return c ? getComputedStyle(c).color : null; }, id);

  // ===== xưởng tàu =====
  await toDock(page, base, 120);
  await openDest(page, SW);
  const cd = await dbg();
  check('Thợ đóng tàu mở bảng hàng (bên trái, kiểu shop) + khoang (bên phải), không còn bảng danh sách', cd.leftKind === 'shop' && cd.rightTab === 'INVENTORY' && !(await ev(() => !!document.querySelector('#dr-dock.on .dk-row'))));
  if (full) {
    const P = await rect('.cg-left'), want = [0, 140 * k, 650 * k, 800 * k];
    check('ShipyardSlidePanel 650x800 neo trái giữa → (0, 140)', P && P.every((v, i) => near(v, want[i], tol)), 'được ' + (P || []).map(r1) + ' cần ' + want.map(r1));
    const T = await rect('.cg-left .cg-title'), wt = [50 * k, 80 * k, 550 * k, 60 * k];
    check('TitleContainer 550x60 nằm trên mép bảng → (50, 80)', T && T.every((v, i) => near(v, wt[i], tol)), 'được ' + (T || []).map(r1) + ' cần ' + wt.map(r1));
    const TB = await rect('.cg-left .cg-ltabs'), wtb = [50 * k, 140 * k, 550 * k, 50 * k];
    check('thanh tab 550x50 ở đỉnh bảng → (50, 140)', TB && TB.every((v, i) => near(v, wtb[i], tol)), 'được ' + (TB || []).map(r1) + ' cần ' + wtb.map(r1));
    const SG = await rect('.cg-grid[data-key="Shop_SHIPWRIGHT_RODS"]'), wg = [72 * k, 312 * k, 480 * k, 540 * k];
    check('lưới hàng 8x9 ô 60 giữa vùng ShopGrid → (72, 312, 480, 540)', SG && SG.every((v, i) => near(v, wg[i], tol)), 'được ' + (SG || []).map(r1) + ' cần ' + wg.map(r1));
    const RB = await rect('.cg-left .cg-foot .cg-btn'), wr = [148 * k, 195 * k, 350 * k, 50 * k];
    check('nút Sửa tất cả 350x50 → (148, 195)', RB && RB.every((v, i) => near(v, wr[i], tol)), 'được ' + (RB || []).map(r1) + ' cần ' + wr.map(r1));
  }
  const tabs = await ev(() => [...document.querySelectorAll('.cg-left .cg-ltabs .cg-tab')].map(t => ({ key: t.dataset.tab, ic: (t.querySelector('img') || {}).src || '' })));
  eq('tab hình theo thứ tự gốc: Cần câu, Động cơ, Lưới kéo, Đèn (marketTabs 21, 22, 23, 24)', tabs.map(t => t.key), ['Shop_SHIPWRIGHT_RODS', 'Shop_SHIPWRIGHT_ENGINES', 'Shop_SHIPWRIGHT_NETS', 'Shop_SHIPWRIGHT_LIGHTS']);
  eq('icon tab: RodIcon, EngineIcon, TrawlIcon, LightIcon', tabs.map(t => (t.ic.match(/(RodIcon|EngineIcon|TrawlIcon|LightIcon)/) || [])[1]), ['RodIcon', 'EngineIcon', 'TrawlIcon', 'LightIcon']);
  eq('tiêu đề tab đầu', await ev(() => document.querySelector('.cg-left .cg-title').textContent), 'Thợ đóng tàu - Cần câu');
  const stock = await ev(() => DR.grid('Shop_SHIPWRIGHT_RODS').items.map(i => i.id).sort());
  eq('hàng cần câu sau lần nhập đầu (Shipwright_Rods.alwaysInStock)', stock, ['rod18', 'rod2']);
  await shot('1-shipwright');

  // --- rê món: giá đỏ khi thiếu tiền, trắng khi đủ
  await hoverItem('Shop_SHIPWRIGHT_RODS', 'rod2');
  const pRod2 = await prompt('buy');
  check('rê "Weighted Line" ($150 > $120): prompt "Mua [$150.00]" bị khoá', !!pRod2 && pRod2.label === 'Mua [$150.00]' && pRod2.enabled === false, JSON.stringify(pRod2));
  eq('giá $150.00 tô NEGATIVE', await chipColor('buy'), NEG);
  if (full) await shot('2-hover-short');
  await hoverItem('Shop_SHIPWRIGHT_RODS', 'rod18');
  const pRod18 = await prompt('buy');
  check('rê "Simple Skimmer": "Mua [$75.00]" bật', !!pRod18 && pRod18.label === 'Mua [$75.00]' && pRod18.enabled, JSON.stringify(pRod18));
  eq('giá $75.00 màu NEUTRAL (trắng)', await chipColor('buy'), 'rgb(255, 255, 255)');
  // --- bấm mua: tiền trừ, món dính con trỏ
  await page.mouse.down(); await page.mouse.up(); await sleep(300);
  const afterBuy = await dbg();
  eq('mua: tiền 120 → 45', await funds(), 45);
  check('món vừa mua dính con trỏ (JUST_PURCHASED), lưới hàng còn rod2', !!afterBuy.held && afterBuy.held.id === 'rod18' && afterBuy.held.st === 'JUST_PURCHASED'
    && same(await ev(() => DR.grid('Shop_SHIPWRIGHT_RODS').items.map(i => i.id)), ['rod2']), JSON.stringify(afterBuy.held));
  check('không đóng được khi còn cầm món vừa mua (Esc)', await (async () => { await page.keyboard.press('Escape'); await sleep(200); return ev(() => DRCargo.isOpen() && !!DRCargo.held()); })());
  // --- đặt vào khoang: ô nhận cần câu, giữ 0,6 s "Lắp [2h]"
  const spot = await ev(() => { const g = DR.grid('INVENTORY'), d = DR.item('rod18'); for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (DRGrid.canPlace(g, d, x, y, 0)) return { x, y }; return null; });
  await moveTo(await cellXY('INVENTORY', spot.x, spot.y, 2, 1));
  const pIns = await prompt('install');
  eq('trên ô khoang: prompt "Lắp [2h]" giữ 0,6 s', pIns && [pIns.label, pIns.hold, pIns.enabled], ['Lắp [2h]', 0.6, true]);
  await page.mouse.down(); await sleep(800); await page.mouse.up(); await sleep(300);
  const placed = await itemOf('INVENTORY', 'rod18');
  check('rod18 nằm trong khoang đúng ô đã chọn', !!placed && placed.x === spot.x && placed.y === spot.y, JSON.stringify(placed) + ' ô ' + JSON.stringify(spot));
  const pt = await ev(() => __ev.filter(e => e[0] === 'passTime').map(e => [e[1], e[2]]));
  eq('lắp xong ép thời gian 2 giờ (equipmentInstallTimePerSquare 1 x 2 ô)', pt, [[2, 'INSTALL']]);
  if (full) await shot('3-placed');

  // --- bán lại món vừa lắp: giữ F 0,75 s; ×0,5 ở xưởng tàu; món về lưới hàng (mua lại được tới lần nhập sau)
  await sleep(300);
  await hoverItem('INVENTORY', 'rod18');
  const pSell = await prompt('sell');
  eq('rê rod18 trong khoang: "Bán [$37.50]" giữ 0,75 s (thiết bị)', pSell && [pSell.label, pSell.hold, pSell.bind], ['Bán [$37.50]', 0.75, 'KeyF']);
  eq('giá bán tô POSITIVE', await chipColor('sell'), POS);
  await page.keyboard.down('KeyF'); await sleep(300); await page.keyboard.up('KeyF'); await sleep(200);
  eq('nhả F sớm (0,3 s) thì chưa bán', await funds(), 45);
  await page.keyboard.down('KeyF'); await sleep(950); await page.keyboard.up('KeyF'); await sleep(300);
  eq('giữ F đủ: tiền 45 + 37,50 = 82,50', await funds(), 82.5);
  check('rod18 rời khoang, về lưới hàng Cần câu', !(await itemOf('INVENTORY', 'rod18')) && !!(await itemOf('Shop_SHIPWRIGHT_RODS', 'rod18')));
  // --- mua lại rồi F hoàn tiền (prompt.refund, giá MUA)
  await hoverItem('Shop_SHIPWRIGHT_RODS', 'rod18');
  await page.mouse.down(); await page.mouse.up(); await sleep(300);
  eq('mua lại: 82,50 − 75 = 7,50', await funds(), 7.5);
  const pRef = await prompt('refund');
  eq('đang cầm món vừa mua: "Hoàn tiền [$75.00]" phím F', pRef && [pRef.label, pRef.bind], ['Hoàn tiền [$75.00]', 'KeyF']);
  await page.keyboard.down('KeyF'); await sleep(950); await page.keyboard.up('KeyF'); await sleep(300);
  check('hoàn tiền: tiền về 82,50, tay trống, món về lưới hàng', (await funds()) === 82.5 && !(await ev(() => DRCargo.held())) && !!(await itemOf('Shop_SHIPWRIGHT_RODS', 'rod18')), String(await funds()));

  // --- cá: xưởng tàu không mua cá (itemSubtypesBought 646 = ENGINE|ROD|LIGHT|NET)
  await ev(() => { DR.give('mackerel', { size: 0.5, fresh: 3 }); DRCargo.refresh(); });
  await sleep(200);
  await hoverItem('INVENTORY', 'mackerel');
  const fishPr = await ev(() => (DRCargo._debug().prompts || []).map(p => p.id));
  check('rê cá ở Thợ đóng tàu: không có prompt Bán', !fishPr.includes('sell') && fishPr.includes('pickup'), fishPr.join(','));
  await page.keyboard.press('KeyF'); await sleep(200);
  check('bấm F trên cá không bán gì', (await funds()) === 82.5 && !!(await itemOf('INVENTORY', 'mackerel')));

  // --- sửa: T vào chế độ sửa, bấm ô hỏng, giữ R sửa tất cả
  const dmg = await ev(() => { const g = DR.grid('INVENTORY'), out = []; for (let y = 0; y < g.rows && out.length < 3; y++) for (let x = 0; x < g.cols && out.length < 3; x++) if (DRGrid.usable(g, x, y) && !DRGrid.itemAt(g, x, y) && (g.cells[y * g.cols + x].type & DRGrid.TYPE.GENERAL)) out.push([x, y]); g.damage.push(...out); DR.s.funds = 100; DRCargo.refresh(); return out; });
  await page.mouse.move(W * 0.6, H * 0.5); await sleep(150);
  const pMode = await prompt('repair-mode');
  eq('tab Khoang, tay trống: "Vào chế độ sửa" (T) ở vùng điều khiển', pMode && [pMode.label, pMode.bind, pMode.area], ['Vào chế độ sửa', 'KeyT', 'control']);
  const pAll0 = await prompt('repair-all');
  eq('"Sửa tất cả [$90.00]" giữ R 1 s (3 ô x 30)', pAll0 && [pAll0.label, pAll0.bind, pAll0.hold, pAll0.enabled], ['Sửa tất cả [$90.00]', 'KeyR', 1, true]);
  await page.keyboard.press('KeyT'); await sleep(250);
  eq('T: vào chế độ sửa', (await dbg()).mode, 'repair');
  await moveTo(await cellXY('INVENTORY', dmg[0][0], dmg[0][1]));
  const pRep = await prompt('repair');
  eq('rê ô hỏng: "Sửa [$30.00]" chuột trái', pRep && [pRep.label, pRep.bind, pRep.enabled], ['Sửa [$30.00]', 'lmb', true]);
  check('tooltip vết hỏng hiện prompt Sửa', await ev(() => !!document.querySelector('.cg-tip.on .pr[data-act="repair"]')));
  if (full) await shot('4-repair-mode');
  await page.mouse.down(); await page.mouse.up(); await sleep(300);
  check('bấm: tiền 100 → 70, ô đó hết hỏng', (await funds()) === 70 && !(await ev(c => DR.grid('INVENTORY').damage.some(d => d[0] === c[0] && d[1] === c[1]), dmg[0])), String(await funds()));
  await ev(() => { DR.s.funds = 40; DRCargo.refresh(); }); await sleep(100);
  await moveTo(await cellXY('INVENTORY', dmg[1][0], dmg[1][1]));
  eq('thiếu tiền sửa tất cả ($60 > $40): giá đỏ, prompt khoá', await ev(() => { const p = DRCargo._debug().prompts.find(p => p.id === 'repair-all'); return [p.label, p.enabled, getComputedStyle(document.querySelector('.cg-ctl [data-act="repair-all"] .price')).color]; }), ['Sửa tất cả [$60.00]', false, NEG]);
  await ev(() => { DR.s.funds = 100; DRCargo.refresh(); }); await sleep(100);
  await page.keyboard.down('KeyR'); await sleep(1200); await page.keyboard.up('KeyR'); await sleep(300);
  check('giữ R 1 s: sửa hết 2 ô còn lại, tiền 100 → 40', (await funds()) === 40 && (await ev(() => DR.grid('INVENTORY').damage.length)) === 0, String(await funds()));
  await page.keyboard.press('KeyT'); await sleep(200);
  eq('T lần nữa: thoát chế độ sửa', (await dbg()).mode, 'equip');

  // --- rời xưởng tàu (Esc) → về bến
  await page.keyboard.press('Escape'); await sleep(400);
  check('Esc: đóng khoang, rời điểm đến', !(await ev(() => DRCargo.isOpen())) && !(await ev(() => DRShop.isOpen())));
  await dockReady(page);

  // ===== Người buôn cá =====
  await ev(() => { DR.s.funds = 0; DR.s.vars['gm-repayments'] = 0; });
  await openDest(page, FM);
  const fm = await dbg();
  check('Người buôn cá trước node CaughtToOrder_Step3_Details: chưa có lưới bẫy cua (chỉ khoang)', !fm.leftKind, String(fm.leftKind));
  await hoverItem('INVENTORY', 'mackerel');
  const pFish = await prompt('sell');
  eq('rê cá: "Bán [$10.00]" bấm F (cá không cần giữ)', pFish && [pFish.label, pFish.hold], ['Bán [$10.00]', 0]);
  await page.keyboard.press('KeyF'); await sleep(300);
  eq('bán cá: tiền +8,50, trả nợ 1,50 (15%)', await ev(() => [DR.s.funds, DR.s.vars['gm-repayments']]), [8.5, 1.5]);
  const toast = await ev(() => { const t = [...document.querySelectorAll('.hud-toast[data-shop]')].pop(); return t ? [t.textContent, [...t.querySelectorAll('span')].map(s => s.style.color).filter(Boolean)] : null; });
  check('thông báo bán có tiền xanh và dòng trừ nợ đỏ', !!toast && /\+\$8\.50/.test(toast[0]) && /-\$1\.50/.test(toast[0]) && toast[1].length === 2, JSON.stringify(toast));
  // bán hết cá: thêm 2 con, giữ F 0,5 s khi không rê món nào
  await ev(() => { DR.give('mackerel', { size: 0.5, fresh: 3 }); DR.give('mackerel', { size: 1, fresh: 3 }); DRCargo.refresh(); });
  await page.mouse.move(W * 0.3, H * 0.5); await sleep(200);
  const pAll = await prompt('sell-all');
  eq('"Bán hết cá [$22.50]" giữ F 0,5 s ở vùng điều khiển', pAll && [pAll.label, pAll.bind, pAll.hold, pAll.area], ['Bán hết cá [$22.50]', 'KeyF', 0.5, 'control']);
  if (full) await shot('5-fishmonger');
  await page.keyboard.down('KeyF'); await sleep(750); await page.keyboard.up('KeyF'); await sleep(300);
  eq('bán hết: tiền 8,50 + 22,50 − 15% (3,38) = 27,62', await ev(() => [DR.s.funds, DR.s.vars['gm-repayments'], DR.grid('INVENTORY').items.filter(i => i.id === 'mackerel').length]), [27.62, 4.88, 0]);
  await page.keyboard.press('Escape'); await sleep(400);
  await dockReady(page);
  // mở tab bẫy cua (MarketTabConfig.isUnlockedBasedOnDialogue)
  await ev(() => { DR.s.visitedNodes.push('CaughtToOrder_Step3_Details'); DR.s.funds = 200; });
  await openDest(page, FM);
  const fm2 = await dbg();
  check('sau node CaughtToOrder_Step3_Details: lưới bẫy cua Fishmonger 8x9 bên trái, 4 bẫy pot1', fm2.leftKind === 'shop' && same(await ev(() => DR.grid('Shop_FISHMONGER').items.map(i => i.id)), ['pot1', 'pot1', 'pot1', 'pot1']));
  eq('tiêu đề bảng chợ cá', await ev(() => document.querySelector('.cg-left .cg-title').textContent), 'Cửa hàng cá');
  if (full) {
    const P = await rect('.cg-left'), want = [0, 180 * k, 650 * k, 800 * k];
    check('MarketSlidePanel 650x800 lệch xuống 40 → (0, 180)', P && P.every((v, i) => near(v, want[i], tol)), 'được ' + (P || []).map(r1) + ' cần ' + want.map(r1));
    await shot('6-fishmonger-pots');
  }
  // bẫy cua mua $100, bán lại ở người buôn cá: bẫy là thiết bị (x0,5), giữ F; tiền trừ nợ 15%
  await hoverItem('Shop_FISHMONGER', 'pot1');
  await page.mouse.down(); await page.mouse.up(); await sleep(250);
  eq('mua bẫy cua: 200 − 100 = 100', await funds(), 100);
  const pspot = await ev(() => { const g = DR.grid('INVENTORY'), d = DR.item('pot1'); for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (DRGrid.canPlace(g, d, x, y, 0)) return { x, y }; return null; });
  await moveTo(await cellXY('INVENTORY', pspot.x, pspot.y, 2, 1));
  await page.mouse.down(); await page.mouse.up(); await sleep(250);
  check('bẫy cua (FREE) đặt thẳng vào khoang', !!(await itemOf('INVENTORY', 'pot1')));
  // độ bền thiếu 2 ngày (max 3) → giá bán x max(0,1, 1/3); sửa ở đây không có (allowRepairs 0)
  await ev(() => { DR.grid('INVENTORY').items.find(i => i.id === 'pot1').dur = 1; DRCargo.refresh(); }); await sleep(100);
  await hoverItem('INVENTORY', 'pot1');
  const pPot = await prompt('sell');
  eq('bẫy cua độ bền 1/3: "Bán [$16.67]" (100 x 0,5 x 1/3), giữ 0,75 s', pPot && [pPot.label, pPot.hold], ['Bán [$16.67]', 0.75]);
  check('Người buôn cá không có sửa (allowRepairs false)', !(await prompt('repair-all')) && !(await prompt('repair-mode')));
  await page.keyboard.press('Escape'); await sleep(300);

  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// cỡ điện thoại: mở xưởng tàu bằng chạm, bảng hàng + khoang cùng hiện, mua được bằng chạm
async function runPhone(browser, base) {
  const W = 844, H = 390, tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = watch(page);
  const ev = (f, a) => page.evaluate(f, a);
  await toDock(page, base, 120);
  await openDest(page, SW);
  const d = await ev(() => DRCargo._debug());
  const L = await ev(() => { const r = document.querySelector('.cg-left').getBoundingClientRect(), R = document.querySelector('.cg-right').getBoundingClientRect(); return { l: [r.left, r.top, r.right, r.bottom], r: [R.left, R.top, R.right, R.bottom] }; });
  check('điện thoại: bảng hàng và khoang cùng hiện, không chồng nhau', d.leftKind === 'shop' && L.l[2] <= L.r[0] + 1 && L.l[0] >= -1 && L.r[2] <= W + 1, JSON.stringify(L));
  check('điện thoại: 4 tab hình vừa trong bảng', (await ev(() => [...document.querySelectorAll('.cg-left .cg-ltabs .cg-tab')].filter(t => { const r = t.getBoundingClientRect(); return r.width > 10 && r.right <= document.querySelector('.cg-left').getBoundingClientRect().right + 1; }).length)) === 4);
  await page.screenshot({ path: path.join(SHOTS, tag + '-1-shipwright.png') });
  const it = await ev(() => DR.grid('Shop_SHIPWRIGHT_RODS').items.find(i => i.id === 'rod18'));
  const p = await ev(c => { const g = document.querySelector('.cg-grid[data-key="Shop_SHIPWRIGHT_RODS"]').getBoundingClientRect(), cs = DRCargo._debug().cs; return { x: g.left + (c[0] + 0.5) * cs, y: g.top + (c[1] + 0.5) * cs }; }, it.cells[0]);
  await page.mouse.move(p.x, p.y); await sleep(200);
  await page.mouse.down(); await page.mouse.up(); await sleep(300);
  check('điện thoại: bấm món rod18 → mua, món dính con trỏ', (await ev(() => DR.s.funds)) === 45 && (await ev(() => (DRCargo._debug().held || {}).id)) === 'rod18');
  await page.screenshot({ path: path.join(SHOTS, tag + '-2-bought.png') });
  const btn = await ev(() => { const b = document.querySelector('.cg-ctl [data-act="refund"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: b.textContent }; });
  check('điện thoại: nút "Hoàn tiền [$75.00]" ở vùng điều khiển (không có phím F)', !!btn && /Hoàn tiền \[\$75\.00\]/.test(btn.t), JSON.stringify(btn));
  if (btn) { await page.mouse.move(btn.x, btn.y); await page.mouse.down(); await sleep(950); await page.mouse.up(); await sleep(300); }   // thiết bị: giữ 0,75 s
  check('điện thoại: chạm giữ Hoàn tiền → tiền về 120, tay trống', (await ev(() => DR.s.funds)) === 120 && !(await ev(() => DRCargo.held())));
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

function sbs(web, real, name) {
  const dst = path.join(SHOTS, 'sbs-' + name + '.png');
  const r = cp.spawnSync('python', ['-I', SBS, web, real, dst], { encoding: 'utf8', shell: true });   // shell: lấy python của PATH (pyenv có PIL)
  out.push(r.status === 0 ? '  · ghép cạnh ảnh thật: ' + dst : '  · sbs lỗi: ' + String(r.stderr || r.error).slice(0, 200));
}

(async () => {
  const srv = process.env.DR_URL ? null : await serve();
  const base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    if (!ONLY || ONLY === 'full') await run(browser, base, 1920, 1080, true);
    if (!ONLY || ONLY === 'phone') await runPhone(browser, base);
  } catch (e) { check('chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' | ')); }
  await browser.close();
  if (srv) srv.close();
  if (!ONLY || ONLY === 'full') {
    sbs(path.join(SHOTS, '1920x1080-1-shipwright.png'), REAL + 'gog_30.jpg', 'shipwright');
    sbs(path.join(SHOTS, '1920x1080-6-fishmonger-pots.png'), REAL + 'gog_18.jpg', 'market');
  }
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
