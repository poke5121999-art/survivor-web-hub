// Unity built-in "Standard" / "Standard (Specular setup)" / "Mobile/Diffuse" materials as three.js materials.
// The project renders in Gamma colour space (PlayerSettings.m_ActiveColorSpace = 0): textures and colours are used
// as raw values and the frame is written without encoding (see main.js), so nothing here converts colour spaces.
import * as THREE from 'three';

const loader = new THREE.ImageLoader();
const texCache = new Map();

export const lighting = {
  dir: new THREE.Vector3(0, 1, 0),
  color: new THREE.Color(1, 1, 1),
  ambient: new THREE.Color(0.7, 0.7, 0.7),
};

// Every texture starts as its 16 px .lq.webp and swaps to the full image when it arrives (same race guard as
// casual-farm: a late 16 px image must never replace the full one).
export function texture(base, name) {
  if (texCache.has(name)) return texCache.get(name);
  const t = new THREE.Texture();
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  const entry = { tex: t, full: null, sharp: false };
  loader.load(`${base}/${name}.lq.webp`, img => {
    if (entry.sharp) return;
    t.image = img;
    t.needsUpdate = true;
  });
  entry.full = new Promise(resolve => {
    loader.load(`${base}/${name}.webp`, img => {
      entry.sharp = true;
      t.dispose();
      t.image = img;
      t.needsUpdate = true;
      resolve();
    }, undefined, () => resolve());
  });
  texCache.set(name, entry);
  return entry;
}

export function addSmoothNormals() {}

// e = scene.materials[i] from tools/export_store.py
export function makeMaterial(e, texBase, textures) {
  const c = e.color || [1, 1, 1, 1];
  const std = e.std || { gloss: 0.5, metal: 0 };
  const p = {
    color: new THREE.Color(c[0], c[1], c[2]),
    // No reflection probe in the web build: Unity's skybox reflection is approximated by roughness only.
    roughness: Math.min(1, Math.max(0.35, 1 - std.gloss)),
    metalness: std.spec ? 0 : Math.min(std.metal, 0.3),
  };
  if (e.tex != null && textures[e.tex]) {
    const map = texture(texBase, textures[e.tex].name).tex;
    if (e.st) {
      const m = map.clone();
      m.repeat.set(e.st[0], e.st[1]);
      m.offset.set(e.st[2], e.st[3]);
      m.needsUpdate = true;
      p.map = m;
      texture(texBase, textures[e.tex].name).full.then(() => { m.image = map.image; m.needsUpdate = true; });
    } else p.map = map;
  }
  // Standard: emission = _EmissionColor * tex2D(_EmissionMap) with the _MainTex tiling. Almost every emissive material
  // here uses its albedo texture as the emission map ("emap": "main"); a flat colour instead lifts every texel by the
  // same grey and washes the fridge, walls and animals out to white.
  if (e.emit && (e.emit[0] || e.emit[1] || e.emit[2])) {
    p.emissive = new THREE.Color(e.emit[0], e.emit[1], e.emit[2]);
    if (e.emap === 'main') p.emissiveMap = p.map;
    else if (e.emap != null && textures[e.emap]) p.emissiveMap = texture(texBase, textures[e.emap].name).tex;
  }
  if (e.alpha === 'BLEND') {
    p.transparent = true;
    p.opacity = c[3];
    p.depthWrite = false;
  } else if (e.alpha === 'MASK') {
    p.alphaTest = e.cutoff ?? 0.5;
  }
  const mat = e.shader === 'Mobile/Diffuse' ? new THREE.MeshLambertMaterial({ color: p.color, map: p.map })
    : new THREE.MeshStandardMaterial(p);
  mat.name = e.name;
  return { mat };
}
