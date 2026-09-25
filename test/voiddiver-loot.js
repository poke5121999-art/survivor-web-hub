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
      tabs: document.querySelectorAll('.vd-inv-tabs .tab').length, guide: [...document.querySelectorAll('.vd-inv-center .guide .g span')].map(e => e.textContent),
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
    await page.keyboard.press('KeyR');
    const sorted = await page.evaluate(() => { const a = VD.inventory.slots.filter(s => !s.bag).map(s => !!s.g); return a.indexOf(false) < 0 || a.slice(a.indexOf(false)).every(x => !x); });
    check('R sắp xếp: đồ dồn về đầu, không còn ô trống xen giữa', sorted);
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
  } catch (e) {
    console.log('  LỖI chạy kiểm: ' + (e.stack || e));
    fail++; fails.push('exception');
  }
  const uniq = [...new Set(errors)];
  const MINE = /art\/ui\/inventory\/|audio\/sfx\/(Looting|Inventory|Item(Drop|Release)|ButtonClick)|css\/dive\.css|js\/(dive|inventory)\.js/;
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
