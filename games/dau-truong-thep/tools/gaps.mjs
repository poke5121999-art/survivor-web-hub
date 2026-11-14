// Gap audit: how wide a circle can travel between the points that matter, per layout.
//   GAPS_GRID=0.25 node tools/gaps.mjs
// Targets: both bases, crate points, capture points (chiem), a ring around every tower, and the lane trail points that stand on open ground.
// Clearance of a cell = how far a mech centre may be from walls, rounds, towers and the map edge (the same test as solidAt).
// Connectivity at radius R = cells with clearance >= R. Cells are added from the widest clearance down (union-find), so the
// moment a key point joins the base-0 region is the widest circle that can travel there ("bottleneck radius").
import { compileMap, MAP_ORDER, NHA_ORDER } from '../js/maps.js';
import { audit, pinches, floorStep, GRID, MOVE_R, TIGHT, FALSE, SPARE, R_MAX } from './gaps-lib.mjs';

console.log(`movement radius ${MOVE_R} (diameter ${2 * MOVE_R}); grid ${GRID} m; route spare required ${SPARE} m; lists show half-plane x <= 0 (mirrored pieces move together)`);
for (const key of [...MAP_ORDER, ...NHA_ORDER]) {
  for (const props of [false, true]) {
    const a = audit(key, props);
    const r = floorStep(a.narrow.r), width = 2 * r, spare = width - 2 * R_MAX;
    const list = pinches(key, compileMap(key), props), tight = list.filter((g) => g.gap >= 2 * MOVE_R), fake = list.filter((g) => g.gap < 2 * MOVE_R);
    const show = (l) => l.map((g) => `\n      ${g.gap.toFixed(2)} m @(${g.x.toFixed(1)},${g.z.toFixed(1)})  ${g.a} x ${g.b}`).join('');
    console.log(`${key.padEnd(9)} props ${props ? 'block ' : 'free  '} narrowest gap ${width.toFixed(2)} m (circle r ${r.toFixed(2)}) at (${a.narrow.at.map((v) => v.toFixed(1))}) [${a.narrow.name}]  widest-mech spare ${spare.toFixed(2)} m  ${spare >= SPARE ? 'OK' : 'TIGHT'}${a.unreached.length ? '  blocked: ' + a.unreached.join(' ') : ''}`);
    console.log(`    tight openings [${(2 * MOVE_R).toFixed(2)}, ${(2 * MOVE_R + TIGHT).toFixed(2)}) m: ${tight.length}${show(tight)}`);
    console.log(`    false openings [${(2 * MOVE_R - FALSE).toFixed(2)}, ${(2 * MOVE_R).toFixed(2)}) m: ${fake.length}${show(fake)}`);
  }
}
