// Blockade Z voxel cast (data/bz-cast.js, written by tools/bake-bz.js from the running game) -> animated voxel actors.
// Each character is a node tree (rest transforms), voxel parts hung on nodes (RLE grids of palette colours, the game's
// own voxelize.js output) and clips of local node transforms sampled from the game's animation code. The parts are
// re-meshed here with vox/voxelizer.js meshModel (greedy + AO), one geometry per character, one bone per node that
// carries voxels, and drawn with the same voxel material as the chibi cast.
import { THREE } from '../lib/lf-host.js';
import { meshModel, packMatrix } from './voxelizer.js';
import { makeVoxMaterial, makeVoxDepth } from './material.js';

export async function loadCast() {
  const m = await import('../data/bz-cast.js');
  return m.BZ_CAST;
}

const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const EMIS = 1 << 25;
function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function rleDecode(s, n) {
  const u = b64(s), d = new DataView(u.buffer), out = new Uint16Array(n); let o = 0;
  for (let i = 0; i + 3 < u.length; i += 4) { const c = d.getUint16(i, true), v = d.getUint16(i + 2, true); if (v) out.fill(v, o, o + c); o += c; }
  return out;
}
function i16(s) { const u = b64(s); return new Int16Array(u.buffer, u.byteOffset, u.byteLength >> 1); }

// one character's geometry, decoded once
const GEO = new Map();
// halve a part grid (2x2x2 -> 1): solid when at least 3 of 8 are, colour of the highest solid sub-voxel (what you see from above/front)
function halve(q) {
  const nx = Math.ceil(q.nx / 2), ny = Math.ceil(q.ny / 2), nz = Math.ceil(q.nz / 2), n = nx * ny * nz, occ = new Uint8Array(n), col = new Float32Array(n * 3), emis = new Float32Array(n);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    let cnt = 0, pick = -1;
    for (let dy = 1; dy >= 0; dy--) for (let dz = 1; dz >= 0; dz--) for (let dx = 0; dx < 2; dx++) {
      const X = x * 2 + dx, Y = y * 2 + dy, Z = z * 2 + dz; if (X >= q.nx || Y >= q.ny || Z >= q.nz) continue;
      const i = X + q.nx * (Z + q.nz * Y); if (q.occ[i]) { cnt++; if (pick < 0) pick = i; }
    }
    if (cnt < 3) continue; const o = x + nx * (z + nz * y); occ[o] = 1;
    col[o * 3] = q.col[pick * 3]; col[o * 3 + 1] = q.col[pick * 3 + 1]; col[o * 3 + 2] = q.col[pick * 3 + 2]; emis[o] = q.emis[pick];
  }
  return Object.assign({}, q, { nx, ny, nz, size: q.size * 2, occ, col, emis });
}
function castGeometry(c, coarse = 1) {
  const gk = c.id + '@' + coarse; let g = GEO.get(gk); if (g) return g;
  const boneOfNode = new Map(), parts = [];
  // nodes no clip moves are folded into the nearest moving ancestor (bosses: 60-115 part nodes -> 24-36 bones)
  const moving = new Set([0]); for (const k in c.clips || {}) for (const n of c.clips[k].nodes) moving.add(n);
  const local = (n) => new THREE.Matrix4().compose(new THREE.Vector3().fromArray(c.nodes[n].p), new THREE.Quaternion().fromArray(c.nodes[n].q), new THREE.Vector3().fromArray(c.nodes[n].s));
  for (const p of c.parts) {
    let bn = p.node, M = p.m ? new THREE.Matrix4().fromArray(p.m) : new THREE.Matrix4();
    while (!moving.has(bn)) { M.premultiply(local(bn)); bn = c.nodes[bn].parent; }
    if (!boneOfNode.has(bn)) boneOfNode.set(bn, boneOfNode.size);
    const n = p.nx * p.ny * p.nz, idx = rleDecode(p.rle, n), occ = new Uint8Array(n), col = new Float32Array(n * 3), em = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = idx[i]; if (!k) continue; const v = p.pal[k]; occ[i] = 1; // pal[0] = empty
      col[i * 3] = S2L[(v >> 16) & 255]; col[i * 3 + 1] = S2L[(v >> 8) & 255]; col[i * 3 + 2] = S2L[v & 255]; em[i] = v & EMIS ? 1 : 0;
    }
    const part = { bone: boneOfNode.get(bn), x0: 0, y0: 0, z0: 0, nx: p.nx, ny: p.ny, nz: p.nz, size: p.vs, ox: p.ox, oy: p.oy, oz: p.oz, m: M, occ, col, emis: em };
    parts.push(coarse > 1 && !p.surface ? halve(part) : part);
  }
  const vs = coarse * c.parts.reduce((a, p) => a + p.vs, 0) / Math.max(1, c.parts.length);
  const geo = meshModel({ size: vs, ox: 0, oy: 0, oz: 0, parts, vox: c.vox || 0 }, { sphereK: 1.3 });
  // the vertices sit in their bone's frame: bounds for culling and fitting come from the rest pose in the character's frame
  {
    const world = c.nodes.map(() => null), W = (n) => world[n] || (world[n] = c.nodes[n].parent < 0 ? local(n) : W(c.nodes[n].parent).clone().multiply(local(n)));
    const mats = [...boneOfNode.keys()].map((n) => W(n)), pos = geo.attributes.position, bone = geo.attributes.aBone, v = new THREE.Vector3(), bb = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) bb.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mats[bone.getX(i)]));
    geo.boundingBox = bb; geo.boundingSphere = bb.getBoundingSphere(new THREE.Sphere()); geo.boundingSphere.radius *= 1.35;
  }
  g = { geo, vs, bones: [...boneOfNode.keys()], vox: parts.reduce((a, p) => a + p.occ.reduce((s, x) => s + x, 0), 0) };
  geo.userData.vox = g.vox;
  // clips: decode once
  g.clips = {};
  for (const k in c.clips || {}) { const cl = c.clips[k]; g.clips[k] = { fps: cl.fps, frames: cl.frames, loop: cl.loop !== false, nodes: cl.nodes, d: i16(cl.data) }; }
  GEO.set(gk, g);
  return g;
}

