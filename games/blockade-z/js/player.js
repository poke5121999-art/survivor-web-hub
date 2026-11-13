// Player: input (keyboard/mouse/touch/gamepad-free), movement with accel + coyote + jump buffer, camera feel.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const MOVE = { walk: 4.6, sprint: 7.0, ads: 2.8, accelGround: 40, decelGround: 30, accelAir: 10, gravity: 24, jumpV: 7.9, coyote: 0.12, jumpBuffer: 0.13, radius: 0.3, height: 1.75, eye: 1.6, stride: 2.0 };
  BZ.MOVE = MOVE;
  const JET = { price: 500, thrust: 46, maxRise: 6.5, burn: 30, refill: 22, refillDelay: 0.6, ceiling: 16 };
  BZ.JET = JET;

  BZ.makePlayer = (G) => {
    const P = {
      pos: new THREE.Vector3(0, 0, 5), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
      hp: 100, maxHp: 100, armor: 0, alive: true, onGround: true, sprinting: false, stride: 0, landDip: 0,
      coyote: 0, jumpBuf: 0, fuel: 100, hasJet: false, airT: 0, jetting: false, jetSnd: 0, fuelWait: 0, touchJet: false, kickP: BZ.spring(160, 18), kickY: BZ.spring(160, 18), shake: BZ.spring(220, 14), lastStep: 0,
      kick(p, y) { this.kickP.v += p * 40; this.kickY.v += y * 40; },
    };
    const keys = new Set();
    const input = { fwd: 0, side: 0, jump: false, sprint: false, fire: false, ads: false, lookX: 0, lookY: 0 };
    let lookDX = 0; let lookDY = 0;
    const canvas = G.renderer.domElement;

    // ---- desktop ----
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (G.state !== 'playing') return;
      if (e.code === 'KeyR') G.weapons.startReload();
      if (e.code === 'KeyQ') G.weapons.cycle(-1);
      if (/^Digit[1-2]$/.test(e.code)) G.weapons.selectSlot(+e.code.slice(5) - 1);
      if (e.code === 'KeyE') G.weapons.pickup();
      if (e.code === 'KeyX') G.weapons.dropCur();
      if (e.code === 'Space') P.jumpBuf = MOVE.jumpBuffer;
      if (e.code === 'KeyG') G.gear.throwBomb();
      if (e.code === 'KeyF') G.hero.use();
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); input.fire = false; input.ads = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (G.state !== 'playing' || BZ.isTouch) return;
      if (document.pointerLockElement !== canvas && !G.noLock) { G.lock(); return; }
      if (e.button === 0) input.fire = true;
      if (e.button === 2) input.ads = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; if (e.button === 2) input.ads = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (G.state !== 'playing') return;
      if (document.pointerLockElement === canvas || G.noLock) { lookDX += e.movementX || 0; lookDY += e.movementY || 0; }
    });
    addEventListener('wheel', (e) => { if (G.state === 'playing') G.weapons.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });

    // ---- touch: left stick, right drag to look, buttons ----
    const touch = { stickId: null, sx: 0, sy: 0, x: 0, y: 0, lookId: null, lx: 0, ly: 0 };
    P.touch = touch;
    if (BZ.isTouch) {
      const zone = document.getElementById('touch');
      zone.addEventListener('touchstart', (e) => {
        G.audio.unlock();
        for (const t of e.changedTouches) {
          if (t.target.closest('[data-btn]')) continue;
          if (t.clientX < innerWidth * 0.42 && touch.stickId === null) { touch.stickId = t.identifier; touch.sx = t.clientX; touch.sy = t.clientY; touch.x = 0; touch.y = 0; G.ui.stick(true, touch.sx, touch.sy, 0, 0); }
          else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
        }
        e.preventDefault();
      }, { passive: false });
      zone.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === touch.stickId) {
            const dx = t.clientX - touch.sx; const dy = t.clientY - touch.sy; const r = 55; const l = Math.hypot(dx, dy); const k = l > r ? r / l : 1;
            touch.x = (dx * k) / r; touch.y = (dy * k) / r; G.ui.stick(true, touch.sx, touch.sy, dx * k, dy * k);
          } else if (t.identifier === touch.lookId) {
            lookDX += (t.clientX - touch.lx) * 2.2; lookDY += (t.clientY - touch.ly) * 2.2; touch.lx = t.clientX; touch.ly = t.clientY;
          }
        }
        e.preventDefault();
      }, { passive: false });
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === touch.stickId) { touch.stickId = null; touch.x = touch.y = 0; G.ui.stick(false); }
          if (t.identifier === touch.lookId) touch.lookId = null;
        }
      };
      zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
      const btn = (name, down, up) => {
        const el = document.querySelector(`[data-btn="${name}"]`); if (!el) return;
        el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); down(); }, { passive: false });
        el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('on'); if (up) up(); }, { passive: false });
      };
      btn('fire', () => { input.fire = true; }, () => { input.fire = false; });
      btn('ads', () => { input.ads = !input.ads; });
      btn('jump', () => { P.jumpBuf = MOVE.jumpBuffer; P.touchJet = true; }, () => { P.touchJet = false; });
      btn('bomb', () => G.gear.throwBomb());
      btn('reload', () => G.weapons.startReload());
      btn('swap', () => G.weapons.cycle(1));
      btn('pick', () => G.weapons.pickup());
      btn('skill', () => G.hero.use());
      btn('drop', () => G.weapons.dropCur());
    }

    const out = {};
    function update(dt) {
      const s = G.settings;
      input.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - touch.y;
      input.side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.x;
      input.sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(touch.x, touch.y) > 0.95) && input.fwd > 0.3 && !input.fire;
      if (keys.has('Space') && P.onGround && P.jumpBuf <= 0 && !P.wasSpace) P.jumpBuf = MOVE.jumpBuffer;
      P.wasSpace = keys.has('Space');
      input.lookX = lookDX; input.lookY = lookDY;
      if (!P.alive) { lookDX = lookDY = 0; input.fire = false; }

      const sens = 0.0022 * s.sens * (1 - G.weapons.S.ads * 0.45);
      P.yaw -= lookDX * sens; P.pitch = BZ.clamp(P.pitch - lookDY * sens, -1.5, 1.5);
      lookDX = lookDY = 0;

      // movement
      const len = Math.hypot(input.fwd, input.side);
      const fx = len > 1 ? input.fwd / len : input.fwd; const sx = len > 1 ? input.side / len : input.side;
      P.sprinting = input.sprint && P.onGround;
      const speed = (G.weapons.S.ads > 0.5 ? MOVE.ads : P.sprinting ? MOVE.sprint : MOVE.walk) * G.hero.speedMul() * G.build.speedMul() * (G.env ? G.env.pSpeed : 1) * (P.rootT > 0 ? 0.08 : P.slowT > 0 ? 0.55 : 1);
      const sin = Math.sin(P.yaw); const cos = Math.cos(P.yaw);
      const wx = (-sin * fx + cos * sx) * speed; const wz = (-cos * fx - sin * sx) * speed;
      const acc = P.onGround ? (len > 0.05 ? MOVE.accelGround : MOVE.decelGround) : MOVE.accelAir;
      const dvx = wx - P.vel.x; const dvz = wz - P.vel.z; const dl = Math.hypot(dvx, dvz); const step = acc * dt;
      if (dl <= step) { P.vel.x = wx; P.vel.z = wz; } else { P.vel.x += (dvx / dl) * step; P.vel.z += (dvz / dl) * step; }

      P.coyote = P.onGround ? MOVE.coyote : P.coyote - dt;
      P.jumpBuf -= dt;
      if (P.jumpBuf > 0 && P.coyote > 0 && P.alive) { P.vel.y = MOVE.jumpV; P.jumpBuf = 0; P.coyote = 0; }
      // Bóng: run along walls, run up a wall head-on, kick off walls, one extra jump in the air
      P.wallRun = 0;
      if (G.hero.def.wallRun && P.alive) {
        if (P.onGround) { P.wallT = 0; P.climbT = 0; P.jumps = 0; }
        const rx = cos; const rz = -sin; const fwx = -sin; const fwz = -cos;
        const probe = (ox, oz) => G.world.overlaps([P.pos.x + ox - 0.08, P.pos.y + 0.4, P.pos.z + oz - 0.08], [P.pos.x + ox + 0.08, P.pos.y + 1.4, P.pos.z + oz + 0.08]);
        const side = probe(rx * 0.5, rz * 0.5) ? 1 : probe(-rx * 0.5, -rz * 0.5) ? -1 : 0;
        const front = probe(fwx * 0.5, fwz * 0.5);
        const hsp = Math.hypot(P.vel.x, P.vel.z);
        if (!P.onGround && side && fx > 0.3 && hsp > 2.5 && (P.wallT || 0) < 1.6) {
          P.wallRun = side; P.wallT = (P.wallT || 0) + dt; P.vel.y = Math.max(P.vel.y + (MOVE.gravity - 4) * dt, -1.5);
          P.vel.x += fwx * 6 * dt; P.vel.z += fwz * 6 * dt;
          if (G.rng.chance(dt * 18)) G.fx.burst(new THREE.Vector3(P.pos.x + rx * side * 0.35, P.pos.y + 0.2, P.pos.z + rz * side * 0.35), 1, [0xc080ff, 0xb0b0b0], { speed: 0.8, size: 0.06, life: 0.3 });
        } else if (front && fx > 0.5 && (P.climbT || 0) < 0.5 && (input.sprint || !P.onGround || P.jumpBuf > 0)) {
          P.climbT = (P.climbT || 0) + dt; P.vel.y = Math.max(P.vel.y, 6.4);
        }
        if (P.jumpBuf > 0 && !P.onGround && P.coyote <= 0) {
          const wallN = P.wallRun ? [-rx * P.wallRun, -rz * P.wallRun] : front ? [-fwx, -fwz] : side ? [-rx * side, -rz * side] : null;
          if (G.hero.airJump(P, wallN)) P.jumpBuf = 0;
        }
      }
      P.wallK = BZ.damp(P.wallK || 0, P.wallRun, 10, dt);
      P.vel.y -= MOVE.gravity * dt;
      // jetpack: keep holding jump in the air to fly; fuel refills on the ground
      P.airT = P.onGround ? 0 : P.airT + dt;
      const holdJump = keys.has('Space') || P.touchJet;
      P.jetting = P.hasJet && holdJump && !P.onGround && P.airT > 0.18 && P.fuel > 0 && P.alive;
      if (P.jetting) {
        P.vel.y = Math.min(JET.maxRise, P.vel.y + JET.thrust * dt); P.fuel = Math.max(0, P.fuel - JET.burn * dt); P.fuelWait = JET.refillDelay;
        if (P.pos.y > JET.ceiling) P.vel.y = Math.min(P.vel.y, 0);
        P.jetSnd -= dt; if (P.jetSnd <= 0) { P.jetSnd = 0.14; G.audio.play('jet', { gain: 0.5 }); }
        G.fx.jet(new THREE.Vector3(P.pos.x - Math.sin(P.yaw) * -0.35, P.pos.y + 0.6, P.pos.z - Math.cos(P.yaw) * -0.35));
      } else if (P.onGround) { P.fuelWait -= dt; if (P.fuelWait <= 0) P.fuel = Math.min(100, P.fuel + JET.refill * dt); }
      const vyBefore = P.vel.y;
      const wasGround = P.onGround;
      G.world.moveBox(P.pos, P.vel, dt, MOVE.radius, MOVE.height, out, 0.45);
      P.stepLag = Math.max(0, (P.stepLag || 0) + out.stepUp); P.stepLag = BZ.damp(P.stepLag, 0, 14, dt);
      P.onGround = out.ground;
      if (P.onGround && !wasGround && vyBefore < -4) {
        P.landDip = Math.min(0.2, -vyBefore * 0.025); G.audio.play('land', { gain: 0.5 });
      }
      P.landDip = BZ.damp(P.landDip, 0, 9, dt);
      // keep inside the town even if something goes wrong
      P.pos.x = BZ.clamp(P.pos.x, -G.world.HALF + 0.4, G.world.HALF - 0.4); P.pos.z = BZ.clamp(P.pos.z, -G.world.HALF + 0.4, G.world.HALF - 0.4);
      if (out.stepUp && P.onGround === false) P.onGround = true;

      // steps by distance travelled
      const hs = Math.hypot(P.vel.x, P.vel.z);
      if (P.onGround && hs > 0.5) {
        P.stride += (hs * dt) / (MOVE.stride * (P.sprinting ? 1.25 : 1)) * 2;
        if (Math.floor(P.stride) !== P.lastStep) { P.lastStep = Math.floor(P.stride); G.audio.play('step', { gain: P.sprinting ? 0.55 : 0.4 }); }
      }

      // camera
      const kp = P.kickP.step(dt); const ky = P.kickY.step(dt); const sh = P.shake.step(dt);
      const bobA = Math.min(1, hs / 4) * (P.onGround ? 1 : 0) * (1 - G.weapons.S.ads * 0.8);
      const cam = G.camera;
      cam.position.set(P.pos.x, P.pos.y + MOVE.eye - P.landDip - (P.stepLag || 0) + Math.abs(Math.sin(P.stride * Math.PI)) * 0.045 * bobA * (P.sprinting ? 1.6 : 1), P.pos.z);
      cam.rotation.set(P.pitch + kp, P.yaw + ky, Math.sin(P.stride * Math.PI) * 0.006 * bobA + sh * 0.02 - (P.wallK || 0) * 0.14, 'YXZ');
      // recoil recovery: most of the kick returns, a little stays (like real recoil)
      P.pitch += kp * dt * 0.6;
      const fovT = (P.sprinting ? s.fov + 6 : s.fov) + (G.hero.t.dash > 0 ? 14 : 0) + Math.abs(P.wallK || 0) * 6;
      const fov = BZ.lerp(fovT, G.weapons.adsFov(), G.weapons.S.ads);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = BZ.damp(cam.fov, fov, 12, dt); cam.updateProjectionMatrix(); }
    }

    function hurt(dmg, from) {
      if (!P.alive || G.god || G.hero.invuln()) return;
      G.hero.onHurt();
      let d = dmg;
      d *= G.build.armorMul();
      if (P.armor > 0) { const absorb = Math.min(P.armor, d * 0.6); P.armor -= absorb; d -= absorb; }
      P.hp = Math.max(0, P.hp - d);
      P.shake.v += 6 * (G.rng.next() - 0.5) * (d / 10 + 1);
      P.kickP.v -= 0.4;
      G.audio.play('hurt', { gain: 0.8 });
      const ang = Math.atan2(from.x - P.pos.x, from.z - P.pos.z);
      G.ui.hurt(d, ang - Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw)));
      if (P.hp <= 0) { P.alive = false; G.events.emit('player:dead'); }
    }
    function reset() {
      P.pos.set(0, 0, 5); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0; P.hp = 100; P.maxHp = 100; P.armor = 0; P.jumps = 0; P.wallT = 0; P.wallK = 0; P.alive = true; P.landDip = 0; P.fuel = 100; P.hasJet = false; P.slowT = 0; P.rootT = 0;
      input.fire = false; input.ads = false; keys.clear();
    }
    P.update = update; P.hurt = hurt; P.reset = reset; P.input = input;
    return P;
  };
})();
