/*
 * DREDGE - kiểm đơn vị R8 (sinh vật biển lành): cá voi xanh, cá voi lộ diện, cá nhà táng, đàn cá heo, đàn cá voi sát thủ (js/cetaceans.js, tools/cetaceans.py).
 * Chạy: node test/dredge-r8cet.js   (ảnh: %TEMP%/dredge-r8cet hoặc SHOTS=...; DR_URL=... để chạy trên Pages)
 * Số gốc: BlueWhaleWorldEvent.cs, CetaceanPodWorldEvent.cs, Cetacean.cs, WhaleSightingWorldEvent.cs; prefab BlueWhaleEvent / DolphinPod / OrcaPod / WhaleEvent / SpermWhaleEvent;
 * clip bluewhale_*, dolphin_*, orca_*, spermwhale_breachattack_RAW, WhaleWorldEvent; WorldEventData (data/worldevents.js). WORLD-GAPS.md §6 dòng R8.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r8cet');
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
  const place = (x, z, yaw) => ev(a => { DR_DEBUG.teleport(a[0], a[1], a[2]); const b = DR.s.boat; b.vx = b.vz = b.w = 0; }, [x, z, yaw]);
  const OPEN = [-200, 0, 0];                                   // biển mở: đủ sâu cho cả bốn sự kiện (quét lưới 50 m, yaw 0), vùng OPEN_OCEAN
  const run = (sec, dt) => ev(a => { for (let i = 0, n = Math.round(a[0] / a[1]); i < n; i++) DRCet.debug.step(a[1]); }, [sec, dt || 1 / 30]);

  // ================================================================== 1. dữ liệu gốc
  console.log('Cá voi / cá heo: dữ liệu');
  const D = await ev(() => {
    const d = DR_CETACEANS, e = d.events, m = d.models;
    const cl = k => Object.fromEntries(Object.entries(m[k].clips).map(([c, v]) => [c, [v.len, v.loop, v.events.map(x => x.t + ':' + x.fn), Object.keys(v.active).map(n => m[k].nodes[n].name + '=' + v.active[n].map(a => a.join('@')).join(','))]]));
    return { events: e, clips: Object.fromEntries(Object.keys(m).map(k => [k, cl(k)])), ctrl: Object.fromEntries(Object.keys(m).map(k => [k, m[k].controller])),
      mesh: Object.fromEntries(Object.keys(m).map(k => [k, m[k].meshes.map(x => [x.name, x.verts, x.bones.length])])), nodes: Object.fromEntries(Object.keys(m).map(k => [k, m[k].nodes.length])),
      we: ['BlueWhale', 'DolphinPod', 'OrcaPod', 'WhaleSighting', 'SpermWhale'].map(n => { const w = DR_WORLDEVENTS[n]; return [n, w.minDepth, w.depthTestPath, w.playerSpawnOffset, w.minSanity, w.maxSanity, w.minWorldPhase, w.spawnStartTime, w.spawnEndTime, w.weight, w.prefab]; }),
      aud: Object.fromEntries(['cet.blue.whale.call.2', 'cet.dolphin.pod.call.6', 'cet.orca.pod.submerge', 'cet.sperm.whale.emerge.sequence', 'cet.whale.sighting'].map(k => [k, !!DRAudio.resolve(k)])) };
  });
  const E = D.events;
  ok(E.blue.duckDistanceThreshold === 35 && E.blue.idleY === -0.5 && E.blue.enterY === 0 && E.blue.exitY === -15 && E.blue.duckedY === -1.5 && E.blue.rotationSpeed === 1 && E.blue.horizontalSpeed === 3.5 &&
     E.blue.exitVerticalSpeed === 3 && E.blue.destinationProximityThreshold === 30 && E.blue.timeBetweenCallsMin === 6 && E.blue.timeBetweenCallsMax === 10 && E.blue.emergeSoundDelay === 2.8 && E.blue.rootScale[0] === 1.3,
    'BlueWhaleEvent.prefab: duck 35, idle -0,5, exit -15, ducked -1,5, 3,5 m/s, chìm 3 m/s, đích 30, kêu 6-10 s, emerge 2,8 s, gốc co 1,3');
  ok(E.dolphin.duckDistanceThreshold === 12.5 && E.dolphin.upY === -0.5 && E.dolphin.duckedY === -2.5 && E.dolphin.downY === -15 && E.dolphin.enterVerticalSpeed === 3 && E.dolphin.destinationProximityThreshold === 18 &&
     E.dolphin.pathLength === 100 && E.dolphin.timeBetweenCallsMin === 5 && E.dolphin.timeBetweenCallsMax === 8 && E.dolphin.cetaceans.length === 3, 'DolphinPod.prefab: 3 con, duck 12,5, up -0,5, ducked -2,5, down -15, đích 18, đường 100 m, kêu 5-8 s');
  ok(E.dolphin.cetaceans.map(c => c.animatorSpeed).join() === '1,1.5,1.2' && E.dolphin.cetaceans.every(c => c.timeBetweenJumpsMin === 0 && c.timeBetweenJumpsMax === 3 && c.isAllowedToJump === 1 && c.jumpClips.length === 6 && c.jumpAudio.vol === 0.4 && c.jumpAudio.max === 40),
    'Cetacean của cá heo: animatorSpeed 1 / 1,5 / 1,2, nhảy mỗi 0-3 s, 6 clip nhảy, tiếng 0,4 (5-40 m)');
  ok(E.orca.duckDistanceThreshold === 15 && E.orca.duckedY === -8 && E.orca.cetaceans.length === 2 && E.orca.cetaceans.map(c => c.animatorSpeed).join() === '1,1.1' &&
     E.orca.cetaceans.every(c => c.timeBetweenJumpsMin === 3 && c.timeBetweenJumpsMax === 10 && c.jumpAudioDelaySec === 1 && c.signalOnEvent && c.jumpParticles === 'BlowholeParticles') && E.orca.timeBetweenCallsMax === 10,
    'OrcaPod.prefab: 2 con, duck 15, ducked -8, nhảy 3-10 s, tiếng trễ 1 s, FireSignal bật BlowholeParticles, kêu 5-10 s');
  ok(E.whale.finishDelaySec === 24 && E.sperm.finishDelaySec === 12 && E.whale.class === 'WhaleSightingWorldEvent' && E.sperm.class === 'WhaleSightingWorldEvent', 'WhaleEvent 24 s, SpermWhaleEvent 12 s (cùng WhaleSightingWorldEvent)');
  const C = D.clips;
  ok(near(C.blue.emerge[0], 8.6333, 0.001) && near(C.blue.swim[0], 10.3333, 0.001) && C.blue.swim[1] && !C.blue.emerge[1] && near(C.dolphin.jump[0], 2, 0.001) && near(C.orca.jump[0], 2, 0.001) &&
     near(C.whale.sight[0], 24.0833, 0.001) && near(C.sperm.breach[0], 11.0833, 0.001), 'clip: emerge 8,633 s, swimloop 10,333 s lặp, jump 2 s, WhaleWorldEvent 24,083 s, breach 11,083 s');
  ok(C.blue.emerge[3].includes('EmergeSplash=0@0,2.9@1') && C.blue.emerge[3].includes('BlowholeParticles=0@0,4.5@1'),
    'đường cong m_IsActive: EmergeSplash bật 2,9 s, BlowholeParticles bật 4,5 s', JSON.stringify(C.blue.emerge[3]));
  ok(C.dolphin.jump[3].includes('SmallSplash=0@0,0.16667@1,1.26667@0') && C.dolphin.jump[3].includes('EndSplash=0@0,0.76667@1') && C.orca.jump[2].join() === '1.23333:FireSignal' && C.orca.jump[3].includes('SmallSplash=0@0,1.03333@1'),
    'cá heo: SmallSplash 0,167-1,267 s, EndSplash bật 0,767 s; sát thủ: SmallSplash 1,033 s, FireSignal 1,233 s', JSON.stringify([C.dolphin.jump[3], C.orca.jump[2]]));
  const T = D.ctrl;
  ok(T.blue.transitions.length === 1 && T.blue.transitions[0].exit === 0.97104 && T.blue.transitions[0].dur === 0.25 && T.blue.default === 'bluewhale_emerge_RAW', 'Animator cá voi xanh: emerge -> swimloop (ExitTime 0,971, 0,25 s), mặc định emerge');
  const jt = T.dolphin.transitions;
  ok(T.dolphin.default === 'dolphin_swimidle' && jt.some(t => t.from === 'dolphin_swimidle' && t.to === 'dolphin_jump' && t.cond[0] === 'jump' && !t.hasExit && t.dur === 0.25) && jt.some(t => t.from === 'dolphin_jump' && t.hasExit && t.exit === 1 && t.dur === 0) &&
     T.orca.states.orca_jump.clip === 'orca_jump_RAW', 'Animator cá heo / sát thủ: swimidle -(trigger jump, 0,25 s)-> jump -(ExitTime 1, 0 s)-> swimidle');
  ok(D.mesh.blue[0][1] === 1348 && D.mesh.dolphin[0][1] === 460 && D.mesh.orca[0][1] === 924 && D.mesh.whale[0][1] === 640 && D.mesh.sperm.length === 2 && D.mesh.sperm.map(x => x[1]).sort().join() === '1478,403' && D.nodes.blue === 24 && D.nodes.whale === 26, 'mesh có trọng số xương đủ: 1348 / 460 / 924 / 640 / (1478 + 403) đỉnh');
  const W = Object.fromEntries(D.we.map(w => [w[0], w]));
  ok(W.BlueWhale[1] === 0.35 && JSON.stringify(W.BlueWhale[2]) === '[[-25,0,125],[0,0,50],[25,0,0]]' && W.DolphinPod[1] === 0.1 && JSON.stringify(W.DolphinPod[2]) === '[[15,0,25],[15,0,125]]' && JSON.stringify(W.OrcaPod[2]) === '[[-15,0,25],[-15,0,125]]' &&
     W.WhaleSighting[10] === 'GameObject:WhaleEvent' && W.SpermWhale[6] === 2 && JSON.stringify(W.WhaleSighting[3]) === '[5,-22,85]', 'WorldEventData: độ sâu 0,35 / 0,1, đường độ sâu của từng sự kiện, WhaleSighting sinh ở (5, -22, 85), SpermWhale từ giai đoạn 2');
  ok(Object.values(D.aud).every(Boolean), 'tiếng cet.* đã vào DR_AUDIO: ' + JSON.stringify(D.aud));

  // ================================================================== 2. sinh trên đường độ sâu của chúng
  console.log('Điều kiện sinh (đường độ sâu)');
  await place(...OPEN);
  await sleep(600);
  await ev(() => { DR.s.worldPhase = 2; DR.s.sanity = 1; });
  const cand = await ev(() => ['BlueWhale', 'DolphinPod', 'OrcaPod', 'WhaleSighting'].map(n => [n, DREvents.debug.test(n)]));
  ok(cand.every(c => c[1].ok), 'biển mở (-200, 0): BlueWhale, DolphinPod, OrcaPod, WhaleSighting đều qua TestWorldEvent', JSON.stringify(cand));
  const shallow = await ev(() => { const b = DR.s.boat, keep = [b.x, b.z]; DR_DEBUG.teleport(3, -1, -1.57); const r = DREvents.debug.test('BlueWhale'); const r2 = DREvents.debug.test('DolphinPod'); DR_DEBUG.teleport(keep[0], keep[1], 0); return [r, r2]; });
  ok(!shallow[0].ok && shallow[0].fails.includes('depth') && !shallow[1].ok && shallow[1].fails.includes('depth'), 'vùng nông (bến Greater Marrow): BlueWhale và DolphinPod bị loại vì độ sâu', JSON.stringify(shallow));
  await place(...OPEN);
  await sleep(400);
  const sp = await ev(() => { DR.s.sanity = 0.5; DR.s.worldPhase = 2; const a = DREvents.debug.test('SpermWhale'), c = DREvents.debug.test('DolphinPod'); DR.s.sanity = 1; return [a, c]; });
  ok(sp[0].ok && !sp[1].ok && sp[1].fails.includes('sanity'), 'sanity 0,5 (giai đoạn 2): SpermWhale được bốc, DolphinPod (cần ≥ 0,75) bị loại', JSON.stringify(sp));

  // ================================================================== 3. cá voi xanh
  console.log('Cá voi xanh (BlueWhaleWorldEvent)');
  await place(...OPEN);
  await ev(() => {
    window.__hits = { mon: 0, proc: 0 };
    if (DRBoat.monsterHit) { const o = DRBoat.monsterHit; DRBoat.monsterHit = function () { window.__hits.mon++; return o.apply(this, arguments); }; }
    if (DRBoat.processHit) { const o = DRBoat.processHit; DRBoat.processHit = function () { window.__hits.proc++; return o.apply(this, arguments); }; }
    DR.grid('INVENTORY').damage.length = 0;
  });
  const dmg0 = await ev(() => DR.grid('INVENTORY').damage.length);
  const B = await ev(() => {
    const b = DR.s.boat, h = DREvents.debug.force('BlueWhale'), L = DRCet.debug.instances().pop(), me = L.me;
    const st = DREvents.offsetWorld(b, [-25, 0, 125]), en = DREvents.offsetWorld(b, [25, 0, 0]);
    const o = { spawn: [me.x, me.z], st, en, podY0: me.podY, state0: me.state, cur: DREvents.current && DREvents.current.name, b: [b.x, b.z, b.yaw] };
    DRCet.debug.step(1 / 30);
    o.podY1 = me.podY; o.state1 = me.state; return o;
  });
  ok(near(B.spawn[0], B.st[0], 1e-6) && near(B.spawn[1], B.st[1], 1e-6) && B.cur === 'BlueWhale', 'sinh ở thuyền + (-25, 0, 125) = điểm đầu đường độ sâu', JSON.stringify(B));
  ok(B.state1 === 'IDLING' && B.podY1 === -0.5, 'Activate: IDLING ngay, PodContainer nhảy tới idleY -0,5 (từ exitY -15 lúc Awake)', JSON.stringify(B));
  const B2 = await ev(() => {
    const L = DRCet.debug.instances().pop(), me = L.me, I = me.insts[0], T = THREE, out = { ys: [], states: {}, fx: {}, calls0: DRCet.debug.calls().length };
    const f = new T.Vector3(0, 0, -1).applyQuaternion(me.podG.quaternion), dx = me.end.x - me.start.x, dz = me.end.z - me.start.z, n = Math.hypot(dx, dz);
    out.dir = f.x * dx / n + f.z * dz / n; out.len = n; out.hy = f.y;
    const x0 = me.x, z0 = me.z; let t = 1 / 30;
    for (; t < 10; t += 1 / 30) { DRCet.debug.step(1 / 30); const k = Math.round(t); if (Math.abs(t - k) < 1e-6 && [3, 5, 8, 9].includes(k)) { out.states[k] = I.anim.cur.st; out.fx[k] = DRCet.debug.fx(DRCet.debug.live().findIndex(m => m.kind === 'blue'))[0]; } }
    out.moved = Math.hypot(me.x - x0, me.z - z0); out.t = me.t; out.vol = me.swim && !!me.swim.alive; out.dist = Math.hypot(me.x - me.end.x, me.z - me.end.z);
    return out;
  });
  ok(B2.dir > 0.99999 && Math.abs(B2.hy) < 1e-9, 'PodContainer.rotation = LookRotation(cuối - đầu): mặt trước theo đường đi (cos ' + B2.dir.toFixed(6) + ')', JSON.stringify(B2));
  ok(near(B2.moved / (B2.t - 1 / 30), 3.5, 0.01), 'gốc DOMove tuyến tính 3,5 m/s: ' + B2.moved.toFixed(2) + ' m sau ' + (B2.t - 1 / 30).toFixed(2) + ' s', JSON.stringify(B2));
  ok(B2.states[3] === 'bluewhale_emerge_RAW' && B2.states[8] === 'bluewhale_emerge_RAW' && B2.states[9] === 'bluewhale_swimloop', 'Animator: emerge 8,63 s (ExitTime 0,971 = 8,38 s) rồi swimloop: ' + JSON.stringify(B2.states));
  ok(B2.fx[3][1] === true && B2.fx[3][0] === false && B2.fx[5][0] === true, 'EmergeSplash bật ở 2,9 s (có lúc 3 s), BlowholeParticles bật ở 4,5 s (có lúc 5 s): ' + JSON.stringify(B2.fx));
  // né: thuyền đến gần thì y = Lerp(duckedY, idleY, InverseLerp(0, 35, d)), đặt thẳng
  const Bd = await ev(() => {
    const me = DRCet.debug.instances().pop().me, b = DR.s.boat, out = [];
    for (const d of [30, 20, 10, 0.5]) { b.x = me.x + d; b.z = me.z; DRCet.debug.step(1 / 30); const dd = Math.hypot(b.x - me.x, b.z - me.z); out.push([d, me.podY, -1.5 + (-0.5 - -1.5) * Math.min(1, dd / 35), me.isDucked]); }
    b.x = me.x + 60; DRCet.debug.step(1 / 30); out.push([60, me.podY, -0.5, me.isDucked]);
    return out;
  });
  ok(Bd.every(r => near(r[1], r[2], 1e-6)) && Bd[0][3] === true && Bd[4][3] === false, 'né: y = Lerp(-1,5; -0,5; InverseLerp(0, 35, d)) tại 30 / 20 / 10 / 0,5 / 60 m, hết né về idleY: ' + JSON.stringify(Bd));
  await place(...OPEN);
  // kêu mỗi 6-10 s; kết thúc khi cách đích < 30
  const Bc = await ev(() => {
    const me = DRCet.debug.instances().pop().me, b = DR.s.boat, c0 = DRCet.debug.calls().filter(c => c.call).length;
    const times = []; let t = 0, endAt = null, minY = 0;
    for (; t < 80 && !me.destroyed; t += 1 / 30) {
      const n = DRCet.debug.calls().filter(c => c.call).length;
      DRCet.debug.step(1 / 30);
      if (DRCet.debug.calls().filter(c => c.call).length > n) times.push(+me.t.toFixed(2));
      if (me.finishRequested && endAt == null) endAt = { t: me.t, dist: Math.hypot(me.x - me.end.x, me.z - me.end.z), y: me.podY };
      minY = Math.min(minY, me.podY);
    }
    return { times, endAt, minY, destroyed: me.destroyed, done: me.done, tt: me.t, c0 };
  });
  await sleep(300);
  Bc.cur = await ev(() => DREvents.current && DREvents.current.name);
  const gaps = Bc.times.map((t, i) => t - (i ? Bc.times[i - 1] : 0));
  ok(Bc.times.length >= 2 && gaps.slice(1).every(g => g >= 5.9 && g <= 10.1), 'tiếng kêu cách nhau 6-10 s: ' + JSON.stringify(Bc.times));
  ok(Bc.endAt && Bc.endAt.dist < 30 && Bc.endAt.dist > 29.8, 'RequestEventFinish khi cách đích < 30 m (' + (Bc.endAt && Bc.endAt.dist.toFixed(2)) + ' m)', JSON.stringify(Bc));
  ok(Bc.destroyed && Bc.done && Bc.minY <= -14.99 && Bc.cur === null, 'chìm tới exitY -15 rồi huỷ, DREvents.current rỗng (đến lúc huỷ ' + Bc.tt.toFixed(1) + ' s)', JSON.stringify(Bc));
  const exitT = Bc.tt - Bc.endAt.t;
  ok(near(exitT, Math.abs(Bc.endAt.y + 15) / 3, 0.1), 'chìm 3 m/s: ' + exitT.toFixed(2) + ' s cho ' + Math.abs(Bc.endAt.y + 15).toFixed(1) + ' m', String(exitT));

  // ================================================================== 4. đàn cá heo
  console.log('Đàn cá heo (CetaceanPodWorldEvent)');
  await place(...OPEN);
  const P = await ev(() => {
    const b = DR.s.boat, h = DREvents.debug.force('DolphinPod'), me = DRCet.debug.instances().pop().me, en = DREvents.offsetWorld(b, [15, 0, 125]);
    const o = { insts: me.insts.length, y0: me.podY, end: [me.end.x, me.end.z], enExp: en, spawn: [me.x, me.z], spExp: DREvents.offsetWorld(b, [15, 0, 25]), state: me.state };
    const ys = {}; let t = 0;
    for (; t < 6; t += 1 / 30) { DRCet.debug.step(1 / 30); const k = +(t + 1 / 30).toFixed(2); if ([1, 2, 4].includes(Math.round(k * 10) / 10) && Math.abs(k - Math.round(k)) < 1e-6) ys[Math.round(k)] = me.podY; }
    o.ys = ys; o.y6 = me.podY; o.state6 = me.state; o.canJump = me.insts.map(i => i.canJump);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(me.podG.quaternion), dx = me.end.x - me.x, dz = me.end.z - me.z, n = Math.hypot(dx, dz);
    o.dir = (f.x * dx + f.z * dz) / n; o.rootScale = me.rootG.scale.x;
    return o;
  });
  ok(P.insts === 3 && near(P.spawn[0], P.spExp[0], 1e-6) && near(P.spawn[1], P.spExp[1], 1e-6) && near(P.end[0], P.enExp[0], 1e-6) && near(P.end[1], P.enExp[1], 1e-6),
    '3 con; sinh ở (15, 0, 25) và đích = (15, 0, 125) = đúng đường độ sâu (gốc + forward · 100)', JSON.stringify(P));
  const ease = t => { const u = Math.min(1, t / (14.5 / 3)); return -15 + 14.5 * (1 - (1 - u) * (1 - u)); };
  ok(P.y0 === -15 && P.state === 'ENTERING' && near(P.ys[1], ease(1), 0.02) && near(P.ys[2], ease(2), 0.02) && near(P.ys[4], ease(4), 0.02) && P.y6 === -0.5 && P.state6 === 'IDLING' && P.canJump.every(Boolean),
    'vào: y -15 -> -0,5 trong 14,5 / 3 = 4,83 s (OutQuad): ' + JSON.stringify(P.ys) + ', xong thì IDLING và CanJump', JSON.stringify(P));
  ok(P.dir > 0.9 && P.rootScale === 1.3, 'xoay Slerp về hướng đi (cos ' + P.dir.toFixed(3) + ' sau 6 s), gốc co 1,3');
  const Pj = await ev(() => {
    const idx = DRCet.debug.live().findIndex(m => m.key === 'dolphin'), me = DRCet.debug.instances()[idx].me, seen = {}, jumps = [0, 0, 0], states = [new Set(), new Set(), new Set()], fxSeen = new Set();
    let last = 0, calls = [];
    for (let t = 0; t < 14; t += 1 / 30) {
      DRCet.debug.step(1 / 30);
      DRCet.debug.anim(idx).forEach((a, i) => states[i].add(a.st));
      DRCet.debug.fx(idx).forEach(r => r.forEach((v, j) => { if (v) fxSeen.add(j); }));
    }
    return { states: states.map(s => Array.from(s)), speeds: DRCet.debug.anim(idx).map(a => a.speed), calls: DRCet.debug.calls().filter(c => c.jump).length, fx: Array.from(fxSeen), t: me.t,
      callTimes: DRCet.debug.calls().filter(c => c.call).map(c => +c.t.toFixed(1)) };
  });
  ok(Pj.states.every(s => s.includes('dolphin_jump') && s.includes('dolphin_swimidle')) && Pj.speeds.join() === '1,1.5,1.2', 'mỗi con tự nhảy (trigger jump): swimidle <-> jump trong 14 s, animatorSpeed 1 / 1,5 / 1,2: ' + JSON.stringify(Pj.states));
  ok(Pj.calls >= 6 && Pj.fx.includes(1) && Pj.fx.includes(2), 'số lần nhảy ' + Pj.calls + ' (mỗi 0-3 s); hệ hạt EndSplash (nút 1) và SmallSplash (nút 2) bật theo đường cong m_IsActive', JSON.stringify(Pj));
  ok(Pj.callTimes.length >= 1 && Pj.callTimes.every((t, i) => i === 0 ? t >= 4.9 && t <= 8.1 : t - Pj.callTimes[i - 1] >= 4.9 && t - Pj.callTimes[i - 1] <= 8.1), 'tiếng kêu mỗi 5-8 s: ' + JSON.stringify(Pj.callTimes));
  const Pd = await ev(() => {
    const idx = DRCet.debug.live().findIndex(m => m.key === 'dolphin'), me = DRCet.debug.instances()[idx].me, b = DR.s.boat, out = [];
    for (const d of [6, 12]) { b.x = me.x + d; b.z = me.z; DRCet.debug.step(1 / 30); const dd = Math.hypot(b.x - me.x, b.z - me.z); out.push([d, me.podY, -2.5 + 2 * Math.min(1, dd / 12.5), DRCet.debug.anim(idx).map(a => a.canJump).join()]); }
    b.x = me.x + 40; DRCet.debug.step(1 / 30); out.push([40, me.podY, -0.5, DRCet.debug.anim(idx).map(a => a.canJump).join()]);
    return out;
  });
  ok(Pd.every(r => near(r[1], r[2], 1e-6)) && Pd[0][3] === 'false,false,false' && Pd[2][3] === 'true,true,true', 'né ở 12,5 m: y = Lerp(-2,5; -0,5; d/12,5) (6 m, 12 m), CanJump tắt khi né và bật lại khi hết né: ' + JSON.stringify(Pd));
  await place(...OPEN);
  const Pe = await ev(() => {
    const idx = DRCet.debug.live().findIndex(m => m.key === 'dolphin'), me = DRCet.debug.instances()[idx].me;
    let t = 0, fin = null; const y0 = [];
    for (; t < 60 && !me.destroyed; t += 1 / 30) { DRCet.debug.step(1 / 30); if (me.finishRequested && !fin) fin = { t: me.t, d: Math.hypot(me.x - me.end.x, me.z - me.end.z), y: me.podY }; }
    return { fin, tt: me.t, destroyed: me.destroyed };
  });
  await sleep(300);
  Pe.cur = await ev(() => DREvents.current && DREvents.current.name);
  ok(Pe.fin && Pe.fin.d < 18 && Pe.fin.d > 17.8 && near(Pe.fin.t, (100 - 18) / 3.5, 0.2) && Pe.destroyed && Pe.cur === null, 'kết thúc khi cách đích < 18 m (' + (Pe.fin && Pe.fin.t.toFixed(1)) + ' s), chìm về -15 rồi huỷ (' + Pe.tt.toFixed(1) + ' s)', JSON.stringify(Pe));

  // ================================================================== 5. cá voi sát thủ
  console.log('Đàn cá voi sát thủ');
  await place(...OPEN);
  const O = await ev(() => {
    const b = DR.s.boat; DREvents.debug.force('OrcaPod');
    const idx = DRCet.debug.live().findIndex(m => m.key === 'orca'), me = DRCet.debug.instances()[idx].me;
    const o = { n: me.insts.length, end: [me.end.x, me.end.z], enExp: DREvents.offsetWorld(b, [-15, 0, 125]), swim: !!me.swim };
    let blow = 0, sig = false; const seenJump = [false, false];
    for (let t = 0; t < 60 && !sig; t += 1 / 30) { DRCet.debug.step(1 / 30); DRCet.debug.anim(idx).forEach((a, i) => { if (a.st === 'orca_jump') seenJump[i] = true; }); if (DRCet.debug.fx(idx).some(r => r[1])) sig = true; }
    o.sig = sig; o.seenJump = seenJump; o.t = me.t; o.speeds = DRCet.debug.anim(idx).map(a => a.speed);
    o.y = me.podY;
    return o;
  });
  ok(O.n === 2 && near(O.end[0], O.enExp[0], 1e-6) && near(O.end[1], O.enExp[1], 1e-6) && O.swim && O.speeds.join() === '1,1.1', '2 con; đích = (-15, 0, 125) (đường độ sâu của OrcaPod), tiếng bơi có; animatorSpeed 1 / 1,1', JSON.stringify(O));
  ok(O.sig && O.seenJump.some(Boolean), 'sát thủ nhảy (3-10 s) và sự kiện hoạt ảnh FireSignal (1,233 s trong clip) bật BlowholeParticles (lúc ' + O.t.toFixed(1) + ' s)', JSON.stringify(O));
  const Od = await ev(() => {
    const idx = DRCet.debug.live().findIndex(m => m.key === 'orca'), me = DRCet.debug.instances()[idx].me, b = DR.s.boat, out = [];
    for (const d of [5, 14]) { b.x = me.x + d; b.z = me.z; DRCet.debug.step(1 / 30); const dd = Math.hypot(b.x - me.x, b.z - me.z); out.push([d, me.podY, -8 + 7.5 * Math.min(1, dd / 15)]); }
    return out;
  });
  ok(Od.every(r => near(r[1], r[2], 1e-6)), 'né ở 15 m: y = Lerp(-8; -0,5; d/15): ' + JSON.stringify(Od));
  await place(...OPEN);
  await ev(() => DRCet.debug.clear());

  // ================================================================== 6. cá voi lộ diện + cá nhà táng
  console.log('Cá voi lộ diện / cá nhà táng (WhaleSightingWorldEvent)');
  const Wh = await ev(() => {
    const b = DR.s.boat; DREvents.debug.force('WhaleSighting');
    const idx = DRCet.debug.live().findIndex(m => m.key === 'whale'), me = DRCet.debug.instances()[idx].me, I = me.insts[0];
    const sp = DREvents.offsetWorld(b, [5, -22, 85]);
    const o = { pos: [me.rootG.position.x, me.rootG.position.z], sp, yaw: me.rootG.rotation.y, boatYaw: b.yaw, y0: I.nodes[0].position.y, cur: DREvents.current && DREvents.current.name };
    const seen = {}; let t = 0;
    for (; t < 23.9; t += 1 / 30) { DRCet.debug.step(1 / 30); const k = Math.round(t * 10) / 10; if ([5, 10.5, 12].includes(k) && !seen[k]) seen[k] = DRCet.debug.fx(idx)[0]; }
    o.fx = seen; o.aliveAt23 = !me.destroyed; DRCet.debug.step(0.3); o.aliveAt24 = !me.destroyed; o.n = DRCet.debug.live().length;
    return o;
  });
  await sleep(300);
  Wh.cur2 = await ev(() => DREvents.current && DREvents.current.name);
  const dyaw = ((Wh.yaw - Wh.boatYaw - Math.PI) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  ok(near(Wh.pos[0], Wh.sp[0], 1e-6) && near(Wh.pos[1], Wh.sp[1], 1e-6) && near(dyaw, 0, 1e-6) && near(Wh.y0, -22, 1e-6) && Wh.cur === 'WhaleSighting', 'sinh ở (5, -22, 85), gốc xoay = góc thuyền + 180° (Activate)', JSON.stringify(Wh));
  ok(Wh.aliveAt23 && !Wh.aliveAt24 && Wh.cur2 === null, 'sống đúng 24 s (finishDelaySec) rồi EventFinished + huỷ', JSON.stringify(Wh));
  ok(JSON.stringify(Wh.fx[5]) === '[true,true,false,true]' && JSON.stringify(Wh.fx[10.5]) === '[true,false,true,true]' && JSON.stringify(Wh.fx[12]) === '[true,true,true,true]', 'hệ hạt theo m_IsActive của WhaleWorldEvent (Splash, Tail, Blowhole, BoatTrail): 5 s Splash+Tail; 10,5 s Tail tắt (7,6-10,53), Blowhole bật (10,27); 12 s tất cả: ' + JSON.stringify(Wh.fx));
  const Sp = await ev(() => {
    DR.s.sanity = 0.5; DREvents.debug.force('SpermWhale'); DR.s.sanity = 1;
    const idx = DRCet.debug.live().findIndex(m => m.key === 'sperm'), me = DRCet.debug.instances()[idx].me;
    const seen = {}; let t = 0;
    for (; t < 11.9; t += 1 / 30) { DRCet.debug.step(1 / 30); const k = Math.round(t * 10) / 10; if ([0.5, 4.5, 6, 7].includes(k) && !seen[k]) seen[k] = DRCet.debug.fx(idx)[0]; }
    const a11 = DRCet.debug.anim(idx)[0].t; const alive11 = !me.destroyed; DRCet.debug.step(0.3);
    return { fx: seen, alive11, alive12: !me.destroyed, a11, n: DRCet.debug.live().length };
  });
  ok(Sp.alive11 && !Sp.alive12 && near(Sp.a11, 11.9, 0.1), 'cá nhà táng sống 12 s (finishDelaySec), clip breach 11,08 s không lặp', JSON.stringify(Sp));
  ok(Sp.fx[0.5].slice(0, 2).join() === 'true,true' && Sp.fx[4.5][3] === true && Sp.fx[6][4] === true && Sp.fx[7][5] === true && Sp.fx[7][4] === true, 'hệ hạt breach: TentacleTip 0,083 s, TentacleBase 0,375 s, WhaleSplashEmerge 3,875 s, WhaleSplash2 5,667 s, WhaleSplash3 6,667 s: ' + JSON.stringify(Sp.fx));
  const Rq = await ev(() => {
    DREvents.debug.force('WhaleSighting'); DRCet.debug.step(1 / 30);
    DREvents.current.handle.requestFinish(); DRCet.debug.step(1 / 30);
    return { done: DREvents.current === null, alive: DRCet.debug.live().length, t: DRCet.debug.live()[0] && DRCet.debug.live()[0].t };
  });
  ok(Rq.alive === 1, 'RequestEventFinish (neo bến...) chỉ gọi EventFinished: vật thể vẫn bơi tới hết 24 s như bản gốc', JSON.stringify(Rq));
  await ev(() => DRCet.debug.clear());

  // ================================================================== 7. không gây sát thương
  console.log('Không gây sát thương');
  const H = await ev(() => ({ hits: window.__hits, dmg: DR.grid('INVENTORY').damage.length, dbg: DRCet.debug.damage() }));
  ok(H.hits.mon === 0 && H.hits.proc === 0 && H.dmg === dmg0 && H.dbg === 0, 'suốt bốn đàn + hai cá voi: monsterHit 0 lần, processHit 0 lần, ô hỏng không đổi (' + H.dmg + ')', JSON.stringify(H));

  // ================================================================== 8. ảnh (1280x720 và 844x390) + khung hình
  console.log('Ảnh');
  const setupFor = (name, ahead, steps, extra) => async () => {
    await ev(() => DRCet.debug.clear());
    await place(...OPEN);
    await sleep(500);
    await ev(a => {
      DR.s.worldPhase = 2; DR.s.sanity = a[0] === 'SpermWhale' ? 0.5 : 1; DREvents.debug.force(a[0]); DR.s.sanity = 1;
      const me = DRCet.debug.instances().pop().me, b = DR.s.boat, f = [-Math.sin(b.yaw), -Math.cos(b.yaw)], r = [Math.cos(b.yaw), -Math.sin(b.yaw)];
      me.move = null; me.x = b.x + f[0] * a[1] + r[0] * a[3]; me.z = b.z + f[1] * a[1] + r[1] * a[3]; me.rootG.position.x = me.x; me.rootG.position.z = me.z;
      for (let i = 0; i < a[2]; i++) DRCet.debug.step(0.1);
    }, [name, ahead, steps, extra || 0]);
  };
  const shots = async (key, name, ahead, steps, extra) => {
    for (const [tag, w, h] of [['1280', 1280, 720], ['844', 844, 390]]) {
      await page.setViewportSize({ width: w, height: h });
      await setupFor(name, ahead, steps, extra)();
      await ev(() => { document.querySelectorAll('[class*=banner],[id*=banner],.hud-toast,#dr-tut').forEach(e => e.remove()); });
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, key + '-' + tag + '.png') });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  };
  const perf0 = await ev(() => (DR_DEBUG.perf ? DR_DEBUG.perf() : null));
  await shots('bluewhale', 'BlueWhale', 28, 130, 0);
  const perf1 = await ev(() => (DR_DEBUG.perf ? DR_DEBUG.perf() : null));
  await shots('dolphins', 'DolphinPod', 22, 150, 0);
  await shots('orcas', 'OrcaPod', 24, 160, 0);
  await shots('whale-sighting', 'WhaleSighting', 38, 42, 0);
  await shots('spermwhale', 'SpermWhale', 38, 32, 0);
  console.log('  perf (khung hình, DR_DEBUG.perf): không có cá voi ' + JSON.stringify(perf0) + ' | có cá voi xanh ' + JSON.stringify(perf1));
  ok(fs.readdirSync(OUT).filter(f => /-(1280|844)\.png$/.test(f)).length >= 10, 'đủ 10 ảnh (5 sinh vật × 2 cỡ) ở ' + OUT);

  ok(errors.length === 0, 'không có pageerror / lỗi console / HTTP 4xx', errors.join(' | '));
  console.log('\n' + (fail ? 'TRƯỢT' : 'ĐẠT') + ': ' + pass + ' đạt, ' + fail + ' trượt');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
