// Fullscreen, manifest, iOS hint and viewport sizing on the real page, with phone and desktop emulation.
//   timeout 600 node tools/fullscreen-test.js      DTT_BASE=<hub url> runs against a deployed hub
'use strict';
const { session, open, checker } = require('./lib.js');
const check = checker();
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SESSION = () => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ctxFor(br, kind) {
  const phone = kind !== 'desktop';
  const ctx = await br.newContext(phone
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: kind === 'iphone' ? IPHONE_UA : MOBILE_UA }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SESSION);
  return ctx;
}
const active = (page) => page.evaluate(() => !!document.fullscreenElement);
const waitActive = (page, want) => page.waitForFunction((w) => !!document.fullscreenElement === w, want, { timeout: 4000 }).then(() => true, () => false);
const center = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function tap(page, sel, touch) {
  const c = await center(page, sel);
  if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
}
// A page-owned button gives the toggle a real gesture to run inside.
const addToggleBtn = (page) => page.evaluate(() => {
  const b = document.createElement('button'); b.id = 'tfs'; b.textContent = 'fs';
  b.style.cssText = 'position:fixed;left:4px;bottom:4px;width:60px;height:60px;z-index:99';
  b.onclick = () => window.__G.fullscreen.toggle(); document.body.appendChild(b);
});
const PLAY = '#ui .play[data-r="play"]';

function pngSize(buf) { return buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null; }

