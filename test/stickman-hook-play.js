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
  const bonusFiles = requested.filter((u) => /bonus\.js|bonus\.json|wheel\.webp|piggy\.webp|skip\.webp|endgame\.js|\/ui\.webp|\/ui\.json/.test(u));
  check('first level loads no wheel / piggy / skip / end game code or art', bonusFiles.length === 0, bonusFiles.join(' '));
  const fxFiles = requested.filter((u) => /trailfx|\/fx\.js|art\/fx\/|m-road/.test(u));
  check('first level loads no trail particle / skin effect / road code or art; default trail has no particles',
    fxFiles.length === 0 && await page.evaluate(() => window.__sh.trailfx === null), fxFiles.join(' '));
  const cardsEarly = requested.filter((u) => /cards\.js|cardsui\.js|cards\.json|m-cards|m-boost/.test(u));
  check('first level loads no cards code, data or art', cardsEarly.length === 0, cardsEarly.join(' '));
  check('level 1 is Solo1 with one target', await page.evaluate(() => window.__sh.world.names.join() === 'Solo1' && window.__sh.world.targets.length === 1));
  // DefaultInGameUI: the pause button and the "1 ▬ 2" progress bar; no other in-level buttons
  check('in-level HUD is the pause button (B_PauseButton) only', await page.evaluate(() => {
    const b = document.getElementById('btnPause'), r = b.getBoundingClientRect();
    return getComputedStyle(b).visibility === 'visible' && /atlas\.webp/.test(b.style.backgroundImage) && r.width > 40 && r.width < 60
      && !document.getElementById('btnLevels').checkVisibility();
  }));

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
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'finish.png') });
  // Finish: the FINISHED pose (state 6) through the slow motion, no dance in the level; the end game 1 s after the finish
  check('the finish keeps the FINISHED pose, the pause button goes', await page.evaluate(() => window.__sh.player.state === 6
    && getComputedStyle(document.getElementById('btnPause')).visibility === 'hidden'));
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stickman-hook') || '{}'));
  check('progress saved (best level 1)', saved.best === 1, `best ${saved.best}`);
  check('level 1 gives +10 XP', saved.xp === 10, `xp ${saved.xp}`);
  // XpRoadService.OnXpChanged: the 10 XP are pending, so the automatic XP road popup opens before the piggy bank
  await page.waitForFunction(() => !!document.getElementById('road')?.dataset.states, null, { timeout: 10000, polling: 30 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'road-auto.png') });
  const rpop = await page.evaluate(() => { const r = document.getElementById('road'); return { first: r?.dataset.states.split(',')[0],
    home: r?.dataset.home, pend: r?.dataset.pend }; });
  check('level 1 end: the XP road popup opens by itself, animating 10 pending XP with the back button hidden',
    rpop.first === 'animating' && rpop.home === 'hidden' && rpop.pend === '10', JSON.stringify(rpop));
  await page.waitForFunction(() => document.getElementById('road')?.dataset.state === 'claimed', null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, 'road-auto-claimed.png') });
  const rc = await page.evaluate(() => ({ claimed: window.__sh.save.inv['progression.xp_claimed'], step: window.__sh.save.claimed['progression.xp'],
    wheel: !!window.__sh.save.modes['mode.lucky_wheel']?.unlocked, pops: document.querySelectorAll('#road .rcard .ok.pop').length,
    card: document.querySelector('#road .rcard[data-step="0"]')?.dataset.kind }));
  check('ClaimAllRewards: claimed XP 10, step 0 (0 XP, Lucky Wheel, a ModeReward card) claimed with its check mark',
    rc.claimed === 10 && rc.step === 0 && rc.wheel && rc.pops === 1 && rc.card === 'mode', JSON.stringify(rc));
  await page.waitForFunction(() => document.getElementById('road')?.dataset.state === 'closed', null, { timeout: 4000 }).catch(() => {});
  check('the popup closes by itself 600 ms after the claim', await page.evaluate(() => !document.querySelector('#road.on')
    && document.getElementById('road').dataset.states === 'animating,claimed,closed'));
  await page.waitForFunction(() => window.__sh.look.dance?.id === 'skin.basic', null, { timeout: 10000 }).catch(() => {});
  check('finish plays the skin dance clip', await page.evaluate(() => window.__sh.look.dance?.id === 'skin.basic'));
  // piggy bank: a Normal level's first completion fills it by fillConfigs[threshold 0].levelComplete = 10; the full-screen
  // PiggyBankPopup comes first, then the end page
  await page.waitForSelector('#egPiggy.on', { timeout: 10000 }).catch(() => {});
  const pig1 = await page.evaluate(() => ({ p: window.__sh.save.inv['progression.piggy_bank_progress'],
    res: document.getElementById('egPiggy')?.dataset.res, on: !!document.querySelector('#egPiggy.on') }));
  check('finishing level 1 fills the piggy bank by 10 toward Stick Frog (full-screen popup)', pig1.p === 10 && pig1.res === 'skin.stick_frog' && pig1.on,
    JSON.stringify(pig1));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'finish-piggy.png') });

  await page.mouse.click(195, 300);
  await page.waitForSelector('#egPage.on #egPlay', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'end-page.png') });
  check('tapping the piggy popup opens the end page', await page.evaluate(() => !!document.querySelector('#egPage.on')
    && !document.querySelector('#egPiggy.on') && window.__sh.world.index === 0));
  await page.click('#egPlay');
  await page.waitForTimeout(300);
  check('Play on the end page opens level 2', await page.evaluate(() => window.__sh.world.index === 1 && window.__sh.world.names.join() === 'Solo2'
    && !document.querySelector('#endgame.on')));

  await page.click('#btnPause');
  await page.waitForTimeout(150);
  check('the pause button pauses and opens the pause menu', await page.evaluate(() => window.__sh.game.paused
    && document.getElementById('pause').classList.contains('on')));
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

  // ---- level theme: every 4 levels (server nbLevelsPerTheme) the camera, shadow and target colours change
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

  // reached but unclaimed steps grant nothing until the popup claims them: Race (150 XP) stays locked
  check('XP alone does not unlock: Race (150 XP) stays locked until claimed', await page.evaluate(() =>
    !window.__sh.save.modes['mode.tournament']?.unlocked
    && !window.__sh.meta.modeState(window.__sh.save, window.__sh.meta.d.modes.find((m) => m[0] === 'mode.tournament')).open));
  // opening the road with pending XP animates and claims too (OnShowEndedAsync), then closes
  await page.evaluate(() => window.__sh.openMenu('openRoad'));
  await page.waitForFunction(() => document.getElementById('road')?.dataset.state === 'animating', null, { timeout: 10000, polling: 30 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'road.png') });
  await page.waitForFunction(() => document.getElementById('road')?.dataset.state === 'claimed', null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, 'road-claimed.png') });
  const road = await page.evaluate(() => ({ ropes: window.__sh.save.owned.ropes, claimed: window.__sh.save.claimed['progression.xp'],
    coins: window.__sh.save.coins, race: !!window.__sh.save.modes['mode.tournament']?.unlocked,
    cards: [...document.querySelectorAll('#road .rcard')].slice(0, 6).map((c) => c.dataset.kind).join() }));
  check('XP road popup claims the steps under the pending XP (300 + the level road skins): Spiders rope, 150 coins, Race, up to 350; cards mode,big,small,mode,big,big',
    road.ropes.includes('spiders') && road.claimed === 350 && road.coins === 150 && road.race && road.cards === 'mode,big,small,mode,big,big',
    JSON.stringify(road));
  await page.waitForFunction(() => document.getElementById('road')?.dataset.state === 'closed', null, { timeout: 4000 }).catch(() => {});
  // the unlocked items' XP is pending again: the popup shows again until nothing is (main.js roadPopup)
  await page.evaluate(() => window.__sh.app.roadPopup());
  const road2 = await page.evaluate(() => ({ claimed: window.__sh.save.claimed['progression.xp'], pend: window.__sh.meta.xpPending(window.__sh.save),
    pachinko: !!window.__sh.save.modes['mode.pachinko']?.unlocked }));
  check('item XP from the claim is pending again; the next popup claims on to 450 (Lama)', road2.claimed === 450 && road2.pend === 0 && road2.pachinko,
    JSON.stringify(road2));
  // nothing pending: the road opens to browse with its back button
  await page.evaluate(() => window.__sh.openMenu('openRoad'));
  await page.waitForFunction(() => document.getElementById('road')?.dataset.state === 'browse', null, { timeout: 10000 }).catch(() => {});
  check('with nothing pending the road opens to browse, Home button shown; ranks count from 0 (1850 XP = rank 21 as in the 2026 clip)',
    await page.evaluate(() => getComputedStyle(document.querySelector('#road .home')).display !== 'none'
      && window.__sh.meta.rankOf(1850) === 21 && window.__sh.meta.rankOf(0) === 0
      && document.querySelector('#road .oct.medal')?.dataset.step === String(window.__sh.meta.rankOf(window.__sh.save.xp))));
  await page.click('#road .home');

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
  // AllIn1SpriteShader animation (fx.js, art/fx/anim.json): hologram stripes scroll with _Time, so one texel's alpha changes
  const holo = await page.evaluate(() => { const fx = window.__sh.look.skin.fx, n = window.__sh.look.skin.states[2][0];
    return { anim: fx.anim.map((o) => o[0]).join(), hs: fx.anim.find((o) => o[0] === 'hs').slice(1).join(),
      a0: fx.sample(n, 10, 0.575, 0.025)[3], a1: fx.sample(n, 10.5, 0.575, 0.025)[3] }; });
  check('hologram skin animates as the shader: ops t,gl,fl,hs,ca,ol, stripes [0.069,0.11,3.19,0.43,1], texel alpha 255 at t 10 -> 154 at 10.5',
    holo.anim === 't,gl,fl,hs,ca,ol' && holo.hs === '0.069,0.11,3.19,0.43,1' && holo.a0 === 255 && holo.a1 === 154, JSON.stringify(holo));
  // a static variant keeps its one bake; shake (SHAKEUV) moves the pivot only
  const fx2 = await page.evaluate(async () => {
    const m = window.__sh.meta, cu = window.__sh.app.custom;
    const pix = await cu.skin(m.byId.get('skin.basket_pixelated_friends')), cl = await cu.skin(m.byId.get('skin.cloud_the_negative_ones'));
    const n = cl.states[2][0];
    return { pixAnim: pix.fx.animated, pixOps: JSON.stringify(pix.fx.ops), clPer: cl.fx.perPixel,
      p0: Math.round(cl.fx.render(n, 10)[1][4] * 100) / 100, p1: Math.round(cl.fx.render(n, 10.2)[1][4] * 100) / 100 };
  });
  check('Pixelated Friends stays a static bake (pix 84); Negative Ones shakes its pivot 86.77 -> 90.11 without a per-pixel pass',
    !fx2.pixAnim && fx2.pixOps === '[["pix",84]]' && fx2.clPer === false && fx2.p0 === 86.77 && fx2.p1 === 90.11, JSON.stringify(fx2));
  await page.evaluate(() => window.__sh.startLevel(0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'skin-fx-2.png') });

  // trail particles (trailfx.js): the fire trail's prefab systems, loaded only when it is equipped
  await page.evaluate(() => { const s = window.__sh.save; s.owned.trails.push('fire'); s.equipped.trails = 'fire'; window.__sh.applyEquip(); });
  await page.waitForFunction(() => window.__sh.trailfx?.name === 'fire', null, { timeout: 10000 }).catch(() => {});
  const overlays0 = await page.evaluate(() => [...document.querySelectorAll('.overlay.on')].map((e) => e.id).join());
  await page.evaluate(() => { for (const e of document.querySelectorAll('.overlay.on')) window.__sh.overlay(e.id, false); window.__sh.startLevel(2); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  const tf0 = await page.evaluate(() => window.__sh.trailfx);
  await page.mouse.move(195, 600); // off the pause button, where the last click (the shop's home button) left the mouse
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(800);
  const tf1 = await page.evaluate(() => window.__sh.trailfx);
  const tf1p = await page.evaluate(() => window.__sh.game.paused + ' ' + window.__sh.game.phase);
  await page.screenshot({ path: path.join(SHOTS, 'trail-fire.png') });
  await page.mouse.up({ button: 'left' });
  check('fire trail: data/trailfx/fire.json + art loaded, 3 systems BaseFollow/BaseSmoke/BaseShine (max 1000), 0 at spawn, 30-80 particles after 0.8 s',
    requested.some((u) => u.includes('/data/trailfx/fire.json')) && requested.some((u) => u.includes('/art/trailfx/fire.webp'))
    && tf1?.line === true && tf1.systems.map((x) => x.name + ':' + x.max).join() === 'BaseFollow:1000,BaseSmoke:1000,BaseShine:1000'
    && tf0.count === 0 && tf1.count >= 30 && tf1.count <= 80, JSON.stringify({ overlays0, paused: tf1p, tf0: tf0?.count, tf1 }));
  await page.evaluate(() => { const s = window.__sh.save; s.owned.trails.push('candy', 'thunder'); s.equipped.trails = 'candy'; window.__sh.applyEquip(); });
  await page.waitForFunction(() => window.__sh.trailfx?.name === 'candy', null, { timeout: 10000 }).catch(() => {});
  const candy = await page.evaluate(() => window.__sh.trailfx.systems.find((x) => x.name === 'BaseFollow')?.max);
  await page.evaluate(() => { window.__sh.save.equipped.trails = 'thunder'; window.__sh.applyEquip(); });
  await page.waitForFunction(() => window.__sh.trailfx?.name === 'thunder', null, { timeout: 10000 }).catch(() => {});
  const gold = await page.evaluate(() => window.__sh.trailfx?.line);
  check('candy BaseFollow keeps at most 100 particles; thunder has no trail line (TrailRenderer off)', candy === 100 && gold === false,
    JSON.stringify({ candy, gold }));
  await page.evaluate(() => { const s = window.__sh.save; s.equipped.trails = 'basic'; s.equipped.skins = 'alien_hologram_travelers'; window.__sh.applyEquip();
    window.__sh.overlay('start', true); });

  await page.evaluate(() => window.__sh.openMenu('openModes'));
  await page.waitForSelector('#modes .mode', { timeout: 10000 });
  const modes = await page.evaluate(() => [...document.querySelectorAll('#modes .mode')].map((m) => m.dataset.id + ':' + m.innerText.replace(/\s+/g, ' ')));
  check('mode list: Normal playable, Grapple locked by XP', modes.some((m) => m.startsWith('mode.normal') && m.includes('Chơi'))
    && modes.some((m) => m.startsWith('mode.grapple') && m.includes('2650 XP')), modes.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, 'modes.png') });
  await page.click('#modes .x');
  // the swings above may have crossed the finish line (the end game then covers the level): back to a fresh level 1
  await page.evaluate(() => window.__sh.startLevel(0));
  if (!(await page.evaluate(() => document.getElementById('start').classList.contains('on')))) {
    await page.click('#btnPause');
    await page.click('#btnMenu');
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'home.png') });
  await page.click('#btnPlay');

  // ---- modes. Helpers: open a mode from the mode list and pick a level; jump past the finish line.
  // the automatic XP road popup and the boosters it claims (welcome pack at 550 XP...) open over the home page:
  // let the popup finish and open / close every booster, as a player would
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('#road.on'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    for (let k = 0; k < 8 && await page.evaluate(() => !!document.querySelector('#boostPop.on')); k++) {
      for (let i = 0; i < 12 && !(await page.evaluate(() => document.getElementById('boostPop').classList.contains('done'))); i++) {
        await page.mouse.click(195, 500); await page.waitForTimeout(i ? 450 : 2300);
      }
      await page.click('#boostPop .close'); await page.waitForTimeout(1200);
    }
  };
  const playMode = async (id, level) => {
    await page.waitForFunction(() => !document.querySelector('#road.on'), null, { timeout: 15000 }).catch(() => {});
    // from a level's end page: Home first (the end page covers the level, as in the original)
    if (await page.evaluate(() => !!document.querySelector('#egPage.on'))) await page.click('#egHome');
    await settle();
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
  await page.waitForSelector('#egPage.on #egPlay', { timeout: 10000 }).catch(() => {});
  await page.click('#egPlay');
  await page.waitForTimeout(300);
  // SeasonalEventsService: today's reward won -> PARTIALLY_FINISHED until tomorrow; the day's free game is spent too
  const evDone = await page.evaluate(() => ({ picker: document.getElementById('levels').classList.contains('on'),
    open: [...document.querySelectorAll('#grid button')].filter((b) => !b.disabled).length,
    note: document.getElementById('levelsNote').textContent,
    free: Object.entries(window.__sh.save.flags).find(([k]) => k.startsWith('daily_flag_mode.easter_event_free_')) }));
  check('after winning today\'s Easter reward, Play shows the picker with no open level ("Đã nhận quà hôm nay"), free flag 1',
    evDone.picker && evDone.open === 0 && /^Đã nhận quà hôm nay/.test(evDone.note) && evDone.free?.[1] === 1
    && /_free_\d{4}-\d\d-\d\d$/.test(evDone.free?.[0]), JSON.stringify(evDone));
  await page.click('#btnClose');
  check('closing the event picker without a paid game goes back to Normal and the home page', await page.evaluate(() =>
    window.__sh.mode.id === 'mode.normal' && document.getElementById('start').classList.contains('on')));
  const vd = await playMode('mode.valentine_day', 1);
  const valentine = await bgAt();
  check('Valentine event opens with its own theme', vd.n === 5 && valentine.theme === '#FD95B0', `${valentine.theme} ${valentine.px}`);
  // daily.js on bare saves: GameModesService limits, FormatDateId, the seasonal one-level-a-day cycle
  const dr = await page.evaluate(async () => {
    const d = await import('./js/daily.js');
    const T = new Date(2026, 9, 29, 10).getTime(), DAY = 86400000;
    const sv = (t) => ({ flags: {}, inv: { 'currency.skip_tickets': t }, modes: {} });
    const p = sv(2), pays = [];
    for (let i = 0; i < 4; i++) pays.push(d.payPlay(p, 'mode.pachinko', T));
    const pst = d.playState(p, 'mode.pachinko', T);
    const next = d.playState(p, 'mode.pachinko', T + DAY).state;
    d.payPlay(p, 'mode.pachinko', T + DAY);
    const e0 = sv(0), e5 = sv(5), ep = [d.payPlay(e0, 'mode.easter_event', T), d.payPlay(e0, 'mode.easter_event', T)];
    for (let i = 0; i < 4; i++) ep.push(d.payPlay(e5, 'mode.easter_event', T));
    const r = sv(0), rp = [0, 1, 2].map(() => d.payPlay(r, 'mode.tournament', T));
    const n = sv(0), np = [0, 1, 2].map(() => d.payPlay(n, 'mode.challenge', T));
    // the event cycle: 5 rewards, none owned at T
    const own = new Set(), owned = (i) => own.has(i), s = sv(0), ev = [];
    ev.push(d.eventToday(s, 'mode.easter_event', 5, owned, T));
    own.add(0); ev.push(d.eventToday(s, 'mode.easter_event', 5, owned, T + 3600000));
    ev.push(d.eventToday(s, 'mode.easter_event', 5, owned, T + DAY));
    own.add(1); ev.push(d.eventToday(s, 'mode.easter_event', 5, owned, T + 5 * DAY));
    for (let i = 2; i < 5; i++) own.add(i);
    ev.push(d.eventToday(s, 'mode.easter_event', 5, owned, T + 9 * DAY));
    return { key: d.dayKey(T), pays, pst: [pst.state, pst.played, pst.max, p.inv['currency.skip_tickets']], next,
      keys: Object.keys(p.flags).sort(), ep, e5t: e5.inv['currency.skip_tickets'], rp, np,
      ev: ev.map((x) => [x.level, x.wonToday, x.all, x.days]) };
  });
  check('FormatDateId = "yyyy-MM-dd": 29 Oct 2026 -> 2026-10-29', dr.key === '2026-10-29', dr.key);
  // the rewarded ad of a play (AdController.SafelyDisplayAd): a skip ticket pays it when owned ('skip'), else it is granted
  // at once ('ad'); only the daily cap refuses (null)
  check('Lucky Drop a day: free, then 2 ads paid by the 2 skip tickets (2 -> 0), then refused: "Daily limit" 3/3; next day free again, old flags cleaned',
    JSON.stringify(dr.pays) === '["free","skip","skip",null]' && JSON.stringify(dr.pst) === '["limit",3,3,0]' && dr.next === 'free'
    && JSON.stringify(dr.keys) === '["daily_flag_mode.pachinko_free_2026-10-30"]', JSON.stringify(dr));
  check('events: 1 free game a day, then ads with no daily cap: with 0 tickets the ad is granted at once, with 5 tickets 3 ads take 3 (5 -> 2)',
    JSON.stringify(dr.ep) === '["free","ad","free","skip","skip","skip"]' && dr.e5t === 2, JSON.stringify(dr.ep) + ' ' + dr.e5t);
  check('Race: 2 free a day then the ad (0 tickets: granted at once); Challenge (-1/-1): always free',
    JSON.stringify(dr.rp) === '["free","free","ad"]' && JSON.stringify(dr.np) === '["free","free","free"]', JSON.stringify([dr.rp, dr.np]));
  check('event cycle: day 0 level 1, won -> done today; day 1 level 2; after 5 days a new cycle of the 3 unowned (level 3); all owned -> finished',
    JSON.stringify(dr.ev) === '[[0,false,false,5],[0,true,false,5],[1,false,false,5],[2,false,false,3],[-1,false,true,0]]', JSON.stringify(dr.ev));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'valentine.png') });

  // a save with 3000 XP: Mechanical Grapple (2650) and Challenge (1250) are open; 3 Challenge road steps reached
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('stickman-hook'));
    localStorage.setItem('stickman-hook', JSON.stringify({ ...s, xp: 3000 }));
  });
  await page.goto(level1);
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  const lock0 = await page.evaluate(() => ['mode.grapple', 'mode.challenge'].map((id) =>
    window.__sh.meta.modeState(window.__sh.save, window.__sh.meta.d.modes.find((m) => m[0] === id)).open).join());
  // GameModesService.IsUnlocked = the mode resource owned: 3000 XP opens nothing until the road popup claims it
  await page.evaluate(() => window.__sh.app.roadPopup());
  const lock1 = await page.evaluate(() => ({ open: ['mode.grapple', 'mode.challenge'].map((id) =>
    window.__sh.meta.modeState(window.__sh.save, window.__sh.meta.d.modes.find((m) => m[0] === id)).open).join(),
    levels: window.__sh.save.modes['mode.challenge']?.levels, claimed: window.__sh.save.inv['progression.xp_claimed'], xp: window.__sh.save.xp }));
  check('Grapple / Challenge locked at 3000 XP until claimed; the popup claims them, and again for the item XP (4 Challenge levels), claimed XP = XP',
    lock0 === 'false,false' && lock1.open === 'true,true' && lock1.levels === 4 && lock1.claimed === lock1.xp, JSON.stringify({ lock0, lock1 }));
  const xpClaimed = lock1.xp;
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
  check('finishing Grapple 1 gives 10 XP and saves it', gSave.xp === xpClaimed + 10 && gSave.modes['mode.grapple'].best === 1,
    `xp ${gSave.xp} ${JSON.stringify(gSave.modes['mode.grapple'])}`);

  const cp = await playMode('mode.challenge', 1);
  check('Challenge picker shows 30 levels, 5 open (4 claimed Challenge levels)', cp.n === 30 && cp.open === 5, JSON.stringify(cp));
  const ch = await bgAt();
  check('Challenge level 1 loads with the Challenge theme', ch.theme === '#35C1CC' && ch.px !== grapple.px
    && await page.evaluate(() => window.__sh.world.names.join('+') === 'STARTU031+MIDDLEv2_002+FINISH40'), `${ch.theme} ${ch.px}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'challenge.png') });
  await page.click('#btnPause');
  await page.click('#btnRestart');
  check('restart keeps the mode and level', await page.evaluate(() => window.__sh.mode.id === 'mode.challenge' && window.__sh.world.index === 0));
  await page.evaluate(() => window.__sh.startLevel(4));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.screenshot({ path: path.join(SHOTS, 'challenge-finish.png') });
  await page.waitForSelector('#egPage.on #egPlay', { timeout: 10000 }).catch(() => {});
  await page.click('#egPlay');
  await page.waitForTimeout(400);
  const lastCh = await page.evaluate(() => ({ picker: document.getElementById('levels').classList.contains('on'),
    done: window.__sh.save.modes['mode.challenge'].done.join(), idx: window.__sh.world.index, road: !!document.querySelector('#road.on'),
    eg: !!document.querySelector('#endgame.on') }));
  check('after the last open Challenge level the picker opens', lastCh.picker && lastCh.done === '4', JSON.stringify(lastCh));
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
    localStorage.setItem('stickman-hook', JSON.stringify({ ...s, coins: 0, best: 12, level: 12, inv: { 'progression.xp_claimed': s.xp }, periodic: {}, boosterQueue: [],
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

  // market (ads.js Shop over data/ads.json): sections in the config order; 20 free coins once a day; IAP buttons show the
  // [ĐỀ XUẤT] USD price and grant at once (no coins taken); the rewarded 50 coins once a day, paid by a skip ticket when owned
  const mk = (id) => `#market [data-offer="${id}"] button`;
  await page.evaluate(() => window.__sh.openMenu('openMarket'));
  await page.waitForSelector(mk('offer.free_coins'), { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'market.png') });
  const m0 = await page.evaluate(() => ({ secs: [...document.querySelectorAll('#market .bm-ban')].map((e) => e.dataset.section).join(),
    t1: document.querySelector('#market [data-offer="offer.skip_tickets_1"] button')?.textContent,
    c1: document.querySelector('#market [data-offer="offer.coins_1"] button')?.textContent,
    vip: document.querySelector('#market [data-offer="offer.vip"] .bar button')?.textContent,
    vipDisc: document.querySelector('#market [data-offer="offer.vip"] .disc') ? 1 : 0,
    rew: document.querySelector('#market [data-offer="offer.rewarded_coins"] button')?.dataset.icon }));
  check('market sections in config order (special offers, boosters, black market, coins, skip tickets); IAP prices 1.99$ / 0.99$, VIP 49.97$ struck -> 19.99$ (+150 %)',
    m0.secs === 'special_offers,booster,black_market,currency.skin_coins,currency.skip_tickets' && m0.t1 === '1.99$' && m0.c1 === '0.99$'
    && m0.vip === '49.97$19.99$' && m0.vipDisc === 1 && m0.rew === 'ticket', JSON.stringify(m0));
  await page.click(mk('offer.free_coins'));
  await page.waitForFunction(() => document.querySelector('#market [data-offer="offer.free_coins"] button.na'), null, { timeout: 10000 }).catch(() => {});
  const c1 = await page.evaluate(() => window.__sh.save.coins);
  const again = await page.evaluate((b) => document.querySelector(b).disabled, mk('offer.free_coins'));
  await page.evaluate((b) => document.querySelector(b).click(), mk('offer.free_coins'));
  const c2 = await page.evaluate(() => window.__sh.save.coins);
  check('daily free coins: +20 once, then "available in" the same day', c1 === 20 && c2 === 20 && again, `${c1} ${c2} disabled ${again}`);
  await page.evaluate(() => { window.__sh.save.periodic['daily.free_coins'] = 20000101; window.__sh.save.coins = 1000; });
  await page.click('#market .x');
  await page.evaluate(() => window.__sh.openMenu('openMarket'));
  await page.waitForSelector(mk('offer.free_coins'), { timeout: 15000 });
  const nextDay = await page.evaluate((b) => !document.querySelector(b).disabled, mk('offer.free_coins'));
  await page.click(mk('offer.skip_tickets_1'));
  await page.waitForTimeout(300);
  const bought = await page.evaluate(() => ({ t: window.__sh.save.inv['currency.skip_tickets'], c: window.__sh.save.coins }));
  check('free coins come back the next day; the 20-ticket IAP button grants 20 tickets at once and takes no coins (3 -> 23, 1000 coins)',
    nextDay && bought.t === 23 && bought.c === 1000, JSON.stringify(bought));
  await page.click(mk('offer.rewarded_coins'));
  await page.waitForTimeout(300);
  const rc1 = await page.evaluate(() => ({ t: window.__sh.save.inv['currency.skip_tickets'], c: window.__sh.save.coins,
    na: !!document.querySelector('#market [data-offer="offer.rewarded_coins"] button.na'), day: window.__sh.save.periodic['daily.rewarded_coins'] }));
  check('rewarded coins ("get" + ticket icon): +50 coins, the ad paid by 1 skip ticket (23 -> 22), then "available in" until tomorrow',
    rc1.c === 1050 && rc1.t === 22 && rc1.na && rc1.day > 20260000, JSON.stringify(rc1));
  await page.screenshot({ path: path.join(SHOTS, 'market-bought.png') });
  await page.click('#market .x');

  // piggy bank: at 90 the next Normal level fills it to 100; UNLOCK is the rewarded ad, paid by a skip ticket when owned
  // (22 tickets: CanSkip, so no VIP Skip button); then +3 a level
  await page.evaluate(() => { window.__sh.save.inv['progression.piggy_bank_progress'] = 90; window.__sh.startLevel(12); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.waitForSelector('#egPiggy[data-mode="full"] .acts .gold', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'piggy-full.png') });
  const full = await page.evaluate(() => ({ p: window.__sh.save.inv['progression.piggy_bank_progress'],
    mode: document.getElementById('egPiggy')?.dataset.mode, col: document.getElementById('egPiggy')?.dataset.collection,
    icon: document.querySelector('#egPiggy .acts .gold')?.dataset.icon, vip: !!document.querySelector('#egPiggy .acts .vip') }));
  // PiggyBankPopup.Fill at 100: AnimateUnlock, then CollectionProgressBar.InitializeElements of the skin's collection
  check('piggy full: the collection bar of Stick Frog shows Aquatic Friends with 0 of 3 owned', full.col === 'aquatic_friends:0/3',
    JSON.stringify(full));
  await page.click('#egPiggy .acts .gold');
  await page.waitForTimeout(500);
  const broke = await page.evaluate(() => { const s = window.__sh.save; return { p: s.inv['progression.piggy_bank_progress'],
    claims: s.inv['progression.piggy_bank_claims'], t: s.inv['currency.skip_tickets'], frog: s.owned.skins.includes('stick_frog'),
    next: window.__sh.bonus.piggyReward(s), mode: document.getElementById('egPiggy')?.dataset.mode }; });
  check('piggy full at 100: UNLOCK (ticket icon, no VIP button with 22 tickets) breaks it into Stick Frog, the ticket pays the ad (22 -> 21)',
    full.p === 100 && full.mode === 'full' && full.icon === 'ticket' && !full.vip && broke.p === 0
    && broke.claims === 1 && broke.t === 21 && broke.frog && broke.next === 'skin.ghost' && broke.mode === 'unlocked', JSON.stringify({ full, broke }));
  await page.screenshot({ path: path.join(SHOTS, 'piggy-broken.png') });
  check('after UNLOCK the collection bar counts Stick Frog: 1 of 3', await page.evaluate(() =>
    document.getElementById('egPiggy')?.dataset.collection === 'aquatic_friends:1/3'));
  await page.evaluate(() => window.__sh.startLevel(13));
  check('next level hides the piggy popup', await page.evaluate(() => !document.querySelector('#egPiggy.on') && !window.__sh.game.paused));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.waitForSelector('#egPiggy.on', { timeout: 10000 }).catch(() => {});
  check('after the first claim a level fills the piggy by 3', await page.evaluate(() =>
    window.__sh.save.inv['progression.piggy_bank_progress'] === 3));

  // skip level: per day = trunc(card.skip_level effect) at the card level; no card = 0, so no button after a death
  const die = async () => {
    await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
    await page.evaluate(() => { window.__sh.player.y = -40; });
    await page.waitForFunction(() => window.__sh.game.died, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  await page.evaluate(() => window.__sh.startLevel(14));
  await die();
  check('no skip button without the skip card', await page.evaluate(() => !document.querySelector('#skip.on')));
  await page.evaluate(() => { window.__sh.save.inv['card.skip_level'] = 1; window.__sh.startLevel(14); });
  await die();
  const sk = await page.evaluate(() => ({ on: !!document.querySelector('#skip.on'), text: document.querySelector('#skip b')?.textContent,
    art: document.getElementById('skip').dataset.art }));
  await page.screenshot({ path: path.join(SHOTS, 'skip.png') });
  await page.click('#skip');
  await page.waitForTimeout(300);
  const skipped = await page.evaluate(() => { const s = window.__sh.save; return { phase: window.__sh.game.phase, best: s.best,
    t: s.inv['currency.skip_tickets'], day: Object.entries(s.flags).find(([k]) => k.startsWith('flag.nb_levels_skipped_')) }; });
  check('after a death the skip button (1/1, ticket sprite: CanSkip with 21 tickets) spends a ticket and completes level 15', sk.on && sk.text === '1/1'
    && sk.art === 'skip' && skipped.phase === 'finish' && skipped.best === 15 && skipped.t === 20 && skipped.day?.[1] === 1 && /^flag\.nb_levels_skipped_\d{4}-\d\d-\d\d$/.test(skipped.day?.[0]), JSON.stringify({ sk, skipped }));
  await page.evaluate(() => window.__sh.startLevel(15));
  await die();
  check('the daily skip limit holds: no skip button on the next death', await page.evaluate(() => !document.querySelector('#skip.on')
    && window.__sh.save.inv['currency.skip_tickets'] === 20));
  // AdsService.CanSkip is tickets > 1: with exactly 1 ticket the skip button keeps the rewarded-ad sprite (SkipButton0001),
  // yet SafelyDisplayAd pays the ad with that ticket (>= 1)
  await page.evaluate(() => { const s = window.__sh.save; for (const f of Object.keys(s.flags)) if (f.startsWith('flag.nb_levels_skipped_')) delete s.flags[f];
    s.inv['currency.skip_tickets'] = 1; window.__sh.startLevel(15); });
  await die();
  const sk1 = await page.evaluate(() => ({ on: !!document.querySelector('#skip.on'), art: document.getElementById('skip').dataset.art,
    bg: document.getElementById('skip').style.backgroundImage }));
  await page.screenshot({ path: path.join(SHOTS, 'ads-skip-ad.png') });
  await page.click('#skip');
  await page.waitForTimeout(300);
  const sk1b = await page.evaluate(() => ({ phase: window.__sh.game.phase, t: window.__sh.save.inv['currency.skip_tickets'] }));
  check('1 ticket: the skip button shows the ad sprite (skip-ad.webp) and its click still spends the ticket (1 -> 0) and skips',
    sk1.on && sk1.art === 'skip-ad' && /skip-ad\.webp/.test(sk1.bg) && sk1b.phase === 'finish' && sk1b.t === 0, JSON.stringify({ sk1, sk1b }));
  // 0 tickets: the piggy UNLOCK shows AdIcon next to the VIP Skip button; the click grants the skin at once, nothing paid
  await page.evaluate(() => { window.__sh.save.inv['progression.piggy_bank_progress'] = 99; window.__sh.startLevel(16); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.waitForSelector('#egPiggy[data-mode="full"] .acts .vip', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, 'ads-piggy-full.png') });
  const pz = await page.evaluate(() => ({ icon: document.querySelector('#egPiggy .acts .gold')?.dataset.icon, vip: document.querySelector('#egPiggy .acts .vip')?.dataset.offer,
    res: document.getElementById('egPiggy').dataset.res }));
  await page.click('#egPiggy .acts .gold');
  await page.waitForTimeout(400);
  const pz2 = await page.evaluate(() => ({ ghost: window.__sh.save.owned.skins.includes('ghost'), t: window.__sh.save.inv['currency.skip_tickets'],
    mode: document.getElementById('egPiggy').dataset.mode }));
  check('piggy with 0 tickets: UNLOCK with AdIcon + VIP Skip (offer.vip); the ad button grants Ghost at once, 0 tickets spent',
    pz.icon === 'video' && pz.vip === 'offer.vip' && pz.res === 'skin.ghost' && pz2.ghost && pz2.t === 0 && pz2.mode === 'unlocked', JSON.stringify({ pz, pz2 }));
  await page.evaluate(() => { window.__sh.save.inv['currency.skip_tickets'] = 21; window.__sh.app.writeSave(); window.__sh.startLevel(17); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });

  // home screen entry points
  await page.click('#btnPause');
  await page.click('#btnMenu');
  await page.waitForSelector('#btnWheel', { timeout: 10000 });
  // the cards load with the home screen: the epic booster left pending by a road is delivered and opens at once
  await page.waitForSelector('#boostPop.on', { timeout: 15000 }).catch(() => {});
  check('the booster left pending opens on the home screen (epic booster popup)', await page.evaluate(() =>
    /^booster\.epic_[0-9a-f]{32}$/.test(document.getElementById('boostPop')?.dataset.inst || '') && window.__sh.save.pending.length === 0));
  for (let i = 0; i < 8 && !(await page.evaluate(() => document.getElementById('boostPop').classList.contains('done'))); i++) {
    await page.mouse.click(195, 500); await page.waitForTimeout(i ? 450 : 2300);
  }
  await page.click('#boostPop .close');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'home-bonus.png') });
  const home = await page.evaluate(() => ({ wheel: document.getElementById('wheelPrice').textContent,
    tickets: document.getElementById('tickets').textContent,
    offers: [...document.querySelectorAll('#homeOffers [data-offer]')].map((b) => b.dataset.offer) }));
  check('home shows the wheel counter (coins/500), ticket count and the offer widgets (VIP Bundle + welcome offer or No Ads)',
    home.wheel === `${await page.evaluate(() => window.__sh.save.coins)}/500` && home.tickets === '21' && home.offers[0] === 'offer.vip'
    && home.offers.length === 2 && /offer\.(welcome_offer|no_ads)/.test(home.offers[1]), JSON.stringify(home));
  await settle(); // boosters claimed by the XP road popup open on the home page first
  await page.click('#btnPlay');

  // ---- Cards, boosters, black market (js/cards.js, js/cardsui.js, data/cards.json, art/m-cards.webp + m-boost.webp) ----
  await page.evaluate(async () => { await window.__sh.loadCards(); });
  check('the cards rules load: 33 cards, perk max 330', await page.evaluate(() => window.__sh.cards.list.length === 33
    && window.__sh.cards.perkMax() === 330));
  // seeded pulls: UnityEngine.Random.InitState((int)XXHash64(token)), the unseeded rarity roll stubbed at 0.1
  const pulls = await page.evaluate(() => {
    const c = window.__sh.cards, s = { coins: 0, xp: 0, owned: { skins: [], ropes: [], trails: [] }, claimed: {}, flags: {}, inv: {}, pending: [], collections: [] };
    const fmt = (b) => b.items.map((i) => (i.card ? `${i.card}:${i.qty}${i.isNew ? 'N' : ''}` : `coins:${i.coins}`)).join(' ');
    const w = c.content(s, 'booster.welcome_booster_0123456789abcdef0123456789abcdef', () => 0.1);
    const out = { welcome: fmt(w) };
    c.consume(s, w);
    out.perk = s.inv['progression.cards_perk_level'];
    out.epic = fmt(c.content(s, 'booster.epic_0123456789abcdef0123456789abcdef', () => 0.1));
    out.single = fmt(c.content(s, 'booster.common_single_card_00000000000000000000000000000001', () => 0.1));
    return out;
  });
  check('welcome booster: its 5 guaranteed cards, each new = 1 card; perk level 4', pulls.welcome === 'card.skip_level:1N card.shop_free_coins_boost:1N '
    + 'card.pachinko_x10_multiplier:1N card.xp_boost_skin:1N card.xp_boost_skin:1N' && pulls.perk === 4, JSON.stringify(pulls));
  check('seeded epic booster pull (token 0123..cdef, rarity roll 0.1)', pulls.epic === 'card.finish_line_xp_boost_grapple:1N '
    + 'card.shop_free_coins_boost:18 card.shop_free_coins_boost:20 card.pachinko_x10_multiplier:16 card.skip_level:17', pulls.epic);
  check('seeded common single card: 14 Shop Free Coins Boost cards', pulls.single === 'card.shop_free_coins_boost:14', pulls.single);
  // card levels: n < 1 -> 0, (n - 1) / cardsPerLevel + 1, max at (max - 1) x req + 1 cards
  const lv = await page.evaluate(() => {
    const c = window.__sh.cards, s = { inv: {} };
    return [0, 1, 30, 31, 271].map((n) => c.level(s, 'card.skip_level', n)).join(',') + ' ' + c.maxCards('card.skip_level')
      + ' ' + JSON.stringify(c.progress({ inv: { 'card.skip_level': 31 } }, 'card.skip_level'));
  });
  check('card levels: 0/1/30/31/271 skip cards = levels 0,1,1,2,10; max 271; 31 cards = 0/30 toward level 3',
    lv === '0,1,1,2,10 271 {"have":0,"need":30,"max":false,"locked":false}', lv);

  // delivery: the booster left pending by a road opens in its popup once the cards load with the home screen
  await page.evaluate(() => { const s = window.__sh.save; s.boosterQueue = []; s.pending = [['booster.welcome_booster', 1]];
    for (const k of Object.keys(s.inv)) if (k.startsWith('card.') || k.startsWith('consumption_')) delete s.inv[k];
    window.__sh.meta.deliverPending(s); window.__sh.overlay('start', true); });
  await page.waitForSelector('#boostPop.on', { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'cards-booster-pack.png') });
  check('a pending booster is delivered: the opening popup shows the welcome pack', await page.evaluate(() =>
    /^booster\.welcome_booster_[0-9a-f]{32}$/.test(document.getElementById('boostPop').dataset.inst) && window.__sh.save.pending.length === 0));
  await page.mouse.click(195, 500);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: path.join(SHOTS, 'cards-booster-card.png') });
  for (let i = 0; i < 5; i++) { await page.mouse.click(195, 500); await page.waitForTimeout(450); }
  await page.waitForSelector('#boostPop.done', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'cards-booster-recap.png') });
  const opened = await page.evaluate(() => ({ shown: document.querySelectorAll('#boostPop .bc').length,
    inv: ['card.skip_level', 'card.shop_free_coins_boost', 'card.pachinko_x10_multiplier', 'card.xp_boost_skin'].map((k) => window.__sh.save.inv[k]).join(),
    perk: window.__sh.save.inv['progression.cards_perk_level'], q: window.__sh.save.boosterQueue.length }));
  check('opening grants what it shows: 5 cards, skip 1 / free coins 1 / x10 1 / skin XP 2, perk 4', opened.shown === 5
    && opened.inv === '1,1,1,2' && opened.perk === 4 && opened.q === 0, JSON.stringify(opened));
  await page.click('#boostPop .close');
  await page.waitForTimeout(400);

  // the cards tab of the home menu bar opens the cards page
  await page.click('#btnCards');
  await page.waitForSelector('#cards.on .ccard', { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'cards-page.png') });
  const cpg = await page.evaluate(() => ({ cards: document.querySelectorAll('#cards .ccard').length, cats: document.querySelectorAll('#cards .cat').length,
    locked: document.querySelectorAll('#cards .ccard.locked').length, perk: document.querySelector('#cards .pl').textContent }));
  check('cards page: 7 categories, 33 cards, 29 locked, perk 4/330', cpg.cards === 33 && cpg.cats === 7 && cpg.locked === 29 && cpg.perk === '4/330',
    JSON.stringify(cpg));
  const cardFiles = requested.filter((u) => /cards|m-boost/.test(u)).map((u) => u.replace(/^.*\/(js|data|art)\//, '$1/').replace(/\?.*/, ''));
  check('cards load lazily: cards.js, cards.json, cardsui.js, m-cards / m-boost art', ['js/cards.js', 'data/cards.json', 'js/cardsui.js',
    'art/m-cards.webp', 'art/m-boost.webp'].every((f) => cardFiles.includes(f)), cardFiles.join(' '));
  await page.evaluate(() => window.__sh.overlay('cards', false));

  // effect: skip_level daily count = trunc(effect) at the card level: 31 cards = level 2 = 2 skips a day
  await page.evaluate(() => { const s = window.__sh.save; s.inv['card.skip_level'] = 31; s.inv['currency.skip_tickets'] = 5;
    for (const f of Object.keys(s.flags)) if (f.startsWith('flag.nb_levels_skipped_')) delete s.flags[f];
    window.__sh.overlay('start', false); window.__sh.startLevel(20); });
  await die();
  const sk2 = await page.evaluate(() => ({ on: !!document.querySelector('#skip.on'), text: document.querySelector('#skip b')?.textContent }));
  check('skip_level level 2 (31 cards): the skip button offers 2/2', sk2.on && sk2.text === '2/2', JSON.stringify(sk2));

  // effect: second chance (normal, max level 25 %): Range(0, 100) = 0 < 25 revives with the countdown, no death counted
  await page.evaluate(() => { const s = window.__sh.save; s.inv['card.second_chance_normal'] = window.__sh.cards.maxCards('card.second_chance_normal');
    Math.__r = Math.random; Math.random = () => 0; window.__sh.startLevel(20); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await page.evaluate(() => { window.__sh.player.y = -40; });
  await page.waitForFunction(() => window.__sh.game.phase === 'revive' && document.getElementById('revive').textContent, null, { timeout: 5000 }).catch(() => {});
  const rv = await page.evaluate(() => ({ phase: window.__sh.game.phase, died: window.__sh.game.died, text: document.getElementById('revive').textContent,
    x: window.__sh.player.x, sx: window.__sh.world.spawn.x }));
  await page.screenshot({ path: path.join(SHOTS, 'cards-second-chance.png') });
  await page.evaluate(() => { Math.random = Math.__r; });
  check('second_chance_normal revives at the start with the 3-2-1 countdown, no death counted', rv.phase === 'revive' && !rv.died
    && rv.text === '3' && rv.x === rv.sx, JSON.stringify(rv));
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 }).catch(() => {});
  check('after the countdown the player plays on', await page.evaluate(() => window.__sh.game.phase === 'play'));
  await page.evaluate(() => { delete window.__sh.save.inv['card.second_chance_normal']; });

  // resource boosts: RoundHalfEven(effect / 100 x quantity), the day's cap counted in base quantity
  const bo = await page.evaluate(() => {
    const { meta, cards } = window.__sh;
    const mk = (inv) => ({ coins: 0, xp: 0, best: 0, owned: { skins: [], ropes: [], trails: [] }, claimed: {}, flags: {}, inv, pending: [], collections: [], periodic: {} });
    const a = mk({ 'card.finish_line_xp_boost_normal': 1 });
    const r = meta.levelComplete(a, 0);
    const b = mk({ 'card.daily_coins_boost_tournament': cards.maxCards('card.daily_coins_boost_tournament') });
    const t1 = cards.boost(b, 'currency.skin_coins', 'finish_level_tournament', 100), t2 = cards.boost(b, 'currency.skin_coins', 'finish_level_tournament', 100);
    const c = mk({ 'card.shop_free_coins_boost': 1 }), free = window.__sh.bonus.claimFreeCoins(c, 20261029);
    return { xp: a.xp, rxp: r.xp, t1, t2, free, coins: c.coins };
  });
  check('finish_line_xp_boost_normal level 1 (+10 %): a Normal level gives 10 + 1 XP', bo.xp === 11 && bo.rxp === 11, JSON.stringify(bo));
  check('daily_coins_boost_tournament max (x2): +2 on 100 coins, then 0 (first 100 of the day used)', bo.t1 === 2 && bo.t2 === 0, JSON.stringify(bo));
  check('shop_free_coins_boost level 1 (+10 %): free coins 20 + 2', bo.free === 22 && bo.coins === 22, JSON.stringify(bo));

  // extra_lucky_wheel max (10 %): Range(0, 1000) = 0 < 100 gives an automatic spin that costs nothing
  const ew = await page.evaluate(() => {
    const { bonus, cards } = window.__sh, s = window.__sh.save;
    s.inv['card.extra_lucky_wheel'] = cards.maxCards('card.extra_lucky_wheel');
    s.coins = 500;
    const claims = s.inv['progression.lucky_wheel_claims'];
    const r = bonus.wheelSpin(s, () => 0);
    const free = r.extra ? bonus.wheelFreeSpin(s, () => 0.99) : null;
    delete s.inv['card.extra_lucky_wheel'];
    return { extra: r.extra, coins: s.coins, claims: s.inv['progression.lucky_wheel_claims'] - claims, freePrice: free?.price?.[1],
      empty: free?.empty, got: free?.got.length, again: free?.extra };
  });
  check('extra_lucky_wheel: a paid spin rolls an extra spin; it is free and, as in the original (ClaimReward exits early), grants nothing: 500 coins once, 1 claim',
    ew.extra === true && ew.coins === 0 && ew.claims === 1 && ew.freePrice === 0 && ew.empty === true && ew.got === 0 && ew.again === false, JSON.stringify(ew));

  // adventure limit cards: purchasable cap = 20 + trunc(effect): level 1 -> 28, max -> 100
  const ad = await page.evaluate(async () => {
    const a = await import('./js/adventure.js'), { cards } = window.__sh;
    const d = { skills: null };
    const data = JSON.parse(await (await fetch('./data/mode-adventure.json')).text());
    const s1 = { inv: { 'card.rope_length_limit_boost': 1 } }, s2 = { inv: { 'card.rope_length_limit_boost': cards.maxCards('card.rope_length_limit_boost') } };
    void d;
    return [a.skillCap(data, { inv: {} }, 'rope_length', cards), a.skillCap(data, s1, 'rope_length', cards), a.skillCap(data, s2, 'rope_length', cards)].join();
  });
  check('rope_length_limit_boost raises the rope skill cap 20 -> 28 (level 1) -> 100 (max)', ad === '20,28,100', ad);

  // perk road: the card perk level reaching 10 unlocks Stick Viking (progression.cards_perk_level road)
  const perk = await page.evaluate(() => { const { cards } = window.__sh, s = window.__sh.save;
    const got = cards.addCard(s, 'card.skip_level', 271 - s.inv['card.skip_level']);
    return { perk: s.inv['progression.cards_perk_level'], viking: s.owned.skins.includes('stick_viking'), got: got.length }; });
  check('perk level 13 claims the perk road step 10: Stick Viking', perk.perk === 13 && perk.viking, JSON.stringify(perk));

  // black market: 3 customization items and 3 cards per 6 h rotation; a card offer = the XP left in its level x unit price
  await page.evaluate(() => { const s = window.__sh.save; s.coins = 20000; delete s.blackMarket; window.__sh.overlay('start', true); });
  await page.evaluate(() => window.__sh.openMenu('openMarket'));
  await page.waitForSelector('#market .ocard[data-card]', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('#market .bm-ban[data-section="black_market"]').scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'cards-market.png') });
  const bm = await page.evaluate(() => { const b = window.__sh.save.blackMarket, end = new Date(b.end);
    return { items: b.items.length, cards: b.cards.length, h: end.getHours() % 6, m: end.getMinutes(), offers: document.querySelectorAll('#market [data-group="booster"] .ocard').length,
      fromBm: b.cards.every((id) => window.__sh.save.inv[id] >= 1) }; });
  check('black market: 3 items, 3 owned cards, rotation ends on a 6 h local boundary; 3 booster offers', bm.items === 3 && bm.cards === 3
    && bm.h === 0 && bm.m === 0 && bm.offers === 3 && bm.fromBm, JSON.stringify(bm));
  const bbuy = await page.evaluate(() => {
    const s = window.__sh.save, b = s.blackMarket, id = b.cards.find((x) => x === 'card.xp_boost_skin') || b.cards[0];
    const o = b.offers[id], before = { coins: s.coins, n: s.inv[id] };
    document.querySelector(`#market .ocard[data-card="${id}"] .buy`).click();
    return { id, o, before, after: { coins: s.coins, n: s.inv[id] }, again: window.__sh.cards.buyCard(s, id).refused };
  });
  check('buying a black market card: price = unit x XP left, the card gains that many, one per rotation',
    bbuy.after.coins === bbuy.before.coins - bbuy.o.price && bbuy.after.n === bbuy.before.n + bbuy.o.qty
    && bbuy.o.price === { common: 20, epic: 50, legendary: 200 }[await page.evaluate((id) => window.__sh.cards.byId.get(id).rarity, bbuy.id)] * bbuy.o.qty
    && bbuy.again === 'sold', JSON.stringify(bbuy));
  const bi = await page.evaluate(() => { const s = window.__sh.save, res = s.blackMarket.items[0], it = window.__sh.meta.byId.get(res);
    const c0 = s.coins, r = window.__sh.cards.buyItem(s, res);
    return { res, price: r.price, paid: c0 - s.coins, owned: s.owned[it.kind].includes(it.name), table: window.__sh.cards.d.market[res][1] }; });
  check('buying a black market item: flat price, item owned', bi.owned && bi.paid === bi.table && bi.price === bi.table, JSON.stringify(bi));
  // a booster IAP (offer.boosters_1, x1 epic booster, [ĐỀ XUẤT] 1.99$): the click opens the booster popup at once, no coins
  // taken; the popup's "+1 Card" is the rewarded ad (rewarded.one_more_card) with the ticket icon while tickets are owned
  const cardSum = () => page.evaluate(() => Object.entries(window.__sh.save.inv).filter(([k]) => k.startsWith('card.')).reduce((t, [, v]) => t + v, 0));
  const bo0 = { cards: await cardSum(), coins: await page.evaluate(() => window.__sh.save.coins), t: await page.evaluate(() => window.__sh.save.inv['currency.skip_tickets']),
    price: await page.evaluate(() => document.querySelector('#market [data-offer="offer.boosters_1"] button')?.textContent) };
  await page.evaluate(() => document.querySelector('#market [data-offer="offer.boosters_1"]').scrollIntoView());
  await page.screenshot({ path: path.join(SHOTS, 'ads-market-boosters.png') });
  await page.click('#market [data-offer="offer.boosters_1"] button');
  await page.waitForSelector('#boostPop.on', { timeout: 15000 }).catch(() => {});
  const boInst = await page.evaluate(() => document.getElementById('boostPop')?.dataset.inst || '');
  for (let i = 0; i < 12 && !(await page.evaluate(() => document.getElementById('boostPop').classList.contains('done'))); i++) {
    await page.mouse.click(195, 500); await page.waitForTimeout(i ? 450 : 2300);
  }
  await page.waitForTimeout(400);
  const more = await page.evaluate(() => document.querySelector('#boostPop .more')?.dataset.icon);
  await page.screenshot({ path: path.join(SHOTS, 'ads-booster-more.png') });
  const bo1 = { cards: await cardSum(), coins: await page.evaluate(() => window.__sh.save.coins) };
  if (more) await page.click('#boostPop .more');
  await page.waitForTimeout(800);
  const bo2 = await page.evaluate(() => ({ t: window.__sh.save.inv['currency.skip_tickets'], q: (window.__sh.save.boosterQueue || []).join(), pop: document.getElementById('boostPop')?.dataset.inst || '' }));
  check('booster IAP "1.99$": the epic booster popup opens at once, 5 draws of cards are added, no coins taken',
    bo0.price === '1.99$' && /^booster\.epic_[0-9a-f]{32}$/.test(boInst) && bo1.cards > bo0.cards && bo1.coins === bo0.coins, JSON.stringify({ bo0, boInst, bo1 }));
  check('"+1 Card" is the rewarded ad with the ticket icon: the click pays 1 ticket and opens one more card', more === 'ticket'
    && bo2.t === bo0.t - 1 && /one_more_card_booster\.epic/.test(bo2.q + ' ' + bo2.pop), JSON.stringify({ more, bo2 }));
  await settle();
  if (await page.evaluate(() => !!document.querySelector('#market.on'))) await page.click('#market .x');

  // pachinko cards: x10_multiplier (max 50 %: 5 rolls) and extra_stickman (max 100 %) on board 4, seed 3
  await page.evaluate(() => { const s = window.__sh.save, c = window.__sh.cards;
    s.inv['card.pachinko_x10_multiplier'] = c.maxCards('card.pachinko_x10_multiplier');
    s.inv['card.pachinko_extra_stickman'] = c.maxCards('card.pachinko_extra_stickman');
    s.inv['card.pachinko_bumper_resistance'] = c.maxCards('card.pachinko_bumper_resistance'); window.__sh.app.writeSave(); });
  await page.goto(url.replace(/\?.*$/, '') + '?mode=pachinko&ptype=4&pseed=3');
  await page.waitForFunction(() => window.__pachinko && window.__pachinko.world, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'cards-pachinko.png') });
  const pk = await page.evaluate(() => {
    const p = window.__pachinko, w = p.world, bonus = w.pegs.filter((x) => x.bonus), extra = w.pegs.filter((x) => x.extra);
    const out = { bonus: bonus.length, coins: bonus.map((x) => x.coins).join(), extra: extra.length };
    // extra stickman peg: a clone at the peg, 10 m/s at 45..135 degrees
    p.hitPeg(extra[0], { nx: 0, ny: 1 });
    const ex = p.extras[0]?.pl;
    out.clone = ex ? Math.round(Math.hypot(ex.vx, ex.vy) * 100) / 100 : null;
    out.up = ex ? ex.vy > 0 : null;
    out.gone = extra[0].gone;
    // bumper resistance: value() < 0.5 keeps the peg, else it starts to disappear
    const pegs = w.pegs.filter((x) => !x.bonus && !x.extra && !x.gone);
    p.rnd = () => 0.1; p.hitPeg(pegs[0], { nx: 0, ny: 1 });
    p.rnd = () => 0.9; p.hitPeg(pegs[1], { nx: 0, ny: 1 });
    out.resist = [pegs[0].dying, pegs[1].dying].join();
    return out;
  });
  check('pachinko x10 card (50 %, 5 rolls, seed 3): 4 x10 pegs worth 10 coins', pk.bonus === 4 && pk.coins === '10,10,10,10', JSON.stringify(pk));
  check('pachinko extra stickman card (100 %): one extra peg; hitting it spawns a clone at 10 m/s upward, the peg goes',
    pk.extra === 1 && pk.clone === 10 && pk.up && pk.gone, JSON.stringify(pk));
  check('pachinko bumper resistance (50 %): a roll of 0.1 keeps the peg, 0.9 starts its disappearing', pk.resist === '-1,0', JSON.stringify(pk));
  await page.evaluate(() => { const s = window.__sh.save;
    for (const k of Object.keys(s.inv)) if (k.startsWith('card.') || k.startsWith('consumption_')) delete s.inv[k];
    delete s.inv['progression.cards_perk_level']; s.boosterQueue = []; delete s.blackMarket; window.__pachinko.close(); window.__sh.app.writeSave(); });

  // ---- Race (js/race.js). A clean tournament state, 1 skip ticket, no coins. Math.random = 0 while a race is set up:
  // map index = achieved level (0: RaceTest), player slot Random.Range(0, 5) = 0, difficulty 0 (no wins), and per slot
  // the first save of the map's file; RaceTest has no difficulty-0 save for slot 1, so that slot stays empty.
  await page.evaluate(() => {
    const s = window.__sh.save;
    s.modes['mode.tournament'] = { unlocked: true, levels: 1 }; // clean progress, the mode stays claimed
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
  // TournamentEndGamePage: "Claim +28" = skinCoinsMultiplier 4 x the 7 coins earned; the 1 skip ticket pays the ad
  const cb = await page.evaluate(() => { const b = document.querySelector('#raceEnd [data-act="claim"]');
    return { text: b?.textContent.trim(), icon: b?.dataset.icon }; });
  await page.screenshot({ path: path.join(SHOTS, 'ads-race-claim4.png') });
  await page.click('#raceEnd [data-act="claim"]');
  await page.waitForTimeout(300);
  const ca = await page.evaluate(() => ({ coins: window.__sh.save.coins, t: window.__sh.save.inv['currency.skip_tickets'],
    again: !!document.querySelector('#raceEnd [data-act="claim"]'), text: document.querySelector('#raceEnd')?.innerText.replace(/\s+/g, ' ') }));
  check('race end: rewarded "Claim +28" (4 x 7 coins) with the ticket icon; the click adds 28 coins (7 -> 35), the ticket pays the ad (1 -> 0), once',
    cb.text === 'Claim +28' && cb.icon === 'ticket' && ca.coins === 35 && ca.t === 0 && !ca.again && /\+35 xu/.test(ca.text), JSON.stringify({ cb, ca }));
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
  check('4 ghosts home first = forced finish, 5th: +1 coin, +1 trophy', f2.done?.forced && f2.done.rank === 4 && f2.coins === 36
    && f2.trophies === 6 && /Hạng 5\/5/.test(f2.text), JSON.stringify({ ...f2, text: f2.text?.slice(0, 80) }));
  // free races are used up: the next race is the rewarded ad (rewarded.play_ticket_mode_tournament, no daily cap): with no
  // skip ticket it is granted at once, AddRewardedTicket + PlayForRewarded play it
  const rewFlag = () => page.evaluate(() => Object.entries(window.__sh.save.flags).find(([k]) => k.startsWith('daily_flag_mode.tournament_rewarded_'))?.[1] || 0);
  const rf0 = await rewFlag();
  await raceStarts('#raceEnd [data-act="again"]');
  const t3 = await page.evaluate(() => ({ race: !!window.__sh.race && window.__sh.game.phase !== 'finish',
    tickets: window.__sh.save.inv['currency.skip_tickets'], modeTickets: window.__sh.save.inv['rewarded_tickets_mode.tournament'] || 0 }));
  const rf1 = await rewFlag();
  await page.evaluate(() => window.__sh.openMode('mode.tournament'));
  await page.waitForSelector('#race.on .go', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'ads-race-page.png') });
  const t4 = await page.evaluate(() => { const g = document.querySelector('#race .go'), v = document.querySelector('#race .bot .vip');
    return { rew: g.classList.contains('rew'), icon: g.dataset.icon, plus: g.querySelector('b')?.textContent, vip: v?.dataset.offer, skip: v?.textContent }; });
  await raceStarts('#race .go');
  const rf2 = await rewFlag();
  const t5 = await page.evaluate(() => ({ race: !!window.__sh.race && window.__sh.game.phase !== 'finish', tickets: window.__sh.save.inv['currency.skip_tickets'] }));
  check('after 2 free races the rewarded ad plays a race with 0 tickets: rewarded plays 0 -> 1, the +1 race ticket is played at once (0 left)',
    t3.race && t3.tickets === 0 && t3.modeTickets === 0 && rf0 === 0 && rf1 === 1, JSON.stringify({ t3, rf0, rf1 }));
  check('Race page: RewardedPlayButton AdIcon "+1" Ticket and the VIP "Skip" button (offer.vip); a click plays (rewarded plays 2), no cap',
    t4.rew && t4.icon === 'video' && t4.plus === '+1' && t4.vip === 'offer.vip' && /Skip/.test(t4.skip) && rf2 === 2 && t5.race && t5.tickets === 0,
    JSON.stringify({ t4, rf2, t5 }));
  await page.evaluate(() => window.__sh.openMode('mode.tournament'));
  await page.waitForSelector('#race.on .go', { timeout: 10000 });
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
  // a board two days old with 100 trophies: FinishedTournamentPopup on open, rank 1: "Claim" (1000 coins) or the rewarded
  // "Claim x1200" (coins x 1.2); either also gives the first unowned pool skin (Dolphin, played 0) and one daily win; today's
  // board starts with the trophies wiped
  await page.click('#race .x');
  await page.evaluate(() => {
    const s = window.__sh.save;
    s.modes['mode.tournament'].board = { start: 1793120400000 - 2 * 86400000 };
    s.inv['leaderboard.tournament_best_score'] = 100; s.coins = 0;
  });
  await page.evaluate(() => window.__sh.openMode('mode.tournament'));
  await page.waitForSelector('#race.on .msg.claim .cl.rew', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'race-claim.png') });
  const cl0 = await page.evaluate(() => ({ coins: window.__sh.save.coins, reg: document.querySelector('#race .cl.reg')?.textContent,
    rew: document.querySelector('#race .cl.rew')?.textContent.trim(), pending: !!window.__sh.save.modes['mode.tournament'].claim }));
  await page.click('#race .cl.rew');
  await page.waitForSelector('#race.on .msg:not(.claim)', { timeout: 10000 }).catch(() => {});
  const cl = await page.evaluate(() => { const s = window.__sh.save; return { coins: s.coins, dolphin: s.owned.skins.includes('dolphin'),
    win: s.inv['leaderboard.tournament_win'], played: s.inv['leaderboard.tournament_played'], trophies: s.inv['progression.race_trophies'] || 0,
    start: s.modes['mode.tournament'].board.start, claim: !!s.modes['mode.tournament'].claim, t: s.inv['currency.skip_tickets'],
    msg: document.querySelector('#race .msg')?.textContent.replace(/\s+/g, ' ') }; });
  const midnight = await page.evaluate(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); });
  check('a finished board waits for its claim: "Claim" and the rewarded "Claim x1200" (rank 1, 1000 x 1.2), nothing paid yet',
    cl0.coins === 0 && cl0.reg === 'Claim' && cl0.rew === 'Claim x1200' && cl0.pending, JSON.stringify(cl0));
  check('the rewarded claim (0 tickets: granted at once) pays 1200 coins + Dolphin, 1 win, 1 played; the new board has 0 trophies',
    cl.coins === 1200 && cl.dolphin && cl.win === 1 && cl.played === 1 && cl.trophies === 0 && cl.start === midnight && !cl.claim && cl.t === 0
    && /hạng 1/.test(cl.msg) && /\+1200 xu/.test(cl.msg), JSON.stringify(cl));
  await page.click('#race .x');

  // ---- Adventure: the endless run against the firewall (js/adventure.js + js/advrun.js, README "Phiêu lưu") ----
  await page.evaluate(() => {
    const s = window.__sh.save;
    s.modes['mode.adventure'] = { unlocked: true, levels: 1 }; delete s.claimed['progression.adventure_best_score'];
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
    btn: document.querySelector('#adv .lvup')?.firstChild.textContent, disabled: document.querySelector('#adv .lvup')?.disabled,
    perSkill: document.querySelectorAll('#adv .sk button').length }));
  check('the Adventure row opens its page: 6 skills at level 0/20 in Vietnamese, the road from 1 m, the weekly top 10 + my row',
    ap.skills.length === 6 && ap.skills[0] === 'Độ nảy · cấp 0/20' && ap.skills[3] === 'Độ dài dây · cấp 0/20' && ap.road === '1 m'
    && ap.rows === 11 && ap.me && ap.btn === '100 xu PL' && ap.disabled && ap.perSkill === 0, JSON.stringify(ap));
  check('the Adventure code, patterns and art load only when the mode opens', ['js/adventure.js', 'js/advrun.js', 'data/mode-adventure.json',
    'art/adventure.webp'].every((f) => requested.slice(advFirst).some((u) => u.includes(f))));
  // a run on a fixed seed: the same seed gives the same patterns, zones, portals and target types; another seed differs
  const layout = () => page.evaluate(() => window.__sh.adv.run.spawned.map((s) => [s.name, s.zone && [s.zone.type, +s.zone.x.toFixed(3)],
    s.portal && [+s.portal.x.toFixed(2), +s.portal.y.toFixed(2)], s.targets.map((t) => t.type).join(''), s.bumpers.map((b) => b.type).join('')]));
  const startAdv = (seed) => page.evaluate(async (seed) => { const m = await import('./js/adventure.js'); await m.startRun(null, { seed, relaunch: true }); }, seed);
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
  // Target._targetsCount / BumperAdventure._bumpersCount are static: zero only at app launch, so a second run of the same
  // session seeds its targets and bumpers from where the first stopped
  const cnt = await page.evaluate(async () => { const m = await import('./js/adventure.js');
    await m.startRun(null, { seed: 1792810, relaunch: true });
    const c1 = { ...window.__sh.adv.run.counts };
    await m.startRun(null, { seed: 1792810 });
    const r = window.__sh.adv.run;
    return { c1, c2: { ...r.counts }, shared: r.counts === m.COUNTS }; });
  check('adventure counters run on across runs of one session (0 only at launch): 2nd run of seed 1792810 ends at twice the 1st',
    cnt.shared && cnt.c1.target > 0 && cnt.c2.target === 2 * cnt.c1.target && cnt.c2.bumper === 2 * cnt.c1.bumper, JSON.stringify(cnt));
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
    await m.startRun(null, { seed, relaunch: true });
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
    !!tp.to && tp.ok.some((q) => q[0] === tp.to[0] && q[1] === tp.to[1]) && tp.alpha === 0.3 && tp2.alpha === 1
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
      boosters: (s.boosterQueue?.length || 0) + (s.pending?.length || 0), disk: [disk.inv['currency.adventure_tokens'], disk.inv['leaderboard.adventure_best_score'],
        disk.claimed['progression.adventure_best_score']] }; });
  check('the firewall kills: "Tường lửa bắt kịp bạn" at 123 m, the road paid as one line', fe.why === 'fire' && fe.d === 123 && /123 m/.test(fe.text)
    && /Tường lửa bắt kịp bạn/.test(fe.text) && /\+123 xu phiêu lưu · Đường kỷ lục: \+800 xu phiêu lưu, Common Card/.test(fe.text), JSON.stringify({ ...fe, text: fe.text?.slice(0, 120) }));
  check('123 m = +123 tokens + road steps 1..100 (800 tokens), best 123, all written to localStorage', fe.tok === 923 && fe.best === 123
    && fe.road === 100 && JSON.stringify(fe.disk) === '[923,123,100]', JSON.stringify(fe.disk));
  // the skill shop: 100 tokens a level (100 + 10 per 10 levels in total), rope 3 -> 4.455 m
  await page.click('#advEnd [data-act="page"]');
  await page.waitForSelector('#adv.on .sk', { timeout: 10000 });
  // one level-up button for a random upgradable skill: Random.Range(0, 6) = 3 (rope_length) with Math.random 0.51
  await page.evaluate(() => { window.__mr = Math.random; Math.random = () => 0.51; });
  await page.click('#adv .lvup');
  await page.evaluate(() => { Math.random = window.__mr; });
  await page.waitForTimeout(200);
  const buy = await page.evaluate(async () => { const s = window.__sh.save, m = await import('./js/adventure.js');
    await m.startRun(null, { seed: 1792800, relaunch: true });
    const rope = window.__sh.adv.run.rope;
    return { lv: s.inv['progression_adventure_skill_level.rope_length'], tok: s.inv['currency.adventure_tokens'], rope }; });
  check('buying a skill level: rope length level 1 for 100 tokens, the next run\'s rope is 4.455 m', buy.lv === 1 && buy.tok === 823
    && Math.abs(buy.rope - 4.4553) < 1e-3, JSON.stringify(buy));
  // LevelUpRandomSkill [asm 0x126a3f4] on bare saves, and the HoldButton repeat intervals
  const lur = await page.evaluate(async () => {
    const m = await import('./js/adventure.js'), data = await (await fetch('./data/mode-adventure.json')).json();
    const sv = (tok, lv = {}) => ({ inv: { 'currency.adventure_tokens': tok, ...Object.fromEntries(Object.entries(lv).map(([k, v]) => ['progression_adventure_skill_level.' + k, v])) } });
    const a = sv(250), ra = m.levelUpRandom(data, a, () => 0.51);
    const capped = { bounce_difficulty: 20, wind_difficulty: 20, hook_difficulty: 20, teleporter_spawn_chance: 20 };
    const b = sv(500, capped), rb = m.levelUpRandom(data, b, () => 0.99);
    const c = sv(99), rc = m.levelUpRandom(data, c, () => 0);
    const all = { ...capped, rope_length: 20, firewall_difficulty: 20 };
    const d = sv(500, all), rd = m.levelUpRandom(data, d, () => 0);
    return { ra: [ra.id, ra.cost, a.inv['currency.adventure_tokens']], rb: [rb.id, rb.cost, b.inv['currency.adventure_tokens']],
      rc: [rc.refused, c.inv['currency.adventure_tokens']], rd: [rd.refused, rd.cost, d.inv['currency.adventure_tokens']],
      hold: [0, 1, 2, 3, 4, 5, 9].map((k) => +m.holdInterval(k).toFixed(3)) };
  });
  check('random skill level-up: 6 open -> #3 rope_length for 100 (250 -> 150); 2 open -> last = firewall_difficulty for 180 (80 levels; 500 -> 320)',
    JSON.stringify(lur.ra) === '["rope_length",100,150]' && JSON.stringify(lur.rb) === '["firewall_difficulty",180,320]', JSON.stringify(lur));
  check('random skill level-up refuses with 99 tokens (cost 100) and with every skill at its cap 20 (cost 220), spending nothing',
    JSON.stringify(lur.rc) === '["tokens",99]' && JSON.stringify(lur.rd) === '["cap",220,500]', JSON.stringify(lur));
  check('hold-to-repeat: intervals 0.6, 0.58, 0.52, 0.42, 0.28, then 0.1 s (lerp 0.6 -> 0.1 over 5 clicks, eased t^2)',
    JSON.stringify(lur.hold) === '[0.6,0.58,0.52,0.42,0.28,0.1,0.1]', JSON.stringify(lur.hold));
  await page.evaluate(() => { window.__sh.adv.paused = true; });
  await page.click('#advPlay .btn');
  await page.waitForSelector('#advEnd.on [data-act="page"]', { timeout: 5000 });
  await page.click('#advEnd [data-act="page"]');
  await page.waitForSelector('#adv.on .sk', { timeout: 10000 });
  await page.screenshot({ path: path.join(SHOTS, 'adv-skills.png') });
  await page.click('#adv .x');

  // ---- VIP Bundle (offer.vip, [ĐỀ XUẤT] 19.99$): the home widget buys it at once. VIP grants flag.vip + flag.no_ads,
  // 3000 coins, 60 skip tickets, 9 skins, 3 ropes, 3 trails and 3 legendary boosters; VipOfferWidget / NoAdsButton hide
  // with flag.vip, the welcome / No Ads widgets with flag.no_ads; the 60 tickets then pay every rewarded ad.
  await page.evaluate(() => { const s = window.__sh.save; s.coins = 0; s.inv['currency.skip_tickets'] = 0; window.__sh.app.writeSave(); window.__sh.overlay('start', true); });
  await settle();
  await page.waitForSelector('#homeOffers [data-offer="offer.vip"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'ads-home-widgets.png') });
  const v0 = await page.evaluate(() => [...document.querySelectorAll('#homeOffers [data-offer]')].map((b) => b.dataset.offer));
  await page.click('#homeOffers [data-offer="offer.vip"]');
  await page.waitForTimeout(500);
  const v1 = await page.evaluate(() => { const s = window.__sh.save; return { vip: s.flags['flag.vip'], noAds: s.flags['flag.no_ads'], coins: s.coins,
    t: s.inv['currency.skip_tickets'], skins: ['vampire', 'shark', 'pigeot', 'gold_stick', 'gold_unicorn', 'gold_dragon'].every((n) => s.owned.skins.includes(n)),
    ropes: ['gold_chain', 'gold_diamond', 'gold_plant'].every((n) => s.owned.ropes.includes(n)),
    trails: ['golden', 'gold_poop', 'gold_smoke'].every((n) => s.owned.trails.includes(n)),
    legendary: (s.boosterQueue || []).filter((b) => b.startsWith('booster.legendary_')).length + (document.getElementById('boostPop')?.dataset.inst?.startsWith('booster.legendary_') ? 1 : 0),
    widgets: document.querySelectorAll('#homeOffers [data-offer]').length, vipOffer: !!window.__sh.bonus.shop.vipOffer(s) }; });
  check('home widgets before VIP: VIP Bundle + welcome/No Ads; the VIP click grants flag.vip, flag.no_ads, 3000 coins, 60 tickets, the gold skins/ropes/trails, 3 legendary boosters',
    v0[0] === 'offer.vip' && v0.length === 2 && v1.vip === 1 && v1.noAds === 1 && v1.coins === 3000 && v1.t === 60 && v1.skins && v1.ropes && v1.trails
    && v1.legendary === 3, JSON.stringify({ v0, v1 }));
  await settle();
  const v2 = await page.evaluate(() => ({ widgets: document.querySelectorAll('#homeOffers [data-offer]').length, vipOffer: !!window.__sh.bonus.shop.vipOffer(window.__sh.save),
    saved: JSON.parse(localStorage.getItem('stickman-hook')).flags['flag.vip'] }));
  check('after VIP: every home offer widget is gone (no VIP offer left), flag.vip saved in localStorage', v2.widgets === 0 && !v2.vipOffer && v2.saved === 1, JSON.stringify(v2));
  // the VIP benefit in play: a full piggy shows no VIP Skip button and UNLOCK pays its ad with one of the 60 tickets
  await page.evaluate(async () => { await window.__sh.openMode('mode.normal'); window.__sh.save.inv['progression.piggy_bank_progress'] = 99; window.__sh.startLevel(window.__sh.save.best); });
  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await finishNow();
  await page.waitForSelector('#egPiggy[data-mode="full"] .acts .gold', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, 'ads-piggy-vip.png') });
  const v3 = await page.evaluate(() => ({ icon: document.querySelector('#egPiggy .acts .gold')?.dataset.icon, vip: !!document.querySelector('#egPiggy .acts .vip'),
    res: document.getElementById('egPiggy').dataset.res }));
  await page.click('#egPiggy .acts .gold');
  await page.waitForTimeout(400);
  const v4 = await page.evaluate((res) => ({ t: window.__sh.save.inv['currency.skip_tickets'], owned: window.__sh.meta.ownsRes(window.__sh.save, res) }), v3.res);
  check('with VIP: the full piggy has no VIP Skip button, UNLOCK shows the ticket icon and takes 1 of the 60 tickets (60 -> 59)',
    v3.icon === 'ticket' && !v3.vip && v4.t === 59 && v4.owned, JSON.stringify({ v3, v4 }));

  {
  // ---- First run (FTUE), portrait frame, SettingsPopup, Delete Account (D:/stickman-hook-ref/FTUE.md). Fresh browser
  // contexts, so an empty localStorage; real clicks and holds.
  const fresh = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(url);
    await p.waitForFunction(() => window.__sh && document.querySelector('#start.ready.on'), null, { timeout: 30000 });
    return { ctx, p };
  };
  const ftueState = (p) => p.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const st = document.getElementById('start'), b = document.body.getBoundingClientRect();
    return { ftue: st.classList.contains('ftue'), overlay: vis(document.getElementById('hmTut')), hand: vis(document.querySelector('.tutHand > i')),
      bar: vis(document.querySelector('#start .mbar')), wheel: vis(document.getElementById('btnWheel')), lucky: vis(document.getElementById('btnLucky')),
      frame: [b.left, b.top, b.width, b.height], cv: [document.getElementById('cv').width, document.getElementById('cv').height],
      best: window.__sh.save.best, on: [...document.querySelectorAll('.overlay.on')].map((e) => e.id) };
  });
  const D = await fresh(1920, 1080), p2 = D.p;
  await p2.waitForSelector('.tutHand > i', { timeout: 10000 }).catch(() => {});
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: path.join(SHOTS, 'ftue-1920.png') });
  const f0 = await ftueState(p2);
  check('fresh save at 1920x1080: FTUE overlay and hand on, tab bar hidden, Lucky Wheel widget hidden, Lucky Drop shown',
    f0.ftue && f0.overlay && f0.hand && !f0.bar && !f0.wheel && f0.lucky && f0.best === 0, JSON.stringify(f0));
  check('1920x1080: the game is a centred portrait frame 608x1080 at x 656 (9:16)',
    f0.frame[2] === 608 && f0.frame[3] === 1080 && f0.frame[0] === 656 && Math.abs(f0.frame[2] / f0.frame[3] - 9 / 16) < 0.005, JSON.stringify(f0.frame));
  const ov = await p2.evaluate(() => {
    const o = getComputedStyle(document.getElementById('hmTut')), r = document.getElementById('btnPlay').getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { bg: o.backgroundColor, play: top?.closest('#btnPlay') ? 'play' : top?.id, bar: getComputedStyle(document.documentElement).getPropertyValue('--bar').trim() };
  });
  check('overlay is black alpha 0.667 (#000000AA) under the Play button; letterbox #0A1940 on the home page',
    ov.bg === 'rgba(0, 0, 0, 0.667)' && ov.play === 'play' && ov.bar === '#0a1940', JSON.stringify(ov));
  // Hand_animation keys: frame 13 rot -120 at (14, 14); frame 38 (touch) rot 0, scale 0.7333 at (-110, -56), CircleLight on
  const ha = await p2.evaluate(async () => { const h = await import('./js/home.js'); const r = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v]));
    return [r(h.handAt(13 / 60)), r(h.handAt(38 / 60)), r(h.handAt(51 / 60)), r(h.handAt(0.55))]; });
  check('hand keys: t 13/60 rot -120 at (14,14); t 38/60 rot 0 scale 0.733 at (-110,-56) light on alpha 1; t 51/60 light scale 1.79 alpha 0',
    ha[0].rot === -120 && ha[0].x === 14 && ha[0].y === 14 && !ha[0].light && ha[1].rot === 0 && ha[1].scale === 0.733 && ha[1].x === -110
    && ha[1].y === -56 && ha[1].light && ha[1].ca === 1 && ha[2].cs === 1.79 && ha[2].ca === 0 && ha[3].x === -110, JSON.stringify(ha));
  const tf = [];
  for (let i = 0; i < 3; i++) { tf.push(await p2.evaluate(() => document.querySelector('.tutHand').style.transform)); await p2.waitForTimeout(170); }
  check('the hand animates (its transform changes frame to frame)', new Set(tf).size === 3 && /rotate/.test(tf[0]), tf[0]);
  // clicks anywhere but Play do nothing: gear, XP bar, Tournament, Lucky Drop, the middle of the page
  for (const sel of ['#btnSettings', '#xpbar', '#btnTour', '#btnLucky', '#homeOffers']) {
    const r = await p2.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
    await p2.mouse.click(r[0], r[1]);
  }
  await p2.mouse.click(960, 500);
  await p2.waitForTimeout(700);
  const f1 = await ftueState(p2);
  check('FTUE: clicking the gear, XP bar, Tournament, Lucky Drop, the offers and the page opens nothing',
    f1.on.join() === 'start' && f1.ftue, JSON.stringify(f1.on));
  await p2.click('#btnPlay');
  await p2.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await p2.waitForTimeout(200);
  const g0 = await p2.evaluate(() => ({ idx: window.__sh.world.index, units: +(10 * document.getElementById('cv').width / document.getElementById('cv').height).toFixed(2),
    hint: !document.getElementById('hint').hidden && getComputedStyle(document.getElementById('hint')).visibility === 'visible',
    bar: getComputedStyle(document.documentElement).getPropertyValue('--bar').trim(), theme: window.__sh.theme.bg }));
  check('Play opens level 1; the camera is 10 units tall and 5.63 across; the hold hint shows (no level cleared); letterbox = theme colour / 2',
    g0.idx === 0 && g0.units === 5.63 && g0.hint && g0.bar !== '#0a1940' && g0.bar.length === 7, JSON.stringify(g0));
  await p2.screenshot({ path: path.join(SHOTS, 'game-1920.png') });
  // dying / leaving level 1 keeps the tutorial: pause -> home
  await p2.click('#btnPause');
  await p2.waitForTimeout(150);
  await p2.click('#btnMenu');
  await p2.waitForTimeout(600);
  const f2 = await ftueState(p2);
  check('back home from level 1 uncleared: the FTUE is still on, tab bar still hidden', f2.ftue && f2.overlay && !f2.bar, JSON.stringify(f2));
  await p2.click('#btnPlay');
  await p2.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  // hold in the left letterbox, outside the frame: still a hold (Input.GetMouseButtonDown is screen wide)
  await p2.mouse.move(200, 540);
  await p2.mouse.down();
  await p2.waitForTimeout(150);
  const lh = await p2.evaluate(() => ({ hooked: window.__sh.player.hooked, hint: document.getElementById('hint').style.opacity }));
  check('pressing in the letterbox (x 200 of 1920) hooks the target; the hint fades', lh.hooked === 0 && lh.hint === '0', JSON.stringify(lh));
  await p2.waitForTimeout(1100);
  await p2.mouse.up();
  await p2.waitForFunction(() => window.__sh.save.best >= 1, null, { timeout: 8000 }).catch(() => {});
  check('level 1 cleared with a letterbox hold at 1920x1080 (same physics as the phone)', await p2.evaluate(() => window.__sh.save.best === 1));
  await p2.waitForTimeout(500);
  await p2.reload();
  await p2.waitForFunction(() => window.__sh && document.querySelector('#start.ready.on'), null, { timeout: 30000 });
  await p2.waitForFunction(() => !document.querySelector('#road.on') && window.__sh.save.modes['mode.lucky_wheel']?.unlocked, null, { timeout: 10000 }).catch(() => {});
  await p2.waitForTimeout(500);
  const f3 = await ftueState(p2);
  check('after clearing level 1: no overlay, no hand, tab bar back, Lucky Wheel widget shown (its 0 XP step claimed)',
    !f3.ftue && !f3.overlay && !f3.hand && f3.bar && f3.wheel, JSON.stringify(f3));
  check('after clearing level 1 the hint stays hidden in levels', await p2.evaluate(() => document.getElementById('hint').hidden));
  await p2.screenshot({ path: path.join(SHOTS, 'home-1920.png') });
  // SettingsPopup from the gear
  await p2.evaluate(() => { const s = window.__sh.save; s.sound = false; window.__sh.app.writeSave(); });
  await p2.click('#btnSettings');
  await p2.waitForSelector('#settings.on .row[data-k="del"]', { timeout: 10000 });
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: path.join(SHOTS, 'settings-1920.png') });
  const s0 = await p2.evaluate(() => {
    const r = document.querySelector('#settings .sp').getBoundingClientRect(), u = document.body.clientHeight / 1334;
    return { rows: [...document.querySelectorAll('#settings .opts [data-k]')].map((b) => b.dataset.k), w: Math.round(r.width / u),
      uid: document.getElementById('userId').textContent, saved: JSON.parse(localStorage.getItem('stickman-hook')).uid, levels: !!document.querySelector('#levels.on') };
  });
  check('gear opens SettingsPopup (510 units wide): hub account, GDPR, Help, Delete Account, User Id + copy; no Restore / Haptic / Language; not the level list',
    s0.rows.join() === 'hub,gdpr,help,del,copy' && s0.w === 510 && /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/.test(s0.uid) && s0.saved === s0.uid && !s0.levels, JSON.stringify(s0));
  await p2.click('#settings .row[data-k="gdpr"]');
  await p2.waitForSelector('#settings .dlg', { timeout: 3000 });
  const gd = await p2.evaluate(() => document.querySelector('#settings .dlg p').textContent);
  await p2.click('#settings .dlg [data-k="ok"]');
  check('GDPR shows what the page stores, OK closes it', /localStorage/.test(gd) && await p2.evaluate(() => !document.querySelector('#settings .dlg')), gd);
  // Delete Account: Cancel changes nothing
  await p2.click('#settings .row[data-k="del"]');
  await p2.waitForSelector('#settings .dlg [data-k="no"]', { timeout: 3000 });
  await p2.screenshot({ path: path.join(SHOTS, 'settings-delete-1.png') });
  await p2.click('#settings .dlg [data-k="no"]');
  await p2.waitForTimeout(200);
  check('Delete Account -> Cancel keeps the progress', await p2.evaluate(() => !document.querySelector('#settings .dlg')
    && JSON.parse(localStorage.getItem('stickman-hook')).best === 1));
  await p2.click('#settings .row[data-k="del"]');
  await p2.click('#settings .dlg [data-k="ok"]');
  await p2.waitForSelector('#settings .dlg [data-k="ok"]:disabled', { timeout: 3000 });
  await p2.screenshot({ path: path.join(SHOTS, 'settings-delete-2.png') });
  await p2.click('#settings .dlg [data-k="ok"]', { force: true }); // disabled for 2 s: the click does nothing
  check('second confirmation: "Xoá vĩnh viễn" is disabled for 2 s, an early click deletes nothing', await p2.evaluate(() => !!document.querySelector('#settings .dlg')
    && JSON.parse(localStorage.getItem('stickman-hook')).best === 1));
  await p2.waitForSelector('#settings .dlg [data-k="ok"]:not(:disabled)', { timeout: 4000 });
  await Promise.all([p2.waitForNavigation({ timeout: 15000 }), p2.click('#settings .dlg [data-k="ok"]')]);
  await p2.waitForFunction(() => window.__sh && document.querySelector('#start.ready.on'), null, { timeout: 30000 });
  await p2.waitForSelector('.tutHand > i', { timeout: 10000 }).catch(() => {});
  await p2.waitForTimeout(500);
  const f4 = await ftueState(p2);
  const ls = await p2.evaluate(() => ({ raw: JSON.parse(localStorage.getItem('stickman-hook')), q: location.search, sound: window.__sh.save.sound }));
  check('after the delete: reloaded on the home page, progress wiped (best 0, no XP / coins / uid), sound setting kept (off)',
    ls.q === '?v=20261028n' && f4.best === 0 && !ls.raw.best && !ls.raw.xp && !ls.raw.uid && ls.raw.sound === false && ls.sound === false, JSON.stringify(ls));
  check('after the delete: the FTUE overlay and hand are back, tab bar hidden', f4.ftue && f4.overlay && f4.hand && !f4.bar, JSON.stringify(f4));
  await D.ctx.close();
  // phone 390 x 844: the frame is the whole screen
  const P = await fresh(390, 844), p3 = P.p;
  await p3.waitForSelector('.tutHand > i', { timeout: 10000 }).catch(() => {});
  await p3.waitForTimeout(600);
  await p3.screenshot({ path: path.join(SHOTS, 'ftue-390.png') });
  const f5 = await ftueState(p3);
  check('390x844: the frame fills the screen, the camera sees 4.62 units across', f5.frame.join() === '0,0,390,844'
    && Math.abs((10 * f5.cv[0]) / f5.cv[1] - 4.62) < 0.02 && f5.ftue, JSON.stringify(f5));
  await p3.click('#btnPlay');
  await p3.waitForTimeout(1200);
  await p3.screenshot({ path: path.join(SHOTS, 'game-390.png') });
  await p3.evaluate(() => { const s = window.__sh.save; s.best = 1; window.__sh.app.writeSave(); window.__sh.overlay('start', true); });
  await p3.waitForTimeout(500);
  await p3.screenshot({ path: path.join(SHOTS, 'home-390.png') });
  await p3.click('#btnSettings');
  await p3.waitForSelector('#settings.on .row[data-k="del"]', { timeout: 10000 });
  await p3.waitForTimeout(300);
  await p3.screenshot({ path: path.join(SHOTS, 'settings-390.png') });
  const s1 = await p3.evaluate(() => { const r = document.querySelector('#settings .sp').getBoundingClientRect(); return [r.left, r.right, r.top]; });
  check('390x844: the settings popup fits the width', s1[0] >= 0 && s1[1] <= 390 && s1[2] > 0, JSON.stringify(s1));
  await P.ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  srv?.close();
  console.log(`\n${pass} pass, ${fail} fail   shots: ${SHOTS}`);
  process.exit(fail ? 1 : 0);
})();
