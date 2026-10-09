/*
 * DREDGE - kiem don vi U6 scares (js/scares.js): Splash, Parasite, Eyes, FlickerLights, GhostWind, LeviathanCall, GhostFoghorn, LoreRock.
 * Chay: node test/dredge-m2scares.js   (anh: SHOTS=... hoac %TEMP%/dredge-m2scares)
 * So goc (MONSTERS.md 2.7, 2.8, 3.3 hang U6): ParasiteWorldEvent.cs (2 s), EyeParticlesWorldEvent.cs + Game.unity FollowPlayer/EyeParticles (60 / 2 / 20 / 15, fade 5 / 2),
 * FlickerLightsWorldEvent.cs (durationSec 2, enableAfterFinish 0), GhostWindWorldEvent.cs (25-150 m, 20 s, delay 5 s), DistantSoundWorldEvent.cs (1000 m),
 * GhostFoghorn.cs (5 s, im 2 s, ban kinh 1000), LoreRockManager.cs (nguong 0,5, max 60, chu ky 3 s).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m2scares');
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
// nuoc sau, xa bo: noi dat thuyen cho moi phep thu
async function openWater(page) {
  return page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 120; r <= 220; r += 10) for (let a = 0; a < 6.28; a += 0.2) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 30 && DRWorld.depth01(x, z) > 0.3) { DR_DEBUG.teleport(x, z, 0); DRBoat.stop(); return { x, z }; }
    }
    return null;
  });
}
const LORE_PTS = [[-46, 9], [307, 215], [9, 1], [11, 76]];

(async () => {
  const srv = await serve();
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);
  const quiet = () => ev(() => { const c = DREvents.current; if (c) c.handle.dispose(); DRBoat.lightOverride(null); });   // dọn mọi sự kiện lỡ bốc khi nhảy giờ
  const w = await openWater(page);
  check('co cho nuoc rong de thu', !!w, JSON.stringify(w));
  await ev(() => { DR.s.worldPhase = 2; DR_DEBUG.setTime(0.95); DR.s.sanity = 0.6; });
  await sleep(500); await quiet();
  check('DRScares nap duoc', await ev(() => !!window.DRScares));

  // ---------------------------------------------------------------- Parasite
  console.log('Parasite');
  await ev(() => {
    const inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) if (DRGrid.subOf(DR_ITEMS[it.id]) & DRGrid.SUB.FISH) DRGrid.remove(inv, it);
    DR.give('cod'); DR.give('cod'); DR.give('cod');
    DR.s.eventHistory = {}; DR.s.sanity = 0.4;
    window.__toasts = []; const t = DRHud.toast; DRHud.toast = (x, ms) => { window.__toasts.push(x); return t.call(DRHud, x, ms); };
    DREvents.debug.force('Parasite');
  });
  await sleep(1200);
  check('Parasite: 1,2 s chua lay', (await ev(() => DR.grid('INVENTORY').items.filter(i => i.infected).length)) === 0);
  await sleep(1300);
  const inf = await ev(() => DR.grid('INVENTORY').items.filter(i => i.infected).length);
  check('Parasite: sau 2 s dung 1 con ca nhiem', inf === 1, 'nhiem ' + inf);
  check('Parasite: thong bao lay', (await ev(() => window.__toasts)).some(t => /trườn vào khoang/.test(t)), JSON.stringify(await ev(() => window.__toasts)));
  check('Parasite: hat ParasiteWorldEvent dang chay', (await ev(() => DRParticles.stats().byName.ParasiteWorldEvent)) != null);
  await sleep(4500);
  check('Parasite: ket thuc sau 6 s (main.duration), van 1 con nhiem', (await ev(() => DREvents.current)) === null && (await ev(() => DR.grid('INVENTORY').items.filter(i => i.infected).length)) === 1);
  await ev(() => { DR.s.eventHistory = {}; DREvents.debug.force('Parasite'); });
  await sleep(2600);
  check('Parasite: lan 2 lay con ca KHAC, tong 2', (await ev(() => DR.grid('INVENTORY').items.filter(i => i.infected).length)) === 2);
  await quiet();

  // ---------------------------------------------------------------- Splash
  console.log('Splash');
  await ev(() => { DR.s.eventHistory = {}; DREvents.debug.force('Splash'); });
  await sleep(600);
  check('Splash: dang song, hat SplashWorldEvent', (await ev(() => DREvents.current && DREvents.current.name)) === 'Splash' && (await ev(() => DRParticles.stats().byName.SplashWorldEvent)) != null);
  await sleep(6200);
  check('Splash: het sau main.duration 6 s', (await ev(() => DREvents.current)) === null);

  // ---------------------------------------------------------------- FlickerLights
  console.log('FlickerLights');
  await ev(() => { DR.s.abilities.lights = true; DR.s.eventHistory = {}; if (DR.s.lightsOn) DRAbilities.ability('lights').deactivate(); window.__fk = []; });
  check('truoc: den tat', (await ev(() => DR.s.lightsOn)) === false);
  await ev(() => {
    DREvents.debug.force('FlickerLights');
    window.__t0 = performance.now();
    const f = () => { window.__fk.push([+((performance.now() - window.__t0) / 1000).toFixed(3), DR.s.lightsOn, DRBoat.lightK, DRAbilities.locked('lights')]); if (performance.now() - window.__t0 < 2600) requestAnimationFrame(f); };
    f();
  });
  await sleep(300);
  const fk0 = await ev(() => ({ on: DR.s.lightsOn, locked: DRAbilities.locked('lights'), k: DRBoat.lightK }));
  check('FlickerLights: den bi ep bat va khoa', fk0.on === true && fk0.locked === true, JSON.stringify(fk0));
  await sleep(2400);
  const fk = await ev(() => window.__fk);
  const last = await ev(() => ({ on: DR.s.lightsOn, locked: DRAbilities.locked('lights'), k: DRBoat.lightK, cur: DREvents.current }));
  const dark = fk.filter(r => r[2] != null && r[2] < 0.01 && r[0] > 0.02 && r[0] < 1.9).length, bright = fk.filter(r => r[2] > 0.5).length;
  check('FlickerLights: do sang nhap nhay theo flickerCurve (co khung k=0 va k>0,5)', dark > 3 && bright > 3, 'toi ' + dark + ' sang ' + bright);
  const offAt = fk.find(r => r[1] === false);
  check('FlickerLights: lightsOn === false luc 2 s (khong som)', !!offAt && offAt[0] >= 1.9 && offAt[0] <= 2.3, JSON.stringify(offAt));
  check('FlickerLights: mo khoa, tra lightOverride, den tat, het su kien', !last.locked && last.k == null && !last.on && last.cur === null, JSON.stringify(last));
  check('curve(0) = 1 va curve(1) = 0', (await ev(() => DRScares.curve(0))) === 1 && (await ev(() => DRScares.curve(1))) === 0);

  // ---------------------------------------------------------------- Eyes
  console.log('Eyes');
  await ev(() => { DR.s.eventHistory = {}; DR.s.sanity = 0; DREvents.debug.force('Eyes'); });
  await sleep(400);
  const e0 = await ev(() => DRScares.debug.eyes());
  check('Eyes sanity 0: tran hat 60, thoi luong 20 s', e0 && e0.target === 60 && e0.dur > 19.4 && e0.dur <= 20, JSON.stringify(e0));
  await sleep(5600);
  const e1 = await ev(() => ({ d: DRScares.debug.eyes(), n: DREvents.current && DREvents.current.handle.fx.count, alive: DREvents.current && DREvents.current.handle.fx.alive }));
  check('Eyes: sau tween 5 s, maxParticles = 60 va hat song 0 < n <= 60', e1.d.cap === 60 && e1.n > 0 && e1.n <= 60, JSON.stringify(e1));
  check('Eyes: dong hat EyeParticles ton tai', (await ev(() => DRParticles.stats().byName.EyeParticles)) != null);
  await ev(() => DR.emit('banish', true));                          // dispelByBanish
  await sleep(300);
  check('Eyes: Banish -> dang mo dan (mode out)', (await ev(() => DRScares.debug.eyes().mode)) === 'out');
  await sleep(2200);
  check('Eyes: het 2 s thi xong, current null', (await ev(() => DREvents.current)) === null && (await ev(() => DRScares.debug.eyes().done)) === true);
  await ev(() => DR.emit('banish', false));
  await ev(() => { DR.s.eventHistory = {}; DR.s.sanity = 0.375; DREvents.debug.force('Eyes'); });
  await sleep(300);
  const e2 = await ev(() => DRScares.debug.eyes());
  check('Eyes sanity 0,375: t = 0,5 -> 31 hat, 17,5 s', e2 && near(e2.target, 31, 0.01) && e2.dur > 17 && e2.dur <= 17.5, JSON.stringify(e2));
  await quiet();

  // ---------------------------------------------------------------- LeviathanCall
  console.log('LeviathanCall');
  const lv = await ev(() => { DR.s.eventHistory = {}; const b = DR.s.boat, h = DREvents.debug.force('LeviathanCall'); return { d: Math.hypot(h.pos.x - b.x, h.pos.z - b.z), done: h.done }; });
  check('LeviathanCall: cach nguoi choi 1000 m, xong ngay', near(lv.d, 1000, 0.01) && lv.done, JSON.stringify(lv));
  await sleep(300);
  check('LeviathanCall: current null', (await ev(() => DREvents.current)) === null);

  // ---------------------------------------------------------------- GhostWind
  console.log('GhostWind');
  const sp = await ev(() => {
    const L = DRSpots.list.filter(s => (DR.s.spots[s.id] ? DR.s.spots[s.id].stock : s.d.startStock) >= 1);
    for (const s of L) for (let a = 0; a < 6.28; a += 0.4) {
      const x = s.x + Math.cos(a) * 60, z = s.z + Math.sin(a) * 60;
      if (DRWorld.sdf(x, z) > 8) { DR_DEBUG.teleport(x, z, 0); DRBoat.stop(); return { id: s.id, x: s.x, z: s.z }; }
    }
    return null;
  });
  check('co diem cau de thu GhostWind', !!sp, JSON.stringify(sp));
  await sleep(500); await quiet();
  const gw = await ev(() => { DR.s.eventHistory = {}; DR.s.sanity = 0.6; const h = DREvents.debug.force('GhostWind'); return h && h.target && { id: h.target.id, d: h.target.d }; });
  check('GhostWind: chon diem 25-150 m (' + JSON.stringify(gw) + ')', gw && gw.d > 25 && gw.d < 150);
  await sleep(2500);
  const dir = await ev(() => {
    const h = DREvents.current.handle, b = DR.s.boat, tg = h.target;
    let mx = 0, mz = 0, n = 0;
    for (const s of h.fx.systems) if (s.node.main.space === 1) for (let i = 0; i < s.n; i++) { mx += s.px[i]; mz += -s.pz[i]; n++; }
    mx /= n; mz /= n;
    const dx = tg.x - b.x, dz = tg.z - b.z, L = Math.hypot(dx, dz);
    return { n, cos: ((mx - b.x) * dx + (mz - b.z) * dz) / (Math.hypot(mx - b.x, mz - b.z) * L), dest: !!DRParticles.stats().byName.DestinationWindEffect, wind: !!DRParticles.stats().byName.GhostWindEvent };
  });
  check('GhostWind: hat gio + DestinationWindEffect ton tai', dir.dest && dir.wind && dir.n > 5, JSON.stringify(dir));
  check('GhostWind: hat troi ve phia diem dich (cos > 0,8)', dir.cos > 0.8, 'cos ' + dir.cos);
  await ev(() => DR.emit('harvestStart', { id: 'x' }));
  await sleep(2000);
  check('GhostWind: cham diem -> dang ket thuc nhung chua xong (delay 5 s)', (await ev(() => DREvents.current && DREvents.current.handle.finishing)) === true);
  await sleep(3600);
  check('GhostWind: xong sau finishDelaySec 5 s', (await ev(() => DREvents.current)) === null);
  const gw2 = await ev(() => { DR.s.eventHistory = {}; DR_DEBUG.teleport(DR.s.boat.x + 400, DR.s.boat.z + 400, 0); DRBoat.stop(); const h = DREvents.debug.force('GhostWind'); return h && h.target; });
  await sleep(300);
  check('GhostWind: khong co diem nao trong 150 m -> target null', gw2 === null || gw2 === undefined);
  await quiet();

  // ---------------------------------------------------------------- GhostFoghorn
  console.log('GhostFoghorn');
  await openWater(page);
  await ev(() => { DR_DEBUG.setTime(0.9); });
  await sleep(300); await quiet();
  const g0 = await ev(() => DRScares.debug.foghorn());
  check('GhostFoghorn: ban dem co the ghi', g0.canRecord === true, JSON.stringify(g0));
  await ev(() => DR.emit('abilityToggled', { id: 'foghorn', active: true }));
  await sleep(500);
  await ev(() => DR.emit('abilityToggled', { id: 'foghorn', active: false }));
  await sleep(300);
  const g1 = await ev(() => DRScares.debug.foghorn());
  check('GhostFoghorn: dang ghi, 2 moc (bat, tat)', g1.recording && g1.blare && g1.blare.length === 2 && near(g1.blare[1] - g1.blare[0], 0.5, 0.15), JSON.stringify(g1));
  await sleep(1900);
  const g2 = await ev(() => DRScares.debug.foghorn());
  check('GhostFoghorn: im 2 s thi chot, phat lai o diem trong ban kinh 1000 quanh goc ban do', g2.replaying && g2.pos && Math.hypot(g2.pos.x, g2.pos.z) <= 1000, JSON.stringify(g2));
  await sleep(900);
  const g3 = await ev(() => DRScares.debug.foghorn());
  check('GhostFoghorn: phat lai xong (replaying false), 2 ngay sau moi ghi lai', !g3.replaying && !g3.canRecord, JSON.stringify(g3));
  await ev(() => DR.emit('abilityToggled', { id: 'foghorn', active: true }));
  await sleep(100);
  await ev(() => DR.emit('abilityToggled', { id: 'foghorn', active: false }));
  check('GhostFoghorn: trong 2 ngay khong ghi them', !(await ev(() => DRScares.debug.foghorn().recording)));
  await quiet();

  // ---------------------------------------------------------------- LoreRock
  console.log('LoreRock');
  const lr = await ev(async pts => {
    for (const [x, z] of pts) {
      DR_DEBUG.teleport(x + 15, z, 0); DRBoat.stop();
      await new Promise(r => setTimeout(r, 1500));
      if ((DRWorld.loreGlow || []).length) return { x, z, n: DRWorld.loreGlow.length };
    }
    return { n: (DRWorld.loreGlow || []).length };
  }, LORE_PTS);
  check('co vat lieu LoreRock_Mat trong cell da dung', lr.n > 0, JSON.stringify(lr));
  await ev(() => { DR.s.sanity = 0.3; });
  await sleep(3500);
  const l1 = await ev(() => ({ d: DRScares.debug.lore(), a: (DRWorld.loreGlow || []).map(v => v.w), r: (DRWorld.loreGlow || []).map(v => +v.x.toFixed(3)) }));
  check('LoreRock: sanity 0,3 -> current -> 1 sau ~3 s, _GlowStrength <= 60', l1.d.cur > 0.9 && l1.d.strength <= 60 && l1.d.strength >= 8, JSON.stringify(l1));
  check('LoreRock: uniform uDrGlow dang sang (a = 50 m)', l1.a.length > 0 && l1.a.every(a => a === 50) && l1.r.some(r => r > 0), JSON.stringify(l1));
  await ev(() => { DR.s.sanity = 0.8; });
  await sleep(4500);
  const l2 = await ev(() => ({ d: DRScares.debug.lore(), a: (DRWorld.loreGlow || []).map(v => v.w) }));
  check('LoreRock: sanity 0,8 -> tat (current ~0, a = 0)', l2.d.cur < 0.05 && l2.a.every(a => a === 0), JSON.stringify(l2));

  check('khong loi trang (pageerror / console / HTTP)', errors.length === 0, errors.slice(0, 4).join(' | '));
  await page.close();

  // ---------------------------------------------------------------- Anh 1280x720 va 844x390
  for (const [W, H] of [[1280, 720], [844, 390]]) {
    const { page: pg, errors: er } = await boot(browser, base, W, H);
    const e = (fn, a) => pg.evaluate(fn, a);
    await openWater(pg);
    await e(() => { DR.s.worldPhase = 2; DR_DEBUG.setTime(0.97); DR.s.sanity = 0; });
    await sleep(600);
    await e(() => { const c = DREvents.current; if (c) c.handle.dispose(); DR.s.eventHistory = {}; DR.s.sanity = 0; DREvents.debug.force('Eyes'); });
    await sleep(6500);
    await pg.screenshot({ path: path.join(SHOTS, 'eyes-' + W + 'x' + H + '.png') });
    await e(() => { const c = DREvents.current; if (c) c.handle.dispose(); DR.s.eventHistory = {}; DREvents.debug.force('Splash'); });
    await sleep(2000);
    await pg.screenshot({ path: path.join(SHOTS, 'splash-' + W + 'x' + H + '.png') });
    await e(() => { const c = DREvents.current; if (c) c.handle.dispose(); DR.s.sanity = 0.3; });
    const pos = await e(async pts => {
      for (const [x, z] of pts) {
        DR_DEBUG.teleport(x + 8, z, 0); DRBoat.stop();
        await new Promise(r => setTimeout(r, 1500));
        if ((DRWorld.loreGlow || []).length) return { x, z };
      }
      return null;
    }, LORE_PTS);
    await sleep(5000);
    await pg.screenshot({ path: path.join(SHOTS, 'lore-' + W + 'x' + H + '.png') });
    console.log('  anh ' + W + 'x' + H + ' lore tai ' + JSON.stringify(pos) + ' loi: ' + er.length);
    await pg.close();
  }
  await browser.close(); srv.close();
  console.log('\n' + pass + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
