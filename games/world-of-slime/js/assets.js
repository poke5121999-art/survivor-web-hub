// Tải GLB / JSON / ảnh từ repo asset, có bộ đệm. Lỗi tải ghi vào window.__wosErrors để test bắt.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS } from './config.js?v=20261021a';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
gltfLoader.setCrossOrigin('anonymous');
const gl = {}, js = {}, tx = {};

export const assetUrl = p => /^https?:/.test(p) ? p : ASSETS + p.replace(/^\//, '');

export function loadGLB(path) {
  return gl[path] || (gl[path] = gltfLoader.loadAsync(assetUrl(path)).catch(e => {
    delete gl[path];
    throw new Error('glb load failed: ' + path + ' (' + (e && e.message || e) + ')');
  }));
}

export function loadJSON(path, base) {
  const url = base ? new URL(path, base).href : assetUrl(path);
  return js[url] || (js[url] = fetch(url).then(async r => {
    if (!r.ok) throw new Error('json load failed: ' + url + ' (http ' + r.status + ')');
    const s = await r.text();
    try { return JSON.parse(s); } catch (e) {
      // Bẫy: map/index.json do Python json.dump ghi ra có Infinity/NaN trần (vd. tham số hạt), JSON chuẩn không nhận.
      return JSON.parse(s.replace(/-?\bInfinity\b|\bNaN\b/g, 'null'));
    }
  }));
}

// Ảnh dữ liệu (ramp, atlas): không tự giải mã sRGB vì shader tự pow(2.2) (PIPELINE.md bẫy 6).
export function loadTex(path, { srgb = false, nearest = false } = {}) {
  const k = path + (srgb ? '|s' : '') + (nearest ? '|n' : '');
  if (tx[k]) return tx[k];
  const t = texLoader.load(assetUrl(path), undefined, undefined,
    () => (window.__wosErrors = window.__wosErrors || []).push('texture load failed: ' + path));
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (nearest) { t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  return tx[k] = t;
}

export function clipOf(g, name) {
  const i = g.animations.findIndex(a => a.name === name);
  return i < 0 ? null : { clip: g.animations[i], ex: (g.parser.json.animations[i] || {}).extras || {} };
}
