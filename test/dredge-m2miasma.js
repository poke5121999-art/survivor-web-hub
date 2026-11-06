/*
 * DREDGE - kiem U3 miasma (js/miasma.js, tools/miasma.py, data/miasma.js; MONSTERS.md muc 2.2 va 3.3).
 * Chay: node test/dredge-m2miasma.js   (anh: %TEMP%/dredge-m2miasma hoac SHOTS=...)
 * So goc: FogDevil.cs (speed 0,15 / chaseDistance 20 / spawnDistance 50 +- 30 / vong cung 60 do / appear 0,84 / disappear 0,17 / thu moi 1 s),
 * chaseColor (0,764151; 0,29644856; 0,29196337), idleColor (1,1,1,0,9647059), SanityModifier con (dem -10 trong 2 m, 0 o 10 m),
 * globalSanityModifier 0,015 (=> -0,15/s o loi), ve spawnPos 2 m/s, FogDevil.cs:136-147 (_NeutralAmount 0 trong 0,1 s / 1 trong 1 s).
 */
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m2miasma');
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


// diem nuoc thoang: moi diem cach 20/50/80 m theo 12 huong deu co do dac mat na song >= 0,1 (de FogDevil khong bi loai o buoc steep01)
async function openWater(page) {
  return page.evaluate(() => {
    for (let x = -200; x <= 400; x += 25) for (let z = -300; z <= 200; z += 25) {
      if (DRWorld.sdf(x, z) < 120) continue;
      let ok = true;
      for (const r of [20, 50, 80]) for (let a = 0; a < 12 && ok; a++) {
        const px = x + Math.cos(a * Math.PI / 6) * r, pz = z + Math.sin(a * Math.PI / 6) * r;
        if (DRWorld.sdf(px, pz) < 5 || DRWorld.steep01(px, pz) < 0.1) ok = false;
      }
      if (ok) return { x, z, steep: DRWorld.steep01(x, z), zone: DRWorld.zoneAt(x, z) };
    }
    return null;
  });
}

