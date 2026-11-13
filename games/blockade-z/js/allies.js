// Hired soldiers: follow the player in a loose formation and shoot the nearest zombie they can see.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const ALLY = { hp: 120, speed: 5.2, dmg: 20, head: 0.15, accuracy: 0.72, fire: [0.5, 0.75], range: 28, price: 400, max: 3 };
  BZ.ALLY = ALLY;
  const SLOTS = [[-1.7, 1.3], [1.7, 1.3], [0, 2.5]]; // [side, behind] relative to the player's facing

  const geo = (w, h, d, px, py, pz) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(px || 0, py, pz || 0); return g; };
  const G_LEG = geo(0.26, 0.75, 0.26, 0, -0.375);
  const G_TORSO = geo(0.52, 0.7, 0.3, 0, 0.35);
  const G_ARM = geo(0.2, 0.62, 0.2, 0, -0.28);
  const G_HEAD = geo(0.48, 0.48, 0.48, 0, 0.24);
  const G_HELMET = geo(0.56, 0.2, 0.56, 0, 0.5);
  const G_GUN = geo(0.09, 0.12, 0.62, 0, 0, -0.1);
  const G_BAR = new THREE.PlaneGeometry(0.7, 0.09);

  BZ.makeAllies = (G) => {
    const list = [];
    const mat = (key) => new THREE.MeshLambertMaterial({ map: BZ.tex(key) });

    // Legs hang off the hips; torso, arms, head and the gun sit on a chest pivot that twists toward the target
    // while the legs keep walking where they are going.
    const B = (w, h, d, x, y, z, m, parent) => { const mesh = new THREE.Mesh(geo(w, h, d, 0, 0, 0), m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
    function makeBody(i) {
      const m = { skin: mat('a_skin'), face: mat('a_face'), shirt: mat('sleeve'), pants: mat('a_pants'), helmet: mat('a_helmet'), gun: mat('g_body'),
        vest: mat(BZ.cellTex(0x3c4430)), pouch: mat(BZ.cellTex(0x4e5838)), boot: mat(BZ.cellTex(0x24201a)), strap: mat(BZ.cellTex(0x1e1c18)), glass: mat(BZ.cellTex(0x6ad0ff)) };
      m.glass.emissive = new THREE.Color(0x205a70);
      const root = new THREE.Group(); root.rotation.order = 'YXZ';
      const hips = new THREE.Group(); hips.position.y = 0.75; root.add(hips);
      const leg = (x) => {
        const g = new THREE.Group(); g.position.x = x; hips.add(g);
        g.add(new THREE.Mesh(G_LEG, m.pants));
        B(0.28, 0.12, 0.08, 0, -0.42, 0.13, m.pouch, g); B(0.29, 0.16, 0.32, 0, -0.68, 0.03, m.boot, g);
        return g;
      };
      const legL = leg(-0.13); const legR = leg(0.13);
      const chest = new THREE.Group(); hips.add(chest);
      chest.add(new THREE.Mesh(G_TORSO, m.shirt));
      B(0.56, 0.42, 0.36, 0, 0.42, 0, m.vest, chest);
      for (const x of [-0.16, 0, 0.16]) B(0.12, 0.14, 0.06, x, 0.32, 0.2, m.pouch, chest);
      B(0.4, 0.46, 0.18, 0, 0.4, -0.25, m.pouch, chest); B(0.42, 0.08, 0.2, 0, 0.66, -0.25, m.strap, chest);
      B(0.58, 0.08, 0.34, 0, 0.04, 0, m.strap, chest);
      const arm = (x) => {
        const g = new THREE.Group(); g.position.set(x, 0.64, 0); chest.add(g);
        g.add(new THREE.Mesh(G_ARM, m.shirt)); B(0.22, 0.12, 0.22, 0, -0.56, 0, m.boot, g); B(0.23, 0.14, 0.23, 0, -0.02, 0, m.vest, g);
        return g;
      };
      const armL = arm(-0.36); const armR = arm(0.36);
      const head = new THREE.Group(); head.position.y = 0.7; chest.add(head);
      head.add(new THREE.Mesh(G_HEAD, [m.skin, m.skin, m.skin, m.skin, m.face, m.skin]));
      head.add(new THREE.Mesh(G_HELMET, m.helmet));
      B(0.6, 0.06, 0.06, 0, 0.42, 0.27, m.strap, head); B(0.14, 0.09, 0.05, -0.11, 0.42, 0.3, m.glass, head); B(0.14, 0.09, 0.05, 0.11, 0.42, 0.3, m.glass, head);
      // the gun mount carries the issue carbine (or a picked-up gun) and takes the recoil
      const mount = new THREE.Group(); mount.position.set(0.1, 0.56, 0.36); chest.add(mount);
      const gun = new THREE.Group(); mount.add(gun);
      const carbine = BZ.worldGun('rifle'); carbine.rotation.y = Math.PI; carbine.scale.setScalar(0.8); gun.add(carbine);
      const held = new THREE.Group(); mount.add(held);
      const blade = new THREE.Group(); blade.position.set(0, -0.55, 0); blade.rotation.x = Math.PI / 2; armR.add(blade);
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ map: BZ.tex('flash'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      flash.visible = false; gun.add(flash);
      root.traverse((o) => { if (o.isMesh) o.castShadow = G.quality.shadow > 0; });
      const barBg = new THREE.Mesh(G_BAR, new THREE.MeshBasicMaterial({ color: 0x0c1a08, depthWrite: false }));
      const barFg = new THREE.Mesh(G_BAR, new THREE.MeshBasicMaterial({ color: 0x6cd44a, depthWrite: false })); barFg.position.z = 0.002; barBg.add(barFg);
      G.scene.add(root); G.scene.add(barBg);
      return { root, hips, chest, legL, legR, head, gun, mount, flash, mats: m, barBg, barFg, armL, armR, held, blade };
    }

    function count() { return list.filter((a) => a.alive).length; }
    function hire() {
      if (count() >= ALLY.max) return false;
      const P = G.player;
      let a = list.find((q) => !q.alive && !q.dying);
      if (!a) { a = { body: makeBody(list.length), pos: new THREE.Vector3(), vel: new THREE.Vector3() }; list.push(a); }
      const slot = [0, 1, 2].find((s) => !list.some((q) => q.alive && q.slot === s));
      Object.assign(a, { alive: true, dying: 0, hp: ALLY.hp, slot, cool: 1, seekT: 0, target: null, phase: 0, flash: 0, yaw: P.yaw + Math.PI, fetch: null, lookT: 0, swingT: 0,
        twist: 0, lean: 0, aimK: 0, shots: 0, cReload: 0, cheer: 0, headYaw: 0, headT: 0, kick: BZ.spring(260, 18), flinch: BZ.spring(160, 12) });
      equip(a, null);
      a.pos.set(P.pos.x + G.rng.range(-1, 1), 0, P.pos.z + G.rng.range(-1, 1));
      a.body.root.visible = true; a.body.root.rotation.x = 0; a.body.root.position.y = 0;
      return true;
    }
    // weapon handling: a soldier carries one picked-up weapon (or the issue carbine when w is null)
    function equip(a, w) {
      const b = a.body; a.weap = w;
      for (const g of [b.held, b.blade]) while (g.children.length) g.remove(g.children[0]);
      b.gun.visible = !w;
      if (w) {
        const W = BZ.WEAPONS[w.id]; const m = BZ.worldGun(w.id);
        if (W.melee) { m.scale.setScalar(0.95); b.blade.add(m); }
        else { m.rotation.y = Math.PI; m.scale.setScalar(0.95); b.held.add(m); const f = b.flash; f.position.set(0, BZ.GUN_PARTS[w.id].muzzle[1], -BZ.GUN_PARTS[w.id].muzzle[2]); b.held.add(f); }
        a.reload = 0;
      } else { b.gun.add(b.flash); b.flash.position.set(0, 0.044, 0.8); }
    }
    function nearest(pos, maxD) {
      let best = null; let bd = maxD;
      for (const a of list) { if (!a.alive) continue; const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z); if (d < bd) { bd = d; best = a; } }
      return best;
    }
    function hurt(a, dmg) {
      if (!a.alive) return;
      a.hp -= dmg; a.flash = 0.1; if (a.flinch) a.flinch.v += 9;
      G.fx.burst(new THREE.Vector3(a.pos.x, 1.2, a.pos.z), 5, [0xb3201a, 0x7a1410], { size: 0.1 });
      if (a.hp <= 0) {
        a.alive = false; a.dying = 0.001; a.body.barBg.visible = false;
        G.audio.playAt('hurt', a.pos, { gain: 0.9 });
        G.ui.banner('LÍNH NGÃ', 'còn ' + count() + ' lính', 1.6);
      }
    }

    const eye = new THREE.Vector3(); const aim = new THREE.Vector3(); const out = {};
    function update(dt) {
      if (G.coop && G.coop.guest) { puppets(dt); return; }
      const P = G.player;
      for (const a of list) {
        const b = a.body;
        if (a.dying) {
          a.dying += dt; const k1 = Math.min(1, a.dying / 0.25); const k2 = Math.max(0, Math.min(1, (a.dying - 0.2) / 0.35));
          b.legL.rotation.x = b.legR.rotation.x = 0.9 * k1 * (1 - k2); b.hips.position.y = 0.75 - 0.25 * k1 * (1 - k2);
          b.root.rotation.x = -k2 * k2 * Math.PI / 2; b.armL.rotation.set(-2.6 * k2, 0, -0.4 * k2); b.armR.rotation.set(-2.4 * k2, 0, 0.5 * k2); b.head.rotation.x = -0.4 * k2;
          if (a.dying > 2.5) { a.dying = 0; b.root.visible = false; }
          continue;
        }
        if (!a.alive) continue;
        // pick a target a few times a second
        a.seekT -= dt;
        if (a.seekT <= 0) {
          a.seekT = 0.3; a.target = null; let bd = ALLY.range;
          eye.set(a.pos.x, 1.55, a.pos.z);
          for (const z of G.zombies.list) {
            if (!z.alive) continue;
            const d = Math.hypot(z.pos.x - a.pos.x, z.pos.z - a.pos.z);
            if (d < bd && G.world.lineOfSight(eye, aim.set(z.pos.x, z.pos.y + 1.2 * z.T.scale, z.pos.z))) { bd = d; a.target = z; }
          }
        }
        if (a.target && !a.target.alive) a.target = null;
        const WP = a.weap && BZ.WEAPONS[a.weap.id]; const melee = WP && WP.melee;
        let tx; let tz; let stop = 1;
        if (melee && a.target && Math.hypot(a.target.pos.x - P.pos.x, a.target.pos.z - P.pos.z) < 14) { tx = a.target.pos.x; tz = a.target.pos.z; stop = WP.range * 0.6; }
        else {
          // follow the formation slot behind the player
          const [sx, sb] = SLOTS[a.slot || 0];
          const fx = -Math.sin(P.yaw); const fz = -Math.cos(P.yaw);
          tx = P.pos.x + Math.cos(P.yaw) * sx - fx * sb; tz = P.pos.z - Math.sin(P.yaw) * sx - fz * sb;
        }
        const dx = tx - a.pos.x; const dz = tz - a.pos.z; const dist = Math.hypot(dx, dz);
        const want = dist > stop ? Math.min(ALLY.speed * (melee ? 1.15 : 1), dist * 2 + 1) : 0;
        a.vel.x = BZ.damp(a.vel.x, dist > 0.01 ? (dx / dist) * want : 0, 8, dt); a.vel.z = BZ.damp(a.vel.z, dist > 0.01 ? (dz / dist) * want : 0, 8, dt); a.vel.y = 0;
        G.world.moveBox(a.pos, a.vel, dt, 0.3, 1.8, out, 0.45); a.vel.y -= 20 * dt;
        // face the target, else the walking direction
        const sp = Math.hypot(a.vel.x, a.vel.z);
        const faceYaw = a.target ? Math.atan2(a.target.pos.x - a.pos.x, a.target.pos.z - a.pos.z) : sp > 0.4 ? Math.atan2(a.vel.x, a.vel.z) : a.yaw + a.twist;
        const legYaw = sp > 0.6 ? Math.atan2(a.vel.x, a.vel.z) : faceYaw;
        // walking backwards reads badly: if the target is behind the walk, turn the legs around and back-pedal
        let ly = legYaw; if (Math.abs(BZ.wrapAngle(faceYaw - ly)) > 1.9) ly += Math.PI;
        a.yaw += BZ.wrapAngle(ly - a.yaw) * Math.min(1, dt * 8);
        a.twist = BZ.damp(a.twist, BZ.clamp(BZ.wrapAngle(faceYaw - a.yaw), -1.3, 1.3), 12, dt);
        // shoot
        a.cool -= dt; a.swingT = Math.max(0, a.swingT - dt);
        if (a.reload > 0) { a.reload -= dt; if (a.reload <= 0) { const n = Math.min(WP.mag, a.weap.reserve); a.weap.mag = n; if (a.weap.reserve !== Infinity) a.weap.reserve -= n; } }
        if (melee) {
          const z = a.target; const zd = z ? Math.hypot(z.pos.x - a.pos.x, z.pos.z - a.pos.z) : 99;
          if (z && a.cool <= 0 && zd < WP.range + 0.3 && P.alive) {
            a.cool = WP.swing * 1.5; a.swingT = WP.swing;
            setTimeout(() => G.audio.playAt(WP.snd, a.pos, { gain: 0.6 }), WP.hitAt * 600);
            a.pendingHit = { z, t: WP.hitAt * 1.3 };
          }
          if (a.pendingHit) {
            a.pendingHit.t -= dt;
            if (a.pendingHit.t <= 0) {
              const z = a.pendingHit.z; a.pendingHit = null;
              if (z.alive && Math.hypot(z.pos.x - a.pos.x, z.pos.z - a.pos.z) < WP.range + 0.6) {
                const dir = new THREE.Vector3(z.pos.x - a.pos.x, 0, z.pos.z - a.pos.z).normalize();
                const part = G.rng.chance(0.2) ? 'head' : G.rng.chance(0.25) ? 'leg' : 'body';
                const dmg = Math.round(WP.dmg * 0.8 * (part === 'head' ? WP.head : 1));
                const died = G.zombies.damage(z, dmg, part, dir, WP.impulse, { cut: WP.cut });
                G.audio.playAt(WP.hitSnd, z.pos, { gain: 0.8 });
                G.fx.burst(new THREE.Vector3(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z), 14, WP.cut === 'saber' ? [0xffc060, 0x80f0ff] : [0xc0281e, 0x8a1410], { dir, push: 4, size: 0.08 });
                G.ui.pop(String(dmg), 'dmg ally', new THREE.Vector3(z.pos.x, z.pos.y + 1.9 * z.T.scale, z.pos.z));
                if (died) a.target = null;
              }
            }
          }
        } else if (a.target && a.cool <= 0 && !(a.reload > 0) && !(a.cReload > 0) && Math.abs(BZ.wrapAngle(faceYaw - (a.yaw + a.twist))) < 0.3 && P.alive) {
          if (!WP && ++a.shots >= 24) { a.shots = 0; a.cReload = 1.5; G.audio.playAt('mag_out', a.pos, { gain: 0.5 }); setTimeout(() => G.audio.playAt('mag_in', a.pos, { gain: 0.5 }), 900); }
          a.kick.v += WP && WP.rocket ? 14 : 6;
          a.cool = (WP ? Math.max(60 / WP.rpm * (WP.auto ? 1.5 : 1.2), 0.12) * G.rng.range(0.9, 1.2) : G.rng.range(ALLY.fire[0], ALLY.fire[1])) / (G.build.has('fortress') ? 1.5 : 1);
          const z = a.target; const muzzle = new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * 0.7, 1.35, a.pos.z + Math.cos(a.yaw) * 0.7);
          if (WP) { a.weap.mag--; if (a.weap.mag <= 0) { if (a.weap.reserve > 0) a.reload = WP.reload || 2; else equip(a, null); } }
          const hit = G.rng.chance(ALLY.accuracy); const head = hit && G.rng.chance(ALLY.head);
          const end = new THREE.Vector3(z.pos.x + (hit ? 0 : G.rng.range(-0.8, 0.8)), z.pos.y + (head ? 1.7 : 1.0) * z.T.scale + (hit ? 0 : G.rng.range(0.3, 0.9)), z.pos.z + (hit ? 0 : G.rng.range(-0.8, 0.8)));
          if (WP && WP.rocket) {
            G.gear.fireRocket(muzzle.clone().setY(1.45), new THREE.Vector3(z.pos.x - muzzle.x, z.pos.y + 1.0 * z.T.scale - 1.45, z.pos.z - muzzle.z).normalize());
            G.audio.playAt('rocket', a.pos, { gain: 0.7 }); G.fx.muzzle(muzzle); b.flash.visible = true; a.flash = 0.08;
          } else {
          G.fx.tracer(muzzle, end); G.fx.muzzle(muzzle);
          G.audio.playAt(WP ? WP.snd : 'smg', a.pos, { gain: 0.45, rate: 0.9 });
          b.flash.visible = true; a.flash = 0.05; b.flash.rotation.z = G.rng.next() * 3;
          if (hit) {
            const dir = new THREE.Vector3(z.pos.x - a.pos.x, 0, z.pos.z - a.pos.z).normalize();
            const dmg = Math.round((WP ? WP.dmg * WP.pellets * 0.75 : ALLY.dmg) * (head ? 2 : 1));
            const died = G.zombies.damage(z, dmg, head ? 'head' : 'body', dir, WP ? WP.impulse : 0.6);
            G.ui.pop(String(dmg), 'dmg ally', new THREE.Vector3(z.pos.x, z.pos.y + 1.9 * z.T.scale, z.pos.z));
            if (died) a.target = null;
          }
          }
        }
        if (a.flash > 0) { a.flash -= dt; if (a.flash <= 0) b.flash.visible = false; }
        // ---------- animation ----------
        a.cReload = Math.max(0, a.cReload - dt); a.cheer = Math.max(0, a.cheer - dt);
        const kick = a.kick.step(dt); const flinch = a.flinch.step(dt);
        const fwdSp = (a.vel.x * Math.sin(a.yaw) + a.vel.z * Math.cos(a.yaw));
        const run = Math.min(1, sp / ALLY.speed);
        a.phase += dt * sp * 2.6 * (fwdSp < -0.3 ? -1 : 1);
        const aiming = !!a.target && !melee;
        a.aimK = BZ.damp(a.aimK, aiming ? 1 : 0, 8, dt);
        a.lean = BZ.damp(a.lean, run * (aiming ? 0.08 : 0.22), 6, dt);
        const swing = Math.sin(a.phase); const lift = Math.max(0, Math.cos(a.phase));
        // legs: stride with a knee lift, a soft crouch when aiming still
        b.legL.rotation.x = swing * 0.75 * Math.min(1, sp / 2) - lift * 0.1 * run; b.legR.rotation.x = -swing * 0.75 * Math.min(1, sp / 2) - Math.max(0, -Math.cos(a.phase)) * 0.1 * run;
        const crouch = a.aimK * (1 - run) * 0.06;
        b.hips.position.y = 0.75 - crouch + Math.abs(Math.cos(a.phase)) * 0.05 * Math.min(1, sp / 1.5);
        b.hips.rotation.z = swing * 0.05 * run;
        // chest: twist toward the target, lean into the run, kick back on each shot, flinch when hit
        b.chest.rotation.set(a.lean - kick * 0.02 - flinch * 0.03, a.twist, -swing * 0.04 * run + flinch * 0.02);
        b.mount.position.z = 0.36 - kick * 0.012;
        // head: tracks the target, otherwise glances around now and then
        a.headT -= dt; if (a.headT <= 0) { a.headT = G.rng.range(1.2, 3); a.headYaw = G.rng.range(-0.7, 0.7); }
        b.head.rotation.y = BZ.damp(b.head.rotation.y, aiming ? 0.08 : a.headYaw * (1 - run), 6, dt);
        b.head.rotation.x = BZ.damp(b.head.rotation.x, aiming ? 0.05 : -0.04 + Math.sin(performance.now() / 900 + a.slot) * 0.04, 6, dt) - kick * 0.01;
        // arms
        const breathe = Math.sin(performance.now() / 700 + (a.slot || 0)) * 0.03;
        if (melee) {
          const k = a.swingT > 0 ? 1 - a.swingT / WP.swing : 1;
          b.armR.rotation.x = a.swingT > 0 ? (k < 0.35 ? BZ.lerp(-1.3, -2.9, k / 0.35) : BZ.lerp(-2.9, -0.5, Math.min(1, (k - 0.35) / 0.3))) : -1.0 + swing * 0.3 * run + breathe;
          b.armR.rotation.z = a.swingT > 0 ? -0.3 : 0.1; b.armL.rotation.set(-0.3 - swing * 0.6 * run, 0.1, -0.2);
          if (a.swingT > 0) b.chest.rotation.y += Math.sin(k * Math.PI) * 0.5;
        } else {
          // gun up at the shoulder when aiming, carried low across the body when running; a magazine change dips it
          const low = (1 - a.aimK) * (0.35 + run * 0.25);
          const rl = a.cReload > 0 || a.reload > 0 ? Math.sin(Math.min(1, (a.cReload || 1.5 - (a.reload || 0)) / 1.5) * Math.PI) : 0;
          b.armR.rotation.set(-1.42 + low + rl * 0.5 + kick * 0.03 + breathe, -0.18, 0);
          b.armL.rotation.set(-1.28 + low * 0.8 - rl * 0.9, 0.5 - rl * 0.4, rl * 0.3);
          b.mount.rotation.set(-low * 0.9 + rl * 0.6 - kick * 0.02, low * 0.5, low * 0.6 + rl * 0.5);
          b.mount.position.y = 0.56 - low * 0.18 - rl * 0.1;
        }
        // cheering after a cleared wave: gun hand up, a little hop
        if (a.cheer > 0) {
          const ck = Math.sin(Math.min(1, a.cheer / 1.6) * Math.PI);
          b.armR.rotation.x = BZ.lerp(b.armR.rotation.x, -2.9, ck); b.mount.rotation.x = BZ.lerp(b.mount.rotation.x, -1.4, ck);
          b.hips.position.y += Math.abs(Math.sin(a.cheer * 9)) * 0.18 * ck;
        }
        b.root.position.copy(a.pos); b.root.rotation.y = a.yaw;
        for (const m of Object.values(b.mats)) m.emissive.setHex(a.flash > 0.05 ? 0xb01010 : 0);
        b.barBg.visible = a.hp < ALLY.hp;
        if (b.barBg.visible) { b.barBg.position.set(a.pos.x, 2.25, a.pos.z); b.barBg.quaternion.copy(G.camera.quaternion); const k = Math.max(0.001, a.hp / ALLY.hp); b.barFg.scale.x = k; b.barFg.position.x = -0.35 * (1 - k); }
      }
    }
    G.events.on('wave:end', () => { for (const a of list) if (a.alive) a.cheer = 1.6; });
    // co-op guests: the host's soldiers, placed from the snapshot ([x, z, yaw]) and animated walking with the gun up
    function mirror(rows) {
      rows = rows || [];
      while (list.length < rows.length) list.push({ body: makeBody(list.length), pos: new THREE.Vector3(), vel: new THREE.Vector3() });
      list.forEach((a, i) => {
        const r = rows[i];
        if (!r) { if (a.puppet) { a.alive = false; a.body.root.visible = false; a.body.barBg.visible = false; } return; }
        if (!a.alive || !a.puppet) { Object.assign(a, { alive: true, puppet: true, dying: 0, hp: ALLY.hp, phase: 0, slot: i, weap: null, kick: BZ.spring(260, 18), flinch: BZ.spring(160, 12) }); a.pos.set(r[0], 0, r[1]); a.yaw = r[2]; a.body.root.visible = true; a.body.root.rotation.x = 0; }
        a.net = r;
      });
    }
    function puppets(dt) {
      for (const a of list) {
        if (!a.alive || !a.puppet || !a.net) continue;
        const b = a.body; const bx = a.pos.x; const bz = a.pos.z;
        a.pos.x = BZ.damp(a.pos.x, a.net[0], 12, dt); a.pos.z = BZ.damp(a.pos.z, a.net[1], 12, dt);
        a.yaw += BZ.wrapAngle(a.net[2] - a.yaw) * Math.min(1, dt * 12);
        const sp = Math.hypot(a.pos.x - bx, a.pos.z - bz) / Math.max(dt, 1e-3);
        a.phase += dt * sp * 2.6; const sw = Math.sin(a.phase) * Math.min(1, sp / 2) * 0.75;
        b.legL.rotation.x = sw; b.legR.rotation.x = -sw; b.hips.position.y = 0.75 + Math.abs(Math.cos(a.phase)) * 0.05 * Math.min(1, sp / 1.5);
        b.chest.rotation.set(Math.min(1, sp / 5) * 0.15, 0, 0); b.armR.rotation.set(-1.42, -0.18, 0); b.armL.rotation.set(-1.28, 0.5, 0); b.mount.rotation.set(0, 0, 0);
        b.root.position.set(a.pos.x, 0, a.pos.z); b.root.rotation.y = a.yaw; b.barBg.visible = false;
      }
    }
    function clear() { for (const a of list) { a.alive = false; a.dying = 0; a.fetch = null; a.pendingHit = null; equip(a, null); a.body.root.visible = false; a.body.barBg.visible = false; } }
    return { list, hire, nearest, hurt, update, clear, count, mirror, debug: () => ({ allies: count() }) };
  };
})();
