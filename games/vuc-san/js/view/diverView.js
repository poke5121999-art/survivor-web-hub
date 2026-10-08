// Lớp vẽ: một thợ lặn. Tấm sprite từ sheet đã đổi màu (diverSheet.js) + lớp tay cầm súng xiên dựng theo prefab
// PlayerGroup (port ArmRig của games/biet-doi-lan/js/engine/dave.js), quầng đèn đội đầu, nhãn tên.
// Chỉ đọc actor: hoạt ảnh suy từ st + vận tốc + intent mỗi khung.
(function (VS) {
  'use strict';
  var HX = window.HX, D = window.HX_ASSETS.dave, TD = window.HX_TUNING.diver;
  var DS = VS.diverSheet;

  // Ô 120 px ở 100 px/m = 1,2 m; PlayerGroup gốc phóng thân Dave ×2 (D.scale).
  var S = D.scale || 1, CW = D.cell / D.ppu * S, PX = S / D.ppu;
  var R = D.rig;
  var ARM_AT = [R.rangeArm[0] * S, R.rangeArm[1] * S];
  var HOLD_AT = [(R.gunHandler[0] - R.rangeArm[0]) * S, (R.gunHandler[1] - R.rangeArm[1]) * S];
  var BEHIND_AT = [R.behindArm[0] * S, R.behindArm[1] * S];
  var AIM_OFF = (R.behindAimOffsetDeg || 0) * Math.PI / 180;
  var SPEAR = D.spear.size[0] / D.spear.ppu;   // chiều dài mũi xiên, đơn vị CharacterBody
  // Clip không lặp chạy xong thì sang clip này (như state machine gốc).
  var NEXT = { Die: 'DieIdle' };
  var AIM_HOLD = 0.9;      // giây giữ tư thế cầm súng sau phát bắn cuối

  function lerpAngle(a, b, k) { var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * k; }
  function hasEffect(a, kind, t) {
    var e = a.effects;
    if (!e) return false;
    for (var i = 0; i < e.length; i++) if (e[i].kind === kind && (e[i].until == null || e[i].until > t)) return true;
    return false;
  }
  // Góc của tay (−π/2..π/2) khi quay phải; quay trái thì lật gương.
  function localAngle(a) { return Math.atan2(Math.sin(a), Math.abs(Math.cos(a))); }
  function variant(deg, pre) { return pre + (deg > 62 ? 'Up' : deg > 22 ? 'SideUp' : deg < -62 ? 'Down' : deg < -22 ? 'SideDown' : 'Side'); }
  function gunSpec(name) {
    var list = D.harpoonGuns || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return { name: name, img: 'dave/harpoon/' + name + '.png', size: [200, 200], pivot: [0.5, 0.5], ppu: 100 };
  }

  // ---------- lớp tay cầm súng ----------
  // RangeWeaponArm: tay gần (AttackReadyArms) xoay quanh nút của nó theo điểm ngắm; con: HarpoonHandler treo súng,
  // ProjectileAttachTransform (đuôi mũi xiên trong súng). BehindRangeWeaponArm: tay xa sau thân, nhắm BehindArmGrabPoint.
  function ArmRig(G, root, sheet) {
    this.G = G; this.sheet = sheet;
    this.flip = new THREE.Group();
    this.arm = new THREE.Group(); this.arm.position.set(ARM_AT[0], ARM_AT[1], 0);
    this.hold = new THREE.Group(); this.hold.position.set(HOLD_AT[0], HOLD_AT[1], 0);
    this.behind = new THREE.Group(); this.behind.position.set(BEHIND_AT[0], BEHIND_AT[1], 0);
    var mk = function (z) { var m = HX.gfx.sprite(sheet.tex, CW, CW, { alphaCut: 0.5, depthWrite: true }); m.position.z = z; return m; };
    this.nearM = mk(0.02); this.behindM = mk(-0.012);
    var sp = D.spear;
    this.spear = HX.gfx.sprite(G.gfx.tex('fx/HarpoonProjectile.png'), SPEAR * S, sp.size[1] / sp.ppu * S, { alphaCut: 0.5, depthWrite: true, pivot: sp.pivot });
    this.spear.position.set((R.projectileAttach[0] - R.gunHandler[0]) * S, (R.projectileAttach[1] - R.gunHandler[1]) * S, 0.005);
    this.arm.add(this.nearM); this.arm.add(this.hold); this.hold.add(this.spear);
    this.behind.add(this.behindM);
    this.flip.add(this.behind); this.flip.add(this.arm);
    this.flip.visible = false;
    root.add(this.flip);
    this.th = 0;
    this.place(this.nearM, 'AttackReadyArms');
    this.place(this.behindM, 'AttackReadyRightArm');
  }
  // Sprite tay lấy trong sheet: pivot của sprite đặt đúng vào nút.
  ArmRig.prototype.place = function (m, name) {
    var a = D.anims[name];
    this.sheet.uv(a.row, 0, m.material.uniforms.uvRect.value);
    m.position.x = -(a.pivot[0] - 0.5) * CW; m.position.y = -(a.pivot[1] - 0.5) * CW;
  };
  ArmRig.prototype.setHeld = function (h) {
    var m = HX.gfx.sprite(this.G.gfx.tex(h.img.replace(/^art\//, '')), h.size[0] / h.ppu * S, h.size[1] / h.ppu * S, { alphaCut: 0.5, depthWrite: true, pivot: h.pivot });
    m.position.z = 0.01;
    this.hold.add(m);
    this.held = m;
  };
  // Điểm p (toạ độ CharacterBody lúc tay nằm ngang) trên tay gần ('arm') hay trên súng ('hold') → mét so với tâm, quay phải.
  ArmRig.prototype.local = function (p, on) {
    var x, y, c, s, t;
    if (on === 'hold') { x = (p[0] - R.gunHandler[0]) * S + HOLD_AT[0]; y = (p[1] - R.gunHandler[1]) * S + HOLD_AT[1]; }
    else { x = (p[0] - R.rangeArm[0]) * S; y = (p[1] - R.rangeArm[1]) * S; }
    c = Math.cos(this.th); s = Math.sin(this.th); t = x * c - y * s; y = x * s + y * c; x = t;
    return [x + ARM_AT[0], y + ARM_AT[1]];
  };
  // aim: góc ngắm thế giới; face: ±1; kick: 0..1 giật lùi; spear: mũi xiên nằm trong súng.
  ArmRig.prototype.pose = function (aim, face, kick, spear, flash) {
    this.flip.scale.x = face;
    this.th = localAngle(aim);
    this.arm.rotation.z = this.th;
    if (this.held) this.held.position.x = -2 * PX * (kick || 0);
    this.spear.visible = !!spear;
    // AimConstraint gốc: trục x của tay xa chĩa vào BehindArmGrabPoint, cộng m_RotationOffset.z
    var g = this.local(R.grabPoint, 'arm');
    this.behind.rotation.z = Math.atan2(g[1] - BEHIND_AT[1], g[0] - BEHIND_AT[0]) + AIM_OFF;
    [this.nearM, this.behindM, this.spear].concat(this.held ? [this.held] : []).forEach(function (m) { m.material.uniforms.flash.value = flash; });
  };
  ArmRig.prototype.dispose = function () {
    [this.nearM, this.behindM, this.spear, this.held].forEach(function (m) { if (m) m.material.dispose(); });
  };

  // ---------- một thợ lặn ----------
  // G: { gfx, fx, audio, tags (phần tử DOM chứa nhãn) }; a: actor của trận (chỉ đọc).
  function DiverView(G, a, idx) {
    this.G = G; this.id = a.id; this.defId = a.defId;
    var def = VS.DIVERS[a.defId] || VS.DIVERS.dave;
    this.sheet = DS.get(def.id);
    this.root = new THREE.Group();
    this.body = HX.gfx.sprite(this.sheet.tex, CW, CW, { alphaCut: 0.5, depthWrite: true });
    this.root.add(this.body);
    this.arms = new ArmRig(G, this.root, this.sheet);
    this.arms.setHeld(gunSpec(def.gun));
    // quầng đèn đội đầu (HeadLight gốc, cộng sáng) + lõi nhỏ ở mắt kính
    this.lamp = HX.gfx.sprite(G.gfx.tex('fx/HeadLight.png', true), 0.75, 0.75, { additive: true, alphaCut: 0, tint: 0xffe6b0, opacity: 0.42 });
    this.lamp.position.z = 0.03;
    this.core = HX.gfx.sprite(G.gfx.tex('fx/E_Glow_01A.png', true), 0.28, 0.28, { additive: true, alphaCut: 0, tint: 0xfff4d8, opacity: 0.75 });
    this.core.position.z = 0.035;
    this.root.add(this.lamp); this.root.add(this.core);
    this.z = 0.1 - (idx || 0) * 0.004;
    this.root.visible = false;
    G.gfx.scene.add(this.root);
    this.anim = 'Idle'; this.animT = 0; this.tilt = 0; this.face = 1; this.aimA = 0;
    this.hitT = 0; this.flashT = 0; this.lastSt = null; this.lastShot = -99; this.kick = 0; this.bubT = Math.random();
    this.trail = null; this.trailName = null;
    this.tag = makeTag(G, a);
    this.visible = false;
  }

  function makeTag(G, a) {
    var el = document.createElement('div');
    el.className = 'vs-hud-tag';
    el.innerHTML = '<b></b><i><s></s></i>';
    el.querySelector('b').textContent = a.name || '';
    el.hidden = true;
    G.tags.appendChild(el);
    return { el: el, bar: el.querySelector('s'), k: -1, cls: '' };
  }

  DiverView.prototype.play = function (name, restart) {
    if (this.anim === name && !restart) return;
    this.anim = name; this.animT = 0;
  };
  // Khung thân theo dãy khoá sprite của clip gốc (không chia đều theo fps).
  DiverView.prototype.drawBody = function () {
    var name = this.anim, c = DS.clipOf(name), t = this.animT;
    if (c && !c.loop && t >= c.length && NEXT[name]) { this.play(NEXT[name]); name = this.anim; c = DS.clipOf(name); t = 0; }
    if (!c) { c = DS.clipOf('Idle'); }
    t = c.loop ? t % c.length : Math.min(t, c.length);
    var fr = c.frames[0];
    for (var i = 1; i < c.frames.length && c.frames[i][0] <= t + 1e-6; i++) fr = c.frames[i];
    this.sheet.uv(fr[1], fr[2], this.body.material.uniforms.uvRect.value);
  };

  // Bị cắn / trúng đòn: chớp sáng và khung Hit ngắn.
  DiverView.prototype.hurt = function () { this.hitT = 0.3; this.flashT = 0.6; };
  // Vừa bắn (lớp vẽ thấy mũi xiên mới của người này): giữ tư thế cầm súng thêm một lúc.
  DiverView.prototype.shot = function (t) { this.lastShot = t; this.kick = 1; };

  // Góc ngắm thế giới từ intent (điểm ngắm), không có thì theo hướng mặt.
  function aimOf(a) {
    var it = a.intent;
    if (it && it.aimX != null && (it.aimX !== a.x || it.aimY !== a.y)) return Math.atan2(it.aimY - a.y, it.aimX - a.x);
    if (a.ang != null) return a.ang;
    return (a.face || 1) > 0 ? 0 : Math.PI;
  }
  DiverView.aimOf = aimOf;

  // ctx: { visible, mate, self, t (đồng hồ lớp vẽ), toScreen(x, y) }
  DiverView.prototype.update = function (a, dt, ctx) {
    var G = this.G, st = a.st || 'swim';
    var show = ctx.visible && st !== 'out';
    this.visible = show;
    this.root.visible = show;
    if (st !== this.lastSt) {
      if (st === 'down') this.play('Die', true);
      this.lastSt = st;
    }
    this.hitT = Math.max(0, this.hitT - dt); this.flashT = Math.max(0, this.flashT - dt); this.kick = Math.max(0, this.kick - dt * 6);
    var aim = aimOf(a);
    this.aimA = lerpAngle(this.aimA, aim, Math.min(1, dt * 18));
    if (!show) { this.stopTrail(); this.tagHide(); return; }
    this.animT += dt;
    var vx = a.vx || 0, vy = a.vy || 0, sp = Math.hypot(vx, vy), it = a.intent || {};
    var def = VS.DIVERS[a.defId] || {}, boosting = !!it.boost && sp > (def.speed || 2.6) * 0.75;
    var dazed = st === 'swim' && (hasEffect(a, 'stun', ctx.mt) || hasEffect(a, 'sleep', ctx.mt));
    var aiming = st === 'swim' && !dazed && (!!it.fireHeld || ctx.t - this.lastShot < AIM_HOLD);
    var face = a.face || this.face || 1;
    var armsOn = false;
    if (st === 'down') {
      this.tilt = lerpAngle(this.tilt, 0, Math.min(1, dt * 6));
      if (this.anim !== 'Die' && this.anim !== 'DieIdle') this.play('Die', true);
    } else if (st === 'held') {
      this.play('Bigdamage');
      this.tilt = lerpAngle(this.tilt, 0, Math.min(1, dt * 8));
    } else if (dazed) {
      this.play('Shock');
      this.tilt = lerpAngle(this.tilt, 0, Math.min(1, dt * 10));
    } else if (this.hitT > 0) {
      this.play('Hit');
      this.tilt = lerpAngle(this.tilt, 0, Math.min(1, dt * 10));
    } else if (aiming) {
      // RangeWeaponFire_Move gốc: thân bơi không tay (hàng UVLight_Move) + lớp tay cầm súng xoay theo điểm ngắm
      this.play(sp > 0.4 ? 'AimMove' : 'AimIdle');
      face = Math.cos(this.aimA) < 0 ? -1 : 1;
      this.tilt = lerpAngle(this.tilt, 0, Math.min(1, dt * 12));
      armsOn = true;
    } else if (sp > 0.35) {
      var want = Math.atan2(vy, Math.abs(vx));
      this.tilt = lerpAngle(this.tilt, want, Math.min(1, TD.turnRate * dt));
      this.play(variant(this.tilt * 180 / Math.PI, boosting ? 'BMove' : 'Move'));
    } else {
      this.tilt = lerpAngle(this.tilt, 0, Math.min(1, dt * 6));
      this.play('Idle');
    }
    this.face = face;
    this.drawBody();
    this.root.position.set(a.x, a.y, this.z);
    this.body.scale.x = CW * face;
    this.body.rotation.z = face > 0 ? this.tilt : -this.tilt;
    var blink = (st === 'held' || this.flashT > 0) && Math.floor(ctx.t * 14) % 2 === 0;
    var flash = blink ? 0.55 : 0;
    this.body.material.uniforms.flash.value = flash;
    this.arms.flip.visible = armsOn;
    if (armsOn) this.arms.pose(this.aimA, face, this.kick, ctx.t - this.lastShot > 0.25, flash);
    // đèn đội đầu: quầng ở mắt kính. Mặt nằm ở (+0,49; 0) m trong các khung bơi ngang (trước khi xoay theo thân),
    // ở (0; +0,32) m trong khung đứng / cầm súng (đo trên sheet gốc)
    var lampOn = !!a.light && (st === 'swim' || st === 'held');
    this.lamp.visible = this.core.visible = lampOn;
    if (lampOn) {
      var swimFrame = this.anim.indexOf('Move') >= 0 && this.anim !== 'AimMove', lx = swimFrame ? 0.47 : 0.03, ly = swimFrame ? 0.02 : 0.31;
      var tl = face > 0 ? this.tilt : -this.tilt, c = Math.cos(tl), sn = Math.sin(tl);
      var hx = (lx * c - ly * sn * face) * face, hy = lx * sn * face + ly * c;
      this.lamp.position.set(hx, hy, 0.03); this.core.position.set(hx, hy, 0.035);
      this.lamp.material.uniforms.opacity.value = 0.38 + 0.05 * Math.sin(ctx.t * 9 + this.id);
    }
    this.bubbles(a, dt, st, sp, boosting);
    // chảy máu (Cưa Xẻ): vệt máu nhỏ đều đều
    if (hasEffect(a, 'bleed', ctx.mt)) {
      this.bleedT = (this.bleedT || 0) - dt;
      if (this.bleedT <= 0) { this.bleedT = 0.35; this.G.fx.spawn('blood', a.x - face * 0.2, a.y, 0.12, -face * 0.3, 0.1, 0.45); }
    }
    this.tagUpdate(a, ctx);
  };

  // Bọt gốc của EffectGroup: TailBubble khi bơi, TailBubble_Fast khi tăng tốc; thở ra từng lúc trên đầu.
  DiverView.prototype.bubbles = function (a, dt, st, sp, boosting) {
    var fx = this.G.fx, self = this;
    var want = st === 'swim' && sp > 0.35 ? (boosting ? 'tailBubbleFast' : 'tailBubble') : null;
    if (want !== this.trailName) {
      this.stopTrail();
      if (want && fx.dive(want)) {
        this.trail = fx.play(fx.dive(want), a.x, a.y, { scale: S, z: 0.12, name: want, follow: function () {
          return self.visible ? { x: self.root.position.x, y: self.root.position.y, angle: self.face > 0 ? self.tilt : -self.tilt, flip: self.face < 0 } : null;
        } });
      }
      this.trailName = want;
    }
    this.bubT -= dt;
    if (this.bubT <= 0 && st !== 'out') {
      this.bubT = 1.6 + Math.random() * 1.2;
      fx.burst('bubble', a.x + this.face * 0.28, a.y + 0.35, 2, 0.35, 0.12);
    }
  };
  DiverView.prototype.stopTrail = function () {
    if (this.trail) this.trail.stop();
    this.trail = null; this.trailName = null;
  };

  // Đầu dây xiên (RopeAttachRigidbody trên tay gần) hay tâm thân nếu không cầm súng.
  DiverView.prototype.ropeFrom = function () {
    var p = this.root.position;
    if (!this.arms.flip.visible) return { x: p.x + this.face * 0.25, y: p.y + 0.05 };
    this.arms.th = localAngle(this.aimA);
    var q = this.arms.local(R.ropeAttach, 'arm');
    return { x: p.x + q[0] * this.face, y: p.y + q[1] };
  };

  DiverView.prototype.tagUpdate = function (a, ctx) {
    var tg = this.tag, el = tg.el;
    if (ctx.self) { this.tagHide(); return; }
    var cls = 'vs-hud-tag ' + (ctx.mate ? 'mate' : 'foe') + (a.st === 'down' ? ' down' : '');
    if (cls !== tg.cls) { tg.cls = cls; el.className = cls; }
    var s = ctx.toScreen(a.x, a.y + 0.95);
    var on = s.x > -80 && s.x < innerWidth + 80 && s.y > -40 && s.y < innerHeight + 60;
    if (el.hidden === on) el.hidden = !on;
    if (!on) return;
    el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px) translate(-50%,-100%)';
    var k = a.o2Max ? Math.max(0, Math.min(100, Math.round(a.o2 / a.o2Max * 100))) : 100;
    if (k !== tg.k) { tg.k = k; tg.bar.style.width = k + '%'; }
  };
  DiverView.prototype.tagHide = function () { if (!this.tag.el.hidden) this.tag.el.hidden = true; };

  // Khung bao trên màn hình (px CSS) của thân, cho kiểm.
  DiverView.prototype.screenBox = function (toScreen) {
    var p = this.root.position, h = CW * 0.32;
    var a = toScreen(p.x - h, p.y + h), b = toScreen(p.x + h, p.y - h);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  };

  DiverView.prototype.dispose = function () {
    this.stopTrail();
    this.G.gfx.scene.remove(this.root);
    this.body.material.dispose(); this.lamp.material.dispose(); this.core.material.dispose();
    this.arms.dispose();
    this.tag.el.remove();
  };

  VS.DiverView = DiverView;
})(window.VS = window.VS || {});
