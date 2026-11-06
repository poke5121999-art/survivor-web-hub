// Cá mập 3D: mô hình skinned + clip gốc (tools/rip_shark.py → art/shark/<loài>.glb, data/shark_assets.js).
// Một con cá mập mang đúng giao diện của Fish (js/fish.js) nên xiên, dao, súng, drone, giằng co, xác và túi cá
// dùng chung đường với cá Spine. Bộ sinh cá gọi HX.Shark.create(G, id, x, y, { night }) rồi đẩy vào G.fishes.list.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, FT = T.fish, SH = window.HX_SHARKS;
  if (!SH) return;

  var VI_NAMES = {
    Whitetip_Reefshark: 'Cá mập rạn vây trắng', Blacktip_Reefshark: 'Cá mập rạn vây đen', Copper_Shark: 'Cá mập đồng',
    Shortfin_Mako: 'Cá mập mako vây ngắn', Zebra_Shark: 'Cá mập vằn', Thresher_Shark: 'Cá mập đuôi dài', Tiger_Shark: 'Cá mập hổ', Longnosesaw_Shark: 'Cá mập mũi cưa',
    Smooth_Hammershark: 'Cá mập búa trơn', Cookiecutter_Shark: 'Cá mập cắt bánh quy', Frilled_Shark: 'Cá mập mang xếp',
    Megamouth_Shark: 'Cá mập miệng to',
  };

  // Hồ sơ loài theo dạng `sp` của cá Spine (id, name, hp, damage, size, cm, rank, scale) để túi cá, thẻ bắt cá,
  // màn kết quả, tủ cá và quán đọc được; `model` là bản ghi gốc của rip_shark.py.
  function speciesOf(rec, night) {
    var n = night && rec.night;
    return {
      id: rec.id, shark: true, model: rec, zone: rec.zone, name: rec.name, vi: VI_NAMES[rec.id] || rec.name,
      hp: n ? n.hp : rec.hp, damage: n ? n.damage : rec.damage, aggressive: true,
      size: rec.size, cm: rec.cm, rank: rec.rank, scale: rec.scale, anims: {}, night: !!n,
    };
  }
  var BY_ID = {};
  SH.species.forEach(function (r) { BY_ID[r.id] = speciesOf(r, false); });

  // Số hành vi của từng loài. [DtD] = SAFishData gốc (ScriptableObjects/Fish/SA_Fish); còn lại [ĐỀ XUẤT].
  function aiOf(sp) {
    var a = sp.model.ai || {}, ab = a.abilities || {};
    return {
      sight: a.RangeFindEnemy || FT.sight,                       // [DtD] RangeFindEnemy
      follow: a.MaxRangeCanFollow || 8,                          // [DtD] MaxRangeCanFollow: xa hơn thì thôi đuổi
      chargeRange: a.RangeAbleToSprintAttack || 5,               // [DtD] RangeAbleToSprintAttack
      chargeAngle: (a.LeastAngleToSprint || 13) * Math.PI / 180, // [DtD] LeastAngleToSprint (độ)
      chargeTime: a.SprintLimitTime || 1.5,                      // [DtD] SprintLimitTime
      chargeCd: a.CoolTimeSprintDecision || 5,                   // [DtD] CoolTimeSprintDecision
      chargeSpeed: ab.sprint ? ab.sprint.speed : 5,              // [DtD] DefaultSprintData.SprintSpeed
      battle: a.FishBattleSpeedRate || 1.3,                      // [DtD] FishBattleSpeedRate: bơi đuổi nhanh hơn bơi thường
      home: a.runToHomeSpeed || 2.5,                             // [DtD] runToHomeSpeed: bơi bỏ đi sau cú cắn
      biteCd: ab.bite ? ab.bite.cool : 10,                       // [DtD] SABiteData.biteSkillCoolTime (loài không có: 10)
      rage: ab.rage ? ab.rage.time : 3,                          // [DtD] SARageData.ConsistTime
      swim: a.SwimSpeed > 0 ? a.SwimSpeed : 0.9,                 // [DtD] SwimSpeed; 0 ở vài loài → [ĐỀ XUẤT] 0,9 như cá mập vằn
    };
  }

  // Vai clip -> tên clip gốc, theo thứ tự ưu tiên (loài không có vai nào thì lấy vai kế).
  var ROLE_FALLBACK = {
    swim: ['swim'], cruise: ['swimB', 'swim'], dash: ['swimC', 'sprint', 'swim'], sprint: ['sprint', 'swimC', 'swim'],
    attack: ['attack', 'attack3', 'attack2', 'qteReady', 'sprint'], lunge: ['qteReady', 'attack', 'sprint'],
    hurt: ['damage'], turn: ['turn'], die: ['die'],
    struggle: ['sprint', 'swimC', 'swim'],
  };
  function clipOf(sp, role) {
    var R = sp.model.roles, list = ROLE_FALLBACK[role] || [role];
    for (var i = 0; i < list.length; i++) if (R[list[i]]) return R[list[i]];
    return null;
  }

  // ---------- nạp glb ----------
  var bufs = {}, texs = {}, audioReady = null;
  function loadBuf(id) {
    if (!bufs[id]) {
      var url = BY_ID[id].model.glb;
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
  function loadAudio() {
    if (!audioReady) {
      var A = window.HX_ASSETS.audio;
      Object.keys(SH.audio).forEach(function (k) { A[k] = { src: SH.audio[k].src, kind: 'sfx' }; });
      audioReady = HX.audio.load(Object.keys(SH.audio)).catch(function () {});
    }
    return audioReady;
  }
  // Hạt gắn xương theo clip (_clipDatas của *_AnimationEvent gốc): art/shark/fx/shark_vfx.json, cùng dạng dive_vfx.json.
  var VFX = null, vfxReady = null;
  function loadVfx(G) {
    if (!vfxReady) {
      vfxReady = fetch('art/shark/fx/shark_vfx.json').then(function (r) {
        if (!r.ok) throw new Error('shark_vfx.json ' + r.status);
        return r.json();
      }).then(function (j) {
        VFX = j;
        return G && G.fx.preloadRecipes(Object.keys(j).map(function (k) { return j[k]; }));
      });
      vfxReady.catch(function (e) { vfxReady = null; if (G) G.errors.push(String(e)); });
    }
    return vfxReady;
  }
  function preload(ids, G) {
    return Promise.all((ids || Object.keys(BY_ID)).map(function (id) { return loadBuf(id); }).concat([loadAudio(), loadVfx(G || HX.game)]));
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

  // ---------- một con cá mập ----------
  var sid = 0;
  function Shark(G, sp, x, y) {
    this.id = 'shark' + (++sid);
    this.G = G; this.sp = sp; this.ai = aiOf(sp);
    this.hp = sp.hp; this.maxHp = sp.hp;
    this.pos = { x: x, y: y };
    this.vel = { x: 0, y: 0 };
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.flip = this.facing;
    // [ĐỀ XUẤT] thân dày ±0,8 m theo z: lùi sau mặt chơi để Dave (z 0,1) và mũi xiên luôn vẽ trước thân cá
    this.z = -0.9;
    this.fu = { flash: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Vector4(0, 0, 0, 0) } };
    this.buffs = {}; this.slow = 1;
    this.root = new THREE.Group();       // vị trí
    this.yaw = new THREE.Group();        // quay trái/phải (mô hình gốc quay đầu về +x)
    this.pitch = new THREE.Group();      // ngóc lên/chúi xuống theo hướng bơi
    this.root.add(this.yaw); this.yaw.add(this.pitch);
    G.gfx.scene.add(this.root);
    var b = sp.model.bounds;             // [minX, minY, maxX, maxY] tư thế nghỉ, m, mặt về +x
    this.hw = (b[2] - b[0]) / 2 * 0.85; this.hh = (b[3] - b[1]) / 2 * 0.8;
    this.cx = (b[0] + b[2]) / 2; this.cy = (b[1] + b[3]) / 2;
    this.radius = Math.max(0.2, Math.min(this.hw, this.hh));
    this.mouth = sp.model.mouth || [b[2], 0];
    this.target = null; this.retarget = 0;
    this.biteCd = 0; this.chargeCd = 0; this.angry = 0; this.flashT = 0; this.turnT = -1;
    this.leader = null; this.offset = null;
    this.mixer = null; this.actions = {}; this.cur = null; this.role = null; this.timeScale = 1;
    this.motion = null; this.sfx = null; this.freezeAnim = false; this.fxPlays = [];
    this.state = null; this.st = 0; this.data = {};
    this.go('wander');
    var self = this;
    parse(sp.id).then(function (gltf) { self.attach(gltf); }, function (e) { G.errors.push(String(e)); });
    loadAudio();
    loadVfx(G);
  }

  Shark.prototype.attach = function (gltf) {
    if (this.removed) return;
    var self = this, id = this.sp.id;
    gltf.scene.traverse(function (o) {
      if (!o.isMesh) return;
      o.material = sharkMaterial(id, o.material, self.fu);
      o.frustumCulled = false;
    });
    this.pitch.add(gltf.scene);
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach(function (c) { self.actions[c.name] = self.mixer.clipAction(c); });
    var want = this.role || 'swim';
    this.role = null;
    this.play(want, this.wantOpts);
  };

  // Chạy clip theo vai. opts: once (không lặp, giữ khung cuối), speed, fade (giây), restart.
  Shark.prototype.play = function (role, opts) {
    opts = opts || {};
    var name = clipOf(this.sp, role);
    // đang quay đầu: vai mới chờ tới hết clip quay; opts.force (đòn, chết, mắc xiên) cắt ngang
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
    var info = this.sp.model.clips[name] || {};
    this.stopFx();
    this.sfx = info.sfx || info.fx ? { list: info.sfx || [], fx: info.fx || [], last: -1 } : null;
    this.motion = opts.motion && info.motion ? { seq: info.motion, t: 0 } : null;
    return name;
  };
  // Đòn của loài: loài có QTE_ReadyAble (vây trắng, vây đen, đồng, hổ, mũi cưa, cắt bánh quy, mang xếp) lao bằng clip
  // QTE_Ready gốc; loài khác (vằn, đuôi dài, búa, miệng to) dùng clip Attack của controller.
  Shark.prototype.attackRole = function () {
    return this.sp.model.ai && this.sp.model.ai.abilities && this.sp.model.ai.abilities.qte && clipOf(this.sp, 'lunge') ? 'lunge' : 'attack';
  };
  Shark.prototype.clipLen = function (role) {
    var c = this.sp.model.clips[clipOf(this.sp, role)];
    return c ? c.len : 0;
  };
  Shark.prototype.setFrozenAnim = function (on) {
    this.freezeAnim = on;
    if (this.cur) this.cur.timeScale = on ? 0 : this.timeScale;
  };

  Shark.prototype.go = function (name, data) {
    this.state = name; this.st = 0; this.data = data || {};
    var S = STATES[name];
    if (S.enter) S.enter(this, this.G);
  };

  // Tâm thân cá: khung bao gốc lật theo hướng.
  Shark.prototype.center = function () { return { x: this.pos.x + this.cx * this.flip, y: this.pos.y + this.cy }; };
  Shark.prototype.mouthAt = function () { return { x: this.pos.x + this.mouth[0] * this.flip, y: this.pos.y + this.mouth[1] }; };
  Shark.prototype.hitTest = function (x, y, pad) {
    var c = this.center(), ex = (x - c.x) / (this.hw + pad), ey = (y - c.y) / (this.hh + pad);
    return ex * ex + ey * ey <= 1;
  };
  Shark.prototype.alive = function () { return !STATES[this.state].limp; };
  Shark.prototype.corpse = function () { return !!STATES[this.state].corpse; };
  Shark.prototype.carvable = function () { return this.sp.size >= T.harvest.carveSize; };

  // Cùng luật chết của Fish.prototype.die: cá mập cỡ 2 (xả thịt) chết trên dây vẫn thành xác nằm lại.
  Shark.prototype.die = function (onRope) {
    this.hp = 0;
    this.clearBuffs();
    this.go(onRope && !this.carvable() ? 'hauled' : 'dying');
  };

  Shark.prototype.dot = function (n) {
    if (!this.alive() || n <= 0) return false;
    this.hp -= n;
    this.flashT = 0.08;
    var c = this.center();
    this.G.fx.spawn('blood', c.x, c.y, this.z + 0.9, 0, 0, 0.4 + this.sp.size * 0.3);
    if (this.hp <= 0) { this.die(this.state === 'hooked'); return true; }
    return false;
  };

  // ---------- bùa (BuffDebuffEffect gốc), cùng bảng với js/fish.js ----------
  var BUFFS = {
    shock: {
      slow: function (b) { return Math.max(0, 1 + b.spec.v[0]); },
      tick: function (f) { f.G.audio.play('gear_paralysis_zap', { vol: 0.7 }); f.flashT = 0.1; },
    },
    poison: { tick: function (f, b) { f.G.audio.play('gear_poison_tick', { vol: 0.6 }); f.dot(b.spec.v[0]); } },
    burn: {
      start: function (f) { f.G.audio.play('gear_fire_burn', { vol: 0.8 }); },
      end: function (f, b) { f.dot(b.dmg); },
    },
    freeze: {
      start: function (f) { f.G.audio.play('gear_ice_freeze', { vol: 0.8 }); if (f.state !== 'hooked') f.go('iced', { x: f.pos.x, y: f.pos.y }); },
      end: function (f) { if (f.state === 'iced') f.go('wander'); },
    },
  };
  Shark.prototype.addBuff = function (kind, spec, extra) {
    var K = BUFFS[kind], G = this.G;
    if (!K || !this.alive()) return null;
    this.endBuff(kind, true);
    var b = { kind: kind, spec: spec, t: 0, next: spec.tick > 0 ? spec.tick : Infinity, plays: [] };
    for (var k in extra) b[k] = extra[k];
    var self = this, sc = this.sp.scale || 1, alive = function () { return self.buffs[kind] === b && self.root.parent; };
    if (spec.vfxBody) b.plays.push(G.fx.play(G.fx.dive(spec.vfxBody), 0, 0, { z: 0.2, scale: sc, name: 'buff:' + kind, follow: function () { return alive() ? self.center() : null; } }));
    if (b.vfx) b.plays.push(G.fx.play(G.fx.dive(b.vfx), 0, 0, { z: 0.22, scale: sc, name: b.vfx, follow: function () { return alive() ? self.center() : null; } }));
    if (spec.vfxHead) b.plays.push(G.fx.play(G.fx.dive(spec.vfxHead), 0, 0, { z: 0.25, scale: sc, name: 'buffHead:' + kind, follow: function () {
      if (!alive()) return null;
      var c = self.center();
      return { x: c.x, y: c.y + self.hh * 0.6 };
    } }));
    this.buffs[kind] = b;
    if (K.start) K.start(this, b);
    this.buffLook();
    return b;
  };
  Shark.prototype.endBuff = function (kind, silent) {
    var b = this.buffs[kind];
    if (!b) return;
    delete this.buffs[kind];
    b.plays.forEach(function (p) { if (p) p.stop(); });
    if (!silent && BUFFS[kind].end) BUFFS[kind].end(this, b);
    this.buffLook();
  };
  Shark.prototype.clearBuffs = function () { for (var k in this.buffs) this.endBuff(k, true); };
  Shark.prototype.buffLook = function () {
    var t = null, slow = 1;
    for (var k in this.buffs) {
      var b = this.buffs[k];
      if (b.spec.tint) t = b.spec.tint;
      if (BUFFS[k].slow) slow *= BUFFS[k].slow(b);
    }
    this.fu.tint.value.set(t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? t[3] : 0);
    this.slow = slow;
  };
  Shark.prototype.updateBuffs = function (dt) {
    for (var k in this.buffs) {
      var b = this.buffs[k], K = BUFFS[k];
      b.t += dt;
      while (b.t >= b.next && b.next <= b.spec.duration + 1e-6 && this.buffs[k] === b) {
        b.next += b.spec.tick;
        if (K.tick) K.tick(this, b);
      }
      if (this.buffs[k] === b && b.t >= b.spec.duration) this.endBuff(k);
    }
  };

  Shark.prototype.sleep = function (t) {
    if (!this.alive() || this.state === 'hooked') return false;
    this.go('sleep', { time: t, x: this.pos.x, y: this.pos.y });
    return true;
  };

  // Trả 'dead' | 'tug' | 'alive', như Fish.prototype.damage.
  Shark.prototype.damage = function (n, fromX, fromY, byHarpoon) {
    var ice = this.buffs.freeze;
    if (ice) {
      n += ice.spec.v[0];
      var cc = this.center(), G0 = this.G, t0 = G0.t;
      G0.fx.play(G0.fx.dive('VFX_Debuff_Freezing_Broken_01'), cc.x, cc.y, { z: 0.2, scale: this.sp.scale || 1, name: 'iceBreak',
        follow: function () { return G0.t - t0 < 1 ? cc : null; } });
      G0.audio.play('gear_ice_break');
      this.endBuff('freeze', true);
      if (this.state === 'iced') { this.setFrozenAnim(false); this.state = 'wander'; }
    }
    this.hp -= n;
    this.flashT = 0.12;
    var G = this.G, c = this.center();
    G.fx.spawn('blood', c.x, c.y, 0.2, 0, 0, 0.6 + this.sp.size * 0.4);
    if (this.hp <= 0) { this.die(byHarpoon); return 'dead'; }
    if (byHarpoon && this.sp.size >= T.tug.minSize && this.hp <= this.maxHp * T.tug.triggerHpFrac) return 'tug';
    this.angry = FT.angryTime;
    this.biteCd = Math.min(this.biteCd, 1);
    if (this.state !== 'attack' && this.state !== 'charge') this.go('chase', { hurt: true });
    return 'alive';
  };

  Shark.prototype.steer = function (tx, ty, speed, dt, turn) {
    speed *= this.slow;
    var dx = tx - this.pos.x, dy = ty - this.pos.y, l = Math.hypot(dx, dy) || 1;
    var k = Math.min(1, (turn || 2) * dt);
    this.vel.x += (dx / l * speed - this.vel.x) * k;
    this.vel.y += (dy / l * speed - this.vel.y) * k;
    return l;
  };

  // Chạm vách: dội lại như cá thường. Đầu cá mập dài nên dò trước bằng nửa thân.
  Shark.prototype.integrate = function (dt, dx, dy) {
    var W = this.G.world;
    dx = dx == null ? this.vel.x * dt : dx; dy = dy == null ? this.vel.y * dt : dy;
    var nx = this.pos.x + dx, ny = this.pos.y + dy, l = Math.hypot(dx, dy);
    var ahead = this.hw * 0.7;
    var px = nx + (l > 1e-6 ? dx / l : this.flip) * ahead, py = ny + (l > 1e-6 ? dy / l : 0) * ahead;
    if (W.solid(px, py) || W.solid(nx, ny) || ny > T.water.surfaceY - 1) {
      this.vel.x *= -0.5; this.vel.y *= -0.5;
      this.target = null;
      return false;
    }
    this.pos.x = nx; this.pos.y = ny;
    return true;
  };

  Shark.prototype.pickTarget = function (range) {
    var W = this.G.world;
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * Math.PI * 2, r = range * (0.5 + Math.random() * 0.5);
      var tx = this.pos.x + Math.cos(a) * r, ty = this.pos.y + Math.sin(a) * r * 0.35;
      if (ty > T.water.surfaceY - 2) continue;
      if (!W.open(tx, ty, this.hh + 0.3) || W.raycast(this.pos.x, this.pos.y, tx, ty)) continue;
      this.target = { x: tx, y: ty };
      this.retarget = 4 + Math.random() * 4;
      return;
    }
    this.target = { x: this.pos.x - this.vel.x * 3, y: this.pos.y - this.vel.y * 3 };
    this.retarget = 1.5;
  };

  // Dave có trong tầm nhìn (không bị vách che) và còn đánh được.
  Shark.prototype.seesDave = function (range) {
    var G = this.G, d = G.diver;
    if (!d || d.state === 'dead' || G.phase !== 'dive') return false;
    var m = this.mouthAt();
    return Math.hypot(d.pos.x - m.x, d.pos.y - m.y) < range && !G.world.raycast(m.x, m.y, d.pos.x, d.pos.y);
  };

  // Hướng cần quay mặt: đổi chiều thì chạy clip SwimTurn gốc (xoay 180° trong clip), hết clip mới lật hướng.
  Shark.prototype.face = function (want) {
    if (want === this.facing || this.turnT >= 0) return;
    var len = this.clipLen('turn');
    if (!len || !this.mixer) { this.facing = want; return; }
    this.turnT = 0; this.turnLen = len; this.turnTo = want; this.turnBack = this.role; this.turnOpts = { speed: this.timeScale };
    this.play('turn', { once: true, fade: 0.15 });
  };
  Shark.prototype.updateTurn = function (dt) {
    if (this.turnT < 0) return;
    this.turnT += dt * this.timeScale;
    if (this.turnT < this.turnLen) return;
    this.turnT = -1;
    // khung cuối clip quay (nút Root/Transform xoay 180°) trùng tư thế nghỉ của hướng mới: lật ngay, không trộn
    this.facing = this.flip = this.turnTo;
    var o = this.turnOpts || {};
    this.play(this.turnBack && this.turnBack !== 'turn' ? this.turnBack : 'swim', { fade: 0, speed: o.speed, once: o.once, motion: o.motion });
  };
  Shark.prototype.turning = function () { return this.turnT >= 0; };
  // Cắt ngang lúc quay: quá nửa clip thì coi như đã quay xong.
  Shark.prototype.cancelTurn = function () {
    if (this.turnT < 0) return;
    if (this.turnT > this.turnLen / 2) this.facing = this.flip = this.turnTo;
    this.turnT = -1;
  };

  // Root motion của clip gốc (dời nút Root/Transform, rip_shark.py tách ra `motion`): cú lao của đòn cắn / quật đuôi.
  Shark.prototype.updateMotion = function (dt) {
    var m = this.motion;
    if (!m) return;
    var seq = m.seq, t0 = m.t, t1 = m.t + dt * this.timeScale * (this.freezeAnim ? 0 : 1);
    m.t = t1;
    var a = sampleMotion(seq, t0), b = sampleMotion(seq, t1);
    var dx = (b[0] - a[0]), dy = (b[1] - a[1]), ang = this.pitch.rotation.z;
    var wx = (dx * Math.cos(ang) - dy * Math.sin(ang)) * this.flip, wy = dx * Math.sin(ang) + dy * Math.cos(ang);
    if (wx || wy) this.integrate(dt, wx, wy);
    if (t1 >= seq[seq.length - 1][0]) this.motion = null;
  };
  function sampleMotion(seq, t) {
    if (t <= seq[0][0]) return [seq[0][1], seq[0][2]];
    for (var i = 1; i < seq.length; i++) {
      if (t <= seq[i][0]) {
        var p = seq[i - 1], q = seq[i], k = (t - p[0]) / Math.max(1e-6, q[0] - p[0]);
        return [p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
      }
    }
    var e = seq[seq.length - 1];
    return [e[1], e[2]];
  }

  // Tiếng (AniClipSoundEvent gốc) và hạt gắn xương gắn theo clip: phát khi thời gian clip vượt mốc.
  // Clip lặp vòng thì tiếng phát lại mỗi vòng; hạt gốc là cụm lặp nên chỉ bật một lần cho tới khi đổi clip.
  Shark.prototype.updateSfx = function (onScreen) {
    var s = this.sfx;
    if (!s || !this.cur) return;
    var t = this.cur.time, wrapped = t < s.last;
    if (wrapped) { s.last = -1; s.fxDone = true; }
    for (var i = 0; i < s.list.length; i++) {
      var e = s.list[i];
      if (e[0] > s.last && e[0] <= t && onScreen) this.G.audio.play(e[1], { vol: (SH.audio[e[1]] || {}).vol || 1 });
    }
    if (!s.fxDone && VFX) {
      for (var k = 0; k < s.fx.length; k++) {
        var f = s.fx[k];
        if (f[0] > s.last && f[0] <= t) this.playFx(f[1], f[2]);
      }
    }
    s.last = t;
  };
  // Hạt bám một xương: vị trí thế giới của xương mỗi khung; hướng theo thân cá (xoay của xương quanh trục nhìn bỏ qua) [ĐỀ XUẤT].
  Shark.prototype.playFx = function (key, bone) {
    var rec = VFX[key], node = this.root.getObjectByName(bone.replace(/[ .]/g, '_')) || this.pitch;
    if (!rec) return;
    var self = this, v = new THREE.Vector3();
    var p = this.G.fx.play(rec, this.pos.x, this.pos.y, { z: 0.2, scale: this.sp.scale || 1, name: 'shark:' + key, follow: function () {
      if (self.removed || (p && p.sharkDead)) return null;
      node.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z + 0.3, angle: (self.facing > 0 ? 0 : Math.PI) + self.pitch.rotation.z * self.facing };
    } });
    if (p) this.fxPlays.push(p);
  };
  Shark.prototype.stopFx = function () {
    (this.fxPlays || []).forEach(function (p) { p.sharkDead = true; p.stop(); });
    if (this.fxPlays) this.fxPlays.length = 0;
  };

  Shark.prototype.update = function (dt, onScreen) {
    var G = this.G;
    this.st += dt;
    this.biteCd = Math.max(0, this.biteCd - dt);
    this.chargeCd = Math.max(0, this.chargeCd - dt);
    this.angry = Math.max(0, this.angry - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.updateBuffs(dt);
    var S = STATES[this.state];
    if (!(this.frozen && S.idle)) S.update(this, G, dt);
    this.updateTurn(dt);
    this.updateMotion(dt);
    if (!S.limp && !this.turning() && Math.abs(this.vel.x) > 0.15) this.face(this.vel.x > 0 ? 1 : -1);
    // ngóc/chúi theo vận tốc dọc (cá mập gốc xoay thân theo hướng bơi, RotateSpeed ~50°/s)
    if (!S.keepPitch) {
      var want = 0;
      if (!S.limp && !this.turning()) want = Math.max(-0.5, Math.min(0.5, Math.atan2(this.vel.y, Math.abs(this.vel.x) + 0.5)));
      this.pitch.rotation.z += (want - this.pitch.rotation.z) * Math.min(1, dt * 2.5);
    }
    this.flip = this.facing;
    this.root.position.set(this.pos.x, this.pos.y, this.z);
    this.yaw.rotation.y = this.facing > 0 ? 0 : Math.PI;
    this.fu.flash.value = this.flashT > 0 ? 0.6 : 0;
    this.root.visible = onScreen;
    if (this.mixer) this.mixer.update(dt);
    this.updateSfx(onScreen);
  };

  Shark.prototype.remove = function () {
    this.removed = true;
    this.stopFx();
    this.clearBuffs();
    this.G.gfx.scene.remove(this.root);
    if (this.mixer) this.mixer.stopAllAction();
    this.root.traverse(function (o) {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); if (o.skeleton && o.skeleton.boneTexture) o.skeleton.boneTexture.dispose(); }
    });
  };

  // ---------- máy trạng thái ----------
  // idle: bộ kiểm "đóng băng" (f.frozen) giữ đứng yên; limp: không đánh trúng được; corpse: xác, nhặt / xả được.
  var STATES = {
    wander: {
      idle: true,
      enter: function (f) { f.play('swim', { fade: 0.4 }); f.target = null; },
      update: function (f, G, dt) {
        if ((f.angry > 0 || f.biteCd <= 0) && f.seesDave(f.ai.sight)) return f.go('chase');
        f.retarget -= dt;
        if (!f.target || f.retarget <= 0) f.pickTarget(6 + f.hw * 2);
        var l = f.steer(f.target.x, f.target.y, f.ai.swim, dt, 0.8);
        if (l < 0.6) f.target = null;
        f.integrate(dt);
        f.play('swim', { speed: 0.7 + Math.hypot(f.vel.x, f.vel.y) / f.ai.swim * 0.4 });
      },
    },

    // Đuổi theo Dave (bơi nhanh FishBattleSpeedRate); thẳng hàng trong RangeAbleToSprintAttack thì lao tới.
    chase: {
      idle: true,
      enter: function (f) { f.play('cruise', { fade: 0.3 }); },
      update: function (f, G, dt) {
        var d = G.diver, m = f.mouthAt(), dx = d.pos.x - m.x, dy = d.pos.y - m.y, dist = Math.hypot(dx, dy);
        if (d.state === 'dead' || G.phase !== 'dive' || (dist > f.ai.follow && f.angry <= 0)) return f.go('wander');
        f.steer(d.pos.x - f.mouth[0] * f.flip, d.pos.y - f.mouth[1], f.ai.swim * f.ai.battle, dt, 1.4);
        f.integrate(dt);
        var heading = Math.atan2(f.vel.y, f.vel.x), toDave = Math.atan2(dy, dx);
        var off = Math.abs(Math.atan2(Math.sin(toDave - heading), Math.cos(toDave - heading)));
        if (f.chargeCd <= 0 && f.biteCd <= 0 && !f.turning() && dist < f.ai.chargeRange && off < Math.max(f.ai.chargeAngle, 0.35) && dx * f.facing > 0) {
          return f.go('charge', { dx: dx / dist, dy: dy / dist });
        }
      },
    },

    // Lao thẳng (DefaultSprintData.SprintSpeed) tối đa SprintLimitTime; mõm tới sát Dave thì tung đòn.
    charge: {
      enter: function (f, G) {
        f.chargeCd = f.ai.chargeCd;
        f.play('sprint', { fade: 0.15 });
        f.data.reach = Math.max(1.2, Math.min(3, motionLen(f, f.attackRole()) * 0.6));
      },
      update: function (f, G, dt) {
        var d = G.diver, sp = f.ai.chargeSpeed * f.slow, m0 = f.mouthAt();
        // lao gần như thẳng, chỉ bẻ lái nhẹ theo Dave (RotateSpeed gốc ~50°/giây) [ĐỀ XUẤT]
        var tx = d.pos.x - m0.x, ty = d.pos.y - m0.y, tl = Math.hypot(tx, ty) || 1, k = Math.min(1, 1.5 * dt);
        f.data.dx += (tx / tl - f.data.dx) * k; f.data.dy += (ty / tl - f.data.dy) * k;
        f.vel.x += (f.data.dx * sp - f.vel.x) * Math.min(1, 6 * dt);
        f.vel.y += (f.data.dy * sp - f.vel.y) * Math.min(1, 6 * dt);
        if (!f.integrate(dt)) return f.go('chase');
        var m = f.mouthAt();
        if (d.vulnerable() && Math.hypot(d.pos.x - m.x, d.pos.y - m.y) < f.data.reach) return f.go('attack');
        if (f.st >= f.ai.chargeTime) f.go('chase');
      },
    },

    // Đòn cắn / quật đuôi: clip attack gốc kèm cú lao root motion; mõm trúng Dave thì trừ đúng Damage gốc một lần.
    attack: {
      keepPitch: true,
      enter: function (f, G) {
        var name = f.play(f.attackRole(), { once: true, fade: 0.1, motion: true, restart: true, force: true });
        // cú lao đi theo trục thân: ngóc/chúi mõm về phía Dave
        var d = G.diver, m = f.mouthAt();
        f.pitch.rotation.z = Math.max(-0.5, Math.min(0.5, Math.atan2(d.pos.y - m.y, Math.abs(d.pos.x - m.x) + 0.3)));
        f.data.len = (f.sp.model.clips[name] || {}).len || 0.8;
        f.data.hit = false;
        f.vel.x *= 0.3; f.vel.y *= 0.3;
      },
      update: function (f, G, dt) {
        f.vel.x *= Math.exp(-2 * dt); f.vel.y *= Math.exp(-2 * dt);
        if (!f.motion) f.integrate(dt);
        var d = G.diver, m = f.mouthAt();
        if (!f.data.hit) {
          var want = Math.max(-0.5, Math.min(0.5, Math.atan2(d.pos.y - m.y, Math.max(0.3, (d.pos.x - m.x) * f.facing))));
          f.pitch.rotation.z += (want - f.pitch.rotation.z) * Math.min(1, 3 * dt);
        }
        if (!f.data.hit && Math.hypot(d.pos.x - m.x, d.pos.y - m.y) < FT.biteRange + f.radius) {
          f.data.hit = true;
          if (d.hurt(f.sp.damage, m.x, m.y)) { f.biteCd = f.ai.biteCd; G.fx.play(G.fx.dive('bloodDave'), d.pos.x, d.pos.y, { z: 0.15, name: 'sharkBite' }); }
        }
        if (f.st >= f.data.len) f.go(f.data.hit ? 'recover' : 'chase');
      },
    },

    // Sau cú cắn: bơi bỏ đi (runToHomeSpeed) suốt SARageData.ConsistTime rồi lượn tiếp; hết biteSkillCoolTime mới cắn lại.
    recover: {
      idle: true,
      enter: function (f, G) {
        var d = G.diver, dx = f.pos.x - d.pos.x;
        f.data.tx = f.pos.x + (dx >= 0 ? 1 : -1) * 8; f.data.ty = f.pos.y + (Math.random() - 0.5) * 3;
        f.play('dash', { fade: 0.3 });
      },
      update: function (f, G, dt) {
        f.steer(f.data.tx, f.data.ty, f.ai.home, dt, 1.2);
        f.integrate(dt);
        if (f.st >= f.ai.rage) f.go('wander');
      },
    },

    sleep: {
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; f.target = null; f.cancelTurn(); f.setFrozenAnim(true); },
      update: function (f) {
        f.vel.x = 0; f.vel.y = 0;
        f.pos.x = f.data.x; f.pos.y = f.data.y;
        if (f.st >= f.data.time) { f.setFrozenAnim(false); f.go('wander'); }
      },
    },
    iced: {
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; f.target = null; f.cancelTurn(); f.setFrozenAnim(true); },
      update: function (f) {
        f.vel.x = 0; f.vel.y = 0;
        f.pos.x = f.data.x; f.pos.y = f.data.y;
        if (!f.buffs.freeze) { f.setFrozenAnim(false); f.go('wander'); }
      },
    },
    lifted: {
      limp: true,
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; f.target = null; f.cancelTurn(); },
      update: function () {},
    },

    // Mắc xiên, còn sức: vùng vẫy ra xa Dave, dây giữ lại (như cá lớn).
    hooked: {
      enter: function (f) { f.motion = null; f.play('struggle', { speed: 1.4, fade: 0.1, force: true }); },
      update: function (f, G, dt) {
        var d = G.diver, dx = f.pos.x - d.pos.x, dy = f.pos.y - d.pos.y, l = Math.hypot(dx, dy) || 1;
        var wig = Math.sin(f.st * 5) * 0.8;
        f.steer(f.pos.x + dx / l * 2 - dy / l * wig, f.pos.y + dy / l * 2 + dx / l * wig, f.ai.swim * 2, dt, 3);
        f.integrate(dt);
        dx = f.pos.x - d.pos.x; dy = f.pos.y - d.pos.y; l = Math.hypot(dx, dy) || 1;
        var max = T.harpoon.range;
        if (l > max) { f.pos.x = d.pos.x + dx / l * max; f.pos.y = d.pos.y + dy / l * max; }
      },
    },

    // Chết trên dây xiên (chỉ loài không xả thịt, như cá mập cắt bánh quy cỡ 1): dây kéo về tay Dave.
    hauled: {
      limp: true,
      enter: function (f) {
        f.cancelTurn(); f.motion = null;
        if (f.data.alive) f.setFrozenAnim(true); else f.play('die', { once: true, fade: 0.1, force: true });
        f.vel.x = 0; f.vel.y = 0;
      },
      update: function () {},
    },

    // Chết rời: phát hết clip Die gốc (3,5 giây), trôi chậm lại rồi thành xác.
    dying: {
      limp: true, corpse: true,
      enter: function (f) {
        f.cancelTurn(); f.motion = null; f.target = null;
        f.setFrozenAnim(false);
        f.play('die', { once: true, fade: 0.15, force: true });
        f.data.len = f.clipLen('die');
      },
      update: function (f, G, dt) {
        f.vel.x *= Math.exp(-2 * dt); f.vel.y *= Math.exp(-2 * dt);
        f.integrate(dt);
        if (f.st >= f.data.len) f.go('dead');
      },
    },
    // Xác: giữ khung cuối clip Die, nổi lên từ từ, quá T.harvest.corpseTime thì tan.
    dead: {
      limp: true, corpse: true,
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; },
      update: function (f, G, dt) {
        f.vel.x = 0; f.vel.y = T.harvest.floatSpeed;
        f.integrate(dt);
        if (f.st >= T.harvest.corpseTime) f.go('reeled');
      },
    },
    // Vào túi hoặc tan: mờ dần 0,2 giây rồi bộ sinh cá gỡ khỏi cảnh.
    reeled: {
      limp: true,
      enter: function (f) {
        f.root.traverse(function (o) { if (o.isMesh) { o.material.transparent = true; o.material.depthWrite = false; } });
      },
      update: function (f) { f.fu.opacity.value = Math.max(0, 1 - f.st / 0.2); },
    },
  };

  function motionLen(f, role) {
    var c = f.sp.model.clips[clipOf(f.sp, role)];
    if (!c || !c.motion) return 0;
    var e = c.motion[c.motion.length - 1];
    return Math.hypot(e[1], e[2]);
  }

  // Ảnh nhỏ cho thẻ bắt cá, màn kết quả, tủ cá: ItemIcon "<tên>_Thumbnail" gốc (64 px, rip_shark.py phóng ×3).
  function iconFor(gfx, sp) { return sp.model.icon || ''; }

  // Cá mập vào sổ loài chung: túi cá, thẻ bắt cá, màn kết quả, tủ cá và quán tra HX.fish.BY_ID, tên và ảnh qua HX.fish.
  // Không vào HX.fish.SPECIES (danh sách bộ sinh cá Spine).
  if (HX.fish) {
    Object.keys(BY_ID).forEach(function (id) { HX.fish.BY_ID[id] = BY_ID[id]; });
    var fishIcon = HX.fish.iconFor, fishName = HX.fish.displayName;
    HX.fish.iconFor = function (gfx, sp) { return sp && sp.shark ? iconFor(gfx, sp) : fishIcon(gfx, sp); };
    HX.fish.displayName = function (sp) { return sp && sp.shark ? sp.vi : fishName(sp); };
  }

  function create(G, id, x, y, opts) {
    var rec = BY_ID[id];
    if (!rec) throw new Error('shark species not found: ' + id);
    var sp = opts && opts.night && rec.model.night ? speciesOf(rec.model, true) : rec;
    return new Shark(G, sp, x, y);
  }

  // TID gốc (FishInfoData, cột tid của bộ sinh cá) -> { id, night } hoặc null nếu không phải cá mập đã bóc.
  var BY_TID = {};
  SH.species.forEach(function (r) {
    (r.tids || [r.tid]).forEach(function (t) { BY_TID[t] = { id: r.id, night: !!(r.night && r.night.tid === t) }; });
  });
  function forTid(tid) { return BY_TID[tid] || null; }

  HX.Shark = { create: create, forTid: forTid, preload: preload, BY_ID: BY_ID, ids: Object.keys(BY_ID), iconFor: iconFor, clipOf: clipOf, aiOf: aiOf };

  // ---------- ?shark=<loài>[,<loài>…][&sharkNight=1]: thả cá mập cạnh Dave khi bắt đầu lặn (xem riêng, không qua bộ sinh cá) ----------
  var q = new URLSearchParams(location.search), want = q.get('shark');
  if (want) {
    var ids = want === 'all' ? Object.keys(BY_ID) : want.split(',').filter(function (s) { return BY_ID[s]; });
    preload(ids);
    var poll = setInterval(function () {
      var G = HX.game;
      if (!G || G.phase !== 'dive' || !G.diver || !G.fishes || G.diver.state === 'enter') return;
      clearInterval(poll);
      ids.forEach(function (id, i) {
        var d = G.diver.pos, W = G.world;
        for (var k = 0; k < 24; k++) {
          var x = d.x + (k % 2 ? -1 : 1) * (5 + i * 3 + (k >> 1) * 0.7), y = d.y - 1 - (k >> 2) * 0.8;
          if (W.open(x, y, 1.2)) { G.fishes.list.push(create(G, id, x, y, { night: q.get('sharkNight') === '1' })); return; }
        }
      });
    }, 250);
  }
})(window.HX = window.HX || {});
