// Shared asset access for the Snail Ride web runtime.
// Data files (built by tools/*): data/scene.json, data/art.json, data/clips.json, data/lang.json, data/game.json
export const A = { base: '', rev: '', scene: null, art: null, clips: null, lang: null, game: null };
const imgCache = new Map();
const spriteCache = new Map();

export function url(path) { return A.base + path + (A.rev ? `?v=${A.rev}` : ''); }

export async function loadJSON(path) {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error(`fetch failed ${path}: ${r.status}`);
  return r.json();
}

export async function loadData(base = '', rev = '', onProgress) {
  A.base = base; A.rev = rev;
  const names = ['scene', 'art', 'clips', 'lang', 'game'];
  let done = 0;
  await Promise.all(names.map(async n => {
    A[n] = await loadJSON(`data/${n}.json`).catch(e => { console.warn(e); return null; });
    done++; onProgress && onProgress(done / names.length);
  }));
  return A;
}

// Texture image by texture key (e.g. "a1_34") -> HTMLImageElement
export function texImage(key) {
  if (!imgCache.has(key)) {
    imgCache.set(key, new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`texture missing ${key}`));
      im.src = url(`art/t/${key}.png`);
    }));
  }
  return imgCache.get(key);
}

export function spriteInfo(key) { return A.art && A.art.sprites[key]; }
export function textureInfo(key) { return A.art && A.art.textures[key]; }
export function spriteByName(name) {
  for (const [k, s] of Object.entries(A.art.sprites)) if (s.name === name) return k;
  return null;
}

// Cropped sprite as canvas, size = full sprite rect (m_Rect), tight region placed at textureRectOffset.
export function spriteCanvas(key) {
  if (!spriteCache.has(key)) {
    spriteCache.set(key, (async () => {
      const s = spriteInfo(key);
      if (!s) throw new Error(`sprite missing ${key}`);
      const im = await texImage(s.tex);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(s.rw)); c.height = Math.max(1, Math.round(s.rh));
      const g = c.getContext('2d');
      // Unity texture rect y is measured from the bottom of the texture.
      const sy = im.height - s.y - s.h;
      const dy = c.height - s.oy - s.h;
      g.drawImage(im, s.x, sy, s.w, s.h, s.ox, dy, s.w, s.h);
      return c;
    })());
  }
  return spriteCache.get(key);
}

const urlCache = new Map();
export function spriteURL(key) {
  if (!urlCache.has(key)) {
    urlCache.set(key, spriteCanvas(key).then(c => new Promise(res => c.toBlob(b => res(URL.createObjectURL(b))))));
  }
  return urlCache.get(key);
}

// Resolve a {"$": key} reference to its record kind.
export function refKey(v) { return v && typeof v === 'object' && '$' in v ? v.$ : null; }

// Localization
let curLang = 'English';
export function setLanguage(l) { if (A.lang && A.lang[l]) curLang = l; }
export function getLanguage() { return curLang; }
export function tr(key) {
  const t = A.lang && (A.lang[curLang] || A.lang.English);
  return (t && t[key] != null) ? t[key] : ((A.lang && A.lang.English && A.lang.English[key]) ?? key);
}
