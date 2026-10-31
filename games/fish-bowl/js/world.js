// Builds the three.js scene graph of one exported Unity scene (art/<id>/scene.json + geo.glb, see tools/export_scene.py).
// Nodes keep their Unity names, hierarchy and active flags so gameplay toggles them by path like the original does.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { makeMaterial, gammaColor } from './materials.js';

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// gltf-transform's meshopt step quantizes positions and moves the dequantize offset/scale into the glTF node transform.
function dequant(src) {
  src.updateMatrix();
  return src.matrix.clone();
}

// Unity lightmap UV = uv1 * (sx, sy) + (ox, oy) with v up. Our uv1 has v flipped (v' = 1 - v) and the texture is
// uploaded unflipped, so the same lookup is u'' = u*sx + ox, v'' = v'*sy + (1 - sy - oy). Baked per renderer into a copy of
// uv1, because textures cannot carry a per-mesh transform without a copy per renderer.
const lmCache = new WeakMap();
function withLightmapUv(geo, lm) {
  const uv1 = geo.getAttribute('uv1');
  if (!uv1) return geo;
  const [, sx, sy, ox, oy] = lm;
  const key = lm.join(',');
  let per = lmCache.get(geo);
  if (!per) lmCache.set(geo, per = new Map());
  if (per.has(key)) return per.get(key);
  const a = new Float32Array(uv1.count * 2);
  for (let i = 0; i < uv1.count; i++) {
    a[i * 2] = uv1.getX(i) * sx + ox;
    a[i * 2 + 1] = uv1.getY(i) * sy + (1 - sy - oy);
  }
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
  g.setAttribute('uv1', new THREE.BufferAttribute(a, 2));
  g.setIndex(geo.index);
  g.groups = geo.groups;
  g.boundingSphere = geo.boundingSphere;
  g.boundingBox = geo.boundingBox;
  per.set(key, g);
  return g;
}

export async function loadWorld(id, { base }) {
  const dir = `${base}/art/${id}`;
  const [scene, gltf] = await Promise.all([
    fetch(`${dir}/scene.json?v=${window.FB_REV || ''}`).then(r => r.json()),
    gltfLoader.loadAsync(`${dir}/geo.glb?v=${window.FB_REV || ''}`),
  ]);
  const geoMeshes = [];
  gltf.scene.children.forEach(o => { geoMeshes[+o.name.slice(1)] = o; });
  const ctx = { texBase: `${base}/art/tex`, textures: scene.textures, lightmaps: scene.lightmaps || [], cache: new Map(), pending: [], lmPending: [], time: { value: 0 } };
  const entries = scene.materials;
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
  root.name = `scene:${id}`;
  scene.nodes.forEach((n, i) => (n.p >= 0 ? objects[n.p] : root).add(objects[i]));

  scene.nodes.forEach((n, i) => {
    if (n.m == null) return;
    const src = geoMeshes[n.m];
    const all = src.isMesh ? [src] : src.children;
    // Static batching (n.sb = [firstSubMesh, count]): only that submesh range, in world space. Undoing the node's world
    // matrix as it is at load keeps the vertices in place while later scale pops still pivot on the node.
    const prims = n.sb ? all.slice(n.sb[0], n.sb[0] + n.sb[1]) : all;
    const unbatch = n.sb ? (root.updateMatrixWorld(true), objects[i].matrixWorld.clone().invert()) : null;
    // Static-batched meshes: the combined mesh's uv1 already holds the final lightmap UVs (applying the renderer's
    // scale/offset again lands the shelf planes on unbaked black texels), so only the map index is used.
    const lm = n.lm && n.lm[0] >= 0 ? (n.sb ? [n.lm[0], 1, 1, 0, 0] : n.lm) : null;
    prims.forEach((prim, k) => {
      const mi = n.mt[Math.min(k, n.mt.length - 1)];
      if (mi == null) return;
      const geo = lm ? withLightmapUv(prim.geometry, lm) : prim.geometry;
      const mesh = new THREE.Mesh(geo, makeMaterial(entries[mi], ctx, lm && geo.getAttribute('uv1') ? lm[0] : null));
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
      const sm = new THREE.SkinnedMesh(prim.geometry, makeMaterial(entries[mi], ctx, null));
      sm.bind(skeleton, identity);
      sm.frustumCulled = false;
      sm.visible = n.sk.ren !== 0;
      objects[i].add(sm);
    });
  });

  const paths = new Map();
  const pathOf = o => (o.parent && o.parent !== root ? `${pathOf(o.parent)}/` : '') + o.name;
  objects.forEach(o => { const p = pathOf(o); if (!paths.has(p)) paths.set(p, o); });

  // The scene's Directional Light is Baked (lightmapBakeType 2) under an inactive parent, so it does not light dynamic
  // objects in Unity. They get flat ambient (mode 3) plus a soft fixed key from the same direction, tuned by eye. Both
  // scaled by pi because three's Lambert BRDF divides by it.
  const lights = [];
  root.updateMatrixWorld(true);
  const ln = scene.nodes.findIndex(n => n.k && n.k.Light && n.k.Light.m_Type === 1);
  if (ln >= 0) {
    const L = scene.nodes[ln].k.Light;
    const dir = new THREE.DirectionalLight(gammaColor(L.m_Color), 0.5 * Math.PI);
    const q = objects[ln].getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); // Unity +Z becomes -Z after the handedness flip
    dir.position.copy(fwd).multiplyScalar(-100);
    dir.name = 'SceneLight';
    root.add(dir, dir.target);
    lights.push(dir);
  }
  const r = scene.render || {};
  if (r.m_AmbientMode === 3 && r.m_AmbientSkyColor) {
    const amb = new THREE.AmbientLight(gammaColor(r.m_AmbientSkyColor), (r.m_AmbientIntensity ?? 1) * Math.PI);
    root.add(amb);
    lights.push(amb);
  }
  const cameras = scene.nodes.map((n, i) => (n.k && n.k.Camera ? objects[i] : null)).filter(Boolean);
  return {
    root, objects, nodes: scene.nodes, scene, lights, cameras,
    lightNode: ln >= 0 ? objects[ln] : null,
    byPath: p => paths.get(p) || null,
    materials: ctx.cache,
    update: t => { ctx.time.value = t; },
    ready: Promise.all(ctx.pending), // full-resolution textures; the 16 px previews show before this resolves
    lightmapsReady: Promise.all(ctx.lmPending),
  };
}
