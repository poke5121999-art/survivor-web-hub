// Động cơ fork từ games/biet-doi-lan/js/engine/shark.js (nhánh W2).
// Thân cá mập 3D: mô hình skinned + clip gốc (tools/rip_shark.py → art/shark/<loài>.glb, data/shark_assets.js).
// Bản fork bỏ hết AI, bùa, sát thương: thân chỉ nhận vị trí, hướng mặt, góc ngóc và vai clip từ ngoài mỗi khung.
// Cây nút: root (vị trí, cỡ) > yaw (quay trái/phải) > pitch (ngóc/chúi) > body (dời tâm khung bao về gốc) > mô hình.
(function (HX) {
  'use strict';
  var SH = window.HX_SHARKS;
  if (!SH) return;

  var BY_ID = {};
  SH.species.forEach(function (r) { BY_ID[r.id] = r; });

  // Vai clip -> tên clip gốc, theo thứ tự ưu tiên (loài không có vai nào thì lấy vai kế).
  var ROLE_FALLBACK = {
    swim: ['swim'], cruise: ['swimB', 'swim'], dash: ['swimC', 'sprint', 'swim'], sprint: ['sprint', 'swimC', 'swim'],
    attack: ['attack', 'attack3', 'attack2', 'qteReady', 'sprint'], lunge: ['qteReady', 'attack', 'sprint'],
    hurt: ['damage'], turn: ['turn'], die: ['die'],
    struggle: ['sprint', 'swimC', 'swim'],
    // ngậm con mồi = QTE_Enter gốc (cá mập lắc thợ lặn trong miệng); choáng = Sturn của cá mập búa, loài khác dùng Damage
    hold: ['qteEnter', 'attack', 'sprint', 'swim'], stun: ['stun', 'damage', 'swim'],
  };
  function roleList(role) { return ROLE_FALLBACK[role] || [role]; }
  function clipOf(rec, role) {
    var R = rec.roles, list = roleList(role);
    for (var i = 0; i < list.length; i++) if (R[list[i]]) return R[list[i]];
    return null;
  }

  // ---------- nạp glb ----------
  var bufs = {}, texs = {};
  function loadBuf(id) {
    if (!bufs[id]) {
      var url = HX.ROOT + BY_ID[id].glb;
      bufs[id] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('shark model not found: ' + url);
        return r.arrayBuffer();
      });
      bufs[id].catch(function () { delete bufs[id]; });
    }
    return bufs[id];
  }
  // Mỗi con cần cây xương riêng: giải lại glb từ bộ đệm (GLTFLoader không nhân bản SkinnedMesh được), ảnh dùng chung.
  function parse(id) {
    return loadBuf(id).then(function (buf) {
      return new Promise(function (res, rej) {
        var loader = new THREE.GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        loader.parse(buf, '', res, function (e) { rej(new Error('shark model broken: ' + id + ' ' + e)); });
      });
    });
  }
  // Tiếng gắn clip (AniClipSoundEvent gốc) của các loài này, chỉ giải mã đúng những khoá đó.
  function sfxKeys(ids) {
    var keys = [];
    ids.forEach(function (id) {
      var C = BY_ID[id].clips;
      Object.keys(C).forEach(function (k) { (C[k].sfx || []).forEach(function (e) { if (keys.indexOf(e[1]) < 0 && SH.audio[e[1]]) keys.push(e[1]); }); });
    });
    return keys;
  }
  function loadAudio(ids) {
    if (!HX.audio) return Promise.resolve();
    var keys = sfxKeys(ids);
    keys.forEach(function (k) { HX.audio.register(k, SH.audio[k].src); });
    return HX.audio.load(keys).catch(function () {});
  }
  // Hạt gắn xương theo clip (_clipDatas của *_AnimationEvent gốc): art/shark/fx/shark_vfx.json, cùng dạng dive_vfx.json.
  var VFX = null, vfxReady = null;
  function loadVfx(fx, ids) {
    if (!vfxReady) {
      vfxReady = fetch(HX.ROOT + 'art/shark/fx/shark_vfx.json').then(function (r) {
        if (!r.ok) throw new Error('shark_vfx.json ' + r.status);
        return r.json();
      }).then(function (j) { VFX = j; return j; });
      vfxReady.catch(function () { vfxReady = null; });
    }
    return vfxReady.then(function (j) {
      if (!fx) return null;
      var want = [];
      ids.forEach(function (id) {
        var C = BY_ID[id].clips;
        Object.keys(C).forEach(function (k) { (C[k].fx || []).forEach(function (f) { if (j[f[1]] && want.indexOf(j[f[1]]) < 0) want.push(j[f[1]]); }); });
      });
      return fx.preloadRecipes(want);
    });
  }
  // Nạp trước bộ đệm glb, tiếng và hạt của những loài có trong trận.
  function preload(ids, fx) {
    return Promise.all(ids.map(loadBuf).concat([loadAudio(ids), loadVfx(fx, ids)]));
  }
  // Bỏ bộ đệm và ảnh của một loài (dỡ trận).
  function drop(id) {
    delete bufs[id];
    if (texs[id]) { texs[id].dispose(); delete texs[id]; }
  }

  // ---------- vật liệu: bộ đổ màu nước chung (gfx.js) + skinning của three ----------
  // Shader gốc ProjectDR/2D_Sprite_Uber: ảnh × màu, sáng theo pháp tuyến nhân _LightFactor, trộn sương như đá.
  var VERT = [
    '#include <common>',
    '#include <skinning_pars_vertex>',
    'uniform mat3 uvTransform;',
    'varying vec2 vUv; varying vec3 vW; varying float vD; varying vec3 vN;',
    'void main() {',
    '  vUv = (uvTransform * vec3(uv, 1.0)).xy;',
    '  vec3 objectNormal = vec3(normal); vec3 transformed = vec3(position);',
    '  #include <skinbase_vertex>',
    '  #include <skinnormal_vertex>',
    '  #include <skinning_vertex>',
    '  vec4 w = modelMatrix * vec4(transformed, 1.0);',
    '  vW = w.xyz; vN = normalize(mat3(modelMatrix) * objectNormal);',
    '  vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');
  function frag() {
    return HX.gfx.WATER_GLSL + [
      '\nuniform sampler2D map; uniform vec3 baseColor; uniform float lightFactor; uniform float flash; uniform float opacity; uniform vec4 tint;',
      'varying vec2 vUv; varying vec3 vW; varying float vD; varying vec3 vN;',
      'void main() {',
      '  vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard;',
      '  c.rgb *= baseColor;',
      '  c.rgb = mix(c.rgb, tint.rgb, tint.a);',
      '  c.rgb *= hxGam(hxLight(normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), vW, lightFactor));',
      '  c.rgb = mix(c.rgb, vec3(1.0, 0.95, 0.9), flash);',
      '  gl_FragColor = vec4(hxFogMix(c.rgb, vD), opacity);',
      '}',
    ].join('\n');
  }
  function sharkMaterial(id, src, fu) {
    var map = texs[id] || (texs[id] = src.map);
    if (map) { map.updateMatrix(); map.anisotropy = 4; }
    var ex = src.userData || {}, u = {
      map: { value: map || HX.gfx.white() }, uvTransform: { value: map ? map.matrix : new THREE.Matrix3() },
      baseColor: { value: src.color ? src.color.clone() : new THREE.Color(1, 1, 1) },
      lightFactor: { value: ex.lightFactor || 1 },   // [DtD] _LightFactor của vật liệu gốc (0,6–2)
      flash: fu.flash, opacity: fu.opacity, tint: fu.tint,
    };
    var w = HX.gfx.water;
    for (var k in w) u[k] = w[k];
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: frag(), side: THREE.DoubleSide });
  }

  // ---------- một thân cá mập ----------
  // G: { gfx, fx, audio }. Trả ngay; mô hình gắn vào khi glb giải xong (ready là Promise).
  function SharkBody(G, id) {
    var rec = BY_ID[id];
    if (!rec) throw new Error('shark species not found: ' + id);
    this.G = G; this.rec = rec; this.id = id;
    this.fu = { flash: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Vector4(0, 0, 0, 0) } };
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.pitch = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.yaw); this.yaw.add(this.pitch); this.pitch.add(this.body);
    var b = rec.bounds;                   // [minX, minY, maxX, maxY] tư thế nghỉ, m, mặt về +x
    this.cx = (b[0] + b[2]) / 2; this.cy = (b[1] + b[3]) / 2;
    this.halfH = (b[3] - b[1]) / 2; this.len = b[2] - b[0];
    this.mouth = rec.mouth || [b[2], 0];
    // xoay và ngóc quanh tâm khung bao, không quanh gốc mô hình (gốc nằm gần đầu)
    this.body.position.set(-this.cx, -this.cy, 0);
    this.facing = 1; this.size = 1;
    this.mixer = null; this.actions = {}; this.cur = null; this.role = null; this.clipName = null;
    this.timeScale = 1; this.freezeAnim = false; this.turnT = -1; this.turnRate = 1;
    this.sfx = null; this.fxPlays = []; this.removed = false; this.error = null;
    G.gfx.scene.add(this.root);
    var self = this;
    this.ready = parse(id).then(function (gltf) { self.attach(gltf); return self; }, function (e) { self.error = String(e); throw e; });
  }

  SharkBody.prototype.attach = function (gltf) {
    if (this.removed) return;
    var self = this, id = this.id;
    gltf.scene.traverse(function (o) {
      if (!o.isMesh) return;
      o.material = sharkMaterial(id, o.material, self.fu);
      o.frustumCulled = false;
    });
    this.body.add(gltf.scene);
    this.model = gltf.scene;
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach(function (c) { self.actions[c.name] = self.mixer.clipAction(c); });
    var want = this.role || 'swim', o = this.wantOpts;
    this.role = null;
    this.play(want, o);
  };

  // Tên clip có thật trong glb cho vai này (bảng vai gốc có chỗ trỏ tới clip không có, vd sprint của cá mập miệng to).
  SharkBody.prototype.resolve = function (role) {
    var R = this.rec.roles, list = roleList(role);
    for (var i = 0; i < list.length; i++) {
      var n = R[list[i]];
      if (n && (!this.mixer || this.actions[n])) return n;
    }
    return this.mixer ? null : clipOf(this.rec, role);
  };
  SharkBody.prototype.clipLen = function (role) {
    var c = this.rec.clips[this.resolve(role)];
    return c ? c.len : 0;
  };

  // Chạy clip theo vai. opts: once (không lặp, giữ khung cuối), speed, fade (giây), restart, force (cắt ngang lúc quay đầu).
  SharkBody.prototype.play = function (role, opts) {
    opts = opts || {};
    var name = this.resolve(role);
    if (this.turnT >= 0 && role !== 'turn') {
      if (!opts.force) { this.turnBack = role; this.turnOpts = opts; return name; }
      this.cancelTurn();
    }
    this.timeScale = opts.speed || 1;
    if (!this.mixer) { this.role = role; this.wantOpts = opts; return name; }
    var a = name && this.actions[name];
    if (!a) return null;
    if (this.cur === a && !opts.restart) { a.timeScale = this.freezeAnim ? 0 : this.timeScale; this.role = role; return name; }
    var prev = this.cur;
    a.reset();
    a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!opts.once;
    a.timeScale = this.freezeAnim ? 0 : this.timeScale;
    a.play();
    if (prev && prev !== a) {
      if (opts.fade === 0) prev.stop(); else prev.crossFadeTo(a, opts.fade || 0.25, false);
    }
    this.cur = a; this.role = role; this.clipName = name;
    var info = this.rec.clips[name] || {};
    this.stopFx();
    this.sfx = info.sfx || info.fx ? { list: info.sfx || [], fx: info.fx || [], last: -1 } : null;
    return name;
  };
  // Clip không lặp đã chạy hết (giữ khung cuối).
  SharkBody.prototype.done = function () {
    if (!this.cur) return false;
    var c = this.cur.getClip();
    return this.cur.loop === THREE.LoopOnce && this.cur.time >= c.duration - 1e-3;
  };
  SharkBody.prototype.setFrozenAnim = function (on) {
    if (this.freezeAnim === on) return;
    this.freezeAnim = on;
    if (this.cur) this.cur.timeScale = on ? 0 : this.timeScale;
  };

  // Đổi hướng mặt: chạy clip SwimTurn gốc (xoay 180° trong clip), hết clip mới lật hướng. rate: nhân tốc độ clip quay.
  SharkBody.prototype.face = function (want, rate) {
    if (want === this.facing) { if (this.turnT >= 0 && this.turnTo !== want) this.cancelTurn(true); return; }
    if (this.turnT >= 0) return;
    var len = this.clipLen('turn');
    if (!len || !this.mixer) { this.facing = want; return; }
    this.turnRate = rate || 1;
    this.turnT = 0; this.turnLen = len; this.turnTo = want; this.turnBack = this.role; this.turnOpts = { speed: this.timeScale };
    this.play('turn', { once: true, fade: 0.12, speed: this.turnRate });
  };
  SharkBody.prototype.updateTurn = function (dt) {
    if (this.turnT < 0) return;
    this.turnT += dt * this.turnRate * (this.freezeAnim ? 0 : 1);
    if (this.turnT < this.turnLen) return;
    this.turnT = -1;
    // khung cuối clip quay (nút Root/Transform xoay 180°) trùng tư thế nghỉ của hướng mới: lật ngay, không trộn
    this.facing = this.turnTo;
    var o = this.turnOpts || {};
    this.play(this.turnBack && this.turnBack !== 'turn' ? this.turnBack : 'swim', { fade: 0, speed: o.speed, once: o.once });
  };
  SharkBody.prototype.turning = function () { return this.turnT >= 0; };
  // Cắt ngang lúc quay: quá nửa clip thì coi như đã quay xong (back = quay về hướng cũ thì giữ hướng cũ).
  SharkBody.prototype.cancelTurn = function (back) {
    if (this.turnT < 0) return;
    if (!back && this.turnT > this.turnLen / 2) this.facing = this.turnTo;
    this.turnT = -1;
    if (back) this.play(this.turnBack && this.turnBack !== 'turn' ? this.turnBack : 'swim', { fade: 0.1 });
  };

  // Đặt thân: tâm khung bao ở (x, y, z), ngóc mũi lên góc up (rad), cỡ size (1 = cỡ gốc DtD).
  SharkBody.prototype.pose = function (x, y, z, up, size) {
    this.root.position.set(x, y, z);
    if (size !== this.size) { this.size = size; this.root.scale.setScalar(size); }
    this.yaw.rotation.y = this.facing > 0 ? 0 : Math.PI;
    this.pitch.rotation.z = this.turnT >= 0 ? this.pitch.rotation.z * 0.85 : up;
  };
  // Mõm (toạ độ thế giới), cho máu và tiếng cắn.
  SharkBody.prototype.mouthAt = function () {
    var a = this.pitch.rotation.z, s = this.size, mx = (this.mouth[0] - this.cx) * s, my = (this.mouth[1] - this.cy) * s;
    var x = mx * Math.cos(a) - my * Math.sin(a), y = mx * Math.sin(a) + my * Math.cos(a);
    return { x: this.root.position.x + x * this.facing, y: this.root.position.y + y };
  };

  SharkBody.prototype.update = function (dt, onScreen) {
    this.updateTurn(dt);
    this.root.visible = onScreen;
    if (this.mixer) this.mixer.update(dt);
    this.updateSfx(onScreen);
  };

  // Tiếng và hạt gắn xương theo clip: phát khi thời gian clip vượt mốc. Clip lặp vòng thì tiếng phát lại mỗi vòng;
  // hạt gốc là cụm lặp nên chỉ bật một lần cho tới khi đổi clip.
  SharkBody.prototype.updateSfx = function (onScreen) {
    var s = this.sfx, G = this.G;
    if (!s || !this.cur) return;
    var t = this.cur.time, wrapped = t < s.last;
    if (wrapped) { s.last = -1; s.fxDone = true; }
    for (var i = 0; i < s.list.length; i++) {
      var e = s.list[i];
      if (e[0] > s.last && e[0] <= t && onScreen && G.audio) G.audio.play(e[1], { vol: ((SH.audio[e[1]] || {}).vol || 1) * (this.vol == null ? 1 : this.vol) });
    }
    if (!s.fxDone && VFX && onScreen && G.fx) {
      for (var k = 0; k < s.fx.length; k++) {
        var f = s.fx[k];
        if (f[0] > s.last && f[0] <= t) this.playFx(f[1], f[2]);
      }
    }
    s.last = t;
  };
  // Hạt bám một xương: vị trí thế giới của xương mỗi khung; hướng theo thân cá.
  SharkBody.prototype.playFx = function (key, bone) {
    var rec = VFX[key], node = this.root.getObjectByName(bone.replace(/[ .]/g, '_')) || this.pitch;
    if (!rec) return;
    var self = this, v = new THREE.Vector3();
    var p = this.G.fx.play(rec, this.root.position.x, this.root.position.y, { z: 0.2, scale: (this.rec.scale || 1) * this.size, name: 'shark:' + key, follow: function () {
      if (self.removed || (p && p.sharkDead) || !self.root.visible) return null;
      node.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z + 0.3, angle: (self.facing > 0 ? 0 : Math.PI) + self.pitch.rotation.z * self.facing };
    } });
    if (p) this.fxPlays.push(p);
  };
  SharkBody.prototype.stopFx = function () {
    this.fxPlays.forEach(function (p) { p.sharkDead = true; p.stop(); });
    this.fxPlays.length = 0;
  };

  SharkBody.prototype.remove = function () {
    this.removed = true;
    this.stopFx();
    this.G.gfx.scene.remove(this.root);
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
    this.root.traverse(function (o) {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); if (o.skeleton && o.skeleton.boneTexture) o.skeleton.boneTexture.dispose(); }
    });
  };

  // Ảnh nhỏ (ItemIcon "<tên>_Thumbnail" gốc, rip_shark.py phóng ×3).
  function iconFor(id) { var r = BY_ID[id]; return r && r.icon ? HX.ROOT + r.icon : ''; }

  HX.Shark = { Body: SharkBody, preload: preload, drop: drop, BY_ID: BY_ID, ids: Object.keys(BY_ID), iconFor: iconFor, clipOf: clipOf, roles: ROLE_FALLBACK };
})(window.HX = window.HX || {});
