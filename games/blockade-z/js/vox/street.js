// The voxel street block (?vox=1): the shophouse row of Blockade Z's town is handed over by world.js as a list of boxes
// and rebuilt as a voxel grid inside our voxel-lab engine (games/voxel-lab: carve, explode, connectivity islands,
// level-1 stress, rigid pieces, debris cubes, rubble). 0.1 m voxels (0.2 m on the low tier: the whole lab world is drawn
// at twice the scale). Bullets chip, blasts carve, what loses its support falls, rubble piles up.
// - Collision and zombie pathing follow the voxels: 0.2 m columns are turned into boxes for world.js (throttled) and the
//   walk grids are rebuilt; shots use an exact voxel ray.
// - Co-op: the host owns the block. Every change is a command [kind, x, y, z, r, power, step]; guests replay the
//   commands at the same sim step, so the same commands give the same world (see digest()). No voxel data is sent.
// voxel-lab is our clean-room build; techniques studied from Voxel Engine by mattshumer (spawn.co).
import { meshChunk } from '../../../voxel-lab/lib/mesher.js';
import * as MT from '../../../voxel-lab/lib/materials.js';
import { World, GY, WX, WY, WZ } from '../../../voxel-lab/lib/sim/world.js';
import { Canvas } from '../../../voxel-lab/lib/build/kit.js';

const BZ = window.BZ; const THREE = window.THREE; const V = BZ.vox; const M = MT.M;

// Blockade Z texture key -> lab material (strength, rubble kind, sound class come from the lab's table; colour from the texture)
const MAT = { plaster_yellow: 'plaster_yellow', plaster_teal: 'plaster_blue', plaster_pink: 'plaster_pink', plaster_white: 'plaster', concrete: 'concrete', concrete_dark: 'rc',
  roof_red: 'rooftile', plank: 'plank', crate: 'wood', crate_metal: 'paint_yellow', shutter: 'sheet_zinc', metal_dark: 'iron', metal: 'steel', glass_pane: 'glass', glass_lit_pane: 'lamp', tire: 'rubber', brick: 'brick', stone: 'stone' };
const TAG = { stone: 'stone', plaster: 'stone', wood: 'wood', metal: 'metal', glass: 'glass', soft: 'wood', leaf: 'wood' };
const SURF = { stone: 'stone', plaster: 'plaster', wood: 'wood', metal: 'metal', glass: 'glass', soft: 'wood', leaf: 'wood' };

