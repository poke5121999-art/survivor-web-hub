// Hand-written layout of Ga Chìm: a flooded freight yard at blue hour. Props are placed by table;
// seeds only vary wear. Geometry is merged per material in 48 m chunks so culling still works.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, chamferBox } from './kit.js';
import { mat, noMask, keepAlpha, U } from './mats.js';
import * as P from './props.js';
import { buildDecals } from './decals.js';
import { rng } from './rng.js';

export const TRACK_X = [-24, -18.5, -13, -7.5, -2, 3.5, 9];
export const Z0 = 62, Z1 = -205;

const MATS = {
  asphalt: { surf: 'asphalt', scale: 0.22, puddles: true, nscale: 1.2, macro: 0.35 },
  concrete: { surf: 'concrete', scale: 0.38 },
  shedFloor: { surf: 'concrete', scale: 0.28, wet: false, roughK: 0.75, tint: 0.7 },
  ballast: { surf: 'ballast', scale: 1.5, wetK: 0.45, nscale: 1.3, puddles: 'flood' },
  wood: { surf: 'wood', scale: 0.7, puddles: 'flood' },
  woodLight: { surf: 'wood', scale: 0.9, tint: 2.4 },
  rail: { surf: 'rust', scale: 1.2 },
  rust: { surf: 'rust', scale: 0.8 },
  railTop: { surf: 'steel', scale: 1.0, roughK: 0.55 },
  darkSteel: { surf: 'paintedMetal', paint: 0x1e1c1b, scale: 0.7 },
  wheel: { surf: 'rust', scale: 1.4, tint: 0.7 },
  spring: { surf: 'paintedMetal', paint: 0x2a2522, scale: 1.5 },
  steelBright: { surf: 'steel', scale: 1.2, roughK: 0.7 },
  steel: { surf: 'steel', scale: 0.9 },
  galv: { surf: 'steel', scale: 1.6, roughK: 1.25 },
  grating: { surf: 'steel', scale: 2.0, roughK: 1.2, tint: 0.6 },
  boxRed: { surf: 'corrugated', paint: 0x6e2619, scale: 0.42 },
  boxBlue: { surf: 'corrugated', paint: 0x264660, scale: 0.42 },
  boxGreen: { surf: 'corrugated', paint: 0x35523a, scale: 0.42 },
  boxGrey: { surf: 'corrugated', paint: 0x63676a, scale: 0.42 },
  boxOrange: { surf: 'corrugated', paint: 0x9a5020, scale: 0.42 },
  boxBrown: { surf: 'corrugated', paint: 0x55392a, scale: 0.42 },
  tankBlack: { surf: 'paintedMetal', paint: 0x191919, scale: 0.5, roughK: 0.85 },
  tankWhite: { surf: 'paintedMetal', paint: 0x8f8e88, scale: 0.5 },
  paintYellow: { surf: 'paintedMetal', paint: 0xb88f1c, scale: 0.8 },
  paintGrey: { surf: 'paintedMetal', paint: 0x53585b, scale: 0.7 },
  paintGreyGreen: { surf: 'paintedMetal', paint: 0x46534a, scale: 0.8 },
  paintGreenDark: { surf: 'paintedMetal', paint: 0x223528, scale: 0.7 },
  paintBlue: { surf: 'paintedMetal', paint: 0x1d456f, scale: 0.9 },
  locoBody: { surf: 'paintedMetal', paint: 0x7d281c, scale: 0.45 },
  locoTrim: { surf: 'paintedMetal', paint: 0x1a1a1a, scale: 0.6 },
  insulator: { surf: 'paintedMetal', paint: 0x5a3018, scale: 2.0, roughK: 0.4 },
  brick: { surf: 'brick', scale: 0.55 },
  boardsGreen: { surf: 'paintedMetal', paint: 0x2c4434, scale: 0.6 },
  boards: { surf: 'wood', scale: 0.8, tint: 1.6 },
  roofSlate: { surf: 'concrete', scale: 0.9, tint: 0.45 },
  doorSteel: { surf: 'paintedMetal', paint: 0x35444b, scale: 0.8 },
  shedWall: { surf: 'corrugated', paint: 0x7d807b, scale: 0.4 },
  shedRoof: { surf: 'corrugated', paint: 0x4e504e, scale: 0.4 },
  tarp: { surf: 'fabric', paint: 0x2a4a66, scale: 1.2 },
  rubber: { surf: 'polymer', scale: 0.5, roughK: 1.2 },
  block: { surf: 'plasterBlock', scale: 0.5 },
  farA: { surf: 'plasterBlock', scale: 0.12, tint: 0.35, wet: false },
  farB: { surf: 'concrete', scale: 0.1, tint: 0.3, wet: false },
};

