/*
 * DREDGE — Biển Mù: kiểm ánh sáng, sương, trời, hậu kỳ màu (luồng W2 "môi trường").
 *
 * Chạy:  node test/dredge-env.js            (BASELINE=1 chỉ chụp ảnh + đo hiệu năng, bỏ các khẳng định màu)
 * Ảnh ra %TEMP%/dredge-env/: Greater Marrow lúc 0,3 / 0,5 / 0,75 / 0,9 và một khung ở mỗi vùng khác.
 * Màu mong đợi là số chép tay từ gradient gốc (Game.unity: TimeController, FogController, FogPropertyModifier)
 * — cố ý không đọc từ data/env.js để bắt lỗi nội suy/xuất dữ liệu.
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

async function main() {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], foreign = [];
  // 404 của tệp luồng khác chưa có trên đĩa (đang làm song song) chỉ ghi chú; tệp của luồng môi trường thiếu là lỗi thật
  const MINE = /\/games\/dredge\/(data\/env\.js|art\/env\/|js\/sky\.js|js\/world\.js|art\/world\/)/;
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

  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.3');
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
