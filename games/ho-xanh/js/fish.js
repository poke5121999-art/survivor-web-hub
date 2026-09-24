// Cá: dữ liệu Spine gốc, máy trạng thái hành vi, và bộ sinh cá quanh camera.
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
      '\nuniform sampler2D map; uniform float flash; uniform float opacity;',
      'varying vec2 vUv; varying vec4 vColor; varying vec3 vW; varying float vD;',
      'void main() { vec4 c = texture2D(map, vUv) * vColor; if (c.a < 0.04) discard;',
      '  c.rgb = mix(c.rgb, vec3(1.0, 0.95, 0.9), flash); c.rgb = hxGrade(c.rgb, vW, vD); c.a *= opacity; gl_FragColor = c; }',
    ].join('\n');
  };

  function makeMesh(sp, fu) {
    var mesh = new spine.SkeletonMesh(skelData[sp.id || sp], function (p) {
      p.vertexShader = FISH_VERT;
      p.fragmentShader = FISH_FRAG();
      p.uniforms.flash = fu.flash; p.uniforms.opacity = fu.opacity;
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
    this.fu = { flash: { value: 0 }, opacity: { value: 1 } };
    this.mesh = makeMesh(sp, this.fu);
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

  Fish.prototype.alive = function () { return this.state !== 'dying' && this.state !== 'reeled'; };

  // Trả 'dead' | 'tug' | 'alive'.
  Fish.prototype.damage = function (n, fromX, fromY, byHarpoon) {
    this.hp -= n;
    this.flashT = 0.12;
    var G = this.G, c = this.center();
    G.fx.spawn('blood', c.x, c.y, this.z + 0.05, 0, 0, 0.6 + this.sp.size * 0.4);
    if (this.hp <= 0) { this.hp = 0; return 'dead'; }
    if (byHarpoon && this.sp.size >= T.tug.minSize && this.hp <= this.maxHp * T.tug.triggerHpFrac) return 'tug';
    if (isPuffer(this.sp)) { this.go('defend'); return 'alive'; }
    if (this.sp.damage > 0) { this.angry = FT.angryTime; this.go('chase'); }
    else this.go('flee', { fromX: fromX, fromY: fromY });
    return 'alive';
  };

  Fish.prototype.steer = function (tx, ty, speed, dt, turn) {
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

  Fish.prototype.pickTarget = function (range) {
    var W = this.G.world;
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * Math.PI * 2, r = range * (0.4 + Math.random() * 0.6);
      var tx = this.pos.x + Math.cos(a) * r, ty = this.pos.y + Math.sin(a) * r * 0.45;
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
    // cá bị bộ kiểm "đóng băng" chỉ đứng yên khi còn tự bơi; mắc xiên hay chết thì chạy như thường
    var idle = this.state === 'wander' || this.state === 'flee' || this.state === 'chase' || this.state === 'defend';
    if (!(this.frozen && idle)) FISH_STATES[this.state].update(this, G, dt);

    if (!isJelly(this.sp) && this.state !== 'dying' && this.state !== 'reeled' && Math.abs(this.vel.x) > 0.05) this.facing = this.vel.x > 0 ? 1 : -1;
    this.flip += (this.facing - this.flip) * Math.min(1, dt * 12);
    var tilt = 0;
    if (!isJelly(this.sp) && this.sp.id !== 'Seahorse' && this.state !== 'dying' && this.state !== 'reeled') {
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
        if (f.biteCd <= 0 && Math.hypot(d.pos.x - c.x, d.pos.y - c.y) < FT.biteRange + f.radius) {
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

    // Mắc xiên, còn sức: giãy ra xa Dave, dây giữ lại.
    hooked: {
      enter: function (f) { f.setAnim('sprint', true, 1.4); f.leader = null; },
      update: function (f, G, dt) {
        var d = G.diver, dx = f.pos.x - d.pos.x, dy = f.pos.y - d.pos.y, l = Math.hypot(dx, dy) || 1;
        var wig = Math.sin(f.st * 9) * 0.8;
        f.steer(f.pos.x + dx / l * 2 - dy / l * wig, f.pos.y + dy / l * 2 + dx / l * wig, f.speed * 1.8, dt, 5);
        f.integrate(dt);
        var max = T.harpoon.range;
        if (l > max) { f.pos.x = d.pos.x + dx / l * max; f.pos.y = d.pos.y + dy / l * max; }
      },
    },

    // Chết: phát hoạt ảnh die, bị dây xiên hoặc tay Dave kéo về.
    dying: {
      enter: function (f) { f.setAnim('die', false, 1); f.vel.x = 0; f.vel.y = 0; f.leader = null; },
      update: function (f, G, dt) {
        if (f.data.magnet) {
          var d = G.diver;
          if (f.st > 0.45) {
            var l = f.steer(d.pos.x, d.pos.y, 5, dt, 8);
            f.pos.x += f.vel.x * dt; f.pos.y += f.vel.y * dt;
            if (l < 0.3) G.catchFish(f);
          }
        }
      },
    },

    reeled: {
      enter: function (f) { f.leader = null; },
      update: function (f, G, dt) {
        f.fu.opacity.value = Math.max(0, 1 - f.st / 0.2);
        f.root.scale.y = f.fu.opacity.value;
      },
    },
  };

  // ---------- bộ sinh cá ----------
  function Fishes(G) {
    this.G = G;
    this.list = [];
    this.spawnT = 0;
    this.frozen = false;
  }

  // Cá của đúng vùng đang lặn (A nông, B tầng giữa, C vực sâu); sát ranh giới thì lẫn một ít cá tầng kế bên.
  function pickSpecies(area, rnd) {
    var pool = SPECIES.filter(function (s) { return s.zone === area && s.rank > 0; });
    if (!pool.length) pool = SPECIES.filter(function (s) { return s.zone === 'A' && s.rank > 0; });
    var tot = 0, w = pool.map(function (s) { var x = s.rank >= 3 ? FT.rareWeight : 1; tot += x; return x; });
    var r = rnd() * tot;
    for (var i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  Fishes.prototype.spawnAt = function (sp, x, y) {
    var f = new Fish(this.G, sp, x, y);
    this.list.push(f);
    return f;
  };

  Fishes.prototype.trySpawn = function () {
    var G = this.G, cam = G.gfx.camera.position, W = G.world;
    for (var tries = 0; tries < 10; tries++) {
      var a = Math.random() * Math.PI * 2, r = FT.spawnMin + Math.random() * (FT.spawnMax - FT.spawnMin);
      var x = cam.x + Math.cos(a) * r, y = cam.y + Math.sin(a) * r * 0.7;
      if (y > T.water.surfaceY - 1.2 || y < W.box.minY) continue;
      if (!W.open(x, y, 0.6)) continue;
      var sp = pickSpecies(G.stack.layerAt(y + (Math.random() - 0.5) * 12).area, Math.random);
      var lead = this.spawnAt(sp, x, y);
      if (sp.hp <= FT.schoolMaxHp && sp.size === 0 && Math.random() < 0.6) {
        var n = FT.school[0] + Math.floor(Math.random() * (FT.school[1] - FT.school[0] + 1));
        for (var i = 1; i < n; i++) {
          var ox = (Math.random() - 0.5) * 1.4, oy = (Math.random() - 0.5) * 0.7;
          if (!W.open(x + ox, y + oy, 0.2)) continue;
          var m = this.spawnAt(sp, x + ox, y + oy);
          m.leader = lead; m.offset = { x: ox, y: oy }; m.speed = lead.speed;
        }
      }
      return true;
    }
    return false;
  };

  Fishes.prototype.target = function () {
    var k = Math.min(1, this.G.stack.depth(this.G.gfx.camera.position.y) / 100);
    return Math.round(FT.alive[0] + (FT.alive[1] - FT.alive[0]) * k);
  };

  Fishes.prototype.update = function (dt) {
    var G = this.G, cam = G.gfx.camera.position;
    var hw = G.viewHalf.w + 1.5, hh = G.viewHalf.h + 1.5;
    if (!this.frozen) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.2;
        if (this.list.length < this.target()) this.trySpawn();
      }
    }
    for (var i = this.list.length - 1; i >= 0; i--) {
      var f = this.list[i];
      if (f.state === 'reeled' && f.st > 0.2) { f.remove(); this.list.splice(i, 1); continue; }
      var dx = f.pos.x - cam.x, dy = f.pos.y - cam.y;
      if (!this.frozen && Math.hypot(dx, dy) > FT.despawn && f.state !== 'hooked' && f.state !== 'dying') { f.remove(); this.list.splice(i, 1); continue; }
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
      var res = f.damage(dmg, x, y, false);
      if (res === 'dead') f.go('dying', { magnet: true });
    });
    if (hit) { G.audio.play('melee_hit'); G.shake(0.5); }
  };

  Fishes.prototype.clear = function () {
    this.list.forEach(function (f) { f.remove(); });
    this.list.length = 0;
  };

  // Ảnh nhỏ của cá để bày ở thẻ bắt được và bảng kết quả (bản gốc không có icon cho cá Spine).
  var iconCache = {};
  function iconFor(gfx, sp) {
    if (iconCache[sp.id]) return iconCache[sp.id];
    var b = sp.bounds, u = FT.pxToUnit, w = b[2] * u, h = b[3] * u;
    var px = Math.max(1, Math.round(Math.min(3, 150 / Math.max(b[2], b[3] * 1.6))));
    var W = Math.round(b[2] * px) + 8, H = Math.round(b[3] * px) + 8;
    var fu = { flash: { value: 0 }, opacity: { value: 1 } };
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
