/*
 * DREDGE - kiem don vi U9 (cá đuối quái MonsterRayFollow / Attack1 / Attack2: js/ray.js, tools/ray.py, data/ray.js).
 * Chay: node test/dredge-m3ray.js   (anh: %TEMP%/dredge-m3ray hoac SHOTS=...)
 * So goc: MonsterRayWorldEvent.cs (:185-268), GameObject/MonsterRay{Follow,Attack1,Attack2}.prefab (spawn/despawn dissolve 3 s, maxFollowDurationSec 15,
 * attackCooldown 3, timeUntilAttack 0,1, despawnDelay 1,5, moveSpeed 5, scalar 0,15, boatSpeed 20-65, rotationSpeed 2, attackRange 2/4/4, damage 1/1/2),
 * AnimationClip rayattack (JawCollider m_IsActive 0,333-1,333) + raytailswipe (TailCollider/TailJoinCollider 0,433-2), MONSTERS.md §3.3 dòng U9.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-m3ray');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  OK   ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const outQuad = t => 1 - (1 - t) * (1 - t);

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
  return { page, errors };
}

(async () => {
  const srv = await serve();
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, errors } = await boot(browser, base, 1280, 720);
  const ev = (fn, a) => page.evaluate(fn, a);

  // theo dõi trạng thái trong trang (mỗi khung) để đo mốc thời gian chính xác theo đồng hồ của cá đuối
  await ev(() => {
    window.__tl = [];
    const f = () => {
      const s = window.DRRay && DRRay.debug.state();
      if (s) {
        const L = window.__tl, last = L[L.length - 1];
        const sig = s.key + '|' + s.state + '|' + s.hasHit + '|' + s.finishRequested + '|' + s.anim.clip + '|' + s.listener + '|' + s.reason;
        if (!last || last.sig !== sig) L.push({ sig, clock: s.clock, state: s.state, hasHit: s.hasHit, fin: s.finishRequested, clip: s.anim.clip, listener: s.listener, reason: s.reason, hits: s.hits, tHit: s.tHit });
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });

  // chỗ thử: nước sâu trong Marrows, navmesh cá đuối phủ quanh, không dính vùng an toàn
  const spot = await ev(() => {
    for (const [x, z] of [[10, -190], [-50, -110]]) {
      let ok = DRWorld.sdf(x, z) > 40;
      for (let a = 0; a < 6.3 && ok; a += 0.5) for (const r of [5, 12, 25, 40, 60]) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!DRNav.walkable(px, pz, 'ray') || DRSafeZones.hit(px, pz)) ok = false; }
      if (ok) return { x, z };
    }
    return null;
  });
  check('tìm được chỗ thử (nước, navmesh ray, ngoài vùng an toàn)', !!spot, JSON.stringify(spot));
  const damageCount = () => ev(() => DR.grid('INVENTORY').damage.length);
  async function reset(x, z) {
    await ev(({ x, z }) => {
      DRRay.finish();
      DREvents.debug.live();
      DR.s.worldPhase = 5; DR.s.sanity = 0.1; DR.s.time = Math.floor(DR.s.time) + 0.9;
      DR_DEBUG.teleport(x, z, 0);
      DR.s.boat.vx = 0; DR.s.boat.vz = 0;
    }, { x, z });
    await sleep(300);
  }
  // sinh bằng DREvents.debug.force (bỏ mọi điều kiện) rồi đặt cá đuối cách thuyền (dx, dz) — chỗ sinh gốc là (+25, +25) theo thuyền
  async function spawn(type, dx, dz) {
    return ev(({ type, dx, dz }) => {
      if (DRRay.debug.active) return null;
      DRRay.debug.force(type);
      const i = DRRay.debug.inst; if (!i) return null;
      const b = DR.s.boat; i.x = b.x + dx; i.z = b.z + dz; i.path = null; i.onNav = true; i.lastSet = -1e9;
      return DRRay.debug.state();
    }, { type, dx, dz });
  }
  const st = () => ev(() => DRRay.debug.state());
  async function waitDone(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (!(await ev(() => DRRay.debug.active))) return true; await sleep(100); }
    return false;
  }
  const tl = () => ev(() => window.__tl.slice());
  const clr = () => ev(() => { window.__tl.length = 0; });

  // ---------------------------------------------------------------- 0. dữ liệu gốc
  console.log('U9 dữ liệu gốc (prefab, tools/ray.py)');
  const dat = await ev(() => ({ t: DR_RAY.types, p: DR_RAY.params, ag: DR_RAY.agent, san: DR_RAY.sanity, c: DR_RAY.colliders.map(c => [c.name, c.radius, c.height, c.dir]), act: { bite: DR_RAY.clips.bite.active.JawCollider, tail: DR_RAY.clips.tail.active.TailCollider, tail2: DR_RAY.clips.tail.active.TailJoinCollider },
    len: Object.fromEntries(Object.entries(DR_RAY.clips).map(([k, c]) => [k, c.len])), bones: DR_RAY.bones.length, skin: DR_RAY.skinBones.length, n: DR_RAY.mesh.n }));
  check('ba loại: SHADOW attackRange 2, BITE 4 (1 điểm), TAIL 4 (2 điểm)', dat.t.Follow.type === 0 && dat.t.Follow.attackRange === 2 && dat.t.Attack1.type === 1 && dat.t.Attack1.attackRange === 4 && dat.t.Attack2.type === 2 && dat.t.Attack2.attackRange === 4);
  check('tham số chung: dissolve 3 s, theo 15 s, hồi 3 s, 0,1 s, huỷ 1,5 s, 5 · 0,15, 20-65, xoay 2', dat.p.spawnDurationSec === 3 && dat.p.despawnDurationSec === 3 && dat.p.maxFollowDurationSec === 15 && dat.p.attackCooldownSec === 3 &&
    dat.p.timeUntilAttack === 0.1 && dat.p.despawnDelay === 1.5 && dat.p.moveSpeed === 5 && dat.p.moveSpeedScalar === 0.15 && dat.p.boatSpeedMin === 20 && dat.p.boatSpeedMax === 65 && dat.p.rotationSpeed === 2, JSON.stringify(dat.p));
  check('agent: loại 658490984, stoppingDistance 2, bán kính 2,5, gia tốc 5', dat.ag.agentTypeID === 658490984 && dat.ag.stoppingDistance === 2 && dat.ag.radius === 2.5 && dat.ag.acceleration === 5);
  check('SanityModifier: đêm −10 trong 5 m về 0 ở 25 m, ngày 0', dat.san.night === -10 && dat.san.r0 === 5 && dat.san.r1 === 25 && dat.san.day === 0);
  check('collider: Jaw capsule r0,5 h3 trục x; Tail r0,5 h5 trục x; TailJoin h2 trục z', JSON.stringify(dat.c) === JSON.stringify([['JawCollider', 0.5, 3, 'x'], ['TailCollider', 0.5, 5, 'x'], ['TailJoinCollider', 0.5, 2, 'z']]), JSON.stringify(dat.c));
  check('m_IsActive: hàm cắn 0,333-1,333; đuôi 0,433-2', dat.act.bite.length === 3 && near(dat.act.bite[1][0], 0.3333, 1e-3) && near(dat.act.bite[2][0], 1.3333, 1e-3) && near(dat.act.tail[1][0], 0.4333, 1e-3) && dat.act.tail[2][0] === 2 && dat.act.tail2[1][0] === dat.act.tail[1][0], JSON.stringify(dat.act));
  check('clip: bơi 3,3 s, cắn 3 s, quật 3 s; 29 xương skin; 7707 đỉnh', near(dat.len.swim, 3.3, 0.01) && near(dat.len.bite, 3, 0.01) && near(dat.len.tail, 3, 0.01) && dat.skin === 29 && dat.n === 7707, JSON.stringify(dat.len));
  check('ba sự kiện đã đăng ký trong DREvents', await ev(() => ['MonsterRayFollow', 'MonsterRayAttack1', 'MonsterRayAttack2'].every(n => DR_WORLDEVENTS[n] && DR_WORLDEVENTS[n].dispelByBanish)));

  // ---------------------------------------------------------------- 1. Attack1: dissolve 3 s → cắn 1 điểm trong 4 m → huỷ sau cú đánh
  console.log('U9 Attack1: sinh tan 3 s, cắn trong 4 m, huỷ');
  await reset(spot.x, spot.z);
  await clr();
  const dmg0 = await damageCount();
  const s0 = await spawn('Attack1', -22, 0);
  check('sinh: SPAWNING, _DissolveAmount 1', s0 && s0.state === 'SPAWNING' && s0.dissolve === 1, JSON.stringify(s0 && { st: s0.state, d: s0.dissolve }));
  await sleep(1500);
  const s1 = await st();
  check('dissolve theo OutQuad của DOTween (ở clock ' + (s1 && s1.clock.toFixed(2)) + ')', s1 && near(s1.dissolve, 1 - outQuad(Math.min(1, s1.clock / 3)), 0.02), s1 && s1.dissolve.toFixed(3));
  check('đang sinh vẫn bơi tới thuyền (NavMeshAgent chạy ở SPAWNING)', s1 && s1.x > s0.x + 1, s1 && 'x ' + s0.x.toFixed(1) + ' -> ' + s1.x.toFixed(1));
  await ev(() => window.scrollTo(0, 0));
  await sleep(1600);
  const s2 = await st();
  check('sau 3 s: FOLLOWING (hoặc đã vào tấn công), dissolve 0', s2 && s2.dissolve === 0 && ['FOLLOWING', 'ATTACKING'].includes(s2.state), s2 && s2.state + ' d=' + s2.dissolve);
  const mm = await ev(() => DRBoat.stats.moveMod), tgt = 0.15 * Math.max(20, Math.min(65, 5 * mm));
  check('tốc độ agent Lerp(5 → 0,15 · clamp(5·moveMod ' + mm.toFixed(2) + ', 20, 65) = ' + tgt.toFixed(2) + ') theo e^-t', s2 && near(s2.speed, tgt + (5 - tgt) * Math.exp(-s2.clock), 0.2), s2 && s2.speed.toFixed(3) + ' @' + s2.clock.toFixed(2));
  // chờ cắn rồi chờ huỷ
  const t0 = Date.now(); let fin = false;
  while (Date.now() - t0 < 25000) { const s = await st(); if (!s || s.finishRequested) { fin = true; break; } await sleep(100); }
  check('bị huỷ (finishRequested) trong 25 s', fin);
  const L1 = await tl();
  const att = L1.find(e => e.state === 'ATTACKING'), ret = L1.find(e => e.state === 'FOLLOWING' && att && e.clock > att.clock), hit = L1.find(e => e.hasHit), fz = L1.find(e => e.fin);
  const dmg1 = await damageCount();
  console.log('   mốc:', JSON.stringify({ att: att && att.clock, hit: hit && hit.clock, ret: ret && ret.clock, fin: fz && fz.clock, reason: fz && fz.reason, dmg: [dmg0, dmg1] }));
  check('ATTACKING bắt đầu khi trong 4 m', !!att);
  check('cú cắn trúng đúng 1 điểm (ô hỏng +1)', !!hit && dmg1 - dmg0 === 1, 'hit ' + !!hit + ' dmg ' + dmg0 + '->' + dmg1);
  check('hàm chỉ bật trong 0,333-1,333 s của clip (cú trúng cách DoAttack trong khoảng đó)', !!hit && !!att && hit.clock - att.clock >= 0.33 - 0.05 && hit.clock - att.clock <= 1.34 + 0.05, hit && att && (hit.clock - att.clock).toFixed(3));
  check('huỷ khi hoạt ảnh xong và đã quá 1,5 s kể từ cú trúng (despawnDelay): ≥ DoAttack + 3 s', !!fz && !!att && fz.clock - att.clock >= 3 - 0.05 && fz.clock - hit.clock >= 1.5, fz && att && (fz.clock - att.clock).toFixed(3) + ' / ' + (fz.clock - hit.clock).toFixed(3));
  check('lý do huỷ: after-hit', fz && fz.reason === 'after-hit', fz && fz.reason);
  const t1 = Date.now(); const gone = await waitDone(5000);
  check('tan 3 s rồi biến mất (sự kiện kết thúc)', gone, (Date.now() - t1) + ' ms');
  check('currentEvent trả về null', await ev(() => DREvents.current == null));

  // ---------------------------------------------------------------- 2. huỷ sau 15 s theo đuổi
  console.log('U9 huỷ sau 15 s theo đuổi');
  await reset(spot.x, spot.z);
  await clr();
  const far = await ev(({ x, z }) => { for (let d = 260; d < 420; d += 20) for (let a = 0; a < 6.3; a += 0.4) { const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (DRNav.walkable(px, pz, 'ray') && !DRSafeZones.hit(px, pz) && DRNav.path({ x: px, z: pz }, { x, z }, 'ray')) return [px - x, pz - z]; } return null; }, spot);
  check('có điểm xa ≥ 260 m có đường tới thuyền', !!far, JSON.stringify(far));
  await spawn('Attack1', far[0], far[1]);
  const t2 = Date.now(); let s3 = null;
  while (Date.now() - t2 < 30000) { s3 = await st(); if (!s3 || s3.finishRequested) break; await sleep(100); }
  const L2 = await tl(), f2 = L2.find(e => e.state === 'FOLLOWING'), z2 = L2.find(e => e.fin);
  console.log('   mốc:', JSON.stringify({ follow: f2 && f2.clock, fin: z2 && z2.clock, reason: z2 && z2.reason }));
  check('theo đuổi: FOLLOWING bắt đầu ở ~3 s', f2 && near(f2.clock, 3, 0.15), f2 && f2.clock.toFixed(2));
  check('huỷ ở 15 s sau khi FOLLOWING bắt đầu (lý do follow-timeout)', z2 && z2.reason === 'follow-timeout' && near(z2.clock - f2.clock, 15, 0.2), z2 && (z2.clock - f2.clock).toFixed(2));
  await waitDone(6000);

  // ---------------------------------------------------------------- 3. SHADOW (Follow): trong 2 m quá 0,1 s thì huỷ, không gây hại
  console.log('U9 Follow (bóng): trong 2 m > 0,1 s thì huỷ');
  await reset(spot.x, spot.z);
  await clr();
  const dmg3 = await damageCount();
  await spawn('Follow', -14, 0);
  const t3 = Date.now(); let s4 = null;
  while (Date.now() - t3 < 20000) { s4 = await st(); if (!s4 || s4.finishRequested) break; await sleep(60); }
  const L3 = await tl(), z3 = L3.find(e => e.fin);
  check('SHADOW huỷ vì lại gần (lý do shadow)', z3 && z3.reason === 'shadow', z3 && z3.reason);
  check('không gây hại và không có cú trúng', (await damageCount()) === dmg3 && !L3.some(e => e.hasHit));
  check('không có trạng thái ATTACKING', !L3.some(e => e.state === 'ATTACKING'));
  await waitDone(6000);

  // ---------------------------------------------------------------- 4. vùng an toàn Greater Marrow
  console.log('U9 vùng an toàn Greater Marrow');
  await reset(4, -8);
  const inSZ = await ev(() => DRSafeZones.which(DR.s.boat.x, DR.s.boat.z));
  check('thuyền đang trong vùng an toàn Greater Marrow', inSZ && inSZ.includes('Greater Marrow'), inSZ);
  await clr();
  await spawn('Attack1', 28, 0);
  await sleep(700);
  const L4 = await tl(), z4 = L4.find(e => e.fin);
  check('thuyền trong vùng an toàn: huỷ ngay ở lần đặt đích đầu (lý do safezone)', z4 && z4.reason === 'safezone' && z4.clock < 0.5, z4 && z4.reason + ' @' + z4.clock.toFixed(2));
  await waitDone(6000);

  // ---------------------------------------------------------------- 5. Xua đuổi (Banish) và neo bến
  console.log('U9 Xua đuổi');
  await reset(spot.x, spot.z);
  await clr();
  await spawn('Attack2', -40, 0);
  await sleep(800);
  await ev(() => DR.emit('banish', true));
  await sleep(300);
  const s5 = await st();
  check('Banish: sự kiện bị yêu cầu kết thúc (DESPAWNING, lý do event)', s5 && s5.finishRequested && s5.state === 'DESPAWNING' && s5.reason === 'event', s5 && s5.state + ' ' + s5.reason);
  const dis = await ev(() => ({ d: DRRay.debug.state().dissolve, c: DRRay.debug.state().clock }));
  await sleep(1500);
  const dis2 = await ev(() => DRRay.debug.state().dissolve);
  check('tan ngược về 1 trong 3 s (OutQuad)', dis2 > dis.d, dis.d.toFixed(2) + ' -> ' + dis2.toFixed(2));
  await ev(() => DR.emit('banish', false));
  await waitDone(6000);
  check('sau 3 s: sự kiện kết thúc', !(await ev(() => DRRay.debug.active)));

  // ---------------------------------------------------------------- 6. Attack2 (quật): 2 điểm, đuôi bật 0,433-2 s
  console.log('U9 Attack2: quật 2 điểm');
  await reset(spot.x, spot.z);
  await ev(() => { DR.s.eventHistory = {}; DR.grid('INVENTORY').damage.length = 0; });   // thân sạch để đo đủ 2 ô
  await clr();
  const dmg6 = await damageCount();
  const hull = await ev(() => ({ t: DR.s.hullTier, thr: DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier) }));
  await spawn('Attack2', -22, 0);
  const t6 = Date.now(); let fin6 = false;
  while (Date.now() - t6 < 30000) { const s = await st(); if (!s || s.finishRequested) { fin6 = true; break; } await sleep(100); }
  const L6 = await tl(), hit6 = L6.find(e => e.hasHit), att6 = L6.find(e => e.state === 'ATTACKING'), cl6 = L6.find(e => e.clip === 'tail');
  const dmg6b = await damageCount();
  console.log('   mốc:', JSON.stringify({ att: att6 && att6.clock, hit: hit6 && hit6.clock, dmg: [dmg6, dmg6b], hull }));
  check('Attack2 đánh bằng clip raytailswipe', !!cl6);
  check('Attack2 trúng: +2 ô hỏng (damagePoints 2)', !!hit6 && dmg6b - dmg6 === 2, dmg6 + '->' + dmg6b);
  check('đuôi chỉ bật trong 0,433-2 s của clip', !!hit6 && !!att6 && hit6.clock - att6.clock >= 0.43 - 0.05 && hit6.clock - att6.clock <= 2.05, hit6 && att6 && (hit6.clock - att6.clock).toFixed(3));
  await waitDone(10000);

  // ---------------------------------------------------------------- 7. chụp hình
  console.log('U9 ảnh chụp (Read ảnh để xem)');
  async function shot(W, H, name) {
    await page.setViewportSize({ width: W, height: H });
    await reset(spot.x, spot.z);
    await ev(() => { DR.s.sanity = 0.45; });
    await spawn('Attack1', -40, 0);
    // ép thuyền yên, đợi dissolve xong rồi đưa cá đuối vào khung hình phía trước-trái thuyền (ép giữ nguyên chỗ để chụp)
    await ev(() => { const i = DRRay.debug.inst; i.vel = 0; });
    await sleep(3300);
    await ev(() => { const i = DRRay.debug.inst, b = DR.s.boat; i.x = b.x - 5; i.z = b.z - 10; i.path = null; i.lastSet = DRRay.debug.state().clock + 100; i.tInRange = -1e9; i.tLastAttack = i.clock + 1e9; });
    await sleep(700);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  }
  await shot(1280, 720, 'ray-1280x720');
  await shot(844, 390, 'ray-844x390');
  await ev(() => DRRay.finish());

  // ---------------------------------------------------------------- 8. lỗi trang
  console.log('Lỗi trang');
  const bad = errors.filter(e => !/favicon/.test(e));
  check('không có lỗi trang / HTTP >= 400', bad.length === 0, bad.slice(0, 4).join(' | '));
  console.log('\n' + pass + ' OK, ' + fail + ' FAIL');
  await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
