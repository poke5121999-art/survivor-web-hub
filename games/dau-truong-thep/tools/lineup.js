// Review sheet: mechs of both teams lined up on the plaza, close camera, HUD hidden.
//   node tools/lineup.js [quality] [mech,mech,...|set] [unit overrides as JSON] [out file]
// A set name picks a roster: c (the eight newest, 16 units), all (all sixteen). Overrides are merged into every unit,
// for example '{"stance":true}', '{"charge":1.2}', '{"markT":5}', '{"armorT":5}', '{"glow":"tim","decal":"sao"}'.
// Writes .chk/lineup-<q>-<first mech>.png unless an output file is given.
'use strict';
const { session, open, CHK, path } = require('./lib.js');
const SETS = {
  c: 'thancong,mangxa,kimquy,hacho,holy,domdom,tacke,hoalong',
  all: 'trau,soi,ung,hac,loi,bocap,bang,tho,thancong,mangxa,kimquy,hacho,holy,domdom,tacke,hoalong',
};
const q = process.argv[2] || 'high', arg = process.argv[3] || 'trau,soi,ung,hac';
const mechList = SETS[arg] || arg, extra = JSON.parse(process.argv[4] || '{}');
const out = process.argv[5] || path.join(CHK, 'lineup-' + q + '-' + mechList.split(',')[0] + '.png');
session(async (br, base) => {
  const wide = mechList.split(',').length > 5;
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=' + q, { viewport: wide ? { width: 2400, height: 800 } : { width: 1280, height: 720 } });
  const defs = JSON.parse(JSON.stringify((await import('../js/data.js')).MECHS));
  await g.page.evaluate(({ want, defs, extra }) => {
    const G = window.__G, m = G.match, per = want.length;
    document.getElementById('ui').style.display = 'none';
    // Units beyond the match's own are clones, so a row can hold more mechs than a team has players.
    for (const t of [0, 1]) {
      const mine = m.units.filter((u) => u.team === t);
      for (let i = mine.length; i < per; i++) { const c = Object.assign({}, mine[0], { id: m.units.length, cd: Object.assign({}, mine[0].cd) }); m.units.push(c); mine.push(c); }
    }
    const rows = [0, 1].map((t) => m.units.filter((u) => u.team === t));
    const gap = per > 5 ? 3.9 : 4.4;
    rows.forEach((row, t) => row.forEach((u, k) => {
      if (k >= per) { u.x = u.px = 60; u.z = u.pz = 40; return; }
      u.mech = want[k]; u.def = defs[want[k]]; u.radius = u.def.radius;
      Object.assign(u, extra);
      u.x = u.px = (k - (per - 1) / 2) * gap; u.z = u.pz = t ? 2.4 : -1.5; u.aim = t ? -0.5 : 0.5; u.heading = t ? -0.2 : 0.2;
    }));
    m.over = true;
    window.__setShot({ x: 0, z: 0.45, dist: per > 5 ? 22 : per < 3 ? 9 : 15, pitch: 50, yaw: 0 });
    for (let i = 0; i < 20; i++) window.__step(1, true);
  }, { want: mechList.split(','), defs, extra });
  await g.page.screenshot({ path: out });
  console.log(out, JSON.stringify(await g.page.evaluate(() => window.__errors)));
  if (g.problems.length) console.log(g.problems.slice(0, 8).join('\n'));
  await g.close();
});
