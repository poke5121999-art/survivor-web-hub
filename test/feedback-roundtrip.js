/*
 * Đường đi của chủ dự án: hub -> bấm thẻ game A -> F9 -> đóng ngăn -> về hub -> thẻ game B -> F9 ... (chuỗi = các cặp A/B liền nhau).
 * Một context cho cả chuỗi (đệm trình duyệt dùng chung như máy thật). Mỗi bước: phím F9 thật, đóng luân phiên F9/Esc/nút ✕,
 * bấm chuột nút máy ảnh, rồi F9 lần nữa. Về hub luân phiên bằng nút Back (bfcache) và mở lại index.html. Không gửi phiếu.
 *
 * Dùng:  BASE=https://poke5121999-art.github.io/survivor-web-hub PLAYWRIGHT_PATH=... CHROME_PATH=... node test/feedback-roundtrip.js id1 id2 ...
 *        Trên linux2: khoá ~/.twt-slot-C.lock, ≤ 12 game mỗi lần để vừa 600 s.
 */
'use strict';
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const BASE = (process.env.BASE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/+$/, '');
const WAIT = Number(process.env.WAIT || 6000);
const ids = process.argv.slice(2);

function panelOpen(page) {
  return page.evaluate(() => {
    const h = document.getElementById('hub-feedback-capture');
    const p = h && h.shadowRoot && h.shadowRoot.querySelector('.panel');
    return p ? !p.hidden : null;
  }).catch(() => null);
}
async function waitPanel(page, want, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const o = await panelOpen(page);
    if (o === want) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

(async () => {
  const { chromium } = require(PW);
  const br = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('hub.session.v1')) localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', name: 'fbcap-test' }));
      localStorage.setItem('hub.lang', 'vi');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const res = [];
  let prev = null, step = 0;
  for (const id of ids) {
    step++;
    const r = { id, after: prev, kit: null, f9: null, f9close: null, cam: null, note: '' };
    try {
      // back to hub: alternate history back / fresh navigation
      if (prev && step % 2 === 0) await page.goBack({ waitUntil: 'load', timeout: 60000 }).catch(() => null);
      if (!/\/survivor-web-hub\/(index\.html)?(\?|#|$)/.test(page.url())) await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1200);
      if (/login\.html/.test(page.url())) { r.note = 'hub->login'; res.push(r); console.log(JSON.stringify(r)); break; }
      const href = await page.evaluate((gid) => {
        const g = (window.HUB_GAMES || []).find((x) => x.id === gid);
        if (!g) return null;
        const as = [...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href').split('?')[0] === g.path && a.offsetParent);
        if (!as.length) return 'NOCARD ' + g.path;
        as[as.length - 1].scrollIntoView();
        as[as.length - 1].setAttribute('data-f9pick', '1');
        return as[as.length - 1].href;
      }, id);
      if (!href || /^NOCARD/.test(href)) { r.note = 'no card ' + href; res.push(r); console.log(JSON.stringify(r)); continue; }
      await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 90000 }).catch((e) => { r.note += 'nav:' + e.message.slice(0, 60) + ' '; }), page.click('a[data-f9pick]')]);
      await page.waitForTimeout(WAIT);
      r.url = page.url();
      r.kit = await page.evaluate(() => window.__hubCapture ? window.__hubCapture.version : null).catch(() => 'ERR');
      // real keyboard, after a click into the game (owner plays first)
      await page.mouse.click(683, 400).catch(() => null);
      await page.waitForTimeout(300);
      await page.keyboard.press('F9');
      r.f9 = r.kit ? await waitPanel(page, true, 45000) : false;
      if (r.f9) {
        // close: alternate F9 / Esc / X button
        const how = step % 3;
        if (how === 0) await page.keyboard.press('F9');
        else if (how === 1) await page.keyboard.press('Escape');
        else await page.evaluate(() => { const b = document.getElementById('hub-feedback-capture').shadowRoot.querySelector('[data-act=close]'); b && b.click(); });
        r.closeHow = ['F9', 'Esc', 'X'][how];
        r.f9close = await waitPanel(page, false, 5000);
        // camera button with a real mouse click
        const box = await page.evaluate(() => { const c = document.getElementById('hub-feedback-capture').shadowRoot.querySelector('.cam'); if (!c) return null; const b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, vis: getComputedStyle(c).display !== 'none' && !c.hidden }; });
        if (box && box.w > 0 && box.vis) {
          await page.mouse.click(box.x, box.y);
          r.cam = await waitPanel(page, true, 45000);
          if (r.cam) { await page.keyboard.press('F9'); r.camClose = await waitPanel(page, false, 5000); }
        } else r.cam = 'nobtn ' + JSON.stringify(box);
        // F9 once more after the round trip (owner: "F9 lại")
        await page.keyboard.press('F9');
        r.f9again = await waitPanel(page, true, 45000);
        await page.keyboard.press('F9');
        await waitPanel(page, false, 5000);
      }
    } catch (e) { r.note += 'ERR ' + e.message.slice(0, 120); }
    res.push(r);
    console.log(JSON.stringify(r));
    prev = id;
  }
  await br.close();
  const bad = res.filter((r) => !(r.f9 && r.f9close && r.cam === true && r.f9again));
  console.log('\nSUMMARY ' + (res.length - bad.length) + '/' + res.length + ' pass; fail: ' + bad.map((r) => r.id + '(' + (r.kit || 'nokit') + ')').join(' '));
})();
