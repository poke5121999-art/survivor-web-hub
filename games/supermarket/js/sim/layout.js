// Store floor plan (original layout, metres). x right, z towards the street; the front wall is at z = 6.
// The store grows to the left: every bought Section (LicensesInfoConfig type 2) adds SECTION_W metres.
export const SECTION_W = 2.4;
export const DOOR = { x0: 3, x1: 5 };
const BASE_X0 = -6;
const STEP = 1.2;                       // slot pitch along a row
const ROWS = [                          // furniture rows: back wall + two island rows, all facing the street
  { key: 'b', z: -5.55 },
  { key: 'i', z: -2.6 },
  { key: 'j', z: -0.1 },
];
export const SHELF = { w: 1.1, d: 0.5 };
export const CORRIDOR_X = 3.4;          // free lane on the right, between the islands and the computer/delivery side

export function roomFor(sections = 0) { return { x0: BASE_X0 - SECTION_W * sections, x1: 7, z0: -6, z1: 6, h: 3.2 }; }

// Every place a shelf/fridge can stand. Ids are stable when the room grows (k counts from the right).
export function slots(sections = 0) {
  const R = roomFor(sections), out = [];
  for (const row of ROWS) {
    for (let k = 0; ; k++) {
      const x = 2.0 - STEP * k;
      if (x - SHELF.w / 2 < R.x0 + (row.key === 'b' ? 0.15 : 1.1)) break;
      out.push({ id: row.key + k, row: row.key, x, z: row.z, front: { x, z: row.z + 0.85 } });
    }
  }
  return out;
}
export const slotById = (id, sections) => slots(sections).find(s => s.id === id);

export const LAYOUT = {
  doorGap: DOOR,
  door: { x: 4, z: 5.2 },
  exit: { x: -2, z: 9.6 },
  spawn: { first: { x: 4, z: 8.2 }, near: { x: 6, z: 9 }, far: { x: 11, z: 9.6 } },
  startShelves: ['b3', 'b2'],         // the two white shelves of chunk 101 (SceneChunkObjectsConfig is_init)
  register: { x: -4.5, z: 3.5, w: 2.2, d: 0.7, stand: { x: -4.5, z: 2.55 }, customer: { x: -4.5, z: 4.5 } },
  computer: { x: 5.6, z: -5.2, w: 1.4, d: 0.7, stand: { x: 5.6, z: -4.3 } },
  delivery: { x: 4.7, z: 2.6, dx: 0.6, dz: 0.6, cols: 3, rows: 3 },
  trash: { x: 6.4, z: 0.6 },
  queue(i) { return i === 0 ? { ...LAYOUT.register.customer } : { x: -4.5 + i * 0.8, z: 4.75 }; },
  // Waypoints from c to dest: through the door when crossing the front wall, and round the island rows by the
  // right-hand corridor when a row lies between the two points.
  route(c, dest) {
    const inside = p => p.z < 6, pts = [];
    const out = { x: 4, z: 6.7 }, inn = { x: 4, z: 5.2 };
    let from = { x: c.x, z: c.z };
    if (!inside(from) && inside(dest)) { pts.push(out, inn); from = inn; }
    const goingOut = inside(from) && !inside(dest);
    const to = goingOut ? inn : dest;
    const blocks = ROWS.slice(1).some(r => (from.z - (r.z + 0.4)) * (to.z - (r.z + 0.4)) < 0 || (from.z - (r.z - 0.4)) * (to.z - (r.z - 0.4)) < 0);
    if (blocks) pts.push({ x: CORRIDOR_X, z: from.z }, { x: CORRIDOR_X, z: to.z });
    if (goingOut) pts.push(inn, out);
    return pts;
  },
};

// Solid boxes the player cannot walk through: [x0, z0, x1, z1]
export function solids(sections = 0, shelfSlots = []) {
  const L = LAYOUT, R = roomFor(sections), t = 0.15, s = [];
  s.push([R.x0 - t, R.z0 - t, R.x1 + t, R.z0]);
  s.push([R.x0 - t, R.z0, R.x0, R.z1]);
  s.push([R.x1, R.z0, R.x1 + t, R.z1]);
  s.push([R.x0 - t, R.z1, DOOR.x0, R.z1 + t]);
  s.push([DOOR.x1, R.z1, R.x1 + t, R.z1 + t]);
  for (const id of shelfSlots) { const sl = slotById(id, sections); if (sl) s.push([sl.x - SHELF.w / 2, sl.z - SHELF.d / 2, sl.x + SHELF.w / 2, sl.z + SHELF.d / 2]); }
  const r = L.register; s.push([r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2]);
  const c = L.computer; s.push([c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2]);
  s.push([L.trash.x - 0.25, L.trash.z - 0.25, L.trash.x + 0.25, L.trash.z + 0.25]);
  return s;
}