const SPECIAL = {};
function special(key) {
  if (SPECIAL[key]) return SPECIAL[key];
  let m;
  const E = (r, g, b) => noMask(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), fog: false }));
  switch (key) {
    case 'emitSodium': m = E(9, 4.6, 1.4); break;
    case 'emitRed': m = E(9, 0.35, 0.12); break;
    case 'emitGreen': m = E(0.4, 7, 1.8); break;
    case 'emitWarm': m = E(7, 4.6, 2.2); break;
    case 'emitHead': m = E(14, 12.5, 9.5); break;
    case 'glass': m = noMask(new THREE.MeshStandardMaterial({ color: 0x040506, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.6 })); break;
    case 'glassLit': m = noMask(new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.1, metalness: 0.1, emissive: new THREE.Color(0.5, 0.33, 0.14), emissiveIntensity: 0.25, envMapIntensity: 1.2 })); break;
    case 'mesh': {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      m = noMask(new THREE.MeshStandardMaterial({ color: 0x8a8f92, metalness: 0.9, roughness: 0.4, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide }));
      break;
    }
    default: m = null;
  }
  SPECIAL[key] = m; return m;
}

export function materialFor(key) {
  const s = special(key); if (s) return s;
  const o = MATS[key];
  if (!o) { console.warn('[level] no material', key); return mat({ surf: 'paintedMetal', paint: 0xff00ff }); }
  const { tint, ...rest } = o;
  const m = mat(rest);
  if (tint && !m.userData.tinted) { m.color.setScalar(tint); m.userData.tinted = true; }
  return m;
}

