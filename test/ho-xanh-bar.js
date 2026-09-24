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
  const I = await info(page);
  if (Math.abs(I.dave.x - x) <= 6) return true;
  const T = await page.evaluate(() => HX.bar.T);
  x = Math.max(T.daveMin, Math.min(T.daveMax, x));
  const dir = x > I.dave.x ? 1 : -1, key = dir > 0 ? 'KeyD' : 'KeyA';
  await page.keyboard.down(key);
  // thả phím khi tới nơi (hoặc vừa vượt qua)
  const ok = await waitFor(page, a => { const dx = HX.bar.debug.info().dave.x; return Math.abs(dx - a.x) <= 6 || (a.dir > 0 ? dx >= a.x : dx <= a.x); }, { x, dir }, 15000);
  await page.keyboard.up(key);
  return ok;
}
async function press(page, key) { await page.keyboard.down(key); await sleep(40); await page.keyboard.up(key); }
// Chờ món của khách ra lò, đi tới quầy Bancho bấm E, rồi tới ghế khách bấm E.
async function serveByKeys(page, cid) {
  let I = await info(page), c = cust(I, cid);
  if (!await waitFor(page, id => { const I = HX.bar.debug.info(), c = I.customers.filter(c => c.id === id)[0]; return !c || c.st === 'order'; }, cid, 30000)) return 'không gọi món';
  I = await info(page); c = cust(I, cid);
  if (!c || c.order === 'tea') return 'khách gọi trà';
  if (!await waitFor(page, d => HX.bar.debug.info().plates.some(p => p.dish === d && p.st === 'ready'), c.order, 30000)) return 'món không ra lò';
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
  if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return !c || c.st === 'order'; }, cid, 30000)) return 'không gọi món';
  let I = await info(page), c = cust(I, cid);
  if (!c || c.order === 'tea') return 'khách gọi trà';
  if (!await waitFor(page, d => HX.bar.debug.info().plates.some(p => p.dish === d && p.st === 'ready'), c.order, 30000)) return 'món không ra lò';
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

