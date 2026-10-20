/*
 * Chợ Phiên (games/bazaar) — kiểm hero Spine động ở sảnh (W-30), Playwright.
 *
 * Chạy:  node test/bazaar-spine.js        (cần mạng: runtime Spine tải từ jsDelivr, đúng như trên Pages)
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/bazaar-spine): <hero>-a.png, <hero>-b.png ở 1280x720.
 * Điều kiểm:
 *  1. 7 hero chơi được: bấm lục giác → canvas.bz-spine vào .big, BZSpine.currentHero = hero, ảnh chụp .big đổi giữa hai thời điểm
 *     (idle chạy thật), ảnh tĩnh nền đã tắt (sp-on).
 *  2. 0 pageerror, 0 console error, 0 HTTP ≥ 400 cả lượt.
 *  3. The Dragons (khoá, không có Spine): không có canvas, ảnh tĩnh quay lại.
 *  4. Chặn jsDelivr: sảnh vẫn chạy bằng ảnh tĩnh, không pageerror, không canvas.
 *  5. Đo: tải runtime, tải xương + khung hình đầu từng hero, chi phí mỗi khung (CPU, ms).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bazaar-spine');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const HEROES = ['Vanessa', 'Pygmalien', 'Dooley', 'Mak', 'Stelle', 'Jules', 'Karnok'];
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
async function ready(page) { await page.waitForFunction(() => window.BZ_READY === true && window.BZ_DEBUG && window.BZ_DEBUG.screen, null, { timeout: 60000 }); }

async function main() {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], timeout: 60000 });
  const timer = setTimeout(() => { console.log('QUÁ HẠN 240 s'); process.exit(2); }, 240000);
  try {
    // ---- 1-3, 5: đủ 7 hero ----
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(base + '/games/bazaar/index.html?seed=7&new=1', { waitUntil: 'load' });
    await ready(page); await sleep(600);
    for (const h of HEROES) {
      await page.click('.lobby .hex[data-hero="' + h + '"]');
      let ok = true;
      try { await page.waitForFunction(x => window.BZSpine && window.BZSpine.currentHero() === x && window.BZSpine.stats.firstFrameMs[x] !== undefined && document.querySelector('.lobby .big.sp-on canvas.bz-spine'), h, { timeout: 20000 }); }
      catch (e) { ok = false; }
      if (!ok) { check('Spine ' + h + ': canvas chạy', false, JSON.stringify(await page.evaluate(() => window.BZSpine && window.BZSpine.stats))); continue; }
      await sleep(300); // qua hoạt ảnh vào của .big
      const big = await page.$('.lobby .big');
      const a = await big.screenshot(); await sleep(450); const b = await big.screenshot(); await sleep(550); const c = await big.screenshot();
      fs.writeFileSync(path.join(SHOTS, h + '-a.png'), a); fs.writeFileSync(path.join(SHOTS, h + '-b.png'), c);
      const moved = !a.equals(b) || !b.equals(c);
      const st = await page.evaluate(x => ({ ff: window.BZSpine.stats.firstFrameMs[x], load: window.BZSpine.stats.loadMs[x], idle: window.BZSpine.stats.anim[x].idle, bg: document.querySelector('.lobby .big').style.backgroundImage }), h);
      check('Spine ' + h + ': canvas đổi giữa các khung, nền tĩnh tắt', moved && st.bg === 'none', 'idle=' + st.idle + ' tải xương ' + st.load + ' ms, khung đầu ' + st.ff + ' ms');
    }
    const s = await page.evaluate(() => window.BZSpine.stats);
    console.log('  số đo: runtime ' + s.runtimeMs + ' ms; CPU/khung ' + s.frameMs.toFixed(2) + ' ms (EMA, ' + s.frames + ' khung, SwiftShader phần mềm)');
    check('mỗi khung vẽ dưới 12 ms CPU (kể cả GL phần mềm)', s.frameMs < 12, s.frameMs.toFixed(2) + ' ms');
    // The Dragons: khoá, ảnh tĩnh
    await page.click('.lobby .hex[data-hero="TheDragons"]'); await sleep(500);
    const dr = await page.evaluate(() => ({ cv: !!document.querySelector('.lobby canvas.bz-spine'), bg: document.querySelector('.lobby .big').style.backgroundImage, on: document.querySelector('.lobby .big').classList.contains('sp-on') }));
    check('The Dragons (khoá): không canvas, ảnh tĩnh quay lại', !dr.cv && !dr.on && dr.bg.includes('url('), JSON.stringify(dr));
    // rời sảnh: canvas được gỡ
    await page.click('.lobby .hex[data-hero="Vanessa"]'); await sleep(1500);
    await page.click('.lobby .lb-ready'); await sleep(2500);
    const left = await page.evaluate(() => ({ scr: window.BZ_DEBUG.screen(), cv: !!document.querySelector('canvas.bz-spine'), lobby: !!document.querySelector('.lobby') }));
    check('rời sảnh (vào run): canvas Spine được gỡ', !left.lobby && !left.cv, JSON.stringify(left));
    check('0 pageerror / console error / HTTP ≥ 400', errors.length === 0, errors.slice(0, 4).join(' | '));
    await ctx.close();

    // ---- 4: chặn jsDelivr → lùi về ảnh tĩnh ----
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p2 = await ctx2.newPage();
    const errs2 = [];
    p2.on('pageerror', e => errs2.push(e.message));
    await p2.route(/jsdelivr\.net/, r => r.abort());
    await p2.goto(base + '/games/bazaar/index.html?seed=7&new=1', { waitUntil: 'load' });
    await ready(p2); await sleep(1500);
    await p2.click('.lobby .hex[data-hero="Dooley"]'); await sleep(1500);
    const fb = await p2.evaluate(() => ({ cv: !!document.querySelector('canvas.bz-spine'), bg: document.querySelector('.lobby .big').style.backgroundImage, err: window.BZSpine.stats.error }));
    check('chặn CDN: ảnh tĩnh ở lại, không canvas, không pageerror', !fb.cv && fb.bg.includes('url(') && errs2.length === 0 && !!fb.err, JSON.stringify(fb) + ' ' + errs2.join('|'));
    await ctx2.close();
  } finally { clearTimeout(timer); await browser.close(); srv.close(); }
  console.log('\nbazaar-spine: ' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
