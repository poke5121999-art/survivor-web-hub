// One field (5x5 FieldCell) drawn in a handful of draw calls instead of ~25 per cell layer:
// - soil: the 25 FieldCell "Plane" meshes merged in world space, wet/dry colour per cell as vertex colour
//   (the MaterialPropertyBlock colour of the original);
// - plants: per crop prefab (<Crop>Plant_S / _M) one InstancedMesh per (geometry, material) part, one instance per
//   cell and occurrence. FieldCell spawns the prefab under PlantRoot at local position 0 with a random Y angle and
//   tweens its scale 0.01 -> 1, so instance = T(cell) * Ry(angle) * S(grow) * part-local (prefab root TRS replaced).
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(),
  s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

// Mesh parts of a prototype, relative to its root (root TRS excluded), grouped by geometry + material.
function partsOf(proto) {
  proto.updateMatrixWorld(true);
  const inv = proto.matrixWorld.clone().invert();
  const groups = new Map();
  proto.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    for (let a = o.parent; a && a !== proto; a = a.parent) if (!a.visible) return;
    const key = o.geometry.uuid + '|' + o.material.uuid;
    if (!groups.has(key)) groups.set(key, { geometry: o.geometry, material: o.material, locals: [], cast: o.castShadow });
    groups.get(key).locals.push(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
  });
  return [...groups.values()];
}

export class FieldBatch {
  // view: GameView (proto(), wet/dry colours); field: sim field; parent: Object3D to add into
  constructor(view, field, parent) {
    this.view = view;
    this.f = field;
    this.group = new THREE.Group();
    this.group.name = `FieldBatch_${field.i}`;
    parent.add(this.group);
    const n = field.cells.length;
    this.n = n;
    this.angle = field.cells.map((c, k) => (k * 2.39996) % (Math.PI * 2));
    this.state = new Array(n).fill(-1);
    this.grow = new Array(n).fill(1);
    this.shown = new Array(n).fill(null);
    this.placed = new Array(n).fill(null);   // kind whose instances for cell k are non-zero
    this.colors = new Array(n).fill(null);   // last soil colour written for cell k
    this.dirty = new Set();                  // meshes whose instanceMatrix changed this frame
    this.soilDirty = false;
    this.kinds = new Map();   // prefab name -> [{ mesh: InstancedMesh, locals }]
    this.buildSoil();
    // build this field's plant meshes now and keep them visible (all instances zero-scale) for the first frames, so their
    // shader programs (instanced, and the shadow depth variant) compile at field creation, not on the first sown cell
    const pre = view.data.crops[field.crop]?.prefabs || [];
    // frustumCulled off during the warm frames: the shadow pass culls against the small sun camera around the player,
    // which left the instanced depth programs to compile mid-sowing (2 programs measured on the first pass)
    for (const name of pre.slice(0, 2)) if (name) for (const p of this.kind(name)) { p.mesh.visible = true; p.mesh.frustumCulled = false; }
    this.warm = 4;   // visible for 3 rendered frames (the first frame has no shadow map yet)
  }

