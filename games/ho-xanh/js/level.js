// Bản đồ: mỗi tầng một glb gốc (đá + san hô, hải quỳ, rong, san hô 2D đã ghép atlas), vệt nắng, bụi, mặt nước, hòm dưỡng khí.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, A = window.HX_ASSETS;

  var glbCache = {};
  function loadGlb(url, onProgress) {
    if (!glbCache[url]) {
      glbCache[url] = new Promise(function (res, rej) {
        var loader = new THREE.GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        loader.load(url, res, function (e) { if (e.total && onProgress) onProgress(e.loaded / e.total); },
          function () { delete glbCache[url]; rej(new Error('level not found: ' + url)); });
      });
    }
    return glbCache[url];
  }

  // Vai của từng vật liệu nằm ở tiền tố tên (tools/level.py ghi "rock:Base001_Top", gltfpack giữ tên vật liệu).
  var ROLES = {
    rock: { kind: 'rock', nearest: true },
    coral3d: { kind: 'deco' },
    anemone: { kind: 'deco', sway: T.deco.sway.anemone },
    waveweed: { kind: 'deco', sway: T.deco.sway.waveweed },
    kelp: { kind: 'deco', sway: T.deco.sway.kelp },
    back: { kind: 'back' },
    prop: { kind: 'deco' },
    sprites: { kind: 'sprites', nearest: true },
  };

  function roleOf(name) { var r = (name || '').split(':')[0]; return ROLES[r] ? r : 'rock'; }

  function materialFor(src, geo, cache) {
    // màu đỉnh chỉ có nghĩa ở san hô 2D (m_Color của SpriteRenderer); một ít lưới đá cũng mang COLOR_0 nhưng bản gốc không dùng
    var role = roleOf(src.name), R = ROLES[role], map = src.map, vc = role === 'sprites' && !!geo.attributes.color;
    var key = src.uuid + (vc ? '#c' : '');
    if (cache[key]) return cache[key];
    if (map) {
      map.magFilter = R.nearest ? THREE.NearestFilter : THREE.LinearFilter;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.anisotropy = 4;
      map.needsUpdate = true;
    }
    var e = src.emissive, glow = e && (e.r + e.g + e.b) > 0.01 ? [e.r, e.g, e.b] : null;
    var m = HX.gfx.terrainMaterial({
      map: map, kind: R.kind, vertexColors: vc, color: [src.color.r, src.color.g, src.color.b],
      sway: R.sway || 0, glow: glow, lightFactor: R.kind === 'rock' ? T.deco.rockLight : 1,
    });
    m.userData.role = role;
    cache[key] = m;
    return m;
  }

  // Một tầng của chuyến lặn, đặt lệch yOff theo trục dọc.
  function Layer(G, L, gltf) {
    var root = gltf.scene, cache = {}, count = { meshes: 0, roles: {} };
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var src = o.userData.hxSrcMat || o.material;
      o.userData.hxSrcMat = src;
      o.material = materialFor(src, o.geometry, cache);
      o.frustumCulled = true;
      count.meshes++;
      var r = o.material.userData.role;
      count.roles[r] = (count.roles[r] || 0) + 1;
    });
    root.position.set(0, L.yOff, 0);
    root.updateMatrixWorld(true);
    this.root = root;
    this.spines = spinesOf(L);
    this.spines.forEach(function (s) { G.gfx.scene.add(s.holder); });
    this.count = count;
    this.L = L;
    G.gfx.scene.add(root);
  }
  Layer.prototype.remove = function (G) {
    G.gfx.scene.remove(this.root);
    this.spines.forEach(function (s) { G.gfx.scene.remove(s.holder); s.mesh.dispose(); });
  };
  // Rong Spine chỉ chạy hoạt ảnh khi ở gần camera.
  Layer.prototype.update = function (dt, cam, vw, vh) {
    this.spines.forEach(function (s) {
      if (Math.abs(s.x - cam.x) < vw + 4 && Math.abs(s.y - cam.y) < vh + 4) s.mesh.update(dt);
    });
  };

  // Rong/bọt biển Spine đặt theo zones.js → spines (toạ độ Unity: z đổi dấu), ma trận 2×2 giữ lật và co giãn.
  function spinesOf(L) {
    return (L.zone.spines || []).map(function (sp, i) {
      var m = HX.fish.makeMesh('env:' + sp.skel, { flash: { value: 0 }, opacity: { value: 1 } });
      var anims = A.spineEnv[sp.skel].anims, anim = anims[sp.anim] ? sp.anim : Object.keys(anims)[0];
      m.state.setAnimation(0, anim, sp.loop !== false);
      m.state.update((i * 0.37) % 3);
      var holder = new THREE.Group(), k = sp.m2, x = sp.pos[0], y = sp.pos[1] + L.yOff, z = -sp.pos[2];
      holder.matrixAutoUpdate = false;
      holder.matrix.set(k[0], k[1], 0, x, k[2], k[3], 0, y, 0, 0, 1, z, 0, 0, 0, 1);
      holder.add(m);
      holder.updateMatrixWorld(true);
      return { holder: holder, mesh: m, x: x, y: y };
    });
  }

  // Vệt nắng từ mặt nước: vài tấm cộng sáng quanh camera, trôi theo x.
  function Rays(G) {
    this.G = G;
    this.list = [];
    var texs = ['fx/E_Rays_01A.png', 'fx/LightBeam.png', 'fx/E_Ray_03A.png'];
    for (var i = 0; i < T.deco.rays; i++) {
      var m = HX.gfx.sprite(G.gfx.tex(texs[i % texs.length], true), 1, 1, { additive: true, alphaCut: 0, pivot: [0.5, 1] });
      m.renderOrder = 4;
      m.userData = { ox: (i / T.deco.rays - 0.5) * 70 + Math.random() * 5, ph: Math.random() * 6.28, w: 2 + Math.random() * 3.5, h: 22 + Math.random() * 18, z: -14 + Math.random() * 12 };
      m.rotation.z = -0.22 + Math.random() * 0.1;
      G.gfx.scene.add(m);
      this.list.push(m);
    }
    this.strength = 1;
  }
  Rays.prototype.update = function (t) {
    var cx = this.G.gfx.camera.position.x, span = 70, s = this.strength;
    this.list.forEach(function (m) {
      var u = m.userData, x = u.ox + t * 0.15;
      x = cx + (((x - cx) % span) + span * 1.5) % span - span / 2;
      m.position.set(x, T.water.surfaceY + 0.4, u.z);
      m.scale.set(u.w * (1 + 0.15 * Math.sin(t * 0.6 + u.ph)), u.h, 1);
      m.material.uniforms.opacity.value = s * (0.09 + 0.06 * Math.sin(t * 0.45 + u.ph));
      m.visible = s > 0.01;
    });
  };
  Rays.prototype.remove = function () { var s = this.G.gfx.scene; this.list.forEach(function (m) { s.remove(m); }); };

  // Bụi/sinh vật phù du trôi quanh camera; xuống sâu dày và mờ hơn.
  function Dust(G) {
    this.G = G;
    var n = T.deco.dust, pos = new Float32Array(n * 3), B = this.box = [44, 26, 16];
    for (var i = 0; i < n; i++) { pos[i * 3] = Math.random() * B[0]; pos[i * 3 + 1] = Math.random() * B[1]; pos[i * 3 + 2] = -10 + Math.random() * B[2]; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.base = pos.slice();
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdff8f4, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }));
    this.points.frustumCulled = false;
    G.gfx.scene.add(this.points);
    this.depth = 0;
  }
  Dust.prototype.update = function (t) {
    var c = this.G.gfx.camera.position, p = this.points.geometry.attributes.position.array, b = this.base, B = this.box;
    for (var i = 0; i < b.length; i += 3) {
      var x = b[i] + Math.sin(t * 0.3 + i) * 0.4 + t * 0.05, y = b[i + 1] + t * 0.08 + Math.cos(t * 0.25 + i * 0.7) * 0.3;
      p[i] = c.x - B[0] / 2 + (((x - c.x) % B[0]) + B[0] * 2) % B[0];
      p[i + 1] = c.y - B[1] / 2 + (((y - c.y) % B[1]) + B[1] * 2) % B[1];
      p[i + 2] = b[i + 2];
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 0.3 + Math.min(0.35, this.depth / 150);
  };
  Dust.prototype.remove = function () { this.G.gfx.scene.remove(this.points); };

  // Mặt nước nhìn từ dưới lên: dải sáng gợn sóng.
  function Surface(G) {
    var u = { uTime: HX.gfx.water.uTime, uSurfY: HX.gfx.water.uSurfY, uFogNear: HX.gfx.water.uFogNear };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      // không so chiều sâu: mọi thứ nhô lên khỏi mặt nước đều bị lớp loá sáng che
      uniforms: u, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: [
        'uniform float uTime; uniform float uSurfY; uniform vec3 uFogNear; varying vec3 vW;',
        'void main(){',
        '  float wave = sin(vW.x * 1.7 + uTime * 1.3) * 0.06 + sin(vW.x * 0.63 - uTime * 0.8) * 0.09;',
        '  float h = vW.y - (uSurfY + wave);',
        '  if (h < 0.0) discard;',
        '  float edge = smoothstep(0.18, 0.0, h);',
        '  vec3 c = mix(uFogNear * 1.25 + vec3(0.14, 0.2, 0.18), vec3(0.95, 1.0, 0.99), edge);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}',
      ].join('\n'),
    }));
    this.mesh.renderOrder = 6;
    this.G = G;
    G.gfx.scene.add(this.mesh);
  }
  Surface.prototype.update = function () {
    var c = this.G.gfx.camera.position;
    this.mesh.position.set(c.x, T.water.surfaceY + 6, -0.6);
    this.mesh.scale.set(140, 12.4, 1);
  };
  Surface.prototype.remove = function () { this.G.gfx.scene.remove(this.mesh); };

  // Hòm dưỡng khí: thân + nắp (nắp là con của thân, bản lề bên trái).
  function Chests(G, spots) {
    this.G = G;
    this.list = [];
    this.add(spots);
  }
  Chests.prototype.add = function (spots) {
    var G = this.G, P = A.props, pb = P['props/O2Box_Body.png'], ph = P['props/O2Box_Head.png'];
    var made = spots.map(function (s) {
      var root = new THREE.Group();
      var body = HX.gfx.sprite(G.gfx.tex('props/O2Box_Body.png'), pb.size[0] / pb.ppu, pb.size[1] / pb.ppu, { pivot: pb.pivot, depthWrite: true });
      body.position.set(pb.local[0], pb.local[1], 0);
      var lidPivot = new THREE.Group();
      lidPivot.position.set(pb.local[0] + ph.local[0], pb.local[1] + ph.local[1], 0.005);
      var lid = HX.gfx.sprite(G.gfx.tex('props/O2Box_Head.png'), ph.size[0] / ph.ppu, ph.size[1] / ph.ppu, { pivot: ph.pivot, depthWrite: true });
      lidPivot.add(lid);
      root.add(body); root.add(lidPivot);
      root.position.set(s[0], s[1], 0.02);
      G.gfx.scene.add(root);
      return { root: root, lid: lidPivot, x: s[0], y: s[1] + pb.local[1] + pb.size[1] / pb.ppu / 2, open: false, t: 0 };
    });
    this.list = this.list.concat(made);
  };
  Chests.prototype.update = function (dt) {
    var G = this.G, d = G.diver;
    this.list.forEach(function (c) {
      if (!c.open && d.state !== 'dead' && Math.hypot(d.pos.x - c.x, d.pos.y - c.y) < T.o2.chestRange) {
        c.open = true;
        d.o2 = Math.min(T.o2.max, d.o2 + T.o2.chestGain);
        G.audio.play('o2_use');
        G.audio.play('itembox', { vol: 0.6 });
        G.fx.spawn('puff', c.x, c.y + 0.2, 0.1, 0, 0.3, 0.9);
        G.fx.burst('bubbleBig', c.x, c.y + 0.1, 12, 1.2);
        G.hud.toast('+' + T.o2.chestGain + ' O₂');
      }
      if (c.open && c.t < 1) {
        c.t = Math.min(1, c.t + dt * 4);
        var e = 1 - Math.pow(1 - c.t, 3);
        c.lid.rotation.z = e * 1.9;
      }
    });
  };
  Chests.prototype.remove = function () { var s = this.G.gfx.scene; this.list.forEach(function (c) { s.remove(c.root); }); };

  // Khoang cứu hộ (EscapePodZone gốc): tới sát rồi bơi lên là kết thúc lượt lặn, giữ cả túi cá (đi ngang qua thì không sao). Vòng sáng gốc là
  // ParticleSystem 3D không rút được, nên dùng quầng sáng và cột bọt của bộ hiệu ứng.
  function Pods(G) { this.G = G; this.list = []; this.t = 0; }
  Pods.prototype.add = function (spots) {
    var G = this.G, P = A.props['props/Pod_ex.png'];
    this.list = this.list.concat(spots.map(function (s) {
      var m = HX.gfx.sprite(G.gfx.tex('props/Pod_ex.png'), P.size[0] / P.ppu, P.size[1] / P.ppu, { pivot: P.pivot, depthWrite: true });
      m.position.set(s[0], s[1], -0.3);
      G.gfx.scene.add(m);
      return { m: m, x: s[0], y: s[1] };
    }));
  };
  Pods.prototype.update = function (dt, inp) {
    var G = this.G, d = G.diver, near = false;
    this.t -= dt;
    var puff = this.t <= 0;
    if (puff) this.t = 0.35;
    this.list.forEach(function (p) {
      if (puff && Math.abs(p.x - G.gfx.camera.position.x) < 20 && Math.abs(p.y - G.gfx.camera.position.y) < 14) {
        G.fx.spawn('glow', p.x, p.y + 0.4, -0.2, 0, 0.1, 1.6);
        G.fx.spawn('bubble', p.x + (Math.random() - 0.5) * 0.5, p.y + 1.2, -0.2, 0, 0.8);
      }
      if (G.phase !== 'dive' || d.state === 'dead' || Math.abs(d.pos.x - p.x) > T.o2.podRange || Math.abs(d.pos.y - p.y - 0.6) > T.o2.podRange * 1.6) return;
      near = true;
      if (inp.my > 0.5) G.onPod(p);
    });
    if (near !== this.near) { this.near = near; G.hud.podHint(near); }
  };
  Pods.prototype.remove = function () { var s = this.G.gfx.scene; this.list.forEach(function (p) { s.remove(p.m); }); };

  HX.level = { loadGlb: loadGlb, Layer: Layer, Rays: Rays, Dust: Dust, Surface: Surface, Chests: Chests, Pods: Pods };
})(window.HX = window.HX || {});
