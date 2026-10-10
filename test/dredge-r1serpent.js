/*
 * DREDGE - kiem don vi R1 cua WORLD-GAPS.md: ran Gale Cliffs (js/serpent.js, data/serpent.js tu tools/serpent.py).
 * Chay: node test/dredge-r1serpent.js   (anh: %TEMP%/dredge-r1serpent hoac SHOTS=...; DR_URL de chay tren may chu khac)
 * So goc: MonoBehaviour/GaleCliffsMonster.asset (patrolSpeed 0,7, huntSpeed 0,8, fleeSpeed 0,8, playerLostThreshold 3), GaleCliffMonster.prefab
 * (attackDistanceThreshold 6, VariablePlayerDamager damagePoints 2 / extraDamageInNightmareMode 1 / requireOneHealthToKill 0, boatSpeedMin 20 / Max 40,
 * moveSpeedScalar 0,15, attackMaxBoatSpeed 100, attackMovementSpeedMultiplier 100, maxChaseTimeSec 30, FieldOfView Near 15 m 360 / Middle 15 m 180 / Far 50 m 60,
 * NavMeshAgent acceleration 8 / angularSpeed 150, TransformFollower speed 2), Game.unity GaleCliffsMonsterManager (11 trigger hop 15 x 5 x 2, 11 lo, 25 FallingRocks,
 * minTimeBetweenRockFallsSec 3, tuyen A..J), GCMonster.cs:213-224 (Banish) / 316-378 (tan cong), GCMonsterManager.cs:25-69.
 * Hang R1 cua WORLD-GAPS.md §6: thuyen trong hanh lang GC duoi 40 kn -> ran tan cong, +2 o hong; Banish -> ran rut lui (GCMonster.cs:220).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r1serpent');
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
  await page.evaluate(() => {
    window.__ev = { spawned: [], hunt: [], attack: [], hits: [], banished: [], despawn: [], gone: [], rock: [], warn: [], hole: [] };
    DR.on('serpentSpawned', e => __ev.spawned.push(e));
    DR.on('serpentHunt', e => __ev.hunt.push(e));
    DR.on('serpentAttack', e => __ev.attack.push(e));
    DR.on('monsterHit', e => __ev.hits.push(e));
    DR.on('threatBanished', e => __ev.banished.push(e));
    DR.on('serpentDespawn', e => __ev.despawn.push(e));
    DR.on('serpentGone', e => __ev.gone.push(e));
    DR.on('serpentRockfall', e => __ev.rock.push(Object.assign({ t: performance.now() }, e)));
    DR.on('serpentRockWarning', e => __ev.warn.push(Object.assign({ t: performance.now() }, e)));
    DR.on('serpentHole', e => __ev.hole.push(Object.assign({ t: performance.now() }, e)));
  });
  return { page, errors };
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

const list = page => page.evaluate(() => DRSerpent.debug.list());
const mgr = page => page.evaluate(() => DRSerpent.debug.manager());
const damage = page => page.evaluate(() => DR.grid('INVENTORY').damage.length);

// dung ran o diem pi cua tuyen `route`, dang huong toi diem pi+1; thuyen cach d m (tia nhin thong, tren NavMesh, nuoc >= 3 m), mui huong ve ran
const stage = (page, route, pi, d) => page.evaluate(([route, pi, d]) => {
  DRSerpent.debug.clear();
  const M = DR_SERPENT.manager, ri = M.routes.findIndex(r => r.name === route), r = M.routes[ri];
  DRSerpent.debug.force(ri, 0);
  DRSerpent.debug.place(0, r.pts[pi][0], r.pts[pi][1], Math.min(pi + 1, r.pts.length - 1));
  const S = r.pts[pi], nx = r.pts[Math.min(pi + 1, r.pts.length - 1)], want = Math.atan2(nx[1] - S[1], nx[0] - S[0]);
  const cand = [];
  for (let a = 0; a < 6.283; a += 0.15) {
    const q = [S[0] + Math.cos(a) * d, S[1] + Math.sin(a) * d];
    if (DRWorld.sdf(q[0], q[1]) > 3 && DRSerpent.debug.walkable(q[0], q[1]) && DRSerpent.debug.los(S[0], S[1], q[0], q[1]))
      cand.push([Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want))), q]);
  }
  if (!cand.length) return null;
  cand.sort((x, y) => x[0] - y[0]);
  const q = cand[0][1], fx = S[0] - q[0], fz = S[1] - q[1];
  DR_DEBUG.teleport(q[0], q[1], Math.atan2(-fx, -fz));
  return { s: S, q };
}, [route, pi, d]);
// thu lan luot cac khoang cach cho toi khi tim duoc cho dat thuyen (hanh lang cong, tia nhin thong)
const stageFar = async (page, route, pi, ds) => { for (const d of ds) { const r = await stage(page, route, pi, d); if (r) return Object.assign(r, { d }); } return null; };
const clearAll = page => page.evaluate(() => {
  DRSerpent.debug.clear(); DRSerpent.debug.blind = false; DR.grid('INVENTORY').damage.length = 0;
  for (const k in __ev) __ev[k].length = 0;
});
const hideHud = page => page.evaluate(() => { for (const e of document.querySelectorAll('#dr-tut, .dr-banner, #dr-banner')) e.style.visibility = 'hidden'; });

async function run(browser, base) {
  const W = 1280, H = 720;
  const { page, errors } = await boot(browser, base, W, H);
  const shot = n => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + n + '.png') });
  await hideHud(page);

  // ---- 0. du lieu sinh ra
  const D = await page.evaluate(() => ({ ok: !!window.DRSerpent, d: DR_SERPENT.data, m: DR_SERPENT.monster, dm: DR_SERPENT.damager, mg: DR_SERPENT.manager, ag: DR_SERPENT.agent,
    eyes: DR_SERPENT.eyes.map(e => [e.name, e.viewRadius, e.viewAngle]), fol: DR_SERPENT.followers.map(f => [f.speed, f.dist]), tm: DR_SERPENT.follow, pf: DR_SERPENT.pathFollow,
    clips: Object.fromEntries(Object.values(DR_SERPENT.clips).map(c => [c.name, c.len])), nodes: DR_SERPENT.nodes.length, mod: DRBoat.stats.moveMod }));
  check('R1 data: GaleCliffsMonster.asset worldPhaseMin 1 / patrol 0,7 / hunt 0,8 / flee 0,8 / playerLostThreshold 3', D.ok && D.d.worldPhaseMin === 1 && D.d.patrolSpeed === 0.7 && D.d.huntSpeed === 0.8 &&
    D.d.fleeSpeed === 0.8 && D.d.playerLostThreshold === 3, JSON.stringify(D.d));
  check('R1 data: tan cong < 6 m, 2 o (+1 NIGHTMARE), mot lan, khong requireOneHealthToKill', D.m.attackDistanceThreshold === 6 && D.dm.damagePoints === 2 && D.dm.extraDamageInNightmareMode === 1 &&
    D.dm.oneHitOnly === 1 && D.dm.requireOneHealthToKill === 0);
  check('R1 data: toc do 0,15 * clamp(.., 20, 40), cap 100 x100, theo duoi toi da 30 s, arriveThreshold 2, depth 0,03', D.m.moveSpeedScalar === 0.15 && D.m.boatSpeedMin === 20 && D.m.boatSpeedMax === 40 &&
    D.m.attackMaxBoatSpeed === 100 && D.m.attackMovementSpeedMultiplier === 100 && D.m.maxChaseTimeSec === 30 && D.m.arriveThreshold === 2 && D.m.attackDepthThreshold === 0.03);
  check('R1 data: 3 mat (Far 50 m 60, Middle 15 m 180, Near 15 m 360)', JSON.stringify(D.eyes) === JSON.stringify([['FarEye', 50, 60], ['MiddleEye', 15, 180], ['NearEye', 15, 360]]), JSON.stringify(D.eyes));
  check('R1 data: NavMeshAgent acceleration 8 / angularSpeed 150, TargetFollow overshoot 4 / lam moi 0,25 / chan 1', D.ag.acceleration === 8 && D.ag.angularSpeed === 150 && D.tm.overshootDistance === 4 &&
    D.tm.timeBetweenPathRefreshesSec === 0.25 && D.tm.pathLockThreshold === 1 && D.pf.waypointDistanceThreshold === 2);
  check('R1 data: manager 10 tuyen A..J, 11 tuyen thoat, 11 trigger hop 15 x 2, 11 lo, 25 FallingRocks, cach 3 s', D.mg.routes.map(r => r.name).join('') === 'ABCDEFGHIJ' && D.mg.exitRoutes.length === 11 &&
    D.mg.triggers.length === 11 && D.mg.triggers.every(t => t.box.h[1] === 1) && D.mg.holes.length === 11 && D.mg.rocks.length === 25 && D.mg.minTimeBetweenRockFallsSec === 3,
    D.mg.triggers.map(t => t.box.h.join('x')).join(' '));
  check('R1 data: clip Attack 2,333 s, Swim 4,133 s, EyeClosedSwim 4,167 s; 9 doi song toc do 2', near(D.clips.GaleCliffMonster_Attack, 2.333, 0.001) && near(D.clips.GaleCliffMonster_Swim, 4.133, 0.001) &&
    near(D.clips.GaleCliffMonster_EyeClosedSwim, 4.167, 0.001) && D.fol.length === 9 && D.fol.every(f => f[0] === 2), JSON.stringify(D.clips));
  const expSpeed = 0.15 * Math.max(20, Math.min(40, 0.8 * D.mod));
  console.log('  moveMod cua thuyen khoi dau = ' + D.mod + ' (toc do ran = 0,15 * clamp(0,8 * ' + D.mod + ', 20, 40) = ' + expSpeed.toFixed(2) + ' m/s)');

  // ---- 1. manager: trigger -> sinh o diem 0 cua tuyen, khong dieu kien worldPhase / gio, mot con cung luc
  await clearAll(page);
  await page.evaluate(() => { DR.s.worldPhase = 0; DR_DEBUG.setTime(0.5); DR.s.vars['spawned-gc-monster'] = false; });
  check('phase 0, ban ngay: chua co ran', (await list(page)).length === 0);
  await page.evaluate(() => { const t = DR_SERPENT.manager.triggers.find(t => t.name === '2-C'); DR_DEBUG.teleport(t.box.c[0], t.box.c[1], 0); });
  await sleep(1500);
  let l = await list(page);
  const ev = await page.evaluate(() => ({ sp: __ev.spawned.slice(), v: DR.s.vars['spawned-gc-monster'] }));
  const C0 = D.mg.routes.find(r => r.name === 'C').pts[0];
  check('thuyen chay vao trigger 2-C: sinh 1 con o diem 0 tuyen C (523,3, 406), khong can worldPhase / gio', l.length === 1 && l[0].route === 'C' && ev.sp.length === 1 && near(ev.sp[0].x, C0[0], 0.01) && near(ev.sp[0].z, C0[1], 0.01),
    JSON.stringify(ev.sp));
  check('SpawnMonster dat bien "spawned-gc-monster" (hoi thoai Hermit doc)', ev.v === true);
  await page.evaluate(() => { const t = DR_SERPENT.manager.triggers.find(t => t.name === '1-A'); DR_DEBUG.teleport(t.box.c[0], t.box.c[1], 0); });
  await sleep(1200);
  l = await list(page);
  check('isMonsterSpawned: trigger khac (1-A) khong sinh con thu hai', l.length === 1 && (await page.evaluate(() => __ev.spawned.length)) === 1);
  await sleep(4000);
  l = await list(page);
  check('tuan tra: PATROLLING, toc do -> 0,15 * clamp(0,7 * moveMod, 20, 40) = 3 m/s', l[0].state === 'PATROLLING' && near(l[0].speed, 3, 0.25), JSON.stringify([l[0].state, l[0].speed]));
  check('o duoi mat nuoc: y goc = NavMesh GC_Eel (-0,975) + baseOffset (-0,05)', near(l[0].y, -1.025, 0.001), String(l[0].y));
  check('thuyen o xa: khong thay (mat nham, anim SwimEyeClosed), khong san', l[0].anim === 'SwimEyeClosed' && !l[0].follow && l[0].prox === 0);

  // ---- 2. 9 doi song TransformFollower: moi dot cach dot cha dung originalDistance
  const fol = await page.evaluate(() => {
    const o = DRSerpent.debug.objects[0], byName = {};
    o.traverse(n => { byName[n.name] = n; });
    const out = [], p = new THREE.Vector3(), q = new THREE.Vector3();
    DR_SERPENT.followers.forEach(f => { const a = byName[DR_SERPENT.nodes[f.node].name], b = byName[DR_SERPENT.nodes[f.parent].name]; a.getWorldPosition(p); b.getWorldPosition(q); out.push([+p.distanceTo(q).toFixed(4), f.dist]); });
    return out;
  });
  check('TransformFollower: moi dot cach dot cha dung originalDistance (9 dot)', fol.length === 9 && fol.every(f => near(f[0], f[1], 0.01)), JSON.stringify(fol));

  // ---- 3. tan cong: thuyen o hanh lang, ran thay -> san -> can: +2 o hong; roi lan ve loi thoat
  await clearAll(page);
  const st = await stage(page, 'C', 4, 9);
  check('dat thuyen cach ran 9 m trong hanh lang tuyen C (tia nhin thong, tren NavMesh)', !!st, JSON.stringify(st));
  const dmg0 = await damage(page), kn = await page.evaluate(() => DRBoat.knots());
  const shots = { hunt: false, attack: false }, goals = [];
  let got = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const s = await page.evaluate(() => ({ l: DRSerpent.debug.list()[0], hits: __ev.hits.slice(), hunt: __ev.hunt.length, att: __ev.attack.length }));
    if (s.l && s.l.state === 'MOVING_TO_PLAYER') goals.push(s.l.goal);
    if (s.l && !shots.hunt && s.l.state === 'MOVING_TO_PLAYER' && s.l.prox > 0.6) { shots.hunt = true; await shot('serpent-hunt'); }
    if (s.l && !shots.attack && s.l.anim === 'GaleCliffMonster_Attack') { shots.attack = true; await shot('serpent-attack'); }
    if (s.hits.length) { got = s; break; }
    await sleep(60);
  }
  const dmg1 = await damage(page);
  check('thuyen dung yen (' + kn.toFixed(0) + ' kn < 40 kn), thay -> san: serpentHunt roi serpentAttack', !!got && got.hunt === 1 && got.att === 1 && kn < 40);
  check('monsterHit 2 diem, nguon GCMonster (VariablePlayerDamager)', !!got && got.hits[0].points === 2 && got.hits[0].source === 'GCMonster' && got.hits[0].applied === 2, got ? JSON.stringify(got.hits[0]) : 'khong trung sau 12 s');
  check('+2 o hong (khong thoi gian mien sat thuong)', dmg1 - dmg0 === 2, dmg0 + ' -> ' + dmg1);
  check('toc do san = 0,15 * clamp(0,8 * moveMod, 20, 40) (muc tieu cua Lerp)', goals.length > 0 && goals.every(g => near(g, expSpeed, 0.001)), JSON.stringify(goals.slice(0, 3)));
  await sleep(400);
  l = await list(page);
  const ex = D.mg.exitRoutes.map(r => r[0]);
  check('trung don -> MoveToDespawn: MOVING_TO_DESPAWN, mat nham han, dich = diem dau cua mot tuyen thoat', l.length === 1 && l[0].state === 'MOVING_TO_DESPAWN' && l[0].forceEyesShut && l[0].dest &&
    ex.some(p => near(p[0], l[0].dest[0], 0.01) && near(p[1], l[0].dest[1], 0.01)), l[0] ? JSON.stringify(l[0].dest) : 'mat');
  await sleep(3500);
  check('oneHitOnly: dung yen canh ran ma khong hong them o', (await damage(page)) === dmg1);
  console.log('  anh: ' + Object.keys(shots).filter(k => shots[k]).join(', '));

  // ---- 4. het tuyen tuan tra -> Despawn (tat dan 2 s) -> huy; sau do trigger sinh duoc lai
  await clearAll(page);
  await page.evaluate(() => {
    DR_DEBUG.teleport(700, 700, 0);
    const M = DR_SERPENT.manager, r = M.routes.find(r => r.name === 'J'), ri = M.routes.indexOf(r);
    DRSerpent.debug.force(ri, 0);
    DRSerpent.debug.place(0, r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1], r.pts.length - 1);
  });
  await sleep(600);
  l = await list(page);
  check('di het tuyen (OnPathComplete khi PATROLLING) -> Despawn: tat dan', l.length === 1 && l[0].state === 'NONE' && l[0].fadeOut, JSON.stringify(l[0] && [l[0].state, l[0].fadeOut]));
  await sleep(2600);
  const gone = await page.evaluate(() => ({ n: DRSerpent.debug.list().length, ev: __ev.gone.length, m: DRSerpent.debug.manager() }));
  check('sau ambienceFadeDurationSec 2 s: huy (serpentGone), isMonsterSpawned = false', gone.n === 0 && gone.ev === 1 && gone.m.isSpawned === false, JSON.stringify(gone));
  await page.evaluate(() => { const t = DR_SERPENT.manager.triggers.find(t => t.name === '5-H'); DR_DEBUG.teleport(t.box.c[0], t.box.c[1], 0); });
  await sleep(1200);
  l = await list(page);
  check('sinh lai khi thuyen vao trigger khac (5-H -> tuyen H)', l.length === 1 && l[0].route === 'H');

  // ---- 5. Banish bat that (vong nang luc + chuot phai): ran dang di thi lan, manager khong sinh luc Banish
  await clearAll(page);
  await page.evaluate(() => { DR_DEBUG.unlockSpells(); DR.s.sanity = 1; DR_DEBUG.teleport(700, 700, 0); DRSerpent.debug.force(DR_SERPENT.manager.routes.findIndex(r => r.name === 'C'), 0); });
  await sleep(800);
  const p8 = (() => { const a = (360 / 11 * 8) * Math.PI / 180, r = 200 * (H / 1080); return [W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r]; })();
  await page.keyboard.down('KeyE'); await sleep(450);
  await page.mouse.move(p8[0], p8[1], { steps: 4 }); await sleep(150);
  await page.keyboard.up('KeyE'); await sleep(250);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' }); await sleep(500);
  l = await list(page);
  const ban = await page.evaluate(() => ({ b: DRSpells.banished, ev: __ev.banished.slice(), m: DRSerpent.debug.manager() }));
  check('Banish bat (vong nang luc + chuot phai)', ban.b === true);
  check('Banish: ran MoveToDespawn (mat nham, banishActive), threatBanished nguon GCMonster', l.length === 1 && l[0].state === 'MOVING_TO_DESPAWN' && l[0].banishActive && l[0].forceEyesShut &&
    ban.ev.some(e => e && e.source === 'GCMonster'), JSON.stringify({ s: l[0] && l[0].state, ev: ban.ev }));
  check('Banish dang bat: trigger khong sinh (TrySpawnFromTrigger kiem GetIsAbilityActive)', ban.m.banish === true &&
    (await page.evaluate(() => { DRSerpent.debug.clear(); return DRSerpent.debug.fire(DRSerpent.debug.trigger('3-D')); })) === null);
  // Banish khi dang san (phat qua su kien) -> threatBanished.active = true
  await clearAll(page);
  await page.evaluate(() => DR.emit('banish', false));
  await stage(page, 'C', 4, 12);
  await page.waitForFunction(() => DRSerpent.debug.list()[0] && DRSerpent.debug.list()[0].follow, null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => DR.emit('banish', true));
  await sleep(300);
  l = await list(page);
  // mỗi quái đang dựng đều phát TriggerThreatBanished khi Banish (SBMonsterAnimationHelper.cs:170 cả khi ở xa): chỉ xét nguồn GCMonster
  const ban2 = await page.evaluate(() => ({ ev: __ev.banished.filter(e => e && e.source === 'GCMonster') }));
  check('Banish luc dang san: threatBanished.active = true, ran lan', l.length === 1 && l[0].state === 'MOVING_TO_DESPAWN' && ban2.ev.length === 1 && ban2.ev[0].active === true, JSON.stringify(ban2.ev));
  await sleep(4000);
  check('Banish: ngay canh thuyen van khong can them (mat nham)', (await page.evaluate(() => __ev.hits.length)) === 0);
  await page.evaluate(() => DR.emit('banish', false));
  const again = await page.evaluate(() => { DRSerpent.debug.clear(); return !!DRSerpent.debug.fire(DRSerpent.debug.trigger('3-D')); });
  check('het Banish: trigger sinh lai duoc', again === true);

  // ---- 6. PASSIVE: khong phat hien; doi che do luc dang san -> mat dau; NIGHTMARE: 3 o
  await clearAll(page);
  await page.evaluate(() => DRMenus.set('gameMode', 1));
  const mode1 = await page.evaluate(() => DRMenus.gameMode());
  const farP = await stageFar(page, 'C', 4, [20, 18, 16, 14]);
  await sleep(4500);
  l = await list(page);
  check('PASSIVE (' + mode1 + '): thuyen cach ' + (farP && farP.d) + ' m, tia thong, 4,5 s van khong san / can', mode1 === 'PASSIVE' && l.length === 1 && l[0].state === 'PATROLLING' && (await page.evaluate(() => __ev.hunt.length)) === 0 &&
    (await damage(page)) === 0, JSON.stringify(l[0] && l[0].state));
  await page.evaluate(() => DRMenus.set('gameMode', 0));
  await page.waitForFunction(() => __ev.hunt.length > 0, null, { timeout: 5000 }).catch(() => {});
  check('doi ve NORMAL: ran phat hien va san', (await page.evaluate(() => __ev.hunt.length)) >= 1);
  await page.evaluate(() => DRMenus.set('gameMode', 1));
  await sleep(200);
  l = await list(page);
  check('doi sang PASSIVE luc dang san -> DoLosePlayer (ve tuyen / GHOST)', l.length === 1 && (l[0].state === 'PATROLLING' || l[0].state === 'MOVING_TO_PLAYER_GHOST') && !l[0].follow, JSON.stringify(l[0] && l[0].state));
  await page.evaluate(() => DRMenus.set('gameMode', 2));
  await clearAll(page);
  await stage(page, 'C', 4, 9);
  await page.waitForFunction(() => __ev.hits.length > 0, null, { timeout: 12000 }).catch(() => {});
  const nm = await page.evaluate(() => ({ h: __ev.hits.slice(), d: DR.grid('INVENTORY').damage.length, mode: DRMenus.gameMode() }));
  check('NIGHTMARE: damagePoints 2 + extraDamageInNightmareMode 1 = 3 o', nm.mode === 'NIGHTMARE' && nm.h.length === 1 && nm.h[0].points === 3 && nm.d === 3, JSON.stringify(nm));
  await page.evaluate(() => DRMenus.set('gameMode', 0));

  // ---- 7. do sau: mat chi mo khi do sau nuoc >= 0,03; mat dau 3 s; theo duoi > 30 s; chan toc do 40
  await clearAll(page);
  await page.evaluate(() => { window.__d01 = DRWorld.depth01; DRWorld.depth01 = () => 0.029; });
  await stage(page, 'C', 4, 9); await sleep(4000);
  l = await list(page);
  check('do sau 0,029 < 0,03: mat nham (canEyesSee = false), 4 s khong san', l.length === 1 && !l[0].canEyesSee && l[0].state === 'PATROLLING' && (await page.evaluate(() => __ev.hunt.length)) === 0);
  await page.evaluate(() => { DRWorld.depth01 = () => 0.03; });
  await page.waitForFunction(() => __ev.hunt.length > 0, null, { timeout: 4000 }).catch(() => {});
  check('do sau 0,03 (>= nguong): phat hien va san', (await page.evaluate(() => __ev.hunt.length)) === 1);
  await page.evaluate(() => { DRWorld.depth01 = window.__d01; });
  await clearAll(page);
  const farL = await stageFar(page, 'C', 4, [20, 18, 16, 14]);
  await page.waitForFunction(() => DRSerpent.debug.list()[0] && DRSerpent.debug.list()[0].state === 'MOVING_TO_PLAYER', null, { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => { DRSerpent.debug.blind = true; });
  const tb = Date.now();
  await page.waitForFunction(() => { const s = DRSerpent.debug.list()[0]; return !s || s.state !== 'MOVING_TO_PLAYER'; }, null, { timeout: 8000 }).catch(() => {});
  const lost = (Date.now() - tb) / 1000;
  l = await list(page);
  check('mat dau (thuyen cach ' + (farL && farL.d) + ' m, mat khong con thay): sau playerLostThreshold 3 s (+ nhip mat 0,25 s) -> DoLosePlayer -> GHOST', lost >= 2.9 && lost <= 4.0 && l[0] && l[0].state === 'MOVING_TO_PLAYER_GHOST' && !l[0].follow, lost.toFixed(2) + ' s ' + (l[0] && l[0].state));
  await clearAll(page);
  await stage(page, 'C', 4, 12);
  await page.waitForFunction(() => DRSerpent.debug.list()[0] && DRSerpent.debug.list()[0].state === 'MOVING_TO_PLAYER', null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => DRSerpent.debug.setChase(0, 29.9));
  await sleep(500);
  l = await list(page);
  check('theo duoi >= maxChaseTimeSec 30 s: MoveToDespawn', l.length === 1 && (l[0].state === 'MOVING_TO_DESPAWN' || l[0].state === 'ATTACKING'), JSON.stringify(l[0] && l[0].state));
  await clearAll(page);
  await page.evaluate(() => { window.__mod = DRBoat.stats.moveMod; DRBoat.stats.moveMod = 60; });
  await stage(page, 'C', 4, 12);
  await page.waitForFunction(() => DRSerpent.debug.list()[0] && DRSerpent.debug.list()[0].state === 'MOVING_TO_PLAYER', null, { timeout: 4000 }).catch(() => {});
  l = await list(page);
  check('moveMod 60: toc do san bi chan o boatSpeedMax 40 -> 0,15 * 40 = 6 m/s', l[0] && near(l[0].goal, 6, 0.001), l[0] && String(l[0].goal));
  await page.evaluate(() => { DRBoat.stats.moveMod = window.__mod; });

  // ---- 8. lo vach: dau ran chom vao GCMonsterHole -> da bao dong (cung dao, lo khac) va da roi (dung lo) sau Random(0, 2) s; cach nhau >= 3 s
  await clearAll(page);
  await page.evaluate(() => { DR_DEBUG.teleport(700, 700, 0); DRSerpent.debug.force(DR_SERPENT.manager.routes.findIndex(r => r.name === 'C'), 0); });
  const holeTest = async name => {
    await page.evaluate(n => {
      const h = DR_SERPENT.manager.holes.find(h => h.name === n);
      __ev.rock.length = 0; __ev.warn.length = 0; __ev.hole.length = 0;
      DRSerpent.debug.place(0, h.box.c[0], h.box.c[1]);
    }, name);
    await sleep(2600);
    return page.evaluate(() => ({ hole: __ev.hole.slice(), rock: __ev.rock.slice(), warn: __ev.warn.slice() }));
  };
  const hN1 = D.mg.holes.find(h => h.name === 'North1'), rI = D.mg.rocks.filter(r => r.island === hN1.island), rSame = rI.filter(r => r.hole === hN1.hole);
  let h1 = await holeTest('North1');
  check('lo North1: 1 su kien, ' + rSame.length + ' da roi cua dung lo, ' + (rI.length - rSame.length) + ' da bao dong cua cac lo khac cung dao (island ' + hN1.island + ')',
    h1.hole.length === 1 && h1.rock.length === rSame.length && h1.warn.length === rI.length - rSame.length && h1.rock.every(r => r.hole === hN1.hole && r.island === hN1.island) &&
    h1.warn.every(r => r.island === hN1.island && r.hole !== hN1.hole), JSON.stringify({ h: h1.hole.length, r: h1.rock.length, w: h1.warn.length }));
  check('tre ngau nhien Random(0, 2) s sau khi cham lo', [...h1.rock, ...h1.warn].every(e => e.t - h1.hole[0].t <= 2300 && e.t - h1.hole[0].t >= -50), JSON.stringify([...h1.rock, ...h1.warn].map(e => Math.round(e.t - h1.hole[0].t))));
  await page.evaluate(() => { const h = DR_SERPENT.manager.holes.find(h => h.name === 'North2'); __ev.hole.length = 0; DRSerpent.debug.place(0, h.box.c[0], h.box.c[1]); });
  await sleep(300);
  check('lo thu hai trong < 3 s (minTimeBetweenRockFallsSec): khong rung them', (await page.evaluate(() => __ev.hole.length)) === 0);
  await sleep(3000);
  h1 = await holeTest('SouthEast1');
  check('lo SouthEast1 sau > 3 s: lai rung (dao SOUTHEAST)', h1.hole.length === 1 && h1.rock.length > 0 && h1.rock.every(r => r.island === 4 && r.hole === 41));

  // ---- 9. hieu nang, anh mo hinh, loi
  await clearAll(page);
  await stage(page, 'C', 4, 9);
  await sleep(500);
  const perf = await page.evaluate(() => DR_DEBUG.perf());
  console.log('  perf 1280x720 (ran song, o canh): cpu ' + perf.cpuMs.toFixed(2) + ' ms, khung ' + perf.avgMs.toFixed(2) + ' ms, calls ' + perf.calls);
  // anh mo hinh: nang ran len khoi mat nuoc (hook y) de xem hinh dang, mat phat sang
  await clearAll(page);
  await stage(page, 'C', 4, 11);
  await page.evaluate(() => { DRSerpent.debug.blind = true; DRSerpent.debug.y = 1.2; });
  await sleep(1200); await shot('serpent-model');
  await page.evaluate(() => { DRSerpent.debug.y = null; DRSerpent.debug.blind = false; });
  check('khong loi trang / console / HTTP (1280x720)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// anh 844x390: ran san va hinh dang
async function phone(browser, base) {
  const W = 844, H = 390;
  const { page, errors } = await boot(browser, base, W, H);
  await hideHud(page);
  const st = await stage(page, 'C', 4, 9);
  let shotHunt = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const s = await page.evaluate(() => ({ l: DRSerpent.debug.list()[0], hits: __ev.hits.length }));
    if (s.l && !shotHunt && s.l.state === 'MOVING_TO_PLAYER' && s.l.prox > 0.6) { shotHunt = true; await page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-serpent-hunt.png') }); }
    if (s.hits) break;
    await sleep(60);
  }
  check('844x390: ran san thuyen va can', !!st && shotHunt && (await page.evaluate(() => __ev.hits.length)) === 1);
  await clearAll(page);
  await stage(page, 'C', 4, 11);
  await page.evaluate(() => { DRSerpent.debug.blind = true; DRSerpent.debug.y = 1.2; });
  await sleep(1200);
  await page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-serpent-model.png') });
  check('khong loi trang / console / HTTP (844x390)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  try { await run(browser, base); await phone(browser, base); } finally { await browser.close(); srv.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed  (anh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
