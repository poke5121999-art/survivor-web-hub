import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { buildHouse } from './house3d.js';
import { makeButton } from './truck.js';
import { Ring } from './hudx.js';

// Service station between houses: a small room made with the house builder (so walls, floors, lamps and doors-less styling match
// the houses), shelves with a few offers, a pay pad (3 s hold) and the floor button that sends the truck off.
// Working now: health packs 25/50/100 (1800/4000/9000) and potions hp+20 (6000), stamina+10 (2000), strength+10 (6000).
// Gear (gun, bat, battery, tranq) is on display and marked unavailable.

export const OFFERS = [
  { id: 'pack25', name: 'Gói máu 25', price: 1800, stock: 3, kind: 'pack', hp: 25, color: 0xe8eef2, cross: 0xe0453a },
  { id: 'pack50', name: 'Gói máu 50', price: 4000, stock: 2, kind: 'pack', hp: 50, color: 0xe8eef2, cross: 0xe0453a },
  { id: 'pack100', name: 'Gói máu 100', price: 9000, stock: 1, kind: 'pack', hp: 100, color: 0xe8eef2, cross: 0xe0453a },
  { id: 'potion_hp', name: 'Thuốc máu +20', price: 6000, stock: 1, kind: 'potion', hpMax: 20, color: 0xff5a6e },
  { id: 'potion_st', name: 'Thuốc thể lực +10', price: 2000, stock: 1, kind: 'potion', staminaMax: 10, color: 0xe6e14a },
  { id: 'potion_str', name: 'Thuốc sức +10', price: 6000, stock: 1, kind: 'potion', str: 10, color: 0x4aa8ff },
];
export const GEAR_DISPLAY = [
  { id: 'gun', name: 'Súng lục', price: 9000, shape: 'gun' },
  { id: 'bat', name: 'Gậy', price: 8000, shape: 'bat' },
  { id: 'battery', name: 'Pin xe', price: 6000, shape: 'battery' },
  { id: 'tranq', name: 'Thuốc mê', price: 12000, shape: 'tranq' },
];
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
const PAY_HOLD = 3;

// icon + number labels (no words): kind 'pack' | 'potion' | 'gone' | 'pay' | 'sign'
function labelSprite(kind, text, color = '#fff', w = 1.5) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,12,16,0.82)'; g.fillRect(0, 0, 384, 128);
  g.strokeStyle = kind === 'gone' ? '#ff6a5a' : '#3be68a'; g.lineWidth = 4; g.strokeRect(2, 2, 380, 124);
  if (kind === 'pack') { g.fillStyle = '#e8eef2'; g.fillRect(24, 34, 64, 60); g.fillStyle = '#e0453a'; g.fillRect(48, 42, 16, 44); g.fillRect(34, 56, 44, 16); }
  else if (kind === 'potion') { g.fillStyle = color; g.beginPath(); g.arc(56, 76, 26, 0, 7); g.fill(); g.fillRect(48, 26, 16, 30); g.fillStyle = '#8a5a33'; g.fillRect(46, 18, 20, 10); }
  else if (kind === 'gone') { g.strokeStyle = '#ff6a5a'; g.lineWidth = 12; g.beginPath(); g.moveTo(26, 30); g.lineTo(86, 98); g.moveTo(86, 30); g.lineTo(26, 98); g.stroke(); }
  else if (kind === 'pay') { g.strokeStyle = '#9fe8ff'; g.lineWidth = 10; g.beginPath(); g.arc(192, 64, 40, -Math.PI / 2, Math.PI, false); g.stroke(); g.fillStyle = '#9fe8ff'; g.beginPath(); g.moveTo(180, 12); g.lineTo(206, 24); g.lineTo(180, 36); g.fill(); }
  if (text) { g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = kind === 'gone' ? '#9aa7b4' : '#5ee3a0'; g.font = '800 58px system-ui, sans-serif'; g.fillText(text, 112, 66); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, toneMapped: false }));
  sp.scale.set(w, w * 128 / 384, 1);
  return sp;
}

