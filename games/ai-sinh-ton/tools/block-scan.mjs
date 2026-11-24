// Round-mesh sweep of the real game (Addendum 11, round 2). block-test judges the models the beast, zombie and boss
// modules build; this walks the scene of real fights (a boss stage per chapter, crowded stages, teams that summon) and
// the screens outside the fight (home diorama, heroes, evolve, gacha), and judges every visible Mesh / InstancedMesh with
// the same per-component normal count as tools/block-test.mjs (ANALYZE below is a copy of it), plus one more rule for
// flat parts: a planar component whose outline has more than 8 edge directions is a disc (a cylinder cap or a round
// decal drawn as geometry). The block world (island, abyss, world glow), the HUD plates and the exemptions listed in
// EXEMPT are skipped. Prints each round mesh left: geometry type, on-screen size, parent path, the source guessed.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/block-scan.mjs [--quick] [--only=fight|screens]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, ROOT } from './pw.mjs';

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const QUICK = process.argv.includes('--quick');
const ONLY = arg('only') || 'all';
const { check, done } = checker();
// --shots=<tag>: pictures of what the scan judges (the summons up close, the menu screens) into .chk/a11/scan/<tag>/
const SHOTS = arg('shots') ? path.join(ROOT, '.chk', 'a11', 'scan', arg('shots')) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// copied from tools/block-test.mjs (keep in step): per connected component, <= 26 face normals, <= 8 in one ring plane,
// <= 5% of the area smooth-shaded; `disc` is this tool's addition for flat parts
const ANALYZE = function (geoms) {
  const MAXN = 26, MAXRING = 8, MAXSMOOTH = 0.05, TINY = 0.005;
  const COS3 = Math.cos(3 * Math.PI / 180), SIN10 = Math.sin(10 * Math.PI / 180), COS10 = Math.cos(10 * Math.PI / 180);
  const comps = []; let total = 0;
  for (const g of geoms) {
    const pos = g.pos; const nv = pos.length / 3; const idx = g.idx || Array.from({ length: nv }, (_, i) => i);
    const par = new Int32Array(nv).map((_, i) => i);
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    const seen = new Map(); const canon = new Int32Array(nv);
    for (let i = 0; i < nv; i++) { const k = Math.round(pos[3 * i] / 1e-4) + ',' + Math.round(pos[3 * i + 1] / 1e-4) + ',' + Math.round(pos[3 * i + 2] / 1e-4); if (seen.has(k)) { uni(i, seen.get(k)); canon[i] = seen.get(k); } else { seen.set(k, i); canon[i] = i; } }
    for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t + 1]); uni(idx[t], idx[t + 2]); }
    const by = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
      const wx = pos[3 * c] - pos[3 * a], wy = pos[3 * c + 1] - pos[3 * a + 1], wz = pos[3 * c + 2] - pos[3 * a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const len = Math.hypot(nx, ny, nz); const area = len / 2;
      if (area < 1e-10) continue;
      const r = find(a); let C = by.get(r); if (!C) { C = { tris: [], area: 0 }; by.set(r, C); }
      C.tris.push({ n: [nx / len, ny / len, nz / len], area, a, b, c }); C.area += area; total += area;
    }
    for (const C of by.values()) { C.g = g; C.canon = canon; comps.push(C); }
  }
  let kept = 0, worstN = 0, worstRing = 0, worstSmooth = 0, worstEdge = 0, red = 0; const why = new Set();
  for (const C of comps) {
    if (C.area < TINY * total) continue;
    kept++;
    const q = new Map();
    for (const t of C.tris) { const k = t.n.map((v) => Math.round(v / 0.02)).join(','); if (!q.has(k)) q.set(k, t.n); }
    const dirs = [];
    for (const n of q.values()) { if (!dirs.some((d) => d[0] * n[0] + d[1] * n[1] + d[2] * n[2] > COS3)) dirs.push(n); }
    let ring = 0; const M = dirs.length;
    const step = Math.max(1, Math.floor((M * M / 2) / 3000));
    let pc = 0;
    for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
      if ((pc++ % step) !== 0) continue;
      const a = dirs[i], b = dirs[j]; let px = a[1] * b[2] - a[2] * b[1], py = a[2] * b[0] - a[0] * b[2], pz = a[0] * b[1] - a[1] * b[0]; const l = Math.hypot(px, py, pz);
      if (l < 1e-3) continue; px /= l; py /= l; pz /= l;
      let cnt = 0; for (const d of dirs) if (Math.abs(d[0] * px + d[1] * py + d[2] * pz) < SIN10) cnt++;
      if (cnt > ring) ring = cnt;
    }
    let smooth = 0;
    const nor = C.g.nor;
    if (nor) {
      let bad = 0;
      for (const t of C.tris) {
        let off = false;
        for (const v of [t.a, t.b, t.c]) { const x = nor[3 * v], y = nor[3 * v + 1], z = nor[3 * v + 2]; const l = Math.hypot(x, y, z) || 1; if ((x * t.n[0] + y * t.n[1] + z * t.n[2]) / l < COS10) { off = true; break; } }
        if (off) bad += t.area;
      }
      smooth = bad / C.area;
    }
    // disc: a flat component (one face direction, or two facing away) whose open outline turns through > 8 directions
    let edgeDirs = 0;
    if (dirs.length <= 2) {
      const cnt = new Map(); const pos = C.g.pos; const K = C.canon;
      for (const t of C.tris) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const a = K[u], b = K[v]; const k = a < b ? a + ',' + b : b + ',' + a; cnt.set(k, (cnt.get(k) || 0) + 1); }
      const n0 = dirs[0]; const ax = Math.abs(n0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const e1 = [n0[1] * ax[2] - n0[2] * ax[1], n0[2] * ax[0] - n0[0] * ax[2], n0[0] * ax[1] - n0[1] * ax[0]]; const l1 = Math.hypot(...e1); e1.forEach((v, i) => { e1[i] = v / l1; });
      const e2 = [n0[1] * e1[2] - n0[2] * e1[1], n0[2] * e1[0] - n0[0] * e1[2], n0[0] * e1[1] - n0[1] * e1[0]];
      const angs = new Set();
      for (const [k, c] of cnt) {
        if (c !== 1) continue; const [a, b] = k.split(',').map(Number);
        const d = [pos[3 * b] - pos[3 * a], pos[3 * b + 1] - pos[3 * a + 1], pos[3 * b + 2] - pos[3 * a + 2]];
        const x = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]; const y = d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2];
        if (Math.hypot(x, y) < 1e-6) continue;
        let an = Math.atan2(y, x); if (an < 0) an += Math.PI; angs.add(Math.round(an / (Math.PI / 36)) % 36);
      }
      edgeDirs = angs.size;
    }
    worstN = Math.max(worstN, dirs.length); worstRing = Math.max(worstRing, ring); worstSmooth = Math.max(worstSmooth, smooth); worstEdge = Math.max(worstEdge, edgeDirs);
    let bad = false;
    if (dirs.length > MAXN) { bad = true; why.add('normals'); }
    if (ring > MAXRING) { bad = true; why.add('ring'); }
    if (smooth > MAXSMOOTH) { bad = true; why.add('smooth'); }
    if (edgeDirs > 8) { bad = true; why.add('disc'); }
    if (bad) red++;
  }
  return { parts: kept, worstN, ring: worstRing, smooth: worstSmooth, edge: worstEdge, red: red > 0, why: [...why] };
};

