import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

// Throwaway slice room for the grab/break/extract prototype; the house generator replaces it.
export function buildTestRoom(G) {
  const { scene, phys } = G;
  const W = 14, D = 10, H = CFG.wallH, T = 0.2;
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3c, roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6e6a5f, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.6 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), floorMat);
  floor.position.y = -T / 2; floor.receiveShadow = true; scene.add(floor);
  phys.fixedBox(0, -T / 2, 0, W / 2, T / 2, D / 2);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), wallMat);
  ceil.position.y = H + T / 2; scene.add(ceil);
  phys.fixedBox(0, H + T / 2, 0, W / 2, T / 2, D / 2);

  const wall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    phys.fixedBox(x, H / 2, z, w / 2, H / 2, d / 2);
  };
  wall(0, -D / 2 - T / 2, W + 2 * T, T); wall(0, D / 2 + T / 2, W + 2 * T, T);
  wall(-W / 2 - T / 2, 0, T, D); wall(W / 2 + T / 2, 0, T, D);
  wall(1.5, -1.5, 0.2, 4);

  const table = (x, z, w, d, h) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), woodMat);
    top.position.set(x, h, z); top.castShadow = top.receiveShadow = true; scene.add(top);
    phys.fixedBox(x, h, z, w / 2, 0.03, d / 2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), woodMat);
      leg.position.set(x + sx * (w / 2 - 0.06), h / 2, z + sz * (d / 2 - 0.06)); leg.castShadow = true; scene.add(leg);
      phys.fixedBox(leg.position.x, h / 2, leg.position.z, 0.03, h / 2, 0.03);
    }
  };
  table(-3.5, -2.5, 1.8, 0.9, 0.78);
  table(4.5, 2.8, 1.4, 0.8, 0.95);

  scene.add(new THREE.AmbientLight(0x8090b0, 0.08));
  const lamp = (x, z, c, i) => {
    const l = new THREE.PointLight(c, i, 9, 2);
    l.position.set(x, H - 0.25, z); l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002;
    scene.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: c }));
    bulb.position.copy(l.position); scene.add(bulb);
  };
  lamp(-3.5, -2, 0xffc890, 6);
  lamp(4, 2.5, 0xffb070, 4);

  const loot = [
    { material: 'ceramic', size: 'small', pos: { x: -3.9, y: 1.0, z: -2.5 } },
    { material: 'ceramic', size: 'medium', pos: { x: -3.0, y: 1.2, z: -2.5 } },
    { material: 'wood', size: 'medium', pos: { x: 2.5, y: 0.4, z: -3.5 } },
    { material: 'metal', size: 'small', pos: { x: 4.5, y: 1.2, z: 2.8 } },
    { material: 'metal', size: 'big', pos: { x: 5.2, y: 0.6, z: -3.2 } },
    { material: 'ceramic', size: 'big', pos: { x: -5.6, y: 0.7, z: -0.5 } },
    { material: 'soul', size: 'small', pos: { x: 0.0, y: 0.4, z: 3.0 } },
    { material: 'wood', size: 'small', pos: { x: -1.0, y: 0.3, z: -3.8 } },
  ];
  for (const l of loot) G.loot.spawn({ ...l, rng: G.rng });

  const pad = { x: -4.8, z: 3.4, half: CFG.extract.padSize / 2, quota: 6000 };
  const padMesh = new THREE.Mesh(new THREE.BoxGeometry(pad.half * 2, 0.03, pad.half * 2), new THREE.MeshStandardMaterial({ color: 0x1c4030, emissive: 0x2bff9a, emissiveIntensity: 0.25, roughness: 0.6 }));
  padMesh.position.set(pad.x, 0.015, pad.z); padMesh.receiveShadow = true; scene.add(padMesh);
  const padLight = new THREE.PointLight(0x40ffa0, 1.2, 4, 2); padLight.position.set(pad.x, 0.6, pad.z); scene.add(padLight);
  pad.mesh = padMesh;
  return { spawn: { x: 0, z: 1.5, yaw: Math.PI * 0.75 }, pads: [pad] };
}
