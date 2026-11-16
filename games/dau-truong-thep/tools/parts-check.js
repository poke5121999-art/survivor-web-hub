// Stray-part check: builds every mech at every form and fails when a mesh of its model sits below the ground or far
// from the body (a piece drawn through a transform the design left on the builder's base matrix, for example).
//   node tools/parts-check.js [mech,mech,...]
'use strict';
const path = require('path');
const { session, open } = require('./lib.js');
session(async (br, base) => {
  const data = await import(path.join(__dirname, '../js/data.js'));
  const want = process.argv[2] ? process.argv[2].split(',') : data.MECH_ORDER;
  const defs = JSON.parse(JSON.stringify(data.MECHS));
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=high');
  const bad = await g.page.evaluate(({ want, defs }) => {
    const G = window.__G, T = G.THREE, m = G.match, u = m.units[0], out = [];
    m.over = true;
    for (const mech of want) for (const form of [1, 2, 3]) {
      u.mech = mech; u.def = defs[mech]; u.radius = u.def.radius;
      u.lv = [[0, 0, 0, 0, 0], [3, 3, 3, 3, 0], [5, 5, 5, 5, 5]][form - 1];
      u.x = u.px = 0; u.z = u.pz = 0; u.aim = 0; u.heading = 0;
      window.__step(1, true);
      const v = G.gfx.mechs.views.get(u.id);
      v.body.updateMatrixWorld(true);
      const reach = 3.2 * v.S;
      v.body.traverse((o) => {
        if (!o.isMesh || !o.geometry.attributes.position.count) return;
        const b = new T.Box3().setFromObject(o), c = b.getCenter(new T.Vector3());
        const low = b.min.y - v.root.position.y, far = Math.hypot(c.x - u.x, c.z - u.z);
        if (low < -0.25 || far > reach) out.push(`${mech}@${form}: mesh ${o.parent.name || ''} min y ${low.toFixed(2)}, centre ${far.toFixed(2)} m from the body (limit ${reach.toFixed(2)})`);
      });
    }
    return out;
  }, { want, defs });
  for (const line of bad) console.log('FAIL ' + line);
  console.log(bad.length ? `${bad.length} stray parts` : `ok: no stray parts in ${want.length} mechs x 3 forms`);
  await g.close();
  process.exitCode = bad.length ? 1 : 0;
});
