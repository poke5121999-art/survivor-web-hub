// Thuyền trên mặt biển: cano Nodens của Dave nằm ngang mặt nước. Đầu lượt Dave đứng trên boong, Space nhảy xuống nước;
// dưới nước gần thân thuyền bấm E leo lên (kéo theo món đang móc, xả túi cá), đồ lên boong gom về một đống,
// E ở tủ đồ mở tủ, đứng đủ 5 giây trong khoang lái (khi đủ chỉ tiêu) thì thuyền rời đi: G.onExtract().
// Số đo: toạ độ "cục bộ" (lx, ly) là toạ độ của boat.glb (mũi ở −x; mặt nước ở ly ≈ 0,2).
(function (BDL) {
  'use strict';
  var HX = window.HX, T = window.HX_TUNING, A = window.HX_ASSETS, BA = window.HX_BOAT_ASSETS;
  var SURF = T.water.surfaceY;

  // ---------- số đo [ĐO TRONG REPO: raycast xuống boat.glb] ----------
  var BOAT_X = -48.5;          // x thế giới của gốc glb; thân −6,4..+6,2 → x −55,5..−41,7, cách vách đá (x ≤ −59 ở y 20) hơn 3 m
  var BOAT_Z = -2.3;           // lùi sau mặt phẳng chơi (z 0,1 của Dave lặn) để người bơi luôn nằm trước thân; phao tròn nhô nhất tới z −0,2
  var K = (T.view.dist + 2.3) / T.view.dist;   // phóng ngang/dọc bù viễn cận: ở z −2,3 thuyền trông bằng cỡ ở z 0
  var WATERLINE = -0.2;        // [DtD] heightOffset của DynamicEnvironmentBoatFloating: gốc glb thấp hơn mặt sóng 0,2
  var HULL = { x0: -6.4, x1: 6.2, bottom: -0.69 };
  // đường đi của Dave trên boong: [lx, ly]. Sàn thật của glb ở 0,83 (đuôi) / 1,03 (buồng lái) nhưng mạn gần che chân tới ~1,3 nên
  // chân Dave đặt cao hơn sàn 0,4 để thấy đứng trên boong chứ không chìm sau mạn (đo trên ảnh chụp).
  var DECK = [[-3.3, 1.43], [-1.2, 1.43], [-0.2, 1.23], [4.4, 1.23], [4.8, 1.12], [5.2, 0.95]];
  var WALK = { min: -3.3, max: 5.0, speed: 3.2 };
  var CABIN = { x0: -3.3, x1: -1.1 };           // khoang lái: dưới cửa sổ x −3,83..−1,30 của glb
  var LOCKER = { x: 2.6, r: 1.0, top: 1.83 };   // BoatInventoryBox trong glb: x 2,09..3,19
  var PILE = { x: 4.25, rows: 5, cols: 4, dx: 0.48, dy: 0.46, size: 0.85 };              // đống đồ ở sàn đuôi
  var DAVE_H = 2.4;                             // cạnh ô 64 px của sheet dave_lobby, mét thế giới
  var DAVE_Z = 0.45, PILE_Z = 0.3;
  var COUNTDOWN = 5;                            // R.E.P.O.: đứng trong xe 5 giây là rời đi

  function deckY(lx) {
    if (lx <= DECK[0][0]) return DECK[0][1];
    for (var i = 1; i < DECK.length; i++) {
      if (lx <= DECK[i][0]) { var a = DECK[i - 1], b = DECK[i]; return a[1] + (b[1] - a[1]) * (lx - a[0]) / (b[0] - a[0]); }
    }
    return DECK[DECK.length - 1][1];
  }

  // ---------- túi cá theo ký ----------
  BDL.bagCap = function () { return (HX.game && HX.game.loadout && HX.game.loadout.bagKg) || 20; };   // [ĐỀ XUẤT] 20 kg gốc
  BDL.bagKg = function () {
    var G = HX.game, kg = 0;
    if (!G || !G.catches) return 0;
    G.catches.forEach(function (id) { var sp = HX.fish.BY_ID[id]; if (sp) kg += BDL.fishKg(sp); });
    return Math.round(kg * 10) / 10;
  };
  function kgText(n) { return n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  // ---------- trạng thái ----------
  var S = null;
  var $ = function (id) { return document.getElementById(id); };
  var texCache = {};

  function el(tag, id, cls, parent, html) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    (parent || document.body).appendChild(e);
    return e;
  }

  function buildDom() {
    if ($('ship-ui')) return;
    var root = el('div', 'ship-ui');
    el('div', 'ship-bag', null, root);
    el('div', 'ship-prompt', null, root, '<b class="key">E</b><span class="txt"></span>');
    el('div', 'ship-float', null, root);
    el('div', 'ship-board', null, root,
      '<div class="disc"><div class="ring"></div><div class="num">5</div></div><div class="lbl">Nổ máy</div><div class="sub">Ở yên trong khoang lái</div>');
    var touch = el('div', 'ship-touch', null, root);
    var bj = el('button', 'ship-btn-jump', 'ship-btn', touch, '<span>Nhảy</span>');
    var be = el('button', 'ship-btn-e', 'ship-btn', touch, '<span>E</span>');
    bj.setAttribute('aria-label', 'Nhảy xuống nước'); be.setAttribute('aria-label', 'Tương tác');
    function bind(b, key) {
      var go = function (e) { e.preventDefault(); e.stopPropagation(); HX.audio.unlock(); if (BDL.press) BDL.press(key); };
      b.addEventListener('touchstart', go, { passive: false });
      b.addEventListener('mousedown', go);
    }
    bind(bj, 'jump'); bind(be, 'interact');
  }

  // Ảnh cho món trên đống: đường dẫn ảnh, data URL, hoặc emoji.
  function iconTex(icon, onSize) {
    icon = icon || '📦';
    var c = texCache[icon];
    if (c) { if (onSize) { if (c.w) onSize(c.w, c.h); else c.cb.push(onSize); } return c.tex; }
    c = texCache[icon] = { tex: null, w: 0, h: 0, cb: onSize ? [onSize] : [] };
    if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(icon) || /^(data:image|blob:)/.test(icon)) {
      c.tex = new THREE.TextureLoader().load(icon, function (t) {
        c.w = t.image.width; c.h = t.image.height;
        c.cb.forEach(function (f) { f(c.w, c.h); }); c.cb.length = 0;
      });
      c.tex.magFilter = THREE.LinearFilter; c.tex.minFilter = THREE.LinearMipmapLinearFilter;
    } else {
      var cv = document.createElement('canvas'); cv.width = cv.height = 96;
      var cx = cv.getContext('2d'); cx.font = '72px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(icon, 48, 52);
      c.tex = new THREE.CanvasTexture(cv); c.w = c.h = 96;
    }
    return c.tex;
  }

  // ---------- thuyền ----------
  function loadBoat(s) {
    HX.level.loadGlb(HX.ROOT + BA.boat.glb).then(function (gltf) {
      if (!s.alive) return;
      var mats = {}, model = gltf.scene.clone(true);
      model.traverse(function (o) {
        if (!o.isMesh) return;
        var src = o.userData.hxSrcMat || o.material;
        o.userData.hxSrcMat = src;
        if (!mats[src.uuid]) {
          if (src.map) { src.map.magFilter = THREE.LinearFilter; src.map.minFilter = THREE.LinearMipmapLinearFilter; src.map.anisotropy = 4; src.map.needsUpdate = true; }
          var m = HX.gfx.terrainMaterial({ map: src.map, kind: 'deco', color: [src.color.r, src.color.g, src.color.b] });
          // phần thân chìm dưới mặt nước ngả màu nước (ánh sáng cảnh lặn chỉ tính theo độ sâu của camera, không biết mặt nước)
          m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4(hxFogMix(c.rgb, vD), 1.0);',
            'float sub = smoothstep(uSurfY + 0.15, uSurfY - 0.45, vW.y); c.rgb = mix(c.rgb, c.rgb * vec3(0.5, 0.78, 0.95) + uFogNear * 0.22, sub * 0.75); gl_FragColor = vec4(hxFogMix(c.rgb, vD), 1.0);');
          // phải nằm trong hàng đợi trong suốt thì mới vẽ SAU lớp loá mặt nước (renderOrder 6, không so chiều sâu)
          m.transparent = true; m.depthWrite = true;
          mats[src.uuid] = m;
        }
        o.material = mats[src.uuid];
        o.renderOrder = 7;
      });
      s.model = model; s.mats = mats;
      s.group.add(model);
      s.boatReady = true;
    }, function (e) { HX.game.errors.push('ship: ' + e); });
  }

  function wx(lx) { return S.x0 + lx * K; }
  function wy(ly) { return S.y0 + S.bob + ly * K; }

  // ---------- Dave trên boong ----------
  function frameCol(anim, t) {
    var a = BA.dave.anims[anim];
    if (!a || !a.frames) return 0;
    var tt = a.loop ? t % a.length : Math.min(t, a.length - 1e-4), acc = 0, col = a.frames[0][0];
    for (var i = 0; i < a.frames.length; i++) { acc += a.frames[i][1]; col = a.frames[i][0]; if (tt < acc) break; }
    return col;
  }
  function setDaveCell(anim, t, flip) {
    var a = BA.dave.anims[anim] || BA.dave.anims.Idle, col = frameCol(anim, t);
    var W = 1152, H = 1856, cw = 64, r = S.dave.material.uniforms.uvRect.value;
    var u0 = col * cw / W, v0 = 1 - (a.row + 1) * cw / H, du = cw / W, dv = cw / H;
    if (flip) r.set(u0 + du, v0, -du, dv); else r.set(u0, v0, du, dv);
  }

  function sfx(key, vol) { HX.audio.play(key, { vol: vol == null ? 0.8 : vol }); }

  function placeDiver(x, y) {
    var d = S.G.diver, dk = S.G.deck;
    d.pos.x = x; d.pos.y = y; d.vel.x = d.vel.y = 0;
    dk.px = x; dk.py = y;
  }

  function enterDeck(lx, how) {
    var G = S.G, d = G.diver, dk = G.deck;
    dk.on = true; dk.mode = how === 'climb' ? 'climb' : 'walk';
    dk.lx = lx; dk.vx = dk.vy = 0; dk.cd = COUNTDOWN; dk.climbT = 0; dk.zone = 'deck'; dk.animT = 0;
    dk.face = dk.face || 1;
    dk.px = d.pos.x; dk.py = d.pos.y;
    d.go('surfaced');
    d.root.visible = false;
    if (d.trail) { d.trail.stop(); d.trail = null; d.trailName = null; }
    if (d.breath) { d.breath.stop(); d.breath = null; }
    S.dave.visible = true;
    T.view.boundTop = S.boundDeck;
    var H = G.harpoon;
    if (H && H.state !== 'ready') {   // xiên đang bay dở: thu về ngay (update của nó đứng yên trên boong)
      try { H.drop(); H.state = 'ready'; H.fish = null; H.mesh.visible = false; if (H.rope) H.rope.visible = false; } catch (e) { /* trạng thái xiên lạ thì bỏ qua */ }
    }
  }

  function leaveDeck(state) {
    var G = S.G, d = G.diver, dk = G.deck;
    dk.on = false; dk.mode = 'water';
    S.dave.visible = false;
    d.root.visible = true;
    d.facing = dk.face || 1;
    d.go(state || 'enter');
    S.camHold = 1.4;
  }

  function splash(x, vol) {
    var G = S.G;
    G.fx.burst('bubbleBig', x, SURF - 0.1, 14, 2.2);
    G.fx.burst('puff', x, SURF - 0.05, 4, 0.9);
    sfx('boat_splash', vol == null ? 0.9 : vol);
  }

  function doJump() {
    var dk = S.G.deck;
    if (!dk.on || dk.mode !== 'walk') return false;
    dk.mode = 'jump';
    dk.wx = wx(dk.lx); dk.wy = wy(deckY(dk.lx));
    dk.vx = dk.vx !== 0 ? dk.vx * 1.15 : dk.face * 2.2;
    dk.vy = 7.2;
    dk.animT = 0;
    sfx('boat_dive', 0.6);
    return true;
  }

  function board() {
    var G = S.G, d = G.diver, total = 0, items = [];
    if (G.deck.on) return false;
    var fromX = d.pos.x, fromY = d.pos.y;
    // đang kéo gì thì kéo lên cùng
    var tgt = BDL.tether && BDL.tether.target && BDL.tether.target();
    if (tgt && BDL.tether.consume) {
      var it = BDL.tether.consume();
      if (it) items.push(it);
    }
    // xả túi cá
    var bag = G.catches.slice();
    G.catches.length = 0;
    bag.forEach(function (id) {
      var sp = HX.fish.BY_ID[id];
      if (!sp) return;
      var icon;
      try { icon = HX.fish.iconFor(G.gfx, sp); } catch (e) { icon = '🐟'; }
      items.push({ kind: 'fish', key: id, label: HX.fish.displayName(sp), value: BDL.fishValue(sp), icon: icon });
    });
    S.arrive = { x: fromX, y: Math.min(fromY, SURF - 0.2) };
    enterDeck(5.0, 'climb');
    G.deck.arrival = S.arrive;
    splash(fromX, 0.6);
    items.forEach(function (it) { total += Math.max(0, Math.round(it.value)); BDL.run.deliver(it); });
    HX.hud.toast(items.length ? 'Lên thuyền · ' + items.length + ' món · +' + BDL.fmt(total) : 'Lên thuyền');
    return true;
  }

  // ---------- đống đồ ----------
  function pileSlot(k) {
    var row = Math.floor(k / PILE.cols) % PILE.rows, col = k % PILE.cols, odd = row % 2 ? PILE.dx / 2 : 0;
    var lx = Math.min(5.05, PILE.x + (col - (PILE.cols - 1) / 2) * PILE.dx + odd);
    return { lx: lx, ly: deckY(lx) + 0.3 + row * PILE.dy, jit: ((k * 37) % 11 - 5) * 0.012 };
  }

  function addPile(item) {
    if (!S || !S.alive || item.__piled) return;
    item.__piled = true;
    var k = S.pile.length, slot = pileSlot(k), size = PILE.size, m;
    m = HX.gfx.sprite(iconTex(item.icon, function (w, h) { var q = size / Math.max(w, h); m.scale.set(w * q, h * q, 1); }), size, size, { alphaCut: 0.3, depthWrite: true });
    m.renderOrder = 8 + (k % 40) * 0.01;
    var from = S.arrive || { x: wx(slot.lx), y: wy(slot.ly) };
    m.userData = { slot: slot, k: k, t: 0, sx: from.x, sy: from.y };
    S.G.gfx.scene.add(m);
    S.pile.push(m);
    floatText('+' + BDL.fmt(item.value), wx(slot.lx), wy(slot.ly) + 0.7, item.kind === 'fish' ? 'fish' : '');
  }

  function updatePile(dt) {
    S.pile.forEach(function (m) {
      var u = m.userData; u.t += dt;
      var tx = wx(u.slot.lx), ty = wy(u.slot.ly) + u.slot.jit;
      var k = Math.min(1, u.t / (0.45 + (u.k % 6) * 0.04)), e = k * k * (3 - 2 * k);
      m.position.set(u.sx + (tx - u.sx) * e, u.sy + (ty - u.sy) * e + Math.sin(k * Math.PI) * 1.4, PILE_Z + (u.k % 5) * 0.004);
      m.rotation.z = (1 - k) * 2.4 + u.slot.jit * 3;
    });
  }

  // ---------- chữ nổi ----------
  function floatText(txt, x, y, cls) {
    S.floats.push({ e: el('div', null, 'ship-fl ' + (cls || ''), $('ship-float'), txt), x: x, y: y, t: 0 });
  }
  function updateFloats(dt) {
    var G = S.G;
    for (var i = S.floats.length - 1; i >= 0; i--) {
      var f = S.floats[i]; f.t += dt;
      if (f.t > 1.6) { f.e.remove(); S.floats.splice(i, 1); continue; }
      var p = G.gfx.worldToScreen(f.x, f.y + f.t * 0.7);
      f.e.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-50%)';
      f.e.style.opacity = f.t < 1.1 ? 1 : 1 - (f.t - 1.1) / 0.5;
    }
  }

  // ---------- giao diện ----------
  function setPrompt(kind, txt, x, y) {
    var p = $('ship-prompt');
    S.promptOn = !!kind; S.promptKind = kind;
    p.classList.toggle('on', !!kind);
    if (!kind) return;
    p.classList.toggle('space', kind === 'jump');
    p.querySelector('.key').textContent = kind === 'jump' ? 'Space' : 'E';
    if (p._txt !== txt) { p.querySelector('.txt').textContent = txt; p._txt = txt; }
    p.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
  }

  function updateBag() {
    var kg = BDL.bagKg(), cap = BDL.bagCap(), b = $('ship-bag');
    var txt = 'Túi cá ' + kgText(kg) + ' / ' + kgText(cap).replace(',0', '') + ' kg';
    if (b._txt !== txt) { b.textContent = txt; b._txt = txt; }
    b.classList.toggle('full', kg >= cap - 0.05);
    b.classList.add('on');
  }

  function showBoard(on, txt) {
    var b = $('ship-board');
    b.classList.toggle('on', !!on);
    b.classList.toggle('msg', !!txt);
    S.msg = txt || null;
    var sub = b.querySelector('.sub'), want = txt || 'Ở yên trong khoang lái';
    if (sub._txt !== want) { sub.textContent = want; sub._txt = want; }
  }

  // ---------- cập nhật ----------
  function nearHull(d) {
    var x0 = wx(HULL.x0), x1 = wx(HULL.x1), bot = S.y0 + HULL.bottom * K;
    var dx = Math.max(x0 - d.pos.x, 0, d.pos.x - x1), dy = Math.max(bot - d.pos.y, 0, d.pos.y - (SURF + 0.8));
    return Math.hypot(dx, dy) <= 3;
  }

  function zoneOf(lx) {
    if (lx >= CABIN.x0 - 0.01 && lx <= CABIN.x1) return 'cabin';
    if (Math.abs(lx - LOCKER.x) <= LOCKER.r) return 'locker';
    return 'deck';
  }

  function lockerOpen() { return !!(BDL.locker && BDL.locker.isOpen && BDL.locker.isOpen()); }

  function startExtract() {
    if (S.leaving) return;
    S.leaving = true; S.leaveT = 0;
    sfx('boat_engine_start', 1);
    HX.hud.toast('Nổ máy · về quán');
  }

  function deckUpdate(dt, input) {
    var G = S.G, dk = G.deck, busy = lockerOpen(), mx = busy ? 0 : input.mx;
    var anim = 'Idle';
    // ai đó dời Dave lặn đi chỗ khác (BDL_DEBUG.teleport, hệ khác): coi như đã rời thuyền, bơi tại chỗ mới
    if (dk.px != null && Math.hypot(G.diver.pos.x - dk.px, G.diver.pos.y - dk.py) > 0.05) { setPrompt(null); showBoard(false); leaveDeck('swim'); return; }
    dk.animT += dt;
    if (dk.mode === 'climb') {
      dk.climbT += dt;
      var k = Math.min(1, dk.climbT / 0.45), a = dk.arrival || { x: wx(5.6), y: SURF - 0.4 };
      var tx = wx(dk.lx), ty = wy(deckY(dk.lx)), sx = Math.min(a.x, wx(HULL.x1 + 0.6)), sy = a.y;
      dk.wx = sx + (tx - sx) * k; dk.wy = sy + (ty - sy) * (k * k * (3 - 2 * k)) + Math.sin(k * Math.PI) * 0.7;
      anim = 'Walk';
      if (k >= 1) dk.mode = 'walk';
    } else if (dk.mode === 'walk') {
      if (mx) dk.face = mx > 0 ? 1 : -1;
      dk.vx = mx * WALK.speed;
      dk.lx = Math.max(WALK.min, Math.min(WALK.max, dk.lx + dk.vx / K * dt));
      dk.wx = wx(dk.lx); dk.wy = wy(deckY(dk.lx));
      anim = mx ? 'Walk' : 'Idle';
      if (mx) { S.stepT -= dt; if (S.stepT <= 0) { S.stepT = 0.27; sfx('boat_foot', 0.35); } }
      if (input.jump && !busy) doJump();
    } else if (dk.mode === 'jump') {
      dk.vy -= 22 * dt;
      dk.wx += dk.vx * dt; dk.wy += dk.vy * dt;
      anim = 'Walk';
      if (dk.vy < 0 && dk.wy <= SURF + 0.1) {
        placeDiver(dk.wx, SURF - 0.15);
        splash(dk.wx);
        leaveDeck();
        return;
      }
    }
    var flip = dk.face < 0;
    placeDiver(dk.wx, dk.wy);   // Dave lặn đứng chỗ Dave trên boong để camera bám
    S.dave.position.set(dk.wx, dk.wy, DAVE_Z);
    S.dave.scale.set(DAVE_H * (flip ? -1 : 1), DAVE_H, 1);
    setDaveCell(anim, dk.animT, false);
    dk.zone = dk.mode === 'walk' ? zoneOf(dk.lx) : 'deck';

    // khoang lái: đếm ngược, chỉ khi đủ chỉ tiêu
    var inCabin = dk.zone === 'cabin' && !S.leaving, met = BDL.run.quotaMet(), counting = false, msg = null;
    if (inCabin && met) {
      dk.cd -= dt;
      counting = true;
      var left = Math.max(0, dk.cd), n = Math.ceil(left - 1e-6);
      if (n !== S.lastN) { S.lastN = n; if (n > 0 && n < COUNTDOWN) sfx('ui_click', 0.5); }
      var b = $('ship-board');
      b.querySelector('.num').textContent = String(Math.max(1, n));
      b.style.setProperty('--k', (360 * (1 - left / COUNTDOWN)).toFixed(1) + 'deg');
      if (dk.cd <= 0) startExtract();
    } else {
      dk.cd = COUNTDOWN; S.lastN = -1;
      if (inCabin) msg = 'Chưa đủ chỉ tiêu: ' + BDL.fmt(BDL.run.dive.onDeck) + ' / ' + BDL.fmt(BDL.run.dive.quota);
    }
    showBoard(counting || S.leaving || !!msg, msg);

    // gợi ý phím
    if (S.leaving || counting || busy || msg) setPrompt(null);
    else if (dk.mode === 'walk' && dk.zone === 'locker') {
      var p = G.gfx.worldToScreen(wx(LOCKER.x), wy(LOCKER.top) + 0.5);
      setPrompt('locker', 'Mở tủ đồ', p.x, p.y);
    } else if (dk.mode === 'walk') {
      var q = G.gfx.worldToScreen(dk.wx, dk.wy + DAVE_H * 0.95);
      setPrompt('jump', 'Nhảy xuống nước', q.x, q.y);
    } else setPrompt(null);

    if (input.interact && !busy && dk.mode === 'walk' && dk.zone === 'locker') {
      if (BDL.locker && BDL.locker.open) BDL.locker.open(); else HX.hud.toast('Tủ đồ trống');
    }
  }

  function waterUpdate(dt, input) {
    var G = S.G, d = G.diver;
    var can = d.state === 'swim' && nearHull(d) && !d.corpseInReach();
    if (can) {
      var p = G.gfx.worldToScreen(d.pos.x, d.pos.y + 0.9);
      setPrompt('board', 'Leo lên thuyền', p.x, p.y);
      if (input.interact) board();
    } else setPrompt(null);
    showBoard(false);
  }

  var system = {
    name: 'ship',
    build: function (G, map) {
      buildDom();
      if (S) system.teardown(G);
      var s = S = {
        G: G, alive: true, x0: BOAT_X, y0: SURF + WATERLINE, bob: 0, boatReady: false, model: null, mats: null,
        pile: [], floats: [], stepT: 0, lastN: -1, leaving: false, leaveT: 0, arrive: null, camHold: 0, promptOn: false, promptKind: null, msg: null,
        boundWater: T.view.boundTop, boundDeck: Math.max(T.view.boundTop, 23.2),
      };
      s.group = new THREE.Group();
      s.group.position.set(s.x0, s.y0, BOAT_Z);
      s.group.scale.set(K, K, 1);
      G.gfx.scene.add(s.group);
      loadBoat(s);

      s.dave = HX.gfx.sprite(G.gfx.tex(BA.dave.sheet.replace(/^art\//, '')), 1, 1, { pivot: [0.5, 0], alphaCut: 0.5, depthWrite: true });
      s.dave.renderOrder = 8.5;
      G.gfx.scene.add(s.dave);

      // tiếng thuyền không nằm trong bảng tiếng của main.js
      var keys = ['boat_splash', 'boat_dive', 'boat_engine_start', 'boat_foot'];
      keys.forEach(function (k) { if (!A.audio[k] && BA.audio[k]) A.audio[k] = BA.audio[k]; });
      HX.audio.load(keys.filter(function (k) { return A.audio[k]; })).catch(function (e) { G.errors.push('ship audio: ' + e); });

      // Diver vừa dựng đã chạy trạng thái nhảy: tắt vệt bọt DiveBubble của nó, Dave bắt đầu ở trên boong
      (G.fx.plays || []).forEach(function (p) { if (p.name === 'diveBubble') { p.stop(); p.follow = null; } });
      G.deck = { on: false, mode: 'walk', lx: 4.0, face: -1, zone: 'deck', cd: COUNTDOWN, animT: 0, wx: 0, wy: 0, vx: 0, vy: 0 };
      enterDeck(4.0, 'walk');
      G.deck.wx = wx(4.0); G.deck.wy = wy(deckY(4.0));
      placeDiver(G.deck.wx, G.deck.wy);
      s.dave.position.set(G.deck.wx, G.deck.wy, DAVE_Z);

      // túi cá theo ký
      if (!G.catchFish.__ship) {
        var wrapped = function (f) {
          if (f.state === 'reeled') return;
          f.go('reeled');
          var kg = BDL.fishKg(f.sp);
          if (BDL.bagKg() + kg > BDL.bagCap() + 1e-6) {
            HX.hud.toast('Túi đầy · lên thuyền xả cá');
            G.fx.burst('bubble', f.pos.x, f.pos.y, 10, 1);
            return;
          }
          G.catches.push(f.sp.id);
          HX.audio.play('harpoon_catch');
          HX.audio.play('dave_grab', { vol: 0.7 });
          G.fx.burst('bubble', f.pos.x, f.pos.y, 6, 0.8);
          G.fx.spawn('glow', f.pos.x, f.pos.y, f.z + 0.1, 0, 0, 0.6);
          HX.hud.toast(HX.fish.displayName(f.sp) + ' · ' + kgText(kg) + ' kg');
        };
        wrapped.__ship = true;
        G.catchFish = wrapped;
      }

      hookDeliver();

      if (window.BDL_DEBUG) window.BDL_DEBUG.ship = {
        info: function () {
          var dk = G.deck || {};
          return {
            deckOn: !!dk.on, mode: dk.mode, zone: dk.zone, lx: dk.lx, x: G.diver.pos.x, y: G.diver.pos.y, cd: dk.cd, leaving: s.leaving,
            pile: s.pile.length, bagKg: BDL.bagKg(), bagCap: BDL.bagCap(), boatReady: s.boatReady, prompt: s.promptKind, msg: s.msg,
            boat: { x0: s.x0, y0: s.y0, k: K, z: BOAT_Z }, floats: s.floats.length,
          };
        },
        board: function () { return board(); },
        jump: function () { return doJump(); },
        stand: function (where) {
          var dk = G.deck;
          if (!dk.on) board();
          dk.mode = 'walk'; dk.climbT = 99;
          dk.lx = where === 'cabin' ? (CABIN.x0 + CABIN.x1) / 2 : where === 'locker' ? LOCKER.x : where === 'pile' ? 2.9 : 1.0;
          dk.cd = COUNTDOWN; dk.vx = 0;
          return dk.lx;
        },
        measure: { BOAT_X: BOAT_X, BOAT_Z: BOAT_Z, K: K, DECK: DECK, WALK: WALK, CABIN: CABIN, LOCKER: LOCKER, PILE: PILE, HULL: HULL, deckY: deckY,
          world: function (lx, ly) { return { x: wx(lx), y: wy(ly) }; } },
      };
    },

    update: function (dt, input) {
      var s = S;
      if (!s) return;
      var G = s.G;
      s.bob = Math.sin(G.t * 1.25) * 0.05;
      if (s.leaving) {
        s.leaveT += dt;
        s.x0 -= s.leaveT * s.leaveT * 5 * dt;   // nổ máy: thuyền lao dần về phía mũi (−x), Dave đứng trong khoang
        if (s.leaveT > 0.85) {
          s.leaving = false; s.leaveT = -99;
          setTimeout(function () { G.onExtract(); }, 0);   // ngoài vòng step: onExtract dựng lại cả cảnh, step của main còn đọc dive
          return;
        }
      }
      s.group.position.set(s.x0, s.y0 + s.bob, BOAT_Z);
      s.group.rotation.z = Math.sin(G.t * 0.9) * 0.007;
      if (s.camHold > 0) { s.camHold -= dt; if (s.camHold <= 0 && !G.deck.on) T.view.boundTop = s.boundWater; }
      if (G.deck && G.deck.on) deckUpdate(dt, input);
      else waterUpdate(dt, input);
      if (!S) return;
      updatePile(dt);
      updateFloats(dt);
      updateBag();
      var ui = $('ship-ui');
      ui.classList.toggle('deck', !!(G.deck && G.deck.on && G.deck.mode === 'walk'));
      ui.classList.toggle('can-e', s.promptOn && s.promptKind !== 'jump');
    },

    teardown: function (G) {
      var s = S;
      if (!s) return;
      s.alive = false;
      G.gfx.scene.remove(s.group);
      G.gfx.scene.remove(s.dave);
      s.dave.material.dispose();
      s.pile.forEach(function (m) { G.gfx.scene.remove(m); m.material.dispose(); });
      s.floats.forEach(function (f) { f.e.remove(); });
      if (s.mats) Object.keys(s.mats).forEach(function (k) { s.mats[k].dispose(); });
      T.view.boundTop = s.boundWater;
      var ui = $('ship-ui');
      if (ui) {
        ui.classList.remove('deck', 'can-e');
        ['ship-board', 'ship-prompt', 'ship-bag'].forEach(function (id) { $(id).classList.remove('on', 'msg'); });
        $('ship-float').innerHTML = '';
      }
      S = null;
    },
  };

  // BDL.onDeliver có thể do hệ khác đặt trước/sau; nối một lần và nối lại nếu bị ghi đè.
  function hookDeliver() {
    if (BDL.onDeliver && BDL.onDeliver.__ship) return;
    var prev = BDL.onDeliver;
    var f = function (item) { if (prev) prev(item); if (S) addPile(item); };
    f.__ship = true;
    BDL.onDeliver = f;
  }
  hookDeliver();

  BDL.systems = BDL.systems || [];
  BDL.systems.push(system);
})(window.BDL = window.BDL || {});
