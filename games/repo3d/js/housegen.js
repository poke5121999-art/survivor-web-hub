// House layouts for the three.js remake: a JS port of the Unity block generator.
// Source of truth (read-only): D:/REPO_Topdown/Assets/Scripts/Port/World/HouseGen.cs (layout search),
// Engine/G03_World_c.cs (moldPool, buildNewHouse, paintBlock, carveConnectorZone), Engine/G03_World_a.cs (buildLevel seeds,
// PickTruckRoom, pads), Engine/G02_Doors.cs (lockDoors). Same algorithm, same constants, same RNG draw order, so the
// numbers of rooms, connectors (3 tiles wide), tree shape, extract placement, pad spacing and cart clearance match.
// Comments cite the C# only where this port deliberately differs. Data: ../data/rooms.js (tools/export-rooms.js).
//
//   generateHouse({ theme, houseIndex /*1..5*/, seed }) -> { w, h, grid, block, rooms, doors, pads, truck, loot, foes, traps, props, lights, ... }
//
// Tile coords, x right, y down, 1 tile = 1 m. grid: 0 void, 1 floor, 2 wall, 3 door (connector zone, walkable).
// block: 1 where a blocking prop stands on a floor cell (walkable only with the prop removed).
import { ROOMS, HOUSE_SPECS, MIN_PAD_SPACING } from '../data/rooms.js';

export const CART_CLEARANCE = 3;      // RoomCheck.CART_CLEARANCE = G.REPAIR_CORRIDOR_TILES (RoomGen.cs:1094)
export const FLOOR = 1, WALL = 2, DOOR = 3;
const RW = 21, RH = 15;               // module size, only used for the build frame (G01_Config.cs:35)
const MAX_MODULES_WIDE = 8, MAX_VERTICAL = 11;   // G03_World_c.cs:249
const HOUSE_SEED_TRIES = 8;           // G03_World_c.cs:225
const VARIETY_TRY_FACTOR = 5;         // HouseGen.cs:171
const LIVE_RESERVE = 5;               // HouseGen.cs:1121
const DOOR_LOCK_FRAC = 0.25, DOOR_LOCK_LEVEL = 2, DOOR_SEAL_MAX = 0.3;   // G02_Doors.cs:116,281
const THEME_HOUSE_LEVEL = [1, 3, 6, 10, 15];     // stage_theme_houses.json "level" per house position
const SIDE = { top: 0, bottom: 1, left: 2, right: 3 };   // RamSide enum, G05_Cutscene.cs:910
const RAM_DOOR_SIDE = [2, 3, 0, 1];   // RamSide -> index into mold.door (0 left, 1 right, 2 top, 3 bottom)
const opposite = (s) => s ^ 1;

// ------------------------------------------------------------------ RNG (JsRand.mulberry32, JsMath.cs:148)
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ molds (G03_World_c.cs:63-128, moldPool)
const PROP_CH = new Set(['F']);   // rows from export-rooms.js only use 'F' for blockers
const isFloorCh = (c) => c === '.' || c === 'L' || c === 'M';
const walkCh = (c) => c !== '#' && c !== ' ' && c !== 'd' && !PROP_CH.has(c);
function sanCh(c) { return c !== '#' && c !== ' ' && c !== 'd' && !PROP_CH.has(c); }   // missingLeftTopEdge's san()

function missingLeftTopEdge(room) {
  const rows = room.rows;
  for (let x = 0; x < rows[0].length; x++) if (sanCh(rows[0][x])) return true;
  for (let y = 0; y < rows.length; y++) if (rows[y].length > 0 && sanCh(rows[y][0])) return true;
  return false;
}
function cellWalkable(room, vien, fx, fy, x, y) {   // isBlockCellWalkable
  const px = x - (vien ? 1 : 0), py = y - (vien ? 1 : 0);
  if (px < 0 || py < 0 || px >= room.w || py >= room.h) return false;
  const sx = fx ? room.w - 1 - px : px, sy = fy ? room.h - 1 - py : py;
  const row = room.rows[sy] || '';
  return walkCh(sx < row.length ? row[sx] : '.');
}
function missingRightBottomEdge(room) {
  for (let y = 0; y < room.h; y++) if (cellWalkable(room, false, false, false, room.w - 1, y)) return true;
  for (let x = 0; x < room.w; x++) if (cellWalkable(room, false, false, false, x, room.h - 1)) return true;
  return false;
}
function connectsIntoInterior(room, W, H, vien, fx, fy, side, v) {
  for (let after = 1; after <= 2; after++) {
    const x = side === 0 ? after : side === 1 ? W - 1 - after : v;
    const y = side === 2 ? after : side === 3 ? H - 1 - after : v;
    if (!cellWalkable(room, vien, fx, fy, x, y)) return false;
  }
  return true;
}
function doorCapOf(r) {   // RoomDef.DoorCap (G01_Rooms.cs:317)
  if (r.kind === 'truck' || r.kind === 'extract' || r.kind === 'special') return r.maxDoors === 0 ? 0 : 1;
  if (r.maxDoors >= 0) return r.maxDoors;
  return r.kind === 'corridor' ? 2 : r.kind === 'deadend' ? 1 : Infinity;
}
function doorsByTile(r, fx, fy) {   // RoomDef.DoorsByTile (G01_Rooms.cs:341)
  const out = [];
  if (!r.doors) return out;
  for (const m of r.doors) {
    let c0 = m.side, p = m.pos;
    if (fx) { if (c0 <= 1) c0 = 1 - c0; else p = r.w - 1 - p; }
    if (fy) { if (c0 >= 2) c0 = 5 - c0; else p = r.h - 1 - p; }
    out.push([c0, p]);
  }
  return out;
}
/** One mold per (prefab, flip). `list` = [{room, prefab}] in pool order (phong, extract +10000, truck 30000). */
function moldPool(list) {
  const pool = [];
  for (const { room: d, prefab } of list) {
    const cap = doorCapOf(d);
    if (cap <= 0) continue;   // sealed prefab (rejectedPrefabs)
    const vien = missingLeftTopEdge(d), rimRB = missingRightBottomEdge(d) ? 1 : 0;
    const W = d.w + (vien ? 1 : 0) + rimRB, H = d.h + (vien ? 1 : 0) + rimRB;
    const flips = d.allowFlip ? [[false, false], [true, false], [false, true], [true, true]] : [[false, false]];
    for (const [fx, fy] of flips) {
      const k = {
        prefab, latX: fx, flipY: fy, kind: d.kind, width: W, height: H, addRim: vien, room: d,
        unit: d.kind === 'corridor' ? 1 : (d.size === 'large' ? 4 : d.size === 'medium' ? 2 : 1),
        measuredLength: Math.max(W, H), horizontal: W >= H,
        lengthClass: d.size === 'extralong' ? 2 : d.size === 'long' ? 1 : 0,
        doorCap: cap, ramSide: d.ram ? SIDE[d.ram] : 0, ramFixed: !!d.ram,
        door: [[], [], [], []],
      };
      for (const [c, p] of doorsByTile(d, fx, fy)) if (c >= 0 && c < 4) k.door[c].push(p + (vien ? 1 : 0));
      if (!d.doors) { k.door[0].push(H >> 1); k.door[1].push(H >> 1); k.door[2].push(W >> 1); k.door[3].push(W >> 1); }
      for (let c = 0; c < 4; c++) {
        const dai = c <= 1 ? H : W;
        k.door[c] = k.door[c].filter((v) => v >= 1 && v <= dai - 2 && connectsIntoInterior(d, W, H, vien, fx, fy, c, v));
      }
      if (k.door[0].length + k.door[1].length + k.door[2].length + k.door[3].length === 0) continue;
      pool.push(k);
    }
  }
  return pool;
}

