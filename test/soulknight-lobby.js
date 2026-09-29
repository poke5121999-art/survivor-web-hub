/*
 * Kiểm thử sảnh chọn nhân vật + cửa hàng giả lập của Hiệp Sĩ Linh Hồn (games/soulknight/js/lobby.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-lobby.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-lobby/.
 *
 * Đi bằng nút thật: chọn nhân vật khoá bằng đá quý khi thiếu đá → bị chặn; thêm đá qua SK.profile → mua
 * → vào trận, chỉ số người chơi khớp bảng nhân vật; mua giả lập nhân vật $0.99 và gói đá quý; nạp lại
 * trang → vẫn còn; chết → về sảnh, có bảng kết quả + đá quý thưởng; chụp máy tính + điện thoại ngang.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-lobby');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}
function watch(p, errs) {
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
}
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.offsetParent !== null; }, sel);

async function desktop(b) {
  const ctx = await b.newContext({ viewport: { width: 1386, height: 640 } });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(() => document.fonts.ready);

  const s0 = await p.evaluate(() => ({ sel: SK.profile.selected, gems: SK.profile.gems, n: document.querySelectorAll('#hs-list .hs-hero').length,
    name: document.getElementById('hs-name').textContent, skills: document.querySelectorAll('#hs-skills .hs-sk').length }));
  check('hồ sơ mới: chọn sẵn Hiệp Sĩ, 0 đá quý, đủ 42 nhân vật', s0.sel === 'knight' && s0.gems === 0 && s0.n === 42,
    s0.name + ' · ' + s0.n + ' nhân vật · ' + s0.skills + ' kỹ năng');

  // ---- nhân vật khoá bằng đá quý, thiếu đá → bị chặn
  await p.click('#hs-list .hs-hero[data-id="mage"]');
  const m0 = await p.evaluate(() => ({ name: document.getElementById('hs-name').textContent, label: document.getElementById('hs-start-label').textContent,
    hp: document.getElementById('hs-val-hp').textContent, en: document.getElementById('hs-val-energy').textContent }));
  check('bấm ô Phù Thuỷ → tên + chỉ số đổi, nút thành "Mở khoá"', /Phù Thuỷ/.test(m0.name) && m0.label === 'Mở khoá' && m0.hp === '3' && m0.en === '240',
    JSON.stringify(m0));
  await p.click('#hs-skills .hs-sk.locked');
  await p.waitForSelector('#hs-dlg h3', { state: 'visible' });
  const sk = await p.evaluate(() => document.getElementById('hs-dlg').textContent);
  check('bấm kỹ năng khoá của nhân vật chưa mở → nhắc mở nhân vật trước', /trước/.test(sk), sk.slice(0, 60));
  await p.click('#hs-close');
  await p.screenshot({ path: path.join(SHOTS, 'select-desktop.png') });
  await p.click('#sk-start');
  await p.waitForSelector('#hs-buy', { state: 'visible' });
  const blocked = await p.evaluate(() => ({ dis: document.getElementById('hs-buy').disabled, short: !!document.getElementById('hs-short'),
    unlocked: SK.profile.isUnlocked('mage'), state: SK_GAME.state }));
  await p.screenshot({ path: path.join(SHOTS, 'buy-blocked.png') });
  check('thiếu đá quý → nút "Mua" bị khoá, không vào trận', blocked.dis && blocked.short && !blocked.unlocked && blocked.state === 'lobby', JSON.stringify(blocked));

  // ---- thêm đá quý → mua → vào trận với đúng chỉ số
  await p.evaluate(() => SK.profile.addGems(5000));
  await p.click('.hs-btns button:last-child');           // Huỷ
  await p.click('#sk-start');
  await p.waitForSelector('#hs-buy:not([disabled])', { state: 'visible' });
  await p.click('#hs-buy');
  const bought = await p.evaluate(() => ({ u: SK.profile.isUnlocked('mage'), gems: SK.profile.gems, label: document.getElementById('hs-start-label').textContent }));
  check('đủ đá quý → mua được, trừ đúng 3.000', bought.u && bought.gems === 2000 && bought.label === 'Bắt đầu', JSON.stringify(bought));
  await p.click('#hs-close');
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  const pl = await p.evaluate(() => { const h = SK_DESIGN.heroes.mage, q = SK_GAME.player;
    return { hp: q.hpMax, armor: q.armorMax, en: q.energyMax, w: q.weapon, want: [h.hp, h.armor, h.energy, h.weapon] }; });
  check('vào trận bằng Phù Thuỷ: máu/giáp/năng lượng/vũ khí khớp bảng', pl.hp === pl.want[0] && pl.armor === pl.want[1] && pl.en === pl.want[2] && pl.w === pl.want[3],
    pl.hp + '/' + pl.armor + '/' + pl.en + ' ' + pl.w + ' ~ ' + pl.want.join('/'));
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, 'run-mage.png') });

  // ---- chết → về sảnh, bảng kết quả, có thưởng đá quý
  await p.evaluate(() => { SK.G.kills = 7; SK.G.player.invulT = 0; SK.G.player.armor = 0; SK.hurtPlayer(SK.G, 99); });
  await until(p, () => SK_GAME.state === 'dead' && !document.getElementById('sk-over').hidden, null, 4000);
  await p.click('#sk-retry');
  await until(p, () => SK_GAME.state === 'lobby', null, 2000);
  const sum = await p.evaluate(() => ({ dlg: document.getElementById('hs-dlg').textContent, gems: SK.profile.gems,
    start: !document.getElementById('sk-start').closest('[hidden]') }));
  await p.screenshot({ path: path.join(SHOTS, 'summary.png') });
  check('chết → về sảnh, bảng kết quả + thưởng đá quý (≥ số quái hạ)', /Kết quả/.test(sum.dlg) && sum.gems >= 2007 && sum.start,
    'đá quý ' + sum.gems + ' · ' + sum.dlg.replace(/\s+/g, ' ').slice(0, 70));
  await p.click('#hs-claim');

  // ---- mua giả lập nhân vật $0.99
  await p.click('#hs-list .hs-hero[data-id="engineer"]');
  await p.click('#sk-start');
  await p.waitForSelector('#hs-pay-ok', { state: 'visible' });
  const pay = await p.evaluate(() => document.getElementById('hs-dlg').textContent);
  await p.screenshot({ path: path.join(SHOTS, 'fake-pay.png') });
  check('nhân vật $0.99 → hộp "Thanh toán giả lập — không trừ tiền thật" có giá', /Thanh toán giả lập — không trừ tiền thật/.test(pay) && /\$0\.99/.test(pay), pay.slice(0, 60));
  const g0 = await p.evaluate(() => SK.profile.gems);
  await p.click('#hs-pay-ok');
  const eng = await p.evaluate(() => ({ u: SK.profile.isUnlocked('engineer'), gems: SK.profile.gems }));
  check('"Xác nhận mua" → mở khoá ngay, không đụng đá quý', eng.u && eng.gems === g0, JSON.stringify(eng));
  await p.click('#hs-close');

  // ---- gói đá quý giả lập
  await p.click('#hs-shop');
  await p.click('.hs-pack[data-pack="0"]');
  await p.waitForSelector('#hs-pay-ok', { state: 'visible' });
  await p.click('#hs-pay-ok');
  const g1 = await p.evaluate(() => SK.profile.gems);
  check('cửa hàng: gói $0.99 → +500 đá quý', g1 === g0 + 500, g0 + ' → ' + g1);
  await p.click('#hs-close');

  // ---- nhân vật mở bằng thành tựu: đổi bằng đá quý giá ước lượng, có ghi chú
  await p.evaluate(() => SK.lobby.select('officer'));
  await p.click('#sk-start');
  await p.waitForSelector('#hs-buy', { state: 'visible' });
  const ach = await p.evaluate(() => document.getElementById('hs-dlg').textContent);
  check('nhân vật mở bằng thành tựu → đổi đá quý, có ghi rõ', /thành tựu/.test(ach) && /ước lượng/.test(ach), ach.replace(/\s+/g, ' ').slice(0, 80));
  await p.click('.hs-btns button:last-child');

  // ---- chọn chế độ
  await p.click('#hs-back');
  const md = await p.evaluate(() => ({ open: !document.getElementById('hs-modes').hidden, n: document.querySelectorAll('.hs-mode').length }));
  await p.click('.hs-mode[data-mode="season"]');
  const season = await p.evaluate(() => ({ dis: document.getElementById('hs-mode-go').disabled, txt: document.getElementById('hs-mode-go').textContent }));
  await p.screenshot({ path: path.join(SHOTS, 'modes.png') });
  await p.click('.hs-mode[data-mode="level"]');
  await p.click('#hs-mode-go');
  const back = await p.evaluate(() => document.getElementById('hs-modes').hidden);
  check('chọn chế độ: Màn chơi → về chọn nhân vật; Mùa giải "Sắp ra mắt"', md.open && md.n >= 2 && season.dis && /Sắp ra mắt/.test(season.txt) && back,
    JSON.stringify({ md, season }));

  // ---- nạp lại trang → hồ sơ còn nguyên
  await p.evaluate(() => SK.lobby.select('engineer'));
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  const re = await p.evaluate(() => ({ mage: SK.profile.isUnlocked('mage'), eng: SK.profile.isUnlocked('engineer'), sel: SK.profile.selected,
    gems: SK.profile.gems, name: document.getElementById('hs-name').textContent }));
  check('nạp lại trang: nhân vật đã mở + đá quý + lựa chọn vẫn còn', re.mage && re.eng && re.sel === 'engineer' && re.gems === g1, JSON.stringify(re));

  // ---- phím ← → đổi nhân vật, Enter vào trận
  await p.keyboard.press('ArrowLeft');
  await sleep(100);
  const kl = await p.evaluate(() => SK.profile.selected);
  await p.keyboard.press('ArrowRight');
  await sleep(100);
  check('phím ← → đổi nhân vật', kl !== 'engineer' && (await p.evaluate(() => SK.profile.selected)) === 'engineer', kl);

  // ---- xem hình pixel
  await p.click('#hs-view');
  await sleep(400);
  const pix = await p.evaluate(() => document.getElementById('hs-portrait').classList.contains('pix'));
  await p.screenshot({ path: path.join(SHOTS, 'select-pixel.png') });
  check('nút đổi → xem hình pixel đứng trong sảnh', pix);
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

async function phone(b) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => SK.lobby.select('miner'));
  await sleep(500);
  await p.screenshot({ path: path.join(SHOTS, 'select-phone.png') });
  // Không phần nào tràn khỏi màn, nút chính vẫn chạm được.
  const lay = await p.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const out = [...document.querySelectorAll('#sk-lobby .hs-top, #sk-lobby .hs-left, #sk-lobby .hs-right, #sk-lobby .hs-bottom, #sk-start')]
      .filter(e => { const q = e.getBoundingClientRect(); return q.right > innerWidth + 1 || q.bottom > innerHeight + 1 || q.left < -1; }).map(e => e.className || e.id);
    const s = r('sk-start'), l = document.querySelector('.hs-left').getBoundingClientRect(), k = document.querySelector('.hs-right').getBoundingClientRect();
    return { out, start: [s.width, s.height], overlap: l.right > k.left, sw: document.documentElement.scrollWidth };
  });
  check('điện thoại 844×390: không tràn, bảng trái/phải không chồng nhau', lay.out.length === 0 && !lay.overlap && lay.sw <= 844, JSON.stringify(lay));
  await p.tap('#hs-list .hs-hero[data-id="knight"]');
  await p.tap('#sk-start');
  const ok = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.player && SK_GAME.player.hpMax === SK_DESIGN.heroes.knight.hp, null, 3000);
  check('điện thoại: chạm ô Hiệp Sĩ + "Bắt đầu" → vào trận', ok);
  check('điện thoại: không lỗi', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  const run = async (name, fn) => { try { await fn(b); } catch (e) { check(name + ': chạy trọn', false, e.message.split('\n')[0]); } };
  await run('máy tính', desktop);
  await run('điện thoại', phone);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
