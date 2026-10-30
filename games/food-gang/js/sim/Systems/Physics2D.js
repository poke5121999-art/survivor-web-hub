// Static map geometry queries: every collider is an axis-aligned box (spec Part 2 map table).
import { f, FLOAT_MAX, Vec2, SMath } from '../Core/Vec2.js';
import { dotnetSort, compareNum } from '../Core/DotnetSort.js';

export const MASK_ALL = -1;
/** CheckObstacleHit: every layer except 15 (Wall). */
export const MASK_NO_WALL = 0xFFFF7FFF | 0;

const EPS9 = f(1e-9);
const EPS6 = f(1e-6);

const inMask = (layer, mask) => (mask & (1 << layer)) !== 0;

const slab = { tmin: 0, tmax: 0, nx: 0, ny: 0 };

function slabAxis(o, d, mn, mx, xAxis) {
  if (Math.abs(d) < EPS9) return o >= mn && o <= mx;
  const inv = f(1 / d);
  let t1 = f(f(mn - o) * inv), t2 = f(f(mx - o) * inv);
  let sign = -1;
  if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sign = 1; }
  if (t1 > slab.tmin) {
    slab.tmin = t1;
    if (xAxis) { slab.nx = sign; slab.ny = 0; } else { slab.nx = 0; slab.ny = sign; }
  }
  if (t2 < slab.tmax) slab.tmax = t2;
  return slab.tmin <= slab.tmax;
}

/** Segment vs boxes (Physics2D.Linecast, static colliders). A segment starting inside a box ignores that box. */
export function linecast(map, from, to, mask) {
  const best = { hit: false, point: { x: 0, y: 0 }, normal: { x: 0, y: 0 }, fraction: FLOAT_MAX, collider: -1 };
  const dx = f(to.x - from.x), dy = f(to.y - from.y);
  const cols = map.colliders;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (!inMask(col.layer, mask)) continue;
    const mn = col.min, mx = col.max;
    if (from.x > mn.x && from.x < mx.x && from.y > mn.y && from.y < mx.y) continue;
    slab.tmin = 0; slab.tmax = 1; slab.nx = 0; slab.ny = 0;
    if (!slabAxis(from.x, dx, mn.x, mx.x, true)) continue;
    if (!slabAxis(from.y, dy, mn.y, mx.y, false)) continue;
    if (slab.tmin < best.fraction) {
      best.hit = true;
      best.fraction = slab.tmin;
      best.normal = { x: slab.nx, y: slab.ny };
      best.point = { x: f(from.x + f(dx * slab.tmin)), y: f(from.y + f(dy * slab.tmin)) };
      best.collider = i;
    }
  }
  if (!best.hit) best.fraction = 1;
  return best;
}

const byDistance = (a, b) => compareNum(a.distance, b.distance);

/** Circle overlap against boxes; contacts closer than radius + extent, sorted by distance (nearest first). */
export function overlapCircle(map, c, radius, extent, mask, into) {
  into.length = 0;
  const reach = f(radius + extent);
  const cols = map.colliders;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (!inMask(col.layer, mask)) continue;
    const mn = col.min, mx = col.max;
    const qx = SMath.clamp(c.x, mn.x, mx.x), qy = SMath.clamp(c.y, mn.y, mx.y);
    const dvx = f(c.x - qx), dvy = f(c.y - qy);
    const dist = f(Math.sqrt(f(f(dvx * dvx) + f(dvy * dvy))));
    let k;
    if (dist > EPS6) {
      if (dist >= reach) continue;
      const inv = f(1 / dist);
      k = { normal: { x: f(dvx * inv), y: f(dvy * inv) }, penetration: f(radius - dist), distance: dist };
    } else {
      // centre inside the box: push out through the nearest face
      const l = f(c.x - mn.x), r = f(mx.x - c.x), b = f(c.y - mn.y), t = f(mx.y - c.y);
      const m = Math.min(Math.min(l, r), Math.min(b, t));
      const nrm = m === t ? Vec2.up() : m === b ? { x: 0, y: -1 } : m === l ? Vec2.left() : Vec2.right();
      k = { normal: nrm, penetration: f(radius + m), distance: 0 };
    }
    into.push(k);
  }
  dotnetSort(into, byDistance);
}

export function pointInside(map, p, margin) {
  for (const c of map.colliders) {
    const mn = c.min, mx = c.max;
    if (p.x > f(mn.x + margin) && p.x < f(mx.x - margin) && p.y > f(mn.y + margin) && p.y < f(mx.y - margin)) return true;
  }
  return false;
}

export const Physics2D = Object.freeze({ MASK_ALL, MASK_NO_WALL, linecast, overlapCircle, pointInside });
