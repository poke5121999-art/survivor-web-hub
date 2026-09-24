// Súng phụ trong lượt lặn: một khẩu đang chọn (G.loadout.gun), đạn theo lượt, đạn bay, trúng cá, hiệu ứng và tiếng gốc.
// Hình súng cầm tay, đạn, tia lửa nòng, vệt bọt, trúng, nổ, lưới, ngủ: đều lấy từ data/boat_assets.js (bóc từ bản gốc).
// Tư thế: thân AttackReady / AttackFire / AttackPull + lớp tay AttackReadyArms, AttackReadyRightArm (art/gear/arms), súng nằm trong tay.
(function (HX) {
  'use strict';
  var M = window.HX_META, BA = window.HX_BOAT_ASSETS, D = window.HX_ASSETS.dave;
  var S = D.scale || 1, CW = D.cell / D.ppu * S;
  var VFX = BA ? BA.gunVfx : {};

  // Sheet Dave (art/dave/dave.png) đặt mỗi khung đã cắt viền vào GIỮA ô 120 px, nên lớp tay trong sheet lệch khỏi thân.
  // [ĐO TRONG REPO, m_RD.textureRectOffset của sprite gốc] đặt lại đúng chỗ, tính theo ô sheet của thân AttackReady (px, y xuống):
  //   khung gốc 120 px (ảnh art/gear/arms/*.png) nằm lệch (+6; −5) so với ô sheet của AttackReady;
  //   AttackFire01 lệch (+6; +1), AttackPull01 (+11; −1); AttackPullArms (+5; −13), AttackPullRightArm (+10; −13) so với ô sheet của chính nó.
  var CANON = [6, -5];
  var SHEET_SHIFT = { AttackPullArms: [5, -13], AttackPullRightArm: [10, -13] };
  // Khớp vai gần = pivot của AttackReadyArms trong khung gốc (51,5; 51,7) → trong ô sheet của thân (57,5; 46,7).
  var SHOULDER = [0.429 * 120 + CANON[0], (1 - 0.569) * 120 + CANON[1]];
  // [ĐO TRONG REPO] tâm ảnh súng cầm tay đặt ở (65; 55) của khung gốc: báng trong găng tay gần (x 62–69),
  // nòng ngang ngón tay xa (y 51–54). Đầu nòng so với tâm ảnh súng (px, y lên), đo trên art/gear/gun/*.png.
  var HAND = [65, 55];
  var MUZZLE = { rifle: [15, 2.5], shotgun: [16, 3], sniper: [19, 3.5], sleep: [9, 2.5], net: [17, 4], grenade: [14, 4] };
  var PX = S / D.ppu;
  // điểm (x, y) px của khung gốc → mét, gốc ở khớp vai, y lên
  function canon(x, y) { return [(x + CANON[0] - SHOULDER[0]) * PX, -(y + CANON[1] - SHOULDER[1]) * PX]; }
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

  // Góc của tay (−π/2..π/2) khi Dave quay phải; quay trái thì lật gương.
  function localAngle(a) { return Math.atan2(Math.sin(a), Math.abs(Math.cos(a))); }

  function Gun(G, spec) {
    this.G = G; this.spec = spec; this.id = spec.id;
    this.art = BA.guns[spec.id];
    this.ammo = spec.ammo;
    this.cd = 0;
    this.shots = [];
    this.fired = 0; this.hits = 0;
    this.caught = 0;
    this.pull = 0;
    this.buildRig();
  }

  // Lớp tay + súng gắn vào Dave, xoay cứng quanh khớp vai gần. Tay xa sau thân, súng trước thân, tay gần (có ngón tay xa) phủ lên súng.
  Gun.prototype.buildRig = function () {
    var G = this.G, d = G.diver, sheet = G.gfx.tex(D.sheet), arms = BA.arms;
    this.rig = new THREE.Group();
    var mk = function (tex, z) { var m = HX.gfx.sprite(tex, CW, CW, { alphaCut: 0.5, depthWrite: true }); m.position.z = z; return m; };
    var c = canon(60, 60);
    this.nearR = mk(G.gfx.tex(arms.AttackReadyArms.img.replace(/^art\//, '')), 0.02);
    this.farR = mk(G.gfx.tex(arms.AttackReadyRightArm.img.replace(/^art\//, '')), -0.012);
    this.nearR.position.x = this.farR.position.x = c[0]; this.nearR.position.y = this.farR.position.y = c[1];
    this.nearP = mk(sheet, 0.02); this.farP = mk(sheet, -0.012);
    HX.Diver.setFrame(this.nearP, 'AttackPullArms', 0); HX.Diver.setFrame(this.farP, 'AttackPullRightArm', 0);
    [[this.nearP, 'AttackPullArms'], [this.farP, 'AttackPullRightArm']].forEach(function (p) {
      var sh = SHEET_SHIFT[p[1]], q = canon(60 + sh[0] - CANON[0], 60 + sh[1] - CANON[1]);
      p[0].position.x = q[0]; p[0].position.y = q[1];
    });
    var h = this.art.held;
    this.held = HX.gfx.sprite(G.gfx.tex(h.img.replace(/^art\//, '')), h.size[0] / h.ppu * S, h.size[1] / h.ppu * S, { alphaCut: 0.5, depthWrite: true, pivot: h.pivot });
    this.gunAt = canon(HAND[0], HAND[1]);
    this.held.position.set(this.gunAt[0], this.gunAt[1], 0.01);
    [this.farR, this.farP, this.held, this.nearR, this.nearP].forEach(function (m) { this.rig.add(m); }, this);
    this.rig.visible = false;
    d.root.add(this.rig);
    this.pose('Ready');
  };

  Gun.prototype.pose = function (kind) {
    if (this.poseKind === kind) return;
    this.poseKind = kind;
    var pull = kind === 'Pull';
    this.nearR.visible = this.farR.visible = !pull;
    this.nearP.visible = this.farP.visible = pull;
  };

  // Gọi từ Diver.draw mỗi khung.
  Gun.prototype.drawRig = function (d, on) {
    this.rig.visible = on;
    if (!on) return;
    var f = d.facing, ap = this.armOff();
    this.rig.position.set(ap[0] * f, ap[1], 0);
    this.rig.scale.x = f;
    this.rig.rotation.z = f > 0 ? localAngle(d.aimAngle) : -localAngle(d.aimAngle);
    // giật lùi: súng lùi theo trục nòng rồi về chỗ
    var k = this.kick > 0 ? this.kick / this.spec.cooldown : 0;
    this.held.position.x = this.gunAt[0] - 2 * PX * k;
    var fl = d.body.material.uniforms.flash.value;
    [this.nearR, this.farR, this.nearP, this.farP, this.held].forEach(function (m) { m.material.uniforms.flash.value = fl; });
  };

  // Khớp vai (tâm xoay của lớp tay) so với tâm thân Dave (tâm ô sheet), khi quay phải.
  Gun.prototype.armOff = function () { return [(SHOULDER[0] - 60) * PX, -(SHOULDER[1] - 60) * PX]; };

  // Đầu nòng trong toạ độ thế giới với góc ngắm hiện tại.
  Gun.prototype.muzzle = function (d) {
    var f = d.facing, ap = this.armOff(), mz = MUZZLE[this.id] || [15, 3];
    var lx = this.gunAt[0] + mz[0] * PX, ly = this.gunAt[1] + mz[1] * PX;
    var la = localAngle(d.aimAngle), c = Math.cos(la), s = Math.sin(la);
    var rx = lx * c - ly * s, ry = lx * s + ly * c;
    return { x: d.pos.x + (ap[0] + rx) * f, y: d.pos.y + ap[1] + ry };
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
    if (this.rig.parent) this.rig.parent.remove(this.rig);
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
  HX.gun = { soundKeys: soundKeys, recipesOf: recipesOf, images: images, MUZZLE: MUZZLE, HAND: HAND };
})(window.HX = window.HX || {});
