/*
 * BIỆT ĐỘI LẶN — bộ kiểm SẢNH (games/biet-doi-lan/dev-lobby.html).
 *
 * Chạy:  node test/biet-doi-lan-lobby.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/bdl-lobby-shots), tên theo khung hình và màn: mở ra xem bằng mắt.
 * Ba khung hình: 1280x720 (máy tính), 844x390 (điện thoại ngang, có cảm ứng), 390x844 (điện thoại dọc).
 * Mỗi khung hình dùng một ngữ cảnh trình duyệt MỚI (localStorage trống) nên kỳ vọng viết cứng được.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-lobby-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };

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

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' @' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TABS = ['shop', 'gacha', 'home', 'squad', 'quest'];

async function run(browser, base, w, h, touch) {
  const tag = w + 'x' + h;
  out.push('\n[' + tag + (touch ? ' cảm ứng' : '') + ']');
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const M = () => page.evaluate(() => JSON.parse(JSON.stringify(BDL.meta.M)));
  const click = async sel => { await page.click(sel); await sleep(60); };

  await page.goto(base + '/games/biet-doi-lan/dev-lobby.html', { waitUntil: 'load' });
  await page.waitForSelector('.tabbar');
  await sleep(300);
  check('sảnh dựng được, có thanh tab 5 ô', (await page.$$('.tabbar .tb')).length === 5);
  check('thứ tự tab: Cửa Hàng, Gacha, RA KHƠI, Biệt Đội, Nhiệm Vụ',
    JSON.stringify(await page.$$eval('.tabbar .tb .tb-n', n => n.map(x => x.textContent))) ===
    JSON.stringify(['Cửa Hàng', 'Gacha', 'RA KHƠI', 'Biệt Đội', 'Nhiệm Vụ']));
  check('không còn tab Trang Bị / Tiến Hoá', !(await page.evaluate(() => /Trang Bị|Tiến Hoá/.test(document.getElementById('menu').textContent))));

  // --- bố cục sảnh: nút RA KHƠI và thanh tab nằm hết trong khung nhìn, không tràn ngang ---
  async function layout(name) {
    const r = await page.evaluate(() => {
      const m = document.getElementById('menu').getBoundingClientRect();
      const st = document.querySelector('.stage');
      const tb = document.querySelector('.tabbar').getBoundingClientRect();
      const cta = document.querySelector('.b.cta');
      const c = cta ? cta.getBoundingClientRect() : null;
      return { vw: innerWidth, vh: innerHeight, mw: m.width, mh: m.height, sw: st.scrollWidth, cw: st.clientWidth,
               sh: st.scrollHeight, ch: st.clientHeight, tbBottom: tb.bottom, tbTop: tb.top,
               ctaTop: c && c.top, ctaBottom: c && c.bottom, ctaH: c && c.height };
    });
    check(name + ': không tràn ngang', r.sw <= r.cw + 1, 'scrollWidth ' + r.sw + ' / ' + r.cw);
    check(name + ': thanh tab nằm trong khung', r.tbBottom <= r.vh + 1, 'đáy tab ' + Math.round(r.tbBottom) + ' / ' + r.vh);
    return r;
  }

  // --- mọi tab dựng được ---
  for (const t of TABS) {
    await click('.tabbar .tb[data-tab="' + t + '"]');
    const n = await page.$eval('.stage', s => s.querySelectorAll('*').length);
    check('tab "' + t + '" dựng ra nội dung', n > 12, n + ' phần tử');
    await sleep(200);
    await shot('tab-' + t);
    const r = await layout('tab ' + t);
    if (t === 'home') {
      check('home: nút RA KHƠI hiện đủ, không bị thanh tab cắn', r.ctaBottom <= r.tbTop + 1 && r.ctaTop >= 0,
        'nút ' + Math.round(r.ctaTop) + '..' + Math.round(r.ctaBottom) + ' / tab ' + Math.round(r.tbTop));
      check('home: không phải cuộn dọc', r.sh <= r.ch + 2, 'scrollHeight ' + r.sh + ' / ' + r.ch);
    }
  }
  await click('.tabbar .tb[data-tab="home"]');
  await click('.rail-b[data-go="maps"]');
  check('màn Chuyến Lặn có đủ 5 chuyến', (await page.$$('.map')).length === 5);
  check('Chuyến Lặn: tên 5 chuyến và số tầng 5/7/10/13/16',
    JSON.stringify(await page.$$eval('.map', ms => ms.map(m => m.querySelector('b').textContent + ':' + /(\d+) tầng/.exec(m.textContent)[1]))) ===
    JSON.stringify(['Rạn San Hô:5', 'Rừng Tảo:7', 'Hoàng Hôn:10', 'Mưa Giông:13', 'Vực Đêm:16']));
  await shot('tab-maps');
  await layout('màn maps');

  // --- RA KHƠI gọi BDL.onSail ---
  await click('.tabbar .tb[data-tab="home"]');
  await click('#bdlSail');
  check('RA KHƠI gọi BDL.onSail', (await page.evaluate(() => window.__sailed)) === 1);
  await sleep(2400);                       // đợi toast tắt

  // --- gacha x10: đủ ngọc thì ra 10 kết quả và có ít nhất một 4★ ---
  await page.evaluate(() => { BDL.meta.M.gem = 5000; BDL.meta.save(true); });
  await click('.tabbar .tb[data-tab="gacha"]');
  const gem0 = (await M()).gem;
  await click('[data-act="pull10"]');
  await page.waitForSelector('.mcard[data-pulls="10"]');
  await sleep(350);
  const cards = await page.$$eval('.pcard', c => c.map(x => +x.dataset.star));
  check('gacha x10: ra 10 kết quả', cards.length === 10, cards.join(','));
  check('gacha x10: có ít nhất một 4★', cards.some(s => s >= 4));
  check('gacha x10: trừ đúng 1.600 ngọc', gem0 - (await M()).gem === 1600);
  const portraitDrawn = await page.evaluate(() => {
    const cv = document.querySelector('.mcard canvas.mat');
    if (!cv || !cv.width) return false;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
  check('chân dung crew trong kết quả gacha đã vẽ (canvas không trống)', portraitDrawn);
  await shot('gacha-result');
  await click('[data-act="pullsdone"]');
  const bal = await M();
  check('gacha: số lượt quay ghi vào bộ đếm', bal.counters.pulls === 10, 'pulls=' + bal.counters.pulls);
  // 3 băng có bảo hiểm riêng
  check('gacha: ba băng, bảo hiểm riêng', Object.keys(bal.pity).join() === 'char,lim1,lim2');
  await click('[data-banner="lim1"]');
  await shot('gacha-lim1');
  const pool5 = await page.$$eval('.pool-r', r => r[0].textContent);
  check('băng giới hạn 1: 5★ chỉ có Blink, Oracle', /Blink/.test(pool5) && /Oracle/.test(pool5) && !/Seraph|Frost|Magnet/.test(pool5), pool5.trim());
  await click('[data-banner="char"]');
  const pool5c = await page.$$eval('.pool-r', r => r[0].textContent);
  check('băng thường: 5★ không có crew độc quyền', /Seraph/.test(pool5c) && !/Blink|Oracle|Frost|Magnet/.test(pool5c), pool5c.trim());

  // --- lên cấp crew: tốn 200 x (lv+1) vàng ---
  await page.evaluate(() => { BDL.meta.M.chars.bao.shard = 5; BDL.meta.M.gold = 9000; BDL.meta.save(true); });
  await click('.tabbar .tb[data-tab="squad"]');
  await click('.cc[data-crew="bao"]');
  await sleep(150);
  await shot('squad-detail');
  for (let i = 0; i < 3; i++) {
    const before = await M();
    const lv = before.chars.bao.lv;
    await click('[data-act="levelup"]');
    const after = await M();
    check('lên cấp Flare từ ' + lv + ': tốn ' + 200 * (lv + 1) + ' vàng và 1 mảnh',
      after.chars.bao.lv === lv + 1 && before.gold - after.gold === 200 * (lv + 1) && before.chars.bao.shard - after.chars.bao.shard === 1,
      'vàng ' + before.gold + ' -> ' + after.gold);
  }
  const maxTry = await page.evaluate(() => { BDL.meta.M.chars.bao.lv = 10; return BDL.meta.levelUp('bao'); });
  check('cấp tối đa 10: không lên nữa', maxTry.ok === false);
  await page.evaluate(() => { BDL.meta.M.chars.bao.lv = 3; });

  // --- chọn tổ trưởng + chiến thuật ---
  const squadOk = await page.evaluate(() => {
    const m = BDL.meta, M = m.M;
    Object.keys(BDL.content.crewById).slice(0, 6).forEach(id => { if (!M.chars[id]) M.chars[id] = { lv: 0, shard: 0 }; });
    m.autoFill();
    const l = m.squadList();
    m.setTactic(M.squad.mates[0], 'san');
    return { n: l.length, tac: M.tactics[M.squad.mates[0]] };
  });
  check('biệt đội đủ 5 người, chiến thuật đổi được', squadOk.n === 5 && squadOk.tac === 'san', JSON.stringify(squadOk));
  await page.evaluate(() => BDL.ui.render());
  await sleep(200);
  await shot('squad-full');
  await layout('squad đủ 5');

  // --- đồ nghề: bấm mua trên sảnh, runStart nuốt đúng một lần ---
  await page.evaluate(() => { BDL.meta.M.gold = 20000; BDL.meta.save(true); });
  await click('.tabbar .tb[data-tab="home"]');
  const g0 = (await M()).gold;
  await click('.wq[data-item="rifle"]');
  const lo1 = await M();
  check('đồ nghề: mua súng trường 3.200 vàng', lo1.loadout && lo1.loadout.key === 'rifle' && g0 - lo1.gold === 3200, JSON.stringify(lo1.loadout));
  await shot('home-loadout');
  await click('.wq[data-item="shotgun"]');
  const lo2 = await M();
  check('đồ nghề: đổi món thì hoàn đủ món cũ (chỉ mất chênh lệch)', lo2.loadout.key === 'shotgun' && g0 - lo2.gold === 8800, 'vàng ' + lo2.gold);
  await click('.wq[data-item="shotgun"]');
  const lo3 = await M();
  check('đồ nghề: bấm lại món đang mang thì bỏ ra, hoàn đủ', lo3.loadout === null && lo3.gold === g0);
  await click('.wq[data-item="bat"]');
  const rs = await page.evaluate(() => { const a = BDL.meta.runStart(), b = BDL.meta.runStart(); return { a, b }; });
  check('runStart trả đồ nghề rồi nuốt (gọi lần hai không còn)', rs.a.loadout && rs.a.loadout.key === 'bat' && rs.a.loadout.uses === 12 && rs.b.loadout === null, JSON.stringify(rs.a.loadout));
  check('runStart: tổ trưởng + 4 đồng đội + cộng chiến thuật',
    rs.a.lead.id === 'bao' && rs.a.mates.length === 4 && typeof rs.a.teamBonus.atk === 'number' && rs.a.lead.stats.hpMul > 1 &&
    ['hpMul', 'atkMul', 'spd', 'carry', 'grit', 'cdMul', 'luck', 'eye'].every(k => typeof rs.a.lead.stats[k] === 'number'),
    'hpMul=' + rs.a.lead.stats.hpMul.toFixed(3));
  check('runStart: bản lưu đã xoá đồ nghề', (await M()).loadout === null);

  // --- runFinish: 10.000 giao -> 5.500 vàng, không thắng không thưởng chuyến ---
  const g1 = (await M()).gold;
  const rf = await page.evaluate(() => BDL.meta.runFinish({ delivered: 10000, mapsCleared: 0, win: false, kills: 3, skills: 4, floors: 5, lootValue: 10000 }));
  check('runFinish giao 10.000 -> nhận 5.500 vàng', rf.gold === 5500 && (await M()).gold - g1 === 5500, 'vàng +' + ((await M()).gold - g1));
  const g2 = await M();
  const rf2 = await page.evaluate(() => BDL.meta.runFinish({ delivered: 0, mapsCleared: 2, win: false }));
  check('runFinish qua 2 chuyến: 2 x clear + 2 x lần đầu', rf2.gold === 2 * 1800 + 2 * 3000 && rf2.gem === 2 * 30 + 2 * 300, JSON.stringify([rf2.gold, rf2.gem]));
  const rf3 = await page.evaluate(() => BDL.meta.runFinish({ delivered: 0, mapsCleared: 2, win: false }));
  check('runFinish qua lại 2 chuyến đó: chỉ còn thưởng qua chuyến', rf3.gold === 3600 && rf3.gem === 60);
  check('runFinish cập nhật nhiệm vụ/bộ đếm', (await M()).counters.kills === 3 && (await M()).counters.floors === 5 && g2.counters.runs === 1);
  await page.evaluate(() => BDL.ui.showRunEnd(BDL.meta.runFinish({ delivered: 20000, win: true, kills: 1, skills: 1, floors: 3 })));
  await sleep(200);
  await shot('run-end');
  check('bảng kết ca hiện', !!(await page.$('.mcard[data-runend="win"]')));
  await click('[data-act="runend-close"]');

  // --- cửa hàng ---
  await click('.tabbar .tb[data-tab="shop"]');
  const gem1 = (await M()).gem;
  await click('.pack[data-pack="p1"]');
  check('nạp giả: gói 22.000đ cộng 300 ngọc', (await M()).gem - gem1 === 300);
  check('có banner "nạp giả" rõ ràng', await page.evaluate(() => /Nạp ở đây là giả/.test(document.querySelector('.fakebox').textContent)));
  const gold1 = (await M()).gold;
  await click('.xrow[data-exchange="x1"] .b');
  const ex = await M();
  check('đổi hằng ngày: 50 ngọc -> 6.000 vàng, còn 19 lượt', ex.gold - gold1 === 6000 && ex.shopLimit.used.x1 === 1);
  check('cửa hàng có đúng 3 hàng đổi, 6 gói', (await page.$$('.xrow')).length === 3 && (await page.$$('.pack')).length === 6);
  await shot('shop-scroll-top');
  await page.evaluate(() => { document.querySelector('.stage').scrollTop = 99999; });
  await sleep(100);
  await shot('shop-scroll-bottom');

  // --- nhiệm vụ ---
  await click('.tabbar .tb[data-tab="quest"]');
  const q = await page.evaluate(() => BDL.meta.questList());
  check('nhiệm vụ: 5 ngày + 4 tuần + 6 thành tựu', q.daily.length === 5 && q.weekly.length === 4 && q.ach.length === 6, [q.daily.length, q.weekly.length, q.ach.length].join('/'));
  const gem2 = (await M()).gem;
  await page.evaluate(() => { BDL.meta.M.counters.wins = 1; BDL.ui.render(); });
  await sleep(100);
  await shot('quest-claimable');
  await click('[data-act="claimall"]');
  check('nhận tất cả nhiệm vụ xong', (await M()).gem > gem2);

  // --- tải lại trang: trạng thái còn nguyên ---
  const before = await M();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.tabbar');
  const after = await M();
  check('tải lại trang: vàng, ngọc, cấp crew, đội hình còn nguyên',
    after.gold === before.gold && after.gem === before.gem && after.chars.bao.lv === before.chars.bao.lv &&
    JSON.stringify(after.squad) === JSON.stringify(before.squad) && after.counters.pulls === before.counters.pulls,
    'vàng ' + after.gold);

  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    await run(browser, base, 1280, 720, false);
    await run(browser, base, 844, 390, true);
    await run(browser, base, 390, 844, true);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
