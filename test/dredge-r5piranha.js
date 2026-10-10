/*
 * DREDGE — Biển Mù, vòng 8, owner r5piranha: cá piranha và Mẹ Không Mắt của Devil's Spine (WORLD-GAPS.md R5; DSMonsterManager.cs, DSLittleMonsterSpawner.cs,
 * DSLittleMonster.cs, DSBigMonster.cs, PlayerStats.cs:76, PlayerController.cs:180).
 *
 * Chạy:  node test/dredge-r5piranha.js        Ra: %TEMP%/dredge-r5piranha/*.png (1280x720 và 844x390); biến SHOTS đổi thư mục ghi ảnh
 * Số gốc: 20 spawner (2-4 cá), spawnDistance 80, despawnDistance 90, maxRange 75, attachDistance 5; Rigidbody 0,1 kg drag 10 (tốc độ cân bằng 0,8·speed);
 * numAttachedMonstersToNullifyEngines 6; mẹ: patrol 3, chase 6, detect 100, attackDelay 7, attackDistance 7, damagePoints 3, 27 vent.
 * Kiểm (WORLD-GAPS R5): 6 cá bám → hệ số tốc độ = AttachedMonsterMovementSpeedFactor (0); vent đuổi cá; mẹ cắn → +3 ô (DSBigMonster.cs:262).
 * Mô phỏng chạy tất định bằng DRPiranha.debug.simulate (vòng khung thật bị đóng băng).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r5piranha');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } if (cond && process.env.V) console.log('  ok   ' + msg); }
const near = (a, b, e) => Math.abs(a - b) <= e;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const ROOT = path.resolve(__dirname, '..');
const serve = () => new Promise(res => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
    });
  }).listen(0, () => res(srv));
});

async function newSea(browser, base, errors, vw, vh) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {}); else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(500);
  return { ctx, page };
}

(async () => {
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port), errors = [];
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await newSea(browser, base, errors, 1280, 720);
  const E = (fn, arg) => page.evaluate(fn, arg);
  ok(await E(() => !!window.DRPiranha && !!DRPiranha.debug), 'DRPiranha nạp được');
  await E(() => { DRPiranha.debug.freeze(true); DRPiranha.debug.setSuppress(true); });   // manager chưa sinh mẹ cho tới phần "mẹ"

  // ---- số từ scene/prefab (qua data sinh bởi tools/piranha.py)
  console.log('số gốc');
  const D = await E(() => ({ sp: DR_PIRANHA.spawners, v: DR_PIRANHA.vents, m: DR_PIRANHA.mother, l: DR_PIRANHA.little, mgr: DR_PIRANHA.manager, route: DR_PIRANHA.route.length, nul: DR_CONFIG.numAttachedMonstersToNullifyEngines,
    audio: ['ds.detect', 'ds.scream', 'ds.latched1', 'ds.latched2', 'ds.latched3', 'ds.idle', 'ds.response', 'ds.attack', 'ds.proximity'].map(k => !!DR_AUDIO[k]) }));
  ok(D.sp.length === 20 && D.sp.reduce((n, s) => n + s.cfgs.length, 0) === 47, '20 spawner, tổng 47 cá (2-4 mỗi spawner)');
  ok(D.sp.every(s => s.spawnDistance === 80 && s.despawnDistance === 90 && s.maxRange === 75 && s.attachDistance === 5 && s.timeBetweenSpawns === 0.5 && s.displacedDespawnDistance === 35 && !s.canLosePlayerBySight),
    'spawner: spawn 80, despawn 90, maxRange 75, attach 5, 0,5 s giữa các lần sinh, lạc nhà 35, không mất dấu bằng mắt');
  ok(D.l.rb.mass === 0.1 && D.l.rb.drag === 10 && D.l.sphere.radius === 0.15, 'Rigidbody cá 0,1 kg drag 10, cầu r 0,15');
  ok(D.nul === 6, 'numAttachedMonstersToNullifyEngines = 6');
  ok(D.m.patrolSpeed === 3 && D.m.chaseSpeed === 6 && D.m.playerDetectionThreshold === 100 && D.m.attackDelay === 7 && D.m.attackDistanceThreshold === 7 && D.m.damagePoints === 3
    && D.m.littleMonsterSuppressionDuration === 7 && !D.m.instaKill, 'mẹ: tuần tra 3, đuổi 6, phát hiện 100, attackDelay 7, tầm đánh 7, 3 điểm, chặn cá 7 s');
  ok(D.mgr.spawnRange === 300 && D.mgr.despawnRange === 500 && D.mgr.deaggroRange === 250 && D.route === 15, 'manager: sinh 300, huỷ 500, deaggro 250, 15 điểm tuần tra');
  ok(D.v.length === 27 && D.v.every(v => v.radius === 5 && v.trigger), '27 vent, capsule trigger bán kính 5');
  ok(D.audio.every(Boolean), '9 khoá tiếng ds.* trong DR_AUDIO');

  // ---- spawner: cá xuất hiện khi thuyền cách < 80 m, mỗi 0,5 s một con, đủ số cấu hình
  console.log('spawner');
  const sps = await E(() => DRPiranha.debug.spawners());
  const s1 = sps.find(s => s.name === '1'), s4 = sps.find(s => s.name === '4');
  ok(s1 && s1.cfgs === 3 && s4 && s4.cfgs === 3, 'spawner 1 và 4 có 3 cấu hình');
  // nhịp của Update: kiểm tra mỗi 0,5 s liên tục từ lúc vào cảnh, nên con đầu xuất hiện trong vòng 0,5 s rồi cứ 0,5 s thêm một con, dừng ở 3
  const times = await E(([x, z]) => {
    DR_DEBUG.teleport(x + 79, z, 0);
    const t = [], cnt = () => DRPiranha.debug.state().littles.filter(m => m.sp === '1').length;
    let n = 0;
    for (let i = 1; i <= 30; i++) { DRPiranha.debug.simulate(0.1); const c = cnt(); while (n < c) { t.push(i / 10); n++; } }
    return t;
  }, [s1.home.x, s1.home.z]);
  ok(times.length === 3 && times[0] <= 0.6 && times.every((v, i) => i === 0 || v - times[i - 1] >= 0.45 && v - times[i - 1] <= 0.65), 'cá xuất hiện lần lượt cách nhau 0,5 s, tối đa 3 con ở spawner 1: ' + JSON.stringify(times));
  // xa hơn 90 m: Despawn (ignoreIfChasing); các con đang IDLE bị huỷ
  await E(([x, z]) => { DR_DEBUG.teleport(x + 100, z, 0); DRPiranha.debug.simulate(1.0); }, [s1.home.x, s1.home.z]);
  ok((await E(() => DRPiranha.debug.state().littles.filter(m => m.sp === '1').every(m => m.state === 'DESPAWNING'))), 'thuyền cách 100 m > 90: cá IDLE của spawner 1 chuyển DESPAWNING');
  await E(() => DRPiranha.debug.simulate(2.2));
  ok((await E(() => DRPiranha.debug.state().littles.filter(m => m.sp === '1').length)) === 0, 'hoạt ảnh Despawn 2 s xong thì cá biến mất');

  // ---- cá đuổi, tốc độ cân bằng 0,8·speed
  console.log('đuổi và bám');
  await E(([x, z]) => { DR_DEBUG.teleport(x, z, 0); DRPiranha.debug.simulate(2.5); }, [s1.home.x, s1.home.z]);
  let st = await E(() => DRPiranha.debug.state());
  ok(st.littles.filter(m => m.sp === '1').length === 3, 'thuyền tại nhà spawner 1: 3 cá');
  await E(() => DRPiranha.debug.simulate(2.0));
  st = await E(() => DRPiranha.debug.state());
  const mine = st.littles.filter(m => m.sp === '1');
  ok(mine.every(m => m.state === 'CHASING'), 'thuyền trong tầm nhìn 10/15/20 m: cả 3 đang CHASING (' + mine.map(m => m.state).join(',') + ')');
  ok(st.attached === 3 && near(st.factor, 0.5, 1e-9), '3 cá bám → hệ số tốc độ = lerp(1, 0, 3/6) = 0,5 (attached ' + st.attached + ', factor ' + st.factor + ')');
  ok((await E(() => DRPiranha.speedFactor())) === st.factor && (await E(() => DRPiranha.attached)) === 3, 'DRPiranha.speedFactor() / .attached khớp');
  // tốc độ cân bằng: thả một con cách thuyền 40 m, đuổi thẳng (không vẫy)
  const sp = await E(() => {
    const b = DR.s.boat, m = DRPiranha.debug.littleObjs[0];
    let dir = null;                                              // hướng có nước thoáng 45 m tới thuyền
    for (let k = 0; k < 16 && !dir; k++) {
      const a = k * Math.PI / 8; let min = 1e9;
      for (let r = 2; r <= 45; r += 1) min = Math.min(min, DRWorld.sdf(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r));
      if (min > 2) dir = [Math.cos(a), Math.sin(a)];
    }
    DRPiranha.debug.place(0, { x: b.x + dir[0] * 40, y: -1, z: b.z + dir[1] * 40 }); m.state = 'CHASING'; m.cfg = Object.assign({}, m.cfg, { wiggleAmount: 0 });
    DRPiranha.debug.simulate(1.5);
    const s = DRPiranha.debug.state().littles[0]; return { speed: s.speed, cfg: s.speedCfg, d: Math.hypot(s.x - b.x, s.z - b.z) };
  });
  ok(near(sp.speed, 0.8 * sp.cfg, 0.25), 'lực forward·speed lên 0,1 kg drag 10 → vận tốc cân bằng 0,8·speed (' + sp.speed.toFixed(2) + ' ≈ ' + (0.8 * sp.cfg) + ')');

  // ---- 6 cá bám: spawner 13 và 15 cách 33 m, đường nước thông (mặt đất chặn cá nên cặp phải nhìn thấy nhau): 3 con cũ còn đuổi + 3 con mới bám
  const sA = sps.find(s => s.name === '13'), sB = sps.find(s => s.name === '15');
  await E(([x, z]) => { DRPiranha.debug.clearAll(); DR_DEBUG.teleport(x, z, 0); DRPiranha.debug.simulate(4); }, [sA.home.x, sA.home.z]);
  ok((await E(() => DRPiranha.attached)) === 3, 'tại nhà spawner ' + sA.name + ': 3 cá bám');
  await E(([x, z]) => { DR_DEBUG.teleport(x, z, 0); DRPiranha.debug.simulate(5.0); }, [sB.home.x, sB.home.z]);
  st = await E(() => DRPiranha.debug.state());
  ok(st.attached === 6 && st.factor === 0, '6 cá bám (' + st.attached + ') → AttachedMonsterMovementSpeedFactor = 0');
  const boatSpeed = await E(() => {
    let spot = null;                         // chỗ nước thoáng (Marrows) để chạy thẳng 200 bước
    for (let x = -150; x <= 150 && !spot; x += 6) for (let z = -150; z <= 150 && !spot; z += 6) if (DRWorld.depth01(x, z) > 0.2 && DRWorld.sdf(x, z) > 60 && DRWorld.zoneAt(x, z) === 'THE_MARROWS') spot = [x, z];
    const home = [DR.s.boat.x, DR.s.boat.z];
    const run = n => {                       // tốc độ thuyền sau 200 bước hết ga (DRBoat.step), n cá bám
      DRPiranha.debug.setAttached(n); DR_DEBUG.teleport(spot[0], spot[1], 0);
      DRBoat.input.y = 1; DRBoat.input.x = 0;
      for (let i = 0; i < 200; i++) DRBoat.step();
      const v = Math.hypot(DR.s.boat.vx, DR.s.boat.vz); DRBoat.input.y = 0; return v;
    };
    const keep = DRPiranha.attached, st0 = DRBoat.stats;
    const v0 = run(0), v3 = run(3), v6 = run(6); DRPiranha.debug.setAttached(keep); DR_DEBUG.teleport(home[0], home[1], 0);
    return { v0, v3, v6, base: DR_CONFIG.basePlayerSpeed * DR_CONFIG.baseMovementSpeedModifier, full: st0.speed, mod: st0.moveMod };
  });
  ok(boatSpeed.v0 > boatSpeed.v3 && boatSpeed.v3 > boatSpeed.v6, 'thuyền chạy chậm dần theo số cá bám: 0 → ' + boatSpeed.v0.toFixed(1) + ', 3 → ' + boatSpeed.v3.toFixed(1) + ', 6 → ' + boatSpeed.v6.toFixed(1) + ' m/s');
  ok(near(boatSpeed.v6 / boatSpeed.v0, boatSpeed.base / boatSpeed.full, 0.12), '6 cá: tốc độ về BasePlayerSpeed·baseMovementModifier (tỉ lệ ' + (boatSpeed.v6 / boatSpeed.v0).toFixed(3) + ' ≈ ' + (boatSpeed.base / boatSpeed.full).toFixed(3) + ')');

  // ---- vent: cá chạm vent bị đuổi về nhà
  console.log('vent');
  const vv = await E(() => {
    const v = DR_PIRANHA.vents[0], m = DRPiranha.debug.littleObjs[0];
    m.state = 'CHASING'; DRPiranha.debug.place(0, { x: v.pos[0] + 1, y: v.pos[1], z: v.pos[2] });
    const before = m.state; DRPiranha.debug.simulate(0.06);
    return { before, after: DRPiranha.debug.state().littles[0].state, vent: v.name };
  });
  ok(vv.before === 'CHASING' && vv.after === 'RETURNING_HOME', 'cá đang CHASING chạm vent ' + vv.vent + ' → RETURNING_HOME (' + vv.after + ')');

  // ---- Xua đuổi: Despawn cả cá đang đuổi, không sinh lại trong lúc bật
  console.log('xua đuổi');
  await E(() => { DR.emit('banish', true); });
  ok(await E(() => DRPiranha.debug.state().littles.every(m => m.state === 'DESPAWNING')), 'Banish bật: mọi cá (kể cả CHASING) sang DESPAWNING');
  await E(() => DRPiranha.debug.simulate(3));
  st = await E(() => DRPiranha.debug.state());
  ok(st.littles.length === 0 && st.attached === 0 && st.factor === 1, 'sau Despawn: hết cá, đếm bám về 0, hệ số tốc độ 1 (' + st.littles.length + ', ' + st.attached + ')');
  await E(() => DRPiranha.debug.simulate(2));
  ok((await E(() => DRPiranha.debug.state().littles.length)) === 0, 'Banish đang bật: không sinh cá mới');
  await E(() => { DR.emit('banish', false); DRPiranha.debug.simulate(2); });
  ok((await E(() => DRPiranha.debug.state().littles.length)) >= 1, 'Banish tắt: cá sinh lại');

  // ---- chế độ PASSIVE: cá không đuổi / không bám
  await E(() => { DRPiranha.debug.clearAll(); DREvents.setGameMode('PASSIVE'); });
  await E(([x, z]) => { DR_DEBUG.teleport(x, z, 0); DRPiranha.debug.simulate(5); }, [s1.home.x, s1.home.z]);
  st = await E(() => DRPiranha.debug.state());
  ok(st.attached === 0 && st.littles.every(m => m.state !== 'CHASING'), 'PASSIVE: không cá nào đuổi hay bám (attached ' + st.attached + ')');
  await E(() => { DREvents.setGameMode('NORMAL'); DRPiranha.debug.clearAll(); });

  // ---- Mẹ Không Mắt
  console.log('mẹ');
  await E(() => DRPiranha.debug.noLittles(true));                // phần mẹ: số cá bám do bài thử đặt, spawner cá tạm tắt
  await E(() => {                                                // điểm nước thoáng cách mẹ `d` m, đường thẳng trong NavMesh (không thì TargetFollow báo lỗi và mẹ về đường tuần tra)
    window.__open = (m, d) => {
      for (let k = 0; k < 32; k++) {
        const a = k * Math.PI / 16, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
        if (!DRPiranha.debug.walk(x, z) || DRWorld.sdf(x, z) < 4) continue;
        const p = DRPiranha.debug.astar({ x: m.x, z: m.z }, { x, z });
        if (p && p.length === 2) return [x, z];
      }
      return null;
    };
  });
  await E(() => DRPiranha.debug.setSuppress(false));
  await page.waitForFunction(() => DRPiranha.debug.state().navReady, null, { timeout: 20000 });
  const mp = await E(() => { const g = DR_PIRANHA.manager; return { x: g.pos[0], z: g.pos[2] }; });
  await E(([x, z]) => { DR_DEBUG.teleport(x + 280, z, 0); DRPiranha.debug.simulate(1.2); }, [mp.x, mp.z]);
  let ms = await E(() => DRPiranha.debug.state().mother);
  ok(!!ms, 'thuyền cách manager 280 m < 300: mẹ được sinh');
  await E(([x, z]) => { DR_DEBUG.teleport(x + 600, z, 0); DRPiranha.debug.simulate(1.2); }, [mp.x, mp.z]);
  ok(!(await E(() => DRPiranha.debug.state().mother)), 'thuyền cách mẹ 600 m > 500: mẹ bị huỷ');
  await E(([x, z]) => { DR_DEBUG.teleport(x + 150, z + 120, 0); DRPiranha.debug.simulate(1.2); }, [mp.x, mp.z]);
  ms = await E(() => DRPiranha.debug.state().mother);
  ok(ms && ms.mode === 'PATROLLING' && near(ms.speedTarget, 3, 1e-9), 'mẹ tuần tra, tốc độ đích 3 (mode ' + (ms && ms.mode) + ')');
  const p0 = { x: ms.x, z: ms.z };
  await E(() => DRPiranha.debug.simulate(15));
  ms = await E(() => DRPiranha.debug.state().mother);
  const moved = Math.hypot(ms.x - p0.x, ms.z - p0.z);
  ok(moved > 20 && ms.speed < 3.3 && ms.speed > 2.6, 'sau 15 s mẹ đã đi ' + moved.toFixed(1) + ' m theo đường, tốc độ tác tử ≈ 3 (' + ms.speed.toFixed(2) + ')');
  ok(await E(() => { const m = DRPiranha.debug.state().mother; return DRPiranha.debug.walk(m.x, m.z); }), 'mẹ luôn đứng trên NavMesh DS_Large');
  // không có cá bám → không đuổi dù thuyền ở sát
  await E(() => { DRPiranha.debug.clearLittles(); const m = DRPiranha.debug.state().mother, p = __open(m, 20); DR_DEBUG.teleport(p[0], p[1], 0); DRPiranha.debug.simulate(0.2); DRPiranha.debug.setAttached(0); DRPiranha.debug.simulate(3); });
  ok((await E(() => DRPiranha.debug.state().mother.mode)) === 'PATROLLING', 'chưa có cá bám: mẹ không đuổi');
  // có cá bám + thuyền < 100 m: đuổi, tốc độ đích 6; Xua đuổi dập tắt
  await E(() => { DRPiranha.debug.setAttached(1); DRPiranha.debug.simulate(1.2); });
  ms = await E(() => DRPiranha.debug.state().mother);
  ok(ms.mode === 'CHASING' && near(ms.speedTarget, 6, 1e-9), 'có cá bám, thuyền < 100 m: mẹ đuổi, tốc độ đích 6 (' + ms.mode + ')');
  await E(() => { DR.emit('banish', true); });
  ok((await E(() => DRPiranha.debug.state().mother.mode)) === 'PATROLLING', 'Xua đuổi: mẹ thôi đuổi, về đường tuần tra');
  await E(() => { DRPiranha.debug.simulate(1); });
  ok((await E(() => DRPiranha.debug.state().mother.mode)) === 'PATROLLING', 'Xua đuổi đang bật: có cá bám cũng không đuổi lại');
  await E(() => { DR.emit('banish', false); });

  // ---- mẹ cắn: +3 ô hỏng (DSBigMonster.cs:262), không có requireOneHealthToKill
  console.log('mẹ cắn');
  const dmg0 = await E(() => {
    DRPiranha.debug.setAttached(1);
    const m = DRPiranha.debug.state().mother, p = __open(m, 30);
    DR_DEBUG.teleport(p[0], p[1], 0);                            // 30 m từ mẹ, đường thẳng trong nước mở
    DRPiranha.debug.simulate(1.0);
    return DR.grid('INVENTORY').damage.length;
  });
  let sawAttack = false;
  for (let i = 0; i < 40; i++) {
    const r = await E(() => { DRPiranha.debug.simulate(0.5); const s = DRPiranha.debug.state(); return { m: s.mother }; });
    if (r.m && r.m.attackT >= 0) sawAttack = true;
    if (r.m && r.m.hit) break;
  }
  const after = await E(() => ({ d: DR.grid('INVENTORY').damage.length, m: DRPiranha.debug.state().mother }));
  ok(sawAttack, 'mẹ đuổi tới < 7 m rồi vào đòn Attack');
  ok(after.m.hit && after.m.lastHit.points === 3 && after.d - dmg0 === 3, 'DamageCollider trúng thuyền: +3 ô hỏng (' + dmg0 + ' → ' + after.d + ')');
  ok(after.m.enabled === false, 'sau cú trúng tác tử bị tắt cho tới AttackComplete');
  await E(() => DRPiranha.debug.simulate(4.5));
  ms = await E(() => DRPiranha.debug.state().mother);
  ok(ms.enabled && ms.mode === 'PATROLLING' && ms.attackT < 0, 'AttackComplete (3,833 s): tác tử bật lại, mẹ về đường tuần tra');
  const att0 = ms.attacks;
  await E(() => { const m = DRPiranha.debug.state().mother, p = __open(m, 4) || __open(m, 5); DR_DEBUG.teleport(p[0], p[1], 0); DRPiranha.debug.setMotherState('chase'); DRPiranha.debug.simulate(2.0); });
  ok((await E(() => DRPiranha.debug.state().mother.attacks)) === att0, 'attackDelay 7 s: ngay sau đòn chưa đánh lại (' + att0 + ' đòn)');

  // ---- LungeStart: cá nhỏ về nhà và bị chặn 7 s
  console.log('LungeStart');
  await E(() => { DRPiranha.debug.noLittles(false); DRPiranha.debug.killMother(); DRPiranha.debug.clearAll(); });
  const lg = await E(([x, z]) => {
    DR_DEBUG.teleport(x, z, 0); DRPiranha.debug.simulate(3);
    DRPiranha.debug.spawnMother({ x: x + 60, z });
    const before = DRPiranha.debug.state().littles.length;
    DRPiranha.debug.forceAttack(); DRPiranha.debug.simulate(0.6);
    const s = DRPiranha.debug.state();
    return { before, st: s.littles.filter(m => m.sp !== 'Mother').map(m => m.state), sup: s.littles.filter(m => m.sp !== 'Mother').map(m => m.suppress) };
  }, [s1.home.x, s1.home.z]);
  ok(lg.before >= 1 && lg.st.every(x => x === 'RETURNING_HOME' || x === 'IDLE') && lg.sup.every(v => v > 6 && v <= 7), 'LungeStart (0,533 s): cá về nhà, bị chặn 7 s (' + lg.st.join(',') + ' / ' + lg.sup.map(v => v.toFixed(1)).join(',') + ')');
  await E(() => DRPiranha.debug.killMother());

  // ---- ảnh chụp 1280x720 và 844x390: cá quanh thuyền; mẹ ở gần
  console.log('ảnh');
  const shoot = async (name, vw, vh) => {
    await page.setViewportSize({ width: vw, height: vh });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  };
  await E(([x, z]) => {
    DRPiranha.debug.clearAll(); DRPiranha.debug.setAttached(0); DRPiranha.debug.noLittles(false);
    DR_DEBUG.teleport(x, z, 0); DRPiranha.debug.simulate(8);
    const b = DR.s.boat;                                           // cá bơi sát mặt nước phía trước thuyền (mặt nước Devil's Spine đục: ở -3 m thì không thấy)
    DRPiranha.debug.littleObjs.forEach((m, i) => {
      const a = (i % 5) * 0.5 - 1; m.pos.x = b.x + Math.sin(a) * 9; m.pos.z = b.z - 6 - Math.cos(a) * 5 - i % 3 * 2; m.v.x = m.v.y = m.v.z = 0;
      m.pos.y = DRWater.surface(m.pos.x, m.pos.z, b.x, b.z) + 0.1; m.state = 'IDLE'; m.home = { x: m.pos.x, y: m.pos.y, z: m.pos.z };
    });
    DRPiranha.debug.simulate(0.04);
  }, [s1.home.x, s1.home.z]);
  await shoot('piranha-1280x720', 1280, 720);
  await shoot('piranha-844x390', 844, 390);
  await page.setViewportSize({ width: 1280, height: 720 });
  await E(([x, z]) => {
    DRPiranha.debug.clearAll(); DRPiranha.debug.noLittles(true); DR_DEBUG.teleport(x, z, 0);
    DRPiranha.debug.spawnMother({ x: x, z: z - 20 });
    DRPiranha.debug.placeMother({ x: x + 2, z: z - 20, yaw: Math.PI });                    // quay mặt về phía thuyền
    const mo = DRPiranha.debug.motherObj; mo.y = 0.9; DRPiranha.debug.simulate(0.04);
  }, [s1.home.x, s1.home.z]);
  await shoot('mother-1280x720', 1280, 720);
  await shoot('mother-844x390', 844, 390);

  // ---- không lỗi tải / chạy
  const bad = errors.filter(e => !/favicon/.test(e));
  ok(bad.length === 0, 'không lỗi console / HTTP: ' + bad.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  console.log('\nr5piranha: ' + pass + ' pass, ' + fail + ' fail  (ảnh ở ' + OUT + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
