// Player outfits (SkinManager.skinData, art/pool/playerskins.*). PlayerSkin.ChangeSkin swaps the sharedMesh and
// materials of the player's own SkinnedMeshRenderer (_playerMeshRenderer: same bones, the new mesh's bindposes) and
// sets or clears the hat MeshFilter (_playerHatMeshFilter, a child of the Head bone).
import * as THREE from 'three';
import { makeMaterial, addSmoothNormals } from './toon.js';

const identity = new THREE.Matrix4();
const dequant = src => (src.updateMatrix(), src.matrix.clone());

export class PlayerSkins {
  constructor(lib, gltf, texBase) {
    this.lib = lib;
    this.geo = [];
    gltf.scene.children.forEach(o => { this.geo[+o.name.slice(1)] = o; });
    this.mats = lib.materials.map(e => makeMaterial(e, texBase, lib.textures));
    this.cur = null;
  }

  // world objects + the player's PlayerSkin component -> swap to skin index k.
  apply(objects, ps, k) {
    const sd = this.lib.skins[k];
    if (!sd || k === this.cur) return;
    const cloth = objects[ps._playerMeshRenderer.n];
    const old = cloth.children.filter(c => c.isSkinnedMesh);
    const bones = (old[0] || this.added?.[0])?.skeleton.bones;
    for (const c of cloth.children.filter(c => c.isSkinnedMesh)) cloth.remove(c);
    if (sd.cloth && bones) {
      const info = this.lib.meshes[sd.cloth.m], src = this.geo[sd.cloth.m];
      const q = dequant(src);
      const skeleton = new THREE.Skeleton(bones, info.bind.map(a => new THREE.Matrix4().fromArray(a).multiply(q)));
      const prims = src.isMesh ? [src] : src.children;
      prims.forEach((prim, i) => {
        const m = this.mats[sd.cloth.mt[Math.min(i, sd.cloth.mt.length - 1)]];
        if (!m) return;
        for (const mat of [m.mat, m.outline]) {
          if (!mat) continue;
          if (mat === m.outline) addSmoothNormals(prim.geometry);
          const sm = new THREE.SkinnedMesh(prim.geometry, mat);
          sm.bind(skeleton, identity);
          sm.frustumCulled = false;
          cloth.add(sm);
        }
      });
    }
    this.added = cloth.children.filter(c => c.isSkinnedMesh);
    const hat = objects[ps._playerHatMeshFilter.n];
    for (const c of hat.children.filter(c => c.userData.skinHat)) hat.remove(c);
    if (sd.hat) {
      const src = this.geo[sd.hat.m];
      const prims = src.isMesh ? [src] : src.children;
      prims.forEach((prim, i) => {
        const m = this.mats[sd.hat.mt[Math.min(i, sd.hat.mt.length - 1)]];
        if (!m) return;
        for (const mat of [m.mat, m.outline]) {
          if (!mat) continue;
          if (mat === m.outline) addSmoothNormals(prim.geometry);
          const mesh = new THREE.Mesh(prim.geometry, mat);
          mesh.applyMatrix4(dequant(src));
          mesh.userData.skinHat = true;
          hat.add(mesh);
        }
      });
      hat.visible = true;
    }
    this.cur = k;
  }
}
