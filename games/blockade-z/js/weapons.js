// Weapons: a stat table, blocky viewmodels built from boxes, hitscan, and spring-driven feel.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const WEAPONS = {
    pistol: { name: 'Súng lục', key: '1', price: 0, dmg: 34, head: 2, rpm: 380, auto: false, mag: 12, reserve: Infinity, pellets: 1, spread: 0.006, moveSpread: 0.018, range: 90, reload: 1.15, snd: 'pistol',
      kick: { back: 0.05, rise: 2.2, yaw: 0.6, cam: 0.012 }, adsFov: 62 },
    shotgun: { name: 'Shotgun', key: '2', price: 350, dmg: 17, head: 1.5, rpm: 70, auto: false, mag: 6, reserve: 30, pellets: 9, spread: 0.065, moveSpread: 0.075, range: 32, perShell: 0.42, snd: 'shotgun',
      kick: { back: 0.14, rise: 6, yaw: 1.4, cam: 0.045 }, adsFov: 64 },
    smg: { name: 'SMG', key: '3', price: 550, dmg: 21, head: 1.8, rpm: 780, auto: true, mag: 32, reserve: 160, pellets: 1, spread: 0.016, moveSpread: 0.03, range: 60, reload: 1.6, snd: 'smg',
      kick: { back: 0.035, rise: 1.2, yaw: 0.8, cam: 0.006 }, adsFov: 60, tracer: 3 },
    rifle: { name: 'Súng trường', key: '4', price: 900, dmg: 46, head: 2.5, rpm: 540, auto: true, mag: 30, reserve: 120, pellets: 1, spread: 0.005, moveSpread: 0.022, range: 120, reload: 2.0, snd: 'rifle',
      kick: { back: 0.05, rise: 1.8, yaw: 0.9, cam: 0.01 }, adsFov: 45, tracer: 2 },
  };
  BZ.WEAPONS = WEAPONS;
  const ORDER = ['pistol', 'shotgun', 'smg', 'rifle'];

  // Viewmodel shapes: many small flat-colour voxels, gun points along -z, grip near origin.
  // Each gun: dark body, a light edge stripe, one saturated accent, one emissive cell.
  const GUNS = {
    pistol: { muzzle: [0, 0.075, -0.3], parts: [
      [-0.04, 0.04, -0.26, 0.04, 0.11, 0.04, 'g_body2'], [-0.041, 0.108, -0.26, 0.041, 0.118, 0.04, 'g_edge'],
      [-0.042, 0.05, -0.005, 0.042, 0.1, 0.008, 'g_body'], [-0.042, 0.05, 0.016, 0.042, 0.1, 0.029, 'g_body'],
      [-0.035, 0.0, -0.22, 0.035, 0.042, 0.02, 'g_body'], [-0.036, 0.014, -0.2, 0.036, 0.03, -0.08, 'g_orange'],
      [-0.018, 0.058, -0.29, 0.018, 0.092, -0.26, 'g_steel'], [-0.01, 0.118, -0.245, 0.01, 0.136, -0.225, 'g_body'],
      [-0.026, 0.118, 0.012, -0.008, 0.136, 0.03, 'g_body'], [0.008, 0.118, 0.012, 0.026, 0.136, 0.03, 'g_body'],
      [-0.012, -0.045, -0.085, 0.012, 0.0, -0.072, 'g_body'], [-0.012, -0.048, -0.085, 0.012, -0.036, -0.02, 'g_body'],
      [0.041, 0.068, -0.07, 0.044, 0.09, -0.02, 'g_glow_orange'],
    ], grip: [[-0.033, -0.17, -0.025, 0.033, 0.0, 0.06, 'g_grip'], [-0.035, -0.14, -0.005, 0.035, -0.04, 0.045, 'g_orange']] },
    shotgun: { muzzle: [0, 0.075, -0.94], parts: [
      [-0.045, 0.0, -0.3, 0.045, 0.11, 0.06, 'g_body'], [-0.046, 0.105, -0.3, 0.046, 0.116, 0.06, 'g_edge'],
      [-0.028, 0.05, -0.9, 0.028, 0.1, -0.3, 'g_steel'], [-0.024, 0.0, -0.82, 0.024, 0.046, -0.3, 'g_body2'],
      [-0.05, -0.016, -0.66, 0.05, 0.056, -0.44, 'g_red'],
      [-0.052, -0.002, -0.62, 0.052, 0.042, -0.605, 'g_body'], [-0.052, -0.002, -0.565, 0.052, 0.042, -0.55, 'g_body'], [-0.052, -0.002, -0.51, 0.052, 0.042, -0.495, 'g_body'],
      [-0.031, 0.044, -0.925, 0.031, 0.106, -0.9, 'g_edge'], [-0.008, 0.1, -0.885, 0.008, 0.116, -0.865, 'g_gold'],
      [-0.04, -0.06, 0.06, 0.04, 0.09, 0.4, 'g_body2'], [-0.041, 0.0, 0.15, 0.041, 0.03, 0.4, 'g_red'], [-0.042, -0.07, 0.39, 0.042, 0.1, 0.42, 'g_grip'],
      [0.045, 0.02, -0.25, 0.06, 0.075, -0.225, 'g_red'], [0.045, 0.02, -0.21, 0.06, 0.075, -0.185, 'g_red'], [0.045, 0.02, -0.17, 0.06, 0.075, -0.145, 'g_red'],
      [0.045, 0.075, -0.25, 0.06, 0.09, -0.145, 'g_gold'],
      [0.046, 0.065, -0.07, 0.049, 0.088, -0.0, 'g_glow_red'],
    ], grip: [[-0.035, -0.16, 0.0, 0.035, 0.0, 0.08, 'g_grip']] },
    smg: { muzzle: [0, 0.06, -0.54], parts: [
      [-0.042, 0.0, -0.34, 0.042, 0.115, 0.06, 'g_body'], [-0.043, 0.06, -0.34, 0.043, 0.074, 0.06, 'g_lime'],
      [-0.03, 0.115, -0.32, 0.03, 0.132, 0.02, 'g_body2'],
      [-0.031, 0.132, -0.3, 0.031, 0.142, -0.285, 'g_body'], [-0.031, 0.132, -0.25, 0.031, 0.142, -0.235, 'g_body'], [-0.031, 0.132, -0.2, 0.031, 0.142, -0.185, 'g_body'],
      [-0.03, 0.03, -0.48, 0.03, 0.09, -0.34, 'g_body2'],
      [0.03, 0.05, -0.46, 0.033, 0.07, -0.44, 'g_grip'], [0.03, 0.05, -0.42, 0.033, 0.07, -0.4, 'g_grip'], [0.03, 0.05, -0.38, 0.033, 0.07, -0.36, 'g_grip'],
      [-0.021, 0.039, -0.53, 0.021, 0.081, -0.48, 'g_steel'],
      [-0.024, -0.26, -0.2, 0.024, 0.0, -0.13, 'g_body2'], [-0.027, -0.285, -0.205, 0.027, -0.255, -0.125, 'g_lime'],
      [-0.012, 0.02, 0.06, 0.012, 0.05, 0.3, 'g_steel'], [-0.035, -0.04, 0.28, 0.035, 0.09, 0.31, 'g_body'],
      [-0.026, 0.132, -0.13, 0.026, 0.18, -0.04, 'g_body'], [-0.016, 0.142, -0.042, 0.016, 0.17, -0.038, 'g_glow_lime'],
      [0.043, 0.02, -0.3, 0.046, 0.042, -0.25, 'g_glow_lime'],
    ], grip: [[-0.03, -0.15, 0.0, 0.03, 0.0, 0.07, 'g_grip']] },
    rifle: { muzzle: [0, 0.055, -0.98], parts: [
      [-0.04, 0.0, -0.46, 0.04, 0.115, 0.08, 'g_body'], [-0.041, 0.03, -0.42, 0.041, 0.085, -0.25, 'g_blue'],
      [-0.041, 0.11, -0.46, 0.041, 0.12, 0.08, 'g_edge'],
      [-0.045, -0.01, -0.7, 0.045, 0.1, -0.46, 'g_body2'],
      [0.045, 0.03, -0.66, 0.048, 0.06, -0.62, 'g_grip'], [0.045, 0.03, -0.6, 0.048, 0.06, -0.56, 'g_grip'], [0.045, 0.03, -0.54, 0.048, 0.06, -0.5, 'g_grip'],
      [-0.016, 0.04, -0.92, 0.016, 0.07, -0.7, 'g_steel'], [-0.026, 0.03, -0.97, 0.026, 0.08, -0.92, 'g_body'], [-0.008, 0.08, -0.75, 0.008, 0.13, -0.73, 'g_body'],
      [-0.026, -0.16, -0.3, 0.026, 0.0, -0.2, 'g_body2'], [-0.026, -0.26, -0.33, 0.026, -0.15, -0.22, 'g_body2'], [-0.027, -0.2, -0.32, 0.027, -0.18, -0.21, 'g_blue'],
      [-0.038, -0.06, 0.08, 0.038, 0.1, 0.42, 'g_body2'], [-0.039, 0.02, 0.2, 0.039, 0.05, 0.42, 'g_blue'], [-0.04, -0.07, 0.41, 0.04, 0.11, 0.44, 'g_grip'],
      [-0.03, 0.13, -0.3, 0.03, 0.19, -0.06, 'g_body'], [-0.015, 0.12, -0.26, 0.015, 0.13, -0.22, 'g_body2'], [-0.015, 0.12, -0.14, 0.015, 0.13, -0.1, 'g_body2'],
      [-0.022, 0.14, -0.302, 0.022, 0.18, -0.298, 'g_glow_blue'], [-0.02, 0.142, -0.062, 0.02, 0.178, -0.058, 'g_glow_blue'],
      [0.041, 0.09, -0.2, 0.044, 0.108, -0.12, 'g_glow_blue'],
    ], grip: [[-0.032, -0.15, -0.02, 0.032, 0.0, 0.06, 'g_grip']] },
  };
  const GLOW = { g_glow_orange: 0xff8a20, g_glow_red: 0xff3a2a, g_glow_lime: 0x9cff50, g_glow_blue: 0x50c0ff };
  function buildGun(id) {
    const D = GUNS[id];
    const B = new BZ.Builder('gun:' + id);
    const box = (p) => B.box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true });
    D.parts.forEach(box);
    B.push(new THREE.Matrix4().makeRotationX(0.28));
    D.grip.forEach(box);
    B.pop();
    const matOpts = {}; for (const k of Object.keys(GLOW)) matOpts[k] = { emissive: GLOW[k] };
    const g = B.build({ matOpts });
    g.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.fog = false; } });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: BZ.tex('flash'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    flash.position.set(...D.muzzle); flash.visible = false;
    g.add(flash);
    g.userData = { muzzle: new THREE.Vector3(...D.muzzle), flash };
    return g;
  }
  BZ.GUN_PARTS = GUNS;

  BZ.makeWeapons = (G) => {
    const vmScene = new THREE.Scene();
    const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    vmScene.add(new THREE.HemisphereLight(0xc8d6f4, 0x6a5a48, 1.5));
    const sun = new THREE.DirectionalLight(0xffd8a8, 1.2); sun.position.set(-0.6, 0.8, 0.5); vmScene.add(sun);
    const rig = new THREE.Group(); vmScene.add(rig);
    const models = {};
    for (const id of ORDER) { models[id] = buildGun(id); models[id].visible = false; rig.add(models[id]); }

    const state = {};
    const S = {
      owned: { pistol: true }, cur: 'pistol', next: null, phase: 'ready', t: 0, cool: 0, bloom: 0, ads: 0, trigger: false, held: false,
      shots: 0, hits: 0,
      kZ: BZ.spring(420, 26), kP: BZ.spring(300, 22), kY: BZ.spring(260, 20), kR: BZ.spring(260, 18), swX: BZ.spring(120, 14), swY: BZ.spring(120, 14), drop: BZ.spring(160, 20),
    };
    for (const id of ORDER) state[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    models.pistol.visible = true;
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
      S.phase = 'reload'; S.t = 0; S.shellT = 0;
      G.audio.play('mag_out', { gain: 0.8 });
    }

    const o = new THREE.Vector3(); const d = new THREE.Vector3(); const right = new THREE.Vector3(); const up = new THREE.Vector3();
    function fire() {
      const w = W(); const a = ammo(); const P = G.player;
      if (a.mag <= 0) { G.audio.play('empty'); S.cool = 0.25; if (a.reserve > 0) startReload(); return; }
      a.mag--; S.cool = 60 / w.rpm; S.shots++;
      const cam = G.camera;
      cam.updateMatrixWorld();
      cam.getWorldPosition(o);
      cam.getWorldDirection(d);
      right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const moving = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) + (P.onGround ? 0 : 1);
      const spread = (w.spread + w.moveSpread * moving) * (1 - S.ads * 0.6) + S.bloom;
      let anyHit = false; let head = false;
      const muzzleW = new THREE.Vector3().copy(o).addScaledVector(d, 0.6).addScaledVector(right, 0.18).addScaledVector(up, -0.12);
      const pend = new Map();
      for (let i = 0; i < w.pellets; i++) {
        const r = Math.sqrt(G.rng.next()) * spread; const th = G.rng.next() * Math.PI * 2;
        const dir = d.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
        const wh = G.world.raycast(o, dir, w.range);
        const zh = G.zombies.hitTest(o, dir, wh ? wh.t : w.range);
        const end = o.clone().addScaledVector(dir, zh ? zh.t : wh ? wh.t : w.range);
        if (zh) {
          const k = zh.z; const mult = zh.part === 'head' ? w.head : 1;
          const fall = w.pellets > 1 ? BZ.clamp(1.25 - zh.t / w.range, 0.35, 1) : 1;
          const e = pend.get(k) || { dmg: 0, part: 'body', dir };
          e.dmg += w.dmg * mult * fall; if (zh.part === 'head') e.part = 'head';
          pend.set(k, e);
          anyHit = true; head = head || zh.part === 'head';
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
        const died = G.zombies.damage(z, e.dmg, e.part, e.dir);
        if (died) kills++;
        G.events.emit('hit', { z, dmg: Math.round(e.dmg), part: e.part, died });
      }
      if (anyHit) { S.hits++; G.audio.play(head ? 'head' : 'hit', { gain: 0.7 }); G.audio.play('marker', { gain: head ? 1 : 0.6 }); }
      G.audio.play(w.snd, { gain: 1 }); G.audio.duck();
      G.fx.muzzle(muzzleW);
      const m = models[S.cur]; m.userData.flash.visible = true; m.userData.flash.rotation.z = G.rng.next() * 3; S.flashT = 0.045;
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
            S.shellT = 0; const n = Math.min(1, a.reserve); a.mag += n; a.reserve -= n; G.audio.play('shell_in', { gain: 0.8 });
            if (a.mag >= w.mag || a.reserve <= 0) { S.phase = 'ready'; G.audio.play('rack', { gain: 0.8 }); }
          }
          if (input.fire && a.mag > 0 && S.t > 0.2) { S.phase = 'ready'; }
        } else {
          if (S.t >= w.reload * 0.6 && !S.inPlayed) { S.inPlayed = true; G.audio.play('mag_in', { gain: 0.8 }); }
          if (S.t >= w.reload) {
            const need = w.mag - a.mag; const n = Math.min(need, a.reserve);
            a.mag += n; a.reserve -= n; S.phase = 'ready'; S.inPlayed = false;
            if (S.cur !== 'pistol') G.audio.play('rack', { gain: 0.6 });
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
      const bx = Math.sin(P.stride * Math.PI) * 0.012 * bobA; const by = -Math.abs(Math.cos(P.stride * Math.PI)) * 0.014 * bobA;
      let rp = 0; let ry = 0;
      if (S.phase === 'reload') {
        const tt = w.perShell ? 0.5 : BZ.clamp(S.t / w.reload, 0, 1);
        const dip = w.perShell ? 1 : Math.sin(Math.PI * tt);
        rp = -0.5 * dip; ry = 0.35 * dip;
      }
      const sprintTilt = P.sprinting ? 1 : 0;
      S.sprintK = BZ.damp(S.sprintK || 0, sprintTilt, 10, dt);
      const pos = HIP.clone().lerp(ADS, S.ads);
      rig.position.set(pos.x + sx + bx + ry * 0.1, pos.y + sy + by - S.drop.x * 0.35 - P.landDip * 0.4 + rp * 0.12 - S.sprintK * 0.05, pos.z + kz * 0.06);
      rig.rotation.set(kp * 0.02 + rp - S.drop.x * 0.6 - S.sprintK * 0.2 + 0.05 * (1 - S.ads), ky * 0.02 + ry * 0.6 + S.sprintK * 0.5 + 0.3 * (1 - S.ads), kr * 0.02 + sx * 2 + S.sprintK * 0.25 + 0.06 * (1 - S.ads));
      vmCam.fov = BZ.lerp(62, 50, S.ads); vmCam.updateProjectionMatrix();
    }

    function render(renderer) {
      vmCam.aspect = G.camera.aspect; vmCam.updateProjectionMatrix();
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
    }

    function reset() {
      S.owned = { pistol: true };
      for (const id of ORDER) { state[id].mag = WEAPONS[id].mag; state[id].reserve = WEAPONS[id].reserve; models[id].visible = false; }
      S.cur = 'pistol'; S.next = null; S.phase = 'draw'; S.t = 0; models.pistol.visible = true; S.ads = 0; S.bloom = 0; S.shots = 0; S.hits = 0;
    }

    return { S, state, WEAPONS, ORDER, update, render, select, cycle, startReload, give, refill, reset, cur: () => S.cur, ammo, spread: () => (W().spread + S.bloom) * (1 - S.ads * 0.6), adsFov: () => W().adsFov };
  };
})();
