// Orientation and fullscreen: the landscape frame geometry at five viewports, the rotate cover on an upright phone
// (battle paused underneath, previous pause state restored), the Fullscreen API and orientation lock calls with
// stubs, the web app manifest, and the iPhone "add to home screen" hint.
// Usage: node games/ai-sinh-ton/tools/orient-test.mjs   (shots in .chk/landscape/orient-*.png)
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, PHONES, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'landscape'); fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'orient-' + name + '.png') });
const { check, done } = checker();

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
PHONES.p844 = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
PHONES.iphone = { ...PHONES.p844, userAgent: IPHONE_UA };
PHONES.portrait = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

const QUIET = 'noaudio=1&q=low';
const geo = (page) => page.evaluate(() => {
  const r = document.getElementById('frame').getBoundingClientRect();
  const c = document.getElementById('orient-rotate');
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, cover: !!c && getComputedStyle(c).display !== 'none' };
});
const STUB = () => {
  const s = window.__fs = { req: 0, lock: 0, exit: 0, unlock: 0, arg: '' };
  let fe = null; window.__fsSet = (v) => { fe = v ? document.documentElement : null; };
  Object.defineProperty(document, 'fullscreenElement', { get: () => fe, configurable: true });
  document.documentElement.requestFullscreen = () => { s.req++; fe = document.documentElement; return Promise.resolve(); };
  document.exitFullscreen = () => { s.exit++; fe = null; return Promise.resolve(); };
  const o = screen.orientation;
  Object.defineProperty(o, 'lock', { value: (a) => { s.lock++; s.arg = a; return window.__lockMode === 'reject' ? Promise.reject(new Error('NotSupportedError')) : window.__lockMode === 'throw' ? (() => { throw new Error('boom'); })() : Promise.resolve(); }, configurable: true });
  Object.defineProperty(o, 'unlock', { value: () => { s.unlock++; }, configurable: true });
};

