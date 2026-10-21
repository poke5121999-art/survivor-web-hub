// Tải GLB / JSON / ảnh từ repo asset, có bộ đệm. Lỗi tải ghi vào window.__wosErrors để test bắt.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS } from './config.js?v=20261022a';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
gltfLoader.setCrossOrigin('anonymous');
const gl = {}, js = {}, tx = {};

export const assetUrl = p => /^https?:/.test(p) ? p : ASSETS + p.replace(/^\//, '');

// Tiến độ tải theo byte cho màn tải. Mỗi GLB: [đã tải, tổng]. Tổng biết trước nhờ expectBytes (map/index.json ghi kb
// từng GLB), không thì lấy Content-Length từ sự kiện progress. Pages có thể gzip nên đã tải được kẹp <= tổng.
export const bytes = new Map();
export function expectBytes(path, n) { const b = bytes.get(path); if (!b) bytes.set(path, [0, n]); else b[1] = Math.max(b[1], n); }
export function loadProgress() {
  let l = 0, t = 0;
  for (const [a, b] of bytes.values()) { l += Math.min(a, b || a); t += b || a; }
  return { loaded: l, total: t, files: bytes.size };
}

export function loadGLB(path) {
  if (!bytes.has(path)) bytes.set(path, [0, 0]);
  return gl[path] || (gl[path] = gltfLoader.loadAsync(assetUrl(path), ev => {
    const b = bytes.get(path);
    if (ev && ev.lengthComputable && ev.total > b[1]) b[1] = ev.total;
    if (ev && ev.loaded) b[0] = ev.loaded;
  }).then(g => { const b = bytes.get(path); b[1] = b[1] || b[0]; b[0] = b[1]; return g; }).catch(e => {
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
