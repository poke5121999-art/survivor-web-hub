/*
 * DREDGE — Biển Mù: kiểm hệ hạt chung (js/particles.js + data/particles.js do tools/particles.py bóc) trên trang thật.
 *   node test/dredge-particles.js
 *   DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-particles.js   (chạy trên Pages)
 *   PERF_ONLY=1 DR_ROOT=<gốc cây cần đo> node test/dredge-particles.js                      (chỉ đo khung hình 2 chỗ)
 * Ảnh: %TEMP%/dredge-particles/ (lửa trại Twisted Strand ban đêm, lỗ phun Devil's Spine ban ngày, mưa ngoài biển + mưa bão, 844x390).
 *   Ghép với ảnh thật gần nhất (không có ảnh gốc chụp lửa trại/lỗ phun cận cảnh): gog_10 đêm đầm lầy, gog_25 Devil's Spine, gog_13 mưa.
 * Số mong đợi lấy từ bản gốc:
 *   RelicParticles.prefab có 5 ParticleSystem (Particles, Beam, Beam/Beam2, Embers, Embers/glow);
 *   FollowCamera/Rain ở y +8 so với FollowCamera, FollowCameraInWorld bám x, y, z của camera;
 *   StellarBasin/Particles/Sparkles: TimeOfDayParticles start 0,75 end 0,2 (phát lúc 0,9, tắt lúc 0,5);
 *   FollowPlayer/Lightning: 3 sub-emitter kiểu Birth (SubEmitter_Glow p 1, SubEmitter_Lightning p 0,5, SubEmitter_Flash p 1), Emit(1) (Lightning.cs:87);
 *   mối nối thời tiết: setRateOverTime/setSimulationSpeed/setSubEmitProbability như WeatherController.cs:417-424 (Snow 0/s, HeavyStorm 2000/s).
 *   TwistedStrand_SignPost/.../Particles/CampFire: lửa 15/s, sống 1–3 s.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = process.env.DR_ROOT ? path.resolve(process.env.DR_ROOT) : path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-particles');
const PERF_ONLY = process.env.PERF_ONLY === '1';
const REAL = 'D:/dredge-ref/shots-real', SBS = 'D:/dredge-ref/notes/sbs.py';
// python có Pillow (pyenv của máy này); PATH của node có thể trỏ python khác
const PY = process.env.PYTHON || ['C:/Users/tamph/.pyenv/pyenv-win/versions/3.8.10/python.exe'].find(p => fs.existsSync(p)) || 'python';
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function open(browser, base, vw, vh) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.42');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await sleep(400);
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock' || DR.mode === 'sail', null, { timeout: 20000 });
  await page.evaluate(() => { if (DR.mode === 'dock') DR.setMode('sail'); });
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  return { page, errors };
}
// đặt thuyền trên nước cách mục tiêu d m, mũi hướng về mục tiêu (toạ độ three.js)
async function faceFrom(page, tx, tz, d) {
  return page.evaluate(([tx, tz, d]) => {
    let best = null;
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
      const s = DR_DEBUG.sdf(x, z);
      if (s > 4 && (!best || s > best.s)) best = { x, z, s };
    }
    if (!best) return null;
    const yaw = Math.atan2(-(tx - best.x), -(tz - best.z)); // mũi thuyền = (−sin yaw, −cos yaw)
    DR_DEBUG.teleport(best.x, best.z, yaw);
    return best;
  }, [tx, tz, d]);
}

async function perf(page) {
  const spots = [['gm', 20, -30, 0.3], ['ds', 0, 0, 0]];
  const res = {};
  for (const [n, x0, z0, y0] of spots) {
    await page.evaluate(() => DR_DEBUG.setTime(0.4));
    if (n === 'ds') await faceFrom(page, 492.78, -481.64, 18); // Devil's Spine ThermalVents/10
    else await page.evaluate(([x, z, y]) => DR_DEBUG.teleport(x, z, y), [x0, z0, y0]);
    await page.keyboard.down('KeyW'); await sleep(1500);
    const smp = [];
    for (let i = 0; i < 10; i++) { await sleep(400); smp.push(await page.evaluate(() => DR_DEBUG.perf())); }
    await page.keyboard.up('KeyW');
    const med = k => { const a = smp.map(x => x[k]).sort((x, y) => x - y); return (a[4] + a[5]) / 2; };
    res[n] = { avgMs: +med('avgMs').toFixed(2), cpuMs: +med('cpuMs').toFixed(2), calls: smp[9].calls };
  }
  return res;
}

async function main() {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  if (PERF_ONLY) {
    const { page } = await open(browser, base, 1280, 720);
    console.log(JSON.stringify(await perf(page)));
    await browser.close(); if (srv) srv.close(); return;
  }
  const { page, errors } = await open(browser, base, 1280, 720);
  const shot = (name, p) => (p || page).screenshot({ path: path.join(SHOTS, name + '.png') });

  // ---- dữ liệu: mọi tên các luồng gọi đều có
  const names = await page.evaluate(() => DRParticles.names());
  for (const n of ['RelicParticles', 'HullCriticalEffects', 'SonarPulseEffect', 'BanishEffect', 'TeleportEffect', 'AtrophyPlayerEffect',
    'AtrophyFishEffect', 'BaitParticles', 'Rain', 'Snow', 'Lightning', 'ChimneySmoke'])
    check('có dữ liệu ' + n, names.includes(n));
  const nRelic = await page.evaluate(() => DR_PARTICLES.RelicParticles.nodes.length);
  check('RelicParticles.prefab: 5 ParticleSystem trong dữ liệu', nRelic === 5, 'có ' + nRelic);

  // ---- RelicParticles: đủ 5 hệ, có hạt trong 1 s
  await page.evaluate(() => DR_DEBUG.teleport(60, -40, 1.2));
  await sleep(500);
  const relic = await page.evaluate(async () => {
    const b = DR.s.boat, h = DRParticles.spawn('RelicParticles', { pos: [b.x - Math.sin(b.yaw) * 7, 0, b.z - Math.cos(b.yaw) * 7] });
    window.__relic = h;
    const t0 = performance.now();
    while (h.count === 0 && performance.now() - t0 < 1000) await new Promise(r => requestAnimationFrame(r));
    return { systems: h.systems.length, count: h.count, ms: performance.now() - t0 };
  });
  check('spawn RelicParticles tạo 5 hệ', relic.systems === 5, 'có ' + relic.systems);
  check('RelicParticles có hạt trong 1 s', relic.count > 0 && relic.ms <= 1000, relic.count + ' hạt sau ' + relic.ms.toFixed(0) + ' ms');
  await sleep(1500);
  await shot('relic-day');

  // ---- HullCriticalEffects chọn biến thể theo parent.name; khói ống khói theo DRVfx.smokeBoost
  const hull = await page.evaluate(async () => {
    const node = DRBoat.model.children.find(c => (c.userData.name || c.name) === 'Boat1');
    const h = DRParticles.spawn('HullCriticalEffects', { parent: node });
    // Haste (abilities.js) ghi smokeBoost mỗi khung, nên ghim giá trị 1 bằng getter trong lúc đo
    Object.defineProperty(DRVfx, 'smokeBoost', { configurable: true, get: () => 1, set() {} });
    await new Promise(r => setTimeout(r, 1500));
    const r = { systems: h.systems.length, count: h.count, src: h._eff.d.src, chimney: DRVfx.chimney ? DRVfx.chimney.count : -1 };
    h.stop();
    Object.defineProperty(DRVfx, 'smokeBoost', { configurable: true, writable: true, value: 0 });
    return r;
  });
  check('HullCriticalEffects (Boat1): 4 hệ khói, có hạt', hull.systems === 4 && hull.count > 0 && /Boat1\/HullCriticalEffects/.test(hull.src), JSON.stringify(hull));
  check('khói ống khói SmokePuffs phát khi DRVfx.smokeBoost = 1', hull.chimney > 0, 'hạt ' + hull.chimney);
  await page.evaluate(() => window.__relic.stop());

  // ---- mưa bám camera (FollowCamera/Rain y +8), lái thuyền bằng phím thật
  await page.evaluate(() => { DR_DEBUG.setTime(0.42); DR_DEBUG.teleport(30, -80, 0.6); window.__rain = DRParticles.spawn('Rain', { follow: 'camera' }); });
  await page.keyboard.down('KeyW'); await sleep(2000);
  const rain = await page.evaluate(() => {
    const c = DR_DEBUG.camera.position, p = window.__rain.positions()[0];
    return { cam: [c.x, c.y, c.z], emitter: p, count: window.__rain.count, splash: window.__rain.systems[1].n };
  });
  await page.keyboard.up('KeyW');
  const dRain = Math.hypot(rain.emitter[0] - rain.cam[0], rain.emitter[1] - (rain.cam[1] + 8), rain.emitter[2] - rain.cam[2]);
  check('Rain bám camera: emitter = camera + (0, 8, 0)', dRain < 0.6, 'lệch ' + dRain.toFixed(2) + ' m');
  check('Rain có giọt và vệt bắn (sub-emitter Birth)', rain.count > 50 && rain.splash > 0, rain.count + ' hạt, ' + rain.splash + ' vệt bắn');
  await shot('rain-sea');
  const rate = await page.evaluate(async () => {
    const s = window.__rain.systems[0], h = window.__rain; // chỉ đếm giọt (hệ gốc), vệt bắn đi theo giọt cũ còn sống
    const e0 = s.emitted; await new Promise(r => setTimeout(r, 1000)); const full = s.emitted - e0;
    h.setRate(0.25); const e1 = s.emitted; await new Promise(r => setTimeout(r, 1000)); const q = s.emitted - e1;
    return { full, q };
  });
  check('setRate(0,25): giọt mưa còn ~1/4 (150/s → ~37/s)', rate.q > rate.full * 0.15 && rate.q < rate.full * 0.35, JSON.stringify(rate));
  // máy điện thoại ngang
  const ph = await open(browser, base, 844, 390);
  await ph.page.evaluate(() => { DR_DEBUG.teleport(30, -80, 0.6); window.__rain = DRParticles.spawn('Rain', { follow: 'camera' }); });
  await sleep(2000); await shot('rain-844x390', ph.page);
  check('844x390: mưa chạy không lỗi', ph.errors.length === 0 && await ph.page.evaluate(() => window.__rain.count > 0), ph.errors.slice(0, 3).join(' | '));
  await ph.page.close();
  await page.evaluate(() => window.__rain.stop());

  // ---- mối nối thời tiết: setRateOverTime(r) = rateOverTime tuyệt đối (WeatherController.cs:417-424), hệ loop được giữ sống
  // FollowPlayer/Snow &108154: rate 0/s trong cảnh, maxN 1000, sống 2,2 s, simulationSpeed 0,8 → 40/s trong 2 s ≈ 40·0,8·2 = 64 bông
  const snow = await page.evaluate(async () => {
    const h = DRParticles.spawn('Snow', { follow: 'player', loop: true }), wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(1500);
    const idle = { alive: h.alive, count: h.count };
    h.setRateOverTime(40); const e0 = h.emitted;
    await wait(2000);
    const on = { alive: h.alive, count: h.count, emitted: h.emitted - e0 };
    h.stop(); const t0 = performance.now();
    while (h.alive && performance.now() - t0 < 5000) await wait(100);
    return { idle, on, freedMs: performance.now() - t0, freed: !h.alive };
  });
  check('Snow rate 0/s: không hạt nhưng vẫn sống (handle giữ)', snow.idle.alive && snow.idle.count === 0, JSON.stringify(snow.idle));
  check('Snow setRateOverTime(40): có bông sau 2 s, phát ~64 (40..90)', snow.on.alive && snow.on.count > 0 && snow.on.emitted >= 40 && snow.on.emitted <= 90, JSON.stringify(snow.on));
  check('Snow stop(): bông cũ rơi hết (2,2 s / 0,8) rồi giải phóng', snow.freed && snow.freedMs < 4000, 'sau ' + snow.freedMs.toFixed(0) + ' ms');
  // HeavyStorm (data/weather.js): rainRate 2000, rainSpeed 1,4, splashChance 0,3; FollowCamera/Rain &106857 maxN 2000, sống 1,1 s
  // → 2000·1,1 = 2200 > maxN nên giọt sống chạm trần 2000.
  // splashChance: SubEmitter_RainSplashes (Birth, burst 1 + rate 1/s suốt đời giọt) chỉ chạy với ~30% giọt → tỉ lệ vệt/giọt
  // ở p 0,3 bằng ~0,3 lần tỉ lệ ở p 1 của dữ liệu; đo ở 300/s để vệt bắn (maxN 500) không chạm trần.
  const storm = await page.evaluate(async () => {
    const h = DRParticles.spawn('Rain', { follow: 'camera', loop: true }), wait = ms => new Promise(r => setTimeout(r, ms));
    h.setRateOverTime(2000); h.setSimulationSpeed(1.4); h.setSubEmitProbability(0, 0.3);
    await wait(2500);
    const d = h.systems[0], sp = h.systems[1];
    const r = { live: d.n, maxN: d.N };
    const ratio = async () => { const d0 = d.emitted, s0 = sp.emitted; await wait(2000); return (sp.emitted - s0) / Math.max(1, d.emitted - d0); };
    h.setRateOverTime(300); await wait(1200); r.ratio03 = await ratio();
    h.setSubEmitProbability(0, null); await wait(1200); r.ratio1 = await ratio();
    h.setRateOverTime(150 * 0.5); h.setSimulationSpeed(null); // trở lại tốc độ dữ liệu, 75/s tuyệt đối
    await wait(1600);
    const d1 = d.emitted; await wait(1000); r.at75 = d.emitted - d1;
    h.stop();
    return r;
  });
  check('HeavyStorm: setRateOverTime(2000) → giọt sống ≥ 1900, ≤ maxN 2000', storm.live >= 1900 && storm.live <= 2000 && storm.maxN === 2000, JSON.stringify(storm));
  // ảnh mưa bão ngoài biển (HeavyStorm) để ghép với gog_13 (hẻm đá dưới mưa)
  await page.evaluate(() => { const h = window.__storm = DRParticles.spawn('Rain', { follow: 'camera', loop: true }); h.setRateOverTime(2000); h.setSimulationSpeed(1.4); h.setSubEmitProbability(0, 0.3); });
  await sleep(2500); await shot('rain-storm-sea');
  await page.evaluate(() => window.__storm.stop());
  const kSplash = storm.ratio03 / storm.ratio1;
  check('setSubEmitProbability(0, 0,3): vệt bắn/giọt bằng 0,2..0,4 lần lúc p 1', kSplash > 0.2 && kSplash < 0.4, kSplash.toFixed(3));
  check('setRateOverTime(75) với simulationSpeed 0,8: ~60 giọt/s (45..75)', storm.at75 >= 45 && storm.at75 <= 75, 'có ' + storm.at75);

  // ---- lấp lánh Stellar Basin: phát lúc 0,9, không phát lúc 0,5 (TimeOfDayParticles 0,75 → 0,2)
  const sp = await page.evaluate(() => DR_PARTICLES_SCENE.find(e => /StellarBasin\/Particles\/Sparkles$/.test(e.path)));
  await faceFrom(page, sp.pos[0], -sp.pos[2], 14);
  const em = async t => page.evaluate(async t => {
    DR_DEBUG.setTime(t);
    await new Promise(r => setTimeout(r, 1200));
    const a = DRParticles.ambient.find(a => /StellarBasin\/Particles\/Sparkles$/.test(a.e.path));
    if (!a || !a.h) return { on: false };
    const e0 = a.h.emitted; await new Promise(r => setTimeout(r, 1500));
    return { on: true, emitted: a.h.emitted - e0, live: a.h.count };
  }, t);
  const s9 = await em(0.9);
  await shot('stellar-sparkles-night');
  const s5 = await em(0.5);
  check('Sparkles phát lúc t = 0,9', s9.on && s9.emitted > 0, JSON.stringify(s9));
  check('Sparkles không phát lúc t = 0,5', s5.on && s5.emitted === 0, JSON.stringify(s5));

  // ---- Lightning: Emit(1) + sub-emitter Birth bắn ngay
  const lt = await page.evaluate(async () => {
    const b = DR.s.boat, h = DRParticles.spawn('Lightning', { pos: [b.x + 60, 0, b.z] });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = { names: h.systems.map(s => s.node.name), n: h.systems.map(s => s.n), alive: h.alive };
    await new Promise(r => setTimeout(r, 2000)); // bolt sống 0,35 s / simulationSpeed 0,4 = 0,875 s
    r.aliveAfter2s = h.alive;
    return r;
  });
  // sub-emitter: Glow p 1, SubEmitter_Lightning p 0,5 (gieo một lần mỗi bolt), Flash p 1
  check('Lightning: bolt Emit(1), Glow + Flash (p 1) bắn khi bolt sinh, SubEmitter_Lightning (p 0,5) 0 hoặc 1',
    lt.n[0] === 1 && lt.n[1] > 0 && lt.n[3] > 0 && lt.n[2] <= 1, JSON.stringify(lt));
  check('Lightning (loop nhưng playOnAwake tắt) tự giải phóng sau khi hạt tắt', lt.aliveAfter2s === false);
  // FoghornAbility.cs:130-133: startSize/startLifetime rồi Emit(1); luồng gear gọi { size, lifetime }
  const sonar = await page.evaluate(() => {
    const b = DR.s.boat, h = DRParticles.spawn('SonarPulseEffect', { pos: [b.x, 0, b.z], size: 5, lifetime: 1 }), s = h.systems[0];
    const r = { n: s.n, size: s.sx[0], life: s.life[0] }; h.stop(); return r;
  });
  check('SonarPulseEffect { size: 5, lifetime: 1 } → 1 vòng cỡ 5, sống 1 s', sonar.n === 1 && sonar.size === 5 && Math.abs(sonar.life - 1) < 1e-6, JSON.stringify(sonar));

  // ---- stop(): hạt đang sống chạy hết rồi giải phóng
  const st = await page.evaluate(async () => {
    const b = DR.s.boat, h = DRParticles.spawn('CampFire', { pos: [b.x - Math.sin(b.yaw) * 6, 0.5, b.z - Math.cos(b.yaw) * 6] });
    await new Promise(r => setTimeout(r, 1500));
    const before = h.count; h.stop();
    await new Promise(r => setTimeout(r, 100));
    const e0 = h.emitted, after = h.count;
    await new Promise(r => setTimeout(r, 400));
    const e1 = h.emitted;
    const t0 = performance.now();
    while (h.alive && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 100));
    return { before, after, newAfterStop: e1 - e0, alive: h.alive, freedMs: performance.now() - t0 };
  });
  check('stop(): hạt cũ còn sống ngay sau stop, không phát thêm', st.after > 0 && st.newAfterStop === 0, JSON.stringify(st));
  check('stop(): hết hạt thì hệ tự giải phóng (alive = false)', st.alive === false, 'sau ' + st.freedMs.toFixed(0) + ' ms');

  // ---- ảnh: lửa trại Twisted Strand ban đêm, lỗ phun Devil's Spine ban ngày (1920x1080 để ghép với ảnh thật)
  await page.setViewportSize({ width: 1920, height: 1080 });
  const fire = await page.evaluate(() => DR_PARTICLES_SCENE.find(e => e.name === 'CampFire' && /TwistedStrandIsland2\/TwistedStrand_SignPost \(1\)/.test(e.path)));
  await page.evaluate(() => DR_DEBUG.setTime(0.92));
  await faceFrom(page, fire.pos[0], -fire.pos[2], 16);
  await sleep(2500);
  const fireOn = await page.evaluate(() => DRParticles.stats().byName.CampFire);
  check('lửa trại Twisted Strand bật khi tới gần (nguồn đặt sẵn)', fireOn && fireOn.particles > 0, JSON.stringify(fireOn));
  await shot('ts-campfire-night');
  await page.evaluate(() => DR_DEBUG.setTime(0.45));
  await faceFrom(page, 492.78, -481.64, 16);
  await sleep(3000);
  const vent = await page.evaluate(() => DRParticles.stats().byName.ThermalVent);
  check('lỗ phun Devil\'s Spine có hơi + bọt', vent && vent.particles > 0, JSON.stringify(vent));
  const buoy = await page.evaluate(() => {
    const a = DRParticles.ambient.find(a => a.h && /ThermalVents\/10$/.test(a.e.path));
    const s = a && a.h.systems.find(s => s.node.buoy);
    return s ? { y: s.pos[1], depth: s.node.buoy.depth, wave: DRWater.wave(s.pos[0], -s.pos[2], Math.min(1, DRWorld.steep01(s.pos[0], -s.pos[2]) * 10) * DRWater.uniforms.uWaveSteep.value)[0] } : null;
  });
  check('bọt nổi SurfaceBubbles bám sóng (SimpleBuoyantObject: sóng + objectDepth, +0,25 m bù nước web)', buoy && Math.abs(buoy.y - (buoy.wave + buoy.depth + 0.25)) < 0.35, JSON.stringify(buoy));
  await shot('ds-vent-day');
  await page.setViewportSize({ width: 1280, height: 720 });

  const sb = (web, real, name) => {
    try { execFileSync(PY, ['-I', SBS, path.join(SHOTS, web + '.png'), path.join(REAL, real), path.join(SHOTS, 'sbs-' + name + '.png')]); out.push('  · ghép: ' + path.join(SHOTS, 'sbs-' + name + '.png')); }
    catch (e) { out.push('  · không ghép được ' + name + ': ' + e.message.split('\n')[0]); }
  };
  if (fs.existsSync(SBS)) { sb('ts-campfire-night', 'gog_10.jpg', 'campfire'); sb('ds-vent-day', 'gog_25.jpg', 'vent'); sb('rain-storm-sea', 'gog_13.jpg', 'rain'); }

  const p = await page.evaluate(() => DRParticles.stats());
  out.push('  · cuối: ' + p.effects + ' hiệu ứng, ' + p.particles + ' hạt, ' + p.drawCalls + ' draw call hạt, ' + p.ambientOn + '/' + p.ambient + ' nguồn đặt sẵn đang bật');
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 6).join(' | '));
  await browser.close();
  if (srv) srv.close();
}

main().catch(e => { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }).then(() => {
  if (PERF_ONLY) return;
  console.log('DREDGE particles');
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
});
