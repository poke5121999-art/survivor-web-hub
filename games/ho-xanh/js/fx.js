// Hạt hiệu ứng: bọt khí, tia lửa, máu, loé trúng. Mỗi kiểu hạt là một dòng trong bảng KINDS.
(function (HX) {
  'use strict';

  var KINDS = {
    bubble:     { tex: 'fx/BubbleSubtle.png', size: [0.05, 0.11], life: [1.4, 2.4], rise: 1.1, drag: 1.5, wobble: 0.5, alpha: 0.9, fade: 0.25 },
    bubbleBig:  { tex: 'fx/E_Bubble_01A.png', smooth: true, additive: true, size: [0.08, 0.16], life: [1.2, 2], rise: 1.3, drag: 1.2, wobble: 0.4, alpha: 0.8, fade: 0.3 },
    bubbleSeq:  { tex: 'fx/E_Seq_Bubble_01A.png', smooth: true, grid: [5, 2, 10], fps: 10, size: [0.16, 0.24], life: [1.0, 1.0], rise: 0.9, drag: 1, alpha: 0.9, fade: 0.2 },
    puff:       { tex: 'fx/E_Seq_Bubble_02A.png', smooth: true, grid: [5, 5, 25], fps: 30, size: [0.7, 1.0], life: [0.83, 0.83], rise: 0.4, drag: 3, alpha: 0.85, fade: 0.2 },
    column:     { tex: 'fx/E_Seq_Bubble_03A.png', smooth: true, grid: [5, 5, 25], fps: 24, size: [0.45, 0.6], life: [1.04, 1.04], rise: 0.6, drag: 2, alpha: 0.8, fade: 0.2 },
    spark:      { tex: 'fx/E_Seq_Spark_01A.png', smooth: true, grid: [3, 2, 6], fps: 24, size: [0.55, 0.7], life: [0.25, 0.25], additive: true, alpha: 1, fade: 0.1, aspect: 1.5 },
    hit:        { tex: 'fx/E_Hit_D_01A.png', smooth: true, size: [0.8, 1.0], sizeEnd: 1.25, life: [0.18, 0.18], additive: true, alpha: 1, fade: 0.6, spinRand: true },
    glow:       { tex: 'fx/E_Glow_01A.png', smooth: true, size: [0.7, 0.9], sizeEnd: 1.4, life: [0.25, 0.3], additive: true, alpha: 0.9, fade: 0.8 },
    blood:      { tex: 'fx/BloodCloud.png', smooth: true, size: [0.35, 0.55], sizeEnd: 2.3, life: [1.3, 1.8], tint: 0xff2a3a, rise: 0.12, drag: 2.5, alpha: 0.8, fade: 0.7, spinRand: true },
    dust:       { tex: 'fx/E_Dust_01A.png', smooth: true, size: [0.5, 0.8], sizeEnd: 1.6, life: [0.6, 0.9], additive: true, alpha: 0.35, fade: 0.8 },
  };

  function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }

  function Fx(gfx) {
    this.gfx = gfx;
    this.live = [];
    this.pool = {};
    this.group = new THREE.Group();
    gfx.scene.add(this.group);
  }

  Fx.prototype.preload = function () {
    var g = this.gfx;
    return Promise.all(Object.keys(KINDS).map(function (k) { return g.loadTex(KINDS[k].tex, KINDS[k].smooth); }));
  };

  Fx.prototype.spawn = function (kind, x, y, z, vx, vy, scaleMul) {
    var K = KINDS[kind];
    var pool = this.pool[kind] || (this.pool[kind] = []);
    var m = pool.pop();
    if (!m) {
      m = HX.gfx.sprite(this.gfx.tex(K.tex, K.smooth), 1, 1, { additive: K.additive, alphaCut: 0.01, tint: K.tint });
      m.renderOrder = K.additive ? 5 : 3;
      m.userData.kind = kind;
    }
    var s = rand(K.size) * (scaleMul || 1);
    var p = m.userData;
    p.t = 0; p.life = rand(K.life); p.s0 = s; p.s1 = s * (K.sizeEnd || 1);
    p.vx = vx || 0; p.vy = vy || 0; p.ph = Math.random() * 6.28;
    m.position.set(x, y, z || 0.05);
    m.rotation.z = K.spinRand ? Math.random() * 6.28 : 0;
    this.frame(m, K, 0);
    this.group.add(m);
    this.live.push(m);
    return m;
  };

  Fx.prototype.frame = function (m, K, t) {
    var u = m.material.uniforms.uvRect.value;
    if (K.grid) {
      var f = Math.min(K.grid[2] - 1, Math.floor(t * K.fps)), c = K.grid[0], r = K.grid[1];
      u.set((f % c) / c, 1 - (Math.floor(f / c) + 1) / r, 1 / c, 1 / r);
    } else u.set(0, 0, 1, 1);
  };

  Fx.prototype.update = function (dt) {
    for (var i = this.live.length - 1; i >= 0; i--) {
      var m = this.live[i], p = m.userData, K = KINDS[p.kind];
      p.t += dt;
      var k = p.t / p.life;
      if (k >= 1) {
        this.group.remove(m);
        this.live.splice(i, 1);
        this.pool[p.kind].push(m);
        continue;
      }
      var drag = Math.exp(-(K.drag || 0) * dt);
      p.vx *= drag; p.vy = p.vy * drag + (K.rise || 0) * dt;
      m.position.x += (p.vx + (K.wobble ? Math.sin(p.t * 7 + p.ph) * K.wobble : 0)) * dt;
      m.position.y += p.vy * dt;
      var s = p.s0 + (p.s1 - p.s0) * k;
      m.scale.set(s * (K.aspect ? 1 / K.aspect : 1), s, 1);
      var a = K.alpha * (k > 1 - K.fade ? (1 - k) / K.fade : 1);
      m.material.uniforms.opacity.value = a;
      this.frame(m, K, p.t);
    }
  };

  Fx.prototype.clear = function () {
    for (var i = 0; i < this.live.length; i++) {
      var m = this.live[i];
      this.group.remove(m);
      this.pool[m.userData.kind].push(m);
    }
    this.live.length = 0;
  };

  Fx.prototype.burst = function (kind, x, y, n, speed, z) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      this.spawn(kind, x + (Math.random() - 0.5) * 0.1, y + (Math.random() - 0.5) * 0.1, z, Math.cos(a) * v, Math.sin(a) * v);
    }
  };

  HX.Fx = Fx;
  HX.FX_KINDS = KINDS;
})(window.HX = window.HX || {});
