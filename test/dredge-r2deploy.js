/*
 * DREDGE — Biển Mù: kiểm lưới kéo, bẫy cua và mồi (vòng 3, r2deploy) trên trang thật (Playwright).
 * Điều khiển bằng chuột/bàn phím thật (giữ E + chuột chọn nêm, chuột phải dùng năng lực, W/A lái, Space mở bẫy / vào điểm mồi,
 * bấm nút "Nhặt bẫy"); móc nội bộ chỉ để dựng tình huống (cho đồ, mở khoá, dời giờ) và đọc số.
 *
 * Chạy:  node test/dredge-r2deploy.js
 * Ảnh:   %TEMP%/dredge-r2deploy/ (1920×1080 và 844×390).
 * Số mong đợi lấy từ bản gốc:
 *   net1 (DR_ITEMS): timeBetweenCatchRolls 0,125 ngày, catchRate 1, maxDurabilityDays 1, lưới Net1 5×5, harvestableTypes [COASTAL].
 *   TrawlNetAbility: lần quăng đầu sau 1/48 ngày (NetFishCaught = 0), sau đó mỗi 0,125 ngày khi thuyền chạy; độ bền −Δngày khi chạy;
 *     số món sau T ngày chạy = 1 + floor((T − 1/48) / 0,125) (bước dời giờ có thể làm trễ một lần quăng); cá lưới NO_BIG_TROPHY (cỡ < 0,99);
 *     loài ∈ HarvestZone Marrows ∩ COASTAL ∩ canBeCaughtByNet. Hết bền ⇒ tự kéo lên, tiếng "Trawl Net - Net Broken".
 *   pot1: timeBetweenCatchRolls 0,66, catchRate 1, maxDurabilityDays 3, lưới Pot1 3×3. Sau đúng 1 ngày: 1 lần quăng (0,66 ≤ 1 < 1,32),
 *     hẹn còn 0,66 − 0,34 = 0,32; độ bền 3 − 1 = 2; món ∈ vùng dưới bẫy ∩ canBeCaughtByPot (hoặc research-item 2 %).
 *   GameConfigData.maxCrabPotCount 25 ⇒ bẫy thứ 26 bị từ chối (chuỗi notification.crab-pot-deployment-failed-too-many).
 *   BaitAbility: Random.Range(NumFishInBaitBallMin 2, Max 4) ⇒ 2 hoặc 3 con, ≤ NumFishSpeciesInBaitBall 4 loài, mỗi loài
 *     canBeCaughtByRod, canAppearInBaitBalls, không dị biến, zonesFoundIn chứa vùng hiện tại; điểm không hồi kho; bắt một con ⇒ kho −1.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r2deploy');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
async function boot(page, base, q) {
  await page.goto(base + '/games/dredge/index.html?' + q);
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  await sleep(500);
}
// thuyền hạng 2 (Tier2Hull): lưới 2×2 vào ô lưới trước, rồi cần + máy; mở khoá ba năng lực
const SETUP = () => {
  DR.s.hullTier = 2;
  DR.resetGrid('INVENTORY', DR_CONFIG.hullTierGridConfigs[1]);
  DR.give('net1'); DR.give('rod1'); DR.give('engine1'); DR.give('pot1'); DR.give('bait'); DR.give('bait');
  DRBoat.setTier(2); DRBoat.refresh();
  for (const a of ['trawl', 'pot', 'bait']) DRAbilities.unlock(a, true);
};
// nước thoáng gần Greater Marrow (trong vùng HarvestZone Marrows): cách bờ ≥ 40 m
const OPEN_WATER = () => {
  for (let r = 40; r < 300; r += 20) for (let a = 0; a < 6.283; a += 0.3927) {
    const x = 70 + Math.cos(a) * r, z = -40 + Math.sin(a) * r;
    if (DR_DEBUG.sdf(x, z) > 40) return { x, z, yaw: 0 };
  }
  return { x: 60, z: -120, yaw: 0 };
};
function wedgePoint(W, H, i, n) {
  const a = (360 / n * i) * Math.PI / 180, r = 200 * (H / 1080);
  return [W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r];
}
// giữ E, rê chuột tới nêm của năng lực, thả E
async function pick(page, W, H, id) {
  const ws = await page.evaluate(() => DRAbilities.wedges());
  await page.mouse.move(W / 2, H / 2 + 300);
  await page.keyboard.down('KeyE');
  await sleep(250);
  const p = wedgePoint(W, H, ws.indexOf(id), ws.length);
  await page.mouse.move(p[0], p[1], { steps: 5 });
  await sleep(150);
  await page.keyboard.up('KeyE');
  await sleep(200);
  return page.evaluate(() => DRAbilities.selected());
}
const right = async page => { await page.mouse.down({ button: 'right' }); await sleep(60); await page.mouse.up({ button: 'right' }); await sleep(200); };
const sounds = page => page.evaluate(() => window.__snd.map(s => s.k));

async function run(browser, base) {
  const W = 1920, H = 1080;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, '1920x1080-' + name + '.png') });
  await boot(page, base, 'fresh=1&t=0.30');
  await page.evaluate(SETUP);
  const ow = await page.evaluate(OPEN_WATER);
  await page.evaluate(o => {
    DR_DEBUG.teleport(o.x, o.z, o.yaw);
    window.__snd = [];
    const o2 = DRAudio.play;
    DRAudio.play = function (k, v, r) { window.__snd.push({ k: DRAudio.resolve(k) || k, v, t: performance.now() }); return o2.apply(this, arguments); };
  }, ow);
  await page.mouse.click(W / 2, H / 2 + 300);    // mở WebAudio
  await sleep(500);

  // ================================================================ GR-06 lưới kéo
  let sel = await pick(page, W, H, 'trawl');
  check('giữ E + chuột tới nêm 4: chọn trawl', sel === 'trawl', sel);
  let d = await page.evaluate(() => DRDeploy.debug());
  check('bảng DeployableAbilityInfoPanel: tên lưới, độ sâu, "Nhiều" loài (cod, mackerel ở Marrows ban ngày)', d.info && d.info.item === 'net1' && d.info.quality === 2 &&
    d.info.species.every(s => DR_ITEMS_CHECK.coastalNet.includes(s)), JSON.stringify(d.info));
  check('bảng thông tin hiện trên màn', await page.isVisible('#dr-deploy .dp-panel'));
  await right(page);
  d = await page.evaluate(() => DRDeploy.debug());
  check('chuột phải: thả lưới (active), hẹn quăng đầu 1/48 ngày, Animator TrawlNet "Deploy"', d.trawl.active && near(d.trawl.roll, 1 / 48, 1e-9) && d.trawl.anim === 'Deploy', JSON.stringify(d.trawl));
  check('tiếng thả lưới "Trawl Net - Deploy"', (await sounds(page)).includes('fish.trawl.deploy'));
  // chạy vòng tròn 0,5 ngày (dời giờ từng bước khi đang giữ W + A)
  const t0 = await page.evaluate(() => DR.s.time);
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  for (let i = 0; i < 100; i++) { await page.evaluate(() => { DR.s.time += 0.005; }); await sleep(45); }
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyA');
  await sleep(300);
  const T = (await page.evaluate(() => DR.s.time)) - t0;
  d = await page.evaluate(() => DRDeploy.debug());
  const want = 1 + Math.floor((T - 1 / 48) / 0.125);
  const net = await page.evaluate(() => DR.grid('TRAWL_NET').items.map(i => ({ id: i.id, size: i.size })));
  check('chạy ' + (T * 24).toFixed(1) + ' giờ: số món trong lưới = 1 + floor((T − 1/48)/0,125) (trễ tối đa 1 lần do bước giờ)', d.trawl.count === want || d.trawl.count === want - 1, d.trawl.count + ' / mong ' + want);
  check('độ bền lưới = 1 − T (chỉ trừ khi chạy; lệch ≤ một bước dời giờ 0,005 lúc vừa bấm W)', near(d.trawl.dur, 1 - T, 0.0055), d.trawl.dur.toFixed(4) + ' / ' + (1 - T).toFixed(4));
  check('mọi món là loài COASTAL bắt bằng lưới ở Marrows, cỡ ≤ TrophyMaxSize 0,85 − 0,01 (NO_BIG_TROPHY)', net.length > 0 && net.every(f => DR_ITEMS_CHECK.coastalNet.includes(f.id) && f.size <= 0.84), JSON.stringify(net));
  check('net-fish-caught tăng theo số món, tiếng "Trawl Net - Fish Caught"', d.trawl.netFishCaught === d.trawl.count && (await sounds(page)).includes('fish.trawl.caught'), d.trawl.netFishCaught + '');
  check('thẻ ActiveTrawlTab đếm số món', (await page.textContent('#dr-deploy .dp-count span')) === String(d.trawl.count));
  await shot('1-trawl');
  // kéo lên rồi thả lại
  await right(page);
  d = await page.evaluate(() => DRDeploy.debug());
  check('chuột phải lần nữa: kéo lưới lên, tiếng "Trawl Net - Retract"', !d.trawl.active && (await sounds(page)).includes('fish.trawl.retract'), JSON.stringify({ a: d.trawl.active }));
  // Tab: khoang có tab lưới kéo
  await page.keyboard.press('Tab');
  await sleep(700);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.cg-right .cg-tab')].map(t => t.dataset.tab));
  check('Tab mở khoang: có tab TRAWL_NET (PlayerTabbedPanel)', tabs.includes('TRAWL_NET'), tabs.join(','));
  await page.click('.cg-right .cg-tab[data-tab="TRAWL_NET"]');
  await sleep(400);
  const ng = await page.evaluate(() => (DRCargo._debug().grids || []).find(g => g.key === 'TRAWL_NET'));
  check('tab lưới: lưới 5×5 (Net1) với đúng các món đã bắt', ng && ng.cols === 5 && ng.rows === 5 && ng.items.length === d.trawl.count, JSON.stringify(ng && { c: ng.cols, r: ng.rows, n: ng.items.length }));
  await shot('2-cargo-net');
  await page.keyboard.press('Tab');
  await sleep(500);
  // thả lại và chạy tới khi đứt
  await right(page);
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  for (let i = 0; i < 140 && (await page.evaluate(() => DRDeploy.debug().trawl.active)); i++) { await page.evaluate(() => { DR.s.time += 0.005; }); await sleep(45); }
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyA');
  await sleep(300);
  d = await page.evaluate(() => DRDeploy.debug());
  check('hết độ bền: lưới tự kéo lên (độ bền kẹp về 0), tiếng "Trawl Net - Net Broken"', !d.trawl.active && d.trawl.dur === 0 && d.trawl.broke === 1 && (await sounds(page)).includes('fish.trawl.broken'), JSON.stringify({ a: d.trawl.active, dur: d.trawl.dur }));
  await right(page);
  d = await page.evaluate(() => DRDeploy.debug());
  check('lưới hết bền: chuột phải không thả được', !d.trawl.active);

  // ================================================================ GR-07 bẫy cua
  await page.evaluate(o => DR_DEBUG.teleport(o.x, o.z, o.yaw), ow);
  await sleep(500);
  sel = await pick(page, W, H, 'pot');
  check('nêm 3: chọn pot', sel === 'pot', sel);
  const before = await page.evaluate(() => ({ n: DR.grid('INVENTORY').items.filter(i => i.id === 'pot1').length, b: DR.s.boat }));
  await right(page);
  await sleep(300);
  let pots = await page.evaluate(() => DRDeploy.pots());
  const after = await page.evaluate(() => DR.grid('INVENTORY').items.filter(i => i.id === 'pot1').length);
  check('chuột phải: thả bẫy, bỏ khỏi khoang, độ bền 3, hẹn 0,66', pots.length === 1 && after === before.n - 1 && pots[0].durability === 3 && pots[0].roll === 0.66, JSON.stringify(pots[0]));
  check('bẫy ở DeployPosition: cách tâm thuyền 1,5 m', pots[0] && near(Math.hypot(pots[0].x - before.b.x, pots[0].z - before.b.z), 1.5, 0.15), pots[0] && Math.hypot(pots[0].x - before.b.x, pots[0].z - before.b.z).toFixed(3));
  const toastTxt = await page.evaluate(() => [...document.querySelectorAll('.hud-toast')].map(t => t.textContent).join(' | '));
  check('thông báo thả bẫy kèm độ sâu (notification.crab-pot-deployed)', /Basic Crab Pot.*độ sâu \d+,\dm/.test(toastTxt), toastTxt);
  check('tiếng "Crab Pot - Deploy" (castSFX)', (await sounds(page)).includes('fish.crabpot.deploy'));
  check('loài bắt được của bẫy = vùng dưới bẫy ∩ canBeCaughtByPot ∩ độ sâu', pots[0].catchable.length > 0 && pots[0].catchable.every(i => DR_ITEMS_CHECK.potOk(i)), JSON.stringify(pots[0].catchable));
  await sleep(2600);                                                 // CrabPotBuoy_Place 2,52 s
  await page.mouse.move(W / 2, H * 0.2);
  await shot('3-buoy');
  check('phao nhấp nhô: trạng thái idle (bẫy trống, còn bền)', (await page.evaluate(() => DRDeploy.pots()[0].state)) === 'idle');
  // một ngày sau
  await page.evaluate(() => { DR.s.time += 1; });
  await sleep(1500);
  pots = await page.evaluate(() => DRDeploy.pots());
  check('sau 1 ngày: đúng 1 món trong lưới bẫy (0,66 ≤ 1 < 1,32), hẹn còn 0,32', pots[0].items.length === 1 && near(pots[0].roll, 0.32, 0.002) &&
    (pots[0].catchable.includes(pots[0].items[0]) || pots[0].items[0] === 'research-item' || /-ab-/.test(pots[0].items[0])), JSON.stringify({ items: pots[0].items, roll: pots[0].roll }));
  check('sau 1 ngày: độ bền 3 − 1 = 2', near(pots[0].durability, 2, 0.002), pots[0].durability.toFixed(4));
  check('phao đổi sang "ready" (CrabPotBuoy_Caught nhấp nháy)', pots[0].state === 'ready', pots[0].state);
  await shot('4-buoy-ready');
  check('cạnh phao: nhắc "Kiểm tra bẫy — Space"', await page.isVisible('#dr-deploy .dp-prompt.on'));
  await page.keyboard.press('Space');
  await sleep(900);
  const lg = await page.evaluate(() => (DRCargo._debug() || { grids: [] }).grids.find(g => /^POT_/.test(g.key)));
  check('Space: mở lưới bẫy 3×3 bên trái với 1 món', lg && lg.cols === 3 && lg.rows === 3 && lg.items.length === 1, JSON.stringify(lg && { c: lg.cols, r: lg.rows, n: lg.items.length }));
  check('tiếng mở bẫy "Crab Pot - Open"', (await sounds(page)).includes('fish.crabpot.open'));
  await shot('5-pot-open');
  const invBefore = await page.evaluate(() => DR.grid('INVENTORY').items.length);
  await page.click('.cg-btn[data-act="pick-up"]');
  await sleep(600);
  const pk = await page.evaluate(() => ({ pots: DRDeploy.pots().length, inv: DR.grid('INVENTORY').items.map(i => ({ id: i.id, dur: i.dur })), open: DRCargo.isOpen(), mode: DR.mode }));
  const back = pk.inv.find(i => i.id === 'pot1');
  check('bấm "Nhặt bẫy": món vào khoang, bẫy về khoang với độ bền 2, phao biến mất, bảng đóng', pk.pots === 0 && pk.inv.length === invBefore + 2 && back && near(back.dur, 2, 0.002) && !pk.open && pk.mode === 'sail', JSON.stringify(pk));
  check('tiếng "Crab Pot - Pick up"', (await sounds(page)).includes('fish.crabpot.pickup'));

  // ================================================================ GR-13 mồi
  sel = await pick(page, W, H, 'bait');
  check('nêm 5: chọn bait', sel === 'bait', sel);
  await right(page);
  await sleep(300);
  d = await page.evaluate(() => DRDeploy.debug());
  const bait = d.baits[0];
  const zone = await page.evaluate(() => DRWorld.zoneAt(DR.s.boat.x, DR.s.boat.z));
  const okFish = await page.evaluate(z => DRDeploy.debug().baits[0].stack.every(id => { const i = DR_ITEMS[id]; return i.canBeCaughtByRod && i.canAppearInBaitBalls && !i.isAberration && (i.zonesFoundIn || []).includes(z); }), zone);
  check('chuột phải: thả mồi ⇒ điểm câu 2 hoặc 3 con (Random.Range(2, 4))', bait && (bait.stack.length === 2 || bait.stack.length === 3), JSON.stringify(bait));
  check('loài trong mồi: câu được bằng cần, xuất hiện trong bầy mồi, không dị biến, ở vùng ' + zone + ', ≤ 4 loài', okFish && new Set(bait.stack).size <= 4, JSON.stringify(bait.stack));
  check('tiếng "Cast Ability - Bait", một mồi bị trừ khỏi khoang', (await sounds(page)).includes('fish.cast') && (await page.evaluate(() => DR.grid('INVENTORY').items.filter(i => i.id === 'bait').length)) === 1);
  const ns = await page.evaluate(() => DR.view.nearSpot);
  check('điểm mồi trong tầm, không hồi kho, kho = số con', ns && ns.id === bait.id && ns.stock === bait.stack.length && ns.status === 'ok', JSON.stringify(ns));
  await shot('6-bait');
  await page.keyboard.press('Space');
  await sleep(1200);
  const mg = await page.evaluate(() => ({ open: DRMinigame.isOpen && DRMinigame.isOpen(), item: DRSpots.cur && DRSpots.cur.itemId, mode: DR.mode }));
  check('Space: vào minigame câu thường, cá = đỉnh ngăn xếp mồi', mg.mode === 'harvest' && mg.item === bait.stack[bait.stack.length - 1], JSON.stringify(mg));
  await shot('7-bait-minigame');
  await page.evaluate(() => DR_DEBUG.catchNow());
  await sleep(2500);
  d = await page.evaluate(() => DRDeploy.debug());
  const st = await page.evaluate(id => (DR.s.spots[id] || {}).stock, bait.id);
  check('bắt một con: kho −1, ngăn xếp bớt đỉnh', st === bait.stack.length - 1 && d.baits[0] && d.baits[0].stack.length === bait.stack.length - 1, JSON.stringify({ st, stack: d.baits[0] && d.baits[0].stack }));
  for (let i = 0; i < 3 && (await page.evaluate(() => DR.mode !== 'sail')); i++) { await page.keyboard.press('Escape'); await sleep(700); }
  if (await page.evaluate(() => DRCargo.isOpen())) { await page.evaluate(() => DRCargo.close()); await sleep(300); }

  // ================================================================ bẫy thứ 26
  await page.evaluate(o => DR_DEBUG.teleport(o.x + 30, o.z, o.yaw), ow);
  await sleep(300);
  sel = await pick(page, W, H, 'pot');
  let n = 0;
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => { if (!DR.grid('INVENTORY').items.some(x => x.id === 'pot1')) DR_DEBUG.give('pot1'); });
    await right(page);
    n = await page.evaluate(() => DRDeploy.pots().length);
  }
  check('thả đủ 25 bẫy (maxCrabPotCount)', n === 25, n + '');
  await page.evaluate(() => { if (!DR.grid('INVENTORY').items.some(x => x.id === 'pot1')) DR_DEBUG.give('pot1'); });
  await right(page);
  const r26 = await page.evaluate(() => ({ n: DRDeploy.pots().length, inv: DR.grid('INVENTORY').items.filter(x => x.id === 'pot1').length, t: [...document.querySelectorAll('.hud-toast')].map(t => t.textContent).join(' | ') }));
  check('bẫy thứ 26 bị từ chối: vẫn 25 bẫy, bẫy còn trong khoang, báo vượt giới hạn', r26.n === 25 && r26.inv === 1 && /Vượt quá số bẫy/.test(r26.t), JSON.stringify({ n: r26.n, inv: r26.inv }));
  const mm = await page.evaluate(() => DRDeploy.mapMarkers());
  check('bản đồ: 25 dấu CrabPotMapMarker', mm.length === 25 && mm.every(m => m.prefab === 'CrabPotMapMarker'));
  // lưu / nạp
  await page.evaluate(() => DR.save());
  await page.evaluate(() => { DR.load(); });
  await sleep(1300);
  const re = await page.evaluate(() => ({ n: DRDeploy.pots().length, grids: Object.keys(DR.s.grids).filter(k => /^POT_/.test(k)).length, vis: DRDeploy.pots().filter(p => p.state).length }));
  check('lưu rồi nạp: 25 bẫy, 25 lưới bẫy, 25 phao dựng lại', re.n === 25 && re.grids === 25 && re.vis === 25, JSON.stringify(re));
  const perf = [];
  for (let i = 0; i < 5; i++) { await sleep(500); perf.push(await page.evaluate(() => DR_DEBUG.perf().cpuMs)); }
  perf.sort((a, b) => a - b);
  out.push('  · cpuMs (25 phao, 1920×1080) trung vị ' + perf[2].toFixed(2));
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

async function phone(browser, base) {
  const W = 844, H = 390;
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + name + '.png') });
  await boot(page, base, 'fresh=1&t=0.35');
  await page.evaluate(SETUP);
  const ow = await page.evaluate(OPEN_WATER);
  await page.evaluate(o => { DR_DEBUG.teleport(o.x, o.z, o.yaw); DRAbilities.select('pot'); }, ow);
  await sleep(500);
  const icon = await page.evaluate(() => { const r = document.querySelector('#dr-ab .ab-icon').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(icon.x, icon.y);
  await sleep(2800);
  const n = await page.evaluate(() => DRDeploy.pots().length);
  check('844×390: chạm ô năng lực (Bẫy cua) = thả bẫy', n === 1, n + '');
  const pr = await page.evaluate(() => { const r = document.querySelector('#dr-deploy .dp-panel').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  check('844×390: bảng thông tin nằm trong màn', pr.w > 40 && pr.x >= 0 && pr.x + pr.w <= W && pr.y >= 0 && pr.y + pr.h <= H, JSON.stringify(pr));
  await shot('1-pot');
  check('844×390: không lỗi', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

// danh sách tra cứu dựng từ data/*.js trong node (để biểu thức kiểm tra trong trang dùng được qua addInitScript)
let DR_ITEMS_CHECK = null;
function lookups() {
  global.window = global;
  require(path.join(ROOT, 'games/dredge/data/items.js'));
  require(path.join(ROOT, 'games/dredge/data/config.js'));
  const I = global.DR_ITEMS;
  const coastalNet = Object.keys(I).filter(id => I[id].canBeCaughtByNet && I[id].harvestableType === 'COASTAL');
  return { coastalNet, potOk: id => !!(I[id] && I[id].canBeCaughtByPot) };
}

(async () => {
  DR_ITEMS_CHECK = lookups();
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  console.log('DREDGE r2deploy — ' + base);
  try {
    out.push('\n[1920x1080]'); await run(browser, base);
    out.push('\n[844x390]'); await phone(browser, base);
  } catch (e) { check('chạy hết kịch bản', false, e.stack || e.message); }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
