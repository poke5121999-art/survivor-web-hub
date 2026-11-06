// Builds three.js objects from an exported scene (art/<name>/scene.json + geo.glb, see tools/export_scene.py).
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { customMaterial } from './shaders.js';

const texCache = new Map();
const loader = new THREE.TextureLoader();
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

function texture(base, file) {
  const url = `${base}/${file}`;
  let t = texCache.get(url);
  if (!t) {
    t = loader.load(encodeURI(url));
    t.flipY = false;   // geo.glb UVs are already top-left origin (tools/meshconv.py flips v)
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    texCache.set(url, t);
  }
  return t;
}

// SpriteRenderer sprites (art/sprites/sprites.json from tools/export_sprites.py): Unity asset path -> {png, w, h, px, py}
let SPRITES = {};
const spriteCache = new Map();
export async function loadSprites(url) { SPRITES = await fetch(url).then(r => r.json()); }

function spriteMesh(sr) {
  const sp = SPRITES[sr.sprite];
  if (!sp?.png) return null;
  let rec = spriteCache.get(sr.sprite);
  if (!rec) {
    const g = new THREE.PlaneGeometry(sp.w, sp.h);
    g.translate((0.5 - sp.px) * sp.w, (0.5 - sp.py) * sp.h, 0);
    const t = loader.load(encodeURI(sp.png));
    t.colorSpace = THREE.SRGBColorSpace;
    rec = { g, t };
    spriteCache.set(sr.sprite, rec);
  }
  const c = sr.color || [1, 1, 1, 1];
  const mat = new THREE.MeshBasicMaterial({ map: rec.t, transparent: true, opacity: c[3], depthWrite: false, side: THREE.DoubleSide,
    color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) });
  const m = new THREE.Mesh(rec.g, mat);
  m.renderOrder = 2;
  return m;
}

export function makeMaterial(base, m) {
  const p = { color: new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2], THREE.SRGBColorSpace) };
  if (m.map) {
    p.map = texture(base, m.map);
    if (m.uvst) {
      p.map = p.map.clone();
      p.map.repeat.set(m.uvst[0], m.uvst[1]);
      p.map.offset.set(m.uvst[2], m.uvst[3]);
    }
  }
  if (m.transparent) { p.transparent = true; p.opacity = m.color[3]; p.depthWrite = false; }
  if (m.alphaTest) p.alphaTest = m.alphaTest;
  if (m.emissive) p.emissive = new THREE.Color().setRGB(...m.emissive, THREE.SRGBColorSpace);
  const mat = new THREE.MeshLambertMaterial(p);
  mat.name = m.name;
  if (m.props) customMaterial(mat, m, f => (f ? texture(base, f) : WHITE));
  return mat;
}

// A loaded scene: node descriptors plus a factory that instantiates any subtree.
export class SceneData {
  static async load(base) {
    const [json, gltf] = await Promise.all([
      fetch(`${base}/scene.json`).then(r => r.json()),
      new GLTFLoader().loadAsync(`${base}/geo.glb`),
    ]);
    return new SceneData(base, json, gltf);
  }

  constructor(base, json, gltf) {
    this.base = base;
    this.json = json;
    this.nodes = json.nodes;
    this.mb = json.mb;
    this.ids = json.ids;
    this.skins = json.skins || {};
    this.children = this.nodes.map(() => []);
    this.nodes.forEach((n, i) => { if (n[1] >= 0) this.children[n[1]].push(i); });
    this.byName = new Map();
    this.nodes.forEach((n, i) => { if (!this.byName.has(n[0])) this.byName.set(n[0], i); });
    // glTF mesh i -> list of BufferGeometry (one per submesh)
    this.geoms = [];
    gltf.scene.traverse(o => {
      const m = /^m(\d+)$/.exec(o.name);
      if (!m) return;
      const list = o.isMesh ? [o.geometry] : o.children.filter(c => c.isMesh).map(c => c.geometry);
      this.geoms[+m[1]] = list;
    });
    this.mats = json.materials.map(m => makeMaterial(base, m));
  }

