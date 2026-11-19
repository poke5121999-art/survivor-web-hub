// Floors (new design, the Unity game has one floor): an upper floor and a basement made from the generated house.
// The room tree that housegen builds stays as it is (same rooms, loot spots, pads, quota): whole branches of it are
// lifted one floor (+3 m) or lowered one (-3 m). Rooms keep their place on the plan, so the floors sit side by side in
// plan rather than stacked: every room is a closed box with walls and a ceiling, and the floors only meet at stairs.
//   house 1: ground + basement, house 2: ground + upper floor, houses 3-5: ground + upper + basement, and a second stair
//   that closes a loop (a door carved through a double wall between two rooms one floor apart).
//   Every extra floor holds at least 3 rooms (corridors do not count). The truck room is always on the ground floor.
// A stair is a ramp 3 cells wide (CART_CLEARANCE) and RAMP_LEN cells long, inside one room, starting at its door at the
// door's floor height and ending at the room's own floor height (slope 3 m over 6 m). Props on the ramp are removed,
// loot and foe spots on it move to other cells of the same room. Doors between rooms of different floors that are not
// stairs are walled up.
// Output on the house: floorOf (Int8Array per cell, -1/0/1), hcell (Float32Array per cell, floor height at the cell
// centre), stairs [{ room, door, hD, hS, axis, sgn, e0, x0, y0, x1, y1 }], floors { levels, loop }, rooms[i].floor.
export const FLOOR_DY = 3, RAMP_LEN = 6;
const MIN_PAD_SPACING = 3;   // data/rooms.js MIN_PAD_SPACING (HouseGen.PadsSpaced)
export const STEP_MAX = 0.6;   // nav and floods: neighbour cells further apart in height are not connected

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Can a walker step between neighbour cells i and j? Heights within STEP_MAX, and a ramp cell connects to a cell that
 *  is not on the same ramp only along the ramp's axis (its sides are a lip or a cliff, never a step). */
export function stepOK(house, i, j) {
  const hc = house.hcell; if (!hc) return true;
  if (Math.abs(hc[i] - hc[j]) > STEP_MAX) return false;
  const so = house.stairOf, a = so[i], b = so[j];
  if (a === b) return true;
  const st = house.stairs[a >= 0 ? a : b], d = Math.abs(i - j);
  return st.axis === 0 ? d === 1 : d === house.w;
}
export const floorPlan = (hi) => (hi === 1 ? [-1] : hi === 2 ? [1] : [1, -1]);
const counted = (r) => r.kind !== 'corridor';

/** Floor height at a world point (x, z) of a house with floors (0 when it has none). */
export function heightAt(house, x, z) {
  if (!house.hcell) return 0;
  const cx = Math.floor(x), cy = Math.floor(z);
  if (cx < 0 || cy < 0 || cx >= house.w || cy >= house.h) return 0;
  const s = house.stairOf ? house.stairOf[cy * house.w + cx] : -1;
  if (s >= 0) return rampH(house.stairs[s], x, z);
  return house.hcell[cy * house.w + cx];
}
function rampH(st, x, z) {
  const u = st.axis === 0 ? x : z, k = Math.max(0, Math.min(1, (u - st.e0) * st.sgn / RAMP_LEN));
  return st.hD + (st.hS - st.hD) * k;
}

