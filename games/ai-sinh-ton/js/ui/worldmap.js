// The world map of the Ra Trận tab: the ten chapter regions as floating islands on a sea, joined by plank roads, each
// with its landmark. A viewport draws it; a sideways scroll laid over the viewport pans the camera, and holds one tap
// area and one name per region, kept on the region's picture every frame.
//   createWorldMap(ui, meta, { w, h, onPick(k) }) -> { node, scroll, set({ open, current, sel, team }), focus(k, now), update(dt), dbg() }
//   open: how many regions are open (the first `open` chapters); current: the region the player is on (flag and team);
//   sel: the region of the selected stage; team: the beast ids standing on the current region.
// Each region bakes its static parts into one vertex-coloured mesh plus one ink hull, so a region costs two draws.
import { CHAPTERS } from '../data/stages.js?v=20261122a';
import { beastModel } from './beast-ui.js?v=20261122a';

export const STORY = [
  'Quê nhà của Đội Hộ Vệ, nơi Mầm Sống thức tỉnh.',
  'Thành phố bỏ hoang, xác sống lang thang khắp ngõ.',
  'Kim tự tháp mở cửa, xác ướp cổ lại đứng dậy.',
  'Sương độc phủ đầm, ma trơi dẫn lối lũ xác sống.',
  'Dung nham sôi sục, quái lửa canh miệng núi.',
  'Bão tuyết vùi làng, xác sống đông cứng vẫn đi.',
  'Sóng dạt xác tàu vào bờ, dịch bệnh theo triều lên.',
  'Ống khói phun khí độc, dây chuyền đúc ra quái vật.',
  'Đảo bay giữa mây, chốn trú cuối cùng của muông chim.',
  'Vết nứt nơi dịch bệnh bắt đầu. Trận chiến cuối cùng.',
];

const SP = 6.2, R = 2.5, G = 0.13;                       // region spacing, island radius, ground height
const ZIG = [0.5, -0.8, 0.7, -0.6, 0.8, -0.7, 0.5, -0.8, 0.9, -0.4];
const INK = 0x1a1420, INK_T = 0.045;
const PUFFS = 12;                                          // fog puffs over one locked region
const HOT = { w: 112, h: 128 };

