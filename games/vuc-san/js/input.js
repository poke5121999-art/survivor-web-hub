// Đọc bàn phím, chuột thành Intent cho actor người chơi.
// WASD/mũi tên bơi, Shift tăng tốc, chuột ngắm (toạ độ thế giới qua VS.view.screenToWorld), chuột trái bắn,
// chuột phải hoặc Q kỹ năng, F đèn, E/Space tương tác. fire, skill, light, interact là cạnh lên: đúng một lần mỗi lần bấm
// (giữ phím không lặp); fireHeld, interactHeld, boost là trạng thái giữ.
// Cảm ứng (điện thoại ngang): cần trái (nửa trái màn) bơi, đẩy tới ≥ 90% bán kính thì boost; cần phải (nửa phải màn) ngắm:
// kéo để ngắm (đèn pin và mũi xiên theo hướng kéo), nhả tay ngoài vùng chết thì bắn, chạm nhanh không kéo cũng bắn theo hướng
// ngắm gần nhất; kéo về giữa rồi nhả thì huỷ. Hai ngón cùng lúc (bơi + bắn). Nút Kỹ năng, Đèn, Tương tác do hud.js vẽ và gọi
// VS.input.press / VS.input.touch.hold. Cần chỉ tính khi chạm trúng canvas, nên HUD không nuốt cú chạm và elementFromPoint
// giữa vùng chơi vẫn là canvas.
(function (VS) {
  'use strict';
  var KEYS = {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    boost: ['ShiftLeft', 'ShiftRight'], skill: ['KeyQ'], light: ['KeyF'], interact: ['KeyE', 'Space'],
  };
  var EDGE_TTL = 1000;  // ms: cạnh bấm lúc không có ai đọc (sảnh, tạm dừng) quá chừng này thì bỏ, khỏi dồn vào trận sau
  var held = {}, edges = {}, mouse = { x: null, y: null, left: false };
  var TOUCH_GUARD = 900;   // ms: chuột giả sinh ra sau cú chạm thì bỏ
  var AIM_KEEP = 2500;     // ms: sau khi nhả cần ngắm, hướng ngắm còn giữ chừng này rồi quay về hướng bơi
  var TAP_MS = 350, DRAG_PX = 12, FIRE_MIN = 0.25, BOOST_AT = 0.9, DEAD = 0.12;
  var touch = { on: false, move: null, aim: null, dir: null, dirT: 0, holds: {}, lastT: -1e9 };

  function down(name) {
    if (touch.holds[name]) return true;
    for (var i = 0; i < KEYS[name].length; i++) if (held[KEYS[name][i]]) return true;
    return false;
  }
  function nameOf(code) { for (var k in KEYS) if (KEYS[k].indexOf(code) >= 0) return k; return null; }
  function edge(name) { edges[name] = performance.now(); }
  function take(name) {
    var t = edges[name];
    delete edges[name];
    return t != null && performance.now() - t <= EDGE_TTL;
  }
  function typing(e) {
    var el = e.target;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }
  // chỉ bấm vào vùng chơi (canvas, nền trang) mới tính; bấm nút giao diện thì không bắn
  function onPlayfield(e) {
    var el = e.target;
    return !el || el === document.body || el === document.documentElement || el.tagName === 'CANVAS';
  }
  function unlock() { if (window.HX && HX.audio) HX.audio.unlock(); }

  window.addEventListener('keydown', function (e) {
    if (typing(e)) return;
    unlock();
    var n = nameOf(e.code);
    if (!n) return;
    if (!e.repeat && !held[e.code] && (n === 'skill' || n === 'light' || n === 'interact')) edge(n);
    held[e.code] = true;
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { held[e.code] = false; });
  window.addEventListener('blur', function () { held = {}; mouse.left = false; });
  function fromTouch() { return performance.now() - touch.lastT < TOUCH_GUARD; }
  window.addEventListener('mousemove', function (e) { if (!fromTouch()) { mouse.x = e.clientX; mouse.y = e.clientY; } });
  window.addEventListener('mousedown', function (e) {
    if (fromTouch()) return;
    unlock();
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!onPlayfield(e)) return;
    if (e.button === 0) { mouse.left = true; edge('fire'); }
    else if (e.button === 2) { edge('skill'); e.preventDefault(); }
  });
  window.addEventListener('mouseup', function (e) { if (!fromTouch() && e.button === 0) mouse.left = false; });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- cảm ứng ----------
  function coarse() {
    try {
      if (window.matchMedia && matchMedia('(pointer: coarse)').matches) return true;
      return (navigator.maxTouchPoints || 0) > 0 && !(window.matchMedia && matchMedia('(any-pointer: fine)').matches);
    } catch (e) { return false; }
  }
  touch.on = coarse();
  function radius() { return Math.max(40, Math.min(64, Math.min(innerWidth, innerHeight) * 0.15)); }
  function clampBase(x, y) {
    var r = radius() + 8;
    return { x: Math.max(r, Math.min(innerWidth - r, x)), y: Math.max(r, Math.min(innerHeight - r, y)) };
  }
  function stick(id, x, y) {
    var b = clampBase(x, y);
    return { id: id, bx: b.x, by: b.y, x: x, y: y, t0: performance.now(), dragged: false };
  }
  // độ lệch của ngón so với tâm cần, chia bán kính: { dx, dy (màn hình), len }
  function offset(s) {
    var R = radius(), dx = s.x - s.bx, dy = s.y - s.by, l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; l = R; }
    return { dx: dx, dy: dy, len: l / R };
  }
  function onTouchDown(e) {
    if (e.pointerType !== 'touch') return;
    touch.lastT = performance.now();
    touch.on = true;
    unlock();
    if (!onPlayfield(e)) return;
    e.preventDefault();
    var left = e.clientX < innerWidth / 2;
    if (left && !touch.move) touch.move = stick(e.pointerId, e.clientX, e.clientY);
    else if (!left && !touch.aim) touch.aim = stick(e.pointerId, e.clientX, e.clientY);
  }
  function onTouchMove(e) {
    if (e.pointerType !== 'touch') return;
    touch.lastT = performance.now();
    var s = touch.move && touch.move.id === e.pointerId ? touch.move : touch.aim && touch.aim.id === e.pointerId ? touch.aim : null;
    if (!s) return;
    s.x = e.clientX; s.y = e.clientY;
    if (Math.hypot(s.x - s.bx, s.y - s.by) > DRAG_PX) s.dragged = true;
    // hướng ngắm chuẩn hoá; màn hình y xuống nên đảo y thành y thế giới
    if (s === touch.aim && s.dragged) {
      var dx = s.x - s.bx, dy = s.y - s.by, l = Math.hypot(dx, dy);
      touch.dir = { x: dx / l, y: -dy / l }; touch.dirT = performance.now();
    }
  }
  function onTouchUp(e) {
    if (e.pointerType !== 'touch') return;
    touch.lastT = performance.now();
    if (touch.move && touch.move.id === e.pointerId) { touch.move = null; return; }
    var a = touch.aim;
    if (!a || a.id !== e.pointerId) return;
    touch.aim = null;
    touch.dirT = performance.now();
    if (e.type === 'pointercancel') return;
    var o = offset(a), tap = !a.dragged && performance.now() - a.t0 < TAP_MS;
    if (tap || (a.dragged && o.len >= FIRE_MIN)) edge('fire');
  }
  window.addEventListener('pointerdown', onTouchDown, { passive: false });
  window.addEventListener('pointermove', onTouchMove);
  window.addEventListener('pointerup', onTouchUp);
  window.addEventListener('pointercancel', onTouchUp);

  // Trạng thái cho HUD vẽ cần: base/knob theo px màn hình, hoặc null khi không có ngón.
  function touchState() {
    function view(s) { if (!s) return null; var o = offset(s); return { bx: s.bx, by: s.by, kx: s.bx + o.dx, ky: s.by + o.dy, len: o.len, boost: o.len >= BOOST_AT }; }
    return { on: touch.on, radius: radius(), move: view(touch.move), aim: view(touch.aim) };
  }

  // Intent của actor (người chơi). Trả object mới mỗi lần; cạnh bấm bị lấy đi khi đọc.
  function read(m, actor) {
    var mx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0), my = (down('up') ? 1 : 0) - (down('down') ? 1 : 0), boost = down('boost');
    if (touch.move) {
      var o = offset(touch.move);
      if (o.len > DEAD) {
        if (!mx && !my) { mx = o.dx / radius(); my = -o.dy / radius(); }
        if (o.len >= BOOST_AT) boost = true;
      }
    }
    var l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    var aimX, aimY, dir = null;
    if (touch.dir && (touch.aim || performance.now() - touch.dirT < AIM_KEEP)) dir = touch.dir;
    if (!dir && touch.on && mouse.x == null && l > 0.05) dir = { x: mx / l, y: my / l };
    if (dir) {
      aimX = actor.x + dir.x * 8; aimY = actor.y + dir.y * 8;
    } else if (mouse.x != null && VS.view && VS.view.screenToWorld) {
      var w = VS.view.screenToWorld(mouse.x, mouse.y);
      aimX = w.x; aimY = w.y;
    } else {
      aimX = actor.x + (actor.face || 1) * 5; aimY = actor.y;
    }
    return {
      mx: mx, my: my, boost: boost, aimX: aimX, aimY: aimY,
      fire: take('fire'), fireHeld: mouse.left, skill: take('skill'), light: take('light'),
      interact: take('interact'), interactHeld: down('interact'),
    };
  }

  // Nút trên màn hình (HUD, cảm ứng) bấm thay phím: name = fire | skill | light | interact.
  function press(name) { edge(name); }
  // Nút giữ (interact): hold(name, true) khi đặt ngón, hold(name, false) khi nhả.
  function hold(name, on) { touch.holds[name] = !!on; }
  function reset() { held = {}; edges = {}; mouse.left = false; touch.move = touch.aim = touch.dir = null; touch.holds = {}; }
  window.addEventListener('blur', function () { touch.move = touch.aim = null; touch.holds = {}; });

  VS.input = {
    read: read, press: press, reset: reset, KEYS: KEYS,
    touch: { enabled: function () { return touch.on; }, enable: function (on) { touch.on = !!on; }, state: touchState, hold: hold },
  };
})(window.VS = window.VS || {});