session(async (br, base) => {
  // ---- phone: Fullscreen API ----
  {
    const ctx = await ctxFor(br, 'android');
    const g = await open(br, base, 'noaudio&q=low&seed=3', { ctx });
    const p = g.page;
    const info = await p.evaluate(() => ({ sup: window.__G.fullscreen.supported, touch: matchMedia('(pointer: coarse)').matches, mode: window.__G.mode }));
    check(info.sup && info.touch && info.mode === 'attract', `phone emulation: fullscreen supported, coarse pointer, menu showing (${JSON.stringify(info)})`);
    check(!(await active(p)), 'phone: not fullscreen before the first tap');
    await tap(p, PLAY, true);
    const ok = await waitActive(p, true);
    check(ok, 'phone: first tap on "Vào trận" enters fullscreen' + (ok ? '' : ' (lastError: ' + await p.evaluate(() => window.__G.fullscreen.lastError) + ')'));
    check(await p.evaluate(() => window.__G.mode === 'match' && window.__G.fullscreen.active), 'phone: the match started and G.fullscreen.active is true');
    const lock = await p.evaluate(() => (screen.orientation && screen.orientation.type) || 'n/a');
    console.log('INFO orientation after entering:', lock);
    const changes = await p.evaluate(() => { window.__fsn = 0; window.__G.fullscreen.onchange(() => window.__fsn++); return 0; });
    await addToggleBtn(p);
    await tap(p, '#tfs', true);
    check(await waitActive(p, false), 'phone: toggle exits fullscreen');
    await tap(p, '#tfs', true);
    check(await waitActive(p, true), 'phone: toggle enters fullscreen again');
    check(await p.evaluate(() => window.__fsn >= 2), 'phone: onchange listeners were called');
    // Leave through the API like Esc/back would, then play again.
    await p.evaluate(() => document.exitFullscreen());
    check(await waitActive(p, false), 'phone: left fullscreen');
    await p.evaluate(() => window.__G.bus.emit('ui:menu'));
    await sleep(500);
    await tap(p, '#tfs', true); await waitActive(p, true); await p.evaluate(() => document.exitFullscreen()); await waitActive(p, false);
    await p.evaluate(() => window.__G.bus.emit('ui:menu'));
    await p.waitForSelector(PLAY, { state: 'visible' });
    await sleep(300);
    // A tap that is not on a match start must not grab fullscreen back after the player left.
    await p.touchscreen.tap(5, 5); await sleep(400);
    check(!(await active(p)), 'phone: after leaving, a tap elsewhere does not re-enter');
    await tap(p, PLAY, true);
    check(await waitActive(p, true), 'phone: after an exit the next match start re-enters fullscreen');
    check(g.problems.length === 0, 'phone: no console errors' + (g.problems[0] ? ' ' + g.problems[0] : ''));
    await ctx.close();
  }
  // ---- desktop ----
  {
    const ctx = await ctxFor(br, 'desktop');
    const g = await open(br, base, 'noaudio&q=low&seed=3', { ctx });
    const p = g.page;
    await tap(p, PLAY, false);
    await sleep(800);
    check(await p.evaluate(() => window.__G.mode === 'match') && !(await active(p)), 'desktop: starting a match does not enter fullscreen');
    await addToggleBtn(p);
    await tap(p, '#tfs', false);
    check(await waitActive(p, true), 'desktop: the toggle still enters fullscreen');
    await ctx.close();
  }
  // ---- manifest and meta tags ----
  {
    const ctx = await ctxFor(br, 'android');
    const g = await open(br, base, 'noaudio&q=low', { ctx });
    const p = g.page;
    const href = await p.evaluate(() => { const l = document.querySelector('link[rel="manifest"]'); return l ? l.href : null; });
    check(!!href, 'index.html links a manifest');
    const r = await ctx.request.get(href);
    check(r.status() === 200, `manifest fetches with 200 (${href})`);
    let man = null; try { man = JSON.parse(await r.text()); } catch (e) { /* reported below */ }
    check(!!man && man.display === 'fullscreen' && man.orientation === 'landscape' && Array.isArray(man.display_override) && man.display_override[0] === 'fullscreen', 'manifest is JSON with display fullscreen and landscape orientation');
    check(!!man && man.scope === './' && man.start_url === './index.html' && man.name === 'Đấu Trường Thép', 'manifest scope, start_url and name');
    let okIcons = !!man && Array.isArray(man.icons) && man.icons.length >= 3, bad = [];
    const purposes = [];
    for (const ic of (man && man.icons) || []) {
      const rr = await ctx.request.get(new URL(ic.src, href).href);
      const sz = rr.status() === 200 ? pngSize(await rr.body()) : null;
      const want = ic.sizes.split('x').map(Number);
      if (!sz || sz[0] !== want[0] || sz[1] !== want[1]) { okIcons = false; bad.push(`${ic.src} ${rr.status()} ${sz} vs ${ic.sizes}`); }
      purposes.push(ic.sizes + (ic.purpose ? ':' + ic.purpose : ''));
    }
    check(okIcons && purposes.includes('192x192:any') && purposes.includes('512x512:any') && purposes.includes('512x512:maskable'), `manifest icons fetch with 200 at their declared size (${purposes.join(', ')})` + bad.join(';'));
    const metas = await p.evaluate(() => ({
      cap: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content, mcap: document.querySelector('meta[name="mobile-web-app-capable"]')?.content,
      bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content, touch: document.querySelector('link[rel="apple-touch-icon"]')?.href,
    }));
    check(metas.cap === 'yes' && metas.mcap === 'yes' && metas.bar === 'black-translucent' && !!metas.touch, 'apple and mobile web app meta tags and touch icon exist');
    if (metas.touch) { const rr = await ctx.request.get(metas.touch); const sz = rr.status() === 200 ? pngSize(await rr.body()) : null; check(!!sz && sz[0] === 180 && sz[1] === 180, 'apple-touch-icon is a 180x180 PNG'); }
    await ctx.close();
  }
  // ---- iPhone: no page fullscreen, hint once ----
  {
    const ctx = await ctxFor(br, 'iphone');
    const g = await open(br, base, 'noaudio&q=low&seed=3', { ctx });
    const p = g.page;
    check(await p.evaluate(() => window.__G.fullscreen.supported === false), 'iPhone user agent: G.fullscreen.supported is false');
    await tap(p, PLAY, true).catch(() => {});
    const shown = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
    await sleep(500);
    check(!(await active(p)), 'iPhone: a tap does not try fullscreen');
    await p.evaluate(() => window.__G.bus.emit('ui:menu')); await sleep(500);
    check(await shown('#a2hs-hint') && /Thêm vào Màn hình chính/.test(await p.textContent('#a2hs-hint')), 'iPhone: the add-to-home-screen hint shows on the menu');
    await p.evaluate(() => { document.body.classList.add('in-match'); }); await sleep(100);
    check(!(await shown('#a2hs-hint')), 'iPhone: the hint is hidden during a match');
    await p.evaluate(() => { document.body.classList.remove('in-match'); }); await sleep(100);
    await p.click('#a2hs-hint button');
    check((await p.locator('#a2hs-hint').count()) === 0, 'iPhone: dismissing removes the hint');
    await p.reload(); await p.waitForFunction('window.__ready === true', null, { timeout: 120000 }); await sleep(600);
    check((await p.locator('#a2hs-hint').count()) === 0, 'iPhone: the hint does not come back after a reload');
    await ctx.close();
  }
  // ---- viewport: canvas follows visualViewport ----
  {
    const ctx = await ctxFor(br, 'android');
    const g = await open(br, base, 'noaudio&q=low', { ctx });
    const p = g.page;
    for (const [w, h] of [[740, 340], [844, 390]]) {
      await p.setViewportSize({ width: w, height: h }); await sleep(700);
      const r = await p.evaluate(() => { const c = document.getElementById('view'), b = c.getBoundingClientRect(), v = visualViewport; const cs = getComputedStyle(document.documentElement);
        return { ch: b.height, vh: v.height, cw: b.width, vw: v.width, aspect: c.width / c.height, var: cs.getPropertyValue('--vvh'), buf: [c.width, c.height] }; });
      check(Math.abs(r.ch - r.vh) < 1 && Math.abs(r.cw - r.vw) < 1 && Math.abs(r.aspect - r.vw / r.vh) < 0.03 && parseFloat(r.var) === r.vh, `viewport ${w}x${h}: canvas ${r.cw}x${r.ch} = visualViewport ${r.vw}x${r.vh}, buffer ${r.buf}, --vvh ${r.var}`);
    }
    await ctx.close();
  }
  check.done();
});
