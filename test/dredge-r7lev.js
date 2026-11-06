/*
 * DREDGE - kiem don vi R7 cua WORLD-GAPS.md: Leviathan, ranh gioi the gioi, ca map trang lon (js/leviathan.js, js/greatwhite.js; data/leviathan.js, data/greatwhite.js
 * tu tools/leviathan.py, tools/greatwhite.py).
 * Chay: node test/dredge-r7lev.js   (anh: %TEMP%/dredge-r7lev hoac SHOTS=...; DR_URL de chay tren may chu khac)
 * So goc: BoundaryEnforcer (Game.unity: mainSoftBoundaryRadius 1800, mainHardBoundaryRadius 2000, checkIntervalSec 0,25, tam (127,9; -7,6)),
 * LeviathanAttackWorldEvent.prefab (spawn 5 s / hold 10 s / despawn 5 s, pathLength 200, giao diem forward 50, attackAfterDive 1, y -40 / -12 / -40),
 * Leviathan_Attack.anim (DisableMovement 1,5 s, DisableBoatModel 1,833 s, KillPlayer 3,333 s), LeviathanWorldEvent.cs:136-285, LeviathanAnimationEvents.cs,
 * GreatWhiteShark.prefab (waypoint 2, playerDistance 25, despawnDistance 1, downY -12, idle 5, pursue 7, maxSeek 20, rotation 0,5), GreatWhiteWorldEvent.cs,
 * Data/WorldEvent/GreatWhite.asset (forbiddenZones 95 = moi vung tru OPEN_OCEAN).
 * Hang R7 cua WORLD-GAPS.md §6: vuot ban kinh 2000 -> LeviathanAttack -> chet tru khi Hien than; Ca map trang khong sinh ngoai OPEN_OCEAN.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r7lev');
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
  await page.evaluate(() => {
    window.__ev = { death: [], fin: [], ev: [] };
    DR.on('death', e => __ev.death.push(e));
    DR.on('worldEventFinished', n => __ev.fin.push(n));
    DR.on('worldEvent', n => __ev.ev.push(n));
    for (const e of document.querySelectorAll('#dr-tut, .dr-banner, #dr-banner')) e.style.visibility = 'hidden';
  });
  return { page, errors };
}

const GW = page => page.evaluate(() => DRGreatWhite.debug.state());
// dat thuyen tai (x, z) huong yaw
const put = (page, x, z, yaw) => page.evaluate(([x, z, yaw]) => { DR_DEBUG.teleport(x, z, yaw); }, [x, z, yaw]);
const clear = page => page.evaluate(() => {
  if (DREvents.current) { const h = DREvents.current.handle; if (h.dispose) h.dispose(); else h.requestFinish(); }
  DRLeviathan.debug.freeze(false); DRGreatWhite.debug.freeze(false);
  DRBoat.blocked = false; DRBoat.root.visible = true;
  for (const k in __ev) __ev[k].length = 0;
});
// diem tren vong tron quanh tam ranh gioi
const ringPoint = (c, r, a) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];

async function run(browser, base, W, H) {
  const { page, errors } = await boot(browser, base, W, H);
  const tag = W + 'x' + H;
  const shot = n => page.screenshot({ path: path.join(SHOTS, tag + '-' + n + '.png') });
  const lib = await page.evaluate(() => ({ lv: !!window.DRLeviathan, gw: !!window.DRGreatWhite }));
  check('module nap duoc (' + tag + ')', lib.lv && lib.gw);
  const D = await page.evaluate(() => ({ L: DR_LEVIATHAN, G: DR_GREATWHITE, EV: DR_WORLDEVENTS }));
  const B = D.L.boundary, P = D.L.params;
  // ---- 0. du lieu sinh ra
  check('data: BoundaryEnforcer mem 1800 / cung 2000 / kiem 0,25 s / su kien LeviathanAttack', B.soft === 1800 && B.hard === 2000 && B.checkIntervalSec === 0.25 && B.event === 'LeviathanAttack', JSON.stringify(B));
  check('data: tam ranh gioi (127,9; 7,6 theo toa do three.js cua markers.json)', near(B.center[0], 127.9, 0.01) && near(Math.abs(B.center[1]), 7.6, 0.01), B.center.join(','));
  check('data: prefab spawn 5 / hold 10 / despawn 5 s, duong 200 m, giao diem forward 50, turnSpeed 5, maxVolume 1', P.spawnDuration === 5 && P.holdDuration === 10 && P.despawnDuration === 5 && P.pathLength === 200 &&
    P.intersectionPointOffsetZ === 50 && P.turnSpeed === 5 && P.maxVolume === 1);
  const cy = D.L.curves;
  check('data: y -40 -> -12 (spawn), -12 (hold), -12 -> -40 (despawn)', cy.spawnYPosCurve[0][1] === -40 && cy.spawnYPosCurve[1][1] === -12 && cy.holdYPosCurve[0][1] === -12 && cy.despawnYPosCurve[1][1] === -40);
  const evs = D.L.clips.attack.events.map(e => e.fn + '@' + e.t.toFixed(3)).join(' ');
  check('data: Leviathan_Attack 6,333 s, su kien DisableMovement 1,5 / DisableBoatModel 1,833 / KillPlayer 3,333', near(D.L.clips.attack.len, 6.333, 0.001) && evs === 'DisableMovement@1.500 DisableBoatModel@1.833 KillPlayer@3.333', evs);
  check('data: WE_Leviathan: Idle -> Attack khi trigger "attack", 0 s, khong exit time', D.L.controller.cond === 'attack' && D.L.controller.dur === 0 && D.L.controller.hasExit === false);
  const EA = D.EV.LeviathanAttack, EL = D.EV.Leviathan, EG = D.EV.GreatWhite;
  check('data: LeviathanAttack minDepth 0,35, cam PALE_REACH, kiem vung an toan, khong PASSIVE; Leviathan trong so 1000', EA.minDepth === 0.35 && EA.forbiddenZones.join() === 'PALE_REACH' && EA.doSafeZoneHitCheck && !EA.allowInPassiveMode &&
    EL.weight === 1000 && EL.minWorldPhase === 2);
  check('data: GreatWhite cam moi vung tru OPEN_OCEAN', ['THE_MARROWS', 'GALE_CLIFFS', 'STELLAR_BASIN', 'TWISTED_STRAND', 'DEVILS_SPINE', 'PALE_REACH'].every(z => EG.forbiddenZones.includes(z)) && EG.forbiddenZones.length === 6, EG.forbiddenZones.join());
  const GP = D.G.params;
  check('data: Great White waypoint 2 / player 25 / despawn 1 / downY -12 / idle 5 / pursue 7 / seek 20 s / quay 0,5; agent gia toc 8, 120 do/s', GP.waypointDistanceThreshold === 2 && GP.playerDistanceThreshold === 25 && GP.despawnDistanceThreshold === 1 &&
    GP.downY === -12 && GP.idleSpeed === 5 && GP.pursueSpeed === 7 && GP.maxSeekTimeSec === 20 && GP.rotationSpeed === 0.5 && GP.accel === 8 && GP.angular === 120);

  // ---- 1. ranh gioi: canh bao mem, Leviathan cung
  await clear(page);
  const c = B.center, yaw0 = 0.4;
  const pSoft = ringPoint(c, 1900, 1.0), pHard = ringPoint(c, 2100, 1.0), pIn = ringPoint(c, 1700, 1.0);
  await page.evaluate(p => { window.__P = p; }, pHard);
  await put(page, pIn[0], pIn[1], yaw0); await sleep(700);
  let w = await page.evaluate(() => ({ vis: DRLeviathan.debug.warningVisible(), b: DRLeviathan.debug.boundary(), ev: DREvents.current && DREvents.current.name }));
  check('1700 m (< mem 1800): khong canh bao, khong su kien', !w.vis && !w.ev && near(w.b.dist, 1700, 2), JSON.stringify(w.b));
  await put(page, pSoft[0], pSoft[1], yaw0); await sleep(900);
  w = await page.evaluate(() => ({ vis: DRLeviathan.debug.warningVisible(), txt: document.getElementById('dr-oob') && document.getElementById('dr-oob').textContent, b: DRLeviathan.debug.boundary(), ev: DREvents.current && DREvents.current.name }));
  check('1900 m (> mem 1800, < cung 2000): hien OutOfBoundsWarning, KHONG co Leviathan', w.vis && !w.ev && !w.b.spawned, JSON.stringify(w.b) + ' ' + JSON.stringify(w.txt));
  await sleep(300); await shot('boundary-warning');
  await put(page, pHard[0], pHard[1], yaw0); await sleep(1200);
  w = await page.evaluate(() => ({ ev: DREvents.current && DREvents.current.name, st: DRLeviathan.debug.state(), b: DRLeviathan.debug.boundary() }));
  check('2100 m (> cung 2000): DoEvent(LeviathanAttack) trong <= 1 s, da sinh = true', w.ev === 'LeviathanAttack' && w.st && /SPAWNING|HOLDING/.test(w.st.state) && w.b.spawned, JSON.stringify(w.st) + ' dist ' + w.b.dist.toFixed(1));
  await page.evaluate(() => DRLeviathan.debug.freeze(true));
  check('chua chet o giai doan lan', (await page.evaluate(() => __ev.death.length)) === 0 && (await page.evaluate(() => DR.mode)) === 'sail');
  // hoan tat su kien tay roi o lai ngoai: khong sinh lai (hasSpawned) cho den khi vao lai trong 1800
  await page.evaluate(() => { DREvents.current.handle.requestFinish(); });
  await sleep(800);
  w = await page.evaluate(() => ({ ev: DREvents.current && DREvents.current.name, b: DRLeviathan.debug.boundary(), n: __ev.ev.filter(x => x === 'LeviathanAttack').length }));
  check('o lai ngoai 2000 sau khi su kien ket thuc: KHONG sinh lai (BoundaryEnforcer.hasSpawnedLeviathan)', !w.ev && w.b.spawned && w.n === 1, JSON.stringify(w));
  await put(page, pIn[0], pIn[1], yaw0); await sleep(700);
  w = await page.evaluate(() => ({ b: DRLeviathan.debug.boundary(), vis: DRLeviathan.debug.warningVisible() }));
  check('vao lai < 1800: hasSpawned = false, het canh bao', !w.b.spawned && !w.vis, JSON.stringify(w.b));
  await put(page, pHard[0], pHard[1], yaw0); await sleep(1200);
  w = await page.evaluate(() => ({ ev: DREvents.current && DREvents.current.name, n: __ev.ev.filter(x => x === 'LeviathanAttack').length }));
  check('ra lai > 2000: sinh Leviathan lan hai', w.ev === 'LeviathanAttack' && w.n === 2, JSON.stringify(w));

  let s;
  // ---- 3. Hien than thoat (OnTeleportBegin -> bo qua ca ba su kien hoat anh; OnTeleportComplete -> ket thuc)

  await page.evaluate(() => { DR.s.sanity = 1; DR_DEBUG.unlockSpells(); DR_DEBUG.teleport(__P[0], __P[1], 0.0); DREvents.debug.force('LeviathanAttack'); DRLeviathan.debug.freeze(true); DRAbilities.select('manifest'); });
  await sleep(300);
  await page.evaluate(() => { DRLeviathan.debug.simulate(10.0); });
  await page.mouse.move(W / 2, H / 2);
  await page.mouse.down({ button: 'right' }); await sleep(1500);
  const m1 = await page.evaluate(() => ({ busy: DRSpells.busy, away: DRLeviathan.debug.state() && DRLeviathan.debug.state().away }));
  await page.mouse.up({ button: 'right' }); await sleep(200);
  check('Hien than dang chay: leviathan nhan OnTeleportBegin -> hasPlayerTeleportedAway', m1.busy && m1.away === true, JSON.stringify(m1));
  await sleep(2600);
  const m2 = await page.evaluate(() => ({ busy: DRSpells.busy, ev: DREvents.current && DREvents.current.name, fin: __ev.fin.slice(), d: __ev.death.length, info: DR_DEBUG.info() }));
  check('Hien than xong (OnTeleportComplete): su kien ket thuc, khong chet, thuyen ve (80,-100)', !m2.busy && !m2.ev && m2.fin.includes('LeviathanAttack') && m2.d === 0 && near(m2.info.x, 80, 1) && near(m2.info.z, -100, 1), JSON.stringify([m2.ev, m2.fin, m2.d, m2.info.x, m2.info.z]));
  // da tele nhung leviathan van chay het chu trinh: gia lap OnTeleportBegin roi chay qua KillPlayer
  await clear(page);

  s = await page.evaluate(() => {
    DR_DEBUG.teleport(__P[0], __P[1], 0.0); DREvents.debug.force('LeviathanAttack'); DRLeviathan.debug.freeze(true);
    DR.emit('manifestBegin', { x: 0, z: 0 });
    DRLeviathan.debug.simulate(24.0);
    return { st: DRLeviathan.debug.state(), d: __ev.death.length, mode: DR.mode, blocked: DRBoat.blocked, vis: DRBoat.root.visible };
  });
  check('da Hien than: den attack 3,7 s van khong chet, khong khoa, thuyen hien (ca 3 su kien bi bo qua)', s.st && s.st.state === 'ATTACKING' && s.st.attackT > 3.5 && s.d === 0 && s.mode === 'sail' && !s.blocked && s.vis, JSON.stringify([s.st && s.st.attackT, s.d, s.mode, s.blocked, s.vis]));
  await page.evaluate(() => { __ev.fin.length = 0; DR.emit('manifestEnd', {}); });
  await sleep(150);
  // (thuyen van o ngoai 2000 m nen BoundaryEnforcer sinh Leviathan moi ngay sau do: dung ghi nhan worldEventFinished)
  check('manifestEnd -> RequestEventFinish (worldEventFinished LeviathanAttack)', (await page.evaluate(() => __ev.fin.includes('LeviathanAttack'))));
  await clear(page);

  // ---- 4. khong tan cong khi thuyen o vung an toan / Leviathan thuong khong tan cong / vung nong huy

  s = await page.evaluate(() => {
    const old = DRSafeZones.hit;
    DR_DEBUG.teleport(__P[0], __P[1], 0.0); DREvents.debug.force('LeviathanAttack'); DRLeviathan.debug.freeze(true);
    DRSafeZones.hit = () => true;
    DRLeviathan.debug.simulate(20.5);
    const r = { st: DRLeviathan.debug.state(), d: __ev.death.length, fin: __ev.fin.slice() };
    DRSafeZones.hit = old;
    return r;
  });
  check('thuyen trong vung an toan cuoi lan lan: KHONG tan cong, su kien ket thuc (khong con the, khong chet)', !s.st && s.d === 0, JSON.stringify(s));
  await clear(page);

  s = await page.evaluate(() => {
    DR_DEBUG.teleport(__P[0], __P[1], 0.0); DREvents.debug.force('Leviathan'); DRLeviathan.debug.freeze(true);
    DRLeviathan.debug.simulate(20.5);
    return { st: DRLeviathan.debug.state(), d: __ev.death.length };
  });
  check('Leviathan thuong (attackAfterDive = 0): lan xong khong tan cong, ket thuc, khong chet', !s.st && s.d === 0, JSON.stringify(s));
  await clear(page);
  await put(page, 80, -100, 0.0); await sleep(400);
  s = await page.evaluate(() => { DREvents.debug.force('LeviathanAttack'); return { st: DRLeviathan.debug.state(), ev: DREvents.current && DREvents.current.name, depth: DRWorld.depth01(DR.s.boat.x, DR.s.boat.z) }; });
  check('vung nuoc nong gan Blackstone: khong du sau -> su kien huy (OnEventSpawnAborted)', !s.st && !s.ev, JSON.stringify(s));
  await clear(page);

  // ---- 5. Ca map trang lon: chi OPEN_OCEAN
  const gz = await page.evaluate(([cx, cz]) => {
    DR.s.worldPhase = 3; DR.s.sanity = 0.5; DR_DEBUG.setTime(0.5);
    const b = DR.s.boat, keep = [b.x, b.z, b.yaw];
    const res = { zones: {}, okOutsideBy: {}, okOutside: 0, okOpen: 0, onlyZone: {}, tested: 0 };
    for (let x = -1500; x <= 1500; x += 40) for (let z = -1500; z <= 1500; z += 40) {
      if (DR_DEBUG.sdf(x, z) < 30 || Math.hypot(x - cx, z - cz) > 1700) continue;   // trong ranh gioi mem (ngoai do BoundaryEnforcer sinh Leviathan)
      b.x = x; b.z = z; b.yaw = 0; DR.s.eventHistory = {};
      const off = DREvents.offsetWorld(b, [25, 0, 100]), zone = DRWorld.zoneAt(off[0], off[1]);
      const r = DREvents.debug.test('GreatWhite');
      res.tested++;
      if (r.ok) { if (zone === 'OPEN_OCEAN') res.okOpen++; else { res.okOutsideBy[zone] = (res.okOutsideBy[zone] || 0) + 1; if (zone !== 'IRON_RIG') res.okOutside++; } }
      if (zone !== 'OPEN_OCEAN') { res.zones[zone] = (res.zones[zone] || 0) + 1; if (r.fails.length && r.fails.every(f => f === 'zone')) res.onlyZone[zone] = (res.onlyZone[zone] || 0) + 1; }
      if (zone === 'OPEN_OCEAN' && r.ok && !res.firstOpen) res.firstOpen = [x, z];
    }
    b.x = keep[0]; b.z = keep[1]; b.yaw = keep[2];
    return res;
  }, B.center);
  check('GreatWhite: khong diem nao trong 6 vung cam duoc phep sinh (' + gz.tested + ' diem; IRON_RIG la vung de xuat cua web, khong co trong ZoneEnum goc: ' + JSON.stringify(gz.okOutsideBy) + ')', gz.okOutside === 0 && Object.keys(gz.zones).length >= 3, JSON.stringify(gz));
  check('GreatWhite: o vung cam chi vi pham "zone" (du dieu kien khac): ' + JSON.stringify(gz.onlyZone), Object.keys(gz.onlyZone).length >= 2 && gz.okOpen > 0, 'okOpen=' + gz.okOpen);
  const open = gz.firstOpen;
  await clear(page);
  await put(page, open[0], open[1], 0.0); await sleep(400);
  const gw0 = await page.evaluate(() => { DR.s.worldPhase = 3; DR.s.sanity = 0.5; DR_DEBUG.setTime(0.5); DR.s.eventHistory = {}; const b = DR.s.boat;
    DREvents.debug.force('GreatWhite'); DRGreatWhite.debug.freeze(true); return { b: [b.x, b.z, b.yaw], st: DRGreatWhite.debug.state() }; });
  const gb = gw0.b, gfw = [-Math.sin(gb[2]), -Math.cos(gb[2])], grt = [Math.cos(gb[2]), -Math.sin(gb[2])];
  const wp0 = [gb[0] + 25 * grt[0] + 100 * gfw[0], gb[1] + 25 * grt[1] + 100 * gfw[1]], wp1 = [gb[0] - 25 * grt[0] + 100 * gfw[0], gb[1] - 25 * grt[1] + 100 * gfw[1]];
  check('GreatWhite Activate: 2 diem duong (25,100) va (-25,100) so voi thuyen, SWIMMING, mo hinh o y = -12', gw0.st && gw0.st.state === 'SWIMMING' && gw0.st.path.length === 2 &&
    near(gw0.st.path[0].x, wp0[0], 0.01) && near(gw0.st.path[1].z, wp1[1], 0.01) && near(gw0.st.modelY, -12, 0.01), JSON.stringify(gw0.st));
  let g = await page.evaluate(() => { DRGreatWhite.debug.simulate(1.0, 0.05); return DRGreatWhite.debug.state(); });
  check('1 s: mo hinh troi len theo OutSine (y giua -12 va 0), toc do <= idle 5 (gia toc 8)', g.modelY > -12 && g.modelY < 0 && g.speed <= 5 + 1e-6 && g.speed > 3, JSON.stringify([g.modelY, g.speed]));
  g = await page.evaluate(() => { DRGreatWhite.debug.simulate(1.2, 0.05); return DRGreatWhite.debug.state(); });
  check('2,2 s: mo hinh y = 0', near(g.modelY, 0, 0.01), 'y=' + g.modelY);
  // anh: ca map trang boi gan mat nuoc, cach thuyen ~28 m (ngoai ban kinh lan 25 m)
  await page.evaluate(() => { const b = DR.s.boat; DRGreatWhite.debug.place({ x: b.x + 12, z: b.z - 25 }); DRGreatWhite.debug.simulate(0.2, 0.05); });
  await sleep(300); await shot('greatwhite-cruise');
  for (let i = 0; i < 200; i++) { g = await page.evaluate(() => { DRGreatWhite.debug.simulate(0.5, 0.05); return DRGreatWhite.debug.state(); }); if (!g || g.state === 'SEEKING') break; }
  check('di het 2 diem roi chuyen SEEKING, toc do tac nhan 7', g && g.state === 'SEEKING' && g.pathIndex === 2 && g.agentSpeed === 7, JSON.stringify(g && [g.state, g.pathIndex, g.agentSpeed]));
  // dat ca xa nguoi choi (khong bi bat): truy duoi 20 s => ForceDespawn
  g = await page.evaluate(() => { DRGreatWhite.debug.place({ x: DR.s.boat.x + 400, z: DR.s.boat.z }); DRGreatWhite.debug.simulate(0.5, 0.05); return DRGreatWhite.debug.state(); });
  const left = 20 - g.seekT;
  g = await page.evaluate(l => { DRGreatWhite.debug.simulate(l - 0.5, 0.05); return DRGreatWhite.debug.state(); }, left);
  check('truy duoi < 20 s: van SEEKING', g && g.state === 'SEEKING' && g.seekT < 20, JSON.stringify(g && [g.state, g.seekT]));
  g = await page.evaluate(() => { DRGreatWhite.debug.simulate(1.0, 0.05); return DRGreatWhite.debug.state(); });
  check('qua 20 s: ForceDespawn (DESPAWNING, mo hinh chim)', g && g.state === 'DESPAWNING', JSON.stringify(g && [g.state, g.seekT, g.modelY]));
  g = await page.evaluate(() => { DRGreatWhite.debug.simulate(3.2, 0.05); return DRGreatWhite.debug.state(); });
  await sleep(300);
  check('3 s sau: ket thuc', !g && !(await page.evaluate(() => DREvents.current)));
  // lai gan nguoi choi: chim theo duong cong, huy < 1 m, khong sat thuong
  await clear(page);
  await put(page, open[0], open[1], 0.0); await sleep(300);
  await page.evaluate(() => { DR.s.eventHistory = {}; DR.s.worldPhase = 3; DR.s.sanity = 0.5; DREvents.debug.force('GreatWhite'); DRGreatWhite.debug.freeze(true); for (let i = 0; i < 400 && DRGreatWhite.debug.state() && DRGreatWhite.debug.state().state !== 'SEEKING'; i++) DRGreatWhite.debug.simulate(0.5, 0.05); });
  await page.evaluate(() => { const b = DR.s.boat; DRGreatWhite.debug.place({ x: b.x + 20, z: b.z }); });
  const dmg0 = await page.evaluate(() => DR.grid('INVENTORY').damage.length);
  g = await page.evaluate(() => { DRGreatWhite.debug.simulate(0.1, 0.05); return DRGreatWhite.debug.state(); });
  check('cach 20 m (< 25): mo hinh dang chim xuong (y < 0), am luong giam', g && g.modelY < 0 && g.modelY > -12 && g.vol < 1, JSON.stringify(g && [g.dist, g.modelY, g.vol]));
  await page.evaluate(() => { const b = DR.s.boat; DRGreatWhite.debug.place({ x: b.x + 9, z: b.z - 4 }); DRGreatWhite.debug.simulate(0.1, 0.05); });
  check('cach ~10 m: mo hinh da lan sau hon (y am hon luc 20 m)', (await GW(page)).modelY < -0.45);
  await page.evaluate(() => { const b = DR.s.boat; DRGreatWhite.debug.place({ x: b.x + 4, z: b.z }); });
  g = await page.evaluate(() => { DRGreatWhite.debug.simulate(1.5, 0.05); return DRGreatWhite.debug.state(); });
  check('toi sat (< 1 m): su kien ket thuc, thuyen khong bi hu', !g && (await page.evaluate(() => DR.grid('INVENTORY').damage.length)) === dmg0);
  await clear(page);
  // ---- 2. hoat dong cua Leviathan (khoa vong thuc, mo phong cung buoc 0,02 s)
  await clear(page);
  await sleep(100);
  const b0 = await page.evaluate(() => { const b = DR.s.boat; DR_DEBUG.teleport(__P[0], __P[1], 0.0); DREvents.debug.force('LeviathanAttack'); DRLeviathan.debug.freeze(true); return { x: b.x, z: b.z, yaw: b.yaw, st: DRLeviathan.debug.state() }; });
  check('Activate: sinh tai thuyen + forward 50 + right 100, y = -40, dang SPAWNING, toc do 10 m/s', b0.st && b0.st.state === 'SPAWNING' && near(b0.st.moveSpeed, 10, 1e-9) && near(b0.st.y, -40, 0.01) &&
    near(Math.hypot(b0.st.x - b0.x, b0.st.z - b0.z), Math.hypot(50, 100), 0.5), JSON.stringify(b0.st));
  const fw = [-Math.sin(b0.yaw), -Math.cos(b0.yaw)], rt = [Math.cos(b0.yaw), -Math.sin(b0.yaw)];
  const inter = [b0.x + fw[0] * 50, b0.z + fw[1] * 50];
  check('huong di = -right (tu phai sang trai thuyen), vuong goc voi mui', near(b0.st.dir[0], -rt[0], 0.02) && near(b0.st.dir[1], -rt[1], 0.02), JSON.stringify(b0.st.dir));
  s = await page.evaluate(() => { DRLeviathan.debug.simulate(2.5); return DRLeviathan.debug.state(); });
  check('2,5 s: y giua -40 va -12 (duong cong Hermite), van SPAWNING', s.state === 'SPAWNING' && s.y > -40 && s.y < -12, 'y=' + s.y.toFixed(2));
  s = await page.evaluate(() => { DRLeviathan.debug.simulate(2.6); return DRLeviathan.debug.state(); });
  check('5,1 s: HOLDING, y = -12', s.state === 'HOLDING' && near(s.y, -12, 0.01), JSON.stringify([s.state, s.y]));
  s = await page.evaluate(() => { DRLeviathan.debug.simulate(4.9); return DRLeviathan.debug.state(); });
  check('10 s: ngang giao diem (cach <= 1 m), y -12', near(Math.hypot(s.x - inter[0], s.z - inter[1]), 0, 1.0) && near(s.y, -12, 0.01), 'cach ' + Math.hypot(s.x - inter[0], s.z - inter[1]).toFixed(2));
  await sleep(300); await shot('leviathan-hold');
  s = await page.evaluate(() => { DRLeviathan.debug.simulate(5.1); return DRLeviathan.debug.state(); });
  check('15,1 s: DESPAWNING', s.state === 'DESPAWNING', JSON.stringify([s.state, s.y, s.clock]));
  s = await page.evaluate(() => { DRLeviathan.debug.simulate(4.8); return DRLeviathan.debug.state(); });
  check('19,9 s: con DESPAWNING, y gan -40', s.state === 'DESPAWNING' && s.y < -30, 'y=' + s.y.toFixed(1));
  s = await page.evaluate(() => { DRLeviathan.debug.simulate(0.4); return DRLeviathan.debug.state(); });
  check('20,3 s: ATTACKING (thuyen o vung sau, khong an toan): dinh vao thuyen', s.state === 'ATTACKING' && s.dist < 1, JSON.stringify([s.state, s.dist]));
  // chay toi dung thoi diem attackT cua clip Leviathan_Attack
  const toAttack = t => page.evaluate(t => { const st = DRLeviathan.debug.state(); DRLeviathan.debug.simulate(t - st.attackT); return { st: DRLeviathan.debug.state(), blocked: DRBoat.blocked, vis: DRBoat.root.visible, d: __ev.death.length, mode: DR.mode }; }, t);
  s = await toAttack(1.4);
  check('attack 1,4 s (< 1,5): thuyen con lai duoc va hien', !s.blocked && s.vis && near(s.st.attackT, 1.4, 0.03), JSON.stringify([s.st.attackT, s.blocked, s.vis]));
  await sleep(200); await shot('leviathan-attack-rising');
  s = await toAttack(1.6);
  check('attack 1,6 s: DisableMovement (khoa lai), thuyen con hien', s.blocked && s.vis, JSON.stringify([s.st.attackT, s.blocked, s.vis]));
  s = await toAttack(1.9);
  check('attack 1,9 s: DisableBoatModel (an than thuyen)', s.blocked && !s.vis, JSON.stringify([s.st.attackT, s.blocked, s.vis]));
  await sleep(200); await shot('leviathan-attack-jaws');
  s = await toAttack(3.2);
  check('attack 3,2 s (< 3,333): chua chet', s.d === 0 && s.mode === 'sail', JSON.stringify([s.st.attackT, s.d, s.mode]));
  s = await toAttack(3.4);
  check('attack 3,4 s: KillPlayer -> su kien death, man hinh thua (over)', s.d === 1 && s.mode === 'over', JSON.stringify([s.st && s.st.attackT, s.d, s.mode]));
  await sleep(300);
  await clear(page);   // dispose: tra khoa lai / hien thuyen
  await sleep(200);
  const rs = await page.evaluate(() => ({ blocked: DRBoat.blocked, vis: DRBoat.root.visible, ev: DREvents.current && DREvents.current.name }));
  check('dispose su kien: tra khoa lai va hien thuyen', !rs.blocked && rs.vis && !rs.ev, JSON.stringify(rs));
  await page.evaluate(() => DR.setMode('sail')); await sleep(300);

  check('khong loi trang / console / HTTP (' + tag + ')', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  try { await run(browser, base, 1280, 720); await run(browser, base, 844, 390); } finally { await browser.close(); srv.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed  (anh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
