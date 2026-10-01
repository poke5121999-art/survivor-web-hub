/*
 * BIỆT ĐỘI LẶN — kiểm cano (js/cruise.js) và trạm tiếp tế (js/shop.js).
 *
 * Chạy:  node test/biet-doi-lan-shop.js
 * Ảnh chụp ra %TEMP%/bdl-shop-shots (đổi bằng SHOTS=...). Chạy ở 1280×720 và 844×390.
 * BASE=https://.../ kiểm bản trên mạng thay vì máy chủ tĩnh của bộ kiểm.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-shop-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
const phaseIs = (page, name) => page.waitForFunction(n => HX.game.phase === n, name, { timeout: 60000 }).then(() => true, () => false);
const shopState = page => page.evaluate(() => BDL_DEBUG.shop.state());
const goods = page => page.evaluate(() => BDL_DEBUG.shop.goods());
const waitShop = page => page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.shop && BDL_DEBUG.shop.state().ready, null, { timeout: 30000 }).then(() => true, () => false);

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=0');
  const dive = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive', null, { timeout: 120000 }).then(() => true, () => false);
  check(tag + ': vào pha dive', dive);
  if (!dive) { check(tag + ': không lỗi trang', false, errors.slice(0, 3).join(' | ')); await page.close(); return; }
  await sleep(800);

  // ---------- cano: chạy hết chuyến tự nhiên (đo giờ) rồi sang shop ----------
  await page.evaluate(() => {
    window.__left = 0;
    BDL.run.ca.wallet = 0;
    HX.game.go('cruise', { dir: 'home', then: () => HX.game.go('shop', { then: () => { window.__left = 1; } }) });
  });
  const loaded = await page.waitForFunction(() => HX.game.phase === 'cruise' && HX.phases.cruise.info().loaded, null, { timeout: 90000 }).then(() => true, () => false);
  check(tag + ': cano tải xong', loaded);
  const t0 = Date.now();
  await sleep(3500);
  await page.screenshot({ path: path.join(SHOTS, 'cruise-home-' + tag + '.png') });
  const ci = await page.evaluate(() => HX.phases.cruise.info());
  check(tag + ': cano chạy (có tốc độ, chiều về, buổi tối)', ci.active && ci.dir === 'home' && ci.time === 'evening' && ci.dist > 0, 'speed ' + ci.speed.toFixed(1) + ' dist ' + ci.dist.toFixed(0));
  const reached = await phaseIs(page, 'shop');
  const secs = (Date.now() - t0) / 1000;
  check(tag + ': chuyến về tự kết thúc ≤ 12 s rồi sang shop', reached && secs <= 12.5, secs.toFixed(1) + ' s');
  check(tag + ': shop sẵn sàng', await waitShop(page));
  if (W === 1280) {
    // ---------- cano: nút Bỏ qua + phím ----------
    await page.evaluate(() => { window.__left = 0; HX.game.go('cruise', { dir: 'out', then: () => { window.__left = 'out'; } }); });
    await page.waitForFunction(() => HX.game.phase === 'cruise' && HX.phases.cruise.info().loaded, null, { timeout: 60000 });
    await sleep(500);
    const hasBtn = await page.evaluate(() => !!document.getElementById('cruise-skip') && document.getElementById('cruise-skip').textContent.indexOf('Bỏ qua') >= 0);
    check(tag + ': có nút "Bỏ qua ▶"', hasBtn);
    await page.screenshot({ path: path.join(SHOTS, 'cruise-out-' + tag + '.png') });
    await page.click('#cruise-skip');
    await sleep(300);
    check(tag + ': bấm Bỏ qua gọi then (chiều ra)', await page.evaluate(() => window.__left === 'out'));
    await page.evaluate(() => { window.__left = 0; HX.game.go('cruise', { dir: 'home', then: () => { window.__left = 'space'; } }); });
    await page.waitForFunction(() => HX.game.phase === 'cruise' && HX.phases.cruise.info().loaded, null, { timeout: 60000 });
    await sleep(300);
    await page.keyboard.press('Space');
    await sleep(300);
    check(tag + ': Space bỏ qua', await page.evaluate(() => window.__left === 'space'));
    await page.evaluate(() => { window.__left = 0; HX.game.go('cruise', { dir: 'home', then: () => { window.__left = 'dbg'; } }); });
    await page.waitForFunction(() => HX.game.phase === 'cruise' && HX.phases.cruise.info().loaded, null, { timeout: 60000 });
    await page.evaluate(() => BDL_DEBUG.cruise.skip());
    await sleep(200);
    check(tag + ': BDL_DEBUG.cruise.skip()', await page.evaluate(() => window.__left === 'dbg'));
  }

  // ---------- vào shop cho các ca mua bán ----------
  await page.evaluate(() => { window.__left = 0; HX.game.go('shop', { then: () => { window.__left = 1; } }); });
  check(tag + ': vào shop', await waitShop(page));
  await page.evaluate(() => { BDL.run.ca.cleared = 2; delete BDL.run.ca.shopRoll; BDL.run.ca.wallet = 0; BDL_DEBUG.shop.reroll(); });
  await sleep(500);
  let gs = await goods(page);
  const cnt = k => gs.filter(g => g.section === k).length;
  check(tag + ': bày 3 nâng cấp + 5 đồ nghề + kệ O₂', cnt('up') === 3 && cnt('gear') === 5 && cnt('o2') >= 3,
    'up ' + cnt('up') + ' gear ' + cnt('gear') + ' o2 ' + cnt('o2') + ' · ' + gs.map(g => g.key).join(','));
  check(tag + ': nâng cấp đúng loại, đồ nghề là súng/cận chiến/ném/dụng cụ, kệ O₂ là bình',
    gs.filter(g => g.section === 'up').every(g => g.kind === 'upgrade') && gs.filter(g => g.section === 'gear').every(g => ['gun', 'melee', 'throw', 'tool'].includes(g.kind)) &&
    gs.filter(g => g.section === 'o2').every(g => g.kind === 'heal'));
  check(tag + ': có ít nhất một súng và một món cận chiến', gs.some(g => g.kind === 'gun') && gs.some(g => g.kind === 'melee'));
  const priceOk = await page.evaluate(() => BDL_DEBUG.shop.goods().every(g => g.price === (g.kind === 'upgrade' ? BDL.upgradePrice(g.key, 0) : BDL.ITEM_BY_KEY[g.key].price)));
  check(tag + ': giá = giá đồ nghề / giá nâng cấp lần đầu', priceOk);
  await page.screenshot({ path: path.join(SHOTS, 'shop-entry-' + tag + '.png') });

  // ví 0: từ chối
  const g0 = gs.find(g => g.section === 'gear');
  const r0 = await page.evaluate(i => BDL_DEBUG.shop.buy(i), g0.i);
  const s0 = await shopState(page);
  check(tag + ': ví 0 mua bị từ chối (thông báo, ví và túi không đổi)', !r0.ok && /Không đủ/.test(r0.msg) && s0.wallet === 0 && s0.stash.length === 0, r0.msg);

  // luồng thật bằng phím: nhặt → quầy → đứng thảm 3 giây
  const cheap = gs.filter(g => g.section === 'gear').sort((a, b) => a.price - b.price)[0];
  await page.evaluate(() => BDL_DEBUG.shop.wallet(100000));
  await page.evaluate(x => BDL_DEBUG.shop.teleport(x), cheap.x);
  await sleep(250);
  const promptNear = (await shopState(page)).prompt || '';
  check(tag + ': đứng cạnh món hiện gợi ý "E: nhặt …"', /E: nhặt/.test(promptNear), promptNear);
  await page.screenshot({ path: path.join(SHOTS, 'shop-shelf-' + tag + '.png') });
  await page.keyboard.press('KeyE');
  let st = await shopState(page);
  check(tag + ': E nhặt món lên đầu', st.carry === cheap.key, String(st.carry));
  await page.evaluate(() => BDL_DEBUG.shop.teleport(870));
  await sleep(150);
  await page.keyboard.press('KeyE');
  st = await shopState(page);
  check(tag + ': E đặt món lên quầy Bancho', st.carry === null && st.basket.length === 1 && st.basket[0] === cheap.key && st.basketTotal === cheap.price, JSON.stringify(st.basket));
  // lấy lại khỏi quầy trước khi trả được phép
  await page.keyboard.press('KeyE');
  st = await shopState(page);
  check(tag + ': nhấc lại món khỏi quầy khi chưa trả', st.carry === cheap.key && st.basket.length === 0);
  await page.keyboard.press('KeyE');
  st = await shopState(page);
  await page.evaluate(() => BDL_DEBUG.shop.teleport(928));
  await sleep(1500);
  st = await shopState(page);
  await page.screenshot({ path: path.join(SHOTS, 'shop-paying-' + tag + '.png') });
  check(tag + ': đứng thảm: đang đếm ngược (chưa trả sớm)', st.payT > 0.8 && st.payT < 3 && st.wallet === 100000, 'payT ' + st.payT.toFixed(2));
  await sleep(2200);
  st = await shopState(page);
  const wantStash = await page.evaluate(k => BDL.ITEM_BY_KEY[k].uses, cheap.key);
  check(tag + ': sau 3 s ví trừ đúng giá', st.wallet === 100000 - cheap.price, st.wallet + ' (giá ' + cheap.price + ')');
  check(tag + ': món vào túi đồ {key, uses}', st.stash.length === 1 && st.stash[0].key === cheap.key && st.stash[0].uses === wantStash, JSON.stringify(st.stash));
  check(tag + ': quầy trống, báo đã mua', st.basket.length === 0 && /Đã mua/.test(st.msg), st.msg);
  gs = await goods(page);
  check(tag + ': món đã bán hiện "đã bán"', gs.find(g => g.i === cheap.i).state === 'sold');
  await page.screenshot({ path: path.join(SHOTS, 'shop-bought-' + tag + '.png') });

  // không đủ tiền bằng luồng thật: từ chối, món còn trên quầy
  const other = gs.filter(g => g.section === 'gear' && g.state === 'shelf').sort((a, b) => a.price - b.price)[0];
  await page.evaluate(w => BDL_DEBUG.shop.wallet(w), other.price - 1);
  await page.evaluate(x => BDL_DEBUG.shop.teleport(x), other.x);
  await sleep(200);
  await page.keyboard.press('KeyE');
  await page.evaluate(() => BDL_DEBUG.shop.teleport(928));
  await sleep(200);
  await page.keyboard.press('KeyE');
  await sleep(3400);
  st = await shopState(page);
  check(tag + ': thiếu 1 đồng bị từ chối, món còn trên quầy, ví nguyên', /Không đủ/.test(st.msg) && st.basket.length === 1 && st.wallet === other.price - 1 && st.stash.length === 1, st.msg);
  await page.screenshot({ path: path.join(SHOTS, 'shop-refused-' + tag + '.png') });
  // bỏ ra khỏi quầy, trả lại kệ
  await page.evaluate(() => BDL_DEBUG.shop.teleport(872));
  await sleep(150);
  await page.keyboard.press('KeyE');
  await page.evaluate(x => BDL_DEBUG.shop.teleport(x), other.x);
  await sleep(150);
  await page.keyboard.press('KeyE');
  st = await shopState(page);
  gs = await goods(page);
  check(tag + ': đặt lại món lên kệ', st.carry === null && st.basket.length === 0 && gs.find(g => g.i === other.i).state === 'shelf');

  // nâng cấp: giá x1,6 ở lần mua thứ hai, tối đa 3 lần
  await page.evaluate(() => { BDL_DEBUG.shop.wallet(1000000); BDL.run.ca.upg = {}; BDL_DEBUG.shop.roll(['hp', 'o2s']); });
  gs = await goods(page);
  const hp0 = await page.evaluate(() => BDL.ITEM_BY_KEY.hp.price);
  check(tag + ': nâng cấp lần 1 giá gốc', gs[0].key === 'hp' && gs[0].price === hp0, gs[0].price + '');
  const b1 = await page.evaluate(() => BDL_DEBUG.shop.buy(0));
  let s1 = await shopState(page);
  check(tag + ': mua nâng cấp tăng upg, trừ ví', b1.ok && s1.upg.hp === 1 && s1.wallet === 1000000 - hp0, JSON.stringify(s1.upg));
  await page.evaluate(() => BDL_DEBUG.shop.roll(['hp']));
  gs = await goods(page);
  check(tag + ': nâng cấp lần 2 giá ×1,6', gs[0].price === Math.round(hp0 * 1.6), gs[0].price + ' vs ' + Math.round(hp0 * 1.6));
  await page.evaluate(() => BDL_DEBUG.shop.buy(0));
  await page.evaluate(() => BDL_DEBUG.shop.roll(['hp']));
  gs = await goods(page);
  check(tag + ': nâng cấp lần 3 giá ×1,6²', gs[0].price === Math.round(hp0 * 2.56), gs[0].price + ' vs ' + Math.round(hp0 * 2.56));
  await page.evaluate(() => BDL_DEBUG.shop.buy(0));
  const never = await page.evaluate(() => { let seen = 0; for (let i = 0; i < 25; i++) { BDL_DEBUG.shop.reroll(); if (BDL_DEBUG.shop.goods().some(g => g.key === 'hp')) seen++; } return seen; });
  check(tag + ': đã mua 3 lần thì không bày lại nâng cấp đó (25 lần xếp lại)', never === 0, 'thấy ' + never);

  // kệ O₂: mua bình vào túi
  await page.evaluate(() => { BDL.run.ca.stash = []; BDL_DEBUG.shop.wallet(100000); BDL_DEBUG.shop.roll(['o2m']); });
  const ob = await page.evaluate(() => BDL_DEBUG.shop.buy(0));
  s1 = await shopState(page);
  check(tag + ': bình O₂ vào túi', ob.ok && s1.stash.length === 1 && s1.stash[0].key === 'o2m' && s1.stash[0].uses === 1, JSON.stringify(s1.stash));

  // nạp đạn lại
  const rs = await page.evaluate(() => {
    const ca = BDL.run.ca;
    ca.stash = [{ key: 'rifle', uses: 1 }, { key: 'bat', uses: 2 }, { key: 'bomb', uses: 1 }, { key: 'o2s', uses: 1 }];
    BDL.restock(ca);
    return ca.stash.map(s => s.key + ':' + s.uses).join(',');
  });
  check(tag + ': BDL.restock nạp lại súng + cận chiến, không đụng bom/bình', rs === 'rifle:20,bat:12,bomb:1,o2s:1', rs);

  if (W === 844) {
    await page.evaluate(() => { document.body.classList.add('touch'); BDL_DEBUG.shop.reroll(); BDL_DEBUG.shop.wallet(23000); BDL_DEBUG.shop.teleport(520); });
    await sleep(500);
    await page.screenshot({ path: path.join(SHOTS, 'shop-touch-' + tag + '.png') });
    await page.evaluate(() => document.body.classList.remove('touch'));
  } else {
    await page.evaluate(() => { BDL_DEBUG.shop.reroll(); BDL_DEBUG.shop.wallet(23000); BDL_DEBUG.shop.teleport(360); });
    await sleep(400);
    await page.screenshot({ path: path.join(SHOTS, 'shop-wide-' + tag + '.png') });
  }

  // cửa ra khơi
  await page.evaluate(() => { window.__left = 0; BDL_DEBUG.shop.teleport(40); });
  await sleep(1500);
  st = await shopState(page);
  check(tag + ': đứng ở cửa: đang đếm ngược, chưa ra', st.leaveT > 0.8 && st.leaveT < 3 && (await page.evaluate(() => window.__left)) === 0, 'leaveT ' + st.leaveT.toFixed(2));
  await page.screenshot({ path: path.join(SHOTS, 'shop-door-' + tag + '.png') });
  await sleep(2300);
  check(tag + ': ở cửa 3 s thì gọi then', await page.evaluate(() => window.__left === 1));

  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 4).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const [W, H] of [[1280, 720], [844, 390]]) {
      console.log('— ' + W + 'x' + H);
      await run(browser, base, W, H);
    }
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
