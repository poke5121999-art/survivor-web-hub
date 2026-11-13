// Unit models, built from primitives, and their animation from sim state.
// A model faces +x with its feet at the origin. Parts named in MODELS[kind] are the animated groups.
(function () {
  'use strict';
  const PM = globalThis.PM;
  PM.TEAM_COLORS = [0xff5a36, 0x21b8c8, 0xf2b63c, 0x9a6cf0];
  PM.TEAM_NAMES = ['Đội Son', 'Đội Lam'];

  function mats(G, team) {
    const THREE = globalThis.THREE, B = G.bake;
    return {
      bronze: B.mat({ set: 'bronze', scale: 0.9, roughness: 1, metalness: 1, envMapIntensity: 1.25 }),
      paint: B.mat({ set: 'paint', scale: 0.8, color: PM.TEAM_COLORS[team], roughness: 1, metalness: 1, envMapIntensity: 1.1 }),
      steel: B.mat({ set: 'steel', scale: 1.3, roughness: 1, metalness: 1, envMapIntensity: 1.2 }),
      dark: B.mat({ set: 'steel', scale: 1.3, color: 0x55524f, roughness: 1.2, metalness: 1 }),
      cream: B.mat({ set: 'paint', scale: 0.8, color: 0xf2e2c4, roughness: 1, metalness: 1 }),
      eye: G.shared.eye || (G.shared.eye = new THREE.MeshStandardMaterial({ color: 0x1a0d00, emissive: 0xffa22a, emissiveIntensity: 2.6, roughness: 0.15, metalness: 0 })),
      lamp: G.shared['lamp' + team] || (G.shared['lamp' + team] = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PM.TEAM_COLORS[team], emissiveIntensity: 4, roughness: 0.3 })),
      wing: G.shared.wing || (G.shared.wing = new THREE.MeshStandardMaterial({ color: 0xd6f4ff, emissive: 0x3f9fc0, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 }))
    };
  }

  const MODELS = {
    coc(G, team) {
      const THREE = globalThis.THREE, M = mats(G, team), b = PM.Build();
      const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 28, h || 18);
      b.part('body', null, [0, 1.15, 0]);
      b.add(sph(1), M.bronze, { s: [1.38, 0.92, 1.12] });
      b.add(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, 0.98), M.paint, { p: [-0.2, 0.03, 0], s: [1.34, 0.98, 1.16] });
      b.add(new THREE.TorusGeometry(1.0, 0.06, 8, 40), M.bronze, { p: [-0.2, 0.56, 0], r: [Math.PI / 2, 0, 0], s: [1.12, 0.97, 1] });
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.add(sph(0.065, 8, 6), M.bronze, { p: [-0.2 + Math.cos(a) * 1.15, 0.45, Math.sin(a) * 1.0] }); }
      b.add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 1.9, 1.25), M.cream, { p: [0.04, 0.0, 0], s: [1.4, 0.94, 1.14] });
      b.add(new THREE.TorusGeometry(1.0, 0.05, 6, 30, Math.PI * 1.0), M.dark, { p: [0.12, -0.08, 0], r: [Math.PI / 2, 0, -Math.PI * 0.5], s: [1.3, 1.13, 1] });
      for (const z of [-0.56, 0.56]) {
        b.add(sph(0.4, 18, 14), M.bronze, { p: [0.66, 0.74, z], s: [1, 0.95, 1] });
        b.add(sph(0.3, 18, 14), M.eye, { p: [0.78, 0.86, z * 1.12] });
        b.add(PM.Geo.rbox(0.07, 0.34, 0.5, 0.03, 1), M.dark, { p: [0.98, 0.9, z * 1.14], r: [0, 0, -0.3] });
        b.add(new THREE.TorusGeometry(0.31, 0.06, 6, 20), M.steel, { p: [0.74, 0.83, z * 1.08], r: [Math.PI / 2 - 0.5, 0.5 * Math.sign(z), 0] });
      }
      for (const z of [-0.36, 0.36]) {
        b.limb(M.steel, [-1.05, 0.3, z], [-1.55, 0.72, z], 0.12);
        b.add(new THREE.CylinderGeometry(0.17, 0.14, 0.24, 10), M.dark, { p: [-1.62, 0.8, z], r: [0, 0, 0.75] });
      }
      b.limb(M.steel, [-0.85, 0.7, -0.5], [-1.15, 2.15, -0.55], 0.035);
      b.add(new THREE.BoxGeometry(0.7, 0.38, 0.03), M.paint, { p: [-1.52, 1.93, -0.55] });
      b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 16), M.bronze, { p: [0.15, 0.52, 1.0], r: [Math.PI / 2 - 0.45, 0, 0] });
      b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16), M.cream, { p: [0.15, 0.545, 1.05], r: [Math.PI / 2 - 0.45, 0, 0] });

      b.part('barrel', 'body', [-0.1, 0.2, 0]);
      b.add(sph(0.7, 18, 12), M.steel, {});
      b.part('tube', 'barrel');
      b.add(new THREE.CylinderGeometry(0.38, 0.44, 1.6, 22, 1, true), M.steel, { p: [1.15, 0, 0], r: [0, 0, -Math.PI / 2] });
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 1.62, 16), M.dark, { p: [1.15, 0, 0], r: [0, 0, -Math.PI / 2] });
      b.add(new THREE.CylinderGeometry(0.54, 0.4, 0.34, 22, 1, true), M.bronze, { p: [2.0, 0, 0], r: [0, 0, -Math.PI / 2] });
      b.add(new THREE.TorusGeometry(0.52, 0.05, 8, 22), M.bronze, { p: [2.17, 0, 0], r: [0, Math.PI / 2, 0] });
      for (const x of [0.7, 1.15, 1.6]) b.add(new THREE.TorusGeometry(0.43, 0.06, 8, 22), M.bronze, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] });

      const hind = (name, zs) => {
        b.part(name, null, [-0.5, 0.92, zs * 1.0]);
        b.add(sph(1, 16, 12), M.paint, { p: [-0.1, 0.02, zs * 0.08], s: [0.72, 0.5, 0.36], r: [0, 0, 0.5] });
        b.add(sph(0.26, 12, 10), M.bronze, { p: [-0.62, -0.28, zs * 0.12] });
        b.limb(M.bronze, [-0.62, -0.28, zs * 0.12], [0.2, -0.62, zs * 0.18], 0.19);
        b.add(sph(0.2, 10, 8), M.steel, { p: [0.2, -0.62, zs * 0.18] });
        b.add(PM.Geo.rbox(1.2, 0.22, 0.6, 0.1, 2), M.dark, { p: [0.6, -0.81, zs * 0.2] });
        for (const dz of [-0.2, 0, 0.2]) b.add(sph(0.11, 8, 6), M.bronze, { p: [1.2, -0.8, zs * 0.2 + dz] });
      };
      const fore = (name, zs) => {
        b.part(name, null, [0.78, 0.72, zs * 0.86]);
        b.add(sph(0.24, 12, 10), M.bronze, {});
        b.limb(M.paint, [0, 0, 0], [0.32, -0.3, zs * 0.14], 0.15);
        b.limb(M.bronze, [0.32, -0.3, zs * 0.14], [0.22, -0.6, zs * 0.16], 0.11);
        b.add(PM.Geo.rbox(0.62, 0.18, 0.46, 0.08, 2), M.dark, { p: [0.36, -0.63, zs * 0.17] });
      };
      hind('legBL', -1); hind('legBR', 1); fore('legFL', -1); fore('legFR', 1);
      return { root: b.build(), parts: b.parts, legs: ['legBL', 'legFR', 'legBR', 'legFL'], hover: 0, pivotY: 1.25, muzzle: 2.0 };
    },

    chuon(G, team) {
      const THREE = globalThis.THREE, M = mats(G, team), b = PM.Build();
      const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 24, h || 16);
      const alongX = [0, 0, -Math.PI / 2];
      b.part('body', null, [0, 1.15, 0]);
      const prof = [[0, -0.95], [0.3, -0.85], [0.46, -0.45], [0.5, 0.1], [0.42, 0.6], [0.26, 0.95], [0, 1.02]].map(([r, y]) => new THREE.Vector2(r, y));
      b.add(new THREE.LatheGeometry(prof, 22), M.paint, { r: alongX, s: [1, 1.05, 0.95] });
      b.add(new THREE.CylinderGeometry(0.53, 0.53, 0.5, 22), M.bronze, { p: [-0.3, 0, 0], r: alongX });
      for (const x of [-0.5, -0.3, -0.1]) b.add(new THREE.TorusGeometry(0.53, 0.035, 6, 24), M.steel, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] });
      b.add(sph(0.4), M.bronze, { p: [1.0, 0.1, 0], s: [1, 0.9, 1.05] });
      for (const z of [-0.3, 0.3]) b.add(sph(0.27, 18, 12), M.eye, { p: [1.14, 0.22, z], s: [1, 1.1, 0.9] });
      b.add(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, 1.2), M.wing, { p: [0.35, 0.3, 0], s: [1.5, 0.8, 0.8] });
      let tx = -0.95, ty = 0, tr = 0.3;
      for (let i = 0; i < 6; i++) {
        const nx = tx - 0.44, ny = ty + 0.03 * i * i * 0.5;
        b.limb(i % 2 ? M.bronze : M.paint, [tx, ty, 0], [nx, ny, 0], tr);
        b.add(new THREE.TorusGeometry(tr + 0.03, 0.03, 6, 14), M.steel, { p: [tx, ty, 0], r: [0, Math.PI / 2, 0] });
        tx = nx; ty = ny; tr *= 0.83;
      }
      b.add(sph(0.16, 12, 10), M.lamp, { p: [tx - 0.05, ty, 0] });
      for (const [x, z] of [[0.45, -0.3], [0.45, 0.3], [-0.2, -0.32], [-0.2, 0.32]]) {
        b.limb(M.steel, [x, -0.35, z], [x + 0.18, -0.75, z * 1.6], 0.04);
        b.limb(M.steel, [x + 0.18, -0.75, z * 1.6], [x + 0.05, -1.05, z * 1.9], 0.03);
      }
      b.add(new THREE.CylinderGeometry(0.3, 0.2, 0.22, 16), M.dark, { p: [-0.25, -0.55, 0] });
      b.add(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), M.lamp, { p: [-0.25, -0.67, 0] });

      b.part('barrel', 'body', [0.1, -0.05, 0]);
      b.part('tube', 'barrel');
      b.add(new THREE.CylinderGeometry(0.075, 0.1, 2.5, 12), M.steel, { p: [1.25, -0.38, 0], r: alongX });
      b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 12), M.bronze, { p: [2.4, -0.38, 0], r: alongX });
      b.add(PM.Geo.rbox(0.9, 0.26, 0.26, 0.08, 2), M.dark, { p: [0.35, -0.38, 0] });
      b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 10), M.bronze, { p: [0.5, -0.18, 0], r: alongX });
      for (const x of [0.95, 1.5]) b.add(new THREE.TorusGeometry(0.105, 0.025, 6, 12), M.bronze, { p: [x, -0.38, 0], r: [0, Math.PI / 2, 0] });

      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.5, 0.5, 2.0, 0.62, 2.7, 0.2); wingShape.bezierCurveTo(2.85, 0.0, 2.2, -0.3, 0, -0.12);
      const wingGeo = new THREE.ShapeGeometry(wingShape, 10);
      const wing = (name, x, zs, back) => {
        b.part(name, 'body', [x, 0.42, zs * 0.25]);
        b.add(wingGeo, M.wing, { r: [zs * -Math.PI / 2 + zs * 0.12, zs > 0 ? 0 : 0, 0], s: [back ? 0.85 : 1, 1, 1].map((v, i) => (i === 1 ? zs : v)) });
        b.limb(M.steel, [0, 0, 0], [0, 0, zs * 2.3 * (back ? 0.85 : 1)], 0.022);
      };
      wing('wingFL', 0.25, -1, false); wing('wingFR', 0.25, 1, false); wing('wingBL', -0.3, -1, true); wing('wingBR', -0.3, 1, true);
      return { root: b.build(), parts: b.parts, wings: ['wingFL', 'wingFR', 'wingBL', 'wingBR'], hover: 0.55, pivotY: 1.15, muzzle: 2.4 };
    }
  };
  MODELS.tegiac = function (G, team) {
    const THREE = globalThis.THREE, M = mats(G, team), b = PM.Build();
    const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14);
    const alongZ = [Math.PI / 2, 0, 0], alongX = [0, 0, -Math.PI / 2];
    b.part('body', null, [0, 1.2, 0]);
    b.add(PM.Geo.rbox(2.7, 1.05, 1.7, 0.32, 4), M.steel, { p: [-0.1, 0.0, 0] });
    b.add(PM.Geo.rbox(2.2, 0.5, 1.82, 0.2, 3), M.paint, { p: [-0.25, 0.55, 0] });
    b.add(PM.Geo.rbox(1.1, 0.5, 1.5, 0.22, 3), M.paint, { p: [1.0, 0.25, 0], r: [0, 0, -0.38] });
    for (const z of [-0.93, 0.93]) for (const x of [-0.9, -0.3, 0.3]) b.add(PM.Geo.rbox(0.5, 0.62, 0.08, 0.04, 1), M.bronze, { p: [x, 0.05, z] });
    for (const z of [-0.8, 0.8]) for (let i = 0; i < 6; i++) b.add(sph(0.055, 8, 6), M.bronze, { p: [-1.15 + i * 0.4, 0.82, z] });
    b.add(sph(0.62, 18, 12), M.steel, { p: [1.45, 0.02, 0], s: [1.05, 0.85, 0.95] });
    b.add(new THREE.ConeGeometry(0.2, 0.95, 12), M.bronze, { p: [1.92, 0.5, 0], r: [0, 0, -0.5] });
    b.add(new THREE.ConeGeometry(0.13, 0.5, 10), M.bronze, { p: [1.55, 0.62, 0], r: [0, 0, -0.3] });
    for (const z of [-0.42, 0.42]) { b.add(sph(0.16, 12, 10), M.eye, { p: [1.72, 0.18, z] }); b.add(new THREE.ConeGeometry(0.13, 0.3, 8), M.steel, { p: [1.2, 0.62, z * 1.3], r: [0, 0, 0.4] }); }
    b.add(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 14), M.steel, { p: [-1.0, 1.15, 0.35] });
    b.add(new THREE.CylinderGeometry(0.27, 0.2, 0.2, 14), M.bronze, { p: [-1.0, 1.75, 0.35] });
    b.add(PM.Geo.rbox(0.8, 0.6, 1.2, 0.12, 2), M.dark, { p: [-1.5, 0.35, 0] });
    b.add(new THREE.BoxGeometry(0.65, 0.36, 0.03), M.paint, { p: [-1.75, 1.85, -0.5] });
    b.limb(M.steel, [-1.35, 0.8, -0.5], [-1.42, 2.05, -0.5], 0.03);

    b.part('barrel', 'body', [0.15, 0.72, 0]);
    b.add(sph(0.52, 16, 12), M.paint, { s: [1.1, 0.8, 1.2] });
    b.part('tube', 'barrel');
    b.add(new THREE.CylinderGeometry(0.2, 0.26, 2.0, 18), M.steel, { p: [1.3, 0, 0], r: alongX });
    b.add(new THREE.CylinderGeometry(0.31, 0.31, 0.55, 18), M.dark, { p: [0.65, 0, 0], r: alongX });
    b.add(new THREE.CylinderGeometry(0.3, 0.24, 0.42, 18), M.bronze, { p: [2.25, 0, 0], r: alongX });
    for (const x of [1.2, 1.7]) b.add(new THREE.TorusGeometry(0.25, 0.04, 6, 18), M.bronze, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] });

    const track = (name, zs) => {
      b.part(name, null, [0, 0.52, zs * 0.98]);
      b.add(PM.Geo.rbox(3.1, 0.95, 0.5, 0.45, 4), M.dark, {});
      b.add(PM.Geo.rbox(2.3, 0.3, 0.56, 0.1, 2), M.paint, { p: [0, 0.42, 0] });
      for (let i = 0; i < 5; i++) { const x = -1.1 + i * 0.55; b.add(new THREE.CylinderGeometry(i === 0 || i === 4 ? 0.3 : 0.24, i === 0 || i === 4 ? 0.3 : 0.24, 0.58, 14), M.steel, { p: [x, i === 0 || i === 4 ? 0.05 : -0.16, 0], r: alongZ }); b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.62, 8), M.bronze, { p: [x, i === 0 || i === 4 ? 0.05 : -0.16, 0], r: alongZ }); }
      for (let i = 0; i < 12; i++) b.add(new THREE.BoxGeometry(0.1, 0.07, 0.54), M.steel, { p: [-1.4 + i * 0.255, -0.48, 0] });
    };
    track('trackL', -1); track('trackR', 1);
    return { root: b.build(), parts: b.parts, tracks: ['trackL', 'trackR'], hover: 0, smoke: [-1.0, 3.1, 0.35] };
  };

  MODELS.oc = function (G, team) {
    const THREE = globalThis.THREE, M = mats(G, team), b = PM.Build();
    const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 22, h || 16);
    b.part('body', null, [0, 0.42, 0]);
    b.add(PM.Geo.rbox(2.7, 0.55, 1.2, 0.27, 4), M.cream, { p: [0.15, 0, 0] });
    b.add(sph(0.5), M.cream, { p: [1.25, 0.28, 0], s: [1.2, 0.95, 1] });
    for (let i = 0; i < 9; i++) b.add(sph(0.16, 8, 6), M.cream, { p: [-1.05 + i * 0.3, -0.2, 0.6] }), b.add(sph(0.16, 8, 6), M.cream, { p: [-1.05 + i * 0.3, -0.2, -0.6] });
    for (const z of [-0.26, 0.26]) {
      b.limb(M.cream, [1.45, 0.55, z], [1.75, 1.35, z * 1.5], 0.07);
      b.add(sph(0.17, 12, 10), M.eye, { p: [1.78, 1.42, z * 1.5] });
    }
    b.add(new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI), M.dark, { p: [1.7, 0.2, 0], r: [Math.PI / 2, 0, -Math.PI / 2] });

    b.part('shell', 'body', [-0.25, 0.95, 0]);
    b.add(sph(1.0, 28, 20), M.paint, { s: [1.05, 1.0, 0.8] });
    let r = 0.98;
    for (let i = 0; i < 4; i++) { b.add(new THREE.TorusGeometry(r * 0.78, 0.07, 8, 30), M.bronze, { p: [-0.06 * i, 0.04 * i, 0], s: [1, 1, 1.1] }); r *= 0.72; }
    for (const z of [-0.82, 0.82]) { b.add(sph(0.3, 14, 10), M.bronze, { p: [-0.1, 0.1, z], s: [1, 1, 0.5] }); b.add(sph(0.14, 10, 8), M.steel, { p: [-0.1, 0.1, z * 1.12] }); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.add(sph(0.06, 6, 5), M.bronze, { p: [Math.cos(a) * 1.02, Math.sin(a) * 0.98, 0.38] }); b.add(sph(0.06, 6, 5), M.bronze, { p: [Math.cos(a) * 1.02, Math.sin(a) * 0.98, -0.38] }); }
    b.limb(M.steel, [-0.6, 0.8, -0.3], [-0.85, 1.75, -0.3], 0.03);
    b.add(new THREE.BoxGeometry(0.55, 0.3, 0.03), M.paint, { p: [-1.14, 1.62, -0.3] });

    b.part('barrel', 'body', [-0.05, 0.73, 0]);
    b.part('tube', 'barrel');
    b.add(new THREE.CylinderGeometry(0.3, 0.36, 1.3, 18, 1, true), M.steel, { p: [1.25, 0, 0], r: [0, 0, -Math.PI / 2] });
    b.add(new THREE.CylinderGeometry(0.25, 0.25, 1.28, 14), M.dark, { p: [1.25, 0, 0], r: [0, 0, -Math.PI / 2] });
    b.add(new THREE.TorusGeometry(0.34, 0.07, 8, 20), M.bronze, { p: [1.86, 0, 0], r: [0, Math.PI / 2, 0] });
    b.add(new THREE.TorusGeometry(0.37, 0.06, 8, 20), M.bronze, { p: [0.95, 0, 0], r: [0, Math.PI / 2, 0] });
    return { root: b.build(), parts: b.parts, crawl: true, hover: 0 };
  };

  PM.UNIT_MODELS = MODELS;

  PM.Units3D = function (G) {
    const THREE = globalThis.THREE, scene = G.scene, sim = G.sim;
    const group = new THREE.Group(); scene.add(group);
    const list = sim.units.map((u) => {
      const model = MODELS[u.kind](G, u.team);
      const holder = new THREE.Group();
      holder.add(model.root); group.add(holder);
      return { u, model, holder, yaw: u.facing > 0 ? 0 : Math.PI, tilt: 0, walk: 0, lastX: u.x, recoil: PM.spring(260, 16), rock: PM.spring(140, 9), punch: PM.spring(300, 14), bob: Math.random() * 6, dead: false, deadT: 0, spin: 0, aim: u.angle };
    });
    const byId = (id) => list[id];
    G.bus.on('sim:fire', (ev) => { const m = byId(ev.unit); if (m) { m.recoil.kick(-7 - ev.power * 0.05); m.rock.kick(-2.2); } });
    G.bus.on('sim:damage', (ev) => { const m = byId(ev.unit); if (m) m.punch.kick(5); });
    G.bus.on('sim:land', (ev) => { const m = byId(ev.unit); if (m) m.punch.kick(-Math.min(8, ev.fall * 0.8)); });

    function update(dt) {
      for (const m of list) {
        const u = m.u, model = m.model, P = model.parts;
        if (!u.alive) {
          if (!m.dead) { m.dead = true; m.deadT = 0; }
          m.deadT += dt;
          m.holder.visible = u.y > G.map.seaY - 4 ? m.deadT < 0.12 : m.deadT < 1.5;
          if (m.holder.visible) { m.holder.position.set(u.x, Math.max(u.y, G.map.seaY - 6 - m.deadT * 6), 0); m.holder.rotation.z += dt * 3; }
          continue;
        }
        const yawT = u.facing > 0 ? 0 : Math.PI;
        m.yaw += (yawT - m.yaw) * (1 - Math.exp(-dt * 12));
        const tiltT = u.grounded ? Math.atan(PM.clamp(u.slope, -1.2, 1.2)) * (model.hover ? 0.25 : 0.7) : m.tilt;
        m.tilt += (tiltT - m.tilt) * (1 - Math.exp(-dt * 8));
        const dx = u.x - m.lastX; m.lastX = u.x;
        const moving = u.grounded && Math.abs(dx) > 1e-4;
        m.walk += Math.abs(dx) * 2.4;
        m.bob += dt;
        if (!u.grounded) m.spin += dt * (u.vx > 0 ? -1 : 1) * Math.min(6, Math.abs(u.vx) * 0.35 + 1.5); else m.spin *= Math.exp(-dt * 14);
        const hover = model.hover ? model.hover + Math.sin(m.bob * 2.6) * 0.12 : 0;
        const punch = m.punch.step(dt), rock = m.rock.step(dt), rec = m.recoil.step(dt);
        m.holder.position.set(u.x, u.y + hover + (moving && !model.hover ? Math.abs(Math.sin(m.walk * 2)) * 0.07 : 0), 0);
        m.holder.rotation.set(0, m.yaw, 0);
        const fz = Math.cos(m.yaw);
        model.root.rotation.z = m.tilt * fz + rock * 0.06 + m.spin;
        model.root.scale.set(1 + punch * 0.02, 1 - punch * 0.03, 1 + punch * 0.02);
        m.aim += (u.angle - m.aim) * (1 - Math.exp(-dt * 25));
        P.barrel.rotation.z = m.aim * Math.PI / 180 - model.root.rotation.z;
        P.tube.position.x = rec * 0.05;
        if (model.legs) {
          model.legs.forEach((name, i) => {
            const ph = m.walk * 2 + i * Math.PI / 2, sw = moving ? 1 : 0;
            P[name].rotation.z = Math.sin(ph) * 0.3 * sw + (i % 2 ? 1 : -1) * rock * 0.03;
            P[name].position.y = (P[name].userData.y0 === undefined ? (P[name].userData.y0 = P[name].position.y) : P[name].userData.y0) + Math.max(0, Math.cos(ph)) * 0.16 * sw;
          });
          P.body.position.y = 1.15 + Math.sin(m.bob * 1.7) * 0.025;
        }
        if (model.tracks) { P.body.position.y = 1.2 + (moving ? Math.sin(m.walk * 9) * 0.02 : 0) + Math.sin(m.bob * 11) * 0.006; P.body.rotation.z = rock * 0.03; }
        if (model.crawl) { const sq = moving ? Math.sin(m.walk * 3) : 0; P.body.scale.set(1 + sq * 0.06, 1 - sq * 0.04, 1); P.shell.rotation.z = Math.sin(m.bob * 1.4) * 0.03 - rock * 0.05; }
        if (model.wings) {
          const f = moving || !u.grounded ? 46 : 30, a = moving ? 0.5 : 0.32;
          model.wings.forEach((name, i) => { const zs = i % 2 ? 1 : -1; P[name].rotation.x = zs * (Math.sin(m.bob * f + (i > 1 ? 1.3 : 0)) * a + 0.12); });
          P.body.rotation.z = Math.sin(m.bob * 1.3) * 0.03 - (moving ? 0.12 : 0);
        }
      }
    }
    update(0);
    return { group, list, update, dispose() { scene.remove(group); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
      muzzleWorld(u) { const mz = PM.Sim.muzzle(u); return new THREE.Vector3(mz.x, mz.y + (MODELS[u.kind] ? list[u.id].model.hover : 0) * 0, 0); } };
  };
})();
