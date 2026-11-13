// Weapons: a stat table, blocky viewmodels built from boxes, hitscan, and spring-driven feel.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const WEAPONS = {
    pistol: { name: 'Súng lục', key: '1', price: 0, dmg: 34, head: 2, rpm: 380, auto: false, mag: 12, reserve: Infinity, pellets: 1, spread: 0.006, moveSpread: 0.018, range: 90, reload: 1.15, snd: 'pistol', impulse: 1, crit: 0.14,
      kick: { back: 0.05, rise: 2.2, yaw: 0.6, cam: 0.012 }, adsFov: 62 },
    shotgun: { name: 'Shotgun', key: '2', price: 350, dmg: 17, head: 1.5, rpm: 70, auto: false, mag: 6, reserve: 30, pellets: 9, spread: 0.065, moveSpread: 0.075, range: 32, perShell: 0.42, snd: 'shotgun', impulse: 0.45,
      kick: { back: 0.14, rise: 6, yaw: 1.4, cam: 0.045 }, adsFov: 64 },
    smg: { name: 'SMG', key: '3', price: 0, dmg: 21, head: 1.8, rpm: 780, auto: true, mag: 40, reserve: Infinity, pellets: 1, spread: 0.016, moveSpread: 0.03, range: 60, reload: 1.6, snd: 'smg', impulse: 0.55,
      kick: { back: 0.035, rise: 1.2, yaw: 0.8, cam: 0.006 }, adsFov: 60, tracer: 3 },
    rifle: { name: 'Súng trường', key: '4', price: 900, dmg: 46, head: 2.5, rpm: 540, auto: true, mag: 30, reserve: 120, pellets: 1, spread: 0.005, moveSpread: 0.022, range: 120, reload: 2.0, snd: 'rifle', impulse: 1.4, pierce: 2,
      kick: { back: 0.05, rise: 1.8, yaw: 0.9, cam: 0.01 }, adsFov: 45, tracer: 2 },
    bazooka: { name: 'Bazooka', key: '5', price: 1200, dmg: 0, head: 1, rpm: 50, auto: false, mag: 1, reserve: 10, pellets: 1, spread: 0.002, moveSpread: 0.012, range: 150, reload: 2.4, snd: 'rocket', impulse: 3, rocket: true,
      kick: { back: 0.3, rise: 7, yaw: 1, cam: 0.06 }, adsFov: 55 },
  };
  BZ.WEAPONS = WEAPONS;
  const ORDER = ['pistol', 'shotgun', 'smg', 'rifle', 'bazooka'];

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
  const GLOW = { g_glow_orange: 0xff8a20, g_glow_red: 0xff3a2a, g_glow_lime: 0x9cff50, g_glow_blue: 0x50c0ff };
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
    const magDir = id === 'bazooka' ? new THREE.Vector3(0, 0.15, -1).normalize() : id === 'pistol' ? new THREE.Vector3(0, -1, 0).applyMatrix4(tilt) : new THREE.Vector3(0, -1, 0.12).normalize();
    g.userData = { muzzle: new THREE.Vector3(...D.muzzle), flash, parts, magDir, lh: new THREE.Vector3(...D.lh), magHand: new THREE.Vector3(...D.magHand), port: new THREE.Vector3(...D.port), shellColor: D.shellColor };
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
      owned: { pistol: true, smg: true }, cur: 'smg', next: null, phase: 'ready', t: 0, cool: 0, bloom: 0, ads: 0, trigger: false, held: false,
      shots: 0, hits: 0, evt: {}, cycle: 9, pumpT: 0, rackPlayed: true,
      kZ: BZ.spring(420, 26), kP: BZ.spring(300, 22), kY: BZ.spring(260, 20), kR: BZ.spring(260, 18), swX: BZ.spring(120, 14), swY: BZ.spring(120, 14), drop: BZ.spring(160, 20),
    };
    for (const id of ORDER) state[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    models.smg.visible = true;
    const HIP = new THREE.Vector3(0.25, -0.25, -0.56); const ADS = new THREE.Vector3(0, -0.125, -0.32);

    const W = () => WEAPONS[S.cur];
    const ammo = () => state[S.cur];

    function give(id) { S.owned[id] = true; state[id].mag = WEAPONS[id].mag; state[id].reserve = WEAPONS[id].reserve; select(id); }
    function refill() { for (const id of ORDER) if (S.owned[id]) state[id].reserve = WEAPONS[id].reserve; }
    function select(id) {
      if (!S.owned[id] || (id === S.cur && S.phase !== 'holster')) return;
      S.next = id; S.phase = 'holster'; S.t = 0;
    }
    function cycle(dir) {
      const own = ORDER.filter((id) => S.owned[id]);
      const i = own.indexOf(S.next || S.cur);
      select(own[(i + dir + own.length) % own.length]);
    }
    function startReload() {
      const w = W(); const a = ammo();
      if (S.phase !== 'ready' || a.mag >= w.mag || a.reserve <= 0) return;
      S.phase = 'reload'; S.t = 0; S.shellT = 0; S.evt = {};
    }

    const o = new THREE.Vector3(); const d = new THREE.Vector3(); const right = new THREE.Vector3(); const up = new THREE.Vector3();
    function fire() {
      const w = W(); const a = ammo(); const P = G.player;
      if (a.mag <= 0) { G.audio.play('empty'); S.cool = 0.25; if (a.reserve > 0) startReload(); return; }
      a.mag--; S.cool = 60 / w.rpm; S.shots++; S.cycle = 0; S.rackPlayed = false; S.shellOut = false;
      const cam = G.camera;
      cam.updateMatrixWorld();
      cam.getWorldPosition(o);
      cam.getWorldDirection(d);
      right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const moving = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) + (P.onGround ? 0 : 1);
      const spread = (w.spread + w.moveSpread * moving) * (1 - S.ads * 0.6) + S.bloom;
      let anyHit = false; let head = false;
      if (w.rocket) {
        const from = new THREE.Vector3().copy(o).addScaledVector(d, 1.0).addScaledVector(right, 0.15).addScaledVector(up, -0.05);
        const aim = d.clone().addScaledVector(right, (G.rng.next() - 0.5) * spread).addScaledVector(up, (G.rng.next() - 0.5) * spread).normalize();
        G.gear.fireRocket(from, aim);
      }
      const muzzleW = new THREE.Vector3().copy(o).addScaledVector(d, 0.6).addScaledVector(right, 0.18).addScaledVector(up, -0.12);
      const pend = new Map();
      for (let i = 0; i < (w.rocket ? 0 : w.pellets); i++) {
        const r = Math.sqrt(G.rng.next()) * spread; const th = G.rng.next() * Math.PI * 2;
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
          const crit = G.rng.chance(w.crit || 0.08); if (crit) e.crit = true;
          e.dmg += w.dmg * mult * fall * power * (crit ? 2 : 1); e.imp += (w.impulse || 1) * fall * power;
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
          G.fx.burst(end, 3, dust, { dir: n, push: 2, size: 0.07, life: 0.6 });
          if (i === 0) G.audio.playAt('impact', end, { gain: 0.5 });
        }
        if (w.tracer && S.shots % w.tracer === 0 && i === 0) G.fx.tracer(muzzleW, end);
      }
      let kills = 0;
      for (const [z, e] of pend) {
        const died = G.zombies.damage(z, e.dmg, e.part, e.dir, e.imp);
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
      const wantAds = input.ads && S.phase === 'ready' && !P.sprinting;
      S.ads = BZ.damp(S.ads, wantAds ? 1 : 0, 14, dt);

      if (S.phase === 'holster') {
        S.t += dt; S.drop.x = Math.min(1, S.t / 0.18);
        if (S.t >= 0.18) {
          models[S.cur].visible = false; models[S.cur].userData.flash.visible = false;
          S.cur = S.next; S.next = null; models[S.cur].visible = true; S.phase = 'draw'; S.t = 0; G.audio.play('switch', { gain: 0.7 });
        }
      } else if (S.phase === 'draw') {
        S.t += dt; S.drop.x = 1 - Math.min(1, S.t / 0.22);
        if (S.t >= 0.22) { S.phase = 'ready'; S.drop.x = 0; }
      } else if (S.phase === 'reload') {
        S.t += dt;
        if (w.perShell) {
          S.shellT += dt;
          if (S.shellT >= w.perShell) {
            S.shellT = 0; const n = Math.min(1, a.reserve); a.mag += n; a.reserve -= n; G.audio.play('shell_in', { gain: 0.8 }); S.kZ.v -= 1.2; S.kR.v += 1.5;
            if (a.mag >= w.mag || a.reserve <= 0) { S.phase = 'ready'; S.pumpT = 0.38; G.audio.play('rack', { gain: 0.8 }); }
          }
          if (input.fire && a.mag > 0 && S.t > 0.2) { S.phase = 'ready'; }
        } else {
          const t = S.t / w.reload;
          for (const [at, snd] of RELOAD_SOUNDS) if (t >= at && !S.evt[snd]) { S.evt[snd] = true; G.audio.play(snd, { gain: 0.8 }); if (snd === 'mag_in') { S.kZ.v -= 1.5; S.kP.v -= 2; } if (snd === 'rack') S.kZ.v += 1.2; }
          if (S.t >= w.reload) {
            const need = w.mag - a.mag; const n = Math.min(need, a.reserve);
            a.mag += n; a.reserve -= n; S.phase = 'ready';
          }
        }
      }
      if (S.autoReload > 0) { S.autoReload -= dt; if (S.autoReload <= 0) startReload(); }

      const canFire = S.phase === 'ready' && S.cool <= 0 && P.alive && !P.sprinting;
      if (input.fire && canFire && (w.auto || !S.held)) fire();
      S.held = input.fire;

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
      rig.rotation.set(kp * 0.02 + rp - S.drop.x * 0.6 - S.sprintK * (0.2 + Math.abs(Math.cos(P.stride * Math.PI)) * 0.08) + 0.05 * (1 - S.ads), ky * 0.02 + ry * 0.6 + S.sprintK * 0.5 + 0.3 * (1 - S.ads), kr * 0.02 + sx * 2 + S.sprintK * 0.25 + 0.06 * (1 - S.ads) + rr + (S.sprintK || 0) * Math.sin(P.stride * Math.PI) * 0.09);
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
      S.owned = { pistol: true, smg: true };
      for (const id of ORDER) { state[id].mag = WEAPONS[id].mag; state[id].reserve = WEAPONS[id].reserve; models[id].visible = false; }
      S.cur = 'smg'; S.next = null; S.phase = 'draw'; S.t = 0; models.smg.visible = true; S.ads = 0; S.bloom = 0; S.shots = 0; S.hits = 0; S.pumpT = 0; S.cycle = 9;
    }

    return { S, state, WEAPONS, ORDER, update, render, select, cycle, startReload, give, refill, reset, cur: () => S.cur, ammo, spread: () => (W().spread + S.bloom) * (1 - S.ads * 0.6), adsFov: () => W().adsFov };
  };
})();
