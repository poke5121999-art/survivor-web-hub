#!/usr/bin/env node
/* Food Gang on a desktop browser (owner's PC report 2026-10-31): nothing covers the match at its start, the camera shows
 * the local fighter, keyboard keys are on the on-screen controls (desktop only), the loading spinners turn, the backing
 * store follows CSS size x devicePixelRatio and the HUD keeps the CanvasScaler proportions.
 *   node test/food-gang-pc.js                     (local server; offline quick play + one online quick play)
 *   FG_URL=https://poke5121999-art.github.io/survivor-web-hub/games/food-gang/index.html node test/food-gang-pc.js
 *   FG_RUNS=5  FG_PARTS=desktop,online,tutorial,special,touch  FG_VP=1366x768,1920x1080@2
 * Shots: shots/food-gang/pc/<run>/. Exit 1 on any failed check.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', 'food-gang', 'pc');
const RUNS = Number(process.env.FG_RUNS || 1);
const PARTS = (process.env.FG_PARTS || 'desktop,online,tutorial,special,touch').split(',');
const VPS = (process.env.FG_VP || '1366x768,1920x1080,2560x1440,1280x800,2560x1080,1024x768,3440x1440,1280x720@2').split(',').map((v) => {
  const [wh, d] = v.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: Number(d || 1), name: v.replace('@', 'at') };
});
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; fails.push(name); }
};
const metrics = [];

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// long tasks + rAF gaps from the first script on
const INIT = () => {
  const P = window.__perf = { long: [], gaps: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { P.noLong = 1; }
  let last = performance.now();
  const f = (t) => { if (t - last > 50 && !document.hidden) P.gaps.push([Math.round(last), Math.round(t - last)]); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
};

// everything the checks read in one call
const PROBE = () => {
  const app = window.fgApp, e = app.engine, c = e.canvas, d = window.fgDebug();
  const k = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const out = { phase: d.phase, screen: d.screen, css: [k.width, k.height], backing: [c.width, c.height], dpr, ratio: e.pixelRatio, cap: window.fgEngineStats.ratioCap || null };
  // DOM over the canvas: hit-test a grid, list visible page-level elements
  out.hits = [];
  for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const el = document.elementFromPoint(innerWidth * fx, innerHeight * fy);
    if (el && el !== c) out.hits.push((el.id || el.tagName) + '@' + fx + ',' + fy);
  }
  out.covers = [];
  for (const el of document.body.children) {
    if (el === c || el.tagName === 'SCRIPT' || el.id === 'fg-keys') continue;
    const cs = getComputedStyle(el);
    if (cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.02) out.covers.push(el.id || el.className || el.tagName);
  }
  const keys = document.getElementById('fg-keys');
  out.keys = keys ? [...keys.children].filter((x) => x.shown && !x.classList.contains('hint')).map((x) => { const r = x.getBoundingClientRect(); return [x.textContent, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }) : null;
  out.keysEl = !!keys;
  const m = app.match;
  if (m && m.runner) {
    const me = m.runner.localAgent;
    const rig = e.cine && e.cine.camComp, main = e.mainCamera();
    out.camOk = !!(rig && main === rig && !rig.node.destroyed);
    if (me) {
      const p = e.worldToScreen(me.pos.x, me.pos.y + 1, 0);
      out.me = p ? [p[0] / c.width, 1 - p[1] / c.height] : null;
      out.alive = me.hpCurrent > 0;
    }
    out.camIntro = !!m.camIntro;
    out.distance = m.composer ? m.composer.distance : null;
    const h = m.hud;
    const hudCv = h.root.find('HUD').get('Canvas');
    out.hudScale = hudCv ? hudCv.scale : null;
    const btn = h.vbuttons.find((b) => b.type === 1);
    if (btn) { const img = btn.node.children.find((ch) => ch.get('Image')) || btn.node; const q = e.ui.screenRect(img); out.attackPx = [q[0] / c.width, q[1] / c.height, q[2], q[3]]; }
  }
  return out;
};

// screenshot decoded in the page: share of near-black pixels, and at the left / right edges of black or pure white pixels
// (SceneGame camera clears to white: past the map art the frame is white)
async function pixels(page) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let dark = 0, n = 0, edgeDark = 0, en = 0;
    const W = cv.width, H = cv.height;
    for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
      const i = (y * W + x) * 4, v = d[i] + d[i + 1] + d[i + 2];
      n++; if (v < 30) dark++;
      if (x < W * 0.03 || x > W * 0.97) { en++; if (v < 30 || v >= 762) edgeDark++; }
    }
    return { dark: dark / n, edgeDark: edgeDark / Math.max(1, en) };
  }, b64);
}

async function newPage(browser, vp, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr || 1, ...extra });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  const until = async (f, ms, a, step = 60) => { const end = Date.now() + ms; for (;;) { const v = await ev(f, a).catch(() => null); if (v) return v; if (Date.now() > end) return null; await sleep(step); } };
  return { ctx, page, errors, ev, until };
}

async function returningProfile(P, url) {
  await P.page.goto(url);
  await P.until(() => window.fgApp && window.fgApp.profile && window.fgDebug().screen !== 'boot', 60000);
  await P.ev(() => { const a = window.fgApp; a.meta.completeTutorial(a.profile, new Date()); a.profile.gameCount = Math.max(1, a.profile.gameCount); a.save(); try { localStorage.setItem('fg-lang', 'English'); } catch (e) { /* */ } });
  const t0 = Date.now();
  await P.page.reload();
  const menu = await P.until(() => { const d = window.fgDebug && window.fgDebug(); return d && d.ui[0] && d.ui[0].scene === 'SceneMenu' ? 1 : null; }, 60000, null, 40);
  return menu ? Date.now() - t0 : null;
}

