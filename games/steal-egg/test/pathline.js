// NavmeshPathDraw guide line (js/view/pathline.js) in the real page:  node test/pathline.js
// Rules under test (rules/upgrades-shop.md section 2, rules/tutorial.md 3-4, decomp NavmeshPathDraw / SpeedUpgradePathGuide):
//  - the speed-plan guide (Player1/PathContainer/"NavmeshPathDraw (3)") is shown by the 0.25 s refresh exactly when an
//    unpurchased plan has cost <= coins (a save seeded with 2999 / 3500 coins, plan 1 costs 3000), hidden otherwise
//  - the drawn vertices are nodeWorldMatrix * (NavMesh corner + 0.04 up): the LineRenderers have useWorldSpace = false, so
//    the world corners are read in the node's local space (rot +90 deg X in Unity, scale 4, under Player1 scale 0.4: world = 1.6 x R(corner), ~100 m away and ~28 m below)
//  - the line follows the node (the player) because its points are local
//  - buying the plan = HideGuide = NavmeshPathDraw.Stop(): recalculation stops, the renderer keeps its last points
//    (nothing empties or disables the LineRenderer in the original), still riding on the node
//  - the tutorial's own "path" object: serialized 2-point stub before the first target, then the target path
// Screenshots (player camera and a high camera) go to $SHOTS or ~/stealegg-ref/shots/pathline-*.png.
'use strict';
const fs = require('fs');
const path = require('path');
const { run, openPage } = require('./harness');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'drop1-save.json'), 'utf8'));
const save = coins => JSON.stringify({ ...FIXTURE, coins, upgrades: { ...FIXTURE.upgrades, speedPlans: {}, savedSpeed: 0 } });
const inject = coins => ({ fn: s => { if (!sessionStorage.getItem('injected')) { localStorage.setItem('steal-egg-v1', s); sessionStorage.setItem('injected', '1'); } }, arg: save(coins) });
const TOL = 0.01;

// In-page helpers (serialised into evaluate): independent re-derivation of what the line must be.
const PAGE = () => {
  const g = window.__game, gv = g.gv, pl = gv.pathline;
  const sample = p => { const c = g.sim.nav.closest(p); return Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) <= 4 ? c : p; };
  // vertices the mesh really holds: the midpoint of each left/right pair = the line's point
  const drawn = d => {
    const a = d.mesh.geometry.getAttribute('position'), out = [];
    if (!a) return out;
    for (let i = 0; i < a.count; i += 2) out.push([(a.getX(i) + a.getX(i + 1)) / 2, (a.getY(i) + a.getY(i + 1)) / 2, (a.getZ(i) + a.getZ(i + 1)) / 2]);
    return out;
  };
  const expected = (d, origin, dest) => {
    const a = sample(origin), b = sample(dest), rest = g.sim.nav.path(a, b);
    d.node.updateWorldMatrix(true, false);
    const m = d.node.matrixWorld.elements;
    return rest && [a, ...rest].map(c => {
      const x = c[0], y = c[1] + 0.04, z = c[2];
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    });
  };
  window.__pl = { g, gv, pl, sample, drawn, expected };
};

const maxDiff = (a, b) => (a && b && a.length === b.length ? Math.max(0, ...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2]))) : Infinity);

async function stepFor(page, seconds) { await page.evaluate(n => window.__step(n, true), Math.round(seconds * 30)); }

