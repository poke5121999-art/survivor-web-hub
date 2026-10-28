#!/usr/bin/env node
/* Stickman Hook (games/stickman-hook) in a real browser: loads light, hooks, finishes level 1, moves on to level 2,
 * and the level list opens. Then the meta shell: XP per level, level themes, the XP road claim, Customization equip,
 * equipped skin / rope drawn in game, an effect-variant skin, the mode list. Then the modes: a seasonal event after
 * Normal level 10, and with enough XP Mechanical Grapple and Challenge (pickers, theme colours, rewards, next, restart).
 * Then the Race (Tournament): page, start slots, ghosts on their recorded paths, placement, forced finish, rewards,
 * daily free races, the seeded daily leaderboard and its end-of-day claim.
 * Screenshots go to SH_SHOTS (default shots/stickman-hook).
 *   node test/stickman-hook-play.js
 *   SH_URL=https://poke5121999-art.github.io/survivor-web-hub/games/stickman-hook/index.html node test/stickman-hook-play.js
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

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.SH_URL ? null : await serve();
  const url = process.env.SH_URL || `http://localhost:${srv.address().port}/games/stickman-hook/index.html`;
  const level1 = url + (url.includes('?') ? '&' : '?') + 'level=1';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));
  // fresh save on the first load only; later reloads keep the save the test writes
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('sh-test')) { localStorage.removeItem('stickman-hook'); sessionStorage.setItem('sh-test', '1'); }
    } catch { /* fresh start */ }
  });
  const t0 = Date.now();
  await page.goto(level1);
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  const loadMs = Date.now() - t0;
  check('game is up within 10 s', loadMs < 10000, `${loadMs} ms`);
  await page.waitForTimeout(300);
  // bytes on the wire (gzip on Pages, raw locally), page included
  const kb = await page.evaluate(() => Math.round(performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation'))
    .reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) / 1024));
  check('download under 600 KB', kb > 50 && kb < 600, `${kb} KB`);
  const lazy = requested.filter((u) => /custom\.json|custom-ui|ropes\.webp|menu\.webp|art\/skins\//.test(u));
  check('first level loads no shop art', lazy.length === 0, lazy.join(' '));
  const modeFiles = requested.filter((u) => /mode-[\w-]+\.json|grapple\.js|menus\.js|race\.js|\/race\/|race\.webp|adventure\.js|advrun\.js|adventure\.webp/.test(u));
  check('first level loads no mode data', modeFiles.length === 0, modeFiles.join(' '));
  const bonusFiles = requested.filter((u) => /bonus\.js|bonus\.json|wheel\.webp|piggy\.webp|skip\.webp/.test(u));
  check('first level loads no wheel / piggy / skip code or art', bonusFiles.length === 0, bonusFiles.join(' '));
  check('level 1 is Solo1 with one target', await page.evaluate(() => window.__sh.world.names.join() === 'Solo1' && window.__sh.world.targets.length === 1));

  const painted = await page.evaluate(() => {
    const c = document.getElementById('cv'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] < 120) dark++;
    return dark;
  });
  check('level art is drawn (dark outlines on screen)', painted > 50, `${painted} dark samples`);

  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(150);
  const hooked = await page.evaluate(() => window.__sh.player.hooked);
  check('pressing hooks the nearest target', hooked === 0, `hooked ${hooked}`);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(SHOTS, 'swing.png') });
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(() => window.__sh.game.phase === 'finish', null, { timeout: 8000 }).catch(() => {});
  check('swinging past the checker line finishes level 1', await page.evaluate(() => window.__sh.game.phase === 'finish'));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, 'finish.png') });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stickman-hook') || '{}'));
  check('progress saved (best level 1)', saved.best === 1, `best ${saved.best}`);
  check('level 1 gives +10 XP', saved.xp === 10, `xp ${saved.xp}`);
  await page.waitForFunction(() => window.__sh.look.dance?.id === 'skin.basic', null, { timeout: 10000 }).catch(() => {});
  check('finish plays the skin dance clip', await page.evaluate(() => window.__sh.look.dance?.id === 'skin.basic'));
  // piggy bank: a Normal level's first completion fills it by fillConfigs[threshold 0].levelComplete = 10
  await page.waitForSelector('#piggy.on', { timeout: 10000 }).catch(() => {});
  const pig1 = await page.evaluate(() => ({ p: window.__sh.save.inv['progression.piggy_bank_progress'],
    res: document.getElementById('piggy')?.dataset.res, on: !!document.querySelector('#piggy.on') }));
  check('finishing level 1 fills the piggy bank by 10 toward Stick Frog', pig1.p === 10 && pig1.res === 'skin.stick_frog' && pig1.on,
    JSON.stringify(pig1));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'finish-piggy.png') });

  await page.mouse.click(195, 500);
  await page.waitForTimeout(300);
  check('tap after finishing opens level 2', await page.evaluate(() => window.__sh.world.index === 1 && window.__sh.world.names.join() === 'Solo2'));

  await page.click('#btnLevels');
  await page.waitForTimeout(200);
  const grid = await page.evaluate(() => ({ n: document.querySelectorAll('#grid button').length,
    open: [...document.querySelectorAll('#grid button')].filter((b) => !b.disabled).length }));
  check('level list shows 64 levels, 2 unlocked', grid.n === 64 && grid.open === 2, JSON.stringify(grid));
  await page.screenshot({ path: path.join(SHOTS, 'levels.png') });
  await page.click('#btnClose');

  await page.evaluate(() => window.__sh.startLevel(64));
  check('level 65 is the seeded random level', await page.evaluate(() => window.__sh.world.names.join('+') === 'STARTU005+MIDDLE006+FINISH05'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, 'level65.png') });

  // ---- level theme: every 5 levels the camera, shadow and target colours change
  const bgAt = () => page.evaluate(() => {
    const c = document.getElementById('cv'), d = c.getContext('2d').getImageData(4, Math.round(c.height * 0.12), 1, 1).data;
    return { theme: window.__sh.theme.bg, px: [d[0], d[1], d[2]].join(',') };
  });
  await page.evaluate(() => window.__sh.startLevel(0));
  await page.waitForTimeout(400);
  const th1 = await bgAt();
  await page.evaluate(() => window.__sh.startLevel(5));
  await page.waitForTimeout(400);
  const th6 = await bgAt();
  await page.screenshot({ path: path.join(SHOTS, 'level6.png') });
  check('level 6 theme colour differs from level 1', th1.theme !== th6.theme && th1.px !== th6.px,
    `${th1.theme} ${th1.px} -> ${th6.theme} ${th6.px}`);

  // ---- a save that has reached Normal level 25 and 300 XP: the level road unlocks Basket and Ping Pong on load
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('stickman-hook'));
    localStorage.setItem('stickman-hook', JSON.stringify({ ...s, best: 25, level: 0, xp: 300 }));
  });
  await page.goto(level1);
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  const owned = await page.evaluate(() => window.__sh.save.owned.skins);
  check('Normal level road unlocks its skins', owned.includes('basket') && owned.includes('ping_pong'), owned.join(','));

  await page.evaluate(() => window.__sh.openMenu('openRoad'));
  await page.waitForSelector('#road .foot .big:not([disabled])', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'road.png') });
  await page.click('#road .foot .big');
  await page.waitForFunction(() => window.__sh.save.coins === 150, null, { timeout: 10000 }).catch(() => {});
  const road = await page.evaluate(() => ({ ropes: window.__sh.save.owned.ropes, claimed: window.__sh.save.claimed['progression.xp'],
    coins: window.__sh.save.coins }));
  check('XP road claim grants its rewards', road.ropes.includes('spiders') && road.claimed >= 275 && road.coins === 150, JSON.stringify(road));
  await page.screenshot({ path: path.join(SHOTS, 'road-claimed.png') });
  await page.click('#road .x');

  await page.evaluate(() => window.__sh.openMenu('openShop'));
  await page.waitForSelector('#shop .cell[data-id="skin.basket"]', { timeout: 10000 });
  const nSkins = await page.evaluate(() => document.querySelectorAll('#shop .cell').length);
  check('customization opens with every skin', nSkins === 146, `${nSkins} cells`);
  await page.click('#shop .cell[data-id="skin.basket"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'shop.png') });
  await page.click('#shop .tabs button[data-kind="ropes"]');
  await page.click('#shop .cell[data-id="rope.spiders"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'shop-ropes.png') });
  await page.click('#shop .tabs button[data-kind="trails"]');
  await page.click('#shop .cell[data-id="trail.basic"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'shop-trails.png') });
  const eq = await page.evaluate(() => window.__sh.save.equipped);
  check('equipping a level-road skin, an XP-road rope and the default trail works',
    eq.skins === 'basket' && eq.ropes === 'spiders' && eq.trails === 'basic', JSON.stringify(eq));
  await page.click('#shop .x');

  await page.waitForFunction(() => window.__sh.look.skin?.id === 'skin.basket' && window.__sh.look.rope, null, { timeout: 10000 }).catch(() => {});
  check('equipped skin sheet is requested', requested.some((u) => u.includes('/art/skins/basket.webp')));
  await page.evaluate(() => window.__sh.startLevel(0));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  const drawn0 = await page.evaluate(() => window.__sh.look.drawn);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'skin-rope.png') });
  await page.mouse.up({ button: 'left' });
  const drawn1 = await page.evaluate(() => window.__sh.look.drawn);
  check('equipped skin is drawn in game', drawn1 > drawn0 + 10, `${drawn1 - drawn0} frames`);

  // effect variant: base sheet + baked material ops (owned here by the test; its unlock is Adventure)
  await page.evaluate(() => {
    const s = window.__sh.save;
    s.owned.skins.push('alien_hologram_travelers');
    s.equipped.skins = 'alien_hologram_travelers';
    window.__sh.applyEquip();
  });
  await page.waitForFunction(() => window.__sh.look.skin?.id === 'skin.alien_hologram_travelers', null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => window.__sh.startLevel(0));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'skin-fx.png') });
  await page.mouse.up({ button: 'left' });
  check('effect variant skin uses the base sheet', await page.evaluate(() => window.__sh.look.skin?.id === 'skin.alien_hologram_travelers')
    && requested.some((u) => u.includes('/art/skins/alien.webp')));

  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode', { timeout: 10000 });
  const modes = await page.evaluate(() => [...document.querySelectorAll('#modes .mode')].map((m) => m.dataset.id + ':' + m.innerText.replace(/\s+/g, ' ')));
  check('mode list: Normal playable, Grapple locked by XP', modes.some((m) => m.startsWith('mode.normal') && m.includes('Chơi'))
    && modes.some((m) => m.startsWith('mode.grapple') && m.includes('2650 XP')), modes.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 'modes.png') });
  await page.click('#modes .x');
  await page.click('#btnMenu');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'home.png') });
  await page.click('#btnPlay');

  // ---- modes. Helpers: open a mode from the mode list and pick a level; jump past the finish line.
  const playMode = async (id, level) => {
    await page.evaluate(() => window.__sh.openMenu('openModes'));
    await page.waitForSelector(`#modes .mode[data-id="${id}"] button`, { timeout: 10000 });
    await page.click(`#modes .mode[data-id="${id}"] button`);
    await page.waitForSelector('#levels.on #grid button', { timeout: 10000 });
    const g = await page.evaluate(() => ({ title: document.getElementById('levelsTitle').textContent,
      n: document.querySelectorAll('#grid button').length,
      open: [...document.querySelectorAll('#grid button')].filter((b) => !b.disabled).length }));
    await page.screenshot({ path: path.join(SHOTS, `picker-${id.slice(5)}.png`) });
    await page.click(`#grid button:nth-child(${level})`);
    await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
    return g;
  };
  const finishNow = async () => {
    await page.evaluate(() => { const p = window.__sh.player; p.x = window.__sh.world.finishX + 0.05; p.vx = 3; });
    await page.waitForFunction(() => window.__sh.game.phase === 'finish', null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
  };

  // seasonal: this save is past Normal level 10, so both events are open; the event window is ignored offline
  const ev = await playMode('mode.easter_event', 1);
  check('Easter event opens after Normal level 10: 5 levels, 1 open', ev.n === 5 && ev.open === 1, JSON.stringify(ev));
  const easter = await bgAt();
  check('Easter level 1 loads with the Easter theme', easter.theme === '#2FBC41' && await page.evaluate(() =>
    window.__sh.world.names.join('+') === 'STARTU055+MIDDLEv2_028+FINISH42'), `${easter.theme} ${easter.px}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'easter.png') });
  const xpEv = await page.evaluate(() => window.__sh.save.xp);
  await finishNow();
  await page.screenshot({ path: path.join(SHOTS, 'easter-finish.png') });
  const evSave = await page.evaluate(() => window.__sh.save);
  check('finishing Easter level 1 gives its first event skin and XP', evSave.owned.skins.includes('carrot_rabbit')
    && evSave.modes['mode.easter_event'].done.join() === '0' && evSave.xp === xpEv + 10 + 50,
    `xp ${xpEv} -> ${evSave.xp} ${JSON.stringify(evSave.modes['mode.easter_event'])}`);
  await page.mouse.click(195, 500);
  await page.waitForTimeout(300);
  check('tap after an event level opens event level 2', await page.evaluate(() => window.__sh.mode.id === 'mode.easter_event'
    && window.__sh.world.index === 1));
  const vd = await playMode('mode.valentine_day', 1);
  const valentine = await bgAt();
  check('Valentine event opens with its own theme', vd.n === 5 && valentine.theme === '#FD95B0', `${valentine.theme} ${valentine.px}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'valentine.png') });

  // a save with 3000 XP: Mechanical Grapple (2650) and Challenge (1250) are open; 3 Challenge road steps reached
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('stickman-hook'));
    localStorage.setItem('stickman-hook', JSON.stringify({ ...s, xp: 3000 }));
  });
  await page.goto(level1);
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode', { timeout: 10000 });
  await page.screenshot({ path: path.join(SHOTS, 'modes-open.png') });
  await page.click('#modes .x');

  const gp = await playMode('mode.grapple', 1);
  check('Grapple picker: level 1 open', gp.open === 1 && gp.n >= 41, JSON.stringify(gp));
  const grapple = await bgAt();
  check('Grapple level 1 is Solo5 with levelColors[0] and the grapple player', grapple.theme === '#00B4FC'
    && await page.evaluate(() => window.__sh.world.names.join() === 'Solo5' && window.__sh.player.constructor.name === 'GrapplePlayer'),
    `${grapple.theme} ${grapple.px}`);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(120);
  const reel = await page.evaluate(() => { const p = window.__sh.player; return { hooked: p.hooked, v: Math.hypot(p.vx, p.vy) }; });
  await page.screenshot({ path: path.join(SHOTS, 'grapple.png') });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__sh.player.hooked);
  await page.mouse.up({ button: 'left' });
  check('the grapple reels toward the target, then lets go by itself', reel.hooked === 0 && reel.v > 4 && after === -1,
    `${JSON.stringify(reel)} hooked after 1.3 s: ${after}`);
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 }).catch(() => {});
  await finishNow();
  const gSave = await page.evaluate(() => window.__sh.save);
  check('finishing Grapple 1 gives 10 XP and saves it', gSave.xp === 3010 && gSave.modes['mode.grapple'].best === 1,
    `xp ${gSave.xp} ${JSON.stringify(gSave.modes['mode.grapple'])}`);

  const cp = await playMode('mode.challenge', 1);
  check('Challenge picker shows 30 levels, 4 open at 3000 XP', cp.n === 30 && cp.open === 4, JSON.stringify(cp));
  const ch = await bgAt();
  check('Challenge level 1 loads with the Challenge theme', ch.theme === '#35C1CC' && ch.px !== grapple.px
    && await page.evaluate(() => window.__sh.world.names.join('+') === 'STARTU031+MIDDLEv2_002+FINISH40'), `${ch.theme} ${ch.px}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'challenge.png') });
  await page.click('#btnRestart');
  check('restart keeps the mode and level', await page.evaluate(() => window.__sh.mode.id === 'mode.challenge' && window.__sh.world.index === 0));
  await page.evaluate(() => window.__sh.startLevel(3));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.screenshot({ path: path.join(SHOTS, 'challenge-finish.png') });
  await page.mouse.click(195, 500);
  await page.waitForTimeout(400);
  check('after the last open Challenge level the picker opens', await page.evaluate(() =>
    document.getElementById('levels').classList.contains('on') && window.__sh.save.modes['mode.challenge'].done.join() === '3'));
  await page.click('#btnClose');
  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode[data-id="mode.normal"] button', { timeout: 10000 });
  await page.click('#modes .mode[data-id="mode.normal"] button');
  await page.waitForTimeout(300);
  check('Normal is back where it was', await page.evaluate(() => window.__sh.mode.id === 'mode.normal' && window.__sh.world.index === 0
    && window.__sh.theme.bg === '#00B4FC'));

  // ---- Lucky Wheel, market, piggy bank, skip level (js/bonus.js). A save at Normal level 13 with no coins, no tickets,
  // 3 skip tickets and a booster left pending by a road, and no welcome booster yet.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('stickman-hook'));
    for (const f of Object.keys(s.flags)) if (f.startsWith('flag.nb_levels_skipped_') || f === 'flag.has_welcome_booster') delete s.flags[f];
    localStorage.setItem('stickman-hook', JSON.stringify({ ...s, coins: 0, best: 12, level: 12, inv: {}, periodic: {},
      pending: [['currency.skip_tickets', 3], ['booster.epic', 1]] }));
  });
  await page.goto(url.replace(/\?.*$/, '') + '?level=13');
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  const pend = await page.evaluate(() => ({ t: window.__sh.save.inv['currency.skip_tickets'], p: window.__sh.save.pending }));
  check('pending skip tickets are delivered, the booster stays pending', pend.t === 3 && JSON.stringify(pend.p) === '[["booster.epic",1]]',
    JSON.stringify(pend));

  const wheelState = () => page.evaluate(() => {
    const W = window.__sh.look.wheel, s = window.__sh.save;
    return { spinning: !!W.spin, won: W.won >= 0, under: Math.round(W.p), at45: W.reel[45]?.res, coins: s.coins,
      claims: s.inv['progression.lucky_wheel_claims'] || 0, skins: s.owned.skins, label: document.querySelector('#wheel .wspin small').textContent };
  });
  const spinAndWait = async () => {
    await page.click('#wheel .wspin');
    await page.waitForFunction(() => { const W = window.__sh.look.wheel; return W.won >= 0 && !W.spin; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  // mode.lucky_wheel (the wheel's unlock, XP road step 1) is a row of the mode list that opens the wheel
  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode[data-id="mode.lucky_wheel"] button', { timeout: 10000 });
  await page.click('#modes .mode[data-id="mode.lucky_wheel"] button');
  await page.waitForFunction(() => window.__sh.look.wheel?.img, null, { timeout: 10000 });
  check('the Lucky Wheel row of the mode list opens the wheel', await page.evaluate(() =>
    document.getElementById('wheel').classList.contains('on') && !document.getElementById('modes').classList.contains('on')));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'wheel.png') });
  const w0 = await wheelState();
  check('the first wheel spin is free (prices[min(claims, 1)])', w0.label === 'Miễn phí' && w0.claims === 0, JSON.stringify(w0));
  await page.click('#wheel .wspin');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, 'wheel-spin.png') });
  await page.waitForFunction(() => { const W = window.__sh.look.wheel; return W.won >= 0 && !W.spin; }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'wheel-won.png') });
  const w1 = await wheelState();
  check('first spin lands on slot 45 = forced reward Potatoz, and grants it', w1.won && w1.under === 45 && w1.at45 === 'skin.potatoz'
    && w1.skins.includes('potatoz') && w1.claims === 1 && w1.coins === 0, JSON.stringify(w1));
  await page.click('#wheel .wspin');
  await page.waitForTimeout(300);
  const w2 = await wheelState();
  check('second spin costs 500 coins: refused with 0 coins', !w2.spinning && w2.claims === 1 && w2.label.startsWith('500')
    && await page.evaluate(() => document.getElementById('toast').textContent.includes('xu')), JSON.stringify(w2));
  await page.evaluate(() => { window.__sh.save.coins = 500; Math.__r = Math.random; Math.random = () => 0; });
  await spinAndWait();
  const w3 = await wheelState();
  await page.evaluate(() => { Math.random = Math.__r; });
  check('paid spin (random 0, no welcome booster) lands on and grants Tiki for 500 coins', w3.under === 45 && w3.at45 === 'skin.tiki'
    && w3.skins.includes('tiki') && w3.coins === 0 && w3.claims === 2, JSON.stringify(w3));
  await page.click('#wheel .wclose');

  // market: 20 free coins once a day, skip tickets for coins
  const freeBtn = '#market .offer[data-id="free_coins"] button';
  await page.evaluate(() => window.__sh.openMenu('openMarket'));
  await page.waitForSelector(freeBtn, { timeout: 10000 });
  await page.screenshot({ path: path.join(SHOTS, 'market.png') });
  await page.click(freeBtn);
  const c1 = await page.evaluate(() => window.__sh.save.coins);
  const again = await page.evaluate((b) => document.querySelector(b).disabled, freeBtn);
  await page.evaluate((b) => document.querySelector(b).click(), freeBtn);
  const c2 = await page.evaluate(() => window.__sh.save.coins);
  check('daily free coins: +20 once, then refused the same day', c1 === 20 && c2 === 20 && again, `${c1} ${c2} disabled ${again}`);
  await page.evaluate(() => { window.__sh.save.periodic['daily.free_coins'] = 20000101; window.__sh.save.coins = 1000; });
  await page.click('#market .x');
  await page.evaluate(() => window.__sh.openMenu('openMarket'));
  await page.waitForSelector(freeBtn, { timeout: 10000 });
  const nextDay = await page.evaluate((b) => !document.querySelector(b).disabled, freeBtn);
  await page.click('#market .offer[data-id="tickets_0"] button');
  const bought = await page.evaluate(() => ({ t: window.__sh.save.inv['currency.skip_tickets'], c: window.__sh.save.coins }));
  check('free coins come back the next day; 20 tickets cost 1000 coins', nextDay && bought.t === 23 && bought.c === 0, JSON.stringify(bought));
  await page.screenshot({ path: path.join(SHOTS, 'market-bought.png') });
  await page.click('#market .x');

  // piggy bank: at 90 the next Normal level fills it to 100; unlocking costs 1 ticket (rewarded ad skip price); then +3 a level
  await page.evaluate(() => { window.__sh.save.inv['progression.piggy_bank_progress'] = 90; window.__sh.startLevel(12); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.waitForSelector('#piggy.on .act', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'piggy-full.png') });
  const full = await page.evaluate(() => ({ p: window.__sh.save.inv['progression.piggy_bank_progress'],
    btn: document.querySelector('#piggy .act')?.textContent.trim() }));
  await page.click('#piggy .act');
  await page.waitForTimeout(300);
  const broke = await page.evaluate(() => { const s = window.__sh.save; return { p: s.inv['progression.piggy_bank_progress'],
    claims: s.inv['progression.piggy_bank_claims'], t: s.inv['currency.skip_tickets'], frog: s.owned.skins.includes('stick_frog'),
    next: document.getElementById('piggy').dataset.res }; });
  check('piggy full at 100 breaks for 1 skip ticket into Stick Frog', full.p === 100 && full.btn.startsWith('Mở khoá') && broke.p === 0
    && broke.claims === 1 && broke.t === 22 && broke.frog && broke.next === 'skin.ghost', JSON.stringify({ full, broke }));
  await page.screenshot({ path: path.join(SHOTS, 'piggy-broken.png') });
  await page.evaluate(() => window.__sh.startLevel(13));
  check('next level hides the piggy panel', await page.evaluate(() => !document.querySelector('#piggy.on')));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.waitForSelector('#piggy.on', { timeout: 10000 }).catch(() => {});
  check('after the first claim a level fills the piggy by 3', await page.evaluate(() =>
    window.__sh.save.inv['progression.piggy_bank_progress'] === 3));

  // skip level: per day = card.skip_level effect; no card (no welcome booster) = 0, so no button after a death
  const die = async () => {
    await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
    await page.evaluate(() => { window.__sh.player.y = -40; });
    await page.waitForFunction(() => window.__sh.game.died, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  await page.evaluate(() => window.__sh.startLevel(14));
  await die();
  check('no skip button without the skip card', await page.evaluate(() => !document.querySelector('#skip.on')));
  await page.evaluate(() => { window.__sh.save.flags['flag.has_welcome_booster'] = 1; window.__sh.startLevel(14); });
  await die();
  const sk = await page.evaluate(() => ({ on: !!document.querySelector('#skip.on'), text: document.querySelector('#skip b')?.textContent }));
  await page.screenshot({ path: path.join(SHOTS, 'skip.png') });
  await page.click('#skip');
  await page.waitForTimeout(300);
  const skipped = await page.evaluate(() => { const s = window.__sh.save; return { phase: window.__sh.game.phase, best: s.best,
    t: s.inv['currency.skip_tickets'], day: Object.entries(s.flags).find(([k]) => k.startsWith('flag.nb_levels_skipped_')) }; });
  check('after a death the skip button (1/1) spends a ticket and completes level 15', sk.on && sk.text === '1/1'
    && skipped.phase === 'finish' && skipped.best === 15 && skipped.t === 21 && skipped.day?.[1] === 1, JSON.stringify({ sk, skipped }));
  await page.evaluate(() => window.__sh.startLevel(15));
  await die();
  check('the daily skip limit holds: no skip button on the next death', await page.evaluate(() => !document.querySelector('#skip.on')
    && window.__sh.save.inv['currency.skip_tickets'] === 21));

  // home screen entry points
  await page.click('#btnMenu');
  await page.waitForSelector('#btnWheel', { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'home-bonus.png') });
  const home = await page.evaluate(() => ({ wheel: document.getElementById('wheelPrice').textContent,
    tickets: document.getElementById('tickets').textContent, market: document.getElementById('marketDot').classList.contains('on') }));
  check('home shows the wheel counter (coins/500), ticket count and market', home.wheel === `${await page.evaluate(() => window.__sh.save.coins)}/500`
    && home.tickets === '21', JSON.stringify(home));
  await page.click('#btnPlay');

  // ---- Race (js/race.js). A clean tournament state, 1 skip ticket, no coins. Math.random = 0 while a race is set up:
  // map index = achieved level (0: RaceTest), player slot Random.Range(0, 5) = 0, difficulty 0 (no wins), and per slot
  // the first save of the map's file; RaceTest has no difficulty-0 save for slot 1, so that slot stays empty.
  await page.evaluate(() => {
    const s = window.__sh.save;
    delete s.modes['mode.tournament'];
    for (const k of Object.keys(s.inv)) if (/race_trophies|tournament/.test(k)) delete s.inv[k];
    for (const f of Object.keys(s.flags)) if (f.startsWith('daily_flag_mode.tournament')) delete s.flags[f];
    s.coins = 0; s.inv['currency.skip_tickets'] = 1; s.owned.skins = s.owned.skins.filter((n) => n !== 'dolphin');
  });
  const raceFirst = requested.length;
  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode[data-id="mode.tournament"] button', { timeout: 10000 });
  await page.click('#modes .mode[data-id="mode.tournament"] button');
  await page.waitForSelector('#race.on .go', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'race-page.png') });
  const rp = await page.evaluate(() => ({ rows: document.querySelectorAll('#race li').length, me: document.querySelector('#race li.me b')?.textContent,
    btn: document.querySelector('#race .go')?.textContent }));
  check('the Race row opens the tournament page: 10 board rows, 2 free races today', rp.rows === 10 && rp.me === '10'
    && /còn 2\/2/.test(rp.btn), JSON.stringify(rp));
  check('the race code and maps load only when the mode opens', requested.slice(raceFirst).some((u) => /js\/race\.js/.test(u))
    && requested.slice(raceFirst).some((u) => /mode-race\.json/.test(u)));
  const rand0 = () => page.evaluate(() => { Math.__r = Math.random; Math.random = () => 0; });
  const randBack = () => page.evaluate(() => { Math.random = Math.__r; });
  const raceStarts = async (sel) => {
    await rand0();
    await page.click(sel);
    await page.waitForFunction(() => window.__sh.race && window.__sh.game.phase === 'count' && !document.querySelector('#race.on, #raceEnd.on'),
      null, { timeout: 15000 }).catch(() => {});
    await randBack();
  };
  await raceStarts('#race .go');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'race-start.png') });
  const r1 = await page.evaluate(() => { const r = window.__sh.race, s = window.__sh.save; return { level: r.level, me: r.me,
    spawn: window.__sh.world.spawn, ghosts: r.ghosts.map((o) => [o.g.n, o.g.s, o.g.k, o.g.ms, o.sheet?.id]),
    free: Object.entries(s.flags).find(([k]) => k.startsWith('daily_flag_mode.tournament_free_'))?.[1] }; });
  check('race 1: map RaceTest, player at slot 0 "Spawn" (0.08, 4.33), 3 ghosts sorted by time with their skins',
    r1.level === 0 && r1.me === 0 && r1.spawn.x === 0.08 && r1.spawn.y === 4.33 && JSON.stringify(r1.ghosts) === JSON.stringify([
      ['PlayerReplaySave69291131', 4, 'skin.ninja', 24915, 'skin.ninja'], ['PlayerReplaySave22829796', 2, 'skin.harry', 27333, 'skin.harry'],
      ['PlayerReplaySave82156701', 3, 'skin.mommy', 39895, 'skin.mommy']]), JSON.stringify(r1));
  check('starting a race uses 1 of the 2 free races of the day', r1.free === 1, `flag ${r1.free}`);
  check('ghost data and skins load with the race', requested.some((u) => /data\/race\/0\.json/.test(u))
    && requested.some((u) => /art\/skins\/ninja\.webp/.test(u)) && requested.some((u) => /art\/race\.webp/.test(u)));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  // the ninja ghost follows its record: (0.08, -3.67) at its spawn, (9.86, -4.37) at 1.04 s, (32.95, -0.83) at 3.04 s
  const poseAt = (t) => page.evaluate(async (t) => {
    const m = await import('./js/race.js');
    const p = m.ghostPose(window.__sh.race.ghosts[0].g, t);
    return p && [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, p.frame];
  }, t);
  const poses = [await poseAt(0.04), await poseAt(1.04), await poseAt(3.04)];
  check('the ninja ghost sits on its recorded samples at 0.04 / 1.04 / 3.04 s', JSON.stringify(poses) === JSON.stringify([
    [0.08, -3.67, 'CHAR_Ninja0005'], [9.86, -4.37, 'CHAR_Ninja0001'], [32.95, -0.83, 'CHAR_Ninja0002']]), JSON.stringify(poses));
  const live = await page.evaluate(async () => {
    const m = await import('./js/race.js'), r = window.__sh.race;
    await new Promise((res) => setTimeout(res, 600));
    const a = r.clock, pa = r.ghosts.map((o) => m.ghostPose(o.g, a));
    await new Promise((res) => setTimeout(res, 400));
    const b = r.clock, pb = r.ghosts.map((o) => m.ghostPose(o.g, b));
    return { a, b, moved: pa.map((p, i) => Math.hypot(pb[i].x - p.x, pb[i].y - p.y)) };
  });
  check('in the running race the race clock advances and every ghost moves', live.b > live.a + 0.3 && live.moved.every((d) => d > 0.1),
    JSON.stringify(live));
  // mid race: pause at 10.75 s, when the three ghosts are within 2.6 units (x 30.8..33.4), with the player among them
  await page.evaluate(() => {
    const sh = window.__sh, r = sh.race;
    sh.game.paused = true; sh.game.phase = 'play'; r.clock = 10.75;
    Object.assign(sh.player, { x: 32.6, y: 3.2, vx: 0, vy: 0, finished: false }); sh.cam.x = 32;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'race-mid.png') });
  // placement against ghosts of known time: at 26 s only the ninja (24.915 s) is home, so the player finishes 2nd of 4
  await page.evaluate(() => {
    const sh = window.__sh;
    sh.race.clock = 26; Object.assign(sh.player, { x: sh.world.finishX + 0.05, y: 0, vx: 3, vy: 0 }); sh.game.paused = false;
  });
  await page.waitForSelector('#raceEnd.on', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'race-finish.png') });
  const f1 = await page.evaluate(() => { const s = window.__sh.save, r = window.__sh.race; return { done: r.done, coins: s.coins,
    trophies: s.inv['progression.race_trophies'], best: s.inv['leaderboard.tournament_best_score'], achieved: s.modes['mode.tournament'].best,
    text: document.querySelector('#raceEnd')?.innerText.replace(/\s+/g, ' ') }; });
  check('finishing at 26 s behind the 24.9 s ghost = 2nd: +7 coins, +5 trophies, map 1 achieved', f1.done?.rank === 1 && !f1.done.forced
    && f1.coins === 7 && f1.trophies === 5 && f1.best === 5 && f1.achieved === 1, JSON.stringify({ ...f1, text: undefined }));
  check('the finish screen says it in Vietnamese: Hạng 2/4, +7 xu, +5 cúp', /Hạng 2\/4/.test(f1.text) && /\+7 xu/.test(f1.text)
    && /\+5 cúp/.test(f1.text), f1.text);
  // race 2 (last free one): map 2, four ghosts; when all four are home first the player is force-finished last
  await raceStarts('#raceEnd [data-act="again"]');
  const r2 = await page.evaluate(() => ({ level: window.__sh.race.level, n: window.__sh.race.ghosts.length,
    names: window.__sh.world.names.join('+') }));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await page.evaluate(() => { window.__sh.race.clock = 999; });
  await page.waitForSelector('#raceEnd.on', { timeout: 10000 }).catch(() => {});
  const f2 = await page.evaluate(() => ({ done: window.__sh.race.done, coins: window.__sh.save.coins,
    trophies: window.__sh.save.inv['progression.race_trophies'], text: document.querySelector('#raceEnd')?.innerText.replace(/\s+/g, ' ') }));
  check('race 2 is map 2 (STARTUPRace01+MIDDLE020+FINISH03) with 4 ghosts', r2.level === 1 && r2.n === 4
    && r2.names === 'STARTUPRace01+MIDDLE020+FINISH03', JSON.stringify(r2));
  check('4 ghosts home first = forced finish, 5th: +1 coin, +1 trophy', f2.done?.forced && f2.done.rank === 4 && f2.coins === 8
    && f2.trophies === 6 && /Hạng 5\/5/.test(f2.text), JSON.stringify({ ...f2, text: f2.text?.slice(0, 80) }));
  // free races are used up: the next race costs the 1 skip ticket, the one after is refused
  await raceStarts('#raceEnd [data-act="again"]');
  const t3 = await page.evaluate(() => ({ race: !!window.__sh.race && window.__sh.game.phase !== 'finish',
    tickets: window.__sh.save.inv['currency.skip_tickets'] }));
  await page.evaluate(() => window.__sh.openMode('mode.tournament'));
  await page.waitForSelector('#race.on .go', { timeout: 10000 });
  await page.click('#race .go');
  await page.waitForTimeout(300);
  const t4 = await page.evaluate(() => ({ page: !!document.querySelector('#race.on'), toast: document.getElementById('toast').textContent }));
  check('after 2 free races a race costs 1 skip ticket, then none is left', t3.race && t3.tickets === 0 && t4.page && /vé/.test(t4.toast),
    JSON.stringify({ t3, t4 }));
  // the daily board: seed (int)(low 32 bits of the start ms) / 1000, 9 AI from System.Random(seed), scores at noon
  const bd = await page.evaluate(async () => {
    const m = await import('./js/race.js'), cfg = window.__sh.mode.file.race;
    const b = new m.Board(cfg, 1793120400000);
    return { seed: b.seed, names: b.ai.slice(0, 3).map((a) => a.name),
      noon: b.ranking(1793120400000 + 43200000, 0, 12).map((r) => r.name + ':' + r.score).join(', '),
      p6: m.positionReward(cfg, 6), p7: m.positionReward(cfg, 7) };
  });
  check('daily board of 2026-10-28 (UTC+7): seed 2119037, AI HBK-Taker2 / Player1935 / Zeus, noon ranking', bd.seed === 2119037
    && bd.names.join() === 'HBK-Taker2,Player1935,Zeus'
    && bd.noon === 'HBK-Taker2:19, Bạn:12, Demetrius:8, ZedPS:8, _Pad:5, KissMachine:4, ReMiiXeD:4, Zeus:3, Player1935:2, Gravellings:1',
    JSON.stringify(bd));
  check('board rewards between listed positions are interpolated: 7th = 20 coins, 8th = 15', JSON.stringify(bd.p6) === '[["currency.skin_coins",20]]'
    && JSON.stringify(bd.p7) === '[["currency.skin_coins",15]]', JSON.stringify([bd.p6, bd.p7]));
  // a board two days old with 100 trophies: claimed on open at rank 1 -> 1000 coins + the first unowned pool skin
  // (Dolphin, played 0), one daily win; today's board starts with the trophies wiped
  await page.click('#race .x');
  await page.evaluate(() => {
    const s = window.__sh.save;
    s.modes['mode.tournament'].board = { start: 1793120400000 - 2 * 86400000 };
    s.inv['leaderboard.tournament_best_score'] = 100; s.coins = 0;
  });
  await page.evaluate(() => window.__sh.openMode('mode.tournament'));
  await page.waitForSelector('#race.on .msg', { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, 'race-claim.png') });
  const cl = await page.evaluate(() => { const s = window.__sh.save; return { coins: s.coins, dolphin: s.owned.skins.includes('dolphin'),
    win: s.inv['leaderboard.tournament_win'], played: s.inv['leaderboard.tournament_played'], trophies: s.inv['progression.race_trophies'] || 0,
    start: s.modes['mode.tournament'].board.start, msg: document.querySelector('#race .msg')?.textContent.replace(/\s+/g, ' ') }; });
  const midnight = await page.evaluate(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); });
  check('a finished board pays rank 1: 1000 coins + Dolphin, 1 win, 1 played; the new board has 0 trophies', cl.coins === 1000 && cl.dolphin
    && cl.win === 1 && cl.played === 1 && cl.trophies === 0 && cl.start === midnight && /hạng 1/.test(cl.msg), JSON.stringify(cl));
  await page.click('#race .x');

  // ---- Adventure: the endless run against the firewall (js/adventure.js + js/advrun.js, README "Phiêu lưu") ----
  await page.evaluate(() => {
    const s = window.__sh.save;
    delete s.modes['mode.adventure']; delete s.claimed['progression.adventure_best_score'];
    for (const k of Object.keys(s.inv)) if (/adventure/.test(k)) delete s.inv[k];
  });
  const advFirst = requested.length;
  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode[data-id="mode.adventure"] button', { timeout: 10000 });
  await page.click('#modes .mode[data-id="mode.adventure"] button');
  await page.waitForSelector('#adv.on .go', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'adv-skills.png') });
  const ap = await page.evaluate(() => ({ skills: [...document.querySelectorAll('#adv .sk b')].map((b) => b.textContent),
    rows: document.querySelectorAll('#adv li').length, me: !!document.querySelector('#adv li.me'), road: document.querySelector('#adv .road div b')?.textContent,
    btn: document.querySelector('#adv .sk button')?.textContent, disabled: document.querySelector('#adv .sk button')?.disabled }));
  check('the Adventure row opens its page: 6 skills at level 0/20 in Vietnamese, the road from 1 m, the weekly top 10 + my row',
    ap.skills.length === 6 && ap.skills[0] === 'Độ nảy · cấp 0/20' && ap.skills[3] === 'Độ dài dây · cấp 0/20' && ap.road === '1 m'
    && ap.rows === 11 && ap.me && ap.btn === '100 xu PL' && ap.disabled, JSON.stringify(ap));
  check('the Adventure code, patterns and art load only when the mode opens', ['js/adventure.js', 'js/advrun.js', 'data/mode-adventure.json',
    'art/adventure.webp'].every((f) => requested.slice(advFirst).some((u) => u.includes(f))));
  // a run on a fixed seed: the same seed gives the same patterns, zones, portals and target types; another seed differs
  const layout = () => page.evaluate(() => window.__sh.adv.run.spawned.map((s) => [s.name, s.zone && [s.zone.type, +s.zone.x.toFixed(3)],
    s.portal && [+s.portal.x.toFixed(2), +s.portal.y.toFixed(2)], s.targets.map((t) => t.type).join(''), s.bumpers.map((b) => b.type).join('')]));
  const startAdv = (seed) => page.evaluate(async (seed) => { const m = await import('./js/adventure.js'); await m.startRun(null, { seed }); }, seed);
  const advPause = (v) => page.evaluate((v) => { window.__sh.adv.paused = v; }, v);
  await startAdv(1792810);
  const l1 = await layout();
  await startAdv(1792810);
  const l2 = await layout();
  await startAdv(1792868);
  const l3 = await layout();
  check('same seed, same layout: 1792810 = INITIAL000 (portal at 1.89, 2.59) + NewEasyLow (2) (DOWN zone at 18.874); 1792868 differs',
    JSON.stringify(l1) === JSON.stringify(l2) && l1.map((s) => s[0]).join('|') === 'INITIAL000|NewEasyLow (2)'
    && JSON.stringify(l1[0][2]) === '[1.89,2.59]' && JSON.stringify(l1[1][1]) === '[1,18.874]'
    && l3.map((s) => s[0]).join('|') === 'INITIAL000|NewEasyMid (4)' && JSON.stringify(l3[1][1]) === '[0,20.835]', JSON.stringify([l1, l3]));
  await startAdv(1792810);
  await page.waitForFunction(() => window.__sh.adv.phase === 'play' && window.__sh.adv.t > 0.4, null, { timeout: 5000 }).catch(() => {});
  await advPause(true);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(SHOTS, 'adv-start.png') });
  const st0 = await page.evaluate(() => { const a = window.__sh.adv, r = a.run; return { spawn: r.spawn, rope: r.rope, fire: [r.fire.x, r.fire.moving],
    hud: r.distance }; });
  check('a run starts at INITIAL000\'s spawn (0.86, 6.27), rope 3 m, the firewall waiting at x 0 until the first grab',
    st0.spawn.x === 0.86 && st0.spawn.y === 6.27 && st0.rope === 3 && st0.fire[0] === 0 && !st0.fire[1], JSON.stringify(st0));
  // gravity zones: 10 fixed steps from rest inside the zone (the frame loop paused)
  const zonePush = (seed) => page.evaluate(async (seed) => {
    const m = await import('./js/adventure.js');
    await m.startRun(null, { seed });
    const a = window.__sh.adv, r = a.run, z = r.spawned[1].zone;
    a.paused = true; a.phase = 'play';
    Object.assign(r.player, { x: z.x, y: z.y, vx: 0, vy: 0, age: 5 });
    for (let i = 0; i < 10; i++) r.fixed(0.02, false);
    r.cam.x = z.x;
    return { eg: r.player.eg, v: [Math.round(r.player.vx * 1000) / 1000, Math.round(r.player.vy * 1000) / 1000] };
  }, seed);
  const zUp = await zonePush(1792868);
  // the picture: near the zone's left edge, running for a moment so its particles drift up and right
  await page.evaluate(() => { const a = window.__sh.adv, r = a.run, z = r.spawned[1].zone;
    Object.assign(r.player, { x: z.x - 3.5, y: 0, vx: 0, vy: 0 }); r.cam.x = z.x - 3.5; a.paused = false; });
  await page.waitForTimeout(450);
  await advPause(true);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(SHOTS, 'adv-zone.png') });
  const zDown = await zonePush(1792810);
  check('gravity zones push: UP (10, 3) -> v (0.9, -1.888), DOWN (-3, -1.5) -> v (-0.27, -2.293), gravity alone -2.158',
    JSON.stringify(zUp) === '{"eg":[10,3],"v":[0.9,-1.888]}' && JSON.stringify(zDown) === '{"eg":[-3,-1.5],"v":[-0.27,-2.293]}',
    JSON.stringify([zUp, zDown]));
  // the portal on INITIAL000 of seed 1792810 sends the player 1..2 patterns ahead, 1 unit left of a spawn point
  await startAdv(1792810);
  await page.evaluate(() => { const a = window.__sh.adv, o = a.run.spawned[0].portal; a.phase = 'play'; a.t = 0;
    Object.assign(a.run.player, { x: o.x - 1.2, y: o.y, vx: 6, vy: 0.5, age: 5 }); a.run.cam.x = o.x; });
  await page.waitForFunction(() => { const p = window.__sh.adv.run.player; return p.tele && p.tele.t > 0.1; }, null, { timeout: 5000 }).catch(() => {});
  await advPause(true);
  // the destination draws from UnityEngine.Random's global state (whatever spawned last), so it is checked against the rule:
  // pattern 1 or 2 ahead of the portal's, one of its spawn points, 1 unit to the left
  const tp = await page.evaluate(() => { const r = window.__sh.adv.run, p = r.player;
    const ok = r.spawned.slice(1, 3).flatMap((s) => s.sp.map(([x, y]) => [Math.round((x - 1) * 1000) / 1000, y]));
    return { to: p.tele?.to && p.tele.to.map((v) => Math.round(v * 1000) / 1000), ok, alpha: p.alpha }; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(SHOTS, 'adv-portal.png') });
  await advPause(false);
  await page.waitForFunction(() => !window.__sh.adv.run.player.tele, null, { timeout: 8000 }).catch(() => {});
  await advPause(true);
  const tp2 = await page.evaluate(() => { const p = window.__sh.adv.run.player, o = window.__sh.adv.run.spawned[0].portal;
    return { x: p.x, alpha: p.alpha, closed: o.killed >= 0 }; });
  check('the portal teleports 1-2 patterns ahead, 1 unit left of a spawn point, see-through (alpha 0.3), then solid with the portal closed',
    !!tp.to && tp.ok.some((q) => q[0] === tp.to[0] && q[1] === tp.to[1]) && tp.to[0] > 20 && tp.alpha === 0.3 && tp2.alpha === 1
    && tp2.x > tp.to[0] - 0.5 && tp2.closed, JSON.stringify([tp, tp2]));
  // the firewall close behind, then it catches the player: one life, the run ends and pays out
  await startAdv(1792800);
  await page.evaluate(() => { const a = window.__sh.adv, r = a.run; a.paused = true; a.phase = 'play';
    r.fire.moving = false; r.fire.x = 122.5; Object.assign(r.player, { x: r.startX + 123.6, y: 1, vx: 0, vy: 0, age: 5 });
    r.update(0); r.cam.x = r.player.x; a.paused = false; });
  // the firewall's particles need a few frames to fill in (held in place, not moving yet)
  await page.waitForTimeout(400);
  await page.evaluate(() => { const a = window.__sh.adv, r = a.run; a.paused = true;
    r.fire.moving = true; r.fire.timer = 10; Object.assign(r.player, { x: r.startX + 123.6, y: 1, vx: 0, vy: 0 }); r.cam.x = r.player.x; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'adv-fire.png') });
  await page.evaluate(() => { const a = window.__sh.adv, r = a.run; r.fire.x = r.player.x - 0.2; a.paused = false; });
  await page.waitForSelector('#advEnd.on', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'adv-end.png') });
  const fe = await page.evaluate(() => { const s = window.__sh.save, a = window.__sh.adv;
    const disk = JSON.parse(localStorage.getItem('stickman-hook'));
    return { why: a.run.dead?.why, d: a.run.distance, text: document.querySelector('#advEnd')?.innerText.replace(/\s+/g, ' '),
      tok: s.inv['currency.adventure_tokens'], best: s.inv['leaderboard.adventure_best_score'], road: s.claimed['progression.adventure_best_score'],
      boosters: s.pending?.length, disk: [disk.inv['currency.adventure_tokens'], disk.inv['leaderboard.adventure_best_score'],
        disk.claimed['progression.adventure_best_score']] }; });
  check('the firewall kills: "Tường lửa bắt kịp bạn" at 123 m, the road paid as one line', fe.why === 'fire' && fe.d === 123 && /123 m/.test(fe.text)
    && /Tường lửa bắt kịp bạn/.test(fe.text) && /\+123 xu phiêu lưu · Đường kỷ lục: \+800 xu phiêu lưu, Common Card/.test(fe.text), JSON.stringify({ ...fe, text: fe.text?.slice(0, 120) }));
  check('123 m = +123 tokens + road steps 1..100 (800 tokens), best 123, all written to localStorage', fe.tok === 923 && fe.best === 123
    && fe.road === 100 && JSON.stringify(fe.disk) === '[923,123,100]', JSON.stringify(fe.disk));
  // the skill shop: 100 tokens a level (100 + 10 per 10 levels in total), rope 3 -> 4.455 m
  await page.click('#advEnd [data-act="page"]');
  await page.waitForSelector('#adv.on .sk', { timeout: 10000 });
  await page.click('#adv .sk[data-id="rope_length"] button');
  await page.waitForTimeout(200);
  const buy = await page.evaluate(async () => { const s = window.__sh.save, m = await import('./js/adventure.js');
    await m.startRun(null, { seed: 1792800 });
    const rope = window.__sh.adv.run.rope;
    return { lv: s.inv['progression_adventure_skill_level.rope_length'], tok: s.inv['currency.adventure_tokens'], rope }; });
  check('buying a skill level: rope length level 1 for 100 tokens, the next run\'s rope is 4.455 m', buy.lv === 1 && buy.tok === 823
    && Math.abs(buy.rope - 4.4553) < 1e-3, JSON.stringify(buy));
  await page.evaluate(() => { window.__sh.adv.paused = true; });
  await page.click('#advPlay .btn');
  await page.waitForSelector('#advEnd.on [data-act="page"]', { timeout: 5000 });
  await page.click('#advEnd [data-act="page"]');
  await page.waitForSelector('#adv.on .sk', { timeout: 10000 });
  await page.screenshot({ path: path.join(SHOTS, 'adv-skills.png') });
  await page.click('#adv .x');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  srv?.close();
  console.log(`\n${pass} pass, ${fail} fail   shots: ${SHOTS}`);
  process.exit(fail ? 1 : 0);
})();
