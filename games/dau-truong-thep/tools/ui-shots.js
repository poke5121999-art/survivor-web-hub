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
        check(T('menu') + ': difficulty, map, player name, play button filled', r.diff === 3 && r.map >= 1 && r.name && r.play === 'Vào trận' && r.desc > 10, JSON.stringify(r));
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
        check(T('menu-modes') + ': mode picker lists the 4 modes in MODE_ORDER with Vietnamese names', r.modes.join() === 'tdm:Đấu đội,chiem:Chiếm điểm,tudo:Hỗn chiến,trum:Săn trùm', r.modes.join());
        check(T('menu-modes') + ': saved mode (trum) is preselected and its blurb is shown', r.on === 'trum' && r.blurb === 'Năm người hợp sức hạ Cự Thần trước khi dùng hết 12 mạng.', JSON.stringify(r));
        check(T('menu-modes') + ': map picker shows 4 maps with theme swatch, name and hazard in words', r.maps.join('\n') === 'denrung|jungle|Đền Rừng|Không có bẫy\nxuongcat|desert|Xưởng Cát|Họng lửa phụt\ncangbang|ice|Cảng Băng|Băng trơn trượt\nmienglua|lava|Miệng Lửa|Hồ dung nham' && r.swIcons === 4 && r.blurbs.length === 4, r.maps.join(' ; '));
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
