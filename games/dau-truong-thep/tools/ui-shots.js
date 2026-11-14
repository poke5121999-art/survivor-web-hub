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
      if (!(n instanceof HTMLElement) || n.classList.contains('fn') || n.closest('.np, .pl') || n.parentElement.classList.contains('vig')) continue;
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
  const { MODE_ORDER, MODES } = await import('../js/data.js');
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  base = srv.base;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const sizes = [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 780, height: 360 }, true]];
    for (const [ctxName, vp, touch] of sizes) {
      const T = (s) => `${ctxName}-${s}`;
      // ----- menu: 8 mechs, locked mech, buy flow
      let { ctx, page, errs } = await open(browser, T('menu'), vp, touch, 'screen=menu&fresh=1&trophies=300');
      await shot(page, errs, T('menu'), async () => {
        const r = await page.evaluate(() => {
          const panel = document.querySelector('#ui .roster'), pb = panel.getBoundingClientRect();
          const cs = [...document.querySelectorAll('#ui .mc')];
          return {
            title: document.querySelector('#ui .menu h1').textContent,
            cards: cs.map((c) => (c.querySelector('img').src || '').slice(0, 10)),
            inside: cs.every((c) => { const b = c.getBoundingClientRect(); return b.top >= pb.top - 1 && b.bottom <= pb.bottom + 1; }),
            scrolls: panel.scrollHeight > panel.clientHeight + 1,
            skills: document.querySelectorAll('#ui .detail .sk').length, bars: document.querySelectorAll('#ui .detail .st .bar i').length,
            diff: document.querySelectorAll('#ui .seg button').length, map: document.querySelectorAll('#ui .map').length,
            name: document.querySelector('#ui .pl-name').value, play: document.querySelector('#ui .play').textContent.trim(),
            lock: document.querySelectorAll('#ui .mc.locked').length, desc: document.querySelector('#ui .sk-tx p').textContent.length,
            roleSvg: document.querySelectorAll('#ui .mc-role svg').length,
          };
        });
        check(T('menu') + ': title, 8 cards with portraits, 4 skill rows, 4 stat bars', r.title === 'Đấu Trường Thép' && r.cards.length === 8 && r.cards.every((x) => x === 'data:image') && r.skills === 4 && r.bars === 4 && r.roleSvg === 8, JSON.stringify(r));
        check(T('menu') + ': difficulty, map, player name, play button filled', r.diff === 3 && r.map === 5 && r.name && r.play === 'Vào trận' && r.desc > 10, JSON.stringify(r));
        check(T('menu') + ': 4 locked mechs show lock and price', r.lock === 4);
        if (ctxName === 'desktop') check(T('menu') + ': all 8 cards fit without scrolling at 1280x720', r.inside && !r.scrolls, JSON.stringify(r));
        else check(T('menu') + ': phone roster either fits or scrolls (reachability checked below)', true);
        const rk = await page.evaluate(() => ({ name: document.querySelector('#ui [data-r="rkName"]').textContent, tr: document.querySelector('#ui [data-r="rkTr"]').textContent, next: document.querySelector('#ui [data-r="rkNext"]').textContent, fill: document.querySelector('#ui [data-r="rkFill"]').style.transform }));
        check(T('menu') + ': rank badge shows Bạc, 300 cúp, 150 to Vàng, bar 25%', rk.name === 'Bạc' && rk.tr === '300' && /150 cúp nữa lên Vàng/.test(rk.next) && rk.fill === 'scaleX(0.25)', JSON.stringify(rk));
      });
      if (ctxName === 'phone') {
        await page.evaluate(() => { const p = document.querySelector('#ui .roster'); p.scrollTop = p.scrollHeight; });
        const last = await page.evaluate(() => { const p = document.querySelector('#ui .roster').getBoundingClientRect(), b = [...document.querySelectorAll('#ui .mc')].pop().getBoundingClientRect(); return b.bottom <= p.bottom + 1 && b.top >= p.top; });
        check(T('menu') + ': last card reachable by scrolling', last);
        await page.screenshot({ path: `${OUT}/ui-${T('menu-scrolled')}.png` });
        await page.evaluate(() => { document.querySelector('#ui .roster').scrollTop = 0; });
      }
      // locked mech: play button becomes a buy button, never starts a match
      await page.click('#ui .mc[data-mech="loi"]');
      await page.waitForTimeout(150);
      let st = await page.evaluate(() => ({ play: document.querySelector('#ui .play').textContent.trim(), buy: !!document.querySelector('#ui .buy'), tabs: document.querySelectorAll('#ui .tabs').length }));
      check(T('menu') + ': locked mech: play says "Mua Lôi Công", buy offered, no garage tab', st.play === 'Mua Lôi Công' && st.buy && st.tabs === 0, JSON.stringify(st));
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
      check(T('menu') + ': confirmed buy charges 900, selects the mech, play enabled', st.owned && st.coins === 1100 && st.play === 'Vào trận' && st.sel === 'loi' && st.coinTxt === '1100', JSON.stringify(st));

      // ----- garage: upgrade + paints
      await page.click('#ui .tabs [data-tab="garage"]');
      await shot(page, errs, T('garage'), async () => {
        const g = await page.evaluate(() => ({ pips: document.querySelectorAll('#ui .pip').length, on: document.querySelectorAll('#ui .pip.on').length, paints: document.querySelectorAll('#ui .pt').length, btn: document.querySelector('#ui [data-r="up"]').textContent.trim(), eq: document.querySelector('#ui .pt.eq').dataset.paint }));
        check(T('garage') + ': 5 pips (0 lit), 7 paints, original equipped, upgrade costs 150', g.pips === 5 && g.on === 0 && g.paints === 7 && g.eq === 'goc' && /150/.test(g.btn), JSON.stringify(g));
      }, 300);
      await page.click('#ui [data-r="up"]');
      await page.click('#ui [data-r="up"]');
      st = await page.evaluate(async () => ({ lv: __G.meta.get().upgrades.loi, coins: __G.meta.get().coins, on: document.querySelectorAll('#ui .pip.on').length, gain: [...document.querySelectorAll('#ui .gn')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()), btn: document.querySelector('#ui [data-r="up"]').textContent.trim(), badge: document.querySelector('#ui .mc[data-mech="loi"] .mc-lv').textContent, dmg: Math.round((await import('/games/dau-truong-thep/js/data.js')).MECHS.loi.weapon.dmg * 1.08) }));
      check(T('garage') + ': two upgrades cost 150 + 270, level 2, +8% stats, next cost 390', st.lv === 2 && st.coins === 680 && st.on === 2 && /2052\+8%/.test(st.gain[0]) && st.gain[1].includes(st.dmg + '+8%') && /390/.test(st.btn) && st.badge === '+2', JSON.stringify(st));
      // paint: buy with confirm, equip, portrait follows
      await page.click('#ui .pt[data-paint="vang"]');
      await page.click('#ui .modal.on [data-r="yes"]');
      await page.waitForTimeout(100);
      st = await page.evaluate(() => ({ coins: __G.meta.get().coins, owned: __G.meta.get().ownedPaints, eq: __G.meta.get().paints.loi, called: window.__portraitCalls.some((c) => c[0] === 'loi' && c[1] === 0 && c[2] === 'vang'), eqEl: document.querySelector('#ui .pt.eq').dataset.paint }));
      check(T('garage') + ': buying Vàng costs 200, equips it, portrait asked with paint "vang"', st.coins === 480 && st.owned.join() === 'goc,vang' && st.eq === 'vang' && st.called && st.eqEl === 'vang', JSON.stringify(st));
      await page.click('#ui .pt[data-paint="goc"]');
      st = await page.evaluate(() => ({ eq: __G.meta.get().paints.loi || null, coins: __G.meta.get().coins }));
      check(T('garage') + ': equipping original is free and clears the paint', st.eq === null && st.coins === 480, JSON.stringify(st));
      await page.click('#ui .pt[data-paint="vang"]');
      st = await page.evaluate(() => ({ eq: __G.meta.get().paints.loi, coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on') }));
      check(T('garage') + ': re-equipping an owned paint is free, no confirm', st.eq === 'vang' && st.coins === 480 && !st.modal, JSON.stringify(st));
      await page.evaluate(() => { __G.meta.get().coins = 100; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]');
      await page.click('#ui .tabs [data-tab="garage"]');
      await page.click('#ui .pt[data-paint="den"]');
      await page.click('#ui [data-r="up"]');
      st = await page.evaluate(() => ({ toast: document.querySelector('#ui .toast').textContent, lv: __G.meta.get().upgrades.loi, den: __G.meta.get().ownedPaints.includes('den'), coins: __G.meta.get().coins, modal: !!document.querySelector('#ui .modal.on') }));
      check(T('garage') + ': 100 coins cannot buy 250 paint nor a 390 upgrade ("Chưa đủ xu")', st.toast === 'Chưa đủ xu' && st.lv === 2 && !st.den && st.coins === 100 && !st.modal, JSON.stringify(st));
      await page.evaluate(() => { __G.meta.get().coins = 5000; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]');
      await page.click('#ui .tabs [data-tab="garage"]');
      for (let i = 0; i < 3; i++) await page.click('#ui [data-r="up"]');
      st = await page.evaluate(() => ({ lv: __G.meta.get().upgrades.loi, coins: __G.meta.get().coins, dis: document.querySelector('#ui [data-r="up"]').disabled, txt: document.querySelector('#ui [data-r="up"]').textContent.trim(), on: document.querySelectorAll('#ui .pip.on').length, again: __G.meta.upgrade('loi') }));
      check(T('garage') + ': levels 3..5 cost 390 + 510 + 630, then disabled "Đã tối đa" and upgrade() refuses', st.lv === 5 && st.coins === 5000 - 1530 && st.dis && st.txt === 'Đã tối đa' && st.on === 5 && st.again === false, JSON.stringify(st));
      await shot(page, errs, T('garage-max'), null, 300);
      await page.evaluate(() => { __G.meta.get().coins = 700; __G.meta.get().upgrades.loi = 2; __G.ui.showMenu(); });
      await page.click('#ui .mc[data-mech="loi"]');
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
      await page.click('#ui .seg button:nth-child(3)');
      await page.click('#ui .play');
      const play = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('menu') + ': play emits { mech, diff, map, mods, paint } with the garage level and paint', play.length === 1 && play[0].mech === 'loi' && play[0].diff === 'hard' && play[0].map === 'denrung' && Math.abs(play[0].mods.hp - 1.08) < 1e-9 && Math.abs(play[0].mods.dmg - 1.08) < 1e-9 && play[0].paint === 'vang', JSON.stringify(play));
      await page.waitForTimeout(600);
      await shot(page, errs, T('hud-live'), async () => {
        const live = await page.evaluate(() => ({ hud: document.querySelector('#ui .hud').classList.contains('on'), menu: document.querySelector('#ui .menu').classList.contains('on'), mine: window.__portraitCalls.filter((c) => c[0] === 'loi' && c[2] === 'vang').length > 0 }));
        check(T('live') + ': play switches menu to HUD, own HUD portrait uses the paint', live.hud && !live.menu && live.mine, JSON.stringify(live));
      }, 1500);
      await ctx.close();

      // ----- default play payload and Đấu tiếp
      ({ ctx, page, errs } = await open(browser, T('play'), vp, touch, 'screen=menu&fresh=1'));
      await page.click('#ui .mc[data-mech="soi"]');
      await page.click('#ui .play');
      const dp = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('menu') + ': default play carries neutral mods and paint "goc"', dp.length === 1 && dp[0].mech === 'soi' && dp[0].mods.hp === 1 && dp[0].mods.dmg === 1 && dp[0].paint === 'goc', JSON.stringify(dp));
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
        check(T('hud') + ': score, clock, 10 portrait cards, some dead', /^\d+$/.test(r.k0) && /^\d:\d\d$/.test(r.clock) && r.cards === 10 && r.dead >= 1, JSON.stringify(r));
        check(T('hud') + ': minimap painted', r.mmLit > 300, 'lit ' + r.mmLit);
        check(T('hud') + ': 5 skill slots with icons and key hints', r.slots.length === 5 && r.slots.every(Boolean) && r.keys === 'Chuột trái,Q,E,Cách,F', r.keys);
        check(T('hud') + ': hp text, nameplates incl. own, buff chips', /\d+ \/ \d+/.test(r.hp) && r.nps >= 2 && r.self === 1 && r.chips >= 3, JSON.stringify(r));
        check(T('hud') + ': a kill reported to the HUD shows in the kill feed', r.feed >= 1, 'feed ' + r.feed);
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
        check(T('result') + ': THẮNG banner, score, 10 rows, one mine, one MVP', r.banner === 'Thắng' && /25:17/.test(r.score) && r.rows === 10 && r.me === 1 && r.mvp === 1, JSON.stringify(r));
        check(T('result') + ': rewards animate to non-zero, level-up shown', /\+[1-9]\d*/.test(r.coins) && /\+[1-9]\d* XP/.test(r.xp) && r.up && r.lvl === '2', JSON.stringify(r));
        check(T('result') + ': Đấu tiếp and Về sảnh buttons', r.btns.join('|') === 'Đấu tiếp|Về sảnh', r.btns.join('|'));
        check(T('result') + ': 90 + 22 = 112 cúp, +22 shown, rank-up flourish "Lên hạng! Đồng"', r.trN === '112' && r.trD === '+22' && r.saved === 112 && r.rank === 'Đồng' && r.flourish && r.flText === 'Lên hạng! Đồng', JSON.stringify(r));
      }, 2600);
      await page.click('#ui .rs-btns .primary');
      const again = await page.evaluate(() => window.__log.filter((l) => l[0] === 'ui:play').map((l) => l[1]));
      check(T('result') + ': Đấu tiếp emits ui:play with mods and paint', again.length >= 1 && again[0].mods.hp === 1 && again[0].paint === 'goc', JSON.stringify(again));
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
            playIn: play.bottom <= vh + 1 && play.top >= 0, segs: document.querySelectorAll('#ui .seg button').length,
          };
        });
        check(T('menu-modes') + ': mode picker lists every mode of MODE_ORDER with its Vietnamese name', r.modes.join() === MODE_ORDER.map((k) => k + ':' + MODES[k].name).join(), r.modes.join());
        check(T('menu-modes') + ': saved mode (trum) is preselected and its blurb is shown', r.on === 'trum' && r.blurb === 'Năm người hợp sức hạ Cự Thần trước khi dùng hết 12 mạng.', JSON.stringify(r));
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
        const r = await page.evaluate(() => ({ mission: document.querySelector('#ui .mission').textContent, cols: document.querySelectorAll('#ui .pc').length, pts: document.querySelectorAll('#ui .ppt').length, rk: document.querySelectorAll('#ui .rkr').length, boss: document.querySelectorAll('#ui .bh').length, foe: getComputedStyle(document.querySelector('#ui .col.foe')).display }));
        check(T('hud-tdm') + ': unchanged bar: 10 portrait cards, both columns, no points, no ranking, no boss bar, mission from MODES.tdm', r.cols === 10 && r.foe !== 'none' && r.pts === 0 && r.rk === 0 && r.boss === 0 && r.mission === 'Hạ gục đối thủ, đội nào chạm 25 điểm trước sẽ thắng', JSON.stringify(r));
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
        check(T('hud-chiem') + ': scores 60 vs 45 toward the match target, both columns kept, mission has {target} filled', r.k.join() === '60,45' && r.tgt === String(r.target) && r.bar === `scaleX(${Math.round(60 / r.target * 200) / 200})` && r.cards === 10 && r.mission === `Đứng trong vòng để chiếm cứ điểm, đội nào đủ ${r.target} điểm trước sẽ thắng`, JSON.stringify(r));
      });
      await page.evaluate(() => __G.ui.event({ t: 'capture', point: 1, team: 0, x: 0, z: 0 }));
      await page.waitForFunction(() => document.querySelector('#ui .ann b').textContent === 'Đã chiếm cứ điểm B', null, { timeout: 4000 }).then(() => check(T('hud-chiem') + ': capture by my team announces "Đã chiếm cứ điểm B"', true), () => check(T('hud-chiem') + ': capture by my team announces "Đã chiếm cứ điểm B"', false, 'got ' + '?'));
      await page.waitForTimeout(2100);
      await page.evaluate(() => { __G.ui.event({ t: 'capture', point: 1, team: 1, x: 0, z: 0 }); });
      await page.waitForFunction(() => document.querySelector('#ui .ann b').textContent === 'Mất cứ điểm B', null, { timeout: 4000 }).then(() => check(T('hud-chiem') + ': losing a point announces "Mất cứ điểm B"', true), () => check(T('hud-chiem') + ': losing a point announces "Mất cứ điểm B"', false));
      await ctx.close();

      ({ ctx, page, errs } = await hudOpen('tudo'));
      await page.evaluate(() => { const m = __G.match; [3, 9, 1, 7, 2, 5, 0, 4, 6, 8].forEach((v, i) => { m.score[i] = v; }); });
      await shot(page, errs, T('hud-tudo'), async () => {
        const r = await page.evaluate(() => ({
          rows: [...document.querySelectorAll('#ui .rkr:not([hidden])')].map((n) => n.dataset.id + ':' + n.querySelector('.rk-p').textContent + ':' + n.querySelector('.rk-k').textContent),
          me: document.querySelector('#ui .rkr.me').dataset.id, k: [document.querySelector('#ui [data-r="k0"]').textContent, document.querySelector('#ui [data-r="k1"]').textContent],
          who: document.querySelector('#ui [data-r="w1"]').textContent, target: __G.match.target, tgt: document.querySelector('#ui [data-r="tgt"]').textContent,
          foe: getComputedStyle(document.querySelector('#ui .col.foe')).display, pc: document.querySelectorAll('#ui .pc').length,
          badPlates: document.querySelectorAll('#ui .np:not(.self).t0').length, plates: document.querySelectorAll('#ui .np.t1').length, selfT0: document.querySelectorAll('#ui .np.self.t0').length,
          mission: document.querySelector('#ui .mission').textContent,
        }));
        const names = await page.evaluate(() => __G.match.units[__G.match.units.length - 1].name);
        check(T('hud-tudo') + ': ranking = top 5 by kills (ids 1,9,3,8,5 on 9,8,7,6,5) then my own row at place 7 with 3 kills', r.rows.join() === '1:1:9,9:2:8,3:3:7,8:4:6,5:5:5,0:7:3' && r.me === '0', r.rows.join());
        check(T('hud-tudo') + ': top bar = my 3 kills vs leader 9 toward the target, leader named; no right column, no team cards', r.k.join() === '3,9' && /^Dẫn đầu: /.test(r.who) && r.tgt === String(r.target) && r.foe === 'none' && r.pc === 0, JSON.stringify(r));
        check(T('hud-tudo') + ': 9 other nameplates use the enemy colour, mine the ally colour; mission has {target} filled', r.badPlates === 0 && r.plates === 9 && r.selfT0 === 1 && r.mission === `Không có đồng đội: hạ gục ${r.target} lần trước mọi người`, JSON.stringify(r));
      });
      await page.evaluate(() => { __G.ui.event({ t: 'death', id: 2, by: 3, assists: [], x: 0, z: 0 }); });
      await page.waitForTimeout(200);
      {
        const f = await page.evaluate(() => ({ t0: document.querySelectorAll('#ui .kf b.t0').length, t1: document.querySelectorAll('#ui .kf b.t1').length }));
        check(T('hud-tudo') + ': kill feed between two rivals uses no ally colour', f.t0 === 0 && f.t1 === 2, JSON.stringify(f));
        await page.evaluate(() => { const m = __G.match; m.score[0] = 11; m.score[9] = 4; });
        await page.waitForTimeout(250);
        const r2 = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#ui .rkr:not([hidden])')].map((n) => n.dataset.id).join(), who: document.querySelector('#ui [data-r="w1"]').textContent }));
        check(T('hud-tudo') + ': ranking re-sorts live: my 11 kills puts me first, rival label switches to "Đối thủ"', r2.rows === '0,1,3,8,5' && /^Đối thủ: /.test(r2.who), JSON.stringify(r2));
      }
      await ctx.close();

      ({ ctx, page, errs } = await hudOpen('trum'));
      await page.evaluate(() => { const m = __G.match, b = m.units.find((u) => u.def.boss); b.hp = b.maxHp * 0.5; m.lives = 7; });
      await shot(page, errs, T('hud-trum'), async () => {
        const r = await page.evaluate(() => ({
          w: document.querySelector('#ui .bh-fill').style.width, num: document.querySelector('#ui [data-r="num"]').textContent, name: document.querySelector('#ui [data-r="bname"]').textContent,
          pips: document.querySelectorAll('#ui .lp').length, on: document.querySelectorAll('#ui .lp.on').length, lvn: document.querySelector('#ui [data-r="lvn"]').textContent,
          mine: document.querySelectorAll('#ui .col.mine .pc').length, foe: getComputedStyle(document.querySelector('#ui .col.foe')).display, bossPlate: document.querySelectorAll('#ui .np.boss').length,
          bossBar: document.querySelector('#ui .np.boss .np-hp').getBoundingClientRect().width, plain: document.querySelector('#ui .np:not(.boss):not(.self) .np-hp').getBoundingClientRect().width,
          mission: document.querySelector('#ui .mission').textContent, max: __G.match.units.find((u) => u.def.boss).maxHp,
        }));
        const dots = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        check(T('hud-trum') + ': boss bar named Cự Thần, fill width 50% at half hp, numbers half / max with dot thousands', r.name === 'Cự Thần' && r.w === '50%' && r.num === `${dots(r.max / 2)} / ${dots(r.max)}`, JSON.stringify(r));
        check(T('hud-trum') + ': 12 life pips with 7 lit and count 7; left column = my 5 mechs; no right column', r.pips === 12 && r.on === 7 && r.lvn === '7' && r.mine === 5 && r.foe === 'none', JSON.stringify(r));
        check(T('hud-trum') + ': boss nameplate is wider than a normal one; mission has {lives} filled', r.bossPlate === 1 && r.bossBar > r.plain * 1.5 && r.mission === 'Hạ Cự Thần trước khi cả đội dùng hết 12 mạng', JSON.stringify(r));
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
          if (tag === 'chiem') check(T('result-chiem') + ': two team tables of 5, banner Thắng, trophy block shown and +22 cúp saved', r.tables === 2 && r.rows === 10 && r.banner === 'Thắng' && r.mine === 1 && r.trophyBlock && r.trophies === 322, JSON.stringify(r));
          if (tag === 'tudo') check(T('result-tudo') + ': one ranking of 10, banner "Hạng 3/10", my row 3rd and highlighted, drawn colour, no trophy block, cúp unchanged 300', r.tables === 1 && r.rows === 10 && r.banner === 'Hạng 3/10' && r.meIdx === 2 && r.mine === 1 && /draw/.test(r.cls) && !r.trophyBlock && r.trophies === 300 && r.places === '1,2,3,4,5,6,7,8,9,10', JSON.stringify(r));
          if (tag === 'trum') check(T('result-trum') + ': "Đã hạ Cự Thần", 5 rows sorted by damage on the boss, no trophy block, cúp unchanged', r.banner === 'Đã hạ Cự Thần' && /win/.test(r.cls) && r.rows === 5 && r.dmg === '13.000,10.500,8.000,7.000,5.500' && !r.trophyBlock && r.trophies === 300, JSON.stringify(r));
          if (tag === 'trum-lose') check(T('result-trum-lose') + ': "Cự Thần thắng" with the lose banner', r.banner === 'Cự Thần thắng' && /lose/.test(r.cls) && r.trophies === 300, JSON.stringify(r));
        }, 2200);
        await ctx.close();
      }

      // ----- keys: bindings API, Phím tab, HUD hints, scoreboard (a desktop-input context at both sizes: touch hides every key hint)
      const KEYS = '/games/dau-truong-thep/js/keys.js';
      const DEF = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], fire: ['Mouse0'], s1: ['KeyQ'], s2: ['KeyE'], ult: ['Space'], heal: ['KeyF'], score: ['Tab'], pause: ['Escape'] };
      const getB = (pg) => pg.evaluate(async (u) => (await import(u)).getBindings(), KEYS);
      const sampleOf = (pg) => pg.evaluate(() => { const i = __G.input.sample(__G.match.units[0]); return { s1: i.s1, s2: i.s2, fire: i.fire, ult: i.ult, heal: i.heal, mx: i.mx, mz: i.mz }; });
      const ACTION_IDS = Object.keys(DEF);
      if (ctxName === 'desktop') {
        ({ ctx, page, errs } = await open(browser, T('keys-api'), vp, false, 'screen=hud&manual=1&auto=0&mech=soi&freeze=1&warp=5'));
        let r = await page.evaluate(async (u) => { const K = await import(u); return { b: K.getBindings(), l: ['up', 's1', 'fire', 'ult', 'heal', 'score', 'pause'].map(K.labelFor), n: K.ACTIONS.length }; }, KEYS);
        check('keys: defaults are WASD+arrows, Mouse0 fire, Q/E/Space/F, Tab scoreboard, Esc pause; labels in Vietnamese', JSON.stringify(r.b) === JSON.stringify(DEF) && r.l.join() === 'W,Q,Chuột trái,Cách,F,Tab,Esc' && r.n === 11, JSON.stringify(r));
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
        check(T('keys-idle') + ': Phím tab lists 11 actions with their keys in Vietnamese and a "Về mặc định" button',
          r.on === 'Cài đặt' && r.rows === 11 && r.caps.join() === 'W,↑,S,↓,A,←,D,→,Chuột trái,Q,E,Cách,F,Tab,Esc' && r.names[0] === 'Đi lên' && r.names.includes('Bảng điểm (giữ)') && r.reset, JSON.stringify(r));
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
      const kit = await page.evaluate(() => [...document.querySelectorAll('#ui .detail .sk-ic kbd')].map((k) => k.textContent).join());
      check(T('keys') + ': the garage skill rows show bound keys (fire R, Chiêu 1 Chuột trái, Chiêu 2 E, ult Cách)', kit === 'R,Chuột trái,E,Cách', kit);
      await page.click('#ui [data-r="bHelp"]');
      const help = await page.evaluate(() => [...document.querySelectorAll('#ui .help-cols kbd')].map((k) => k.textContent).join());
      check(T('keys') + ': "Cách chơi" lists the bound keys', help === 'W,A,S,D,Chuột,R,Chuột trái,E,Cách,Y,Tab,Esc', help);
      await page.click('#ui .modal.on [data-r="close"]');
      await page.click('#ui [data-r="bSet"]'); await page.click('#ui [data-st="keys"]');
      await page.click('#ui [data-r="kreset"]');
      kb = await getB(page);
      check(T('keys') + ': "Về mặc định" restores the table', JSON.stringify(kb) === JSON.stringify(DEF), JSON.stringify(kb));
      await ctx.close();

      // HUD after a rebind: slot labels equal labelFor, pause hint and the pause key follow
      ({ ctx, page, errs } = await open(browser, T('hud-rebound'), vp, false, 'screen=hud&fresh=1&freeze=1&warp=60&mech=soi'));
      await page.evaluate(async (u) => { const K = await import(u); K.bind('s1', 'KeyR'); K.bind('ult', 'KeyV'); K.bind('fire', 'Mouse2'); K.bind('pause', 'KeyP'); }, KEYS);
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
          const want = { tdm: [2, 10, 'Đấu đội'], nha: [2, 10, 'Thủ nhà'], tudo: [1, 10, 'Hỗn chiến'] }[mode];
          check(T('scoreboard-' + mode) + ': holding Tab shows the overlay with ' + want[0] + ' table(s), 10 players, mode name, my row marked', r.on && r.tables === want[0] && r.rows === want[1] && r.top.includes(want[2]) && r.me === 1 && /Sát thương/.test(r.head) && (mode === 'tudo' ? /Hạ gục/.test(r.head) : /K \/ D \/ A/.test(r.head)), JSON.stringify(r));
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
      check(T('lobby-theme-guest') + ': guest sees the room theme read-only ("Đầm đêm") and the random layout', gk === 'Chế độĐấu đội | Đấu trườngNgẫu nhiên | Môi trườngĐầm đêm | Độ khó botVừa' && (await page.evaluate(() => document.querySelectorAll('#ui .lb-set .th').length)) === 0, gk);
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
        check(T('hud-nha') + ': top bar has 3 pips per team (4 small + 2 big), clock, tower score 0:0, mission from MODES.nha, 10 portrait cards', r.pips === 6 && r.mains === 2 && r.subs === 4 && /^[78]:\d\d$/.test(r.clock) && r.kills === '0:0' && r.mission === MODES.nha.mission && r.cols === 10 && r.bars === 6, JSON.stringify(r));
        check(T('hud-nha') + ': minimap title shows layout and theme', /^Đền Rừng · Rừng mưa$/.test(r.mm), r.mm);
        const info = await tw.info();
        check(T('hud-nha') + ': at the start every sub is up at 100%, both mains are locked with a visible lock', [...ID.mySub, ...ID.foeSub].every((i) => info[i].state === 'up' && info[i].hp === '100%' && info[i].lock === 'none') && [ID.myMain, ID.foeMain].every((i) => info[i].state === 'locked' && info[i].lock !== 'none' && info[i].hp === '100%'), JSON.stringify(info));
      }, 700);
      // forced tower state drives the pips
      await page.evaluate((id) => { const m = __G.match; m.towers[id.mySub[0]].hp = 3500; m.towers[id.foeSub[0]].hp = 0; m.towers[id.foeSub[0]].alive = false; m.towers[id.foeMain].hp = 8250; }, ID);
      await page.waitForTimeout(150);
      let info = await tw.info();
      check(T('hud-nha') + ': pips follow forced hp/alive: my sub 3500/7000 = 50%, foe sub dead, foe main still locked', info[ID.mySub[0]].hp === '50%' && info[ID.mySub[0]].state === 'up' && info[ID.foeSub[0]].state === 'down' && info[ID.foeMain].state === 'locked' && info[ID.foeMain].hp === '75%' && info[ID.foeSub[1]].state === 'up', JSON.stringify(info));
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
            tables: document.querySelectorAll('#ui .rs-tables .tb').length, rows: document.querySelectorAll('#ui .rs-tables .tb-r').length, tr: !!document.querySelector('#ui [data-r="trN"]'), trophies: __G.meta.get().trophies,
          }));
          const wantTowers = { win: ['2.300/Đã đổ/8.800', 'Đã đổ/Đã đổ/Đã đổ'], lose: ['Đã đổ/Đã đổ/Đã đổ', 'Đã đổ/7.000/6.200'], clock: ['3.200/7.000/9.000', '7.000/5.100/7.400'] }[tag];
          check(T('result-nha-' + tag) + `: verdict "${title}", banner ${outcome}, cúp ${trophies}, reward block with trophies, 2 tower groups, 2 tables of 5`, r.h1 === title && r.banner.includes(outcome) && r.groups === 2 && r.tables === 2 && r.rows === 10 && r.tr && r.trophies === trophies, JSON.stringify(r));
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
        check(T('online') + ': room list rows: name, host, mode, map, players/max, join (full room disabled)', r.rows.join(' ; ') === 'Phòng của Bão Số 9|Chủ phòng: Bão Số 9|Đấu đội|Đền Rừng|3/10|Vào|false ; Săn trùm cuối tuần|Chủ phòng: Cò Lả|Săn trùm|Miệng Lửa|5/10|Vào|false ; Hỗn chiến chớp nhoáng|Chủ phòng: Mèo Mun|Hỗn chiến|Cảng Băng|10/10|Đầy|true', r.rows.join(' ; '));
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
      await page.waitForSelector('#ui .rm-empty b');
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
      await page.waitForSelector('#ui .rm-empty b');
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
          swaps: document.querySelectorAll('#ui .seat .btn.mini').length, modes: document.querySelectorAll('#ui .lb-set .mode').length, maps: document.querySelectorAll('#ui .lb-set .map').length, diffs: document.querySelectorAll('#ui .lb-set .seg button').length,
          start: !!document.querySelector('#ui .lobby [data-a="start"]'), ready: !!document.querySelector('#ui .lobby [data-a="ready"]'), swapMe: !document.querySelector('#ui .lobby [data-a="swapme"]').disabled,
          calls: __G.online.calls.filter((c) => c[0] === 'setMine').map((c) => JSON.stringify(c[1])),
        }));
        check(T('lobby-host') + ': code K7QX2, two team columns with 5 seats each, empty seats read "Bot"', r.code === 'K7QX2' && r.cols === 2 && r.seats === 10 && r.bots === 6 && r.botText === 'Bot', JSON.stringify(r));
        check(T('lobby-host') + ': one own row, one host badge, 4 portraits, 4 owned mechs with one selected, "Đổi đội" on every player', r.me === 1 && r.host === 1 && r.imgs === 'data:image,data:image,data:image,data:image' && r.mine === 4 && r.sel === 1 && r.swaps === 4, JSON.stringify(r));
        check(T('lobby-host') + ': host controls (every mode, 4 maps, 3 difficulties, Bắt đầu), no Sẵn sàng toggle', r.modes === MODE_ORDER.length && r.maps === 5 && r.diffs === 3 && r.start && !r.ready && r.swapMe, JSON.stringify(r));
        check(T('lobby-host') + ': entering pushes my mech, paint and mods from meta', r.calls.length === 1 && r.calls[0] === '{"mech":"trau","paint":"goc","mods":{"hp":1,"dmg":1}}', r.calls.join());
      });
      await page.click('#ui .lobby [data-a="start"]');
      check(T('lobby-host') + ': Bắt đầu with an unready player shows online.error inline', (await page.textContent('#ui .lobby .lb-act .ol-err')) === 'Còn người chơi chưa sẵn sàng.');
      await page.click('#ui .lobby .mode[data-k="chiem"]'); await page.click('#ui .lobby .map[data-k="cangbang"]'); await page.click('#ui .lobby .seg [data-k="hard"]');
      await page.click('#ui .lobby .lm[data-k="soi"]'); await page.click('#ui .lobby [data-a="swapme"]'); await page.click('#ui .lobby .seat[data-pid="p2"] [data-a="swap"]');
      const hc = await page.evaluate(() => ({ calls: __G.online.calls.slice(-7).map((c) => c[0] + ':' + JSON.stringify(c[1])), L: __G.online.lobby.mode + ',' + __G.online.lobby.map + ',' + __G.online.lobby.diff, mech: __G.online.lobby.players[0].mech, sel: document.querySelector('#ui .lm.sel b').textContent, teams: __G.online.lobby.players.map((p) => p.team).join('') }));
      check(T('lobby-host') + ': mode, map, difficulty, mech and both swap buttons reach online.*', hc.L === 'chiem,cangbang,hard' && hc.mech === 'soi' && hc.sel === 'Sói Lửa' && hc.teams === '1111', JSON.stringify(hc));
      await page.click('#ui .lobby .mode[data-k="trum"]');
      check(T('lobby-host') + ': Săn trùm with 4 players: one team and a boss card, swap buttons gone', await page.evaluate(() => document.querySelectorAll('#ui .lb-team').length === 2 && !!document.querySelector('#ui .bossbox') && document.querySelectorAll('#ui .seat .btn.mini').length === 0 && document.querySelector('#ui .lobby [data-a="swapme"]').disabled));
      await page.click('#ui .lobby [data-a="leave"]');
      check(T('lobby-host') + ': Rời phòng calls leave() and shows the menu', (await calls(page)).includes('leave') && await page.evaluate(() => !!document.querySelector('#ui .menu.on') && !document.querySelector('#ui .lobby.on')));
      await ctx.close();

      ({ ctx, page, errs } = await open(browser, T('lobby-guest'), vp, touch, 'screen=lobby&role=guest&fill=5&fresh=1'));
      await shot(page, errs, T('lobby-guest'), async () => {
        const r = await page.evaluate(() => ({
          start: !!document.querySelector('#ui .lobby [data-a="start"]'), ready: !!document.querySelector('#ui .lobby [data-a="ready"]'), modes: document.querySelectorAll('#ui .lb-set .mode').length, swaps: document.querySelectorAll('#ui .seat .btn.mini').length,
          kv: [...document.querySelectorAll('#ui .lb-set .kv b')].map((b) => b.textContent).join(), me: document.querySelector('#ui .seat.me .st-n > span').textContent,
        }));
        check(T('lobby-guest') + ': guest has Sẵn sàng, read-only settings, no Bắt đầu, no per-player swap', !r.start && r.ready && r.modes === 0 && r.swaps === 0 && r.kv === 'Đấu đội,Đền Rừng,Theo bố cục,Vừa' && r.me === 'Phi công', JSON.stringify(r));
      });
      await page.click('#ui .lobby [data-a="ready"]');
      check(T('lobby-guest') + ': Sẵn sàng toggles my ready flag (true -> false)', (await page.evaluate(() => __G.online.lobby.players[1].ready)) === false && (await page.getAttribute('#ui .lobby [data-a="ready"]', 'aria-pressed')) === 'false');
      await page.click('#ui .lobby [data-a="swapme"]');
      check(T('lobby-guest') + ': Đổi đội asks online.swapTeam(online.me)', (await calls(page)).includes('swapTeam:p1'), (await calls(page)).join());
      await ctx.close();

      for (const [mode, tag, seats, extra] of [['tudo', 'tudo', 10, 'one list'], ['trum', 'trum', 5, 'one team + boss']]) {
        ({ ctx, page, errs } = await open(browser, T('lobby-' + tag), vp, touch, `screen=lobby&role=guest&fill=${mode === 'tudo' ? 7 : 4}&rmode=${mode}&fresh=1`));
        await shot(page, errs, T('lobby-' + tag), async () => {
          const r = await page.evaluate(() => ({ teams: document.querySelectorAll('#ui .lb-team').length, seats: document.querySelectorAll('#ui .lb-team .seat').length, boss: !!document.querySelector('#ui .bossbox'), swap: document.querySelector('#ui .lobby [data-a="swapme"]').disabled, head: document.querySelector('#ui .lb-th b').textContent }));
          if (mode === 'tudo') check(T('lobby-tudo') + ': Hỗn chiến is one list of 10 seats, Đổi đội disabled', r.teams === 1 && r.seats === 10 && r.head === 'Hỗn chiến' && r.swap, JSON.stringify(r));
          else check(T('lobby-trum') + ': Săn trùm is one team of 5 seats plus the boss card, Đổi đội disabled', r.teams === 2 && r.seats === 5 && r.boss && r.swap, JSON.stringify(r));
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
        const weird = JSON.stringify({ coins: 'x', level: -4, xp: 1e12, owned: [1, 'zzz', 'trau'], mech: 'ghost', diff: 'x', settings: { quality: 'ultra', volume: 9 }, stats: 5, upgrades: { trau: 99, soi: -3, ghost: 2, hac: 'x' }, paints: { trau: 'vang', soi: 'nope', hac: 5 }, ownedPaints: ['vang', 7, 'zzz', 'constructor'], trophies: -50 });
        for (const [k, raw] of Object.entries({ junk: '{{{nope', arr: '[1,2]', nulls: 'null', weird, badMaps: JSON.stringify({ upgrades: [1], paints: 'x', ownedPaints: 'y', trophies: 'z' }) })) {
          localStorage.setItem('dtt.save.v1', raw);
          const d = makeMeta().get();
          out[k] = d.coins === 0 && d.level >= 1 && d.xp >= 0 && d.owned.length >= 4 && ['low', 'medium', 'high'].includes(d.settings.quality) && d.settings.volume <= 1 && d.stats.matches === 0
            && d.trophies === 0 && d.ownedPaints.includes('goc') && typeof d.upgrades === 'object' && typeof d.paints === 'object';
        }
        localStorage.setItem('dtt.save.v1', weird);
        const w = makeMeta().get();
        const weirdOk = w.upgrades.trau === 5 && w.upgrades.soi === undefined && w.upgrades.ghost === undefined && w.ownedPaints.join() === 'goc,vang' && w.paints.trau === 'vang' && w.paints.soi === undefined;
        localStorage.setItem('dtt.save.v1', JSON.stringify({ v: 1, name: 'Cũ', coins: 77, level: 3, xp: 5, owned: ['trau', 'soi', 'ung', 'hac'] }));
        const old = makeMeta().get();
        const oldOk = old.coins === 77 && old.level === 3 && old.trophies === 0 && Object.keys(old.upgrades).length === 0 && old.ownedPaints.join() === 'goc';
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
        log.notOwned = g.upgrade('loi');
        log.up1 = g.upgrade('trau'); log.c1 = d.coins; log.l1 = d.upgrades.trau;
        log.up2 = g.upgrade('trau'); log.c2 = d.coins; log.l2 = d.upgrades.trau;
        d.coins = 100; log.poor = g.upgrade('trau'); log.cPoor = d.coins; log.lPoor = d.upgrades.trau;
        d.coins = 99999; for (let i = 0; i < 3; i++) g.upgrade('trau');
        log.c5 = d.coins; log.l5 = d.upgrades.trau; log.max = g.upgrade('trau'); log.cMax = d.coins;
        d.coins = 100;
        log.paintPoor = g.buyPaint('den'); log.cp = d.coins;
        d.coins = 600;
        log.paintBuy = g.buyPaint('tim'); log.cBuy = d.coins; log.paintAgain = g.buyPaint('tim'); log.cAgain = d.coins;
        log.badPaint = g.buyPaint('zzz');
        log.equipUnowned = g.setPaint('trau', 'hong');
        log.equip = g.setPaint('trau', 'tim'); log.eq = d.paints.trau;
        log.equipLockedMech = g.setPaint('loi', 'tim');
        log.reset = g.setPaint('trau', 'goc'); log.eq2 = d.paints.trau;
        g.setPaint('trau', 'tim');
        const reload = makeMeta().get();
        log.persist = reload.upgrades.trau === 5 && reload.paints.trau === 'tim' && reload.ownedPaints.join() === 'goc,tim';

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
      check('meta: garbage upgrades/paints are clamped or dropped (level 99 -> 5, unknown keys gone, trophies >= 0)', r.weirdOk);
      check('meta: an old save without the new fields loads with defaults and keeps coins and level', r.oldOk);
      check('meta: applyResult pays win + kills + assists + mvp, +22 trophies, persists, versioned', r.base.res.coins === 120 + 40 + 8 + 40 && r.base.res.xp === 125 && r.base.res.win && r.base.res.mvp && r.base.saved && r.base.ver === 1 && r.base.res.trophiesBefore === 0 && r.base.res.trophiesAfter === 22 && r.base.res.rankAfter.name === 'Sắt', JSON.stringify(r.base));
      const L = r.log;
      check('meta: upgrade() refuses an unowned mech, charges 150 then 270, refuses when poor', L.notOwned === false && L.up1 === true && L.c1 === 850 && L.l1 === 1 && L.up2 === true && L.c2 === 580 && L.l2 === 2 && L.poor === false && L.cPoor === 100 && L.lPoor === 2, JSON.stringify(L));
      check('meta: levels 3..5 cost 390 + 510 + 630, level 6 refused without charging', L.c5 === 99999 - 1530 && L.l5 === 5 && L.max === false && L.cMax === L.c5, JSON.stringify(L));
      check('meta: buyPaint charges once (tim 300), refuses when poor or unknown, owned paint is free', L.paintPoor === false && L.cp === 100 && L.paintBuy === true && L.cBuy === 300 && L.paintAgain === true && L.cAgain === 300 && L.badPaint === false, JSON.stringify(L));
      check('meta: setPaint needs an owned paint and mech, goc clears it, everything persists', L.equipUnowned === false && L.equip === true && L.eq === 'tim' && L.equipLockedMech === false && L.reset === true && L.eq2 === undefined && L.persist, JSON.stringify(L));
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
        out.tdm = pay({ rows: [row(0, 0), row(1, 1)], mvp: 1, winner: 0, score: [25, 3], time: 90 });
        out.chiem = pay({ rows: [row(0, 0), row(1, 1)], mvp: 1, winner: 1, score: [20, 150], time: 90, mode: 'chiem' });
        out.modes = [modeOf(ffa(1, [1, 1, 1, 1, 1, 1, 1, 1, 1], 0)), modeOf(boss(true, 1)), modeOf({ rows: [row(0, 0), row(1, 1)] }), modeOf({ mode: 'chiem', rows: [] })];
        localStorage.setItem(KEY, JSON.stringify({ mode: 'trum' })); out.savedMode = makeMeta().get().mode;
        localStorage.setItem(KEY, JSON.stringify({ mode: 'zzz' })); out.badMode = makeMeta().get().mode;
        localStorage.removeItem(KEY); out.defMode = makeMeta().get().mode;
        return out;
      });
      check('meta: tudo pays by place: 1st = win 120+12*8 and +100 xp, 2nd/3rd = draw 80, 6th = lose 60; cúp untouched (100)', m2.first.slice(0, 3).join() === '216,160,true' && m2.first[4] === 100 && m2.first[5] === false && m2.first[6] === 1 && m2.first[7] === 1
        && m2.third[0] === 80 + 8 * 8 && m2.third[3] === true && m2.third[2] === false && m2.third[4] === 100 && m2.third[6] === 3 && m2.second[0] === 80 + 10 * 8 && m2.second[6] === 2 && m2.sixth[0] === 60 + 5 * 8 && m2.sixth[2] === false && m2.sixth[3] === false && m2.sixth[4] === 100 && m2.sixth[6] === 5 + 1, JSON.stringify(m2));
      check('meta: trum win = 1.5x win base (180) + damage part round(8*8000/4000)=16 ; loss = 60 + 16; cúp untouched', m2.bossWin[0] === 180 + 16 && m2.bossWin[2] === true && m2.bossWin[4] === 100 && m2.bossWin[5] === false && m2.bossLose[0] === 60 + 16 && m2.bossLose[2] === false, JSON.stringify([m2.bossWin, m2.bossLose]));
      check('meta: trophies still change in tdm (+22) and chiem (loss -12), mode is inferred from the summary shape', m2.tdm[4] === 122 && m2.tdm[5] === true && m2.chiem[4] === 88 && m2.chiem[5] === true && m2.modes.join() === 'tudo,trum,tdm,chiem', JSON.stringify([m2.tdm, m2.chiem, m2.modes]));
      check('meta: last mode is saved, garbage falls back to tdm, default is tdm', m2.savedMode === 'trum' && m2.badMode === 'tdm' && m2.defMode === 'tdm', JSON.stringify([m2.savedMode, m2.badMode, m2.defMode]));
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(2); });