// ------------------------------------------------------------------ HouseGen.Build and friends
class Base {   // HouseGen.cs:168
  constructor(w, h, blocks) { this.width = w; this.height = h; this.ds = blocks; }
  canPlace(x, y, w, h, skip) {
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return false;
    const ds = this.ds;
    for (let i = 0; i < ds.length; i++) {
      if (i === skip) continue;
      const k = ds[i];
      const gapX = x >= k.x + k.width ? x - (k.x + k.width) : k.x >= x + w ? k.x - (x + w) : -1;
      const gapY = y >= k.y + k.height ? y - (k.y + k.height) : k.y >= y + h ? k.y - (y + h) : -1;
      if (gapX < 0 && gapY < 0) return false;
      if (gapX === 1 && gapY < 0) return false;
      if (gapY === 1 && gapX < 0) return false;
    }
    return true;
  }
}
const opening = (block, side, position) => ({ block, side, position });
const groupOf = (kind) => kind === 'shared' ? 0 : kind === 'private' ? 1 : (kind === 'extract' || kind === 'special') ? 2 : -1;

function countPlan(p, pool) {
  const c = { truck: 0, extractRooms: 0, privateRooms: 0, sharedRooms: 0, shortCorridors: 0, longCorridors: 0 };
  for (const k of p.block) {
    if (k.mold < 0 || k.mold >= pool.length) continue;
    const m = pool[k.mold];
    if (k.role === 'truck') c.truck++;
    else if (m.kind === 'corridor') { if (m.lengthClass === 0) c.shortCorridors++; else c.longCorridors++; }
    else if (m.kind === 'extract' || m.kind === 'special') c.extractRooms++;
    else if (m.kind === 'private') c.privateRooms++;
    else if (m.kind === 'shared') c.sharedRooms++;
  }
  return c;
}
const countsMatch = (sp, c) => c.truck === 1 && c.extractRooms === sp.extractRooms && c.privateRooms === sp.privateRooms &&
  c.sharedRooms === sp.sharedRooms && c.shortCorridors === sp.shortCorridors && c.longCorridors === sp.longCorridors;

function usedPrefabs(p, pool, group) {
  const used = new Set();
  for (const k of p.block) if (k.mold >= 0 && k.mold < pool.length && groupOf(pool[k.mold].kind) === group) used.add(pool[k.mold].prefab);
  return used;
}
function redundantRepeats(p, pool, only = -1) {
  let sum = 0;
  for (let g = 0; g < 3; g++) {
    if (only >= 0 && only !== g) continue;
    let rooms = 0;
    for (const k of p.block) if (k.mold >= 0 && k.mold < pool.length && groupOf(pool[k.mold].kind) === g) rooms++;
    const used = usedPrefabs(p, pool, g);
    const size = new Set();
    for (const kh of pool) if (groupOf(kh.kind) === g) size.add(kh.prefab);
    sum += Math.max(0, Math.min(rooms - used.size, size.size - used.size));
  }
  return sum;
}
const avoidableRepeats = (p, pool) => Math.max(0, redundantRepeats(p, pool, 0) - p.forcedRepeats) + redundantRepeats(p, pool, 1) + redundantRepeats(p, pool, 2);
const score = (p) => p.extract.length * 10000 + p.own.length * 100 + p.block.length;

function doorCount(p, id) { let n = 0; for (const c of p.door) if (c.a === id || c.b === id) n++; return n; }
const belowCap = (p, pool, o, joining = -1) => doorCount(p, o.block) + (o.block === joining ? 1 : 0) < pool[p.block[o.block].mold].doorCap;
const doorTotal = (kh) => kh.door[0].length + kh.door[1].length + kh.door[2].length + kh.door[3].length;
const isDeadEnd = (kh) => Math.min(kh.doorCap, doorTotal(kh)) <= 1;
const spareDoors = (kh) => Math.min(kh.doorCap, doorTotal(kh)) - 1;
function alreadyUsed(p, l) {
  const k = p.block[l.block];
  const cx = l.side === 0 ? k.x : l.side === 1 ? k.x + k.width - 1 : k.x + l.position;
  const cy = l.side === 2 ? k.y : l.side === 3 ? k.y + k.height - 1 : k.y + l.position;
  for (const c of p.door) if (cx >= c.x - 1 && cx <= c.x + c.width && cy >= c.y - 1 && cy <= c.y + c.thickness) return true;
  return false;
}
function addBlock(p, x, y, k, role, desiredUnit) {
  const id = p.block.length;
  p.block.push({ x, y, width: k.width, height: k.height, role, mold: -1, desiredUnit });
  if (k.unit < desiredUnit) p.downsizeCount++;
  return id;
}
function addOpenings(error, p, pool, id) {
  const kh = pool[p.block[id].mold];
  for (let side = 0; side < 4; side++) for (const v of kh.door[side]) error.push(opening(id, side, v));
}
/** Returns {id, connect, spaceMiss}; id -1 = no spot. Adds the block (mold left -1 for the caller). */
function placeMatchingDoor(p, bg, l, kh, role, desiredUnit) {
  const a = p.block[l.block], sideB = opposite(l.side);
  let spaceMiss = false;
  for (const w of kh.door[sideB]) {
    let bx, by;
    if (l.side === 1) { bx = a.x + a.width; by = a.y + l.position - w; }
    else if (l.side === 0) { bx = a.x - kh.width; by = a.y + l.position - w; }
    else if (l.side === 3) { bx = a.x + l.position - w; by = a.y + a.height; }
    else { bx = a.x + l.position - w; by = a.y - kh.height; }
    if (l.side <= 1) { if (l.position < 1 || l.position > a.height - 2 || w < 1 || w > kh.height - 2) continue; }
    else if (l.position < 1 || l.position > a.width - 2 || w < 1 || w > kh.width - 2) continue;
    if (!bg.canPlace(bx, by, kh.width, kh.height, -1)) { spaceMiss = true; continue; }
    const id = addBlock(p, bx, by, kh, role, desiredUnit);
    let connect;
    if (l.side <= 1) {
      const left = l.side === 1 ? a.x + a.width - 1 : bx + kh.width - 1;
      connect = { a: l.side === 1 ? l.block : id, b: l.side === 1 ? id : l.block, x: left, y: a.y + l.position - 1, width: 3, thickness: 2, direction: 0 };
    } else {
      const on = l.side === 3 ? a.y + a.height - 1 : by + kh.height - 1;
      connect = { a: l.side === 3 ? l.block : id, b: l.side === 3 ? id : l.block, x: a.x + l.position - 1, y: on, width: 3, thickness: 2, direction: 1 };
    }
    return { id, connect, spaceMiss };
  }
  return { id: -1, connect: null, spaceMiss };
}

