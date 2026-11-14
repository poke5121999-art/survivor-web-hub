// Voxel Lab - tools: gun, hammer, grenade, rocket, satchel charge with fuse, wrecking ball, fire, cut-base laser.
// Presets after the reference's HUD texts (analysis/destruction.md §4.4, §12.4): rocket ~6 m hole, satchel 3.5 s fuse,
// wrecking ball 1.5 t on a rope. Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
import { VoxelGrid } from '../grid.js';
import { M, F, flags, toughness } from '../materials.js';
import { hash3 } from '../hash.js';
import { GY, WX, WZ } from './world.js';

export const TOOLS = [
  { id: 'gun', name: 'Súng', hold: 0.11 }, { id: 'hammer', name: 'Búa', hold: 0.3 }, { id: 'grenade', name: 'Lựu đạn' }, { id: 'rocket', name: 'Rocket' },
  { id: 'satchel', name: 'Bộc phá' }, { id: 'ball', name: 'Bi sắt' }, { id: 'fire', name: 'Lửa', hold: 0.08 }, { id: 'laser', name: 'Laser cắt chân' },
];

/** nearest thing along a ray: world voxel, rigid body or mob */
export function pick(world, mobs, ox, oy, oz, dx, dy, dz, maxT = 300) {
  let best = world.raycast(ox, oy, oz, dx, dy, dz, maxT); if (best) best.type = 'world';
  const b = world.bodies.raycast(ox, oy, oz, dx, dy, dz, best ? best.t : maxT);
  if (b && (!best || b.t < best.t)) { b.type = 'body'; best = b; }
  if (mobs) { const m = mobs.raycast(ox, oy, oz, dx, dy, dz, best ? best.t : maxT); if (m && (!best || m.t < best.t)) { m.type = 'mob'; best = m; } }
  return best;
}

function sparks(world, x, y, z, n, r = 1, g = 0.75, b = 0.4) {
  for (let i = 0; i < n; i++) { const h = hash3(i, world.step, 5, 8), a = (h & 1023) / 1023 * 6.283, e = ((h >> 10) & 1023) / 1023 * 3.14 - 1.2, u = ((h >> 20) & 1023) / 1023, sp = 2 + 6 * u; world.sprite(x, y, z, 0.03 + 0.03 * u, r, g, b, 1, 3, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 0.2 + 0.4 * u, 0, 5); }
}

class Thrown {
  constructor(x, y, z, vx, vy, vz, fuse, r, p, kind, sticky) { Object.assign(this, { x, y, z, vx, vy, vz, fuse, r, p, kind, sticky, stuck: false, isThrown: true, size: sticky ? 0.3 : 0.14 }); }
  step(world, dt) {
    this.fuse -= dt;
    if (this.fuse <= 0) { world.explode(this.x, this.y, this.z, this.r, this.p, this.kind); return true; }
    if (!this.stuck) {
      this.vy -= 9.81 * dt;
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt, g = world.grid;
      const solid = (x, y, z) => y < 0.2 || g.get(Math.floor(x * 10), Math.floor(y * 10), Math.floor(z * 10));
      if (solid(nx, ny, nz)) {
        if (this.sticky) { this.stuck = true; world.ev('impact', this.x, this.y, this.z, 40, M.cloth_red, 3); }
        else {
          if (solid(nx, this.y, this.z)) this.vx *= -0.35; else if (solid(this.x, this.y, nz)) this.vz *= -0.35; else { this.vy *= -0.35; this.vx *= 0.7; this.vz *= 0.7; }
          if (Math.hypot(this.vx, this.vy, this.vz) > 2) world.ev('impact', this.x, this.y, this.z, 30, M.steel, 3);
        }
      } else { this.x = nx; this.y = ny; this.z = nz; }
    }
    if ((world.step & 7) === 0) world.sprite(this.x, this.y + 0.1, this.z, 0.06, 1, 0.5, 0.2, 1, 3, 0, 1, 0, 0.25, 0, 4);
    return false;
  }
}
class Rocket {
  constructor(x, y, z, dx, dy, dz, mobs) { Object.assign(this, { x, y, z, dx, dy, dz, life: 4, mobs, isRocket: true }); }
  step(world, dt) {
    const d = 46 * dt, h = pick(world, this.mobs, this.x, this.y, this.z, this.dx, this.dy, this.dz, d);
    this.life -= dt;
    if (h || this.life <= 0) { const t = h ? Math.max(0, h.t - 0.15) : 0; world.explode(this.x + this.dx * t, this.y + this.dy * t, this.z + this.dz * t, 3, 1.2, 1); return true; }
    this.x += this.dx * d; this.y += this.dy * d; this.z += this.dz * d;
    world.sprite(this.x, this.y, this.z, 0.25, 0.7, 0.7, 0.7, 0.5, 2, 0, 0.3, 0, 1.2, 0.5);
    world.sprite(this.x, this.y, this.z, 0.2, 1, 0.7, 0.3, 1, 4, 0, 0, 0, 0.1, 0, 6);
    return false;
  }
}

