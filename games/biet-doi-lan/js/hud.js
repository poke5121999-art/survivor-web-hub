// Lớp DOM phủ trên cảnh (fork của Hố Xanh): HUD theo bản Android (nút đặt từ data/mobile_ui.js, phím PC trên nút),
// dưỡng khí (là máu), thể lực, tầng + độ sâu, cảnh báo vùng áp suất, chỉ tiêu, thanh giằng co.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING;
  var $ = function (id) { return document.getElementById(id); };
  var REV = (function () { var v = ((document.currentScript && document.currentScript.src.split('v=')[1]) || '').split('&')[0]; return v ? '?v=' + v : ''; })();

  var MUI = window.HX_MOBILE_UI;
  // HUD lúc lặn: id phần tử -> [vai trong HX_MOBILE_UI.layouts.dive, vai của phần tử cha (con đặt theo tâm cha)]
  var DIVE_UI = {
    'stick': ['stick'], 'stick-knob': ['knob', 'stick'], 'stick-sprint': ['sprint', 'stick'], 'stick-sprint-img': ['sprintImg', 'sprint'],
    'tb-dash': ['dashBtn'], 'tb-dash-icon': ['dashIcon', 'dashBtn'], 'tb-dash-cd': ['dashCd', 'dashBtn'],
    'tb-boost': ['boost'], 'tb-boost-icon': ['boostIcon', 'boost'], 'tb-boost-on': ['boostOn', 'boost'],
    'tb-knife': ['melee'], 'tb-knife-icon': ['meleeIcon', 'melee'],
    'tb-grab': ['interact'], 'tb-drone': ['drone'], 'tb-drone-icon': ['droneIcon', 'drone'],
    'tb-fire': ['fire'], 'tb-fire-icon': ['fireIcon', 'fire'], 'tb-fire-lv': ['fireLevel', 'fire'], 'tb-fire-ammo': ['fireAmmo', 'fire'],
    'tb-switch': ['switch'], 'tb-aimbg': ['aimBg'], 'tb-aim': ['aim'], 'tb-cancel': ['cancel'],
    'tb-qte': ['qte'], 'tb-qte-ring': ['qteRing', 'qte'],
    'btn-pause': ['menu'],
  };
  // Phím PC hiện trên từng nút (ảnh InputAtlas_Keyboard gốc). Là phím của bản web (main.js), không phải bảng DRInput gốc:
  // bản gốc lướt = Ctrl, dao = chuột trái, ngắm xiên = chuột phải. drone: Ctrl trái (SubInteraction gốc), cùng phím main.js gắn.
  var DIVE_KEYS = {
    'tb-dash': 'Space', 'tb-boost': 'Shift', 'tb-knife': 'F', 'tb-grab': 'E', 'tb-drone': 'Ctrl',
    'tb-fire': 'Mouse_Left', 'tb-switch': 'Mouse_Right', 'tb-qte': 'Space', 'btn-pause': 'Esc',
  };
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

  var Hud = {
    // max: dưỡng khí tối đa của bình đang đeo (G.loadout.o2)
    o2: function (v, max) {
      var k = Math.max(0, Math.min(1, v / max));
      $('o2-num').textContent = Math.ceil(v);
      $('o2-pie').style.setProperty('--k', (k * 360).toFixed(1) + 'deg');
      var low = v < T.o2.lowAt;
      document.body.classList.toggle('low-o2', low);
      $('vignette').style.opacity = low ? (0.45 + 0.35 * (1 - v / T.o2.lowAt)).toFixed(2) : '0';
    },
    // floor: 0-based; floors: tổng số tầng. Dưới tầng cuối là vùng áp suất.
    depth: function (m, floor, floors) {
      var k = Math.min(floor + 1, floors);
      $('depth').textContent = 'Tầng ' + k + '/' + floors + ' · ' + Math.max(0, Math.round(m)) + ' m';
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
    quota: function (txt) { $('quota').textContent = txt; },
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
    // Có xác trong tầm thì body.can-harvest bật nút Nhặt trên màn cảm ứng.
    harvest: function (p) {
      var el = $('harvest'), on = !!p;
      if (Hud._hv !== on) { Hud._hv = on; el.hidden = !on; document.body.classList.toggle('can-harvest', on); }
      if (!on) return;
      el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
      el.classList.toggle('carve', !!p.carve);
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

    // Đặt vị trí và cỡ nút theo RectTransform gốc (HX_MOBILE_UI.layouts[canvas], đơn vị canvas 2340 ngang), nhân cỡ nút
    // của bảng cài đặt quanh tâm gốc. map: id phần tử -> [vai, vai cha, 1 = bỏ độ phóng gốc]. Gọi lại khi cài đặt đổi.
    layout: function (canvas, map) {
      var L = MUI.layouts[canvas], k = sizeK();
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
    },

    loading: function (k, label) {
      $('load-fill').style.width = (k * 100).toFixed(1) + '%';
      if (label) $('load-label').textContent = label;
    },
  };

  HX.hud = Hud;
})(window.HX = window.HX || {});