(async () => {
  const srv = await serve();
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);

  const spot = await openWater(page);
  check('tim duoc vung nuoc thoang cho FogDevil', !!spot, JSON.stringify(spot));
  const place = yaw => ev(a => { DR_DEBUG.teleport(a.x, a.z, a.yaw); DR.s.dock = null; }, { x: spot.x, z: spot.z, yaw });
  await place(0.7);
  check('du lieu: 2 FogDevil, pha 1 va 3, (100,75) va (100,0) theo Unity', await ev(() => {
    const d = DR_MIASMA.instances;
    return d.length === 2 && d[0].phase === 1 && d[1].phase === 3 && d[0].x === 100 && d[0].z === -75 && d[1].x === 100 && d[1].speed === 0.15 && d[0].spawnDistance === 50 && d[0].chaseDistance === 20;
  }));

  // ---------------------------------------------------------------- 1. pha 0 ban dem: khong sinh; pha 1: sinh trong 20-80 m, +-60 do
  console.log('U3 sinh');
  await ev(() => { DRMiasma.debug.reset(); DR.s.worldPhase = 0; DR.s.sanity = 0.9; DR_DEBUG.setTime(0.9); DRBoat.setLights(false); });
  await sleep(3000);
  check('pha 0, 0,9 (21:36): chua sinh sau 3 s', (await ev(() => DRMiasma.debug.inst(0).state)) === 'NOT_SPAWNED');
  await ev(() => { DR.s.worldPhase = 1; });
  await sleep(2600);
  const s1 = await ev(() => ({ a: DRMiasma.debug.inst(0), b: DRMiasma.debug.inst(1), p: DR.s.boat }));
  check('pha 1: FogDevil (pha 1) da SPAWNED, FogDevil (1) (pha 3) van NOT_SPAWNED', s1.a.state === 'SPAWNED' && s1.b.state === 'NOT_SPAWNED', s1.a.state + '/' + s1.b.state);
  // thong ke nhieu lan sinh (rand that), moi lan reset roi step 1,1 s
  const st = await ev(() => {
    const out = [], b = DR.s.boat, fw = [-Math.sin(b.yaw), -Math.cos(b.yaw)];
    for (let k = 0; k < 60; k++) {
      DRMiasma.debug.reset();
      DRMiasma.debug.step(1.1);
      const i = DRMiasma.debug.inst(0);
      if (i.state !== 'SPAWNED') continue;
      const dx = i.x - b.x, dz = i.z - b.z, d = Math.hypot(dx, dz);
      out.push({ d, ang: Math.acos(Math.max(-1, Math.min(1, (dx * fw[0] + dz * fw[1]) / d))) * 180 / Math.PI });
    }
    return out;
  });
  const dmin = Math.min(...st.map(s => s.d)), dmax = Math.max(...st.map(s => s.d)), amax = Math.max(...st.map(s => s.ang));
  check('60 lan sinh deu thanh cong o vung thoang (' + st.length + ')', st.length === 60);
  check('khoang cach sinh trong [20, 80] m', dmin >= 19.99 && dmax <= 80.01, dmin.toFixed(1) + '..' + dmax.toFixed(1));
  check('lech huong mui <= 60 do', amax <= 60.01, 'max ' + amax.toFixed(1));
  check('khoang cach trai rong (co ca < 35 va > 65 m) nhu 50 +- 30', dmin < 35 && dmax > 65, dmin.toFixed(1) + '..' + dmax.toFixed(1));
  // buoc loai steep01 < 0,05: ep steep01 = 0,01 -> khong sinh
  const rej = await ev(() => {
    const keep = DRWorld.steep01; DRWorld.steep01 = () => 0.01;
    DRMiasma.debug.reset(); DRMiasma.debug.step(1.1); DRMiasma.debug.step(1.1);
    const s = DRMiasma.debug.inst(0).state; DRWorld.steep01 = keep;
    return s;
  });
  check('steep01 < 0,05 tai diem sinh -> bi loai, van ATTEMPTING_TO_SPAWN', rej === 'ATTEMPTING_TO_SPAWN', rej);
  await ev(() => { DRMiasma.debug.reset(); });
  await sleep(1800);
  check('sau reset va dem: sinh lai', (await ev(() => DRMiasma.debug.inst(0).state)) === 'SPAWNED');

  // ---------------------------------------------------------------- 2. den bat + thuyen 10 m tu spawnPos -> duoi theo, mau chaseColor
  console.log('U3 duoi theo');
  await ev(() => DRBoat.setLights(true));
  await sleep(500);
  await ev(() => {
    const i = DRMiasma.debug.inst(0);
    DR_DEBUG.teleport(i.spawnX + 10, i.spawnZ, DR.s.boat.yaw);
  });
  await sleep(700);
  const ch = await ev(() => ({ i: DRMiasma.debug.inst(0), b: DR.s.boat }));
  check('den bat + 10 m tu spawnPos -> chasing', ch.i.chasing === true && ch.i.aggro === true);
  const cc = ch.i.color, ec = [0.764151, 0.29644856, 0.29196337, 1];
  check('mau hat = chaseColor (0,76; 0,30; 0,29)', cc.every((v, k) => Math.abs(v - ec[k]) < 1e-4), JSON.stringify(cc));
  check('toi da 5 hat, tuoi x0,1, SanityModifier bat', ch.i.maxParticles === 5 && Math.abs(ch.i.lifeMul - 0.1) < 1e-9 && ch.i.sanityOn === true, JSON.stringify([ch.i.maxParticles, ch.i.lifeMul, ch.i.sanityOn]));
  check('_NeutralAmount ve 0 (DOFloat 0,1 s)', ch.i.neutral < 0.01, String(ch.i.neutral));
  check('noise = invLerp(20,0,d)*3 (thuyen cach FogDevil ~10 m -> ~1,5)', Math.abs(ch.i.noise - 3 * (1 - Math.hypot(ch.b.x - ch.i.x, ch.b.z - ch.i.z) / 20)) < 0.4, ch.i.noise.toFixed(2));
  // toc do duoi theo: MoveMod * 0,15 * invLerp(20,0,d)
  const mv = await ev(async () => {
    const i = DRMiasma.inst[0], b = DR.s.boat;
    DR_DEBUG.teleport(i.x + 10, i.z, b.yaw);               // d = 10 -> k = 0,5
    const x0 = i.x, z0 = i.z, t0 = performance.now();
    await new Promise(r => setTimeout(r, 3000));
    const dt = (performance.now() - t0) / 1000, b2 = DR.s.boat;
    return { v: Math.hypot(i.x - x0, i.z - z0) / dt, mm: DRBoat.stats.moveMod, d1: 10, d2: Math.hypot(b2.x - i.x, b2.z - i.z) };
  });
  const kAvg = 1 - (mv.d1 + mv.d2) / 2 / 20;
  check('toc do duoi theo ~ MoveMod*0,15*invLerp(20,0,d) = ' + (mv.mm * 0.15 * kAvg).toFixed(3) + ' m/s', Math.abs(mv.v - mv.mm * 0.15 * kAvg) < 0.12, 'do duoc ' + mv.v.toFixed(3));

  // ---------------------------------------------------------------- 3. hoang loan o loi: -10 * 0,015 = -0,15/s * tmod
  console.log('U3 hoang loan');
  const run = on => ev(async on => {
    const i = DRMiasma.inst[0];
    DR.s.sanity = 0.9; DR_DEBUG.setTime(0.9);
    await new Promise(r => setTimeout(r, 200));
    i.spawnX = i.x; i.spawnZ = i.z;                        // giu dang duoi
    const s0 = DR.s.sanity; let tm = 0, n = 0; const t0 = performance.now();
    for (let k = 0; k < 40; k++) {                          // 4 s, ep thuyen ve loi moi 100 ms (<= 2 m) khi dang di
      DR_DEBUG.teleport(i.x + (on ? 0.5 : 40), i.z, DR.s.boat.yaw);   // tat = cach 40 m (ngoai 10 m cua SanityModifier, ngoai 20 m nen khong duoi)
      await new Promise(r => setTimeout(r, 100));
      tm += DRSky.env.timeMod; n++;
    }
    const dt = (performance.now() - t0) / 1000;
    return { d: DR.s.sanity - s0, dt, tm: tm / n };
  }, on);
  // thuyen phai thuc su di: giu W
  await page.keyboard.down('KeyW');
  const A = await run(true), B = await run(false);
  await page.keyboard.up('KeyW');
  const diffRate = (A.d / A.dt - B.d / B.dt);
  const tmod = (A.tm + B.tm) / 2;
  console.log('  sanity bat ' + A.d.toFixed(4) + '/' + A.dt.toFixed(1) + 's, tat ' + B.d.toFixed(4) + '/' + B.dt.toFixed(1) + 's, tmod ' + tmod.toFixed(3));
  check('thuyen dang di (timeMod > 0)', tmod > 0.1, tmod.toFixed(3));
  check('SanityModifier o loi: chenh lech ~ -0,15/s x timeMod', tmod > 0.1 && Math.abs(diffRate / tmod + 0.15) < 0.03, (diffRate / tmod).toFixed(4) + ' (mong -0,15)');

  // ---------------------------------------------------------------- 4. den tat -> ve spawnPos 2 m/s, mau idle, 2 hat
  console.log('U3 ve cho cu');
  await ev(() => { const i = DRMiasma.inst[0]; DR_DEBUG.teleport(i.spawnX + 25, i.spawnZ, 0); });
  await ev(() => { const i = DRMiasma.inst[0]; i.x = i.spawnX + 20; i.z = i.spawnZ; DRBoat.setLights(false); });
  await sleep(250);
  const h = await ev(async () => {
    const i = DRMiasma.inst[0], x0 = i.x, z0 = i.z, t0 = performance.now();
    await new Promise(r => setTimeout(r, 2000));
    const dt = (performance.now() - t0) / 1000;
    return { v: Math.hypot(i.x - x0, i.z - z0) / dt, info: DRMiasma.debug.inst(0) };
  });
  check('den tat: troi ve spawnPos 2 m/s', Math.abs(h.v - 2) < 0.25, h.v.toFixed(3) + ' m/s');
  check('den tat: khong duoi, SanityModifier tat, toi da 2 hat, mau idleColor (1,1,1,0,9647)', !h.info.chasing && !h.info.sanityOn && h.info.maxParticles === 2 && Math.abs(h.info.color[3] - 0.9647059) < 1e-5 && h.info.color[0] === 1, JSON.stringify(h.info.color));
  await sleep(1000);
  check('_NeutralAmount len 1 trong 1 s (xam)', (await ev(() => DRMiasma.debug.inst(0).neutral)) > 0.99);

  // ---------------------------------------------------------------- 5. sang ngay: huy; pha 3: ca hai
  console.log('U3 ban ngay va pha 3');
  await place(0.7);
  await ev(() => { DR_DEBUG.setTime(0.5); });
  await sleep(500);
  const dn = await ev(() => DRMiasma.debug.inst(0));
  check('0,5 (12:00): DESPAWNING, phat hat tat', dn.state === 'DESPAWNING' && dn.emitting === false, dn.state);
  await sleep(2000);
  const dn2 = await ev(() => DRMiasma.debug.inst(0));
  check('sau ~1,5 s: NOT_SPAWNED, SanityModifier tat, tieng 0', dn2.state === 'NOT_SPAWNED' && !dn2.sanityOn && dn2.volume === 0, JSON.stringify([dn2.state, dn2.sanityOn, dn2.volume]));
  await ev(() => { DR.s.worldPhase = 3; DR_DEBUG.setTime(0.1); });                  // 02:24 < 0,17
  await sleep(2800);
  const both = await ev(() => [DRMiasma.debug.inst(0).state, DRMiasma.debug.inst(1).state]);
  check('pha 3, 0,1 (02:24): ca hai SPAWNED', both[0] === 'SPAWNED' && both[1] === 'SPAWNED', both.join('/'));
  await ev(() => { DR_DEBUG.setTime(0.2); });                                         // 04:48 > 0,17
  await sleep(500);
  check('0,2 (04:48): ca hai DESPAWNING (disappearTime 0,17)', (await ev(() => [DRMiasma.debug.inst(0).state, DRMiasma.debug.inst(1).state])).every(s => s === 'DESPAWNING'));

  // ---------------------------------------------------------------- 6. anh chup tren man hinh
  console.log('U3 anh chup');
  const shot = async (name, W, H) => {
    await page.setViewportSize({ width: W, height: H });
    await ev(() => { DRMiasma.debug.reset(); DR.s.worldPhase = 1; DR.s.sanity = 0.9; DR_DEBUG.setTime(0.9); DRBoat.setLights(true); });
    await sleep(300);
    await place(0.7);
    await sleep(1800);                                                               // sinh
    await ev(() => {
      const i = DRMiasma.inst[0], b = DR.s.boat, f = [-Math.sin(b.yaw), -Math.cos(b.yaw)];
      i.x = i.spawnX = b.x + f[0] * 11; i.z = i.spawnZ = b.z + f[1] * 11;            // truoc mui 11 m (trong 20 m: duoi theo)
    });
    await sleep(3500);
    await ev(() => { const t = document.getElementById('dr-tut'); if (t) t.style.display = 'none'; });   // an hop huong dan de thay quai
    await sleep(300);
    await page.screenshot({ path: path.join(SHOTS, name) });
    return ev(() => ({ i: DRMiasma.debug.inst(0), st: DRParticles.stats().byName.FogDevilParticles }));
  };
  const i1 = await shot('miasma-1280.png', 1280, 720);
  console.log('  1280: ' + JSON.stringify(i1.i).slice(0, 260) + ' ' + JSON.stringify(i1.st));
  const i2 = await shot('miasma-844.png', 844, 390);
  console.log('  844: state ' + i2.i.state + ' hat ' + i2.i.particles);
  check('anh: FogDevil dang SPAWNED va co hat tren man', i1.i.state === 'SPAWNED' && i1.i.particles > 0, i1.i.particles + ' hat');
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------------------------------------------------------------- perf + loi
  await ev(() => { DR.s.worldPhase = 0; DR.s.sanity = 1; DR_DEBUG.setTime(0.5); });
  await sleep(3000);
  const perf = await ev(() => DR_DEBUG.perf());
  console.log('  perf 1280x720: avgMs ' + perf.avgMs.toFixed(2) + ' cpuMs ' + perf.cpuMs.toFixed(2));
  check('khong co loi trang / console / HTTP >= 400', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' ; '));
  await browser.close(); srv.close();
  console.log('m2miasma: ' + pass + ' pass, ' + fail + ' fail  (anh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