// Trà: tới ghế khách, giữ nút (phím hoặc chuột) `holdMs` rồi thả.
async function teaByKeys(page, cid, holdMs) {
  if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return c && c.st === 'order'; }, cid, 30000)) return null;
  const c = cust(await info(page), cid);
  await walkKeys(page, c.sitX);
  await page.keyboard.down('Space');
  await waitFor(page, () => { const q = HX.bar.debug.info().qte; return q && q.st === 'pour'; }, null, 3000);
  const t0 = Date.now();
  await sleep(Math.max(0, holdMs - 30));
  let mid = null;
  if (holdMs > 600) mid = page.screenshot({ path: path.join(SHOTS, 'tea-' + page.viewportSize().width + '.png') });
  await page.keyboard.up('Space');
  if (mid) await mid;
  await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'tea' && e.cid === id), cid, 5000);
  return { held: Date.now() - t0, ev: (await info(page)).events.filter(e => e.type === 'tea' && e.cid === cid)[0] };
}
async function teaByTaps(page, cid, holdMs) {
  if (!await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return c && c.st === 'order'; }, cid, 30000)) return null;
  const c = cust(await info(page), cid);
  await tapRoom(page, c.sitX, c.sitY - 40);
  if (!await waitFor(page, () => { const q = HX.bar.debug.info().qte; return q && q.st === 'ready'; }, null, 15000)) return null;
  const p = await page.evaluate(() => HX.bar.debug.toClient(500, 300));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await sleep(Math.max(0, holdMs - 30));
  let mid = null;
  if (holdMs > 600) mid = page.screenshot({ path: path.join(SHOTS, 'tea-' + page.viewportSize().width + '.png') });
  await page.mouse.up();
  if (mid) await mid;
  await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'tea' && e.cid === id), cid, 5000);
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
  await page.click('#kitchen-open');
  check('Mở quán thì sang pha bar', await phaseIs(page, 'bar'));
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
  if (r === 'tea') { const t = await teaByKeys(page, first.id, 1400); r = t && t.ev ? 'ok' : 'rót trà hỏng'; }
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
  const fxSeen = await waitFor(page, () => { const f = HX.bar.debug.info().fx; return f.ui + f.screen > 0; }, null, 1500);
  await sleep(150);
  await shot(page, 'coinfly-1280');
  I = await info(page);
  const p2 = payOf(I, c2);
  const tipWant = p2 ? Math.round(18 * (1 - 1 + 0.5 * p2.patience)) : null;
  const dishPays = I.events.filter(e => e.type === 'pay' && e.kind === 'dish');
  check('ăn xong thì trả tiền: món 18 vàng đúng giá gốc, tip = 18 × 0,5 × phần kiên nhẫn còn lại; tiền món = tổng các lần trả',
    paid && p2.price === 18 && p2.tip === tipWant && I.dishes === dishPays.reduce((a, e) => a + e.price, 0) && I.dishes - d0 >= 18,
    p2 && JSON.stringify({ price: p2.price, tip: p2.tip, want: tipWant, dishes: I.dishes, pays: dishPays.map(e => e.dish + ':' + e.price) }));
  check('lúc trả tiền có hạt gốc bay (GoldPop / Money / CoinAbsorb)', fxSeen, JSON.stringify(I.fx));
  await waitFor(page, () => { const I = HX.bar.debug.info(); return I.shownGold >= I.gold0 + I.credited && I.credited > 0; }, null, 5000);
  // đọc HUD và sổ trong cùng một khung (khách khác có thể trả tiền ngay sau đó)
  const hud = await page.evaluate(() => { const I = HX.bar.debug.info(); return { shown: I.shownGold, want: I.gold0 + I.credited, text: +document.querySelector('.bb-gold b').textContent }; });
  check('ô vàng trên HUD cộng dần tới đúng số đã thu', hud.shown === hud.want && hud.text === Math.floor(hud.shown), JSON.stringify(hud));

  // trà: rót khéo (giữ ~95 % thời gian rót đầy) và rót hỏng (giữ 0,3 s)
  const teaA = await spawnFree(page, { tea: true, seat: 'Seat_09' });
  const tA = await teaByKeys(page, teaA, 1430);
  const teaB = await spawnFree(page, { tea: true, seat: 'Seat_10' });
  const tB = await teaByKeys(page, teaB, 300);
  check('giữ Space rót gần đầy vòng thì trà "perfect"', tA && tA.ev && tA.ev.grade === 'perfect', tA && JSON.stringify(tA.ev));
  check('thả sớm thì trà "bad"', tB && tB.ev && tB.ev.grade === 'bad', tB && JSON.stringify(tB.ev));
  await waitPay(page, teaA, 5000); await waitPay(page, teaB, 5000);
  I = await info(page);
  const pa = payOf(I, teaA), pb = payOf(I, teaB);
  check('trà perfect trả nhiều hơn trà bad (giá trà HX_META cấp 0 = 10)', pa && pb && pa.price + pa.tip > pb.price + pb.tip && pa.price === 10 && pb.price === 5,
    pa && pb && ('perfect ' + (pa.price + pa.tip) + ' · bad ' + (pb.price + pb.tip)));

  // khách bị bỏ rơi: tăng tốc thời gian, không phục vụ
  await waitFor(page, () => HX.bar.debug.info().customers.filter(c => c.seat === 'Seat_09' || c.seat === 'Seat_10').length === 0, null, 20000);
  const ig = await spawnFree(page, { dish: 'ClownFish', tea: false, seat: 'Seat_10' });
  await walkKeys(page, 300);
  await page.evaluate(() => HX.bar.debug.timeScale(6));
  const angry = await waitFor(page, id => { const c = HX.bar.debug.info().customers.filter(c => c.id === id)[0]; return c && c.st === 'angry'; }, ig, 30000);
  I = await info(page);
  check('chờ quá MaxServingWaitTime [DtD 25 s] thì khách giận (anim back_anger, bong bóng giận)', angry && (cust(I, ig) || {}).anim === 'back_anger', (cust(I, ig) || {}).anim);
  const left = await waitFor(page, id => HX.bar.debug.info().events.some(e => e.type === 'angry' && e.cid === id), ig, 30000);
  await page.evaluate(() => HX.bar.debug.timeScale(1));
  I = await info(page);
  const cl = I.menu.filter(m => m.id === 'ClownFish')[0];
  const stillWaiting = I.customers.filter(c => (c.st === 'order' || c.st === 'angry') && c.order === 'ClownFish').length;
  check('giận quá MaxEndureAngerTime thì bỏ về, suất cá hề trả lại thực đơn', left && (!cust(I, ig) || cust(I, ig).st === 'leave') && cl.pending === stillWaiting,
    JSON.stringify({ angry: I.angry, clown: cl, stillWaiting }));

  // tổng kết: đóng quán sớm
  await waitFor(page, () => HX.bar.debug.info().customers.every(c => c.st === 'leave' || c.st === 'pay'), null, 30000);
  I = await info(page);
  const want = I.dishes + I.tips + I.tea;
  const sold = {};
  I.menu.forEach(m => { sold[m.id] = m.sold; });
  check('nút "Đóng quán" có mặt', (await page.$eval('#bar-close', e => e.textContent)) === 'Đóng quán');
  await page.click('#bar-close');
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
  if (first.order === 'tea') { const t = await teaByTaps(page, first.id, 1400); r = t && t.ev ? 'ok' : 'rót trà hỏng'; }
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
  const t = await teaByTaps(page, tA, 1430);
  check('chạm khách gọi trà, giữ rồi thả gần đầy vòng → perfect', t && t.ev && t.ev.grade === 'perfect', t && JSON.stringify(t.ev));
  await waitPay(page, tA, 5000);
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
    await keyboardNight(browser, base);
    await tapNight(browser, base);
    await reloadMidNight(browser, base);
  } catch (e) {
    fail++; out.push('  ✘ lỗi chạy bộ kiểm: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
