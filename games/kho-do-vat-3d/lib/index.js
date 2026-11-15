// Public entry: import { buildProp, PROPS, Prop, parts, ... } from 'D:/stylized-props/lib/index.js'
export { Prop, PRESETS, sharedMaterials, mergeGeoms } from './prop.js';
export { createWearMaterial, createGlowMaterial, createGlassMaterial, wearUniforms } from './wear-material.js';
export { bevelBox, bevelCyl, lathe, torus, extrude, tube, blob, deform, creaseNormals, noise3, setGeoQuality } from './geo.js';
export { makeFire, tickFire } from './fire.js';
export { rng } from './rng.js';
export * as parts from './parts.js';
export * from '../props/index.js';
import { PROPS } from '../props/index.js';
import { tickFire } from './fire.js';

const BY_ID = new Map();
export function propInfo(id) { if (!BY_ID.size) for (const p of PROPS) BY_ID.set(p.id, p); return BY_ID.get(id); }
// buildProp('drum_blue', seed, { wear: 0..1, quality: 0|1, ...prop specific }) -> THREE.Group
export function buildProp(id, seed = 1, opts = {}) {
  const info = propInfo(id);
  if (!info) throw new Error(`prop not found: ${id}`);
  return info.build(seed, opts);
}
// Call once per frame for animated props (fire etc.): updateProps(listOfGroups, dt, t)
export function updateProps(groups, dt, t) {
  tickFire(t);
  for (const g of groups) g.userData.update?.(dt, t);
}
