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
      const head = new THREE.Mesh(G_HEAD, [m.skin, m.skin, m.skin, m.skin, m.face, m.skin]); head.position.y = 0.7; hips.add(head);
      head.add(new THREE.Mesh(G_HELMET, m.helmet));
      const gun = new THREE.Mesh(G_GUN, m.gun); gun.position.set(0.12, 0.62, 0.42); hips.add(gun);
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ map: BZ.tex('flash'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      flash.position.set(0, 0.02, 0.26); flash.visible = false; gun.add(flash);
      root.traverse((o) => { if (o.isMesh) o.castShadow = G.quality.shadow > 0; });
      const barBg = new THREE.Mesh(G_BAR, new THREE.MeshBasicMaterial({ color: 0x0c1a08, depthWrite: false }));
      const barFg = new THREE.Mesh(G_BAR, new THREE.MeshBasicMaterial({ color: 0x6cd44a, depthWrite: false })); barFg.position.z = 0.002; barBg.add(barFg);
      G.scene.add(root); G.scene.add(barBg);
      return { root, hips, legL, legR, head, gun, flash, mats: m, barBg, barFg };
    }

    function count() { return list.filter((a) => a.alive).length; }
    function hire() {
      if (count() >= ALLY.max) return false;
      const P = G.player;
      let a = list.find((q) => !q.alive && !q.dying);
      if (!a) { a = { body: makeBody(list.length), pos: new THREE.Vector3(), vel: new THREE.Vector3() }; list.push(a); }
      const slot = [0, 1, 2].find((s) => !list.some((q) => q.alive && q.slot === s));
      Object.assign(a, { alive: true, dying: 0, hp: ALLY.hp, slot, cool: 1, seekT: 0, target: null, phase: 0, flash: 0, yaw: P.yaw + Math.PI });
      a.pos.set(P.pos.x + G.rng.range(-1, 1), 0, P.pos.z + G.rng.range(-1, 1));
      a.body.root.visible = true; a.body.root.rotation.x = 0; a.body.root.position.y = 0;
      return true;
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
        // follow the formation slot behind the player
        const [sx, sb] = SLOTS[a.slot || 0];
        const fx = -Math.sin(P.yaw); const fz = -Math.cos(P.yaw);
        const tx = P.pos.x + Math.cos(P.yaw) * sx - fx * sb; const tz = P.pos.z - Math.sin(P.yaw) * sx - fz * sb;
        const dx = tx - a.pos.x; const dz = tz - a.pos.z; const dist = Math.hypot(dx, dz);
        const want = dist > 1 ? Math.min(ALLY.speed, dist * 2) : 0;
        a.vel.x = BZ.damp(a.vel.x, dist > 0.01 ? (dx / dist) * want : 0, 8, dt); a.vel.z = BZ.damp(a.vel.z, dist > 0.01 ? (dz / dist) * want : 0, 8, dt); a.vel.y = 0;
        G.world.moveBox(a.pos, a.vel, dt, 0.3, 1.8, out); a.pos.y = 0;
        // face the target, else the walking direction
        const sp = Math.hypot(a.vel.x, a.vel.z);
        const faceYaw = a.target ? Math.atan2(a.target.pos.x - a.pos.x, a.target.pos.z - a.pos.z) : sp > 0.4 ? Math.atan2(a.vel.x, a.vel.z) : a.yaw;
        a.yaw += BZ.wrapAngle(faceYaw - a.yaw) * Math.min(1, dt * 10);
        // shoot
        a.cool -= dt;
        if (a.target && a.cool <= 0 && Math.abs(BZ.wrapAngle(faceYaw - a.yaw)) < 0.25 && P.alive) {
          a.cool = G.rng.range(ALLY.fire[0], ALLY.fire[1]);
          const z = a.target; const muzzle = new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * 0.7, 1.35, a.pos.z + Math.cos(a.yaw) * 0.7);
          const hit = G.rng.chance(ALLY.accuracy); const head = hit && G.rng.chance(ALLY.head);
          const end = new THREE.Vector3(z.pos.x + (hit ? 0 : G.rng.range(-0.8, 0.8)), z.pos.y + (head ? 1.7 : 1.0) * z.T.scale + (hit ? 0 : G.rng.range(0.3, 0.9)), z.pos.z + (hit ? 0 : G.rng.range(-0.8, 0.8)));
          G.fx.tracer(muzzle, end); G.fx.muzzle(muzzle);
          G.audio.playAt('smg', a.pos, { gain: 0.45, rate: 0.9 });
          b.flash.visible = true; a.flash = 0.05; b.gun.position.z = 0.36;
          if (hit) {
            const dir = new THREE.Vector3(z.pos.x - a.pos.x, 0, z.pos.z - a.pos.z).normalize();
            const dmg = ALLY.dmg * (head ? 2 : 1);
            const died = G.zombies.damage(z, dmg, head ? 'head' : 'body', dir);
            G.ui.pop(String(dmg), 'dmg ally', new THREE.Vector3(z.pos.x, z.pos.y + 1.9 * z.T.scale, z.pos.z));
            if (died) a.target = null;
          }
        }
        if (a.flash > 0) { a.flash -= dt; if (a.flash <= 0) b.flash.visible = false; }
        b.gun.position.z = BZ.damp(b.gun.position.z, 0.42, 20, dt);
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
    function clear() { for (const a of list) { a.alive = false; a.dying = 0; a.body.root.visible = false; a.body.barBg.visible = false; } }
    return { list, hire, nearest, hurt, update, clear, count, debug: () => ({ allies: count() }) };
  };
})();
