/*
 * HỐ XANH — vùng + độ sâu + giờ hoạt động của cá sinh ra khớp data/fish_spawn.js.
 *
 * Chạy:  node test/ho-xanh-spawn.js
 * Không cần trình duyệt: kiểm tra chéo data/fish_spawn.js với data/assets.js trước (mọi id có mặt
 * trong assets.js). Rồi mở hai lộ trình khác nhau (một lộ trình xuống rừng tảo A06 để bắt lỗi hai
 * loài Sheepshead/Striped Catfish lẽ ra không có ở đó), dạo qua nhiều độ sâu KHÔNG khoá bộ sinh cá
 * (freeze), gom cá đã sinh ra và so với data/fish_spawn.js ngay trong trang bằng window.HX_FISH_SPAWN.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-spawn-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

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
const sleep = ms => new Promise(r => setTimeout(r, ms));

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

async function setSail(page) {
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
}

// ---------- node-only: mọi id trong fish_spawn.js phải có trong assets.js, và ngược lại ----------
function checkDataFiles() {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'games/ho-xanh/data/assets.js'), 'utf8'))(win);
  const assetsWin = win;
  new Function('window', fs.readFileSync(path.join(ROOT, 'games/ho-xanh/data/fish_spawn.js'), 'utf8'))(win);
  const spawn = win.HX_FISH_SPAWN, species = assetsWin.HX_ASSETS.fish;
  const ids = new Set(species.map(s => s.id));
  const spawnIds = Object.keys(spawn);
  const unknown = spawnIds.filter(id => !ids.has(id));
  check('mọi id trong fish_spawn.js có trong assets.js (HX_ASSETS.fish)', unknown.length === 0, unknown.join(', '));
  const missing = species.filter(s => s.rank > 0 && !spawn[s.id]).map(s => s.id);
  check('mọi loài rank>0 trong assets.js có mặt trong fish_spawn.js', missing.length === 0, missing.join(', '));
  for (const id of spawnIds) {
    const e = spawn[id];
    if (!Array.isArray(e.depth) || e.depth.length !== 2 || e.depth[0] >= e.depth[1]) { check('depth hợp lệ: ' + id, false, JSON.stringify(e.depth)); return; }
    if (['day', 'night', 'both'].indexOf(e.active) < 0) { check('active hợp lệ: ' + id, false, e.active); return; }
  }
  check('mọi entry fish_spawn.js có depth [min,max] tăng dần và active day|night|both', true);
}

// Móc thẳng Fishes.prototype.spawnAt để ghi lại đúng loài + đúng chỗ NÓ SINH RA (không phải chỗ nó
// trôi dạt tới sau khi bơi tự do một lúc — cá có thể lượn qua ranh giới hai tầng vì đó là một khối
// nước liền mạch, giống Dave cũng bơi qua được). So với HX_FISH_SPAWN ngay tại thời điểm sinh.
async function hookSpawns(page) {
  await page.evaluate(() => {
    window.__spawnLog = [];
    var orig = HX.game.fishes.spawnAt;
    HX.game.fishes.spawnAt = function (sp, x, y) {
      var st = HX.game.stack, L = st.layerAt(y), night = !!(st.theme && st.theme.night);
      var sd = window.HX_FISH_SPAWN[sp.id];
      var ok = true, reason = '';
      if (sp.zone !== L.area) { ok = false; reason = 'zone ' + sp.zone + ' != tầng ' + L.area; }
      else if (sd) {
        if (sd.excludeMaps && sd.excludeMaps.indexOf(L.id) >= 0) { ok = false; reason = 'excludeMaps chặn ở ' + L.id; }
        else if (sd.active === 'day' && night) { ok = false; reason = 'active=day nhưng đang lặn đêm'; }
        else if (sd.active === 'night' && !night) { ok = false; reason = 'active=night nhưng đang ban ngày'; }
      }
      window.__spawnLog.push({ id: sp.id, mapId: L.id, area: L.area, night: night, ok: ok, reason: reason });
      return orig.call(this, sp, x, y);
    };
  });
}

async function spawnLog(page) { return page.evaluate(() => window.__spawnLog); }

// Dạo qua vài độ sâu trong MỘT tầng (không khoá bộ sinh cá) để trải camera qua mọi chỗ có thể sinh cá.
async function sampleLayer(page, y0, y1, n, dwellMs, shotPrefix) {
  for (let i = 0; i < n; i++) {
    const y = y0 + (y1 - y0) * (n === 1 ? 0 : i / (n - 1));
    await page.evaluate(p => HX_DEBUG.teleport(p.x, p.y), { x: 0, y });
    await sleep(dwellMs);
    if (shotPrefix && i === Math.floor(n / 2)) await page.screenshot({ path: path.join(SHOTS, shotPrefix + '.png') });
    await page.evaluate(() => HX_DEBUG.clearFish()); // đỡ đầy đàn, không ảnh hưởng __spawnLog đã ghi
  }
}

async function runRoute(browser, base, route, topId, opts) {
  out.push('\n[' + route + ']');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  let acc = [];
  try {
    await page.goto(base + '/games/ho-xanh/index.html?route=' + route + '&fresh=1');
    await setSail(page);
    await hookSpawns(page);
    const layers = await page.evaluate(() => HX.game.stack.layers.map(L => ({ id: L.id, area: L.area, yTop: L.yTop, yBot: L.yBot })));
    check('lộ trình ' + route + ' ghép đủ 3 tầng', layers.length === 3, layers.map(l => l.id).join('→'));
    for (const L of layers) {
      // tránh sát mép trên/dưới (chỗ hay kẹt tường), lấy vài điểm trong khoảng giữa mỗi tầng
      const top = L.yTop - (L.yTop - L.yBot) * 0.15, bot = L.yBot + (L.yTop - L.yBot) * 0.15;
      const dwell = L.id === topId ? 2600 : 1800; // tầng cần soi kỹ (rừng tảo…) dạo lâu hơn
      const samples = L.id === topId ? 4 : 3;
      await sampleLayer(page, top, bot, samples, dwell, route.replace(/,/g, '-') + '_' + L.id);
    }
    acc = await spawnLog(page);
  } finally {
    check('không có lỗi trang/console/tải hỏng ở lộ trình ' + route, errors.length === 0, errors.slice(0, 5).join(' | '));
    await page.close();
  }
  out.push('  cá đã sinh ra: ' + acc.length);
  const bad = acc.filter(f => !f.ok);
  check('mọi cá sinh ra đều hợp lệ theo fish_spawn.js tại đúng chỗ sinh (lộ trình ' + route + ')', bad.length === 0,
    bad.slice(0, 8).map(f => f.id + '@' + f.mapId + ' — ' + f.reason).join(' | '));
  if (opts && opts.excludeSpecies) {
    for (const sid of opts.excludeSpecies) {
      const hit = acc.find(f => f.id === sid && f.mapId === opts.excludeMap);
      check('loài ' + sid + ' không sinh ra ở bản đồ ' + opts.excludeMap, !hit, hit ? JSON.stringify(hit) : '');
    }
  }
  return acc;
}

(async () => {
  checkDataFiles();

  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  let all = [];
  try {
    // Lộ trình 1: giống các bài kiểm khác (A01 → B01 → C03), không có ngoại lệ bản đồ.
    all = all.concat(await runRoute(browser, base, 'A01,B01,C03', 'A01'));
    // Lộ trình 2: ép xuống bản đồ rừng tảo A06 — theo wiki (Blue_Hole_Shallows) map này KHÔNG có
    // Sheepshead và Striped Catfish dù cùng vùng nông A.
    all = all.concat(await runRoute(browser, base, 'A06,B04,C03', 'A06', {
      excludeMap: 'A06', excludeSpecies: ['Asian_Sheepshead', 'Striped_Catfish'],
    }));
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();

  // Loài chỉ sống ở vùng nông A (assets.js zone: 'A', chọn ClownFish theo yêu cầu brief) không bao
  // giờ được xuất hiện ở tầng C dù bơi qua ranh giới jitter — kiểm trên toàn bộ dữ liệu đã gom.
  const clown = all.filter(f => f.id === 'ClownFish');
  check('ClownFish (chỉ vùng nông A) không bao giờ sinh ra ở vực sâu C', clown.every(f => f.area !== 'C'),
    'gặp ' + clown.filter(f => f.area === 'C').length + '/' + clown.length + ' lần ở C');

  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
  process.exit(fail ? 1 : 0);
})();
