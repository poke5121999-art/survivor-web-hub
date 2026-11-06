// The island: instantiates the exported World prefab once and exposes per-parcel handles the game view toggles.
import * as THREE from 'three';

export class WorldView {
  constructor(sd, data) {
    this.sd = sd;
    this.data = data;
    this.root = sd.build(data.root, { all: true });
    this.objs = new Map(); // node index -> Object3D
    this.root.traverse(o => { if (o.userData.node != null) this.objs.set(o.userData.node, o); });
    // Runtime-only helpers in the prefab that the game keeps hidden: minimap layer (y -9), parcel bounds, gizmo locks.
    for (const p of data.parcels) {
      for (const n of ['MiniMapCell', 'MinimapPOI', 'Bound']) {
        const i = sd.find(n, p.node);
        if (i >= 0) this.obj(i).visible = false;
      }
    }
    this.root.traverse(o => {
      if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); }
    });
    // FarmScene WaterPlane: y -1, WaterMat (LolTap_WaterFakeDepth) _MainColor (0, 0.651, 1), _Emssion 0.2.
    // The island cliffs sink into it, which hides their fade-to-black bottom.
    // the World's ColorPreset "Water" slot when present (World1: #00A3FF)
    const wc = data.colors?.Water?.[0] ? new THREE.Color(data.colors.Water[0]) : new THREE.Color().setRGB(0, 0.651, 1, THREE.SRGBColorSpace);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: wc, emissive: wc.clone().multiplyScalar(0.2) }));
    this.water.position.y = -1;
    this.water.receiveShadow = true;
    this.root.add(this.water);
  }

  obj(i) { return i == null || i < 0 ? null : this.objs.get(i); }

  // The prefab is ~20k Object3Ds; recomputing their matrices every frame cost 7-15 ms of CPU. Everything except
  // `dynamic` objects (and the path down to them) gets a fixed world matrix and drops out of updateMatrixWorld.
  freeze(dynamic) {
    this.root.updateMatrixWorld(true);
    const keep = new Set(), path = new Set();
    for (const o of dynamic) {
      if (!o) continue;
      o.traverse(c => keep.add(c));
      for (let a = o.parent; a && a !== this.root; a = a.parent) path.add(a);
    }
    let frozen = 0;
    const walk = o => {
      for (const c of o.children) {
        if (keep.has(c)) continue;
        c.matrixAutoUpdate = false;
        if (path.has(c)) walk(c);
        else { c.matrixWorldAutoUpdate = false; c.traverse(() => frozen++); }
      }
    };
    walk(this.root);
    // an ancestor that recomposes its matrix forces its whole subtree, so the root (identity) is fixed too
    this.root.matrixAutoUpdate = false;
    if (this.root.parent) this.root.parent.matrixAutoUpdate = false;
    return frozen;
  }

  // re-sync one frozen object after changing its transform
  touch(o) { o.updateMatrix(); o.updateMatrixWorld(true); }

  // Road piece for a parcel: Unity Parcel.Roads [End, I, L, T, X] chosen from open neighbours, rotated to fit.
  setRoad(p, kind, rotY) {
    p.roads.forEach((r, k) => {
      const o = this.obj(r);
      if (!o) return;
      o.visible = k === kind;
      if (k === kind && o.rotation.y !== rotY) { o.rotation.y = rotY; this.touch(o); }
    });
  }
}
