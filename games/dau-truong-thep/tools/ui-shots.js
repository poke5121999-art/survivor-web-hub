'use strict';
// Screenshots every UI screen at desktop and phone-landscape size and asserts the basics.
// Run: timeout 300 node tools/ui-shots.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { serve } = require(ROOT + '/tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
const { chromium } = require(PW);
const OUT = ROOT + '/.chk';
const PAGE = '/games/dau-truong-thep/tools/ui-harness.html';

let pass = 0, fail = 0, marksFlagged = 0, marksScreens = 0;
const failures = [];
function check(name, ok, info) {
  if (ok) pass++; else { fail++; failures.push(name + (info ? ' :: ' + info : '')); }
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (!ok && info ? '  ' + info : ''));
}

// Elements that are visible but poke out of the viewport, ignoring anything inside a scroll container.
function overflowReport() {
  const vw = innerWidth, vh = innerHeight, bad = [];
  const scrolls = (n) => {
    for (let p = n.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(auto|scroll)/.test(o.overflowY) && p.scrollHeight > p.clientHeight + 1) return true;
    }
    return false;
  };
  const roots = [document.getElementById('ui'), document.getElementById('touch')].filter(Boolean);
  for (const r of roots) {
    for (const n of r.querySelectorAll('*')) {
      if (!(n instanceof HTMLElement) || n.classList.contains('fn') || n.closest('.np, .pl, .twb') || n.parentElement.classList.contains('vig')) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      let hid = false;
      for (let p = n.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) { hid = true; break; } }
      if (hid) continue;
      const b = n.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) {
        if (scrolls(n)) continue;
        bad.push(`${n.tagName.toLowerCase()}.${n.className && n.className.baseVal === undefined ? n.className : ''} [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}]`);
      }
      if (n.tagName === 'BUTTON' && n.scrollWidth > n.clientWidth + 2) bad.push('clipped text in button ' + n.textContent.trim());
    }
  }
  return bad.slice(0, 8);
}

// Vietnamese capitals carry stacked marks (Ầ, Ẩ, Ở, Ế, Ỗ, Ặ) that rise above the cap height, and some of them come from a fallback face whose ascent is
// taller than the main face. An element with such text must keep its line box tall enough (line-height >= 1.3 em) and no clipping ancestor may cut the
// top of the text's glyph box. Clippers: overflow other than visible, clip-path, and background-clip: text (the ink only paints inside the box).
function marksReport() {
  const out = [], root = document.getElementById('ui'), inkCtx = document.createElement('canvas');
  const HAS = /\p{Lu}̛?[̀́̂̃̆̉]/u;
  const hidden = (n) => { for (let p = n; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return true; } return false; };
  for (const n of root.querySelectorAll('*')) {
    if (!(n instanceof HTMLElement) || n.closest('.rotate') && !n.closest('.portrait-lock')) continue;
    const texts = [...n.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim());
    if (!texts.length) continue;
    const cs = getComputedStyle(n);
    const caps = (t) => (cs.textTransform === 'uppercase' ? t.toUpperCase() : t).normalize('NFD');
    const hit = texts.filter((t) => HAS.test(caps(t.textContent)));
    if (!hit.length || hidden(n)) continue;
    const label = `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} "${hit[0].textContent.trim().slice(0, 14)}"`;
    const fsz = parseFloat(cs.fontSize), lh = cs.lineHeight === 'normal' ? 0 : parseFloat(cs.lineHeight);
    if (!(lh / fsz >= 1.3 - 1e-3)) { out.push(`${label} line-height ${(lh / fsz).toFixed(2)}`); continue; }
    const rg = document.createRange(); rg.selectNodeContents(hit[0]);
    const rect = rg.getClientRects()[0];
    if (!rect) continue;
    // The range rect is the glyph box of the main face; the stacked marks can come from a fallback face and stand taller. Ink top = rect top + main ascent - ink ascent.
    const cx = inkCtx.getContext('2d');
    cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; cx.fontStretch = cs.fontStretch;
    const capsText = [...caps(hit[0].textContent).normalize('NFC')].filter((ch) => HAS.test(ch.normalize('NFD'))).join('');
    const m = cx.measureText(capsText);
    const top = Math.min(rect.top, rect.top + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent);
    for (let p = n; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      const clips = c.overflowY !== 'visible' || c.clipPath !== 'none' || (p === n && /text/.test(c.webkitBackgroundClip || c.backgroundClip));
      if (!clips) continue;
      const b = p.getBoundingClientRect(), edge = b.top + (c.overflowY !== 'visible' ? parseFloat(c.borderTopWidth) || 0 : 0);
      // a line already cut by scrolling or by the screen edge is not a missing-mark case
      if (top < edge - 0.5 && rect.top >= edge - 0.5) { out.push(`${label} text top ${top.toFixed(1)} (ink) above the clip of ${p.tagName.toLowerCase()}.${String(p.className).split(' ')[0]} at ${edge.toFixed(1)}`); break; }
    }
  }
  return out;
}

async function open(browser, name, vp, touch, query) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, deviceScaleFactor: 1 });
  // UI_CSS=<file> serves that stylesheet in place of css/ui.css: a before number for the tone-mark check.
  if (process.env.UI_CSS) await ctx.route('**/css/ui.css', (r) => r.fulfill({ path: process.env.UI_CSS, contentType: 'text/css' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url()); });
  // The menu's setup (mode, arena, theme) is a sheet over the info column: a click on anything in it first opens the sheet,
  // a click in the info column closes it. Phones show one setup group at a time: a click on a picker in a hidden group first opens its tab.
  // Pulsing buttons never count as stable under the GPU renderer, so they are clicked with force.
  const click = page.click.bind(page);
  page.click = async (sel, o) => {
    if (typeof sel === 'string') {
      await page.evaluate((q) => {
        const n = document.querySelector(q), open = !!document.querySelector('#ui .menu.su-open'), chip = document.querySelector('#ui .menu [data-r="matchBtn"]');
        if (n && chip && n.closest('.menu .setup') && !open) chip.click();
        if (n && chip && n.closest('.menu .detail') && open) chip.click();
        const g = n && n.closest && n.closest('.grp');
        if (!g || g.offsetParent) return;
        const k = g.classList.contains('g-map') ? 'map' : g.classList.contains('g-theme') ? 'theme' : 'mode';
        const b = n.closest('.lobby') ? document.querySelector(`#ui .lobby .su-tabs [data-k="${k}"]`) : document.querySelector(`#ui .menu .su-tabs [data-su="${k}"]`);
        if (b) b.click();
      }, sel);
    }
    return click(sel, typeof sel === 'string' && /\.play|\.netbtn|\.go\b|data-a="start"/.test(sel) ? { force: true, ...o } : o);
  };
  await page.goto(base + PAGE + '?' + query);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  return { ctx, page, errs };
}
let base;

async function shot(page, errs, tag, expectFn, settle, skipOverflow) {
  await page.waitForTimeout(settle || 900);
  const file = `${OUT}/ui-${tag}.png`;
  await page.screenshot({ path: file });
  check(`${tag}: no console errors`, errs.length === 0 && (await page.evaluate(() => window.__errors.length)) === 0, errs.concat(await page.evaluate(() => window.__errors)).join(' | '));
  const bad = skipOverflow ? [] : await page.evaluate(overflowReport);
  check(`${tag}: nothing overflows the viewport`, bad.length === 0, bad.join('; '));
  const marks = await page.evaluate(marksReport);
  marksFlagged += marks.length; marksScreens++;
  check(`${tag}: Vietnamese capitals keep room for their tone marks`, marks.length === 0, marks.slice(0, 6).join('; '));
  if (expectFn) await expectFn();
  return file;
}


/* ---------- phone and tablet touch audit ---------- */
// Visible text under 11 px, in CSS px as computed (inputs count too).
function smallTextReport() {
  const out = [], root = document.getElementById('ui');
  const vis = (n) => {
    for (let p = n; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; }
    const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0;
  };
  for (const n of root.querySelectorAll('*')) {
    if (!(n instanceof HTMLElement)) continue;
    const own = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    const isIn = n.tagName === 'INPUT' && n.type !== 'range';
    if (!own && !isIn) continue;
    if (n.closest('.rotate') && !n.closest('.portrait-lock')) continue;
    if (!vis(n)) continue;
    const fs = parseFloat(getComputedStyle(n).fontSize);
    if (fs < 10.95) out.push(`${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} ${fs.toFixed(1)}px "${(n.textContent || n.value || '').trim().slice(0, 16)}"`);
  }
  return [...new Set(out)].slice(0, 10);
}
// Interactive elements under 48 CSS px in either direction.
function smallTargetReport() {
  const out = [], root = document.getElementById('ui');
  const vis = (n) => {
    for (let p = n; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0 || c.pointerEvents === 'none') return false; }
    const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0;
  };
  for (const n of root.querySelectorAll('button, input, select, a, [role=button], .mm')) {
    if (n.closest('.rotate') || !vis(n)) continue;
    if (n.classList.contains('mm') && !n.closest('.hud')) continue;
    const b = n.getBoundingClientRect();
    if (b.width < 47.5 || b.height < 47.5) out.push(`${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} ${Math.round(b.width)}x${Math.round(b.height)} "${(n.textContent || n.value || '').trim().slice(0, 14)}"`);
  }
  return [...new Set(out)].slice(0, 10);
}
// HUD pieces (not the thumb layer) that cross the middle of the screen or either bottom corner while a match runs.
function hudZoneReport() {
  const vw = innerWidth, vh = innerHeight, out = [];
  const zones = { centre: [vw * 0.35, vh * 0.3, vw * 0.65, vh * 0.7], 'corner-left': [0, vh - 200, 260, vh], 'corner-right': [vw - 260, vh - 200, vw, vh] };
  const sel = '.hud .sc, .hud .boss-top, .hud .pts, .hud .pc, .hud .rkr, .hud .kf, .hud .mm, .hud .perf, .hud .pausebtn, .hud .setbtn, .hud .chatbtn, .hud .hpb, .hud .chip, .hud .mission, .hud .chatbox';
  for (const n of document.querySelectorAll(sel)) {
    let hid = false;
    for (let p = n; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) { hid = true; break; } }
    if (hid) continue;
    const b = n.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    for (const [name, [x0, y0, x1, y1]] of Object.entries(zones)) {
      if (b.left < x1 - 1 && b.right > x0 + 1 && b.top < y1 - 1 && b.bottom > y0 + 1) out.push(`${n.className.split(' ')[0]} in ${name} [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}]`);
    }
  }
  // the top strip must not collide with itself either
  const strip = ['.hud .mm', '.hud .col.mine', '.hud .hud-top .sc, .hud .hud-top .boss-top', '.hud .col.foe', '.hud .setbtn', '.hud .pausebtn']
    .map((q) => { const n = document.querySelector(q); if (!n) return null; const b = n.getBoundingClientRect(); return b.width ? { q, b } : null; }).filter(Boolean);
  for (let i = 0; i < strip.length; i++) for (let j = i + 1; j < strip.length; j++) {
    const a = strip[i].b, c = strip[j].b;
    if (a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1 && !(strip[i].q.includes('col.mine') && strip[j].q.includes('mm') && document.querySelector('.hud[data-mode="tudo"]'))) out.push(`${strip[i].q} overlaps ${strip[j].q}`);
  }
  return out.slice(0, 8);
}
// What each phone state must look like. big: the screen is a menu-like one (checked for touch targets as well).
async function phoneAudit(page, tag, o = {}) {
  const small = await page.evaluate(smallTextReport);
  check(`${tag}: no visible text under 11 px`, small.length === 0, small.join(' | '));
  const tg = o.targets === false ? [] : await page.evaluate(smallTargetReport);
  check(`${tag}: every button and field is at least 48 px`, tg.length === 0, tg.join(' | '));
  if (o.zones) {
    const z = await page.evaluate(hudZoneReport);
    check(`${tag}: HUD leaves the middle and both bottom corners free, top strip does not collide`, z.length === 0, z.join(' | '));
  }
}

async function phoneSuite(browser) {
  const SZ = [[740, 360], [844, 390], [915, 412]];
  const sizeTag = (w) => 'phone' + w;
  // ----- HUD in every mode at the two smallest sizes, with a short map and a long one
  for (const [w, h] of SZ.slice(0, 2)) {
    for (const mode of MODE_ORDER_LOCAL) {
      const T = (s) => `${sizeTag(w)}-${s}`;
      const { ctx, page, errs } = await open(browser, T('hud-' + mode), { width: w, height: h }, true, `screen=hud&mode=${mode}&mech=ung&fps=58`);
      await shot(page, errs, T('hud-' + mode), async () => {
        await phoneAudit(page, T('hud-' + mode), { zones: true });
        const r = await page.evaluate(() => ({ touch: document.getElementById('ui').classList.contains('is-touch'), slots: getComputedStyle(document.querySelector('#ui .slots')).display, perf: document.querySelector('#ui .perf').textContent, set: !!document.querySelector('#ui .setbtn') && document.querySelector('#ui .setbtn').getBoundingClientRect().width >= 47.5, cards: document.querySelectorAll('#ui .pc').length, np: [...document.querySelectorAll('#ui .np:not(.off) .np-hp')].map((n) => n.getBoundingClientRect().height) }));
        check(T('hud-' + mode) + ': touch HUD (own skill bar hidden, ping/FPS readout, settings button, team chips)', r.touch && r.slots === 'none' && /58 FPS/.test(r.perf) && r.set && (mode === 'tudo' ? r.cards === 0 : r.cards === (mode === 'trum' ? 3 : 6)), JSON.stringify(r));
        check(T('hud-' + mode) + ': health bars over tanks are at least 5 px tall', r.np.length > 0 && r.np.every((x) => x >= 4.9), JSON.stringify(r.np));
      }, 500);
      await ctx.close();
    }
  }
  // ----- minimap: small, expands on tap, collapses on the next tap or a tap outside
  for (const [w, h] of SZ.slice(0, 2)) {
    const T = (s) => `${sizeTag(w)}-${s}`;
    const { ctx, page, errs } = await open(browser, T('map'), { width: w, height: h }, true, 'screen=hud&mode=nha&mech=ung');
    const box = () => page.evaluate(() => { const b = document.querySelector('#ui .mm').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), big: document.querySelector('#ui .mm').classList.contains('big'), b: [b.left, b.top, b.right, b.bottom].map(Math.round) }; });
    const small = await box();
    check(T('map') + ': minimap starts small, top-left (about 100 to 140 px wide)', !small.big && small.w >= 90 && small.w <= 150 && small.b[0] < 20 && small.b[1] < 20, JSON.stringify(small));
    await page.tap('#ui .mm');
    await page.waitForTimeout(300);
    const big = await box();
    check(T('map') + ': a tap expands it to a large map inside the screen', big.big && big.w > small.w * 2 && big.b[2] <= w && big.b[3] <= h, JSON.stringify(big));
    await shot(page, errs, T('map-big'), () => phoneAudit(page, T('map-big'), { targets: true }), 400);
    await page.tap('#ui .mm');
    await page.waitForTimeout(250);
    check(T('map') + ': the next tap collapses it', !(await box()).big);
    await page.tap('#ui .mm'); await page.waitForTimeout(200);
    await page.touchscreen.tap(w * 0.6, h * 0.8);
    await page.waitForTimeout(250);
    check(T('map') + ': a tap outside collapses it too', !(await box()).big);
    await ctx.close();
  }
  // ----- pause with the fullscreen button, settings with the touch group
  for (const [w, h] of SZ.slice(0, 2)) {
    const T = (s) => `${sizeTag(w)}-${s}`;
    let { ctx, page, errs } = await open(browser, T('pause'), { width: w, height: h }, true, 'screen=hud&mech=ung&fs=1');
    await page.tap('#ui .pausebtn');
    await shot(page, errs, T('pause'), async () => {
      await phoneAudit(page, T('pause'));
      const r = await page.evaluate(() => ({ fs: (document.querySelector('#ui [data-r="fsBtn"]') || {}).textContent, vis: !!document.querySelector('#ui [data-r="fsBtn"]').offsetParent, box: document.querySelector('#ui .pause .box').getBoundingClientRect().bottom <= innerHeight, paused: __G.ui.paused }));
      check(T('pause') + ': menu has "Toàn màn hình: tắt" and fits the screen', r.paused && r.vis && /Toàn màn hình: tắt/.test(r.fs) && r.box, JSON.stringify(r));
    }, 300);
    await page.tap('#ui [data-r="fsBtn"]');
    await page.waitForTimeout(400);
    const on = await page.evaluate(() => ({ t: document.querySelector('#ui [data-r="fsBtn"]').textContent, a: __G.fullscreen.active }));
    check(T('pause') + ': the button toggles fullscreen and shows "bật"', on.a && /Toàn màn hình: bật/.test(on.t), JSON.stringify(on));
    await page.tap('#ui .pause [data-r="resume"]');
    await page.tap('#ui .setbtn');
    await shot(page, errs, T('hud-settings'), async () => {
      await phoneAudit(page, T('hud-settings'));
      const r = await page.evaluate(() => ({ modal: !!document.querySelector('#ui .modal.on'), grp: !document.querySelector('#ui [data-r="touchGrp"]').hidden, edit: !document.querySelector('#ui [data-r="lyEdit"]').offsetParent }));
      check(T('hud-settings') + ': the gear opens settings over the pause menu, touch group shown, "Sửa bố cục nút" only outside a match', r.modal && r.grp && r.edit, JSON.stringify(r));
    }, 300);
    await ctx.close();
    ({ ctx, page, errs } = await open(browser, T('settings'), { width: w, height: h }, true, 'screen=menu&fresh=1&fs=1'));
    await page.tap('#ui [data-r="bSet"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#ui .modal.on .modal-box').scrollTop = 400; });
    await shot(page, errs, T('settings-touch'), async () => {
      await phoneAudit(page, T('settings-touch'));
      const r = await page.evaluate(() => { const b = document.querySelector('#ui [data-r="touchGrp"]'); return { shown: !!b.offsetParent, h3: b.querySelector('h3').textContent, btns: [...b.querySelectorAll('button')].map((x) => x.textContent.trim().slice(0, 22)) }; });
      check(T('settings-touch') + ': group "Điều khiển cảm ứng" with Rung điện thoại (Tắt/Nhẹ/Mạnh), Tự nhắm, the priority choice and the three layout controls', r.shown && r.h3 === 'Điều khiển cảm ứng' && r.btns.length === 10 && r.btns.slice(0, 3).join('|') === 'Tắt|Nhẹ|Mạnh' && /^Tự nhắm \(cảm ứng\)/.test(r.btns[3]) && r.btns.slice(4, 7).join('|') === 'Gần nhất|Máu thấp nhất|Máu % thấp nhất' && /Cần điều khiển cố định/.test(r.btns[7]) && r.btns[8] === 'Sửa bố cục nút' && r.btns[9] === 'Về mặc định', JSON.stringify(r));
    }, 200);
    await page.tap('#ui [data-r="fixStick"]');
    let ly = await page.evaluate(() => ({ fixed: __G.input.layout.get().fixedStick, pressed: document.querySelector('#ui [data-r="fixStick"]').getAttribute('aria-pressed') }));
    check(T('settings-touch') + ': "Cần điều khiển cố định" reaches layout.set({ fixedStick })', ly.fixed === true && ly.pressed === 'true', JSON.stringify(ly));
    await page.evaluate(() => { const L = __G.input.layout; L.calls = []; for (const k of ['reset', 'edit']) L[k] = (function (f) { return function () { __G['__' + k] = (__G['__' + k] || 0) + 1; return f.apply(this, arguments); }; })(L[k]); });
    await page.tap('#ui [data-r="lyReset"]');
    await page.waitForTimeout(200);
    const cf = await page.evaluate(() => ({ ask: document.querySelector('#ui .modal-box.ask').offsetParent !== null, resets: __G.__reset || 0 }));
    check(T('settings-touch') + ': "Về mặc định" asks first and does not reset yet', cf.ask && cf.resets === 0, JSON.stringify(cf));
    await page.screenshot({ path: `${OUT}/ui-${T('settings-touch-ask')}.png` });
    await page.tap('#ui .modal-box.ask [data-r="yes"]');
    await page.waitForTimeout(150);
    ly = await page.evaluate(() => ({ resets: __G.__reset || 0, fixed: __G.input.layout.get().fixedStick }));
    check(T('settings-touch') + ': confirming calls layout.reset()', ly.resets === 1 && ly.fixed === false, JSON.stringify(ly));
    await page.evaluate(() => { document.querySelector('#ui .modal.on .modal-box').scrollTop = 400; });
    await page.tap('#ui [data-r="lyEdit"]');
    const ed = await page.evaluate(() => ({ edits: __G.__edit || 0, open: !!document.querySelector('#ui .modal.on') }));
    check(T('settings-touch') + ': "Sửa bố cục nút" calls layout.edit() and closes settings', ed.edits === 1 && !ed.open, JSON.stringify(ed));
    await ctx.close();
  }
  // ----- portrait: prompt on a phone, none on a wide tablet, a desktop or a landscape phone
  for (const [name, vp, touch, want] of [['phone-portrait-390', { width: 390, height: 844 }, true, true], ['phone-portrait-hud', { width: 390, height: 844 }, true, true], ['tablet-portrait', { width: 820, height: 1180 }, true, false], ['desktop-narrow', { width: 600, height: 900 }, false, false], ['landscape-740', { width: 740, height: 360 }, true, false]]) {
    const { ctx, page, errs } = await open(browser, name, vp, touch, name === 'phone-portrait-hud' ? 'screen=hud&mech=ung' : 'screen=menu');
    await shot(page, errs, name, async () => {
      const v = await page.evaluate(() => { const r = document.querySelector('#ui .rotate'), b = r.getBoundingClientRect(), c = getComputedStyle(r); return { shown: c.display !== 'none', full: Math.round(b.width) === innerWidth && Math.round(b.height) === innerHeight, text: r.querySelector('b').textContent, svg: !!r.querySelector('svg'), touchHidden: !document.getElementById('touch') || getComputedStyle(document.getElementById('touch')).display === 'none' }; });
      check(`${name}: rotate prompt ${want ? 'shown full screen with glyph and "Xoay ngang màn hình"' : 'not shown'}`, v.shown === want && (!want || (v.full && v.svg && v.text === 'Xoay ngang màn hình' && v.touchHidden)), JSON.stringify(v));
    }, 300, true);
    await ctx.close();
  }
  // ----- menu, garage, shop, lobby, result at three phone sizes
  for (const [w, h] of SZ) {
    const T = (s) => `${sizeTag(w)}-${s}`;
    let { ctx, page, errs } = await open(browser, T('menu'), { width: w, height: h }, true, 'screen=menu&fresh=1&own=all&coins=900&trophies=300');
    await shot(page, errs, T('menu'), async () => {
      await phoneAudit(page, T('menu'));
      const r = await page.evaluate(() => { const o = (q) => { const n = document.querySelector(q); return n && n.scrollHeight > n.clientHeight + 1 ? getComputedStyle(n).overscrollBehaviorY : 'fits'; }; return { roster: o('#ui .roster'), cards: o('#ui .cards'), detail: o('#ui .detail'), play: document.querySelector('#ui .play').getBoundingClientRect(), w: innerWidth, h: innerHeight }; });
      check(T('menu') + ': scroll areas contain overscroll, play button in the lower right', r.roster !== 'auto' && r.cards !== 'auto' && r.detail !== 'auto' && r.play.right > r.w * 0.6 && r.play.bottom > r.h * 0.5 && r.play.bottom <= r.h, JSON.stringify(r));
    }, 300);
    // the stage's skill tip and a previewed form, then every info tab
    // the form first: moving the (emulated) mouse off a skill icon closes its tip, as hover does
    await page.click('#ui .fmb[data-form="3"]');
    await page.click('#ui .sgk[data-sk="2"]');
    await shot(page, errs, T('select-tip'), async () => {
      await phoneAudit(page, T('select-tip'));
      const r = await page.evaluate(() => ({ tip: !document.querySelector('#ui [data-r="sgTip"]').hidden, pv: document.querySelector('#ui [data-r="sgPv"]').textContent }));
      check(T('select') + ': a tapped skill shows its tip, a tapped form is previewed', r.tip && r.pv === 'Xem trước hình thái III', JSON.stringify(r));
    }, 250);
    for (const [tag, tab] of [['stats', 'info'], ['up', 'up']]) {
      await page.click(`#ui .tabs [data-tab="${tab}"]`);
      await shot(page, errs, T('garage-' + tag), () => phoneAudit(page, T('garage-' + tag)), 250);
    }
    await page.click('#ui .sg-skin');
    await shot(page, errs, T('skins'), async () => {
      await phoneAudit(page, T('skins'));
      const r = await page.evaluate(() => { const c = [...document.querySelectorAll('#ui .skc')].map((n) => n.getBoundingClientRect()); return { n: c.length, inView: c.every((b) => b.top >= 0 && b.bottom <= innerHeight + 1), h: Math.round(Math.min(...c.map((b) => b.height))) }; });
      check(T('skins') + ': the Skin panel shows the 3 skin cards inside the screen, each card at least 120 px tall', r.n === 3 && r.inView && r.h >= 120, JSON.stringify(r));
    }, 300);
    await page.click('#ui .skins [data-r="back"]');
    for (const k of ['map', 'theme']) {
      await page.click(`#ui .menu .su-tabs [data-su="${k}"]`);
      await shot(page, errs, T('menu-' + k), () => phoneAudit(page, T('menu-' + k)), 200);
    }
    await page.click('#ui [data-r="bHelp"]');
    await shot(page, errs, T('help'), () => phoneAudit(page, T('help')), 250);
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => { document.querySelectorAll('#ui .modal.on').forEach((m) => m.classList.remove('on')); });
    await page.click('#ui [data-r="shopBtn"]');
    await shot(page, errs, T('shop'), async () => {
      await phoneAudit(page, T('shop'));
      const r = await page.evaluate(() => { const b = document.querySelector('#ui .sh-body'); return { scroll: b.scrollHeight > b.clientHeight, ob: getComputedStyle(b).overscrollBehaviorY, title: document.querySelector('#ui .sh-head h2').textContent }; });
      check(T('shop') + ': "Cửa hàng", body scrolls and contains overscroll', r.title === 'Cửa hàng' && r.ob === 'contain', JSON.stringify(r));
    }, 300);
    await ctx.close();
    for (const role of ['host', 'guest']) {
      ({ ctx, page, errs } = await open(browser, T('lobby-' + role), { width: w, height: h }, true, `screen=lobby&role=${role}&fill=${role === 'host' ? 4 : 6}&fresh=1&map=xuongcat`));
      await shot(page, errs, T('lobby-' + role), () => phoneAudit(page, T('lobby-' + role)), 300);
      await ctx.close();
    }
    ({ ctx, page, errs } = await open(browser, T('online'), { width: w, height: h }, true, 'screen=online&fresh=1'));
    await shot(page, errs, T('online'), () => phoneAudit(page, T('online')), 300);
    await ctx.close();
    for (const [tag, q] of [['win', 'fresh=1&levelup=1&trophies=90&mech=soi'], ['lose', 'fresh=1&lose=1&trophies=5&mech=soi'], ['nha', 'fresh=1&mode=nha&trophies=300&warp=100&mech=soi']]) {
      ({ ctx, page, errs } = await open(browser, T('result-' + tag), { width: w, height: h }, true, `screen=result&${q}`));
      await shot(page, errs, T('result-' + tag), () => phoneAudit(page, T('result-' + tag)), 1800);
      await ctx.close();
    }
  }
  // ----- tablet
  {
    const T = (s) => 'tablet-' + s;
    let { ctx, page, errs } = await open(browser, T('hud'), { width: 1180, height: 820 }, true, 'screen=hud&mode=nha&mech=ung');
    await shot(page, errs, T('hud'), () => phoneAudit(page, T('hud'), { zones: true }), 500);
    await ctx.close();
    ({ ctx, page, errs } = await open(browser, T('menu'), { width: 1180, height: 820 }, true, 'screen=menu&fresh=1'));
    await shot(page, errs, T('menu'), () => phoneAudit(page, T('menu')), 300);
    await ctx.close();
  }
}
const MODE_ORDER_LOCAL = ['tdm', 'nha', 'chiem', 'tudo', 'trum'];
let MECH_ORDER = [], MECHS = {};

