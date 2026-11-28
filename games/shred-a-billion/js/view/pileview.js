// Draws the money pile: per 16x16-cell chunk an underlay heightfield (MoneyUnderlay texture, underlayTile 2 m)
import { V } from '../rev.js';
// and, near the camera, the real bundle meshes (MoneyPile.visuals/looks) merged into one geometry per chunk.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { NX, NZ, OX, OZ, CELL, T, hash3 } from '../sim/pile.js';
import { buildMaterial } from './scenegraph.js';

const CH = 16, NCH = 9;

export class PileView {
  constructor(field, light, opts = {}) {
    this.f = field; this.light = light;
    this.group = new THREE.Group();
    this.chunks = new Array(NCH * NCH).fill(null);
    this.itemsNear = opts.itemsNear ?? 26;      // m: chunks closer than this get real bundle meshes
    this.perCell = opts.perCell ?? 2;          // MoneyPile.drawnNotes = 3 in the original; 2 keeps phones fast
    this.budget = opts.rebuildsPerFrame ?? 3;
    this.eye = new THREE.Vector3();
  }

  async load(base) {
    const meta = await fetch(base + 'items.json' + V).then(r => r.json());
    const gltf = await new GLTFLoader().loadAsync(base + 'items.glb' + V);
    this.meta = meta;
    const geoByMesh = {};
    for (const ch of gltf.scene.children) {
      const idx = +ch.name.slice(1);
      const m = ch.isMesh ? ch : ch.children.find(o => o.isMesh);
      if (m) geoByMesh[idx] = m.geometry;
    }
    this.vis = meta.visuals.map(v => ({ ...v, geo: geoByMesh[v.mesh] }));
    const P = meta.pile;
    this.P = P;
    // looks per tier (lookOfTier) -> cumulative weights
    this.looks = P.looks.map(l => ({ ...l, cum: l.weights.reduce((a, w, i) => (a.push((a[i - 1] || 0) + w), a), []) }));
    const mats = meta.materials.map(m => buildMaterial(base, m));
    const bundleMat = mats[this.vis[5].mat];
    this.itemMat = new THREE.MeshBasicMaterial({ map: bundleMat.map, vertexColors: true, fog: true });
    // gilded bundles use MoneyPile.giltMaterial (gold-printed bills)
    const gm = meta.extra && meta.extra.giltMaterial != null ? mats[meta.extra.giltMaterial] : null;
    this.giltMat = new THREE.MeshBasicMaterial({ map: gm && gm.map ? gm.map : bundleMat.map, color: gm && gm.map ? 0xffffff : 0xffc040, vertexColors: true, fog: true });
    const under = mats[meta.extra.underlayMaterial];
    const utex = under.map; utex.wrapS = utex.wrapT = THREE.RepeatWrapping; utex.repeat.set(1, 1);
    this.underMat = new THREE.MeshBasicMaterial({ map: utex, vertexColors: true, fog: true });
    // precompute per-visual geometry arrays
    for (const v of this.vis) {
      if (!v.geo) continue;
      const g = v.geo;
      v.P = g.attributes.position.array; v.N = g.attributes.normal ? g.attributes.normal.array : null;
      v.U = g.attributes.uv ? g.attributes.uv.array : null; v.I = g.index ? g.index.array : null;
      v.nv = g.attributes.position.count;
    }
    this.tierTint = this.looks.map(l => [l.tint.r, l.tint.g, l.tint.b]);
    return this;
  }

  chunkCenter(i) {
    const cx = i % NCH, cz = (i / NCH) | 0;
    return [OX + (cx * CH + CH / 2) * CELL, -(OZ + (cz * CH + CH / 2) * CELL)];
  }

  update(eye) {
    this.eye.copy(eye);
    const f = this.f;
    // near/far state changes also need a rebuild
    for (let i = 0; i < NCH * NCH; i++) {
      const [x, z] = this.chunkCenter(i);
      const near = Math.hypot(x - eye.x, z - eye.z) < this.itemsNear + CH * CELL * 0.7;
      const ch = this.chunks[i];
      if (!ch || ch.near !== near) f.dirty.add(i);
    }
    if (!f.dirty.size) return 0;
    // closest dirty chunks first
    const list = [...f.dirty].sort((a, b) => {
      const [ax, az] = this.chunkCenter(a), [bx, bz] = this.chunkCenter(b);
      return Math.hypot(ax - eye.x, az - eye.z) - Math.hypot(bx - eye.x, bz - eye.z);
    });
    let n = 0;
    for (const i of list) {
      if (n >= this.budget && this.chunks[i]) break;
      this.build(i); f.dirty.delete(i); n++;
    }
    return n;
  }

