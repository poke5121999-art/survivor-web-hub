/*
 * Màn hình tựa của Hiệp Sĩ Linh Hồn (games/soulknight/js/title.js): mở game → hiện màn tựa 8.6 (Spine nền + hiệp sĩ + logo),
 * Spine chuyển động, chạm / Enter → sảnh. Kiểm thêm: ?quick=1 và ?notitle=1 bỏ qua màn tựa.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-title.js   (SK_URL để chạy trên Pages)
 * Trình duyệt tự động bị title.js bỏ qua theo mặc định (navigator.webdriver) nên bài này mở với ?title=1.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-title');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}
// Hai ảnh chụp vùng hiệp sĩ (giữa màn): số điểm ảnh khác nhau đáng kể thì Spine đang chuyển động.
async function grab(p) {
  return p.evaluate(() => {
    const c = document.getElementById('sk-title'), x = c.getContext('2d');
    const w = Math.round(c.width * 0.3), h = Math.round(c.height * 0.5);
    return Array.from(x.getImageData(Math.round(c.width * 0.35), Math.round(c.height * 0.25), w, h).data);
  });
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  try {
    await p.goto(BASE + '?title=1');
    const ready = await until(p, () => window.SK && SK.title && SK.title.ready && SK.title.on, null, 20000);
    check('mở game → màn tựa hiện, Spine nạp xong', ready, JSON.stringify(await p.evaluate(() => SK.title.state())));
    check('trạng thái game là title (chưa vào sảnh)', await p.evaluate(() => SK_GAME.state === 'title'));
    const an = await p.evaluate(() => SK.title.state().anims);
    check('hai rig có animation movement_ide', an && an.bg.indexOf('movement_ide') >= 0 && an.kn.indexOf('movement_ide') >= 0, JSON.stringify(an));
    await sleep(600);
    const lit = await p.evaluate(() => { const c = document.getElementById('sk-title'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n / (d.length / 400); });
    check('ảnh nền + logo vẽ ra (không phải màn đen)', lit > 0.05, (lit * 100).toFixed(0) + '% điểm sáng');
    await p.screenshot({ path: path.join(SHOTS, 'title-1.png') });
    const a = await grab(p);
    await sleep(900);
    const bimg = await grab(p);
    let diff = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - bimg[i]) + Math.abs(a[i + 1] - bimg[i + 1]) + Math.abs(a[i + 2] - bimg[i + 2]) > 24) diff++;
    check('Spine chuyển động (hai ảnh vùng hiệp sĩ khác nhau)', diff > 200, diff + ' điểm ảnh khác');
    await p.screenshot({ path: path.join(SHOTS, 'title-2.png') });

    await p.keyboard.press('Enter');
    const inHall = await until(p, () => SK_GAME.state === 'hall', null, 4000);
    check('Enter → vào sảnh (SK_GAME.state === hall)', inHall);
    check('màn tựa đã ẩn', await p.evaluate(() => getComputedStyle(document.getElementById('sk-title')).display === 'none'));
    await sleep(500);
    check('sảnh ở chế độ chọn nhân vật', (await p.evaluate(() => SK.hall.state.mode)) === 'select');
    await p.screenshot({ path: path.join(SHOTS, 'hall-after.png') });

    // Chạm cũng vào sảnh
    await p.goto(BASE + '?title=1');
    await until(p, () => window.SK && SK.title && SK.title.ready && SK.title.on, null, 20000);
    await p.mouse.click(640, 360);
    check('chạm màn → vào sảnh', await until(p, () => SK_GAME.state === 'hall', null, 4000));

    // Cờ bỏ qua
    for (const q of ['?notitle=1', '?quick=1', '']) {
      await p.goto(BASE + q);
      const st = await until(p, () => window.SK_GAME && (SK_GAME.state === 'hall' || SK_GAME.state === 'lobby'), null, 15000);
      const t = await p.evaluate(() => ({ s: SK_GAME.state, on: SK.title.on }));
      check('bỏ qua màn tựa với "' + q + '"', st && !t.on && t.s !== 'title', JSON.stringify(t));
    }
    check('không lỗi trang / tải thiếu', errs.length === 0, errs.slice(0, 4).join(' | '));
  } catch (e) {
    check('chạy không ngoại lệ', false, e.stack || e.message);
  }
  await b.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng  (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})();
