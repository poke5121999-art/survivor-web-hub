#!/usr/bin/env node
/* Food Gang self-playtest as a player (games/food-gang/docs/PLAYTEST.md): real input through the keyboard and the
 * on-screen joystick / buttons (CDP touch), at normal speed for the first matches, then a time-scaled career.
 *   desktop 1280x720: fresh profile -> tutorial (walk to the dummies and hit them) -> nickname typed -> matches through
 *     matchmaking -> result screen -> fridge -> menu, trophy road claims, skin upgrades, shop / VIP / missions / settings /
 *     language, until league II and FG_MATCHES matches (default 16)
 *   phone landscape 844x390 (touch): two matches with the on-screen controls, the menu and popups
 *   phone portrait 390x844: rotate hint
 *   private battle: two pages, create + join by code, the match, back to the room's lobby, a second match
 * Records per match: mode, map, result, kills/deaths, real seconds, fps min/avg (normal speed), sfx count, errors.
 * Writes shots/food-gang/playtest/<run>/*.png and shots/food-gang/playtest/<run>/report.json; exit code 1 when a
 * flow got stuck or the page logged errors.
 *   node test/food-gang-playtest.js                       (local server, offline quick play; FG_NET=loop for the party part)
 *   FG_URL=https://poke5121999-art.github.io/survivor-web-hub/games/food-gang/index.html node test/food-gang-playtest.js
 *   FG_PARTS=desktop,phone,portrait,party  FG_MATCHES=16  FG_NORMAL=4 (matches played at normal speed)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const RUN = process.env.FG_RUN || (process.env.FG_URL ? 'pages' : 'local');
const OUT = path.join(ROOT, 'shots', 'food-gang', 'playtest', RUN);
const PARTS = (process.env.FG_PARTS || 'desktop,phone,portrait,party').split(',');
const MATCHES = Number(process.env.FG_MATCHES || 16);
const NORMAL = Number(process.env.FG_NORMAL || 4);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { run: RUN, url: process.env.FG_URL || 'local', started: new Date().toISOString(), matches: [], issues: [], notes: [], parts: {} };
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; report.issues.push({ name, detail: detail || '' }); }
};
const note = (s) => { console.log('  note: ' + s); report.notes.push(s); };

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

// ------------------------------------------------------------------------------------------------ page helpers
function helpers(page, tag) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/lobby|relay|unity3d|services\.api/i.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  const ev = (f, a) => page.evaluate(f, a);
  const until = async (f, ms, a, step = 120) => { const e = Date.now() + ms; for (;;) { const v = await ev(f, a).catch(() => null); if (v) return v; if (Date.now() > e) return null; await sleep(step); } };
  const top = () => ev(() => { const u = window.fgDebug().ui; return u[0] || null; });
  const topIs = (scene, ms = 15000) => until((s) => { const u = window.fgDebug().ui; return u[0] && u[0].scene === s ? u[0] : null; }, ms, scene);
  const button = (method, scene, name) => ev(([m, s, n]) => (window.fgButtons(s) || []).find((x) => x.method.split(',').includes(m) && (!n || x.name === n)), [method, scene, name]);
  let touch = null;
  const clickAt = async (pos) => {
    if (touch) await touch.tap(pos[0], pos[1]); else await page.mouse.click(pos[0], pos[1]);
    await sleep(180);
  };
  const press = async (method, scene, name) => { const b = await button(method, scene, name); if (!b) return false; await clickAt(b.pos); return true; };
  const back = async (scene) => { const ok = await press('Close', scene) || await press('OnClickBack', scene); await sleep(600); return ok; };
  const shot = async (name) => { fs.mkdirSync(OUT, { recursive: true }); const p = path.join(OUT, `${tag}_${name}.png`); await page.screenshot({ path: p }); return path.relative(ROOT, p).replace(/\\/g, '/'); };
  const tapRewards = async (shotName) => {
    if (!(await topIs('SceneReward', 8000))) return 0;
    let n = 0;
    for (let i = 0; i < 50; i++) {
      const u = await top();
      if (!u || u.scene !== 'SceneReward') break;
      if (i === 2 && shotName) await shot(shotName);
      if (u.state === 'item' || u.state === 'box') { const vp = page.viewportSize(); await clickAt([vp.width / 2, vp.height * 0.58]); n++; }
      await sleep(550);
    }
    return n;
  };
  const closeAll = async () => {
    for (let i = 0; i < 6; i++) {
      const u = await top();
      if (!u || u.scene === 'SceneMenu') return true;
      if (u.scene === 'SceneReward') { await tapRewards(); continue; }
      if (u.scene === 'Leaderboard') { await page.click('.fg-board .x').catch(() => {}); await sleep(400); continue; }
      if (!(await back(u.scene))) await page.keyboard.press('Escape');
    }
    return (await top() || {}).scene === 'SceneMenu';
  };
  return { errors, ev, until, top, topIs, button, clickAt, press, back, shot, tapRewards, closeAll, setTouch: (t) => { touch = t; } };
}

// CDP touch: the full set of fingers down is sent every time; Chromium presses / moves / lifts the changed ones
async function touchDevice(page) {
  const cdp = await page.context().newCDPSession(page);
  let down = 0;
  const send = async (pts) => {
    const touchPoints = pts.map((p) => ({ x: p[0], y: p[1], id: p[2], radiusX: 6, radiusY: 6, force: 1 }));
    if (!touchPoints.length) { if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); down = 0; return; }
    await cdp.send('Input.dispatchTouchEvent', { type: down ? 'touchMove' : 'touchStart', touchPoints });
    down = touchPoints.length;
  };
  return { send, tap: async (x, y) => { await send([[x, y, 9]]); await sleep(60); await send([]); } };
}

// ------------------------------------------------------------------------------------------------ the fighter brain
// Reads the match like a player looking at the screen (positions, hp, who is alive) and answers with keys or fingers.
async function fight(page, h, { touch = null, scale = 1, maxMs = 240000, tag = '' } = {}) {
  const t0 = Date.now();
  const keys = new Set();
  const setKey = async (k, on) => { if (on && !keys.has(k)) { keys.add(k); await page.keyboard.down(k); } else if (!on && keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } };
  let plats = null, ctl = null, lastX = null, stuck = 0, jumpFor = -2, fps = [], shots = 0, sawMatch = false, sfx0 = null, special = 0, attackT = 0;
  const releaseAll = async () => { for (const k of [...keys]) await setKey(k, false); if (touch) await touch.send([]); };
  for (;;) {
    if (Date.now() - t0 > maxMs) { await releaseAll(); return { timeout: true, ms: Date.now() - t0, fps }; }
    const d = await h.ev(() => {
      const d = window.fgDebug(); const m = d.match;
      if (!m) return { screen: d.screen, phase: d.phase };
      return { screen: d.screen, phase: d.phase, simPhase: m.simPhase, local: m.local, agents: m.agents, teams: m.teams, goal: m.goal, map: m.map, fps: d.fps, sfx: d.audio.played, timer: m.timerText, controls: m.hud.controlsAlpha };
    }).catch(() => null);
    if (!d) { await sleep(200); continue; }
    if (d.screen === 'gameover' || d.screen === 'tutoend' || d.screen === 'menu') { await releaseAll(); return { ms: Date.now() - t0, fps, sfx: d.sfx, sawMatch }; }
    if (d.phase !== 'match' || d.simPhase !== 'playing') { await releaseAll(); await sleep(150); continue; }
    if (!sawMatch) {
      sawMatch = true; sfx0 = d.sfx;
      if (scale !== 1) await h.ev((k) => window.fgTimeScale(k), scale);
      if (touch) ctl = await h.ev(() => {
        const app = window.fgApp, hd = app.match && app.match.hud; if (!hd) return null;
        const e = app.engine, k = e.canvas.getBoundingClientRect();
        const P = (n) => { const q = e.ui.screenRect(n); return [k.left + (q[0] + q[2] / 2) * k.width / e.canvas.width, k.top + (e.canvas.height - q[1] - q[3] / 2) * k.height / e.canvas.height]; };
        const b = {}; for (const v of hd.vbuttons) if (v.node.activeInHierarchy) b[v.type] = P(v.node);
        return { joy: hd.joy ? P(hd.joy.node) : null, b };
      });
    }
    if (d.fps && scale === 1 && Date.now() - t0 > 4000) fps.push(d.fps);
    const me = d.agents.find((a) => a.id === d.local);
    if (!me || !me.alive) { await releaseAll(); await sleep(150); continue; }
    const foes = d.agents.filter((a) => a.id !== me.id && a.alive && !a.respawnWait && (d.teams === 0 || a.team !== me.team));
    let dir = 0, attack = false, jump = false, spec = false;
    if (!plats) plats = await h.ev((mi) => window.fgApp.simDb.maps[mi].colliders.filter((c) => c.max.x - c.min.x < 20).map((c) => ({ l: c.min.x, r: c.max.x, top: c.max.y, bot: c.min.y })), d.map).catch(() => []);
    if (foes.length) {
      foes.sort((a, b) => (Math.abs(a.x - me.x) + 2 * Math.abs(a.y - me.y)) - (Math.abs(b.x - me.x) + 2 * Math.abs(b.y - me.y)));
      const f = foes[0];
      const dx = f.x - me.x, dy = f.y - me.y;
      const facing = me.facingLeft ? dx < 0 : dx > 0;
      dir = Math.abs(dx) > 1.6 ? Math.sign(dx) : (!facing ? Math.sign(dx) : 0);
      attack = Math.abs(dy) < 1.4 && Math.abs(dx) < 7 && facing;
      spec = me.specialUnlocked && me.cooldownSpecial <= 0 && Math.abs(dx) < 5 && Math.abs(dy) < 1.5 && (!me.healSpecial || me.hp < me.hpMax * 0.5);
      if (dy > 1.1) {
        // the shelves are solid from below: go round the edge of the platform to climb (or of a lower one first)
        const up = plats.filter((p) => p.top > me.y + 0.5 && p.top - me.y < 3.4);
        const tp = plats.find((p) => Math.abs(p.top - f.y) < 0.5 && f.x >= p.l - 0.3 && f.x <= p.r + 0.3);
        let S = tp && up.includes(tp) ? tp : up.sort((a, b) => Math.abs((a.l + a.r) / 2 - f.x) - Math.abs((b.l + b.r) / 2 - f.x))[0];
        if (S) {
          // in the air: rise beside the shelf, then drift over it once above its top
          if (!me.grounded) dir = me.y > S.top - 0.2 ? Math.sign((S.l + S.r) / 2 - me.x) : (me.x > S.l - 0.9 && me.x < S.r + 0.9 ? 0 : Math.sign((S.l + S.r) / 2 - me.x));
          else {
            let ex = me.x < S.l ? S.l - 1.2 : me.x > S.r ? S.r + 1.2 : (me.x - S.l < S.r - me.x ? S.l - 1.2 : S.r + 1.2);
            // standing on a shelf: take off from its edge rather than walking off it
            const C = plats.find((p) => Math.abs(p.top - me.y) < 0.3 && me.x >= p.l - 0.2 && me.x <= p.r + 0.2);
            if (C) ex = Math.max(C.l + 0.3, Math.min(C.r - 0.3, ex));
            if (Math.abs(ex - me.x) < 0.5) { jump = true; dir = 0; } else dir = Math.sign(ex - me.x);
          }
        } else jump = me.grounded;
      }
    }
    if (dir && lastX !== null && Math.abs(me.x - lastX) < 0.02 && me.grounded) { if (++stuck > 4) { jump = true; stuck = 0; } } else stuck = 0;
    lastX = me.x;
    if (process.env.FG_TRACE) console.log(`    t${((Date.now() - t0) / 1000).toFixed(1)} me ${me.x.toFixed(1)},${me.y.toFixed(1)} g${me.grounded ? 1 : 0} foes ${foes.map((f) => f.x.toFixed(0) + ',' + f.y.toFixed(0)).join(' ')} dir ${dir} jump ${jump} atk ${attack}`);
    // a jump is a press: held 2 loops, then released 2 loops so the next one is a new press
    if (jump && jumpFor <= -2) jumpFor = 2;
    const jumpNow = jumpFor > 0; jumpFor = Math.max(-2, jumpFor - 1);
    // attack is tapped, not held: a press every other loop
    const atk = attack && (attackT++ % 2 === 0);
    if (spec) special++;
    if (touch && ctl) {
      const pts = [];
      if (dir && ctl.joy) pts.push([ctl.joy[0] + dir * 55, ctl.joy[1], 1]);
      if (atk && ctl.b[1]) pts.push([ctl.b[1][0], ctl.b[1][1], 2]);
      if (jumpNow && ctl.b[0]) pts.push([ctl.b[0][0], ctl.b[0][1], 3]);
      if (spec && ctl.b[2]) pts.push([ctl.b[2][0], ctl.b[2][1], 4]);
      // the joystick finger starts at the stick's centre, then slides: lift and press again when the direction flips
      if (dir && ctl.joy && ctl.lastDir !== dir) { await touch.send(pts.filter((p) => p[2] !== 1).concat([[ctl.joy[0], ctl.joy[1], 1]])); await sleep(30); }
      ctl.lastDir = dir;
      await touch.send(pts);
    } else {
      await setKey('KeyA', dir < 0); await setKey('KeyD', dir > 0);
      await setKey('KeyJ', atk); await setKey('Space', jumpNow); await setKey('KeyK', spec);
    }
    if (tag && shots < 1 && Date.now() - t0 > 9000 / scale) { shots++; await h.shot(`${tag}_fight`); }
    await sleep(90);
  }
}

// ------------------------------------------------------------------------------------------------ one quick-play match
async function quickMatch(page, h, k, opts = {}) {
  const tag = `m${String(k).padStart(2, '0')}`;
  const tStart = Date.now();
  const s0 = await h.until(() => { const d = window.fgDebug(); return d.match && (d.phase === 'searching' || d.phase === 'intro' || d.phase === 'match') ? d : null; }, 30000, null, 50);
  if (!s0) { check(`${tag}: matchmaking starts`, false, JSON.stringify(await h.ev(() => [window.fgDebug().screen, window.fgDebug().ui.map((u) => u.scene)]))); return null; }
  if (opts.shots) { await h.shot(`${tag}_searching`); }
  const vs = await h.until(() => (window.fgDebug().phase === 'intro' ? 1 : null), 15000, null, 60);
  if (vs && opts.shots) { await sleep(700); await h.shot(`${tag}_versus`); }
  const m = await h.until(() => { const d = window.fgDebug(); return d.phase === 'match' && d.tick > 2 ? { goal: d.match.goal, teams: d.match.teams, map: d.match.map, agents: d.match.agents.length } : null; }, 25000);
  if (!m) { check(`${tag}: match starts`, false); return null; }
  const r = await fight(page, h, { touch: opts.touch, scale: opts.scale || 1, tag: opts.shots ? tag : '' });
  if (r.timeout) check(`${tag}: match ends`, false, `still running after ${Math.round(r.ms / 1000)} s`);
  const over = await h.until(() => { const d = window.fgDebug(); return d.screen === 'gameover' && d.gameOver && (d.gameOver.phase === 'reward' || d.gameOver.phase === 'continue') ? d : null; }, 60000, null, 200);
  if (!over) { check(`${tag}: result screen`, false, JSON.stringify(await h.ev(() => [window.fgDebug().screen, window.fgDebug().gameOver && window.fgDebug().gameOver.phase]))); return null; }
  const rec = { k, mode: `${m.goal}/${m.teams}`, map: m.map, title: over.gameOver.title, trophies: over.gameOver.trophyText, stars: over.gameOver.starText,
    kills: over.lastMatchKills, realS: Math.round((Date.now() - tStart) / 1000), fpsMin: r.fps.length ? Math.min(...r.fps) : null,
    fpsAvg: r.fps.length ? Math.round(r.fps.reduce((a, b) => a + b, 0) / r.fps.length) : null, scale: opts.scale || 1, touch: !!opts.touch };
  const me = await h.ev(() => { const m2 = window.fgApp.lastMatch && window.fgApp.lastMatch.debug(); const a = m2 && m2.agents.find((x) => x.id === m2.local); return a ? { kills: a.kills, deaths: a.deaths } : null; });
  if (me) { rec.kills = me.kills; rec.deaths = me.deaths; }
  await sleep(1700);
  if (opts.shots) await h.shot(`${tag}_result`);
  let g = (await h.ev(() => window.fgDebug())).gameOver;
  if (g.openButton) {
    await h.clickAt(g.openButton);
    let box = await h.topIs('SceneReward', 5000);
    if (!box) { const g3 = (await h.ev(() => window.fgDebug())).gameOver; if (g3 && g3.openButton) await h.clickAt(g3.openButton); box = await h.topIs('SceneReward', 5000); }
    rec.fridge = await h.tapRewards(opts.shots ? `${tag}_fridge` : null);
    await sleep(1200);
  }
  g = (await h.ev(() => window.fgDebug())).gameOver;
  if (g && g.playButton) await h.clickAt(g.playButton);
  const menu = await h.until(() => window.fgDebug().screen === 'menu' && window.fgDebug().ui[0] && window.fgDebug().ui[0].scene === 'SceneMenu', 20000);
  if (!menu) check(`${tag}: back to the menu`, false, JSON.stringify(await h.ev(() => [window.fgDebug().screen, window.fgDebug().ui.map((u) => u.scene)])));
  await sleep(2600);   // trophies fly into the league button, league-up / pack popups
  for (let i = 0; i < 4; i++) {
    const u = await h.top();
    if (!u || u.scene === 'SceneMenu') break;
    rec.popups = (rec.popups || []).concat(u.scene);
    if (opts.shots || i === 0) await h.shot(`${tag}_popup_${u.scene}`);
    if (u.scene === 'SceneReward') await h.tapRewards(); else await h.back(u.scene);
  }
  const p = (await h.ev(() => window.fgDebug())).profile;
  rec.trophiesTotal = p.trophies; rec.coins = p.coins;
  report.matches.push(rec);
  console.log(`  ${tag} ${rec.mode} map ${rec.map}: ${rec.title} ${rec.trophies} trophies, k${rec.kills}/d${rec.deaths}, ${rec.realS} s${rec.fpsAvg ? `, fps ${rec.fpsMin}..${rec.fpsAvg}` : ''}${rec.popups ? ', popups ' + rec.popups.join(',') : ''}`);
  return rec;
}

// ------------------------------------------------------------------------------------------------ meta visits
async function visitMeta(page, h, round) {
  const tag = `meta${round}`;
  const dbg = () => h.ev(() => window.fgDebug());
  // trophy road: collect every reachable step
  if (await h.press('OpenLeague', 'SceneMenu')) {
    const lg = await h.topIs('SceneLeague');
    await sleep(1200);
    await h.shot(`${tag}_league`);
    for (let i = 0; i < 4; i++) {
      const u = await h.until(() => { const x = window.fgDebug().ui[0]; return x && x.scene === 'SceneLeague' ? x : null; }, 4000);
      const vp = page.viewportSize();
      const av = ((u && u.available) || []).filter((a) => a.pos[0] > 0 && a.pos[0] < vp.width);
      if (!av.length) break;
      await h.clickAt(av[0].pos);
      await h.tapRewards(i === 0 ? `${tag}_road_reward` : null);
      await sleep(600);
    }
    if (lg) await h.closeAll();
  }
  // fighters: upgrade the selected one when the button is there
  if (await h.press('OpenSkinCollection', 'SceneMenu', 'Collection')) {
    const col = await h.topIs('SceneSkinCollection');
    if (col) {
      await sleep(900);
      const sel = (await dbg()).profile.skinSelected;
      const cell = col.cells.find((c) => c.id === sel) || col.cells[0];
      await h.clickAt(cell.pos);
      const st = await h.topIs('SceneSkinStat', 6000);
      if (st) {
        await sleep(900);
        const a = (await dbg()).profile.skins.find((x) => x[0] === sel);
        if (st.upgrade) { await h.clickAt(st.upgrade); await sleep(1500); await h.tapRewards(); }
        const b = (await dbg()).profile.skins.find((x) => x[0] === sel);
        if (b && a && b[1] > a[1]) { note(`${tag}: upgraded skin ${sel} ${a[1]} -> ${b[1]}`); await h.shot(`${tag}_upgraded`); }
      }
    }
    await h.closeAll();
  }
  // shop: the free gift
  if (await h.press('OpenShop', 'SceneMenu')) {
    const sh = await h.topIs('SceneShop');
    await sleep(1200);
    if (round === 1) await h.shot(`${tag}_shop`);
    if (sh && sh.gifts && sh.gifts[0] && !sh.gifts[0].claimed) { await h.clickAt(sh.gifts[0].pos); await h.tapRewards(); }
    await h.closeAll();
  }
  if (round === 1) {
    for (const [m, s] of [['OpenVIP', 'SceneVIP'], ['OpenSettings', 'SceneSettings'], ['OpenLeaderboard', null], ['PrivateBattle', 'ScenePrivateBattle']]) {
      if (!(await h.press(m, 'SceneMenu'))) { check(`menu button ${m}`, false); continue; }
      await sleep(1300);
      await h.shot(`${tag}_${s || m}`);
      await h.closeAll();
    }
  }
  const u = await h.top();
  if (!u || u.scene !== 'SceneMenu') await h.closeAll();
}

// ------------------------------------------------------------------------------------------------ parts
async function desktop(browser, base) {
  console.log('== desktop 1280x720 (keyboard)');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const h = helpers(page, 'desk');
  await page.goto(base.replace('index.html', 'dev.html'));
  await h.ev(() => { localStorage.clear(); localStorage.setItem('fg-lang', 'English'); });
  const t0 = Date.now();
  await page.goto(`${base}?offline=1`);
  const intro = await h.until(() => window.fgDebug && window.fgDebug().screen === 'intro', 40000, null, 50);
  report.parts.loadMs = Date.now() - t0;
  if (intro) { await sleep(700); await h.shot('00_intro'); }
  // tutorial: walk to the dummies and hit them with the keyboard
  const tuto = await h.until(() => { const d = window.fgDebug(); return d && d.match && d.phase === 'match' && d.tick > 5 ? d : null; }, 40000);
  check('first launch opens the tutorial', !!tuto);
  await h.shot('01_tutorial');
  const tt = Date.now();
  const tr = await fight(page, h, { maxMs: 150000, tag: 'tuto' });
  const te = await h.until(() => (window.fgDebug().screen === 'tutoend' && window.fgDebug().ui[0] && window.fgDebug().ui[0].scene === 'SceneTutoEnd' ? window.fgDebug().ui[0] : null), 20000);
  check('tutorial finished by playing (5 dummies destroyed with the keyboard)', !!te && !tr.timeout, `${Math.round((Date.now() - tt) / 1000)} s`);
  if (!te) return page;
  await sleep(900);
  await h.shot('02_tutoend');
  if (te.field) {
    await h.clickAt(te.field);
    await sleep(300);
    await h.shot('02b_name_editing');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Tâm Playtest 2026');
    await page.keyboard.press('Enter');
    await sleep(400);
  }
  const nm = (await h.ev(() => window.fgDebug())).profile.name;
  check('nickname typed (trimmed to 15 characters like EditName)', nm === 'Tâm Playtest 20', JSON.stringify(nm));
  await h.press('Load', 'SceneTutoEnd');
  for (let k = 1; k <= MATCHES; k++) {
    if (k > 1) {
      const ok = await h.press('Play', 'SceneMenu');
      if (!ok) { check(`m${k}: BATTLE! on the menu`, false, JSON.stringify(await h.ev(() => window.fgDebug().ui.map((u) => u.scene)))); await h.closeAll(); if (!(await h.press('Play', 'SceneMenu'))) break; }
    }
    const rec = await quickMatch(page, h, k, { shots: k <= 3 || k === MATCHES, scale: k <= NORMAL ? 1 : 6 });
    if (!rec) { await h.closeAll(); continue; }
    if (k === 1) await h.shot('03_menu_after_first');
    if (k % 4 === 1) await visitMeta(page, h, Math.ceil(k / 4));
  }
  const p = (await h.ev(() => window.fgDebug())).profile;
  const lg = await h.ev(() => { const a = window.fgApp; const L = a.meta.db.leagues; let n = 'I'; for (const l of L) if (l.name && a.profile.trophies >= l.threshold) n = l.name; return n; });
  check('trophy road: league II or higher reached', p.trophies >= 20, `${p.trophies} trophies, league ${lg}`);
  report.parts.desktop = { trophies: p.trophies, league: lg, games: p.gameCount, coins: p.coins, gems: p.gems, skins: p.skins };
  // settings + languages: every language once on the menu and the settings popup
  if (await h.press('OpenSettings', 'SceneMenu')) {
    await h.topIs('SceneSettings');
    await sleep(800);
    await h.shot('settings_en');
    await h.closeAll();
  }
  await h.shot('99_menu_end');
  const errs = h.errors.filter((e) => !/AudioContext|autoplay/i.test(e));
  check('desktop: no console / page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  const audio = await h.ev(() => ({ played: window.fgDebug().audio.played, missing: window.fgDebug().engine.audioMissing }));
  check('desktop: sounds played, none missing', audio.played > 50 && !audio.missing.length, JSON.stringify(audio));
  await page.close();
}

async function phone(browser, base) {
  console.log('== phone landscape 844x390 (touch)');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const h = helpers(page, 'phone');
  const touch = await touchDevice(page);
  h.setTouch(touch);
  await page.goto(base.replace('index.html', 'dev.html'));
  await h.ev(() => { localStorage.clear(); localStorage.setItem('fg-lang', 'English'); });
  await page.goto(`${base}?offline=1`);
  await h.until(() => window.fgApp && window.fgApp.profile && window.fgApp.meta && window.fgDebug().phase === 'match', 40000);
  await h.shot('01_tutorial');
  const tr = await fight(page, h, { touch, maxMs: 150000, tag: 'tuto' });
  const te = await h.until(() => (window.fgDebug().ui[0] && window.fgDebug().ui[0].scene === 'SceneTutoEnd' ? window.fgDebug().ui[0] : null), 20000);
  check('phone: tutorial finished with the on-screen joystick and buttons', !!te && !tr.timeout);
  if (te) { await sleep(800); await h.shot('02_tutoend'); await h.press('Load', 'SceneTutoEnd'); }
  for (let k = 1; k <= 2; k++) {
    if (k > 1 && !(await h.press('Play', 'SceneMenu'))) { check('phone: BATTLE!', false); break; }
    await quickMatch(page, h, k, { touch, shots: true });
  }
  await h.shot('03_menu');
  for (const [m, s] of [['OpenShop', 'SceneShop'], ['OpenSkinCollection', 'SceneSkinCollection'], ['OpenLeague', 'SceneLeague'], ['OpenSettings', 'SceneSettings']]) {
    if (!(await h.press(m, 'SceneMenu'))) continue;
    await h.topIs(s);
    await sleep(1300);
    await h.shot(`menu_${s}`);
    await h.closeAll();
  }
  const errs = h.errors.filter((e) => !/AudioContext|autoplay/i.test(e));
  check('phone: no console / page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();
}

async function portrait(browser, base) {
  console.log('== phone portrait 390x844');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const h = helpers(page, 'portrait');
  await page.goto(`${base}?offline=1`);
  await sleep(6000);
  const rot = await h.ev(() => { const r = document.getElementById('rotate'); return r ? getComputedStyle(r).display : 'none'; });
  check('portrait phone shows the rotate hint', rot !== 'none', rot);
  await h.shot('01_portrait');
  await ctx.close();
}

async function party(browser, base) {
  console.log('== private battle, two pages');
  const net = process.env.FG_NET === 'loop' ? '&net=loop' : '';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const mk = async (tag, name, skin) => {
    const page = await ctx.newPage();
    const h = helpers(page, tag);
    await page.goto(base.replace('index.html', 'dev.html'));
    await page.goto(`${base}?intro=0${net}`);
    await h.until(() => window.fgApp && window.fgApp.profile && window.fgApp.meta, 30000);
    await h.ev(([n, s]) => { const a = window.fgApp; a.meta.completeTutorial(a.profile, new Date()); a.profile.name = n; a.profile.skinSelected = s; if (!a.profile.skins.some((x) => x.id === s)) a.profile.skins.push({ id: s, level: 1, tokens: 0 }); a.save(); }, [name, skin]);
    return { page, h };
  };
  // both pages share localStorage (one context): the second page is set up after the first reloaded its profile
  const A = await mk('hostA', 'HostPage', 1);
  await A.page.goto(`${base}?intro=0${net}`);
  await A.h.topIs('SceneMenu', 30000);
  const B = await mk('guestB', 'GuestPage', 1);
  await B.page.goto(`${base}?intro=0${net}`);
  await B.h.topIs('SceneMenu', 30000);
  await A.page.bringToFront();
  await A.h.press('PrivateBattle', 'SceneMenu');
  await A.h.topIs('ScenePrivateBattle');
  await sleep(600);
  await A.h.press('OnClickCreate', 'ScenePrivateBattle');
  const lobbyA = await A.h.until(() => { const u = window.fgDebug().ui[0]; return u && u.scene === 'ScenePrivateLobby' && u.code ? u : null; }, 30000);
  check('party: host gets a room code', !!lobbyA, lobbyA ? lobbyA.code : JSON.stringify(await A.h.top()));
  if (!lobbyA) return;
  await A.h.shot('lobby_host');
  await B.page.bringToFront();
  await B.h.press('PrivateBattle', 'SceneMenu');
  await B.h.topIs('ScenePrivateBattle');
  await sleep(500);
  await B.h.press('OnClickJoin', 'ScenePrivateBattle');
  const j = await B.h.topIs('ScenePrivateJoin');
  if (j && j.field) { await B.h.clickAt(j.field); await sleep(300); await B.page.keyboard.type(lobbyA.code.toLowerCase()); await B.page.keyboard.press('Enter'); await sleep(300); }
  await B.h.press('OnClickJoin', 'ScenePrivateJoin');
  const lobbyB = await B.h.until(() => { const u = window.fgDebug().ui[0]; return u && u.scene === 'ScenePrivateLobby' && u.players >= 2 ? u : null; }, 30000);
  check('party: guest joins by typing the code', !!lobbyB, JSON.stringify(await B.h.top()));
  await B.h.shot('lobby_guest');
  const two = await A.h.until(() => { const u = window.fgDebug().ui[0]; return u && u.scene === 'ScenePrivateLobby' && u.players >= 2 ? u : null; }, 15000);
  check('party: host sees 2 players', !!two);
  await A.page.bringToFront();
  await A.h.press('OnClickLaunch', 'ScenePrivateLobby');
  for (let round = 1; round <= 2; round++) {
    const started = await Promise.all([A, B].map((P) => P.h.until(() => { const d = window.fgDebug(); return d.match && d.phase === 'match' && d.tick > 2 ? d.match.agents.filter((a) => !a.bot).length : null; }, 30000)));
    check(`party round ${round}: both pages in the match with 2 humans`, started.every((n) => n === 2), JSON.stringify(started));
    if (!started.every(Boolean)) return;
    await A.h.shot(`round${round}_host_match`);
    // both fight; the host drives at scale 1, the guest plays its own keys in the background tab
    // each page reads its own result screen as soon as its match ends (the friend-room result only stays ~4 s)
    const res = await Promise.all([A, B].map(async (P, i) => {
      await fight(P.page, P.h, { maxMs: 200000, tag: i ? '' : `round${round}` });
      return P.h.until(() => { const d = window.fgDebug(); return d.screen === 'gameover' && d.gameOver ? { ...d.gameOver, teams: d.match ? d.match.teams : null } : null; }, 30000, null, 60);
    }));
    check(`party round ${round}: result on both pages, no trophies (friend room)`, res.every((g) => g && g.friend), JSON.stringify(res.map((g) => g && { t: g.title, f: g.friend, tr: g.trophies, teams: g.teams })));
    // a draw is a draw on every page; the guest used to read DRAW off its late snapshot while the host showed VICTORY
    // team modes: a draw is a draw on every page (FFA ranks 2-3 are a DRAW by GameOver's rule, so only team modes)
    if (res.every(Boolean) && res[0].teams !== 0) check(`party round ${round}: both pages agree on draw / no draw (team mode)`, (res[0].title === 'DRAW') === (res[1].title === 'DRAW'), res.map((g) => g.title).join(' / '));
    await sleep(1500);
    await A.h.shot(`round${round}_host_result`);
    const back = await Promise.all([A, B].map((P) => P.h.until(() => { const u = window.fgDebug().ui[0]; return u && u.scene === 'ScenePrivateLobby' && u.players >= 2 ? u : null; }, 20000)));
    check(`party round ${round}: both pages back in the same room's lobby (ContinueFriendRoom)`, back.every(Boolean) && back[0].code === back[1].code, JSON.stringify(back.map((u) => u && u.code)));
    if (!back.every(Boolean)) return;
    await sleep(800);
    await B.h.shot(`round${round}_guest_lobby_again`);
    if (round === 1) { await A.page.bringToFront(); await A.h.press('OnClickLaunch', 'ScenePrivateLobby'); }
  }
  for (const P of [A, B]) {
    const errs = P.h.errors.filter((e) => !/AudioContext|autoplay|\[online\]/i.test(e));
    check('party: no console / page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  }
  await ctx.close();
}

if (require.main !== module) module.exports = { fight, helpers, touchDevice };
else (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = process.env.FG_URL ? null : await serve();
  const base = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const budget = Number(process.env.FG_TIMEOUT || 3600) * 1000;
  const killer = setTimeout(() => { console.log(`  FAIL timeout (${budget / 1000} s)`); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1)); process.exit(2); }, budget);
  try {
    for (const part of PARTS) {
      try {
        if (part === 'desktop') await desktop(browser, base);
        else if (part === 'phone') await phone(browser, base);
        else if (part === 'portrait') await portrait(browser, base);
        else if (part === 'party') await party(browser, base);
      } catch (e) { check(`${part} crashed`, false, String(e && e.stack || e).slice(0, 400)); }
    }
  } finally {
    clearTimeout(killer);
    report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed; ${report.matches.length} matches; report ${path.relative(ROOT, path.join(OUT, 'report.json'))}`);
  process.exit(fail ? 1 : 0);
})();
