// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Stone arch bridge: 2-3 arches on piers with cutwaters, ashlar voussoirs, parapets, pilasters, road + sidewalks.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'stone-bridge',
  name: 'Cầu đá vòm',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const L = r.int(228, 268);                 // length (x)
    const W = r.int(42, 50);                   // width (z) of the deck
    const M0 = 8;                              // margin in z for cutwaters
    const c = new Canvas(L, 82, W + 2 * M0);
    const z0 = M0, z1 = M0 + W;
    const abut = 20, pier = v === 1 ? 14 : 18;
    // spans: [x0, x1, rise]
    const n = v === 0 ? 2 : 3;
    const avail = L - 2 * abut - (n - 1) * pier;
    let widths;
    if (v === 2) { const mid = Math.round(avail * 0.42), side = Math.floor((avail - mid) / 2); widths = [side, mid, avail - mid - side]; }
    else { const w = Math.floor(avail / n); widths = Array.from({ length: n }, (_, i) => i === n - 1 ? avail - w * (n - 1) : w); }
    const spring = v === 1 ? 10 : 8;
    const spans = []; let x = abut;
    for (let i = 0; i < n; i++) {
      const w = widths[i];
      const rise = v === 1 ? Math.round(w * 0.32) : (v === 2 && i === 1 ? Math.round(w * 0.5) : Math.round(w * 0.45 + (v === 0 ? 2 : 0)));
      spans.push([x, x + w, Math.min(rise, w / 2 * 1.0)]);
      x += w + pier;
    }
    const maxRise = Math.max(...spans.map(s => s[2]));
    const deckY = spring + maxRise + 9;          // top of the road bed stone
    const stone = M.stone;
    // main body, slightly lower at the ends for an approach hump
    for (let xx = 0; xx < L; xx++) {
      const e = Math.min(xx, L - 1 - xx);
      const y1 = deckY - (e < 14 ? Math.floor((14 - e) / 4) : 0);
      c.box(xx, 0, z0, xx + 1, y1, z1, stone);
    }
    // cutwaters on piers (pointed nose, both sides)
    for (let i = 0; i < n - 1; i++) {
      const px0 = spans[i][1], px1 = px0 + pier, pm = (px0 + px1) / 2;
      for (let k = 0; k < 7; k++) {
        const hw = Math.max(0, Math.round(pier / 2 - k * pier / 2 / 7 - 0.5));
        const top = spring + 12 - k;
        for (const zz of [z0 - 1 - k, z1 + k]) c.box(Math.round(pm - hw - 1), 0, zz, Math.round(pm + hw + 1), Math.max(2, top), zz + 1, stone);
      }
      for (const [za, zb] of [[z0 - 1, z0 - 2], [z1, z1 + 1]]) c.box(px0, spring + 11, Math.min(za, zb), px1, spring + 12, Math.max(za, zb) + 1, M.ashlar);
    }
    // carve arches (semi-ellipses) through the full width, and trim with ashlar voussoirs on the faces
    for (const [a0, a1, rise] of spans) {
      const cxm = (a0 + a1) / 2, rx = (a1 - a0) / 2;
      for (let xx = a0; xx < a1; xx++) {
        const u = (xx + 0.5 - cxm) / rx;
        const top = spring + rise * Math.sqrt(Math.max(0, 1 - u * u));
        for (let y = 0; y < top; y++) c.box(xx, y, z0 - 12, xx + 1, y + 1, z1 + 12, 0);
      }
      const rmin = Math.min(rx, rise);
      const t = 1 + 4.5 / rmin;
      for (let xx = a0 - 5; xx < a1 + 5; xx++) for (let y = 0; y < deckY; y++) {
        const u = (xx + 0.5 - cxm) / rx, w = (y + 0.5 - spring) / rise;
        const q = Math.sqrt(u * u + (y >= spring ? w * w : 0));
        if (q > 1 - 0.02 && q < t) for (let zz = z0; zz < z1; zz++) {
          const face = zz < z0 + 2 || zz >= z1 - 2;
          if (c.get(xx, y, zz) && (face || ((xx + y) % 7 === 0))) c.set(xx, y, zz, M.ashlar);
        }
      }
    }
    // springing course + string course below the parapet (ashlar bands)
    for (const zz of [z0, z0 + 1, z1 - 2, z1 - 1]) {
      for (let xx = 0; xx < L; xx++) { const e = Math.min(xx, L - 1 - xx); const y1 = deckY - (e < 14 ? Math.floor((14 - e) / 4) : 0); if (c.get(xx, y1 - 2, zz)) { c.set(xx, y1 - 2, zz, M.ashlar); c.set(xx, y1 - 3, zz, M.ashlar); } }
    }
    // end quoins
    for (const xs of [0, L - 4]) for (let y = 0; y < deckY - 4; y++) for (const zz of [z0, z1 - 1]) if ((y >> 1) % 2 === 0) c.box(xs, y, zz, xs + 4, y + 1, zz + 1, M.ashlar);
    // road bed: sidewalks raised, road surface asphalt (or gravel)
    const roadM = v === 1 ? M.gravel : M.asphalt;
    const sw = 6;
    for (let xx = 0; xx < L; xx++) {
      const e = Math.min(xx, L - 1 - xx), y1 = deckY - (e < 14 ? Math.floor((14 - e) / 4) : 0);
      c.box(xx, y1, z0 + 3, xx + 1, y1 + 1, z1 - 3, roadM);
      c.box(xx, y1, z0 + 3, xx + 1, y1 + 2, z0 + 3 + sw, M.sidewalk);
      c.box(xx, y1, z1 - 3 - sw, xx + 1, y1 + 2, z1 - 3, M.sidewalk);
      // parapet 3 thick, 9 tall + ashlar coping 1 higher and slightly wider
      const ph = 9;
      for (const [pa, pb] of [[z0, z0 + 3], [z1 - 3, z1]]) {
        c.box(xx, y1, pa, xx + 1, y1 + ph, pb, (xx % 18 < 9) ? stone : M.ashlar);
        c.box(xx, y1 + ph, pa, xx + 1, y1 + ph + 1, pb, M.ashlar);
      }
    }
    // pilasters over the piers and at the ends
    const marks = [3, L - 8];
    for (let i = 0; i < n - 1; i++) marks.push(Math.round(spans[i][1] + pier / 2 - 2));
    for (const mx of marks) {
      const e = Math.min(mx, L - 1 - mx), y1 = deckY - (e < 14 ? Math.floor((14 - e) / 4) : 0);
      for (const [pa, pb] of [[z0 - 1, z0 + 4], [z1 - 4, z1 + 1]]) {
        c.box(mx - 1, y1 - 6, pa, mx + 6, y1 + 12, pb, stone);
        c.box(mx - 1, y1 + 12, pa - 1 + (pa < z1 - 4 ? 0 : 1), mx + 6, y1 + 13, pb + (pa < z1 - 4 ? 0 : 0), M.ashlar);
        c.box(mx + 1, y1 + 13, pa + 1, mx + 4, y1 + 15, pb - 1, M.ashlar);
      }
      // keystone-ish lamp finial
      if (v === 2) for (const zz of [z0 + 2, z1 - 3]) { c.box(mx + 2, y1 + 15, zz, mx + 3, y1 + 18, zz + 1, M.iron); c.box(mx + 2, y1 + 18, zz, mx + 3, y1 + 19, zz + 1, M.lamp); }
    }
    // moss / weathering variation: a few mortar and gravel specks
    for (let i = 0; i < 260; i++) {
      const xx = r.int(0, L - 1), y = r.int(0, deckY - 2), zz = r.chance(.5) ? z0 : z1 - 1;
      if (c.get(xx, y, zz) === stone) c.set(xx, y, zz, M.mortar);
    }
    c.ground(0, 0, L, c.sz, M.gravel);
    return c;
  },
};
