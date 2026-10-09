/*
 * Kiểm thử sảnh chọn nhân vật + cửa hàng giả lập của Hiệp Sĩ Linh Hồn (games/soulknight/js/lobby.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-lobby.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-lobby/.
 *
 * Màn chọn nhân vật là prefab uGUI gốc (ui_choose_hero) vẽ trên canvas #hs-ui: kiểm thử bấm chuột/chạm vào đúng
 * rect của nút lấy từ SK.lobby.rect(đường dẫn nút) — cùng hàm lobby.js dùng để bắt cú bấm — nên bấm lệch là hỏng.
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

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-lobby');
fs.mkdirSync(SHOTS, { recursive: true });

const ATTR = 'ui_left/panel/hero_attributes/';
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
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /ugui/.test(m.text()))) errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
}
const ready = p => p.waitForFunction(() => window.SK && SK.lobby && SK.lobby.state && SK.lobby.state().ready && SK_GAME.state === 'lobby', null, { timeout: 10000 });
const st = p => p.evaluate(() => SK.lobby.state());
const txt = (p, q) => p.evaluate(x => SK.lobby.text(x), q);
// Bấm (hoặc chạm) vào tâm rect của một nút prefab; nút không hiện thì ném lỗi.
async function tap(p, q, touch) {
  const r = await p.evaluate(x => SK.lobby.rect(x), q);
  if (!r) throw new Error('node not shown: ' + q);
  if (touch) await p.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2);
  else await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await sleep(120);
}
// Chọn nhân vật `id` (ở bản gốc chạm nhân vật trong sảnh; thanh trượt dưới là skin của nhân vật đó).
async function tapHero(p, id) {
  await p.evaluate(h => SK.lobby.select(h, true), id);
  await sleep(400);
}

async function desktop(b) {
  const ctx = await b.newContext({ viewport: { width: 1386, height: 640 } });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  await p.goto(URL);
  await ready(p);
  await p.evaluate(() => document.fonts.ready);
  await sleep(400);

  const s0 = await st(p);
  const g0gems = await p.evaluate(() => SK.profile.gems);
  check('hồ sơ mới: chọn sẵn Hiệp Sĩ skin 0, 0 đá quý, đủ 42 nhân vật, thanh trượt 5 ô skin', s0.selected === 'knight' && g0gems === 0 &&
    s0.heroes.length === 42 && s0.cells.length === 5 && s0.cells[2] === 0 && s0.skin === 0 && s0.skins.length === 38,
    s0.name + ' · ô ' + s0.cells.join(',') + ' · ' + s0.skins.length + ' skin · ' + s0.skills + ' kỹ năng');
  const slid = await p.evaluate(() => ['mask_up', 'mask_down', 'ui_left', 'ui_right'].map(n => SK.lobby.rect(n)));
  check('bốn khối đã trượt vào đúng chỗ (ShowEndValues = 0)', slid[2].x === 0 && Math.abs(slid[3].x + slid[3].w - 1386) < 1 && slid[0].y === 0,
    JSON.stringify(slid.map(r => [Math.round(r.x), Math.round(r.y)])));

  // ---- nhân vật khoá bằng đá quý, thiếu đá → bị chặn
  await tapHero(p, 'mage');
  const m0 = await st(p);
  const m0v = { hp: await txt(p, ATTR + 'value1/Text'), en: await txt(p, ATTR + 'value3/Text'), bar: await p.evaluate(a => SK.lobby.rect(a + 'value1/Image').w, ATTR) };
  check('chọn Phù Thuỷ → tên + chỉ số đổi, nút Bắt đầu xám, hiện nút Mở khóa, thanh trượt về skin 0', /Phù Thuỷ/.test(m0.name) && m0.startGray && m0.unlockShown &&
    m0v.hp === '3' && m0v.en === '240' && m0.cells[2] === 0, JSON.stringify({ name: m0.name, gray: m0.startGray, ...m0v }));
  await tap(p, 'skill:1');
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

  // ---- thêm đá quý → mua (bằng nút Mở khóa giữa màn) → vào trận với đúng chỉ số
  await p.evaluate(() => SK.profile.addGems(5000));
  await p.click('.hs-btns button:last-child');           // Huỷ
  const gemTxt = await txt(p, 'mask_up/show_currency_group_widget/show_currency_widget/Bg/Text');
  await tap(p, 'mask_down/center_buttons/btn_unlock');
  await p.waitForSelector('#hs-buy:not([disabled])', { state: 'visible' });
  await p.click('#hs-buy');
  const bought = await p.evaluate(() => ({ u: SK.profile.isUnlocked('mage'), gems: SK.profile.gems, gray: SK.lobby.state().startGray, unlock: SK.lobby.state().unlockShown }));
  check('đủ đá quý → nút Mở khóa mua được, trừ đúng 3.000, ô đá quý hiện số dư', bought.u && bought.gems === 2000 && !bought.gray && !bought.unlock && gemTxt === '5000',
    JSON.stringify({ ...bought, gemTxt }));
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
  await tapHero(p, 'engineer');
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

  // ---- gói đá quý giả lập: bấm ô đá quý góc trên phải
  await tap(p, 'mask_up/show_currency_group_widget/show_currency_widget');
  await p.click('.hs-pack[data-pack="0"]');
  await p.waitForSelector('#hs-pay-ok', { state: 'visible' });
  await p.click('#hs-pay-ok');
  const g1 = await p.evaluate(() => SK.profile.gems);
  check('bấm ô đá quý → cửa hàng: gói $0.99 → +500 đá quý', g1 === g0 + 500, g0 + ' → ' + g1);
  await p.click('#hs-close');

  // ---- nhân vật mở bằng thành tựu: đổi bằng đá quý giá ước lượng, có ghi chú
  await p.evaluate(() => SK.lobby.select('officer'));
  await p.click('#sk-start');
  await p.waitForSelector('#hs-buy', { state: 'visible' });
  const ach = await p.evaluate(() => document.getElementById('hs-dlg').textContent);
  check('nhân vật mở bằng thành tựu → đổi đá quý, có ghi rõ', /thành tựu/.test(ach) && /ước lượng/.test(ach), ach.replace(/\s+/g, ' ').slice(0, 80));
  await p.click('.hs-btns button:last-child');

  // ---- bảng trái: bấm Nội tại / Vũ khí mở ô chi tiết (UnfoldPanel), bấm lại gập; Cách tăng cấp mở lộ trình
  await p.evaluate(() => SK.lobby.select('knight', true));
  await sleep(100);
  const btnY0 = (await p.evaluate(a => SK.lobby.rect(a + 'upgraded_detail_button'), ATTR)).y;
  await tap(p, ATTR + 'weapon');
  const un = await st(p), wAtk = await txt(p, ATTR + 'detail_bg/weapon_info/atk/text');
  const btnY1 = (await p.evaluate(a => SK.lobby.rect(a + 'upgraded_detail_button'), ATTR)).y;
  await p.screenshot({ path: path.join(SHOTS, 'detail-weapon.png') });
  await tap(p, ATTR + 'weapon');
  const fo = await st(p);
  check('bấm Vũ khí ban đầu → mở ô chi tiết (sát thương), nút Cách tăng cấp tụt xuống; bấm lại → gập',
    un.detail === 'weapon' && +wAtk > 0 && btnY1 > btnY0 && fo.detail === null, JSON.stringify({ d: un.detail, wAtk, btnY0: Math.round(btnY0), btnY1: Math.round(btnY1) }));
  await tap(p, ATTR + 'upgraded_detail_button');
  const path0 = await p.evaluate(() => document.getElementById('hs-dlg').textContent);
  check('bấm "Cách tăng cấp" → hộp lộ trình nâng cấp', /Lộ trình nâng cấp/.test(path0), path0.slice(0, 50));
  await p.click('#hs-close');

  // ---- mũi tên + kéo thanh trượt + ô tick trình diễn kỹ năng
  await tap(p, 'mask_down/ui_right_button/button');
  const ar = await st(p);
  await sleep(400);
  const sv = await p.evaluate(() => SK.lobby.rect('mask_down/skin_scroll_view'));
  await p.mouse.move(sv.x + sv.w * 0.7, sv.y + sv.h / 2);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(sv.x + sv.w * 0.7 - i * 24, sv.y + sv.h / 2);
  await p.mouse.up();
  await sleep(450);
  const dr = await st(p);
  const iK = dr.heroes.indexOf('knight');
  check('mũi tên phải → nhân vật kế; kéo thanh trượt sang trái → dừng khớp ô, chọn skin xa hơn của cùng nhân vật',
    ar.selected === dr.heroes[iK + 1] && dr.selected === ar.selected && dr.skin >= 1 && Number.isInteger(dr.carousel),
    ar.selected + ' → ' + dr.selected + ' skin ' + dr.skin + ' @' + dr.carousel);
  await p.evaluate(() => SK.lobby.selectSkin(0, true));
  const d0 = (await st(p)).demo;
  await tap(p, 'mask_down/skill_demo_checkbox');
  const d1 = (await st(p)).demo;
  await tap(p, 'mask_down/skill_demo_checkbox');
  check('ô tick "Trình diễn kỹ năng" bật/tắt', d0 !== d1 && (await st(p)).demo === d0, d0 + ' → ' + d1);

  await tapHero(p, 'knight');
  await tap(p, 'skin:1');
  const skOk = await until(p, () => SK.lobby.state().skin === 1 && SK.lobby.state().cells[2] === 1 && !!SK_DATA.heroes.knight.s1 && !!SK.pages[SK.A.f[SK.anim(SK_DATA.heroes.knight.s1.idle).f[0]][0]], null, 6000);
  const sk1 = await p.evaluate(() => {
    const e = SK.heroSkin('knight', 1), pl = SK.makePlayer('knight', 0, 0);
    return { name: e.name, idle: e.idle, player: pl.anims.idle, hand: pl.h.hand, hand0: SK_DESIGN.heroes.knight.hand, cells: SK.lobby.state().cells };
  });
  await p.screenshot({ path: path.join(SHOTS, 'skin-1.png') });
  check('bấm ô skin 1 → gói skin Hiệp Sĩ nạp, nhân vật trong trận mang skin 1 ("Kỵ Sĩ Tinh Anh")', skOk && sk1.name === 'Kỵ Sĩ Tinh Anh' &&
    sk1.player === 'hero_knight_s1/idle' && sk1.cells[2] === 1, JSON.stringify(sk1));
  await p.evaluate(() => SK.lobby.selectSkin(0, true));

  // ---- chọn chế độ
  await tap(p, 'mask_up/btn_back');
  const md = await p.evaluate(() => ({ open: !document.getElementById('hs-modes').hidden, n: document.querySelectorAll('.hs-mode').length }));
  await p.click('.hs-mode[data-mode="season"]');
  const season = await p.evaluate(() => ({ dis: document.getElementById('hs-mode-go').disabled, txt: document.getElementById('hs-mode-go').textContent }));
  await p.screenshot({ path: path.join(SHOTS, 'modes.png') });
  await p.click('.hs-mode[data-mode="level"]');
  await p.click('#hs-mode-go');
  const back = await p.evaluate(() => document.getElementById('hs-modes').hidden);
  check('nút thoát góc trái → chọn chế độ: Màn chơi → về chọn nhân vật; Mùa giải bấm được "Bắt đầu"', md.open && md.n >= 2 && !season.dis && season.txt === 'Bắt đầu' && back,
    JSON.stringify({ md, season }));

  // ---- nạp lại trang → hồ sơ còn nguyên
  await p.evaluate(() => SK.lobby.select('engineer'));
  await p.reload();
  await ready(p);
  const re = await p.evaluate(() => ({ mage: SK.profile.isUnlocked('mage'), eng: SK.profile.isUnlocked('engineer'), sel: SK.profile.selected,
    gems: SK.profile.gems, name: SK.lobby.state().name }));
  check('nạp lại trang: nhân vật đã mở + đá quý + lựa chọn vẫn còn', re.mage && re.eng && re.sel === 'engineer' && re.gems === g1, JSON.stringify(re));

  // ---- phím ← → đổi nhân vật
  await p.keyboard.press('ArrowLeft');
  await sleep(100);
  const kl = await p.evaluate(() => SK.profile.selected);
  await p.keyboard.press('ArrowRight');
  await sleep(100);
  check('phím ← → đổi nhân vật', kl !== 'engineer' && (await p.evaluate(() => SK.profile.selected)) === 'engineer', kl);

  // ---- nút đổi tranh / hình pixel
  await tap(p, 'ui_choose_hero_drawing_buttons/change_button');
  await sleep(400);
  const pix = (await st(p)).view;
  await p.screenshot({ path: path.join(SHOTS, 'select-pixel.png') });
  check('nút đổi (change_button) → xem hình pixel đứng trong sảnh', pix === 'pix');
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

async function phone(b) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  await p.goto(URL);
  await ready(p);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => SK.lobby.select('miner', true));
  await sleep(500);
  await p.screenshot({ path: path.join(SHOTS, 'select-phone.png') });
  // Không phần nào tràn khỏi màn, bảng trái và bảng kỹ năng không chồng nhau. Nền ô kỹ năng (bg 420 rộng) cố ý chờm
  // qua mép phải như bản gốc, nên đo phần ruột `up`.
  const lay = await p.evaluate(() => {
    const R = q => SK.lobby.rect(q);
    const parts = { left: R('ui_left/panel'), skill: R('ui_right/skill_panel/skill_detail/up'), start: R('mask_down/btn_ok'), back: R('mask_up/btn_back'),
      gems: R('mask_up/show_currency_group_widget/show_currency_widget') };
    const out = Object.keys(parts).filter(k => { const q = parts[k]; return !q || q.x + q.w > innerWidth + 1 || q.y + q.h > innerHeight + 1 || q.y < -1; });
    return { out, start: [Math.round(parts.start.w), Math.round(parts.start.h)], overlap: parts.left.x + parts.left.w > parts.skill.x, sw: document.documentElement.scrollWidth };
  });
  check('điện thoại 844×390: không tràn, bảng trái/phải không chồng nhau', lay.out.length === 0 && !lay.overlap && lay.sw <= 844, JSON.stringify(lay));
  await tapHero(p, 'knight', true);
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
