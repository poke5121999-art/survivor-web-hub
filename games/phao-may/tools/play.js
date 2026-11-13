// Plays Pháo Mây in headless Chrome and asserts match behaviour on the real page.
// Usage: node games/phao-may/tools/play.js   (PM_BASE=https://... to test a deployed copy)
'use strict';
const { session, open, checker, CHK, fs, path } = require('./lib.js');
const check = checker();
const VP = { width: 640, height: 360 };
const Q = 'noaudio=1&nogov=1&manual=1&q=low';

session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });
  {
    const { page, problems, close } = await open(br, base, Q + '&autostart=1&seed=7', VP);
    const ev = (code) => page.evaluate(code);
    check(await ev('window.__G.state') === 'playing' && await ev('window.__G.sim.phase') === 'turn', 'autostart opens a match on the player turn');
    check(await ev('!window.__G.sim.active.ai && window.__G.sim.active.team === 0'), 'the player unit acts first');

    const shot = await ev(`(() => { const G = window.__G, s = G.sim, u = s.active; s.wind = 0;
      const pred = PM.Sim.trace(s, u, u.shots[0], 1, 60, 42).impacts[0];
      const booms = []; G.bus.on('sim:boom', (e) => booms.push(e));
      const solidBefore = s.terrain.solid(pred.x, pred.y - 1);
      __fire({ angle: 60, power: 42, shot: 0, facing: 1 }); __sim(6);
      return { pred, boom: booms[0], solidBefore, solidAfter: s.terrain.solid(pred.x, pred.y - 1), phase: s.phase }; })()`);
    check(shot.boom && Math.hypot(shot.boom.x - shot.pred.x, shot.boom.y - shot.pred.y) < 0.05, `scripted shot lands where the ballistics predicted (${shot.pred.x.toFixed(1)}, ${shot.pred.y.toFixed(1)})`);
    check(shot.solidBefore && !shot.solidAfter, 'the impact leaves a hole in the terrain');
    check(await ev('window.__G.terrainMesh && window.__G.sim.terrain.changes.length === 0'), 'the terrain mesh consumed the crater');

    const wind = await ev(`(() => { const s = window.__G.sim, u = s.units[0]; const at = (w) => { s.wind = w; return PM.Sim.trace(s, u, u.shots[0], 1, 60, 42).impacts[0].x; };
      const r = [at(-8), at(0), at(8)]; s.wind = 0; return r; })()`);
    check(wind[0] < wind[1] - 4 && wind[2] > wind[1] + 4, `wind bends the shot (${wind.map((x) => x.toFixed(1)).join(' < ')})`);

    const fall = await ev(`(() => { const s = window.__G.sim, v = s.units[1], y0 = v.y; s.terrain.carve(v.x, v.y - 2, 4); __sim(2.5); return { y0, y: v.y, grounded: v.grounded, alive: v.alive }; })()`);
    check(fall.alive && fall.grounded && fall.y < fall.y0 - 2, `a unit falls into a hole dug under it (${fall.y0.toFixed(1)} -> ${fall.y.toFixed(1)})`);

    const hud = await ev(`(() => { const q = (s) => document.querySelector(s); return { wind: q('#windbox .val').textContent, tags: document.querySelectorAll('.tag').length, shots: document.querySelectorAll('.shot').length, order: document.querySelectorAll('#order > div').length }; })()`);
    check(hud.tags === 2 && hud.shots === 3 && hud.order >= 2, `HUD shows unit tags, three shot cards and the turn order (${JSON.stringify(hud)})`);
    await page.screenshot({ path: path.join(CHK, 'play-match.png') });
    const errs = (await ev('window.__errors')).concat(problems);
    check(errs.length === 0, 'no errors in the scripted match' + (errs.length ? ': ' + errs.join(' | ').slice(0, 600) : ''));
    await close();
  }

  {
    const { page, problems, close } = await open(br, base, Q + '&autostart=1&seed=11&ai=hard', VP);
    const ev = (code) => page.evaluate(code);
    const order = await ev(`(() => { const s = window.__G.sim, first = s.active.id; s.skip(); __sim(3); const a = s.active.id, d0 = s.units[first].delay;
      return { first, next: a, delay: d0 }; })()`);
    check(order.next !== order.first && order.delay > 0, `after a skip the other unit acts and the skipper carries delay ${Math.round(order.delay)}`);
    const ai = await ev(`(() => { const s = window.__G.sim, me = s.units[0], hp0 = me.hp; let hits = 0, shots = 0;
      for (let k = 0; k < 6 && s.phase !== 'over'; k++) { const before = me.hp; if (s.active.ai) { __sim(14); shots++; if (me.hp < before) hits++; } else { s.skip(); __sim(2.5); } }
      return { hits, shots, hp0, hp: me.hp, phase: s.phase }; })()`);
    check(ai.shots >= 2 && ai.hits >= ai.shots - 1, `hard AI hits a standing target (${ai.hits}/${ai.shots} shots, hp ${ai.hp0} -> ${ai.hp})`);
    const errs = (await ev('window.__errors')).concat(problems);
    check(errs.length === 0, 'no errors against the hard AI' + (errs.length ? ': ' + errs.join(' | ').slice(0, 600) : ''));
    await close();
  }

  for (const level of ['easy', 'medium', 'hard']) {
    const { page, problems, close } = await open(br, base, Q + `&autostart=1&auto=1&seed=5&ai=${level}`, VP);
    const r = await page.evaluate(`(() => { const s = window.__G.sim; let guard = 0; while (s.phase !== 'over' && guard++ < 60) __sim(20); __tick(120); return { phase: s.phase, turns: s.turnN, winner: s.winner, result: !!document.querySelector('.result') }; })()`);
    check(r.phase === 'over', `AI ${level} plays a full match on the page to the end (turns=${r.turns}, winner=${r.winner})`);
    const errs = (await page.evaluate('window.__errors')).concat(problems);
    check(errs.length === 0, `no errors in the ${level} match` + (errs.length ? ': ' + errs.join(' | ').slice(0, 600) : ''));
    await close();
  }

  {
    const { page, problems, close } = await open(br, base, Q, VP);
    const ev = (code) => page.evaluate(code);
    check(await ev('!!document.querySelector(".title-screen") && window.__G.demo === true'), 'the title screen opens over a demo match');
    await page.click('[data-go=quick]');
    check(await ev('document.querySelectorAll(".card").length >= 2'), 'quick match lists the units');
    await page.click('[data-start]');
    await page.waitForFunction('window.__G.state === "playing" && window.__G.demo === false', null, { timeout: 60000 });
    check(await ev('!window.__G.sim.units[0].ai && window.__G.sim.units[0].name === "Bạn"'), 'starting a quick match puts the player in team 0');
    await ev('__tick(20)');
    const moved = await ev(`(() => { const G = window.__G, s = G.sim; let g = 0; while ((s.phase !== 'turn' || s.active.ai) && g++ < 40) __sim(2); __tick(2); const u = s.active, x0 = u.x, a0 = u.angle;
      G.input.hold('right', true); G.input.hold('up', true); __tick(40); G.input.hold('right', false); G.input.hold('up', false);
      G.input.hold('fire', true); __tick(50); G.input.hold('fire', false); __tick(3);
      return { dx: u.x - x0, da: u.angle - a0, fuel: u.fuel, phase: s.phase, last: u.lastPower }; })()`);
    check(Math.abs(moved.dx) > 1 && moved.da > 5 && moved.phase !== 'turn' && moved.last > 20, 'keyboard input walks, raises the barrel and fires a charged shot ' + JSON.stringify(moved));
    const over = await ev(`(() => { const s = window.__G.sim; for (const u of s.units) if (u.team === 1) { u.hp = 1; } let guard = 0;
      while (s.phase !== 'over' && guard++ < 80) { if (s.phase === 'turn' && !s.active.ai) { const e = s.units.find((u) => u.team === 1 && u.alive); const best = { d: 1e9 };
        for (let a = s.active.aimMin; a <= s.active.aimMax; a += 2) for (let p = 15; p <= 100; p += 2.5) { const f = e.x > s.active.x ? 1 : -1, r = PM.Sim.trace(s, s.active, s.active.shots[0], f, a, p); if (r.dmg[e.id] && -r.dmg[e.id] < best.d) { best.d = -r.dmg[e.id]; best.o = { angle: a, power: p, facing: f, shot: 0 }; } }
        if (best.o) __fire(best.o); else s.skip(); } __sim(4); }
      return { phase: s.phase, winner: s.winner }; })()`);
    check(over.phase === 'over' && over.winner === 0, 'the player can win the match');
    await page.waitForTimeout(2200);
    await ev('__tick(2)');
    const res = await ev(`(() => { const r = document.querySelector('.result'); return r ? { cls: r.className, coins: window.__G.meta.save.coins, xp: window.__G.meta.save.xp } : null; })()`);
    check(res && /win/.test(res.cls) && res.coins > 0 && res.xp > 0, 'the result screen pays coins and experience ' + JSON.stringify(res));
    await page.screenshot({ path: path.join(CHK, 'play-result.png') });
    const errs = (await ev('window.__errors')).concat(problems);
    check(errs.length === 0, 'no errors through title, quick match and result' + (errs.length ? ': ' + errs.join(' | ').slice(0, 600) : ''));
    await close();
  }
  {
    const { page, problems, close } = await open(br, base, Q, VP);
    const ev = (code) => page.evaluate(code);
    await page.click('[data-go=camp]');
    const list = await ev(`({ n: document.querySelectorAll('.stage').length, next: document.querySelectorAll('.stage.next').length, locked: document.querySelectorAll('.stage.locked').length })`);
    check(list.n === 10 && list.next === 1 && list.locked === 9, 'campaign lists ten stages with only the first open ' + JSON.stringify(list));
    const up = await ev(`(() => { const m = window.__G.meta; m.save.coins = 500; const ok = m.upgrade('coc', 'hp'); return { ok, coins: m.save.coins, hp: m.mods('coc').hp, again: (m.save.coins = 0, m.upgrade('coc', 'hp')) }; })()`);
    check(up.ok && up.coins === 380 && Math.abs(up.hp - 1.06) < 1e-9 && up.again === false, 'an upgrade costs coins, raises the stat, and is refused without coins ' + JSON.stringify(up));
    await ev('window.__G.ui.showCampaign()');
    await page.click('.stage.next');
    await page.waitForFunction('window.__G.state === "playing" && window.__G.demo === false', null, { timeout: 60000 });
    const st = await ev(`(() => { const s = window.__G.sim; return { stage: window.__G.matchCfg.stage, mine: s.units[0].maxHp, foe: s.units[1].maxHp, foeKind: s.units[1].kind }; })()`);
    check(st.stage === 0 && st.mine === 1166 && st.foe === 880 && st.foeKind === 'coc', 'stage 1 starts with the upgraded player unit and a weakened foe ' + JSON.stringify(st));
    await ev(`(() => { const s = window.__G.sim; s.units[1].hp = 1; let g = 0;
      while (s.phase !== 'over' && g++ < 80) { if (s.phase === 'turn' && !s.active.ai) { const e = s.units[1], u = s.active, f = e.x > u.x ? 1 : -1; let best = null;
        for (let a = u.aimMin; a <= u.aimMax && !best; a += 2) for (let p = 15; p <= 100; p += 2.5) { if (PM.Sim.trace(s, u, u.shots[0], f, a, p).dmg[e.id]) { best = { angle: a, power: p, facing: f, shot: 0 }; break; } }
        if (best) __fire(best); else s.skip(); } __sim(4); } })()`);
    await page.waitForTimeout(2200);
    await ev('__tick(2)');
    const res = await ev(`({ stage: window.__G.meta.save.stage, coins: window.__G.meta.save.coins, label: (document.querySelector('[data-again]') || {}).textContent })`);
    check(res.stage === 1 && res.coins >= 60 && res.label === 'Màn kế', 'clearing stage 1 opens stage 2 and pays the first-clear bonus ' + JSON.stringify(res));
    const errs = (await ev('window.__errors')).concat(problems);
    check(errs.length === 0, 'no errors through campaign and upgrades' + (errs.length ? ': ' + errs.join(' | ').slice(0, 600) : ''));
    await close();
  }
  check.done();
});