// Move the camera (after the game drew its own frame), render once, and screenshot. xray = hide the map and draw a grid at
// the player's ground level (the map's meshes are hidden, its nodes stay active), a red post on the player and a green post on the target, so a line below the ground shows.
async function lookFrom(page, shot, name, eye, at, fov = 60, xray = null) {
  await page.evaluate(async ([e, a, f, x]) => {
    const THREE = await import('three');
    const { g } = window.__pl, cam = g.view.camera, scene = g.view.scene;
    window.__camSaved = window.__camSaved || { fov: cam.fov, far: cam.far };
    cam.position.set(...e); cam.lookAt(...a); cam.fov = f; cam.far = 1000; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const extra = [];
    if (x) {
      window.__hidden = [];
      g.view.world.root.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.visible) { o.visible = false; window.__hidden.push(o); } });   // meshes only: the nodes stay active
      const grid = new THREE.GridHelper(400, 40, 0x4477aa, 0x335577);
      grid.position.set(x.player[0], x.player[1], x.player[2]);
      extra.push(grid);
      for (const [p, c] of [[x.player, 0xff2020], [x.target, 0x20ff20]]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 8), new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.8 }));
        m.position.set(p[0], p[1], p[2]); m.renderOrder = 5; extra.push(m);
      }
      extra.forEach(o => scene.add(o));
    }
    g.gv.pathline.draw();
    window.__extra = extra;
    g.view.renderer.render(scene, cam);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // the page's own loop renders with the same camera
  }, [eye, at, fov, xray]);
  await shot(page, name);
  await page.evaluate(() => {
    const { g } = window.__pl, c = g.view.camera, s = window.__camSaved;
    (window.__extra || []).forEach(o => g.view.scene.remove(o));
    window.__extra = [];
    (window.__hidden || []).forEach(o => { o.visible = true; });
    window.__hidden = [];
    c.fov = s.fov; c.far = s.far; c.updateProjectionMatrix();
  });
}

