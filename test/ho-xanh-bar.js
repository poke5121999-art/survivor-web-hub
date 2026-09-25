/*
 * HỐ XANH — bộ kiểm quán sushi (pha kitchen → bar → ledger, js/bar.js).
 *
 * Chạy:  node test/ho-xanh-bar.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-bar-shots) — mở ra xem bằng mắt.
 * Hai lượt: 1280×720 chơi bằng bàn phím, 844×390 chơi bằng chạm / chuột. Mỗi lượt đi trọn một đêm tới sổ cuối ngày,
 * rồi tải lại trang để xem sổ lưu đã ghi đúng một lần.
 * Khách tự vào quán (hạt giống cố định qua HX.bar.debug.seed). Khách để thử trà và khách bị bỏ rơi thì gọi HX.bar.debug.spawn,
 * còn mọi việc phục vụ đều bằng phím hoặc chạm thật.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-bar-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json' };

// [DtD] giá món gốc của ba loài trong tủ giả (?phase=kitchen): RecipeData.price của Sushi_<loài>
const PRICE = { Coral_Trout: 18, Titan_Triggerfish: 15, ClownFish: 2 };
const NAME = { Coral_Trout: 'Sushi cá mú chấm', Titan_Triggerfish: 'Sushi cá bò titan', ClownFish: 'Sushi cá hề' };
// [ĐỀ XUẤT] servingsOf: 2 + floor(cm / 20) → cá mú chấm 60 cm = 5 suất/con, cá bò titan 70 cm = 5, cá hề 15 cm = 2
const PER = { Coral_Trout: 5, Titan_Triggerfish: 5, ClownFish: 2 };
const FRIDGE0 = { ClownFish: 3, Coral_Trout: 1, Titan_Triggerfish: 1 };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
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
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

const info = page => page.evaluate(() => HX.bar.debug.info());
const save = page => page.evaluate(() => HX_DEBUG.save());
const phaseIs = (page, p, ms) => page.waitForFunction(p => HX_DEBUG.info().phase === p, p, { timeout: ms || 20000 }).then(() => true, () => false);
function cust(I, id) { return I.customers.filter(c => c.id === id)[0] || null; }
async function waitFor(page, fn, arg, ms) {
  return page.waitForFunction(fn, arg, { timeout: ms || 30000, polling: 'raf' }).then(() => true, () => false);
}
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

// ---------- điều khiển bằng bàn phím ----------
async function walkKeys(page, x) {
  const T = await page.evaluate(() => HX.bar.T);
  x = Math.max(T.daveMin, Math.min(T.daveMax, x));
  // như walkStick: đoạn cuối chạy đồng hồ game chậm (timeScale 0,2) để độ trễ thả phím không làm Dave dừng quá tầm với
  let ok = true, slow = false;
  for (let k = 0; k < 6; k++) {
    const I = await info(page);
    if (Math.abs(I.dave.x - x) <= 6) break;
    if (!slow && Math.abs(I.dave.x - x) < 100) { slow = true; await page.evaluate(() => HX.bar.debug.timeScale(0.2)); }
    const dir = x > I.dave.x ? 1 : -1, key = dir > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    // thả phím khi tới nơi (hoặc vừa vượt qua)
    ok = await waitFor(page, a => { const dx = HX.bar.debug.info().dave.x; return Math.abs(dx - a.x) <= (a.slow ? 6 : 100) || (a.dir > 0 ? dx >= a.x : dx <= a.x); }, { x, dir, slow }, 90000);
    await page.keyboard.up(key);
  }
  if (slow) await page.evaluate(() => HX.bar.debug.timeScale(1));
  return ok && Math.abs((await info(page)).dave.x - x) <= T.reach;
}
async function press(page, key) { await page.keyboard.down(key); await sleep(40); await page.keyboard.up(key); }
// Chờ món của khách ra lò, đi tới quầy Bancho bấm E, rồi tới ghế khách bấm E.
async function serveByKeys(page, cid) {
  let I = await info(page), c = cust(I, cid);
  if (!await waitFor(page, id => { const I = HX.bar.debug.info(), c = I.customers.filter(c => c.id === id)[0]; return !c || c.st === 'order'; }, cid, 120000)) return 'không gọi món';
  I = await info(page); c = cust(I, cid);
  if (!c || c.order === 'tea') return 'khách gọi trà';
  if (!await waitFor(page, d => HX.bar.debug.info().plates.some(p => p.dish === d && p.st === 'ready'), c.order, 120000)) return 'món không ra lò';
  await walkKeys(page, I.passX);
  await press(page, 'KeyE');
  I = await info(page);
  if (I.dave.carry.indexOf(c.order) < 0) return 'không bưng được món: ' + JSON.stringify(I.dave);
  await walkKeys(page, c.sitX);
  await press(page, 'KeyE');
  return 'ok';
}

// ---------- điều khiển bằng chạm ----------
async function tapRoom(page, x, y) {
  const p = await page.evaluate(a => HX.bar.debug.toClient(a[0], a[1]), [x, y]);
  await page.touchscreen.tap(p.x, p.y);
  return p;
}
async function serveByTaps(page, cid) {
  if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return !c || c.st === 'order'; }, cid, 120000)) return 'không gọi món';
  let I = await info(page), c = cust(I, cid);
  if (!c || c.order === 'tea') return 'khách gọi trà';
  if (!await waitFor(page, d => HX.bar.debug.info().plates.some(p => p.dish === d && p.st === 'ready'), c.order, 120000)) return 'món không ra lò';
  // chạm ô món đã xong trong hàng chờ bếp → Dave tự đi tới quầy và bưng
  const slot = await page.$('.bb-slot.ready[data-dish="' + c.order + '"]');
  const box = await slot.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  if (!await waitFor(page, d => HX.bar.debug.info().dave.carry.indexOf(d) >= 0, c.order, 15000)) return 'chạm ô món mà Dave không bưng';
  // chạm vào người khách → Dave đi tới và đưa món
  await tapRoom(page, c.sitX, c.sitY - 40);
  if (!await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'serve' && e.cid === id), cid, 15000)) return 'chạm khách mà không phục vụ';
  return 'ok';
}

// Trà: tới ghế khách, giữ nút (phím hoặc chuột) tới khi vòng rót đầy `fill` (1 = đầy vòng) rồi thả.
// Chờ theo q.fill của game chứ không theo giờ thật: máy chậm thì game chạy chậm, giữ theo mili giây sẽ rót thiếu.
async function holdUntilFill(page, fill) {
  await waitFor(page, () => { const q = HX.bar.debug.info().qte; return q && q.st === 'pour'; }, null, 10000);
  await waitFor(page, f => { const q = HX.bar.debug.info().qte; return !q || q.st !== 'pour' || q.fill >= f; }, fill, 60000);
}
async function teaByKeys(page, cid, fill) {
  if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return c && c.st === 'order'; }, cid, 120000)) return null;
  const c = cust(await info(page), cid);
  await walkKeys(page, c.sitX);
  await page.keyboard.down('Space');
  await holdUntilFill(page, fill);
  await page.keyboard.up('Space');
  if (fill > 0.5) await page.screenshot({ path: path.join(SHOTS, 'tea-' + page.viewportSize().width + '.png') });
  await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'tea' && e.cid === id), cid, 20000);
  return { ev: (await info(page)).events.filter(e => e.type === 'tea' && e.cid === cid)[0] };
}
async function teaByTaps(page, cid, fill) {
  if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return c && c.st === 'order'; }, cid, 120000)) return null;
  const c = cust(await info(page), cid);
  await tapRoom(page, c.sitX, c.sitY - 40);
  if (!await waitFor(page, () => { const q = HX.bar.debug.info().qte; return q && q.st === 'ready'; }, null, 15000)) return null;
  const p = await page.evaluate(() => HX.bar.debug.toClient(500, 300));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await holdUntilFill(page, fill);
  await page.mouse.up();
  if (fill > 0.5) await page.screenshot({ path: path.join(SHOTS, 'tea-' + page.viewportSize().width + '.png') });
  await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'tea' && e.cid === id), cid, 20000);
  return { ev: (await info(page)).events.filter(e => e.type === 'tea' && e.cid === cid)[0] };
}
// Khách do bộ kiểm gọi vào: chờ tới khi có ghế trống (khách tự vào vẫn đang ngồi) rồi mới gọi.
async function spawnFree(page, o) {
  const ok = await waitFor(page, o => HX.bar.debug.info().customers.filter(c => c.st !== 'leave' && (!o.seat || c.seat === o.seat)).length <
    (o.seat ? 1 : HX.bar.debug.info().seats.length), o, 60000);
  return ok ? page.evaluate(o => HX.bar.debug.spawn(o), o) : null;
}
function payOf(I, cid) { return I.events.filter(e => e.type === 'pay' && e.cid === cid)[0] || null; }
async function waitPay(page, cid, ms) {
  return waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'pay' && e.cid === id), cid, ms || 20000);
}

// Kiểm tư thế mọi khách đang có trong quán ở một khung hình.
function seatingOk(I) {
  const bad = [];
  I.customers.forEach(c => {
    if (I.seats.indexOf(c.seat) < 0) bad.push(c.who + ' ngồi ghế đóng ' + c.seat);
    const seated = ['sit', 'menu', 'order', 'angry', 'eat', 'like', 'pay'].indexOf(c.st) >= 0;
    if (seated && (Math.abs(c.x - c.sitX) > 0.01 || Math.abs(c.y - c.sitY) > 0.01)) bad.push(c.who + ' lệch ghế ' + c.x + ',' + c.y);
    if (seated && c.front && c.anim.indexOf('back_') !== 0) bad.push(c.who + ' ghế đẩu mà không quay lưng: ' + c.anim);
    if (seated && !c.front && c.anim.indexOf('back_') === 0) bad.push(c.who + ' bàn sau mà quay lưng');
    if (c.front && Math.abs(c.z - 160.1) > 0.1) bad.push(c.who + ' ghế đẩu sai lớp ' + c.z);
    if (!c.front && Math.abs(c.z + 1.9) > 0.1) bad.push(c.who + ' bàn sau sai lớp ' + c.z);
  });
  return bad;
}

async function kitchen(page, base, tag) {
  await page.goto(base + '/games/ho-xanh/index.html?fresh=1&phase=kitchen');
  check(tag + ' ?phase=kitchen vào bếp', await phaseIs(page, 'kitchen'));
  const ready = await waitFor(page, () => HX.bar && HX.bar.debug.ready(), null, 60000);
  check(tag + ' nạp xong hình / bố cục / hạt của quán', ready);
  const rows = await page.$$eval('.bk .br-row', r => r.map(e => ({ id: e.dataset.id, name: e.querySelector('b').textContent, on: e.classList.contains('on') })));
  check(tag + ' tủ cá bày đủ 3 loài, tên món tiếng Việt', rows.length === 3 && rows.every(r => NAME[r.id] === r.name), JSON.stringify(rows));
  check(tag + ' thực đơn tự điền cả 3 món (≤ 5 ô)', rows.every(r => r.on) && (await page.$$('.bk-cell.on')).length === 3 && (await page.$$('.bk-cell')).length === 5);
  const txt = await page.$eval('.bk-cells', e => e.textContent);
  check(tag + ' ô thực đơn ghi giá gốc [DtD] 18 / 15 / 2', /18/.test(txt) && /15/.test(txt) && /2/.test(txt));
  // bỏ rồi thêm lại cá hề bằng cách bấm dòng trong tủ
  await page.click('.bk .br-row[data-id="ClownFish"]');
  const n1 = (await page.$$('.bk-cell.on')).length;
  await page.click('.bk .br-row[data-id="ClownFish"]');
  const n2 = (await page.$$('.bk-cell.on')).length;
  check(tag + ' bấm món trong tủ thì bỏ / thêm khỏi thực đơn', n1 === 2 && n2 === 3, n1 + ' → ' + n2);
  // khói nấu của Bancho: đủ lớp hạt gốc, gồm lớp mesh hơi nước (shader flow dựng lại)
  const smoke = await waitFor(page, () => { const w = HX.bar.debug.fx().world; return w.some(e => e.flow && e.parts > 0) && w.some(e => e.tex === 'E_Smoke_03A' && e.parts > 0); }, null, 10000);
  check(tag + ' khói nấu của Bancho có lớp khói E_Smoke_03A và lớp mesh hơi nước (flow)', smoke, JSON.stringify(await page.evaluate(() => HX.bar.debug.fx().world.map(e => e.tex + ':' + e.parts + (e.flow ? ':flow' : '')))));
  const bancho = await page.evaluate(() => HX.game.phase === 'kitchen');
  await sleep(1200);
  await shot(page, 'kitchen-' + tag);
  const over = await page.evaluate(() => {
    const o = [];
    document.querySelectorAll('#scr-kitchen .bk-name span, #scr-kitchen .br-txt b, #scr-kitchen .bx-btn').forEach(e => { if (e.scrollWidth > e.clientWidth + 1) o.push(e.textContent); });
    const b = document.getElementById('kitchen-open').getBoundingClientRect();
    if (b.bottom > innerHeight || b.right > innerWidth) o.push('nút Mở quán ra ngoài màn hình');
    return o;
  });
  check(tag + ' chữ trong bếp không tràn, nút "Mở quán" nằm trong màn hình', bancho && !over.length, over.join(' | '));
  check(tag + ' nút mở quán ghi đúng "Mở quán"', (await page.$eval('#kitchen-open', e => e.textContent)) === 'Mở quán');
}

// =====================================================================================
async function keyboardNight(browser, base) {
  out.push('\n[1280×720 · bàn phím]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  await kitchen(page, base, '1280');
  await page.evaluate(() => HX.bar.debug.seed(11));
  await press(page, 'KeyE');
  check('bếp: phím E mở quán (Sushi_OpenConfirm gốc), sang pha bar', await phaseIs(page, 'bar'));
  let I = await info(page);
  check('quán mở 3 ghế theo HX_META.stat(seats) cấp 0, gần bếp trước', JSON.stringify(I.seats) === '["Seat_08","Seat_09","Seat_10"]', JSON.stringify(I.seats));
  check('thực đơn tối nay 16 suất: cá mú 5, cá bò 5, cá hề 3 con × 2', I.menu.map(m => m.id + ':' + m.servings).join(',') === 'Coral_Trout:5,Titan_Triggerfish:5,ClownFish:6', I.menu.map(m => m.id + ':' + m.servings).join(','));

  // khách tự vào
  const arrived = await waitFor(page, () => HX.bar.debug.info().customers.some(c => c.st === 'order'), null, 20000);
  I = await info(page);
  const first = I.customers.filter(c => c.st === 'order')[0];
  check('khách tự vào từ cửa trái, ngồi vào ghế đang mở và gọi món', arrived && I.seats.indexOf(first.seat) >= 0, first && (first.who + ' ở ' + first.seat + ' gọi ' + first.order));
  // câu nói gốc lúc chờ món (CustomerToastTalk, dịch tiếng Việt), hiện sau PreDelay
  const said = await waitFor(page, () => HX.bar.debug.info().customers.some(c => c.talk && c.talk.kind === 'waiting'), null, 8000);
  const talkNow = (await info(page)).customers.filter(c => c.talk).map(c => c.talk.text);
  check('khách gọi món xong thì nói câu lúc chờ (tiếng Việt)', said && talkNow.length > 0 && talkNow.every(t => !/[’]|please|nice|good/i.test(t)), JSON.stringify(talkNow));
  let bad = seatingOk(I);
  check('khách ngồi đúng chỗ ngồi gốc, ghế đẩu quay lưng (back_*), đúng lớp vẽ', !bad.length, bad.join(' | '));
  await page.evaluate(() => HX.bar.debug.holdSpawns(true));

  // phục vụ khách đầu (món gì cũng được) bằng phím
  let r = first.order === 'tea' ? 'tea' : await serveByKeys(page, first.id);
  if (r === 'tea') { const t = await teaByKeys(page, first.id, 0.93); r = t && t.ev ? 'ok' : 'rót trà hỏng'; }
  check('A/D đi tới quầy Bancho, E bưng món, tới ghế khách E đưa món', r === 'ok', r);
  await shot(page, 'serving-1280');
  I = await info(page);
  const fe = I.events.filter(e => e.type === 'serve' && e.cid === first.id)[0] || I.events.filter(e => e.type === 'teaStart' && e.cid === first.id)[0];
  check('khách nhận món thì chuyển sang ăn (anim eat / back_eat)', !!fe && (cust(I, first.id) || {}).anim.indexOf('eat') >= 0 || first.order === 'tea', (cust(I, first.id) || {}).anim);

  // khách thứ hai gọi đúng cá mú chấm: tiền món phải đúng 18 vàng [DtD]
  const c2 = await spawnFree(page, { dish: 'Coral_Trout', tea: false });
  const d0 = (await info(page)).dishes;
  r = await serveByKeys(page, c2);
  check('phục vụ khách gọi Sushi cá mú chấm bằng phím', r === 'ok', r);
  // lúc cả hai đang ăn: chụp cảnh quán giữa ca
  await sleep(600);
  await shot(page, 'bar-1280');
  bad = seatingOk(await info(page));
  check('giữa ca: mọi khách vẫn ngồi đúng ghế, không lơ lửng', !bad.length, bad.join(' | '));
  const paid = await waitPay(page, c2, 20000);
  // hạt GoldPop chạy simulationSpeed 4 nên chỉ sống ~0,5 s: chờ thấy hạt thay vì lấy mẫu một lần
  const fxSeen = await waitFor(page, () => { const f = HX.bar.debug.info().fx; return f.ui + f.screen > 0; }, null, 10000);
  await sleep(150);
  await shot(page, 'coinfly-1280');
  I = await info(page);
  const p2 = payOf(I, c2);
  const tipWant = p2 ? Math.round(18 * 0.5 * p2.patience) : null;
  const dishPays = I.events.filter(e => e.type === 'pay' && e.kind === 'dish');
  check('ăn xong thì trả tiền: món 18 vàng đúng giá gốc, tip = 18 × 0,5 × phần kiên nhẫn còn lại; tiền món = tổng các lần trả',
    paid && p2.price === 18 && p2.tip === tipWant && I.dishes === dishPays.reduce((a, e) => a + e.price, 0) && I.dishes - d0 >= 18,
    p2 && JSON.stringify({ price: p2.price, tip: p2.tip, want: tipWant, dishes: I.dishes, pays: dishPays.map(e => e.dish + ':' + e.price) }));
  check('lúc trả tiền có hạt gốc bay (GoldPop / Money / CoinAbsorb)', fxSeen, JSON.stringify(I.fx));
  // đọc HUD và sổ trong cùng một khung, ngay khung ô vàng đã đuổi kịp (khách khác có thể trả tiền ngay sau đó)
  const hud = await page.waitForFunction(() => {
    const I = HX.bar.debug.info(), h = { shown: I.shownGold, want: I.gold0 + I.credited, text: +document.querySelector('.bb-gold b').textContent };
    return I.credited > 0 && h.shown >= h.want ? h : false;
  }, null, { timeout: 60000, polling: 'raf' }).then(r => r.jsonValue(), () => page.evaluate(() => { const I = HX.bar.debug.info(); return { shown: I.shownGold, want: I.gold0 + I.credited, text: +document.querySelector('.bb-gold b').textContent }; }));
  check('ô vàng trên HUD cộng dần tới đúng số đã thu', hud.shown === hud.want && hud.text === Math.floor(hud.shown), JSON.stringify(hud));

  // trà: rót khéo (giữ ~95 % thời gian rót đầy) và rót hỏng (giữ 0,3 s)
  const teaA = await spawnFree(page, { tea: true, seat: 'Seat_09' });
  const tA = await teaByKeys(page, teaA, 0.93);
  const teaB = await spawnFree(page, { tea: true, seat: 'Seat_10' });
  const tB = await teaByKeys(page, teaB, 0.2);
  check('giữ Space rót gần đầy vòng thì trà "perfect"', tA && tA.ev && tA.ev.grade === 'perfect', tA && JSON.stringify(tA.ev));
  check('thả sớm thì trà "bad"', tB && tB.ev && tB.ev.grade === 'bad', tB && JSON.stringify(tB.ev));
  await waitPay(page, teaA, 120000); await waitPay(page, teaB, 120000);
  I = await info(page);
  const pa = payOf(I, teaA), pb = payOf(I, teaB);
  check('trà perfect trả nhiều hơn trà bad (giá trà HX_META cấp 0 = 10)', pa && pb && pa.price + pa.tip > pb.price + pb.tip && pa.price === 10 && pb.price === 5,
    pa && pb && ('perfect ' + (pa.price + pa.tip) + ' · bad ' + (pb.price + pb.tip)));

  // khách bị bỏ rơi: tăng tốc thời gian, không phục vụ
  await waitFor(page, () => HX.bar.debug.info().customers.filter(c => c.seat === 'Seat_09' || c.seat === 'Seat_10').length === 0, null, 20000);
  const ig = await spawnFree(page, { dish: 'ClownFish', tea: false, seat: 'Seat_10' });
  await walkKeys(page, 300);
  await page.evaluate(() => HX.bar.debug.timeScale(6));
  const angry = await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return c && c.st === 'angry'; }, ig, 120000);
  I = await info(page);
  check('chờ quá MaxServingWaitTime [DtD 25 s] thì khách giận (anim back_anger, bong bóng giận)', angry && (cust(I, ig) || {}).anim === 'back_anger', (cust(I, ig) || {}).anim);
  const left = await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'angry' && e.cid === id), ig, 120000);
  await page.evaluate(() => HX.bar.debug.timeScale(1));
  I = await info(page);
  const cl = I.menu.filter(m => m.id === 'ClownFish')[0];
  const stillWaiting = I.customers.filter(c => (c.st === 'order' || c.st === 'angry') && c.order === 'ClownFish').length;
  check('giận quá MaxEndureAngerTime thì bỏ về, suất cá hề trả lại thực đơn', left && (!cust(I, ig) || cust(I, ig).st === 'leave') && cl.pending === stillWaiting,
    JSON.stringify({ angry: I.angry, clown: cl, stillWaiting }));

  // tổng kết: đóng quán sớm
  await waitFor(page, () => HX.bar.debug.info().customers.every(c => c.st === 'leave' || c.st === 'pay'), null, 120000);
  I = await info(page);
  const want = I.dishes + I.tips + I.tea;
  const sold = {};
  I.menu.forEach(m => { sold[m.id] = m.sold; });
  check('nút "Đóng quán" có mặt', (await page.$eval('#bar-close', e => e.textContent)) === 'Đóng quán');
  // đoạn tăng tốc ×6 ở trên tiêu giờ game theo giờ thật: máy nặng thì ca có thể đã hết và quán tự đóng trước khi kịp bấm
  if ((await page.evaluate(() => HX_DEBUG.info().phase)) === 'bar') await page.click('#bar-close');
  else out.push('    (ca đã hết giờ và quán tự đóng trước khi bấm "Đóng quán")');
  check('Đóng quán thì sang sổ cuối ngày', await phaseIs(page, 'ledger'));
  const S = await save(page);
  const earned = +(await page.$eval('.br-ledger', e => e.dataset.earned));
  const fr = {};
  Object.keys(FRIDGE0).forEach(id => { const left = FRIDGE0[id] - Math.min(FRIDGE0[id], Math.ceil((sold[id] || 0) / PER[id])); if (left > 0) fr[id] = left; });
  check('sổ cộng đúng một lần: vàng = tổng thu, ngày 2, về prep', earned === want && S.gold === want && S.day === 2 && S.stage === 'prep' && S.stats.earned === want,
    JSON.stringify({ earned, want, gold: S.gold, day: S.day, stage: S.stage }));
  check('tủ bớt đúng số cá đã mổ (ceil(suất bán / suất mỗi con))', JSON.stringify(S.fridge) === JSON.stringify(fr), JSON.stringify(S.fridge) + ' ≠? ' + JSON.stringify(fr) + ' bán ' + JSON.stringify(sold));
  await sleep(4300);
  await shot(page, 'ledger-1280');
  const lov = await page.evaluate(() => {
    const o = [];
    document.querySelectorAll('#scr-ledger .bl-paper').forEach(p => { const r = p.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) o.push('giấy ra ngoài màn hình'); });
    document.querySelectorAll('#scr-ledger .bl-kv span, #scr-ledger .br-ledger span').forEach(e => { if (e.scrollWidth > e.clientWidth + 1) o.push('tràn: ' + e.textContent); });
    return o;
  });
  check('sổ cuối ngày nằm gọn trong màn hình, chữ không tràn', !lov.length, lov.join(' | '));
  const art = await page.evaluate(() => ({
    curtain: /SushiBar_EndCurtain/.test(document.querySelector('.bl-dummy').style.backgroundImage),
    alarm: /Night_AlarmBox/.test(document.querySelector('.bl-abox').style.borderImage),
    band: getComputedStyle(document.querySelector('.bl-result')).display !== 'none' && /Account_ResultBg/.test(document.querySelector('.bl-result').style.backgroundImage),
    bancho: !!document.querySelector('.bl-barea .bl-react'),
  }));
  check('sổ dùng ảnh gốc: rèm EndCurtain, hộp Night_AlarmBox, dải ResultBg có Bancho', art.curtain && art.alarm && art.band && art.bancho, JSON.stringify(art));
  check('nút sổ ghi "Sang ngày 2"', (await page.$eval('#ledger-next', e => e.textContent)) === 'Sang ngày 2');
  await page.click('#ledger-next');
  check('bấm "Sang ngày 2" về màn chuẩn bị', await phaseIs(page, 'prep'));
  // tải lại: sổ không đổi
  await page.goto('about:blank');
  await page.goto(base + '/games/ho-xanh/index.html');
  await phaseIs(page, 'title');
  const S2 = await save(page);
  check('tải lại trang sau sổ: vàng và ngày giữ nguyên, không cộng hai lần', S2.gold === want && S2.day === 2 && JSON.stringify(S2.fridge) === JSON.stringify(fr), JSON.stringify({ gold: S2.gold, day: S2.day }));
  check('1280: không lỗi trang / console / tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

// =====================================================================================
async function tapNight(browser, base) {
  out.push('\n[844×390 · chạm]');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = watch(page);
  await kitchen(page, base, '844');
  await page.evaluate(() => HX.bar.debug.seed(5));
  const b = await (await page.$('#kitchen-open')).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  check('chạm "Mở quán" sang pha bar', await phaseIs(page, 'bar'));
  await waitFor(page, () => HX.bar.debug.info().customers.some(c => c.st === 'order'), null, 20000);
  let I = await info(page);
  const first = I.customers.filter(c => c.st === 'order')[0];
  let r;
  if (first.order === 'tea') { const t = await teaByTaps(page, first.id, 0.93); r = t && t.ev ? 'ok' : 'rót trà hỏng'; }
  else r = await serveByTaps(page, first.id);
  check('chạm ô món xong → Dave bưng; chạm khách → Dave đi tới đưa món', r === 'ok', r);
  await shot(page, 'serving-844');
  await page.evaluate(() => HX.bar.debug.holdSpawns(true));
  const c2 = await spawnFree(page, { dish: 'Titan_Triggerfish', tea: false });
  r = await serveByTaps(page, c2);
  check('chạm phục vụ khách gọi Sushi cá bò titan', r === 'ok', r);
  await sleep(500);
  await shot(page, 'bar-844');
  const bad = seatingOk(await info(page));
  check('844: mọi khách ngồi đúng ghế đang mở, ghế đẩu quay lưng', !bad.length, bad.join(' | '));
  const paid = await waitPay(page, c2, 20000);
  await sleep(250);
  await shot(page, 'coinfly-844');
  I = await info(page);
  const p2 = payOf(I, c2);
  check('Sushi cá bò titan trả đúng 15 vàng [DtD]', paid && p2.price === 15, p2 && JSON.stringify(p2));
  // chạm rót trà: giữ ngón (chuột) gần đầy
  await waitFor(page, () => HX.bar.debug.info().customers.filter(c => c.st !== 'leave').length < 3, null, 20000);
  const tA = await spawnFree(page, { tea: true });
  const t = await teaByTaps(page, tA, 0.93);
  check('chạm khách gọi trà, giữ rồi thả gần đầy vòng → perfect', t && t.ev && t.ev.grade === 'perfect', t && JSON.stringify(t.ev));
  await waitPay(page, tA, 120000);
  // hết giờ: không nhận khách mới, khách về hết thì tự sang sổ
  await page.evaluate(() => { HX.bar.debug.endTime(); HX.bar.debug.timeScale(4); });
  const auto = await phaseIs(page, 'ledger', 60000);
  check('hết giờ mở quán, khách về hết thì tự sang sổ cuối ngày', auto);
  const S = await save(page);
  const earned = +(await page.$eval('.br-ledger', e => e.dataset.earned));
  check('844: sổ cộng đúng tổng thu, sang ngày 2', S.gold === earned && earned > 0 && S.day === 2, JSON.stringify({ gold: S.gold, earned, day: S.day }));
  await sleep(4300);
  await shot(page, 'ledger-844');
  const lov = await page.evaluate(() => {
    const o = [];
    document.querySelectorAll('#scr-ledger .bl-paper, #ledger-next').forEach(p => { const r = p.getBoundingClientRect(); if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) o.push(p.className || p.id); });
    return o;
  });
  check('844: sổ và nút nằm gọn trong màn hình', !lov.length, lov.join(' | '));
  // tải lại ngay trên màn sổ: không cộng thêm
  // địa chỉ còn ?phase=kitchen: tải lại bằng trang gốc để đi qua màn đầu như người chơi
  await page.goto('about:blank');
  await page.goto(base + '/games/ho-xanh/index.html');
  check('tải lại thì về màn đầu', await phaseIs(page, 'title'));
  const S2 = await save(page);
  check('tải lại ngay trên màn sổ: vàng không đổi', S2.gold === S.gold && S2.day === 2, S2.gold + ' / ' + S.gold);
  check('844: không lỗi trang / console / tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// =====================================================================================
// Cả một đêm chỉ bằng nút Android (SushiBarTouchCanvas): cần nổi ở nửa trái để đi, nút 交互 bưng / phục vụ / giữ để rót trà,
// nút 倒菜 giữ 1,5 s để đổ món, công tắc 加速 để chạy. Ngón tay gửi qua CDP như test/ho-xanh-touch.js.
async function buttonNight(browser, base) {
  out.push('\n[844×390 cảm ứng · chỉ nút trên màn hình]');
  const W = 844, H = 390, u = W / 2340;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watch(page);
  const cdp = await ctx.newCDPSession(page);
  const fingers = new Map();
  const pts = () => [...fingers].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const down = (x, y, id = 1) => { fingers.set(id, { x, y }); return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts() }); };
  const move = (x, y, id = 1) => { fingers.set(id, { x, y }); return cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts() }); };
  const up = (id = 1) => { fingers.delete(id); return cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts() }); };
  const box = id => page.evaluate(i => { const e = document.getElementById(i), r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, shown: r.width > 0 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 }; }, id);
  const tapBtn = async (id, ms = 60) => { const b = await box(id); await down(b.x, b.y, 2); await sleep(ms); await up(2); await sleep(60); return b; };

  await page.goto(base + '/games/ho-xanh/index.html?fresh=1&phase=kitchen');
  await phaseIs(page, 'kitchen');
  await waitFor(page, () => HX.bar && HX.bar.debug.ready(), null, 60000);
  await page.evaluate(() => HX.bar.debug.seed(7));
  await tapBtn('kitchen-open');
  check('844 chạm: nút Mở quán sang pha bar', await phaseIs(page, 'bar'));
  await waitFor(page, () => HX.bar.debug.info().t > 0.5, null, 120000);

  // bố cục: tâm và cỡ lấy từ RectTransform gốc của SushiBarTouchCanvas (canvas 2340×1080, khớp bề ngang)
  const run = await box('bt-run');
  check('công tắc 加速 (步行) ở góc dưới phải: tâm cách phải 190, cách đáy 170, cỡ 195 đơn vị gốc',
    run.shown && near(run.x, W - 190 * u, 1.5) && near(run.y, H - 170 * u, 1.5) && near(run.w, 195 * u, 1.5), JSON.stringify(run));
  const hid = await page.evaluate(() => ['bt-interact', 'bt-trash'].map(i => getComputedStyle(document.getElementById(i)).visibility));
  check('đầu ca chưa có việc: nút 交互 và 倒菜 ẩn như prefab (alpha 0 / tắt sẵn)', hid.join() === 'hidden,hidden', hid.join());
  check('máy cảm ứng: không vẽ phím PC trên nút quán', await page.evaluate(() => [...document.querySelectorAll('.bt img.kg')].every(i => getComputedStyle(i).display === 'none')));

  // đi bằng cần nổi: kéo từ nửa trái màn tới khi Dave tới gần x rồi thả
  const sx = W * 0.2, sy = H * 0.7;
  // Thả cần mất vài khung (CDP qua lại); máy nặng thì mỗi khung Dave đi tới 9 px nên dừng quá đích.
  // Gần tới nơi thì chạy đồng hồ game chậm lại (HX.bar.debug.timeScale) để lần dừng rơi vào tầm với, rồi trả về 1.
  async function walkStick(x) {
    const reach = (await page.evaluate(() => HX.bar.T)).reach;
    let slow = false;
    for (let k = 0; k < 6; k++) {
      const I = await info(page);
      if (Math.abs(I.dave.x - x) <= reach / 2) break;
      if (!slow && Math.abs(I.dave.x - x) < 100) { slow = true; await page.evaluate(() => HX.bar.debug.timeScale(0.2)); }
      const dir = x > I.dave.x ? 1 : -1;
      await down(sx, sy);
      await move(sx + dir * 10, sy); await move(sx + dir * 30, sy); await move(sx + dir * 70, sy);
      await waitFor(page, a => { const dx = HX.bar.debug.info().dave.x; return Math.abs(dx - a.x) <= (a.slow ? 8 : 100) || (a.dir > 0 ? dx >= a.x : dx <= a.x); }, { x, dir, slow }, 90000);
      await up();
      await sleep(60);
    }
    if (slow) await page.evaluate(() => HX.bar.debug.timeScale(1));
    return Math.abs((await info(page)).dave.x - x) <= reach / 2;
  }
  const x0 = (await info(page)).dave.x;
  await down(sx, sy); await move(sx + 20, sy); await move(sx + 60, sy);
  await sleep(120);
  const st = await box('bt-stick');
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, 'buttons-stick-844.png') });
  await up();
  const x1 = (await info(page)).dave.x;
  check('kéo trong nửa trái: cần hiện ở chỗ chạm, Dave đi sang phải', st.shown && near(st.x, sx, 2) && x1 - x0 > 30, 'cần ' + JSON.stringify(st) + ', Dave ' + x0.toFixed(0) + ' → ' + x1.toFixed(0));
  check('thả tay: cần ẩn', !(await box('bt-stick')).shown);

  // chạy: bật công tắc thì đi nhanh hơn T.runK lần
  const T = await page.evaluate(() => HX.bar.T);
  async function speedOver(ms) {
    await down(sx, sy); await move(sx - 20, sy); await move(sx - 70, sy);
    await sleep(100);
    const a = await info(page);
    await sleep(ms);
    const b = await info(page);
    await up(); await sleep(60);
    return (a.dave.x - b.dave.x) / Math.max(1e-3, b.t - a.t);
  }
  await walkStick(700);
  const vWalk = await speedOver(500);
  await tapBtn('bt-run');
  await walkStick(700);
  const vRun = await speedOver(500);
  const runOn = await page.evaluate(() => document.getElementById('bt-run').classList.contains('on'));
  await tapBtn('bt-run');
  check('chạm 加速: công tắc sáng (奔跑), Dave chạy nhanh hơn đi', runOn && vRun > vWalk * 1.3, 'đi ' + vWalk.toFixed(0) + ' px/s, chạy ' + vRun.toFixed(0) + ' px/s, T.runK ' + T.runK);

  await page.evaluate(() => HX.bar.debug.holdSpawns(true));
  const spawned = [];
  let served = 0, teaOk = false, teaEv = null;
  const fails = [];
  // phục vụ một khách tới khi xong, chỉ bằng cần + nút 交互 (trà: giữ nút)
  async function handle(cid) {
    if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return !c || c.st === 'order'; }, cid, 120000)) return 'không gọi món';
    let I = await info(page), c = cust(I, cid);
    if (!c) return 'khách bỏ đi';
    if (c.order === 'tea') {
      await walkStick(c.sitX);
      if (!await waitFor(page, () => document.getElementById('bt-interact').classList.contains('on'), null, 20000)) return 'trà: nút 交互 không hiện';
      const b = await box('bt-interact');
      await down(b.x, b.y, 3);
      await holdUntilFill(page, 0.93);
      await up(3);
      await page.screenshot({ path: path.join(SHOTS, 'buttons-tea-844.png') });
      await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'tea' && e.cid === id), cid, 20000);
      const ev = (await info(page)).events.filter(e => e.type === 'tea' && e.cid === cid)[0];
      teaOk = teaOk || (!!ev && ev.grade !== 'bad');
      teaEv = ev || teaEv;
      await waitFor(page, () => !HX.bar.debug.info().qte, null, 20000);
      return 'ok';
    }
    if (I.dave.carry.indexOf(c.order) < 0) {
      if (!await waitFor(page, d => HX.bar.debug.info().plates.some(p => p.dish === d && p.st === 'ready'), c.order, 120000)) return 'món không ra lò ' + c.order;
      await walkStick(I.passX);
      if (!await waitFor(page, () => document.getElementById('bt-interact').classList.contains('on'), null, 20000)) return 'ở quầy Bancho mà nút 交互 không hiện';
      await tapBtn('bt-interact');
      I = await info(page);
      if (I.dave.carry.indexOf(c.order) < 0) return 'chạm 交互 ở quầy mà không bưng ' + c.order;
    }
    await walkStick(c.sitX);
    if (!await waitFor(page, () => document.getElementById('bt-interact').classList.contains('on'), null, 20000))
      return 'cạnh khách mà nút 交互 không hiện: Dave ' + (await info(page)).dave.x.toFixed(0) + ', ghế ' + c.sitX;
    await tapBtn('bt-interact');
    if (!await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'serve' && e.cid === id), cid, 20000)) return 'chạm 交互 cạnh khách mà không phục vụ';
    served++;
    return 'ok';
  }
  // khách tự vào trước khi giữ lượt khách
  for (const c of (await info(page)).customers.filter(c => c.st !== 'leave' && c.st !== 'pay')) { const r = await handle(c.id); if (r !== 'ok' && r !== 'khách bỏ đi') fails.push(r); }
  // một khách gọi trà, hai khách gọi món: gọi từng người rồi phục vụ ngay
  for (const o of [{ tea: true }, { dish: 'Coral_Trout', tea: false }, { dish: 'Titan_Triggerfish', tea: false }]) {
    const id = await spawnFree(page, o);
    if (id == null) { fails.push('không gọi được khách ' + JSON.stringify(o)); continue; }
    spawned.push(id);
    const r = await handle(id);
    if (r !== 'ok') fails.push(r);
  }
  const I1 = await info(page);
  check('phục vụ bằng cần + nút 交互: mọi khách gọi món đều nhận món (≥ 2)', served >= 2 && !fails.length, 'phục vụ ' + served + ' ' + fails.join(' | '));
  check('giữ nút 交互 rót trà rồi thả gần đầy vòng: trà không hỏng', teaOk, JSON.stringify(teaEv) + ' khách gọi vào ' + JSON.stringify(spawned) + ' ' + JSON.stringify(I1.events.filter(e => spawned.indexOf(e.cid) >= 0).map(e => e.type + ':' + e.cid + (e.kind ? ':' + e.kind : ''))));

  // đổ món: bưng một đĩa không ai gọi rồi giữ nút 倒菜 1,5 s [DtD StaffDave.trashHoldTime]
  await page.evaluate(() => HX.bar.debug.spawn({ dish: 'ClownFish', tea: false }));
  const extra = await waitFor(page, () => HX.bar.debug.info().plates.some(p => p.st === 'ready'), null, 120000);
  if (extra) {
    await walkStick((await info(page)).passX);
    await tapBtn('bt-interact');
  }
  const carrying = (await info(page)).dave.carry.length;
  const trashShown = (await box('bt-trash')).shown;
  const tb = await box('bt-trash');
  const tt0 = (await info(page)).t;
  await down(tb.x, tb.y, 4);
  await sleep(700);
  const early = (await info(page)).dave.carry.length;
  await waitFor(page, n => HX.bar.debug.info().dave.carry.length < n, carrying, 60000);
  const tt1 = (await info(page)).t;
  await up(4);
  const after = (await info(page)).dave.carry.length;
  check('bưng đĩa thì hiện nút 倒菜; giữ 0,7 s chưa đổ, giữ ~1,5 s giờ game thì đổ một đĩa', carrying > 0 && trashShown && early === carrying && after === carrying - 1 && tt1 - tt0 >= T.trashHold - 0.1,
    'bưng ' + carrying + ', hiện ' + trashShown + ', 0,7 s còn ' + early + ', đổ sau ' + (tt1 - tt0).toFixed(2) + ' s giờ game, còn ' + after);

  // hết giờ: phục vụ nốt rồi quán tự đóng, sang sổ cuối ngày
  await page.evaluate(() => HX.bar.debug.endTime());
  for (let k = 0; k < 20 && (await info(page)).customers.some(c => c.st === 'order'); k++) {
    const I = await info(page), c = I.customers.filter(c => c.st === 'order')[0];
    if (c.order === 'tea') break;
    if (I.dave.carry.indexOf(c.order) < 0) {
      await waitFor(page, d => HX.bar.debug.info().plates.some(p => p.dish === d && p.st === 'ready'), c.order, 120000);
      await walkStick(I.passX); await tapBtn('bt-interact');
    }
    await walkStick(c.sitX); await tapBtn('bt-interact');
  }
  await page.evaluate(() => HX.bar.debug.timeScale(4));
  check('hết giờ, khách về hết thì quán tự đóng và sang sổ cuối ngày', await phaseIs(page, 'ledger', 90000));
  check('844 chỉ nút: không lỗi trang / console / tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// Máy tính: nút Android hiện kèm phím PC gốc, bấm chuột được; bàn phím vẫn chạy (Shift chạy, giữ Q đổ món).
async function pcButtons(browser, base) {
  out.push('\n[1280×720 máy tính · nút Android + phím]');
  const { page, ctx, errors } = await savedPage(browser, base, { width: 1280, height: 720 });
  await page.evaluate(() => HX.bar.debug.holdSpawns(true));
  const g = await page.evaluate(() => [...document.querySelectorAll('.bt img.kg')].map(i => ({ key: i.alt, on: i.closest('button').id, shown: getComputedStyle(i).display !== 'none' })));
  check('nút quán có ảnh phím PC: 交互 = Space, 倒菜 = Q, 加速 = Shift', JSON.stringify(g.map(x => x.on + ':' + x.key).sort()) === JSON.stringify(['bt-interact:Space', 'bt-run:Shift', 'bt-trash:Q']) && g.every(x => x.shown), JSON.stringify(g));
  const T = await page.evaluate(() => HX.bar.T);
  async function speed(shift) {
    await walkKeys(page, 700);
    if (shift) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyA');
    await sleep(100);
    const a = await info(page); await sleep(500); const b = await info(page);
    await page.keyboard.up('KeyA');
    if (shift) await page.keyboard.up('ShiftLeft');
    return (a.dave.x - b.dave.x) / Math.max(1e-3, b.t - a.t);
  }
  const vw = await speed(false), vr = await speed(true);
  check('giữ Shift thì Dave chạy (Sushi_Dash gốc = Shift trái)', vr > vw * 1.3, 'đi ' + vw.toFixed(0) + ', chạy ' + vr.toFixed(0));
  // chuột: bấm công tắc 加速 thì bật chạy
  await page.click('#bt-run');
  const on = await page.evaluate(() => document.getElementById('bt-run').classList.contains('on'));
  await page.click('#bt-run');
  check('bấm chuột vào công tắc 加速: bật / tắt', on && !(await page.evaluate(() => document.getElementById('bt-run').classList.contains('on'))));
  // bấm chuột một lần ở nửa trái (không kéo) vẫn là đi tới chỗ bấm, cần không hiện
  const p = await page.evaluate(() => HX.bar.debug.toClient(300, 470));
  await page.mouse.click(p.x, p.y);
  await waitFor(page, () => Math.abs(HX.bar.debug.info().dave.x - 300) < 4, null, 8000);
  check('chuột bấm nửa trái không kéo: Dave đi tới chỗ bấm, cần không hiện', Math.abs((await info(page)).dave.x - 300) < 4 && await page.evaluate(() => document.getElementById('bt-stick').hidden));
  // giữ Q đổ món: 0,7 s chưa đổ, 1,6 s thì đổ
  await page.evaluate(() => HX.bar.debug.spawn({ dish: 'ClownFish', tea: false }));
  await waitFor(page, () => HX.bar.debug.info().plates.some(p => p.st === 'ready'), null, 120000);
  await walkKeys(page, (await info(page)).passX);
  await press(page, 'Space');
  const n0 = (await info(page)).dave.carry.length;
  const q0 = (await info(page)).t;
  await page.keyboard.down('KeyQ');
  await sleep(700);
  const n1 = (await info(page)).dave.carry.length;
  await waitFor(page, n => HX.bar.debug.info().dave.carry.length < n, n0, 60000);
  const q1 = (await info(page)).t;
  await page.keyboard.up('KeyQ');
  const n2 = (await info(page)).dave.carry.length;
  await shot(page, 'buttons-1280');
  check('giữ Q ~1,5 s giờ game thì đổ một đĩa (StaffDave.trashHoldTime gốc)', n0 > 0 && n1 === n0 && n2 === n0 - 1 && q1 - q0 >= T.trashHold - 0.1, n0 + ' → ' + n1 + ' → ' + n2 + ' sau ' + (q1 - q0).toFixed(2) + ' s');
  check('1280 nút: không lỗi trang', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Sổ dàn sẵn: cấp trang trí `decor`, ghế cấp `seats`, tủ cá như ?phase=kitchen. Ghi trước khi trang chạy.
async function savedPage(browser, base, size, bar, touch) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: !!touch });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.addInitScript(b => {
    localStorage.setItem('hx.save.v1', JSON.stringify({ v: 1, day: 3, stage: 'bar', gold: 0, bar: b, fridge: { ClownFish: 3, Coral_Trout: 1, Titan_Triggerfish: 1 } }));
  }, Object.assign({ seats: 0, chef: 0, decor: 0, tea: 0 }, bar));
  await page.goto(base + '/games/ho-xanh/index.html?phase=bar');
  await phaseIs(page, 'bar');
  await waitFor(page, () => HX.bar.debug.ready() && HX.bar.debug.info().t > 0.5, null, 60000);
  return { page, ctx, errors };
}

// Khách đi vào (sang phải) và đi ra (sang trái) phải quay mặt theo hướng đi; ca bán đúng 90 giây [DtD EveningHours].
async function facingAndShift(browser, base) {
  out.push('\n[khách quay mặt theo hướng đi · độ dài ca]');
  const { page, ctx, errors } = await savedPage(browser, base, { width: 1280, height: 720 });
  const T = await page.evaluate(() => HX.bar.T);
  check('ca bán dài 90 giây (GameConstValue.EveningHours gốc)', T.night === 90, 'T.night = ' + T.night);
  await page.evaluate(() => HX.bar.debug.seed(3));
  // mỗi khung hình: khách nào vừa dời x thì hướng đi = dấu của dx; sheet khách vẽ quay mặt sang phải nên đi sang trái mới lật
  await page.evaluate(() => {
    const F = window.__face = { steps: { in: 0, out: 0 }, bad: [], shot: null }, prev = {};
    (function tick() {
      const I = HX.bar.debug.info();
      if (I) I.customers.forEach(c => {
        const p = prev[c.id];
        if (p != null && Math.abs(c.x - p) > 1e-6) {
          const dir = Math.sign(c.x - p);
          F.steps[dir > 0 ? 'in' : 'out']++;
          if (c.flip !== (dir < 0)) F.bad.push(c.who + ' ' + c.st + ' đi ' + (dir > 0 ? 'phải' : 'trái') + ' mà flip=' + c.flip);
        }
        prev[c.id] = c.x;
      });
      if (!I || !I.over) requestAnimationFrame(tick);
    })();
  });
  // ảnh giữa lúc đi: một khách đang vào quán, còn cách ghế ≥ 60 px
  const walking = await waitFor(page, () => HX.bar.debug.info().customers.some(c => c.st === 'enter' && c.x > 120 && c.sitX - c.x > 60), null, 20000);
  await shot(page, 'walk-in-1280');
  // không phục vụ ai: khách chờ, giận, bỏ về (đi ra). Tăng tốc cho hết ca.
  await page.evaluate(() => HX.bar.debug.timeScale(3));
  const leaving = await waitFor(page, () => HX.bar.debug.info().customers.some(c => c.st === 'leave' && c.x > 120 && c.x < 700 && c.anim === 'walk'), null, 60000);
  await page.evaluate(() => HX.bar.debug.timeScale(1));
  await shot(page, 'walk-out-1280');
  await page.evaluate(() => HX.bar.debug.timeScale(3));
  // đọc giờ ca ngay trong khung đầu tiên quầy đóng (đọc sau đó thì giờ ca đã chạy thêm theo độ trễ của máy)
  const tClose = await page.waitForFunction(() => { const I = HX.bar.debug.info(); return I.open ? false : I.t; }, null, { timeout: 120000, polling: 'raf' })
    .then(r => r.jsonValue(), () => null);
  const closed = tClose != null;
  check('quầy đóng ngay khi hết 90 giây (không nhận khách mới)', closed && tClose >= 90 && tClose < 90.2, 't = ' + tClose);
  await phaseIs(page, 'ledger', 60000);
  const F = await page.evaluate(() => window.__face);
  check('khách đi vào quay mặt sang phải, đi ra quay mặt sang trái (so flip với hướng x mỗi khung, cả ca)',
    walking && leaving && F.steps.in > 50 && F.steps.out > 50 && F.bad.length === 0,
    JSON.stringify({ steps: F.steps, bad: F.bad.slice(0, 4) }));
  check('không lỗi trang (ca quay mặt)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Cấp trang trí: quán mới là quán cũ gốc (spawner khoá 1), lên cấp thì bày đồ nội thất gốc; ghế chỉ ở chỗ ngồi đã mở; giá món nhân hệ số cấp.
async function tierLooks(browser, base) {
  out.push('\n[cấp trang trí]');
  const want = [
    { decor: 0, seats: 0, name: 'Quán cũ', price: 18, slots: { Sushi_BCSign: 'Sushi_BCSign_Lv1', Sushi_WallNeon02_01: 'Sushi_WallNeon_Lv1', Sushi_Interior_ZoneA: null, 'Sushi_Light 01': 'Sushi_Light_Lv1_01' }, chairs: 3 },
    { decor: 2, seats: 1, name: 'Góc trang trí', price: 29, slots: { Sushi_BCSign: 'Sushi_BCSign_Lv2', Sushi_Interior_ZoneA: 'Sushi_ZoneA_Bonsai_Night', Sushi_Interior_ZoneB: null, 'Sushi_Light 01': 'Sushi_Light_Lv2' }, chairs: 3 },
    { decor: 5, seats: 3, name: 'Quán sang', price: 67, slots: { Sushi_Interior_ZoneB: 'Sushi_ZoneB_StuffedTuna_Night', 'Sushi_Light 04': 'Sushi_Light_Rattan01_4', Sushi_TableFront: 'Sushi_TableFront_Lv2' }, chairs: 5 },
  ];
  for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    for (const w of want) {
      const { page, ctx, errors } = await savedPage(browser, base, size, { decor: w.decor, seats: w.seats }, size.width < 1000);
      await page.evaluate(() => HX.bar.debug.holdSpawns(true));
      await sleep(1500);
      const R = await page.evaluate(() => HX.bar.debug.room()), I = await info(page);
      const tag = size.width + ' cấp ' + w.decor;
      const slotOk = Object.keys(w.slots).every(k => R.slots[k] === w.slots[k]);
      check(tag + ' "' + w.name + '": bày đúng bản nội thất gốc của từng ô', R.name === w.name && slotOk,
        JSON.stringify(Object.keys(w.slots).map(k => k + '=' + R.slots[k])));
      const front = I.seats.filter(n => ['Seat_07', 'Seat_08', 'Seat_09', 'Seat_10', 'Seat_11', 'Seat_12', 'Seat_13', 'Seat_14'].indexOf(n) >= 0);
      check(tag + ' ghế đẩu chỉ bày ở chỗ ngồi trước quầy đã mở (' + w.chairs + ')',
        R.chairs.length === w.chairs && JSON.stringify(R.chairs.slice().sort()) === JSON.stringify(front.slice().sort()), R.chairs.join(','));
      const ct = I.menu.filter(m => m.id === 'Coral_Trout')[0];
      check(tag + ' giá bán Sushi cá mú chấm = 18 × ' + R.price + ' = ' + w.price, ct && ct.price === w.price, ct && ct.price);
      await shot(page, 'tier' + w.decor + '-' + size.width);
      check(tag + ' không lỗi trang', errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  }
}

// Tải lại giữa đêm: chưa ghi sổ, cá còn nguyên, về bếp.
async function reloadMidNight(browser, base) {
  out.push('\n[tải lại giữa đêm]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  await page.goto(base + '/games/ho-xanh/index.html?fresh=1&phase=kitchen');
  await phaseIs(page, 'kitchen');
  await waitFor(page, () => HX.bar.debug.ready(), null, 60000);
  const S0 = await save(page);
  await page.click('#kitchen-open');
  await phaseIs(page, 'bar');
  await waitFor(page, () => HX.bar.debug.info().customers.some(c => c.st === 'order'), null, 20000);
  // địa chỉ còn ?phase=kitchen: tải lại bằng trang gốc để đi qua màn đầu như người chơi
  await page.goto('about:blank');
  await page.goto(base + '/games/ho-xanh/index.html');
  check('tải lại thì về màn đầu', await phaseIs(page, 'title'));
  const S1 = await save(page);
  check('tải lại giữa đêm: sổ y nguyên (vàng, ngày, tủ cá, stage bar)', JSON.stringify(S1) === JSON.stringify(S0), JSON.stringify({ gold: S1.gold, day: S1.day, stage: S1.stage, fridge: S1.fridge }));
  const st = await page.$eval('#start', e => e.textContent);
  check('nút màn đầu dẫn về bếp để bán lại', st.indexOf('Tiếp tục') === 0, st);
  check('không lỗi trang', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    // ONLY=buttonNight,pcButtons chạy riêng vài phần
    const parts = { keyboardNight, buttonNight, pcButtons, tapNight, reloadMidNight, facingAndShift, tierLooks };
    const only = (process.env.ONLY || '').split(',').filter(Boolean);
    for (const k of Object.keys(parts)) if (!only.length || only.indexOf(k) >= 0) await parts[k](browser, base);
  } catch (e) {
    fail++; out.push('  ✘ lỗi chạy bộ kiểm: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