// cart reach (HouseGen.cs:848): a block is cart-reachable if both door ends sit on a cart door cell of their mold
function cartReach(p, pool) {
  const onDoor = (block, side, position) => pool[p.block[block].mold].door[side].includes(position);
  const nd = p.door.length, ends = new Array(nd * 2);
  for (let i = 0; i < nd; i++) {
    const c = p.door[i], a = p.block[c.a], b = p.block[c.b];
    ends[2 * i] = c.direction === 0 ? onDoor(c.a, 1, c.y + 1 - a.y) : onDoor(c.a, 3, c.x + 1 - a.x);
    ends[2 * i + 1] = c.direction === 0 ? onDoor(c.b, 0, c.y + 1 - b.y) : onDoor(c.b, 2, c.x + 1 - b.x);
  }
  const dark = new Array(p.block.length).fill(false);
  for (let i = 0; i < nd; i++) {
    const c = p.door[i];
    for (const t of p.trucks) {
      if (c.a === t.block && ends[2 * i]) dark[c.a] = true;
      if (c.b === t.block && ends[2 * i + 1]) dark[c.b] = true;
    }
  }
  for (let add = true; add;) {
    add = false;
    for (let i = 0; i < nd; i++) {
      if (!ends[2 * i] || !ends[2 * i + 1]) continue;
      const c = p.door[i];
      if (dark[c.a] && !dark[c.b]) { dark[c.b] = true; add = true; }
      if (dark[c.b] && !dark[c.a]) { dark[c.a] = true; add = true; }
    }
  }
  return dark;
}
const cartReachesExtract = (p, pool) => { const d = cartReach(p, pool); return p.extract.every((e) => d[e]); };

function pads(p) { return p.trucks.map((t) => t.block).concat(p.extract); }
function doorDistance(p, from) {
  const d = new Array(p.block.length).fill(-1);
  const q = [from]; d[from] = 0;
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const c of p.door) {
      const v = c.a === u ? c.b : c.b === u ? c.a : -1;
      if (v < 0 || v >= d.length || d[v] >= 0) continue;
      d[v] = d[u] + 1; q.push(v);
    }
  }
  return d;
}
function padsSpaced(p, spacing) {
  const ps = pads(p);
  for (let i = 0; i < ps.length; i++) {
    const d = doorDistance(p, ps[i]);
    for (let j = i + 1; j < ps.length; j++) if (d[ps[j]] < 0 || d[ps[j]] < spacing) return false;
  }
  return true;
}
// walking distance block centre -> block centre over interiors + connector zones (HouseGen.cs:1293)
let _go = null, _seen = null, _dist = null, _queue = null, _gen = 0;
function distance(p, from) {
  const W = p.widthCells, H = p.heightCells, n = W * H;
  if (!_go || _go.length < n) { _go = new Int32Array(n); _seen = new Int32Array(n); _dist = new Int32Array(n); _queue = new Int32Array(n); _gen = 0; }
  const gen = ++_gen, go = _go, seen = _seen, d = _dist, q = _queue;
  for (const k of p.block) for (let y = k.y + 1; y < k.y + k.height - 1; y++) for (let x = k.x + 1; x < k.x + k.width - 1; x++) go[y * W + x] = gen;
  for (const c of p.door) {
    const w = c.direction === 0 ? c.thickness : c.width, h = c.direction === 0 ? c.width : c.thickness;
    for (let y = c.y; y < c.y + h; y++) for (let x = c.x; x < c.x + w; x++) if (x >= 0 && y >= 0 && x < W && y < H) go[y * W + x] = gen;
  }
  const k0 = p.block[from];
  const s0 = (k0.y + (k0.height >> 1)) * W + k0.x + (k0.width >> 1);
  let head = 0, tail = 0;
  d[s0] = 0; seen[s0] = gen; q[tail++] = s0;
  while (head < tail) {
    const cur = q[head++], x = cur % W, y = (cur / W) | 0, dn = d[cur] + 1;
    if (x > 0) { const ni = cur - 1; if (seen[ni] !== gen && go[ni] === gen) { seen[ni] = gen; d[ni] = dn; q[tail++] = ni; } }
    if (x < W - 1) { const ni = cur + 1; if (seen[ni] !== gen && go[ni] === gen) { seen[ni] = gen; d[ni] = dn; q[tail++] = ni; } }
    if (y > 0) { const ni = cur - W; if (seen[ni] !== gen && go[ni] === gen) { seen[ni] = gen; d[ni] = dn; q[tail++] = ni; } }
    if (y < H - 1) { const ni = cur + W; if (seen[ni] !== gen && go[ni] === gen) { seen[ni] = gen; d[ni] = dn; q[tail++] = ni; } }
  }
  const kq = new Array(p.block.length);
  for (let id = 0; id < kq.length; id++) {
    const k = p.block[id], c = (k.y + (k.height >> 1)) * W + k.x + (k.width >> 1);
    kq[id] = seen[c] === gen ? d[c] : -1;
  }
  return kq;
}

