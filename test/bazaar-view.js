/*
 * Chợ Phiên (games/bazaar) — kiểm trang xem trận trên trình duyệt thật (Playwright).
 *
 * Chạy:  node test/bazaar-view.js
 *        BZ_URL=https://poke5121999-art.github.io/survivor-web-hub node test/bazaar-view.js   (chạy trên Pages)
 * Không có BZ_URL thì tự dựng máy chủ tĩnh ở gốc repo (cổng ngẫu nhiên) và tắt khi xong.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/bazaar-view): giữa trận, tooltip, kết quả, điện thoại 844×390 — mở ra xem bằng mắt
 * cạnh D:\bazaar-ref\shots\wiki\dooley-friends-1.jpg.
 *
 * Điều kiểm (kỳ vọng ghi thẳng bằng số/chuỗi):
 *  1. Trang nạp: 0 pageerror, 0 console error, 0 phản hồi HTTP ≥ 400.
 *  2. Trận cố định Flame Juggler (bàn dưới) đấu Gorgon Noble (bàn trên), seed 7: người thắng + endMs trên trang = BZSim.run trong Node.
 *  3. Phát lại ở 3×: số "số bay" chính = số sự kiện damage/heal/shield có amt > 0; số đạn = số sự kiện đó có thẻ nguồn
 *     (damage kind Damage, heal không phải Regen, shield).
 *  4. Rê chuột lên thẻ: tooltip hiện, có số đã giải, không còn "{ability".
 *  5. Thời gian xử lý mỗi khung ở 1280×720 trung bình < 16 ms (in ra cả khoảng cách giữa hai khung).
 *  6. Sau cú nhấp đầu (mở khoá âm thanh) có tiếng phát ra, không tệp tiếng nào thiếu.
 * Chromium chạy có GPU (cờ ANGLE d3d11); BZ_SOFT=1 để chạy dựng hình phần mềm (khung chậm hơn nhiều, chỉ số xử lý JS không đổi).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bazaar-view');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.skel': 'application/octet-stream', '.atlas': 'text/plain' };
// data/frames.js do luồng khác sinh: chưa có trên đĩa thì 404 của nó không tính là lỗi (trang tự dùng khung CSS).
const OPTIONAL = fs.existsSync(path.join(ROOT, 'games/bazaar/data/frames.js')) ? [] : ['/games/bazaar/data/frames.js'];
const optional = url => OPTIONAL.some(f => url.split('?')[0].endsWith(f));

// ---------- Node: chạy cùng trận để so ----------
globalThis.window = globalThis;
['cards', 'monsters', 'mode'].forEach(f => require(path.join(ROOT, 'games/bazaar/data', f + '.js')));
const BZ = require(path.join(ROOT, 'games/bazaar/js/sim/index.js'));
const MA = globalThis.BZ_MONSTERS.find(m => m.InternalName === 'Flame Juggler');
const MB = globalThis.BZ_MONSTERS.find(m => m.InternalName === 'Gorgon Noble');
const SEED = 7;
const NODE = BZ.run({ boards: [BZ.boardFromMonster(MA, 'a'), BZ.boardFromMonster(MB, 'b')], seed: SEED, sandstorm: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
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
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location() || {}).url || '';
    if (optional(url)) return;
    errors.push('console: ' + m.text());
  });
  page.on('response', r => { if (r.status() >= 400 && !optional(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
async function ready(page) {
  await page.waitForFunction(() => window.BZ_READY === true && window.BZ_DEBUG && window.BZ_DEBUG.state(), null, { timeout: 60000 });
}

async function desktop(browser, base) {
  out.push('\n[1280x720]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  const url = base + '/games/bazaar/index.html?a=' + MA.Id.slice(0, 8) + '&b=' + MB.Id.slice(0, 8) + '&seed=' + SEED + '&speed=1';
  await page.goto(url, { waitUntil: 'load' });
  await ready(page);
  await sleep(600);
  const st0 = await page.evaluate(() => window.BZ_DEBUG.state());
  check('trận trên trang cùng người thắng với Node (' + NODE.winner + ')', st0.winner === NODE.winner, 'trang ' + st0.winner);
  check('trận trên trang cùng endMs với Node (' + NODE.endMs + ')', st0.endMs === NODE.endMs, 'trang ' + st0.endMs);
  check('khung 2D data/frames.js đã nạp', st0.frames === true || OPTIONAL.length > 0, 'frames=' + st0.frames);

  // tooltip: rê chuột thật lên thẻ đầu tiên của bàn dưới
  const uid = await page.evaluate(() => window.BZ_DEBUG.cardUids().find(u => /^a-/.test(u)));
  const box = await page.locator('.bz-card[data-uid="' + uid + '"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height * 0.35, { steps: 4 });
  await sleep(350);
  const tip = await page.evaluate(() => { const t = document.querySelector('.bz-tip'); return t ? { show: t.classList.contains('show'), text: t.innerText } : null; });
  check('tooltip hiện khi rê chuột lên thẻ', !!tip && tip.show, tip ? tip.text.slice(0, 80).replace(/\n/g, ' | ') : 'không có .bz-tip');
  check('tooltip có số đã giải và không còn "{ability"', !!tip && /\d/.test(tip.text) && !/\{ability|\{aura/.test(tip.text), tip ? tip.text.replace(/\n/g, ' | ').slice(0, 160) : '');
  await page.screenshot({ path: path.join(SHOTS, 'tooltip-1280.png') });
  await page.mouse.move(5, 5);

  // cú nhấp đầu: mở khoá AudioContext (chính sách autoplay), rồi phát lại 3× từ đầu, đo hiệu năng, chụp giữa trận
  await page.mouse.click(640, 700);
  await page.evaluate(seed => { window.BZ_DEBUG.fight(window.BZ_DEBUG.state().a, window.BZ_DEBUG.state().b, seed); window.BZ_DEBUG.speed(3); window.BZ_DEBUG.resetPerf(); }, SEED);
  const end = NODE.endMs;
  let shotMid = false, t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = await page.evaluate(() => window.BZ_DEBUG.state());
    if (!shotMid && s.t >= end * 0.45) {
      shotMid = true;
      await page.screenshot({ path: path.join(SHOTS, 'mid-1280.png') });
    }
    if (s.done) break;
    await sleep(120);
  }
  const st = await page.evaluate(() => window.BZ_DEBUG.state());
  const perf = await page.evaluate(() => window.BZ_DEBUG.perf());
  const evs = await page.evaluate(() => window.BZ_DEBUG.events());
  const main = evs.filter(e => (e.type === 'damage' || e.type === 'heal' || e.type === 'shield') && e.amt > 0);
  const withSrc = evs.filter(e => e.src != null && ((e.type === 'damage' && e.kind === 'Damage') || (e.type === 'heal' && e.kind !== 'Regen') || e.type === 'shield'));
  check('phát lại 3× chạy tới hết', st.done === true, 't=' + Math.round(st.t) + '/' + st.duration);
  check('số bay chính = ' + main.length + ' sự kiện damage/heal/shield (amt > 0)', st.fx.numbers === main.length, 'đã bay ' + st.fx.numbers + ', phụ ' + st.fx.numbersAux);
  check('số đạn = ' + withSrc.length + ' sự kiện damage/heal/shield có thẻ nguồn', st.fx.projectiles === withSrc.length, 'đã bắn ' + st.fx.projectiles);
  check('mọi sự kiện đã được phát (' + evs.length + ')', st.dispatched === evs.length, 'đã phát ' + st.dispatched);
  check('có tiếng phát ra sau cú nhấp, 0 tệp tiếng thiếu', st.audio && st.audio.played > 0 && st.audio.missing === 0, JSON.stringify(st.audio));
  check('thời gian xử lý khung trung bình < 16 ms ở 1280×720', perf.avgWorkMs < 16,
    'xử lý TB ' + perf.avgWorkMs.toFixed(2) + ' ms, max ' + perf.maxWorkMs.toFixed(1) + ' ms, khung TB ' + perf.avgFrameMs.toFixed(2) + ' ms, ' + perf.frames + ' khung');
  await sleep(500);
  const bannerOf = () => page.evaluate(() => { const b = document.querySelector('.bz-banner'); return { cls: b.className, h: b.querySelector('h2').textContent, op: getComputedStyle(b).opacity }; });
  const want = NODE.winner === 'draw' ? 'HOÀ' : NODE.winner === 0 ? 'CHIẾN THẮNG' : 'THẤT BẠI'; // bàn 0 = phe ta (dưới)
  // băng-rôn giữ ~1,5 s (clip heZSYG0dD_c ?t=1828) rồi mờ đi: cuối trận (3,2 s sau) đã không còn hiện
  const bEnd = await bannerOf();
  check('băng-rôn kết quả đã mờ sau thời gian giữ (~1,5 s), không treo tới hết trận', !/show/.test(bEnd.cls), bEnd.cls + ' op=' + bEnd.op);
  await page.evaluate(ms => window.BZ_DEBUG.seek(ms), end + 350 + 750 + 100); // phát 3×: 150 ms thật = 450 ms trận
  await sleep(150);
  const banner = await bannerOf();
  check('băng-rôn kết quả "' + want + '" đang hiện giữa thời gian giữ', banner.h === want && /show/.test(banner.cls), banner.h + ' ' + banner.cls + ' op=' + banner.op);
  await page.screenshot({ path: path.join(SHOTS, 'victory-1280.png') });

  // tua: lùi về giữa trận rồi tới cuối bằng nút
  await page.evaluate(ms => window.BZ_DEBUG.seek(ms), Math.round(end * 0.3));
  const s2 = await page.evaluate(() => window.BZ_DEBUG.state());
  check('tua về 30 % trận', Math.abs(s2.t - Math.round(end * 0.3)) < 200 && !s2.done, 't=' + Math.round(s2.t));
  await page.click('.bz-dock button[title^="Tới kết quả"]');
  await sleep(200);
  const s3 = await page.evaluate(() => window.BZ_DEBUG.state());
  check('nút "Tới kết quả" nhảy tới cuối', s3.done === true, 't=' + Math.round(s3.t));
  check('1280×720 không lỗi', errors.length === 0, errors.slice(0, 5).join(' || '));
  await page.close();
}

async function phone(browser, base) {
  out.push('\n[844x390 điện thoại ngang]');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?a=' + MA.Id.slice(0, 8) + '&b=' + MB.Id.slice(0, 8) + '&seed=' + SEED, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(ms => { window.BZ_DEBUG.seek(ms); window.BZ_DEBUG.speed(1); }, Math.round(NODE.endMs * 0.55));
  await sleep(900);
  const uid = await page.evaluate(() => window.BZ_DEBUG.cardUids().find(u => /^b-/.test(u)));
  const box = await page.locator('.bz-card[data-uid="' + uid + '"]').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(350);
  const tip = await page.evaluate(() => { const t = document.querySelector('.bz-tip'); return t && t.classList.contains('show'); });
  check('chạm thẻ trên điện thoại mở tooltip', tip === true);
  await page.screenshot({ path: path.join(SHOTS, 'phone-844x390.png') });
  const fit = await page.evaluate(() => { const r = document.getElementById('bz-stage').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top }; });
  check('sân khấu vừa khít màn 844×390 (letterbox)', fit.w <= 845 && fit.h <= 391 && fit.x >= -1 && fit.y >= -1, JSON.stringify(fit));
  check('844×390 không lỗi', errors.length === 0, errors.slice(0, 5).join(' || '));
  await ctx.close();
}

(async () => {
  let srv = null, base = process.env.BZ_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  out.push('Chợ Phiên — xem trận @ ' + base + '  (Node: ' + MA.InternalName + ' vs ' + MB.InternalName + ', seed ' + SEED + ' → winner ' + NODE.winner + ', endMs ' + NODE.endMs + ')');
  const args = process.env.BZ_SOFT ? [] : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'];
  const browser = await chromium.launch({ args });
  try {
    await desktop(browser, base);
    await phone(browser, base);
  } catch (e) {
    check('chạy hết bộ kiểm', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
  out.push('\nẢnh chụp: ' + SHOTS);
  out.push(pass + ' đạt, ' + fail + ' trượt');
  console.log(out.join('\n'));
  process.exit(fail ? 1 : 0);
})();
