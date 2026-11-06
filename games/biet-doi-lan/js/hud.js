// Lớp DOM phủ trên cảnh, theo HUD của R.E.P.O. (games/repo2d/game.js drawHud / hudLayoutLandscape): thanh O₂ (là máu) + thể lực trên trái,
// ô chỉ tiêu và "Tầng k/N · d m" giữa trên, tay cầm 4 ô (xiên ∞ + 3 đồ nghề) và kỹ năng (R) giữa dưới, nút cảm ứng đĩa tối viền màu.
// Hàm HX.hud.* giữ nguyên chữ ký cũ (main.js và các hệ gọi); thêm marks / screenFx / podHint / catchCard.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING;
  var $ = function (id) { return document.getElementById(id); };
  var REV = (function () { var v = ((document.currentScript && document.currentScript.src.split('v=')[1]) || '').split('&')[0]; return v ? '?v=' + v : ''; })();

  var MUI = window.HX_MOBILE_UI;
  // Bố cục nút tay phải (đơn vị canvas 2340×1080 như HX_MOBILE_UI; dx/dy là tâm tính từ góc corner). Ghi đè / thêm vào layouts.dive của bản Android:
  // xiên to ở góc (giữ chỗ gốc, cần ngắm kéo từ đó), vòng cung quanh nó, mọi thứ nằm nửa phải; nửa trái trống cho cần di chuyển nổi
  // (luật REPO: không nút nào trong dải cần). Khoảng cách giữa hai nút ≥ 19 đơn vị.
  var EXTRA = {
    dive: {
      boost: { corner: 'br', dx: 130, dy: 560, w: 150, h: 150 },
      melee: { corner: 'br', dx: 900, dy: 400, w: 140, h: 140 },
      interact: { corner: 'br', dx: 690, dy: 196, w: 190, h: 190 },
      drone: { corner: 'br', dx: 880, dy: 596, w: 130, h: 130 },
      hook: { corner: 'br', dx: 650, dy: 420, w: 170, h: 170 },
      swap: { corner: 'br', dx: 130, dy: 370, w: 130, h: 130 },
      skill: { corner: 'br', dx: 400, dy: 480, w: 180, h: 180 },
      switch: { corner: 'br', dx: 130, dy: 196, w: 150, h: 150 },   // súng phụ (chỉ khi cầm súng): ô nhảy của boong
      menu: { corner: 'tr', dx: 150, dy: 90, w: 116, h: 116 },      // tạm dừng: to hơn bản gốc (88) để đủ 40 px ở màn 844
    },
  };
  // HUD lúc lặn: id phần tử -> [vai trong layouts.dive, vai của phần tử cha (con đặt theo tâm cha)]
  var DIVE_UI = {
    'stick': ['stick'], 'stick-knob': ['knob', 'stick'], 'stick-sprint': ['sprint', 'stick'], 'stick-sprint-img': ['sprintImg', 'sprint'],
    'tb-boost': ['boost'], 'tb-knife': ['melee'], 'tb-grab': ['interact'], 'tb-drone': ['drone'],
    'tb-swap': ['swap'], 'tb-skill': ['skill'],
    'tb-fire': ['fire'], 'tb-fire-icon': ['fireIcon', 'fire'], 'tb-fire-lv': ['fireLevel', 'fire'], 'tb-fire-ammo': ['fireAmmo', 'fire'],
    'tb-switch': ['switch'], 'tb-aimbg': ['aimBg'], 'tb-aim': ['aim'], 'tb-cancel': ['cancel'],
    'tb-qte': ['qte'], 'tb-qte-ring': ['qteRing', 'qte'],
    'btn-pause': ['menu'],
  };
  // Phím PC hiện trên nút (chỉ cảm ứng mới có nút nên chỉ còn nút tạm dừng)
  var DIVE_KEYS = { 'btn-pause': 'Esc' };
  function mu(n) { return 'calc(var(--mu) * ' + n.toFixed(1) + ')'; }

  // Cài đặt nút (bảng 自定义按钮 của bản Android). Lưu ở localStorage 'bdl.ui'.
  var PREF0 = { size: 50, alpha: 100, fixedStick: false, sprint: 'button' };  // [DtD] ảnh XDContentsGuide_Custom1: 按钮大小 50, 透明度 100, 左摇杆固定 tắt, 冲刺模式 按键
  var prefs = Object.assign({}, PREF0);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('bdl.ui') || '{}')); } catch (e) { /* sổ hỏng thì dùng mặc định */ }
  var prefListeners = [];
  // [ĐỀ XUẤT] cỡ nút 0..100 -> ×0,5..×1,5, 50 là cỡ gốc; bản gốc không lộ công thức
  function sizeK() { return 0.5 + prefs.size / 100; }
  function applyPrefs() {
    document.body.style.setProperty('--ba', (prefs.alpha / 100).toFixed(2));
    document.body.classList.toggle('sprint-wheel', prefs.sprint === 'wheel');
    document.body.classList.toggle('fixed-stick', !!prefs.fixedStick);
    Object.keys(laid).forEach(function (c) { Hud.layout(c, laid[c]); });
    prefListeners.forEach(function (f) { f(prefs); });
  }
  var laid = {};

  // --hk: cỡ HUD. REPO uiK(): 1 trên điện thoại, theo cạnh ngắn / 620 trên máy tính, chặn 1..2,2.
  function rescale() {
    var touch = document.body.classList.contains('touch');
    var k = touch ? 1 : Math.max(1, Math.min(2.2, Math.min(innerWidth, innerHeight) / 620));
    document.body.style.setProperty('--hk', k.toFixed(3));
  }

  // chữ số hồi chiêu / tên đĩa icon nút kỹ năng; so chuỗi để khỏi ghi DOM mỗi khung
  var cache = {};
  function setText(el, key, v) { if (cache[key] !== v) { cache[key] = v; el.textContent = v; } }
  function setCls(el, key, name, on) { var k = key + name; if (cache[k] !== on) { cache[k] = on; el.classList.toggle(name, on); } }
  function setProp(el, key, name, v) { var k = key + name; if (cache[k] !== v) { cache[k] = v; el.style.setProperty(name, v); } }

  var Hud = {
    // max: dưỡng khí tối đa của bình đang đeo (G.loadout.o2)
    o2: function (v, max) {
      var k = Math.max(0, Math.min(1, v / max));
      setText($('o2-num'), 'o2n', String(Math.ceil(v)));
      setText($('o2-max'), 'o2m', '/' + Math.round(max));
      $('o2-fill').style.width = (k * 100).toFixed(1) + '%';
      var low = v < T.o2.lowAt;
      document.body.classList.toggle('low-o2', low);
      $('vignette').style.opacity = low ? (0.45 + 0.35 * (1 - v / T.o2.lowAt)).toFixed(2) : '0';
    },
    // floor: 0-based; floors: tổng số tầng. Dưới tầng cuối là vùng áp suất.
    depth: function (m, floor, floors) {
      var k = Math.min(floor + 1, floors);
      setText($('depth'), 'depth', 'Tầng ' + k + '/' + floors + ' · ' + Math.max(0, Math.round(m)) + ' m');
    },
    stamina: function (v, max) {
      $('stam-fill').style.width = (Math.max(0, Math.min(1, v / max)) * 100).toFixed(1) + '%';
      $('stam').classList.toggle('low', v < 8);
    },
    pressure: function (on) {
      if (Hud._press === on) return;
      Hud._press = on;
      document.body.classList.toggle('in-pressure', on);
    },
    quota: function (txt) {
      setText($('quota-t'), 'quota', txt);
      $('quota').classList.toggle('met', /✓/.test(txt));
    },
    flash: function () {
      var el = $('hurt');
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    },

    area: function (title, sub) {
      $('area-t').textContent = title; $('area-s').textContent = sub;
      var el = $('area');
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    },

    toast: function (s) {
      var el = $('toast');
      el.textContent = s;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    },
    // các hệ cũ của Hố Xanh có gọi; Biệt Đội Lặn không dùng thẻ cá / gợi ý nhặt hộp O₂
    podHint: function () {},
    catchCard: function () {},

    // Chớp màn hình một màu (kỹ năng): rgb = '255,255,255', a = độ đục lúc đầu 0..1.
    screenFx: function (rgb, a) {
      var el = $('fxflash');
      el.style.setProperty('--fc', rgb); el.style.setProperty('--fa', String(a == null ? 0.5 : a));
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    },
    // Dấu soi thấu: list = [{ x, y (mét), kind: 'loot' | 'foe' }] hoặc null để tắt. Trong khung hình là vòng sáng, ngoài khung là mũi tên ở mép.
    marks: function (list) {
      var host = $('marks'), pool = Hud._mk || (Hud._mk = []), G = HX.game;
      var n = list && G && G.gfx ? list.length : 0;
      var W = innerWidth, H = innerHeight, pad = 26, cx = W / 2, cy = H / 2;
      for (var i = 0; i < Math.max(n, pool.length); i++) {
        var el = pool[i];
        if (i >= n) { if (el && el.on) { el.on = false; el.node.classList.remove('show'); } continue; }
        if (!el) {
          var node = document.createElement('div'); node.className = 'mk'; node.appendChild(document.createElement('i'));
          host.appendChild(node);
          el = pool[i] = { node: node, on: false, kind: '', off: null };
        }
        var m = list[i], s = G.gfx.worldToScreen(m.x, m.y);
        if (!el.on) { el.on = true; el.node.classList.add('show'); }
        if (el.kind !== m.kind) { el.kind = m.kind; el.node.classList.remove('loot', 'foe'); el.node.classList.add(m.kind); }
        var inside = s.x >= pad && s.x <= W - pad && s.y >= pad && s.y <= H - pad, x = s.x, y = s.y;
        if (!inside) {
          var dx = s.x - cx, dy = s.y - cy, k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
          x = cx + dx * k; y = cy + dy * k;
          el.node.style.setProperty('--a', Math.atan2(dy, dx).toFixed(3) + 'rad');
        }
        if (el.off !== !inside) { el.off = !inside; el.node.classList.toggle('off', !inside); }
        el.node.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      }
    },

    tug: function (on, gauge, time) {
      var el = $('tug');
      el.hidden = !on;
      if (!on) return;
      $('tug-fill').style.height = (gauge * 100).toFixed(1) + '%';
      $('tug-time').style.width = (Math.max(0, time) * 100).toFixed(1) + '%';
    },
    tugAt: function (x, y) {
      var el = $('tug');
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    },
    tugTap: function () {
      var el = $('tug');
      el.classList.remove('tap'); void el.offsetWidth; el.classList.add('tap');
    },
    // Lời nhắc trên xác cá (CuttingInteractionUI gốc). p: { x, y (px màn hình, tâm xác), carve, k (0..1), icon } hoặc null.
    // Nhặt: chỉ phím Space phía trên. Xả thịt: thêm vòng Gauge đầy dần theo k quanh đĩa có hình con cá.
    // Có xác trong tầm thì body.can-harvest sáng nút E trên màn cảm ứng.
    harvest: function (p) {
      var el = $('harvest'), on = !!p;
      if (Hud._hv !== on) { Hud._hv = on; el.hidden = !on; document.body.classList.toggle('can-harvest', on); $('tb-grab').classList.toggle('lit', on); }
      if (!on) return;
      el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
      el.classList.toggle('carve', !!p.carve);
      // gọi drone là phím Ctrl (nút drone trên cảm ứng), không phải Space như nhặt xác
      el.classList.toggle('drone', !!p.drone);
      if (p.carve) {
        $('hv-bar').style.setProperty('--k', (p.k * 360).toFixed(1) + 'deg');
        if (p.icon && Hud._hvIcon !== p.icon) { Hud._hvIcon = p.icon; $('hv-icon').src = p.icon; }
      }
    },
    qteResult: function (ok, perfect) {
      Hud.toast(ok ? (perfect ? 'Hoàn hảo!' : 'Kéo được rồi!') : 'Cá giật đứt ra mất…');
    },

    reticle: function (show, x, y, gun, gx, gy, ang) {
      var r = $('reticle'), g = $('aimgun');
      r.hidden = !show;
      if (show) r.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      g.hidden = !gun;
      if (gun) g.style.transform = 'translate(' + Math.round(gx) + 'px,' + Math.round(gy) + 'px) rotate(' + (-ang).toFixed(3) + 'rad)';
    },

    // Đặt vị trí và cỡ nút theo RectTransform gốc (HX_MOBILE_UI.layouts[canvas] + EXTRA, đơn vị canvas 2340 ngang), nhân cỡ nút
    // của bảng cài đặt quanh tâm gốc. map: id phần tử -> [vai, vai cha, 1 = bỏ độ phóng gốc]. Gọi lại khi cài đặt đổi.
    layout: function (canvas, map) {
      var L = Object.assign({}, MUI.layouts[canvas], EXTRA[canvas] || {}), k = sizeK();
      laid[canvas] = map;
      Object.keys(map).forEach(function (id) {
        var el = $(id), r = map[id], e = L[r[0]], s = (r[2] ? 1 : e.scale || 1) * k, w = e.w * s, h = e.h * s, p = r[1] && L[r[1]];
        if (!el) return;
        el.style.setProperty('--w', mu(w));
        el.style.setProperty('--h', mu(h));
        if (p) {
          // độ lệch tâm con so với tâm cha, trục y hướng xuống
          var ox = (e.corner[1] === 'r' ? p.dx - e.dx : e.dx - p.dx) * k, oy = (e.corner[0] === 't' ? e.dy - p.dy : p.dy - e.dy) * k;
          el.style.setProperty('--l', 'calc(50% + ' + mu(ox - w / 2) + ')');
          el.style.setProperty('--t', 'calc(50% + ' + mu(oy - h / 2) + ')');
          return;
        }
        el.style.setProperty(e.corner[1] === 'r' ? '--r' : '--l', mu(e.dx - w / 2));
        el.style.setProperty(e.corner[0] === 't' ? '--t' : '--b', mu(e.dy - h / 2));
      });
    },
    // Gắn ảnh phím PC vào nút. keys: id -> tên phím trong HX_MOBILE_UI.glyphs.
    glyphs: function (keys) {
      Object.keys(keys).forEach(function (id) {
        var el = $(id), g = MUI.glyphs[keys[id]];
        if (!el || !g) return;
        var img = el.querySelector('img.kg') || el.appendChild(document.createElement('img'));
        img.className = 'kg'; img.alt = keys[id];
        img.src = HX.ROOT + MUI.art + 'key/' + keys[id] + '.png' + REV;
      });
    },
    diveUi: function () { Hud.layout('dive', DIVE_UI); Hud.glyphs(DIVE_KEYS); },

    prefs: function () { return prefs; },
    applyPrefs: function () { applyPrefs(); },
    setPref: function (k, v) {
      prefs[k] = v;
      try { localStorage.setItem('bdl.ui', JSON.stringify(prefs)); } catch (e) { /* trình duyệt chặn lưu thì thôi */ }
      applyPrefs();
    },
    onPrefs: function (f) { prefListeners.push(f); },

    // Tạm dừng: chỉ một tấm chữ, chưa có bảng trang bị.
    pause: function (on) { $('pause-note').hidden = !on; },

    // Trạng thái HUD mỗi khung. s: { boost, dashK (0..1 hồi chiêu còn lại), qte, aim: null | { x, y (px lệch), over },
    //   fire: { icon, lv, ammo, max } vũ khí trên nút lớn, sub: icon vũ khí trên nút đổi hoặc null,
    //   drone: null | { left, ok } }.
    touch: function (s) {
      var c = Hud._tc || (Hud._tc = {}), tc = $('tc');
      var gun = !!s.sub;
      if (c.gun !== gun) { c.gun = gun; document.body.classList.toggle('has-gun', gun); }
      var dr = s.drone ? s.drone.left + '|' + s.drone.ok : '';
      if (c.dr !== dr) {
        c.dr = dr;
        document.body.classList.toggle('has-drone', !!s.drone);
        if (s.drone) { $('tb-drone').classList.toggle('off', !s.drone.ok); $('tb-drone-n').textContent = s.drone.left; }
      }
      if (c.boost !== s.boost) { c.boost = s.boost; $('tb-boost').classList.toggle('on', s.boost); }
      var k = (s.dashK * 360).toFixed(0);
      if (c.k !== k) { c.k = k; $('tb-dash-cd').style.setProperty('--k', k + 'deg'); }
      if (c.qte !== s.qte) { c.qte = s.qte; tc.classList.toggle('qte', s.qte); }
      var aim = !!s.aim, over = aim && s.aim.over;
      if (c.aim !== aim) { c.aim = aim; tc.classList.toggle('aiming', aim); }
      if (c.over !== over) { c.over = over; tc.classList.toggle('over', over); }
      if (aim) $('tb-aim').style.transform = 'translate(' + s.aim.x.toFixed(1) + 'px,' + s.aim.y.toFixed(1) + 'px)';
      var f = s.fire;
      if (c.icon !== f.icon) { c.icon = f.icon; $('tb-fire-icon').src = f.icon; }
      var lv = 'Lv.' + f.lv, ammo = f.max ? f.ammo + '/' + f.max : '';
      if (c.lv !== lv) { c.lv = lv; $('tb-fire-lv').textContent = lv; }
      if (c.ammo !== ammo) { c.ammo = ammo; $('tb-fire-ammo').textContent = ammo; $('tb-fire-ammo').hidden = !ammo; }
      if (s.sub && c.sub !== s.sub) { c.sub = s.sub; $('tb-sub-icon').src = s.sub; }
      refresh(s);
    },

    loading: function (k, label) {
      $('load-fill').style.width = (k * 100).toFixed(1) + '%';
      if (label) $('load-label').textContent = label;
    },
  };

  // ---------- phần của HUD đọc trạng thái hệ khác mỗi khung (gọi từ Hud.touch) ----------
  var ICON_BASE = HX.ROOT || '';
  function itemIcon(it) {
    var ic = it && it.icon;
    if (!ic) return null;
    return /\.(png|jpg|webp|svg)(\?|$)/i.test(ic) ? { src: ic } : { text: ic };
  }
  function refresh(s) {
    var BDL = window.BDL || {};
    // chỉ tiêu: thanh tiến độ dưới ô
    var rd = BDL.run && BDL.run.dive;
    if (rd) setProp($('quota-bar'), 'qb', 'width', (rd.quota > 0 ? Math.min(100, rd.onDeck / rd.quota * 100) : 0).toFixed(1) + '%');

    // tay cầm: ô 0 = xiên ∞, ô 1..3 = BDL.hand.slots (chưa có hệ tay cầm thì để trống)
    var hand = BDL.hand, slots = (hand && hand.slots) || [], active = hand && hand.active != null ? hand.active : 0;
    var cells = $('hand').children, nextIcon = null;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i], idx = +cell.getAttribute('data-i'), on = idx === active;
      var sl = idx > 0 ? slots[idx - 1] : null, it = sl && BDL.ITEM_BY_KEY && BDL.ITEM_BY_KEY[sl.key];
      var sig = idx + '|' + (sl ? sl.key + ':' + sl.uses : '-') + '|' + on;
      if (cell._sig === sig) continue;
      cell._sig = sig;
      cell.classList.toggle('on', on);
      var img = cell.querySelector('img.ic'), ei = cell.querySelector('.ei'), n = cell.querySelector('.n');
      if (idx === 0) {
        var hs = s && s.fire && s.fire.icon;
        if (hs && img.getAttribute('src') !== hs) img.src = hs;
        img.hidden = !hs;
        continue;
      }
      cell.classList.toggle('empty', !it);
      var ic = itemIcon(it);
      if (ic && ic.src) { var full = ic.src; if (img.getAttribute('src') !== full) img.src = full; img.hidden = false; ei.textContent = ''; }
      else { img.hidden = true; ei.textContent = ic ? ic.text : ''; }
      n.textContent = it ? (it.uses === 0 && sl.uses === 0 ? '' : '×' + sl.uses) : '';
      n.classList.toggle('zero', !!sl && sl.uses <= 0);
    }
    // nút đổi: hiện đồ kế tiếp trên vòng 0..3 (trống thì chỉ mũi tên)
    var swapG = $('tb-swap').querySelector('.g');
    for (var j = 1; j <= 4 && !nextIcon; j++) {
      var ni = (active + j) % 4, si = ni > 0 ? slots[ni - 1] : null;
      if (ni === 0) nextIcon = { text: '🔱' }; else if (si && BDL.ITEM_BY_KEY && BDL.ITEM_BY_KEY[si.key]) nextIcon = itemIcon(BDL.ITEM_BY_KEY[si.key]);
    }
    setText(swapG, 'swapg', nextIcon && nextIcon.text ? nextIcon.text : '⇄');
    $('tb-swap').classList.toggle('lit', !!nextIcon && (slots[0] || slots[1] || slots[2]) ? true : false);

    // kỹ năng
    var sk = BDL.skill, have = !!(sk && sk.def);
    var sb = $('skill'), tb = $('tb-skill');
    sb.hidden = !have; tb.hidden = !have;
    if (have) {
      var left = Math.max(0, sk.cdLeft), max = Math.max(0.1, sk.cdMax), k = Math.min(1, left / max);
      var deg = (k * 360).toFixed(0) + 'deg', cd = left > 0 ? String(Math.ceil(left)) : '', act = sk.activeLeft ? sk.activeLeft() > 0 : false;
      [sb, tb].forEach(function (b, bi) {
        var key = 'sk' + bi;
        setProp(b.querySelector('.ring'), key, '--k', deg);
        setText(b.querySelector('.ic'), key + 'ic', sk.icon || '✨');
        setText(b.querySelector('.cdn'), key + 'cd', cd);
        setCls(b, key, 'cool', left > 0);
        setCls(b, key, 'act', act);
        setCls(b, key, 'lit', left <= 0);
      });
      setText(tb.querySelector('.nm'), 'sknm', sk.def.name);
      if (sb.getAttribute('title') !== sk.def.name) { sb.title = sk.def.name + ' (R)'; }
    }
    // drone: số chuyến còn lại
    var dn = s && s.drone ? s.drone.left : (rd ? rd.droneLeft : null), dc = $('hud-drone');
    dc.hidden = dn == null;
    if (dn != null) { setText($('hud-drone-n'), 'dn', String(dn)); dc.classList.toggle('off', s && s.drone ? !s.drone.ok : dn <= 0); }
  }

  // Nút cảm ứng mới: móc, đổi, kỹ năng (và nút kỹ năng của PC) đi qua BDL.press như phím Q / lăn chuột / R.
  function bindPress(id, key) {
    var el = $(id);
    if (!el) return;
    var go = function () { if (window.BDL && BDL.press) BDL.press(key); };
    el.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); HX.audio.unlock(); go(); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); });
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); go(); });
  }
  bindPress('tb-swap', 'swap');
  bindPress('tb-skill', 'skill');
  bindPress('skill', 'skill');

  rescale();
  addEventListener('resize', rescale);
  new MutationObserver(rescale).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  HX.hud = Hud;
})(window.HX = window.HX || {});
