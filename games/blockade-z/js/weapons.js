// Weapons: a stat table, blocky viewmodels built from boxes, hitscan, and spring-driven feel.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const WEAPONS = {
    pistol: { name: 'Súng lục', key: '1', price: 120, dmg: 34, head: 2, rpm: 380, auto: false, mag: 12, reserve: Infinity, pellets: 1, spread: 0.006, moveSpread: 0.018, range: 90, reload: 1.15, snd: 'pistol', impulse: 1, crit: 0.14,
      kick: { back: 0.05, rise: 2.2, yaw: 0.6, cam: 0.012 }, adsFov: 62 },
    shotgun: { name: 'Shotgun', key: '2', price: 350, dmg: 17, head: 1.5, rpm: 70, auto: false, mag: 6, reserve: 30, pellets: 9, spread: 0.065, moveSpread: 0.075, range: 32, perShell: 0.42, snd: 'shotgun', impulse: 0.45,
      kick: { back: 0.14, rise: 6, yaw: 1.4, cam: 0.045 }, adsFov: 64 },
    smg: { name: 'SMG', key: '3', price: 0, dmg: 21, head: 1.8, rpm: 780, auto: true, mag: 40, reserve: Infinity, pellets: 1, spread: 0.016, moveSpread: 0.03, range: 60, reload: 1.6, snd: 'smg', impulse: 0.55,
      kick: { back: 0.035, rise: 1.2, yaw: 0.8, cam: 0.006 }, adsFov: 60, tracer: 3 },
    rifle: { name: 'Súng trường', key: '4', price: 900, dmg: 46, head: 2.5, rpm: 540, auto: true, mag: 30, reserve: 120, pellets: 1, spread: 0.005, moveSpread: 0.022, range: 120, reload: 2.0, snd: 'rifle', impulse: 1.4, pierce: 2,
      kick: { back: 0.05, rise: 1.8, yaw: 0.9, cam: 0.01 }, adsFov: 45, tracer: 2 },
    bazooka: { name: 'Bazooka', key: '5', price: 1200, dmg: 0, head: 1, rpm: 50, auto: false, mag: 1, reserve: 10, pellets: 1, spread: 0.002, moveSpread: 0.012, range: 150, reload: 2.4, snd: 'rocket', impulse: 3, rocket: true,
      kick: { back: 0.3, rise: 7, yaw: 1, cam: 0.06 }, adsFov: 55 },
    // melee: swing = seconds per swing, hitAt = when the edge lands, arc = half-angle of the cone it sweeps, cleave = bodies per swing
    katana: { name: 'Katana', price: 300, melee: true, cut: 'blade', dmg: 58, head: 1.7, swing: 0.36, hitAt: 0.13, range: 2.7, arc: 1.05, cleave: 3, impulse: 1.3, crit: 0.22, lunge: 3.2, stop: 0.055,
      snd: 'slash', hitSnd: 'chop', combo: ['r2l', 'l2r', 'over'], trail: 0xd8f0ff, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.012 }, adsFov: 70 },
    axe: { name: 'Rìu', price: 250, melee: true, cut: 'axe', dmg: 105, head: 1.6, swing: 0.66, hitAt: 0.3, range: 2.6, arc: 0.85, cleave: 2, impulse: 3, crit: 0.12, lunge: 2.2, stop: 0.1,
      snd: 'heavy', hitSnd: 'cleave', combo: ['over', 'r2l'], trail: 0xffd8a0, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.03 }, adsFov: 70 },
    saber: { name: 'Kiếm ánh sáng', price: 1500, melee: true, cut: 'saber', dmg: 82, head: 1.5, swing: 0.4, hitAt: 0.15, range: 3.0, arc: 1.25, cleave: 4, impulse: 1.1, crit: 0.2, lunge: 3.6, stop: 0.06,
      snd: 'saber_swing', hitSnd: 'saber_hit', combo: ['r2l', 'l2r', 'spin'], trail: 0x60f0ff, glow: 0x60e8ff, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.014 }, adsFov: 70 },
  };
  BZ.WEAPONS = WEAPONS;
  const ORDER = ['pistol', 'shotgun', 'smg', 'rifle', 'bazooka', 'katana', 'axe', 'saber'];
  const START = ['smg', 'katana'];
  const SLOTS = 2;

  // Viewmodel shapes: many small flat-colour voxels, gun points along -z, grip near origin.
  // Each gun: dark body, a light edge stripe, one saturated accent, one emissive cell.
  const GUNS = {
    pistol: { port: [0.045, 0.09, -0.07], muzzle: [0, 0.075, -0.3], lh: [-0.05, -0.1, 0.0], magHand: [0, -0.22, 0.03], parts: [
      [-0.04, 0.04, -0.26, 0.04, 0.11, 0.04, 'g_body2', 'slide'], [-0.041, 0.108, -0.26, 0.041, 0.118, 0.04, 'g_edge', 'slide'],
      [-0.042, 0.05, -0.005, 0.042, 0.1, 0.008, 'g_body', 'slide'], [-0.042, 0.05, 0.016, 0.042, 0.1, 0.029, 'g_body', 'slide'],
      [-0.035, 0.0, -0.22, 0.035, 0.042, 0.02, 'g_body'], [-0.036, 0.014, -0.2, 0.036, 0.03, -0.08, 'g_orange'],
      [-0.018, 0.058, -0.29, 0.018, 0.092, -0.26, 'g_steel'], [-0.01, 0.118, -0.245, 0.01, 0.136, -0.225, 'g_body', 'slide'],
      [-0.026, 0.118, 0.012, -0.008, 0.136, 0.03, 'g_body', 'slide'], [0.008, 0.118, 0.012, 0.026, 0.136, 0.03, 'g_body', 'slide'],
      [-0.012, -0.045, -0.085, 0.012, 0.0, -0.072, 'g_body'], [-0.012, -0.048, -0.085, 0.012, -0.036, -0.02, 'g_body'],
      [0.041, 0.068, -0.07, 0.044, 0.09, -0.02, 'g_glow_orange', 'slide'],
    ], grip: [[-0.033, -0.17, -0.025, 0.033, 0.0, 0.06, 'g_grip'], [-0.035, -0.14, -0.005, 0.035, -0.04, 0.045, 'g_orange'], [-0.027, -0.19, -0.012, 0.027, -0.02, 0.048, 'g_body2', 'mag'], [-0.029, -0.2, -0.015, 0.029, -0.185, 0.051, 'g_orange', 'mag']] },
    shotgun: { port: [0.05, 0.07, -0.12], shellColor: 'red', muzzle: [0, 0.075, -0.94], lh: [0, -0.06, -0.55], magHand: [0, -0.06, -0.55], parts: [
      [-0.045, 0.0, -0.3, 0.045, 0.11, 0.06, 'g_body'], [-0.046, 0.105, -0.3, 0.046, 0.116, 0.06, 'g_edge'],
      [-0.028, 0.05, -0.9, 0.028, 0.1, -0.3, 'g_steel'], [-0.024, 0.0, -0.82, 0.024, 0.046, -0.3, 'g_body2'],
      [-0.05, -0.016, -0.66, 0.05, 0.056, -0.44, 'g_red', 'pump'],
      [-0.052, -0.002, -0.62, 0.052, 0.042, -0.605, 'g_body', 'pump'], [-0.052, -0.002, -0.565, 0.052, 0.042, -0.55, 'g_body', 'pump'], [-0.052, -0.002, -0.51, 0.052, 0.042, -0.495, 'g_body', 'pump'],
      [-0.031, 0.044, -0.925, 0.031, 0.106, -0.9, 'g_edge'], [-0.008, 0.1, -0.885, 0.008, 0.116, -0.865, 'g_gold'],
      [-0.04, -0.06, 0.06, 0.04, 0.09, 0.4, 'g_body2'], [-0.041, 0.0, 0.15, 0.041, 0.03, 0.4, 'g_red'], [-0.042, -0.07, 0.39, 0.042, 0.1, 0.42, 'g_grip'],
      [0.045, 0.02, -0.25, 0.06, 0.075, -0.225, 'g_red'], [0.045, 0.02, -0.21, 0.06, 0.075, -0.185, 'g_red'], [0.045, 0.02, -0.17, 0.06, 0.075, -0.145, 'g_red'],
      [0.045, 0.075, -0.25, 0.06, 0.09, -0.145, 'g_gold'],
      [0.046, 0.065, -0.07, 0.049, 0.088, -0.0, 'g_glow_red'],
    ], grip: [[-0.035, -0.16, 0.0, 0.035, 0.0, 0.08, 'g_grip']] },
    smg: { port: [0.045, 0.09, -0.16], muzzle: [0, 0.06, -0.54], lh: [0, -0.02, -0.41], magHand: [0, -0.3, -0.165], parts: [
      [-0.042, 0.0, -0.34, 0.042, 0.115, 0.06, 'g_body'], [-0.043, 0.06, -0.34, 0.043, 0.074, 0.06, 'g_lime'], [0.042, 0.078, -0.12, 0.064, 0.1, -0.085, 'g_steel', 'bolt'],
      [-0.03, 0.115, -0.32, 0.03, 0.132, 0.02, 'g_body2'],
      [-0.031, 0.132, -0.3, 0.031, 0.142, -0.285, 'g_body'], [-0.031, 0.132, -0.25, 0.031, 0.142, -0.235, 'g_body'], [-0.031, 0.132, -0.2, 0.031, 0.142, -0.185, 'g_body'],
      [-0.03, 0.03, -0.48, 0.03, 0.09, -0.34, 'g_body2'],
      [0.03, 0.05, -0.46, 0.033, 0.07, -0.44, 'g_grip'], [0.03, 0.05, -0.42, 0.033, 0.07, -0.4, 'g_grip'], [0.03, 0.05, -0.38, 0.033, 0.07, -0.36, 'g_grip'],
      [-0.021, 0.039, -0.53, 0.021, 0.081, -0.48, 'g_steel'],
      [-0.024, -0.26, -0.2, 0.024, 0.0, -0.13, 'g_body2', 'mag'], [-0.027, -0.285, -0.205, 0.027, -0.255, -0.125, 'g_lime', 'mag'],
      [-0.012, 0.02, 0.06, 0.012, 0.05, 0.3, 'g_steel'], [-0.035, -0.04, 0.28, 0.035, 0.09, 0.31, 'g_body'],
      [-0.026, 0.132, -0.13, 0.026, 0.18, -0.04, 'g_body'], [-0.016, 0.142, -0.042, 0.016, 0.17, -0.038, 'g_glow_lime'],
      [0.043, 0.02, -0.3, 0.046, 0.042, -0.25, 'g_glow_lime'],
    ], grip: [[-0.03, -0.15, 0.0, 0.03, 0.0, 0.07, 'g_grip']] },
    rifle: { port: [0.043, 0.09, -0.22], muzzle: [0, 0.055, -0.98], lh: [0, -0.06, -0.6], magHand: [0, -0.29, -0.27], parts: [
      [-0.04, 0.0, -0.46, 0.04, 0.115, 0.08, 'g_body'], [-0.041, 0.03, -0.42, 0.041, 0.085, -0.25, 'g_blue'], [0.04, 0.074, -0.08, 0.064, 0.098, -0.045, 'g_steel', 'bolt'],
      [-0.041, 0.11, -0.46, 0.041, 0.12, 0.08, 'g_edge'],
      [-0.045, -0.01, -0.7, 0.045, 0.1, -0.46, 'g_body2'],
      [0.045, 0.03, -0.66, 0.048, 0.06, -0.62, 'g_grip'], [0.045, 0.03, -0.6, 0.048, 0.06, -0.56, 'g_grip'], [0.045, 0.03, -0.54, 0.048, 0.06, -0.5, 'g_grip'],
      [-0.016, 0.04, -0.92, 0.016, 0.07, -0.7, 'g_steel'], [-0.026, 0.03, -0.97, 0.026, 0.08, -0.92, 'g_body'], [-0.008, 0.08, -0.75, 0.008, 0.13, -0.73, 'g_body'],
      [-0.026, -0.16, -0.3, 0.026, 0.0, -0.2, 'g_body2', 'mag'], [-0.026, -0.26, -0.33, 0.026, -0.15, -0.22, 'g_body2', 'mag'], [-0.027, -0.2, -0.32, 0.027, -0.18, -0.21, 'g_blue', 'mag'],
      [-0.038, -0.06, 0.08, 0.038, 0.1, 0.42, 'g_body2'], [-0.039, 0.02, 0.2, 0.039, 0.05, 0.42, 'g_blue'], [-0.04, -0.07, 0.41, 0.04, 0.11, 0.44, 'g_grip'],
      [-0.03, 0.13, -0.3, 0.03, 0.19, -0.06, 'g_body'], [-0.015, 0.12, -0.26, 0.015, 0.13, -0.22, 'g_body2'], [-0.015, 0.12, -0.14, 0.015, 0.13, -0.1, 'g_body2'],
      [-0.022, 0.14, -0.302, 0.022, 0.18, -0.298, 'g_glow_blue'], [-0.02, 0.142, -0.062, 0.02, 0.178, -0.058, 'g_glow_blue'],
      [0.041, 0.09, -0.2, 0.044, 0.108, -0.12, 'g_glow_blue'],
    ], grip: [[-0.032, -0.15, -0.02, 0.032, 0.0, 0.06, 'g_grip']] },
  };
  GUNS.bazooka = { port: [0.07, 0.1, 0.2], muzzle: [0, 0.05, -1.0], lh: [0, -0.08, -0.45], magHand: [0, 0.05, -1.25], parts: [
    [-0.075, -0.02, -0.9, 0.075, 0.12, 0.45, 'g_body2'], [-0.09, -0.035, -0.96, 0.09, 0.135, -0.86, 'g_edge'], [-0.09, -0.035, 0.4, 0.09, 0.135, 0.5, 'g_edge'],
    [-0.076, 0.03, -0.6, 0.076, 0.07, 0.2, 'g_red'], [-0.03, 0.12, -0.35, 0.03, 0.2, -0.15, 'g_body'], [-0.02, 0.15, -0.36, 0.02, 0.19, -0.34, 'g_glow_red'],
    [-0.03, -0.18, -0.4, 0.03, -0.02, -0.32, 'g_grip'], [0.076, 0.0, -0.1, 0.09, 0.06, 0.1, 'g_body'],
    [-0.05, 0.0, -1.06, 0.05, 0.1, -0.9, 'g_red', 'mag'], [-0.035, 0.015, -1.13, 0.035, 0.085, -1.06, 'g_gold', 'mag'],
  ], grip: [[-0.032, -0.16, -0.02, 0.032, 0.0, 0.06, 'g_grip']] };
  GUNS.katana = { tip: [0, 1.1, 0], mid: [0, 0.62, 0], lh: [0, -0.12, 0.02], oneHand: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 1.1, 0], parts: [
    [-0.022, -0.16, -0.025, 0.022, 0.16, 0.025, 'g_tsuka'], [-0.026, -0.19, -0.029, 0.026, -0.16, 0.029, 'g_gold'],
    [-0.03, 0.16, -0.075, 0.03, 0.186, 0.075, 'g_gold'], [-0.034, 0.165, -0.06, 0.034, 0.181, 0.06, 'g_body'], [-0.016, 0.186, -0.03, 0.016, 0.22, 0.03, 'g_gold'],
    [-0.008, 0.22, -0.012, 0.008, 0.5, 0.022, 'g_blade', 'blade'], [-0.005, 0.22, -0.024, 0.005, 0.5, -0.012, 'g_edge', 'blade'],
    [-0.008, 0.5, -0.008, 0.008, 0.82, 0.026, 'g_blade', 'blade'], [-0.005, 0.5, -0.02, 0.005, 0.82, -0.008, 'g_edge', 'blade'],
    [-0.008, 0.82, -0.002, 0.008, 1.02, 0.03, 'g_blade', 'blade'], [-0.005, 0.82, -0.014, 0.005, 1.02, -0.002, 'g_edge', 'blade'],
    [-0.007, 1.02, 0.004, 0.007, 1.08, 0.03, 'g_blade', 'blade'], [-0.004, 1.02, -0.008, 0.004, 1.12, 0.012, 'g_edge', 'blade'],
  ], grip: [] };
  GUNS.axe = { tip: [0, 0.72, -0.31], mid: [0, 0.68, -0.2], lh: [0, 0.3, 0.02], oneHand: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 0.72, -0.31], parts: [
    [-0.022, -0.2, -0.026, 0.022, 0.8, 0.026, 'g_wood'], [-0.026, -0.2, -0.03, 0.026, 0.06, 0.03, 'g_grip'], [-0.027, 0.48, -0.031, 0.027, 0.52, 0.031, 'g_red'],
    [-0.036, 0.58, -0.055, 0.036, 0.82, 0.055, 'g_body2'], [-0.021, 0.56, -0.25, 0.021, 0.84, -0.055, 'g_steel'], [-0.021, 0.48, -0.3, 0.021, 0.62, -0.18, 'g_steel'],
    [-0.012, 0.48, -0.33, 0.012, 0.87, -0.25, 'g_edge'], [-0.019, 0.66, 0.055, 0.019, 0.74, 0.17, 'g_body'], [-0.028, 0.82, -0.045, 0.028, 0.85, 0.045, 'g_body'],
    [-0.022, 0.6, -0.2, 0.022, 0.64, -0.08, 'g_gold'],
  ], grip: [] };
  GUNS.saber = { tip: [0, 1.16, 0], mid: [0, 0.7, 0], lh: [-0.2, -0.7, 0.4], oneHand: true, saber: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 1.16, 0], parts: [
    [-0.027, -0.14, -0.027, 0.027, 0.2, 0.027, 'g_steel'], [-0.031, -0.17, -0.031, 0.031, -0.14, 0.031, 'g_body2'],
    [-0.031, -0.06, -0.031, 0.031, -0.04, 0.031, 'g_body'], [-0.031, 0.0, -0.031, 0.031, 0.02, 0.031, 'g_body'], [-0.031, 0.06, -0.031, 0.031, 0.08, 0.031, 'g_body'],
    [0.027, 0.1, -0.012, 0.036, 0.13, 0.012, 'g_red'], [-0.035, 0.2, -0.035, 0.035, 0.245, 0.035, 'g_body'], [-0.03, 0.245, -0.03, 0.03, 0.26, 0.03, 'g_edge'],
    [-0.012, 0.26, -0.012, 0.012, 1.16, 0.012, 'g_saber_core', 'blade'], [-0.006, 1.16, -0.006, 0.006, 1.18, 0.006, 'g_saber_core', 'blade'],
  ], grip: [] };
  const GLOW = { g_glow_orange: 0xff8a20, g_glow_red: 0xff3a2a, g_glow_lime: 0x9cff50, g_glow_blue: 0x50c0ff, g_saber_core: 0xe8ffff, g_glow_saber: 0x60e8ff };
  // a plain world-space copy (no arms, fogged, lit like the scene) for weapons lying on the ground or in a soldier's hands
  const worldCache = {};
  BZ.worldGun = (id) => {
    if (!worldCache[id]) {
      const D = GUNS[id]; const B = new BZ.Builder('wgun:' + id);
      const tilt = new THREE.Matrix4().makeRotationX(0.28);
      for (const p of D.parts) B.box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true });
      for (const p of D.grip) { B.push(tilt); B.box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true }); B.pop(); }
      const matOpts = {}; for (const k of Object.keys(GLOW)) matOpts[k] = { emissive: GLOW[k] };
      worldCache[id] = B.build({ cast: false, matOpts });
    }
    const g = worldCache[id].clone();
    if (GUNS[id].saber) { const h = saberHalo(1.0); h.position.y = 0.72; g.add(h); }
    return g;
  };
  function saberHalo(o) {
    // nested additive shells, each wider and fainter, read as a soft glow around the white core
    const shell = (w, c, a) => new THREE.Mesh(new THREE.BoxGeometry(w, 0.92 + w, w), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: a * o, depthWrite: false, blending: THREE.AdditiveBlending }));
    const m = shell(0.042, 0x60e8ff, 0.55); m.add(shell(0.07, 0x30b8ff, 0.2)); m.add(shell(0.11, 0x1a70ff, 0.08));
    return m;
  }
  function buildGun(id) {
    const D = GUNS[id];
    // One builder per moving part (body, slide, bolt, pump, mag) so reloads can animate them.
    const builders = {};
    const builder = (r) => (builders[r] = builders[r] || new BZ.Builder('gun:' + id + ':' + r));
    const box = (B, p) => B.box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true });
    for (const p of D.parts) box(builder(p[7] || 'body'), p);
    const tilt = new THREE.Matrix4().makeRotationX(0.28);
    for (const p of D.grip) { const B = builder(p[7] || 'body'); B.push(tilt); box(B, p); B.pop(); }
    const matOpts = {}; for (const k of Object.keys(GLOW)) matOpts[k] = { emissive: GLOW[k] };
    const g = new THREE.Group(); const parts = {};
    for (const [r, B] of Object.entries(builders)) { const m = B.build({ matOpts }); m.name = r; g.add(m); parts[r] = m; }
    if (id === 'shotgun') {
      const SB = new BZ.Builder('shell');
      SB.box([-0.018, -0.018, -0.05], [0.018, 0.018, 0.03], 'g_red', { uv: 'fit', vary: 0, flat: true });
      SB.box([-0.019, -0.019, 0.03], [0.019, 0.019, 0.05], 'g_gold', { uv: 'fit', vary: 0, flat: true });
      parts.shell = SB.build(); parts.shell.visible = false; g.add(parts.shell);
    }
    // Arms: gloved hand at the origin, camo forearm running back and down out of frame.
    const arm = (yaw, pitch) => {
      const AB = new BZ.Builder('arm');
      AB.box([-0.045, -0.045, -0.055], [0.045, 0.05, 0.055], 'glove', { uv: 'fit', vary: 0 });
      AB.push(new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(pitch)));
      AB.box([-0.05, -0.055, 0.04], [0.05, 0.055, 0.22], 'g_body2', { uv: 'fit', vary: 0 });
      AB.box([-0.055, -0.06, 0.2], [0.055, 0.06, 0.62], 'sleeve', { uv: 'world', uvScale: 6, vary: 0 });
      AB.pop();
      return AB.build();
    };
    parts.handR = arm(0.35, 0.5); parts.handR.position.set(0, -0.07, 0.025); parts.handR.rotation.x = 0.28; g.add(parts.handR);
    parts.handL = arm(-0.55, 0.35); g.add(parts.handL);
    g.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.fog = false; } });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: BZ.tex('flash'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    flash.position.set(...D.muzzle); flash.visible = false;
    g.add(flash);
    if (D.saber) { const h = saberHalo(1); h.position.y = 0.72; h.traverse((q) => { if (q.material) q.material.fog = false; }); g.add(h); parts.halo = h; }
    if (D.oneHand) parts.handL.visible = false;
    if (WEAPONS[id].melee) g.scale.setScalar(0.85);
    const magDir = id === 'bazooka' ? new THREE.Vector3(0, 0.15, -1).normalize() : id === 'pistol' ? new THREE.Vector3(0, -1, 0).applyMatrix4(tilt) : new THREE.Vector3(0, -1, 0.12).normalize();
    g.userData = { muzzle: new THREE.Vector3(...D.muzzle), flash, parts, magDir, lh: new THREE.Vector3(...D.lh), magHand: new THREE.Vector3(...D.magHand), port: new THREE.Vector3(...D.port), shellColor: D.shellColor, tip: D.tip && new THREE.Vector3(...D.tip), mid: D.mid && new THREE.Vector3(...D.mid) };
    return g;
  }
  BZ.GUN_PARTS = GUNS;

  const seg = (t, a, b) => BZ.clamp((t - a) / (b - a), 0, 1);
  const ease = (x) => x * x * (3 - 2 * x);
  const RELOAD_SOUNDS = [[0.15, 'mag_out'], [0.6, 'mag_in'], [0.8, 'rack']];

  BZ.makeWeapons = (G) => {
    const vmScene = new THREE.Scene();
    const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    vmScene.add(new THREE.HemisphereLight(0xc8d6f4, 0x6a5a48, 1.5));
    const sun = new THREE.DirectionalLight(0xffd8a8, 1.2); sun.position.set(-0.6, 0.8, 0.5); vmScene.add(sun);
    const rig = new THREE.Group(); vmScene.add(rig);
    const models = {};
    // viewmodel particles: sparks from the muzzle, casings from the ejection port
    const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 48);
    sparkMesh.frustumCulled = false; sparkMesh.count = 0; sparkMesh.setColorAt(0, new THREE.Color()); vmScene.add(sparkMesh);
    const sparks = [];
    const casingGeo = new THREE.BoxGeometry(0.014, 0.014, 0.034);
    const casingMats = { brass: new THREE.MeshLambertMaterial({ color: 0xe8b84a, emissive: 0x3a2808 }), red: new THREE.MeshLambertMaterial({ color: 0xd8322a, emissive: 0x300808 }) };
    const casings = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(casingGeo, casingMats.brass); m.visible = false; vmScene.add(m); casings.push({ m, life: 0, v: new THREE.Vector3(), spin: new THREE.Vector3() }); }
    let casingI = 0;
    const tmpV = new THREE.Vector3(); const tmpM = new THREE.Matrix4(); const tmpQ = new THREE.Quaternion(); const tmpC = new THREE.Color();
    function emitSparks(n) {
      const m = models[S.cur]; rig.updateMatrixWorld(true);
      const at = m.localToWorld(m.userData.muzzle.clone()); const fwd = new THREE.Vector3(0, 0, -1).transformDirection(m.matrixWorld);
      for (let i = 0; i < n; i++) {
        if (sparks.length >= 48) sparks.shift();
        const v = fwd.clone().multiplyScalar(G.rng.range(1.5, 4)).add(new THREE.Vector3(G.rng.range(-1, 1), G.rng.range(-0.6, 1.2), G.rng.range(-1, 1)).multiplyScalar(1.4));
        sparks.push({ p: at.clone(), v, life: 0, max: G.rng.range(0.06, 0.16), s: G.rng.range(0.006, 0.014), c: G.rng.pick([0xfff2a0, 0xffc040, 0xff8a20]) });
      }
    }
    function ejectCasing() {
      const m = models[S.cur]; rig.updateMatrixWorld(true);
      const c = casings[casingI++ % casings.length];
      c.m.material = casingMats[m.userData.shellColor || 'brass'];
      c.m.scale.setScalar(m.userData.shellColor ? 1.6 : 1);
      c.m.position.copy(m.localToWorld(m.userData.port.clone()));
      c.v.set(G.rng.range(1.2, 1.8), G.rng.range(1.0, 1.6), G.rng.range(0.1, 0.5)).transformDirection(m.matrixWorld).multiplyScalar(G.rng.range(1.4, 1.9));
      c.spin.set(G.rng.range(-20, 20), G.rng.range(-20, 20), G.rng.range(-20, 20)); c.life = 0.7; c.m.visible = true;
      setTimeout(() => G.audio.play('casing', { gain: 0.22 }), 380);
    }
    // the spent magazine: a copy of the mag part, released into the viewmodel scene to fall and tumble
    const drops = [];
    function dropMag() {
      const m = models[S.cur]; const part = m.userData.parts.mag; if (!part) return;
      rig.updateMatrixWorld(true);
      const c = part.clone(); part.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      vmScene.add(c);
      const v = m.userData.magDir.clone().transformDirection(m.matrixWorld).multiplyScalar(1.2).add(new THREE.Vector3(-0.3, 0, 0.2));
      drops.push({ m: c, v, spin: new THREE.Vector3(G.rng.range(-6, 6), G.rng.range(-3, 3), G.rng.range(-8, -3)), life: 0.7 });
      setTimeout(() => G.audio.play('casing', { gain: 0.35, rate: 0.6 }), 420);
    }
    function updateVmFx(dt) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.life -= dt; d.v.y -= 6 * dt; d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.m.rotation.z += d.spin.z * dt;
        if (d.life <= 0) { vmScene.remove(d.m); drops.splice(i, 1); }
      }
      let n = 0;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.life += dt; if (s.life > s.max) { sparks.splice(i, 1); continue; }
        s.p.addScaledVector(s.v, dt); s.v.y -= 3 * dt;
        const k = s.s * (1 - s.life / s.max);
        tmpM.compose(s.p, tmpQ, tmpV.set(k, k, k * 3)); sparkMesh.setMatrixAt(n, tmpM); sparkMesh.setColorAt(n, tmpC.setHex(s.c)); n++;
      }
      sparkMesh.count = n; sparkMesh.instanceMatrix.needsUpdate = true; if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
      for (const c of casings) {
        if (c.life <= 0) continue;
        c.life -= dt; c.v.y -= 9 * dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
        if (c.life <= 0) c.m.visible = false;
      }
    }
    for (const id of ORDER) { models[id] = buildGun(id); models[id].visible = false; rig.add(models[id]); }

    const state = {};
    const S = {
      inv: START.slice(), cur: 'smg', next: null, combo: 0, comboT: 0, swing: null, vmPose: null, phase: 'ready', t: 0, cool: 0, bloom: 0, ads: 0, trigger: false, held: false,
      shots: 0, hits: 0, evt: {}, cycle: 9, pumpT: 0, rackPlayed: true,
      kZ: BZ.spring(420, 26), kP: BZ.spring(300, 22), kY: BZ.spring(260, 20), kR: BZ.spring(260, 18), swX: BZ.spring(120, 14), swY: BZ.spring(120, 14), drop: BZ.spring(160, 20),
    };
    for (const id of ORDER) state[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    models.smg.visible = true;
    const HIP = new THREE.Vector3(0.25, -0.25, -0.56); const ADS = new THREE.Vector3(0, -0.125, -0.32);

    const W = () => WEAPONS[S.cur];
    // the build stretches every magazine and reserve
    const magOf = (w) => (w.melee ? Infinity : Math.max(1, Math.round(w.mag * G.build.magMul())));
    const resOf = (w) => (w.reserve === Infinity ? Infinity : Math.round(w.reserve * G.build.magMul()));
    const ammo = () => state[S.cur];

    // ---------- inventory: two hands' worth of weapons; the rest lies on the ground ----------
    const has = (id) => S.inv.includes(id);
    function select(id) {
      if (!has(id) || (id === S.cur && S.phase !== 'holster')) return;
      S.next = id; S.phase = 'holster'; S.t = 0; S.swing = null;
    }
    const selectSlot = (i) => { if (S.inv[i]) select(S.inv[i]); };
    function cycle(dir) {
      if (S.inv.length < 2) return;
      const i = S.inv.indexOf(S.next || S.cur);
      select(S.inv[(i + dir + S.inv.length) % S.inv.length]);
    }
    // the weapon in hand left the hand (thrown or swapped): show the next one without a holster dip
    function forceTo(id) {
      models[S.cur].visible = false; models[S.cur].userData.flash.visible = false;
      S.cur = id; S.next = null; models[id].visible = true; S.phase = 'draw'; S.t = 0; S.swing = null; S.drop.x = 1;
      G.audio.play('switch', { gain: 0.7 }); if (id === 'saber') G.audio.play('saber_on', { gain: 0.8 });
    }
    function throwOut(id, at) {
      const cam = G.camera; cam.updateMatrixWorld(); cam.getWorldPosition(o); cam.getWorldDirection(d);
      const from = at ? at.clone().setY(at.y + 0.4) : o.clone().addScaledVector(d, 0.6).setY(o.y - 0.3);
      const vel = at ? new THREE.Vector3(G.rng.range(-1, 1), 2.5, G.rng.range(-1, 1)) : new THREE.Vector3(d.x, 0, d.z).normalize().multiplyScalar(3.2).setY(2.6);
      if ((G.coop && G.coop.guest)) G.coop.act({ k: 'drop', id, mag: state[id].mag, res: state[id].reserve, p: G.coop.v3(from), v: G.coop.v3(vel) });
      else spawnGround(id, state[id].mag, state[id].reserve, from, vel);
    }
    function give(id) { // bought in the shop
      state[id].mag = magOf(WEAPONS[id]); state[id].reserve = resOf(WEAPONS[id]);
      if (has(id)) { select(id); return; }
      if (S.inv.length < SLOTS) { S.inv.push(id); select(id); return; }
      const i = S.inv.indexOf(S.cur); throwOut(S.cur); S.inv[i] = id; forceTo(id);
    }
    function refill(k = 1) { for (const id of S.inv) { const r = resOf(WEAPONS[id]); if (r !== Infinity) state[id].reserve = Math.max(state[id].reserve, Math.round(r * k)); } }
    function dropCur() {
      if (S.inv.length <= 1 || S.phase === 'holster' || !G.player.alive) { G.audio.play('deny', { gain: 0.6 }); G.ui.banner('KHÔNG BỎ ĐƯỢC', 'phải giữ ít nhất 1 vũ khí', 1.2); return false; }
      const id = S.cur; throwOut(id); S.inv.splice(S.inv.indexOf(id), 1); forceTo(S.inv[0]);
      G.audio.play('swipe', { gain: 0.4, rate: 1.4 });
      return true;
    }
    function pickup() {
      const it = nearGround(); if (!it || !G.player.alive) return false;
      if ((G.coop && G.coop.guest)) { G.coop.act({ k: 'pick', gid: it.gid }); it.claim = { fetch: null, pending: true }; setTimeout(() => { if (it.claim && it.claim.pending) it.claim = null; }, 1500); return true; }
      removeGround(it); takeItem(it); return true;
    }
    // the weapon in hand: into a free slot, or swapped with the one held (which drops where the new one lay)
    function takeItem(it) {
      if (has(it.id)) { const st = state[it.id]; const Wt = WEAPONS[it.id]; if (st.reserve !== Infinity) st.reserve = Math.min(Wt.reserve, st.reserve + it.mag + it.reserve); }
      else {
        if (S.inv.length < SLOTS) S.inv.push(it.id);
        else { const i = S.inv.indexOf(S.cur); throwOut(S.cur, it.pos); S.inv[i] = it.id; }
        state[it.id].mag = it.mag; state[it.id].reserve = it.reserve; forceTo(it.id);
      }
      G.audio.play('clank', { gain: 0.8 }); G.audio.play('pickup', { gain: 0.45 });
      G.events.emit('weapon:pickup', it.id);
    }

    // ---------- weapons on the ground: thrown with an arc, settle on their side, stay until a new game ----------
    const ground = []; const GROUND_MAX = 60;
    const ringGeo = new THREE.RingGeometry(0.42, 0.58, 24).rotateX(-Math.PI / 2);
    const ringCol = (id) => (WEAPONS[id].melee ? 0xffa040 : WEAPONS[id].rocket ? 0xff4a3a : 0x8ff07a);
    const gOut = {}; const gFeet = new THREE.Vector3(); const bb = new THREE.Box3(); const bc = new THREE.Vector3(); const bs = new THREE.Vector3();
    let gidN = 0;
    function spawnGround(id, mag, reserve, pos, vel, gid) {
      if (ground.length >= GROUND_MAX) removeGround(ground.find((g) => !g.claim) || ground[0]);
      const model = BZ.worldGun(id); model.scale.setScalar(1.25);
      bb.setFromObject(model); bb.getCenter(bc); bb.getSize(bs);
      model.position.copy(bc).negate();
      const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.add(model); g.position.copy(pos); G.scene.add(g);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ringCol(id), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      G.scene.add(ring);
      const it = { id, mag, reserve, g, ring, pos: g.position, vel: vel.clone(), rest: false, t: 0, yaw: G.rng.range(0, 6.3), claim: null, thick: bs.x / 2, spin: new THREE.Vector3(G.rng.range(-8, 8), G.rng.range(-4, 4), G.rng.range(-8, 8)) };
      it.gid = gid || ++gidN; if (gid) gidN = Math.max(gidN, gid);
      ground.push(it); G.events.emit('ground:add', it);
      return it;
    }
    function removeGround(it) {
      const i = ground.indexOf(it); if (i < 0) return;
      ground.splice(i, 1); G.events.emit('ground:remove', it); G.scene.remove(it.g); G.scene.remove(it.ring); it.ring.material.dispose();
      if (it.claim) it.claim.fetch = null;
    }
    // supply crate under a parachute: a red flare marks where it will land; it breaks open into two guns, ammo and a medkit
    const crates = [];
    function airdrop(near, visual) {
      let at = near.clone().add(new THREE.Vector3(G.rng.range(-5, 5), 0, G.rng.range(-5, 5))); at.y = Math.max(0, near.y);
      if (G.world.overlaps([at.x - 0.6, at.y + 0.05, at.z - 0.6], [at.x + 0.6, at.y + 1.2, at.z + 0.6])) at = near.clone();
      if (!visual) G.events.emit('crate', { p: at });
      const B = new BZ.Builder('crate'); B.box([-0.5, 0, -0.5], [0.5, 0.9, 0.5], 'crate_metal', { uv: 'fit' }); B.box([-0.52, 0.38, -0.52], [0.52, 0.52, 0.52], 'hazard', { uv: 'fit' });
      const C = new BZ.Builder('chute');
      for (let i = 0; i < 6; i++) C.box([-1.5 + i * 0.5, 3.0 - Math.abs(i - 2.5) * 0.12, -1.4], [-1.0 + i * 0.5, 3.12 - Math.abs(i - 2.5) * 0.12, 1.4], i % 2 ? 'g_red' : 'plaster_white', { uv: 'fit', vary: 0 });
      for (const [x, z] of [[-1.3, -1.2], [1.3, -1.2], [-1.3, 1.2], [1.3, 1.2]]) { C.push(new THREE.Matrix4().makeTranslation(x * 0.5, 1.9, z * 0.5).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(z * 0.5, 0, -x * 0.5)))); C.box([-0.02, -1.1, -0.02], [0.02, 1.1, 0.02], 'metal_dark', { vary: 0 }); C.pop(); }
      const g = new THREE.Group(); const box = B.build({ cast: true }); const chute = C.build({ cast: false }); g.add(box); g.add(chute);
      g.position.set(at.x, at.y + 28, at.z); G.scene.add(g);
      crates.push({ g, chute, at, t: 0, landed: false, visual, flare: 0 });
      if (!visual) G.ui.banner('THÙNG TIẾP TẾ', 'đang thả dù xuống gần bạn', 2.2);
    }
    function updateCrates(dt) {
      for (let i = crates.length - 1; i >= 0; i--) {
        const c = crates[i]; c.t += dt;
        c.flare -= dt; if (c.flare <= 0) { c.flare = 0.12; G.fx.puff(c.at.clone().setY(c.at.y + 0.3), { vel: new THREE.Vector3(0, 2, 0), drag: 0.6, s0: 0.4, s1: 1.6, life: 2, c0: 0xff4a3a, c1: 0x8a3a3a, a0: 0.6 }); }
        if (!c.landed) {
          c.g.position.y = Math.max(c.at.y, c.g.position.y - 4.2 * dt); c.g.rotation.y += dt * 0.6; c.g.rotation.z = Math.sin(c.t * 1.7) * 0.08;
          if (c.g.position.y <= c.at.y) {
            c.landed = true; c.t = 0; c.g.rotation.set(0, c.g.rotation.y, 0);
            G.fx.burst(c.at.clone().setY(c.at.y + 0.2), 20, [0x8a8070, 0x6a6458], { speed: 4, size: 0.12, life: 0.8 });
            G.audio.playAt('land', c.at, { gain: 1, rate: 0.7 }); G.audio.playAt('clank', c.at, { gain: 0.9 });
          }
        } else {
          c.chute.position.y += dt * 3; c.chute.position.x += dt * 2; c.chute.rotation.z += dt * 0.8;
          if (c.t > 0.6 && !c.opened) {
            c.opened = true; c.g.remove(c.chute);
            G.fx.burst(c.at.clone().setY(c.at.y + 0.5), 24, [0x6a7a8a, 0xffd040, 0x3a3a3a], { speed: 5, size: 0.14, life: 1 });
            G.fx.puff(c.at.clone().setY(c.at.y + 0.6), { glow: true, s0: 1.5, s1: 3, life: 0.3, c0: 0xfff0c0, c1: 0xffa040 });
            G.audio.playAt('impact', c.at, { gain: 1, rate: 0.6 });
            if (!c.visual) { G.dropGun(c.at, 2); G.fx.drop('ammo', c.at.clone().add(new THREE.Vector3(0.8, 0, 0))); G.fx.drop('health', c.at.clone().add(new THREE.Vector3(-0.8, 0, 0.3))); }
          }
          if (c.t > 1.2) { G.scene.remove(c.g); crates.splice(i, 1); }
        }
      }
    }
    function takeGround(it) { removeGround(it); return { id: it.id, mag: it.mag, reserve: it.reserve }; }
    function nearGround() {
      const P = G.player; let best = null; let bd = 2.1;
      for (const it of ground) {
        if (it.claim) continue;
        const dd = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z);
        if (dd < bd && Math.abs(it.pos.y - P.pos.y - 0.2) < 1.6) { bd = dd; best = it; }
      }
      return best;
    }
    function updateGround(dt) {
      for (const it of ground) {
        it.t += dt;
        if (!it.rest) {
          it.vel.y -= 20 * dt;
          gFeet.copy(it.pos); gFeet.y -= 0.12;
          G.world.moveBox(gFeet, it.vel, dt, 0.22, 0.24, gOut);
          it.pos.set(gFeet.x, gFeet.y + 0.12, gFeet.z);
          it.g.rotation.x += it.spin.x * dt; it.g.rotation.y += it.spin.y * dt; it.g.rotation.z += it.spin.z * dt;
          if (gOut.ground) {
            const imp = -it.vel.y; it.vel.y = imp > 3 ? imp * 0.3 : 0; it.vel.x *= 0.5; it.vel.z *= 0.5; it.spin.multiplyScalar(0.4);
            if (imp > 2) G.audio.playAt('clank', it.pos, { gain: 0.5 });
            if (imp <= 3) { it.rest = true; it.restY = gFeet.y + it.thick + 0.01; it.settle = 0; it.q0 = it.g.quaternion.clone(); it.q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.yaw, Math.PI / 2, 'YXZ')); }
          }
        } else if (it.settle < 1) {
          it.settle = Math.min(1, it.settle + dt * 6); const k = ease(it.settle);
          it.g.quaternion.copy(it.q0).slerp(it.q1, k); it.pos.y = BZ.lerp(it.pos.y, it.restY, k);
        }
        it.ring.position.set(it.pos.x, (it.rest ? it.restY - it.thick : it.pos.y - 0.12) + 0.03, it.pos.z);
        const near = nearGround() === it;
        it.ring.material.opacity = (it.rest ? 0.45 + Math.sin(it.t * 3) * 0.15 : 0.15) + (near ? 0.35 : 0);
        it.ring.scale.setScalar(near ? 1.15 + Math.sin(it.t * 8) * 0.05 : 1);
      }
    }

    // ---------- melee: keyframed swings (pos x,y,z, yaw, pitch, roll, twist about the blade) ----------
    const KF = {
      idle: [0.3, -0.38, -0.5, 0.12, -0.5, -0.3, 0.25], idleAxe: [0.33, -0.44, -0.48, 0.22, -0.32, -0.25, 0.35],
      r2l: [[0.52, -0.14, -0.46, -0.9, -1.3, -0.35, 1.57], [-0.4, -0.34, -0.52, 0.95, -1.45, 0.35, 1.57]],
      l2r: [[-0.36, -0.1, -0.48, 0.9, -1.3, 0.35, -1.57], [0.5, -0.36, -0.5, -0.95, -1.45, -0.35, -1.57]],
      over: [[0.26, -0.06, -0.5, 0.1, 0.22, -0.25, 0], [0.04, -0.52, -0.62, 0, -2.0, 0, 0]],
      spin: [[0.5, -0.2, -0.44, -1.35, -1.4, -0.3, 1.57], [-0.4, -0.32, -0.5, 1.5, -1.45, 0.3, 1.57]],
    };
    const lerpK = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const easeOut = (x) => 1 - (1 - x) * (1 - x);
    const qa = new THREE.Quaternion(); const qb = new THREE.Quaternion(); const ax = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
    function meleePose(w) {
      const idle = S.cur === 'axe' ? KF.idleAxe : KF.idle; const sw = S.swing;
      let p = idle;
      if (sw) {
        const a = w.hitAt * 0.55; const b = Math.min(w.swing * 0.72, w.hitAt * 1.5); const [wu, en] = KF[sw.pat]; const t = sw.t;
        p = t < a ? lerpK(sw.from, wu, easeOut(t / a)) : t < b ? lerpK(wu, en, ease((t - a) / (b - a))) : lerpK(en, idle, ease(seg(t, b, w.swing)));
      }
      S.vmPose = p;
      return p;
    }
    function applyPose(p, off) {
      rig.position.set(p[0] + off.x, p[1] + off.y, p[2] + off.z);
      rig.quaternion.setFromAxisAngle(ax.y, p[3]).multiply(qa.setFromAxisAngle(ax.x, p[4])).multiply(qa.setFromAxisAngle(ax.z, p[5])).multiply(qb.setFromAxisAngle(ax.y, p[6]));
    }
    // blade trail: a ribbon between the tip and mid-blade over the last ~0.12 s, additive, fading to nothing
    const TRAIL_N = 16;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx);
    const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    trail.frustumCulled = false; vmScene.add(trail);
    const trailPts = [];
    function updateTrail(dt, w) {
      for (const p of trailPts) p.age += dt;
      while (trailPts.length && trailPts[0].age > 0.13) trailPts.shift();
      const sw = S.swing;
      if (w.melee && sw && sw.t > w.hitAt * 0.4 && sw.t < Math.min(w.swing * 0.8, w.hitAt * 1.7)) {
        const m = models[S.cur]; rig.updateMatrixWorld(true);
        trailPts.push({ a: m.localToWorld(m.userData.tip.clone()), b: m.localToWorld(m.userData.mid.clone()), age: 0 });
        if (trailPts.length > TRAIL_N) trailPts.shift();
      }
      const pos = trailGeo.attributes.position.array; const col = trailGeo.attributes.color.array; const c = tmpC.setHex(w.trail || 0xffffff);
      const n = trailPts.length;
      for (let i = 0; i < TRAIL_N; i++) {
        const p = trailPts[Math.max(0, Math.min(n - 1, i - (TRAIL_N - n)))];
        const k = p ? Math.pow(Math.max(0, 1 - p.age / 0.13), 1.5) * (i >= TRAIL_N - n ? 1 : 0) : 0;
        for (let j = 0; j < 2; j++) {
          const v = p ? (j ? p.b : p.a) : tmpV.set(0, 0, 0); const o3 = (i * 2 + j) * 3;
          pos[o3] = v.x; pos[o3 + 1] = v.y; pos[o3 + 2] = v.z;
          const kk = k * (j ? 0.0 : 0.7) * (S.cur === 'saber' ? 1.2 : 0.6);
          col[o3] = c.r * kk; col[o3 + 1] = c.g * kk; col[o3 + 2] = c.b * kk;
        }
      }
      trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
      trail.visible = n > 1;
    }
    function startSwing(w) {
      const pat = w.combo[S.combo % w.combo.length]; S.combo++; S.comboT = 0.7;
      S.swing = { t: 0, pat, hit: false, from: (S.vmPose || KF.idle).slice() };
      S.cool = w.swing * 0.72;
      setTimeout(() => G.audio.play(w.snd, { gain: 0.85, rate: G.rng.range(0.92, 1.08) * (pat === 'over' ? 0.9 : 1) }), w.hitAt * 400);
      const P = G.player;
      // lunge a step toward a zombie that is just out of reach
      const cam = G.camera; cam.getWorldDirection(d);
      const near = G.zombies.list.some((z) => z.alive && Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z) < w.range * 2);
      if (near && P.onGround) { const fl = Math.hypot(d.x, d.z) || 1; P.vel.x += (d.x / fl) * w.lunge; P.vel.z += (d.z / fl) * w.lunge; }
      S.shots++;
    }
    const sweep = new THREE.Vector3(); const toZ = new THREE.Vector3(); const chest = new THREE.Vector3();
    function meleeHit(w, sw) {
      const P = G.player; const cam = G.camera;
      cam.updateMatrixWorld(); cam.getWorldPosition(o); cam.getWorldDirection(d); right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const fl = Math.hypot(d.x, d.z) || 1e-3; const fx = d.x / fl; const fz = d.z / fl;
      const dirX = sw.pat === 'l2r' ? 1 : sw.pat === 'over' ? 0 : -1;
      sweep.set(right.x * dirX, sw.pat === 'over' ? -0.6 : 0.15, right.z * dirX).add(new THREE.Vector3(fx, 0, fz).multiplyScalar(0.5)).normalize();
      const cands = [];
      for (const z of G.zombies.list) {
        if (!z.alive) continue;
        const s = z.T.scale; const dx = z.pos.x - o.x; const dz = z.pos.z - o.z; const hd = Math.hypot(dx, dz);
        if (hd - 0.45 * s > w.range * G.build.meleeRange()) continue;
        const top = z.pos.y + (z.crawl ? 0.7 : z.T.fly ? 1.6 : 2.0) * s;
        if (top < o.y - 2.1 || z.pos.y > o.y + 1.1) continue;
        if (hd > 0.9 * s && (dx * fx + dz * fz) / hd < Math.cos(w.arc)) continue;
        chest.set(z.pos.x, z.pos.y + (z.crawl ? 0.35 : 1.1) * s, z.pos.z);
        if (!G.world.lineOfSight(o, chest)) continue;
        cands.push({ z, hd, dx, dz });
      }
      cands.sort((a, b) => a.hd - b.hd);
      const hit = cands.slice(0, w.cleave);
      let kills = 0; let heads = false;
      hit.forEach((c, i) => {
        const z = c.z; const s = z.T.scale;
        // the edge passes a little below the eye line on flat swings: aiming straight ahead cuts the chest, aim up for the neck
        const rel = (o.y + (d.y / fl) * c.hd - (sw.pat === 'over' ? 0.2 : 0.5) - z.pos.y) / s;
        let part = z.crawl ? (sw.pat === 'over' && G.rng.chance(0.5) ? 'head' : 'body') : rel > 1.42 || (sw.pat === 'over' && rel > 1.12) ? 'head' : rel < 0.72 ? 'leg' : 'body';
        if (z.headless && part === 'head') part = 'body';
        const crit = G.rng.chance(w.crit + G.build.critAdd() + G.hero.critAdd());
        const dmg = w.dmg * G.build.dmgMul() * G.hero.dmgMul() * G.build.meleeMul() * (part === 'head' ? w.head : part === 'leg' ? 0.85 : 1) * (i ? 0.75 : 1) * (crit ? G.build.critMul() : 1);
        toZ.set(c.dx, 0, c.dz).normalize().multiplyScalar(0.6).addScaledVector(sweep, 0.8).setY(0).normalize();
        const died = G.zombies.damage(z, dmg, part, toZ, w.impulse * (i ? 0.8 : 1), { cut: w.cut, status: G.build.onHit(z, dmg, true) });
        if (died) kills++; heads = heads || part === 'head';
        G.events.emit('hit', { z, dmg: Math.round(dmg), part, died, crit, melee: true });
        const at = new THREE.Vector3(z.pos.x, z.pos.y + (part === 'head' ? 1.7 : part === 'leg' ? 0.5 : 1.1) * s * (z.crawl ? 0.3 : 1), z.pos.z);
        if (w.cut === 'saber') G.fx.burst(at, 14, [0xffe0a0, 0xffa040, 0x80f0ff, 0x3a3a3c], { dir: sweep, push: 3, speed: 3, size: 0.07, life: 0.5 });
        else G.fx.burst(at, 22, [0xc0281e, 0x8a1410, 0xb3201a], { dir: sweep, push: 5.5, speed: 3.5, size: 0.09, life: 0.9 });
        if (i === 0) G.audio.playAt(w.hitSnd, at, { gain: 1, rate: G.rng.range(0.9, 1.1) });
      });
      if (hit.length) {
        S.hits++;
        G.hitStop = Math.max(G.hitStop || 0, w.stop * (1 + 0.35 * (hit.length - 1)) * (kills ? 1.3 : 1));
        P.shake.v += 2 + (w.cut === 'axe' ? 3 : 1) * hit.length;
        P.kick(w.kick.cam * (1 + hit.length * 0.4), dirX * 0.012);
        S.kZ.v -= 2.5; S.kR.v += dirX * 4;
        G.audio.play('marker', { gain: heads ? 1 : 0.6 });
      } else {
        const wh = G.world.raycast(o, d, w.range * 0.8);
        if (wh) {
          const at = o.clone().addScaledVector(d, wh.t);
          G.fx.burst(at, 10, [0xfff2a0, 0xffc040, 0xd0d4d8], { dir: new THREE.Vector3(...wh.normal), push: 3, speed: 3, size: 0.05, life: 0.4 });
          G.audio.playAt('clank', at, { gain: 0.8 }); G.hitStop = Math.max(G.hitStop || 0, 0.03); P.shake.v += 1.5; S.kZ.v -= 3;
        }
      }
      G.events.emit('fired', { weapon: S.cur, kills });
    }
    function meleeUpdate(dt, w, input) {
      if (G.hero && G.hero.storm()) dt *= 1.5;
      dt *= G.build.rateMul();
      const sw = S.swing;
      if (sw) {
        sw.t += dt;
        if (!sw.hit && sw.t >= w.hitAt) { sw.hit = true; meleeHit(w, sw); }
        if (sw.t >= w.swing) S.swing = null;
      } else { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
      const can = S.phase === 'ready' && G.player.alive;
      if (input.fire && can && (!S.swing || S.swing.t >= w.swing * 0.72)) startSwing(w);
    }
    const saberLight = new THREE.PointLight(0x50d8ff, 0, 7, 2); G.scene.add(saberLight);
    function startReload() {
      const w = W(); const a = ammo();
      if (S.phase !== 'ready' || a.mag >= magOf(w) || a.reserve <= 0) return;
      S.phase = 'reload'; S.t = 0; S.shellT = 0; S.evt = {};
    }

    const o = new THREE.Vector3(); const d = new THREE.Vector3(); const right = new THREE.Vector3(); const up = new THREE.Vector3();
    function fire() {
      const w = W(); const a = ammo(); const P = G.player;
      if (a.mag <= 0) { G.audio.play('empty'); S.cool = 0.25; if (a.reserve > 0) startReload(); return; }
      const storm = G.hero && G.hero.storm();
      if (!storm) a.mag--; S.cool = 60 / w.rpm / (storm ? 2.2 : 1) / G.build.rateMul(); S.shots++; S.cycle = 0; S.rackPlayed = false; S.shellOut = false;
      const cam = G.camera;
      cam.updateMatrixWorld();
      cam.getWorldPosition(o);
      cam.getWorldDirection(d);
      right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const moving = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) + (P.onGround ? 0 : 1);
      const spread = (w.spread + w.moveSpread * moving) * (1 - S.ads * 0.6) + S.bloom + (G.env ? G.env.spread : 0);
      let anyHit = false; let head = false;
      if (w.rocket) {
        const from = new THREE.Vector3().copy(o).addScaledVector(d, 1.0).addScaledVector(right, 0.15).addScaledVector(up, -0.05);
        const aim = d.clone().addScaledVector(right, (G.rng.next() - 0.5) * spread).addScaledVector(up, (G.rng.next() - 0.5) * spread).normalize();
        G.gear.fireRocket(from, aim);
      }
      const muzzleW = new THREE.Vector3().copy(o).addScaledVector(d, 0.6).addScaledVector(right, 0.18).addScaledVector(up, -0.12);
      const pend = new Map();
      const pellets = w.rocket ? 0 : w.pellets + (storm ? 2 : 0);
      for (let i = 0; i < pellets; i++) {
        const r = Math.sqrt(G.rng.next()) * (i >= w.pellets ? spread + 0.06 : spread); const th = G.rng.next() * Math.PI * 2;
        const dir = d.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
        const wh = G.world.raycast(o, dir, w.range);
        // a rifle round keeps going through the first body (pierce), losing 40% each time
        const skip = new Set(); let zh = null; let power = 1;
        for (let p = 0; p < (w.pierce || 1); p++) {
          const h = G.zombies.hitTest(o, dir, wh ? wh.t : w.range, skip);
          if (!h) break;
          if (!zh) zh = h;
          skip.add(h.z);
          const mult = h.part === 'head' ? w.head : h.part === 'leg' ? 0.7 : 1;
          const fall = w.pellets > 1 ? BZ.clamp(1.25 - h.t / w.range, 0.35, 1) : 1;
          const e = pend.get(h.z) || { dmg: 0, part: 'leg', dir, imp: 0, crit: false };
          const crit = G.rng.chance((w.crit || 0.08) + G.build.critAdd() + G.hero.critAdd()); if (crit) e.crit = true;
          e.dmg += w.dmg * G.build.dmgMul() * G.hero.dmgMul() * mult * fall * power * (crit ? G.build.critMul() : 1); e.imp += (w.impulse || 1) * fall * power;
          if (h.part === 'head' || (h.part === 'body' && e.part === 'leg')) e.part = h.part;
          pend.set(h.z, e);
          anyHit = true; head = head || h.part === 'head';
          power *= 0.6;
        }
        const end = o.clone().addScaledVector(dir, zh ? zh.t : wh ? wh.t : w.range);
        if (zh) {
          // hits accounted above
        } else if (wh) {
          G.fx.hole(end, wh.normal);
          const n = new THREE.Vector3(...wh.normal);
          const dust = { grass: [0x5fae3c, 0x8a5a35], wood: [0xc8954f, 0x8f6232], metal: [0xd0d4d8, 0xffd080], leaves: [0x3d8a2c, 0x4ea03a] }[wh.tag] || [0x9a9c9e, 0x6e6e70];
          G.fx.burst(end, 3, dust, { dir: n, push: 2, size: 0.07, life: 0.6 }); G.fx.impact(end, wh.normal, wh.tag);
          if (i === 0) G.audio.playAt('impact', end, { gain: 0.5 });
        }
        if ((w.tracer && S.shots % w.tracer === 0 && i === 0) || (storm && i >= w.pellets)) G.fx.tracer(muzzleW, end);
      }
      let kills = 0;
      for (const [z, e] of pend) {
        const died = G.zombies.damage(z, e.dmg, e.part, e.dir, e.imp, { status: G.build.onHit(z, e.dmg, false) });
        if (died) kills++;
        G.events.emit('hit', { z, dmg: Math.round(e.dmg), part: e.part, died, crit: e.crit });
      }
      if (anyHit) { S.hits++; G.audio.play(head ? 'head' : 'hit', { gain: 0.7 }); G.audio.play('marker', { gain: head ? 1 : 0.6 }); }
      G.audio.play(w.snd, { gain: 1 }); G.audio.duck();
      G.fx.muzzle(muzzleW);
      const m = models[S.cur]; m.userData.flash.visible = true; m.userData.flash.rotation.z = G.rng.next() * 3; S.flashT = 0.045;
      emitSparks(S.cur === 'shotgun' ? 14 : 6);
      if (S.cur !== 'shotgun' && !w.rocket) ejectCasing();
      if (w.rocket) { G.fx.burst(new THREE.Vector3().copy(o).addScaledVector(d, -0.6), 10, [0xd0d0d0, 0xa0a0a0, 0xffb040], { speed: 2, size: 0.25, life: 0.9, grav: -0.5, drag: 0.8, bounce: 0 }); }
      // feel: spring kicks + camera pitch kick
      const k = w.kick; const adsK = 1 - S.ads * 0.5;
      S.kZ.v += k.back * 30 * adsK; S.kP.v += k.rise * adsK; S.kY.v += (G.rng.next() - 0.5) * k.yaw * 2; S.kR.v += (G.rng.next() - 0.5) * k.yaw * 3;
      P.kick(k.cam * adsK, (G.rng.next() - 0.5) * k.cam * 0.4);
      S.bloom = Math.min(0.06, S.bloom + w.spread * 0.6);
      G.events.emit('fired', { weapon: S.cur, kills });
      if (a.mag === 0 && a.reserve > 0) S.autoReload = 0.25;
    }

    function update(dt, input) {
      const w = W(); const a = ammo(); const P = G.player;
      S.cool -= dt; S.bloom = Math.max(0, S.bloom - dt * 0.12);
      if (S.flashT > 0) { S.flashT -= dt; if (S.flashT <= 0) models[S.cur].userData.flash.visible = false; }
      const wantAds = input.ads && S.phase === 'ready' && !P.sprinting && !w.melee;
      S.ads = BZ.damp(S.ads, wantAds ? 1 : 0, 14, dt);

      if (S.phase === 'holster') {
        S.t += dt; S.drop.x = Math.min(1, S.t / 0.18);
        if (S.t >= 0.18) {
          models[S.cur].visible = false; models[S.cur].userData.flash.visible = false;
          S.cur = S.next; S.next = null; models[S.cur].visible = true; S.phase = 'draw'; S.t = 0; G.audio.play('switch', { gain: 0.7 }); if (S.cur === 'saber') G.audio.play('saber_on', { gain: 0.8 });
        }
      } else if (S.phase === 'draw') {
        S.t += dt; S.drop.x = 1 - Math.min(1, S.t / 0.22);
        if (S.t >= 0.22) { S.phase = 'ready'; S.drop.x = 0; }
      } else if (S.phase === 'reload') {
        const rdt = dt * (G.hero ? G.hero.reloadMul() : 1) * G.build.reloadMul(); S.t += rdt;
        if (w.perShell) {
          S.shellT += rdt;
          if (S.shellT >= w.perShell) {
            S.shellT = 0; const n = Math.min(1, a.reserve); a.mag += n; a.reserve -= n; G.audio.play('shell_in', { gain: 0.8 }); S.kZ.v -= 1.2; S.kR.v += 1.5;
            if (a.mag >= magOf(w) || a.reserve <= 0) { S.phase = 'ready'; S.pumpT = 0.38; G.audio.play('rack', { gain: 0.8 }); }
          }
          if (input.fire && a.mag > 0 && S.t > 0.2) { S.phase = 'ready'; }
        } else {
          const t = S.t / w.reload;
          for (const [at, snd] of RELOAD_SOUNDS) if (t >= at && !S.evt[snd]) { S.evt[snd] = true; G.audio.play(snd, { gain: 0.8 }); if (snd === 'mag_in') { S.kZ.v -= 1.5; S.kP.v -= 2; } if (snd === 'rack') S.kZ.v += 1.2; }
          if (S.t >= w.reload) {
            const need = magOf(w) - a.mag; const n = Math.min(need, a.reserve);
            a.mag += n; a.reserve -= n; S.phase = 'ready';
          }
        }
      }
      if (S.autoReload > 0) { S.autoReload -= dt; if (S.autoReload <= 0) startReload(); }

      if (w.melee) meleeUpdate(dt, WEAPONS[S.cur], input);
      else {
        const canFire = S.phase === 'ready' && S.cool <= 0 && P.alive && !P.sprinting;
        if (input.fire && canFire && (w.auto || !S.held)) fire();
      }
      S.held = input.fire;
      updateGround(dt); updateCrates(dt);

      // viewmodel pose: springs + sway + bob + reload dip + ADS
      const kz = S.kZ.step(dt); const kp = S.kP.step(dt); const ky = S.kY.step(dt); const kr = S.kR.step(dt);
      const sx = S.swX.step(dt, BZ.clamp(-input.lookX * 0.0009, -0.05, 0.05)); const sy = S.swY.step(dt, BZ.clamp(input.lookY * 0.0009, -0.05, 0.05));
      const bobA = (1 - S.ads * 0.85) * Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) * (P.onGround ? 1 : 0.2);
      const run = 1 + (S.sprintK || 0) * 1.6;
      const bx = Math.sin(P.stride * Math.PI) * 0.012 * bobA * run; const by = -Math.abs(Math.cos(P.stride * Math.PI)) * 0.014 * bobA * run;
      const tilt = pose(dt);
      updateVmFx(dt);
      const shellGun = !!w.perShell;
      const rp = tilt * (shellGun ? 0.12 : 0.16); const rr = tilt * (shellGun ? 0.5 : 0.32); const ry = 0;
      const sprintTilt = P.sprinting ? 1 : 0;
      S.sprintK = BZ.damp(S.sprintK || 0, sprintTilt, 10, dt);
      const pos = HIP.clone().lerp(ADS, S.ads);
      const lx = shellGun ? 0.05 : 0.17; const ly = shellGun ? 0.07 : 0.2; const lz = shellGun ? 0.02 : 0.08;
      rig.position.set(pos.x + sx + bx - tilt * lx, pos.y + sy + by - S.drop.x * 0.35 - P.landDip * 0.4 + tilt * ly - S.sprintK * 0.05, pos.z + kz * 0.06 + tilt * lz);
      rig.rotation.order = 'XYZ';
      rig.rotation.set(kp * 0.02 + rp - S.drop.x * 0.6 - S.sprintK * (0.2 + Math.abs(Math.cos(P.stride * Math.PI)) * 0.08) + 0.05 * (1 - S.ads), ky * 0.02 + ry * 0.6 + S.sprintK * 0.5 + 0.3 * (1 - S.ads), kr * 0.02 + sx * 2 + S.sprintK * 0.25 + 0.06 * (1 - S.ads) + rr + (S.sprintK || 0) * Math.sin(P.stride * Math.PI) * 0.09);
      const wm = WEAPONS[S.cur];
      if (wm.melee) {
        const p = meleePose(wm);
        tmpV.set(sx + bx * 1.4 + kr * 0.004, sy + by * 1.4 - S.drop.x * 0.5 - P.landDip * 0.4 - S.sprintK * 0.06 + Math.sin(performance.now() / 700) * 0.006, kz * 0.05);
        applyPose(p, tmpV);
        if (S.drop.x > 0) rig.rotateX(-S.drop.x * 0.8);
      }
      updateTrail(dt, wm);
      const saberOn = S.cur === 'saber' && S.phase !== 'holster' && P.alive;
      saberLight.intensity = saberOn ? 2.4 + Math.sin(performance.now() / 45) * 0.25 + (S.swing ? 1.2 : 0) : 0;
      if (saberOn) { const c = G.camera; c.getWorldPosition(o); c.getWorldDirection(d); right.set(1, 0, 0).applyQuaternion(c.quaternion); saberLight.position.copy(o).addScaledVector(d, 0.7).addScaledVector(right, 0.3); }
      if (models.saber.userData.parts.halo) models.saber.userData.parts.halo.material.opacity = 0.5 + Math.sin(performance.now() / 37) * 0.06;
      vmCam.fov = BZ.lerp(62, 50, S.ads); vmCam.updateProjectionMatrix();
    }

    // Moving parts. Reload timeline for magazine guns (t = 0..1 of the reload time):
    // tilt in -> old mag drops (0.14-0.34) -> new mag rises in (0.42-0.62) -> slide/bolt pulled (0.66-0.76), released (0.8) -> tilt out.
    function pose(dt) {
      const w = W(); const a = ammo(); const P = models[S.cur].userData.parts; const dir = models[S.cur].userData.magDir;
      S.cycle += dt; if (S.pumpT > 0) S.pumpT = Math.max(0, S.pumpT - dt);
      let tilt = 0; let mag = 0; let magVis = true; let slide = 0; let pump = 0; let shell = -1;
      if (S.phase === 'reload' && !w.perShell) {
        const t = S.t / w.reload;
        tilt = ease(seg(t, 0, 0.14)) * (1 - ease(seg(t, 0.86, 1)));
        if (t >= 0.14 && !S.evt.dropped) { S.evt.dropped = true; if (!w.rocket) dropMag(); }
        if (t < 0.38) { mag = 0; magVis = t < 0.14; }
        else { mag = -(1 - ease(seg(t, 0.42, 0.62))) * 0.32; magVis = t >= 0.42; }
        if (t >= 0.66) slide = t < 0.8 ? ease(seg(t, 0.66, 0.76)) : 1 - seg(t, 0.8, 0.84);
      } else if (S.phase === 'reload') {
        tilt = ease(Math.min(1, S.t / 0.18)); shell = S.shellT / w.perShell;
      }
      if (S.cur === 'shotgun') {
        if (S.cycle < 0.55) pump = Math.sin(Math.PI * seg(S.cycle, 0.22, 0.5));
        if (S.cycle >= 0.22 && !S.rackPlayed) { S.rackPlayed = true; G.audio.play('rack', { gain: 0.7 }); }
        if (S.cycle >= 0.32 && !S.shellOut) { S.shellOut = true; ejectCasing(); }
        if (S.pumpT > 0) pump = Math.max(pump, Math.sin(Math.PI * (1 - S.pumpT / 0.38)));
      } else if (S.cycle < 0.1) slide = Math.max(slide, 1 - seg(S.cycle, 0.025, 0.1));
      if (S.cur === 'pistol' && a.mag === 0 && S.phase !== 'reload') slide = 1;
      if (w.rocket && a.mag === 0 && S.phase !== 'reload') magVis = false;
      if (P.slide) P.slide.position.z = 0.055 * slide;
      if (P.bolt) P.bolt.position.z = 0.06 * slide;
      if (P.pump) P.pump.position.z = 0.15 * pump;
      if (P.mag) { P.mag.position.copy(dir).multiplyScalar(-mag); P.mag.visible = magVis; }
      // left hand: rests on the front grip / pump, grabs the magazine during a reload, feeds shells into the shotgun
      const U = models[S.cur].userData; const hand = P.handL;
      hand.position.copy(U.lh);
      if (P.pump) hand.position.z += 0.15 * pump;
      if (S.phase === 'reload' && !w.perShell) {
        const t = S.t / w.reload; const grab = ease(seg(t, 0.06, 0.16)) * (1 - ease(seg(t, 0.62, 0.72)));
        const at = U.magHand.clone().addScaledVector(dir, -mag);
        hand.position.lerp(at, grab);
      }
      if (P.shell) {
        const k = ease(seg(shell, 0, 0.6));
        P.shell.visible = shell >= 0 && shell < 0.7;
        P.shell.position.set(0.05 + 0.14 * (1 - k), 0.035 - 0.12 * (1 - k), -0.2 + 0.06 * (1 - k));
        P.shell.rotation.set(0, -0.9 * (1 - k), 0.4 * (1 - k));
        if (P.shell.visible) hand.position.lerp(P.shell.position.clone().add(new THREE.Vector3(0, -0.05, 0.03)), Math.min(1, S.t / 0.15));
      }
      return tilt;
    }

    function render(renderer) {
      vmCam.aspect = G.camera.aspect; vmCam.updateProjectionMatrix();
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
    }

    function reset() {
      S.inv = START.slice(); S.swing = null; S.combo = 0; trailPts.length = 0;
      while (ground.length) removeGround(ground[0]);
      for (const id of ORDER) { state[id].mag = magOf(WEAPONS[id]); state[id].reserve = resOf(WEAPONS[id]); models[id].visible = false; }
      S.cur = 'smg'; S.next = null; S.phase = 'draw'; S.t = 0; models.smg.visible = true; S.ads = 0; S.bloom = 0; S.shots = 0; S.hits = 0; S.pumpT = 0; S.cycle = 9;
    }

    return { S, state, WEAPONS, ORDER, SLOTS, magOf, resOf, update, render, select, selectSlot, cycle, startReload, give, refill, reset, has, dropCur, pickup, nearGround, ground, takeGround, spawnGround, removeGround, takeItem, airdrop, cur: () => S.cur, ammo, spread: () => (W().spread + S.bloom) * (1 - S.ads * 0.6), adsFov: () => W().adsFov };
  };
})();
