// Robot character kit: every crew member, foe and boss built from code (no model, texture or animation files).
// buildRobot({ kind, id }) -> { root, height, animate(dt, state) }. Robots face +Z with feet on y = 0.
// state: { speed m/s, carrying, attack 0..1 phase, hurt 0..1, down, look yaw rad, reveal 0..1 (impostor) }.
// Geometry is built once per id and shared by every instance; only the two glow materials are per instance.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, sharedMats } from './robots/kit.js';
import { makeAnimator } from './robots/anim.js';
import { CREW_IDS, crewPal, buildCrew } from './robots/crew.js';
import { FOES } from './robots/foes.js';
import { BOSSES } from './robots/bosses.js';

export const ROBOT_IDS = { crew: CREW_IDS.slice(), foe: Object.keys(FOES), boss: Object.keys(BOSSES) };
export const robotStats = {};
const cache = new Map();

function design(kind, id) {
  if (kind === 'crew' && CREW_IDS.includes(id)) return { pal: crewPal(id), build: (B) => buildCrew(B, id) };
  if (kind === 'foe' && FOES[id]) return FOES[id];
  if (kind === 'boss' && BOSSES[id]) return BOSSES[id];
  throw new Error(`robot not found: ${kind}/${id}`);
}

function template(kind, id) {
  const key = kind + ':' + id;
  let t = cache.get(key);
  if (t) return t;
  const t0 = performance.now();
  const d = design(kind, id);
  let seed = 0; for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
  const B = new Kit(d.pal, seed, d.fx || null);
  const cfg = d.build(B);
  const root = B.finish();
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), mb = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(mb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
  let meshes = 0; root.traverse((o) => { if (o.isMesh) meshes++; });
  t = { root, cfg, pal: d.pal, height: box.max.y, tris: Math.round(B.tris), meshes, ms: performance.now() - t0 };
  robotStats[key] = { tris: t.tris, meshes, buildMs: +t.ms.toFixed(2), height: +t.height.toFixed(2) };
  cache.set(key, t);
  return t;
}

export function buildRobot(spec) {
  const kind = spec.kind || 'crew', id = spec.id;
  const t = template(kind, id);
  const root = t.root.clone(true);
  root.name = 'robot:' + kind + ':' + id;
  const M = sharedMats();
  const glow = { glow: M.glow.clone(), glow2: M.glow2.clone() };
  glow.glow.color.set(t.pal.e); glow.glow2.color.set(t.pal.g ?? t.pal.e);
  const J = {};
  let halos = false;
  root.traverse((o) => {
    if (o.isMesh) { if (glow[o.userData.mat]) o.material = glow[o.userData.mat]; }
    else if (o.isSprite) halos = true;
    else if (o.name && o !== root) J[o.name] = o;
  });
  const glowMats = [{ key: 'glow', mat: glow.glow, base: glow.glow.color.clone() }, { key: 'glow2', mat: glow.glow2, base: glow.glow2.color.clone() }];
  if (halos) {
    // per-instance halo materials follow the eye colour, flicker and tint (glowMats)
    glow.halo = M.halo.clone(); glow.halo2 = M.halo2.clone();
    glow.halo.color.set(t.pal.e).multiplyScalar(t.pal.hk ?? 0.9); glow.halo2.color.set(t.pal.g ?? t.pal.e).multiplyScalar(t.pal.hk ?? 0.9);
    root.traverse((o) => { if (o.isSprite) o.material = glow[o.userData.mat]; });
    glowMats.push({ key: 'glow', mat: glow.halo, base: glow.halo.color.clone(), halo: true }, { key: 'glow2', mat: glow.halo2, base: glow.halo2.color.clone(), halo: true });
  }
  const animate = makeAnimator(J, t.cfg, glowMats);
  animate(0, {});
  return { root, height: t.height, animate, joints: J, kind, id, dispose() { for (const k in glow) glow[k].dispose(); } };
}
