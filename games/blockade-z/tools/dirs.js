// Directions: for every hero's own weapon, fired or swung level, 45 degrees up and 30 degrees down, in first and in third
// person, this measures where things point instead of trusting the eye:
//   tracer      it starts at the muzzle (third person: within 0.3 m of the gun's tip; first person: just ahead of the camera,
//               on the side of the barrel that fired) and its drawn body runs toward the point hit, not back through the shooter
//   projectile  a thrown or launched body keeps its nose (+z of its root; -z for the rockets) along its velocity; a long body lies along its flight
//   slash       the blade's trail sweeps the way the swing is declared to go (PATDIR / over / upper), the same in both views
//   impact      sparks leave the surface on the shooter's side (the normal faces back along the shot)
// Usage: PLAYWRIGHT_PATH=<playwright-core> [ONLY=gio,mua] node games/blockade-z/tools/dirs.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const OUT = process.argv[2] || '.chk-dirs'; fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const PITCH = [['level', 0], ['up45', Math.PI / 4], ['down30', -Math.PI / 6]];
const fails = []; let passed = 0;
const check = (ok, name) => { if (ok) passed++; else fails.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name); };

// runs in the page: one weapon, one pitch, in whichever view is on
const MEASURE = `((pitch) => { const G = __G; const T = G.THREE; const V = () => new T.Vector3(); const W = G.weapons; const S = W.S; const P = G.player; const w = W.WEAPONS[W.cur()]; const D = W.dbgDir();
  G.god = true; G.state = 'playing'; P.alive = true; G.wave.toSpawn = 0; G.wave.bossAt = -1; G.zombies.clear(); if (G.allies) G.allies.clear(); G.fx.clear();
  P.pos.set(0, 0, 12); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = pitch; P.input.fire = false; __sim(0.7);
  const aim = G.camera.getWorldDirection(V()); const cam = G.camera.position.clone(); const right = V().set(Math.cos(P.yaw), 0, -Math.sin(P.yaw)); const r = { view: G.tps.on ? 'tp' : 'fp', weapon: W.cur() };
  const r2 = (v) => +v.toFixed(2);
  if (w.melee) {
    // three tough bodies in reach so every swing of the combo lands; the trail's tip is sampled all through each swing
    for (const dx of [-0.7, 0, 0.7]) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (z) { z.pos.set(dx, 0, 12 - 1.9); z.speed = 0; z.hp = z.maxHp = 1e6; } }
    __sim(0.1); const swings = []; let cur = null; let last = null; P.input.fire = true;
    for (let i = 0; i < 260 && swings.length < 4; i++) { __sim(1 / 60); P.pitch = pitch; const sw = S.swing;
      if (sw && sw !== last) { cur = { pat: sw.pat, fp: [], tp: [] }; swings.push(cur); last = sw; }
      if (cur && sw === last) { const tp = D.trailPts[D.trailPts.length - 1]; if (tp && tp.age < 0.03) cur.fp.push(tp.a.clone()); const rib = G.tps.dbgRib && G.tps.dbgRib(); const rp = rib && rib.pts[rib.pts.length - 1]; if (G.tps.on && rp && rp.age < 0.03) cur.tp.push(rp.a.clone()); } }
    P.input.fire = false; __sim(0.4);
    r.swings = swings.slice(0, 3).map((s) => { const pts = G.tps.on ? s.tp : s.fp; const o = { pat: s.pat, dir: D.PATDIR[s.pat] ?? null, n: pts.length };
      if (pts.length > 2) { const d = pts[pts.length - 1].clone().sub(pts[0]);
        // first person points live in the view model's own space (x right, y up); third person points are in the world
        o.dx = r2(G.tps.on ? d.dot(right) : d.x); o.dy = r2(d.y); } return o; });
    return r;
  }
  // guns and thrown weapons: hook the tracer and the impact, note what appears in the scene
  const rec = []; const imp = []; const f0 = G.fx.tracer; const i0 = G.fx.impact; G.fx.tracer = (a, b, c) => { rec.push({ a: a.clone(), b: b.clone(), side: S.side }); return f0(a, b, c); }; G.fx.impact = (at, n, tag) => { imp.push([n[0], n[1], n[2]]); return i0(at, n, tag); };
  const before = new Set(G.scene.children); P.input.fire = true; let shots0 = S.shots;
  for (let i = 0; i < 150 && !rec.length && !(w.thrown || w.rocket ? S.shots > shots0 : false); i++) { __sim(1 / 60); P.pitch = pitch; }
  P.input.fire = false; G.fx.tracer = f0; G.fx.impact = i0;
  if (rec.length) { const t = rec[0]; const m = G.fx.dbgTracers.filter((x) => x.m.visible).map((x) => x.m).sort((p, q) => p.position.distanceTo(t.a) - q.position.distanceTo(t.a))[0];
    const ab = t.b.clone().sub(t.a).normalize(); r.tracer = { fromCam: r2(t.a.distanceTo(cam)), ahead: r2(t.a.clone().sub(cam).dot(aim)), sideOff: r2(t.a.clone().sub(cam).dot(right)), aimDot: r2(ab.dot(aim)), len: r2(t.a.distanceTo(t.b)) };
    if (m) { m.updateMatrixWorld(true); if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; const far = m.localToWorld(V().set(0, 0, Math.abs(bb.max.z) > Math.abs(bb.min.z) ? bb.max.z : bb.min.z)); /* the end of the drawn body that is not at the muzzle */ r.tracer.drawnDot = r2(far.clone().sub(t.a).normalize().dot(ab)); r.tracer.farErr = r2(far.distanceTo(t.b)); }
    const mz = V(); if (G.tps.on && G.tps.muzzle(mz, t.side)) r.tracer.fromMuzzle = r2(t.a.distanceTo(mz)); r.tracer.side = t.side || 0; }
  if (imp.length) r.impact = { n: imp.length, normalDotAim: r2(imp[0][0] * aim.x + imp[0][1] * aim.y + imp[0][2] * aim.z) };
  if (w.thrown || w.rocket) { __sim(0.05); const news = G.scene.children.filter((o) => !before.has(o) && !o.isSprite && !o.isLight && !o.isPoints); const p0 = news.map((o) => o.position.clone()); __sim(0.05);
    r.projs = []; news.forEach((o, i) => { const d = o.position.clone().sub(p0[i]); if (d.length() < 0.5 || !o.parent) return; const v = d.normalize(); if (v.dot(aim) < 0.5) return; /* debris of a blast is not the projectile */ o.updateMatrixWorld(true);
      // the body's own box, in the root's axes: which of them is the long one
      const inv = new T.Matrix4().copy(o.matrixWorld).invert(); const box = new T.Box3(); o.traverse((c) => { if (!c.isMesh || !c.visible) return; if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, c.matrixWorld)); box.union(b); });
      const sz = box.getSize(V()); const dims = [sz.x, sz.y, sz.z]; const li = dims.indexOf(Math.max(...dims)); const sorted = dims.slice().sort((a, b) => b - a); const axis = V().setFromMatrixColumn(o.matrixWorld, li).normalize(); const fwd = V().setFromMatrixColumn(o.matrixWorld, 2).normalize().multiplyScalar(w.rocket ? -1 : 1); /* a rocket is modelled nose toward -z */
      r.projs.push({ noseDot: r2(fwd.dot(v)), longAxis: 'xyz'[li], longDot: r2(Math.abs(axis.dot(v))), elong: r2(sorted[0] / Math.max(0.001, sorted[1])), vy: r2(v.y) }); }); }
  __sim(0.5); return r; })`;

