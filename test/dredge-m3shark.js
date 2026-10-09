/*
 * DREDGE — Biển Mù, vòng 7, owner m3shark (U10 phantomshark): cá mập ma PhantomSharkWorldEvent (MONSTERS.md §2.11, §3.3).
 *
 * Chạy:  node test/dredge-m3shark.js        Ra: %TEMP%/dredge-m3shark/*.png (1280x720 và 844x390)
 * Số gốc (PhantomSharkWorldEvent.prefab / Data/WorldEvent/PhantomShark.asset): maxSpeed 40, acceleration 7, initialSpeed 10, turnSpeed 1,5, dodgeSensitivity 0,9,
 * delayBeforeDestroying 1,5, VariablePlayerDamager 2 điểm oneHitOnly requireOneHealthToKill, sinh tại (−25, 0, 80), y −1, minWorldPhase 2, sanity ≤ 0,25.
 * §3.3: tốc độ tăng 10 → 40 với 7/s; chạm đầu → +2 ô; tránh ngang làm |dot| < 0,9 → mờ dần, không gây hại.
 * Một ca hỏng không cản ca khác; cuối cùng in tổng pass/fail.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(os.tmpdir(), 'dredge-m3shark');
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
  // chỗ nước sâu trong vùng Marrows, xa bờ, để cá mập có đường chạy
  const spot = await page.evaluate(() => {
    for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6)
      if (DRWorld.depth01(x, z) > 0.2 && DRWorld.sdf(x, z) > 40 && DRWorld.zoneAt(x, z) === 'THE_MARROWS') { DR_DEBUG.teleport(x, z, 0); return [x, z]; }
    return null;
  });
  return { ctx, page, spot };
}

async function colorCount(page, png, pred) {   // đếm điểm ảnh theo điều kiện trên ảnh chụp (vùng giữa, bỏ HUD trên 12 %)
  return page.evaluate(async ([b64, src]) => {
    const f = new Function('r', 'g', 'b', 'return ' + src);
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, Math.round(img.height * 0.12), img.width, Math.round(img.height * 0.7)).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }, [png.toString('base64'), pred]);
}

(async () => {
  const srv = await serve(), base = 'http://localhost:' + srv.address().port, errors = [];
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page, spot } = await newSea(browser, base, errors, 1280, 720);
  const E = fn => page.evaluate(fn);
  ok(!!spot, 'có chỗ nước sâu trong vùng Marrows để thử');

  // ---- số từ prefab/asset (qua data sinh bởi tools/phantomshark.py và data/worldevents.js)
  console.log('số gốc');
  const D = await E(() => ({ p: DR_PHANTOMSHARK.params, h: DR_PHANTOMSHARK.hit, e: DR_WORLDEVENTS.PhantomShark, c: DR_PHANTOMSHARK.controller }));
  ok(D.p.maxSpeed === 40 && D.p.acceleration === 7 && D.p.initialSpeed === 10 && D.p.turnSpeed === 1.5 && D.p.dodgeSensitivity === 0.9 && D.p.delayBeforeDestroying === 1.5,
    'maxSpeed 40, acceleration 7, initialSpeed 10, turnSpeed 1,5, dodgeSensitivity 0,9, delayBeforeDestroying 1,5');
  ok(D.h.points === 2 && D.h.oneHitOnly && D.h.requireOneHealth, 'VariablePlayerDamager: 2 điểm, oneHitOnly, requireOneHealthToKill');
  ok(JSON.stringify(D.e.playerSpawnOffset) === '[-25,0,80]' && D.e.minWorldPhase === 2 && D.e.maxSanity === 0.25 && D.e.dispelByBanish === true, 'WorldEventData: sinh (−25,0,80), phase ≥ 2, sanity ≤ 0,25, Xua đuổi dập tắt');
  ok(D.c.swimToMouth.exitTime === 1 && D.c.swimToMouth.dur === 3.5 && D.c.mouthToSwim.dur === 0.1 && D.c.mouthToSwim.cond === 'Bite', 'bộ điều khiển: Swim → MouthOpen (exit 1, 3,5 s), Bite → Swim 0,1 s');

  // ---- lịch bốc thăm (TestWorldEvent)
  console.log('lịch');
  await E(() => { DR.setTime && 0; DR_DEBUG.setTime(0.5); DR.s.worldPhase = 2; DR.s.sanity = 0.1; });
  const c1 = await E(() => DREvents.debug.candidates());
  ok(c1.includes('PhantomShark'), 'phase 2, sanity 0,1, giữa trưa (cả ngày): PhantomShark là ứng viên (' + c1.join(',') + ')');
  ok(!(await E(() => { DR.s.sanity = 0.5; const t = DREvents.test('PhantomShark', true); DR.s.sanity = 0.1; return t; })), 'sanity 0,5 > 0,25: không bốc');
  ok(!(await E(() => { DR.s.worldPhase = 1; const t = DREvents.test('PhantomShark', true); DR.s.worldPhase = 2; return t; })), 'phase 1 < 2: không bốc');
  ok(!(await E(() => { const t0 = DREvents.debug.history().PhantomShark; return t0 !== undefined; })), 'chưa có lịch sử trước khi sinh');

  // ---- sinh ra: vị trí, hướng, y, độ mờ
  console.log('sinh ra');
  await E(() => { DR_DEBUG.teleport(DR.s.boat.x, DR.s.boat.z, 0); DR.s.boat.yaw = 0; });
  const sp = await E(() => {
    const b = DR.s.boat; DRPhantomShark.debug.freeze(true);
    const forced = DRPhantomShark.debug.force(), st = DRPhantomShark.debug.state();
    return { forced, st, b: { x: b.x, z: b.z }, cur: DREvents.current && DREvents.current.name, hist: DREvents.debug.history().PhantomShark };
  });
  ok(sp.forced && sp.cur === 'PhantomShark', 'force → DREvents.current = PhantomShark');
  ok(near(sp.st.x - sp.b.x, -25, 0.01) && near(sp.st.z - sp.b.z, -80, 0.01), 'sinh tại thuyền + (−25 phải, 80 trước) = (−25, −80) thế giới (đo ' + (sp.st.x - sp.b.x).toFixed(2) + ', ' + (sp.st.z - sp.b.z).toFixed(2) + ')');
  ok(sp.st.y === -1, 'y = −1 (đo ' + sp.st.y + ')');
  ok(sp.st.state === 'Appear' && sp.st.speed === 10 && sp.st.opacity === 0, 'Appear, tốc độ 10, độ mờ 0');
  ok(typeof sp.hist === 'number', 'ghi lịch sử PhantomShark');
  // hướng: LookAt phía phải thuyền (+x) lúc sinh
  const dir0 = await E(() => { const m = DRPhantomShark.debug.mesh; const n = DRPhantomShark.debug.state(); return n; });
  void dir0;

  // ---- tốc độ: 10 → 40 với 7/s (mỗi 0,02 s cộng 0,14)
  console.log('tốc độ');
  const sp2 = await E(() => {
    const out = [], B = DR.s.boat; B.x = B.x; const r = [];
    for (let i = 0; i < 5; i++) { DRPhantomShark.debug.simulate(1); const s = DRPhantomShark.debug.state(); r.push(s && [s.state, +s.speed.toFixed(3), +s.opacity.toFixed(3), +s.turn.toFixed(3), +s.dist.toFixed(1), +s.dot.toFixed(3)]); if (!s) break; }
    return r;
  });
  console.log('  mỗi giây [trạng thái, tốc độ, độ mờ, quay, cách thuyền, dot]:', JSON.stringify(sp2));
  ok(sp2[0] && near(sp2[0][1], 17, 0.05), 'sau 1 s tốc độ 10 + 7 = 17 (đo ' + (sp2[0] && sp2[0][1]) + ')');
  ok(sp2[1] && near(sp2[1][1], 24, 0.05) || (sp2[1] === null), 'sau 2 s tốc độ 24 (đo ' + (sp2[1] && sp2[1][1]) + ')');
  ok(sp2[0] && near(sp2[0][2], 1 - Math.pow(1 - 1 / 1.5, 2), 0.002) && sp2[1][2] === 1, 'độ mờ 0 → 1 trong 1,5 s theo OutQuad (sau 1 s: ' + (sp2[0] && sp2[0][2]) + ' = 0,889; sau 2 s: 1)');
  const cap = await E(() => {
    const b = DR.s.boat; DRPhantomShark.finish(); DR.grid('INVENTORY').damage.splice(0); delete DR.s.eventHistory.PhantomShark; DRPhantomShark.debug.freeze(true); DRPhantomShark.debug.force();
    DRPhantomShark.debug.place({ x: b.x, z: b.z - 900, y: -1, yaw: Math.PI });
    DRPhantomShark.debug.simulate(4.2); const a = DRPhantomShark.debug.state().speed;
    DRPhantomShark.debug.simulate(0.2); const c = DRPhantomShark.debug.state().speed;
    DRPhantomShark.debug.simulate(3); const d = DRPhantomShark.debug.state().speed;
    return [a, c, d];
  });
  ok(near(cap[0], 39.4, 0.01) && cap[1] === 40 && cap[2] === 40, 'tốc độ chạm trần maxSpeed 40 sau (40−10)/7 = 4,29 s và đứng ở đó (4,2 s: ' + cap[0] + ', 4,4 s: ' + cap[1] + ', 7,4 s: ' + cap[2] + ')');
  await E(() => { const e = DREvents.current; e && e.handle.dispose(); });

  // ---- cùng cú sinh tự nhiên: thuyền đứng yên (log ra; chạm hay tránh đều hợp lệ theo gốc)
  console.log('sinh tự nhiên, thuyền đứng yên');
  await E(() => { DRPhantomShark.debug.freeze(true); const h = DR.s.eventHistory; delete h.PhantomShark; DR.s.grid = DR.s.grid; const inv = DR.grid('INVENTORY'); inv.damage.splice(0); DRPhantomShark.debug.force(); });
  const nat = await E(() => {
    let last = null, t = 0;
    while (DRPhantomShark.debug.active && t < 40) { DRPhantomShark.debug.simulate(0.1); t += 0.1; const s = DRPhantomShark.debug.state(); if (s) last = s; }
    return { t, last, dmg: DR.grid('INVENTORY').damage.length, over: !DRPhantomShark.debug.active };
  });
  console.log('  kết cục', JSON.stringify(nat));
  ok(nat.over, 'sự kiện tự kết thúc (không treo)');
  ok(nat.dmg === 0 || nat.dmg === 2, 'hoặc không hại hoặc đúng 2 ô (đo ' + nat.dmg + ')');

  // ---- chạm đầu: cá mập ở cách 40 m, mặt hướng thẳng vào thuyền, đã vào Chase
  console.log('chạm đầu');
  const head = await E(() => {
    const b = DR.s.boat, inv = DR.grid('INVENTORY'); inv.damage.splice(0); delete DR.s.eventHistory.PhantomShark;
    DRPhantomShark.debug.freeze(true); DRPhantomShark.debug.force();
    DRPhantomShark.debug.place({ x: b.x, z: b.z - 40, y: -1, yaw: Math.PI });   // quay mặt +z (Math.PI: tiến tới = (−sin π, −cos π) = (0, +1)) về phía thuyền
    DRPhantomShark.debug.simulate(1.6);                                         // qua Appear sang Chase
    const s0 = DRPhantomShark.debug.state();
    let t = 0, rec = [];
    while (DRPhantomShark.debug.active && t < 12) { DRPhantomShark.debug.simulate(0.02); t += 0.02; const s = DRPhantomShark.debug.state(); if (s && s.hit) { rec.push(s); break; } }
    const hit = rec[0] || DRPhantomShark.debug.state();
    return { s0, hit, dmg: inv.damage.length, t };
  });
  console.log('  Chase đầu:', JSON.stringify(head.s0 && [head.s0.state, head.s0.speed, head.s0.dist, head.s0.dot]), ' chạm:', JSON.stringify(head.hit && [head.hit.state, head.hit.speed, head.hit.dist]), 'ô hỏng', head.dmg);
  ok(head.s0 && head.s0.state === 'Chase', 'sau 1,5 s Appear sang Chase');
  ok(head.hit && head.hit.hit === true, 'chạm đầu: trigger của capsule chạm thân thuyền');
  ok(head.dmg === 2, 'chạm đầu: +2 ô hỏng (đo ' + head.dmg + ')');
  ok(head.hit && head.hit.bite === true, 'chạm: Bite = true');
  const after = await E(() => { DRPhantomShark.debug.simulate(0.9); const a = DRPhantomShark.debug.state(); DRPhantomShark.debug.simulate(0.8); return { a, gone: !DRPhantomShark.debug.active, dmg: DR.grid('INVENTORY').damage.length }; });
  await sleep(400);   // DREvents.update (vòng lặp thật) gỡ currentEvent khi handle.done
  after.cur = await E(() => DREvents.current);
  ok(after.a && after.a.finishRequested && after.a.opacity < 1, 'sau chạm: RequestEventFinish, độ mờ giảm (' + (after.a && after.a.opacity.toFixed(2)) + ')');
  ok(after.gone && !after.cur, 'sau 1,5 s: huỷ, DREvents.current = null');
  ok(after.dmg === 2, 'oneHitOnly: không cộng thêm (đo ' + after.dmg + ')');

  // ---- requireOneHealthToKill: hull bậc 1 chịu 3 ô (threshold 3 → chết ở ô thứ 4); đã hỏng 2 ô thì cú 2 điểm chỉ thêm 1
  console.log('requireOneHealthToKill');
  const one = await E(() => {
    const inv = DR.grid('INVENTORY'); inv.damage.splice(0); delete DR.s.eventHistory.PhantomShark;
    DRBoat.monsterHit(2, { requireOneHealth: true }); const d1 = inv.damage.length;     // 0 → 2
    DRBoat.monsterHit(2, { requireOneHealth: true }); const d2 = inv.damage.length;     // còn 2 máu: n >= 2 → n = 1
    inv.damage.splice(0);
    return { d1, d2 };
  });
  ok(one.d1 === 2 && one.d2 === 3, 'cú 2 điểm khi còn 2 máu thì chỉ thêm 1 (' + one.d1 + ' → ' + one.d2 + ')');

  // ---- tránh ngang: |dot| < 0,9 ⇒ Disappear, không hại
  console.log('tránh ngang');
  const dodge = await E(() => {
    const b = DR.s.boat, inv = DR.grid('INVENTORY'); inv.damage.splice(0); delete DR.s.eventHistory.PhantomShark;
    DRPhantomShark.debug.freeze(true); DRPhantomShark.debug.force();
    DRPhantomShark.debug.place({ x: b.x, z: b.z - 60, y: -1, yaw: Math.PI });
    DRPhantomShark.debug.simulate(1.6);
    const x0 = b.x;
    b.x += 12;                                                  // bước ngang 12 m: góc lệch ≈ atan(12/ khoảng cách còn lại)
    const log = []; let t = 0, dis = null, lastChase = null;
    while (DRPhantomShark.debug.active && t < 8) { DRPhantomShark.debug.simulate(0.02); t += 0.02; const s = DRPhantomShark.debug.state(); if (!s) break; if (s.state !== 'Chase' && dis == null) dis = { t, s }; if (log.length < 1 && s.state === 'Chase') log.push(s.dot); if (s.state === 'Chase') lastChase = s.chaseDot; }
    const trig = DRPhantomShark.debug.state(); return { dis, dmg: inv.damage.length, dot0: log[0], over: !DRPhantomShark.debug.active, lastChase, trigDot: dis && dis.s.chaseDot };
  });
  console.log('  tránh:', JSON.stringify(dodge.dis && [dodge.dis.t.toFixed(2), dodge.dis.s.state, dodge.dis.s.dot.toFixed(3), dodge.dis.s.dist.toFixed(1)]), 'dot đầu', dodge.dot0, 'hỏng', dodge.dmg);
  ok(dodge.dis && (dodge.dis.s.state === 'Disappear' || dodge.dis.s.state === 'Exiting') && Math.abs(dodge.trigDot) < 0.9, 'tránh ngang: |dot| lúc xét = ' + (dodge.trigDot && dodge.trigDot.toFixed(3)) + ' < 0,9 → Disappear/Exiting');
  ok(dodge.dmg === 0, 'tránh ngang: không gây hại (đo ' + dodge.dmg + ')');
  ok(dodge.over, 'mờ dần rồi huỷ');
  await E(() => { DR_DEBUG.teleport(DR.s.boat.x - 12, DR.s.boat.z, 0); });

  // ---- Xua đuổi (dispelByBanish) và neo bến kết thúc
  console.log('xua đuổi / bến');
  const bn = await E(() => {
    delete DR.s.eventHistory.PhantomShark; DRPhantomShark.debug.force();
    DR.emit('banish', true);
    DRPhantomShark.debug.simulate(1.0); const a = DRPhantomShark.debug.state();
    DRPhantomShark.debug.simulate(0.7); const gone = !DRPhantomShark.debug.active;
    DR.emit('banish', false);
    return { fin: a && a.finishRequested, gone };
  });
  ok(bn.fin && bn.gone, 'Banish: RequestEventFinish rồi huỷ sau 1,5 s');

  // ---- ảnh: cá mập trước mũi thuyền, ban đêm
  console.log('ảnh 1280x720');
  async function shot(pg, tag, vp) {
    await pg.evaluate(() => {
      DR_DEBUG.setTime(0.95); DR.s.worldPhase = 2; DR.s.sanity = 0.1; delete DR.s.eventHistory.PhantomShark;
      const b = DR.s.boat; b.yaw = 0; DR_DEBUG.teleport(b.x, b.z, 0);
      DRPhantomShark.debug.freeze(true); DRPhantomShark.debug.force();
      DRPhantomShark.debug.simulate(1.6);
      DRPhantomShark.debug.freeze(true);
      DRPhantomShark.debug.place({ x: b.x + 2.5, z: b.z - 11, y: -1, yaw: -Math.PI / 2 + 0.5 });
    });
    await sleep(1200);
    const png = await pg.screenshot({ path: path.join(OUT, 'shark-' + tag + '.png') });
    const lit = await colorCount(pg, png, 'r > 120 && b < r * 0.7 && g < r * 0.6');
    const op = await pg.evaluate(() => DRPhantomShark.debug.state());
    console.log('  ' + tag + ': điểm đỏ mép ' + lit + ', độ mờ ' + (op && op.opacity));
    await pg.evaluate(() => { const e = DREvents.current; e && e.handle.dispose(); });
    return { png, lit, op };
  }
  const s1 = await shot(page, '1280x720');
  ok(s1.op && s1.op.opacity > 0.99, 'ảnh 1280x720: cá mập hiện đủ (độ mờ ' + (s1.op && s1.op.opacity) + ')');
  await page.context().close();
  const sm = await newSea(browser, base, errors, 844, 390);
  const s2 = await shot(sm.page, '844x390');
  ok(s2.op && s2.op.opacity > 0.99, 'ảnh 844x390: cá mập hiện đủ');
  await sm.ctx.close();

  const real = errors.filter(e => !/favicon|ERR_FAILED|WebGL/.test(e));
  ok(real.length === 0, 'không lỗi trang/console/HTTP' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  console.log('tổng: ' + pass + ' pass, ' + fail + ' fail');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