const pressPlay = (P) => P.ev(() => { const b = (window.fgButtons('SceneMenu') || []).find((x) => x.method.split(',').includes('Play')); return b ? b.pos : null; })
  .then(async (pos) => {
    if (!pos) return false;
    await P.page.mouse.click(pos[0], pos[1]);
    // BATTLE! opens the Play -> mode picker (ScenePrivateConfiguration, rev 20261102b): press its BATTLE! (choice kept, Random by default)
    const u = await P.until(() => { const x = window.fgDebug().ui[0]; return x && x.scene === 'ScenePrivateConfiguration' && x.battleButton ? x.battleButton : null; }, 8000, null, 40);
    if (!u) return false;
    await P.page.mouse.click(u[0], u[1]);
    return true;
  });

// the checks at the start of a match: t = 0.5, 1, 2 s after BATTLE!, then once the camera intro is over
async function matchStartChecks(P, tag, dir, opts = {}) {
  const t0 = Date.now();
  const samples = [];
  for (const t of [500, 1000, 2000, 3500]) {
    const dt = t - (Date.now() - t0); if (dt > 0) await sleep(dt);
    const pr = await P.ev(PROBE);
    const px = await pixels(P.page);
    if (opts.shots) await P.page.screenshot({ path: path.join(dir, `${tag}_t${t}.png`) });
    samples.push({ t, pr, px });
    const at = `${tag} t=${t / 1000}s`;
    check(`${at}: no DOM element over the play area`, !pr.hits.length && !pr.covers.length, [...pr.hits, ...pr.covers].join(' ').slice(0, 160));
    check(`${at}: frame is not covered dark`, px.dark < 0.35, `dark ${(px.dark * 100).toFixed(1)} %`);
    check(`${at}: render camera is the rig camera`, pr.camOk === true);
    if (opts.keys !== false) {
      const want = pr.keys ? pr.keys.length : 0;
      check(`${at}: key labels shown on the controls`, want >= 4 && pr.keys.every((k) => k[1] >= 0 && k[2] >= 0 && k[1] + k[3] <= pr.css[0] + 1 && k[2] + k[4] <= pr.css[1] + 1), JSON.stringify(pr.keys).slice(0, 160));
    }
    if (t >= 3500 && pr.alive) check(`${at}: local fighter in view after the camera intro`, pr.me && pr.me[0] > 0.15 && pr.me[0] < 0.85 && pr.me[1] > 0.1 && pr.me[1] < 0.95, JSON.stringify(pr.me));
    if (t >= 3500) check(`${at}: no empty band (black / clear white) at the screen edges`, px.edgeDark < 0.2, `edge dark ${(px.edgeDark * 100).toFixed(1)} %`);
  }
  return samples;
}