  build(i) {
    const f = this.f, cx0 = (i % NCH) * CH, cz0 = ((i / NCH) | 0) * CH;
    const [ccx, ccz] = this.chunkCenter(i);
    const near = Math.hypot(ccx - this.eye.x, ccz - this.eye.z) < this.itemsNear + CH * CELL * 0.7;
    let ch = this.chunks[i];
    if (!ch) { ch = this.chunks[i] = { under: null, items: null, near }; }
    ch.near = near;
    this.disposeMesh(ch, 'under'); this.disposeMesh(ch, 'items'); this.disposeMesh(ch, 'gilt');
    const under = this.buildUnder(cx0, cz0);
    if (under) { ch.under = new THREE.Mesh(under, this.underMat); ch.under.matrixAutoUpdate = false; this.group.add(ch.under); }
    if (near) {
      const items = this.buildItems(cx0, cz0, false);
      if (items) { ch.items = new THREE.Mesh(items, this.itemMat); ch.items.matrixAutoUpdate = false; this.group.add(ch.items); }
      const gilt = this.buildItems(cx0, cz0, true);
      if (gilt) { ch.gilt = new THREE.Mesh(gilt, this.giltMat); ch.gilt.matrixAutoUpdate = false; this.group.add(ch.gilt); }
    }
  }
  disposeMesh(ch, k) { if (ch[k]) { this.group.remove(ch[k]); ch[k].geometry.dispose(); ch[k] = null; } }

