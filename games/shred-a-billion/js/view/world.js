// Static hall: transform every renderer to world space, tessellate, bake URP-style vertex light,
// and merge per material (1290 Unity renderers -> ~100 draw calls).
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { tessellate, bakedMaterial } from './lighting.js';

export function buildStatic(slice, field, { maxEdge = 1.2, skip = () => false, keepDynamic = () => false } = {}) {
  const byMat = new Map();
  const dynamic = [];
  for (const mesh of slice.group.children) {
    const path = mesh.userData.path;
    if (skip(path)) continue;
    if (keepDynamic(path)) { dynamic.push(mesh); continue; }
    let g = mesh.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(mesh.matrix);
    // negative-determinant matrices flip winding
    if (mesh.matrix.determinant() < 0) { g = g.index ? g.toNonIndexed() : g; flipWinding(g); }
    g = tessellate(g, maxEdge);
    field.bake(g);
    const m = mesh.material;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  }
  const group = new THREE.Group();
  for (const [m, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bakedMaterial(m));
    mesh.matrixAutoUpdate = false;
    mesh.name = 'static:' + m.name;
    group.add(mesh);
  }
  return { group, dynamic };
}

function flipWinding(g) {
  const p = g.attributes.position.array;
  const attrs = Object.values(g.attributes);
  for (let t = 0; t < g.attributes.position.count; t += 3) {
    for (const a of attrs) {
      const s = a.itemSize, arr = a.array;
      for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
    }
  }
  return p;
}
