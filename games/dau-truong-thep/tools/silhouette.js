// Silhouette gate: draws every mech with a style row (the hand-made designs and the newer tanks) at form II, top-down
// and orthographic, into an alpha mask at one scale for all, aligns the masks on their centroids with the nose to +x,
// and compares every pair by intersection over union. Fails when a newer tank is too close to any other mech, or when
// its signature pieces spread its top view past --spread (1.3) times the frame without them (match camera framing).
//   node tools/silhouette.js [--max 0.8] [--top 10] [--png dir]
// Runs in Node (no browser): the same buildModel() the game uses, rasterised in software. Also prints triangles per mech.
'use strict';
const path = require('path');
const fs = require('fs');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg('--max', 0.8)), SPREAD = Number(arg('--spread', 1.3)), TOP = Number(arg('--top', 10)), PNG = arg('--png', '');
const { ROLE, fillPending } = require('./pending-mechs.js');
const PX = 40, W = 360; // 40 px per model unit, 9 x 9 units

(async () => {
  const root = path.join(__dirname, '..');
  const THREE = await import(path.join(root, 'vendor/three.module.min.js'));
  const data = await import(path.join(root, 'js/data.js'));
  const st = await import(path.join(root, 'js/gfx/styles.js'));
  const mechs = await import(path.join(root, 'js/gfx/mechs.js'));
  fillPending(data.MECHS, st.STYLES, data.BOSSES, ROLE);
  const orig = mechs.DESIGN_KEYS.filter((k) => st.STYLES[k] && data.MECH_ORDER.includes(k));
  const fresh = Object.keys(st.STYLES).filter((k) => !mechs.DESIGN_KEYS.includes(k));
  const keys = orig.concat(fresh);
  const V = new THREE.Vector3();
  const masks = {}, tris = {}, spread = {};
  const render = (key, s) => {
    const { b, info } = mechs.buildModel(key, s, st.formPaint(s.body, 2), new THREE.Color(s.trim), new THREE.Color(s.deep), 2);
    const geos = b.build();
    const S = (info.S || 1) * st.FORM_SCALE[1];
    const m = new Uint8Array(W * W);
    let nt = 0;
    const draw = (g, mat, n = 1) => {
      const p = g.attributes.position; nt += p.count / 3 * n;
      const q = [];
      for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i).applyMatrix4(mat).multiplyScalar(S); q.push(W / 2 + V.x * PX, W / 2 + V.z * PX); }
      for (let i = 0; i < q.length; i += 6) tri(m, q[i], q[i + 1], q[i + 2], q[i + 3], q[i + 4], q[i + 5]);
    };
    const I = new THREE.Matrix4();
    for (const n of ['hull', 'turret']) if (geos[n]) draw(geos[n], I);
    for (const n of ['flame', 'tflame']) if (geos[n]) nt += geos[n].attributes.position.count / 3;
    (info.legs || []).forEach((L, i) => { const g = geos['leg' + i]; if (g) draw(g, new THREE.Matrix4().makeRotationY(L.yaw || 0).premultiply(new THREE.Matrix4().makeTranslation(L.p[0], L.p[1], L.p[2]))); });
    for (const P of info.parts || []) {
      const g = geos[P.name]; if (!g) continue;
      if (P.at) { for (const a of P.at) draw(g, new THREE.Matrix4().makeTranslation(a[0], a[1], a[2])); }
      else draw(g, P.p && !P.model ? new THREE.Matrix4().makeTranslation(P.p[0], P.p[1], P.p[2]) : I);
    }
    for (const g of Object.values(geos)) g.dispose();
    return { m, nt: Math.round(nt) };
  };
  for (const key of keys) {
    const r = render(key, st.STYLES[key]);
    masks[key] = centre(r.m); tris[key] = r.nt;
    // Spread: the full model's top-view extent over the same frame without its signature pieces (hull, gear, turret, gun).
    if (st.STYLES[key].frame) {
      const bare = render(key, { ...st.STYLES[key], frame: { ...st.STYLES[key].frame, sig: [] } });
      const f = box(r.m), o = box(bare.m);
      spread[key] = Math.max(f.l / o.l, f.w / o.w);
    }
  }
  // Pairwise IoU.
  const area = {}; for (const k of keys) { let a = 0; for (const v of masks[k]) a += v; area[k] = a; }
  const pairs = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = masks[keys[i]], c = masks[keys[j]]; let n = 0;
    for (let t = 0; t < a.length; t++) n += a[t] & c[t];
    pairs.push({ a: keys[i], b: keys[j], iou: n / (area[keys[i]] + area[keys[j]] - n) });
  }
  pairs.sort((x, y) => y.iou - x.iou);
  const isNew = (k) => fresh.includes(k);
  const gated = pairs.filter((p) => isNew(p.a) || isNew(p.b));
  const fails = gated.filter((p) => p.iou > MAX);
  console.log(`${keys.length} mechs (${orig.length} hand-made, ${fresh.length} newer), ${pairs.length} pairs, ${gated.length} gated (any pair with a newer tank)`);
  console.log(`worst ${TOP} pairs:`);
  for (const p of pairs.slice(0, TOP)) console.log(`  ${p.iou.toFixed(3)}  ${p.a} ~ ${p.b}${isNew(p.a) || isNew(p.b) ? '' : '  (both hand-made, not gated)'}`);
  // Each newer tank's closest neighbour.
  const near = {};
  for (const p of pairs) for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) if (isNew(x) && !near[x]) near[x] = { k: y, iou: p.iou };
  console.log('closest neighbour of each newer tank:');
  console.log('  ' + fresh.map((k) => `${k}~${near[k].k} ${near[k].iou.toFixed(2)}`).join(', '));
  const ot = orig.map((k) => tris[k]), nt = fresh.map((k) => tris[k]);
  const st2 = (a) => `min ${Math.min(...a)}, median ${a.slice().sort((x, y) => x - y)[a.length >> 1]}, max ${Math.max(...a)}`;
  console.log(`triangles at form II: hand-made ${st2(ot)}; newer ${st2(nt)}`);
  console.log('  ' + keys.map((k) => `${k} ${tris[k]}`).join(', '));
  if (PNG) {
    fs.mkdirSync(PNG, { recursive: true });
    for (const k of keys) fs.writeFileSync(path.join(PNG, k + '.pgm'), Buffer.concat([Buffer.from(`P5 ${W} ${W} 255\n`), Buffer.from(masks[k].map((v) => (v ? 255 : 0)))]));
  }
  const wide = Object.keys(spread).filter((k) => spread[k] > SPREAD);
  console.log('spread (full extent / extent without signature pieces): ' + Object.keys(spread).map((k) => `${k} ${spread[k].toFixed(2)}`).join(', '));
  for (const k of wide) console.log(`FAIL: ${k} spreads ${spread[k].toFixed(2)}x its hull footprint (limit ${SPREAD})`);
  console.log(fails.length ? `FAIL: ${fails.length} gated pairs above IoU ${MAX}` : `PASS: every gated pair at or below IoU ${MAX}`);
  process.exitCode = fails.length || wide.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 2; });

// Fill one triangle (pixel centres inside, either winding).
function tri(m, x0, y0, x1, y1, x2, y2) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(W - 1, Math.ceil(Math.max(y0, y1, y2)));
  const d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(d) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5;
    const a = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / d, c = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / d;
    if (a >= 0 && c >= 0 && a + c <= 1) m[y * W + x] = 1;
  }
}
// Extent of a mask along x (length) and z (width), in pixels.
function box(m) {
  let x0 = W, x1 = -1, y0 = W, y1 = -1;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { l: x1 - x0 + 1, w: y1 - y0 + 1 };
}
// Shift a mask so its centroid sits in the middle.
function centre(m) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { sx += x; sy += y; n++; }
  const dx = Math.round(W / 2 - sx / n), dy = Math.round(W / 2 - sy / n), o = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { const X = x + dx, Y = y + dy; if (X >= 0 && X < W && Y >= 0 && Y < W) o[Y * W + X] = 1; }
  return o;
}
