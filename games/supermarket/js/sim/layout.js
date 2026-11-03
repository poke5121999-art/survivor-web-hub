// Store floor plan (original layout, metres). x right, z towards the street; the front wall is at z = ROOM.z1.
export const ROOM = { x0: -7, x1: 7, z0: -6, z1: 6, h: 3.2 };
export const DOOR = { x0: 3, x1: 5 };

const shelfSlots = [-1.6, -0.4, 0.8, 2.0]; // back wall; Drop 1 owns the first two

export const LAYOUT = {
  room: ROOM, doorGap: DOOR,
  door: { x: 4, z: 5.2 },
  exit: { x: -2, z: 9.6 },
  spawn: { first: { x: 4, z: 8.2 }, near: { x: 6, z: 9 }, far: { x: 11, z: 9.6 } },
  shelves: shelfSlots.slice(0, 2).map(x => ({ x, z: -5.55, w: 1.1, d: 0.5, rot: 0, front: { x, z: -4.7 } })),
  register: { x: -4.5, z: 3.5, w: 2.2, d: 0.7, stand: { x: -4.5, z: 2.55 }, customer: { x: -4.5, z: 4.5 } },
  computer: { x: 5.6, z: -5.2, w: 1.4, d: 0.7, stand: { x: 5.6, z: -4.3 } },
  delivery: { x: 4.7, z: 2.6, dx: 0.6, dz: 0.6, cols: 3, rows: 3 },
  trash: { x: 6.4, z: 0.6 },
  queue(i) { return i === 0 ? { ...LAYOUT.register.customer } : { x: -4.5 + i * 0.8, z: 4.75 }; },
  route(c, dest) { // customers only need the door when crossing the front wall
    const inside = p => p.z < ROOM.z1;
    const out = { x: 4, z: 6.7 }, inn = { x: 4, z: 5.2 };
    if (!inside(c) && inside(dest)) return [out, inn];
    if (inside(c) && !inside(dest)) return [inn, out];
    return [];
  },
};

// Solid boxes the player cannot walk through: [x0, z0, x1, z1]
export function solids() {
  const L = LAYOUT, R = ROOM, t = 0.15, s = [];
  s.push([R.x0 - t, R.z0 - t, R.x1 + t, R.z0]);           // back wall
  s.push([R.x0 - t, R.z0, R.x0, R.z1]);                   // left wall
  s.push([R.x1, R.z0, R.x1 + t, R.z1]);                   // right wall
  s.push([R.x0 - t, R.z1, DOOR.x0, R.z1 + t]);            // front wall, left of the door
  s.push([DOOR.x1, R.z1, R.x1 + t, R.z1 + t]);            // front wall, right of the door
  for (const sh of L.shelves) s.push([sh.x - sh.w / 2, sh.z - sh.d / 2, sh.x + sh.w / 2, sh.z + sh.d / 2]);
  const r = L.register; s.push([r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2]);
  const c = L.computer; s.push([c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2]);
  s.push([L.trash.x - 0.25, L.trash.z - 0.25, L.trash.x + 0.25, L.trash.z + 0.25]);
  return s;
}
