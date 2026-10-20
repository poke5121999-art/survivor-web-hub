/*
 * Chợ Phiên — kiểm bản art độ phân giải gốc (games/bazaar/js/view/hires.js) trên trình duyệt thật.
 * Chạy:  node test/bazaar-hires.js     (BZ_URL=... để chạy trên Pages; không có thì tự dựng máy chủ tĩnh)
 * Máy chủ kho ảnh được giả LOCAL: page.route chuyển https://poke5121999-art.github.io/cho-phien-assets/** về tệp ở D:\cho-phien-assets
 * (BZ_HIRES_DIR đổi thư mục), nên test không phụ thuộc việc đã push.
 *  (a) deviceScaleFactor 1, 1280x720: art thẻ trên bàn giữ bản cục bộ, 0 yêu cầu tới kho.
 *  (a2) dsf 2, 1920x1080: hộp art 193 px CSS x 2 = 386 <= 512 nên vẫn cục bộ (đo thật, khác giả định ban đầu của brief).
 *  (b) dsf 3, 1920x1080 (193 x 3 = 579 > 512): art thẻ (và lớp veil) chuyển sang URL dưới cho-phien-assets/art/cards/, có yêu cầu tới kho.
 *  (c) kho bị chặn (abort): art giữ bản cục bộ, 0 pageerror, 0 console error (trừ dòng "Failed to load resource" của chính kho: trình duyệt tự ghi).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const HIRES_DIR = process.env.BZ_HIRES_DIR || 'D:/cho-phien-assets';
const HOST = 'https://poke5121999-art.github.io/cho-phien-assets/';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.skel': 'application/octet-stream', '.atlas': 'text/plain' };
const OPTIONAL = fs.existsSync(path.join(ROOT, 'games/bazaar/data/frames.js')) ? [] : ['/games/bazaar/data/frames.js'];
const optional = url => OPTIONAL.some(f => url.split('?')[0].endsWith(f));
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
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function scenario(browser, base, o) {
  const ctx = await browser.newContext({ viewport: o.vp, deviceScaleFactor: o.dsf });
  const page = await ctx.newPage();
  const errors = [], hostReq = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location() || {}).url || '';
    if (optional(url)) return;
    if (o.hostDown && url.indexOf(HOST) === 0) return; // dòng "Failed to load resource" do trình duyệt tự ghi cho yêu cầu bị chặn
    errors.push('console: ' + m.text());
  });
  page.on('request', r => { if (r.url().indexOf(HOST) === 0) hostReq.push(r.url()); });
  await page.route(HOST + '**', route => {
    if (o.hostDown) return route.abort('failed');
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace('/cho-phien-assets/', ''));
    fs.readFile(path.join(HIRES_DIR, rel), (e, b) => e ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ status: 200, contentType: 'image/webp', body: b }));
  });
  await page.goto(base + '/games/bazaar/index.html?view=1&a=3f3d11c5&b=1d95020b&seed=5&speed=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.BZ_READY === true && window.BZ_DEBUG && window.BZ_DEBUG.state(), null, { timeout: 60000 });
  await sleep(1500);
  const arts = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.bz-card .art, .bz-card .veil'), e => ({
    cls: e.className, bg: e.style.backgroundImage, h: Math.round(e.getBoundingClientRect().height) })));
  await ctx.close();
  return { arts, hostReq, errors };
}

(async () => {
  let srv = null, base = process.env.BZ_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  try {
    const arts = r => r.arts.filter(x => x.cls === 'art');
    const hi = x => x.bg.indexOf('cho-phien-assets/art/cards/') >= 0;
    out.push('\n[a] dsf 1, 1280x720');
    const A = await scenario(browser, base, { vp: { width: 1280, height: 720 }, dsf: 1 });
    check('(a) có art thẻ trên bàn (' + arts(A).length + ')', arts(A).length > 0, 'cao tối đa ' + Math.max(...arts(A).map(x => x.h)) + ' px');
    check('(a) 0 art thẻ dùng bản gốc, tất cả là art/cards/*.webp cục bộ', arts(A).every(x => !hi(x) && /art\/cards\/[^"]+\.webp/.test(x.bg)), arts(A).filter(hi).length + ' bản gốc');
    check('(a) 0 yêu cầu tới kho ảnh', A.hostReq.length === 0, A.hostReq.length + ' yêu cầu');
    check('(a) 0 lỗi', A.errors.length === 0, A.errors.slice(0, 3).join(' || '));

    // Đo thật: ở 1920x1080 hộp art thẻ cao 193 px CSS; dsf 2 = 386 px thiết bị <= 512 nên bản cục bộ đã đủ nét (luật đúng là giữ local).
    out.push('\n[a2] dsf 2, 1920x1080');
    const A2 = await scenario(browser, base, { vp: { width: 1920, height: 1080 }, dsf: 2 });
    check('(a2) art thẻ cao 192-193 px x 2 = 386 <= 512: giữ bản cục bộ, 0 yêu cầu tới kho', arts(A2).length === 10 && arts(A2).every(x => x.h >= 192 && x.h <= 193 && !hi(x)) && A2.hostReq.length === 0, 'cao ' + arts(A2).map(x => x.h).join(',') + ', ' + A2.hostReq.length + ' yêu cầu');
    out.push('\n[b] dsf 3, 1920x1080 (193 x 3 = 579 > 512)');
    const B = await scenario(browser, base, { vp: { width: 1920, height: 1080 }, dsf: 3 });
    const bh = arts(B).filter(hi), bv = B.arts.filter(x => x.cls === 'veil' && hi(x));
    check('(b) mọi art thẻ trên bàn chuyển sang cho-phien-assets/art/cards/ (' + arts(B).length + ')', arts(B).length > 0 && bh.length === arts(B).length, bh.length + '/' + arts(B).length + ', cao ' + Math.max(...arts(B).map(x => x.h)) + ' px');
    check('(b) veil dùng cùng URL gốc với art', bv.length === bh.length, bv.length + ' veil');
    check('(b) có yêu cầu tới kho ảnh, đều dưới ' + HOST + 'art/cards/', B.hostReq.length > 0 && B.hostReq.every(u => u.indexOf(HOST + 'art/cards/') === 0 && /\?v=\d+[a-z]?$/.test(u)), B.hostReq.length + ' yêu cầu, vd ' + B.hostReq[0]);
    check('(b) 0 lỗi', B.errors.length === 0, B.errors.slice(0, 3).join(' || '));

    out.push('\n[c] dsf 3, 1920x1080, kho bị chặn');
    const C = await scenario(browser, base, { vp: { width: 1920, height: 1080 }, dsf: 3, hostDown: true });
    check('(c) art thẻ giữ bản cục bộ (' + arts(C).length + ')', arts(C).length > 0 && arts(C).every(x => !hi(x) && /art\/cards\/[^"]+\.webp/.test(x.bg)), arts(C).filter(hi).length + ' bản gốc');
    check('(c) không thử lại: không URL nào bị xin hai lần', new Set(C.hostReq).size === C.hostReq.length, C.hostReq.length + ' yêu cầu');
    check('(c) 0 pageerror, 0 console error', C.errors.length === 0, C.errors.slice(0, 3).join(' || '));
  } finally { await browser.close(); if (srv) srv.close(); }
  console.log(out.join('\n'));
  console.log('\nbazaar-hires: ' + pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
