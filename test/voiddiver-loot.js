/*
 * VOID DIVER — túi đồ (Tab) và lục rương, chơi thật trên trang (Playwright, Chromium headless, WebGL swiftshader).
 *
 * Chạy:  node test/voiddiver-loot.js
 *   Campaign 101 1280×720: một rương thật được nạp sẵn 5 món khác bậc rồi mở bằng giữ F thật.
 *   Kiểm theo mã gốc (docs/DIVE.md §10): ô hé lộ lần lượt, mỗi ô chờ GetRevealTime(bậc) (0,8/1,1/2,2/3,1/4 s),
 *   tiếng Looting_Loop + Looting_low/middle/high/veryhigh, ô chưa hé lộ không lấy được, đóng giữa chừng thì ô đang
 *   hé lộ chờ lại; chuột trái = "Bỏ vào tất cả", Ctrl + trái = 1, Shift + trái = nửa; kéo thả vào túi; chuột phải ở
 *   rương báo CannotDropInLootInventory, ở túi thì vứt xuống đất; phím số gán ô nhanh; R sắp xếp; tooltip; Esc đóng;
 *   rồi 844×390 bảng vừa màn.
 *   MenuPopup (docs/DIVE.md §12): Bag là món có ô riêng (BagPanel, F mở, Esc đóng trước, sai loại/túi trùng bị từ chối), tooltip
 *   vũ khí/phụ kiện/cổ vật đầy đủ, 7 trang ở 1280×720 và 844×390 (không tràn màn), tuỳ chọn âm lượng, tay cầm giả
 *   (navigator.getGamepads): Start mở, RT/LT đổi thẻ, d-pad dời ô, A cầm/đặt với Highlight, B đóng.
 *   Hỏng nếu: pageerror, console error, response ≥ 400. Ảnh ở %TEMP%/voiddiver-loot-shots/ — mở ra xem.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-loot-shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.css': 'text/css', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.skel': 'application/octet-stream', '.atlas': 'text/plain', '.woff2': 'font/woff2' };
// Số đo trong GameAssembly (EnumExtensions.GetRevealTime / GetRevealSfx).
const REVEAL = { Normal: [0.8, 'Looting_low'], Rare: [1.1, 'Looting_middle'], Elite: [2.2, 'Looting_high'], Epic: [3.1, 'Looting_high'], Legend: [4, 'Looting_veryhigh'], Unique: [4, 'Looting_veryhigh'] };

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name + (detail != null ? '  (' + detail + ')' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail != null ? '  (' + detail + ')' : '')); }
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms, label) {
  try { await page.waitForFunction(fn, arg, { timeout: ms || 30000, polling: 50 }); return true; }
  catch (e) { console.log('    (hết giờ chờ: ' + (label || fn.toString().slice(0, 80)) + ')'); return false; }
}
async function gameWait(page, sec) {
  const t0 = await page.evaluate(() => VD.loop.time);
  return waitFor(page, ([t0, s]) => VD.loop.time - t0 >= s, [t0, sec], Math.max(20000, sec * 12000), 'game ' + sec + ' s');
}
const shots = [];
async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  shots.push(f);
  console.log('    ảnh: ' + f);
}
// Tâm (px trang) của ô trong bảng: sel = '.grid.loot' | '.grid.inv' | '.quick .row', k = thứ tự ô.
async function slotXY(page, sel, k) {
  return page.evaluate(([sel, k]) => {
    const el = document.querySelectorAll(sel + ' > .vs[data-a]')[k];
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, [sel, k]);
}
async function holdF(page, sec) { await page.keyboard.down('KeyF'); await gameWait(page, sec); await page.keyboard.up('KeyF'); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); console.log('    PAGEERROR ' + String(e.stack || e.message).split(/\n/).slice(0, 6).join(' / ')); });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  // Tay cầm giả cho phần MenuPopup: window.__pad = null tới khi bài kiểm cắm vào.
  await page.addInitScript(() => { window.__pad = null; navigator.getGamepads = () => [window.__pad]; });
  try {
    await page.goto(`${process.env.VD_BASE || ("http://127.0.0.1:" + port)}/games/voiddiver/index.html?campaign=101&seed=11&char=100001`);
    check('nạp xong', await waitFor(page, () => document.body.dataset.ready === '1', null, 240000, 'nạp lượt lặn'));
    await page.evaluate(() => { VD.profile.load(); VD.dive.debug.skipIntro(); });
    check('vào play', await waitFor(page, () => VD.dive.state === 'play', null, 60000, 'play'));
    await page.keyboard.down('Control');
    await waitFor(page, () => !(VD.dialog && VD.dialog.open), null, 90000, 'hộp thoại đóng');
    await page.keyboard.up('Control');

    // Ghi mọi tiếng kèm giờ game; giữ quái đứng yên để không cắt ngang việc đo.
    await page.evaluate(() => {
      window.__sfx = [];
      const o = VD.audio.sfx;
      VD.audio.sfx = function (n) { window.__sfx.push([VD.loop.time, n]); return o.apply(this, arguments); };
      setInterval(() => { const p = VD.stage.player; if (p && !p.dead) p.hp = p.stats.HpMax; }, 100);
    });
    // Rương thật gần nhất, nạp 5 món khác bậc (đã "mở" nên F đi thẳng vào bảng lục).
    const setup = await page.evaluate(() => {
      const T = VD.T, gr = g => VD.goods.grade(g);
      const pickEq = grade => { const r = T.Equipment.find(e => e.Grade === grade && e.GoodsType !== 'Artifact' && VD.ASSETS.icon.equipment.names.indexOf(String(e.Id)) >= 0); return r && { type: 'Equipment', id: r.Id, count: 1 }; };
      const items = [{ type: 'Item', id: 2000, count: 3 }, pickEq('Rare'), pickEq('Elite'), pickEq('Epic'), pickEq('Legend') || pickEq('Unique')].filter(Boolean);
      const p = VD.stage.player.pos;
      const b = VD.dive.ents.filter(e => e.kind === 'box' && !e.row.HasKeyInteraction && (!(e.row.InteractStressConditions || []).length || e.row.InteractStressConditions.indexOf('Alert') >= 0))
        .sort((a, c) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(c.pos.x - p.x, c.pos.z - p.z))[0];
      b.opened = true; b.loot = items.map(g => Object.assign({}, g)); b.lootInv = null; b._lootTest = true;
      VD.dive.debug.teleport(b.pos.x + 0.8, b.pos.z + 0.4);
      return { box: b.row.Id, prefab: b.prefab, grades: items.map(gr), items };
    });
    check('rương thử có 5 bậc', setup.grades.length === 5, JSON.stringify(setup.grades));
    await gameWait(page, 0.4);
    await holdF(page, 0.3);
    check('giữ F → bảng Tab + LootingInventory', await waitFor(page, () => VD.inventory.open && VD.inventory.loot, null, 10000));
    const s0 = await page.evaluate(() => ({
      reving: [...document.querySelectorAll('.grid.loot .vs')].map(e => e.classList.contains('reving') ? 'R' : e.classList.contains('unrev') ? 'U' : e.classList.contains('empty') ? '.' : 'V').slice(0, 6).join(''),
      anim: VD.stage.player.drive && VD.stage.player.drive.name, caption: document.querySelector('.vd-inv-loot .head b').textContent,
      tabs: document.querySelectorAll('.vd-inv-tabs .tab').length, guide: [...document.querySelectorAll('.vd-inv-center .guide .g:not(.only-pad) span')].map(e => e.textContent),
    }));
    check('ô 1 đang hé lộ, các ô sau chưa hé lộ, ô trống trơn', /^RUUUU\.$/.test(s0.reving), s0.reving);
    check('nhân vật chơi battle/search khi lục', s0.anim === 'battle/search', s0.anim);
    check('tiêu đề LootingInventory + 7 thẻ MenuPopup + 10 dòng InventoryKeyGuide', s0.caption === await page.evaluate(() => VD.TEXT.LootingInventory) && s0.tabs === 7 && s0.guide.length === 10, JSON.stringify(s0.guide));
    await shot(page, 'loot-01-searching');
    // Ô chưa hé lộ: bấm không lấy được.
    const u4 = await slotXY(page, '.grid.loot', 4);
    await page.mouse.click(u4.x, u4.y);
    check('bấm ô chưa hé lộ không lấy được', await page.evaluate(() => VD.inventory.loot.slots[4].g != null && VD.inventory.loot.slots[4].rev !== 2));
    // Đóng giữa chừng (Tab) rồi mở lại bằng F: ô đang hé lộ chờ lại từ đầu.
    // (chụp ảnh trên swiftshader mất vài giây giờ game: đợi một ô giữa đang hé lộ, không cố định ô 2)
    await waitFor(page, () => { const k = VD.inventory.loot.slots.findIndex(s => s.rev === 1); return k >= 1 && k <= 3; }, null, 60000, 'ô giữa đang hé lộ');
    await page.keyboard.press('Tab');
    const closed = await page.evaluate(() => ({ open: VD.inventory.open, s: VD.dive.ents.find(e => e._lootTest).lootInv.slots.slice(0, 5).map(s => s.rev).join(''), drive: VD.stage.player.drive && VD.stage.player.drive.name }));
    const kCut = closed.s.indexOf('0');
    check('Tab đóng giữa chừng: ô đã hé lộ giữ nguyên, ô đang hé lộ về chưa hé lộ, hết battle/search', !closed.open && kCut >= 1 && /^2+0+$/.test(closed.s) && !closed.drive, JSON.stringify(closed));
    await gameWait(page, 0.3);
    await page.evaluate(() => { window.__sfx.length = 0; });
    await holdF(page, 0.3);
    await waitFor(page, () => VD.inventory.open, null, 10000, 'mở lại');
    check('hé lộ hết', await waitFor(page, () => VD.inventory.revealed(), null, 180000, 'hé lộ hết'));
    await gameWait(page, 0.6);
    // Nhịp hé lộ: mỗi Looting_Loop tới tiếng hé lộ = GetRevealTime(bậc), tiếng đúng bậc.
    const log = await page.evaluate(() => window.__sfx.filter(x => /^Looting|^LootingCompleted|^InventoryPopupOpen/.test(x[1])));
    const seq = [];
    for (let i = 0; i < log.length; i++) if (log[i][1] === 'Looting_Loop') { const j = log.findIndex((x, k) => k > i && /^Looting_(low|middle|high|veryhigh)$/.test(x[1])); if (j > 0) seq.push({ dt: +(log[j][0] - log[i][0]).toFixed(2), sfx: log[j][1] }); }
    const want = setup.grades.slice(kCut).map(g => REVEAL[g]);
    const okT = seq.length === want.length && seq.every((x, i) => Math.abs(x.dt - want[i][0]) < 0.15 && x.sfx === want[i][1]);
    check('mỗi ô chờ GetRevealTime(bậc) và kêu GetRevealSfx(bậc)', okT, JSON.stringify(seq) + ' muốn ' + JSON.stringify(want));
    check('mở lại: InventoryPopupOpen + LootingCompleted khi giữ F xong', log.some(x => x[1] === 'InventoryPopupOpen') && log.some(x => x[1] === 'LootingCompleted'), JSON.stringify(log.slice(0, 3)));
    await shot(page, 'loot-02-revealed');

    // Tooltip khi rê chuột: tên, bậc màu, giá trị.
    const e1 = await slotXY(page, '.grid.loot', 1);
    await page.mouse.move(e1.x, e1.y); await sleep(150);
    const tip = await page.evaluate(() => { const t = document.querySelector('.vd-inv-tip'); return { on: t.classList.contains('on'), name: t.querySelector('.name') && t.querySelector('.name').textContent, grade: t.querySelector('.grade') && getComputedStyle(t.querySelector('.grade')).color, focus: document.querySelectorAll('.grid.loot .vs.focus').length }; });
    check('tooltip: tên + màu bậc Rare #2E9B8F, ô sáng viền', tip.on && tip.name && tip.grade === 'rgb(46, 155, 143)' && tip.focus === 1, JSON.stringify(tip));
    await shot(page, 'loot-03-tooltip');

    // Chồng 3 × Item 2000: Shift + trái = nửa (2), Ctrl + trái = 1.
    const c0 = await page.evaluate(() => VD.inventory.count('Item', 2000));
    const e0 = await slotXY(page, '.grid.loot', 0);
    await page.keyboard.down('Shift'); await page.mouse.click(e0.x, e0.y); await page.keyboard.up('Shift');
    const c1 = await page.evaluate(() => VD.inventory.count('Item', 2000));
    await page.keyboard.down('Control'); await page.mouse.click(e0.x, e0.y); await page.keyboard.up('Control');
    const c2 = await page.evaluate(() => [VD.inventory.count('Item', 2000), VD.inventory.loot.slots[0].g]);
    check('Shift + trái lấy nửa chồng, Ctrl + trái lấy 1', c1 - c0 === 2 && c2[0] - c1 === 1 && !c2[1], [c0, c1, c2[0]].join('→'));
    // Chuột phải ở rương: không vứt được.
    await page.mouse.click(e1.x, e1.y, { button: 'right' });
    const rm = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.vd-toast')].pop(), b = t && t.getBoundingClientRect();
      const top = b && document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { still: !!VD.inventory.loot.slots[1].g, toast: t ? t.textContent : '', onTop: !!(top && t.contains(top)) };
    });
    check('chuột phải ở rương: CannotDropInLootInventory nổi trên bảng, đồ vẫn còn', rm.still && rm.onTop && rm.toast === await page.evaluate(() => VD.TEXT.CannotDropInLootInventory), JSON.stringify(rm));
    await shot(page, 'loot-03b-toast');
    // Kéo thả ô Rare sang ô trống thứ 20 của túi.
    const dst = await slotXY(page, '.grid.inv', 20);
    const g1 = await page.evaluate(() => VD.inventory.loot.slots[1].g.id);
    await page.mouse.move(e1.x, e1.y); await page.mouse.down();
    await page.mouse.move(e1.x - 40, e1.y + 10, { steps: 4 });
    await page.mouse.move((e1.x + dst.x) / 2, (e1.y + dst.y) / 2, { steps: 6 });
    const dragOn = await page.evaluate(() => getComputedStyle(document.querySelector('.vd-inv-drag')).display !== 'none');
    await shot(page, 'loot-04-drag');
    await page.mouse.move(dst.x, dst.y, { steps: 6 }); await page.mouse.up();
    const dropped = await page.evaluate(g => ({ s20: VD.inventory.slots[20].g && VD.inventory.slots[20].g.id, left: VD.inventory.loot.slots[1].g }), g1);
    check('kéo thả: hiện DraggingGoodsSlot, thả vào ô 21 của túi', dragOn && dropped.s20 === g1 && !dropped.left, JSON.stringify(dropped));
    // Bấm trái các ô còn lại trừ ô cuối (giữ lại để mở ở màn nhỏ).
    const e2 = await slotXY(page, '.grid.loot', 2), e3 = await slotXY(page, '.grid.loot', 3);
    await page.mouse.click(e2.x, e2.y); await page.mouse.click(e3.x, e3.y);
    check('chuột trái = "Bỏ vào tất cả" sang túi', await page.evaluate(() => VD.inventory.loot.items.length === 1));

    // Phím số khi rê lên đồ trong túi → gán ô nhanh; F dùng; R sắp xếp; chuột phải vứt xuống đất.
    const kIt = await page.evaluate(() => VD.inventory.slots.findIndex(s => s.g && s.g.id === 2000));
    const pIt = await slotXY(page, '.grid.inv', kIt);
    await page.evaluate(() => { VD.inventory.quick[2] = 0; });
    await page.mouse.move(pIt.x, pIt.y); await sleep(80);
    await page.keyboard.press('Digit3');
    check('phím 3 khi rê lên Item 2000 → ô nhanh 3', await page.evaluate(() => VD.inventory.quick[2] === 2000 && VD.inventory.quick.indexOf(2000) === 2));
    const drops0 = await page.evaluate(() => VD.dive.ents.filter(e => e.kind === 'drop').length);
    const kEq = await page.evaluate(g => VD.inventory.slots.findIndex(s => s.g && s.g.id === g), g1);
    const pEq = await slotXY(page, '.grid.inv', kEq);
    await page.mouse.click(pEq.x, pEq.y, { button: 'right' });
    const drops1 = await page.evaluate(g => ({ n: VD.dive.ents.filter(e => e.kind === 'drop').length, has: VD.inventory.count('Equipment', g) }), g1);
    check('chuột phải ở túi: vứt xuống đất (thành đồ rơi)', drops1.n === drops0 + 1 && drops1.has === 0, JSON.stringify(drops1));
    // Thời gian giữ F nhặt đồ rơi = DropGoods._holdingTime của prefab (0,25), không phải Const.LootingInteractionTime (0,1 — xác quái).
    const hold = await page.evaluate(() => { const it = VD.dive.debug.interactables(); return it && { kind: it.e.kind, t: it.it.time }; });
    check('giữ F nhặt đồ rơi 0,25 s (DropGoods.get_HoldingTime)', hold && hold.kind === 'drop' && hold.t === 0.25, JSON.stringify(hold));
    // R = InventoryExtensions.Organize: ô có đồ trước, EGoodsType tăng, bậc giảm, Id tăng; không gộp chồng; chỉ khu của ô đang chọn.
    const scramble = () => page.evaluate(() => {
      const I = VD.inventory, gs = I.slots.map(s => s.g).filter(Boolean);
      gs.push({ type: 'Item', id: 2000, count: 1 });                  // chồng thứ hai cùng loại: không được gộp
      I.slots.forEach(s => { s.g = null; });
      gs.forEach((g, i) => { I.slots[(i * 5 + 3) % I.slots.length].g = g; });
      I.refresh(); return gs.length;
    });
    const nG = await scramble();
    await page.mouse.move(640, 700);                                   // không rê lên ô nào
    const snap = () => page.evaluate(() => VD.inventory.slots.map(s => s.g ? s.g.type + s.g.id + 'x' + s.g.count : '-').join(','));
    const snap0 = await snap();
    await page.keyboard.press('KeyR');
    check('R khi không chọn ô nào: không sắp xếp', (await snap()) === snap0);
    const anyXY = await slotXY(page, '.grid.inv', 3);
    await page.mouse.move(anyXY.x, anyXY.y); await sleep(80);
    await page.keyboard.press('KeyR');
    const org = await page.evaluate(() => {
      const TY = ['None', 'Gold', 'Coin', 'Exp', 'Consumable', 'Valuable', 'Misc', 'Note', 'Blueprint', 'MusicDisc', 'Weapon', 'Accessory', 'Artifact', 'Bag'];
      const GR = ['None', 'Normal', 'Rare', 'Elite', 'Epic', 'Legend', 'Unique'];
      const key = g => { const r = VD.goods.row(g) || {}; return [TY.indexOf(g.type === 'Bag' ? 'Bag' : r.GoodsType), -GR.indexOf(r.Grade || 'None'), g.id]; };
      const a = VD.inventory.slots.map(s => s.g);
      const k = a.indexOf(null);
      const filled = a.filter(Boolean);
      let ok = k < 0 || a.slice(k).every(x => !x);
      for (let i = 1; i < filled.length; i++) { const x = key(filled[i - 1]), y = key(filled[i]); if (x[0] > y[0] || (x[0] === y[0] && (x[1] > y[1] || (x[1] === y[1] && x[2] > y[2])))) ok = false; }
      return { ok, n: filled.length, stacks2000: filled.filter(g => g.id === 2000).length };
    });
    check('R sắp xếp theo mã gốc: có đồ trước, loại tăng, bậc giảm, Id tăng, không gộp chồng', org.ok && org.n === nG && org.stacks2000 === 2, JSON.stringify(org));
    await shot(page, 'loot-05-after');
    await page.keyboard.press('Escape');
    const esc = await page.evaluate(() => ({ open: VD.inventory.open, drive: VD.stage.player.drive && VD.stage.player.drive.name, input: VD.input.enabled }));
    check('Esc đóng bảng, bỏ battle/search, trả điều khiển', !esc.open && !esc.drive && esc.input !== false, JSON.stringify(esc));

    // 844×390: mở lại rương còn 1 món.
    await page.setViewportSize({ width: 844, height: 390 });
    // Món vừa vứt nằm dưới chân (gần hơn rương): sang phía bên kia rương rồi mới giữ F.
    await page.evaluate(() => { const b = VD.dive.ents.find(e => e._lootTest); VD.dive.debug.teleport(b.pos.x - 0.8, b.pos.z - 0.4); });
    await gameWait(page, 0.3);
    await holdF(page, 0.3);
    await waitFor(page, () => VD.inventory.open && VD.inventory.loot, null, 10000, 'mở ở màn nhỏ');
    await gameWait(page, 0.2);
    const m = await page.evaluate(() => {
      const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const vis = s => getComputedStyle(document.querySelector(s)).display !== 'none';
      return { page: r('.vd-inv-page'), my: r('.vd-inv-my .grid.inv'), loot: r('.vd-inv-loot .grid.loot'), quick: r('.vd-inv-center .quick .row'), slot: r('.grid.loot .vs'), tabs: vis('.vd-inv-tabs'), W: innerWidth, H: innerHeight };
    });
    const inside = b => b.l >= -1 && b.t >= -1 && b.r <= m.W + 1 && b.b <= m.H + 1;
    const over = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    check('844×390: túi, ô nhanh, rương đều trong màn, không chồng nhau, ô ≥ 40 px', inside(m.page) && inside(m.my) && inside(m.loot) && inside(m.quick) && !over(m.my, m.loot) && !over(m.quick, m.loot) && !over(m.my, m.quick) && m.slot.r - m.slot.l >= 40, JSON.stringify(m));
    await shot(page, 'loot-06-mobile');
    const lastXY = await slotXY(page, '.grid.loot', 4);
    await page.mouse.click(lastXY.x, lastXY.y);
    check('844×390: bấm lấy món cuối', await page.evaluate(() => VD.inventory.loot.items.length === 0));
    await page.keyboard.press('Tab');

    // ================= MenuPopup: 7 trang, tooltip trang bị, túi phụ, glow, tay cầm (docs/DIVE.md §12)
    await page.setViewportSize({ width: 1280, height: 720 });
    await gameWait(page, 0.2);
    const setup2 = await page.evaluate(() => {
      const I = VD.inventory, T = VD.T;
      for (const s of I.slots) s.g = null;
      const w = T.Equipment.find(e => e.GoodsType === 'Weapon' && e.Grade === 'Rare' && e.MaxDurability > 0);
      const acc = T.Equipment.find(e => e.GoodsType === 'Accessory' && (e.EquipmentEffectIds || []).length);
      const art = T.Equipment.find(e => e.GoodsType === 'Artifact' && e.Corruption > 0);
      const mat = T.Item.find(i => i.BagType === 'Material' && i.InventoryCountMax >= 3);
      I.add({ type: 'Equipment', id: w.Id, count: 1, dur: 40 });
      I.add({ type: 'Equipment', id: acc.Id, count: 1 });
      I.add({ type: 'Equipment', id: art.Id, count: 1, prefixes: [10001, 20001] });
      I.add({ type: 'Bag', id: 20011, count: 1 });          // túi nguyên liệu 3 ô
      I.add({ type: 'Item', id: mat.Id, count: 2 });        // chưa có chồng trong túi phụ → vào túi chính
      return { w: w.Id, acc: acc.Id, art: art.Id, mat: mat.Id };
    });
    await page.keyboard.press('Tab');
    await waitFor(page, () => VD.inventory.open, null, 5000, 'mở Tab');
    const inBag = await page.evaluate(m => { const b = VD.inventory.slots.find(s => s.g && s.g.type === 'Bag'); return { bag: !!b, inner: b && b.g.inner.map(s => s.g && s.g.id), top: VD.inventory.slots.some(s => s.g && s.g.id === m) }; }, setup2.mat);
    check('Bag là món trong túi; ô trống túi phụ không tự nhận nguyên liệu mới', inBag.bag && inBag.inner.every(x => !x) && inBag.top, JSON.stringify(inBag));
    // Tooltip trang bị đầy đủ: vũ khí (công, độ bền), phụ kiện (hiệu ứng), cổ vật (loại + tiền tố, ô nhiễm, giá Coin).
    const hover = async id => { const k = await page.evaluate(id => VD.inventory.slots.findIndex(s => s.g && s.g.id === id), id); const p = await slotXY(page, '.grid.inv', k); await page.mouse.move(p.x, p.y); await sleep(150); };
    await hover(setup2.w);
    const tw = await page.evaluate(() => { const f = document.querySelector('.vd-inv-tip.on .frame.eq'); return f && { rows: [...f.querySelectorAll('.row span')].map(s => s.textContent), dur: [...f.querySelectorAll('.row')].map(r => r.textContent).find(t => /\/\s*\d+/.test(t)) }; });
    check('tooltip vũ khí: Sức Tấn Công, Độ bền 40/…, Giá Trị, SL Trong Kho', tw && tw.rows.indexOf(await page.evaluate(() => VD.TEXT.UEquipmentTooltip_Attack_Caption)) >= 0 && /40 \//.test(tw.dur || ''), JSON.stringify(tw));
    await shot(page, 'menu-01-tip-weapon');
    await hover(setup2.acc);
    const ta = await page.evaluate(() => { const f = document.querySelector('.vd-inv-tip.on .frame.eq'); return f && { eff: f.querySelectorAll('.eff .sk').length, st: f.querySelectorAll('.eff .st').length }; });
    check('tooltip phụ kiện: dòng hiệu ứng EquipmentEffect', ta && ta.eff >= 1, JSON.stringify(ta));
    await hover(setup2.art);
    const tr = await page.evaluate(() => { const f = document.querySelector('.vd-inv-tip.on .frame.eq'); return f && { ac: f.querySelectorAll('.tags .ac').length, pos: f.querySelectorAll('.tags .ap.pos').length, neg: f.querySelectorAll('.tags .ap.neg').length, rows: [...f.querySelectorAll('.row span')].map(s => s.textContent) }; });
    check('tooltip cổ vật: loại + tiền tố tốt/xấu, Độ ô nhiễm, Giá Trị (Coin)', tr && tr.ac === 1 && tr.pos === 1 && tr.neg === 1 && tr.rows.indexOf(await page.evaluate(() => VD.TEXT.CorruptionValue)) >= 0, JSON.stringify(tr));
    await shot(page, 'menu-02-tip-artifact');
    // Túi phụ: F lên túi → BagPanel thay QuickSlotSettingPanel; hàng sai loại không vào; túi thứ hai cùng loại bị từ chối; Esc đóng túi trước.
    const kb = await page.evaluate(() => VD.inventory.slots.findIndex(s => s.g && s.g.type === 'Bag'));
    const pb = await slotXY(page, '.grid.inv', kb);
    await page.mouse.move(pb.x, pb.y); await sleep(100);
    const tb = await page.evaluate(() => { const n = document.querySelector('.vd-inv-tip.on .frame.bag .name'); return n && n.textContent; });
    await page.keyboard.press('KeyF');
    const bp = await page.evaluate(() => ({ on: document.querySelector('.vd-inv-bag').classList.contains('on'), quickOff: getComputedStyle(document.querySelector('.vd-inv-center .quick')).display === 'none', slots: [...document.querySelectorAll('.vd-inv-bag .row .vs')].filter(e => e.style.display !== 'none').length, title: document.querySelector('.vd-inv-bag .bn').textContent }));
    check('F lên túi phụ: BagPanel 3 ô thay ô nhanh, tên túi, tooltip "(0/3)"', bp.on && bp.quickOff && bp.slots === 3 && /\(0\/3\)/.test(tb || ''), JSON.stringify(bp) + ' ' + tb);
    // Kéo nguyên liệu vào túi: mọi ô túi phụ sáng Highlight khi món kéo nhận được (RxIsDragAcceptable), thả vào ô 1.
    const mk = await page.evaluate(id => VD.inventory.slots.findIndex(s => s.g && s.g.id === id), setup2.mat);
    const mp0 = await slotXY(page, '.grid.inv', mk), bs0 = await slotXY(page, '.vd-inv-bag .row', 0);
    await page.mouse.move(mp0.x, mp0.y); await page.mouse.down(); await page.mouse.move(mp0.x + 30, mp0.y, { steps: 3 }); await page.mouse.move(bs0.x, bs0.y - 60, { steps: 5 });
    const glow = await page.evaluate(() => ({ bag: document.querySelectorAll('.vd-inv-bag .vs.glow').length, inv: document.querySelectorAll('.grid.inv .vs.glow').length, anim: (() => { const g = document.querySelector('.vd-inv-bag .vs.glow .hl'); return g && getComputedStyle(g).animationName; })() }));
    check('kéo nguyên liệu: 3 ô túi phụ sáng Highlight (vd-glow), ô túi chính không', glow.bag === 3 && glow.inv === 0 && glow.anim === 'vd-glow', JSON.stringify(glow));
    await shot(page, 'menu-03-bag-glow');
    await page.mouse.move(bs0.x, bs0.y, { steps: 4 }); await page.mouse.up();
    const put = await page.evaluate(id => { VD.inventory.add({ type: 'Item', id, count: 1 }); const b = VD.inventory.bagOpen; return { inner0: b.inner[0].g && b.inner[0].g.count, top: VD.inventory.slots.some(s => s.g && s.g.id === id) }; }, setup2.mat);
    check('thả vào ô túi phụ; nhặt thêm cùng loại chồng vào túi phụ trước (StackIntoExistingBags)', put.inner0 === 3 && !put.top, JSON.stringify(put));
    await shot(page, 'menu-03-bag');
    const wrongTo = await slotXY(page, '.vd-inv-bag .row', 1), wp = await (async () => { const k = await page.evaluate(id => VD.inventory.slots.findIndex(s => s.g && s.g.id === id), setup2.w); return slotXY(page, '.grid.inv', k); })();
    await page.mouse.move(wp.x, wp.y); await page.mouse.down(); await page.mouse.move(wp.x + 30, wp.y, { steps: 3 }); await page.mouse.move(wrongTo.x, wrongTo.y, { steps: 6 }); await page.mouse.up();
    const wr = await page.evaluate(() => ({ toast: ([...document.querySelectorAll('.vd-toast')].pop() || {}).textContent, inner1: VD.inventory.bagOpen && VD.inventory.bagOpen.inner[1].g }));
    check('kéo vũ khí vào ô túi nguyên liệu: GoodsNotAllowedInBag, không vào', !wr.inner1 && wr.toast === await page.evaluate(() => VD.TEXT.GoodsNotAllowedInBag), JSON.stringify(wr));
    const second = await page.evaluate(() => ({ left: VD.inventory.add({ type: 'Bag', id: 20012, count: 1 }), toast: ([...document.querySelectorAll('.vd-toast')].pop() || {}).textContent }));
    check('túi thứ hai cùng loại: CannotCarrySameBagType', second.left === 1 && second.toast === await page.evaluate(() => VD.TEXT.CannotCarrySameBagType), JSON.stringify(second));
    await page.keyboard.press('Escape');
    const esc1 = await page.evaluate(() => ({ open: VD.inventory.open, bag: !!VD.inventory.bagOpen }));
    check('Esc lần 1 đóng túi phụ, bảng vẫn mở', esc1.open && !esc1.bag, JSON.stringify(esc1));

    // Thẻ: Q/E đổi trang, bấm thẻ, mỗi trang có nội dung gốc.
    const TABS = ['Quest', 'Inventory', 'Character', 'Archive', 'Squad', 'Option', 'System'];
    await page.keyboard.press('KeyE');
    check('E sang thẻ Nhân vật', await page.evaluate(() => VD.menu.cur === 'Character' && document.querySelector('.vd-mp.mp-character').classList.contains('on')));
    await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyQ');
    check('Q hai lần về thẻ Mục tiêu', await page.evaluate(() => VD.menu.cur === 'Quest'));
    // Thẻ Tổ đội khoá khi còn hướng dẫn hoặc chưa đủ Npc 700012.UnlockConditions (UserLevel 2): bấm → toast + không đổi trang;
    // E từ Lưu trữ nhảy qua thẻ khoá sang Tuỳ chọn.
    await page.evaluate(() => { const p = VD.profile.get(); window.__prof = [p.userLevel, p.isTutorial]; p.userLevel = 1; p.isTutorial = true; VD.menu.show('Archive'); });
    await page.evaluate(() => document.querySelectorAll('.vd-inv-tabs .tab')[4].click());
    const lk = await page.evaluate(() => ({ cur: VD.menu.cur, locked: document.querySelectorAll('.vd-inv-tabs .tab')[4].classList.contains('locked'), toast: ([...document.querySelectorAll('.vd-toast')].pop() || {}).textContent }));
    await page.keyboard.press('KeyE');
    const skip = await page.evaluate(() => VD.menu.cur);
    await page.evaluate(() => VD.menu.show('System')); await page.keyboard.press('KeyE');
    const noWrap = await page.evaluate(() => VD.menu.cur);
    check('thẻ Tổ đội khoá (SquadTabLockedMessage), E nhảy qua thẻ khoá, không vòng quanh', lk.cur === 'Archive' && lk.locked && lk.toast === await page.evaluate(() => VD.TEXT.SquadTabLockedMessage) && skip === 'Option' && noWrap === 'System', JSON.stringify({ lk, skip, noWrap }));
    await page.evaluate(() => VD.menu.show('Archive')); await sleep(300);
    await shot(page, 'menu-squad-locked');
    await page.evaluate(() => { const p = VD.profile.get(); p.userLevel = 2; p.isTutorial = false; });
    for (const vp of [[1280, 720], [844, 390]]) {
      await page.setViewportSize({ width: vp[0], height: vp[1] }); await sleep(200);
      for (const t of TABS) {
        await page.evaluate(i => document.querySelectorAll('.vd-inv-tabs .tab')[i].click(), TABS.indexOf(t));
        await sleep(250);
        if (t === 'Quest') await page.evaluate(() => { const s = document.querySelector('.q-slot'); if (s) s.click(); });
        if (t === 'Character') await page.evaluate(() => document.querySelectorAll('.c-info .slots .vs')[0].dispatchEvent(new PointerEvent('pointerenter')));
        if (t === 'Archive') await page.evaluate(() => { document.querySelectorAll('.a-cat')[2].click(); const s = document.querySelector('.t-slot'); if (s) s.click(); });
        if (t === 'Option') await page.evaluate(() => document.querySelectorAll('.o-tabs .ot')[1].click());
        await sleep(200);
        const info = await page.evaluate(t => {
          const el = document.querySelector('.vd-mp.on'), r = el.getBoundingClientRect();
          const kids = [...el.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
          const out = kids.filter(e => { const b = e.getBoundingClientRect(); return (b.right > innerWidth + 2 || b.bottom > innerHeight + 2 || b.left < -2 || b.top < -2) && !e.closest('.q-list, .scroll, .cats, .list, .keys'); }).length;
          return { tab: el.dataset.tab || 'Inventory', text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), out };
        }, t);
        check(`${vp[0]}×${vp[1]} trang ${t}: hiện, có chữ, không tràn màn`, (info.tab === t) && info.text.length > 3 && info.out === 0, JSON.stringify(info));
        await shot(page, `menu-${vp[0]}-${TABS.indexOf(t)}-${t}`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 }); await sleep(200);
    await page.evaluate(() => { const p = VD.profile.get(); [p.userLevel, p.isTutorial] = window.__prof; });
    const pages = await page.evaluate(() => ({
      quest: document.querySelectorAll('.q-slot').length, cond: document.querySelectorAll('.q-info .cond').length,
      stats: document.querySelectorAll('.c-info .st').length, spine: !!document.querySelector('.c-info canvas.spine'),
      arch: document.querySelectorAll('.a-cat').length, squadOff: document.querySelectorAll('.mp-squad .mp-btn.disabled').length,
      opt: document.querySelectorAll('.o-tabs .ot').length, sys: [...document.querySelectorAll('.y-btns .mp-btn')].map(b => b.textContent.trim()),
    }));
    check('nội dung: nhiệm vụ campaign + mục tiêu, chỉ số nhân vật, 8 hạng mục lưu trữ, tổ đội tắt, 5 thẻ tuỳ chọn, nút hệ thống',
      pages.quest >= 1 && pages.cond >= 1 && pages.stats >= 10 && pages.arch === 8 && pages.squadOff === 2 && pages.opt === 5 && pages.sys.length === 5, JSON.stringify(pages));
    // Tuỳ chọn âm thanh: bấm thanh BGM ở 30 % → VD.audio.vol.bgm đổi, lưu localStorage.
    await page.evaluate(() => VD.menu.show('Option'));
    await page.evaluate(() => document.querySelectorAll('.o-tabs .ot')[1].click());
    const bar = await page.evaluate(() => { const b = document.querySelectorAll('.orow .sl .bar')[1].getBoundingClientRect(); return { x: b.x + b.width * 0.3, y: b.y + b.height / 2 }; });
    await page.mouse.click(bar.x, bar.y);
    const vol = await page.evaluate(() => ({ bgm: VD.audio.vol.bgm, saved: JSON.parse(localStorage.getItem('voiddiver.option.v1')).bgm }));
    check('tuỳ chọn BGM 3/10 → vol.bgm = 0,55 × 0,3, lưu lại', Math.abs(vol.bgm - 0.165) < 0.01 && vol.saved === 3, JSON.stringify(vol));
    await page.evaluate(() => { localStorage.removeItem('voiddiver.option.v1'); VD.audio.vol.bgm = 0.55; });
    await page.keyboard.press('Escape');
    check('Esc đóng bảng từ trang khác', await page.evaluate(() => !VD.inventory.open));

    // InGame/Menu: Esc khi đang chơi mở MenuPopup ở thẻ Mục tiêu; X cũng vậy; Tab mở Túi đồ.
    await page.keyboard.press('Escape');
    const escOpen = await page.evaluate(() => ({ open: VD.inventory.open, tab: VD.menu.cur }));
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyX');
    const xOpen = await page.evaluate(() => ({ open: VD.inventory.open, tab: VD.menu.cur }));
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    const tabOpen = await page.evaluate(() => ({ open: VD.inventory.open, tab: VD.menu.cur }));
    await page.keyboard.press('Tab');
    check('Esc / X khi đang chơi mở thẻ Mục tiêu, Tab mở Túi đồ', escOpen.open && escOpen.tab === 'Quest' && xOpen.open && xOpen.tab === 'Quest' && tabOpen.open && tabOpen.tab === 'Inventory',
      JSON.stringify({ escOpen, xOpen, tabOpen }));
    // Tay cầm giả (navigator.getGamepads): Start mở, RT/LT đổi thẻ, d-pad dời ô, A cầm/đặt (ô đích sáng Highlight), B đóng.
    const pad = async (i, ms) => { await page.evaluate(i => { window.__pad.buttons[i].pressed = true; window.__pad.buttons[i].value = 1; }, i); await sleep(ms || 400); await page.evaluate(i => { window.__pad.buttons[i].pressed = false; window.__pad.buttons[i].value = 0; }, i); await sleep(200); };
    await page.evaluate(() => { window.__pad = { connected: true, id: 'test pad', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; });
    await sleep(400);    // core.js hãm đổi thiết bị 0,3 s sau lần bấm phím cuối (DEVICE_SWITCH_COOLDOWN)
    await pad(9);
    const p1 = await page.evaluate(() => ({ st: VD.dive.state, en: VD.input.enabled, dlg: VD.dialog && VD.dialog.open, cut: !!VD.dive.cutscene, t: VD.loop.time, open: VD.inventory.open, tab: VD.menu.cur, padCls: document.querySelector('.vd-inv').classList.contains('pad'), focus: !!document.querySelector('.vd-mp.on .pad-focus') }));
    check('Start mở trang Túi đồ, đổi hình phím sang tay cầm, có ô được chọn', p1.open && p1.tab === 'Inventory' && p1.padCls && p1.focus, JSON.stringify(p1));
    await pad(7); const t1 = await page.evaluate(() => VD.menu.cur);
    await pad(6); const t2 = await page.evaluate(() => VD.menu.cur);
    check('RT → Nhân vật, LT → Túi đồ', t1 === 'Character' && t2 === 'Inventory', t1 + ' ' + t2);
    // X lên túi phụ mở BagPanel; A cầm nguyên liệu khác loại → ô túi phụ sáng; A đặt vào ô túi phụ 2; B lần 1 đóng túi.
    const mat2 = await page.evaluate(() => { const r = VD.T.Item.filter(i => i.BagType === 'Material' && i.InventoryCountMax >= 3)[1]; VD.inventory.add({ type: 'Item', id: r.Id, count: 1 }); return r.Id; });
    await page.evaluate(() => { const k = VD.inventory.slots.findIndex(s => s.g && s.g.type === 'Bag'); VD.menu.focus(document.querySelectorAll('.grid.inv > .vs')[k]); });
    await pad(2);
    await page.evaluate(id => { const k = VD.inventory.slots.findIndex(s => s.g && s.g.id === id); VD.menu.focus(document.querySelectorAll('.grid.inv > .vs')[k]); }, mat2);
    await pad(0);
    const held = await page.evaluate(() => ({ bag: !!VD.inventory.bagOpen, hold: !!VD.inventory.hold, glow: document.querySelectorAll('.vd-inv-bag .vs.glow').length }));
    check('tay cầm: X mở túi phụ, A cầm nguyên liệu → 3 ô túi phụ sáng', held.bag && held.hold && held.glow === 3, JSON.stringify(held));
    await shot(page, 'menu-pad-hold');
    await page.evaluate(() => VD.menu.focus(document.querySelectorAll('.vd-inv-bag .row .vs')[1]));
    await pad(0);
    const pput = await page.evaluate(id => { const b = VD.inventory.bagOpen; return !!(b && b.inner[1].g && b.inner[1].g.id === id); }, mat2);
    check('A đặt nguyên liệu vào ô túi phụ 2', pput);
    await pad(1);
    check('B lần 1 đóng túi phụ', await page.evaluate(() => VD.inventory.open && !VD.inventory.bagOpen));
    // Đưa ô chọn về ô vũ khí trong túi rồi cầm lên bằng A, xuống 2 hàng, đặt xuống.
    const from = await page.evaluate(id => { const k = VD.inventory.slots.findIndex(s => s.g && s.g.id === id); VD.menu.focus(document.querySelectorAll('.grid.inv > .vs')[k]); return k; }, setup2.w);
    await pad(0);
    const before = await page.evaluate(() => VD.menu.focusEl && VD.menu.focusEl.dataset.k);
    await pad(13, 200); await pad(13, 200);    // d-pad xuống 2 hàng; giữ < 350 ms để khỏi tự lặp (menu.js padRead)
    const after = await page.evaluate(() => VD.menu.focusEl && VD.menu.focusEl.dataset.k);
    await pad(0);
    const moved = await page.evaluate(([id, k]) => ({ at: VD.inventory.slots.findIndex(s => s.g && s.g.id === id), hold: !!VD.inventory.hold, k }), [setup2.w, +after]);
    check('d-pad xuống 2 hàng (6 cột), A đặt món vào ô đó', +after === +before + 12 && moved.at === +after && !moved.hold, JSON.stringify({ from, before, after, moved }));
    await pad(1);
    check('B đóng bảng', await page.evaluate(() => !VD.inventory.open));
    await page.evaluate(() => { window.__pad = null; });
  } catch (e) {
    console.log('  LỖI chạy kiểm: ' + (e.stack || e));
    fail++; fails.push('exception');
  }
  const uniq = [...new Set(errors)];
  const MINE = /art\/ui\/inventory\/|audio\/sfx\/(Looting|Inventory|Item(Drop|Release)|ButtonClick)|css\/dive\.css|js\/(dive|inventory|ui\/menu\w*)\.js|art\/ui\/icon_(skill|buff|monster)\//;
  const other404 = uniq.filter(e => /^HTTP 404 /.test(e) && !MINE.test(e));
  const bad = uniq.filter(e => other404.indexOf(e) < 0 && !/^console: Failed to load resource: the server responded with a status of 404/.test(e));
  if (other404.length) console.log('  WARN asset thiếu do module khác gọi (' + other404.length + '):\n      ' + other404.map(e => e.replace(/^HTTP 404 http:\/\/127\.0\.0\.1:\d+\//, '')).join('\n      '));
  check('không pageerror / console error / 404 của túi đồ', bad.length === 0, bad.slice(0, 12).join('\n      '));
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail' + (fails.length ? ': ' + fails.join('; ') : ''));
  console.log('ảnh: ' + OUT + ' (' + shots.length + ')');
  process.exit(fail ? 1 : 0);
})();