const srv = await serve(); const br = await launch();
const problems = [];
try {
  // 1. frame geometry
  for (const [phone, name, fills] of [['s22', 's22', true], ['xiaomi', 'xiaomi', true], ['p844', 'iphone-844x390', true], ['desktop', 'desktop', false]]) {
    const s = await open(br, srv.base, phone, QUIET);
    const g = await geo(s.page);
    const asp = g.w / g.h;
    check(Math.abs(asp / (19.5 / 9) - 1) < 0.01, `${name}: frame ${g.w.toFixed(1)}x${g.h.toFixed(1)} aspect ${asp.toFixed(3)} within 1% of 19.5:9`);
    check(!g.cover, `${name}: no rotate prompt in landscape`);
    if (fills) check(g.w >= g.vw * 0.99 && g.h >= g.vh * 0.98, `${name}: frame fills the ${g.vw}x${g.vh} viewport`);
    else {
      check(Math.abs(g.x * 2 + g.w - g.vw) < 1.5 && Math.abs(g.y * 2 + g.h - g.vh) < 1.5 && g.h < g.vh - 20, `${name}: frame centred and letterboxed (x ${g.x.toFixed(0)}, y ${g.y.toFixed(0)})`);
      await s.page.evaluate(STUB); await s.page.mouse.click(640, 360); await s.page.mouse.click(600, 300);
      const f = await s.page.evaluate(() => ({ ...window.__fs, on: __G.fullscreen.on, supported: __G.fullscreen.supported }));
      check(f.req === 0 && f.lock === 0, `desktop: clicks make no fullscreen request (req ${f.req}, lock ${f.lock}); setting off by default (on=${f.on})`);
    }
    await shot(s.page, name); problems.push(...s.problems.map((p) => name + ' ' + p)); await s.ctx.close();
  }

  // 2. upright phone: cover, pause, restore
  {
    const s = await open(br, srv.base, 's22', QUIET + '&autostart=1&stage=1&seed=3');
    const page = s.page;
    const st = () => page.evaluate(() => ({ paused: __G.paused, t: __G.B ? __G.B.t : -1, phase: __G.B && __G.B.phase }));
    await page.waitForTimeout(600);
    const a = await st(); await page.waitForTimeout(500); const b = await st();
    check(a.phase === 'fight' && b.t > a.t, `portrait test: a battle is running before the rotation (t ${a.t.toFixed(2)} to ${b.t.toFixed(2)})`);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('orient-rotate')).display !== 'none', null, { timeout: 5000 });
    const r = await page.evaluate(() => { const c = document.getElementById('orient-rotate').getBoundingClientRect(), f = document.getElementById('frame').getBoundingClientRect(); return { c: [c.x, c.y, c.right, c.bottom], f: [f.x, f.y, f.right, f.bottom], text: document.getElementById('orient-rotate').querySelector('b').textContent }; });
    check(r.c[0] <= r.f[0] && r.c[1] <= r.f[1] && r.c[2] >= r.f[2] && r.c[3] >= r.f[3], `portrait 360x780: prompt covers the frame (prompt ${r.c.map(Math.round)} frame ${r.f.map(Math.round)})`);
    check(/Xoay ngang màn hình/.test(r.text), `portrait: prompt text "${r.text}"`);
    await page.waitForTimeout(300);
    const p1 = await st(); await page.waitForTimeout(600); const p2 = await st();
    check(p1.paused && p2.t === p1.t, `portrait: the battle is paused under the prompt (paused ${p1.paused}, t ${p1.t.toFixed(2)} then ${p2.t.toFixed(2)})`);
    await shot(page, 'portrait-prompt');
    await page.setViewportSize({ width: 780, height: 360 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('orient-rotate')).display === 'none', null, { timeout: 5000 });
    const q1 = await st(); await page.waitForTimeout(600); const q2 = await st();
    check(!q1.paused && q2.t > q1.t, `landscape again: prompt gone, battle resumes (paused ${q1.paused}, t ${q1.t.toFixed(2)} to ${q2.t.toFixed(2)})`);
    // a battle the player had already paused stays paused after the round trip
    await page.evaluate(() => __G.setPaused(true));
    await page.setViewportSize({ width: 360, height: 780 }); await page.waitForTimeout(300);
    await page.setViewportSize({ width: 780, height: 360 }); await page.waitForTimeout(400);
    const k = await st();
    check(k.paused === true, `a battle paused by the player stays paused after the round trip (paused ${k.paused})`);
    await page.evaluate(() => __G.setPaused(false));
    problems.push(...s.problems.map((p) => 'portrait ' + p)); await s.ctx.close();
  }

  // 3. Fullscreen API and orientation lock (stubbed)
  {
    const s = await open(br, srv.base, 's22', QUIET);
    const page = s.page; await page.evaluate(STUB);
    const f0 = await page.evaluate(() => ({ on: __G.fullscreen.on, supported: __G.fullscreen.supported, keys: Object.keys(__G.fullscreen).sort().join(',') }));
    check(f0.on && f0.supported && f0.keys === 'on,supported,toggle', `touch device: fullscreen on by default, API {${f0.keys}}`);
    await page.touchscreen.tap(390, 180); await page.waitForTimeout(300);
    let f = await page.evaluate(() => ({ ...window.__fs }));
    check(f.req === 1 && f.lock === 1 && f.arg === 'landscape', `first tap: requestFullscreen once and orientation.lock('landscape') once (req ${f.req}, lock ${f.lock}, "${f.arg}")`);
    await page.touchscreen.tap(300, 200); await page.waitForTimeout(200);
    await page.evaluate(() => __fsSet(false)); await page.touchscreen.tap(320, 220); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ ...window.__fs }));
    check(f.req === 1 && f.lock === 1, `later taps (also after the player left fullscreen) do not repeat the calls (req ${f.req}, lock ${f.lock})`);
    await page.evaluate(() => __fsSet(true));
    await page.evaluate(() => __G.setSetting('fullscreen', false)); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ ...window.__fs, on: __G.fullscreen.on, saved: JSON.parse(localStorage.getItem('aisinhton.settings.v1')).fullscreen }));
    check(f.exit === 1 && !f.on && f.saved === false, `fullscreen off in settings: exits once, saved in the settings key (exit ${f.exit}, on ${f.on}, saved ${f.saved})`);
    await page.touchscreen.tap(330, 120); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ ...window.__fs }));
    check(f.req === 1, `with fullscreen off, taps request nothing (req ${f.req})`);
    await page.evaluate(() => { __fsSet(false); __G.fullscreen.toggle(); }); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ ...window.__fs, on: __G.fullscreen.on }));
    check(f.on && f.req === 2 && f.lock === 2, `toggle() back on requests fullscreen and lock again (req ${f.req}, lock ${f.lock})`);
    problems.push(...s.problems.map((p) => 'stub ' + p)); await s.ctx.close();

    for (const mode of ['reject', 'throw']) {
      const t = await open(br, srv.base, 's22', QUIET);
      await t.page.evaluate(STUB); await t.page.evaluate((m) => { window.__lockMode = m; }, mode);
      await t.page.touchscreen.tap(390, 180); await t.page.waitForTimeout(400);
      await t.page.touchscreen.tap(300, 200); await t.page.waitForTimeout(200);
      const g = await t.page.evaluate(() => ({ ...window.__fs, alive: typeof __G.update !== 'undefined' || !!__G.fullscreen }));
      check(g.lock === 1 && g.alive && t.problems.length === 0, `lock that ${mode}s: swallowed, not retried (lock ${g.lock}, errors ${t.problems.length})`);
      problems.push(...t.problems.map((p) => mode + ' ' + p)); await t.ctx.close();
    }
  }

  // 4. manifest
  {
    const s = await open(br, srv.base, 's22', QUIET);
    const m = await s.page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const res = await fetch(link.href); const j = JSON.parse(await res.text());
      const icons = []; for (const i of j.icons) { const r = await fetch(new URL(i.src, link.href)); icons.push(r.ok); }
      return { ok: res.ok, j, icons, start: new URL(j.start_url, link.href).pathname, scope: new URL(j.scope, link.href).pathname, caps: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content, mcap: document.querySelector('meta[name="mobile-web-app-capable"]')?.content, theme: document.querySelector('meta[name="theme-color"]')?.content, vp: document.querySelector('meta[name="viewport"]').content, touchIcon: !!document.querySelector('link[rel="apple-touch-icon"]') };
    });
    check(m.ok && m.j.display === 'fullscreen' && m.j.orientation === 'landscape', `manifest served and parsed: display ${m.j.display}, orientation ${m.j.orientation}`);
    check(m.start.endsWith('/games/ai-sinh-ton/index.html') && m.scope.endsWith('/games/ai-sinh-ton/') && m.icons.length >= 3 && m.icons.every(Boolean), `manifest start_url ${m.start}, scope ${m.scope}, ${m.icons.length} icons all served`);
    check(m.caps === 'yes' && m.mcap === 'yes' && !!m.theme && /viewport-fit=cover/.test(m.vp) && m.touchIcon, `index.html: web app meta tags, theme ${m.theme}, viewport-fit=cover, touch icon`);
    problems.push(...s.problems.map((p) => 'manifest ' + p)); await s.ctx.close();
  }

  // 5. iPhone hint
  {
    const s = await open(br, srv.base, 'iphone', QUIET);
    const hint = (p) => p.evaluate(() => { const h = document.getElementById('orient-hint'); return h ? { text: h.innerText, inFrame: document.getElementById('frame').contains(h), vis: getComputedStyle(h).display !== 'none', supported: __G.fullscreen.supported } : null; });
    await s.page.waitForTimeout(300);
    const h = await hint(s.page);
    check(!!h && h.vis && h.inFrame && !h.supported && /Thêm vào Màn hình chính để chơi toàn màn hình/.test(h.text), `iPhone UA: hint shows ("${h && h.text.split('\n')[0]}"), no fullscreen API`);
    await shot(s.page, 'iphone-hint');
    await s.page.reload(); await s.page.waitForFunction('window.__ready === true'); await s.page.waitForTimeout(300);
    check(!!(await hint(s.page)), 'iPhone UA: hint still shows after a reload while not dismissed');
    await s.page.touchscreen.tap(...await s.page.evaluate(() => { const r = document.querySelector('#orient-hint button').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
    await s.page.waitForTimeout(200);
    check(!(await hint(s.page)), 'iPhone UA: the close button removes the hint');
    await s.page.reload(); await s.page.waitForFunction('window.__ready === true'); await s.page.waitForTimeout(300);
    check(!(await hint(s.page)), 'iPhone UA: hint stays dismissed after a reload');
    problems.push(...s.problems.map((p) => 'iphone ' + p)); await s.ctx.close();
  }
  check(problems.length === 0, `no console errors across all pages (${problems.slice(0, 3).join(' | ') || 'none'})`);
} finally { await br.close(); srv.close(); }
done();