export function applyFloors(house, houseIndex, seed) {
  const { w, h, grid, rooms } = house;
  const R = rng((seed | 0) ^ 0x51a7f00d);
  const N = w * h;
  const roomOf = new Int16Array(N).fill(-1);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x < w && y < h && grid[y * w + x] === 1) roomOf[y * w + x] = r.id;
  const doorAt = new Int16Array(N).fill(-1);
  const markDoors = () => { doorAt.fill(-1); house.doors.forEach((d, di) => { for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) doorAt[y * w + x] = di; }); };
  markDoors();
  const fl = new Int8Array(rooms.length);   // floor of each room
  const stairRoom = new Set([0]);           // rooms that hold a ramp (and the truck room: never)
  const stairs = [];

  // tree from the truck room
  const nb = rooms.map(() => []);
  house.doors.forEach((d, di) => { nb[d.a].push([d.b, di]); nb[d.b].push([d.a, di]); });
  const parent = new Int16Array(rooms.length).fill(-2), pdoor = new Int16Array(rooms.length).fill(-1), order = [0]; parent[0] = -1;
  for (let k = 0; k < order.length; k++) for (const [o, di] of nb[order[k]]) if (parent[o] === -2) { parent[o] = order[k]; pdoor[o] = di; order.push(o); }
  const kids = rooms.map(() => []); for (const r of order) if (parent[r] >= 0) kids[parent[r]].push(r);
  const sub = (r) => { const out = [r]; for (let k = 0; k < out.length; k++) out.push(...kids[out[k]]); return out; };

  // ---- one ramp in room S from door d (door floor height hD, room height hS): checks only, commit() applies it
  function stairPlan(S, hD, hS, d, used) {
    const no = () => null;   // (reasons kept as labels for debugging)
    if (S === 0 || used.has(S)) return no('used');
    const inS = (x, y) => x >= 0 && y >= 0 && x < w && y < h && roomOf[y * w + x] === S;
    let axis, sgn, lanes, start;
    if (d.dir === 0) {   // walk along x
      axis = 0; lanes = [d.y0, d.y0 + 1, d.y0 + 2];
      if (inS(d.x0 + d.zw, d.y0 + 1)) { sgn = 1; start = d.x0 + d.zw; } else if (inS(d.x0 - 1, d.y0 + 1)) { sgn = -1; start = d.x0 - 1; } else return no('side');
    } else {
      axis = 1; lanes = [d.x0, d.x0 + 1, d.x0 + 2];
      if (inS(d.x0 + 1, d.y0 + d.zh)) { sgn = 1; start = d.y0 + d.zh; } else if (inS(d.x0 + 1, d.y0 - 1)) { sgn = -1; start = d.y0 - 1; } else return null;
    }
    const cell = (k, l) => (axis === 0 ? [start + sgn * k, l] : [l, start + sgn * k]);
    const strip = new Set();
    for (let k = 0; k <= RAMP_LEN + 1; k++) for (const l of lanes) {   // the ramp and a 2-row landing apron (a cart turns off it)
      const [x, y] = cell(k, l); if (!inS(x, y)) return no('short');
      if (k < RAMP_LEN) strip.add(y * w + x);
    }
    // no other door next to the ramp, no pad on or beside it
    for (const i of strip) { const x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * w + x + dx; if (doorAt[j] >= 0 && house.doors[doorAt[j]] !== d) return no('door'); } }
    for (const p of house.pads || []) if (p.roomId === S) for (const i of strip) if (Math.hypot((i % w) + 0.5 - p.fx, ((i / w) | 0) + 0.5 - p.fy) < 2.6) return no('pad');
    // the room stays in one piece without the ramp cells (props on the ramp removed)
    const clearZone = new Set(strip); for (const l of lanes) for (const k of [RAMP_LEN, RAMP_LEN + 1]) { const [x, y] = cell(k, l); clearZone.add(y * w + x); }   // the ramp and its apron
    const gone = house.props.filter((p) => p.blocks && p.roomId === S && rectHits(p, clearZone, w));
    const freed = new Set(); for (const p of gone) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) freed.add(y * w + x);
    for (const i of clearZone) freed.add(i);
    const okC = (i, noStrip) => roomOf[i] === S && (!house.block[i] || freed.has(i)) && !(noStrip && strip.has(i));
    const [ex, ey] = cell(0, lanes[1]), [lx, ly] = cell(RAMP_LEN, lanes[1]);
    const before = flood(ey * w + ex, (i) => okC(i, false), w, h), after = flood(ly * w + lx, (i) => okC(i, true), w, h);
    // pockets cut off beside the ramp are allowed (a stairwell side); every other door and pad of the room must stay
    // reachable from the landing, and the landing keeps most of the room
    let lost = 0; for (const i of before) if (!strip.has(i) && !after.has(i)) lost++;
    if (lost > 10 || after.size < 0.5 * (before.size - strip.size)) return no('split');
    for (const dd of house.doors) { if (dd === d) continue; let touch = false, reach = false;
      for (let y = dd.y0 - 1; y <= dd.y0 + dd.zh; y++) for (let x = dd.x0 - 1; x <= dd.x0 + dd.zw; x++) { if (!inS(x, y)) continue; touch = true; if (after.has(y * w + x)) reach = true; }
      if (touch && !reach) return no('split-door'); }
    for (const p of house.pads || []) if (p.roomId === S && !after.has(Math.floor(p.fy) * w + Math.floor(p.fx))) return no('split-pad');
    const xs = [], ys = []; for (const i of strip) { xs.push(i % w); ys.push((i / w) | 0); }
    const e0 = sgn > 0 ? start : start + 1;
    const st = { room: S, door: d, hD, hS, axis, sgn, e0, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, cells: [...strip] };
    const commit = () => {
      for (const p of gone) { const k = house.props.indexOf(p); if (k >= 0) house.props.splice(k, 1); }
      for (const i of freed) house.block[i] = 0;
      const free = [...after].filter((i) => !house.block[i]);
      const move = (list) => { for (const q of list) if (q.roomId === S && (strip.has(q.y * w + q.x) || (!after.has(q.y * w + q.x) && q.place !== 'table'))) { const j = free[Math.floor(R() * free.length)]; q.x = j % w; q.y = (j / w) | 0; if (q.place === 'table') q.place = 'floor'; } };
      move(house.loot); move(house.foes);
      if (house.traps) house.traps = house.traps.filter((t) => !(t.roomId === S && strip.has(t.y * w + t.x)));
      stairRoom.add(S); stairs.push(st);
      return st;
    };
    return { st, commit };
  }

  // ---- extra floors: a connected part of the tree per floor (a branch, possibly leaving some of its sub-branches on
  // the ground floor); every tree door between two floors becomes a stair. Random tries, the first that fits is kept.
  const plan = floorPlan(houseIndex);
  const total = rooms.filter(counted).length;
  // places for a second stair (houses 3-5): a straight double wall 3 cells long between two rooms, walls past both ends
  const walls2 = [];
  if (plan.length > 1) {
    const isWall = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 2;
    const room = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? roomOf[y * w + x] : -1);
    for (let y = 1; y < h - 3; y++) for (let x = 1; x < w - 3; x++) for (const dir of [0, 1]) {
      const at = (k, l) => (dir === 0 ? [x + k, y + l] : [x + l, y + k]);   // A at k 0, walls at k 1-2, B at k 3; l across
      const A = room(...at(0, 1)), B = room(...at(3, 1));
      if (A < 0 || B < 0 || A === B) continue;
      let ok = true;
      for (let l = 0; l < 3 && ok; l++) if (room(...at(0, l)) !== A || room(...at(3, l)) !== B || !isWall(...at(1, l)) || !isWall(...at(2, l))) ok = false;
      if (!ok || !isWall(...at(1, -1)) || !isWall(...at(2, -1)) || !isWall(...at(1, 3)) || !isWall(...at(2, 3))) continue;
      const [zx, zy] = at(1, 0);
      walls2.push({ A, B, dd: { x: zx + 1, y: zy + 1, dir, jammed: false, a: A, b: B, x0: zx, y0: zy, zw: dir === 0 ? 2 : 3, zh: dir === 0 ? 3 : 2 } });
    }
  }
  // pad spacing in doors (HouseGen.PadsSpaced) with one extra door a-b
  const padRooms = (house.pads || []).map((p) => p.roomId);
  const padsSpaced = (a, b) => {
    const adj = rooms.map((_, i) => nb[i].map(([o]) => o)); adj[a].push(b); adj[b].push(a);
    for (let i = 0; i < padRooms.length; i++) {
      const d = new Array(rooms.length).fill(-1); d[padRooms[i]] = 0;
      for (let q = [padRooms[i]], k = 0; k < q.length; k++) for (const v of adj[q[k]]) if (d[v] < 0) { d[v] = d[q[k]] + 1; q.push(v); }
      for (let j = i + 1; j < padRooms.length; j++) if (d[padRooms[j]] < MIN_PAD_SPACING) return false;
    }
    return true;
  };
  let found = null;
  const best = plan.length + (plan.length > 1 ? 1 : 0);   // one stair per extra floor (+ the loop)
  for (let a = 0; a < 400 && !(found && found.plans.length <= best); a++) {
    const f2 = new Int8Array(rooms.length), whole = a < 80;   // first tries take whole branches (fewest stairs)
    let ok = true;
    for (const f of plan) {
      const roots = order.filter((c) => c !== 0 && f2[c] === 0 && f2[parent[c]] === 0);
      if (!roots.length) { ok = false; break; }
      const c = roots[Math.floor(R() * roots.length)];
      const cap = whole ? 1e9 : 3 + Math.floor(R() * Math.max(1, total / (plan.length + 1)));
      const set = [c], q = [...kids[c]]; let n = counted(rooms[c]) ? 1 : 0;
      while (q.length && n < cap) { const r = q.splice(whole ? 0 : Math.floor(R() * q.length), 1)[0]; if (f2[r] !== 0) continue; set.push(r); if (counted(rooms[r])) n++; q.push(...kids[r]); }
      if (n < 3) { ok = false; break; }
      for (const r of set) f2[r] = f;
    }
    if (!ok || rooms.filter((r) => f2[r.id] === 0 && counted(r)).length < 1) continue;
    // stairs on every tree door between floors
    const used = new Set([0]), plans = [];
    for (const c of order) {
      if (c === 0 || f2[c] === f2[parent[c]]) continue;
      const p = parent[c], d = house.doors[pdoor[c]];
      if (Math.abs(f2[c] - f2[p]) !== 1) { ok = false; break; }
      const pl = stairPlan(c, f2[p] * FLOOR_DY, f2[c] * FLOOR_DY, d, used) || stairPlan(p, f2[c] * FLOOR_DY, f2[p] * FLOOR_DY, d, used);
      if (!pl) { ok = false; break; }
      used.add(pl.st.room); pl.st.floors = [f2[p], f2[c]]; plans.push(pl);
    }
    let lp = null;
    if (ok && plan.length > 1) {   // the loop: a second stair far from the others, its door clear of their ramps
      const near = (dd) => plans.some((pl) => pl.st.cells.some((i) => { const x = i % w, y = (i / w) | 0; return x >= dd.x0 - 2 && x < dd.x0 + dd.zw + 2 && y >= dd.y0 - 2 && y < dd.y0 + dd.zh + 2; }));
      const cs = walls2.filter((c) => Math.abs(f2[c.A] - f2[c.B]) === 1 && !near(c.dd))
        .map((c) => ({ c, k: -Math.min(...plans.map((pl) => Math.hypot(pl.st.door.x - c.dd.x, pl.st.door.y - c.dd.y))) + R() * 3 })).sort((x, y) => x.k - y.k);
      for (const { c } of cs) {
        if (!padsSpaced(c.A, c.B)) continue;   // the loop must not bring two pads closer than MIN_PAD_SPACING doors
        const pl = stairPlan(c.A, f2[c.B] * FLOOR_DY, f2[c.A] * FLOOR_DY, c.dd, used) || stairPlan(c.B, f2[c.A] * FLOOR_DY, f2[c.B] * FLOOR_DY, c.dd, used);
        if (pl) { pl.st.floors = [f2[c.A], f2[c.B]]; pl.st.loop = true; lp = pl; break; }
      }
      if (!lp) ok = false;
    }
    const all = lp ? [...plans, lp] : plans;
    if (ok && (!found || all.length < found.plans.length)) found = { f2, plans: all, loop: lp };
  }
  if (!found) throw new Error('floors: no split into floors of >= 3 rooms with room for every ramp');
  fl.set(found.f2);
  for (const pl of found.plans) pl.commit();
  for (const r of rooms) r.floor = fl[r.id];

  // ---- wall up doors between floors that are not stairs (loops of the plan)
  const stairDoors = new Set(stairs.map((s) => s.door));
  house.doors = house.doors.filter((d) => {
    if (fl[d.a] === fl[d.b] || stairDoors.has(d)) return true;
    for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) grid[y * w + x] = 2;
    return false;
  });
  markDoors();

  const loop = found.loop;
  if (loop) {
    const dd = loop.st.door; house.doors.push(dd);
    for (let y = dd.y0; y < dd.y0 + dd.zh; y++) for (let x = dd.x0; x < dd.x0 + dd.zw; x++) grid[y * w + x] = 3;
    markDoors();
  }

  // ---- per cell floor and height
  const floorOf = new Int8Array(N), hcell = new Float32Array(N), stairOf = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (roomOf[i] >= 0) { floorOf[i] = fl[roomOf[i]]; hcell[i] = fl[roomOf[i]] * FLOOR_DY; }
  for (const d of house.doors) {
    const st = stairs.find((s) => s.door === d), lv = st ? st.hD / FLOOR_DY : fl[d.a];
    for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) { floorOf[y * w + x] = lv; hcell[y * w + x] = lv * FLOOR_DY; }
  }
  stairs.forEach((st, si) => { for (const i of st.cells) { stairOf[i] = si; hcell[i] = rampH(st, (i % w) + 0.5, ((i / w) | 0) + 0.5); } delete st.cells; });
  Object.assign(house, { floorOf, hcell, stairOf, stairs, floors: { levels: [0, ...plan], loop: !!loop } });
  return house;
}

function rectHits(p, set, w) { for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (set.has(y * w + x)) return true; return false; }
function flood(s, ok, w, h) {
  const seen = new Set(); if (!ok(s)) return seen; seen.add(s); const q = [s];
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % w, y = (i / w) | 0;
    for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y > 0 ? i - w : -1]) if (j >= 0 && !seen.has(j) && ok(j)) { seen.add(j); q.push(j); } }
  return seen;
}
