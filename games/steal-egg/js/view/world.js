// Scene graphs from the exporter's scene.json + geo.glb (tools/export_store.py): the GamePlay map and the prefab sets
// (brainrots, eggs). Nodes keep their Unity names, hierarchy and active flags (`a: 0` = hidden), so the game layer finds
// and toggles them by name or path like the original scripts do.
// Lighting follows the original's Gamma colour space: colours and textures are used as stored, the renderer writes them
// without sRGB conversion (main.js), ambient is RenderSettings flat white and the sun is "Directional Light (1)".
import * as THREE from 'three';

// Unity Standard in Gamma space: diffuse = albedo * (1 - unity_ColorSpaceDielectricSpec) * (1 - metallic), with
// dielectric spec 0.2209 in Gamma; RenderSettings.m_ReflectionIntensity is 0, so no environment reflection is added.
const GAMMA_ONE_MINUS_DIELECTRIC = 1 - 0.220916301;
// three's Lambert BRDF divides irradiance by PI; Unity's does not.
const UNITY_LIGHT = Math.PI;
const imageLoader = new THREE.ImageLoader();
const textureCache = new Map();
let fullStarted = false;

function newTexture() {
  const t = new THREE.Texture();
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// 16 px .lq.webp first; the full image is requested by loadFullTextures() (or at once when that already ran). From the
// HTTP cache the full one may land first: a late 16 px image is then dropped. The 16 px upload is immutable storage,
// so the texture is disposed before the bigger image goes in.
export function loadTexture(base, name, version = '') {
  if (textureCache.has(name)) return textureCache.get(name);
  const q = version ? `?v=${version}` : '';
  const entry = { tex: newTexture(), sharp: false, copies: [] };
  const apply = img => {
    for (const t of [entry.tex, ...entry.copies]) { t.dispose(); t.image = img; t.needsUpdate = true; }
  };
  entry.lq = new Promise(resolve => imageLoader.load(`${base}/${name}.lq.webp${q}`, img => {
    if (!entry.sharp) apply(img);
    resolve();
  }, undefined, () => resolve()));
  let go;
  entry.full = new Promise(resolve => { go = () => imageLoader.load(`${base}/${name}.webp${q}`, img => {
    entry.sharp = true;
    apply(img);
    resolve();
  }, undefined, () => resolve()); });
  entry.start = () => { if (go) { go(); go = null; } return entry.full; };
  if (fullStarted) entry.start();
  textureCache.set(name, entry);
  return entry;
}

export function loadFullTextures() {
  fullStarted = true;
  return Promise.all([...textureCache.values()].map(e => e.start()));
}
export const lowResSettled = () => Promise.all([...textureCache.values()].map(e => e.lq));
export const textureStats = () => {
  const all = [...textureCache.values()];
  return { total: all.length, sharp: all.filter(e => e.sharp).length };
};

// Same image with its own repeat/offset (Unity _MainTex_ST); follows the lq -> full swap of its source.
function tiled(entry, st) {
  if (!st) return entry.tex;
  const t = newTexture();
  t.image = entry.tex.image;
  t.repeat.set(st[0], st[1]);
  t.offset.set(st[2], st[3]);
  if (t.image) t.needsUpdate = true;
  entry.copies.push(t);
  return t;
}

export function makeMaterial(e, sceneTextures, texBase, version) {
  const tex = i => loadTexture(texBase, sceneTextures[i].name, version);
  const legacy = e.shader === 'Mobile/Diffuse';
  const k = legacy ? 1 : GAMMA_ONE_MINUS_DIELECTRIC * (1 - (e.metallic || 0));
  const c = e.color || [1, 1, 1, 1];
  const p = { color: new THREE.Color(c[0] * k, c[1] * k, c[2] * k), side: e.cull === 'none' ? THREE.DoubleSide : THREE.FrontSide };
  if (e.tex != null) p.map = tiled(tex(e.tex), e.st);
  if (!legacy && e.emission) {
    p.emissive = new THREE.Color(e.emission[0], e.emission[1], e.emission[2]);
    if (e.emissionTex != null) p.emissiveMap = tiled(tex(e.emissionTex), e.st);
  }
  if (e.alpha === 'MASK') p.alphaTest = Math.max(e.cutoff ?? 0.5, 1e-3);
  if (e.alpha === 'BLEND') { p.transparent = true; p.opacity = c[3]; p.depthWrite = false; }
  const m = new THREE.MeshLambertMaterial(p);
  m.name = e.name;
  return m;
}

export function addUnityLights(scene3, sceneJson, lightNode) {
  const r = sceneJson.render || {};
  const amb = r.m_AmbientSkyColor || { r: 1, g: 1, b: 1 };
  const ambient = new THREE.AmbientLight(new THREE.Color(amb.r, amb.g, amb.b), UNITY_LIGHT * (r.m_AmbientIntensity ?? 1));
  const L = lightNode.userData.node.k.Light;
  const sun = new THREE.DirectionalLight(new THREE.Color(L.m_Color.r, L.m_Color.g, L.m_Color.b), UNITY_LIGHT * L.m_Intensity);
  lightNode.updateWorldMatrix(true, false);
  // A Unity light shines along its +z, which the exporter's z flip turned into local -z.
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(lightNode.matrixWorld);
  sun.position.copy(dir).multiplyScalar(-100);
  sun.target.position.set(0, 0, 0);
  scene3.add(ambient, sun, sun.target);
  return { ambient, sun, dir };
}

// RenderSettings.m_SkyboxMaterial FS000_Day_02 (Skybox/Cubemap, tint 0.5 x Gamma's 2, exposure 1): the cube map as stored.
// tools/export_sky.py writes its faces +X -X +Y -Y +Z -Z (Unity space) side by side; this picks the face and texel
// with the cube-map rule, after turning the three.js direction back into Unity space (z flipped).
export function makeSky(texBase, version) {
  const entry = loadTexture(texBase.replace(/tex$/, 'world'), 'sky', version);
  entry.tex.wrapS = entry.tex.wrapT = THREE.ClampToEdgeWrapping;
  entry.tex.generateMipmaps = false;
  entry.tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.ShaderMaterial({
    uniforms: { strip: { value: entry.tex } },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D strip; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vec3(vDir.x, vDir.y, -vDir.z));
        vec3 a = abs(d); float face; vec2 st; float ma;
        if (a.x >= a.y && a.x >= a.z) { ma = a.x; face = d.x > 0.0 ? 0.0 : 1.0; st = d.x > 0.0 ? vec2(-d.z, -d.y) : vec2(d.z, -d.y); }
        else if (a.y >= a.z) { ma = a.y; face = d.y > 0.0 ? 2.0 : 3.0; st = d.y > 0.0 ? vec2(d.x, d.z) : vec2(d.x, -d.z); }
        else { ma = a.z; face = d.z > 0.0 ? 4.0 : 5.0; st = d.z > 0.0 ? vec2(d.x, -d.y) : vec2(-d.x, -d.y); }
        vec2 uv = clamp((st / ma + 1.0) * 0.5, 0.002, 0.998);
        gl_FragColor = vec4(texture2D(strip, vec2((face + uv.x) / 6.0, uv.y)).rgb, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const sky = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat);
  sky.name = 'Skybox';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.onBeforeRender = (r, s, cam) => sky.position.copy(cam.position);
  return sky;
}

// Graph builder shared by the map and prefab instances. `only` limits it to one prefab subtree.
class SceneSet {
  constructor(sceneJson, gltf, { texBase, version, file }) {
    this.json = sceneJson;
    this.file = file;
    this.geo = [];
    gltf.scene.children.forEach(o => { this.geo[+o.name.slice(1)] = o; });
    this.materials = sceneJson.materials.map(e => makeMaterial(e, sceneJson.textures, texBase, version));
    this.children = sceneJson.nodes.map(() => []);
    sceneJson.nodes.forEach((n, i) => { if (n.p >= 0) this.children[n.p].push(i); });
  }

  subtree(root) {
    const out = [];
    const walk = i => { out.push(i); this.children[i].forEach(walk); };
    walk(root);
    return out;
  }

  build(indices) {
    const N = this.json.nodes, objects = new Map();
    for (const i of indices) {
      const n = N[i], o = new THREE.Group();
      o.name = n.n;
      if (n.t) o.position.fromArray(n.t);
      if (n.r) o.quaternion.fromArray(n.r);
      if (n.s) o.scale.fromArray(n.s);
      o.visible = n.a !== 0;
      o.userData.node = n;
      o.userData.index = i;
      objects.set(i, o);
    }
    const roots = [];
    for (const i of indices) {
      const parent = objects.get(N[i].p);
      if (parent) parent.add(objects.get(i));
      else roots.push(objects.get(i));
    }
    const holder = new THREE.Group();
    roots.forEach(r => holder.add(r));
    holder.updateMatrixWorld(true);
    for (const i of indices) this.attachMeshes(N[i], objects.get(i), objects);
    roots.forEach(r => holder.remove(r));
    return { roots, objects };
  }

  attachMeshes(n, o, objects) {
    const dequant = src => { src.updateMatrix(); return src.matrix.clone(); };
    if (n.m != null && this.geo[n.m]) {
      const src = this.geo[n.m], all = src.isMesh ? [src] : src.children;
      // Static batching: only the submesh range, whose vertices are already in world space.
      const prims = n.sb ? all.slice(n.sb[0], n.sb[0] + n.sb[1]) : all;
      const unbatch = n.sb ? o.matrixWorld.clone().invert() : null;
      prims.forEach((prim, k) => {
        if (k >= n.mt.length || n.mt[k] == null) return; // Unity skips submeshes without a material
        const mesh = new THREE.Mesh(prim.geometry, this.materials[n.mt[k]]);
        mesh.applyMatrix4(dequant(src));
        if (unbatch) mesh.applyMatrix4(unbatch);
        mesh.visible = n.ren !== 0;
        mesh.userData.renderer = true;
        o.add(mesh);
      });
    }
    if (n.sk && this.geo[n.sk.m]) {
      const src = this.geo[n.sk.m], prims = src.isMesh ? [src] : src.children, q = dequant(src);
      const bones = n.sk.bones.map(b => objects.get(b) || new THREE.Bone());
      const skeleton = new THREE.Skeleton(bones, this.json.meshes[n.sk.m].bind.map(a => new THREE.Matrix4().fromArray(a).multiply(q)));
      const identity = new THREE.Matrix4();
      prims.forEach((prim, k) => {
        if (k >= n.sk.mt.length || n.sk.mt[k] == null) return;
        const sm = new THREE.SkinnedMesh(prim.geometry, this.materials[n.sk.mt[k]]);
        sm.bind(skeleton, identity);
        sm.frustumCulled = false;
        sm.visible = n.sk.ren !== 0;
        sm.userData.renderer = true;
        o.add(sm);
      });
    }
  }
}

function pathOf(objects, o) {
  const parts = [];
  for (let x = o; x && x.userData.node; x = x.parent) parts.unshift(x.name);
  return parts.join('/');
}

// The GamePlay map. world.node('Env/playerPos') or world.node('Player1'): first match by full path, else by name.
export function buildWorld(sceneJson, gltf, opts) {
  const set = new SceneSet(sceneJson, gltf, opts);
  const { roots, objects } = set.build(sceneJson.nodes.map((_, i) => i));
  const root = new THREE.Group();
  root.name = 'GamePlay';
  roots.forEach(r => root.add(r));
  const list = sceneJson.nodes.map((_, i) => objects.get(i));
  const byName = new Map(), byPath = new Map();
  list.forEach(o => {
    if (!byName.has(o.name)) byName.set(o.name, o);
    const p = pathOf(list, o);
    if (!byPath.has(p)) byPath.set(p, o);
  });
  // Hand weapons (rules/upgrades-shop.md 3d/3e): every player has a weaponManager ("WeaponHolder") whose HandWeapons[8]
  // are all authored active; its Start shows HandWeapons[playerWeapon] (static, default 0 = bat) and ChangeWapon(type)
  // shows exactly one. The dead AxeHolder system never shows anything. Same here: one weapon per holder, none for axes.
  const holders = list.filter(o => o.userData.node.k && o.userData.node.k.weaponManager);
  const axeHolders = list.filter(o => o.userData.node.k && o.userData.node.k.AxeHolder);
  const handOf = o => o.userData.node.k.weaponManager.HandWeapons.map(r => list[r.n]);
  const setHandWeapon = (index, player = null) => {
    for (const h of holders) {
      if (player) { const root = typeof player === 'string' ? byName.get(player) : player; let x = h; while (x && x !== root) x = x.parent; if (!x) continue; }
      handOf(h).forEach((w, i) => { if (w) w.visible = i === index; });
    }
  };
  setHandWeapon(0);
  for (const h of axeHolders) for (const r of h.userData.node.k.AxeHolder.HandWeapons) if (list[r.n]) list[r.n].visible = false;
  return {
    set, root, objects: list, byName, byPath, setHandWeapon,
    // envWeapons(player): weaponManager.envWeapons[8] = the 8 weapon pedestal objects in the world
    envWeapons: player => { const root = typeof player === 'string' ? byName.get(player) : player; const h = holders.find(x => { let y = x; while (y && y !== root) y = y.parent; return !!y; }); return h ? h.userData.node.k.weaponManager.envWeapons.map(r => list[r.n]) : []; },
    // handWeapons(player): the HandWeapons[8] objects of one player (a name like 'Player1' or its object)
    handWeapons: player => { const root = typeof player === 'string' ? byName.get(player) : player; const h = holders.find(x => { let y = x; while (y && y !== root) y = y.parent; return !!y; }); return h ? handOf(h) : []; },
    node: key => byPath.get(key) || byName.get(key) || null,
    all: name => list.filter(o => o.name === name),
    path: o => pathOf(list, o),
    show: (key, on = true) => { const o = byPath.get(key) || byName.get(key); if (o) o.visible = on; return o; },
  };
}

// A prefab set (art/brainrots, art/eggs): scene.json `prefabs: {id: rootIndex}`. spawn(id) builds a fresh instance
// (shared geometry and materials) that the caller adds to the scene; rigs are attached by the caller (rig.js).
export function buildPrefabSet(sceneJson, gltf, opts) {
  const set = new SceneSet(sceneJson, gltf, opts);
  const ids = Object.keys(sceneJson.prefabs);
  const subtrees = new Map(ids.map(id => [id, set.subtree(sceneJson.prefabs[id])]));
  return {
    set, ids,
    name: id => sceneJson.nodes[sceneJson.prefabs[id]].n,
    idByName: name => ids.find(id => sceneJson.nodes[sceneJson.prefabs[id]].n === name) || null,
    spawn(id) {
      const { roots, objects } = set.build(subtrees.get(String(id)));
      const o = roots[0];
      o.visible = true;
      o.userData.objects = [...objects.values()];
      return o;
    },
  };
}
