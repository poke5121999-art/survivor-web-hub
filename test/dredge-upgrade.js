/*
 * DREDGE — Biển Mù: kiểm màn "Upgrades" của ụ tàu (js/upgrade.js) trên trang thật, bằng chuột/phím thật của Playwright.
 *   ván mới → bến Greater Marrow → bấm nút "Ụ tàu" → hội thoại Shipwright_DryDock_Unlocked (Space + bấm lựa chọn) → cửa sổ hiện
 *   → vị trí từng nút/đường nối, màu theo trạng thái, tooltip vật liệu "có/cần" + giá → bấm nút → thẻ mua → nâng cấp ô (ô nhận thêm loại đồ)
 *   → nâng thân bậc 2 (khoang Tier2Hull, đồ giữ nguyên, mô hình Boat2, vòng máy engine.2, ngưỡng hỏng 3→4) → lưu/nạp lại → ảnh so với wiki_upgrades.jpg.
 *   Phần cuối gọi thẳng DRUpgrade.applyUpgrade (không giao diện): thứ tự xếp lại đồ, phần dư sang kho, ngưỡng hỏng thật qua DRBoat.damage.
 * Chạy:  node test/dredge-upgrade.js        (tự dựng máy chủ tĩnh ở gốc repo; chạy hai cỡ 1920x1080 và 844x390, rồi phần áp thẳng)
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-upgrade.js
 *        ONLY=full|phone|apply        chỉ chạy một phần (mặc định cả ba)
 * Ảnh ra %TEMP%/dredge-upgrade/ ; ghép cạnh ảnh thật: sbs-upgrades.png (cần python + PIL + D:\dredge-ref\notes\sbs.py).
 *
 * Số kỳ vọng (đơn vị canvas 1920x1080) là hằng số TÍNH TAY từ cây UpgradeWindow đo ở bundle gốc (data/upgrade_ui.js sinh bởi tools/upgrade_ui.py;
 * thô ở D:\dredge-ref\notes\audit\work-shop-upgrade\scene_ui.json), KHÔNG lấy từ chính js/upgrade.js:
 *   Window 1680x820 giữa màn → góc trái trên (120,130). Nodes kéo giãn: lề 26 hai bên, sizeDelta (−52, −86), anchoredPosition y −17
 *   → trái 146, rộng 1628, cao 734, tâm y = 130 + 410 + 17 = 557 → trên 190.
 *   HorizontalLayoutGroup của Nodes (spacing 30, MiddleCenter) BỎ QUA UpgradeNodeTier5 đang tắt (bản cơ bản):
 *   rộng con 70+180+140+180+140+180+140+180 = 1210, cộng 7 khe 30 = 1420, lề đầu (1628−1420)/2 = 104 → bắt đầu x = 250
 *   → tâm cột: Tier0 285, Tier1 440, Hull2 630, Tier2 820, Hull3 1010, Tier3 1200, Hull4 1390, Tier4 1580.
 *   Hàng (tâm y 557, anchoredPosition y của nút +300, +150, 0, −150, −300): Rod 257, Net 407, Storage 557, Engine 707, Light 857.
 *   Khi bật hullTier5Content (9 con): vị trí khớp anchoredPosition đã lưu trong scene 54, 209, 399, 589, 779, 969, 1159, 1349, 1539 (+146).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-upgrade');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const REAL = process.env.DR_REAL_SHOT || 'D:/dredge-ref/shots-real/wiki_upgrades.jpg';
const SBS = process.env.DR_SBS || 'D:/dredge-ref/notes/sbs.py';
const ONLY = process.env.ONLY || '';
const DEST = 'destination.gm-shipwright-upgrades';

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
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (process.env.DBG) console.log('[console]', m.type(), m.text()); if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// ---------------------------------------------------------------- số kỳ vọng (tính tay, xem đầu tệp)
const COL = { t0: 285, t1: 440, h2: 630, t2: 820, h3: 1010, t3: 1200, h4: 1390, t4: 1580 };
const ROW = { rod: 257, net: 407, storage: 557, engine: 707, light: 857 };
// id → [tâm x, tâm y, rộng, cao, chữ "+N"]. "+N" = số ô: SlotUpgradeData.GetNewCellCount (số ô trong cellGroupConfigs) hoặc newCellCount của thân.
const NODES = {
  'tier-1-fishing-1': [COL.t1, ROW.rod, 120, 64, '+2'], 'tier-1-net-1': [COL.t1, ROW.net, 120, 64, '+4'],
  'tier-1-engines-1': [COL.t1, ROW.engine, 120, 64, '+2'], 'tier-1-lights-1': [COL.t1, ROW.light, 120, 64, '+1'],
  'tier-2-hull': [COL.h2, ROW.storage, 140, 128, '+5'],
  'tier-2-fishing-1': [COL.t2, ROW.rod, 120, 64, '+3'], 'tier-2-storage-1': [COL.t2, ROW.storage, 120, 64, '+4'], 'tier-2-engines-1': [COL.t2, ROW.engine, 120, 64, '+1'],
  'tier-3-hull': [COL.h3, ROW.storage, 140, 128, '+9'],
  'tier-3-fishing-1': [COL.t3, ROW.rod, 120, 64, '+2'], 'tier-3-net-1': [COL.t3, ROW.net, 120, 64, '+2'], 'tier-3-storage-1': [COL.t3, ROW.storage, 120, 64, '+4'],
  'tier-3-engines-1': [COL.t3, ROW.engine, 120, 64, '+1'], 'tier-3-lights-1': [COL.t3, ROW.light, 120, 64, '+1'],
  'tier-4-hull': [COL.h4, ROW.storage, 140, 128, '+15'],
  'tier-4-fishing-1': [COL.t4, ROW.rod, 120, 64, '+2'], 'tier-4-storage-1': [COL.t4, ROW.storage, 120, 64, '+4'], 'tier-4-engines-1': [COL.t4, ROW.engine, 120, 64, '+2'],
  'tier-4-lights-1': [COL.t4, ROW.light, 120, 64, '+1']
};
// Đường nối 4 px: [đường dẫn từ Window, trái, trên, rộng, cao] theo canvas. Mỗi số tính từ RectTransform thô, ví dụ
//   T1StartLine1: neo (0, 0.5) của Lines (trái cột Tier1 = 350), tâm y 557, pivot (1, 0.5), 40x4 → trái 350−40 = 310, trên 557−2 = 555.
//   T1StartLine2: neo giữa, pivot giữa, ap (−90, 0), 4x604 → tâm x 440−90 = 350 → trái 348; trên 557−302 = 255.
//   T1FishingLine1: pivot (0.5, 1), ap (90, 302), 4x154 → tâm x 530 → trái 528; đỉnh y 557−302 = 255.
//   T1LightLine1: pivot (0.5, 0), ap (90, −302), 4x154 → đáy y 859 → trên 705.
//   PreLine/PostLine của nút nhỏ: pivot (1,.5)/(0,.5), ap (∓60, 0), 30x4 quanh tâm nút; của nút hull ap ∓70.
const LINES = {
  'Nodes/Tier1/Lines/T1StartLine1': [310, 555, 40, 4], 'Nodes/Tier1/Lines/T1StartLine2': [348, 255, 4, 604],
  'Nodes/Tier1/Lines/T1FishingLine1': [528, 255, 4, 154], 'Nodes/Tier1/Lines/T1LightLine1': [528, 705, 4, 154],
  'Nodes/Tier2/Lines/T2StartLine1': [728, 255, 4, 454], 'Nodes/Tier4/Lines/T4StartLine1': [1488, 255, 4, 604],
  'Nodes/Tier1/Tier1Fishing1/PreLine': [350, 255, 30, 4], 'Nodes/Tier1/Tier1Fishing1/PostLine': [500, 255, 30, 4],
  'Nodes/UpgradeNodeTier2/PreLine': [530, 555, 30, 4], 'Nodes/UpgradeNodeTier2/PostLine': [700, 555, 30, 4]
};
// giá tiền + vật liệu: MonetaryCost (upgrades.js) và completeConditions đã giải Odin (work-shop-upgrade/upgrade_questgrids.json)
const COST = {
  'tier-1-fishing-1': [95, [['lumber', 2], ['scrap', 1], ['cloth', 1]]], 'tier-1-engines-1': [100, [['lumber', 1], ['scrap', 2]]],
  'tier-1-lights-1': [50, [['lumber', 2], ['scrap', 1]]], 'tier-1-net-1': [125, [['lumber', 1], ['cloth', 2]]],
  'tier-2-hull': [500, [['lumber', 4], ['scrap', 2], ['cloth', 3], ['metal', 1]]],
  'tier-2-engines-1': [75, [['lumber', 2], ['scrap', 2]]],
  'tier-4-hull': [1500, [['lumber', 4], ['scrap', 3], ['cloth', 4], ['metal', 3]]]
};
const POS = '#74d27a', NEU = '#ffffff', DIS = '#6b6b6b', NEG = '#dc2c38';   // GameConfigData.colors cho POSITIVE, NEUTRAL, DISABLED, NEGATIVE
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- trợ giúp trang
async function boot(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  // nhật ký node Yarn đã chạy (để biết hội thoại nào hiện) — chỉ quan sát, không đổi hành vi
  await page.evaluate(() => { window.__nodes = []; DR.on('nodeStart', n => window.__nodes.push(n)); });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
}
const skipIntro = async page => {
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
};
// Bước chuẩn bị (không phải phần đang kiểm): mở sẵn điểm đến, có tiền, bỏ qua màn mở đầu và hội thoại Mayor bằng API.
async function toDock(page, base) {
  await boot(page, base);
  await page.evaluate(d => { DR.s.availableDestinations.push(d); DR.s.funds = 3000; }, DEST);
  await skipIntro(page);
  for (let i = 0; i < 300; i++) {
    const st = await page.evaluate(() => { const s = window.DRDialogue && DRDialogue.state(); return s ? s.kind : null; });
    if (!st && (await page.evaluate(() => DRDock._debug() && DRDock._debug().phase)) === 'ui') return;
    if (st === 'options') { await sleep(800); await page.evaluate(() => DRDialogue.choose(0)); }
    else if (st) await page.evaluate(() => DRDialogue.next());
    await sleep(120);
  }
  throw new Error('dock UI never reached phase ui');
}
// Rời điểm đến → DRDock.leaveDest → enterDock(0) chạy lại node gốc của bến (DockUI.Show). Node GreaterMarrow_Root lúc này không có lời nào
// nên kết thúc NGAY trong DRYarn.run; DRDialogue.start gán `R = run(...)` sau khi view.end đã đặt R = null ⇒ DRDialogue.isOpen() kẹt true
// với một runner đã Ended (DRYarn.current() = null, khung #dr-dlg đã tắt). Lỗi của js/dialogue.js (không thuộc ụ tàu; mọi điểm đến đều qua
// đường này). Nên "bến sẵn sàng" = phase 'ui' và (không còn hội thoại, HOẶC hội thoại chỉ là runner đã chết + khung tắt). Hội thoại thật
// (còn runner chạy hoặc khung đang hiện) vẫn được đi hết bằng phím Space.
const dockReady = async page => {
  const t0 = Date.now(), snap = () => page.evaluate(() => {
    const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
    return { ready: !!d && d.phase === 'ui' && (!open || !live), stale: open && !live, st: open ? DRDialogue.state() : null };
  });
  for (;;) {
    const s = await snap();
    if (s.ready) { if (s.stale && !out.some(l => l.includes('R kẹt'))) out.push('  · ghi nhận: DRDialogue.isOpen() kẹt true sau khi về bến (R kẹt: node gốc kết thúc ngay trong start); js/dialogue.js cần gán R trước khi chạy'); return; }
    if (Date.now() - t0 > 20000) throw new Error('dockReady quá hạn: ' + JSON.stringify(await page.evaluate(() => ({ dock: DRDock._debug(), dlg: DRDialogue.isOpen(), dlgState: DRDialogue.state(), upg: DRUpgrade.isOpen(), y: !!DRYarn.current() }))));
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]');
    else if (s.st) await page.keyboard.press('Space');
    await sleep(400);
  }
};

// Bấm nút "Ụ tàu" của bến rồi đi hết hội thoại bằng phím Space / chuột thật tới khi cửa sổ hiện.
// force: ở cỡ điện thoại nút điểm đến của bến bị .dk-boat (js/dock.js, css/story.css do root giữ) đè lên; thử bấm thật trước, bị che thì phát sự kiện click.
async function openDryDock(page, force) {
  await page.evaluate(() => { window.__nodes.length = 0; });
  const sel = '.dk-dest[data-dest="' + DEST + '"]';
  if (force) {
    try { await page.click(sel, { timeout: 2500 }); }
    catch (e) {
      if (!out.some(l => l.includes('.dk-boat đè'))) out.push('  · ghi nhận: ở cỡ điện thoại nút "Ụ tàu" của bến bị .dk-boat đè (' + String(e.message).split('\n').find(l => /intercepts/.test(l)) + '); mở bằng sự kiện click');
      const rc = await page.evaluate(sel => { const f = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); }; const d = document.querySelector(sel), r = d.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { btn: f(d.querySelector('.btn')), dest: f(d), over: t && (t.className + ' / ' + t.parentElement.className), boat: f(document.querySelector('.dk-boat')), boatPe: getComputedStyle(document.querySelector('.dk-boat')).pointerEvents }; }, sel);
      if (!out.some(l => l.includes('rects'))) out.push('  · rects (l,t,w,h) ' + JSON.stringify(rc));
      await page.dispatchEvent(sel, 'click');
    }
  } else await page.click(sel);
  const kinds = [];
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => DRUpgrade.isOpen())) break;
    const st = await page.evaluate(() => { const s = window.DRDialogue && DRDialogue.state(); return s ? s.kind : null; });
    if (st) kinds.push(st);
    if (st === 'options') { await sleep(800); await page.click('.dlg-opt[data-index="0"]'); }
    else if (st) await page.keyboard.press('Space');
    await sleep(550);
  }
  if (!(await page.evaluate(() => DRUpgrade.isOpen()))) throw new Error('upgrade window never opened');
  await sleep(700);                                                              // chờ cửa sổ hiện hết (mờ dần 0,35 s)
  return { nodes: await page.evaluate(() => window.__nodes.slice()), kinds };
}
// đọc điểm ảnh của ảnh chụp ngay trong trang (không cần thư viện PNG)
async function pixels(page, buf, pts) {
  return page.evaluate(async ({ b64, pts }) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    return pts.map(([x, y]) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3));
  }, { b64: buf.toString('base64'), pts });
}
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const closeRgb = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const tint = (c, h) => c.map((v, i) => Math.round(v * hexRgb(h)[i] / 255));      // Image.color nhân vào sprite

// ---------------------------------------------------------------- một lượt kiểm giao diện ở cỡ W x H
async function run(browser, base, W, H, full) {
  const tag = W + 'x' + H;
  out.push('\n[giao diện ' + tag + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !full });
  const page = await ctx.newPage();
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const ev = (f, a) => page.evaluate(f, a);
  const dbg = () => ev(() => DRUpgrade._debug());
  const s = Math.min(H / 1080, W / 1920);                                          // hệ số canvas → px
  const tol = 2 * s + 0.01;                                                        // "trong 2 đơn vị canvas"
  const X = x => W / 2 + (x - 960) * s, Y = y => H / 2 + (y - 540) * s;            // toạ độ canvas 1920x1080 → px
  const centerOf = id => ev(id => { const r = document.querySelector('.up-nd[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const hover = async id => { const p = await centerOf(id); await page.mouse.move(p.x, p.y, { steps: 5 }); await sleep(520); };
  const clickNode = async id => { const p = await centerOf(id); await page.mouse.move(p.x, p.y, { steps: 4 }); await page.mouse.down(); await page.mouse.up(); await sleep(650); };
  const tipInfo = () => ev(() => {
    const t = document.querySelector('.up-tip');
    if (!t || !t.classList.contains('on')) return null;
    const mv = t.querySelector('.mv');
    return { text: t.textContent, title: (t.querySelector('.nm') || {}).textContent, desc: (t.querySelector('.ds') || {}).textContent, money: mv ? mv.textContent : null,
      moneyColor: mv ? getComputedStyle(mv).color : null,
      cells: [...t.querySelectorAll('.c')].map(c => ({ item: c.dataset.item, have: +c.dataset.have, need: +c.dataset.need, label: c.querySelector('b').textContent, color: c.querySelector('b').style.getPropertyValue('--c'), icon: c.querySelector('.im').style.getPropertyValue('--sp') })),
      prompt: (t.querySelector('.pr span') || {}).textContent || null, box: (() => { const r = t.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })() };
  });
  const give = ids => ev(ids => ids.map(id => !!DR.give(id)), ids);
  // Mua bằng lưới "Materials Required" (UpgradeGridPanel): cài sẵn vật liệu từ khoang vào lưới đã lưu của nâng cấp, rồi bấm nút bằng chuột/chạm.
  // Phép kéo từng món bằng chuột thật được kiểm ở test/dredge-r2upgrade.js.
  const deliver = id => ev(id => {
    const u = DR_UPGRADES[id], q = u.questGrid, inv = DR.grid('INVENTORY');
    if (!DR.s.grids[q.gridKey]) DR.resetGrid(q.gridKey, q.gridConfiguration);
    const g = DR.grid(q.gridKey);
    for (const it of q.presetGrid.spatialItems) {                                   // đặt đúng ô bóng mờ (presetGrid) bằng món thật lấy từ khoang
      const inst = inv.items.find(i => i.id === it.id); if (!inst) return false;
      DRGrid.remove(inv, inst);
      if (!DRGrid.place(g, DR.item(it.id), it.x, it.y, it.z || 0)) return false;
    }
    return true;
  }, id);
  const BUYBTN = '.cg-btn[data-act="purchase"]';
  // ô (x, y) của INVENTORY có nhận vật phẩm id không (GridCellData.CanAccept): [[x, y, id], ...] → [bool, ...]
  const cellsOk = list => ev(l => l.map(([x, y, id]) => { const g = DR.grid('INVENTORY'); return DRGrid.accepts(g.cells[y * g.cols + x], DR.item(id)); }), list);
  const closeAll = async () => { await ctx.close(); };

  // ===== vào bến, mở ụ tàu bằng chuột và phím thật =====
  await toDock(page, base);
  check('bến hiện giao diện với nút "Ụ tàu"', (await ev(() => DRDock._debug().dests)).includes(DEST));
  const first = await openDryDock(page, !full);
  check('lần đầu: chạy node Shipwright_DryDock_Root → Shipwright_DryDock_Unlocked (có lựa chọn) rồi mới hiện cửa sổ',
    first.nodes.includes('Shipwright_DryDock_Root') && first.nodes.includes('Shipwright_DryDock_Unlocked') && first.kinds.includes('options'), first.nodes.join(' > ') + ' | ' + first.kinds.join(','));
  await shot('1-window');
  const d0 = await dbg();
  check('DRDock đang ở điểm đến Ụ tàu; cửa sổ ở tầng cây (stage tree)', d0.stage === 'tree' && (await ev(() => DRDock._debug().dest)) === DEST);
  const wantWin = [X(120), Y(130), 1680 * s, 820 * s], gotWin = [d0.win.x, d0.win.y, d0.win.w, d0.win.h];
  check('cửa sổ UpgradeWindow 1680x820 ở giữa màn', gotWin.every((v, i) => near(v, wantWin[i], tol)), 'được ' + gotWin.map(r1) + ' cần ' + wantWin.map(r1));
  check('bản cơ bản: không có nút Tier5 và các đường Tier5 (allowHullTier5Content = false)', d0.allowT5 === false && d0.nodes['tier-5-hull'] === undefined
    && !(await ev(() => document.querySelector('[data-n="UpgradeNodeTier5"]'))) && !(await ev(() => document.querySelector('[data-p="Nodes/Tier4/Lines/T4FishingLine1"]'))));
  // --- vị trí nút (trái trên + cỡ) theo đơn vị canvas, sai số 2
  const badPos = [];
  for (const [id, [cx, cy, w, h]] of Object.entries(NODES)) {
    const n = d0.nodes[id], want = [X(cx - w / 2), Y(cy - h / 2), w * s, h * s];
    if (!n || [n.x, n.y, n.w, n.h].some((v, i) => !near(v, want[i], tol))) badPos.push(id + ' ' + (n ? [n.x, n.y, n.w, n.h].map(r1) : 'thiếu') + ' cần ' + want.map(r1));
  }
  check('19 nút nâng cấp đúng vị trí và cỡ đo ở bản gốc (±2 đơn vị canvas)', badPos.length === 0 && Object.keys(d0.nodes).length === 19, badPos.join(' | ') || '19/19');
  const t0 = d0.lines['Nodes/Tier0/StartingNode'];
  check('hình thoi Tier0 70x70, tâm (285, 557)', !!t0 && near(t0.x, X(250), tol) && near(t0.y, Y(522), tol) && near(t0.w, 70 * s, tol) && near(t0.h, 70 * s, tol), t0 && [t0.x, t0.y, t0.w].map(r1).join(','));
  const badLines = [];
  for (const [p, [l, t, w, h]] of Object.entries(LINES)) {
    const b = d0.lines[p], want = [X(l), Y(t), w * s, h * s];
    if (!b || [b.x, b.y, b.w, b.h].some((v, i) => !near(v, want[i], tol))) badLines.push(p + ' ' + (b ? [b.x, b.y, b.w, b.h].map(r1) : 'thiếu') + ' cần ' + want.map(r1));
  }
  check('đường nối 4 px (thân trái/phải, nhánh, PreLine/PostLine 30x4, thân Tier2 ngắn 454) đúng vị trí', badLines.length === 0, badLines.join(' | ') || Object.keys(LINES).length + '/' + Object.keys(LINES).length);
  eq('chữ "+N" trên nút = số ô thêm', Object.keys(NODES).map(id => d0.nodes[id].text), Object.values(NODES).map(v => v[4]));
  const texts = Object.fromEntries(d0.texts.map(t => [t.n, t.t]));
  eq('tiêu đề cửa sổ và dòng Header (khoá upgrades.header, upgrades.header.description)', [texts['Title/Text'], texts['Header/Description']], ['Upgrades', 'Select an upgrade project to begin adding materials to it.']);
  eq('ba nút hull ghi "New Hull" (khoá upgrades.hull-upgrade)', ['Nodes/UpgradeNodeTier2/SubtitleText', 'Nodes/UpgradeNodeTier3/SubtitleText', 'Nodes/UpgradeNodeTier4/SubtitleText'].map(p => texts[p]), ['New Hull', 'New Hull', 'New Hull']);
  const fsz = Object.fromEntries(d0.texts.map(t => [t.n, t.size]));
  check('cỡ chữ gốc: tiêu đề 49,65; Header 30; "+N" 50; "New Hull" 40; "+15" thu nhỏ vừa khung (autosize)',
    near(fsz['Title/Text'], 49.65, 0.02) && near(fsz['Header/Description'], 30, 0.02) && near(fsz['Nodes/Tier1/Tier1Fishing1/TitleText'], 50, 0.02)
    && near(fsz['Nodes/UpgradeNodeTier2/SubtitleText'], 40, 0.02) && fsz['Nodes/UpgradeNodeTier4/TitleText'] <= 50, JSON.stringify([fsz['Title/Text'], fsz['Header/Description'], fsz['Nodes/Tier1/Tier1Fishing1/TitleText'], fsz['Nodes/UpgradeNodeTier2/SubtitleText'], fsz['Nodes/UpgradeNodeTier4/TitleText']]));

  // --- trạng thái ban đầu: chưa có gì ⇒ bốn nút Tier1 NEUTRAL, còn lại DISABLED; hình thoi + đường tiền đề của Tier1 POSITIVE
  {
    const T1 = ['tier-1-fishing-1', 'tier-1-net-1', 'tier-1-engines-1', 'tier-1-lights-1'];                       // literal, không suy từ NODES
    const neutral = Object.keys(d0.nodes).filter(id => d0.nodes[id].state === 'neutral' && d0.nodes[id].color === NEU).sort();
    const disabled = Object.keys(d0.nodes).filter(id => d0.nodes[id].state === 'disabled' && d0.nodes[id].color === DIS);
    eq('trạng thái lúc đầu: đúng 4 nút Tier1 NEUTRAL (trắng #ffffff)', neutral, T1.slice().sort());
    check('trạng thái lúc đầu: 15 nút còn lại DISABLED (xám #6b6b6b)', disabled.length === 15 && disabled.every(id => !T1.includes(id)) && Object.keys(d0.nodes).length === 19, disabled.length + '/15');
  }
  eq('hình thoi Tier0, T1StartLine2, PreLine Tier1 xanh POSITIVE; T1NetLine1 và PreLine hull 2 xám DISABLED',
    [d0.lines['Nodes/Tier0/StartingNode'].color, d0.lines['Nodes/Tier1/Lines/T1StartLine2'].color, d0.lines['Nodes/Tier1/Tier1Net1/PreLine'].color, d0.lines['Nodes/Tier1/Lines/T1NetLine1'].color, d0.lines['Nodes/UpgradeNodeTier2/PreLine'].color],
    [POS, POS, POS, DIS, DIS]);
  if (full) {
    // màu thật trên ảnh chụp: nền nút = sprite kem × màu trạng thái (Image.color nhân), đường nối = màu đặc. Điểm lấy: dải kem phía trên chữ "+N" (+90, +7) của nút nhỏ.
    const buf0 = await page.screenshot();
    const at = (id, dx, dy) => [d0.nodes[id].x + dx * s, d0.nodes[id].y + dy * s];
    const px0 = await pixels(page, buf0, [at('tier-1-fishing-1', 90, 7), at('tier-1-net-1', 90, 7), at('tier-2-fishing-1', 90, 7), at('tier-2-hull', 68, 121), [X(350), Y(400)], [X(530), Y(300)], [X(285), Y(530)]]);
    const cream = px0[0];
    check('ảnh chụp: nút NEUTRAL là sprite kem × trắng (sáng, không xám)', cream.every(v => v > 200) && closeRgb(px0[1], cream, 2), hex(px0[0]) + ' / ' + hex(px0[1]));
    check('ảnh chụp: nút DISABLED = kem × #6b6b6b (nhân từng kênh, ±3); nút hull DISABLED cùng màu', closeRgb(px0[2], tint(cream, DIS), 3) && closeRgb(px0[3], tint(cream, DIS), 3), hex(px0[2]) + ' / ' + hex(px0[3]) + ' cần ' + hex(tint(cream, DIS)));
    check('ảnh chụp: thân trái Tier1 xanh #74d27a, thân phải xám #6b6b6b', closeRgb(px0[4], hexRgb(POS), 3) && closeRgb(px0[5], hexRgb(DIS), 3), hex(px0[4]) + ' / ' + hex(px0[5]));
    check('ảnh chụp: hình thoi Tier0 (viền sprite × #74d27a, lấy ở (285,530) gần đỉnh trên) ngả xanh lá', px0[6][1] > px0[6][0] + 40 && px0[6][1] > px0[6][2] + 40, hex(px0[6]));
  }

  // ===== tooltip (rê chuột thật) =====
  await hover('tier-1-fishing-1');
  let tip = await tipInfo();
  check('rê nút +2 Rod: tooltip có tên, mô tả, "Cost:", giá, ô vật liệu và dòng "Show Details"',
    !!tip && tip.title === '+2 Rod Spaces' && tip.desc === 'Modifies 2 cargo spaces to also hold Rods.' && tip.text.includes('Cost:') && tip.money === '$95.00' && tip.prompt === 'Show Details',
    tip && JSON.stringify([tip.title, tip.desc, tip.money, tip.prompt]));
  eq('vật liệu (đúng thứ tự completeConditions): gỗ 0/2, sắt vụn 0/1, vải 0/1 — đỏ vì thiếu', tip.cells.map(c => [c.item, c.label, c.color]), [['lumber', '0/2', NEG], ['scrap', '0/1', NEG], ['cloth', '0/1', NEG]]);
  check('ô vật liệu dùng itemTypeIcon của vật phẩm (WoodIcon, ScrapMetalIcon, BoltOfClothIcon)', /WoodIcon.*ScrapMetalIcon.*BoltOfClothIcon/.test(tip.cells.map(c => c.icon).join('|')), tip.cells.map(c => c.icon.slice(-30)).join(' '));
  check('tooltip nằm trong màn hình', tip.box.l >= 0 && tip.box.t >= 0 && tip.box.r <= W && tip.box.b <= H, JSON.stringify(tip.box));
  await shot('2-tooltip-rod');
  await ev(() => { DR.s.funds = 90; DR.emit('funds', DR.s.funds, 0); }); await sleep(100);
  tip = await tipInfo();
  check('thiếu tiền ($90 < $95): giá hiện đỏ NEGATIVE', !!tip && tip.moneyColor === 'rgb(220, 44, 56)', tip && tip.moneyColor);
  await ev(() => { DR.s.funds = 3000; DR.emit('funds', DR.s.funds, 0); });
  await hover('tier-2-hull');
  tip = await tipInfo();
  eq('nút thân bậc 2 (chưa mở): tên, dòng đầu mô tả, giá, vật liệu; không có "Show Details" vì chưa bấm được',
    tip && [tip.title, tip.desc.split('\n')[0], tip.money, tip.cells.map(c => c.item + c.need), tip.prompt],
    ['Tier 2 Hull Upgrade', 'Upgrades your vessel to a tier 2 hull and adds 5 new cargo spaces.', '$500.00', ['lumber4', 'scrap2', 'cloth3', 'metal1'], null]);
  await shot('3-tooltip-hull');
  const badCost = [];
  for (const [id, [money, items]] of Object.entries(COST)) {
    await hover(id);
    const t = await tipInfo();
    if (!t || t.money !== '$' + money.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') || !same(t.cells.map(c => [c.item, c.need]), items)) badCost.push(id + ' ' + JSON.stringify(t && [t.money, t.cells.map(c => [c.item, c.need])]));
  }
  check('giá tiền + vật liệu của 7 nâng cấp mẫu khớp completeConditions đã giải Odin', badCost.length === 0, badCost.join(' | ') || '7/7');
  await page.mouse.move(W / 2, H - 4, { steps: 3 }); await sleep(450);
  check('rời nút: tooltip tắt', (await tipInfo()) === null);

  // ===== Esc đóng cửa sổ (không mở menu tạm dừng) =====
  await page.keyboard.press('Escape'); await sleep(600);
  check('Esc đóng cửa sổ, về bến, không mở menu tạm dừng', !(await ev(() => DRUpgrade.isOpen())) && (await ev(() => document.getElementById('dr-pause').hidden)) && (await ev(() => DRDock._debug().dest)) === null);

  if (!full) {
    // ----- cỡ điện thoại: mở lại (hội thoại "Return"), thẻ chi tiết và nút Back bằng chạm -----
    await ev(() => { for (const id of ['lumber', 'lumber', 'scrap', 'cloth']) DR.give(id); });
    await dockReady(page);
    const again = await openDryDock(page, true);
    check('lần sau chưa mua: chỉ node Shipwright_DryDock_Return (một câu, không lựa chọn)', again.nodes.includes('Shipwright_DryDock_Return') && !again.nodes.includes('Shipwright_DryDock_Unlocked') && !again.kinds.includes('options'), again.nodes.join(' > '));
    check('chuẩn bị lưới vật liệu Rod +2 (2 gỗ, 1 sắt vụn, 1 vải)', await deliver('tier-1-fishing-1'));
    const p = await centerOf('tier-1-fishing-1');
    await page.touchscreen.tap(p.x, p.y); await sleep(900);
    const card = await ev(() => { const c = document.querySelector('.cg-left'); const r = c.getBoundingClientRect(); return { stage: DRUpgrade._debug().stage, vis: getComputedStyle(c).display !== 'none', l: r.left, t: r.top, r: r.right, b: r.bottom, buy: !!c.querySelector('[data-act="purchase"]:not([disabled])') }; });
    check('chạm nút: bảng "Materials Required" hiện đủ trong màn, nút Purchase bấm được', card.stage === 'card' && card.vis && card.l >= -0.5 && card.t >= -0.5 && card.r <= W + 0.5 && card.b <= H + 0.5 && card.buy, JSON.stringify(card));
    await shot('card');
    await page.touchscreen.tap(...(await ev(() => { const r = document.querySelector('.cg-left [data-act="done"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }))); await sleep(700);
    eq('nút Xong của bảng về cây (chưa mua gì)', [await ev(() => DRUpgrade._debug().stage), await ev(() => DR.s.upgrades || [])], ['tree', []]);
    await hover('tier-1-net-1');
    tip = await tipInfo();
    check('tooltip ở cỡ điện thoại nằm trong màn hình', !!tip && tip.box.l >= 0 && tip.box.t >= 0 && tip.box.r <= W && tip.box.b <= H, tip && JSON.stringify(tip.box));
    await shot('tooltip');
    await page.touchscreen.tap(...(await ev(() => { const r = document.querySelector('.up-back').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }))); await sleep(500);
    check('chạm nút "Back X" đóng cửa sổ', !(await ev(() => DRUpgrade.isOpen())));
    check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
    await closeAll();
    return;
  }

  // ===== mua nâng cấp ô bằng chuột (Rod +2) =====
  await ev(() => { for (const id of ['lumber', 'lumber', 'scrap', 'cloth']) DR.give(id); });
  await dockReady(page);
  const second = await openDryDock(page);
  check('lần sau chưa mua: chỉ node Shipwright_DryDock_Return (một câu, không lựa chọn)', second.nodes.includes('Shipwright_DryDock_Return') && !second.nodes.includes('Shipwright_DryDock_Unlocked') && !second.kinds.includes('options'), second.nodes.join(' > '));
  eq('trước khi mua: ô (4,3) và (4,4) của Tier1Hull không nhận cần câu', await cellsOk([[4, 3, 'rod1'], [4, 4, 'rod1']]), [false, false]);
  check('chuẩn bị lưới vật liệu Rod +2 (2 gỗ, 1 sắt vụn, 1 vải)', await deliver('tier-1-fishing-1'));
  await clickNode('tier-1-fishing-1');
  await sleep(500);
  await shot('4-card');
  const card = await ev(() => { const c = document.querySelector('.cg-left'); return { stage: DRUpgrade._debug().stage, title: c.querySelector('.cg-name').textContent, buy: c.querySelector('[data-act="purchase"]').textContent, dis: c.querySelector('[data-act="purchase"]').disabled, cells: [...document.querySelectorAll('.cg-left .cg-item, .cg-left [data-id]')].length }; });
  eq('bấm nút bấm được: bảng "Materials Required" với nút Purchase Upgrade [$95.00] bấm được khi lưới đủ', [card.stage, card.title, card.buy, card.dis], ['card', 'Materials Required', 'Purchase Upgrade [$95.00]', false]);
  const q = await centerOf('tier-1-net-1'); await page.mouse.move(q.x, q.y - 4, { steps: 3 }); await sleep(450);
  check('bảng đang mở: các nút nâng cấp không rê/tooltip được', (await tipInfo()) === null);
  const fundsBefore = await ev(() => DR.s.funds);
  await page.click(BUYBTN); await sleep(700);
  const bought = await ev(() => ({ owned: DR.s.upgrades, funds: DR.s.funds, inv: DR.grid('INVENTORY').items.map(i => i.id).sort(), flag: DR.s.vars['upgrade-bought'], stage: DRUpgrade._debug().stage, saved: JSON.parse(localStorage.getItem('dredge.save.v1')).upgrades }));
  eq('mua Rod +2: sở hữu tier-1-fishing-1, trừ $95, mất đúng 2 gỗ + 1 sắt vụn + 1 vải (đã giao), cờ upgrade-bought, đã lưu',
    [bought.owned, bought.funds, bought.inv, bought.flag, bought.saved], [['tier-1-fishing-1'], fundsBefore - 95, ['engine1', 'rod1'], true, ['tier-1-fishing-1']]);
  check('mua xong bảng đóng, quay về cây', bought.stage === 'tree');
  eq('nâng cấp ô Rod: (4,3),(4,4) nhận cần câu; ô kế bên (3,3) vẫn không', await cellsOk([[4, 3, 'rod1'], [4, 4, 'rod1'], [3, 3, 'rod1']]), [true, true, false]);
  const d1 = await dbg();
  eq('nút Rod thành POSITIVE; PostLine + nhánh phải T1FishingLine1 xanh; hull bậc 2 vẫn DISABLED (còn thiếu 3 nâng cấp)',
    [d1.nodes['tier-1-fishing-1'].state + ':' + d1.nodes['tier-1-fishing-1'].color, d1.lines['Nodes/Tier1/Tier1Fishing1/PostLine'].color, d1.lines['Nodes/Tier1/Lines/T1FishingLine1'].color, d1.nodes['tier-2-hull'].state],
    ['positive:' + POS, POS, POS, 'disabled']);
  await page.mouse.move(W / 2, H - 4); await sleep(300);
  const px1 = await pixels(page, await page.screenshot(), [[d1.nodes['tier-1-net-1'].x + 90 * s, d1.nodes['tier-1-net-1'].y + 7 * s], [d1.nodes['tier-1-fishing-1'].x + 90 * s, d1.nodes['tier-1-fishing-1'].y + 7 * s]]);
  check('ảnh chụp: nút đã sở hữu = kem × #74d27a (xanh), nút NEUTRAL bên cạnh vẫn kem', closeRgb(px1[1], tint(px1[0], POS), 3), hex(px1[1]) + ' cần ' + hex(tint(px1[0], POS)));
  await hover('tier-1-fishing-1');
  tip = await tipInfo();
  check('nút đã sở hữu: tooltip chỉ còn tên và mô tả (không giá, không Show Details)', !!tip && tip.title === '+2 Rod Spaces' && tip.money === null && tip.cells.length === 0 && tip.prompt === null);
  await clickNode('tier-1-fishing-1');
  await clickNode('tier-2-fishing-1');
  eq('bấm nút đã sở hữu / nút DISABLED: không mở thẻ', await ev(() => DRUpgrade._debug().stage), 'tree');
  await clickNode('tier-1-engines-1'); await sleep(400);
  const dis = await ev(() => { const b = document.querySelector('.cg-left [data-act="purchase"]'); return [b.disabled, DRUpgrade.have('lumber', 'tier-1-engines-1'), DRUpgrade.have('scrap', 'tier-1-engines-1')]; });
  eq('lưới chưa có vật liệu: nút Purchase tắt, đã giao 0 gỗ và 0 sắt vụn', dis, [true, 0, 0]);
  await ev(() => { window.__played = []; const e = DRAudio.play; DRAudio.play = function (k) { window.__played.push(k); return e.apply(this, arguments); }; });
  const refused = await ev(() => { const r = DRUpgrade.purchase('tier-1-engines-1'); return { r, owned: DR.s.upgrades.length, played: window.__played.slice(), stage: DRUpgrade._debug().stage }; });
  check('purchase() khi thiếu vật liệu: từ chối { ok: false, why: "materials" }, không mua, phát tiếng ui.error, bảng vẫn mở', refused.r.ok === false && refused.r.why === 'materials' && refused.owned === 1 && refused.played.includes('ui.error') && refused.stage === 'card', JSON.stringify(refused));
  await page.keyboard.press('Escape'); await sleep(450);
  eq('Esc khi bảng đang mở: đóng bảng trước, cửa sổ vẫn mở', [await ev(() => DRUpgrade._debug().stage), await ev(() => DRUpgrade.isOpen())], ['tree', true]);

  // ===== ba nâng cấp ô còn lại của Tier1: mỗi cái mở đúng ô =====
  const buy = async (id, mats) => {
    await ev(mats => { for (const m of mats) DR.give(m); }, mats);
    await deliver(id);
    await clickNode(id); await sleep(300);
    await page.click(BUYBTN); await sleep(600);
  };
  await buy('tier-1-engines-1', ['lumber', 'scrap', 'scrap']);
  await buy('tier-1-lights-1', ['lumber', 'lumber', 'scrap']);
  await buy('tier-1-net-1', ['lumber', 'cloth', 'cloth']);
  eq('Engine +2 mở (1,6),(4,6) (không mở (1,5)); Light +1 mở (2,0) (không mở (2,1)); Net +4 mở (0,3),(1,4) (không mở (5,3))',
    await cellsOk([[1, 6, 'engine1'], [4, 6, 'engine1'], [1, 5, 'engine1'], [2, 0, 'light1'], [2, 1, 'light1'], [0, 3, 'net1'], [1, 4, 'net1'], [5, 3, 'net1']]),
    [true, true, false, true, false, true, true, false]);
  const d2 = await dbg();
  eq('đủ 4 nâng cấp Tier1: cả bốn POSITIVE, PreLine hull 2 xanh, hull 2 NEUTRAL, PostLine hull 2 còn xám',
    [['tier-1-fishing-1', 'tier-1-net-1', 'tier-1-engines-1', 'tier-1-lights-1'].map(id => d2.nodes[id].state), d2.lines['Nodes/UpgradeNodeTier2/PreLine'].color, d2.nodes['tier-2-hull'].state + ':' + d2.nodes['tier-2-hull'].color, d2.lines['Nodes/UpgradeNodeTier2/PostLine'].color],
    [['positive', 'positive', 'positive', 'positive'], POS, 'neutral:' + NEU, DIS]);
  eq('ngưỡng hỏng ở bậc 1', await ev(() => DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier)), 3);

  // ===== nâng thân bậc 2: khoang đầy đồ, mua bằng chuột =====
  await page.keyboard.press('Escape'); await sleep(600);
  await ev(() => { window.__loops = []; window.__stops = []; const L = DRAudio.loop, S = DRAudio.stopLoop; DRAudio.loop = function (k) { __loops.push(k); return L.apply(this, arguments); }; DRAudio.stopLoop = function (k) { __stops.push(k); return S.apply(this, arguments); }; });
  // Khoang bậc 1 chỉ vừa ~36 ô cho đồ thường mà vật liệu hull 2 đã chiếm 30 ô: nhường chỗ bằng cách gỡ rod1 và engine1 mặc định (thứ tự "thiết bị lớn trước" kiểm đủ bộ ở phần ONLY=apply).
  await ev(() => { const g = DR.grid('INVENTORY'); for (const id of ['rod1', 'engine1']) { const r = g.items.find(i => i.id === id); if (r) DRGrid.remove(g, r); } });
  const put = await give(['dredge1', 'light1', 'metal', 'scrap', 'scrap', 'lumber', 'lumber', 'lumber', 'lumber', 'cloth', 'cloth', 'cloth', 'pot1']);
  let fishN = 0;
  while (await ev(() => !!DR_DEBUG.give('anchovy', { size: 0.5, fresh: DR_CONFIG.maxFreshness })) && fishN < 40) fishN++;
  check('chuẩn bị khoang đầy: dredge, đèn, bẫy và đủ vật liệu hull 2 (4 gỗ, 2 sắt, 3 vải, 1 kim loại tinh) + ' + fishN + ' cá', put.every(Boolean), JSON.stringify(put) + ' còn trong khoang trước khi đưa: ' + JSON.stringify(await ev(() => DR.grid('INVENTORY').items.map(i => i.id))));
  const before = await ev(() => DR.grid('INVENTORY').items.map(i => i.id));
  await dockReady(page);
  await page.click('.dk-dest[data-dest="' + DEST + '"]');
  await page.waitForFunction(() => DRUpgrade.isOpen(), null, { timeout: 15000 });
  await sleep(700);
  check('đã mua nâng cấp nên Shipwright_DryDock_Root bỏ qua hội thoại, cửa sổ hiện ngay (upgrade-bought)', await ev(() => !DRYarn.current() && !document.getElementById('dr-dlg').classList.contains('on')));   // không dùng DRDialogue.isOpen(): xem ghi chú ở dockReady
  eq('trước khi nâng: vòng máy gọi theo bậc 1', await ev(() => __loops.filter(k => /^boat\.engine\./.test(k)).slice(-1)[0]), 'boat.engine.1');
  eq('nút hull 2 NEUTRAL; thân hiện là Tier1Hull 6x9', [await ev(() => DRUpgrade.state('tier-2-hull')), await ev(() => [DR.s.grids.INVENTORY.cfg, DR.grid('INVENTORY').cols, DR.grid('INVENTORY').rows])], ['neutral', ['Tier1Hull', 6, 9]]);
  const money0 = await ev(() => DR.s.funds);
  check('chuẩn bị lưới vật liệu hull 2', await deliver('tier-2-hull'));
  await clickNode('tier-2-hull'); await sleep(400);
  await shot('5-card-hull');
  await page.click(BUYBTN); await sleep(900);
  const after = await ev(() => {
    const inv = DR.grid('INVENTORY'), sto = DR.grid('STORAGE'), G = DRGrid;
    const grp = i => { const d = DR.item(i.id), t = G.typeOf(d), sb = G.subOf(d); return t === G.TYPE.EQUIPMENT ? (sb === G.SUB.DREDGE ? 0 : sb === G.SUB.POT ? 3 : 1) : sb === G.SUB.FISH ? 4 : 2; };
    const byUid = inv.items.slice().sort((a, b) => a.uid - b.uid), gear = byUid.filter(i => grp(i) === 1).map(i => DR.item(i.id).dims.length);
    return { cfg: DR.s.grids.INVENTORY.cfg, cols: inv.cols, rows: inv.rows, tier: DR.s.hullTier, funds: DR.s.funds, damage: inv.damage.length,
      inv: inv.items.map(i => i.id).sort(), sto: sto.items.map(i => i.id).sort(),
      uids: new Set(inv.items.map(i => i.uid)).size === inv.items.length, onCells: inv.items.every(i => i.cells.every(([x, y]) => G.accepts(inv.cells[y * inv.cols + x], DR.item(i.id)))),
      order: byUid.map(grp), gear, thr: DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier), boat2: DRBoat.model.getObjectByName('Boat2').visible, boat1: DRBoat.model.getObjectByName('Boat1').visible };
  });
  await sleep(300);
  const lastLoop = await ev(() => __loops.filter(k => /^boat\.engine\./.test(k)).slice(-1)[0]);
  const stops = await ev(() => __stops.slice());
  eq('nâng thân: INVENTORY cấu hình Tier2Hull, lưới 7x10, hullTier 2', [after.cfg, after.cols, after.rows, after.tier], ['Tier2Hull', 7, 10, 2]);
  const kept = before.filter(id => !['lumber', 'scrap', 'cloth', 'metal'].includes(id)).sort();
  eq('mọi đồ giữ nguyên (khoang + kho): thiết bị, dredge, bẫy, cá; vật liệu đã trừ', after.inv.concat(after.sto).sort(), kept);
  eq('khoang to hơn nên kho (STORAGE) không nhận thêm gì', after.sto, []);
  check('đồ nằm đúng ô nhận loại của nó trong lưới mới, uid không trùng', after.onCells && after.uids);
  check('thứ tự xếp lại: dredge → thiết bị khác (lớn trước) → đồ thường → bẫy → cá', after.order.every((g, i) => i === 0 || g >= after.order[i - 1]) && after.gear.every((n, i) => i === 0 || n <= after.gear[i - 1]), JSON.stringify([after.order, after.gear]));
  eq('trừ $500 đúng một lần; vết hỏng 0', [after.funds, after.damage], [money0 - 500, 0]);
  eq('mô hình thuyền: Boat2 hiện, Boat1 ẩn', [after.boat2, after.boat1], [true, false]);
  eq('vòng máy: gọi boat.engine.2 sau khi nâng, và tắt vòng boat.engine.1 của bậc cũ', [lastLoop, stops.includes('boat.engine.1')], ['boat.engine.2', true]);
  eq('ngưỡng hỏng đi theo bậc: 3 → 4', [3, after.thr], [3, 4]);
  eq('hull 2 thành POSITIVE; các nâng cấp ô Tier2 thành NEUTRAL; PostLine hull 2 và T2StartLine1 xanh', await ev(() => ({ s: ['tier-2-hull', 'tier-2-fishing-1', 'tier-2-storage-1', 'tier-2-engines-1', 'tier-3-hull'].map(id => DRUpgrade.state(id)), l: [DRUpgrade._debug().lines['Nodes/UpgradeNodeTier2/PostLine'].color, DRUpgrade._debug().lines['Nodes/Tier2/Lines/T2StartLine1'].color] })),
    { s: ['positive', 'neutral', 'neutral', 'neutral', 'disabled'], l: [POS, POS] });
  eq('nâng cấp ô của bậc 1 không áp lên lưới bậc 2: ô (4,3) của Tier2Hull vẫn không nhận cần câu', await cellsOk([[4, 3, 'rod1']]), [false]);
  await shot('6-after-hull');
  await page.keyboard.press('Escape'); await sleep(600);

  // ===== nâng cấp ô của bậc mới + lưu / nạp lại =====
  await ev(() => { DR.give('lumber'); DR.give('lumber'); DR.give('scrap'); DR.give('scrap'); });
  await dockReady(page);
  await page.click('.dk-dest[data-dest="' + DEST + '"]');
  await page.waitForFunction(() => DRUpgrade.isOpen(), null, { timeout: 15000 });
  await sleep(600);
  const e0 = (await cellsOk([[3, 6, 'engine1']]))[0];
  await deliver('tier-2-engines-1');
  await clickNode('tier-2-engines-1'); await sleep(300);
  await page.click(BUYBTN); await sleep(600);
  const e1 = (await cellsOk([[3, 6, 'engine1']]))[0];
  eq('Tier2 Engine +1 mở ô (3,6) của Tier2Hull cho động cơ', [e0, e1], [false, true]);
  const owned1 = await ev(() => DR.s.upgrades.slice());
  eq('sổ sở hữu theo thứ tự mua', owned1, ['tier-1-fishing-1', 'tier-1-engines-1', 'tier-1-lights-1', 'tier-1-net-1', 'tier-2-hull', 'tier-2-engines-1']);
  await page.keyboard.press('Escape'); await sleep(500);
  await page.goto(base + '/games/dredge/index.html');                              // không ?fresh=1: giữ sổ lưu
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.waitForFunction(() => !document.getElementById('btn-continue').hidden, null, { timeout: 10000 });
  await page.click('#btn-continue');
  await page.waitForFunction(() => DR.mode !== 'title', null, { timeout: 20000 });
  const re = await ev(() => { const g = DR.grid('INVENTORY'); return { owned: DR.s.upgrades, tier: DR.s.hullTier, cfg: DR.s.grids.INVENTORY.cfg, e: DRGrid.accepts(g.cells[6 * g.cols + 3], DR.item('engine1')), boat2: DRBoat.model.getObjectByName('Boat2').visible }; });
  eq('nạp lại ván: nâng cấp, bậc hull, lưới Tier2Hull, mô hình Boat2 còn; ô của nâng cấp bậc 2 được áp lại (ApplyOwnedSlotUpgrades)', [re.owned, re.tier, re.cfg, re.e, re.boat2], [owned1, 2, 'Tier2Hull', true, true]);

  // ===== bật hullTier5Content: vị trí khớp anchoredPosition đã lưu trong scene =====
  await ev(() => DRUpgrade.open({ dest: { id: 'destination.tir-fleet-services-shortcut' } }));
  await sleep(500);
  const d5 = await dbg();
  const cols5 = await ev(() => ['Tier0', 'Tier1', 'UpgradeNodeTier2', 'Tier2', 'UpgradeNodeTier3', 'Tier3', 'UpgradeNodeTier4', 'Tier4', 'UpgradeNodeTier5'].map(n => { const r = document.querySelector('[data-p="Nodes/' + n + '"]').getBoundingClientRect(); return r.left + r.width / 2; }));
  const want5 = [54, 209, 399, 589, 779, 969, 1159, 1349, 1539].map(v => X(120 + 26 + v));
  check('bật Tier5: nút tier-5-hull hiện, 9 cột đúng anchoredPosition đã lưu (54, 209, ... 1539) — kiểm thuật toán HorizontalLayoutGroup',
    d5.allowT5 === true && !!d5.nodes['tier-5-hull'] && cols5.every((v, i) => near(v, want5[i], tol)), cols5.map(v => Math.round((v - W / 2) / s + 960 - 146)).join(','));
  await ev(() => DRUpgrade.close());

  // ===== ảnh so với bản thật: mọi nút đã sở hữu =====
  await ev(() => { for (const id of DRUpgrade.list()) if (id !== 'tier-5-hull' && !DRUpgrade.owned(id)) DRUpgrade.applyUpgrade(id); });
  await ev(d => DRUpgrade.open({ dest: { id: d } }), DEST);
  await sleep(900);
  await page.mouse.move(W / 2, H - 4);
  const all = await dbg();
  const stale = Object.entries(all.lines).filter(([, l]) => l.color !== POS).map(([p]) => p);
  check('đủ 19 nâng cấp: mọi nút POSITIVE, mọi đường nối xanh', Object.values(all.nodes).every(n => n.state === 'positive') && stale.length === 0, stale.join(', ') || '19 nút + ' + Object.keys(all.lines).length + ' đường xanh');
  const webShot = path.join(SHOTS, tag + '-7-all-owned.png');
  await page.screenshot({ path: webShot });
  if (fs.existsSync(REAL) && fs.existsSync(SBS)) {
    const r = cp.spawnSync('python', ['-I', SBS, webShot, REAL, path.join(SHOTS, 'sbs-upgrades.png'), '720', 'WEB', 'GOC'], { encoding: 'utf8', shell: true });
    out.push('  · ghép cạnh ảnh thật: ' + ((r.stdout || '') + (r.stderr || '')).trim());
  }
  await ev(() => DRUpgrade.close());
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 6).join(' | '));
  await closeAll();
}

// ---------------------------------------------------------------- áp nâng cấp trực tiếp (không giao diện)
async function applyChecks(browser, base) {
  out.push('\n[applyUpgrade, không qua giao diện]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  await boot(page, base);
  await skipIntro(page);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(src => { window.__mb = new Function('return ' + src)(); }, mulberry.toString());

  // --- 1) ngưỡng hỏng thật: số lần đâm tới khi chết (DRBoat.damage đọc DR.s.hullTier mỗi lần)
  const hits = () => ev(() => {
    const deaths = [], emit = DR.emit;
    DR.emit = function (k) { if (k === 'death') { deaths.push(1); return; } return emit.apply(this, arguments); };
    try {
      DR.grid('INVENTORY').damage.length = 0;
      let n = 0;
      while (!deaths.length && n < 20) { n++; DRBoat.damage(1); }
      return n;
    } finally { DR.emit = emit; DR.grid('INVENTORY').damage.length = 0; }
  });
  const h1 = await hits();
  await ev(() => DRUpgrade.applyUpgrade('tier-2-hull'));
  const h2 = await hits();
  eq('ngưỡng hỏng theo bậc ở thuyền thật: chết ở cú đâm thứ 4 (bậc 1) rồi thứ 5 (bậc 2)', [h1, h2], [4, 5]);

  // --- 2) khoang bậc 1 đông đồ → hull 2: giữ nguyên, thứ tự xếp lại, nâng cấp ô của bậc mới đã sở hữu được áp ngay
  const r = await ev(() => {
    DRUpgrade.rng = __mb(12345);
    DR.resetGrid('INVENTORY', 'Tier1Hull', []); DR.s.hullTier = 1; DRBoat.setTier(1);
    DR.s.upgrades = ['tier-1-fishing-1', 'tier-1-engines-1', 'tier-1-lights-1', 'tier-1-net-1', 'tier-2-engines-1'];   // nâng cấp bậc 2 giả lập đã có trước thân, để thử áp lại
    DRUpgrade.reapplyOwned();
    for (const id of ['dredge1', 'rod1', 'rod2', 'engine1', 'light1', 'pot1', 'pot2', 'lumber', 'lumber', 'cloth']) DR.give(id);
    let n = 0; while (DR.give(['cod', 'mackerel', 'anchovy'][n % 3], { size: 0.5, fresh: DR_CONFIG.maxFreshness })) n++;
    const G = DRGrid, idsOf = g => g.items.map(i => i.id).sort();
    const grp = i => { const d = DR.item(i.id), t = G.typeOf(d), sb = G.subOf(d); return t === G.TYPE.EQUIPMENT ? (sb === G.SUB.DREDGE ? 0 : sb === G.SUB.POT ? 3 : 1) : sb === G.SUB.FISH ? 4 : 2; };
    const b = idsOf(DR.grid('INVENTORY')), stoB = DR.grid('STORAGE').items.length, fundsB = DR.s.funds;
    const res = DRUpgrade.applyUpgrade('tier-2-hull');
    const inv = DR.grid('INVENTORY'), sto = DR.grid('STORAGE'), order = inv.items.slice().sort((x, y) => x.uid - y.uid).map(grp);
    const overlap = (() => { const seen = new Set(); for (const i of inv.items) for (const [x, y] of i.cells) { const k = x + ',' + y; if (seen.has(k)) return true; seen.add(k); } return false; })();
    const cell = (x, y, id) => G.accepts(inv.cells[y * inv.cols + x], DR.item(id));
    return { before: b.length, fish: n, cfg: DR.s.grids.INVENTORY.cfg, dims: [inv.cols, inv.rows], tier: DR.s.hullTier, boat2: DRBoat.model.getObjectByName('Boat2').visible, owned: DRUpgrade.owned('tier-2-hull'),
      all: JSON.stringify(idsOf(inv).concat(idsOf(sto)).sort()) === JSON.stringify(b), sto: sto.items.length - stoB, sold: res.sold.length, funds: DR.s.funds === fundsB, tries: res.tries,
      order, onCells: inv.items.every(i => i.cells.every(([x, y]) => G.accepts(inv.cells[y * inv.cols + x], DR.item(i.id)))), overlap,
      reapplied: cell(3, 6, 'engine1'), notTier1: !cell(4, 3, 'rod1'), uidsOk: new Set(inv.items.map(i => i.uid)).size === inv.items.length };
  });
  eq('hull 2 trên khoang đông: lưới Tier2Hull 7x10, bậc 2, mô hình Boat2, đã ghi sở hữu', [r.cfg, r.dims, r.tier, r.boat2, r.owned], ['Tier2Hull', [7, 10], 2, true, true]);
  check('hull 2: toàn bộ ' + r.before + ' món (có ' + r.fish + ' cá) còn nguyên, kho nhận ' + r.sto + ', không bán, tiền không đổi', r.all && r.sold === 0 && r.funds && r.sto === 0, JSON.stringify([r.before, r.sto, r.sold, r.funds, r.tries]));
  check('hull 2: mọi món nằm trên ô nhận loại của nó, không chồng nhau, uid không trùng', r.onCells && !r.overlap && r.uidsOk);
  check('thứ tự xếp lại: dredge → thiết bị khác → đồ thường → bẫy → cá', r.order.every((g, i) => i === 0 || g >= r.order[i - 1]) && r.order[0] === 0 && r.order[r.order.length - 1] === 4, JSON.stringify(r.order));
  check('nâng cấp ô của bậc mới đã sở hữu (tier-2-engines-1) được áp lại ngay sau khi đổi thân; của bậc cũ (cần câu (4,3)) thì không', r.reapplied && r.notTier1, JSON.stringify([r.reapplied, r.notTier1]));

  // --- 3) thân nhỏ hơn buộc có phần dư: Tier3Hull đầy cá → Tier2Hull; phần không vừa sang STORAGE, tổng giữ nguyên, không bán
  const o = await ev(() => {
    DRUpgrade.rng = __mb(777);
    DR.resetGrid('INVENTORY', 'Tier3Hull', []); DR.s.hullTier = 3;
    let m = 0; while (DR.give(['cod', 'mackerel', 'anchovy', 'squid'][m % 4], { size: 0.5, fresh: DR_CONFIG.maxFreshness })) m++;
    const before = DR.grid('INVENTORY').items.length, stoB = DR.grid('STORAGE').items.length, funds = DR.s.funds;
    const res = DRUpgrade.applyUpgrade('tier-2-hull');
    const inv = DR.grid('INVENTORY'), sto = DR.grid('STORAGE');
    return { before, inv: inv.items.length, sto: sto.items.length - stoB, moved: res.moved.length, sold: res.sold.length, funds: DR.s.funds === funds, tries: res.tries, cfg: DR.s.grids.INVENTORY.cfg,
      storageOk: sto.items.every(i => i.cells.every(([x, y]) => DRGrid.accepts(sto.cells[y * sto.cols + x], DR.item(i.id)))) };
  });
  check('thân nhỏ hơn (Tier3 → Tier2) buộc có phần dư: ' + o.moved + ' món sang STORAGE, ' + o.inv + ' ở lại khoang, tổng ' + o.before + ' giữ nguyên, không bán, đã thử xếp lại ' + o.tries + ' lần',
    o.cfg === 'Tier2Hull' && o.moved > 0 && o.sto === o.moved && o.inv + o.sto === o.before && o.sold === 0 && o.funds && o.storageOk && o.tries > 1, JSON.stringify(o));
  // --- 4) lỗi: id lạ, áp lại nâng cấp đã có không ghi trùng
  const e = await ev(() => { let msg = null; try { DRUpgrade.applyUpgrade('tier-9-hull'); } catch (x) { msg = x.message; } const n = DR.s.upgrades.length; DRUpgrade.applyUpgrade('tier-2-hull'); return { msg, dup: DR.s.upgrades.length === n, bad: DRUpgrade.purchase('tier-9-hull') }; });
  check('id lạ: applyUpgrade ném lỗi nêu rõ ("upgrade not found: …"), purchase trả { ok: false, why: "unknown" }, áp lại nâng cấp đã có không ghi trùng', /upgrade not found: tier-9-hull/.test(e.msg) && e.dup && e.bad.ok === false && e.bad.why === 'unknown', JSON.stringify(e));
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve(), base = process.env.DR_URL ? process.env.DR_URL.replace(/\/$/, '') : 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    if (!ONLY || ONLY === 'full') await run(browser, base, 1920, 1080, true);
    if (!ONLY || ONLY === 'phone') await run(browser, base, 844, 390, false);
    if (!ONLY || ONLY === 'apply') await applyChecks(browser, base);
  } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }
  await browser.close();
  srv.close();
  console.log('DREDGE upgrade — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
