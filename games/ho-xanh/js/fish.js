// Cá: dữ liệu Spine gốc, máy trạng thái hành vi, và bộ sinh cá theo allocator gốc của từng tầng.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, FT = T.fish;
  var SPECIES = window.HX_ASSETS.fish;
  var BY_ID = {};
  SPECIES.forEach(function (s) { BY_ID[s.id] = s; });

  var VI_NAMES = {
    ClownFish: 'Cá hề', Comber: 'Cá mú sọc', Ruby_CardinalFish: 'Cá sơn đỏ', SquareSpot_Anthias: 'Cá anthias đốm vuông',
    Pyramid_butterflyFish: 'Cá bướm kim tự tháp', Yellow_Tang: 'Cá đuôi gai vàng', Blackspot_Seabream: 'Cá tráp đốm đen',
    Juvenile_Circular_BatFish: 'Cá dơi non', Bluetang: 'Cá đuôi gai xanh', Seahorse: 'Cá ngựa',
    Mediterranean_Rainbow_Wrasse: 'Cá bàng chài cầu vồng', Reef_Triggerfish: 'Cá bò rạn', Smallspotted_dart: 'Cá chim đốm nhỏ',
    Yellowback_Fusilier: 'Cá miền lưng vàng', Ornate_Wrasse: 'Cá bàng chài hoa', Longfin_BatFish: 'Cá dơi vây dài',
    Mediterranean_Parrotfish: 'Cá mó Địa Trung Hải', Redtoothed_Triggerfish: 'Cá bò răng đỏ', Black_and_White_Snapper: 'Cá hồng đen trắng',
    Green_Humphead_Parrotfish: 'Cá mó đầu gù', Fried_Egg_Jellyfish: 'Sứa trứng ốp la', Stellate_Puffer: 'Cá nóc sao',
    Red_Lionfish: 'Cá mao tiên đỏ', Titan_Triggerfish: 'Cá bò titan', Box_JellyFish: 'Sứa hộp', Flame_AngelFish: 'Cá thiên thần lửa',
    Asian_Sheepshead: 'Cá bàng chài đầu bướu', Emperor_AngelFish: 'Cá thiên thần hoàng đế', Whiteleg_Shrimp: 'Tôm thẻ chân trắng',
    Striped_Catfish: 'Cá da trơn sọc', Longspine_Porcupinefish: 'Cá nóc nhím gai dài', Longspine_Squirrelfish: 'Cá sơn đá gai dài',
    Clearfin_Lionfish: 'Cá mao tiên vây trong', Bluehead_Tilefish: 'Cá đổng đầu xanh', Warty_Frogfish: 'Cá ếch sần',
    Painted_Comber: 'Cá mú vẽ', Bigeye_Scad: 'Cá nục mắt to', Red_Mullet: 'Cá phèn đỏ', Mackerel_Scad: 'Cá nục thu',
    Harlequin_hind: 'Cá mú hề', Bigeye_Trevally: 'Cá khế mắt to', Coral_Trout: 'Cá mú chấm', Grey_Triggerfish: 'Cá bò xám',
    Atlantic_Bonito: 'Cá ngừ sọc', White_Trevally: 'Cá khế trắng', CuttleFish: 'Mực nang', Dusky_Grouper: 'Cá mú nâu',
    Atlantic_Mackerel: 'Cá thu Đại Tây Dương', Giant_Trevally: 'Cá khế vây vàng', Great_Barracuda: 'Cá nhồng lớn',
    Atlantic_Anglerfish: 'Cá vây chân', Devil_ScorpionFish: 'Cá mù làn quỷ', Blackfin_Barracuda: 'Cá nhồng vây đen', SpearSquid: 'Mực ống giáo',
    Chambered_Nautilus: 'Ốc anh vũ', Fangtooth: 'Cá răng nanh', GreatSpiderCrab: 'Cua nhện khổng lồ', Clione: 'Thiên thần biển',
    Sea_Toad: 'Cá cóc biển', Pacificfanfish: 'Cá quạt Thái Bình Dương', Threetooth_Puffer: 'Cá nóc ba răng', Comb_Jelly: 'Sứa lược',
    Bloodbelly_Comb_Jelly: 'Sứa lược bụng máu', Red_Bream: 'Cá tráp đỏ',
  };

  function displayName(sp) { return VI_NAMES[sp.id] || sp.name.replace(/_/g, ' '); }
  function englishName(sp) { return sp.name.replace(/_/g, ' '); }

  var ANIM_FALLBACK = {
    swim: ['swim', 'idle', 'animation', 'swim2', 'Idle'],
    sprint: ['sprint', 'swim', 'idle'],
    die: ['die', 'Die', 'swim', 'idle'],
    idle: ['idle', 'swim', 'animation'],
  };
  function animFor(sp, want) {
    var list = ANIM_FALLBACK[want] || [want];
    for (var i = 0; i < list.length; i++) if (sp.anims[list[i]] != null) return list[i];
    return Object.keys(sp.anims)[0];
  }

  var isJelly = function (sp) { return /Jelly/i.test(sp.id); };
  var isPuffer = function (sp) { return sp.anims.defence_on != null; };

  // ---------- nạp dữ liệu Spine ----------
  var assetMgr = null, skelData = {};

  function loadAll(onProgress) {
    assetMgr = assetMgr || new spine.AssetManager('art/');
    var env = window.HX_ASSETS.spineEnv;
    var list = SPECIES.concat(Object.keys(env).map(function (k) { return { id: 'env:' + k, skel: env[k].skel, atlas: env[k].atlas }; }))
      .filter(function (s) { return !skelData[s.id]; });
    list.forEach(function (s) { assetMgr.loadBinary(s.skel); assetMgr.loadTextureAtlas(s.atlas); });
    return new Promise(function (res, rej) {
      (function poll() {
        if (assetMgr.hasErrors()) return rej(new Error('fish asset not found: ' + JSON.stringify(assetMgr.getErrors())));
        var tot = assetMgr.getToLoad() + assetMgr.getLoaded();
        onProgress(tot ? assetMgr.getLoaded() / tot : 1);
        if (!assetMgr.isLoadingComplete()) return setTimeout(poll, 50);
        list.forEach(function (s) {
          var atlas = assetMgr.require(s.atlas);
          var bin = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
          bin.scale = FT.pxToUnit;
          skelData[s.id] = bin.readSkeletonData(assetMgr.require(s.skel));
        });
        res();
      })();
    });
  }

  var FISH_VERT = [
    'attribute vec4 color; varying vec2 vUv; varying vec4 vColor; varying vec3 vW; varying float vD;',
    'void main() { vUv = uv; vColor = color; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;',
    '  vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  var FISH_FRAG = function () {
    return HX.gfx.WATER_GLSL + [
      '\nuniform sampler2D map; uniform float flash; uniform float opacity; uniform vec4 tint;',
      'varying vec2 vUv; varying vec4 vColor; varying vec3 vW; varying float vD;',
      'void main() { vec4 c = texture2D(map, vUv) * vColor; if (c.a < 0.04) discard;',
      // màu phủ của bùa (buffvfxcolor gốc, kênh a là độ phủ)
      '  c.rgb = mix(c.rgb, tint.rgb, tint.a);',
      '  c.rgb = mix(c.rgb, vec3(1.0, 0.95, 0.9), flash); c.rgb = hxGrade(c.rgb, vW, vD); c.a *= opacity; gl_FragColor = c; }',
    ].join('\n');
  };

  function makeMesh(sp, fu) {
    var mesh = new spine.SkeletonMesh(skelData[sp.id || sp], function (p) {
      p.vertexShader = FISH_VERT;
      p.fragmentShader = FISH_FRAG();
      p.uniforms.flash = fu.flash; p.uniforms.opacity = fu.opacity;
      p.uniforms.tint = fu.tint || { value: new THREE.Vector4(0, 0, 0, 0) };
      var w = HX.gfx.water;
      for (var k in w) p.uniforms[k] = w[k];
      p.depthWrite = false;
    });
    mesh.zOffset = 0.0004;
    return mesh;
  }

  // ---------- một con cá ----------
  var fid = 0;
  function Fish(G, sp, x, y) {
    this.id = ++fid;
    this.G = G; this.sp = sp;
    this.hp = sp.hp; this.maxHp = sp.hp;
    this.pos = { x: x, y: y };
    this.vel = { x: 0, y: 0 };
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.flip = this.facing;
    this.z = -0.35 + Math.random() * 0.4;
    this.fu = { flash: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Vector4(0, 0, 0, 0) } };
    this.mesh = makeMesh(sp, this.fu);
    this.buffs = {}; this.slow = 1;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    G.gfx.scene.add(this.root);
    this.anim = null;
    this.target = null; this.retarget = 0;
    this.biteCd = 0; this.angry = 0; this.flashT = 0;
    this.leader = null; this.offset = null;
    this.speed = FT.speed[sp.size] * (0.8 + Math.random() * 0.4) * (isJelly(sp) ? 0.35 : 1) * (sp.id === 'Seahorse' ? 0.4 : 1);
    var b = sp.bounds;
    // mỗi loài một độ phóng riêng trong prefab gốc (×0,6 tới ×2,5)
    var u = FT.pxToUnit * (sp.scale || 1);
    this.hw = b[2] * u / 2; this.hh = b[3] * u / 2;
    this.cx = (b[0] + b[2] / 2) * u; this.cy = (b[1] + b[3] / 2) * u;
    this.radius = Math.max(0.08, Math.min(this.hw, this.hh));
    this.state = null; this.st = 0; this.data = {};
    this.go('wander');
    this.mesh.state.update(Math.random() * 2);
  }

  Fish.prototype.setAnim = function (want, loop, speed) {
    var name = animFor(this.sp, want);
    if (this.anim !== name) {
      this.mesh.state.setAnimation(0, name, loop !== false);
      this.anim = name;
    }
    this.mesh.state.timeScale = speed || 1;
  };

  Fish.prototype.go = function (name, data) {
    this.state = name; this.st = 0; this.data = data || {};
    var S = FISH_STATES[name];
    if (S.enter) S.enter(this, this.G);
  };

  Fish.prototype.center = function () {
    return { x: this.pos.x + this.cx * this.flip, y: this.pos.y + this.cy };
  };

  Fish.prototype.hitTest = function (x, y, pad) {
    var c = this.center(), ex = (x - c.x) / (this.hw + pad), ey = (y - c.y) / (this.hh + pad);
    return ex * ex + ey * ey <= 1;
  };

  // Còn bơi, còn đánh trúng được. Trạng thái `limp` (chết, bị dây kéo, đang tan) thì không.
  Fish.prototype.alive = function () { return !FISH_STATES[this.state].limp; };
  // Xác cá Dave nhặt hoặc xả thịt được.
  Fish.prototype.corpse = function () { return !!FISH_STATES[this.state].corpse; };
  // Cá lớn phải xả thịt; còn lại nhặt.
  Fish.prototype.carvable = function () { return this.sp.size >= T.harvest.carveSize; };

  // Luật duy nhất cho cá chết: cá nhỏ chết trên dây xiên thì dây kéo về túi (hauled);
  // cá lớn phải xả thịt (carvable) chết trên dây, hay cá chết rời (dao, súng, độc), thì thành xác trôi trong nước
  // (dying → dead): Dave bơi lại nhặt, xả thịt hoặc gọi drone. Mũi xiên đọc state sau khi gọi để biết kéo về hay thả ra.
  Fish.prototype.die = function (onRope) {
    this.hp = 0;
    this.clearBuffs();
    this.go(onRope && !this.carvable() ? 'hauled' : 'dying');
  };

  // Sát thương theo thời gian (độc, bỏng): trừ máu, không đổi hành vi. Đang mắc xiên mà chết thì tính là chết trên dây.
  Fish.prototype.dot = function (n) {
    if (!this.alive() || n <= 0) return false;
    this.hp -= n;
    this.flashT = 0.08;
    var c = this.center();
    this.G.fx.spawn('blood', c.x, c.y, this.z + 0.05, 0, 0, 0.4 + this.sp.size * 0.3);
    if (this.hp <= 0) { this.die(this.state === 'hooked'); return true; }
    return false;
  };

  // ---------- bùa trên cá (BuffDebuffEffect gốc) ----------
  // spec = một hàng buff của HX_META.HEADS: { duration, tick, v: [buffvalue1..3], chance, vfxBody, vfxHead, tint }.
  // Mỗi kiểu một dòng: start/tick/end(f, b), slow(b) = hệ số tốc độ bơi. Áp lại cùng kiểu thì làm mới thời gian.
  var BUFFS = {
    // DebuffShock (bufftype 4): bơi chậm (1 + buffvalue1) suốt duration; mỗi tickinterval xẹt điện một lần
    shock: {
      slow: function (b) { return Math.max(0, 1 + b.spec.v[0]); },
      tick: function (f) { f.G.audio.play('gear_paralysis_zap', { vol: 0.7 }); f.flashT = 0.1; },
    },
    // DebuffPoison (bufftype 3): mất buffvalue1 máu mỗi tickinterval giây suốt duration
    poison: {
      tick: function (f, b) { f.G.audio.play('gear_poison_tick', { vol: 0.6 }); f.dot(b.spec.v[0]); },
    },
    // DebuffBurn (bufftype 1): cháy duration giây rồi ăn phần sát thương thêm (tính sẵn ở b.dmg lúc trúng)
    burn: {
      start: function (f) { f.G.audio.play('gear_fire_burn', { vol: 0.8 }); },
      end: function (f, b) { f.dot(b.dmg); },
    },
    // DebuffFreezing (bufftype 10): đông cứng tại chỗ duration giây; bị đánh lúc đông thì vỡ băng, ăn thêm buffvalue1 (Fish.damage)
    freeze: {
      start: function (f) { f.G.audio.play('gear_ice_freeze', { vol: 0.8 }); if (f.state !== 'hooked') f.go('iced', { x: f.pos.x, y: f.pos.y }); },
      end: function (f) { if (f.state === 'iced') { f.mesh.state.timeScale = 1; f.go('wander'); } },
    },
  };

  Fish.prototype.addBuff = function (kind, spec, extra) {
    var K = BUFFS[kind], G = this.G;
    if (!K || !this.alive()) return null;
    this.endBuff(kind, true);
    var b = { kind: kind, spec: spec, t: 0, next: spec.tick > 0 ? spec.tick : Infinity, plays: [] };
    for (var k in extra) b[k] = extra[k];
    var self = this, sc = this.sp.scale || 1;
    // hạt bám thân (tâm cá) và bám đầu (trên lưng cá), phóng theo độ phóng của loài như hạt gắn trong prefab cá gốc
    if (spec.vfxBody) b.plays.push(G.fx.play(G.fx.dive(spec.vfxBody), 0, 0, { z: this.z + 0.2, scale: sc, name: 'buff:' + kind, follow: function () {
      return self.buffs[kind] === b && self.root.parent ? self.center() : null;
    } }));
    // extra.vfx: cụm hạt lặp của đầu xiên (VFX_HarpoonHead_*_A_01) bám thân cá suốt bùa
    if (b.vfx) b.plays.push(G.fx.play(G.fx.dive(b.vfx), 0, 0, { z: this.z + 0.22, scale: sc, name: b.vfx, follow: function () {
      return self.buffs[kind] === b && self.root.parent ? self.center() : null;
    } }));
    if (spec.vfxHead) b.plays.push(G.fx.play(G.fx.dive(spec.vfxHead), 0, 0, { z: this.z + 0.25, scale: sc, name: 'buffHead:' + kind, follow: function () {
      if (self.buffs[kind] !== b || !self.root.parent) return null;
      var c = self.center();
      return { x: c.x, y: c.y + self.hh * 0.6 };
    } }));
    this.buffs[kind] = b;
    if (K.start) K.start(this, b);
    this.buffLook();
    return b;
  };

  // Hết bùa. silent: bỏ đi không chạy end (thay bằng bùa mới cùng kiểu, cá chết, vỡ băng).
  Fish.prototype.endBuff = function (kind, silent) {
    var b = this.buffs[kind];
    if (!b) return;
    delete this.buffs[kind];
    b.plays.forEach(function (p) { if (p) p.stop(); });
    if (!silent && BUFFS[kind].end) BUFFS[kind].end(this, b);
    this.buffLook();
  };
  Fish.prototype.clearBuffs = function () {
    for (var k in this.buffs) this.endBuff(k, true);
  };
  // Màu phủ của bùa có màu, hệ số chậm của mọi bùa.
  Fish.prototype.buffLook = function () {
    var t = null, slow = 1;
    for (var k in this.buffs) {
      var b = this.buffs[k];
      if (b.spec.tint) t = b.spec.tint;
      if (BUFFS[k].slow) slow *= BUFFS[k].slow(b);
    }
    this.fu.tint.value.set(t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? t[3] : 0);
    this.slow = slow;
  };
  Fish.prototype.updateBuffs = function (dt) {
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

  // Đạn gây mê: cá ngủ, đứng yên tại chỗ trong t giây. Mắc xiên hay đã chết thì không ngủ được.
  Fish.prototype.sleep = function (t) {
    if (!this.alive() || this.state === 'hooked') return false;
    this.go('sleep', { time: t, x: this.pos.x, y: this.pos.y });
    return true;
  };

  // Trả 'dead' | 'tug' | 'alive'.
  Fish.prototype.damage = function (n, fromX, fromY, byHarpoon) {
    // cá đang đông đá: vỡ băng, ăn thêm buffvalue1 [DtD DebuffFreezing]
    var ice = this.buffs.freeze;
    if (ice) {
      n += ice.spec.v[0];
      var cc = this.center();
      // cụm gốc có một emitter gốc lặp: phát 1 giây (Duration của các emitter vỡ băng) rồi tắt
      var G0 = this.G, t0 = G0.t;
      G0.fx.play(G0.fx.dive('VFX_Debuff_Freezing_Broken_01'), cc.x, cc.y, { z: this.z + 0.2, scale: this.sp.scale || 1, name: 'iceBreak',
        follow: function () { return G0.t - t0 < 1 ? cc : null; } });
      this.G.audio.play('gear_ice_break');
      this.endBuff('freeze', true);
      if (this.state === 'iced') { this.mesh.state.timeScale = 1; this.state = 'wander'; }
    }
    this.hp -= n;
    this.flashT = 0.12;
    var G = this.G, c = this.center();
    G.fx.spawn('blood', c.x, c.y, this.z + 0.05, 0, 0, 0.6 + this.sp.size * 0.4);
    if (this.hp <= 0) { this.die(byHarpoon); return 'dead'; }
    if (byHarpoon && this.sp.size >= T.tug.minSize && this.hp <= this.maxHp * T.tug.triggerHpFrac) return 'tug';
    if (isPuffer(this.sp)) { this.go('defend'); return 'alive'; }
    if (this.sp.damage > 0) { this.angry = FT.angryTime; this.go('chase'); }
    else this.go('flee', { fromX: fromX, fromY: fromY });
    return 'alive';
  };

  Fish.prototype.steer = function (tx, ty, speed, dt, turn) {
    speed *= this.slow;
    var dx = tx - this.pos.x, dy = ty - this.pos.y, l = Math.hypot(dx, dy) || 1;
    var k = Math.min(1, (turn || 2.5) * dt);
    this.vel.x += (dx / l * speed - this.vel.x) * k;
    this.vel.y += (dy / l * speed - this.vel.y) * k;
    return l;
  };

  Fish.prototype.integrate = function (dt) {
    var W = this.G.world, nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt;
    var ahead = 0.25 + this.hw * 0.6;
    var sp = Math.hypot(this.vel.x, this.vel.y) || 1;
    var px = nx + this.vel.x / sp * ahead, py = ny + this.vel.y / sp * ahead;
    if (W.solid(px, py) || W.solid(nx, ny) || ny > T.water.surfaceY - 0.6) {
      this.vel.x *= -0.5; this.vel.y *= -0.5;
      this.target = null;
      return;
    }
    this.pos.x = nx; this.pos.y = ny;
  };

  // Điểm ngẫu nhiên trong vùng bơi gốc của allocator: quanh một FishWayPoint (bán kính _Range) hoặc trong hộp _limitBoundary.
  function homePoint(h) {
    if (h.box) return { x: h.box[0] + (Math.random() * 2 - 1) * h.box[2], y: h.box[1] + (Math.random() * 2 - 1) * h.box[3] };
    var w = h.wp[Math.floor(Math.random() * h.wp.length)], a = Math.random() * Math.PI * 2, r = w[2] * Math.sqrt(Math.random());
    return { x: w[0] + Math.cos(a) * r, y: w[1] + Math.sin(a) * r };
  }

  Fish.prototype.pickTarget = function (range) {
    var W = this.G.world;
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * Math.PI * 2, r = range * (0.4 + Math.random() * 0.6);
      var tx = this.pos.x + Math.cos(a) * r, ty = this.pos.y + Math.sin(a) * r * 0.45;
      // nửa đầu các lần thử bám vùng bơi gốc; bị vách che hết thì bơi quanh chỗ đang đứng như cũ
      if (this.home && i < 8) { var h = homePoint(this.home); tx = h.x; ty = h.y; }
      if (ty > T.water.surfaceY - 1) continue;
      if (W.solid(tx, ty) || W.raycast(this.pos.x, this.pos.y, tx, ty)) continue;
      this.target = { x: tx, y: ty };
      this.retarget = 2 + Math.random() * 4;
      return;
    }
    this.target = { x: this.pos.x - this.vel.x, y: this.pos.y - this.vel.y };
    this.retarget = 1;
  };

  Fish.prototype.update = function (dt, onScreen) {
    var G = this.G;
    this.st += dt;
    this.biteCd = Math.max(0, this.biteCd - dt);
    this.angry = Math.max(0, this.angry - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.updateBuffs(dt);
    // cá bị bộ kiểm "đóng băng" chỉ đứng yên khi còn tự bơi; mắc xiên hay chết thì chạy như thường
    var idle = this.state === 'wander' || this.state === 'flee' || this.state === 'chase' || this.state === 'defend';
    if (!(this.frozen && idle)) FISH_STATES[this.state].update(this, G, dt);

    var limp = FISH_STATES[this.state].limp;
    if (!isJelly(this.sp) && !limp && Math.abs(this.vel.x) > 0.05) this.facing = this.vel.x > 0 ? 1 : -1;
    this.flip += (this.facing - this.flip) * Math.min(1, dt * 12);
    var tilt = 0;
    if (!isJelly(this.sp) && this.sp.id !== 'Seahorse' && !limp) {
      tilt = Math.atan2(this.vel.y, Math.abs(this.vel.x) + 0.3) * 0.7;
      tilt = Math.max(-0.6, Math.min(0.6, tilt));
    }
    this.root.position.set(this.pos.x, this.pos.y, this.z);
    // ảnh Spine gốc của mọi loài quay đầu về +x
    this.root.scale.set(this.flip * (this.sp.scale || 1), this.sp.scale || 1, 1);
    this.root.rotation.z = tilt * this.facing;
    this.fu.flash.value = this.flashT > 0 ? 0.85 : 0;
    this.root.visible = onScreen;
    if (onScreen) this.mesh.update(dt);
    else this.mesh.state.update(dt);
  };

  Fish.prototype.remove = function () {
    this.clearBuffs();
    this.G.gfx.scene.remove(this.root);
    this.mesh.dispose();
  };

  // ---------- máy trạng thái cá ----------
  var FISH_STATES = {
    wander: {
      enter: function (f) { f.setAnim('swim'); f.target = null; },
      update: function (f, G, dt) {
        var d = G.diver, dx = d.pos.x - f.pos.x, dy = d.pos.y - f.pos.y, dist = Math.hypot(dx, dy);
        var daveOk = d.state !== 'dead' && G.phase === 'dive';
        if (daveOk && f.sp.damage > 0 && (f.sp.aggressive && dist < FT.sight || f.angry > 0)) return f.go('chase');
        if (daveOk && isPuffer(f.sp) && dist < FT.puffRange) return f.go('defend');
        if (daveOk && f.sp.damage === 0 && d.boosting && dist < FT.fleeRange) return f.go('flee', { fromX: d.pos.x, fromY: d.pos.y });
        if (f.leader && f.leader.state === 'wander' && f.leader.root.parent) {
          f.steer(f.leader.pos.x + f.offset.x, f.leader.pos.y + f.offset.y, f.speed * 1.25, dt, 3);
        } else {
          f.leader = null;
          f.retarget -= dt;
          if (!f.target || f.retarget <= 0) f.pickTarget(4 + f.sp.size * 2);
          var l = f.steer(f.target.x, f.target.y, f.speed, dt, 1.6);
          if (l < 0.3) f.target = null;
        }
        if (isJelly(f.sp)) f.vel.y += Math.sin(f.st * 2.2 + f.id) * 0.25 * dt;
        f.integrate(dt);
        f.setAnim('swim', true, 0.6 + Math.hypot(f.vel.x, f.vel.y) / (f.speed + 0.01) * 0.5);
      },
    },

    flee: {
      enter: function (f) { f.setAnim('sprint', true, 1); f.leader = null; },
      update: function (f, G, dt) {
        var dx = f.pos.x - f.data.fromX, dy = f.pos.y - f.data.fromY, l = Math.hypot(dx, dy) || 1;
        f.steer(f.pos.x + dx / l * 3, f.pos.y + dy / l * 1.2, f.speed * FT.sprintMul, dt, 4);
        f.integrate(dt);
        if (f.st > FT.fleeTime) f.go('wander');
      },
    },

    chase: {
      enter: function (f) { f.setAnim('sprint', true, 1); f.leader = null; },
      update: function (f, G, dt) {
        var d = G.diver, dist = Math.hypot(d.pos.x - f.pos.x, d.pos.y - f.pos.y);
        if (d.state === 'dead' || G.phase !== 'dive' || (dist > FT.sight * 1.8 && f.angry <= 0)) return f.go('wander');
        var c = f.center();
        f.steer(d.pos.x, d.pos.y, f.speed * FT.sprintMul * 0.55, dt, 3);
        f.integrate(dt);
        if (f.biteCd <= 0 && d.vulnerable() && Math.hypot(d.pos.x - c.x, d.pos.y - c.y) < FT.biteRange + f.radius) {
          f.biteCd = FT.biteCooldown;
          if (f.sp.anims.bite != null) { f.mesh.state.setAnimation(0, 'bite', false); f.anim = 'bite'; f.mesh.state.addAnimation(0, animFor(f.sp, 'sprint'), true, 0); }
          if (d.hurt(f.sp.damage, c.x, c.y)) f.vel.x *= -0.6;
        }
        if (f.anim === 'bite' && f.mesh.state.getCurrent(0) && f.mesh.state.getCurrent(0).animation.name !== 'bite') f.anim = animFor(f.sp, 'sprint');
      },
    },

    // Cá nóc phồng mình: đứng yên, ai chạm vào thì bị gai đâm.
    defend: {
      enter: function (f) {
        f.mesh.state.setAnimation(0, 'defence_on', false);
        f.mesh.state.addAnimation(0, 'defence_idle', true, 0);
        f.anim = 'defence';
        f.mesh.state.timeScale = 1;
        f.leader = null;
      },
      update: function (f, G, dt) {
        f.vel.x *= Math.exp(-3 * dt); f.vel.y *= Math.exp(-3 * dt);
        f.integrate(dt);
        var d = G.diver, c = f.center();
        if (f.sp.damage > 0 && f.st > 0.3 && Math.hypot(d.pos.x - c.x, d.pos.y - c.y) < FT.puffHit) d.hurt(f.sp.damage, c.x, c.y);
        if (f.st > FT.puffTime && Math.hypot(d.pos.x - f.pos.x, d.pos.y - f.pos.y) > FT.puffRange) {
          f.mesh.state.setAnimation(0, 'defence_off', false);
          f.mesh.state.addAnimation(0, animFor(f.sp, 'swim'), true, 0);
          f.anim = animFor(f.sp, 'swim');
          f.state = 'wander'; f.st = 0; f.target = null;
        }
      },
    },

    // Ngủ vì đạn gây mê: đứng im một chỗ, hoạt ảnh dừng; hết giờ hoặc bị đánh thì tỉnh (damage() đổi trạng thái).
    sleep: {
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; f.leader = null; f.target = null; f.mesh.state.timeScale = 0; },
      update: function (f, G, dt) {
        f.vel.x = 0; f.vel.y = 0;
        f.pos.x = f.data.x; f.pos.y = f.data.y;
        f.mesh.state.timeScale = 0;
        if (f.st >= f.data.time) { f.mesh.state.timeScale = 1; f.go('wander'); }
      },
    },

    // Đông đá (mũi xiên băng): đứng im, hoạt ảnh dừng; bùa freeze hết giờ hoặc bị đánh vỡ thì bơi lại.
    iced: {
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; f.leader = null; f.target = null; f.mesh.state.timeScale = 0; },
      update: function (f) {
        f.vel.x = 0; f.vel.y = 0;
        f.pos.x = f.data.x; f.pos.y = f.data.y;
        f.mesh.state.timeScale = 0;
        if (!f.buffs.freeze) { f.mesh.state.timeScale = 1; f.go('wander'); }
      },
    },

    // Drone đang kéo lên (js/drone.js dời chỗ): nằm im, không đánh trúng được, không nhặt được.
    lifted: {
      limp: true,
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; f.leader = null; f.target = null; },
      update: function () {},
    },

    // Mắc xiên, còn sức: giãy ra xa Dave, dây giữ lại.
    hooked: {
      enter: function (f) { f.setAnim('sprint', true, 1.4); f.leader = null; },
      update: function (f, G, dt) {
        var d = G.diver, dx = f.pos.x - d.pos.x, dy = f.pos.y - d.pos.y, l = Math.hypot(dx, dy) || 1;
        var wig = Math.sin(f.st * 9) * 0.8;
        f.steer(f.pos.x + dx / l * 2 - dy / l * wig, f.pos.y + dy / l * 2 + dx / l * wig, f.speed * 1.8, dt, 5);
        f.integrate(dt);
        // hết dây thì dừng lại; Dave không bị kéo đi
        dx = f.pos.x - d.pos.x; dy = f.pos.y - d.pos.y; l = Math.hypot(dx, dy) || 1;
        var max = T.harpoon.range;
        if (l > max) { f.pos.x = d.pos.x + dx / l * max; f.pos.y = d.pos.y + dy / l * max; }
      },
    },

    // Chết trên dây xiên: phát hoạt ảnh die, harpoon.js kéo về tay Dave.
    hauled: {
      limp: true,
      // data.alive: bắt sống (mũi xiên gây mê), cá ngủ nguyên dáng chứ không chạy hoạt ảnh die
      enter: function (f) { if (f.data.alive) f.mesh.state.timeScale = 0; else f.setAnim('die', false, 1); f.vel.x = 0; f.vel.y = 0; f.leader = null; },
      update: function () {},
    },

    // Chết rời (FishDyingSequence gốc): phát hết hoạt ảnh die, trôi chậm lại rồi thành xác.
    // Loài không có hoạt ảnh die thì đứng hình ngay.
    dying: {
      limp: true, corpse: true,
      enter: function (f) {
        f.leader = null; f.target = null;
        var has = f.sp.anims.die != null;
        f.setAnim('die', false, has ? 1 : 0);
        f.data.len = has ? f.sp.anims.die : 0;
      },
      update: function (f, G, dt) {
        f.vel.x *= Math.exp(-3 * dt); f.vel.y *= Math.exp(-3 * dt);
        f.integrate(dt);
        if (f.st >= f.data.len) f.go('dead');
      },
    },

    // Xác cá: giữ dáng cuối của die, nổi lên từ từ (FloatingValueWhenDead gốc), quá T.harvest.corpseTime thì tan (DeadAndDisappear).
    dead: {
      limp: true, corpse: true,
      enter: function (f) { f.vel.x = 0; f.vel.y = 0; },
      update: function (f, G, dt) {
        f.vel.x = 0; f.vel.y = T.harvest.floatSpeed;
        f.integrate(dt);
        if (f.st >= T.harvest.corpseTime) f.go('reeled');
      },
    },

    // Vào túi hoặc tan đi: mờ dần 0,2 giây rồi bộ sinh cá gỡ khỏi cảnh.
    reeled: {
      limp: true,
      enter: function (f) { f.leader = null; },
      update: function (f, G, dt) {
        f.fu.opacity.value = Math.max(0, 1 - f.st / 0.2);
        f.root.scale.y = f.fu.opacity.value;
      },
    },
  };

  // ---------- bộ sinh cá: allocator gốc ----------
  // HX_FISH_SPAWN (data/fish_spawn.js, tools/rip_fishgroups.py): mỗi zone có `base` (allocator nằm thẳng
  // trong scene) và các preset IGPSet; mỗi lượt lặn bốc một preset cho mỗi tầng như GetRandomIGPSetInfo gốc.
  var SPAWN = window.HX_FISH_SPAWN;

  function weighted(list, w, rnd) {
    var tot = 0, i;
    for (i = 0; i < list.length; i++) tot += w(list[i]);
    var r = rnd() * tot;
    for (i = 0; i < list.length; i++) { r -= w(list[i]); if (r < 0) return list[i]; }
    return list[list.length - 1];
  }

  // Preset còn mở theo ngày (IGPSetConditionType.Day_Min), bốc theo Rate.
  function pickPreset(z, day, rnd) {
    var ok = z.presets.filter(function (p) { return day >= p.day; });
    return ok.length ? weighted(ok, function (p) { return p.rate; }, rnd) : null;
  }

  // Một FishAllocator đặt vào tầng L (toạ độ thế giới). Bốc sẵn prefab cá như instanceType RandomSelect gốc.
  // left: số cá còn sống của allocator trong lượt lặn này; bản gốc không có trường hồi sinh nên chết là mất.
  function Alloc(row, L, rnd) {
    var dy = L.yOff;
    this.x = row.x; this.y = row.y + dy;
    this.near = Math.min(row.near || SPAWN.near, FT.wake);
    this.home = row.b ? { box: [row.x + row.b[0], row.y + dy + row.b[1], row.b[2], row.b[3]] }
      : row.w.length ? { wp: row.w.map(function (w) { return [w[0], w[1] + dy, w[2]]; }) } : null;
    var pf = SPAWN.prefabs[weighted(SPAWN.picks[row.p], function (p) { return p[0]; }, rnd)[1]];
    this.members = pf.fish.map(function (m) { return { tid: row.tid || m[0], dx: m[1], dy: m[2] }; });
    this.left = this.members.length;
    this.fish = [];
  }

  function Fishes(G) {
    this.G = G;
    this.list = [];
    this.frozen = false;
    this.tick = 0;
    this.allocs = [];
    // Cá mập 3D (không có Spine 2D) theo từng tầng, chờ js/shark.js: { zone, tid, name, prefab, x, y, n, home, near, off }.
    // off = tên công tắc nhiệm vụ/sự kiện đang tắt nhóm đó trong prefab gốc (vd BeforeSharkParty), null nếu bật.
    this.sharks = [];
    this.presets = [];
    var self = this, day = HX.save.get().day;
    G.stack.layers.forEach(function (L) {
      var z = SPAWN.zones[L.id], pr = pickPreset(z, day, Math.random);
      self.presets[L.i] = pr ? pr.name : null;
      self.sharks[L.i] = [];
      z.base.concat(pr ? pr.allocs : []).forEach(function (row) {
        // phần scene tầng dưới nhô lên trên mép nối bị tầng trên che, cá ở đó không sinh
        if (row.y + L.yOff > L.yTop) return;
        var a = new Alloc(row, L, Math.random), s = SPAWN.species[a.members[0].tid];
        if (s.shark) {
          self.sharks[L.i].push({ zone: L.id, tid: a.members[0].tid, name: s.name, prefab: s.prefab, x: a.x, y: a.y,
            n: a.members.length, home: a.home, near: row.near || SPAWN.near, off: row.off || null });
          a.shark = HX.Shark.forTid(a.members[0].tid);
          if (a.shark && (!row.off || day >= (FT.sharkSwitch[row.off] || Infinity))) self.allocs.push(a);
        } else if (!row.off && s.id) {
          a.sp = BY_ID[s.id];
          self.allocs.push(a);
        }
      });
    });
    var sharkIds = {};
    this.allocs.forEach(function (a) { if (a.shark) sharkIds[a.shark.id] = 1; });
    if (Object.keys(sharkIds).length) HX.Shark.preload(Object.keys(sharkIds), G);
  }

  Fishes.prototype.spawnAt = function (sp, x, y) {
    var f = new Fish(this.G, sp, x, y);
    this.list.push(f);
    return f;
  };
  Fishes.prototype.spawnShark = function (k, x, y) {
    var f = HX.Shark.create(this.G, k.id, x, y, { night: k.night });
    this.list.push(f);
    return f;
  };

  // Chỗ nước trống gần (x, y) nhất: allocator đặt sát vách thì dời ra theo vòng tròn nở dần.
  function openNear(W, x, y) {
    for (var r = 0; r <= 3; r += 0.5) {
      for (var k = 0; k < (r ? 12 : 1); k++) {
        var a = k / 12 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (py < T.water.surfaceY - 1.2 && W.open(px, py, 0.3)) return { x: px, y: py };
      }
    }
    return null;
  }

  // Sinh nốt số cá còn lại của allocator tại chỗ gốc, mỗi con lệch đúng như con của nó trong prefab Boid.
  Fishes.prototype.wake = function (a) {
    var W = this.G.world, c = openNear(W, a.x, a.y), lead = null;
    if (!c) { a.left = 0; return; }
    for (var i = 0; i < a.left; i++) {
      var m = a.members[i], ox = m.dx, oy = m.dy;
      if (!W.open(c.x + ox, c.y + oy, 0.2)) { ox = 0; oy = 0; }
      var f = a.shark ? this.spawnShark(a.shark, c.x + ox, c.y + oy) : this.spawnAt(a.sp, c.x + ox, c.y + oy);
      f.alloc = a; f.home = a.home;
      a.fish.push(f);
      if (a.shark) continue;
      if (lead) { f.leader = lead; f.offset = { x: ox, y: oy }; f.speed = lead.speed; } else lead = f;
    }
  };

  // Allocator mà mọi con còn bơi đều đã xa camera thì cất cá đi, giữ số con còn sống để lần sau sinh lại đúng chừng ấy.
  function asleep(a, cam) {
    return a.fish.every(function (f) {
      return f.alive() && f.state !== 'hooked' && f.state !== 'lifted' && Math.hypot(f.pos.x - cam.x, f.pos.y - cam.y) > FT.despawn;
    });
  }

  Fishes.prototype.check = function () {
    var cam = this.G.gfx.camera.position;
    for (var i = 0; i < this.allocs.length; i++) {
      var a = this.allocs[i];
      if (a.fish.length) {
        if (asleep(a, cam)) this.drop(a.fish.slice());
      } else if (a.left > 0 && Math.hypot(a.x - cam.x, a.y - cam.y) < a.near) this.wake(a);
    }
  };

  Fishes.prototype.drop = function (fish) {
    var self = this;
    fish.forEach(function (f) {
      var a = f.alloc;
      if (a) {
        a.fish.splice(a.fish.indexOf(f), 1);
        if (!f.alive()) a.left--;
      }
      f.remove();
      self.list.splice(self.list.indexOf(f), 1);
    });
  };

  Fishes.prototype.update = function (dt) {
    var G = this.G, cam = G.gfx.camera.position;
    var hw = G.viewHalf.w + 1.5, hh = G.viewHalf.h + 1.5;
    if (!this.frozen) {
      this.tick -= dt;
      if (this.tick <= 0) { this.tick = 0.25; this.check(); }
    }
    for (var i = this.list.length - 1; i >= 0; i--) {
      var f = this.list[i];
      if (f.state === 'reeled' && f.st > 0.2) { this.drop([f]); continue; }
      var dx = f.pos.x - cam.x, dy = f.pos.y - cam.y;
      f.update(dt, Math.abs(dx) < hw + f.hw && Math.abs(dy) < hh + f.hh);
    }
  };

  Fishes.prototype.knife = function (x, y, r, dmg) {
    var G = this.G, hit = false;
    this.list.forEach(function (f) {
      if (!f.alive() || f.state === 'hooked' || !f.hitTest(x, y, r)) return;
      hit = true;
      var c = f.center();
      G.fx.spawn('hit', c.x, c.y, f.z + 0.1, 0, 0, 0.6);
      f.damage(dmg, x, y, false);
    });
    if (hit) { G.audio.play('melee_hit'); G.shake(0.5); }
  };

  Fishes.prototype.clear = function () {
    this.list.forEach(function (f) { f.remove(); });
    this.list.length = 0;
    this.allocs.forEach(function (a) { a.fish.length = 0; });
  };

  // Ảnh nhỏ của cá để bày ở thẻ bắt được và bảng kết quả (bản gốc không có icon cho cá Spine).
  var iconCache = {};
  function iconFor(gfx, sp) {
    if (iconCache[sp.id]) return iconCache[sp.id];
    var b = sp.bounds, u = FT.pxToUnit, w = b[2] * u, h = b[3] * u;
    var px = Math.max(1, Math.round(Math.min(3, 150 / Math.max(b[2], b[3] * 1.6))));
    var W = Math.round(b[2] * px) + 8, H = Math.round(b[3] * px) + 8;
    var fu = { flash: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Vector4(0, 0, 0, 0) } };
    var mesh = makeMesh(sp, fu);
    mesh.state.setAnimation(0, animFor(sp, 'swim'), true);
    mesh.update(0);
    var scene = new THREE.Scene();
    var grp = new THREE.Group();
    grp.add(mesh);
    var sy = T.water.surfaceY - 0.5;
    grp.position.set(0, sy, 0);
    scene.add(grp);
    var cx = (b[0] + b[2] / 2) * u, cy = sy + (b[1] + b[3] / 2) * u;
    var hx = w / 2 + 4 / px * u, hy = h / 2 + 4 / px * u;
    var cam = new THREE.OrthographicCamera(cx - hx, cx + hx, cy + hy, cy - hy, 0.01, 10);
    cam.position.set(0, 0, 0.5);
    var rt = new THREE.WebGLRenderTarget(W, H);
    var r = gfx.renderer, prev = r.getRenderTarget(), clr = new THREE.Color(); r.getClearColor(clr); var ca = r.getClearAlpha();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
    var buf = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    r.setRenderTarget(prev); r.setClearColor(clr, ca);
    rt.dispose(); mesh.dispose();
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
    for (var y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    iconCache[sp.id] = cv.toDataURL();
    return iconCache[sp.id];
  }

  HX.fish = {
    loadAll: loadAll, Fishes: Fishes, BY_ID: BY_ID, SPECIES: SPECIES, displayName: displayName, englishName: englishName,
    iconFor: iconFor, makeMesh: makeMesh,
  };
})(window.HX = window.HX || {});
