// Vòng đời trò chơi: title → loading → dive → result, cùng input, camera và móc kiểm thử.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, LEVELS = window.HX_LEVELS, A = window.HX_ASSETS;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  var gfx = new HX.gfx.Gfx($('scene'));
  var fx = new HX.Fx(gfx);
  var caustic = gfx.tex('fx/E_Noise_Caustic_01A.png', true);
  caustic.wrapS = caustic.wrapT = THREE.RepeatWrapping;
  HX.gfx.water.uCaustic.value = caustic;

  var G = {
    phase: 'title', gfx: gfx, fx: fx, audio: HX.audio, hud: HX.hud,
    t: 0, shakeT: 0, shakeAmp: 0, shakeOffset: { x: 0, y: 0 }, hitstopT: 0,
    viewHalf: { w: 8, h: 4.5 }, catches: [], levelId: null, errors: [],
  };
  HX.game = G;

  G.shake = function (n) { G.shakeT = Math.max(G.shakeT, 0.18 + 0.1 * n); G.shakeAmp = Math.max(G.shakeAmp, T.fx.shake * n); };
  G.hitstop = function (t) { G.hitstopT = Math.max(G.hitstopT, t); };

  // ---------- nạp tài nguyên ----------
  // Nạp chung bắt đầu ngay khi mở trang; màn loading chỉ gắn vào để đọc tiến độ.
  var shared = null, sharedK = 0, sharedCb = null;
  function loadShared(onProgress) {
    sharedCb = onProgress;
    if (shared) { onProgress(sharedK); return shared; }
    var parts = { fish: 0, img: 0, snd: 0 };
    var report = function () { sharedK = parts.fish * 0.45 + parts.img * 0.25 + parts.snd * 0.3; sharedCb(sharedK); };
    var imgs = [A.dave.sheet, 'fx/HarpoonProjectile.png', 'props/O2Box_Body.png', 'props/O2Box_Head.png'].concat(HX.level.decoImages());
    var nImg = 0;
    var sndKeys = Object.keys(A.audio), nSnd = 0;
    shared = Promise.all([
      HX.fish.loadAll(function (k) { parts.fish = k; report(); }),
      Promise.all(imgs.map(function (r) { return gfx.loadTex(r).then(function () { nImg++; parts.img = nImg / imgs.length; report(); }); }))
        .then(function () { return fx.preload(); })
        .then(function () { return Promise.all(['fx/E_Rays_01A.png', 'fx/LightBeam.png', 'fx/E_Ray_03A.png'].map(function (r) { return gfx.loadTex(r, true); })); }),
      HX.audio.load(sndKeys, function () { nSnd++; parts.snd = nSnd / sndKeys.length; report(); }),
    ]);
    shared.then(function () { sharedK = 1; sharedCb(1); }, function (e) { G.errors.push(String(e)); });
    return shared;
  }

  // ---------- dựng một lượt lặn ----------
  var dive = null;

  function teardown() {
    if (!dive) return;
    HX.audio.stopAll();
    gfx.scene.remove(dive.terrain.root);
    gfx.scene.remove(dive.deco.group);
    dive.deco.spines.forEach(function (s) { s.mesh.dispose(); });
    dive.rays.remove(); dive.dust.remove(); dive.surface.remove(); dive.chests.remove();
    G.fishes.clear();
    G.harpoon.remove();
    G.diver.remove();
    fx.clear();
    dive = null;
  }

  function findSpawn(W, L) {
    if (L.spawn) {
      var sx = L.spawn[0], sy = L.spawn[1];
      return { x: sx, y: W.open(sx, sy + 1.5, 0.3) ? sy + 1.5 : sy };
    }
    for (var i = 0; i < 60; i++) {
      var x = (i % 2 ? 1 : -1) * Math.floor(i / 2) * 1.5, y = T.water.surfaceY - 1.2;
      if (W.open(x, y, 0.5) && W.open(x, y - 3, 0.5) && !W.raycast(x, y, x, y - 3)) return { x: x, y: y };
    }
    return { x: 0, y: T.water.surfaceY - 1.2 };
  }

  // Hòm nào bản gốc đặt lơ lửng thì hạ xuống mặt đá gần nhất bên dưới.
  function chestSpots(W, L) {
    var drop = -A.props['props/O2Box_Body.png'].local[1];
    return L.o2.map(function (o) {
      var hit = W.raycast(o[0], o[1], o[0], o[1] - 3);
      return hit ? [o[0], hit.y + drop] : o;
    });
  }

  function buildDive(levelId, gltf) {
    teardown();
    titleDecoOn(false);
    var L = LEVELS[levelId];
    G.levelId = levelId;
    G.world = new HX.World(L);
    var terrain = HX.level.terrainFrom(gltf);
    gfx.scene.add(terrain.root);
    var deco = HX.level.decorate(G, levelId);
    gfx.scene.add(deco.group);
    dive = {
      terrain: terrain, deco: deco,
      rays: new HX.level.Rays(G), dust: new HX.level.Dust(G), surface: new HX.level.Surface(G),
      chests: new HX.level.Chests(G, chestSpots(G.world, L)),
    };
    G.dive = dive;
    var sp = findSpawn(G.world, L);
    G.catches = [];
    G.fishes = new HX.fish.Fishes(G);
    G.diver = new HX.Diver(G, sp.x, sp.y);
    G.harpoon = new HX.Harpoon(G);
    snapCamera();
    HX.audio.music('bgm_ingame', 0.8);
    HX.audio.loop('amb', 'amb_deep', 0.35);
  }

  // ---------- camera ----------
  function viewHalf() {
    var h = Math.tan(T.view.fov * Math.PI / 360) * gfx.camDist();
    G.viewHalf.h = h; G.viewHalf.w = h * gfx.camera.aspect;
  }

  function camTarget(out) {
    var d = G.diver, lx = 0, ly = 0;
    if (d.state === 'aim' || d.state === 'shoot') {
      lx = (input.aimX - d.pos.x) * T.view.aimLead; ly = (input.aimY - d.pos.y) * T.view.aimLead;
      var l = Math.hypot(lx, ly);
      if (l > T.view.aimLeadMax) { lx *= T.view.aimLeadMax / l; ly *= T.view.aimLeadMax / l; }
    }
    var x = d.pos.x + lx, y = d.pos.y + ly + 0.3, W = G.world.box, vh = G.viewHalf;
    x = Math.max(W.minX + vh.w * 0.6, Math.min(W.maxX - vh.w * 0.6, x));
    y = Math.min(T.water.surfaceY + 1.4 - vh.h, Math.max(W.minY + vh.h * 0.5, y));
    out.x = x; out.y = y;
    return out;
  }

  var camT = { x: 0, y: 0 }, camBase = { x: 0, y: 0 };
  function snapCamera() {
    viewHalf();
    camTarget(camT);
    camBase.x = camT.x; camBase.y = camT.y;
    gfx.camera.position.set(camT.x, camT.y, gfx.camDist());
    gfx.camera.updateMatrixWorld();
  }

  function updateCamera(dt) {
    viewHalf();
    camTarget(camT);
    var k = 1 - Math.exp(-T.view.follow * dt);
    camBase.x += (camT.x - camBase.x) * k; camBase.y += (camT.y - camBase.y) * k;
    G.shakeT = Math.max(0, G.shakeT - dt);
    if (G.shakeT > 0) {
      var a = G.shakeAmp * Math.min(1, G.shakeT / 0.2);
      G.shakeOffset.x = (Math.random() - 0.5) * 2 * a; G.shakeOffset.y = (Math.random() - 0.5) * 2 * a;
    } else { G.shakeOffset.x = G.shakeOffset.y = 0; G.shakeAmp = 0; }
    gfx.camera.position.set(camBase.x + G.shakeOffset.x, camBase.y + G.shakeOffset.y, gfx.camDist());
    gfx.camera.updateMatrixWorld();
    var v = new THREE.Vector3(G.diver.pos.x, G.diver.pos.y, 0).project(gfx.camera);
    HX.gfx.water.uCut.value.set((v.x + 1) / 2 * gfx.rtSize[0], (v.y + 1) / 2 * gfx.rtSize[1], T.view.cutRadius * gfx.rtSize[1] / T.view.height);
  }

  // ---------- input ----------
  var keys = {};
  var input = {
    mx: 0, my: 0, boost: false, dash: false, melee: false, tap: false,
    fireHeld: false, firePressed: false, fireReleased: false,
    sx: innerWidth * 0.7, sy: innerHeight * 0.5, aimX: 0, aimY: 0,
    touch: { stick: null, aim: null, boost: false },
  };
  var edges = { dash: false, melee: false, tap: false, firePressed: false, fireReleased: false };

  function isTouch() { return document.body.classList.contains('touch'); }

  addEventListener('keydown', function (e) {
    if (e.repeat) return;
    keys[e.code] = true;
    HX.audio.unlock();
    if (G.phase === 'dive') {
      if (e.code === 'Space') { edges.dash = true; edges.tap = true; e.preventDefault(); }
      if (e.code === 'KeyF') edges.melee = true;
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    }
    if (e.code === 'KeyM') toggleMute();
    if ((e.code === 'Enter' || e.code === 'Space') && G.phase === 'title') { e.preventDefault(); startDive(); }
  });
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  addEventListener('blur', function () { keys = {}; input.fireHeld = false; });

  var canvas = $('scene');
  canvas.addEventListener('mousemove', function (e) { input.sx = e.clientX; input.sy = e.clientY; });
  canvas.addEventListener('mousedown', function (e) {
    HX.audio.unlock();
    input.sx = e.clientX; input.sy = e.clientY;
    if (G.phase !== 'dive' || paused) return;
    if (e.button === 0) { input.fireHeld = true; edges.firePressed = true; edges.tap = true; }
    if (e.button === 2) { edges.melee = true; edges.tap = true; }
  });
  addEventListener('mouseup', function (e) {
    if (e.button === 0 && input.fireHeld) { input.fireHeld = false; edges.fireReleased = true; }
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Chạm: nửa trái là cần điều khiển, nửa phải giữ để ngắm, thả để bắn.
  function onTouchStart(e) {
    document.body.classList.add('touch');
    HX.audio.unlock();
    if (G.phase !== 'dive' || paused) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.clientX < innerWidth * 0.45 && !input.touch.stick) {
        input.touch.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        showStick(true);
      } else if (!input.touch.aim) {
        input.touch.aim = { id: t.identifier };
        input.sx = t.clientX; input.sy = t.clientY;
        input.fireHeld = true; edges.firePressed = true; edges.tap = true;
      } else edges.tap = true;
    }
    e.preventDefault();
  }
  function onTouchMove(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i], s = input.touch.stick;
      if (s && t.identifier === s.id) { s.x = t.clientX; s.y = t.clientY; }
      if (input.touch.aim && t.identifier === input.touch.aim.id) { input.sx = t.clientX; input.sy = t.clientY; }
    }
    e.preventDefault();
  }
  function onTouchEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (input.touch.stick && t.identifier === input.touch.stick.id) { input.touch.stick = null; showStick(false); }
      if (input.touch.aim && t.identifier === input.touch.aim.id) { input.touch.aim = null; input.fireHeld = false; edges.fireReleased = true; }
    }
  }
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  function showStick(on) {
    var s = input.touch.stick, el = $('stick');
    el.hidden = !on;
    if (on) { el.style.left = s.x0 + 'px'; el.style.top = s.y0 + 'px'; }
  }

  function bindHold(id, on, off) {
    var el = $(id);
    el.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); HX.audio.unlock(); on(); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); if (off) off(); });
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); on(); });
    el.addEventListener('mouseup', function () { if (off) off(); });
  }
  bindHold('tb-boost', function () { input.touch.boost = true; }, function () { input.touch.boost = false; });
  bindHold('tb-dash', function () { edges.dash = true; edges.tap = true; });
  bindHold('tb-knife', function () { edges.melee = true; edges.tap = true; });

  function readInput() {
    var mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my += 1;
    if (keys.KeyS || keys.ArrowDown) my -= 1;
    var s = input.touch.stick;
    if (s) {
      var dx = (s.x - s.x0) / 48, dy = -(s.y - s.y0) / 48, l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      if (l > 0.18) { mx = dx; my = dy; }
      $('stick-knob').style.transform = 'translate(' + (dx * 34).toFixed(1) + 'px,' + (-dy * 34).toFixed(1) + 'px)';
    }
    var l2 = Math.hypot(mx, my);
    if (l2 > 1) { mx /= l2; my /= l2; }
    input.mx = mx; input.my = my;
    input.boost = !!(keys.ShiftLeft || keys.ShiftRight) || input.touch.boost;
    input.dash = edges.dash; input.melee = edges.melee; input.tap = edges.tap;
    input.firePressed = edges.firePressed; input.fireReleased = edges.fireReleased;
    var w = gfx.screenToWorld(input.sx, input.sy);
    input.aimX = w.x; input.aimY = w.y;
    edges.dash = edges.melee = edges.tap = edges.firePressed = edges.fireReleased = false;
  }

  // ---------- tạm dừng & tắt tiếng ----------
  var paused = false;
  function togglePause() {
    if (G.phase !== 'dive') return;
    paused = !paused;
    $('pause').hidden = !paused;
    if (paused) HX.audio.setMuted(true); else HX.audio.setMuted(muted);
  }
  var muted = false;
  try { muted = localStorage.getItem('hx.mute') === '1'; } catch (e) { muted = false; }
  HX.audio.setMuted(muted);
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('hx.mute', muted ? '1' : '0'); } catch (e) { /* bỏ qua */ }
    HX.audio.setMuted(muted);
    $('btn-mute').classList.toggle('off', muted);
    if (!muted && G.phase === 'dive') { HX.audio.music('bgm_ingame', 0.8); HX.audio.loop('amb', 'amb_deep', 0.35); }
  }
  $('btn-mute').classList.toggle('off', muted);
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-pause').addEventListener('click', togglePause);
  $('p-resume').addEventListener('click', togglePause);
  $('p-title').addEventListener('click', function () { togglePause(); teardown(); go('title'); });

  // ---------- các pha ----------
  function go(phase) {
    G.phase = phase;
    document.body.dataset.phase = phase;
    if (PHASES[phase].enter) PHASES[phase].enter();
  }

  function randomLevel() {
    var ids = Object.keys(LEVELS), want = params.get('map');
    if (want && LEVELS[want]) return want;
    var id = ids[Math.floor(Math.random() * ids.length)];
    if (id === G.levelId && ids.length > 1) id = ids[(ids.indexOf(id) + 1) % ids.length];
    return id;
  }

  function startDive() {
    if (G.phase !== 'title' && G.phase !== 'result') return;
    HX.audio.unlock();
    HX.hud.hideResult();
    go('loading');
  }
  $('start').addEventListener('click', startDive);

  var PHASES = {
    title: { enter: function () { HX.hud.reticle(false); titleDecoOn(true); } },

    loading: {
      enter: function () {
        var id = randomLevel(), kShared = 0, kGlb = 0;
        var prog = function () { HX.hud.loading(kShared * 0.6 + kGlb * 0.4); };
        HX.hud.loading(0, 'Đang xuống hố ' + id + '…');
        Promise.all([
          loadShared(function (k) { kShared = k; prog(); }),
          HX.level.loadGlb('art/' + LEVELS[id].glb, function (k) { kGlb = k; prog(); }),
        ]).then(function (r) {
          kShared = kGlb = 1; prog();
          buildDive(id, r[1]);
          go('dive');
        }).catch(function (e) {
          G.errors.push(String(e));
          HX.hud.loading(0, 'Không tải được: ' + e.message);
          console.error(e);
        });
      },
    },

    dive: {
      enter: function () {
        HX.hud.hint(isTouch() ? 'Kéo trái để bơi · giữ bên phải để ngắm, thả để bắn' : 'WASD bơi · Shift tăng tốc · Space lướt · giữ chuột trái ngắm, thả bắn · F / chuột phải: dao');
      },
    },

    result: {
      enter: function () {
        HX.hud.reticle(false);
        HX.audio.stopLoop('amb');
        HX.audio.stopLoop('pull');
      },
    },
  };

  G.catchFish = function (f) {
    if (f.state === 'reeled') return;
    f.go('reeled');
    G.catches.push(f.sp.id);
    HX.audio.play('harpoon_catch');
    HX.audio.play('dave_grab', { vol: 0.7 });
    fx.burst('bubble', f.pos.x, f.pos.y, 6, 0.8);
    fx.spawn('glow', f.pos.x, f.pos.y, f.z + 0.1, 0, 0, 0.6);
    HX.hud.catchCard(f.sp, HX.fish.iconFor(gfx, f.sp));
  };

  G.onSurface = function () {
    if (G.phase !== 'dive') return;
    G.outcome = 'surface';
    G.kept = G.catches.slice();
    HX.audio.stopMusic(1.2);
    HX.audio.play('o2_expand', { vol: 0.7 });
    fx.spawn('puff', G.diver.pos.x, G.diver.pos.y + 0.3, 0.2, 0, 0, 1.4);
    G.diver.go('surfaced');
    G.harpoon.drop();
    go('result');
    HX.hud.result('surface', G.kept, G.catches, startDive);
  };

  // Luật gốc: ngất dưới nước thì chỉ giữ được một món — ở đây giữ con quý nhất.
  G.onDead = function () {
    if (G.phase !== 'dive') return;
    G.outcome = 'dead';
    var best = null;
    G.catches.forEach(function (id) {
      var s = HX.fish.BY_ID[id];
      if (!best || s.rank > best.rank || (s.rank === best.rank && s.cm > best.cm)) best = s;
    });
    G.kept = best ? [best.id] : [];
    HX.audio.stopMusic(0.6);
    go('result');
    HX.hud.result('dead', G.kept, G.catches, startDive);
  };

  // ---------- vòng lặp ----------
  var last = performance.now(), fpsAcc = 0, fpsN = 0;
  G.fps = 60;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (paused) { gfx.render(G.t); return; }
    G.t += dt;
    // đang nạp bản đồ mới thì giữ nguyên khung cảnh cũ
    if (dive && G.phase !== 'title') { if (G.phase !== 'loading') step(dt); }
    else titleIdle(dt);
    gfx.render(G.t);
  }

  function step(dt) {
    readInput();
    var gdt = dt;
    if (G.hitstopT > 0) { G.hitstopT -= dt; gdt = dt * 0.08; }
    var inp = G.phase === 'dive' ? input : { mx: 0, my: 0 };
    G.diver.update(gdt, inp);
    G.harpoon.update(gdt);
    G.fishes.update(gdt);
    dive.chests.update(gdt);
    fx.update(gdt);
    updateCamera(dt);
    dive.rays.update(G.t);
    dive.dust.update(G.t);
    dive.surface.update();
    var cam = gfx.camera.position;
    dive.deco.spines.forEach(function (s) {
      if (Math.abs(s.x - cam.x) < G.viewHalf.w + 3 && Math.abs(s.y - cam.y) < G.viewHalf.h + 3) s.mesh.update(gdt);
    });
    hudTick();
  }

  function hudTick() {
    var d = G.diver;
    HX.hud.o2(d.o2);
    HX.hud.depth(T.water.surfaceY - d.pos.y);
    HX.hud.count(G.catches.length);
    if (G.phase === 'dive' && d.state === 'tug') {
      var s = gfx.worldToScreen(d.pos.x + d.facing * -0.6, d.pos.y + 0.2);
      HX.hud.tugAt(s.x, s.y);
      if (input.tap) HX.hud.tugTap();
    }
    var aiming = G.phase === 'dive' && (d.state === 'aim');
    var showRet = G.phase === 'dive' && !isTouch() && d.state !== 'dead';
    var tip = d.gunTip(), ts = gfx.worldToScreen(tip.x + Math.cos(d.aimAngle) * 0.35, tip.y + Math.sin(d.aimAngle) * 0.35);
    HX.hud.reticle(showRet, input.sx, input.sy, aiming, ts.x, ts.y, d.aimAngle);
  }

  // Màn đầu: cảnh nước trống với bụi và vệt nắng, trước khi có bản đồ.
  var titleDeco = null, titleBubbleT = 0;
  function titleDecoOn(on) {
    if (on && !titleDeco) titleDeco = { rays: new HX.level.Rays(G), dust: new HX.level.Dust(G), surface: new HX.level.Surface(G) };
    else if (!on && titleDeco) { titleDeco.rays.remove(); titleDeco.dust.remove(); titleDeco.surface.remove(); titleDeco = null; fx.clear(); }
  }

  function titleIdle(dt) {
    var c = gfx.camera.position;
    c.set(Math.sin(G.t * 0.05) * 2, T.water.surfaceY - 2.6, gfx.camDist());
    gfx.camera.updateMatrixWorld();
    if (!titleDeco) return;
    titleDeco.rays.update(G.t); titleDeco.dust.update(G.t); titleDeco.surface.update();
    titleBubbleT -= dt;
    if (titleBubbleT <= 0) {
      titleBubbleT = 0.08 + Math.random() * 0.2;
      fx.spawn(Math.random() < 0.3 ? 'bubbleBig' : 'bubble', c.x + (Math.random() - 0.5) * 12, c.y - 3.5, -0.5 + Math.random(), 0, 0.6);
    }
    fx.update(dt);
  }

  // ---------- màn đầu: Dave đứng chờ trên canvas nhỏ ----------
  (function titleDave() {
    var cv = $('title-dave'), ctx = cv.getContext('2d'), img = new Image(), a = A.dave.anims.Idle, t0 = performance.now();
    img.src = 'art/' + A.dave.sheet + '?v=20260924a';
    ctx.imageSmoothingEnabled = false;
    (function tick(now) {
      if (G.phase === 'title' || G.phase === 'loading') {
        var f = Math.floor((now - t0) / 1000 * a.fps) % a.n, c = A.dave.cell;
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, f * c + 20, a.row * c + 20, 80, 90, 0, Math.round(Math.sin(now / 500) * 2) + 4, 160, 180);
      }
      requestAnimationFrame(tick);
    })(t0);
  })();

  function onResize() { gfx.resize(); if (dive) viewHalf(); document.body.style.setProperty('--px', (innerHeight / gfx.rtSize[1]).toFixed(3)); }
  addEventListener('resize', onResize);
  onResize();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  // ---------- móc chỉ-đọc cho bộ kiểm (test/ho-xanh-suite.js), cộng vài lệnh dàn cảnh ----------
  window.HX_DEBUG = {
    info: function () {
      var d = G.diver;
      return {
        phase: G.phase, levelId: G.levelId, errors: G.errors.slice(),
        glbMeshes: dive ? dive.terrain.meshes : 0, deco: dive ? dive.deco.group.children.length : 0, decoSpine: dive ? dive.deco.spines.length : 0,
        drawCalls: gfx.stats ? gfx.stats.calls : 0, triangles: gfx.stats ? gfx.stats.triangles : 0,
        rt: gfx.rtSize,
        dave: d ? { x: d.pos.x, y: d.pos.y, state: d.state, o2: d.o2, anim: d.animName, visible: d.root.visible && !!d.root.parent } : null,
        harpoon: G.harpoon ? G.harpoon.state : null,
        fish: G.fishes ? G.fishes.list.length : 0,
        catches: G.catches.slice(), kept: (G.kept || []).slice(), outcome: G.outcome || null,
        chests: dive ? dive.chests.list.map(function (c) { return { x: c.x, y: c.y, open: c.open }; }) : [],
        surfaceY: T.water.surfaceY, fps: G.fps, sounds: HX.audio.decoded(),
      };
    },
    fishAt: function () { return G.fishes.list.map(function (f) { return { id: f.sp.id, uid: f.id, x: f.pos.x, y: f.pos.y, state: f.state, hp: f.hp }; }); },
    worldToScreen: function (x, y) { return gfx.worldToScreen(x, y); },
    teleport: function (x, y) { G.diver.pos.x = x; G.diver.pos.y = y; G.diver.vel.x = G.diver.vel.y = 0; snapCamera(); },
    spawnFish: function (id, x, y, frozen) {
      var f = G.fishes.spawnAt(HX.fish.BY_ID[id], x, y);
      if (frozen) { f.frozen = true; f.facing = f.flip = x < G.diver.pos.x ? 1 : -1; }
      return f.id;
    },
    clearFish: function () { G.fishes.clear(); },
    holdSpawns: function (on) { G.fishes.frozen = !!on; },
    setO2: function (v) { G.diver.o2 = v; if (v <= 0 && G.diver.state !== 'dead') G.diver.go('dead'); },
    giveCatch: function (id) { G.catches.push(id); },
  };

  go('title');
  requestAnimationFrame(frame);
  loadShared(function () {});
})(window.HX = window.HX || {});
