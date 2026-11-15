// Helpers for composed scenes (campfire, workshop): dark grid floor, flickering fire light, hand sockets that follow
// a CPU-skinned Figure's hand bone (to hold separate meshes such as stylized-weapons guns), and grip IK wiring from a
// weapon's grip2 socket. Props come from the sibling kits snapshotted in ./ext (tools/sync-ext.sh); a missing prop id
// falls back to a labelled placeholder box so the scene still renders.
import { THREE } from '../lf-host.js';
import { attachGrip } from '../arm-ik.js';
import { handFrame, AIM, PROP_K } from './props.js';

export function gridFloor(size = 30, o = {}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: o.col || 0x07080c, roughness: 0.95 }));
  base.rotation.x = -Math.PI / 2; base.receiveShadow = true; g.add(base);
  const grid = new THREE.GridHelper(size, size / (o.cell || 0.6), o.line || 0x343846, o.line || 0x343846); grid.position.y = 0.002; grid.material.transparent = true; grid.material.opacity = 0.9; g.add(grid);
  return g;
}
export function flickerLight(col = 0xff9a3a, inten = 18, dist = 9) {
  const L = new THREE.PointLight(col, inten, dist, 1.6); L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; L.shadow.radius = 5;
  L.userData.base = inten; L.userData.tick = (t) => { L.intensity = inten * (0.86 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 31.7 + 1.3) + 0.04 * Math.sin(t * 7.3)); };
  return L;
}

const MODE = { blade: Math.PI / 2, gun: Math.PI - AIM, hang: 0 };
// rest-space frame of a hand: T(hand) * Rx(mode) * S(PROP_K)
function frameMatrix(P, side, mode) { const [x, y] = handFrame(P, side); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(MODE[mode] || 0, 0, 0)), new THREE.Vector3(PROP_K, PROP_K, PROP_K)); }
// an Object3D under the figure's mesh that tracks the hand frame (local +Y forward, +Z down in 'blade' mode)
export class HandSocket {
  constructor(fig, side = -1, mode = 'blade') {
    this.fig = fig; this.b = fig.rig.names[side > 0 ? 'wL' : 'wR']; this.F = frameMatrix(fig.P, side, mode);
    this.obj = new THREE.Object3D(); this.obj.matrixAutoUpdate = false; fig.mesh.add(this.obj); this.M = new THREE.Matrix4();
    this.update();
  }
  update() {
    const R = this.fig.R, O = this.fig.O, a = this.b * 9, o = this.b * 3;
    this.M.set(R[a], R[a + 1], R[a + 2], O[o], R[a + 3], R[a + 4], R[a + 5], O[o + 1], R[a + 6], R[a + 7], R[a + 8], O[o + 2], 0, 0, 0, 1);
    this.obj.matrix.multiplyMatrices(this.M, this.F); this.obj.matrixWorldNeedsUpdate = true;
  }
}
// put a stylized-weapons group in a socket (weapons kit inHand) and pin the other hand to its grip2 with arm IK
export function holdWeapon(actor, group, inHand, o = {}) {
  const sock = new HandSocket(actor.fig, -1, o.mode || 'gun');
  inHand(group, sock.obj, 'r', new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
  if (o.offset) group.position.add(new THREE.Vector3(...o.offset));
  group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  const g2 = group.getObjectByName('grip2');
  if (g2 && o.twoHand !== false) {
    group.updateMatrix(); const p = g2.position.clone().applyMatrix4(group.matrix).applyMatrix4(sock.F);
    attachGrip(actor.fig, { side: 1, bone: 'wR', point: [p.x, p.y, p.z], pole: o.pole || [0.5, -1, -0.35], w: 1 });
  }
  actor.sockets = (actor.sockets || []).concat(sock);
  return sock;
}
export function placeholder(label, size = [0.5, 0.5, 0.5], col = 0x6a6a72) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
  m.position.y = size[1] / 2; m.castShadow = m.receiveShadow = true; const g = new THREE.Group(); g.add(m); g.userData.placeholder = label; return g;
}
// build a prop from the props kit, or a placeholder if the id is missing
export function propOr(kit, id, seed, opts, fallbackSize) {
  try { if (kit && kit.propInfo(id)) { const p = kit.buildProp(id, seed, opts || {}); p.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return p; } } catch (e) { console.warn('prop build failed: ' + id + ' (' + e.message + ')'); }
  return placeholder(id, fallbackSize);
}
