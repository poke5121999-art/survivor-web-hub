// weapon(): defines a weapon; .build(seed, opts) returns a THREE.Group (one merged Mesh + socket empties).
import * as THREE from './three.js';
import { Kit } from './kit.js';
import { makeWearMaterial } from './wear.js';

const SC = 0.01; // cm -> m

export function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aInfo']) {
    const a = new Float32Array(n * 3); let o = 0;
    for (const g of geos) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, 3));
  }
  return out;
}

/**
 * def: { id, name, hands: 1|2, kind: 'melee'|'gun'|'shield'|'tool', blood, rust, hue, clean, rot (sheet pose, deg) }
 * fn(k, v): draw with Kit k (cm), call k.grip()/grip2()/muzzle()/tip()/edge(); v = variant (0 sheet look, 1 alt wear)
 */
export function weapon(id, name, def, fn) {
  const w = {
    id, name, hands: 1, kind: 'melee', ...def,
    build(seed = 1, opts = {}) {
      const v = opts.variant | 0;
      const k = new Kit(seed, v, w);
      fn(k, v);
      const fat = w.fat || [1, 1, 1];
      if (fat[0] !== 1 || fat[1] !== 1 || fat[2] !== 1) for (const g of k.parts) if (!g.userData.nofat) g.scale(fat[0], fat[1], fat[2]);
      const geo = mergeGeos(k.parts);
      geo.scale(SC, SC, SC);
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      const clean = !!w.clean;
      const wear = v === 0
        ? { rust: w.rust ?? (clean ? 0 : 0.3), dirt: clean ? 0.04 : 0.32, chip: clean ? 0.04 : 0.18, blood: w.blood ?? 0 }
        : { rust: clean ? 0.05 : Math.min(0.6, (w.rust ?? 0.3) + 0.2), dirt: clean ? 0.2 : 0.55, chip: clean ? 0.12 : 0.33, blood: 0 };
      const mat = makeWearMaterial({ seed: seed + id.length * 3 + v * 11, ...wear });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'body';
      const g = new THREE.Group();
      g.name = id; g.add(mesh);
      const V = (a) => new THREE.Vector3(a[0] * SC * fat[0], a[1] * SC * fat[1], a[2] * SC * fat[2]);
      const D = (a) => new THREE.Vector3(a[0], a[1], a[2]).normalize();
      const meta = { id, name, hands: w.hands, kind: w.kind, variant: v, seed, tris: geo.attributes.position.count / 3, size: geo.boundingBox.getSize(new THREE.Vector3()) };
      const mark = (nm, p) => { const o = new THREE.Object3D(); o.name = nm; o.position.copy(p); g.add(o); return o; };
      const s = k.sock;
      if (s.grip) { meta.grip = { pos: V(s.grip.pos), fwd: D(s.grip.fwd), up: D(s.grip.up) }; mark('grip', meta.grip.pos); }
      if (s.grip2) { meta.grip2 = { pos: V(s.grip2.pos), fwd: D(s.grip2.fwd), up: D(s.grip2.up) }; mark('grip2', meta.grip2.pos); }
      if (s.muzzle) { meta.muzzle = { pos: V(s.muzzle.pos), dir: D(s.muzzle.dir) }; mark('muzzle', meta.muzzle.pos); }
      if (s.tip) { meta.tip = V(s.tip); mark('tip', meta.tip); }
      if (s.edge) { meta.edge = { a: V(s.edge.a), b: V(s.edge.b) }; mark('edge', meta.edge.a.clone().add(meta.edge.b).multiplyScalar(0.5)); }
      g.userData.weapon = meta;
      return g;
    },
  };
  return w;
}
