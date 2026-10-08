// Đọc bàn phím, chuột thành Intent cho actor người chơi.
// WASD/mũi tên bơi, Shift tăng tốc, chuột ngắm (toạ độ thế giới qua VS.view.screenToWorld), chuột trái bắn,
// chuột phải hoặc Q kỹ năng, F đèn, E/Space tương tác. fire, skill, light, interact là cạnh lên: đúng một lần mỗi lần bấm
// (giữ phím không lặp); fireHeld, interactHeld, boost là trạng thái giữ.
(function (VS) {
  'use strict';
  var KEYS = {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    boost: ['ShiftLeft', 'ShiftRight'], skill: ['KeyQ'], light: ['KeyF'], interact: ['KeyE', 'Space'],
  };
  var EDGE_TTL = 1000;  // ms: cạnh bấm lúc không có ai đọc (sảnh, tạm dừng) quá chừng này thì bỏ, khỏi dồn vào trận sau
  var held = {}, edges = {}, mouse = { x: null, y: null, left: false };

  function down(name) { for (var i = 0; i < KEYS[name].length; i++) if (held[KEYS[name][i]]) return true; return false; }
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
  window.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mousedown', function (e) {
    unlock();
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!onPlayfield(e)) return;
    if (e.button === 0) { mouse.left = true; edge('fire'); }
    else if (e.button === 2) { edge('skill'); e.preventDefault(); }
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) mouse.left = false; });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Intent của actor (người chơi). Trả object mới mỗi lần; cạnh bấm bị lấy đi khi đọc.
  function read(m, actor) {
    var mx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0), my = (down('up') ? 1 : 0) - (down('down') ? 1 : 0);
    var l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    var aimX, aimY;
    if (mouse.x != null && VS.view && VS.view.screenToWorld) {
      var w = VS.view.screenToWorld(mouse.x, mouse.y);
      aimX = w.x; aimY = w.y;
    } else {
      aimX = actor.x + (actor.face || 1) * 5; aimY = actor.y;
    }
    return {
      mx: mx, my: my, boost: down('boost'), aimX: aimX, aimY: aimY,
      fire: take('fire'), fireHeld: mouse.left, skill: take('skill'), light: take('light'),
      interact: take('interact'), interactHeld: down('interact'),
    };
  }

  // Nút trên màn hình (HUD, cảm ứng) bấm thay phím: name = fire | skill | light | interact.
  function press(name) { edge(name); }
  function reset() { held = {}; edges = {}; mouse.left = false; }

  VS.input = { read: read, press: press, reset: reset, KEYS: KEYS };
})(window.VS = window.VS || {});