V.register('street', (G) => {
  const cap = V.capture; if (!cap || !cap.length) return null;
  const X = G.vox; const W = G.world; const scene = G.scene;
  const S = X.low ? 0.2 : 0.1;                 // metres per voxel in the game world
  const K = 0.1 / S;                           // lab metres per game metre
  const OX = 256; const OZ = 96;               // where the block sits in the lab world (voxels)
  const texKey = (mats) => (typeof mats === 'string' ? mats : mats.side || mats.all || mats.pz || mats.top);
  const isSign = (b) => /^sign_/.test(String(typeof b.mats === 'string' ? b.mats : b.mats.pz || b.mats.px || b.mats.nx || b.mats.nz || ''));
  const signs = cap.filter(isSign); const boxes = cap.filter((b) => !isSign(b));
  // bounds of the block, with room around it for rubble and falling pieces
  let bx0 = 1e9; let bz0 = 1e9; let bx1 = -1e9; let bz1 = -1e9; let by1 = 0;
  for (const b of boxes) { bx0 = Math.min(bx0, b.min[0]); bz0 = Math.min(bz0, b.min[2]); bx1 = Math.max(bx1, b.max[0]); bz1 = Math.max(bz1, b.max[2]); by1 = Math.max(by1, b.max[1]); }
  const PAD = 3.2; const rx0 = Math.floor(bx0) - PAD; const rz0 = Math.floor(bz0) - PAD; const rx1 = Math.ceil(bx1) + PAD; const rz1 = Math.ceil(bz1) + PAD; const ry1 = by1 + 1;
  const NX = Math.round((rx1 - rx0) / S); const NZ = Math.round((rz1 - rz0) / S); const NY = Math.ceil(ry1 / S) + 2;
  // game metres <-> lab voxels
  const vx = (x) => (x - rx0) / S + OX; const vy = (y) => y / S + GY; const vz = (z) => (z - rz0) / S + OZ;
  const wx = (v) => (v - OX) * S + rx0; const wy = (v) => (v - GY) * S; const wz = (v) => (v - OZ) * S + rz0;

  // ---- materials: colours from the game's textures, a little more strength for the plaster walls (they are the structure here) ----
  const lin = new Float32Array(256 * 3); const fresh = new Float32Array(256 * 3); const hexOf = new Uint32Array(256);
  const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < MT.N_MAT; i++) { for (let k = 0; k < 3; k++) { lin[i * 3 + k] = s2l(MT.colors[i * 3 + k]); fresh[i * 3 + k] = s2l(MT.palette[(512 + i) * 4 + k]); } hexOf[i] = (MT.colors[i * 3] << 16) | (MT.colors[i * 3 + 1] << 8) | MT.colors[i * 3 + 2]; }
  for (const [key, name] of Object.entries(MAT)) { const id = M[name]; if (!id || name === 'glass' || name === 'lamp') continue; let hex; try { hex = V.texAvg(key); } catch (e) { continue; } if (lin['seen' + id]) continue; lin['seen' + id] = 1; hexOf[id] = hex; lin[id * 3] = s2l((hex >> 16) & 255); lin[id * 3 + 1] = s2l((hex >> 8) & 255); lin[id * 3 + 2] = s2l(hex & 255); }
  for (const n of ['plaster_yellow', 'plaster_blue', 'plaster_pink', 'plaster']) { MT.p0[M[n]] = MT.p0[M.brick]; MT.fc[M[n]] = MT.fc[M.brick]; MT.toughness[M[n]] = MT.toughness[M.brick]; }
  // one 16 px tile of the game's own pixel texture per lab material: an intact face shows the texel under each voxel
  const TILE = new Int8Array(256).fill(-1); const tiles = [];
  for (const [key, name] of Object.entries(MAT)) { const id = M[name]; if (!id || name === 'glass' || name === 'lamp' || TILE[id] >= 0) continue; try { const im = BZ.tex(key).image; if (im.width !== 16 || im.height !== 16) continue; TILE[id] = tiles.length; tiles.push(im.getContext('2d').getImageData(0, 0, 16, 16).data); } catch (e) { /* keep the flat colour */ } }
  const NT = Math.max(1, tiles.length); const atlasData = new Uint8Array(NT * 16 * 16 * 4);
  tiles.forEach((d, t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const o = ((15 - y) * NT * 16 + t * 16 + x) * 4; const i = (y * 16 + x) * 4; atlasData[o] = d[i]; atlasData[o + 1] = d[i + 1]; atlasData[o + 2] = d[i + 2]; atlasData[o + 3] = 255; } });
  const atlas = new THREE.DataTexture(atlasData, NT * 16, 16, THREE.RGBAFormat); atlas.colorSpace = THREE.SRGBColorSpace; atlas.magFilter = atlas.minFilter = THREE.NearestFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true;
  const PATOF = new Uint8Array(256); for (let i = 0; i < MT.N_MAT; i++) PATOF[i] = MT.palette[(256 + i) * 4 + 2];

  // ---- the lab world ----
  const world = new World(); world.fx = 0; world.ignite = () => {}; // (no lab sprites: the game's own fx draw dust; no fire spread in this prototype)
  let changed = false; let dx0 = 1e9; let dz0 = 1e9; let dx1 = -1; let dz1 = -1; let dy0 = 1e9; let dy1 = -1;
  const touch = (x, y, z) => { changed = true; if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; if (z < dz0) dz0 = z; if (z > dz1) dz1 = z; if (y < dy0) dy0 = y; if (y > dy1) dy1 = y; };
  function build() {
    world.reset();
    const g = world.grid; const L = g.cx * g.cz; for (let id = 0; id < L; id++) g.chunks[id].fill(M.bedrock, 0, GY * 1024); // the ground never carves: the game's flat ground stays the ground
    const c = new Canvas(NX, NY, NZ);
    for (const b of boxes) {
      const name = MAT[texKey(b.mats)] || 'concrete'; const lo = [0, 0, 0]; const hi = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const o = k === 0 ? rx0 : k === 2 ? rz0 : 0; lo[k] = Math.round((b.min[k] - o) / S); hi[k] = Math.max(lo[k] + 1, Math.round((b.max[k] - o) / S)); }
      c.box(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], M[name]);
    }
    world.place(c, OX, OZ, 0, 'shophouses');
    const f = g.onSet; g.onSet = (x, y, z, o, m) => { if (f) f(x, y, z, o, m); touch(x, y, z); };
    world.events.length = 0; changed = true; dx0 = OX; dz0 = OZ; dx1 = OX + NX - 1; dz1 = OZ + NZ - 1; dy0 = GY - 1; dy1 = GY + NY;
    return c.count();
  }

  // ---- drawing: one mesh per 32^3 chunk, colours per vertex, bevel + pattern + jitter + volume AO in the shader ----
  const root = new THREE.Group(); root.name = 'vox-street'; root.position.set(rx0 - OX * S, -GY * S, rz0 - OZ * S); root.scale.setScalar(S); root.matrixAutoUpdate = false; root.updateMatrix(); scene.add(root);
  const AC = 2; const ax = Math.ceil(NX / AC); const ay = Math.ceil((NY + 2) / AC); const az = Math.ceil(NZ / AC);
  const aoData = new Uint8Array(ax * ay * az); const aoTex = new THREE.Data3DTexture(aoData, ax, ay, az); aoTex.format = THREE.RedFormat; aoTex.type = THREE.UnsignedByteType; aoTex.minFilter = aoTex.magFilter = THREE.LinearFilter; aoTex.unpackAlignment = 1; aoTex.needsUpdate = true;
  const useAo = !X.low && G.renderer.capabilities.isWebGL2 && BZ.params.voxao3d !== '0';
  function mat(ao) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const U = { uAo: { value: aoTex }, uAoMin: { value: new THREE.Vector3(OX, GY - 2, OZ) }, uAoSize: { value: new THREE.Vector3(ax * AC, ay * AC, az * AC) }, uAoK: { value: ao && useAo ? 1 : 0 }, uAtlas: { value: atlas }, uNT: { value: NT }, uS: { value: S }, uOrg: { value: ao ? new THREE.Vector3(rx0 - OX * S, -GY * S, rz0 - OZ * S) : new THREE.Vector3() } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aQ; attribute vec3 aI; varying vec3 vVoxP; varying vec3 vVoxN; varying vec4 vQ; varying vec3 vI;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxP = position; vVoxN = normal; vQ = aQ; vI = aI;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        precision highp sampler3D; uniform sampler3D uAo; uniform vec3 uAoMin; uniform vec3 uAoSize; uniform float uAoK; uniform sampler2D uAtlas; uniform float uNT; uniform float uS; uniform vec3 uOrg;
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
          if (pat == 1.0) {                              // brick: running bond, 3 x 1 voxels, a lighter mortar line
            float off = mod(cell.y, 2.0) * 1.5; float b = floor((along + off) / 3.0);
            k *= 0.92 + 0.16 * vhash(vec3(b, cell.y, 3.0));
            if (an.y < 0.5) { float fy = fract(vVoxP.y); float fa = fract((along + off + fract(an.x > 0.5 ? vVoxP.z : vVoxP.x)) / 3.0); if (fy < 0.14 || fa < 0.05) k = mix(k, 1.25, near); }
          } else if (pat == 2.0 || pat == 5.0) {         // planks and grain: boards two voxels wide with a dark seam
            float bd = an.y > 0.5 ? cell.x : cell.y; k *= 0.93 + 0.14 * vhash(vec3(floor(bd / 2.0), 7.0, 1.0));
            float fs = fract((an.y > 0.5 ? vVoxP.x : vVoxP.y) / 2.0); if (fs < 0.06) k *= mix(1.0, 0.72, near);
          } else if (pat == 3.0) {                       // roof tiles: rows that step from light to dark
            float fr = fract((an.y > 0.5 ? vVoxP.z : vVoxP.y) / 2.0); k *= 1.12 - 0.3 * fr; k *= 0.94 + 0.12 * vhash(vec3(floor(cell.x / 2.0), floor((an.y > 0.5 ? cell.z : cell.y) / 2.0), 5.0));
          } else if (pat == 13.0 || pat == 10.0) {       // corrugated sheet and metal: vertical ribs
            float rr = an.y > 0.5 ? vVoxP.x : (an.x > 0.5 ? vVoxP.z : vVoxP.x); k *= 0.9 + 0.2 * abs(fract(rr * 0.5) - 0.5) * 2.0; jit = 0.04;
          } else if (pat == 9.0) {                       // cast concrete: faint panel lines
            float px = fract((along + fract(an.x > 0.5 ? vVoxP.z : vVoxP.x)) / 12.0); float py = fract(vVoxP.y / 8.0); if (an.y < 0.5 && (px < 0.012 || py < 0.018)) k *= mix(1.0, 0.82, near); jit = 0.07;
          } else if (pat == 11.0) { jit = 0.34; }        // rubble
          k *= 1.0 + (vhash(cell) - 0.5) * jit * near;
          // a bevel where the building had an edge when it was built; a faint line on every voxel so broken faces read as cubes
          vec2 f = an.x > 0.5 ? fract(vVoxP.zy) : an.y > 0.5 ? fract(vVoxP.xz) : fract(vVoxP.xy);
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)); k *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.08 + fw * 0.5, e)) * near;
          float eb = 9.0; float bits = edges;
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.x); bits = floor(bits / 2.0);
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.z - vQ.x); bits = floor(bits / 2.0);
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.y); bits = floor(bits / 2.0);
          if (mod(bits, 2.0) >= 1.0) eb = min(eb, vQ.w - vQ.y);
          k *= 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.16 + fw, eb)) * (an.y > 0.5 ? 1.0 : 0.55);
          // volume ambient occlusion: how much solid there is just in front of the face
          if (uAoK > 0.5) {
            vec3 q1 = (vVoxP + vVoxN * 1.7 - uAoMin) / uAoSize; vec3 q2 = (vVoxP + vVoxN * 4.2 + vec3(0.0, 1.0, 0.0) - uAoMin) / uAoSize;
            float d = texture(uAo, q1).r * 0.8 + texture(uAo, q2).r * 0.5; k *= 1.0 - min(0.62, d * 0.85);
          }
          diffuseColor.rgb *= k;
        }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (floor(vI.x + 0.5) == 100.0) totalEmissiveRadiance += diffuseColor.rgb * 1.3;');
    };
    m.customProgramCacheKey = () => 'bzvoxstreet2';
    return m;
  }
  const matWorld = mat(true); const matBody = mat(false);
  const matGlass = new THREE.MeshLambertMaterial({ color: 0xbfe0f4, transparent: true, opacity: 0.42, depthWrite: false });
  const FN = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  function geoOf(buf, glass) {
    // drop the ground (bedrock): the game draws its own
    let n = 0; for (let q = 0; q < buf.n; q++) if (buf.info[q * 16 + 1] !== M.bedrock) n++;
    if (!n) return null;
    const P = new Float32Array(n * 12); const N = new Float32Array(n * 12); const C = new Float32Array(n * 12); const Q = new Float32Array(n * 16); const I2 = new Float32Array(n * 12);
    const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6); let o = 0;
    for (let q = 0; q < buf.n; q++) {
      const io = q * 16; const m = buf.info[io + 1]; if (m === M.bedrock) continue; const face = buf.info[io]; const fl = buf.info[io + 2]; const ed = buf.info[io + 3];
      const tile = fl & 3 ? -1 : TILE[m]; const src = fl & 1 ? fresh : lin; const fn = FN[face]; const pat = MT.flags[m] & MT.F.EMISSIVE ? 100 : fl & 1 ? 0 : PATOF[m];
      for (let v = 0; v < 4; v++) {
        const d = (o * 4 + v) * 3; const s = (q * 4 + v) * 3;
        P[d] = buf.pos[s]; P[d + 1] = buf.pos[s + 1]; P[d + 2] = buf.pos[s + 2]; N[d] = fn[0]; N[d + 1] = fn[1]; N[d + 2] = fn[2];
        if (tile >= 0) { C[d] = 1; C[d + 1] = 1; C[d + 2] = 1; } else { C[d] = src[m * 3]; C[d + 1] = src[m * 3 + 1]; C[d + 2] = src[m * 3 + 2]; }
        const qo = (o * 4 + v) * 4; const qs = (q * 4 + v) * 4; Q[qo] = buf.quad[qs]; Q[qo + 1] = buf.quad[qs + 1]; Q[qo + 2] = buf.quad[qs + 2]; Q[qo + 3] = buf.quad[qs + 3];
        I2[(o * 4 + v) * 3] = pat; I2[(o * 4 + v) * 3 + 1] = ed; I2[(o * 4 + v) * 3 + 2] = tile;
      }
      const b = o * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], o * 6); o++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (!glass) { g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('aQ', new THREE.BufferAttribute(Q, 4)); g.setAttribute('aI', new THREE.BufferAttribute(I2, 3)); }
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.userData.quads = n; return g;
  }
  const shadow = G.quality.shadow > 0;
  class View { // the chunk meshes of one lab grid (the world's block, or one falling piece)
    constructor(grid, parent, material, ids) { this.grid = grid; this.group = new THREE.Group(); parent.add(this.group); this.material = material; this.meshes = new Map(); this.ids = ids; this.quads = 0; }
    remesh(id) {
      const old = this.meshes.get(id); if (old) { for (const m of old) { this.group.remove(m); this.quads -= m.geometry.userData.quads; m.geometry.dispose(); } this.meshes.delete(id); }
      const r = meshChunk(this.grid, id); const list = [];
      for (const [buf, glass] of [[r.opaque, false], [r.glass, true]]) {
        if (!buf) continue; const g = geoOf(buf, glass); if (!g) continue;
        const m = new THREE.Mesh(g, glass ? matGlass : this.material); m.castShadow = shadow && !glass; m.receiveShadow = !glass; if (glass) m.renderOrder = 2; m.matrixAutoUpdate = false;
        this.group.add(m); list.push(m); this.quads += g.userData.quads;
      }
      if (list.length) this.meshes.set(id, list);
    }
    // remesh what the grid marked dirty, at most `budget` chunks; returns how many are still waiting
    drain(budget) {
      const g = this.grid; let n = 0; const keep = [];
      for (const id of g.dirtyList) { if (this.ids && !this.ids.has(id)) { g.meshDirty[id] = 0; continue; } if (n < budget) { g.meshDirty[id] = 0; this.remesh(id); n++; } else keep.push(id); }
      g.dirtyList.length = 0; for (const id of keep) g.dirtyList.push(id);
      for (const id of g.densList) g.densDirty[id] = 0; g.densList.length = 0;
      return keep.length;
    }
    dispose() { for (const l of this.meshes.values()) for (const m of l) m.geometry.dispose(); this.group.parent.remove(this.group); }
  }
  let view = null; const bodyViews = new Map(); const bodyRoot = new THREE.Group(); scene.add(bodyRoot);
  function regionIds(grid) {
    const ids = new Set(); const c0 = (OX - 8) >> 5; const c1 = (OX + NX + 8) >> 5; const z0 = (OZ - 8) >> 5; const z1 = (OZ + NZ + 8) >> 5; const y1 = (GY + NY + 8) >> 5;
    for (let y = 0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = c0; x <= c1; x++) ids.add(x + grid.cx * (z + grid.cz * y));
    return ids;
  }
  world.hooks.bodyAdded = (b) => { const v = new View(b.grid, bodyRoot, matBody, null); v.group.matrixAutoUpdate = false; for (let id = 0; id < b.grid.nChunks; id++) if (b.grid.count[id]) v.remesh(id); b.grid.dirtyList.length = 0; b.grid.meshDirty.fill(0); bodyViews.set(b, v); pose(b, v); };
  world.hooks.bodyRemoved = (b) => { const v = bodyViews.get(b); if (v) { v.dispose(); bodyViews.delete(b); } };
  function pose(b, v) {
    const R = b.R; const m = v.group.matrix.elements; const ox = (b.o[0] * 10 - OX) * S + rx0; const oy = (b.o[1] * 10 - GY) * S; const oz = (b.o[2] * 10 - OZ) * S + rz0;
    m[0] = R[0] * S; m[1] = R[3] * S; m[2] = R[6] * S; m[3] = 0; m[4] = R[1] * S; m[5] = R[4] * S; m[6] = R[7] * S; m[7] = 0; m[8] = R[2] * S; m[9] = R[5] * S; m[10] = R[8] * S; m[11] = 0; m[12] = ox; m[13] = oy; m[14] = oz; m[15] = 1;
    v.group.matrixWorldNeedsUpdate = true;
  }
  // debris cubes of the lab sim
  const DCAP = X.low ? 900 : X.q === 'high' ? 5000 : 2600;
  const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), DCAP); deb.frustumCulled = false; deb.count = 0; deb.name = 'vox-street-debris'; deb.castShadow = false;
  deb.setColorAt(0, new THREE.Color(1, 1, 1)); deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(deb);
  const dm = new THREE.Matrix4(); const dq = new THREE.Quaternion(); const dp = new THREE.Vector3(); const ds = new THREE.Vector3(); const dc = new THREE.Color();
  function drawDebris() {
    const D = world.d; const n = Math.min(D.n, DCAP); const stride = D.n > DCAP ? D.n / DCAP : 1;
    for (let j = 0; j < n; j++) {
      const i = Math.floor(j * stride); const s = D.size[i] * 10 * S;
      dm.compose(dp.set(wx(D.px[i] * 10), wy(D.py[i] * 10), wz(D.pz[i] * 10)), dq.set(D.q[i * 4], D.q[i * 4 + 1], D.q[i * 4 + 2], D.q[i * 4 + 3]), ds.set(s, s, s)); deb.setMatrixAt(j, dm);
      deb.setColorAt(j, dc.setHex(hexOf[D.mat[i]]));
    }
    deb.count = n; deb.instanceMatrix.needsUpdate = true; if (deb.instanceColor) deb.instanceColor.needsUpdate = true;
  }
  // ambient occlusion volume: the share of each 2-voxel cell that is solid (only the cells that changed are recounted)
  function updateAo() {
    if (!useAo || dx1 < 0) return; const g = world.grid;
    const c0 = Math.max(0, ((dx0 - OX) >> 1) - 1); const c1 = Math.min(ax - 1, ((dx1 - OX) >> 1) + 1); const e0 = Math.max(0, ((dz0 - OZ) >> 1) - 1); const e1 = Math.min(az - 1, ((dz1 - OZ) >> 1) + 1);
    const y0 = Math.max(0, ((dy0 - GY + 2) >> 1) - 1); const y1 = Math.min(ay - 1, ((dy1 - GY + 2) >> 1) + 1);
    for (let y = y0; y <= y1; y++) for (let z = e0; z <= e1; z++) for (let x = c0; x <= c1; x++) {
      let n = 0; const X0 = OX + x * 2; const Y0 = GY - 2 + y * 2; const Z0 = OZ + z * 2;
      for (let q = 0; q < 8; q++) { const m = g.get(X0 + (q & 1), Y0 + ((q >> 1) & 1), Z0 + (q >> 2)); if (m && !MT.isTransparent[m]) n++; }
      aoData[x + ax * (y + ay * z)] = n * 31;
    }
    aoTex.needsUpdate = true;
  }

  // ---- signs: they keep their painted text as ordinary boxes and drop when the wall behind them is gone ----
  const signObjs = [];
  function buildSigns() {
    for (const s of signObjs) scene.remove(s.g); signObjs.length = 0;
    for (const b of signs) {
      const B = new BZ.Builder('voxsign'); B.box(b.min, b.max, b.mats, b.opt); const g = B.build({ cast: false, recv: true }); scene.add(g);
      const o = { g, b, n0: 0 }; o.n0 = behind(o); signObjs.push(o);
    }
  }
  function behind(o) { // solid voxels in the sign's box grown by 0.25 m
    const b = o.b; let n = 0; const g = world.grid;
    for (let y = Math.floor(vy(b.min[1])); y <= Math.floor(vy(b.max[1])); y++) for (let z = Math.floor(vz(b.min[2] - 0.25)); z <= Math.floor(vz(b.max[2] + 0.25)); z++) for (let x = Math.floor(vx(b.min[0] - 0.25)); x <= Math.floor(vx(b.max[0] + 0.25)); x++) if (g.get(x, y, z)) n++;
    return n;
  }
  function checkSigns() {
    for (const o of signObjs) {
      if (!o.g.visible || behind(o) > o.n0 * 0.45) continue; o.g.visible = false;
      const c = new THREE.Vector3((o.b.min[0] + o.b.max[0]) / 2, (o.b.min[1] + o.b.max[1]) / 2, (o.b.min[2] + o.b.max[2]) / 2);
      G.fx.chunks(c, 8, [BZ.mat('metal_dark', { vc: true })], new THREE.Vector3(0, 0.3, 1), 1.4, true);
    }
  }

  // ---- collision boxes and walk grids from the voxels ----
  const CS = Math.round(0.2 / S); const CW = Math.ceil(NX / CS); const CD = Math.ceil(NZ / CS); const sig = new Array(CW * CD).fill(''); const runs = new Array(CW * CD).fill(null);
  let voxSolids = []; const stat = { solids: 0, rebuilds: 0, rebuildMs: 0, cmds: 0, desync: 0, digestOk: 0, digestBad: 0, ticks: 0, chips: 0 };
  function column(cx, cz) {
    const g = world.grid; const r = []; let start = -1; const need = CS * CS / 2; const minRun = S < 0.15 ? 2 : 1;
    for (let y = GY; y <= GY + NY; y++) {
      let n = 0; if (y < GY + NY) for (let q = 0; q < CS * CS; q++) if (g.get(OX + cx * CS + (q % CS), y, OZ + cz * CS + ((q / CS) | 0))) n++;
      if (n >= need) { if (start < 0) start = y; } else if (start >= 0) { if (y - start >= minRun) r.push(start - GY, y - GY); start = -1; }
    }
    runs[cx + CW * cz] = r; sig[cx + CW * cz] = r.join(',');
  }
  function rebuildSolids() {
    const t0 = performance.now();
    const c0 = Math.max(0, Math.floor((dx0 - OX) / CS)); const c1 = Math.min(CW - 1, Math.floor((dx1 - OX) / CS)); const e0 = Math.max(0, Math.floor((dz0 - OZ) / CS)); const e1 = Math.min(CD - 1, Math.floor((dz1 - OZ) / CS));
    for (let cz = e0; cz <= e1; cz++) for (let cx = c0; cx <= c1; cx++) column(cx, cz);
    for (const s of voxSolids) W.removeSolid(s); voxSolids = [];
    // merge equal neighbouring columns into rectangles (rows first, then stack rows that match)
    const used = new Uint8Array(CW * CD);
    for (let cz = 0; cz < CD; cz++) for (let cx = 0; cx < CW; cx++) {
      const i = cx + CW * cz; const sg = sig[i]; if (!sg || used[i]) continue;
      let w = 1; while (cx + w < CW && !used[i + w] && sig[i + w] === sg) w++;
      let d = 1; outer: for (; cz + d < CD; d++) for (let k = 0; k < w; k++) if (used[i + k + CW * d] || sig[i + k + CW * d] !== sg) break outer;
      for (let b = 0; b < d; b++) for (let k = 0; k < w; k++) used[i + k + CW * b] = 1;
      const r = runs[i];
      for (let q = 0; q < r.length; q += 2) {
        const s = { min: [rx0 + cx * CS * S, r[q] * S, rz0 + cz * CS * S], max: [rx0 + (cx + w) * CS * S, r[q + 1] * S, rz0 + (cz + d) * CS * S], tag: 'stone', vox: true };
        if (s.max[1] < 0.5) s.noGrid = true; // low rubble: bodies step over it, the walk grid ignores it
        W.addSolid(s); voxSolids.push(s);
      }
    }
    W.rebuildGrids(); unstick(); checkSigns();
    stat.solids = voxSolids.length; stat.rebuilds++; stat.rebuildMs = +(performance.now() - t0).toFixed(1);
  }
  // rubble that came down on somebody lifts them on top of it instead of trapping them inside
  const umin = [0, 0, 0]; const umax = [0, 0, 0];
  function unstick() {
    const lift = (pos, r, h) => {
      if (pos.x < rx0 || pos.x > rx1 || pos.z < rz0 || pos.z > rz1) return;
      for (let i = 0; i < 6; i++) { umin[0] = pos.x - r; umin[1] = pos.y + 0.02; umin[2] = pos.z - r; umax[0] = pos.x + r; umax[1] = pos.y + h; umax[2] = pos.z + r; const s = W.overlaps(umin, umax); if (!s || !s.vox || s.max[1] - pos.y > 1.6) return; pos.y = s.max[1] + 0.01; }
    };
    lift(G.player.pos, 0.3, 1.7); for (const z of G.zombies.list) if (z.alive && !z.T.fly) lift(z.pos, 0.3 * z.T.scale, 1.6);
  }
  // exact ray against the voxels (world.js calls this from its raycast)
  const hitS = { vox: true, tag: 'stone', min: [0, 0, 0], max: [0, 0, 0] };
  function ray(o, d, maxT) {
    let t0 = 0; let t1 = maxT;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, rx0, rx1], [o.y, d.y, 0, ry1 + 2], [o.z, d.z, rz0, rz1]]) { if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; } let a = (lo - oo) / dd; let b = (hi - oo) / dd; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return null; }
    const sx = o.x + d.x * t0; const sy = o.y + d.y * t0; const sz = o.z + d.z * t0;
    const h = world.raycast(vx(sx) * 0.1, vy(sy) * 0.1, vz(sz) * 0.1, d.x, d.y, d.z, (t1 - t0) * K + 0.05);
    if (!h || h.y < GY) return null;
    const cls = MT.audioClass[h.m] || 'stone'; hitS.tag = TAG[cls] || 'stone'; hitS.m = h.m; hitS.surface = SURF[cls] || 'stone';
    return { t: t0 + h.t / K, normal: [h.nx, h.ny, h.nz], tag: hitS.tag, s: hitS };
  }
  W.setVoxRay(ray);
  // top of the voxels under a point, for the shared debris pool
  function topAt(x, z, y) { if (x < rx0 || x > rx1 || z < rz0 || z > rz1) return 0; const t = world.groundY(Math.floor(vx(x)), Math.floor(vz(z)), Math.min(WY - 1, Math.floor(vy(y)) + 1)); return Math.max(0, wy(t)); }

  // ---- commands: the only way the block changes ----
  const host = () => !(G.coop && G.coop.guest);
  let log = []; let applied = 0; let water = 0; let tail = 0; let acc = 0; let beat = 0; let idleBeat = 0; let askT = 0; let wasActive = false; let chipBudget = 0; let synced = false; let hostN = 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  function apply(c, local) {
    const [kind, x, y, z, r, p] = c; const lx = vx(x) * 0.1; const ly = vy(y) * 0.1; const lz = vz(z) * 0.1;
    if (kind === 1) world.explode(lx, ly, lz, r * K, p, 0); else world.carve(lx, ly, lz, r * K, p, { keepGround: true, debris: 0.5, dust: 0 });
    tail = kind === 1 ? 90 : 20; stat.cmds++;
    const at = new THREE.Vector3(x, y, z);
    if (kind === 1) { if (X.fx && X.fx.blast) X.fx.blast({ point: at, r, power: p }); if (X.audio && X.audio.blast) X.audio.blast({ point: at, r, power: p }); }
    else if (!local) { if (X.fx && X.fx.impact) X.fx.impact({ point: at, normal: [0, 1, 0], dir: new THREE.Vector3(0, -1, 0), surface: 'stone', color: 0x9a948a, power: 0.3 }); }
  }
  function command(kind, x, y, z, r, p, local) { // host only
    const c = [kind, r2(x), r2(y), r2(z), r2(r), r2(p), world.step]; apply(c, local); log.push(c); applied = log.length;
    if (G.coop && G.coop.host) G.coop.events.push({ k: 'vx', e: { c, n: log.length } });
  }
  const near = (at, r) => at.x > rx0 - r && at.x < rx1 + r && at.z > rz0 - r && at.z < rz1 + r && at.y < ry1 + r;
  function blast(at, r, dmg) {
    if (!near(at, r * 0.5)) return false;
    const rr = BZ.clamp(r * 0.45, 0.8, 3.2); const p = BZ.clamp(dmg / 200, 0.75, 1.5);
    if (host()) command(1, at.x, Math.max(0.3, at.y), at.z, rr, p); else G.coop.act({ k: 'vx', b: [r2(at.x), r2(Math.max(0.3, at.y)), r2(at.z), r2(rr), r2(p)] });
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
    if (host()) command(0, x, y, z, r, p, true); else G.coop.act({ k: 'vx', h: [r2(x), r2(y), r2(z), r2(r), r2(p)] });
  }
  // a guest asks the host (a shot, a blast, or the commands it is missing)
  function act(x) {
    if (!host()) return;
    if (x.h) command(0, ...x.h); else if (x.b) command(1, ...x.b);
    else if (x.need !== undefined && G.coop.events) G.coop.events.push({ k: 'vx', e: { from: x.need, log: log.slice(x.need, x.need + 400), n: log.length } });
  }
  // host -> guest
  function remote(e) {
    if (host()) return;
    if (e.reset) { reset(); synced = true; return; }
    if (!synced) { synced = true; if (world.step || log.length) reset(); } // whatever this page did on its own before joining is dropped
    if (e.n !== undefined) hostN = Math.max(hostN, e.n);
    if (e.c && e.n === log.length + 1) log.push(e.c);
    if (e.log && e.from <= log.length) for (let i = log.length - e.from; i < e.log.length; i++) log.push(e.log[i]);
    if (e.w !== undefined) water = Math.max(water, e.w);
    if (e.n !== undefined && e.n > log.length && askT <= 0) { askT = 0.6; G.coop.act({ k: 'vx', need: log.length }); }
    if (e.d !== undefined && e.n === applied && applied === log.length && world.step === e.w) { if (digest() === e.d) stat.digestOk++; else { stat.digestBad++; if (stat.digestBad === 1) console.error('[vox] street digest differs from the host at step ' + world.step); } }
  }
  const active = () => tail > 0 || world.d.n > 0 || world.bodies.list.length > 0 || world.nSeeds > 0 || world.fuses.length > 0 || world.structures.some((s) => s.anyDirty);
  const digest = () => world.digest();
  function tick() { world.tick(); if (tail > 0) tail--; stat.ticks++; }
  function sim(dt) {
    chipBudget = Math.min(6, chipBudget + dt * 24); askT -= dt;
    if (host()) {
      acc = Math.min(acc + dt, 4 / 60); const a = active();
      while (acc >= 1 / 60) { acc -= 1 / 60; if (active()) tick(); }
      if (G.coop && G.coop.host) {
        beat -= dt; idleBeat -= dt;
        if (a && beat <= 0) { beat = 0.2; G.coop.events.push({ k: 'vx', e: { w: world.step, n: log.length } }); }
        if (!active() && (wasActive || idleBeat <= 0)) { idleBeat = 3; G.coop.events.push({ k: 'vx', e: { w: world.step, n: log.length, d: digest() } }); }
        wasActive = active();
      }
    } else {
      // replay: run up to the step each command was made at, apply it, and never pass the host's last known step
      let budget = 600;
      while (applied < log.length && budget > 0) { const c = log[applied]; if (world.step < c[6]) { tick(); budget--; continue; } if (world.step > c[6]) stat.desync++; apply(c, false); applied++; }
      if (applied >= log.length && log.length >= hostN) { let n = world.step < water - 30 ? 40 : 4; while (world.step < water && n-- > 0) tick(); }
    }
  }
  function reset() {
    for (const [b, v] of bodyViews) v.dispose(); bodyViews.clear();
    build(); log = []; applied = 0; water = 0; hostN = 0; tail = 0; acc = 0; sig.fill(''); runs.fill(null);
    if (view) view.dispose(); view = new View(world.grid, root, matWorld, regionIds(world.grid)); view.drain(1e9);
    buildSigns(); updateAo(); rebuildSolids(); changed = false; dx1 = dz1 = dy1 = -1; dx0 = dz0 = dy0 = 1e9;
    if (G.coop && G.coop.host) G.coop.events.push({ k: 'vx', e: { reset: 1 } });
  }
  const built = build(); view = new View(world.grid, root, matWorld, regionIds(world.grid)); view.drain(1e9); buildSigns(); updateAo(); rebuildSolids(); changed = false; dx1 = dz1 = dy1 = -1; dx0 = dz0 = dy0 = 1e9;
  G.events.on('game:new', () => { if (log.length || world.step) reset(); });

  // ---- the game's damage entry points ----
  const D = G.destruct; const hit0 = D.hit; const blast0 = D.blast;
  D.hit = (solid, at, dmg, dir) => { if (solid && solid.vox) return chip(solid, at, dmg, dir); return hit0(solid, at, dmg, dir); };
  D.blast = (at, r, dmg) => { blast0(at, r, dmg); if (dmg > 0) blast(at, r, dmg); };

  let solidT = 0; const evP = new THREE.Vector3();
  function update(dt) {
    sim(dt);
    // what the sim reported this frame: sound and dust
    if (world.events.length) {
      for (const e of world.events) {
        evP.set(wx(e.x * 10), wy(e.y * 10), wz(e.z * 10)); const cls = MT.audioClass[e.mat] || 'stone';
        if (X.audio && X.audio.event) X.audio.event({ kind: e.kind, x: evP.x, y: evP.y, z: evP.z, mag: e.mag, mat: e.mat, a: e.a, b: e.b });
        if (e.kind === 'detach' || e.kind === 'fracture') { if (X.fx && X.fx.collapse) X.fx.collapse({ point: evP.clone(), n: e.mag }); }
        else if (e.kind === 'rubble') { if (X.fx && X.fx.debrisLand) X.fx.debrisLand({ point: evP.clone(), n: e.mag, color: hexOf[e.mat] }); }
        else if (e.kind === 'glass' && !V.want('audio')) G.audio.playAt('glass', evP, { gain: 0.8, rate: 0.9 + (e.mag % 5) * 0.05 });
        else if (e.kind === 'impact' && e.mag > 40) { const pd = G.player.pos.distanceTo(evP); if (pd < 20) G.player.shake.v += Math.min(3, e.mag / 400) * (1 - pd / 20); }
        void cls;
      }
      world.events.length = 0;
    }
    view.drain(X.low ? 4 : 10);
    for (const [b, v] of bodyViews) { if (b.grid.dirtyList.length) v.drain(4); pose(b, v); }
    drawDebris();
    solidT -= dt;
    if (changed && solidT <= 0) { solidT = 0.35; updateAo(); rebuildSolids(); changed = false; dx1 = dz1 = dy1 = -1; dx0 = dz0 = dy0 = 1e9; }
  }
  return { update, world, blast, chip, act, remote, reset, digest, topAt, ray, command, S, built,
    region: { x0: rx0, z0: rz0, x1: rx1, z1: rz1, y1: ry1 }, log: () => log, stat,
    debug: () => ({ ...stat, S, voxels: built, solid: world.grid.solid, quads: view.quads, chunks: view.meshes.size, bodies: world.bodies.list.length, debris: world.d.n, step: world.step, log: log.length, applied, digest: digest(), active: active() }) };
});