function shufflePreferLeastUsed(cands, p, pool, rnd) {   // HouseGen.cs:665
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cands[i]; cands[i] = cands[j]; cands[j] = t; }
  if (cands.length < 2) return;
  const n = cands.length, count = new Array(n);
  for (let i = 0; i < n; i++) {
    const pf = pool[cands[i]].prefab; let c = 0;
    for (const k of p.block) if (k.mold >= 0 && k.mold < pool.length && pool[k.mold].prefab === pf) c++;
    count[i] = c;
  }
  for (let i = 1; i < n; i++) {
    const cand = cands[i], c = count[i]; let j = i - 1;
    while (j >= 0 && count[j] > c) { cands[j + 1] = cands[j]; count[j + 1] = count[j]; j--; }
    cands[j + 1] = cand; count[j + 1] = c;
  }
}
function distinctPrefabs(mold, pool) {
  let n = 0;
  for (let i = 0; i < mold.length; i++) { const pf = pool[mold[i]].prefab; let j = 0; while (j < i && pool[mold[j]].prefab !== pf) j++; if (j === i) n++; }
  return n;
}
function tryLeaf(p, bg, l, pool, style, role, rejects) {   // HouseGen.cs:804
  if (pool[style].door[opposite(l.side)].length === 0) return -1;
  const r = placeMatchingDoor(p, bg, l, pool[style], role, pool[style].unit);
  if (r.id < 0) return -1;
  p.block[r.id].mold = style;
  p.door.push(r.connect);
  const why = rejects(r.id);
  if (!why) return r.id;
  p.door.pop();
  p.block.splice(r.id, 1);
  return -1;
}
function attachLeaf(p, bg, rnd, pool, error, box, role, rejects, isValidDoor, priority, allowRepeat, leavesLeft) {   // HouseGen.cs:699
  const nOrder = error.length, order = new Array(nOrder);
  for (let i = 0; i < nOrder; i++) order[i] = i;
  for (let i = nOrder - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  let mold = [];
  const used = new Set();
  if (!allowRepeat) for (const k of p.block) if (k.mold >= 0 && k.mold < pool.length && box(pool[k.mold].kind)) used.add(pool[k.mold].prefab);
  for (let i = 0; i < pool.length; i++) if (box(pool[i].kind) && !used.has(pool[i].prefab)) mold.push(i);
  shufflePreferLeastUsed(mold, p, pool, rnd);
  let live = [];
  for (let oi = 0; oi < nOrder; oi++) {
    const l = error[order[oi]];
    if (!alreadyUsed(p, l) && doorCount(p, l.block) < pool[p.block[l.block].mold].doorCap && isValidDoor(l)) live.push(l);
  }
  if (priority && live.length > 1) {
    const point = live.map((l) => priority(l)), index = live.map((_, i) => i);
    index.sort((a, b) => (point[b] !== point[a] ? (point[b] < point[a] ? -1 : 1) : a - b));
    live = index.map((i) => live[i]);
  }
  if (live.length === 0) return -1;
  if (!allowRepeat && distinctPrefabs(mold, pool) <= leavesLeft) {
    const fits = new Map(), area = new Map();
    for (const i of mold) {
      const pf = pool[i].prefab;
      fits.set(pf, (fits.get(pf) || 0) + live.filter((l) => pool[i].door[opposite(l.side)].length > 0).length);
      area.set(pf, Math.max(area.get(pf) || 0, pool[i].width * pool[i].height));
    }
    const position = new Map(mold.map((m, i) => [m, i]));
    mold.sort((a, b) => {
      const pa = pool[a].prefab, pb = pool[b].prefab;
      if (fits.get(pa) !== fits.get(pb)) return fits.get(pa) - fits.get(pb);
      if (area.get(pa) !== area.get(pb)) return area.get(pb) - area.get(pa);
      return position.get(a) - position.get(b);
    });
    for (const style of mold) for (const l of live) { const id = tryLeaf(p, bg, l, pool, style, role, rejects); if (id >= 0) return id; }
    return -1;
  }
  for (const l of live) for (const style of mold) { const id = tryLeaf(p, bg, l, pool, style, role, rejects); if (id >= 0) return id; }
  return -1;
}
function addPrivateRoom(p, bg, rnd, pool, error) {
  const isPrivate = (k) => k === 'private';
  let id = attachLeaf(p, bg, rnd, pool, error, isPrivate, 'room', () => null, () => true, null, false, 1);
  if (id < 0) id = attachLeaf(p, bg, rnd, pool, error, isPrivate, 'room', () => null, () => true, null, true, 1);
  if (id < 0) return false;
  p.own.push(id);
  return true;
}
function themExtract(p, bg, sp, rnd, pool, error, onlyWhenFar) {   // HouseGen.cs:607
  let dEx = null;
  const padDistance = (l) => {
    if (!dEx) dEx = p.extract.map((e) => distance(p, e));
    let far = Infinity;
    for (const d of dEx) far = Math.min(far, d[l.block] < 0 ? Infinity : d[l.block]);
    return far;
  };
  const ps = pads(p), hops = ps.map((e) => doorDistance(p, e));
  const isValidDoor = (l) => !onlyWhenFar || hops.every((h) => h[l.block] >= 0 && h[l.block] + 1 >= sp.minPadSpacing);
  const rejects = (newVal) => {
    if (!cartReach(p, pool)[newVal]) return 'cart';
    const d = doorDistance(p, newVal);
    for (const e of ps) if (d[e] < 0 || d[e] < sp.minPadSpacing) return 'pad';
    return null;
  };
  const isExtract = (k) => k === 'extract' || k === 'special';
  const leavesLeft = sp.extractRooms - p.extract.length;
  let id = attachLeaf(p, bg, rnd, pool, error, isExtract, 'extract', rejects, isValidDoor, padDistance, false, leavesLeft);
  if (id < 0 && !onlyWhenFar) id = attachLeaf(p, bg, rnd, pool, error, isExtract, 'extract', rejects, isValidDoor, padDistance, true, leavesLeft);
  if (id < 0) return false;
  p.extract.push(id);
  return true;
}
function placeLeaf(p, bg, sp, rnd, pool, error) {
  while (p.extract.length < sp.extractRooms && themExtract(p, bg, sp, rnd, pool, error, false)) { /* */ }
  while (p.own.length < sp.privateRooms && addPrivateRoom(p, bg, rnd, pool, error)) { /* */ }
}

// open-opening bookkeeping (HouseGen.cs:1099-1190)
function doorsPerBlock(p) { const d = new Array(p.block.length).fill(0); for (const c of p.door) { d[c.a]++; d[c.b]++; } return d; }
function anyBelowCap(p, pool, a, b, joining) {
  const doors = doorsPerBlock(p);
  for (let pass = 0; pass < 2; pass++) for (const o of pass === 0 ? a : b)
    if (!alreadyUsed(p, o) && doors[o.block] + (o.block === joining ? 1 : 0) < pool[p.block[o.block].mold].doorCap) return true;
  return false;
}
function openingTakesGrowth(p, pool, bg, o) {
  const sideB = opposite(o.side);
  for (let i = 0; i < pool.length; i++) {
    const kh = pool[i];
    if ((kh.kind !== 'shared' && kh.kind !== 'corridor') || kh.door[sideB].length === 0) continue;
    const r = placeMatchingDoor(p, bg, o, kh, 'room', 1);
    if (r.id < 0) continue;
    const id = r.id;
    let fits = kh.kind === 'shared';
    if (!fits && kh.door[o.side].length > 0) {
      p.block[id].mold = i;
      const far = opening(id, o.side, kh.door[o.side][0]);
      for (let j = 0; j < pool.length && !fits; j++) {
        if (pool[j].kind !== 'shared' || pool[j].door[sideB].length === 0) continue;
        const r2 = placeMatchingDoor(p, bg, far, pool[j], 'room', 1);
        if (r2.id < 0) continue;
        p.block.splice(r2.id, 1);
        fits = true;
      }
    }
    p.block.splice(id, 1);
    if (fits) return true;
  }
  return false;
}
function countLive(p, pool, bg, a, b, need, joining = -1) {
  let n = 0;
  if (need <= 0) return 0;
  for (let pass = 0; pass < 2; pass++) for (const o of pass === 0 ? a : b) {
    if (alreadyUsed(p, o) || !belowCap(p, pool, o, joining)) continue;
    if (openingTakesGrowth(p, pool, bg, o) && ++n >= need) return n;
  }
  return n;
}
function countBelowCap(p, pool, a, b) {
  const doors = doorsPerBlock(p); let n = 0;
  for (const o of a) if (doors[o.block] < pool[p.block[o.block].mold].doorCap) n++;
  for (const o of b) if (doors[o.block] < pool[p.block[o.block].mold].doorCap) n++;
  return n;
}
function wantFromStock(p, pool, r, fallback) {
  const used = usedPrefabs(p, pool, 0), seen = new Set(), n = [0, 0, 0];
  for (const kh of pool) {
    if (kh.kind !== 'shared' || used.has(kh.prefab) || seen.has(kh.prefab)) continue;
    seen.add(kh.prefab);
    n[kh.unit >= 4 ? 2 : kh.unit === 2 ? 1 : 0]++;
  }
  const total = n[0] + n[1] + n[2];
  if (total === 0) return fallback;
  const x = r * total;
  return x < n[0] ? 1 : x < n[0] + n[1] ? 2 : 4;
}
function tryPlaceRoom(p, bg, pool, l, error, role, allowLoop, deadEndOk, minFree, want, read, rnd, keep) {   // HouseGen.cs:1011
  const sideB = opposite(l.side);
  const used = new Set();
  if (!allowLoop) for (const k of p.block) if (k.mold >= 0 && k.mold < pool.length && pool[k.mold].kind === 'shared') used.add(pool[k.mold].prefab);
  const sizes = [];
  if (want >= 4) sizes.push([4, false]);
  if (want >= 2) { sizes.push([2, read]); sizes.push([2, !read]); }
  sizes.push([1, false]);
  if (!allowLoop) {
    if (want < 2) { sizes.push([2, read]); sizes.push([2, !read]); }
    if (want < 4) sizes.push([4, false]);
  }
  for (const [unit, isVertical] of sizes) {
    const cands = [];
    for (let i = 0; i < pool.length; i++) {
      const kh = pool[i];
      if (kh.kind !== 'shared') continue;
      if (kh.unit !== unit || (unit === 2 && kh.horizontal === isVertical)) continue;
      if (kh.door[sideB].length === 0) continue;
      if (!allowLoop && used.has(kh.prefab)) continue;
      if (!deadEndOk && isDeadEnd(kh)) continue;
      if (spareDoors(kh) < minFree) continue;
      cands.push(i);
    }
    shufflePreferLeastUsed(cands, p, pool, rnd);
    for (const i of cands) {
      const r = placeMatchingDoor(p, bg, l, pool[i], role, want);
      if (r.id < 0) continue;
      const id = r.id;
      p.block[id].mold = i;
      p.door.push(r.connect);
      const before = error.length;
      addOpenings(error, p, pool, id);
      if (keep.live > 0 && countLive(p, pool, bg, error, keep.deferred, keep.live) < keep.live) {
        error.splice(before);
        p.door.pop();
        if (pool[i].unit < want) p.downsizeCount--;
        p.block.splice(id, 1);
        continue;
      }
      return id;
    }
  }
  return -1;
}
function placeRoom(p, bg, sp, rnd, rndCo, pool, l, error, role, allowLoop, deadEndOk, minFree, keep) {   // HouseGen.cs:973
  const r = rndCo(); const read = rndCo() < 0.5;
  let want = r < sp.largeRatio ? 4 : r < sp.largeRatio + sp.mediumRatio ? 2 : 1;
  if (sp.sizeByStock) want = wantFromStock(p, pool, r, want);
  if (minFree > 0) {
    let id = tryPlaceRoom(p, bg, pool, l, error, role, allowLoop, deadEndOk, minFree, want, read, rnd, keep);
    if (id < 0 && !allowLoop) {
      id = tryPlaceRoom(p, bg, pool, l, error, role, true, deadEndOk, minFree, want, read, rnd, keep);
      if (id >= 0) p.forcedRepeats++;
    }
    if (id >= 0) return id;
  }
  return tryPlaceRoom(p, bg, pool, l, error, role, allowLoop, deadEndOk, 0, want, read, rnd, keep);
}
function placeCorridor(p, bg, sp, rnd, rndCo, pool, l, error, allowLoop, deadEndOk, isLong, minFree, keep) {   // HouseGen.cs:1194
  const classes = !isLong ? [0] : rndCo() < 0.5 ? [1, 2] : [2, 1];
  const horizontal = l.side <= 1, sideB = opposite(l.side);
  for (const lengthClass of classes) {
    const cands = [];
    for (let i = 0; i < pool.length; i++) {
      const kh = pool[i];
      if (kh.kind !== 'corridor' || kh.horizontal !== horizontal || kh.lengthClass !== lengthClass) continue;
      if (kh.door[sideB].length === 0 || kh.door[l.side].length === 0) continue;
      cands.push(i);
    }
    shufflePreferLeastUsed(cands, p, pool, rnd);
    for (const i of cands) {
      const blockCount = p.block.length, doorCnt = p.door.length, pathCount = error.length;
      const r = placeMatchingDoor(p, bg, l, pool[i], 'corridor', 1);
      if (r.id < 0) continue;
      p.block[r.id].mold = i;
      p.door.push(r.connect);
      const kh = pool[i];
      const v2 = kh.door[l.side].length > 0 ? kh.door[l.side][0] : -1;
      if (v2 >= 0) {
        const l2 = opening(r.id, l.side, v2);
        if (placeRoom(p, bg, sp, rnd, rndCo, pool, l2, error, 'room', allowLoop, deadEndOk, minFree, keep) >= 0) return lengthClass;
      }
      p.block.splice(blockCount);
      p.door.splice(doorCnt);
      error.splice(pathCount);
    }
  }
  return -1;
}
function pickRamSide(truck, rnd) {   // HouseGen.cs:560
  const sides = [];
  for (let s = 0; s < 4; s++) for (let c = 0; c < 4; c++) if (c !== RAM_DOOR_SIDE[s] && truck.door[c].length > 0) { sides.push(s); break; }
  return sides.length === 0 ? truck.ramSide : sides[Math.floor(rnd() * sides.length)];
}

function grow(sp, rnd, rndCo, pool) {   // HouseGen.cs:367 (single truck: no CornerAlong / AttachTruck, see data/README.md)
  const p = { widthCells: sp.widthCells, heightCells: sp.heightCells, block: [], door: [], trucks: [], own: [], extract: [], downsizeCount: 0, backtrackCount: 0, attempt: 0, forcedRepeats: 0, meetsRule: false };
  const bg = new Base(sp.widthCells, sp.heightCells, p.block);
  const vehicle = pool.findIndex((m) => m.kind === 'truck');
  if (vehicle < 0) return null;
  const kx = pool[vehicle];
  const ram = kx.ramFixed ? kx.ramSide : pickRamSide(kx, rnd);
  const span = ram <= 1 ? sp.widthCells - kx.width : sp.heightCells - kx.height;
  const along = Math.floor(rnd() * (span + 1));
  const x0 = ram === 2 ? 0 : ram === 3 ? sp.widthCells - kx.width : along;
  const y0 = ram === 0 ? 0 : ram === 1 ? sp.heightCells - kx.height : along;
  if (!bg.canPlace(x0, y0, kx.width, kx.height, -1)) return null;
  p.block[addBlock(p, x0, y0, kx, 'truck', 1)].mold = vehicle;
  p.trucks.push({ block: 0, ramSide: ram });
  const error = [], deferred = [];
  addOpenings(error, p, pool, 0);
  let roomsLeft = sp.sharedRooms, shortLeft = sp.shortCorridors, longLeft = sp.longCorridors, step = 0;
  while (roomsLeft > 0) {
    const hlCon = shortLeft + longLeft;
    if (++step > 2000 || error.length + deferred.length === 0) break;
    const allowLoop = error.length === 0;
    const from = allowLoop ? deferred : error;
    const i = Math.floor(rnd() * from.length);
    const l = from[i];
    from[i] = from[from.length - 1]; from.pop();
    if (alreadyUsed(p, l)) continue;
    if (doorCount(p, l.block) >= pool[p.block[l.block].mold].doorCap) continue;
    const lamHL = hlCon > 0 && (roomsLeft <= hlCon || rnd() < hlCon / (hlCon + roomsLeft));
    const stillToPlace = roomsLeft - 1 + (sp.extractRooms - p.extract.length) + (sp.privateRooms - p.own.length);
    const deadEndOk = stillToPlace <= 0 || anyBelowCap(p, pool, error, deferred, l.block);
    const leavesLeft = (sp.extractRooms - p.extract.length) + (sp.privateRooms - p.own.length);
    const need = leavesLeft + (roomsLeft > 1 ? 1 : 0);
    const minFree = Math.max(0, need - countLive(p, pool, bg, error, deferred, need, l.block));
    const wantLong = lamHL && longLeft > 0 && (shortLeft === 0 || rndCo() < longLeft / hlCon);
    let placedClass = -1;
    const corridor = (isLong, repeat, keep) => (isLong ? longLeft : shortLeft) > 0 &&
      (placedClass = placeCorridor(p, bg, sp, rnd, rndCo, pool, l, error, repeat, deadEndOk, isLong, minFree, keep)) >= 0;
    const tryOnce = (repeat, keep) => lamHL
      ? (corridor(wantLong, repeat, keep) || corridor(!wantLong, repeat, keep))
      : placeRoom(p, bg, sp, rnd, rndCo, pool, l, error, 'room', repeat, deadEndOk, minFree, keep) >= 0;
    const reserve = { deferred, live: Math.min(LIVE_RESERVE, stillToPlace) };
    let done = tryOnce(false, reserve) || (allowLoop && tryOnce(true, reserve));
    while (!done && reserve.live > 1) { reserve.live--; done = tryOnce(false, reserve) || (allowLoop && tryOnce(true, reserve)); }
    if (!done) { if (!allowLoop) deferred.push(l); p.backtrackCount++; continue; }
    roomsLeft--;
    if (placedClass === 0) shortLeft--; else if (placedClass > 0) longLeft--;
    if (countBelowCap(p, pool, error, deferred) > roomsLeft + 2 &&
        (roomsLeft === 0 || countLive(p, pool, bg, error, deferred, LIVE_RESERVE + 1) > LIVE_RESERVE)) {
      if (p.extract.length < sp.extractRooms) themExtract(p, bg, sp, rnd, pool, error, true);
      if (p.own.length < sp.privateRooms) addPrivateRoom(p, bg, rnd, pool, error);
    }
  }
  for (const d of deferred) error.push(d);
  placeLeaf(p, bg, sp, rnd, pool, error);
  return p;
}

function build(sp, rnd, rndCo, pool, maxTries = 400) {   // HouseGen.cs:210
  let good = null, meets = null, triesLeft = maxTries, stale = 0;
  for (let times = 0; times < triesLeft; times++) {
    const p = grow(sp, rnd, rndCo, pool);
    if (!p) continue;
    p.attempt = times;
    const cartOk = cartReachesExtract(p, pool), spacedOk = padsSpaced(p, sp.minPadSpacing);
    p.meetsRule = cartOk && spacedOk && countsMatch(sp, countPlan(p, pool));
    if (p.meetsRule) {
      if (avoidableRepeats(p, pool) === 0) return p;
      triesLeft = maxTries * VARIETY_TRY_FACTOR;
      if (!meets || avoidableRepeats(p, pool) < avoidableRepeats(meets, pool)) { meets = p; stale = 0; }
      else if (sp.varietyPatience > 0 && ++stale >= sp.varietyPatience) break;
      continue;
    }
    if (!good || score(p) > score(good)) good = p;
  }
  return meets || good;
}

// ------------------------------------------------------------------ pools per house (RoomLibrary + buildLevel)
function poolFor(theme, special, truckRoom) {
  const T = ROOMS[theme];
  if (!T) throw new Error('unknown theme "' + theme + '"');
  const phong = [].concat(T.shared || [], T.corridor || [], T.deadend || [], T.private || []).sort((a, b) => a.order - b.order);
  const list = phong.map((room) => ({ room, prefab: room.order }));
  const ext = special ? T.special : T.extract;
  for (const room of ext || []) list.push({ room, prefab: 10000 + room.order });
  list.push({ room: truckRoom, prefab: 30000 });
  return moldPool(list);
}

// ------------------------------------------------------------------ painting (G03_World_c.cs:61 paintBlock, 781 carveConnectorZone)
function flipPt(fx, fy, kW, kH, x, y) { return [fx ? kW - 1 - x : x, fy ? kH - 1 - y : y]; }

function paint(plan, pool, theme, houseIndex, seed, spec) {
  // frame cut: shift layout to a 1-tile margin (G03_World_c.cs:297-311). Deliberate difference: no rounding up to whole 21x15
  // modules (that padding only exists for the Unity world texture and the ram cut-scene), so w/h are tight.
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const k of plan.block) { minX = Math.min(minX, k.x); minY = Math.min(minY, k.y); maxX = Math.max(maxX, k.x + k.width); maxY = Math.max(maxY, k.y + k.height); }
  const w = maxX - minX + 2, h = maxY - minY + 2, dx = 1 - minX, dy = 1 - minY;
  for (const k of plan.block) { k.x += dx; k.y += dy; }
  for (const c of plan.door) { c.x += dx; c.y += dy; }
  const grid = new Uint8Array(w * h), block = new Uint8Array(w * h);
  const rooms = [], loot = [], foes = [], traps = [], props = [], lights = [];
  const padMarkers = [];   // per room: [{fx, fy, nut}] in world tiles
  plan.block.forEach((k, id) => {
    const kh = pool[k.mold], r = kh.room;
    const kind = k.role === 'truck' ? 'truck' : r.kind;
    rooms.push({ id, kind, x: k.x, y: k.y, w: k.width, h: k.height, template: r.name, prefab: kh.prefab, flipX: kh.latX, flipY: kh.flipY, role: k.role, size: r.size, order: r.order });
    for (let y = k.y; y < k.y + k.height; y++) for (let x = k.x; x < k.x + k.width; x++) grid[y * w + x] = WALL;   // rim + walls
    const ox = k.x + (kh.addRim ? 1 : 0), oy = k.y + (kh.addRim ? 1 : 0), kW = r.w, kH = r.h, fx = kh.latX, fy = kh.flipY;
    for (let y = 0; y < kH; y++) for (let x = 0; x < kW; x++) {
      const sx = fx ? kW - 1 - x : x, sy = fy ? kH - 1 - y : y;
      const ch = r.rows[sy][sx], gi = (oy + y) * w + ox + x;
      if (ch === '#' || ch === 'd') grid[gi] = WALL;
      else if (ch === ' ') grid[gi] = 0;
      else { grid[gi] = FLOOR; if (ch === 'F') block[gi] = 1; }
    }
    const tr = (cx, cy) => [ox + (fx ? kW - 1 - cx : cx), oy + (fy ? kH - 1 - cy : cy)];
    for (const q of r.loot || []) { const [x, y] = tr(q.x, q.y); loot.push({ x, y, place: q.place, roomId: id }); }
    for (const q of r.foes || []) { const [x, y] = tr(q.x, q.y); foes.push({ x, y, roomId: id }); }
    for (const q of r.traps || []) {
      const [x, y] = tr(q.x, q.y); let dir = q.dir;
      if (fx && dir <= 1) dir = 1 - dir; if (fy && dir >= 2) dir = 5 - dir;
      traps.push({ x, y, kind: q.kind, dir, len: q.len, roomId: id });
    }
    for (const q of r.props || []) {
      const x0 = ox + (fx ? kW - q.x - q.w : q.x), y0 = oy + (fy ? kH - q.y - q.h : q.y);
      props.push({ x: x0, y: y0, w: q.w, h: q.h, name: q.name, blocks: q.blocks, roomId: id });
    }
    for (const q of r.lights || []) lights.push({ x: +(ox + (fx ? kW - q.x : q.x)).toFixed(2), y: +(oy + (fy ? kH - q.y : q.y)).toFixed(2), name: q.name, roomId: id });
    // pad markers (flipPadMarker, G03_World_a.cs:795): the room inner offset is the rim only, flips use width incl. right/bottom rim
    const rimRB = k.width - kW - (kh.addRim ? 1 : 0);
    const mk = (m) => ({ fx: k.x + (fx ? k.width - rimRB - m.fx : (kh.addRim ? 1 : 0) + m.fx), fy: k.y + (fy ? k.height - rimRB - m.fy : (kh.addRim ? 1 : 0) + m.fy) });
    const ds = (r.pads && r.pads.length ? r.pads : r.pad ? [r.pad] : []);
    padMarkers[id] = ds.map((m) => ({ ...mk(m), nut: m.nut ? mk(m.nut) : null }));
    if (kind === 'truck') {
      const t = r.truck ? mk(r.truck) : null;
      rooms[id].car = t ? { x: t.fx, y: t.fy } : { x: k.x + (k.width >> 1) + 0.5, y: k.y + (k.height >> 1) + 0.5 };
    }
  });
  // connector zones: every cell becomes a walkable door cell
  const doors = [];
  for (const c of plan.door) {
    const cw = c.direction === 0 ? c.thickness : c.width, ch = c.direction === 0 ? c.width : c.thickness;
    for (let y = c.y; y < c.y + ch; y++) for (let x = c.x; x < c.x + cw; x++) {
      if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) continue;
      grid[y * w + x] = DOOR; block[y * w + x] = 0;
    }
    const cx = c.direction === 0 ? c.x + (c.thickness >> 1) : c.x + (c.width >> 1);
    const cy = c.direction === 0 ? c.y + (c.width >> 1) : c.y + (c.thickness >> 1);
    doors.push({ x: cx, y: cy, dir: c.direction, jammed: false, a: c.a, b: c.b, x0: c.x, y0: c.y, zw: cw, zh: ch });
  }
  // void cells touching walkable cells become wall (an unpainted core must never leave a hole beside floor)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (grid[y * w + x] !== 0) continue;
    let near = false;
    for (let dy2 = -1; dy2 <= 1 && !near; dy2++) for (let dx2 = -1; dx2 <= 1; dx2++) { const g = grid[(y + dy2) * w + x + dx2]; if (g === FLOOR || g === DOOR) { near = true; break; } }
    if (near) grid[y * w + x] = WALL;
  }
  return { w, h, grid, block, rooms, doors, loot, foes, traps, props, lights, padMarkers };
}