export function buildLevel(G) {
  const info = { decals: [], lamps: [], objectives: [], dryZones: [], tracks: TRACK_X.length, trackX: [] };
  const chunks = new Map();
  const colliders = [];
  const CH = 48;
  function K(x, z) {
    const key = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    if (!chunks.has(key)) chunks.set(key, new Kit());
    const k = chunks.get(key);
    k.stack = [new THREE.Matrix4()];
    return k;
  }
  // place(builder, x, z, ry, opts): runs the builder at that spot, fixes up decal/lamp/objective matrices to world
  function place(fn, x, z, ry = 0, opts = {}, y = 0) {
    const k = K(x, z);
    k.push().at(x, y, z, ry);
    const d0 = info.decals.length, l0 = info.lamps.length, o0 = info.objectives.length;
    const before = k.colliders.length;
    fn(k, opts, info);
    for (let i = d0; i < info.decals.length; i++) if (!info.decals[i].m) info.decals[i].m = k.m.clone();
    for (let i = l0; i < info.lamps.length; i++) { const L = info.lamps[i]; L.pos.applyMatrix4(k.m); L.dir.transformDirection(k.m); }
    k.pop();
    return k;
  }
  const trackKit = (x) => (fn) => fn;

  // ---- ground: asphalt apron with a slight camber, concrete slab road west
  const groundGeo = new THREE.PlaneGeometry(520, 520, 64, 64); groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, materialFor('asphalt'));
  ground.position.set(-10, 0, -70); ground.receiveShadow = true; G.scene.add(ground);

  // ---- tracks: ballast bed, sleepers, rails, in chunks
  for (let t = 0; t < TRACK_X.length; t++) {
    const x = TRACK_X[t];
    for (let z = Z0; z > Z1; z -= 24) {
      const k = K(x, z - 12);
      k.push().at(x, 0, z - 12);
      const bed = new THREE.Shape(); bed.moveTo(-2.1, 0); bed.lineTo(2.1, 0); bed.lineTo(1.55, 0.32); bed.lineTo(-1.55, 0.32);
      const g = new THREE.ExtrudeGeometry(bed, { depth: 24, bevelEnabled: false }); g.translate(0, 0, -12); k.add(g, 'ballast');
      const r = rng('sl' + t + z);
      for (let i = 0; i < 37; i++) {
        const sz = -12 + 0.32 + i * 0.65;
        k.push().at(r.range(-0.03, 0.03), 0, sz, r.range(-0.03, 0.03));
        k.box(2.6, 0.17, 0.26, 'wood', 0, 0.37, 0, 0.025);
        k.pop();
      }
      for (const s of [-0.7175, 0.7175]) {
        k.box(0.14, 0.012, 24, 'darkSteel', s, 0.46, 0, 0.0);
        k.box(0.15, 0.03, 24, 'rail', s, 0.475, 0, 0.004);
        k.box(0.02, 0.1, 24, 'rail', s, 0.53, 0, 0.003);
        k.box(0.072, 0.05, 24, 'railTop', s, 0.6, 0, 0.012);
      }
      k.pop();
    }
  }
  info.trackX = TRACK_X.map((x) => x + 27);

  // ---- rolling stock along the tracks (designed sightlines: main lanes on tracks -13 and -2 stay open)
  const stock = [
    [-24, 22, 'boxcar', { paint: 'boxRed', seed: 'a1' }], [-24, 5.5, 'boxcar', { paint: 'boxBrown', seed: 'a2' }], [-24, -11, 'boxcar', { paint: 'boxRed', seed: 'a3', open: true }],
    [-24, -46, 'tankcar', { seed: 't1' }], [-24, -61, 'tankcar', { seed: 't2', paint: 'tankWhite' }], [-24, -98, 'boxcar', { paint: 'boxGreen', seed: 'a4' }],
    [-24, -114.5, 'hopper', { paint: 'boxGrey', seed: 'h0' }],
    [-18.5, 14, 'flatcar', { load: 'containers', seed: 'f1' }], [-18.5, -2, 'flatcar', { load: 'containers', seed: 'f2' }],
    [-18.5, -32, 'hopper', { paint: 'boxGrey', seed: 'h1' }], [-18.5, -47, 'hopper', { paint: 'boxGrey', seed: 'h2' }], [-18.5, -62, 'hopper', { paint: 'boxBrown', seed: 'h3' }],
    [-18.5, -128, 'boxcar', { paint: 'boxBlue', seed: 'a5' }],
    [-13, -132, 'flatcar', { load: 'rails', seed: 'f3' }],
    [-7.5, -18, 'boxcar', { paint: 'boxBlue', seed: 'a6' }], [-7.5, -34.5, 'boxcar', { paint: 'boxOrange', seed: 'a7', open: true }],
    [-7.5, -70, 'tankcar', { seed: 't3' }], [-7.5, -84.5, 'tankcar', { seed: 't4' }],
    [3.5, 2, 'hopper', { paint: 'boxGrey', seed: 'h4' }], [3.5, -13, 'hopper', { paint: 'boxGrey', seed: 'h5' }], [3.5, -42, 'flatcar', { load: 'rails', seed: 'f4' }],
    [3.5, -120, 'flatcar', { load: 'containers', seed: 'f5' }],
    [9, -58, 'boxcar', { paint: 'boxGreen', seed: 'a8' }], [9, -142, 'boxcar', { paint: 'boxRed', seed: 'a9' }],
  ];
  const builders = { boxcar: P.boxcar, tankcar: P.tankcar, flatcar: P.flatcar, hopper: P.hopper };
  for (const [x, z, kind, o] of stock) place(builders[kind], x, z, 0, o);
  place(P.locomotive, -2, -165, Math.PI, { seed: 'loco', lit: false });

  // ---- catenary masts with wires along each track
  for (let z = 40; z > Z1; z -= 45) place((k, o, inf) => P.catenaryPole(k, 39, inf), -27, z, 0, {});
  const wireKit = new Kit();
  for (const x of TRACK_X) {
    for (let z = 40; z > Z1 + 45; z -= 45) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const za = z - (i / n) * 45, zb = z - ((i + 1) / n) * 45;
        const sag = (u) => 0.35 * 4 * u * (1 - u);
        const ya = 6.3 - sag(i / n), yb = 6.3 - sag((i + 1) / n);
        wireKit.tube(new THREE.Vector3(x, ya, za), new THREE.Vector3(x, yb, zb), 0.012, 'darkSteel', 4);
        wireKit.tube(new THREE.Vector3(x + 0.12, 5.65, za), new THREE.Vector3(x + 0.12, 5.65, zb), 0.01, 'steel', 4);
        wireKit.tube(new THREE.Vector3(x + 0.06, ya, za), new THREE.Vector3(x + 0.12, 5.65, za), 0.004, 'steel', 3);
      }
    }
  }
  const wires = wireKit.build(materialFor, { noShadow: true }); G.scene.add(wires);

  // ---- flood masts, lamp posts, signal gantry
  for (const [x, z, ry] of [[-31, 28, Math.PI / 2], [-31, -55, Math.PI / 2], [-31, -138, Math.PI / 2], [19.5, -12, -Math.PI / 2], [19.5, -92, -Math.PI / 2], [19.5, -170, -Math.PI / 2]]) {
    place(P.floodMast, x, z, ry, { h: 19, aim: new THREE.Vector3(0, -1, 1.15) });
  }
  for (let z = 30; z > -150; z -= 14) place(P.lampPost, -34.5, z, Math.PI / 2, {});
  for (let z = -8; z > -70; z -= 12) place(P.lampPost, 16.6, z, -Math.PI / 2, {});
  place((k, o, inf) => P.signalGantry(k, 39, inf), -27, -104, 0, {});

  // ---- buildings: depot shed, platform, signal boxes (objectives), cabins
  place(P.shed, -46, 12, 0, { w: 26, l: 44 });
  place(P.platform, 14.4, -38, 0, { l: 72, canopy: 42, name: 'GA CHÌM' });
  place(P.signalBox, -40, -34, Math.PI / 2, { id: 'A', name: 'GÁC GHI A' });
  place(P.powerCabinet, -36.2, -27.5, Math.PI / 2, { id: 'A' });
  place(P.signalBox, 25.5, -82, -Math.PI / 2, { id: 'B', name: 'GÁC GHI B' });
  place(P.powerCabinet, 21.6, -76, -Math.PI / 2, { id: 'B' });
  place(P.signalBox, -36, -124, Math.PI / 2, { id: 'C', name: 'GÁC GHI C' });
  place(P.powerCabinet, -31.6, -117.5, Math.PI / 2, { id: 'C' });
  place(P.cabin, -33, 46, 0, 'boxGrey'); place(P.cabin, 22, 18, Math.PI / 2, 'boxBlue'); place(P.cabin, 22, -128, 0, 'boxOrange');

  // ---- clutter: barriers, pallets, barrels, drums, sleeper stacks, fences
  const R = rng('clutter');
  const clutter = [
    [P.jersey, -10.3, 36, 0], [P.jersey, -10.3, 32.8, 0.05], [P.jersey, -15.7, 18, 0], [P.jersey, 0.8, -52, 0.1], [P.jersey, 0.8, -55.3, 0],
    [P.jersey, -10.4, -92, 0], [P.jersey, -4.8, -108, 0.06], [P.jersey, -4.6, -111.2, 0],
    [(k) => P.pallet(k, 3, 'sacks'), -30, 8, 0.2], [(k) => P.pallet(k, 6), -30.5, 10.5, 0], [(k) => P.pallet(k, 2, 'sacks'), -31, -20, 1.1],
    [(k) => P.pallet(k, 4), 13.5, -18, 0.4], [(k) => P.pallet(k, 1, 'sacks'), 15, -62, 0.1], [(k) => P.pallet(k, 5), -29.5, -82, 0.3],
    [P.cableDrum, -28.5, -40, 0.4], [P.cableDrum, -10.4, -60, 0], [P.cableDrum, 20, -110, 1.2], [P.cableDrum, -29, -100, 0.8],
    [(k) => P.sleeperStack(k, 7), -29.5, -8, 0.05], [(k) => P.sleeperStack(k, 5), 0.8, -140, 1.57], [(k) => P.sleeperStack(k, 9), 20, -40, 0.2],
  ];
  for (const [fn, x, z, ry] of clutter) place(fn, x, z, ry, {}, x > 11 && x < 17.4 && z < -2 && z > -74 ? 1.05 : 0);
  const barrelPaints = ['paintBlue', 'paintYellow', 'paintGrey', 'boxRed', 'paintGreenDark'];
  for (const [bx, bz] of [[-30.2, 4], [-29.6, 3.2], [-30.8, 3.0], [-10.8, -6], [-11.2, -7], [14.0, -24], [13.6, -25.0], [-28.8, -70], [-29.6, -69.4], [20.2, -98], [1.0, -96], [-11, -120], [-10.4, -121], [-28, -126]]) {
    place((k) => P.barrel(k, R.pick(barrelPaints)), bx, bz, R.range(0, 6), {}, bx > 11 && bx < 17.4 && bz < -2 && bz > -74 ? 1.05 : 0);
  }
  place((k) => P.fence(k, 280), -60, -72, 0, {});
  place((k) => P.fence(k, 280), 32, -72, 0, {});
  place((k) => P.fence(k, 92), -14, 66, Math.PI / 2, {});
  place((k) => P.fence(k, 92), -14, -210, Math.PI / 2, {});

  // ---- distant silhouettes: city blocks with a few lit windows, chimneys, water tower
  const far = new Kit(); const fr = rng('far');
  for (let i = 0; i < 60; i++) {
    const a = fr.range(-Math.PI * 0.95, Math.PI * 0.95); const d = fr.range(230, 380);
    const x = Math.sin(a) * d - 10, z = -Math.cos(a) * d - 70;
    const w = fr.range(14, 40), h = fr.range(10, 55), dd = fr.range(14, 36);
    far.push().at(x, 0, z, fr.range(0, 3));
    far.box(w, h, dd, fr() < 0.5 ? 'farA' : 'farB', 0, h / 2, 0, 0.3);
    if (fr() < 0.5) far.box(w * 0.5, fr.range(3, 9), dd * 0.5, 'farA', fr.range(-w / 4, w / 4), h + 2, 0, 0.2);
    if (fr() < 0.4) far.cyl(0.25, 8, 'farB', fr.range(-w / 3, w / 3), h + 4, fr.range(-dd / 3, dd / 3), 6);
    far.pop();
  }
  for (const [x, z, h] of [[160, -310, 70], [175, -300, 62], [-150, -330, 85]]) { far.push().at(x, 0, z); far.cyl(3.5, h, 'brick', 0, h / 2, 0, 14); far.pop(); }
  far.push().at(-120, 0, -260); far.cyl(0.6, 24, 'paintGrey', 4, 12, 4, 8); far.cyl(0.6, 24, 'paintGrey', -4, 12, 4, 8); far.cyl(0.6, 24, 'paintGrey', 4, 12, -4, 8); far.cyl(0.6, 24, 'paintGrey', -4, 12, -4, 8);
  far.cyl(7, 8, 'paintGrey', 0, 28, 0, 20); far.pop();
  const farG = far.build(materialFor, { noShadow: true }); G.scene.add(farG);
  // lit windows as emissive points on the far blocks
  const winGeo = new THREE.PlaneGeometry(1.2, 1.6); const winCount = 260;
  const win = new THREE.InstancedMesh(winGeo, special('emitWarm'), winCount);
  const wm = new THREE.Matrix4(); const wr = rng('win');
  for (let i = 0; i < winCount; i++) {
    const a = wr.range(-Math.PI * 0.9, Math.PI * 0.9); const d = wr.range(222, 300);
    const x = Math.sin(a) * d - 10, z = -Math.cos(a) * d - 70;
    wm.compose(new THREE.Vector3(x, wr.range(4, 40), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-10 - x, -70 - z), 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(wr.range(0.15, 0.35)));
    win.setMatrixAt(i, wm);
  }
  G.scene.add(win);

  // ---- build chunks
  const meshes = new THREE.Group(); meshes.name = 'level';
  for (const [, k] of chunks) { meshes.add(k.build(materialFor)); colliders.push(...k.colliders); }
  G.scene.add(meshes);
  const decals = new THREE.Group(); buildDecals(info.decals, decals); G.scene.add(decals);
  return { info, colliders, meshes, lamps: info.lamps, objectives: info.objectives, dryZones: info.dryZones };
}
