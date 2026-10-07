/* Ác Quỷ II - input.js
 * Chuột + bàn phím (máy tính) và cảm ứng (cần analog trái, nút bên phải).
 * Toạ độ phát ra luôn là toạ độ logic 960x540.
 * Sự kiện: click{x,y,shift}, rclick{x,y}, key{code}, wheel{d}, skillbtn{n}, potionbtn{n}, attackbtn{}
 */
(function () {
  'use strict';
  var D2 = window.D2 = window.D2 || {};
  var W = 960, H = 540;
  var I = D2.Input = {
    stage: null, canvas: null, touch: false,
    mouse: { x: W / 2, y: H / 2, left: false, right: false, inside: false },
    shift: false, alt: false, ctrl: false,
    joy: { on: false, x: 0, y: 0, id: -1, bx: 0, by: 0 },
    atkHeld: false, handlers: {}, enabled: true, hudRoot: null
  };

  I.on = function (type, fn) { (I.handlers[type] = I.handlers[type] || []).push(fn); };
  I.emit = function (type, ev) { (I.handlers[type] || []).forEach(function (f) { f(ev || {}); }); };

  function logical(e) {
    var r = I.stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  I.logical = logical;

  I.setTouch = function (on) {
    if (I.touch === on) return;
    I.touch = on;
    document.body.classList.toggle('touch', on);
    if (I.tbox) I.tbox.style.display = on ? 'block' : 'none';
    I.emit('mode', { touch: on });
  };

  I.init = function (stage, canvas) {
    I.stage = stage; I.canvas = canvas;
    buildTouch(stage);
    var coarse = false;
    try { coarse = window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(pointer:fine)').matches; } catch (e) {}
    if (coarse || /[?&]touch=1/.test(location.search)) I.setTouch(true);

    // ---- chuột / chạm trên canvas thế giới
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      D2.E.audioUnlock();
      var p = logical(e);
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        I.setTouch(true);
        // vùng trái dưới: bắt đầu analog nổi
        if (p.x < W * 0.42 && p.y > H * 0.28 && I.joy.id < 0) { joyStart(e, p); return; }
        I.mouse.x = p.x; I.mouse.y = p.y;
        I.emit('click', { x: p.x, y: p.y, shift: false, touch: true });
        return;
      }
      I.setTouch(false);
      I.mouse.x = p.x; I.mouse.y = p.y; I.mouse.inside = true;
      I.shift = e.shiftKey; I.alt = e.altKey;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      I.mouse.downT = performance.now();
      if (e.button === 0) { I.mouse.left = true; I.emit('click', { x: p.x, y: p.y, shift: e.shiftKey, touch: false }); }
      else if (e.button === 2) { I.mouse.right = true; I.emit('rclick', { x: p.x, y: p.y, shift: e.shiftKey }); }
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = logical(e);
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        if (e.pointerId === I.joy.id) joyMove(p);
        return;
      }
      I.mouse.x = p.x; I.mouse.y = p.y; I.mouse.inside = true;
    });
    function up(e) {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') { if (e.pointerId === I.joy.id) joyEnd(); return; }
      if (e.button === 0) I.mouse.left = false;
      else if (e.button === 2) I.mouse.right = false;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', function (e) {
      if (e.pointerId === I.joy.id) joyEnd(); I.mouse.left = I.mouse.right = false;
    });
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') I.mouse.inside = false; });
    window.addEventListener('blur', function () { I.mouse.left = I.mouse.right = false; I.shift = I.alt = false; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault(); I.emit('wheel', { d: e.deltaY > 0 ? 1 : -1 });
    }, { passive: false });

    // ---- bàn phím
    window.addEventListener('keydown', function (e) {
      I.shift = e.shiftKey; I.alt = e.altKey; I.ctrl = e.ctrlKey;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      D2.E.audioUnlock();
      var code = e.code;
      if (code === 'Tab' || code === 'AltLeft' || code === 'AltRight' || /^F[1-8]$/.test(code) || code === 'Space') e.preventDefault();
      if (e.repeat) return;
      I.emit('key', { code: code, shift: e.shiftKey });
    });
    window.addEventListener('keyup', function (e) { I.shift = e.shiftKey; I.alt = e.altKey; I.ctrl = e.ctrlKey; });
  };

  /* ---------------------------------------------------------------- analog */
  function joyStart(e, p) {
    var j = I.joy; j.id = e.pointerId; j.on = true; j.bx = p.x; j.by = p.y; j.x = 0; j.y = 0;
    try { I.canvas.setPointerCapture(e.pointerId); } catch (er) {}
    showJoy(p.x, p.y, p.x, p.y);
  }
  function joyMove(p) {
    var j = I.joy, dx = p.x - j.bx, dy = p.y - j.by, d = Math.hypot(dx, dy), R = 60;
    if (d > R) { dx = dx / d * R; dy = dy / d * R; d = R; }
    var m = d / R;
    if (m < 0.18) { j.x = 0; j.y = 0; } else { j.x = dx / R; j.y = dy / R; }
    showJoy(j.bx, j.by, j.bx + dx, j.by + dy);
  }
  function joyEnd() {
    var j = I.joy; j.id = -1; j.on = false; j.x = 0; j.y = 0;
    if (I.joyBase) I.joyBase.style.opacity = '0.25';
    if (I.joyBase) { I.joyBase.style.left = '110px'; I.joyBase.style.top = '400px'; I.joyKnob.style.left = '40px'; I.joyKnob.style.top = '40px'; }
  }
  function showJoy(bx, by, kx, ky) {
    I.joyBase.style.opacity = '0.7';
    I.joyBase.style.left = (bx - 60) + 'px'; I.joyBase.style.top = (by - 60) + 'px';
    I.joyKnob.style.left = (kx - bx + 60 - 22) + 'px'; I.joyKnob.style.top = (ky - by + 60 - 22) + 'px';
  }

  /* ----------------------------------------------------------- nút cảm ứng */
  var BTN = [
    // [id, kind, n, cx, cy, r, label]
    ['atk', 'attack', 0, 868, 352, 50, 'Đánh'],
    ['s1', 'skill', 0, 760, 410, 29, '1'], ['s2', 'skill', 1, 778, 330, 29, '2'],
    ['s3', 'skill', 2, 830, 268, 29, '3'], ['s4', 'skill', 3, 905, 252, 29, '4'],
    ['p1', 'potion', 0, 708, 480, 25, 'P1'], ['p2', 'potion', 1, 762, 497, 25, 'P2']
  ];
  I.touchBtns = {};
  function buildTouch(stage) {
    var box = document.createElement('div');
    box.id = 'touch'; box.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;z-index:6';
    var base = document.createElement('div'); base.className = 'joyBase';
    base.style.cssText = 'position:absolute;left:110px;top:400px;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(255,255,255,.08);opacity:.25;pointer-events:none';
    var knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;left:38px;top:38px;width:44px;height:44px;border-radius:50%;background:rgba(220,200,140,.65);border:2px solid #fff6';
    base.appendChild(knob); box.appendChild(base);
    I.joyBase = base; I.joyKnob = knob;
    BTN.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'tbtn ' + b[1]; el.dataset.id = b[0];
      el.style.cssText = 'position:absolute;left:' + (b[3] - b[5]) + 'px;top:' + (b[4] - b[5]) + 'px;width:' + (b[5] * 2) + 'px;height:' + (b[5] * 2) + 'px;border-radius:50%;' +
        'border:2px solid rgba(214,180,100,.8);background:rgba(20,10,10,.55);color:#e8d9a8;font:bold ' + (b[5] > 40 ? 16 : 12) + 'px serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;background-size:cover';
      el.textContent = b[6];
      el.addEventListener('pointerdown', function (e) {
        e.stopPropagation(); e.preventDefault(); D2.E.audioUnlock(); I.setTouch(true);
        el.style.borderColor = '#fff';
        if (b[1] === 'attack') { I.atkHeld = true; el.dataset.pid = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (er) {} I.emit('attackbtn', {}); }
        else if (b[1] === 'skill') I.emit('skillbtn', { n: b[2] });
        else I.emit('potionbtn', { n: b[2] });
      });
      function rel() { el.style.borderColor = 'rgba(214,180,100,.8)'; if (b[1] === 'attack') I.atkHeld = false; }
      el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      box.appendChild(el); I.touchBtns[b[0]] = el;
    });
    // nút menu / bảng
    [['mI', 'Túi', 'KeyI', 0], ['mC', 'NV', 'KeyC', 1], ['mT', 'KN', 'KeyT', 2], ['mQ', 'NVụ', 'KeyQ', 3], ['mM', 'Bản đồ', 'Tab', 4], ['mE', 'Menu', 'Escape', 5]].forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'tbtn menu';
      el.style.cssText = 'position:absolute;right:8px;top:' + (8 + m[3] * 30) + 'px;width:52px;height:26px;border-radius:4px;border:1px solid #a88;background:rgba(20,10,10,.6);color:#e8d9a8;font:11px serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none';
      el.textContent = m[1];
      el.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); I.emit('key', { code: m[2] }); });
      box.appendChild(el);
    });
    stage.appendChild(box); I.tbox = box;
  }

  /* UI gọi để đổi nhãn/icon nút kỹ năng cảm ứng: items = [{ label, style }] cho s1..s4 */
  I.setTouchSkill = function (n, label, style) {
    var el = I.touchBtns['s' + (n + 1)]; if (!el) return;
    el.textContent = label || ''; el.style.cssText = el.style.cssText.replace(/background-image:[^;]*;?|background-position:[^;]*;?|background-size:[^;]*;?/g, '') + (style || '');
  };

  /* Hướng analog -> véc tơ ô (mx, my) đã chuẩn hoá */
  I.joyTiles = function () {
    var E = D2.E, j = I.joy;
    if (!j.on || (!j.x && !j.y)) return null;
    var mx = j.x / (E.tw / 2) + j.y / (E.th / 2), my = j.y / (E.th / 2) - j.x / (E.tw / 2);
    var d = Math.hypot(mx, my) || 1;
    return { x: mx / d, y: my / d, mag: Math.min(1, Math.hypot(j.x, j.y)) };
  };
})();
