// Block gate: every visible character mesh (beast forms at both lods, zombies, bosses) must be built from blocks.
// Per connected component at rest pose: <= 26 distinct face normals, <= 8 normals in one ring plane (10 deg),
// and <= 5% of its area with vertex normals off the face normal by more than 10 deg. Synthetic controls run first.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/block-test.mjs [--only=beast|foe|zombie|boss] [--quick]
import fs from 'node:fs';
import { serve, launch, open, checker } from './pw.mjs';

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const ONLY = arg('only') || 'all';
const QUICK = process.argv.includes('--quick');
const want = (g) => ONLY === 'all' || ONLY === g || (ONLY === 'foe' && (g === 'zombie' || g === 'boss'));
// the page's own cache key, so the tool imports the same module instances the page loaded
const V = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/js\/main\.js\?v=(\d{8}[a-z])/)[1];
const DEMO = '/games/ai-sinh-ton/beast-demo.html';
const { check, done } = checker();

// runs in the page: geoms = [{ pos, idx|null, nor|null }]
const ANALYZE = function (geoms) {
  const MAXN = 26, MAXRING = 8, MAXSMOOTH = 0.05, TINY = 0.005;
  const COS3 = Math.cos(3 * Math.PI / 180), SIN10 = Math.sin(10 * Math.PI / 180), COS10 = Math.cos(10 * Math.PI / 180);
  const comps = []; let total = 0;
  for (const g of geoms) {
    const pos = g.pos; const nv = pos.length / 3; const idx = g.idx || Array.from({ length: nv }, (_, i) => i);
    const par = new Int32Array(nv).map((_, i) => i);
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    const seen = new Map();
    for (let i = 0; i < nv; i++) { const k = Math.round(pos[3 * i] / 1e-4) + ',' + Math.round(pos[3 * i + 1] / 1e-4) + ',' + Math.round(pos[3 * i + 2] / 1e-4); if (seen.has(k)) uni(i, seen.get(k)); else seen.set(k, i); }
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
    for (const C of by.values()) { C.g = g; comps.push(C); }
  }
  let kept = 0, tiny = 0, worstN = 0, worstRing = 0, worstSmooth = 0, red = 0; const why = new Set();
  for (const C of comps) {
    if (C.area < TINY * total) { tiny++; continue; }
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
    worstN = Math.max(worstN, dirs.length); worstRing = Math.max(worstRing, ring); worstSmooth = Math.max(worstSmooth, smooth);
    let bad = false;
    if (dirs.length > MAXN) { bad = true; why.add('normals'); }
    if (ring > MAXRING) { bad = true; why.add('ring'); }
    if (smooth > MAXSMOOTH) { bad = true; why.add('smooth'); }
    if (bad) red++;
  }
  return { parts: kept, tiny, worstN, ring: worstRing, smooth: worstSmooth, red: red > 0, why: [...why] };
};
const pack = (g) => ({ pos: Array.from(g.attributes.position.array), idx: g.index ? Array.from(g.index.array) : null, nor: g.attributes.normal ? Array.from(g.attributes.normal.array) : null });

const fmt = (r) => `${r.parts} parts, worst ${r.worstN} normals, ring ${r.ring}, smooth ${(r.smooth * 100).toFixed(1)}%${r.tiny ? `, ${r.tiny} tiny ignored` : ''}${r.red ? ` -> ${r.why.join('+')}` : ''}`;
const stat = {};
const verdict = (grp, name, r) => { (stat[grp] ||= { pass: 0, fail: 0 })[r.red ? 'fail' : 'pass']++; check(!r.red, `${name}: ${fmt(r)}`); };

