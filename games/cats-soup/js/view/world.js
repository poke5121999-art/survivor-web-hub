// Builds three.js objects from art/<id>/scene.json + geo.glb (tools/export_prefabs.py). Each export holds several
// prefab roots; instantiate(key) clones one. Nodes keep Unity names, hierarchy and active flags.
import * as THREE from 'three';
import { makeMaterial, texture, want } from './shaders.js';

export class PrefabLib {
  constructor(scene, gltf, texBase) {
    this.scene = scene;
    this.texBase = texBase;
    this.geo = [];
    gltf.scene.children.forEach(o => { this.geo[+o.name.slice(1)] = o; });
    this.materials = scene.materials.map(e => makeMaterial(e, texBase, scene.textures));
    this.spriteMats = new Map();
    this.roots = new Map(scene.roots.map((r, i) => [r.key, { node: r.node, end: scene.roots[i + 1] ? scene.roots[i + 1].node : scene.nodes.length }]));
  }

  keys() { return [...this.roots.keys()]; }

  // Promise that resolves when every texture used by the library is sharp.
  ready() {
    return Promise.all(this.scene.textures.map(t => texture(this.texBase, t.name).full));
  }

  spriteMaterial(n) {
    const key = `${n.spr.tex}|${n.spr.mt[0]}|${(n.spr.c || []).join(',')}`;
    if (!this.spriteMats.has(key)) {
      const e = this.scene.materials[n.spr.mt[0]] || { shader: 'Sprite', f: {} };
      this.spriteMats.set(key, makeMaterial(e, this.texBase, this.scene.textures, { sprite: true, spriteTex: n.spr.tex, color: n.spr.c }));
    }
    return this.spriteMats.get(key);
  }

  // Start loading the textures one root will show (nodes whose whole chain is active) without building it, so a facility's
  // textures are on the wire while the rest of the page is still booting.
  want(key) {
    const r = this.roots.get(key);
    if (!r) return;
    const nodes = this.scene.nodes, vis = [];
    for (let i = r.node; i < r.end; i++) {
      const n = nodes[i];
      vis[i] = n.a !== 0 && (i === r.node || n.p < 0 || vis[n.p] !== false);
      if (!vis[i]) continue;
      const mats = n.spr ? [n.spr.mt && n.spr.mt[0]] : n.m != null ? n.mt : n.sk ? n.sk.mt : [];
      for (const mi of mats || []) {
        const m = mi != null && this.materials[mi];
        if (m && m.mat.uniforms && m.mat.uniforms.map && !n.spr) want(m.mat.uniforms.map.value);
      }
      if (n.spr && n.spr.tex != null) texture(this.texBase, this.scene.textures[n.spr.tex].name);
    }
  }

  geometryOf(mi) {
    const src = this.geo[mi];
    src.updateMatrix();
    return { prims: src.isMesh ? [src] : src.children, q: src.matrix };
  }

  // A fresh object tree for one root key (nodes [node, end) of the export).
  instantiate(key) {
    const r = this.roots.get(key);
    if (!r) throw new Error(`prefab ${key} not exported`);
    const nodes = this.scene.nodes;
    const objects = [];
    for (let i = r.node; i < r.end; i++) {
      const n = nodes[i];
      const o = new THREE.Group();
      o.name = n.n;
      if (n.t) o.position.fromArray(n.t);
      if (n.r) o.quaternion.fromArray(n.r);
      if (n.s) o.scale.fromArray(n.s);
      o.visible = n.a !== 0;
      o.userData.node = n;
      objects[i - r.node] = o;
      if (n.p >= 0 && i !== r.node) objects[n.p - r.node].add(o);
    }
    const root = objects[0];
    for (let i = r.node; i < r.end; i++) {
      const n = nodes[i], o = objects[i - r.node];
      if (n.m != null) this.addMesh(o, n.m, n.mt, n.ren !== 0, n.so);
      if (n.spr) {
        const { prims, q } = this.geometryOf(n.spr.m);
        const m = new THREE.Mesh(prims[0].geometry, this.spriteMaterial(n).mat);
        m.applyMatrix4(q);
        if (n.spr.flip) m.scale.multiply(new THREE.Vector3(n.spr.flip[0] ? -1 : 1, n.spr.flip[1] ? -1 : 1, 1));
        m.renderOrder = n.spr.so[1];
        m.visible = n.spr.ren !== 0;
        o.add(m);
      }
      if (n.sk) this.addSkinned(o, n, objects, r.node);
    }
    root.userData.objects = objects;
    // The textures of what this instance shows (active node chain, visible mesh) jump the load queue; the ones of
    // inactive variants (skins, seasonal props) stay in the library's low-priority queue (shaders.js).
    root.traverseVisible(o => {
      const m = o.material;
      if (o.isMesh && o.visible && m && m.uniforms && m.uniforms.map) want(m.uniforms.map.value);
    });
    return root;
  }

  addMesh(o, mi, mt, visible, so) {
    const { prims, q } = this.geometryOf(mi);
    prims.forEach((prim, k) => {
      const mi = mt[Math.min(k, mt.length - 1)];
      const m = mi == null ? this.fallback : this.materials[mi];
      if (!m) return;
      const mesh = new THREE.Mesh(prim.geometry, m.colored(m.mat, prim.geometry));
      mesh.applyMatrix4(q);
      mesh.visible = visible;
      if (so && so[1]) mesh.renderOrder = so[1];
      o.add(mesh);
      if (m.outline) {
        const ol = new THREE.Mesh(prim.geometry, m.colored(m.outline, prim.geometry));
        ol.applyMatrix4(q);
        ol.visible = visible;
        o.add(ol);
      }
    });
  }

  addSkinned(o, n, objects, base) {
    const info = this.scene.meshes[n.sk.m];
    const { prims, q } = this.geometryOf(n.sk.m);
    const skeleton = new THREE.Skeleton(n.sk.bones.map(b => objects[b - base]),
      info.bind.map(a => new THREE.Matrix4().fromArray(a).multiply(q)));
    const identity = new THREE.Matrix4();
    prims.forEach((prim, k) => {
      const m = this.materials[n.sk.mt[Math.min(k, n.sk.mt.length - 1)]];
      if (!m) return;
      for (const mat of [m.colored(m.mat, prim.geometry), m.colored(m.outline, prim.geometry)]) {
        if (!mat) continue;
        const sm = new THREE.SkinnedMesh(prim.geometry, mat);
        sm.bind(skeleton, identity);
        sm.frustumCulled = false;
        sm.visible = n.sk.ren !== 0;
        o.add(sm);
      }
    });
  }
}

export async function loadLib(base, id, GLTFLoader, decoder) {
  const [scene, gltf] = await Promise.all([
    fetch(`${base}/art/${id}/scene.json${globalThis.CS_V || ''}`).then(r => r.json()),
    new Promise((res, rej) => {
      const l = new GLTFLoader();
      if (decoder) l.setMeshoptDecoder(decoder);
      l.load(`${base}/art/${id}/geo.glb${globalThis.CS_V || ''}`, res, undefined, rej);
    }),
  ]);
  return new PrefabLib(scene, gltf, `${base}/art/tex`);
}
