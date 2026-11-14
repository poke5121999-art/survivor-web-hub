// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Steel truss bridge (Pratt / Warren / two-span Pratt) on two abutments, plank or rc deck, cross beams, portal bracing.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'truss-bridge',
  name: 'Cầu giàn thép',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const L = r.int(224, 268);
    const DW = 40, TW = 3;                       // deck width, truss chord thickness
    const SZ = DW + 2 * TW + 10;                 // canvas depth (abutments a bit wider)
    const zc = SZ / 2;
    const zA = Math.round(zc - DW / 2 - TW / 2), zB = Math.round(zc + DW / 2 - TW / 2); // z of the two trusses (left edges)
    const aH = 26, ab = 26;                      // abutment height and length
    const H = 38;                                // truss height above the deck
    const c = new Canvas(L, aH + H + 14, SZ);
    const steel = [M.steel, M.steel_yellow, M.rust][v];
    const diag = v === 1 ? M.steel : steel;
    const aM = v === 2 ? M.stone : M.concrete;
    // abutments (stepped for wing / bearing seat)
    for (const [xa, xb] of [[0, ab], [L - ab, L]]) {
      c.box(xa, 0, 2, xb, aH - 6, SZ - 2, aM);
      c.box(xa + (xa === 0 ? 0 : 6), aH - 6, 3, xb - (xa === 0 ? 6 : 0), aH, SZ - 3, aM);
      const cap = xa === 0 ? [xa, xa + 20] : [xb - 20, xb];
      c.box(cap[0], aH - 1, 3, cap[1], aH, SZ - 3, M.ashlar);
      // wing walls splayed
      for (let k = 0; k < 14; k++) { const xx = xa === 0 ? xa + k : xb - 1 - k; c.box(xx, 0, 0, xx + 1, Math.max(4, aH - 4 - k), 2, aM); c.box(xx, 0, SZ - 2, xx + 1, Math.max(4, aH - 4 - k), SZ, aM); }
    }
    const spans = v === 2 ? [[ab - 4, Math.round(L / 2) - 7], [Math.round(L / 2) + 7, L - ab + 4]] : [[ab - 4, L - ab + 4]];
    if (v === 2) { // central pier (twin columns + cap)
      const pm = Math.round(L / 2);
      c.box(pm - 7, 0, 6, pm + 7, aH - 5, SZ - 6, M.concrete);
      c.box(pm - 8, aH - 5, 4, pm + 8, aH, SZ - 4, M.rc);
      c.box(pm - 7, aH - 1, 5, pm + 7, aH, SZ - 5, M.ashlar);
      for (let k = 0; k < 8; k++) c.box(pm - 7 + k * 2 - 1, 0, 3, pm - 7 + k * 2 + 1, 2, 4, M.concrete);
    }
    // deck + trusses per span
    const deckY = aH;                            // top of cross beams = bearing seat top
    const deckM = v === 1 ? M.rc : M.plank;
    for (const [sa, sb] of spans) {
      const len = sb - sa;
      const np = Math.max(6, Math.round(len / 24));      // panels
      const pw = len / np;
      const px = (i) => Math.round(sa + i * pw);
      const hb = deckY + 1, ht = deckY + H;               // bottom chord / top chord centre rows
      const mem = 2;
      for (const zt of [zA, zB]) {
        const zm = zt + 1;
        // bottom chord (3x3) sitting on the bearing seats
        c.box(sa, deckY, zt, sb, deckY + 3, zt + TW, steel);
        // top chord
        c.box(px(1) - 1, ht - 1, zt, px(np - 1) + 2, ht + 2, zt + TW, steel);
        // end posts inclined
        c.line(sa + 1, deckY + 1, zm, px(1), ht, zm, steel, 3);
        c.line(sb - 2, deckY + 1, zm, px(np - 1), ht, zm, steel, 3);
        for (let i = 1; i < np; i++) { // verticals
          const hh = (v === 1 && i % 2 === 1) ? 0 : 1;
          if (hh || v !== 1) c.line(px(i), deckY + 2, zm, px(i), ht, zm, steel, mem);
        }
        // diagonals
        for (let i = 0; i < np; i++) {
          const a = px(i), b = px(i + 1);
          if (v === 1) { // Warren: alternating diagonals, top chord node at panel midpoints
            if (i === 0 || i === np - 1) continue;
            const up = i % 2 === 0;
            if (up) c.line(a, deckY + 2, zm, b, ht - 1, zm, diag, mem); else c.line(a, ht - 1, zm, b, deckY + 2, zm, diag, mem);
          } else { // Pratt: diagonals slope down toward the centre
            if (i === 0 || i === np - 1) continue;
            const mid = np / 2;
            if (i < mid) c.line(a, ht - 1, zm, b, deckY + 2, zm, diag, mem); else c.line(a, deckY + 2, zm, b, ht - 1, zm, diag, mem);
          }
        }
        // top gusset blocks at nodes
        for (let i = 1; i < np; i++) c.box(px(i) - 2, ht - 2, zt, px(i) + 3, ht + 3, zt + TW, steel);
        for (let i = 0; i <= np; i++) c.box(px(i) - 2, deckY, zt, px(i) + 3, deckY + 4, zt + TW, steel);
        // handrail-height safety paint stripe on the top chord end
        c.box(sa, deckY + 3, zt, sa + 3, deckY + 6, zt + TW, M.paint_yellow);
      }
      // cross beams under the deck at each panel point, stringers along, deck on top
      const zl = zA + TW, zr = zB;
      for (let i = 0; i <= np; i++) c.box(px(i) - 1, deckY - 4, zl - 2, px(i) + 2, deckY, zr + 2, steel);
      for (let k = 0; k < 5; k++) { const zz = Math.round(zl + 1 + k * (zr - zl - 2) / 4); c.box(sa, deckY - 3, zz, sb, deckY, zz + 2, steel); }
      // deck
      c.box(sa, deckY, zl, sb, deckY + 2, zr, deckM);
      if (v !== 1) for (let xx = sa; xx < sb; xx += 7) c.box(xx, deckY + 2, zl, xx + 1, deckY + 3, zr, M.wood_dark); // plank joints / sleepers
      // portal & top lateral bracing
      for (let i = 1; i < np; i++) {
        c.box(px(i) - 1, ht - 2, zA + TW, px(i) + 2, ht + 1, zB, steel);
        if (i % 2 === 1 && i < np - 1) c.line(px(i), ht - 2, zA + TW, px(i + 1), ht - 2, zB, steel, 2);
      }
      // lamp posts at the ends of the top chord
      c.box(px(1) + 1, ht + 2, zA + 1, px(1) + 2, ht + 7, zA + 2, M.iron); c.box(px(1) + 1, ht + 7, zA + 1, px(1) + 2, ht + 8, zA + 2, M.lamp);
      c.box(px(np - 1) - 1, ht + 2, zB + 1, px(np - 1), ht + 7, zB + 2, M.iron); c.box(px(np - 1) - 1, ht + 7, zB + 1, px(np - 1), ht + 8, zB + 2, M.lamp);
    }
    // end approach (road continues over the abutment tops) with kerbs
    for (const [xa, xb] of [[0, ab - 4], [L - ab + 4, L]]) {
      c.box(xa, aH, 4, xb, aH + 1, SZ - 4, M.gravel);
      c.box(xa, aH, 4, xb, aH + 3, 7, M.concrete); c.box(xa, aH, SZ - 7, xb, aH + 3, SZ - 4, M.concrete);
    }
    c.ground(0, 0, L, SZ, M.gravel);
    return c;
  },
};