// ------------------------------------------------------------------ walk / cart floods on the final grid
const walkable = (g, i) => g[i] === FLOOR || g[i] === DOOR;
export function floodWalk(house, sx, sy, mask = null) {
  const { w, h, grid, block } = house, seen = new Uint8Array(w * h);
  const ok = (i) => walkable(grid, i) && !block[i] && !(mask && mask[i]);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || !ok(sy * w + sx)) return seen;
  const q = [sy * w + sx]; seen[q[0]] = 1;
  for (let head = 0; head < q.length; head++) {
    const i = q[head], x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && ok(j)) { seen[j] = 1; q.push(j); }
    }
  }
  return seen;
}
export function cartPassable(house, x, y, mask = null) {   // G03_World_a.cs:1551: the whole 3x3 block around the tile is floor
  const { w, h, grid, block } = house;
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
    const i = yy * w + xx;
    if (!walkable(grid, i) || block[i] || (mask && mask[i])) return false;
  }
  return true;
}
export function floodCart(house, sx, sy, mask = null) {
  const { w, h } = house, seen = new Uint8Array(w * h);
  if (!cartPassable(house, sx, sy, mask)) return seen;
  const q = [sy * w + sx]; seen[q[0]] = 1;
  for (let head = 0; head < q.length; head++) {
    const i = q[head], x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && cartPassable(house, nx, ny, mask)) { seen[j] = 1; q.push(j); }
    }
  }
  return seen;
}