function backingCheck(tag, pr) {
  const exp = [Math.round(pr.css[0] * pr.ratio), Math.round(pr.css[1] * pr.ratio)];
  const full = Math.abs(pr.ratio - pr.dpr) < 1e-3;
  check(`${tag}: canvas backing = CSS x ${pr.cap ? 'capped ratio' : 'devicePixelRatio'}`, Math.abs(pr.backing[0] - exp[0]) <= 1 && Math.abs(pr.backing[1] - exp[1]) <= 1 && (full || !!pr.cap),
    `css ${pr.css.map((v) => v.toFixed(1)).join('x')} dpr ${pr.dpr} ratio ${pr.ratio.toFixed(2)} backing ${pr.backing.join('x')}${pr.cap ? ' cap ' + JSON.stringify(pr.cap) : ''}`);
}

async function desktop(browser, url, vp, dir, k) {
  const tag = `desk_${vp.name}`;
  const P = await newPage(browser, vp);
  const rec = { part: 'desktop', vp: vp.name, run: k };
  try {
    rec.toMenuMs = await returningProfile(P, url + (url.includes('?') ? '&' : '?') + 'offline=1');
    check(`${tag}: menu opens`, !!rec.toMenuMs, `${rec.toMenuMs} ms`);
    if (!rec.toMenuMs) return rec;
    backingCheck(`${tag} menu`, await P.ev(PROBE));
    await sleep(1200);
    const mark = await P.ev(() => performance.now());
    const tPlay = Date.now();
    check(`${tag}: BATTLE! pressed`, await pressPlay(P));
    // VS lobby: the bots' cells spin m_loading (AutoRotate -500 deg/s) until BotFillAt
    const s0 = await P.until(() => window.fgDebug().phase === 'searching', 20000, null, 20);
    if (s0) {
      const ang = [];
      for (let i = 0; i < 6; i++) {
        ang.push(await P.ev(() => { const h = window.fgApp.match.hud; const p = (h.loading.pending || [])[0]; return p && p.ld && p.ld.activeInHierarchy ? p.ld.le[2] : null; }));
        await sleep(100);
      }
      const a = ang.filter((x) => x !== null);
      const steps = a.slice(1).map((v, i) => ((a[i] - v) % 360 + 360) % 360);
      check(`${tag}: VS lobby spinner turns every 100 ms`, a.length >= 3 && steps.every((s) => s > 5 && s < 355), JSON.stringify(a.map((v) => Math.round(v))));
    } else check(`${tag}: VS lobby (searching) shown`, false);
    const m = await P.until(() => window.fgDebug().phase === 'match', 40000, null, 30);
    rec.playToMatchMs = m ? Date.now() - tPlay : null;
    check(`${tag}: match starts`, !!m, `${rec.playToMatchMs} ms from BATTLE!`);
    const perf = await P.ev((mk) => ({ long: window.__perf.long.filter((x) => x[0] >= mk), gaps: window.__perf.gaps.filter((x) => x[0] >= mk), noLong: window.__perf.noLong }), mark);
    rec.longestTask = perf.long.reduce((a, x) => Math.max(a, x[1]), 0);
    rec.longestGap = perf.gaps.reduce((a, x) => Math.max(a, x[1]), 0);
    check(`${tag}: no long task over 100 ms between BATTLE! and the match`, !perf.noLong && rec.longestTask <= 100, `longest ${rec.longestTask} ms, rAF gap ${rec.longestGap} ms`);
    if (!m) return rec;
    const samples = await matchStartChecks(P, tag, dir, { shots: k === 1 });
    const pr = samples[samples.length - 1].pr;
    backingCheck(`${tag} match`, pr);
    rec.hudScale = pr.hudScale; rec.attackPx = pr.attackPx; rec.distance = pr.distance;
    const expScale = Math.min(pr.backing[0] / 1280, pr.backing[1] / 720);
    check(`${tag}: HUD CanvasScaler = min(w/1280, h/720) (Expand)`, pr.hudScale && Math.abs(pr.hudScale / expScale - 1) < 0.01, `${pr.hudScale && pr.hudScale.toFixed(3)} vs ${expScale.toFixed(3)}`);
    const aspect = pr.backing[0] / pr.backing[1];
    const expDist = 20 + Math.max(0, 16 / 9 - aspect) * 16.5;
    check(`${tag}: camera distance = AspectBaseDistance (${expDist.toFixed(2)})`, pr.distance && Math.abs(pr.distance - expDist) < 0.05, `${pr.distance && pr.distance.toFixed(2)}`);
    if (vp.resize) {
      await P.page.setViewportSize({ width: vp.resize[0], height: vp.resize[1] });
      await sleep(400);
      const r2 = await P.ev(PROBE);
      backingCheck(`${tag} resized to ${vp.resize.join('x')}`, r2);
      check(`${tag} resized: key labels follow the controls`, r2.keys && r2.keys.length >= 4 && r2.keys.every((q) => q[1] + q[3] <= vp.resize[0] + 1 && q[2] + q[4] <= vp.resize[1] + 1), JSON.stringify(r2.keys).slice(0, 160));
      const px = await pixels(P.page);
      check(`${tag} resized: frame not covered`, px.dark < 0.35 && !r2.covers.length, `dark ${(px.dark * 100).toFixed(1)} %`);
      if (k === 1) await P.page.screenshot({ path: path.join(dir, `${tag}_resized.png`) });
    }
    check(`${tag}: no page errors`, !P.errors.length, P.errors.slice(0, 2).join(' | '));
  } finally { await P.ctx.close(); }
  return rec;
}