  buildSoil() {
    const proto = this.view.proto('FieldCell');
    const plane = proto?.getObjectByName('Plane');
    const src = [];
    plane?.updateWorldMatrix(true, true);
    plane?.traverse(o => { if (o.isMesh) src.push(o); });
    if (!src.length) return;
    const mesh0 = src[0], local = mesh0.matrixWorld.clone();
    const geos = this.f.cells.map(c => {
      const g = mesh0.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(mA.makeTranslation(c.x, 0, c.z).multiply(local));
      const cnt = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3));
      return g;
    });
    this.vertsPerCell = geos[0].attributes.position.count;
    const geo = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    // shared by every field (only fields use it); clone() would drop the onBeforeCompile world-space normal map
    const mat = mesh0.material;
    if (!mat.vertexColors) { mat.vertexColors = true; mat.color.set(0xffffff); mat.needsUpdate = true; }
    this.soil = new THREE.Mesh(geo, mat);
    this.soil.receiveShadow = true;
    this.soil.name = 'Soil';
    this.group.add(this.soil);
  }

  // wet/dry soil colour of cell k; skipped when unchanged, uploaded once per frame in flush()
  setColor(k, color) {
    if (!this.soil || (this.colors[k] && this.colors[k].equals(color))) return;
    this.colors[k] = color.clone();
    const a = this.soil.geometry.attributes.color, base = k * this.vertsPerCell;
    for (let i = 0; i < this.vertsPerCell; i++) a.setXYZ(base + i, color.r, color.g, color.b);
    this.soilDirty = true;
  }

  kind(name) {
    if (!this.kinds.has(name)) {
      const proto = this.view.proto(name);
      const list = [];
      if (proto) {
        for (const p of partsOf(proto)) {
          const mesh = new THREE.InstancedMesh(p.geometry, p.material, this.n * p.locals.length);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, ZERO);
          mesh.castShadow = p.cast !== false;
          mesh.receiveShadow = true;
          // the field's own bounds, so frustum culling works per field
          mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(this.f.d.pos[0], 1, this.f.d.pos[2]), 5);
          this.group.add(mesh);
          list.push({ mesh, locals: p.locals });
        }
      }
      this.kinds.set(name, list);
    }
    return this.kinds.get(name);
  }

  // cell k shows prefab `name` (or nothing) at scale `g`
  place(k, name, g) {
    const c = this.f.cells[k];

    // only the kind shown now and the kind shown before are touched; every other kind already holds zeros for k
    const prev = this.placed[k];
    if (prev && prev !== name) {
      for (const p of this.kinds.get(prev) || []) {
        for (let j = 0; j < p.locals.length; j++) p.mesh.setMatrixAt(k * p.locals.length + j, ZERO);
        this.dirty.add(p.mesh);
      }
    }
    this.placed[k] = name;
    if (!name) return;
    mA.compose(v.set(c.x, 0, c.z), q.setFromAxisAngle(Y, this.angle[k]), s.setScalar(Math.max(0.01, g)));
    for (const p of this.kinds.get(name) || []) {
      for (let j = 0; j < p.locals.length; j++) p.mesh.setMatrixAt(k * p.locals.length + j, mB.multiplyMatrices(mA, p.locals[j]));
      this.dirty.add(p.mesh);
    }
  }

  // a kind no cell shows is hidden, so its zero-scale instances cost no vertex work
  refreshVisible() {
    for (const [kn, parts] of this.kinds) {
      const any = this.shown.includes(kn);
      for (const p of parts) { p.mesh.visible = any; p.mesh.frustumCulled = true; }
    }
  }

  // one GPU upload per changed mesh per frame
  flush() {
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    if (this.soilDirty) { this.soil.geometry.attributes.color.needsUpdate = true; this.soilDirty = false; }
  }

  // state 0 = bare (dry), 1 = planted (_S, dry), 2 = grown (_M, wet); new plants pop in
  setCell(k, state, prefabs, color) {
    this.setColor(k, color);
    if (this.state[k] === state) return;
    this.state[k] = state;
    const name = state === 1 ? prefabs[0] : state === 2 ? prefabs[1] : null;
    if (name) this.kind(name);
    this.shown[k] = name;
    if (!this.warm) this.refreshVisible();
    this.grow[k] = name ? 0 : 1;
    if (name) this.growing = (this.growing || 0) + 1;
    this.place(k, name, name ? 0.01 : 1);
  }

  // DOScale(1, 0.25) with an overshoot, as the old per-object tween
  update(dt) {
    if (this.warm && --this.warm === 0) this.refreshVisible();
    if (this.growing) {
      let still = 0;
      for (let k = 0; k < this.n; k++) {
        if (this.grow[k] >= 1) continue;
        const g = this.grow[k] = Math.min(1, this.grow[k] + dt * 4);
        this.place(k, this.shown[k], g * (1 + Math.sin(g * Math.PI) * 0.25));
        if (g < 1) still++;
      }
      this.growing = still;
    }
    if (this.dirty.size || this.soilDirty) this.flush();
  }
}
