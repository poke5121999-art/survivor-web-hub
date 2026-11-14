// Review sheet: every mech of both teams lined up on the plaza, close camera, HUD hidden. Writes .chk/lineup-<q>.png.
'use strict';
const { session, open, CHK, path } = require('./lib.js');
const q = process.argv[2] || 'high';
session(async (br, base) => {
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=' + q);
  await g.page.evaluate(() => {
    const G = window.__G, m = G.match, keys = Object.keys(m.units[0].def.constructor === Object ? {} : {});
    document.getElementById('ui').style.display = 'none';
    const order = [...new Set(m.units.map((u) => u.mech))];
    for (const t of [0, 1]) order.forEach((mech, k) => {
      const u = m.units.find((x) => x.team === t && x.mech === mech);
      u.x = u.px = (k - (order.length - 1) / 2) * 3.1; u.z = u.pz = t ? 2.2 : -1.4; u.aim = t ? -0.5 : 0.5; u.heading = t ? -0.2 : 0.2;
    });
    for (const u of m.units) if (Math.abs(u.z) > 4 || Math.abs(u.x) > 7) { u.x = u.px = 30; u.z = u.pz = 20; }
    m.over = true;
    window.__setShot({ x: 0, z: 0.6, dist: 15, pitch: 50, yaw: 0 });
    for (let i = 0; i < 20; i++) window.__step(1, i === 19);
  });
  const file = path.join(CHK, 'lineup-' + q + '.png');
  await g.page.screenshot({ path: file });
  console.log(file, JSON.stringify(await g.page.evaluate(() => window.__errors)));
  if (g.problems.length) console.log(g.problems.slice(0, 8).join('\n'));
  await g.close();
});