// ------------------------------------------------------------------ pads (G03_World_a.cs:785-860, new layout branch)
// The truck marker usually sits under the truck prop; floods start at the nearest cart-passable cell in the truck room instead.
function snapStart(house) {
  const r = house.rooms[0], car = house.rooms[0].car;
  for (const cart of [true, false]) {
    let best = null, bd = Infinity;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const ok = cart ? cartPassable(house, x, y) : (walkable(house.grid, y * house.w + x) && !house.block[y * house.w + x]);
      if (!ok) continue;
      const d = (x + 0.5 - car.x) ** 2 + (y + 0.5 - car.y) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) return best;
  }
  return { x: Math.floor(car.x), y: Math.floor(car.y) };
}

function placePads(house, plan, pool, seed) {
  const rndExtract = mulberry32((seed | 0) ^ 0x3e7a8c21);
  const { w, h } = house, st = house.start;
  const reach = floodWalk(house, st.x, st.y, null);
  const chosen = house.padMarkers.map((ds) => ds.length === 0 ? null : ds.length === 1 ? ds[0] : ds[Math.floor(rndExtract() * ds.length)]);
  const roomPoint = (id) => {
    const r = house.rooms[id];
    for (const rong of [true, false]) {
      const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && reach[y * w + x] && (!rong || cartPassable(house, x, y));
      const m = chosen[id];
      if (m && ok(Math.floor(m.fx), Math.floor(m.fy))) return { x: Math.floor(m.fx), y: Math.floor(m.fy), fx: m.fx, fy: m.fy, nut: m.nut, marker: true };
      const rgx = r.x + (r.w >> 1), rgy = r.y + (r.h >> 1);
      let tx = -1, ty = -1, far = Infinity;
      for (let y = Math.max(0, r.y); y < r.y + r.h && y < h; y++) for (let x = Math.max(0, r.x); x < r.x + r.w && x < w; x++) {
        if (!ok(x, y)) continue;
        const d2 = (x - rgx) * (x - rgx) + (y - rgy) * (y - rgy);
        if (d2 < far) { far = d2; tx = x; ty = y; }
      }
      if (tx >= 0) return { x: tx, y: ty, fx: tx + 0.5, fy: ty + 0.5, nut: null, marker: false };
    }
    return null;
  };
  const out = [];
  const ids = plan.trucks.map((t) => t.block).concat(plan.extract);
  for (const id of ids) {
    const pt = roomPoint(id);
    if (pt) out.push({ x: pt.x, y: pt.y, fx: pt.fx, fy: pt.fy, roomId: id, order: out.length, button: pt.nut ? { x: pt.nut.fx, y: pt.nut.fy } : null });
  }
  return { pads: out, reach };
}