// runs in the page: the hero's two skills, thrown level; whatever flies out is watched
const SKILLS = `(() => { const G = __G; const T = G.THREE; const V = () => new T.Vector3(); const P = G.player; const out = [];
  for (const key of ['KeyC', 'KeyF']) { G.god = true; G.state = 'playing'; P.alive = true; G.zombies.clear(); G.fx.clear(); P.pos.set(0, 0, 12); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0.1; __sim(0.5);
    for (const dx of [-1, 1]) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (z) { z.pos.set(dx, 0, -2); z.speed = 0; z.hp = z.maxHp = 1e6; } }
    const aim = G.camera.getWorldDirection(V()); const before = new Set(G.scene.children); const seen = new Map();
    dispatchEvent(new KeyboardEvent('keydown', { code: key })); __sim(0.12); dispatchEvent(new KeyboardEvent('keyup', { code: key }));
    for (let i = 0; i < 16; i++) { const objs = G.scene.children.filter((o) => !before.has(o) && !o.isSprite && !o.isLight && !o.isPoints && !o.isLine && !seen.has(o)); const p0 = objs.map((o) => o.position.clone()); __sim(0.05);
      objs.forEach((o, j) => { if (!o.parent) return; const d = o.position.clone().sub(p0[j]); const sp = d.length() / 0.05; if (sp < 8) return; const v = d.normalize(); o.updateMatrixWorld(true);
        const inv = new T.Matrix4().copy(o.matrixWorld).invert(); const box = new T.Box3(); let meshes = 0; o.traverse((c) => { if (!c.isMesh || !c.visible || !c.geometry.attributes.position || c.geometry.attributes.position.count > 400) return; meshes++; if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, c.matrixWorld))); });
        if (!meshes) return; const sz = box.getSize(V()); const dims = [sz.x, sz.y, sz.z]; const li = dims.indexOf(Math.max(...dims)); const sorted = dims.slice().sort((a, b) => b - a); const axis = V().setFromMatrixColumn(o.matrixWorld, li).normalize();
        seen.set(o, 1); out.push({ key, speed: Math.round(sp), along: +v.dot(aim).toFixed(2), elong: +(sorted[0] / Math.max(0.001, sorted[1])).toFixed(2), longAxis: 'xyz'[li], longDot: +Math.abs(axis.dot(v)).toFixed(2), len: +sorted[0].toFixed(2) }); }); }
    __sim(1.2); }
  return out; })()`;

