// Vòng một ngày: title → prep → boat → loading → dive → result → boat → kitchen → bar → ledger → prep,
// cùng input, camera, ánh sáng theo độ sâu và móc kiểm thử. Pha trên bờ nằm ở js/prep.js, js/boat.js, js/bar.js.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, ZONES = window.HX_ZONES, A = window.HX_ASSETS, M = window.HX_META;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  // số bản của trang (index.html gắn ?v= vào main.js); glb mới trùng tên tệp cũ nên cũng phải gắn
  var REV = (document.currentScript.src.split('v=')[1] || '').split('&')[0];

  var gfx = new HX.gfx.Gfx($('scene'));
  var fx = new HX.Fx(gfx);
  var caustic = gfx.tex('fx/E_Noise_Caustic_01A.png', true);
  caustic.wrapS = caustic.wrapT = THREE.RepeatWrapping;
  HX.gfx.water.uCaustic.value = caustic;

  if (params.get('fresh') === '1') {
    HX.save.wipe();
    // bỏ ?fresh khỏi địa chỉ để tải lại trang không xoá sổ thêm lần nữa
    params.delete('fresh');
    var qs = params.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) { /* bỏ qua */ }
  } else HX.save.load();

  var G = {
    phase: null, gfx: gfx, fx: fx, audio: HX.audio, hud: HX.hud,
    t: 0, shakeT: 0, shakeAmp: 0, shakeOffset: { x: 0, y: 0 }, hitstopT: 0,
    viewHalf: { w: 8, h: 4.5 }, catches: [], themeId: null, lastRoute: null, errors: [],
    loadout: null, haul: null,
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
    if (G.gun) { G.gun.remove(); G.gun = null; }
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

  // Trang bị đã nâng đọc một lần lúc dựng lượt lặn, từ sổ lưu qua bảng HX_META. dave.js, harpoon.js, level.js, gun.js đọc G.loadout.
  function readLoadout() { return M.loadout(HX.save.get()); }

  // Tiếng, ảnh súng và ảnh hạt hiệu ứng của khẩu súng đang chọn, nạp trong màn loading.
  function loadGunAssets(L) {
    if (!L.gun) return Promise.resolve();
    var id = L.gun.id;
    return Promise.all([
      HX.audio.load(HX.gun.soundKeys(id)),
      fx.preloadRecipes(HX.gun.recipesOf(id)),
      Promise.all(HX.gun.images(id).map(function (r) { return gfx.loadTex(r); })),
    ]);
  }

  function buildDive(themeId, ids, gltf0) {
    teardown();
    titleDecoOn(false);
    G.loadout = readLoadout();
    G.haul = null;
    var stack = new HX.dive.Stack(ids, HX.dive.THEMES[themeId]);
    G.themeId = themeId;
    G.lastRoute = ids.slice();
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
    G.gun = G.loadout.gun ? new HX.Gun(G, G.loadout.gun) : null;
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
      var d = G.diver, a = aimingState(d.state) ? d.aimAngle : (d.facing > 0 ? d.tilt : Math.PI - d.tilt);
      W.uLampPos.value.set(d.pos.x, d.pos.y + 0.15, 0.6);
      W.uLampDir.value.set(Math.cos(a), Math.sin(a), -0.12).normalize();
    }
    if (dive) {
      dive.rays.strength = st.theme.night ? 0 : Math.max(0, 1 - depth / 45) * (st.theme.variant === 'Rain' ? 0.4 : 1);
      dive.dust.depth = depth;
    }
  }

  function aimingState(s) { return s === 'aim' || s === 'shoot' || s === 'gunAim' || s === 'gunFire'; }

  // ---------- camera ----------
  function viewHalf() {
    var h = Math.tan(T.view.fov * Math.PI / 360) * gfx.camDist();
    G.viewHalf.h = h; G.viewHalf.w = h * gfx.camera.aspect;
  }

  // Camera nhìn trước theo vận tốc của Dave, dạt về điểm ngắm, và không lọt ra ngoài CameraBound gốc.
  var look = { x: 0, y: 0 };
  function camTarget(out, dt) {
    var d = G.diver, V = T.view, lx = 0, ly = 0;
    if (aimingState(d.state)) {
      lx = (input.aimX - d.pos.x) * V.aimLead; ly = (input.aimY - d.pos.y) * V.aimLead;
      var l = Math.hypot(lx, ly);
      if (l > V.aimLeadMax) { lx *= V.aimLeadMax / l; ly *= V.aimLeadMax / l; }
    }
    var tx = d.vel.x * V.lookahead, ty = d.vel.y * V.lookahead, tl = Math.hypot(tx, ty);
    if (tl > V.lookaheadMax) { tx *= V.lookaheadMax / tl; ty *= V.lookaheadMax / tl; }
    var k = dt == null ? 1 : 1 - Math.exp(-1.6 * dt);
    look.x += (tx - look.x) * k; look.y += (ty - look.y) * k;
    var x = d.pos.x + lx + look.x, y = d.pos.y + ly + look.y + 0.3, vh = G.viewHalf;
    // CinemachineConfiner gốc với camera phối cảnh chỉ giữ TÂM camera trong CameraBound (x ±55, y ≤ 19).
    // Giữ cả mép khung nhìn như trước thì camera dừng ở x=−43,7 và bỏ Dave (thả xuống ở x=−57) ra ngoài màn hình.
    x = Math.max(-V.boundX, Math.min(V.boundX, x));
    y = Math.min(V.boundTop, Math.max(G.stack.minY + vh.h * 0.55, y));
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
    // nhặt / xả thịt xác cá: E, hoặc Space (nút Interaction gốc) khi đứng cạnh xác; giữ để xả thịt
    interact: false, interactHeld: false,
    fireHeld: false, firePressed: false, fireReleased: false,
    // súng phụ: chuột phải hoặc nút bắn cảm ứng khi đang cầm súng; gunAuto = nhắm tự động vào cá gần nhất (cảm ứng, chưa kéo cần)
    // aimCancel: thả cần ngắm trong ô Huỷ bắn
    gunHeld: false, gunPressed: false, gunReleased: false, gunAuto: false, aimCancel: false,
    sx: innerWidth * 0.7, sy: innerHeight * 0.5, aimX: 0, aimY: 0,
    touch: { stick: null, aim: null, boost: false, gun: false, interact: false },
  };
  var edges = { dash: false, melee: false, tap: false, interact: false, firePressed: false, fireReleased: false, gunPressed: false, gunReleased: false, aimCancel: false };
  var mouseGun = false;

  function isTouch() { return document.body.classList.contains('touch'); }

  addEventListener('keydown', function (e) {
    if (e.repeat) return;
    keys[e.code] = true;
    HX.audio.unlock();
    if (G.phase === 'dive') {
      if (e.code === 'Space') { edges.dash = true; edges.tap = true; edges.interact = true; e.preventDefault(); }
      if (e.code === 'KeyE') edges.interact = true;
      if (e.code === 'KeyF') edges.melee = true;
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    }
    if (e.code === 'KeyM') toggleMute();
    if ((e.code === 'Enter' || e.code === 'Space') && G.phase === 'title') { e.preventDefault(); startDay(); }
  });
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  addEventListener('blur', function () { keys = {}; input.fireHeld = false; mouseGun = false; input.touch.gun = false; input.touch.interact = false; input.touch.aim = null; });

  var canvas = $('scene');
  canvas.addEventListener('mousemove', function (e) { input.sx = e.clientX; input.sy = e.clientY; });
  canvas.addEventListener('mousedown', function (e) {
    HX.audio.unlock();
    input.sx = e.clientX; input.sy = e.clientY;
    if (G.phase !== 'dive' || paused) return;
    if (e.button === 0) { input.fireHeld = true; edges.firePressed = true; edges.tap = true; }
    if (e.button === 2) { mouseGun = true; edges.gunPressed = true; edges.tap = true; input.gunAuto = false; }
  });
  addEventListener('mouseup', function (e) {
    if (e.button === 0 && input.fireHeld) { input.fireHeld = false; edges.fireReleased = true; }
    if (e.button === 2 && mouseGun) { mouseGun = false; edges.gunReleased = true; }
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Chạm: HUD cảm ứng theo bản Android (data/mobile_ui.js). Nửa dưới bên trái là cần nổi; nút bắn lớn là cần ngắm:
  // giữ để rút vũ khí, kéo để chọn hướng, thả để bắn, kéo vào ô "Huỷ bắn" rồi thả là thôi. Nút nhỏ cạnh nó đổi xiên ↔ súng phụ.
  var MUI = window.HX_MOBILE_UI;
  var TOUCH = {
    zone: [MUI.layout.stickZone.w / 2, MUI.layout.stickZone.h / 2],  // [DtD mobile] Left Joystick 2400×1800 tâm ở góc dưới trái
    stickRange: MUI.numbers.knob.m_MovementRange,                   // [DtD mobile] OnScreenStick_Normal 150
    aimRange: MUI.numbers.aim.m_MovementRange,                      // [DtD mobile] OnScreenStick_Fire 160
    dead: 0.125, deadMax: 0.925,  // [ĐỀ XUẤT] mặc định StickDeadzone của Unity Input System; prefab không ghi số riêng
    reach: 40,                    // [ĐỀ XUẤT] m, điểm ngắm đặt thật xa theo hướng cần để lệch vai–tâm Dave không làm lệch góc
  };
  var touchWeapon = 'harpoon';  // vũ khí đang nằm trên nút bắn lớn: 'harpoon' | 'gun'
  function mu() { return innerWidth / MUI.ref[0]; }

  function onTouchStart(e) {
    document.body.classList.add('touch');
    HX.audio.unlock();
    if (G.phase !== 'dive' || paused) return;
    var u = mu();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (!input.touch.stick && t.clientX < TOUCH.zone[0] * u && innerHeight - t.clientY < TOUCH.zone[1] * u) {
        input.touch.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        showStick(true);
      } else edges.tap = true;  // giằng co: chạm chỗ nào cũng tính một lần giật (như chế độ 全屏 của bản Android)
    }
    e.preventDefault();
  }
  function onTouchMove(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i], s = input.touch.stick;
      if (s && t.identifier === s.id) { s.x = t.clientX; s.y = t.clientY; }
    }
    e.preventDefault();
  }
  function onTouchEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (input.touch.stick && e.changedTouches[i].identifier === input.touch.stick.id) { input.touch.stick = null; showStick(false); }
    }
  }
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  function showStick(on) {
    var s = input.touch.stick, el = $('stick');
    el.hidden = !on;
    if (on) { el.style.left = s.x0 + 'px'; el.style.top = s.y0 + 'px'; $('stick-knob').style.transform = ''; }
  }

  function bindHold(id, on, off) {
    var el = $(id);
    el.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); HX.audio.unlock(); on(); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); if (off) off(); });
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); on(); });
    el.addEventListener('mouseup', function () { if (off) off(); });
  }
  // 加速 là Toggle: chạm bật, chạm lần nữa tắt
  bindHold('tb-boost', function () { input.touch.boost = !input.touch.boost; });
  bindHold('tb-dash', function () { edges.dash = true; edges.tap = true; });
  bindHold('tb-knife', function () { edges.melee = true; edges.tap = true; });
  // Nút tương tác 交互: chỉ hiện khi đứng cạnh xác cá; giữ để xả thịt cá lớn.
  bindHold('tb-grab', function () { edges.interact = true; input.touch.interact = true; }, function () { input.touch.interact = false; });
  bindHold('tb-qte', function () { edges.tap = true; });
  bindHold('tb-switch', function () { if (G.gun && !input.touch.aim) touchWeapon = touchWeapon === 'gun' ? 'harpoon' : 'gun'; });

  // Cần ngắm trên nút bắn (OnScreenStick_Fire, RelativePositionWithStaticOrigin): lệch so với chỗ chạm xuống là hướng ngắm.
  function aimStart(id, x, y) {
    if (G.phase !== 'dive' || paused || input.touch.aim) return;
    var gun = touchWeapon === 'gun' && G.gun;
    input.touch.aim = { id: id, x0: x, y0: y, x: x, y: y, gun: !!gun, over: false };
    edges.tap = true;
    if (gun) { input.touch.gun = true; edges.gunPressed = true; } else { input.fireHeld = true; edges.firePressed = true; }
  }
  function aimMove(id, x, y) {
    var a = input.touch.aim;
    if (!a || a.id !== id) return;
    a.x = x; a.y = y;
    var r = $('tb-cancel').getBoundingClientRect();
    a.over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function aimEnd(id) {
    var a = input.touch.aim;
    if (!a || a.id !== id) return;
    input.touch.aim = null;
    if (a.over) edges.aimCancel = true;
    if (a.gun) { input.touch.gun = false; edges.gunReleased = true; } else { input.fireHeld = false; edges.fireReleased = true; }
  }
  var fireBtn = $('tb-fire');
  fireBtn.addEventListener('touchstart', function (e) {
    e.preventDefault(); e.stopPropagation(); HX.audio.unlock();
    var t = e.changedTouches[0];
    aimStart(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  fireBtn.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) aimMove(e.changedTouches[i].identifier, e.changedTouches[i].clientX, e.changedTouches[i].clientY);
  }, { passive: false });
  function fireTouchEnd(e) { for (var i = 0; i < e.changedTouches.length; i++) aimEnd(e.changedTouches[i].identifier); }
  fireBtn.addEventListener('touchend', fireTouchEnd);
  fireBtn.addEventListener('touchcancel', fireTouchEnd);
  fireBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); aimStart('mouse', e.clientX, e.clientY); });
  addEventListener('mousemove', function (e) { aimMove('mouse', e.clientX, e.clientY); });
  addEventListener('mouseup', function () { aimEnd('mouse'); });

  // vector cần (đã qua vùng chết) từ độ lệch px; range tính bằng đơn vị canvas gốc
  function stickVec(dx, dy, range) {
    var r = range * mu(), x = dx / r, y = -dy / r, l = Math.hypot(x, y);
    if (l < TOUCH.dead) return { x: 0, y: 0, l: 0, px: dx, py: dy };
    var k = Math.min(1, (l - TOUCH.dead) / (TOUCH.deadMax - TOUCH.dead)) / l, c = Math.min(1, 1 / l);
    return { x: x * k, y: y * k, l: l, px: dx * c, py: dy * c };
  }

  function readInput() {
    var mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my += 1;
    if (keys.KeyS || keys.ArrowDown) my -= 1;
    var s = input.touch.stick;
    if (s) {
      var v = stickVec(s.x - s.x0, s.y - s.y0, TOUCH.stickRange);
      if (v.l) { mx = v.x; my = v.y; }
      $('stick-knob').style.transform = 'translate(' + v.px.toFixed(1) + 'px,' + v.py.toFixed(1) + 'px)';
    }
    var l2 = Math.hypot(mx, my);
    if (l2 > 1) { mx /= l2; my /= l2; }
    input.mx = mx; input.my = my;
    if (G.phase !== 'dive') input.touch.boost = false;
    input.boost = !!(keys.ShiftLeft || keys.ShiftRight) || input.touch.boost;
    input.dash = edges.dash; input.melee = edges.melee; input.tap = edges.tap;
    input.interact = edges.interact; input.interactHeld = !!(keys.KeyE || keys.Space) || input.touch.interact;
    input.firePressed = edges.firePressed; input.fireReleased = edges.fireReleased; input.aimCancel = edges.aimCancel;
    input.gunHeld = mouseGun || input.touch.gun; input.gunPressed = edges.gunPressed; input.gunReleased = edges.gunReleased;
    var a = input.touch.aim, d = G.diver;
    if (a && d) {
      // chưa kéo khỏi vùng chết: xiên chĩa thẳng hướng mặt, súng phụ tự nhắm con gần nhất như nút Súng cũ [ĐỀ XUẤT]
      var av = stickVec(a.x - a.x0, a.y - a.y0, TOUCH.aimRange), n = Math.hypot(av.x, av.y);
      input.gunAuto = a.gun && !n;
      input.aimX = d.pos.x + (n ? av.x / n : d.facing) * TOUCH.reach;
      input.aimY = d.pos.y + (n ? av.y / n : 0) * TOUCH.reach;
    } else {
      var w = gfx.screenToWorld(input.sx, input.sy);
      input.aimX = w.x; input.aimY = w.y;
    }
    edges.dash = edges.melee = edges.tap = edges.interact = edges.firePressed = edges.fireReleased = edges.gunPressed = edges.gunReleased = edges.aimCancel = false;
  }

  // Trạng thái HUD cảm ứng cho khung này (HX.hud.touch).
  function touchHud(d) {
    var a = input.touch.aim, gunOn = touchWeapon === 'gun' && !!G.gun;
    var harpoon = { icon: 'art/ui/mobile/icon_harpoon.png?v=' + REV, lv: (HX.save.get().gear.harpoon | 0) + 1 };
    var gun = G.gun && { icon: G.gun.art.icon + '?v=' + REV, lv: G.loadout.gun.lv, ammo: G.gun.ammo, max: G.gun.spec.ammo };
    var av = a && stickVec(a.x - a.x0, a.y - a.y0, TOUCH.aimRange);
    return {
      boost: input.touch.boost, dashK: Math.max(0, d.dashCd) / T.diver.dashCooldown, qte: d.state === 'tug',
      aim: a ? { x: av.px, y: av.py, over: a.over } : null,
      fire: gunOn ? gun : harpoon, sub: G.gun ? (gunOn ? harpoon.icon : gun.icon) : null,
    };
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
  $('p-title').addEventListener('click', function () { togglePause(); go('title'); });

  // ---------- các pha ----------
  // Sổ pha: mỗi pha { surface: '3d' | '2d' | 'dom' | 'scene', enter(args), exit(), update(dt), render() }, chỉ surface là bắt buộc.
  // 'scene': pha tự dựng cảnh three.js riêng và tự vẽ bằng G.gfx.renderer trong render(); main.js không vẽ cảnh nước.
  // Pha trên bờ tự đăng ký vào HX.phases từ tệp riêng (prep.js, boat.js, bar.js); phase() tra bảng dưới đây trước rồi tới HX.phases.
  //   3d  : cảnh three.js (#scene). Không có lượt lặn thì vẽ cảnh nước trống làm nền.
  //   dom : như 3d nhưng pha tự dựng giao diện trong G.screen(tên) (một <section> trong #screens).
  //   2d  : #stage2d phủ kín màn hình, bỏ vẽ #scene; pha tự vẽ trong render() lên G.stage2d.ctx.
  function phase(name) { return PHASES[name] || (HX.phases && HX.phases[name]) || null; }

  function go(name, args) {
    var next = phase(name);
    if (!next) throw new Error('không có pha "' + name + '" trong sổ pha');
    var prev = G.phase && phase(G.phase);
    if (prev && prev.exit) prev.exit();
    // rời khỏi mặt nước thì dỡ lượt lặn, dựng lại cảnh nước trống làm nền
    if (next.surface !== '3d' || name === 'title') { teardown(); titleDecoOn(true); }
    G.phase = name;
    document.body.dataset.phase = name;
    document.body.dataset.surface = next.surface;
    showScreen(name);
    if (next.enter) next.enter(args || {});
  }
  G.go = go;

  var screens = $('screens');
  G.screen = function (name) {
    var el = document.getElementById('scr-' + name);
    if (!el) {
      el = document.createElement('section');
      el.id = 'scr-' + name; el.className = 'screen'; el.hidden = G.phase !== name;
      screens.appendChild(el);
    }
    return el;
  };
  function showScreen(name) {
    for (var i = 0; i < screens.children.length; i++) screens.children[i].hidden = screens.children[i].id !== 'scr-' + name;
  }

  var stage = $('stage2d');
  G.stage2d = { canvas: stage, ctx: stage.getContext('2d'), w: innerWidth, h: innerHeight, dpr: 1 };

  // Chủ đề lượt này: ?theme=night, hoặc ?map=A01 (ép tầng trên cùng, chủ đề ban ngày), ?route=A03,B04,C04; không thì đổi chủ đề mỗi lượt.
  function chooseDive() {
    var force = (params.get('route') || params.get('map') || '').split(',').filter(Boolean);
    var th = params.get('theme');
    if (!HX.dive.THEMES[th]) th = force.length ? (ZONES[force[0]] && ZONES[force[0]].night ? 'night' : 'day') : HX.dive.nextTheme(G.themeId, Math.random);
    return { theme: th, ids: HX.dive.plan(th, Math.random, force, G.lastRoute) };
  }

  // Cá mang về đã nằm trong sổ mà chưa bán thì vào thẳng bếp.
  function startDay() {
    if (G.phase !== 'title') return;
    HX.audio.unlock();
    go(HX.save.get().stage === 'bar' ? 'kitchen' : 'prep');
  }
  $('start').addEventListener('click', startDay);

  function goHome() { if (G.phase === 'result') go('boat', { dir: 'home' }); }

  var PHASES = {
    title: {
      surface: '3d',
      enter: function () {
        var s = HX.save.get();
        HX.hud.reticle(false);
        $('start').textContent = s.day > 1 || s.stage === 'bar' ? 'Tiếp tục · ngày ' + s.day : 'Bắt đầu';
      },
    },

    loading: {
      surface: '3d',
      enter: function () {
        var pick = chooseDive(), th = HX.dive.THEMES[pick.theme], kShared = 0, kGlb = 0, gunL = readLoadout();
        var prog = function () { HX.hud.loading(kShared * 0.6 + kGlb * 0.4); };
        HX.hud.loading(0, 'Đang xuống ' + th.name + ' · ' + th.sub + '…');
        Promise.all([
          loadShared(function (k) { kShared = k; prog(); }),
          HX.level.loadGlb('art/' + ZONES[pick.ids[0]].glb + '?v=' + REV, function (k) { kGlb = k; prog(); }),
          loadGunAssets(gunL),
        ]).then(function (r) {
          if (G.phase !== 'loading') return;
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
      surface: '3d',
      enter: function () {
        var th = G.stack.theme;
        HX.hud.area(th.name, th.sub + ' · ' + HX.dive.AREA_NAME[G.stack.layers[0].area]);
        var gun = !!G.gun;
        touchWeapon = 'harpoon';
        HX.hud.hint(isTouch()
          ? 'Kéo góc trái để bơi · giữ nút xiên, kéo để ngắm, thả để bắn' + (gun ? ' · nút nhỏ cạnh đó đổi sang súng' : '')
          : 'WASD bơi · Shift tăng tốc · Space lướt · giữ chuột trái ngắm, thả bắn' + (gun ? ' · giữ chuột phải: súng' : '') + ' · F: dao · E: nhặt cá');
      },
    },

    result: {
      surface: '3d',
      enter: function () {
        HX.hud.reticle(false);
        HX.hud.suitWarn(false);
        HX.audio.stopLoop('amb');
        HX.audio.stopLoop('pull');
        HX.audio.stopLoop('gunaim');
      },
      exit: function () { HX.hud.hideResult(); },
    },
  };

  // Túi đầy thì cá vẫn hạ được, nhưng kéo tới tay Dave là tan đi, không vào túi.
  G.catchFish = function (f) {
    if (f.state === 'reeled') return;
    f.go('reeled');
    if (G.catches.length >= G.loadout.cargo) {
      HX.hud.toast('Túi đầy · phải thả cá đi');
      fx.burst('bubble', f.pos.x, f.pos.y, 10, 1);
      return;
    }
    G.catches.push(f.sp.id);
    HX.audio.play('harpoon_catch');
    HX.audio.play('dave_grab', { vol: 0.7 });
    fx.burst('bubble', f.pos.x, f.pos.y, 6, 0.8);
    fx.spawn('glow', f.pos.x, f.pos.y, f.z + 0.1, 0, 0, 0.6);
    HX.hud.catchCard(f.sp, HX.fish.iconFor(gfx, f.sp));
    if (G.catches.length === G.loadout.cargo) HX.hud.toast('Túi đầy · lên bờ thôi');
  };

  // Lượt lặn vừa kết thúc là cá đã lên thuyền: cất vào tủ ngay, để tải lại trang vẫn còn.
  // G.haul đặt lại mỗi lượt ở buildDive, nên gọi hai lần cũng chỉ cất một lần.
  function bankHaul() {
    if (G.haul) return;
    G.haul = G.kept.slice();
    HX.save.commit(function (s) {
      G.haul.forEach(function (id) { s.fridge[id] = (s.fridge[id] || 0) + 1; s.dex[id] = 1; });
      s.stage = 'bar';
    });
  }

  function endDive(outcome, kept) {
    G.outcome = outcome;
    G.kept = kept;
    bankHaul();
    go('result');
    HX.hud.result(outcome, G.kept, G.catches, goHome, dive.maxDepth);
  }

  G.onSurface = function () {
    if (G.phase !== 'dive') return;
    HX.audio.stopMusic(1.2);
    HX.audio.play('o2_expand', { vol: 0.7 });
    fx.spawn('puff', G.diver.pos.x, G.diver.pos.y + 0.3, 0.2, 0, 0, 1.4);
    G.diver.go('surfaced');
    G.harpoon.drop();
    endDive('surface', G.catches.slice());
  };

  G.onPod = function (p) {
    if (G.phase !== 'dive') return;
    HX.audio.stopMusic(1.2);
    HX.audio.play('o2_expand', { vol: 0.7 });
    fx.burst('bubbleBig', p.x, p.y + 0.6, 18, 1.4);
    G.diver.go('surfaced');
    G.harpoon.drop();
    endDive('pod', G.catches.slice());
  };

  // Luật gốc: ngất dưới nước thì chỉ giữ được một món — ở đây giữ con quý nhất.
  G.onDead = function () {
    if (G.phase !== 'dive') return;
    var best = null;
    G.catches.forEach(function (id) {
      var s = HX.fish.BY_ID[id];
      if (!best || s.rank > best.rank || (s.rank === best.rank && s.cm > best.cm)) best = s;
    });
    HX.audio.stopMusic(0.6);
    endDive('dead', best ? [best.id] : []);
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
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // mốc rAF có thể sớm hơn performance.now() lúc khởi đầu
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (paused) { gfx.render(G.t); return; }
    G.t += dt;
    var P = phase(G.phase);
    // đang nạp bản đồ mới thì giữ nguyên khung cảnh cũ
    if (P.surface === '3d' && dive && G.phase !== 'title') { if (G.phase !== 'loading') step(dt); }
    else if (P.surface === '3d' || P.surface === 'dom') titleIdle(dt);
    if (P.update) P.update(dt);
    if (P.surface === '3d' || P.surface === 'dom') gfx.render(G.t);
    if (P.render) P.render();
  }

  function step(dt) {
    readInput();
    var gdt = dt;
    if (G.hitstopT > 0) { G.hitstopT -= dt; gdt = dt * 0.08; }
    var inp = G.phase === 'dive' ? input : { mx: 0, my: 0 };
    G.diver.update(gdt, inp);
    G.harpoon.update(gdt);
    if (G.gun) G.gun.update(gdt);
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
    HX.hud.o2(d.o2, G.loadout.o2);
    // quá độ sâu của đồ lặn: dave.js tính dưỡng khí tụt nhanh, ở đây chỉ báo
    HX.hud.suitWarn(G.phase === 'dive' && !!d.overSuit);
    if (G.gun) HX.hud.gun(G.gun.id, G.gun.art.icon + '?v=' + REV, G.gun.ammo, G.gun.spec.ammo);
    else HX.hud.gun(null);
    var dm = G.stack.depth(d.pos.y);
    HX.hud.depth(dm);
    if (G.phase === 'dive') dive.maxDepth = Math.max(dive.maxDepth, dm);
    HX.hud.count(G.catches.length, G.loadout.cargo);
    if (G.phase === 'dive' && d.state === 'tug') {
      var s = gfx.worldToScreen(d.pos.x + d.facing * -0.6, d.pos.y + 0.2);
      HX.hud.tugAt(s.x, s.y);
      if (input.tap) HX.hud.tugTap();
    }
    if (G.phase === 'dive' && isTouch()) HX.hud.touch(touchHud(d));
    var hp = G.phase === 'dive' ? d.harvestPrompt() : null;
    if (hp) {
      var hc = hp.fish.center(), hs = gfx.worldToScreen(hc.x, hc.y + hp.fish.hh);  // lời nhắc đứng trên lưng con cá
      HX.hud.harvest({ x: hs.x, y: hs.y, carve: hp.carve, k: hp.k, icon: hp.carve ? HX.fish.iconFor(gfx, hp.fish.sp) : null });
    } else HX.hud.harvest(null);
    var aiming = G.phase === 'dive' && (d.state === 'aim' || d.state === 'gunAim');
    var showRet = G.phase === 'dive' && !isTouch() && d.state !== 'dead';
    var tip = d.state === 'gunAim' ? G.gun.muzzle(d) : d.gunTip(), ts = gfx.worldToScreen(tip.x + Math.cos(d.aimAngle) * 0.35, tip.y + Math.sin(d.aimAngle) * 0.35);
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
  function onResize() {
    gfx.resize();
    if (dive) viewHalf();
    document.body.style.setProperty('--px', (innerHeight / 650).toFixed(3));
    var S = G.stage2d;
    S.dpr = Math.min(2, devicePixelRatio || 1); S.w = innerWidth; S.h = innerHeight;
    S.canvas.width = Math.round(S.w * S.dpr); S.canvas.height = Math.round(S.h * S.dpr);
  }
  addEventListener('resize', onResize);
  onResize();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  HX.hud.touchLayout();

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
        loadout: G.loadout, cargo: G.loadout ? G.loadout.cargo : null,
        gun: G.gun ? { id: G.gun.id, ammo: G.gun.ammo, max: G.gun.spec.ammo, fired: G.gun.fired, hits: G.gun.hits, caught: G.gun.caught,
          shots: G.gun.shots.length, empty: G.gun.emptyClicks || 0, rig: G.gun.rig.visible } : null,
        fx: (fx.plays || []).map(function (p) { return p.name; }),
      };
    },
    fishAt: function () { return G.fishes.list.map(function (f) { return { id: f.sp.id, uid: f.id, x: f.pos.x, y: f.pos.y, state: f.state, hp: f.hp, cx: f.center().x, cy: f.center().y }; }); },
    // Đổi súng ngay trong lượt lặn đang chạy (sổ lưu giữ nguyên); null là bỏ súng. Trả Promise khi nạp xong tiếng và ảnh.
    gun: function (id) {
      if (G.gun) { G.gun.remove(); G.gun = null; }
      G.loadout.gun = id ? Object.assign({ id: id, lv: 1, mode: M.GUNS[id].mode }, M.gunStat(id, 1)) : null;
      if (id) G.gun = new HX.Gun(G, G.loadout.gun);
      return loadGunAssets(G.loadout).then(function () { return !!G.gun; });
    },
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
    go: function (name, args) { go(name, args); },
    save: function () { return JSON.parse(JSON.stringify(HX.save.get())); },
    grant: function (gold) { HX.save.commit(function (s) { s.gold += gold; }); },
  };

  // ?phase=prep|boat|kitchen|bar vào thẳng một pha trên bờ để xem; bếp và quán thiếu cá thì bỏ sẵn vài con vào tủ.
  function fakeFridge() {
    if (Object.keys(HX.save.get().fridge).length) return;
    HX.save.commit(function (s) { s.fridge = { ClownFish: 3, Coral_Trout: 1, Titan_Triggerfish: 1 }; s.stage = 'bar'; });
  }
  var DEBUG_ENTRY = {
    prep: function () { go('prep'); },
    boat: function () { go('boat', { dir: params.get('dir') === 'home' ? 'home' : 'out' }); },
    kitchen: function () { fakeFridge(); go('kitchen'); },
    bar: function () { fakeFridge(); go('bar'); },
  };

  G.loaded = loadShared(function () {});
  var entry = DEBUG_ENTRY[params.get('phase')];
  if (entry) entry(); else go('title');
  requestAnimationFrame(frame);
})(window.HX = window.HX || {});
