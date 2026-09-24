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

  // ---------- công thức ParticleSystem gốc (data/boat_assets.js: gunVfx, guns.*.projectile.trail) ----------
  // Số trong công thức: một số = hằng; [a, b] = ngẫu nhiên giữa hai hằng; {curve, mul} = đường cong [[t, v]] × mul;
  // {min, max, mul} = ngẫu nhiên giữa hai đường cong. Toạ độ Unity: x phải, y lên, z vào màn hình; ở đây chỉ vẽ mặt x-y.
  // Emitter có `subEmitters: n` thì n emitter liền sau là emitter con, chạy theo từng hạt của nó (vệt bọt sau tia lửa).
  function curveAt(c, t) {
    if (t <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) if (t <= c[i][0]) {
      var a = c[i - 1], b = c[i], k = (t - a[0]) / ((b[0] - a[0]) || 1);
      return a[1] + (b[1] - a[1]) * k;
    }
    return c[c.length - 1][1];
  }
  // t: thời gian chuẩn hoá 0..1; r: số ngẫu nhiên cố định của hạt.
  function num(v, t, r) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return v[0] + (v[1] - v[0]) * r;
    if (v.curve) return curveAt(v.curve, t) * (v.mul == null ? 1 : v.mul);
    if (v.min && v.max) { var a = curveAt(v.min, t), b = curveAt(v.max, t); return (a + (b - a) * r) * (v.mul == null ? 1 : v.mul); }
    return 0;
  }
  function gradAt(g, t, out) {
    var c = g.color, a = g.alpha, i;
    if (t <= c[0][0]) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; }
    else {
      out[0] = c[c.length - 1][1]; out[1] = c[c.length - 1][2]; out[2] = c[c.length - 1][3];
      for (i = 1; i < c.length; i++) if (t <= c[i][0]) {
        var k = (t - c[i - 1][0]) / ((c[i][0] - c[i - 1][0]) || 1);
        out[0] = c[i - 1][1] + (c[i][1] - c[i - 1][1]) * k; out[1] = c[i - 1][2] + (c[i][2] - c[i - 1][2]) * k; out[2] = c[i - 1][3] + (c[i][3] - c[i - 1][3]) * k;
        break;
      }
    }
    out[3] = curveAt(a, t);
    return out;
  }
  // Euler gốc của Unity (độ, thứ tự Z → X → Y) xoay một véc-tơ.
  function euler(rot, v) {
    if (!rot || (!rot[0] && !rot[1] && !rot[2])) return v;
    var d = Math.PI / 180, x = v[0], y = v[1], z = v[2], c, s, t;
    if (rot[2]) { c = Math.cos(rot[2] * d); s = Math.sin(rot[2] * d); t = x * c - y * s; y = x * s + y * c; x = t; }
    if (rot[0]) { c = Math.cos(rot[0] * d); s = Math.sin(rot[0] * d); t = y * c - z * s; z = y * s + z * c; y = t; }
    if (rot[1]) { c = Math.cos(rot[1] * d); s = Math.sin(rot[1] * d); t = x * c + z * s; z = -x * s + z * c; x = t; }
    v[0] = x; v[1] = y; v[2] = z;
    return v;
  }
  function randDir() {
    var z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  }
  // Điểm sinh và hướng bay theo module Shape. Trả [px, py, pz, dx, dy, dz] ở hệ của emitter (chưa nhân scale).
  function shapeSample(sh) {
    var p = [0, 0, 0], d = [0, 0, 1], k, a;
    if (!sh) return p.concat(d);
    var R = sh.radius || 0, th = sh.thickness == null ? 1 : sh.thickness, arc = (sh.arc == null ? 360 : sh.arc) * Math.PI / 180;
    var rr = R * (1 - th * (1 - Math.cbrt(Math.random())));
    switch (sh.type) {
      case 'sphere': case 'hemisphere': case 'meshRenderer':
        d = randDir();
        if (sh.type === 'hemisphere') d[2] = Math.abs(d[2]);
        if (arc < 6.28) { a = Math.random() * arc; k = Math.hypot(d[0], d[1]); d[0] = Math.cos(a) * k; d[1] = Math.sin(a) * k; }
        p = [d[0] * rr, d[1] * rr, d[2] * rr];
        break;
      case 'circle':
        a = Math.random() * arc;
        d = [Math.cos(a), Math.sin(a), 0];
        k = R * (1 - th * (1 - Math.sqrt(Math.random())));
        p = [d[0] * k, d[1] * k, 0];
        break;
      case 'cone':
        a = Math.random() * arc;
        k = Math.sqrt(Math.random());
        var ang = (sh.angle || 0) * Math.PI / 180 * k;
        p = [Math.cos(a) * R * k, Math.sin(a) * R * k, 0];
        d = [Math.cos(a) * Math.sin(ang), Math.sin(a) * Math.sin(ang), Math.cos(ang)];
        break;
      case 'box':
        p = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
        d = [0, 0, 1];
        break;
    }
    var sc = sh.scale || [1, 1, 1];
    p[0] *= sc[0]; p[1] *= sc[1]; p[2] *= sc[2];
    euler(sh.rot, p); euler(sh.rot, d);
    if (sh.pos) { p[0] += sh.pos[0]; p[1] += sh.pos[1]; p[2] += sh.pos[2]; }
    return p.concat(d);
  }
  function isAdditive(e) {
    var s = e.shader || '';
    return /Add/.test(s) && !/Alpha/.test(s) || /Particles\/Additive/.test(s);
  }
  function burstCount(c) { return Math.round(num(c, 0, Math.random())); }

  // Lô vẽ: mọi hạt cùng ảnh, cùng kiểu trộn gom vào một lưới động.
  var BATCH_VERT = [
    'attribute vec4 color; varying vec2 vUv; varying vec4 vC; varying float vD;',
    'void main() { vUv = uv; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  function batchFrag(add) {
    return HX.gfx.WATER_GLSL + '\nuniform sampler2D map; varying vec2 vUv; varying vec4 vC; varying float vD;\n' +
      'void main() { vec4 c = texture2D(map, vUv) * vC; if (c.a < 0.004) discard;' +
      (add ? ' gl_FragColor = vec4(c.rgb * c.a * (1.0 - hxFog(vD)), 1.0); }' : ' gl_FragColor = vec4(hxFogMix(c.rgb, vD), c.a); }');
  }
  function Batch(fx, img, add) {
    this.cap = 0; this.n = 0;
    var u = { map: { value: fx.gfx.tex(img, true) } }, w = HX.gfx.water;
    for (var k in w) u[k] = w[k];
    this.mat = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: BATCH_VERT, fragmentShader: batchFrag(add), transparent: true, depthWrite: false, depthTest: true,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    });
    this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = add ? 7 : 6;
    this.grow(64);
    fx.group.add(this.mesh);
  }
  Batch.prototype.grow = function (cap) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 12); this.uv = new Float32Array(cap * 8); this.col = new Float32Array(cap * 16);
    var idx = new Uint16Array(cap * 6);
    for (var i = 0; i < cap; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
  };
  // Tấm có tâm (x, y), trục dài theo (ax, ay) nửa dài hl, nửa rộng hw.
  Batch.prototype.quad = function (x, y, z, ax, ay, hl, hw, u0, v0, u1, v1, r, g, b, a) {
    if (this.n >= this.cap) {
      if (this.cap >= 8192) return;
      var old = { p: this.pos, u: this.uv, c: this.col };
      this.grow(this.cap * 2);
      this.pos.set(old.p); this.uv.set(old.u); this.col.set(old.c);
    }
    var i = this.n++, P = this.pos, o = i * 12, bx = -ay, by = ax;
    P[o] = x - ax * hl - bx * hw; P[o + 1] = y - ay * hl - by * hw; P[o + 2] = z;
    P[o + 3] = x + ax * hl - bx * hw; P[o + 4] = y + ay * hl - by * hw; P[o + 5] = z;
    P[o + 6] = x + ax * hl + bx * hw; P[o + 7] = y + ay * hl + by * hw; P[o + 8] = z;
    P[o + 9] = x - ax * hl + bx * hw; P[o + 10] = y - ay * hl + by * hw; P[o + 11] = z;
    var U = this.uv, q = i * 8;
    U[q] = u0; U[q + 1] = v0; U[q + 2] = u1; U[q + 3] = v0; U[q + 4] = u1; U[q + 5] = v1; U[q + 6] = u0; U[q + 7] = v1;
    var C = this.col, c = i * 16;
    for (var j = 0; j < 4; j++) { C[c + j * 4] = r; C[c + j * 4 + 1] = g; C[c + j * 4 + 2] = b; C[c + j * 4 + 3] = a; }
  };
  Batch.prototype.flush = function () {
    ['position', 'uv', 'color'].forEach(function (k) { this.geo.attributes[k].needsUpdate = true; }, this);
    this.geo.setDrawRange(0, this.n * 6);
    this.mesh.visible = this.n > 0;
    this.n = 0;
  };

  // Một lần phát công thức. opts: angle (rad, xoay cả công thức quanh z), scale, z, follow() → {x, y, angle} (bám theo vật), loop.
  function Play(fx, recipe, x, y, opts) {
    opts = opts || {};
    this.fx = fx; this.x = x; this.y = y; this.px = x; this.py = y;
    this.angle = opts.angle || 0; this.scale = opts.scale || 1; this.z = opts.z == null ? 0.15 : opts.z;
    this.follow = opts.follow || null; this.stopped = false; this.t = 0; this.dead = false;
    this.name = opts.name || '';
    var list = recipe.emitters || [], subOf = {};
    this.ems = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (subOf[i]) continue;
      var subs = [];
      for (var k = 1; k <= (e.subEmitters | 0) && i + k < list.length; k++) { subs.push(list[i + k]); subOf[i + k] = 1; }
      // render.mode 'mesh' vẽ lên lưới 3D riêng của prefab (QuadToCircle…) không có trong công thức; vẽ thành tấm vuông là sai hình nên bỏ
      var draws = !(e.render && e.render.enabled === false) && !(e.render && e.render.mode === 'mesh') && e.img;
      if (!draws && !subs.length) continue;
      this.ems.push({ e: e, subs: subs, draws: draws, acc: 0, dacc: 0, bursts: (e.bursts || []).map(function () { return 0; }), cyc: 0, parts: [] });
    }
    this.ems.forEach(function (em) {
      if (em.draws) fx.batch(em.e);
      em.subs.forEach(function (s) { if (s.img) fx.batch(s); });
    });
  }
  Play.prototype.stop = function () { this.stopped = true; };

  // Sinh một hạt của emitter e tại chỗ (x, y) với góc a; tn = thời gian chuẩn hoá của emitter lúc sinh.
  Play.prototype.emit = function (em, e, tn, x, y, a, sc, world) {
    if (em.parts.length >= Math.max(1, e.maxParticles || 1000)) return;
    var r = Math.random, s = sc * (e.scale || 1), sm = shapeSample(e.shape), ca = Math.cos(a), sa = Math.sin(a);
    var lx = ((e.pos ? e.pos[0] : 0) + sm[0]) * s, ly = ((e.pos ? e.pos[1] : 0) + sm[1]) * s;
    var sp = num(e.speed, tn, r()) * s;
    var col = e.color && e.color.random ? e.color.random : e.color, cr = r();
    var c0 = Array.isArray(col) && col.length === 2 && Array.isArray(col[0])
      ? [0, 1, 2, 3].map(function (i) { return col[0][i] + (col[1][i] - col[0][i]) * cr; }) : (col || [1, 1, 1, 1]);
    var p = {
      t: 0, life: Math.max(0.02, num(e.lifetime, tn, r())),
      x: lx * ca - ly * sa, y: lx * sa + ly * ca, local: e.space === 'local' && !world,
      vx: (sm[3] * ca - sm[4] * sa) * sp, vy: (sm[3] * sa + sm[4] * ca) * sp,
      size: num(e.size, tn, r()) * s, rot: num(e.rotation, tn, r()), g: num(e.gravity, tn, r()),
      c: c0, r1: r(), r2: r(), r3: r(), ph: r() * 6.28, fx0: 0, fy0: 0, ox: x, oy: y, oa: a, sub: null,
    };
    if (e.force) {
      var fx = num(e.force.x, 0, r()), fy = num(e.force.y, 0, r());
      if (e.force.world) { p.fx0 = fx; p.fy0 = fy; } else { p.fx0 = fx * ca - fy * sa; p.fy0 = fx * sa + fy * ca; }
      p.fx0 *= s; p.fy0 *= s;
    }
    if (e.sheet) p.frame0 = Array.isArray(e.sheet.frameOverTime) ? r() : null;
    if (!p.local) { p.x += x; p.y += y; }
    if (em.subs && em.subs.length) p.sub = em.subs.map(function () { return { acc: 0, dacc: 0, parts: [] }; });
    em.parts.push(p);
  };

  Play.prototype.update = function (dt) {
    if (this.follow) {
      var f = this.follow();
      if (f) { this.x = f.x; this.y = f.y; if (f.angle != null) this.angle = f.angle; } else this.stopped = true;
    }
    this.t += dt;
    var moved = Math.hypot(this.x - this.px, this.y - this.py), alive = 0;
    for (var i = 0; i < this.ems.length; i++) {
      var em = this.ems[i], e = em.e, dur = Math.max(0.01, e.duration || 1), et = this.t - (e.delay || 0);
      if (et >= 0 && !this.stopped && (e.loop || et <= dur + dt)) {
        var cyc = Math.floor(et / dur), tn = e.loop ? (et % dur) / dur : Math.min(1, et / dur);
        if (e.loop && cyc !== em.cyc) { em.cyc = cyc; em.bursts = em.bursts.map(function () { return 0; }); }
        if (e.loop || et <= dur) {
          em.acc += num(e.rate, tn, Math.random()) * dt;
          em.dacc += (e.rateOverDistance || 0) * moved / Math.max(0.01, this.scale);
        }
        var n = Math.floor(em.acc) + Math.floor(em.dacc);
        em.acc -= Math.floor(em.acc); em.dacc -= Math.floor(em.dacc);
        for (var b = 0; b < em.bursts.length; b++) {
          var B = e.bursts[b], cycles = Math.max(1, B.cycles | 0);
          while (em.bursts[b] < cycles && et - cyc * dur * (e.loop ? 1 : 0) >= B.time + em.bursts[b] * (B.interval || 0.01)) { n += burstCount(B.count); em.bursts[b]++; }
        }
        for (var k = 0; k < n; k++) this.emit(em, e, tn, this.x, this.y, this.angle, this.scale);
      }
      if (!this.stopped && (e.loop || et <= dur)) alive++;
      alive += this.step(em, e, dt);
    }
    this.px = this.x; this.py = this.y;
    if (!alive && (this.stopped || this.t > 0.05)) this.dead = true;
  };

  // Chạy và vẽ các hạt của một emitter; trả số hạt còn sống.
  Play.prototype.step = function (em, e, dt) {
    var fx = this.fx, parts = em.parts, live = 0, tmp = [0, 0, 0, 0];
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      var tl = p.t / p.life;
      if (tl >= 1) { if (!p.sub || !p.sub.some(function (s) { return s.parts.length; })) { parts.splice(i, 1); continue; } }
      var ox = p.x, oy = p.y;
      if (tl < 1) {
        p.vy -= 9.81 * p.g * dt;
        p.vx += p.fx0 * dt; p.vy += p.fy0 * dt;
        var vx = p.vx, vy = p.vy;
        if (e.velocity) {
          var wx = num(e.velocity.x, tl, p.r1), wy = num(e.velocity.y, tl, p.r2);
          if (!e.velocity.world) { var c = Math.cos(p.oa), s = Math.sin(p.oa), t = wx * c - wy * s; wy = wx * s + wy * c; wx = t; }
          vx += wx * this.scale; vy += wy * this.scale;
        }
        if (e.noise) {
          var w = (e.noise.frequency || 1) * 6.28, st = e.noise.strength || 0;
          vx += Math.sin(p.t * w + p.ph) * st; vy += Math.cos(p.t * w * 1.3 + p.ph * 2) * st;
        }
        p.x += vx * dt; p.y += vy * dt;
        if (e.rotOverLife) p.rot += e.rotOverLife * dt;
        live++;
        if (em.draws) this.draw(e, p, tl, vx, vy, tmp);
      }
      if (p.sub) live += this.stepSub(em, p, dt, tl < 1 ? Math.hypot(p.x - ox, p.y - oy) : 0, tl < 1);
    }
    return live;
  };

  // Emitter con bám theo một hạt cha: sinh theo quãng đường hạt cha đi được và theo nhịp của chính nó.
  Play.prototype.stepSub = function (em, p, dt, moved, parentAlive) {
    var live = 0, tmp = [0, 0, 0, 0];
    for (var j = 0; j < em.subs.length; j++) {
      var e = em.subs[j], st = p.sub[j], dur = Math.max(0.01, e.duration || 1);
      if (parentAlive && (e.loop || p.t <= dur)) {
        st.acc += num(e.rate, Math.min(1, p.t / dur), Math.random()) * dt;
        st.dacc += (e.rateOverDistance || 0) * moved / Math.max(0.01, this.scale);
        var n = Math.floor(st.acc) + Math.floor(st.dacc);
        st.acc -= Math.floor(st.acc); st.dacc -= Math.floor(st.dacc);
        var sx = p.local ? p.x + this.x : p.x, sy = p.local ? p.y + this.y : p.y;
        for (var k = 0; k < n; k++) this.emit(st, e, Math.min(1, p.t / dur), sx, sy, this.angle, this.scale, true);
      }
      for (var i = st.parts.length - 1; i >= 0; i--) {
        var q = st.parts[i];
        q.t += dt;
        var tl = q.t / q.life;
        if (tl >= 1) { st.parts.splice(i, 1); continue; }
        q.vy -= 9.81 * q.g * dt;
        var vx = q.vx, vy = q.vy;
        if (e.noise) { var w = (e.noise.frequency || 1) * 6.28; vx += Math.sin(q.t * w + q.ph) * e.noise.strength; vy += Math.cos(q.t * w * 1.3 + q.ph) * e.noise.strength; }
        q.x += vx * dt; q.y += vy * dt;
        live++;
        if (e.img && !(e.render && e.render.enabled === false)) this.draw(e, q, tl, vx, vy, tmp);
      }
    }
    return live;
  };

  Play.prototype.draw = function (e, p, tl, vx, vy, col) {
    var B = this.fx.batch(e), R = e.render || {}, x = p.local ? p.x + this.x : p.x, y = p.local ? p.y + this.y : p.y;
    var size = p.size * (e.sizeOverLife ? num(e.sizeOverLife, tl, p.r3) : 1);
    if (size <= 0) return;
    if (e.colorOverLife && e.colorOverLife.gradient) gradAt(e.colorOverLife.gradient, tl, col); else { col[0] = col[1] = col[2] = col[3] = 1; }
    var tint = e.tint || [1, 1, 1, 1], tm = /Legacy Shaders\/Particles\/Additive/.test(e.shader || '') ? 2 : 1;
    var r = p.c[0] * col[0] * tint[0] * tm, g = p.c[1] * col[1] * tint[1] * tm, b = p.c[2] * col[2] * tint[2] * tm, a = p.c[3] * col[3] * tint[3];
    var u0 = 0, v0 = 0, u1 = 1, v1 = 1, sh = e.sheet;
    if (sh) {
      var cols = sh.cols || 1, rows = sh.rows || 1, single = sh.type === 'singleRow', nf = single ? cols : cols * rows;
      var fo = p.frame0 != null ? p.frame0 : num(sh.frameOverTime, tl, p.r3);
      var f = Math.min(nf - 1, Math.floor(((sh.startFrame || 0) / nf + fo * (sh.cycles || 1)) % 1.0001 * nf));
      var col_ = f % cols, row = single ? (sh.row || 0) : Math.floor(f / cols);
      u0 = col_ / cols; u1 = u0 + 1 / cols; v1 = 1 - row / rows; v0 = v1 - 1 / rows;
    }
    var hl = size / 2, hw = size / 2, ax = Math.cos(p.rot), ay = Math.sin(p.rot);
    if (R.mode === 'stretch') {
      var sp = Math.hypot(vx, vy);
      if (sp > 1e-6) { ax = vx / sp; ay = vy / sp; } else { ax = Math.cos(p.oa); ay = Math.sin(p.oa); }
      if (sp <= 1e-6 && p.local) { ax = Math.cos(this.angle); ay = Math.sin(this.angle); }
      hl = (size * Math.abs(R.lengthScale || 1) + sp * (R.velocityScale || 0)) / 2;
    } else if (e.sizeY) hw = size * e.sizeY / 2;
    // hạt gốc tính trên mặt phẳng Unity z nhỏ; ở đây xếp nhẹ theo thứ tự vẽ
    B.quad(x, y, this.z, ax, ay, hl, hw, u0, v0, u1, v1, r, g, b, a);
  };

  Fx.prototype.batch = function (e) {
    var img = e.img.replace(/^art\//, ''), add = isAdditive(e), key = img + (add ? '#a' : '#n');
    this.batches = this.batches || {};
    return this.batches[key] || (this.batches[key] = new Batch(this, img, add));
  };
  // Phát một công thức gốc; trả về đối tượng có stop() (ngừng sinh hạt, hạt đang bay tự tắt).
  Fx.prototype.play = function (recipe, x, y, opts) {
    if (!recipe) return null;
    var p = new Play(this, recipe, x, y, opts);
    (this.plays = this.plays || []).push(p);
    return p;
  };
  // Nạp trước ảnh của các công thức cho khỏi nháy lần đầu.
  Fx.prototype.preloadRecipes = function (recipes) {
    var g = this.gfx, seen = {};
    var imgs = [];
    recipes.forEach(function (r) { (r && r.emitters || []).forEach(function (e) { if (e.img && !seen[e.img]) { seen[e.img] = 1; imgs.push(e.img.replace(/^art\//, '')); } }); });
    return Promise.all(imgs.map(function (i) { return g.loadTex(i, true); }));
  };
  Fx.prototype.updatePlays = function (dt) {
    var list = this.plays || [];
    for (var i = list.length - 1; i >= 0; i--) {
      list[i].update(dt);
      if (list[i].dead) list.splice(i, 1);
    }
    var B = this.batches || {};
    for (var k in B) B[k].flush();
  };

  var baseUpdate = Fx.prototype.update, baseClear = Fx.prototype.clear;
  Fx.prototype.update = function (dt) { baseUpdate.call(this, dt); this.updatePlays(dt); };
  Fx.prototype.clear = function () {
    baseClear.call(this);
    if (this.plays) this.plays.length = 0;
    var B = this.batches || {};
    for (var k in B) { B[k].n = 0; B[k].flush(); }
  };

  HX.Fx = Fx;
  HX.FX_KINDS = KINDS;
  HX.fxRecipe = { num: num, curveAt: curveAt, shapeSample: shapeSample };
})(window.HX = window.HX || {});