(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  const rows = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'dirs@test' })); } catch (e) {} });
    const page = await ctx.newPage(); const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    const base = (process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&autostart=1&nolock=1&god=1&noaudio=1&seed=5&tod=0.5&post=0';
    await page.goto(base + '&hero=gio'); await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const heroes = (await page.evaluate('BZ.HEROES.map((h) => h.id)')).filter((h) => !ONLY || ONLY.includes(h));
    for (const h of heroes) {
      for (const view of ['fp', 'tp']) {
        await page.goto(base + '&hero=' + h + (view === 'tp' ? '&tp=1' : '&fp=1')); await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
        if (view === 'tp') { const sk = await page.evaluate(SKILLS); console.log('skills ' + h + ' ' + JSON.stringify(sk)); for (const o of sk) { const nm = `${h} skill ${o.key.slice(3)}: a body flying at ${o.speed} m/s`; check(o.along > 0.3, `${nm} leaves along the aim (${o.along})`); if (o.elong > 1.6 && o.len > 0.3) check(o.longDot > 0.9, `${nm}: its long axis (${o.longAxis}, ${o.len} m) lies along the flight (${o.longDot})`); } await page.goto(base + '&hero=' + h + '&tp=1'); await page.waitForFunction('window.__ready === true', null, { timeout: 60000 }); }
        for (const [pn, pitch] of PITCH) { const r = await page.evaluate(MEASURE + '(' + pitch + ')'); r.hero = h; r.pitch = pn; rows.push(r); console.log(JSON.stringify(r)); }
      }
    }
    fs.writeFileSync(path.join(OUT, 'dirs.json'), JSON.stringify(rows, null, 1));
    // ---- the rules ----
    for (const r of rows) {
      const id = `${r.hero}/${r.weapon} ${r.view} ${r.pitch}`;
      if (r.tracer) { const t = r.tracer;
        check(t.drawnDot > 0.95 && t.farErr < 0.3, `${id}: the tracer's body runs from the muzzle to the point hit (drawn ${t.drawnDot}, far end ${t.farErr} m off)`);
        check(t.aimDot > (r.view === 'tp' ? 0.82 : 0.9), `${id}: the tracer goes where the weapon is aimed (${t.aimDot}; in third person the gun sits beside the camera, so a near hit is seen at an angle)`);
        if (r.view === 'tp') check(t.fromMuzzle !== undefined && t.fromMuzzle < 0.3, `${id}: the tracer starts at the gun's tip (${t.fromMuzzle} m from it)`);
        else check(t.ahead > 0.2 && t.fromCam < 1.1, `${id}: the tracer starts just ahead of the camera (${t.ahead} m ahead, ${t.fromCam} m away)`);
      }
      if (r.impact) check(r.impact.normalDotAim < -0.05, `${id}: sparks leave the wall toward the shooter (normal . aim ${r.impact.normalDotAim})`);
      for (const p of r.projs || []) { check(p.noseDot > 0.95, `${id}: the projectile's nose follows its velocity (${p.noseDot}, flying ${p.vy > 0.3 ? 'up' : p.vy < -0.3 ? 'down' : 'level'})`); if (p.elong > 1.5) check(p.longDot > 0.95, `${id}: the long axis (${p.longAxis}) lies along the flight (${p.longDot})`); }
      for (const [i, s] of (r.swings || []).entries()) { if (s.n < 3 || s.dx === undefined) continue; const nm = `${id} swing ${i + 1} (${s.pat})`;
        if (s.dir) check(Math.sign(s.dx) === Math.sign(s.dir) && Math.abs(s.dx) > 0.05, `${nm}: the trail sweeps ${s.dir > 0 ? 'left to right' : 'right to left'} as declared (dx ${s.dx})`);
        else if (s.pat === 'over') check(s.dy < -0.05, `${nm}: an overhead chop comes down (dy ${s.dy})`);
        else if (s.pat === 'upper') check(s.dy > 0.05, `${nm}: an uppercut goes up (dy ${s.dy})`); }
    }
    // the two views must agree swing by swing
    for (const r of rows.filter((x) => x.view === 'fp' && x.swings)) { const t = rows.find((x) => x.view === 'tp' && x.hero === r.hero && x.pitch === r.pitch); if (!t || !t.swings) continue;
      r.swings.forEach((s, i) => { const u = t.swings[i]; if (!u || s.pat !== u.pat || s.n < 3 || u.n < 3 || !s.dir) return; check(Math.sign(s.dx) === Math.sign(u.dx), `${r.hero}/${r.weapon} ${r.pitch} swing ${i + 1} (${s.pat}): first and third person sweep the same way (fp dx ${s.dx}, tp dx ${u.dx})`); }); }
    check(problems.length === 0, 'no page errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? `${fails.length} FAIL of ${fails.length + passed}` : `ALL PASS (${passed} checks)`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
