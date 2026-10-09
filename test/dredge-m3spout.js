/*
 * DREDGE - kiem don vi U8 (vong rong: js/waterspout.js, data/waterspout.js, tools/waterspout.py; MONSTERS.md 2.9 + 3.3).
 * Chay: node test/dredge-m3spout.js   (anh: %TEMP%/dredge-m3spout hoac SHOTS=...)
 * So goc: WaterspoutWorldEvent.cs + Waterspout(_Corrupt).prefab: toc do = min(maxSpeed, scalar * proportional * 10 * MoveMod), trung = ProcessHit 1 o,
 * itemAddChance 0,25, itemPool, finishDelaySec 2, durationSec 25 / 40 (worldevents), Banish dap tat vong ron hong.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m3spout');
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


// chỗ nước thoáng quanh bến Greater Marrow mà điểm sinh (70, 0, 50) / (-5, 0, 40) cục bộ đều đi được trên navmesh
async function findSea(page) {
  return page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 60; r <= 200; r += 10) for (let a = 0; a < 6.28; a += 0.2) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) < 20) continue;
      for (let yaw = 0; yaw < 6.28; yaw += 0.4) {
        DR_DEBUG.teleport(x, z, yaw);
        const b = DR.s.boat;
        const ok = [[70, 50], [-5, 40]].every(o => { const w = DREvents.offsetWorld(b, [o[0], 0, o[1]]); return DRNav.sample({ x: w[0], z: w[1] }, 5, 'generic') && DRNav.walkable(w[0], w[1], 'generic'); });
        const ahead = DRNav.walkable(x - Math.sin(yaw) * 22, z - Math.cos(yaw) * 22, 'generic');
        if (ok && ahead) return { x, z, yaw };
      }
    }
    return null;
  });
}

(async () => {
  const srv = await serve();
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);
  const at = await findSea(page);
  check('tìm được chỗ nước thoáng quanh Greater Marrow', !!at, JSON.stringify(at));
  const home = () => ev(a => { DR_DEBUG.teleport(a.x, a.z, a.yaw); }, at);
  const cur = () => ev(() => DRWaterspout.debug.state());
  const slots = () => ev(() => DR.grid('INVENTORY').damage.length);
  const fishCount = () => ev(() => DR.grid('INVENTORY').items.filter(i => /^(mackerel|cod)/.test(i.id)).map(i => i.id).sort().join(','));
  const clear = async () => { await ev(() => { const c = DREvents.current; if (c && c.handle.dispose) c.handle.dispose(); DR.grid('INVENTORY').damage.length = 0; DRBoat.refresh(); }); await sleep(250); };
  await ev(() => { DR.s.sanity = 0.5; DR_DEBUG.setTime(0.5); DR.s.worldPhase = 2; });
  await sleep(500); await home(); await ev(() => { DR.s.eventHistory = {}; });

  // ---------------------------------------------------------------- 1. dữ liệu gốc và tốc độ
  console.log('U8 dữ liệu và tốc độ');
  const W = await ev(() => DR_WATERSPOUT);
  check('prefab thường: MOVING 0,15 x 1,2, gia tốc 0,05, tối đa 10, chance 0,25, pool Blue Mackerel/Cod', W.Waterspout.mode === 'MOVING' && W.Waterspout.moveSpeedScalar === 0.15 && W.Waterspout.moveSpeedProportionalToPlayer === 1.2
    && W.Waterspout.accelerationFactor === 0.05 && W.Waterspout.maxSpeed === 10 && W.Waterspout.itemAddChance === 0.25 && W.Waterspout.itemPool.join() === 'mackerel,cod');
  check('prefab hỏng: CHASING x1,5, gia tốc 0,1, tối đa 25, repath 0,25 s, hạ tốc khi câu, 6 dị biến', W.Waterspout_Corrupt.mode === 'CHASING' && W.Waterspout_Corrupt.moveSpeedProportionalToPlayer === 1.5 && W.Waterspout_Corrupt.accelerationFactor === 0.1
    && W.Waterspout_Corrupt.maxSpeed === 25 && W.Waterspout_Corrupt.repathToPlayerInterval === 0.25 && W.Waterspout_Corrupt.capSpeedWhenHarvesting && W.Waterspout_Corrupt.itemPool.length === 6);
  check('cầu chạm r 0,5; finishDelaySec 2; âm thanh 5..75 m', W.Waterspout.hitRadius === 0.5 && W.Waterspout.finishDelaySec === 2 && W.Waterspout.audio.min === 5 && W.Waterspout.audio.max === 75);
  const sp = await ev(() => {
    const real = DRRules.stats, out = {};
    for (const mm of [0.5, 1, 3, 10, 12]) { DRRules.stats = (...a) => Object.assign({}, real(...a), { moveMod: mm }); out[mm] = [DRWaterspout.debug.speed('Waterspout'), DRWaterspout.debug.speed('Waterspout_Corrupt')]; }
    DRRules.stats = real; return out;
  });
  check('tốc độ = min(10, 1,8 MoveMod): 0,9 / 1,8 / 5,4 / 10', near(sp[0.5][0], 0.9, 1e-9) && near(sp[1][0], 1.8, 1e-9) && near(sp[3][0], 5.4, 1e-9) && sp[10][0] === 10, JSON.stringify(sp));
  check('vòi hỏng = min(25, 2,25 MoveMod): 1,125 / 2,25 / 6,75 / 22,5; trần 25 ở MoveMod 12', near(sp[0.5][1], 1.125, 1e-9) && near(sp[1][1], 2.25, 1e-9) && near(sp[3][1], 6.75, 1e-9) && near(sp[10][1], 22.5, 1e-9) && sp[12][1] === 25, JSON.stringify(sp));

  // ---------------------------------------------------------------- 2. sinh, di chuyển, tự tắt sau 25 s
  console.log('U8 vòi thường: sinh, di chuyển, hết giờ');
  await clear(); await home();
  await ev(() => { DREvents.debug.force('Waterspout'); });
  await sleep(600);
  const s0 = await cur();
  check('force Waterspout: sinh, là vòi MOVING, hạt sống', s0 && s0.name === 'Waterspout' && s0.mode === 'MOVING' && s0.fx, JSON.stringify(s0));
  const mm = await ev(() => DRRules.stats(DR_CONFIG, DR.grid('INVENTORY'), DR_ITEMS).moveMod);
  check('tốc độ tự do = min(10, 1,8 MoveMod); gia tốc = tốc độ x 0,05', s0 && near(s0.speed, Math.min(10, 1.8 * mm), 1e-9) && near(s0.accel, s0.speed * 0.05, 1e-9), s0 && `speed ${s0.speed} accel ${s0.accel}`);
  check('có đích và có đường đi', s0 && s0.left > 0 && Math.hypot(s0.dest.x - s0.x, s0.dest.z - s0.z) > 20, s0 && JSON.stringify({ left: s0.left, dest: s0.dest }));
  const d0 = await ev(() => { const I = DREvents.current.handle.inst; return { x: I.x, z: I.z }; });
  await sleep(5000);
  const s1 = await cur();
  check('sau 5 s: tăng tốc dần (0 < v <= tốc độ), đã dời chỗ', s1 && s1.v > 0 && s1.v <= s1.speed + 1e-9 && Math.hypot(s1.x - d0.x, s1.z - d0.z) > 0.05, s1 && JSON.stringify({ v: s1.v, moved: Math.hypot(s1.x - d0.x, s1.z - d0.z) }));
  await ev(() => { DREvents.current.handle.inst.age = 24.9; });         // gần hết giờ (durationSec 25): đi nhanh thay vì chờ
  await sleep(600);
  const s2 = await cur();
  check('quá 25 s: ngừng (finishing)', s2 && s2.finishing, JSON.stringify(s2));
  await sleep(2600);
  check('xong sau finishDelaySec 2 s: currentEvent = null', (await ev(() => DREvents.current)) === null);

  // ---------------------------------------------------------------- 3. chạm: +1 ô, vật nhặt theo Random
  console.log('U8 chạm');
  for (const [r, want] of [[0.1, true], [0.9, false]]) {
    await clear(); await home(); await sleep(1700);                 // quá 1,5 s kể từ cú trước (invulnerabilityTimeInSeconds)
    await ev(() => { DREvents.debug.force('Waterspout'); });
    await sleep(400);
    const f0 = await fishCount(), n0 = await slots();
    await ev(rr => { window.__rnd0 = window.__rnd0 || Math.random; Math.random = () => rr; const I = DREvents.current.handle.inst, b = DR.s.boat; I.x = b.x; I.z = b.z; }, r);
    await sleep(500);
    await ev(() => { Math.random = window.__rnd0; });
    const f1 = await fishCount(), n1 = await slots(), st = await cur();
    check('chạm thuyền: +1 ô hỏng (ProcessHit)', n1 === n0 + 1, `${n0} -> ${n1}`);
    const cnt = s => (s ? s.split(',').length : 0);
    check('Random ' + r + (want ? ' < 0,25: có Blue Mackerel hoặc Cod' : ' >= 0,25: không có vật'), want ? (cnt(f1) === cnt(f0) + 1 && /mackerel|cod/.test(f1)) : f1 === f0, `${f0 || '-'} -> ${f1 || '-'}`);
    check('trúng một lần rồi vòi tắt (finishing)', st && st.finishing && st.lastHit && st.lastHit.hurt === true, JSON.stringify(st && st.lastHit));
  }

  // ---------------------------------------------------------------- 4. vòi hỏng: đuổi theo thuyền, Banish dập tắt
  console.log('U8 vòi hỏng');
  await clear(); await home(); await ev(() => { DREvents.debug.force('Waterspout_Corrupt'); });
  await sleep(500);
  const c0 = await cur();
  check('vòi hỏng: CHASING, tốc độ tự do = min(25, 2,25 MoveMod)', c0 && c0.name === 'Waterspout_Corrupt' && c0.mode === 'CHASING' && near(c0.speed, Math.min(25, 2.25 * mm), 1e-9), JSON.stringify(c0));
  const dist = () => ev(() => { const I = DREvents.current && DREvents.current.handle.inst, b = DR.s.boat; return I ? Math.hypot(I.x - b.x, I.z - b.z) : null; });
  const e0 = await dist(); await sleep(7000); const e1 = await dist();
  check('đuổi theo thuyền đang đứng yên: khoảng cách giảm sau 7 s (hoặc đã trúng)', e1 == null || e1 < e0 - 0.3, `${e0.toFixed(1)} -> ${e1 == null ? 'xong' : e1.toFixed(1)}`);
  await clear(); await home(); await ev(() => { DREvents.debug.force('Waterspout_Corrupt'); });
  await sleep(300);
  await ev(() => { DR.emit('banish', true); });
  await sleep(500);
  const bs = await cur();
  check('Banish: vòi hỏng ngừng ngay (finishing)', bs && bs.finishing, JSON.stringify(bs));
  await sleep(2600);
  check('... rồi biến mất sau 2 s', (await ev(() => DREvents.current)) === null);
  await ev(() => DR.emit('banish', false));
  await clear(); await home();
  await ev(() => { DREvents.debug.force('Waterspout_Corrupt'); });
  await sleep(300);
  const ab0 = await ev(() => DR.grid('INVENTORY').items.filter(i => /-ab-/.test(i.id)).length);
  await ev(() => { window.__rnd0 = window.__rnd0 || Math.random; Math.random = () => 0.05; const I = DREvents.current.handle.inst, b = DR.s.boat; I.x = b.x; I.z = b.z; });
  await sleep(500);
  await ev(() => { Math.random = window.__rnd0; });
  const ab = await ev(() => DR.grid('INVENTORY').items.filter(i => /-ab-/.test(i.id)).map(i => i.id));
  check('vòi hỏng + Random 0,05: nhận một cá dị biến (Mackerel/Cod Aberration)', ab.length === ab0 + 1 && /^(mackerel|cod)-ab-[123]$/.test(ab[ab.length - 1]), JSON.stringify(ab));

  // ---------------------------------------------------------------- 5. ảnh
  console.log('U8 ảnh');
  for (const [kind, name] of [['Waterspout', ''], ['Waterspout_Corrupt', '-corrupt']]) {
    for (const [tag, W2, H2] of [['1280', 1280, 720], ['844', 844, 390]]) {
      await clear(); await home();
      await page.setViewportSize({ width: W2, height: H2 });
      await ev(k => { DR_DEBUG.setTime(0.5); DR.setMode('sail'); DREvents.debug.force(k); }, kind);
      await sleep(500);
      await ev(() => { const I = DREvents.current.handle.inst, b = DR.s.boat; I.x = b.x - Math.sin(b.yaw) * 22; I.z = b.z - Math.cos(b.yaw) * 22; I.v = 0; I.speed = 0; I.dest = { x: I.x + 1000, z: I.z }; I.dur = 999; I.path = null; I.P = Object.assign({}, I.P, { capSpeedWhenHarvesting: false }); });
      await ev(() => { document.querySelectorAll('[class*=banner],[id*=banner],.hud-toast,#dr-tut').forEach(e => e.remove()); });   // banner hướng dẫn / loài mới che ảnh
      await sleep(3500);
      await page.screenshot({ path: path.join(SHOTS, 'waterspout' + name + '-' + tag + '.png') });
      const vis = await cur();
      check('ảnh ' + kind + ' ' + tag + ': vòi đang sống trước thuyền', vis && !vis.finishing && vis.fx, JSON.stringify(vis && { x: vis.x, z: vis.z, fx: vis.fx }));
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await clear();

  const perf = await ev(() => DR_DEBUG.perf());
  console.log('  perf 1280x720: avgMs ' + perf.avgMs.toFixed(2) + ' cpuMs ' + perf.cpuMs.toFixed(2));
  check('không có lỗi trang / console / HTTP >= 400', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' ; '));
  await browser.close(); srv.close();
  console.log('m3spout: ' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
