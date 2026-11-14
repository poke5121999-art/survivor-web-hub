// Plays the real page headlessly and asserts the wiring between simulation, input, renderer, HUD and save data.
// Rules of the simulation itself are covered in Node by sim-test.mjs; this covers what only a browser can show.
//   node tools/play.js            DTT_BASE=<hub url> to run against a deployed hub
'use strict';
const { session, open, checker, CHK, fs, path } = require('./lib.js');
const check = checker();

const place = (page, spec) => page.evaluate((spec) => {
  const m = window.__G.match;
  for (const [id, x, z] of spec.units) { const u = m.units[id]; u.x = u.px = x; u.z = u.pz = z; u.vx = u.vz = 0; u.bot = false; }
  for (const u of m.units) if (!spec.units.some((s) => s[0] === u.id)) { u.x = u.px = (u.team ? 30 : -30); u.z = u.pz = -22 + u.id * 1.2; u.bot = false; }
}, spec);

session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });

  for (const q of ['low', 'medium', 'high']) {
    const g = await open(br, base, `manual&noaudio&autostart&spectate&seed=11&bots=hard&q=${q}`);
    const r = await g.page.evaluate(() => {
      const G = window.__G; let guard = 0;
      while (!G.match.over && guard++ < 400) window.__step(30, guard % 20 === 0);
      window.__step(1, true);
      const m = G.match;
      return { over: m.over, score: m.score, time: m.time, target: m.target, errors: window.__errors, crates: m.units.reduce((a, u) => a + u.pickups, 0), calls: window.__stats.calls,
        nan: m.units.some((u) => !Number.isFinite(u.x + u.z + u.hp)) };
    });
    check(r.over && (Math.max(...r.score) === r.target || r.time >= 299), `[${q}] bot match ends: score ${r.score.join('-')} at ${r.time.toFixed(0)} s`);
    check(r.errors.length === 0 && g.problems.length === 0, `[${q}] no errors during a full match` + (r.errors[0] ? ': ' + r.errors[0].slice(0, 200) : '') + (g.problems[0] ? ' ' + g.problems[0].slice(0, 200) : ''));
    check(!r.nan && r.calls > 20, `[${q}] state finite, scene drawn (${r.calls} draw calls)`);
    check(r.crates > 0, `[${q}] airdrop crates were picked up (${r.crates})`);
    await g.close();
  }

  for (const map of ['xuongcat', 'cangbang', 'mienglua']) {
    const g = await open(br, base, `manual&noaudio&autostart&spectate&seed=21&bots=normal&q=low&map=${map}`);
    const r = await g.page.evaluate(() => {
      const G = window.__G; let guard = 0; const seen = {};
      while (!G.match.over && guard++ < 400) { window.__step(30, guard % 25 === 0); for (const u of G.match.units) seen[u.mech] = 1; }
      window.__step(1, true);
      return { over: G.match.over, score: G.match.score, map: G.match.map.key, mechs: Object.keys(seen).length, errors: window.__errors };
    });
    check(r.over && r.map === map, `[${map}] bot match ends on the chosen map: ${r.score.join('-')} with ${r.mechs} different mechs`);
    check(r.errors.length === 0 && g.problems.length === 0, `[${map}] no errors` + (r.errors[0] ? ': ' + r.errors[0].slice(0, 200) : '') + (g.problems[0] ? ' ' + g.problems[0].slice(0, 200) : ''));
    await g.page.screenshot({ path: path.join(CHK, `play-${map}.png`) });
    await g.close();
  }

  for (const mode of ['chiem', 'tudo', 'trum']) {
    const g = await open(br, base, `manual&noaudio&autostart&seed=31&bots=normal&q=low&mode=${mode}&mech=tho`);
    const r = await g.page.evaluate(() => {
      const G = window.__G; let guard = 0;
      G.match.units[0].bot = true;
      while (G.mode !== 'result' && guard++ < 500) window.__step(30, guard % 25 === 0);
      const res = document.querySelector('#ui .screen.result');
      return { mode: G.match.mode, over: G.match.over, units: G.match.units.length, state: G.mode, shown: !!res && getComputedStyle(res).display !== 'none', errors: window.__errors };
    });
    check(r.over && r.mode === mode && r.state === 'result' && r.shown, `[${mode}] a full match in this mode ends on the result screen (${r.units} units)`);
    check(r.errors.length === 0 && g.problems.length === 0, `[${mode}] no errors` + (r.errors[0] ? ': ' + r.errors[0].slice(0, 200) : '') + (g.problems[0] ? ' ' + g.problems[0].slice(0, 200) : ''));
    await g.page.screenshot({ path: path.join(CHK, `play-result-${mode}.png`) });
    await g.close();
  }

  {
    const g = await open(br, base, 'manual&noaudio&autostart&seed=5&mech=soi&bots=normal&q=low');
    const p = g.page;
    await place(p, { units: [[0, -3, 14], [5, 4, 14]] });
    const hp0 = await p.evaluate(() => window.__G.match.units[5].hp);
    await p.evaluate(() => { window.__input({ mx: 0, mz: 0, aim: 0, fire: true, s1: false, s2: false, ult: false, heal: false, tx: 4, tz: 14 }); for (let i = 0; i < 45; i++) window.__step(1, true); });
    const a = await p.evaluate(() => ({ hp: window.__G.match.units[5].hp, nums: [...document.querySelectorAll('#ui .fx .fn')].filter((n) => /^-?\d+$/.test(n.textContent.trim()) && n.getBoundingClientRect().width > 0).length }));
    check(a.hp < hp0, `scripted fire through __input damages the enemy in front (${hp0} → ${Math.round(a.hp)})`);
    check(a.nums > 0, `damage numbers are visible in the HUD (${a.nums})`);

    await p.evaluate(() => { const m = window.__G.match; m.units[5].hp = m.units[5].maxHp; });
    await place(p, { units: [[0, -24, -8.5], [5, -29, -8.5]] });
    await p.evaluate(() => { window.__input({ mx: 0, mz: 0, aim: Math.PI, fire: true, s1: false, s2: false, ult: false, heal: false, tx: -29, tz: -8.5 }); window.__step(60, true); });
    const b = await p.evaluate(() => { const u = window.__G.match.units[5]; return u.hp === u.maxHp; });
    check(b, 'a ruin wall between shooter and target blocks every shot');

    await p.evaluate(() => { window.__input({ mx: 0, mz: 0, aim: 0, fire: false, s1: true, s2: false, ult: false, heal: false, tx: 0, tz: 0 }); window.__step(3, true); window.__input(null); });
    const c = await p.evaluate(() => ({ cd: window.__G.match.units[0].cd.s1, want: window.__G.match.units[0].def.skills[0].cd }));
    check(c.cd > c.want - 0.5 && c.cd <= c.want, `skill Q goes on cooldown (${c.cd.toFixed(1)} of ${c.want} s)`);

    await place(p, { units: [[0, -3, 14], [5, 4, 14]] });
    await p.evaluate(() => { const m = window.__G.match; m.units[5].hp = 40; window.__input({ mx: 0, mz: 0, aim: 0, fire: true, s1: false, s2: false, ult: false, heal: false, tx: 4, tz: 14 }); window.__step(20, true); });
    const d = await p.evaluate(() => { const m = window.__G.match; return { alive: m.units[5].alive, score: m.score[0], feed: document.querySelectorAll('#ui .kf').length }; });
    check(!d.alive && d.score === 1, 'killing an enemy scores a point for my team');
    check(d.feed > 0, 'the kill appears in the kill feed');
    await p.evaluate(() => { window.__input(null); window.__step(30 * 6, true); });
    check(await p.evaluate(() => window.__G.match.units[5].alive), 'the dead mech respawns after the timer');

    await p.evaluate(() => { const m = window.__G.match; m.score[0] = m.target - 1; m.units[5].x = m.units[5].px = 4; m.units[5].z = m.units[5].pz = 14; m.units[5].hp = 30; m.units[5].invulnT = 0;
      window.__input({ mx: 0, mz: 0, aim: 0, fire: true, s1: false, s2: false, ult: false, heal: false, tx: 4, tz: 14 }); window.__step(30, true); });
    check(await p.evaluate(() => window.__G.match.over && window.__G.match.winner === 0), 'reaching the target score ends the match with my team as winner');
    await p.evaluate(() => window.__step(70, true));
    const e = await p.evaluate(() => ({ mode: window.__G.mode, shown: !!document.querySelector('#ui .screen.result') && getComputedStyle(document.querySelector('#ui .screen.result')).display !== 'none',
      save: JSON.parse(localStorage.getItem('dtt.save.v1') || '{}') }));
    check(e.mode === 'result' && e.shown, 'the result screen is shown after the match');
    check(e.save.coins > 0 && e.save.stats && e.save.stats.matches === 1, `rewards are saved (coins ${e.save.coins})`);
    await p.screenshot({ path: path.join(CHK, 'play-result.png') });
    check((await p.evaluate(() => window.__errors)).length === 0 && g.problems.length === 0, 'no errors in the scripted match' + (g.problems[0] ? ': ' + g.problems[0].slice(0, 200) : ''));
    await g.close();
  }

  {
    const g = await open(br, base, 'noaudio&seed=2&q=low');
    const p = g.page;
    await p.waitForTimeout(600);
    const menu = await p.evaluate(() => { const s = document.querySelector('#ui .screen.menu'); return !!s && getComputedStyle(s).display !== 'none' && window.__G.mode === 'attract'; });
    check(menu, 'without ?autostart the menu shows over a live bot match');
    await p.screenshot({ path: path.join(CHK, 'play-menu.png') });
    await p.evaluate(() => window.__G.bus.emit('ui:play', { mech: 'trau', diff: 'easy', map: 'denrung' }));
    await p.waitForTimeout(1500);
    const hud = await p.evaluate(() => ({ mode: window.__G.mode, me: window.__G.match.units[0].mech, bot: window.__G.match.units[0].bot, t: window.__G.match.time,
      hud: getComputedStyle(document.querySelector('#ui .hud')).display !== 'none' }));
    check(hud.mode === 'match' && hud.me === 'trau' && !hud.bot && hud.hud, 'pressing play starts a match with the chosen mech and shows the HUD');
    check(hud.t > 0.5, `the match advances in real time by itself (${hud.t.toFixed(2)} s)`);
    await p.mouse.move(900, 300); await p.keyboard.down('d'); await p.mouse.down();
    await p.waitForTimeout(1200);
    const mv = await p.evaluate(() => { const u = window.__G.match.units[0], s = window.__G.match.map.spawns[0][0]; return { dx: u.x - s[0], fired: u.cd.fire > 0 || window.__G.match.shots.some((x) => x.owner === 0) }; });
    await p.keyboard.up('d'); await p.mouse.up();
    check(mv.dx > 1.5, `holding D moves the mech right (${mv.dx.toFixed(1)} m)`);
    check(mv.fired, 'holding the left mouse button fires the weapon');
    check((await p.evaluate(() => window.__errors)).length === 0 && g.problems.length === 0, 'no errors in the real-time session' + (g.problems[0] ? ': ' + g.problems[0].slice(0, 200) : ''));
    await g.close();
  }

  {
    const g = await open(br, base, 'noaudio&autostart&seed=2', { viewport: { width: 780, height: 360 }, touch: true });
    const p = g.page;
    await p.waitForTimeout(800);
    const t = await p.evaluate(() => ({ q: window.__stats.quality, touch: window.__G.input.touch, over: [...document.querySelectorAll('#ui .hud *')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 2 || r.bottom > innerHeight + 2 || r.left < -2); }).length }));
    check(t.touch, 'a touch device gets the twin-stick controls');
    check(t.q === 'low', `a phone defaults to low quality (${t.q})`);
    await p.screenshot({ path: path.join(CHK, 'play-phone.png') });
    check((await p.evaluate(() => window.__errors)).length === 0 && g.problems.length === 0, 'no errors on the phone layout' + (g.problems[0] ? ': ' + g.problems[0].slice(0, 200) : ''));
    await g.close();
  }
  check.done();
});
