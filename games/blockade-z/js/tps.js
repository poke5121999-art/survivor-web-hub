// Over-the-shoulder third-person view: the camera sits behind and right of the hero's head, pulls in when a wall is
// in the way, and the hero's own body runs, jumps, aims, recoils, swings and casts on screen. The crosshair still
// aims along the camera ray; aim rays start level with the hero so nothing between the camera and the hero is hit.
// First person (the blocky viewmodel) is the default; V or the on-screen button switches, ?tp=1 starts in third person.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  BZ.makeTps = (G) => {
    const T = { on: BZ.params.tp === '1', dist: 3.6, model: null, hero: null, gun: null };
    const V = () => new THREE.Vector3();
    const pivot = V(); const fwd = V(); const right = V(); const up = V(); const want = V(); const tmp = V();
    const sp = { kick: BZ.spring(180, 14), kickL: BZ.spring(180, 14), cast: 0, swing: 0, shots: 0, land: BZ.spring(160, 12), lean: 0, phase: 0, air: 0 };
    let curDist = 3.6;

    const btn = document.getElementById('viewbtn');
    const label = () => { if (btn) btn.querySelector('span').textContent = T.on ? 'NGÔI 3' : 'NGÔI 1'; };
    function toggle() { T.on = !T.on; label(); G.ui.announce(T.on ? 'GÓC NHÌN THỨ BA' : 'GÓC NHÌN THỨ NHẤT', 'phím V hoặc nút góc phải để đổi', ''); }
    addEventListener('keydown', (e) => { if (e.code === 'KeyV' && G.state === 'playing') toggle(); });
    if (btn) {
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); }, { passive: false });
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      label();
    }
    T.toggle = toggle;

    function build() {
      const id = G.hero && G.hero.def ? G.hero.def.id : null; if (!id) return;
      const wid = G.weapons.cur();
      if (T.model && T.hero === id && T.gun === wid) return;
      if (T.model) G.scene.remove(T.model.root);
      const m = BZ.heroModel(id); const hand = m.handR;
      const eq = BZ.equipWeapon(m, wid);
      G.scene.add(m.root); T.model = { ...m, hand, tip: eq.tip, tipL: eq.tipL, gun: eq.gun, shield: eq.shield }; T.hero = id; T.gun = wid;
    }

    // camera: shoulder offset in view space, then pulled in toward the head if a wall is in the way
    function place(cam, P, dt) {
      build();
      const M = T.model; if (M) M.root.visible = T.on;
      if (!T.on) return;
      const ads = G.weapons.S.ads; const back = BZ.lerp(3.6, 2.0, ads); const side = BZ.lerp(0.85, 0.62, ads); const lift = BZ.lerp(0.42, 0.28, ads);
      pivot.set(P.pos.x, P.pos.y + 1.55 - (P.crouch || 0) * 0.5, P.pos.z);
      cam.updateMatrixWorld(); cam.getWorldDirection(fwd); right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const shoulder = tmp.copy(pivot).addScaledVector(right, side).addScaledVector(up, lift);
      const s0 = G.world.raycast(pivot, right, side + 0.25); const sideK = s0 ? Math.max(0, (s0.t - 0.25) / side) : 1;
      shoulder.copy(pivot).addScaledVector(right, side * sideK).addScaledVector(up, lift);
      const dirBack = fwd.clone().negate();
      const hit = G.world.raycast(shoulder, dirBack, back + 0.3);
      const target = hit ? Math.max(0.35, hit.t - 0.3) : back;
      curDist = target < curDist ? target : BZ.damp(curDist, target, 5, dt);
      want.copy(shoulder).addScaledVector(dirBack, curDist);
      cam.position.copy(want); cam.updateMatrixWorld();
      if (M) M.root.visible = curDist > 0.8;
      animate(dt);
    }
    // only while a run is on screen (not on the title or hero select)
    function vis() { if (T.model && !['playing', 'pick', 'paused', 'dead'].includes(G.state)) T.model.root.visible = false; }

    // aim rays start at the hero's depth along the camera ray, so a zombie behind the hero is never the target
    // then they leave from the hero's shoulder toward whatever the crosshair is on (walls and zombies), so a shot
    // aimed from the hero's own position also lands, and cover between the hero and the target blocks it
    const aimO = V(); const aimP = V();
    function fix(o, d) {
      if (!T.on) return;
      const P = G.player; tmp.set(P.pos.x, P.pos.y + 1.4, P.pos.z).sub(o);
      const k = tmp.dot(d); if (k > 0) o.addScaledVector(d, k);
      const wh = G.world.raycast(o, d, 90); const zh = G.zombies.hitTest(o, d, wh ? wh.t : 90);
      aimP.copy(o).addScaledVector(d, zh ? zh.t : wh ? wh.t : 90);
      aimO.set(P.pos.x, P.pos.y + 1.45, P.pos.z).addScaledVector(right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), 0.2);
      o.copy(aimO); d.subVectors(aimP, aimO).normalize();
    }
    function muzzle(out, side) {
      const t = T.on && T.model && (side && T.model.tipL ? T.model.tipL : T.model.tip);
      if (!t) return false;
      T.model.root.updateMatrixWorld(true); t.getWorldPosition(out); return true;
    }

    // the hero's own body: run cycle, air pose, aim with the camera pitch, recoil, melee swings, casting
    function animate(dt) {
      const M = T.model; const P = G.player; if (!M || !T.on) return;
      const S = G.weapons.S; const W = BZ.WEAPONS[G.weapons.cur()] || {};
      M.root.position.set(P.pos.x, P.pos.y, P.pos.z);
      M.root.rotation.y = P.yaw + Math.PI;
      if (!P.alive) { M.root.rotation.x = BZ.damp(M.root.rotation.x, -Math.PI / 2, 8, dt); return; }
      M.root.rotation.x = BZ.damp(M.root.rotation.x, 0, 8, dt);
      const hs = Math.hypot(P.vel.x, P.vel.z); const back = -(Math.sin(P.yaw) * P.vel.x + Math.cos(P.yaw) * P.vel.z) < -0.3;
      if (S.shots !== sp.shots) { if (S.shots > sp.shots) { if (W.melee || W.thrown) sp.swing = W.throwT || W.swing || 0.5; else (W.dual && S.side ? sp.kickL : sp.kick).v += 9; } sp.shots = S.shots; }
      sp.swing = Math.max(0, sp.swing - dt); sp.air = BZ.damp(sp.air, P.onGround ? 0 : 1, 10, dt);
      const st = sp.st || (sp.st = {});
      st.speed = hs; st.back = back; st.air = sp.air; st.sprint = P.sprinting; st.pitch = P.pitch; st.mode = BZ.holdOf(W); st.pat = S.lastPat; st.wind = !!S.wind;
      st.swing = sp.swing > 0 ? 1 - sp.swing / (W.throwT || W.swing || 0.5) : -1; st.kick = sp.kick.step(dt); st.kickL = sp.kickL.step(dt);
      if (M.gun) { M.gun.visible = !(W.thrown && (S.hideT > 0 || (S.phase === 'reload' && S.t / W.reload < 0.55))); const bar = M.gun.getObjectByName('barrels'); if (bar) bar.rotation.z = S.spinAng; }
      st.reload = S.phase === 'reload' ? Math.sin(Math.min(1, S.t / 0.6) * Math.PI) : 0; st.cast = Math.min(1, (S.castT || 0) / 0.15);
      const ha = G.hero.act || null; if (ha && st.actSrc !== ha) { st.act = ha; st.actSrc = ha; }
      BZ.animHero(M, st, dt);
      if (M.shield) BZ.shieldPose(M.shield, S.guard || 0, M.root); // Thép raises the shield in front of his chest
      M.root.updateMatrixWorld(true);
    }

    Object.assign(T, { place, fix, muzzle, animate, vis });
    return T;
  };
})();
