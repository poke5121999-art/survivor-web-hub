/*
 * DREDGE - kiem don vi U1 cua MONSTERS.md: Night Angler (js/angler.js, data/angler.js tu tools/angler.py).
 * Chay: node test/dredge-m2angler.js   (anh: %TEMP%/dredge-m2angler hoac SHOTS=...)
 * So goc: MonoBehaviour/MarrowMonster.asset (worldPhaseMin 1, spawnTime 0,85, despawnTime 0,15, spawnMinDistance 50, idleDepth 1,8,
 * disappearDepth 3), Game.unity Logic/MonsterManager (secondsBetweenChecks 3, maxSpawned 1, path[4] = (-28,1, -58,8) va (84,0, 242,7) Unity
 * = (-28,1, 58,8) va (84,0, -242,7) three.js), MonsterManager.cs:72-75 + 110-170, MarrowMonster.cs:212-351 + 475-483, MarrowMonster.prefab
 * (attackDistanceThreshold 6, VariablePlayerDamager damagePoints 2, requireOneHealthToKill 0), TimeController duskTime 0,75.
 * Hang U1 cua MONSTERS.md §3.3: phase 0 -> khong angler sau 10 s; phase 1 -> 2 con trong 3 s o path[4] tru khi thuyen < 50 m; gio 0,16 -> lan di;
 * thuyen cach 5 m, tam nhin thong -> +2 o hong roi lan; khong sinh lai toi khi gio qua 0,75; Banish -> lan.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m2angler');
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
  // ghi lại sự kiện do angler / thuyền phát
  await page.evaluate(() => {
    window.__ev = { spawned: [], hits: [], banished: [], despawn: [] };
    DR.on('anglerSpawned', e => __ev.spawned.push(Object.assign({ t: DR.s.time }, e)));
    DR.on('monsterHit', e => __ev.hits.push(e));
    DR.on('threatBanished', e => __ev.banished.push(e));
    DR.on('anglerDespawn', e => __ev.despawn.push(e));
  });
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

const A4 = [-28.1, 58.8], B4 = [84.0, -242.7];      // path[4] của hai cấu hình (three.js)
const FAR = [A4[0] + 70, A4[1]];                     // nước cách A4 70 m, cách B4 > 300 m
const list = page => page.evaluate(() => DRAngler.debug.list());
const mgr = page => page.evaluate(() => DRAngler.debug.manager());

// đặt thuyền cách con angler cfg một khoảng d theo hướng nó đang bơi, mũi thuyền quay về phía nó
async function faceAngler(page, cfg, d) {
  return page.evaluate(([cfg, d]) => {
    const a = DRAngler.debug.list().find(m => m.cfg === cfg);
    if (!a) return null;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.6, -1.6, 3.14]) {
      const c = Math.cos(turn), s = Math.sin(turn), gx = fx * c - fz * s, gz = fx * s + fz * c;
      const x = a.x + gx * d, z = a.z + gz * d;
      if (DR_DEBUG.sdf(x, z) > 4 && DRAngler.debug.los(a.x, a.z, x, z)) {
        DR_DEBUG.teleport(x, z, Math.atan2(gx, gz));                     // mũi thuyền (−sin yaw, −cos yaw) = −g: nhìn về con quái
        return { x, z, a };
      }
    }
    return null;
  }, [cfg, d]);
}
// điểm nước cách (x, z) đúng r mét
async function waterAt(page, x, z, r) {
  return page.evaluate(([x, z, r]) => {
    for (let a = 0; a < 6.28; a += 0.2) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (DR_DEBUG.sdf(px, pz) > 10) return [px, pz]; }
    return null;
  }, [x, z, r]);
}

async function run(browser, base) {
  const W = 1280, H = 720;
  const { page, errors } = await boot(browser, base, W, H);
  const shot = n => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + n + '.png') });

  // ---- dữ liệu sinh ra
  const d = await page.evaluate(() => ({ data: DR_ANGLER.data, mm: DR_ANGLER.monster, dmg: DR_ANGLER.damager, mgr: DR_ANGLER.manager, ok: !!window.DRAngler }));
  check('data: MarrowMonster.asset worldPhaseMin 1 / spawn 0,85 / despawn 0,15 / minDist 50 / idleDepth 1,8 / disappear 3',
    d.data.worldPhaseMin === 1 && d.data.spawnTime === 0.85 && d.data.despawnTime === 0.15 && d.data.spawnMinDistance === 50 && d.data.idleDepth === 1.8 && d.data.disappearDepth === 3);
  check('data: MonsterManager secondsBetweenChecks 3, 2 cấu hình maxSpawned 1 × 10 điểm', d.mgr.secondsBetweenChecks === 3 && d.mgr.configs.length === 2 &&
    d.mgr.configs.every(c => c.maxSpawned === 1 && c.path.length === 10));
  check('data: path[4] = (−28,1, 58,8) và (84,0, −242,7)', near(d.mgr.configs[0].path[4][0], A4[0], 0.05) && near(d.mgr.configs[0].path[4][1], A4[1], 0.05) &&
    near(d.mgr.configs[1].path[4][0], B4[0], 0.05) && near(d.mgr.configs[1].path[4][1], B4[1], 0.05), JSON.stringify(d.mgr.configs.map(c => c.path[4])));
  check('data: tấn công < 6 m, 2 điểm, không requireOneHealthToKill', d.mm.attackDistanceThreshold === 6 && d.dmg.damagePoints === 2 && d.dmg.requireOneHealthToKill === 0);

  // ---- 1. phase 0, giờ 0,9: không có angler sau 10 s
  await page.evaluate(f => { DR.s.worldPhase = 0; DR_DEBUG.setTime(0.9); DR_DEBUG.teleport(f[0], f[1], 0); }, FAR);
  await page.mouse.click(W / 2, H / 2 + 200); await sleep(10000);
  let m = await mgr(page), l = await list(page);
  check('phase 0, giờ 0,9: không angler sau 10 s', l.length === 0 && m.counts.every(c => c === 0), JSON.stringify(m));

  // ---- 2. phase 1: hai con trong 3 s ở path[4]
  await page.evaluate(() => { DR.s.worldPhase = 1; __ev.spawned.length = 0; });
  const t0 = Date.now();
  await page.waitForFunction(() => __ev.spawned.length >= 2, null, { timeout: 8000 }).catch(() => {});
  const dt0 = (Date.now() - t0) / 1000;
  let sp = await page.evaluate(() => __ev.spawned.slice());
  check('phase 1: 2 angler trong 3 s', sp.length === 2 && dt0 <= 3.3, 'n=' + sp.length + ' sau ' + dt0.toFixed(2) + ' s');
  const a0 = sp.find(e => e.cfg === 0), b0 = sp.find(e => e.cfg === 1);
  check('sinh ở path[4]: A (−28,1, 58,8), B (84,0, −242,7)', a0 && b0 && near(a0.x, A4[0], 0.01) && near(a0.z, A4[1], 0.01) && near(b0.x, B4[0], 0.01) && near(b0.z, B4[1], 0.01),
    JSON.stringify(sp.map(e => [e.x, e.z])));
  await sleep(2500);
  l = await list(page);
  check('nổi cân bằng 0,9 m dưới mặt nước (BuoyantObject strength 2 / objectDepth 1,8)', l.length === 2 && l.every(a => near(a.y, -0.9, 0.05)), JSON.stringify(l.map(a => a.y)));
  check('tuần tra: tốc độ = 0,15 · clamp(0,7 × 10, 30, 45) = 4,5 m/s', l.every(a => near(a.speed, 4.5, 0.3) && !a.seek), JSON.stringify(l.map(a => a.speed.toFixed(2))));
  // ảnh: quái trên màn hình (cách ~30 m, đêm)
  await faceAngler(page, 0, 30); await sleep(700);
  await shot('angler-30m');
  console.log('  1280x720: angler ở điểm ảnh ' + (await page.evaluate(() => { const a = DRAngler.debug.list().find(m => m.cfg === 0), v = new THREE.Vector3(a.x, 1.5, a.z).project(DRCamera.cam);
    return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; })).join(', '));

  // ---- 3. thuyền < 50 m quanh path[4] → điểm khác của đường, cách ≥ 50 m
  await page.evaluate(a => { DRAngler.debug.clear(); __ev.spawned.length = 0; DR_DEBUG.teleport(a[0], a[1] + 2, 0); }, A4);
  await page.waitForFunction(() => __ev.spawned.some(e => e.cfg === 0), null, { timeout: 6000 }).catch(() => {});
  sp = await page.evaluate(() => __ev.spawned.slice());
  const a1 = sp.find(e => e.cfg === 0), pathA = d.mgr.configs[0].path;
  check('thuyền cách path[4] < 50 m: sinh ở điểm khác của đường, cách thuyền ≥ 50 m', !!a1 && pathA.some(p => near(p[0], a1.x, 0.01) && near(p[1], a1.z, 0.01)) &&
    !(near(a1.x, A4[0], 0.01) && near(a1.z, A4[1], 0.01)) && Math.hypot(a1.x - A4[0], a1.z - A4[1] - 2) >= 50, a1 ? [a1.x, a1.z].join(', ') : 'không sinh');

  // ---- 4. tầm nhìn: đảo chặn
  const losLand = await page.evaluate(() => {
    const g = DRDocks.byId['dock.greater-marrow'].poi;   // một điểm trong đất gần bến Greater Marrow, rồi hai điểm nước hai bên nó
    for (let r = 0; r < 300; r += 5) for (let a = 0; a < 6.28; a += 0.3) {
      const cx = g.x + Math.cos(a) * r, cz = g.z + Math.sin(a) * r;
      if (DR_DEBUG.sdf(cx, cz) > -4) continue;
      const side = s => { for (let k = 1; k < 120; k++) { const x = cx + s * k, z = cz; if (DR_DEBUG.sdf(x, z) > 3) return [x + s * 2, z]; } return null; };
      const p = side(-1), q = side(1);
      if (p && q) return { blocked: !DRAngler.debug.los(p[0], p[1], q[0], q[1]), open: DRAngler.debug.los(p[0], p[1], p[0], p[1] + 0.5), p, q };
    }
    return null;
  });
  check('tầm nhìn: đảo chặn tia (RangeSensor RequiresLineOfSight, layer 7/15)', losLand && losLand.blocked, JSON.stringify(losLand));

  // ---- 5. thuyền 5 m, tầm nhìn thông → săn → cắn: +2 ô hỏng, rồi lặn
  await page.evaluate(() => { DRAngler.debug.clear(); __ev.spawned.length = 0; __ev.hits.length = 0; __ev.despawn.length = 0; });
  await page.evaluate(f => DR_DEBUG.teleport(f[0], f[1], 0), FAR);
  await page.waitForFunction(() => DRAngler.debug.list().some(m => m.cfg === 0), null, { timeout: 6000 }).catch(() => {});
  await sleep(1500);
  const dmg0 = await page.evaluate(() => DR.grid('INVENTORY').damage.length);
  const placed = await faceAngler(page, 0, 5);
  check('đặt thuyền cách angler 5 m, tia nhìn thông', !!placed, placed ? 'boat ' + placed.x.toFixed(1) + ',' + placed.z.toFixed(1) : '');
  let attackShot = false, hit = null;
  const tA = Date.now();
  while (Date.now() - tA < 9000) {
    const s = await page.evaluate(() => ({ l: DRAngler.debug.list().find(m => m.cfg === 0), hits: __ev.hits.slice() }));
    if (!attackShot && s.l && s.l.state === 'MarrowMonster_Attack') { attackShot = true; await shot('angler-attack'); }
    if (s.hits.length) { hit = s; break; }
    await sleep(100);
  }
  const dmg1 = await page.evaluate(() => DR.grid('INVENTORY').damage.length);
  check('săn + cắn: monsterHit 2 điểm từ MarrowMonster', !!hit && hit.hits[0].points === 2 && hit.hits[0].source === 'MarrowMonster', hit ? JSON.stringify(hit.hits[0]) : 'không trúng sau 9 s');
  check('+2 ô hỏng (VariablePlayerDamager 2, không miễn sát thương)', dmg1 - dmg0 === 2, dmg0 + ' → ' + dmg1);
  await sleep(700);
  l = await list(page);
  const ang = l.find(a => a.cfg === 0);
  check('trúng đòn: 0,5 s sau thì lặn (Despawn, flee về path[0])', ang && ang.despawning && ang.flee, ang ? JSON.stringify({ despawning: ang.despawning, flee: ang.flee, y: ang.y }) : 'mất');
  m = await mgr(page);
  check('MonsterManager: canSpawn = false sau cú cắn', m.canSpawn === false, JSON.stringify(m));
  // đưa thuyền ra xa > 50 m để con angler bị huỷ (≥ 5 s và cách thuyền > despawnDistanceThreshold)
  const away = await waterAt(page, ang ? ang.x : 0, ang ? ang.z : 0, 120);
  await page.evaluate(p => { DR_DEBUG.teleport(p[0], p[1], 0); __ev.spawned.length = 0; }, away);
  await sleep(6500);
  l = await list(page);
  check('huỷ sau ≥ 5 s khi cách thuyền > 50 m', !l.some(a => a.cfg === 0), JSON.stringify(l.map(a => [a.cfg, a.despawnTimer.toFixed(1)])));
  await sleep(4000);
  sp = await page.evaluate(() => __ev.spawned.slice());
  check('giờ vẫn 0,9 nhưng không sinh lại trong ≥ 3 lượt kiểm (10 s)', sp.length === 0, 'spawned ' + sp.length);
  await page.evaluate(() => DR_DEBUG.setTime(0.74)); await sleep(400);
  await page.evaluate(() => DR_DEBUG.setTime(0.9));
  await page.waitForFunction(() => __ev.spawned.length > 0, null, { timeout: 5000 }).catch(() => {});
  m = await mgr(page); sp = await page.evaluate(() => __ev.spawned.slice());
  check('giờ qua 0,75 (hoàng hôn) → canSpawn, sinh lại', m.canSpawn === true && sp.some(e => e.cfg === 0), JSON.stringify({ m, sp: sp.length }));

  // ---- 6. bình minh: giờ 0,16 → lặn đi, chìm về disappearDepth 3
  await page.evaluate(() => DR_DEBUG.setTime(0.16)); await sleep(500);
  l = await list(page);
  check('giờ 0,16: mọi angler đang lặn đi (despawning, flee)', l.length >= 1 && l.every(a => a.despawning && a.flee), JSON.stringify(l.map(a => [a.cfg, a.despawning])));
  await sleep(2500);
  l = await list(page);
  check('chìm sâu dần (objectDepth 3: lực nổi tối đa g·2/3 < g)', l.length === 0 || l.every(a => a.y < -1.5), JSON.stringify(l.map(a => a.y)));

  // ---- 7. Banish (chọn qua vòng E, chuột phải) → lặn
  await page.evaluate(() => { DRAngler.debug.clear(); DR_DEBUG.setTime(0.9); __ev.spawned.length = 0; __ev.banished.length = 0; DR_DEBUG.unlockSpells(); DR.s.sanity = 1; });
  await page.evaluate(f => DR_DEBUG.teleport(f[0], f[1], 0), FAR);
  await page.waitForFunction(() => DRAngler.debug.list().length === 2, null, { timeout: 6000 }).catch(() => {});
  const p8 = (() => { const a = (360 / 11 * 8) * Math.PI / 180, r = 200 * (H / 1080); return [W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r]; })();
  await page.keyboard.down('KeyE'); await sleep(450);
  await page.mouse.move(p8[0], p8[1], { steps: 4 }); await sleep(150);
  await page.keyboard.up('KeyE'); await sleep(250);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' }); await sleep(400);
  l = await list(page); m = await mgr(page);
  const ban = await page.evaluate(() => ({ b: DRSpells.banished, ev: __ev.banished.slice() }));
  check('Banish bật (vòng năng lực + chuột phải)', ban.b === true);
  check('Banish: cả 2 angler lặn đi, threatBanished ×2', l.length === 2 && l.every(a => a.despawning) && ban.ev.filter(e => e && e.source === 'MarrowMonster').length === 2,
    JSON.stringify({ l: l.map(a => a.despawning), ev: ban.ev.length }));
  check('MonsterManager: Banish đang bật thì không thử sinh', m.banish === true);

  // ---- hiệu năng
  const perf = await page.evaluate(() => DR_DEBUG.perf());
  console.log('  perf 1280x720: cpu ' + perf.cpuMs.toFixed(2) + ' ms, khung ' + perf.avgMs.toFixed(2) + ' ms, calls ' + perf.calls);
  check('không lỗi trang / console / HTTP (1280x720)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ảnh 844x390: quái trên màn hình
async function phone(browser, base) {
  const W = 844, H = 390;
  const { page, errors } = await boot(browser, base, W, H);
  await page.evaluate(f => { DR.s.worldPhase = 1; DR_DEBUG.setTime(0.9); DR_DEBUG.teleport(f[0], f[1], 0); }, FAR);
  await page.waitForFunction(() => DRAngler.debug.list().length === 2, null, { timeout: 8000 }).catch(() => {});
  await sleep(1000);
  await faceAngler(page, 0, 40); await sleep(700);
  // ẩn hộp hướng dẫn (dr-tut) và thẻ nhiệm vụ cho ảnh; vị trí quái trên màn hình để soi
  const scr = await page.evaluate(() => {
    for (const e of document.querySelectorAll('#dr-tut, .dr-banner, #dr-banner')) e.style.visibility = 'hidden';
    const a = DRAngler.debug.list().find(m => m.cfg === 0), v = new THREE.Vector3(a.x, 1.5, a.z).project(DRCamera.cam);
    return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)];
  });
  await sleep(200);
  await page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-angler-40m.png') });
  console.log('  844x390: angler ở điểm ảnh ' + scr.join(', '));
  const l = await list(page);
  check('844x390: angler sống trên màn hình', l.length === 2);
  check('không lỗi trang / console / HTTP (844x390)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve(), base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  try {
    await run(browser, base);
    await phone(browser, base);
  } finally { await browser.close(); srv.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed  (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
