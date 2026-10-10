/*
 * DREDGE - kiem don vi R3 (Mind Sucker + bay coi cua Phi cong, relic4): js/mindsucker.js, tools/mindsucker.py, data/mindsucker.js.
 * Chay: node test/dredge-r3mind.js   (anh: %TEMP%/dredge-r3mind hoac SHOTS=...; DR_URL=... de chay tren Pages)
 * So goc: TSMonster.cs (:176-275), TwistedStrandMonsterManager.cs (:50-66), MortarQuestStepAnimatorTriggerable.cs, TwistedStrandTrapAnimationEvents.cs,
 * Game.unity (TSMonster: peek 1,5 / detect 1 / search 7 / loss 3 / v 0,25 / w 0,1 / stopping 8 / speed 3,5; InsanityEffector SanityModifier -10, capsule r 3,5 h 20;
 * 14 hop kich hoat, 20 diem xuat hien; Trap1-3), TwistedStrandTrapActivate.anim (20,567 s: MortarFire 17, OnAnimationComplete 20,567),
 * Yarn Trap_Load / Trap_InspectCorpse / Soldier_DeliverTrophy3 (ShowQuestGrid SoldierRelic = Relic4Pickup -> relic4). WORLD-GAPS.md §6 dong R3.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r3mind');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else fail++; console.log((c ? '  OK   ' : '  FAIL ') + name); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const ev = (page, fn, a) => page.evaluate(fn, a);

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
async function pump(page, stop, limit) {            // di hoi thoai bang Space toi khi stop() dung
  for (let i = 0; i < (limit || 40); i++) {
    if (await ev(page, stop)) return true;
    const st = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (st && st.kind === 'options') { await sleep(600); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(400);
  }
  return ev(page, stop);
}
// Phi cong nhan xac (Soldier_DeliverTrophyRoot, chay khong giao dien thoai nhu test/dredge-w5quest.js); bam "Cat vao khoang" o moi luoi nhan do
async function deliver(page, OUTDIR) {
  let saw = false;
  await ev(page, () => { window.__ended = false; DRYarn.run('Soldier_DeliverTrophyRoot', { line: (l, next) => setTimeout(next, 30), options: (o, ch) => ch(0), end() { window.__ended = true; } }); });
  for (let k = 0; k < 8; k++) {
    await page.waitForFunction(() => !!document.querySelector('.sg-panel button[data-act="take"]') || window.__ended, null, { timeout: 10000 }).catch(() => {});
    if (await ev(page, () => window.__ended)) break;
    await sleep(500);
    const items = await ev(page, () => [...document.querySelectorAll('.sg-panel .sg-item span')].map(e => e.textContent));
    if (items.some(t => /Necklace/i.test(t))) { saw = true; await page.screenshot({ path: path.join(OUTDIR, 'r3-relic4-grid-1280.png') }); }
    await page.click('.sg-panel button[data-act="take"]').catch(() => {});
    await sleep(400);
  }
  await page.waitForFunction(() => window.__ended, null, { timeout: 10000 }).catch(() => {});
  return saw;
}
const ms = page => ev(page, () => DRMindSucker.debug.state());

(async () => {
  const srv = await serve();
  const base = process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  await page.goto(base + '/games/dredge/index.html?fresh=1', { timeout: 60000 });
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
  await ev(page, () => { DR.setMode('sail'); DR_DEBUG.setTime(0.5); DR.s.sanity = 1; });
  await sleep(800);

  // ------------------------------------------------------------------ 1. du lieu goc
  console.log('Du lieu (Game.unity)');
  const D = await ev(page, () => { const d = DR_MINDSUCKER; return { boxes: d.manager.boxes.length, spawns: d.manager.spawns.length, cfg: d.monster.cfg, ag: d.monster.agent,
    eff: d.monster.effector, san: d.monster.sanity, eye: d.monster.eye, traps: d.traps.map(t => [t.id, t.step, t.completeStep, t.x, t.z]), len: d.trapMain.len,
    ev: d.trapMain.events.map(e => e.t + ':' + e.fn), clips: Object.keys(d.clips).length, relic: DR_QUESTS.QuestGridConfig.SoldierRelic }; });
  ok(D.boxes === 14 && D.spawns === 20, '14 TSMonsterTriggerBox, 20 diem xuat hien (' + D.boxes + ', ' + D.spawns + ')');
  const c = D.cfg;
  ok(c.peekTimeUntilEmergeSec === 1.5 && c.detectTimeUntilDrainSec === 1 && c.searchTimeUntilGiveUpSec === 7 && c.lossTimeUntilLoseDetectionSec === 3 &&
     c.velocityMagnitudeThreshold === 0.25 && c.angularVelocityMagnitudeThreshold === 0.1 && c.minTimeSpentDraining === 5 && c.spawnDistanceThreshold === 100,
     'TSMonster: peek 1,5 detect 1 search 7 loss 3 v 0,25 w 0,1 minDrain 5 spawnDist 100');
  ok(D.ag.speed === 3.5 && D.ag.stoppingDistance === 8 && D.eye.viewRadius === 20 && D.eye.viewAngle === 360, 'NavMeshAgent 3,5 m/s dung 8 m; Eye r 20, 360 do');
  ok(D.san.fullValueDay === -10 && D.san.fullValueNight === -10 && D.san.fullValueRadius === 20 && D.san.ignoreTimescale && D.eff.radius === 3.5 && D.eff.height === 20 && D.eff.dir === 'z',
     'InsanityEffector: SanityModifier -10 (r 20), ignoreTimescale, capsule r 3,5 h 20 truc z');
  ok(JSON.stringify(D.traps.map(t => t.slice(0, 3))) === JSON.stringify([[1, 'SoldierSubMonster1_Trap', 'SoldierSubMonster1_Wait'], [2, 'SoldierSubMonster2_Trap', 'SoldierSubMonster2_Wait'],
     [3, 'SoldierSubMonster3_Trap', 'SoldierSubMonster3_Wait']]) && near(D.traps[0][3], -367.84, 0.01) && near(D.traps[0][4], -463.21, 0.01), 'Trap1-3: buoc kich hoat / hoan tat, Trap1 o (-367,84, -463,21)');
  ok(near(D.len, 20.5667, 0.001) && D.ev.includes('17:MortarFire') && D.ev.includes('20.5667:OnAnimationComplete') && D.ev.includes('13:StartTrap'), 'TwistedStrandTrapActivate 20,567 s: StartTrap 13, MortarFire 17, OnAnimationComplete 20,567');
  ok(D.relic && D.relic.gridConfiguration === 'Relic4Pickup' && D.relic.presetGrid.spatialItems[0].id === 'relic4', 'nguon relic4: luoi SoldierRelic (Relic4Pickup, dat san relic4)');

  // ------------------------------------------------------------------ 2. vao hop kich hoat bang ban phim -> quai xuat hien
  console.log('Quai lang thang');
  const BX = await ev(page, () => DR_MINDSUCKER.manager.boxes.find(b => b.name === 'EntryS-1'));
  await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z, 0), [BX.x, BX.z + 6]);
  await sleep(700);
  ok(!(await ev(page, () => DRMindSucker.active)), 'ngoai hop: chua co quai');
  await ev(page, () => { window.__tl = []; const f = () => { const s = DRMindSucker.debug.state(); window.__tl.push([performance.now(), s && s.state, s && s.anim]); requestAnimationFrame(f); }; f(); });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => DRMindSucker.active, null, { timeout: 6000 }).catch(() => {});
  await page.keyboard.up('KeyW');
  let s = await ms(page);
  const cand = await ev(page, b => b.spawns.map(i => DR_MINDSUCKER.manager.spawns[i]), BX);
  ok(!!s && s.box === 'EntryS-1' && cand.some(p => near(p.x, s.x, 0.01) && near(p.z, s.z, 0.01)), 'W qua hop EntryS-1 -> quai o mot spawnPointCandidate (' + (s && [s.x, s.z]) + ')');
  ok(s && s.state === 'SPAWNING' && s.anim === 'TSM_SpawnRW', 'trang thai SPAWNING, clip TSM_SpawnRW');
  // dua thuyen toi cach quai ~11 m (diem nuoc), dung yen
  await ev(page, () => { const m = DRMindSucker.debug.state(); let p = null; for (let a = 0; a < 6.3 && !p; a += 0.3) { const q = { x: m.x + Math.sin(a) * 11, z: m.z + Math.cos(a) * 11 }; if (DRNav.walkable(q.x, q.z)) p = q; }
    DR_DEBUG.teleport(p.x, p.z, Math.atan2(-(m.x - p.x), -(m.z - p.z))); });
  await page.waitForFunction(() => { const s = DRMindSucker.debug.state(); return s && s.state === 'SEARCHING'; }, null, { timeout: 15000 }).catch(() => {});
  const tl = await ev(page, () => { const t = window.__tl, a = t.find(x => x[1] === 'SPAWNING'), b = t.find(x => x[1] === 'SEARCHING'); return a && b ? (b[0] - a[0]) / 1000 : -1; });
  ok(near(tl, 8.67, 0.7), 'Spawn 3,33 + peek 1,5 (doi het vong SpawnIdle, exitTime 1) + SpawnIdletoSearch 2,67 = SEARCHING sau ~8,67 s (' + tl.toFixed(2) + ' s)');
  // dung yen 4 s: khong phat hien, khong hut
  const s0 = await ev(page, () => DR.s.sanity);
  await sleep(4000);
  s = await ms(page);
  const s1 = await ev(page, () => DR.s.sanity);
  ok(s && s.state === 'SEARCHING' && s.tracked && s.detect === 0 && !s.eff, 'thuyen dung yen trong tam mat 20 m: van SEARCHING, detect 0 (' + JSON.stringify(s && { st: s.state, tr: s.tracked, d: s.detect }) + ')');
  ok(Math.abs(s1 - s0) < 1e-6, 'dung yen: sanity khong doi (' + s0.toFixed(4) + ' -> ' + s1.toFixed(4) + ')');
  ok(s && near(s.expire, 7 - 4, 0.6), 'han tim giam theo thoi gian: ~3 s con lai (' + (s && s.expire.toFixed(2)) + ')');
  await page.screenshot({ path: path.join(OUT, 'r3-searching-1280.png') });
  // di chuyen -> DRAINING
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => { const s = DRMindSucker.debug.state(); return s && s.state === 'DRAINING'; }, null, { timeout: 4000 }).catch(() => {});
  await page.keyboard.up('KeyA');
  s = await ms(page);
  ok(s && s.state === 'DRAINING', 'xoay thuyen (A) -> sau 1 s phat hien -> DRAINING (' + (s && s.state) + ')');
  await page.waitForFunction(() => { const s = DRMindSucker.debug.state(); return s && s.eff && DRMindSucker.debug.stats().rate < 0; }, null, { timeout: 12000 }).catch(() => {});
  const r0 = await ev(page, () => ({ s: DR.s.sanity, t: performance.now(), st: DRMindSucker.debug.stats(), m: DRMindSucker.debug.state() }));
  await sleep(2000);
  const r1 = await ev(page, () => ({ s: DR.s.sanity, t: performance.now(), st: DRMindSucker.debug.stats(), m: DRMindSucker.debug.state() }));
  const rate = (r1.s - r0.s) / ((r1.t - r0.t) / 1000);
  ok(r0.m && r0.m.anim === 'TSM_DrainIdleRW' && r0.m.eff, 'DrainIdle: InsanityEffector bat');
  ok(near(r0.st.rate, -0.15, 0.002), 'toc do hut = -10 x 0,015 = -0,15/s (' + r0.st.rate + ')');
  ok(rate < -0.12 && rate > -0.2, 'sanity giam that ~ -0,15/s khi thuyen dung trong vung hut (' + rate.toFixed(3) + '/s)');
  await ev(page, () => { const m = DRMindSucker.debug.state(), b = DR.s.boat, dx = b.x - m.x, dz = b.z - m.z, L = Math.hypot(dx, dz) || 1;   // camera sau thuyen nhin ve quai
    DR_DEBUG.teleport(m.x + dx / L * 12, m.z + dz / L * 12, Math.atan2(dx, dz)); });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'r3-drain-1280.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'r3-drain-844.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  // Banish -> Despawn (Banish 1,33 s, tat sau 2,5 s)
  await ev(page, () => { DR.s.sanity = 1; DR.emit('banish', true); });
  s = await ms(page);
  ok(s && s.state === 'DESPAWNING' && s.anim === 'TSM_BanishRW', 'Xua duoi bat -> DESPAWNING, clip TSM_BanishRW');
  await sleep(2900);
  ok(!(await ev(page, () => DRMindSucker.active)), 'sau 2,5 s quai tat (OnDespawnComplete)');
  // trong luc Banish: vao hop khong sinh
  await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z, 0), [BX.x, BX.z + 6]); await sleep(500);
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  ok(!(await ev(page, () => DRMindSucker.active)), 'Xua duoi dang bat: qua hop khong sinh quai');
  await ev(page, () => DR.emit('banish', false));
  // bay cua vung da moi (trap-1-state != 0): khong sinh
  await ev(page, () => { DR.s.vars['trap-1-state'] = 1; });
  await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z, 0), [BX.x, BX.z + 6]); await sleep(500);
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  ok(!(await ev(page, () => DRMindSucker.active)), 'GetActiveTrapState(1) != 0: hop vung 1 khong sinh quai');
  await ev(page, () => { DR.s.vars['trap-1-state'] = 0; DRMindSucker.debug.despawn(); });

  // ------------------------------------------------------------------ 3. bay: moi -> coi -> xac -> Phi cong -> relic4
  console.log('Bay coi + chuoi Phi cong');
  await ev(page, () => {
    for (const q of ['Quest_Soldier', 'Quest_SoldierSubMonster1', 'Quest_SoldierSubMonster2', 'Quest_SoldierSubMonster3']) DRQuests.start(q, true);
    DRYarn.markVisited('Soldier_Step2Bait');
    // khoang khoi dau nho: bo do linh tinh (khong phai trang bi) de du cho 3 xac + relic4
    const inv = DR.grid('INVENTORY');
    for (const it of inv.items.slice()) { const d = DR_ITEMS[it.id]; if (d && d.type !== 'EQUIPMENT' && !/^(rod|engine|light|net|pot)/.test(d.subtype || '')) DRGrid.remove(inv, it); }
    for (const b of ['quest-bait-1', 'quest-bait-2', 'quest-bait-3']) DR_DEBUG.give(b);
    DR.s.sanity = 1;
  });
  let sawRelic = false;
  const TR = await ev(page, () => DR_POI.points.filter(p => /^TS_Trap/.test(p.id)).map(p => ({ id: p.id, x: p.x, z: p.z })));
  ok(TR.length === 3, 'diem POI TS_Trap1-3 co san (W3)');
  for (const n of [1, 2, 3]) {
    const P = TR[n - 1];
    await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z + 3, 0), [P.x, P.z]);
    await page.waitForFunction(id => DRPoi._debug().near === id, P.id, { timeout: 5000 }).catch(() => {});
    await sleep(900);
    if (n === 1) await page.screenshot({ path: path.join(OUT, 'r3-trap-idle-1280.png') });
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
    await pump(page, () => !DRDialogue.isOpen(), 30);
    const st = await ev(page, nn => ({ v: DR.s.vars['trap-' + nn + '-state'], dep: DR.s.vars['bait-' + nn + '-deployed'], step: DRQuests.isStepCompleted('SoldierSubMonster' + nn + '_Trap'),
      bait: DR.grid('INVENTORY').items.filter(i => i.id === 'quest-bait-' + nn).length, tr: DRMindSucker.debug.trap(nn) }), n);
    ok(st.v === 1 && st.dep === true && st.step && st.bait === 0 && st.tr.seq >= 0, 'Trap' + n + ': F -> "Load the trap" -> trang thai 1, moi da dat, buoc _Trap xong, chuoi coi bat dau (' + JSON.stringify({ v: st.v, s: st.tr.seq }) + ')');
    if (n === 1) {
      await page.waitForFunction(() => DRMindSucker.debug.trap(1).anim === 'TSM_BaitEatStart' || DRMindSucker.debug.trap(1).anim === 'TSM_BaitEatIdle', null, { timeout: 14000 }).catch(() => {});
      const a = await ev(page, () => DRMindSucker.debug.trap(1));
      ok(a.monster && near(a.seq, 10.2, 0.8), 'Mind Sucker trong bay an moi o giay 10 (' + a.seq.toFixed(2) + ' s, ' + a.anim + ')');
      await page.waitForFunction(() => DRMindSucker.debug.trap(1).anim === 'TSM_TrapActivate', null, { timeout: 6000 }).catch(() => {});
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, 'r3-trap-sprung-1280.png') });
      await page.waitForFunction(() => DRMindSucker.debug.trap(1).seq < 0, null, { timeout: 9000 }).catch(() => {});
      const b = await ev(page, () => ({ t: DRMindSucker.debug.trap(1), w: DRQuests.isStepCompleted('SoldierSubMonster1_Wait') }));
      ok(b.t.state === 2 && b.t.destroyed && !b.t.active && b.w, 'sau 20,567 s: coi trung, bay vo, trang thai 2, buoc SoldierSubMonster1_Wait xong');
      await page.setViewportSize({ width: 844, height: 390 }); await sleep(700);
      await page.screenshot({ path: path.join(OUT, 'r3-trap-destroyed-844.png') });
      await page.setViewportSize({ width: 1280, height: 720 }); await sleep(400);
    } else {
      await ev(page, nn => DRMindSucker.debug.setT(nn, 20.5), n);   // tua toi cuoi clip (van chay su kien that)
      await page.waitForFunction(nn => DRMindSucker.debug.trap(nn).seq < 0, n, { timeout: 3000 }).catch(() => {});
      ok(await ev(page, nn => DRMindSucker.debug.trap(nn).state === 2 && DRQuests.isStepCompleted('SoldierSubMonster' + nn + '_Wait'), n), 'Trap' + n + ': tua toi OnAnimationComplete -> trang thai 2');
    }
    // F lan nua -> Trap_InspectCorpse -> luoi SoldierInspectTrap{n} (CREATE, nhan do: bang rut gon cua js/dialogue.js) -> "Cat vao khoang"
    for (let k = 0; k < 3 && !(await ev(page, () => DRDialogue.isOpen())); k++) {
      await page.waitForFunction(id => DRPoi._debug().near === id, P.id, { timeout: 5000 }).catch(() => {});
      await sleep(700);
      await page.keyboard.press('KeyF');
      await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
    }
    const gridOpen = await pump(page, () => !!document.querySelector('.sg-panel button[data-act="take"]'), 30);
    if (n === 1) await page.screenshot({ path: path.join(OUT, 'r3-corpse-grid-1280.png') });
    if (gridOpen) await page.click('.sg-panel button[data-act="take"]');
    await pump(page, () => !DRDialogue.isOpen() && !DRCargo.isOpen(), 20);
    if (process.env.DBG) console.log('   inv', JSON.stringify(await ev(page, () => ({ items: DR.grid('INVENTORY').items.map(i => i.id), cargo: DRCargo.isOpen() }))));
    const cs = await ev(page, nn => ({ v: DR.s.vars['trap-' + nn + '-state'], n: DR.grid('INVENTORY').items.filter(i => i.id === 'quest-corpse').length,
      mk: (DR.s.mapMarkers || []).some(m => (m.id || m) === 'trap-' + nn) }), n);
    ok(gridOpen && cs.v === 3 && cs.n === 1 && !cs.mk, 'Trap' + n + ': F -> xac Mind Sucker -> Chunk of Flesh vao khoang, trang thai 3, bo dau trap-' + n + ' (' + JSON.stringify(cs) + ')');
    if (await deliver(page, OUT)) sawRelic = true;   // giao ngay: khoang thuyen moi chi chua 2 xac
    ok(await ev(page, nn => DRQuests.isStepCompleted('SoldierSubMonster' + nn + '_Retrieve') && DR.grid('INVENTORY').items.every(i => i.id !== 'quest-corpse'), n), 'Phi cong nhan xac thu ' + n + ' (SoldierSubMonster' + n + '_Retrieve xong)');
  }
  ok(sawRelic, 'Soldier_DeliverTrophy3 mo luoi SoldierRelic co Shimmering Necklace (relic4)');
  const fin = await ev(page, () => ({ relic: DR.grid('INVENTORY').items.some(i => i.id === 'relic4'), corpse: DR.grid('INVENTORY').items.filter(i => i.id === 'quest-corpse').length,
    elim: DRQuests.isStepCompleted('Soldier_Eliminate'), r: [1, 2, 3].map(n => DRQuests.isStepCompleted('SoldierSubMonster' + n + '_Retrieve')), v3: DRYarn.visited('Soldier_DeliverTrophy3') }));
  ok(fin.v3 && fin.corpse === 0 && fin.r.every(Boolean), 'Soldier_DeliverTrophy1-3: nhan ca 3 xac, buoc _Retrieve 1-3 xong (' + JSON.stringify(fin) + ')');
  ok(fin.elim && fin.relic, 'Soldier_Eliminate xong, relic4 trong khoang -> dem duoc cho Collector (Collector_Relic4Deliver)');
  // Start(): trang thai 1 khi nap -> hoan tat ngay, bay vo
  await ev(page, () => { DR.s.vars['trap-2-state'] = 1; const s = DR.s; DR.s = JSON.parse(JSON.stringify(s)); });
  await sleep(500);
  const re = await ev(page, () => ({ st: DR.s.vars['trap-2-state'], t: DRMindSucker.debug.trap(2) }));
  ok(re.st === 2 && re.t.destroyed, 'nap ban luu voi trap-2-state 1 -> OnAnimationComplete ngay, trang thai 2, bay vo (' + JSON.stringify(re.st) + ')');

  ok(errors.length === 0, 'khong co pageerror / console error / HTTP >= 400' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log('\n' + pass + ' pass, ' + fail + ' fail  (anh: ' + OUT + ')');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
