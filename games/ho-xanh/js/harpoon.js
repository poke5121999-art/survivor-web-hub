// Mũi xiên: ready → flying → (stuck | returning) → ready. Dây nối từ nòng súng tới đuôi mũi xiên.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, H = T.harpoon;
  var ROPE_PTS = 14;

  function Harpoon(G) {
    this.G = G;
    this.state = 'ready';
    this.x = 0; this.y = 0; this.angle = 0; this.dx = 1; this.dy = 0;
    this.traveled = 0; this.fish = null; this.off = null;
    // mũi xiên phóng cùng tỉ lệ với thân Dave (PlayerGroup gốc: HarpoonProjectile ×2)
    var k = window.HX_ASSETS.dave.scale || 1;
    this.mesh = HX.gfx.sprite(G.gfx.tex('fx/HarpoonProjectile.png'), 0.33 * k, 0.05 * k, { alphaCut: 0.5, depthWrite: true, pivot: [1, 0.5] });
    this.mesh.visible = false;
    G.gfx.scene.add(this.mesh);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_PTS * 3), 3));
    this.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd9e4e6, transparent: true, opacity: 0.85 }));
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
    G.audio.play('harpoon_shot');
    G.fx.spawn('bubbleSeq', x, y, 0.15, this.dx * 0.5, this.dy * 0.5, 0.7);
    for (var i = 0; i < 4; i++) G.fx.spawn('bubble', x, y, 0.15, this.dx * (1 + i), this.dy * (1 + i));
  };

  Harpoon.prototype.hitFish = function (f) {
    var G = this.G;
    var res = f.damage(H.damage, this.x - this.dx, this.y - this.dy, true);
    G.audio.play('harpoon_hit');
    G.fx.spawn('hit', this.x, this.y, f.z + 0.12, 0, 0, 0.55);
    G.fx.spawn('spark', this.x, this.y, f.z + 0.13, 0, 0, 0.6);
    G.hitstop(0.06);
    G.shake(0.35);
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
    this.G.fx.spawn('blood', f.pos.x, f.pos.y, f.z + 0.05, 0, 0, 1.2);
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
        if (this.state === 'flying' && this.traveled >= H.range) this.state = 'returning';
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
      if (rl < 0.3) { this.state = 'ready'; G.audio.play('harpoon_return', { vol: 0.6 }); }
    }
    this.draw(tip);
  };

  Harpoon.prototype.draw = function (tip) {
    var on = this.state !== 'ready';
    this.mesh.visible = on && this.state !== 'stuck';
    this.rope.visible = on;
    if (!on) return;
    this.mesh.position.set(this.x, this.y, 0.12);
    this.mesh.rotation.z = this.angle;
    var p = this.rope.geometry.attributes.position.array;
    var ex = this.x - Math.cos(this.angle) * 0.3, ey = this.y - Math.sin(this.angle) * 0.3;
    if (this.state === 'stuck') { ex = this.x; ey = this.y; }
    var len = Math.hypot(ex - tip.x, ey - tip.y);
    var sag = this.state === 'returning' ? Math.min(0.5, len * 0.12) : this.state === 'stuck' && this.G.diver.state === 'reel' ? 0.03 : 0;
    for (var i = 0; i < ROPE_PTS; i++) {
      var t = i / (ROPE_PTS - 1);
      p[i * 3] = tip.x + (ex - tip.x) * t;
      p[i * 3 + 1] = tip.y + (ey - tip.y) * t - Math.sin(t * Math.PI) * sag;
      p[i * 3 + 2] = 0.11;
    }
    this.rope.geometry.attributes.position.needsUpdate = true;
  };

  Harpoon.prototype.remove = function () {
    this.G.gfx.scene.remove(this.mesh);
    this.G.gfx.scene.remove(this.rope);
  };

  HX.Harpoon = Harpoon;
})(window.HX = window.HX || {});
