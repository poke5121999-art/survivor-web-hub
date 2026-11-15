// The voxel town: every building, the perimeter wall and its gates, vehicles, crates, lamp posts and the other static props
// of Blockade Z's map are handed over by world.js as a list of boxes and rebuilt as voxels inside our voxel-lab engine
// (games/voxel-lab: carve, explode, connectivity islands, level-1 stress, rigid pieces, debris cubes, rubble).
// 0.1 m voxels (0.2 m on the low tier: the lab world is drawn at twice the scale).
// - Regions: boxes that touch form a region (a building with what stands in and on it, one wall segment, one car...). Each
//   region is its own small lab world. A region that nobody damaged is one static merged mesh and never simulates; a hit
//   wakes it: the chunks that change leave the merged mesh and become live chunk meshes, and the region ticks until it is
//   at rest again.
// - A piece that falls and lands hard is cut into chunks along ragged planes (shatter); small bits become rubble.
// - Collision and zombie pathing follow the voxels: 0.2 m columns become boxes for world.js (throttled, per region) and the
//   walk grids are rebuilt; shots use an exact voxel ray.
// - Co-op: the host owns the town. Every change is a command [kind, x, y, z, r, power, step, region, fx]; guests replay
//   each region's commands at the same sim step of that region, so the same commands give the same world (see digest()).
//   No voxel data is sent. The host's voxel tier is the room's tier: a guest on another tier rebuilds the town on it.
// voxel-lab is our clean-room build; techniques studied from Voxel Engine by mattshumer (spawn.co).
import { meshChunk } from '../../../voxel-lab/lib/mesher.js';
import * as MT from '../../../voxel-lab/lib/materials.js';
import { World, GY, WX, WZ } from '../../../voxel-lab/lib/sim/world.js';
import { VoxelGrid } from '../../../voxel-lab/lib/grid.js';
import { Canvas } from '../../../voxel-lab/lib/build/kit.js';
import { hash3 } from '../../../voxel-lab/lib/hash.js';
import { plan, half } from './buildings.js';

const BZ = window.BZ; const THREE = window.THREE; const V = BZ.vox; const M = MT.M;

// Blockade Z texture key -> lab material it behaves like (strength, rubble kind, sound). Each key gets its own material id
// (100+) so it keeps its own colour and pixel tile.
const BASE = { brick: 'brick', plank: 'plank', crate: 'wood', crate_metal: 'paint_yellow', concrete: 'concrete', concrete_dark: 'rc', metal_dark: 'rust', metal: 'sheet_zinc',
  corrugated: 'sheet_zinc', hazard: 'concrete', sandbag: 'gravel', stone: 'stone', gold: 'paint_yellow', plaster_white: 'brick', plaster_yellow: 'brick', plaster_teal: 'brick', plaster_pink: 'brick',
  roof_red: 'rooftile', shutter: 'sheet_zinc', car_red: 'paint_red', car_yellow: 'paint_red', car_blue: 'paint_red', burnt: 'paint_white', tank: 'rust', track: 'rust', heli: 'paint_white',
  glass: 'paint_white', tire: 'rubber', lamp: 'lamp', rubble: 'gravel', glass_lit_pane: 'lamp' };
// how hard each one is to blow away (lab toughness; a grenade wrecks a car and dents a tank, it does not erase them)
const TOUGH = { car_red: 9000, car_yellow: 9000, car_blue: 9000, heli: 9000, burnt: 7000, glass: 2500, tank: 30000, track: 30000, crate_metal: 6000 };
const TAG = { stone: 'stone', plaster: 'stone', wood: 'wood', metal: 'metal', glass: 'glass', soft: 'wood', leaf: 'wood' };
const SURF = { stone: 'stone', plaster: 'plaster', wood: 'wood', metal: 'metal', glass: 'glass', soft: 'wood', leaf: 'wood' };
const matIds = new Map(); let nextId = 100;
const lin = new Float32Array(256 * 3); const fresh = new Float32Array(256 * 3); const hexOf = new Uint32Array(256); const TILE = new Int8Array(256).fill(-1); const tiles = []; const PATOF = new Uint8Array(256);
const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
let tablesReady = false;
function tables() {
  if (tablesReady) return; tablesReady = true;
  for (let i = 0; i < MT.N_MAT; i++) { for (let k = 0; k < 3; k++) { lin[i * 3 + k] = s2l(MT.colors[i * 3 + k]); fresh[i * 3 + k] = s2l(MT.palette[(512 + i) * 4 + k]); } hexOf[i] = (MT.colors[i * 3] << 16) | (MT.colors[i * 3 + 1] << 8) | MT.colors[i * 3 + 2]; PATOF[i] = MT.palette[(256 + i) * 4 + 2]; }
}
function matId(key) {
  if (key === 'glass_pane') return M.glass;
  let id = matIds.get(key); if (id) return id;
  const b = M[BASE[key] || 'concrete']; id = nextId++; if (id > 250) return b; matIds.set(key, id);
  for (const a of [MT.density, MT.fc, MT.ft, MT.fv, MT.toughness, MT.friction, MT.restitution, MT.flags, MT.rubbleOf, MT.burnsTo, MT.burnChance, MT.burnTime, MT.voxMass, MT.p0, MT.isTransparent]) a[id] = a[b];
  if (TOUGH[key]) { MT.toughness[id] = TOUGH[key]; MT.p0[id] = Math.max(0, 0.264 + 0.16 * Math.log(TOUGH[key] / 2200)); }
  MT.audioClass[id] = /^plaster/.test(key) ? 'plaster' : MT.audioClass[b]; if (/^plaster/.test(key)) MT.rubbleOf[id] = M.rubble_pale;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) MT.palette[(r * 256 + id) * 4 + k] = MT.palette[(r * 256 + b) * 4 + k];
  let hex = hexOf[b]; const emis = MT.flags[b] & MT.F.EMISSIVE;
  if (!emis) { try { hex = V.texAvg(key); } catch (e) { /* keep the lab colour */ } } else if (key === 'glass_lit_pane') hex = 0xffc878;
  hexOf[id] = hex; PATOF[id] = MT.palette[(256 + b) * 4 + 2];
  const metal = MT.flags[b] & MT.F.METAL;
  for (let k = 0; k < 3; k++) { const c = (hex >> (16 - k * 8)) & 255; MT.colors[id * 3 + k] = c; lin[id * 3 + k] = s2l(c); fresh[id * 3 + k] = metal || /^(car_|burnt|heli|tire|sandbag|rubble|glass$)/.test(key) ? s2l(Math.min(255, c * 0.72 + 26)) : fresh[b * 3 + k]; }
  if (!emis) { try { const im = BZ.tex(key).image; if (im.width === 16 && im.height === 16 && tiles.length < 100) { TILE[id] = tiles.length; tiles.push(im.getContext('2d').getImageData(0, 0, 16, 16).data); } } catch (e) { /* flat colour */ } }
  return id;
}

