// Runtime prefabs (art/pool: products, furniture, delivery boxes, customers, cashier) built once, hidden, and
// cloned per use. Clones share geometry and materials; skinned meshes get a skeleton rebuilt on the cloned bones.
import * as THREE from 'three';
import { Rig } from './anim.js';

export class Pool {
  constructor(world, animLib) {
    this.world = world;
    this.lib = animLib;
    this.roots = world.objects.filter((o, i) => world.objects[i].userData.node.p < 0);
    for (const r of this.roots) r.visible = false;
    world.root.visible = true;
  }

  root(ri) { return this.roots[ri]; }

  // Deep copy of pool root ri, visible, at the prefab's own local rotation/scale (position zeroed).
  instance(ri) {
    const src = this.roots[ri];
    const out = deepClone(src);
    out.visible = true;
    out.position.set(0, 0, 0);
    return out;
  }

  // Animator rig for an instance (first node carrying an Animator with an exported controller).
  rig(inst) {
    let hit = null;
    inst.traverse(o => {
      if (hit) return;
      const a = o.userData.node && o.userData.node.k && o.userData.node.k.Animator;
      if (!a) return;
      const ctrl = this.lib && this.lib.controller(a.m_Controller);
      if (ctrl && ctrl.layers.length) hit = new Rig(this.lib, o, ctrl);
    });
    return hit;
  }
}

export function deepClone(src) {
  const map = new Map();
  const c = o => {
    let n;
    if (o.isSkinnedMesh) n = new THREE.SkinnedMesh(o.geometry, o.material);
    else if (o.isMesh) n = new THREE.Mesh(o.geometry, o.material);
    else n = new THREE.Group();
    n.name = o.name;
    n.position.copy(o.position); n.quaternion.copy(o.quaternion); n.scale.copy(o.scale);
    n.visible = o.visible; n.renderOrder = o.renderOrder; n.frustumCulled = o.frustumCulled;
    n.userData = { node: o.userData.node, i: o.userData.i, fill: o.userData.fill };
    map.set(o, n);
    for (const ch of o.children) n.add(c(ch));
    return n;
  };
  const out = c(src);
  map.forEach((n, o) => {
    if (!o.isSkinnedMesh) return;
    const sk = o.skeleton;
    n.bind(new THREE.Skeleton(sk.bones.map(b => map.get(b) || b), sk.boneInverses), o.bindMatrix);
    n.frustumCulled = false;
  });
  return out;
}

// Child of an instance by its index offset inside the prefab (data/layout.json stores offsets from the root).
export function childAt(inst, offset) {
  if (!offset) return inst;
  const base = inst.userData.i;
  let hit = null;
  inst.traverse(o => { if (!hit && o.userData.i === base + offset) hit = o; });
  return hit;
}
