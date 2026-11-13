// Blocky zombies: a pool of box-rigged bodies, a flow-field chase, telegraphed swipes.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const TYPES = {
    walker: { hp: 100, speed: 2.1, dmg: 12, rate: 1.1, windup: 0.4, scale: 1, skin: 'z_skin', face: 'z_face', shirt: ['z_vest', 'z_shirt_red', 'z_shirt_dark'], pants: ['z_pants', 'z_pants_brown'], coin: 10, score: 100, voice: 'groan', eye: 0xff3020, hunch: 0.08, droop: 0.5 },
    runner: { hp: 60, speed: 4.3, dmg: 8, rate: 0.8, windup: 0.28, scale: 0.92, skin: 'z_skin_runner', face: 'z_face_runner', shirt: ['z_shirt_red'], pants: ['z_pants_dark', 'z_pants'], coin: 15, score: 150, voice: 'screech', eye: 0xffd23a, hunch: 0.38, droop: 0.15 },
    flyer: { hp: 45, speed: 7, dmg: 8, rate: 0.9, windup: 0.22, scale: 0.85, fly: true, skin: 'z_skin_flyer', face: 'z_face_flyer', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 20, score: 200, voice: 'screech', eye: 0xff40ff, hunch: 0.5, droop: 0 },
    giant: { hp: 2600, speed: 1.9, dmg: 35, rate: 2.0, windup: 0.7, scale: 2.5, skin: 'z_skin_brute', face: 'z_face_brute', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 300, score: 3000, voice: 'roar', eye: 0xff2a10, hunch: 0.2, droop: 0, boss: 'giant', name: 'KHỔNG LỒ' },
    thrower: { hp: 1700, speed: 1.6, dmg: 20, rate: 1.4, windup: 0.5, scale: 1.9, skin: 'z_skin', face: 'z_face_brute', shirt: ['z_vest'], pants: ['z_pants'], coin: 250, score: 2500, voice: 'roar', eye: 0xffa020, hunch: 0.15, droop: 0, boss: 'thrower', name: 'KẺ NÉM ĐÁ' },
    phantom: { hp: 1300, speed: 3.2, dmg: 22, rate: 1.0, windup: 0.3, scale: 1.5, skin: 'z_skin_flyer', face: 'z_face_flyer', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 250, score: 2500, voice: 'screech', eye: 0x80ffff, hunch: 0.3, droop: 0.2, boss: 'phantom', name: 'BÓNG MA' },
    queen: { hp: 1400, speed: 6, dmg: 18, rate: 1.2, windup: 0.3, scale: 2.0, fly: true, skin: 'z_skin_flyer', face: 'z_face_flyer', shirt: ['z_shirt_dark'], pants: ['z_pants_dark'], coin: 300, score: 3000, voice: 'screech', eye: 0xff40ff, hunch: 0.5, droop: 0, boss: 'queen', name: 'CHÚA DƠI' },
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

  const G_STUMP = geo(0.22, 0.12, 0.22, -0.03);
  const G_NECK = geo(0.3, 0.08, 0.26, 0.04);
  const BAR_GEO = new THREE.PlaneGeometry(0.7, 0.09);
  const HALO_MAT = new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xc050ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

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
      const wingMat = new THREE.MeshLambertMaterial({ map: BZ.tex('z_wing'), side: THREE.DoubleSide, emissive: 0x6a2a9a, emissiveMap: BZ.tex('z_wing'), transparent: true, alphaTest: 0.5 });
      const halo = new THREE.Sprite(HALO_MAT); halo.position.y = 1.2; halo.scale.set(3.2, 3.2, 1); halo.visible = false; root.add(halo);
      const wingL = new THREE.Mesh(G_WING_L, wingMat); wingL.position.set(-0.2, 0.6, -0.12); hips.add(wingL);
      const wingR = new THREE.Mesh(G_WING_R, wingMat); wingR.position.set(0.2, 0.6, -0.12); hips.add(wingR);
      const meat = BZ.mat('z_meat'); const stumps = {};
      for (const [k, x, y, g] of [['armL', -0.36, 0.64, G_STUMP], ['armR', 0.36, 0.64, G_STUMP], ['legL', -0.13, 0, G_STUMP], ['legR', 0.13, 0, G_STUMP], ['head', 0, 0.7, G_NECK]]) {
        const m = new THREE.Mesh(g, meat); m.position.set(x, y, 0); m.visible = false; hips.add(m); stumps[k] = m;
      }
      root.traverse((o) => { if (o.isMesh) { o.castShadow = G.quality.shadow > 0; o.receiveShadow = false; } });
      root.visible = false;
      G.scene.add(root);
      const barBg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0x1a0c08, depthWrite: false }));
      const barFg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0xe8402c, depthWrite: false }));
      barFg.position.z = 0.002; barBg.add(barFg); barBg.visible = false; barBg.renderOrder = 5; barFg.renderOrder = 6; G.scene.add(barBg);
      const B = { root, hips, legL, legR, armL, armR, torso, head, mats, barBg, barFg, wingL, wingR, halo, stumps };
      BZ.zExtras(G, B);
      return B;
    }
    for (let i = 0; i < POOL; i++) list.push({ alive: false, body: makeBody(), pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    const K = BZ.makeZKinds(G, { list, spawn: (...a) => spawn(...a), hurtP: (...a) => hurtP(...a), damage: (...a) => damage(...a), kill: (...a) => kill(...a), applyStatus: (...a) => applyStatus(...a) });

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
      z.hp = z.maxHp = Math.round(T.hp * BZ.WAVE.hpMul(wave) * (G.env ? G.env.zHp : 1));
      z.dmg = Math.round(T.dmg * BZ.WAVE.dmgMul(wave));
      z.speed = T.speed * G.rng.range(0.9, 1.1);
      z.pos.set(gate.x + G.rng.range(-1.2, 1.2), T.fly ? G.rng.range(6, 9) : 0, gate.z + G.rng.range(-1.2, 1.2));
      z.fallV = 0; z.bob = G.rng.range(0, 6); z.landed = true; z.climb = null; z.wallT = 0; z.leap = null; z.abT = T.boss ? 3 : 0; z.rock = 0;
      z.fp = z.fp || BZ.spring(110, 9); z.fr = z.fr || BZ.spring(110, 9); z.hs = z.hs || BZ.spring(140, 8);
      z.fp.reset(); z.fr.reset(); z.hs.reset(); z.down = 0; z.slowT = 0; z.legDmg = 0; z.limp = false; z.armsLeft = 2;
      z.crawl = false; z.legHits = { legL: 0, legR: 0 }; z.frozen = 0; z.chillT = 0; z.st = {}; z.stFlags = 0;
      K.init(z, T, wave);
      for (const k of ['armL', 'armR', 'legL', 'legR', 'torso']) z.body[k].visible = true;
      for (const s of Object.values(z.body.stumps)) { s.visible = false; s.material = BZ.mat('z_meat'); }
      z.vel.set(0, 0, 0);
      z.yaw = Math.atan2(-gate.dir[0], -gate.dir[1]);
      z.phase = G.rng.range(0, 6); z.attackT = 0; z.windT = -1; z.flash = 0; z.voiceT = G.rng.range(1, 5); z.stuck = 0;
      const b = z.body;
      b.root.visible = true; b.root.scale.setScalar(T.scale); b.head.visible = true; b.wingL.visible = b.wingR.visible = b.halo.visible = !!T.fly;
      b.root.rotation.set(0, z.yaw, 0); b.root.position.copy(z.pos);
      setFlash(z, false);
      return z;
    }

    const tmp = [0, 0];
    const out = {};
    const fallV = new THREE.Vector3();

    // ---- human towers: climb onto a zombie that is pressed against the wall, ride it, spill over the ledge ----
    function tryClimb(z, alive) {
      if (z.climb || z.pos.y > 0.4) return;
      let best = null; let bestTop = -1;
      for (const o of alive) {
        if (o === z || o.T.fly || o.T.boss || o.T.noTower || !o.alive || (o.wallT < 0.4 && !o.climb)) continue;
        let p = o; let loop = 0; while (p && loop++ < 8) { if (p === z) break; p = p.climb; } if (p === z) continue;
        const d = Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z);
        const top = o.pos.y + 1.5 * o.T.scale;
        if (d < 1.0 && top > bestTop && !alive.some((q) => q.climb === o)) { best = o; bestTop = top; }
      }
      if (!best) return;
      z.climb = best; z.climbT = 0;
      z.climbOff = new THREE.Vector3(z.pos.x - best.pos.x, 0, z.pos.z - best.pos.z).multiplyScalar(0.25);
      G.audio.playAt('land', z.pos, { gain: 0.35, rate: 1.3 });
    }
    function ride(z, dt, P, dx, dz, dist) {
      const s = z.climb;
      if (!s.alive || s.dying) { z.climb = null; z.landed = true; return; }
      z.climbT += dt;
      const k = Math.min(1, z.climbT / 0.45);
      const toward = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(0.18);
      z.pos.x = BZ.damp(z.pos.x, s.pos.x + z.climbOff.x + toward.x, 10, dt); z.pos.z = BZ.damp(z.pos.z, s.pos.z + z.climbOff.z + toward.z, 10, dt);
      z.pos.y = BZ.lerp(z.pos.y, s.pos.y + 1.45 * s.T.scale, k);
      z.vel.set(0, 0, 0);
      // high enough: haul over the edge onto the roof the player stands on
      if (k >= 1 && z.pos.y + 1.4 >= P.pos.y) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        for (const step of [0.8, 1.1, 1.5, 2.0]) {
          const c = z.pos.clone().addScaledVector(dir, step); c.y = P.pos.y + 0.02;
          const r = 0.32 * z.T.scale;
          if (!G.world.overlaps([c.x - r, c.y, c.z - r], [c.x + r, c.y + 1.8, c.z + r])) {
            z.pos.copy(c); z.climb = null; z.fp.v += 8; G.audio.playAt(z.T.voice, z.pos, { gain: 0.8 });
            break;
          }
        }
      }
    }

    // ---- bosses: each has one special move; returns true when it owns this frame's movement ----
    function boss(z, dt, P, dist) {
      const T = z.T; const b = z.body;
      z.abT -= dt;
      if (T.boss === 'giant') {
        if (z.leap) {
          const L = z.leap; L.t += dt; const k = Math.min(1, L.t / L.dur);
          z.pos.lerpVectors(L.from, L.to, k); z.pos.y = BZ.lerp(L.from.y, L.to.y, k) + Math.sin(Math.PI * k) * L.h;
          b.hips.rotation.x = -0.4 + k * 0.6; b.armL.rotation.x = b.armR.rotation.x = -Math.PI * 0.9;
          b.root.position.copy(z.pos); b.root.rotation.y = z.yaw;
          if (k >= 1) {
            z.leap = null; z.abT = 6;
            G.fx.burst(z.pos.clone().setY(z.pos.y + 0.2), 30, [0x6e6a64, 0x8a8478, 0x4a4640], { speed: 7, size: 0.2, life: 1 });
            G.audio.playAt('boom', z.pos, { gain: 1, rate: 0.7 });
            const d = P.pos.distanceTo(z.pos);
            if (d < 4.5 && P.alive) { hurtP(P, Math.round(30 * (1 - d / 6)), z.pos); P.vel.add(new THREE.Vector3(P.pos.x - z.pos.x, 0, P.pos.z - z.pos.z).normalize().multiplyScalar(7)); P.vel.y = 6; }
            if (d < 25) P.shake.v += (25 - d) * 0.6;
          }
          return true;
        }
        if (z.abT <= 0 && (P.pos.y - z.pos.y > 1.6 || dist > 9) && dist < 26 && P.alive) {
          const to = P.pos.clone().add(new THREE.Vector3(G.rng.range(-1, 1), 0.02, G.rng.range(-1, 1)));
          z.leap = { t: 0, dur: 0.9 + dist * 0.03, from: z.pos.clone(), to, h: 5 + Math.max(0, P.pos.y - z.pos.y) };
          z.yaw = Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z);
          G.audio.playAt('roar', z.pos, { gain: 1.1 });
          return true;
        }
      } else if (T.boss === 'thrower') {
        if (z.rock > 0) {
          z.rock += dt; z.vel.set(0, 0, 0);
          b.armL.rotation.x = b.armR.rotation.x = -Math.PI * (0.6 + 0.45 * Math.min(1, z.rock / 0.6));
          z.yaw = Math.atan2(P.pos.x - z.pos.x, P.pos.z - z.pos.z); b.root.rotation.y = z.yaw;
          if (z.rock >= 0.6) {
            z.rock = 0; z.abT = 2.4;
            const from = z.pos.clone().add(new THREE.Vector3(0, 3.3 * T.scale / 1.9, 0));
            G.gear.throwRock(from, P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(P.vel, 0.4), z);
            G.audio.playAt('swipe', z.pos, { gain: 1, rate: 0.6 });
          }
          return true;
        }
        if (z.abT <= 0 && dist < 38 && P.alive && G.world.lineOfSight(new THREE.Vector3(z.pos.x, z.pos.y + 3, z.pos.z), new THREE.Vector3(P.pos.x, P.pos.y + 1.4, P.pos.z))) { z.rock = 0.001; return true; }
      } else if (T.boss === 'phantom') {
        b.root.visible = !(z.abT < 0.6 && z.abT > 0 && Math.sin(z.abT * 60) > 0);
        if (z.abT <= 0 && dist > 3 && P.alive) {
          for (let i = 0; i < 10; i++) {
            const a = G.rng.range(0, Math.PI * 2); const r = G.rng.range(2, 3.2);
            const c = new THREE.Vector3(P.pos.x + Math.cos(a) * r, P.pos.y + 0.02, P.pos.z + Math.sin(a) * r);
            const s = 0.32 * T.scale;
            if (Math.abs(c.x) > G.world.HALF - 1 || Math.abs(c.z) > G.world.HALF - 1) continue;
            if (G.world.overlaps([c.x - s, c.y, c.z - s], [c.x + s, c.y + 1.8, c.z + s])) continue;
            const puff = (p) => G.fx.burst(p.clone().setY(p.y + 1.2), 22, [0x8a40ff, 0x40e0ff, 0x2a1a4a], { speed: 4, size: 0.18, life: 0.8, grav: -2 });
            puff(z.pos); z.pos.copy(c); puff(z.pos); z.vel.set(0, 0, 0); z.abT = 4.5;
            G.audio.playAt('screech', z.pos, { gain: 1, rate: 0.7 });
            b.root.visible = true;
            break;
          }
        }
      }
      return false;
    }

    // In co-op the host's zombies pick the nearest living player; guests have pos/vel/shake stand-ins.
    function pick(z, dt) {
      const C = G.coop; if (!C || !C.host) return G.player;
      z.tgtT = (z.tgtT || 0) - dt;
      if (z.tgtT > 0 && z.tgt && (z.tgt === G.player || C.remotes().includes(z.tgt))) return z.tgt;
      z.tgtT = 0.5; let best = G.player; let bd = G.player.alive ? Math.hypot(G.player.pos.x - z.pos.x, G.player.pos.z - z.pos.z) : 1e9;
      for (const r of C.remotes()) { if (!r.alive) continue; const d = Math.hypot(r.pos.x - z.pos.x, r.pos.z - z.pos.z); if (d < bd) { bd = d; best = r; } }
      return (z.tgt = best);
    }
    const hurtP = (P, dmg, from, fx) => { if (P.remote) G.coop.hurtRemote(P, dmg, from, fx); else { G.events.emit('player:hurt', { dmg, from }); K.playerFx(P, fx); } };
    // root, facing and the health bar for a zombie whose special move owned this frame
    function finish(z) {
      const b = z.body; b.root.position.copy(z.pos); b.root.rotation.y = z.yaw;
      if (z.flash > 0) { z.flash -= 0.016; if (z.flash <= 0) setFlash(z, false); }
      const bar = b.barBg; bar.visible = z.hp < z.maxHp;
      if (bar.visible) { bar.position.set(z.pos.x, z.pos.y + 2.2 * z.T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
    }
    function update(dt) {
      K.update(dt);
      if (G.coop && G.coop.guest) { puppets(dt); return; }
      const P0 = G.player;
      flowT.t -= dt;
      if (flowT.t <= 0) { G.world.updateFlow(P0.pos.x, P0.pos.z); flowT.t = 0.25; }
      const alive = list.filter((z) => z.alive);
      for (const z of alive) {
        const T = z.T; const P = pick(z, dt);
        tickStatus(z, dt);
        if (!z.alive) continue;
        K.tick(z, dt);
        if (z.frozen > 0) { frozenStep(z, dt); continue; }
        z.chillT = Math.max(0, (z.chillT || 0) - dt);
        if (T.fly) { flyer(z, dt, P); continue; }
        // knocked down: fall back, lie a moment, get up
        if (z.down > 0 && !z.crawl) {
          z.down -= dt; const p = z.down; const lie = p > z.downMax - 0.25 ? (z.downMax - p) / 0.25 : p < 0.4 ? p / 0.4 : 1;
          z.body.root.rotation.x = -lie * 1.4; z.vel.multiplyScalar(Math.pow(0.02, dt)); z.vel.y = 0;
          z.vel.y -= 22 * dt; G.world.moveBox(z.pos, z.vel, dt, 0.32 * T.scale, 1.8, out, 0.5);
          z.body.root.position.copy(z.pos); z.windT = -1; z.climb = null;
          continue;
        }
        z.body.root.rotation.x = 0;
        z.slowT = Math.max(0, z.slowT - dt);
        // target: the player, unless a hired soldier is right next to this zombie and closer
        const pd = Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z);
        const ally = G.allies && G.allies.nearest(z.pos, 3.5);
        let tgt = ally && Math.hypot(ally.pos.x - z.pos.x, ally.pos.z - z.pos.z) < pd ? ally : null;
        const dec = G.hero && G.hero.decoy;
        if (dec && Math.hypot(dec.pos.x - z.pos.x, dec.pos.z - z.pos.z) < 14) tgt = dec;
        const gh = G.hero && G.hero.ghost(P); if (gh) tgt = gh;
        const tp = tgt ? tgt.pos : P.pos;
        const dx = tp.x - z.pos.x; const dz = tp.z - z.pos.z;
        const dist = Math.hypot(dx, dz);
        const reach = 1.25 * T.scale;
        const dy = tp.y - z.pos.y;
        const canHit = dist < reach + 0.15 && dy > -1.2 && dy < 1.6 * T.scale && (tgt ? tgt.alive : P.alive);
        if (T.kind && K.step(z, dt, gh || P, dist)) { K.pose(z, dt, Math.hypot(z.vel.x, z.vel.z)); finish(z); continue; }
        if (T.boss && boss(z, dt, P, dist)) continue;

        // steering
        let sx = 0; let sz = 0;
        if (tgt || z.pos.y > 0.9 || (dist < 5 && G.world.lineOfSight(new THREE.Vector3(z.pos.x, z.pos.y + 1.2, z.pos.z), new THREE.Vector3(P.pos.x, P.pos.y + 1.2, P.pos.z)))) { sx = dx; sz = dz; }
        else if (G.world.flowDir(z.pos.x, z.pos.z, tmp)) { sx = tmp[0]; sz = tmp[1]; }
        else { sx = dx; sz = dz; }
        const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
        // separation
        for (const o of alive) {
          if (o === z || o.T.fly || z.climb || o.climb || Math.abs(o.pos.y - z.pos.y) > 1) continue;
          const ox = z.pos.x - o.pos.x; const oz = z.pos.z - o.pos.z; const d2 = ox * ox + oz * oz;
          const minD = 0.75 * (T.scale + o.T.scale) * 0.6;
          if (d2 < minD * minD && d2 > 1e-6) { const d = Math.sqrt(d2); sx += (ox / d) * (minD - d) * 2.5; sz += (oz / d) * (minD - d) * 2.5; }
        }
        const attacking = z.windT >= 0;
        const want = attacking || dist < reach * 0.8 ? 0 : z.speed * (z.slowT > 0 ? 0.35 : 1) * (z.limp ? 0.55 : 1) * (z.crawl ? 0.38 : 1) * (z.chillT > 0 ? 0.75 : 1) * (G.env ? G.env.zSpeed : 1) * (z.hold ? 0 : 1) * (z.spdMul || 1) * (z.rage > 0 ? 1.35 : 1);
        const before = z.pos.x + z.pos.z;
        if (z.climb) ride(z, dt, P, dx, dz, dist);
        else {
          z.vel.x = BZ.damp(z.vel.x, sx * want, 8, dt); z.vel.z = BZ.damp(z.vel.z, sz * want, 8, dt); z.vel.y -= 22 * dt;
          G.world.moveBox(z.pos, z.vel, dt, 0.32 * T.scale, 1.8, out, 0.5);
          // the player is up out of reach: press against the wall and let others climb on top
          const elevated = !tgt && P.pos.y - z.pos.y > 1.6 && dist < 9;
          z.wallT = elevated && (out.hitX || out.hitZ || dist < 1.2) ? z.wallT + dt : Math.max(0, z.wallT - dt);
          if (elevated && z.pos.y < P.pos.y - 1 && T !== TYPES.brute && !z.crawl && !T.noTower) tryClimb(z, alive);
        }
        z.stuck = Math.abs(z.pos.x + z.pos.z - before) < want * dt * 0.1 && want > 0 ? z.stuck + dt : 0;

        const face = Math.atan2(dx, dz);
        const moveYaw = Math.hypot(z.vel.x, z.vel.z) > 0.3 && dist > 3 ? Math.atan2(z.vel.x, z.vel.z) : face;
        z.yaw += BZ.wrapAngle(moveYaw - z.yaw) * Math.min(1, dt * 8);

        // attack: windup (telegraph) then hit if still in reach
        z.attackT -= dt;
        if (!attacking && canHit && z.attackT <= 0 && !z.noMelee && z.dmg > 0) { z.windT = 0; G.audio.playAt('swipe', z.pos, { gain: 0.6 }); }
        if (z.windT >= 0) {
          z.windT += dt;
          if (z.windT >= T.windup) {
            z.windT = -1; z.attackT = T.rate * (z.rage > 0 ? 0.65 : 1);
            if (dist < reach + 0.45 && tp.y < 1.9 * T.scale) { if (tgt) { if (!tgt.isDecoy) G.allies.hurt(tgt, z.dmg); } else hurtP(P, z.dmg, z.pos, K.onMelee(z)); }
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
        const armBase = (z.climb || z.wallT > 0.4 ? -Math.PI * 0.95 : -Math.PI / 2) + Math.sin(z.phase * 0.5 + (z.climb ? 3 : 0)) * (z.climb ? 0.4 : 0.12);
        b.armL.rotation.x = armBase + T.droop - wind * (0.9 + T.droop) + (z.attackT > T.rate - 0.15 ? 0.9 : 0);
        b.armR.rotation.x = armBase - wind * 0.9 + Math.sin(z.phase * 0.5 + 1) * 0.1 + (z.attackT > T.rate - 0.15 ? 0.9 : 0);
        const fp = z.fp.step(dt); const fr = z.fr.step(dt); const hs = z.hs.step(dt);
        b.hips.rotation.z = Math.sin(z.phase) * (z.limp ? 0.2 : 0.05) + fr; b.hips.rotation.x = T.hunch + fp;
        if (z.limp) { b.legR.rotation.x = -T.hunch + 0.5; b.hips.position.y -= Math.abs(Math.sin(z.phase)) * 0.08; }
        b.head.rotation.x = hs;
        b.hips.position.y = 0.75 + Math.abs(Math.cos(z.phase)) * 0.04;
        b.head.rotation.z = Math.sin(z.phase * 0.7) * 0.15 + fr * 0.5;
        b.root.position.copy(z.pos); b.root.rotation.y = z.yaw;
        if (z.crawl) {
          const pull = Math.sin(z.phase * 1.6);
          b.root.rotation.x = 1.38; b.root.position.x -= Math.sin(z.yaw) * 0.85 * T.scale; b.root.position.z -= Math.cos(z.yaw) * 0.85 * T.scale; b.root.position.y += 0.16 * T.scale;
          b.armL.rotation.x = Math.PI - 0.35 + pull * 0.55 - wind * 0.6; b.armR.rotation.x = Math.PI - 0.35 - pull * 0.55 - wind * 0.6;
          b.legL.rotation.x = 0.1 + pull * 0.08; b.legR.rotation.x = 0.1 - pull * 0.08; b.hips.rotation.z = pull * 0.12; b.hips.rotation.x = fp * 0.3;
          b.head.rotation.x = -0.9 + hs; b.hips.position.y = 0.75;
        }
        if (T.kind) K.pose(z, dt, sp);
        if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) setFlash(z, false); }
        const bar = b.barBg; bar.visible = z.hp < z.maxHp;
        if (bar.visible) { bar.position.set(z.pos.x, z.pos.y + (z.crawl ? 0.9 : 2.2) * T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
      }
      // death animation: flyers drop out of the sky first; then fall back, sink, return to pool
      for (const z of list) {
        if (!z.dying) continue;
        if (!z.landed) {
          fallV.set(0, (z.fallV -= 22 * dt), 0);
          G.world.moveBox(z.pos, fallV, dt, 0.3, 1.0, out); z.fallV = fallV.y;
          z.body.root.position.copy(z.pos); if (z.T.fly) z.body.root.rotation.z += dt * 7; z.dying = 0.001;
          if (out.ground) { z.landed = true; G.fx.burst(new THREE.Vector3(z.pos.x, z.pos.y + 0.2, z.pos.z), 6, [0x6e4428, 0x8a5a35], { size: 0.1 }); if (z.pos.y < 0.01 || z.T.fly) G.audio.playAt('land', z.pos, { gain: 0.6 }); }
          continue;
        }
        z.dying += dt;
        const b = z.body;
        if (z.crawl) b.root.rotation.x = BZ.lerp(1.38, Math.PI / 2, Math.min(1, z.dying / 0.3));
        else if (z.T.quad) b.root.rotation.z = Math.min(1, z.dying / 0.3) * Math.PI / 2;
        else fall(z, b);
        b.root.position.y = z.pos.y + (z.crawl ? 0.12 * z.T.scale : 0) - Math.max(0, z.dying - 1.8) * 0.8;
        if (z.dying > 2.8) { z.dying = 0; b.root.visible = false; b.root.rotation.x = 0; b.root.rotation.z = 0; b.root.position.y = 0; b.hips.position.y = 0.75; b.hips.rotation.set(0, 0, 0); }
      }
    }

    // a body going down: thrown back, pitched forward onto its face, or buckling at the knees and tipping sideways
    const ease = (t) => t * t * (3 - 2 * t);
    function fall(z, b) {
      const t = z.dying; const k = z.deathK || 0;
      if (k === 0) { const e = ease(Math.min(1, t / 0.38)); b.root.rotation.x = -e * Math.PI / 2; b.armL.rotation.x = b.armR.rotation.x = -Math.PI / 2 - e * 1.1; b.head.rotation.x = -e * 0.5; }
      else if (k === 1) { const e = ease(Math.min(1, t / 0.5)); b.root.rotation.x = e * Math.PI / 2; b.armL.rotation.x = -0.4 - e * 2.4; b.armR.rotation.x = -0.2 - e * 2.2; b.head.rotation.x = e * 0.4; }
      else {
        const kn = ease(Math.min(1, t / 0.3)); const tip = ease(BZ.clamp((t - 0.3) / 0.4, 0, 1));
        b.hips.position.y = 0.75 - kn * 0.42; b.legL.rotation.x = b.legR.rotation.x = -kn * 1.45; b.hips.rotation.x = kn * 0.35 - tip * 0.2;
        b.armL.rotation.x = b.armR.rotation.x = -0.3 + kn * 0.3; b.head.rotation.x = kn * 0.6;
        b.root.rotation.z = tip * Math.PI / 2 * (z.phase > 3 ? 1 : -1);
      }
    }
    // Flyers: cruise above the roofs toward the player, then dive at head height, swipe, and climb away.
    function flyer(z, dt, P) {
      const T = z.T; const b = z.body;
      if (T.boss === 'queen') { z.abT -= dt; if (z.abT <= 0) { z.abT = 6; for (let i = 0; i < 3; i++) { const m = spawn('flyer', G.wave ? G.wave.n : 1, { x: z.pos.x, z: z.pos.z, dir: [0, 1], name: 'q' }); if (m) { m.pos.copy(z.pos).add(new THREE.Vector3(G.rng.range(-1.5, 1.5), 0.5, G.rng.range(-1.5, 1.5))); if (G.wave) { G.wave.total++; } } } G.audio.playAt('screech', z.pos, { gain: 1.2, rate: 0.6 }); } }
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
        if (z.windT >= T.windup) { z.windT = -1; z.attackT = T.rate; if (d3 < 2.1) hurtP(P, z.dmg, z.pos); }
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

    function slab(o, d, bx, maxT) {
      let t0 = 0; let t1 = maxT;
      for (let k = 0; k < 3; k++) {
        const oo = k === 0 ? o.x : k === 1 ? o.y : o.z; const dd = k === 0 ? d.x : k === 1 ? d.y : d.z;
        if (Math.abs(dd) < 1e-9) { if (oo < bx.min[k] || oo > bx.max[k]) return null; continue; }
        let a = (bx.min[k] - oo) / dd; let b2 = (bx.max[k] - oo) / dd; if (a > b2) { const tt = a; a = b2; b2 = tt; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b2); if (t0 > t1) return null;
      }
      return t0;
    }
    // Hit boxes in world space (bodies are upright; axis-aligned boxes are close enough for blocks).
    function hitTest(o, d, maxT, skip) {
      let best = null;
      for (const z of list) {
        if (!z.alive || (skip && skip.has(z))) continue;
        const s = z.T.scale;
        const kb = K.boxes(z);
        if (kb) { for (const bx of kb) { const t0 = slab(o, d, bx, best ? best.t : maxT); if (t0 !== null && (!best || t0 < best.t)) best = { t: t0, z, part: bx.part }; } continue; }
        const y = z.pos.y; const wide = z.T.fly ? 0.6 : 0.34;
        if (z.crawl) {
          const fx = Math.sin(z.yaw) * 0.85 * s; const fz = Math.cos(z.yaw) * 0.85 * s;
          const cb = [{ part: 'body', min: [z.pos.x - 0.5 * s, y, z.pos.z - 0.5 * s], max: [z.pos.x + 0.5 * s, y + 0.55 * s, z.pos.z + 0.5 * s] }];
          if (!z.headless) cb.push({ part: 'head', min: [z.pos.x + fx - 0.28 * s, y, z.pos.z + fz - 0.28 * s], max: [z.pos.x + fx + 0.28 * s, y + 0.6 * s, z.pos.z + fz + 0.28 * s] });
          for (const bx of cb) { const t0 = slab(o, d, bx, best ? best.t : maxT); if (t0 !== null && (!best || t0 < best.t || bx.part === 'head')) best = { t: t0, z, part: bx.part }; }
          continue;
        }
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
    function damage(z, amount, part, dir, imp = 1, opt = {}) {
      if (!z.alive) return false;
      if (opt.dot) {
        z.hp -= amount; if (z.flash <= 0) { z.flash = 0.05; setFlash(z, true); }
        if (z.hp <= 0) { kill(z, 'body', dir || new THREE.Vector3(0, 0, 1), opt, amount); return true; }
        return false;
      }
      if (G.coop && G.coop.guest && !opt.net) {
        G.coop.reportHit(z, amount, part, dir, imp, opt);
        if (K.hit(z, amount, part, dir, opt, true) === 0) return false;
        if (opt.status) for (const [k, pw] of opt.status) statusFlash(z, k);
        z.flash = 0.09; setFlash(z, true);
        const at = new THREE.Vector3(z.pos.x, z.pos.y + (part === 'head' ? 1.7 : part === 'leg' ? 0.45 : 1.05) * z.T.scale, z.pos.z); const k = BZ.clamp(amount / z.maxHp, 0, 1);
        G.fx.burst(at, Math.round(4 + k * 18), [0xb3201a, 0x7a1410, 0x5f8f3e], { dir, push: 1.5 + 3 * k * imp, size: 0.07 + 0.08 * k, speed: 3 + 3 * k }); G.fx.bloodMist(at, k);
        if (z.fp) { if (part === 'head') z.hs.v -= (10 + 40 * k) * imp; else z.fp.v -= (5 + 30 * k) * imp; }
        z.hp = Math.max(1, z.hp - amount * 0.5);
        return false;
      }
      amount = K.hit(z, amount, part, dir, opt, false); if (amount <= 0) return false;
      z.hp -= amount; z.flash = 0.09; setFlash(z, true);
      if (G.hero && G.hero.chill()) z.chillT = 1;
      const T = z.T; const k = BZ.clamp(amount / z.maxHp, 0, 1); const heavy = T === TYPES.brute ? 0.45 : 1;
      const y = part === 'head' ? 1.7 : part === 'leg' ? 0.45 : 1.05;
      const at = new THREE.Vector3(z.pos.x, z.pos.y + y * T.scale, z.pos.z);
      const n = Math.round(4 + k * 18 + (part === 'head' ? 6 : 0));
      G.fx.burst(at, n, [0xb3201a, 0x7a1410, 0x5f8f3e], { dir, push: 1.5 + 3 * k * imp, size: 0.07 + 0.08 * k, speed: 3 + 3 * k }); G.fx.bloodMist(at, k);
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
        if (!T.fly && T !== TYPES.brute && !T.noDown && z.hp > 0 && k * imp > 0.45 && z.down <= 0) { z.down = z.downMax = 0.9 + 0.6 * k; }
        // limbs come off: heavy rounds tear, blades cut clean, the saber cauterises; bosses keep their limbs
        if (!T.boss && z.hp > 0 && !T.quad && !T.rig) {
          const cut = opt.cut; const sideArm = side > 0 ? 'armL' : 'armR'; const sideLeg = side > 0 ? 'legL' : 'legR';
          const pickArm = z.body[sideArm].visible ? sideArm : sideArm === 'armL' ? 'armR' : 'armL';
          const pickLeg = z.body[sideLeg].visible ? sideLeg : sideLeg === 'legL' ? 'legR' : 'legL';
          if (part === 'body' && z.armsLeft > 0 && (cut ? G.rng.chance(cut === 'saber' ? 0.75 : cut === 'axe' ? 0.45 : 0.55) : amount >= 30 && G.rng.chance(0.2 + k * 0.4))) sever(z, pickArm, dir, opt);
          if (part === 'leg' && !T.fly) {
            z.legHits[pickLeg] += amount;
            if (cut ? G.rng.chance(cut === 'saber' ? 0.7 : 0.5) : (z.legHits[pickLeg] > 0.55 * z.maxHp && amount >= 18 && G.rng.chance(0.45)) || amount >= 70) sever(z, pickLeg, dir, opt);
          }
        }
      }
      if (opt.status) for (const [k, pw] of opt.status) applyStatus(z, k, pw, opt.by || 'h');
      if (z.hp <= 0) { kill(z, part, dir, opt, amount); return true; }
      return false;
    }

    // ---------- elements: burn, chill, shock, poison on a zombie, and the reactions when two meet ----------
    // st.burn = { t, dps, by }  st.chill = { t, n, by }  st.shock = { t, by }  st.poison = { t, n, dps, by }
    const V3s = () => new THREE.Vector3();
    const REACT = {
      steam: { name: 'NỔ HƠI', col: [0xe8f0ff, 0xb8c8d8, 0xffffff] },
      shatter: { name: 'VỠ VỤN', col: [0xdff6ff, 0x9ad8ff, 0xffffff] },
      gas: { name: 'NỔ KHÍ ĐỘC', col: [0x9aff60, 0x5ac030, 0xffe060] },
      spread: { name: 'LAN ĐỘC', col: [0x9aff60, 0x60e0ff] },
    };
    function hurtBy(z, amount, by, dot = true) { return damage(z, amount, 'body', V3s().set(0, 0, 1), 0.5, { dot, net: true, by, credit: !by || by === 'h' || (G.coop && by === G.coop.me) }); }
    function applyStatus(z, kind, pow = 1, by = 'h') {
      if (!z.alive || (G.coop && G.coop.guest) || z.T.immune === kind) return;
      if (z.T.weak === kind) pow *= 1.8;
      const st = z.st || (z.st = {}); const B = G.build;
      // a new element meeting an old one reacts; two different players doing it is a combo
      const other = (k) => st[k] && st[k].by;
      if (kind === 'shock' && (st.chill || z.frozen > 0)) return react(z, 'shatter', pow, by, other('chill'));
      if ((kind === 'chill' && st.burn) || (kind === 'burn' && st.chill)) return react(z, 'steam', pow, by, other(kind === 'chill' ? 'burn' : 'chill'));
      if ((kind === 'burn' && st.poison) || (kind === 'poison' && st.burn)) return react(z, 'gas', pow, by, other(kind === 'burn' ? 'poison' : 'burn'));
      if (kind === 'shock' && st.poison) react(z, 'spread', pow, by, other('poison'));
      if (kind === 'burn') st.burn = { t: 3 + pow, dps: 6 + 5 * pow, by };
      else if (kind === 'chill') {
        const n = Math.min(4, (st.chill ? st.chill.n : 0) + (z.T.weak === 'chill' ? 2 : 1)); st.chill = { t: 3, n, by };
        if (n >= 4) { st.chill = null; z.frozen = (z.T.boss ? 0.8 : 2.2) * (0.8 + 0.2 * pow); z.vel.set(0, 0, 0); G.fx.burst(V3s().set(z.pos.x, z.pos.y + 1, z.pos.z), 10, [0xdff6ff, 0x9ad8ff], { speed: 2, size: 0.08, life: 0.5 }); }
      } else if (kind === 'shock') { st.shock = { t: 0.7, by }; chain(z, pow, by); }
      else if (kind === 'poison') { const n = Math.min(5, (st.poison ? st.poison.n : 0) + 1); st.poison = { t: 5, n, dps: 3 * pow * n, by }; }
    }
    function react(z, kind, pow, by, otherBy) {
      const R = REACT[kind]; const st = z.st; const at = V3s().set(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z);
      const combo = otherBy && otherBy !== by; const k = (combo ? 1.5 : 1) * pow;
      G.fx.burst(at, 26, R.col, { speed: 5, size: 0.12, life: 0.7 });
      G.fx.puff(at, { glow: true, s0: 1.5, s1: 4, life: 0.35, c0: R.col[0], c1: R.col[1], a0: 1 });
      G.ui.pop((combo ? 'PHỐI HỢP · ' : '') + R.name, combo ? 'critword' : 'dmg crit', V3s().set(z.pos.x, z.pos.y + 2.6 * z.T.scale, z.pos.z));
      G.audio.playAt(kind === 'shatter' ? 'clank' : 'boom', z.pos, { gain: 0.9, rate: kind === 'shatter' ? 1.6 : 1.4 });
      G.events.emit('react', { z, kind, combo, by, otherBy });
      if (kind === 'shatter') {
        st.chill = null; const frozen = z.frozen > 0; z.frozen = 0;
        const dmg = (z.T.boss ? 0.08 : 0.4) * z.maxHp * k * (G.build && G.build.has('super') ? 2 : 1) * (frozen ? 1.4 : 1);
        hurtBy(z, dmg, by, false);
      } else if (kind === 'steam') {
        st.chill = null; st.burn = null;
        for (const o of list) if (o.alive && o.pos.distanceTo(z.pos) < 3.2) hurtBy(o, 45 * k, by, false);
        for (let i = 0; i < 8; i++) G.fx.puff(at.clone().add(V3s().set(G.rng.range(-1, 1), G.rng.range(0, 1), G.rng.range(-1, 1))), { vel: V3s().set(0, 1.2, 0), drag: 1, s0: 1, s1: 3, life: 1.6, c0: 0xe8eef4, c1: 0xb8c0c8, a0: 0.6 });
      } else if (kind === 'gas') {
        st.poison = null; st.burn = null;
        G.gear.explode(at, 4, 110 * k);
      } else if (kind === 'spread') {
        const p = st.poison;
        for (const o of list) if (o !== z && o.alive && o.pos.distanceTo(z.pos) < 6) { o.st = o.st || {}; o.st.poison = { t: 5, n: p.n, dps: p.dps, by }; G.fx.arc(at, V3s().set(o.pos.x, o.pos.y + 1, o.pos.z), 0x9aff60); }
      }
      if (combo && G.coop && G.coop.on) G.events.emit('combo', { by, otherBy });
    }
    function chain(z, pow, by) {
      const wet = G.sky && (G.sky.weather() === 'rain' || G.sky.weather() === 'storm');
      const n = 1 + Math.ceil(pow) + (wet ? 2 : 0);
      const near = list.filter((o) => o !== z && o.alive && o.pos.distanceTo(z.pos) < 5.5).sort((a, b) => a.pos.distanceTo(z.pos) - b.pos.distanceTo(z.pos)).slice(0, n);
      const a = V3s().set(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z);
      for (const o of near) {
        const b = V3s().set(o.pos.x, o.pos.y + 1.1 * o.T.scale, o.pos.z);
        G.fx.arc(a, b, 0x9ad8ff);
        hurtBy(o, 14 * pow * (wet ? 1.5 : 1), by, false);
        o.st = o.st || {}; o.st.shock = { t: 0.5, by };
        if (o.st.chill || o.frozen > 0) react(o, 'shatter', pow, by, o.st.chill ? o.st.chill.by : by);
        if (G.build && G.build.has('firestorm')) applyStatus(o, 'burn', pow, by);
      }
      if (near.length) G.audio.playAt('saber_hit', z.pos, { gain: 0.6, rate: 2.2 });
    }
    function tickStatus(z, dt) {
      const st = z.st; if (!st) return;
      let f = 0;
      for (const k of ['burn', 'chill', 'shock', 'poison']) if (st[k]) { st[k].t -= dt; if (st[k].t <= 0) st[k] = null; }
      st.acc = (st.acc || 0) + dt;
      if (st.acc >= 0.5) {
        st.acc = 0;
        if (st.burn) hurtBy(z, st.burn.dps * 0.5, st.burn.by);
        if (z.alive && st.poison) {
          const extra = st.chill && G.build && G.build.has('frostbite') ? 1.4 : 1;
          const d = st.poison.dps * 0.5 * extra; hurtBy(z, d, st.poison.by);
          if (G.build && G.build.has('parasite') && (st.poison.by === 'h' || !st.poison.by)) G.player.hp = Math.min(G.player.maxHp, G.player.hp + d * 0.3);
        }
      }
      if (st.burn) f |= 16; if (st.chill) f |= 32; if (st.shock) f |= 64; if (st.poison) f |= 128;
      z.stFlags = f;
      statusFx(z, dt, f);
    }
    // the look of each element on a body; guests run this from the snapshot flags
    function statusFx(z, dt, f) {
      if (!f || !z.body.root.visible) return;
      const top = V3s().set(z.pos.x + G.rng.range(-0.25, 0.25) * z.T.scale, z.pos.y + G.rng.range(0.3, 1.8) * z.T.scale, z.pos.z + G.rng.range(-0.25, 0.25) * z.T.scale);
      if (f & 16 && G.rng.chance(dt * 22)) G.fx.puff(top, { glow: true, vel: V3s().set(0, 1.6, 0), s0: 0.45, s1: 0.1, life: 0.45, c0: 0xffd060, c1: 0xff3a10, a0: 1 });
      if (f & 128 && G.rng.chance(dt * 10)) G.fx.puff(top, { vel: V3s().set(0, 0.6, 0), s0: 0.15, s1: 0.4, life: 0.7, c0: 0x8aff50, c1: 0x3a8a20, a0: 0.8 });
      if (f & 64 && G.rng.chance(dt * 16)) G.fx.puff(top, { glow: true, s0: 0.35, s1: 0.05, life: 0.1, c0: 0xe0f4ff, c1: 0x60b0ff, a0: 1.2 });
      if (f & 32 && G.rng.chance(dt * 6)) G.fx.puff(top, { vel: V3s().set(0, -0.3, 0), s0: 0.12, s1: 0.05, life: 0.6, c0: 0xdff6ff, c1: 0x9ad8ff, a0: 0.9 });
      if (z.flash <= 0 && !z.frozen) {
        const c = f & 32 ? 0x1a3a60 : f & 128 ? 0x1a4a10 : f & 16 ? 0x4a1a04 : 0;
        if (c) for (const k of ['skin', 'shirt', 'pants']) z.body.mats[k].emissive.setHex(c);
      }
    }
    function statusFlash(z, kind) { statusFx(z, 0.2, { burn: 16, chill: 32, shock: 64, poison: 128 }[kind] || 0); }

    const V3 = () => new THREE.Vector3();
    function sever(z, part, dir, opt = {}) {
      const b = z.body; const mesh = b[part]; if (!mesh || !mesh.visible) return false;
      b.root.updateMatrixWorld(true);
      const burn = opt.cut === 'saber'; const s = z.T.scale;
      const v = V3().copy(dir).multiplyScalar(G.rng.range(2.5, 5) * (opt.blast ? 1.8 : 1)).add(V3().set(G.rng.range(-1.2, 1.2), G.rng.range(2.5, 5) * (opt.blast ? 1.6 : 1), G.rng.range(-1.2, 1.2)));
      G.fx.gib(mesh, v, { burn });
      mesh.visible = false; if (b.stumps[part]) { b.stumps[part].visible = true; b.stumps[part].material = burn ? burnMat : BZ.mat('z_meat'); }
      const at = mesh.getWorldPosition(V3());
      if (burn) G.fx.burst(at, 12, [0xffd060, 0xff8a20, 0x3a3a3c], { speed: 2.5, size: 0.08, life: 0.6, grav: -1 });
      else { G.fx.burst(at, 18, [0xc0281e, 0x8a1410, 0x9db08a], { dir, push: 3, size: 0.1, speed: 4.5 }); G.fx.splat(V3().set(at.x, z.pos.y, at.z), 1.1 * s); }
      if (z.alive) G.fx.spurt(mesh, burn ? 'burn' : 'blood', burn ? 1.2 : 2.2, () => b.root.visible && (z.alive || z.dying > 0));
      G.audio.playAt(burn ? 'saber_hit' : 'gore', at, { gain: 0.8 });
      if (part === 'head') z.headless = true;
      else if (part === 'armL' || part === 'armR') z.armsLeft--;
      else if (part === 'legL' || part === 'legR') { z.crawl = true; z.limp = false; z.climb = null; z.down = 0; }
      G.events.emit('zombie:sever', { z, part, cut: opt.cut, dir });
      return true;
    }
    const burnMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    // head shot apart: cube chunks of skin, face and meat, a red mist, a pool under the body
    function burstHead(z, dir) {
      const b = z.body; if (!b.head.visible) return;
      b.root.updateMatrixWorld(true);
      const at = b.head.localToWorld(V3().set(0, 0.25, 0));
      b.head.visible = false; b.stumps.head.visible = true; z.headless = true;
      G.fx.chunks(at, 9, [BZ.mat(z.T.skin), BZ.mat(z.T.face), BZ.mat('z_meat'), BZ.mat('z_meat')], dir, z.T.scale);
      G.fx.burst(at, 34, [0xc0281e, 0x8a1410, 0x5a0a08, 0x9db08a], { dir, push: 4, size: 0.12, speed: 6 });
      G.fx.burst(at, 10, [0x8a1410, 0x5a0a08], { speed: 1.4, size: 0.3, life: 0.9, grav: -0.4, drag: 2, bounce: 0 });
      G.fx.splat(V3().set(at.x + dir.x * 0.8, z.pos.y, at.z + dir.z * 0.8), 1.6 * z.T.scale);
      G.fx.spurt(b.stumps.head, 'blood', 1.4, () => b.root.visible && z.dying > 0);
      G.audio.playAt('gore', at, { gain: 1, rate: 0.85 });
    }
    // blown apart by an explosion: every remaining part becomes a gib and the body leaves the pool at once
    function blowApart(z, dir, ice) {
      const b = z.body; b.root.updateMatrixWorld(true);
      const c = V3().set(z.pos.x, z.pos.y + 1 * z.T.scale, z.pos.z);
      for (const k of ['head', 'torso', 'armL', 'armR', 'legL', 'legR', 'wingL', 'wingR']) {
        const m = b[k]; if (!m.visible) continue;
        const p = m.getWorldPosition(V3()); const out = p.sub(c).setY(0).normalize();
        G.fx.gib(m, out.multiplyScalar(G.rng.range(3, 6)).addScaledVector(dir, G.rng.range(3, 6)).add(V3().set(0, G.rng.range(5, 9), 0)), { ice });
      }
      G.fx.chunks(c, ice ? 12 : 8, ice ? [iceMat, iceMat, BZ.mat(z.T.skin)] : [BZ.mat(z.T.skin), BZ.mat('z_meat'), BZ.mat('z_meat')], dir, z.T.scale);
      G.fx.burst(c, 40, ice ? [0xdff6ff, 0x9ad8ff, 0xffffff] : [0xc0281e, 0x8a1410, 0x5a0a08], { speed: 8, size: 0.14, life: 1.1 });
      if (!ice) G.fx.splat(V3().set(z.pos.x, z.pos.y, z.pos.z), 2.2 * z.T.scale);
      b.root.visible = false; z.dying = 0; b.root.rotation.x = 0;
      G.audio.playAt('gore', c, { gain: 1.1, rate: 0.7 });
    }
    // frozen solid: no steering or attacks, falls if it was in the air, icy tint; thaws with a puff
    const iceMat = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x1a4a70 });
    function frozenStep(z, dt) {
      const b = z.body; z.frozen -= dt;
      z.vel.x = 0; z.vel.z = 0; z.vel.y -= 22 * dt; G.world.moveBox(z.pos, z.vel, dt, 0.32 * z.T.scale, 1.8, out, 0);
      b.root.position.copy(z.pos);
      if (z.crawl) { b.root.position.x -= Math.sin(z.yaw) * 0.85 * z.T.scale; b.root.position.z -= Math.cos(z.yaw) * 0.85 * z.T.scale; b.root.position.y += 0.16 * z.T.scale; }
      if (z.flash > 0) z.flash -= dt;
      else for (const k of ['skin', 'shirt', 'pants']) b.mats[k].emissive.setHex(0x2a6aa0);
      if (G.rng.chance(dt * 4)) G.fx.burst(new THREE.Vector3(z.pos.x, z.pos.y + G.rng.range(0.3, 1.8) * z.T.scale, z.pos.z), 1, [0xdff6ff, 0x9ad8ff], { speed: 0.5, size: 0.05, life: 0.6, grav: 1 });
      if (z.frozen <= 0) { setFlash(z, false); G.fx.burst(new THREE.Vector3(z.pos.x, z.pos.y + 1, z.pos.z), 12, [0xdff6ff, 0x9ad8ff, 0xffffff], { speed: 2.5, size: 0.08, life: 0.5 }); G.audio.playAt('clank', z.pos, { gain: 0.4, rate: 1.8 }); }
      const bar = b.barBg; bar.visible = z.hp < z.maxHp;
      if (bar.visible) { bar.position.set(z.pos.x, z.pos.y + 2.2 * z.T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
    }
    function kill(z, part, dir, opt = {}, amount = 0) {
      z.alive = false; z.dying = 0.001; z.landed = false; z.fallV = 0; z.climb = null; z.deathK = G.rng.int(0, 2);
      for (const o of list) if (o.climb === z) o.climb = null;
      const b = z.body;
      setFlash(z, false); b.barBg.visible = false; b.halo.visible = false;
      const big = !z.T.boss || z.T.boss === 'phantom';
      let gore = null;
      const ice = z.frozen > 0;
      if (opt.gore !== undefined) gore = opt.gore;
      else {
      if (ice) gore = 'apart';
      else if (opt.blast && big && (amount >= z.maxHp * 1.5 || G.rng.chance(0.75))) gore = 'apart';
      else if (part === 'head' && b.head.visible) gore = opt.cut ? 'decap' : amount >= 55 || G.rng.chance(0.6) ? 'burst' : 'decap';
      else if (opt.cut && part === 'body' && G.rng.chance(opt.cut === 'axe' ? 0.6 : 0.4)) gore = 'limb';
      }
      if (z.T.quad && (gore === 'decap' || gore === 'limb')) gore = 'burst';
      if (z.T.kind || z.elite) { const r = K.die(z, gore, dir, opt); if (r !== undefined) gore = r === 'none' ? null : r; }
      if (!z.crawl) b.root.rotation.y = Math.atan2(-dir.x, -dir.z);
      G.audio.playAt('die', z.pos, { gain: 0.9 });
      if (gore === 'apart') blowApart(z, dir, ice);
      if (ice) { z.frozen = 0; G.audio.playAt('clank', z.pos, { gain: 1, rate: 1.4 }); G.audio.playAt('saber_hit', z.pos, { gain: 0.6, rate: 2 }); }
      else if (gore === 'burst') burstHead(z, dir);
      else if (gore === 'decap') { sever(z, 'head', dir, opt); G.fx.spurt(b.stumps.head, opt.cut === 'saber' ? 'burn' : 'blood', 1.6, () => b.root.visible && z.dying > 0); }
      else if (gore === 'limb') sever(z, opt.limb || (G.rng.chance(0.5) ? 'armL' : 'armR'), dir, opt);
      if (!gore || gore === 'limb') G.fx.splat(V3().set(z.pos.x - dir.x * 1.2, z.pos.y, z.pos.z - dir.z * 1.2), 1.2 * z.T.scale);
      G.events.emit('zombie:killed', { z, part, gore, by: opt.by, credit: opt.credit !== false, dir, opt });
    }
    function clear() { K.clear(); for (const z of list) { z.alive = false; z.dying = 0; z.body.root.visible = false; z.body.root.rotation.x = 0; z.body.barBg.visible = false; } }
    // Hit flash turns the whole body solid red (the distance readout); otherwise only the eyes glow.
    function setFlash(z, on) {
      const m = z.body.mats;
      for (const k of ['skin', 'shirt', 'pants']) m[k].emissive.setHex(on ? 0xd01810 : z.glow || z.T.glow || 0);
      const f = m.face; const wantMap = on ? null : BZ.tex('eyes_glow');
      if (f.emissiveMap !== wantMap) { f.emissiveMap = wantMap; f.needsUpdate = true; }
      f.emissive.setHex(on ? 0xd01810 : f.userData.eye || 0xff3020);
    }
    const aliveCount = () => list.reduce((a, z) => a + (z.alive ? 1 : 0), 0);

    const boss1 = () => list.find((z) => z.alive && z.T.boss);
    // snapshot row: [index, type, x, y, z, yaw, hp 0..255, flags]; flags: 1 crawl, 2 frozen, 4 attacking, 8 knocked down
    const TYPE_IDS = Object.keys(TYPES);
    function netRow(z, i) {
      const f = (z.crawl ? 1 : 0) | (z.frozen > 0 ? 2 : 0) | (z.windT >= 0 ? 4 : 0) | (z.down > 0 && !z.crawl ? 8 : 0) | (z.stFlags || 0) | K.flags(z);
      return [i, TYPE_IDS.indexOf(z.type), +z.pos.x.toFixed(2), +z.pos.y.toFixed(2), +z.pos.z.toFixed(2), +z.yaw.toFixed(2), Math.round(255 * Math.max(0, z.hp) / z.maxHp), f, K.eliteIdx(z)];
    }
    function snapshot() { const out = []; list.forEach((z, i) => { if (z.alive) out.push(netRow(z, i)); }); return out; }
    function adopt(rows) {
      const seen = new Set();
      for (const r of rows) {
        const [i, ti, x, y, zz, yaw, hp, f] = r; const z = list[i]; if (!z) continue; seen.add(i);
        const type = TYPE_IDS[ti];
        if (!z.alive || z.type !== type || z.dying) {
          if (z.dying) { z.dying = 0; z.body.root.rotation.x = 0; }
          const g = { x, z: zz, dir: [0, 1] }; const keep = list.indexOf(z);
          spawnAt(z, type, g); z.pos.set(x, y, zz); z.yaw = yaw; z.netPos = new THREE.Vector3(x, y, zz); void keep;
        }
        z.netPos.set(x, y, zz); z.netYaw = yaw; z.hp = z.maxHp * hp / 255;
        z.crawl = !!(f & 1); z.frozen = f & 2 ? 1 : 0; z.windT = f & 4 ? 0.1 : -1; z.netDown = !!(f & 8); z.stFlags = f & 240;
        K.adopt(z, f, r[8] || 0);
      }
      for (let i = 0; i < list.length; i++) { const z = list[i]; if (z.alive && !seen.has(i)) { z.alive = false; z.dying = 0; z.body.root.visible = false; z.body.barBg.visible = false; } }
    }
    function spawnAt(z, type, g) {
      const T = TYPES[type]; if (z.type !== type) dress(z, type);
      z.type = type; z.T = T; z.alive = true; z.dying = 0; z.headless = false; z.hp = z.maxHp = T.hp; z.dmg = T.dmg; z.speed = T.speed;
      z.fp = z.fp || BZ.spring(110, 9); z.fr = z.fr || BZ.spring(110, 9); z.hs = z.hs || BZ.spring(140, 8); z.fp.reset(); z.fr.reset(); z.hs.reset();
      z.down = 0; z.crawl = false; z.frozen = 0; z.armsLeft = 2; z.phase = G.rng.range(0, 6); z.bob = 0; z.flash = 0; z.windT = -1; z.vel.set(0, 0, 0);
      K.init(z, T, 1);
      for (const k of ['armL', 'armR', 'legL', 'legR', 'torso']) z.body[k].visible = true;
      for (const st of Object.values(z.body.stumps)) { st.visible = false; st.material = BZ.mat('z_meat'); }
      const b = z.body; b.root.visible = true; b.root.scale.setScalar(T.scale); b.head.visible = true; b.wingL.visible = b.wingR.visible = b.halo.visible = !!T.fly; b.root.rotation.set(0, 0, 0);
      setFlash(z, false);
    }
    function puppets(dt) {
      for (const z of list) {
        const b = z.body;
        if (z.dying) {
          z.dying += dt; if (z.T.quad) b.root.rotation.z = Math.min(1, z.dying / 0.3) * Math.PI / 2; else if (z.crawl) b.root.rotation.x = BZ.lerp(1.38, Math.PI / 2, Math.min(1, z.dying / 0.3)); else fall(z, b);
          b.root.position.y = z.pos.y + (z.crawl ? 0.12 * z.T.scale : 0) - Math.max(0, z.dying - 1.8) * 0.8;
          if (z.dying > 2.8) { z.dying = 0; b.root.visible = false; b.root.rotation.x = 0; b.root.rotation.z = 0; b.hips.position.y = 0.75; b.hips.rotation.set(0, 0, 0); }
          continue;
        }
        if (!z.alive || !z.netPos) continue;
        const T = z.T; const before = z.pos.clone();
        z.pos.lerp(z.netPos, Math.min(1, dt * 12)); if (z.pos.distanceTo(z.netPos) > 4) z.pos.copy(z.netPos);
        z.yaw += BZ.wrapAngle(z.netYaw - z.yaw) * Math.min(1, dt * 12);
        const sp = before.distanceTo(z.pos) / Math.max(dt, 1e-3);
        z.phase += dt * sp * 2.4 / T.scale; z.bob += dt;
        const fp = z.fp.step(dt); const fr = z.fr.step(dt); const hs = z.hs.step(dt);
        const sw = Math.sin(z.phase) * Math.min(1, sp / 2) * 0.7; const wind = z.windT >= 0 ? 1 : 0;
        b.root.position.copy(z.pos); b.root.rotation.y = z.yaw; b.root.rotation.x = 0;
        if (T.fly) {
          const flap = Math.sin(z.bob * 16); b.wingL.rotation.z = -0.25 + flap * 0.7; b.wingR.rotation.z = 0.25 - flap * 0.7;
          b.legL.rotation.x = 0.4; b.legR.rotation.x = 0.5; b.armL.rotation.x = b.armR.rotation.x = -Math.PI / 2 - wind * 0.8; b.hips.rotation.x = 0.55;
        } else if (z.crawl) {
          const pull = Math.sin(z.phase * 1.6);
          b.root.rotation.x = 1.38; b.root.position.x -= Math.sin(z.yaw) * 0.85 * T.scale; b.root.position.z -= Math.cos(z.yaw) * 0.85 * T.scale; b.root.position.y += 0.16 * T.scale;
          b.armL.rotation.x = Math.PI - 0.35 + pull * 0.55; b.armR.rotation.x = Math.PI - 0.35 - pull * 0.55; b.legL.rotation.x = 0.1; b.legR.rotation.x = 0.1; b.head.rotation.x = -0.9 + hs;
        } else {
          if (z.netDown) b.root.rotation.x = -1.3;
          b.legL.rotation.x = sw - T.hunch; b.legR.rotation.x = -sw - T.hunch;
          const armBase = -Math.PI / 2 + Math.sin(z.phase * 0.5) * 0.12;
          b.armL.rotation.x = armBase + T.droop - wind * (0.9 + T.droop); b.armR.rotation.x = armBase - wind * 0.9;
          b.hips.rotation.x = T.hunch + fp; b.hips.rotation.z = Math.sin(z.phase) * 0.05 + fr; b.hips.position.y = 0.75 + Math.abs(Math.cos(z.phase)) * 0.04;
          b.head.rotation.x = hs; b.head.rotation.z = Math.sin(z.phase * 0.7) * 0.15;
        }
        if (T.kind) K.pose(z, dt, sp);
        statusFx(z, dt, z.stFlags || 0);
        if (z.frozen) { if (z.flash <= 0) for (const k of ['skin', 'shirt', 'pants']) b.mats[k].emissive.setHex(0x2a6aa0); }
        if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) setFlash(z, false); }
        else if (!z.frozen && b.mats.skin.emissive.getHex() === 0x2a6aa0) setFlash(z, false);
        const bar = b.barBg; bar.visible = z.hp < z.maxHp - 1;
        if (bar.visible) { bar.position.set(z.pos.x, z.pos.y + (z.crawl ? 0.9 : 2.2) * T.scale, z.pos.z); bar.quaternion.copy(G.camera.quaternion); const k = Math.max(0, z.hp / z.maxHp); b.barFg.scale.x = Math.max(0.001, k); b.barFg.position.x = -0.35 * (1 - k); }
      }
    }
    return { list, spawn, update, hitTest, damage, sever, kill, burstHead, blowApart, applyStatus, REACT, clear, aliveCount, snapshot, adopt, TYPE_IDS, kinds: K, elite: (z, key) => K.elite(z, key), boss: boss1, debug: () => ({ alive: aliveCount() }) };
  };
})();
