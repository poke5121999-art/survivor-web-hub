// Blocky zombies: a pool of box-rigged bodies, a flow-field chase, telegraphed swipes.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const TYPES = {
    walker: { hp: 100, speed: 2.1, dmg: 12, rate: 1.1, windup: 0.4, scale: 1, skin: 'z_skin', face: 'z_face', shirt: ['z_vest', 'z_shirt_red', 'z_shirt_dark'], pants: ['z_pants', 'z_pants_brown'], coin: 10, score: 100, voice: 'groan', eye: 0xff3020, hunch: 0.08, droop: 0.5 },
    runner: { hp: 60, speed: 4.3, dmg: 8, rate: 0.8, windup: 0.28, scale: 0.92, skin: 'z_skin_runner', face: 'z_face_runner', shirt: ['z_shirt_red'], pants: ['z_pants_dark', 'z_pants'], coin: 15, score: 150, voice: 'screech', eye: 0xffd23a, hunch: 0.38, droop: 0.15 },
    brute: { hp: 480, speed: 1.6, dmg: 30, rate: 1.7, windup: 0.6, scale: 1.45, skin: 'z_skin_brute', face: 'z_face_brute', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 50, score: 500, voice: 'roar', eye: 0xff2a10, hunch: 0.15, droop: 0 },
  };
  BZ.ZOMBIES = TYPES;

  // Wave plan. n starts at 1.
  BZ.WAVE = {
    count: (n) => Math.min(6 + 3 * n, 70),
    runnerShare: (n) => (n < 2 ? 0 : Math.min(0.4, 0.08 * (n - 1))),
    bruteShare: (n) => (n < 4 ? 0 : Math.min(0.15, 0.04 * (n - 3))),
    hpMul: (n) => Math.min(3, 1 + 0.09 * (n - 1)),
    dmgMul: (n) => Math.min(2, 1 + 0.05 * (n - 1)),
    maxAlive: (n) => Math.min(12 + 2 * n, 30),
    spawnGap: (n) => Math.max(0.35, 1.1 - 0.07 * n),
  };

  const geo = (w, h, d, py) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, py, 0); return g; };
  const G_LEG = geo(0.26, 0.75, 0.26, -0.375);
  const G_TORSO = geo(0.52, 0.7, 0.3, 0.35);
  const G_ARM = geo(0.2, 0.7, 0.2, -0.32);
  const G_HEAD = geo(0.5, 0.5, 0.5, 0.25);

  const BAR_GEO = new THREE.PlaneGeometry(0.7, 0.09);

  BZ.makeZombies = (G) => {
    const POOL = 32;
    const list = [];
    const flowT = { t: 0 };

    function makeBody() {
      const mats = {};
      const mk = (k) => new THREE.MeshLambertMaterial({ map: BZ.tex('z_skin') });
      for (const k of ['skin', 'face', 'shirt', 'pants']) mats[k] = mk(k);
      const root = new THREE.Group(); root.rotation.order = 'YXZ';
      const hips = new THREE.Group(); hips.position.y = 0.75; root.add(hips);
      const legL = new THREE.Mesh(G_LEG, mats.pants); legL.position.x = -0.13; hips.add(legL);
      const legR = new THREE.Mesh(G_LEG, mats.pants); legR.position.x = 0.13; hips.add(legR);
      const torso = new THREE.Mesh(G_TORSO, mats.shirt); hips.add(torso);
      const armL = new THREE.Mesh(G_ARM, mats.skin); armL.position.set(-0.36, 0.64, 0); hips.add(armL);
      const armR = new THREE.Mesh(G_ARM, mats.skin); armR.position.set(0.36, 0.64, 0); hips.add(armR);
      const head = new THREE.Mesh(G_HEAD, [mats.skin, mats.skin, mats.skin, mats.skin, mats.face, mats.skin]); head.position.y = 0.7; hips.add(head);
      root.traverse((o) => { if (o.isMesh) { o.castShadow = G.quality.shadow > 0; o.receiveShadow = false; } });
      root.visible = false;
      G.scene.add(root);
      const barBg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0x1a0c08, depthWrite: false }));
      const barFg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0xe8402c, depthWrite: false }));
      barFg.position.z = 0.002; barBg.add(barFg); barBg.visible = false; barBg.renderOrder = 5; barFg.renderOrder = 6; G.scene.add(barBg);
      return { root, hips, legL, legR, armL, armR, torso, head, mats, barBg, barFg };
    }
    for (let i = 0; i < POOL; i++) list.push({ alive: false, body: makeBody(), pos: new THREE.Vector3(), vel: new THREE.Vector3() });

    function dress(z, type) {
      const T = TYPES[type]; const r = G.rng;
      const set = (m, key) => { m.map = BZ.tex(key); m.needsUpdate = true; };
      set(z.body.mats.skin, T.skin); set(z.body.mats.face, T.face); set(z.body.mats.shirt, r.pick(T.shirt)); set(z.body.mats.pants, r.pick(T.pants));
      z.body.mats.face.userData.eye = T.eye;
    }

    function spawn(type, wave, gate) {
      const z = list.find((q) => !q.alive && !q.dying);
      if (!z) return null;
      const T = TYPES[type];
      if (z.type !== type) dress(z, type);
      z.type = type; z.T = T;
      z.alive = true; z.dying = 0; z.headless = false;
      z.hp = z.maxHp = Math.round(T.hp * BZ.WAVE.hpMul(wave));
      z.dmg = Math.round(T.dmg * BZ.WAVE.dmgMul(wave));
      z.speed = T.speed * G.rng.range(0.9, 1.1);
      z.pos.set(gate.x + G.rng.range(-1.2, 1.2), 0, gate.z + G.rng.range(-1.2, 1.2));
      z.vel.set(0, 0, 0);
      z.yaw = Math.atan2(-gate.dir[0], -gate.dir[1]);
      z.phase = G.rng.range(0, 6); z.attackT = 0; z.windT = -1; z.flash = 0; z.voiceT = G.rng.range(1, 5); z.stuck = 0;
      const b = z.body;
      b.root.visible = true; b.root.scale.setScalar(T.scale); b.head.visible = true;
      b.root.rotation.set(0, z.yaw, 0); b.root.position.copy(z.pos);
      setFlash(z, false);
      return z;
    }

    const tmp = [0, 0];
    const out = {};
    function update(dt) {
      const P = G.player;
      flowT.t -= dt;
      if (flowT.t <= 0) { G.world.updateFlow(P.pos.x, P.pos.z); flowT.t = 0.25; }
      const alive = list.filter((z) => z.alive);
      for (const z of alive) {
        const T = z.T;
        const dx = P.pos.x - z.pos.x; const dz = P.pos.z - z.pos.z;
        const dist = Math.hypot(dx, dz);
        const reach = 1.25 * T.scale;
        const canHit = dist < reach + 0.15 && P.pos.y < 1.9 * T.scale && P.alive;

        // steering
        let sx = 0; let sz = 0;
        if (dist < 5 && G.world.lineOfSight(new THREE.Vector3(z.pos.x, 1.2, z.pos.z), new THREE.Vector3(P.pos.x, 1.2, P.pos.z))) { sx = dx; sz = dz; }
        else if (G.world.flowDir(z.pos.x, z.pos.z, tmp)) { sx = tmp[0]; sz = tmp[1]; }
        else { sx = dx; sz = dz; }
        const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
        // separation
        for (const o of alive) {
          if (o === z) continue;
          const ox = z.pos.x - o.pos.x; const oz = z.pos.z - o.pos.z; const d2 = ox * ox + oz * oz;
          const minD = 0.75 * (T.scale + o.T.scale) * 0.6;
          if (d2 < minD * minD && d2 > 1e-6) { const d = Math.sqrt(d2); sx += (ox / d) * (minD - d) * 2.5; sz += (oz / d) * (minD - d) * 2.5; }
        }
        const attacking = z.windT >= 0;
        const want = attacking || dist < reach * 0.8 ? 0 : z.speed;
        z.vel.x = BZ.damp(z.vel.x, sx * want, 8, dt); z.vel.z = BZ.damp(z.vel.z, sz * want, 8, dt); z.vel.y = 0;
        const before = z.pos.x + z.pos.z;
        G.world.moveBox(z.pos, z.vel, dt, 0.32 * T.scale, 1.8, out);
        z.pos.y = 0;
        z.stuck = Math.abs(z.pos.x + z.pos.z - before) < want * dt * 0.1 && want > 0 ? z.stuck + dt : 0;

        const face = Math.atan2(dx, dz);
        const moveYaw = Math.hypot(z.vel.x, z.vel.z) > 0.3 && dist > 3 ? Math.atan2(z.vel.x, z.vel.z) : face;
        z.yaw += BZ.wrapAngle(moveYaw - z.yaw) * Math.min(1, dt * 8);

        // attack: windup (telegraph) then hit if still in reach
        z.attackT -= dt;
        if (!attacking && canHit && z.attackT <= 0) { z.windT = 0; G.audio.playAt('swipe', z.pos, { gain: 0.6 }); }
        if (z.windT >= 0) {
          z.windT += dt;
          if (z.windT >= T.windup) {
            z.windT = -1; z.attackT = T.rate;
            if (dist < reach + 0.45 && P.pos.y < 1.9 * T.scale) G.events.emit('player:hurt', { dmg: z.dmg, from: z.pos });
          }
        }

        z.voiceT -= dt;
        if (z.voiceT <= 0) { z.voiceT = G.rng.range(3, 8); G.audio.playAt(T.voice, z.pos, { gain: 0.7 }); }

        // animation
        const sp = Math.hypot(z.vel.x, z.vel.z);
        z.phase += dt * sp * 2.4 / T.scale;
        const b = z.body;
        const sw = Math.sin(z.phase) * Math.min(1, sp / 2) * 0.7;
        b.legL.rotation.x = sw - T.hunch; b.legR.rotation.x = -sw - T.hunch;
        const wind = z.windT >= 0 ? z.windT / T.windup : 0;
        const armBase = -Math.PI / 2 + Math.sin(z.phase * 0.5) * 0.12;
        b.armL.rotation.x = armBase + T.droop - wind * (0.9 + T.droop) + (z.attackT > T.rate - 0.15 ? 0.9 : 0);
        b.armR.rotation.x = armBase - wind * 0.9 + Math.sin(z.phase * 0.5 + 1) * 0.1 + (z.attackT > T.rate - 0.15 ? 0.9 : 0);
        b.hips.rotation.z = Math.sin(z.phase) * 0.05; b.hips.rotation.x = T.hunch;
        b.hips.position.y = 0.75 + Math.abs(Math.cos(z.phase)) * 0.04;
        b.head.rotation.z = Math.sin(z.phase * 0.7) * 0.15;
        b.root.position.copy(z.pos); b.root.rotation.y = z.yaw;
        if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) setFlash(z, false); }
        const bar = b.barBg; bar.visible = z.hp < z.maxHp;
        if (bar.visible) { bar.position.set(z.pos.x, 2.2 * T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
      }
      // death animation: fall back, sink, then return to pool
      for (const z of list) {
        if (!z.dying) continue;
        z.dying += dt;
        const b = z.body;
        b.root.rotation.x = -Math.min(1, z.dying / 0.35) * Math.PI / 2;
        if (z.dying > 1.2) b.root.position.y = -(z.dying - 1.2) * 0.8;
        if (z.dying > 2.2) { z.dying = 0; b.root.visible = false; b.root.rotation.x = 0; b.root.position.y = 0; }
      }
    }

    // Hit boxes in world space (bodies are upright; axis-aligned boxes are close enough for blocks).
    function hitTest(o, d, maxT) {
      let best = null;
      for (const z of list) {
        if (!z.alive) continue;
        const s = z.T.scale;
        const boxes = [
          { part: 'body', min: [z.pos.x - 0.34 * s, 0, z.pos.z - 0.34 * s], max: [z.pos.x + 0.34 * s, 1.45 * s, z.pos.z + 0.34 * s] },
        ];
        if (!z.headless) boxes.push({ part: 'head', min: [z.pos.x - 0.27 * s, 1.43 * s, z.pos.z - 0.27 * s], max: [z.pos.x + 0.27 * s, 1.97 * s, z.pos.z + 0.27 * s] });
        for (const bx of boxes) {
          let t0 = 0; let t1 = best ? best.t : maxT; let ok = true;
          for (let k = 0; k < 3; k++) {
            const oo = k === 0 ? o.x : k === 1 ? o.y : o.z; const dd = k === 0 ? d.x : k === 1 ? d.y : d.z;
            if (Math.abs(dd) < 1e-9) { if (oo < bx.min[k] || oo > bx.max[k]) { ok = false; break; } continue; }
            let a = (bx.min[k] - oo) / dd; let b2 = (bx.max[k] - oo) / dd; if (a > b2) { const tt = a; a = b2; b2 = tt; }
            t0 = Math.max(t0, a); t1 = Math.min(t1, b2); if (t0 > t1) { ok = false; break; }
          }
          if (ok && (!best || t0 < best.t || (bx.part === 'head' && Math.abs(t0 - best.t) < 0.05))) best = { t: t0, z, part: bx.part };
        }
      }
      return best;
    }

    function damage(z, amount, part, dir) {
      if (!z.alive) return false;
      z.hp -= amount; z.flash = 0.09; setFlash(z, true);
      const at = new THREE.Vector3(z.pos.x, (part === 'head' ? 1.7 : 1.0) * z.T.scale, z.pos.z);
      G.fx.burst(at, part === 'head' ? 10 : 6, [0xb3201a, 0x7a1410, 0x5f8f3e], { dir, push: 2.5, size: 0.11 });
      z.vel.addScaledVector(dir, 1.2 / z.T.scale);
      if (z.hp <= 0) { kill(z, part, dir); return true; }
      return false;
    }
    function kill(z, part, dir) {
      z.alive = false; z.dying = 0.001;
      const b = z.body;
      setFlash(z, false); b.barBg.visible = false;
      if (part === 'head') {
        z.headless = true; b.head.visible = false;
        const at = new THREE.Vector3(z.pos.x, 1.7 * z.T.scale, z.pos.z);
        G.fx.burst(at, 18, [0x6fa35a, 0xb3201a, 0x557f44, 0x2a1410], { dir, push: 3, size: 0.14, speed: 5 });
      }
      b.root.rotation.y = Math.atan2(-dir.x, -dir.z);
      G.audio.playAt('die', z.pos, { gain: 0.9 });
      G.events.emit('zombie:killed', { z, part });
    }
    function clear() { for (const z of list) { z.alive = false; z.dying = 0; z.body.root.visible = false; z.body.root.rotation.x = 0; z.body.barBg.visible = false; } }
    // Hit flash turns the whole body solid red (the distance readout); otherwise only the eyes glow.
    function setFlash(z, on) {
      const m = z.body.mats;
      for (const k of ['skin', 'shirt', 'pants']) m[k].emissive.setHex(on ? 0xd01810 : 0);
      const f = m.face; const wantMap = on ? null : BZ.tex('eyes_glow');
      if (f.emissiveMap !== wantMap) { f.emissiveMap = wantMap; f.needsUpdate = true; }
      f.emissive.setHex(on ? 0xd01810 : f.userData.eye || 0xff3020);
    }
    const aliveCount = () => list.reduce((a, z) => a + (z.alive ? 1 : 0), 0);

    return { list, spawn, update, hitTest, damage, clear, aliveCount, debug: () => ({ alive: aliveCount() }) };
  };
})();
