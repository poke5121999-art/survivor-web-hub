// Review sheet: up to five mechs of both teams lined up on the plaza, close camera, HUD hidden.
//   node tools/lineup.js [quality] [mech,mech,...]   writes .chk/lineup-<q>-<first mech>.png
'use strict';
const { session, open, CHK, path } = require('./lib.js');
const q = process.argv[2] || 'high', mechList = process.argv[3] || 'trau,soi,ung,hac';
session(async (br, base) => {
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=' + q);
  const defs = JSON.parse(JSON.stringify((await import('../js/data.js')).MECHS));
  await g.page.evaluate(({ want, defs }) => {
    const G = window.__G, m = G.match;
    document.getElementById('ui').style.display = 'none';
    m.units.forEach((u, i) => {
      const k = i % 5, t = u.team;
      if (k >= want.length) { u.x = u.px = 30; u.z = u.pz = 20; return; }
      u.mech = want[k]; u.def = defs[want[k]]; u.radius = u.def.radius;
      u.x = u.px = (k - (want.length - 1) / 2) * 3.1; u.z = u.pz = t ? 2.2 : -1.4; u.aim = t ? -0.5 : 0.5; u.heading = t ? -0.2 : 0.2;
    });
    m.over = true;
    window.__setShot({ x: 0, z: 0.6, dist: 15, pitch: 50, yaw: 0 });
    for (let i = 0; i < 20; i++) window.__step(1, true);
  }, { want: mechList.split(','), defs });
  const file = path.join(CHK, 'lineup-' + q + '-' + mechList.split(',')[0] + '.png');
  await g.page.screenshot({ path: file });
  console.log(file, JSON.stringify(await g.page.evaluate(() => window.__errors)));
  if (g.problems.length) console.log(g.problems.slice(0, 8).join('\n'));
  await g.close();
});
