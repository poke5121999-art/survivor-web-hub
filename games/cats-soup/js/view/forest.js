// The forest clearing (D:/catsoup-ref/rules/map.md sections 1-2): ground tiles on every field cell, one edge piece per
// cell around the field chosen from its 8 neighbours, and billboard pine trees on a 1.5 grid outside both.
import * as THREE from 'three';
import { texture } from './shaders.js';

export const CELL = 1.5;
const NB = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, -1], [-1, 1]];
const PERP = [Math.PI, Math.PI * 1.5, 0, Math.PI / 2];
// Per-tree jitter by |gx + 2 gy| % 4 (GameMapManager.FillTreeRndPosScale, normal themes).
const TREE_S = [[0.45, 0.5, 0.45], [0.4, 0.45, 0.4], [0.4, 0.45, 0.4], [0.35, 0.4, 0.35]];
const TREE_P = [[-0.2, 0, 0.3], [-0.1, 0, 0.2], [-0.3, 0, 0.2], [-0.2, 0, 0.1]];

const key = (x, y) => `${x},${y}`;
// Unity cell (mx, my) -> three.js position: the exporter mirrors z.
export const cellPos = (x, y, out = new THREE.Vector3()) => out.set(x * CELL, 0, -y * CELL);

// Edge variant and rotation index for an outside cell (GameMapManager.SetEdge).
export function edgePiece(isField, x, y) {
  const C = [], D = [];
  NB.forEach(([dx, dy], i) => { if (isField(x + dx, y + dy)) (i < 4 ? C : D).push(i); });
  const n = C.length + D.length;
  if (n === 1) return D.length === 1 ? { v: 6, r: D[0] - 4 } : null;
  if (n === 2) {
    if (C.length !== 1) return null;
    const c = C[0], d = D[0] - 4;
    return { v: c <= d && d - 3 !== c ? 1 : 2, r: c };
  }
  if (n === 3) return C.length === 1 ? { v: 0, r: C[0] } : { v: 3, r: D[0] - 4 };
  if (n === 4) {
    if (C.length !== 2 || D.length !== 2) return null;
    return { v: D[0] + D[1] - 8 === C[0] + C[1] ? 5 : 4, r: C[0] === 0 && C[1] === 3 ? C[1] : C[0] };
  }
  return null;
}

export class Forest {
  // map: PrefabLib of art/map (roots: tile_base g0_0..23, edge_base g1..7, tree_far1 ...); ground: data/ground.json[theme].
  constructor(map, ground, texBase) {
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'forest';
    const keys = map.keys();
    this.tileKeys = keys.slice(0, 24);
    this.edgeKeys = keys.slice(24, 31);
    this.treeKey = keys.find(k => map.scene.nodes[map.roots.get(k).node].n === 'tree_far1');
    // Runtime ground materials (Spawn.SetThemeGround): layer 0 tiles take ground_base, tiles > 16 ground_base_2,
    // edges ground_back.
    const m0 = map.materials[0], m1 = map.materials[1];
    m0.mat.uniforms.map.value = texture(texBase, ground.base).tex;
    m1.mat.uniforms.map.value = texture(texBase, ground.back).tex;
    const layer1 = m0.mat.clone();
    layer1.uniforms = { ...m0.mat.uniforms, map: { value: texture(texBase, ground.base2).tex } };
    map.fallback = { mat: layer1, outline: m0.outline, colored: (m) => m };
  }

  // fields: cells [[x, y]...] of the current colour map; works: Map "x,y" -> baseTile index for occupied cells.
  build(fields, baseTileAt = () => null) {
    this.group.clear();
    const inField = new Set(fields.map(([x, y]) => key(x, y)));
    const isField = (x, y) => inField.has(key(x, y));
    this.fieldSet = inField;
    for (const [x, y] of fields) {
      const h = Math.abs(x + 2 * y);
      let idx = h % 2, rot = (h % 4) * Math.PI / 2;
      const bt = baseTileAt(x, y);
      if (bt != null) { idx = bt; if (idx > 6) rot = 0; }
      const t = this.map.instantiate(this.tileKeys[idx]);
      cellPos(x, y, t.position);
      t.rotation.y = -rot; // Unity yaw -> three yaw flips sign with the mirrored z
      this.group.add(t);
    }
    const edge = new Set();
    for (const [x, y] of fields) {
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (isField(nx, ny) || edge.has(k)) continue;
        edge.add(k);
        const p = edgePiece(isField, nx, ny);
        if (!p) continue;
        const e = this.map.instantiate(this.edgeKeys[p.v]);
        cellPos(nx, ny, e.position);
        e.rotation.y = -PERP[p.r];
        this.group.add(e);
      }
    }
    this.edgeSet = edge;
    this.buildTrees(fields, edge);
    return this.group;
  }

  buildTrees(fields, edge) {
    const xs = fields.map(c => c[0]), ys = fields.map(c => c[1]);
    const pad = 9;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const proto = this.map.instantiate(this.treeKey);
    const spr = proto.children[0];
    const mesh = spr.children.find(c => c.isMesh);
    const cells = [];
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        if (this.fieldSet.has(key(gx, gy)) || edge.has(key(gx, gy))) continue;
        cells.push([gx, gy]);
      }
    }
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, cells.length);
    const m = new THREE.Matrix4(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
    const q = spr.quaternion.clone();
    // Trees farther from the camera draw first (the sprite material does not write depth).
    cells.sort((a, b) => (b[0] - b[1]) - (a[0] - a[1]));
    cells.forEach(([gx, gy], i) => {
      const k = Math.abs(gx + 2 * gy) % 4;
      world.makeTranslation((gx - 0.1) * CELL, 0.2105, -(gy + 0.1) * CELL);
      local.compose(new THREE.Vector3(TREE_P[k][0], TREE_P[k][1], -TREE_P[k][2]), q, new THREE.Vector3(...TREE_S[k]));
      m.multiplyMatrices(world, local).multiply(mesh.matrix);
      inst.setMatrixAt(i, m);
    });
    inst.frustumCulled = false;
    this.group.add(inst);
  }
}
