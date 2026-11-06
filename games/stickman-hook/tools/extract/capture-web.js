#!/usr/bin/env node
/* Capture Stickman Hook web at moments matching the original clips. Read-only on the game.
 *   node capture-web.js <outDir> [sceneName ...]
 * Phone viewport 390x844 @ DPR 2, live Pages build. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = process.env.SH_URL || 'https://poke5121999-art.github.io/survivor-web-hub/games/stickman-hook/index.html';
const OUT = process.argv[2];
const ONLY = process.argv.slice(3);
fs.mkdirSync(OUT, { recursive: true });

// In-page autopilot: grab the closest forward target while falling, let go past it while rising.
const AUTOPILOT = () => {
  if (window.__ap) return;
  window.__ap = setInterval(() => {
    const s = window.__sh; if (!s || s.game.phase !== 'play') return;
    const p = s.player, w = s.world;
    if (p.hooked < 0) {
      const t = w.targets[p.closest];
      const want = t && t.x > p.x - 0.5 && t.y > p.y - 0.5 && p.vy < 0.5;
      s.setHold(!!want); window.__hk = performance.now();
    } else {
      const t = w.targets[p.hooked];
      if ((p.x > t.x + 0.6 && p.vy > 0.8) || performance.now() - window.__hk > 2500) s.setHold(false); else s.setHold(true);
    }
  }, 10);
};

async function waitCond(page, fn, arg, ms = 20000) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 16 }); return true; } catch { return false; }
}

const go = async (page, q) => {
  await page.goto(BASE + q);
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
};

const swingShot = (q, extra = {}) => async (page) => {
  await go(page, q);
  await page.evaluate(AUTOPILOT);
  // the second hook of the level, near the bottom of the swing (rope nearly vertical), or the first if no second
  let ok = await waitCond(page, (n) => { const s = window.__sh, p = s.player; if (p.hooked < 0) return false;
    window.__hooks = window.__hooks || new Set(); window.__hooks.add(p.hooked);
    const t = s.world.targets[p.hooked]; return window.__hooks.size >= n && Math.abs(p.x - t.x) < 0.4 && p.y < t.y; }, extra.nth || 2, 12000);
  if (!ok) ok = await waitCond(page, () => window.__sh.player.hooked >= 0, null, 4000);
  return { note: ok ? 'hooked' : 'no hook reached' };
};

// Hold from the first play frame: the player hooks the closest target; shoot once hooked and swinging.
const holdShot = (q, ms = 700) => async (page) => {
  await go(page, q);
  await waitCond(page, () => window.__sh.game.phase === 'play', null, 8000);
  await page.evaluate(() => window.__sh.setHold(true));
  const ok = await waitCond(page, () => window.__sh.player.hooked >= 0, null, 5000);
  await page.waitForTimeout(ms); return { note: ok ? 'held from start' : 'no hook' };
};

async function finishAt(page, ms) {
  await page.setViewportSize({ width: 360, height: 800 });
  await go(page, '?level=44');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stickman-hook'));
    s.owned = { skins: ['basic', 'stick_hat'], ropes: ['basic'], trails: ['basic'] }; s.equipped = { skins: 'stick_hat', ropes: 'basic', trails: 'basic' };
    localStorage.setItem('stickman-hook', JSON.stringify(s)); });
  await go(page, '?level=44');
  await waitCond(page, () => window.__sh.game.phase === 'play', null, 8000);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const s = window.__sh, p = s.player; Object.assign(p, { x: s.world.finishX - 0.5, y: 1.5, vx: 8.1, vy: -1.3 }); });
  const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 8000);
  const t0 = await page.evaluate(() => window.__sh.game.t);
  await page.waitForTimeout(Math.max(0, ms - t0 * 1000 - 60));
  return { note: ok ? `level 44 finish +${ms / 1000}s (placed)` : 'finish not reached' };
}

const SCENES = {
  l16_hold: holdShot('?level=16'),
  l45_hold: holdShot('?level=45'),
  l92_hold: holdShot('?level=92'),
  l94_hold: holdShot('?level=94'),
  l98_hold: holdShot('?level=98'),
  ch3_hold: holdShot('?mode=challenge&level=3'),
  home: async (page) => { await go(page, ''); await page.waitForTimeout(2500); return {}; },
  l1_spawn: async (page) => { await go(page, '?level=1'); await page.waitForTimeout(250); return {}; },
  l1_play_idle: async (page) => { await go(page, '?level=1'); await waitCond(page, () => window.__sh.game.phase === 'play'); await page.waitForTimeout(300); return {}; },
  l1_swing: swingShot('?level=1', { nth: 1 }),
  l3_swing: swingShot('?level=3'),
  l6_swing: swingShot('?level=6'),
  l11_swing: swingShot('?level=11'),
  l16_swing: swingShot('?level=16'),
  l45_swing: swingShot('?level=45'),
  l47_swing: swingShot('?level=47'),
  l94_swing: swingShot('?level=94'),
  l99_swing: swingShot('?level=99'),
  ch3_swing: swingShot('?mode=challenge&level=3'),
  l1_finish_cross: async (page) => {
    await go(page, '?level=1'); await page.evaluate(AUTOPILOT);
    const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 25000);
    await page.waitForTimeout(250); return { note: ok ? 'finish +0.25s' : 'finish not reached' };
  },
  // the finish in slow motion, before the end game (it opens 1.0 s after the finish)
  l1_finish_late: async (page) => {
    await go(page, '?level=1'); await page.evaluate(AUTOPILOT);
    const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 25000);
    await page.waitForTimeout(800); return { note: ok ? 'finish +0.8s' : 'finish not reached' };
  },
  // a save whose first Normal level is new, so the piggy bank fills (69 -> 79 like the clip's 69 -> 72)
  l1_piggy: async (page) => {
    await go(page, '?level=1');
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stickman-hook')); s.best = 0; s.inv = { ...(s.inv || {}), 'progression.piggy_bank_progress': 69, 'progression.piggy_bank_claims': 1 }; localStorage.setItem('stickman-hook', JSON.stringify(s)); });
    await go(page, '?level=1'); await page.evaluate(AUTOPILOT);
    const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 25000);
    await waitCond(page, () => !!document.querySelector('#egPiggy.on'), null, 8000);
    await page.waitForTimeout(1200); return { note: ok ? 'piggy popup' : 'finish not reached' };
  },
  l1_podium: async (page) => {
    await go(page, '?level=1'); await page.evaluate(AUTOPILOT);
    const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 25000);
    await waitCond(page, () => !!document.querySelector('#egPage.on, #egPiggy.on'), null, 8000);
    if (await page.evaluate(() => !!document.querySelector('#egPiggy.on'))) { await page.waitForTimeout(1200); await page.mouse.click(195, 300); }
    await waitCond(page, () => !!document.querySelector('#egPage.on'), null, 8000);
    await page.waitForTimeout(900); return { note: ok ? 'end page' : 'finish not reached' };
  },
  // the 2026 clip's finish (0:13.25 cross, 0:13.7 and 0:14.5 shots): level 44, Stick Hat, its 576 x 1280 screen (360 x 800
  // CSS), the player put just before the line in flight; shot 0.45 s / 0.9 s after the finish
  l44_finish: async (page) => finishAt(page, 450),
  l44_finish_late: async (page) => finishAt(page, 900),
  l1_finish_done: async (page) => {
    await go(page, '?level=1'); await page.evaluate(AUTOPILOT);
    const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 25000);
    await page.waitForTimeout(2200); return { note: ok ? 'finish +2.2s' : 'finish not reached' };
  },
  l1_roll: async (page) => {
    await go(page, '?level=1');
    const ok = await waitCond(page, () => window.__sh.player.state === 0 && Math.abs(window.__sh.player.vx) > 1, null, 8000);
    return { note: ok ? 'rolling' : 'no roll' };
  },
  l2_death: async (page) => {
    await go(page, '?level=2');
    const ok = await waitCond(page, () => window.__sh.game.deaths > 0, null, 15000);
    await page.waitForTimeout(150); return { note: ok ? 'respawn after death' : 'no death' };
  },
  race_page: async (page) => { await go(page, '?mode=tournament'); await page.waitForTimeout(3000); return {}; },
  race_count: async (page) => { await go(page, '?mode=tournament'); await page.waitForTimeout(2500);
    await page.click('#race.on .go'); await page.waitForTimeout(1100); return {}; },
  race_mid: async (page) => { await go(page, '?mode=tournament'); await page.waitForTimeout(2500);
    await page.click('#race.on .go'); await waitCond(page, () => window.__sh.game.phase === 'play', null, 8000);
    await page.evaluate(AUTOPILOT); await page.waitForTimeout(3500); return {}; },
  race_finish: async (page) => { await go(page, '?mode=tournament'); await page.waitForTimeout(2500);
    await page.click('#race.on .go'); await waitCond(page, () => window.__sh.game.phase === 'play', null, 8000);
    await page.evaluate(AUTOPILOT); const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 60000);
    await page.waitForTimeout(400); return { note: ok ? 'race finish +0.4s' : 'race finish not reached' }; },
  // the autopilot rarely gets through the race map: put the player on the finish line at full speed instead
  race_finish_jump: async (page) => { await go(page, '?mode=tournament'); await page.waitForTimeout(2500);
    await page.click('#race.on .go'); await waitCond(page, () => window.__sh.game.phase === 'play', null, 8000);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const s = window.__sh, p = s.player; Object.assign(p, { x: s.world.finishX - 0.6, y: 0.5, vx: 9, vy: 2 }); });
    const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 8000);
    await page.waitForTimeout(400); return { note: ok ? 'race finish +0.4s (placed)' : 'race finish not reached' }; },
  race_result: async (page) => { await go(page, '?mode=tournament'); await page.waitForTimeout(2500);
    await page.click('#race.on .go'); await waitCond(page, () => window.__sh.game.phase === 'play', null, 8000);
    await page.evaluate(AUTOPILOT); const ok = await waitCond(page, () => window.__sh.game.phase === 'finish', null, 60000);
    await page.waitForTimeout(3500); return { note: ok ? 'race finish +3.5s' : 'race finish not reached' }; },
  road: async (page) => { await go(page, '?level=1'); await page.evaluate(() => window.__sh.openMenu('openRoad')); await page.waitForTimeout(2500); return {}; },
  l1_bounce: async (page) => { await go(page, '?level=1');
    const ok = await waitCond(page, () => window.__sh.world.bumpers.some((b) => b.anim >= 0.05), null, 8000); return { note: ok ? 'bumper anim' : 'no bumper anim' }; },
  l1_nearest: async (page) => { await go(page, '?level=1'); await waitCond(page, () => window.__sh.game.phase === 'play'); await page.waitForTimeout(100); return {}; },
  modes: async (page) => { await go(page, '?level=1'); await page.evaluate(() => window.__sh.openMenu('openModes')); await page.waitForTimeout(1500); return {}; },
  shop: async (page) => { await go(page, '?level=1'); await page.evaluate(() => window.__sh.openMenu('openShop')); await page.waitForTimeout(6000); return {}; },
  wheel: async (page) => { await go(page, '?level=1'); await page.evaluate(() => window.__sh.openMenu('openWheel')); await page.waitForTimeout(2500); return {}; },
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // XP 3000 so Race, Challenge and Grapple are open; a fresh save otherwise
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('par')) { sessionStorage.setItem('par', '1');
    localStorage.setItem('stickman-hook', JSON.stringify({ v: 2, xp: 3000, best: 120, level: 0 })); } } catch {} });
  const log = {};
  for (const [name, fn] of Object.entries(SCENES)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try {
      const r = await fn(page);
      const info = await page.evaluate(() => { const s = window.__sh; if (!s || !s.world) return null;
        const p = s.player; return { level: s.world.index + 1, phase: s.game.phase, t: +s.game.t.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(2),
          vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), hooked: p.hooked, state: p.state, zoom: s.cam.zoom, camx: +s.cam.x.toFixed(2), theme: s.theme }; }).catch(() => null);
      if (process.env.SH_SHOT_DELAY) await page.waitForTimeout(+process.env.SH_SHOT_DELAY);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      log[name] = { ...r, info, errs };
      console.log(name, JSON.stringify(log[name]));
    } catch (e) { console.log(name, 'ERROR', e.message); log[name] = { error: e.message }; }
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'capture-log.json'), JSON.stringify(log, null, 1));
  await browser.close();
})();
