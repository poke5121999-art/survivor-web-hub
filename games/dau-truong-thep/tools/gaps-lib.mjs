// Geometry behind tools/gaps.mjs: clearance field, route bottlenecks and the opening finder.
import { compileMap, MAPS, NHA_ORDER } from '../js/maps.js';
import { createMatch } from "../js/sim.js";
import { PROPS, MODES, RULES } from '../js/data.js';

export const GRID = Number(process.env.GAPS_GRID) || 0.25, STEP = 0.05;
export const SPARE = 0.3;
export const MOVE_R = RULES.moveRadius, TIGHT = 0.5, FALSE = Number(process.env.GAPS_FALSE) || 0.44;
const MAPS_MODE = Object.fromEntries(NHA_ORDER.map((k) => [k, true]));
const centred = (p) => Math.abs(p[0]) < 1e-6 && Math.abs(p[1]) < 1e-6;
const REACH = 1.5; // a point counts as reached when the circle gets within this distance of it
export const R_MAX = RULES.moveRadius, R_MIN = RULES.moveRadius;
export const TOWER_R = MODES.nha.tower.radius;
export const floorStep = (r) => Math.floor(r / STEP + 1e-9) * STEP;

function clearanceField(map, towers, props) {
  const cols = Math.ceil(map.w / GRID), rows = Math.ceil(map.d / GRID), c = new Float32Array(cols * rows);
  const rounds = map.rounds.map((o) => [o.x, o.z, o.r]).concat(towers.map((t) => [t.x, t.z, TOWER_R]), props.map((p) => [p.x, p.z, PROPS[p.kind].r]));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -map.hw + (i + 0.5) * GRID, z = -map.hd + (j + 0.5) * GRID;
    let d = Math.min(x + map.hw, map.hw - x, z + map.hd, map.hd - z);
    for (const w of map.walls) {
      const dx = Math.max(w.x0 - x, 0, x - w.x1), dz = Math.max(w.z0 - z, 0, z - w.z1);
      const e = Math.hypot(dx, dz);
      if (e < d) d = e;
    }
    for (const [cx, cz, r] of rounds) { const e = Math.hypot(cx - x, cz - z) - r; if (e < d) d = e; }
    c[j * cols + i] = d;
  }
  return { cols, rows, c };
}

const cellIdx = (map, f, x, z) => {
  const i = Math.floor((x + map.hw) / GRID), j = Math.floor((z + map.hd) / GRID);
  return i < 0 || j < 0 || i >= f.cols || j >= f.rows ? -1 : j * f.cols + i;
};
const cellXZ = (map, f, k) => [-map.hw + ((k % f.cols) + 0.5) * GRID, -map.hd + (Math.floor(k / f.cols) + 0.5) * GRID];

// Each target is a set of cells; its bottleneck is the clearance at which the first of them joins the base-0 region.
function bottlenecks(map, f, source, targets) {
  const n = f.cols * f.rows, parent = new Int32Array(n).fill(-1);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => f.c[b] - f.c[a]);
  const res = targets.map(() => null);
  const pending = new Set(targets.map((_, i) => i));
  const src = new Set(source);
  for (const k of order) {
    const clr = f.c[k];
    if (clr <= 0) break;
    parent[k] = k;
    const i = k % f.cols, j = (k / f.cols) | 0;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= f.cols || b >= f.rows) continue;
      const q = b * f.cols + a;
      if (parent[q] < 0) continue;
      const ra = find(k), rb = find(q);
      if (ra !== rb) parent[rb] = ra;
    }
    if (!pending.size) continue;
    const root = [...src].find((s) => parent[s] >= 0);
    if (root === undefined) continue;
    const rr = find(root);
    for (const t of [...pending]) {
      if (targets[t].cells.some((c) => parent[c] >= 0 && find(c) === rr)) { res[t] = { r: clr, at: cellXZ(map, f, k) }; pending.delete(t); }
    }
  }
  return res;
}