// online quick play (no ?offline): SceneLoadingGame "Searching opponents..." spinner, then the match from that screen
async function online(browser, url, dir, k) {
  const vp = { w: 1366, h: 768, dpr: 1, name: '1366x768' };
  const tag = 'online_1366x768';
  const P = await newPage(browser, vp);
  const rec = { part: 'online', vp: vp.name, run: k };
  try {
    rec.toMenuMs = await returningProfile(P, url);
    if (!rec.toMenuMs) { check(`${tag}: menu opens`, false); return rec; }
    const net = await P.until(() => window.fgApp.net && window.fgApp.net.state !== 'checking' ? window.fgApp.net.state : null, 15000);
    rec.net = net;
    await sleep(1000);
    const mark = await P.ev(() => performance.now());
    const tPlay = Date.now();
    await pressPlay(P);
    if (net === 'online') {
      const lg = await P.until(() => { const s = window.fgApp.screens.find((x) => x.sceneName === 'SceneLoadingGame'); return s && s.inst ? 1 : null; }, 20000, null, 30);
      check(`${tag}: "Searching opponents..." screen`, !!lg);
      const ang = [];
      for (let i = 0; i < 10 && lg; i++) {
        ang.push(await P.ev(() => { const s = window.fgApp.screens.find((x) => x.sceneName === 'SceneLoadingGame'); const n = s && s.inst.nodes.find((x) => x.name === 'Loading'); return n ? n.le[2] : null; }));
        await sleep(100);
      }
      const a = ang.filter((x) => x !== null);
      const steps = a.slice(1).map((v, i) => ((a[i] - v) % 360 + 360) % 360);
      check(`${tag}: loading spinner turns every 100 ms`, a.length >= 5 && steps.every((s) => s > 5 && s < 355), JSON.stringify(a.map((v) => Math.round(v))));
      if (k === 1) await P.page.screenshot({ path: path.join(dir, `${tag}_searching.png`) });
    } else console.log(`  note: online service ${net}, quick play went offline`);
    const m = await P.until(() => window.fgDebug().phase === 'match', 60000, null, 30);
    rec.playToMatchMs = m ? Date.now() - tPlay : null;
    check(`${tag}: match starts`, !!m, `${rec.playToMatchMs} ms`);
    const perf = await P.ev((mk) => ({ long: window.__perf.long.filter((x) => x[0] >= mk), gaps: window.__perf.gaps.filter((x) => x[0] >= mk) }), mark);
    rec.longestTask = perf.long.reduce((a, x) => Math.max(a, x[1]), 0);
    rec.longestGap = perf.gaps.reduce((a, x) => Math.max(a, x[1]), 0);
    check(`${tag}: no long task over 100 ms while searching / loading`, rec.longestTask <= 100, `longest ${rec.longestTask} ms, rAF gap ${rec.longestGap} ms`);
    if (m) await matchStartChecks(P, tag, dir, { shots: k === 1 });
    check(`${tag}: no page errors`, !P.errors.length, P.errors.slice(0, 2).join(' | '));
  } finally { await P.ctx.close(); }
  return rec;
}

