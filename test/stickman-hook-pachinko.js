#!/usr/bin/env node
/* Stickman Hook Lucky Drop (Pachinko) in a real browser: the first screen loads none of it, the mode list opens it at
 * 350 XP, each of the 8 board types builds the decoded peg layout, a drop with one swing ends in a bucket, and the payout
 * (peg coins + bucket reward) is granted and saved. Screenshots go to SH_SHOTS (default shots/stickman-hook/pachinko-*.png).
 *   node test/stickman-hook-pachinko.js
 *   SH_URL=https://poke5121999-art.github.io/survivor-web-hub/games/stickman-hook/index.html node test/stickman-hook-pachinko.js
 * Viewport 450 x 800 is the 750 x 1335 reference ratio, so the board is 8.427 x 15 world units like the original's.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SH_SHOTS || path.join(ROOT, 'shots', 'stickman-hook');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

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

// Pegs per board type on the 8.427 x 15 board (PachinkoLevelSpawner.BuildLevel, docs/PACHINKO.md). LOOP has no case
// and builds one of the other seven.
const BOARDS = [
  ['FULL_PEGS', { dot: 68 }], ['HEXAGON', { dot: 44, rect: 20 }], ['BIG_CIRCLE', { dot: 8, rect: 43 }],
  ['PEGS_AND_CUPS', { dot: 46, rect: 8 }], ['CONCENTRIC_PEG_CIRCLES', { dot: 62 }], ['PEGS_AND_SLOPES', { dot: 38, rect: 8 }],
  ['CUPS', { dot: 8, rect: 24 }], ['LOOP', null],
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.SH_URL ? null : await serve();
  const url = process.env.SH_URL || `http://localhost:${srv.address().port}/games/stickman-hook/index.html`;
  const withQ = (q) => url + (url.includes('?') ? '&' : '?') + q;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  // a save with 400 XP (Lucky Drop opens at 350) on the first load only; later loads keep what the test wrote
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('shp-test')) {
        localStorage.setItem('stickman-hook', JSON.stringify({ v: 2, xp: 400, coins: 0 }));
        sessionStorage.setItem('shp-test', '1');
      }
    } catch { /* storage off */ }
  });

  // ---- first screen: home, nothing of the mode loaded
  await page.goto(url);
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const early = requested.filter((u) => /pachinko/.test(u));
  check('first screen loads no pachinko file', early.length === 0, early.join(' '));

  // ---- mode list -> Lucky Drop
  await page.click('#btnModes');
  await page.waitForSelector('#modes .mode[data-id="mode.pachinko"]', { timeout: 10000 });
  const row = await page.evaluate(() => {
    const r = document.querySelector('#modes .mode[data-id="mode.pachinko"]');
    return { name: r.querySelector('.nm').textContent, button: r.querySelector('button')?.textContent || null };
  });
  check('mode list shows Lucky Drop playable at 400 XP', row.name === 'Lucky Drop' && row.button === 'Chơi', JSON.stringify(row));
  await page.click('#modes .mode[data-id="mode.pachinko"] button');
  await page.waitForFunction(() => window.__pachinko && window.__pachinko.world, null, { timeout: 15000 });
  const opened = await page.evaluate(() => ({ on: document.getElementById('pachinko').classList.contains('on'),
    modes: document.getElementById('modes').classList.contains('on'), start: document.getElementById('start').classList.contains('on') }));
  check('Chơi opens the Lucky Drop screen over the home screen', opened.on && !opened.modes && !opened.start, JSON.stringify(opened));
  const lazy = requested.filter((u) => /pachinko/.test(u)).map((u) => u.replace(/^.*\/(js|data|art)\//, '$1/').replace(/\?.*/, ''));
  check('the mode loads its js, json and two images on open', ['js/pachinko.js', 'data/pachinko.json', 'art/pachinko.webp', 'art/pachinko-bg.webp']
    .every((f) => lazy.includes(f)), lazy.join(' '));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'pachinko-open.png') });
  // GetNextLevel: no main win yet -> type 0; GenerateMainReward: first unowned option; OrderedRewards [s0, s1, MAIN, s1, s0]
  const first = await page.evaluate(() => { const p = window.__pachinko; return { type: p.world.type, buckets: p.world.buckets.length,
    r: p.rewards.map((x) => x.id.replace('currency.skin_coins', 'coins') + ':' + x.qty) }; });
  const [r0, r1, r2, r3, r4] = first.r, q = (x) => +x.split(':')[1];
  check('first board is FULL_PEGS with skin.sausage in the centre', first.type === 0 && first.buckets === 5 && r2 === 'skin.sausage:1',
    JSON.stringify(first));
  check('coin buckets mirror around the centre, rising inward', r0 === r4 && r1 === r3 && /^coins/.test(r0) && /^coins/.test(r1) && q(r0) <= q(r1),
    first.r.join(' '));
  check('the board state is saved for the next drop', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('stickman-hook')).modes['mode.pachinko'].state.main.id === 'skin.sausage'));

  // ---- GameModesService daily limit of mode.pachinko: 1 free game, then 2 rewarded (1 skip ticket each), then none
  const day = await page.evaluate(async () => (await import('./js/daily.js')).dayKey());
  const gate1 = await page.evaluate((day) => { const s = JSON.parse(localStorage.getItem('stickman-hook'));
    return { free: s.flags['daily_flag_mode.pachinko_free_' + day], stDay: s.modes['mode.pachinko'].state.day }; }, day);
  check('opening Lucky Drop from the mode list used the free game of the day (daily_flag_mode.pachinko_free_<yyyy-MM-dd> = 1), board dated today',
    gate1.free === 1 && gate1.stDay === day && /^\d{4}-\d\d-\d\d$/.test(day), JSON.stringify({ day, ...gate1 }));
  const reopen = async (tickets) => {
    await page.evaluate((t) => { window.__sh.save.inv['currency.skip_tickets'] = t; window.__pachinko?.stop(); }, tickets);
    await page.evaluate(() => window.__sh.openMode('mode.pachinko'));
    await page.waitForSelector('#pachinko .res.on #pachinkoGo', { timeout: 10000 }).catch(() => {});
    return page.evaluate(() => ({ dl: document.querySelector('#pachinko .res.on .dl')?.textContent,
      btn: document.querySelector('#pachinkoGo')?.textContent, off: document.querySelector('#pachinkoGo')?.disabled }));
  };
  const g2 = await reopen(0);
  await page.click('#pachinkoGo');
  const g2b = await page.evaluate(() => ({ panel: !!document.querySelector('#pachinko .res.on #pachinkoGo') }));
  check('the 2nd game of the day asks for a ticket: "Daily limit" 1/3, Chơi · 1 vé; with no ticket it stays on the panel',
    g2.dl === '1/3' && g2.btn === 'Chơi · 1 vé' && !g2.off && g2b.panel, JSON.stringify({ g2, g2b }));
  const g3 = await reopen(5);
  await page.click('#pachinkoGo');
  await page.waitForFunction(() => window.__pachinko && window.__pachinko.world && !document.querySelector('#pachinko .res.on'), null, { timeout: 10000 }).catch(() => {});
  const g4 = await reopen(4);
  await page.click('#pachinkoGo');
  await page.waitForTimeout(200);
  const g5 = await reopen(3);
  const g5s = await page.evaluate((day) => ({ t: window.__sh.save.inv['currency.skip_tickets'], rew: window.__sh.save.flags['daily_flag_mode.pachinko_rewarded_' + day] }), day);
  check('two rewarded games (1 skip ticket each: 5 -> 4, 4 -> 3) then "Daily limit" 3/3, the button off until midnight',
    g3.dl === '1/3' && g4.dl === '2/3' && g5.dl === '3/3' && g5.off && g5.btn === 'Hết lượt' && g5s.rew === 2, JSON.stringify({ g3, g4, g5, g5s }));
  await page.screenshot({ path: path.join(SHOTS, 'pachinko-limit.png') });
  await page.click('#pachinkoBack');

  // ---- every board type, forced with ?ptype=
  for (let t = 0; t < BOARDS.length; t++) {
    const [name, want] = BOARDS[t];
    await page.goto(withQ(`mode=pachinko&ptype=${t}&pseed=${11 + t}`));
    await page.waitForFunction(() => window.__pachinko && window.__pachinko.world, null, { timeout: 15000 });
    const got = await page.evaluate(() => {
      const w = window.__pachinko.world, k = {};
      for (const p of w.pegs) k[p.kind] = (k[p.kind] || 0) + 1;
      return { type: w.type, asked: w.asked, kinds: k, W: +w.W.toFixed(3) };
    });
    if (want) check(`board ${t} ${name} builds its pegs`, got.type === t && same(got.kinds, want) && got.W === 8.427,
      JSON.stringify(got));
    else check(`board ${t} ${name} falls back to one of the 7 others`, got.asked === 7 && got.type >= 0 && got.type < 7, JSON.stringify(got));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `pachinko-${t}-${name.toLowerCase()}.png`) });
  }

  // ---- x10 pegs (the card's SetAsBonus, forced with ?pbonus= since cards are not in this build)
  await page.goto(withQ('mode=pachinko&ptype=4&pseed=3&pbonus=5'));
  await page.waitForFunction(() => window.__pachinko && window.__pachinko.world, null, { timeout: 15000 });
  const bon = await page.evaluate(() => window.__pachinko.world.pegs.filter((p) => p.bonus).map((p) => p.coins));
  check('?pbonus=5 makes 5 special pegs worth 10 coins', bon.length === 5 && bon.every((c) => c === 10), bon.join(','));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'pachinko-bonus.png') });

  // ---- a drop: wait for the bounce on the bumper, swing on the hook, let go, land in a bucket
  await page.goto(withQ('mode=pachinko&ptype=0&pseed=5'));
  await page.waitForFunction(() => window.__pachinko && window.__pachinko.game.phase === 'play', null, { timeout: 15000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('stickman-hook')));
  await page.waitForTimeout(500);
  await page.mouse.move(225, 400);
  await page.mouse.down();
  await page.waitForTimeout(150);
  check('pressing hooks the top target', await page.evaluate(() => window.__pachinko.player.hooked === 0));
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(400);
  check('the start bumper is gone after the first grab', await page.evaluate(() => window.__pachinko.world.bumper.gone));
  check('the hook is gone after the release: one swing per drop', await page.evaluate(() => window.__pachinko.world.targets.length === 0));
  const t0 = Date.now();
  await page.waitForFunction(() => window.__pachinko.game.phase === 'end', null, { timeout: 30000 }).catch(() => {});
  const end = await page.evaluate(() => { const g = window.__pachinko.game; return { phase: g.phase, bucket: g.bucket, coins: g.coins, payout: g.payout && { pegs: g.payout.pegs, reward: g.payout.reward } }; });
  check('the drop ends in a bucket within 30 s', end.phase === 'end' && end.bucket >= 0 && end.bucket < 5, `${JSON.stringify(end)} after ${Date.now() - t0} ms`);
  check('pegs gave coins on the way down', end.coins > 0, `${end.coins} coins`);
  await page.waitForSelector('#pachinko .res.on', { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, 'pachinko-result.png') });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stickman-hook')));
  const r = end.payout?.reward || {};
  const wantCoins = before.coins + end.coins + (r.id === 'currency.skin_coins' ? r.qty : 0);
  check('coins = peg coins + bucket coins, saved', saved.coins === wantCoins, `${before.coins} -> ${saved.coins}, want ${wantCoins}`);
  if (r.id && r.id !== 'currency.skin_coins') {
    const [kind, nm] = r.id.split('.');
    check('the centre bucket item is owned and saved', saved.owned[kind + 's'].includes(nm), r.id);
  }
  if (end.bucket === 2) check('the main prize counts a main win and clears the board state', saved.inv['progression.pachinko_main_wins'] === 1 && !saved.modes['mode.pachinko'].state);
  else check('a coin bucket keeps the board state', saved.modes['mode.pachinko'].state?.level === 0);
  const card = await page.evaluate(() => document.querySelector('#pachinko .res.on .card')?.innerText || '');
  check('result screen is in Vietnamese', /Xu từ chốt/.test(card) && /Về trang chính/.test(card), card.replace(/\s+/g, ' '));
  await page.click('#pachinkoHome');
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => ({ p: document.getElementById('pachinko').classList.contains('on'),
    start: document.getElementById('start').classList.contains('on'), coins: document.getElementById('coins').textContent }));
  check('back home shows the new coin total', !back.p && back.start && +back.coins === wantCoins, JSON.stringify(back));
  await page.screenshot({ path: path.join(SHOTS, 'pachinko-home.png') });

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  if (srv) srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
