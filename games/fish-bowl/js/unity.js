// Small helpers for reading Unity data (components.json, scene.json "k" components) in three.js space.
// The exporter flips z (Unity is left-handed): positions convert with (x, y, -z), rotations with (-x, -y, z, w).
import * as THREE from 'three';

export const U = v => new THREE.Vector3(v.x, v.y, -v.z);
export const UQ = q => new THREE.Quaternion(-q.x, -q.y, q.z, q.w);
const D2R = Math.PI / 180;

// Unity Quaternion.Euler(x, y, z) (degrees) rotates about z, then x, then y; returned in three space.
export function unityEuler(e) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x * D2R, e.y * D2R, e.z * D2R, 'YXZ'));
  return UQ(q);
}

// "@<path>#<Type>" -> {path, type}; plain "@<path>" -> type null.
export function parseRef(ref) {
  if (typeof ref !== 'string' || ref[0] !== '@') return null;
  const s = ref.slice(1);
  const i = s.lastIndexOf('#');
  return i < 0 ? { path: s, type: null } : { path: s.slice(0, i), type: s.slice(i + 1) };
}

// "AS.ActivityManager" -> "ActivityManager", "UnityEngine.GameObject" -> "GameObject"
export const shortType = t => (t || '').split('.').pop();

export function activeInHierarchy(o) {
  for (let a = o; a; a = a.parent) if (!a.visible) return false;
  return true;
}

// Components of a scene node as a list (scene.json keeps one object per type, or a list when a node has several).
export function nodeComps(obj, type) {
  const k = obj && obj.userData.node && obj.userData.node.k;
  const c = k && k[type];
  return !c ? [] : Array.isArray(c) ? c : [c];
}

const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const inv = new THREE.Matrix4();

// BoxCollider of a node as a world-space oriented box test. Unity m_Center/m_Size are in the node's local space.
export class BoxVolume {
  constructor(obj, box) {
    this.obj = obj;
    this.center = U(box.m_Center);
    this.half = new THREE.Vector3(Math.abs(box.m_Size.x), Math.abs(box.m_Size.y), Math.abs(box.m_Size.z)).multiplyScalar(0.5);
  }

  // Sphere (world centre p, radius r) overlaps the box.
  overlaps(p, r = 0) {
    this.obj.updateWorldMatrix(true, false);
    inv.copy(this.obj.matrixWorld).invert();
    tmpV.copy(p).applyMatrix4(inv).sub(this.center);
    this.obj.getWorldScale(tmpS);
    return Math.abs(tmpV.x) <= this.half.x + r / Math.abs(tmpS.x || 1)
      && Math.abs(tmpV.y) <= this.half.y + r / Math.abs(tmpS.y || 1)
      && Math.abs(tmpV.z) <= this.half.z + r / Math.abs(tmpS.z || 1);
  }

  worldCenter(out = new THREE.Vector3()) {
    this.obj.updateWorldMatrix(true, false);
    return out.copy(this.center).applyMatrix4(this.obj.matrixWorld);
  }
}

// World AABB of the meshes under obj (only meshes, so empty helper nodes do not stretch it).
export function meshBox(obj, box = new THREE.Box3()) {
  box.makeEmpty();
  obj.updateWorldMatrix(true, true);
  obj.traverse(o => { if (o.isMesh) box.expandByObject(o); });
  return box;
}

// DOTween Ease enum -> f(t)
const EASE = {
  1: t => t,
  2: t => 1 - Math.cos((t * Math.PI) / 2),
  3: t => Math.sin((t * Math.PI) / 2),
  4: t => -(Math.cos(Math.PI * t) - 1) / 2,
  5: t => t * t,
  6: t => 1 - (1 - t) * (1 - t),
  7: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  8: t => t * t * t,
  9: t => 1 - (1 - t) ** 3,
  10: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};
export const ease = (id, t) => (EASE[id] || EASE[6])(Math.min(1, Math.max(0, t)));