/** use a tool along a ray from the eye; returns what was hit (or null) */
export function useTool(id, world, mobs, ox, oy, oz, dx, dy, dz, fps) {
  const hit = pick(world, mobs, ox, oy, oz, dx, dy, dz);
  if (id === 'gun' || id === 'hammer') {
    const hammer = id === 'hammer';
    if (!hammer) world.ev('shot', ox, oy, oz, 1, 0, 0, 0);
    if (!hit || (hammer && fps && hit.t > 3.5)) return null;
    const px = hit.px, py = hit.py, pz = hit.pz;
    if (hit.type === 'world') {
      // gun: goes through boards, plaster, thin metal; brick only pocks. hammer: chews wood, plaster, brick; concrete only chips.
      const n = hammer ? world.carve(px + dx * 0.15, py + dy * 0.15, pz + dz * 0.15, 0.45, 0.33, { debris: 0.5, kick: 2.5, keepGround: false })
        : world.carve(px + dx * 0.06, py + dy * 0.06, pz + dz * 0.06, toughness[hit.m] < 800 ? 0.2 : 0.13, 0.36, { debris: 0.4, kick: 3 });
      if (hammer) world.ev('hammer', px, py, pz, 0.8, hit.m);
      if (!n || (flags[hit.m] & F.METAL)) sparks(world, px, py, pz, hammer ? 10 : 6);
    } else if (hit.type === 'body') {
      const b = hit.body; world.matCount.fill(0);
      const n = world.bodies.crushSphereBody(b, hit.x, hit.y, hit.z, hammer ? 4 : 1.6, hammer ? 3000 : 2400);
      const j = hammer ? 900 : 120; world.bodies.impulse(b, px - b.x, py - b.y, pz - b.z, dx * j, dy * j, dz * j); b.sleep = 0;
      if (n) world.ev('break', px, py, pz, n, hit.m); else sparks(world, px, py, pz, 6);
    } else if (hit.type === 'mob') mobs.hit(hit, dx, dy, dz, hammer ? 0.38 : 0.17, hammer ? 0.5 : 0.75, hammer ? 5 : 2);
    return hit;
  }
  if (id === 'grenade') { world.projectiles.push(new Thrown(ox + dx * 0.5, oy + dy * 0.5, oz + dz * 0.5, dx * 16, dy * 16 + 3, dz * 16, 2.2, 1.6, 1, 2, false)); return hit; }
  if (id === 'satchel') { world.projectiles.push(new Thrown(ox + dx * 0.5, oy + dy * 0.5, oz + dz * 0.5, dx * 13, dy * 13 + 3, dz * 13, 3.5, 3.5, 1.5, 3, true)); return hit; }
  if (id === 'rocket') { world.projectiles.push(new Rocket(ox + dx * 0.6, oy + dy * 0.6, oz + dz * 0.6, dx, dy, dz, mobs)); world.ev('shot', ox, oy, oz, 1, 0, 0, 1); return hit; }
  if (!hit) return null;
  if (id === 'fire') {
    if (hit.type === 'mob') { mobs.hit(hit, dx, dy, dz, 0.2, 0.3, 0.5, true); return hit; }
    world.ignite(hit.px, hit.py, hit.pz, 0.7, 3);
    for (let i = 0; i < 3; i++) world.sprite(hit.px, hit.py + 0.1, hit.pz, 0.4, 1, 0.6, 0.25, 1, 4, 0, 1.2, 0, 0.3, 0.2, 5, 1);
    return hit;
  }
  if (id === 'ball') { spawnBall(world, hit.px, hit.py, hit.pz, -dx, -dz); return hit; }
  if (id === 'laser') { cutBase(world, hit.px, Math.max(hit.py, GY * 0.1 + 0.25), hit.pz, 11); return hit; }
  return hit;
}

/** 1.5 t ball on an 8 m rope, pulled back toward the viewer and let go so it swings through the aim point */
export function spawnBall(world, tx, ty, tz, bx, bz) {
  const r = 5, g = new VoxelGrid(2 * r + 1, 2 * r + 1, 2 * r + 1); let n = 0;
  for (let y = 0; y <= 2 * r; y++) for (let z = 0; z <= 2 * r; z++) for (let x = 0; x <= 2 * r; x++) if ((x - r) ** 2 + (y - r) ** 2 + (z - r) ** 2 <= r * r + 1) { g.set(x, y, z, M.iron, 1); n++; }
  const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
  const L = 8, ay = Math.max(ty, GY * 0.1 + 1) + L, ang = 1.1;
  const sx = tx + bx * Math.sin(ang) * L, sy = ay - Math.cos(ang) * L, sz = tz + bz * Math.sin(ang) * L;
  const b = world.bodies.add(g, [0, 0, 0], sx - r * 0.1, sy - r * 0.1, sz - r * 0.1, [0, 0, 0, 1], 1, { massScale: 1500 / (n * 7.2) });
  if (b) { b.rope = { ax: tx, ay, az: tz, L, life: 16 }; world.led.built += n; }
  return b;
}

/** "cut base": a 2-voxel slice through everything within `radius` metres at that height - the top must then fall */
export function cutBase(world, x, y, z, radius) {
  const g = world.grid, vy = Math.max(GY + 1, Math.floor(y * 10)), R = radius * 10, vx = x * 10, vz = z * 10; let n = 0;
  world.matCount.fill(0);
  for (let yy = vy; yy < vy + 2; yy++) for (let zz = Math.max(0, Math.floor(vz - R)); zz <= Math.min(WZ - 1, vz + R); zz++) for (let xx = Math.max(0, Math.floor(vx - R)); xx <= Math.min(WX - 1, vx + R); xx++) {
    if ((xx - vx) ** 2 + (zz - vz) ** 2 > R * R) continue;
    const m = g.get(xx, yy, zz); if (!m) continue;
    if (flags[m] & F.EXPLOSIVE) { world.fuseFuel(xx, yy, zz, 0.2); continue; }
    world.crushVoxel(xx, yy, zz, m, n); n++;
    if ((n & 63) === 0) world.sprite((xx + 0.5) * 0.1, (yy + 0.5) * 0.1, (zz + 0.5) * 0.1, 0.12, 1, 0.3, 0.2, 1, 3, 0, 2, 0, 0.5, 0, 8);
  }
  if (n) { world.stats.fractures += n; world.ev('fracture', x, y, z, n, world.dominant()); }
  return n;
}
