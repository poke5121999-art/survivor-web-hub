/*
 * Chợ Phiên (games/bazaar) — kiểm một run chơi được trên trình duyệt thật (Playwright), pha 2b.
 *
 * Chạy:  node test/bazaar-play.js
 *        BZ_URL=https://poke5121999-art.github.io/survivor-web-hub node test/bazaar-play.js   (chạy trên Pages)
 * Không có BZ_URL thì tự dựng máy chủ tĩnh ở gốc repo (cổng ngẫu nhiên).
 * Ảnh chụp mọi màn ra SHOTS (mặc định %TEMP%/bazaar-play) — mở ra xem cạnh D:\bazaar-ref\shots\wiki\*.
 *
 * Seed 7 + Vanessa + khởi đầu "Thu nhập" (Node chạy cùng reducer để lấy số kỳ vọng):
 *   20 vàng; giờ 0 ô 0 là thương nhân Mittel, hàng: Medium Package 4, Double Barrel 4, Clockwork Blades 4 (khởi đầu theo data/heroes.js).
 * Điều kiểm (số ghi thẳng):
 *  1. 0 pageerror, 0 console error, 0 HTTP ≥ 400 trong cả lượt chơi.
 *  2. Tiêu đề → chọn hero → Vanessa → mở màn → màn chọn giờ có đúng 3 khung.
 *  3. Vào thương nhân, KÉO BẰNG CHUỘT THẬT Katana (giá 4) vào ô tay 3 → vàng 20 → 16, Katana nằm ở hand ô 3.
 *  4. Kéo Katana lên vùng bán → vàng tăng đúng giá bán (BZRun.sellPrice) = 2.
 *  5. Bấm đổi hàng → hàng khác hẳn hàng cũ, vàng trừ 2.
 *  6. Tới giờ PvE: bấm khung quái → "Chiến đấu!" → trận phát lại (người thắng khớp reducer) → bảng kết quả → Tiếp tục
 *     → thắng thì chọn loot bằng nhấp → thẻ loot vào bàn.
 *  7. Nạp lại trang → run tiếp đúng chỗ, BZRun.serialize trước = sau.
 *  8. Lái phần còn lại bằng BZ_DEBUG.cmd tới màn hết run, không lỗi.
 *  9. Điện thoại 844×390 có cảm ứng: kéo mua bằng chạm (CDP touch) → vàng giảm đúng giá, thẻ lên bàn.
 * 10. Sửa theo review (D:\bazaar-ref\review\FIXES-UI.md), bằng chuột / chạm thật: INTERACT-1 (nhấc hàng lúc đang chia không tàng hình),
 *     INTERACT-2 (Esc lúc kéo = huỷ kéo, không rời thương nhân), INTERACT-3 (bảng tạm nghỉ chặn phím), INTERACT-4 (kéo lên bệ = nâng bậc,
 *     không bán), FLOW-1 (kho do bệ mở đóng khi rời), MOBILE-1 (tooltip trong trận còn sau khi nhấc ngón), cùng INTERACT-5/6/7/8/10/12/13/14/23,
 *     MOBILE-3/9/10/23.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bazaar-play');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const SEED = 7;

// ---------- Node: cùng reducer để lấy số kỳ vọng ----------
globalThis.window = globalThis;
['cards', 'heroes', 'monsters', 'mode', 'encounters'].forEach(f => require(path.join(ROOT, 'games/bazaar/data', f + '.js')));
const R = require(path.join(ROOT, 'games/bazaar/js/run/index.js'));
let nrun = R.apply(R.apply(R.newRun({ seed: SEED }), { t: 'pickHero', hero: 'Vanessa' }).run, { t: 'choose', i: 0 }).run;
const N_GOLD0 = nrun.gold;
const N_MERCH = R.apply(nrun, { t: 'pick', i: 0 }).run.phase;

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); console.log(out[out.length - 1]); }
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
const run = page => page.evaluate(() => window.BZ_DEBUG.run());
const screen = page => page.evaluate(() => window.BZ_DEBUG.screen());
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
async function waitScreen(page, name, ms) { await page.waitForFunction(n => window.BZ_DEBUG.screen() === n, name, { timeout: ms || 15000 }); }
// kéo bằng chuột thật: từ tâm phần tử tới điểm (x,y) client, nhiều bước
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const n = 14;
  for (let i = 1; i <= n; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n); await sleep(16); }
  await sleep(80);
  await page.mouse.up();
}
async function stockRects(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).filter(e => e._rs && e._rs.kind === 'stock')
    .map(e => { const b = e.getBoundingClientRect(); return { i: e._rs.i, id: e._rs.card.id, price: e._rs.price, label: (e.querySelector('.rs-price b') || {}).textContent, x: b.left + b.width / 2, y: b.top + b.height / 2 }; }));
}
async function handTarget(page, socket, size) {
  return page.evaluate(([s, n]) => { const a = window.BZ_DEBUG.socketRect('hand', s), b = window.BZ_DEBUG.socketRect('hand', s + n - 1); return { x: (a.x + b.x + b.w) / 2, y: a.cy }; }, [socket, size]);
}
// lái run bằng lệnh cho tới khi stop(run) đúng
async function drive(page, stopFn, max, prefer) {
  return page.evaluate(([stopSrc, max, prefer]) => {
    const stop = new Function('r', 'return (' + stopSrc + ')(r)');
    const D = window.BZ_DEBUG;
    for (let n = 0; n < max; n++) {
      const r = D.run();
      if (stop(r)) return { ok: true, n, phase: r.phase.kind };
      const L = D.legal().filter(c => c.t !== 'move'), has = t => L.filter(c => c.t === t), ph = r.phase;
      let c = null;
      if (ph.kind === 'merchant') { const b = has('buy'); c = b.length ? b.reduce((a, x) => ph.stock[x.i].price > ph.stock[a.i].price ? x : a) : { t: 'leave' }; }
      else if (ph.kind === 'choose') {
        const mi = ph.options.findIndex(o => o.type === 'merchant'), ei = ph.options.findIndex(o => o.type === prefer);
        c = { t: 'pick', i: ei >= 0 ? ei : r.gold >= 4 && mi >= 0 ? mi : 0 };
      }
      else for (const t of ['choose', 'fight', 'next', 'pickHero', 'leave']) { const x = has(t); if (x.length) { c = x[0]; break; } }
      if (!c) { const s = has('sell'); if (s.length) c = s[0]; }
      if (!c) return { ok: false, n, phase: ph.kind, why: 'no legal command' };
      const res = D.cmd(c);
      if (!res.ok) return { ok: false, n, phase: ph.kind, why: JSON.stringify(c) + ' rejected: ' + res.reason };
    }
    return { ok: false, why: 'max commands', phase: D.run().phase.kind };
  }, [stopFn.toString(), max || 3000, prefer || null]);
}

async function desktop(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED, { waitUntil: 'load' });
  await ready(page);
  await sleep(700);
  check('mở trang: màn tiêu đề', (await screen(page)) === 'title');
  await shot(page, '01-title');
  await page.click('.rs-screen.title .rs-big.play');
  await waitScreen(page, 'heroSelect'); await sleep(500);
  // ---- sảnh 8 hero (BZ_HEROES.order): 7 chơi được + The Dragons khoá ----
  const lobby = await page.evaluate(() => Array.from(document.querySelectorAll('.herosel .hex')).map(b => ({ h: b.dataset.hero, locked: b.classList.contains('locked') })));
  check('sảnh: 8 lục giác, 7 hero chơi được, The Dragons khoá', lobby.length === 8 && lobby.filter(x => !x.locked).length === 7 && lobby.some(x => x.h === 'TheDragons' && x.locked),
    lobby.map(x => x.h + (x.locked ? '🔒' : '')).join(','));
  const parts0 = await page.evaluate(() => Object.keys(window.BZ_CARDS_PARTS || {}).join(','));
  check('mở trang chỉ nạp thẻ chung (data/cards-common.js)', parts0 === 'common', parts0);
  const tags = {};
  for (const h of ['Mak', 'Stelle', 'Jules', 'Karnok']) {
    await page.click('.herosel .hex[data-hero="' + h + '"]'); await sleep(250);
    tags[h] = await page.evaluate(() => document.querySelector('.herosel .info .tag').textContent + ' | ' + document.querySelectorAll('.herosel .info .opts .o').length);
  }
  check('tagline gốc của 4 hero mới (WIKI §4) + 3 lựa chọn mở màn', tags.Mak.startsWith('Alchemical Immortalist') && tags.Stelle.startsWith('Bright Aeronaut') && tags.Jules.startsWith('Chef of the Deeps') && tags.Karnok.startsWith('Monstrous Hunter') && /\| 3$/.test(tags.Karnok), JSON.stringify(tags));
  const karInnate = await page.evaluate(() => document.querySelector('.herosel .info .innate') ? document.querySelector('.herosel .info .innate').textContent : '');
  check('Karnok: bảng hero hiện kỹ năng có sẵn Karnok\'s Rage', /Rage/.test(karInnate), karInnate);
  await shot(page, '02a-hero-karnok');
  await page.click('.herosel .hex[data-hero="TheDragons"]'); await sleep(300);
  await shot(page, '02b-hero-dragons-locked');
  await page.click('.herosel .rs-big.play'); await sleep(400);
  const lockMsg = await page.evaluate(() => (document.querySelector('.herosel .lockmsg') || {}).textContent || '');
  check('The Dragons: bấm Sẵn sàng không vào run, hiện lý do khoá', (await screen(page)) === 'heroSelect' && /Chưa chơi được/.test(lockMsg), lockMsg.slice(0, 80));
  await page.click('.herosel .hex[data-hero="Pygmalien"]'); await sleep(300);
  await page.click('.herosel .hex[data-hero="Vanessa"]'); await sleep(500);
  await shot(page, '02-hero-select');
  await page.click('.herosel .rs-big.play');
  await waitScreen(page, 'event'); await sleep(900);
  let r = await run(page);
  check('chọn Vanessa: hero = Vanessa, mở màn có 3 lựa chọn', r.hero === 'Vanessa' && r.phase.choices.length === 3, r.hero + ' / ' + r.phase.choices.length);
  // nạp lười: thẻ Vanessa có khi vào run, các hero khác + bóng PvP nạp ngầm ngay sau đó, đúng thứ tự common → hero → còn lại
  await page.waitForFunction(() => window.BZ_DEBUG.cardsReady(), null, { timeout: 30000 });
  const parts1 = await page.evaluate(() => Object.keys(window.BZ_CARDS_PARTS).join(',') + ' | ghosts ' + !!window.BZ_GHOSTS);
  check('nạp ngầm đủ 7 tệp thẻ hero + data/ghosts.js sau khi chọn hero', parts1 === 'common,vanessa,pygmalien,dooley,mak,stelle,jules,karnok | ghosts true', parts1);
  await page.hover('.rs-orb'); await sleep(300);
  await shot(page, '03-start-choice');
  await page.click('.rs-orb');
  await waitScreen(page, 'choose'); await sleep(1200);
  r = await run(page);
  const frames = await page.evaluate(() => document.querySelectorAll('.rs-top .rs-enc').length);
  check('giờ 0: màn chọn có 3 khung gặp gỡ', frames === 3 && r.phase.options.length === 3, 'khung ' + frames + ', options ' + r.phase.options.length);
  check('khởi đầu Thu nhập: vàng = ' + N_GOLD0, r.gold === N_GOLD0, String(r.gold));
  await page.hover('.rs-top .rs-enc'); await sleep(350);
  await shot(page, '04-hour-choice');
  await page.click('.rs-top .rs-enc');
  await waitScreen(page, 'merchant'); await sleep(1300);
  await shot(page, '05-merchant');

  // ---- mua bằng kéo chuột thật ----
  r = await run(page);
  const g0 = r.gold;
  let stock = await stockRects(page);
  check('thương nhân ' + N_MERCH.name + ': ' + N_MERCH.stock.length + ' món, giá khớp reducer', stock.length === N_MERCH.stock.length &&
    stock.every((s, k) => +s.label === N_MERCH.stock[s.i].price), stock.map(s => s.label).join(','));
  const pick = stock.find(s => R.tpl(s.id).Size === 'Medium' && s.price <= g0) || stock.find(s => s.price <= g0);
  const size = R.SIZE[R.tpl(pick.id).Size];
  const sock = 3;
  await mouseDrag(page, pick, await handTarget(page, sock, size));
  await sleep(700);
  r = await run(page);
  const bought = r.board.hand.find(c => c.id === pick.id);
  check('kéo mua ' + R.title(R.tpl(pick.id)) + ' (giá hiện ' + pick.label + '): vàng ' + g0 + ' → ' + (g0 - pick.price) + ', thẻ ở ô tay ' + sock,
    r.gold === g0 - +pick.label && !!bought && bought.socket === sock, 'vàng ' + r.gold + ', thẻ ' + (bought ? bought.section + ':' + bought.socket : 'không có'));
  await shot(page, '06-merchant-bought');

  // ---- bán bằng kéo ----
  const sellPrice = await page.evaluate(uid => window.BZRun.sellPrice(window.BZ_DEBUG.run(), uid), bought.uid);
  const g1 = r.gold;
  const from = await page.evaluate(uid => { const e = window.BZUI.cards.ownEl(uid).getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; }, bought.uid);
  const zone = await page.evaluate(() => window.BZ_DEBUG.rect('.rs-sellzone'));
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x + (zone.cx - from.x) * i / 12, from.y + (zone.cy - from.y) * i / 12); await sleep(16); }
  await sleep(120);
  const label = await page.evaluate(() => document.querySelector('.rs-sellzone b').textContent);
  await shot(page, '07-sell-drag');
  await page.mouse.up(); await sleep(800);
  r = await run(page);
  check('kéo bán: vùng bán hiện +' + sellPrice + ', vàng ' + g1 + ' → ' + (g1 + sellPrice), label === '+' + sellPrice && r.gold === g1 + sellPrice && !r.board.hand.find(c => c.uid === bought.uid),
    'nhãn "' + label + '", vàng ' + r.gold);

  // ---- đổi hàng ----
  const before = (await run(page)).phase.stock.map(s => s.card.id).join(',');
  const g2 = r.gold, cost = r.phase.rerollCost;
  await page.click('.rs-reroll'); await sleep(1100);
  r = await run(page);
  const after = r.phase.stock.map(s => s.card.id).join(',');
  const shown = (await stockRects(page)).map(s => s.id).join(',');
  check('đổi hàng: hàng mới khác hàng cũ, vàng −' + cost + ', thẻ trên bàn khớp hàng mới', after !== before && r.gold === g2 - cost && shown === after,
    before + ' → ' + after);
  await shot(page, '08-reroll');
  // tooltip thẻ hàng
  await page.mouse.move(0, 0); await sleep(100);
  const s0 = (await stockRects(page))[0];
  if (s0) { await page.mouse.move(s0.x, s0.y); await sleep(400); await shot(page, '09-tooltip'); }
  await page.click('.rs-merchant-ctl .leave');
  await sleep(600);

  // ---- tới giờ PvE (giờ 2) ----
  let d = await drive(page, r => r.phase.kind === 'choose' && r.hour === 2, 200);
  check('lái tới giờ PvE (ngày 1 giờ 2)', d.ok, JSON.stringify(d));
  await sleep(1200);
  await page.hover('.rs-top .rs-enc'); await sleep(500);
  await shot(page, '10-pve-choice');
  await page.click('.rs-top .rs-enc');
  await waitScreen(page, 'fight'); await sleep(1200);
  await shot(page, '11-fight-preview');
  // gốc tự đánh ~3 s sau lúc chọn (REF-run-flow fight-start): không bấm nút, chờ trận tự bắt đầu
  const tFight = Date.now();
  await waitScreen(page, 'fightResult', 8000);
  const autoMs = Date.now() - tFight;
  check('PvE tự vào trận sau ~3 s mà không cần bấm (' + (autoMs + 1200) + ' ms)', autoMs + 1200 >= 2500 && autoMs < 4500, 'chờ thêm ' + autoMs);
  await sleep(2500);
  await shot(page, '12-combat');
  const cinfo = await page.evaluate(() => window.BZ_DEBUG.combat());
  check('trận phát lại: người thắng khớp reducer', cinfo.active && cinfo.got === cinfo.expect, JSON.stringify(cinfo));
  await page.click('.rs-fightdock .skip');
  await page.waitForSelector('.rs-result .rs-big.play', { timeout: 20000 });
  await sleep(700);
  await shot(page, '13-fight-result');
  r = await run(page);
  const won = r.phase.won, gBefore = r.gold;
  await page.click('.rs-result .rs-big.play');
  await sleep(1200);
  r = await run(page);
  if (won) {
    check('thắng quái: vàng + phần thưởng, vào màn loot', r.phase.kind === 'loot' && r.gold > gBefore, r.phase.kind + ' vàng ' + gBefore + '→' + r.gold);
    await shot(page, '14-loot');
    const n0 = r.board.hand.length + r.board.stash.length + r.board.skills.length;
    const lootId = await page.evaluate(() => { const e = Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).find(x => x._rs && x._rs.kind === 'loot'); return e && e._rs.card.id; });
    await page.click('.rs-cards .bz-card.top');
    await sleep(900);
    r = await run(page);
    const n1 = r.board.hand.length + r.board.stash.length + r.board.skills.length;
    check('nhấp chọn loot: thẻ vào bàn', n1 === n0 + 1 || R.allCards(r).some(c => c.id === lootId), n0 + ' → ' + n1);
    await shot(page, '15-after-loot');
  } else check('thua quái: không loot, đi tiếp', r.phase.kind !== 'loot', r.phase.kind);

  // ---- nạp lại ----
  await sleep(300);
  const ser0 = await page.evaluate(() => window.BZ_DEBUG.serialize());
  await page.reload({ waitUntil: 'load' });
  await ready(page); await sleep(900);
  const ser1 = await page.evaluate(() => window.BZ_DEBUG.serialize());
  check('nạp lại trang: run tiếp đúng chỗ (serialize bằng nhau)', ser0 === ser1 && ser1 != null, ser1 ? 'màn ' + (await screen(page)) : 'không có run');
  await shot(page, '16-reloaded');

  // ---- sự kiện / bệ (chụp nếu gặp trong ngày 1-2) ----
  d = await drive(page, r => r.phase.kind === 'event' && r.phase.eventId !== 'start', 300, 'event');
  if (d.ok) { await sleep(1200); await page.hover('.rs-choice'); await sleep(300); await shot(page, '17a-event'); }
  check('gặp một sự kiện có lựa chọn', d.ok, JSON.stringify(d));
  d = await drive(page, r => r.phase.kind === 'pedestal' || r.day >= 3, 400, 'pedestal');
  if (d.ok && d.phase === 'pedestal') { await sleep(1200); await shot(page, '17b-pedestal'); }

  // ---- level up + PvP + tới hết run ----
  d = await drive(page, r => r.phase.kind === 'levelUp', 400);
  if (d.ok) { await sleep(1000); await shot(page, '17-levelup'); }
  d = await drive(page, r => r.phase.kind === 'fight' && r.phase.combatType === 'PVP', 600);
  if (d.ok) {
    // màn VS hiện ngay khi vào trận PvP: chớp trắng → VS → thẻ úp → lật (clip wUzq6Q4u9Jc ?t=702..710)
    let vsSeen = true;
    try { await page.waitForSelector('.rs-vs', { timeout: 4000 }); } catch (e) { vsSeen = false; }
    check('PvP: màn VS hiện trước trận', vsSeen);
    await sleep(900); await shot(page, '18a-pvp-vs');
    const vsTxt = await page.evaluate(() => { const v = document.querySelector('.rs-vs'); return v ? v.querySelector('.plate.r b').textContent + ' | ' + v.querySelector('.plate.l b').textContent : ''; });
    check('màn VS có tên hero và "Bóng ma của <tên>"', /Vanessa/.test(vsTxt) && /Bóng ma của /.test(vsTxt), vsTxt);
    // bóng từ bộ dữ liệu: đủ thẻ như mục trong BZ_GHOSTS (cổng nạp thẻ: không rơi thẻ của hero chưa nạp)
    const gh = await page.evaluate(() => {
      const o = window.BZ_DEBUG.run().phase.opponent, G = window.BZ_GHOSTS, list = (G && G.byDay[String(o.day)]) || [];
      const g = list.find(x => x.name === o.name && x.hero === o.hero);
      return { source: o.source || null, hero: o.hero || null, n: o.board.cards.length, want: g ? g.cards.length : -1, art: (document.querySelector('.rs-vs .side.r .img') || { style: {} }).style.backgroundImage || '' };
    });
    check('bóng PvP từ data/ghosts.js: số thẻ = mục BZ_GHOSTS (' + gh.want + '), ảnh là hero của bóng', gh.source === 'dataset' && gh.n === gh.want && gh.want > 0 && (!gh.hero || gh.art.indexOf('Skin_' ) >= 0), JSON.stringify(gh));
    const backs0 = await page.evaluate(() => document.querySelectorAll('.rs-cards .bz-card .rs-back').length);
    check('thẻ của bóng đang úp trong lúc VS (' + backs0 + ' thẻ)', backs0 > 0);
    await page.waitForFunction(() => !document.querySelector('.rs-vs'), null, { timeout: 5000 });
    await sleep(350); await shot(page, '18b-pvp-flip');
    await page.waitForFunction(() => !document.querySelector('.rs-fightgo.wait'), null, { timeout: 5000 });
    const backs1 = await page.evaluate(() => document.querySelectorAll('.rs-cards .bz-card .rs-back').length);
    check('thẻ của bóng lật hết trước khi hiện nút Chiến đấu', backs1 === 0, 'còn úp ' + backs1);
    await sleep(300); await shot(page, '18-pvp-preview');
    // nút còn dùng được như "bắt đầu ngay"; nếu trận đã tự bắt đầu thì không bấm
    await page.click('.rs-fightgo .rs-big', { timeout: 1500 }).catch(() => {});
    await waitScreen(page, 'fightResult', 8000); await sleep(2000); await shot(page, '19-pvp-combat');
    await page.click('.rs-fightdock .skip');
    await page.waitForSelector('.rs-result .rs-big.play', { timeout: 20000 }); await sleep(600);
    await shot(page, '20-pvp-result');
    const dayB = (await run(page)).day;
    await page.click('.rs-result .rs-big.play'); await sleep(700);
    const rDay = await run(page);
    if (rDay.day > dayB) {
      // thẻ ngày: "Ngày N" lăn sang N+1 vàng, ba khung bật ra sau đó (clip ?t=1322, ?t=63)
      const card0 = await page.evaluate(() => { const c = document.querySelector('.rs-daycard'); return c ? { old: c.querySelector('.old').textContent, nw: c.querySelector('.new').textContent, hidden: getComputedStyle(document.querySelector('.rs-top')).display } : null; });
      check('đổi ngày: thẻ ngày hiện (Ngày ' + dayB + ' → ' + rDay.day + ') và che ba khung', !!card0 && +card0.old === dayB && +card0.nw === rDay.day && card0.hidden === 'none', JSON.stringify(card0));
      await shot(page, '21a-day-card');
      // số lăn ở ~3,9 s theo clip REF-run-flow (day-card), chờ tới khi lớp .roll xuất hiện thay vì ngủ cứng
      const rolled = await page.waitForFunction(() => !!document.querySelector('.rs-daycard.roll'), null, { timeout: 6000 }).then(() => true, () => false);
      await shot(page, '21b-day-card-roll');
      check('thẻ ngày lăn sang số mới (≤ 6 s)', rolled);
      await page.click('.rs-daycard');
      await page.waitForFunction(() => !document.querySelector('.rs-daycard'), null, { timeout: 3000 });
      await sleep(250); await shot(page, '21c-choices-pop');
      await sleep(900);
      const nEnc = await page.evaluate(() => document.querySelectorAll('.rs-top .rs-enc').length);
      check('bấm bỏ qua thẻ ngày: ba khung gặp gỡ hiện', nEnc === 3 || rDay.phase.kind !== 'choose', 'khung ' + nEnc + ', phase ' + rDay.phase.kind);
    } else check('PvP xong chưa qua ngày (run kết thúc / thua)', true, 'ngày ' + rDay.day);
    await sleep(500);
    await shot(page, '21-after-pvp');
  }
  check('tới trận PvP bóng (giờ 5)', d.ok, JSON.stringify(d));
  check('màn Số phận (phase fates) đã đăng ký, dùng lại màn lên cấp', await page.evaluate(() => { const f = window.BZUI.SCREENS.fates, l = window.BZUI.SCREENS.levelUp; return !!f && typeof f.enter === 'function' && typeof f.render === 'function' && f !== l; }));
  // đổi stash: mở kho
  await page.keyboard.press('Space'); await sleep(700); await shot(page, '22-stash'); await page.keyboard.press('Space'); await sleep(300);
  d = await drive(page, r => r.phase.kind === 'end', 4000);
  await sleep(1500);
  check('lái tới hết run: màn kết thúc', d.ok && (await screen(page)) === 'end', JSON.stringify(d) + ' màn ' + (await screen(page)));
  await shot(page, '23-end');
  await sleep(3000); await shot(page, '23b-end-card');
  const endB = await page.evaluate(() => { const r = window.BZUI.state.run, b = r && (r.best || {}).board; return { lbl: (document.querySelector('.endrun .bestlbl') || {}).textContent || '', n: document.querySelectorAll('.endrun .board .bz-card').length, want: b ? b.hand.length : -1, best: !!(r && r.best) }; });
  check('màn hết run: bàn tốt nhất (run.best) hiện đủ thẻ + nhãn', endB.best && endB.n === endB.want && /Bàn tốt nhất/.test(endB.lbl), JSON.stringify(endB));
  // trang xem trận (Đấu thử) vẫn mở được từ tiêu đề
  await page.goto(base + '/games/bazaar/index.html', { waitUntil: 'load' }); await ready(page); await sleep(400);
  await page.click('.rs-screen.title .rs-big.c-blue');
  await page.waitForFunction(() => window.BZ_READY && window.BZ_DEBUG && typeof window.BZ_DEBUG.state === 'function' && window.BZ_DEBUG.state(), null, { timeout: 30000 });
  check('nút Đấu thử mở trang xem trận (?view=1)', /view=1/.test(page.url()), page.url());
  await sleep(1500); await shot(page, '24-viewer');
  check('máy tính: 0 lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------- pha 4: kéo đổi chỗ / đẩy, quest trên thẻ, rương (trạng thái dựng bằng BZ_DEBUG.load) ----------
async function phase4(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(400);
  await page.evaluate(seed => { window.BZUI.newRun(seed); window.BZ_DEBUG.cmd({ t: 'pickHero', hero: 'Pygmalien' }); }, SEED);
  await page.waitForFunction(() => window.BZ_DEBUG.run().hero === 'Pygmalien' && window.BZ_DEBUG.cardsReady(), null, { timeout: 30000 });
  const order = await page.evaluate(() => Object.keys(window.BZ_CARDS_PARTS).join(','));
  check('chọn Pygmalien: tệp của hero nạp trước các hero khác', order.startsWith('common,pygmalien,vanessa'), order);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'choose', i: 0 }));
  await waitScreen(page, 'choose'); await sleep(600);

  // ---- kéo thẻ lên ô đã có thẻ: thẻ chắn nhích trước (HoveredMove), thả = move đẩy / đổi chỗ đúng reducer ----
  const setup = await page.evaluate(() => {
    const R = window.BZRun, run = window.BZ_DEBUG.run(), C = window.BZ_CARDS;
    const pick = sz => Object.keys(C).find(id => { const t = C[id]; return t.Size === sz && !R.isSkill(t) && (t.Heroes || []).indexOf('Common') >= 0 && t.Tiers && t.Tiers.Bronze && !/^\[|TEMPLATE|DEBUG/.test(t.InternalName); });
    const mk = (id, socket, n) => ({ uid: 'p' + (900 + n), id, tier: 'Bronze', ench: null, socket, size: R.SIZE[C[id].Size], section: 'hand', mods: {} });
    run.board.hand = [mk(pick('Small'), 3, 1), mk(pick('Medium'), 4, 2)];
    run.uidN = 905;
    window.BZ_DEBUG.load(run);
    // kỳ vọng: cùng lệnh trên reducer
    const exp = R.apply(window.BZ_DEBUG.run(), { t: 'move', uid: 'p901', section: 'hand', socket: 5 });
    return { ok: exp.ok, hand: exp.run.board.hand.map(c => c.uid + '@' + c.socket).sort().join(','), moves: exp.events.filter(e => e.type === 'move').length };
  });
  await sleep(500);
  const from = await page.evaluate(() => { const e = window.BZUI.cards.ownEl('p901').getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; });
  const to = await handTarget(page, 5, 1);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12); await sleep(16); }
  await sleep(150);
  const nudge = await page.evaluate(() => { const e = window.BZUI.cards.ownEl('p902'); return { cls: e.classList.contains('nudged'), tr: e.style.translate }; });
  await shot(page, '40-drag-push-preview');
  check('rê thẻ Small lên ô của thẻ Medium: thẻ Medium nhích trước (HoveredMove)', nudge.cls && /px/.test(nudge.tr), JSON.stringify(nudge));
  await page.mouse.up(); await sleep(600);
  const after = await page.evaluate(() => window.BZ_DEBUG.run().board.hand.map(c => c.uid + '@' + c.socket).sort().join(','));
  check('thả lên ô đã có thẻ → đẩy/đổi chỗ đúng reducer (' + setup.hand + ')', setup.ok && after === setup.hand, after);
  await shot(page, '41-drag-push-done');

  // ---- quest trên thẻ: Dog "Sell 15 Food or Toys" ----
  const q0 = await page.evaluate(() => {
    const R = window.BZRun, run = window.BZ_DEBUG.run(), C = window.BZ_CARDS;
    const byT = t => Object.keys(C).find(id => R.title(C[id]) === t);
    run.board.hand = [{ uid: 'p910', id: byT('Dog'), tier: 'Bronze', ench: null, socket: 3, size: R.SIZE[C[byT('Dog')].Size], section: 'hand', mods: {}, qp: { '0.0': 14 } },
      { uid: 'p911', id: byT('Chocolate Bar'), tier: 'Bronze', ench: null, socket: 6, size: 1, section: 'hand', mods: {} }];
    run.uidN = 912;
    window.BZ_DEBUG.load(run);
    const chip = window.BZUI.cards.ownEl('p910').querySelector('.rs-quest');
    return chip ? chip.textContent : null;
  });
  check('thẻ có quest: chip tiến độ trên thẻ (14/15)', q0 === '14/15', String(q0));
  await sleep(400);
  const dogC = await page.evaluate(() => { const e = window.BZUI.cards.ownEl('p910').getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2 }; });
  await page.mouse.move(dogC.x, dogC.y); await sleep(450);
  const qtip = await page.evaluate(() => { const t = document.querySelector('.bz-tip .rs-questtip'); return t ? t.textContent : ''; });
  check('tooltip có mục Nhiệm vụ (chữ gốc + tiến độ)', /Sell 15 Food or Toys/.test(qtip) && /14\/15/.test(qtip), qtip.slice(0, 90));
  await shot(page, '42-quest-tooltip');
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'sell', uid: 'p911' }));
  await sleep(500);
  await shot(page, '43-quest-done');
  const q1 = await page.evaluate(() => { const e = window.BZUI.cards.ownEl('p910'); return { chip: e.querySelector('.rs-quest').textContent, burst: e.classList.contains('questdone'), qd: window.BZ_DEBUG.run().board.hand[0].qd }; });
  check('bán Chocolate Bar → quest xong: thẻ loé, chip sang mục kế (1/30)', q1.burst && q1.chip === '1/30' && JSON.stringify(q1.qd) === '["0.0"]', JSON.stringify(q1));

  // ---- rương 4 thắng (Đồng): rơi → rung → mở → 3 phần thưởng ----
  await page.evaluate(() => {
    const R = window.BZRun, run = window.BZ_DEBUG.run(), cx = { run: R.clone(run), events: [] };
    cx.run.wins = 4; R.enterChest(cx, R.chestFor(4), 'endHour');
    window.BZ_DEBUG.load(cx.run);
  });
  await sleep(700); await shot(page, '44-chest-fall');
  const ch0 = await page.evaluate(() => ({ rev: !!document.querySelector('.rs-chestrev.t-Bronze'), opened: !!document.querySelector('.rs-chestrev.opened'), screen: window.BZ_DEBUG.screen() }));
  check('rương Đồng: màn rương, chưa mở ở 0,7 s', ch0.screen === 'chest' && ch0.rev && !ch0.opened, JSON.stringify(ch0));
  await sleep(1800); await shot(page, '45-chest-open');
  await sleep(1500); await shot(page, '46-chest-prizes');
  const ch1 = await page.evaluate(() => ({ opened: !!document.querySelector('.rs-chestrev.opened.settled'), picks: Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).filter(e => e._rs && e._rs.kind === 'loot' && !e.classList.contains('despawn')).length, want: window.BZ_DEBUG.run().phase.picks.length }));
  check('rương mở sau 2,3 s, bày đủ phần thưởng', ch1.opened && ch1.picks === ch1.want && ch1.want > 0, JSON.stringify(ch1));
  const n0 = await page.evaluate(() => window.BZRun.allCards(window.BZ_DEBUG.run()).length);
  await page.click('.rs-cards .bz-card.top:not(.despawn)'); await sleep(900);
  const ch2 = await page.evaluate(() => ({ n: window.BZRun.allCards(window.BZ_DEBUG.run()).length, kind: window.BZ_DEBUG.run().phase.kind }));
  check('bấm phần thưởng rương: thẻ vào bàn, rời màn rương', ch2.n === n0 + 1 && ch2.kind !== 'chest', JSON.stringify(ch2));
  // rương Vàng (10 thắng) để so màu bậc
  await page.evaluate(() => {
    const R = window.BZRun, run = window.BZ_DEBUG.run(), cx = { run: R.clone(run), events: [] };
    cx.run.wins = 10; R.enterChest(cx, R.chestFor(10), 'endHour');
    window.BZ_DEBUG.load(cx.run);
  });
  await sleep(2700); await shot(page, '47-chest-gold-open');
  await page.click('.rs-cards .bz-card.top:not(.despawn)').catch(() => {}); await sleep(700);

  // ---- Số phận (fates): 3 khung lựa chọn, chọn được ----
  await page.evaluate(() => { const R = window.BZRun, cx = { run: R.clone(window.BZ_DEBUG.run()), events: [] }; R.enterFates(cx); window.BZ_DEBUG.load(cx.run); });
  await sleep(1200); await shot(page, '48-fates');
  const fz = await page.evaluate(() => ({ n: document.querySelectorAll('.rs-top .rs-enc').length, title: (document.querySelector('.rs-map-title h2') || {}).textContent }));
  const fz2 = await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'choose', i: 1 }));
  check('Số phận: 3 khung + tiêu đề, chọn "Second Wind" đi tiếp', fz.n === 3 && fz.title === 'Số phận' && fz2.ok, JSON.stringify([fz, fz2]));

  // ---- sự kiện → bước có Then (chuỗi Gumball): cùng màn event nhưng chân dung / lựa chọn đổi theo bước ----
  const ch = await page.evaluate(() => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = window.BZ_DEBUG.run();
    const st = Object.values(E.steps).find(s => /Get a Gumball/.test(s.InternalName) && (s.Then || []).length);
    run.gold = 60;
    run.phase = { kind: 'event', eventId: Object.keys(E.events)[0], name: 'Test', desc: '', choices: [{ kind: 'step', id: st.Id, name: st.Title || st.InternalName, desc: st.Desc || '' }], canExit: true, after: 'endHour' };
    window.BZ_DEBUG.load(run);
    return { title: st.Title || st.InternalName, then: st.Then.length };
  });
  await sleep(700);
  const chr = await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'choose', i: 0 }));
  await sleep(900); await shot(page, '49-event-chain');
  const chs = await page.evaluate(() => { const ph = window.BZ_DEBUG.run().phase; return { kind: ph.kind, step: !!ph.stepId, n: document.querySelectorAll('.rs-choices .rs-choice').length, kick: (document.querySelector('.rs-side-name small') || {}).textContent, want: (ph.choices || []).length }; });
  check('sự kiện → bước có Then: màn vẽ lại chuỗi kế (' + ch.then + ' lựa chọn, nhãn "Tiếp theo")', chr.ok && chs.kind === 'event' && chs.step && chs.n === chs.want && chs.kick === 'Tiếp theo', JSON.stringify([chr, chs]));
  check('pha 4: 0 lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(500);
  await shot(page, '30-phone-title');
  await page.evaluate(seed => { window.BZUI.newRun(seed); }, SEED);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'pickHero', hero: 'Vanessa' })); // hoãn tới khi data/cards-vanessa.js nạp xong
  await page.waitForFunction(() => window.BZ_DEBUG.run().hero === 'Vanessa' && window.BZ_DEBUG.cardsReady(), null, { timeout: 30000 });
  await page.evaluate(() => { const D = window.BZ_DEBUG; D.cmd({ t: 'choose', i: 0 }); D.cmd({ t: 'pick', i: 0 }); });
  await sleep(1300);
  await shot(page, '31-phone-merchant');
  const r0 = await run(page);
  const st = await stockRects(page);
  const pick = st.find(s => s.price <= r0.gold && R.tpl(s.id).Size !== 'Large');
  const size = R.SIZE[R.tpl(pick.id).Size];
  const to = await handTarget(page, 4, size);
  // cảm ứng: thẻ được nhấc lên trên ngón (đáy thẻ cách đầu ngón 12 px, MOBILE-12) nên ngón đặt dưới ô một khoảng = nửa thẻ + 12 px
  const halfCard = await page.evaluate(() => window.BZ_DEBUG.socketRect('hand', 0).h / 2 + 12);
  to.y += halfCard;
  const cdp = await ctx.newCDPSession(page);
  const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pick.x, pick.y) });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(pick.x + (to.x - pick.x) * i / 12, pick.y + (to.y - pick.y) * i / 12) }); await sleep(20); }
  await sleep(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);
  const r1 = await run(page);
  const c = r1.board.hand.find(x => x.id === pick.id);
  check('điện thoại 844×390: kéo mua bằng chạm → vàng ' + r0.gold + ' → ' + (r0.gold - pick.price) + ', thẻ ở ô 4', r1.gold === r0.gold - pick.price && !!c && c.socket === 4,
    'vàng ' + r1.gold + ', ' + (c ? c.section + ':' + c.socket : 'không có thẻ'));
  await shot(page, '32-phone-bought');
  check('điện thoại: 0 lỗi', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------- sửa theo review (nhánh UI, D:\bazaar-ref\review\FIXES-UI.md): P0 + vài P1 bằng chuột / chạm thật ----------
// dựng nhanh: run mới (seed 7, Vanessa, khởi đầu 0) tới màn chọn giờ đầu
async function freshRun(page, hero) {
  await page.evaluate(([seed, h]) => { window.BZUI.newRun(seed); window.BZ_DEBUG.cmd({ t: 'pickHero', hero: h }); }, [SEED, hero || 'Vanessa']);
  await page.waitForFunction(h => window.BZ_DEBUG.run().hero === h && window.BZ_DEBUG.cardsReady(), hero || 'Vanessa', { timeout: 30000 });
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'choose', i: 0 }));
  await waitScreen(page, 'choose'); await sleep(500);
}
const center = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }, sel);
const ownCenter = (page, uid) => page.evaluate(u => { const e = window.BZUI.cards.ownEl(u); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, uid);
// lấy mẫu độ mờ của thẻ đang kéo mỗi khung trong ms mili-giây
const sampleDrag = (page, ms) => page.evaluate(ms => new Promise(res => {
  const out = [], t0 = performance.now();
  (function f() { const e = document.querySelector('.rs-drag .bz-card'); if (e) { const cs = getComputedStyle(e); out.push({ o: +cs.opacity, a: cs.animationName }); } if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out); })();
}), ms);

async function reviewFixes(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(400);
  await freshRun(page);
  let r = await run(page);
  const mi = r.phase.options.findIndex(o => o.type === 'merchant');
  await page.evaluate(i => window.BZ_DEBUG.cmd({ t: 'pick', i }), mi < 0 ? 0 : mi);
  await waitScreen(page, 'merchant'); await sleep(250);

  // INTERACT-1: nhấc hàng ngay lúc đang chia (độ trễ 0,9 s): thẻ hiện đủ từ khung đầu, không chạy lại rs-deal
  let st = await stockRects(page);
  await page.mouse.move(st[0].x, st[0].y); await page.mouse.down();
  await page.mouse.move(st[0].x + 6, st[0].y - 6); await page.mouse.move(st[0].x + 12, st[0].y - 12);
  const s1 = await sampleDrag(page, 450);
  const min1 = s1.length ? Math.min.apply(null, s1.map(x => x.o)) : -1;
  check('INTERACT-1: nhấc hàng lúc đang chia: thẻ hiện ngay (độ mờ nhỏ nhất ' + min1.toFixed(2) + ', ' + s1.length + ' khung), không chạy rs-deal', s1.length > 5 && min1 > 0.99 && s1.every(x => x.a !== 'rs-deal'), JSON.stringify(s1.slice(0, 3)));
  // thả hỏng (giữa không trung) → bay về chỗ cũ, không chia lại
  await page.mouse.move(st[0].x + 20, st[0].y - 120, { steps: 4 }); await page.mouse.up();
  const back = await page.evaluate(() => new Promise(res => { const out = []; const t0 = performance.now(); (function f() { const e = Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).find(x => x._rs && x._rs.i === 0 && x._rs.kind === 'stock'); if (e) out.push(+getComputedStyle(e).opacity); if (performance.now() - t0 < 600) requestAnimationFrame(f); else res(out); })(); }));
  check('INTERACT-1: thả hỏng → thẻ bay về, không tàng hình / lật lại (độ mờ nhỏ nhất ' + Math.min.apply(null, back.concat([1])).toFixed(2) + ')', back.length > 0 && Math.min.apply(null, back) > 0.99);
  await sleep(1200);

  // INTERACT-14: một cú bấm vào hàng chỉ chọn (tooltip "Bấm lần nữa để mua"), bấm lần hai mới mua
  r = await run(page); st = await stockRects(page);
  const g0 = r.gold, it = st.find(s => s.price <= r.gold);
  await page.mouse.click(it.x, it.y); await sleep(350);
  const sel = await page.evaluate(() => ({ gold: window.BZ_DEBUG.run().gold, hint: (document.querySelector('.bz-tip .rs-taphint') || {}).textContent || '' }));
  await page.mouse.click(it.x, it.y); await sleep(700);
  const g2 = (await run(page)).gold;
  check('INTERACT-14: bấm 1 lần không mua (vàng ' + g0 + ' → ' + sel.gold + ', tooltip "' + sel.hint + '"), bấm lần 2 mua (vàng → ' + g2 + ')', sel.gold === g0 && /lần nữa để mua/.test(sel.hint) && g2 === g0 - it.price);

  // INTERACT-2: Esc trong lúc kéo hàng: huỷ kéo, vẫn ở thương nhân, không còn thẻ lơ lửng; Esc lần nữa mở bảng tạm nghỉ (không rời)
  st = await stockRects(page);
  await page.mouse.move(st[0].x, st[0].y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(st[0].x, st[0].y + i * 30); await sleep(16); }
  await page.keyboard.press('Escape'); await sleep(350);
  const e1 = await page.evaluate(() => ({ screen: window.BZ_DEBUG.screen(), floating: document.querySelectorAll('.rs-drag .bz-card').length, panel: !!document.querySelector('.rs-panel') }));
  await page.mouse.up(); await sleep(200);
  await page.keyboard.press('Escape'); await sleep(300);
  const e2 = await page.evaluate(() => ({ screen: window.BZ_DEBUG.screen(), panel: !!document.querySelector('.rs-panel') }));
  check('INTERACT-2: Esc lúc kéo = huỷ kéo (còn ở thương nhân, 0 thẻ lơ lửng); Esc lần 2 = bảng tạm nghỉ, không rời', e1.screen === 'merchant' && e1.floating === 0 && !e1.panel && e2.screen === 'merchant' && e2.panel, JSON.stringify([e1, e2]));

  // INTERACT-3: bảng tạm nghỉ chặn phím: Space / R / Enter không đụng bàn; Esc đóng bảng
  const before3 = await page.evaluate(() => ({ rr: window.BZ_DEBUG.run().phase.rerolls, gold: window.BZ_DEBUG.run().gold }));
  for (const k of ['Space', 'r', 'Enter', 'Space']) { await page.keyboard.press(k); await sleep(120); }
  const mid3 = await page.evaluate(() => ({ rr: window.BZ_DEBUG.run().phase.rerolls, gold: window.BZ_DEBUG.run().gold, tray: window.BZUI.cards.trayIsOpen(), screen: window.BZ_DEBUG.screen(), panel: !!document.querySelector('.rs-panel') }));
  await page.keyboard.press('Escape'); await sleep(250);
  const after3 = await page.evaluate(() => ({ panel: !!document.querySelector('.rs-panel'), screen: window.BZ_DEBUG.screen() }));
  check('INTERACT-3: bảng mở: Space/R/Enter không đổi hàng, không mở kho, không rời; Esc đóng bảng', mid3.rr === before3.rr && mid3.gold === before3.gold && !mid3.tray && mid3.screen === 'merchant' && mid3.panel && !after3.panel && after3.screen === 'merchant', JSON.stringify([before3, mid3, after3]));
  await shot(page, '50-review-merchant');

  // INTERACT-6: kéo thẻ của mình thả lên rương → vào kho (ô trống đầu)
  r = await run(page);
  const mine = r.board.hand[0];
  const chestC = await center(page, '.rs-chest');
  const from6 = await ownCenter(page, mine.uid);
  await mouseDrag(page, from6, chestC); await sleep(700);
  const c6 = (await run(page)).board.stash.find(c => c.uid === mine.uid);
  check('INTERACT-6: thả thẻ lên rương → thẻ vào kho', !!c6, c6 ? 'stash:' + c6.socket : 'không vào kho');
  // kho do kéo mở ra: thả xong thì đóng (INTERACT-19 thuộc cùng luồng)
  await page.keyboard.press('Space'); await sleep(450);
  // INTERACT-5: rời thương nhân → màn chọn giờ: kéo thẻ lên dải trên KHÔNG bán
  if (await page.evaluate(() => window.BZUI.cards.trayIsOpen())) { await page.keyboard.press('Space'); await sleep(400); }
  await page.evaluate(() => { const D = window.BZ_DEBUG, r = D.run(); if (!r.board.hand.length && r.board.stash.length) D.cmd({ t: 'move', uid: r.board.stash[0].uid, section: 'hand', socket: 4 }); });
  await page.click('.rs-merchant-ctl .leave'); await waitScreen(page, 'choose'); await sleep(900);
  r = await run(page);
  const own5 = r.board.hand[0], g5 = r.gold;
  const f5 = await ownCenter(page, own5.uid);
  await mouseDrag(page, f5, { x: f5.x, y: f5.y - 230 }); await sleep(600);
  const r5 = await run(page);
  check('INTERACT-5: màn chọn giờ: kéo thẻ lên dải trên không bán (vàng ' + g5 + ' → ' + r5.gold + ')', r5.gold === g5 && R.allCards(r5).some(c => c.uid === own5.uid));

  // INTERACT-4: bệ "Upgrade a Bronze-tier item": kéo thẻ sáng lên bệ → lên bậc, không bán
  const ped = await page.evaluate(() => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = window.BZ_DEBUG.run();
    const pid = Object.keys(E.pedestals).find(id => /Upgrade a Bronze/i.test(E.pedestals[id].Desc || ''));
    const cx = { run: R.clone(run), events: [] };
    R.ENCOUNTERS.pedestal.enter(cx, { id: pid }, 'endHour');
    window.BZ_DEBUG.load(cx.run);
    const ph = window.BZ_DEBUG.run().phase;
    return { pid, eligible: ph.eligible, kind: ph.kind };
  });
  await sleep(700);
  const pu = ped.eligible[0], pc0 = (await run(page)), card0 = R.allCards(pc0).find(c => c.uid === pu);
  const fp = await ownCenter(page, pu), orb = await center(page, '.rs-pedestal .orb');
  await mouseDrag(page, fp, orb); await sleep(900);
  const pc1 = await run(page), card1 = R.allCards(pc1).find(c => c.uid === pu);
  check('INTERACT-4: kéo ' + (card0 ? card0.tier : '?') + ' lên bệ → nâng bậc (' + (card1 ? card1.tier : 'mất thẻ') + '), vàng không đổi, rời bệ', ped.kind === 'pedestal' && !!card1 && card1.tier !== card0.tier && pc1.gold === pc0.gold && pc1.phase.kind !== 'pedestal', JSON.stringify({ ped, gold: [pc0.gold, pc1.gold] }));
  await shot(page, '51-review-pedestal-after');

  // FLOW-1: bệ mở kho (món hợp lệ chỉ ở kho) → Rời đi → kho đóng, khung gặp gỡ bấm được
  const f1 = await page.evaluate(() => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = window.BZ_DEBUG.run();
    const pid = Object.keys(E.pedestals).find(id => /Upgrade a Bronze/i.test(E.pedestals[id].Desc || ''));
    const b = run.board.hand.find(c => c.tier === 'Bronze') || run.board.hand[0];
    run.board.hand = run.board.hand.filter(c => c !== b); b.tier = 'Bronze'; b.section = 'stash'; b.socket = 0; run.board.stash = [b];
    run.phase = { kind: 'choose', options: [] };
    const cx = { run: R.clone(run), events: [] };
    R.ENCOUNTERS.pedestal.enter(cx, { id: pid }, 'endHour');
    return window.BZ_DEBUG.load(cx.run);
  });
  await sleep(700);
  const trayAtPed = await page.evaluate(() => window.BZUI.cards.trayIsOpen());
  await page.click('.bz-side-in .leave'); await sleep(1500);
  const after1 = await page.evaluate(() => {
    const scr = window.BZ_DEBUG.screen(), enc = document.querySelector('.rs-top .rs-enc .fr');
    let hit = null; if (enc) { const b = enc.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); hit = !!(e && e.closest('.rs-enc')); }
    return { scr, tray: window.BZUI.cards.trayIsOpen(), hit };
  });
  check('FLOW-1: bệ mở kho → Rời đi → kho đóng, khung gặp gỡ nhận bấm', f1 === 'pedestal' && trayAtPed && !after1.tray && (after1.scr !== 'choose' || after1.hit === true), JSON.stringify({ f1, trayAtPed, after1 }));

  // INTERACT-7/8: trận: Space = tạm dừng (không mở kho), bánh răng có trong trận, mở bảng thì trận dừng
  let d = await drive(page, r => r.phase.kind === 'choose' && r.hour === 2, 300);
  await sleep(900);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'pick', i: 0 }));
  await waitScreen(page, 'fight'); await sleep(600);
  await page.click('.rs-fightgo .rs-big');
  await waitScreen(page, 'fightResult'); await sleep(1500);
  await page.keyboard.press('Space'); await sleep(150);
  const t1 = (await page.evaluate(() => window.BZ_DEBUG.combat())).t; await sleep(500);
  const p7 = await page.evaluate(() => ({ t: window.BZ_DEBUG.combat().t, tray: window.BZUI.cards.trayIsOpen(), gear: getComputedStyle(document.querySelector('.rs-gear')).display, hud: getComputedStyle(document.querySelector('.rs-hud')).display, chest: !!document.querySelector('.bz-side-in .rs-chest') }));
  check('INTERACT-7: Space trong trận = tạm dừng (t đứng ' + t1.toFixed(0) + ' → ' + p7.t.toFixed(0) + '), kho không mở', d.ok && Math.abs(p7.t - t1) < 1 && !p7.tray, JSON.stringify(p7));
  check('INTERACT-8 / FLOW-13: bánh răng + HUD run (rương kho) có trong trận', p7.gear !== 'none' && p7.hud !== 'none' && p7.chest, JSON.stringify(p7));
  await page.keyboard.press('Space'); await sleep(300);
  await page.click('.rs-gear'); await sleep(200);
  const t2 = (await page.evaluate(() => window.BZ_DEBUG.combat())).t; await sleep(500);
  const t3 = (await page.evaluate(() => window.BZ_DEBUG.combat())).t;
  await page.keyboard.press('Escape'); await sleep(500);
  const t4 = (await page.evaluate(() => window.BZ_DEBUG.combat())).t;
  check('INTERACT-8: mở bảng trong trận → trận dừng; đóng → chạy tiếp', Math.abs(t3 - t2) < 1 && t4 > t3, [t2, t3, t4].map(x => x.toFixed(0)).join(' → '));
  await shot(page, '52-review-combat');
  // VFX-15 / INTERACT-23: bấm "Tới kết quả" → Tiếp tục hiện ngay (≤ 1,2 s)
  const tSkip = Date.now();
  await page.click('.rs-fightdock .skip');
  await page.waitForSelector('.rs-result .rs-big.play', { state: 'visible', timeout: 10000 });
  const skipMs = Date.now() - tSkip;
  check('INTERACT-23: Tới kết quả → Tiếp tục bấm được sau ' + skipMs + ' ms', skipMs < 1500);
  const dockGone = await page.evaluate(() => getComputedStyle(document.querySelector('.rs-fightdock')).display === 'none');
  check('MOBILE-23: xong trận thì dock tốc độ ẩn', dockGone);

  // INTERACT-13: Bỏ run này phải xác nhận; "Thôi" giữ run
  await page.click('.rs-gear'); await sleep(250);
  await page.click('.rs-panel .rs-big.c-red'); await sleep(250);
  const cf = await page.evaluate(() => ({ box: !!document.querySelector('.rs-confirm'), saved: !!window.BZ_DEBUG.saved() }));
  await page.keyboard.press('Escape'); await sleep(200);
  const cf2 = await page.evaluate(() => ({ box: !!document.querySelector('.rs-confirm'), saved: !!window.BZ_DEBUG.saved(), run: !!window.BZUI.state.run }));
  check('INTERACT-13: "Bỏ run này" hỏi lại; Esc = giữ run', cf.box && cf.saved && !cf2.box && cf2.saved && cf2.run, JSON.stringify([cf, cf2]));
  await page.keyboard.press('Escape'); await sleep(200);
  check('sửa theo review (máy tính): 0 lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function reviewPhone(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(400);
  await freshRun(page);
  // INTERACT-12 / MOBILE-3: chạm hàng → tooltip; chạm nền → tắt; chạm lại hàng KHÔNG mua (chỉ xem lại)
  let r = await run(page);
  const mi = r.phase.options.findIndex(o => o.type === 'merchant');
  await page.evaluate(i => window.BZ_DEBUG.cmd({ t: 'pick', i }), mi < 0 ? 0 : mi);
  await waitScreen(page, 'merchant'); await sleep(2600);
  const st = await stockRects(page), g0 = (await run(page)).gold;
  await page.touchscreen.tap(st[0].x, st[0].y); await sleep(300);
  const tip1 = await page.evaluate(() => window.BZTooltip.visible());
  const bgPt = await page.evaluate(() => { const b = window.BZView.refs.stage.getBoundingClientRect(), k = window.BZView.scale; return { x: b.left + 250 * k, y: b.top + 160 * k }; });
  await page.touchscreen.tap(bgPt.x, bgPt.y); await sleep(300);
  const tip2 = await page.evaluate(() => window.BZTooltip.visible());
  await page.touchscreen.tap(st[0].x, st[0].y); await sleep(400);
  const g1 = (await run(page)).gold;
  check('INTERACT-12 / MOBILE-3: chạm hàng mở tooltip, chạm nền tắt, chạm lại hàng chỉ xem (vàng ' + g0 + ' → ' + g1 + ')', tip1 && !tip2 && g1 === g0, JSON.stringify({ tip1, tip2 }));
  await page.touchscreen.tap(bgPt.x, bgPt.y); await sleep(200);
  // INTERACT-10 / MOBILE-8: vùng chạm ≥ 44 px màn hình: chạm lệch 18 px khỏi tâm vẫn trúng (Rời đi, bánh răng)
  const hits = await page.evaluate(() => ['.rs-merchant-ctl .leave', '.rs-gear'].map(sel => {
    const e = document.querySelector(sel), b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const ok = [[0, 20], [0, -20], [20, 0], [-20, 0]].every(([dx, dy]) => { const h = document.elementFromPoint(cx + dx, cy + dy); return !!(h && (h === e || e.contains(h))); });
    return sel + ' ' + Math.round(b.width) + '×' + Math.round(b.height) + (ok ? ' ok' : ' TRƯỢT');
  }));
  check('INTERACT-10: chạm lệch 20 px quanh tâm vẫn trúng nút (vùng chạm ≥ 40 px)', hits.every(h => / ok$/.test(h)), hits.join(' | '));
  // MOBILE-9: chữ gợi ý ≥ 10 px màn hình
  const fs = await page.evaluate(() => { const k = window.BZView.scale; return ['.rs-hint', '.rs-side-name small', '.rs-side-name h3', '.rs-big span'].map(s => { const e = document.querySelector(s); return s + ' ' + (e ? (parseFloat(getComputedStyle(e).fontSize) * k).toFixed(1) : '-'); }); });
  check('MOBILE-9: chữ gợi ý / nhãn / nút ≥ 9 px màn hình ở 844×390', fs.every(x => parseFloat(x.split(' ').pop()) >= 9), fs.join(' | '));
  await shot(page, '53-review-phone-merchant');
  // MOBILE-1: trận: chạm thẻ → tooltip ở lại sau khi nhấc tay
  await page.click('.rs-merchant-ctl .leave').catch(() => {});
  let d = await drive(page, r => r.phase.kind === 'choose' && r.hour === 2, 300);
  await sleep(900);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'pick', i: 0 }));
  await waitScreen(page, 'fight'); await sleep(500);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'fight' }));
  await waitScreen(page, 'fightResult'); await sleep(1200);
  await page.evaluate(() => window.BZUI.combat.pause(true));
  const cc = await page.evaluate(() => { const cs = window.BZView.cards(); const k = Object.keys(cs).map(u => cs[u].el || cs[u]).filter(e => e && e.getBoundingClientRect).map(e => e.getBoundingClientRect()).filter(b => b.width > 0).sort((a, b) => b.top - a.top)[0]; return k ? { x: k.left + k.width / 2, y: k.top + k.height / 2 } : null; });
  if (cc) { await page.touchscreen.tap(cc.x, cc.y); await sleep(600); }
  const tipF = await page.evaluate(() => window.BZTooltip.visible());
  check('MOBILE-1: trận: chạm thẻ → tooltip còn sau 600 ms', d.ok && !!cc && tipF, JSON.stringify({ d, cc, tipF }));
  await shot(page, '54-review-phone-fight-tip');
  // MOBILE-10: máy dọc → lời nhắc xoay ngang
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const rot = await page.evaluate(() => getComputedStyle(document.querySelector('.rs-rotate')).display);
  check('MOBILE-10: máy dọc hiện "Xoay ngang điện thoại"', rot !== 'none', rot);
  await shot(page, '55-review-phone-portrait');
  check('sửa theo review (điện thoại): 0 lỗi', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  let srv = null, base = process.env.BZ_URL;
  if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const t0 = Date.now();
  const ONLY = process.env.ONLY || ''; // ONLY=review: chỉ chạy phần sửa theo review
  if (!ONLY) try { await desktop(browser, base); } catch (e) { check('máy tính: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (!ONLY) try { await phase4(browser, base); } catch (e) { check('pha 4: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (!ONLY) try { await phone(browser, base); } catch (e) { check('điện thoại: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  try { await reviewFixes(browser, base); } catch (e) { check('sửa theo review (máy tính): chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  try { await reviewPhone(browser, base); } catch (e) { check('sửa theo review (điện thoại): chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  await browser.close();
  if (srv) srv.close();
  console.log('\nChợ Phiên — chơi thử (' + base + '): ' + pass + ' đạt, ' + fail + ' trượt, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
