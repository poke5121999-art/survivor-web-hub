/*
 * w0seams (WORLD-GAPS.md §6 W0): seam cho các đơn vị W1-W9 / R1-R8 và bản vá §0 (AberrationEnabler).
 *   - AberrationEnabler.cs:17-24 + TimeController.cs:209-219: cờ "can-catch-aberrations" bật khi Day = floor(time) chạm
 *     aberrationStartDay - 1 = 4 (GameConfigDataProd.asset aberrationStartDay 5); Day 3 chưa. Tải sổ đã qua ngày 4 thì bật ngay.
 *   - Bến DLC bị ẩn khi không có ?dlc=1; có thì đủ 26 bến.
 *   - ToggleFreezeTime true → DR.s.time đứng yên sau 5 s lái thuyền (TimeController.cs:199-202).
 *   - DR.save() trả false khi DR.s.forbidSave (SaveManager.cs:186); DR.saveKey(slot) và lưu theo ô.
 *   - DRDock.registerDest dùng trong renderDest (bấm nút Nghiên cứu ở bến).
 *   - Stub dữ liệu / script của W1-W9, R1-R8 tải được, không lỗi.
 * Chạy: node test/dredge-w0seams.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-w0seams)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w0seams');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const ev = (page, f, a) => page.evaluate(f, a);

async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
// giữ W tới khi floor(time) đổi (hoặc hết maxMs); trả về thời gian và quãng đã đi
async function sailUntilDayTurns(page, maxMs) {
  const s0 = await ev(page, () => ({ t: DR.s.time, x: DR.s.boat.x, z: DR.s.boat.z }));
  await page.keyboard.down('KeyW');
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(250);
    if (Math.floor(await ev(page, () => DR.s.time)) > Math.floor(s0.t)) break;
  }
  await page.keyboard.up('KeyW');
  await sleep(300);
  const s1 = await ev(page, () => ({ t: DR.s.time, x: DR.s.boat.x, z: DR.s.boat.z, flag: !!DR.s.vars['can-catch-aberrations'] }));
  return Object.assign(s1, { t0: s0.t, moved: Math.hypot(s1.x - s0.x, s1.z - s0.z) });
}
async function openWater(page) {
  return ev(page, () => {
    // điểm có sdf lớn nhất trong ô 200 m quanh Greater Marrow (biển rộng nhất gần bến)
    let best = null;
    for (let x = -100; x <= 100; x += 10) for (let z = -100; z <= 100; z += 10) { const d = DRWorld.sdf(x, z); if (!best || d > best[2]) best = [x, z, d]; }
    if (!best || best[2] < 15) return null;
    DR_DEBUG.teleport(best[0], best[1], 0);
    return best;
  });
}

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  const watch = p => {
    p.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 160)));
    p.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 160)); });
    p.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  };
  watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });

  // 1. stub của các đơn vị: dữ liệu rỗng, script tải được; sổ lệnh Yarn mở cho tệp khác
  const st = await ev(page, () => ({
    expl: Array.isArray(window.DR_EXPLOSIVES) && DR_EXPLOSIVES.length,
    // các đơn vị W1-W9 / R1-R8 lần lượt điền dữ liệu, nên chỉ kiểm biến toàn cục có mặt và là object
    objs: ['DR_RESEARCH_UI', 'DR_QUESTOBJ', 'DR_FINALE', 'DR_CREDITS', 'DR_SERPENT', 'DR_SBCREATURE', 'DR_JELLY', 'DR_MINDSUCKER', 'DR_TSHAZARDS', 'DR_PIRANHA', 'DR_LEVIATHAN', 'DR_GREATWHITE', 'DR_CETACEANS']
      .filter(g => !window[g] || typeof window[g] !== 'object'),
    scripts: ['progress', 'research', 'overflow', 'explosives', 'questcmds', 'finale', 'finale_cut', 'menus', 'paint', 'photo', 'serpent', 'sbcreature', 'jelly', 'mindsucker', 'tshazards', 'piranha', 'mimic', 'statues', 'leviathan', 'greatwhite', 'cetaceans']
      .filter(f => !document.querySelector('script[src^="js/' + f + '.js?v="]')),
    css: ['research', 'menus'].filter(f => !document.querySelector('link[href^="css/' + f + '.css?v="]')),
    yarnApi: typeof DRYarn.command === 'function' && typeof DRYarn.fn === 'function',
    aberrationDay: window.DRProgress && DRProgress.aberrationDay
  }));
  ok(st.expl !== false, 'DR_EXPLOSIVES is not an array');
  ok(!st.objs.length, 'data globals missing: ' + st.objs.join(','));
  ok(!st.scripts.length, 'script tags missing: ' + st.scripts.join(','));
  ok(!st.css.length, 'css links missing: ' + st.css.join(','));
  ok(st.yarnApi, 'DRYarn.command / DRYarn.fn not exported');
  ok(st.aberrationDay === 4, 'aberration day must be aberrationStartDay 5 - 1 = 4, got ' + st.aberrationDay);
  const yr = await ev(page, () => {
    const was = DRYarn.stubs().includes('TogglePortraitVFX'), keep = DRYarn.commands.TogglePortraitVFX;
    let ran = 0; DRYarn.command('TogglePortraitVFX', () => { ran++; });
    const now = DRYarn.stubs().includes('TogglePortraitVFX');
    DRYarn.commands.TogglePortraitVFX.f([]); DRYarn.commands.TogglePortraitVFX = keep;
    return { was, now, ran };
  });
  ok(yr.was && !yr.now && yr.ran === 1, 'DRYarn.command does not override a stub: ' + JSON.stringify(yr));

  // 2. bến DLC ẩn khi không có ?dlc=1
  const dk = await ev(page, () => ({ n: DRDocks.list.length, ids: ['dock.tpr-east', 'dock.tpr-middle', 'dock.tpr-south', 'dock.tpr-west', 'dock.pontoon-tpr', 'dock.photographer-camp', 'dock.the-iron-rig'].filter(i => DRDocks.byId[i]), gm: !!DRDocks.byId['dock.greater-marrow'], ps: !!DRDocks.byId['dock.pontoon-ds'] }));
  ok(dk.n === 19 && !dk.ids.length && dk.gm && dk.ps, 'DLC docks not hidden without ?dlc=1: ' + JSON.stringify(dk));

  // 3. ván mới, mở "Nghiên cứu" ở bến bằng chuột → renderDest gọi hàm đã đăng ký
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => { if (!DR.s.availableDestinations.includes('destination.research')) DR.s.availableDestinations.push('destination.research'); });   // Mayor_Intro_2: AddDestination research
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
  await sleep(1200);
  ok(await ev(page, () => DR.s.time) < 1, 'new game must start on Day 0');
  await ev(page, () => {
    window.__w0calls = 0;
    DRDock.registerDest('ResearchDestination', (d, c) => {
      window.__w0calls++;
      const p = document.createElement('div'); p.id = 'w0-probe'; p.textContent = 'probe ' + d.id; c.main.appendChild(p);
    });
  });
  await page.hover('#dr-dockui .dk-boat').catch(() => {});
  await page.click('#dr-dockui .dk-boat [data-act="research"]', { timeout: 5000 }).catch(e => console.log('research click: ' + e.message.split('\n')[0]));
  await page.waitForSelector('#w0-probe', { timeout: 8000 }).catch(() => {});
  const rd = await ev(page, () => ({ probe: (document.querySelector('#dr-dock #w0-probe') || {}).textContent || null, calls: window.__w0calls, phase: DRDock._debug().phase, empty: !!document.querySelector('#dr-dock .dk-empty') }));
  ok(rd.probe === 'probe destination.research' && rd.phase === 'dest' && !rd.empty, 'registered ResearchDestination not rendered: ' + JSON.stringify(rd));
  await ev(page, () => DR.addFunds(1));   // tiền đổi → renderDest chạy lại → hàm đăng ký được gọi lại
  await sleep(200);
  ok(await ev(page, () => window.__w0calls) >= 2 && await ev(page, () => document.querySelectorAll('#dr-dock #w0-probe').length) === 1, 'registered handler not re-run on funds change');
  await page.screenshot({ path: path.join(OUT, 'w0-research-probe.png') });
  await page.keyboard.press('Escape');
  await sleep(300);
  await dockReady(page);
  ok(await ev(page, () => DRDock._debug().phase) === 'ui', 'Escape did not leave the registered destination');

  // 4. sổ lưu theo ô + forbidSave
  const sv = await ev(page, () => {
    const k0 = DR.saveKey(0), k2 = DR.saveKey(2), kd = DR.saveKey();
    localStorage.removeItem(k2);
    const before0 = localStorage.getItem(k0);
    DR.s.funds = 123.45;
    const w2 = DR.save(2), raw2 = localStorage.getItem(k2), after0 = localStorage.getItem(k0);
    DR.s.forbidSave = true;
    const f0 = DR.save(), f2 = DR.save(2), keep0 = localStorage.getItem(k0) === after0, keep2 = localStorage.getItem(k2) === raw2;
    DR.s.forbidSave = false;
    const back = DR.save(), raw0 = localStorage.getItem(k0);
    localStorage.removeItem(k2);
    return { k0, k2, kd, w2, s2funds: raw2 && JSON.parse(raw2).funds, same0: before0 === after0, f0, f2, keep0, keep2, back, hasForbidKey: raw0.includes('forbidSave'), saved0funds: JSON.parse(raw0).funds };
  });
  ok(sv.k0 === 'dredge.save.v1' && sv.k2 === 'dredge.save.v1.s2' && sv.kd === 'dredge.save.v1', 'saveKey wrong: ' + JSON.stringify(sv));
  ok(sv.w2 && sv.s2funds === 123.45 && sv.same0, 'save to slot 2 failed or touched slot 0: ' + JSON.stringify(sv));
  ok(sv.f0 === false && sv.f2 === false && sv.keep0 && sv.keep2, 'DR.save wrote while forbidSave: ' + JSON.stringify(sv));
  ok(sv.back === true && !sv.hasForbidKey && sv.saved0funds === 123.45, 'save after forbidSave cleared failed: ' + JSON.stringify(sv));

  // 5. ra biển; ToggleFreezeTime true → 5 s lái thuyền mà giờ không đổi
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  const wpos = await openWater(page);
  ok(!!wpos, 'no open water found for the sailing checks');
  await sleep(800);
  await ev(page, () => { window.__days = []; DR.on('dayChanged', d => window.__days.push(d)); DRYarn.commands.ToggleFreezeTime.f(['true']); });
  const fz0 = await ev(page, () => ({ t: DR.s.time, x: DR.s.boat.x, z: DR.s.boat.z }));
  await page.keyboard.down('KeyW'); await sleep(5000); await page.keyboard.up('KeyW');
  const fz1 = await ev(page, () => ({ t: DR.s.time, x: DR.s.boat.x, z: DR.s.boat.z, mode: DRSky.env.timeMode }));
  ok(fz1.t === fz0.t, 'clock moved while time-frozen: ' + fz0.t + ' -> ' + fz1.t);
  ok(Math.hypot(fz1.x - fz0.x, fz1.z - fz0.z) > 5, 'boat did not sail during the freeze check');
  await ev(page, () => DRYarn.commands.ToggleFreezeTime.f(['false']));
  await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
  ok(await ev(page, () => DR.s.time) > fz1.t, 'clock did not resume after ToggleFreezeTime false');

  // 6. AberrationEnabler: Day 2 → 3 chưa bật; Day 3 → 4 bật (lái thuyền qua nửa đêm)
  await openWater(page); await sleep(500);
  await ev(page, () => { DR.s.vars['can-catch-aberrations'] = false; DR.s.time = 2.995; });
  const d3 = await sailUntilDayTurns(page, 15000);
  ok(Math.floor(d3.t) === 3, 'sailing did not cross into Day 3: ' + d3.t);
  ok(d3.flag === false, 'can-catch-aberrations set on Day 3 (original: Day 4)');
  await openWater(page); await sleep(500);
  await ev(page, () => { DR.s.time = 3.995; });
  const d4 = await sailUntilDayTurns(page, 15000);
  ok(Math.floor(d4.t) === 4, 'sailing did not cross into Day 4: ' + d4.t);
  ok(d4.flag === true, 'can-catch-aberrations not set on Day 4');
  const days = await ev(page, () => window.__days);
  console.log('dayChanged events: ' + JSON.stringify(days) + ', times ' + d3.t0.toFixed(3) + '->' + d3.t.toFixed(3) + ', ' + d4.t0.toFixed(3) + '->' + d4.t.toFixed(3));
  ok(days.includes(3) && days.includes(4), 'dayChanged not emitted for days 3 and 4: ' + JSON.stringify(days));
  await page.screenshot({ path: path.join(OUT, 'w0-day4.png') });

  // 7. sổ lưu ở Day 5 chưa có cờ → Tiếp tục → khung đầu báo dayChanged(5) và cờ bật (TimeController._lastDay = 0 khi vào cảnh)
  await ev(page, () => { DR.s.time = 5.3; DR.s.vars['can-catch-aberrations'] = false; DR.save(); });
  await page.goto(base + '/games/dredge/index.html');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.waitForSelector('#btn-continue:not([hidden])', { timeout: 10000 }).catch(() => {});
  await page.click('#btn-continue');
  await page.waitForFunction(() => DR.mode !== 'title', null, { timeout: 15000 }).catch(() => {});
  await sleep(1000);
  const ld = await ev(page, () => ({ t: DR.s.time, flag: !!DR.s.vars['can-catch-aberrations'] }));
  ok(Math.floor(ld.t) === 5 && ld.flag, 'flag not set after loading a Day 5 save: ' + JSON.stringify(ld));

  // 8. ?dlc=1 → đủ 26 bến
  const p2 = await ctx.newPage(); watch(p2);
  await p2.goto(base + '/games/dredge/index.html?dlc=1');
  await p2.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  const dk2 = await ev(p2, () => ({ n: DRDocks.list.length, tpr: !!DRDocks.byId['dock.tpr-east'], rig: !!DRDocks.byId['dock.the-iron-rig'], ph: !!DRDocks.byId['dock.photographer-camp'] }));
  ok(dk2.n === 26 && dk2.tpr && dk2.rig && dk2.ph, 'DLC docks missing with ?dlc=1: ' + JSON.stringify(dk2));
  await p2.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  await p2.screenshot({ path: path.join(OUT, 'w0-title-844.png') });

  ok(!errors.length, 'errors: ' + errors.slice(0, 6).join(' | '));
  console.log('dredge-w0seams: ' + pass + ' passed, ' + fail + ' failed  (shots ' + OUT + ')');
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
