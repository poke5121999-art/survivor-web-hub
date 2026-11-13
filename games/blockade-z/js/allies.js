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

    function makeBody(i) {
      const m = { skin: mat('a_skin'), face: mat('a_face'), shirt: mat('sleeve'), pants: mat('a_pants'), helmet: mat('a_helmet'), gun: mat('g_body') };
      const root = new THREE.Group(); root.rotation.order = 'YXZ';
      const hips = new THREE.Group(); hips.position.y = 0.75; root.add(hips);
      const legL = new THREE.Mesh(G_LEG, m.pants); legL.position.x = -0.13; hips.add(legL);
      const legR = new THREE.Mesh(G_LEG, m.pants); legR.position.x = 0.13; hips.add(legR);
      hips.add(new THREE.Mesh(G_TORSO, m.shirt));
      const armL = new THREE.Mesh(G_ARM, m.shirt); armL.position.set(-0.36, 0.64, 0); armL.rotation.set(-1.25, 0.5, 0); hips.add(armL);
      const armR = new THREE.Mesh(G_ARM, m.shirt); armR.position.set(0.36, 0.64, 0); armR.rotation.set(-1.4, -0.2, 0); hips.add(armR);
      // a weapon picked up off the ground: guns sit where the carbine sits, blades go in the right hand
      const held = new THREE.Group(); held.position.set(0.12, 0.62, 0.42); hips.add(held);
      const blade = new THREE.Group(); blade.position.set(0, -0.55, 0); blade.rotation.x = Math.PI / 2; armR.add(blade);
      const head = new THREE.Mesh(G_HEAD, [m.skin, m.skin, m.skin, m.skin, m.face, m.skin]); head.position.y = 0.7; hips.add(head);
      head.add(new THREE.Mesh(G_HELMET, m.helmet));
      const gun = new THREE.Mesh(G_GUN, m.gun); gun.position.set(0.12, 0.62, 0.42); hips.add(gun);
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ map: BZ.tex('flash'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      flash.position.set(0, 0.02, 0.26); flash.visible = false; gun.add(flash);
      root.traverse((o) => { if (o.isMesh) o.castShadow = G.quality.shadow > 0; });
      const barBg = new THREE.Mesh(G_BAR, new THREE.MeshBasicMaterial({ color: 0x0c1a08, depthWrite: false }));
      const barFg = new THREE.Mesh(G_BAR, new THREE.MeshBasicMaterial({ color: 0x6cd44a, depthWrite: false })); barFg.position.z = 0.002; barBg.add(barFg);
      G.scene.add(root); G.scene.add(barBg);
      return { root, hips, legL, legR, head, gun, flash, mats: m, barBg, barFg, armL, armR, held, blade };
    }

    function count() { return list.filter((a) => a.alive).length; }
    function hire() {
      if (count() >= ALLY.max) return false;
      const P = G.player;
      let a = list.find((q) => !q.alive && !q.dying);
      if (!a) { a = { body: makeBody(list.length), pos: new THREE.Vector3(), vel: new THREE.Vector3() }; list.push(a); }
      const slot = [0, 1, 2].find((s) => !list.some((q) => q.alive && q.slot === s));
      Object.assign(a, { alive: true, dying: 0, hp: ALLY.hp, slot, cool: 1, seekT: 0, target: null, phase: 0, flash: 0, yaw: P.yaw + Math.PI, fetch: null, lookT: 0, swingT: 0 });
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
      } else { b.gun.add(b.flash); b.flash.position.set(0, 0.02, 0.26); }
    }
    function dropWeap(a) {
      if (!a.weap) return;
      G.weapons.spawnGround(a.weap.id, a.weap.mag, a.weap.reserve, new THREE.Vector3(a.pos.x, a.pos.y + 1, a.pos.z), new THREE.Vector3(G.rng.range(-1.5, 1.5), 3, G.rng.range(-1.5, 1.5)));
      equip(a, null);
    }
    // look for an unclaimed weapon on the ground near this soldier and not far from the player
    function lookForWeapon(a) {
      if (a.weap || a.fetch) return;
      const P = G.player; let best = null; let bd = 14;
      for (const it of G.weapons.ground) {
        if (it.claim || !it.rest) continue;
        const W = BZ.WEAPONS[it.id]; if (!W.melee && it.mag + (it.reserve === Infinity ? 1e9 : it.reserve) <= 0) continue;
        const d = Math.hypot(it.pos.x - a.pos.x, it.pos.z - a.pos.z);
        if (d < bd && Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z) < 20 && Math.abs(it.pos.y - a.pos.y) < 1.5) { bd = d; best = it; }
      }
      if (best) { a.fetch = best; best.claim = a; }
    }
    function nearest(pos, maxD) {
      let best = null; let bd = maxD;
      for (const a of list) { if (!a.alive) continue; const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z); if (d < bd) { bd = d; best = a; } }
      return best;
    }
    function hurt(a, dmg) {
      if (!a.alive) return;
      a.hp -= dmg; a.flash = 0.1;
      G.fx.burst(new THREE.Vector3(a.pos.x, 1.2, a.pos.z), 5, [0xb3201a, 0x7a1410], { size: 0.1 });
      if (a.hp <= 0) {
        a.alive = false; a.dying = 0.001; a.body.barBg.visible = false;
        if (a.fetch) { a.fetch.claim = null; a.fetch = null; }
        dropWeap(a);
        G.audio.playAt('hurt', a.pos, { gain: 0.9 });
        G.ui.banner('LÍNH NGÃ', 'còn ' + count() + ' lính', 1.6);
      }
    }

    const eye = new THREE.Vector3(); const aim = new THREE.Vector3(); const out = {};
    function update(dt) {
      const P = G.player;
      for (const a of list) {
        const b = a.body;
        if (a.dying) {
          a.dying += dt; b.root.rotation.x = -Math.min(1, a.dying / 0.4) * Math.PI / 2;
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
        a.lookT -= dt; if (a.lookT <= 0) { a.lookT = 0.5; lookForWeapon(a); }
        if (a.fetch && !G.weapons.ground.includes(a.fetch)) a.fetch = null;
        const WP = a.weap && BZ.WEAPONS[a.weap.id]; const melee = WP && WP.melee;
        let tx; let tz; let stop = 1;
        if (a.fetch) { tx = a.fetch.pos.x; tz = a.fetch.pos.z; stop = 0.2; }
        else if (melee && a.target && Math.hypot(a.target.pos.x - P.pos.x, a.target.pos.z - P.pos.z) < 14) { tx = a.target.pos.x; tz = a.target.pos.z; stop = WP.range * 0.6; }
        else {
          // follow the formation slot behind the player
          const [sx, sb] = SLOTS[a.slot || 0];
          const fx = -Math.sin(P.yaw); const fz = -Math.cos(P.yaw);
          tx = P.pos.x + Math.cos(P.yaw) * sx - fx * sb; tz = P.pos.z - Math.sin(P.yaw) * sx - fz * sb;
        }
        const dx = tx - a.pos.x; const dz = tz - a.pos.z; const dist = Math.hypot(dx, dz);
        const want = dist > stop ? Math.min(ALLY.speed * (a.fetch || melee ? 1.15 : 1), dist * 2 + 1) : 0;
        if (a.fetch && dist < 0.9) { const w = G.weapons.takeGround(a.fetch); a.fetch = null; equip(a, w); G.audio.playAt('clank', a.pos, { gain: 0.6 }); G.ui.pop('lính nhặt ' + BZ.WEAPONS[w.id].name, 'heal', new THREE.Vector3(a.pos.x, 2.3, a.pos.z)); }
        a.vel.x = BZ.damp(a.vel.x, dist > 0.01 ? (dx / dist) * want : 0, 8, dt); a.vel.z = BZ.damp(a.vel.z, dist > 0.01 ? (dz / dist) * want : 0, 8, dt); a.vel.y = 0;
        G.world.moveBox(a.pos, a.vel, dt, 0.3, 1.8, out, 0.45); a.vel.y -= 20 * dt;
        // face the target, else the walking direction
        const sp = Math.hypot(a.vel.x, a.vel.z);
        const faceYaw = a.target ? Math.atan2(a.target.pos.x - a.pos.x, a.target.pos.z - a.pos.z) : sp > 0.4 ? Math.atan2(a.vel.x, a.vel.z) : a.yaw;
        a.yaw += BZ.wrapAngle(faceYaw - a.yaw) * Math.min(1, dt * 10);
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
        } else if (a.target && a.cool <= 0 && !(a.reload > 0) && Math.abs(BZ.wrapAngle(faceYaw - a.yaw)) < 0.25 && P.alive) {
          a.cool = WP ? Math.max(60 / WP.rpm * (WP.auto ? 1.5 : 1.2), 0.12) * G.rng.range(0.9, 1.2) : G.rng.range(ALLY.fire[0], ALLY.fire[1]);
          const z = a.target; const muzzle = new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * 0.7, 1.35, a.pos.z + Math.cos(a.yaw) * 0.7);
          if (WP) { a.weap.mag--; if (a.weap.mag <= 0) { if (a.weap.reserve > 0) a.reload = WP.reload || 2; else { dropWeap(a); } } }
          const hit = G.rng.chance(ALLY.accuracy); const head = hit && G.rng.chance(ALLY.head);
          const end = new THREE.Vector3(z.pos.x + (hit ? 0 : G.rng.range(-0.8, 0.8)), z.pos.y + (head ? 1.7 : 1.0) * z.T.scale + (hit ? 0 : G.rng.range(0.3, 0.9)), z.pos.z + (hit ? 0 : G.rng.range(-0.8, 0.8)));
          if (WP && WP.rocket) {
            G.gear.fireRocket(muzzle.clone().setY(1.45), new THREE.Vector3(z.pos.x - muzzle.x, z.pos.y + 1.0 * z.T.scale - 1.45, z.pos.z - muzzle.z).normalize());
            G.audio.playAt('rocket', a.pos, { gain: 0.7 }); G.fx.muzzle(muzzle); b.flash.visible = true; a.flash = 0.08;
          } else {
          G.fx.tracer(muzzle, end); G.fx.muzzle(muzzle);
          G.audio.playAt(WP ? WP.snd : 'smg', a.pos, { gain: 0.45, rate: 0.9 });
          b.flash.visible = true; a.flash = 0.05; b.gun.position.z = 0.36;
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
        b.gun.position.z = BZ.damp(b.gun.position.z, 0.42, 20, dt);
        // arms: a blade wielder raises the sword and chops; a gunner keeps the gun up
        if (melee) {
          const k = a.swingT > 0 ? 1 - a.swingT / WP.swing : 1;
          b.armR.rotation.x = a.swingT > 0 ? (k < 0.35 ? BZ.lerp(-1.3, -2.9, k / 0.35) : BZ.lerp(-2.9, -0.5, Math.min(1, (k - 0.35) / 0.3))) : -1.3 + Math.sin(a.phase * 0.5) * 0.08;
          b.armR.rotation.z = a.swingT > 0 ? -0.3 : 0; b.armL.rotation.set(-0.6, 0.2, 0);
        } else { b.armR.rotation.set(-1.4, -0.2, 0); b.armL.rotation.set(-1.25, 0.5, 0); }
        // animate
        a.phase += dt * sp * 2.6;
        const sw = Math.sin(a.phase) * Math.min(1, sp / 2) * 0.7;
        b.legL.rotation.x = sw; b.legR.rotation.x = -sw;
        b.hips.position.y = 0.75 + Math.abs(Math.cos(a.phase)) * 0.04 * Math.min(1, sp);
        b.root.position.copy(a.pos); b.root.rotation.y = a.yaw;
        for (const m of Object.values(b.mats)) m.emissive.setHex(a.flash > 0.05 ? 0xb01010 : 0);
        b.barBg.visible = a.hp < ALLY.hp;
        if (b.barBg.visible) { b.barBg.position.set(a.pos.x, 2.25, a.pos.z); b.barBg.quaternion.copy(G.camera.quaternion); const k = Math.max(0.001, a.hp / ALLY.hp); b.barFg.scale.x = k; b.barFg.position.x = -0.35 * (1 - k); }
      }
    }
    function clear() { for (const a of list) { a.alive = false; a.dying = 0; a.fetch = null; a.pendingHit = null; equip(a, null); a.body.root.visible = false; a.body.barBg.visible = false; } }
    return { list, hire, nearest, hurt, update, clear, count, debug: () => ({ allies: count() }) };
  };
})();