function packMesh(o) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.5 }));
  const cm = new THREE.MeshStandardMaterial({ color: o.cross, roughness: 0.5, emissive: o.cross, emissiveIntensity: 0.25 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.045), cm), b = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.16), cm);
  a.position.y = b.position.y = 0.113;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0x30363c, roughness: 0.6 }));
  handle.position.y = 0.125;
  g.add(body, a, b, handle);
  return { mesh: g, shape: (R) => R.ColliderDesc.cuboid(0.18, 0.11, 0.13), mass: 8 };
}
function potionMesh(o) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.15, metalness: 0.1, emissive: o.color, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 });
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), glass); belly.position.y = 0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 10), glass); neck.position.y = 0.15;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 })); cork.position.y = 0.23;
  g.add(belly, neck, cork);
  return { mesh: g, shape: (R) => R.ColliderDesc.cylinder(0.14, 0.1), mass: 6 };
}
function gearMesh(shape) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x59636d, roughness: 0.45, metalness: 0.7 });
  const d = new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.6, metalness: 0.3 });
  if (shape === 'gun') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.07), m)); const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.07), d); h.position.set(-0.1, -0.12, 0); g.add(h); }
  else if (shape === 'bat') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.025, 0.62, 10), new THREE.MeshStandardMaterial({ color: 0x9a6b3c, roughness: 0.75 })); b.rotation.z = Math.PI / 2; g.add(b); }
  else if (shape === 'battery') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.16), d)); const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xf0b81c, emissive: 0xf0b81c, emissiveIntensity: 0.4 })); t.position.y = 0.12; g.add(t); }
  else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 10), m); b.rotation.z = Math.PI / 2; g.add(b); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), m); n.rotation.z = Math.PI / 2; n.position.x = 0.2; g.add(n); }
  return g;
}

