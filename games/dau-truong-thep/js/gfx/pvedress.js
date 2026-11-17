// Phó bản stage dressing that the layout does not carry: the train's rail loop and the warship's water lane. Built once per match
// from the boss rows (def.rail, def.lane), so the guest's mirror draws the same; read-only on the match.
import * as THREE from '../../vendor/three.module.min.js';
import { railAt } from '../data.js';

export function makePveDress(G) {
  const group = new THREE.Group();
  group.name = 'pveDress';
  G.scene.add(group);
  let built = null, glow = null, water = null;

  function clear() {
    for (const o of group.children.slice()) { group.remove(o); o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
    glow = null; water = null;
  }

  // Two steel rails, a sleeper every 1.1 m, and an orange live strip between the rails: standing on it burns (the telegraph).
  function rail(R) {
    const L = railAt(R, 0).len, n = Math.round(L / 1.1);
    const sleeper = new THREE.BoxGeometry(0.5, 0.12, 3.4), steel = new THREE.BoxGeometry(1.15, 0.14, 0.12);
    const sleepers = new THREE.InstancedMesh(sleeper, new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 }), n);
    const rails = new THREE.InstancedMesh(steel, new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.8, roughness: 0.35 }), n * 2);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
    const live = [];
    for (let i = 0; i < n; i++) {
      const p = railAt(R, i * L / n);
      Q.setFromAxisAngle(Y, -p.h);
      sleepers.setMatrixAt(i, M.compose(P.set(p.x, 0.05, p.z), Q, S1));
      for (const side of [-1, 1]) {
        const ox = -Math.sin(p.h) * 1.15 * side, oz = Math.cos(p.h) * 1.15 * side;
        rails.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), M.compose(P.set(p.x + ox, 0.14, p.z + oz), Q, S1));
      }
      live.push(new THREE.Vector3(p.x, 0.04, p.z));
    }
    live.push(live[0].clone());
    const strip = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(live, true), n * 2, 0.42, 4, true);
    strip.scale(1, 0.15, 1);
    glow = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    glow.renderOrder = 1;
    group.add(sleepers, rails, glow);
  }

  // A strip of dark water along the lane, the full width of the arena, with a pale foam edge on the arena side.
  function lane(Ln, map) {
    const w = map.w, edge = -map.hd, depth = Math.abs(Ln.z - edge) * 2 + 1;
    const g = new THREE.PlaneGeometry(w, depth, 48, 6);
    g.rotateX(-Math.PI / 2);
    water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1d4f78, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 }));
    water.position.set(0, 0.03, edge + depth / 2 - 0.5);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7, toneMapped: false }));
    foam.position.set(0, 0.05, edge + depth - 0.75);
    group.add(water, foam);
  }

  function update(m, time) {
    if (!m || m.mode !== 'pve') { if (built) { clear(); built = null; } return; }
    if (built !== m) {
      clear(); built = m;
      const seen = new Set();
      for (const u of m.units) {
        if (seen.has(u.mech)) continue;
        seen.add(u.mech);
        if (u.def.rail) rail(u.def.rail);
        if (u.def.lane) lane(u.def.lane, m.map);
      }
    }
    if (glow) glow.material.opacity = 0.4 + 0.25 * Math.sin(time * 4);
    if (water) water.position.y = 0.03 + 0.02 * Math.sin(time * 1.3);
  }
  return { group, update, clear };
}
