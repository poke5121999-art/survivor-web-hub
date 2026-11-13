// Blocky zombies: a pool of box-rigged bodies, a flow-field chase, telegraphed swipes.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const TYPES = {
    walker: { hp: 100, speed: 2.1, dmg: 12, rate: 1.1, windup: 0.4, scale: 1, skin: 'z_skin', face: 'z_face', shirt: ['z_vest', 'z_shirt_red', 'z_shirt_dark'], pants: ['z_pants', 'z_pants_brown'], coin: 10, score: 100, voice: 'groan', eye: 0xff3020, hunch: 0.08, droop: 0.5 },
    runner: { hp: 60, speed: 4.3, dmg: 8, rate: 0.8, windup: 0.28, scale: 0.92, skin: 'z_skin_runner', face: 'z_face_runner', shirt: ['z_shirt_red'], pants: ['z_pants_dark', 'z_pants'], coin: 15, score: 150, voice: 'screech', eye: 0xffd23a, hunch: 0.38, droop: 0.15 },
    flyer: { hp: 45, speed: 7, dmg: 8, rate: 0.9, windup: 0.22, scale: 0.85, fly: true, skin: 'z_skin_runner', face: 'z_face_runner', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 20, score: 200, voice: 'screech', eye: 0xff40ff, hunch: 0.5, droop: 0 },
    brute: { hp: 480, speed: 1.6, dmg: 30, rate: 1.7, windup: 0.6, scale: 1.45, skin: 'z_skin_brute', face: 'z_face_brute', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 50, score: 500, voice: 'roar', eye: 0xff2a10, hunch: 0.15, droop: 0 },
  };
  BZ.ZOMBIES = TYPES;

  // Wave plan. n starts at 1.
  BZ.WAVE = {
    count: (n) => Math.min(16 + 6 * n, 140),
    runnerShare: (n) => (n < 2 ? 0 : Math.min(0.4, 0.08 * (n - 1))),
    bruteShare: (n) => (n < 4 ? 0 : Math.min(0.15, 0.04 * (n - 3))),
    hpMul: (n) => Math.min(3, 1 + 0.09 * (n - 1)),
    dmgMul: (n) => Math.min(2, 1 + 0.05 * (n - 1)),
    maxAlive: (n) => Math.min(22 + 3 * n, 44),
    flyerShare: (n) => Math.min(0.3, 0.12 + 0.03 * n),
    spawnGap: (n) => Math.max(0.15, 0.6 - 0.05 * n),
  };

  const geo = (w, h, d, py) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, py, 0); return g; };
  const G_LEG = geo(0.26, 0.75, 0.26, -0.375);
  const G_TORSO = geo(0.52, 0.7, 0.3, 0.35);
  const G_ARM = geo(0.2, 0.7, 0.2, -0.32);
  const G_HEAD = geo(0.5, 0.5, 0.5, 0.25);
  const G_WING_L = new THREE.BoxGeometry(1.1, 0.04, 0.55); G_WING_L.translate(-0.55, 0, 0);
  const G_WING_R = new THREE.BoxGeometry(1.1, 0.04, 0.55); G_WING_R.translate(0.55, 0, 0);

  const BAR_GEO = new THREE.PlaneGeometry(0.7, 0.09);

  BZ.makeZombies = (G) => {
    const POOL = 52;
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
      const wingMat = new THREE.MeshLambertMaterial({ map: BZ.tex('z_wing'), side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(G_WING_L, wingMat); wingL.position.set(-0.2, 0.6, -0.12); hips.add(wingL);
      const wingR = new THREE.Mesh(G_WING_R, wingMat); wingR.position.set(0.2, 0.6, -0.12); hips.add(wingR);
      root.traverse((o) => { if (o.isMesh) { o.castShadow = G.quality.shadow > 0; o.receiveShadow = false; } });
      root.visible = false;
      G.scene.add(root);
      const barBg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0x1a0c08, depthWrite: false }));
      const barFg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0xe8402c, depthWrite: false }));
      barFg.position.z = 0.002; barBg.add(barFg); barBg.visible = false; barBg.renderOrder = 5; barFg.renderOrder = 6; G.scene.add(barBg);
      return { root, hips, legL, legR, armL, armR, torso, head, mats, barBg, barFg, wingL, wingR };
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
      z.pos.set(gate.x + G.rng.range(-1.2, 1.2), T.fly ? G.rng.range(6, 9) : 0, gate.z + G.rng.range(-1.2, 1.2));
      z.fallV = 0; z.bob = G.rng.range(0, 6);
      z.fp = z.fp || BZ.spring(110, 9); z.fr = z.fr || BZ.spring(110, 9); z.hs = z.hs || BZ.spring(140, 8);
      z.fp.reset(); z.fr.reset(); z.hs.reset(); z.down = 0; z.slowT = 0; z.legDmg = 0; z.limp = false; z.armsLeft = 2;
      z.body.armL.visible = z.body.armR.visible = true;
      z.vel.set(0, 0, 0);
      z.yaw = Math.atan2(-gate.dir[0], -gate.dir[1]);
      z.phase = G.rng.range(0, 6); z.attackT = 0; z.windT = -1; z.flash = 0; z.voiceT = G.rng.range(1, 5); z.stuck = 0;
      const b = z.body;
      b.root.visible = true; b.root.scale.setScalar(T.scale); b.head.visible = true; b.wingL.visible = b.wingR.visible = !!T.fly;
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
        if (T.fly) { flyer(z, dt, P); continue; }
        // knocked down: fall back, lie a moment, get up
        if (z.down > 0) {
          z.down -= dt; const p = z.down; const lie = p > z.downMax - 0.25 ? (z.downMax - p) / 0.25 : p < 0.4 ? p / 0.4 : 1;
          z.body.root.rotation.x = -lie * 1.4; z.vel.multiplyScalar(Math.pow(0.02, dt)); z.vel.y = 0;
          G.world.moveBox(z.pos, z.vel, dt, 0.32 * T.scale, 1.8, out); z.pos.y = 0;
          z.body.root.position.copy(z.pos); z.windT = -1;
          continue;
        }
        z.body.root.rotation.x = 0;
        z.slowT = Math.max(0, z.slowT - dt);
        // target: the player, unless a hired soldier is right next to this zombie and closer
        const pd = Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z);
        const ally = G.allies && G.allies.nearest(z.pos, 3.5);
        const tgt = ally && Math.hypot(ally.pos.x - z.pos.x, ally.pos.z - z.pos.z) < pd ? ally : null;
        const tp = tgt ? tgt.pos : P.pos;
        const dx = tp.x - z.pos.x; const dz = tp.z - z.pos.z;
        const dist = Math.hypot(dx, dz);
        const reach = 1.25 * T.scale;
        const canHit = dist < reach + 0.15 && tp.y < 1.9 * T.scale && (tgt ? tgt.alive : P.alive);

        // steering
        let sx = 0; let sz = 0;
        if (tgt || (dist < 5 && G.world.lineOfSight(new THREE.Vector3(z.pos.x, 1.2, z.pos.z), new THREE.Vector3(P.pos.x, 1.2, P.pos.z)))) { sx = dx; sz = dz; }
        else if (G.world.flowDir(z.pos.x, z.pos.z, tmp)) { sx = tmp[0]; sz = tmp[1]; }
        else { sx = dx; sz = dz; }
        const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
        // separation
        for (const o of alive) {
          if (o === z || o.T.fly) continue;
          const ox = z.pos.x - o.pos.x; const oz = z.pos.z - o.pos.z; const d2 = ox * ox + oz * oz;
          const minD = 0.75 * (T.scale + o.T.scale) * 0.6;
          if (d2 < minD * minD && d2 > 1e-6) { const d = Math.sqrt(d2); sx += (ox / d) * (minD - d) * 2.5; sz += (oz / d) * (minD - d) * 2.5; }
        }
        const attacking = z.windT >= 0;
        const want = attacking || dist < reach * 0.8 ? 0 : z.speed * (z.slowT > 0 ? 0.35 : 1) * (z.limp ? 0.55 : 1);
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
            if (dist < reach + 0.45 && tp.y < 1.9 * T.scale) { if (tgt) G.allies.hurt(tgt, z.dmg); else G.events.emit('player:hurt', { dmg: z.dmg, from: z.pos }); }
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
        const fp = z.fp.step(dt); const fr = z.fr.step(dt); const hs = z.hs.step(dt);
        b.hips.rotation.z = Math.sin(z.phase) * (z.limp ? 0.2 : 0.05) + fr; b.hips.rotation.x = T.hunch + fp;
        if (z.limp) { b.legR.rotation.x = -T.hunch + 0.5; b.hips.position.y -= Math.abs(Math.sin(z.phase)) * 0.08; }
        b.head.rotation.x = hs;
        b.hips.position.y = 0.75 + Math.abs(Math.cos(z.phase)) * 0.04;
        b.head.rotation.z = Math.sin(z.phase * 0.7) * 0.15 + fr * 0.5;
        b.root.position.copy(z.pos); b.root.rotation.y = z.yaw;
        if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) setFlash(z, false); }
        const bar = b.barBg; bar.visible = z.hp < z.maxHp;
        if (bar.visible) { bar.position.set(z.pos.x, 2.2 * T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
      }
      // death animation: flyers drop out of the sky first; then fall back, sink, return to pool
      for (const z of list) {
        if (!z.dying) continue;
        if (z.pos.y > 0) {
          z.fallV -= 22 * dt; z.pos.y = Math.max(0, z.pos.y + z.fallV * dt); z.body.root.position.y = z.pos.y; z.body.root.rotation.z += dt * 7; z.dying = 0.001;
          if (z.pos.y === 0) { G.fx.burst(new THREE.Vector3(z.pos.x, 0.2, z.pos.z), 6, [0x6e4428, 0x8a5a35], { size: 0.1 }); G.audio.playAt('land', z.pos, { gain: 0.6 }); }
          continue;
        }
        z.dying += dt;
        const b = z.body;
        b.root.rotation.x = -Math.min(1, z.dying / 0.35) * Math.PI / 2;
        if (z.dying > 1.2) b.root.position.y = -(z.dying - 1.2) * 0.8;
        if (z.dying > 2.2) { z.dying = 0; b.root.visible = false; b.root.rotation.x = 0; b.root.position.y = 0; }
      }
    }

    // Flyers: cruise above the roofs toward the player, then dive at head height, swipe, and climb away.
    function flyer(z, dt, P) {
      const T = z.T; const b = z.body;
      const tx = P.pos.x; const tz = P.pos.z; const head = P.pos.y + 1.2;
      const dx = tx - z.pos.x; const dz = tz - z.pos.z; const d = Math.hypot(dx, dz);
      z.bob += dt;
      const climbing = z.attackT > T.rate - 0.6;
      const alt = climbing ? 6 : d > 9 ? 5.5 + Math.sin(z.bob * 1.7) * 0.6 : BZ.lerp(head, 5.5, BZ.clamp((d - 2) / 7, 0, 1));
      const sp = climbing ? z.speed * 0.6 : z.speed;
      let vx = d > 0.01 ? (dx / d) * sp : 0; let vz = d > 0.01 ? (dz / d) * sp : 0;
      if (climbing) { vx = -vx * 0.8; vz = -vz * 0.8; }
      for (const o of list) {
        if (o === z || !o.alive || !o.T.fly) continue;
        const ox = z.pos.x - o.pos.x; const oz = z.pos.z - o.pos.z; const oy = z.pos.y - o.pos.y; const d2 = ox * ox + oy * oy + oz * oz;
        if (d2 < 1.6 && d2 > 1e-6) { vx += ox * 3; vz += oz * 3; }
      }
      z.vel.x = BZ.damp(z.vel.x, vx, 3, dt); z.vel.z = BZ.damp(z.vel.z, vz, 3, dt); z.vel.y = BZ.damp(z.vel.y, (alt - z.pos.y) * 3, 4, dt);
      z.pos.addScaledVector(z.vel, dt);
      z.pos.y = Math.max(0.6, z.pos.y);
      z.yaw += BZ.wrapAngle(Math.atan2(dx, dz) - z.yaw) * Math.min(1, dt * 6);
      // attack
      const d3 = Math.hypot(dx, head - (z.pos.y + 1.0 * T.scale), dz);
      z.attackT -= dt;
      if (z.windT < 0 && d3 < 1.6 && z.attackT <= 0 && P.alive) { z.windT = 0; G.audio.playAt('screech', z.pos, { gain: 0.8, rate: 1.2 }); }
      if (z.windT >= 0) {
        z.windT += dt;
        if (z.windT >= T.windup) { z.windT = -1; z.attackT = T.rate; if (d3 < 2.1) G.events.emit('player:hurt', { dmg: z.dmg, from: z.pos }); }
      }
      z.voiceT -= dt;
      if (z.voiceT <= 0) { z.voiceT = G.rng.range(2, 5); G.audio.playAt('screech', z.pos, { gain: 0.6, rate: 1.3 }); }
      // pose
      const flap = Math.sin(z.bob * 16);
      b.wingL.rotation.z = -0.25 + flap * 0.7; b.wingR.rotation.z = 0.25 - flap * 0.7;
      b.legL.rotation.x = 0.4 + flap * 0.1; b.legR.rotation.x = 0.5 - flap * 0.1;
      b.armL.rotation.x = -Math.PI / 2 - (z.windT >= 0 ? 0.8 : 0); b.armR.rotation.x = b.armL.rotation.x;
      b.hips.rotation.x = 0.55; b.hips.position.y = 0.75;
      b.root.position.copy(z.pos); b.root.rotation.y = z.yaw;
      if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) setFlash(z, false); }
      const bar = b.barBg; bar.visible = z.hp < z.maxHp;
      if (bar.visible) { bar.position.set(z.pos.x, z.pos.y + 2.1 * T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
    }

    // Hit boxes in world space (bodies are upright; axis-aligned boxes are close enough for blocks).
    function hitTest(o, d, maxT, skip) {
      let best = null;
      for (const z of list) {
        if (!z.alive || (skip && skip.has(z))) continue;
        const s = z.T.scale;
        const y = z.pos.y; const wide = z.T.fly ? 0.6 : 0.34;
        const legTop = z.T.fly || z.down > 0 ? 0 : 0.75 * s;
        const boxes = [
          { part: 'body', min: [z.pos.x - wide * s, y + legTop, z.pos.z - wide * s], max: [z.pos.x + wide * s, y + 1.45 * s, z.pos.z + wide * s] },
        ];
        if (legTop) boxes.push({ part: 'leg', min: [z.pos.x - 0.3 * s, y, z.pos.z - 0.3 * s], max: [z.pos.x + 0.3 * s, y + legTop, z.pos.z + 0.3 * s] });
        if (!z.headless) boxes.push({ part: 'head', min: [z.pos.x - 0.27 * s, y + 1.43 * s, z.pos.z - 0.27 * s], max: [z.pos.x + 0.27 * s, y + 1.97 * s, z.pos.z + 0.27 * s] });
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

    // Hit reaction scales with how hard the hit was (share of max hp), the round's impulse, and where it landed.
    function damage(z, amount, part, dir, imp = 1) {
      if (!z.alive) return false;
      z.hp -= amount; z.flash = 0.09; setFlash(z, true);
      const T = z.T; const k = BZ.clamp(amount / z.maxHp, 0, 1); const heavy = T === TYPES.brute ? 0.45 : 1;
      const y = part === 'head' ? 1.7 : part === 'leg' ? 0.45 : 1.05;
      const at = new THREE.Vector3(z.pos.x, z.pos.y + y * T.scale, z.pos.z);
      const n = Math.round(4 + k * 18 + (part === 'head' ? 6 : 0));
      G.fx.burst(at, n, [0xb3201a, 0x7a1410, 0x5f8f3e], { dir, push: 1.5 + 3 * k * imp, size: 0.07 + 0.08 * k, speed: 3 + 3 * k });
      z.vel.addScaledVector(dir, (0.8 + 5 * k) * imp * heavy / T.scale);
      // which side was hit: dir crossed with the zombie's facing
      const side = Math.sign(dir.x * Math.cos(z.yaw) - dir.z * Math.sin(z.yaw)) || 1;
      if (z.fp) {
        if (part === 'head') { z.hs.v -= (10 + 40 * k) * imp * heavy; z.fp.v -= (2 + 8 * k) * imp * heavy; }
        else if (part === 'leg') {
          z.fp.v += (6 + 14 * k) * heavy; z.fr.v += side * 4; z.slowT = Math.max(z.slowT, 0.5 + 1.5 * k);
          z.legDmg += amount; if (!z.limp && z.legDmg > 0.45 * z.maxHp && T !== TYPES.runner) z.limp = true;
        } else { z.fp.v -= (5 + 30 * k) * imp * heavy; z.fr.v += side * (3 + 12 * k) * imp * heavy; }
        // a big enough hit knocks it over (not brutes, not flyers)
        if (!T.fly && T !== TYPES.brute && z.hp > 0 && k * imp > 0.45 && z.down <= 0) { z.down = z.downMax = 0.9 + 0.6 * k; }
        // a heavy body hit can tear an arm off
        if (part === 'body' && amount >= 30 && z.armsLeft > 0 && G.rng.chance(0.2 + k * 0.4)) {
          const arm = z.body.armL.visible && (side > 0 || !z.body.armR.visible) ? z.body.armL : z.body.armR;
          if (arm.visible) {
            arm.visible = false; z.armsLeft--;
            const ap = arm.getWorldPosition(new THREE.Vector3());
            G.fx.burst(ap, 10, [0x9db08a, 0x7c8f6c, 0xb3201a], { dir, push: 3, size: 0.12, speed: 4 });
          }
        }
      }
      if (z.hp <= 0) { kill(z, part, dir); return true; }
      return false;
    }
    function kill(z, part, dir) {
      z.alive = false; z.dying = 0.001;
      const b = z.body;
      setFlash(z, false); b.barBg.visible = false;
      if (part === 'head') {
        z.headless = true; b.head.visible = false;
        const at = new THREE.Vector3(z.pos.x, z.pos.y + 1.7 * z.T.scale, z.pos.z);
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