export function buildStation(G, run) {
  const { scene, phys } = G;
  const W = 22, H = 12;
  const grid = new Uint8Array(W * H), block = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[y * W + x] = (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 2 : 1;
  const layout = {
    w: W, h: H, grid, block, doors: [], props: [], lights: [{ x: 4, y: 3, name: 'light_strip' }, { x: 17, y: 3, name: 'light_strip' }],
    loot: [], pads: [], foes: [], traps: [],
    rooms: [{ id: 0, kind: 'special', x: 1, y: 1, w: W - 2, h: H - 2, template: 'station' }],
    start: { x: 3, y: 6 }, meta: { theme: 'spacestation', houseIndex: 1, seed: 11 + run.house },
  };
  const house = buildHouse(G, layout, 'spacestation');
  house.spawn.yaw = -Math.PI / 2;   // face east, the shelves are along the north wall
  const root = new THREE.Group(); root.name = 'station'; scene.add(root);
  const disposables = [];
  const bodies = [];
  const items = [];
  const statics = [];

  const metal = new THREE.MeshStandardMaterial({ color: 0x56606a, roughness: 0.5, metalness: 0.6 }); disposables.push(metal);
  const topM = new THREE.MeshStandardMaterial({ color: 0xaab4be, roughness: 0.35, metalness: 0.7 }); disposables.push(topM);
  const trim = new THREE.MeshStandardMaterial({ color: 0x40d0e8, emissive: 0x40d0e8, emissiveIntensity: 0.8, roughness: 0.4 }); disposables.push(trim);
  const TOP = 0.85;
  const pedestal = (x, z) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, TOP - 0.06, 0.9), metal); base.position.set(x, (TOP - 0.06) / 2, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 1.02), topM); top.position.set(x, TOP - 0.03, z);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.02), trim); strip.position.set(x, 0.45, z + 0.46);
    for (const m of [base, top]) { m.castShadow = m.receiveShadow = true; }
    root.add(base, top, strip);
    disposables.push(base.geometry, top.geometry, strip.geometry);
    bodies.push(phys.fixedBox(x, TOP / 2, z, 0.81, TOP / 2, 0.51));
  };

  // offers along the north wall
  const Z0 = 2.3;
  OFFERS.forEach((o, i) => {
    const x = 4.5 + i * 2.9;
    pedestal(x, Z0);
    const lab = labelSprite(o.kind, fmt(o.price).slice(1), '#' + o.color.toString(16).padStart(6, '0'), 1.5); lab.position.set(x, TOP + 1.05, Z0); root.add(lab); disposables.push(lab.material.map, lab.material);
    for (let k = 0; k < o.stock; k++) {
      const part = o.kind === 'pack' ? packMesh(o) : potionMesh(o);
      const off = (k - (o.stock - 1) / 2) * 0.42;
      const rec = phys.dynamicBody(part.shape(phys.R), { x: x + off, y: TOP + 0.2, z: Z0 }, part.mass * CFG.loot.kgPerMass, part.mesh, 'station');
      part.mesh.traverse((m) => { m.castShadow = true; });
      scene.add(part.mesh);
      rec.grabbable = true; rec.mass = part.mass; rec.kg = part.mass * CFG.loot.kgPerMass; rec.offer = o; rec.price = o.price;
      items.push(rec);
    }
  });
  // gear on display along the south wall (not for sale yet)
  GEAR_DISPLAY.forEach((o, i) => {
    const x = 6.5 + i * 2.9, z = H - 3.2;
    pedestal(x, z);
    const m = gearMesh(o.shape); m.position.set(x, TOP + 0.14, z); m.traverse((q) => { q.castShadow = true; }); root.add(m);
    const lab = labelSprite('gone', fmt(o.price).slice(1), '#fff', 1.5); lab.position.set(x, TOP + 1.0, z); root.add(lab); disposables.push(lab.material.map, lab.material);
    statics.push(m);
  });
  // wall sign

  // pay pad
  const pad = { x: 17.5, z: 7.0, half: CFG.extract.padSize / 2 };
  const padMat = new THREE.MeshStandardMaterial({ color: 0x1c4a5a, emissive: 0x40d0e8, emissiveIntensity: 0.5, roughness: 0.5 }); disposables.push(padMat);
  const padMesh = new THREE.Mesh(new THREE.BoxGeometry(pad.half * 2, 0.03, pad.half * 2), padMat); padMesh.position.set(pad.x, 0.016, pad.z); padMesh.receiveShadow = true; root.add(padMesh); disposables.push(padMesh.geometry);
  const padRing = new THREE.Mesh(new THREE.BoxGeometry(pad.half * 2 + 0.2, 0.02, pad.half * 2 + 0.2), new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.8 })); padRing.position.set(pad.x, 0.008, pad.z); root.add(padRing); disposables.push(padRing.geometry, padRing.material);
  const padLabel = labelSprite('pay', '', '#fff', 1.3); padLabel.position.set(pad.x, 1.3, pad.z - pad.half - 0.3); root.add(padLabel); disposables.push(padLabel.material.map, padLabel.material);
  const payRing = new Ring(scene, pad.x, pad.z, pad.half * 1.2, pad.half * 1.34, 0x9fe8ff, 0.05);
  const padLight = new THREE.PointLight(0x40d0e8, 1.6, 6, 2); padLight.position.set(pad.x, 0.8, pad.z); root.add(padLight);

  // depart button next to the start cell
  const button = makeButton(G, 3.0, 9.0, 'XUẤT PHÁT');

  const S = {
    house, pad, button, items, offers: OFFERS, payHold: 0, total: 0, status: '', bought: [], payHoldSec: PAY_HOLD,
    spawn: house.spawn,
  };

  const onPad = (pos) => Math.abs(pos.x - pad.x) <= pad.half && Math.abs(pos.z - pad.z) <= pad.half && pos.y < 1.6;
  S.itemsOnPad = () => items.filter((r) => !r.dead && !r.held && onPad(r.body.translation()));

  /** per physics tick: pad total, hold, purchase. `wallet` is read from run; `buy(offers)` applies it. Returns { departed }. */
  S.step = (dt, playerPos, wallet, buy) => {
    const on = S.itemsOnPad();
    S.total = on.reduce((s, r) => s + r.price, 0);
    const standing = onPad(playerPos);
    if (standing && S.total > 0 && S.total <= wallet) {
      S.payHold += dt; S.status = '';
      if (S.payHold >= PAY_HOLD) {
        S.payHold = 0;
        for (const r of on) { buy(r.offer); S.destroyItem(r); S.bought.push(r.offer.id); }
        S.total = 0;
      }
    } else {
      S.payHold = 0;
      S.status = standing && S.total > wallet ? 'Không đủ tiền' : '';
    }
    return { depart: S.button.step(dt, playerPos, true) };
  };
  S.destroyItem = (r) => {
    r.dead = true;
    scene.remove(r.mesh);
    const i = items.indexOf(r); if (i >= 0) items.splice(i, 1);
    if (G.grab?.held === r) G.grab.release(false);
    phys.remove(r);
  };
  S.update = (dtMs) => {
    button.update(dtMs);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    payRing.set(S.payHold / PAY_HOLD);
    padMat.emissiveIntensity = S.total > 0 ? 0.6 + 0.5 * pulse : 0.35;
  };
  S.dispose = () => {
    for (const r of [...items]) { r.dead = true; scene.remove(r.mesh); try { phys.remove(r); } catch (e) { /* gone */ } }
    items.length = 0;
    button.dispose(); payRing.dispose();
    scene.remove(root);
    for (const b of bodies) { try { phys.world.removeRigidBody(b); } catch (e) { /* gone */ } }
    for (const d of disposables) d.dispose?.();
    house.dispose();
  };
  return S;
}