// first launch: intro -> tutorial match
async function tutorial(browser, url, dir, k) {
  const vp = { w: 1366, h: 768, dpr: 1, name: '1366x768' };
  const tag = 'tuto_1366x768';
  const P = await newPage(browser, vp);
  const rec = { part: 'tutorial', run: k };
  try {
    const t0 = Date.now();
    await P.page.goto(url + (url.includes('?') ? '&' : '?') + 'offline=1');
    const intro = await P.until(() => window.fgDebug && window.fgDebug().screen === 'intro', 60000, null, 40);
    rec.toIntroMs = intro ? Date.now() - t0 : null;
    const m = await P.until(() => window.fgDebug().phase === 'match', 60000, null, 30);
    rec.toMatchMs = m ? Date.now() - t0 : null;
    check(`${tag}: tutorial starts`, !!m, `${rec.toMatchMs} ms`);
    const perf = await P.ev(() => ({ long: window.__perf.long, gaps: window.__perf.gaps }));
    rec.longestTask = perf.long.reduce((a, x) => Math.max(a, x[1]), 0);
    rec.longTasks = perf.long;
    if (m) await matchStartChecks(P, tag, dir, { shots: k === 1 });
    check(`${tag}: no page errors`, !P.errors.length, P.errors.slice(0, 2).join(' | '));
  } finally { await P.ctx.close(); }
  return rec;
}

