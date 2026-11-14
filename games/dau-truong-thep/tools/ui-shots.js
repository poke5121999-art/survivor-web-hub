'use strict';
// Screenshots every UI screen at desktop and phone-landscape size and asserts the basics.
// Run: timeout 300 node tools/ui-shots.js
const fs = require('fs');
const path = require('path');
const ROOT = '/home/bui-thanh-thuong/dau-truong-thep';
const { serve } = require(ROOT + '/tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
const { chromium } = require(PW);
const OUT = ROOT + '/.chk';
const PAGE = '/games/dau-truong-thep/tools/ui-harness.html';

let pass = 0, fail = 0;
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
      if (!(n instanceof HTMLElement) || n.classList.contains('fn') || n.parentElement.classList.contains('vig')) continue;
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

async function open(browser, name, vp, touch, query) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url()); });
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
  if (expectFn) await expectFn();
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  base = srv.base;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const sizes = [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 780, height: 360 }, true]];
    for (const [ctxName, vp, touch] of sizes) {
      const T = (s) => `${ctxName}-${s}`;
      // ----- menu
      let { ctx, page, errs } = await open(browser, T('menu'), vp, touch, 'screen=menu&fresh=1&lock=hac');
      await shot(page, errs, T('menu'), async () => {
        const r = await page.evaluate(() => ({
          title: document.querySelector('#ui .menu h1').textContent,
          cards: [...document.querySelectorAll('#ui .mc')].map((c) => (c.querySelector('img').src || '').slice(0, 10)),
          skills: document.querySelectorAll('#ui .detail .sk').length, bars: document.querySelectorAll('#ui .detail .st .bar i').length,
          diff: document.querySelectorAll('#ui .seg button').length, map: document.querySelectorAll('#ui .map').length,
          name: document.querySelector('#ui .pl-name').value, play: document.querySelector('#ui .play').textContent.trim(),
          lock: document.querySelectorAll('#ui .mc.locked').length, desc: document.querySelector('#ui .sk-tx p').textContent.length,
        }));
        check(T('menu') + ': title, 4 cards with portraits, 4 skill rows, 4 stat bars', r.title === 'Đấu Trường Thép' && r.cards.length === 4 && r.cards.every((s) => s === 'data:image') && r.skills === 4 && r.bars === 4, JSON.stringify(r));
        check(T('menu') + ': difficulty, map, player name, play button filled', r.diff === 3 && r.map === 1 && r.name && r.play && r.desc > 10, JSON.stringify(r));
        check(T('menu') + ': locked mech shows lock', r.lock === 1);
      });
      // locked mech: buy fails with no coins, play disabled
      await page.click('#ui .mc:nth-child(4)');
      await page.waitForTimeout(200);
      let st = await page.evaluate(() => ({ dis: document.querySelector('#ui .play').disabled, buy: !!document.querySelector('#ui .buy') }));
      check(T('menu') + ': locked mech disables play and offers buy', st.dis && st.buy);
      await page.click('#ui .buy');
      st = await page.evaluate(() => ({ toast: document.querySelector('#ui .toast').textContent, dis: document.querySelector('#ui .play').disabled }));
      check(T('menu') + ': buy without coins refused', /đủ xu/.test(st.toast) && st.dis, JSON.stringify(st));
      await shot(page, errs, T('menu-locked'), null, 300);
      await page.evaluate(() => { __G.meta.get().coins = 900; });
      await page.click('#ui .buy');
      st = await page.evaluate(() => ({ owned: __G.meta.get().owned.includes('hac'), coins: __G.meta.get().coins, dis: document.querySelector('#ui .play').disabled }));
      check(T('menu') + ': buying with coins unlocks and charges', st.owned && st.coins === 300 && !st.dis, JSON.stringify(st));
      // settings
      await page.click('#ui [data-r="bSet"]');
      await page.click('#ui .modal.on .seg button:nth-child(3)');
      await page.evaluate(() => { const r = document.querySelector('#ui .modal.on input[type=range]'); r.value = 35; r.dispatchEvent(new Event('input')); });
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
      await page.click('#ui .mc:nth-child(2)');
      await page.click('#ui .seg button:nth-child(3)');
      await page.click('#ui .play');
      const play = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('menu') + ': play emits ui:play with choice', play.length === 1 && play[0].mech === 'soi' && play[0].diff === 'hard' && play[0].map === 'denrung', JSON.stringify(play));
      await page.waitForTimeout(600);
      await shot(page, errs, T('hud-live'), async () => {
        const live = await page.evaluate(() => ({ hud: document.querySelector('#ui .hud').classList.contains('on'), menu: document.querySelector('#ui .menu').classList.contains('on') }));
        check(T('live') + ': play switches menu to HUD', live.hud && !live.menu, JSON.stringify(live));
      }, 1500);
      await ctx.close();

      // ----- hud
      ({ ctx, page, errs } = await open(browser, T('hud'), vp, touch, 'screen=hud&buffs=1&dead=1&mech=soi'));
      await page.waitForTimeout(400);
      await shot(page, errs, T('hud'), async () => {
        const r = await page.evaluate(() => {
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
        check(T('hud') + ': score, clock, 10 portrait cards, some dead', /^\d+$/.test(r.k0) && /^\d:\d\d$/.test(r.clock) && r.cards === 10 && r.dead >= 1, JSON.stringify(r));
        check(T('hud') + ': minimap painted', r.mmLit > 300, 'lit ' + r.mmLit);
        check(T('hud') + ': 5 skill slots with icons and key hints', r.slots.length === 5 && r.slots.every(Boolean) && r.keys === 'Chuột,Q,E,SPACE,F', r.keys);
        check(T('hud') + ': hp text, nameplates incl. own, buff chips', /\d+ \/ \d+/.test(r.hp) && r.nps >= 2 && r.self === 1 && r.chips >= 3, JSON.stringify(r));
        check(T('hud') + ': kill feed has entries after fighting', r.feed >= 1, 'feed ' + r.feed);
        check(T('hud') + ': mission line text', /chạm 25 điểm/.test(r.mission), r.mission);
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
      check(T('hud') + ': floating numbers (merged dealt 200, taken 210, shield 90, heal, pickup toast)', ['dealt:200', 'taken:210', 'shield:90', 'heal:+150', 'pick:+ Tăng tốc'].every((s) => fl.some((x) => x.endsWith(s) || x === s)), fl.join(' | '));
      await shot(page, errs, T('hud-fx'), async () => {
        const a = await page.evaluate(() => document.querySelector('#ui .ann b').textContent);
        check(T('hud') + ': announcement text', /Tiếp tế đang rơi|Chiến công đầu|Hạ/.test(a), a);
      }, 450);
      await ctx.close();

      // ----- low hp + player dead
      ({ ctx, page, errs } = await open(browser, T('low'), vp, touch, 'screen=hud&low=1&mech=hac'));
      await shot(page, errs, T('hud-low'), async () => {
        const v = await page.evaluate(() => document.querySelector('#ui .vig').classList.contains('on'));
        check(T('low') + ': low-hp vignette on', v);
      }, 700);
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

      // ----- result
      ({ ctx, page, errs } = await open(browser, T('result'), vp, touch, 'screen=result&fresh=1&levelup=1&mech=soi'));
      await shot(page, errs, T('result'), async () => {
        const r = await page.evaluate(() => ({
          banner: document.querySelector('#ui .rs-banner h1').textContent, rows: document.querySelectorAll('#ui .tb-r').length, me: document.querySelectorAll('#ui .tb-r.me').length,
          mvp: document.querySelectorAll('#ui .mvp').length, coins: document.querySelector('#ui [data-r="rc"]').textContent, xp: document.querySelector('#ui [data-r="rx"]').textContent,
          lvl: document.querySelector('#ui [data-r="rl"]').textContent, up: document.querySelector('#ui .lvup').classList.contains('on'),
          score: document.querySelector('#ui .rs-score').textContent.replace(/\s/g, ''), btns: [...document.querySelectorAll('#ui .rs-btns button')].map((b) => b.textContent),
        }));
        check(T('result') + ': THẮNG banner, score, 10 rows, one mine, one MVP', r.banner === 'Thắng' && /25:17/.test(r.score) && r.rows === 10 && r.me === 1 && r.mvp === 1, JSON.stringify(r));
        check(T('result') + ': rewards animate to non-zero, level-up shown', /\+[1-9]\d*/.test(r.coins) && /\+[1-9]\d* XP/.test(r.xp) && r.up && r.lvl === '2', JSON.stringify(r));
        check(T('result') + ': Đấu tiếp and Về sảnh buttons', r.btns.join('|') === 'Đấu tiếp|Về sảnh', r.btns.join('|'));
      }, 2600);
      await page.click('#ui .rs-btns .primary');
      const again = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').length);
      check(T('result') + ': Đấu tiếp emits ui:play', again >= 1);
      await ctx.close();
    }

    // ----- touch controls (phone only)
    {
      const { ctx, page, errs } = await open(browser, 'touch', { width: 780, height: 360 }, true, 'screen=hud&mech=ung&manual=1&auto=0');
      const cdp = await ctx.newCDPSession(page);
      await page.waitForTimeout(500);
      const t0 = await page.evaluate(() => ({ touch: __G.input.touch, on: document.getElementById('touch').classList.contains('on'), btns: [...document.querySelectorAll('#touch .tbtn')].filter((b) => b.getBoundingClientRect().width > 20).length, slots: getComputedStyle(document.querySelector('#ui .slots')).display }));
      check('touch: controls appear in the phone context (4 round buttons, desktop skill bar hidden)', t0.touch && t0.on && t0.btns === 4 && t0.slots === 'none', JSON.stringify(t0));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 250, id: 1 }, { x: 640, y: 290, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 250, id: 1 }, { x: 640, y: 245, id: 2 }] });
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => { const u = __G.match.units[0]; const i = __G.input.sample(u); return { i, on: [...document.querySelectorAll('#touch .stick.on')].length, ux: u.x, uz: u.z }; });
      check('touch: two simultaneous sticks (move right, aim up and fire)', s.on === 2 && s.i.mx > 0.5 && Math.abs(s.i.mz) < 0.1 && s.i.fire && Math.abs(s.i.aim + Math.PI / 2) < 0.2 && s.i.tz < s.uz - 3, JSON.stringify(s));
      await shot(page, errs, 'phone-touch', null, 200);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(100);
      const e = await page.evaluate(() => { const i = __G.input.sample(__G.match.units[0]); return { mx: i.mx, fire: i.fire, on: document.querySelectorAll('#touch .stick.on').length }; });
      check('touch: sticks release cleanly', e.mx === 0 && !e.fire && e.on === 0, JSON.stringify(e));
      const b = await page.evaluate(() => { const r = document.querySelector('#touch .tbtn.s1').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b[0], y: b[1], id: 5 }] });
      await page.waitForTimeout(80);
      const held = await page.evaluate(() => __G.input.sample(__G.match.units[0]).s1);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
      const rel = await page.evaluate(() => __G.input.sample(__G.match.units[0]).s1);
      check('touch: Q button held then released', held === true && rel === false, `${held}/${rel}`);
      await page.evaluate(() => { __G.match.units[0].cd.s1 = 6; });
      await page.waitForTimeout(150);
      const cd = await page.evaluate(() => ({ t: document.querySelector('#touch .tbtn.s1 .tb-t').textContent, p: document.querySelector('#touch .tbtn.s1').style.getPropertyValue('--p') }));
      check('touch: cooldown ring and seconds on a button', cd.t !== '' && /%/.test(cd.p), JSON.stringify(cd));
      await ctx.close();
    }

    // ----- portrait rotate hint
    {
      const { ctx, page, errs } = await open(browser, 'portrait', { width: 360, height: 780 }, true, 'screen=menu');
      await shot(page, errs, 'phone-portrait', async () => {
        const v = await page.evaluate(() => { const r = document.querySelector('#ui .rotate'); return getComputedStyle(r).display + '|' + r.textContent; });
        check('portrait: "Xoay ngang máy" overlay shown', /^flex\|.*Xoay ngang máy/.test(v), v);
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

    // ----- meta: garbage tolerance and rewards
    {
      const { ctx, page } = await open(browser, 'meta', { width: 800, height: 400 }, false, 'screen=menu&fresh=1');
      const r = await page.evaluate(async () => {
        const { makeMeta } = await import('/games/dau-truong-thep/js/meta.js');
        const out = {};
        for (const [k, raw] of Object.entries({ junk: '{{{nope', arr: '[1,2]', nulls: 'null', weird: JSON.stringify({ coins: 'x', level: -4, xp: 1e12, owned: [1, 'zzz', 'trau'], mech: 'ghost', diff: 'x', settings: { quality: 'ultra', volume: 9 }, stats: 5 }) })) {
          localStorage.setItem('dtt.save.v1', raw);
          const d = makeMeta().get();
          out[k] = d.coins === 0 && d.level >= 1 && d.xp >= 0 && d.owned.length >= 4 && ['low', 'medium', 'high'].includes(d.settings.quality) && d.settings.volume <= 1 && d.stats.matches === 0;
        }
        localStorage.removeItem('dtt.save.v1');
        const m = makeMeta();
        const rows = [{ id: 0, team: 0, kills: 5, assists: 2, deaths: 1 }, { id: 1, team: 1, kills: 1, assists: 0, deaths: 5 }];
        const res = m.applyResult({ rows, mvp: 0, winner: 0 }, 0);
        const again = makeMeta().get();
        return { out, res, saved: again.coins === res.coins && again.stats.wins === 1 && again.stats.kills === 5, ver: JSON.parse(localStorage.getItem('dtt.save.v1')).v };
      });
      check('meta: junk, array, null and out-of-range saves load as valid data', Object.values(r.out).every(Boolean), JSON.stringify(r.out));
      check('meta: applyResult pays win + kills + assists + mvp, persists, versioned', r.res.coins === 120 + 40 + 8 + 40 && r.res.xp === 125 && r.res.win && r.res.mvp && r.saved && r.ver === 1, JSON.stringify(r));
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
