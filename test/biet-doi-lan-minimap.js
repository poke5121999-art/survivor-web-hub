/*
 * BIỆT ĐỘI LẶN — bộ kiểm minimap kiểu REPO (js/minimap.js).
 *
 * Chạy:  node test/biet-doi-lan-minimap.js
 * Ảnh ra %TEMP%/bdl-minimap-shots (đổi bằng SHOTS=...). PC 1280x720 (map 0 và 3) và cảm ứng 844x390 (hasTouch, isMobile).
 * BASE=https://.../ kiểm bản trên mạng.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-minimap-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

const info = page => page.evaluate(() => BDL_DEBUG.info());
const mm = page => page.evaluate(() => BDL_DEBUG.minimap.info());
const overlaps = (a, b) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0.5 && oy > 0.5;
};

// Hộp của các khối HUD đang hiện (chạy trong trang): thanh O₂/thể lực, chỉ tiêu, tầng, tay cầm, kỹ năng, drone, tạm dừng, túi cá.
// Lấy theo id cụ thể: #hud, #marks phủ kín màn hình và #hud-tl... là khung chứa nên không đưa vào.
const HUD_IDS = ['hud-tl', 'o2bar', 'stam', 'quota', 'floor', 'press', 'hand', 'skill', 'hud-drone', 'btn-pause', 'ship-bag', 'toast', 'area'];
function RECTS(ids) {
  return ids.map(id => {
    const e = document.getElementById(id), r = e && e.getBoundingClientRect();
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return null;
    return { id, x: r.x, y: r.y, w: r.width, h: r.height };
  }).filter(Boolean);
}
const TOUCHBTN = ['tb-fire', 'tb-boost', 'tb-knife', 'tb-grab', 'tb-swap', 'tb-skill', 'tb-drone', 'tb-switch', 'tb-qte', 'tb-dash', 'btn-pause', 'ship-btn-e', 'ship-btn-jump'];

async function enterDive(page, base, map) {
  await page.goto(base + '/games/biet-doi-lan/index.html?map=' + map);
  const ok = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.minimap, null, { timeout: 120000 }).then(() => true, () => false);
  if (ok) await sleep(2000);
  return ok;
}

// chỗ nước thoáng quanh độ cao y
const openAt = (page, y) => page.evaluate(y => {
  const W = HX.game.world;
  for (let x = 0; x < 55; x += 1) for (const sx of [-x, x]) {
    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++) for (let dy = -2; dy <= 2 && ok; dy++) if (!W.open(sx + dx, y + dy, 0.8)) ok = false;
    if (ok) return { x: sx, y };
  }
  return null;
}, y);

async function pcRun(browser, base, map) {
  const W = 1280, H = 720, tag = 'PC ' + W + 'x' + H + ' map ' + map;
  console.log('— ' + tag);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const ok = await enterDive(page, base, map);
  check(tag + ': vào pha dive, có BDL_DEBUG.minimap', ok);
  if (!ok) { await page.close(); return; }
  const a = await mm(page);
  const vis = await page.evaluate(() => { const e = document.getElementById('minimap'), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; });
  check(tag + ': minimap hiện, vuông, rộng hơn 100 px', vis && a.rect.width > 100 && Math.abs(a.rect.width - a.rect.height) < 1, JSON.stringify(a.rect));
  check(tag + ': nằm trong phần tư trái-trên màn hình', a.rect.x >= 0 && a.rect.y >= 0 && a.rect.x + a.rect.width <= W / 2 && a.rect.y + a.rect.height <= H / 2, JSON.stringify(a.rect));
  const others = await page.evaluate(RECTS, HUD_IDS), r0 = { x: a.rect.x, y: a.rect.y, w: a.rect.width, h: a.rect.height };
  const bad = others.filter(o => overlaps(o, r0)).map(o => o.id);
  check(tag + ': không chồng lên phần tử HUD nào', bad.length === 0 && others.length >= 4, bad.join(',') || 'xét ' + others.map(o => o.id).join(','));
  check(tag + ': đã lộ ô quanh Dave (0 < seen < 20% tổng ô)', a.seen > 0 && a.seen < a.cells * 0.2, a.seen + '/' + a.cells);
  check(tag + ': chấm Dave nằm trong khung', a.daveDot.x > 0 && a.daveDot.x < a.rect.width && a.daveDot.y > 0 && a.daveDot.y < a.rect.height, JSON.stringify(a.daveDot));
  const info0 = await info(page);
  await page.screenshot({ path: path.join(SHOTS, 'pc-map' + map + '-0-surface.png') });

  // xuống hai tầng
  const fl = info0.floors, y2 = fl[Math.min(2, fl.length - 1)].y0 - 6;
  const spot = await openAt(page, y2);
  check(tag + ': tìm được chỗ nước thoáng ở tầng 3', !!spot, spot ? spot.x + ',' + spot.y.toFixed(1) : '');
  if (spot) {
    await page.evaluate(s => { if (BDL_DEBUG.foes && BDL_DEBUG.foes.clearAll) BDL_DEBUG.foes.clearAll(); BDL_DEBUG.teleport(s.x, s.y); }, spot);
    await sleep(900);
    const b = await mm(page), inf = await info(page);
    check(tag + ': Dave ở tầng 3', inf.floor === 2, 'tầng ' + (inf.floor + 1));
    check(tag + ': ô đã thấy tăng sau khi xuống', b.seen > a.seen + 50, a.seen + ' → ' + b.seen);
    check(tag + ': chấm Dave dời xuống trong khung', b.daveDot.y > a.daveDot.y + 10, a.daveDot.y.toFixed(1) + ' → ' + b.daveDot.y.toFixed(1));
    await page.screenshot({ path: path.join(SHOTS, 'pc-map' + map + '-1-floor3.png') });
    // đồ cổ sâu nhất: đứng sát để nó lộ rồi chụp
    const got = await page.evaluate(() => { const l = HX.game.loot.slice().sort((p, q) => p.pos.y - q.pos.y)[0]; return l ? { x: l.pos.x, y: l.pos.y } : null; });
    if (got) { await page.evaluate(g => BDL_DEBUG.teleport(g.x, g.y + 2), got); await sleep(700); await page.screenshot({ path: path.join(SHOTS, 'pc-map' + map + '-2-loot.png') }); }
  }
  // luật mờ của REPO: camera bám Dave nên Dave không tự đi dưới góc được; ép worldToScreen trả toạ độ ở góc rồi trả lại
  await page.evaluate(() => { const g = HX.game.gfx; window.__w2s = g.worldToScreen; g.worldToScreen = function () { return { x: 100, y: 100 }; }; });
  await sleep(800);
  const fadedA = (await mm(page)).alpha;
  await page.evaluate(() => { HX.game.gfx.worldToScreen = window.__w2s; });
  await sleep(800);
  const idleA = (await mm(page)).alpha;
  check(tag + ': mờ 0,16 khi Dave dưới góc, 0,60 khi rảnh', Math.abs(fadedA - 0.16) < 0.03 && Math.abs(idleA - 0.6) < 0.03, fadedA + ' / ' + idleA);

  const ge = await page.evaluate(() => HX.game.errors.slice());
  check(tag + ': G.errors rỗng', ge.length === 0, ge.slice(0, 3).join(' | '));
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

async function touchRun(browser, base) {
  const W = 844, H = 390, tag = 'Cảm ứng ' + W + 'x' + H;
  console.log('— ' + tag);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = watch(page);
  const ok = await enterDive(page, base, 3);
  check(tag + ': vào pha dive', ok);
  if (!ok) { await ctx.close(); return; }
  const a = await mm(page), r0 = { x: a.rect.x, y: a.rect.y, w: a.rect.width, h: a.rect.height };
  check(tag + ': minimap hiện, nằm trong nửa trái và nửa trên màn hình', a.rect.width > 80 && a.rect.x + a.rect.width <= W / 2 && a.rect.y + a.rect.height <= H / 2 + 40, JSON.stringify(a.rect));
  const btns = await page.evaluate(RECTS, TOUCHBTN);
  const hit = btns.filter(b => overlaps(b, r0)).map(b => b.id);
  check(tag + ': không đè nút cảm ứng nào', hit.length === 0 && btns.length >= 5, hit.join(',') || 'xét ' + btns.length + ' nút');
  const others = await page.evaluate(RECTS, HUD_IDS), bad = others.filter(o => overlaps(o, r0)).map(o => o.id);
  check(tag + ': không chồng phần tử HUD nào', bad.length === 0 && others.length >= 4, bad.join(',') || 'xét ' + others.map(o => o.id).join(','));
  const stick = await page.evaluate(() => { const m = HX_MOBILE_UI.layouts.dive.stick, u = innerWidth / HX_MOBILE_UI.ref[0]; return { x: (m.dx - m.w / 2) * u, y: innerHeight - (m.dy + m.h / 2) * u, w: m.w * u, h: m.h * u }; });
  check(tag + ': không đè chỗ cần di chuyển cố định', !overlaps(stick, r0));
  check(tag + ': đã lộ ô quanh Dave', a.seen > 0, a.seen + '/' + a.cells);
  await page.screenshot({ path: path.join(SHOTS, 'touch-map3.png') });
  const ge = await page.evaluate(() => HX.game.errors.slice());
  check(tag + ': G.errors rỗng', ge.length === 0, ge.slice(0, 3).join(' | '));
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await pcRun(browser, base, 0);
    await pcRun(browser, base, 3);
    await touchRun(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
