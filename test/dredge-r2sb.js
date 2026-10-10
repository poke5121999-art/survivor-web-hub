/*
 * DREDGE - kiểm đơn vị R2 (sinh vật Stellar Basin js/sbcreature.js + sứa nổ bào tử js/jelly.js; tools/sbcreature.py; data/sbcreature.js, data/jelly.js).
 * Chạy: node test/dredge-r2sb.js   (ảnh: %TEMP%/dredge-r2sb hoặc SHOTS=...; DR_URL=... để chạy trên Pages)
 * Số gốc: SBMonsterAnimationHelper.cs (Update :211-266: bỏ qua khi Xua đuổi hoặc máy Xua đuổi; góc 5°, 5 s, tỉ lệ 0,7 → 1 trên 0 → 50 m, call 22 s, aggro 10 s),
 * VariablePlayerDamager (damagePoints 2, oneHitOnly, không requireOneHealthToKill; người nghe cộng dồn sau đòn trượt), PlayerDetector.cs (đếm 0 → ≥ 1),
 * ClampedLookAtTarget.cs (0,3 → 2 trong 2 s), SBMonsterController (Spawn / Idle / AlertIdle / Attack / Banish), BanishMachine (0,5 ngày),
 * Jellyfish.cs / JellyfishController.cs (kiểm mỗi 5 s, ban đêm Show 8 s, cầu phát hiện 0,7, FireSignal 1,0 s), JellySporeCollision.cs:11 (InfectRandomItemInInventory).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r2sb');
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
  const ST = () => ev(() => DRSbCreature.debug.state());
  // đứng yên mọi thứ ngoài hai mô-đun (DR.paused = true làm vòng chính và vòng tự chạy của mô-đun nhận dt = 0), rồi bước tay từng khung 1/30 s
  const step = (n, dt) => ev(([n, dt]) => { for (let i = 0; i < n; i++) DRSbCreature.debug.step(dt || 1 / 30); return DRSbCreature.debug.state(); }, [n, dt]);
  const O = await ev(() => DR_SBCREATURE.origin);
  const put = (dx, dz, yaw) => ev(([x, z, yaw]) => { DR_DEBUG.teleport(x, z, yaw || 0); DR.s.boat.vx = 0; DR.s.boat.vz = 0; }, [O[0] + dx, O[2] + dz, yaw]);
  const damage = () => ev(() => DR.grid('INVENTORY').damage.length);
  const outQ = t => 1 - (1 - t) * (1 - t);
  // sửa thuyền giữa các phần (đòn 2 ô cộng dồn sẽ làm chìm thuyền và Player.IsAlive = false chặn mọi đòn sau)
  const repair = () => ev(() => { DR.grid('INVENTORY').damage.length = 0; return DR.mode; });
  await ev(() => { DR.paused = true; DR.s.worldPhase = 2; DR.s.time = Math.floor(DR.s.time) + 0.5; DR.s.hullTier = 5; });
  await sleep(600);

  // ================================================================ 1. dữ liệu gốc
  const dat = await ev(() => {
    const C = DR_SBCREATURE, J = DR_JELLY;
    return {
      origin: C.origin, spheres: C.detect.spheres, off: C.detect.offset, dmg: C.damage, p: C.params, coll: C.colliders.map(c => [c.radius, c.height, c.dir]),
      trans: C.controller.trans.map(t => ({ from: t.from, to: t.to, dur: t.dur, exit: t.exit })), nodes: C.nodes.length, rends: C.renderers.length, clips: C.clips.length,
      groups: C.groups.map(g => g.id), atkEv: C.clips.find(c => c.file === 'SBMonster_ATentacle_Attack2RW.anim').ev,
      jn: J.instances.length, jp: J.params, small: J.instances.filter(i => i.orbit === 5).length, big: J.instances.filter(i => i.orbit > 50).map(i => [i.orbit, i.variance, i.rotateSpeed]),
      spore: J.spore, det: J.detect, jclips: Object.entries(J.clips).map(([k, c]) => [k, c.len, c.ev]),
      particles: { sb: Object.keys(C.particles.systems), jy: Object.keys(J.particles.systems) }
    };
  });
  check('origin SBMonster (StellarBasin −431,5 / 0 / −462,5 + SBMonster 0 / −50 / 0; three.js z đổi dấu)', dat.origin[0] === -431.5 && dat.origin[1] === -50 && dat.origin[2] === 462.5, JSON.stringify(dat.origin));
  check('DetectionZone: 5 cầu trigger r 30 / 42 / 18 / 13 / 10 (scene)', JSON.stringify(dat.spheres.map(s => s.r)) === '[30,42,18,13,10]' && dat.off[1] === 50, JSON.stringify(dat.spheres));
  check('VariablePlayerDamager: 2 điểm, oneHitOnly, không requireOneHealthToKill, 3 PlayerDetector', dat.dmg.damagePoints === 2 && dat.dmg.oneHitOnly && !dat.dmg.requireOneHealthToKill && dat.dmg.detectors === 3, JSON.stringify(dat.dmg));
  check('SBMonsterAnimationHelper: gọi 22 s, gầm 10 s, quay 0,3 → 2 trong 2 s, tỉ lệ 0,7 → 1 trên 0 → 50 m, góc 5°, 5 s',
    dat.p.callDelaySec === 22 && dat.p.aggroDelaySec === 10 && dat.p.attackTentacleIdleSpeed === 0.3 && dat.p.attackTentacleDetectedSpeed === 2 && dat.p.attackTentacleSpeedTweenDuration === 2 &&
    dat.p.attackTentacleMinScale === 0.7 && dat.p.attackTentacleMaxScale === 1 && dat.p.attackTentacleMinProximity === 0 && dat.p.attackTentacleMaxProximity === 50 &&
    dat.p.attackTentacleAngleThreshold === 5 && dat.p.attackTentacleInRangeDurationThreshold === 5, JSON.stringify(dat.p));
  check('3 CapsuleCollider r 100 cao 500 trục x (cm; cha co 0,01)', dat.coll.length === 3 && dat.coll.every(c => c[0] === 100 && c[1] === 500 && c[2] === 0));
  const tr = (a, b) => dat.trans.find(t => t.from === a && t.to === b);
  check('Animator: Spawn → Idle hết clip 0,25 s; Idle → AlertIdle 1,5868 s; AlertIdle → Idle 1,534 s; Attack → AlertIdle 0 s; Any → Banish 0,25 s; Banish → Spawn 0,25 s',
    tr('Spawn', 'Idle').dur === 0.25 && tr('Spawn', 'Idle').exit === 1 && Math.abs(tr('Idle', 'AlertIdle').dur - 1.586792) < 1e-5 && Math.abs(tr('AlertIdle', 'Idle').dur - 1.5340254) < 1e-5 &&
    tr('Attack', 'AlertIdle').dur === 0 && tr('*', 'Banish').dur === 0.25 && tr('Banish', 'Spawn').dur === 0.25, JSON.stringify(dat.trans));
  check('clip tấn công xúc tu: sự kiện 0,1667 PlayPreAttackSFX / 0,9333 PlayAttackSFX / 3,1667 OnAttackComplete',
    JSON.stringify(dat.atkEv) === '[[0.16667,"PlayPreAttackSFX"],[0.93333,"PlayAttackSFX"],[3.16667,"OnAttackComplete"]]', JSON.stringify(dat.atkEv));
  check('12 SkinnedMeshRenderer, 7 nhóm Animator (miệng, xúc tu tấn công, xúc tu lớn, 4 xúc tu nhỏ), 18 clip', dat.rends === 12 && dat.groups.length === 7 && dat.clips === 18 && dat.nodes > 300, dat.nodes + ' nút');
  check('sứa: 22 con (19 nhỏ bán kính 5, 3 lớn), timeBetweenChecks 5, cầu lõi r 0,7, bào tử r 3,5 × 0,6, FireSignal 1,0 s',
    dat.jn === 22 && dat.small === 19 && dat.jp.timeBetweenChecks === 5 && dat.det.radius === 0.7 && dat.spore.radius === 3.5 && dat.spore.scale === 0.6 &&
    JSON.stringify(dat.jclips.find(c => c[0] === 'jellyfish_explode')[2]) === '[[1,"FireSignal"]]' && dat.big.length === 3, JSON.stringify(dat.big));
  check('hệ hạt riêng của đơn vị đã nhập vào DRParticles (SbAttackSplash, JellyBoatTrail, JellySporeEffect)', dat.particles.sb.includes('SbAttackSplash') && dat.particles.jy.includes('JellyBoatTrail') &&
    dat.particles.jy.includes('JellySporeEffect') && await ev(() => ['SbAttackSplash', 'JellyBoatTrail', 'JellySporeEffect'].every(n => DRParticles.has(n))));

  const aud = await ev(() => {
    const keys = Object.values(DR_SBCREATURE.audioKeys).flat().concat([DR_JELLY.spore.audio.key]);
    return { keys, ok: keys.every(k => !!DRAudio.resolve(k)), roles: Object.entries(DR_SBCREATURE.audioKeys).map(([r, k]) => r + ':' + k.length).join(' ') };
  });
  check('tiếng: mọi khoá (gọi / gầm / trước đòn / đòn / nổi / chìm / bào tử) đều có trong DR_AUDIO', aud.ok && aud.keys.length >= 10, aud.roles);
  await ev(keys => DRAudio.preload(keys), aud.keys);
  await sleep(1500);

  // ================================================================ 2. phát hiện, lookAt, tấn công (thuyền ở 20 m phía đông tâm)
  await repair();
  await ev(() => DRSbCreature.debug.restart());
  await put(300, 0, 0);
  let s = await step(285);                       // 9,5 s: Spawn 8,3 s + 0,25 s hoà → Idle
  check('xa 300 m: không phát hiện (0 cầu chạm), tốc độ lookAt 0,3', !s.detected && s.sensors === 0 && s.lookSpeed === 0.3, JSON.stringify({ d: s.detected, n: s.sensors, v: s.lookSpeed }));
  check('Animator bắt đầu ở Spawn rồi sang Idle sau 8,3 + 0,25 s (cả 7 nhóm)', s.groups.every(g => g.state === 'Idle'), JSON.stringify(s.groups.map(g => g.state)));
  check('chưa tấn công / chưa đòn nào; người nghe damager = 1 (OnEnable AddListeners)', s.attacks === 0 && s.hits === 0 && s.armed === 1);
  await repair();
  await put(20, 0, -Math.PI / 2);
  // một vòng ghi lại từ lúc phát hiện: tốc độ lookAt ở khung 30 / 62, mốc góc < 5° đầu tiên, mốc tấn công
  const run = await ev(() => {
    const d = DRSbCreature.debug, out = { firstAngle: null, attackAt: null, tgt: null, det: null, v30: null, v62: null, n: 0, sens: null, groups0: null };
    for (let i = 0; i < 45 * 30; i++) {
      d.step(1 / 30);
      const st = d.state();
      out.n++;
      if (i === 0) { out.det = st.detected; out.sens = st.sensors; out.detectsAll = st.groups.every(g => g.params.detectsPlayer); }
      if (i === 29) out.v30 = st.lookSpeed;
      if (i === 61) out.v62 = st.lookSpeed;
      if (out.firstAngle == null && st.angle != null && st.angle < 5) out.firstAngle = st.clock;
      if (st.attacks > 0) { out.attackAt = st.clock; out.tgt = st.targetScale; out.groups = st.groups.map(g => [g.id, g.state, g.to]); break; }
    }
    return out;
  });
  const expSph = await ev(([O]) => DR_SBCREATURE.detect.spheres.filter(sp => { const b = DR.s.boat; const c = [O[0] + sp.c[0], O[2] + sp.c[2]]; return Math.hypot(b.x - c[0], b.z - c[1]) < sp.r - 1.5; }).length, [O]);
  check('thuyền ở (+20, 0): OnPlayerDetected; số cầu chạm = ' + expSph + ' (PlayerDetector đếm cầu)', run.det && run.sens === expSph && run.sens >= 1, JSON.stringify({ n: run.sens, exp: expSph }));
  check('SetDetectsPlayer(true) cho cả 7 Animator', run.detectsAll);
  const k1 = 0.3 + (2 - 0.3) * outQ(0.5);
  check('tốc độ lookAt sau 1 s = 0,3 + 1,7 · OutQuad(0,5) = ' + k1.toFixed(3), Math.abs(run.v30 - k1) < 0.01, run.v30.toFixed(4));
  check('sau 2 s tốc độ lookAt = 2', Math.abs(run.v62 - 2) < 1e-6, run.v62.toFixed(6));
  check('tấn công sau khi góc < 5° đủ 5 s liên tục (Δ = ' + (run.attackAt - run.firstAngle).toFixed(3) + ' s)', run.attackAt != null && run.attackAt - run.firstAngle >= 4.95 && run.attackAt - run.firstAngle <= 5.1, JSON.stringify({ a: run.firstAngle, t: run.attackAt }));
  check('mục tiêu tỉ lệ xúc tu ở 20 m = 0,7 + 0,3 · 20/50 = 0,82', Math.abs(run.tgt - 0.82) < 0.01, String(run.tgt));
  check('trigger attack → Animator miệng và xúc tu tấn công vào Attack (hoà 0,25 s)', run.groups.filter(g => g[0] === 'mouth' || g[0] === 'attack').every(g => g[2] === 'Attack' || g[1] === 'Attack'), JSON.stringify(run.groups));
  const dmg0 = await damage();
  const hit = await ev(() => {
    const d = DRSbCreature.debug, out = { hitAt: null, doneAt: null, armed: [], att0: d.state().clock };
    for (let i = 0; i < 6 * 30; i++) {
      d.step(1 / 30);
      const st = d.state();
      if (out.hitAt == null && st.hits > 0) { out.hitAt = st.clock; out.last = st.last; }
      if (out.splashOn == null && st.splash) out.splashOn = st.clock;
      if (out.splashOn != null && out.splashOff == null && !st.splash) out.splashOff = st.clock;
      out.armed.push(st.armed);
      if (st.log.some(l => l[0] === 'rearm')) { out.doneAt = st.clock; break; }
    }
    return out;
  });
  check('chạm xúc tu: VariablePlayerDamager một lần, 2 ô hỏng (1 người nghe → 1 lần gọi)', hit.hitAt != null && hit.last.calls === 1 && hit.last.slots === 2 && (await damage()) === dmg0 + 2, JSON.stringify(hit.last));
  check('OnAttackComplete (sự kiện 3,1667 s) đăng ký lại người nghe: armed 0 → 1', hit.doneAt != null && hit.armed[hit.armed.length - 1] === 1 && hit.armed[hit.armed.length - 2] === 0, JSON.stringify(hit.armed.slice(-3)));
  check('bọt nước SbAttackSplash (m_IsActive của clip tấn công) bật ở 0,9667 s sau khi đòn bắt đầu (Δ ' + (hit.splashOn - run.attackAt).toFixed(2) + ' s) và tắt khi đòn xong', hit.splashOn != null && Math.abs((hit.splashOn - run.attackAt) - 0.9667) < 0.12 && hit.splashOff != null && hit.splashOff <= hit.doneAt + 0.1, JSON.stringify({ on: hit.splashOn, off: hit.splashOff, at: run.attackAt }));
  console.log('    mốc đòn: bắt đầu ' + hit.att0.toFixed(2) + ' s, chạm ' + (hit.hitAt || 0).toFixed(2) + ' s, đăng ký lại ' + (hit.doneAt || 0).toFixed(2) + ' s');

  // ================================================================ 3. bẫy gốc: đòn trượt để lại người nghe, chạm đầu tiên gây 2 × (k + 1) ô
  await repair();
  await repair();
  await ev(() => DRSbCreature.debug.restart());
  await put(300, 0, 0);
  await step(285);
  // "trượt" = thuyền rời tầm ngay khi đòn bắt đầu (OnAttackComplete vẫn chạy ở 3,1667 s và AddListeners thêm một người nghe)
  const missRound = r => ev(([r, O]) => {
    const d = DRSbCreature.debug, out = { armed: null, hits: null };
    DR_DEBUG.teleport(O[0] + 20, O[2], -Math.PI / 2);
    let left = false;
    for (let i = 0; i < 80 * 30; i++) {
      d.step(1 / 30);
      const st = d.state();
      if (!left && st.attacks >= r) { DR_DEBUG.teleport(O[0] + 300, O[2], 0); left = true; }
      if (st.log.filter(l => l[0] === 'rearm').length >= r) { out.armed = st.armed; out.hits = st.hits; break; }
    }
    out.fin = JSON.stringify(d.state().groups.slice(0, 2)) + ' att=' + d.state().attacks + ' det=' + d.state().detected + ' mode=' + DR.mode + ' boat=' + DR.s.boat.x.toFixed(1) + ',' + DR.s.boat.z.toFixed(1) + ' O=' + O[0] + ',' + O[2] + ' sens=' + d.state().sensors;
    return out;
  }, [r, O]);
  const m1 = await missRound(1), m2 = await missRound(2);
  check('hai đòn trượt (thuyền rời tầm khi đòn bắt đầu): chưa ô hỏng nào, người nghe cộng dồn 1 → 2 → 3', m1.armed === 2 && m2.armed === 3 && m2.hits === 0, JSON.stringify([m1, m2]));
  const dmg1 = await damage();
  await put(20, 0, -Math.PI / 2);
  const stack = await ev(() => {
    const d = DRSbCreature.debug, out = {};
    for (let i = 0; i < 60 * 30; i++) {
      d.step(1 / 30);
      const st = d.state();
      if (st.hits > 0) { out.last = st.last; out.armed = st.armed; break; }
    }
    return out;
  });
  check('chạm đầu tiên sau đó: 3 người nghe → 3 lần gọi × 2 điểm = 6 ô (DRBoat.monsterHit), về 0 người nghe', stack.last && stack.last.calls === 3 && stack.last.slots === 6 && (await damage()) === dmg1 + 6 && stack.armed === 0, JSON.stringify(stack));

  console.log('    sau phần 3: mode', await ev(() => DR.mode + ' dmg ' + DR.grid('INVENTORY').damage.length + ' ngưỡng ' + DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier)));
  // ================================================================ 4. câu cá: đặt luôn bộ đếm = 5 s
  await repair();
  await ev(() => DRSbCreature.debug.restart());
  await put(300, 0, 0);
  await step(285);
  await put(20, 0, -Math.PI / 2);
  await step(120);                               // 4 s: còn đang xoay về phía thuyền, bộ đếm chưa tới 5 s
  s = await ST();
  check('đang quay về phía thuyền: chưa tấn công trong 4 s đầu', s.attacks === 0, JSON.stringify({ a: s.attacks, ang: s.angle }));
  s = await ev(() => { DRSbCreature.debug.set('forceFishing', true); DRSbCreature.debug.step(1 / 30); DRSbCreature.debug.set('forceFishing', false); return DRSbCreature.debug.state(); });
  check('Player.IsFishing: bộ đếm = 5 s ngay khi góc < 5° → TriggerAttack ngay khung đó (đòn ' + s.attacks + ')', s.attacks === 1 && s.angle < 5, JSON.stringify({ a: s.attacks, ang: s.angle }));

  // ================================================================ 5. Manifest (OnTeleportBegin → PlayerDetector.Reset) và rời vùng phát hiện
  await repair();
  s = await step(30);
  check('trước Manifest: đang phát hiện', s.detected && s.sensors >= 1);
  await ev(() => DR.emit('manifestBegin', { x: 0, z: 0 }));
  s = await step(2);
  check('Manifest bắt đầu: Reset() về 0 và gọi OnPlayerExitDetected; thuyền còn nằm trong cầu nhưng Unity không phát Enter mới nên không phát hiện lại',
    !s.detected && s.sensors >= 1 && s.lookSpeed === 0.3 && s.groups.every(g => !g.params.detectsPlayer), JSON.stringify({ d: s.detected, n: s.sensors, v: s.lookSpeed }));
  await put(300, 0, -Math.PI / 2);
  s = await step(2);
  check('ra khỏi mọi cầu: OnPlayerExitDetected → hết phát hiện, SetDetectsPlayer(false), lookAt về 0,3', !s.detected && s.sensors === 0 && s.lookSpeed === 0.3 && s.groups.every(g => !g.params.detectsPlayer), JSON.stringify({ d: s.detected, v: s.lookSpeed }));

  // ================================================================ 6. máy Xua đuổi (ActivateBanishMachine): 0,5 ngày không tấn công
  await repair();
  await ev(() => DRSbCreature.debug.restart());
  await put(300, 0, 0);
  await step(285);
  await put(20, 0, -Math.PI / 2);
  await step(60);
  const t0 = await ev(() => { DR.paused = true; DRYarn.commands.ActivateBanishMachine.f([]); return { t: DR.s.time, exp: DR.s.vars['banish-machine-expiry'] }; });
  check('ActivateBanishMachine: hạn = giờ + 0,5 ngày (BanishMachine.cs:33)', Math.abs(t0.exp - (t0.t + 0.5)) < 1e-9, JSON.stringify(t0));
  s = await step(2);
  check('máy bật: SetBanished (bool banished cả 7 Animator), cờ máy = true', s.machine && s.banished && s.groups.every(g => g.params.banished), JSON.stringify({ m: s.machine, b: s.banished }));
  const sc0 = (await ST()).scale;
  s = await step(10 * 30);
  check('sau 10 s: cả 7 nhóm ở trạng thái Banish (Any State → Banish, 0,25 s)', s.groups.every(g => g.state === 'Banish'), JSON.stringify(s.groups.map(g => g.state)));
  const a0 = s.attacks, h0 = s.hits;
  s = await step(60 * 30);
  check('60 s mà góc lookAt về 0: không TriggerAttack, không đòn (Update trả về sớm)', s.attacks === a0 && s.hits === h0 && s.angle != null && s.angle < 5, JSON.stringify({ a: s.attacks, h: s.hits, ang: s.angle }));
  check('Update bỏ qua nên tỉ lệ xúc tu đứng yên (không về 0,7)', Math.abs(s.scale - sc0) < 1e-9, JSON.stringify({ sc0, now: s.scale }));
  await ev(() => { DR.s.time += 0.49; });
  s = await step(30);
  check('còn 0,01 ngày: máy vẫn bật, vẫn Banish, vẫn không tấn công', s.machine && s.banished && s.groups.every(g => g.state === 'Banish') && s.attacks === a0);
  await ev(() => { DR.s.time = DR.s.vars['banish-machine-expiry'] + 0.001; });
  await sleep(400);                               // vòng của questcmds (rAF) thấy quá hạn → toggle(false) → DR.emit('banishMachine', false)
  s = await step(2);
  check('hết hạn (TimeAndDay > expiry): máy tắt, banished = false', !s.machine && !s.banished && s.groups.every(g => g.params.banished === false), JSON.stringify({ m: s.machine }));
  s = await step(18 * 30);
  check('sau hạn: Banish → Spawn → Idle → AlertIdle, lại tấn công được (đòn ' + s.attacks + ' > ' + a0 + ')', s.attacks > a0, JSON.stringify({ a: s.attacks, a0, g: s.groups[0].state }));

  // ================================================================ 7. Xua đuổi (khả năng) bật / tắt
  await repair();
  await ev(() => DRSbCreature.debug.restart());
  await put(300, 0, 0);
  await step(285);
  await put(20, 0, -Math.PI / 2);
  await step(60);
  await ev(() => { window.__tb = []; DR.on('threatBanished', n => window.__tb.push(n)); DR.emit('banish', true); });
  s = await step(5 * 30);
  const tb = await ev(() => window.__tb);
  check('Xua đuổi bật: banished = true và TriggerThreatBanished(gần < 200 m) = true (nguồn SBMonster)', s.ability && s.banished && tb.some(x => x && x.source === 'SBMonster' && x.active === true), JSON.stringify(tb));
  s = await step(30 * 30);
  check('Xua đuổi bật: không tấn công', s.attacks === 0);
  await ev(() => DR.emit('banish', false));
  s = await step(2);
  check('Xua đuổi tắt: banished = false', !s.ability && !s.banished);

  // ================================================================ 8. sứa: JellyfishController + Jellyfish + JellySporeCollision
  await repair();
  await ev(() => DRSbCreature.debug.restart());
  await put(300, 0, 0);
  const J0 = await ev(() => DR_JELLY.instances.map(i => ({ up: i.upY, down: i.downY, orbit: i.orbit, v: i.variance, vs: i.varianceSpeed, rs: i.rotateSpeed, ccw: i.ccw })));
  await ev(() => { DR.s.time = Math.floor(DR.s.time) + 0.5; DRJelly.debug.restart(); });   // ban ngày
  let j = await ev(() => { for (let i = 0; i < 40; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('ban ngày: cả 22 con ở y = downY (−7 / −8), chưa Show', j.inst.every((x, i) => x.y === J0[i].down && !x.isUp), JSON.stringify(j.inst.map(x => x.y).slice(0, 3)));
  await ev(() => { DR.s.time = Math.floor(DR.s.time) + 0.9; });
  j = await ev(() => { DRJelly.debug.reset(); for (let i = 0; i < 4 * 30 + 1; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('ban đêm: ShowAll, giữa chừng 4 s: y = −7 + 7 · OutQuad(0,5) = −1,75 (con nhỏ), −8 + 8 · 0,75 = −2 (con lớn)',
    Math.abs(j.inst[0].y + 1.75) < 0.08 && Math.abs(j.inst[19].y + 2) < 0.09 && j.inst[0].isChanging && !j.inst[0].isUp, JSON.stringify([j.inst[0].y, j.inst[19].y]));
  j = await ev(() => { for (let i = 0; i < 5 * 30; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('sau 8 s: y = upY = 0, đã lên, đã đăng ký PlayerDetector', j.inst.every(x => x.y === 0 && x.isUp && x.detectSub), JSON.stringify(j.inst.map(x => x.y).slice(0, 3)));
  const j1 = await ev(() => { const a = DRJelly.debug.state().inst; for (let i = 0; i < 30; i++) DRJelly.debug.step(1 / 30); const b = DRJelly.debug.state().inst; return { a: a.slice(0, 2), b: b.slice(0, 2) }; });
  check('con 0 (ccw): quay −10 °/s; con 1: +10 °/s; con lớn 19: 0,5 °/s', Math.abs((j1.b[0].rot - j1.a[0].rot) + 10) < 0.01 && Math.abs((j1.b[1].rot - j1.a[1].rot) - 10) < 0.01 && J0[19].rs === 0.5, JSON.stringify([j1.b[0].rot - j1.a[0].rot, j1.b[1].rot - j1.a[1].rot]));
  const zl = await ev(() => { const i = DRJelly.debug.inst[1]; return { z: i.zl, t: i.vt }; });
  const ph = (zl.t / 5) % 2, pp = ph <= 1 ? ph : 2 - ph;
  const want = 4.5 + 2 * 0.5 * (0.5 * (1 - Math.cos(Math.PI * pp)));
  check('phương sai: z = 4,5 + 1 · InOutSine yoyo (varianceSpeed 5 s) = ' + want.toFixed(3), Math.abs(zl.z - want) < 1e-6, JSON.stringify(zl));
  await ev(() => DR.emit('banish', true));
  j = await ev(() => { for (let i = 0; i < 5 * 30; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('Xua đuổi bật: BanishAll → rút xuống (retreat 10 s, OutQuad), 5 s: y = −7 · OutQuad(0,5) = −5,25', j.inst.every(x => !x.isUp && x.isChanging) && Math.abs(j.inst[0].y + 7 * outQ(0.5)) < 0.1, JSON.stringify(j.inst[0].y));
  j = await ev(() => { for (let i = 0; i < 12 * 30; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('sau 10 s: y = downY, đã tắt (active = false), các kiểm 5 s sau không Show (Xua đuổi còn bật)', j.inst.every(x => !x.active && !x.isUp && !x.isChanging), JSON.stringify(j.inst.slice(0, 2).map(x => [x.active, x.y])));
  await ev(() => DR.emit('banish', false));
  j = await ev(() => { for (let i = 0; i < 6 * 30; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('Xua đuổi tắt, ban đêm: kiểm kế tiếp ShowAll → bật lại (OnEnable: y = downY rồi trồi)', j.inst.every(x => x.active && x.isChanging), JSON.stringify(j.inst.slice(0, 2).map(x => [x.active, x.y, x.isChanging])));
  await ev(() => { for (let i = 0; i < 9 * 30; i++) DRJelly.debug.step(1 / 30); });
  await ev(() => { DR.s.time = Math.floor(DR.s.time) + 0.5; });
  j = await ev(() => { for (let i = 0; i < 5 * 30 + 1; i++) DRJelly.debug.step(1 / 30); return DRJelly.debug.state(); });
  check('sang ngày: HideAll(didHit = false) → rút xuống (fall 10 s)', j.inst.every(x => !x.isUp && (x.isChanging || !x.active)), JSON.stringify(j.inst.slice(0, 2).map(x => [x.isUp, x.isChanging, x.y])));
  await ev(() => { for (let i = 0; i < 12 * 30; i++) DRJelly.debug.step(1 / 30); });

  // ---- nổ gần thuyền: nhiễm đúng một con cá
  await ev(() => { DR.s.time = Math.floor(DR.s.time) + 0.9; DRJelly.debug.reset(); });
  await ev(() => { const ids = Object.keys(DR_ITEMS).filter(k => DR_ITEMS[k].cls === 'FishItemData' && DR_ITEMS[k].canBeInfected !== false && !DR_ITEMS[k].isAberration).slice(0, 3); for (const id of ids) DR.give(id); });
  await ev(() => { for (let i = 0; i < 16 * 30; i++) DRJelly.debug.step(1 / 30); });
  const inf0 = await ev(() => DR.grid('INVENTORY').items.filter(i => i.infected).length);
  const ex = await ev(() => {
    const out = { detAt: null, sporeAt: null };
    const jj = DRJelly.debug.inst[0];
    let t = 0;
    for (let i = 0; i < 6 * 30; i++) {
      DR_DEBUG.teleport(jj.bodyPos.x, jj.bodyPos.z, 0);
      DRJelly.debug.step(1 / 30); t += 1 / 30;
      const st = DRJelly.debug.state();
      if (out.detAt == null && st.inst[0].signalSub) out.detAt = t;
      if (out.sporeAt == null && st.spores.length) { out.sporeAt = t; out.spore = st.spores[0]; }
      out.inf = st.infections;
    }
    return out;
  });
  const inf1 = await ev(() => DR.grid('INVENTORY').items.filter(i => i.infected).length);
  check('thuyền chạm lõi sứa (cầu 0,7): trigger explode, FireSignal sau 1,0 s → sinh bào tử (Δ ' + (ex.sporeAt != null ? (ex.sporeAt - ex.detAt).toFixed(2) : '?') + ' s)', ex.detAt != null && ex.sporeAt != null && Math.abs((ex.sporeAt - ex.detAt) - 1.0) < 0.1, JSON.stringify({ d: ex.detAt, s: ex.sporeAt }));
  check('bào tử: cầu trigger 3,5 × 0,6 = 2,1 m; JellySporeCollision.cs:11 → InfectRandomItemInInventory đúng 1 con cá (nhiễm ' + inf0 + ' → ' + inf1 + ')', ex.spore && Math.abs(ex.spore.r - 2.1) < 1e-9 && ex.spore.triggered && inf1 === inf0 + 1 && ex.inf === 1, JSON.stringify(ex.spore));
  j = await ev(() => DRJelly.debug.state());
  check('sứa đó rút xuống (Hide(didHit = true), retreat 10 s); sứa khác không nổ', j.inst[0].exploded === 1 && !j.inst[0].isUp && j.inst.slice(1).every(x => x.exploded === 0));
  await ev(() => { for (let i = 0; i < 5 * 30; i++) DRJelly.debug.step(1 / 30); });
  check('bào tử chỉ kích hoạt một lần (hasTriggered)', (await ev(() => DRJelly.debug.state().infections)) === 1);
  check('không lỗi trang trong cả bộ', errors.length === 0, errors.join(' | ').slice(0, 300));

  // ================================================================ 9. ảnh (1280x720 và 844x390), chạy thật theo thời gian thực
  await repair();
  check('thuyền còn nổi sau cả bộ (mode sail)', (await ev(() => DR.mode)) === 'sail');
  async function shot(name, W, H, fn) {
    await page.setViewportSize({ width: W, height: H });
    await fn();
    await sleep(1800);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  }
  for (const [W, H] of [[1280, 720], [844, 390]]) {
    await shot('sb-attack-' + W, W, H, async () => {
      await ev(() => { DRCamera.override = null; DR.s.time = Math.floor(DR.s.time) + 0.5; DR.paused = true; DRSbCreature.debug.restart(); });
      await put(300, 0, 0);
      await step(285);
      await put(34, 4, -Math.PI / 2);
      await step(120);
      await ev(() => { DRSbCreature.debug.set('forceFishing', true); DRSbCreature.debug.step(1 / 30); DRSbCreature.debug.set('forceFishing', false); for (let i = 0; i < 38; i++) DRSbCreature.debug.step(1 / 30); });
      await ev(([x, z]) => { DRCamera.override = cam => { cam.position.set(x + 62, 15, z + 40); cam.lookAt(x + 22, 4, z); cam.updateMatrixWorld(); return true; }; }, [O[0], O[2]]);
    });
    await shot('sb-night-' + W, W, H, async () => {
      await ev(() => { DRCamera.override = null; DR.s.time = Math.floor(DR.s.time) + 0.93; DR.paused = true; for (let i = 0; i < 40; i++) DRSbCreature.debug.step(1 / 30); });
      await put(-62, 0, -Math.PI / 2);          // 62 m phía tây tâm, nhìn về tâm: xúc tu lớn phát sáng quanh thuyền
    });
    await shot('jelly-night-' + W, W, H, async () => {
      await ev(() => { DRCamera.override = null; DR.paused = false; DRJelly.debug.reset(); });
      await ev(() => { const i = DR_JELLY.instances[1]; DR_DEBUG.teleport(i.x - 14, i.z + 2, -Math.PI / 2); });
      await sleep(14000);
    });
  }
  // ================================================================ 10. thuyền ở ngay tâm: bị túm và chìm (cuối bộ: sau đó mode = over)
  await ev(() => { DRCamera.override = null; DR.paused = true; DR.s.hullTier = 1; DR.grid('INVENTORY').damage.length = 0; DR.s.time = Math.floor(DR.s.time) + 0.5; DRSbCreature.debug.restart(); });
  await put(300, 0, 0);
  await step(285);
  await put(0, 0, 0);
  const sink = await ev(() => {
    const d = DRSbCreature.debug, out = { n: 0 };
    for (let i = 0; i < 120 * 30; i++) {
      d.step(1 / 30);
      const st = d.state();
      if (i === 0) out.det = st.detected;
      if (DR.mode === 'over') { out.t = st.clock; out.hits = st.hits; out.attacks = st.attacks; out.dmg = DR.grid('INVENTORY').damage.length; break; }
    }
    out.thr = DRRules.damageThreshold(DR_CONFIG, 1);
    return out;
  });
  check('thuyền ở tâm SBMonster (0, 0): phát hiện, xúc tu đập mỗi ~5 s và thuyền chìm (' + sink.hits + ' đòn trúng, ' + sink.dmg + ' ô hỏng > ngưỡng ' + sink.thr + ')', sink.det && sink.hits >= 1 && sink.dmg > sink.thr && sink.t < 100, JSON.stringify(sink));
  console.log('    ảnh:', SHOTS);
  await browser.close(); srv.close();
  console.log('pass', pass, 'fail', fail, errors.length ? '\n' + errors.join('\n') : '');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
