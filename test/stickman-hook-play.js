#!/usr/bin/env node
/* Stickman Hook (games/stickman-hook) in a real browser: loads light, hooks, finishes level 1, moves on to level 2,
 * and the level list opens. Then the meta shell: XP per level, level themes, the XP road claim, Customization equip,
 * equipped skin / rope drawn in game, an effect-variant skin, the mode list. Then the modes: a seasonal event after
 * Normal level 10, and with enough XP Mechanical Grapple and Challenge (pickers, theme colours, rewards, next, restart).
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
  const modeFiles = requested.filter((u) => /mode-\w+\.json|grapple\.js|menus\.js/.test(u));
  check('first level loads no mode data', modeFiles.length === 0, modeFiles.join(' '));
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
  check('finish plays the skin dance clip', await page.evaluate(() => window.__sh.look.dance?.id === 'skin.basic'));

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

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  srv?.close();
  console.log(`\n${pass} pass, ${fail} fail   shots: ${SHOTS}`);
  process.exit(fail ? 1 : 0);
})();