// ------------------------------------------------------------------ jammed doors (G02_Doors.cs:287, sealRoomsOk = true)
function lockDoors(house, seed, level) {
  const doors = house.doors;
  if (doors.length === 0 || level < DOOR_LOCK_LEVEL) return;
  const { w, h } = house, cx = house.start.x, cy = house.start.y;
  const base = floodWalk(house, cx, cy, null);
  let baseTiles = 0; for (const b of base) if (b) baseTiles++;
  const baseCart = floodCart(house, cx, cy, null);
  const targets = [[cx, cy]].concat(house.pads.map((p) => [Math.min(Math.max(p.x, 0), w - 1), Math.min(Math.max(p.y, 0), h - 1)]));
  const rnd = mulberry32((seed | 0) ^ 0x5bf03635);
  const budget = Math.max(1, Math.round(doors.length * DOOR_LOCK_FRAC));
  const order = doors.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.trunc(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const mask = new Uint8Array(w * h);
  const doorTiles = (d) => d.dir === 0 ? [[d.x, d.y - 1], [d.x, d.y], [d.x, d.y + 1]] : [[d.x - 1, d.y], [d.x, d.y], [d.x + 1, d.y]];
  const remask = () => { mask.fill(0); for (const d of doors) if (d.jammed) for (const [x, y] of doorTiles(d)) if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1; };
  let locked = 0;
  for (const i of order) {
    if (locked >= budget) break;
    const d = doors[i]; d.jammed = true; remask();
    const now = floodWalk(house, cx, cy, mask);
    let ok = true, sealed = 0;
    for (let k = 0; k < base.length; k++) if (base[k] && !mask[k] && !now[k]) sealed++;
    if (sealed > DOOR_SEAL_MAX * baseTiles) ok = false;
    if (ok) for (const p of house.pads) {
      if (!p.button) continue;
      const bx = Math.min(Math.max(Math.floor(p.button.x), 0), w - 1), by = Math.min(Math.max(Math.floor(p.button.y), 0), h - 1), k = by * w + bx;
      if (base[k] && (mask[k] || !now[k])) { ok = false; break; }
    }
    if (ok) {
      const nowCart = floodCart(house, cx, cy, mask);
      for (const [tx, ty] of targets) { const k = ty * w + tx; if (baseCart[k] && !nowCart[k]) { ok = false; break; } }
    }
    if (ok) locked++; else d.jammed = false;
  }
}

// ------------------------------------------------------------------ public API
export function houseSpec(theme, houseIndex) {
  const s = HOUSE_SPECS[theme] && HOUSE_SPECS[theme][houseIndex];
  if (!s) throw new Error('no house spec for ' + theme + ' house ' + houseIndex);
  return s;
}

/** Builds one house. Throws (like buildLevel, G03_World_a.cs:371) when no layout meets the counts in 8 seeds x truck rooms. */
export function generateHouse({ theme, houseIndex, seed }) {
  const hs = houseSpec(theme, houseIndex);
  const T = ROOMS[theme];
  const trucks0 = T.truck || [];
  if (!trucks0.length) throw new Error('theme ' + theme + ' has no truck room');
  // PickTruckRoom (G03_World_a.cs:127): own stream from the house seed
  const pick = Math.floor(mulberry32((seed | 0) ^ 0x6d3b90c7)() * trucks0.length);
  const trucks = [trucks0[pick]].concat(trucks0.filter((_, i) => i !== pick));
  let plan = null, pool = null, used = null, lastWhy = '';
  for (let k = 0; k < HOUSE_SEED_TRIES && !plan; k++) {
    for (const truck of trucks) {
      const sp = {
        widthCells: MAX_MODULES_WIDE * RW - 2, heightCells: MAX_VERTICAL * RH - 2,
        extractRooms: hs.extractRooms, privateRooms: hs.privateRooms, sharedRooms: hs.sharedRooms,
        shortCorridors: hs.shortCorridors, longCorridors: hs.longCorridors,
        mediumRatio: hs.mediumRatio, largeRatio: hs.largeRatio, sizeByStock: false, varietyPatience: 0,
        minPadSpacing: MIN_PAD_SPACING,
      };
      const pl = poolFor(theme, hs.specialExtract, truck);
      const s2 = (seed + k) | 0;
      const p = build(sp, mulberry32(s2 ^ 0x4e6f6931), mulberry32(s2 ^ 0x6b1d2c93), pl);
      if (p && p.block.length && p.meetsRule) { plan = p; pool = pl; used = truck; break; }
      lastWhy = p ? 'counts/cart/spacing not met' : 'no plan';
    }
  }
  if (!plan) throw new Error('house ' + houseIndex + ' (' + theme + ') seed ' + seed + ': no layout meets the configured counts (' + lastWhy + ')');
  const house = paint(plan, pool, theme, houseIndex, seed, hs);
  house.start = snapStart(house);
  const { pads: pp, reach } = placePads(house, plan, pool, seed);
  house.pads = pp;
  const truckRoom = house.rooms[0];
  house.truck = { x: truckRoom.x, y: truckRoom.y, w: truckRoom.w, h: truckRoom.h, roomId: 0, ram: ['top', 'bottom', 'left', 'right'][plan.trucks[0].ramSide], car: truckRoom.car, template: used.name };
  // loot is dropped in the truck room and in pad rooms; unreachable (walking) spots are dropped (G03_World_a.cs:936)
  const banned = new Set([0]); for (const p of house.pads) banned.add(p.roomId);
  const nLoot0 = house.loot.length;
  house.loot = house.loot.filter((s) => !banned.has(s.roomId) && (s.place === 'table' || reach[s.y * house.w + s.x]));
  house.droppedLoot = nLoot0 - house.loot.length;
  house.foes = house.foes.filter((s) => reach[s.y * house.w + s.x]);
  house.padRooms = [...banned];
  lockDoors(house, seed, THEME_HOUSE_LEVEL[houseIndex - 1]);
  house.meta = { theme, houseIndex, seed, cartRoutes: cartReachesExtract(plan, pool), padsSpaced: padsSpaced(plan, MIN_PAD_SPACING), attempt: plan.attempt, downsize: plan.downsizeCount, backtrack: plan.backtrackCount, forcedRepeats: plan.forcedRepeats, truckTemplate: used.name };
  delete house.padMarkers;
  return house;
}

/** Plain-text map for debugging: roomId letters are not used, grid only. # wall, . floor, + connector zone, F blocking prop, J jammed door, T truck car, P pad. */
export function asciiMap(house) {
  const { w, h, grid, block } = house, rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) { const g = grid[y * w + x]; s += g === 0 ? ' ' : g === WALL ? '#' : g === DOOR ? '+' : block[y * w + x] ? 'F' : '.'; }
    rows.push(s.split(''));
  }
  for (const d of house.doors) if (d.jammed) for (const [x, y] of (d.dir === 0 ? [[d.x, d.y - 1], [d.x, d.y], [d.x, d.y + 1]] : [[d.x - 1, d.y], [d.x, d.y], [d.x + 1, d.y]])) rows[y][x] = 'J';
  const car = house.start; rows[car.y][car.x] = 'T';
  for (const p of house.pads) rows[p.y][p.x] = String(p.order);
  return rows.map((r) => r.join('')).join('\n');
}