export function audit(key, props) {
  const map = compileMap(key);
  const nha = !!MAPS_MODE[key];
  const caps = nha ? [] : createMatch({ seed: 1, map: key, mode: 'chiem', roster: [{ team: 0, mech: 'ung', name: 'a' }, { team: 1, mech: 'ung', name: 'b' }] }).points;
  const f = clearanceField(map, map.towers, props ? map.props.map((p) => ({ x: p.x, z: p.z, kind: p.kind })) : []);
  const near = (x, z, reach) => {
    const out = [], k0 = cellIdx(map, f, x, z);
    if (k0 < 0) return out;
    const n = Math.ceil(reach / GRID), i0 = k0 % f.cols, j0 = (k0 / f.cols) | 0;
    for (let j = j0 - n; j <= j0 + n; j++) for (let i = i0 - n; i <= i0 + n; i++) {
      if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) continue;
      const [cx, cz] = cellXZ(map, f, j * f.cols + i);
      if (Math.hypot(cx - x, cz - z) <= reach) out.push(j * f.cols + i);
    }
    return out;
  };
  const pt = (x, z) => near(x, z, REACH);
  const ring = (t) => { const out = []; for (let k = 0; k < f.cols * f.rows; k++) { const [x, z] = cellXZ(map, f, k); if (Math.hypot(x - t.x, z - t.z) < TOWER_R + 3.5) out.push(k); } return out; };
  const targets = [
    { name: 'base1', cells: pt(map.bases[1][0], map.bases[1][1]) },
    ...map.cratePoints.map((p, i) => ({ name: `crate${i}@${p[0]},${p[1]}`, cells: pt(p[0], p[1]) })),
    ...caps.map((p, i) => ({ name: `cap${i}@${p.x.toFixed(1)},${p.z.toFixed(1)}`, cells: pt(p.x, p.z) })),
    ...map.towers.map((t, i) => ({ name: `tower${i}(${t.team}${t.kind})`, cells: ring(t) })),
    ...map.paths.flatMap((line, li) => line.map((p, pi) => ({ name: `path${li}.${pi}@${p[0]},${p[1]}`, cells: pt(p[0], p[1]), lane: true, x: p[0], z: p[1] }))),
  ].filter((t) => t.cells.length && (!t.lane || f.c[cellIdx(map, f, t.x, t.z)] >= R_MIN));
  const src = pt(map.bases[0][0], map.bases[0][1]);
  const res = bottlenecks(map, f, src, targets);
  let narrow = { r: Infinity };
  const rows = [];
  targets.forEach((t, i) => { const b = res[i]; rows.push({ name: t.name, r: b ? b.r : 0 }); if (b && b.r < narrow.r) narrow = { r: b.r, at: b.at, name: t.name }; });
  const unreached = rows.filter((r) => r.r < R_MAX).map((r) => r.name + ':' + floorStep(r.r).toFixed(2));
  return { key, narrow, unreached, nTargets: targets.length };
}
// Every opening between two obstacles (walls, rounds, towers, optionally props, the map edge): surface distance and the
// midpoint, kept when that midpoint is really free (clearance ~ half the gap, so no third obstacle sits in the opening).
// Obstacles are named by the row of the hand-written layout table (a mirrored piece names its source row with a ').
export function pinches(key, map, props) {
  const src = MAPS[key], mirrored = (list) => list.map((it, i) => [i, centred(it)]).filter(([, c]) => !c).map(([i]) => i);
  const name = (kind, id, n, rows) => (id < n ? `${kind}[${id}]` : `${kind}[${rows[id - n]}]'`);
  const wallRows = mirrored(src.walls), roundRows = mirrored(src.rounds), propRows = mirrored(src.props);
  const boxes = map.walls.map((w) => ({ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, name: name('wall', w.id, src.walls.length, wallRows) }));
  const discs = map.rounds.map((o) => ({ x: o.x, z: o.z, r: o.r, name: name('round', o.id, src.rounds.length, roundRows) }))
    .concat(map.towers.map((t, i) => ({ x: t.x, z: t.z, r: TOWER_R, name: `tower#${i}` })));
  if (props) discs.push(...map.props.map((p) => ({ x: p.x, z: p.z, r: PROPS[p.kind].r, name: name('prop', p.id, src.props.length, propRows) })));
  const surf = (o, tx, tz) => (o.r === undefined ? [Math.max(o.x0, Math.min(tx, o.x1)), Math.max(o.z0, Math.min(tz, o.z1))] : (() => { const d = Math.hypot(tx - o.x, tz - o.z) || 1; return [o.x + (tx - o.x) / d * o.r, o.z + (tz - o.z) / d * o.r]; })());
  const centre = (o) => (o.r === undefined ? [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2] : [o.x, o.z]);
  const all = [...boxes, ...discs], out = [];
  const freeRadius = (x, z) => {
    let d = Math.min(x + map.hw, map.hw - x, z + map.hd, map.hd - z);
    for (const b of boxes) d = Math.min(d, Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1)));
    for (const o of discs) d = Math.min(d, Math.hypot(o.x - x, o.z - z) - o.r);
    return d;
  };
  const consider = (px, pz, qx, qz, A, B) => {
    const gap = Math.hypot(px - qx, pz - qz), mx = (px + qx) / 2, mz = (pz + qz) / 2;
    if (gap >= 2 * MOVE_R + TIGHT || gap < 2 * MOVE_R - FALSE) return;
    if (freeRadius(mx, mz) > gap / 2 - 0.02) out.push({ gap, x: mx, z: mz, a: A.name, b: B ? B.name : 'edge' });
  };
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const A = all[a], B = all[b];
    if (A.r === undefined && B.r === undefined) {
      const ox = Math.max(A.x0 - B.x1, B.x0 - A.x1), oz = Math.max(A.z0 - B.z1, B.z0 - A.z1);
      if (ox < 0 && oz < 0) continue;
      const px = ox < 0 ? (Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2 : (ox === A.x0 - B.x1 ? A.x0 : A.x1);
      const pz = oz < 0 ? (Math.max(A.z0, B.z0) + Math.min(A.z1, B.z1)) / 2 : (oz === A.z0 - B.z1 ? A.z0 : A.z1);
      const qx = ox < 0 ? px : (ox === A.x0 - B.x1 ? B.x1 : B.x0), qz = oz < 0 ? pz : (oz === A.z0 - B.z1 ? B.z1 : B.z0);
      consider(px, pz, qx, qz, A, B);
    } else {
      const [bx, bz] = centre(B), [px, pz] = surf(A, bx, bz), [qx, qz] = surf(B, px, pz), [px2, pz2] = surf(A, qx, qz);
      consider(px2, pz2, qx, qz, A, B);
    }
  }
  for (const A of all) {
    const e = A.r === undefined ? [A.x0, A.x1, A.z0, A.z1] : [A.x - A.r, A.x + A.r, A.z - A.r, A.z + A.r], cx = centre(A);
    consider(e[0], cx[1], -map.hw, cx[1], A); consider(e[1], cx[1], map.hw, cx[1], A);
    consider(cx[0], e[2], cx[0], -map.hd, A); consider(cx[0], e[3], cx[0], map.hd, A);
  }
  const seen = new Set();
  return out.filter((g) => g.x <= 0 && !seen.has(g.a + g.b + g.gap.toFixed(2)) && seen.add(g.a + g.b + g.gap.toFixed(2))).sort((a, b) => a.gap - b.gap);
}