// ---- one region's lab world: a grid just large enough for it, a faster layer scan, and pieces that shatter when they land ----
let DIM = [64, 64, 64]; const SH = { list: new Int32Array(1 << 18), stack: new Int32Array(1 << 18) }; const EMPTY = new Float32Array(0);
const mkD = (C) => ({ n: 0, px: new Float32Array(C), py: new Float32Array(C), pz: new Float32Array(C), vx: new Float32Array(C), vy: new Float32Array(C), vz: new Float32Array(C), q: new Float32Array(C * 4), w: new Float32Array(C * 3), size: new Float32Array(C), mat: new Uint8Array(C), nv: new Uint8Array(C), rest: new Uint8Array(C), life: new Float32Array(C) });
class RWorld extends World {
  reset() {
    const g = this.grid = new VoxelGrid(DIM[0], DIM[1], DIM[2]); const L = g.cx * g.cz;
    for (let id = 0; id < L; id++) { const c = g.chunks[id] = new Uint8Array(32768); const p = g.pris[id] = new Uint8Array(4096); c.fill(M.bedrock, 0, GY * 1024); p.fill(255, 0, GY * 128); g.count[id] = GY * 1024; g.solid += GY * 1024; }
    this.stamps = new Array(g.nChunks).fill(null); this.epoch = 1; this.runStart = 1; this.epochGrounded = new Uint8Array(65536);
    this.structures = []; this.structAt = new Uint8Array((WX >> 4) * (WZ >> 4)).fill(1); // one structure per region: every cell is it
    g.onSet = (x, y, z) => { const st = this.structures[0]; if (st && y >= st.y0 && y < st.y1) { st.dirty[y - st.y0] = 1; st.anyDirty = true; } if (this.touch) this.touch(x, y, z); };
    this.nSeeds = 0; this.d.n = 0; this.nSp = 0; this.step = 0; this.time = 0; this.bodies.clear();
    this.fire = new Map(); this.fireList = []; this.fireStats = { burning: 0, charred: 0, consumed: 0, lit: 0, explosives: 0 };
    this.fuses = []; this.projectiles = [];
    this.led = { built: g.solid, debris: 0, destroyed: 0, burnt: 0, offMap: 0, rubbleLaid: 0, baked: 0 };
    this.stats = { fractures: 0, detached: 0, maxRatio: 0, solving: 0, scanned: 0 };
    this.rubAgg = { n: 0, x: 0, y: 0, z: 0, mat: 0 }; this.spin = null; this.owed = 0;
  }
  scanLayer(st, l) { // same sums as the lab's, but whole empty chunks are skipped (buildings are mostly air)
    const g = this.grid; const y = st.y0 + l; const cy = y >> 5; const o = 1024 * (y & 31);
    let mass = 0; let cap = 0; let mx = 0; let mz = 0; let sx = 0; let sz = 0; let bx0 = 32767; let bx1 = -1; let bz0 = 32767; let bz1 = -1;
    for (let cz = st.z0 >> 5; cz <= (st.z1 - 1) >> 5; cz++) for (let cx = st.x0 >> 5; cx <= (st.x1 - 1) >> 5; cx++) {
      const id = cx + g.cx * (cz + g.cz * cy); const c = g.chunks[id]; if (!c || !g.count[id]) continue; const bx = cx << 5; const bz = cz << 5;
      for (let i = 0; i < 1024; i++) {
        const m = c[o + i]; if (!m) continue; const x = bx + (i & 31); const z = bz + (i >> 5); if (x < st.x0 || x >= st.x1 || z < st.z0 || z >= st.z1) continue;
        const w = MT.voxMass[m]; mass += w; mx += w * x; mz += w * z; if (MT.flags[m] & MT.F.GLASS) continue;
        const f = MT.fc[m]; cap += f; sx += f * x; sz += f * z; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
      }
    }
    st.mass[l] = mass; st.cap[l] = cap; st.mx[l] = mx; st.mz[l] = mz; st.sx[l] = sx; st.sz[l] = sz; st.bx0[l] = bx0; st.bx1[l] = bx1; st.bz0[l] = bz0; st.bz1[l] = bz1; st.dirty[l] = 0;
  }
  // a piece that lands hard is cut along ragged planes into chunks; a plane only cuts where the material runs across it
  // (a wall is never sliced through its thickness). Bits under 12 voxels and the cut itself become rubble and cubes.
  shatter(b) {
    const g = b.grid; const N = (b.gen ? this.cell >> 1 : this.cell) || 9; const rem = []; const px = b.pat[0]; const py = b.pat[1]; const pz = b.pat[2];
    g.forEach((x, y, z) => {
      const X = x + px; const Y = y + py; const Z = z + pz;
      if ((X + hash3(Y >> 2, Z >> 2, 1, 11) % 3) % N === 0 && g.get(x - 1, y, z) && g.get(x - 2, y, z) && g.get(x + 1, y, z) && g.get(x + 2, y, z)) rem.push(x, y, z);
      else if ((Y + hash3(X >> 2, Z >> 2, 2, 12) % 3) % N === 0 && g.get(x, y - 1, z) && g.get(x, y - 2, z) && g.get(x, y + 1, z) && g.get(x, y + 2, z)) rem.push(x, y, z);
      else if ((Z + hash3(X >> 2, Y >> 2, 3, 13) % 3) % N === 0 && g.get(x, y, z - 1) && g.get(x, y, z - 2) && g.get(x, y, z + 1) && g.get(x, y, z + 2)) rem.push(x, y, z);
    });
    b.gen = (b.gen || 0) + 1; b.cd = 8; if (!rem.length) return;
    this.matCount.fill(0); let n = 0; const bx = b.x; const by = b.y; const bz = b.z; const mat = b.mat;
    for (let i = 0; i < rem.length; i += 3) n += this.bodies.spillFrom(b, rem[i], rem[i + 1], rem[i + 2], n);
    this.stats.fractures += n; this.ev('fracture', bx, by, bz, n, mat, 1);
    if (!this.bodies.split(b)) { if (!b.massProps(false)) this.bodies.remove(b); else b.samplePoints(this.step); }
  }
  depositRubble(x, y, z, m, n) { const g = this.grid; if (x < 8 || z < 8 || x >= g.sx - 8 || z >= g.sz - 8) { this.led.offMap += n; return; } super.depositRubble(x, y, z, m, n); } // (the lab's bounds are its own world's; this grid is smaller)
  tick() {
    const L = this.bodies.list; for (let i = 0; i < L.length; i++) { const b = L[i]; b.sp0 = Math.hypot(b.v[0], b.v[1], b.v[2]); }
    super.tick();
    for (let i = L.length - 1; i >= 0; i--) { const b = L[i]; if (!b || b.dead || !b.touch || !(b.sp0 > 2.4) || b.voxels < 60 || (b.gen || 0) >= 2 || b.cd > 0 || b.rope) continue; this.shatter(b); }
    const D = this.d; const floor = GY * 0.1 - 0.6; for (let i = D.n - 1; i >= 0; i--) if (D.py[i] < floor) { this.led.offMap += D.nv[i]; this.killDebris(i); } // (fell off the edge of this region's ground)
  }
}

