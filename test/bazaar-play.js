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
['cards', 'heroes', 'monsters', 'mode', 'encounters', 'shops'].forEach(f => require(path.join(ROOT, 'games/bazaar/data', f + '.js')));
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
  await sleep(500);
  // ---- sảnh 8 hero (từ UI-02 màn tiêu đề chính là sảnh: không còn bước "Chơi" riêng) (BZ_HEROES.order): 7 chơi được + The Dragons khoá ----
  const lobby = await page.evaluate(() => Array.from(document.querySelectorAll('.lobby .hex')).map(b => ({ h: b.dataset.hero, locked: b.classList.contains('locked') })));
  check('sảnh: 8 lục giác, 7 hero chơi được, The Dragons khoá', lobby.length === 8 && lobby.filter(x => !x.locked).length === 7 && lobby.some(x => x.h === 'TheDragons' && x.locked),
    lobby.map(x => x.h + (x.locked ? '🔒' : '')).join(','));
  const lob = await page.evaluate(() => ({ rank: (document.querySelector('.lobby .lb-me small') || {}).textContent, chips: Array.from(document.querySelectorAll('.lobby .lb-wallet .chip b')).map(b => b.textContent).join('/'),
    pills: Array.from(document.querySelectorAll('.lobby .bar .mode')).map(m => m.dataset.mode).join(','), ready: !!document.querySelector('.lobby .lb-ready'), big: !!document.querySelector('.lobby .big') }));
  check('UI-02 sảnh: bảng người chơi (bậc đầu "Apprentice Merchant"), ví 0/0, hai thẻ chế độ XẾP HẠNG/THƯỜNG, hero to, nút Sẵn sàng',
    lob.rank === 'Apprentice Merchant' && lob.chips === '0/0' && lob.pills === 'ranked,normal' && lob.ready && lob.big, JSON.stringify(lob));
  const parts0 = await page.evaluate(() => Object.keys(window.BZ_CARDS_PARTS || {}).join(','));
  check('mở trang chỉ nạp thẻ chung (data/cards-common.js)', parts0 === 'common', parts0);
  const tags = {};
  for (const h of ['Mak', 'Stelle', 'Jules', 'Karnok']) {
    await page.click('.lobby .hex[data-hero="' + h + '"]'); await sleep(250);
    tags[h] = await page.evaluate(() => document.querySelector('.lobby .info .tag').textContent + ' | ' + document.querySelectorAll('.lobby .info .opts .o').length);
  }
  check('tagline gốc của 4 hero mới (WIKI §4) + 3 lựa chọn mở màn', tags.Mak.startsWith('Alchemical Immortalist') && tags.Stelle.startsWith('Bright Aeronaut') && tags.Jules.startsWith('Chef of the Deeps') && tags.Karnok.startsWith('Monstrous Hunter') && /\| 3$/.test(tags.Karnok), JSON.stringify(tags));
  const karInnate = await page.evaluate(() => document.querySelector('.lobby .info .innate') ? document.querySelector('.lobby .info .innate').textContent : '');
  check('Karnok: bảng hero hiện kỹ năng có sẵn Karnok\'s Rage', /Rage/.test(karInnate), karInnate);
  await shot(page, '02a-hero-karnok');
  await page.click('.lobby .hex[data-hero="TheDragons"]'); await sleep(300);
  await shot(page, '02b-hero-dragons-locked');
  await page.click('.lobby .lb-ready'); await sleep(400);
  const lockMsg = await page.evaluate(() => (document.querySelector('.lobby .lockmsg') || {}).textContent || '');
  check('The Dragons: bấm Sẵn sàng không vào run, hiện lý do khoá', (await screen(page)) === 'title' && /Chưa chơi được/.test(lockMsg), lockMsg.slice(0, 80));
  await page.click('.lobby .hex[data-hero="Pygmalien"]'); await sleep(300);
  await page.click('.lobby .hex[data-hero="Vanessa"]'); await sleep(500);
  await shot(page, '02-hero-select');
  await page.click('.lobby .lb-ready');
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
  // UI-01: chuột phải ghim tooltip, tối màn, ô chọn cấp / bùa chữ tooltip đổi theo cấp, Esc bỏ ghim
  if (s0) {
    await page.mouse.click(s0.x, s0.y, { button: 'right' }); await sleep(400);
    const lk0 = await page.evaluate(() => { const t = document.querySelector('.bz-tip'), sel = document.querySelector('.bz-tip .sel-tier'); const d = document.querySelector('.bz-tipdim');
      return { locked: t.classList.contains('locked'), dim: !!d && getComputedStyle(d).backgroundColor, tiers: sel ? Array.from(sel.options).map(o => o.value).join(',') : '', ench: !!document.querySelector('.bz-tip .sel-ench'),
        tier: (t.querySelector('.head .tier') || {}).textContent, text: (t.querySelector('.lines') || {}).textContent }; });
    await shot(page, '09b-tooltip-locked');
    const opts = lk0.tiers.split(',');
    const other = opts[opts.length - 1];
    await page.selectOption('.bz-tip .sel-tier', other); await sleep(250);
    const lk1 = await page.evaluate(() => { const t = document.querySelector('.bz-tip'); return { tier: (t.querySelector('.head .tier') || {}).textContent, text: (t.querySelector('.lines') || {}).textContent, sel: document.querySelector('.bz-tip .sel-tier').value }; });
    await page.mouse.move(5, 5); await sleep(200);
    const lk2 = await page.evaluate(() => document.querySelector('.bz-tip').classList.contains('locked'));
    await page.keyboard.press('Escape'); await sleep(250);
    const lk3 = await page.evaluate(() => ({ locked: document.querySelector('.bz-tip').classList.contains('locked'), dim: !!document.querySelector('.bz-tipdim') }));
    check('UI-01 ghim tooltip: chuột phải ghim + màn tối rgba(0,0,0,0.35), có ô chọn cấp (' + lk0.tiers + '), đổi cấp ' + lk0.tier + ' → ' + lk1.tier + ' (chữ đổi), rê chỗ khác vẫn ghim, Esc bỏ ghim',
      lk0.locked && /rgba\(0, 0, 0, 0\.35\)/.test(lk0.dim) && opts.length >= 2 && lk1.sel === other && lk1.tier !== lk0.tier && lk2 && !lk3.locked && !lk3.dim, JSON.stringify([lk0, lk1, lk2, lk3]));
  }
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
    // W-07: thẻ bóng ma giữ tới khi bấm (không còn tự sang VS sau 1,2 s)
    await page.waitForSelector('.rs-ghostpick', { timeout: 4000 }).catch(() => {});
    await sleep(1600); await shot(page, '18-pvp-ghost');
    await page.click('.rs-ghostpick', { timeout: 2000 }).catch(() => {});
    let vsSeen = true;
    try { await page.waitForSelector('.rs-vs', { timeout: 4000 }); } catch (e) { vsSeen = false; }
    check('PvP: màn VS hiện trước trận', vsSeen);
    await sleep(900); await shot(page, '18a-pvp-vs');
    const vsTxt = await page.evaluate(() => { const v = document.querySelector('.rs-vs'); return v ? v.querySelector('.plate.r b').textContent + ' | ' + v.querySelector('.plate.l b').textContent : ''; });
    check('màn VS có tên hero và "Bóng ma của <tên>"', /Vanessa/.test(vsTxt) && /Bóng ma của /.test(vsTxt), vsTxt);
    const vsRank = await page.evaluate(() => { const v = document.querySelector('.rs-vs'), r = window.BZ_DEBUG.run(), o = r.phase.opponent;
      return { l: v.querySelector('.plate.l small').textContent, r: v.querySelector('.plate.r small').textContent, wl: r.wins, prl: r.prestige, wr: o.wins || 0, wantL: window.BZUI.rankTitle(r.wins, r.prestige), wantR: window.BZUI.rankTitle(o.wins || 0, 0),
        crest: (v.querySelector('.plate.l .crest').style.backgroundImage || '').indexOf('Gem_256_') >= 0, swirl: !!v.querySelector('.swirl'), flash: !!v.querySelector('.flash') }; });
    check('UI-11 màn VS: bảng tên có tên bậc theo thắng/uy tín (trái "' + vsRank.l + '", phải "' + vsRank.r + '"), huy hiệu Gem gốc, xoáy vàng + chớp trắng',
      vsRank.l === vsRank.wantL && vsRank.r === vsRank.wantR && /^[A-Z][a-z]+( [A-Z][a-z]+)+$/.test(vsRank.l) && vsRank.crest && vsRank.swirl && vsRank.flash, JSON.stringify(vsRank));
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
  const endM = await page.evaluate(() => { const r = window.BZUI.state.run, w = r.wins, want = w >= 10 ? 'Gold' : w >= 7 ? 'Silver' : 'Bronze';
    return { want, medal: ((document.querySelector('.endrun .rib .mdl') || { style: {} }).style.backgroundImage || ''), pre: !!document.querySelector('.endrun .pre .medal'), burst: !!document.querySelector('.endrun .pre .burst'),
      chests: document.querySelectorAll('.endrun .chests .ch').length, top: document.querySelectorAll('.endrun .chests .ch.top').length, note: (document.querySelector('.endrun .chestnote') || {}).textContent, wins: w }; });
  check('UI-14 hết run: huy chương cúp ' + endM.want + ' trên thẻ, medal + burst trước thẻ, 3 rương theo mốc, ghi chú rương (' + endM.wins + ' thắng)',
    endM.medal.indexOf('UI_Profile_Trophy_' + endM.want) >= 0 && endM.pre && endM.burst && endM.chests === 3 && endM.top === (endM.wins >= 4 ? 1 : 0) && !!endM.note, JSON.stringify(endM));
  check('màn hết run: bàn tốt nhất (run.best) hiện đủ thẻ + nhãn', endB.best && endB.n === endB.want && /Bàn tốt nhất/.test(endB.lbl), JSON.stringify(endB));
  // trang xem trận (Đấu thử) vẫn mở được từ tiêu đề
  await page.goto(base + '/games/bazaar/index.html', { waitUntil: 'load' }); await ready(page); await sleep(400);
  await page.click('.lobby .lb-view');
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
  const fz = await page.evaluate(() => ({ n: document.querySelectorAll('.rs-top .rs-fate-orb').length, want: window.BZ_DEBUG.run().phase.choices.length, day: !!document.querySelector('.rs-daycard') }));
  await page.hover('.rs-fate-orb[data-i="1"]'); await sleep(300);
  const fzTip = await page.evaluate(() => (document.querySelector('.rs-tip2') || {}).textContent || '');
  const fzName = await page.evaluate(() => window.BZ_DEBUG.run().phase.choices[1].name);
  const fz2 = await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'choose', i: 1 }));
  check('Số phận: cầu tím theo dữ liệu phase, không thẻ ngày, tooltip nêu tên bước thật ("' + fzName + '"), chọn đi tiếp', fz.n === 3 && fz.n === fz.want && !fz.day && fzName.length > 3 && fzTip.indexOf(fzName) >= 0 && fz2.ok, JSON.stringify([fz, fzName, fzTip.slice(0, 60), fz2]));

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
  const chs = await page.evaluate(() => { const ph = window.BZ_DEBUG.run().phase; return { kind: ph.kind, step: !!ph.stepId, n: document.querySelectorAll('.rs-choices .rs-choice').length, kick: !!document.querySelector('.rs-stall .rs-exit') && !document.querySelector('.rs-side-name'), want: (ph.choices || []).length }; });
  check('sự kiện → bước có Then: màn vẽ lại chuỗi kế (' + ch.then + ' lựa chọn, khung trên là quầy lều/xe, không bảng tên)', chr.ok && chs.kind === 'event' && chs.step && chs.n === chs.want && chs.kick === true, JSON.stringify([chr, chs]));
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
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(400);
  const veils = await page.evaluate(() => Array.from(document.querySelectorAll('.bz-card .veil')).filter(v => getComputedStyle(v).display !== 'none').length);
  check('thẻ ngoài trận không bị phủ xám hồi chiêu, kể cả sau khi đổi cỡ cửa sổ (layout gọi lại C.update với {})', veils === 0, 'veil hiện: ' + veils);

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
  await page.click('.rs-merchant-ctl .leave'); await sleep(1500);
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
  const fs = await page.evaluate(() => { const k = window.BZView.scale; return ['.rs-hint', '.rs-side-name small', '.rs-side-name h3', '.rs-big span', '.rs-cell .tag b', '.rs-price b'].map(s => { const e = document.querySelector(s); return e ? s + ' ' + (parseFloat(getComputedStyle(e).fontSize) * k).toFixed(1) : null; }).filter(Boolean); });
  check('MOBILE-9: chữ gợi ý / nhãn / nút ≥ 9 px màn hình ở 844×390', fs.length > 0 && fs.every(x => parseFloat(x.split(' ').pop()) >= 9), fs.join(' | '));
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

