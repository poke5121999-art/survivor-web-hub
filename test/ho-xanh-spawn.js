/*
 * HỐ XANH — cá sinh ra đúng chỗ đặt gốc (IGPSet + FishAllocator, data/fish_spawn.js).
 *
 * Chạy:  node test/ho-xanh-spawn.js
 * Không cần trình duyệt: đối chiếu data/fish_spawn.js với data/zones.js và data/assets.js.
 * Trong trình duyệt (sổ mới = ngày 1, nên mỗi zone chỉ mở preset _1): dịch Dave tới vài allocator gốc
 * đã biết toạ độ và đòi đúng loài cá hiện ra ở đó; mọi con cá sinh ra phải thuộc preset đã bốc của
 * đúng tầng, đứng sát allocator của loài đó; cá mập 3D không vào bộ sinh 2D mà nằm chờ ở G.fishes.sharks;
 * cá chết không sinh lại.
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
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml' };

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

function load(file) {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'games/ho-xanh/data', file), 'utf8'))(win);
  return win;
}

// ---------- node-only: ba bảng dữ liệu khớp nhau ----------
function checkDataFiles() {
  const S = load('fish_spawn.js').HX_FISH_SPAWN, Z = load('zones.js').HX_ZONES, A = load('assets.js').HX_ASSETS;
  const zs = Object.keys(S.zones).sort().join(','), zz = Object.keys(Z).sort().join(',');
  check('fish_spawn.js có đúng 16 zone của zones.js', zs === zz, zs);
  const ids = new Set(A.fish.map(s => s.id));
  const bad = Object.entries(S.species).filter(([, s]) => s.id && !ids.has(s.id)).map(([t, s]) => t + ':' + s.id);
  check('mọi loài có id trong fish_spawn.js đều có Spine trong assets.js', bad.length === 0, bad.join(', '));
  const dangling = S.picks.flat().filter(p => !S.prefabs[p[1]]).map(p => p[1]);
  check('mọi prefab trong bộ chọn đều có trong bảng prefabs', dangling.length === 0, dangling.join(', '));
  const noDay0 = Object.entries(S.zones).filter(([, z]) => z.presets.length && !z.presets.some(p => p.day === 0)).map(([k]) => k);
  check('zone nào có preset cũng có preset mở từ ngày đầu', noDay0.length === 0, noDay0.join(', '));
}

// Ghi mọi con cá bộ sinh gọi spawnAt: loài, chỗ đứng, tầng.
async function hookSpawns(page) {
  await page.evaluate(() => {
    window.__spawnLog = [];
    const F = HX.game.fishes, orig = F.spawnAt;
    F.spawnAt = function (sp, x, y) {
      window.__spawnLog.push({ id: sp.id, x, y, layer: HX.game.stack.layerAt(y).i });
      return orig.call(this, sp, x, y);
    };
  });
}

// Mỗi con đã sinh phải đứng ở allocator cùng loài của preset đã bốc, cùng tầng: tại gốc allocator hoặc lệch đúng
// như một con trong prefab Boid, sai số ≤ 3 m (allocator sát vách thì bị dời ra chỗ nước trống gần nhất).
async function spawnsMatchPreset(page) {
  return page.evaluate(() => {
    const S = window.HX_FISH_SPAWN, st = HX.game.stack, F = HX.game.fishes, bad = [];
    const want = st.layers.map(L => {
      const z = S.zones[L.id], pr = z.presets.find(p => p.name === F.presets[L.i]);
      const pts = [];
      z.base.concat(pr ? pr.allocs : []).filter(a => !a.off).forEach(a => S.picks[a.p].forEach(p => S.prefabs[p[1]].fish.forEach(m => {
        const s = S.species[a.tid || m[0]];
        if (!s.id) return;
        pts.push({ id: s.id, x: a.x, y: a.y + L.yOff });
        pts.push({ id: s.id, x: a.x + m[1], y: a.y + L.yOff + m[2] });
      })));
      return pts;
    });
    window.__spawnLog.forEach(f => {
      const ok = want[f.layer].some(p => p.id === f.id && Math.hypot(p.x - f.x, p.y - f.y) <= 3);
      if (!ok) bad.push(f.id + '@' + f.x.toFixed(1) + ',' + f.y.toFixed(1) + ' tầng ' + st.layers[f.layer].id);
    });
    return { n: window.__spawnLog.length, bad };
  });
}

// Dịch tới cạnh allocator gốc (toạ độ riêng của zone) rồi trả loài của mọi con đã SINH RA trong bán kính r quanh nó
// (chỗ sinh, không phải chỗ con cá bơi tới sau đó: cá hung dữ lao về phía Dave ngay).
async function visit(page, layer, x, y, r, shot) {
  const wy = await page.evaluate(p => p.y + HX.game.stack.layers[p.layer].yOff, { layer, y });
  await page.evaluate(p => HX_DEBUG.teleport(p.x + 2.5, p.y), { x, y: wy });
  await sleep(1200);
  if (shot) await page.screenshot({ path: path.join(SHOTS, shot + '.png') });
  return page.evaluate(p => window.__spawnLog.filter(f => Math.hypot(f.x - p.x, f.y - p.y) <= p.r).map(f => f.id), { x, y: wy, r });
}

async function run(browser, base, route, body) {
  out.push('\n[' + route + ']');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  try {
    await page.goto(base + '/games/ho-xanh/index.html?route=' + route + '&fresh=1');
    await setSail(page);
    await hookSpawns(page);
    await body(page);
    const m = await spawnsMatchPreset(page);
    check('mọi con cá sinh ra (' + m.n + ') đứng sát allocator cùng loài của preset đã bốc ở đúng tầng', m.n > 0 && m.bad.length === 0, m.bad.slice(0, 6).join(' | '));
  } catch (e) {
    check('lộ trình ' + route + ' chạy hết không vỡ', false, e.stack);
  } finally {
    check('không có lỗi trang/console/tải hỏng ở lộ trình ' + route, errors.length === 0, errors.slice(0, 5).join(' | '));
    await page.close();
  }
}

(async () => {
  checkDataFiles();

  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

  await run(browser, base, 'A01,B01,C03', async page => {
    const pr = await page.evaluate(() => HX.game.fishes.presets.join(','));
    check('ngày 1 chỉ mở preset _1 của mỗi tầng (Day_Min gốc)', pr === 'IGPSet_A01_Day_F00_N00_1,IGPSet_B01_Day_F00_N00_1,IGPSet_C03_Day_F00_N00_1', pr);

    // A01, preset _1: Allocator_Boid_SA_ClownFish_Random ở (-34.89, 3.85), bốc Boid_SA_2010002_ClownFish_3/4/5
    const a01 = await visit(page, 0, -34.89, 3.85, 1, 'A01_clownfish');
    const clown = a01.filter(id => id === 'ClownFish').length;
    check('A01 (-34.89, 3.85): một đàn 3–5 cá hề sinh ra ngay chỗ allocator gốc', clown >= 3 && clown <= 5, a01.join(','));

    // cá mập trắng đầu (TID 2010025) ở SharkAllocator (44.1, -16) của A01, nhóm Whitetip_Reefshark_NEW đang tắt trong prefab
    const sh = await page.evaluate(() => HX.game.fishes.sharks[0].map(s => s.tid + '@' + s.x + ',' + s.y + ':' + s.off).join(' '));
    check('A01: cá mập 3D không vào bộ sinh 2D mà chờ ở fishes.sharks[0]', sh.indexOf('2010025@44.1,-16:Whitetip_Reefshark_NEW') >= 0, sh);

    // cá chết không sinh lại: giết cả đàn cá hề, bơi xa rồi quay lại
    await page.evaluate(() => HX.game.fishes.list.filter(f => f.sp.id === 'ClownFish' && Math.hypot(f.pos.x + 34.89, f.pos.y - 3.85) < 2)
      .forEach(f => { f.die(false); f.go('reeled'); }));
    await sleep(500);
    await page.evaluate(() => HX_DEBUG.teleport(40, -20));
    await sleep(800);
    const back = await visit(page, 0, -34.89, 3.85, 1);
    check('đàn cá hề đã chết ở (-34.89, 3.85) không sinh lại khi quay về', back.filter(id => id === 'ClownFish').length === clown, back.join(','));

    // Ngày 1 mở công tắc vây trắng (A01) và cưa mũi dài &New (B01, bốc ngẫu nhiên cưa hoặc búa trơn) theo tuning
    // fish.sharkSwitch; hổ, đuôi dài từ ngày 3, mako từ ngày 5. Tầng C bật sẵn trong prefab gốc.
    const on = await page.evaluate(() => [...new Set(HX.game.fishes.allocs.filter(a => a.shark).map(a => a.shark.id))].sort());
    const want = ['Cookiecutter_Shark', 'Frilled_Shark', 'Megamouth_Shark', 'Whitetip_Reefshark'];
    const rest = on.filter(id => want.indexOf(id) < 0);
    check('ngày 1: cá mập đang mở là vây trắng, tầng C và một con ở allocator &New của B01',
      want.every(id => on.indexOf(id) >= 0) && rest.length === 1 && ['Longnosesaw_Shark', 'Smooth_Hammershark'].indexOf(rest[0]) >= 0, on.join(','));
    await visit(page, 0, 44.1, -16, 1, 'A01_whitetip');
    await sleep(1500);
    const wt = await page.evaluate(() => HX.game.fishes.list.filter(f => f.sp.shark)
      .map(f => f.sp.id + '@' + f.alloc.x.toFixed(1) + ',' + f.alloc.y.toFixed(1)).join(' '));
    check('A01 (44.1, -16): cá mập vây trắng 3D sinh ra ở allocator gốc', wt === 'Whitetip_Reefshark@44.1,-16.0', wt);

    // B01, preset _1: SA_2010121_Great_Barracuda ở (42.31, 4.64)
    const b01 = await visit(page, 1, 42.31, 4.64, 1, 'B01_barracuda');
    check('B01 (42.31, 4.64): cá nhồng lớn sinh ra ngay chỗ allocator gốc', b01.indexOf('Great_Barracuda') >= 0, b01.join(','));

    // C03, preset _1: SA_2010202_Fangtooth ở (46.1, -1.5)
    const c03 = await visit(page, 2, 46.1, -1.5, 1, 'C03_fangtooth');
    check('C03 (46.1, -1.5): cá răng nanh sinh ra ngay chỗ allocator gốc', c03.indexOf('Fangtooth') >= 0, c03.join(','));
  });

  // Rừng tảo A06: wiki bảo không có Sheepshead / Striped Catfish, nhưng IGPSet_A06_Day_F00_N00_1 gốc có đặt cả hai.
  await run(browser, base, 'A06,B04,C03', async page => {
    const cat = await visit(page, 0, -38.9, -2.34, 7, 'A06_catfish');
    const nCat = cat.filter(id => id === 'Striped_Catfish').length;
    check('A06 (-38.9, -2.34): một đàn 10/20/25 cá da trơn sọc sinh ra quanh allocator gốc', [10, 20, 25].indexOf(nCat) >= 0, nCat + ' con');
    const shp = await visit(page, 0, -40.46, -10.62, 1);
    check('A06 (-40.46, -10.62): cá bàng chài đầu bướu của allocator gốc', shp.indexOf('Asian_Sheepshead') >= 0, shp.join(','));
  });

  // Lặn đêm A03N: IGPSet_A03_Night_F00_N00_1, Allocator_Box_Jellyfish ở (-16, 17), vùng bơi là hộp ±10 m.
  await run(browser, base, 'A03N,B04N', async page => {
    const box = await visit(page, 0, -16, 17, 1, 'A03N_boxjelly');
    check('A03N (-16, 17): sứa hộp của allocator gốc', box.indexOf('Box_JellyFish') >= 0, box.join(','));
  });

  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
  process.exit(fail ? 1 : 0);
})();