V.register('street', (G) => {
  const cap = V.capture; if (!cap || !cap.length) return null;
  tables();
  const X = G.vox; const W = G.world; const scene = G.scene; const P = BZ.params || {};
  const shadow = G.quality.shadow > 0; const FN = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  const faceKeys = (b) => (typeof b.mats === 'string' ? [b.mats] : Object.values(b.mats));
  const isDecor = (b) => faceKeys(b).some((k) => /^(sign_|stained)/.test(String(k)));
  const sideKey = (m) => (typeof m === 'string' ? m : m.side || m.all || m.pz || m.px || m.top);
  // the town's own buildings and street furniture (js/vox/buildings.js); their painted signs ride along as decor boxes
  const PLAN = plan();
  for (const sg of PLAN.signs) { const mats = { px: 'metal_dark', nx: 'metal_dark', pz: 'metal_dark', nz: 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' }; mats[sg.face] = sg.key; cap.push({ min: sg.min, max: sg.max, mats, opt: { uv: 'fit', vary: 0, flat: true }, m: null, grp: null }); }
  // register every material up front so the tile atlas is complete before the first mesh
  for (const b of cap) if (!isDecor(b)) for (const k of faceKeys(b)) matId(k);
  const NT = Math.max(1, tiles.length); const atlasData = new Uint8Array(NT * 16 * 16 * 4);
  tiles.forEach((d, t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const o = ((15 - y) * NT * 16 + t * 16 + x) * 4; const i = (y * 16 + x) * 4; atlasData[o] = d[i]; atlasData[o + 1] = d[i + 1]; atlasData[o + 2] = d[i + 2]; atlasData[o + 3] = 255; } });
  const atlas = new THREE.DataTexture(atlasData, NT * 16, 16, THREE.RGBAFormat); atlas.colorSpace = THREE.SRGBColorSpace; atlas.magFilter = atlas.minFilter = THREE.NearestFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true;

  // ---- boxes -> clusters (world axis-aligned bounds of every box; rotated ones keep their matrix) ----
  const v3 = new THREE.Vector3();
  for (const b of cap) {
    if (b.bb) continue;
    if (!b.m) { b.bb = [b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]]; continue; }
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = 0; i < 8; i++) { v3.set(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]).applyMatrix4(b.m); bb[0] = Math.min(bb[0], v3.x); bb[1] = Math.min(bb[1], v3.y); bb[2] = Math.min(bb[2], v3.z); bb[3] = Math.max(bb[3], v3.x); bb[4] = Math.max(bb[4], v3.y); bb[5] = Math.max(bb[5], v3.z); }
    b.bb = bb; b.inv = b.m.clone().invert();
  }
  const over = (a, b, g) => a[0] < b[3] + g && a[3] > b[0] - g && a[1] < b[4] + g && a[4] > b[1] - g && a[2] < b[5] + g && a[5] > b[2] - g;
  const grow = (a, b) => { for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], b[k]); a[k + 3] = Math.max(a[k + 3], b[k + 3]); } };
  function clusters() {
    const solidBoxes = cap.filter((b) => !isDecor(b)); const out = []; const walls = new Map();
    for (const b of solidBoxes) if (b.grp && /^w\d/.test(b.grp)) { let c = walls.get(b.grp); if (!c) { c = { name: 'wall' + b.grp.slice(1), boxes: [], bb: b.bb.slice(), wall: true }; walls.set(b.grp, c); out.push(c); } c.boxes.push(b); grow(c.bb, b.bb); }
    for (const b of solidBoxes) if (b.grp === 'wtop') { let best = null; let bd = 1e9; const cx = (b.bb[0] + b.bb[3]) / 2; const cz = (b.bb[2] + b.bb[5]) / 2; for (const c of out) { if (!c.wall) continue; const d = Math.hypot(Math.max(c.bb[0] - cx, 0, cx - c.bb[3]), Math.max(c.bb[2] - cz, 0, cz - c.bb[5])); if (d < bd) { bd = d; best = c; } } if (best) best.boxes.push(b); }
    const rest = solidBoxes.filter((b) => !b.grp); const par = rest.map((_, i) => i); const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) if (over(rest[i].bb, rest[j].bb, 0.12)) par[find(i)] = find(j);
    const comp = new Map(); rest.forEach((b, i) => { const r = find(i); let c = comp.get(r); if (!c) comp.set(r, c = { boxes: [], bb: b.bb.slice() }); c.boxes.push(b); grow(c.bb, b.bb); });
    let list = [...comp.values()]; let merged = true;
    while (merged) { merged = false; outer: for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i].bb; const b = list[j].bb; const inA = (p, q) => { const cx = (p[0] + p[3]) / 2; const cz = (p[2] + p[5]) / 2; return cx > q[0] && cx < q[3] && cz > q[2] && cz < q[5]; };
      if (inA(b, a) || inA(a, b)) { list[i].boxes.push(...list[j].boxes); grow(a, b); list.splice(j, 1); merged = true; break outer; } } } // (what stands inside a building belongs to it)
    list.sort((a, b) => a.bb[0] - b.bb[0] || a.bb[2] - b.bb[2]);
    for (const c of list) { for (const b of c.boxes) grow(c.bb, b.bb); out.push(c); }
    for (const c of out) { c.bb = c.boxes[0].bb.slice(); for (const b of c.boxes) grow(c.bb, b.bb); }
    return out;
  }
  const NAMES = [['apartment', -23, -26], ['shophouses', -24, -9.5], ['guardpost', 21, -27], ['gas', 21, -10.7], ['kiosk', 31.5, -11], ['church', -24.5, 18], ['warehouse', 21, 21]];

  // ---- state of the town (rebuilt as a whole when the tier changes) ----
  let S = X.low ? 0.2 : 0.1; let K = 0.1 / S; let regions = []; let built = 0; let useAo = false;
  const stat = { solids: 0, rebuilds: 0, rebuildMs: 0, cmds: 0, desync: 0, digestOk: 0, digestBad: 0, ticks: 0, chips: 0, shatters: 0, retier: 0, buildMs: 0 };
  const bodyRoot = new THREE.Group(); bodyRoot.name = 'vox-town-bodies'; scene.add(bodyRoot);
  const townRoot = new THREE.Group(); townRoot.name = 'vox-town'; scene.add(townRoot);
  const matGlass = new THREE.MeshLambertMaterial({ color: 0xbfe0f4, transparent: true, opacity: 0.42, depthWrite: false });

  // lamps and lit windows glow by night and are dimmed by day, like the box town's
  const glowU = { value: 0.9 }; const setNight0 = W.setNight; W.setNight = (k) => { setNight0(k); glowU.value = 0.12 + 0.78 * k; };
  function makeMat(R, ao) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const U = { uAo: { value: R.aoTex }, uAoMin: { value: new THREE.Vector3(0, GY - 2, 0) }, uAoSize: { value: new THREE.Vector3(R.ax * 2, R.ay * 2, R.az * 2) }, uAoK: { value: ao && useAo ? 1 : 0 }, uAtlas: { value: atlas }, uGlow: glowU, uNT: { value: NT }, uS: { value: S }, uOrg: { value: ao ? new THREE.Vector3(R.gx0, -GY * S, R.gz0) : new THREE.Vector3() } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aQ; attribute vec3 aI; varying vec3 vVoxP; varying vec3 vVoxN; varying vec4 vQ; varying vec3 vI;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxP = position; vVoxN = normal; vQ = aQ; vI = aI;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        precision highp sampler3D; uniform sampler3D uAo; uniform vec3 uAoMin; uniform vec3 uAoSize; uniform float uAoK; uniform sampler2D uAtlas; uniform float uNT; uniform float uS; uniform vec3 uOrg; uniform float uGlow;
        varying vec3 vVoxP; varying vec3 vVoxN; varying vec4 vQ; varying vec3 vI;
        float vhash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(vVoxN); vec3 cell = floor(vVoxP - vVoxN * 0.5);
          float fw = fwidth(vVoxP.x) + fwidth(vVoxP.y) + fwidth(vVoxP.z); float near = clamp(1.0 - fw * 1.4, 0.0, 1.0);
          float pat = floor(vI.x + 0.5); float edges = floor(vI.y + 0.5);
          float along = an.x > 0.5 ? cell.z : cell.x; float k = 1.0;
          float jit = 0.1; float tile = floor(vI.z + 0.5);
          if (tile >= 0.0) {                             // the game's texel under this voxel (1 tile per metre, like the box town)
            vec3 wp = (cell + 0.5) * uS + uOrg; vec2 tuv = an.x > 0.5 ? wp.zy : an.y > 0.5 ? wp.xz : wp.xy;
            diffuseColor.rgb *= texture2D(uAtlas, vec2((tile + fract(tuv.x)) / uNT, fract(tuv.y))).rgb; jit = 0.07; pat = 0.0;
          }
          if (pat == 1.0) {
            float off = mod(cell.y, 2.0) * 1.5; float b = floor((along + off) / 3.0);
            k *= 0.92 + 0.16 * vhash(vec3(b, cell.y, 3.0));
            if (an.y < 0.5) { float fy = fract(vVoxP.y); float fa = fract((along + off + fract(an.x > 0.5 ? vVoxP.z : vVoxP.x)) / 3.0); if (fy < 0.14 || fa < 0.05) k = mix(k, 1.25, near); }
          } else if (pat == 2.0 || pat == 5.0) {
            float bd = an.y > 0.5 ? cell.x : cell.y; k *= 0.93 + 0.14 * vhash(vec3(floor(bd / 2.0), 7.0, 1.0));
            float fs = fract((an.y > 0.5 ? vVoxP.x : vVoxP.y) / 2.0); if (fs < 0.06) k *= mix(1.0, 0.72, near);
          } else if (pat == 3.0) {
            float fr = fract((an.y > 0.5 ? vVoxP.z : vVoxP.y) / 2.0); k *= 1.12 - 0.3 * fr; k *= 0.94 + 0.12 * vhash(vec3(floor(cell.x / 2.0), floor((an.y > 0.5 ? cell.z : cell.y) / 2.0), 5.0));
          } else if (pat == 13.0 || pat == 10.0) {
            float rr = an.y > 0.5 ? vVoxP.x : (an.x > 0.5 ? vVoxP.z : vVoxP.x); k *= 0.9 + 0.2 * abs(fract(rr * 0.5) - 0.5) * 2.0; jit = 0.04;
          } else if (pat == 9.0) {
            float px = fract((along + fract(an.x > 0.5 ? vVoxP.z : vVoxP.x)) / 12.0); float py = fract(vVoxP.y / 8.0); if (an.y < 0.5 && (px < 0.012 || py < 0.018)) k *= mix(1.0, 0.82, near); jit = 0.07;
          } else if (pat == 11.0) { jit = 0.34; }
          k *= 1.0 + (vhash(cell) - 0.5) * jit * near;
          vec2 f = an.x > 0.5 ? fract(vVoxP.zy) : an.y > 0.5 ? fract(vVoxP.xz) : fract(vVoxP.xy);
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)); k *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.08 + fw * 0.5, e)) * near;
          float eb = 9.0; float bits = edges;
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.x); bits = floor(bits / 2.0);
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.z - vQ.x); bits = floor(bits / 2.0);
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.y); bits = floor(bits / 2.0);
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.w - vQ.y);
          k *= 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.16 + fw, eb)) * (an.y > 0.5 ? 1.0 : 0.55);
          if (uAoK > 0.5) {
            vec3 q1 = (vVoxP + vVoxN * 1.7 - uAoMin) / uAoSize; vec3 q2 = (vVoxP + vVoxN * 4.2 + vec3(0.0, 1.0, 0.0) - uAoMin) / uAoSize;
            float d = texture(uAo, q1).r * 0.8 + texture(uAo, q2).r * 0.5; k *= 1.0 - min(0.62, d * 0.85);
          }
          diffuseColor.rgb *= k;
        }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (floor(vI.x + 0.5) == 100.0) totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
    };
    m.customProgramCacheKey = () => 'bzvoxtown2';
    return m;
  }
  // quads of several chunk buffers -> one geometry (25 bytes a vertex); returns where each buffer's quads start
  function pack(bufs, glass) {
    let n = 0; const starts = [];
    for (const buf of bufs) { let c = 0; for (let q = 0; q < buf.n; q++) if (buf.info[q * 16 + 1] !== M.bedrock) c++; starts.push([n, c]); n += c; }
    if (!n) return null;
    const Pp = new Float32Array(n * 12); const Nn = new Int8Array(n * 12); const C = glass ? null : new Uint8Array(n * 12); const Q = glass ? null : new Uint8Array(n * 16); const I2 = glass ? null : new Int8Array(n * 12);
    const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6); let o = 0;
    for (const buf of bufs) for (let q = 0; q < buf.n; q++) {
      const io = q * 16; const m = buf.info[io + 1]; if (m === M.bedrock) continue; const face = buf.info[io]; const fl = buf.info[io + 2]; const ed = buf.info[io + 3];
      const tile = fl & 3 ? -1 : TILE[m]; const src = fl & 1 ? fresh : lin; const fn = FN[face]; const pat = MT.flags[m] & MT.F.EMISSIVE ? 100 : fl & 1 ? 0 : PATOF[m];
      const cr = tile >= 0 ? 255 : Math.round(src[m * 3] * 255); const cg = tile >= 0 ? 255 : Math.round(src[m * 3 + 1] * 255); const cb = tile >= 0 ? 255 : Math.round(src[m * 3 + 2] * 255);
      for (let v = 0; v < 4; v++) {
        const d = (o * 4 + v) * 3; const s = (q * 4 + v) * 3;
        Pp[d] = buf.pos[s]; Pp[d + 1] = buf.pos[s + 1]; Pp[d + 2] = buf.pos[s + 2]; Nn[d] = fn[0] * 127; Nn[d + 1] = fn[1] * 127; Nn[d + 2] = fn[2] * 127;
        if (!glass) { C[d] = cr; C[d + 1] = cg; C[d + 2] = cb; const qo = (o * 4 + v) * 4; const qs = (q * 4 + v) * 4; Q[qo] = buf.quad[qs]; Q[qo + 1] = buf.quad[qs + 1]; Q[qo + 2] = buf.quad[qs + 2]; Q[qo + 3] = buf.quad[qs + 3]; I2[d] = pat; I2[d + 1] = ed; I2[d + 2] = tile; }
      }
      const b = o * 4; const e = o * 6; idx[e] = b; idx[e + 1] = b + 1; idx[e + 2] = b + 2; idx[e + 3] = b; idx[e + 4] = b + 2; idx[e + 5] = b + 3; o++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3, true));
    if (!glass) { g.setAttribute('color', new THREE.BufferAttribute(C, 3, true)); g.setAttribute('aQ', new THREE.BufferAttribute(Q, 4)); g.setAttribute('aI', new THREE.BufferAttribute(I2, 3)); }
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.userData.quads = n; g.userData.starts = starts; return g;
  }
  const mkMesh = (g, glass, material) => { const m = new THREE.Mesh(g, glass ? matGlass : material); m.castShadow = shadow && !glass; m.receiveShadow = !glass; if (glass) m.renderOrder = 2; m.matrixAutoUpdate = false; return m; };
  class View { // live chunk meshes of one lab grid (a region's changed chunks, or one falling piece)
    constructor(grid, parent, material) { this.grid = grid; this.group = new THREE.Group(); parent.add(this.group); this.material = material; this.meshes = new Map(); this.quads = 0; }
    remesh(id) {
      const old = this.meshes.get(id); if (old) { for (const m of old) { this.group.remove(m); this.quads -= m.geometry.userData.quads; m.geometry.dispose(); } this.meshes.delete(id); }
      const r = meshChunk(this.grid, id); const list = [];
      for (const [buf, glass] of [[r.opaque, false], [r.glass, true]]) { if (!buf) continue; const g = pack([buf], glass); if (!g) continue; const m = mkMesh(g, glass, this.material); this.group.add(m); list.push(m); this.quads += g.userData.quads; }
      if (list.length) this.meshes.set(id, list);
    }
    dispose() { for (const l of this.meshes.values()) for (const m of l) m.geometry.dispose(); this.meshes.clear(); if (this.group.parent) this.group.parent.remove(this.group); }
  }

  // ---- one region ----
  function makeRegion(c, ri) {
    const lot = c.lot; const big = lot ? lot.big : c.bb[4] > 3 || (c.bb[3] - c.bb[0]) * (c.bb[5] - c.bb[2]) > 30; const pad = c.wall ? 1.6 : big ? 3.2 : 1.6; const PV = Math.round(pad / S);
    const tx0 = lot ? lot.x : Math.floor(c.bb[0] - 0.05); const tz0 = lot ? lot.z : Math.floor(c.bb[2] - 0.05); const tx1 = lot ? lot.x + c.cv.sx * S : Math.ceil(c.bb[3] + 0.05); const tz1 = lot ? lot.z + c.cv.sz * S : Math.ceil(c.bb[5] + 0.05);
    const NX = lot ? c.cv.sx : Math.round((tx1 - tx0) / S); const NZ = lot ? c.cv.sz : Math.round((tz1 - tz0) / S); const NY = lot ? c.cv.sy + 2 : Math.ceil((c.bb[4] + 0.6) / S) + 2;
    const R = { i: ri, name: c.name || 'prop', c, pad, PV, NX, NY, NZ, gx0: tx0 - pad, gz0: tz0 - pad, x0: tx0 - pad, z0: tz0 - pad, x1: tx1 + pad, z1: tz1 + pad, y1: c.bb[4] + 1, tx0, tz0, tx1, tz1,
      tail: 0, acc: 0, changed: false, solidT: 0, sent: 0, solids: [], signs: [], doors: [], d: [1e9, 1e9, 1e9, -1, -1, -1], bodyViews: new Map(), quads: 0 };
    R.vx = (x) => (x - R.gx0) / S; R.vy = (y) => y / S + GY; R.vz = (z) => (z - R.gz0) / S;
    R.wx = (v) => v * S + R.gx0; R.wy = (v) => (v - GY) * S; R.wz = (v) => v * S + R.gz0;
    // rasterise
    const cv = lot ? c.cv : new Canvas(NX, NY, NZ);
    for (const b of lot ? [] : c.boxes) {
      const mats = b.mats; const side = matId(sideKey(mats)); const top = typeof mats === 'object' && mats.top && mats.top !== sideKey(mats) ? matId(mats.top) : 0; const bot = typeof mats === 'object' && mats.bottom && mats.bottom !== sideKey(mats) ? matId(mats.bottom) : 0;
      if (!b.m) {
        const lo = [0, 0, 0]; const hi = [0, 0, 0];
        for (let k = 0; k < 3; k++) { const o = k === 0 ? tx0 : k === 2 ? tz0 : 0; lo[k] = Math.round((b.min[k] - o) / S); hi[k] = Math.max(lo[k] + 1, Math.round((b.max[k] - o) / S)); }
        cv.box(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], side);
        if (top && hi[1] - lo[1] > 1) cv.box(lo[0], hi[1] - 1, lo[2], hi[0], hi[1], hi[2], top); else if (top && hi[1] - lo[1] === 1 && b.max[1] - b.min[1] < S * 2.5 && typeof mats === 'object' && !mats.side) cv.box(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], top);
        if (bot && hi[1] - lo[1] > 2) cv.box(lo[0], lo[1], lo[2], hi[0], lo[1] + 1, hi[2], bot);
      } else { // a turned box: every voxel whose centre is inside it (thin parts are thickened to one voxel)
        const e = b.inv.elements; const hx = Math.max(0, S * 0.5 - (b.max[0] - b.min[0]) / 2); const hy = Math.max(0, S * 0.5 - (b.max[1] - b.min[1]) / 2); const hz = Math.max(0, S * 0.5 - (b.max[2] - b.min[2]) / 2);
        const x0 = Math.floor((b.bb[0] - tx0) / S); const x1 = Math.ceil((b.bb[3] - tx0) / S); const y0 = Math.max(0, Math.floor(b.bb[1] / S)); const y1 = Math.ceil(b.bb[4] / S); const z0 = Math.floor((b.bb[2] - tz0) / S); const z1 = Math.ceil((b.bb[5] - tz0) / S);
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const wx = tx0 + (x + 0.5) * S; const wy = (y + 0.5) * S; const wz = tz0 + (z + 0.5) * S;
          const lx = e[0] * wx + e[4] * wy + e[8] * wz + e[12]; const ly = e[1] * wx + e[5] * wy + e[9] * wz + e[13]; const lz = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
          if (lx >= b.min[0] - hx && lx <= b.max[0] + hx && ly >= b.min[1] - hy && ly <= b.max[1] + hy && lz >= b.min[2] - hz && lz <= b.max[2] + hz) cv.set(x, y, z, side);
        }
      }
    }
    DIM = [NX + PV * 2, GY + NY + 8, NZ + PV * 2];
    const w = R.world = new RWorld(); w.fx = 0; w.ignite = () => 0; w.spCap = 0; w.sp = EMPTY; w.spx = EMPTY; w.cell = S > 0.15 ? 5 : 9; w.bodies.fracture = (b) => { w.shatter(b); return true; }; // (a big piece landing on its side shatters instead of the lab's single cut)
    w.debCap = big ? (S > 0.15 ? 900 : 2400) : 500; w.d = mkD(w.debCap); w.seedScratch = new Int32Array(8192); w.remScratch = new Int32Array(8192); w.remMat = new Uint8Array(8192); w.listScratch = SH.list; w.stack = SH.stack;
    w.place(cv, PV, PV, 0, R.name);
    R.voxels = cv.count(); R.ground = w.grid.solid - R.voxels; w.events.length = 0;
    const g = w.grid; R.sx = g.sx; R.sy = g.sy; R.sz = g.sz;
    w.touch = (x, y, z) => { R.changed = true; const d = R.d; if (x < d[0]) d[0] = x; if (y < d[1]) d[1] = y; if (z < d[2]) d[2] = z; if (x > d[3]) d[3] = x; if (y > d[4]) d[4] = y; if (z > d[5]) d[5] = z; };
    // ambient occlusion volume (2-voxel cells; filled from the solid voxels, then kept up to date where the grid changes)
    R.ax = Math.ceil(R.sx / 2); R.ay = Math.ceil((NY + 12) / 2); R.az = Math.ceil(R.sz / 2);
    if (useAo) {
      R.aoData = new Uint8Array(R.ax * R.ay * R.az); const ad = R.aoData; const ax = R.ax; const ay = R.ay;
      g.forEach((x, y, z, m) => { if (y < GY - 2 || MT.isTransparent[m]) return; const cy = (y - GY + 2) >> 1; if (cy >= ay) return; ad[(x >> 1) + ax * (cy + ay * (z >> 1))] += 31; });
      R.aoTex = new THREE.Data3DTexture(ad, R.ax, R.ay, R.az); R.aoTex.format = THREE.RedFormat; R.aoTex.type = THREE.UnsignedByteType; R.aoTex.minFilter = R.aoTex.magFilter = THREE.LinearFilter; R.aoTex.unpackAlignment = 1; R.aoTex.needsUpdate = true;
    } else R.aoTex = null;
    R.mat = makeMat(R, true); R.matBody = makeMat(R, false);
    R.root = new THREE.Group(); R.root.name = 'vox-' + R.name + ri; R.root.position.set(R.gx0, -GY * S, R.gz0); R.root.scale.setScalar(S); R.root.matrixAutoUpdate = false; R.root.updateMatrix(); townRoot.add(R.root);
    // the static merged mesh: every chunk's quads in one geometry; a chunk that changes is blanked out of the index
    const ob = []; const oid = []; const gb = []; const gid = [];
    for (let id = 0; id < g.nChunks; id++) { if (!g.count[id]) continue; const r = meshChunk(g, id); if (r.opaque) { ob.push(r.opaque); oid.push(id); } if (r.glass) { gb.push(r.glass); gid.push(id); } }
    g.dirtyList.length = 0; g.meshDirty.fill(0); g.densList.length = 0; g.densDirty.fill(0);
    R.static = []; R.range = new Map();
    for (const [bufs, ids, glass] of [[ob, oid, false], [gb, gid, true]]) {
      const geo = pack(bufs, glass); if (!geo) continue; const mesh = mkMesh(geo, glass, R.mat); R.root.add(mesh); R.static.push(mesh); R.quads += geo.userData.quads;
      geo.userData.starts.forEach((st, k) => { if (!st[1]) return; let l = R.range.get(ids[k]); if (!l) R.range.set(ids[k], l = []); l.push([geo, st[0], st[1]]); });
    }
    R.view = new View(g, R.root, R.mat);
    w.hooks.bodyAdded = (b) => { const v = new View(b.grid, bodyRoot, R.matBody); v.group.matrixAutoUpdate = false; for (let id = 0; id < b.grid.nChunks; id++) if (b.grid.count[id]) v.remesh(id); b.grid.dirtyList.length = 0; b.grid.meshDirty.fill(0); R.bodyViews.set(b, v); pose(R, b, v); };
    w.hooks.bodyRemoved = (b) => { const v = R.bodyViews.get(b); if (v) { v.dispose(); R.bodyViews.delete(b); } };
    // collision columns
    R.CS = Math.max(1, Math.round(0.2 / S)); R.CW = Math.ceil(R.sx / R.CS); R.CD = Math.ceil(R.sz / R.CS); R.sig = new Array(R.CW * R.CD).fill(''); R.runs = new Array(R.CW * R.CD).fill(null);
    R.d = [0, GY, 0, R.sx - 1, GY + NY, R.sz - 1];
    return R;
  }
  function pose(R, b, v) {
    const Q = b.R; const m = v.group.matrix.elements; const ox = b.o[0] * 10 * S + R.gx0; const oy = (b.o[1] * 10 - GY) * S; const oz = b.o[2] * 10 * S + R.gz0;
    m[0] = Q[0] * S; m[1] = Q[3] * S; m[2] = Q[6] * S; m[3] = 0; m[4] = Q[1] * S; m[5] = Q[4] * S; m[6] = Q[7] * S; m[7] = 0; m[8] = Q[2] * S; m[9] = Q[5] * S; m[10] = Q[8] * S; m[11] = 0; m[12] = ox; m[13] = oy; m[14] = oz; m[15] = 1;
    v.group.matrixWorldNeedsUpdate = true;
  }
  // remesh what the grid marked dirty (at most `budget` chunks); a chunk's first change takes it out of the merged mesh
  function drain(R, budget) {
    const g = R.world.grid; if (!g.dirtyList.length) return 0; let n = 0; const keep = [];
    for (const id of g.dirtyList) {
      if (n >= budget) { keep.push(id); continue; }
      g.meshDirty[id] = 0; n++;
      const rg = R.range.get(id); if (rg) { for (const [geo, st, c] of rg) { geo.index.array.fill(0, st * 6, (st + c) * 6); geo.index.needsUpdate = true; R.quads -= c; } R.range.delete(id); }
      R.view.remesh(id);
    }
    g.dirtyList.length = 0; for (const id of keep) g.dirtyList.push(id);
    for (const id of g.densList) g.densDirty[id] = 0; g.densList.length = 0;
    return keep.length;
  }
  function updateAo(R) {
    if (!useAo || R.d[3] < 0) return; const g = R.world.grid; const d = R.d; const ax = R.ax; const ay = R.ay; const az = R.az;
    const c0 = Math.max(0, (d[0] >> 1) - 1); const c1 = Math.min(ax - 1, (d[3] >> 1) + 1); const e0 = Math.max(0, (d[2] >> 1) - 1); const e1 = Math.min(az - 1, (d[5] >> 1) + 1);
    const y0 = Math.max(0, ((d[1] - GY + 2) >> 1) - 1); const y1 = Math.min(ay - 1, ((d[4] - GY + 2) >> 1) + 1);
    for (let y = y0; y <= y1; y++) for (let z = e0; z <= e1; z++) for (let x = c0; x <= c1; x++) {
      let n = 0; const X0 = x * 2; const Y0 = GY - 2 + y * 2; const Z0 = z * 2;
      for (let q = 0; q < 8; q++) { const m = g.get(X0 + (q & 1), Y0 + ((q >> 1) & 1), Z0 + (q >> 2)); if (m && !MT.isTransparent[m]) n++; }
      R.aoData[x + ax * (y + ay * z)] = n * 31;
    }
    R.aoTex.needsUpdate = true;
  }

  // ---- signs and stained glass keep their painted faces as ordinary boxes and drop when the wall behind them is gone ----
  function behind(R, b) {
    let n = 0; const g = R.world.grid; const bb = b.bb;
    for (let y = Math.floor(R.vy(bb[1])); y <= Math.floor(R.vy(bb[4])); y++) for (let z = Math.floor(R.vz(bb[2] - 0.25)); z <= Math.floor(R.vz(bb[5] + 0.25)); z++) for (let x = Math.floor(R.vx(bb[0] - 0.25)); x <= Math.floor(R.vx(bb[3] + 0.25)); x++) if (g.get(x, y, z)) n++;
    return n;
  }
  function buildSigns() {
    for (const b of cap) {
      if (!isDecor(b)) continue; const cx = (b.bb[0] + b.bb[3]) / 2; const cz = (b.bb[2] + b.bb[5]) / 2; let best = null; let bd = 1e9;
      for (const R of regions) { const d = Math.hypot(Math.max(R.tx0 - cx, 0, cx - R.tx1), Math.max(R.tz0 - cz, 0, cz - R.tz1)); if (d < bd) { bd = d; best = R; } }
      const B = new BZ.Builder('voxsign'); B.box(b.min, b.max, b.mats, b.opt); const g = B.build({ cast: false, recv: true, matOpts: { stained: { emissive: 0x7a5a50 } } }); townRoot.add(g);
      const o = { g, b, n0: 0 }; if (best) { o.n0 = behind(best, b); best.signs.push(o); }
    }
  }
  function checkDecor(R) {
    for (const o of R.signs) {
      if (!o.g.visible || behind(R, o.b) > o.n0 * 0.45) continue; o.g.visible = false;
      const c = new THREE.Vector3((o.b.bb[0] + o.b.bb[3]) / 2, (o.b.bb[1] + o.b.bb[4]) / 2, (o.b.bb[2] + o.b.bb[5]) / 2);
      G.fx.chunks(c, 8, [BZ.mat('metal_dark', { vc: true })], new THREE.Vector3(0, 0.3, 1), 1.4, true);
    }
    // a door whose doorway is gone goes with it
    if (G.destruct && G.destruct.doors && host()) for (const o of R.doors) { if (o.D.state === 2) continue; if (around(R, o.D) < o.n0 * 0.4) { try { if (o.D.state !== 1) G.destruct.setDoor(o.D, 1); G.destruct.setDoor(o.D, 2); } catch (e) { /* the door stays */ } } }
  }
  function around(R, D) { let n = 0; const g = R.world.grid; const a = D.at; for (let y = Math.floor(R.vy(0.2)); y <= Math.floor(R.vy(3)); y += 2) for (let z = Math.floor(R.vz(a.z - 1.3)); z <= Math.floor(R.vz(a.z + 1.3)); z += 2) for (let x = Math.floor(R.vx(a.x - 1.3)); x <= Math.floor(R.vx(a.x + 1.3)); x += 2) if (g.get(x, y, z)) n++; return n; }
  function bindDoors() {
    if (!G.destruct || !G.destruct.doors) return;
    for (const R of regions) R.doors.length = 0;
    for (const D of G.destruct.doors) { const R = regions.find((r) => D.at.x > r.tx0 - 0.3 && D.at.x < r.tx1 + 0.3 && D.at.z > r.tz0 - 0.3 && D.at.z < r.tz1 + 0.3); if (R) R.doors.push({ D, n0: around(R, D) }); }
  }

  // ---- collision boxes and walk grids from the voxels ----
  function column(R, cx, cz) {
    const g = R.world.grid; const CS = R.CS; const r = []; let start = -1; const need = CS * CS / 2; const minRun = S < 0.15 ? 2 : 1; const top = GY + R.NY + 6;
    const x0 = cx * CS; const z0 = cz * CS; const ccx = x0 >> 5; const ccz = z0 >> 5;
    for (let y = GY; y <= top; y++) {
      if (start < 0 && (y & 31) === 0 && y < top) { const id = ccx + g.cx * (ccz + g.cz * (y >> 5)); if (!g.chunks[id] || !g.count[id]) { y += 31; continue; } }
      let n = 0; if (y < top) for (let q = 0; q < CS * CS; q++) if (g.get(x0 + (q % CS), y, z0 + ((q / CS) | 0))) n++;
      if (n >= need) { if (start < 0) start = y; } else if (start >= 0) { if (y - start >= minRun) r.push(start - GY, y - GY, MT.flags[g.get(x0, y - 1, z0) || g.get(x0 + CS - 1, y - 1, z0 + CS - 1)] & MT.F.RUBBLE ? 1 : 0); start = -1; }
    }
    R.runs[cx + R.CW * cz] = r; R.sig[cx + R.CW * cz] = r.join(',');
  }
  let gridsDirty = false;
  function rebuildSolids(R) {
    const t0 = performance.now(); const CS = R.CS; const CW = R.CW; const CD = R.CD; const d = R.d;
    const c0 = Math.max(0, Math.floor(d[0] / CS)); const c1 = Math.min(CW - 1, Math.floor(d[3] / CS)); const e0 = Math.max(0, Math.floor(d[2] / CS)); const e1 = Math.min(CD - 1, Math.floor(d[5] / CS));
    for (let cz = e0; cz <= e1; cz++) for (let cx = c0; cx <= c1; cx++) column(R, cx, cz);
    const next = []; const used = new Uint8Array(CW * CD); const sig = R.sig; const runs = R.runs;
    for (let cz = 0; cz < CD; cz++) for (let cx = 0; cx < CW; cx++) {
      const i = cx + CW * cz; const sg = sig[i]; if (!sg || used[i]) continue;
      let w = 1; while (cx + w < CW && !used[i + w] && sig[i + w] === sg) w++;
      let dd = 1; outer: for (; cz + dd < CD; dd++) for (let k = 0; k < w; k++) if (used[i + k + CW * dd] || sig[i + k + CW * dd] !== sg) break outer;
      for (let b = 0; b < dd; b++) for (let k = 0; k < w; k++) used[i + k + CW * b] = 1;
      const r = runs[i];
      for (let q = 0; q < r.length; q += 3) {
        const s = { min: [R.gx0 + cx * CS * S, r[q] * S, R.gz0 + cz * CS * S], max: [R.gx0 + (cx + w) * CS * S, r[q + 1] * S, R.gz0 + (cz + dd) * CS * S], tag: 'stone', vox: true };
        if (s.max[1] < 0.5 || (r[q + 2] && r[q] === 0 && s.max[1] < 1.3)) s.noGrid = true; // low rubble and rubble heaps: bodies step up them (or climbAssist lifts them), the walk grid ignores them so the flow field still reaches a player standing in ruins
        next.push(s);
      }
    }
    W.swapSolids(R.solids, next); R.solids = next; gridsDirty = true;
    stat.rebuilds++; stat.rebuildMs = +(performance.now() - t0).toFixed(1);
  }
  // rubble that came down on somebody lifts them on top of it instead of trapping them inside
  const umin = [0, 0, 0]; const umax = [0, 0, 0];
  function unstick(R) {
    const lift = (pos, r, h) => {
      if (pos.x < R.x0 || pos.x > R.x1 || pos.z < R.z0 || pos.z > R.z1) return;
      for (let i = 0; i < 6; i++) { umin[0] = pos.x - r; umin[1] = pos.y + 0.02; umin[2] = pos.z - r; umax[0] = pos.x + r; umax[1] = pos.y + h; umax[2] = pos.z + r; const s = W.overlaps(umin, umax); if (!s || !s.vox || s.max[1] - pos.y > 1.6) return; pos.y = s.max[1] + 0.01; }
    };
    lift(G.player.pos, 0.3, 1.7); for (const z of G.zombies.list) if (z.alive && !z.T.fly) lift(z.pos, 0.3 * z.T.scale, 1.6);
  }
  // A zombie that has not moved for 1.5 s inside a damaged region, with broken voxels up to 1.5 m high between it and the
  // player, climbs onto them (the flow field knows nothing of heights; rubble and wall stubs must never trap anybody).
  const cmin = [0, 0, 0]; const cmax = [0, 0, 0];
  function climbAssist() {
    const pl = G.player.pos;
    for (const z of G.zombies.list) {
      if (!z.alive || z.T.fly) continue; const p = z.pos; let a = z.vxAnchor;
      if (!a) a = z.vxAnchor = { x: p.x, z: p.z, t: 0 };
      if (Math.hypot(p.x - a.x, p.z - a.z) > 0.4) { a.x = p.x; a.z = p.z; a.t = 0; continue; }
      a.t += 0.5; if (a.t < 1.5) continue;
      let dx = pl.x - p.x; let dz = pl.z - p.z; const d = Math.hypot(dx, dz); if (d < 2.2) { a.t = 0; continue; } dx /= d; dz /= d;
      let R = null; for (const q of regions) if (q.hurt && p.x >= q.x0 - 6 && p.x <= q.x1 + 6 && p.z >= q.z0 - 6 && p.z <= q.z1 + 6) { R = q; break; } if (!R) continue; // (only around damage: elsewhere the game's own stacking and re-gate rules apply untouched)
      const lim = a.t < 4 ? 1.5 : a.t < 7 ? 3 : 6; // the longer it has been stuck, the higher it may climb
      const r = 0.3 * (z.T.scale || 1);
      for (const [ux, uz] of [[dx, dz], [dx * 0.7 - dz * 0.7, dz * 0.7 + dx * 0.7], [dx * 0.7 + dz * 0.7, dz * 0.7 - dx * 0.7]]) {
        const nx = p.x + ux * 0.5; const nz = p.z + uz * 0.5; cmin[0] = nx - r; cmin[1] = p.y + 0.05; cmin[2] = nz - r; cmax[0] = nx + r; cmax[1] = p.y + 1.7; cmax[2] = nz + r;
        let top = p.y; let ok = true;
        for (let i = 0; i < 8; i++) { const s = W.overlaps(cmin, cmax); if (!s) break; if (!s.vox || s.max[1] - p.y > lim) { ok = false; break; } top = s.max[1] + 0.02; cmin[1] = top; cmax[1] = top + 1.7; if (i === 7) ok = false; }
        if (!ok || top === p.y) continue;
        p.x = nx; p.z = nz; p.y = top; if (z.vel) z.vel.y = 0; a.x = p.x; a.z = p.z; a.t = 0; stat.climbs = (stat.climbs || 0) + 1; break;
      }
    }
  }
  // exact ray against the voxels (world.js calls this from its raycast)
  const hitS = { vox: true, tag: 'stone', min: [0, 0, 0], max: [0, 0, 0] };
  function ray(o, d, maxT) {
    let best = null; let bt = maxT;
    for (let ri = 0; ri < regions.length; ri++) {
      const R = regions[ri]; let t0 = 0; let t1 = bt; let miss = false;
      for (let k = 0; k < 3; k++) {
        const oo = k === 0 ? o.x : k === 1 ? o.y : o.z; const dd = k === 0 ? d.x : k === 1 ? d.y : d.z; const lo = k === 0 ? R.x0 : k === 1 ? 0 : R.z0; const hi = k === 0 ? R.x1 : k === 1 ? R.y1 + 1 : R.z1;
        if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { miss = true; break; } continue; }
        let a = (lo - oo) / dd; let b = (hi - oo) / dd; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) { miss = true; break; }
      }
      if (miss) continue;
      const h = R.world.raycast(R.vx(o.x + d.x * t0) * 0.1, R.vy(o.y + d.y * t0) * 0.1, R.vz(o.z + d.z * t0) * 0.1, d.x || 1e-12, d.y || 1e-12, d.z || 1e-12, (t1 - t0) * K + 0.05); // (the lab's DDA steps a voxel sideways on an exactly zero component)
      if (!h || h.y < GY) continue; const t = t0 + h.t / K; if (t >= bt) continue;
      bt = t; const cls = MT.audioClass[h.m] || 'stone'; hitS.tag = TAG[cls] || 'stone'; hitS.m = h.m; hitS.surface = SURF[cls] || 'stone'; hitS.R = R;
      best = { t, normal: [h.nx, h.ny, h.nz], tag: hitS.tag, s: hitS };
    }
    return best;
  }
  W.setVoxRay(ray);
  const regionAt = (x, z) => { for (const R of regions) if (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1) return R; return null; };
  function topAt(x, z, y) { let t = 0; for (const R of regions) { if (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1) continue; const v = R.wy(R.world.groundY(Math.floor(R.vx(x)), Math.floor(R.vz(z)), Math.min(R.sy - 1, Math.floor(R.vy(y)) + 1))); if (v > t) t = v; } return Math.max(0, t); }

  // ---- build / dispose the whole town on one tier ----
  function construct() {
    const t0 = performance.now(); K = 0.1 / S; useAo = S < 0.15 && G.renderer.capabilities.isWebGL2 && P.voxao3d !== '0';
    const list = []; const lim = 296;
    const split = (c) => { // a region longer than one lab grid is cut in two across its long side
      const zx = (c.bb[5] - c.bb[2] + 3.4) / S; const xx = (c.bb[3] - c.bb[0] + 3.4) / S;
      if (zx <= lim && xx <= 1200) { list.push(c); return; }
      const k = zx > lim ? 2 : 0; const mid = Math.round((c.bb[k] + c.bb[k + 3]) / 2); const A = { name: c.name, wall: c.wall, boxes: [] }; const B2 = { name: c.name, wall: c.wall, boxes: [] };
      for (const b of c.boxes) {
        if (b.m || b.bb[k + 3] <= mid) { (b.bb[k] + b.bb[k + 3] < mid * 2 ? A : B2).boxes.push(b); continue; }
        if (b.bb[k] >= mid) { B2.boxes.push(b); continue; }
        const a = { ...b, min: b.min.slice(), max: b.max.slice() }; a.max[k] = mid; a.bb = [a.min[0], a.min[1], a.min[2], a.max[0], a.max[1], a.max[2]]; A.boxes.push(a);
        const e = { ...b, min: b.min.slice(), max: b.max.slice() }; e.min[k] = mid; e.bb = [e.min[0], e.min[1], e.min[2], e.max[0], e.max[1], e.max[2]]; B2.boxes.push(e);
      }
      for (const q of [A, B2]) { if (!q.boxes.length) continue; q.bb = q.boxes[0].bb.slice(); for (const b of q.boxes) grow(q.bb, b.bb); split(q); }
    };
    for (const c of clusters()) { if (!c.name) { const n = NAMES.find(([, x, z]) => x > c.bb[0] && x < c.bb[3] && z > c.bb[2] && z < c.bb[5]); c.name = n ? n[0] : null; } split(c); }
    for (const lot of PLAN.lots) { const cv = S > 0.15 ? (lot.half || (lot.half = half(lot.canvas))) : lot.canvas; list.push({ name: lot.name, lot, cv, boxes: [], bb: [lot.x, 0, lot.z, lot.x + cv.sx * S, cv.sy * S, lot.z + cv.sz * S] }); }
    regions = list.map((c, i) => makeRegion(c, i)); built = 0; for (const R of regions) built += R.voxels;
    buildSigns(); for (const R of regions) { rebuildSolids(R); R.changed = false; R.d = [1e9, 1e9, 1e9, -1, -1, -1]; }
    W.rebuildGrids(); gridsDirty = false; bindDoors(); stat.buildMs = Math.round(performance.now() - t0);
  }
  function destroy() {
    for (const R of regions) {
      for (const v of R.bodyViews.values()) v.dispose(); R.bodyViews.clear(); R.view.dispose(); for (const m of R.static) m.geometry.dispose(); townRoot.remove(R.root);
      R.mat.dispose(); R.matBody.dispose(); if (R.aoTex) R.aoTex.dispose(); W.swapSolids(R.solids, []); R.solids = [];
    }
    for (let i = townRoot.children.length - 1; i >= 0; i--) { const ch = townRoot.children[i]; ch.traverse((m) => { if (m.isMesh) m.geometry.dispose(); }); townRoot.remove(ch); }
    regions = [];
  }

  // debris cubes of every awake region in one instanced mesh
  const DCAP = X.low ? 900 : X.q === 'high' ? 5000 : 2600;
  const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), DCAP); deb.frustumCulled = false; deb.count = 0; deb.name = 'vox-town-debris'; deb.castShadow = false;
  deb.setColorAt(0, new THREE.Color(1, 1, 1)); deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(deb);
  const dm = new THREE.Matrix4(); const dq = new THREE.Quaternion(); const dp = new THREE.Vector3(); const ds = new THREE.Vector3(); const dc = new THREE.Color(); let debN = 0;
  function drawDebris() {
    let total = 0; for (const R of regions) total += R.world.d.n;
    if (!total) { if (debN) { deb.count = 0; debN = 0; } return; }
    const stride = total > DCAP ? total / DCAP : 1; let j = 0; let acc = 0;
    for (const R of regions) {
      const D = R.world.d; if (!D.n) continue;
      for (let i = 0; i < D.n && j < DCAP; i++) {
        acc += 1; if (acc < stride) continue; acc -= stride; const s = D.size[i] * 10 * S;
        dm.compose(dp.set(R.wx(D.px[i] * 10), R.wy(D.py[i] * 10), R.wz(D.pz[i] * 10)), dq.set(D.q[i * 4], D.q[i * 4 + 1], D.q[i * 4 + 2], D.q[i * 4 + 3]), ds.set(s, s, s)); deb.setMatrixAt(j, dm); deb.setColorAt(j, dc.setHex(hexOf[D.mat[i]])); j++;
      }
    }
    deb.count = debN = j; deb.instanceMatrix.needsUpdate = true; if (deb.instanceColor) deb.instanceColor.needsUpdate = true;
  }

  // ---- commands: the only way the town changes ----
  const host = () => !(G.coop && G.coop.guest);
  let log = []; let applied = 0; const water = new Map(); let beat = 0; let idleBeat = 0; let askT = 0; let chipBudget = 0; let synced = false; let hostN = 0; let digI = 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  function apply(c, local) {
    const R = regions[c[7]]; if (!R) return; const [kind, x, y, z, r, p] = c; const lx = R.vx(x) * 0.1; const ly = R.vy(y) * 0.1; const lz = R.vz(z) * 0.1;
    if (kind === 1) R.world.explode(lx, ly, lz, r * K, p, 0); else R.world.carve(lx, ly, lz, r * K, p, { keepGround: true, debris: 0.5, dust: 0 });
    R.tail = kind === 1 ? 90 : 20; R.hurt = true; stat.cmds++;
    const at = new THREE.Vector3(x, y, z);
    if (kind === 1) { if (c[8]) { if (X.fx && X.fx.blast) X.fx.blast({ point: at, r, power: p }); if (X.audio && X.audio.blast) X.audio.blast({ point: at, r, power: p }); } }
    else if (!local) { if (X.fx && X.fx.impact) X.fx.impact({ point: at, normal: [0, 1, 0], dir: new THREE.Vector3(0, -1, 0), surface: 'stone', color: 0x9a948a, power: 0.3 }); }
  }
  function command(kind, x, y, z, r, p, ri, fxOn, local) { // host only
    const R = regions[ri]; if (!R) return; const c = [kind, r2(x), r2(y), r2(z), r2(r), r2(p), R.world.step, ri, fxOn ? 1 : 0]; apply(c, local); log.push(c); applied = log.length;
    if (G.coop && G.coop.host) G.coop.events.push({ k: 'vx', e: { c, n: log.length } });
  }
  const nearR = (R, at, r) => at.x > R.tx0 - r && at.x < R.tx1 + r && at.z > R.tz0 - r && at.z < R.tz1 + r && at.y < R.y1 + r;
  function blastHost(x, y, z, rr, p) { let first = true; const at = { x, y, z }; for (const R of regions) if (nearR(R, at, rr + 0.6)) { command(1, x, y, z, rr, p, R.i, first); first = false; } }
  function blast(at, r, dmg) {
    const rr = BZ.clamp(r * 0.4, 0.8, 3.0); const p = BZ.clamp(dmg / 200, 0.75, 1.5); const y = Math.max(0.3, at.y); let any = false;
    for (const R of regions) if (nearR(R, at, rr + 0.6)) { any = true; break; }
    if (!any) return false;
    if (host()) blastHost(at.x, y, at.z, rr, p); else G.coop.act({ k: 'vx', b: [r2(at.x), r2(y), r2(at.z), r2(rr), r2(p)] });
    return true;
  }
  function chip(solid, at, dmg, dir) {
    if (!at) return; stat.chips++;
    const surface = solid.surface || 'stone'; const m = solid.m || M.concrete; const pw = BZ.clamp(dmg / 60, 0.15, 1);
    if (X.fx && X.fx.impact) X.fx.impact({ point: at.clone ? at.clone() : new THREE.Vector3(at.x, at.y, at.z), normal: [0, 0, 0], dir, surface, color: hexOf[m], power: pw });
    if (X.audio && X.audio.impact) X.audio.impact({ surface, point: at, mag: pw });
    if (chipBudget <= 0) return; chipBudget--; // (a minigun does not need a carve for every round)
    const r = BZ.clamp(0.08 + dmg * 0.004, 0.1, 0.32); const p = BZ.clamp(0.4 + dmg * 0.004, 0.42, 0.78); const d = dir || { x: 0, y: 0, z: 0 };
    const x = at.x + d.x * r * 0.5; const y = at.y + d.y * r * 0.5; const z = at.z + d.z * r * 0.5;
    const R = solid.R && regions[solid.R.i] === solid.R ? solid.R : regionAt(x, z); if (!R) return;
    if (host()) command(0, x, y, z, r, p, R.i, false, true); else G.coop.act({ k: 'vx', h: [r2(x), r2(y), r2(z), r2(r), r2(p), R.i] });
  }
  // a guest asks the host (a shot, a blast, or the commands it is missing)
  function act(x) {
    if (!host()) return;
    if (x.h) command(0, x.h[0], x.h[1], x.h[2], x.h[3], x.h[4], x.h[5], false, false); else if (x.b) blastHost(...x.b);
    else if (x.need !== undefined && G.coop.events) G.coop.events.push({ k: 'vx', e: { from: x.need, log: log.slice(x.need, x.need + 400), n: log.length, s: S, w: steps() } });
  }
  const steps = () => { const o = []; for (const R of regions) if (R.world.step) o.push(R.i, R.world.step); return o; };
  // host -> guest
  function remote(e) {
    if (host()) return;
    if (e.s !== undefined && Math.abs(e.s - S) > 1e-6) retier(e.s); // the room runs on the host's voxel tier
    if (e.reset) { reset(); synced = true; return; }
    if (!synced) { if (e.s === undefined) return; synced = true; if (log.length || regions.some((R) => R.world.step)) reset(); } // whatever this page did on its own before joining is dropped
    if (e.n !== undefined) hostN = Math.max(hostN, e.n);
    if (e.c && e.n === log.length + 1) log.push(e.c);
    if (e.log && e.from <= log.length) for (let i = log.length - e.from; i < e.log.length; i++) log.push(e.log[i]);
    if (e.w) for (let i = 0; i < e.w.length; i += 2) water.set(e.w[i], Math.max(water.get(e.w[i]) || 0, e.w[i + 1]));
    if (e.n !== undefined && e.n > log.length && askT <= 0) { askT = 0.6; G.coop.act({ k: 'vx', need: log.length }); }
    if (e.d !== undefined && e.n === applied && applied === log.length) { const R = regions[e.di]; if (R && R.world.step === e.ds && !active(R)) { if (R.world.digest() === e.d) stat.digestOk++; else { stat.digestBad++; if (stat.digestBad === 1) console.error('[vox] town region ' + R.name + ' differs from the host at step ' + R.world.step); } } }
  }
  const active = (R) => { const w = R.world; return R.tail > 0 || w.d.n > 0 || w.bodies.list.length > 0 || w.nSeeds > 0 || w.fuses.length > 0 || w.structures[0].anyDirty; };
  const anyActive = () => regions.some(active);
  function tick(R) { R.world.tick(); if (R.tail > 0) R.tail--; stat.ticks++; }
  function sim(dt) {
    chipBudget = Math.min(6, chipBudget + dt * 24); askT -= dt;
    if (host()) {
      let any = false;
      for (const R of regions) { if (!active(R)) { R.acc = 0; continue; } any = true; R.acc = Math.min(R.acc + dt, 4 / 60); while (R.acc >= 1 / 60) { R.acc -= 1 / 60; if (active(R)) tick(R); } }
      if (G.coop && G.coop.host) {
        beat -= dt; idleBeat -= dt;
        if (beat <= 0) { const w = []; for (const R of regions) if (R.world.step !== R.sent) { w.push(R.i, R.world.step); R.sent = R.world.step; } if (w.length) { beat = 0.2; G.coop.events.push({ k: 'vx', e: { w, n: log.length, s: S } }); } }
        if (idleBeat <= 0) { // one settled region's digest per beat, in turn
          idleBeat = any ? 0.5 : 1; let e = { n: log.length, s: S };
          for (let k = 0; k < regions.length; k++) { const R = regions[(digI + k) % regions.length]; if (R.world.step && !active(R)) { digI = (digI + k + 1) % regions.length; e = { n: log.length, s: S, w: [R.i, R.world.step], di: R.i, ds: R.world.step, d: R.world.digest() }; break; } }
          G.coop.events.push({ k: 'vx', e });
        }
      }
    } else {
      if (!synced && G.coop && G.coop.guest && askT <= 0) { askT = 1; G.coop.act({ k: 'vx', need: 0 }); }
      // replay: run each region up to the step its next command was made at, apply it, and never pass the host's last known step
      let budget = 600;
      while (applied < log.length && budget > 0) { const c = log[applied]; const R = regions[c[7]]; if (!R) { applied++; continue; } if (R.world.step < c[6]) { tick(R); budget--; continue; } if (R.world.step > c[6]) stat.desync++; apply(c, false); applied++; }
      if (applied >= log.length && log.length >= hostN) for (const [ri, w] of water) { const R = regions[ri]; if (!R) continue; let n = R.world.step < w - 30 ? 40 : 4; while (R.world.step < w && n-- > 0 && budget-- > 0) tick(R); }
    }
  }
  function clearState() { log = []; applied = 0; water.clear(); hostN = 0; digI = 0; }
  function reset() { destroy(); construct(); clearState(); if (G.coop && G.coop.host) G.coop.events.push({ k: 'vx', e: { reset: 1, s: S, n: 0 } }); }
  function retier(s) { if (!(s > 0.05 && s < 0.5)) return; destroy(); S = s; construct(); clearState(); stat.retier++; api.S = S; api.built = built; }
  construct();
  G.events.on('game:new', () => { if (log.length || regions.some((R) => R.world.step)) reset(); else bindDoors(); });

  // ---- the game's damage entry points ----
  const D = G.destruct; const hit0 = D.hit; const blast0 = D.blast;
  D.hit = (solid, at, dmg, dir) => { if (solid && solid.vox) return chip(solid, at, dmg, dir); return hit0(solid, at, dmg, dir); };
  let noCarve = false; // (a fuel drum that cooks off inside the voxel sim hurts whoever stands near it through the game's own explosion, without a second carve)
  D.blast = (at, r, dmg) => { blast0(at, r, dmg); if (dmg > 0 && !noCarve) blast(at, r, dmg); };

  const evP = new THREE.Vector3(); let colT = 0; let doorsBound = false; let climbT = 0;
  function update(dt) {
    climbT -= dt; if (climbT <= 0) { climbT = 0.5; if (host()) climbAssist(); }
    if (!doorsBound) { doorsBound = true; bindDoors(); }
    sim(dt); colT -= dt; const remeshBudget = X.low ? 4 : 10; let left = remeshBudget;
    for (const R of regions) {
      const w = R.world;
      if (w.events.length) {
        for (const e of w.events) {
          evP.set(R.wx(e.x * 10), R.wy(e.y * 10), R.wz(e.z * 10));
          if (X.audio && X.audio.event) X.audio.event({ kind: e.kind, x: evP.x, y: evP.y, z: evP.z, mag: e.mag, mat: e.mat, a: e.a, b: e.b });
          if (e.kind === 'detach' || e.kind === 'fracture') { if (e.a === 1) stat.shatters++; if (colT <= 0 && X.fx && X.fx.collapse) { colT = 0.22; X.fx.collapse({ point: evP.clone(), n: Math.min(56, 14 + e.mag / 260), a: 0.5, color: hexOf[e.mat] || 0x8a847a }); } }
          else if (e.kind === 'explosion' && e.b === 4) { stat.fuel = (stat.fuel || 0) + 1; if (host()) { noCarve = true; try { G.gear.explode(evP.clone(), Math.max(4, e.mag * 2.4), 260); } finally { noCarve = false; } } else if (X.fx && X.fx.blast) X.fx.blast({ point: evP.clone(), r: e.mag, power: 1 }); }
          else if (e.kind === 'rubble') { if (X.fx && X.fx.debrisLand) X.fx.debrisLand({ point: evP.clone(), n: e.mag, color: hexOf[e.mat] }); }
          else if (e.kind === 'glass' && !V.want('audio')) G.audio.playAt('glass', evP, { gain: 0.8, rate: 0.9 + (e.mag % 5) * 0.05 });
          else if ((e.kind === 'impact' || e.kind === 'thud') && e.mag > 40) { const pd = G.player.pos.distanceTo(evP); if (pd < 20) G.player.shake.v += Math.min(3, e.mag / 400) * (1 - pd / 20); }
        }
        w.events.length = 0;
      }
      if (w.grid.dirtyList.length && left > 0) { const before = w.grid.dirtyList.length; const rest = drain(R, left); left -= before - rest; }
      if (R.bodyViews.size) for (const [b, v] of R.bodyViews) { if (b.grid.dirtyList.length) { for (const id of b.grid.dirtyList) { b.grid.meshDirty[id] = 0; v.remesh(id); } b.grid.dirtyList.length = 0; } pose(R, b, v); }
      R.solidT -= dt;
      if (R.changed && R.solidT <= 0) { R.solidT = 0.35; updateAo(R); rebuildSolids(R); unstick(R); checkDecor(R); R.changed = false; R.d = [1e9, 1e9, 1e9, -1, -1, -1]; }
    }
    if (gridsDirty) { gridsDirty = false; W.rebuildGrids(); stat.solids = 0; for (const R of regions) stat.solids += R.solids.length; }
    drawDebris();
  }
  const digest = () => { let h = 0x811c9dc5; for (const R of regions) if (R.world.step) h = Math.imul(h ^ R.world.digest() ^ R.i, 0x01000193) >>> 0; return h; };
  const find = (name) => regions.filter((R) => R.name === name);
  const api = { update, blast, chip, act, remote, reset, retier, digest, topAt, ray, S, built, log: () => log, stat, find,
    get regions() { return regions; }, get world() { return regions[0] && regions[0].world; },
    debug: () => { let solid = 0; let quads = 0; let chunks = 0; let bodies = 0; let debris = 0; let step = 0; let awake = 0; let sol = 0; for (const R of regions) { solid += R.world.grid.solid - R.ground; quads += R.quads + R.view.quads; chunks += R.view.meshes.size; bodies += R.world.bodies.list.length; debris += R.world.d.n; step += R.world.step; if (active(R)) awake++; sol += R.solids.length; }
      return { ...stat, solids: sol, S, voxels: built, solid, quads, chunks, regions: regions.length, awake, bodies, debris, step, log: log.length, applied, digest: digest(), active: awake > 0, synced, names: regions.map((R) => R.name + ':' + R.voxels) }; } };
  return api;
});
