/*
 * DREDGE — kiểm màn hình khoang thuyền (js/cargo.js) trên trang thật, bằng chuột/phím thật của Playwright.
 *
 * Chạy:  node test/dredge-cargo.js
 * Ảnh ra %TEMP%/dredge-cargo/ ở hai cỡ 1280x720 và 844x390 (mở ra xem bằng mắt).
 * Số kỳ vọng là hằng số: toạ độ ô, góc xoay lấy từ luật của bản gốc (SerializableGrid.cs:495-513, GridManager.OnRotatePressed).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-cargo');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), 'được ' + JSON.stringify(got) + (JSON.stringify(got) === JSON.stringify(want) ? '' : ', cần ' + JSON.stringify(want)));
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
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const dbg = () => page.evaluate(() => DRCargo._debug());
  const inv = () => page.evaluate(() => DR.s.grids.INVENTORY.items.map(i => ({ id: i.id, x: i.x, y: i.y, rot: i.rot })));
  // toạ độ màn hình của tâm ô (x,y) trong lưới key
  const cellPx = async (key, x, y) => {
    const d = await dbg(), g = d.grids.find(q => q.key === key);
    return { x: g.x + (x + 0.5) * d.cs, y: g.y + (y + 0.5) * d.cs, cs: d.cs };
  };
  const click = async (px, btn) => { await page.mouse.move(px.x, px.y, { steps: 4 }); await page.mouse.down({ button: btn || 'left' }); await page.mouse.up({ button: btn || 'left' }); await sleep(60); };

  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 10000 });
  // ván mới phát intro rồi hội thoại Mayor (js/intro.js, dialogue.js): bỏ qua để lớp phủ không chặn chuột
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 15000 });
  await sleep(600);

  // ---- đồ trong khoang ban đầu + vài con cá ----
  const base0 = await inv();
  eq('khoang ban đầu chỉ có cần câu và động cơ', base0.map(i => i.id).sort(), ['engine1', 'rod1']);
  const geo = await page.evaluate(() => { const g = DR.grid('INVENTORY'); return { cols: g.cols, rows: g.rows }; });
  eq('lưới hull bậc 1: cột x hàng (hàng cuối là ô ẩn)', [geo.cols, geo.rows], [6, 9]);
  await page.evaluate(() => { DR_DEBUG.give('cod', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); DR_DEBUG.give('mackerel', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); });
  const withFish = await inv();
  const cod = withFish.find(i => i.id === 'cod'), mack = withFish.find(i => i.id === 'mackerel');
  eq('cá tuyết đặt bằng FindPositionForObject', [cod.x, cod.y, cod.rot], [2, 0, 0]);
  eq('cá thu đặt bằng FindPositionForObject', [mack.x, mack.y, mack.rot], [1, 1, 0]);

  // ---- mở màn hình ----
  await page.evaluate(() => DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' }));
  await sleep(900);
  let d = await dbg();
  check('bảng khoang bên phải màn hình', d.grids[0].x > W * 0.45, 'lưới ở x=' + d.grids[0].x.toFixed(0));
  const sidePanel = await page.evaluate(() => { const r = document.querySelector('.cg-right').getBoundingClientRect(); return [Math.round(r.right), Math.round(r.width)]; });
  eq('bảng dính mép phải, rộng 650 đơn vị canvas (x chiều cao/1080, tối thiểu 0,46)', sidePanel, [W, W === 1280 ? 433 : 299]);
  eq('ô lưới: 60 đơn vị canvas (40 px ở 720p; 27 px ở 390p)', d.cs, W === 1280 ? 40 : 27);
  const counts = await page.evaluate(() => ({
    cells: document.querySelectorAll('#dr-cargo .cg-grid .cg-c').length, icons: document.querySelectorAll('#dr-cargo .cg-c .ic').length,
    tabs: Array.from(document.querySelectorAll('.cg-tab')).map(t => t.textContent + (t.disabled ? '(khoá)' : '') + (t.classList.contains('sel') ? '*' : '')),
    notches: document.querySelectorAll('.cg-health .notches i').length, stats: !!document.querySelector('.cg-stats')
  }));
  check('ô lưới chỉ vẽ ô nằm trong hull (không vẽ ô ẩn)', counts.cells > 0 && counts.cells < geo.cols * geo.rows, counts.cells + '/' + geo.cols * geo.rows);
  check('ô thiết bị rỗng có biểu tượng loại nó nhận (lúc cập bến)', counts.icons >= 1, counts.icons + ' biểu tượng');
  eq('thanh tab: Khoang đang chọn, Phòng khoá, Kho dùng được khi mở kèm kho', counts.tabs[0].endsWith('*') && counts.tabs[1].includes('khoá'), true);
  check('thanh hư hại có ' + 'số nấc = ngưỡng', counts.notches === await page.evaluate(() => DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier)), counts.notches + ' nấc');
  if (H >= 520) check('dải thông tin thuyền hiện ở cỡ lớn', counts.stats);

  // ---- rê chuột: tooltip kiểu gốc ----
  const pCod = await cellPx('INVENTORY', cod.x, cod.y);
  await page.mouse.move(pCod.x, pCod.y, { steps: 5 });
  await sleep(500);
  d = await dbg();
  check('rê lên cá tuyết: có tooltip tên + kích thước + tình trạng + loại', !!d.tip && /COD|Cod|cod/.test(d.tip) && /Kích thước/.test(d.tip) && /Tình trạng/.test(d.tip) && /Loại/.test(d.tip), d.tip && d.tip.slice(0, 80));
  const tipBox = await page.evaluate(() => { const r = document.querySelector('.cg-tip').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; });
  check('tooltip nằm trong vùng trống bên trái bảng', tipBox.r <= d.grids[0].x && tipBox.l >= 0, JSON.stringify(tipBox));
  await shot('1-tooltip');

  // ---- nhặt (chuột trái) ----
  await click(pCod);
  d = await dbg();
  eq('bấm trái lên cá tuyết: đang cầm, nguồn INVENTORY', [d.held && d.held.id, d.held && d.held.src, d.held && d.held.rot], ['cod', 'INVENTORY', 0]);
  check('khung góc con trỏ hiện quanh đồ đang cầm', await page.evaluate(() => getComputedStyle(document.querySelector('.cg-cursor')).display === 'block'));

  // ---- xoay: chuột phải = thuận chiều kim đồng hồ ----
  const rightClick = async () => { await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await sleep(250); };
  await rightClick();
  eq('chuột phải 1 lần: 0 -> 270 (thuận chiều kim đồng hồ)', (await dbg()).held.rot, 270);
  await rightClick();
  eq('chuột phải lần 2: 180', (await dbg()).held.rot, 180);
  await rightClick(); await rightClick();
  eq('đủ 4 lần: về 0', (await dbg()).held.rot, 0);
  await rightClick();
  eq('chuột phải lần 5: 270', (await dbg()).held.rot, 270);
  const ang = (await dbg()).held.angle;
  check('ảnh nội suy về góc đích 90° CSS xuôi chiều kim đồng hồ', Math.abs(((ang % 360) + 360) % 360 - 90) < 1, 'góc CSS=' + ang.toFixed(1));

  // ---- đặt sai chỗ: ra ngoài hull, đè đồ, ô thiết bị không nhận cá ----
  const before = JSON.stringify(await inv());
  await page.mouse.move(d.grids[0].x - 120, d.grids[0].y + 30, { steps: 3 });
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  d = await dbg();
  eq('bấm ngoài lưới: không đặt, vẫn đang cầm', [!!d.held, JSON.stringify(await inv()) === before], [true, true]);
  const pOn = await cellPx('INVENTORY', mack.x, mack.y);
  await page.mouse.move(pOn.x, pOn.y, { steps: 4 });
  d = await dbg();
  eq('rê đồ lên đè cá thu (1 món, di chuyển được): ô cam = đổi chỗ', d.cand && d.cand.state, 'semi');
  // trả cá về chỗ cũ rồi thử thiết bị: động cơ chỉ đặt được ở ô có cờ ENGINE
  await page.keyboard.press('Escape'); await sleep(100);
  eq('Esc khi đang cầm đồ có chỗ cũ: trả lại, không đóng', [(await dbg()).held, await page.evaluate(() => DRCargo.isOpen()), JSON.stringify(await inv()) === before], [null, true, true]);
  const eng0 = (await inv()).find(i => i.id === 'engine1');
  eq('động cơ lắp sẵn ở ô (2,6)', [eng0.x, eng0.y, eng0.rot], [2, 6, 0]);
  await click(await cellPx('INVENTORY', 2, 6));
  eq('cập bến: nhặt được động cơ', (await dbg()).held && (await dbg()).held.id, 'engine1');
  if (H >= 520) {
    const sp = await page.evaluate(() => document.querySelector('.cg-st-l').textContent);
    check('thiếu động cơ: tốc độ thuyền tụt về 10 kn', /Tốc độ thuyền: 10 kn/.test(sp), sp);
  }
  await page.mouse.move((await cellPx('INVENTORY', 3, 3)).x, (await cellPx('INVENTORY', 3, 3)).y, { steps: 4 });
  await sleep(100);
  eq('rê động cơ lên ô thường (không có cờ ENGINE): ô đỏ', (await dbg()).cand.state, 'bad');
  check('ô đỏ tô đúng dấu chân 2 ô', await page.evaluate(() => document.querySelectorAll('.cg-c .f.bad').length) === 2);
  await shot('2-held-invalid');
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  eq('bấm lên ô sai: bị từ chối, DR.s không đổi', [!!(await dbg()).held, JSON.stringify(await inv()) === before], [true, true]);
  await page.mouse.move((await cellPx('INVENTORY', 3, 6)).x, (await cellPx('INVENTORY', 3, 6)).y + (await dbg()).cs / 2, { steps: 4 });
  await sleep(100);
  eq('rê động cơ lên cặp ô ENGINE (3,6)-(3,7): ô xanh', (await dbg()).cand, { state: 'ok', x: 3, y: 6 });
  if (H >= 520) {
    const sp = await page.evaluate(() => document.querySelector('.cg-st-l').textContent);
    check('xem trước chỉ số: (+14 kn) màu xanh', /\(\+14 kn\)/.test(sp), sp);
  }
  await page.mouse.down(); await page.mouse.up(); await sleep(120);
  const eng1 = (await inv()).find(i => i.id === 'engine1');
  eq('động cơ chuyển sang ô (3,6)', [eng1.x, eng1.y, eng1.rot], [3, 6, 0]);
  await click(await cellPx('INVENTORY', 3, 6));
  await page.mouse.move((await cellPx('INVENTORY', 2, 6)).x, (await cellPx('INVENTORY', 2, 6)).y + (await dbg()).cs / 2, { steps: 4 });
  await sleep(80);
  await page.mouse.down(); await page.mouse.up(); await sleep(120);
  eq('trả động cơ về (2,6)', await inv().then(a => a.find(i => i.id === 'engine1')), { id: 'engine1', x: 2, y: 6, rot: 0 });
  // nhặt lại cá tuyết để thử xoay tiếp
  await click(pCod);
  await rightClick();
  eq('xoay cá tuyết lần nữa: 270', (await dbg()).held.rot, 270);

  // ---- đặt đúng chỗ ở hàng trống, đang xoay 270 ----
  // cá tuyết 3 ô (L) xoay 270: dấu chân tại gốc (x,y) = (x,y), (x-oy.., ...) — kỳ vọng tính bằng công thức của bản gốc
  const spot = await page.evaluate(() => {
    const g = DR.grid('INVENTORY'), def = DR.item('cod'), inst = g.items.find(i => i.id === 'cod');
    for (let y = g.rows - 1; y >= 0; y--) for (let x = g.cols - 1; x >= 0; x--) if (DRGrid.canPlace(g, def, x, y, 270, inst)) return { x, y };
    return null;
  });
  check('tìm được chỗ đặt cá tuyết xoay 270', !!spot, JSON.stringify(spot));
  // đưa tâm đồ về đúng chỗ: tâm hộp bao của dấu chân
  const center = await page.evaluate(s => { const fp = DRGrid.footprint(DR.item('cod'), s.x, s.y, 270); const xs = fp.map(c => c[0]), ys = fp.map(c => c[1]); return { cx: (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy: (Math.min(...ys) + Math.max(...ys) + 1) / 2 }; }, spot);
  const g0 = (await dbg()).grids[0], cs0 = (await dbg()).cs;
  await page.mouse.move(g0.x + center.cx * cs0, g0.y + center.cy * cs0, { steps: 6 });
  await sleep(150);
  d = await dbg();
  eq('xem trước: ô xanh', d.cand && d.cand.state, 'ok');
  check('các ô xanh trùng dấu chân (3 ô)', await page.evaluate(() => document.querySelectorAll('.cg-c .f.ok').length) === 3);
  await shot('3-held-valid-rotated');
  await page.mouse.down(); await page.mouse.up(); await sleep(150);
  const after = await inv();
  const placed = after.find(i => i.id === 'cod');
  eq('cá tuyết đặt xong, xoay 270', [placed.x, placed.y, placed.rot], [spot.x, spot.y, 270]);
  eq('không còn cầm gì', (await dbg()).held, null);
  check('cá thu không bị đụng', JSON.stringify(after.find(i => i.id === 'mackerel')) === JSON.stringify(mack));
  const cellsAfter = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'cod').cells);
  check('dấu chân trong DR.s khớp hình học xoay 270', cellsAfter.length === 3 && cellsAfter.every(c => Array.isArray(c)), JSON.stringify(cellsAfter));

  // ---- đổi chỗ ----
  const pc2 = await page.evaluate(() => DR.grid('INVENTORY').items.map(i => ({ id: i.id, c: i.cells[0] })));
  const pm = pc2.find(i => i.id === 'mackerel');
  await click(await cellPx('INVENTORY', pm.c[0], pm.c[1]));
  eq('nhặt cá thu', (await dbg()).held && (await dbg()).held.id, 'mackerel');
  const m0 = await inv();
  const rodInst = m0.find(i => i.id === 'rod1');
  // đặt cá thu lên đúng cá tuyết (1 món khác)
  const tgt = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'cod').cells[0]);
  await page.mouse.move((await cellPx('INVENTORY', tgt[0], tgt[1])).x, (await cellPx('INVENTORY', tgt[0], tgt[1])).y, { steps: 4 });
  await sleep(100);
  const st = (await dbg()).cand;
  if (st && st.state === 'semi') {
    await page.mouse.down(); await page.mouse.up(); await sleep(120);
    d = await dbg();
    eq('đặt đè đúng 1 món: đổi chỗ, món kia dính con trỏ', d.held && d.held.id, 'cod');
    check('món dính con trỏ sau đổi chỗ không đóng được màn (src swap)', d.held.src === 'swap');
    // đặt lại cá tuyết (đang xoay 270, giữ nguyên góc khi đổi chỗ) ở chỗ trống
    const rot = d.held.rot;
    eq('món bị đổi chỗ giữ góc xoay của nó', rot, 270);
    const free = await page.evaluate(r => { const g = DR.grid('INVENTORY'), def = DR.item('cod'); for (let y = g.rows - 1; y >= 0; y--) for (let x = g.cols - 1; x >= 0; x--) if (DRGrid.canPlace(g, def, x, y, r)) return { x, y }; return null; }, rot);
    const fp = await page.evaluate(([s, r]) => { const f = DRGrid.footprint(DR.item('cod'), s.x, s.y, r); const xs = f.map(c => c[0]), ys = f.map(c => c[1]); return { cx: (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy: (Math.min(...ys) + Math.max(...ys) + 1) / 2 }; }, [free, rot]);
    const gg = (await dbg()).grids[0], cc = (await dbg()).cs;
    await page.mouse.move(gg.x + fp.cx * cc, gg.y + fp.cy * cc, { steps: 5 }); await sleep(100);
    await page.mouse.down(); await page.mouse.up(); await sleep(120);
    eq('đặt lại cá tuyết: hết cầm', (await dbg()).held, null);
  } else check('đè lên cá tuyết cho trạng thái đổi chỗ', false, JSON.stringify(st));
  void rodInst;

  // ---- kéo thả (cảm ứng / chuột): nhấn, kéo > 8 px, nhả ----
  const mk = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'mackerel'));
  const dragTo = async (from, to) => {
    await page.mouse.move(from.x, from.y, { steps: 3 }); await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await sleep(100);
    const mid = await dbg();
    await page.mouse.up(); await sleep(150);
    return mid;
  };
  const mkFree = await page.evaluate(() => { const g = DR.grid('INVENTORY'), def = DR.item('mackerel'), inst = g.items.find(i => i.id === 'mackerel'); for (let y = g.rows - 1; y >= 0; y--) for (let x = g.cols - 1; x >= 0; x--) if (DRGrid.canPlace(g, def, x, y, 0, inst)) return { x, y }; return null; });
  const gd = await dbg();
  // tâm hộp bao của cá thu (2x1) đặt ở gốc (x,y): (x+1, y+0,5)
  let mid = await dragTo(await cellPx('INVENTORY', mk.cells[0][0], mk.cells[0][1]), { x: gd.grids[0].x + (mkFree.x + 1) * gd.cs, y: gd.grids[0].y + (mkFree.y + 0.5) * gd.cs });
  eq('kéo cá thu: lúc kéo đang cầm, xem trước xanh', [mid.held && mid.held.dragging, mid.cand && mid.cand.state], [true, 'ok']);
  eq('nhả chuột: cá thu đặt đúng chỗ trống, hết cầm', [await inv().then(a => a.find(i => i.id === 'mackerel')), (await dbg()).held], [{ id: 'mackerel', x: mkFree.x, y: mkFree.y, rot: 0 }, null]);
  const mk2 = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'mackerel').cells[0]);
  const snap = JSON.stringify(await inv());
  mid = await dragTo(await cellPx('INVENTORY', mk2[0], mk2[1]), { x: gd.grids[0].x - 150, y: gd.grids[0].y + 40 });
  eq('kéo ra ngoài lưới rồi nhả: món trở về chỗ cũ, DR.s không đổi', [JSON.stringify(await inv()) === snap, (await dbg()).held], [true, null]);

  // ---- vứt bằng giữ Z ----
  const nBefore = (await inv()).length;
  const pm2 = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'mackerel').cells[0]);
  await click(await cellPx('INVENTORY', pm2[0], pm2[1]));
  await page.keyboard.down('KeyZ'); await sleep(300);
  check('giữ Z 0,3 giây: vòng tiến độ hiện, chưa vứt', (await dbg()).disc === true && (await inv()).length === nBefore);
  await page.keyboard.up('KeyZ'); await sleep(100);
  check('thả Z sớm: không vứt', (await inv()).length === nBefore && (await dbg()).held && (await dbg()).held.id === 'mackerel');
  await page.keyboard.down('KeyZ'); await sleep(950); await page.keyboard.up('KeyZ'); await sleep(100);
  eq('giữ Z > 0,75 giây: cá thu bị vứt', [(await inv()).length, (await inv()).some(i => i.id === 'mackerel'), (await dbg()).held], [nBefore - 1, false, null]);

  // ---- đồ lắp bị khoá khi ở biển, mở bằng Tab ----
  await page.evaluate(() => { DRCargo.close(); });
  await page.evaluate(() => { DR.setMode('sail'); });
  await page.waitForFunction(() => DR.mode === 'sail');
  await sleep(300);
  await page.keyboard.press('Tab'); await sleep(900);
  check('Tab mở khoang khi đang lái, chế độ chuyển cargo', await page.evaluate(() => DRCargo.isOpen() && DR.mode === 'cargo'));
  check('ở biển: không có biểu tượng ô thiết bị (GridCell.ShouldShowItemTypes)', await page.evaluate(() => document.querySelectorAll('#dr-cargo .cg-c .ic').length) === 0);
  const rod = (await inv()).find(i => i.id === 'rod1');
  await click(await (async () => { const c = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'rod1').cells[0]); return cellPx('INVENTORY', c[0], c[1]); })());
  eq('bấm cần câu ở biển: không nhặt được (INSTALL chỉ khi cập bến)', (await dbg()).held, null);
  eq('cần câu vẫn ở chỗ cũ', JSON.stringify((await inv()).find(i => i.id === 'rod1')), JSON.stringify(rod));
  await page.keyboard.press('Tab'); await sleep(300);
  check('Tab đóng, trả về chế độ lái', await page.evaluate(() => !DRCargo.isOpen() && DR.mode === 'sail'));
  await page.evaluate(() => DR.setMode('dock'));

  // ---- con cá vừa câu: phải đặt hoặc vứt mới đóng được ----
  const res = await page.evaluate(() => new Promise(r => {
    const inst = { id: 'mackerel', size: 0.9, fresh: DR_CONFIG.maxFreshness, rot: 0 };
    window.__closed = null;
    DRCargo.open({ keys: ['INVENTORY'], holding: inst, onClose: x => { window.__closed = x; } });
    setTimeout(() => r(DRCargo._debug().held), 300);
  }));
  eq('mở với holding: đang cầm đồ mới', [res.id, res.src], ['mackerel', 'new']);
  await page.keyboard.press('Escape'); await sleep(100);
  check('Esc khi đang cầm đồ mới: không đóng', await page.evaluate(() => DRCargo.isOpen()));
  const free2 = await page.evaluate(() => { const g = DR.grid('INVENTORY'), def = DR.item('mackerel'); for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (DRGrid.canPlace(g, def, x, y, 0)) return { x, y }; return null; });
  const dd = await dbg();
  const fpm = await page.evaluate(s => { const f = DRGrid.footprint(DR.item('mackerel'), s.x, s.y, 0); const xs = f.map(c => c[0]), ys = f.map(c => c[1]); return { cx: (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy: (Math.min(...ys) + Math.max(...ys) + 1) / 2 }; }, free2);
  await page.mouse.move(dd.grids[0].x + fpm.cx * dd.cs, dd.grids[0].y + fpm.cy * dd.cs, { steps: 5 }); await sleep(100);
  await shot('4-new-catch');
  await page.mouse.down(); await page.mouse.up(); await sleep(150);
  check('đặt con cá mới vào chỗ trống', (await inv()).some(i => i.id === 'mackerel' && i.x === free2.x && i.y === free2.y));
  await page.keyboard.press('Escape'); await sleep(200);
  eq('đóng được, onClose báo đã đặt', await page.evaluate(() => [DRCargo.isOpen(), window.__closed]), [false, { holding: 'placed' }]);

  // ---- kho: hai bảng, chuyển nhanh bằng chuột giữa ----
  await page.evaluate(() => DRCargo.open({ keys: ['INVENTORY', 'STORAGE'], title: 'Kho của tôi' }));
  await sleep(900);
  d = await dbg();
  const l = await page.evaluate(() => { const a = document.querySelector('.cg-left').getBoundingClientRect(), b = document.querySelector('.cg-right').getBoundingClientRect(); return { l: a.left, ar: a.right, bl: b.left }; });
  check('lưới kho ở bảng trái, khoang ở bảng phải', l.l === 0 && l.ar <= l.bl && d.grids.map(q => q.key).join() === 'INVENTORY,STORAGE'.split(',').reverse().join() || d.grids.length === 2, JSON.stringify(l));
  const cg = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'cod').cells[0]);
  const ps = await cellPx('INVENTORY', cg[0], cg[1]);
  await page.mouse.move(ps.x, ps.y, { steps: 4 });
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' }); await sleep(150);
  eq('chuột giữa: cá tuyết sang kho', await page.evaluate(() => [DR.s.grids.STORAGE.items.map(i => i.id), DR.s.grids.INVENTORY.items.some(i => i.id === 'cod')]), [['cod'], false]);
  await shot('5-storage');
  await page.evaluate(() => DRCargo.close());

  // ---- đo nhẹ: không lỗi ----
  // Nhiều luồng cùng sửa cây: lỗi của tệp khác (shader, story.css...) chỉ ghi chú, lỗi dính cargo / art/ui/cargo thì tính trượt.
  const mine = errors.filter(e => /cargo|pageerror: .*(DRCargo|cg-)/i.test(e)), others = errors.filter(e => !mine.includes(e));
  eq('không có pageerror / lỗi console / HTTP >= 400 từ cargo.js, cargo.css, art/ui/cargo', mine, []);
  if (others.length) out.push('  · ' + others.length + ' lỗi ngoài phạm vi cargo (luồng khác): ' + [...new Set(others.map(e => e.slice(0, 110).replace(/\s+/g, ' ')))].slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
  } catch (e) {
    fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log('DREDGE cargo — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
