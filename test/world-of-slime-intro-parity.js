/*
 * Thế Giới Slime: chụp các màn mở đầu cùng trạng thái với ảnh chụp demo thật (D:\wos-ref\pilot) để so bằng skill
 * parity-compare. Mặc định nam, ô mặc định, tên TamSlime như ảnh thật. Ra D:\wos-ref\proof\intro\web\<key>.png
 * (key trùng thư mục D:\wos-ref\proof\intro\ref\<key>\).
 *   node test/world-of-slime-intro-parity.js        (biến WOS_BASE, WOS_ASSETS như world-of-slime-intro.js)
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const OUT = process.env.WOS_SHOTS || 'D:/wos-ref/proof/intro/web';
const q = s => '?' + s + (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '');
const LANG = process.env.WOS_LANG === undefined ? 'en' : process.env.WOS_LANG;   // ảnh thật là tiếng Anh
const errors = [];

async function page(browser, query, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (opt.profile) await ctx.addInitScript(p => localStorage.setItem('wos.save', JSON.stringify({ v: 1, profile: p })), opt.profile);
  if (opt.slow) await ctx.route(/player\/index\.json/, async r => { await new Promise(x => setTimeout(x, opt.slow)); r.continue(); });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + 'index.html' + q(query + (LANG ? '&lang=' + LANG : '')));
  return { ctx, p };
}
const shot = (p, k) => p.screenshot({ path: `${OUT}/${k}.png` });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000);
  let s;
  // loading + title
  s = await page(browser, 'fresh', { slow: 4000 });
  await s.p.waitForSelector('[data-ui="titleBar"]'); await s.p.waitForTimeout(1500); await shot(s.p, 'loading');
  await s.p.waitForSelector('[data-ui="title"][data-ready="1"]', { timeout: 60000 }); await s.p.waitForTimeout(500); await shot(s.p, 'title');
  await s.ctx.close();
  // nick + confirm
  s = await page(browser, 'intro=nick');
  await s.p.waitForSelector('[data-ui="nickInput"]'); await s.p.waitForTimeout(1500);
  await s.p.locator('[data-ui="nickInput"]').fill('TamSlime'); await shot(s.p, 'nick');
  await s.p.locator('[data-ui="nickDone"]').click(); await s.p.waitForSelector('[data-ui="nickConfirm"]'); await s.p.waitForTimeout(900); await shot(s.p, 'nick_confirm');
  await s.ctx.close();
  // customize tabs (mặc định)
  s = await page(browser, 'intro=custom&name=TamSlime');
  await s.p.waitForFunction(() => { const c = document.querySelector('[data-ui="mirror"]'); return c && c.dataset.look; }, null, { timeout: 30000 });
  await s.p.waitForTimeout(1500); await shot(s.p, 'cust_gender');
  for (const k of ['skin', 'hair', 'hairColor', 'face', 'lens', 'acc']) {
    await s.p.locator(`[data-ui="tab"][data-k="${k}"]`).click(); await s.p.waitForTimeout(700); await shot(s.p, 'cust_' + k);
  }
  await s.p.locator('[data-ui="done"]').click(); await s.p.waitForSelector('[data-ui="lookConfirm"]'); await s.p.waitForTimeout(900); await shot(s.p, 'look_confirm');
  await s.ctx.close();
  // comic thẻ 4 (Balrog, intro2.png)
  s = await page(browser, 'intro=comic');
  await s.p.waitForSelector('[data-ui="comic"]');
  for (let i = 0; i < 3; i++) { await s.p.waitForTimeout(1200); await s.p.mouse.click(640, 360); }
  await s.p.waitForTimeout(1600); await shot(s.p, 'comic');
  await s.ctx.close();
  // ba lô
  s = await page(browser, 'intro=pack');
  await s.p.waitForSelector('[data-ui="packCanvas"]', { timeout: 30000 }); await s.p.waitForTimeout(2500); await shot(s.p, 'pack_over');
  await s.p.keyboard.press('ArrowLeft'); await s.p.waitForTimeout(1500); await shot(s.p, 'pack_focus');
  await s.ctx.close();
  // phim: pilot pro3.png = giây 28.0 của img/prologue.mp4 (dò bằng ffmpeg fps=2 + sai khác trung bình nhỏ nhất)
  s = await page(browser, 'intro=film');
  await s.p.waitForFunction(() => { const v = document.querySelector('[data-ui="filmVideo"]'); return v && v.readyState >= 2; }, null, { timeout: 30000 });
  await s.p.evaluate(() => { const v = document.querySelector('[data-ui="filmVideo"]'); v.pause(); v.currentTime = +(new URLSearchParams(location.search).get('t') || 28.0); });
  await s.p.waitForTimeout(800); await shot(s.p, 'film');
  await s.ctx.close();
  // game với profile mặc định + Setting
  s = await page(browser, 'x=1', { profile: { name: 'TamSlime', look: { gender: 'man', skin: 1, hair: 0, hairColor: 9, face: 0, lens: 0, acc: 0 }, slime: 'SL_ElecChicken_WindFire', bag: 'blue' } });
  await s.p.waitForSelector('[data-ui="title"][data-ready="1"]', { timeout: 60000 }); await s.p.mouse.click(640, 400);
  await s.p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await s.p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 30000 }).catch(() => {});
  await s.p.waitForTimeout(1500); await shot(s.p, 'game');
  await s.p.keyboard.press('Escape'); await s.p.waitForSelector('[data-ui="settingList"]'); await s.p.waitForTimeout(600); await shot(s.p, 'setting_graphic');
  await s.p.locator('[data-ui="settingCat"][data-k="account"]').click(); await s.p.waitForTimeout(400); await shot(s.p, 'setting_account');
  await s.ctx.close();
  clearTimeout(kill); await browser.close();
  console.log('shots in ' + OUT + (errors.length ? '\nerrors: ' + errors.join(' | ') : ''));
  process.exit(errors.length ? 1 : 0);
})();
