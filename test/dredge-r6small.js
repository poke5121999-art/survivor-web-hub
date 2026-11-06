/*
 * DREDGE - kiem don vi R6 (mối nguy nhỏ): cua mimic (js/mimic.js), tượng điên (js/statues.js), 35 đá ma Gale Cliffs (js/ghostrocks.js),
 * vòi rồng tĩnh Waterspout_Static (js/waterspout.js); tools/mimic.py, tools/ghostrocks.py, tools/waterspout.py.
 * Chay: node test/dredge-r6small.js   (anh: %TEMP%/dredge-r6small hoac SHOTS=...; DR_URL=... de chay tren Pages)
 * So goc: WreckMonster.cs, WreckMonsterAnimationEvents.cs, wreckmonster_animator.controller + wreckmonster_{idle,attack,retreat}.anim, InsanityStatue.cs, InsanityStatueEyes.cs,
 * GhostRockManager.cs, WaterspoutWorldEvent.cs (STATIC), Game.unity (4 WreckMonster, 60 InsanityStatue, 144 GhostRock). WORLD-GAPS.md §6 dong R6.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r6small');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(c, name, detail) { if (c) pass++; else fail++; console.log((c ? '  OK   ' : '  FAIL ') + name + (!c && detail ? '  - ' + detail : '')); }
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
async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
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

(async () => {
  const srv = await serve();
  const base = process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  await page.goto(base + '/games/dredge/index.html?fresh=1', { timeout: 60000 });
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
  const ev = (fn, a) => page.evaluate(fn, a);
  await ev(() => { DR.setMode('sail'); DR_DEBUG.setTime(0.5); DR.s.sanity = 1; });
  await sleep(800);
  await page.waitForFunction(() => window.DRMimic && DRMimic.ready, null, { timeout: 30000 }).catch(() => {});
  const dmg = () => ev(() => DR.grid('INVENTORY').damage.length);
  const clearDmg = () => ev(() => { DR.grid('INVENTORY').damage.length = 0; DRBoat.refresh(); });
  const shots = async (name, setup) => {
    for (const [tag, w, h] of [['1280', 1280, 720], ['844', 844, 390]]) {
      await page.setViewportSize({ width: w, height: h });
      await setup();
      await ev(() => { document.querySelectorAll('[class*=banner],[id*=banner],.hud-toast,#dr-tut').forEach(e => e.remove()); });
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, name + '-' + tag + '.png') });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  };
  const place = (x, z, yaw) => ev(a => { DR_DEBUG.teleport(a[0], a[1], a[2]); const b = DR.s.boat; b.vx = b.vz = b.w = 0; }, [x, z, yaw]);

  // ================================================================== 1. cua mimic: du lieu goc
  console.log('Cua mimic (WreckMonster): du lieu');
  const M = await ev(() => { const d = DR_MIMIC; return { crabs: d.crabs.map(c => [c.name, c.variant, c.x, c.z, c.trigger, c.body]), claw: d.claw, ctrl: d.ctrl, clips: Object.fromEntries(Object.entries(d.clips).map(([k, c]) => [k, { len: c.len, ev: c.events.map(e => e.t + ':' + e.fn), claw: c.claw }])), audio: d.audio }; });
  const by = n => M.crabs.find(c => c[0] === n);
  ok(M.crabs.length === 4, '4 con (khong co ban Iceworld DLC1): ' + M.crabs.map(c => c[0]).join(', '));
  const P = (n, x, z) => { const c = by(n); return c && near(c[2], x, 0.01) && near(c[3], -z, 0.01); };   // Game.unity (x, z Unity); web z = -z
  ok(P('WreckMonster_PlaneVariant', -537.15, 158.82) && P('WreckMonster_ShipVariant', 547.23, -192.42) && P('WreckMonster_LoreRockVariant', -459.01, -634.4) && P('WreckMonster_Boat', -158.49, 539.88),
    'vi tri khop MONSTERS.md: (-537; 159) (547; -192) (-459; -634) (-159; 540)', JSON.stringify(M.crabs.map(c => [c[0], c[2], c[3]])));
  ok(M.crabs.every(c => c[4].r === 2 && near(c[4].c[2], -2.5, 1e-6) && c[4].c[0] === 0), 'trigger: SphereCollider r 2, tam (0, 0, 2,5) Unity cuc bo');
  ok(JSON.stringify(M.crabs.map(c => [c[1], c[5].r, c[5].h]).sort()) === JSON.stringify([['BoatCrab', 1.3, 6], ['LoreCrab1', 1.72, 4.91], ['PlaneCrab1', 1.3, 6], ['ShipCrab', 1.54, 5.17]].sort()),
    'Collider than (layer 7, khong trigger): capsule r/h theo tung bien the');
  ok(M.claw.l.r === 0.7 && M.claw.l.h === 2.8 && M.claw.r.r === 0.7 && M.claw.l.dir === 'x', 'moc vuot: capsule r 0,7 h 2,8 truc x');
  ok(near(M.clips.attack.len, 8.6333, 0.001) && near(M.clips.retreat.len, 4, 0.001) && M.clips.idle.len < 0.05, 'clip: attack 8,633 s, retreat 4 s, idle 0,033 s');
  ok(JSON.stringify(M.clips.attack.ev) === JSON.stringify(['0:PlaySFXEmerge', '2.4667:PlaySFXSlamAttack', '4:PlaySFXSwipeAttack', '5.5:PlaySFXSlamAttack', '8.6333:AnimationComplete']) &&
     JSON.stringify(M.clips.retreat.ev) === JSON.stringify(['0:PlaySFXRetreat', '4:AnimationComplete']), 'su kien hoat anh: Emerge 0, Slam 2,467 / 5,5, Swipe 4, AnimationComplete 8,633; Retreat 0 / 4');
  const cwEq = (a, b) => a.length === b.length && a.every((k, i) => near(k[0], b[i][0], 0.001) && k[1] === b[i][1]);
  ok(cwEq(M.clips.attack.claw.l, [[0, 0], [2.433, 1], [3.033, 0], [5.267, 1], [5.833, 0]]) && cwEq(M.clips.attack.claw.r, [[0, 0], [2.433, 1], [3.033, 0], [4, 1], [5.267, 0]]),
    'cua so bat moc vuot (m_Enabled): L 2,433-3,033 va 5,267-5,833; R 2,433-3,033 va 4-5,267', JSON.stringify(M.clips.attack.claw));
  ok(M.ctrl.idleToAttack === 0.1 && M.ctrl.attackToRetreatBanish === 0.25 && M.ctrl.exitTime === 1 && M.audio.min === 25 && M.audio.max === 100, 'Animator: Idle->Attack 0,1 s; Attack->Retreat (Banish) 0,25 s / ExitTime 1; tieng 25..100 m');

  // ================================================================== 2. cua mimic: hanh vi
  console.log('Cua mimic: hanh vi');
  ok(await ev(() => DRMimic.ready), 'DRMimic.ready (crabs.bin giai nen xong, 4 con dung)');
  const D0 = await ev(() => DRMimic.debug.crabs());
  ok(D0.length === 4 && D0.every(c => c.state === 'Idle' && !c.attacking && !c.banished), 'luc dau: ca 4 con o Idle, chua tan cong');
  // chon con "Boat" (BoatCrab): dat thuyen cach 9 m (ngoai trigger: tam trigger cach goc 2,5 m, r 2) va xem no van Idle
  const idx = D0.findIndex(c => c.name === 'WreckMonster_Boat');
  const T0 = await ev(i => DRMimic.debug.trig(i), idx);
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const away = { x: T0.x + 9, z: T0.z };
  await place(away.x, away.z, yawTo(away.x, away.z, T0.x, T0.z));
  await sleep(700);
  let s = await ev(i => DRMimic.debug.crabs()[i], idx);
  ok(s.state === 'Idle' && !s.inside && !s.attacking, 'thuyen ngoai trigger (9 m): van Idle', JSON.stringify(s));
  const before = await dmg();
  await place(T0.x, T0.z, yawTo(T0.x, T0.z, T0.x - 5, T0.z));           // vao tam trigger
  await sleep(450);
  s = await ev(i => DRMimic.debug.crabs()[i], idx);
  ok(s.inside && s.attacking && s.state === 'Attack' && s.t > 0.1, 'vao trigger -> OnTriggerEnter: SetTrigger Attack, Idle -> Attack', JSON.stringify(s));
  // trong luc Attack: cua so moc vuot dung theo clip (dat t truc tiep)
  const cl = {};
  for (const t of [1.0, 2.6, 3.5, 4.5, 5.5, 6.5]) { await ev(a => DRMimic.debug.setT(a[0], a[1]), [idx, t]); cl[t] = await ev(i => DRMimic.debug.claws()[i], idx); }
  ok(!cl[1].l && !cl[1].r && cl[2.6].l && cl[2.6].r && !cl[3.5].l && !cl[3.5].r && !cl[4.5].l && cl[4.5].r && cl[5.5].l && !cl[5.5].r && !cl[6.5].l && !cl[6.5].r,
    'moc vuot bat tat theo clip: t1,0 tat; 2,6 ca hai; 3,5 tat; 4,5 chi R; 5,5 chi L; 6,5 tat', JSON.stringify(cl));
  // dap trung thuyen: dat thuyen len tam moc vuot trai luc cua so mo -> +1 o hong (ProcessHit)
  await clearDmg(); await sleep(1700);
  let hit = { clawTouch: 0 };
  for (const [t, k] of [[2.8, 'l'], [2.9, 'l'], [2.8, 'r'], [3.0, 'l'], [2.7, 'r']]) {
    await ev(a => DRMimic.debug.setT(a[0], a[1]), [idx, t]);
    const cw = await ev(a => DRMimic.debug.clawWorld(a[0], a[1]), [idx, k]);
    await ev(a => { const b = DR.s.boat; DR_DEBUG.teleport(a.x, a.z, 0); b.vx = b.vz = b.w = 0; }, cw);
    await sleep(70);
    hit = await ev(i => DRMimic.debug.hurt()[i], idx);
    if (hit.clawTouch >= 1) break;
  }
  ok(hit.clawTouch >= 1 && (await dmg()) >= 1, 'thuyen vao moc vuot dang bat (cua so m_Enabled): cham moc vuot (' + hit.clawTouch + ' khung) + ProcessHit -> o hong (' + (await dmg()) + ')', JSON.stringify(hit));
  // Banish giua cu dap: Attack -> Retreat (hoa tron 0,25 s), khong con tan cong
  await ev(i => DRMimic.debug.setT(i, 1.0), idx);
  await place(T0.x + 14, T0.z, 0);
  await ev(() => DR.emit('banish', true));
  await sleep(150);
  s = await ev(i => DRMimic.debug.crabs()[i], idx);
  ok(s.banished && s.state === 'Retreat' && s.prev === 'Attack', 'Banish bat luc dang Attack: chuyen sang Retreat (hoa tron tu Attack)', JSON.stringify(s));
  await ev(i => { const I = DRMimic.debug; I.step(0.25, 24); }, idx);      // chay het Retreat (4 s) bang buoc gia lap
  s = await ev(i => DRMimic.debug.crabs()[i], idx);
  ok(s.state === 'Idle' && !s.attacking, 'Retreat chay het (4 s) roi ve Idle; isCurrentlyAttacking = false (AnimationComplete)', JSON.stringify(s));
  // trong luc Banish bat: vao lai trigger khong tan cong
  await place(T0.x + 9, T0.z, 0); await sleep(300);
  await place(T0.x, T0.z, 0); await sleep(500);
  s = await ev(i => DRMimic.debug.crabs()[i], idx);
  ok(s.inside && s.state === 'Idle' && !s.attacking, 'Banish dang bat: vao trigger khong tan cong (TryAttack bo qua)', JSON.stringify(s));
  // tat Banish: ra roi vao lai trigger -> tan cong lai
  await ev(() => DR.emit('banish', false));
  await place(T0.x + 9, T0.z, 0); await sleep(300);
  await place(T0.x, T0.z, 0); await sleep(450);
  s = await ev(i => DRMimic.debug.crabs()[i], idx);
  ok(!s.banished && s.state === 'Attack' && s.attacking, 'tat Banish, vao lai trigger: tan cong lai', JSON.stringify(s));
  // mai cua (Collider than): dat thuyen len than khi dang Idle -> day ra + o hong
  await ev(i => { DRMimic.debug.step(0.5, 40); }, idx);                    // xong dot tan cong cu (Attack 8,63 s + Retreat)
  await ev(() => { DR.emit('banish', true); }); await sleep(100); await ev(() => DRMimic.debug.step(0.5, 20)); await ev(() => DR.emit('banish', false));
  await clearDmg(); await sleep(1700);
  const body = await ev(i => { const I = DRMimic.debug.body(i); return { pts: I.length, cx: I.reduce((a, p) => a + p[0], 0) / I.length, cz: I.reduce((a, p) => a + p[1], 0) / I.length }; }, idx);
  await place(body.cx, body.cz, 0);
  await sleep(300);
  const hb = await ev(i => DRMimic.debug.hurt()[i], idx), pushed = await ev(a => Math.hypot(DR.s.boat.x - a.cx, DR.s.boat.z - a.cz), body);
  ok(hb.body >= 1 && (await dmg()) >= 1 && pushed > 0.3, 'dat thuyen len mai cua: va cham than (layer 7) -> +1 o hong, bi day ra (' + pushed.toFixed(2) + ' m)', JSON.stringify(hb));
  await ev(() => DR.emit('banish', false));

  // anh con cua dang dap: chon con ShipVariant (nuoc thoang), dung o cho nuoc sau nhat cach 10-22 m, nhin vao con cua
  const sIdx = D0.findIndex(c => c.name === 'WreckMonster_ShipVariant');
  const sSpot = await ev(i => {
    const T0 = DRMimic.debug.trig(i); let best = null;
    for (let rad = 10; rad <= 16; rad += 2) for (let k = 0; k < 24; k++) {
      const a = k / 24 * 6.2832, x = T0.x + Math.cos(a) * rad, z = T0.z + Math.sin(a) * rad, sd = DRWorld.sdf(x, z);
      if (!best || sd > best.sd) best = { x, z, sd, yaw: Math.atan2(-(T0.x - x), -(T0.z - z)) };
    }
    return best;
  }, sIdx);
  await ev(() => { DR.emit('banish', true); DRMimic.debug.step(0.5, 30); DR.emit('banish', false); });
  await shots('r6-mimic-idle', async () => {
    await ev(() => { DR_DEBUG.setTime(0.5); DR.s.sanity = 1; });
    await place(sSpot.x, sSpot.z, sSpot.yaw);
  });
  await shots('r6-mimic-attack', async () => {
    await ev(() => { DR_DEBUG.setTime(0.5); DR.s.sanity = 1; });
    await place(sSpot.x, sSpot.z, sSpot.yaw);
    await ev(i => { DRMimic.debug.trigger(i); }, sIdx);
    await sleep(200);
    await ev(i => DRMimic.debug.setT(i, 2.7), sIdx);
  });
  const sh = await ev(i => DRMimic.debug.crabs()[i], sIdx);
  ok(sh.state === 'Attack' && sh.attacking, 'anh r6-mimic-idle / r6-mimic-attack (-1280, -844): con ' + sh.name + ' o Idle roi Attack (t ' + sh.t + ')', JSON.stringify(sh));
  await ev(() => { DR.emit('banish', true); DRMimic.debug.step(0.5, 30); DR.emit('banish', false); });

  // ================================================================== 3. tuong dien
  console.log('Tuong dien (InsanityStatue)');
  const SD = await ev(() => ({ n: DR_STATUES.list.length, cfg: DR_STATUES.config, curves: DR_STATUES.curves, ev: [...new Set(DR_STATUES.list.map(s => s.eyes.length))], c1: DR_STATUES.list.filter(s => s.curve === 1).length,
    eyeMin: [...new Set(DR_STATUES.list.flatMap(s => s.eyes.map(e => e.min + '-' + e.max)))], morph: DR_STATUES.eyes.morph.length, verts: DR_STATUES.eyes.pos.length / 3 }));
  ok(SD.n === 60 && SD.cfg.maxDistance === 150 && SD.cfg.evaluationIntervalSec === 1, '60 InsanityStatue: maxDistance 150, evaluationIntervalSec 1');
  ok(JSON.stringify(SD.curves) === JSON.stringify([[[0, 0.5, 0, 0], [0.2, 0.5, 0, -0.625], [1, 0, -0.625, 0]], [[0, 0.6, 0, 0], [0.2, 0.6, 0, -0.75], [1, 0, -0.75, 0]]]) && SD.c1 === 50,
    'panicToDistanceThreshold: 10 tuong (0; 0,5) (0,2; 0,5) (1; 0), 50 tuong (0; 0,6) (0,2; 0,6) (1; 0)', JSON.stringify(SD.curves));
  ok(SD.eyeMin.join() === '2-5' && SD.morph === 2 && SD.verts === 69, 'InsanityStatueEyes: 2-5 s; mat EvilEye_Base 69 dinh, 2 blendshape (L, R)');
  const ST = await ev(() => { const f = DRStatues.debug.curve, c = DR_STATUES.curves[0]; return [f(c, 0), f(c, 0.2), f(c, 0.6), f(c, 1), f(c, 1.5), f(DR_STATUES.curves[1], 0.1)]; });
  ok(near(ST[0], 0.5, 1e-9) && near(ST[1], 0.5, 1e-9) && ST[3] === 0 && ST[4] === 0 && near(ST[5], 0.6, 1e-9) && ST[2] > 0.15 && ST[2] < 0.35, 'Hermite: 0,5 / 0,5 / ~0,26 (t = 0,6) / 0 / 0 (ngoai khoang giu nguyen) / 0,6', JSON.stringify(ST));
  // tim mot tuong co nuoc o 10-16 m truoc mat (huong Eyes.forward) de dung thuyen
  const spot = await ev(() => {
    const L = DR_STATUES.list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i].eyes[0];
      for (let d = 9; d <= 16; d += 1) {
        const x = e.p[0] + e.f[0] * d, z = -(e.p[2] + e.f[2] * d);
        if (DRWorld.sdf(x, z) >= 3) return { i, x, z, ex: e.p[0], ez: -e.p[2], d };
      }
    }
    return null;
  });
  ok(!!spot, 'co mot tuong voi diem nuoc truoc mat tuong', JSON.stringify(spot));
  const sp = spot || { i: 0, x: 0, z: 0, ex: 0, ez: 0 };
  await place(sp.x, sp.z, yawTo(sp.x, sp.z, sp.ex, sp.ez));
  await ev(() => { DR_DEBUG.setTime(0.9); });
  await sleep(500);
  await ev(() => { DR.s.sanity = 1; DRStatues.debug.evaluate(); });
  let act = await ev(() => DRStatues.debug.active());
  ok(act === 0, 'sanity 1,0: khong tuong nao mo mat (nguong toi da 0,6)', 'active ' + act);
  const th = await ev(i => DRStatues.debug.threshold(i), sp.i);
  await ev(() => { DR.s.sanity = 0.2; DRStatues.debug.evaluate(); });
  let L = await ev(() => DRStatues.debug.list());
  ok(L[sp.i].on && th >= 0.45, 'sanity 0,2, o ' + (sp.d) + ' m (nguong ' + th.toFixed(3) + '): tuong nay MO mat', JSON.stringify(L[sp.i]));
  const nearOn = (await ev(() => DRStatues.debug.nearest(60))).filter(n => n.d > 100).slice(0, 1)[0];
  const farOff = nearOn && !L[nearOn.i].on;
  const above = await ev(() => { const b = DR.s.boat; return DRStatues.debug.list().filter(s => s.on).every(s => { const d = Math.hypot(s.x - b.x, s.y, s.z - b.z); const t = DRStatues.debug.curve(DR_STATUES.curves[s.curve], Math.min(1, d / 150)); return 0.2 < t; }); });
  ok(above, 'moi tuong dang mo deu co sanity 0,2 < nguong(khoang cach); tuong > 100 m do (nguong thap) ' + (farOff ? 'tat' : 'khong xet'));
  await ev(() => { DR.s.sanity = 0.4; DRStatues.debug.evaluate(); });
  const th2 = await ev(i => DRStatues.debug.threshold(i), sp.i);
  L = await ev(() => DRStatues.debug.list());
  ok(L[sp.i].on === (0.4 < th2), 'sanity 0,4: mo mat khi 0,4 < nguong (' + th2.toFixed(3) + ')');
  await ev(() => { DR.s.sanity = 0.2; DRStatues.debug.evaluate(); });
  // mat quay theo thuyen (SignedAngle): truoc mat ~0 do, ben phai / trai ~ +-90 do
  const ang = await ev(a => {
    const out = {}, S = DR_STATUES.list[a.i], e = S.eyes[0];
    const put = (dx, dz) => { DR.s.boat.x = e.p[0] + dx; DR.s.boat.z = -(e.p[2] + dz); DRStatues.debug.evalEyes(a.i); const r = DRStatues.debug.eyes(a.i)[0]; return { wl: +r.wl.toFixed(1), wr: +r.wr.toFixed(1), angle: +r.angle.toFixed(1), inf: r.inf.map(v => +v.toFixed(3)) }; };
    const fx = e.f[0], fz = e.f[2];
    out.front = put(fx * 400, fz * 400);     // Unity: cung huong forward, xa de do chenh cao mat (~6 m) khong lam lech goc
    out.a = put(-fz * 20, fx * 20);          // vuong goc, ben nay
    out.b = put(fz * 20, -fx * 20);          // vuong goc, ben kia
    return out;
  }, sp);
  const sides = [ang.a, ang.b];
  ok(near(ang.front.wl, 0, 6) && near(ang.front.wr, 0, 6) && near(ang.front.angle, 0, 6), 'mat nhin thang vao thuyen (goc ' + ang.front.angle + '): ca hai blendshape ~0', JSON.stringify(ang.front));
  ok(sides.some(x => x.wr > 80 && x.wl === 0 && x.angle > 60) && sides.some(x => x.wl > 80 && x.wr === 0 && x.angle < -60), 'thuyen lech ~90 do: mot ben weight ~100 (R hoac L), ben kia 0; influence = weight / 100', JSON.stringify(ang));
  await place(sp.x, sp.z, yawTo(sp.x, sp.z, sp.ex, sp.ez));
  await ev(() => { DR.s.sanity = 0.2; DRStatues.debug.evaluate(); });
  await shots('r6-statue-eyes', async () => {
    await place(sp.x, sp.z, yawTo(sp.x, sp.z, sp.ex, sp.ez));
    await ev(a => { DR_DEBUG.setTime(0.9); DR.s.sanity = 0.2; DRStatues.debug.evaluate(); DRStatues.debug.evalEyes(a); }, sp.i);
  });
  const eo = await ev(() => DRStatues.debug.active());
  ok(eo >= 1, 'anh r6-statue-eyes-1280 / -844: ' + eo + ' tuong dang mo mat');

  // ================================================================== 4. da ma Gale Cliffs
  console.log('Da ma Gale Cliffs (35)');
  const G = await ev(() => { const D = DR_GHOSTROCKS; return { gale: D.rocks.filter(r => r.zone === 'GALE_CLIFFS').length, built: DRGhostRocks.debug.count(), builtGC: DRGhostRocks.debug.rocks().filter(r => r.d.zone === 'GALE_CLIFFS').length,
    meshes: D.meshNames.map((n, i) => [n, D.meshes[i] && D.meshes[i].pos.length / 3]), mat: D.materialGC && D.materialGC.name }; });
  ok(G.gale === 35 && G.builtGC === 35 && G.built === 144, '35 da Gale Cliffs duoc dung cung 109 da Marrows (tong ' + G.built + ')', JSON.stringify(G));
  ok(G.meshes.filter(m => /GaleCliffsRock/.test(m[0])).every(m => m[1] > 100) && G.mat === 'GaleCliffsGhostRocks_Mat', 'mesh GaleCliffsRock2/3/4_LOD0 + GaleCliffsGhostRocks_Mat co du lieu', JSON.stringify(G.meshes));
  const gspot = await ev(() => {
    const R = DRGhostRocks.debug.rocks().filter(r => r.d.zone === 'GALE_CLIFFS'), all = DRGhostRocks.debug.rocks().map(r => r.d.p);
    let best = null;
    for (const r of R) { const a = r.d.p; for (let k = 0; k < 24; k++) {
      const ang = k / 24 * 6.2832, x = a[0] + Math.cos(ang) * 14, z = a[2] + Math.sin(ang) * 14;
      if (DRWorld.sdf(x, z) < 6) continue;
      const ds = all.map(p => Math.hypot(p[0] - x, p[2] - z));
      if (Math.min(...ds) < 12) continue;
      const n = R.filter(q => Math.hypot(q.d.p[0] - x, q.d.p[2] - z) <= 25).length;
      if (!best || n > best.n) best = { x, z, n, face: Math.atan2(-(a[0] - x), -(a[2] - z)) };
    } }
    return best;
  });
  ok(!!gspot && gspot.n >= 1, 'co cho dung tren nuoc cach da Gale Cliffs 12-25 m', JSON.stringify(gspot));
  const g = gspot || { x: 0, z: 0, face: 0, n: 0 };
  const gplace = () => ev(s => { DR_DEBUG.teleport(s.x, s.z, s.face); const b = DR.s.boat; b.vx = b.vz = b.w = 0; DR.s.time = Math.floor(DR.s.time) + 0.9; }, g);
  await ev(() => { DR.s.sanity = 1; DR.emit('banish', false); DRGhostRocks.finish(); DRGhostRocks.debug.reroll(); });
  await gplace();
  const g2 = await ev(() => { DR.s.sanity = 1; DRGhostRocks.debug.sweep(200); return DRGhostRocks.debug.visible(); });
  ok(g2 === 0, 'sanity 1,0 dem: 0 da hien (nhu da Marrows)', 'visible ' + g2);
  await ev(() => { DRGhostRocks.finish(); DRGhostRocks.debug.clearPopped(); DRGhostRocks.debug.reroll(); });
  await gplace();
  const g3 = await ev(() => {
    const dbg = DRGhostRocks.debug;
    DR.s.sanity = 0.5; dbg.sweep(1); dbg.forceThreshold(0.75); dbg.sweep(200);
    const b = DR.s.boat, R = dbg.rocks(), d3 = r => Math.hypot(r.d.p[0] - b.x, r.d.p[1], r.d.p[2] - b.z);
    const gc = R.filter(r => r.d.zone === 'GALE_CLIFFS'), mid = gc.filter(r => d3(r) >= 10 && d3(r) <= 25);
    return { mid: mid.length, midShown: mid.filter(r => r.showing).length, nearShown: gc.filter(r => d3(r) < 10 && r.showing).length, farShown: gc.filter(r => d3(r) > 25 && r.showing).length,
      popped: dbg.popped().length ? Math.min(...dbg.popped()) : null, vis: dbg.visible() };
  });
  ok(g3.mid >= 1 && g3.midShown === g3.mid, 'nguong 0,75, sanity 0,5, dem: moi da GC cach 10-25 m deu hien (' + g3.midShown + '/' + g3.mid + ')', JSON.stringify(g3));
  ok(g3.nearShown === 0 && g3.farShown === 0 && g3.popped >= 10, 'khong da GC nao bat khi < 10 m, khong da nao > 25 m (nho nhat ' + g3.popped + ' m)', JSON.stringify(g3));
  await gplace();
  // dam mot da GC: +1 o hong, bi day ra (hinh bao loi tu mesh Gale Cliffs)
  await clearDmg(); await sleep(1700);
  const g4 = await page.evaluate(async () => {
    const dbg = DRGhostRocks.debug, R = dbg.rocks().filter(r => r.showing && r.d.zone === 'GALE_CLIFFS'), inv = () => DR.grid('INVENTORY').damage.length;
    const sl = ms => new Promise(r => setTimeout(r, ms));
    for (const r of R) {
      const b = DR.s.boat, before = inv();
      DR_DEBUG.teleport(r.d.p[0], r.d.p[2], 0); b.vx = b.vz = b.w = 0;
      await sl(120);
      if (inv() > before) { await sl(250); return { ok: true, name: r.d.n, before, after: inv(), moved: +Math.hypot(b.x - r.d.p[0], b.z - r.d.p[2]).toFixed(2) }; }
    }
    return { ok: false, n: R.length };
  });
  ok(g4.ok && g4.after - g4.before === 1 && g4.moved > 0.3, 'dam mot da GC (' + g4.name + '): +1 o hong, bi day ra ' + g4.moved + ' m', JSON.stringify(g4));
  async function gcSetup(on) {
    await ev(() => { DRGhostRocks.finish(); DRGhostRocks.debug.reroll(); });
    await gplace();
    await ev(on => { DR.s.sanity = on ? 0.5 : 1; DRGhostRocks.debug.sweep(1); if (on) DRGhostRocks.debug.forceThreshold(0.75); DRGhostRocks.debug.sweep(200); }, on);
    await sleep(1500);
    await ev(on => { DR.s.sanity = on ? 0.5 : 1; DR.s.time = Math.floor(DR.s.time) + 0.9; DRBoat.setLights(true); }, on);   // den thuyen bat: da hien trong chum sang
    await sleep(600);
    await ev(() => { document.querySelectorAll('[class*=banner],[id*=banner],.hud-toast,#dr-tut').forEach(e => e.remove()); });
  }
  async function diffPx(a, b, w, h) {
    return page.evaluate(async ([a, b, w, h]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
      const px = async src => { const i = await load(src), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
      const A = await px(a), B = await px(b); let n = 0;
      const x0 = Math.round(w * 0.05), x1 = Math.round(w * 0.95), y0 = Math.round(h * 0.2), y1 = Math.round(h * 0.68);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 12) n++; }
      return n;
    }, [a, b, w, h]);
  }
  for (const [tag, w, h] of [['1280', 1280, 720], ['844', 844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    await gcSetup(true);
    const vis = await ev(() => DRGhostRocks.debug.visibleDists());
    const bOn = await page.screenshot({ path: path.join(OUT, 'r6-gc-ghostrocks-' + tag + '.png') });
    await gcSetup(false);
    const bOff = await page.screenshot({ path: path.join(OUT, 'r6-gc-ghostrocks-' + tag + '-no-rocks.png') });
    const px = await diffPx(bOn.toString('base64'), bOff.toString('base64'), w, h);
    ok(vis.length >= 1 && px > (w > 1000 ? 600 : 200), 'anh r6-gc-ghostrocks-' + tag + ': ' + vis.length + ' da GC hien, khac anh khong da o ' + px + ' diem anh', JSON.stringify(vis));
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await ev(() => { DRGhostRocks.finish(); DRGhostRocks.debug.reroll(); DR.s.sanity = 1; });

  // ================================================================== 5. voi rong tinh (Gale Cliffs)
  console.log('Voi rong tinh Waterspout_Static');
  const W = await ev(() => ({ s: DR_WATERSPOUT.Waterspout_Static, ev: DR_WORLDEVENTS.Waterspout_Static }));
  ok(W.s.mode === 'STATIC' && W.s.maxSpeed === 0 && W.s.moveSpeedScalar === 0 && W.s.itemAddChance === 0.25 && W.s.itemPool.join() === 'blackmouth-salmon,oceanic-perch,black-sea-bass' && W.s.hitRadius === 0.5 && W.s.finishDelaySec === 2,
    'prefab tinh: STATIC, toc do 0, chance 0,25, pool Blackmouth Salmon / Oceanic Perch / Black Sea Bass, r 0,5, finishDelay 2', JSON.stringify(W.s));
  ok(W.ev.durationSec === 15 && JSON.stringify(W.ev.playerSpawnOffset) === '[0,0,30]' && W.ev.forbiddenZones.join() === 'THE_MARROWS,STELLAR_BASIN,TWISTED_STRAND,DEVILS_SPINE,OPEN_OCEAN', 'WorldEventData: song 15 s, sinh (0, 0, 30), chi Gale Cliffs (5 vung bi cam)');
  // dat thuyen o Gale Cliffs: tim cho nuoc di duoc ca (0,0,30) tren navmesh va zone GALE_CLIFFS
  const gcSea = await ev(() => {
    const ds = DR_GHOSTROCKS.rocks.filter(r => r.zone === 'GALE_CLIFFS');
    for (const r of ds) for (let a = 0; a < 6.28; a += 0.3) for (let rad = 40; rad <= 120; rad += 20) {
      const x = r.p[0] + Math.cos(a) * rad, z = r.p[2] + Math.sin(a) * rad;
      if (DRWorld.sdf(x, z) < 20) continue;
      for (let yaw = 0; yaw < 6.28; yaw += 0.5) {
        DR_DEBUG.teleport(x, z, yaw);
        const b = DR.s.boat, w = DREvents.offsetWorld(b, [0, 0, 30]);
        if (DRWorld.zoneAt(w[0], w[1]) === 'GALE_CLIFFS' && DRWorld.zoneAt(x, z) === 'GALE_CLIFFS' && DRNav.sample({ x: w[0], z: w[1] }, 5, 'generic') && DRNav.walkable(w[0], w[1], 'generic')) return { x, z, yaw };
      }
    }
    return null;
  });
  ok(!!gcSea, 'co cho nuoc o Gale Cliffs ma diem sinh (0, 0, 30) di duoc tren navmesh', JSON.stringify(gcSea));
  const hs = () => ev(a => { DR_DEBUG.teleport(a.x, a.z, a.yaw); const b = DR.s.boat; b.vx = b.vz = b.w = 0; }, gcSea || { x: 0, z: 0, yaw: 0 });
  const clearEv = async () => { await ev(() => { const c = DREvents.current; if (c && c.handle.dispose) c.handle.dispose(); }); await sleep(250); };
  await ev(() => { DR.s.sanity = 0.6; DR_DEBUG.setTime(0.5); DR.s.eventHistory = {}; });
  await clearEv(); await hs();
  const cand = await ev(() => { DR.s.eventHistory = {}; return DREvents.candidates(); });
  ok(cand.includes('Waterspout_Static') && !cand.includes('Waterspout') && !cand.includes('Waterspout_Corrupt'), 'o Gale Cliffs: ung vien co Waterspout_Static, khong co Waterspout / Corrupt (forbiddenZones)', JSON.stringify(cand));
  await ev(() => { DREvents.debug.force('Waterspout_Static'); });
  await sleep(500);
  const s0 = await ev(() => DRWaterspout.debug.state());
  ok(s0 && s0.name === 'Waterspout_Static' && s0.mode === 'STATIC' && s0.fx && s0.speed === 0, 'force Waterspout_Static: sinh, che do STATIC, hat song, toc do 0', JSON.stringify(s0));
  const lens = await ev(() => { const I = DREvents.current.handle.inst, b = DR.s.boat, f = DREvents.offsetWorld(b, [0, 0, 30]); return { dx: I.x - f[0], dz: I.z - f[1] }; });
  ok(Math.hypot(lens.dx, lens.dz) <= 5.5, 'sinh o (0, 0, 30) cuc bo (lech navmesh <= 5 m): ' + Math.hypot(lens.dx, lens.dz).toFixed(2) + ' m');
  await sleep(4000);
  const s1 = await ev(() => DRWaterspout.debug.state());
  ok(s1 && Math.hypot(s1.x - s0.x, s1.z - s0.z) < 1e-6 && s1.v === 0 && !s1.finishing, 'sau 4 s van dung yen (agent tat): khong di chuyen', JSON.stringify(s1));
  await ev(() => { DREvents.current.handle.inst.age = 14.9; });
  await sleep(500);
  const s2 = await ev(() => DRWaterspout.debug.state());
  ok(s2 && s2.finishing, 'qua 15 s: ngung (finishing)', JSON.stringify(s2));
  await sleep(2600);
  ok((await ev(() => DREvents.current)) === null, 'xong sau finishDelaySec 2 s: currentEvent = null');
  // cham: +1 o hong, Random < 0,25 nhan mot ca trong pool tinh
  for (const [r, want] of [[0.1, true], [0.9, false]]) {
    await clearEv(); await clearDmg(); await hs(); await sleep(1700);
    await ev(() => { DR.s.eventHistory = {}; DREvents.debug.force('Waterspout_Static'); });
    await sleep(400);
    const cnt = () => ev(() => DR.grid('INVENTORY').items.filter(i => /^(blackmouth-salmon|oceanic-perch|black-sea-bass)/.test(i.id)).length);
    const f0 = await cnt(), n0 = await dmg();
    await ev(rr => { window.__rnd0 = window.__rnd0 || Math.random; Math.random = () => rr; const I = DREvents.current.handle.inst, b = DR.s.boat; I.x = b.x; I.z = b.z; }, r);
    await sleep(500);
    await ev(() => { Math.random = window.__rnd0; });
    const f1 = await cnt(), n1 = await dmg(), st = await ev(() => DRWaterspout.debug.state());
    ok(n1 === n0 + 1, 'cham voi tinh (Random ' + r + '): +1 o hong (' + n0 + ' -> ' + n1 + ')');
    ok(want ? f1 === f0 + 1 : f1 === f0, 'Random ' + r + (want ? ' < 0,25: nhan mot ca (Blackmouth Salmon / Oceanic Perch / Black Sea Bass)' : ' >= 0,25: khong co vat') + ' (' + f0 + ' -> ' + f1 + ')');
    ok(st && st.finishing, 'trung mot lan roi voi tat');
  }
  await clearEv(); await hs();
  await shots('r6-waterspout-static', async () => {
    await clearEv(); await hs();
    await ev(() => { DR_DEBUG.setTime(0.5); DR.setMode('sail'); DR.s.eventHistory = {}; DREvents.debug.force('Waterspout_Static'); });
    await sleep(500);
    await ev(() => { const I = DREvents.current.handle.inst, b = DR.s.boat; I.x = b.x - Math.sin(b.yaw) * 24; I.z = b.z - Math.cos(b.yaw) * 24; I.dur = 999; });
    await sleep(1500);
  });
  ok(await ev(() => { const s = DRWaterspout.debug.state(); return !!(s && s.fx && !s.finishing); }), 'anh r6-waterspout-static-1280 / -844: voi tinh dang song truoc thuyen');
  await clearEv();

  const perf = await ev(() => DR_DEBUG.perf());
  console.log('  perf 1280x720: avgMs ' + perf.avgMs.toFixed(2) + ' cpuMs ' + perf.cpuMs.toFixed(2));
  ok(errors.length === 0, 'khong co loi console / trang / HTTP >= 400', [...new Set(errors)].slice(0, 4).join(' ; '));
  await browser.close(); srv.close();
  console.log('r6small: ' + pass + ' dat, ' + fail + ' hong  (anh: ' + OUT + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