export function createWorldMap(ui, meta, { w, h, onPick }) {
  const THREE = ui.THREE;
  const root = new THREE.Group();
  const regions = CHAPTERS.map((ch, k) => ({ k, name: ch.name, biome: ch.biome, x: k * SP, z: ZIG[k % ZIG.length] }));
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S3 = new THREE.Vector3();

  // ---- baking: parts in, one mesh and its ink hull out ----
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78 });
  const dim = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, color: 0x5e5a78 });
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  function parts() {
    const list = [];
    const add = (geo, color, x = 0, y = 0, z = 0, o = {}) => {
      E.set(o.rx || 0, o.ry || 0, o.rz || 0); Q.setFromEuler(E); S3.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
      list.push({ geo, color, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.clone(), S3.clone()), ink: o.ink !== false });
    };
    return { list, add };
  }
  const C = new THREE.Color(), NM = new THREE.Matrix3(), CEN = new THREE.Vector3(), SC = new THREE.Vector3();
  function bake(list, inkToo = true) {
    const pos = [], nor = [], col = [], ink = [];
    for (const p of list) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo; g.computeBoundingSphere();
      const a = g.attributes.position, n = g.attributes.normal; C.setHex(p.color); NM.getNormalMatrix(p.m);
      const sc = Math.max(SC.setFromMatrixScale(p.m).x, SC.y, SC.z);
      const k = 1 + INK_T / Math.max(0.05, g.boundingSphere.radius * sc); CEN.copy(g.boundingSphere.center);
      for (let i = 0; i < a.count; i++) {
        V.fromBufferAttribute(a, i).applyMatrix4(p.m); pos.push(V.x, V.y, V.z);
        V.fromBufferAttribute(n, i).applyMatrix3(NM).normalize(); nor.push(V.x, V.y, V.z);
        col.push(C.r, C.g, C.b);
        if (inkToo && p.ink) { V.fromBufferAttribute(a, i).sub(CEN).multiplyScalar(k).add(CEN).applyMatrix4(p.m); ink.push(V.x, V.y, V.z); }
      }
      if (g !== p.geo) g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, solid);
    if (inkToo && ink.length) { const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.Float32BufferAttribute(ink, 3)); mesh.add(new THREE.Mesh(ig, inkMat)); }
    for (const p of list) p.geo.dispose();
    return mesh;
  }

  // ---- shapes ----
  const cyl = (rt, rb, hh, seg = 8, open = false, th = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, hh, seg, 1, open, 0, th);
  const cone = (r, hh, seg = 8) => new THREE.ConeGeometry(r, hh, seg);
  const boxG = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const dode = (r) => new THREE.DodecahedronGeometry(r);
  const ball = (r, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);
  const octa = (r) => new THREE.OctahedronGeometry(r);
  const rnd = (k) => { let s = (k * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

  function island(P, top, rock, k) {
    P.add(cyl(R, R * 0.98, 0.26, 11), top, 0, 0, 0);
    P.add(cyl(R * 0.96, R * 0.7, 0.9, 11), rock, 0, -0.58, 0);
    P.add(cone(R * 0.68, 1.5, 9), new THREE.Color(rock).multiplyScalar(0.8).getHex(), 0, -1.78, 0, { rx: Math.PI });
    const r = rnd(k + 3);
    for (let i = 0; i < 5; i++) { const a = r() * 6.28; P.add(dode(0.16 + r() * 0.16), rock, Math.cos(a) * (R - 0.3), G + 0.05, Math.sin(a) * (R - 0.3)); }
  }
  function pine(P, x, z, s = 1, leaf = 0x2f6a3e, snow = 0) {
    P.add(cyl(0.07 * s, 0.09 * s, 0.4 * s, 5), 0x5a3a24, x, G + 0.2 * s, z);
    P.add(cone(0.42 * s, 0.75 * s, 7), leaf, x, G + 0.65 * s, z); P.add(cone(0.32 * s, 0.6 * s, 7), leaf, x, G + 0.98 * s, z);
    if (snow) P.add(cone(0.2 * s, 0.32 * s, 7), snow, x, G + 1.2 * s, z, { ink: false });
  }

  // one landmark per biome: the shape that names the region at a glance; `fx` collects the moving pieces
  const fx = { smoke: [], wisps: [], lava: [], glow: [], waves: [], float: [], snow: [] };
  const LAND = {
    forest(P, X, Z) {
      island(P, 0x6f9a4e, 0x6b5a48, 1);
      P.add(cyl(0.32, 0.5, 1.9, 7), 0x6b4a2e, -0.1, G + 0.95, -0.5);
      for (const [a, b, c, r, col] of [[-0.1, 2.35, -0.5, 1.05, 0x3f8a3a], [-0.75, 2.0, -0.3, 0.78, 0x4fa044], [0.6, 2.05, -0.45, 0.8, 0x367a34], [-0.2, 2.9, -0.6, 0.7, 0x58ad4c]]) P.add(ico(r, 0), col, a, b, c);
      for (const s of [-1, 1]) P.add(cone(0.18, 0.7, 5), 0x5a3e26, -0.1 + s * 0.42, G + 0.2, -0.5, { rz: -s * 1.1 });
      pine(P, 1.6, -0.9, 0.95); pine(P, -1.7, -0.6, 1.1); pine(P, 1.9, 0.6, 0.8); pine(P, -1.4, 1.2, 0.7);
      for (const [x, z] of [[0.9, 1.0], [-0.6, 1.5]]) { P.add(cyl(0.04, 0.05, 0.18, 5), 0xf0e6d0, x, G + 0.09, z); P.add(ball(0.13, 8, 5), 0xd8443a, x, G + 0.2, z, { sy: 0.6 }); }
    },
    street(P) {
      island(P, 0x8c8f94, 0x5d5a60, 2);
      P.add(boxG(1.3, 1.05, 1.0), 0xb0876a, -0.8, G + 0.52, -0.6);
      P.add(cyl(0.75, 0.75, 1.4, 3), 0x8a3f30, -0.8, G + 1.25, -0.6, { rz: Math.PI / 2, ry: 0.18, sx: 0.6 });
      P.add(boxG(1.0, 1.7, 0.95), 0x9a8a7c, 0.7, G + 0.85, -0.9, { rz: 0.06 });
      P.add(boxG(0.5, 0.45, 0.97), 0x6a5a50, 0.95, G + 1.55, -0.9, { rz: 0.5 });
      for (let i = 0; i < 3; i++) P.add(boxG(0.18, 0.22, 0.04), 0x2a2a3a, 0.45 + (i % 2) * 0.45, G + 0.6 + Math.floor(i / 2) * 0.55, -0.42, { ink: false });
      P.add(boxG(0.2, 0.3, 0.04), 0x2a2a3a, -0.6, G + 0.4, -0.09, { ink: false });
      P.add(cyl(0.04, 0.05, 1.5, 5), 0x4a4a55, 1.6, G + 0.7, 0.6, { rz: -0.35 }); P.add(boxG(0.36, 0.08, 0.14), 0x4a4a55, 1.88, G + 1.38, 0.6, { rz: -0.35 });
      const r = rnd(7); for (let i = 0; i < 7; i++) P.add(boxG(0.22 + r() * 0.2, 0.14, 0.2), 0x8a7a6a, -1.6 + r() * 3.2, G + 0.07, 0.5 + r() * 1.3, { ry: r() * 3 });
      for (let i = 0; i < 4; i++) P.add(boxG(0.36, 0.02, 0.08), 0xe8c040, -1.5 + i * 0.85, G + 0.005, 0.25, { ink: false });
      P.add(boxG(0.85, 0.42, 0.45), 0x7a2a2a, -1.5, G + 0.21, 1.15, { ry: 0.5 }); P.add(boxG(0.5, 0.28, 0.42), 0x5a6a7a, -1.5, G + 0.55, 1.15, { ry: 0.5 });
    },
    crypt(P) {
      island(P, 0xd9b878, 0xa8875a, 3);
      P.add(cone(1.7, 2.0, 4), 0xe0c080, -0.2, G + 1.0, -0.55, { ry: Math.PI / 4 });
      P.add(boxG(0.42, 0.55, 0.3), 0x4a3420, -0.2, G + 0.27, 0.62, { ink: false });
      P.add(boxG(0.26, 1.5, 0.26), 0xc8a468, 1.65, G + 0.75, -0.2); P.add(cone(0.2, 0.3, 4), 0xf0d080, 1.65, G + 1.65, -0.2, { ry: Math.PI / 4 });
      for (const [x, z, s] of [[-1.5, 1.0, 1], [1.2, 1.3, 0.8], [-1.8, -0.9, 0.7]]) P.add(ball(0.7 * s, 10, 6), 0xe8c98a, x, G - 0.1, z, { sy: 0.38, ink: false });
      P.add(cyl(0.12, 0.13, 0.8, 7), 0x5a8a4a, 0.9, G + 0.4, 0.9); P.add(cyl(0.08, 0.08, 0.35, 6), 0x5a8a4a, 1.08, G + 0.5, 0.9, { rz: -0.9 }); P.add(cyl(0.08, 0.08, 0.3, 6), 0x5a8a4a, 0.73, G + 0.6, 0.9, { rz: 0.9 });
    },
    swamp(P, X, Z) {
      island(P, 0x5f7048, 0x4a4a3a, 4);
      P.add(cyl(1.35, 1.35, 0.05, 14), 0x35584a, 0.35, G + 0.02, 0.35, { ink: false, sx: 1.1 });
      P.add(cyl(0.16, 0.26, 1.7, 6), 0x4a3b30, -1.0, G + 0.85, -0.7, { rz: 0.12 });
      for (const [rz, y, l] of [[0.9, 1.3, 0.9], [-0.8, 1.55, 0.8], [0.4, 1.8, 0.6]]) P.add(cyl(0.05, 0.08, l, 5), 0x4a3b30, -1.0 + Math.sin(rz) * l * 0.4, G + y, -0.7, { rz });
      P.add(ball(0.5, 9, 6), 0x55663e, -1.0, G + 1.9, -0.7, { sy: 0.5 });
      const r = rnd(11); for (let i = 0; i < 9; i++) P.add(cone(0.04, 0.5 + r() * 0.3, 4), 0x8a9a4a, 1.3 + r() * 0.8, G + 0.3, -0.9 + r() * 0.8, { ink: false, rz: (r() - 0.5) * 0.4 });
      for (let i = 0; i < 4; i++) P.add(cyl(0.18, 0.18, 0.02, 8), 0x6aa04a, -0.2 + i * 0.4, G + 0.06, 0.2 + (i % 2) * 0.5, { ink: false });
      P.add(boxG(0.55, 0.5, 0.5), 0x6a5a40, 0.6, G + 0.25, -1.2); P.add(cone(0.5, 0.45, 4), 0x7a6a3a, 0.6, G + 0.72, -1.2, { ry: Math.PI / 4 });
      for (let i = 0; i < 4; i++) fx.wisps.push({ x: X + 0.35 + Math.cos(i * 1.6) * 0.9, y: G + 0.7, z: Z + 0.35 + Math.sin(i * 1.6) * 0.7, ph: i * 1.7 });
    },
    volcano(P, X, Z) {
      island(P, 0x5a3a32, 0x3a2826, 5);
      P.add(cyl(0.55, 1.75, 2.3, 9), 0x4a302a, -0.2, G + 1.15, -0.5);
      P.add(cyl(0.62, 0.55, 0.22, 9), 0x3a2420, -0.2, G + 2.35, -0.5);
      const r = rnd(5); for (let i = 0; i < 6; i++) { const a = r() * 6.28; P.add(dode(0.2 + r() * 0.2), 0x2e201c, Math.cos(a) * 1.9, G + 0.1, Math.sin(a) * 1.5); }
      fx.lava.push([cyl(0.48, 0.48, 0.06, 9), X - 0.2, G + 2.44, Z - 0.5]);
      for (const [a, l] of [[0.3, 1.4], [2.4, 1.2], [1.4, 1.0]]) fx.lava.push([boxG(0.12, l, 0.06), X - 0.2 + Math.sin(a) * 1.0, G + 1.45, Z - 0.5 + Math.cos(a) * 1.0, { ry: a, rx: -0.62 }]);
      fx.smoke.push({ x: X - 0.2, y: G + 2.5, z: Z - 0.5, big: 1 });
    },
    snow(P, X, Z) {
      island(P, 0xe8f0f4, 0x8a96a6, 6);
      for (const [x, z, s] of [[-0.9, -0.8, 1.2], [0.6, -1.1, 0.9], [1.6, -0.2, 0.7]]) P.add(ball(s, 12, 7), 0xf4f8fb, x, G - 0.15, z, { sy: 0.7 });
      pine(P, -1.7, 0.4, 1.0, 0x2f5a46, 0xf4f8fb); pine(P, 1.1, 1.1, 0.8, 0x2f5a46, 0xf4f8fb); pine(P, 1.9, -1.0, 1.1, 0x2f5a46, 0xf4f8fb); pine(P, -0.3, -1.7, 1.2, 0x2f5a46, 0xf4f8fb);
      P.add(ball(0.32, 10, 7), 0xffffff, -0.6, G + 0.3, 0.9); P.add(ball(0.22, 10, 7), 0xffffff, -0.6, G + 0.75, 0.9); P.add(cone(0.05, 0.25, 5), 0xf08a2a, -0.6, G + 0.75, 1.12, { rx: Math.PI / 2, ink: false });
      for (const [x, z] of [[0.4, 0.4], [1.6, 0.9]]) P.add(octa(0.22), 0x9ad8ff, x, G + 0.25, z, { sy: 1.8 });
      fx.snow.push({ x: X, z: Z });
    },
    coast(P, X, Z) {
      island(P, 0xe6d29a, 0xa08860, 7);
      P.add(cyl(R * 0.98, R * 0.98, 0.06, 12, false, Math.PI), 0x3aa8d0, 0, G + 0.02, 0, { ry: -Math.PI / 2 + 0.3, ink: false });
      P.add(cyl(0.3, 0.42, 1.9, 8), 0xf4f0e8, -1.1, G + 0.95, -0.9); for (const y of [0.45, 1.25]) P.add(cyl(0.38, 0.4, 0.3, 8), 0xd04040, -1.1, G + y, -0.9, { ink: false, s: 1.02 });
      P.add(cyl(0.34, 0.34, 0.3, 8), 0x3a3a4a, -1.1, G + 2.05, -0.9); P.add(cone(0.4, 0.4, 8), 0xd04040, -1.1, G + 2.4, -0.9);
      fx.glow.push([cyl(0.22, 0.22, 0.24, 8), X - 1.1, G + 2.05, Z - 0.9, 0xfff0a0]);
      for (let i = 0; i < 4; i++) P.add(cyl(0.07, 0.08, 0.45, 5), 0x8a6a40, 0.2 + i * 0.12, G + 0.2 + i * 0.4, -1.4, { rz: -0.18 - i * 0.06 });
      for (let i = 0; i < 5; i++) P.add(boxG(0.7, 0.04, 0.22), 0x3f9a3a, 0.65 + Math.cos(i * 1.26) * 0.38, G + 1.75, -1.4 + Math.sin(i * 1.26) * 0.38, { ry: -i * 1.26, rz: 0.35 });
      P.add(boxG(1.0, 0.3, 0.42), 0x7a5a3a, 1.2, G + 0.1, 1.2, { ry: 0.6, rz: 0.25 }); P.add(cyl(0.04, 0.04, 0.8, 5), 0x6a4a2a, 1.2, G + 0.5, 1.2, { rz: 0.6 });
      fx.waves.push({ x: X, z: Z });
    },
    factory(P, X, Z) {
      island(P, 0x6a6e72, 0x4a4c50, 8);
      P.add(boxG(2.1, 1.2, 1.2), 0x8a7a6a, -0.3, G + 0.6, -0.7);
      for (let i = 0; i < 3; i++) P.add(cyl(0.42, 0.42, 1.2, 3), 0x5a6a7a, -1.0 + i * 0.7, G + 1.35, -0.7, { rx: Math.PI / 2, rz: Math.PI / 2, sx: 0.8 });
      for (const [x, z, hh] of [[0.9, -1.2, 2.6], [1.5, -0.6, 2.0]]) { P.add(cyl(0.2, 0.26, hh, 8), 0x9a5a48, x, G + hh / 2, z); P.add(cyl(0.27, 0.27, 0.12, 8), 0xf0f0f0, x, G + hh * 0.75, z, { ink: false }); fx.smoke.push({ x: X + x, y: G + hh + 0.1, z: Z + z, big: 0 }); }
      P.add(cyl(0.5, 0.5, 0.9, 10), 0x7a8a9a, -1.6, G + 0.45, 0.6); P.add(ball(0.5, 10, 5), 0x7a8a9a, -1.6, G + 0.9, 0.6, { sy: 0.4 });
      P.add(cyl(0.08, 0.08, 1.6, 6), 0x4a5a6a, -0.6, G + 0.3, 0.6, { rz: Math.PI / 2 });
      for (let i = 0; i < 3; i++) P.add(boxG(0.3, 0.3, 0.3), 0xb07a3a, 0.4 + i * 0.32, G + 0.15, 1.1);
    },
    sky(P, X, Z) {
      island(P, 0xa8c87a, 0x8a8fb0, 9);
      for (const [x, z, s] of [[-1.3, 0.9, 0.6], [1.5, 0.8, 0.5], [0.9, -1.4, 0.7], [-1.6, -1.0, 0.5]]) for (let i = 0; i < 3; i++) P.add(ball(s * (1 - i * 0.2), 9, 6), 0xf4f6ff, x + i * s * 0.6, G + 0.25, z, { ink: false, sy: 0.7 });
      P.add(cyl(0.12, 0.14, 1.2, 6), 0xe8e4f4, -0.3, G + 0.6, 0.6); P.add(cyl(0.12, 0.14, 1.2, 6), 0xe8e4f4, 0.5, G + 0.6, 0.6); P.add(boxG(1.1, 0.14, 0.3), 0xe8e4f4, 0.1, G + 1.25, 0.6);
      const F = parts(); F.add(cyl(1.0, 0.95, 0.24, 9), 0x7ab85a, 0, 0, 0); F.add(cone(0.95, 1.3, 8), 0x8a8fb0, 0, -0.77, 0, { rx: Math.PI });
      F.add(cyl(0.08, 0.1, 0.5, 5), 0x6a4a2e, 0.2, 0.37, 0); F.add(ico(0.42, 0), 0x58ad4c, 0.2, 0.82, 0); F.add(boxG(0.36, 0.3, 0.3), 0xe8e4f4, -0.45, 0.27, 0.2);
      fx.float.push({ list: F.list, x: X - 0.2, y: 2.4, z: Z - 0.6 });
    },
    void(P, X, Z) {
      island(P, 0x3a2f50, 0x2a2238, 10);
      const r = rnd(13); for (let i = 0; i < 7; i++) P.add(octa(0.18 + r() * 0.22), 0x4a3a6a, -1.8 + r() * 3.6, G + 0.1, -1.2 + r() * 2.4, { sy: 2.2, rz: (r() - 0.5) * 0.6 });
      P.add(boxG(0.28, 2.4, 0.3), 0x2a2238, -0.95, G + 1.2, -0.6, { rz: 0.08 }); P.add(boxG(0.28, 2.1, 0.3), 0x2a2238, 0.6, G + 1.05, -0.6, { rz: -0.1 });
      const pts = [[-0.1, 0.1], [0.12, 0.6], [-0.15, 1.1], [0.1, 1.6], [-0.05, 2.1]];
      for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], l = Math.hypot(x1 - x0, y1 - y0); fx.glow.push([boxG(0.16, l, 0.06), X - 0.17 + (x0 + x1) / 2, G + (y0 + y1) / 2, Z - 0.6, 0xc060ff, { rz: -Math.atan2(x1 - x0, y1 - y0) }]); }
      for (let i = 0; i < 5; i++) { const a = i * 1.25; fx.glow.push([boxG(0.1, 0.03, 0.5 + (i % 2) * 0.3), X + Math.cos(a) * 0.7, G + 0.02, Z + 0.4 + Math.sin(a) * 0.5, 0x9040e0, { ry: a }]); }
    },
  };

  // ---- static world: sea, sky, regions with their roads ----
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(SP * 14, 30, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3f5ea8, roughness: 0.55, emissive: 0x1a2a60, emissiveIntensity: 0.35 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(SP * 4.5, -1.1, -2); root.add(sea);
  const bgCan = document.createElement('canvas'); bgCan.width = 4; bgCan.height = 64;
  { const c = bgCan.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#2c2470'); g.addColorStop(0.6, '#6a4aa8'); g.addColorStop(1, '#c87aa0'); c.fillStyle = g; c.fillRect(0, 0, 4, 64); }
  const bgTex = new THREE.CanvasTexture(bgCan); bgTex.colorSpace = THREE.SRGBColorSpace;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: bgTex, depthWrite: false, fog: false })); bg.position.set(0, 4, -16); root.add(bg);

  for (const rg of regions) {
    const P = parts();
    (LAND[rg.biome] || LAND.forest)(P, rg.x, rg.z);
    const nx = regions[rg.k + 1];
    if (nx) { // plank road to the next island, an arc over the water
      const dx = nx.x - rg.x, dz = nx.z - rg.z, n = 9;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = dx * t, z = dz * t + Math.sin(t * Math.PI) * 0.5, lift = Math.sin(t * Math.PI) * 0.35;
        if (Math.hypot(x, z) < R - 0.1 || Math.hypot(x - dx, z - dz) < R - 0.1) { P.add(boxG(0.34, 0.04, 0.62), 0xb89a6a, x, G + 0.005, z, { ry: -Math.atan2(dz, dx), ink: false }); continue; }
        P.add(boxG(0.3, 0.1, 0.7), 0x9a6a3a, x, G + lift - 0.02, z, { ry: -Math.atan2(dz, dx) + (i % 2 ? 0.06 : -0.06) });
      }
    }
    const mesh = bake(P.list); mesh.position.set(rg.x, 0, rg.z); root.add(mesh); rg.mesh = mesh;
  }

  // ---- moving pieces ----
  const glowMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.5, flatShading: true });
  const lavaP = parts(); for (const [g, x, y, z, o] of fx.lava) lavaP.add(g, 0xff7a20, x, y, z, { ...(o || {}), ink: false });
  const lava = bake(lavaP.list, false); lava.material = glowMat(0xff6a1a); root.add(lava);
  const glows = [];
  for (const col of [...new Set(fx.glow.map((q) => q[4]))]) {
    const gp = parts(); for (const [g, x, y, z, c, o] of fx.glow) if (c === col) gp.add(g, col, x, y, z, { ...(o || {}), ink: false });
    const m = bake(gp.list, false); m.material = glowMat(col); root.add(m); glows.push(m);
  }
  const floats = fx.float.map((f) => { const m = bake(f.list); m.position.set(f.x, f.y, f.z); root.add(m); return { m, ...f }; });

  // smoke from the volcano and the chimneys: one instanced draw, each puff rises, swells and shrinks away
  const SMOKE_PER = 5, smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x9a9098, roughness: 1, flatShading: true }), fx.smoke.length * SMOKE_PER);
  smoke.frustumCulled = false; root.add(smoke);
  const sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), glowMat(0x9affb0), Math.max(1, fx.wisps.length)); sparks.frustumCulled = false; root.add(sparks);
  // sea waves at the coast: three crest strips sliding in and back
  const waveP = parts(); for (const wv of fx.waves) for (let i = 0; i < 3; i++) waveP.add(boxG(1.6 - i * 0.3, 0.05, 0.08), 0xf4fbff, wv.x + 1.1 + i * 0.1, G + 0.06, wv.z + 0.4 - i * 0.45, { ry: -0.3, ink: false });
  const waves = bake(waveP.list, false); root.add(waves);
  const SNOW = 50, snowPos = new Float32Array(SNOW * 3), snowSeed = [];
  for (const s of fx.snow) for (let i = 0; i < SNOW; i++) snowSeed.push({ x: s.x + (Math.random() - 0.5) * 5, z: s.z + (Math.random() - 0.5) * 4, y: Math.random() * 3.2, v: 0.5 + Math.random() * 0.4 });
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09 })); snow.frustumCulled = false; root.add(snow);

  // fog and locks over the closed regions
  const fog = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xdcd6f0, roughness: 1, flatShading: true, transparent: true, opacity: 0.93 }), regions.length * PUFFS);
  fog.frustumCulled = false; root.add(fog);
  const puff = regions.map((rg) => { const r = rnd(rg.k + 40); return Array.from({ length: PUFFS }, (_, i) => { const a = (i / PUFFS) * 6.28 + r() * 0.5, d = i < 4 ? r() * 0.7 : R * (0.55 + r() * 0.45); return { x: rg.x + Math.cos(a) * d, y: 0.5 + r() * (i < 4 ? 1.9 : 1.0), z: rg.z + Math.sin(a) * d * 0.85, s: (i < 4 ? 1.15 : 0.8) + r() * 0.4, ph: r() * 6.28 }; }); });
  const lockBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.78, 0.36), new THREE.MeshStandardMaterial({ color: 0xf0b83a, roughness: 0.35, metalness: 0.2 }), regions.length);
  const lockLoop = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.09, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8dfea, roughness: 0.3, metalness: 0.4 }), regions.length);
  for (const m of [lockBody, lockLoop]) { m.frustumCulled = false; root.add(m); }

  // flag on the current region, a marker over a selected region the player is not on
  const flag = new THREE.Group(); root.add(flag);
  const poleP = parts(); poleP.add(cyl(0.05, 0.06, 2.3, 6), 0x5a3a24, 0, 1.15, 0); poleP.add(ball(0.11, 8, 6), 0xf0b83a, 0, 2.33, 0);
  flag.add(bake(poleP.list));
  const clothGeo = new THREE.PlaneGeometry(1.05, 0.66, 8, 2); clothGeo.translate(0.53, 0, 0);
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0xe0504a, roughness: 0.6, side: THREE.DoubleSide, flatShading: true })); cloth.position.y = 1.9; flag.add(cloth);
  const cloth0 = clothGeo.attributes.position.array.slice();
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), glowMat(0xf0c040)); marker.scale.set(1, 1.5, 1); root.add(marker);

  // ---- the team on the current region ----
  let team = [], teamKey = '';
  function setTeam(ids) {
    const key = ids.map((id) => id + ':' + ((meta.acc.heroes[id] || {}).form || 1) + ((meta.acc.heroes[id] || {}).branch || '')).join(',');
    if (key === teamKey) return; teamKey = key;
    for (const b of team) { root.remove(b.root); b.dispose(); }
    team = ids.map((id) => { const b = beastModel(meta, id, { lod: 'battle' }); b.root.scale.multiplyScalar(1.15 / Math.max(0.5, b.beast.height)); root.add(b.root); return b; });
  }

  // ---- camera and the scroll that drives it ----
  const cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 80);
  const CAM = { y: 10.5, z: 13, look: -0.6 };
  const dist = Math.hypot(CAM.y, CAM.z - CAM.look), PPU = h / (2 * dist * Math.tan((cam.fov * Math.PI) / 360));
  const span = (regions.length - 1) * SP * PPU;
  const view = ui.viewport(root, { w, h, r: 17, camera: cam, fps: 30, bg: 0x2c2470, key: 2.3, amb: 1.5, update: step });
  root.parent.fog = new THREE.Fog(0x5a4a98, 22, 40);
  const node = ui.group({ w, h }); node.put(view, 0, 0, 0);
  const scroll = ui.scroll({ w, h, axis: 'x', contentH: w + span }); node.put(scroll, 0, 0, 4);
  const camX = () => scroll.getScroll() / PPU;
  const placeCam = () => { const x = camX(); cam.position.set(x, CAM.y, CAM.z); cam.lookAt(x, 0, CAM.look); cam.updateMatrixWorld(); };

  const st = { open: 1, current: 0, sel: 0 };
  const spots = regions.map((rg) => {
    const hs = ui.hotspot({ id: 'region-' + rg.k, w: HOT.w, h: HOT.h, onTap: () => onPick && onPick(rg.k) });
    const label = ui.text(rg.name, { size: 12.5, align: 'center', upper: true, outlineW: 2.4 }); hs.put(label, HOT.w / 2, 7, 6);
    scroll.put(hs, 0, 0, 2); return { rg, hs, label };
  });
  const toDesign = (x, y, z) => { V.set(x, y, z).project(cam); return [(V.x + 1) * 0.5 * w, (1 - V.y) * 0.5 * h]; };
  function placeSpots() {
    const s = scroll.getScroll();
    for (const p of spots) {
      const [cx, cy] = toDesign(p.rg.x, 0.9, p.rg.z), [, ty] = toDesign(p.rg.x, 3.4, p.rg.z - 0.5);
      const top = Math.max(0, Math.min(h - HOT.h, Math.min(cy - HOT.h / 2, ty)));
      p.hs.pos(cx + s - HOT.w / 2, top);
    }
  }
  let target = null;
  const api = {
    node, scroll, view, regions, PPU,
    focus(k, now) { target = Math.max(0, Math.min(span, k * SP * PPU)); if (now) { scroll.scrollTo(target); target = null; } placeCam(); placeSpots(); },
    set(o) {
      Object.assign(st, o); if (o.team) setTeam(o.team);
      for (const p of spots) {
        const open = p.rg.k < st.open; p.rg.mesh.material = open ? solid : dim;
        p.label.setColor(!open ? 0xa8a2c0 : p.rg.k === st.sel ? 0xffd860 : 0xffffff);
      }
      let n = 0; for (const rg of regions) if (rg.k >= st.open) { for (const q of puff[rg.k]) { M4.compose(V.set(q.x, q.y, q.z), Q.identity(), S3.setScalar(q.s)); fog.setMatrixAt(n++, M4); } }
      fog.count = n; fog.instanceMatrix.needsUpdate = true;
    },
    update(dt) {
      if (scroll.dragging) target = null;
      if (target !== null) { const s = scroll.getScroll(), nx2 = s + (target - s) * (1 - Math.exp(-dt * 9)); scroll.scrollTo(Math.abs(target - nx2) < 0.5 ? target : nx2); if (Math.abs(target - nx2) < 0.5) target = null; }
      placeCam(); placeSpots();
    },
    dbg() {
      placeCam(); return regions.map((rg) => ({ k: rg.k, name: rg.name, biome: rg.biome, open: rg.k < st.open, current: rg.k === st.current, sel: rg.k === st.sel, at: toDesign(rg.x, 0.9, rg.z) }));
    },
    get state() { return { ...st, scroll: scroll.getScroll(), team: team.length }; },
  };

  let t = 0;
  const _q = new THREE.Quaternion();
  function step(dt) {
    t += dt; placeCam();
    const cur = regions[Math.min(regions.length - 1, st.current)];
    flag.position.set(cur.x + 1.35, G, cur.z + 0.35);
    const p = cloth0, a = clothGeo.attributes.position;
    for (let i = 0; i < a.count; i++) { const x = p[i * 3]; a.array[i * 3 + 2] = Math.sin(x * 5 - t * 6) * 0.09 * x; a.array[i * 3 + 1] = p[i * 3 + 1] - x * x * 0.05; }
    a.needsUpdate = true;
    const selR = regions[Math.min(regions.length - 1, st.sel)];
    marker.visible = st.sel !== st.current && st.sel < st.open; marker.position.set(selR.x, 3.6 + Math.sin(t * 3) * 0.15, selR.z - 0.4); marker.rotation.y = t * 1.8;
    team.forEach((b, i) => { const n = team.length, x = (i - (n - 1) / 2) * 0.75; b.root.position.set(cur.x + x - 0.2, G, cur.z + 1.25 - Math.abs(x) * 0.25); b.root.rotation.y = -x * 0.2; b.update(dt); });
    lava.material.emissiveIntensity = 1.1 + Math.sin(t * 2.6) * 0.35;
    for (const g of glows) g.material.emissiveIntensity = 1.0 + Math.sin(t * 3.4) * 0.45;
    for (const f of floats) { f.m.position.y = f.y + Math.sin(t * 1.2) * 0.14; f.m.rotation.y = Math.sin(t * 0.4) * 0.25; }
    waves.position.x = Math.sin(t * 1.4) * 0.12; waves.position.z = Math.sin(t * 1.4) * 0.18;
    let n = 0;
    for (const e of fx.smoke) for (let i = 0; i < SMOKE_PER; i++) {
      const u = (t * 0.32 + i / SMOKE_PER) % 1, sc = (e.big ? 1.25 : 0.8) * Math.sin(u * Math.PI) * (0.6 + u);
      M4.compose(V.set(e.x + Math.sin(u * 4 + i) * 0.18 + u * 0.4, e.y + u * (e.big ? 2.0 : 1.4), e.z), _q.setFromEuler(E.set(u * 2, i, 0)), S3.setScalar(Math.max(0.01, sc))); smoke.setMatrixAt(n++, M4);
    }
    smoke.instanceMatrix.needsUpdate = true;
    fx.wisps.forEach((q, i) => { M4.compose(V.set(q.x + Math.sin(t * 0.9 + q.ph) * 0.25, q.y + Math.sin(t * 2.1 + q.ph) * 0.18, q.z), _q.identity(), S3.setScalar(1 + Math.sin(t * 5 + q.ph) * 0.3)); sparks.setMatrixAt(i, M4); });
    sparks.instanceMatrix.needsUpdate = true;
    snowSeed.forEach((r, i) => { r.y -= r.v * dt; if (r.y < 0.1) r.y = 3.2; snowPos[i * 3] = r.x + Math.sin(t + i) * 0.1; snowPos[i * 3 + 1] = r.y; snowPos[i * 3 + 2] = r.z; });
    snowGeo.attributes.position.needsUpdate = true;
    let f = 0;
    for (const rg of regions) if (rg.k >= st.open) for (const q of puff[rg.k]) { M4.compose(V.set(q.x + Math.sin(t * 0.3 + q.ph) * 0.15, q.y + Math.sin(t * 0.5 + q.ph) * 0.08, q.z), _q.identity(), S3.setScalar(q.s)); fog.setMatrixAt(f++, M4); }
    fog.count = f; fog.instanceMatrix.needsUpdate = true;
    let l = 0;
    for (const rg of regions) if (rg.k >= st.open) {
      const y = 3.7 + Math.sin(t * 2 + rg.k) * 0.1, sw = Math.sin(t * 1.5 + rg.k) * 0.15;
      M4.compose(V.set(rg.x, y, rg.z + 1.6), _q.setFromEuler(E.set(0, sw, 0)), S3.setScalar(1)); lockBody.setMatrixAt(l, M4);
      M4.compose(V.set(rg.x, y + 0.38, rg.z + 1.6), _q.setFromEuler(E.set(0, sw, 0)), S3.setScalar(1)); lockLoop.setMatrixAt(l, M4); l++;
    }
    lockBody.count = lockLoop.count = l; lockBody.instanceMatrix.needsUpdate = lockLoop.instanceMatrix.needsUpdate = true;
  }
  placeCam(); placeSpots();
  if (typeof window !== 'undefined') window.__world = api;
  return api;
}