// runs in the page: every visible mesh under `roots`, skipping `skipTop` top-level names; one verdict per geometry.
// EXEMPT: what the scan leaves round on purpose, each with its reason (matched on the mesh in the page).
const SCAN = function ([where, skipTop, camKey]) {
  const T = window.THREE || (window.__G && window.__G.host && window.__G.host.THREE);
  const EXEMPT = [
    // a soft dark shadow blot under every unit: a shadow, not a body (W-bfx inventory: belongs to lighting)
    { why: 'blob shadow', test: (o) => o.isInstancedMesh && o.geometry.type === 'PlaneGeometry' && o.material.map && !o.material.blending },
    // the arena's edge light band, a ragged ring of light on the floor (W-bfx inventory: a light strip, kept)
    { why: 'arena edge light band', test: (o) => o.material && o.material.blending === T.AdditiveBlending && o.geometry.attributes.position.count > 400 && o.geometry.boundingBox && (o.geometry.computeBoundingBox(), o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y) < 0.05 },
    // decals and warning zones drawn by a pixel-snapped shader on a flat quad (W-bfx): the quad is square
    { why: 'flat decal quad', test: (o) => o.geometry.type === 'PlaneGeometry' },
    // the UI kit's own chrome in the UI scene: rounded plates, buttons, text shapes, icon plates (2D layout, not props)
    { why: 'UI chrome', test: (o, root) => root.tag === 'ui' && ['ExtrudeGeometry', 'ShapeGeometry', 'BufferGeometry'].includes(o.geometry.type) },
  ];
  const out = []; const seen = new Map();
  const roots = where();
  const cam = camKey();
  const v = new T.Vector3(); const box = new T.Box3();
  for (const root of roots) {
    root.scene.updateMatrixWorld(true);
    for (const top of root.scene.children) {
      if (skipTop.includes(top.name)) continue;
      top.traverse((o) => {
        if (!(o.isMesh || o.isInstancedMesh) || !o.geometry || !o.geometry.attributes.position) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        // a mesh off the camera's layers is not drawn (the boss shells hide the pool's own meshes this way)
        if (o.layers.mask === 0 || (root.cam && !o.layers.test(root.cam.layers))) return;
        if (o.isInstancedMesh && o.count === 0) return;
        if (o.material && o.material.opacity === 0) return;
        // an inverted-hull outline follows its parent's shape: judged on the parent (as block-test does)
        if (o.material && o.material.side === T.BackSide) return;
        const ex = EXEMPT.find((e) => { try { return e.test(o, root); } catch (er) { return false; } });
        const path = []; for (let p = o; p && p !== root.scene; p = p.parent) path.push(p.name || p.type); path.reverse();
        // on-screen size: the world box of the mesh projected through the scene's camera, in CSS px of the frame
        let px = 0;
        if (root.cam && !o.isInstancedMesh) {
          box.setFromObject(o); const W = root.w; const H = root.h; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (let i = 0; i < 8; i++) { v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(root.cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
          px = Math.round(Math.max((x1 - x0) * W, (y1 - y0) * H) / 2);
        }
        const g = o.geometry; const key = g.uuid;
        let r = seen.get(key);
        if (!r) { r = window.__blk([{ pos: Array.from(g.attributes.position.array), idx: g.index ? Array.from(g.index.array) : null, nor: g.attributes.normal ? Array.from(g.attributes.normal.array) : null }]); seen.set(key, r); }
        // smooth normals change nothing on an unlit material: only the shape counts there
        const why = o.material && o.material.type === 'MeshBasicMaterial' ? r.why.filter((w) => w !== 'smooth') : r.why;
        out.push({ where: root.tag, name: o.name, geo: g.type, verts: g.attributes.position.count, inst: o.isInstancedMesh ? o.count : 0, mat: o.material && o.material.type, add: !!(o.material && o.material.blending === T.AdditiveBlending), path: path.join(' > '), px, red: why.length > 0, why, worstN: r.worstN, ring: r.ring, edge: r.edge, exempt: ex ? ex.why : null, color: o.material && o.material.color ? o.material.color.getHexString() : '' });
      });
    }
  }
  void cam; return out;
};

const WORLD = ['island', 'abyss', 'glow'];
const fightRoots = `() => { const H = window.__G.host; const r = H.renderer.domElement.getBoundingClientRect(); return [{ tag: 'fight', scene: H.scene, cam: H.camera, w: r.width, h: r.height }]; }`;
// the UI's own scene (3D props drawn straight in it) and every visible viewport (portraits, diorama, gacha machine)
const uiRoots = `() => { const ui = window.__ui; const out = [{ tag: 'ui', scene: ui.scene, cam: null, w: 0, h: 0 }]; ui.scene.traverse((o) => { if (o.scene3 && o.visible) { let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (vis) out.push({ tag: 'viewport', scene: o.scene3, cam: o.camera, w: 100, h: 100 }); } }); return out; }`;

const rows = []; const summonKinds = new Set();
const srv = await serve(); const br = await launch();
const runScan = async (page, rootsFn, skip, tag) => {
  await page.evaluate(`window.__blk = ${ANALYZE.toString()}; window.__scan = ${SCAN.toString()}`);
  const r = await page.evaluate(`window.__scan([${rootsFn}, ${JSON.stringify(skip)}, () => null])`);
  for (const x of r) { x.at = tag; rows.push(x); }
};
try {
  if (ONLY === 'all' || ONLY === 'fight') {
    // a boss stage closing each chapter, the crowded stages, and teams that summon every kind (ults on)
    const BOSS = QUICK ? [5, 15] : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const TEAMS = [
      [{ id: 'nhim', form: 1 }, { id: 'cu', form: 1 }, { id: 'haily', form: 1 }, { id: 'bao', form: 1 }],
      [{ id: 'nhim', form: 2 }, { id: 'cu', form: 3 }, { id: 'haily', form: 2 }, { id: 'bao', form: 3 }],
      [{ id: 'tegiap', form: 3, branch: 'a' }, { id: 'loc', form: 3, branch: 'b' }, { id: 'haily', form: 3 }, { id: 'bao', form: 2 }],
    ];
    const plan = [...BOSS.map((n, i) => ({ n, team: TEAMS[i % TEAMS.length] })), { n: 3, team: TEAMS[0] }, { n: 8, team: TEAMS[1] }];
    for (const { n, team } of plan) {
      const g = await open(br, srv.base, 'xiaomi', `autostart=1&stage=${n}&noaudio=1&seed=3&q=low`, { freeze: true });
      const tag = `stage ${n}`;
      // scan several moments: early waves, mid fight with ults and summons up, the boss wave
      await g.page.evaluate(([n, team]) => { const G = window.__G; G.start(n, { seed: 3, teamSpec: team.map((t) => ({ ...t, mul: 3 })), auto: { ult: true, pick: 'best' } }); G.goto('hud', { stage: n }); }, [n, team]);
      const seenKinds = new Set();
      for (let k = 0; k < (QUICK ? 3 : 5); k++) {
        await g.page.evaluate(() => { for (let i = 0; i < 16; i++) { const B = window.__G.B; if (B) for (const u of B.heroes) if (u.alive && u.ult < 1) { u.ult = 1; u.ultReady = true; u.ultReadyT = -99; } window.__sim(0.5); } window.__step(8); });
        await runScan(g.page, fightRoots, WORLD, `${tag} t${k}`);
        const kinds = await g.page.evaluate(() => window.__G.B.units.filter((u) => u.summon && u.alive).map((u) => u.kind));
        if (SHOTS) for (const kind of new Set(kinds)) {
          if (seenKinds.has(kind) || summonKinds.has(kind)) continue;
          // the summon up close: the battle camera moved next to it for one render, then put back
          await g.page.evaluate((kind) => {
            const G = window.__G; const H = G.host; const u = G.B.units.find((x) => x.summon && x.alive && x.kind === kind); const n = G.actors.nodeOf(u.uid);
            const p = new H.THREE.Vector3(); n.getWorldPosition(p); window.__camSave = [H.camera.position.clone(), H.camera.quaternion.clone()];
            let top = n; while (top.parent && top.parent !== H.scene) top = top.parent;
            window.__hid = H.scene.children.filter((c) => c !== top && !c.isLight && c.visible); for (const c of window.__hid) c.visible = false;
            H.camera.position.set(p.x + 1.6, p.y + 1.6, p.z + 2.2); H.camera.lookAt(p.x, p.y + 0.4, p.z); H.render();
          }, kind);
          await g.page.locator('#frame').screenshot({ path: path.join(SHOTS, `summon-${kind}.png`) });
          await g.page.evaluate(() => { const H = window.__G.host; for (const c of window.__hid) c.visible = true; H.camera.position.copy(window.__camSave[0]); H.camera.quaternion.copy(window.__camSave[1]); });
        }
        for (const s of kinds) seenKinds.add(s);
      }
      console.log(`  ${tag}: summons on the field during the scans ${[...seenKinds].join(',') || 'none'}`);
      for (const s of seenKinds) summonKinds.add(s);
      await g.ctx.close();
    }
  }
  if (ONLY === 'all' || ONLY === 'screens') {
    const g = await open(br, srv.base, 'xiaomi', 'noaudio=1', { freeze: true });
    for (const [scr, opts] of [['home', {}], ['heroes', {}], ['gacha', {}], ['equip', {}], ['rewards', {}]]) {
      await g.page.evaluate(([s, o]) => { window.__G.goto(s, o); window.__step(30); }, [scr, opts]);
      await runScan(g.page, uiRoots, [], `screen ${scr}`);
      if (SHOTS) await g.page.locator('#frame').screenshot({ path: path.join(SHOTS, `screen-${scr}.png`) });
    }
    await g.ctx.close();
  }
} finally { await br.close(); srv.close(); }

// one line per distinct round thing (same geometry type, path and colour), first place it was seen
const red = rows.filter((r) => r.red && !r.exempt);
const key = (r) => `${r.geo} | ${r.path} | ${r.color} | ${r.why.join('+')}`;
const uniq = new Map(); for (const r of red) if (!uniq.has(key(r))) uniq.set(key(r), r);
const ex = new Map(); for (const r of rows.filter((r) => r.red && r.exempt)) ex.set(r.exempt, (ex.get(r.exempt) || 0) + 1);
console.log(`\nscanned ${rows.length} mesh sightings; exempt round: ${[...ex].map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
for (const r of uniq.values()) console.log(`ROUND ${r.at} [${r.where}]: ${r.geo} (${r.verts} verts${r.inst ? ', x' + r.inst : ''}) ${r.mat}${r.add ? ' additive' : ''} #${r.color} ~${r.px}px path "${r.path}" -> ${r.why.join('+')} (normals ${r.worstN}, ring ${r.ring}, edge ${r.edge})`);
check(rows.length > 0, `the scan saw meshes (${rows.length})`);
if (ONLY !== 'screens') check(['drone', 'cannon', 'wolf'].every((k) => summonKinds.has(k)), `the fights put summons on the field (${[...summonKinds].join(',')})`);
check(uniq.size === 0, `no round mesh left in the fights and screens (${uniq.size} distinct)`);
done();
