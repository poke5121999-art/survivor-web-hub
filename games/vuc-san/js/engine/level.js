// Động cơ fork từ games/biet-doi-lan/js/engine/level.js (nhánh W2).
// Bản đồ: một glb gốc (đá + san hô, hải quỳ, rong, san hô 2D đã ghép atlas), rong Spine, vệt nắng, bụi, mặt nước,
// hòm dưỡng khí và khoang cứu hộ vẽ theo trạng thái được đưa vào (không tự xử lý va chạm), và ánh sáng theo chủ đề
// (port từ games/ho-xanh/js/dive.js: Env, biến thể ánh sáng gốc của từng tầng).
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
  function dropGlb(url) { delete glbCache[url]; }

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

  // Một bản đồ, đặt lệch L.yOff theo trục dọc (Vực Săn chỉ có một tầng nên yOff = 0).
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
    root.position.set(0, L.yOff || 0, 0);
    root.updateMatrixWorld(true);
    this.root = root;
    this.mats = cache;
    this.spines = spinesOf(L);
    this.spines.forEach(function (s) { G.gfx.scene.add(s.holder); });
    this.count = count;
    this.L = L;
    G.gfx.scene.add(root);
  }
  // Gỡ khỏi cảnh và trả bộ nhớ GPU: lưới, vật liệu, ảnh của glb.
  Layer.prototype.remove = function (G) {
    G.gfx.scene.remove(this.root);
    this.spines.forEach(function (s) { G.gfx.scene.remove(s.holder); s.mesh.dispose(); });
    var texs = new Set();
    this.root.traverse(function (o) {
      if (!o.isMesh) return;
      o.geometry.dispose();
      var src = o.userData.hxSrcMat;
      if (src && src.map) texs.add(src.map);
    });
    Object.keys(this.mats).forEach(function (k) { this.mats[k].dispose(); }, this);
    texs.forEach(function (t) { t.dispose(); });
  };
  // Rong Spine chỉ chạy hoạt ảnh khi ở gần camera.
  Layer.prototype.update = function (dt, cam, vw, vh) {
    this.spines.forEach(function (s) {
      if (Math.abs(s.x - cam.x) < vw + 4 && Math.abs(s.y - cam.y) < vh + 4) s.mesh.update(dt);
    });
  };

  // ---------- rong / bọt biển Spine (zones.js → spines), bản gọn của bộ nạp Spine trong fish.js ----------
  var spineMgr = null, spineData = {};
  function loadSpines(zone) {
    var E = A.spineEnv || {}, need = [];
    (zone.spines || []).forEach(function (sp) { if (E[sp.skel] && !spineData[sp.skel] && need.indexOf(sp.skel) < 0) need.push(sp.skel); });
    if (!need.length || !window.spine) return Promise.resolve();
    spineMgr = spineMgr || new spine.AssetManager(HX.ROOT + 'art/');
    need.forEach(function (k) { spineMgr.loadBinary(E[k].skel); spineMgr.loadTextureAtlas(E[k].atlas); });
    return new Promise(function (res, rej) {
      (function poll() {
        if (spineMgr.hasErrors()) return rej(new Error('spine asset not found: ' + JSON.stringify(spineMgr.getErrors())));
        if (!spineMgr.isLoadingComplete()) return setTimeout(poll, 50);
        need.forEach(function (k) {
          var bin = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(spineMgr.require(E[k].atlas)));
          bin.scale = T.fish.pxToUnit;
          spineData[k] = bin.readSkeletonData(spineMgr.require(E[k].skel));
        });
        res();
      })();
    });
  }
  var SPINE_VERT = [
    'attribute vec4 color; varying vec2 vUv; varying vec4 vColor; varying vec3 vW; varying float vD;',
    'void main() { vUv = uv; vColor = color; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;',
    '  vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  function spineFrag() {
    return HX.gfx.WATER_GLSL + '\nuniform sampler2D map; varying vec2 vUv; varying vec4 vColor; varying vec3 vW; varying float vD;\n' +
      'void main() { vec4 c = texture2D(map, vUv) * vColor; if (c.a < 0.04) discard; c.rgb = hxGrade(c.rgb, vW, vD); gl_FragColor = c; }';
  }
  // Toạ độ Unity: z đổi dấu; ma trận 2×2 giữ lật và co giãn.
  function spinesOf(L) {
    return (L.zone.spines || []).filter(function (sp) { return spineData[sp.skel]; }).map(function (sp, i) {
      var m = new spine.SkeletonMesh(spineData[sp.skel], function (p) {
        p.vertexShader = SPINE_VERT; p.fragmentShader = spineFrag();
        var w = HX.gfx.water;
        for (var k in w) p.uniforms[k] = w[k];
        p.depthWrite = false;
      });
      m.zOffset = 0.0004;
      var anims = A.spineEnv[sp.skel].anims, anim = anims[sp.anim] ? sp.anim : Object.keys(anims)[0];
      m.state.setAnimation(0, anim, sp.loop !== false);
      m.state.update((i * 0.37) % 3);
      var holder = new THREE.Group(), k = sp.m2, x = sp.pos[0], y = sp.pos[1] + (L.yOff || 0), z = -sp.pos[2];
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
  Rays.prototype.remove = function () {
    var s = this.G.gfx.scene;
    this.list.forEach(function (m) { s.remove(m); m.material.dispose(); });
  };

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
  Dust.prototype.remove = function () {
    this.G.gfx.scene.remove(this.points);
    this.points.geometry.dispose(); this.points.material.dispose();
  };

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
  Surface.prototype.remove = function () {
    this.G.gfx.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  };

  // Hòm dưỡng khí: thân + nắp (nắp là con của thân, bản lề bên trái). Mở nắp khi hòm đang nghỉ (readyAt > now).
  function Chests(G) { this.G = G; this.list = []; }
  Chests.prototype.make = function (x, y) {
    var G = this.G, P = A.props, pb = P['props/O2Box_Body.png'], ph = P['props/O2Box_Head.png'];
    var root = new THREE.Group();
    var body = HX.gfx.sprite(G.gfx.tex('props/O2Box_Body.png'), pb.size[0] / pb.ppu, pb.size[1] / pb.ppu, { pivot: pb.pivot, depthWrite: true });
    body.position.set(pb.local[0], pb.local[1], 0);
    var lidPivot = new THREE.Group();
    lidPivot.position.set(pb.local[0] + ph.local[0], pb.local[1] + ph.local[1], 0.005);
    var lid = HX.gfx.sprite(G.gfx.tex('props/O2Box_Head.png'), ph.size[0] / ph.ppu, ph.size[1] / ph.ppu, { pivot: ph.pivot, depthWrite: true });
    lidPivot.add(lid);
    root.add(body); root.add(lidPivot);
    root.position.set(x, y, 0.02);
    G.gfx.scene.add(root);
    return { root: root, lid: lidPivot, mats: [body.material, lid.material], x: x, y: y, t: 0 };
  };
  // boxes: [{ x, y, readyAt }] của trận; now = m.t.
  Chests.prototype.sync = function (boxes, now, dt) {
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i], c = this.list[i] || (this.list[i] = this.make(b.x, b.y));
      c.root.position.set(b.x, b.y, 0.02);
      var open = b.readyAt != null && b.readyAt > now;
      c.t = Math.max(0, Math.min(1, c.t + (open ? dt * 4 : -dt * 1.5)));
      c.lid.rotation.z = (1 - Math.pow(1 - c.t, 3)) * 1.9;
      c.open = open;
    }
  };
  Chests.prototype.remove = function () {
    var s = this.G.gfx.scene;
    this.list.forEach(function (c) { s.remove(c.root); c.mats.forEach(function (m) { m.dispose(); }); });
    this.list.length = 0;
  };

  // Khoang cứu hộ (EscapePodZone gốc) = chỗ nộp kho báu. Vòng sáng gốc là ParticleSystem 3D không rút được,
  // nên dùng quầng sáng và cột bọt của bộ hiệu ứng.
  function Pods(G) { this.G = G; this.list = []; this.t = 0; }
  Pods.prototype.sync = function (pods, dt) {
    var G = this.G, P = A.props['props/Pod_ex.png'];
    for (var i = 0; i < pods.length; i++) {
      if (this.list[i]) continue;
      var m = HX.gfx.sprite(G.gfx.tex('props/Pod_ex.png'), P.size[0] / P.ppu, P.size[1] / P.ppu, { pivot: P.pivot, depthWrite: true });
      m.position.set(pods[i].x, pods[i].y, -0.3);
      G.gfx.scene.add(m);
      this.list[i] = { m: m, x: pods[i].x, y: pods[i].y };
    }
    this.t -= dt;
    if (this.t > 0 || !G.fx) return;
    this.t = 0.35;
    var c = G.gfx.camera.position;
    this.list.forEach(function (p) {
      if (Math.abs(p.x - c.x) > 20 || Math.abs(p.y - c.y) > 14) return;
      G.fx.spawn('glow', p.x, p.y + 0.4, -0.2, 0, 0.1, 1.6);
      G.fx.spawn('bubble', p.x + (Math.random() - 0.5) * 0.5, p.y + 1.2, -0.2, 0, 0.8);
    });
  };
  Pods.prototype.remove = function () {
    var s = this.G.gfx.scene;
    this.list.forEach(function (p) { s.remove(p.m); p.m.material.dispose(); });
    this.list.length = 0;
  };

  // ---------- ánh sáng theo chủ đề (port games/ho-xanh/js/dive.js) ----------
  // variant: biến thể ánh sáng gốc (GlobalAmbientController _Evening/_Rain…); glow: độ sáng tấm nền phía mặt nước;
  // dim: nhân ánh sáng môi trường (cảnh đêm gốc mượn bộ màu Evening).
  var THEMES = {
    day: {},
    kelp: {},
    evening: { variant: 'Evening', glow: 0.7 },
    rain: { variant: 'Rain', glow: 0.5 },
    night: { variant: 'Evening', night: true, glow: 0.08, dim: 0.55 },
  };
  function variantLight(z, v) {
    // tầng đêm gốc (A03N, B04N) đã mang ánh sáng đêm riêng: giữ nguyên
    var lv = v && !z.night && z.lightVariants && z.lightVariants[v];
    if (!lv) return z.light;
    return { fog: z.light.fog, ambient: lv.ambient || z.light.ambient, volume: lv.volume || z.light.volume, surfaceVolume: z.light.surfaceVolume };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(o, a, b, t) { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; }
  function curveAt(c, t) {
    if (!c || !c.length) return t;
    if (t <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) {
      if (t <= c[i][0]) { var a = c[i - 1], b = c[i]; return lerp(a[1], b[1], (t - a[0]) / Math.max(1e-6, b[0] - a[0])); }
    }
    return c[c.length - 1][1];
  }

  function Env() {
    this.near = [0, 0, 0]; this.mid = [0, 0, 0]; this.far = [0, 0, 0];
    this.ambient = [0, 0, 0]; this.sun = [0, 0, 0];
    this.fogStart = 12; this.fogEnd = 56;
    this.exposure = 0; this.contrast = 0; this.saturation = 0; this.filter = [1, 1, 1];
    this.vigColor = [0, 0, 0]; this.vig = 0; this.vigCx = 0.5; this.vigCy = 0.5; this.chroma = 0;
    this.bloomThr = 1; this.bloom = 0; this.bloomTint = [1, 1, 1];
  }
  // Môi trường tại độ cao y (toạ độ thế giới) theo bộ ánh sáng của tầng.
  Env.prototype.fromLight = function (Lt, y) {
    var Am = Lt.ambient, F = Lt.fog;
    var t = curveAt(Am.curve, Math.min(1, Math.max(0, (Am.y0 - y) / (Am.y0 - Am.y1))));
    lerp3(this.near, Am.fog0, Am.fog1, t);
    // multiFog tắt (mọi cảnh gốc) thì sương một màu; mid/far khi đó chỉ là giá trị mặc định
    if (Am.multiFog) { lerp3(this.mid, Am.mid0, Am.mid1, t); lerp3(this.far, Am.far0, Am.far1, t); }
    else { lerp3(this.mid, this.near, this.near, 0); lerp3(this.far, this.near, this.near, 0); }
    this.fogStart = F.start; this.fogEnd = F.end;
    this.ambient = Am.ambient.slice();
    this.sun = Am.dir.slice();
    var k = Am.dirIntensity == null ? 1 : Am.dirIntensity;
    this.sun[0] *= k; this.sun[1] *= k; this.sun[2] *= k;
    this.volume(Lt.volume);
    return this;
  };
  Env.prototype.volume = function (V) {
    if (!V) return;
    var C = V.color || {}, G = V.vignette || {};
    this.exposure = C.exposure || 0; this.contrast = C.contrast || 0; this.saturation = C.saturation || 0;
    this.filter = (C.filter || [1, 1, 1]).slice();
    this.vigColor = (G.color || [0, 0, 0]).slice(); this.vig = G.intensity || 0;
    this.vigCx = G.center ? G.center[0] : 0.5; this.vigCy = G.center ? G.center[1] : 0.5;
    this.chroma = V.chroma || 0;
    var B = V.bloom || {};
    this.bloomThr = B.threshold == null ? 0.9 : B.threshold; this.bloom = (B.intensity || 0) * T.dive.bloomScale; this.bloomTint = (B.tint || [1, 1, 1]).slice();
  };
  var FIELDS3 = ['near', 'mid', 'far', 'ambient', 'sun', 'filter', 'vigColor', 'bloomTint'];
  var FIELDS1 = ['fogStart', 'fogEnd', 'exposure', 'contrast', 'saturation', 'vig', 'vigCx', 'vigCy', 'chroma', 'bloomThr', 'bloom'];
  Env.prototype.mix = function (o, t) {
    var self = this;
    FIELDS3.forEach(function (f) { lerp3(self[f], self[f], o[f], t); });
    FIELDS1.forEach(function (f) { self[f] = lerp(self[f], o[f], t); });
    return this;
  };

  // Ánh sáng của một bản đồ: zone (HX_ZONES) + chủ đề. update(y) đổ vào uniform nước và lớp chỉnh màu.
  function Light(zone, themeId) {
    this.zone = zone;
    this.theme = THEMES[themeId] || THEMES.day;
    this.light = variantLight(zone, this.theme.variant);
    this.env = new Env(); this.envB = new Env();
    var band = T.dive.bands[zone.area] || [0, 50];
    this.d0 = band[0]; this.d1 = band[1];
  }
  Light.prototype.depth = function (y) {
    var top = T.water.surfaceY, bot = this.zone.bounds.minY;
    return this.d0 + (this.d1 - this.d0) * Math.max(0, Math.min(1, (top - y) / Math.max(1, top - bot)));
  };
  Light.prototype.envAt = function (y) {
    var out = this.env.fromLight(this.light, y), sv = this.light.surfaceVolume;
    // gần mặt nước dùng hồ sơ Surface: sáng và rực hơn
    if (sv) {
      var k = 1 - Math.min(1, Math.max(0, (T.water.surfaceY - y) / T.dive.surfaceBlend));
      if (k > 0) { this.envB.fromLight(this.light, y); this.envB.volume(sv); out.mix(this.envB, k); }
    }
    return out;
  };
  function set3(u, a) { u.value.set(a[0], a[1], a[2]); }
  Light.prototype.update = function (y) {
    var W = HX.gfx.water, P = HX.gfx.grade, env = this.envAt(y), th = this.theme, D = T.dive;
    set3(W.uFogNear, env.near); set3(W.uFogMid, env.mid); set3(W.uFogFar, env.far);
    W.uFogStart.value = env.fogStart; W.uFogEnd.value = env.fogEnd;
    // vực sâu gốc có hàng chục đèn điểm đặt trong cảnh (không rút được); nâng nền ánh sáng thay cho chúng
    var fl = D.ambientFloor, dim = th.dim || 1;
    W.uAmbient.value.set(Math.max(fl, env.ambient[0]) * dim, Math.max(fl, env.ambient[1]) * dim, Math.max(fl, env.ambient[2]) * dim);
    W.uSun.value.set(env.sun[0] * dim, env.sun[1] * dim, env.sun[2] * dim);
    W.uGlow.value = th.glow == null ? 1 : th.glow;
    var depth = this.depth(y), night = th.night || this.zone.night;
    W.uSpriteLit.value = night ? D.spriteDark : Math.max(D.spriteDark, 1 - depth / 250 * (1 - D.spriteDark));
    P.uExposure.value = env.exposure; P.uContrast.value = env.contrast; P.uSaturation.value = env.saturation;
    set3(P.uFilter, env.filter); set3(P.uVigColor, env.vigColor); P.uVig.value = env.vig;
    P.uVigCenter.value.set(env.vigCx, env.vigCy); P.uChroma.value = env.chroma;
    P.uBloomThr.value = env.bloomThr; P.uBloom.value = env.bloom; set3(P.uBloomTint, env.bloomTint);
    return { depth: depth, night: !!night, rays: night ? 0 : Math.max(0, 1 - depth / 45) * (th.variant === 'Rain' ? 0.4 : 1) };
  };

  HX.level = {
    loadGlb: loadGlb, dropGlb: dropGlb, loadSpines: loadSpines, Layer: Layer, Rays: Rays, Dust: Dust, Surface: Surface,
    Chests: Chests, Pods: Pods, Light: Light, Env: Env, THEMES: THEMES,
  };
})(window.HX = window.HX || {});
