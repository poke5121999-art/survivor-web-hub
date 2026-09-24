// Dave: tấm sprite từ sheet gốc + lớp tay cầm súng xoay theo điểm ngắm, và máy trạng thái người lặn.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, D = window.HX_ASSETS.dave, M = window.HX_META;
  // Sheet lưới: mỗi hàng một hoạt ảnh, rộng bằng hoạt ảnh dài nhất.
  var names = Object.keys(D.anims);
  var SW = D.cell * Math.max.apply(null, names.map(function (k) { return D.anims[k].n; }));
  var SH = D.cell * (1 + Math.max.apply(null, names.map(function (k) { return D.anims[k].row; })));

  function setFrame(mesh, anim, f) {
    var a = D.anims[anim], c = D.cell;
    mesh.material.uniforms.uvRect.value.set(f * c / SW, 1 - (a.row + 1) * c / SH, c / SW, c / SH);
  }

  function lerpAngle(a, b, k) {
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * k;
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
  var CW = D.cell / D.ppu * (D.scale || 1), S = D.scale || 1;
  // Sheet đặt mỗi khung đã cắt viền vào giữa ô, nên khung bắn súng phụ lệch khỏi chỗ gốc so với AttackReady.
  // [ĐO TRONG REPO, m_RD.textureRectOffset] dời thân về đúng chỗ gốc (px, y xuống); xem js/gun.js.
  var BODY_SHIFT = { AttackFire: [6, 1], AttackPull: [11, -1] };

  function Diver(G, x, y) {
    this.G = G;
    var tex = G.gfx.tex(D.sheet);
    this.root = new THREE.Group();
    this.body = HX.gfx.sprite(tex, CW, CW, { alphaCut: 0.5, depthWrite: true });
    var ap = D.anims.HookAttackArm.pivot;
    this.arm = HX.gfx.sprite(tex, CW, CW, { alphaCut: 0.5, depthWrite: true, pivot: ap });
    this.armPivot = [(ap[0] - 0.5) * CW, (ap[1] - 0.5) * CW];
    this.arm.position.z = 0.01;
    setFrame(this.arm, 'HookAttackArm', 0);
    this.arm.visible = false;
    this.root.add(this.body); this.root.add(this.arm);
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
    this.trailT = 0;
    this.breatheT = 0;
    this.animName = null; this.animT = 0; this.animLoop = true;
    this.state = null; this.st = 0; this.data = {};
    this.go('enter');
  }

  Diver.prototype.play = function (name, loop, restart) {
    if (this.animName === name && !restart) return;
    this.animName = name; this.animT = 0; this.animLoop = loop !== false;
  };

  Diver.prototype.go = function (name, data) {
    var prev = this.state && STATES[this.state];
    if (prev && prev.exit) prev.exit(this, this.G);
    this.state = name; this.st = 0; this.data = data || {};
    if (STATES[name].enter) STATES[name].enter(this, this.G);
  };

  Diver.prototype.gunTip = function () {
    var f = this.facing, rot = this.armRot();
    var lx = T.harpoon.gunTip[0] * S * f, ly = T.harpoon.gunTip[1] * S;
    var c = Math.cos(rot), s = Math.sin(rot);
    return { x: this.pos.x + this.armPivot[0] * f + c * lx - s * ly, y: this.pos.y + this.armPivot[1] + s * lx + c * ly };
  };

  Diver.prototype.armRot = function () {
    var la = Math.atan2(Math.sin(this.aimAngle), Math.abs(Math.cos(this.aimAngle)));
    return this.facing > 0 ? la : -la;
  };

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

  Diver.prototype.hurt = function (dmg, fromX, fromY) {
    if (this.invuln > 0 || this.state === 'dead' || this.state === 'enter' || this.state === 'surfaced') return false;
    var G = this.G;
    this.o2 = Math.max(0, this.o2 - dmg);
    this.invuln = T.diver.invulnTime;
    var dx = this.pos.x - fromX, dy = this.pos.y - fromY, l = Math.hypot(dx, dy) || 1;
    this.vel.x = dx / l * T.diver.knockback; this.vel.y = dy / l * T.diver.knockback;
    G.audio.play('dave_hit' + (1 + Math.floor(Math.random() * 3)));
    G.shake(dmg >= T.diver.bigHurtAt ? 2 : 1);
    G.hud.flash();
    G.fx.burst('bubble', this.pos.x, this.pos.y + 0.1, 8, 1.2);
    if (this.o2 <= 0) { this.go('dead'); return true; }
    if (this.state === 'swim' || this.state === 'aim' || this.state === 'melee' || this.state === 'gunAim' || this.state === 'gunFire') this.go('hurt', { big: dmg >= T.diver.bigHurtAt });
    return true;
  };

  Diver.prototype.update = function (dt, inp) {
    var G = this.G;
    this.st += dt; this.animT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.knifeCd = Math.max(0, this.knifeCd - dt);
    this.showGun = false;
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

    this.trailT -= dt;
    if (this.trailT <= 0 && this.state !== 'dead') {
      this.trailT = this.boosting ? T.fx.boostTrailEvery : T.fx.trailEvery * (0.7 + Math.random() * 0.6);
      var bx = this.pos.x - Math.cos(this.tilt) * this.facing * 0.12 * S, by = this.pos.y + 0.12 * S;
      G.fx.spawn(Math.random() < 0.3 ? 'bubbleBig' : 'bubble', bx, by, 0.12, -this.vel.x * 0.2, 0.3);
    }
    this.draw();
  };

  Diver.prototype.draw = function () {
    var a = D.anims[this.animName], f = Math.floor(this.animT * a.fps);
    f = this.animLoop ? f % a.n : Math.min(a.n - 1, f);
    setFrame(this.body, this.animName, f);
    var sh = BODY_SHIFT[this.animName];
    this.body.position.set(sh ? sh[0] / D.ppu * S * this.facing : 0, sh ? -sh[1] / D.ppu * S : 0, 0);
    this.root.position.set(this.pos.x, this.pos.y, 0.1);
    this.body.scale.x = CW * this.facing;
    this.body.rotation.z = this.facing > 0 ? this.tilt : -this.tilt;
    var blink = this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 14) % 2 === 0;
    this.body.material.uniforms.flash.value = blink ? 0.55 : 0;
    this.arm.visible = !!this.showArm;
    if (this.showArm) {
      this.arm.position.set(this.armPivot[0] * this.facing, this.armPivot[1], 0.01);
      this.arm.scale.x = CW * this.facing;
      this.arm.rotation.z = this.armRot();
      this.arm.material.uniforms.flash.value = this.body.material.uniforms.flash.value;
    }
    if (this.G.gun) this.G.gun.drawRig(this, !!this.showGun);
  };

  Diver.prototype.remove = function () { this.G.gfx.scene.remove(this.root); };

  Diver.prototype.aimAt = function (inp) {
    this.aimAngle = Math.atan2(inp.aimY - (this.pos.y + this.armPivot[1]), inp.aimX - this.pos.x);
    this.faceToward(inp.aimX - this.pos.x);
  };

  var STATES = {
    enter: {
      enter: function (d, G) {
        d.vel.x = 0.4; d.vel.y = -2.6; d.tilt = -1.2;
        G.audio.play('dave_diving');
        G.fx.spawn('puff', d.pos.x, d.pos.y + 0.3, 0.2, 0, 0, 1.6);
        G.fx.burst('bubbleBig', d.pos.x, d.pos.y, 14, 1.5);
      },
      update: function (d, G, dt) {
        d.boosting = false;
        d.swim(dt, { mx: 0, my: 0 }, 4);
        d.play('MoveSideDown');
        if (d.st > T.diver.enterTime) d.go('swim');
      },
    },

    swim: {
      update: function (d, G, dt, inp) {
        d.showArm = false;
        var moving = inp.mx !== 0 || inp.my !== 0;
        d.boosting = inp.boost && moving;
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
        d.play(swimVariant(d.tilt, 'ShortDash'), false, true);
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

    // Giữ chuột: thân đứng HookAttackReady, lớp tay xoay theo điểm ngắm; thả chuột là bắn.
    aim: {
      enter: function (d, G) {
        d.data.release = false;
        d.play('HookAttackReady', false, true);
        G.audio.play('harpoon_aim', { vol: 0.6 });
      },
      update: function (d, G, dt, inp) {
        d.showArm = true;
        d.boosting = false;
        d.aimAt(inp);
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 12 * dt));
        d.swim(dt, inp, T.diver.aimSpeed, 0.6);
        if (inp.fireReleased || !inp.fireHeld) d.data.release = true;
        if (d.data.release && d.st >= T.harpoon.minReady) {
          var tip = d.gunTip();
          G.harpoon.fire(tip.x, tip.y, d.aimAngle);
          d.go('shoot');
        }
      },
    },

    shoot: {
      enter: function (d) { d.play('HookAttackFire', false, true); },
      update: function (d, G, dt, inp) {
        d.showArm = true;
        d.aimAt({ aimX: G.harpoon.x, aimY: G.harpoon.y });
        d.swim(dt, inp, T.diver.aimSpeed, 0.5);
        if (G.harpoon.state === 'ready') return d.go('swim');
        if (d.st > T.harpoon.fireHold) d.play('HookAttackReady');
      },
    },

    // Cá đã chết trên xiên: Dave kéo dây, cá trôi về.
    reel: {
      enter: function (d, G) { d.play('HookAttackPull'); G.audio.loop('pull', 'harpoon_pull', 0.7); },
      exit: function (d, G) { G.audio.stopLoop('pull'); },
      update: function (d, G, dt, inp) {
        d.showArm = false;
        d.faceToward(G.harpoon.x - d.pos.x);
        d.tilt = lerpAngle(d.tilt, Math.atan2(G.harpoon.y - d.pos.y, Math.abs(G.harpoon.x - d.pos.x)) * 0.5, Math.min(1, 8 * dt));
        d.swim(dt, inp, T.diver.aimSpeed * 0.7, 0.4);
        if (G.harpoon.state === 'ready') d.go('swim');
      },
    },

    // Giằng co với cá lớn: bấm liên tục để kéo thanh đầy trước khi hết giờ.
    tug: {
      enter: function (d, G) {
        d.play('HookAttackPull');
        d.data.gauge = 0.35; d.data.time = T.tug.time;
        G.audio.play('qte_raise');
        G.audio.loop('pull', 'harpoon_pull', 0.8);
        G.hud.tug(true, d.data.gauge, 1);
      },
      exit: function (d, G) { G.audio.stopLoop('pull'); G.hud.tug(false); },
      update: function (d, G, dt, inp) {
        var fish = G.harpoon.fish;
        if (!fish) return d.go('swim');
        d.showArm = false;
        var dx = fish.pos.x - d.pos.x, dy = fish.pos.y - d.pos.y, l = Math.hypot(dx, dy) || 1;
        d.faceToward(dx);
        d.tilt = lerpAngle(d.tilt, Math.atan2(dy, Math.abs(dx)) * 0.6, Math.min(1, 8 * dt));
        // cá kéo Dave đi theo nó
        d.vel.x += dx / l * T.tug.pull * dt * 3; d.vel.y += dy / l * T.tug.pull * dt * 3;
        d.swim(dt, { mx: 0, my: 0 }, T.tug.pull);
        d.data.time -= dt;
        d.data.gauge -= T.tug.decay * dt;
        if (inp.tap) {
          d.data.gauge += T.tug.tapGain * Math.max(0.2, Math.min(1.5, T.tug.hpRef / Math.max(1, fish.hp)));
          G.audio.play('harpoon_tap', { vol: 0.8, rate: 0.9 + d.data.gauge * 0.4 });
          d.play('HookAttackPull', true, true);
          fish.flashT = 0.08;
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

    // Súng phụ: giữ chuột phải (hoặc nút Súng) là giơ súng, thân AttackReady, tay + súng xoay theo điểm ngắm; thả là bắn.
    gunAim: {
      enter: function (d, G) {
        d.data.release = false;
        d.play('AttackReady', false, true);
        G.gun.pose('Ready');
        G.gun.aimStart();
      },
      exit: function (d, G) { G.gun.aimEnd(); },
      update: function (d, G, dt, inp) {
        d.showGun = true;
        d.boosting = false;
        var t = inp.gunAuto ? G.gun.autoAim(d) : { x: inp.aimX, y: inp.aimY };
        d.gunTarget = t;
        d.aimAt({ aimX: t.x, aimY: t.y });
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 12 * dt));
        d.swim(dt, inp, T.diver.aimSpeed, 0.6);
        if (inp.gunReleased || !inp.gunHeld) d.data.release = true;
        if (d.data.release && d.st >= T.harpoon.minReady) {
          var r = G.gun.trigger(d);
          if (r === 'fired') return d.go('gunFire');
          if (r === 'empty') return d.go('swim');
        }
      },
    },

    gunFire: {
      enter: function (d, G) { d.play('AttackFire', false, true); G.gun.pose('Ready'); },
      update: function (d, G, dt, inp) {
        d.showGun = true;
        d.boosting = false;
        d.swim(dt, inp, T.diver.aimSpeed, 0.5);
        // lưới vừa kéo được cá: Dave giật tay về (AttackPull)
        if (G.gun.pull > 0) { d.play('AttackPull'); G.gun.pose('Pull'); }
        else if (d.st > T.harpoon.fireHold) { d.play('AttackReady'); G.gun.pose('Ready'); }
        // giật lùi đẩy Dave về sau: giữ tư thế bắn tới khi gần đứng lại (hoặc người chơi bơi), kẻo swim quay mặt theo hướng lùi
        var settled = Math.hypot(d.vel.x, d.vel.y) < 0.35 || inp.mx !== 0 || inp.my !== 0 || d.st > 1.2;
        if (d.st >= Math.max(G.gun.spec.cooldown, T.harpoon.fireHold) && G.gun.pull <= 0 && settled) {
          if (inp.gunHeld) return d.go('gunAim');
          return d.go('swim');
        }
      },
    },

    melee: {
      enter: function (d, G) {
        d.play('MeleeDaggerAtk', false, true);
        d.knifeCd = T.knife.cooldown + T.knife.time;
        d.data.hit = false;
        G.audio.play('knife');
      },
      update: function (d, G, dt, inp) {
        d.showArm = false;
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

    hurt: {
      enter: function (d) { d.play(d.data.big ? 'Bigdamage' : 'Hit', !d.data.big, true); },
      update: function (d, G, dt) {
        d.showArm = false;
        d.boosting = false;
        d.swim(dt, { mx: 0, my: 0 }, 6);
        if (d.st > T.diver.hurtTime) d.go('swim');
      },
    },

    // Trồi lên mặt nước: thở phào rồi nổi dập dềnh (Cheer trong sheet là Dave mặc đồ trên bờ nên không dùng).
    surfaced: {
      enter: function (d) { d.showArm = false; d.boosting = false; d.play('Relief', false, true); },
      update: function (d, G, dt) {
        d.tilt = lerpAngle(d.tilt, 0, Math.min(1, 8 * dt));
        d.vel.x *= Math.exp(-3 * dt);
        d.vel.y = Math.sin(d.st * 2.2) * 0.15;
        d.swim(dt, { mx: 0, my: 0 }, 1);
        if (d.st > 0.9) d.play('Idle');
      },
    },

    dead: {
      enter: function (d, G) {
        d.o2 = 0;
        d.showArm = false;
        d.boosting = false;
        d.play('Die', false, true);
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
})(window.HX = window.HX || {});
