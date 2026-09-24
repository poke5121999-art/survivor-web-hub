// Vòng đời trò chơi: title → loading → dive → result, cùng input, camera, ánh sáng theo độ sâu và móc kiểm thử.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, ZONES = window.HX_ZONES, A = window.HX_ASSETS;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  // số bản của trang (index.html gắn ?v= vào main.js); glb mới trùng tên tệp cũ nên cũng phải gắn
  var REV = (document.currentScript.src.split('v=')[1] || '').split('&')[0];

  var gfx = new HX.gfx.Gfx($('scene'));
  var fx = new HX.Fx(gfx);
  var caustic = gfx.tex('fx/E_Noise_Caustic_01A.png', true);
  caustic.wrapS = caustic.wrapT = THREE.RepeatWrapping;
  HX.gfx.water.uCaustic.value = caustic;

  var G = {
    phase: 'title', gfx: gfx, fx: fx, audio: HX.audio, hud: HX.hud,
    t: 0, shakeT: 0, shakeAmp: 0, shakeOffset: { x: 0, y: 0 }, hitstopT: 0,
    viewHalf: { w: 8, h: 4.5 }, catches: [], themeId: null, errors: [],
  };
  HX.game = G;

  G.shake = function (n) { G.shakeT = Math.max(G.shakeT, 0.18 + 0.1 * n); G.shakeAmp = Math.max(G.shakeAmp, T.fx.shake * n); };
  G.hitstop = function (t) { G.hitstopT = Math.max(G.hitstopT, t); };

  // Nhạc theo vùng: lấy khoá đầu tiên có trong assets (tiếng tầng giữa/vực sâu có thể chưa rút).
  var MUSIC = { A: ['bgm_ingame'], B: ['bgm_b', 'bgm_seablue', 'bgm_ingame'], C: ['bgm_c', 'bgm_deep'], night: ['bgm_night'] };
  var AMB = { A: ['amb_deep'], B: ['amb_b', 'amb_deep'], C: ['amb_c', 'amb_deep'], night: ['amb_deep'] };
  function firstKey(list) { for (var i = 0; i < list.length; i++) if (A.audio[list[i]]) return list[i]; return null; }
  function zoneSound(area) {
    var night = G.stack && G.stack.theme.night;
    var m = firstKey(night ? MUSIC.night : MUSIC[area]), a = firstKey(night ? AMB.night : AMB[area]);
    if (m) HX.audio.music(m, 0.8);
    HX.audio.stopLoop('amb', 1.5);
    if (a) setTimeout(function () { if (G.phase === 'dive') HX.audio.loop('amb', a, 0.35); }, 1600);
  }

  // ---------- nạp tài nguyên ----------
  // Nạp chung bắt đầu ngay khi mở trang; màn loading chỉ gắn vào để đọc tiến độ.
  var shared = null, sharedK = 0, sharedCb = null;
  function loadShared(onProgress) {
    sharedCb = onProgress;
    if (shared) { onProgress(sharedK); return shared; }
    var parts = { fish: 0, img: 0, snd: 0 };
    var report = function () { sharedK = parts.fish * 0.45 + parts.img * 0.25 + parts.snd * 0.3; sharedCb(sharedK); };
    var imgs = [A.dave.sheet, 'fx/HarpoonProjectile.png', 'props/O2Box_Body.png', 'props/O2Box_Head.png', 'props/Pod_ex.png'];
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
    dive.alive = false;
    HX.audio.stopAll();
    dive.layers.forEach(function (l) { if (l) l.remove(G); });
    dive.rays.remove(); dive.dust.remove(); dive.surface.remove(); dive.chests.remove(); dive.pods.remove();
    G.fishes.clear();
    G.harpoon.remove();
    G.diver.remove();
    fx.clear();
    dive = null;
  }

  function findSpawn(W, L) {
    var st = L.zone.start;
    if (st) return { x: st[0], y: Math.min(st[1], T.water.surfaceY - 1.2) };
    for (var i = 0; i < 60; i++) {
      var x = (i % 2 ? 1 : -1) * Math.floor(i / 2) * 1.5, y = T.water.surfaceY - 1.2;
      if (W.open(x, y, 0.5) && W.open(x, y - 3, 0.5) && !W.raycast(x, y, x, y - 3)) return { x: x, y: y };
    }
    return { x: 0, y: T.water.surfaceY - 1.2 };
  }

  // Hòm nào bản gốc đặt lơ lửng thì hạ xuống mặt đá gần nhất bên dưới.
  function chestSpots(W, L) {
    var drop = -A.props['props/O2Box_Body.png'].local[1];
    return L.zone.o2.map(function (o) {
      var x = o[0], y = o[1] + L.yOff, hit = W.raycast(x, y, x, y - 3);
      return hit ? [x, hit.y + drop] : [x, y];
    });
  }

  // Tầng dưới nạp ngầm trong lúc đang lặn ở tầng trên.
  function loadLowerLayers() {
    var d = dive;
    d.stack.layers.slice(1).forEach(function (L) {
      HX.level.loadGlb('art/' + L.zone.glb + '?v=' + REV).then(function (gltf) {
        if (!d.alive) return;
        d.layers[L.i] = new HX.level.Layer(G, L, gltf);
      }).catch(function (e) { G.errors.push(String(e)); });
    });
  }

  function buildDive(themeId, ids, gltf0) {
    teardown();
    titleDecoOn(false);
    var stack = new HX.dive.Stack(ids, HX.dive.THEMES[themeId]);
    G.themeId = themeId;
    G.stack = stack;
    G.world = new HX.World(stack.walls);
    dive = {
      alive: true, stack: stack, layers: [new HX.level.Layer(G, stack.layers[0], gltf0)],
      rays: new HX.level.Rays(G), dust: new HX.level.Dust(G), surface: new HX.level.Surface(G),
      chests: new HX.level.Chests(G, []), pods: new HX.level.Pods(G), layerI: 0, maxDepth: 0,
    };
    stack.layers.forEach(function (L) {
      dive.chests.add(chestSpots(G.world, L));
      dive.pods.add(L.zone.pods.map(function (p) { return [p[0], p[1] + L.yOff]; }));
    });
    G.dive = dive;
    var sp = findSpawn(G.world, stack.layers[0]);
    G.catches = [];
    G.fishes = new HX.fish.Fishes(G);
    G.diver = new HX.Diver(G, sp.x, sp.y);
    G.harpoon = new HX.Harpoon(G);
    snapCamera();
    updateEnv(0);
    zoneSound(stack.layers[0].area);
    loadLowerLayers();
  }

  // ---------- ánh sáng & màu theo độ sâu ----------
  var env = new HX.dive.Env(), lampK = 0;
  function set3(u, a) { u.value.set(a[0], a[1], a[2]); }
  function updateEnv(dt) {
    var W = HX.gfx.water, P = HX.gfx.grade, cam = gfx.camera.position, st = G.stack;
    st.envAt(cam.y, env);
    set3(W.uFogNear, env.near); set3(W.uFogMid, env.mid); set3(W.uFogFar, env.far);
    W.uFogStart.value = env.fogStart; W.uFogEnd.value = env.fogEnd;
    // vực sâu gốc có hàng chục đèn điểm đặt trong cảnh (không rút được); nâng nền ánh sáng thay cho chúng
    var fl = T.dive.ambientFloor, th = st.theme, dim = th.dim || 1;
    W.uAmbient.value.set(Math.max(fl, env.ambient[0]) * dim, Math.max(fl, env.ambient[1]) * dim, Math.max(fl, env.ambient[2]) * dim);
    W.uSun.value.set(env.sun[0] * dim, env.sun[1] * dim, env.sun[2] * dim);
    W.uGlow.value = th.glow == null ? 1 : th.glow;
    var depth = st.depth(cam.y), D = T.dive;
    W.uSpriteLit.value = st.theme.night ? D.spriteDark : Math.max(D.spriteDark, 1 - depth / 250 * (1 - D.spriteDark));
    P.uExposure.value = env.exposure; P.uContrast.value = env.contrast; P.uSaturation.value = env.saturation;
    set3(P.uFilter, env.filter); set3(P.uVigColor, env.vigColor); P.uVig.value = env.vig;
    P.uVigCenter.value.set(env.vigCx, env.vigCy); P.uChroma.value = env.chroma;
    P.uBloomThr.value = env.bloomThr; P.uBloom.value = env.bloom; set3(P.uBloomTint, env.bloomTint);
    // đèn đội đầu: lặn đêm thì luôn bật, ban ngày bật dần khi xuống sâu
    var want = st.theme.night ? 1 : Math.min(1, Math.max(0, (depth - D.lampFrom) / (D.lampFull - D.lampFrom)));
    lampK += (want - lampK) * Math.min(1, dt * 2);
    W.uLamp.value = lampK;
    if (G.diver) {
      var d = G.diver, a = d.state === 'aim' || d.state === 'shoot' ? d.aimAngle : (d.facing > 0 ? d.tilt : Math.PI - d.tilt);
      W.uLampPos.value.set(d.pos.x, d.pos.y + 0.15, 0.6);
      W.uLampDir.value.set(Math.cos(a), Math.sin(a), -0.12).normalize();
    }
    if (dive) {
      dive.rays.strength = st.theme.night ? 0 : Math.max(0, 1 - depth / 45) * (st.theme.variant === 'Rain' ? 0.4 : 1);
      dive.dust.depth = depth;
    }
  }

  // ---------- camera ----------
  function viewHalf() {
    var h = Math.tan(T.view.fov * Math.PI / 360) * gfx.camDist();
    G.viewHalf.h = h; G.viewHalf.w = h * gfx.camera.aspect;
  }

  // Camera nhìn trước theo vận tốc của Dave, dạt về điểm ngắm, và không lọt ra ngoài CameraBound gốc.
  var look = { x: 0, y: 0 };
  function camTarget(out, dt) {
    var d = G.diver, V = T.view, lx = 0, ly = 0;
    if (d.state === 'aim' || d.state === 'shoot') {
      lx = (input.aimX - d.pos.x) * V.aimLead; ly = (input.aimY - d.pos.y) * V.aimLead;
      var l = Math.hypot(lx, ly);
      if (l > V.aimLeadMax) { lx *= V.aimLeadMax / l; ly *= V.aimLeadMax / l; }
    }
    var tx = d.vel.x * V.lookahead, ty = d.vel.y * V.lookahead, tl = Math.hypot(tx, ty);
    if (tl > V.lookaheadMax) { tx *= V.lookaheadMax / tl; ty *= V.lookaheadMax / tl; }
    var k = dt == null ? 1 : 1 - Math.exp(-1.6 * dt);
    look.x += (tx - look.x) * k; look.y += (ty - look.y) * k;
    var x = d.pos.x + lx + look.x, y = d.pos.y + ly + look.y + 0.3, vh = G.viewHalf;
    var bx = Math.max(0, V.boundX - vh.w);
    x = Math.max(-bx, Math.min(bx, x));
    y = Math.min(T.water.surfaceY + 1.6 - vh.h, Math.max(G.stack.minY + vh.h * 0.55, y));
    out.x = x; out.y = y;
    return out;
  }

  var camT = { x: 0, y: 0 }, camBase = { x: 0, y: 0 };
  function snapCamera() {
    viewHalf();
    look.x = look.y = 0;
    camTarget(camT);
    camBase.x = camT.x; camBase.y = camT.y;
    gfx.camera.position.set(camT.x, camT.y, gfx.camDist());
    gfx.camera.updateMatrixWorld();
  }

  function updateCamera(dt) {
    viewHalf();
    camTarget(camT, dt);
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
    HX.gfx.water.uCut.value.set((v.x + 1) / 2 * gfx.rtSize[0], (v.y + 1) / 2 * gfx.rtSize[1], T.view.cutRadius * gfx.rtSize[1] / (2 * G.viewHalf.h));
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
    if (!muted && G.phase === 'dive') zoneSound(G.stack.layerAt(G.diver.pos.y).area);
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

  // Chủ đề lượt này: ?theme=night, hoặc ?map=A01 (ép tầng trên cùng, chủ đề ban ngày), ?route=A03,B04,C04; không thì đổi chủ đề mỗi lượt.
  function chooseDive() {
    var force = (params.get('route') || params.get('map') || '').split(',').filter(Boolean);
    var th = params.get('theme');
    if (!HX.dive.THEMES[th]) th = force.length ? (ZONES[force[0]] && ZONES[force[0]].night ? 'night' : 'day') : HX.dive.nextTheme(G.themeId, Math.random);
    return { theme: th, ids: HX.dive.plan(th, Math.random, force, G.stack && G.stack.layers.map(function (L) { return L.id; })) };
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
        var pick = chooseDive(), th = HX.dive.THEMES[pick.theme], kShared = 0, kGlb = 0;
        var prog = function () { HX.hud.loading(kShared * 0.6 + kGlb * 0.4); };
        HX.hud.loading(0, 'Đang xuống ' + th.name + ' · ' + th.sub + '…');
        Promise.all([
          loadShared(function (k) { kShared = k; prog(); }),
          HX.level.loadGlb('art/' + ZONES[pick.ids[0]].glb + '?v=' + REV, function (k) { kGlb = k; prog(); }),
        ]).then(function (r) {
          kShared = kGlb = 1; prog();
          buildDive(pick.theme, pick.ids, r[1]);
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
        var th = G.stack.theme;
        HX.hud.area(th.name, th.sub + ' · ' + HX.dive.AREA_NAME[G.stack.layers[0].area]);
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
    HX.hud.result('surface', G.kept, G.catches, startDive, dive.maxDepth);
  };

  G.onPod = function (p) {
    if (G.phase !== 'dive') return;
    G.outcome = 'pod';
    G.kept = G.catches.slice();
    HX.audio.stopMusic(1.2);
    HX.audio.play('o2_expand', { vol: 0.7 });
    fx.burst('bubbleBig', p.x, p.y + 0.6, 18, 1.4);
    G.diver.go('surfaced');
    G.harpoon.drop();
    go('result');
    HX.hud.result('pod', G.kept, G.catches, startDive, dive.maxDepth);
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
    HX.hud.result('dead', G.kept, G.catches, startDive, dive.maxDepth);
  };

  // Sang tầng khác: băng tên vùng + đổi nhạc.
  function checkLayer() {
    var L = G.stack.layerAt(G.diver.pos.y);
    if (L.i === dive.layerI) return;
    var deeper = L.i > dive.layerI;
    dive.layerI = L.i;
    if (deeper) HX.hud.area(HX.dive.AREA_NAME[L.area], Math.round(L.d0) + ' – ' + Math.round(L.d1) + ' m');
    zoneSound(L.area);
  }

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
    dive.pods.update(gdt, inp);
    fx.update(gdt);
    updateCamera(dt);
    updateEnv(dt);
    dive.rays.update(G.t);
    dive.dust.update(G.t);
    dive.surface.update();
    var cam = gfx.camera.position;
    dive.layers.forEach(function (l) { if (l) l.update(gdt, cam, G.viewHalf.w, G.viewHalf.h); });
    if (G.phase === 'dive') checkLayer();
    hudTick();
  }

  function hudTick() {
    var d = G.diver;
    HX.hud.o2(d.o2);
    var dm = G.stack.depth(d.pos.y);
    HX.hud.depth(dm);
    if (G.phase === 'dive') dive.maxDepth = Math.max(dive.maxDepth, dm);
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

  // Màn đầu: cảnh nước trống với bụi và vệt nắng, dùng ánh sáng gốc của vùng nông.
  var titleDeco = null, titleBubbleT = 0;
  function titleDecoOn(on) {
    if (on && !titleDeco) {
      G.stack = new HX.dive.Stack([HX.dive.plan('day', function () { return 0; })[0]], HX.dive.THEMES.day);
      titleDeco = { rays: new HX.level.Rays(G), dust: new HX.level.Dust(G), surface: new HX.level.Surface(G) };
    } else if (!on && titleDeco) { titleDeco.rays.remove(); titleDeco.dust.remove(); titleDeco.surface.remove(); titleDeco = null; fx.clear(); }
  }

  function titleIdle(dt) {
    var c = gfx.camera.position;
    c.set(Math.sin(G.t * 0.05) * 3, T.water.surfaceY - 4.5, gfx.camDist());
    gfx.camera.updateMatrixWorld();
    if (!titleDeco) return;
    updateEnv(dt);
    titleDeco.rays.update(G.t); titleDeco.dust.update(G.t); titleDeco.surface.update();
    titleBubbleT -= dt;
    if (titleBubbleT <= 0) {
      titleBubbleT = 0.08 + Math.random() * 0.2;
      fx.spawn(Math.random() < 0.3 ? 'bubbleBig' : 'bubble', c.x + (Math.random() - 0.5) * 18, c.y - 6, -0.5 + Math.random(), 0, 0.6);
    }
    fx.update(dt);
  }

  // ---------- màn đầu: Dave đứng chờ trên canvas nhỏ ----------
  (function titleDave() {
    var cv = $('title-dave'), ctx = cv.getContext('2d'), img = new Image(), a = A.dave.anims.Idle, t0 = performance.now();
    img.src = 'art/' + A.dave.sheet + '?v=' + REV;
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

  // --px: hệ số phóng ảnh giao diện điểm ảnh, giữ cỡ như khi còn vẽ khung thấp 650 dòng.
  function onResize() { gfx.resize(); if (dive) viewHalf(); document.body.style.setProperty('--px', (innerHeight / 650).toFixed(3)); }
  addEventListener('resize', onResize);
  onResize();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  // ---------- móc chỉ-đọc cho bộ kiểm (test/ho-xanh-suite.js), cộng vài lệnh dàn cảnh ----------
  window.HX_DEBUG = {
    info: function () {
      var d = G.diver, st = G.stack;
      return {
        phase: G.phase, theme: G.themeId, route: dive ? st.layers.map(function (L) { return L.id; }) : [], levelId: dive ? st.layers[0].id : null,
        errors: G.errors.slice(),
        layers: dive ? dive.layers.map(function (l) { return l ? { id: l.L.id, meshes: l.count.meshes, roles: l.count.roles } : null; }) : [],
        glbMeshes: dive ? dive.layers[0].count.meshes : 0,
        drawCalls: gfx.stats ? gfx.stats.calls : 0, triangles: gfx.stats ? gfx.stats.triangles : 0,
        rt: gfx.rtSize, camDist: gfx.camDist(),
        dave: d ? { x: d.pos.x, y: d.pos.y, state: d.state, o2: d.o2, anim: d.animName, visible: d.root.visible && !!d.root.parent } : null,
        depth: d && dive ? st.depth(d.pos.y) : 0, area: d && dive ? st.layerAt(d.pos.y).area : null, minY: dive ? st.minY : 0,
        harpoon: G.harpoon ? G.harpoon.state : null,
        fish: G.fishes ? G.fishes.list.length : 0,
        catches: G.catches.slice(), kept: (G.kept || []).slice(), outcome: G.outcome || null,
        chests: dive ? dive.chests.list.map(function (c) { return { x: c.x, y: c.y, open: c.open }; }) : [],
        surfaceY: T.water.surfaceY, fps: G.fps, sounds: HX.audio.decoded(),
      };
    },
    fishAt: function () { return G.fishes.list.map(function (f) { return { id: f.sp.id, uid: f.id, x: f.pos.x, y: f.pos.y, state: f.state, hp: f.hp }; }); },
    worldToScreen: function (x, y) { return gfx.worldToScreen(x, y); },
    teleport: function (x, y) { G.diver.pos.x = x; G.diver.pos.y = y; G.diver.vel.x = G.diver.vel.y = 0; snapCamera(); updateEnv(1); },
    spawnFish: function (id, x, y, frozen) {
      var f = G.fishes.spawnAt(HX.fish.BY_ID[id], x, y);
      if (frozen) { f.frozen = true; f.facing = f.flip = x < G.diver.pos.x ? 1 : -1; }
      return f.id;
    },
    clearFish: function () { G.fishes.clear(); },
    holdSpawns: function (on) { G.fishes.frozen = !!on; },
    setO2: function (v) { G.diver.o2 = v; if (v <= 0 && G.diver.state !== 'dead') G.diver.go('dead'); },
    giveCatch: function (id) { G.catches.push(id); },
    walls: function () { return G.stack.walls; },
  };

  go('title');
  requestAnimationFrame(frame);
  loadShared(function () {});
})(window.HX = window.HX || {});
