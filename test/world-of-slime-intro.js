/*
 * Thế Giới Slime (games/world-of-slime), pha F2 "mở đầu": bản lưu trống -> Touch To Start -> Nickname Setting + Notice
 * -> tạo nhân vật trước gương (đổi Gender, Hair, Hair Color, Lens) -> "Save this look?" -> truyện tranh (Skip) -> chọn
 * ba lô (mũi tên, Esc "xem túi khác", Space chọn) -> phim tỉnh dậy (Skip) -> vào quán trọ 257 với đúng diện mạo + slime
 * -> tải lại trang: Touch To Start vào thẳng game, diện mạo + slime + tên còn -> Esc mở Setting, đổi Camera Scale, tab
 * Account. Chạy cả PC (1280x720) và mobile (mobile.html 844x390 cảm ứng). Không lỗi trang / console / HTTP >= 400.
 * Ảnh từng màn vào D:/wos-ref/proof/intro/flow/ (ảnh so cùng trạng thái với D:/wos-ref/pilot: test/world-of-slime-intro-parity.js).
 *
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-intro.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-intro.js
 * Biến: WOS_BASE, WOS_ASSETS (rỗng = asset Pages), WOS_SHOTS (mặc định D:/wos-ref/proof/intro/flow; "" = không chụp).
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/intro/flow' : process.env.WOS_SHOTS;
const Q = (ASSETS ? '?assets=' + encodeURIComponent(ASSETS) : '');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const wait = (page, ms) => page.waitForTimeout(ms);
let prefix = 'pc';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${prefix}_${name}.png` }); };
const ui = (page, n) => page.locator(`[data-ui="${n}"]`);
const tapUi = async (page, n, i = 0, mobile) => { const l = ui(page, n).nth(i); await l.waitFor({ state: 'visible', timeout: 20000 }); if (mobile) await l.tap(); else await l.click(); };
const stage = page => page.evaluate(() => window.WOS_INTRO ? window.WOS_INTRO.stage : null);
const look = page => page.evaluate(() => { const e = document.querySelector('[data-ui="customize"]'); return e && e.dataset.look ? JSON.parse(e.dataset.look) : null; });

async function open(browser, file, ctxOpt) {
  const ctx = await browser.newContext(ctxOpt);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => { const f = r.failure(); if (f && !/ERR_ABORTED/.test(f.errorText)) errs.push('requestfailed ' + r.url() + ' ' + f.errorText); });
  await page.goto(BASE + file + Q);
  return { ctx, page, errs };
}

async function flow(browser, mobile) {
  prefix = mobile ? 'mo' : 'pc';
  const file = mobile ? 'mobile.html' : 'index.html';
  const opt = mobile ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } };
  const { ctx, page, errs } = await open(browser, file, opt);
  const tap = (n, i) => tapUi(page, n, i, mobile);
  console.log((mobile ? 'mobile' : 'PC') + ': bản lưu trống');
  await page.waitForSelector('[data-ui="title"][data-ready="1"]', { timeout: 60000 });
  await wait(page, 600);
  await shot(page, 'title');
  check('màn tiêu đề có logo + Touch To Start', await ui(page, 'logo').count() === 1 && await ui(page, 'touch').count() === 1);
  if (mobile) await page.touchscreen.tap(422, 300); else await page.mouse.click(640, 400);
  await ui(page, 'nickInput').waitFor({ timeout: 20000 });
  await wait(page, 900);
  await shot(page, 'nick_empty');
  await ui(page, 'nickInput').fill('TamSlime');
  check('ô biệt danh tối đa 18 ký tự', await ui(page, 'nickInput').evaluate(e => e.maxLength) === 18);
  await shot(page, 'nick');
  await tap('nickDone');
  await ui(page, 'nickConfirm').waitFor({ timeout: 5000 });
  check('Notice "Start with this name?" có tên', /TamSlime/.test(await ui(page, 'nickConfirm').innerText()));
  await wait(page, 300); await shot(page, 'nick_confirm');
  await page.locator('[data-ui="nickConfirm"] [data-ui="popupBtn"][data-v="true"]').click();
  await ui(page, 'customize').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => { const c = document.querySelector('[data-ui="mirror"]'); return c && c.dataset.look; }, null, { timeout: 30000 });
  await wait(page, 1200);
  await shot(page, 'cust_gender');
  // tab Gender -> nữ, Hair ô 4, Hair Color ô 6, Lens ô 3 (+ chụp mọi tab để so)
  await page.locator('[data-ui="opt"][data-v="woman"]').click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-ui="mirror"]').dataset.look).gender === 'woman', null, { timeout: 20000 });
  await wait(page, 800); await shot(page, 'cust_gender_w');
  const tabs = ['skin', 'hair', 'hairColor', 'face', 'lens', 'acc'];
  const pick = { hair: 3, hairColor: 5, lens: 2 };
  for (const k of tabs) {
    await page.locator(`[data-ui="tab"][data-k="${k}"]`).click();
    await wait(page, 300);
    if (pick[k] != null) {
      await page.locator(`[data-ui="opt"][data-v="${pick[k]}"]`).click();
      await page.waitForFunction(([k, v]) => JSON.parse(document.querySelector('[data-ui="mirror"]').dataset.look || '{}')[k] === v || JSON.parse(document.querySelector('[data-ui="customize"]').dataset.look || '{}')[k] === v, [k, pick[k]], { timeout: 20000 });
      await wait(page, 700);
    }
    await shot(page, 'cust_' + k);
  }
  const chosen = await look(page);
  check('diện mạo đã đổi theo tab', chosen && chosen.gender === 'woman' && chosen.hair === 3 && chosen.hairColor === 5 && chosen.lens === 2, JSON.stringify(chosen));
  await tap('done');
  await ui(page, 'lookConfirm').waitFor({ timeout: 5000 });
  await wait(page, 300); await shot(page, 'look_confirm');
  await page.locator('[data-ui="lookConfirm"] [data-ui="popupBtn"][data-v="true"]').click();
  // truyện tranh
  await page.waitForFunction(() => window.WOS_INTRO && window.WOS_INTRO.stage === 'comic', null, { timeout: 15000 });
  await wait(page, 1600); await shot(page, 'comic1');
  if (mobile) await page.locator('[data-ui="comic"]').tap({ position: { x: 200, y: 200 } }); else await page.mouse.click(640, 360);
  await wait(page, 1500); await shot(page, 'comic2');
  check('truyện tranh: thẻ 2 sau khi chạm', await page.evaluate(() => document.querySelector('[data-ui="comic"]').dataset.card) === '2');
  await tap('skip');
  // ba lô
  await page.waitForFunction(() => window.WOS_INTRO && window.WOS_INTRO.stage === 'pack', null, { timeout: 30000 });
  await page.waitForSelector('[data-ui="packCanvas"]', { timeout: 30000 });
  await wait(page, 2500); await shot(page, 'pack_over');
  if (mobile) { await tap('arrowR'); } else await page.keyboard.press('ArrowRight');
  await wait(page, 1200); await shot(page, 'pack_focus_yellow');
  check('chọn ba lô: mũi tên phải -> ba lô vàng', await page.evaluate(() => document.querySelector('[data-ui="pack"]').dataset.focus) === 'yellow');
  if (mobile) await tap('pickChange'); else await page.keyboard.press('Escape');
  await wait(page, 1200); await shot(page, 'pack_focus_blue');
  check('"Let\'s take a look at the other pockets too." [Esc] -> ba lô xanh', await page.evaluate(() => document.querySelector('[data-ui="pack"]').dataset.focus) === 'blue');
  if (mobile) await tap('pickChange'); else await page.keyboard.press('Escape');
  await wait(page, 900);
  if (mobile) await tap('pickSelect'); else await page.keyboard.press('Space');
  // phim
  await page.waitForFunction(() => window.WOS_INTRO && window.WOS_INTRO.stage === 'film', null, { timeout: 15000 });
  await page.waitForFunction(() => { const v = document.querySelector('[data-ui="filmVideo"]'); return v && v.currentTime > 1.5; }, null, { timeout: 30000 }).catch(() => {});
  await shot(page, 'film');
  await tap('skip');
  // vào game
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 30000 }).catch(() => {});
  await wait(page, 1500);
  await shot(page, 'game');
  const g = await page.evaluate(() => ({ map: String(WOS.map.data.id), look: WOS.player.look, slime: WOS.slime.variant && WOS.slime.variant.id, name: WOS.state.player.name,
    party0: WOS.state.party[0] && WOS.state.party[0].id, save: JSON.parse(localStorage.getItem('wos.save') || 'null'), intro: !!document.getElementById('intro'),
    q1: WOS.quest && WOS.quest.save.quests.q1 ? WOS.quest.save.quests.q1.s : null, empty: !!document.querySelector('[data-hud="questEmpty"]'), errors: WOS.errors.slice() }));
  check('vào quán trọ 257', g.map === '257', g.map);
  check('avatar trong game = diện mạo đã chọn', g.look && JSON.stringify(g.look) === JSON.stringify(chosen), JSON.stringify(g.look));
  check('slime đồng hành = ba lô vàng (SL_ElecChicken_WindElectric)', g.slime === 'SL_ElecChicken_WindElectric' && g.party0 === g.slime, g.slime);
  check('tên người chơi = biệt danh', g.name === 'TamSlime', g.name);
  check('bản lưu có profile', g.save && g.save.profile && g.save.profile.name === 'TamSlime' && g.save.profile.slime === g.slime);
  check('lớp mở đầu đã gỡ', !g.intro);
  check('nhiệm vụ 1 chưa nhận lúc vừa tỉnh ("No quest." như clip 1:12, nhận sau khi đi)', g.q1 == null && g.empty, g.q1);
  // chân dung HUD vẽ từ avatar (canvas không trống)
  const thumbPx = await page.evaluate(() => { const c = WOS.hud.el.playerThumb; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  check('chân dung HUD chụp từ avatar', thumbPx > 2000, thumbPx);

  // tải lại: Touch To Start vào thẳng game
  console.log((mobile ? 'mobile' : 'PC') + ': tải lại trang');
  await page.reload();
  await page.waitForSelector('[data-ui="title"][data-ready="1"]', { timeout: 60000 });
  if (mobile) await page.touchscreen.tap(422, 300); else await page.mouse.click(640, 400);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await wait(page, 1200);
  const g2 = await page.evaluate(() => ({ look: WOS.player.look, slime: WOS.slime.variant && WOS.slime.variant.id, name: WOS.state.player.name, nick: !!document.querySelector('[data-ui="nickInput"]') }));
  check('tải lại: không hỏi lại tên / tạo nhân vật', !g2.nick);
  check('tải lại: diện mạo còn', JSON.stringify(g2.look) === JSON.stringify(chosen), JSON.stringify(g2.look));
  check('tải lại: slime + tên còn', g2.slime === 'SL_ElecChicken_WindElectric' && g2.name === 'TamSlime', g2.slime + ' ' + g2.name);
  await shot(page, 'game_reload');

  // Setting
  const d0 = await page.evaluate(() => WOS.camera.effDist());
  if (mobile) await page.locator('[data-hud="mainMenu"]').tap(); else await page.keyboard.press('Escape');
  await ui(page, 'settingList').waitFor({ timeout: 5000 });
  check('Setting mở, HUD vào chế độ modal', await page.evaluate(() => WOS.state.modal) === 'setting');
  await wait(page, 500); await shot(page, 'setting_graphic');
  await page.locator('[data-ui="range"][data-k="camScale"]').evaluate(e => { e.value = '0.8'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(page, 300);
  const d1 = await page.evaluate(() => WOS.camera.effDist());
  check('Camera Scale 0.80 -> khoảng camera x0.8', Math.abs(d1 / d0 - 0.8) < 0.02, (d1 / d0).toFixed(3));
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('wos.settings') || '{}').camScale);
  check('Camera Scale lưu lại', sv === 0.8, sv);
  await page.locator('[data-ui="select"][data-k="quality"]').selectOption('1');
  await wait(page, 300);
  check('Graphic Quality Thấp -> pixel ratio 0.75', await page.evaluate(() => WOS.renderer.getPixelRatio()) === 0.75);
  await page.locator('[data-ui="settingCat"][data-k="volume"]').click(); await wait(page, 300); await shot(page, 'setting_volume');
  await page.locator('[data-ui="settingCat"][data-k="account"]').click(); await wait(page, 300); await shot(page, 'setting_account');
  check('tab Account có Về Màn Hình Chính + Xoá dữ liệu chơi', await ui(page, 'toTitle').count() === 1 && await ui(page, 'reset').count() === 1);
  await tap('settingClose');
  await wait(page, 300);
  check('đóng Setting', await page.evaluate(() => WOS.state.modal) == null && await ui(page, 'settingList').count() === 0);
  await page.waitForTimeout(400);
  const d2 = await page.evaluate(() => WOS.camera.effDist());
  check('Camera Scale còn tác dụng sau khi đóng', Math.abs(d2 / d0 - 0.8) < 0.02, (d2 / d0).toFixed(3));
  // Go to Title Menu -> màn tiêu đề
  if (mobile) await page.locator('[data-hud="mainMenu"]').tap(); else await page.keyboard.press('Escape');
  await page.locator('[data-ui="settingCat"][data-k="account"]').click();
  await tap('toTitle');
  await page.locator('[data-ui="notice"] [data-ui="popupBtn"]').click();
  await page.waitForSelector('[data-ui="title"][data-ready="1"]', { timeout: 60000 });
  check('Go to Title Menu -> màn tiêu đề', true);
  const pe = await page.evaluate(() => (window.__wosErrors || []).slice());
  check('không lỗi trang / console / HTTP', errs.length === 0 && pe.length === 0 && g.errors.length === 0, [...errs, ...pe, ...g.errors].slice(0, 6).join(' | '));
  await ctx.close();
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000);
  try {
    await flow(browser, false);
    await flow(browser, true);
  } catch (e) { fail++; console.log('  FAIL exception: ' + (e && e.stack || e)); }
  clearTimeout(kill);
  await browser.close();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
