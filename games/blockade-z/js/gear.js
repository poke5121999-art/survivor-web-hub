// Throwable bombs and auto turrets.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const BOMB = { start: 3, max: 9, fuse: 1.6, radius: 5.5, dmg: 220, throwSpeed: 15, price: 120, pack: 3 };
  const TURRET = { price: 450, max: 12, range: 24, rpm: 420, dmg: 13, accuracy: 0.8, ammo: 260 };
  BZ.BOMB = BOMB; BZ.TURRET = TURRET;

  BZ.makeGear = (G) => {
    const scene = G.scene;
    // ---- bombs ----
    const bombGeo = (() => {
      const B = new BZ.Builder('bomb');
      B.box([-0.09, -0.09, -0.09], [0.09, 0.09, 0.09], 'a_helmet', { uv: 'fit', vary: 0 });
      B.box([-0.03, 0.09, -0.03], [0.03, 0.14, 0.03], 'g_steel', { uv: 'fit', vary: 0 });
      B.box([0.03, 0.11, -0.01], [0.08, 0.13, 0.01], 'g_gold', { uv: 'fit', vary: 0 });
      return B.build();
    })();
    const bombs = []; const out = {};
    const state = { bombs: BOMB.start, cool: 0 };

    function throwBomb() {
      if (state.bombs <= 0 || state.cool > 0 || !G.player.alive) { if (state.bombs <= 0) G.audio.play('deny'); return false; }
      state.bombs--; state.cool = 0.6;
      const cam = G.camera; cam.updateMatrixWorld();
      const f = new THREE.Vector3(); cam.getWorldDirection(f);
      const pos = cam.position.clone().addScaledVector(f, 0.5); pos.y -= 0.15;
      const vel = f.clone().multiplyScalar(BOMB.throwSpeed).add(new THREE.Vector3(0, 3.5, 0)).add(G.player.vel.clone().multiplyScalar(0.5));
      const m = bombGeo.clone(); m.position.copy(pos); scene.add(m);
      bombs.push({ m, pos, vel, t: 0, spin: new THREE.Vector3(G.rng.range(-9, 9), G.rng.range(-9, 9), 0) });
      G.audio.play('swipe', { gain: 0.6, rate: 1.3 });
      G.weapons.S.kP.v -= 6; G.weapons.S.drop.x = 0.4;
      return true;
    }

    function explode(pos, R = BOMB.radius, DMG = BOMB.dmg) {
      for (const z of G.zombies.list) {
        if (!z.alive) continue;
        const d = Math.hypot(z.pos.x - pos.x, z.pos.y + 0.9 - pos.y, z.pos.z - pos.z);
        if (d > R) continue;
        const dir = new THREE.Vector3(z.pos.x - pos.x, 0, z.pos.z - pos.z).normalize();
        const dmg = Math.round(DMG * (1 - Math.max(0, d - 1.5) / R * 0.65));
        const died = G.zombies.damage(z, dmg, 'body', dir, 3, { blast: true, by: G.coop && G.coop.blastBy });
        z.vel.addScaledVector(dir, 4); if (z.fallV !== undefined && z.T.fly) z.vel.y += 6;
        G.events.emit('hit', { z, dmg, part: 'body', died });
      }
      G.fx.explosion(pos, R / BOMB.radius); G.events.emit('boom', { pos, s: R / BOMB.radius });
      G.audio.playAt('boom', pos, { gain: 1.3 });
      const pd = G.player.pos.distanceTo(pos);
      if (pd < 18) { G.player.shake.v += (18 - pd) * 0.8; G.player.kickP.v += (18 - pd) * 0.03; }
    }

    // ---- projectiles: thrown rocks (hurt the player), rockets (explode on anything) ----
    const shots = [];
    const rockGeo = (() => { const RB = new BZ.Builder('rock'); RB.box([-0.3, -0.3, -0.3], [0.3, 0.3, 0.3], 'rubble', { uv: 'fit' }); RB.box([-0.2, 0.2, -0.25], [0.25, 0.42, 0.2], 'rubble', { uv: 'fit' }); return RB.build(); })();
    const rocketGeo = (() => { const RB = new BZ.Builder('rocket'); RB.box([-0.06, -0.06, -0.3], [0.06, 0.06, 0.25], 'g_body2', { uv: 'fit', vary: 0 }); RB.box([-0.05, -0.05, -0.42], [0.05, 0.05, -0.3], 'g_red', { uv: 'fit', vary: 0 }); RB.box([-0.12, -0.01, 0.12], [0.12, 0.01, 0.25], 'g_steel', { uv: 'fit', vary: 0 }); return RB.build(); })();
    function throwRock(from, target, owner) {
      state.rocks = (state.rocks || 0) + 1;
      const t = BZ.clamp(from.distanceTo(target) / 15, 0.7, 1.7); const g = 18;
      const vel = target.clone().sub(from).divideScalar(t); vel.y += 0.5 * g * t;
      const m = rockGeo.clone(); m.position.copy(from); scene.add(m);
      shots.push({ kind: 'rock', m, pos: from.clone(), vel, g, life: 4, spin: 6, owner });
    }
    function fireRocket(from, dir) {
      const m = rocketGeo.clone(); m.position.copy(from); m.lookAt(from.clone().add(dir)); m.rotateY(Math.PI); scene.add(m);
      shots.push({ kind: 'rocket', m, pos: from.clone(), vel: dir.clone().multiplyScalar(40), g: 1.5, life: 3, spin: 0 });
    }
    const seg = new THREE.Vector3();
    function updateShots(dt) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]; s.life -= dt;
        s.vel.y -= s.g * dt;
        const step = s.vel.length() * dt; seg.copy(s.vel).normalize();
        let hitAt = null;
        const wh = G.world.raycast(s.pos, seg, step + 0.2);
        if (wh) hitAt = s.pos.clone().addScaledVector(seg, wh.t);
        if (s.kind === 'rocket') {
          const zh = G.zombies.hitTest(s.pos, seg, wh ? wh.t : step + 0.3);
          if (zh) hitAt = s.pos.clone().addScaledVector(seg, zh.t);
          G.fx.trail(s.pos.clone().addScaledVector(seg, -0.4));
        } else {
          const P = G.player; const pc = P.pos.clone().add(new THREE.Vector3(0, 1, 0));
          if (P.alive && s.pos.distanceTo(pc) < 1.1) { G.events.emit('player:hurt', { dmg: 24, from: s.pos }); hitAt = s.pos.clone(); P.vel.addScaledVector(seg, 4); }
          if (!hitAt && G.coop && G.coop.host) for (const r of G.coop.remotes()) if (r.alive && Math.hypot(s.pos.x - r.pos.x, s.pos.y - r.pos.y - 1, s.pos.z - r.pos.z) < 1.1) { G.coop.hurtRemote(r, 24, s.pos); hitAt = s.pos.clone(); break; }
          s.m.rotation.x += dt * s.spin; s.m.rotation.z += dt * s.spin * 0.7;
        }
        if (hitAt || s.life <= 0 || s.pos.y < -1) {
          const at = hitAt || s.pos;
          if (s.kind === 'rocket') explode(at, 6.5, 480);
          else { G.fx.burst(at, 16, [0x6a645c, 0x8e8c86, 0x55504a], { speed: 5, size: 0.16, life: 1 }); G.audio.playAt('impact', at, { gain: 1, rate: 0.6 }); }
          scene.remove(s.m); shots.splice(i, 1); continue;
        }
        s.pos.addScaledVector(s.vel, dt); s.m.position.copy(s.pos);
        if (s.kind === 'rocket') { s.m.lookAt(s.pos.clone().add(s.vel)); s.m.rotateY(Math.PI); }
      }
    }

    // ---- turrets ----
    const turretParts = () => {
      const base = new BZ.Builder('turret-base');
      base.box([-0.45, 0, -0.45], [0.45, 0.18, 0.45], 'g_body2', { uv: 'fit', vary: 0 });
      base.box([-0.12, 0.18, -0.12], [0.12, 0.85, 0.12], 'g_body', { uv: 'fit', vary: 0 });
      for (const [x, z] of [[-0.55, -0.55], [0.4, -0.55], [-0.55, 0.4], [0.4, 0.4]]) base.box([x, 0, z], [x + 0.15, 0.08, z + 0.15], 'g_steel', { uv: 'fit', vary: 0 });
      const head = new BZ.Builder('turret-head');
      head.box([-0.3, -0.18, -0.3], [0.3, 0.2, 0.32], 'g_body', { uv: 'fit', vary: 0 });
      head.box([-0.31, 0.02, -0.25], [0.31, 0.08, 0.25], 'g_orange', { uv: 'fit', vary: 0 });
      head.box([-0.16, -0.05, -0.85], [-0.06, 0.05, -0.3], 'g_steel', { uv: 'fit', vary: 0 });
      head.box([0.06, -0.05, -0.85], [0.16, 0.05, -0.3], 'g_steel', { uv: 'fit', vary: 0 });
      head.box([-0.08, 0.1, -0.31], [0.08, 0.17, -0.29], 'g_glow_red', { uv: 'fit', vary: 0 });
      const b = base.build({ cast: G.quality.shadow > 0 });
      const h = head.build({ cast: G.quality.shadow > 0, matOpts: { g_glow_red: { emissive: 0xff3a2a } } });
      h.position.y = 1.0; h.rotation.order = 'YXZ'; b.add(h);
      return { root: b, head: h };
    };
    const turrets = [];
    const BAR = new THREE.PlaneGeometry(0.55, 0.05);
    function placeTurret(at) {
      if (turrets.length >= TURRET.max) return false;
      const P = at || G.player;
      const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      let pos = null;
      for (const dist of [2, 1.4, 2.8, 0.9]) {
        const c = P.pos.clone().addScaledVector(f, dist); c.y = 0;
        if (!G.world.overlaps([c.x - 0.5, 0.01, c.z - 0.5], [c.x + 0.5, 1.4, c.z + 0.5])) { pos = c; break; }
      }
      if (!pos) pos = new THREE.Vector3(P.pos.x, 0, P.pos.z);
      const t = turretParts();
      t.root.position.copy(pos); scene.add(t.root);
      const bar = new THREE.Mesh(BAR, new THREE.MeshBasicMaterial({ color: 0x3a9ad8, depthWrite: false, transparent: true, opacity: 0.8 })); scene.add(bar);
      turrets.push({ ...t, pos, ammo: TURRET.ammo, cool: 0, seekT: 0, target: null, yaw: P.yaw, flashT: 0, bar });
      G.audio.play('buy', { gain: 0.6 });
      return true;
    }
    function removeTurret(i) {
      const t = turrets[i];
      G.fx.burst(t.pos.clone().setY(1), 14, [0x2a2e35, 0x8d97a3, 0xf08a24], { size: 0.12 });
      G.audio.playAt('impact', t.pos, { gain: 0.8 });
      scene.remove(t.root); scene.remove(t.bar); turrets.splice(i, 1);
    }

    const eye = new THREE.Vector3(); const aim = new THREE.Vector3();
    function update(dt) {
      state.cool = Math.max(0, state.cool - dt);
      updateShots(dt);
      for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        b.t += dt;
        const pre = b.vel.clone();
        b.vel.y -= 22 * dt;
        G.world.moveBox(b.pos, b.vel, dt, 0.09, 0.18, out);
        if (out.hitX) b.vel.x = -pre.x * 0.4;
        if (out.hitZ) b.vel.z = -pre.z * 0.4;
        if (out.ground) { if (pre.y < -2.5) b.vel.y = -pre.y * 0.35; b.vel.x *= 0.86; b.vel.z *= 0.86; b.spin.multiplyScalar(0.8); }
        b.m.position.copy(b.pos).add(new THREE.Vector3(0, 0.09, 0));
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt;
        if (b.t >= BOMB.fuse) { const k = (G.hero ? G.hero.bombMul() : 1) * G.build.bombMul(); const at = b.pos.clone().add(new THREE.Vector3(0, 0.3, 0)); explode(at, BOMB.radius * k, BOMB.dmg * k);
          if (G.build.has('demolition')) for (let j = 0; j < 3; j++) { const a = j * 2.1 + G.rng.next(); const q = at.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3)); setTimeout(() => explode(q, 3, 90 * k), 220 + j * 120); } scene.remove(b.m); bombs.splice(i, 1); }
      }
      for (let i = turrets.length - 1; i >= 0; i--) {
        const t = turrets[i];
        t.seekT -= dt;
        eye.set(t.pos.x, 1.05, t.pos.z);
        if (t.seekT <= 0 || (t.target && !t.target.alive)) {
          t.seekT = 0.25; t.target = null; let bd = TURRET.range;
          for (const z of G.zombies.list) {
            if (!z.alive) continue;
            const d = Math.hypot(z.pos.x - t.pos.x, z.pos.z - t.pos.z);
            if (d < bd && G.world.lineOfSight(eye, aim.set(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z))) { bd = d; t.target = z; }
          }
        }
        const z = t.target;
        if (z) {
          const want = Math.atan2(-(z.pos.x - t.pos.x), -(z.pos.z - t.pos.z));
          t.yaw += BZ.wrapAngle(want - t.yaw) * Math.min(1, dt * 12);
          const dy = z.pos.y + 1.1 * z.T.scale - 1.05; const dh = Math.hypot(z.pos.x - t.pos.x, z.pos.z - t.pos.z);
          t.head.rotation.x = BZ.damp(t.head.rotation.x, Math.atan2(dy, dh), 10, dt);
          t.cool -= dt;
          if (t.cool <= 0 && Math.abs(BZ.wrapAngle(want - t.yaw)) < 0.2) {
            t.cool = 60 / TURRET.rpm / (G.build.has('fortress') ? 1.5 : 1); t.ammo--;
            const side = t.ammo % 2 ? 0.11 : -0.11;
            const muzzle = new THREE.Vector3(side, 0, -0.9).applyEuler(new THREE.Euler(t.head.rotation.x, t.yaw, 0, 'YXZ')).add(eye);
            const hit = G.rng.chance(TURRET.accuracy);
            const end = new THREE.Vector3(z.pos.x + (hit ? 0 : G.rng.range(-0.7, 0.7)), z.pos.y + 1.0 * z.T.scale + (hit ? 0 : G.rng.range(0.2, 0.8)), z.pos.z);
            G.fx.tracer(muzzle, end);
            if (t.ammo % 3 === 0) G.fx.muzzle(muzzle);
            G.audio.playAt('turret', t.pos, { gain: 0.55 });
            t.head.position.z = 0.06;
            if (hit) {
              const dir = new THREE.Vector3(z.pos.x - t.pos.x, 0, z.pos.z - t.pos.z).normalize();
              const died = G.zombies.damage(z, TURRET.dmg, 'body', dir, 0.5);
              if (died) t.target = null;
            }
          }
        } else t.yaw += dt * 0.6;
        t.head.rotation.y = t.yaw; t.head.position.z = BZ.damp(t.head.position.z, 0, 18, dt);
        t.bar.position.set(t.pos.x, 1.75, t.pos.z); t.bar.quaternion.copy(G.camera.quaternion);
        const k = Math.max(0.001, t.ammo / TURRET.ammo); t.bar.scale.x = k;
        if (t.ammo <= 0) removeTurret(i);
      }
    }
    function clear() {
      for (const b of bombs) scene.remove(b.m); bombs.length = 0;
      for (const s of shots) scene.remove(s.m); shots.length = 0;
      while (turrets.length) removeTurret(0);
      state.bombs = BOMB.start; state.cool = 0;
    }
    return { state, throwBomb, throwRock, fireRocket, explode, shots, placeTurret, removeTurret, update, clear, turrets, addBombs: (n) => { state.bombs = Math.min(G.build.bombCap(), state.bombs + n); }, debug: () => ({ bombs: bombs.length, turrets: turrets.length }) };
  };
})();
