// Dave: tấm sprite từ sheet gốc + lớp tay cầm súng dựng theo prefab PlayerGroup, và máy trạng thái người lặn.
// Hoạt ảnh chạy theo đúng dãy khoá sprite của AnimationClip gốc (D.clips), không chia đều theo fps.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, D = window.HX_ASSETS.dave, M = window.HX_META;
  // Sheet lưới: mỗi hàng một dãy khung, rộng bằng dãy dài nhất. Mọi khung nằm đúng chỗ trong ô 120 px như bản gốc.
  var names = Object.keys(D.anims);
  var SW = D.cell * Math.max.apply(null, names.map(function (k) { return D.anims[k].n; }));
  var SH = D.cell * (1 + Math.max.apply(null, names.map(function (k) { return D.anims[k].row; })));

  function setCell(mesh, row, col) {
    var c = D.cell;
    mesh.material.uniforms.uvRect.value.set(col * c / SW, 1 - (row + 1) * c / SH, c / SW, c / SH);
  }
  function setFrame(mesh, anim, f) { setCell(mesh, D.anims[anim].row, f); }

  function lerpAngle(a, b, k) {
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * k;
  }

  // Tên hoạt ảnh trong game → clip gốc của PlayerAnimCtrl. Tên không có clip thì chạy đều theo D.anims[tên].fps.
  var CLIP = {
    Idle: 'Idle', Gasping: 'Ani2D_Dave_Gasping', Relief: 'Ani2D_Dave_Relief', Look: 'LookAround', Wait: 'WaitEscapepod',
    Diving: 'Diving', BIdle: 'B_Idle', Hit: 'Hit', Bigdamage: 'Bigdamage', Die: 'Die', DieIdle: 'DieIdle',
    MeleeDaggerAtk: 'MeleeOneHandHorizontal',
    // súng xiên và súng phụ dùng chung lớp tay RangeWeaponArm; FightBlendTree chạy RangeWeaponHook nhanh ×2
    AttackDraw: 'RangeWeaponDraw', AttackReady: 'RangeWeaponAim', AttackFire: 'RangeWeaponFire', AttackFireMove: 'RangeWeaponFire_Move',
    AttackFight: 'RangeWeaponHook', AttackFail: 'RangeWeaponMiss',
    // nhặt / xả thịt xác cá: state PickUpItem, Tanning → TanningAfter, túi đầy thì Overloaded
    Overloaded: 'Ani2D_Dave_Overloaded',
  };
  ['Side', 'SideUp', 'SideDown', 'Up', 'Down'].forEach(function (v) {
    CLIP['Move' + v] = 'Move' + v;
    CLIP['BMove' + v] = 'B_Move' + v;
    CLIP['ShortDash' + v] = 'Ani2D_Dave_ShortDash_' + v;
  });
  // Clip không lặp chạy xong thì sang clip này: Die → DieIdle như state machine gốc, rút súng xong thì ngắm.
  var NEXT = { Die: 'DieIdle', AttackDraw: 'AttackReady' };
  function clipOf(name) { return D.clips && D.clips[CLIP[name] || name] || null; }
  // Giá trị tại t của dãy khoá [[t, v], ...]: giữ khoá trước, hoặc nội suy thẳng.
  function keyAt(keys, t, lerp) {
    if (!keys || !keys.length) return null;
    for (var i = 1; i < keys.length; i++) {
      if (keys[i][0] > t) {
        var a = keys[i - 1], b = keys[i];
        return lerp && b[0] > a[0] ? a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]) : a[1];
      }
    }
    return keys[keys.length - 1][1];
  }

  // Góc bơi → biến thể hoạt ảnh; mọi biến thể vẽ nằm ngang quay về +x, phải xoay tấm theo hướng bơi.
  function swimVariant(a, prefix) {
    var deg = a * 180 / Math.PI;
    if (deg > 62) return prefix + 'Up';
    if (deg > 22) return prefix + 'SideUp';
    if (deg < -62) return prefix + 'Down';
    if (deg < -22) return prefix + 'SideDown';
    return prefix + 'Side';
  }

  // Ô 120 px ở 100 px/m = 1,2 m; PlayerGroup gốc phóng thân Dave ×2 (D.scale).
  var S = D.scale || 1, CW = D.cell / D.ppu * S, PX = S / D.ppu;
  // Góc của tay (−π/2..π/2) khi Dave quay phải; quay trái thì lật gương.
  function localAngle(a) { return Math.atan2(Math.sin(a), Math.abs(Math.cos(a))); }

  // ---------- lớp tay cầm súng, dựng theo prefab PlayerGroup (D.rig: toạ độ trong CharacterBody, nhân S ra mét) ----------
  // RangeWeaponArm: tay gần (AttackReadyArms), xoay quanh nút của nó theo điểm ngắm. Con của nó:
  //   HarpoonHandler (= chỗ GunHandler): treo súng cầm tay, súng xiên HarpoonGunTemplate… hay súng phụ;
  //   ProjectileAttachTransform: đuôi mũi xiên nằm trong súng; RopeAttachRigidbody: đầu dây; BehindArmGrabPoint: chỗ tay xa nắm.
  // BehindRangeWeaponArm: tay xa (AttackReadyRightArm) sau thân, AimConstraint nhắm BehindArmGrabPoint.
  // Thứ tự vẽ gốc (sortingOrder): tay xa −1, thân 0, mũi xiên 0, súng 1, tay gần 2.
  var R = D.rig;
  var ARM_AT = [R.rangeArm[0] * S, R.rangeArm[1] * S];
  var HOLD_AT = [(R.gunHandler[0] - R.rangeArm[0]) * S, (R.gunHandler[1] - R.rangeArm[1]) * S];
  var BEHIND_AT = [R.behindArm[0] * S, R.behindArm[1] * S];
  var AIM_OFF = (R.behindAimOffsetDeg || 0) * Math.PI / 180;
  var SPEAR = D.spear.size[0] / D.spear.ppu;   // chiều dài mũi xiên, đơn vị CharacterBody

  function ArmRig(G, root) {
    this.G = G;
    var sheet = G.gfx.tex(D.sheet);
    this.flip = new THREE.Group();
    this.arm = new THREE.Group(); this.arm.position.set(ARM_AT[0], ARM_AT[1], 0);
    this.hold = new THREE.Group(); this.hold.position.set(HOLD_AT[0], HOLD_AT[1], 0);
    this.behind = new THREE.Group(); this.behind.position.set(BEHIND_AT[0], BEHIND_AT[1], 0);
    var mk = function (z) { var m = HX.gfx.sprite(sheet, CW, CW, { alphaCut: 0.5, depthWrite: true }); m.position.z = z; return m; };
    this.nearM = mk(0.02); this.behindM = mk(-0.012);
    var sp = D.spear;
    this.spear = HX.gfx.sprite(G.gfx.tex('fx/HarpoonProjectile.png'), SPEAR * S, sp.size[1] / sp.ppu * S, { alphaCut: 0.5, depthWrite: true, pivot: sp.pivot });
    this.spear.position.set((R.projectileAttach[0] - R.gunHandler[0]) * S, (R.projectileAttach[1] - R.gunHandler[1]) * S, 0.005);
    this.heldMeshes = {}; this.held = null; this.heldKey = null;
    this.arm.add(this.nearM); this.arm.add(this.hold); this.hold.add(this.spear);
    this.behind.add(this.behindM);
    this.flip.add(this.behind); this.flip.add(this.arm);
    this.flip.visible = false;
    root.add(this.flip);
    this.th = 0; this.miss = 0;
    this.setArms('AttackReadyArms', 'AttackReadyRightArm');
  }
  // Sprite tay lấy trong sheet: pivot của sprite đặt đúng vào nút.
  function placeArm(m, name) {
    setFrame(m, name, 0);
    var p = D.anims[name].pivot;
    m.position.x = -(p[0] - 0.5) * CW; m.position.y = -(p[1] - 0.5) * CW;
  }
  ArmRig.prototype.setArms = function (near, behind) {
    if (this.nearName !== near) { placeArm(this.nearM, near); this.nearName = near; }
    if (this.behindName !== behind) { placeArm(this.behindM, behind); this.behindName = behind; }
  };
  // Súng cầm tay: { img (art/…), size [px], pivot, ppu }. Treo ở HarpoonHandler/GunHandler, cùng tỉ lệ với thân.
  ArmRig.prototype.setHeld = function (h) {
    var key = h ? h.img : null;
    if (this.heldKey === key) return;
    if (this.held) this.held.visible = false;
    this.heldKey = key; this.held = null;
    if (!h) return;
    var m = this.heldMeshes[key];
    if (!m) {
      m = this.heldMeshes[key] = HX.gfx.sprite(this.G.gfx.tex(h.img.replace(/^art\//, '')), h.size[0] / h.ppu * S, h.size[1] / h.ppu * S,
        { alphaCut: 0.5, depthWrite: true, pivot: h.pivot });
      m.position.z = 0.01;
      this.hold.add(m);
    }
    m.visible = true;
    this.held = m;
  };
  // Điểm p (toạ độ CharacterBody lúc tay nằm ngang) gắn trên tay gần ('arm') hay trên súng ('hold')
  // → mét so với tâm Dave khi quay phải, với góc tay th và góc súng miss hiện tại.
  ArmRig.prototype.local = function (p, on) {
    var x, y, c, s, t;
    if (on === 'hold') {
      x = (p[0] - R.gunHandler[0]) * S; y = (p[1] - R.gunHandler[1]) * S;
      c = Math.cos(this.miss); s = Math.sin(this.miss); t = x * c - y * s; y = x * s + y * c; x = t;
      x += HOLD_AT[0]; y += HOLD_AT[1];
    } else { x = (p[0] - R.rangeArm[0]) * S; y = (p[1] - R.rangeArm[1]) * S; }
    c = Math.cos(this.th); s = Math.sin(this.th); t = x * c - y * s; y = x * s + y * c; x = t;
    return [x + ARM_AT[0], y + ARM_AT[1]];
  };
  ArmRig.prototype.world = function (d, p, on) {
    this.th = localAngle(d.aimAngle);
    var q = this.local(p, on);
    return { x: d.pos.x + q[0] * d.facing, y: d.pos.y + q[1] };
  };
  // o: { miss (độ, góc HarpoonHandler), kick (0..1 giật lùi), spear (mũi xiên nằm trong súng), flash }
  ArmRig.prototype.pose = function (d, o) {
    this.flip.scale.x = d.facing;
    this.th = localAngle(d.aimAngle);
    this.miss = (o.miss || 0) * Math.PI / 180;
    this.arm.rotation.z = this.th;
    this.hold.rotation.z = this.miss;
    if (this.held) this.held.position.x = -2 * PX * (o.kick || 0);
    this.spear.visible = !!o.spear;
    // AimConstraint gốc: trục x của tay xa chĩa vào BehindArmGrabPoint, cộng m_RotationOffset.z
    var g = this.local(R.grabPoint, 'arm');
    this.behind.rotation.z = Math.atan2(g[1] - BEHIND_AT[1], g[0] - BEHIND_AT[0]) + AIM_OFF;
    var fl = o.flash || 0;
    [this.nearM, this.behindM, this.spear].concat(this.held ? [this.held] : []).forEach(function (m) { m.material.uniforms.flash.value = fl; });
  };

  // Súng xiên Dave cầm theo cấp súng xiên trong sổ: sát thương 3 → 40 ứng với Old, Iron, Pump, Merman, NewMV, Alloy.
  function harpoonGun(dmg) {
    var list = D.harpoonGuns || [], sh = window.HX_GEAR_SHEET && window.HX_GEAR_SHEET.gear && window.HX_GEAR_SHEET.gear.harpoon, lv = 1;
    if (sh) sh.forEach(function (g) { if (dmg >= g.damage) lv = Math.max(lv, g.lv); });
    return list[Math.max(1, Math.min(list.length, lv)) - 1] || null;
  }

  function Diver(G, x, y) {
    this.G = G;
    var tex = G.gfx.tex(D.sheet);
    this.root = new THREE.Group();
    this.body = HX.gfx.sprite(tex, CW, CW, { alphaCut: 0.5, depthWrite: true });
    this.root.add(this.body);
    this.arms = new ArmRig(G, this.root);
    this.harpoonGun = harpoonGun(G.loadout.harpoon);
    var DB = window.HX_BOAT_ASSETS && window.HX_BOAT_ASSETS.vfx && window.HX_BOAT_ASSETS.vfx.diveBubble;
    if (DB) G.fx.preloadRecipes([DB]);  // ảnh của DiveBubble lúc nhảy xuống
    if (this.harpoonGun) G.gfx.tex(this.harpoonGun.img);
    this.root.position.set(x, y, 0.1);
    G.gfx.scene.add(this.root);

    this.pos = { x: x, y: y };
    this.vel = { x: 0, y: 0 };
    this.facing = 1;
    this.tilt = 0;          // góc thân khi bơi
    this.aimAngle = 0;
    this.o2 = G.loadout.o2;
    this.invuln = 0;
    this.dashCd = 0;
    this.knifeCd = 0;
    this.breatheT = 0;
    this.trail = null; this.trailName = null; this.breath = null;
    var self = this;
    // hạt gắn trên thân (EffectGroup của CharacterBody): bám tâm Dave, xoay theo thân, lật khi quay trái
    this.fxFollow = function () { return { x: self.pos.x, y: self.pos.y, angle: self.facing > 0 ? self.tilt : -self.tilt, flip: self.facing < 0 }; };
    this.animName = null; this.animT = 0; this.animSpeed = 1;
    this.state = null; this.st = 0; this.data = {};
    this.go('enter');
  }

  // Chạy hoạt ảnh name (tên trong game, xem CLIP). restart: chạy lại từ đầu dù đang chạy; speed: nhân tốc độ clip.
  Diver.prototype.play = function (name, restart, speed) {
    this.animSpeed = speed || 1;
    if (this.animName === name && !restart) return;
    this.animName = name; this.animT = 0;
  };

  Diver.prototype.go = function (name, data) {
    var prev = this.state && STATES[this.state];
    if (prev && prev.exit) prev.exit(this, this.G);
    this.state = name; this.st = 0; this.data = data || {};
    if (STATES[name].enter) STATES[name].enter(this, this.G);
  };

  // Đầu mũi xiên đang nằm trong súng (ProjectileAttachTransform + chiều dài mũi), toạ độ thế giới.
  Diver.prototype.gunTip = function () {
    return this.arms.world(this, [R.projectileAttach[0] + SPEAR, R.projectileAttach[1]], 'hold');
  };
  // Đầu dây xiên (RopeAttachRigidbody trên tay gần).
  Diver.prototype.ropeFrom = function () { return this.arms.world(this, R.ropeAttach, 'arm'); };

  // Vật lý bơi chung: gia tốc theo cần, cản nước, trượt theo vách, trần là mặt nước.
  Diver.prototype.swim = function (dt, inp, cap, accelMul) {
    var P = T.diver;
    var ax = inp.mx * P.accel * (accelMul || 1), ay = inp.my * P.accel * (accelMul || 1);
    this.vel.x += ax * dt; this.vel.y += ay * dt;
    var k = Math.exp(-P.drag * dt);
    this.vel.x *= k; this.vel.y *= k;
    var sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > cap) { this.vel.x *= cap / sp; this.vel.y *= cap / sp; }
    this.G.world.move(this.pos, this.vel, P.radius, dt);
    var top = T.water.surfaceY - 0.38 * S;
    if (this.pos.y > top) { this.pos.y = top; if (this.vel.y > 0) this.vel.y = 0; }
    var floor = this.G.world.box.minY + 0.4;
    if (this.pos.y < floor) { this.pos.y = floor; if (this.vel.y < 0) this.vel.y = 0; }
  };

  Diver.prototype.faceToward = function (dx) {
    if (dx > 0.05) this.facing = 1; else if (dx < -0.05) this.facing = -1;
  };

  Diver.prototype.poseSwim = function (dt, boosting) {
    var sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > 0.35) {
      this.faceToward(this.vel.x);
      var a = Math.atan2(this.vel.y, Math.abs(this.vel.x));
      this.tilt = lerpAngle(this.tilt, a, Math.min(1, T.diver.turnRate * dt));
      this.play(swimVariant(this.tilt, boosting ? 'BMove' : 'Move'));
      return true;
    }
    this.tilt = lerpAngle(this.tilt, 0, Math.min(1, 6 * dt));
    return false;
  };

  // Cá cắn / gai đâm được Dave lúc này không. Trạng thái có `immune` (nhảy xuống, giằng co, trồi lên, ngất) thì không.
  Diver.prototype.vulnerable = function () { return this.invuln <= 0 && !STATES[this.state].immune; };

  Diver.prototype.hurt = function (dmg, fromX, fromY) {
    if (!this.vulnerable()) return false;
    var G = this.G;
    this.o2 = Math.max(0, this.o2 - dmg);
    this.invuln = T.diver.invulnTime;
    var dx = this.pos.x - fromX, dy = this.pos.y - fromY, l = Math.hypot(dx, dy) || 1;
    this.vel.x = dx / l * T.diver.knockback; this.vel.y = dy / l * T.diver.knockback;
    G.audio.play('dave_hit' + (1 + Math.floor(Math.random() * 3)));
    G.shake(dmg >= T.diver.bigHurtAt ? 2 : 1);
    G.hud.flash();
    // BloodDave.prefab gốc (máu tan trong nước khi Dave bị cắn)
    G.fx.play(G.fx.dive('bloodDave'), this.pos.x, this.pos.y + 0.1 * S, { z: 0.14, name: 'bloodDave' });
    if (this.o2 <= 0) { this.go('dead'); return true; }
    if (this.state === 'swim' || this.state === 'aim' || this.state === 'melee' || this.state === 'gunAim' || this.state === 'gunFire' || this.state === 'harvest') this.go('hurt', { big: dmg >= T.diver.bigHurtAt });
    return true;
  };

  // Xác cá gần nhất mà Dave với tới (thân cá nở thêm T.harvest.reach).
  Diver.prototype.corpseInReach = function () {
    var list = this.G.fishes.list, best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f.corpse() || !f.hitTest(this.pos.x, this.pos.y, T.harvest.reach)) continue;
      var c = f.center(), dd = Math.hypot(c.x - this.pos.x, c.y - this.pos.y);
      if (dd < bd) { bd = dd; best = f; }
    }
    return best;
  };
  // Lời nhắc trên xác cá: { fish, carve, k (0..1 tiến độ xả thịt) } hoặc null.
  Diver.prototype.harvestPrompt = function () {
    if (this.state === 'harvest') return this.data.step === 'carve' ? { fish: this.data.fish, carve: true, k: this.data.k } : null;
    if (this.state !== 'swim') return null;
    var f = this.corpseInReach();
    return f ? { fish: f, carve: f.carvable(), k: 0 } : null;
  };

  Diver.prototype.update = function (dt, inp) {
    var G = this.G;
    this.st += dt; this.animT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.knifeCd = Math.max(0, this.knifeCd - dt);
    this.rig = null;
    STATES[this.state].update(this, G, dt, inp);

    this.overSuit = false;
    if (this.state !== 'dead' && this.state !== 'enter' && this.state !== 'surfaced' && G.phase === 'dive') {
      var depth = G.stack.depth(this.pos.y);
      // quá độ sâu an toàn của đồ lặn thì dưỡng khí tụt nhanh gấp SUIT_OVER_MUL
      this.overSuit = depth > G.loadout.suit;
      var drain = (T.o2.drain + depth * T.o2.drainPerMeter) * (this.boosting ? T.o2.boostMul : 1) * (this.overSuit ? M.SUIT_OVER_MUL : 1);
      this.o2 = Math.max(0, this.o2 - drain * dt);
      if (this.o2 <= 0) this.go('dead');
      if (this.o2 < T.o2.lowAt) {
        this.breatheT -= dt;
        if (this.breatheT <= 0) { this.breatheT = T.o2.breatheEvery; G.audio.play('dave_breathe', { vol: 0.8 }); }
      }
    }

    this.bubbles();
    this.draw();
  };

  // Bọt gốc của EffectGroup: TailBubble khi bơi, TailBubble_Fast khi tăng tốc, Breath_Loop thở ra đều trên đầu.
  Diver.prototype.bubbles = function () {
    var G = this.G, fx = G.fx, gone = this.state === 'dead' || this.state === 'surfaced' || this.state === 'enter';
    var moving = Math.hypot(this.vel.x, this.vel.y) > 0.35 && (this.state === 'swim' || this.state === 'dash');
    var want = gone ? null : this.boosting ? 'tailBubbleFast' : moving ? 'tailBubble' : null;
    if (want !== this.trailName) {
      if (this.trail) this.trail.stop();
      this.trail = want ? fx.play(fx.dive(want), this.pos.x, this.pos.y, { scale: S, z: 0.12, follow: this.fxFollow, name: want }) : null;
      this.trailName = want;
    }
    if (gone && this.breath) { this.breath.stop(); this.breath = null; }
    else if (!gone && (!this.breath || this.breath.dead)) this.breath = fx.play(fx.dive('breath'), this.pos.x, this.pos.y, { scale: S, z: 0.12, follow: this.fxFollow, name: 'breath' });
  };

  // Khung thân hiện tại theo clip gốc. Trả thời điểm trong clip (giây) để tra khoá tay bật/tắt và góc súng.
  Diver.prototype.drawBody = function () {
    var name = this.animName, c = clipOf(name), t = this.animT * this.animSpeed;
    if (c && !c.loop && t >= c.length && NEXT[name]) { this.play(NEXT[name], false, this.animSpeed); name = this.animName; c = clipOf(name); t = 0; }
    if (c) {
      t = c.loop ? t % c.length : Math.min(t, c.length);
      var fr = c.frames[0];
      for (var i = 1; i < c.frames.length && c.frames[i][0] <= t + 1e-6; i++) fr = c.frames[i];
      setCell(this.body, fr[1], fr[2]);
      return { clip: c, t: t };
    }
    var a = D.anims[name], f = Math.floor(t * a.fps);
    setFrame(this.body, name, f % a.n);
    return { clip: null, t: t };
  };

  Diver.prototype.draw = function () {
    var at = this.drawBody();
    this.root.position.set(this.pos.x, this.pos.y, 0.1);
    this.body.scale.x = CW * this.facing;
    this.body.rotation.z = this.facing > 0 ? this.tilt : -this.tilt;
    var blink = this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 14) % 2 === 0;
    var flash = blink ? 0.55 : 0;
    this.body.material.uniforms.flash.value = flash;
    // lớp tay bật theo khoá m_IsActive của clip (RangeWeaponDraw bật ở 0,2 giây)
    var r = this.rig, c = at.clip, on = !!r && (!c || !c.armsOn || keyAt(c.armsOn, at.t) === 1);
    this.arms.flip.visible = on;
    if (!on) return;
    this.arms.setHeld(r.held);
    this.arms.setArms(r.near || (c && c.nearArm) || 'AttackReadyArms', r.behind || (c && c.behindArm) || 'AttackReadyRightArm');
    this.arms.pose(this, { miss: c && c.handlerRotZ ? keyAt(c.handlerRotZ, at.t, true) : 0, kick: r.kick, spear: r.spear, flash: flash });
  };

  Diver.prototype.remove = function () { this.G.gfx.scene.remove(this.root); };

  // Góc ngắm tính từ nút tay gần (khớp vai), như RangeAttackArmHandler gốc xoay RangeWeaponArm.
  Diver.prototype.aimAt = function (inp) {
    this.aimAngle = Math.atan2(inp.aimY - (this.pos.y + ARM_AT[1]), inp.aimX - (this.pos.x + ARM_AT[0] * this.facing));
    this.faceToward(inp.aimX - this.pos.x);
  };
  Diver.prototype.harpoonRig = function (spear) { return { held: this.harpoonGun, spear: spear }; };

  var STATES = {
    enter: {
      immune: true,
      enter: function (d, G) {
        d.vel.x = 0.4; d.vel.y = -2.6; d.tilt = -1.2;
        d.play('Diving', true);
        G.audio.play('dave_diving');
        // DiveBubble.prefab gốc: vệt bọt 1,7 giây theo người lao xuống + bụi nước lúc chạm mặt
        var DB = window.HX_BOAT_ASSETS && window.HX_BOAT_ASSETS.vfx && window.HX_BOAT_ASSETS.vfx.diveBubble;
        if (DB) G.fx.play(DB, d.pos.x, d.pos.y, { z: 0.12, follow: d.fxFollow, name: 'diveBubble' });
      },
      update: function (d, G, dt) {
        d.boosting = false;
        d.swim(dt, { mx: 0, my: 0 }, 4);
        if (d.st > T.diver.enterTime) d.go('swim');
      },
    },

    swim: {
      update: function (d, G, dt, inp) {
        var moving = inp.mx !== 0 || inp.my !== 0;
        d.boosting = inp.boost && moving;
        // Space là nút Interaction của bản gốc: cạnh xác cá thì nhặt / xả thịt thay vì lướt
        var corpse = inp.interact && d.corpseInReach();
        if (corpse) return d.go('harvest', { fish: corpse });
        if (inp.dash && d.dashCd <= 0 && moving) return d.go('dash', { mx: inp.mx, my: inp.my });
        if (inp.firePressed && G.harpoon.state === 'ready') return d.go('aim');
        if (inp.gunPressed && G.gun && G.harpoon.state === 'ready') return d.go('gunAim');
        if (inp.melee && d.knifeCd <= 0) return d.go('melee');
        d.swim(dt, inp, d.boosting ? T.diver.boostSpeed : T.diver.maxSpeed, d.boosting ? 1.5 : 1);
        if (!d.poseSwim(dt, d.boosting)) d.play(d.o2 < T.o2.lowAt ? 'Gasping' : 'Idle');
        if (inp.my > 0.3 && d.pos.y >= T.water.surfaceY - 0.45 * S) G.onSurface();
      },
    },

    dash: {
      enter: function (d, G) {
        var l = Math.hypot(d.data.mx, d.data.my) || 1;
        d.vel.x = d.data.mx / l * T.diver.dashSpeed; d.vel.y = d.data.my / l * T.diver.dashSpeed;
        d.dashCd = T.diver.dashCooldown;
        d.faceToward(d.vel.x);
        d.tilt = Math.atan2(d.vel.y, Math.abs(d.vel.x));
        d.play(swimVariant(d.tilt, 'ShortDash'), true);
        G.audio.play('dave_dash');
        G.fx.spawn('puff', d.pos.x - d.facing * 0.2, d.pos.y, 0.15, 0, 0, 0.8);
      },
      update: function (d, G, dt, inp) {
        d.boosting = false;
        d.swim(dt, { mx: 0, my: 0 }, T.diver.dashSpeed);
        if (d.st > T.diver.dashTime) d.go('swim');
        else if (inp.firePressed && G.harpoon.state === 'ready') d.go('aim');
      },
    },

    // Giữ chuột: rút súng xiên (RangeWeaponDraw) rồi ngắm (RangeWeaponAim), tay + súng xoay theo điểm ngắm; thả chuột là bắn.
    aim: {
      enter: function (d, G) {
        d.data.release = false;
        d.play('AttackDraw', true);
        G.audio.play('harpoon_aim', { vol: 0.6 });
      },
      update: function (d, G, dt, inp) {
        d.rig = d.harpoonRig(true);
        d.boosting = false;
        d.aimAt(inp);
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 12 * dt));
        d.swim(dt, inp, T.diver.aimSpeed, 0.6);
        if (inp.aimCancel) return d.go('swim');  // cảm ứng: thả cần ngắm trong ô Huỷ bắn
        if (inp.fireReleased || !inp.fireHeld) d.data.release = true;
        if (d.data.release && d.st >= T.harpoon.minReady) {
          var tip = d.gunTip();
          G.harpoon.fire(tip.x, tip.y, d.aimAngle);
          if (d.state === 'aim') d.go('shoot');  // fire() có thể đã trúng ngay cá sát nòng và chuyển sang reel/tug
        }
      },
    },

    // Mũi xiên đang bay: tay giữ súng chĩa theo mũi xiên. Trượt (chạm vách, hết tầm) thì RangeWeaponMiss: súng hất lên 25°.
    shoot: {
      enter: function (d) { d.play('AttackFire', true); },
      update: function (d, G, dt, inp) {
        d.rig = d.harpoonRig(false);
        d.aimAt({ aimX: G.harpoon.x, aimY: G.harpoon.y });
        d.swim(dt, inp, T.diver.aimSpeed, 0.5);
        if (G.harpoon.state === 'ready') return d.go('swim');
        if (G.harpoon.missed) d.play('AttackFail');
        else if (d.st > T.harpoon.fireHold) d.play('AttackReady');
      },
    },

    // Cá đã chết trên xiên: Dave giữ súng chĩa theo dây, cá trôi về.
    reel: {
      enter: function (d, G) { d.play('AttackReady'); G.audio.loop('pull', 'harpoon_pull', 0.7); },
      exit: function (d, G) { G.audio.stopLoop('pull'); },
      update: function (d, G, dt, inp) {
        d.rig = d.harpoonRig(false);
        d.aimAt({ aimX: G.harpoon.x, aimY: G.harpoon.y });
        d.swim(dt, inp, T.diver.aimSpeed * 0.7, 0.4);
        if (G.harpoon.state === 'ready') d.go('swim');
      },
    },

    // Giằng co với cá lớn (FightBlendTree gốc: RangeWeaponHook ×2): bấm liên tục để kéo thanh đầy trước khi hết giờ.
    tug: {
      immune: true,
      enter: function (d, G) {
        d.play('AttackFight', true, 2);
        d.data.gauge = 0.35; d.data.time = T.tug.time;
        G.audio.play('qte_raise');
        G.audio.loop('pull', 'harpoon_pull', 0.8);
        G.hud.tug(true, d.data.gauge, 1);
      },
      exit: function (d, G) { G.audio.stopLoop('pull'); G.hud.tug(false); },
      update: function (d, G, dt, inp) {
        var fish = G.harpoon.fish;
        if (!fish) return d.go('swim');
        d.rig = d.harpoonRig(false);
        d.aimAt({ aimX: G.harpoon.x, aimY: G.harpoon.y });
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 8 * dt));
        // Dave đứng yên giằng dây; cá chỉ chạy được tới hết dây (hooked giữ nó trong T.harpoon.range)
        d.vel.x = 0; d.vel.y = 0;
        d.data.time -= dt;
        d.data.gauge -= T.tug.decay * dt;
        if (inp.tap) {
          d.data.gauge += T.tug.tapGain * Math.max(0.2, Math.min(1.5, T.tug.hpRef / Math.max(1, fish.hp)));
          G.audio.play('harpoon_tap', { vol: 0.8, rate: 0.9 + d.data.gauge * 0.4 });
          fish.flashT = 0.08;
          // BloodFight.prefab gốc: máu rỉ ra mỗi lần giật dây
          G.fx.play(G.fx.dive('bloodFight'), G.harpoon.x, G.harpoon.y, { z: fish.z + 0.05, name: 'bloodFight' });
        }
        G.hud.tug(true, Math.max(0, Math.min(1, d.data.gauge)), d.data.time / T.tug.time);
        if (d.data.gauge >= 1) {
          var perfect = d.data.time / T.tug.time > T.tug.perfectAt;
          G.audio.play(perfect ? 'qte_perfect' : 'qte_success');
          G.hud.qteResult(true, perfect);
          G.harpoon.killHooked();
          d.go('reel');
        } else if (d.data.time <= 0 || d.data.gauge <= 0) {
          G.audio.play('qte_fail');
          G.hud.qteResult(false);
          G.harpoon.breakFree();
          d.go('swim');
        }
      },
    },

    // Súng phụ: giữ chuột phải (hoặc nút Súng) là rút súng rồi ngắm, tay + súng xoay theo điểm ngắm; thả là bắn.
    gunAim: {
      enter: function (d, G) {
        d.data.release = false;
        d.play('AttackDraw', true);
        G.gun.pose('Ready');
        G.gun.aimStart();
      },
      exit: function (d, G) { G.gun.aimEnd(); },
      update: function (d, G, dt, inp) {
        d.rig = G.gun.rigSpec();
        d.boosting = false;
        var t = inp.gunAuto ? G.gun.autoAim(d) : { x: inp.aimX, y: inp.aimY };
        d.gunTarget = t;
        d.aimAt({ aimX: t.x, aimY: t.y });
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 12 * dt));
        d.swim(dt, inp, T.diver.aimSpeed, 0.6);
        if (inp.aimCancel) return d.go('swim');
        if (inp.gunReleased || !inp.gunHeld) d.data.release = true;
        if (d.data.release && d.st >= T.harpoon.minReady) {
          var r = G.gun.trigger(d);
          if (r === 'fired') return d.go('gunFire');
          if (r === 'empty') return d.go('swim');
        }
      },
    },

    gunFire: {
      enter: function (d, G) { d.play('AttackFire', true); G.gun.pose('Ready'); },
      update: function (d, G, dt, inp) {
        d.boosting = false;
        d.swim(dt, inp, T.diver.aimSpeed, 0.5);
        var moving = inp.mx !== 0 || inp.my !== 0;
        // lưới vừa kéo được cá: Dave giật tay về (AttackPull, không clip gốc nào dùng dãy này)
        if (G.gun.pull > 0) { d.play('AttackPull'); G.gun.pose('Pull'); }
        else if (d.st > T.harpoon.fireHold) { d.play(moving ? 'AttackFireMove' : 'AttackReady'); G.gun.pose('Ready'); }
        d.rig = G.gun.rigSpec();
        // giật lùi đẩy Dave về sau: giữ tư thế bắn tới khi gần đứng lại (hoặc người chơi bơi), kẻo swim quay mặt theo hướng lùi
        var settled = Math.hypot(d.vel.x, d.vel.y) < 0.35 || moving || d.st > 1.2;
        if (d.st >= Math.max(G.gun.spec.cooldown, T.harpoon.fireHold) && G.gun.pull <= 0 && settled) {
          if (inp.gunHeld) return d.go('gunAim');
          return d.go('swim');
        }
      },
    },

    melee: {
      enter: function (d, G) {
        d.play('MeleeDaggerAtk', true);
        d.knifeCd = T.knife.cooldown + T.knife.time;
        d.data.hit = false;
        G.audio.play('knife');
        // MeleeBubble của EffectGroup: bọt tung ra theo nhát dao
        G.fx.play(G.fx.dive('meleeBubble'), d.pos.x, d.pos.y, { scale: S, z: 0.14, angle: d.facing > 0 ? d.tilt : -d.tilt, flip: d.facing < 0, name: 'melee' });
      },
      update: function (d, G, dt, inp) {
        d.boosting = false;
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 12 * dt));
        d.swim(dt, inp, T.diver.aimSpeed, 0.5);
        if (!d.data.hit && d.st >= T.knife.hitAt) {
          d.data.hit = true;
          G.fishes.knife(d.pos.x + d.facing * 0.3 * S, d.pos.y + 0.05 * S, T.knife.range, G.loadout.knife);
        }
        if (d.st >= T.knife.time) d.go('swim');
      },
    },

    // Nhặt / xả thịt xác cá (FishInteractionBody gốc, Dave đứng lại).
    //   Cá nhỏ: PickupCommand (không chờ) vào túi ngay, Dave chạy một vòng clip PickUp.
    //   Cá lớn: CarvingCommand, giữ nút T.harvest.carveTime giây với clip Tanning và tiếng Carving lặp, xong thì vào túi và TanningAfter.
    //   Thả nút giữa chừng là thôi; bị cắn thì sang hurt như state Tanning gốc. Túi đầy: Overloaded, xác cá vẫn nằm đó.
    harvest: {
      enter: function (d, G) {
        var f = d.data.fish;
        d.boosting = false;
        d.faceToward(f.center().x - d.pos.x);
        if (G.catches.length >= G.loadout.cargo) {
          d.data.step = 'full';
          d.play('Overloaded', true);
          G.hud.toast('Túi đầy · phải thả cá đi');
        } else if (f.carvable()) {
          d.data.step = 'carve'; d.data.k = 0;
          d.play('Tanning', true);
          G.audio.loop('carve', 'carving', 1);
        } else {
          d.data.step = 'pick';
          d.play('PickUp', true);
          G.catchFish(f);
        }
      },
      exit: function (d, G) { G.audio.stopLoop('carve'); },
      update: function (d, G, dt, inp) {
        var f = d.data.fish, step = d.data.step;
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 12 * dt));
        d.vel.x *= Math.exp(-6 * dt); d.vel.y *= Math.exp(-6 * dt);
        d.swim(dt, { mx: 0, my: 0 }, T.diver.maxSpeed);
        if (step === 'carve') {
          if (!f.corpse() || !inp.interactHeld) return d.go('swim');
          d.data.k = Math.min(1, d.st / T.harvest.carveTime);
          if (d.data.k < 1) return;
          G.audio.stopLoop('carve');
          G.catchFish(f);
          d.data.step = 'after'; d.st = 0;
          d.play('TanningAfter', true);
          return;
        }
        // PickUpItem, TanningAfter, Overloaded gốc chạy hết một vòng clip rồi về Idle
        var c = clipOf(d.animName);
        if (d.st >= (c ? c.length : 0.4)) d.go('swim');
      },
    },

    hurt: {
      enter: function (d) { d.play(d.data.big ? 'Bigdamage' : 'Hit', true); },
      update: function (d, G, dt) {
        d.boosting = false;
        d.swim(dt, { mx: 0, my: 0 }, 6);
        if (d.st > T.diver.hurtTime) d.go('swim');
      },
    },

    // Trồi lên mặt nước: thở phào rồi nổi dập dềnh (Cheer trong sheet là Dave mặc đồ trên bờ nên không dùng).
    surfaced: {
      immune: true,
      enter: function (d) { d.boosting = false; d.play('Relief', true); },
      update: function (d, G, dt) {
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 8 * dt));
        d.vel.x *= Math.exp(-3 * dt);
        d.vel.y = Math.sin(d.st * 2.2) * 0.15;
        d.swim(dt, { mx: 0, my: 0 }, 1);
        if (d.st > 0.9) d.play('Idle');
      },
    },

    // Ngất: Die (17 khung, 2,33 giây) rồi DieIdle lặp.
    dead: {
      immune: true,
      enter: function (d, G) {
        d.o2 = 0;
        d.boosting = false;
        d.play('Die', true);
        G.audio.play('dave_dead');
        G.harpoon.drop();
        G.fx.burst('bubbleBig', d.pos.x, d.pos.y + 0.1, 16, 1.4);
      },
      update: function (d, G, dt) {
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 4 * dt));
        d.vel.y -= 0.15 * dt;
        d.swim(dt, { mx: 0, my: 0 }, 0.4);
        if (d.st > 3.0) G.onDead();
      },
    },
  };

  HX.Diver = Diver;
  HX.Diver.setFrame = setFrame;
  HX.Diver.clipOf = clipOf;
  HX.Diver.CLIP = CLIP;
})(window.HX = window.HX || {});
