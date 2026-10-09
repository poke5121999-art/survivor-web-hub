/*
 * DREDGE — Biển Mù, đợt 2b (r2upgrade): bảng "Materials Required" của nâng cấp (UpgradeGridPanel) trên trang thật, bằng chuột/phím thật.
 *   ván mới → cửa sổ Upgrades → bấm nút → bảng nộp vật liệu bên trái + khoang bên phải → kéo vật liệu từ khoang vào lưới → đóng/mở lại
 *   vẫn còn → đủ thì nút Purchase bấm được → mua → trừ tiền + vật liệu đã giao → nâng thân bị từ chối khi có ô hỏng.
 * Số kỳ vọng là hằng số lấy từ bản gốc (không đọc lại từ js/upgrade.js):
 *   - Rod +2 (UPGRADE_T1_FISHING_1, upgrade_questgrids.json): 4 bóng mờ (2 gỗ, 1 sắt vụn, 1 vải), giá $95; Engine +2: 3 bóng mờ, $100.
 *   - Chiều cao bảng = baseHeight 300 (UpgradeGridPanel, scene_ui.json) + số hàng x 60 (QuestGridPanel.cs:242-248, cellSize 60).
 *   - Thân bậc 2 (UPGRADE_T2_HULL): 4 gỗ + 2 sắt vụn + 3 vải + 1 kim loại tinh, $500; bị từ chối khi khoang có ô hỏng (notification.upgrade-hull-damaged).
 * Chạy: node test/dredge-r2upgrade.js      Ảnh ra %TEMP%/dredge-r2upgrade/.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r2upgrade');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const DEST = 'destination.gm-shipwright-upgrades';

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const eq = (name, got, want) => check(name, same(got, want), 'được ' + JSON.stringify(got) + (same(got, want) ? '' : ', cần ' + JSON.stringify(want)));
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

// Bước chuẩn bị (không phải phần đang kiểm): ván mới, có tiền, bỏ qua màn mở đầu và hội thoại đầu tiên bằng API.
async function toDock(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => { DR.s.funds = 3000; });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  for (let i = 0; i < 300; i++) {
    const st = await page.evaluate(() => { const s = window.DRDialogue && DRDialogue.state(); return s ? s.kind : null; });
    if (!st && (await page.evaluate(() => DRDock._debug() && DRDock._debug().phase)) === 'ui') return;
    if (st === 'options') { await sleep(800); await page.evaluate(() => DRDialogue.choose(0)); }
    else if (st) await page.evaluate(() => DRDialogue.next());
    await sleep(120);
  }
  throw new Error('dock UI never reached phase ui');
}

async function run(browser, base, W, H) {
  const full = W >= 1920, tag = W + 'x' + H;
  out.push('\n[giao diện ' + tag + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const errors = watch(page);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const s = Math.min(H / 1080, W / 1920);
  await toDock(page, base);
  await ev(() => { window.__toasts = []; const t = DRHud.toast; DRHud.toast = function (x) { window.__toasts.push(x); return t.apply(this, arguments); }; });

  const nodeCenter = id => ev(id => { const r = document.querySelector('.up-nd[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const click = async (x, y) => { await page.mouse.move(x, y, { steps: 4 }); await page.mouse.down(); await page.mouse.up(); await sleep(250); };
  const clickNode = async id => { const p = await nodeCenter(id); await click(p.x, p.y); await sleep(700); };
  const count = (key, id) => ev(({ key, id }) => { const g = DR.s.grids[key] && DR.grid(key); return g ? g.items.filter(i => !id || i.id === id).length : null; }, { key, id });
  const stage = () => ev(() => DRUpgrade._debug().stage);
  const dbg = () => ev(() => DRCargo._debug());
  // món id đầu tiên trong khoang: tâm ô đầu của nó trên màn
  const invItem = id => ev(id => {
    const g = DRCargo._debug().grids.find(x => x.key === 'INVENTORY'), cs = g.w / g.cols, inst = DR.grid('INVENTORY').items.find(i => i.id === id);
    if (!inst) return null;
    const c = inst.cells[0];
    return { x: g.x + (c[0] + 0.5) * cs, y: g.y + (c[1] + 0.5) * cs };
  }, id);
  // kéo một món id từ khoang vào đúng bóng mờ còn trống của lưới key bằng chuột thật: nhấc, bấm chuột phải xoay tới góc z của bóng
  // (RotateClockwise, mỗi lần 90 độ), rê tâm món vào tâm bóng rồi đặt. Đặt đúng bóng thì các món sau còn chỗ (lưới chỉ vừa đủ).
  async function deliverOne(key, id) {
    const before = await count(key);
    const from = await invItem(id);
    if (!from) return false;
    await click(from.x, from.y);
    const hint = await ev(({ key, id }) => {
      const u = Object.values(DR_UPGRADES).find(u => u.questGrid.gridKey === key), g = DR.grid(key);
      const it = u.questGrid.presetGrid.spatialItems.find(i => i.id === id && DRGrid.canPlace(g, DR.item(id), i.x, i.y, i.z || 0));
      return it || null;
    }, { key, id });
    if (!hint) return false;
    for (let r = 0; r < 4 && (await ev(() => DRCargo._debug().held.rot)) !== (hint.z || 0); r++) { await page.mouse.click(W / 2, H / 2, { button: 'right' }); await sleep(150); }
    const to = await ev(({ key, hint }) => {
      const g = DRCargo._debug().grids.find(x => x.key === key), cs = g.w / g.cols;
      const fp = DRGrid.footprint(DR.item(hint.id), hint.x, hint.y, hint.z || 0), xs = fp.map(c => c[0]), ys = fp.map(c => c[1]);
      return { x: g.x + (Math.min(...xs) + Math.max(...xs) + 1) / 2 * cs, y: g.y + (Math.min(...ys) + Math.max(...ys) + 1) / 2 * cs };
    }, { key, hint });
    await page.mouse.move(to.x, to.y, { steps: 6 }); await sleep(120);
    await page.mouse.down(); await page.mouse.up(); await sleep(250);
    if ((await count(key)) === before + 1) return true;
    out.push('  · không đặt được ' + id + ' ' + JSON.stringify({ hint, to, d: await ev(() => { const d = DRCargo._debug(); return { held: d.held, cand: d.cand }; }) }));
    return false;
  }

  await ev(() => { DR.give('lumber'); DR.give('lumber'); DR.give('scrap'); DR.give('cloth'); });
  const inv0 = await ev(() => DR.grid('INVENTORY').items.map(i => i.id).filter(i => /^(lumber|scrap|cloth)$/.test(i)).sort());
  eq('khoang có đúng 2 gỗ, 1 sắt vụn, 1 vải để giao', inv0, ['cloth', 'lumber', 'lumber', 'scrap']);
  const funds0 = await ev(() => DR.s.funds);
  await ev(d => DRUpgrade.open({ dest: { id: d } }), DEST);
  await sleep(900);
  eq('cửa sổ Upgrades mở ở tầng cây', await stage(), 'tree');

  // ----- 1) bấm nút: bảng Materials Required bên trái + khoang bên phải
  await clickNode('tier-1-fishing-1');
  eq('bấm nút Rod +2: stage card, bảng trái loại quest, khoang bên phải', await ev(() => [DRUpgrade._debug().stage, DRCargo._debug().leftKind, DRCargo._debug().rightTab]), ['card', 'quest', 'INVENTORY']);
  const panel = await ev(() => { const p = document.querySelector('.cg-left'), r = p.getBoundingClientRect(); const g = DRCargo._debug().grids.find(x => x.key === 'UPGRADE_T1_FISHING_1');
    return { title: p.querySelector('.cg-name').textContent, hints: p.querySelectorAll('.cg-hint').length, rows: g.rows, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom,
      btn: p.querySelector('[data-act="purchase"]').textContent, dis: p.querySelector('[data-act="purchase"]').disabled }; });
  eq('tiêu đề "Materials Required"; 4 bóng mờ (2 gỗ + 1 sắt vụn + 1 vải); nút "Purchase Upgrade [$95.00]" đang tắt', [panel.title, panel.hints, panel.btn, panel.dis], ['Materials Required', 4, 'Purchase Upgrade [$95.00]', true]);
  if (full) check('chiều cao bảng = 300 + ' + panel.rows + ' hàng x 60 đơn vị canvas', Math.abs(panel.h / s - (300 + panel.rows * 60)) <= 2, 'được ' + (panel.h / s).toFixed(1) + ' cần ' + (300 + panel.rows * 60));
  check('bảng nằm trọn trong màn hình', panel.l >= -0.5 && panel.t >= -0.5 && panel.r <= W + 0.5 && panel.b <= H + 0.5, JSON.stringify(panel));
  await shot('1-open');
  if (!full) {
    check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
    await ctx.close();
    return;
  }

  // ----- 2) kéo một gỗ vào lưới
  check('kéo 1 gỗ từ khoang vào bóng mờ gỗ thứ nhất', await deliverOne('UPGRADE_T1_FISHING_1', 'lumber'));
  eq('khoang còn 1 gỗ, lưới đã giao có 1 gỗ', [await ev(() => DR.grid('INVENTORY').items.filter(i => i.id === 'lumber').length), await count('UPGRADE_T1_FISHING_1', 'lumber')], [1, 1]);
  eq('mới 1/4 món: nút Purchase vẫn tắt', await ev(() => document.querySelector('.cg-left [data-act="purchase"]').disabled), true);
  await shot('2-one-lumber');

  // ----- 3) đóng rồi mở lại: món đã giao còn nguyên (REVISITABLE)
  await page.keyboard.press('Escape'); await sleep(700);
  eq('Esc: đóng bảng, về cây, cửa sổ vẫn mở, bảng cargo tắt', [await stage(), await ev(() => DRUpgrade.isOpen()), await ev(() => DRCargo.isOpen())], ['tree', true, false]);
  await page.mouse.move(...Object.values(await nodeCenter('tier-1-fishing-1')), { steps: 4 }); await sleep(600);
  eq('tooltip nút Rod +2 đếm trong lưới đã giao: gỗ 1/2, sắt vụn 0/1, vải 0/1',
    await ev(() => [...document.querySelectorAll('.up-tip .c')].map(c => c.dataset.item + ' ' + c.querySelector('b').textContent)), ['lumber 1/2', 'scrap 0/1', 'cloth 0/1']);
  await clickNode('tier-1-fishing-1');
  eq('mở lại: gỗ đã giao vẫn nằm trong lưới, khoang vẫn còn 1 gỗ', [await count('UPGRADE_T1_FISHING_1', 'lumber'), await ev(() => DR.grid('INVENTORY').items.filter(i => i.id === 'lumber').length)], [1, 1]);

  // ----- 4) giao nốt, nút Purchase bật
  check('kéo gỗ thứ hai', await deliverOne('UPGRADE_T1_FISHING_1', 'lumber'));
  eq('đủ 3/4: nút vẫn tắt', await ev(() => document.querySelector('.cg-left [data-act="purchase"]').disabled), true);
  check('kéo sắt vụn', await deliverOne('UPGRADE_T1_FISHING_1', 'scrap'));
  check('kéo vải', await deliverOne('UPGRADE_T1_FISHING_1', 'cloth'));
  eq('đủ 4 món: lưới có 4, khoang hết vật liệu, nút Purchase bật', [await count('UPGRADE_T1_FISHING_1'), await ev(() => DR.grid('INVENTORY').items.filter(i => /^(lumber|scrap|cloth)$/.test(i.id)).length),
    await ev(() => document.querySelector('.cg-left [data-act="purchase"]').disabled)], [4, 0, false]);
  await shot('3-full');

  // ----- 5) mua
  const b = await ev(() => { const r = document.querySelector('.cg-left [data-act="purchase"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await click(b.x, b.y); await sleep(900);
  const bought = await ev(() => ({ owned: DR.s.upgrades.slice(), funds: DR.s.funds, grid: DR.grid('UPGRADE_T1_FISHING_1').items.length, stage: DRUpgrade._debug().stage, cargo: DRCargo.isOpen(),
    ok: DRGrid.accepts(DR.grid('INVENTORY').cells[3 * DR.grid('INVENTORY').cols + 4], DR.item('rod1')) }));
  eq('mua: sở hữu tier-1-fishing-1, trừ $95, lưới đã giao trống, bảng đóng về cây', [bought.owned, bought.funds, bought.grid, bought.stage, bought.cargo], [['tier-1-fishing-1'], funds0 - 95, 0, 'tree', false]);
  check('ô (4,3) của khoang nhận cần câu sau khi mua (nâng cấp áp vào thuyền)', bought.ok);

  // ----- 6) nâng thân bị từ chối khi khoang có ô hỏng, rồi mua được khi sửa xong
  await ev(() => {
    for (const id of ['tier-1-engines-1', 'tier-1-lights-1', 'tier-1-net-1']) DR.s.upgrades.push(id);
    for (const id of ['lumber', 'lumber', 'lumber', 'lumber', 'scrap', 'scrap', 'cloth', 'cloth', 'cloth', 'metal']) DR.give(id);
    DR.grid('INVENTORY').damage.push([0, 0]);
  });
  const f1 = await ev(() => DR.s.funds);
  await clickNode('tier-2-hull');
  eq('bấm nút Hull 2: bảng 10 bóng mờ (4 gỗ + 2 sắt vụn + 3 vải + 1 kim loại tinh), nút Purchase [$500.00]', await ev(() => [document.querySelectorAll('.cg-left .cg-hint').length, document.querySelector('.cg-left [data-act="purchase"]').textContent]), [10, 'Purchase Upgrade [$500.00]']);
  const hull = await ev(() => DR_UPGRADES['tier-2-hull'].questGrid.presetGrid.spatialItems);
  let hullOk = true;
  for (const it of hull) hullOk = (await deliverOne('UPGRADE_T2_HULL', it.id)) && hullOk;
  check('giao đủ 10 vật liệu hull 2 bằng chuột', hullOk && (await count('UPGRADE_T2_HULL')) === 10);
  const hb = await ev(() => { const r = document.querySelector('.cg-left [data-act="purchase"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, dis: document.querySelector('.cg-left [data-act="purchase"]').disabled }; });
  check('đủ vật liệu và tiền: nút Purchase bật dù khoang có ô hỏng (chỉ báo khi bấm)', hb.dis === false);
  await click(hb.x, hb.y); await sleep(500);
  const ref = await ev(() => ({ owned: DR.s.upgrades.includes('tier-2-hull'), funds: DR.s.funds, grid: DR.grid('UPGRADE_T2_HULL').items.length, toast: window.__toasts.slice(-1)[0], cargo: DRCargo.isOpen() }));
  eq('ô hỏng: từ chối, báo notification.upgrade-hull-damaged, không trừ tiền, giữ nguyên vật liệu đã giao, bảng vẫn mở', [ref.owned, ref.funds, ref.grid, ref.toast, ref.cargo],
    [false, f1, 10, await ev(() => DR_STR['notification.upgrade-hull-damaged']), true]);
  await shot('4-hull-refused');
  await ev(() => { DR.grid('INVENTORY').damage.length = 0; });
  await click(hb.x, hb.y); await sleep(900);
  const done = await ev(() => ({ owned: DR.s.upgrades.includes('tier-2-hull'), funds: DR.s.funds, grid: DR.grid('UPGRADE_T2_HULL').items.length, cfg: DR.s.grids.INVENTORY.cfg, tier: DR.s.hullTier }));
  eq('hết ô hỏng: mua được, trừ $500, lưới đã giao trống, khoang đổi sang Tier2Hull', [done.owned, done.funds, done.grid, done.cfg, done.tier], [true, f1 - 500, 0, 'Tier2Hull', 2]);

  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  // DR_URL=https://poke5121999-art.github.io/survivor-web-hub để chạy trên Pages
  const srv = await serve(), base = process.env.DR_URL || 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1920, 1080);
    await run(browser, base, 844, 390);
  } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }
  await browser.close();
  srv.close();
  console.log('DREDGE r2upgrade — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
