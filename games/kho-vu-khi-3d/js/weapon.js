// Weapon registry. weapon(id, name, def, fn) defines a weapon; build(seed, {variant}) returns a THREE.Group with
// merged meshes (one per material), empty Object3D sockets 'grip', 'grip2', 'muzzle', 'tip', 'edge' and
// userData.weapon metadata. Same contract as D:\stylized-weapons (inHand / gripWorld work unchanged).
// Frames: melee/tools stand along +Y (tip up, edge +X, flat faces +/-Z), units cm while authoring.
// Guns are authored in Saltline's gun frame (metres, forward -Z) and turned so the muzzle points +X, top +Y.
import * as THREE from '../vendor/three.module.min.js';
import { Kit } from './kit.js';

export const REGISTRY = [];
let MATS = null;
export function setMats(m) { MATS = m; }

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function weapon(id, name, def, fn) {
  const w = {
    id, name, def, kind: def.kind || 'melee', hands: def.hands || 1, gun: !!def.gun,
    build(seed = 1, opts = {}) {
      const variant = opts.variant || 0;
      const k = new Kit(opts.mats || MATS, seed, variant, def.gun ? 1 : 0.01);
      if (def.blood !== undefined) k.defBlood = def.blood;
      fn(k, variant);
      const body = k.finish();
      const root = new THREE.Group(); root.name = id;
      // gun frame -> +X muzzle: rotate -90 deg about Y (gun -Z becomes +X, gun +X becomes +Z)
      const toOut = def.gun ? (p) => new THREE.Vector3(p[2] !== undefined ? -p[2] : 0, p[1], p[0]) : (p) => V(p).multiplyScalar(0.01);
      const dirOut = def.gun ? (d) => new THREE.Vector3(-d[2], d[1], d[0]).normalize() : (d) => V(d).normalize();
      if (def.gun) body.rotation.y = -Math.PI / 2;
      root.add(body);
      const s = k.sock, meta = {
        id, name, kind: w.kind, hands: w.hands, variant, seed, tris: body.userData.tris,
      };
      const mark = (n, pos) => { const o = new THREE.Object3D(); o.name = n; o.position.copy(pos); root.add(o); return o; };
      if (s.grip) { meta.grip = { pos: toOut(s.grip.pos), fwd: dirOut(s.grip.fwd), up: dirOut(s.grip.up) }; mark('grip', meta.grip.pos); }
      if (s.grip2) { meta.grip2 = { pos: toOut(s.grip2.pos), fwd: dirOut(s.grip2.fwd), up: dirOut(s.grip2.up) }; mark('grip2', meta.grip2.pos); }
      if (s.muzzle) { meta.muzzle = { pos: toOut(s.muzzle.pos), dir: dirOut(s.muzzle.dir) }; mark('muzzle', meta.muzzle.pos); }
      if (s.tip) { meta.tip = toOut(s.tip); mark('tip', meta.tip); }
      if (s.edge) { meta.edge = { a: toOut(s.edge.a), b: toOut(s.edge.b) }; mark('edge', meta.edge.a.clone().add(meta.edge.b).multiplyScalar(0.5)); }
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(body); meta.size = box.getSize(new THREE.Vector3());
      meta.bounds = box;
      root.userData.weapon = meta;
      return root;
    },
  };
  REGISTRY.push(w);
  return w;
}
