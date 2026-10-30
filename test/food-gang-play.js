#!/usr/bin/env node
/* Food Gang (games/food-gang/index.html) played in a real browser. For each map (Kitchen, Dining table, Pantry) and
 * each mode (dm2v2, dm1v1, kill5 team, lastSurvivor, killBoss): the match starts, the local fighter is driven with the
 * real keyboard (move, jump, attack, special) and once with the on-screen joystick / buttons by mouse; the test asserts
 * the fighter moved, jumped, attacked and used its special, damage happened, an agent died and respawned, the timer
 * counts down (timed modes), the match ends by its own rule (sped up with fgTimeScale), the result screen shows
 * title / rank / stars / trophies and the profile in localStorage gained trophies, no console errors, fps >= 50 at
 * 1280x720 (hardware ANGLE). Deterministic: ?seed= pins the sim + matchmaking, &slot=0 the local slot; the controls,
 * respawn and timer checks run with the sim frozen and bots frozen, stepped in exact sim ticks (pageHelpers), the local
 * death forced at tick DEATH_TICK; only the bot fight, kill feed and match end run live. Screenshots: FG_SHOTS (default shots/food-gang/play), incl. 1280x592 frames for clip parity.
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

// Sim clock bridge, built only on bridges every deployed build has (fgApp.match.runner, sim state botNoMove / botNoAction):
// the checks of the local controls and of the respawn screen run with the sim frozen (engine frames keep rendering and
// sampling input, the runner steps no tick) and the bots frozen (BotBrain zeroes their move and action), then the test
// steps exactly n sim ticks. So a key held for 42 ticks moves the fighter the same distance on an idle or a loaded PC,
// and no bot hit, knockback or match end lands in the middle of a check.
function pageHelpers() {
  const R = () => window.fgApp.match.runner;
  window.__fgFreeze = () => { const r = R(); r.timeScale = 0; r.acc = 0; r.state.botNoMove = r.state.botNoAction = true; return r.state.tick; };
  window.__fgThaw = (ts) => { const r = R(); r.state.botNoMove = r.state.botNoAction = false; r.acc = 0; r.timeScale = ts || 1; };
  // exactly n ticks through MatchRunner.update (live input sources, events dispatched to the views); stops at game over
  window.__fgStep = (n) => {
    const r = R(), ts = r.timeScale;
    let done = 0;
    r.timeScale = 1;
    try {
      while (done < n && !r.gameOver) {
        const k = Math.min(40, n - done);
        r.acc = 0;
        const m = r.update((k + 0.5) * r.dt);
        if (!m) break;
        done += m;
      }
    } finally { r.acc = 0; r.timeScale = ts; }
    return done;
  };
  const me = () => { const q = window.fgDebug(); return q.agents.find((x) => x.slot === q.match.localSlot); };
  const PRED = {
    alive: (a) => a.alive,
    grounded: (a) => a.alive && a.grounded,
    idle: (a) => a.alive && a.grounded && a.action === 'none',
    special: (a) => a.alive && a.cooldownSpecial <= 0 && a.action === 'none',
  };
  // steps one tick at a time until the local fighter matches `what`; returns the ticks stepped, -1 if never within max
  window.__fgStepUntil = (what, max) => {
    for (let i = 0; i <= max; i++) {
      if (PRED[what](me())) return i;
      if (i < max && !window.__fgStep(1)) return -1;
    }
    return -1;
  };
}
const step = (page, n) => page.evaluate((k) => window.__fgStep(k), n);
const stepUntil = (page, what, max) => page.evaluate(([w, m]) => window.__fgStepUntil(w, m), [what, max]);
// let the engine render n frames: input (keys, pointer queue) is sampled per frame, the HUD reads the state per frame
const frames = (page, n = 3) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// DebugDamageCommand through fgDamage; a build deployed before it gets the same command through fgApp
const damage = (page, slot, amount) => page.evaluate(([s, n]) => {
  if (window.fgDamage) return window.fgDamage(s, n);
  const r = window.fgApp.match && window.fgApp.match.runner, a = r && r.state.agents.find((x) => x.slot === s);
  return a ? r.match.debugDamage(r.state, a.id, n) : 0;
}, [slot, amount]);

// ticks at 60 Hz
const T_RIGHT = 42, T_LEFT = 30, DEATH_TICK = 150;

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
  await page.addInitScript(pageHelpers);
  const seed = opts.seed ?? 3;
  // seed pins the sim and (builds from 20261031b) the matchmaking RNG; slot pins the local slot on older builds too
  const url = `${base}?mode=${mode}&map=${map}&skin=${skin}&level=8&seed=${seed}&slot=0${opts.intro ? '' : '&intro=0'}`;
  try {
    await page.goto(url);
    const before = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('food-gang-profile') || 'null'); } catch { return null; } });
    // freeze in the same evaluate that sees the match start, before any bot acts
    const started = await waitFor(page, () => { const d = window.fgDebug && window.fgDebug(); if (!(d && d.screen === 'match' && d.phase === 'match' && d.tick > 5)) return null;
      window.__fgFreeze(); return window.fgDebug(); }, null, 60000, 20);
    const why = started ? '' : JSON.stringify(await dbg(page).catch((e) => String(e))).slice(0, 300) + ' ' + errors.slice(0, 3).join(' | ');
    check('match starts', !!started, started ? `local slot ${started.match.localSlot}, ${started.agents.length} fighters, frozen at tick ${started.tick}` : 'no match: ' + why);
    if (!started) return;
    const slot = started.match.localSlot;
    const trophies0 = started.profile.trophies;
    let d = await dbg(page);
    const me0 = localOf(d);
    check('special button shown (level 8 unlocks the special)', d.hud.specialButton && me0.specialUnlocked);
    // keyboard: run right, then left, measured over exact sim ticks with the bots frozen
    const x0 = me0.x;
    await page.keyboard.down('KeyD'); await frames(page);
    const tR = await step(page, T_RIGHT);
    d = await dbg(page);
    const x1 = localOf(d).x;
    await page.keyboard.up('KeyD');
    await page.keyboard.down('ArrowLeft'); await frames(page);
    const tL = await step(page, T_LEFT);
    d = await dbg(page);
    const x2 = localOf(d).x;
    await page.keyboard.up('ArrowLeft'); await frames(page);
    check('keyboard moves the fighter (D right, Left arrow left)', tR === T_RIGHT && tL === T_LEFT && x1 > x0 + 0.5 && x2 < x1 - 0.3, `x ${x0} -> ${x1} -> ${x2} over ${tR} + ${tL} ticks`);

    // the local fighter goes down at a fixed early tick through the sim's debug damage (DebugDamageCommand), bots frozen,
    // so every mode shows the respawn screen long before any match can end; a boss is the exception (its death ends killBoss)
    d = await dbg(page);
    const localBoss = !!localOf(d).boss;
    if (!localBoss) {
      await step(page, Math.max(0, DEATH_TICK - d.tick));
      const tDeath = (await dbg(page)).tick;
      await damage(page, slot, 1e6);
      await step(page, 1);
      const rs = await waitFor(page, () => window.fgDebug().hud.respawnShown, null, 5000, 30);
      if (rs) { await frames(page); await page.screenshot({ path: path.join(SHOTS, `${tag}_respawn.png`) }); }
      d = await dbg(page);
      check('respawn screen for the dead local fighter (BACK IN: n, controls hidden)', d.hud.respawnShown && d.hud.controlsAlpha === 0,
        `"${d.hud.respawnText}", died at tick ${tDeath}, local deaths ${d.stats.localDeaths || 0}, screen ${d.screen}/${d.phase}`);
      const tBack = await stepUntil(page, 'alive', 900);
      await waitFor(page, () => window.fgDebug().hud.controlsAlpha === 1, null, 5000, 30);
      d = await dbg(page);
      check('local fighter respawns and gets its controls back', tBack >= 0 && localOf(d).alive && !d.hud.respawnShown && d.hud.controlsAlpha === 1,
        `back after ${tBack} ticks, respawn events ${d.events['10'] || 0}`);
    } else check('respawn screen for the dead local fighter', true, 'local fighter is the boss: no respawn');

    const j0 = d.stats.jumps;
    // jump needs the fighter on the ground (no air jump)
    for (let i = 0; i < 3; i++) {
      await stepUntil(page, 'grounded', 300);
      await page.keyboard.down('Space'); await frames(page);
      await step(page, 8);
      await page.keyboard.up('Space'); await frames(page);
      await step(page, 10);
      d = await dbg(page);
      if (d.stats.jumps > j0) break;
    }
    check('keyboard jump', d.stats.jumps > j0, `${j0} -> ${d.stats.jumps} jumps`);
    await stepUntil(page, 'idle', 300);
    const a0 = d.stats.localActionStarts || 0;
    await page.keyboard.down('KeyJ'); await frames(page);
    await step(page, 27);
    await page.keyboard.up('KeyJ'); await frames(page);
    await step(page, 15);
    d = await dbg(page);
    check('keyboard attack (J)', (d.stats.localActionStarts || 0) > a0, `${a0} -> ${d.stats.localActionStarts} attacks, shots ${d.stats.shots}`);
    const s0 = d.stats.localSpecialStarts || 0;
    // the special starts only when its cooldown is over and no action is running (TOM's bazooka shot is long)
    const specialReady = async () => {
      const t = await stepUntil(page, 'special', 3600);
      await waitFor(page, () => window.fgDebug().hud.controlsAlpha === 1, null, 5000, 30);
      return t;
    };
    // a heal special (TOM) is refused at full HP by the sim (ActionSystem.tryStartSpecial): take a debug hit first
    const hurt = async () => {
      for (let i = 0; i < 10; i++) {
        const me = localOf(await dbg(page));
        if (!me.healSpecial || me.hp < me.hpMax) return;
        await damage(page, slot, Math.ceil(me.hpMax * 0.2));
        await step(page, 30);
      }
    };
    const fullHeal = async () => { const me = localOf(await dbg(page)); return me.healSpecial && me.hp >= me.hpMax; };
    await hurt();
    for (let i = 0; i < 3; i++) {
      await specialReady();
      await page.keyboard.down('KeyK'); await frames(page);
      await step(page, 12);
      await page.keyboard.up('KeyK'); await frames(page);
      await step(page, 24);
      d = await dbg(page);
      if ((d.stats.localSpecialStarts || 0) > s0 || await fullHeal()) break;
    }
    const kRefused = (d.stats.localSpecialStarts || 0) === s0 && await fullHeal();
    check('keyboard special (K)', (d.stats.localSpecialStarts || 0) > s0 || kRefused, kRefused ? 'heal special refused at full HP (sim rule)' : `${s0} -> ${d.stats.localSpecialStarts || 0}`);
    // on-screen controls by mouse: joystick drag right, jump, attack, special
    await stepUntil(page, 'idle', 300);
    await waitFor(page, () => window.fgDebug().hud.controlsAlpha === 1, null, 10000);
    d = await dbg(page);
    const c = d.match.controls;
    const xa = localOf(d).x;
    await page.mouse.move(c.joystick[0], c.joystick[1]);
    await page.mouse.down();
    await page.mouse.move(c.joystick[0] + 110, c.joystick[1], { steps: 4 });
    await frames(page);
    await step(page, 36);
    d = await dbg(page);
    let xb = localOf(d).x;
    await page.mouse.up(); await frames(page);
    if (!(xb > xa + 0.4)) {
      // blocked on the right (plate stack, wall): drag left instead
      await page.mouse.move(c.joystick[0], c.joystick[1]); await page.mouse.down();
      await page.mouse.move(c.joystick[0] - 110, c.joystick[1], { steps: 4 });
      await frames(page);
      await step(page, 36);
      d = await dbg(page);
      xb = localOf(d).x;
      await page.mouse.up(); await frames(page);
    }
    check('on-screen joystick moves the fighter', Math.abs(xb - xa) > 0.4 || (!localOf(d).alive), `x ${xa} -> ${xb} over 36 ticks`);
    const jb = d.stats.jumps;
    for (let i = 0; i < 3; i++) {
      await stepUntil(page, 'grounded', 300);
      await page.mouse.move(c.jump[0], c.jump[1]); await page.mouse.down(); await frames(page);
      await step(page, 6);
      await page.mouse.up(); await frames(page);
      await step(page, 20);
      d = await dbg(page);
      if (d.stats.jumps > jb) break;
    }
    check('on-screen jump button', d.stats.jumps > jb || !localOf(d).alive, `${jb} -> ${d.stats.jumps}`);
    await stepUntil(page, 'idle', 300);
    const ab = d.stats.localActionStarts || 0;
    await page.mouse.move(c.action[0], c.action[1]);
    await page.mouse.down(); await frames(page);
    await step(page, 24);
    await page.mouse.up(); await frames(page);
    await step(page, 15);
    d = await dbg(page);
    check('on-screen attack button', (d.stats.localActionStarts || 0) > ab || !localOf(d).alive, `${ab} -> ${d.stats.localActionStarts}`);
    const sb = d.stats.localSpecialStarts || 0;
    if (c.special) await hurt();
    for (let i = 0; i < 3 && c.special; i++) {
      await specialReady();
      await page.mouse.move(c.special[0], c.special[1]); await page.mouse.down(); await frames(page);
      await step(page, 12);
      await page.mouse.up(); await frames(page);
      await step(page, 24);
      d = await dbg(page);
      if ((d.stats.localSpecialStarts || 0) > sb || await fullHeal()) break;
    }
    const bRefused = (d.stats.localSpecialStarts || 0) === sb && await fullHeal();
    check('on-screen special button', (d.stats.localSpecialStarts || 0) > sb || !localOf(d).alive || bRefused, bRefused ? 'heal special refused at full HP (sim rule)' : `${sb} -> ${d.stats.localSpecialStarts || 0}`);
    await page.screenshot({ path: path.join(SHOTS, `${tag}_hud.png`) });
    // timer counts down over 90 sim ticks (timed modes) / no timer (kill race, last survivor)
    const t0 = d.timer;
    const tT = await step(page, 90);
    await frames(page);
    d = await dbg(page);
    if (TIMED[mode]) check('timer counts down', d.timer < t0 - 0.5 && /^\d+:\d\d$/.test(d.timerText), `${t0} -> ${d.timer} "${d.timerText}" over ${tT} ticks`);
    else check('no match timer in this mode', d.timer === 0, `timer ${d.timer}`);
    // from here the match runs live: bots fight, the local fighter on autopilot through the scripted-input bridge
    // (chase the nearest enemy, attack, jump to higher foes, special when ready)
    await page.evaluate(() => {
      window.__fgThaw(1);
      window.__pilot = setInterval(() => {
        const q = window.fgDebug();
        if (!q.match || q.phase !== 'match') { window.fgScript(null); return; }
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
    // fps while fighting at 1280x720 (real time, bots live)
    await sleep(1500);
    d = await dbg(page);
    const fps = d.fps;
    if (!opts.viewport) check('fps >= 50 at 1280x720', fps >= 50, `${fps} fps`);
    await page.evaluate(() => window.fgTimeScale(3));
    const kf = await waitFor(page, () => window.fgDebug().hud.killFeedShown > 0, null, 60000);
    if (kf) await page.screenshot({ path: path.join(SHOTS, `${tag}_killfeed.png`) });
    check('kill feed shows a kill', !!kf);
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
