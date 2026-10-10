/*
 * c1ach — thành tựu (WORLD-GAPS.md Phase C): js/achievements.js + data/achievements.js (tools/achievements.py).
 *   0. Dữ liệu: đủ 40 thành tựu gốc theo thứ tự enum, 20 DLC bị bỏ, điều kiện / mục tiêu khớp asset (250, 150, 100, 2500, 1500, 25, 25, 10, 75, 2, 3000).
 *   1. Hành động thật: bán cá ở Người buôn cá (giữ F, itemSold) -> SELL_FISH_VALUE_1; mua nâng cấp thân tàu (DRUpgrade.purchase) -> HULL_2;
 *      câu cá thật (Space + DR_DEBUG.catchNow qua spots.js createCatch) -> CATCH_FISH_ROD_1; hoàn tất nhiệm vụ (DRQuests.complete) ->
 *      COMPLETE_CHAPTER_1 + INTRODUCTIONS; lệnh Yarn SetAchievementState ENDING; sự kiện threatBanished -> ABILITY_BANISH;
 *      xả đủ điểm câu (spots.js seam spotDepleted) -> DEPLETE_FISH_SPOTS; cập bến thật (DRDocks.dockAt) -> DISCOVER_ALL_DOCKS.
 *      Mỗi lần kiểm CHÍNH XÁC tập id đã đạt (không thừa, không thiếu).
 *   2. Không đạt đôi: đánh lại mọi sự kiện, số lần phát 'achievement' không đổi.
 *   3. Lưu / nạp: DR.save, tải lại trang, Tiếp tục: tập id giữ nguyên; danh sách ở màn chính đọc được từ sổ.
 *   4. Giao diện: thông báo + danh sách ở 1280x720 và 844x390 (ảnh), Esc đóng danh sách trước khi tạm dừng.
 * Chạy: node test/dredge-c1ach.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-c1ach)    DR_URL: chạy trên máy chủ ngoài
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-c1ach');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const eq = (m, got, want) => ok(same(got, want), m + ': được ' + JSON.stringify(got) + ', cần ' + JSON.stringify(want));
const FM = 'destination.gm-fishmonger';

// Thứ tự enum DredgeAchievementId (src/DredgeAchievementId.cs) trừ DLC_*; From the Depths là ALL_ACHIEVEMENTS
const BASE = ['CATCH_FISH_ROD_1', 'CATCH_FISH_NET_1', 'CATCH_CRABS_POT_1', 'SELL_FISH_VALUE_1', 'SELL_TRINKETS_VALUE_1', 'DISCARD_FISH', 'DEPLETE_FISH_SPOTS',
  'CATCH_ALL_REGULAR_FISH', 'CATCH_ALL_ABERRATIONS', 'COMPLETE_CHAPTER_1', 'COMPLETE_CHAPTER_2', 'COMPLETE_CHAPTER_3', 'COMPLETE_CHAPTER_4', 'COMPLETE_CHAPTER_5',
  'ENDING', 'ENDING_ALT', 'HULL_2', 'HULL_3', 'HULL_4', 'FULL_CARGO', 'FULL_EQUIPMENT', 'ABILITY_FOGHORN', 'ABILITY_SPYGLASS', 'ABILITY_BAIT', 'ABILITY_HASTE',
  'ABILITY_MANIFEST', 'ABILITY_BANISH', 'ABILITY_ATROPHY', 'COMPLETE_ALL_SIDE_QUESTS', 'DISCOVER_ALL_DOCKS', 'SOLVE_ALL_SHRINES', 'RESEARCH_RODS', 'RESEARCH_NETS',
  'RESEARCH_POTS', 'RESEARCH_ENGINES', 'STAT_FISHING_SPEED', 'STAT_ENGINE_SPEED', 'STAT_LIGHT_STRENGTH', 'INTRODUCTIONS', 'ALL_ACHIEVEMENTS'];

(async () => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
    });
  }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port) + '/games/dredge/index.html';
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  const ev = (f, a) => page.evaluate(f, a);
  const earned = () => ev(() => DRAch.list().filter(a => a.earned).map(a => a.id));
  const shot = (n, o) => page.screenshot(Object.assign({ path: path.join(OUT, n + '.png') }, o || {}));
  const boot = async q => {
    await page.goto(base + (q || ''));
    await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
    await page.waitForSelector('#dr-title:not([hidden])', { timeout: 20000 });
  };
  async function dockReady() {
    const t0 = Date.now();
    for (;;) {
      const s = await ev(() => {
        const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || !!(document.getElementById('dr-dlg') && document.getElementById('dr-dlg').classList.contains('on'));
        return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
      });
      if (s.ready) return;
      if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
      if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
      else if (s.st) await page.keyboard.press('Space');
      await sleep(350);
    }
  }
  async function enterGame() {
    await page.waitForFunction(() => DR.mode === 'dock' || DR.mode === 'sail', null, { timeout: 20000 });
    await ev(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
    await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
    if (await ev(() => DR.mode) === 'dock') await dockReady();
    await sleep(500);
  }
  async function openDest(id) {
    const sel = '.dk-dest[data-dest="' + id + '"]';
    try { await page.click(sel, { timeout: 3000 }); } catch (e) { await page.dispatchEvent(sel, 'click'); }
    for (let i = 0; i < 120; i++) {
      if (await ev(() => DRShop.isOpen() && DRCargo.isOpen())) break;
      const st = await ev(() => { const s = window.DRDialogue && DRDialogue.isOpen() && DRDialogue.state(); return s ? s.kind : null; });
      if (st === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
      else if (st) await page.keyboard.press('Space');
      await sleep(350);
    }
    if (!(await ev(() => DRShop.isOpen()))) throw new Error('shop never opened: ' + id);
    await sleep(900);
  }
  const counts = () => ev(() => window.__ach.length);

  await boot('?fresh=1');

  // ===== 0. dữ liệu =====
  const dt = await ev(() => ({ order: DR_ACHIEVEMENTS.order, dlc: DR_ACHIEVEMENTS.dlcSkipped, n: Object.keys(DR_ACHIEVEMENTS.list).length,
    cond: Object.fromEntries(DR_ACHIEVEMENTS.order.map(i => [i, DR_ACHIEVEMENTS.list[i].cond && (DR_ACHIEVEMENTS.list[i].cond.target != null ? DR_ACHIEVEMENTS.list[i].cond.target : DR_ACHIEVEMENTS.list[i].cond.t)])),
    names: DR_ACHIEVEMENTS.order.map(i => DR_ACHIEVEMENTS.list[i].name), hid: DR_ACHIEVEMENTS.order.filter(i => DR_ACHIEVEMENTS.list[i].hidden).length }));
  eq('thứ tự 40 thành tựu gốc', dt.order, BASE);
  ok(dt.dlc.length === 20 && dt.dlc.every(i => /^DLC_[34]_\d+$/.test(i)), 'DLC bỏ: ' + dt.dlc.join());
  const T = dt.cond;
  eq('mục tiêu số lấy từ asset', [T.CATCH_FISH_ROD_1, T.CATCH_FISH_NET_1, T.CATCH_CRABS_POT_1, T.SELL_FISH_VALUE_1, T.SELL_TRINKETS_VALUE_1, T.DISCARD_FISH, T.DEPLETE_FISH_SPOTS,
    T.ABILITY_BANISH, T.STAT_ENGINE_SPEED, T.STAT_FISHING_SPEED, T.STAT_LIGHT_STRENGTH], [250, 150, 100, 2500, 1500, 25, 25, 10, 75, 2, 3000]);
  eq('tên gốc (Steam)', [dt.names[0], dt.names[16], dt.names[39]], ['Lifted From the Deep', 'Hull: Improved', 'From the Depths']);
  ok(dt.hid === 14, 'thành tựu ẩn của Steam: ' + dt.hid);

  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(id => { DR.s.availableDestinations.push(id); }, FM);   // như test/dredge-r2shop.js: mở điểm đến trước khi bến dựng nút
  await enterGame();
  await ev(() => { window.__ach = []; DR.on('achievement', id => window.__ach.push(id)); });
  eq('ván mới: chưa đạt gì', await earned(), []);
  ok(await ev(() => DRAch.total === 40 && DRAch.count() === 0 && typeof DR.s.achievements === 'object'), 'DRAch lúc đầu');

  // ===== 1a. bán cá (itemSold) -> SELL_FISH_VALUE_1 =====
  await ev(() => { DR.s.vars['fish-sale-total'] = 2495; DR.s.vars['trinket-sale-total'] = 1000; });
  await openDest(FM);
  await ev(() => { DR.give('mackerel', { size: 0.5, fresh: 3 }); DRCargo.refresh(); });
  await page.mouse.move(380, 360); await sleep(200);
  await page.keyboard.down('KeyF'); await sleep(750); await page.keyboard.up('KeyF'); await sleep(400);
  eq('bán cá mackerel $10: tổng bán 2505', await ev(() => DR.s.vars['fish-sale-total']), 2505);
  eq('bán cá -> đúng SELL_FISH_VALUE_1', await earned(), ['SELL_FISH_VALUE_1']);
  const t1 = await ev(() => ({ t: DRAch.toasts, vis: getComputedStyle(document.querySelector('.ach-toast')).opacity, name: document.querySelector('.ach-toast .ach-name').textContent,
    desc: document.querySelector('.ach-toast .ach-desc').textContent, kick: document.querySelector('.ach-toast .ach-kick').textContent }));
  ok(t1.t.showing === 'SELL_FISH_VALUE_1' && t1.name === 'Lives for Profit' && t1.desc === 'Sell a total of $2500 worth of fish.' && t1.kick === 'Thành tựu đã đạt', 'thông báo: ' + JSON.stringify(t1));
  await sleep(400);
  await shot('toast-1280x720');
  eq('thông báo đang hiện (opacity 1)', await ev(() => getComputedStyle(document.querySelector('.ach-toast')).opacity), '1');
  await page.keyboard.press('Escape'); await sleep(500);
  await dockReady();

  // ===== 1c. câu cá thật -> CATCH_FISH_ROD_1 =====
  await page.click('.dk-boat .sub[data-act="undock"]');
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 }).catch(() => {});
  ok(await ev(() => DR.mode) === 'sail', 'rời bến');
  const sp = await ev(() => DR_DEBUG.spotNear(['cod', 'mackerel'], -3, 0));
  await ev(s => { DR_DEBUG.setTime(0.4); DR_DEBUG.teleport(s.x + 3.2, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot, null, { timeout: 5000 }).catch(() => {});
  await ev(() => { DR.s.vars['rod-fish-caught'] = 248; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest', null, { timeout: 5000 }).catch(() => {});
  await ev(() => { const c = DRSpots.cur; DR.s.spots[c.sp.id] = Object.assign(DR.s.spots[c.sp.id] || { lastUpdate: DR.s.time }, { stock: 1 }); });   // điểm còn đúng 1 con
  await ev(() => DR_DEBUG.catchNow());
  eq('câu con thứ 249: chưa đạt CATCH_FISH_ROD_1', (await earned()).includes('CATCH_FISH_ROD_1'), false);
  await sleep(1500);
  await ev(() => { DR.s.vars['rod-fish-caught'] = 249; const c = DRSpots.cur; if (c) DR.s.spots[c.sp.id].stock = 3; });
  await ev(() => DR_DEBUG.catchNow());                       // con thứ 250 (createCatch tăng rod-fish-caught rồi phát 'catch')
  eq('rod-fish-caught = 250', await ev(() => DR.s.vars['rod-fish-caught']), 250);
  ok((await earned()).includes('CATCH_FISH_ROD_1'), 'câu thứ 250 phải đạt CATCH_FISH_ROD_1: ' + (await earned()).join());
  eq('tới đây: đúng 2 thành tựu', (await earned()).sort(), ['CATCH_FISH_ROD_1', 'SELL_FISH_VALUE_1']);
  await sleep(1500);
  if (await ev(() => DR.mode === 'harvest')) await page.keyboard.press('Escape');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 5000 }).catch(() => {});
  await ev(() => { if (DR.mode === 'sail') return; try { DRMinigame.hide(); } catch (e) { /* */ } if (DRCargo.isOpen()) DRCargo.close(); DRSpots.cur = null; DRSpots.fishing = false; if (DR.mode !== 'sail') DR.setMode('sail'); });
  if (await ev(() => !!document.querySelector('#dr-pause:not([hidden])'))) await page.click('#btn-resume');

  // ===== 1d. xả điểm câu: câu thật ở điểm còn đúng 1 con phát spotDepleted (spots.js seam) -> fish-depleted-count =====
  eq('câu thật ở điểm còn 1 con: fish-depleted-count 1', await ev(() => DR.s.vars['fish-depleted-count']), 1);
  await ev(() => { DR.s.vars['fish-depleted-count'] = 24; });
  await ev(() => DR.emit('spotDepleted', 'test'));           // điểm thứ 25
  ok((await earned()).includes('DEPLETE_FISH_SPOTS'), 'DEPLETE_FISH_SPOTS sau điểm thứ 25');

  // ===== 1e. nhiệm vụ / cốt truyện =====
  const before = (await earned()).slice();
  await ev(() => DRQuests.complete('Quest_RelicSub1'));
  const afterQ = (await earned()).filter(i => !before.includes(i));
  eq('hoàn tất Quest_RelicSub1 -> COMPLETE_CHAPTER_1 (chỉ đó)', afterQ, ['COMPLETE_CHAPTER_1']);
  await ev(() => DRQuests.complete('Quest_Intro'));
  ok((await earned()).includes('INTRODUCTIONS') && !(await earned()).includes('COMPLETE_ALL_SIDE_QUESTS'), 'Quest_Intro -> INTRODUCTIONS, chưa đủ 20 nhiệm vụ phụ');
  // lệnh Yarn SetAchievementState (Finale_Regular / Finale_Good trong data/yarn.js)
  await ev(() => DRYarn.commands.SetAchievementState.f(['ENDING', 'true']));
  ok((await earned()).includes('ENDING') && !(await earned()).includes('ENDING_ALT'), 'SetAchievementState ENDING true');
  await ev(() => DRYarn.commands.SetAchievementState.f(['KHONG_CO', 'true']));
  ok(!(await earned()).includes('CATCH_FISH_NET_1'), 'id lạ không rơi về giá trị đầu enum');

  // ===== 1f. xua đuổi (threatBanished) =====
  const nb = await counts();
  await ev(() => { DR.s.vars['threats-banished'] = 8; });
  await ev(() => DR.emit('threatBanished', { source: 'Test', active: false }));
  eq('xua đuổi không tính (active false): threats-banished', await ev(() => DR.s.vars['threats-banished']), 8);
  await ev(() => DR.emit('threatBanished', { source: 'Test', active: true }));
  ok(!(await earned()).includes('ABILITY_BANISH'), 'mới 9 lần');
  await ev(() => DR.emit('threatBanished'));                 // không payload = countForAchievement true (events.js, piranha.js)
  eq('10 lần: threats-banished', await ev(() => DR.s.vars['threats-banished']), 10);
  ok((await earned()).includes('ABILITY_BANISH') && (await counts()) === nb + 1, 'ABILITY_BANISH đạt đúng một lần');

  // ===== 1g. phép: điều kiện kích hoạt tay =====
  await ev(() => DR.emit('baitDeployed', { id: 'b', stock: 2, fish: ['cod', 'cod', 'mackerel'] }));
  ok(!(await earned()).includes('ABILITY_BAIT'), 'bầy mồi 2 loài chưa đạt');
  await ev(() => DR.emit('baitDeployed', { id: 'b', stock: 3, fish: ['cod', 'mackerel', 'anchovy'] }));
  ok((await earned()).includes('ABILITY_BAIT'), 'bầy mồi 3 loài / 3 con đạt ABILITY_BAIT');
  await ev(() => DR.emit('manifest', { from: { x: 0, z: 0 }, to: { x: 340, z: 0 } }));
  ok(!(await earned()).includes('ABILITY_MANIFEST'), 'Hiện thân 340 m chưa đạt (cần > 350)');
  await ev(() => DR.emit('manifest', { from: { x: 0, z: 0 }, to: { x: 351, z: 0 } }));
  ok((await earned()).includes('ABILITY_MANIFEST'), 'Hiện thân 351 m đạt');

  // ===== 1h. cập bến thật -> DISCOVER_ALL_DOCKS =====
  const dk = await ev(() => DR_ACHIEVEMENTS.list.DISCOVER_ALL_DOCKS.cond.keys);
  ok(dk.length === 19, 'DISCOVER_ALL_DOCKS có 19 bến: ' + dk.length);
  const ids = dk.map(k => k.replace('has-visited-dock-', ''));
  const missing = await ev(i => i.filter(d => !DRDocks.byId[d]), ids);
  eq('mọi id bến của điều kiện có trong DRDocks', missing, []);
  await ev(i => { for (const d of i.slice(0, -1)) DR.s.vars['has-visited-dock-' + d] = true; }, ids);
  await ev(i => DRDocks.dockAt(i[i.length - 1], 0, false, false), ids);
  eq('cập bến thật: DR.mode', await ev(() => DR.mode), 'dock');
  ok((await earned()).includes('DISCOVER_ALL_DOCKS'), 'bến cuối cùng -> DISCOVER_ALL_DOCKS');
  await dockReady();

  // ===== 1i. nghiên cứu =====
  await ev(() => { DR.s.itemIdsResearched = ['rod11']; DR.emit('researchCompleted', 'rod11'); });
  ok(!(await earned()).includes('RESEARCH_RODS'), 'mới rod11');
  await ev(() => { DR.s.itemIdsResearched.push('rod15'); DR.emit('researchCompleted', 'rod15'); });
  ok((await earned()).includes('RESEARCH_RODS'), 'rod11 + rod15 -> RESEARCH_RODS');

  // ===== 2. không đạt đôi =====
  const all1 = (await earned()).sort(), n1 = await counts();
  await ev(() => {
    DR.emit('itemSold', 'cod', 10); DR.emit('upgrade', {}); DR.emit('cargo', 'INVENTORY', null); DR.emit('catch', {}); DR.emit('quest', { kind: 'completed', id: 'x' });
    DR.emit('threatBanished'); DR.emit('researchCompleted', 'rod11'); DR.emit('mode', 'dock'); DR.emit('spotDepleted', 'x'); DRAch.evaluateAll();
    DRYarn.commands.SetAchievementState.f(['ENDING', 'true']);
  });
  await sleep(300);
  eq('đánh lại mọi sự kiện: tập id không đổi', (await earned()).sort(), all1);
  eq('đánh lại mọi sự kiện: không phát thêm "achievement"', await counts(), n1);
  eq('trình tự phát "achievement" không trùng id', await ev(() => new Set(window.__ach).size === window.__ach.length), true);
  eq('mọi id đạt đều đúng một lần trong nhật ký', [...(await ev(() => window.__ach))].sort(), all1);

  // ===== 3. mua nâng cấp thân tàu (UpgradeManager.AddUpgrade qua DRUpgrade.purchase: tiền + vật liệu trong lưới giao + điều kiện tiên quyết) =====
  const pre = await ev(() => {
    const u = DR_UPGRADES['tier-2-hull'];
    for (const p of u.prerequisiteUpgrades) DRUpgrade.applyUpgrade(p);                 // bốn nâng cấp ô bậc 1 (đã mua ở ván thật)
    const k = u.questGrid.gridKey;
    DR.resetGrid(k, u.questGrid.gridConfiguration, []);
    // vật liệu đặt đúng chỗ của lưới mẫu (presetGrid): 29 ô vừa khít 29 ô lưới, không còn chỗ thừa
    const g = DR.grid(k);
    for (const it of u.questGrid.presetGrid.spatialItems) if (!DRGrid.place(g, DR_ITEMS[it.id], it.x, it.y, it.z)) console.error('khong dat duoc ' + it.id);
    DR.s.funds = 5000;
    return { prereq: u.prerequisiteUpgrades.length, have: DRUpgrade.cost('tier-2-hull').items.map(x => DRUpgrade.have(x.item, 'tier-2-hull') + '/' + x.count) };
  });
  eq('vật liệu đã giao đủ', pre.have, ['4/4', '2/2', '3/3', '1/1']);
  ok(!(await earned()).includes('HULL_2'), 'trước khi mua chưa có HULL_2');
  const pr = await ev(() => DRUpgrade.purchase('tier-2-hull'));
  ok(pr.ok === true, 'DRUpgrade.purchase tier-2-hull: ' + JSON.stringify(pr).slice(0, 160));
  ok((await earned()).includes('HULL_2') && !(await earned()).includes('HULL_3'), 'mua tier-2-hull -> HULL_2 (không HULL_3)');
  eq('DRUpgrade.owned(tier-2-hull)', await ev(() => DRUpgrade.owned('tier-2-hull')), true);

  // ===== 4. giao diện =====
  const want = (await earned()).sort();
  ok(want.length >= 12, 'đã đạt ' + want.length);
  // danh sách từ màn tạm dừng
  await ev(() => { DRAch.set('SELL_FISH_VALUE_1', false); DRAch.set('SELL_FISH_VALUE_1', true); });   // thông báo mới để chụp nhỏ
  await sleep(600);
  await shot('toast-hud-1280x720');
  await page.keyboard.press('Escape'); await sleep(400);
  const pauseShown = await ev(() => !document.getElementById('dr-pause').hidden);
  if (pauseShown) {
    ok(await page.isVisible('#btn-pause-achievements'), 'màn tạm dừng có nút Thành tựu');
    await page.click('#btn-pause-achievements'); await sleep(400);
    ok(await ev(() => DRAch.isOpen), 'danh sách mở từ màn tạm dừng');
    const rows = await ev(() => [...document.querySelectorAll('.ach-row')].map(r => ({ id: r.dataset.id, got: r.classList.contains('got'), name: r.querySelector('.ach-name').textContent, desc: (r.querySelector('.ach-desc') || {}).textContent || '', prog: (r.querySelector('.ach-prog') || {}).textContent || '' })));
    ok(rows.length === 40, 'danh sách có 40 dòng: ' + rows.length);
    eq('dòng đã đạt khớp sổ', rows.filter(r => r.got).map(r => r.id).sort(), want);
    const sec = rows.find(r => r.id === 'COMPLETE_CHAPTER_2');
    ok(sec && sec.name === '???' && sec.desc === 'Thành tựu bí mật', 'thành tựu ẩn chưa đạt bị giấu: ' + JSON.stringify(sec));
    const lock = rows.find(r => r.id === 'CATCH_FISH_NET_1');
    ok(lock && lock.name === 'Tangled in This Web' && lock.desc === 'Catch 150 fish in trawl nets.' && /0 \/ 150/.test(lock.prog), 'dòng chưa đạt hiện tên + mô tả + tiến độ: ' + JSON.stringify(lock));
    ok(await ev(() => document.querySelector('.ach-count').textContent) === want.length + ' / 40', 'bộ đếm đầu danh sách');
    await shot('list-1280x720');
    await page.keyboard.press('Escape'); await sleep(300);
    ok(!(await ev(() => DRAch.isOpen)) && await ev(() => !document.getElementById('dr-pause').hidden), 'Esc đóng danh sách, màn tạm dừng còn nguyên');
    await page.setViewportSize({ width: 844, height: 390 }); await sleep(500);
    await ev(() => DRAch.open()); await sleep(300);
    const fit = await ev(() => { const w = document.querySelector('.ach-win').getBoundingClientRect(); return { l: w.left, t: w.top, r: w.right, b: w.bottom, W: innerWidth, H: innerHeight }; });
    ok(fit.l >= 0 && fit.t >= 0 && fit.r <= fit.W && fit.b <= fit.H, 'danh sách 844x390 nằm trong khung: ' + JSON.stringify(fit));
    await shot('list-844x390');
    await ev(() => DRAch.close());
    await page.setViewportSize({ width: 1280, height: 720 }); await sleep(300);
    await page.click('#btn-resume'); await sleep(300);
  } else ok(false, 'Esc không mở màn tạm dừng');
  // thông báo 844x390
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(400);
  await ev(() => { DRAch.set('SELL_FISH_VALUE_1', false); DRAch.set('SELL_FISH_VALUE_1', true); });
  await sleep(700);
  const tb = await ev(() => { const r = document.querySelector('.ach-toast').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, W: innerWidth }; });
  ok(tb.l >= 0 && tb.r <= tb.W && tb.t >= 0, 'thông báo 844x390 nằm trong khung: ' + JSON.stringify(tb));
  await shot('toast-844x390');
  await page.setViewportSize({ width: 1280, height: 720 });

  // ===== 5. lưu / nạp =====
  await sleep(5500);                                         // thông báo cuối tắt hẳn
  ok(await ev(() => DR.save()), 'DR.save');
  const saved = await ev(() => JSON.parse(localStorage.getItem(DR.saveKey())).achievements);
  eq('sổ lưu có đúng các id đã đạt', Object.keys(saved).sort(), want);
  ok(Object.values(saved).every(v => typeof v.day === 'number'), 'mỗi mục có ngày game');
  await boot('');
  ok(await page.isVisible('#btn-achievements'), 'màn chính có nút Thành tựu');
  await page.click('#btn-achievements'); await sleep(300);
  eq('danh sách ở màn chính (chưa nạp ván) đọc từ sổ', await ev(() => document.querySelector('.ach-count').textContent), want.length + ' / 40');
  await shot('list-title-1280x720');
  await page.keyboard.press('Escape'); await sleep(200);
  ok(!(await ev(() => DRAch.isOpen)), 'Esc đóng danh sách ở màn chính');
  await ev(() => { window.__ach = []; DR.on('achievement', id => window.__ach.push(id)); });
  await page.click('#btn-continue');
  await enterGame();
  eq('Tiếp tục: tập id giữ nguyên sau khi tải lại trang', (await earned()).sort(), want);
  eq('Tiếp tục: không phát "achievement" nào lúc nạp (không đạt đôi)', await ev(() => window.__ach.slice()), []);
  eq('Tiếp tục: biến đếm còn nguyên', await ev(() => [DR.s.vars['rod-fish-caught'], DR.s.vars['threats-banished'], DR.s.vars['fish-depleted-count']]), [250, 11, 26]);
  await ev(() => { DR.emit('itemSold', 'cod', 10); DRAch.evaluateAll(); });
  eq('sau nạp: đánh giá lại vẫn không đạt đôi', await ev(() => window.__ach.length), 0);

  await br.close(); srv.close();
  const real = errors.filter(e => !/favicon/.test(e));
  ok(real.length === 0, 'lỗi trang: ' + real.slice(0, 4).join(' | '));
  console.log('c1ach: ' + pass + ' đạt, ' + fail + ' trượt   (ảnh: ' + OUT + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  ngoại lệ: ' + (e && e.stack || e)); process.exit(1); });
