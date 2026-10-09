/*
 * DREDGE — Biển Mù: kiểm ánh sáng, sương, trời, hậu kỳ màu (luồng W2 "môi trường") và, từ vòng 2, thời tiết / chim / vật nổi / thác.
 *
 * Chạy:  node test/dredge-env.js            (BASELINE=1 chỉ chụp ảnh + đo hiệu năng, bỏ các khẳng định màu và vòng 2)
 *        BASE_MS=<ms> node test/dredge-env.js   (so khung hình với số nền đo trước: phải ≤ 1,15 ×)
 * Ảnh ra %TEMP%/dredge-env/: Greater Marrow lúc 0,3 / 0,5 / 0,75 / 0,9, một khung ở mỗi vùng khác, và vòng 2 (bão, tuyết đêm,
 * chim, phao, thác, sbs-*.png cỡ 1920×1080 để ghép với shots-real/gog_20 và gog_01).
 * Màu mong đợi là số chép tay từ gradient gốc (Game.unity: TimeController, FogController, FogPropertyModifier)
 * — cố ý không đọc từ data/env.js để bắt lỗi nội suy/xuất dữ liệu. Vòng 2 cũng dùng số chép tay (xem khối "VÒNG 2").
 * Các URL mở đầu ghim ?weather=Fine để ảnh và đo nền không phụ thuộc bốc thăm; vòng 2 tự bỏ ghim.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = process.env.DR_ROOT || path.resolve(__dirname, '..'); // DR_ROOT: thư mục chứa bản cũ (git archive) để đo hiệu năng trước/sau
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-env');
const BASELINE = process.env.BASELINE === '1';
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

// góc nhìn hoàng hôn để ghép với shots-real/gog_01.jpg: [x, z, yaw] three.js (đặt sau khi chụp thử, xem sbs-dusk.png)
const DUSK_VIEW = [75, -45, 1.85];   // phía đông đèn biển, nhìn về tây-nam: đèn biển bên trái, phao sáng giữa nước, mặt trời bên phải

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, e) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= e);
const fmt = a => '[' + a.map(v => v.toFixed(4)).join(', ') + ']';

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

// Giá trị gốc, chép tay từ Game.unity (Logic/TimeController, Logic/FogController), nội suy tuyến tính giữa hai khoá:
//   sunColour       0,28 (0,75294 0,587 0,37647) → 0,32941 (1 1 0,89151) → 0,65 (1 1 0,8902) → 0,72 (0,7451 0,583 0,37255) → 0,75 (0 0 0)
//   ambientLight    0,2 (0,5566 0,44896 0,44896) → 0,39181 (0,85377 0,86221 1) → 0,65 (0,81333 0,76215 0,93396) → 0,8 (0,49875 0,54688 0,56) → 0,85 (0,47843 0,47843 0,54902)
const EXPECT = {
  0.3: { sun: [0.852944, 0.754173, 0.584946], amb: [0.711529, 0.664408, 0.736244] },
  0.5: { sun: [1, 1, 0.890813], amb: [0.836824, 0.820282, 0.972327] },
  0.75: { sun: [0, 0, 0], amb: [0.60361, 0.618637, 0.684653] },
  0.9: { sun: [0, 0, 0], amb: [0.47843, 0.47843, 0.54902] }
};
// sương mặc định (FogController.defaultFogColorOverDay) — điền sau khi xuất data/env.js; xem FOG_EXPECT bên dưới
// FogController.defaultFogColorOverDay: 0,25 (0,51887 ×3) → 0,45 (0,68187 0,70637 0,72642) → 0,65 (0,68235 0,70588 0,72549)
//   → 0,75 (0,51765 ×3) → 0,77 → 0,8 (0,15107 0,13857 0,16981)
// Vùng (FogPropertyModifier, trong fullValueRadius ⇒ lấy hẳn gradient của vùng) lúc t = 0,45:
//   Devil's Spine tâm (536, −538) r 100: màu (0,67059 0,58076 0,48975), mật độ Hermite 0,27303→0,46803 = 0,5940
//   Twisted Strand tâm (−444, −518) r 210: màu (0,67059 0,61569 0,46667), mật độ 0,82175
//   Stellar Basin tâm (−440, 458) r 118: màu = mặc định (0,68187 0,70637 0,72642), mật độ 0,32265
//   Pale Reach (DLC1) tâm (−143, 1285) r 325: màu = mặc định, mật độ 0,55942
const FOG_EXPECT = {
  default: { '0.3': [0.55962, 0.565745, 0.570758], '0.5': [0.68199, 0.706248, 0.726188], '0.75': [0.51765, 0.51765, 0.51765], '0.9': [0.15107, 0.13857, 0.16981] },
  zones: {
    'devils-spine': { c: [536, -538], r: 100, fog: [0.67059, 0.58076, 0.48975], dens: 0.5940 },
    'twisted-strand': { c: [-444, -518], r: 210, fog: [0.67059, 0.61569, 0.46667], dens: 0.82175 },
    'stellar-basin': { c: [-440, 458], r: 118, fog: [0.68187, 0.70637, 0.72642], dens: 0.32265 },
    'pale-reach': { c: [-143, 1285], r: 325, fog: [0.68187, 0.70637, 0.72642], dens: 0.55942 }
  }
};

// ======================================================================================================
// VÒNG 2 — E03 thời tiết, E08 chim chỉ ban ngày, E14 vật nổi (phao, thuyền bến), E10 thác Gale Cliffs.
// Số mong đợi chép tay từ asset gốc (cố ý không đọc từ data/*.js):
//   Data/WeatherData/HeavyStorm.asset: waveSteepness 0,15; foamAmount 0,35; cloudiness 1; cloudDarkness 0,9; rainRate 2000; lightning 5–10 s
//   Fine.asset 0,1 / 0,2 / mây 0,4 / tối 0,2 · LightSnow.asset: cloudiness 0,6; cloudDarkness 0,5; waveSteepness 0,075; snowRate 200
//   MediumStorm.asset: waveSteepness 0,125; foamAmount 0,3 · MediumRain.asset: cloudiness 0,85 (WeatherTrigger Gale Cliffs trỏ vào đây)
//   Game.unity: WeatherController.transitionDurationSec 15; Lightning minRange 50, maxRange 250, thunderDelay 0,005 (tiếng sấm sau m × 0,005 s)
//   WeatherTrigger (sắp theo đường dẫn): GaleCliffs MediumRain (455; 450) r 200, hồi 4 ngày, 50 % · StellarBasin Aurora (−431,5; 462,5)
//     r 250, hồi 7 ngày, chỉ đêm (SceneTimeResponder) · TheMarrows Cloudy (83,85; 113,55) r 5, hồi 3 ngày.
//     Tên GameObject "WeatherTrigger [HeavyRain]" nhưng trường `weather` trỏ MediumRain.asset.
//   Trọng số WeatherData: Pale Reach đêm = Aurora 1 + AuroraSnow 1 + Clear 4 + HeavySnow 4 + LightSnow 16 + MediumSnow 8 (+ Finale* 0) = 34, tuyết 29/34;
//     Marrows ngày = Clear 4 + Cloudy 16 + Fine 25 + LightRain 16 + MediumRain 8 + HeavyRain 4 + MediumStorm 4 + HeavyStorm 2 = 79, mưa 34/79, sét 6/79;
//     Stellar Basin đêm có thêm Aurora 1 (tổng 80).
//   TimeOfDayParticles trên 8 bộ phát chim: 0,27–0,6. SimpleBuoyantObject trong STATIC_ROOTS: 17 Buoy*, 6 IronhavenBuoy (objectDepth 0),
//     5 Pontoon_MerchantBoat (objectDepth −0,2); 33 mesh con rời instances.bin (8583 → 8550).
//   GaleCliffsWaterfall_Mat: ScrollSpeed1 0,8; ScrollSpeed2 2; DisplacementAmount 2,06.
// ======================================================================================================
async function round2(page, H) {
  const { goNear, shot } = H;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const waitFn = (fn, arg, timeout) => page.waitForFunction(fn, arg, { timeout: timeout || 20000, polling: 100 });
  const f3 = v => Number(v).toFixed(3);
  // thả thuyền ở điểm nước (sdf > minSdf) gần nhất quanh (x, z) trong bán kính maxR
  const placeNear = (x, z, minSdf, maxR, yaw) => ev(([x0, z0, ms, mr, yw]) => {
    for (let r = 0; r <= mr; r += 1) for (let a = 0; a < 16; a++) {
      const x = x0 + Math.cos(a / 16 * Math.PI * 2) * r, z = z0 + Math.sin(a / 16 * Math.PI * 2) * r;
      if (DRWorld.sdf(x, z) > ms) { DR_DEBUG.teleport(x, z, yw || 0); return [Math.round(x * 100) / 100, Math.round(z * 100) / 100]; }
    }
    return null;
  }, [x, z, minSdf, maxR, yaw]);
  const stat = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return { m, sd: Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) }; };
  const corr = (a, b) => { const A = stat(a), B = stat(b); return a.reduce((s, v, i) => s + (v - A.m) * (b[i] - B.m), 0) / a.length / (A.sd * B.sd || 1); };
  out.push('\n[vòng 2: thời tiết E03, chim E08, vật nổi E14, thác E10]');

  // ---- thiết bị đo: nghe sự kiện 'lightning', thay DRParticles.spawn bằng bản ghi lại (cầu hạt của luồng vfx có thể chưa nối)
  await ev(() => {
    window.__fx = { spawn: [], rate: {}, abs: {}, stop: [], lightning: [] };
    DR.on('lightning', e => __fx.lightning.push(Object.assign({ t: performance.now() }, e)));
    DRParticles.spawn = (name, opts) => {
      __fx.spawn.push([name, JSON.parse(JSON.stringify(opts || {}))]);
      return { alive: true, stop() { __fx.stop.push(name); }, setRate(k) { __fx.rate[name] = k; }, setRateOverTime(r) { __fx.rate[name] = r / (name === 'Rain' ? 2000 : 1000); __fx.abs[name] = r; } };
    };
    DRSky.weather.pin(null);
    DRSky.weather.set('Fine');
  });

  // ---- 1. dữ liệu WeatherTrigger từ scene
  const tr = await ev(() => DRSky.weather.triggers.map(t => ({ w: t.weather, pos: t.pos.map(v => Math.round(v * 100) / 100), r: t.radius, cd: t.cooldownDays, ch: t.chance, night: t.nightOnly })));
  const TR_WANT = [{ w: 'MediumRain', pos: [455, 0, 450], r: 200, cd: 4, ch: 0.5, night: false }, { w: 'Aurora', pos: [-431.5, 0, 462.5], r: 250, cd: 7, ch: 1, night: true },
    { w: 'Cloudy', pos: [83.85, 0, 113.55], r: 5, cd: 3, ch: 1, night: false }];
  check('3 WeatherTrigger đúng scene (tên [HeavyRain] trỏ MediumRain; Aurora chỉ đêm)', JSON.stringify(tr) === JSON.stringify(TR_WANT), JSON.stringify(tr));

  // ---- 2. bốc thăm theo vùng, ngày/đêm, trọng số (WeatherController.PickNewWeather)
  const pk = await ev(() => {
    const W = DRSky.weather, N = 20000, res = { N };
    res.at05 = W.pick('PALE_REACH', false, () => 0.5); res.at0 = W.pick('PALE_REACH', false, () => 0); res.at1 = W.pick('PALE_REACH', false, () => 0.9999);
    const tally = (zone, day) => { const c = {}; for (let i = 0; i < N; i++) { const n = W.pick(zone, day); c[n] = (c[n] || 0) + 1; } return c; };
    res.pale = tally('PALE_REACH', false); res.marrows = tally('THE_MARROWS', true); res.stellar = tally('STELLAR_BASIN', false);
    return res;
  });
  check('bốc thăm Pale Reach ban đêm với r = 0,5 → LightSnow (cộng dồn Aurora 1, AuroraSnow 2, Clear 6, HeavySnow 10, LightSnow 26 / 34)', pk.at05 === 'LightSnow', pk.at05);
  check('r = 0 → Aurora (phần tử đầu có trọng số); r = 0,9999 → MediumSnow (cuối)', pk.at0 === 'Aurora' && pk.at1 === 'MediumSnow', pk.at0 + ' / ' + pk.at1);
  const sh = (c, names) => names.reduce((s, n) => s + (c[n] || 0), 0) / pk.N;
  const snowShare = sh(pk.pale, ['AuroraSnow', 'LightSnow', 'MediumSnow', 'HeavySnow']);
  check('Pale Reach đêm: chỉ ra Aurora/AuroraSnow/Clear/*Snow; tuyết = 29/34 = 0,853 (±0,012)',
    Object.keys(pk.pale).every(n => /^(Aurora|AuroraSnow|Clear|LightSnow|MediumSnow|HeavySnow)$/.test(n)) && Math.abs(snowShare - 29 / 34) < 0.012, 'tuyết ' + f3(snowShare) + ' ' + JSON.stringify(pk.pale));
  const rainShare = sh(pk.marrows, ['LightRain', 'MediumRain', 'HeavyRain', 'MediumStorm', 'HeavyStorm']), stormShare = sh(pk.marrows, ['MediumStorm', 'HeavyStorm']);
  check('Marrows ngày: không tuyết, không Aurora; mưa = 34/79 = 0,430 (±0,015); sét = 6/79 = 0,076 (±0,008)',
    Object.keys(pk.marrows).every(n => /^(Clear|Cloudy|Fine|LightRain|MediumRain|HeavyRain|MediumStorm|HeavyStorm)$/.test(n)) &&
    Math.abs(rainShare - 34 / 79) < 0.015 && Math.abs(stormShare - 6 / 79) < 0.008, 'mưa ' + f3(rainShare) + ', sét ' + f3(stormShare));
  check('Stellar Basin ban đêm có Aurora = 1/80 = 0,0125 (±0,004); Marrows không bao giờ có Aurora', Math.abs((pk.stellar.Aurora || 0) / pk.N - 1 / 80) < 0.004 && !pk.marrows.Aurora, 'Aurora ' + (pk.stellar.Aurora || 0) + '/' + pk.N);

  // ---- 3. ép HeavyStorm bằng đường truyện (lệnh Yarn ChangeWeather → DR.emit('weather')): nước đổi dần trong 15 s
  const spot = await placeNear(380, -60, 30, 40);   // nước thoáng, mặt nạ dốc sóng 0,73 → ×10 kẹp = 1
  await ev(() => { DR_DEBUG.setTime(0.45); DRSky.weather.set('Fine'); __fx.lightning.length = 0; __fx.spawn.length = 0; });
  await sleep(1500);
  const f0 = await ev(() => ({ name: DRSky.weather.name, k: DRSky.weather.k, steep: DRWater.uniforms.uWaveSteep.value, foam: DRWater.uniforms.uFoam.value,
    cloud: DRSky.env.cloudiness, dark: DRSky.env.cloudDarkness, rain: DRSky.weather.rain.rate }));
  check('Fine: uWaveSteep 0,1, uFoam 0,2, mây 0,4, tối 0,2, không mưa (Fine.asset)', f0.name === 'Fine' && f0.k === 1 && Math.abs(f0.steep - 0.1) < 1e-6 && Math.abs(f0.foam - 0.2) < 1e-6 &&
    Math.abs(f0.cloud - 0.4) < 1e-6 && Math.abs(f0.dark - 0.2) < 1e-6 && f0.rain === 0, JSON.stringify(f0) + ' tại ' + JSON.stringify(spot));
  const t0 = Date.now();
  await ev(() => { __fx.lightning.length = 0; DR.emit('weather', 'HeavyStorm'); });
  const rows = [];
  for (;;) {
    await sleep(2200);
    const r = await ev(() => ({ name: DRSky.weather.name, saved: DR.s.weather, k: DRSky.weather.k, steep: DRWater.uniforms.uWaveSteep.value, foam: DRWater.uniforms.uFoam.value,
      cloud: DRSky.env.cloudiness, dark: DRSky.env.cloudDarkness, rain: DRSky.weather.rain.rate, strikes: __fx.lightning.length, tr: DRSky.weather.transitioning }));
    r.el = (Date.now() - t0) / 1000;
    rows.push(r);
    if (r.k >= 1 || r.el > 40) break;
  }
  const mid = rows.filter(r => r.k < 1), end = rows[rows.length - 1];
  check('truyện ChangeWeather HeavyStorm: WeatherController đổi và ghi DR.s.weather', rows[0].name === 'HeavyStorm' && rows[0].saved === 'HeavyStorm', rows[0].name + ' / ' + rows[0].saved);
  check('đang chuyển: uWaveSteep = 0,1 + 0,05·k và uFoam = 0,2 + 0,15·k (lerp tuyến tính, ±0,004)', mid.length >= 3 &&
    mid.every(r => Math.abs(r.steep - (0.1 + 0.05 * r.k)) < 0.004 && Math.abs(r.foam - (0.2 + 0.15 * r.k)) < 0.004), mid.map(r => 'k ' + f3(r.k) + ' dốc ' + f3(r.steep) + ' bọt ' + f3(r.foam)).join(' | '));
  check('đoạn chuyển dài 15 s (k bám đồng hồ thật ±0,08)', mid.every(r => Math.abs(r.k - r.el / 15) < 0.08), mid.map(r => f3(r.k) + '@' + r.el.toFixed(1)).join(' '));
  check('sau 15 s: uWaveSteep = 0,15, uFoam = 0,35 (HeavyStorm.asset), mây 1, tối 0,9, mưa 2000 hạt/s',
    end.k === 1 && Math.abs(end.steep - 0.15) < 1e-4 && Math.abs(end.foam - 0.35) < 1e-4 && Math.abs(end.cloud - 1) < 1e-4 && Math.abs(end.dark - 0.9) < 1e-4 && Math.abs(end.rain - 2000) < 0.5,
    JSON.stringify(end));
  check('đang chuyển không có sét (hẹn giờ bốc lại mỗi khung, WeatherController.cs:429-432)', mid.every(r => r.strikes === 0), mid.map(r => r.strikes).join(','));
  const fxr = await ev(() => ({ spawn: __fx.spawn.filter(s => s[0] === 'Rain'), rate: __fx.rate.Rain, abs: __fx.abs.Rain, snow: __fx.spawn.filter(s => s[0] === 'Snow').length }));
  check("cầu hạt: DRParticles.spawn('Rain', { follow: 'camera', loop: true }) một lần, setRateOverTime(2000) tuyệt đối (HeavyStorm rain.rate), không tuyết",
    fxr.spawn.length === 1 && JSON.stringify(fxr.spawn[0][1]) === JSON.stringify({ follow: 'camera', loop: true }) && fxr.rate === 1 && fxr.abs === 2000 && fxr.snow === 0, JSON.stringify(fxr));
  await sleep(4000);
  const bs = await ev(() => { const b = DR.s.boat, f = DRBoat.feel(); return { ws: f.waveSteep, mask: Math.min(1, DRWorld.steep01(b.x, b.z) * 10), u: DRWater.uniforms.uWaveSteep.value }; });
  check('sóng của thuyền (boat.js đọc uWaveSteep): độ dốc ở thuyền = 0,15 × mặt nạ (±0,01)', bs.mask > 0.9 && Math.abs(bs.ws - 0.15 * bs.mask) < 0.01, 'dốc thuyền ' + f3(bs.ws) + ', mặt nạ ' + f3(bs.mask));
  await shot('weather-heavystorm');

  // sét sau khi hết chuyển: mỗi 5–10 s, trên vòng 50–250 m quanh thuyền, tiếng sấm sau dist × 0,005 s
  let lg = null;
  try {
    await waitFn(() => __fx.lightning.length >= 2, null, 45000);
    lg = await ev(() => ({ ev: __fx.lightning.slice(0, 2), boat: { x: DR.s.boat.x, z: DR.s.boat.z }, sp: __fx.spawn.filter(s => s[0] === 'Lightning') }));
  } catch (e) { out.push('  · không thấy 2 tia sét trong 45 s: ' + e.message); }
  check('HeavyStorm: ≥ 2 tia sét, mỗi tia cách thuyền 50–250 m, delay = dist × 0,005',
    !!lg && lg.ev.every(e => e.dist >= 50 && e.dist <= 250 && Math.abs(e.delay - e.dist * 0.005) < 1e-9 && Math.abs(Math.hypot(e.x - lg.boat.x, e.z - lg.boat.z) - e.dist) < 1),
    lg && lg.ev.map(e => 'dist ' + e.dist.toFixed(1) + ' delay ' + e.delay.toFixed(3)).join(' | '));
  check('khoảng giữa hai tia = Random.Range(5; 10) s (4,7–10,5)', !!lg && (lg.ev[1].t - lg.ev[0].t) / 1000 > 4.7 && (lg.ev[1].t - lg.ev[0].t) / 1000 < 10.5, lg && ((lg.ev[1].t - lg.ev[0].t) / 1000).toFixed(2) + ' s');
  check("cầu hạt: DRParticles.spawn('Lightning', { pos: [x, 0, z] }) đúng điểm đánh", !!lg && lg.sp.length >= 2 &&
    lg.ev.every((e, i) => Math.abs(lg.sp[i][1].pos[0] - e.x) < 1e-6 && lg.sp[i][1].pos[1] === 0 && Math.abs(lg.sp[i][1].pos[2] - e.z) < 1e-6), lg && JSON.stringify(lg.sp.map(s => s[1])));

  // ---- 4. Pale Reach ban đêm: dịch chuyển tức thời → bốc thăm lại ngay → tuyết
  const sn = await ev(() => {
    DRSky.weather.random = () => 0.5;
    DR_DEBUG.setTime(0.9);
    DRSky.weather.set('Fine');
    __fx.spawn.length = 0;
    DR_DEBUG.teleport(-162, 1290, 0);
    return DRWorld.zoneAt(-162, 1290);
  });
  await waitFn(() => DRSky.weather.name === 'LightSnow', null, 8000).catch(() => {});
  await sleep(400);
  const ps = await ev(() => ({ name: DRSky.weather.name, k: DRSky.weather.k, saved: DR.s.weather, day: DRSky.env.isDay, snow: DRSky.weather.snow.rate, snowK: DRSky.weather.snowK, rain: DRSky.weather.rain.rate,
    steep: DRWater.uniforms.uWaveSteep.value, cloud: DRSky.env.cloudiness, dark: DRSky.env.cloudDarkness, spawn: __fx.spawn.filter(s => s[0] === 'Snow'), rate: __fx.rate, abs: __fx.abs, rainRate: __fx.rate.Rain }));
  check('Pale Reach ban đêm, thời tiết cũ không tồn tại ở vùng này → bốc thăm ngay ra tuyết (r = 0,5 → LightSnow)', sn === 'PALE_REACH' && !ps.day && ps.name === 'LightSnow' && ps.saved === 'LightSnow' && ps.k === 1, JSON.stringify({ zone: sn, ps: ps.name, k: ps.k }));
  check('LightSnow.asset: mây 0,6, tối 0,5, dốc sóng 0,075, tuyết 200 hạt/s, mưa tắt',
    Math.abs(ps.cloud - 0.6) < 1e-4 && Math.abs(ps.dark - 0.5) < 1e-4 && Math.abs(ps.steep - 0.075) < 1e-4 && ps.snow === 200 && ps.rain === 0, JSON.stringify(ps));
  check("cầu hạt: DRParticles.spawn('Snow', { follow: 'player', loop: true }), setRateOverTime(200) cho tuyết; mưa 0",
    ps.spawn.length === 1 && JSON.stringify(ps.spawn[0][1]) === JSON.stringify({ follow: 'player', loop: true }) && ps.abs.Snow === 200 && ps.rainRate === 0, JSON.stringify({ n: ps.spawn.length, rate: ps.rate }));
  await shot('weather-pale-night-snow');
  // ảnh ghép với gog_20 (đêm, tuyết): 1920×1080, thuyền quay mặt ra khơi
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(1500);
  await shot('sbs-night-snow');
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(1200);
  await shot('phone-night-snow');
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(800);

  // kiểm vùng mỗi 5 s (không dịch chuyển): thời tiết không hợp vùng bị thay trong ≤ 5 s, có đoạn chuyển
  await ev(() => { DRSky.weather.set('Fine'); });
  await waitFn(() => DRSky.weather.name !== 'Fine', null, 9000).catch(() => {});
  const zc = await ev(() => ({ name: DRSky.weather.name, tr: DRSky.weather.transitioning, k: DRSky.weather.k }));
  check('kiểm vùng mỗi 5 s: Fine không tồn tại ở Pale Reach → đổi (có đoạn chuyển 15 s, không nhảy ngay)', zc.name === 'LightSnow' && zc.tr === true && zc.k < 0.5, JSON.stringify(zc));
  await ev(() => { DRSky.weather.random = Math.random; });

  // ---- 5. WeatherTrigger (đụng cầu bằng hộp va chạm của thuyền, hồi theo ngày, xác suất)
  // Bẫy 1: placeNear trả null khi quanh điểm không có nước đủ xa bờ — thuyền không dời, "ra khỏi cầu" thành ra không xảy ra (đã sập ở (20; −30), sát bến Greater Marrow).
  //         (250; 200) là nước thoáng sdf > 20, cách cả 3 cầu trigger ≥ 187 m (Cloudy gần nhất); leave() ném lỗi nếu không thả được.
  // Bẫy 2: xoá cooldown/inside LÚC CÒN ĐỨNG trong một cầu thì cầu đó bắn lại ngay — luôn ra ngoài trước rồi mới resetTr().
  const leave = async () => {
    const p = await placeNear(250, 200, 20, 30);
    if (!p) throw new Error('không thả được thuyền ra nước thoáng quanh (250; 200) trong 30 m');
    await sleep(500);
    return p;
  };
  const resetTr = () => ev(() => { for (const t of DRSky.weather.triggers) { t.last = -Infinity; t.inside = false; } });
  await ev(() => { DR_DEBUG.setTime(0.4); DRSky.weather.random = () => 0; DRSky.weather.set('Fine'); });
  const gm0 = await leave();                                   // ngoài mọi cầu
  await resetTr();
  const cl = await placeNear(83.85, 113.55, 1.2, 4);           // trong 4 m quanh tâm Cloudy (cầu r 5)
  await sleep(700);
  const t1 = await ev(() => ({ name: DRSky.weather.name, saved: DR.s.weather, last: DRSky.weather.triggers[2].last, time: DR.s.time, w: DRSky.weather.triggers[2].weather }));
  check('WeatherTrigger Marrows: thuyền vào cầu r 5 (83,85; 113,55) → Cloudy, cooldown ghi theo ngày', !!cl && t1.name === 'Cloudy' && t1.saved === 'Cloudy' && Math.abs(t1.last - t1.time) < 0.01, JSON.stringify({ from: gm0, at: cl, t1 }));
  await ev(() => { DRSky.weather.set('Fine'); });
  await leave();
  await placeNear(83.85, 113.55, 1.2, 4); await sleep(700);
  const t2 = await ev(() => DRSky.weather.name);
  check('vào lại trong cooldown 3 ngày: không đổi (vẫn Fine)', t2 === 'Fine', t2);
  await ev(() => { DR.s.time += 3.2; DRSky.weather.set('Fine'); });
  await leave();
  await placeNear(83.85, 113.55, 1.2, 4); await sleep(700);
  const t3 = await ev(() => DRSky.weather.name);
  check('hết cooldown (3,2 ngày sau): vào lại → Cloudy', t3 === 'Cloudy', t3);

  // Gale Cliffs: 50 %, tâm (455; 450) nằm trong đất nên thả thuyền trong cầu r 200
  await ev(() => { DRSky.weather.set('Fine'); DRSky.weather.random = () => 0.6; });
  await leave();
  await resetTr();
  const gc = await placeNear(396, 366, 10, 30); await sleep(700);
  const g1 = await ev(() => ({ name: DRSky.weather.name, used: DRSky.weather.triggers[0].last > -Infinity }));
  check('Gale Cliffs: bốc thăm 0,6 ≥ 0,5 → không đổi nhưng cooldown vẫn tính', !!gc && g1.name === 'Fine' && g1.used, JSON.stringify({ at: gc, g1 }));
  await leave();
  await ev(() => { DRSky.weather.random = () => 0.4; DRSky.weather.set('Fine'); });
  await resetTr();
  await placeNear(396, 366, 10, 30); await sleep(700);
  const g2 = await ev(() => DRSky.weather.name);
  check('bốc thăm 0,4 < 0,5 → MediumRain (trường weather của trigger, không phải HeavyRain như tên)', g2 === 'MediumRain', g2);

  // Aurora: chỉ đêm. Ban ngày đứng trong cầu: không đổi; tới đêm: bật → Aurora
  await leave();
  await ev(() => { DRSky.weather.random = () => 0.5; DR_DEBUG.setTime(0.4); DRSky.weather.set('Fine'); });
  await resetTr();
  await placeNear(-414, 443, 30, 20); await sleep(1000);
  const a1 = await ev(() => DRSky.weather.name);
  // neo weather-time sát giờ mới để quy tắc hết 6 giờ không tự bốc thăm (r = 0,5 ở Stellar đêm ra Fine, không phải Aurora): chỉ trigger mới ra Aurora
  await ev(() => { DR.s.vars['weather-time'] = Math.floor(DR.s.time) + 0.89; DR_DEBUG.setTime(0.9); });
  await waitFn(() => DRSky.weather.name === 'Aurora', null, 6000).catch(() => {});
  const a2 = await ev(() => ({ name: DRSky.weather.name, aur: DRSky.weather.cur.parameters.auroraAmount, day: DRSky.env.isDay }));
  check('Aurora: ban ngày trong cầu r 250 không đổi; tới đêm trigger bật → Aurora (auroraAmount 4)', a1 === 'Fine' && a2.name === 'Aurora' && a2.aur === 4 && !a2.day, JSON.stringify({ a1, a2 }));
  await ev(() => { DRSky.weather.random = Math.random; });

  // ---- 6. lưu/nạp và hết durationHours
  // ra nước thoáng trước khi lưu: đứng trong cầu Aurora ban đêm thì nạp ván bắn lại trigger (timeOfLastTrigger không nằm trong SaveData — đúng bản gốc)
  await leave();
  await ev(() => { DRSky.weather.set('MediumStorm'); DR.save(); DRSky.weather.set('Fine'); });
  await ev(() => { DR.load(); });
  await sleep(500);
  const ld = await ev(() => ({ name: DRSky.weather.name, k: DRSky.weather.k, tr: DRSky.weather.transitioning, steep: DRWater.uniforms.uWaveSteep.value, foam: DRWater.uniforms.uFoam.value, time: typeof DR.s.vars['weather-time'] }));
  check('nạp ván: thời tiết đã lưu (MediumStorm) vào ngay, không chuyển 15 s; dốc 0,125, bọt 0,3 (MediumStorm.asset)',
    ld.name === 'MediumStorm' && ld.k === 1 && !ld.tr && Math.abs(ld.steep - 0.125) < 1e-4 && Math.abs(ld.foam - 0.3) < 1e-4 && ld.time === 'number', JSON.stringify(ld));
  await ev(() => { DR_DEBUG.setTime(0.4); DRSky.weather.random = () => 0.9; DRSky.weather.set('Fine'); });
  await leave();
  const d0 = await ev(() => { DR.s.time += 0.2; return { name: DRSky.weather.name, wt: DR.s.vars['weather-time'], t: DR.s.time }; });
  await sleep(700);
  const d1 = await ev(() => ({ name: DRSky.weather.name, wt: DR.s.vars['weather-time'] }));
  check('Fine kéo dài 6 giờ: sau 4,8 giờ chưa đổi', d1.name === 'Fine' && d1.wt === d0.wt, JSON.stringify({ d0, d1 }));
  await ev(() => { DR.s.time += 0.06; });
  await sleep(900);
  const d2 = await ev(() => ({ name: DRSky.weather.name, wt: DR.s.vars['weather-time'], t: DR.s.time, tr: DRSky.weather.transitioning }));
  check('quá 6 giờ (4,8 + 1,44) → bốc thăm lại (Marrows ngày, r 0,9 → MediumRain), ghi weather-time', d2.name === 'MediumRain' && Math.abs(d2.wt - d2.t) < 0.02 && d2.tr, JSON.stringify(d2));
  await ev(() => { DRSky.weather.random = Math.random; });

  // ---- 7. chim chỉ bay 0,27–0,60 của ngày (TimeOfDayParticles)
  await ev(() => { DRSky.weather.pin('Fine'); });
  await goNear(-3, 30);
  const bd = await ev(() => DRWorld.ambient.birds.map(B => ({ n: B.e.path.split('/').slice(-2, -1)[0], tod: B.e.tod })));
  check('8 bộ phát chim, mỗi cái mang tod [0,27; 0,6] (TimeOfDayParticles)', bd.length === 8 && bd.every(b => b.tod && b.tod[0] === 0.27 && b.tod[1] === 0.6), JSON.stringify(bd.map(b => b.tod)));
  const birds = () => ev(() => { const A = DRWorld.ambient.birds; return { spawned: A.reduce((s, B) => s + B.spawned, 0), alive: A.reduce((s, B) => s + B.ps.length, 0), drawn: A.reduce((s, B) => s + B.im.count, 0), playing: A.filter(B => B.playing).length }; });
  await ev(() => DR_DEBUG.setTime(0.4));
  await waitFn(() => DRWorld.ambient.birds.reduce((s, B) => s + B.ps.length, 0) > 0, null, 15000).catch(() => {});
  const b1 = await birds();
  check('ban ngày (t = 0,4): chim được sinh và đang bay', b1.spawned > 0 && b1.alive > 0 && b1.drawn > 0 && b1.playing >= 1, JSON.stringify(b1));
  await shot('birds-day');
  await ev(() => DR_DEBUG.setTime(0.9));
  await sleep(300);
  const b2 = await birds();
  await sleep(6500);                                            // > lengthInSec 5 s: một vòng phát trọn vẹn trôi qua
  const b3 = await birds();
  check('t = 0,9 (ngoài khung): Stop() — không sinh thêm chim (6,5 s, hơn một vòng 5 s), chim đang bay bay nốt', b2.playing === 0 && b3.spawned === b2.spawned && b2.alive > 0 && b3.alive <= b2.alive, JSON.stringify({ b2, b3 }));
  await waitFn(() => DRWorld.ambient.birds.reduce((s, B) => s + B.ps.length, 0) === 0, null, 20000).catch(() => {});
  const b4 = await birds();
  await shot('birds-night-0.9');
  check('t = 0,9: chim đang bay đã bay hết (đời 10–16 s), không còn con nào, không sinh thêm', b4.alive === 0 && b4.drawn === 0 && b4.spawned === b2.spawned, JSON.stringify(b4));
  await ev(() => DR_DEBUG.setTime(0.4));
  await waitFn(() => DRWorld.ambient.birds.reduce((s, B) => s + B.spawned, 0) > 0 && DRWorld.ambient.birds.reduce((s, B) => s + B.ps.length, 0) > 0, null, 12000).catch(() => {});
  const b5 = await birds();
  check('quay về t = 0,4: Play() lại, chim sinh trở lại', b5.spawned > b4.spawned && b5.alive > 0, JSON.stringify(b5));

  // ---- 8. phao bập bềnh theo sóng (SimpleBuoyantObject) và thuyền bến
  const bu = await ev(() => ({ n: DRWorld.buoys.length, buoy: DRWorld.buoys.filter(b => /^Buoy/.test(b.name)).length, iron: DRWorld.buoys.filter(b => /^IronhavenBuoy/.test(b.name)).length,
    pon: DRWorld.buoys.filter(b => /^Pontoon_MerchantBoat/.test(b.name)).length, parts: DRWorld.buoys.reduce((s, b) => s + b.parts.length, 0), inst: DRWorld.data.world.counts.instances,
    split: DRWorld.data.world.counts.filtered.buoyant, depths: [...new Set(DRWorld.buoys.map(b => b.depth))].sort() }));
  check('world.json tách 28 vật nổi (17 Buoy, 6 IronhavenBuoy, 5 Pontoon_MerchantBoat; 33 mesh con) khỏi instances.bin (8583 → 8550)',
    bu.n === 28 && bu.buoy === 17 && bu.iron === 6 && bu.pon === 5 && bu.parts === 33 && bu.inst === 8550 && bu.split === 33 && JSON.stringify(bu.depths) === '[-0.2,0]', JSON.stringify(bu));
  await ev(() => { DRSky.weather.pin('Fine'); DRSky.weather.set('Fine'); });
  const bpos = await placeNear(237.5 + 9, 271.3 + 9, 5, 30);   // phao TheMarrows/Props/Buoy (2): mặt nạ dốc 0,102 → ×10 kẹp 1 (nước thoáng)
  await sleep(2500);
  const sm = [];
  for (let i = 0; i < 80; i++) {
    await sleep(300);
    sm.push(await ev(() => {
      const B = DRWorld.buoys.find(b => Math.abs(b.x - 237.5) < 0.1 && Math.abs(b.z - 271.3) < 0.1), cam = DR_DEBUG.camera.position, r = B.refs[0];
      return { t: performance.now() / 1000, cy: B.cy, target: B.target, ref: DRWater.surface(B.x, B.z, cam.x, cam.z, true) + B.depth,
        matY: r.im.instanceMatrix.array[r.k * 16 + 13], baseY: r.m.elements[13], y0: B.y };
    }));
  }
  // SimpleBuoyantObject.cs:28-44 = giữ mẫu sóng 0,5 s rồi Lerp(y, target, dt) (τ = 1 s): y luôn TRỄ sóng và thấp biên — đo tương quan ở độ trễ tốt nhất, không ở độ trễ 0 (đo ở độ trễ 0 ra 0,83 dù đúng)
  const ts = sm.map(s => s.t), cys = sm.map(s => s.cy), refs = sm.map(s => s.ref);
  const rangeOf = a => Math.max(...a) - Math.min(...a);
  const range = rangeOf(cys), refRange = rangeOf(refs);
  const refAt = t => { let j = 0; while (j < ts.length - 2 && ts[j + 1] < t) j++; return refs[j] + (refs[j + 1] - refs[j]) * (t - ts[j]) / (ts[j + 1] - ts[j]); };
  let best = { lag: 0, c: -2, n: 0 };
  for (let lag = 0; lag <= 3.0001; lag += 0.1) {
    const xa = [], xb = [];
    sm.forEach(s => { if (s.t - lag >= ts[0]) { xa.push(s.cy); xb.push(refAt(s.t - lag)); } });
    const c = corr(xa, xb);
    if (c > best.c) best = { lag, c, n: xa.length };
  }
  check('phao nổi theo sóng (Fine, 24 s): biên y ≥ 0,2 m và ≥ 0,6 × biên mặt nước (lerp τ 1 s làm thấp biên)', !!bpos && range >= 0.2 && range >= 0.6 * refRange,
    'tại ' + JSON.stringify(bpos) + ': biên phao ' + range.toFixed(3) + ' m, biên mặt nước ' + refRange.toFixed(3) + ' m, tỉ số ' + (range / refRange).toFixed(2));
  check('phao bám sóng có trễ: tương quan cao nhất ≥ 0,95 ở độ trễ 0,3–2,1 s (giữ mẫu 0,5 s ≈ 0,25 s + lerp τ = 1 s)', best.c >= 0.95 && best.lag >= 0.3 && best.lag <= 2.1,
    'tương quan ' + best.c.toFixed(3) + ' ở trễ ' + best.lag.toFixed(1) + ' s (' + best.n + ' mẫu); ở trễ 0 chỉ ' + corr(cys, refs).toFixed(3));
  const refSlope = Math.max(...refs.slice(1).map((v, i) => Math.abs(v - refs[i]) / (ts[i + 1] - ts[i])));
  const tgtErr = Math.max(...sm.map(s => Math.abs(s.target - s.ref)));
  check('target = mẫu mặt nước lấy ≤ 0,5 s trước: |target − mặt nước| ≤ 0,6 s × độ dốc lớn nhất của mặt nước', tgtErr <= 0.6 * refSlope + 0.005,
    'sai lệch lớn nhất ' + tgtErr.toFixed(3) + ' m, ngưỡng ' + (0.6 * refSlope + 0.005).toFixed(3) + ' m (dốc ' + refSlope.toFixed(3) + ' m/s)');
  let num = 0, den = 0;
  for (let i = 1; i < sm.length; i++) {
    const dt = ts[i] - ts[i - 1], rate = (cys[i] - cys[i - 1]) / dt, drive = (sm[i].target + sm[i - 1].target) / 2 - (cys[i] + cys[i - 1]) / 2;
    num += rate * drive; den += drive * drive;
  }
  const lerpK = num / den;
  check('y = Lerp(y, target, dt): hồi quy dy/dt theo (target − y) có hệ số 1,0 ± 0,15 (τ = 1 s)', Math.abs(lerpK - 1) <= 0.15, 'hệ số ' + lerpK.toFixed(3) + ' (' + (sm.length - 1) + ' cặp mẫu)');
  check('mesh vẽ ra dịch đúng theo y vật chủ (ma trận instance = ma trận gốc + (cy − y0)), sai số < 1e-4', sm.every(s => Math.abs(s.matY - (s.baseY + s.cy - s.y0)) < 1e-4), 'max ' + Math.max(...sm.map(s => Math.abs(s.matY - (s.baseY + s.cy - s.y0)))).toExponential(2));
  await shot('buoy-open-water');
  // thuyền bến: objectDepth −0,2, nước lặng (mặt nạ 0) nên y = −0,2 đúng
  await placeNear(-309.17 + 8, -462.83 + 8, 4, 30);
  await sleep(2500);
  const pt = await ev(() => { const B = DRWorld.buoys.find(b => Math.abs(b.x + 309.17) < 0.1 && Math.abs(b.z + 462.83) < 0.1); return { name: B.name, cy: B.cy, target: B.target, depth: B.depth, y0: B.y, parts: B.parts.length, steep: DRWorld.steep01(B.x, B.z) }; });
  check('Pontoon_MerchantBoat (bến TS): objectDepth −0,2 từ scene → y = sóng(0) − 0,2 = −0,2 (±0,002); 2 mesh con', pt.name === 'Pontoon_MerchantBoat' && pt.depth === -0.2 && Math.abs(pt.cy + 0.2) < 0.002 && pt.parts === 2, JSON.stringify(pt));
  await shot('pontoon-boat');

  // ---- 9. thác Gale Cliffs: ShaderMaterial cuộn UV (ScrollSpeed 0,8 / 2), dời đỉnh 2,06
  const wf = await ev(() => { const dx = 573 - 544, dz = 509 - 501, l = Math.hypot(dx, dz); DR_DEBUG.teleport(544, 501, Math.atan2(-dx / l, -dz / l)); return DRWorld.sdf(544, 501); });
  await sleep(2500);
  const wm = await ev(() => {
    let m = null;
    DR_DEBUG.scene.traverse(o => { if (!m && o.material && o.material.name === 'GaleCliffsWaterfall_Mat') m = o.material; });
    return m && { sh: !!m.isShaderMaterial, scroll: m.uniforms.uScroll.value.toArray(), disp: m.uniforms.uDisp.value, map: !!m.uniforms.tMap.value, t: DRSky.uniforms.uDrTime.value };
  });
  check('thác: ShaderMaterial riêng, ScrollSpeed1/2 = 0,8 / 2, DisplacementAmount 2,06, có texture', !!wm && wm.sh && wm.scroll[0] === 0.8 && wm.scroll[1] === 2 && wm.disp === 2.06 && wm.map, JSON.stringify(wm) + ' sdf ' + wf);
  await page.screenshot({ path: path.join(SHOTS, 'waterfall-a.png') });
  await sleep(1200);
  await page.screenshot({ path: path.join(SHOTS, 'waterfall-b.png') });
  const wt2 = await ev(() => DRSky.uniforms.uDrTime.value);
  const wa = fs.readFileSync(path.join(SHOTS, 'waterfall-a.png')), wb = fs.readFileSync(path.join(SHOTS, 'waterfall-b.png'));
  check('thác cuộn theo thời gian: uDrTime tăng ≥ 1 s và hai khung cách 1,2 s khác nhau', wt2 - wm.t >= 1 && Buffer.compare(wa, wb) !== 0, 'uDrTime ' + wm.t.toFixed(2) + ' → ' + wt2.toFixed(2));

  // ---- 10. ảnh ghép với gog_01 (hoàng hôn, phao sáng, đèn biển): 1920×1080
  await ev(() => { DRSky.weather.pin('Fine'); DR_DEBUG.setTime(0.72); });
  await ev(([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), DUSK_VIEW);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(2500);
  await shot('sbs-dusk');
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(800);
  // trả về trạng thái như đầu bài cho phần đo hiệu năng
  await ev(() => { DRSky.weather.pin('Fine'); DRSky.weather.set('Fine'); });
}

async function main() {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], foreign = [];
  // 404 của tệp luồng khác chưa có trên đĩa (đang làm song song) chỉ ghi chú; tệp của luồng môi trường thiếu là lỗi thật
  const MINE = /\/games\/dredge\/(data\/env\.js|art\/env\/|js\/sky\.js|js\/world\.js|js\/water\.js|art\/world\/)/;
  const missingForeign = url => { const u = decodeURIComponent(new URL(url).pathname); return !MINE.test(u) && !fs.existsSync(path.join(ROOT, u)); };
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource: the server responded with a status of 404/.test(m.text()) && foreign.length) return;
    errors.push('console: ' + m.text());
  });
  page.on('response', r => {
    if (r.status() < 400) return;
    if (r.status() === 404 && missingForeign(r.url())) foreign.push(r.url().split('?')[0]); else errors.push('HTTP ' + r.status() + ' ' + r.url());
  });
  const shot = name => page.screenshot({ path: path.join(SHOTS, name + '.png') });

  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.3&weather=Fine');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await sleep(800);
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock' || DR.mode === 'sail', null, { timeout: 20000 });
  await page.evaluate(() => { if (DR.mode === 'dock') DR.setMode('sail'); });
  await sleep(600);

  // tìm điểm nước gần (x, z) có khoảng hở ≥ 25 m, rồi thả thuyền hướng vào đất gần nhất (nhìn thấy bờ)
  const goNear = (x, z) => page.evaluate(([x0, z0]) => {
    for (let r = 0; r < 200; r += 5) for (let a = 0; a < 24; a++) {
      const x = x0 + Math.cos(a / 24 * Math.PI * 2) * r, z = z0 + Math.sin(a / 24 * Math.PI * 2) * r;
      const d = DRWorld.sdf(x, z);
      if (d > 15 && d < 70) {
        const [gx, gz] = DRWorld.grad(x, z);
        // yaw: hướng mũi (−sin, −cos); quay mũi về phía đất (ngược gradient) thì camera phía sau nhìn thấy bờ
        DR_DEBUG.teleport(x, z, Math.atan2(gx, gz));
        return { x: Math.round(x), z: Math.round(z), sdf: Math.round(d) };
      }
    }
    DR_DEBUG.teleport(x0, z0, 0); return { x: x0, z: z0, sdf: DRWorld.sdf(x0, z0) };
  }, [x, z]);
  const envAt = () => page.evaluate(() => {
    const e = DRSky.env, c = v => v ? [v.r, v.g, v.b] : null;
    return { sun: e.sunColor, amb: e.ambientColor, fog: e.fogColor, dens: e.fogDensityRaw, zone: DR.view.zoneId, post: !!(DRSky.post && DRSky.post.enabled) };
  });

  // ---- Greater Marrow theo giờ ----
  const gm = await goNear(-3, 30);
  out.push('Greater Marrow: thả ở ' + JSON.stringify(gm));
  for (const t of [0.3, 0.5, 0.75, 0.9]) {
    await page.evaluate(t => DR_DEBUG.setTime(t), t);
    await sleep(1500);
    await shot('gm-t' + t);
    if (BASELINE) continue;
    const e = await envAt();
    const X = EXPECT[t];
    check('t=' + t + ' sunColour', e.sun && near(e.sun, X.sun, 0.004), e.sun && fmt(e.sun));
    if (X.amb) check('t=' + t + ' ambientLightColor', e.amb && near(e.amb, X.amb, 0.004), e.amb && fmt(e.amb));
    const F = FOG_EXPECT.default[String(t)];
    check('t=' + t + ' màu sương (vùng Marrow, không modifier)', e.fog && near(e.fog, F, 0.004), e.fog && fmt(e.fog) + ' mong ' + fmt(F));
  }

  // ---- các vùng khác lúc 0,45 ----
  const REG = [['gale-cliffs', 406, 349], ['stellar-basin', -440, 458], ['twisted-strand', -444, -518], ['devils-spine', 536, -538],
    ['pale-reach', -143, 1285], ['iron-rig', -13, -688], ['open-ocean', 250, 200]];
  await page.evaluate(() => DR_DEBUG.setTime(0.45));
  for (const [name, x, z] of REG) {
    const p = await goNear(x, z);
    await sleep(1800);
    await shot('zone-' + name);
    const e = BASELINE ? null : await envAt();
    out.push('  · ' + name + ' ' + JSON.stringify(p) + (e ? ' vùng ' + e.zone + ' sương ' + fmt(e.fog) + ' mật độ ' + e.dens.toFixed(3) : ''));
    const F = !BASELINE && FOG_EXPECT.zones[name];
    if (F) {
      const inside = Math.hypot(p.x - F.c[0], p.z - F.c[1]) < F.r;
      check(name + ': thuyền trong fullValueRadius của FogPropertyModifier', inside, JSON.stringify(p));
      if (inside) {
        check(name + ': màu sương = gradient vùng', near(e.fog, F.fog, 0.002), fmt(e.fog) + ' mong ' + fmt(F.fog));
        check(name + ': _FogDensity = đường cong vùng', Math.abs(e.dens - F.dens) < 0.002, e.dens.toFixed(4) + ' mong ' + F.dens);
      }
    }
  }

  if (!BASELINE) await round2(page, { goNear, shot });

  // ---- hiệu năng (ngày, gần Greater Marrow, đang chạy) — giống test/dredge-suite.js ----
  await page.evaluate(() => { DR_DEBUG.setTime(0.4); DR_DEBUG.teleport(20, -30, 0.3); });
  // trung vị của 10 lần lấy mẫu (mỗi mẫu = 120 khung cuối) khi đang chạy thẳng: một mẫu đơn dao động ±20 %
  await page.keyboard.down('KeyW'); await sleep(1500);
  const smp = [];
  for (let i = 0; i < 10; i++) { await sleep(400); smp.push(await page.evaluate(() => DR_DEBUG.perf())); }
  await page.keyboard.up('KeyW');
  const med = k => { const a = smp.map(x => x[k]).sort((x, y) => x - y); return (a[4] + a[5]) / 2; };
  const p = smp[smp.length - 1];
  out.push('  · hiệu năng (trung vị 10 mẫu): ' + p.calls + ' draw call, ' + (p.tris / 1000).toFixed(0) + 'k tam giác, khung ' + med('avgMs').toFixed(2) +
    ' ms, CPU ' + med('cpuMs').toFixed(2) + ' ms, ' + p.programs + ' shader');
  if (!BASELINE) {
    const e = await envAt();
    check('hậu kỳ màu đang bật', e.post);
  }
  if (process.env.BASE_MS) check('khung hình ≤ 1,15 × số nền ' + process.env.BASE_MS + ' ms', med('avgMs') <= Number(process.env.BASE_MS) * 1.15, med('avgMs').toFixed(2) + ' ms');
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 6).join(' | '));
  if (foreign.length) out.push('  · 404 tệp luồng khác chưa có trên đĩa (bỏ qua): ' + [...new Set(foreign)].join(', '));
  await browser.close();
  if (srv) srv.close();
}

main().catch(e => { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }).then(() => {
  console.log('DREDGE env' + (BASELINE ? ' (BASELINE)' : ''));
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
});