// skin level 8 (special unlocked at 5): K label on the special button, the first-time hint once the special is ready,
// gone after K; the cooldown fill readable (dark fill drawn over the icon while cooling)
async function special(browser, url, dir, k) {
  const P = await newPage(browser, { w: 1366, h: 768, dpr: 1 });
  try {
    await P.page.goto(url + (url.includes('?') ? '&' : '?') + 'offline=1&mode=dm2v2&map=kitchen&level=8&seed=4&intro=0');
    const m = await P.until(() => window.fgDebug && window.fgDebug().phase === 'match', 60000);
    check('special: match runs', !!m);
    if (!m) return;
    const near = () => {
      const h = window.fgApp.match.hud, e = window.fgApp.engine, c = e.canvas, kk = c.getBoundingClientRect();
      const b = h.vbuttons.find((x) => x.type === 2), img = b && (b.node.children.find((ch) => ch.get('Image')) || b.node);
      if (!img || !img.activeInHierarchy) return { button: false };
      const q = e.ui.screenRect(img), bx = kk.left + (q[0] + q[2] / 2) * kk.width / c.width, by = kk.top + (c.height - q[1] - q[3] / 2) * kk.height / c.height;
      const lab = [...document.querySelectorAll('#fg-keys .k')].find((x) => x.textContent === 'K'), hint = document.querySelector('#fg-keys .hint');
      const box = (x) => { if (!x || !x.shown) return null; const r = x.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; };
      return { button: true, b: [bx, by, q[3] * kk.height / c.height], label: box(lab), hint: box(hint), cd: h.btn.specialCd ? h.btn.specialCd.fillAmount : null, ready: window.fgApp.match.runner.localAgent.cooldownSpecial <= 0 };
    };
    let s = await P.ev(near);
    check('special: button shown at skin level 8', s.button);
    check('special: K label under the special button', s.label && Math.abs(s.label[0] - s.b[0]) < s.b[2] * 0.3 && Math.abs(s.label[1] - s.b[1]) < s.b[2] * 0.7, JSON.stringify(s));
    check('special: cooldown fill drawn while cooling', s.ready || s.cd > 0.05, `fill ${s.cd}`);
    s = await P.until(() => { const r = window.fgApp.match.runner.localAgent; return r.cooldownSpecial <= 0 && r.hpCurrent > 0 ? 1 : null; }, 30000);
    await sleep(400);
    s = await P.ev(near);
    check('special: hint shown above the special button when ready', s.hint && s.hint[1] < s.b[1] && Math.abs(s.hint[0] - s.b[0]) < 400, JSON.stringify(s.hint));
    if (k === 1) await P.page.screenshot({ path: path.join(dir, 'special_hint.png') });
    await P.page.keyboard.down('KeyK'); await sleep(150); await P.page.keyboard.up('KeyK'); await sleep(500);
    s = await P.ev(near);
    check('special: hint gone after K, cooldown fill shown', !s.hint && s.cd > 0.05, `hint ${JSON.stringify(s.hint)} fill ${s.cd}`);
    check('special: hint not shown again (stored)', await P.ev(() => localStorage.getItem('fg-hint-special') === '1'));
  } finally { await P.ctx.close(); }
}

// phone: no key labels, controls unchanged
async function touch(browser, url) {
  const P = await newPage(browser, { w: 844, h: 390, dpr: 2 }, { hasTouch: true, isMobile: true });
  try {
    await P.page.goto(url + (url.includes('?') ? '&' : '?') + 'offline=1&mode=dm2v2&intro=0&seed=5');
    const m = await P.until(() => window.fgDebug && window.fgDebug().phase === 'match', 60000);
    await sleep(800);
    const pr = await P.ev(PROBE);
    check('touch 844x390: match runs', !!m);
    check('touch 844x390: no key labels', pr.keysEl === false, JSON.stringify(pr.keys));
    check('touch 844x390: backing = CSS x min(2, dpr)', Math.abs(pr.backing[0] - Math.round(pr.css[0] * Math.min(2, pr.dpr))) <= 1, `${pr.backing.join('x')} css ${pr.css.join('x')} dpr ${pr.dpr}`);
    // notched phone held sideways (iPhone 14: 47 px left / right, 21 px bottom): the SafeArea controls panel keeps the
    // joystick zone and the buttons out of the notch. Chromium has no notch, so the env() probe gets the insets inline.
    const span = () => P.ev(() => {
      const e = window.fgApp.engine, hd = window.fgApp.match.hud, k = e.canvas.getBoundingClientRect();
      const X = (n) => { const q = e.ui.screenRect(n); return [k.left + q[0] * k.width / e.canvas.width, k.left + (q[0] + q[2]) * k.width / e.canvas.width]; };
      const bs = hd.vbuttons.filter((v) => v.node.activeInHierarchy).map((v) => X(v.node));
      return { joyL: X(hd.joy.node)[0], btnR: Math.max(...bs.map((b) => b[1])), w: k.width };
    });
    const s0 = await span();
    await P.ev(() => { document.getElementById('fg-safe').style.padding = '0px 47px 21px 47px'; dispatchEvent(new Event('resize')); });
    await sleep(300);
    const s1 = await span();
    check('touch 844x390 notch: controls clear the 47 px safe-area insets', s1.joyL - s0.joyL > 46 && s1.joyL >= 46.5 && s0.btnR - s1.btnR > 46 && s1.btnR <= s1.w - 46.5,
      `joystick left ${s0.joyL.toFixed(0)} -> ${s1.joyL.toFixed(0)}, buttons right ${s0.btnR.toFixed(0)} -> ${s1.btnR.toFixed(0)} of ${s1.w}`);
  } finally { await P.ctx.close(); }
}

