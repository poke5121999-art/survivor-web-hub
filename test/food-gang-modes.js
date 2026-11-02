#!/usr/bin/env node
/* Food Gang modes (owner request 2026-11-02): Play -> mode picker over Food Gang's 7 original modes (GameMode.json
 * m_randomGameModes) + Random (the original deck draw), and two web-only objective modes on Food Gang's own maps and
 * art, rules borrowed from SquadBlast: Push the Fridge (payload) and Defend the Fridge (attack / defend).
 *   node part   rules: cart pushed only when uncontested, finish line wins, time-out by side; fridge damaged by
 *               attackers only (bullets, melee), breaking it wins, time-out = defenders; bot matches on every map
 *               end without NaN and both sides win; the snapshot codec carries the objective globals
 *   browser     BATTLE! opens the picker (10 choices, rule line), Back returns to the menu, Push / Defend the Fridge
 *               start the right match with the fridge drawn, Random keeps an original mode; a short siege at x4 ends
 *   node test/food-gang-modes.js [--node | --browser]     FG_URL=<Pages>/games/food-gang/index.html
 * Shots: shots/food-gang/modes/. Exit 1 on any failed check.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'food-gang');
const OUT = path.join(ROOT, 'shots', 'food-gang', 'modes');
const argv = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const imp = (rel) => import(pathToFileURL(path.join(GAME, rel)).href);
let pass = 0, fail = 0;
const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; fails.push(name); }
};
const HARD = setTimeout(() => { console.log('FAIL hard time limit (15 min)'); process.exit(2); }, 15 * 60e3);

async function partNode() {
  console.log('-- node: rules');
  const S = await imp('js/sim/index.js');
  const O = await imp('js/sim/Systems/Objectives.js');
  const codec = await imp('js/net/codec.js');
  const db = S.GameDb.load(fs.readFileSync(path.join(GAME, 'data', 'simdata.json'), 'utf8'));
  const humans = (goal, map, extra = {}) => {
    const st = S.createMatchSetup({ seed: 9, mapIndex: map, goal, teams: S.TeamConfig.TwoVersusTwo, startPlaying: true, ...extra });
    for (let sl = 0; sl < 4; sl++) S.addSlot(st, sl, [6, 1, 13, 9][sl], 10, false);
    const m = new S.Match(db);
    return { m, s: m.create(st) };
  };
  const NONE = [];
  const place = (s, id, p) => { const a = s.agents[id]; a.pos = { x: p.x, y: p.y }; a.velocity = { x: 0, y: 0 }; };

  // Push the Fridge
  {
    const { m, s } = humans(S.GoalType.Payload, 0);
    check('payload: objective fields exist only in objective matches', s.cartT === 0 && s.cartPush === 0 && !('objHp' in s));
    const P = O.cartPath(0);
    for (let i = 0; i < 60; i++) { place(s, 0, O.cartPos(0, s.cartT)); m.step(s, NONE); }
    const t1 = s.cartT;
    check('payload: one team-1 fighter at the cart pushes it toward team 2 (+x)', t1 > 0.5 && s.cartPush === 1, `t ${t1.toFixed(2)} push ${s.cartPush}`);
    for (let i = 0; i < 60; i++) { const p = O.cartPos(0, s.cartT); place(s, 0, p); place(s, 2, p); m.step(s, NONE); }
    check('payload: contested (one of each team) it does not move', Math.abs(s.cartT - t1) < 0.05 && s.cartPush === 3, `t ${s.cartT.toFixed(2)} push ${s.cartPush}`);
    const t2 = s.cartT;
    for (let i = 0; i < 60; i++) { const p = O.cartPos(0, s.cartT); place(s, 2, p); place(s, 3, p); place(s, 0, { x: -20, y: 0 }); m.step(s, NONE); }
    check('payload: two team-2 fighters push it back faster than one', t2 - s.cartT > (t1 * 1.2), `back ${(t2 - s.cartT).toFixed(2)} vs ${t1.toFixed(2)}`);
    let n = 0;
    while (s.phase !== S.GamePhase.GameOver && n++ < 60 * 60) { const p = O.cartPos(0, s.cartT); place(s, 0, p); place(s, 1, p); place(s, 2, { x: -20, y: 0 }); place(s, 3, { x: -20, y: 0 }); m.step(s, NONE); }
    check('payload: over the finish line (75 % to the end) team 1 wins, no time-out', s.phase === S.GamePhase.GameOver && s.winnerTeam === 1 && !s.timeOut && s.cartT >= P.goal,
      `winner ${s.winnerTeam} t ${s.cartT.toFixed(2)} / ${P.goal.toFixed(2)} after ${(n / 60).toFixed(1)} s`);
    const ev = m.drainEvents().filter((e) => e.type === O.OBJECTIVE_EVENT.CartMoved).length;
    check('payload: CartMoved events when the pushing side changes', ev >= 3, `${ev}`);
    const a = humans(S.GoalType.Payload, 1); a.s.cartT = -3;
    check('payload: time-out goes to the side the cart is on (draw in the middle)', S.GameRules.resolveTimerWinner(a.s) === 2 && (a.s.cartT = 0, S.GameRules.resolveTimerWinner(a.s) === 0) && (a.s.cartT = 4, S.GameRules.resolveTimerWinner(a.s) === 1));
    check('payload: 120 s timer', a.s.timerMax === 120, `${a.s.timerMax}`);
  }
  // Defend the Fridge
  {
    const { m, s } = humans(S.GoalType.Siege, 0, { bossOnLeft: true });
    const def = O.defenderTeam(s), h = O.houseRect(s);
    check('siege: bossOnLeft -> team 1 defends a fridge on the left', def === 1 && h.cx < 0 && s.objHp === O.HOUSE_HP && !('cartT' in s), `def ${def} x ${h.cx}`);
    check('siege: 90 s timer, time-out = defenders', s.timerMax === 90 && S.GameRules.resolveTimerWinner(s) === 1);
    // a defender (slot 0, NORI melee) striking the fridge does nothing; an attacker (slot 2, NORI too) breaks it
    const strike = (id, ticks) => {
      for (let i = 0; i < ticks; i++) {
        const a = s.agents[id];
        place(s, id, { x: h.cx + O.HOUSE_HALF.x + 1.2, y: 0 }); a.facingLeft = true;
        const inp = []; inp[a.slot] = S.InputFrame.make(-1, i % 150 < 2 ? S.InputButtons.Action : 0);
        m.step(s, inp);
        if (s.phase === S.GamePhase.GameOver) return;
      }
    };
    strike(0, 400);
    check('siege: defenders cannot damage their own fridge', s.objHp === O.HOUSE_HP, `${s.objHp}`);
    s.agents[2].skin = s.agents[0].skin; s.agents[2].actionRef = s.agents[0].actionRef; s.agents[2].specialRef = s.agents[0].specialRef;
    const hp0 = s.objHp;
    strike(2, 400);
    const hits = m.drainEvents().filter((e) => e.type === O.OBJECTIVE_EVENT.ObjectiveHit);
    check('siege: an attacker\'s melee hits damage the fridge (ObjectiveHit events)', s.objHp < hp0 && hits.length > 0, `hp ${hp0} -> ${s.objHp}, ${hits.length} hits`);
    let n = 0;
    while (s.phase !== S.GamePhase.GameOver && n++ < 200) strike(2, 150);
    check('siege: breaking the fridge wins for the attackers (no time-out)', s.phase === S.GamePhase.GameOver && s.winnerTeam === 2 && !s.timeOut && s.objHp === 0, `winner ${s.winnerTeam} hp ${s.objHp}`);
  }
  // bots on every map
  for (const [name, goal] of [['payload', S.GoalType.Payload], ['siege', S.GoalType.Siege]]) {
    const wins = { 0: 0, 1: 0, 2: 0, att: 0, def: 0, obj: 0 };
    let nan = 0, n = 0, unended = 0;
    for (let map = 0; map < 3; map++) for (let k = 0; k < 6; k++) {
      const seed = 100 + map * 37 + k;
      const st = S.createMatchSetup({ seed, mapIndex: map, goal, teams: S.TeamConfig.TwoVersusTwo, bossOnLeft: (k & 1) === 0, startPlaying: true });
      for (let sl = 0; sl < 4; sl++) S.addSlot(st, sl, 1 + ((seed + sl * 5) % 16), 10, true, 0.6);
      const m = new S.Match(db), s = m.create(st);
      while (s.phase !== S.GamePhase.GameOver && s.tick < 60 * 200) {
        m.step(s, null); m.drainEvents();
        for (const a of s.agents) if (Number.isNaN(a.pos.x) || Number.isNaN(a.pos.y)) nan++;
      }
      if (Number.isNaN(s.cartT) || Number.isNaN(s.objHp)) nan++;
      if (s.phase !== S.GamePhase.GameOver) unended++;
      n++; wins[s.winnerTeam]++;
      if (!s.timeOut) wins.obj++;
      if (goal === S.GoalType.Siege) wins[s.winnerTeam === O.defenderTeam(s) ? 'def' : 'att']++;
    }
    check(`${name}: ${n} bot matches end, no NaN`, unended === 0 && nan === 0, `unended ${unended} NaN ${nan}`);
    if (goal === S.GoalType.Payload) check('payload: both teams win some bot matches', wins[1] > 0 && wins[2] > 0, JSON.stringify(wins));
    else check('siege: attackers and defenders both win some bot matches', wins.att > 0 && wins.def > 0 && wins.obj > 0, JSON.stringify(wins));
  }
  // codec
  {
    const { m, s } = humans(S.GoalType.Payload, 2);
    for (let i = 0; i < 30; i++) { s.agents[0].pos = O.cartPos(2, s.cartT); m.step(s, NONE); }
    const cap = codec.capture(s);
    const { bytes } = codec.encodeSnapshot({ seq: 1, baseSeq: 0, ackInput: 0, echo: 0, hold: 0 }, cap, null, []);
    const d = codec.decodeSnapshot(bytes, () => null);
    const o = codec.unvec(codec.GLOBAL, S.createMatchState(), d.snap.g);
    check('codec: objective globals survive the wire (protocol 2)', codec.PROTOCOL === 2 && Math.abs(o.cartT - s.cartT) < 0.01 && o.cartPush === s.cartPush, `${o.cartT} vs ${s.cartT}`);
    const g = humans(S.GoalType.Siege, 0).s;
    const o2 = codec.unvec(codec.GLOBAL, S.createMatchState(), codec.decodeSnapshot(codec.encodeSnapshot({ seq: 1, baseSeq: 0, ackInput: 0, echo: 0, hold: 0 }, codec.capture(g), null, []).bytes, () => null).snap.g);
    check('codec: fridge hp survives the wire', o2.objHp === g.objHp && o2.objHpMax === g.objHpMax, `${o2.objHp}/${o2.objHpMax}`);
  }
}

function serve() {
  return http.createServer((q, s) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(ROOT)) { s.writeHead(403); s.end(); return; }
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(d); });
  });
}

async function partBrowser() {
  console.log('-- browser');
  const { chromium } = require(process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  let server = null, url = process.env.FG_URL;
  if (!url) { server = serve(); await new Promise((r) => server.listen(0, r)); url = `http://localhost:${server.address().port}/games/food-gang/index.html`; }
  const browser = await chromium.launch({ args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (q = '') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const ev = (f, a) => page.evaluate(f, a);
    const until = async (f, ms, a) => { const end = Date.now() + ms; for (;;) { const v = await ev(f, a).catch(() => null); if (v) return v; if (Date.now() > end) return null; await sleep(100); } };
    await page.goto(url + q);
    await until(() => window.fgApp && window.fgApp.profile && window.fgDebug().screen !== 'boot', 60000);
    await ev(() => { const a = window.fgApp; a.meta.completeTutorial(a.profile, new Date()); a.profile.gameCount = Math.max(3, a.profile.gameCount); a.save(); try { localStorage.setItem('fg-lang', 'English'); } catch (e) { /* */ } });
    await page.reload();
    return { ctx, page, errors, ev, until };
  };
  const top = (P) => P.ev(() => window.fgDebug().ui[0]);
  const topIs = (P, scene, ms = 15000) => P.until((sc) => { const u = window.fgDebug().ui; return u[0] && u[0].scene === sc ? u[0] : null; }, ms, scene);
  const button = (P, method, scene) => P.ev(([m, s]) => (window.fgButtons(s) || []).find((x) => x.method.split(',').includes(m)), [method, scene]);
  const click = async (P, pos) => { await P.page.mouse.click(pos[0], pos[1]); await sleep(250); };
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const P = await open();
    try {
      await topIs(P, 'SceneMenu', 60000);
      await sleep(1200);
      await click(P, (await button(P, 'Play', 'SceneMenu')).pos);
      let pk = await topIs(P, 'ScenePrivateConfiguration');
      await sleep(900);
      await P.page.screenshot({ path: path.join(OUT, 'picker.png') });
      check('BATTLE! opens the mode picker', !!pk && pk.count === 10 && !!pk.modeButton && !!pk.battleButton, pk ? JSON.stringify({ mode: pk.mode, count: pk.count }) : 'no picker');
      // cycle through every choice, reading the rule line
      const seen = [];
      for (let i = 0; i < 10; i++) { const u = await top(P); seen.push(`${u.choice}:${u.mode}`); if (!u.desc || u.desc.startsWith('web.')) seen.push('NO-DESC'); await click(P, u.modeButton); }
      console.log('  choices ' + seen.join(' | '));
      const names = seen.join('|');
      check('the picker lists Random, the 7 original modes and the 2 fridge modes, each with a rule line', !names.includes('NO-DESC')
        && ['Random Mode', 'Gang Battle', 'Food Battle', 'Fast Gang', 'Fast Food', 'Last Gang Standing', 'Last Food Standing', 'Boss Rush', 'Push the Fridge', 'Defend the Fridge'].every((n) => names.includes(n)), names);
      // Back -> menu, nothing played
      await click(P, (await top(P)).back);
      check('Back returns to the menu without playing', !!(await topIs(P, 'SceneMenu', 8000)) && (await P.ev(() => window.fgDebug().phase)) !== 'match');
      // Push the Fridge
      await sleep(600);
      await click(P, (await button(P, 'Play', 'SceneMenu')).pos);
      pk = await topIs(P, 'ScenePrivateConfiguration');
      for (let i = 0; i < 12 && (await top(P)).mode !== 'Push the Fridge'; i++) await click(P, (await top(P)).modeButton);
      await click(P, (await top(P)).battleButton);
      const m = await P.until(() => { const d = window.fgDebug(); return d && d.phase === 'match' && d.match ? d.match : null; }, 60000);
      await sleep(6000);
      const d = await P.ev(() => window.fgDebug().match);
      await P.page.screenshot({ path: path.join(OUT, 'payload.png') });
      check('Push the Fridge starts a payload match (2v2) with the fridge drawn', !!m && d.goal === 5 && d.teams === 2 && d.objective && typeof d.objective.cartT === 'number',
        d ? JSON.stringify({ goal: d.goal, teams: d.teams, objective: d.objective }) : 'no match');
      check('the choice is remembered', (await P.ev(() => localStorage.getItem('fg-mode-choice'))) === '8');
      check('no page errors (picker + payload)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    } finally { await P.ctx.close(); }
    // Defend the Fridge, direct mode at x4 to its end
    const Q = await open('?mode=siege&map=pantry&seed=11&timescale=4');
    try {
      const m = await Q.until(() => window.fgDebug && window.fgDebug().phase === 'match' && window.fgDebug().match, 60000);
      await sleep(5000);
      await Q.page.screenshot({ path: path.join(OUT, 'siege.png') });
      const d0 = await Q.ev(() => window.fgDebug().match);
      check('Defend the Fridge starts a siege match with the fridge and its life bar', !!m && d0.goal === 6 && d0.objective && d0.objective.hp > 0, JSON.stringify(d0 && d0.objective));
      const end = await Q.until(() => { const d = window.fgDebug(); return d.match && d.match.simPhase === 'gameover' ? d.match : null; }, 60000);
      check('the siege ends (fridge broken or time-out) with a winner team', !!end && end.winnerTeam > 0, end ? JSON.stringify({ winner: end.winnerTeam, timeOut: end.timeOut, obj: end.objective }) : 'not ended');
      await sleep(2500);
      await Q.page.screenshot({ path: path.join(OUT, 'siege-end.png') });
      check('no page errors (siege)', Q.errors.length === 0, Q.errors.slice(0, 3).join(' | '));
    } finally { await Q.ctx.close(); }
    // Random keeps an original mode
    const R = await open();
    try {
      await topIs(R, 'SceneMenu', 60000);
      await R.ev(() => localStorage.setItem('fg-mode-choice', '0'));
      await sleep(800);
      await click(R, (await button(R, 'Play', 'SceneMenu')).pos);
      const pk = await topIs(R, 'ScenePrivateConfiguration');
      await click(R, pk.battleButton);
      const m = await R.until(() => { const d = window.fgDebug(); return d && d.phase === 'match' && d.match ? d.match : null; }, 60000);
      check('Random plays one of the original modes (goal 0..3)', !!m && m.goal >= 0 && m.goal <= 3, m ? `goal ${m.goal} teams ${m.teams}` : 'no match');
      check('no page errors (random)', R.errors.length === 0, R.errors.slice(0, 3).join(' | '));
    } finally { await R.ctx.close(); }
    // online (loopback transport): two pages that both pick Push the Fridge share one quick room; the guest replays
    // the host's payload match (ClientRunner) and sees the same fridge position (objective globals in the snapshot)
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      const mk = async (name) => {
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
        const ev = (f, a) => page.evaluate(f, a);
        const until = async (f, ms) => { const end = Date.now() + ms; for (;;) { const v = await ev(f).catch(() => null); if (v) return v; if (Date.now() > end) return null; await sleep(150); } };
        await page.goto(url + '?intro=0&net=loop');
        await until(() => window.fgApp && window.fgApp.profile && window.fgApp.meta, 30000);
        await ev((n) => { const a = window.fgApp; a.meta.completeTutorial(a.profile, new Date()); a.profile.gameCount = Math.max(3, a.profile.gameCount); a.profile.name = n; a.save(); localStorage.setItem('fg-mode-choice', '8'); localStorage.setItem('fg-lang', 'English'); }, name);
        await page.goto(url + '?intro=0&net=loop');
        await until(() => { const u = window.fgDebug && window.fgDebug().ui; return u && u[0] && u[0].scene === 'SceneMenu'; }, 30000);
        return { page, ev, until };
      };
      const A = await mk('HostPage'), B = await mk('GuestPage');
      const go = async (X) => {
        await X.page.bringToFront();
        const b = await X.ev(() => (window.fgButtons('SceneMenu') || []).find((x) => x.method.split(',').includes('Play')));
        await X.page.mouse.click(b.pos[0], b.pos[1]);
        const pk = await X.until(() => { const u = window.fgDebug().ui[0]; return u && u.scene === 'ScenePrivateConfiguration' ? u : null; }, 15000);
        await sleep(500);
        await X.page.mouse.click(pk.battleButton[0], pk.battleButton[1]);
        return pk.mode;
      };
      const ma = await go(A); await sleep(1500); const mb = await go(B);
      const inMatch = (X) => X.until(() => { const a = window.fgApp, m = a.match; return m && m.runner && window.fgDebug().phase === 'match' ? { goal: m.runner.state.goal, client: !!m.runner.isClient, humans: m.runner.state.agents.filter((x) => !x.isBot).length } : null; }, 60000);
      const [ra, rb] = await Promise.all([inMatch(A), inMatch(B)]);
      check('online: both pages picked Push the Fridge and play one payload match (host + ClientRunner guest)', ma === 'Push the Fridge' && mb === ma && ra && rb && ra.goal === 5 && rb.goal === 5 && ra.client !== rb.client && ra.humans === 2,
        JSON.stringify({ ma, mb, ra, rb }));
      await sleep(8000);
      const cart = async (X) => X.ev(() => { const s = window.fgApp.match.runner.state; return { t: s.cartT || 0, tick: s.tick }; });
      const [ca, cb] = await Promise.all([cart(A), cart(B)]);
      check('online: the guest sees the host\'s fridge position (snapshot carries cartT)', Math.abs(ca.t - cb.t) < 1.2 && (ca.t !== 0 || cb.t !== 0),
        `host ${ca.t.toFixed(2)} @${ca.tick}, guest ${cb.t.toFixed(2)} @${cb.tick}`);
      check('online: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } catch (e) { check('browser run', false, String(e && e.stack || e)); }
  await browser.close();
  if (server) server.close();
}

(async () => {
  try {
    if (!argv.includes('--browser')) await partNode();
    if (!argv.includes('--node')) await partBrowser();
  } catch (e) { check('run', false, String(e && e.stack || e)); }
  clearTimeout(HARD);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failed:\n  ' + fails.join('\n  '));
  process.exit(fail ? 1 : 0);
})();
