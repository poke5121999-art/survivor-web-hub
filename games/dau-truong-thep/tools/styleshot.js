// Style review: one row of mechs on an open plaza, all on team 0, close camera from the usual top-down angle.
//   node tools/styleshot.js mech,mech,... out.png [pitch]
'use strict';
const { session, open } = require('./lib.js');
const want = process.argv[2].split(','), out = process.argv[3], pitch = Number(process.argv[4] || 55);
session(async (br, base) => {
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=high', { viewport: { width: 400 * want.length, height: 460 } });
  const defs = JSON.parse(JSON.stringify((await import('../js/data.js')).MECHS));
  await g.page.evaluate(({ want, defs, pitch }) => {
    const G = window.__G, m = G.match;
    document.getElementById('ui').style.display = 'none';
    while (m.units.length < want.length) m.units.push(Object.assign({}, m.units[0], { id: m.units.length, cd: Object.assign({}, m.units[0].cd) }));
    m.units.forEach((u, k) => {
      if (k >= want.length) { u.x = u.px = 60; u.z = u.pz = 40; return; }
      u.mech = want[k]; u.def = defs[want[k]]; u.radius = u.def.radius; u.color = 0; u.team = 0;
      u.x = u.px = (k - (want.length - 1) / 2) * 3.4; u.z = u.pz = 0.4; u.aim = 0.35; u.heading = 0.35;
    });
    m.over = true;
    window.__setShot({ x: 0, z: 0.6, dist: 9.5, pitch: pitch, yaw: 0 });
    for (let i = 0; i < 20; i++) window.__step(1, true);
  }, { want, defs, pitch });
  await g.page.screenshot({ path: out });
  console.log(out, JSON.stringify(await g.page.evaluate(() => window.__errors)));
  await g.close();
});
