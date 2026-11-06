/*
 * DREDGE - kiem U4 ghosts (MONSTERS.md 2.4, 2.5, 3.3): thuyen ma GhostBoat_* va FogGhost tinh (js/ghosts.js, data/ghosts.js, tools/ghosts.py).
 * Chay: node test/dredge-m3ghosts.js   (anh: %TEMP%/dredge-m3ghosts hoac SHOTS=...)
 * So goc: GhostBoatWorldEvent.cs, FogGhost.cs, GhostBoat_Player1.prefab (maxTravelDistance 100, despawnPlayerProximity 25, despawnDestinationProximity 10,
 * finishDelaySec 2, NavMeshAgent speed 3,5 accel 8), WorldEventData GhostBoat_Player1 (durationSec 20, playerSpawnOffset (-50, 0, 50)),
 * FogGhost_FadeIn / FadeOut (Opacity 2 s, tiep tuyen 0).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m3ghosts');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const smooth = u => 3 * u * u - 2 * u * u * u;       // Hermite hai khoa tiep tuyen 0 (FogGhost_FadeIn / FadeOut)

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
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /ghost|shader|program/i.test(m.text()))) errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
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

(async () => {
  const srv = await serve();
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);

  // ---------------------------------------------------------------- 1. du lieu tu tools/ghosts.py
  console.log('U4 du lieu');
  const D = await ev(() => ({ n: DR_GHOSTS.statics.length, names: DR_GHOSTS.statics.map(s => s.name), boats: Object.keys(DR_GHOSTS.boats), B: DR_GHOSTS.boats.GhostBoat_Player1,
    fade: DR_GHOSTS.fade, shader: DR_GHOSTS.shader, ready: !!DRGhosts,
    gm: DR_GHOSTS.statics.map(s => [s.name, s.x, s.z, s.seen, s.manual]) }));
  check('15 FogGhost tinh (7 o Marrows + 8 ngoai)', D.n === 15, D.names.join(','));
  check('4 thuyen ma', D.boats.join() === 'GhostBoat_Player1,GhostBoat_Player2,GhostBoat_Player3,GhostBoat_Pirate');
  check('Player1: maxTravel 100, den nguoi 25, den dich 10, finishDelay 2', D.B.maxTravelDistance === 100 && D.B.despawnPlayerProximity === 25 && D.B.despawnDestinationProximity === 10 && D.B.finishDelaySec === 2, JSON.stringify(D.B));
  check('Player1: agent toc do 3,5, tang toc 8, quay 120; coi 0,5-1,5 s, vol 0,5, pitch 0,95, 50-200 m', D.B.agent.speed === 3.5 && D.B.agent.accel === 8 && D.B.agent.angular === 120 && D.B.foghornMin === 0.5 && D.B.foghornMax === 1.5 &&
    D.B.horn.vol === 0.5 && D.B.horn.pitch === 0.95 && D.B.horn.min === 50 && D.B.horn.max === 200 && D.B.horn.loop === true, JSON.stringify(D.B.horn));
  check('lop cam spawn 50364544 (layer 7, 15, 24, 25)', D.B.forbiddenSpawnLayers === ((1 << 7) | (1 << 15) | (1 << 24) | (1 << 25)));
  check('FadeIn 0 -> 1 trong 2 s, FadeOut 1 -> 0 trong 2 s', D.fade.in.len === 2 && D.fade.out.len === 2 && D.fade.in.keys[1][1] === 1 && D.fade.out.keys[0][1] === 1);
  check('blend SrcAlpha / OneMinusSrcAlpha, ZWrite tat, hang doi 3000', D.shader.blend[0] === 5 && D.shader.blend[1] === 10 && D.shader.zwrite === 0 && D.shader.queue === 3000, JSON.stringify(D.shader));
  const byName = Object.fromEntries(D.gm.map(r => [r[0], r]));
  check('GMShipwreck (49,5, -24,8 three), GMPicnic (-37,3, 12,6), seen 30',
    near(byName.GMShipwreck[1], 49.5, 0.1) && near(byName.GMShipwreck[2], -24.77, 0.1) && near(byName.GMPicnic[1], -37.31, 0.1) && near(byName.GMPicnic[2], 12.64, 0.1) && byName.GMShipwreck[3] === 30 && byName.GMPicnic[3] === 30, JSON.stringify(byName.GMPicnic));
  check('CourierContainer seen 70 + manual fade; GhostIsland seen 50', byName.CourierContainer[3] === 70 && byName.CourierContainer[4] === true && byName.GhostIsland[3] === 50 && byName.GhostIsland[4] === false);

  // ---------------------------------------------------------------- 2. cho dung o vung Marrows, ban dem
  const at = await ev(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 100; r <= 240; r += 10) for (let a = 0; a < 6.28; a += 0.15) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) < 60 || DRWorld.zoneAt(x, z) !== 'THE_MARROWS') continue;
      for (let yaw = 0; yaw < 6.28; yaw += 0.5) {
        const w = DREvents.offsetWorld({ x, z, yaw }, [-50, 0, 50]);
        if (DRNav.sample({ x: w[0], z: w[1] }, 5, 'generic') && DRNav.sample({ x, z }, 1, 'generic')) return { x, z, yaw };
      }
    }
    return null;
  });
  check('tim duoc cho nuoc rong trong Marrows (nav di duoc o thuyen va o diem sinh (-50,0,50))', !!at, JSON.stringify(at));
  await ev(a => { DR.s.worldPhase = 0; DR.s.sanity = 0.5; DR_DEBUG.teleport(a.x, a.z, a.yaw); DR_DEBUG.setTime(0.95); if (DR.s.lightsOn) DRBoat.setLights(false); DRBoat.stop(); }, at);
  await sleep(1500);
  const sun = await ev(() => ({ y: DRSky.uniforms.uDrSunDir.value.y, night: DRSky.env.night }));
  check('ban dem 0,95: bong ma hien (huong sang y < -0,474 theo DXBC)', sun.y < -0.474, JSON.stringify(sun));
  await ev(() => DR_DEBUG.setTime(0.5));
  await sleep(1500);
  const sunD = await ev(() => DRSky.uniforms.uDrSunDir.value.y);
  check('ban ngay 0,5: huong sang y > -0,43 (alpha bong ma = 0)', sunD > -0.43, String(sunD));
  await ev(() => DR_DEBUG.setTime(0.95));

  // ---------------------------------------------------------------- 3. FogGhost tinh
  console.log('U4 FogGhost');
  const ghostPos = n => D.gm.find(r => r[0] === n);
  // thuyen cach GM ~20 m: gan nhat la GMPicnic hoac GMShipwreck
  await ev(() => { DRGhosts.reset(); DR_DEBUG.teleport(20, -8, 0); DRBoat.stop(); });
  await sleep(500);
  const f0 = await ev(() => { DREvents.debug.force('FogGhost'); return { st: DRGhosts.debug.statics().filter(s => s.active) }; });
  check('ep FogGhost gan Greater Marrow: GMPicnic hoac GMShipwreck kich hoat (1 vat)', f0.st.length === 1 && ['GMPicnic', 'GMShipwreck'].includes(f0.st[0].name), JSON.stringify(f0.st));
  await sleep(400);
  const f1 = await ev(() => ({ cur: DREvents.current && DREvents.current.name, live: DREvents.debug.live(), hist: DREvents.debug.history().FogGhost, st: DRGhosts.debug.statics().filter(s => s.active) }));
  check('su kien FogGhost ket thuc ngay (khong con la current/live; su kien khac co the tu boc), vat van sang', f1.cur !== 'FogGhost' && !f1.live.includes('FogGhost') && f1.st.length === 1, JSON.stringify(f1));
  check('lich su FogGhost duoc ghi (repeatDelay 2 ngay)', typeof f1.hist === 'number');
  const gname = f1.st[0].name;
  const f2 = await ev(() => DRGhosts.debug.statics().find(s => s.active));
  check('Opacity theo FadeIn: op = smoothstep(t / 2)', f2.phase === 'in' && near(f2.op, smooth(Math.min(1, f2.t / 2)), 1e-6) && f2.t > 0.3 && f2.t < 1.9, JSON.stringify(f2));
  check('mesh da nap (meshes.bin)', f2.hasMesh);
  // dat thuyen cach vat 20 m, huong ve vat: thay vat trong tam nhin va < 30 m -> seen
  const gp = ghostPos(gname);
  const face = (gx, gz, d) => ev(([gx, gz, d]) => { const bx = gx + d, bz = gz, yaw = Math.atan2(-(gx - bx), -(gz - bz)); DR_DEBUG.teleport(bx, bz, yaw); DRBoat.stop(); return { bx, bz, yaw }; }, [gx, gz, d]);
  const pl = await face(gp[1], gp[2], 20);
  await sleep(1200);
  const f3 = await ev(n => DRGhosts.debug.statics().find(s => s.name === n), gname);
  check('vat trong khung hinh va < seen 30 m: hasBeenSeen', f3.seen === true && !f3.fading, JSON.stringify(f3));
  await ev(([x, z, yaw]) => { DR_DEBUG.teleport(x, z, yaw + Math.PI); DRBoat.stop(); }, [pl.bx, pl.bz, pl.yaw]);
  await sleep(700);
  const f4n = await ev(n => DRGhosts.debug.statics().find(s => s.name === n), gname);
  check('ra khoi khung hinh: FogGhost_FadeOut', f4n.phase === 'out' && f4n.fading, JSON.stringify(f4n));
  check('FadeOut: op = 1 - smoothstep(t / 2)', near(f4n.op, 1 - smooth(Math.min(1, f4n.t / 2)), 1e-6), JSON.stringify(f4n));
  await sleep(2200);
  const f5 = await ev(n => DRGhosts.debug.statics().find(s => s.name === n), gname);
  check('sau 2 s mo dan: tat han (SetActive false)', f5.active === false && f5.phase === '', JSON.stringify(f5));
  // vat "manual" (CourierContainer): mo dan ngay khi vua thay
  await ev(() => DRGhosts.debug.activate('CourierContainer'));
  const cc = ghostPos('CourierContainer');
  await face(cc[1], cc[2], 50);
  await sleep(1200);
  const f6 = await ev(() => DRGhosts.debug.statics().find(s => s.name === 'CourierContainer'));
  check('CourierContainer (manuallyFadeOutIfCloserThanSeenDistance): thay xong la mo dan', f6.seen === true && f6.phase === 'out', JSON.stringify(f6));
  await sleep(2300);

  // ---------------------------------------------------------------- 4. Thuyen ma
  console.log('U4 thuyen ma');
  await ev(a => { DRGhosts.reset(); DR_DEBUG.teleport(a.x, a.z, a.yaw); DRBoat.stop(); DR.s.eventHistory = {}; }, at);
  await sleep(600);
  const b0 = await ev(() => {
    const b = DR.s.boat, exp = DREvents.offsetWorld(b, [-50, 0, 50]);
    const h = DREvents.debug.force('GhostBoat_Player1');
    const bs = DRGhosts.debug.boats();
    return { exp, got: !!h, bs, cur: DREvents.current && DREvents.current.name, boat: { x: b.x, z: b.z } };
  });
  check('ep GhostBoat_Player1: co 1 thuyen ma, currentEvent = GhostBoat_Player1', b0.got && b0.bs.length === 1 && b0.cur === 'GhostBoat_Player1', JSON.stringify(b0.bs));
  check('sinh trong 5 m quanh thuyen + (-50, 0, 50)', Math.hypot(b0.bs[0].x - b0.exp[0], b0.bs[0].z - b0.exp[1]) <= 5.01, JSON.stringify([b0.bs[0].x, b0.bs[0].z, b0.exp]));
  const t0 = Date.now();
  let maxV = 0, minD = 1e9, hasMesh = false, first = null, last = null, finishAt = null;
  for (;;) {
    const s = await ev(() => DRGhosts.debug.boats()[0] || null);
    if (!s) break;
    if (!first) first = s;
    last = s; maxV = Math.max(maxV, s.v); minD = Math.min(minD, s.dPlayer); hasMesh = hasMesh || s.hasMesh;
    if (s.finishing && finishAt == null) finishAt = { age: s.age, reason: s.reason, wall: (Date.now() - t0) / 1000 };
    if (Date.now() - t0 > 40000) break;
    await sleep(250);
  }
  const wall = (Date.now() - t0) / 1000;
  const dest = first.dest;
  check('diem den tren navmesh, <= 100 m tu cho sinh (hoac khong tim duoc duong)', !dest || (Math.hypot(dest.x - b0.bs[0].x, dest.z - b0.bs[0].z) <= 100.5), JSON.stringify(dest));
  check('toc do khong qua 3,5 m/s (NavMeshAgent speed), co chay (> 1 m/s)', maxV <= 3.51 && maxV > 1, 'maxV ' + maxV.toFixed(2));
  check('mesh thuyen ma da dung', hasMesh);
  check('ket thuc: ' + (finishAt && finishAt.reason) + ' sau ' + (finishAt && finishAt.age.toFixed(1)) + ' s (<= 20 s), bien mat <= 23,5 s thuc', !!finishAt && finishAt.age <= 20.4 && wall <= 23.5, JSON.stringify(finishAt) + ' wall ' + wall.toFixed(1));
  check('ly do ket thuc hop le (duration / destination / player)', !!finishAt && ['duration', 'destination', 'player'].includes(finishAt.reason));
  check('currentEvent giai phong khi xong', (await ev(() => DREvents.current)) === null);
  console.log('    thuyen ma song ' + (last && last.age.toFixed(1)) + ' s, ly do ' + (finishAt && finishAt.reason) + ', khoang cach nguoi choi nho nhat ' + minD.toFixed(1) + ' m');

  // vao trong 25 m: ket thuc ngay
  await ev(a => { DRGhosts.reset(); DR_DEBUG.teleport(a.x, a.z, a.yaw); DRBoat.stop(); DR.s.eventHistory = {}; }, at);
  await sleep(600);
  await ev(() => DREvents.debug.force('GhostBoat_Player1'));
  await sleep(2600);                                         // cho FadeIn xong
  const g1 = await ev(() => DRGhosts.debug.boats()[0]);
  check('sau 2,6 s: da hien het (op = 1), chua ket thuc', g1 && near(g1.op, 1, 1e-6) && !g1.finishing, JSON.stringify(g1));
  await ev(g => { const b = DR.s.boat; DR_DEBUG.teleport(g.x + 20, g.z, b.yaw); DRBoat.stop(); }, g1);
  await sleep(500);
  const g2 = await ev(() => DRGhosts.debug.boats()[0]);
  check('nguoi choi trong 25 m: RequestEventFinish (reason player), FadeOut tu 1', g2 && g2.finishing && g2.reason === 'player' && near(g2.op, 1 - smooth(Math.min(1, g2.tOut / 2)), 1e-6), JSON.stringify(g2));
  await sleep(1300);
  check('chua den finishDelay 2 s: van con (dang mo dan)', (await ev(() => DRGhosts.debug.boats().length)) === 1);
  await sleep(1000);
  check('sau 2 s: huy, su kien xong', (await ev(() => DRGhosts.debug.boats().length === 0 && DREvents.current === null)));

  // khong co navmesh quanh diem sinh: huy sinh, khong ghi lich su
  const land = await ev(() => {
    for (let x = -600; x < 600; x += 7) for (let z = -600; z < 600; z += 7) {
      if (DRWorld.sdf(x - 50, z - 50) > -20) continue;     // diem sinh (-50, 0, 50) o yaw 0 nam sau trong dat lien
      if (!DRNav.sample({ x: x - 50, z: z - 50 }, 5, 'generic')) return { x, z, sdf: DRWorld.sdf(x - 50, z - 50) };
    }
    return null;
  });
  check('tim duoc diem ma cho sinh nam sau trong dat lien', !!land, JSON.stringify(land));
  if (land) {
    await ev(l => { DR.s.eventHistory = {}; DR_DEBUG.teleport(l.x, l.z, 0); DRBoat.stop(); }, land);
    await sleep(400);
    const ab = await ev(() => { const h = DREvents.debug.force('GhostBoat_Player1'); return { h: !!h, n: DRGhosts.debug.boats().length, hist: 'GhostBoat_Player1' in DREvents.debug.history(), cur: DREvents.current && DREvents.current.name }; });
    check('khong co navmesh trong 5 m: huy sinh (khong thuyen, khong lich su, khong currentEvent)', !ab.h && ab.n === 0 && !ab.hist && !ab.cur, JSON.stringify(ab));
  }

  const durs = await ev(() => ['GhostBoat_Player1', 'GhostBoat_Player2', 'GhostBoat_Player3', 'GhostBoat_Pirate'].map(n => [n, DR_WORLDEVENTS[n].durationSec, DR_WORLDEVENTS[n].minWorldPhase, DR_GHOSTS.boats[n].mesh]));
  check('durationSec 20/20/20/30, minWorldPhase 0/1/2/3, mesh GhostBoat1/2/3/GhostPirate', JSON.stringify(durs) === JSON.stringify([['GhostBoat_Player1', 20, 0, 'GhostBoat1'], ['GhostBoat_Player2', 20, 1, 'GhostBoat2'], ['GhostBoat_Player3', 20, 2, 'GhostBoat3'], ['GhostBoat_Pirate', 30, 3, 'GhostPirate']]), JSON.stringify(durs));

  // ---------------------------------------------------------------- 5. anh chup
  console.log('U4 anh chup');
  async function shotBoat(name, file) {
    await ev(a => { DRGhosts.reset(); DR_DEBUG.teleport(a.x, a.z, a.yaw); DRBoat.stop(); DR.s.eventHistory = {}; DR_DEBUG.setTime(0.95); DR.s.sanity = 0.5; if (DR.s.lightsOn) DRBoat.setLights(false); }, at);
    await sleep(600);
    await ev(n => { DREvents.debug.force(n); }, name);
    await sleep(2400);
    // quay mui thuyen ve phia thuyen ma
    await ev(() => {
      const g = DRGhosts.debug.boats()[0], b = DR.s.boat;
      if (!g) return;
      const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz), k = Math.max(0, d - 40) / d;      // lai gan toi 40 m (> 25 m: khong bi xua)
      DR_DEBUG.teleport(b.x + dx * k, b.z + dz * k, Math.atan2(-dx, -dz)); DRBoat.stop();
    });
    await sleep(900);
    const v2 = await ev(() => { const g = DRGhosts.debug.boats()[0]; return g ? { d: g.dPlayer, op: g.op, fin: g.finishing, age: g.age } : null; });
    await page.screenshot({ path: path.join(SHOTS, file) });
    return v2;
  }
  const sA = await shotBoat('GhostBoat_Player1', 'ghostboat-1280x720.png');
  check('anh 1280x720: thuyen ma hien (op 1, khong dang mo dan, cach > 25 m)', sA && near(sA.op, 1, 1e-6) && !sA.fin && sA.d > 25, JSON.stringify(sA));
  const sP = await shotBoat('GhostBoat_Pirate', 'ghostpirate-1280x720.png');
  check('anh Pirate hien', sP && near(sP.op, 1, 1e-6) && !sP.fin, JSON.stringify(sP));
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(1200);
  const sB = await shotBoat('GhostBoat_Player1', 'ghostboat-844x390.png');
  check('anh 844x390: thuyen ma hien', sB && near(sB.op, 1, 1e-6) && !sB.fin, JSON.stringify(sB));
  await ev(() => DRGhosts.reset());
  // FogGhost GMShipwreck: thuyen cach 60 m (> seen 30) nen vat chua "thay": khong mo dan
  for (const [w, h, file] of [[1280, 720, 'fogghost-1280x720.png'], [844, 390, 'fogghost-844x390.png']]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
    const gs = ghostPos('GMShipwreck');
    await ev(([gx, gz]) => {
      DRGhosts.reset(); DR.s.sanity = 0.5; DR_DEBUG.setTime(0.95); if (DR.s.lightsOn) DRBoat.setLights(false);
      const bx = gx + 60; DR_DEBUG.teleport(bx, gz, Math.atan2(-(gx - bx), 0)); DRBoat.stop(); DRGhosts.debug.activate('GMShipwreck');
    }, [gs[1], gs[2]]);
    await sleep(2800);
    const fs_ = await ev(() => DRGhosts.debug.statics().find(s => s.name === 'GMShipwreck'));
    await page.screenshot({ path: path.join(SHOTS, file) });
    check('anh ' + file + ': FogGhost GMShipwreck hien (op 1, chua mo dan)', fs_.active && fs_.phase === 'in' && near(fs_.op, 1, 1e-6) && !fs_.fading, JSON.stringify(fs_));
  }

  // ---------------------------------------------------------------- 6. tong ket
  const perf = await ev(() => DR_DEBUG.perf());
  console.log('    perf avgMs ' + perf.avgMs.toFixed(2) + ' cpu ' + perf.cpuMs.toFixed(2));
  check('khong loi trang / console / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log('\nU4 ghosts: ' + pass + ' dat, ' + fail + ' hong. Anh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
