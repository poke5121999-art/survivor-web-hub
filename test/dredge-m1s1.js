/*
 * DREDGE - kiem seam S1 cua MONSTERS.md (js/events.js, js/boat.js, js/abilities.js, js/sky.js, js/rules.js, js/tentacle.js).
 * Chay: node test/dredge-m1s1.js   (anh: %TEMP%/dredge-m1s1 hoac SHOTS=...)
 * So goc: WorldEventManager.cs:138-449, data/worldevents.js (WorldEventData), PlayerDetectionCollider.cs:80-88 + PlayerContainer.prefab
 * (20 / 30 / 50 / 30, lerp 3 / 5 / 1, toc do 0..5 m/s), PlayerCollider.cs:39-54 (1,5 s), VariablePlayerDamager.cs:67-92, Player.cs:157,
 * GameConfigData (basePlayerHealth 1, playerHealthPerHullTier 2 => nguong hang 1 = 3), SanityModifier.cs:62-75, globalSanityModifier 0,015,
 * nightSanityModifier -0,55, TentacleAttack.prefab (VariablePlayerDamager 2, requireOneHealthToKill).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m1s1');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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

async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/games/dredge/index.html?fresh=1', { timeout: 60000 });
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await settle(page);
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(500);
  return { page, errors };
}

// đi hết hội thoại ở bến cho tới khi giao diện bến hiện
async function settle(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}

// điểm nước cách bến Greater Marrow ~200 m (trong vùng Marrows) mà Waterspout qua được phép thử độ sâu ở (70, 0, 50)
async function offGM(page) {
  return page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 195; r <= 215; r += 5) for (let a = 0; a < 6.28; a += 0.2) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) < 15 || DRWorld.zoneAt(x, z) !== 'THE_MARROWS') continue;
      for (let yaw = 0; yaw < 6.28; yaw += 0.5) {
        DR_DEBUG.teleport(x, z, yaw);
        if (DREvents.debug.test('Waterspout').fails.every(f => f === 'sanity' || f === 'time' || f === 'repeat')) return { x, z, yaw, r: Math.hypot(x - d.poi.x, z - d.poi.z) };
      }
    }
    return null;
  });
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);

  // ---------------------------------------------------------------- 1. ứng viên ở pha 0, 0,9, sanity 0,6, cách GM 200 m
  console.log('S1 ứng viên sự kiện thế giới');
  const at = await offGM(page);
  check('tìm được chỗ nước trong Marrows cách bến GM ~200 m', !!at, JSON.stringify(at));
  await ev(() => { DR.s.worldPhase = 0; DR.s.sanity = 0.6; DR_DEBUG.setTime(0.9); });
  await sleep(300);                                               // nhảy giờ = một lần bốc; xoá lịch sử để đo ứng viên sạch
  await ev(() => { DR.s.eventHistory = {}; DR.s.sanity = 0.6; });
  check('DREvents.phase() đọc DR.s.worldPhase (0 ở ván mới)', (await ev(() => DREvents.phase())) === 0);
  const c1 = await ev(() => DREvents.debug.candidates());
  for (const n of ['Eyes', 'FlickerLights', 'GhostBoat_Player1', 'Splash', 'Waterspout']) check('ứng viên có ' + n, c1.includes(n), c1.join(','));
  for (const n of ['FogGhost', 'TentacleAttack', 'Ravens']) check('ứng viên không có ' + n, !c1.includes(n), JSON.stringify(await ev(n => DREvents.debug.test(n).fails, n)));
  await ev(() => { DR.s.worldPhase = 1; });
  const c1b = await ev(() => DREvents.debug.candidates());
  check('pha 1: GhostBoat_Player2 (minWorldPhase 1) thành ứng viên', c1b.includes('GhostBoat_Player2') && !c1.includes('GhostBoat_Player2'));
  await ev(() => { DR.s.worldPhase = 0; });

  // ---------------------------------------------------------------- 2. Ravens: ban ngày, sanity 0,4, cần cá ≤ 3 ô
  console.log('S1 Ravens theo khoang');
  await ev(() => {
    const inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (DRGrid.subOf(DR_ITEMS[it.id]) & DRGrid.SUB.FISH) DRGrid.remove(inv, it);
    DR_DEBUG.setTime(0.5);
  });
  await sleep(300);
  await ev(() => { DR.s.eventHistory = {}; DR.s.sanity = 0.4; });
  const r0 = await ev(() => DREvents.debug.test('Ravens'));
  check('không cá: Ravens trượt vì khoang', !r0.ok && r0.fails.includes('inventory'), JSON.stringify(r0));
  const big = await ev(() => { const id = Object.keys(DR_ITEMS).find(k => DR_ITEMS[k].subtype === 'FISH' && DR_ITEMS[k].dims && DR_ITEMS[k].dims.length > 3 && !DR_ITEMS[k].isAberration); return DR.give(id) ? id : null; });
  const r1 = await ev(() => DREvents.debug.test('Ravens'));
  check('chỉ có cá > 3 ô (' + big + '): Ravens vẫn trượt', !!big && !r1.ok, JSON.stringify(r1));
  await ev(() => DR.give('cod'));
  const r2 = await ev(() => DREvents.debug.test('Ravens'));
  check('thêm Cod (3 ô): Ravens thành ứng viên', r2.ok, JSON.stringify(r2));
  check('Ravens nằm trong candidates()', (await ev(() => DREvents.debug.candidates())).includes('Ravens'));

  // ---------------------------------------------------------------- 3. nhịp bốc 0,1 ngày, cổng currentEvent, neo bến, lưu sổ
  console.log('S1 nhịp bốc, cổng sự kiện, neo bến, lưu sổ');
  // U8: Waterspout giờ là sự kiện thật (giữ currentEvent tới khi tự hết); dọn trước khi đo nhịp bốc
  await ev(() => { const c = DREvents.current; if (c && c.handle.dispose) c.handle.dispose(); });
  await sleep(400);
  const L = await ev(() => DREvents.debug.lastRoll);
  const n0 = await ev(() => DREvents.debug.log.length);
  await ev(L => { DR.s.time = L + 0.09; }, L);
  await sleep(400);
  check('TimeAndDay = lần bốc trước + 0,09: chưa bốc', (await ev(() => DREvents.debug.log.length)) === n0);
  await ev(L => { DR.s.time = L + 0.101; }, L);
  await sleep(400);
  const lg = await ev(() => DREvents.debug.log.slice(-1)[0]);
  check('+0,101 ngày: bốc đúng một lần', (await ev(() => DREvents.debug.log.length)) === n0 + 1 && near(lg.t - L, 0.101, 1e-6), JSON.stringify(lg));
  // sự kiện giả sống mãi cho tới khi bị yêu cầu kết thúc
  await ev(() => {
    window.__fake = { finished: 0, updates: 0 };
    DREvents.register('Splash', { spawn(e, ctx) {
      window.__fake.ctx = ctx;
      return { done: false, update() { window.__fake.updates++; }, requestFinish() { window.__fake.finished++; this.done = true; } };
    } });
    DREvents.debug.force('Splash');
  });
  await sleep(300);
  const n1 = await ev(() => DREvents.debug.log.length);
  await ev(() => { DR.s.time += 0.35; });
  await sleep(500);
  check('đang có sự kiện sống: thời gian +0,35 ngày vẫn không bốc', (await ev(() => DREvents.debug.log.length)) === n1 && (await ev(() => DREvents.current && DREvents.current.name)) === 'Splash');
  check('sự kiện sống được update mỗi khung', (await ev(() => window.__fake.updates)) > 5);
  const hist = await ev(() => DREvents.debug.history().Splash);
  check('lịch sử Splash = timeOfLastRoll (AddWorldEventToHistory)', near(hist, await ev(() => DREvents.debug.lastRoll), 1e-9), String(hist));
  // neo bến bằng phím F ngay sát bến GM
  await ev(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await sleep(600);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 20000 }).catch(() => {});
  await sleep(400);
  check('cập bến bằng F: sự kiện nhận RequestEventFinish, currentEvent = null', (await ev(() => DR.mode)) === 'dock' && (await ev(() => window.__fake.finished)) === 1 && (await ev(() => DREvents.current)) === null);
  // lưu sổ rồi bấm nút Tiếp tục ở màn đầu
  await ev(() => { DR.s.eventHistory.Ravens = 1.234; DR.setMode('sail'); });
  await sleep(800);
  await ev(() => { DR.save(); DR.setMode('title'); });             // như nút "Lưu và về màn chính" (main.js btn-quit)
  await page.waitForFunction(() => DR.mode === 'title', null, { timeout: 10000 });
  await page.click('#btn-continue');
  await page.waitForFunction(() => DR.mode === 'dock' || DR.mode === 'sail', null, { timeout: 15000 });
  await sleep(500);
  await sleep(1500);
  // nạp sổ xong hội thoại Mayor_Intro có thể chạy: bấm Space cho hết
  for (let i = 0; i < 120; i++) {
    const st = await ev(() => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (!st) break;
    if (st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else await page.keyboard.press('Space');
    await sleep(300);
  }
  const h2 = await ev(() => DREvents.debug.history());
  check('eventHistory qua lưu / nạp sổ', near(h2.Splash, hist, 1e-9) && h2.Ravens === 1.234, JSON.stringify(h2));

  // ---------------------------------------------------------------- 4. DRDetect.radius
  console.log('S1 vùng phát hiện');
  await ev(() => DR.setMode('sail'));
  await sleep(300);
  check('đang lái, không hội thoại / khoang mở', !(await ev(() => DRDialogue.isOpen() || DRCargo.isOpen())));
  if (at) await ev(a => { DR_DEBUG.teleport(a.x, a.z, a.yaw); DRBoat.stop(); }, at);
  await ev(() => { if (DR.s.lightsOn) DRBoat.setLights(false); DR.s.sanity = 1; });
  await sleep(3500);
  const d0 = await ev(() => DRDetect.radius());
  check('đứng yên, tắt đèn: bán kính 20', near(d0, 20, 0.3), d0.toFixed(2));
  await ev(() => DRAbilities.select('lights'));
  await page.mouse.move(640, 300);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await sleep(3000);
  const d1 = await ev(() => ({ r: DRDetect.radius(), on: DR.s.lightsOn }));
  check('chuột phải bật đèn: bán kính 50', d1.on && near(d1.r, 50, 0.3), JSON.stringify(d1));
  await ev(() => DRAbilities.select('foghorn'));
  await page.mouse.down({ button: 'right' });
  await sleep(2500);
  const d2 = await ev(() => ({ r: DRDetect.radius(), fh: DREvents.foghorn }));
  await page.mouse.up({ button: 'right' });
  check('giữ còi + đèn: bán kính 100', near(d2.r, 100, 0.3), JSON.stringify(d2));
  await sleep(1500);
  check('thả còi: bán kính về 50', near(await ev(() => DRDetect.radius()), 50, 0.5));

  // còi xua sự kiện dispelByFoghorn (Ravens: foghornDispelTime 1,5 s, foghornDispelCount 3)
  await ev(() => {
    window.__rv = { finished: 0 };
    DREvents.register('Ravens', { spawn() { return { done: false, requestFinish() { window.__rv.finished++; this.done = true; } }; } });
    DREvents.debug.force('Ravens');
  });
  await page.mouse.down({ button: 'right' }); await sleep(1000);
  const fh1 = await ev(() => window.__rv.finished);
  await sleep(700); await page.mouse.up({ button: 'right' });
  await sleep(200);
  check('giữ còi 1,0 s: quạ chưa đi; 1,7 s: RequestEventFinish', fh1 === 0 && (await ev(() => window.__rv.finished)) === 1 && (await ev(() => DREvents.current)) === null);
  await ev(() => DREvents.debug.force('Ravens'));
  for (let i = 0; i < 3; i++) { await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' }); await sleep(250); }
  check('bấm còi 3 lần ngắn: quạ đi (foghornBlastCount ≥ 3)', (await ev(() => window.__rv.finished)) === 2, JSON.stringify(await ev(() => DREvents.foghorn)));

  // ---------------------------------------------------------------- 5. khoá đèn + lightOverride (FlickerLights)
  console.log('S1 khoá đèn / ghi đè độ sáng');
  await ev(() => { DRAbilities.select('lights'); DRAbilities.lock('lights', true); });
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await sleep(300);
  check('Locked: chuột phải không tắt được đèn', (await ev(() => DR.s.lightsOn)) === true);
  const li = await ev(() => { const L = DRBoat.lights.point, full = L.intensity; DRBoat.lightOverride(0.5); const half = L.intensity; DRBoat.lightOverride(0); const zero = L.intensity; DRBoat.lightOverride(null); return { full, half, zero, back: L.intensity }; });
  check('lightOverride(0,5) = nửa cường độ, 0 = tắt, null = trả lại', li.full > 0 && near(li.half, li.full / 2, 1e-6) && li.zero === 0 && li.back === li.full, JSON.stringify(li));
  await ev(() => DRAbilities.lock('lights', false));
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await sleep(300);
  check('mở khoá: chuột phải tắt đèn', (await ev(() => DR.s.lightsOn)) === false);

  // ---------------------------------------------------------------- 6. processHit / monsterHit
  console.log('S1 gây hại');
  const ph = await ev(async () => {
    const inv = DR.grid('INVENTORY'); inv.damage.length = 0; DRBoat.refresh();
    DRBoat.lastHit = -1e9;
    const a = DRBoat.processHit(false, false), b = DRBoat.processHit(false, true);
    return { a, b, dmg: inv.damage.length, thr: DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier), tier: DR.s.hullTier };
  });
  check('hai processHit trong 1,5 s: +1 ô', ph.a === true && ph.b === false && ph.dmg === 1, JSON.stringify(ph));
  await sleep(1600);
  const ph2 = await ev(() => ({ c: DRBoat.processHit(false, false), safe: DRBoat.processHit(true, false), dmg: DR.grid('INVENTORY').damage.length }));
  check('sau 1,6 s: processHit được tính lại (+1), va SafeCollider không hỏng', ph2.c && !ph2.safe && ph2.dmg === 2, JSON.stringify(ph2));
  const mh = await ev(() => ({ applied: DRBoat.monsterHit(2, { requireOneHealth: true }), dmg: DR.grid('INVENTORY').damage.length, mode: DR.mode }));
  check('hạng 1 (ngưỡng 3), 2 ô hỏng: monsterHit(2, requireOneHealth) chỉ +1', ph.thr === 3 && mh.applied === 1 && mh.dmg === 3 && mh.mode === 'sail', JSON.stringify(mh));
  const mh2 = await ev(() => { const inv = DR.grid('INVENTORY'); inv.damage.length = 1; return { applied: DRBoat.monsterHit(2, {}), dmg: inv.damage.length }; });
  check('không requireOneHealth: monsterHit(2) +2, không có thời gian miễn', mh2.applied === 2 && mh2.dmg === 3, JSON.stringify(mh2));
  await ev(() => { DR.grid('INVENTORY').damage.length = 0; DRBoat.refresh(); });

  // ---------------------------------------------------------------- 7. moveMod + nguồn sanity di động
  console.log('S1 moveMod, nguồn sanity');
  const mm = await ev(() => {
    const inv = DR.grid('INVENTORY');
    const eng = inv.items.map(i => DR_ITEMS[i.id]).filter(d => DRGrid.subOf(d) & DRGrid.SUB.ENGINE).reduce((s, d) => s + (+d.speedBonus || 0), 0);
    return { moveMod: DRRules.stats(DR_CONFIG, inv, DR_ITEMS).moveMod, want: DR_CONFIG.basePlayerSpeed + eng };
  });
  check('DRRules.stats().moveMod = basePlayerSpeed 10 + Σ speedBonus máy', near(mm.moveMod, mm.want, 1e-9), JSON.stringify(mm));
  if (at) await ev(a => { DR_DEBUG.teleport(a.x, a.z, a.yaw); DRBoat.stop(); }, at);
  await ev(() => { DR_DEBUG.setTime(0.95); });
  await sleep(300);
  await ev(() => {
    DR.s.sanity = 1;
    const b = DR.s.boat;
    window.__src = DRSky.addSanitySource({ x: b.x, z: b.z, day: 0, night: -10, r0: 2, r1: 10, min: 0 });
    window.__follow = () => { const bb = DR.s.boat; window.__src.x = bb.x; window.__src.z = bb.z; if (window.__src.on) requestAnimationFrame(window.__follow); };
    window.__follow();
  });
  await page.keyboard.down('KeyD');                               // xoay tại chỗ: thời gian trôi theo độ lớn cần lái (1)
  await sleep(300);
  const s0 = await ev(() => ({ s: DR.s.sanity, t: DR.s.time }));
  await sleep(2000);
  const s1 = await ev(() => ({ s: DR.s.sanity, t: DR.s.time, mod: DRSky.env.timeMod, day: DRSky.env.isDay }));
  await page.keyboard.up('KeyD');
  const rate = (s1.s - s0.s) / ((s1.t - s0.t) * 288);              // mỗi giây thời gian game (1 ngày = 288 s)
  check('nguồn đêm −10 ở lõi: sanity giảm (−0,55 − 10)·0,015 = −0,158/s × hệ số thời gian', !s1.day && near(rate, -0.15825, 0.004), 'đo ' + rate.toFixed(4) + '/s, timeMod ' + s1.mod);
  await ev(() => { window.__src.on = false; window.__src.remove(); DR.s.sanity = 1; });

  // ---------------------------------------------------------------- 8. xúc tu qua DREvents: gây hại + Xua đuổi
  console.log('S1 xúc tu (TentacleAttack) trên DREvents');
  await ev(() => {
    DR.s.worldPhase = 2; DR.s.sanity = 0.08; DR_DEBUG.setTime(0.98);
    for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6)
      if (DRWorld.depth01(x, z) > 0.2 && DRWorld.sdf(x, z) > 12 && DRWorld.zoneAt(x, z) === 'THE_MARROWS') { DR_DEBUG.teleport(x, z - 20, Math.PI); DRBoat.stop(); return; }
  });
  await sleep(400);
  await ev(() => { DR.s.eventHistory = {}; DR.s.sanity = 0.08; DR.grid('INVENTORY').damage.length = 1; DRBoat.refresh(); });
  const tc = await ev(() => DREvents.debug.candidates());
  check('pha 2, sanity 0,08, đêm, chỗ sâu: TentacleAttack là ứng viên', tc.includes('TentacleAttack'), tc.join(','));
  await ev(() => DREvents.debug.force('TentacleAttack'));
  check('force: xúc tu sinh và là currentEvent', (await ev(() => DRTentacle.debug.active && DREvents.current && DREvents.current.name)) === 'TentacleAttack');
  await sleep(4200);                                              // xúc tu dựng cao trước cú quất (~5 s vào clip Armature|Spawn)
  await page.screenshot({ path: path.join(SHOTS, 'tentacle-1280.png') });
  let hitAt = null;
  for (let i = 0; i < 40 && hitAt == null; i++) { hitAt = await ev(() => DR.grid('INVENTORY').damage.length > 1 ? DRTentacle.debug.state().t : null); if (hitAt == null) await sleep(100); }
  const dmgT = await ev(() => DR.grid('INVENTORY').damage.length);
  check('xúc tu quất trúng thuyền: 1 ô hỏng sẵn + 2 điểm (máu còn 3 > 2 nên không cắt) = 3', dmgT === 3, 'hỏng ' + dmgT + ', lúc t = ' + hitAt);
  await sleep(1500);
  check('oneHitOnly: không trúng lần hai', (await ev(() => DR.grid('INVENTORY').damage.length)) === dmgT);
  // Xua đuổi bằng chuột phải: dispelByBanish → RequestEventFinish → rút
  await ev(() => { DR_DEBUG.unlockSpells(); DRAbilities.select('banish'); });
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await sleep(400);
  const bn = await ev(() => ({ ban: DREvents.banished, st: DRTentacle.debug.state() }));
  check('Xua đuổi bật: xúc tu rút (Retract)', bn.ban && bn.st && bn.st.phase === 'retract', JSON.stringify(bn).slice(0, 160));
  await sleep(2200);
  check('rút xong: currentEvent = null, Banish chặn TentacleAttack khỏi ứng viên', (await ev(() => DREvents.current)) === null && !(await ev(() => DREvents.debug.candidates())).includes('TentacleAttack'));
  // ảnh điện thoại ngang: một xúc tu nữa (force bỏ qua điều kiện, kể cả Banish)
  await page.setViewportSize({ width: 844, height: 390 });
  await ev(() => DREvents.debug.force('TentacleAttack'));
  await sleep(4200);
  await page.screenshot({ path: path.join(SHOTS, 'tentacle-844.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(6000);
  await ev(() => { DR.grid('INVENTORY').damage.length = 0; DRBoat.refresh(); });

  // ---------------------------------------------------------------- perf + lỗi
  await ev(() => { DR.s.worldPhase = 0; DR.s.sanity = 1; DR_DEBUG.setTime(0.5); });
  await sleep(3000);
  const perf = await ev(() => DR_DEBUG.perf());
  console.log('  perf 1280x720: avgMs ' + perf.avgMs.toFixed(2) + ' cpuMs ' + perf.cpuMs.toFixed(2));
  check('không có lỗi trang / console / HTTP ≥ 400', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' ; '));
  await browser.close(); srv.close();
  console.log('m1s1: ' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