  comps(i, cls) { return (this.mb[i] || []).filter(c => !cls || c.cls === cls); }
  comp(i, cls) { return (this.mb[i] || []).find(c => c.cls === cls); }

  // Node index of a fileID reference inside the prefab `file` (basename of the exported prefab).
  ref(file, r) { return r && r.fileID ? this.ids[file]?.[String(r.fileID)] ?? -1 : -1; }

  find(name, under = -1) {
    if (under < 0) return this.byName.get(name) ?? -1;
    const stack = [under];
    while (stack.length) {
      const i = stack.pop();
      if (this.nodes[i][0] === name) return i;
      stack.push(...this.children[i]);
    }
    return -1;
  }

  // Instantiate node i and its subtree. opts.all: include inactive children (hidden).
  // Skinned renderers become SkinnedMesh bound to the subtree's bone objects with the mesh's own bind poses.
  build(i, opts = {}) {
    const skinned = [];
    const root = this._build(i, opts, skinned);
    if (skinned.length) {
      const byNode = new Map();
      root.traverse(o => { if (o.userData.node != null) byNode.set(o.userData.node, o); });
      for (const { mesh, skin } of skinned) {
        const bones = skin.bones.map(b => byNode.get(b) || new THREE.Bone());
        const inv = skin.bind.map(a => new THREE.Matrix4().fromArray(a));
        mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
      }
    }
    return root;
  }

  _build(i, opts, skinned) {
    const n = this.nodes[i];
    const o = new THREE.Object3D();
    o.name = n[0];
    o.position.fromArray(n[2]);
    o.quaternion.fromArray(n[3]);
    o.scale.fromArray(n[4]);
    o.visible = !!n[5];
    o.userData.node = i;
    const kind = n[8];
    if (n[6] >= 0 && (kind === 'm' || kind === 's') && this.geoms[n[6]]) {
      const geoms = this.geoms[n[6]];
      geoms.forEach((g, k) => {
        const mi = n[7][Math.min(k, n[7].length - 1)];
        const mat = mi >= 0 ? this.mats[mi] : this.mats[0];
        const skin = kind === 's' && g.attributes.skinIndex ? this.skins[i] : null;
        const mesh = skin ? new THREE.SkinnedMesh(g, mat) : new THREE.Mesh(g, mat);
        if (skin) { mesh.frustumCulled = false; skinned.push({ mesh, skin }); }
        mesh.castShadow = opts.shadows !== false;
        mesh.receiveShadow = true;
        o.add(mesh);
      });
    }
    if (kind === 'p') {
      const sr = this.comp(i, 'SpriteRenderer');
      const m = sr && sr.enabled !== 0 ? spriteMesh(sr) : null;
      if (m) o.add(m);
    }
    for (const c of this.children[i]) {
      if (!this.nodes[c][5] && !opts.all) continue;
      o.add(this._build(c, opts, skinned));
    }
    return o;
  }
}

// ColorPickerScript.Apply(World.ColorPreset) (World.c:2468): named colour slots -> material properties, per the FarmScene
// Bindings (Grass _Color/_Color2, Path=Road _MainColor/_SecondColor, Beach=Sand _MainColor, Border=Ground _Color,
// Player=BaseSkin _Color; Water is the water plane, see world.js).
const PRESET_BINDINGS = { Grass: ['Grass', ['uC1', 'uC2']], Path: ['Road', ['uMC', 'uSC']], Beach: ['Sand', ['uMain']],
  Border: ['Ground', ['color']], Player: ['BaseSkin', ['color']] };
export function applyColorPreset(sd, colors) {
  if (!colors) return 0;
  let n = 0;
  sd.json.materials.forEach((m, i) => {
    for (const [slot, [name, props]] of Object.entries(PRESET_BINDINGS)) {
      if (m.name !== name || !colors[slot]) continue;
      const mat = sd.mats[i];
      props.forEach((p, k) => {
        const hex = colors[slot][k];
        if (!hex) return;
        const c = new THREE.Color(hex);
        if (p === 'color') { mat.color.copy(c); n++; } else if (mat.userData.uniforms?.[p]) { mat.userData.uniforms[p].value.copy(c); n++; }
      });
    }
  });
  return n;
}
