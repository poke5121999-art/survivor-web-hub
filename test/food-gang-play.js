#!/usr/bin/env node
/* Food Gang (games/food-gang/index.html) played in a real browser. For each map (Kitchen, Dining table, Pantry) and
 * each mode (dm2v2, dm1v1, kill5 team, lastSurvivor, killBoss): the match starts, the local fighter is driven with the
 * real keyboard (move, jump, attack, special) and once with the on-screen joystick / buttons by mouse; the test asserts
 * the fighter moved, jumped, attacked and used its special, damage happened, an agent died and respawned, the timer
 * counts down (timed modes), the match ends by its own rule (sped up with fgTimeScale), the result screen shows
 * title / rank / stars / trophies and the profile in localStorage gained trophies, no console errors, fps >= 50 at
 * 1280x720 (hardware ANGLE). Screenshots: FG_SHOTS (default shots/food-gang/play), incl. 1280x592 frames for clip parity.
 *   node test/food-gang-play.js                       all maps x modes
 *   FG_ONLY=kitchen:dm2v2 node test/food-gang-play.js one run
 *   FG_URL=https://poke5121999-art.github.io/survivor-web-hub/games/food-gang/index.html node test/food-gang-play.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.FG_SHOTS || path.join(ROOT, 'shots', 'food-gang', 'play');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };
let pass = 0, fail = 0;
const fails = [];
let tagNow = '';
const check = (name, ok, detail) => {
  const n = tagNow ? `[${tagNow}] ${name}` : name;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; fails.push(n + (detail ? ` (${detail})` : '')); }
};

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

const MAPS = [['kitchen', 'BRO'], ['dining', 'TOM'], ['pantry', 'NORI']];
const MODES = ['dm2v2', 'dm1v1', 'kill5', 'lastSurvivor', 'killBoss'];
const TIMED = { dm2v2: true, dm1v1: true, killBoss: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, arg, ms, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
const dbg = (page) => page.evaluate(() => window.fgDebug && window.fgDebug());
const localOf = (d) => d && d.agents.find((a) => a.slot === d.match.localSlot);

async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await sleep(ms);
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
}

async function runOne(browser, base, map, skin, mode, opts = {}) {
  const tag = `${map}_${mode}`;
  tagNow = `${map} ${mode}`;
  console.log(`${map} ${mode} (${skin})`);
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push('request failed ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const seed = opts.seed ?? 3;
  const url = `${base}?mode=${mode}&map=${map}&skin=${skin}&level=8&seed=${seed}${opts.intro ? '' : '&intro=0'}`;
  try {
    await page.goto(url);
    const before = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('food-gang-profile') || 'null'); } catch { return null; } });
    const started = await waitFor(page, () => { const d = window.fgDebug && window.fgDebug(); return d && d.screen === 'match' && d.phase === 'match' && d.tick > 5 ? d : null; }, null, 60000);
    const why = started ? '' : JSON.stringify(await dbg(page).catch((e) => String(e))).slice(0, 300) + ' ' + errors.slice(0, 3).join(' | ');
    check('match starts', !!started, started ? `local slot ${started.match.localSlot}, ${started.agents.length} fighters` : 'no match: ' + why);
    if (!started) return;
    const trophies0 = (await dbg(page)).profile.trophies;
    let d = await dbg(page);
    const me0 = localOf(d);
    check('special button shown (level 8 unlocks the special)', d.hud.specialButton && me0.specialUnlocked);
    // keyboard: run right, then left, jump, attack, special
    const x0 = me0.x;
    await hold(page, ['KeyD'], 700);
    d = await dbg(page);
    const x1 = localOf(d).x;
    await hold(page, ['ArrowLeft'], 500);
    d = await dbg(page);
    const x2 = localOf(d).x;
    check('keyboard moves the fighter (D right, Left arrow left)', x1 > x0 + 0.5 && x2 < x1 - 0.3, `x ${x0} -> ${x1} -> ${x2}`);
    const j0 = d.stats.jumps;
    const grounded = () => waitFor(page, () => { const q = window.fgDebug(); const a = q.agents.find((x) => x.slot === q.match.localSlot); return a && a.alive && a.grounded; }, null, 5000, 30);
    // jump needs the fighter on the ground (no air jump); a hit or a ledge can leave it airborne for a moment
    for (let i = 0; i < 3; i++) {
      await grounded();
      await hold(page, ['Space'], 120);
      await sleep(300);
      d = await dbg(page);
      if (d.stats.jumps > j0) break;
    }
    check('keyboard jump', d.stats.jumps > j0, `${j0} -> ${d.stats.jumps} jumps`);
    await sleep(700);
    const a0 = d.stats.localActionStarts || 0;
    await hold(page, ['KeyJ'], 450);
    await sleep(250);
    d = await dbg(page);
    check('keyboard attack (J)', (d.stats.localActionStarts || 0) > a0, `${a0} -> ${d.stats.localActionStarts} attacks, shots ${d.stats.shots}`);
    const s0 = d.stats.localSpecialStarts || 0;
    // the special starts only when its cooldown is over and no action is running (TOM's bazooka shot is long)
    const specialReady = () => waitFor(page, () => { const q = window.fgDebug(); const a = q.agents.find((x) => x.slot === q.match.localSlot);
      return a && a.alive && a.cooldownSpecial <= 0 && a.action === 'none' && q.hud.controlsAlpha === 1; }, null, 20000, 30);
    // a heal special (TOM) is refused at full HP by the sim (ActionSystem.tryStartSpecial): wait a little for a hit
    const hurt = async () => {
      const me = localOf(await dbg(page));
      if (!me.healSpecial || me.hp < me.hpMax) return;
      await page.evaluate(() => window.fgTimeScale(2));
      await waitFor(page, () => { const q = window.fgDebug(); const a = q.agents.find((x) => x.slot === q.match.localSlot); return a && a.alive && a.hp < a.hpMax; }, null, 4000, 30);
      await page.evaluate(() => window.fgTimeScale(1));
    };
    const fullHeal = async () => { const me = localOf(await dbg(page)); return me.healSpecial && me.hp >= me.hpMax; };
    await hurt();
    for (let i = 0; i < 3; i++) {
      await specialReady();
      await hold(page, ['KeyK'], 200);
      await sleep(400);
      d = await dbg(page);
      if ((d.stats.localSpecialStarts || 0) > s0 || await fullHeal()) break;
    }
    const kRefused = (d.stats.localSpecialStarts || 0) === s0 && await fullHeal();
    check('keyboard special (K)', (d.stats.localSpecialStarts || 0) > s0 || kRefused, kRefused ? 'heal special refused at full HP (sim rule)' : `${s0} -> ${d.stats.localSpecialStarts || 0}`);
    // fps while fighting at 1280x720
    await sleep(1500);
    d = await dbg(page);
    const fps = d.fps;
    if (!opts.viewport) check('fps >= 50 at 1280x720', fps >= 50, `${fps} fps`);
    // on-screen controls by mouse: joystick drag right, jump, attack, special
    await waitFor(page, () => { const q = window.fgDebug(); const a = q.agents.find((x) => x.slot === q.match.localSlot); return a && a.alive && q.hud.controlsAlpha === 1; }, null, 10000);
    d = await dbg(page);
    const c = d.match.controls;
    const xa = localOf(d).x;
    await page.mouse.move(c.joystick[0], c.joystick[1]);
    await page.mouse.down();
    await page.mouse.move(c.joystick[0] + 110, c.joystick[1], { steps: 4 });
    await sleep(600);
    d = await dbg(page);
    let xb = localOf(d).x;
    await page.mouse.up();
    if (!(xb > xa + 0.4)) {
      // blocked on the right (plate stack, wall): drag left instead
      await sleep(200);
      await page.mouse.move(c.joystick[0], c.joystick[1]); await page.mouse.down();
      await page.mouse.move(c.joystick[0] - 110, c.joystick[1], { steps: 4 });
      await sleep(600);
      d = await dbg(page);
      xb = localOf(d).x;
      await page.mouse.up();
    }
    check('on-screen joystick moves the fighter', Math.abs(xb - xa) > 0.4 || (!localOf(d).alive), `x ${xa} -> ${xb}`);
    const jb = d.stats.jumps;
    for (let i = 0; i < 3; i++) {
      await grounded();
      await page.mouse.click(c.jump[0], c.jump[1], { delay: 80 });
      await sleep(400);
      d = await dbg(page);
      if (d.stats.jumps > jb) break;
    }
    check('on-screen jump button', d.stats.jumps > jb || !localOf(d).alive, `${jb} -> ${d.stats.jumps}`);
    await sleep(700);
    const ab = d.stats.localActionStarts || 0;
    await page.mouse.move(c.action[0], c.action[1]);
    await page.mouse.down(); await sleep(400); await page.mouse.up();
    await sleep(250);
    d = await dbg(page);
    check('on-screen attack button', (d.stats.localActionStarts || 0) > ab || !localOf(d).alive, `${ab} -> ${d.stats.localActionStarts}`);
    await page.evaluate(() => window.fgTimeScale(4));
    d = await dbg(page);
    const sb = d.stats.localSpecialStarts || 0;
    if (c.special) await hurt();
    for (let i = 0; i < 3 && c.special; i++) {
      await page.evaluate(() => window.fgTimeScale(4));
      await specialReady();
      await page.evaluate(() => window.fgTimeScale(1));
      await page.mouse.move(c.special[0], c.special[1]); await page.mouse.down(); await sleep(200); await page.mouse.up();
      await sleep(400);
      d = await dbg(page);
      if ((d.stats.localSpecialStarts || 0) > sb || await fullHeal()) break;
    }
    const bRefused = (d.stats.localSpecialStarts || 0) === sb && await fullHeal();
    check('on-screen special button', (d.stats.localSpecialStarts || 0) > sb || !localOf(d).alive || bRefused, bRefused ? 'heal special refused at full HP (sim rule)' : `${sb} -> ${d.stats.localSpecialStarts || 0}`);
    await page.screenshot({ path: path.join(SHOTS, `${tag}_hud.png`) });
    // timer counts down (timed modes) / no timer (kill race, last survivor)
    const t0 = d.timer;
    await sleep(1200);
    d = await dbg(page);
    if (TIMED[mode]) check('timer counts down', d.timer < t0 - 0.5 && /^\d+:\d\d$/.test(d.timerText), `${t0} -> ${d.timer} "${d.timerText}"`);
    else check('no match timer in this mode', d.timer === 0, `timer ${d.timer}`);
    // let the bots fight: kill feed, death + respawn, the respawn screen of the local fighter
    // autopilot through the scripted-input bridge: chase the nearest enemy, attack, jump to higher foes, special when ready
    await page.evaluate(() => {
      window.__pilot = setInterval(() => {
        const q = window.fgDebug();
        if (!q.match || q.phase !== 'match' || window.__pilotPaused) { window.fgScript(null); return; }
        const me = q.agents.find((a) => a.slot === q.match.localSlot);
        const foes = q.agents.filter((a) => a.alive && a.slot !== me.slot && (q.match.teams === 0 || a.team !== me.team));
        const f = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
        if (!f) { window.fgScript(0, 0); return; }
        let down = 2;
        if (f.y > me.y + 1.5 && me.grounded) down |= 1;
        if (me.cooldownSpecial <= 0 && Math.random() < 0.3) down |= 4;
        window.fgScript(Math.abs(f.x - me.x) > 1.2 ? Math.sign(f.x - me.x) : 0, down);
      }, 30);
    });
    await page.evaluate(() => window.fgTimeScale(3));
    const kf = await waitFor(page, () => window.fgDebug().hud.killFeedShown > 0, null, 60000);
    if (kf) await page.screenshot({ path: path.join(SHOTS, `${tag}_killfeed.png`) });
    check('kill feed shows a kill', !!kf);
    // the local fighter goes down early through the sim's debug damage (DebugDamageCommand), so every mode shows the
    // respawn screen; a boss is the exception: its death ends a killBoss match on the spot
    d = await dbg(page);
    const meNow = localOf(d);
    const localBoss = !!(meNow && meNow.boss);
    if (meNow && !localBoss && d.phase === 'match') {
      await waitFor(page, () => { const q = window.fgDebug(); const a = q.agents.find((x) => x.slot === q.match.localSlot); return a && a.alive; }, null, 15000, 30);
      // fgDamage is the app's bridge; a build deployed before it gets the same DebugDamageCommand through fgApp
      await page.evaluate((slot) => {
        if (window.fgDamage) return window.fgDamage(slot, 1e6);
        const r = window.fgApp.match && window.fgApp.match.runner, a = r && r.state.agents.find((x) => x.slot === slot);
        return a ? r.match.debugDamage(r.state, a.id, 1e6) : 0;
      }, d.match.localSlot);
    }
    // the local fighter stands still while down so it cannot end a killBoss match on its own before the screen shows
    await page.evaluate(() => { window.__pilotPaused = true; });
    const rs = localBoss ? false : await waitFor(page, () => window.fgDebug().hud.respawnShown || window.fgDebug().screen !== 'match', null, 120000, 30)
      .then(async (v) => v && (await dbg(page)).hud.respawnShown);
    await page.evaluate(() => { window.__pilotPaused = false; });
    if (rs) {
      await sleep(150);
      await page.screenshot({ path: path.join(SHOTS, `${tag}_respawn.png`) });
      d = await dbg(page);
      check('respawn screen for the dead local fighter (BACK IN: n, controls hidden)', d.hud.respawnShown && d.hud.controlsAlpha === 0, `"${d.hud.respawnText}"`);
    } else {
      d = await dbg(page);
      // no respawn screen is the rule only for a local boss, or a killBoss match that ended on the boss's death
      // while the local fighter was down (ROUND OVER comes before BACK IN)
      const bossDown = mode === 'killBoss' && d.screen !== 'match' && (d.match && d.match.agents || []).some((a) => a.boss && a.deaths > 0);
      check('respawn screen for the dead local fighter', localBoss || bossDown, localBoss ? 'local fighter is the boss: no respawn' : bossDown ? 'boss died while the local fighter was down: match over first'
        : `no respawn screen (deaths ${d.stats.localDeaths || 0}, screen ${d.screen}/${d.phase})`);
    }
    await page.evaluate(() => window.fgTimeScale(12));
    const over = await waitFor(page, () => { const q = window.fgDebug(); return q.screen === 'gameover' && q.gameOver && q.gameOver.title ? q : null; }, null, 150000, 100);
    d = over || await dbg(page);
    const m = d.match || {};
    check('damage happened', (d.stats.damageEvents || 0) > 0, `${d.stats.damageEvents} hits`);
    // killBoss can end on the boss's first death: then a death without any respawn is the rule, not a failure
    const deaths = d.events['9'] || 0, respawns = d.events['10'] || 0;
    const endsOnDeath = mode === 'killBoss' && m.agents && m.agents.some((a) => a.boss && a.deaths > 0) && !m.timeOut;
    check('an agent died and respawned', deaths > 0 && (respawns > 0 || endsOnDeath), `${deaths} deaths, ${respawns} respawns${endsOnDeath ? ', match ended on the boss death' : ''}`);
    const rule = {
      dm2v2: () => m.timeOut, dm1v1: () => m.timeOut,
      kill5: () => !m.timeOut && Math.max(...m.teamKills) >= 9,
      lastSurvivor: () => !m.timeOut && m.agents.filter((a) => a.deaths < 3).length <= 1,
      killBoss: () => m.timeOut ? m.winnerTeam === 2 : m.agents.some((a) => a.boss && a.deaths > 0),
    }[mode];
    check('match ends by its rule', !!over && rule(), over ? `winner team ${m.winnerTeam} slot ${m.winnerSlot}, timeOut ${m.timeOut}, kills ${m.teamKills}` : 'no game over');
    if (!over) return;
    await page.screenshot({ path: path.join(SHOTS, `${tag}_timeout.png`) }).catch(() => {});
    const rank = await waitFor(page, () => { const q = window.fgDebug(); return q.gameOver && q.gameOver.phase === 'rank' && q.gameOver.cells > 0 ? q : null; }, null, 15000);
    if (rank) { await sleep(900); await page.screenshot({ path: path.join(SHOTS, `${tag}_gameover_rank.png`) }); }
    d = await dbg(page);
    const g = d.gameOver;
    check('result screen: title, trophies, stars', /^(VICTORY|DEFEAT|DRAW)$/.test(g.title) && /^\+\d+$/.test(g.trophyText) && /^\+\d+$/.test(g.starText) && g.cells > 0,
      `"${g.title}" ${g.trophyText} trophies ${g.starText} stars, rank ${g.rank}, ${g.cells} podium cells`);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('food-gang-profile') || 'null'));
    const tAfter = after ? after.trophies : -1;
    check('profile in localStorage gained trophies', tAfter > trophies0 && tAfter - trophies0 === g.trophies, `${trophies0} -> ${tAfter} (+${g.trophies}), ${before ? 'existing' : 'new'} profile`);
    const rw = await waitFor(page, () => { const q = window.fgDebug(); return q.gameOver && q.gameOver.phase === 'reward' ? q : null; }, null, 15000);
    await sleep(1200);
    await page.screenshot({ path: path.join(SHOTS, `${tag}_gameover_reward.png`) });
    d = await dbg(page);
    check('reward panel with the play-again button', !!rw && !!d.gameOver.playButton, `state ${d.gameOver.animState}`);
    if (opts.playAgain && d.gameOver.playButton) {
      await page.mouse.click(d.gameOver.playButton[0], d.gameOver.playButton[1]);
      const again = await waitFor(page, () => { const q = window.fgDebug(); return q.screen === 'match' && q.matches === 1 && q.tick > 5 ? q : null; }, null, 30000);
      check('play again starts a new match', !!again);
    }
    check('no console / page errors', errors.length === 0 && d.engine.errors.length === 0, [...errors, ...d.engine.errors].slice(0, 4).join(' | '));
    check('every sprite / clip / prefab resolved', !d.engine.spritesMissing.length && !d.engine.clipsMissing.length && !d.engine.prefabsMissing.length,
      [...d.engine.spritesMissing, ...d.engine.clipsMissing, ...d.engine.prefabsMissing].slice(0, 6).join(','));
  } finally {
    await page.close();
  }
}

// frames at the clip's 2.16:1 game area (1280x592) for parity: versus, READY, mid-match HUD, kill feed, respawn, result
async function parityRun(browser, base) {
  console.log('parity frames (kitchen dm2v2, 1280x592)');
  const page = await browser.newPage({ viewport: { width: 1280, height: 592 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${base}?mode=dm2v2&map=kitchen&skin=BRO&level=8&seed=3&slot=0`);
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `parity_${n}.png`) });
    if (await waitFor(page, () => window.fgDebug && window.fgDebug().screen === 'intro', null, 30000, 50)) { await sleep(900); await shot('intro'); }
    if (await waitFor(page, () => { const d = window.fgDebug(); return d.match && d.phase === 'intro' && d.tick === 0; }, null, 30000, 50)) { await sleep(1200); await shot('versus'); }
    if (await waitFor(page, () => window.fgDebug().hud.start === 'READY?', null, 10000, 30)) { await sleep(500); await shot('ready'); }
    await waitFor(page, () => window.fgDebug().phase === 'match', null, 10000);
    await waitFor(page, () => !window.fgDebug().hud.start, null, 5000, 30);
    await page.keyboard.down('KeyD'); await sleep(500); await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyJ'); await sleep(300); await shot('hud'); await page.keyboard.up('KeyJ');
    await page.evaluate(() => window.fgTimeScale(3));
    if (await waitFor(page, () => window.fgDebug().hud.killFeedShown > 0, null, 60000, 30)) { await sleep(450); await shot('killfeed'); }
    await page.evaluate(() => { window.__pilot = setInterval(() => {
      const q = window.fgDebug(); if (!q.match || q.phase !== 'match') { window.fgScript(null); return; }
      const me = q.agents.find((a) => a.slot === q.match.localSlot);
      const f = q.agents.filter((a) => a.alive && a.team !== me.team).sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
      window.fgScript(f ? Math.sign(f.x - me.x) : 0, 2 | (f && f.y > me.y + 1.5 && me.grounded ? 1 : 0)); }, 30); });
    if (await waitFor(page, () => window.fgDebug().hud.respawnShown, null, 90000, 30)) { await sleep(400); await shot('respawn'); }
    await page.evaluate(() => window.fgTimeScale(12));
    if (await waitFor(page, () => { const q = window.fgDebug(); return q.screen === 'match' && q.phase === 'gameover'; }, null, 60000, 20)) { await sleep(600); await shot('timeout'); }
    if (await waitFor(page, () => { const g = window.fgDebug().gameOver; return g && g.phase === 'rank'; }, null, 30000, 50)) { await sleep(1500); await shot('victory_rank'); }
    if (await waitFor(page, () => { const g = window.fgDebug().gameOver; return g && g.phase === 'reward'; }, null, 20000, 50)) { await sleep(1500); await shot('victory_fridge'); }
    check('parity frames captured without errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.FG_URL ? null : await serve();
  const base = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/index.html`;
  // hardware ANGLE: swiftshader caps a 1280x720 WebGL page near 20 fps whatever the page does
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const only = process.env.FG_ONLY ? process.env.FG_ONLY.split(',').map((s) => s.split(':')) : null;
  const budget = Number(process.env.FG_TIMEOUT || 1500) * 1000;
  const killer = setTimeout(() => { console.log(`  FAIL timeout (${budget / 1000} s)`); process.exit(2); }, budget);
  try {
    let first = true;
    for (const [map, skin] of MAPS) {
      for (const mode of MODES) {
        if (process.env.FG_PARITY_ONLY || (only && !only.some(([m, md]) => m === map && (!md || md === mode)))) continue;
        await runOne(browser, base, map, skin, mode, { playAgain: first, intro: first });
        first = false;
      }
    }
    tagNow = 'parity';
    if (!process.env.FG_NO_PARITY && !only) await parityRun(browser, base);
  } finally {
    clearTimeout(killer);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failed:\n  ' + fails.join('\n  '));
  process.exit(fail ? 1 : 0);
})();
