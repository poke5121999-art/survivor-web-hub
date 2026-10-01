// Máy chủ của Biệt Đội Lặn: chỉ nhánh LẶN của Hố Xanh (không title, chuẩn bị, cano, quán, tủ cá).
// Vào thẳng ?map=0..4 → loading → dive. Dưỡng khí là máu, thể lực cho tăng tốc, tầng chia theo dải 13 m, dưới tầng cuối là vùng áp suất.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, A = window.HX_ASSETS, M = window.HX_META, BDL = window.BDL;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  // số bản của trang (index.html gắn ?v= vào main.js); glb mới trùng tên tệp cũ nên cũng phải gắn
  var REV = (document.currentScript.src.split('v=')[1] || '').split('&')[0];
  var ROOT = HX.ROOT;

  // ?map=0..4 vào thẳng một lượt lặn (bản thử, không qua sảnh); không có thì mở sảnh REPO.
  var devMap = params.has('map');
  var mapIdx = Math.max(0, Math.min(BDL.MAPS.length - 1, parseInt(params.get('map'), 10) || 0));
  var curMap = BDL.MAPS[mapIdx];

  // fish.js đọc HX.save.get().day để mở cá mập và preset; ở đây "ngày" = cấp của map.
  HX.save = {
    get: function () { return { day: curMap.level }; },
    store: function () { try { localStorage.setItem('bdl.save.v1', JSON.stringify({ day: curMap.level, map: curMap.id })); } catch (e) { /* trình duyệt chặn lưu thì thôi */ } },
  };

  var gfx = new HX.gfx.Gfx($('scene'));
  var fx = new HX.Fx(gfx);
  var caustic = gfx.tex('fx/E_Noise_Caustic_01A.png', true);
  caustic.wrapS = caustic.wrapT = THREE.RepeatWrapping;
  HX.gfx.water.uCaustic.value = caustic;

  var G = {
    phase: null, gfx: gfx, fx: fx, audio: HX.audio, hud: HX.hud,
    t: 0, shakeT: 0, shakeAmp: 0, shakeOffset: { x: 0, y: 0 }, hitstopT: 0,
    viewHalf: { w: 8, h: 4.5 }, catches: [], themeId: null, lastRoute: null, errors: [],
    loadout: null, haul: null, floors: [], map: curMap,
  };
  HX.game = G;

  G.shake = function (n) { G.shakeT = Math.max(G.shakeT, 0.18 + 0.1 * n); G.shakeAmp = Math.max(G.shakeAmp, T.fx.shake * n); };
  G.hitstop = function (t) { G.hitstopT = Math.max(G.hitstopT, t); };

  // Nhạc theo vùng: lấy khoá đầu tiên có trong assets (tiếng tầng giữa/vực sâu có thể chưa rút).
  var MUSIC = { A: ['bgm_ingame'], B: ['bgm_b', 'bgm_seablue', 'bgm_ingame'], C: ['bgm_c', 'bgm_deep'], night: ['bgm_night'] };
  var AMB = { A: ['amb_deep'], B: ['amb_b', 'amb_deep'], C: ['amb_c', 'amb_deep'], night: ['amb_deep'] };
  function firstKey(list) { for (var i = 0; i < list.length; i++) if (A.audio[list[i]]) return list[i]; return null; }
  // Cá mập đang săn Dave (BGM_Shark_Appear gốc) thì đè nhạc vùng.
  var HUNT = { chase: 1, charge: 1, attack: 1 };
  function sharkHunting() {
    return !!(G.fishes && G.fishes.list.some(function (f) { return f.sp.shark && HUNT[f.state]; }));
  }
  function musicFor(area) {
    if (dive && dive.hunt) return 'bgm_shark';
    return firstKey(G.stack && G.stack.theme.night ? MUSIC.night : MUSIC[area]);
  }
  function zoneSound(area) {
    var night = G.stack && G.stack.theme.night;
    var m = musicFor(area), a = firstKey(night ? AMB.night : AMB[area]);
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

  // Các hệ của lượt lặn (thuyền, đồ cổ + dây móc, quái, tay cầm…) tự đăng ký trong tệp riêng:
  // BDL.systems.push({ name, build(G, map), update(dt, input), teardown(G) }). Thứ tự gọi = thứ tự nạp tệp.
  BDL.systems = BDL.systems || [];
  function eachSystem(fn) { BDL.systems.forEach(function (s) { try { fn(s); } catch (e) { G.errors.push(s.name + ': ' + e); console.error(e); } }); }

  function teardown() {
    if (!dive) return;
    eachSystem(function (s) { if (s.teardown) s.teardown(G); });
    G.deck = null;
    dive.alive = false;
    HX.audio.stopAll();
    dive.layers.forEach(function (l) { if (l) l.remove(G); });
    dive.rays.remove(); dive.dust.remove(); dive.surface.remove();
    G.fishes.clear();
    G.harpoon.remove();
    if (G.gun) { G.gun.remove(); G.gun = null; }
    if (G.drone) { G.drone.remove(); G.drone = null; }
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

  // Tầng dưới nạp ngầm trong lúc đang lặn ở tầng trên.
  function loadLowerLayers() {
    var d = dive;
    d.stack.layers.slice(1).forEach(function (L) {
      HX.level.loadGlb(ROOT + 'art/' + L.zone.glb + '?v=' + REV).then(function (gltf) {
        if (!d.alive) return;
        d.layers[L.i] = new HX.level.Layer(G, L, gltf);
      }).catch(function (e) { G.errors.push(String(e)); });
    });
  }

  // Trang bị cố định của phase 1 (chưa có sảnh/nâng cấp): bậc đầu của bảng HX_META, O₂ 100, drone 3, chưa có súng phụ.
  function defaultLoadout() {
    var L = {};
    ['o2', 'cargo', 'suit', 'knife', 'harpoon', 'drone'].forEach(function (k) { L[k] = M.GEAR[k].levels[0].value; });
    L.o2 = 100; L.drone = 3; L.suit = 9999; L.gun = null;
    var h = M.HEADS.basic;
    L.head = { id: 'basic', name: h.name, icon: h.icon, lv: 1, effect: h.effect, dmg: h.levels[0].dmg, buff: null, rope: h.rope, aura: h.aura };
    return L;
  }

  function lastY1() { return G.floors[G.floors.length - 1].y1; }

  function buildDive(map, gltf0) {
    teardown();
    G.loadout = defaultLoadout();
    G.haul = null;
    var stack = new HX.dive.Stack(map.route, HX.dive.THEMES[map.theme]);
    G.themeId = map.theme;
    G.lastRoute = map.route.slice();
    G.stack = stack;
    G.floors = BDL.floorsOf(stack, map);
    BDL.floors = G.floors;
    // không sinh cá dưới tầng cuối (vùng áp suất) và ngoài các vùng cá của map (tiers)
    G.spawnOk = function (L, y) { return y >= lastY1() && map.tiers.indexOf(L.area) >= 0; };
    G.world = new HX.World(stack.walls);
    dive = {
      alive: true, stack: stack, layers: [new HX.level.Layer(G, stack.layers[0], gltf0)],
      rays: new HX.level.Rays(G), dust: new HX.level.Dust(G), surface: new HX.level.Surface(G), layerI: 0, maxDepth: 0,
    };
    G.dive = dive;
    var sp = findSpawn(G.world, stack.layers[0]);
    G.catches = [];
    G.fishes = new HX.fish.Fishes(G);
    G.diver = new HX.Diver(G, sp.x, sp.y);
    G.harpoon = new HX.Harpoon(G);
    G.gun = null;
    G.drone = G.loadout.drone > 0 ? new HX.Drone(G, G.loadout.drone) : null;
    BDL.run.beginDive(map);
    eachSystem(function (s) { if (s.build) s.build(G, map); });
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
    W.uLamp.value = lampK * ((G.stats && G.stats.lampMul) || 1);
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
    // camera dừng ở mép vùng áp suất (y1 của tầng cuối − 2)
    y = Math.min(V.boundTop, Math.max(lastY1() - 2, y));
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
    mx: 0, my: 0, boost: false, dash: false, melee: false, tap: false, drone: false,
    // nhặt / xả thịt xác cá: E, hoặc Space (nút Interaction gốc) khi đứng cạnh xác; giữ để xả thịt
    interact: false, interactHeld: false,
    fireHeld: false, firePressed: false, fireReleased: false,
    // súng phụ: nút bắn cảm ứng khi đang cầm súng. Game không có ngắm tự động: chạm không kéo là bắn theo hướng mặt.
    // aimCancel: thả cần ngắm trong ô Huỷ bắn
    gunHeld: false, gunPressed: false, gunReleased: false, aimCancel: false,
    sx: innerWidth * 0.7, sy: innerHeight * 0.5, aimX: 0, aimY: 0,
    touch: { stick: null, aim: null, boost: false, gun: false, interact: false },
    // Biệt Đội Lặn: jump = Space vừa bấm (trên boong là nhảy), skill = R, swap = lăn chuột ±1, slot = phím 1..3 (0 = không chọn).
    // Móc dây là chính súng xiên ở ô 0 (chuột trái theo hướng chuột), không có phím riêng.
    jump: false, skill: false, swap: 0, slot: 0,
  };
  var edges = { dash: false, melee: false, tap: false, interact: false, firePressed: false, fireReleased: false, gunPressed: false, gunReleased: false, aimCancel: false, drone: false,
    jump: false, skill: false, swap: 0, slot: 0 };
  BDL.input = input;
  var mouseGun = false;

  function isTouch() { return document.body.classList.contains('touch'); }

  addEventListener('keydown', function (e) {
    if (e.repeat) return;
    keys[e.code] = true;
    HX.audio.unlock();
    if (G.phase === 'dive') {
      // Space: giữ để tăng tốc (đọc ở readInput), bấm để giật dây khi giằng co; không còn lướt và không nhặt xác
      if (e.code === 'Space') { edges.tap = true; edges.jump = true; e.preventDefault(); }
      if (e.code === 'KeyR') edges.skill = true;
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') edges.slot = +e.code.slice(5);
      if (e.code === 'KeyE') edges.interact = true;
      if (e.code === 'KeyF') edges.melee = true;
      if (e.code === 'ControlLeft') edges.drone = true;   // gọi drone: SubInteraction của DRInput gốc là <Keyboard>/leftCtrl
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    }
    if (e.code === 'KeyM') toggleMute();
  });
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  addEventListener('blur', function () { keys = {}; input.fireHeld = false; mouseGun = false; input.touch.gun = false; input.touch.interact = false; input.touch.aim = null; if (input.touch.stick) stickEnd(input.touch.stick.id); });

  var canvas = $('scene');
  canvas.addEventListener('mousemove', function (e) { input.sx = e.clientX; input.sy = e.clientY; });
  addEventListener('mousemove', function (e) { stickMove('mouse', e.clientX, e.clientY); });
  canvas.addEventListener('mousedown', function (e) {
    HX.audio.unlock();
    input.sx = e.clientX; input.sy = e.clientY;
    if (G.phase !== 'dive' || paused) return;
    // chuột bấm trong đáy cần ở chỗ gốc (bl 540,360) thì kéo cần, không bắn [ĐỀ XUẤT: cả vùng cần 2400×1800 phủ nửa trái màn, chuột cần chỗ ngắm]
    if (e.button === 0 && !input.touch.stick && onStickHome(e.clientX, e.clientY)) { stickStart('mouse', e.clientX, e.clientY); return; }
    if (e.button === 0) { input.fireHeld = true; edges.firePressed = true; edges.tap = true; }
    if (e.button === 2) edges.tap = true;
  });
  addEventListener('mouseup', function (e) {
    if (e.button === 0) stickEnd('mouse');
    if (e.button === 0 && input.fireHeld) { input.fireHeld = false; edges.fireReleased = true; }
    if (e.button === 2 && mouseGun) { mouseGun = false; edges.gunReleased = true; }
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) { if (G.phase === 'dive') { edges.swap += e.deltaY > 0 ? 1 : -1; e.preventDefault(); } }, { passive: false });
  // nút cảm ứng của các hệ mới gọi BDL.press('skill'|'swap'|'jump'|'interact'), hoặc BDL.press('slot', 1..3)
  BDL.press = function (k, v) {
    if (k === 'swap') edges.swap += v || 1;
    else if (k === 'slot') edges.slot = v | 0;
    else edges[k] = true;
  };

  // Chạm: HUD cảm ứng theo bản Android (data/mobile_ui.js). Nửa dưới bên trái là cần nổi; nút bắn lớn là cần ngắm:
  // giữ để rút vũ khí, kéo để chọn hướng, thả để bắn, kéo vào ô "Huỷ bắn" rồi thả là thôi. Nút nhỏ cạnh nó đổi xiên ↔ súng phụ.
  var MUI = window.HX_MOBILE_UI;
  var ML = MUI.layouts.dive;
  var TOUCH = {
    zone: [ML.stickZone.w / 2, ML.stickZone.h / 2],   // [DtD mobile] Left Joystick 2400×1800 tâm ở góc dưới trái
    home: [ML.stick.dx, ML.stick.dy, ML.stick.w / 2],  // [DtD mobile] đáy cần 320 ở (540, 360) từ góc dưới trái: chỗ của cần cố định
    stickRange: MUI.numbers.dive.knob.m_MovementRange, // [DtD mobile] OnScreenStick_Normal 150
    aimRange: MUI.numbers.dive.aim.m_MovementRange,    // [DtD mobile] OnScreenStick_Fire 160
    dead: 0.125, deadMax: 0.925,  // [ĐỀ XUẤT] mặc định StickDeadzone của Unity Input System; prefab không ghi số riêng
    reach: 40,                    // [ĐỀ XUẤT] m, điểm ngắm đặt thật xa theo hướng cần để lệch vai–tâm Dave không làm lệch góc
  };
  var touchWeapon = 'harpoon';  // vũ khí đang nằm trên nút bắn lớn: 'harpoon' | 'gun'
  function mu() { return innerWidth / MUI.ref[0]; }
  function homeXY() { var u = mu(); return { x: TOUCH.home[0] * u, y: innerHeight - TOUCH.home[1] * u }; }
  function onStickHome(x, y) { var h = homeXY(); return Math.hypot(x - h.x, y - h.y) <= TOUCH.home[2] * mu() * (0.5 + HX.hud.prefs().size / 100); }
  // Cần trái: nổi (gốc = chỗ chạm) hoặc cố định (左摇杆固定: gốc = chỗ gốc của đáy cần).
  function stickStart(id, x, y) {
    var o = HX.hud.prefs().fixedStick ? homeXY() : { x: x, y: y };
    input.touch.stick = { id: id, x0: o.x, y0: o.y, x: x, y: y };
    showStick(true);
  }
  function stickMove(id, x, y) { var s = input.touch.stick; if (s && s.id === id) { s.x = x; s.y = y; } }
  function stickEnd(id) { if (input.touch.stick && input.touch.stick.id === id) { input.touch.stick = null; showStick(false); } }

  function onTouchStart(e) {
    document.body.classList.add('touch');
    HX.audio.unlock();
    if (G.phase !== 'dive' || paused) return;
    var u = mu();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (!input.touch.stick && t.clientX < TOUCH.zone[0] * u && innerHeight - t.clientY < TOUCH.zone[1] * u) stickStart(t.identifier, t.clientX, t.clientY);
      else edges.tap = true;  // giằng co: chạm chỗ nào cũng tính một lần giật (như chế độ 全屏 của bản Android)
    }
    e.preventDefault();
  }
  function onTouchMove(e) {
    for (var i = 0; i < e.changedTouches.length; i++) stickMove(e.changedTouches[i].identifier, e.changedTouches[i].clientX, e.changedTouches[i].clientY);
    e.preventDefault();
  }
  function onTouchEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) stickEnd(e.changedTouches[i].identifier);
  }
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  // Cố định cần thì đáy cần luôn nằm ở chỗ gốc trong lúc lặn.
  function showStick(on) {
    var s = input.touch.stick, el = $('stick'), o = on ? { x: s.x0, y: s.y0 } : homeXY();
    el.hidden = !on && !HX.hud.prefs().fixedStick;
    el.classList.remove('sprint');
    el.style.left = o.x + 'px'; el.style.top = o.y + 'px';
    $('stick-knob').style.transform = '';
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
  bindHold('tb-knife', function () { edges.melee = true; edges.tap = true; });
  // Nút tương tác 交互: chỉ hiện khi đứng cạnh xác cá; giữ để xả thịt cá lớn.
  bindHold('tb-grab', function () { edges.interact = true; input.touch.interact = true; }, function () { input.touch.interact = false; });
  bindHold('tb-qte', function () { edges.tap = true; });
  // 无人机: hợp đồng với phần đồ lặn: edges.drone một khung, G.drone chỉ có khi mang drone
  bindHold('tb-drone', function () { if (G.drone && G.drone.canCall()) edges.drone = true; });
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
    var s = input.touch.stick, wheel = false;
    if (s) {
      var v = stickVec(s.x - s.x0, s.y - s.y0, TOUCH.stickRange);
      if (v.l) { mx = v.x; my = v.y; }
      $('stick-knob').style.transform = 'translate(' + v.px.toFixed(1) + 'px,' + v.py.toFixed(1) + 'px)';
      // 冲刺模式 = 轮盘: đẩy cần tới mép tầm là tăng tốc, mũi tên quay theo hướng cần [ĐỀ XUẤT: ngưỡng = hết tầm]
      wheel = HX.hud.prefs().sprint === 'wheel' && v.l >= 1;
      $('stick').classList.toggle('sprint', wheel);
      if (wheel) $('stick-sprint').style.transform = 'rotate(' + Math.atan2(v.px, -v.py).toFixed(3) + 'rad)';
    }
    var l2 = Math.hypot(mx, my);
    if (l2 > 1) { mx /= l2; my /= l2; }
    input.mx = mx; input.my = my;
    if (G.phase !== 'dive') input.touch.boost = false;
    input.boost = !!(keys.ShiftLeft || keys.ShiftRight || keys.Space) || input.touch.boost || wheel;
    edges.dash = false;
    input.jump = edges.jump; input.skill = edges.skill; input.swap = edges.swap; input.slot = edges.slot;
    input.dash = edges.dash; input.melee = edges.melee; input.tap = edges.tap; input.drone = edges.drone;
    input.interact = edges.interact; input.interactHeld = !!keys.KeyE || input.touch.interact;
    input.firePressed = edges.firePressed; input.fireReleased = edges.fireReleased; input.aimCancel = edges.aimCancel;
    input.gunHeld = mouseGun || input.touch.gun; input.gunPressed = edges.gunPressed; input.gunReleased = edges.gunReleased;
    var a = input.touch.aim, d = G.diver;
    if (a && d) {
      // chưa kéo khỏi vùng chết: xiên chĩa thẳng hướng mặt, súng phụ tự nhắm con gần nhất như nút Súng cũ [ĐỀ XUẤT]
      var av = stickVec(a.x - a.x0, a.y - a.y0, TOUCH.aimRange), n = Math.hypot(av.x, av.y);
      input.aimX = d.pos.x + (n ? av.x / n : d.facing) * TOUCH.reach;
      input.aimY = d.pos.y + (n ? av.y / n : 0) * TOUCH.reach;
    } else {
      var w = gfx.screenToWorld(input.sx, input.sy);
      input.aimX = w.x; input.aimY = w.y;
    }
    edges.dash = edges.melee = edges.tap = edges.interact = edges.firePressed = edges.fireReleased = edges.gunPressed = edges.gunReleased = edges.aimCancel = edges.drone = false;
    edges.jump = edges.skill = false; edges.swap = 0; edges.slot = 0;
  }

  // Trạng thái HUD cảm ứng cho khung này (HX.hud.touch).
  // Mũi xiên đang lắp nằm trên nút bắn như GunShow của bản Android (ảnh *_Thumbnail của mũi, HX_META.HEADS[id].thumb);
  // thiếu thì ảnh icon của mũi, rồi tới NormalHarpoonHead_Thumbnail bóc từ APK.
  function headIcon() {
    var h = G.loadout && G.loadout.head, H = h && M.HEADS && M.HEADS[h.id], src = (H && H.thumb) || (h && h.icon);
    return ROOT + (src || 'art/ui/mobile/icon_harpoon.png') + '?v=' + REV;
  }
  function touchHud(d) {
    var a = input.touch.aim;
    var harpoon = { icon: headIcon(), lv: 1 };
    var av = a && stickVec(a.x - a.x0, a.y - a.y0, TOUCH.aimRange);
    return {
      boost: input.touch.boost, dashK: 0, qte: d.state === 'tug',
      aim: a ? { x: av.px, y: av.py, over: a.over } : null,
      fire: BDL.items && BDL.items.fireIcon() ? { icon: BDL.items.fireIcon(), lv: 0 } : harpoon, sub: null,
      drone: G.drone ? { left: G.drone.left, ok: G.drone.canCall() } : null,
    };
  }

  // ---------- tạm dừng & tắt tiếng ----------
  var paused = false, soundDirty = false;
  function togglePause() {
    if (G.phase !== 'dive') return;
    paused = !paused;
    HX.hud.pause(paused);
    if (paused) HX.audio.setMuted(true); else HX.audio.setMuted(muted);
    if (!paused && soundDirty && !muted) zoneSound(G.stack.layerAt(G.diver.pos.y).area);
    soundDirty = false;
  }
  var muted = false;
  try { muted = localStorage.getItem('bdl.mute') === '1'; } catch (e) { muted = false; }
  HX.audio.setMuted(muted);
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('bdl.mute', muted ? '1' : '0'); } catch (e) { /* bỏ qua */ }
    if (paused) { soundDirty = true; return; }
    HX.audio.setMuted(muted);
    if (!muted && G.phase === 'dive') zoneSound(G.stack.layerAt(G.diver.pos.y).area);
  }
  $('btn-pause').addEventListener('click', togglePause);
  HX.hud.onPrefs(function () { if (G.phase === 'dive' && !input.touch.stick) showStick(false); });

  // ---------- các pha ----------
  // Sổ pha như Hố Xanh: mỗi pha { surface: '3d' | '2d' | 'dom' | 'scene', enter(args), exit(), update(dt), render() }.
  //   3d   : cảnh lặn three.js (#scene), main.js chạy step() và vẽ.
  //   dom  : vẽ cảnh nước trống làm nền, pha dựng giao diện trong G.screen(tên).
  //   2d   : #stage2d phủ kín màn, pha tự vẽ trong render() lên G.stage2d.ctx.
  //   scene: pha tự dựng cảnh three.js riêng và tự vẽ bằng G.gfx.renderer (cano chạy về quán).
  // Pha ngoài main.js tự đăng ký vào HX.phases từ tệp riêng (cruise.js, shop.js).
  function phase(name) { return PHASES[name] || (HX.phases && HX.phases[name]) || null; }
  function go(name, args) {
    var next = phase(name);
    if (!next) throw new Error('không có pha "' + name + '" trong sổ pha');
    var prev = G.phase && phase(G.phase);
    if (prev && prev.exit) prev.exit();
    if (name === 'loading' || next.surface !== '3d') teardown();
    G.phase = name;
    document.body.dataset.phase = name;
    document.body.dataset.surface = next.surface;
    showScreen(name);
    if (next.enter) next.enter(args || {});
  }
  G.go = go;
  G.phaseOf = phase;

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

  var PHASES = {
    lobby: {
      surface: 'dom',
      enter: function () {
        document.body.classList.remove('in-run');
        $('menu').hidden = false;
        paused = false; HX.hud.pause(false);
        HX.audio.stopAll();
        BDL.ui.render();
      },
      exit: function () { $('menu').hidden = true; },
    },
    loading: {
      surface: '3d',
      enter: function () {
        var map = curMap, kShared = 0, kGlb = 0;
        HX.save.store();
        paused = false; HX.hud.pause(false);
        var prog = function () { HX.hud.loading(kShared * 0.6 + kGlb * 0.4); };
        HX.hud.loading(0, 'Đang xuống ' + map.name + '…');
        Promise.all([
          loadShared(function (k) { kShared = k; prog(); }),
          HX.level.loadGlb(ROOT + 'art/' + window.HX_ZONES[map.route[0]].glb + '?v=' + REV, function (k) { kGlb = k; prog(); }),
        ]).then(function (r) {
          if (G.phase !== 'loading' || curMap !== map) return;
          kShared = kGlb = 1; prog();
          buildDive(map, r[1]);
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
        HX.hud.area(curMap.name, 'Lặn ' + (curMap.id + 1) + '/' + BDL.MAPS.length + ' · ' + G.floors.length + ' tầng');
        showStick(false);
      },
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
    HX.hud.toast(HX.fish.displayName(f.sp));
  };

  // Lên mặt nước không kết thúc lượt lặn (thuyền đến ở phase 2); Dave cứ ở lại mặt nước.
  G.onSurface = function () {};
  // ---------- vòng một ca: sảnh → cano ra → lặn → khoang lái → cano về → trạm → … → kết ca ----------
  // Pha cano/trạm (cruise.js, shop.js) chưa đăng ký thì bỏ qua thẳng bước sau.
  function cruise(dir, then) { if (phase('cruise')) go('cruise', { dir: dir, then: then }); else then(); }
  function shop(then) { if (phase('shop')) go('shop', { then: then }); else then(); }
  function diveMap(i) {
    curMap = BDL.MAPS[i]; G.map = curMap;
    if (BDL.restock) BDL.restock(BDL.run.ca);
    go('loading');
  }

  BDL.onSail = function () {
    HX.audio.unlock();
    var crew = BDL.meta.runStart();
    var ca = BDL.run.start();
    ca.crew = crew;
    if (crew.loadout) ca.stash.push({ key: crew.loadout.key, uses: crew.loadout.uses });
    document.body.classList.add('in-run');
    cruise('out', function () { diveMap(0); });
  };

  // Hết ca (thắng, chết, bỏ ca): trả vàng theo REPO (55% tiền đã giao + thưởng chuyến đã qua) rồi về sảnh.
  function finishRun(win) {
    var ca = BDL.run.ca;
    var res = BDL.meta.runFinish({ delivered: ca.total, mapsCleared: ca.cleared, win: win, kills: ca.kills, skills: ca.skills, floors: ca.floorsMax, lootValue: ca.total });
    BDL.run.ca = null; BDL.run.dive = null;
    go('lobby');
    BDL.ui.showRunEnd(res);
  }
  BDL.finishRun = finishRun;

  // Khoang lái đếm ngược xong (hệ thuyền gọi): tiền boong vào ví ca, cano chạy về quán-trạm, rồi ra map sau.
  G.onExtract = function () {
    if (G.phase !== 'dive') return;
    var ca = BDL.run.endDive();
    ca.floorsMax += curMap.floors;
    if (devMap) {
      HX.hud.toast('Về quán · ví ca ' + fmt(ca.wallet));
      diveMap(ca.mapIdx % BDL.MAPS.length);
      return;
    }
    if (ca.mapIdx >= BDL.MAPS.length) { cruise('home', function () { finishRun(true); }); return; }
    cruise('home', function () { shop(function () { cruise('out', function () { diveMap(ca.mapIdx); }); }); });
  };
  G.onPod = function () {};
  // Hết O₂ là cả tổ gục như REPO: mất lượt lặn đang dở, ca kết thúc, vẫn nhận phần đã giao ở các lượt trước.
  G.onDead = function () {
    if (G.phase !== 'dive') return;
    HX.audio.stopMusic(0.6);
    HX.hud.toast('Hết O₂');
    if (devMap) return;
    setTimeout(function () { if (G.phase === 'dive' && BDL.run.ca) { BDL.run.dive = null; finishRun(false); } }, 2600);
  };

  // Sang tầng địa hình khác (glb): đổi nhạc; cá mập bắt đầu hoặc thôi săn thì đổi nhạc.
  function checkLayer() {
    var L = G.stack.layerAt(G.diver.pos.y), hunt = sharkHunting();
    if (hunt !== !!dive.hunt) { dive.hunt = hunt; HX.audio.music(musicFor(L.area), 0.8); }
    if (L.i === dive.layerI) return;
    dive.layerI = L.i;
    zoneSound(L.area);
  }

  // ---------- vòng lặp ----------
  var last = performance.now(), fpsAcc = 0, fpsN = 0;
  G.fps = 60;
  // Cầm dọc trên máy cảm ứng: #rotate (index.html) phủ kín màn, game đứng yên tới khi xoay ngang.
  var portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (paused || portrait.matches) { gfx.render(G.t); return; }
    G.t += dt;
    var P = phase(G.phase);
    if (P.surface === '3d' && dive && G.phase === 'dive') step(dt);
    if (P.update) P.update(dt);
    if (P.surface === '3d' || P.surface === 'dom') gfx.render(G.t);
    if (P.render) P.render();
  }

  // Đáy tầng cuối là bức chắn áp suất: Dave bị đẩy ngược lên, không mất O₂.
  // Bản đầu trừ 8 O₂/s dưới đáy tầng cuối; chủ dự án bơi lọt xuống (hình map còn kéo sâu tiếp) và tưởng là lỗi mất máu.
  // Cảnh báo hiện khi tới gần đáy, và giữ thêm 2 giây sau lần chạm cuối để kịp đọc.
  var PRESS_WARN = 2.5, PRESS_HOLD = 2;
  function pressure(dt) {
    var d = G.diver, floor = lastY1();
    dive.pressShow = Math.max(0, (dive.pressShow || 0) - dt);
    if (d.pos.y < floor) dive.pressShow = PRESS_HOLD;
    HX.hud.pressure((d.pos.y < floor + PRESS_WARN || dive.pressShow > 0) && d.state !== 'dead');
    if (d.pos.y >= floor) return;
    d.pos.y += (floor - d.pos.y) * Math.min(1, dt * 8);
    if (d.vel.y < 0) d.vel.y = -d.vel.y * 0.3;
  }

  function step(dt) {
    readInput();
    var gdt = dt;
    if (G.hitstopT > 0) { G.hitstopT -= dt; gdt = dt * 0.08; }
    // Đứng trên boong (G.deck.on, do hệ thuyền đặt) thì hệ thuyền tự lái Dave; người lặn và xiên đứng yên.
    if (!(G.deck && G.deck.on)) {
      G.diver.update(gdt, input);
      G.harpoon.update(gdt);
    }
    if (G.drone) G.drone.update(gdt);
    G.fishes.update(gdt);
    eachSystem(function (s) { if (s.update) s.update(gdt, input); });
    // một hệ có thể vừa kết thúc lượt lặn (khoang lái → G.onExtract → go('loading') dỡ cảnh): dừng khung này
    if (!dive || G.phase !== 'dive') return;
    pressure(gdt);
    fx.update(gdt);
    updateCamera(dt);
    updateEnv(dt);
    dive.rays.update(G.t);
    dive.dust.update(G.t);
    dive.surface.update();
    var cam = gfx.camera.position;
    dive.layers.forEach(function (l) { if (l) l.update(gdt, cam, G.viewHalf.w, G.viewHalf.h); });
    checkLayer();
    hudTick();
  }

  function fmt(n) { return '$' + Math.round(n).toLocaleString('vi-VN'); }
  BDL.fmt = fmt;

  function depthM(y) { return Math.max(0, T.water.surfaceY - y); }

  function hudTick() {
    var d = G.diver;
    HX.hud.o2(d.o2, G.loadout.o2);
    HX.hud.stamina(d.stamina, (G.stats && G.stats.staminaMax) || 100);
    var rd = BDL.run.dive;
    if (rd) HX.hud.quota('Chỉ tiêu ' + fmt(rd.onDeck) + ' / ' + fmt(rd.quota) + (BDL.run.quotaMet() ? ' ✓' : ''));
    var dm = depthM(d.pos.y);
    HX.hud.depth(dm, BDL.floorAt(d.pos.y, G.floors), G.floors.length);
    dive.maxDepth = Math.max(dive.maxDepth, dm);
    if (d.state === 'tug') {
      var s = gfx.worldToScreen(d.pos.x + d.facing * -0.6, d.pos.y + 0.2);
      HX.hud.tugAt(s.x, s.y);
      if (input.tap) HX.hud.tugTap();
    }
    HX.hud.touch(touchHud(d));
    var hp = d.harvestPrompt();
    if (hp) {
      var hc = hp.fish.center(), hs = gfx.worldToScreen(hc.x, hc.y + hp.fish.hh);
      HX.hud.harvest({ x: hs.x, y: hs.y, carve: hp.carve, k: hp.k, icon: hp.carve ? HX.fish.iconFor(gfx, hp.fish.sp) : null });
    } else HX.hud.harvest(null);
    var aiming = d.state === 'aim';
    var showRet = !isTouch() && d.state !== 'dead';
    var tip = d.gunTip(), ts = gfx.worldToScreen(tip.x + Math.cos(d.aimAngle) * 0.35, tip.y + Math.sin(d.aimAngle) * 0.35);
    HX.hud.reticle(showRet, input.sx, input.sy, aiming, ts.x, ts.y, d.aimAngle);
  }

  // --px: hệ số phóng ảnh giao diện điểm ảnh, giữ cỡ như khi còn vẽ khung thấp 650 dòng.
  function onResize() {
    gfx.resize();
    if (dive) viewHalf();
    document.body.style.setProperty('--px', (innerHeight / 650).toFixed(3));
  }
  addEventListener('resize', onResize);
  onResize();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  HX.hud.diveUi();
  HX.hud.applyPrefs();

  // ---------- móc cho bộ kiểm (test/biet-doi-lan-suite.js) ----------
  window.BDL_DEBUG = {
    info: function () {
      var d = G.diver, floors = G.floors.map(function (f) { return { i: f.i, y0: f.y0, y1: f.y1 }; });
      var scr = d && dive ? gfx.worldToScreen(d.pos.x, d.pos.y) : null;
      return {
        phase: G.phase, map: curMap.id, floors: floors, floor: d && dive ? BDL.floorAt(d.pos.y, G.floors) : -1,
        depth: d && dive ? depthM(d.pos.y) : 0, o2: d ? d.o2 : 0, o2max: G.loadout ? G.loadout.o2 : 0, stamina: d ? d.stamina : 0,
        x: d ? d.pos.x : 0, y: d ? d.pos.y : 0, state: d ? d.state : null,
        screen: scr, route: dive ? G.stack.layers.map(function (L) { return L.id; }) : [], fish: G.fishes ? G.fishes.list.length : 0,
        errors: G.errors.slice(), minY: dive ? G.stack.minY : 0,
        run: BDL.run.dive ? { quota: BDL.run.dive.quota, onDeck: BDL.run.dive.onDeck, lootTotal: BDL.run.dive.lootTotal, pile: BDL.run.dive.pile.length, sold: BDL.run.dive.sold } : null,
        ca: BDL.run.ca, deck: !!(G.deck && G.deck.on), systems: BDL.systems.map(function (s) { return s.name; }),
      };
    },
    teleport: function (x, y) { G.diver.pos.x = x; G.diver.pos.y = y; G.diver.vel.x = G.diver.vel.y = 0; snapCamera(); updateEnv(1); },
    hurt: function (n) { return G.diver.hurt(n, G.diver.pos.x - 1, G.diver.pos.y); },
    spawnFish: function (id, x, y) { return G.fishes.spawnAt(HX.fish.BY_ID[id], x, y).id; },
    fishAt: function () { return G.fishes.list.map(function (f) { return { id: f.sp.id, x: f.pos.x, y: f.pos.y, state: f.state }; }); },
    go: function (n) {
      curMap = BDL.MAPS[Math.max(0, Math.min(BDL.MAPS.length - 1, n | 0))]; G.map = curMap;
      go('loading');
    },
  };

  G.loaded = loadShared(function () {});
  if (devMap) { BDL.run.start(); go('loading'); }
  else {
    BDL.meta.load();
    if (BDL.meta.syncFromHub) BDL.meta.syncFromHub().then(function (r) { if (r && r.took === 'cloud' && G.phase === 'lobby') BDL.ui.render(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) BDL.meta.save(true); });
    go('lobby');
  }
  requestAnimationFrame(frame);
})(window.HX = window.HX || {});