const srv = await serve();
const br = await launch();
try {
  const d = await open(br, srv.base, 'desktop', 'shot=1&freeze=1&lod=battle', { path: DEMO, fresh: true });
  await d.page.evaluate(`window.__blk = ${ANALYZE.toString()}`);

  const controls = await d.page.evaluate(() => {
    const T = window.THREE; const P = (g) => ({ pos: Array.from(g.attributes.position.array), idx: g.index ? Array.from(g.index.array) : null, nor: g.attributes.normal ? Array.from(g.attributes.normal.array) : null });
    const box = new T.BoxGeometry(1, 1, 1);
    const b = new T.BoxGeometry(1, 1, 1); const pp = b.attributes.position; const map = new Map(); const pos = []; const idx = [];
    for (let i = 0; i < pp.count; i++) { const k = [pp.getX(i), pp.getY(i), pp.getZ(i)].join(','); if (!map.has(k)) { map.set(k, pos.length / 3); pos.push(pp.getX(i), pp.getY(i), pp.getZ(i)); } idx.push(map.get(k)); }
    const shared = new T.BufferGeometry(); shared.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); shared.setIndex(idx); shared.computeVertexNormals();
    const run = (g) => window.__blk([P(g)]);
    return { box: run(box), sphere: run(new T.SphereGeometry(0.5, 8, 6)), cyl12: run(new T.CylinderGeometry(0.5, 0.5, 1, 12)), cyl8: run((() => { const c = new T.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed(); c.deleteAttribute('normal'); c.computeVertexNormals(); return c; })()), smoothBox: run(shared) };
  });
  const ctl = (name, r, redExpected, why) => check(r.red === redExpected && (!why || r.why.includes(why)), `control ${name}: ${fmt(r)} (expected ${redExpected ? 'RED' + (why ? ' ' + why : '') : 'green'})`);
  ctl('box', controls.box, false);
  ctl('sphere 8x6', controls.sphere, true);
  ctl('cylinder 12 sides', controls.cyl12, true, 'ring');
  ctl('cylinder 8 sides (flat)', controls.cyl8, false);
  ctl('merged smooth box', controls.smoothBox, true, 'smooth');

  if (want('beast')) {
    const keys = await d.page.evaluate(async (v) => (Object.keys((await import(`/games/ai-sinh-ton/js/view/beast/index.js?v=${v}`)).FORMS)), '20261122a');
    for (const lod of QUICK ? ['battle'] : ['battle', 'portrait']) {
      for (const key of keys) {
        const geos = await d.page.evaluate(async ([k, l]) => {
          const { buildBeast } = await import('/games/ai-sinh-ton/js/view/beast/index.js?v=20261122a');
          const [id, f] = k.split('.'); const b = buildBeast({ id, form: +f[0], branch: f[1] || null }, { lod: l });
          const out = []; const seen = new Set();
          b.root.traverse((o) => { if (!o.isMesh || !o.visible || /line$/.test(o.name) || seen.has(o.geometry.uuid)) return; seen.add(o.geometry.uuid); const g = o.geometry; out.push({ pos: Array.from(g.attributes.position.array), idx: g.index ? Array.from(g.index.array) : null, nor: g.attributes.normal ? Array.from(g.attributes.normal.array) : null }); });
          b.dispose(); return window.__blk(out);
        }, [key, lod]);
        verdict('beast', `beast ${key} ${lod}`, geos);
      }
    }
  }
  if (want('zombie')) {
    const kinds = await d.page.evaluate(async (v) => { const { zombieGeos } = await import(`/games/ai-sinh-ton/js/view/foe/zombies.js?v=${v}`); const z = zombieGeos(); return Object.keys(z); }, V);
    for (const k of kinds) {
      const r = await d.page.evaluate(async ([v, kind]) => {
        const { zombieGeos } = await import(`/games/ai-sinh-ton/js/view/foe/zombies.js?v=${v}`); const g = zombieGeos()[kind].geo;
        return window.__blk([{ pos: Array.from(g.attributes.position.array), idx: g.index ? Array.from(g.index.array) : null, nor: g.attributes.normal ? Array.from(g.attributes.normal.array) : null }]);
      }, [V, k]);
      verdict('zombie', `zombie ${k}`, r);
    }
  }
  await d.ctx.close();

  if (want('boss')) {
    const g = await open(br, srv.base, 'desktop', 'autostart=1&stage=1&noaudio=1&seed=1&q=low', { noWait: true });
    await g.page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    await g.page.evaluate(`window.__blk = ${ANALYZE.toString()}`);
    const kinds = await g.page.evaluate(async (v) => { const { SHELLS } = await import(`/games/ai-sinh-ton/js/view/foe/bosses.js?v=${v}`); return [...new Set([...Object.keys(SHELLS), 'giant', 'thrower', 'phantom', 'queen', 'brood'])]; }, V);
    for (const kind of kinds) {
      const r = await g.page.evaluate(async ([v, k]) => {
        const { bossModel } = await import(`/games/ai-sinh-ton/js/view/bossacts.js?v=${v}`);
        const m = bossModel(k); if (!m) return null;
        m.root.updateMatrixWorld(true);
        const out = []; const seen = new Set(); let old = 0, shell = 0;
        m.root.traverse((o) => {
          if (!(o.isMesh && !o.isInstancedMesh) || o.layers.mask === 0 || !o.geometry || !o.geometry.attributes.position) return;
          for (let p = o; p; p = p.parent) if (!p.visible) return;
          if (o.material && !Array.isArray(o.material) && o.material.side === 1 && o.material.side !== 0) return;
          if (o.userData.shell) shell++; else old++;
          const gg = o.geometry; if (seen.has(gg.uuid)) return; seen.add(gg.uuid);
          out.push({ pos: Array.from(gg.attributes.position.array), idx: gg.index ? Array.from(gg.index.array) : null, nor: gg.attributes.normal ? Array.from(gg.attributes.normal.array) : null });
        });
        const res = window.__blk(out); res.old = old; res.shell = shell; return res;
      }, [V, kind]);
      if (!r) { (stat.boss ||= { pass: 0, fail: 0 }).fail++; check(false, `boss ${kind}: no model`); continue; }
      verdict('boss', `boss ${kind} (${r.shell} shell meshes, ${r.old} old meshes visible)`, r);
    }
    await g.ctx.close();
  }
} finally { await br.close(); srv.close(); }
console.log('\n' + Object.entries(stat).map(([k, v]) => `${k}: ${v.pass} pass, ${v.fail} fail`).join('\n'));
done();