const MODE_CLIP = { idle: ['idle'], ready: ['ready', 'idle'], walk: ['walk', 'idle'], run: ['run', 'walk', 'idle'], attack: ['attack', 'idle'], hit: ['hit', 'idle'], death: ['death', 'idle'] };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

export class CastActor {
  constructor(c, o = {}) {
    this.c = c; this.def = { id: c.id, name: c.name, speedK: 1 }; this.n = null;
    const g = this.g = castGeometry(c, o.coarse || 1); this.n = o.coarse > 1 ? 16 : 32;
    const maxB = g.bones.length <= 32 ? 32 : g.bones.length <= 64 ? 64 : 96;
    this.mat = makeVoxMaterial({ size: g.vs, maxBones: maxB });
    this.mat.userData.u.uDisH.value = c.height || 2;
    this.mesh = new THREE.Mesh(g.geo, this.mat); this.mesh.customDepthMaterial = makeVoxDepth(this.mat, maxB);
    this.mesh.castShadow = o.shadows !== false;
    // node tree with rest transforms; the mesh itself does not live in it (it is skinned by bone uniforms)
    this.nodes = c.nodes.map((n) => { const o3 = new THREE.Object3D(); o3.position.fromArray(n.p); o3.quaternion.fromArray(n.q); o3.scale.fromArray(n.s); o3.matrixAutoUpdate = true; return o3; });
    this.rest = c.nodes.map((n) => ({ p: n.p, q: n.q, s: n.s }));
    c.nodes.forEach((n, i) => { if (n.parent >= 0) this.nodes[n.parent].add(this.nodes[i]); });
    this.top = this.nodes[0];
    this.root = new THREE.Group(); this.root.add(this.mesh);
    this.mode = 'idle'; this.t = (o.t0 || 0) * 0.37; this.clip = null; this.pose();
  }
  tris() { return this.g.geo.userData.tris; }
  vox() { return this.g.vox; }
  draws() { return 1; }
  setMode(m) {
    this.mode = m; this.t = 0; this.mat.userData.u.uDissolve.value = 0; this.hitT = 0;
    const names = MODE_CLIP[m] || ['idle']; this.clip = null; this.rate = 1;
    for (const k of names) if (this.g.clips[k]) { this.clip = this.g.clips[k]; this.clipName = k; break; }
    if (m === 'run' && this.clipName === 'walk') this.rate = 1.8;
    // back to rest for nodes the new clip does not drive
    this.nodes.forEach((o3, i) => { const r = this.rest[i]; o3.position.fromArray(r.p); o3.quaternion.fromArray(r.q); o3.scale.fromArray(r.s); });
  }
  update(dt) {
    this.t += dt * (this.rate || 1); const u = this.mat.userData.u;
    const cl = this.clip;
    if (cl && cl.frames > 0) {
      const dur = cl.frames / cl.fps; let t = this.t;
      if (cl.loop) t = t % dur; else t = Math.min(t, dur - 1e-4);
      const f = t * cl.fps, f0 = Math.floor(f) % cl.frames, f1 = cl.loop ? (f0 + 1) % cl.frames : Math.min(cl.frames - 1, f0 + 1), a = f - Math.floor(f), nn = cl.nodes.length, D = cl.d;
      for (let k = 0; k < nn; k++) {
        const o3 = this.nodes[cl.nodes[k]]; if (!o3) continue; const i0 = (f0 * nn + k) * 10, i1 = (f1 * nn + k) * 10;
        o3.position.set((D[i0] + (D[i1] - D[i0]) * a) / 2000, (D[i0 + 1] + (D[i1 + 1] - D[i0 + 1]) * a) / 2000, (D[i0 + 2] + (D[i1 + 2] - D[i0 + 2]) * a) / 2000);
        _q.set(D[i0 + 3] / 32767, D[i0 + 4] / 32767, D[i0 + 5] / 32767, D[i0 + 6] / 32767).normalize(); _q2.set(D[i1 + 3] / 32767, D[i1 + 4] / 32767, D[i1 + 5] / 32767, D[i1 + 6] / 32767).normalize();
        o3.quaternion.slerpQuaternions(_q, _q2, a);
        o3.scale.set((D[i0 + 7] + (D[i1 + 7] - D[i0 + 7]) * a) / 1000, (D[i0 + 8] + (D[i1 + 8] - D[i0 + 8]) * a) / 1000, (D[i0 + 9] + (D[i1 + 9] - D[i0 + 9]) * a) / 1000);
      }
    }
    if (this.mode === 'hit') { this.hitT -= dt; if (this.hitT <= 0) { this.hitT = cl ? Math.max(0.6, cl.frames / cl.fps) : 1.2; this.t = 0; u.uFlash.value.setRGB(0.35, 0.25, 0.2); } u.uFlash.value.multiplyScalar(Math.exp(-dt * 9)); }
    if (this.mode === 'death') {
      const dur = cl ? cl.frames / cl.fps : 1;
      u.uDissolve.value = Math.min(1, Math.max(0, (this.t - dur - 0.4) / 1.4));
      if (this.t > dur + 2.2) this.setMode('death');
    }
    this.pose();
  }
  pose() {
    this.top.updateMatrixWorld(true);
    _inv.copy(this.top.parent ? this.top.parent.matrixWorld : _m.identity()).invert();
    const B = this.mat.userData.u.uB.value;
    this.g.bones.forEach((ni, b) => { _m.multiplyMatrices(_inv, this.nodes[ni].matrixWorld); packMatrix(_m, b, B); });
  }
  dispose() { this.mat.dispose(); }
}