  // corner heights = mean of the up-to-4 money cells around the corner
  buildUnder(cx0, cz0) {
    const f = this.f, W = CH + 1;
    const H = new Float32Array(W * W), has = new Uint8Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      let s = 0, k = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x = cx0 + i + dx, z = cz0 + j + dz;
        if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
        const c = z * NX + x; if (f.count[c] <= 0) continue;
        s += f.heightQ(c) * T; k++;
      }
      if (k) { H[j * W + i] = s / k - this.P.underlayDepth; has[j * W + i] = 1; }
    }
    const pos = [], col = [], uv = [], idx = [];
    const vid = new Int32Array(W * W).fill(-1);
    const o = [0, 0, 0];
    const tile = this.P.underlayTile, shade = this.P.underlayShade;
    const vert = (i, j) => {
      const k = j * W + i; if (vid[k] >= 0) return vid[k];
      const x = OX + (cx0 + i) * CELL, uz = OZ + (cz0 + j) * CELL, y = H[k];
      // normal from neighbours
      const hx = (H[j * W + Math.min(W - 1, i + 1)] || y) - (H[j * W + Math.max(0, i - 1)] || y);
      const hz = (H[Math.min(W - 1, j + 1) * W + i] || y) - (H[Math.max(0, j - 1) * W + i] || y);
      let nx = -hx / (2 * CELL), ny = 1, nz = hz / (2 * CELL); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      this.light.at(x, y + 0.1, -uz, nx, ny, nz, o);
      const sl = 1 - this.P.slopeShade * (1 - ny) * 0.5;
      pos.push(x, y, -uz); col.push(o[0] * shade * sl, o[1] * shade * sl, o[2] * shade * sl); uv.push(x / tile, uz / tile);
      return (vid[k] = pos.length / 3 - 1);
    };
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const c = (cz0 + j) * NX + (cx0 + i);
      if (cx0 + i >= NX || cz0 + j >= NZ || f.count[c] <= 0) continue;
      const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      if (!(has[a] && has[b] && has[cc] && has[d])) continue;
      const va = vert(i, j), vb = vert(i + 1, j), vc = vert(i, j + 1), vd = vert(i + 1, j + 1);
      idx.push(va, vb, vc, vb, vd, vc);   // z flipped -> this winding faces up
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  buildItems(cx0, cz0, giltOnly = false) {
    const f = this.f, P = this.P;
    const list = [];
    let nv = 0, ni = 0;
    const per = this.perCell;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const x = cx0 + i, z = cz0 + j; if (x >= NX || z >= NZ) continue;
      const c = z * NX + x; if (f.count[c] <= 0) continue;
      if ((f.giltMask[c] > 0) !== giltOnly) continue;
      const tier = f.surfaceTier(c); const look = this.looks[P.lookOfTier[Math.max(0, tier)]];
      // slope of the cell for tilting
      const hc = f.heightQ(c) * T;
      const hx = (x + 1 < NX && f.count[c + 1] > 0 ? f.heightQ(c + 1) * T : hc) - (x > 0 && f.count[c - 1] > 0 ? f.heightQ(c - 1) * T : hc);
      const hz = (z + 1 < NZ && f.count[c + NX] > 0 ? f.heightQ(c + NX) * T : hc) - (z > 0 && f.count[c - NX] > 0 ? f.heightQ(c - NX) * T : hc);
      // a thin column (< one bundle) shows fewer items
      const k = Math.min(per, Math.max(1, Math.ceil(f.count[c] * T / 0.06)));
      for (let n = 0; n < k; n++) {
        const h1 = hash3(x, z, n * 3 + 11) / 4294967296, h2 = hash3(x, z, n * 3 + 12) / 4294967296, h3 = hash3(x, z, n * 3 + 13) / 4294967296;
        let vi = look.visuals[0]; for (let w = 0; w < look.cum.length; w++) if (h3 * look.cum[look.cum.length - 1] <= look.cum[w]) { vi = look.visuals[w]; break; }
        const v = this.vis[vi]; if (!v || !v.geo) continue;
        list.push({ x, z, n, v, h1, h2, h3, hx, hz, hc, look });
        nv += v.nv; ni += v.I ? v.I.length : v.nv;
      }
    }
    if (!list.length) return null;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let pv = 0, pi = 0;
    const o = [0, 0, 0];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), tp = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
    const tilt = P.tiltDegrees * Math.PI / 180, sc = P.itemScale;
    for (const it of list) {
      const wx = OX + (it.x + 0.15 + 0.7 * it.h1) * CELL, wuz = OZ + (it.z + 0.15 + 0.7 * it.h2) * CELL;
      // surface normal (three space): z flipped
      up.set(-it.hx / (2 * CELL), 1, it.hz / (2 * CELL)).normalize();
      const yaw = it.h3 * Math.PI * 2 + it.n;
      const prop = (hash3(it.x, it.z, it.n + 77) / 4294967296) < P.propChance * 0.5;
      const tx = (it.h1 - 0.5) * 2 * tilt + (prop ? P.propDegrees * Math.PI / 180 * (it.h2 - 0.5) : 0), tz = (it.h2 - 0.5) * 2 * tilt;
      q.setFromUnitVectors(tmp.set(0, 1, 0), up);
      const q2 = new THREE.Quaternion().setFromEuler(e.set(tx, yaw, tz));
      q.multiply(q2);
      const y = it.hc - it.v.sink + (it.n === 0 ? 0 : -0.02 * it.n) + (prop ? P.propLift * 0.05 : 0);
      tp.set(wx, y, -wuz);
      s.set(sc, sc, sc);
      m.compose(tp, q, s);
      this.light.at(wx, y + 0.1, -wuz, up.x, up.y, up.z, o);
      const vr = 1 + (it.h3 - 0.5) * it.look.variation * 2;
      const tint = it.look.tint, br = P.brightness;
      const base = pv;
      const e2 = m.elements;
      for (let k = 0; k < it.v.nv; k++) {
        const px = it.v.P[k * 3], py = it.v.P[k * 3 + 1], pz = it.v.P[k * 3 + 2];
        pos[pv * 3] = e2[0] * px + e2[4] * py + e2[8] * pz + e2[12];
        pos[pv * 3 + 1] = e2[1] * px + e2[5] * py + e2[9] * pz + e2[13];
        pos[pv * 3 + 2] = e2[2] * px + e2[6] * py + e2[10] * pz + e2[14];
        let shade = 1;
        if (it.v.N) { const ny = e2[1] * it.v.N[k * 3] + e2[5] * it.v.N[k * 3 + 1] + e2[9] * it.v.N[k * 3 + 2]; shade = 0.72 + 0.28 * Math.max(0, ny); }
        const l = shade * vr * br;
        col[pv * 3] = o[0] * l * tint.r; col[pv * 3 + 1] = o[1] * l * tint.g; col[pv * 3 + 2] = o[2] * l * tint.b;
        if (it.v.U) { uv[pv * 2] = it.v.U[k * 2]; uv[pv * 2 + 1] = it.v.U[k * 2 + 1]; }
        pv++;
      }
      if (it.v.I) for (let k = 0; k < it.v.I.length; k++) idx[pi++] = base + it.v.I[k];
      else for (let k = 0; k < it.v.nv; k++) idx[pi++] = base + k;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