run('pathline', async ({ browser, base, shot, check }) => {
  const url = `${base}/index.html?seed=1&play`;

  // ---- coins 2999: nothing affordable -> guide hidden ------------------------------------------------------------
  let { ctx, page, errors } = await openPage(browser, url, { init: inject(2999) });
  await page.evaluate(PAGE);
  await stepFor(page, 1);
  const none = await page.evaluate(() => { const { g, pl } = window.__pl, d = pl.guide.draw; return { coins: g.sim.state.coins, player: g.view.playerName, objVisible: d.node.visible, mesh: d.mesh.visible, stopped: d.stopped, draws: d.draws, plan: pl.affordablePlan() }; });
  check('coins 2999 (plan 1 costs 3000): guide object inactive, nothing drawn, no path calculated', none.coins === 2999 && none.player === 'Player1'
    && !none.objVisible && !none.mesh && none.stopped && none.draws === 0 && none.plan === null, JSON.stringify(none));

  // ---- coins reach 3000 (exactly the cost: CanAffordNow is cost <= coins) ------------------------------------------
  await page.evaluate(() => { window.__pl.g.sim.state.coins = 3000; });
  let seenAt = -1;
  for (let i = 0; i < 12 && seenAt < 0; i++) { await page.evaluate(() => window.__step(1, true)); if (await page.evaluate(() => window.__pl.pl.guide.draw.mesh.visible)) seenAt = i + 1; }
  check('coins 3000: guide shows within one 0.25 s refresh (<= 8 sim steps)', seenAt > 0 && seenAt <= 9, `after ${seenAt} steps`);

  // ---- vertices = node world matrix * (nav corner + 0.04) --------------------------------------------------------
  await stepFor(page, 0.4);
  const geo = await page.evaluate(() => {
    const { g, pl, drawn, expected } = window.__pl, d = pl.guide.draw;
    const origin = d.origin(), dest = d.destination();
    const exp = expected(d, origin, dest), got = drawn(d), world = d.worldPoints();
    d.node.updateWorldMatrix(true, false);
    const P = g.view.player; P.updateWorldMatrix(true, false);
    const me = P.getWorldPosition(new g.view.camera.position.constructor()).toArray();
    return { exp, got, world, local: d.local, corners: d.last.corners, me, mat: d.node.matrixWorld.elements.slice(), matP: P.matrixWorld.elements.slice(), dest, origin, running: !d.stopped, draws: d.draws };
  });
  check('guide: recalculating (not stopped), path has >= 2 corners', geo.running && geo.corners.length >= 2, `${geo.corners.length} corners, ${geo.draws} draws`);
  const dGot = maxDiff(geo.got, geo.exp), dWorld = maxDiff(geo.world, geo.exp);
  check('guide: mesh vertices = nodeWorldMatrix * (nav corner + 0.04 up), within 1 cm', dGot <= TOL && dWorld <= TOL, `max diff mesh ${dGot.toFixed(4)} m, points ${dWorld.toFixed(4)} m over ${geo.exp.length} points`);
  check('guide: local points are the world corners lifted by exactly 0.04', geo.local.every((p, i) => Math.abs(p[1] - geo.corners[i][1] - 0.04) < 1e-6 && p[0] === geo.corners[i][0] && p[2] === geo.corners[i][2]));
  // where it lands relative to the player
  const dist = geo.got.map(p => Math.hypot(p[0] - geo.me[0], p[1] - geo.me[1], p[2] - geo.me[2]));
  const dy = geo.got.map(p => p[1] - geo.me[1]);
  console.log(`INFO player ${geo.me.map(v => v.toFixed(2))}, shop ${geo.dest.map(v => v.toFixed(2))}, line points ${geo.got.map(p => p.map(v => v.toFixed(1)).join(',')).join(' | ')}`);
  console.log(`INFO distance from player to line points ${dist.map(v => v.toFixed(1))} m, height above player ${dy.map(v => v.toFixed(1))} m`);
  check('guide: the quirk is real, the line is nowhere near the shop (> 20 m from the player)', Math.min(...dist) > 20, `min ${Math.min(...dist).toFixed(1)} m`);
  const col = await page.evaluate(() => { const d = window.__pl.pl.guide.draw; return { color: d.mesh.material.color.toArray(), w: d.halfWidth * 2, tex: !!d.mesh.material.map, tile: d.tile }; });
  check('guide: material Arrow 2 colour (0.9325, 0, 1), width 0.7, chevron texture, one tile per unit', Math.abs(col.color[0] - 0.93249) < 1e-3 && col.color[1] === 0 && col.color[2] === 1 && Math.abs(col.w - 0.7) < 1e-6 && col.tex && col.tile[0] === 1, JSON.stringify(col));

  await lookFrom(page, shot, 'pathline-guide-high.png', [geo.me[0] + 30, geo.me[1] + 120, geo.me[2] + 30], [geo.me[0] - 60, geo.me[1], geo.me[2]], 70);
  await lookFrom(page, shot, 'pathline-guide-xray.png', [(geo.me[0] + geo.got[0][0]) / 2, geo.me[1] + 70, geo.me[2] + 110], [(geo.me[0] + geo.got[0][0]) / 2, geo.me[1] - 10, geo.me[2]], 60, { player: geo.me, target: geo.dest });
  await page.evaluate(() => window.__step(1, true));
  await shot(page, 'pathline-guide-player-camera.png');

  // ---- the line rides on the node: move the player, local points stay, world points follow ---------------------------
  const before = await page.evaluate(() => { const d = window.__pl.pl.guide.draw; return { local: JSON.stringify(d.local), world: d.worldPoints(), draws: d.draws }; });
  await page.evaluate(() => { const { g } = window.__pl, p = g.sim.state.actors[0]; p.pos = g.sim.nav.closest([p.pos[0] + 2, p.pos[1], p.pos[2] + 2]); });
  await page.evaluate(() => window.__step(1, true));
  const after = await page.evaluate(() => { const { g, pl, drawn, expected } = window.__pl, d = pl.guide.draw; return { local: JSON.stringify(d.local), world: d.worldPoints(), draws: d.draws, exp: expected(d, d.origin(), d.destination()), got: drawn(d), starts: d.last.corners[0] }; });
  check('player moved 2 m: still recalculating, vertices still = node matrix * corners (1 cm)', after.draws > before.draws && maxDiff(after.got, after.exp) <= TOL, `draws ${before.draws} -> ${after.draws}, diff ${maxDiff(after.got, after.exp).toFixed(4)}`);

  // ---- buying the plan: HideGuide = Stop ------------------------------------------------------------------------------
  const D = await page.evaluate(() => window.__pl.g.data.zones.shops.shoes.c);
  await page.evaluate(c => { const { g } = window.__pl; g.sim.state.actors[0].pos = g.sim.nav.closest(c); }, D);
  await stepFor(page, 0.3);
  const shopOpen = await page.evaluate(() => window.__pl.g.sim.state.ui.shop);
  await page.evaluate(() => { window.__pl.g.sim.state.coins = 3500; window.__pl.g.sim.action('buySpeed', { plan: 1 }); });
  const bought = await page.evaluate(() => { const { g } = window.__pl, s = g.sim.state; return { coins: s.coins, plans: { ...s.upgrades.speedPlans } }; });
  check('plan 1 bought at the shoe shop (3000 of 3500 charged) so no plan is affordable any more', shopOpen === 'shoes' && bought.plans[1] === true && bought.coins === 500, JSON.stringify({ shopOpen, ...bought }));
  await stepFor(page, 0.4);
  const frozen = await page.evaluate(() => { const { pl } = window.__pl, d = pl.guide.draw; return { stopped: d.stopped, dest: !!d.destination, draws: d.draws, local: JSON.stringify(d.local), visible: d.mesh.visible, plan: pl.affordablePlan(), pv: pl.guide.pathVisible }; });
  await stepFor(page, 0.5);
  await page.evaluate(() => { const { g } = window.__pl, p = g.sim.state.actors[0]; p.pos = g.sim.nav.closest([p.pos[0] - 3, p.pos[1], p.pos[2]]); });
  await stepFor(page, 0.3);
  const frozen2 = await page.evaluate(() => { const { pl, drawn, expected } = window.__pl, d = pl.guide.draw; return { draws: d.draws, local: JSON.stringify(d.local), visible: d.mesh.visible, world: d.worldPoints(), got: drawn(d) }; });
  check('after buying: guide hidden by the rule (Stop: destination null, stopped), no path recalculated any more', frozen.stopped && !frozen.dest && frozen.plan === null && !frozen.pv && frozen2.draws === frozen.draws, JSON.stringify({ ...frozen, local: undefined }));
  check('after buying: the renderer keeps its last points (original never empties or disables it), local points unchanged', frozen2.local === frozen.local && frozen2.visible && frozen.visible, `visible ${frozen2.visible}`);
  check('after buying: the kept points still ride on the node (vertices = node matrix * stored points)', maxDiff(frozen2.got, frozen2.world) <= TOL);
  check('no page errors in the coins 2999 -> 3000 -> bought run', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // ---- coins 3500: shown at start, hidden after buying (second affordable-yes case straight from the save) -------------
  ({ ctx, page, errors } = await openPage(browser, url, { init: inject(3500) }));
  await page.evaluate(PAGE);
  await stepFor(page, 0.6);
  const yes = await page.evaluate(() => { const { g, pl, drawn, expected } = window.__pl, d = pl.guide.draw; return { coins: g.sim.state.coins, vis: d.mesh.visible, obj: d.node.visible, diff: Math.max(...drawn(d).map((p, i) => Math.hypot(...p.map((v, k) => v - expected(d, d.origin(), d.destination())[i][k])))) }; });
  check('coins 3500 from the save: guide visible from the first refreshes, vertices match', yes.coins === 3500 && yes.vis && yes.obj && yes.diff <= TOL, JSON.stringify(yes));
  await ctx.close();

  // ---- the tutorial's own path object (fresh profile: no save) -------------------------------------------------------
  ({ ctx, page, errors } = await openPage(browser, url));
  await page.evaluate(PAGE);
  await stepFor(page, 0.5);
  const stub = await page.evaluate(() => {
    const { g, pl, drawn } = window.__pl, d = pl.tutorial.draw, P = g.view.player;
    P.updateWorldMatrix(true, false);
    return { vis: d.mesh.visible, stopped: d.stopped, draws: d.draws, local: d.local, got: drawn(d), me: P.getWorldPosition(P.position.clone()).toArray(), path: d.line.path };
  });
  const up = stub.got.length === 2 ? Math.hypot(stub.got[1][0] - stub.got[0][0], stub.got[1][1] - stub.got[0][1], stub.got[1][2] - stub.got[0][2]) : -1;
  check('tutorial path before the first target: the serialized 2-point stub, 1.6 m strip hanging down from the player feet (node rot +90 deg X: local +z -> world down)', stub.vis && stub.stopped && stub.draws === 0
    && stub.local.length === 2 && Math.abs(up - 1.6) < 0.01 && Math.abs(stub.got[1][1] - stub.got[0][1] + 1.6) < 0.01 && Math.hypot(stub.got[0][0] - stub.me[0], stub.got[0][2] - stub.me[2]) < 0.01,
    `${stub.path}, length ${up.toFixed(3)}`);
  await lookFrom(page, shot, 'pathline-tutorial-stub-player-camera.png', await page.evaluate(() => window.__pl.g.view.camera.position.toArray()), await page.evaluate(() => { const P = window.__pl.g.view.player; return [P.position.x, P.position.y + 1, P.position.z]; }), 60);
  await stepFor(page, 2);
  const tut = await page.evaluate(() => {
    const { g, pl, drawn, expected } = window.__pl, d = pl.tutorial.draw, v = g.gv.tutorial.view;
    const exp = v.pointer && expected(d, d.origin(), v.pointer.pos);
    return { text: v.text, pointer: v.pointer, running: !d.stopped, draws: d.draws, exp, got: drawn(d), corners: d.last && d.last.corners, me: d.origin() };
  });
  check('tutorial: first target set after the 2 s start delay, path being recalculated', !!tut.pointer && tut.running && tut.draws > 0, `"${tut.text}" -> ${tut.pointer && tut.pointer.pos.map(v => v.toFixed(1))}`);
  const dt = maxDiff(tut.got, tut.exp);
  check('tutorial: vertices = tutorial "path" node world matrix * (nav corner + 0.04 up), within 1 cm', dt <= TOL, `diff ${dt.toFixed(4)} m over ${tut.corners && tut.corners.length} corners`);
  const tdist = tut.got.map(p => Math.hypot(p[0] - tut.me[0], p[1] - tut.me[1], p[2] - tut.me[2]));
  console.log(`INFO tutorial: player ${tut.me.map(v => v.toFixed(1))}, target ${tut.pointer && tut.pointer.pos.map(v => v.toFixed(1))}, line points at ${tdist.map(v => v.toFixed(0))} m from the player`);
  const eye = await page.evaluate(() => window.__pl.g.view.camera.position.toArray());
  await page.evaluate(() => window.__step(1, true));
  await shot(page, 'pathline-tutorial-player-camera.png');
  await lookFrom(page, shot, 'pathline-tutorial-high.png', [tut.me[0] + 30, tut.me[1] + 150, tut.me[2] + 40], [tut.me[0] - 60, tut.me[1], tut.me[2] + 10], 70);
  await lookFrom(page, shot, 'pathline-tutorial-xray.png', [(tut.me[0] + tut.got[0][0]) / 2, tut.me[1] + 70, tut.me[2] + 110], [(tut.me[0] + tut.got[0][0]) / 2, tut.me[1] - 10, tut.me[2]], 60, { player: tut.me, target: tut.pointer.pos });
  check('no page errors in the tutorial run', errors.length === 0, errors.join(' | '));
  await ctx.close();
});