(async () => {
  const srv = process.env.FG_URL ? null : await serve();
  const url = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/index.html`;
  const browser = await chromium.launch({ args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const budget = Number(process.env.FG_TIMEOUT || 2400) * 1000;
  const killer = setTimeout(() => { console.log(`  FAIL timeout (${budget / 1000} s)`); process.exit(2); }, budget);
  try {
    for (let k = 1; k <= RUNS; k++) {
      console.log(`== run ${k}/${RUNS} ${url}`);
      const dir = path.join(OUT, process.env.FG_URL ? 'pages' : 'local');
      fs.mkdirSync(dir, { recursive: true });
      for (const part of PARTS) {
        try {
          if (part === 'desktop') for (const vp of VPS) { if (vp.name === '1366x768') vp.resize = [1600, 1000]; metrics.push(await desktop(browser, url, vp, dir, k)); }
          else if (part === 'online') metrics.push(await online(browser, url, dir, k));
          else if (part === 'tutorial') metrics.push(await tutorial(browser, url, dir, k));
          else if (part === 'touch') await touch(browser, url);
          else if (part === 'special') await special(browser, url, dir, k);
        } catch (e) { check(`${part} crashed`, false, String(e && e.stack || e).slice(0, 300)); }
      }
      // HUD proportions: the attack button's height over the HUD scale is the same 1280x720 reference size everywhere
      const hs = metrics.filter((r) => r.part === 'desktop' && r.run === k && r.attackPx && r.hudScale).map((r) => [r.vp, r.attackPx[3] / r.hudScale]);
      if (hs.length > 1) {
        const v = hs.map((x) => x[1]);
        check(`run ${k}: HUD buttons keep the reference proportions on every viewport`, (Math.max(...v) - Math.min(...v)) / Math.max(...v) < 0.02, hs.map((x) => `${x[0]} ${x[1].toFixed(1)}`).join(', '));
      }
    }
  } finally {
    clearTimeout(killer);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, process.env.FG_URL ? 'pages-report.json' : 'local-report.json'), JSON.stringify({ pass, fail, fails, metrics }, null, 1));
    await browser.close();
    if (srv) srv.close();
  }
  const sum = (part, key) => { const v = metrics.filter((r) => r.part === part && r[key] != null).map((r) => r[key]); return v.length ? `${Math.min(...v)}..${Math.max(...v)}` : '-'; };
  console.log(`\n  to menu ${sum('desktop', 'toMenuMs')} ms, BATTLE! -> match ${sum('desktop', 'playToMatchMs')} ms (offline), ${sum('online', 'playToMatchMs')} ms (online); longest task while loading ${sum('desktop', 'longestTask')} / ${sum('online', 'longestTask')} ms; first launch -> tutorial ${sum('tutorial', 'toMatchMs')} ms`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
