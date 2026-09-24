// Mũi xiên: ready → flying → (stuck | returning) → ready. Dây nối từ RopeAttachRigidbody trên tay Dave tới đuôi mũi xiên.
// Lúc ready mũi xiên nằm trong súng xiên Dave cầm (vẽ trong lớp tay của js/dave.js), không vẽ ở đây.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, H = T.harpoon, D = window.HX_ASSETS.dave;
  var ROPE_PTS = 14;
  // Mũi xiên NormalHarpoonHead gốc: 33×5 px, pivot ở đuôi, dưới HarpoonProjectile phóng ×2 (D.scale).
  var K = D.scale || 1, LEN = D.spear.size[0] / D.spear.ppu * K, WID = D.spear.size[1] / D.spear.ppu * K;
  // Dây gốc: LineRenderer rộng 0,02 m, HarpoonRopeMaterial màu đen (D.rope).
  var ROPE = D.rope || { width: 0.02, color: [0, 0, 0, 1] };

  function Harpoon(G) {
    this.G = G;
    this.state = 'ready';
    this.x = 0; this.y = 0; this.angle = 0; this.dx = 1; this.dy = 0;
    this.traveled = 0; this.fish = null; this.off = null;
    // x, y là đầu mũi xiên; ảnh vẽ lùi về sau một chiều dài mũi
    this.mesh = HX.gfx.sprite(G.gfx.tex('fx/HarpoonProjectile.png'), LEN, WID, { alphaCut: 0.5, depthWrite: true, pivot: [1, 0.5] });
    this.mesh.visible = false;
    G.gfx.scene.add(this.mesh);
    // dây là dải tam giác bề ngang ROPE.width (THREE.Line chỉ vẽ được 1 px)
    var geo = new THREE.BufferGeometry(), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_PTS * 2 * 3), 3));
    for (var i = 0; i < ROPE_PTS - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    var c = ROPE.color;
    this.rope = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), transparent: c[3] < 1, opacity: c[3], side: THREE.DoubleSide }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    G.gfx.scene.add(this.rope);
  }

  Harpoon.prototype.fire = function (x, y, angle) {
    var G = this.G;
    this.state = 'flying';
    this.x = x; this.y = y; this.angle = angle;
    this.dx = Math.cos(angle); this.dy = Math.sin(angle);
    this.traveled = 0;
    this.missed = false;
    G.audio.play('harpoon_shot');
    // SpearBubble gốc gắn trên HarpoonProjectile (phóng ×2): vệt bọt theo đuôi mũi xiên khi bay
    var self = this;
    if (this.trail) this.trail.stop();
    this.trail = G.fx.play(G.fx.dive('spearBubble'), x - this.dx * LEN, y - this.dy * LEN, { scale: K, z: 0.13, name: 'spear',
      angle: angle, follow: function () {
        return self.state === 'flying' ? { x: self.x - self.dx * LEN, y: self.y - self.dy * LEN, angle: self.angle } : null;
      } });
    // cá đang nằm ngay trên thân mũi xiên lúc bắn (gần hơn đầu mũi) cũng trúng, như collider của mũi xiên gốc
    var fishes = G.fishes.list;
    for (var k = 0; k <= 6 && this.state === 'flying'; k++) {
      var px = x - this.dx * LEN * (1 - k / 6), py = y - this.dy * LEN * (1 - k / 6);
      for (var j = 0; j < fishes.length; j++) {
        if (fishes[j].alive() && fishes[j].hitTest(px, py, 0.04)) { this.x = px; this.y = py; this.hitFish(fishes[j]); break; }
      }
    }
  };

  Harpoon.prototype.hitFish = function (f) {
    var G = this.G;
    var res = f.damage(G.loadout.harpoon, this.x - this.dx, this.y - this.dy, true);
    G.audio.play('harpoon_hit');
    // BloodHit.prefab gốc (bọt, máu, tia loé); mũi xiên hạ luôn con cá thì thêm BloodFatal
    G.fx.play(G.fx.dive('bloodHit'), this.x, this.y, { z: f.z + 0.12, angle: this.angle, name: 'bloodHit' });
    if (res === 'dead') G.fx.play(G.fx.dive('bloodFatal'), this.x, this.y, { z: f.z + 0.1, name: 'bloodFatal' });
    G.hitstop(0.06);
    G.shake(0.35);
    this.missed = false;
    if (res === 'alive') { this.state = 'returning'; return; }
    this.state = 'stuck';
    this.fish = f;
    this.off = { x: (this.x - f.pos.x) * f.facing, y: this.y - f.pos.y };
    if (res === 'dead') { f.go('dying'); G.diver.go('reel'); }
    else { f.go('hooked'); G.diver.go('tug'); }
  };

  Harpoon.prototype.killHooked = function () {
    var f = this.fish;
    if (!f) return;
    f.hp = 0;
    f.flashT = 0.15;
    f.go('dying');
    this.G.fx.play(this.G.fx.dive('bloodFatal'), this.x, this.y, { z: f.z + 0.1, name: 'bloodFatal' });
  };

  Harpoon.prototype.breakFree = function () {
    var f = this.fish;
    this.fish = null;
    this.state = 'returning';
    if (!f || !f.alive()) return;
    if (f.sp.damage > 0) { f.angry = T.fish.angryTime; f.go('chase'); }
    else f.go('flee', { fromX: this.G.diver.pos.x, fromY: this.G.diver.pos.y });
  };

  Harpoon.prototype.drop = function () {
    if (this.fish && this.fish.state === 'hooked') this.breakFree();
    else if (this.state !== 'ready') { this.fish = null; this.state = 'returning'; }
  };

  Harpoon.prototype.update = function (dt) {
    var G = this.G, d = G.diver, tip = d.gunTip();
    if (this.state === 'flying') {
      var step = H.speed * dt, n = Math.max(1, Math.ceil(step / 0.08));
      for (var i = 0; i < n && this.state === 'flying'; i++) {
        var s = step / n, nx = this.x + this.dx * s, ny = this.y + this.dy * s;
        var wall = G.world.raycast(this.x, this.y, nx, ny);
        if (wall) {
          this.x = wall.x; this.y = wall.y;
          this.state = 'returning';
          this.missed = true;
          G.audio.play('harpoon_hit_rock');
          G.fx.spawn('spark', wall.x, wall.y, 0.2, 0, 0, 0.5);
          G.fx.spawn('dust', wall.x + wall.nx * 0.1, wall.y + wall.ny * 0.1, 0.2, wall.nx * 0.3, wall.ny * 0.3);
          break;
        }
        this.x = nx; this.y = ny; this.traveled += s;
        var fishes = G.fishes.list;
        for (var k = 0; k < fishes.length; k++) {
          var f = fishes[k];
          if (f.alive() && f.hitTest(this.x, this.y, 0.04)) { this.hitFish(f); break; }
        }
        if (this.state === 'flying' && this.traveled >= H.range) { this.state = 'returning'; this.missed = true; }
      }
    } else if (this.state === 'stuck') {
      var f2 = this.fish;
      if (!f2) { this.state = 'returning'; }
      else {
        if (d.state === 'reel') {
          var dx = tip.x - f2.pos.x, dy = tip.y - f2.pos.y, l = Math.hypot(dx, dy) || 1;
          var mv = Math.min(l, H.reelSpeed * dt);
          f2.pos.x += dx / l * mv; f2.pos.y += dy / l * mv;
          if (l < 0.35) {
            this.fish = null;
            this.state = 'ready';
            G.catchFish(f2);
          }
        }
        this.x = f2.pos.x + this.off.x * f2.facing; this.y = f2.pos.y + this.off.y;
        this.angle = Math.atan2(this.y - tip.y, this.x - tip.x);
      }
    } else if (this.state === 'returning') {
      var rx = tip.x - this.x, ry = tip.y - this.y, rl = Math.hypot(rx, ry) || 1;
      var mv2 = Math.min(rl, H.returnSpeed * dt);
      this.x += rx / rl * mv2; this.y += ry / rl * mv2;
      this.angle = Math.atan2(-ry, -rx);
      if (rl < 0.3) { this.state = 'ready'; this.missed = false; G.audio.play('harpoon_return', { vol: 0.6 }); }
    }
    this.draw(d.ropeFrom());
  };

  // from: đầu dây trên tay Dave.
  Harpoon.prototype.draw = function (from) {
    var on = this.state !== 'ready';
    this.mesh.visible = on && this.state !== 'stuck';
    this.rope.visible = on;
    if (!on) return;
    this.mesh.position.set(this.x, this.y, 0.12);
    this.mesh.rotation.z = this.angle;
    var p = this.rope.geometry.attributes.position.array, tip = from;
    // dây buộc vào đuôi mũi xiên; mũi đã cắm vào cá thì buộc ở chỗ cắm
    var ex = this.x - Math.cos(this.angle) * LEN, ey = this.y - Math.sin(this.angle) * LEN;
    if (this.state === 'stuck') { ex = this.x; ey = this.y; }
    var len = Math.hypot(ex - tip.x, ey - tip.y);
    var sag = this.state === 'returning' ? Math.min(0.5, len * 0.12) : this.state === 'stuck' && this.G.diver.state === 'reel' ? 0.03 : 0;
    var nx = -(ey - tip.y) / (len || 1) * ROPE.width / 2, ny = (ex - tip.x) / (len || 1) * ROPE.width / 2;
    for (var i = 0; i < ROPE_PTS; i++) {
      var t = i / (ROPE_PTS - 1), x = tip.x + (ex - tip.x) * t, y = tip.y + (ey - tip.y) * t - Math.sin(t * Math.PI) * sag;
      p[i * 6] = x - nx; p[i * 6 + 1] = y - ny; p[i * 6 + 2] = 0.11;
      p[i * 6 + 3] = x + nx; p[i * 6 + 4] = y + ny; p[i * 6 + 5] = 0.11;
    }
    this.rope.geometry.attributes.position.needsUpdate = true;
  };

  Harpoon.prototype.remove = function () {
    this.G.gfx.scene.remove(this.mesh);
    this.G.gfx.scene.remove(this.rope);
  };

  HX.Harpoon = Harpoon;
})(window.HX = window.HX || {});
