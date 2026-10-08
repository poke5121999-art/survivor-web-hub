/*
 * DREDGE — kiểm màn hình khoang thuyền (js/cargo.js, js/grid.js) trên trang thật, bằng chuột/phím thật của Playwright.
 *
 * Chạy:  node test/dredge-cargo.js            (thêm DR_URL=... để chạy trên Pages)
 * Ảnh ra %TEMP%/dredge-cargo/ ở ba cỡ 1280x720, 844x390 và 1920x1080 (cỡ lớn chỉ chụp + ghép cạnh ảnh gốc gog_04 / gog_31 bằng
 * D:/dredge-ref/notes/sbs.py nếu có python và ảnh gốc).
 * Số kỳ vọng là hằng số của bản gốc: toạ độ ô, góc xoay (SerializableGrid.cs:495-513, GridManager.OnRotatePressed), giữ 0,6 s tháo/lắp
 * (EquipmentModeActionHandler.cs:22,32), giờ lắp = 1 h x số ô (ItemManager.cs:214-217), vứt 0,75 s / discardHoldTimeSec, tên clip
 * (GridObjectAudio + 15 override trong Game.unity &124503), tooltip (TooltipSection*), ươn (FreshnessCoroutine), lưới nộp (QuestGridPanel).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-cargo');
fs.mkdirSync(SHOTS, { recursive: true });
const REAL = process.env.DR_REAL || 'D:/dredge-ref/shots-real';
const SBS = process.env.DR_SBS || 'D:/dredge-ref/notes/sbs.py';
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

async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 10000 });
  // ván mới phát intro rồi hội thoại Mayor (js/intro.js, dialogue.js): bỏ qua để lớp phủ không chặn chuột
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 15000 });
  await sleep(600);
  // gián điệp tiếng (DRAudio.play / loop / stopLoop) và sự kiện trôi giờ / món đặc biệt
  await page.evaluate(() => {
    window.__sfx = []; window.__loops = []; window.__pass = []; window.__special = [];
    const p = DRAudio.play, l = DRAudio.loop, s = DRAudio.stopLoop;
    DRAudio.play = (k, v, r) => { __sfx.push(k); return p(k, v, r); };
    DRAudio.loop = (k, v, r) => { __loops.push(['loop', k, v]); return l(k, v, r); };
    DRAudio.stopLoop = k => { __loops.push(['stop', k]); return s(k); };
    DR.on('passTime', (h, why) => __pass.push([h, why]));
    DR.on('specialItem', def => __special.push(def.id));
  });
  return { page, errors };
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const { page, errors } = await boot(browser, base, W, H);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const dbg = () => page.evaluate(() => DRCargo._debug());
  const inv = () => page.evaluate(() => DR.s.grids.INVENTORY.items.map(i => ({ id: i.id, x: i.x, y: i.y, rot: i.rot })));
  const sfx = () => page.evaluate(() => __sfx.splice(0));
  const last = async () => { const a = await sfx(); return a[a.length - 1] || null; };
  // toạ độ màn hình của tâm ô (x,y) trong lưới key
  const cellPx = async (key, x, y) => {
    const d = await dbg(), g = d.grids.find(q => q.key === key);
    if (!g) throw new Error('lưới ' + key + ' không hiện');
    return { x: g.x + (x + 0.5) * d.cs, y: g.y + (y + 0.5) * d.cs, cs: d.cs };
  };
  // tâm hộp bao của dấu chân món id đặt ở gốc (x,y) xoay rot trong lưới key
  const fpPx = async (key, id, x, y, rot) => {
    const c = await page.evaluate(([id, x, y, rot]) => { const f = DRGrid.footprint(DR.item(id), x, y, rot); const xs = f.map(c => c[0]), ys = f.map(c => c[1]); return { cx: (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy: (Math.min(...ys) + Math.max(...ys) + 1) / 2 }; }, [id, x, y, rot]);
    const d = await dbg(), g = d.grids.find(q => q.key === key);
    return { x: g.x + c.cx * d.cs, y: g.y + c.cy * d.cs };
  };
  const click = async (px, btn) => { await page.mouse.move(px.x, px.y, { steps: 4 }); await page.mouse.down({ button: btn || 'left' }); await page.mouse.up({ button: btn || 'left' }); await sleep(60); };
  const holdMouse = async (px, ms) => { await page.mouse.move(px.x, px.y, { steps: 4 }); await sleep(40); await page.mouse.down(); await sleep(ms); await page.mouse.up(); await sleep(80); };
  const holdKey = async (code, ms) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); await sleep(80); };
  const rightClick = async () => { await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await sleep(250); };
  const prompts = async () => (await dbg()).prompts;
  const firstCell = id => page.evaluate(id => { const i = DR.grid('INVENTORY').items.find(i => i.id === id); return i && i.cells[0]; }, id);
  const hoverItem = async (key, id) => { const c = await page.evaluate(([k, id]) => { const g = DR.grid(k) || (DRCargo._debug().grids.find(q => q.key === k) || {}); const items = g.items || []; const i = items.find(i => i.id === id); return i && (i.cells ? i.cells[0] : [i.x, i.y]); }, [key, id]); const p = await cellPx(key, c[0], c[1]); await page.mouse.move(p.x, p.y, { steps: 5 }); await sleep(120); return p; };

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

  // ---- mở màn hình (dạng cũ keys:[...]) ----
  await page.evaluate(() => DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' }));
  await sleep(900);
  let d = await dbg();
  check('bảng khoang bên phải màn hình', d.grids[0].x > W * 0.45, 'lưới ở x=' + d.grids[0].x.toFixed(0));
  const sidePanel = await page.evaluate(() => { const r = document.querySelector('.cg-right').getBoundingClientRect(); return [Math.round(r.right), Math.round(r.width)]; });
  eq('bảng dính mép phải, rộng 650 đơn vị canvas (x chiều cao/1080, tối thiểu 0,46)', sidePanel, [W, W === 1280 ? 433 : 299]);
  eq('ô lưới: 60 đơn vị canvas (40 px ở 720p; 27 px ở 390p)', d.cs, W === 1280 ? 40 : 27);
  eq('mở ở bến: chế độ lắp (Player.CanMoveInstalledItems)', d.mode, 'equip');
  eq('mở xong phát "Generic Grid Open Sound"', (await sfx()).includes('ui.grid.open'), true);
  const counts = await page.evaluate(() => ({
    cells: document.querySelectorAll('#dr-cargo .cg-grid .cg-c').length, icons: document.querySelectorAll('#dr-cargo .cg-c .ic').length,
    tabs: Array.from(document.querySelectorAll('.cg-tab')).map(t => t.textContent + (t.disabled ? '(khoá)' : '') + (t.classList.contains('sel') ? '*' : '')),
    notches: document.querySelectorAll('.cg-health .notches i').length, stats: !!document.querySelector('.cg-stats'),
    statText: (document.querySelector('.cg-st-l') || {}).innerText || ''
  }));
  check('ô lưới chỉ vẽ ô nằm trong hull (không vẽ ô ẩn)', counts.cells > 0 && counts.cells < geo.cols * geo.rows, counts.cells + '/' + geo.cols * geo.rows);
  check('ô thiết bị rỗng có biểu tượng loại nó nhận (lúc cập bến)', counts.icons >= 1, counts.icons + ' biểu tượng');
  eq('C11 thanh tab: chỉ vẽ tab được mở (KHOANG), không vẽ Phòng/Kho khoá', counts.tabs, ['Khoang*']);
  check('thanh hư hại có số nấc = ngưỡng', counts.notches === await page.evaluate(() => DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier)), counts.notches + ' nấc');
  if (H >= 520) {
    check('dải thông tin thuyền hiện ở cỡ lớn', counts.stats);
    check('C12/GR-08: dòng "Thưởng dị biến" ẩn khi bằng 0; đèn "0 lm"', !/Thưởng dị biến/.test(counts.statText) && /Đèn: 0 lm/.test(counts.statText), counts.statText);
  }

  // ---- rê chuột: tooltip kiểu gốc ----
  const pCod = await cellPx('INVENTORY', cod.x, cod.y);
  await page.mouse.move(pCod.x, pCod.y, { steps: 5 });
  await sleep(500);
  d = await dbg();
  check('rê lên cá tuyết: có tooltip tên + kích thước + tình trạng + loại', !!d.tip && /COD|Cod|cod/.test(d.tip) && /Kích thước/.test(d.tip) && /Tình trạng/.test(d.tip) && /Loại/.test(d.tip), d.tip && d.tip.slice(0, 80));
  const tipBox = await page.evaluate(() => { const r = document.querySelector('.cg-tip').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; });
  check('tooltip nằm trong vùng trống bên trái bảng', tipBox.r <= d.grids[0].x && tipBox.l >= 0, JSON.stringify(tipBox));
  eq('prompt khi rê cá: Nhặt (chuột trái) + Vứt (giữ Z 0,75 s)', (await prompts()).map(p => p.id + ':' + p.bind + ':' + p.hold), ['pickup:lmb:0', 'discard:KeyZ:0.75']);
  await shot('1-tooltip');

  // ---- nhặt (chuột trái) ----
  await sfx();
  await click(pCod);
  d = await dbg();
  eq('bấm trái lên cá tuyết: đang cầm, nguồn INVENTORY', [d.held && d.held.id, d.held && d.held.src, d.held && d.held.rot], ['cod', 'INVENTORY', 0]);
  eq('C03 nhặt cá: "Organic Item - Pick up"', await last(), 'ui.grid.pick.organic');
  check('khung góc con trỏ hiện quanh đồ đang cầm', await page.evaluate(() => getComputedStyle(document.querySelector('.cg-cursor')).display === 'block'));

  // ---- xoay: chuột phải = thuận chiều kim đồng hồ ----
  await rightClick();
  eq('chuột phải 1 lần: 0 -> 270 (thuận chiều kim đồng hồ)', (await dbg()).held.rot, 270);
  eq('C03 xoay: clip "rotate"', await last(), 'ui.grid.rotate');
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
  await sfx();
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  d = await dbg();
  eq('bấm ngoài lưới: không đặt, vẫn đang cầm', [!!d.held, JSON.stringify(await inv()) === before], [true, true]);
  eq('C03 đặt hụt: "item-place-error"', await last(), 'ui.grid.error');
  const pOn = await cellPx('INVENTORY', mack.x, mack.y);
  await page.mouse.move(pOn.x, pOn.y, { steps: 4 });
  d = await dbg();
  eq('rê đồ lên đè cá thu (1 món, di chuyển được): ô cam = đổi chỗ', d.cand && d.cand.state, 'semi');
  await page.keyboard.press('Escape'); await sleep(100);
  eq('Esc khi đang cầm đồ có chỗ cũ: trả lại, không đóng', [(await dbg()).held, await page.evaluate(() => DRCargo.isOpen()), JSON.stringify(await inv()) === before], [null, true, true]);

  // ---- C05: tháo / lắp thiết bị ở bến = giữ 0,6 s, lắp xong trôi giờ ----
  const eng0 = (await inv()).find(i => i.id === 'engine1');
  eq('động cơ lắp sẵn ở ô (2,6)', [eng0.x, eng0.y, eng0.rot], [2, 6, 0]);
  const pEng = await cellPx('INVENTORY', 2, 6);
  await page.mouse.move(pEng.x, pEng.y, { steps: 4 }); await sleep(120);
  eq('rê động cơ đã lắp: prompt Tháo = giữ chuột trái 0,6 s (EquipmentModeActionHandler)', (await prompts()).filter(p => p.bind === 'lmb').map(p => p.id + ':' + p.hold), ['uninstall:0.6']);
  check('tooltip động cơ: Thời gian lắp 2h + Tình trạng Hoạt động + Tốc độ +14 kn', /Thời gian lắp:2h/.test((await dbg()).tip) && /Hoạt động/.test((await dbg()).tip) && /\+14 kn/.test((await dbg()).tip), (await dbg()).tip);
  await sfx(); await page.evaluate(() => __loops.splice(0));
  await holdMouse(pEng, 250);
  eq('giữ 0,25 s rồi nhả: chưa tháo', [(await dbg()).held, (await inv()).some(i => i.id === 'engine1')], [null, true]);
  check('C16 nhả sớm: vòng "Hold - Active" bật rồi tắt, không có "Hold - Complete"', await page.evaluate(() => __loops.some(l => l[0] === 'loop' && l[1] === 'ui.hold.active') && __loops.some(l => l[0] === 'stop' && l[1] === 'ui.hold.active') && !__sfx.includes('ui.hold.complete')), JSON.stringify(await page.evaluate(() => __loops)));
  await holdMouse(pEng, 800);
  eq('giữ 0,8 s: động cơ lên con trỏ', (await dbg()).held && (await dbg()).held.id, 'engine1');
  const sfxUn = await sfx();
  check('C16 giữ đủ: "Hold - Complete" rồi tiếng tháo "Equipment - Uninstall"', sfxUn.includes('ui.hold.complete') && sfxUn.includes('ui.grid.equip.uninstall'), JSON.stringify(sfxUn));
  if (H >= 520) {
    const sp = await page.evaluate(() => document.querySelector('.cg-st-l').textContent);
    check('thiếu động cơ: tốc độ thuyền tụt về 10 kn', /Tốc độ thuyền: 10 kn/.test(sp), sp);
  }
  await page.mouse.move((await cellPx('INVENTORY', 3, 3)).x, (await cellPx('INVENTORY', 3, 3)).y, { steps: 4 });
  await sleep(100);
  eq('rê động cơ lên ô thường (không có cờ ENGINE): ô đỏ', (await dbg()).cand.state, 'bad');
  check('ô đỏ tô đúng dấu chân 2 ô', await page.evaluate(() => document.querySelectorAll('.cg-c .f.bad').length) === 2);
  eq('ô đỏ: prompt Lắp bị tắt (DoHitTest)', (await prompts()).filter(p => p.id === 'install').map(p => p.enabled), [false]);
  await shot('2-held-invalid');
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  eq('bấm lên ô sai: bị từ chối, vẫn cầm, động cơ vẫn ghi ở ô cũ (2,6) trong DR.s', [!!(await dbg()).held, (await inv()).find(i => i.id === 'engine1').x], [true, 2]);
  const pIns = await fpPx('INVENTORY', 'engine1', 3, 6, 0);
  await page.mouse.move(pIns.x, pIns.y, { steps: 4 });
  await sleep(100);
  eq('rê động cơ lên cặp ô ENGINE (3,6)-(3,7): ô xanh', (await dbg()).cand, { state: 'ok', x: 3, y: 6, key: 'INVENTORY' });
  eq('prompt Lắp [2h] = giữ 0,6 s (1 h x 2 ô)', (await prompts()).filter(p => p.id === 'install').map(p => p.label + ':' + p.hold + ':' + p.enabled), ['Lắp [2h]:0.6:true']);
  if (H >= 520) {
    const sp = await page.evaluate(() => document.querySelector('.cg-st-l').textContent);
    check('xem trước chỉ số: (+14 kn) màu xanh', /\(\+14 kn\)/.test(sp), sp);
  }
  await page.evaluate(() => __pass.splice(0));
  await holdMouse(pIns, 250);
  eq('giữ 0,25 s rồi nhả: chưa lắp (vẫn cầm, DR.s vẫn ghi ô cũ)', [!!(await dbg()).held, (await inv()).find(i => i.id === 'engine1').x], [true, 2]);
  const t0 = await page.evaluate(() => DR.s.time);
  await sfx();
  await holdMouse(pIns, 800);
  const eng1 = (await inv()).find(i => i.id === 'engine1');
  eq('giữ 0,8 s: động cơ lắp vào ô (3,6)', eng1 && [eng1.x, eng1.y, eng1.rot], [3, 6, 0]);
  eq('C03 lắp: "Equipment - Install"', (await sfx()).includes('ui.grid.equip.install'), true);
  eq('C05 lắp xong: DR.emit("passTime", 2, "INSTALL")', await page.evaluate(() => __pass), [[2, 'INSTALL']]);
  await page.waitForFunction(() => !DRSky.forced, null, { timeout: 8000 }).catch(() => {});
  const t1 = await page.evaluate(() => DR.s.time);
  check('đồng hồ nhảy 2 giờ (2/24 ngày) sau khi lắp', Math.abs((t1 - t0) - 2 / 24) < 0.01, 'trôi ' + ((t1 - t0) * 24).toFixed(2) + ' giờ');
  check('C13 đặt xong không có hoạt ảnh nảy (.settle)', await page.evaluate(() => !document.querySelector('.cg-item.settle')));
  // trả động cơ về (2,6) để các bước sau giữ nguyên toạ độ
  await holdMouse(await cellPx('INVENTORY', 3, 6), 800);
  await holdMouse(await fpPx('INVENTORY', 'engine1', 2, 6, 0), 800);
  eq('trả động cơ về (2,6)', await inv().then(a => a.find(i => i.id === 'engine1')), { id: 'engine1', x: 2, y: 6, rot: 0 });
  await page.waitForFunction(() => !DRSky.forced, null, { timeout: 8000 }).catch(() => {});

  // ---- nhặt lại cá tuyết để thử đặt xoay ----
  await click(pCod);
  await rightClick();
  eq('xoay cá tuyết lần nữa: 270', (await dbg()).held.rot, 270);
  const spot = await page.evaluate(() => {
    const g = DR.grid('INVENTORY'), def = DR.item('cod'), inst = g.items.find(i => i.id === 'cod');
    for (let y = g.rows - 1; y >= 0; y--) for (let x = g.cols - 1; x >= 0; x--) if (DRGrid.canPlace(g, def, x, y, 270, inst)) return { x, y };
    return null;
  });
  check('tìm được chỗ đặt cá tuyết xoay 270', !!spot, JSON.stringify(spot));
  const pSpot = await fpPx('INVENTORY', 'cod', spot.x, spot.y, 270);
  await page.mouse.move(pSpot.x, pSpot.y, { steps: 6 });
  await sleep(150);
  d = await dbg();
  eq('xem trước: ô xanh', d.cand && d.cand.state, 'ok');
  check('các ô xanh trùng dấu chân (3 ô)', await page.evaluate(() => document.querySelectorAll('.cg-c .f.ok').length) === 3);
  await shot('3-held-valid-rotated');
  await sfx();
  await page.mouse.down(); await page.mouse.up(); await sleep(150);
  const after = await inv();
  const placed = after.find(i => i.id === 'cod');
  eq('cá tuyết đặt xong, xoay 270', [placed.x, placed.y, placed.rot], [spot.x, spot.y, 270]);
  eq('C03 đặt cá: "Organic Item - Place"', await last(), 'ui.grid.place.organic');
  eq('không còn cầm gì', (await dbg()).held, null);
  check('cá thu không bị đụng', JSON.stringify(after.find(i => i.id === 'mackerel')) === JSON.stringify(mack));

  // ---- đổi chỗ ----
  await hoverItem('INVENTORY', 'mackerel');
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  eq('nhặt cá thu', (await dbg()).held && (await dbg()).held.id, 'mackerel');
  const tgt = await firstCell('cod');
  await page.mouse.move((await cellPx('INVENTORY', tgt[0], tgt[1])).x, (await cellPx('INVENTORY', tgt[0], tgt[1])).y, { steps: 4 });
  await sleep(100);
  const st = (await dbg()).cand;
  if (st && st.state === 'semi') {
    await page.mouse.down(); await page.mouse.up(); await sleep(120);
    d = await dbg();
    eq('đặt đè đúng 1 món: đổi chỗ, món kia dính con trỏ', d.held && d.held.id, 'cod');
    check('món dính con trỏ sau đổi chỗ không đóng được màn (src swap)', d.held.src === 'swap');
    eq('món bị đổi chỗ giữ góc xoay của nó', d.held.rot, 270);
    const free = await page.evaluate(r => { const g = DR.grid('INVENTORY'), def = DR.item('cod'); for (let y = g.rows - 1; y >= 0; y--) for (let x = g.cols - 1; x >= 0; x--) if (DRGrid.canPlace(g, def, x, y, r)) return { x, y }; return null; }, 270);
    const pf = await fpPx('INVENTORY', 'cod', free.x, free.y, 270);
    await page.mouse.move(pf.x, pf.y, { steps: 5 }); await sleep(100);
    await page.mouse.down(); await page.mouse.up(); await sleep(120);
    eq('đặt lại cá tuyết: hết cầm', (await dbg()).held, null);
  } else check('đè lên cá tuyết cho trạng thái đổi chỗ', false, JSON.stringify(st));

  // ---- kéo thả (cảm ứng / chuột): nhấn, kéo > 8 px, nhả ----
  const dragTo = async (from, to) => {
    await page.mouse.move(from.x, from.y, { steps: 3 }); await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await sleep(100);
    const mid = await dbg();
    await page.mouse.up(); await sleep(150);
    return mid;
  };
  const mkFree = await page.evaluate(() => { const g = DR.grid('INVENTORY'), def = DR.item('mackerel'), inst = g.items.find(i => i.id === 'mackerel'); for (let y = g.rows - 1; y >= 0; y--) for (let x = g.cols - 1; x >= 0; x--) if (DRGrid.canPlace(g, def, x, y, 0, inst)) return { x, y }; return null; });
  const mkc = await firstCell('mackerel');
  let mid = await dragTo(await cellPx('INVENTORY', mkc[0], mkc[1]), await fpPx('INVENTORY', 'mackerel', mkFree.x, mkFree.y, 0));
  eq('kéo cá thu: lúc kéo đang cầm, xem trước xanh', [mid.held && mid.held.dragging, mid.cand && mid.cand.state], [true, 'ok']);
  eq('nhả chuột: cá thu đặt đúng chỗ trống, hết cầm', [await inv().then(a => a.find(i => i.id === 'mackerel')), (await dbg()).held], [{ id: 'mackerel', x: mkFree.x, y: mkFree.y, rot: 0 }, null]);
  const mk2 = await firstCell('mackerel');
  const snap = JSON.stringify(await inv());
  const gd = await dbg();
  mid = await dragTo(await cellPx('INVENTORY', mk2[0], mk2[1]), { x: gd.grids[0].x - 150, y: gd.grids[0].y + 40 });
  eq('kéo ra ngoài lưới rồi nhả: món trở về chỗ cũ, DR.s không đổi', [JSON.stringify(await inv()) === snap, (await dbg()).held], [true, null]);

  // ---- vứt bằng giữ Z + đếm cá vứt ----
  const nBefore = (await inv()).length;
  await hoverItem('INVENTORY', 'mackerel');
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  await page.keyboard.down('KeyZ'); await sleep(300);
  check('giữ Z 0,3 giây: vòng tiến độ hiện, chưa vứt', (await dbg()).disc === true && (await inv()).length === nBefore);
  await page.keyboard.up('KeyZ'); await sleep(100);
  check('thả Z sớm: không vứt', (await inv()).length === nBefore && (await dbg()).held && (await dbg()).held.id === 'mackerel');
  await sfx();
  await holdKey('KeyZ', 950);
  eq('giữ Z > 0,75 giây: cá thu bị vứt', [(await inv()).length, (await inv()).some(i => i.id === 'mackerel'), (await dbg()).held], [nBefore - 1, false, null]);
  eq('C03 vứt cá: "Organic Item - Drop" (không phải clip trinket)', (await sfx()).includes('ui.grid.drop.organic'), true);
  eq('C08 vứt cá: FishDiscardCount = 1', await page.evaluate(() => DR.s.vars['fish-discard-count']), 1);

  // ---- C08: thiết bị chỉ vứt được sau nhiệm vụ mở đầu; món có hành động vứt riêng ----
  await hoverItem('INVENTORY', 'rod1');
  eq('rê cần câu trước khi xong Quest_Intro: không có prompt Vứt', (await prompts()).some(p => p.id === 'discard'), false);
  await page.evaluate(() => DRQuests.complete('Quest_Intro', 0, true));
  await page.mouse.move(5, 5); await hoverItem('INVENTORY', 'rod1');
  eq('xong Quest_Intro: cần câu có prompt Vứt giữ 2 s (discardHoldTimeOverride) kèm cảnh báo', (await prompts()).filter(p => p.id === 'discard').map(p => p.hold), [2]);
  await page.evaluate(() => DR_DEBUG.give('repair-boat'));
  await page.evaluate(() => DRCargo.refresh());
  await sleep(100);
  await hoverItem('INVENTORY', 'repair-boat');
  eq('bộ sửa thân: prompt vứt đổi nhãn "Dùng" (discardPromptOverride prompt.use)', (await prompts()).filter(p => p.id === 'discard').map(p => p.label), ['Dùng']);
  check('tooltip bộ sửa thân có ghi chú thêm (TooltipSectionAdditionalNote)', /Repairs up to 2 damaged areas/.test((await dbg()).tip), (await dbg()).tip);
  await sfx();
  await holdKey('KeyZ', 950);
  eq('giữ Z lên bộ sửa: biến mất, phát sự kiện specialItem, tiếng override "Repair Kit"', [(await inv()).some(i => i.id === 'repair-boat'), await page.evaluate(() => __special), (await sfx()).includes('Repair Kit')], [false, ['repair-boat'], true]);

  // ---- C03/C04: bảng chọn clip (GridObjectAudio.cs:70-149 + 15 override) ----
  const table = await page.evaluate(() => {
    const f = (ev, id, st) => DRCargo.sfxFor(ev, DR.item(id), st);
    return {
      abPick: f('pick', 'cod-ab-1', 'IN_INVENTORY'), trinketPick: f('pick', 'earring-1', 'IN_INVENTORY'), trinketPlace: f('place', 'earring-1', 'IN_INVENTORY'), trinketDrop: f('drop', 'earring-1'),
      inorgPick: f('pick', 'lumber', 'IN_INVENTORY'), inorgPlace: f('place', 'lumber', 'IN_INVENTORY'), inorgDrop: f('drop', 'lumber'),
      rodInInv: f('pick', 'rod1', 'IN_INVENTORY'), rodInStorage: f('pick', 'rod1', 'IN_STORAGE'), rodPlaceInv: f('place', 'rod1', 'IN_INVENTORY'), rodPlaceStorage: f('place', 'rod1', 'IN_STORAGE'), rodDrop: f('drop', 'rod1'),
      relic1: f('pick', 'relic1'), relic2: f('place', 'relic2'), relic3: f('pick', 'relic3'), relic4: f('place', 'relic4'), relic5: f('pick', 'relic5'),
      dog: f('pick', 'quest-dog'), hermit: f('place', 'quest-hermit'), ice: f('pick', 'quest-ice-stone'), splash: [f('pick', 'dark-splash'), f('place', 'dark-splash'), f('drop', 'dark-splash')],
      rot: [f('pick', 'rot'), f('place', 'rot'), f('drop', 'rot')], kits: [f('drop', 'repair-boat'), f('drop', 'repair-panic'), f('drop', 'repair-pot')]
    };
  });
  eq('dị biến nhặt: Aberration - Pick up', table.abPick, 'ui.grid.pick.aberration');
  eq('trinket: Trinket Item - Pickup / Place / Discard', [table.trinketPick, table.trinketPlace, table.trinketDrop], ['ui.grid.pick.trinket', 'ui.grid.place.trinket', 'ui.grid.discard.trinket']);
  eq('vật liệu: Inorganic Item - Pick up / Place / Drop', [table.inorgPick, table.inorgPlace, table.inorgDrop], ['ui.grid.pick.inorganic', 'ui.grid.place.inorganic', 'ui.grid.drop.inorganic']);
  eq('cần câu: Uninstall khi nhấc khỏi khoang, Inorganic khi nhấc khỏi kho, Install khi đặt vào khoang, Uninstall khi vứt', [table.rodInInv, table.rodInStorage, table.rodPlaceInv, table.rodPlaceStorage, table.rodDrop], ['ui.grid.equip.uninstall', 'ui.grid.pick.inorganic', 'ui.grid.equip.install', 'ui.grid.place.inorganic', 'ui.grid.equip.uninstall']);
  eq('C04 relic 1-5: Key / Musicbox / Ring / Necklance (lỗi chính tả gốc) / Pocketwatch', [table.relic1, table.relic2, table.relic3, table.relic4, table.relic5], ['Relic Key Pickup', 'Relic Musicbox Place', 'Relic Ring Pickup', 'Relic Necklance Place', 'Relic Pocketwatch Pickup']);
  check('C04 chó: một trong Dog - Pick Up 1/2/3', /^Dog - Pick Up [123]$/.test(table.dog), table.dog);
  eq('C04 người, đá băng, vệt đen, Rot, bộ sửa', [table.hermit, table.ice, table.splash, table.rot, table.kits], ['Person - Place', 'Ice Stone - Pick up', ['Dark Splash-001', 'Dark Splash-002', 'Dark Splash-003'], ['Organic Item - Pick up', 'Organic Item - Place', 'Organic Item - Drop'], ['Repair Kit', 'Sanity Kit', 'Crabpot Kit']]);

  // ---- C06 + GR-11: tooltip bẫy cua, gadget, dị biến, tên điên loạn ----
  await page.evaluate(() => { DR_DEBUG.give('pot1', { dur: 3 }); DR_DEBUG.give('gadget-1'); DR_DEBUG.give('cod-ab-1', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); DR_DEBUG.give('relic1'); DRCargo.refresh(); });
  await sleep(100);
  await hoverItem('INVENTORY', 'pot1');
  let tp = (await dbg()).tip || '';
  // pot1: 1/0,66 x 1 = 1,52 mỗi ngày, phần lẻ > 0,1 nên hiện "1 - 2" (TooltipSectionDeployableDetails.cs:118-120)
  check('bẫy cua: Dùng được 3 ngày, Bắt được 1 - 2 mỗi ngày, Sức chứa 3x3, không có Thời gian lắp', /Dùng được:3 ngày/.test(tp) && /Bắt được:1 - 2 mỗi ngày/.test(tp) && /Sức chứa:3x3/.test(tp) && !/Thời gian lắp/.test(tp), tp);
  await hoverItem('INVENTORY', 'gadget-1');
  tp = (await dbg()).tip || '';
  check('gadget: hiệu ứng "Tốc độ rẽ" +25%, Tình trạng, không có Thời gian lắp', /Tốc độ rẽ\+25%/.test(tp) && /Tình trạng:Hoạt động/.test(tp) && !/Thời gian lắp/.test(tp), tp);
  const pAb = await hoverItem('INVENTORY', 'cod-ab-1');
  tp = (await dbg()).tip || '';
  const abCol = await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y).closest('.cg-c').querySelector('.o')).backgroundColor, [pAb.x, pAb.y]);
  check('dị biến: tên All-Seeing Cod, Tình trạng Tươi, nền ô CRITICAL #871d58', /All-Seeing Cod/i.test(tp) && /Tươi/.test(tp) && abCol === 'rgb(135, 29, 88)', tp + ' | ' + abCol);
  await hoverItem('INVENTORY', 'relic1');
  check('relic tỉnh táo: tên Ornate Key, mô tả màu tooltipTextColor #871d58', /ORNATE KEY|Ornate Key/i.test((await dbg()).tip) && await page.evaluate(() => getComputedStyle(document.querySelector('.cg-tip .ds')).color === 'rgb(135, 29, 88)'), (await dbg()).tip);
  await page.evaluate(() => { DR.s.sanity = 0.2; });
  await page.mouse.move(5, 5); await hoverItem('INVENTORY', 'relic1');
  check('relic khi sanity 0,2 <= ngưỡng 0,3: tên điên loạn "Antique Diary Key"', /Antique Diary Key/i.test((await dbg()).tip), (await dbg()).tip);
  await page.evaluate(() => { DR.s.sanity = 1; });
  // cá nhiễm bệnh: hạt bong bóng (C09)
  await page.evaluate(() => { DR_DEBUG.give('cod', { size: 0.5, fresh: DR_CONFIG.maxFreshness, infected: true }); DRCargo.refresh(); });
  await sleep(400);
  const infc = await page.evaluate(() => ({ canvas: document.querySelectorAll('.cg-inf').length, motes: DRCargo._debug().motes, cells: DR.item('cod').dims.length, noTint: !document.querySelector('.cg-c.inf') }));
  check('C09 cá nhiễm bệnh: 1 canvas hạt trên món, có hạt bay (tối đa 3 x ' + infc.cells + ' ô), không còn tô tím', infc.canvas === 1 && infc.motes > 0 && infc.motes <= 3 * infc.cells && infc.noTint, JSON.stringify(infc));
  await hoverItem('INVENTORY', 'cod');
  await shot('4-tooltips');
  await page.evaluate(() => { const g = DR.grid('INVENTORY'); for (const id of ['pot1', 'gadget-1', 'cod-ab-1', 'relic1']) { const i = g.items.find(i => i.id === id); if (i) DRGrid.remove(g, i); } DRCargo.refresh(); });

  // ---- C10: độ tươi về 0 -> Rot (FreshnessCoroutine + ReplaceFishWithRot) ----
  await page.evaluate(() => { const g = DR.grid('INVENTORY'); for (const i of g.items.slice()) if (i.id === 'cod') DRGrid.remove(g, i); DR_DEBUG.give('mackerel', { size: 0.5, fresh: 0.05 }); DRCargo.refresh(); });
  const mkRot = await firstCell('mackerel');
  const rotRes = await page.evaluate(() => { const r = DRCargo.tickFreshness(0.5); return { rotted: r.rotted.map(i => i.id), items: DR.grid('INVENTORY').items.filter(i => i.id === 'rot' || i.id === 'mackerel').map(i => ({ id: i.id, c: i.cells[0] })) }; });
  eq('tickFreshness(0,5 ngày): cá thu (tươi 0,05, mất 2/ngày) thành Rot ở đúng ô gốc', rotRes, { rotted: ['mackerel'], items: [{ id: 'rot', c: mkRot }] });
  // main.js gọi DRCargo.tickFreshness() mỗi khung: chỉ cần đồng hồ trôi, không ai gọi tay
  await page.evaluate(() => { DR_DEBUG.give('cod', { size: 0.5, fresh: 0.05 }); DRCargo.refresh(); });
  await sleep(300);
  await page.evaluate(() => { DR.s.time += 0.5; });
  await sleep(300);
  const selfTick = await page.evaluate(() => DR.grid('INVENTORY').items.filter(i => i.id === 'cod' || i.id === 'rot').map(i => i.id).sort());
  eq('vòng lặp game tự làm ươn: cá tuyết tươi 0,05, đồng hồ +0,5 ngày → Rot', selfTick, ['rot', 'rot']);
  await page.evaluate(() => DRCargo.refresh());
  await hoverItem('INVENTORY', 'rot');
  check('tooltip Rot: tên Rot, prompt Vứt giữ 0,35 s (discardHoldTimeOverride của Rot)', /Rot/i.test((await dbg()).tip) && (await prompts()).some(p => p.id === 'discard' && p.hold === 0.35), (await dbg()).tip);
  await sfx();
  await holdKey('KeyZ', 550);
  eq('vứt Rot: clip override "Organic Item - Drop", cá vứt không tăng (Rot không phải FISH)', [(await sfx()).includes('Organic Item - Drop'), await page.evaluate(() => DR.s.vars['fish-discard-count'])], [true, 1]);
  await page.evaluate(() => { const g = DR.grid('INVENTORY'); for (const i of g.items.slice()) if (i.id === 'rot') DRGrid.remove(g, i); DRCargo.close(); });

  // ---- kho ở bến: hai bảng, C07 chuyển nhanh, C15 ô sáng khi rê ----
  await page.evaluate(() => { DR.give('rod2', null, 'STORAGE'); DR_DEBUG.give('cod', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); });
  await page.evaluate(() => DRCargo.open({ keys: ['INVENTORY', 'STORAGE'], title: 'Kho của tôi' }));
  await sleep(900);
  d = await dbg();
  const l = await page.evaluate(() => { const a = document.querySelector('.cg-left').getBoundingClientRect(), b = document.querySelector('.cg-right').getBoundingClientRect(); return { l: a.left, ar: a.right, bl: b.left }; });
  check('lưới kho ở bảng trái, khoang ở bảng phải', l.l === 0 && l.ar <= l.bl && d.grids.map(q => q.key).sort().join() === 'INVENTORY,STORAGE', JSON.stringify(l));
  await hoverItem('STORAGE', 'rod2');
  const hi = await page.evaluate(() => ({ hi: document.querySelectorAll('#dr-cargo .cg-grid[data-key="INVENTORY"] .ic.hi').length, rodCells: DR.grid('INVENTORY').cells.filter(c => c.sub & DRGrid.SUB.ROD && c.type !== 0).length }));
  eq('C15 rê cần câu trong kho (không cầm): ô ROD của khoang sáng trắng = 7 ô', [hi.hi, hi.rodCells], [7, 7]);
  eq('rê cần câu trong kho ở bến: prompt Nhặt (bấm) + Về khoang (chuột giữa)', (await prompts()).map(p => p.id + ':' + p.bind), ['pickup:lmb', 'discard:KeyZ', 'to-cargo:mmb']);
  await sfx();
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' }); await sleep(150);
  d = await dbg();
  eq('C07 chuột giữa lên cần câu INSTALL trong kho: lên con trỏ (lắp tay), không tự đặt; nguồn STORAGE', [d.held && d.held.id, d.held && d.held.src, await page.evaluate(() => DR.s.grids.INVENTORY.items.some(i => i.id === 'rod2'))], ['rod2', 'STORAGE', false]);
  // StorageModeActionHandler.cs:160-162 đổi state sang IN_INVENTORY rồi mới nhấc, nên GridObjectAudio.IsEquipment(obj) đúng -> clip tháo (quirk gốc)
  eq('nhấc khỏi kho bằng chuột giữa: tiếng "Equipment - Uninstall" (state đã đổi sang khoang trước khi nhấc)', await last(), 'ui.grid.equip.uninstall');
  await page.keyboard.press('Escape'); await sleep(100);
  eq('Esc: cần câu vẫn trong kho', await page.evaluate(() => [DRCargo.isOpen(), DR.s.grids.STORAGE.items.map(i => i.id)]), [true, ['rod2']]);
  await hoverItem('INVENTORY', 'cod');
  await sfx();
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' }); await sleep(150);
  eq('chuột giữa: cá tuyết sang kho, tiếng đặt', [await page.evaluate(() => [DR.s.grids.STORAGE.items.map(i => i.id).sort(), DR.s.grids.INVENTORY.items.some(i => i.id === 'cod')]), (await sfx()).includes('ui.grid.place.organic')], [[['cod', 'rod2'], false], true]);
  await shot('5-storage');
  await page.evaluate(() => DRCargo.close());
  eq('C14 đóng: không phát "Encyclopedia - Close"', (await sfx()).includes('ui.journal.close'), false);

  // ---- lưới nộp đồ của nâng cấp tier-1-engines-1 (QuestGridPanel / UpgradeGridPanel) ----
  await page.evaluate(() => { DR_DEBUG.give('lumber'); DR_DEBUG.give('scrap'); DR_DEBUG.give('scrap'); DR.s.funds = 500; window.__bought = 0; window.__qres = null; });
  const openQuest = () => page.evaluate(() => DRCargo.open({
    right: { tabs: ['INVENTORY'] },
    left: { kind: 'quest', quest: DR_UPGRADES['tier-1-engines-1'].questGrid, subtitle: 'Sửa 2 ô khoang để chứa thêm động cơ.',
      footer: { buttons: [{ id: 'buy', label: 'Mua nâng cấp [$100.00]', enabled: c => c.left.complete && !c.held && c.funds >= 100, run: () => { window.__bought++; } }] } },
    onClose: r => { window.__qres = r; }
  }));
  await openQuest();
  await sleep(1300);
  const q0 = await page.evaluate(() => ({
    hints: document.querySelectorAll('.cg-hint').length, name: document.querySelector('.cg-name').textContent, help: document.querySelector('.cg-help .tx').textContent,
    done: !!document.querySelector('[data-act="done"]'), buy: document.querySelector('[data-act="buy"]').disabled, mode: DRCargo._debug().mode, key: DRCargo._debug().grids.map(g => g.key + ':' + g.st).sort(),
    cells: document.querySelectorAll('.cg-grid[data-key="UPGRADE_T1_ENGINES_1"] .cg-c').length, saved: !!DR.s.grids.UPGRADE_T1_ENGINES_1
  }));
  eq('lưới nộp: 3 bóng mờ (presetGrid SILHOUETTE), tên "Materials Required", nhắc REVISITABLE, nút Xong, nút Mua tắt, không có chế độ lắp (allowEquipmentInstallation 0), 11 ô (3x4 trừ ô ẩn), lưu DR.s.grids',
    q0, { hints: 3, name: 'Materials Required', help: 'Bạn có thể quay lại lấy những món này sau.', done: true, buy: true, mode: 'default', key: ['INVENTORY:IN_INVENTORY', 'UPGRADE_T1_ENGINES_1:IN_QUEST_GRID'], cells: 11, saved: true });
  await hoverItem('INVENTORY', 'lumber');
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  for (let i = 0; i < 4 && (await dbg()).held.rot !== 270; i++) await rightClick();   // gỗ tự xếp có thể đã xoay sẵn
  eq('cầm gỗ xoay 270 (như bóng mờ)', (await dbg()).held && (await dbg()).held.rot, 270);
  let pq = await fpPx('UPGRADE_T1_ENGINES_1', 'lumber', 2, 1, 270);
  await page.mouse.move(pq.x, pq.y, { steps: 5 }); await sleep(120);
  eq('rê gỗ lên lưới nộp ô (2,1): xanh, prompt Đặt (canAddItemsInQuestMode)', [(await dbg()).cand && (await dbg()).cand.state, (await prompts()).some(p => p.id === 'place')], ['ok', true]);
  await page.mouse.down(); await page.mouse.up(); await sleep(120);
  eq('gỗ vào lưới nộp, chưa đủ điều kiện (thiếu 2 sắt vụn)', [await page.evaluate(() => DR.s.grids.UPGRADE_T1_ENGINES_1.items.map(i => [i.id, i.x, i.y, i.rot])), (await dbg()).complete], [[['lumber', 2, 1, 270]], false]);
  for (const y of [0, 2]) {
    await hoverItem('INVENTORY', 'scrap');
    await page.mouse.down(); await page.mouse.up(); await sleep(80);
    pq = await fpPx('UPGRADE_T1_ENGINES_1', 'scrap', 0, y, 0);
    await page.mouse.move(pq.x, pq.y, { steps: 5 }); await sleep(100);
    await page.mouse.down(); await page.mouse.up(); await sleep(120);
  }
  const q1 = await page.evaluate(() => ({ items: DR.s.grids.UPGRADE_T1_ENGINES_1.items.map(i => i.id).sort(), complete: DRCargo._debug().complete, buy: document.querySelector('[data-act="buy"]').disabled, hints: document.querySelectorAll('.cg-hint').length, inv: DR.s.grids.INVENTORY.items.some(i => i.id === 'lumber' || i.id === 'scrap') }));
  eq('đủ 1 gỗ + 2 sắt: completeConditions đạt, nút Mua bật, bóng mờ ẩn, khoang hết vật liệu', q1, { items: ['lumber', 'scrap', 'scrap'], complete: true, buy: false, hints: 0, inv: false });
  await shot('6-quest-grid');
  await page.click('[data-act="buy"]'); await sleep(80);
  await page.click('[data-act="done"]'); await sleep(200);
  eq('bấm Mua rồi Xong: run() chạy, đóng, onClose báo complete', [await page.evaluate(() => __bought), await page.evaluate(() => DRCargo.isOpen()), await page.evaluate(() => __qres && __qres.complete)], [1, false, true]);
  await openQuest(); await sleep(500);
  eq('mở lại: lưới REVISITABLE giữ 3 món đã nộp', await page.evaluate(() => DR.s.grids.UPGRADE_T1_ENGINES_1.items.length), 3);
  await page.keyboard.press('Escape'); await sleep(150);
  eq('Esc ở lưới nộp = Xong', await page.evaluate(() => DRCargo.isOpen()), false);

  // ---- mua / bán qua handler (API của chủ cửa hàng, không ship): Buy/Sell/Refund/Sell All ----
  await page.evaluate(() => {
    window.__shop = DRGrid.create(DR_GRIDS.Shop_Rods);
    DRGrid.place(__shop, DR.item('rod2'), 0, 0, 0);
    DR_DEBUG.give('cod', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); DR_DEBUG.give('mackerel', { size: 0.5, fresh: DR_CONFIG.maxFreshness });
    DRCargo.open({
      right: { tabs: ['INVENTORY'] }, mode: 'equip',
      left: { kind: 'shop', title: 'Xưởng tàu', tabs: [{ key: 'Shop_Rods', title: 'Cần', grid: __shop }], handler: {
        prompts(c) {
          const out = [];
          if (c.hovered && c.hovered.inst && c.hovered.st === 'IN_SHOP') {
            const inst = c.hovered.inst, def = c.hovered.def, price = DRRules.buyPrice(def, 1);
            out.push({ id: 'buy', bind: 'lmb', label: 'Mua', price, enabled: c.funds >= price, run: cc => { DR.addFunds(-price); DRGrid.remove(__shop, inst); cc.take(inst, 'buy'); } });
          }
          if (c.held && c.held.src === 'buy') {
            const def = c.held.def, price = DRRules.buyPrice(def, 1);
            out.push({ id: 'refund', bind: 'btn', area: 'control', label: 'Hoàn tiền', price, enabled: true, run: cc => { DR.addFunds(price); DRGrid.place(__shop, def, 0, 0, 0); cc.drop(); } });
          }
          if (c.hovered && c.hovered.inst && c.hovered.st === 'IN_INVENTORY' && DRGrid.subOf(c.hovered.def) === DRGrid.SUB.FISH) {
            const inst = c.hovered.inst, price = DRRules.sellPrice(DR_CONFIG, c.hovered.def, inst, 1, 1);
            out.push({ id: 'sell', bind: 'lmb', label: 'Bán', price, enabled: true, run: () => { DRGrid.remove(DR.grid('INVENTORY'), inst); DR.addFunds(price); } });
          }
          const fish = DR.grid('INVENTORY').items.filter(i => DRGrid.subOf(DR.item(i.id)) === DRGrid.SUB.FISH);
          const total = fish.reduce((s, i) => s + DRRules.sellPrice(DR_CONFIG, DR.item(i.id), i, 1, 1), 0);
          out.push({ id: 'sell-all', bind: 'btn', area: 'control', hold: 0.5, label: 'Bán hết cá', price: Math.round(total * 100) / 100, enabled: fish.length > 0, run: () => { for (const i of fish) DRGrid.remove(DR.grid('INVENTORY'), i); DR.addFunds(total); } });
          return out;
        }
      } }
    });
  });
  await sleep(900);
  const f0 = await page.evaluate(() => DR.s.funds);
  await hoverItem('Shop_Rods', 'rod2');
  eq('rê cần trong cửa hàng: prompt Mua [$150.00] thay cho Nhặt', (await prompts()).filter(p => p.bind === 'lmb').map(p => p.label), ['Mua [$150.00]']);
  await page.mouse.down(); await page.mouse.up(); await sleep(100);
  d = await dbg();
  eq('bấm Mua: trừ $150, cần lên con trỏ (JUST_PURCHASED), nút Hoàn tiền ở vùng điều khiển (cạnh Bán hết cá của handler)', [f0 - await page.evaluate(() => DR.s.funds), d.held && d.held.src, d.held && d.held.st, await page.evaluate(() => Array.from(document.querySelectorAll('.cg-ctl .cg-btn')).map(b => b.childNodes[0].textContent))], [150, 'buy', 'JUST_PURCHASED', ['Hoàn tiền [$150.00]', 'Bán hết cá [$28.00]']]);
  await page.evaluate(() => __pass.splice(0));
  const pRod = await fpPx('INVENTORY', 'rod2', 0, 3, 0);
  await page.mouse.move(pRod.x, pRod.y, { steps: 5 }); await sleep(120);
  eq('rê cần mua lên ô ROD (0,3): Lắp [3h] giữ 0,6 s (rod2 chiếm 3 ô chữ L)', (await prompts()).filter(p => p.id === 'install').map(p => p.label + ':' + p.enabled), ['Lắp [3h]:true']);
  await holdMouse(pRod, 800);
  eq('lắp cần đã mua: vào khoang (0,3), trôi 3 giờ INSTALL', [await page.evaluate(() => { const i = DR.grid('INVENTORY').items.find(i => i.id === 'rod2'); return i && [i.x, i.y]; }), await page.evaluate(() => __pass)], [[0, 3], [[3, 'INSTALL']]]);
  await page.waitForFunction(() => !DRSky.forced, null, { timeout: 8000 }).catch(() => {});
  const f1 = await page.evaluate(() => DR.s.funds);
  await hoverItem('INVENTORY', 'cod');
  const sellP = (await prompts()).find(p => p.id === 'sell');
  check('rê cá ở cửa hàng: prompt Bán [$giá] (SellModeActionHandler)', sellP && /^Bán \[\$\d+\.\d\d\]$/.test(sellP.label), sellP && sellP.label);
  const sellPrice = sellP ? parseFloat(sellP.label.replace(/^.*\[\$/, '')) : NaN;
  await page.mouse.down(); await page.mouse.up(); await sleep(100);
  check('bấm Bán: cá tuyết biến mất, tiền tăng đúng giá trên nhãn', !(await inv()).some(i => i.id === 'cod') && Math.abs((await page.evaluate(() => DR.s.funds)) - f1 - sellPrice) < 0.011, 'tiền +' + ((await page.evaluate(() => DR.s.funds)) - f1).toFixed(2) + ', nhãn ' + sellPrice);
  const f2 = await page.evaluate(() => DR.s.funds);
  const btn = await page.evaluate(() => { const b = document.querySelector('.cg-ctl [data-act="sell-all"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.textContent, disabled: b.disabled }; });
  check('vùng điều khiển: nút "Bán hết cá [$x]" giữ 0,5 s đang bật', !btn.disabled && /^Bán hết cá \[\$/.test(btn.label), btn.label);
  await holdMouse(btn, 200);
  check('giữ 0,2 s: chưa bán', (await inv()).some(i => i.id === 'mackerel'));
  await holdMouse(btn, 700);
  check('giữ 0,7 s: bán hết cá, tiền tăng', !(await inv()).some(i => i.id === 'mackerel') && (await page.evaluate(() => DR.s.funds)) > f2, 'tiền ' + f2 + ' -> ' + await page.evaluate(() => DR.s.funds));
  await shot('7-shop-api');
  await page.evaluate(() => DRCargo.close());

  // ---- câu cá: khoang docked cạnh bảng câu + con cá vừa bắt trên con trỏ + khay tạm (C01/C02 phía khoang) ----
  await page.evaluate(() => { DR.setMode('sail'); DR.setMode('harvest'); window.__placed = null; window.__disc = null; });
  await page.waitForFunction(() => DR.mode === 'harvest');
  const openHarvest = id => page.evaluate(id => DRCargo.open({
    right: { tabs: ['INVENTORY'] }, docked: true, left: { kind: 'tray' },
    holding: { inst: { id, size: 0.9, fresh: DR_CONFIG.maxFreshness }, src: 'harvest', onPlaced: (i, k) => { window.__placed = [i.id, k]; }, onDiscarded: i => { window.__disc = i.id; } }
  }), id);
  await openHarvest('mackerel');
  await sleep(900);
  d = await dbg();
  const dk = await page.evaluate(() => ({ docked: document.querySelector('#dr-cargo').classList.contains('docked'), bg: getComputedStyle(document.querySelector('#dr-cargo')).backgroundColor, tray: !!document.querySelector('.cg-tray.on'), mode: DR.mode, handle: getComputedStyle(document.querySelector('.cg-handle')).display }));
  eq('docked: không che màn, không đổi DR.mode (harvest), cầm cá vừa bắt (BEING_HARVESTED), khay tạm trượt xuống', [dk.docked, dk.bg === 'rgba(0, 0, 0, 0)', dk.mode, d.held && d.held.st, dk.tray, d.leftKind], [true, true, 'harvest', 'BEING_HARVESTED', true, 'tray']);
  const tray = d.grids.find(g => g.key === 'STORAGE_TRAY');
  check('khay tạm 6x3 nằm dưới bảng câu bên trái (dưới 60% chiều cao, nửa trái màn)', tray && tray.cols === 6 && tray.rows === 3 && tray.y > H * 0.55 && tray.x + tray.w < W * 0.5, JSON.stringify(tray && { x: tray.x, y: tray.y, w: tray.w, h: tray.h }));
  await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await sleep(100);
  eq('Esc/Tab khi docked: không đóng', await page.evaluate(() => DRCargo.isOpen()), true);
  eq('cá vừa bắt: prompt Vứt luôn có (BEING_HARVESTED)', (await prompts()).some(p => p.id === 'discard'), true);
  await shot('8-harvest-docked');
  await holdKey('KeyZ', 950);
  eq('giữ Z: onDiscarded(cá thu), bảng vẫn mở, cá vứt = 2', [await page.evaluate(() => __disc), await page.evaluate(() => DRCargo.isOpen()), await page.evaluate(() => DR.s.vars['fish-discard-count'])], ['mackerel', true, 2]);
  await openHarvest('cod');
  await sleep(600);
  const pTray = await fpPx('STORAGE_TRAY', 'cod', 0, 0, 0);
  await page.mouse.move(pTray.x, pTray.y, { steps: 5 }); await sleep(120);
  eq('rê cá lên khay: xanh (khay nhận FISH), prompt Đặt', [(await dbg()).cand && (await dbg()).cand.key, (await dbg()).cand && (await dbg()).cand.state], ['STORAGE_TRAY', 'ok']);
  await page.mouse.down(); await page.mouse.up(); await sleep(150);
  eq('đặt vào khay: onPlaced(cod, STORAGE_TRAY), hết cầm, nhắc "Đồ để lại đây sẽ mất." hiện', [await page.evaluate(() => __placed), (await dbg()).held, await page.evaluate(() => !!document.querySelector('.cg-trayhelp.on'))], [['cod', 'STORAGE_TRAY'], null, true]);
  await shot('9-tray');
  await page.evaluate(() => DRCargo.close());
  eq('rời điểm câu: khay huỷ, cá trong khay tính là vứt (3), không vào khoang', [await page.evaluate(() => DR.s.vars['fish-discard-count']), (await inv()).some(i => i.id === 'cod')], [3, false]);
  await openHarvest('cod'); await sleep(300);
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(100);
  eq('đổi chế độ khi docked: bảng tự đóng', await page.evaluate(() => DRCargo.isOpen()), false);

  // ---- đồ lắp bị khoá khi ở biển, mở bằng Tab ----
  await page.keyboard.press('Tab'); await sleep(900);
  check('Tab mở khoang khi đang lái, chế độ chuyển cargo', await page.evaluate(() => DRCargo.isOpen() && DR.mode === 'cargo'));
  check('ở biển: không có biểu tượng ô thiết bị (GridCell.ShouldShowItemTypes)', await page.evaluate(() => document.querySelectorAll('#dr-cargo .cg-c .ic').length) === 0);
  const rod = (await inv()).find(i => i.id === 'rod1');
  await hoverItem('INVENTORY', 'rod1');
  eq('ở biển: rê cần câu không có prompt Nhặt/Tháo', (await prompts()).some(p => p.bind === 'lmb'), false);
  await page.mouse.down(); await page.mouse.up(); await sleep(80);
  eq('bấm cần câu ở biển: không nhặt được (INSTALL chỉ khi cập bến)', (await dbg()).held, null);
  eq('cần câu vẫn ở chỗ cũ', JSON.stringify((await inv()).find(i => i.id === 'rod1')), JSON.stringify(rod));
  await page.keyboard.press('Tab'); await sleep(300);
  check('Tab đóng, trả về chế độ lái', await page.evaluate(() => !DRCargo.isOpen() && DR.mode === 'sail'));
  await page.evaluate(() => DR.setMode('dock'));

  // ---- con cá vừa câu (dạng cũ: holding = instance): phải đặt hoặc vứt mới đóng được ----
  const res = await page.evaluate(() => new Promise(r => {
    const inst = { id: 'mackerel', size: 0.9, fresh: DR_CONFIG.maxFreshness, rot: 0 };
    window.__closed = null;
    DRCargo.open({ keys: ['INVENTORY'], holding: inst, onClose: x => { window.__closed = x; } });
    setTimeout(() => r(DRCargo._debug().held), 300);
  }));
  eq('mở với holding (dạng cũ): đang cầm đồ vừa bắt', [res.id, res.src], ['mackerel', 'harvest']);
  await page.keyboard.press('Escape'); await sleep(100);
  check('Esc khi đang cầm đồ mới: không đóng', await page.evaluate(() => DRCargo.isOpen()));
  const free2 = await page.evaluate(() => { const g = DR.grid('INVENTORY'), def = DR.item('mackerel'); for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (DRGrid.canPlace(g, def, x, y, 0)) return { x, y }; return null; });
  const pm = await fpPx('INVENTORY', 'mackerel', free2.x, free2.y, 0);
  await page.mouse.move(pm.x, pm.y, { steps: 5 }); await sleep(100);
  await page.mouse.down(); await page.mouse.up(); await sleep(150);
  check('đặt con cá mới vào chỗ trống', (await inv()).some(i => i.id === 'mackerel' && i.x === free2.x && i.y === free2.y));
  await page.keyboard.press('Escape'); await sleep(200);
  eq('đóng được, onClose báo đã đặt', await page.evaluate(() => [DRCargo.isOpen(), window.__closed && window.__closed.holding]), [false, 'placed']);

  // ---- hiệu năng + lỗi ----
  const perf = await page.evaluate(() => DR_DEBUG.perf());
  out.push('  · khung: avg ' + perf.avgMs.toFixed(2) + ' ms, cpu ' + perf.cpuMs.toFixed(2) + ' ms (' + perf.calls + ' lệnh vẽ)');
  const mine = errors.filter(e => /cargo|grid\.js|pageerror: .*(DRCargo|DRGrid|cg-)/i.test(e)), others = errors.filter(e => !mine.includes(e));
  eq('không có pageerror / lỗi console / HTTP >= 400 từ cargo.js, grid.js, cargo.css, art/ui/cargo', mine, []);
  if (others.length) out.push('  · ' + others.length + ' lỗi ngoài phạm vi cargo (luồng khác): ' + [...new Set(others.map(e => e.slice(0, 110).replace(/\s+/g, ' ')))].slice(0, 3).join(' | '));
  await page.close();
}

// Cỡ 1920x1080: chụp hai màn để ghép cạnh ảnh gốc (gog_04 câu cá + khoang; gog_31 lưới nhiệm vụ + khoang + tooltip)
async function shots(browser, base) {
  const W = 1920, H = 1080, tag = W + 'x' + H;
  out.push('\n[' + tag + ' ảnh ghép]');
  const { page, errors } = await boot(browser, base, W, H);
  await page.evaluate(() => { DR_DEBUG.give('cod', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); DR_DEBUG.give('light1'); DR.give('rod2', null, 'STORAGE'); DR.s.funds = 208.71; });
  // câu cá: bảng câu trái + khoang phải cầm cá (gog_04)
  // bảng câu bên trái là của nhánh câu cá (F2): ở đây chỉ có khoang docked + khay, nên nửa trái ảnh ghép còn trống
  await page.evaluate(() => { DR.setMode('sail'); DR.setMode('harvest'); });
  await page.evaluate(() => DRCargo.open({ right: { tabs: ['INVENTORY'] }, docked: true, left: { kind: 'tray' }, holding: { inst: { id: 'mackerel', size: 0.6, fresh: DR_CONFIG.maxFreshness }, src: 'harvest' } }));
  await sleep(1200);
  await page.mouse.move(W * 0.5, H * 0.5, { steps: 3 }); await sleep(100);
  const fishing = path.join(SHOTS, tag + '-fishing.png');
  await page.screenshot({ path: fishing });
  check('1920x1080 câu cá: khoang docked bên phải, cầm cá', await page.evaluate(() => DRCargo.isOpen() && !!DRCargo._debug().held && DR.mode === 'harvest'));
  await page.evaluate(() => { DR.setMode('sail'); DR.setMode('dock'); });   // rời điểm câu: bảng docked tự đóng
  await sleep(200);
  // lưới nhiệm vụ "Collect Item" (BuilderPickup kiểu CREATE) + khoang + tooltip động cơ (gog_30/31); đợi hàng giúp đỡ trượt xong (1 s + 0,75 s)
  await page.evaluate(() => DRCargo.open({ right: { tabs: ['INVENTORY'] }, left: { kind: 'quest', quest: DR_QUESTS.QuestGridConfig.BuilderPickup, title: 'Collect Item' } }));
  await sleep(2200);
  const d = await page.evaluate(() => DRCargo._debug());
  const g = d.grids.find(q => q.key === 'INVENTORY'), eng = g.items.find(i => i.id === 'engine1');
  await page.mouse.move(g.x + (eng.x + 0.5) * d.cs, g.y + (eng.y + 1) * d.cs, { steps: 4 }); await sleep(500);
  const quest = path.join(SHOTS, tag + '-quest.png');
  await page.screenshot({ path: quest });
  check('1920x1080 lưới nhiệm vụ: bảng trái CREATE có người thợ, tooltip động cơ', await page.evaluate(() => !!document.querySelector('.cg-left.cg-quest') && /Thời gian lắp/.test(DRCargo._debug().tip || '')));
  await page.evaluate(() => DRCargo.close());
  const mine = errors.filter(e => /cargo|grid\.js|pageerror: .*(DRCargo|DRGrid|cg-)/i.test(e));
  eq('1920x1080: không lỗi từ cargo', mine, []);
  await page.close();
  for (const [web, real, name] of [[fishing, 'gog_04.jpg', 'sbs-fishing'], [quest, 'gog_31.jpg', 'sbs-quest']]) {
    const rp = path.join(REAL, real), op = path.join(SHOTS, name + '.png');
    if (!fs.existsSync(rp) || !fs.existsSync(SBS)) { out.push('  · bỏ qua ' + name + ': thiếu ' + (fs.existsSync(rp) ? SBS : rp)); continue; }
    // python -I trước; Store Python 3.12 không thấy PIL ở user-site khi -I, khi đó chạy lại không -I (sbs.py là công cụ trong kho tham chiếu)
    let r = null;
    for (const args of [['-I', SBS, web, rp, op], [SBS, web, rp, op]]) {
      r = cp.spawnSync(process.env.DR_PYTHON || 'python', args, { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
      if (r.status === 0) break;
    }
    check('ảnh ghép ' + name + ' -> ' + op, r.status === 0 && fs.existsSync(op), (r.stderr || '').trim().slice(0, 200));
  }
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
    await shots(browser, base);
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
