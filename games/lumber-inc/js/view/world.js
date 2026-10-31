// Builds the three.js scene graph of one world from art/<id>/scene.json + geo.glb (tools/export_world.py).
// Nodes keep their Unity names, hierarchy and active flags; gameplay code toggles lock/active roots by node index.
import * as THREE from 'three';
import { makeMaterial, texture } from './lowpoly.js';


// gltf-transform's meshopt step quantizes positions and moves the dequantize offset/scale into the glTF node transform.
function dequant(src) {
  src.updateMatrix();
  return src.matrix.clone();
}

export function buildWorld(scene, gltf, { texBase }) {
  const geoMeshes = [];
  gltf.scene.children.forEach(o => { geoMeshes[+o.name.slice(1)] = o; });
  const materials = scene.materials.map(e => makeMaterial(e, texBase, scene.textures));
  const objects = scene.nodes.map(n => {
    const o = new THREE.Group();
    o.name = n.n;
    if (n.t) o.position.fromArray(n.t);
    if (n.r) o.quaternion.fromArray(n.r);
    if (n.s) o.scale.fromArray(n.s);
    o.visible = n.a !== 0;
    o.userData.node = n;
    return o;
  });
  const root = new THREE.Group();
  scene.nodes.forEach((n, i) => (n.p >= 0 ? objects[n.p] : root).add(objects[i]));

  scene.nodes.forEach((n, i) => {
    if (n.m == null) return;
    const src = geoMeshes[n.m];
    const all = src.isMesh ? [src] : src.children;
    // Static batching (n.sb = [firstSubMesh, count]): only that submesh range, in world space. Undoing the node's world
    // matrix as it is at load keeps the vertices in place while later scale pops still pivot on the node.
    const prims = n.sb ? all.slice(n.sb[0], n.sb[0] + n.sb[1]) : all;
    const unbatch = n.sb ? (root.updateMatrixWorld(true), objects[i].matrixWorld.clone().invert()) : null;
    prims.forEach((prim, k) => {
      const mi = n.mt[Math.min(k, n.mt.length - 1)];
      if (mi == null) return;
      const m = materials[mi];
      const mesh = new THREE.Mesh(prim.geometry, m.mat);
      mesh.applyMatrix4(dequant(src));
      if (unbatch) mesh.applyMatrix4(unbatch);
      mesh.visible = n.ren !== 0;
      objects[i].add(mesh);
    });
  });

  // Unity skins as world = sum(w * boneWorld * bindpose * v). With an identity bind matrix in 'attached' mode, three's
  // matrixWorld * inverse(matrixWorld) cancels out and the same formula remains.
  const identity = new THREE.Matrix4();
  scene.nodes.forEach((n, i) => {
    if (!n.sk) return;
    const info = scene.meshes[n.sk.m];
    const src = geoMeshes[n.sk.m];
    const prims = src.isMesh ? [src] : src.children;
    const q = dequant(src);
    const skeleton = new THREE.Skeleton(n.sk.bones.map(b => objects[b]), info.bind.map(a => new THREE.Matrix4().fromArray(a).multiply(q)));
    prims.forEach((prim, k) => {
      const mi = n.sk.mt[Math.min(k, n.sk.mt.length - 1)];
      if (mi == null) return;
      const m = materials[mi];
      const add = material => {
        const sm = new THREE.SkinnedMesh(prim.geometry, material);
        sm.bind(skeleton, identity);
        sm.frustumCulled = false;
        sm.visible = n.sk.ren !== 0;
        objects[i].add(sm);
      };
      add(m.mat);
    });
  });

  // SpriteRenderers: a quad of the sprite's world size around its pivot, unlit, alpha blended.
  const quad = new THREE.PlaneGeometry(1, 1);
  scene.nodes.forEach((n, i) => {
    if (!n.spr) return;
    const s = n.spr;
    const tex = texture(texBase, scene.textures[s.tex].name, { nearest: false }).tex;
    const c = s.color || [1, 1, 1, 1];
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: c[3],
      color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = new THREE.Mesh(quad, mat);
    // Unity sprites look down +z of their node (left-handed); after the axis flip the quad faces -z, hence the turn.
    m.scale.set(s.w * (s.flip && s.flip[0] ? -1 : 1), s.h * (s.flip && s.flip[1] ? -1 : 1), 1);
    m.position.set((0.5 - s.pivot[0]) * s.w, (0.5 - s.pivot[1]) * s.h, 0);
    m.rotation.y = Math.PI;
    m.position.x *= -1;
    m.visible = s.ren !== 0;
    m.renderOrder = 2;
    objects[i].add(m);
  });

  const byName = new Map();
  objects.forEach(o => { if (!byName.has(o.name)) byName.set(o.name, o); });

  return { root, objects, byName, materials };
}
