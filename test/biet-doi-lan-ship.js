/*
 * BIỆT ĐỘI LẶN — bộ kiểm hệ THUYỀN (js/ship.js).
 *
 * Chạy:  node test/biet-doi-lan-ship.js
 * Ảnh ra %TEMP%/bdl-ship-shots (đổi bằng SHOTS=...). Hai cỡ 1280×720 và 844×390, map 0.
 * Kiểm: bắt đầu trên boong · Space nhảy xuống nước · E leo lên + kéo theo món móc · xả túi cá theo ký ·
 * đống đồ · khoang lái (chưa đủ chỉ tiêu: không đếm; đủ: 5→0 rồi qua map; bước ra giữa chừng thì về 5).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-ship-shots');
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

const ship = (page) => page.evaluate(() => BDL_DEBUG.ship.info());
const info = (page) => page.evaluate(() => BDL_DEBUG.info());
const waitFor = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 15000, polling: 100 }).then(() => true, () => false);
const shot = (page, name, W, H) => page.screenshot({ path: path.join(SHOTS, name + '-' + W + 'x' + H + '.png') });

// vào pha dive, thuyền đã nạp
async function enter(browser, base, W, H, map) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=' + map);
  const ok = await waitFor(page, () => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.ship && BDL_DEBUG.ship.info().boatReady, null, 120000);
  return { page, errors, ok };
}

// giữ phím một lúc
async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await sleep(ms);
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
}

// bơi vào cạnh đuôi thuyền (dịch chuyển tới cách đuôi 2,5 m, dưới mặt nước) rồi chờ Dave hết trạng thái nhảy
async function swimToHull(page) {
  await page.evaluate(() => {
    const m = BDL_DEBUG.ship.measure, p = m.world(m.HULL.x1, 0);
    BDL_DEBUG.teleport(p.x + 2.2, HX_TUNING.water.surfaceY - 1.6);
  });
  await waitFor(page, () => BDL_DEBUG.info().state === 'swim', null, 6000);
  await sleep(200);
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  console.log('— ' + tag);
  const { page, errors, ok } = await enter(browser, base, W, H, 0);
  check(tag + ': vào dive, thuyền nạp xong', ok, errors.slice(0, 2).join(' | '));
  if (!ok) { await page.close(); return; }
  await sleep(800);
  const SURF = await page.evaluate(() => HX_TUNING.water.surfaceY);

  // ---- đầu lượt: Dave đứng trên boong ----
  let s = await ship(page), d = await info(page);
  check(tag + ': đầu lượt Dave trên boong', s.deckOn && s.mode === 'walk' && d.deck && d.y > SURF, 'y=' + d.y.toFixed(2) + ' mặt nước ' + SURF);
  check(tag + ': Dave trong khung hình', d.screen && d.screen.x > 0 && d.screen.x < W && d.screen.y > 0 && d.screen.y < H, d.screen ? Math.round(d.screen.x) + ',' + Math.round(d.screen.y) : '');
  // thuyền không chui vào đá: lấy mẫu dọc thân ở mép nước
  const clear = await page.evaluate(() => {
    const m = BDL_DEBUG.ship.measure, W = HX.game.world, bad = [];
    for (let lx = m.HULL.x0; lx <= m.HULL.x1; lx += 0.5) for (const ly of [0.3, 1.0, 2.0]) {
      const p = m.world(lx, ly); if (!W.open(p.x, p.y, 0.3)) bad.push(lx.toFixed(1) + ',' + ly);
    }
    return bad;
  });
  check(tag + ': thân thuyền không đè đá (G.world.open)', clear.length === 0, clear.slice(0, 5).join(' '));
  await shot(page, 'ship-1-deck', W, H);

  // ---- đi bộ trên boong bằng phím A/D ----
  const lx0 = s.lx;
  await hold(page, ['KeyA'], 600);
  s = await ship(page);
  check(tag + ': phím A đi về mũi', s.lx < lx0 - 0.8, lx0.toFixed(2) + ' → ' + s.lx.toFixed(2));
  await hold(page, ['KeyD'], 2500);
  s = await ship(page);
  check(tag + ': đi tới đuôi thì dừng ở mép boong', s.lx > 4.9 && s.lx <= 5.01, 'lx=' + s.lx.toFixed(2));

  // ---- Space nhảy xuống nước ----
  await page.keyboard.press('Space');
  const gone = await waitFor(page, () => !BDL_DEBUG.ship.info().deckOn, null, 2500);
  check(tag + ': Space → rời boong', gone);
  await sleep(1500);
  d = await info(page); s = await ship(page);
  check(tag + ': Dave dưới mặt nước trong 2 giây', d.y < SURF - 0.3 && !s.deckOn, 'y=' + d.y.toFixed(2) + ' state=' + d.state);
  check(tag + ': nhảy xong là bơi', await waitFor(page, () => BDL_DEBUG.info().state === 'swim', null, 4000));

  // ---- gợi ý "Leo lên thuyền" khi bơi sát thân ----
  await swimToHull(page);
  await sleep(300);
  s = await ship(page);
  check(tag + ': gần thân thuyền hiện gợi ý E', s.prompt === 'board', String(s.prompt));
  await shot(page, 'ship-2-water-prompt', W, H);
  // xa thân thuyền thì không hiện
  await page.evaluate(() => BDL_DEBUG.teleport(-30, HX_TUNING.water.surfaceY - 8));
  await sleep(300);
  s = await ship(page);
  check(tag + ': xa thuyền không hiện gợi ý', s.prompt === null, String(s.prompt));

  // ---- E leo lên + kéo món đang móc (dây móc giả nếu hệ dây chưa có) ----
  await page.evaluate(() => {
    window.__stub = { kind: 'loot', key: 'stub_vase', label: 'Bình cổ', value: 700, icon: '🏺' };
    window.__tetherOrig = BDL.tether;
    let t = window.__stub;
    BDL.tether = { target: () => t, consume: () => { const r = t; t = null; return r; }, release: () => { t = null; } };
  });
  await swimToHull(page);
  const on0 = (await info(page)).run.onDeck, pile0 = (await ship(page)).pile;
  await page.keyboard.press('KeyE');
  const up = await waitFor(page, () => BDL_DEBUG.ship.info().deckOn, null, 2000);
  check(tag + ': E dưới thân thuyền → lên boong', up);
  await sleep(1200);
  d = await info(page); s = await ship(page);
  check(tag + ': món đang móc lên theo, tiền boong +700', d.run.onDeck === on0 + 700, on0 + ' → ' + d.run.onDeck);
  check(tag + ': đống đồ có món mới', s.pile === pile0 + 1, pile0 + ' → ' + s.pile);
  const tetherLeft = await page.evaluate(() => BDL.tether.target());
  check(tag + ': dây hết món sau khi kéo lên', tetherLeft === null);
  await page.evaluate(() => { BDL.tether = window.__tetherOrig || undefined; if (!BDL.tether) delete BDL.tether; });

  // ---- túi cá theo ký: đầy thì mất cá, hiện thông báo ----
  const bag = await page.evaluate(() => {
    const G = HX.game, T = G.catches; T.length = 0;
    const sp = HX.fish.SPECIES.filter(x => !x.shark && BDL.fishKg(x) >= 3 && BDL.fishKg(x) <= 9).sort((a, b) => BDL.fishKg(b) - BDL.fishKg(a))[0];
    const fake = () => ({ state: 'hooked', sp, pos: { x: 0, y: 0 }, z: 0, go(s) { this.state = s; } });
    const kg = BDL.fishKg(sp); let n = 0, rejected = 0, toastTxt = '';
    for (let i = 0; i < 8; i++) {
      const before = G.catches.length; G.catchFish(fake());
      if (G.catches.length > before) n++; else { rejected++; toastTxt = document.getElementById('toast').textContent; }
    }
    return { id: sp.id, kg, n, rejected, kgNow: BDL.bagKg(), cap: BDL.bagCap(), toastTxt, hud: document.getElementById('ship-bag').textContent };
  });
  check(tag + ': túi tính theo ký, không vượt trần', bag.kgNow <= bag.cap && bag.rejected > 0 && bag.n === Math.floor(bag.cap / bag.kg + 1e-9), JSON.stringify({ kg: bag.kg, n: bag.n, kgNow: bag.kgNow, cap: bag.cap }));
  check(tag + ': túi đầy → "Túi đầy · lên thuyền xả cá"', /Túi đầy/.test(bag.toastTxt), bag.toastTxt);
  check(tag + ': HUD hiện ký', /Túi cá [\d,.]+ \/ 20 kg/.test(bag.hud), bag.hud);
  await shot(page, 'ship-3-bag-full', W, H);

  // ---- 3 cá nhỏ → xả cá khi lên thuyền ----
  await page.evaluate(() => { HX.game.catches.length = 0; });
  await sleep(300);
  await page.keyboard.press('Space');
  await waitFor(page, () => !BDL_DEBUG.ship.info().deckOn, null, 2500);
  await sleep(1200);
  const fishPlan = await page.evaluate(() => {
    const sp = HX.fish.SPECIES.filter(x => !x.shark).sort((a, b) => BDL.fishKg(a) - BDL.fishKg(b)).slice(0, 3);
    HX.game.catches.push(...sp.map(x => x.id));
    return { ids: sp.map(x => x.id), sum: sp.reduce((a, x) => a + BDL.run.price('fish', BDL.fishRaw(x)), 0), kg: BDL.bagKg() };
  });
  const bagTxt = await page.evaluate(() => { return new Promise(r => setTimeout(() => r(document.getElementById('ship-bag').textContent), 200)); });
  check(tag + ': HUD túi cá đổi theo cá mới', /Túi cá/.test(bagTxt) && !/0,0 \//.test(bagTxt), bagTxt);
  await swimToHull(page);
  const on1 = (await info(page)).run.onDeck, pile1 = (await ship(page)).pile;
  await page.keyboard.press('KeyE');
  await waitFor(page, () => BDL_DEBUG.ship.info().deckOn, null, 2000);
  await sleep(1000);
  d = await info(page); s = await ship(page);
  check(tag + ': xả cá: túi trống', s.bagKg === 0 && (await page.evaluate(() => HX.game.catches.length)) === 0);
  check(tag + ': xả cá: tiền boong +Σ giá cá', d.run.onDeck === on1 + fishPlan.sum, on1 + ' + ' + fishPlan.sum + ' → ' + d.run.onDeck);
  check(tag + ': xả cá: 3 món lên đống', s.pile === pile1 + 3, pile1 + ' → ' + s.pile);
  await page.evaluate(() => BDL_DEBUG.ship.stand('pile'));
  await sleep(900);
  await shot(page, 'ship-4-pile', W, H);

  // ---- tủ đồ ----
  await page.evaluate(() => { window.__lockerCalls = 0; window.__lockerOrig = BDL.locker; BDL.locker = undefined; });
  await page.evaluate(() => BDL_DEBUG.ship.stand('locker'));
  await sleep(500);
  s = await ship(page);
  check(tag + ': ở tủ đồ hiện gợi ý E', s.zone === 'locker' && s.prompt === 'locker', s.zone + '/' + s.prompt);
  await page.keyboard.press('KeyE');
  await sleep(150);
  const tt = await page.evaluate(() => document.getElementById('toast').textContent);
  check(tag + ': chưa có tủ thì báo "Tủ đồ trống"', /Tủ đồ trống/.test(tt), tt);
  await page.evaluate(() => { BDL.locker = { open() { window.__lockerCalls++; } }; });
  await page.keyboard.press('KeyE');
  await sleep(150);
  check(tag + ': có BDL.locker thì gọi open()', (await page.evaluate(() => window.__lockerCalls)) === 1);
  await page.evaluate(() => { BDL.locker = window.__lockerOrig; if (!BDL.locker) delete BDL.locker; });
  await shot(page, 'ship-5-locker', W, H);

  // ---- khoang lái, chưa đủ chỉ tiêu ----
  await page.evaluate(() => { const r = BDL.run.dive; r.quota = Math.max(r.quota, 50000); r.onDeck = Math.min(r.onDeck, 3000); });
  await page.evaluate(() => BDL_DEBUG.ship.stand('cabin'));
  await sleep(1500);
  s = await ship(page);
  const boardVis = await page.evaluate(() => { const e = document.getElementById('ship-board'); return { on: e.classList.contains('on'), txt: e.textContent }; });
  check(tag + ': chưa đủ chỉ tiêu → không đếm ngược', s.cd === 5 && !s.leaving, 'cd=' + s.cd);
  check(tag + ': hiện "Chưa đủ chỉ tiêu: $a / $b"', boardVis.on && /Chưa đủ chỉ tiêu: \$[\d.]+ \/ \$[\d.]+/.test(boardVis.txt), boardVis.txt.replace(/\s+/g, ' '));
  await shot(page, 'ship-6-quota-short', W, H);

  // ---- khoang lái, đủ chỉ tiêu: đếm 5→0; bước ra giữa chừng thì về 5 ----
  await page.evaluate(() => { const r = BDL.run.dive; r.onDeck = r.quota + 1000; });
  await sleep(2100);
  s = await ship(page);
  check(tag + ': đủ chỉ tiêu → bắt đầu đếm', s.cd < 3.5 && s.cd > 2, 'cd=' + s.cd.toFixed(2));
  await shot(page, 'ship-7-countdown', W, H);
  await page.evaluate(() => BDL_DEBUG.ship.stand('deck'));
  await sleep(400);
  s = await ship(page);
  check(tag + ': bước ra giữa chừng → đặt lại 5 s', s.cd === 5 && s.zone === 'deck', 'cd=' + s.cd);
  const m0 = (await info(page)).map;
  await page.evaluate(() => { window.__ext = 0; const o = HX.game.onExtract; HX.game.onExtract = function () { window.__ext++; return o.apply(this, arguments); }; });
  await page.evaluate(() => BDL_DEBUG.ship.stand('cabin'));
  const t0 = Date.now();
  await waitFor(page, () => window.__ext > 0, null, 9000);
  const dt = (Date.now() - t0) / 1000;
  check(tag + ': đứng đủ 5 s thì G.onExtract', dt >= 4.8 && dt <= 7.2, dt.toFixed(1) + ' s');
  const next = await waitFor(page, (m) => BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.info().map === m && BDL_DEBUG.ship.info().boatReady, m0 + 1, 90000);
  check(tag + ': sang map kế (map ' + (m0 + 1) + ')', next);
  s = await ship(page);
  check(tag + ': map mới cũng bắt đầu trên boong, đống đồ trống', s.deckOn && s.pile === 0, JSON.stringify({ deckOn: s.deckOn, pile: s.pile }));
  await shot(page, 'ship-8-next-map', W, H);

  // ---- cảm ứng: nút nhảy / E qua BDL.press ----
  await page.evaluate(() => document.body.classList.add('touch'));
  await sleep(400);
  const btn = await page.evaluate(() => {
    const j = document.getElementById('ship-btn-jump'), r = j.getBoundingClientRect(), cs = getComputedStyle(j);
    return { shown: cs.display !== 'none', x: r.x, y: r.y, w: r.width, h: r.height };
  });
  check(tag + ': trên boong (cảm ứng) hiện nút Nhảy trong màn hình', btn.shown && btn.x >= 0 && btn.x + btn.w <= W && btn.y >= 0 && btn.y + btn.h <= H, JSON.stringify(btn));
  await shot(page, 'ship-9-touch', W, H);
  await page.evaluate(() => BDL.press('jump'));
  check(tag + ': BDL.press("jump") nhảy xuống', await waitFor(page, () => !BDL_DEBUG.ship.info().deckOn, null, 2500));
  await sleep(2200);
  await swimToHull(page);
  await sleep(300);
  const eBtn = await page.evaluate(() => { const b = document.getElementById('ship-btn-e'), cs = getComputedStyle(b), r = b.getBoundingClientRect(); return { shown: cs.display !== 'none', x: r.x, y: r.y, w: r.width, h: r.height }; });
  check(tag + ': gợi ý E hiện nút E trong màn hình', eBtn.shown && eBtn.x >= 0 && eBtn.x + eBtn.w <= W && eBtn.y + eBtn.h <= H, JSON.stringify(eBtn));
  await shot(page, 'ship-10-touch-e', W, H);
  await page.evaluate(() => BDL.press('interact'));
  check(tag + ': BDL.press("interact") leo lên', await waitFor(page, () => BDL_DEBUG.ship.info().deckOn, null, 2000));

  // quán / cano / cửa hàng dùng chung trang: giao diện thuyền không được lòi ra ngoài pha dive
  const hidden = await page.evaluate(() => {
    const ph = document.body.dataset.phase; document.body.dataset.phase = 'shop';
    const r = ['ship-prompt', 'ship-bag', 'ship-board'].map(id => document.getElementById(id).getClientRects().length === 0 ? 'none' : 'shown').concat(getComputedStyle(document.getElementById('ship-ui')).display);
    document.body.dataset.phase = ph; return r;
  });
  check(tag + ': ngoài pha dive giao diện thuyền ẩn hết', hidden.every(v => v === 'none'), hidden.join(','));
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  const gerr = await page.evaluate(() => HX.game.errors.slice());
  check(tag + ': G.errors rỗng', gerr.length === 0, gerr.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const [W, H] of [[1280, 720], [844, 390]]) await run(browser, base, W, H);
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
