// Builds the three.js scene graph of one store from art/<id>/scene.json + geo.glb (see tools/export_store.py).
// Nodes keep their Unity names, hierarchy and active flags, so gameplay code toggles them by name like the original
// ProgressManager does with objectToActivateList.
import * as THREE from 'three';
import { makeMaterial, addSmoothNormals, lighting, texture } from './toon.js';

const DEBUG = new Set((new URLSearchParams(location.search).get('debug') || '').split(','));
const srgb = c => new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);

// gltf-transform's meshopt step quantizes positions and moves the dequantize offset/scale into the glTF node transform.
function dequant(src) {
  src.updateMatrix();
  return src.matrix.clone();
}

export function buildWorld(scene, gltf, { texBase }) {
  const geoMeshes = [];
  gltf.scene.children.forEach(o => { geoMeshes[+o.name.slice(1)] = o; });
  const materials = scene.materials.map(e => makeMaterial(e, texBase, scene.textures));
  const objects = scene.nodes.map((n, i) => {
    const o = new THREE.Group();
    o.userData.i = i;
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
      if (m.outline) {
        addSmoothNormals(prim.geometry);
        const ol = new THREE.Mesh(prim.geometry, m.outline);
        ol.applyMatrix4(dequant(src));
        if (unbatch) ol.applyMatrix4(unbatch);
        ol.visible = mesh.visible;
        objects[i].add(ol);
      }
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
      if (m.outline && !DEBUG.has('noskinol')) {
        addSmoothNormals(prim.geometry);
        add(m.outline);
      }
    });
  });

  // SpriteRenderers (pad floors, outlines, icons): a quad in the node's XY plane, pivot from the sprite. Masked ones
  // (m_MaskInteraction != 0) are the pads' progress fills under a SpriteMask; they start hidden (userData.fill).
  const sprMats = new Map();
  scene.nodes.forEach((n, i) => {
    if (!n.spr || !scene.sprites) return;
    const sp = scene.sprites[n.spr.s];
    const key = `${n.spr.s}|${n.spr.c.join(',')}`;
    let mat = sprMats.get(key);
    if (!mat) {
      const tex = texture(texBase, scene.textures[sp.tex].name).tex;
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        color: new THREE.Color().setRGB(n.spr.c[0], n.spr.c[1], n.spr.c[2], THREE.SRGBColorSpace), opacity: n.spr.c[3] });
      sprMats.set(key, mat);
    }
    const [w, h] = n.spr.size && n.spr.mode ? n.spr.size : [sp.w, sp.h];
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((0.5 - sp.pivot[0]) * w, (0.5 - sp.pivot[1]) * h, 0);
    const uv = geo.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) {
      let u = uv.getX(k), v = 1 - uv.getY(k);   // textures load with flipY = false
      if (n.spr.flip && n.spr.flip[0]) u = 1 - u;
      if (n.spr.flip && n.spr.flip[1]) v = 1 - v;
      uv.setXY(k, u, v);
    }
    const q = new THREE.Mesh(geo, mat);
    q.renderOrder = 10 + n.spr.o;
    q.visible = n.spr.ren !== 0 && !n.spr.mask;
    q.userData.fill = !!n.spr.mask;
    objects[i].add(q);
  });

  const byName = new Map();
  objects.forEach(o => { if (!byName.has(o.name)) byName.set(o.name, o); });

  const r = scene.render || {};
  if (r.m_AmbientSkyColor) lighting.ambient.copy(srgb(r.m_AmbientSkyColor)).multiplyScalar(r.m_AmbientIntensity ?? 1);
  const light = scene.nodes.find(n => n.k && n.k.Light);
  if (light) {
    const q = new THREE.Quaternion().fromArray(light.r || [0, 0, 0, 1]);
    lighting.dir.set(0, 0, 1).applyQuaternion(q).normalize();
    const L = light.k.Light;
    lighting.color.copy(srgb(L.m_Color)).multiplyScalar(L.m_Intensity);
  }
  return { root, objects, byName, materials };
}
