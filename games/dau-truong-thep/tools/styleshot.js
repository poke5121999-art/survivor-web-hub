// Style review: one row of mechs on an empty stage (map meshes hidden, plain floor), all on team 0, close camera from the usual top-down angle.
//   node tools/styleshot.js mech[@form],mech[@form],... out.png [unit overrides as JSON, e.g. '{"lv":[5,5,5,5,5]}']
'use strict';
const { session, open } = require('./lib.js');
const want = process.argv[2].split(','), out = process.argv[3], extra = JSON.parse(process.argv[4] || '{}'), pitch = 55;
session(async (br, base) => {
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=5&q=high', { viewport: { width: 400 * want.length, height: 460 } });
  const defs = JSON.parse(JSON.stringify((await import('../js/data.js')).MECHS));
  await g.page.evaluate(({ want, defs, pitch, extra }) => {
    const G = window.__G, m = G.match;
    document.getElementById('ui').style.display = 'none';
    while (m.units.length < want.length) m.units.push(Object.assign({}, m.units[0], { id: m.units.length, cd: Object.assign({}, m.units[0].cd) }));
    m.units.forEach((u, k) => {
      if (k >= want.length) { u.x = u.px = 60; u.z = u.pz = 40; return; }
      const [mk, fm] = want[k].split('@'); u.mech = mk; u.def = defs[mk]; if (fm) u.lv = [[0, 0, 0, 0, 0], [3, 3, 3, 3, 0], [5, 5, 5, 5, 5]][fm - 1]; u.radius = u.def.radius; u.color = 0; u.team = 0; Object.assign(u, extra);
      u.x = u.px = (k - (want.length - 1) / 2) * 4.3; u.z = u.pz = 0.4; u.aim = 0.35; u.heading = 0.35;
    });
    m.over = true;
    // Empty stage: hide every mesh of the map (its lights stay) and lay a plain floor for shadows.
    const T3 = G.THREE;
    G.gfx.world.group.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isSprite) o.visible = false; });
    const floor = new T3.Mesh(new T3.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new T3.MeshStandardMaterial({ color: 0x55606c, roughness: 0.95 }));
    floor.receiveShadow = true; floor.position.y = 0.0; G.scene.add(floor);
    window.__setShot({ x: 0, z: 0.6, dist: want.length > 3 ? 11.5 : 9, pitch: pitch, yaw: 0 });
    for (let i = 0; i < 20; i++) window.__step(1, true);
  }, { want, defs, pitch, extra });
  await g.page.screenshot({ path: out });
  console.log(out, JSON.stringify(await g.page.evaluate(() => window.__errors)));
  await g.close();
});
