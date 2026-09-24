// Súng phụ trong lượt lặn: một khẩu đang chọn (G.loadout.gun), đạn theo lượt, đạn bay, trúng cá, hiệu ứng và tiếng gốc.
// Hình súng cầm tay, đạn, tia lửa nòng, vệt bọt, trúng, nổ, lưới, ngủ: đều lấy từ data/boat_assets.js (bóc từ bản gốc).
// Tư thế: thân RangeWeaponDraw → RangeWeaponAim → RangeWeaponFire; lớp tay và chỗ treo súng lấy từ prefab PlayerGroup (js/dave.js ArmRig).
(function (HX) {
  'use strict';
  var M = window.HX_META, BA = window.HX_BOAT_ASSETS, D = window.HX_ASSETS.dave;
  var S = D.scale || 1;
  var VFX = BA ? BA.gunVfx : {};

  // Đầu nòng so với tâm ảnh súng cầm tay (px, y lên), đo trên art/gear/gun/*.png [ĐO TRONG REPO].
  // Ảnh súng treo ở GunHandler của lớp tay RangeWeaponArm (xem ArmRig trong js/dave.js), tâm ảnh đúng vào nút.
  var MUZZLE = { rifle: [15, 2.5], shotgun: [16, 3], sniper: [19, 3.5], sleep: [9, 2.5], net: [17, 4], grenade: [14, 4] };
  var BULLET_SCALE = 1;   // [DtD] projectile.scale của prefab đạn

  // ---------- tiếng: ghép khoá audio/gun_*.mp3 vào bảng tiếng chung (audio.js tra HX_ASSETS.audio) ----------
  function soundKeys(id) {
    var art = BA && BA.guns && BA.guns[id];
    if (!art || !art.sfx) return [];
    var A = window.HX_ASSETS.audio, keys = [];
    Object.keys(art.sfx).forEach(function (k) {
      var src = art.sfx[k], key = src.split('/').pop().replace(/\.mp3$/, '');
      if (!A[key]) A[key] = { src: src, kind: /aim/.test(k) ? 'loop' : 'sfx' };
      keys.push(key);
    });
    return keys;
  }
  function sfxKey(id, what) {
    var art = BA.guns[id], src = art && art.sfx && art.sfx[what];
    return src ? src.split('/').pop().replace(/\.mp3$/, '') : null;
  }

  function Gun(G, spec) {
    this.G = G; this.spec = spec; this.id = spec.id;
    this.art = BA.guns[spec.id];
    this.ammo = spec.ammo;
    this.cd = 0;
    this.shots = [];
    this.fired = 0; this.hits = 0;
    this.caught = 0;
    this.pull = 0;
    this.poseKind = 'Ready';
    this.rig = G.diver.arms.flip;   // HX_DEBUG đọc rig.visible
  }

  // Dave dựng lớp tay (d.arms); súng chỉ nói cầm ảnh nào, tư thế tay nào, giật lùi bao nhiêu.
  Gun.prototype.pose = function (kind) { this.poseKind = kind; };
  Gun.prototype.rigSpec = function () {
    var pull = this.poseKind === 'Pull';
    return { held: this.art.held, spear: false, kick: this.kick > 0 ? this.kick / this.spec.cooldown : 0,
      near: pull ? 'AttackPullArms' : null, behind: pull ? 'AttackPullRightArm' : null };
  };

  // Đầu nòng trong toạ độ thế giới với góc ngắm hiện tại.
  Gun.prototype.muzzle = function (d) {
    var mz = MUZZLE[this.id] || [15, 3], R = D.rig.gunHandler;
    return d.arms.world(d, [R[0] + mz[0] / D.ppu, R[1] + mz[1] / D.ppu], 'hold');
  };

  // Chạm: nhắm con cá sống gần nhất trong tầm súng, ưu tiên phía trước mặt. Không có thì bắn thẳng trước mặt.
  Gun.prototype.autoAim = function (d) {
    var best = null, bs = 1e9, R = Math.max(2.5, this.spec.range * 1.1);
    this.G.fishes.list.forEach(function (f) {
      if (!f.alive() || f.state === 'hooked' || f.state === 'sleep' && this.spec.mode === 'sleep') return;
      var c = f.center(), dx = c.x - d.pos.x, dy = c.y - d.pos.y, l = Math.hypot(dx, dy);
      if (l > R || this.G.world.raycast(d.pos.x, d.pos.y, c.x, c.y)) return;
      var score = l + (dx * d.facing < 0 ? 3 : 0);
      if (score < bs) { bs = score; best = c; }
    }, this);
    return best || { x: d.pos.x + d.facing * 3, y: d.pos.y + 0.2 };
  };

  Gun.prototype.aimStart = function () {
    var k = sfxKey(this.id, 'aim');
    if (k) this.G.audio.loop('gunaim', k, 0.5);
  };
  Gun.prototype.aimEnd = function () { this.G.audio.stopLoop('gunaim'); };

  // Bóp cò. Trả 'fired' | 'empty' | 'wait'.
  Gun.prototype.trigger = function (d) {
    var G = this.G, sp = this.spec;
    if (this.cd > 0) return 'wait';
    if (this.ammo <= 0) {
      G.audio.play(sfxKey(this.id, 'empty'));
      G.hud.toast('Hết đạn');
      this.emptyClicks = (this.emptyClicks || 0) + 1;
      return 'empty';
    }
    this.ammo--;
    this.fired++;
    this.cd = sp.cooldown;
    this.kick = sp.cooldown;
    var m = this.muzzle(d), a = d.aimAngle, t = d.gunTarget;
    // bắn từ đầu nòng thẳng tới điểm ngắm (tay xoay quanh vai nên trục nòng lệch điểm ngắm vài phân)
    if (t && (t.x - m.x) * Math.cos(a) + (t.y - m.y) * Math.sin(a) > 0.3) a = Math.atan2(t.y - m.y, t.x - m.x);
    G.audio.play(sfxKey(this.id, 'shot'), { vol: 0.8 });
    G.fx.play(VFX[this.art.muzzle], m.x, m.y, { angle: a, scale: S, z: 0.2, name: 'muzzle' });
    var n = Math.max(1, sp.pellets), spread = sp.spreadDeg * Math.PI / 180;
    for (var i = 0; i < n; i++) {
      var aa = n > 1 ? a + (i / (n - 1) - 0.5) * spread : a;
      this.spawn(m.x, m.y, aa);
    }
    // [DtD] RecoilForce: đẩy Dave lùi theo trục nòng
    d.vel.x += Math.cos(a) * sp.recoil; d.vel.y += Math.sin(a) * sp.recoil;
    G.shake(sp.mode === 'pierce' || sp.mode === 'grenade' ? 0.8 : 0.4);
    return 'fired';
  };

  Gun.prototype.spawn = function (x, y, a) {
    var G = this.G, P = this.art.projectile, sp = this.spec;
    var mesh = HX.gfx.sprite(G.gfx.tex(P.img.replace(/^art\//, '')), P.size[0] / P.ppu * BULLET_SCALE, P.size[1] / P.ppu * BULLET_SCALE,
      { alphaCut: 0.3, depthWrite: false, pivot: P.pivot });
    mesh.renderOrder = 5;
    mesh.position.set(x, y, 0.16);
    mesh.rotation.z = a;
    G.gfx.scene.add(mesh);
    var s = { x: x, y: y, vx: Math.cos(a) * sp.speed, vy: Math.sin(a) * sp.speed, traveled: 0, t: 0, mesh: mesh, hit: {}, alive: true };
    s.trail = P.trail ? G.fx.play(P.trail, x, y, { angle: a, z: 0.15, name: 'trail', follow: function () {
      return s.alive ? { x: s.x, y: s.y, angle: Math.atan2(s.vy, s.vx) } : null;
    } }) : null;
    this.shots.push(s);
  };

  Gun.prototype.kill = function (s) {
    s.alive = false;
    this.G.gfx.scene.remove(s.mesh);
    s.mesh.material.dispose();
  };

  Gun.prototype.update = function (dt) {
    this.cd = Math.max(0, this.cd - dt);
    this.kick = Math.max(0, (this.kick || 0) - dt);
    this.pull = Math.max(0, this.pull - dt);
    var G = this.G, sp = this.spec;
    for (var i = this.shots.length - 1; i >= 0; i--) {
      var s = this.shots[i];
      if (!s.alive) { this.shots.splice(i, 1); continue; }
      s.t += dt;
      if (sp.arc) s.vy -= M.GUN_PLAY.grenadeGravity * dt;
      var step = Math.hypot(s.vx, s.vy) * dt, n = Math.max(1, Math.ceil(step / 0.06));
      for (var k = 0; k < n && s.alive; k++) {
        var nx = s.x + s.vx * dt / n, ny = s.y + s.vy * dt / n;
        var wall = G.world.raycast(s.x, s.y, nx, ny);
        if (wall) { s.x = wall.x + wall.nx * 0.05; s.y = wall.y + wall.ny * 0.05; this.end(s, 'wall'); break; }
        s.traveled += Math.hypot(nx - s.x, ny - s.y);
        s.x = nx; s.y = ny;
        var list = G.fishes.list;
        for (var j = 0; j < list.length && s.alive; j++) {
          var f = list[j];
          if (!f.alive() || s.hit[f.id] || !f.hitTest(s.x, s.y, 0.05)) continue;
          s.hit[f.id] = 1;
          this.hitFish(s, f);
        }
        if (s.alive && (s.traveled >= sp.range || s.t > M.GUN_PLAY.fuse)) this.end(s, 'range');
      }
      if (s.alive) { s.mesh.position.set(s.x, s.y, 0.16); s.mesh.rotation.z = Math.atan2(s.vy, s.vx); }
    }
  };

  // Viên đạn trúng một con cá.
  Gun.prototype.hitFish = function (s, f) {
    var G = this.G, sp = this.spec, c = f.center();
    this.hits++;
    if (sp.mode === 'net') return this.openNet(s, s.x, s.y);
    if (sp.mode === 'grenade') return this.explode(s, s.x, s.y);
    G.audio.play(sfxKey(this.id, 'hit'), { vol: 0.8 });
    if (sp.mode === 'sleep') {
      G.fx.play(VFX.tranqBody, c.x, c.y, { z: f.z + 0.2, name: 'tranq' });
      if (f.sleep(sp.sleep)) {
        // chữ Z gắn vào đầu cá trong prefab gốc nên phóng theo độ phóng của loài (fish[].scale)
        G.fx.play(VFX[this.art.impact], c.x, c.y, { z: f.z + 0.25, scale: f.sp.scale || 1, name: 'sleep', follow: function () {
          if (f.state !== 'sleep' || !f.root.parent) return null;
          var q = f.center();
          return { x: q.x, y: q.y + f.hh * 0.6 };
        } });
      }
      return this.kill(s);
    }
    G.fx.play(VFX[this.art.impact], s.x, s.y, { z: f.z + 0.2, angle: Math.atan2(s.vy, s.vx), name: 'hit' });
    var res = f.damage(sp.dmg, s.x - s.vx * 0.05, s.y - s.vy * 0.05, false);
    if (res === 'dead') f.go('dying', { magnet: true });
    G.hitstop(0.04);
    if (!sp.pierce) this.kill(s);
  };

  // Viên đạn hết tầm hoặc chạm vách.
  Gun.prototype.end = function (s, why) {
    var sp = this.spec;
    if (sp.mode === 'net') return this.openNet(s, s.x, s.y);
    if (sp.mode === 'grenade') return this.explode(s, s.x, s.y);
    if (why === 'wall') this.G.fx.play(VFX.bulletBubble, s.x, s.y, { z: 0.18, angle: Math.atan2(s.vy, s.vx), name: 'wall' });
    this.kill(s);
  };

  // Lưới bung ra: bắt ngay mọi con cá cỡ ≤ CaptrueSize trong vòng lưới, tối đa CaptureCount con, không quá chỗ trống trong túi.
  Gun.prototype.openNet = function (s, x, y) {
    var G = this.G, sp = this.spec, R = M.GUN_PLAY.netRadius;
    this.kill(s);
    G.audio.play(sfxKey(this.id, 'hit'), { vol: 0.8 });
    G.fx.play(VFX[this.art.impact], x, y, { z: 0.2, name: 'net' });
    var inNet = G.fishes.list.filter(function (f) {
      if (!f.alive() || f.state === 'hooked') return false;
      var c = f.center();
      return Math.hypot(c.x - x, c.y - y) <= R + f.radius;
    });
    inNet.sort(function (a, b) { var p = a.center(), q = b.center(); return Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y); });
    var got = 0, full = false, torn = false;
    for (var i = 0; i < inNet.length && got < sp.netCount; i++) {
      var f = inNet[i];
      // [DtD] cá to hơn CaptrueSize làm rách lưới (FishSizeType gốc của mọi loài trong game này chỉ tới 2)
      if (f.sp.size > sp.netSize) { torn = true; continue; }
      if (G.catches.length >= G.loadout.cargo) { full = true; break; }
      G.catchFish(f);
      got++;
    }
    if (torn) G.fx.play(VFX.netRip, x, y, { z: 0.2, name: 'netRip' });
    if (got) { G.audio.play(sfxKey(this.id, 'collect')); this.pull = 0.5; this.caught += got; }
    if (full) G.hud.toast('Túi đầy · lưới không kéo thêm được');
  };

  // Đạn lựu nổ: mọi con trong bán kính ExposionRadius ăn ExplosionSplashDamage.
  Gun.prototype.explode = function (s, x, y) {
    var G = this.G, sp = this.spec;
    this.kill(s);
    G.audio.play(sfxKey(this.id, 'hit'));
    G.fx.play(VFX[this.art.impact], x, y, { z: 0.25, name: 'explosion' });
    G.shake(2);
    G.hitstop(0.05);
    G.fishes.list.slice().forEach(function (f) {
      if (!f.alive()) return;
      var c = f.center();
      if (Math.hypot(c.x - x, c.y - y) > sp.blast + f.radius) return;
      if (f.state === 'hooked') return;
      var res = f.damage(sp.dmg, x, y, false);
      if (res === 'dead') f.go('dying', { magnet: true });
    });
  };

  Gun.prototype.remove = function () {
    var G = this.G;
    this.aimEnd();
    this.shots.forEach(function (s) { if (s.alive) this.kill(s); }, this);
    this.shots.length = 0;
  };

  // Ảnh của mọi công thức hiệu ứng mà khẩu này dùng.
  function recipesOf(id) {
    var art = BA && BA.guns && BA.guns[id];
    if (!art) return [];
    var r = [VFX[art.muzzle], VFX[art.impact], VFX.bulletBubble, art.projectile && art.projectile.trail];
    if (id === 'sleep') r.push(VFX.tranqBody);
    if (id === 'net') r.push(VFX.netRip);
    return r.filter(Boolean);
  }
  function images(id) {
    var art = BA.guns[id];
    return [art.held.img, art.projectile.img].map(function (s) { return s.replace(/^art\//, ''); });
  }

  HX.Gun = Gun;
  HX.gun = { soundKeys: soundKeys, recipesOf: recipesOf, images: images, MUZZLE: MUZZLE };
})(window.HX = window.HX || {});
