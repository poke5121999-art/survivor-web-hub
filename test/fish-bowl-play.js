#!/usr/bin/env node
/* Plays games/fish-bowl through its real input path and checks every level can be finished.
// FB_URL=<Pages index.html> runs it against the deployed game.
   node test/fish-bowl-play.js [level 1-5] [outDir]
   Level 1 starts from the menu (Play -> level select -> Play) and skips the intro through the HUD skip panel; levels
   2-5 start with ?level=N&skip=1. A bot steers with the same Input API the HUD drives (stick, up/down, taps) and level
   5 draws the shapes with the mouse. Asserts the LevelCompletePanel shows and the save unlocks the next level, and
   saves mid-task screenshots (default scratchpad/play). One level per run keeps each run under the time limit. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const LEVEL = +(process.argv[2] || 1);
const OUT = process.argv[3] || 'C:/Users/tamph/AppData/Local/Temp/claude/D--survivor-web-hub/1a1efc39-4ce5-47df-85ca-c15395a4a193/scratchpad/play';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const LEVEL_BUDGET = 150000;
let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fail++; };

function serve() {
  return new Promise(res => {
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

// In-page bot: reads window.__fb, writes only window.__fb.input (stick, holds, taps).
function installBot(level) {
  const fb = window.__fb, inp = fb.input;
  const st = { pullAt: 0, actAt: 0, jumpAt: 0, flopAt: 0, climb: 0, mark: null };
  const steer = (goal, from, slow = 1.5) => {
    const p = fb.player;
    const dx = goal[0] - from[0], dy = goal[1] - from[1], dz = goal[2] - from[2];
    const h = Math.hypot(dx, dz), cy = p.camYaw;
    const f = [-Math.sin(cy), -Math.cos(cy)], r = [Math.cos(cy), -Math.sin(cy)];
    const k = Math.min(1, h / slow);
    inp.setAxis(h > 0.05 ? ((dx * r[0] + dz * r[1]) / h) * k : 0, h > 0.05 ? ((dx * f[0] + dz * f[1]) / h) * k : 0);
    const up = dy > 0.25 || st.climb > performance.now(), down = !up && dy < -0.25;
    inp.hold('up', up);
    inp.hold('down', down);
    // stuck on a rock: barely moved for 1.5 s while the goal is still far -> swim up for a while
    const now = performance.now(), d = Math.hypot(h, dy);
    if (!st.mark || now - st.mark.t > 1500) {
      if (st.mark && d > 1.2 && Math.hypot(from[0] - st.mark.p[0], from[1] - st.mark.p[1], from[2] - st.mark.p[2]) < 0.5) st.climb = now + 1300;
      st.mark = { t: now, p: from.slice() };
    }
  };
  const idle = () => { inp.setAxis(0, 0); inp.hold('up', false); inp.hold('down', false); };
  const tick = () => {
    if (window.__botStop) { idle(); return; }
    const s = fb.state, t = fb.task, now = performance.now();
    if (s === 'playing' && t && t.control) {
      if (level === 1) {
        if (t.mossButton && !t.mossDone) { idle(); if (now - st.pullAt > 90) { st.pullAt = now; inp.tap('pull'); } }
        else if (t.action) { idle(); if (now - st.actAt > 300) { st.actAt = now; inp.tap('action'); } }
        else if (fb.targets.length) steer(fb.targets[0], fb.player.pos);
        else idle();
      } else if (level === 2) {
        if (t.food) steer(t.food, fb.player.mouth, 0.8);
        else idle();
      } else if (level === 3 || level === 4) {
        idle();
        if (t.flopLive) { if (t.grounded && now - st.flopAt > 250) { st.flopAt = now; inp.tap('flop'); } }
        else if (t.aimed && !t.flying && now - st.jumpAt > 600) { st.jumpAt = now; inp.tap('jump'); }
      }
    } else idle();
    requestAnimationFrame(tick);
  };
  tick();
}

async function clickUi(page, key, p) {
  const r = await page.evaluate(([k, q]) => {
    const b = window.__fb.game.ui.el(k, q).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width };
  }, [key, p]);
  if (!r.w) throw new Error(`ui ${key}/${p} is not on screen`);
  await page.mouse.click(r.x, r.y);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(page, fn, arg, ms) {
  await page.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
}

// Level 5: draw the shape the task shows with the mouse inside its draw area.
async function drawShapes(page, shoot) {
  const pats = await page.evaluate(async () => (await import('./js/gesture.js')).PATTERNS);
  for (let i = 0; i < 12; i++) {
    const s = await page.evaluate(() => ({ state: window.__fb.state, t: window.__fb.task }));
    if (s.state !== 'playing') return;
    const d = s.t && s.t.draw;
    if (!d) { await sleep(300); continue; }
    const p = pats[d.pattern];
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    const size = Math.min(d.w, d.h) * 0.7, x0 = d.x + (d.w - size) / 2, y0 = d.y + (d.h - size) / 2;
    const at = ([x, y]) => [x0 + x * size, y0 + (1 - y) * size];
    await page.mouse.move(...at(pts[0]));
    await page.mouse.down();
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = at(pts[k - 1]), [bx, by] = at(pts[k]);
      for (let j = 1; j <= 6; j++) await page.mouse.move(ax + ((bx - ax) * j) / 6, ay + ((by - ay) * j) / 6);
    }
    if (d.count === 1) await shoot('5-gesture-drawing');
    await page.mouse.up();
    await sleep(500);
    if (d.count === 0) await shoot('5-victory');
    const after = await page.evaluate(() => window.__fb.task);
    console.log(`  drew ${d.pattern}: score ${after && after.lastScore != null ? after.lastScore.toFixed(2) : '?'} -> ${after ? after.gestures : '?'} done`);
    await sleep(2600);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = process.env.FB_URL ? null : await serve();
  const base = process.env.FB_URL || `http://localhost:${srv.address().port}/games/fish-bowl/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('FAIL timeout'); process.exit(2); }, 170000);
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('  pageerror', e.message); fail++; });
    page.on('console', m => { if (m.type() === 'error') console.log('  console.error', m.text().slice(0, 300)); });
    const shots = new Set();
    const shoot = async name => {
      if (shots.has(name)) return;
      shots.add(name);
      const file = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      console.log(`  shot ${file}`);
    };
    const t0 = Date.now();
    console.log(`level ${LEVEL}`);
    if (LEVEL === 1) {
      await page.goto(base);
      await page.evaluate(() => localStorage.removeItem('fishbowl.save'));
      await page.goto(base);
      await waitFor(page, () => window.__fb && window.__fb.screen === 'menu', null, 90000);
      await sleep(1500);
      await shoot('0-menu');
      await clickUi(page, 'menu', 'Play_Button');
      await waitFor(page, () => window.__fb.screen === 'levels', null, 5000);
      await sleep(800);
      await shoot('0-levels');
      // fresh save: the first-run Tutorial overlay covers the level select and its own Play opens level 1
      await clickUi(page, 'levels', 'Tutorial/Play');
      await waitFor(page, () => window.__fb.state === 'timeline', null, 90000); // a cold load shows the LOADING panel until lightmaps and HUD sprites arrive
      await sleep(2500);
      await waitFor(page, () => !window.__fb.game.fading, null, 5000); // the Fader blocks the HUD while the level fades in
      await shoot('1-intro');
      await clickUi(page, 'hud', 'Timeline/TimelineSkipButton');
      await sleep(400);
      await clickUi(page, 'hud', 'Timeline/Skip CutScene/Skjp Panel/Yes/Button');
      await waitFor(page, () => window.__fb.state === 'playing', null, 5000);
      check(true, 'menu -> level select -> level 1, intro skipped from the HUD');
    } else {
      await page.goto(base);
      await page.evaluate(n => localStorage.setItem('fishbowl.save', JSON.stringify({ unlocked: n, coins: 0, done: [] })), LEVEL);
      await page.goto(`${base}?level=${LEVEL}&skip=1`);
      await waitFor(page, () => window.__fb && window.__fb.screen === 'game', null, 90000);
    }
    await page.evaluate(installBot, LEVEL);
    const mid = {
      1: t => t.mossButton && t.moss > 30, 2: t => !!t.food && !t.timeline, 3: t => t.flying && t.jumpIndex >= 1,
      4: t => t.flopLive && t.path >= 2,
    }[LEVEL];
    const mid2 = { 1: t => t.collected >= 1, 2: t => t.timeline && t.hunger >= 50, 3: t => t.jumpIndex >= 5 && !t.flying, 4: t => t.flying }[LEVEL];
    let drawing = null;
    while (Date.now() - t0 < LEVEL_BUDGET) {
      const s = await page.evaluate(() => ({ state: window.__fb.state, task: window.__fb.task, player: window.__fb.player }));
      if (s.state === 'complete' || s.state === 'dead') break;
      if (s.task && mid && mid(s.task)) await shoot(`${LEVEL}-task`);
      if (s.task && mid2 && mid2(s.task)) await shoot(`${LEVEL}-task-b`);
      if (LEVEL === 5 && !drawing && s.task && s.task.draw) drawing = drawShapes(page, shoot);
      if (Date.now() % 10000 < 600) console.log(`  t=${((Date.now() - t0) / 1000).toFixed(0)}s ${s.state} ${JSON.stringify(s.task)} pos=${s.player.pos.map(v => v.toFixed(1))}`);
      await sleep(500);
    }
    if (drawing) await drawing;
    await page.evaluate(() => { window.__botStop = true; });
    const end = await page.evaluate(() => window.__fb.state);
    check(end === 'complete', `level ${LEVEL} complete (state ${end}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (end === 'complete') {
      await waitFor(page, () => {
        const el = window.__fb.game.ui.el('hud', 'GameStatus/LevelCompletePanel');
        return el && !el.classList.contains('fb-off');
      }, null, 6000).catch(() => {});
      await sleep(1200);
      const panel = await page.evaluate(() => !window.__fb.game.ui.el('hud', 'GameStatus/LevelCompletePanel').classList.contains('fb-off'));
      check(panel, 'LevelCompletePanel shown');
      await shoot(`${LEVEL}-complete`);
      const save = await page.evaluate(() => window.__fb.save);
      const want = Math.min(5, LEVEL + 1);
      check(save.unlocked >= want, `save unlocks level ${want} (unlocked ${save.unlocked}, coins ${save.coins})`);
    } else await shoot(`${LEVEL}-end`);
  } catch (e) {
    console.log('  FAIL', e.message);
    fail++;
  } finally {
    clearTimeout(kill);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(fail ? `${fail} FAIL` : 'all PASS');
  process.exit(fail ? 1 : 0);
})();