// ---------- đợt 2 (FIX7, nhánh ui2): pha chọn bùa, đổi thẻ ở loot, nhãn lên cấp, Số phận, lời thương nhân, huy hiệu, thẻ bóng ma, mã chết ----------
async function wave2(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(400);
  await freshRun(page);

  // ---- W-01: pha enchantPick ----
  const w1 = await page.evaluate(() => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = R.clone(window.BZ_DEBUG.run()), cx = { run, events: [] };
    const tpl = Object.values(window.BZ_CARDS).find(t => t.Type === 'Item' && t.Size === 'Small' && (t.Heroes || []).indexOf('Common') >= 0 && Object.keys(t.Enchantments || {}).length >= 4);
    const ci = R.gainCard(cx, { id: tpl.Id, tier: 'Bronze' }, 'hand', null, 'test');
    const pid = Object.values(E.pedestals).find(p => p.InternalName === 'The Artist (Level Up)').Id;
    R.ENCOUNTERS.pedestal.enter(cx, { id: pid }, 'endHour');
    window.BZ_DEBUG.load(cx.run);
    return { uid: ci.uid, id: tpl.Id, name: R.title(tpl) };
  });
  await sleep(500);
  const w1c = await page.evaluate(u => window.BZ_DEBUG.cmd({ t: 'commit', uid: u }), w1.uid);
  await waitScreen(page, 'enchantPick'); await sleep(1400); await shot(page, 'w01-enchantpick');
  const w1s = await page.evaluate(() => {
    const ph = window.BZ_DEBUG.run().phase, cards = Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).filter(e => e._rs && !e.classList.contains('despawn'));
    return { kind: ph.kind, options: ph.options, n: cards.length, names: cards.map(e => (e.querySelector('.rs-enchname') || {}).textContent), enchs: cards.map(e => e._rs.card.ench) };
  });
  const tipOf = async i => {
    const c = await page.evaluate(i => { const e = Array.from(document.querySelectorAll('.rs-cards .bz-card.top'))[i]; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, i);
    await page.mouse.move(c.x, c.y - 30); await sleep(100); await page.mouse.move(c.x, c.y); await sleep(350);
    return page.evaluate(() => (window.BZTooltip.el() || { textContent: '' }).textContent);
  };
  const t0 = await tipOf(0), t1 = await tipOf(1);
  check('W-01 enchantPick: màn riêng, một bản thẻ cho mỗi bùa (' + w1s.options.length + '), nhãn tên bùa, tooltip hai bùa khác chữ',
    w1c.ok && w1c.phase === 'enchantPick' && w1s.kind === 'enchantPick' && w1s.n === w1s.options.length && w1s.n >= 4 && JSON.stringify(w1s.names) === JSON.stringify(w1s.options) && JSON.stringify(w1s.enchs) === JSON.stringify(w1s.options) && t0.length > 20 && t0 !== t1,
    JSON.stringify([w1c, w1s, t0.slice(0, 50), t1.slice(0, 50)]));
  await page.mouse.move(5, 5); await sleep(200);
  const w1r = await page.evaluate(() => { const cards = Array.from(document.querySelectorAll('.rs-cards .bz-card.top')); const e = cards[1]; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(w1r.x, w1r.y); await sleep(900);
  const w1d = await page.evaluate(u => { const r = window.BZ_DEBUG.run(), c = window.BZRun.allCards(r).find(x => x.uid === u); return { ench: c && c.ench, kind: r.phase.kind }; }, w1.uid);
  check('W-01: bấm bùa thứ hai → thẻ mang đúng bùa đó, rời màn chọn bùa', w1d.ench === w1s.options[1] && w1d.kind !== 'enchantPick', JSON.stringify(w1d));
  check('W-01: màn enchantPick đã đăng ký (bấm thẻ, hết chỗ xử lý như màn phần thưởng)', await page.evaluate(() => !!window.BZUI.SCREENS.enchantPick && typeof window.BZUI.SCREENS.enchantPick.onCardClick === 'function'));

  // ---- W-02: đổi thẻ ở loot (Orlin: 6 vàng, 1 lượt) ----
  const orlin = (extra) => page.evaluate(ex => { const R = window.BZRun, run = R.clone(window.BZ_DEBUG.run()); run.gold = 30; const cx = { run, events: [] };
    R.ENCOUNTERS.event.enter(cx, { id: Object.values(window.BZ_ENCOUNTERS.events).find(e => e.InternalName === 'Orlin (Level Up)').Id }, 'beginHour');
    if (ex) { cx.run.phase.take = 2; cx.run.phase.taken = 1; }
    window.BZ_DEBUG.load(cx.run); }, !!extra);
  await orlin(false);
  await waitScreen(page, 'loot'); await sleep(1500); await shot(page, 'w02-loot-reroll');
  const w2a = await page.evaluate(() => ({ cost: (document.querySelector('.rs-reroll .tag b') || {}).textContent, off: document.querySelector('.rs-reroll').classList.contains('off'),
    ids: window.BZ_DEBUG.run().phase.picks.map(p => p.card.id), gold: window.BZ_DEBUG.run().gold, rerolls: window.BZ_DEBUG.run().phase.rerolls }));
  await page.click('.rs-reroll'); await sleep(900);
  const w2b = await page.evaluate(() => { const r = window.BZ_DEBUG.run(); return { ids: r.phase.picks.map(p => p.card.id), gold: r.gold, rerolls: r.phase.rerolls, off: document.querySelector('.rs-reroll').classList.contains('off'),
    shown: Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).filter(e => e._rs && e._rs.kind === 'loot' && !e.classList.contains('despawn')).length }; });
  check('W-02 loot: nút đổi + thẻ giá ' + w2a.cost + ' vàng; bấm → trừ ' + (w2a.gold - w2b.gold) + ' vàng, 3 thẻ mới khác thẻ cũ, hết lượt thì nút xám',
    w2a.cost === '6' && !w2a.off && w2a.rerolls === 1 && w2a.gold - w2b.gold === 6 && w2b.rerolls === 0 && w2b.off && w2b.shown === w2b.ids.length && w2b.ids.every(i => w2a.ids.indexOf(i) < 0), JSON.stringify([w2a, w2b]));
  await page.click('.rs-reroll', { force: true }); await sleep(300); // nút xám mang aria-disabled: ép bấm
  const w2t = await page.evaluate(() => (document.querySelector('.rs-toast') || {}).textContent);
  check('W-02: hết lượt vẫn bấm được để nghe lý do ("Hết lượt đổi hàng")', /Hết lượt/.test(w2t), w2t);
  await orlin(true); await sleep(700);
  await page.click('.rs-reroll', { force: true }); await sleep(300);
  const w2l = await page.evaluate(() => ({ off: document.querySelector('.rs-reroll').classList.contains('off'), toast: (document.querySelector('.rs-toast') || {}).textContent, gold: window.BZ_DEBUG.run().gold, direct: window.BZ_DEBUG.cmd({ t: 'reroll' }) }));
  check('W-02: sau khi đã lấy một thẻ, nút khoá ("Đã lấy thẻ") và lệnh reroll bị từ chối', w2l.off && /Đã lấy thẻ/.test(w2l.toast) && w2l.gold === 30 && !w2l.direct.ok, JSON.stringify(w2l));

  // ---- W-03: nhãn ô lên cấp ----
  const lv = async (level) => {
    await page.evaluate(lv => { const R = window.BZRun, run = R.clone(window.BZ_DEBUG.run()); run.level = lv; run.pendingLevelUps = 1; const cx = { run, events: [] }; R.enterLevelUp(cx); window.BZ_DEBUG.load(cx.run); }, level);
    await sleep(1300);
    return page.evaluate(() => ({ kind: window.BZ_DEBUG.run().phase.kind, slots: window.BZ_DEBUG.run().phase.choices.map(c => c.slot), labels: Array.from(document.querySelectorAll('.rs-enc .lbl')).map(e => e.textContent), frames: document.querySelectorAll('.rs-enc').length }));
  };
  const l2 = await lv(2), l10 = await lv(10); await shot(page, 'w03-levelup-10'); const l19 = await lv(19); await shot(page, 'w03-levelup-19'); const l8 = await lv(8); await shot(page, 'w03-levelup-8');
  check('W-03 lên cấp: số ô theo cấp (2 → 1, 10 → 2, 19 → 3, 8 → 3), mỗi khung có nhãn theo ô (trước đây không nhãn)',
    [l2, l10, l19, l8].every(x => x.kind === 'levelUp' && x.labels.length === x.frames) && l2.frames === 1 && l10.frames === 2 && l19.frames === 3 && l8.frames === 3 &&
    l2.labels[0] === 'Thầy kỹ năng Đồng' && l10.labels.join('|') === 'Địa điểm yểm bùa ngẫu nhiên|Họa sĩ: tự chọn bùa' && l19.labels.every(x => x === 'Địa điểm yểm bùa ngẫu nhiên') && l8.labels.join('|') === 'Thầy kỹ năng Vàng|Thầy kỹ năng ngẫu nhiên|Thầy kỹ năng ngẫu nhiên',
    JSON.stringify([l2, l10, l19, l8]));

  // ---- W-04: Số phận: ảnh theo id; Crossroads hai bệ ----
  await page.evaluate(() => { const R = window.BZRun, cx = { run: R.clone(window.BZ_DEBUG.run()), events: [] }; R.enterFates(cx); cx.run.phase.choices = R.fatesChoices(cx.run); window.BZ_DEBUG.load(cx.run); });
  await sleep(1500); await shot(page, 'w04-fates');
  const w4 = await page.evaluate(() => {
    const want = window.BZUI.top.FATE_ART, ch = window.BZ_DEBUG.run().phase.choices;
    const icos = Array.from(document.querySelectorAll('.rs-fate-orb .ico')).map(e => ({ id: e.dataset.fate, bg: e.style.backgroundImage }));
    return { ids: ch.map(c => c.id), ok: ch.every(c => icos.some(i => i.id === c.id && i.bg.indexOf(want[c.id]) >= 0)), distinct: new Set(icos.map(i => i.bg)).size, stepIds: ch.every(c => !!c.stepId && 'artKey' in c) };
  });
  check('W-04 Số phận: id bounty/crossroads/legacy/fortunes, mỗi quả cầu một ảnh riêng theo id (4 ảnh khác nhau)', w4.ok && w4.distinct === 4 && w4.ids.slice().sort().join() === 'bounty,crossroads,fortunes,legacy' && w4.stepIds, JSON.stringify(w4));
  const ci = await page.evaluate(() => window.BZ_DEBUG.run().phase.choices.findIndex(c => c.id === 'crossroads'));
  const w4c = await page.evaluate(i => window.BZ_DEBUG.cmd({ t: 'choose', i }), ci);
  await waitScreen(page, 'event'); await sleep(1400); await shot(page, 'w04-crossroads');
  const w4e = await page.evaluate(() => {
    const ph = window.BZ_DEBUG.run().phase, cs = Array.from(document.querySelectorAll('.rs-choice.k-pedestal'));
    return { kind: ph.kind, kinds: ph.choices.map(c => c.kind), n: cs.length, imgs: cs.map(e => /url\(/.test(e.querySelector('.img').style.backgroundImage)), slots: cs.map(e => (e.querySelector('.slot') || {}).textContent) };
  });
  check('W-04 Crossroads: hai lựa chọn kind "pedestal" có ảnh bệ + nhãn ô (trước đây ảnh trống)', w4c.ok && w4e.kind === 'event' && w4e.n === 2 && w4e.kinds.every(k => k === 'pedestal') && w4e.imgs.every(Boolean) && w4e.slots.join('|') === 'Địa điểm yểm bùa ngẫu nhiên|Họa sĩ: tự chọn bùa', JSON.stringify(w4e));

  // ---- W-05: lời thương nhân ----
  await page.evaluate(() => { window.__vo = []; const A = window.BZAudio, p = A.play; A.play = function (k) { if (/^vo\.merchant\./.test(k)) window.__vo.push(k); return p.apply(this, arguments); }; window.BZUI.MERCHANT_IDLE_MS = 700; });
  const merch = async (name, gold) => {
    await page.evaluate(([n, g]) => { const R = window.BZRun, run = R.clone(window.BZ_DEBUG.run()); run.gold = g; run.phase = { kind: 'choose', options: [] }; const cx = { run, events: [] };
      R.ENCOUNTERS.merchant.enter(cx, { id: Object.values(window.BZ_ENCOUNTERS.events).find(e => e.InternalName === n || e.Title === n).Id }, 'endHour'); window.BZ_DEBUG.load(cx.run); }, [name, gold]);
    await waitScreen(page, 'merchant'); await sleep(1300);
  };
  const voKey = (so, k) => page.evaluate(([so, k]) => (window.BZ_AUDIO_VOICE[so] || {})[k], [so, k]);
  await merch("Pearl's Dig Site", 900); await shot(page, 'w05-merchant');
  const PK = {}; for (const k of ['enter', 'buyitem', 'multiclick', 'idle', 'exit']) PK[k] = await voKey('PearlAudioSO', k);
  await page.evaluate(() => { window.__vo.length = 0; });
  await sleep(1600); // idle (700 ms)
  const vIdle = await page.evaluate(() => window.__vo.slice());
  for (let n = 0; n < 3; n++) { await page.click('.rs-who'); await sleep(80); }
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'buy', i: 0 })); await sleep(300);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'leave' })); await sleep(300);
  const vAll = await page.evaluate(() => window.__vo.slice());
  check('W-05 Pearl Dig Site: lời idle / multiclick (3 cú bấm) / buyitem / buyexit→exit theo khoá BZ_AUDIO_VOICE (khoá theo tệp âm, không theo tên gọi)',
    !!PK.idle && vIdle.indexOf(PK.idle) >= 0 && vAll.indexOf(PK.multiclick) >= 0 && vAll.indexOf(PK.buyitem) >= 0 && vAll.indexOf('vo.merchant.pearlsdigsite.buyexit') >= 0 && vAll.indexOf(PK.exit) >= 0,
    JSON.stringify({ PK, vIdle, vAll }));
  await merch('Aimbot', 900);
  const AK = { reroll: await voKey('AimbotAudioSO', 'reroll'), buyexit: await voKey('AimbotAudioSO', 'buyexit') };
  await page.evaluate(() => { window.__vo.length = 0; window.BZUI.MERCHANT_IDLE_MS = 999999; });
  await page.click('.rs-reroll'); await sleep(500);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'buy', i: 0 })); await sleep(300);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'leave' })); await sleep(300);
  const vA = await page.evaluate(() => window.__vo.slice());
  check('W-05 Aimbot: đổi hàng → reroll; mua rồi rời → buyexit', !!AK.reroll && vA.indexOf(AK.reroll) >= 0 && vA.indexOf(AK.buyexit) >= 0, JSON.stringify({ AK, vA }));
  await page.evaluate(() => { const R = window.BZRun, cx = { run: R.clone(window.BZ_DEBUG.run()), events: [] };
    const tpl = Object.values(window.BZ_CARDS).find(t => t.Type === 'Item' && t.Size === 'Large' && (t.Heroes || []).indexOf('Common') >= 0);
    R.gainCard(cx, { id: tpl.Id, tier: 'Bronze' }, 'stash', null, 'test'); window.BZ_DEBUG.load(cx.run); });
  await merch('Quixel', 900);
  const QK = { sellitem: await voKey('QuixelAudioSO', 'sellitem'), sellsized: await voKey('QuixelAudioSO', 'sellsized'), exit: await voKey('QuixelAudioSO', 'exit') };
  const sl = await page.evaluate(() => { const R = window.BZRun, r = window.BZ_DEBUG.run(), all = R.allCards(r); const sz = c => R.SIZE[(R.tpl(c.id) || {}).Size] || 1;
    const big = all.find(c => c.section !== 'skills' && sz(c) > 1), small = all.find(c => c.section !== 'skills' && sz(c) === 1); return { big: big && big.uid, small: small && small.uid }; });
  await page.evaluate(() => { window.__vo.length = 0; window.BZUI.MERCHANT_IDLE_MS = 999999; });
  if (sl.small) await page.evaluate(u => window.BZ_DEBUG.cmd({ t: 'sell', uid: u }), sl.small);
  await sleep(200);
  const vSmall = await page.evaluate(() => window.__vo.slice());
  if (sl.big) await page.evaluate(u => window.BZ_DEBUG.cmd({ t: 'sell', uid: u }), sl.big);
  await sleep(200);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'leave' })); await sleep(300);
  const vQ = await page.evaluate(() => window.__vo.slice());
  check('W-05 Quixel: bán món nhỏ → sellitem; bán món lớn → sellsized; rời không mua → exit (không buyexit)',
    !!sl.small && !!sl.big && vSmall.indexOf(QK.sellitem) >= 0 && vSmall.indexOf(QK.sellsized) < 0 && vQ.indexOf(QK.sellsized) >= 0 && vQ.indexOf(QK.exit) >= 0 && vQ.indexOf('vo.merchant.quixel.buyexit') < 0, JSON.stringify({ sl, QK, vSmall, vQ }));
  await page.evaluate(() => { window.BZUI.MERCHANT_IDLE_MS = 20000; });

  // ---- W-06: huy hiệu dưới khung = sprite gốc khi đã bóc ----
  const hourRun = () => page.evaluate(() => { const R = window.BZRun, run = R.clone(window.BZ_DEBUG.run()); run.phase = { kind: 'choose', options: R.hourOptions(run) }; window.BZ_DEBUG.load(run); });
  await hourRun(); await sleep(1300);
  await shot(page, 'w06-banner-sprites');
  const b1 = await page.evaluate(() => ({ spr: document.querySelectorAll('.rs-enc .pennant.spr').length, svg: document.querySelectorAll('.rs-enc .pennant svg').length, n: document.querySelectorAll('.rs-enc').length,
    css: (document.querySelector('.rs-enc .pennant.spr') || { style: {} }).style.backgroundImage }));
  const saved = await page.evaluate(() => { const m = window.BZ_ART.map, o = {}; ['Merchant', 'Monster', 'Quest', 'Skill'].forEach(k => { o[k] = m['ui:Encounter_Banner_' + k + '_P']; delete m['ui:Encounter_Banner_' + k + '_P']; }); return o; });
  await hourRun(); await sleep(1300);
  const b0 = await page.evaluate(() => ({ spr: document.querySelectorAll('.rs-enc .pennant.spr').length, svg: document.querySelectorAll('.rs-enc .pennant svg').length, n: document.querySelectorAll('.rs-enc').length }));
  await page.evaluate(o => { Object.keys(o).forEach(k => { if (o[k]) window.BZ_ART.map['ui:Encounter_Banner_' + k + '_P'] = o[k]; }); }, saved);
  check('W-06 huy hiệu: chưa có sprite → giữ SVG cũ (' + b0.svg + '/' + b0.n + '); có khoá Encounter_Banner_*_P → dùng sprite, bỏ SVG (' + b1.spr + '/' + b1.n + ')',
    b0.n === 3 && b0.spr === 0 && b0.svg === 3 && b1.spr === 3 && b1.svg === 0 && /Encounter_Banner_[A-Za-z]+_P[.]webp/.test(b1.css), JSON.stringify([b0, b1]));

  // ---- W-07: thẻ bóng ma chờ cú bấm ----
  await page.evaluate(() => { const R = window.BZRun, run = R.clone(window.BZ_DEBUG.run()); run.hour = R.TUNING.PVP_HOUR; const cx = { run, events: [] }; R.ENCOUNTERS.combat.enterPvp(cx); window.BZ_DEBUG.load(cx.run); });
  await waitScreen(page, 'fight'); await sleep(3200); await shot(page, 'w07-ghost-hold');
  const g0 = await page.evaluate(() => ({ ghost: !!document.querySelector('.rs-ghostpick:not(.out)'), vs: !!document.querySelector('.rs-vs'), screen: window.BZ_DEBUG.screen() }));
  await page.click('.rs-ghostpick'); await sleep(1500);
  const g1 = await page.evaluate(() => ({ vs: !!document.querySelector('.rs-vs'), ghostGone: !document.querySelector('.rs-ghostpick:not(.out)') }));
  check('W-07 PvP: thẻ bóng ma còn nguyên sau 3,2 s (chưa sang VS), bấm vào thẻ → màn VS', g0.ghost && !g0.vs && g0.screen === 'fight' && g1.vs && g1.ghostGone, JSON.stringify([g0, g1]));
  await page.waitForFunction(() => !document.querySelector('.rs-vs'), null, { timeout: 8000 }).catch(() => {});

  // ---- W-08: mã chết đã gỡ, hành vi không đổi ----
  const src = await page.evaluate(async () => {
    const g = u => fetch(u).then(r => r.text());
    return { ev: await g('js/ui/screens/event.js'), tr: await g('js/ui/transitions.js'), css: await g('css/run.css'), vs: typeof window.BZUI.transitions.vsScreen, fates: window.BZUI.SCREENS.fates !== window.BZUI.SCREENS.levelUp, cv: typeof window.BZUI.transitions.cancelVs };
  });
  check('W-08 trừ mã chết: event.js không còn màn fates / choiceScreen, transitions.js không còn vsScreen, run.css không còn .rs-fates-dim / .rs-map.fates / .rs-screen.herosel; vsScreen + fates của fight.js vẫn chạy',
    !/SCREENS\.fates/.test(src.ev) && !/choiceScreen|dramatic/.test(src.ev) && !/T\.vsScreen\s*=/.test(src.tr) && !/\.rs-fates-dim|\.rs-map\.fates|\.rs-screen\.herosel/.test(src.css) && src.vs === 'function' && src.cv === 'function' && src.fates, JSON.stringify({ vs: src.vs, fates: src.fates }));
  check('đợt 2 (ui2): 0 lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---- review9 chơi thử, sửa giao diện (D:\bazaar-ref\review9\FIX-U2.md) ----
// Dựng tay một pha thương nhân: tay có thẻ Nhỏ ở các ô `occ`, kho trống, hàng = 3 thẻ Nhỏ giá 2 (thương nhân "Sells Small items")
async function u2Merchant(page, occ, level) {
  return page.evaluate(([occ, level]) => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = R.clone(window.BZ_DEBUG.run());
    const small = Object.keys(window.BZ_CARDS).filter(id => { const t = R.tpl(id); return t && t.Size === 'Small' && !R.isSkill(t) && !R.isJunk(t) && !R.isMonsterLoot(t) && t.StartingTier === 'Bronze'; });
    const mid = Object.keys(E.events).find(id => /Sells Small items/.test(E.events[id].Desc || '') && E.events[id].Title);
    run.level = level; run.gold = 100; let u = 9100;
    run.board.hand = occ.map((s, k) => ({ uid: 'u2' + (u++), id: small[k], tier: 'Bronze', ench: null, socket: s, size: 1, section: 'hand', mods: {} }));
    run.board.stash = [];
    run.phase = { kind: 'choose', options: [] };
    const cx = { run, events: [] };
    R.ENCOUNTERS.merchant.enter(cx, { id: mid }, 'endHour');
    cx.run.phase.stock = [20, 21, 22].map(k => ({ card: { id: small[k], tier: 'Bronze', ench: null }, price: 2 }));
    cx.run.phase.dealt = cx.run.phase.stock.map(x => x.card.id);
    return window.BZ_DEBUG.load(cx.run);
  }, [occ, level]);
}
async function reviewU2(browser, base) {
  // ---------- máy tính 1280×720 ----------
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await ctx.newPage(), errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(400);
  await freshRun(page, 'Mak');
  // P2-4: kéo mua NHANH (4 bước chuột, bước đầu > 100 px) thẻ xa nhất vào ô trống 1 kẹp giữa ô 0 và ô 2 đã có thẻ.
  // Trước: độ lệch cầm lấy theo lần rê vượt ngưỡng chứ không theo chỗ nhấn → tâm thẻ lệch 1-2 ô → "Không đặt vừa chỗ này"
  await u2Merchant(page, [0, 2, 3, 4, 5, 6, 7, 8], 12);
  await waitScreen(page, 'merchant'); await sleep(2200);
  let st = await stockRects(page);
  const far = st.reduce((a, x) => x.x > a.x ? x : a), g0 = (await run(page)).gold;
  const to1 = await handTarget(page, 1, 1);
  await page.mouse.move(far.x, far.y); await page.mouse.down();
  for (let i = 1; i <= 4; i++) { await page.mouse.move(far.x + (to1.x - far.x) * i / 4, far.y + (to1.y - far.y) * i / 4); await sleep(30); }
  await sleep(80); await page.mouse.up(); await sleep(800);
  let r = await run(page);
  const at1 = r.board.hand.find(c => c.socket === 1), last = await page.evaluate(() => window.BZUI.drag.last);
  check('P2-4 kéo mua nhanh vào ô trống 1 (giữa hai thẻ): mua được, thẻ ở ô 1, vàng ' + g0 + ' → ' + (g0 - 2),
    !!at1 && at1.id === far.id && r.gold === g0 - 2, JSON.stringify({ gold: r.gold, at1: at1 && at1.id.slice(0, 8), want: far.id.slice(0, 8), last }));
  await shot(page, 'u2-01-dragbuy-fast');
  // P1-10 / P3-4: trận PvE thua — tấm phần thưởng của quái hiện phần thưởng treo (như xem trước) suốt trận, không lộ 0/0 từ giây đầu
  await page.evaluate(() => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = R.clone(window.BZ_DEBUG.run());
    run.board.hand = []; run.board.skills = []; run.healthMax = 30; run.phase = { kind: 'choose', options: [] };
    const cid = Object.keys(E.combats).find(id => { const c = E.combats[id]; return c.Gold >= 2 && c.XpReward >= 1 && /Bronze|Silver/.test(c.StartingTier || ''); });
    const cx = { run, events: [] }; R.ENCOUNTERS.combat.enter(cx, { id: cid }, 'endHour');
    window.BZ_DEBUG.load(cx.run);
  });
  await waitScreen(page, 'fight'); await sleep(800);
  const offer = await page.evaluate(() => window.BZ_DEBUG.run().phase.opponent.rewards);
  await page.evaluate(() => window.BZ_DEBUG.cmd({ t: 'fight' }));
  await sleep(1800);
  const mid = await page.evaluate(() => ({ won: window.BZ_DEBUG.run().phase.won, pay: window.BZ_DEBUG.run().phase.rewards,
    plate: Array.from(window.BZView.refs.sides[1].r.querySelectorAll('.bz-reward span')).map(s => +s.textContent) }));
  check('P1-10 / P3-4 trận PvE thua: tấm phần thưởng đối thủ giữa trận = phần thưởng quái ' + offer.gold + '/' + offer.xp + ' (không phải phần trả khi thua ' + (mid.pay.gold || 0) + '/' + (mid.pay.xp || 0) + ')',
    mid.won === false && mid.plate[0] === offer.gold && mid.plate[1] === offer.xp, JSON.stringify({ offer, mid }));
  await shot(page, 'u2-02-pve-plate');
  await page.evaluate(() => window.BZUI.combat.skip()); await sleep(600);
  // P2-8: rương mở xong rồi mới bấm Space ("mở nhanh" trễ) → không mở kho, bấm thẻ thưởng lấy được ngay
  await page.evaluate(() => { const R = window.BZRun, run = window.BZ_DEBUG.run(); run.board.hand = []; run.board.stash = []; run.phase = { kind: 'choose', options: [] };
    const cx = { run: R.clone(run), events: [] }; cx.run.wins = 7; R.enterChest(cx, R.chestFor(7), 'endHour'); window.BZ_DEBUG.load(cx.run); });
  await waitScreen(page, 'chest'); await sleep(4400);
  await page.keyboard.press('Space'); await sleep(700);
  const trayCh = await page.evaluate(() => window.BZUI.cards.trayIsOpen());
  const loot = (await page.evaluate(() => Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).filter(e => e._rs && e._rs.kind === 'loot' && !e.classList.contains('despawn'))
    .map(e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })))[0];
  await page.mouse.click(loot.x, loot.y); await sleep(900);
  r = await run(page);
  check('P2-8 rương: Space ngay sau khi rương tự mở không mở kho, bấm thẻ thưởng lấy được ngay', !trayCh && r.phase.kind !== 'chest' && r.board.hand.length + r.board.stash.length === 1, JSON.stringify({ trayCh, kind: r.phase.kind }));
  check('review9 U2 (máy tính): 0 lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();

  // ---------- điện thoại 844×390 cảm ứng ----------
  ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  page = await ctx.newPage(); errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?seed=' + SEED + '&new=1', { waitUntil: 'load' });
  await ready(page); await sleep(400);
  await freshRun(page, 'Stelle');
  // P3-2: loot của sự kiện (Jungle Ruins → lấy đồ: quầy lều / xe ở khung trên), kho mở, chạm ✕ của kho → kho đóng, KHÔNG hỏi "Bỏ phần thưởng?"
  await page.evaluate(() => {
    const R = window.BZRun, E = window.BZ_ENCOUNTERS, run = R.clone(window.BZ_DEBUG.run());
    const id = Object.keys(E.events).find(i => /^Jungle Ruins$/.test(E.events[i].Title || ''));
    run.phase = { kind: 'choose', options: [] };
    const cx = { run, events: [] }; R.ENCOUNTERS.event.enter(cx, { id }, 'endHour');
    const r2 = R.apply(cx.run, { t: 'choose', i: 0 });
    window.BZ_DEBUG.load(r2.run);
  });
  await waitScreen(page, 'loot'); await sleep(1800);
  const chest = await center(page, '.rs-chest');
  await page.touchscreen.tap(chest.x, chest.y); await sleep(700);
  const xb = await page.evaluate(() => { const b = document.querySelector('.rs-tray .head .x').getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2, h = document.elementFromPoint(x, y);
    return { x, y, top: h ? h.tagName + '.' + h.className : null, open: window.BZUI.cards.trayIsOpen(), stall: !!document.querySelector('.rs-merchant-ctl .leave') }; });
  await page.touchscreen.tap(xb.x, xb.y); await sleep(700);
  const afterX = await page.evaluate(() => ({ open: window.BZUI.cards.trayIsOpen(), confirm: !!document.querySelector('.rs-confirm'), screen: window.BZ_DEBUG.screen() }));
  check('P3-2 điện thoại, loot sự kiện có quầy/xe: chạm ✕ của kho → kho đóng, không hiện "Bỏ phần thưởng?"',
    xb.open && xb.stall && /\bx\b/.test(xb.top || '') && !afterX.open && !afterX.confirm && afterX.screen === 'loot', JSON.stringify({ xb, afterX }));
  await shot(page, 'u2-03-phone-stash-x');
  // P3-3: kéo chạm thẻ hàng sao cho thẻ (nhấc cao hơn ngón) nằm trên ô tay 2 — đầu ngón khi đó nằm trên rương — thẻ vào ô tay 2, không vào kho
  await u2Merchant(page, [], 2);
  await waitScreen(page, 'merchant'); await sleep(2400);
  st = await stockRects(page);
  const pk = st[0], ph = await page.evaluate(i => { const e = Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).find(x => x._rs && x._rs.kind === 'stock' && x._rs.i === i); return e.getBoundingClientRect().height; }, pk.i);
  const s2 = await handTarget(page, 2, 1), finger = { x: s2.x, y: s2.y + 12 + ph / 2 };
  const inChest = await page.evaluate(([x, y]) => { const c = document.querySelector('.rs-chest').getBoundingClientRect(); return x >= c.left && x <= c.right && y >= c.top && y <= c.bottom; }, [finger.x, finger.y]);
  const cdp = await ctx.newCDPSession(page), tp = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 7 }];
  const tdrag = async (a, b) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(a.x, a.y) });
    for (let i = 1; i <= 14; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(a.x + (b.x - a.x) * i / 14, a.y + (b.y - a.y) * i / 14) }); await sleep(20); }
    await sleep(90); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800);
  };
  await tdrag(pk, finger);
  r = await run(page);
  const tray3 = await page.evaluate(() => window.BZUI.cards.trayIsOpen());
  check('P3-3 điện thoại: thẻ kéo nằm trên ô tay 2 (đầu ngón trên rương: ' + inChest + ') → vào tay ô 2, không vào kho, kho không mở',
    inChest && r.board.hand.some(c => c.socket === 2 && c.id === pk.id) && r.board.stash.length === 0 && !tray3,
    JSON.stringify({ hand: r.board.hand.map(c => c.socket), stash: r.board.stash.length, last: await page.evaluate(() => window.BZUI.drag.last) }));
  await shot(page, 'u2-04-phone-socket2');
  // thả bằng đầu ngón giữa rương vẫn cất vào kho (INTERACT-6 không hỏng)
  st = await stockRects(page);
  await tdrag(st[0], await center(page, '.rs-chest'));
  r = await run(page);
  check('INTERACT-6 điện thoại: đầu ngón thả giữa rương vẫn cất vào kho', r.board.stash.length === 1, JSON.stringify({ stash: r.board.stash.length, last: await page.evaluate(() => window.BZUI.drag.last) }));
  check('review9 U2 (điện thoại): 0 lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  let srv = null, base = process.env.BZ_URL;
  if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const t0 = Date.now();
  const ONLY = process.env.ONLY || ''; // ONLY=review: chỉ chạy phần sửa theo review; ONLY=w2: chỉ đợt 2 (ui2); ONLY=u2: chỉ review9 U2
  if (!ONLY) try { await desktop(browser, base); } catch (e) { check('máy tính: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (!ONLY) try { await phase4(browser, base); } catch (e) { check('pha 4: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (!ONLY) try { await phone(browser, base); } catch (e) { check('điện thoại: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (!ONLY || ONLY === 'w2') try { await wave2(browser, base); } catch (e) { check('đợt 2 (ui2): chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (ONLY !== 'w2' && ONLY !== 'u2') try { await reviewFixes(browser, base); } catch (e) { check('sửa theo review (máy tính): chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (ONLY !== 'w2' && ONLY !== 'u2') try { await reviewPhone(browser, base); } catch (e) { check('sửa theo review (điện thoại): chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  if (!ONLY || ONLY === 'u2') try { await reviewU2(browser, base); } catch (e) { check('review9 U2: chạy hết kịch bản', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  await browser.close();
  if (srv) srv.close();
  console.log('\nChợ Phiên — chơi thử (' + base + '): ' + pass + ' đạt, ' + fail + ' trượt, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
