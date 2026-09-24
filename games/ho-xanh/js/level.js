// Bản đồ: đá 3D từ glb gốc, trang trí san hô/rong trên mép đá, vệt nắng, mặt nước, hòm dưỡng khí.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, A = window.HX_ASSETS;

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  var glbCache = {};
  function loadGlb(url, onProgress) {
    if (glbCache[url]) return Promise.resolve(glbCache[url]);
    return new Promise(function (res, rej) {
      var loader = new THREE.GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load(url, function (g) { glbCache[url] = g; res(g); }, function (e) { if (e.total) onProgress(e.loaded / e.total); },
        function () { rej(new Error('level not found: ' + url)); });
    });
  }

  function terrainFrom(gltf) {
    var root = gltf.scene, mats = {}, count = 0;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      count++;
      var src = o.userData.hxSrcMat || o.material;
      o.userData.hxSrcMat = src;
      if (!mats[src.uuid]) {
        var map = src.map;
        if (map) { map.magFilter = THREE.NearestFilter; map.anisotropy = 1; }
        var m = new THREE.MeshBasicMaterial({ map: map, alphaTest: 0.5 });
        HX.gfx.patchTerrain(m);
        mats[src.uuid] = m;
      }
      o.material = mats[src.uuid];
    });
    return { root: root, meshes: count };
  }

  // Ảnh trắng xám của bản gốc được tô màu bằng SpriteRenderer.color; ở đây chọn bảng màu san hô.
  var CORAL_TINTS = [0xff8f86, 0xffb36b, 0xc792ff, 0xffe08a, 0x7fe0d0, 0xff9fc9, 0x9fd0ff];
  var DECO = {
    tinted: ['env/Coral001.png', 'env/Coral005.png', 'env/Coral006.png', 'env/Coral007.png', 'env/Coral008.png', 'env/CoralBush001.png',
      'env/CoralBush002.png', 'env/CoralBush003.png', 'env/CoralBush005.png', 'env/CoralBush006.png', 'env/CoralBush008.png', 'env/CoralBush009.png',
      'env/CoralRock001.png', 'env/CoralRock002.png', 'env/CoralRock003.png', 'env/CoralRock004.png', 'env/Cr12.png', 'env/Cr13.png', 'env/Cr2.png',
      'env/Cr5.png', 'env/Am1.png', 'env/Am2.png', 'env/Am3.png', 'env/Am4.png'],
    grass: ['env/Grass001.png', 'env/Grass002.png', 'env/Grass003.png', 'env/Grass004.png'],
    group: ['env/Group_Coral001.png', 'env/Group_Coral004.png', 'env/Group_Coral007.png', 'env/Group_Coral009.png'],
    rare: ['env/Starfish001.png', 'env/Bone001.png', 'env/Bone002.png', 'env/Seaweed_07.png'],
    dead: ['env/DeadCoral001.png', 'env/DeadCoral002.png', 'env/DeadCoral003.png', 'env/DeadCoral005.png', 'env/DeadCoral006.png', 'env/DeadCoral007.png'],
  };
  var SPINE_DECO = ['B_Seaweed_Side01', 'B_Seaweed_Side02', 'B_Seaweed_Side03', 'B_Seaweed_Side04', 'Gelidium', 'Kajime', 'SeaGrapes', 'Tangle',
    'C_Seaweed07', 'C_Seaweed08', 'MV_SeaWeed001', 'MV_SeaWeed002', 'Bladderwrack'];

  function decoImages() {
    var all = [];
    Object.keys(DECO).forEach(function (k) { all = all.concat(DECO[k]); });
    all.push('env/FarBG001.png', 'env/FarBG002.png', 'env/FarBG003.png');
    return all;
  }

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  function decorate(G, levelId) {
    var r = rng(hashStr(levelId)), W = G.world, grp = new THREE.Group(), spines = [];
    var edges = W.upwardEdges(T.deco.maxSlope);
    edges.forEach(function (e) {
      var d = T.deco.everyMin * r();
      while (d < e.len) {
        var t = d / e.len, x = e.ax + (e.bx - e.ax) * t, y = e.ay + (e.by - e.ay) * t;
        d += T.deco.everyMin + r() * (T.deco.everyMax - T.deco.everyMin);
        if (y > T.water.surfaceY - 0.5) continue;
        var depth = T.water.surfaceY - y, z = -0.55 + r() * 0.75, roll = r();
        if (roll < T.deco.spineChance) {
          var id = pick(r, SPINE_DECO), m = HX.fish.makeMesh('env:' + id, { flash: { value: 0 }, opacity: { value: 1 } });
          var e2 = A.spineEnv[id], anim = Object.keys(e2.anims).filter(function (a) { return a !== 'die' && a !== 'seed'; })[0];
          m.state.setAnimation(0, anim, true);
          m.state.update(r() * 5);
          var holder = new THREE.Group();
          holder.add(m);
          var s = T.deco.scale[0] + r() * (T.deco.scale[1] - T.deco.scale[0]);
          holder.scale.set(r() < 0.5 ? -s : s, s, 1);
          holder.position.set(x, y - 0.03, z);
          grp.add(holder);
          spines.push({ mesh: m, x: x, y: y });
          continue;
        }
        var rel, tint = 0xffffff;
        if (roll < T.deco.spineChance + T.deco.groupChance && depth < 30) rel = pick(r, DECO.group);
        else if (roll > 0.94) rel = pick(r, DECO.rare);
        else if (roll > 0.72) rel = pick(r, DECO.grass);
        else if (depth > 28 && r() < 0.5) { rel = pick(r, DECO.dead); tint = 0xb8c4c8; }
        else { rel = pick(r, DECO.tinted); tint = CORAL_TINTS[Math.floor(r() * CORAL_TINTS.length)]; }
        var sz = A.images[rel];
        var sc = (rel.indexOf('Group_') >= 0 ? 1.3 : 1) * (T.deco.scale[0] + r() * (T.deco.scale[1] - T.deco.scale[0]));
        var sp = HX.gfx.sprite(G.gfx.tex(rel), sz[0] / 100 * sc, sz[1] / 100 * sc, { pivot: [0.5, 0.04], tint: tint, alphaCut: 0.5, depthWrite: true });
        if (r() < 0.5) sp.scale.x *= -1;
        sp.position.set(x, y, z);
        grp.add(sp);
      }
    });
    // Dáng núi san hô xa tít phía sau, chỉ còn là bóng mờ trong sương nước.
    for (var fx = W.box.minX; fx < W.box.maxX; fx += 14 + r() * 10) {
      var far = 'env/FarBG00' + (1 + Math.floor(r() * 3)) + '.png', fs = A.images[far], k = T.deco.farScale * (0.8 + r() * 0.5);
      var fb = HX.gfx.sprite(G.gfx.tex(far), fs[0] / 100 * k, fs[1] / 100 * k, { pivot: [0.5, 0], tint: T.deco.farTint, alphaCut: 0.5 });
      fb.position.set(fx, T.water.deepY - 6 + r() * 10, -58 - r() * 8);
      grp.add(fb);
    }
    return { group: grp, spines: spines };
  }

  // Vệt nắng từ mặt nước: vài tấm cộng sáng quanh camera, trôi theo x.
  function Rays(G) {
    this.G = G;
    this.list = [];
    var texs = ['fx/E_Rays_01A.png', 'fx/LightBeam.png', 'fx/E_Ray_03A.png'];
    for (var i = 0; i < T.deco.rays; i++) {
      var m = HX.gfx.sprite(G.gfx.tex(texs[i % texs.length], true), 1, 1, { additive: true, alphaCut: 0, pivot: [0.5, 1] });
      m.renderOrder = 4;
      m.userData = { ox: (i / T.deco.rays - 0.5) * 44 + Math.random() * 4, ph: Math.random() * 6.28, w: 1.2 + Math.random() * 2.2, h: 12 + Math.random() * 10, z: -9 + Math.random() * 8 };
      m.rotation.z = -0.22 + Math.random() * 0.1;
      G.gfx.scene.add(m);
      this.list.push(m);
    }
  }
  Rays.prototype.update = function (t) {
    var cx = this.G.gfx.camera.position.x, span = 44;
    this.list.forEach(function (m) {
      var u = m.userData, x = u.ox + t * 0.15;
      x = cx + (((x - cx) % span) + span * 1.5) % span - span / 2;
      m.position.set(x, T.water.surfaceY + 0.4, u.z);
      m.scale.set(u.w * (1 + 0.15 * Math.sin(t * 0.6 + u.ph)), u.h, 1);
      m.material.uniforms.opacity.value = 0.07 + 0.05 * Math.sin(t * 0.45 + u.ph);
    });
  };
  Rays.prototype.remove = function () { var s = this.G.gfx.scene; this.list.forEach(function (m) { s.remove(m); }); };

  // Bụi trôi quanh camera.
  function Dust(G) {
    this.G = G;
    var n = T.deco.dust, pos = new Float32Array(n * 3);
    this.box = [26, 16, 10];
    for (var i = 0; i < n; i++) { pos[i * 3] = Math.random() * 26; pos[i * 3 + 1] = Math.random() * 16; pos[i * 3 + 2] = -7 + Math.random() * 10; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.base = pos.slice();
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcdf3f0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }));
    this.points.frustumCulled = false;
    G.gfx.scene.add(this.points);
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
    var depth = T.water.surfaceY - c.y;
    this.points.material.opacity = 0.25 + Math.min(0.35, depth / 60);
  };
  Dust.prototype.remove = function () { this.G.gfx.scene.remove(this.points); };

  // Mặt nước nhìn từ dưới lên: dải sáng gợn sóng.
  function Surface(G) {
    var u = { uTime: HX.gfx.water.uTime, uSurfY: HX.gfx.water.uSurfY, uShallow: HX.gfx.water.uShallow };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      // không so chiều sâu: mọi thứ nhô lên khỏi mặt nước đều bị lớp loá sáng che
      uniforms: u, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: [
        'uniform float uTime; uniform float uSurfY; uniform vec3 uShallow; varying vec3 vW;',
        'void main(){',
        '  float wave = sin(vW.x * 1.7 + uTime * 1.3) * 0.06 + sin(vW.x * 0.63 - uTime * 0.8) * 0.09;',
        '  float h = vW.y - (uSurfY + wave);',
        '  if (h < 0.0) discard;',
        '  float edge = smoothstep(0.16, 0.0, h);',
        '  vec3 c = mix(uShallow * 1.35 + vec3(0.08, 0.12, 0.1), vec3(0.93, 1.0, 0.98), edge);',
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
    this.mesh.position.set(c.x, T.water.surfaceY + 4, -0.6);
    this.mesh.scale.set(80, 8.4, 1);
  };
  Surface.prototype.remove = function () { this.G.gfx.scene.remove(this.mesh); };

  // Hòm dưỡng khí: thân + nắp (nắp là con của thân, bản lề bên trái).
  function Chests(G, spots) {
    this.G = G;
    var P = A.props, pb = P['props/O2Box_Body.png'], ph = P['props/O2Box_Head.png'];
    this.list = spots.map(function (s) {
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
  }
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

  HX.level = {
    loadGlb: loadGlb, terrainFrom: terrainFrom, rng: rng, hashStr: hashStr, decorate: decorate, decoImages: decoImages,
    Rays: Rays, Dust: Dust, Surface: Surface, Chests: Chests,
  };
})(window.HX = window.HX || {});
