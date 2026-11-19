import * as THREE from '../vendor/three.module.min.js';
import { Ring } from './hudx.js';

// The crew truck, built from code (no files): ribbed cargo box with an open rear, hazard-striped bumper, cab with headlights,
// a roof beacon, and the floor button the crew stands on to board. Placed in the truck room of the house layout next to the
// start cell: footprint on free floor cells, rear end towards the button, solid colliders.
const LEN = 4.6, WID = 2.1;           // footprint (m)
const BTN = 0.9;                       // button half size
const BOARD_HOLD = 1.5;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function ribbedTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#4c5762'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = '#6a7683'; g.fillRect(x, 0, 3, h);
      g.fillStyle = '#2c333b'; g.fillRect(x + 10, 0, 4, h);
    }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${20 + (i % 40)},${24 + (i % 30)},${28},0.18)`; g.fillRect((i * 37) % w, (i * 91) % h, 2 + (i % 3), 1 + (i % 2)); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10);
  }, [1, 1]);
}
function hazardTexture() {
  return canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#16181a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f0b81c';
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
  });
}
function labelTexture(text, color) {   // icon only: a truck and chevrons (no words on the floor)
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#0b0e10'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = color; g.fillRect(40, 44, 90, 46); g.fillRect(134, 56, 36, 34);
    g.fillStyle = '#0b0e10'; for (const x of [62, 150]) { g.beginPath(); g.arc(x, 96, 13, 0, 7); g.fill(); g.strokeStyle = color; g.lineWidth = 4; g.stroke(); }
    g.lineWidth = 10; g.strokeStyle = color; for (const x of [188, 214]) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 18, 64); g.lineTo(x, 88); g.stroke(); }
  });
}

/** Footprint search on the truck room: returns { cx, cz, alongX, hx, hz } or null. */
function findSpot(layout, start, pad0) {
  const { grid, block, w: W } = layout;
  const r = layout.rooms[0];
  const free = (x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && grid[y * W + x] === 1 && !block[y * W + x];
  const car = r.car || { x: start.x + 0.5, y: start.y + 0.5 };
  const bx = start.x + 0.5, bz = start.y + 0.5;
  let best = null;
  for (const alongX of [true, false]) {
    const hx = (alongX ? LEN : WID) / 2 + 0.55, hz = (alongX ? WID : LEN) / 2 + 0.55;
    for (let cz = r.y + hz; cz <= r.y + r.h - hz; cz += 0.5) for (let cx = r.x + hx; cx <= r.x + r.w - hx; cx += 0.5) {
      // button keep-out (its square plus a walking margin) and the first pad (inside the truck room)
      if (Math.abs(cx - bx) < hx + BTN + 0.5 && Math.abs(cz - bz) < hz + BTN + 0.5) continue;
      if (pad0 && Math.abs(cx - pad0.x) < hx + pad0.half + 0.6 && Math.abs(cz - pad0.z) < hz + pad0.half + 0.6) continue;
      let ok = true;
      for (let y = Math.floor(cz - hz); y < Math.ceil(cz + hz) && ok; y++) for (let x = Math.floor(cx - hx); x < Math.ceil(cx + hx); x++) if (!free(x, y)) { ok = false; break; }
      if (!ok) continue;
      // the rear end must be reachable from the button: the button has to sit on one side of the footprint
      const d = Math.hypot(cx - car.x, cz - car.y) + Math.hypot(cx - bx, cz - bz) * 0.6;
      if (!best || d < best.d) best = { cx, cz, alongX, d };
    }
  }
  return best;
}

export function buildTruck(G, house) {
  const { scene, phys } = G;
  const layout = house.layout;
  const start = layout.start;
  const pad0 = house.pads[0] && house.pads[0].roomId === 0 ? house.pads[0] : null;
  const btn = { x: start.x + 0.5, z: start.y + 0.5, half: BTN };
  const spot = findSpot(layout, start, pad0) || { cx: btn.x - 4, cz: btn.z, alongX: true };
  // rear (local -x) towards the button
  const dxr = btn.x - spot.cx, dzr = btn.z - spot.cz;
  let rx = 0, rz = 0;
  if (spot.alongX) rx = Math.sign(dxr) || 1; else rz = Math.sign(dzr) || 1;
  const yaw = Math.atan2(rz, -rx);
  // the truck body is solid: mark its cells blocked so navigation (foes, bots, tools) routes around it; run.js builds nav after this
  {
    const ax = spot.alongX ? LEN / 2 : WID / 2, az = spot.alongX ? WID / 2 : LEN / 2, W = layout.w;
    for (let y = Math.floor(spot.cz - az); y < Math.ceil(spot.cz + az); y++) for (let x = Math.floor(spot.cx - ax); x < Math.ceil(spot.cx + ax); x++) if (x >= 0 && y >= 0 && x < W && y < layout.h) layout.block[y * W + x] = 1;
  }
  const root = new THREE.Group(); root.name = 'truck';
  root.position.set(spot.cx, 0, spot.cz); root.rotation.y = yaw;
  const disposables = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); disposables.push(m); return m; };
  const box = (sx, sy, sz, x, y, z, m, parent = root) => {
    const g = new THREE.BoxGeometry(sx, sy, sz); disposables.push(g);
    const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; parent.add(me); return me;
  };

  const ribTex = ribbedTexture(), hazTex = hazardTexture(); disposables.push(ribTex, hazTex);
  const body = mat({ map: ribTex, roughness: 0.55, metalness: 0.55 });
  const dark = mat({ color: 0x1a1d21, roughness: 0.6, metalness: 0.5 });
  const paint = mat({ color: 0x2f6f8f, roughness: 0.4, metalness: 0.45 });
  const paintDark = mat({ color: 0x20495e, roughness: 0.45, metalness: 0.45 });
  const haz = mat({ map: hazTex, roughness: 0.6 });
  const glass = mat({ color: 0x0c1a24, roughness: 0.1, metalness: 0.8, emissive: 0x0a2230, emissiveIntensity: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false }); disposables.push(lampMat);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }); disposables.push(tailMat);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff8a1c, toneMapped: false }); disposables.push(beaconMat);

  // chassis and wheels
  box(LEN, 0.22, WID - 0.5, 0, 0.58, 0, dark);
  const wheelG = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18); wheelG.rotateX(Math.PI / 2); disposables.push(wheelG);
  const hubG = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10); hubG.rotateX(Math.PI / 2); disposables.push(hubG);
  const tyre = mat({ color: 0x0d0e10, roughness: 0.95 }), hub = mat({ color: 0x8a949c, roughness: 0.4, metalness: 0.8 });
  for (const x of [-1.5, -0.45, 1.55]) for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wheelG, tyre); w.position.set(x, 0.42, s * (WID / 2 - 0.12)); w.castShadow = true; root.add(w);
    const h = new THREE.Mesh(hubG, hub); h.position.copy(w.position); root.add(h);
  }
  // cargo box: floor, roof, front and side walls ribbed, rear open (you see the dim interior)
  const cx0 = -LEN / 2, cargoLen = 3.0, bx0 = cx0 + 0.05, by0 = 0.72, ch = 1.75;
  box(cargoLen, 0.1, WID - 0.1, bx0 + cargoLen / 2, by0, 0, dark);
  box(cargoLen + 0.1, 0.12, WID, bx0 + cargoLen / 2, by0 + ch, 0, mat({ color: 0x7a8794, roughness: 0.5, metalness: 0.55 }));
  box(0.1, ch, WID - 0.1, bx0 + cargoLen - 0.05, by0 + ch / 2, 0, body);
  for (const s of [-1, 1]) {
    const side = box(cargoLen, ch, 0.1, bx0 + cargoLen / 2, by0 + ch / 2, s * (WID / 2 - 0.05), body);
    side.material = body;
    for (let i = 0; i < 9; i++) box(0.07, ch - 0.1, 0.05, bx0 + 0.25 + i * (cargoLen - 0.5) / 8, by0 + ch / 2, s * (WID / 2 + 0.01), dark);
    box(cargoLen, 0.09, 0.07, bx0 + cargoLen / 2, by0 + 0.5, s * (WID / 2 + 0.02), haz);
  }
  // interior lamp strip and a few crates so the open rear reads as a truck bed
  const strip = new THREE.Mesh(new THREE.BoxGeometry(cargoLen - 0.5, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, toneMapped: false }));
  strip.position.set(bx0 + cargoLen / 2, by0 + ch - 0.1, 0); root.add(strip); disposables.push(strip.geometry, strip.material);
  const crate = mat({ color: 0x7a5a36, roughness: 0.8 });
  box(0.7, 0.55, 0.7, bx0 + cargoLen - 0.5, by0 + 0.33, -0.45, crate);
  box(0.6, 0.4, 0.6, bx0 + cargoLen - 0.45, by0 + 0.26, 0.5, crate);
  box(0.5, 0.35, 0.5, bx0 + cargoLen - 0.5, by0 + 0.68 + 0.18, -0.45, mat({ color: 0x8a6a42, roughness: 0.8 }));
  // rear bumper with hazard stripes, tail lamps, step
  box(0.22, 0.28, WID + 0.1, cx0 - 0.02, 0.58, 0, haz);
  for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.24), tailMat); t.position.set(cx0 - 0.12, 1.0, s * (WID / 2 - 0.2)); root.add(t); disposables.push(t.geometry); }
  for (const s of [-1, 1]) box(0.08, ch, 0.12, cx0 + 0.02, by0 + ch / 2, s * (WID / 2 - 0.06), paintDark);
  // cab
  const cabX = bx0 + cargoLen + 0.2;
  box(1.05, 0.95, WID, cabX + 0.55, 0.78 + 0.35, 0, paint);
  box(0.85, 0.7, WID - 0.1, cabX + 0.35, 1.7 + 0.1, 0, paint);
  const wind = box(0.05, 0.5, WID - 0.3, cabX + 0.79, 1.82, 0, glass); wind.rotation.z = -0.22;
  for (const s of [-1, 1]) box(0.5, 0.42, 0.05, cabX + 0.35, 1.84, s * (WID / 2 - 0.04), glass);
  box(0.36, 0.5, WID - 0.2, cabX + 1.0, 0.95 + 0.15, 0, paintDark);
  // grille, bumper, headlights
  const gx = cabX + 1.12;
  box(0.06, 0.4, WID - 0.5, gx + 0.05, 0.98, 0, dark);
  for (let i = 0; i < 5; i++) box(0.05, 0.04, WID - 0.6, gx + 0.09, 0.84 + i * 0.08, 0, hub);
  box(0.2, 0.22, WID + 0.04, gx + 0.04, 0.55, 0, haz);
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), lampMat); l.scale.set(0.6, 1, 1.2); l.position.set(gx + 0.12, 1.02, s * (WID / 2 - 0.3)); root.add(l); disposables.push(l.geometry);
  }
  const head = new THREE.SpotLight(0xfff0d0, 22, 16, 0.5, 0.6, 1.4);
  head.position.set(gx + 0.15, 1.0, 0); head.target.position.set(gx + 8, 0.5, 0); root.add(head, head.target);
  // roof beacon (flashes during the escape)
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12), beaconMat); beacon.position.set(cabX + 0.4, 2.16, 0); root.add(beacon); disposables.push(beacon.geometry);
  const beaconLight = new THREE.PointLight(0xff8a1c, 0, 9, 2); beaconLight.position.set(cabX + 0.4, 2.35, 0); root.add(beaconLight);
  // mirrors
  for (const s of [-1, 1]) box(0.08, 0.3, 0.05, cabX + 0.7, 1.7, s * (WID / 2 + 0.12), dark);
  scene.add(root);

  // colliders (axis aligned in the world: rotate the local footprint by the yaw)
  const bodies = [];
  const world = (lx, lz, hx, hz) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const wx = spot.cx + lx * c + lz * s, wz = spot.cz - lx * s + lz * c;
    const swap = Math.abs(Math.sin(yaw)) > 0.5;
    return [wx, wz, swap ? hz : hx, swap ? hx : hz];
  };
  const cargo = world(bx0 + cargoLen / 2, 0, cargoLen / 2, WID / 2);
  bodies.push(phys.fixedBox(cargo[0], 1.55, cargo[1], cargo[2], 1.0, cargo[3]));
  const cab = world(cabX + 0.6, 0, 0.6, WID / 2);
  bodies.push(phys.fixedBox(cab[0], 1.2, cab[1], cab[2], 1.2, cab[3]));
  const chassis = world(0, 0, LEN / 2, (WID - 0.5) / 2);
  bodies.push(phys.fixedBox(chassis[0], 0.4, chassis[1], chassis[2], 0.4, chassis[3]));

  const B = makeButton(G, btn.x, btn.z, 'XUẤT PHÁT');
  const T = { x: spot.cx, z: spot.cz, yaw, button: btn, holdSec: BOARD_HOLD, hornPos: { x: btn.x, z: btn.z }, btn: B };
  Object.defineProperty(T, 'hold', { get: () => B.hold });
  Object.defineProperty(T, 'active', { get: () => B.active });
  let t = 0;
  /** active = the crew may board (escape phase). Returns true when the hold completes. */
  T.step = (dt, pos, active) => B.step(dt, pos, active);
  T.update = (dtMs) => {
    B.update(dtMs);
    t += dtMs / 1000;
    const flash = B.active && Math.sin(t * 9) > 0;
    beaconLight.intensity = flash ? 3 : 0;
    beaconMat.color.setHex(flash ? 0xffb050 : 0x6a3a12);
  };
  T.dispose = () => {
    B.dispose();
    scene.remove(root);
    for (const b of bodies) { try { phys.world.removeRigidBody(b); } catch (e) { /* gone */ } }
    for (const d of disposables) d.dispose?.();
  };
  return T;
}

/** The floor button: stand on it for 1.5 s while active. step(dt, pos, active) -> true when the hold completes. */
export function makeButton(G, x, z, text) {
  const { scene } = G;
  const disposables = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); disposables.push(m); return m; };
  const plateMat = mat({ color: 0x1f2a24, roughness: 0.5, metalness: 0.3, emissive: 0x20ff80, emissiveIntensity: 0.05 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(BTN * 2, 0.05, BTN * 2), plateMat); plate.position.set(x, 0.03, z); plate.receiveShadow = true; scene.add(plate);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(BTN * 2 + 0.16, 0.03, BTN * 2 + 0.16), mat({ color: 0x15171a, roughness: 0.7 })); frame.position.set(x, 0.015, z); scene.add(frame);
  const lblTex = labelTexture(text, '#43f09a'); disposables.push(lblTex);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(BTN * 1.7, BTN * 0.85), new THREE.MeshBasicMaterial({ map: lblTex, toneMapped: false })); label.rotation.x = -Math.PI / 2; label.position.set(x, 0.06, z); scene.add(label);
  const ring = new Ring(scene, x, z, BTN * 1.18, BTN * 1.34, 0x6dffb0, 0.05);
  const light = new THREE.PointLight(0x40ffa0, 0, 6, 2); light.position.set(x, 0.8, z); scene.add(light);
  disposables.push(plate.geometry, frame.geometry, label.geometry, label.material);
  const B = { x, z, half: BTN, hold: 0, active: false };
  let t = 0;
  B.step = (dt, pos, active) => {
    B.active = active;
    const on = active && Math.abs(pos.x - x) <= BTN && Math.abs(pos.z - z) <= BTN && pos.y < 1.6;
    B.hold = on ? B.hold + dt : 0;
    return on && B.hold >= BOARD_HOLD;
  };
  B.update = (dtMs) => {
    t += dtMs / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    plateMat.emissiveIntensity = B.active ? 0.5 + 0.7 * pulse : 0.05;
    plateMat.color.setHex(B.active ? 0x1f5a3e : 0x1f2a24);
    light.intensity = B.active ? 1.6 + pulse : 0;
    ring.set(B.hold / BOARD_HOLD);
  };
  B.dispose = () => { ring.dispose(); scene.remove(plate, frame, label, light); for (const d of disposables) d.dispose?.(); };
  return B;
}
