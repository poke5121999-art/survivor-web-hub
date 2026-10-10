/*
 * DREDGE - kiem don vi R4 (mối nguy Twisted Strand: tuong re, nam no, day leo): js/tshazards.js, tools/tshazards.py, data/tshazards.js.
 * Chay: node test/dredge-r4ts.js   (anh: %TEMP%/dredge-r4ts hoac SHOTS=...; DR_URL=... de chay tren Pages)
 * So goc: TSRootWall.cs, ExplodingMushrooms.cs, VinesWorldEvent.cs, AttackingTentacle.cs; Game.unity (20 TSRootWall: kiem 10-20 s, 10..100 m, sanity 0,75, tieng 15-50 m;
 * 99 ExplodingMushrooms: sanity 0,25, pitch 0,8-1,2, SphereCollider trigger r 2,5); RootWall_Show 1,75 s (Colliders bat 0,4167), RootWall_Hide 1 s (Colliders tat 0,6),
 * ExplodingMushrooms_Explode 1,5 s (OnExplode 1,4833), _Respawn 3,15 s (OnReset 1,6667; collider bat 2,6333; exitTime 0,95), Vine_SpawnRW 5,8333 s, Tentacle_Retract 1,5833 s;
 * Vines.prefab: Vine1..4 anchor (-3,0,3) (2,0,5) (-2,0,7) (0,5,0,-3), trackingStrength 2/1/0,5/2, animationDelay 0,5/0/0,25/0,75. WORLD-GAPS.md §6 dong R4.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r4ts');
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
// dat thuyen tai (x, z) nhin ve (tx, tz); sanity co dinh
const place = (page, x, z, tx, tz) => ev(page, ([x, z, tx, tz]) => { DR_DEBUG.teleport(x, z, Math.atan2(-(tx - x), -(tz - z))); }, [x, z, tx, tz]);
// mot diem nuoc trong [rmin, rmax] quanh (cx, cz), sdf > clear
const waterSpot = (page, cx, cz, rmin, rmax, clear) => ev(page, ([cx, cz, rmin, rmax, clear]) => {
  for (let r = rmin; r <= rmax; r += 1) for (let a = 0; a < 6.28; a += 0.15) {
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (DRWorld.sdf(x, z) > clear && DRNav.walkable(x, z)) return [x, z];
  }
  return null;
}, [cx, cz, rmin, rmax, clear]);
const shots = async (page, name) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(500);
  await page.screenshot({ path: path.join(OUT, name + '-1280.png') });
};
const shotsPhone = async (page, name) => {
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(500);
  await page.screenshot({ path: path.join(OUT, name + '-844.png') });
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(300);
};
const W = (page, i) => ev(page, i => DRTSHazards.debug.wallState(i), i);
const M = (page, i) => ev(page, i => DRTSHazards.debug.mushState(i), i);
// pixel dau chan (landmask) cua tuong i la dat? -> ty le o la dat (isLand quanh tam o)
const fpLand = (page, i) => ev(page, i => {
  const L = DRWorld.landBox, fp = DR_TSHAZARDS.walls.list[i].fp;
  let n = 0, land = 0;
  for (const [j, c0, k] of fp) for (let q = 0; q < k; q++) { n++; if (DRWorld.isLand(L.x0 + (c0 + q + 0.5) * L.res, L.z0 + (j + 0.5) * L.res)) land++; }
  return { n, land };
}, i);

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
  await sleep(1500);

  // ------------------------------------------------------------------ 1. du lieu goc
  console.log('Du lieu (Game.unity, prefab, clip)');
  const D = await ev(page, () => { const d = DR_TSHAZARDS, w = d.walls, m = d.mushrooms, v = d.vines;
    return { nw: w.list.length, cfg: w.cfg, wl: [w.clips.show.len, w.clips.hide.len], wcol: [w.clips.show.col, w.clips.hide.col], nm: m.list.length, mcfg: m.cfg, mrad: [...new Set(m.list.map(x => x.trig.r))],
      mnodes: [...new Set(m.list.map(x => x.nodes.length))], ml: [m.clips.explode.len, m.clips.respawn.len], mev: [m.clips.explode.ev, m.clips.respawn.ev], men: [m.clips.explode.en, m.clips.respawn.en],
      vl: v.list.map(x => [x.name, x.scale, x.anchor, x.strength, x.delay, x.sfx]), vc: [v.clips.spawn.len, v.clips.retract.len], vev: v.clips.spawn.events.map(e => e.fn + '@' + e.t.toFixed(3)),
      rev: v.clips.retract.events.map(e => e.fn), ph: DR_WORLDEVENTS.Vines, fpAll: w.list.every(x => x.fp.length > 0), inst: w.list.every(x => x.models.length === 5 && x.models.every(y => y.m.length === 10)) }; });
  const c = D.cfg;
  ok(D.nw === 20 && c.minTimeBetweenChecks === 10 && c.maxTimeBetweenChecks === 20 && c.minPlayerDistance === 10 && c.maxPlayerDistance === 100 && c.playerSanityThreshold === 0.75 &&
     c.sfxCloseDistance === 15 && c.sfxFarDistance === 50, '20 TSRootWall: kiem 10-20 s, 10..100 m, sanity 0,75, tieng 15-50 m');
  ok(near(D.wl[0], 1.75, 0.001) && near(D.wl[1], 1, 0.001) && D.wcol[0].some(k => near(k[0], 0.4167, 0.001) && k[1] === 1) && D.wcol[1].some(k => near(k[0], 0.6, 0.001) && k[1] === 0),
     'RootWall_Show 1,75 s (Colliders bat 0,4167), RootWall_Hide 1 s (Colliders tat 0,6)');
  ok(D.fpAll && D.inst, 'moi tuong: 5 mo hinh khop instances.bin + dau chan landmask');
  ok(D.nm === 99 && D.mcfg.sanityThreshold === 0.25 && D.mcfg.pitchMin === 0.8 && D.mcfg.pitchMax === 1.2 && D.mrad.length === 1 && D.mrad[0] === 2.5 && D.mnodes.length === 1 && D.mnodes[0] === 3,
     '99 ExplodingMushrooms: sanity 0,25, pitch 0,8-1,2, trigger r 2,5, 3 nut');
  ok(near(D.ml[0], 1.5, 0.001) && near(D.ml[1], 3.15, 0.001) && D.mev[0].some(e => e.fn === 'OnExplode' && near(e.t, 1.4833, 0.001)) && D.mev[1].some(e => e.fn === 'OnReset' && near(e.t, 1.6667, 0.001)) &&
     D.men[0].every(k => k[1] === 0) && D.men[1].some(k => near(k[0], 2.6333, 0.001) && k[1] === 1), 'Explode 1,5 s (OnExplode 1,4833, collider tat), Respawn 3,15 s (OnReset 1,6667, collider bat 2,6333)');
  ok(JSON.stringify(D.vl) === JSON.stringify([['Vine1', 0.45, [-3, 0, 3], 2, 0.5, true], ['Vine2', 0.5, [2, 0, 5], 1, 0, false], ['Vine3', 0.55, [-2, 0, 7], 0.5, 0.25, false], ['Vine4', 0.5, [0.5, 0, -3], 2, 0.75, false]]),
     '4 vine: anchor / trackingStrength / animationDelay / ti le goc theo Vines.prefab');
  ok(near(D.vc[0], 5.8333, 0.001) && near(D.vc[1], 1.5833, 0.001) && D.vev.includes('AttackFinished@5.833') && D.vev.includes('PlayAttackSFX@2.833') && D.rev.includes('AttackFinished'),
     'Vine_SpawnRW 5,8333 s (PlayAttackSFX 2,833, AttackFinished 5,833), Tentacle_Retract 1,5833 s');
  ok(D.ph.maxSanity === 0.25 && D.ph.dispelByBanish === true && D.ph.weight === 25 && D.ph.forbiddenZones.length === 6 && !D.ph.forbiddenZones.includes('TWISTED_STRAND'), 'WorldEventData Vines: sanity <= 0,25, Xua duoi dap tat, chi o Twisted Strand');

  // ------------------------------------------------------------------ 2. tuong re: tu the dau
  console.log('Tuong re: tu the dau, tieng, bo hen gio');
  const N = 3;   // tuong 3 (-504, -601.7): nuoc cach 14 m
  const w0 = await ev(page, N => DR_TSHAZARDS.walls.list[N], N);
  const init = await ev(page, () => ({ log: DRTSHazards.debug.log.hideCalls, st: Array.from({ length: 20 }, (_, i) => DRTSHazards.debug.wallState(i)) }));
  ok(init.log >= 1 && init.st.every(s => s.phase === 'hideIdle' && !s.showing && !s.collider && !s.visible), 'bat dau: ca 20 tuong chim (isShowing = false), Colliders tat, instance tinh bi an');
  ok(init.st.every(s => s.timer >= 0 && s.timer <= 20), 'hen gio kiem tra dau tien Random(10, 20) (con lai 0..20 s: ' + init.st.map(s => s.timer.toFixed(0)).join(',') + ')');
  const lands = [];
  for (let i = 0; i < 20; i++) lands.push(await fpLand(page, i));
  const nPx = lands.reduce((a, x) => a + x.n, 0), nLand = lands.reduce((a, x) => a + x.land, 0);
  ok(nPx > 800 && nLand / nPx < 0.1, 'dau chan 20 tuong da duoc xoa khoi landmask luc chim (dat ' + nLand + '/' + nPx + ' o)');

  // ------------------------------------------------------------------ 3. dieu kien TryChangeState (goi truc tiep)
  console.log('Tuong re: TryChangeState');
  const spot = await waterSpot(page, w0.x, w0.z, 14, 30, 2.5);
  await place(page, spot[0], spot[1], w0.x, w0.z);
  await sleep(600);
  const gate = await ev(page, ([N, wx, wz]) => {
    const H = DRTSHazards.debug, b = DR.s.boat, out = {};
    const at = (x, z) => { b.x = x; b.z = z; };
    const x0 = b.x, z0 = b.z;
    DR.s.sanity = 0.9; out.highSan = H.wallCheck(N) || H.wallState(N).showing;                  // sanity 0,9 > 0,75 va dang chim: khong hien
    DR.s.sanity = 0.5; at(wx + 5, wz); out.near = H.wallCheck(N) || H.wallState(N).showing;     // 5 m < minPlayerDistance 10: khong hien
    at(wx + 150, wz); out.far = H.wallCheck(N) || H.wallState(N).showing;                       // 150 m > 100: khong doi
    at(x0, z0); out.d = Math.hypot(wx - x0, wz - z0);
    out.show = H.wallCheck(N); out.showing = H.wallState(N).showing;                             // sanity 0,5, 14 m: hien
    return out;
  }, [N, w0.x, w0.z]);
  ok(gate.highSan === false && gate.near === false && gate.far === false, 'sanity 0,9 / cach 5 m / cach 150 m: chim yen (TryChangeState khong doi)');
  ok(gate.show === true && gate.showing === true && near(gate.d, 14, 1.5), 'sanity 0,5, cach ' + gate.d.toFixed(1) + ' m (10..100): isShowing = true');
  // dang hien: kiem tra tiep (xa 150 m van khong doi > 100; sanity cao van an duoc)
  await sleep(400);
  const hideGate = await ev(page, ([N]) => { DR.s.sanity = 1; const H = DRTSHazards.debug, b = DR.s.boat; const t = H.wallCheck(N); return { t, showing: H.wallState(N).showing }; }, [N]);
  ok(hideGate.t === true && hideGate.showing === false, 'dang hien: bat ke sanity (1,0) van doi sang chim o lan kiem tiep (isShowing || ...)');
  await sleep(1400);
  const s1 = await W(page, N);
  ok(s1.phase === 'hideIdle' || s1.phase === 'hide' || s1.phase === 'showIdle' || s1.phase === 'show', 'trang thai hoat anh hop le sau doi (' + s1.phase + ')');
  await sleep(1500);

  // ------------------------------------------------------------------ 4. hien that bang hen gio + moc thoi gian clip
  console.log('Tuong re: hien / chim theo bo hen gio, thoi gian clip, va cham');
  await ev(page, N => { DR.s.sanity = 0.5; const H = DRTSHazards.debug; H.wallTimer(N, 600); }, N);   // dung tuong khac kiem
  const st0 = await W(page, N);
  ok(st0.phase === 'hideIdle' && !st0.collider, 'truoc khi hien: hideIdle, collider tat (' + st0.phase + ')');
  await page.screenshot({ path: path.join(OUT, 'r4-wall-hidden-1280.png') });
  await ev(page, N => { window.__wl = []; let last = ''; const f = () => { const s = DRTSHazards.debug.wallState(N); const k = s.phase + '|' + s.collider; if (k !== last) { last = k; window.__wl.push([performance.now(), s.phase, s.collider]); } requestAnimationFrame(f); }; f();
    DR.s.sanity = 0.5; DRTSHazards.debug.wallTimer(N, 0.2); }, N);
  await page.waitForFunction(N => DRTSHazards.debug.wallState(N).phase === 'showIdle', N, { timeout: 15000 }).catch(() => {});
  await sleep(300);
  const tl = await ev(page, () => window.__wl);
  const tShow = tl.find(x => x[1] === 'show'), tCol = tl.find(x => x[1] === 'show' && x[2] === true), tIdle = tl.find(x => x[1] === 'showIdle');
  ok(!!tShow && !!tIdle && near((tIdle[0] - tShow[0]) / 1000, 1.75, 0.3), 'bo hen gio het -> Show 1,75 s -> ShowIdle (' + (tShow && tIdle ? ((tIdle[0] - tShow[0]) / 1000).toFixed(2) : '?') + ' s)');
  ok(!!tCol && near((tCol[0] - tShow[0]) / 1000, 0.4167, 0.2), 'Colliders bat o 0,4167 s cua Show (' + (tCol ? ((tCol[0] - tShow[0]) / 1000).toFixed(2) : '?') + ' s)');
  const sh = await W(page, N);
  ok(sh.showing && sh.collider && sh.built && sh.visible, 'dang hien: collider bat, 5 mo hinh dung hinh hoc cua the gioi, dang ve');
  const lw = await fpLand(page, N);
  ok(lw.n > 0 && lw.land / lw.n > 0.9, 'dau chan tuong tra lai thanh dat khi hien (' + lw.land + '/' + lw.n + ' o)');
  const sfxLog = await ev(page, () => DRTSHazards.debug.log.sfx.slice());
  ok(sfxLog.includes('tshazards.wall.emerge'), 'phat tieng emerge cua Vine Wall');
  await ev(page, N => { DR_DEBUG.teleport(DR.s.boat.x, DR.s.boat.z, DR.s.boat.yaw); }, N);
  await sleep(800);
  await shots(page, 'r4-wall-shown');
  await shotsPhone(page, 'r4-wall-shown');
  // chim lai
  await ev(page, N => { window.__wl = []; DR.s.sanity = 0.5; DRTSHazards.debug.wallTimer(N, 0.2); }, N);
  await page.waitForFunction(N => DRTSHazards.debug.wallState(N).phase === 'hideIdle', N, { timeout: 15000 }).catch(() => {});
  const tl2 = await ev(page, () => window.__wl);
  const tHide = tl2.find(x => x[1] === 'hide'), tOff = tl2.find(x => x[1] === 'hide' && x[2] === false), tEnd = tl2.find(x => x[1] === 'hideIdle');
  ok(!!tHide && !!tEnd && near((tEnd[0] - tHide[0]) / 1000, 1.0, 0.3), 'Hide 1 s -> HideIdle (' + (tHide && tEnd ? ((tEnd[0] - tHide[0]) / 1000).toFixed(2) : '?') + ' s)');
  ok(!!tOff && near((tOff[0] - tHide[0]) / 1000, 0.6, 0.2), 'Colliders tat o 0,6 s cua Hide (' + (tOff ? ((tOff[0] - tHide[0]) / 1000).toFixed(2) : '?') + ' s)');
  const lh = await fpLand(page, N);
  ok(lh.land / lh.n < 0.1, 'dau chan lai bi xoa khi chim (dat ' + lh.land + '/' + lh.n + ')');
  ok((await ev(page, () => DRTSHazards.debug.log.sfx)).includes('tshazards.wall.submerge'), 'phat tieng submerge');

  // ------------------------------------------------------------------ 5. nam no
  console.log('Nam no');
  const MID = 0;
  const m0 = await M(page, MID);
  const mc = await ev(page, MID => DR_TSHAZARDS.mushrooms.list[MID].trig.c, MID);
  const ms = await waterSpot(page, mc[0], mc[2], 2.7, 3.0, 1);
  ok(m0.phase === 'idle' && m0.pitch >= 0.8 && m0.pitch <= 1.2 && !!ms, 'nhom nam ' + MID + ' Idle, pitch ' + m0.pitch.toFixed(3) + ' trong [0,8; 1,2], co diem nuoc cach tam < 3,1 m');
  // sanity 0,5 >= 0,25: vao vung trigger khong no
  await ev(page, () => { DR.s.sanity = 0.5; });
  await place(page, ms[0] + 40, ms[1], mc[0], mc[2]); await sleep(500);
  await place(page, ms[0], ms[1], mc[0], mc[2]);
  await ev(page, () => { const k = () => { DR.s.sanity = 0.5; }; window.__sanI = setInterval(k, 50); });
  await sleep(1500);
  ok((await M(page, MID)).phase === 'idle', 'vao vung trigger khi sanity 0,5 (>= 0,25): khong no');
  // sanity 0,2 nhung dang o san trong vung: OnTriggerEnter khong phat lai
  await ev(page, () => { clearInterval(window.__sanI); window.__sanI = setInterval(() => { DR.s.sanity = 0.2; }, 50); });
  await sleep(1200);
  ok((await M(page, MID)).phase === 'idle', 'dang o trong vung khi sanity roi xuong 0,2: khong no (chi OnTriggerEnter)');
  // ra roi vao lai
  await place(page, ms[0] + 40, ms[1], mc[0], mc[2]); await sleep(500);
  await ev(page, () => { window.__ml = []; let last = ''; const f = () => { const s = DRTSHazards.debug.mushState(0); const k = s.phase; if (k !== last) { last = k; window.__ml.push([performance.now(), s.phase, s.hidden]); } requestAnimationFrame(f); }; f(); });
  await place(page, ms[0], ms[1], mc[0], mc[2]);
  await page.waitForFunction(() => DRTSHazards.debug.mushState(0).phase === 'explode', null, { timeout: 5000 }).catch(() => {});
  const mx = await M(page, MID);
  ok(mx.phase === 'explode' && mx.hidden && mx.visible, 'ra roi vao lai o sanity 0,2 (< 0,25): Animator Explode, 6 instance tinh bi an, ban dong dang ve');
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'r4-mush-explode-1280.png') });
  const mlog = await ev(page, () => DRTSHazards.debug.log);
  ok(mlog.sfx.includes('tshazards.mush.grow'), 'growAudioSource.Play khi trigger (pitch cua nhom)');
  await page.waitForFunction(() => DRTSHazards.debug.log.sfx.includes('tshazards.mush.explode'), null, { timeout: 4000 }).catch(() => {});
  const mlog2 = await ev(page, () => DRTSHazards.debug.log);
  ok(mlog2.sfx.includes('tshazards.mush.explode') && mlog2.vfx.includes('MushroomSporeEffect'), 'OnExplode: tieng Mushroom Explode + hat MushroomSporeEffect');
  await shotsPhone(page, 'r4-mush-explode');
  // thuyen dung yen trong vung: collider bat lai o 2,6333 s cua Respawn -> trigger ->, Idle -> Explode lai
  await page.waitForFunction(() => DRTSHazards.debug.mushState(0).phase === 'respawn', null, { timeout: 4000 }).catch(() => {});
  const rs = await M(page, MID);
  ok(rs.phase === 'respawn' && !rs.trig, 'het Explode (1,5 s) -> Respawn, collider con tat nen chua co trigger');
  await page.waitForFunction(() => DRTSHazards.debug.mushState(0).trig, null, { timeout: 4000 }).catch(() => {});
  const rt = await M(page, MID);
  ok(rt.trig && rt.t >= 2.6, 'collider bat lai o ' + rt.t.toFixed(2) + ' s (>= 2,6333) khi thuyen con trong vung -> Animator trigger giu den Idle');
  await page.waitForFunction(() => DRTSHazards.debug.mushState(0).phase === 'explode', null, { timeout: 4000 }).catch(() => {});
  ok((await M(page, MID)).phase === 'explode', 'toi Idle (0,95 x 3,15 s) Animator no tiep');
  const ml = await ev(page, () => window.__ml);
  const tEx = ml.filter(x => x[1] === 'explode'), tRe = ml.filter(x => x[1] === 'respawn');
  ok(tEx.length >= 2 && tRe.length >= 1 && near((tRe[0][0] - tEx[0][0]) / 1000, 1.5, 0.3) && near((tEx[1][0] - tRe[0][0]) / 1000, 2.9925, 0.4),
     'Explode 1,5 s (' + ((tRe[0][0] - tEx[0][0]) / 1000).toFixed(2) + ' s) -> Respawn toi Idle 2,9925 s (' + ((tEx[1][0] - tRe[0][0]) / 1000).toFixed(2) + ' s)');
  // thoat khoi vung va cho het chu ky
  await ev(page, () => { clearInterval(window.__sanI); DR.s.sanity = 1; });
  await place(page, ms[0] + 40, ms[1], mc[0], mc[2]);
  await page.waitForFunction(() => DRTSHazards.debug.mushState(0).phase === 'idle', null, { timeout: 12000 }).catch(() => {});
  const mi = await M(page, MID);
  ok(mi.phase === 'idle' && !mi.hidden && !mi.visible, 'het chu ky: Idle, instance tinh hien lai, ban dong an');

  // ------------------------------------------------------------------ 6. day leo
  console.log('Day leo (VinesWorldEvent)');
  const vs = await waterSpot(page, w0.x, w0.z, 14, 30, 3);
  await place(page, vs[0], vs[1], w0.x, w0.z);
  await ev(page, () => { DR.s.sanity = 0.1; DR_DEBUG.setTime(0.5); });
  await sleep(600);
  const vt = await ev(page, () => ({ test: DREvents.debug.test('Vines'), zone: DRWorld.zoneAt(DR.s.boat.x, DR.s.boat.z), cand: DREvents.candidates() }));
  ok(vt.test.ok && vt.zone === 'TWISTED_STRAND' && vt.cand.includes('Vines'), 'o Twisted Strand, sanity 0,1: Vines nam trong danh sach ung vien (' + vt.cand.join(',') + ')');
  const mz = await ev(page, () => { const b = DR.s.boat, save = [b.x, b.z]; DR_DEBUG.teleport(0, 0, 0); const r = DREvents.debug.test('Vines'); DR_DEBUG.teleport(save[0], save[1], b.yaw); return r; });
  ok(!mz.ok && mz.fails.includes('zone'), 'o ngoai Twisted Strand: Vines bi loai (' + mz.fails.join(',') + ')');
  await ev(page, () => { clearInterval(window.__sanI); window.__sanI = setInterval(() => { DR.s.sanity = 0.1; }, 50); window.__vl = []; window.__vrec = true;
    const f = () => { const v = DRTSHazards.debug.vines(); if (v) { const t = performance.now(); v.list.forEach((x, i) => { const L = window.__vl; if (!L[i]) L[i] = {}; if (!L[i][x.phase]) L[i][x.phase] = t; if (x.finished && !L[i].fin) L[i].fin = t; }); if (v.done) window.__vl.done = window.__vl.done || t; } requestAnimationFrame(f); }; f(); });
  const t0 = await ev(page, () => { const t = performance.now(); window.__vl.t0 = t; window.__ok = DRTSHazards.debug.forceVines(); return t; });
  const ver = await ev(page, () => ({ ok: window.__ok, cur: DREvents.current && DREvents.current.name, v: DRTSHazards.debug.vines() }));
  ok(ver.ok && ver.cur === 'Vines' && ver.v && ver.v.list.length === 4, 'DREvents.force("Vines") (cach R3 Mind Sucker goi o sanity <= 0,05): 4 vine song, currentEvent = Vines');
  await sleep(3200);
  const v3 = await ev(page, () => { const V = DRTSHazards.debug.vines(), b = DR.s.boat; return V && V.list.map(x => ({ n: x.name, ph: x.phase, d: Math.hypot(x.x - b.x, x.z - b.z), t: x.t })); });
  ok(v3 && v3.every(x => x.ph === 'spawn') && near(v3[1].d, Math.hypot(2, 5), 2.2), 'sau ~3 s ca 4 vine dang o clip Spawn; Vine2 bam theo thuyen toi anchor (2, 5) cach ' + (v3 && v3[1].d.toFixed(1)) + ' m');
  await shots(page, 'r4-vines');
  await shotsPhone(page, 'r4-vines');
  await page.waitForFunction(() => window.__vl.done, null, { timeout: 12000 }).catch(() => {});
  const vl = await ev(page, () => window.__vl.map(x => x));
  const vdone = await ev(page, () => ({ done: DRTSHazards.debug.log.vineDone, t0: window.__vl.t0, cur: DREvents.current && DREvents.current.name, v: DRTSHazards.debug.vines(), log: DRTSHazards.debug.log }));
  const evs = n => vdone.log.vine.filter(e => e.n === n && e.t >= vdone.t0);
  const st = ['Vine2', 'Vine3', 'Vine1', 'Vine4'].map(n => (evs(n).find(e => e.fn === 'StartTrackingPlayer').t - vdone.t0) / 1000);
  ok(st.every((t, k) => near(t, [0, 0.25, 0.5, 0.75][k], 0.2)), 'moi dong clip Spawn sau animationDelay: Vine2 0 s, Vine3 0,25 s, Vine1 0,5 s, Vine4 0,75 s (' + st.map(x => x.toFixed(2)).join(' / ') + ')');
  const fin = ['Vine1', 'Vine2', 'Vine3', 'Vine4'].map(n => (evs(n).find(e => e.fn === 'AttackFinished').t - evs(n).find(e => e.fn === 'StartTrackingPlayer').t) / 1000);
  ok(fin.every(x => near(x, 5.8333, 0.3)), 'moi dong AttackFinished sau 5,8333 s cua clip (' + fin.map(x => x.toFixed(2)).join(' / ') + ')');
  const strikes = ['Vine1', 'Vine2', 'Vine3', 'Vine4'].map(n => evs(n).filter(e => e.fn === 'PlaySplashEffect').length);
  ok(strikes.every(x => x === 1), 'moi dong danh 1 lan (PlaySplashEffect o 3,73 s): 4 cu danh (' + strikes.join(',') + ')');
  ok(vdone.done > vdone.t0 && near((vdone.done - vdone.t0) / 1000, 5.8333 + 0.75, 0.5) && vdone.v === null && vdone.cur === null, 'du 4 vine AttackFinished -> su kien ket thuc NGAY (khong Retract): ' + ((vdone.done - vdone.t0) / 1000).toFixed(2) + ' s, currentEvent null');
  ok(vdone.log.sfx.filter(k => k === 'tshazards.vine.whip').length === 1 && vdone.log.vfx.filter(k => k === 'TentacleBigSplash').length === 4, 'tieng roi chi o Vine1 (PlayAttackSFX x1); 4 lan PlaySplashEffect');
  ok(!vl.some(x => x && x.retract), 'khong dong nao chay Retract khi ket thuc tu nhien');
  // Xua duoi giua chung: Retract
  await ev(page, () => { window.__vl = []; window.__ok = DRTSHazards.debug.forceVines(); });
  await sleep(2500);
  await ev(page, () => { DR.emit('banish', true); });
  await sleep(300);
  const bv = await ev(page, () => DRTSHazards.debug.vines());
  ok(bv && bv.finishing && bv.list.every(x => x.phase === 'retract' || x.finished), 'Xua duoi (dispelByBanish): RequestEventFinish -> animator exit -> Retract (' + (bv && bv.list.map(x => x.phase).join(',')) + ')');
  await page.waitForFunction(() => !DRTSHazards.debug.vines(), null, { timeout: 6000 }).catch(() => {});
  ok(!(await ev(page, () => DRTSHazards.debug.vines())) && (await ev(page, () => DREvents.current)) === null, 'Retract 1,5833 s -> AttackFinished ca 4 -> su kien ket thuc');
  await ev(page, () => { DR.emit('banish', false); clearInterval(window.__sanI); });

  // ------------------------------------------------------------------ 7. loi trang
  ok(errors.length === 0, 'khong co loi trang / HTTP (' + errors.length + ')' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
  console.log('\n' + pass + ' dat, ' + fail + ' hong');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
