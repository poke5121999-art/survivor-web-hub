// Stray-part check: builds every mech at every form (and at form III in each of its skins, js/skins.js) and fails when a mesh of its model sits below the ground or far
// from the body (a piece drawn through a transform the design left on the builder's base matrix, for example).
//   node tools/parts-check.js [mech,mech,...]   (default: every mech with a style row, newer tanks without sim data included)
'use strict';
const path = require('path');
const { session, open } = require('./lib.js');
const { ROLE, fillPending, fillSrc } = require('./pending-mechs.js');
session(async (br, base) => {
  const data = await import(path.join(__dirname, '../js/data.js'));
  const STYLES = (await import(path.join(__dirname, '../js/gfx/styles.js'))).STYLES;
  const pending = fillPending(data.MECHS, STYLES, data.BOSSES, ROLE);
  const want = process.argv[2] ? process.argv[2].split(',') : data.MECH_ORDER.concat(pending);
  const defs = JSON.parse(JSON.stringify(data.MECHS));
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=high');
  const bad = await g.page.evaluate(async ({ want, defs, fillSrc, ROLE }) => {
    const D = await import(new URL('js/data.js', location.href).href), St = await import(new URL('js/gfx/styles.js', location.href).href);
    new Function('return ' + fillSrc)()(D.MECHS, St.STYLES, D.BOSSES, ROLE);
    const G = window.__G, T = G.THREE, m = G.match, u = m.units[0], out = [];
    m.over = true;
    const Sk = await import(new URL('js/skins.js', location.href).href);
    for (const mech of want) for (const [form, skin] of [[1, null], [2, null], [3, null]].concat((Sk.SKINS[mech] || []).slice(1).map((s) => [3, s.id]))) {
      u.mech = mech; u.def = defs[mech]; u.radius = u.def.radius; u.skin = skin;
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
        if (low < -0.25 || far > reach) out.push(`${mech}@${form}${skin ? '.' + skin : ''}: mesh ${o.parent.name || ''} min y ${low.toFixed(2)}, centre ${far.toFixed(2)} m from the body (limit ${reach.toFixed(2)})`);
      });
    }
    return out;
  }, { want, defs, fillSrc, ROLE });
  const errs = await g.page.evaluate(() => window.__errors || []);
  for (const e of errs) bad.push('page error: ' + String(e).split(String.fromCharCode(10))[0]);
  for (const line of bad) console.log('FAIL ' + line);
  console.log(bad.length ? `${bad.length} stray parts` : `ok: no stray parts in ${want.length} mechs x 3 forms + their skins at form III`);
  await g.close();
  process.exitCode = bad.length ? 1 : 0;
});
