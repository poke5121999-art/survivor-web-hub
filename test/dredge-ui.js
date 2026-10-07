/*
 * DREDGE — kiểm lớp UI (HUD, sáu minigame, khoang, bến) trên games/dredge/ui-dev.html.
 *
 * Chạy:  node test/dredge-ui.js
 * Ảnh ra %TEMP%/dredge-ui-shots. Chạy ở 1280x720 và 844x390.
 * Minigame được thắng bằng bot trong trang: đọc DRMinigame._debug() (hình học mục tiêu và kim) rồi gửi phím Space thật.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-ui-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webp': 'image/webp',
  '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// Bot chạy trong trang: mỗi khung hình đọc hình học rồi nhấn Space đúng lúc. only = 'special' thì chỉ nhắm mục tiêu cúp.
const BOT = `window.__bot = function (opts) {
  opts = opts || {};
  return new Promise(res => {
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    const ad = (a, b) => { const d = (((a - b) % 360) + 360) % 360; return d > 180 ? d - 360 : d; };
    const t0 = performance.now(); let lastPress = 0, presses = 0;
    function danger(d, lane) {
      const look = d.speed * 0.3;
      return d.obstacles.some(o => o.lane === lane && (((o.c - d.angle) % 360 + 360) % 360 < look + o.w / 2 || ((d.angle - o.c) % 360 + 360) % 360 < o.w / 2 + 4));
    }
    function step() {
      const d = DRMinigame._debug();
      if (!d) return res({ presses });
      if (performance.now() - t0 > 60000) return res({ timeout: true, presses });
      requestAnimationFrame(step);
      if (d.done || d.locked > 0 || opts.idle) return;
      let go = false;
      // only:'special' chỉ nhắm cúp; fill:true cho phép bấm mục tiêu thường khi tiến độ còn thấp (cúp ở con lắc/bóng/kim cương chỉ hiện sau vài lần trúng).
      const ok = sp => !opts.only || sp || (opts.fill && d.progress < 0.7);
      switch (d.type) {
        case 'FISHING_RADIAL': go = d.targets.some(t => !t.gone && !t.hit && ok(t.special) && Math.abs(ad(d.angle, t.c)) < t.w * 0.3); break;
        case 'FISHING_PENDULUM': { const t = d.targets[d.active]; go = !d.used && ok(t.special) && Math.abs(d.angle - t.c) < t.w * 0.3; break; }
        case 'FISHING_BALL_CATCHER': { const z = d.balls.filter(b => Math.abs(b.phi) < d.zone * 0.3); go = z.length > 0 && !z.some(b => b.type === 'OBSTACLE') && ok(z.some(b => b.type === 'SPECIAL')); break; }
        case 'FISHING_DIAMOND': go = d.targets.some(t => t.s > d.min + 0.05 && t.s < d.max - 0.05 && ok(t.special)); break;
        case 'FISHING_SPIRAL': go = d.gates.some(g => g.on && ok(g.special)); break;
        case 'DREDGE_RADIAL': go = performance.now() - lastPress > 250 && danger(d, d.lane) && !danger(d, 1 - d.lane); break;
      }
      if (go) { press(); lastPress = performance.now(); presses++; }
    }
    step();
  });
};`;

async function run(browser, base, W, H, full) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  await page.goto(base + '/games/dredge/ui-dev.html');
  await page.waitForFunction(() => window.DEV && window.DRMinigame && window.DRCargo && window.DRDock && window.DRHud);
  await page.evaluate(BOT);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await sleep(500);

  // ------------------------------------------------------------ HUD
  const txt = sel => page.textContent(sel);
  check('HUD hiện ngày và giờ từ DR.s.time (ngày 2, 12:00)', (await txt('.hud-wheel .day')) === 'Ngày 2' && (await txt('.hud-wheel .clock')) === '12:00');
  check('HUD hiện tiền', (await txt('.hud-funds span')) === '$120.00', await txt('.hud-funds span'));
  check('HUD hiện độ sâu và tên vùng', (await txt('.hud-depth .v')) === '18 m' && (await txt('.hud-zone')) === 'The Marrows');
  check('HUD hiện gợi ý "Câu cá — Space" kèm mức cá', (await txt('.hud-prompt b')) === 'Câu cá — Space' && /Cá vừa phải/.test(await txt('.hud-prompt span')));
  await shot('1-hud');
  for (const [status, msg] of [['need_rod', 'Cần cần câu'], ['no_equipment', 'Cần loại cần câu khác'], ['wrong_time', 'Không có cá giờ này'], ['no_stock', 'Hết cá']]) {
    await page.evaluate(s => DEV.setView({ nearSpot: { id: 's', name: 'Spot', status: s, stock: 0, maxStock: 5 } }), status);
    await sleep(80);
    check('gợi ý trạng thái ' + status, (await txt('.hud-prompt b')) === msg, await txt('.hud-prompt b'));
  }
  await page.evaluate(() => DEV.setView({ nearSpot: null, nearDock: { id: 'dock.greater-marrow', name: 'Greater Marrow' } }));
  await sleep(80);
  check('gợi ý "Cập bến — Space"', (await txt('.hud-prompt b')) === 'Cập bến — Space');
  await shot('2-hud-dock-prompt');
  await page.evaluate(() => { DEV.setView({ nearDock: null, nearSpot: { id: 's', name: 'Disturbed Water', status: 'ok', stock: 4, maxStock: 5 } }); DR.s.sanity = 0.1; DRGrid.addDamage(DR.grid('INVENTORY'), DR_ITEMS, true); DRHud.toast('Thử thông báo: đã cất cá vào khoang'); });
  await sleep(700);
  check('mắt hoảng loạn ở bậc 4', (await page.getAttribute('.hud-eye', 'data-stage')) === '4');
  check('thân tàu có đúng 1 ô hỏng', (await page.locator('.hud-hull i.bad').count()) === 1, (await page.locator('.hud-hull i').count()) + ' ô');
  check('thông báo nổi hiện chữ', /đã cất cá/.test(await txt('.hud-toasts')));
  await shot('3-hud-panic-damage-toast');
  await page.evaluate(() => { DR.s.sanity = 1; });

  // ------------------------------------------------------------ minigame
  const TYPES = ['FISHING_RADIAL', 'FISHING_PENDULUM', 'FISHING_BALL_CATCHER', 'FISHING_DIAMOND', 'FISHING_SPIRAL', 'DREDGE_RADIAL'];
  const DIFFS = full ? ['VERY_EASY', 'MEDIUM', 'VERY_HARD'] : ['MEDIUM'];
  for (const type of TYPES) for (const diff of DIFFS) {
    await page.evaluate(([t, d]) => { DEV.result = null; DEV.mg(t, d); }, [type, diff]);
    check(type + ' ' + diff + ': mở được, isOpen()', await page.evaluate(() => DRMinigame.isOpen()));
    if (diff === 'MEDIUM') {
      await sleep(1100);
      await shot('4-mg-' + type.toLowerCase().replace('fishing_', ''));
    }
    const t0 = Date.now();
    const res = await page.evaluate(() => __bot());
    const r = await page.evaluate(() => DEV.result);
    check(type + ' ' + diff + ': thắng bằng bấm đúng lúc', r && r.caught === true && r.aborted === false && !res.timeout,
      JSON.stringify(r) + ' ' + res.presses + ' lần bấm, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  // Cúp: bot chỉ bấm vào mục tiêu cúp thì phải ra trophy:true (xoắn ốc / con lắc / bóng / kim cương đều có đường riêng).
  for (const type of ['FISHING_RADIAL', 'FISHING_PENDULUM', 'FISHING_BALL_CATCHER', 'FISHING_DIAMOND', 'FISHING_SPIRAL']) {
    if (!full && type !== 'FISHING_RADIAL') continue;
    // Tốc độ cần 0.3 để mấy lần trúng thường chưa kịp làm đầy thanh trước khi cúp xuất hiện.
    await page.evaluate(t => { DEV.result = null; DEV.mg(t, 'VERY_HARD', { trophy: true, speed: 0.3 }); }, type);
    const res = await page.evaluate(() => __bot({ only: 'special', fill: true }));
    const r = await page.evaluate(() => DEV.result);
    check(type + ' có cúp: trúng mục tiêu cúp thì bắt ngay, trophy:true', r && r.caught && r.trophy === true && !res.timeout, JSON.stringify(r) + ' ' + res.presses + ' lần bấm');
  }
  // Nạo vét không bấm gì vẫn xong nhờ tiến độ thụ động (5 s ở VERY_EASY), và có phạt khi va vật cản.
  await page.evaluate(() => { DEV.result = null; DEV.mg('DREDGE_RADIAL', 'VERY_EASY'); });
  await page.evaluate(() => __bot({ idle: true }));
  check('nạo vét: không bấm vẫn bắt được nhờ tiến độ thụ động', (await page.evaluate(() => DEV.result)).caught === true);
  // Esc = bỏ
  await page.evaluate(() => { DEV.result = null; DEV.mg('FISHING_RADIAL', 'MEDIUM'); });
  await page.keyboard.press('Escape');
  const ab = await page.evaluate(() => DEV.result);
  check('Esc bỏ minigame: aborted:true', ab && ab.aborted === true && ab.caught === false && !(await page.evaluate(() => DRMinigame.isOpen())), JSON.stringify(ab));
  // Chuột trái = hành động: bấm vào canvas lúc kim ở vùng chết (đầu vòng) là trượt, thanh tiến độ không được tăng.
  await page.evaluate(() => { DEV.result = null; DEV.mg('FISHING_RADIAL', 'VERY_EASY'); });
  await page.mouse.click(W / 2, H / 2);
  const afterClick = await page.evaluate(() => DRMinigame._debug());
  check('bấm chuột vào canvas được tính là hành động (trượt ở vùng chết: bị khoá tạm)', afterClick.locked > 0 || afterClick.targets.some(t => t.hit), JSON.stringify({ locked: afterClick.locked, angle: afterClick.angle }));
  await page.evaluate(() => DRMinigame.close());

  // ------------------------------------------------------------ cargo
  await page.evaluate(() => DEV.cargo(true));
  await sleep(300);
  let dbg = await page.evaluate(() => DRCargo._debug());
  check('khoang mở với con cá đang cầm', dbg && dbg.held && dbg.held.id === 'cod' && dbg.held.src === null, JSON.stringify(dbg && dbg.held));
  check('chế độ chuyển sang cargo', (await page.evaluate(() => DR.mode)) === 'cargo');
  const locked = await page.locator('.dc-item.locked').count();
  check('đồ lắp (cần câu, động cơ) có khoá khi đang lái thuyền', locked >= 2, locked + ' món khoá');
  await shot('5-cargo-holding');
  await page.keyboard.press('Escape');
  check('chưa đặt con cá thì không đóng được', await page.evaluate(() => DRCargo.isOpen()));
  await page.keyboard.press('KeyR');
  check('phím R xoay món đang cầm 90 độ', (await page.evaluate(() => DRCargo._debug().held.rot)) === 90);
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyR');
  // Tính ô đích bằng DRGrid rồi đổi ra toạ độ chuột.
  const pxFor = (opts) => page.evaluate(o => {
    const dbg = DRCargo._debug(), G = DRGrid, def = DR.item(o.id), cs = dbg.cs;
    const gr = dbg.grids.find(g => g.key === (o.key || 'INVENTORY')), g = DR.grid(gr.key);
    const spots = [];
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (G.canPlace(g, def, x, y, o.rot, o.ignore ? g.items.find(i => i.id === o.id) : null)) spots.push({ x, y });
    if (!spots.length) return null;
    const s = o.last ? spots[spots.length - 1] : spots[0];
    const fp = G.footprint(def, s.x, s.y, o.rot);
    const x0 = Math.min(...fp.map(c => c[0])), x1 = Math.max(...fp.map(c => c[0])), y0 = Math.min(...fp.map(c => c[1])), y1 = Math.max(...fp.map(c => c[1]));
    return { px: gr.x + (x0 + (x1 - x0 + 1) / 2) * cs, py: gr.y + (y0 + (y1 - y0 + 1) / 2) * cs, cell: s };
  }, opts);
  const tgt = await pxFor({ id: 'cod', rot: 0 });
  check('khoang còn chỗ cho con cá', !!tgt);
  await page.mouse.move(W / 2, H / 2);
  await page.mouse.move(tgt.px, tgt.py, { steps: 6 });
  await sleep(100);
  const okPv = await page.locator('.dc-cell.pv.ok').count(), badPv = await page.locator('.dc-cell.pv.bad').count();
  check('xem trước xanh khi ô hợp lệ (3 ô của con cá)', okPv === 3 && badPv === 0, okPv + ' xanh, ' + badPv + ' đỏ');
  await shot('6-cargo-preview-ok');
  await page.mouse.down(); await page.mouse.up();
  await sleep(150);
  const placed = await page.evaluate(() => DR.grid('INVENTORY').items.filter(i => i.id === 'cod').map(i => ({ x: i.x, y: i.y, rot: i.rot })));
  check('đặt con cá cầm trên tay vào INVENTORY', placed.length === 1 && placed[0].x === tgt.cell.x && placed[0].y === tgt.cell.y, JSON.stringify(placed));
  check('đặt xong không còn cầm gì', (await page.evaluate(() => DRCargo._debug().held)) === null);
  await shot('7-cargo-placed');

  // Kéo thả thật: nhấc cod sang ô trống cuối, kiểm chuyển chỗ; thả vào chỗ sai thì về chỗ cũ.
  const cod0 = placed[0];
  const rect = await page.evaluate(() => { const e = [...document.querySelectorAll('.dc-item')].find(e => e._ref.inst.id === 'cod').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  const far = await pxFor({ id: 'cod', rot: 0, ignore: true, last: true });
  await page.mouse.move(rect.x, rect.y); await page.mouse.down();
  await page.mouse.move(rect.x + 20, rect.y + 20, { steps: 4 });
  check('kéo: món được nhấc lên', (await page.evaluate(() => DRCargo._debug().held)).dragging === true);
  await page.mouse.move(far.px, far.py, { steps: 8 });
  await page.mouse.up(); await sleep(150);
  const moved = await page.evaluate(() => DR.grid('INVENTORY').items.find(i => i.id === 'cod'));
  check('kéo thả cod sang ô khác', moved.x === far.cell.x && moved.y === far.cell.y && (moved.x !== cod0.x || moved.y !== cod0.y), moved.x + ',' + moved.y);
  const eqRect = await page.evaluate(() => { const e = [...document.querySelectorAll('.dc-item.locked')][0].getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await page.mouse.move(eqRect.x, eqRect.y); await page.mouse.down(); await page.mouse.move(eqRect.x + 30, eqRect.y + 30, { steps: 3 }); await page.mouse.up();
  check('đồ lắp bị khoá khi đang lái: không nhấc được', (await page.evaluate(() => DRCargo._debug().held)) === null);
  // Xoay bằng R rồi thả vào chỗ hợp lệ khác; sau đó vứt cá bằng X (cá vứt không cần xác nhận)
  await page.mouse.move(far.px, far.py); await page.mouse.down(); await page.mouse.move(far.px + 12, far.py + 12, { steps: 3 });
  await page.keyboard.press('KeyR');
  check('xoay món đang kéo bằng R', (await page.evaluate(() => DRCargo._debug().held.rot)) === 90);
  await page.mouse.up(); await sleep(100);
  await page.keyboard.press('Escape'); await sleep(100);
  const invCod = await page.evaluate(() => DR.grid('INVENTORY').items.filter(i => i.id === 'cod').length);
  check('Esc sau khi thả: món đã nằm yên trong khoang (1 con cod)', invCod === 1);
  const stillOpen = await page.evaluate(() => DRCargo.isOpen());
  if (stillOpen) await page.keyboard.press('Escape');
  await sleep(100);
  check('đóng khoang trả lại chế độ lái thuyền', !(await page.evaluate(() => DRCargo.isOpen())) && (await page.evaluate(() => DR.mode)) === 'sail', await page.evaluate(() => DR.mode));
  await page.keyboard.press('Tab'); await sleep(150);
  check('Tab mở khoang khi đang lái', (await page.evaluate(() => DRCargo.isOpen() && DR.mode)) === 'cargo');
  await page.keyboard.press('Tab'); await sleep(150);
  check('Tab lần nữa đóng khoang', !(await page.evaluate(() => DRCargo.isOpen())) && (await page.evaluate(() => DR.mode)) === 'sail');

  // ------------------------------------------------------------ bến
  await page.evaluate(() => DEV.dock());
  await sleep(500);
  check('mở bến: hiện tên Greater Marrow', (await txt('#dr-dock h2')) === 'Greater Marrow' && (await page.evaluate(() => DR.mode)) === 'dock');
  check('bến có 5 điểm đến + nút Rời bến', (await page.locator('.dk-nav [data-dest]').count()) === 5 && (await page.locator('[data-act=undock]').count()) === 1);
  check('nợ tàu hiện ở bến', /Nợ tàu còn lại: \$50\.00/.test(await txt('.dk-debt')), await txt('.dk-debt'));
  await shot('8-dock-fishmonger');

  // bán cod
  const sale = await page.evaluate(() => {
    const inst = DR.grid('INVENTORY').items.find(i => i.id === 'cod');
    const price = DRRules.sellPrice(DR_CONFIG, DR.item('cod'), inst, 1, 1);
    const left = Math.max(0, DR.s.vars['gm-debt'] - DR.s.vars['gm-repayments']);
    const share = Math.min(left, Math.round(price * DR_CONFIG.greaterMarrowDebtRepaymentProportion * 100) / 100);
    return { price, share, funds: DR.s.funds, repaid: DR.s.vars['gm-repayments'] };
  });
  await page.click('[data-act=sell]');
  await sleep(200);
  const after = await page.evaluate(() => ({ funds: DR.s.funds, repaid: DR.s.vars['gm-repayments'], cod: DR.grid('INVENTORY').items.filter(i => i.id === 'cod').length }));
  const want = Math.round((sale.funds + sale.price - sale.share) * 100) / 100;
  check('bán cod ở người buôn cá: tiền tăng giá trừ phần trả nợ', Math.abs(after.funds - want) < 0.006 && after.cod === 0, 'giá ' + sale.price + ', trả nợ ' + sale.share + ', tiền ' + sale.funds + ' → ' + after.funds);
  check('phần nợ trả cộng vào gm-repayments', Math.abs(after.repaid - sale.repaid - sale.share) < 0.006, sale.repaid + ' → ' + after.repaid);
  await shot('9-dock-after-sale');
  // bán tất cả: thêm 2 con cá rồi bán một lượt
  const bulk = await page.evaluate(() => {
    DR.give('cod', { size: 0.5, fresh: DR_CONFIG.maxFreshness }); DR.give('cod', { size: 0.9, fresh: 0.5 });
    const f = DR.s.funds;
    const sum = DR.grid('INVENTORY').items.filter(i => i.id === 'cod').reduce((s, i) => s + DRRules.sellPrice(DR_CONFIG, DR.item('cod'), i, 1, 1), 0);
    return { f, sum };
  });
  await page.click('.dk-nav [data-dest=fishmonger]');
  await page.click('[data-act=sell-all]'); await sleep(200);
  const f2 = await page.evaluate(() => ({ f: DR.s.funds, cod: DR.grid('INVENTORY').items.filter(i => i.id === 'cod').length }));
  check('"Bán tất cả" bán hết cá trong khoang', f2.cod === 0 && f2.f > bulk.f, bulk.f + ' → ' + f2.f + ' (giá gộp ' + bulk.sum.toFixed(2) + ')');

  // thợ đóng tàu: mua cần câu rẻ nhất
  await page.click('.dk-nav [data-dest=shipwright]'); await sleep(150);
  await shot('10-dock-shipwright');
  const rod = await page.evaluate(() => {
    const st = DR_WORLD.ShopData.Shipwright_Rods.alwaysInStock.map(e => DR_ITEMS[e.itemData]).filter(d => d.researchPointsRequired === 0 || d.buyableWithoutResearch);
    st.sort((a, b) => DRRules.buyPrice(a, 1) - DRRules.buyPrice(b, 1));
    return { id: st[0].id, price: DRRules.buyPrice(st[0], 1), funds: DR.s.funds, n: DR.grid('INVENTORY').items.filter(i => i.id === st[0].id).length };
  });
  await page.click('[data-item="' + rod.id + '"] [data-act=buy]'); await sleep(200);
  const rod2 = await page.evaluate(id => ({ n: DR.grid('INVENTORY').items.filter(i => i.id === id).length, funds: DR.s.funds }), rod.id);
  check('mua cần câu rẻ nhất (' + rod.id + ') vào INVENTORY', rod2.n === rod.n + 1 && Math.abs(rod2.funds - (rod.funds - rod.price)) < 0.006, 'giá ' + rod.price + ', tiền ' + rod.funds + ' → ' + rod2.funds);
  // sửa thân tàu: đang có 1 ô hỏng từ phần HUD
  await page.click('[data-tab=repair]'); await sleep(100);
  const rep = await page.evaluate(() => ({ dmg: DR.grid('INVENTORY').damage.length, funds: DR.s.funds }));
  await page.click('[data-act=repair-one]'); await sleep(150);
  const rep2 = await page.evaluate(() => ({ dmg: DR.grid('INVENTORY').damage.length, funds: DR.s.funds }));
  check('sửa 1 ô thân tàu tốn hullRepairCostPerSquare', rep.dmg === 1 && rep2.dmg === 0 && Math.abs(rep.funds - rep2.funds - 30) < 0.006, rep.funds + ' → ' + rep2.funds);
  await shot('11-dock-repair');

  // kho
  await page.click('.dk-nav [data-dest=storage]'); await sleep(300);
  dbg = await page.evaluate(() => DRCargo._debug());
  check('kho mở với lưới INVENTORY + STORAGE', dbg && dbg.grids.map(g => g.key).join() === 'INVENTORY,STORAGE');
  check('ở bến thì đồ lắp không bị khoá', (await page.locator('.dc-item.locked').count()) === 0);
  await shot('12-dock-storage');
  // chuyển cần câu mới sang kho bằng kéo thả (ở bến nên được phép)
  const toStore = await pxFor({ id: 'rod1', key: 'STORAGE', rot: 0 });
  const rodEl = await page.evaluate(() => { const e = [...document.querySelectorAll('.dc-item')].find(e => e._ref.key === 'INVENTORY' && e._ref.inst.id === 'rod1'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(rodEl.x, rodEl.y); await page.mouse.down(); await page.mouse.move(rodEl.x + 14, rodEl.y + 14, { steps: 3 });
  await page.mouse.move(toStore.px, toStore.py, { steps: 8 }); await page.mouse.up(); await sleep(150);
  check('kéo cần câu sang kho khi đang ở bến', await page.evaluate(() => DR.grid('STORAGE').items.some(i => i.id === 'rod1') && !DR.grid('INVENTORY').items.some(i => i.id === 'rod1')));
  await page.keyboard.press('Escape'); await sleep(150);
  check('đóng kho: vẫn ở màn bến', (await page.evaluate(() => DR.mode)) === 'dock' && (await page.locator('#dr-dock.on').count()) === 1);

  // nghỉ ngơi
  await page.evaluate(() => { window.__pass = null; DR.on('passTime', (h, why) => { window.__pass = { h, why }; }); });
  await page.click('.dk-nav [data-dest=rest]'); await sleep(100);
  await shot('13-dock-rest');
  const wantH = await page.evaluate(() => DRRules.hoursToMorning(DR.s.time));
  await page.click('[data-act=sleep]'); await sleep(100);
  const pass1 = await page.evaluate(() => window.__pass);
  check('nghỉ ngơi phát passTime(giờ tới 06:00, "SLEEP")', pass1 && Math.abs(pass1.h - wantH) < 1e-6 && pass1.why === 'SLEEP', JSON.stringify(pass1));

  // nhân vật
  await page.click('.dk-nav [data-dest=mayor]'); await sleep(150);
  const quote = await txt('.dk-char blockquote');
  check('nhân vật Mayor: chân dung + câu thoại đầu', (await page.locator('.dk-char img').count()) === 1 && quote.length > 15, quote.slice(0, 70));
  await shot('14-dock-character');
  await page.click('[data-act=undock]'); await sleep(200);
  check('Rời bến về chế độ lái, đóng màn bến', (await page.evaluate(() => DR.mode)) === 'sail' && (await page.locator('#dr-dock.on').count()) === 0);
  await shot('15-back-to-sail');

  // chữ tiếng Việt có dấu vẽ được bằng phông gốc
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const need = 'ắằẳẵặấầẩẫậếềểễệốồổỗộớờởỡợứừửữựỳỷỹỵđĐƠƯ';
    const res = {};
    for (const f of ['800 20px Hahmlet', '600 20px Hahmlet', '20px "Poltawski Nowy"', '20px Signika', '20px Oswald']) {
      await document.fonts.load(f, need);
      res[f] = document.fonts.check(f, need);
    }
    return res;
  });
  check('phông gốc nạp được và phủ đủ chữ Việt', Object.values(fonts).every(Boolean), JSON.stringify(fonts));

  check('không có pageerror / console error / 404', errors.length === 0, errors.slice(0, 6).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720, true);
    await run(browser, base, 844, 390, true);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