(async () => {
  const { MODE_ORDER, MODES } = await import('../js/data.js');
  ({ MECH_ORDER, MECHS } = await import('../js/data.js'));
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  base = srv.base;
  await require('./lib.js').lockChrome();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=' + (process.env.DTT_GL || 'swiftshader'), '--enable-unsafe-swiftshader'] });
  try {
    if (process.env.UI_ONLY === 'phone') { await phoneSuite(browser); } else {
    const sizes = [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 780, height: 360 }, true]];
    for (const [ctxName, vp, touch] of sizes) {
      const T = (s) => `${ctxName}-${s}`;
      // ----- menu (tank select): every mech of MECH_ORDER as a hex, locked mech, buy flow
      const NM = MECH_ORDER.length;
      let { ctx, page, errs } = await open(browser, T('menu'), vp, touch, 'screen=menu&fresh=1&trophies=300');
      await shot(page, errs, T('menu'), async () => {
        const r = await page.evaluate(() => {
          const panel = document.querySelector('#ui .cards'), pb = panel.getBoundingClientRect();
          const cs = [...document.querySelectorAll('#ui .mc')], first = [...document.querySelectorAll('#ui .pg')][0];
          return {
            title: document.querySelector('#ui .menu h1').textContent,
            cards: cs.map((c) => (c.querySelector('img').src || '').slice(0, 10)),
            page1: [...first.querySelectorAll('.mc')].every((c) => { const b = c.getBoundingClientRect(); return b.top >= pb.top - 1 && b.bottom <= pb.bottom + 1 && b.left >= pb.left - 1 && b.right <= pb.right + 1; }),
            pages: document.querySelectorAll('#ui .pg').length, perPage: first.querySelectorAll('.mc').length, dots: document.querySelectorAll('#ui .pg-d').length + document.querySelectorAll('#ui .pg-n').length,
            scrolls: panel.scrollHeight > panel.clientHeight + 1,
            diff: document.querySelectorAll('#ui .seg[data-r="diff"] button').length, size: document.querySelectorAll('#ui .seg[data-r="size"] button').length, map: document.querySelectorAll('#ui .map').length,
            name: document.querySelector('#ui .pl-name').value, play: document.querySelector('#ui .play').textContent.trim(),
            lock: document.querySelectorAll('#ui .mc.locked').length, lockPrice: [...document.querySelectorAll('#ui .mc.locked .mc-lock b')].every((b) => /^[0-9]/.test(b.textContent)),
            roleSvg: document.querySelectorAll('#ui .mc-role svg').length, selTag: [...document.querySelectorAll('#ui .mc .mc-on')].map((n) => n.closest('.mc').dataset.mech + ':' + n.textContent).join(),
            tab: document.querySelector('#ui .tabs .on').textContent, tabs: [...document.querySelectorAll('#ui .tabs button')].map((b) => b.textContent).join(),
            ban: document.querySelector('#ui [data-r="sgName"]').textContent, lv: document.querySelector('#ui [data-r="sgLv"]').textContent, sk: document.querySelectorAll('#ui .sgk').length,
            foot: document.querySelector('#ui .sg-have') && document.querySelector('#ui .sg-have').textContent, up: (document.querySelector('#ui .sg-up') || {}).textContent,
            radar: document.querySelectorAll('#ui .radar .rd-l').length, poly: (document.querySelector('#ui .rd-v') || { getAttribute: () => '' }).getAttribute('points').split(' ').length,
            rows: [...document.querySelectorAll('#ui .ds-r > span')].map((n) => n.textContent).join(), stars: document.querySelectorAll('#ui .stars i').length, starOn: document.querySelectorAll('#ui .stars i.on').length,
            forms: [...document.querySelectorAll('#ui .fmb')].map((b) => b.textContent.trim()), chip: document.querySelector('#ui [data-r="matchTxt"]').textContent,
            setupShown: getComputedStyle(document.querySelector('#ui .menu .setup')).display,
          };
        });
        check(T('menu') + ': title, one hex with a portrait and a role icon per mech of MECH_ORDER, "Đang chọn" on the selected one', r.title === 'Đấu Trường Thép' && r.cards.length === NM && r.cards.every((x) => x === 'data:image') && r.roleSvg === NM && r.selTag === 'trau:Đang chọn', JSON.stringify(r));
        check(T('menu') + ': difficulty (3), team size (3 buttons), map, player name, play button filled', r.diff === 3 && r.size === 3 && r.map === 5 && r.name && r.play === 'Vào trận', JSON.stringify(r));
        check(T('menu') + ': every mech not owned on a fresh save (all but the 4 free ones) shows lock and price', r.lock === NM - 4 && r.lockPrice, JSON.stringify(r));
        check(T('menu') + ': the roster is paged: whole first page inside the list, pages = ceil(mechs / per page) with one dot each, the list scrolls (last page checked below)', r.page1 && r.perPage >= 6 && r.perPage % 3 === 0 && r.pages === Math.ceil(NM / r.perPage) && r.pages > 1 && r.dots === (r.pages > 6 ? 1 : r.pages) && r.scrolls, JSON.stringify(r));
        check(T('menu') + ': stage banner LV.0 + name, 3 skill icons, "Lv Tank đã có: LV.0" and "Tăng LV Tank"', r.ban === 'Trâu Sắt' && r.lv === 'LV.0' && r.sk === 3 && r.foot === 'Lv Tank đã có: LV.0' && r.up === 'Tăng LV Tank', JSON.stringify(r));
        check(T('menu') + ': info column opens on Mô tả (tabs Mô tả / Chi tiết / Nâng cấp): Vị trí, Độ khó (3 stars, Trâu Sắt 1), six-axis radar, forms I / II / III with Tổng cấp 12 and 18', r.tab === 'Mô tả' && r.tabs === 'Mô tả,Chi tiết,Nâng cấp' && r.rows === 'Vị trí,Độ khó' && r.stars === 3 && r.starOn === 1 && r.radar === 6 && r.poly === 6 && r.forms.join('|') === 'IGốc|IITổng cấp 12|IIITổng cấp 18', JSON.stringify(r));
        check(T('menu') + ': the setup chip names mode and arena, the setup sheet starts closed', r.chip === 'Đấu đội · Đền Rừng' && r.setupShown === 'none', JSON.stringify(r));
        const rk = await page.evaluate(() => ({ name: document.querySelector('#ui [data-r="rkName"]').textContent, tr: document.querySelector('#ui [data-r="rkTr"]').textContent, next: document.querySelector('#ui [data-r="rkNext"]').textContent, fill: document.querySelector('#ui [data-r="rkFill"]').style.transform }));
        check(T('menu') + ': rank badge shows Bạc, 300 cúp, 150 to Vàng, bar 25%', rk.name === 'Bạc' && rk.tr === '300' && /150 cúp nữa lên Vàng/.test(rk.next) && rk.fill === 'scaleX(0.25)', JSON.stringify(rk));
      });
      {
        // the down arrow pages to the end; the last hex is then inside the list, the dot of the last page lit
        for (let i = 0; i < 12; i++) { if (await page.evaluate(() => document.querySelector('#ui [data-r="pgNext"]').disabled)) break; await page.click('#ui [data-r="pgNext"]'); await page.waitForTimeout(450); }
        const last = await page.evaluate(() => { const p = document.querySelector('#ui .cards').getBoundingClientRect(), b = [...document.querySelectorAll('#ui .mc')].pop().getBoundingClientRect(), d = [...document.querySelectorAll('#ui .pg-d')]; return { ok: b.bottom <= p.bottom + 1 && b.top >= p.top - 1, dot: d.length ? d.findIndex((x) => x.classList.contains('on')) === d.length - 1 : true, prev: !document.querySelector('#ui [data-r="pgPrev"]').disabled }; });
        check(T('menu') + ': last hex reachable with the page arrow, last dot lit, the up arrow enabled', last.ok && last.dot && last.prev, JSON.stringify(last));
        await page.screenshot({ path: `${OUT}/ui-${T('menu-scrolled')}.png` });
        await page.evaluate(() => { document.querySelector('#ui .cards').scrollTop = 0; });
        // role tabs: Tank keeps only the tank group, Tất cả brings every mech back
        await page.click('#ui .rl-tabs [data-role="tank"]');
        const tk = await page.evaluate(() => [...document.querySelectorAll('#ui .mc')].map((c) => c.dataset.mech));
        const wantTank = MECH_ORDER.filter((k) => ['tank', 'guardian', 'bruiser', 'hooker'].includes(MECHS[k].roleKey));
        check(T('menu') + ': role tab Tank lists only Trụ, Hộ vệ, Đấu sĩ and Bắt giữ mechs, in MECH_ORDER', tk.join() === wantTank.join(), tk.join());
        await page.click('#ui .rl-tabs [data-role="sup"]');
        const sp = await page.evaluate(() => [...document.querySelectorAll('#ui .mc')].map((c) => c.dataset.mech));
        check(T('menu') + ': role tab Hỗ trợ lists Bạch Hạc and the other support mechs', sp.includes('hac') && sp.includes('domdom') && !sp.includes('trau'), sp.join());
        await page.click('#ui .rl-tabs [data-role="all"]');
        check(T('menu') + ': Tất cả lists every mech again', (await page.evaluate(() => document.querySelectorAll('#ui .mc').length)) === NM);
        // skills: hover shows the tip; the setup chip opens and closes the sheet over the info column
        if (!touch) {
          await page.hover('#ui .sgk[data-sk="1"]');
          const tip = await page.evaluate(() => ({ on: !document.querySelector('#ui [data-r="sgTip"]').hidden, t: document.querySelector('#ui [data-r="sgTip"] b').textContent }));
          check(T('menu') + ': hovering a skill icon shows its name and cooldown', tip.on && /^Húc Thép/.test(tip.t) && /Hồi 12,0 giây/.test(tip.t), JSON.stringify(tip));
          await page.mouse.move(5, 5);
        }
        await page.click('#ui [data-r="matchBtn"]');
        const sh = await page.evaluate(() => ({ s: getComputedStyle(document.querySelector('#ui .menu .setup')).display, d: getComputedStyle(document.querySelector('#ui .menu .detail')).visibility, ex: document.querySelector('#ui [data-r="matchBtn"]').getAttribute('aria-expanded') }));
        check(T('menu') + ': the setup chip opens the sheet over the info column', sh.s === 'flex' && sh.d === 'hidden' && sh.ex === 'true', JSON.stringify(sh));
        await shot(page, errs, T('menu-setup'), null, 250);
        await page.click('#ui [data-r="matchBtn"]');
        check(T('menu') + ': a second tap closes it', (await page.evaluate(() => getComputedStyle(document.querySelector('#ui .menu .setup')).display)) === 'none');
        await page.click('#ui .tabs [data-tab="info"]');
        const inf = await page.evaluate(() => ({ skills: document.querySelectorAll('#ui .detail .sk').length, bars: document.querySelectorAll('#ui .detail .st .bar i').length, desc: document.querySelector('#ui .sk-tx p').textContent.length }));
        check(T('menu') + ': Chi tiết: 4 skill rows with text, 8 stat bars', inf.skills === 4 && inf.bars === 8 && inf.desc > 10, JSON.stringify(inf));
        await page.click('#ui .tabs [data-tab="desc"]');
      }
      // locked mech: play button becomes a buy button, never starts a match
      await page.click('#ui .mc[data-mech="loi"]');
      await page.waitForTimeout(150);
      let st = await page.evaluate(() => ({ play: document.querySelector('#ui .play').textContent.trim(), buy: !!document.querySelector('#ui .stage .buy'), tabs: [...document.querySelectorAll('#ui .tabs button')].map((b) => b.dataset.tab).join(), lv: document.querySelector('#ui [data-r="sgLv"]').textContent, up: document.querySelectorAll('#ui .sg-up').length }));
      check(T('menu') + ': locked mech: play says "Mua Lôi Công", buy offered on the stage, only Mô tả and Chi tiết, no Tăng LV Tank', st.play === 'Mua Lôi Công' && st.buy && st.tabs === 'desc,info' && st.lv === 'LV.0' && st.up === 0, JSON.stringify(st));
      await page.click('#ui .play');
      st = await page.evaluate(() => ({ plays: (window.__log || []).filter((l) => l[0] === 'ui:play').length, toast: document.querySelector('#ui .toast').textContent, coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on') }));
      check(T('menu') + ': locked play with 0 coins: no match, "Chưa đủ xu"', st.plays === 0 && st.toast === 'Chưa đủ xu' && st.coins === 0 && !st.modal, JSON.stringify(st));
      await page.click('#ui .buy');
      st = await page.evaluate(() => ({ toast: document.querySelector('#ui .toast').textContent, owned: __G.meta.get().owned.includes('loi') }));
      check(T('menu') + ': buy button with 0 coins refused', st.toast === 'Chưa đủ xu' && !st.owned, JSON.stringify(st));
      await shot(page, errs, T('menu-locked'), null, 300);
      await page.evaluate(() => { __G.meta.get().coins = 2000; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]');
      await page.click('#ui .buy');
      await shot(page, errs, T('menu-confirm'), async () => {
        const c = await page.evaluate(() => ({ on: document.querySelector('#ui .modal.on h2').textContent, owned: __G.meta.get().owned.includes('loi'), coins: __G.meta.get().coins }));
        check(T('menu') + ': buy asks for confirmation first, nothing charged yet', /Mở khóa Lôi Công/.test(c.on) && !c.owned && c.coins === 2000, JSON.stringify(c));
      }, 250);
      await page.click('#ui .modal.on [data-r="no"]');
      st = await page.evaluate(() => ({ owned: __G.meta.get().owned.includes('loi'), coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on') }));
      check(T('menu') + ': cancel keeps coins and mech locked', !st.owned && st.coins === 2000 && !st.modal, JSON.stringify(st));
      await page.click('#ui .buy');
      await page.click('#ui .modal.on [data-r="yes"]');
      st = await page.evaluate(() => ({ owned: __G.meta.get().owned.includes('loi'), coins: __G.meta.get().coins, play: document.querySelector('#ui .play').textContent.trim(), sel: document.querySelector('#ui .mc.sel').dataset.mech, coinTxt: document.querySelector('#ui [data-r="coins"]').textContent }));
      check(T('menu') + ': confirmed buy charges 900, selects the mech, play enabled', st.owned && st.coins === 1100 && st.play === 'Vào trận' && st.sel === 'loi' && st.coinTxt === '1.100', JSON.stringify(st));

      // ----- garage: stat bars, five upgrade tracks, cosmetics
      await page.click('#ui .tabs [data-tab="info"]');
      await shot(page, errs, T('garage-stats'), async () => {
        const g = await page.evaluate(() => ({ bars: document.querySelectorAll('#ui .detail .st .bar i').length, labels: [...document.querySelectorAll('#ui .detail .st > span')].map((n) => n.textContent).join(), ticks: document.querySelectorAll('#ui .detail .bar u').length,
          passive: (document.querySelector('#ui .detail .passive h4') || {}).textContent, kit: document.querySelectorAll('#ui .detail .sk').length, perks: document.querySelectorAll('#ui .detail .pk').length, perkOn: document.querySelectorAll('#ui .detail .pk.on').length,
          perkNeed: [...document.querySelectorAll('#ui .detail .pk small')].map((n) => n.textContent).join(' | '), tabs: document.querySelectorAll('#ui .tabs button').length }));
        check(T('garage') + ': 8 stat bars with the right labels, no base ticks at level 0, passive, 4 kit rows, 3 locked perks asking 6 / 12 / 18', g.bars === 8 && g.labels === 'Máu,Giáp,Tốc độ,Gia tốc,Xoay tháp,Tốc bắn,Tầm bắn,Phá trụ' && g.ticks === 0 && /Nội tại/.test(g.passive) && g.kit === 4 && g.perks === 3 && g.perkOn === 0 && /6/.test(g.perkNeed.split('|')[0]) && /12/.test(g.perkNeed.split('|')[1]) && /18/.test(g.perkNeed.split('|')[2]) && g.tabs === 3, JSON.stringify(g));
      }, 300);
      await page.click('#ui .tabs [data-tab="desc"]');
      await page.click('#ui .sg-up');
      check(T('garage') + ': "Tăng LV Tank" on the stage opens Nâng cấp', (await page.evaluate(() => document.querySelector('#ui .tabs .on').dataset.tab)) === 'up');
      await shot(page, errs, T('garage-up'), async () => {
        const g = await page.evaluate(() => ({ rows: document.querySelectorAll('#ui .tr').length, pips: document.querySelectorAll('#ui .pip').length, on: document.querySelectorAll('#ui .pip.on').length, coin: [...document.querySelectorAll('#ui [data-up][data-pay="coins"]')].map((b) => b.textContent.trim()), gem: [...document.querySelectorAll('#ui [data-up][data-pay="gems"]')].length,
          diff: [...document.querySelectorAll('#ui .tr-d')].map((n) => n.textContent) }));
        check(T('garage') + ': 5 track rows, 25 pips (0 lit), every coin button asks 120, every row has a gem button', g.rows === 5 && g.pips === 25 && g.on === 0 && g.coin.length === 5 && g.coin.every((t) => /120/.test(t)) && g.gem === 5, JSON.stringify(g));
        check(T('garage') + ': each row shows before → after numbers (hp, speed, damage, fire rate, cooldown)', /^Máu [\d.]+ → [\d.]+, Giáp [\d,]+% → [\d,]+%$/.test(g.diff[0]) && /^Tốc độ [\d,]+ → [\d,]+, Gia tốc [\d,]+ → [\d,]+$/.test(g.diff[1]) && /^Sát thương \d+ → \d+$/.test(g.diff[2]) && /^Tốc bắn [\d,]+ → [\d,]+\/s, Tầm bắn [\d,]+ → [\d,]+ m$/.test(g.diff[3]) && /^Hồi chiêu .+ → .+ giây$/.test(g.diff[4]), JSON.stringify(g.diff));
      }, 300);
      await page.evaluate(() => { __G.meta.get().gems = 50; });
      await page.click('#ui [data-up="0"][data-pay="coins"]');
      st = await page.evaluate(() => ({ lv: __G.meta.lvOf('loi'), coins: __G.meta.get().coins, on: document.querySelectorAll('#ui .pip.on').length, badge: document.querySelector('#ui .mc[data-mech="loi"] .mc-lv').textContent, ban: document.querySelector('#ui [data-r="sgLv"]').textContent, next: document.querySelector('#ui [data-up="0"][data-pay="coins"]').textContent.trim() }));
      check(T('garage') + ': a coin upgrade charges 120, lights one pip, hex badge and stage banner LV.1, next level costs 210', st.lv.join() === '1,0,0,0,0' && st.coins === 980 && st.on === 1 && st.badge === 'LV.1' && st.ban === 'LV.1' && /210/.test(st.next), JSON.stringify(st));
      await page.click('#ui [data-up="1"][data-pay="gems"]');
      st = await page.evaluate(() => ({ lv: __G.meta.lvOf('loi'), coins: __G.meta.get().coins, gems: __G.meta.get().gems }));
      check(T('garage') + ': a gem upgrade charges ceil(120 / 10) = 12 gems and no coins', st.lv.join() === '1,1,0,0,0' && st.coins === 980 && st.gems === 38, JSON.stringify(st));
      await page.evaluate(() => { __G.meta.get().lv.loi = [1, 1, 1, 1, 1]; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]'); await page.click('#ui .tabs [data-tab="up"]');
      st = await page.evaluate(() => ({ unlock: [...document.querySelectorAll('#ui .unlock')].map((n) => n.textContent.trim()), tot: document.querySelector('#ui .up-sum b').textContent }));
      check(T('garage') + ': at total 5 every upgrade names the perk it unlocks', st.unlock.length === 5 && st.unlock.every((t) => /Mở mốc/.test(t)) && /5 \/ 25/.test(st.tot), JSON.stringify(st));
      await page.evaluate(() => { const d = __G.meta.get(); d.coins = 100; d.gems = 5; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]'); await page.click('#ui .tabs [data-tab="up"]');
      st = await page.evaluate(() => ({ dis: [...document.querySelectorAll('#ui [data-up]')].every((b) => b.disabled), reasons: [...document.querySelectorAll('#ui [data-up] small')].map((n) => n.textContent) }));
      check(T('garage') + ': with 100 coins and 5 gems every upgrade is disabled and says what is short', st.dis && st.reasons.length === 10 && st.reasons.every((t) => /^Thiếu \d+ (xu|Tinh Thể)$/.test(t)), JSON.stringify(st));
      await page.evaluate(() => { const d = __G.meta.get(); d.coins = 100000; d.lv.loi = [5, 5, 5, 5, 5]; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]'); await page.click('#ui .tabs [data-tab="up"]');
      st = await page.evaluate(() => ({ dis: [...document.querySelectorAll('#ui [data-up]')].every((b) => b.disabled), txt: [...document.querySelectorAll('#ui [data-up]')].map((b) => b.textContent.trim()), on: document.querySelectorAll('#ui .pip.on').length, again: __G.meta.upgrade('loi', 0), gemAgain: __G.meta.upgrade('loi', 3, 'gems') }));
      check(T('garage') + ': at 5 / 5 everywhere the buttons say "Đã tối đa", 25 pips lit, upgrade() refuses with either currency', st.dis && st.txt.every((t) => t === 'Đã tối đa') && st.on === 25 && st.again === false && st.gemAgain === false, JSON.stringify(st));
      st = await page.evaluate(() => ({ f3: document.querySelector('#ui .mc[data-mech="loi"]').classList.contains('f3'), others: document.querySelectorAll('#ui .mc.f3').length, stage: document.querySelector('#ui .stage').classList.contains('f3') }));
      check(T('garage') + ': total 25 reaches form III: the hex gets the orange frame (only that one), the stage shows form III', st.f3 && st.others === 1 && st.stage, JSON.stringify(st));
      await page.click('#ui .tabs [data-tab="desc"]');
      await page.click('#ui .fmb[data-form="1"]');
      st = await page.evaluate(() => ({ pv: document.querySelector('#ui [data-r="sgPv"]').textContent, shown: !document.querySelector('#ui [data-r="sgPv"]').hidden, on: document.querySelector('#ui .fmb.on').dataset.form, cur: document.querySelector('#ui .fmb.cur').dataset.form, f3: document.querySelector('#ui .stage').classList.contains('f3') }));
      check(T('garage') + ': tapping form I previews it on the stage, the owned form III stays marked as current', st.shown && st.pv === 'Xem trước hình thái I' && st.on === '1' && st.cur === '3' && !st.f3, JSON.stringify(st));
      await page.click('#ui .fmb[data-form="3"]');
      check(T('garage') + ': tapping the current form ends the preview', (await page.evaluate(() => document.querySelector('#ui [data-r="sgPv"]').hidden)) === true);
      await page.click('#ui .tabs [data-tab="info"]');
      await shot(page, errs, T('garage-max'), null, 300);
      await page.click('#ui .tabs [data-tab="info"]');
      st = await page.evaluate(() => ({ perkOn: document.querySelectorAll('#ui .detail .pk.on').length, ticks: document.querySelectorAll('#ui .detail .bar u').length, up: document.querySelectorAll('#ui .detail .st b.up').length }));
      check(T('garage') + ': at 25 levels all 3 perks read unlocked and the bars mark the base value', st.perkOn === 3 && st.ticks >= 4 && st.up >= 4, JSON.stringify(st));
      // skins: the Skin panel (big model cards graded A / S / SS), buy with confirm, use, the portrait follows
      await page.evaluate(() => { const d = __G.meta.get(); d.coins = 5000; d.gems = 0; d.lv.loi = [1, 0, 2, 0, 0]; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]'); await page.click('#ui .sg-skin');
      await shot(page, errs, T('skins'), async () => {
        const g = await page.evaluate(() => ({ on: document.querySelector('#ui .skins').classList.contains('on'), cards: [...document.querySelectorAll('#ui .skc')].map((c) => c.dataset.skin + ':' + c.querySelector('.skc-g .sk-g').textContent).join(),
          eq: [...document.querySelectorAll('#ui .skc.eq')].map((c) => c.dataset.skin).join(), names: [...document.querySelectorAll('#ui .skc-n')].map((n) => n.textContent).join('|'), tabs: [...document.querySelectorAll('#ui .sk-tabs button')].map((b) => b.textContent).join(),
          big: window.__portraitCalls.some((c) => c[0] === 'loi' && c[2] === 'ss' && c[3] === 3 && c[4] >= 240), title: document.querySelector('#ui .sk-head h2').textContent, side: document.querySelectorAll('#ui .sk-col').length, oldTab: !!document.querySelector('#ui .tabs [data-tab="cos"]') }));
        check(T('skins') + ': the Skin panel opens from the stage with 3 cards goc:A, s:S, ss:SS (Nguyên Bản in use), grade tabs, big form III portraits, a collection column, no Trang trí tab', g.on && g.cards === 'goc:A,s:S,ss:SS' && g.eq === 'goc' && g.names === 'Nguyên Bản|Lôi Công Hắc Kim|Lôi Thần Tử Điện' && g.tabs === 'Tất cả,Cấp A,Cấp S,Cấp SS' && g.big && /Lôi Công/.test(g.title) && g.side === 3 && !g.oldTab, JSON.stringify(g));
      }, 300);
      await page.click('#ui .skc[data-skin="s"] [data-buy]');
      st = await page.evaluate(() => ({ lead: document.querySelector('#ui .modal.on .lead').textContent, coins: __G.meta.get().coins }));
      check(T('skins') + ': buying an S skin asks first (800 xu), nothing charged yet', /800 xu/.test(st.lead) && st.coins === 5000, JSON.stringify(st));
      await page.click('#ui .modal.on [data-r="yes"]');
      await page.waitForTimeout(100);
      st = await page.evaluate(() => ({ coins: __G.meta.get().coins, owned: __G.meta.get().ownedSkins.join(), eq: __G.meta.get().skins.loi, eqEl: document.querySelector('#ui .skc.eq').dataset.skin, using: document.querySelector('#ui .skc.eq .skc-on').textContent, called: window.__portraitCalls.some((c) => c[0] === 'loi' && c[1] === 0 && c[2] === 's' && c[3] === 1) }));
      check(T('skins') + ': the S skin costs 800, is owned, used at once (card reads "Đang dùng"), the stage portrait is asked with skin "s"', st.coins === 4200 && st.owned === 'loi:s' && st.eq === 's' && st.eqEl === 's' && /Đang dùng/.test(st.using) && st.called, JSON.stringify(st));
      await page.click('#ui .sk-tabs [data-g="SS"]');
      st = await page.evaluate(() => [...document.querySelectorAll('#ui .skc')].map((c) => c.dataset.skin).join());
      check(T('skins') + ': the SS tab shows only the SS card', st === 'ss', st);
      await page.click('#ui .sk-tabs [data-g="all"]');
      await page.click('#ui .skc[data-skin="goc"] [data-use]');
      st = await page.evaluate(() => ({ eq: __G.meta.get().skins.loi || null, coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on'), eqEl: document.querySelector('#ui .skc.eq').dataset.skin }));
      check(T('skins') + ': "Dùng" on the base skin is free, no confirm, clears the choice', st.eq === null && st.coins === 4200 && !st.modal && st.eqEl === 'goc', JSON.stringify(st));
      await page.click('#ui .skc[data-skin="s"] [data-use]');
      st = await page.evaluate(() => ({ eq: __G.meta.get().skins.loi, coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on') }));
      check(T('skins') + ': "Dùng" on an owned S skin is free, no confirm', st.eq === 's' && st.coins === 4200 && !st.modal, JSON.stringify(st));
      await page.click('#ui .skins [data-r="back"]');
      await page.evaluate(() => { const d = __G.meta.get(); d.coins = 100; d.gems = 0; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]'); await page.click('#ui .sg-skin');
      await page.click('#ui .skc[data-skin="ss"] [data-buy]');
      st = await page.evaluate(() => ({ toast: document.querySelector('#ui .toast').textContent, ss: __G.meta.get().ownedSkins.includes('loi:ss'), coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on') }));
      check(T('skins') + ': 100 coins and no gems cannot buy a 2000 SS skin ("Chưa đủ xu")', st.toast === 'Chưa đủ xu' && !st.ss && st.coins === 100 && !st.modal, JSON.stringify(st));
      await page.evaluate(() => { __G.meta.get().gems = 300; });
      await page.click('#ui .skc[data-skin="ss"] [data-buy]');
      st = await page.evaluate(() => ({ modal: document.querySelector('#ui .modal.on .lead').textContent }));
      check(T('skins') + ': with enough gems the confirm offers the gem price (200 Tinh Thể)', /200 Tinh Thể/.test(st.modal), JSON.stringify(st));
      await page.click('#ui .modal.on [data-r="yes"]');
      st = await page.evaluate(() => ({ gems: __G.meta.get().gems, coins: __G.meta.get().coins, eq: __G.meta.get().skins.loi }));
      check(T('skins') + ': paying in gems takes 200 gems and no coins, the SS skin is used', st.gems === 100 && st.coins === 100 && st.eq === 'ss', JSON.stringify(st));
      await page.click('#ui .skins [data-r="back"]');
      st = await page.evaluate(() => ({ skins: document.querySelector('#ui .skins').classList.contains('on'), menu: document.querySelector('#ui .menu').classList.contains('on') }));
      check(T('skins') + ': Quay lại closes the panel back to the tank select', !st.skins && st.menu, JSON.stringify(st));
      await page.evaluate(() => { const d = __G.meta.get(); d.coins = 700; d.gems = 0; d.lv.loi = [1, 0, 2, 0, 0]; d.skins.loi = 's'; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]');
      // settings
      await page.click('#ui [data-r="bSet"]');
      await page.click('#ui .modal.on .seg button:nth-child(3)');
      await page.evaluate(() => { const r = document.querySelector('#ui .modal.on input[type=range]:not([data-r="bri"])'); r.value = 35; r.dispatchEvent(new Event('input')); });
      await shot(page, errs, T('menu-settings'), async () => {
        const s = await page.evaluate(() => ({ vol: window.__vol, q: __G.meta.get().settings.quality, log: (window.__log || []).filter((l) => l[0] === 'quality:set').map((l) => l[1]) }));
        check(T('settings') + ': volume and quality wired', s.vol === 0.35 && s.q === 'high' && s.log.includes('high'), JSON.stringify(s));
      }, 300);
      await page.click('#ui .modal.on [data-r="close"]');
      await page.click('#ui [data-r="bHelp"]');
      await shot(page, errs, T('menu-help'), async () => {
        const t = await page.evaluate(() => document.querySelector('#ui .modal.on').textContent);
        check(T('help') + ': mentions WASD and touch sticks', /W.*A.*S.*D/.test(t) && /Cần trái/.test(t) && /Cần phải/.test(t));
      }, 300);
      await page.click('#ui .modal.on [data-r="close"]');
      await page.click('#ui .seg button:nth-child(3)');
      await page.click('#ui .play');
      const play = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('menu') + ': play emits { mech, diff, map, mods: { lv }, skin } from the garage', play.length === 1 && play[0].mech === 'loi' && play[0].diff === 'hard' && play[0].map === 'denrung' && play[0].mods.lv.join() === '1,0,2,0,0' && play[0].skin === 's' && !('paint' in play[0]), JSON.stringify(play));
      await page.waitForTimeout(600);
      await shot(page, errs, T('hud-live'), async () => {
        const live = await page.evaluate(() => ({ hud: document.querySelector('#ui .hud').classList.contains('on'), menu: document.querySelector('#ui .menu').classList.contains('on'), mine: window.__portraitCalls.filter((c) => c[0] === 'loi' && c[2] === 's').length > 0 }));
        check(T('live') + ': play switches menu to HUD, own HUD portrait uses the skin', live.hud && !live.menu && live.mine, JSON.stringify(live));
      }, 1500);
      await ctx.close();

      // ----- default play payload and Đấu tiếp
      ({ ctx, page, errs } = await open(browser, T('play'), vp, touch, 'screen=menu&fresh=1'));
      await page.click('#ui .mc[data-mech="soi"]');
      await page.click('#ui .play');
      const dp = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('menu') + ': default play carries level 0 on every track and the base skin "goc"', dp.length === 1 && dp[0].mech === 'soi' && dp[0].mods.lv.join() === '0,0,0,0,0' && dp[0].skin === 'goc', JSON.stringify(dp));
      await ctx.close();

      // ----- shop: sections, confirm, instant grant, once-only, pass and daily claim, no personal data fields
      ({ ctx, page, errs } = await open(browser, T('shop'), vp, touch, 'screen=menu&fresh=1&coins=300&gems=40'));
      await page.click('#ui .shopbtn');
      await shot(page, errs, T('shop'), async () => {
        const r = await page.evaluate(() => ({ secs: [...document.querySelectorAll('#ui .sh-sec h3')].map((n) => n.textContent).join(), cards: document.querySelectorAll('#ui .sh-card').length, prices: [...document.querySelectorAll('#ui .sh-buy')].map((b) => b.textContent.trim()),
          demo: document.querySelector('#ui .sh-demo').textContent, fields: document.querySelectorAll('#ui .shop input, #ui .shop textarea, #ui .shop form, #ui .shop a, #ui .shop iframe').length, bal: document.querySelector('#ui .shop [data-r="gems"]').textContent + '/' + document.querySelector('#ui .shop [data-r="coins"]').textContent,
          starter: [...document.querySelectorAll('#ui .sh-card[data-id="khoidau"] li')].map((n) => n.textContent).join('|') }));
        check(T('shop') + ': four sections in order, 10 cards, VND labels like "29.000 ₫", pretend note, no input or link', r.secs === 'Gói khởi đầu,Thẻ tháng,Gói xe,Tinh Thể' && r.cards === 10 && r.prices[0] === '29.000 ₫' && r.prices.includes('500.000 ₫') && r.prices.every((t) => /^\d{1,3}(\.\d{3})* ₫$/.test(t)) && /Bản thử, không thu tiền thật/.test(r.demo) && r.fields === 0, JSON.stringify(r));
        check(T('shop') + ': cards list what is inside, balances shown (gems / coins)', /300 Tinh Thể\|1\.000 xu\|Thần Công\|Skin Thần Công Ngự Lâm \(S\)/.test(r.starter) && r.bal === '40/300', JSON.stringify(r));
      }, 300);
      await page.click('#ui [data-buy="khoidau"]');
      await shot(page, errs, T('shop-confirm'), async () => {
        const c = await page.evaluate(() => ({ h: document.querySelector('#ui .modal.on h2').textContent, p: document.querySelector('#ui .modal.on .lead').textContent, gems: __G.meta.get().gems }));
        check(T('shop') + ': buy asks first (price, "không thu tiền thật", what you get), nothing granted yet', /Gói Khởi Đầu/.test(c.h) && /29\.000 ₫/.test(c.p) && /không thu tiền thật/.test(c.p) && /300 Tinh Thể/.test(c.p) && c.gems === 40, JSON.stringify(c));
      }, 250);
      await page.click('#ui .modal.on [data-r="no"]');
      let ss = await page.evaluate(() => ({ gems: __G.meta.get().gems, bought: __G.meta.get().shop.bought.khoidau || 0 }));
      check(T('shop') + ': cancel grants nothing', ss.gems === 40 && ss.bought === 0, JSON.stringify(ss));
      await page.click('#ui [data-buy="khoidau"]'); await page.click('#ui .modal.on [data-r="yes"]');
      ss = await page.evaluate(() => { const d = __G.meta.get(); return { gems: d.gems, coins: d.coins, own: d.owned.includes('thancong'), skin: d.ownedSkins.includes('thancong:s'), toast: document.querySelector('#ui .toast').textContent, on: document.querySelector('#ui .toast').classList.contains('on'), btn: document.querySelector('#ui [data-buy="khoidau"]').textContent.trim(), dis: document.querySelector('#ui [data-buy="khoidau"]').disabled, bal: document.querySelector('#ui .shop [data-r="gems"]').textContent }; });
      check(T('shop') + ': confirmed starter pack lands at once (340 gems, 1300 coins, Thần Công, its S skin), toast lists it, card reads "Đã mua" and is disabled', ss.gems === 340 && ss.coins === 1300 && ss.own && ss.skin && /Đã nhận/.test(ss.toast) && /300 Tinh Thể/.test(ss.toast) && /Thần Công/.test(ss.toast) && ss.on && ss.btn === 'Đã mua' && ss.dis && ss.bal === '340', JSON.stringify(ss));
      await page.click('#ui [data-buy="thethang"]'); await page.click('#ui .modal.on [data-r="yes"]');
      await shot(page, errs, T('shop-pass'), async () => {
        const r = await page.evaluate(() => ({ left: document.querySelector('#ui .pass-st b').textContent, claim: document.querySelector('#ui [data-r="claim"]').textContent.trim(), dis: document.querySelector('#ui [data-r="claim"]').disabled, gems: __G.meta.get().gems }));
        check(T('shop') + ': pass shows "Còn 30 ngày" and an enabled daily claim of 30 gems (200 granted on purchase)', /Còn 30 ngày/.test(r.left) && /Nhận 30 Tinh Thể/.test(r.claim) && !r.dis && r.gems === 540, JSON.stringify(r));
      }, 300);
      await page.click('#ui [data-r="claim"]');
      ss = await page.evaluate(() => ({ gems: __G.meta.get().gems, dis: document.querySelector('#ui [data-r="claim"]').disabled, txt: document.querySelector('#ui [data-r="claim"]').textContent.trim() }));
      check(T('shop') + ': claiming adds 30 gems once, the button then reads "Đã nhận hôm nay" and is disabled', ss.gems === 570 && ss.dis && /Đã nhận hôm nay/.test(ss.txt), JSON.stringify(ss));
      await page.click('#ui [data-buy="tt1"]'); await page.click('#ui .modal.on [data-r="yes"]');
      await page.click('#ui [data-buy="tt1"]'); await page.click('#ui .modal.on [data-r="yes"]');
      ss = await page.evaluate(() => ({ gems: __G.meta.get().gems, log: __G.meta.get().shop.log.length, store: JSON.stringify(__G.meta.get()).match(/card|phone|email|address/i) }));
      check(T('shop') + ': a gem bag can be bought repeatedly (+100 each), purchases are logged, the save holds no card / phone / email field', ss.gems === 770 && ss.log === 4 && ss.store === null, JSON.stringify(ss));
      await page.click('#ui .shop [data-r="back"]');
      ss = await page.evaluate(() => ({ shop: document.querySelector('#ui .shop').classList.contains('on'), menu: document.querySelector('#ui .menu').classList.contains('on'), gems: document.querySelector('#ui .menu [data-r="gems"]').textContent, coins: document.querySelector('#ui .menu [data-r="coins"]').textContent, dot: document.querySelector('#ui .shopbtn').classList.contains('dot') }));
      check(T('shop') + ': back returns to the menu, gem balance sits next to coins (770 / 1.300)', !ss.shop && ss.menu && ss.gems === '770' && ss.coins === '1.300' && !ss.dot, JSON.stringify(ss));
      await ctx.close();

      // ----- new HUD pieces: charge meter, planted Q, marked unit, decoy plates
      ({ ctx, page, errs } = await open(browser, T('hud-new'), vp, touch, 'screen=hud&mech=hoalong&freeze=1&charge=0.8&mark=1&decoy=1&warp=300'));
      await page.waitForTimeout(500);
      await shot(page, errs, T('hud-charge'), async () => {
        const r = await page.evaluate(() => {
          const G = window.__G, m = G.match, me = m.units[G.me];
          const chg = document.querySelector('#ui .chg'), plates = [...document.querySelectorAll('#ui .np')];
          const decoys = m.zones.filter((z) => z.kind === 'decoy');
          const foeDecoy = plates.find((n) => !n.classList.contains('off') && !n.classList.contains('decoy') && n.querySelector('.np-n') && [...plates].filter((x) => x.querySelector('.np-n') && x.querySelector('.np-n').textContent === n.querySelector('.np-n').textContent).length === 2);
          return { chg: !!chg && !chg.classList.contains('off'), ready: chg.classList.contains('ready'), full: chg.classList.contains('full'), fill: chg.querySelector('i').style.transform, charge: me.charge, min: me.def.weapon.charge.min,
            markedCards: document.querySelectorAll('#ui .pc.marked').length, markedPlates: document.querySelectorAll('#ui .np.marked').length, mkTxt: (document.querySelector('#ui .np.marked .np-mk') || {}).textContent, zones: decoys.length,
            tag: [...document.querySelectorAll('#ui .np.decoy .np-dc')].map((n) => n.textContent).join(), dup: !!foeDecoy, foeTags: document.querySelectorAll('#ui .np:not(.decoy) .np-dc').length };
        });
        check(T('hud') + ': charge meter shows while charge > 0, ready past the minimum, bar at charge/max', r.chg && r.ready && !r.full && r.charge === 0.8 && r.fill === `scaleX(${Math.round(0.8 / 1.3 * 200) / 200})`, JSON.stringify(r));
        check(T('hud') + ': a marked unit shows on its portrait card and nameplate ("Dấu tử")', r.markedCards >= 1 && r.markedPlates >= 1 && /Dấu tử/.test(r.mkTxt), JSON.stringify(r));
        check(T('hud') + ': my decoy has a "bản sao" tag, the enemy decoy has the same name tag as its owner and no such tag', r.zones === 2 && r.tag === 'bản sao' && r.dup && r.foeTags === 0, JSON.stringify(r));
      }, 300);
      await page.evaluate(() => { const m = window.__G.match, me = m.units[window.__G.me]; me.charge = 1.3; });
      await page.waitForTimeout(300);
      const full = await page.evaluate(() => document.querySelector('#ui .chg').classList.contains('full') && document.querySelector('#ui .chg b').textContent);
      check(T('hud') + ': charge at max reads "Đầy"', full === 'Đầy', String(full));
      await ctx.close();
      ({ ctx, page, errs } = await open(browser, T('hud-planted'), vp, touch, 'screen=hud&mech=thancong&freeze=1&planted=1&warp=60'));
      await page.waitForTimeout(500);
      await shot(page, errs, T('hud-planted'), async () => {
        const r = await page.evaluate(() => { const q = document.querySelectorAll('#ui .slot')[1]; return { cls: q.classList.contains('planted'), txt: q.querySelector('.sl-st').textContent, other: document.querySelectorAll('#ui .slot.planted').length, chg: document.querySelectorAll('#ui .chg').length }; });
        check(T('hud') + ': a planted siege mech lights Q as "Đã cắm", no other slot, no charge meter without a charge weapon', r.cls && r.txt === 'Đã cắm' && r.other === 1 && r.chg === 0, JSON.stringify(r));
      }, 300);
      await ctx.close();

      // ----- hud
      ({ ctx, page, errs } = await open(browser, T('hud'), vp, touch, 'screen=hud&buffs=1&dead=1&mech=soi'));
      await page.waitForTimeout(400);
      await shot(page, errs, T('hud'), async () => {
        const r = await page.evaluate(() => {
          // The feed fades after 5 s, so whether a bot kill is still listed depends on timing: report one kill here instead.
          { const G = window.__G, m = G.match, foe = m.units.find((u) => u.team !== m.units[G.me].team); G.ui.event({ t: 'death', id: foe.id, by: G.me, assists: [], x: foe.x, z: foe.z }); }
          const t = (s) => (document.querySelector(s) || {}).textContent;
          const mm = document.querySelector('#ui .mm canvas'), px = mm.getContext('2d').getImageData(0, 0, mm.width, mm.height).data;
          let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 120 || px[i + 1] > 120 || px[i + 2] > 120) lit++;
          const vis = (s) => [...document.querySelectorAll(s)].filter((n) => getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden' && +getComputedStyle(n).opacity > 0);
          return {
            k0: t('#ui .sc-n'), clock: t('#ui .sc-clock'), cards: document.querySelectorAll('#ui .pc').length, dead: document.querySelectorAll('#ui .pc.dead').length,
            mmLit: lit, slots: [...document.querySelectorAll('#ui .slot')].map((s) => !!s.querySelector('svg')), keys: [...document.querySelectorAll('#ui .slot kbd')].map((k) => k.textContent).join(','),
            hp: t('#ui .hpb-main span'), nps: vis('#ui .np').length, self: vis('#ui .np.self').length, fn: document.querySelectorAll('#ui .fn').length,
            feed: document.querySelectorAll('#ui .kf').length, chips: vis('#ui .chip').length, mission: t('#ui .mission'), role: document.querySelectorAll('#ui .pc-role svg').length,
          };
        });
        check(T('hud') + ': score, clock, 6 portrait cards (3 a side), some dead', /^\d+$/.test(r.k0) && /^\d:\d\d$/.test(r.clock) && r.cards === 6 && r.dead >= 1, JSON.stringify(r));
        check(T('hud') + ': minimap painted', r.mmLit > 300, 'lit ' + r.mmLit);
        check(T('hud') + ': 5 skill slots with icons and key hints', r.slots.length === 5 && r.slots.every(Boolean) && r.keys === 'Chuột trái,Q,E,Cách,F', r.keys);
        check(T('hud') + ': hp text, nameplates incl. own, buff chips', /\d+ \/ \d+/.test(r.hp) && r.nps >= 2 && r.self === 1 && r.chips >= 3, JSON.stringify(r));
        check(T('hud') + ': a kill reported to the HUD shows in the kill feed', r.feed >= 1, 'feed ' + r.feed);
        check(T('hud') + ': mission line text', /chạm \d+ điểm/.test(r.mission), r.mission);
      });
      // floating numbers: feed synthetic events at the player
      await page.evaluate(() => {
        const G = __G, u = G.match.units[0], e = G.match.units[1];
        G.ui.event({ t: 'hit', id: e.id, by: 0, x: e.x, z: e.z, amt: 120, absorbed: 0 });
        G.ui.event({ t: 'hit', id: e.id, by: 0, x: e.x, z: e.z, amt: 80, absorbed: 0 });
        G.ui.event({ t: 'hit', id: 0, by: 1, x: u.x, z: u.z, amt: 210, absorbed: 90 });
        G.ui.event({ t: 'heal', id: 0, x: u.x, z: u.z, amt: 150 });
        G.ui.event({ t: 'pickup', id: 0, crate: 1, type: 'haste', x: u.x, z: u.z });
        G.ui.event({ t: 'crateDrop', id: 1, x: 0, z: 0, type: 'heal' });
      });
      await page.waitForTimeout(140);
      const fl = await page.evaluate(() => [...document.querySelectorAll('#ui .fn')].filter((n) => n.style.display !== 'none').map((n) => n.className.replace('fn ', '') + ':' + n.textContent));
      check(T('hud') + ': floating numbers (merged dealt 200, taken 210, shield 90, heal, pickup toast)', [['dealt', 200], ['taken', 210], ['shield', 90]].every(([k, v]) => fl.some((x) => x.split(':')[0].split(' ').pop() === k && +x.split(':')[1] >= v)) && fl.some((x) => x.endsWith('pick:+ Tăng tốc')) && fl.some((x) => /^heal:\+?\d+$/.test(x) && +x.replace(/\D/g, '') >= 150), fl.join(' | '));
      await shot(page, errs, T('hud-fx'), async () => {
        const a = await page.evaluate(() => document.querySelector('#ui .ann b').textContent);
        check(T('hud') + ': announcement text', /Tiếp tế đang rơi|Chiến công đầu|Hạ/.test(a), a);
      }, 450);
      await ctx.close();

      // ----- low hp + player dead
      ({ ctx, page, errs } = await open(browser, T('low'), vp, touch, 'screen=hud&low=1&freeze=1&mech=hac'));
      // The sim is frozen so no bot heal potion or kill can lift hp above the threshold; wait on the class instead of a timer.
      await page.waitForFunction(() => document.querySelector('#ui .vig').classList.contains('on'), null, { timeout: 5000 }).catch(() => {});
      await shot(page, errs, T('hud-low'), async () => {
        const v = await page.evaluate(() => document.querySelector('#ui .vig').classList.contains('on'));
        check(T('low') + ': low-hp vignette on', v);
      }, 300);
      await ctx.close();
      ({ ctx, page, errs } = await open(browser, T('rsp'), vp, touch, 'screen=hud&meDead=1&mech=trau'));
      await shot(page, errs, T('respawn'), async () => {
        const r = await page.evaluate(() => document.querySelector('#ui .rsp-t').textContent);
        check(T('respawn') + ': countdown text', /Hồi sinh sau \d/.test(r), r);
      }, 500);
      await ctx.close();

      // ----- pause
      ({ ctx, page, errs } = await open(browser, T('pause'), vp, touch, 'screen=pause&mech=ung'));
      await shot(page, errs, T('pause'), async () => {
        const r = await page.evaluate(() => ({ t: document.querySelector('#ui .pause').textContent, p: __G.ui.paused }));
        check(T('pause') + ': pause box with both buttons', /Tiếp tục/.test(r.t) && /Về sảnh/.test(r.t) && r.p === true, JSON.stringify(r));
      }, 400);
      await page.click('#ui .pause [data-r="quit"]');
      const lg = await page.evaluate(() => window.__log.map((l) => l[0]));
      check(T('pause') + ': Về sảnh emits ui:menu', lg.includes('ui:menu') && lg.includes('ui:pause'), lg.join(','));
      await ctx.close();

      // ----- result: win with rank-up
      ({ ctx, page, errs } = await open(browser, T('result'), vp, touch, 'screen=result&fresh=1&levelup=1&trophies=90&mech=soi'));
      await page.waitForFunction(() => document.querySelector('#ui [data-r="trN"]').textContent === '112' && document.querySelector('#ui [data-r="rl"]').textContent === '2', null, { timeout: 8000 }).catch(() => {});
      await shot(page, errs, T('result'), async () => {
        const r = await page.evaluate(() => ({
          banner: document.querySelector('#ui .rs-banner h1').textContent, rows: document.querySelectorAll('#ui .tb-r').length, me: document.querySelectorAll('#ui .tb-r.me').length,
          mvp: document.querySelectorAll('#ui .mvp').length, coins: document.querySelector('#ui [data-r="rc"]').textContent, xp: document.querySelector('#ui [data-r="rx"]').textContent,
          lvl: document.querySelector('#ui [data-r="rl"]').textContent, up: document.querySelector('#ui .lvup').classList.contains('on'),
          score: document.querySelector('#ui .rs-score').textContent.replace(/\s/g, ''), btns: [...document.querySelectorAll('#ui .rs-btns button')].map((b) => b.textContent),
          rank: document.querySelector('#ui [data-r="trName"]').textContent, trN: document.querySelector('#ui [data-r="trN"]').textContent, trD: document.querySelector('#ui [data-r="trD"]').textContent,
          flourish: document.querySelector('#ui [data-r="trUp"]').classList.contains('on') && getComputedStyle(document.querySelector('#ui [data-r="trUp"]')).display !== 'none', flText: document.querySelector('#ui [data-r="trUp"]').textContent,
          saved: __G.meta.get().trophies,
        }));
        check(T('result') + ': THẮNG banner, score, 6 rows, one mine, one MVP', r.banner === 'Thắng' && /^\d+:\d+/.test(r.score) && r.rows === 6 && r.me === 1 && r.mvp === 1, JSON.stringify(r));
        check(T('result') + ': rewards animate to non-zero, level-up shown', /\+[1-9]\d*/.test(r.coins) && /\+[1-9]\d* XP/.test(r.xp) && r.up && r.lvl === '2', JSON.stringify(r));
        check(T('result') + ': Đấu tiếp and Về sảnh buttons', r.btns.join('|') === 'Đấu tiếp|Về sảnh', r.btns.join('|'));
        check(T('result') + ': 90 + 22 = 112 cúp, +22 shown, rank-up flourish "Lên hạng! Đồng"', r.trN === '112' && r.trD === '+22' && r.saved === 112 && r.rank === 'Đồng' && r.flourish && r.flText === 'Lên hạng! Đồng', JSON.stringify(r));
      }, 2600);
      await page.click('#ui .rs-btns .primary');
      const again = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('result') + ': Đấu tiếp emits ui:play with mods and skin', again.length >= 1 && again[0].mods.lv.join() === '0,0,0,0,0' && again[0].skin === 'goc', JSON.stringify(again));
      await ctx.close();

      // ----- result: loss never takes trophies below 0
      ({ ctx, page, errs } = await open(browser, T('result-lose'), vp, touch, 'screen=result&fresh=1&lose=1&trophies=5&mech=soi'));
      await page.waitForFunction(() => document.querySelector('#ui [data-r="trN"]').textContent === '0', null, { timeout: 8000 }).catch(() => {});
      await shot(page, errs, T('result-lose'), async () => {
        const r = await page.evaluate(() => ({ banner: document.querySelector('#ui .rs-banner h1').textContent, trN: document.querySelector('#ui [data-r="trN"]').textContent, trD: document.querySelector('#ui [data-r="trD"]').textContent, up: getComputedStyle(document.querySelector('#ui [data-r="trUp"]')).display, saved: __G.meta.get().trophies }));
        check(T('result-lose') + ': loss at 5 cúp ends at 0 (not -7), shows −5, no rank flourish', r.banner === 'Thua' && r.trN === '0' && r.trD === '−5' && r.saved === 0 && r.up === 'none', JSON.stringify(r));
      }, 2200);
      await ctx.close();

      // ----- modes: menu pickers
      ({ ctx, page, errs } = await open(browser, T('menu-modes'), vp, touch, 'screen=menu&fresh=1&mode=trum&map=mienglua'));
      await shot(page, errs, T('menu-modes'), async () => {
        const r = await page.evaluate(() => {
          const vh = innerHeight, play = document.querySelector('#ui .play').getBoundingClientRect();
          return {
            modes: [...document.querySelectorAll('#ui .mode')].map((b) => b.dataset.mode + ':' + b.textContent.trim()),
            on: document.querySelector('#ui .mode.on').dataset.mode, blurb: document.querySelector('#ui .mode-bl').textContent,
            maps: [...document.querySelectorAll('#ui .map')].map((b) => b.dataset.map + '|' + b.querySelector('.sw').className.replace('sw ', '') + '|' + b.querySelector('b').textContent + '|' + b.querySelector('.hz').textContent),
            blurbs: [...document.querySelectorAll('#ui .map small')].map((n) => n.textContent.length > 20),
            mapOn: document.querySelector('#ui .map.on').dataset.map, swIcons: document.querySelectorAll('#ui .sw svg').length,
            playIn: play.bottom <= vh + 1 && play.top >= 0, segs: document.querySelectorAll('#ui .seg[data-r="diff"] button').length,
          };
        });
        check(T('menu-modes') + ': mode picker lists every mode of MODE_ORDER with its Vietnamese name', r.modes.join() === MODE_ORDER.map((k) => k + ':' + MODES[k].name).join(), r.modes.join());
        check(T('menu-modes') + ': saved mode (trum) is preselected and its blurb is shown', r.on === 'trum' && r.blurb === MODES.trum.blurb, JSON.stringify(r));
        check(T('menu-modes') + ': map picker shows 4 layouts + Ngẫu nhiên with swatch, name and hazard in words', r.maps.join('\n') === 'denrung|jungle|Đền Rừng|Không có bẫy\nxuongcat|desert|Xưởng Cát|Họng lửa phụt\ncangbang|ice|Cảng Băng|Băng trơn trượt\nmienglua|lava|Miệng Lửa|Hồ dung nham\nrandom|rnd|Ngẫu nhiên|Bố cục bốc thăm mỗi trận' && r.swIcons === 15 && r.blurbs.length === 5, r.maps.join(' ; '));
        check(T('menu-modes') + ': saved map (mienglua) preselected, play button inside the viewport, difficulty still 3 buttons', r.mapOn === 'mienglua' && r.playIn && r.segs === 3, JSON.stringify(r));
      });
      await page.click('#ui .mode[data-mode="chiem"]');
      await page.click('#ui .map[data-map="cangbang"]');
      await page.click('#ui .play');
      {
        const r = await page.evaluate(() => ({ play: (window.__log || []).filter((l) => l[0] === 'ui:play').map((l) => l[1]), saved: JSON.parse(localStorage.getItem('dtt.save.v1')), live: __G.match && __G.match.mode + '/' + __G.match.map.key }));
        check(T('menu-modes') + ': ui:play carries mode+map, meta saves the last mode, the match starts in that mode and map', r.play.length === 1 && r.play[0].mode === 'chiem' && r.play[0].map === 'cangbang' && r.saved.mode === 'chiem' && r.saved.map === 'cangbang' && r.live === 'chiem/cangbang', JSON.stringify(r));
        const again = await page.evaluate(() => {
          const rows = __G.match.units.map((u) => ({ id: u.id, team: u.team, name: u.name, mech: u.mech, kills: 0, deaths: 0, assists: 0, dmg: 0, healed: 0, rating: 0 }));
          __G.ui.showResult({ rows, mvp: 0, score: [150, 20], winner: 0, time: 100 }, null);
          document.querySelector('#ui .result [data-r="again"]').click();
          return (window.__log || []).filter((l) => l[0] === 'ui:play').pop()[1];
        });
        check(T('menu-modes') + ': "Đấu tiếp" repeats the same mode', again.mode === 'chiem' && again.map === 'cangbang', JSON.stringify(again.mode));
      }
      await ctx.close();

      // ----- modes: HUD
      const hudOpen = (mode) => open(browser, T('hud-' + mode), vp, touch, `screen=hud&mode=${mode}&fresh=1&freeze=1&warp=60&mech=soi`);
      const txt = (sel) => `(document.querySelector('${sel}') || {}).textContent`;

      ({ ctx, page, errs } = await hudOpen('tdm'));
      await shot(page, errs, T('hud-tdm'), async () => {
        const r = await page.evaluate(() => ({ mission: document.querySelector('#ui .mission').textContent, cols: document.querySelectorAll('#ui .pc').length, pts: document.querySelectorAll('#ui .ppt').length, rk: document.querySelectorAll('#ui .rkr').length, boss: document.querySelectorAll('#ui .bh').length, foe: getComputedStyle(document.querySelector('#ui .col.foe')).display, want: __G.match.rule.mission.replace('{target}', __G.match.target) }));
        check(T('hud-tdm') + ': unchanged bar: 6 portrait cards, both columns, no points, no ranking, no boss bar, mission from MODES.tdm with the match target', r.cols === 6 && r.foe !== 'none' && r.pts === 0 && r.rk === 0 && r.boss === 0 && r.mission === r.want, JSON.stringify(r));
      });
      await ctx.close();

      ({ ctx, page, errs } = await hudOpen('chiem'));
      await page.evaluate(() => {
        const m = __G.match;
        Object.assign(m.points[0], { owner: 0, prog: -1 }); Object.assign(m.points[1], { owner: 1, prog: 1 }); Object.assign(m.points[2], { owner: -1, prog: -0.5 });
        m.score[0] = 60; m.score[1] = 45;
      });
      await shot(page, errs, T('hud-chiem'), async () => {
        const r = await page.evaluate(() => ({
          pips: [...document.querySelectorAll('#ui .ppt')].map((p) => p.textContent + ':' + p.dataset.owner + ':' + p.style.getPropertyValue('--p')),
          labels: [...document.querySelectorAll('#ui .pl')].map((p) => p.textContent), k: [document.querySelector('#ui [data-r="k0"]').textContent, document.querySelector('#ui [data-r="k1"]').textContent],
          tgt: document.querySelector('#ui [data-r="tgt"]').textContent, bar: document.querySelector('#ui [data-r="bar0"]').style.transform, cards: document.querySelectorAll('#ui .pc').length,
          mission: document.querySelector('#ui .mission').textContent, target: __G.match.target,
        }));
        check(T('hud-chiem') + ': three point pips A/B/C reflect forced owners (mine, foe, none) and ring progress 100/100/50%', r.pips.join() === 'A:mine:100%,B:foe:100%,C:none:50%', r.pips.join());
        check(T('hud-chiem') + ': world labels show letter + state: Của ta / Của địch / 50%', r.labels.join() === 'ACủa ta,BCủa địch,C50%', r.labels.join());
        check(T('hud-chiem') + ': scores 60 vs 45 toward the match target, both columns kept, mission has {target} filled', r.k.join() === '60,45' && r.tgt === String(r.target) && r.bar === `scaleX(${Math.round(60 / r.target * 200) / 200})` && r.cards === 6 && r.mission === `Đứng trong vòng để chiếm cứ điểm, đội nào đủ ${r.target} điểm trước sẽ thắng`, JSON.stringify(r));
      });
      await page.evaluate(() => __G.ui.event({ t: 'capture', point: 1, team: 0, x: 0, z: 0 }));
      await page.waitForFunction(() => document.querySelector('#ui .ann b').textContent === 'Đã chiếm cứ điểm B', null, { timeout: 4000 }).then(() => check(T('hud-chiem') + ': capture by my team announces "Đã chiếm cứ điểm B"', true), () => check(T('hud-chiem') + ': capture by my team announces "Đã chiếm cứ điểm B"', false, 'got ' + '?'));
      await page.waitForTimeout(2100);
      await page.evaluate(() => { __G.ui.event({ t: 'capture', point: 1, team: 1, x: 0, z: 0 }); });
      await page.waitForFunction(() => document.querySelector('#ui .ann b').textContent === 'Mất cứ điểm B', null, { timeout: 4000 }).then(() => check(T('hud-chiem') + ': losing a point announces "Mất cứ điểm B"', true), () => check(T('hud-chiem') + ': losing a point announces "Mất cứ điểm B"', false));
      await ctx.close();

      ({ ctx, page, errs } = await hudOpen('tudo'));
      await page.evaluate(() => { const m = __G.match; [3, 9, 1, 7, 2, 5].forEach((v, i) => { m.score[i] = v; }); });
      await shot(page, errs, T('hud-tudo'), async () => {
        const r = await page.evaluate(() => ({
          rows: [...document.querySelectorAll('#ui .rkr:not([hidden])')].map((n) => n.dataset.id + ':' + n.querySelector('.rk-p').textContent + ':' + n.querySelector('.rk-k').textContent),
          gap: document.querySelectorAll('#ui .rk-gap').length, me: document.querySelector('#ui .rkr.me').dataset.id, k: [document.querySelector('#ui [data-r="k0"]').textContent, document.querySelector('#ui [data-r="k1"]').textContent],
          who: document.querySelector('#ui [data-r="w1"]').textContent, target: __G.match.target, tgt: document.querySelector('#ui [data-r="tgt"]').textContent,
          foe: getComputedStyle(document.querySelector('#ui .col.foe')).display, pc: document.querySelectorAll('#ui .pc').length,
          badPlates: document.querySelectorAll('#ui .np:not(.self).t0').length, plates: document.querySelectorAll('#ui .np.t1').length, selfT0: document.querySelectorAll('#ui .np.self.t0').length,
          mission: document.querySelector('#ui .mission').textContent,
        }));
        const names = await page.evaluate(() => __G.match.units[__G.match.units.length - 1].name);
        check(T('hud-tudo') + ': ranking = all six mechs by kills (ids 1,3,5,0,4,2 on 9,7,5,3,2,1), no gap row', r.rows.join() === '1:1:9,3:2:7,5:3:5,0:4:3,4:5:2,2:6:1' && r.gap === 0 && r.me === '0', r.rows.join());
        check(T('hud-tudo') + ': top bar = my 3 kills vs leader 9 toward the target, leader named; no right column, no team cards', r.k.join() === '3,9' && /^Dẫn đầu: /.test(r.who) && r.tgt === String(r.target) && r.foe === 'none' && r.pc === 0, JSON.stringify(r));
        check(T('hud-tudo') + ': the 5 other nameplates (plus any decoy plate, which copies its owner) use the enemy colour, mine the ally colour; mission has {target} filled', r.badPlates === 0 && r.plates >= 5 && r.selfT0 === 1 && r.mission === `Không có đồng đội: hạ gục ${r.target} lần trước mọi người`, JSON.stringify(r));
      });
      await page.evaluate(() => { __G.ui.event({ t: 'death', id: 2, by: 3, assists: [], x: 0, z: 0 }); });
      await page.waitForTimeout(200);
      {
        const f = await page.evaluate(() => ({ t0: document.querySelectorAll('#ui .kf b.t0').length, t1: document.querySelectorAll('#ui .kf b.t1').length }));
        check(T('hud-tudo') + ': kill feed between two rivals uses no ally colour', f.t0 === 0 && f.t1 === 2, JSON.stringify(f));
        await page.evaluate(() => { const m = __G.match; m.score[0] = 11; });
        await page.waitForTimeout(250);
        const r2 = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#ui .rkr:not([hidden])')].map((n) => n.dataset.id).join(), who: document.querySelector('#ui [data-r="w1"]').textContent }));
        check(T('hud-tudo') + ': ranking re-sorts live: my 11 kills puts me first, rival label switches to "Đối thủ"', r2.rows === '0,1,3,5,4,2' && /^Đối thủ: /.test(r2.who), JSON.stringify(r2));
      }
      await ctx.close();

      ({ ctx, page, errs } = await hudOpen('trum'));
      await page.evaluate(() => { const m = __G.match, b = m.units.find((u) => u.def.boss); window.__lives0 = m.lives; b.hp = b.maxHp * 0.5; m.lives = 7; });
      await shot(page, errs, T('hud-trum'), async () => {
        const r = await page.evaluate(() => ({
          w: document.querySelector('#ui .bh-fill').style.width, num: document.querySelector('#ui [data-r="num"]').textContent, name: document.querySelector('#ui [data-r="bname"]').textContent,
          pips: document.querySelectorAll('#ui .lp').length, on: document.querySelectorAll('#ui .lp.on').length, lvn: document.querySelector('#ui [data-r="lvn"]').textContent,
          mine: document.querySelectorAll('#ui .col.mine .pc').length, foe: getComputedStyle(document.querySelector('#ui .col.foe')).display, bossPlate: document.querySelectorAll('#ui .np.boss').length,
          bossBar: document.querySelector('#ui .np.boss .np-hp').getBoundingClientRect().width, plain: document.querySelector('#ui .np:not(.boss):not(.self) .np-hp').getBoundingClientRect().width,
          mission: document.querySelector('#ui .mission').textContent, max: __G.match.units.find((u) => u.def.boss).maxHp, lives0: window.__lives0,
        }));
        const dots = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        check(T('hud-trum') + ': boss bar named Cự Thần, fill width 50% at half hp, numbers half / max with dot thousands', r.name === 'Cự Thần' && r.w === '50%' && r.num === `${dots(r.max / 2)} / ${dots(r.max)}`, JSON.stringify(r));
        check(T('hud-trum') + ': one life pip per starting life with 7 lit and count 7; left column = my 3 hunters; no right column', r.pips === r.lives0 && r.pips > 0 && r.on === 7 && r.lvn === '7' && r.mine === 3 && r.foe === 'none', JSON.stringify(r));
        check(T('hud-trum') + ': boss nameplate is wider than a normal one; mission has {lives} filled', r.bossPlate === 1 && r.bossBar > r.plain * 1.5 && r.mission === `Hạ Cự Thần trước khi cả đội dùng hết ${r.lives0} mạng`, JSON.stringify(r));
      });
      await page.evaluate(() => { const b = __G.match.units.find((u) => u.def.boss); b.hp = b.maxHp * 0.1; });
      await page.waitForTimeout(250);
      {
        const w = await page.evaluate(() => document.querySelector('#ui .bh-fill').style.width);
        check(T('hud-trum') + ': boss bar follows hp down to 10%', w === '10%', w);
        await page.evaluate(() => { const b = __G.match.units.find((u) => u.def.boss); b.cast = { skill: b.def.skills[0], t: 1, total: 1.1, move: 0.35, lock: false, aim: 0, left: 1 }; });
        await page.waitForFunction(() => document.querySelector('#ui .warn').classList.contains('on'), null, { timeout: 3000 }).catch(() => {});
        const wn = await page.evaluate(() => ({ on: document.querySelector('#ui .warn').classList.contains('on'), text: document.querySelector('#ui .warn').textContent }));
        check(T('hud-trum') + ': boss starting a nova cast raises the banner "Cự Thần sắp dậm đất!"', wn.on && wn.text === 'Cự Thần sắp dậm đất!', JSON.stringify(wn));
        await page.screenshot({ path: `${OUT}/ui-${T('hud-trum-warn')}.png` });
        await page.evaluate(() => { const b = __G.match.units.find((u) => u.def.boss); b.cast = null; b.cd.ult += 16; });
        await page.waitForFunction(() => document.querySelector('#ui .warn').textContent === 'Cự Thần sắp triệu mưa pháo!', null, { timeout: 3000 }).then(() => check(T('hud-trum') + ': boss casting the barrage raises "Cự Thần sắp triệu mưa pháo!"', true), () => check(T('hud-trum') + ': boss casting the barrage raises "Cự Thần sắp triệu mưa pháo!"', false));
      }
      await ctx.close();

      // free-for-all and boss matches must also run live (no freeze) without a single error
      if (ctxName === 'desktop') {
        for (const mode of ['tudo', 'trum', 'chiem']) {
          ({ ctx, page, errs } = await open(browser, T('live-' + mode), vp, touch, `screen=hud&mode=${mode}&fresh=1&warp=200&mech=trau`));
          await page.waitForTimeout(2500);
          const r = await page.evaluate(() => ({ tick: __G.match.tick, errors: window.__errors.length, hud: document.querySelector('#ui .hud').classList.contains('on'), mode: __G.match.mode }));
          check(T('live-' + mode) + ': match runs live in the harness (ticks advance past 200, HUD on, no errors)', r.tick > 200 && r.errors === 0 && r.hud && r.mode === mode && errs.length === 0, JSON.stringify(r) + errs.join('|'));
          await ctx.close();
        }
      }

      // ----- modes: result screens
      for (const [mode, query, tag] of [['chiem', 'trophies=300', 'chiem'], ['tudo', 'place=3&trophies=300', 'tudo'], ['trum', 'trophies=300', 'trum'], ['trum', 'lose=1&trophies=300', 'trum-lose']]) {
        ({ ctx, page, errs } = await open(browser, T('result-' + tag), vp, touch, `screen=result&fresh=1&mode=${mode}&mech=soi&${query}`));
        await shot(page, errs, T('result-' + tag), async () => {
          const r = await page.evaluate(() => ({
            banner: document.querySelector('#ui .rs-banner h1').textContent, cls: document.querySelector('#ui .rs-banner').className, rows: document.querySelectorAll('#ui .tb-r').length, tables: document.querySelectorAll('#ui .tb').length,
            meIdx: [...document.querySelectorAll('#ui .tb-r')].findIndex((n) => n.classList.contains('me')), mine: document.querySelectorAll('#ui .tb-r.me').length,
            dmg: [...document.querySelectorAll('#ui .bd b')].map((n) => n.textContent).join(), trophyBlock: !!document.querySelector('#ui [data-r="trN"]'), trophies: __G.meta.get().trophies,
            places: [...document.querySelectorAll('#ui .tb-ic .plc')].map((n) => n.textContent).join(),
          }));
          if (tag === 'chiem') check(T('result-chiem') + ': two team tables of 3, banner Thắng, trophy block shown and +22 cúp saved', r.tables === 2 && r.rows === 6 && r.banner === 'Thắng' && r.mine === 1 && r.trophyBlock && r.trophies === 322, JSON.stringify(r));
          if (tag === 'tudo') check(T('result-tudo') + ': one ranking of 6, banner "Hạng 3/6", my row 3rd and highlighted, drawn colour, no trophy block, cúp unchanged 300', r.tables === 1 && r.rows === 6 && r.banner === 'Hạng 3/6' && r.meIdx === 2 && r.mine === 1 && /draw/.test(r.cls) && !r.trophyBlock && r.trophies === 300 && r.places === '1,2,3,4,5,6', JSON.stringify(r));
          if (tag === 'trum') check(T('result-trum') + ': "Đã hạ Cự Thần", 3 rows sorted by damage on the boss, no trophy block, cúp unchanged', r.banner === 'Đã hạ Cự Thần' && /win/.test(r.cls) && r.rows === 3 && r.dmg === '8.000,7.000,5.500' && !r.trophyBlock && r.trophies === 300, JSON.stringify(r));
          if (tag === 'trum-lose') check(T('result-trum-lose') + ': "Cự Thần thắng" with the lose banner', r.banner === 'Cự Thần thắng' && /lose/.test(r.cls) && r.trophies === 300, JSON.stringify(r));
        }, 2200);
        await ctx.close();
      }

      // ----- keys: bindings API, Phím tab, HUD hints, scoreboard (a desktop-input context at both sizes: touch hides every key hint)
      const KEYS = '/games/dau-truong-thep/js/keys.js';
      const DEF = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], fire: ['Mouse0'], s1: ['KeyQ'], s2: ['KeyE'], ult: ['Space'], heal: ['KeyF'], score: ['Tab'], pause: ['Escape'], netstat: ['F8'], autofire: ['Mouse2'] };
      const getB = (pg) => pg.evaluate(async (u) => (await import(u)).getBindings(), KEYS);
      const sampleOf = (pg) => pg.evaluate(() => { const i = __G.input.sample(__G.match.units[0]); return { s1: i.s1, s2: i.s2, fire: i.fire, ult: i.ult, heal: i.heal, mx: i.mx, mz: i.mz }; });
      const ACTION_IDS = Object.keys(DEF);
      if (ctxName === 'desktop') {
        ({ ctx, page, errs } = await open(browser, T('keys-api'), vp, false, 'screen=hud&manual=1&auto=0&mech=soi&freeze=1&warp=5'));
        let r = await page.evaluate(async (u) => { const K = await import(u); return { b: K.getBindings(), l: ['up', 's1', 'fire', 'ult', 'heal', 'score', 'pause', 'netstat', 'autofire'].map(K.labelFor), n: K.ACTIONS.length }; }, KEYS);
        check('keys: defaults are WASD+arrows, Mouse0 fire, Q/E/Space/F, Tab scoreboard, Esc pause, F8 network readout; labels in Vietnamese', JSON.stringify(r.b) === JSON.stringify(DEF) && r.l.join() === 'W,Q,Chuột trái,Cách,F,Tab,Esc,F8,Chuột phải' && r.n === 13, JSON.stringify(r));
        r = await page.evaluate(async (u) => (await import(u)).bind('s1', 'KeyR'), KEYS);
        check('keys: bind(s1, KeyR) -> { ok: true, conflict: null }', r.ok === true && r.conflict === null, JSON.stringify(r));
        await page.keyboard.down('KeyR');
        const withR = await sampleOf(page);
        await page.keyboard.up('KeyR'); await page.keyboard.down('KeyQ');
        const withQ = await sampleOf(page);
        await page.keyboard.up('KeyQ');
        check('keys: after rebinding skill 1 to KeyR, KeyR triggers s1 and KeyQ no longer does', withR.s1 === true && withQ.s1 === false && withR.s2 === false, JSON.stringify([withR, withQ]));
        r = await page.evaluate(async (u) => { const K = await import(u); return { r: K.bind('fire', 'KeyR'), fire: K.getBindings().fire, s1: K.getBindings().s1 }; }, KEYS);
        check('keys: binding fire to a key s1 uses reports conflict "s1" and changes nothing', r.r.ok === false && r.r.conflict === 's1' && r.fire.join() === 'Mouse0' && r.s1.join() === 'KeyR', JSON.stringify(r));
        r = await page.evaluate(async (u) => { const K = await import(u); const x = K.bind('fire', 'KeyR', 0, { swap: true }); return { x, b: K.getBindings() }; }, KEYS);
        check('keys: swapping leaves both actions bound: fire = KeyR, s1 = Mouse0', r.x.ok && r.b.fire.join() === 'KeyR' && r.b.s1.join() === 'Mouse0' && ACTION_IDS.every((id) => r.b[id].length > 0 && r.b[id].every(Boolean)), JSON.stringify(r.b));
        await page.mouse.move(600, 300); await page.mouse.down();
        const m1 = await sampleOf(page);
        await page.mouse.up(); await page.keyboard.down('KeyR');
        const m2 = await sampleOf(page);
        await page.keyboard.up('KeyR');
        check('keys: after the swap the mouse button casts skill 1 and KeyR fires', m1.s1 === true && m1.fire === false && m2.fire === true && m2.s1 === false, JSON.stringify([m1, m2]));
        r = await page.evaluate(async (u) => { const K = await import(u); K.resetBindings(); return K.getBindings(); }, KEYS);
        check('keys: resetBindings restores every default', JSON.stringify(r) === JSON.stringify(DEF), JSON.stringify(r));
        await page.mouse.click(600, 300, { button: 'right' });
        const a1 = await sampleOf(page), badge1 = await page.evaluate(() => !document.querySelector('#ui .afb').hidden);
        await page.mouse.click(600, 300, { button: 'right' });
        const a2 = await sampleOf(page), badge2 = await page.evaluate(() => !document.querySelector('#ui .afb').hidden);
        check('keys: right click toggles auto fire: fire stays on with no button held and the HUD badge shows, a second right click stops it', a1.fire === true && badge1 && a2.fire === false && !badge2, JSON.stringify([a1.fire, badge1, a2.fire, badge2]));
        r = await page.evaluate(async (u) => { const K = await import(u); return { a: K.bind('s2', 'Mouse1'), b: K.bind('up', 'Mouse1'), c: K.bind('pause', 'Mouse2'), s2: K.getBindings().s2, up: K.getBindings().up }; }, KEYS);
        check('keys: a mouse button binds to skills but never to movement or pause', r.a.ok && !r.b.ok && !r.c.ok && r.s2.join() === 'Mouse1' && r.up.join() === 'KeyW,ArrowUp', JSON.stringify(r));
        await page.evaluate(async (u) => { const K = await import(u); K.resetBindings(); K.bind('s2', 'KeyT'); K.bind('up', 'KeyI', 0); }, KEYS);
        await page.reload(); await page.waitForFunction(() => window.__ready === true);
        r = await getB(page);
        check('keys: bindings survive a reload (localStorage dtt.keys.v1)', r.s2.join() === 'KeyT' && r.up.join() === 'KeyI,ArrowUp' && r.s1.join() === 'KeyQ' && (await page.evaluate(() => JSON.parse(localStorage.getItem('dtt.keys.v1')).v)) === 1, JSON.stringify(r));
        const garbage = [
          ['not json', '{{{ nope', DEF],
          ['wrong shape', '{"v":1,"b":{"s1":5,"fire":["KeyZ"],"up":["KeyI","Mouse1"]}}', { ...DEF, fire: ['KeyZ'], up: ['KeyI', 'ArrowUp'] }],
          ['key taken by an earlier action', '{"v":1,"b":{"s2":["KeyQ"]}}', DEF],
          ['unknown version', '{"v":7,"b":{"s1":["KeyR"]}}', DEF],
        ];
        for (const [what, raw, want] of garbage) {
          await page.evaluate((x) => localStorage.setItem('dtt.keys.v1', x), raw);
          await page.reload(); await page.waitForFunction(() => window.__ready === true);
          r = await getB(page);
          check(`keys: garbage in dtt.keys.v1 (${what}) falls back slot by slot to defaults`, JSON.stringify(r) === JSON.stringify(want), JSON.stringify(r));
        }
        check('keys: no console errors in the API runs', errs.length === 0 && (await page.evaluate(() => window.__errors.length)) === 0, errs.join('|'));
        await ctx.close();
      }

      // Phím tab: idle, capturing, conflict prompt, swap, cancel, keyboard only, reset
      ({ ctx, page, errs } = await open(browser, T('keys-tab'), vp, false, 'screen=menu&fresh=1'));
      await page.click('#ui [data-r="bSet"]');
      await page.click('#ui [data-st="keys"]');
      await shot(page, errs, T('keys-idle'), async () => {
        const r = await page.evaluate(() => ({
          rows: document.querySelectorAll('#ui .kr').length, caps: [...document.querySelectorAll('#ui .kcap')].map((b) => b.textContent),
          names: [...document.querySelectorAll('#ui .kr-n')].map((n) => n.textContent), reset: !!document.querySelector('#ui [data-r="kreset"]'),
          on: document.querySelector('#ui .modal.on h2').textContent,
        }));
        check(T('keys-idle') + ': Phím tab lists 13 actions with their keys in Vietnamese and a "Về mặc định" button',
          r.on === 'Cài đặt' && r.rows === 13 && r.caps.join() === 'W,↑,S,↓,A,←,D,→,Chuột trái,Q,E,Cách,F,Tab,Esc,F8,Chuột phải' && r.names.includes('Thông số mạng') && r.names[0] === 'Đi lên' && r.names.includes('Bảng điểm (giữ)') && r.reset, JSON.stringify(r));
      }, 300);
      await page.click('#ui .kcap[data-act="s1"][data-slot="0"]');
      await shot(page, errs, T('keys-capture'), async () => {
        const r = await page.evaluate(() => ({ on: [...document.querySelectorAll('#ui .kcap.on')].map((b) => b.textContent), msg: document.querySelector('#ui [data-r="kmsg"]').textContent }));
        check(T('keys-capture') + ': clicking a key waits with "Bấm phím mới…" and names the action', r.on.join() === 'Bấm phím mới…' && /Chiêu 1/.test(r.msg) && /Esc/.test(r.msg), JSON.stringify(r));
      }, 250);
      await page.keyboard.press('KeyR');
      let kb = await page.evaluate(async (u) => ({ b: (await import(u)).getBindings().s1, cap: document.querySelector('#ui .kcap[data-act="s1"]').textContent, still: document.querySelectorAll('#ui .kcap.on').length }), KEYS);
      check(T('keys') + ': pressing KeyR in capture binds it to Chiêu 1 and the cell reads "R"', kb.b.join() === 'KeyR' && kb.cap === 'R' && kb.still === 0, JSON.stringify(kb));
      await page.click('#ui .kcap[data-act="fire"][data-slot="0"]');
      await page.keyboard.press('KeyR');
      await shot(page, errs, T('keys-conflict'), async () => {
        const r = await page.evaluate(async (u) => ({ msg: document.querySelector('#ui [data-r="kmsg"]').textContent, btns: [...document.querySelectorAll('#ui [data-r="kmsg"] button')].map((b) => b.textContent), fire: (await import(u)).getBindings().fire }), KEYS);
        check(T('keys-conflict') + ': a used key asks "Hoán đổi" or "Hủy", naming the key and the owner, nothing changed yet', /Phím R đang dùng cho Chiêu 1/.test(r.msg) && r.btns.join() === 'Hoán đổi,Hủy' && r.fire.join() === 'Mouse0', JSON.stringify(r));
      }, 250);
      await page.click('#ui [data-r="kswap"]');
      kb = await page.evaluate(async (u) => ({ b: (await import(u)).getBindings(), caps: Object.fromEntries([...document.querySelectorAll('#ui .kcap')].map((b) => [b.dataset.act + b.dataset.slot, b.textContent])) }), KEYS);
      check(T('keys') + ': Hoán đổi gives fire KeyR and Chiêu 1 the left mouse button, both still shown', kb.b.fire.join() === 'KeyR' && kb.b.s1.join() === 'Mouse0' && kb.caps.fire0 === 'R' && kb.caps.s10 === 'Chuột trái', JSON.stringify(kb));
      await page.click('#ui .kcap[data-act="s2"][data-slot="0"]');
      await page.keyboard.press('Escape');
      kb = await page.evaluate(async (u) => ({ s2: (await import(u)).getBindings().s2, on: document.querySelectorAll('#ui .kcap.on').length, modal: !!document.querySelector('#ui .modal.on'), paused: __G.ui.paused }), KEYS);
      check(T('keys') + ': Esc cancels the capture, keeps E, leaves the dialog open', kb.s2.join() === 'KeyE' && kb.on === 0 && kb.modal && kb.paused === false, JSON.stringify(kb));
      await page.click('#ui .kcap[data-act="s2"][data-slot="0"]');
      await page.keyboard.press('KeyR');
      await page.keyboard.press('Escape');
      kb = await page.evaluate(async (u) => ({ b: (await import(u)).getBindings(), msg: document.querySelectorAll('#ui [data-r="kmsg"] button').length }), KEYS);
      check(T('keys') + ': Esc on the conflict prompt cancels the swap', kb.b.s2.join() === 'KeyE' && kb.b.fire.join() === 'KeyR' && kb.msg === 0, JSON.stringify(kb));
      await page.focus('#ui .kcap[data-act="heal"][data-slot="0"]');
      await page.keyboard.press('Enter');
      await page.keyboard.press('KeyY');
      kb = await page.evaluate(async (u) => ({ heal: (await import(u)).getBindings().heal, act: document.activeElement && document.activeElement.dataset.act }), KEYS);
      check(T('keys') + ': keyboard only: Enter on a cell, then a key; focus returns to that cell', kb.heal.join() === 'KeyY' && kb.act === 'heal', JSON.stringify(kb));
      await page.focus('#ui .kcap[data-act="up"][data-slot="1"]');
      await page.keyboard.press('Enter');
      await page.keyboard.press('KeyJ');
      kb = await page.evaluate(async (u) => (await import(u)).getBindings().up, KEYS);
      check(T('keys') + ': the second movement slot rebinds on its own, WASD slot untouched', kb.join() === 'KeyW,KeyJ', kb.join());
      await page.click('#ui .kcap[data-act="ult"][data-slot="0"]');
      // The waiting cell pulses, which Playwright reads as "not stable" forever; a person can click it, so skip that wait.
      await page.click('#ui .kcap[data-act="ult"][data-slot="0"]', { force: true });
      kb = await page.evaluate(async (u) => (await import(u)).getBindings(), KEYS);
      check(T('keys') + ': a second click on the waiting cell picks the left mouse button, which fire/s1 already own: conflict, nothing lost', kb.ult.join() === 'Space' && kb.s1.join() === 'Mouse0' && (await page.evaluate(() => document.querySelector('#ui [data-r="kmsg"]').textContent)).includes('Chuột trái'), JSON.stringify(kb));
      await page.click('#ui [data-r="kcancel"]');
      // help and the garage kit show the bound keys at once
      await page.click('#ui .modal.on [data-r="close"]');
      await page.click('#ui .tabs [data-tab="info"]');
      const kit = await page.evaluate(() => [...document.querySelectorAll('#ui .detail .sk-ic kbd')].map((k) => k.textContent).join());
      check(T('keys') + ': the garage skill rows show bound keys (fire R, Chiêu 1 Chuột trái, Chiêu 2 E, ult Cách)', kit === 'R,Chuột trái,E,Cách', kit);
      await page.click('#ui [data-r="bHelp"]');
      const help = await page.evaluate(() => [...document.querySelectorAll('#ui .help-cols kbd')].map((k) => k.textContent).join());
      check(T('keys') + ': "Cách chơi" lists the bound keys', help === 'W,A,S,D,Chuột,R,Chuột phải,Chuột trái,E,Cách,Y,Tab,Esc,Enter,Cần trái,Cần phải,RT,LB,RB,LT,X,Start,Back,▲,◀,▶,▼', help);
      await page.click('#ui .modal.on [data-r="close"]');
      await page.click('#ui [data-r="bSet"]'); await page.click('#ui [data-st="keys"]');
      await page.click('#ui [data-r="kreset"]');
      kb = await getB(page);
      check(T('keys') + ': "Về mặc định" restores the table', JSON.stringify(kb) === JSON.stringify(DEF), JSON.stringify(kb));
      await ctx.close();

      // HUD after a rebind: slot labels equal labelFor, pause hint and the pause key follow
      ({ ctx, page, errs } = await open(browser, T('hud-rebound'), vp, false, 'screen=hud&fresh=1&freeze=1&warp=60&mech=soi'));
      await page.evaluate(async (u) => { const K = await import(u); K.bind('s1', 'KeyR'); K.bind('ult', 'KeyV'); K.bind('fire', 'Mouse2', 0, { swap: true }); K.bind('pause', 'KeyP'); }, KEYS);
      await shot(page, errs, T('hud-rebound'), async () => {
        const r = await page.evaluate(async (u) => { const K = await import(u); return { dom: [...document.querySelectorAll('#ui .slot kbd')].map((k) => k.textContent), lab: ['fire', 's1', 's2', 'ult', 'heal'].map(K.labelFor) }; }, KEYS);
        check(T('hud-rebound') + ': slot labels equal labelFor and show the new keys (Chuột phải, R, E, V, F)', r.dom.join() === r.lab.join() && r.dom.join() === 'Chuột phải,R,E,V,F', JSON.stringify(r));
      }, 400);
      await page.evaluate(() => __G.ui.showPause());
      const ph = await page.evaluate(() => document.querySelector('#ui .pause [data-r="hint"]').textContent);
      check(T('hud-rebound') + ': pause hint names the bound key', ph === 'Nhấn P để tiếp tục', ph);
      await page.evaluate(() => __G.ui.hidePause());
      await page.keyboard.press('KeyP');
      const p1 = await page.evaluate(() => __G.ui.paused);
      await page.keyboard.press('Escape');
      const p2 = await page.evaluate(() => __G.ui.paused);
      check(T('hud-rebound') + ': the rebound pause key pauses, Esc still resumes', p1 === true && p2 === false, `${p1}/${p2}`);
      await ctx.close();

      // scoreboard (hold)
      for (const mode of ['tdm', 'nha', 'tudo']) {
        ({ ctx, page, errs } = await open(browser, T('scoreboard-' + mode), vp, false, `screen=hud&mode=${mode}&nha=1&fresh=1&freeze=1&warp=300&mech=soi`));
        const off0 = await page.evaluate(() => getComputedStyle(document.querySelector('#ui .sb')).display);
        await page.keyboard.down('Tab');
        await shot(page, errs, T('scoreboard-' + mode), async () => {
          const r = await page.evaluate(() => ({
            on: document.querySelector('#ui .sb').classList.contains('on'), tables: document.querySelectorAll('#ui .sb .tb').length, rows: document.querySelectorAll('#ui .sb .tb-r').length,
            head: document.querySelector('#ui .sb .tb-h').textContent.replace(/\s+/g, ' '), top: document.querySelector('#ui .sb-h').textContent.replace(/\s+/g, ' '), me: document.querySelectorAll('#ui .sb .tb-r.me').length,
          }));
          const want = { tdm: [2, 6, 'Đấu đội'], nha: [2, 6, 'Thủ nhà'], tudo: [1, 6, 'Hỗn chiến'] }[mode];
          check(T('scoreboard-' + mode) + ': holding Tab shows the overlay with ' + want[0] + ' table(s), 6 players, mode name, my row marked', r.on && r.tables === want[0] && r.rows === want[1] && r.top.includes(want[2]) && r.me === 1 && /Sát thương/.test(r.head) && (mode === 'tudo' ? /Hạ gục/.test(r.head) : /K \/ D \/ A/.test(r.head)), JSON.stringify(r));
          if (mode === 'nha') check(T('scoreboard-nha') + ': shows both teams total tower HP', /Trụ ta [0-9.]+\s*Trụ địch [0-9.]+/.test(r.top), r.top);
        }, 500);
        await page.keyboard.up('Tab');
        await page.waitForTimeout(100);
        const on1 = await page.evaluate(() => document.querySelector('#ui .sb').classList.contains('on'));
        check(T('scoreboard-' + mode) + ': releasing Tab hides it (hidden before: ' + off0 + ')', on1 === false && off0 === 'none');
        if (mode === 'tdm') {
          await page.evaluate(async (u) => (await import(u)).bind('score', 'KeyB'), KEYS);
          await page.keyboard.down('Tab'); await page.waitForTimeout(80);
          const tabOff = await page.evaluate(() => document.querySelector('#ui .sb').classList.contains('on'));
          await page.keyboard.up('Tab'); await page.keyboard.down('KeyB'); await page.waitForTimeout(80);
          const bOn = await page.evaluate(() => document.querySelector('#ui .sb').classList.contains('on'));
          await page.keyboard.up('KeyB');
          check(T('scoreboard') + ': the scoreboard key is rebindable (KeyB shows it, Tab no longer does)', !tabOff && bOn, `${tabOff}/${bOn}`);
        }
        await ctx.close();
      }

      // ----- theme picker and random arena
      ({ ctx, page, errs } = await open(browser, T('menu-themes'), vp, touch, 'screen=menu&fresh=1'));
      const themeNames = ['Theo bố cục', 'Rừng mưa', 'Sa mạc', 'Băng tuyết', 'Núi lửa', 'Phố đổ nát', 'Đầm đêm', 'Rừng thu', 'Hẻm đá đỏ', 'Ngẫu nhiên'];
      const hz = () => page.evaluate(() => [...document.querySelectorAll('#ui .map')].map((b) => b.querySelector('.hz').textContent));
      await page.click('#ui .th[data-th="lava"]');
      await page.evaluate(() => { const o = document.querySelector('#ui .setup .opts'); o.scrollTop = o.scrollHeight; });
      await shot(page, errs, T('menu-themes'), async () => {
        const r = await page.evaluate(() => ({
          tiles: [...document.querySelectorAll('#ui .th')].map((b) => b.querySelector('.th-n').textContent), on: [...document.querySelectorAll('#ui .th.on')].map((b) => b.dataset.th),
          sw: [...document.querySelectorAll('#ui .th .sw')].every((s) => s.querySelector('svg')), maps: [...document.querySelectorAll('#ui .map')].map((b) => b.dataset.map),
          bl: document.querySelector('#ui [data-r="themeBl"]').textContent, play: document.querySelector('#ui .play').getBoundingClientRect().bottom <= innerHeight + 1,
        }));
        check(T('menu-themes') + ': 10 theme tiles (Theo bố cục, 8 themes in order, Ngẫu nhiên) each with a swatch icon; the map list ends with "random"', r.tiles.join() === themeNames.join() && r.sw && r.maps.join() === 'denrung,xuongcat,cangbang,mienglua,random', JSON.stringify(r));
        check(T('menu-themes') + ': chosen theme (lava) is the only one marked and its blurb names the hazard in words', r.on.join() === 'lava' && r.bl === 'Núi lửa: Hồ dung nham đốt cháy ai bước vào.' && r.play, JSON.stringify(r));
      }, 300);
      check(T('menu-themes') + ': every layout shows the hazard of lava, not its own', (await hz()).slice(0, 4).join() === Array(4).fill('Hồ dung nham').join(), (await hz()).join());
      await page.click('#ui .th[data-th="swamp"]');
      check(T('menu-themes') + ': swamp -> Bùn lầy chậm bước on every layout', (await hz()).slice(0, 4).join() === Array(4).fill('Bùn lầy chậm bước').join(), (await hz()).join());
      await page.click('#ui .th[data-th="jungle"]');
      check(T('menu-themes') + ': jungle -> Không có bẫy on every layout', (await hz()).slice(0, 4).join() === Array(4).fill('Không có bẫy').join(), (await hz()).join());
      await page.click('#ui .th[data-th="random"]');
      check(T('menu-themes') + ': random theme -> hazard text says it follows the arena; random layout has its own line', (await hz()).join() === Array(4).fill('Mối nguy đổi theo môi trường').concat('Bố cục bốc thăm mỗi trận').join(), (await hz()).join());
      await page.click('#ui .th[data-th="layout"]');
      check(T('menu-themes') + ': Theo bố cục returns each layout to its own hazard', (await hz()).join() === 'Không có bẫy,Họng lửa phụt,Băng trơn trượt,Hồ dung nham,Bố cục bốc thăm mỗi trận', (await hz()).join());
      await page.click('#ui .play');
      let pl = await page.evaluate(() => ({ p: window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]), s: JSON.parse(localStorage.getItem('dtt.save.v1')) }));
      check(T('menu-themes') + ': ui:play carries theme null for "Theo bố cục", saved as null', pl.p.length === 1 && pl.p[0].theme === null && pl.s.theme === null && pl.p[0].map === 'denrung', JSON.stringify(pl));
      await page.evaluate(() => __G.ui.showMenu());
      await page.click('#ui .map[data-map="random"]'); await page.click('#ui .th[data-th="ice"]');
      await page.click('#ui .play');
      pl = await page.evaluate(() => ({ p: window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]).pop(), s: JSON.parse(localStorage.getItem('dtt.save.v1')), m: __G.match.map.theme, name: document.querySelector('#ui .mm-name').textContent }));
      check(T('menu-themes') + ': ui:play carries map "random" + theme "ice"; meta saves both; the match really uses ice', pl.p.map === 'random' && pl.p.theme === 'ice' && pl.s.map === 'random' && pl.s.theme === 'ice' && pl.m === 'ice', JSON.stringify(pl));
      check(T('menu-themes') + ': the minimap title names the layout and the theme actually used', pl.name === `${await page.evaluate(() => __G.match.map.name)} · Băng tuyết`, pl.name);
      await page.evaluate(() => __G.ui.showMenu());
      const back = await page.evaluate(() => ({ map: document.querySelector('#ui .map.on').dataset.map, th: document.querySelector('#ui .th.on').dataset.th }));
      check(T('menu-themes') + ': the menu reopens on the saved random map and theme', back.map === 'random' && back.th === 'ice', JSON.stringify(back));
      await ctx.close();

      // lobby: host picks the theme, guest sees it read-only
      ({ ctx, page, errs } = await open(browser, T('lobby-theme'), vp, touch, 'screen=lobby&role=host&fill=4&fresh=1'));
      await page.click('#ui .lobby .th[data-k="lava"]');
      await page.click('#ui .lobby .map[data-k="random"]');
      await page.evaluate(() => { const o = document.querySelector('#ui .lb-set .opts'); if (o) o.scrollTop = o.scrollHeight; });
      await shot(page, errs, T('lobby-theme'), async () => {
        const r = await page.evaluate(() => ({ calls: __G.online.calls.filter((c) => c[0] === 'setRoom').map((c) => JSON.stringify(c[1])), L: [__G.online.lobby.theme, __G.online.lobby.map], tiles: document.querySelectorAll('#ui .lb-set .th').length, on: document.querySelector('#ui .lb-set .th.on').dataset.k, mapOn: document.querySelector('#ui .lb-set .map.on').dataset.k }));
        check(T('lobby-theme') + ': host picker has 10 theme tiles and a random map; clicks reach online.setRoom({ theme }) and ({ map: "random" })', r.tiles === 10 && r.calls.join() === '{"theme":"lava"},{"map":"random"}' && r.L.join() === 'lava,random' && r.on === 'lava' && r.mapOn === 'random', JSON.stringify(r));
      }, 300);
      await page.click('#ui .lobby .th[data-k="layout"]');
      check(T('lobby-theme') + ': Theo bố cục sends { theme: null }', await page.evaluate(() => JSON.stringify(__G.online.calls.filter((c) => c[0] === 'setRoom').pop()[1]) === '{"theme":null}' && __G.online.lobby.theme === null));
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('lobby-theme-guest'), vp, touch, 'screen=lobby&role=guest&fill=5&fresh=1'));
      await page.evaluate(() => { __G.online.lobby.theme = 'swamp'; __G.online.lobby.map = 'random'; __G.bus.emit('net:lobby', __G.online.lobby); });
      const gk = await page.evaluate(() => [...document.querySelectorAll('#ui .lb-set .kv')].map((k) => k.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      check(T('lobby-theme-guest') + ': guest sees the room theme read-only ("Đầm đêm") and the random layout', gk === 'Chế độĐấu đội | Đấu trườngNgẫu nhiên | Môi trườngĐầm đêm | Độ khó botVừa | Cỡ đội3 đấu 3' && (await page.evaluate(() => document.querySelectorAll('#ui .lb-set .th').length)) === 0, gk);
      await ctx.close();

      // ----- nha: HUD
      ({ ctx, page, errs } = await open(browser, T('hud-nha'), vp, touch, 'screen=hud&mode=nha&fresh=1&freeze=1&warp=60&mech=soi'));
      const tw = {
        info: () => page.evaluate(() => { const m = __G.match, out = {}; for (const t of m.towers) { const n = document.querySelector(`#ui .tw[data-tw="${t.id}"]`); out[t.id] = { team: t.team, kind: t.kind, state: n && n.dataset.state, hp: n && n.style.getPropertyValue('--hp'), lock: n && getComputedStyle(n.querySelector('.tw-lk')).display }; } return out; }),
        ids: () => page.evaluate(() => ({ mySub: __G.match.towers.filter((t) => t.team === 0 && t.kind === 'sub').map((t) => t.id), foeSub: __G.match.towers.filter((t) => t.team === 1 && t.kind === 'sub').map((t) => t.id), myMain: __G.match.towers.find((t) => t.team === 0 && t.kind === 'main').id, foeMain: __G.match.towers.find((t) => t.team === 1 && t.kind === 'main').id })),
      };
      await page.evaluate(() => { window.__anns = []; const b = document.querySelector('#ui .ann b'); new MutationObserver(() => window.__anns.push(b.textContent)).observe(b, { childList: true, characterData: true, subtree: true }); });
      const ID = await tw.ids();
      await shot(page, errs, T('hud-nha'), async () => {
        const r = await page.evaluate(() => ({
          pips: document.querySelectorAll('#ui .tw').length, mains: document.querySelectorAll('#ui .tw.main').length, subs: document.querySelectorAll('#ui .tw.sub').length, mission: document.querySelector('#ui .mission').textContent,
          clock: document.querySelector('#ui [data-r="clock"]').textContent, bars: document.querySelectorAll('#ui .twb').length, cols: document.querySelectorAll('#ui .pc').length, mm: document.querySelector('#ui .mm-name').textContent,
          kills: document.querySelector('#ui [data-r="k0"]').textContent + ':' + document.querySelector('#ui [data-r="k1"]').textContent,
        }));
        check(T('hud-nha') + ': top bar has 3 pips per team (4 small + 2 big), clock, tower score 0:0, mission from MODES.nha, 6 portrait cards', r.pips === 6 && r.mains === 2 && r.subs === 4 && /^[78]:\d\d$/.test(r.clock) && r.kills === '0:0' && r.mission === MODES.nha.mission && r.cols === 6 && r.bars === 6, JSON.stringify(r));
        check(T('hud-nha') + ': minimap title shows layout and theme', /^Lũy Thép · Rừng mưa$/.test(r.mm), r.mm);
        const info = await tw.info();
        check(T('hud-nha') + ': at the start every sub is up at 100%, both mains are locked with a visible lock', [...ID.mySub, ...ID.foeSub].every((i) => info[i].state === 'up' && info[i].hp === '100%' && info[i].lock === 'none') && [ID.myMain, ID.foeMain].every((i) => info[i].state === 'locked' && info[i].lock !== 'none' && info[i].hp === '100%'), JSON.stringify(info));
      }, 700);
      // forced tower state drives the pips
      await page.evaluate((id) => { const m = __G.match; m.towers[id.mySub[0]].hp = m.towers[id.mySub[0]].maxHp / 2; m.towers[id.foeSub[0]].hp = 0; m.towers[id.foeSub[0]].alive = false; m.towers[id.foeMain].hp = m.towers[id.foeMain].maxHp * 0.75; }, ID);
      await page.waitForTimeout(150);
      let info = await tw.info();
      check(T('hud-nha') + ': pips follow forced hp/alive: my sub at half its HP = 50%, foe sub dead, foe main still locked', info[ID.mySub[0]].hp === '50%' && info[ID.mySub[0]].state === 'up' && info[ID.foeSub[0]].state === 'down' && info[ID.foeMain].state === 'locked' && info[ID.foeMain].hp === '75%' && info[ID.foeSub[1]].state === 'up', JSON.stringify(info));
      await page.evaluate((id) => { const m = __G.match, t = m.towers[id.foeSub[0]]; __G.ui.event({ t: 'towerDown', tower: t.id, team: 1, kind: 'sub', by: 0, x: t.x, z: t.z }); }, ID);
      await page.waitForFunction(() => window.__anns.includes('Trụ phụ của địch đã đổ'), null, { timeout: 4000 }).catch(() => {});
      await page.evaluate((id) => { const m = __G.match, t = m.towers[id.mySub[1]]; __G.ui.event({ t: 'towerHit', tower: t.id, by: 5, x: t.x, z: t.z, amt: 300 }); __G.ui.event({ t: 'towerHit', tower: t.id, by: 5, x: t.x, z: t.z, amt: 300 }); const f = m.towers[id.foeSub[1]]; __G.ui.event({ t: 'towerHit', tower: f.id, by: 0, x: f.x, z: f.z, amt: 212 }); }, ID);
      await page.waitForTimeout(250);
      const hitNow = await page.evaluate((id) => ({ pip: document.querySelector(`#ui .tw[data-tw="${id.mySub[1]}"]`).classList.contains('hit'), num: [...document.querySelectorAll('#ui .fn.dealt')].filter((n) => n.style.display !== 'none').map((n) => n.textContent).join() }), ID);
      check(T('hud-nha') + ': my hit on a tower floats its damage (212); a hit on my sub flashes its pip', hitNow.num === '212' && hitNow.pip === true, JSON.stringify(hitNow));
      await page.waitForFunction(() => window.__anns.includes('Trụ nhà đang bị tấn công'), null, { timeout: 5000 }).catch(() => {});
      const anns1 = await page.evaluate(() => window.__anns.slice());
      check(T('hud-nha') + ': announcements: "Trụ phụ của địch đã đổ" then "Trụ nhà đang bị tấn công", the second sent once for two hits', anns1.includes('Trụ phụ của địch đã đổ') && anns1.filter((x) => x === 'Trụ nhà đang bị tấn công').length === 1, anns1.join(' | '));
      await page.waitForTimeout(600);
      const mm1 = await page.evaluate((id) => {
        const m = __G.match, c = document.querySelector('#ui .mm canvas'), g = c.getContext('2d'), sc = c.width / m.map.w;
        const px = (t) => Array.from(g.getImageData(Math.round((t.x + m.map.hw) * sc), Math.round((t.z + m.map.hd) * sc), 1, 1).data.slice(0, 3));
        return { alive: px(m.towers[id.mySub[0]]), dead: px(m.towers[id.foeSub[0]]) };
      }, ID);
      const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 60;
      check(T('hud-nha') + ': minimap draws a live tower in its team colour and a dead one as a grey rubble mark', near(mm1.alive, [53, 184, 255]) && !near(mm1.dead, [255, 90, 54]) && !near(mm1.dead, [53, 184, 255]), JSON.stringify(mm1));
      await shot(page, errs, T('hud-nha-sub'), null, 500);
      // second foe sub down: the main opens
      await page.evaluate((id) => { const m = __G.match, t = m.towers[id.foeSub[1]]; t.hp = 0; t.alive = false; __G.ui.event({ t: 'towerDown', tower: t.id, team: 1, kind: 'sub', by: 0, x: t.x, z: t.z }); }, ID);
      await page.waitForFunction(() => window.__anns.includes('Trụ chính của địch đã mở'), null, { timeout: 8000 }).catch(() => {});
      info = await tw.info();
      const anns2 = await page.evaluate(() => window.__anns.slice());
      check(T('hud-nha') + ': both foe subs down: foe main is open (lock gone) and "Trụ chính của địch đã mở" is announced', info[ID.foeMain].state === 'up' && info[ID.foeMain].lock === 'none' && info[ID.myMain].state === 'locked' && anns2.includes('Trụ chính của địch đã mở'), JSON.stringify(info[ID.foeMain]) + anns2.join(' | '));
      await shot(page, errs, T('hud-nha-open'), null, 300);
      await page.evaluate((id) => { const m = __G.match; m.score[0] = 2; for (const i of id.mySub) { m.towers[i].hp = 0; m.towers[i].alive = false; } }, ID);
      await page.waitForFunction(() => window.__anns.includes('Trụ chính nhà mình đã mở, về thủ!'), null, { timeout: 9000 }).catch(() => {});
      const anns3 = await page.evaluate(() => ({ a: window.__anns.slice(), k: document.querySelector('#ui [data-r="k0"]').textContent }));
      check(T('hud-nha') + ': my subs down: "Trụ chính nhà mình đã mở, về thủ!" and the score bar reads 2', anns3.a.includes('Trụ chính nhà mình đã mở, về thủ!') && anns3.k === '2', JSON.stringify(anns3));
      await ctx.close();

      // ----- nha: result
      for (const [tag, q, title, trophies, outcome] of [['win', '', 'ĐÃ PHÁ TRỤ CHÍNH', 322, 'win'], ['lose', '&lose=1', 'NHÀ ĐÃ SẬP', 288, 'lose'], ['clock', '&clock=win', 'Thắng khi hết giờ', 322, 'win']]) {
        ({ ctx, page, errs } = await open(browser, T('result-nha-' + tag), vp, touch, `screen=result&mode=nha&fresh=1&trophies=300&warp=100${q}`));
        await shot(page, errs, T('result-nha-' + tag), async () => {
          const r = await page.evaluate(() => ({
            h1: document.querySelector('#ui .rs-banner h1').textContent, banner: document.querySelector('#ui .rs-banner').className, score: document.querySelector('#ui .rs-score').textContent.replace(/\s/g, ''),
            groups: document.querySelectorAll('#ui .rtw').length, towers: [...document.querySelectorAll('#ui .rtw')].map((g) => [...g.querySelectorAll('.rt b')].map((b) => b.textContent).join('/')),
            subMax: __G.match.towers.find((t) => t.kind === 'sub').maxHp, tables: document.querySelectorAll('#ui .rs-tables .tb').length, rows: document.querySelectorAll('#ui .rs-tables .tb-r').length, tr: !!document.querySelector('#ui [data-r="trN"]'), trophies: __G.meta.get().trophies,
          }));
          const sub = String(r.subMax).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
          const wantTowers = { win: ['2.300/Đã đổ/8.800', 'Đã đổ/Đã đổ/Đã đổ'], lose: ['Đã đổ/Đã đổ/Đã đổ', `Đã đổ/${sub}/6.200`], clock: [`3.200/${sub}/9.000`, `${sub}/5.100/7.400`] }[tag];
          check(T('result-nha-' + tag) + `: verdict "${title}", banner ${outcome}, cúp ${trophies}, reward block with trophies, 2 tower groups, 2 tables of 3`, r.h1 === title && r.banner.includes(outcome) && r.groups === 2 && r.tables === 2 && r.rows === 6 && r.tr && r.trophies === trophies, JSON.stringify(r));
          check(T('result-nha-' + tag) + ': final tower HP of both teams is printed', JSON.stringify(r.towers) === JSON.stringify(wantTowers), JSON.stringify(r.towers));
        }, 1700);
        await ctx.close();
      }

      // ----- online: entry screen (fake G.online, see ui-harness.html)
      const calls = (pg) => pg.evaluate(() => __G.online.calls.map((c) => c[0] + (c[1] && c[1].mode ? ':' + c[1].mode : '') + (c[1] && c[1].map ? ':' + c[1].map : '') + (typeof c[1] === 'string' ? ':' + c[1] : '')));
      ({ ctx, page, errs } = await open(browser, T('online'), vp, touch, 'screen=online&fresh=1&listms=1500'));
      check(T('online') + ': room list shows a loading state first', /Đang tìm phòng/.test(await page.textContent('#ui .rm-list')) && (await page.locator('#ui .rm-list .spin').count()) === 1);
      await page.waitForSelector('#ui .rm-list .rm');
      await shot(page, errs, T('online'), async () => {
        const r = await page.evaluate(() => ({
          title: document.querySelector('#ui .online h2').textContent, name: document.querySelector('#ui .online [data-r="name"]').value, ph: document.querySelector('#ui .online [data-r="room"]').placeholder,
          rows: [...document.querySelectorAll('#ui .rm-list .rm')].map((x) => [x.querySelector('.rm-n b').textContent, x.querySelector('.rm-n small').textContent, ...[...x.querySelectorAll(':scope > span')].slice(1).map((s) => s.textContent), x.querySelector('button').textContent, x.querySelector('button').disabled].join('|')),
          menuHidden: !document.querySelector('#ui .menu.on'), wait: !!document.querySelector('#ui .ol-wait.on'), err: !document.querySelector('#ui .online > .ol-err').hidden,
        }));
        check(T('online') + ': title, player name from meta, default room name placeholder', r.title === 'Chơi mạng' && r.name === 'Phi công' && r.ph === 'Phòng của Phi công' && r.menuHidden && !r.wait && !r.err, JSON.stringify(r));
        check(T('online') + ': room list rows: name, host, mode, map, players/max, join (full room disabled)', r.rows.join(' ; ') === 'Phòng của Bão Số 9|Chủ phòng: Bão Số 9|Đấu đội|Đền Rừng|3/6|Vào|false ; Săn trùm cuối tuần|Chủ phòng: Cò Lả|Săn trùm|Miệng Lửa|3/6|Vào|false ; Hỗn chiến chớp nhoáng|Chủ phòng: Mèo Mun|Hỗn chiến|Cảng Băng|6/6|Đầy|true', r.rows.join(' ; '));
      }, 300);
      await page.click('#ui .online [data-r="priv"]');
      check(T('online') + ': private toggle flips', (await page.getAttribute('#ui .online [data-r="priv"]', 'aria-pressed')) === 'true');
      await page.fill('#ui .online [data-r="room"]', 'Phòng thử');
      await page.click('#ui .online [data-r="create"]');
      await page.waitForSelector('#ui .lobby.on');
      let cl = JSON.stringify((await page.evaluate(() => __G.online.calls.find((c) => c[0] === 'host')))[1]);
      check(T('online') + ': Tạo phòng calls host with room name, private flag and player name', cl === '{"name":"Phòng thử","isPrivate":true,"playerName":"Phi công"}', cl);
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('online-states'), vp, touch, 'screen=online&norooms=1'));
      // the loading row is an .rm-empty too: wait for the list to settle
      await page.waitForFunction(() => { const b = document.querySelector('#ui .rm-empty b'); return b && !/Đang tìm/.test(b.textContent); });
      check(T('online') + ': empty list message', /Chưa có phòng nào đang mở/.test(await page.textContent('#ui .rm-list')) && /Hãy tạo phòng mới/.test(await page.textContent('#ui .rm-list')));
      await page.fill('#ui .online [data-r="code"]', '');
      await page.click('#ui .online [data-r="joinCode"]');
      check(T('online') + ': empty code shows an inline hint, no join call', (await page.textContent('#ui .online > .ol-err')) === 'Hãy nhập mã phòng.' && !(await calls(page)).includes('join'));
      await page.fill('#ui .online [data-r="code"]', 'xxxxx');
      check(T('online') + ': code field upper-cases', (await page.inputValue('#ui .online [data-r="code"]')) === 'XXXXX');
      await page.click('#ui .online [data-r="joinCode"]');
      await page.waitForFunction(() => !document.querySelector('#ui .online > .ol-err').hidden && /Không tìm thấy phòng/.test(document.querySelector('#ui .online > .ol-err').textContent));
      await shot(page, errs, T('online-error'), async () => {
        check(T('online') + ': failed join shows online.error inline, form is usable again', (await page.textContent('#ui .online > .ol-err')) === 'Không tìm thấy phòng. Hãy kiểm tra lại mã phòng.' && !(await page.evaluate(() => !!document.querySelector('#ui .ol-wait.on'))));
      }, 200);
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('online-fail'), vp, touch, 'screen=online&listfail=1'));
      // the loading row is an .rm-empty too: wait for the list to settle
      await page.waitForFunction(() => { const b = document.querySelector('#ui .rm-empty b'); return b && !/Đang tìm/.test(b.textContent); });
      check(T('online') + ': list failure message and a working refresh', /Không tải được danh sách phòng/.test(await page.textContent('#ui .rm-list')));
      await page.click('#ui .online [data-r="refresh"]');
      await page.waitForFunction(() => __G.online.calls.filter((c) => c[0] === 'list').length >= 2);
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('online-wait'), vp, touch, 'screen=online&hold=1'));
      await page.click('#ui .online [data-r="create"]');
      await page.waitForSelector('#ui .ol-wait.on');
      await shot(page, errs, T('online-wait'), async () => {
        const w = await page.evaluate(() => ({ h: document.querySelector('#ui .ol-wait h2').textContent, btn: document.querySelector('#ui .ol-wait [data-r="cancel"]').textContent, st: __G.online.state }));
        check(T('online') + ': connecting overlay with a Hủy button', w.h === 'Đang kết nối' && w.btn === 'Hủy' && w.st === 'connecting', JSON.stringify(w));
      }, 300);
      await page.click('#ui .ol-wait [data-r="cancel"]');
      await page.waitForFunction(() => !document.querySelector('#ui .ol-wait.on'));
      check(T('online') + ': cancel calls leave() and returns to the form', (await calls(page)).includes('leave') && (await page.evaluate(() => __G.online.state)) === 'off');
      await page.click('#ui .online [data-r="back"]');
      check(T('online') + ': Quay lại returns to the menu', await page.evaluate(() => !!document.querySelector('#ui .menu.on') && !document.querySelector('#ui .online.on')));
      await ctx.close();

      // ----- online: lobby, host and guest, per mode
      ({ ctx, page, errs } = await open(browser, T('lobby-host'), vp, touch, 'screen=lobby&role=host&fill=4&fresh=1'));
      await shot(page, errs, T('lobby-host'), async () => {
        const r = await page.evaluate(() => ({
          code: document.querySelector('#ui .lb-code b').textContent, cols: document.querySelectorAll('#ui .lb-team').length, seats: document.querySelectorAll('#ui .lb-team .seat').length, bots: document.querySelectorAll('#ui .seat.bot').length,
          botText: [...new Set([...document.querySelectorAll('#ui .seat.bot .st-n')].map((n) => n.textContent))].join(), me: document.querySelectorAll('#ui .seat.me').length, host: document.querySelectorAll('#ui .seat .badge').length,
          imgs: [...document.querySelectorAll('#ui .seat:not(.bot) img')].map((i) => i.src.slice(0, 10)).join(), mine: document.querySelectorAll('#ui .lm').length, sel: document.querySelectorAll('#ui .lm.sel').length,
          swaps: document.querySelectorAll('#ui .seat .btn.mini').length, modes: document.querySelectorAll('#ui .lb-set .mode').length, maps: document.querySelectorAll('#ui .lb-set .map').length, diffs: document.querySelectorAll('#ui .lb-set [data-a="diff"]').length,
          start: !!document.querySelector('#ui .lobby [data-a="start"]'), ready: !!document.querySelector('#ui .lobby [data-a="ready"]'), swapMe: !document.querySelector('#ui .lobby [data-a="swapme"]').disabled,
          calls: __G.online.calls.filter((c) => c[0] === 'setMine').map((c) => JSON.stringify(c[1])),
        }));
        check(T('lobby-host') + ': code K7QX2, two team columns with 3 seats each, empty seats read "Bot"', r.code === 'K7QX2' && r.cols === 2 && r.seats === 6 && r.bots === 2 && r.botText === 'Bot', JSON.stringify(r));
        check(T('lobby-host') + ': one own row, one host badge, 4 portraits, 4 owned mechs with one selected, "Đổi đội" on every player', r.me === 1 && r.host === 1 && r.imgs === 'data:image,data:image,data:image,data:image' && r.mine === 4 && r.sel === 1 && r.swaps === 4, JSON.stringify(r));
        check(T('lobby-host') + ': host controls (every mode, 4 maps, 3 difficulties, Bắt đầu), no Sẵn sàng toggle', r.modes === MODE_ORDER.length && r.maps === 5 && r.diffs === 3 && r.start && !r.ready && r.swapMe, JSON.stringify(r));
        check(T('lobby-host') + ': entering pushes my mech, skin and mods from meta', r.calls.length === 1 && r.calls[0] === '{"mech":"trau","skin":"goc","mods":{"lv":[0,0,0,0,0]}}', r.calls.join());
      });
      await page.click('#ui .lobby [data-a="start"]');
      check(T('lobby-host') + ': Bắt đầu with an unready player shows online.error inline', (await page.textContent('#ui .lobby .lb-act .ol-err')) === 'Còn người chơi chưa sẵn sàng.');
      {
        const sizes = await page.evaluate(() => [...document.querySelectorAll('#ui .lobby [data-a="size"]')].map((b) => b.dataset.k + (b.classList.contains('on') ? '*' : '') + ':' + b.textContent).join());
        check(T('lobby-host') + ': host sees a size selector 1v1 / 2v2 / 3v3 with 3v3 on', sizes === '1:1 đấu 1,2:2 đấu 2,3*:3 đấu 3', sizes);
        await page.click('#ui .lobby [data-a="size"][data-k="1"]');
        const no = await page.evaluate(() => ({ msg: (document.querySelector('#ui .lobby .lb-act .ol-err') || {}).textContent, size: __G.online.lobby.size, n: __G.online.lobby.players.length }));
        check(T('lobby-host') + ': 1v1 with two players on a team is refused inline and nobody is removed', /^Chưa thể chọn 1 đấu 1/.test(no.msg) && no.size === 3 && no.n === 4, JSON.stringify(no));
        await page.click('#ui .lobby [data-a="size"][data-k="2"]');
        const two = await page.evaluate(() => ({ size: __G.online.lobby.size, seats: document.querySelectorAll('#ui .lb-team .seat').length, bots: document.querySelectorAll('#ui .seat.bot').length, on: document.querySelector('#ui .lobby [data-a="size"].on').dataset.k }));
        check(T('lobby-host') + ': 2v2 is taken: two seats a side, no bot seats left with 4 players', two.size === 2 && two.seats === 4 && two.bots === 0 && two.on === '2', JSON.stringify(two));
        await page.click('#ui .lobby [data-a="size"][data-k="3"]');
      }
      await page.click('#ui .lobby .mode[data-k="chiem"]'); await page.click('#ui .lobby .map[data-k="cangbang"]'); await page.click('#ui .lobby .seg [data-k="hard"]');
      await page.click('#ui .lobby .lm[data-k="soi"]'); await page.click('#ui .lobby [data-a="swapme"]'); await page.click('#ui .lobby .seat[data-pid="p2"] [data-a="swap"]');
      const hc = await page.evaluate(() => ({ calls: __G.online.calls.slice(-7).map((c) => c[0] + ':' + JSON.stringify(c[1])), L: __G.online.lobby.mode + ',' + __G.online.lobby.map + ',' + __G.online.lobby.diff, mech: __G.online.lobby.players[0].mech, sel: document.querySelector('#ui .lm.sel b').textContent, teams: __G.online.lobby.players.map((p) => p.team).join('') }));
      check(T('lobby-host') + ': mode, map, difficulty, mech and both swap buttons reach online.*', hc.L === 'chiem,cangbang,hard' && hc.mech === 'soi' && hc.sel === 'Sói Lửa' && hc.teams === '1101', JSON.stringify(hc));
      check(T('lobby-host') + ': a swap into a full team (3 a side) is refused inline', (await page.textContent('#ui .lobby .lb-act .ol-err')) === 'Mỗi đội tối đa 3 người chơi.');
      await page.click('#ui .lobby .mode[data-k="trum"]');
      check(T('lobby-host') + ': Săn trùm with 4 players is refused ("tối đa 3"), the lobby stays as it was', (await page.textContent('#ui .lobby .lb-act .ol-err')) === 'Chế độ Săn trùm tối đa 3 người chơi.' && await page.evaluate(() => !document.querySelector('#ui .bossbox') && __G.online.lobby.mode === 'chiem'));
      await page.click('#ui .lobby [data-a="leave"]');
      check(T('lobby-host') + ': Rời phòng calls leave() and shows the menu', (await calls(page)).includes('leave') && await page.evaluate(() => !!document.querySelector('#ui .menu.on') && !document.querySelector('#ui .lobby.on')));
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('lobby-guest'), vp, touch, 'screen=lobby&role=guest&fill=5&fresh=1'));
      await shot(page, errs, T('lobby-guest'), async () => {
        const r = await page.evaluate(() => ({
          start: !!document.querySelector('#ui .lobby [data-a="start"]'), ready: !!document.querySelector('#ui .lobby [data-a="ready"]'), modes: document.querySelectorAll('#ui .lb-set .mode').length, swaps: document.querySelectorAll('#ui .seat .btn.mini').length,
          kv: [...document.querySelectorAll('#ui .lb-set .kv b')].map((b) => b.textContent).join(), me: document.querySelector('#ui .seat.me .st-n > span').textContent,
        }));
        check(T('lobby-guest') + ': guest has Sẵn sàng, read-only settings, no Bắt đầu, no per-player swap', !r.start && r.ready && r.modes === 0 && r.swaps === 0 && r.kv === 'Đấu đội,Đền Rừng,Theo bố cục,Vừa,3 đấu 3' && r.me === 'Phi công', JSON.stringify(r));
      });
      await page.click('#ui .lobby [data-a="ready"]');
      check(T('lobby-guest') + ': Sẵn sàng toggles my ready flag (true -> false)', (await page.evaluate(() => __G.online.lobby.players[1].ready)) === false && (await page.getAttribute('#ui .lobby [data-a="ready"]', 'aria-pressed')) === 'false');
      await page.click('#ui .lobby [data-a="swapme"]');
      check(T('lobby-guest') + ': Đổi đội asks online.swapTeam(online.me)', (await calls(page)).includes('swapTeam:p1'), (await calls(page)).join());
      await ctx.close();

      for (const [mode, tag, seats, extra] of [['tudo', 'tudo', 6, 'one list'], ['trum', 'trum', 3, 'one team + boss']]) {
        ({ ctx, page, errs } = await open(browser, T('lobby-' + tag), vp, touch, `screen=lobby&role=guest&fill=${mode === 'tudo' ? 5 : 3}&rmode=${mode}&fresh=1`));
        await shot(page, errs, T('lobby-' + tag), async () => {
          const r = await page.evaluate(() => ({ teams: document.querySelectorAll('#ui .lb-team').length, seats: document.querySelectorAll('#ui .lb-team .seat').length, boss: !!document.querySelector('#ui .bossbox'), swap: document.querySelector('#ui .lobby [data-a="swapme"]').disabled, head: document.querySelector('#ui .lb-th b').textContent }));
          if (mode === 'tudo') check(T('lobby-tudo') + ': Hỗn chiến is one list of 6 seats, Đổi đội disabled', r.teams === 1 && r.seats === 6 && r.head === 'Hỗn chiến' && r.swap, JSON.stringify(r));
          else check(T('lobby-trum') + ': Săn trùm is one team of 3 seats plus the boss card, Đổi đội disabled', r.teams === 2 && r.seats === 3 && r.boss && r.swap, JSON.stringify(r));
        });
        await ctx.close();
      }

      // the lobby follows net:state: losing the room closes it, going to playing hides it
      ({ ctx, page, errs } = await open(browser, T('lobby-lost'), vp, touch, 'screen=lobby&role=guest&fill=3&fresh=1'));
      await page.evaluate(() => { __G.online.error = 'Chủ phòng đã rời đi.'; __G.online.state = 'off'; __G.bus.emit('net:state', { state: 'off', role: null }); });
      check(T('lobby-lost') + ': net:state off closes the lobby, shows the menu and the reason', await page.evaluate(() => !document.querySelector('#ui .lobby.on') && !!document.querySelector('#ui .menu.on') && document.querySelector('#ui .toast').textContent === 'Chủ phòng đã rời đi.'));
      await page.evaluate(() => { __G.online.seed('guest', 3, 'tdm'); __G.ui.showLobby(); });
      check(T('lobby-lost') + ': showLobby() reopens it from the model', await page.evaluate(() => !!document.querySelector('#ui .lobby.on') && document.querySelectorAll('#ui .seat:not(.bot)').length === 3));
      await page.evaluate(() => { __G.online.state = 'playing'; __G.bus.emit('net:state', { state: 'playing', role: 'guest' }); });
      check(T('lobby-lost') + ': net:state playing closes the lobby', await page.evaluate(() => !document.querySelector('#ui .lobby.on')));
      await page.evaluate(() => { __G.ui.hideLobby(); __G.online.state = 'off'; __G.ui.showLobby(); });
      check(T('lobby-lost') + ': showLobby() with no room falls back to the menu', await page.evaluate(() => !!document.querySelector('#ui .menu.on') && !document.querySelector('#ui .lobby.on')));
      await ctx.close();

      // ----- online match: pause without pausing, result without "Đấu tiếp"
      ({ ctx, page, errs } = await open(browser, T('pause-online'), vp, touch, 'screen=pause&onl=1&mech=ung'));
      await shot(page, errs, T('pause-online'), async () => {
        const r = await page.evaluate(() => ({ t: document.querySelector('#ui .pause').textContent, paused: __G.ui.paused, quit: document.querySelector('#ui .pause [data-r="quit"]').textContent, ev: (window.__log || []).filter((l) => l[0] === 'ui:pause').map((l) => l[1].paused) }));
        check(T('pause-online') + ': menu says "Rời trận", ui:pause is never emitted, the match keeps running', r.quit === 'Rời trận' && r.paused === true && r.ev.length === 0 && !/Về sảnh/.test(r.t), JSON.stringify(r));
      }, 400);
      const tk = await page.evaluate(() => __G.match.tick); await page.waitForTimeout(500);
      check(T('pause-online') + ': simulation ticks on while the menu is open', (await page.evaluate(() => __G.match.tick)) > tk);
      await page.click('#ui .pause [data-r="resume"]');
      check(T('pause-online') + ': Tiếp tục closes it quietly', await page.evaluate(() => !document.querySelector('#ui .pause.on') && (window.__log || []).filter((l) => l[0] === 'ui:pause').length === 0));
      await page.evaluate(() => __G.ui.showPause()); await page.click('#ui .pause [data-r="quit"]');
      check(T('pause-online') + ': Rời trận emits ui:menu', await page.evaluate(() => (window.__log || []).some((l) => l[0] === 'ui:menu')));
      await ctx.close();

      // ----- network readout: guest and host fixtures, clear of the other HUD parts, three ways to toggle
      const NET_GUEST = { role: 'guest', transport: 'WebSocket (TCP/TLS) qua Unity Relay', region: 'asia-southeast1', hostRelayMs: 29, myRelayMs: 61, bestRegion: { region: 'asia-east1', ms: 38 }, rtt: 96, rttMax: 412, jitter: 38, snapRate: 30, lost: 0, late: 2, age: 17, gaps: 3, gapMax: 430, delay: 95, buffer: 2, behind: 0, ahead: 0, fixes: 0.4, fixMax: 0.12, down: 101, up: 9 };
      const NET_HOST = { role: 'host', transport: 'fakenet (BroadcastChannel)', region: '', hostRelayMs: 29, myRelayMs: 29, bestRegion: null, guests: [{ name: 'Bão Số 9', rtt: 96, relayMs: 61, queue: 1, guessed: 12 }, { name: 'Cò Lả', rtt: 340, relayMs: null, queue: 3, guessed: NaN }] };
      const netBoxes = () => page.evaluate(() => {
        const r = (s) => [...document.querySelectorAll(s)].filter((n) => n.offsetParent || getComputedStyle(n).position === 'fixed').map((n) => { const b = n.getBoundingClientRect(); return { s, l: b.left, t: b.top, r: b.right, b: b.bottom }; }).filter((b) => b.r > b.l && b.b > b.t);
        const n = document.querySelector('#ui .netro');
        const nb = n && !n.hidden ? n.getBoundingClientRect() : null;
        const others = [...r('#ui .mm'), ...r('#ui .slots .slot'), ...r('#ui .top-bar'), ...r('#ui .sc'), ...r('#ui .hpb'), ...r('#ui .pausebtn'), ...r('#touch .tc-ctl')];
        const hit = nb ? others.filter((o) => o.l < nb.right && o.r > nb.left && o.t < nb.bottom && o.b > nb.top).map((o) => o.s) : [];
        return { shown: !!nb, lines: n ? [...n.children].map((c) => c.textContent) : [], hit, touch: others.filter((o) => o.s.startsWith('#touch')).length, pe: n ? getComputedStyle(n).pointerEvents : '', box: nb && [nb.left, nb.top, nb.right, nb.bottom].map(Math.round) };
      });
      let net;
      ({ ctx, page, errs } = await open(browser, T('net-off'), vp, touch, 'screen=hud&onl=1&fresh=1&freeze=1&warp=60&mech=ung'));
      await page.evaluate((f) => { window.__net = f; }, NET_GUEST);
      await shot(page, errs, T('net-off'), async () => {
        await page.waitForTimeout(500);
        net = await netBoxes();
        check(T('net-off') + ': readout is off by default: nothing shown, no timer, no lines', !net.shown && net.lines.length === 0 && !(await page.evaluate(() => __G.ui.netReadout())), JSON.stringify(net));
      }, 300);
      await page.evaluate(() => __G.ui.netReadout(true));
      await page.waitForTimeout(600);
      net = await netBoxes();
      const L = net.lines.join('\n');
      check(T('net-guest') + ': guest block has the nine lines with their values', net.shown && net.lines.length === 10 && /^MẠNG · khách · asia-southeast1/.test(L) && /WebSocket \(TCP\/TLS\) qua Unity Relay/.test(L) && /RTT tới chủ phòng\s+96 ms \(xấu nhất 412\)/.test(L) && /bạn 61 ms · chủ phòng 29 ms/.test(L) && /Region gần bạn hơn: asia-east1 38 ms/.test(L) && /Jitter 38 ms · snapshot 30\/s · mất 0 · trễ 2/.test(L) && /17 ms trước · khựng 3 lần, dài nhất 430 ms/.test(L) && /2 snapshot · vẽ trễ 95 ms · đang đuổi 0 ms · đoán trước 0 ms/.test(L) && /0,4 lần\/s · lớn nhất 0,12 m/.test(L) && /↓ 101 kbit\/s · ↑ 9 kbit\/s/.test(L), L);
      check(T('net-guest') + ': clear of minimap, skill bar, score bar, pause button and touch sticks; pointer-events none', net.hit.length === 0 && net.pe === 'none' && (!touch || net.touch >= 5), JSON.stringify({ hit: net.hit, pe: net.pe, touch: net.touch, box: net.box }));
      const colors = await page.evaluate(() => [...document.querySelectorAll('#ui .netro span')].map((s) => s.className + ':' + s.textContent));
      check(T('net-guest') + ': worst RTT and longest gap are red, a fine RTT is not coloured', colors.includes('bad:430 ms') && colors.includes('warn:412') === false && colors.includes('bad:412') && !colors.some((c) => c === 'warn:96 ms' || c === 'bad:96 ms'), colors.join('|'));
      if (ctxName === 'desktop') await page.screenshot({ path: OUT + '/net-readout-guest.png' });
      if (ctxName === 'phone') await page.screenshot({ path: OUT + '/net-readout-phone.png' });
      await page.evaluate((f) => { window.__net = f; }, { ...NET_GUEST, rtt: null, jitter: NaN, bestRegion: null, behind: 140, gapMax: 200 });
      await page.waitForTimeout(500);
      net = await netBoxes();
      check(T('net-guest') + ': a missing or NaN number prints – and the next sample repaints within 0.5 s; behind > 100 is amber, no best-region line', /RTT tới chủ phòng\s+– ms/.test(net.lines.join('\n')) && /Jitter – ms/.test(net.lines.join('\n')) && net.lines.length === 9 && (await page.evaluate(() => [...document.querySelectorAll('#ui .netro span')].map((s) => s.className + ':' + s.textContent))).join('|').includes('warn:140 ms'), net.lines.join('\n'));
      await page.evaluate((f) => { window.__net = f; }, NET_HOST);
      await page.waitForTimeout(500);
      net = await netBoxes();
      const LH = net.lines.join('\n');
      check(T('net-host') + ': host block: header, transport, relay RTT, one line per guest, NaN as –', net.shown && /^MẠNG · chủ phòng\n/.test(LH) && /fakenet \(BroadcastChannel\)/.test(LH) && /RTT tới relay\s+29 ms/.test(LH) && /Bão Số 9\s+RTT 96 ms · tới relay 61 ms · hàng đợi input 1 · đoán 12 tick/.test(LH) && /Cò Lả\s+RTT 340 ms · tới relay – ms · hàng đợi input 3 · đoán – tick/.test(LH) && net.lines.length === 5 && net.hit.length === 0, JSON.stringify({ L: LH, hit: net.hit }));
      if (ctxName === 'desktop') await page.screenshot({ path: OUT + '/net-readout-host.png' });
      // key toggle: F8 off, F8 on; the choice is stored in the settings
      await page.keyboard.press('F8'); await page.waitForTimeout(150);
      let ns = await page.evaluate(() => ({ on: __G.ui.netReadout(), shown: !!document.querySelector('#ui .netro:not([hidden])'), saved: __G.meta.get().settings.netReadout, stored: JSON.parse(localStorage.getItem('dtt.save.v1')).settings.netReadout }));
      check(T('net-key') + ': F8 turns the readout off, and the overlay is gone (hidden, not just empty)', !ns.on && !ns.shown && ns.saved === false && ns.stored === false, JSON.stringify(ns));
      await page.keyboard.press('F8'); await page.waitForTimeout(350);
      ns = await page.evaluate(() => ({ on: __G.ui.netReadout(), shown: !!document.querySelector('#ui .netro:not([hidden])'), stored: JSON.parse(localStorage.getItem('dtt.save.v1')).settings.netReadout }));
      check(T('net-key') + ': F8 turns it on again and the state is saved', ns.on && ns.shown && ns.stored === true, JSON.stringify(ns));
      // pause menu: summary line and the toggle button
      await page.evaluate(() => __G.ui.showPause()); await page.waitForTimeout(400);
      let pm = await page.evaluate(() => ({ line: document.querySelector('#ui .pause [data-r="netLine"]').textContent, btn: document.querySelector('#ui .pause [data-r="netBtn"]').textContent, vis: !document.querySelector('#ui .pause [data-r="netBtn"]').hidden }));
      check(T('net-pause') + ': online pause menu shows the one-line summary and the button reads "bật"', pm.vis && /^Mạng: chủ phòng · RTT tới relay 29 ms · 2 khách$/.test(pm.line) && pm.btn === 'Thông số mạng: bật', JSON.stringify(pm));
      await page.evaluate((f) => { window.__net = f; }, NET_GUEST);
      await page.waitForTimeout(400);
      if (ctxName === 'phone') await page.screenshot({ path: OUT + '/net-readout-phone-pause.png' });
      pm = await page.evaluate(() => document.querySelector('#ui .pause [data-r="netLine"]').textContent);
      check(T('net-pause') + ': guest summary follows the numbers', pm === 'Mạng: RTT 96 ms · jitter 38 ms · khựng 3 lần/10 s', pm);
      await page.click('#ui .pause [data-r="netBtn"]');
      ns = await page.evaluate(() => ({ on: __G.ui.netReadout(), btn: document.querySelector('#ui .pause [data-r="netBtn"]').textContent, shown: !!document.querySelector('#ui .netro:not([hidden])') }));
      check(T('net-pause') + ': the pause button switches it off and says "tắt"', !ns.on && ns.btn === 'Thông số mạng: tắt' && !ns.shown, JSON.stringify(ns));
      await page.click('#ui .pause [data-r="resume"]');
      // settings row
      await page.evaluate(() => { document.querySelector('#ui .pause'); });
      ns = await page.evaluate(() => { const b = [...document.querySelectorAll('#ui .modal .tog')].find((x) => /Hiện thông số mạng \(co-op\)/.test(x.textContent)); b.click(); return { has: !!b, on: __G.ui.netReadout(), pressed: b.getAttribute('aria-pressed') }; });
      check(T('net-settings') + ': settings row "Hiện thông số mạng (co-op)" toggles the same flag', ns.has && ns.on && ns.pressed === 'true', JSON.stringify(ns));
      await page.evaluate(() => __G.ui.netReadout(false));
      await ctx.close();
      // outside an online match: nothing is drawn even when on; the pause menu has no network lines
      ({ ctx, page, errs } = await open(browser, T('net-solo'), vp, touch, 'screen=pause&fresh=1&mech=ung'));
      await page.evaluate((f) => { window.__net = f; __G.ui.netReadout(true); }, NET_GUEST);
      await page.waitForTimeout(500);
      net = await netBoxes();
      const hid = await page.evaluate(() => document.querySelector('#ui .pause [data-r="netBtn"]').hidden && document.querySelector('#ui .pause [data-r="netLine"]').hidden);
      check(T('net-solo') + ': a solo match shows no overlay and no network lines in the pause menu', !net.shown && hid, JSON.stringify({ net, hid }));
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('result-online'), vp, touch, 'screen=result&onl=1&fresh=1&mech=soi'));
      await shot(page, errs, T('result-online'), async () => {
        const b = await page.evaluate(() => [...document.querySelectorAll('#ui .rs-btns button')].map((x) => x.textContent));
        check(T('result-online') + ': only "Về phòng", no "Đấu tiếp"', b.join('|') === 'Về phòng', b.join('|'));
      }, 1800);
      await page.click('#ui .rs-btns [data-r="lobby"]');
      check(T('result-online') + ': Về phòng emits ui:menu', await page.evaluate(() => (window.__log || []).some((l) => l[0] === 'ui:menu')));
      await ctx.close();

      // ----- icon sheet
      if (ctxName === 'desktop') {
        ({ ctx, page, errs } = await open(browser, 'icons', vp, false, 'screen=icons'));
        await shot(page, errs, 'icons', null, 300, true);
        await ctx.close();
      }
    }

    // ----- touch controls (phone only)
    {
      // The thumb controls are tested in tools/touch-test.js; here only what this UI has to do around them.
      const { ctx, page, errs } = await open(browser, 'touch', { width: 780, height: 360 }, true, 'screen=hud&mech=ung&manual=1&auto=0');
      await page.waitForTimeout(500);
      const t0 = await page.evaluate(() => ({ touch: __G.input.touch, on: !!document.getElementById('touch') && document.getElementById('touch').classList.contains('on'), ctl: [...document.querySelectorAll('#touch .tc-ctl')].filter((b) => b.getBoundingClientRect().width > 20).length, slots: getComputedStyle(document.querySelector('#ui .slots')).display, set: getComputedStyle(document.querySelector('#ui .setbtn')).display }));
      check('touch: thumb controls show, the keyboard skill bar is hidden, the settings button is there', t0.touch && t0.on && t0.ctl >= 5 && t0.slots === 'none' && t0.set === 'block', JSON.stringify(t0));
      await shot(page, errs, 'phone-touch', null, 200, true);
      await ctx.close();
    }

    // ----- portrait rotate hint
    {
      const { ctx, page, errs } = await open(browser, 'portrait', { width: 360, height: 780 }, true, 'screen=menu');
      await shot(page, errs, 'phone-portrait', async () => {
        const v = await page.evaluate(() => { const r = document.querySelector('#ui .rotate'); return getComputedStyle(r).display + '|' + r.textContent; });
        check('portrait: "Xoay ngang màn hình" overlay shown', /^flex\|.*Xoay ngang màn hình/.test(v), v);
      }, 300, true);
      await ctx.close();
    }

    // ----- desktop input mapping
    {
      const { ctx, page, errs } = await open(browser, 'input', { width: 1280, height: 720 }, false, 'screen=hud&manual=1&auto=0&mech=soi');
      await page.mouse.move(900, 200);
      await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyQ');
      await page.mouse.down();
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => { const u = __G.match.units[0]; const i = __G.input.sample(u); const g = __G.groundAt(900, 200); return { i, g, ux: u.x, uz: u.z }; });
      const want = Math.atan2(r.g[1] - r.uz, r.g[0] - r.ux);
      check('input: W+D = up-right (-z,+x), mouse aim and ground point, fire, Q', r.i.mx > 0.6 && r.i.mz < -0.6 && Math.abs(r.i.aim - want) < 1e-6 && r.i.tx === r.g[0] && r.i.tz === r.g[1] && r.i.fire && r.i.s1 && !r.i.s2, JSON.stringify(r));
      await page.mouse.up(); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyQ');
      await page.keyboard.down('Space'); await page.keyboard.down('KeyF');
      const k = await page.evaluate(() => { const i = __G.input.sample(__G.match.units[0]); return { ult: i.ult, heal: i.heal, fire: i.fire, mx: i.mx }; });
      await page.keyboard.up('Space'); await page.keyboard.up('KeyF');
      check('input: Space = ult, F = heal, released keys clear', k.ult && k.heal && !k.fire && k.mx === 0, JSON.stringify(k));
      const sc = await page.evaluate(() => {
        __G.input.script({ mx: 1, mz: 0, aim: 0, fire: true, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 });
        const a = __G.input.sample(__G.match.units[0]).mx;
        __G.input.script((m, u) => ({ mx: 0, mz: 1, aim: u.id, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 }));
        const b = __G.input.sample(__G.match.units[0]).mz;
        __G.input.script(null);
        return [a, b, __G.input.sample(__G.match.units[0]).mx];
      });
      check('input: script() with object, function and null', sc[0] === 1 && sc[1] === 1 && sc[2] === 0, sc.join(','));
      const noTouch = await page.evaluate(() => !document.getElementById('touch') && __G.input.touch === false);
      check('input: no touch layer on desktop', noTouch);
      await ctx.close();
    }

    // ----- gamepad: a fake pad drives the same sample() the real one does
    {
      const { ctx, page, errs } = await open(browser, 'pad', { width: 1280, height: 720 }, false, 'screen=hud&manual=1&auto=0&fresh=1&mech=soi');
      await page.evaluate(() => {
        const mk = () => ({ pressed: false, value: 0 });
        window.__pad = { id: 'fake', index: 1, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, mk),
          vibrationActuator: { type: 'dual-rumble', playEffect(type, o) { (window.__rumbles = window.__rumbles || []).push([type, o.duration, o.strongMagnitude]); return Promise.resolve(); } } };
        // The first slot is empty on purpose: navigator.getGamepads() has holes.
        __G.input.setPadSource(() => [null, window.__pad]);
        window.__ax = (a) => { window.__pad.axes = a; };
        window.__bt = (i, v) => { window.__pad.buttons[i] = { pressed: v > 0.5, value: v }; };
        window.__off = () => { window.__pad.axes = [0, 0, 0, 0]; window.__pad.buttons = Array.from({ length: 17 }, mk); };
        window.__smp = () => { const u = __G.match.units[0]; const i = __G.input.sample(u); return { ...i, ux: u.x, uz: u.z }; };
      });
      const S = async (axes, btn) => page.evaluate(([a, b]) => { __off(); __ax(a); for (const k in b) __bt(+k, b[k]); return __smp(); }, [axes, btn || {}]);
      const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
      let r = await S([0, 0, 0, 0]);
      check('pad: resting sticks give no move, no fire', r.mx === 0 && r.mz === 0 && !r.fire && !r.s1 && !r.ult, JSON.stringify(r));
      r = await S([1, 0, 0, 0]);
      check('pad: left stick (1, 0) gives mx = 1, mz = 0', near(r.mx, 1) && near(r.mz, 0) && !r.fire, JSON.stringify(r));
      r = await S([0, -1, 0, 0]);
      check('pad: left stick up (0, -1) gives mz = -1', near(r.mz, -1) && near(r.mx, 0), JSON.stringify(r));
      r = await S([0.1, 0.1, 0, 0]);
      check('pad: left stick inside the 0.18 dead zone gives exactly 0', r.mx === 0 && r.mz === 0, JSON.stringify(r));
      r = await S([0.3, 0, 0, 0]);
      check('pad: dead zone is rescaled, 0.3 reads (0.3 - 0.18) / 0.82 = 0.146', near(r.mx, 0.12 / 0.82, 1e-9), JSON.stringify(r));
      r = await S([0.8, 0.8, 0, 0]);
      check('pad: a diagonal push is clamped to length 1 (0.707, 0.707)', near(r.mx, Math.SQRT1_2, 1e-9) && near(r.mz, Math.SQRT1_2, 1e-9), JSON.stringify(r));
      r = await S([0, 0, 0, -1]);
      check('pad: right stick up fires, aims -90 degrees, target 14 m ahead', r.fire && near(r.aim, -Math.PI / 2) && near(r.tx, r.ux, 1e-6) && near(r.tz, r.uz - 14, 1e-6), JSON.stringify(r));
      r = await S([0, 0, 1, 0]);
      check('pad: right stick right fires, aim 0, target ux + 14', r.fire && near(r.aim, 0) && near(r.tx, r.ux + 14, 1e-6) && near(r.tz, r.uz, 1e-6), JSON.stringify(r));
      r = await S([0, 0, 0.3, 0]);
      check('pad: right stick at 15% aims (target ux + 2.05) but does not fire', !r.fire && near(r.aim, 0) && near(r.tx, r.ux + 14 * 0.12 / 0.82, 1e-9), JSON.stringify(r));
      r = await S([0, 0, 0.45, 0]);
      const below = !r.fire;
      r = await S([0, 0, 0.5, 0]);
      check('pad: fire starts above 35% deflection (raw 0.45 = 33% no, raw 0.5 = 39% yes)', below && r.fire, below + '/' + JSON.stringify(r));
      r = await S([0, 0, 0.1, 0.1]);
      check('pad: right stick in the dead zone keeps the last aim (target 8 m ahead of it) and holds fire', !r.fire && near(r.aim, 0) && near(r.tx, r.ux + 8, 1e-6), JSON.stringify(r));
      const flags = async (btn) => { const x = await S([0, 0, 0, 0], btn); return [x.fire, x.s1, x.s2, x.ult, x.heal].join(); };
      check('pad: RT fires', (await flags({ 7: 0.8 })) === 'true,false,false,false,false');
      check('pad: LB is skill 1, RB is skill 2', (await flags({ 4: 1 })) === 'false,true,false,false,false' && (await flags({ 5: 1 })) === 'false,false,true,false,false');
      check('pad: LT and A are the ultimate, a half-pulled LT (0.3) is not', (await flags({ 6: 0.9 })) === 'false,false,false,true,false' && (await flags({ 0: 1 })) === 'false,false,false,true,false' && (await flags({ 6: 0.3 })) === 'false,false,false,false,false');
      check('pad: X uses the heal item', (await flags({ 2: 1 })) === 'false,false,false,false,true');

      // hints follow the device that was used last
      await S([0, 0, 0, 0], { 4: 1 });
      await page.waitForTimeout(250);
      const padKeys = await page.evaluate(() => ({ dev: __G.input.device(), k: [...document.querySelectorAll('#ui .slot kbd')].map((k) => k.textContent).join() }));
      check('pad: after pad input the HUD hints read RT, LB, RB, LT, X', padKeys.dev === 'pad' && padKeys.k === 'RT,LB,RB,LT,X', JSON.stringify(padKeys));
      await shot(page, errs, 'pad-hud', null, 200);
      await page.evaluate(() => __off());
      await page.keyboard.press('KeyW');
      await page.waitForTimeout(250);
      const kbKeys = await page.evaluate(() => ({ dev: __G.input.device(), k: [...document.querySelectorAll('#ui .slot kbd')].map((k) => k.textContent).join() }));
      check('pad: a key press switches the hints back to Chuột trái, Q, E, Cách, F', kbKeys.dev === 'kb' && kbKeys.k === 'Chuột trái,Q,E,Cách,F', JSON.stringify(kbKeys));
      await page.evaluate(() => __bt(2, 1));
      await page.waitForTimeout(100);
      await page.evaluate(() => __off());
      await page.mouse.move(400, 300); await page.mouse.move(420, 320);
      await page.waitForTimeout(250);
      check('pad: mouse movement also switches back to the keyboard hints', (await page.evaluate(() => __G.input.device())) === 'kb' && (await page.evaluate(() => document.querySelector('#ui .slot kbd').textContent)) === 'Chuột trái');

      // Start pauses and resumes (polled even while paused), Back holds the scoreboard
      await page.evaluate(() => __bt(9, 1));
      await page.waitForTimeout(200);
      let st = await page.evaluate(() => ({ paused: __G.ui.paused, hint: document.querySelector('#ui .pause [data-r="hint"]').textContent }));
      check('pad: Start pauses and the pause hint names Start', st.paused === true && st.hint === 'Nhấn Start để tiếp tục', JSON.stringify(st));
      await page.evaluate(() => __off()); await page.waitForTimeout(100);
      await page.evaluate(() => __bt(9, 1)); await page.waitForTimeout(200);
      check('pad: a second Start press resumes', (await page.evaluate(() => __G.ui.paused)) === false);
      await page.evaluate(() => __off()); await page.waitForTimeout(100);
      await page.evaluate(() => __bt(8, 1)); await page.waitForTimeout(250);
      const sbOn = await page.evaluate(() => document.querySelector('#ui .sb').classList.contains('on'));
      await page.evaluate(() => __off()); await page.waitForTimeout(250);
      const sbOff = await page.evaluate(() => document.querySelector('#ui .sb').classList.contains('on'));
      check('pad: holding Back shows the scoreboard, letting go hides it', sbOn && !sbOff, `${sbOn}/${sbOff}`);

      // rumble: only on a big hit and on death, only with the pad as the last device, setting respected, no actuator is fine
      await page.evaluate(() => { __bt(2, 1); __smp(); __off(); window.__rumbles = []; });
      const hit = (amt) => page.evaluate((a) => { __G.ui.event({ t: 'hit', id: 0, by: 1, amt: a, absorbed: 0, x: 0, z: 0 }); return window.__rumbles.length; }, amt);
      check('pad: a 300 hit rumbles, a 100 hit does not', (await hit(300)) === 1 && (await hit(100)) === 1);
      await page.evaluate(() => { __G.ui.event({ t: 'death', id: 0, by: 1, assists: [], x: 0, z: 0 }); });
      const rum = await page.evaluate(() => window.__rumbles);
      check('pad: death rumbles for 500 ms at full strength', rum.length === 2 && rum[1][1] === 500 && rum[1][2] === 1 && rum[0][0] === 'dual-rumble', JSON.stringify(rum));
      await page.evaluate(() => { __G.meta.get().settings.rumble = false; });
      check('pad: the Rung tay cầm setting off silences it', (await hit(400)) === 2);
      await page.evaluate(() => { __G.meta.get().settings.rumble = true; });
      await page.keyboard.press('KeyW');
      check('pad: with the keyboard as last device nothing rumbles', (await hit(400)) === 2);
      const noAct = await page.evaluate(() => { __G.input.setPadSource(() => [{ connected: true, mapping: 'standard', axes: [0.9, 0, 0, 0], buttons: [] }]); const i = __smp(); const r = __G.input.rumble('hit'); return { mx: i.mx, r, dev: __G.input.device() }; });
      check('pad: a pad without vibrationActuator still plays (mx 0.88) and rumble() just says false', noAct.dev === 'pad' && noAct.r === false && near(noAct.mx, (0.9 - 0.18) / 0.82, 1e-9), JSON.stringify(noAct));
      const gone = await page.evaluate(() => { __G.input.setPadSource(() => { throw new Error('no pads'); }); const i = __smp(); return i.mx; });
      check('pad: a throwing pad source is ignored', gone === 0);

      // d-pad sends quick phrases in an online match
      await page.evaluate(() => { __G.online.state = 'playing'; __G.input.setPadSource(() => [window.__pad]); __off(); __bt(12, 1); });
      await page.waitForTimeout(200);
      await page.evaluate(() => { __off(); });
      await page.waitForTimeout(100);
      await page.evaluate(() => { __bt(14, 1); });
      await page.waitForTimeout(200);
      await page.evaluate(() => __off());
      const says = await page.evaluate(() => ({ calls: __G.online.calls.filter((c) => c[0] === 'say').map((c) => c[1]), lines: [...document.querySelectorAll('#ui .in-match .cl span')].map((n) => n.textContent), hint: getComputedStyle(document.querySelector('#ui .in-match .cl-pad')).display }));
      check('pad: d-pad up and left send "Đẩy trụ!" and "Về thủ!" and both show in the match log', says.calls.join('|') === 'Đẩy trụ!|Về thủ!' && says.lines.join('|') === 'Đẩy trụ!|Về thủ!', JSON.stringify(says));
      check('pad: the d-pad phrase hint row is shown for pad players', says.hint === 'flex', says.hint);
      await shot(page, errs, 'pad-hud-chat', null, 300);
      await ctx.close();
    }

    // ----- gamepad: settings toggle and the help column
    {
      const { ctx, page, errs } = await open(browser, 'pad-set', { width: 1280, height: 720 }, false, 'screen=menu&fresh=1');
      await page.click('#ui [data-r="bSet"]');
      const t0 = await page.getAttribute('#ui [data-r="rumble"]', 'aria-pressed');
      await page.click('#ui [data-r="rumble"]');
      const t1 = await page.evaluate(() => ({ p: document.querySelector('#ui [data-r="rumble"]').getAttribute('aria-pressed'), saved: JSON.parse(localStorage.getItem('dtt.save.v1')).settings.rumble, off: __G.input.rumble('hit') }));
      check('pad: the settings toggle "Rung tay cầm" starts on, turns off, is saved, and rumble() then refuses', t0 === 'true' && t1.p === 'false' && t1.saved === false && t1.off === false, t0 + JSON.stringify(t1));
      await shot(page, errs, 'pad-settings', null, 250);
      await page.click('#ui [data-r="rumble"]');
      check('pad: the toggle turns back on', (await page.getAttribute('#ui [data-r="rumble"]', 'aria-pressed')) === 'true');
      await page.click('#ui .modal.on [data-r="close"]');
      await page.click('#ui [data-r="bHelp"]');
      await shot(page, errs, 'pad-help', async () => {
        const h = await page.evaluate(() => ({ cols: document.querySelectorAll('#ui .help-cols > div').length, heads: [...document.querySelectorAll('#ui .help-cols h4')].map((n) => n.textContent).join(), pad: document.querySelectorAll('#ui .help-cols > div:nth-child(2) kbd').length }));
        check('pad: help has three columns, Máy tính / Tay cầm / Cảm ứng, with the pad glyphs', h.cols === 3 && /^Máy tính,Tay cầm,Cảm ứng/.test(h.heads) && h.pad >= 10, JSON.stringify(h));
      }, 300);
      await ctx.close();
    }

    // ----- room chat
    {
      const SEL = '#ui .lobby .chatbox.in-lobby';
      let { ctx, page, errs } = await open(browser, 'chat-lobby', { width: 1280, height: 720 }, false, 'screen=lobby&role=host&fill=4&fresh=1');
      await page.evaluate(() => {
        for (const [id, name, team, text] of [['p1', 'Bão Số 9', 1, 'Sẵn sàng chưa mọi người?'], ['p2', 'Cò Lả', 0, 'Đợi tôi chọn máy một chút nhé, sắp xong rồi']]) __G.bus.emit('net:chat', { id, name, team, text, t: Date.now() });
      });
      await page.fill(SEL + ' input', '<b>x</b> xin chào <img src=x onerror=alert(1)>');
      await page.press(SEL + ' input', 'Enter');
      await page.waitForTimeout(100);
      const c = await page.evaluate((sel) => {
        const rows = [...document.querySelectorAll(sel + ' .cl')], last = rows[rows.length - 1];
        return { n: rows.length, who: last.querySelector('b').textContent, text: last.querySelector('span').textContent, html: last.querySelector('span').innerHTML, kids: last.querySelectorAll('span *').length, imgs: document.querySelectorAll('#ui img[src="x"]').length, input: document.querySelector(sel + ' input').value, calls: __G.online.calls.filter((x) => x[0] === 'say').length };
      }, SEL);
      check('chat: a line typed in the lobby is sent through online.say and shown with the sender name', c.n === 3 && c.who === 'Phi công' && c.calls === 1 && c.input === '', JSON.stringify(c));
      check('chat: "<b>x</b>" is shown as text, never parsed (no element inside the line, no <img> created, html is escaped)', c.text === '<b>x</b> xin chào <img src=x onerror=alert(1)>' && c.kids === 0 && c.imgs === 0 && c.html.startsWith('&lt;b&gt;x&lt;/b&gt;'), JSON.stringify(c));
      const teams = await page.evaluate((sel) => [...document.querySelectorAll(sel + ' .cl')].map((r) => r.className.replace('cl ', '').replace(' mine', '')).join(), SEL);
      check('chat: names carry their team colour class (t1 for Hỏa, t0 for Lam)', teams === 't1,t0,t0', teams);
      await page.fill(SEL + ' input', 'chưa gửi');
      await page.evaluate(() => { __G.bus.emit('net:lobby', __G.online.lobby); __G.bus.emit('net:chat', { id: 'p1', name: 'Bão Số 9', team: 1, text: 'tin mới', t: 1 }); });
      const keep = await page.evaluate((sel) => ({ v: document.querySelector(sel + ' input').value, focus: document.activeElement === document.querySelector(sel + ' input'), n: document.querySelectorAll(sel + ' .cl').length }), SEL);
      check('chat: a lobby redraw and an incoming line keep the half-typed text and the focus', keep.v === 'chưa gửi' && keep.focus && keep.n === 4, JSON.stringify(keep));
      await page.click(SEL + ' [data-q="1"]');
      const q = await page.evaluate(() => __G.online.calls.filter((x) => x[0] === 'say').pop()[1]);
      check('chat: a quick phrase button sends its phrase ("Về thủ!")', q === 'Về thủ!', q);
      await shot(page, errs, 'lobby-chat', null, 300);
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, 'chat-rate', { width: 1280, height: 720 }, false, 'screen=lobby&role=guest&fill=3&fresh=1'));
      for (let i = 1; i <= 6; i++) { await page.fill(SEL + ' input', 'dòng ' + i); await page.press(SEL + ' input', 'Enter'); }
      await page.waitForTimeout(100);
      const rl = await page.evaluate((sel) => ({ lines: [...document.querySelectorAll(sel + ' .cl span')].map((n) => n.textContent), left: document.querySelector(sel + ' input').value, toast: document.querySelector('#ui .toast').textContent }), SEL);
      check('chat: the 6th line inside 10 s is refused: 5 lines shown, text kept, toast says to wait', rl.lines.join('|') === 'dòng 1|dòng 2|dòng 3|dòng 4|dòng 5' && rl.left === 'dòng 6' && rl.toast === 'Gửi quá nhanh, hãy chờ vài giây', JSON.stringify(rl));
      await ctx.close();

      // in a match: Enter opens, typing is walled off from the game keys, Esc closes without pausing
      ({ ctx, page, errs } = await open(browser, 'chat-match', { width: 1280, height: 720 }, false, 'screen=hud&onl=1&manual=1&auto=0&mech=soi&fresh=1'));
      const smp = () => page.evaluate(() => { const i = __G.input.sample(__G.match.units[0]); return [i.mx, i.mz, i.s1, i.fire].join(); });
      const MS = '#ui .chatbox.in-match';
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(80);
      check('chat: D held moves right before the chat opens', (await smp()).startsWith('1,'));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      const op = await page.evaluate((sel) => ({ open: document.querySelector(sel).classList.contains('open'), focus: document.activeElement === document.querySelector(sel + ' input') }), MS);
      check('chat: Enter opens the match chat and focuses its input', op.open && op.focus, JSON.stringify(op));
      check('chat: with the chat open the held D no longer moves the unit', (await smp()).startsWith('0,0,false'));
      await page.keyboard.type('wasd q');
      const typed = await page.evaluate((sel) => ({ v: document.querySelector(sel + ' input').value, paused: __G.ui.paused, mv: (() => { const i = __G.input.sample(__G.match.units[0]); return i.mx + ',' + i.s1; })() }), MS);
      check('chat: game keys typed into the box become text (wasd q) and do not move, cast or pause', typed.v === 'wasd q' && !typed.paused && typed.mv === '0,false', JSON.stringify(typed));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const cl = await page.evaluate((sel) => ({ open: document.querySelector(sel).classList.contains('open'), paused: __G.ui.paused, focus: document.activeElement && document.activeElement.tagName }), MS);
      check('chat: Esc closes the box without opening the pause menu', !cl.open && cl.paused === false && cl.focus !== 'INPUT', JSON.stringify(cl));
      await page.keyboard.up('KeyD');
      await page.keyboard.down('KeyD'); await page.waitForTimeout(60);
      check('chat: after closing, keys move the unit again', (await smp()).startsWith('1,'));
      await page.keyboard.up('KeyD');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Hay lắm <i>x</i>');
      await shot(page, errs, 'chat-match-open', null, 250);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      const sent = await page.evaluate((sel) => ({ calls: __G.online.calls.filter((x) => x[0] === 'say').map((x) => x[1]), line: document.querySelector(sel + ' .cl span').textContent, kids: document.querySelectorAll(sel + ' .cl span *').length, open: document.querySelector(sel).classList.contains('open') }), MS);
      check('chat: Enter sends the line, shows it escaped in the match log and closes the box', sent.calls.join() === 'Hay lắm <i>x</i>' && sent.line === 'Hay lắm <i>x</i>' && sent.kids === 0 && !sent.open, JSON.stringify(sent));
      await page.evaluate(() => { for (const [n, t, x] of [['Bão Số 9', 1, 'Đẩy trụ!'], ['Cò Lả', 0, 'Cần hồi máu ở giữa sân, ai gần thì hỗ trợ nhé']]) __G.bus.emit('net:chat', { id: 'p3', name: n, team: t, text: x, t: Date.now() }); });
      await shot(page, errs, 'chat-match', null, 300);
      await page.waitForTimeout(9800);
      const faded = await page.evaluate((sel) => [...document.querySelectorAll(sel + ' .cl')].every((r) => r.classList.contains('old')), MS);
      check('chat: match log lines fade out after about 9 s', faded);
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, 'chat-offline', { width: 1280, height: 720 }, false, 'screen=hud&manual=1&auto=0&mech=soi'));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      const off = await page.evaluate((sel) => ({ open: document.querySelector(sel).classList.contains('open'), shown: getComputedStyle(document.querySelector(sel)).display }), MS);
      check('chat: in a local match Enter does nothing and the chat box is not shown', !off.open && off.shown === 'none', JSON.stringify(off));
      await ctx.close();

      // touch: a small button opens the box, quick phrases send
      ({ ctx, page, errs } = await open(browser, 'chat-touch', { width: 780, height: 360 }, true, 'screen=hud&onl=1&manual=1&auto=0&mech=ung&fresh=1'));
      await page.waitForTimeout(400);
      const bt = await page.evaluate(() => { const b = document.querySelector('#ui .chatbtn').getBoundingClientRect(); return { w: Math.round(b.width), shown: getComputedStyle(document.querySelector('#ui .chatbtn')).display }; });
      check('chat: touch players get a chat button (48 px) beside the pause button', bt.shown !== 'none' && bt.w >= 47.5 && bt.w <= 56, JSON.stringify(bt));
      await page.click('#ui .chatbtn', { force: true });
      await page.waitForTimeout(150);
      await shot(page, errs, 'chat-touch-open', async () => {
        const o = await page.evaluate(() => ({ open: document.querySelector('#ui .chatbox.in-match').classList.contains('open'), q: [...document.querySelectorAll('#ui .in-match .cl-q')].filter((b) => b.offsetParent).map((b) => b.textContent.replace(/[▲◀▶▼]/g, '')) }));
        check('chat: the button opens the box with four quick phrases', o.open && o.q.join('|') === 'Đẩy trụ!|Về thủ!|Cần hồi máu|Hay lắm!', JSON.stringify(o));
      }, 200);
      await page.click('#ui .in-match .cl-q[data-q="2"]', { force: true });
      const tq = await page.evaluate(() => ({ calls: __G.online.calls.filter((x) => x[0] === 'say').map((x) => x[1]), open: document.querySelector('#ui .chatbox.in-match').classList.contains('open'), line: document.querySelector('#ui .in-match .cl span').textContent }));
      check('chat: tapping "Cần hồi máu" sends it, logs it and closes the box', tq.calls.join() === 'Cần hồi máu' && tq.line === 'Cần hồi máu' && !tq.open, JSON.stringify(tq));
      await ctx.close();
    }

    // ----- phone polish: setup tabs, unclipped names, 11 px body text
    {
      const NAMES = '.map b, .th-n, .mode span, .su-tabs button, .seg button, .rl-tabs button, .tabs button, .sg-ban h2, .mb-t small';
      const TEXT = '.mode-bl, .th-bl, .sk-tx p, .ds-bl, .rd-l, .fmb small, .mc-lv, .mc-lock, .mc-on, .sg-have, .map b, .map .hz, .th-n, .mode span, .seg button, .su-tabs button, .sk-tx b';
      let { ctx, page, errs } = await open(browser, 'phone-setup', { width: 780, height: 360 }, true, 'screen=menu&fresh=1&map=xuongcat');
      {
        const r = await page.evaluate((a) => { const out = { clipped: [], small: [] }; for (const n of document.querySelectorAll('#ui .menu ' + a[0])) if (n.offsetParent && n.scrollWidth > n.clientWidth) out.clipped.push(n.textContent.trim()); for (const n of document.querySelectorAll('#ui .menu ' + a[1])) if (n.offsetParent && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 11) out.small.push(n.className + ':' + getComputedStyle(n).fontSize); return out; }, [NAMES, TEXT]);
        check('phone: tank select: no tab, banner or chip label is clipped, labels at least 11 px', r.clipped.length === 0 && r.small.length === 0, JSON.stringify(r));
      }
      await page.click('#ui [data-r="matchBtn"]');
      const tabs = await page.evaluate(() => [...document.querySelectorAll('#ui .menu .su-tabs button')].map((b) => b.textContent + ':' + (b.offsetParent ? 'shown' : 'hidden')).join());
      check('phone: the setup column has three tabs, Chế độ / Đấu trường / Môi trường', tabs === 'Chế độ:shown,Đấu trường:shown,Môi trường:shown', tabs);
      for (const [k, label] of [['mode', 'Chế độ'], ['map', 'Đấu trường'], ['theme', 'Môi trường']]) {
        await page.click(`#ui .menu .su-tabs [data-su="${k}"]`);
        await shot(page, errs, `phone-menu-${k}`, async () => {
          const r = await page.evaluate((a) => {
            const o = document.querySelector('#ui .setup .opts'), ob = o.getBoundingClientRect(), play = document.querySelector('#ui .play').getBoundingClientRect();
            const tiles = [...o.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
            return { fit: o.scrollHeight <= o.clientHeight + 1, play: play.bottom <= innerHeight + 1 && play.top >= 0, inside: tiles.every((t) => t.top >= ob.top - 1 && t.bottom <= ob.bottom + 1 && t.right <= ob.right + 1), n: tiles.length, on: document.querySelector('#ui .menu .su-tabs .on').textContent, ...(() => { const out = { clipped: [], small: [] }; for (const n of document.querySelectorAll('#ui .menu ' + a[0])) if (n.offsetParent && n.scrollWidth > n.clientWidth) out.clipped.push(n.textContent.trim()); for (const n of document.querySelectorAll('#ui .menu ' + a[1])) if (n.offsetParent && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 11) out.small.push(n.className + ':' + getComputedStyle(n).fontSize); return out; })() };
          }, [NAMES, TEXT]);
          check(`phone: tab ${label}: play button on screen, pickers reachable (the picker list scrolls)`, r.play && r.n >= 3 && r.on === label, JSON.stringify(r));
          check(`phone: tab ${label}: no name or label is clipped (scrollWidth <= clientWidth)`, r.clipped.length === 0, r.clipped.join(' | '));
          check(`phone: tab ${label}: body text is at least 11 px`, r.small.length === 0, r.small.join(' | '));
        }, 250);
      }
      await page.click('#ui .menu .su-tabs [data-su="map"]');
      const sand = await page.evaluate(() => { const b = document.querySelector('#ui .map[data-map="xuongcat"] b'); return { t: b.textContent, ok: b.scrollWidth <= b.clientWidth, w: b.clientWidth }; });
      check('phone: the map name "Xưởng Cát" is fully visible in the menu', sand.t === 'Xưởng Cát' && sand.ok, JSON.stringify(sand));
      await page.click('#ui .menu .su-tabs [data-su="theme"]');
      await page.click('#ui .th[data-th="lava"]');
      const th = await page.evaluate(() => ({ on: document.querySelector('#ui .th.on').dataset.th, tab: document.querySelector('#ui .menu .su-tabs .on').textContent }));
      check('phone: the theme picker is one tap away and a theme can be chosen there', th.on === 'lava' && th.tab === 'Môi trường', JSON.stringify(th));
      await ctx.close();

      for (const [role, fill] of [['host', 5], ['guest', 5]]) {
        ({ ctx, page, errs } = await open(browser, 'phone-lobby-' + role, { width: 780, height: 360 }, true, `screen=lobby&role=${role}&fill=${fill}&fresh=1&map=xuongcat`));
        await page.evaluate(() => { __G.online.lobby.map = 'xuongcat'; __G.bus.emit('net:lobby', __G.online.lobby); for (const [id, name, team, text] of [['p2', 'Cò Lả', 0, 'Đợi tôi chọn máy nhé'], ['p3', 'Mèo Mun', 1, 'Sẵn sàng rồi, bắt đầu thôi']]) __G.bus.emit('net:chat', { id, name, team, text, t: Date.now() }); });
        for (const k of role === 'host' ? ['mode', 'map', 'theme'] : ['mode']) {
          if (role === 'host') await page.click(`#ui .lobby .su-tabs [data-k="${k}"]`);
          await shot(page, errs, `phone-lobby-${role}-${k}`, async () => {
            const r = await page.evaluate(() => {
              const clipped = [];
              for (const n of document.querySelectorAll('#ui .lobby .map b, #ui .lobby .th-n, #ui .lobby .su-tabs button, #ui .lobby .mode span, #ui .lobby .lm b')) if (n.offsetParent && n.scrollWidth > n.clientWidth) clipped.push(n.textContent.trim());
              const chat = document.querySelector('#ui .lobby .chatbox').getBoundingClientRect(), inp = document.querySelector('#ui .lobby .chatbox input').getBoundingClientRect();
              const fs = parseFloat(getComputedStyle(document.querySelector('#ui .lobby .chatbox input')).fontSize);
              return { clipped, chat: chat.height > 30 && chat.bottom <= innerHeight && chat.right <= innerWidth, input: inp.width > 120 && inp.height > 14, fs, lines: document.querySelectorAll('#ui .lobby .cl').length };
            });
            check(`phone: ${role} lobby (${k}): map and theme names are not clipped`, r.clipped.length === 0, r.clipped.join(' | '));
            check(`phone: ${role} lobby (${k}): the chat box and its input are on screen, lines shown, text at least 11 px`, r.chat && r.input && r.lines === 2 && r.fs >= 11, JSON.stringify(r));
          }, 250);
        }
        if (role === 'host') {
          await page.click('#ui .lobby .su-tabs [data-k="map"]');
          const lm = await page.evaluate(() => { const b = document.querySelector('#ui .lobby .map[data-k="xuongcat"] b'); return { t: b.textContent, ok: b.scrollWidth <= b.clientWidth }; });
          check('phone: the map name "Xưởng Cát" is fully visible in the lobby', lm.t === 'Xưởng Cát' && lm.ok, JSON.stringify(lm));
          await page.click('#ui .lobby .su-tabs [data-k="theme"]');
          await page.click('#ui .lobby .th[data-k="ice"]');
          check('phone: the lobby theme picker is one tap away and reaches online.setRoom({ theme })', (await page.evaluate(() => __G.online.calls.filter((c) => c[0] === 'setRoom').pop()[1].theme)) === 'ice');
        }
        await ctx.close();
      }
    }

    // ----- icons: every skill and role icon is real, unknown names fall back without throwing
    {
      const { ctx, page } = await open(browser, 'icons-fn', { width: 800, height: 400 }, false, 'screen=menu&fresh=1');
      const r = await page.evaluate(async () => {
        const { icon } = await import('/games/dau-truong-thep/js/ui.js');
        const { MECHS, MECH_ORDER } = await import('/games/dau-truong-thep/js/data.js');
        const generic = icon('definitely-not-an-icon');
        const names = new Set();
        for (const k of MECH_ORDER) { names.add(MECHS[k].roleKey); for (const s of MECHS[k].skills) names.add(s.icon); }
        const missing = [...names].filter((n) => icon(n) === generic);
        const odd = [undefined, null, '', 'constructor', '__proto__', 42].map((n) => { try { return icon(n) === generic; } catch (e) { return 'threw ' + e.message; } });
        return { count: names.size, missing, odd, svg: /^<svg[^>]*>.+<\/svg>$/.test(generic) };
      });
      check('icons: every skill icon and role key has its own glyph', r.missing.length === 0 && r.count >= 28, JSON.stringify(r));
      check('icons: unknown, empty and prototype-chain names fall back to the generic glyph', r.odd.every((x) => x === true) && r.svg, JSON.stringify(r));
      await ctx.close();
    }

    // ----- meta: garbage tolerance, rewards, garage and rank
    {
      const { ctx, page } = await open(browser, 'meta', { width: 800, height: 400 }, false, 'screen=menu&fresh=1');
      const r = await page.evaluate(async () => {
        const { makeMeta } = await import('/games/dau-truong-thep/js/meta.js');
        const out = {};
        const weird = JSON.stringify({ coins: 'x', level: -4, xp: 1e12, owned: [1, 'zzz', 'trau'], mech: 'ghost', diff: 'x', settings: { quality: 'ultra', volume: 9 }, stats: 5, upgrades: { trau: 99, soi: -3, ghost: 2, hac: 'x' }, skins: { trau: 's', soi: 'nope', hac: 5, ghost: 's' }, ownedSkins: ['trau:s', 7, 'zzz', 'constructor', 'soi:zz', 'ghost:s'], trophies: -50 });
        for (const [k, raw] of Object.entries({ junk: '{{{nope', arr: '[1,2]', nulls: 'null', weird, badMaps: JSON.stringify({ upgrades: [1], skins: 'x', ownedSkins: 'y', trophies: 'z' }) })) {
          localStorage.setItem('dtt.save.v1', raw);
          const d = makeMeta().get();
          out[k] = d.coins === 0 && d.level >= 1 && d.xp >= 0 && d.owned.length >= 4 && ['low', 'medium', 'high'].includes(d.settings.quality) && d.settings.volume <= 1 && d.stats.matches === 0
            && d.trophies === 0 && d.gems === 0 && Array.isArray(d.ownedSkins) && typeof d.lv === 'object' && typeof d.skins === 'object' && d.shop.starter === false && d.shop.passUntil === 0;
        }
        localStorage.setItem('dtt.save.v1', weird);
        const w = makeMeta().get();
        const weirdOk = w.lv.trau.join() === '5,5,5,5,5' && w.lv.soi === undefined && w.lv.ghost === undefined && w.ownedSkins.join() === 'trau:s' && w.skins.trau === 's' && w.skins.soi === undefined && w.skins.ghost === undefined;
        localStorage.setItem('dtt.save.v1', JSON.stringify({ v: 1, name: 'Cũ', coins: 77, level: 3, xp: 5, owned: ['trau', 'soi', 'ung', 'hac'] }));
        const old = makeMeta().get();
        const oldOk = old.coins === 77 && old.level === 3 && old.trophies === 0 && Object.keys(old.lv).length === 0 && old.ownedSkins.length === 0 && old.gems === 0 && old.v === 3 && !('ownedPaints' in old);
        localStorage.removeItem('dtt.save.v1');
        const m = makeMeta();
        const rows = [{ id: 0, team: 0, kills: 5, assists: 2, deaths: 1 }, { id: 1, team: 1, kills: 1, assists: 0, deaths: 5 }];
        const res = m.applyResult({ rows, mvp: 0, winner: 0 }, 0);
        const again = makeMeta().get();
        const base = { res, saved: again.coins === res.coins && again.stats.wins === 1 && again.stats.kills === 5 && again.trophies === 22, ver: JSON.parse(localStorage.getItem('dtt.save.v1')).v };

        // garage logic on a fresh save
        localStorage.removeItem('dtt.save.v1');
        const g = makeMeta(), d = g.get();
        const log = {};
        d.coins = 1000;
        log.notOwned = g.upgrade('loi', 0); log.badTrack = g.upgrade('trau', 7); log.noTrack = g.upgrade('trau');
        log.up1 = g.upgrade('trau', 0); log.c1 = d.coins; log.l1 = d.lv.trau.join();
        log.up2 = g.upgrade('trau', 0); log.c2 = d.coins; log.l2 = d.lv.trau.join();
        d.coins = 100; log.poor = g.upgrade('trau', 1); log.cPoor = d.coins; log.lPoor = d.lv.trau.join();
        d.coins = 99999; for (let i = 0; i < 3; i++) g.upgrade('trau', 0);
        log.c5 = d.coins; log.l5 = d.lv.trau[0]; log.max = g.upgrade('trau', 0); log.cMax = d.coins;
        d.gems = 40; d.coins = 777;
        log.gem = g.upgrade('trau', 1, 'gems'); log.g1 = d.gems; log.gemCoins = d.coins; log.gemLv = d.lv.trau.join();
        d.gems = 5; log.gemPoor = g.upgrade('trau', 2, 'gems'); log.gP = d.gems;
        d.coins = 100;
        log.skinPoor = g.buySkin('trau', 's'); log.cp = d.coins;
        d.coins = 3000;
        log.skinBuy = g.buySkin('trau', 's'); log.cBuy = d.coins; log.skinAgain = g.buySkin('trau', 's'); log.cAgain = d.coins;
        log.badSkin = g.buySkin('trau', 'zzz'); log.badMech = g.buySkin('ghost', 's'); log.baseFree = g.buySkin('trau', 'goc'); log.cBase = d.coins;
        d.gems = 300; log.ssGem = g.buySkin('soi', 'ss', 'gems'); log.gSS = d.gems; log.cSS = d.coins;
        log.equipUnowned = g.setSkin('trau', 'ss');
        log.equip = g.setSkin('trau', 's'); log.eq = d.skins.trau;
        log.equipLockedMech = g.setSkin('loi', 's'); log.equipBad = g.setSkin('trau', 'zzz');
        log.reset = g.setSkin('trau', 'goc'); log.eq2 = d.skins.trau;
        g.setSkin('trau', 's');
        const reload = makeMeta().get();
        log.persist = reload.lv.trau.join() === '5,1,0,0,0' && reload.skins.trau === 's' && reload.ownedSkins.join() === 'trau:s,soi:ss' && reload.gems === 100;

        // v1 -> v3 migration: one level L per mech becomes L on every track; the old paints come back once as coins
        localStorage.setItem('dtt.save.v1', JSON.stringify({ v: 1, coins: 321, owned: ['trau', 'soi', 'ung', 'hac', 'loi'], upgrades: { trau: 3, loi: 5, soi: 0 }, ownedPaints: ['goc', 'vang'], paints: { trau: 'vang' } }));
        const mg = makeMeta().get(), mg2 = makeMeta().get();
        log.mig = [mg.v, mg.coins, mg.lv.trau.join(), mg.lv.loi.join(), mg.lv.soi === undefined, 'paints' in mg, 'ownedPaints' in mg, mg.ownedSkins.length, mg.gems, mg2.coins].join('|');
        // v2 -> v3: every paid paint, glow and decal is refunded at its old price, once (saved at load), the old fields dropped
        localStorage.setItem('dtt.save.v1', JSON.stringify({ v: 2, coins: 50, owned: ['trau', 'soi', 'ung', 'hac'], ownedPaints: ['goc', 'vang', 'tim', 'vang', 'zzz'], ownedGlows: ['goc', 'hong'], ownedDecals: ['goc', 'caro'], paints: { trau: 'vang' }, glows: { trau: 'hong' }, decals: { soi: 'caro' } }));
        const v2 = makeMeta(), v2d = v2.get(), stored = JSON.parse(localStorage.getItem('dtt.save.v1')), v2again = makeMeta().get();
        log.mig2 = [v2d.v, v2d.coins, v2.refunded, stored.v, stored.coins, 'ownedPaints' in stored || 'ownedGlows' in stored || 'ownedDecals' in stored || 'paints' in stored || 'glows' in stored || 'decals' in stored, v2again.coins, Object.keys(v2d.skins).length].join('|');

        // shop, daily claim, match rewards with an injected clock
        localStorage.removeItem('dtt.save.v1');
        let clock = new Date(2026, 5, 10, 22, 0).getTime();
        const sm = makeMeta({ now: () => clock }), sd = sm.get();
        log.shopBad = sm.shopBuy('nope').ok;
        const st1 = sm.shopBuy('khoidau'), st2 = sm.shopBuy('khoidau');
        log.starter = [st1.ok, st1.got.gems, st1.got.coins, st1.got.mech, st1.got.skin, st2.ok, st2.reason, sd.gems, sd.coins, sd.owned.includes('thancong'), sd.ownedSkins.includes('thancong:s'), sd.shop.starter].join('|');
        log.dailyNoPass = sm.claimDaily();
        const p1 = sm.shopBuy('thethang');
        log.pass = [p1.got.pass, sd.gems, sm.passActive(), sm.passDaysLeft(), sm.dailyReady()].join('|');
        log.daily1 = sm.claimDaily(); log.daily2 = sm.claimDaily(); log.gDaily = sd.gems;
        clock += 3600e3 * 3;
        log.dailyNextDay = sm.claimDaily();
        const p2 = sm.shopBuy('thethang');
        log.passStack = [sm.passDaysLeft(), sd.shop.bought.thethang, sd.shop.log.length];
        const win = { rows: [{ id: 0, team: 0, kills: 5, assists: 2, deaths: 1, dmg: 0 }, { id: 1, team: 1, kills: 1, assists: 0, deaths: 5, dmg: 0 }], mvp: 0, winner: 0 };
        sd.level = 1; sd.xp = 190;
        const w1 = sm.applyResult(win, 0);
        log.rw1 = [w1.coins, w1.parts.pass, w1.coinMul, w1.gems, w1.gemParts.levelUp, w1.gemParts.mvp, w1.gemParts.firstWin, w1.levelAfter].join('|');
        const w2 = sm.applyResult(win, 0);
        log.rw2 = [w2.gemParts.firstWin, w2.gems];
        clock += 86400e3;
        const w3 = sm.applyResult({ ...win, mvp: 1 }, 0);
        log.rw3 = [w3.gemParts.firstWin, w3.gemParts.mvp];
        clock += 70 * 86400e3;
        log.expired = [sm.passActive(), sm.passDaysLeft(), sm.claimDaily(), sm.applyResult({ ...win, mvp: 1 }, 0).coinMul];
        // a bundle bought twice: the second time the tank and its skin come back as coins (1600 + 800)
        localStorage.removeItem('dtt.save.v1');
        const bm = makeMeta(), bd = bm.get(), b1 = bm.shopBuy('goi_hacho'), b2 = bm.shopBuy('goi_hacho');
        log.bundle = [b1.got.mech, b1.got.skin, b2.got.mech === undefined, b2.got.skin === undefined, b2.got.refund, bd.ownedSkins.join(), bd.coins].join('|');
        log.badStore = (() => { const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } }; const b = makeMeta({ storage: bad }); b.get().coins = 5; return b.save() === false && b.get().coins === 5; })();

        // ranks and trophies, boundaries from RANKS
        const T = (t) => { d.trophies = t; return g.rank(); };
        const rk = [T(0), T(99), T(100), T(249), T(250), T(1000), T(5000)].map((x) => `${x.index}:${x.name}:${x.next ? x.next.name + '@' + x.next.min : '-'}`);
        d.trophies = 10;
        const lose = g.applyResult({ rows, mvp: 1, winner: 1 }, 0);
        const draw = g.applyResult({ rows, mvp: 1, winner: -1 }, 0);
        d.trophies = 99;
        const promo = g.applyResult({ rows, mvp: 0, winner: 0 }, 0);
        d.trophies = 100;
        const demo = g.applyResult({ rows, mvp: 1, winner: 1 }, 0);
        d.trophies = 3;
        const floor = g.applyResult({ rows, mvp: 1, winner: 1 }, 0);
        log.lose = [lose.trophiesBefore, lose.trophiesAfter]; log.draw = [draw.trophiesBefore, draw.trophiesAfter];
        log.promo = [promo.trophiesAfter, promo.rankBefore.name, promo.rankAfter.name, promo.rankAfter.color];
        log.demo = [demo.trophiesAfter, demo.rankBefore.name, demo.rankAfter.name];
        log.floor = [floor.trophiesAfter, floor.rankAfter.index];
        log.top = T(1000).next === null && T(1000).color === '#7fb8ff';
        return { out, weirdOk, oldOk, base, log, rk };
      });
      check('meta: junk, array, null, out-of-range and wrong-typed saves load as valid data', Object.values(r.out).every(Boolean), JSON.stringify(r.out));
      check('meta: garbage upgrades/skins are clamped or dropped (level 99 -> 5, unknown tanks, skins and ids gone, trophies >= 0)', r.weirdOk);
      check('meta: an old save without the new fields loads with defaults and keeps coins and level', r.oldOk);
      check('meta: applyResult pays win + kills + assists + mvp, +22 trophies, persists, versioned', r.base.res.coins === 145 + 50 + 10 + 48 && r.base.res.xp === 125 && r.base.res.win && r.base.res.mvp && r.base.saved && r.base.ver === 3 && r.base.res.gems === 12 && r.base.res.trophiesBefore === 0 && r.base.res.trophiesAfter === 22 && r.base.res.rankAfter.name === 'Sắt', JSON.stringify(r.base));
      const L = r.log;
      check('meta: upgrade(mech, track) refuses an unowned mech, a bad or missing track, charges 120 then 210 on one track, refuses when poor', L.notOwned === false && L.badTrack === false && L.noTrack === false && L.up1 === true && L.c1 === 880 && L.l1 === '1,0,0,0,0' && L.up2 === true && L.c2 === 670 && L.l2 === '2,0,0,0,0' && L.poor === false && L.cPoor === 100 && L.lPoor === '2,0,0,0,0', JSON.stringify(L));
      check('meta: levels 3..5 on a track cost 300 + 390 + 480, level 6 refused without charging', L.c5 === 99999 - 1170 && L.l5 === 5 && L.max === false && L.cMax === L.c5, JSON.stringify(L));
      check('meta: upgrading with gems takes ceil(price / 10) gems and no coins, refuses when short', L.gem === true && L.g1 === 28 && L.gemCoins === 777 && L.gemLv === '5,1,0,0,0' && L.gemPoor === false && L.gP === 5, JSON.stringify(L));
      check('meta: buySkin charges once (S 800), refuses when poor, an unknown id or tank; the base skin is free; SS in gems (2000 -> 200)', L.skinPoor === false && L.cp === 100 && L.skinBuy === true && L.cBuy === 2200 && L.skinAgain === true && L.cAgain === 2200 && L.badSkin === false && L.badMech === false && L.baseFree === true && L.cBase === 2200 && L.ssGem === true && L.gSS === 100 && L.cSS === 2200, JSON.stringify(L));
      check('meta: setSkin needs an owned skin of an owned tank, goc clears, everything persists', L.equipUnowned === false && L.equip === true && L.eq === 's' && L.equipLockedMech === false && L.equipBad === false && L.reset === true && L.eq2 === undefined && L.persist, JSON.stringify(L));
      check('meta: a v1 save migrates (one level L becomes L on every track, capped at 5) and its Vàng paint comes back once as 200 coins', L.mig === '3|521|3,3,3,3,3|5,5,5,5,5|true|false|false|0|0|521', L.mig);
      check('meta: a v2 save gets its paints, glow and decal back once as coins (vang 200 + tim 300 + hong 300 + caro 250 = 1050, duplicates and unknown ids ignored), saved at load, old fields dropped', L.mig2 === '3|1100|1050|3|1100|false|1100|0', L.mig2);
      check('meta: starter pack grants gems, coins, mech and its S skin at once and only once; unknown id refused', L.shopBad === false && L.starter === 'true|300|1000|thancong|thancong:s|false|Đã mua|300|1000|true|true|true', L.starter);
      check('meta: a bundle grants the tank and its S skin; bought again both come back as 2400 coins', L.bundle === 'hacho|hacho:s|true|true|2400|hacho:s|2400', L.bundle);
      check('meta: pass needs a purchase for the daily claim, extends by 30 days, daily gems once per calendar day, again the next day', L.dailyNoPass === 0 && L.pass === '30|500|true|30|true' && L.daily1 === 30 && L.daily2 === 0 && L.gDaily === 530 && L.dailyNextDay === 30 && L.passStack[0] === 60 && L.passStack[1] === 2 && L.passStack[2] === 3, JSON.stringify([L.dailyNoPass, L.pass, L.daily1, L.daily2, L.gDaily, L.dailyNextDay, L.passStack]));
      check('meta: with the pass match coins x1.5 (253 -> 380), gems: level-up +20, MVP +2, first win of the day +10 once per day; expired pass stops all of it', L.rw1 === '380|127|1.5|32|20|2|10|2' && L.rw2[0] === 0 && L.rw3[0] === 10 && L.rw3[1] === 0 && L.expired[0] === false && L.expired[1] === 0 && L.expired[2] === 0 && L.expired[3] === 1, JSON.stringify([L.rw1, L.rw2, L.rw3, L.expired]));
      check('meta: a throwing or full store never breaks the game (save() returns false, data stays in memory)', L.badStore);
      check('meta: rank() boundaries 0/99 Sắt, 100/249 Đồng, 250 Bạc, 1000+ Kim Cương with no next', r.rk.join(' ') === '0:Sắt:Đồng@100 0:Sắt:Đồng@100 1:Đồng:Bạc@250 1:Đồng:Bạc@250 2:Bạc:Vàng@450 5:Kim Cương:- 5:Kim Cương:-' && L.top, r.rk.join(' '));
      check('meta: trophies loss -12, draw +4, never below 0, promotion at 100 and demotion', L.lose.join() === '10,0' && L.draw.join() === '0,4' && L.promo.join() === '121,Sắt,Đồng,#c98a52' && L.demo.join() === '88,Đồng,Sắt' && L.floor.join() === '0,0', JSON.stringify(L));
      const m2 = await page.evaluate(async () => {
        const { makeMeta, modeOf, placeOf } = await import('/games/dau-truong-thep/js/meta.js');
        const KEY = 'dtt.save.v1', out = {};
        const row = (id, team, o) => ({ id, team, name: 'n' + id, mech: 'trau', kills: 0, deaths: 0, assists: 0, dmg: 0, healed: 0, rating: 0, ...o });
        const ffa = (myScore, others, winner) => ({ rows: Array.from({ length: 10 }, (_, i) => row(i, i, { kills: i === 0 ? myScore : others[i - 1] })), mvp: 5, winner, score: Array.from({ length: 10 }, (_, i) => (i === 0 ? myScore : others[i - 1])), time: 100 });
        const fresh = (tr) => { localStorage.removeItem(KEY); const g = makeMeta(); g.get().trophies = tr; return g; };
        const pay = (sm, tr = 100, mode) => { const g = fresh(tr); const r = g.applyResult(sm, 0); return [r.coins, r.xp, r.win, r.draw, g.get().trophies, r.trophy, r.place, g.get().stats.wins]; };
        const o8 = [12, 9, 8, 7, 6, 5, 4, 3, 2], o5 = [12, 9, 8, 7, 6, 5, 4, 3, 2];
        out.first = pay(ffa(12, [9, 8, 7, 6, 5, 4, 3, 2, 1], 0));
        out.third = pay(ffa(8, o8.map((v, i) => (i < 2 ? v : v - 3)), 1));
        out.sixth = pay(ffa(5, [12, 9, 8, 7, 6, 4, 3, 2, 1], 1));
        out.second = pay(ffa(10, [12, 9, 8, 7, 6, 4, 3, 2, 1], 1));
        out.placeTie = placeOf(ffa(5, [12, 9, 8, 7, 6, 4, 3, 2, 1], 1), 0);
        const boss = (won, dmg) => ({ rows: [...Array.from({ length: 5 }, (_, i) => row(i, 0, { dmg: i === 0 ? dmg : 1000, kills: 0 })), row(5, 1, { mech: 'titan' })], mvp: 3, winner: won ? 0 : 1, score: [0, 0], time: 200 });
        out.bossWin = pay(boss(true, 8000)); out.bossLose = pay(boss(false, 8000));
        const ffaN = (n, myPlace) => { const kills = Array.from({ length: n }, (_, i) => (i === 0 ? n - myPlace + 1 : i < myPlace ? n - i + 1 : n - i)); return { rows: kills.map((k, i) => row(i, i, { kills: k })), mvp: 1, winner: kills.indexOf(Math.max(...kills)), score: kills, time: 100, mode: 'tudo' }; };
        out.ffa6 = [1, 2, 3, 4, 6].map((p) => pay(ffaN(6, p))[3] + ':' + pay(ffaN(6, p))[2]);
        out.ffa2 = [1, 2].map((p) => pay(ffaN(2, p))[3] + ':' + pay(ffaN(2, p))[2]);
        out.sizes = [5, 4, 0, 1, 2, 3, 'x', null].map((v) => { localStorage.setItem(KEY, JSON.stringify({ size: v })); return makeMeta().get().size; }); localStorage.removeItem(KEY); out.sizeDef = makeMeta().get().size;
        out.tdm = pay({ rows: [row(0, 0), row(1, 1)], mvp: 1, winner: 0, score: [25, 3], time: 90 });
        out.chiem = pay({ rows: [row(0, 0), row(1, 1)], mvp: 1, winner: 1, score: [20, 150], time: 90, mode: 'chiem' });
        out.modes = [modeOf(ffa(1, [1, 1, 1, 1, 1, 1, 1, 1, 1], 0)), modeOf(boss(true, 1)), modeOf({ rows: [row(0, 0), row(1, 1)] }), modeOf({ mode: 'chiem', rows: [] })];
        localStorage.setItem(KEY, JSON.stringify({ mode: 'trum' })); out.savedMode = makeMeta().get().mode;
        localStorage.setItem(KEY, JSON.stringify({ mode: 'zzz' })); out.badMode = makeMeta().get().mode;
        localStorage.removeItem(KEY); out.defMode = makeMeta().get().mode;
        return out;
      });
      check('meta: tudo pays by place: 1st = win 145+12*10 and +100 xp, 2nd/3rd = draw 96, 6th = lose 72; cúp untouched (100)', m2.first.slice(0, 3).join() === '265,160,true' && m2.first[4] === 100 && m2.first[5] === false && m2.first[6] === 1 && m2.first[7] === 1
        && m2.third[0] === 96 + 8 * 10 && m2.third[3] === true && m2.third[2] === false && m2.third[4] === 100 && m2.third[6] === 3 && m2.second[0] === 96 + 10 * 10 && m2.second[6] === 2 && m2.sixth[0] === 72 + 5 * 10 && m2.sixth[2] === false && m2.sixth[3] === false && m2.sixth[4] === 100 && m2.sixth[6] === 5 + 1, JSON.stringify(m2));
      check('meta: trum win = 1.5x win base (218) + damage part round(10*8000/4000)=20 ; loss = 72 + 20; cúp untouched', m2.bossWin[0] === 218 + 20 && m2.bossWin[2] === true && m2.bossWin[4] === 100 && m2.bossWin[5] === false && m2.bossLose[0] === 72 + 20 && m2.bossLose[2] === false, JSON.stringify([m2.bossWin, m2.bossLose]));
      check('meta: trophies still change in tdm (+22) and chiem (loss -12), mode is inferred from the summary shape', m2.tdm[4] === 122 && m2.tdm[5] === true && m2.chiem[4] === 88 && m2.chiem[5] === true && m2.modes.join() === 'tudo,trum,tdm,chiem', JSON.stringify([m2.tdm, m2.chiem, m2.modes]));
      check('meta: free-for-all of 6 (3v3): 1st wins, 2nd and 3rd draw, 4th and 6th lose; of 2 (1v1): the loser loses, no draw', m2.ffa6.join() === 'false:true,true:false,true:false,false:false,false:false' && m2.ffa2.join() === 'false:true,false:false', JSON.stringify([m2.ffa6, m2.ffa2]));
      check('meta: saved team size is 1, 2 or 3; 4, 5, 0, text, null and a missing key fall back to 3', m2.sizes.join() === '3,3,3,1,2,3,3,3' && m2.sizeDef === 3, JSON.stringify([m2.sizes, m2.sizeDef]));
      check('meta: last mode is saved, garbage falls back to tdm, default is tdm', m2.savedMode === 'trum' && m2.badMode === 'tdm' && m2.defMode === 'tdm', JSON.stringify([m2.savedMode, m2.badMode, m2.defMode]));
      await ctx.close();
    }
    await phoneSuite(browser);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\ntone-mark check: ${marksFlagged} elements flagged on ${marksScreens} screens`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
