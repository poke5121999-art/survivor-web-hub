/* Ác Quỷ II - ui.js
 * HUD và các bảng dựng từ ảnh giao diện gốc của Diablo II (D2_UI, nạp qua D2.E.UI): thanh điều khiển, hai quả cầu,
 * túi đồ, nhân vật, cây kỹ năng, kho, cửa hàng, waypoint, nhật ký, menu Esc, màn đầu. Chữ dùng font DC6 gốc qua
 * E.text / E.textHtml (engine.js), chữ có dấu tiếng Việt rơi về web font.
 * DOM phủ lên canvas, nằm trong #stage 960x540 nên co giãn cùng canvas.
 * UI chỉ ĐỌC trạng thái từ D2.Game.S và gọi hàm của D2.Game (statUp, skillUp, equipItem ...).
 *
 * Toạ độ ảnh D2 tính cho màn 800x600: khung có r=[x,y,w,h,ox,oy,trang] đặt tại (x,y) thì góc trên trái là (x-ox, y-oy).
 * Mỗi bảng là một khối .pin 320x432 theo toạ độ D2, co bằng transform: scale(PK) nên mọi con số bên dưới là điểm ảnh D2.
 */
(function () {
  'use strict';
  var D2 = window.D2 = window.D2 || {};
  var UI = D2.UI = { open: {}, root: null, dirtyAt: 0, sel: null, shop: null, dlg: null, skTab: 0 };
  var $ = function (sel, el) { return (el || document).querySelector(sel); };

  function h(tag, cls, html, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  UI.esc = esc;
  function G() { return D2.Game; }
  function S() { return D2.Game.S; }
  function DA() { return D2.DA; }
  function UA() { return D2.E.UI || {}; }
  function PN(name) { return (UA().panels || {})[name] || []; }

  var QCOL = { normal: '#e8e8e8', superior: '#d8d8d8', low: '#8a8a8a', magic: '#6e7bff', rare: '#ffe45a', unique: '#c7b377', set: '#2fd12f', crafted: '#ff9a2e' };
  UI.qcol = function (q) { return QCOL[q] || QCOL.normal; };
  // màu chữ D2 (bảng TextColors của pal.pl2) theo phẩm chất, dùng cho E.text / E.textHtml
  var QNAME = { normal: 'white', superior: 'white', low: 'white', magic: 'blue', rare: 'yellow', unique: 'gold', set: 'green', crafted: 'orange', quest: 'gold' };
  UI.qname = function (q) { return QNAME[q] || 'white'; };
  function T(str, font, color) { return D2.E.textHtml(str, font || 'font16', color); }
  UI.T = T;
  var QBG = { magic: 'rgba(40,40,150,.35)', rare: 'rgba(150,140,30,.3)', unique: 'rgba(120,100,50,.35)', set: 'rgba(30,120,30,.35)', crafted: 'rgba(150,80,20,.35)' };

  var CELL = 29;            // ô túi đồ của D2
  var PK = 0.95;            // hệ số co của bảng so với toạ độ D2: cao 432 -> 410, vừa phía trên thanh điều khiển
  var HK = 1.2;             // 800 -> 960 theo chiều ngang, không méo
  var PW = 320, PH = 432;
  var BAR_TOP = 496, BAR_H = 104;
  var LEFT = ['char', 'quest', 'stash'], RIGHT = ['inv', 'skill'];
  var SLOT_IDX = { head: 4, amulet: 5, body: 6, rhand: 7, lhand: 8, ring1: 9, ring2: 10, belt: 11, boots: 12, gloves: 13 };
  var SLOT_NAME = { head: 'Mũ', amulet: 'Dây chuyền', rhand: 'Tay phải', body: 'Áo giáp', lhand: 'Tay trái', gloves: 'Găng', belt: 'Đai', boots: 'Giày', ring1: 'Nhẫn', ring2: 'Nhẫn' };

  /* ------------------------------------------------------------ vẽ ảnh D2 */
  function spStyle(r, x, y) { return 'left:' + (x - (r[4] || 0)) + 'px;top:' + (y - (r[5] || 0)) + 'px;' + D2.E.uiSprite(r, 1); }
  function frames(parent, list, ox, oy) {
    (list || []).forEach(function (f) {
      if (!f || !f.r || !f.r.length) return;
      var e = h('div', 'sp', '', parent); e.style.cssText = spStyle(f.r, f.x - ox, f.y - oy);
    });
  }
  function box(parent, cls, x, y, w, hh, html) {
    var e = h('div', cls, html == null ? '' : html, parent);
    e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = w + 'px'; e.style.height = hh + 'px';
    return e;
  }
  /* Khối nền của một bảng: .pin theo toạ độ D2, gốc (ox,oy). */
  function pin(p, list, ox, oy) {
    p.innerHTML = '';
    var q = h('div', 'pin', '', p);
    frames(q, list, ox, oy == null ? 60 : oy);
    return q;
  }
  function closeBtn(q, p, x, y) {
    var b = box(q, 'xbtn', x, y, 36, 36, '&#10005;'); b.title = 'Đóng';
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.closePanelOf(p); });
    return b;
  }

  /* ------------------------------------------------------------------ dựng */
  UI.init = function (stage) {
    var r = UI.root = h('div', 'ui', null, stage);
    r.id = 'ui';
    buildHud(r);
    UI.panels = {};
    ['inv', 'char', 'skill', 'quest', 'stash'].forEach(function (id) {
      var p = h('div', 'panel d2 ' + id, '', r); p.id = 'p-' + id; p.style.display = 'none';
      UI.panels[id] = p;
    });
    RIGHT.forEach(function (k) { UI.panels[k].classList.add('right'); }); ['char', 'quest', 'stash'].forEach(function (k) { UI.panels[k].classList.add('left'); });
    UI.logEl = h('div', 'msglog', '', r); UI.logEl.style.display = 'none';
    UI.helpEl = h('div', 'help', '', r); UI.helpEl.style.display = 'none';
    UI.dlgEl = h('div', 'dialog', '', r); UI.dlgEl.style.display = 'none';
    UI.shopEl = h('div', 'panel d2 left shop', '', r); UI.shopEl.style.display = 'none';
    UI.wpEl = h('div', 'modal d2 wpmenu', '', r); UI.wpEl.style.display = 'none';
    UI.menuEl = h('div', 'escmenu', '', r); UI.menuEl.style.display = 'none';
    UI.popup = h('div', 'skpop', '', r); UI.popup.style.display = 'none';
    UI.tipEl = h('div', 'tip', '', r); UI.tipEl.style.display = 'none';
    UI.toasts = h('div', 'toasts', '', r);
    UI.mapEl = h('canvas', 'automap', '', r); UI.mapEl.width = 960; UI.mapEl.height = 540; UI.mapEl.style.display = 'none';
    UI.titleEl = h('div', 'screen title', '', r); UI.titleEl.style.display = 'none';
    UI.deadEl = h('div', 'screen dead', '', r); UI.deadEl.style.display = 'none';
    UI.loadEl = h('div', 'screen load', '<div class="lt">Đang tải...</div>', r); UI.loadEl.style.display = 'none';
    UI.rotate = h('div', 'rotate', '<div>Hãy xoay ngang điện thoại</div><small>xoay ngang để chơi</small>', r);
    UI.curEl = h('div', 'cur', '', r);
    initCursor(stage);
    // chuột phải trên bảng là uống bình / dùng đồ, không mở menu của trình duyệt
    r.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  /* ------------------------------------------------------- con trỏ bàn tay */
  // Con trỏ D2 vẽ bằng DOM (không phải vẽ lại canvas khi chỉ rê chuột): ohand, ppress khi nhấn,
  // hình món đồ khi đang cầm, buysell khi rê trên cửa hàng. Khung neo theo hot spot DC6.
  var cur = { x: 480, y: 270, down: false, downT: 0, key: '', fr: -1 };
  function initCursor(stage) {
    function mv(e) {
      var p = D2.Input.logical(e); cur.x = p.x; cur.y = p.y;
      cur.shop = !!(e.target && e.target.closest && e.target.closest('.shop'));
      drawCursor(true);
    }
    stage.addEventListener('pointermove', mv, true);
    stage.addEventListener('pointerdown', function (e) { mv(e); cur.down = true; cur.downT = performance.now(); drawCursor(); }, true);
    window.addEventListener('pointerup', function () { cur.down = false; drawCursor(); }, true);
  }
  function drawCursor(moveOnly) {
    var el = UI.curEl; if (!el) return;
    var c = S() && S().char, it = c && S().scene === 'play' ? c.hand : null, C = UA().cursor || {};
    var key, r = null, html = '';
    if (it) key = 'item';
    else if (cur.shop && UI.shop) key = 'buysell';
    else key = cur.down ? 'ppress' : 'hand';
    if (key !== 'item') {
      var list = C[key] || C.hand || [];
      var fr = key === 'ppress' ? Math.min(list.length - 1, Math.floor((performance.now() - cur.downT) / 40)) : 0;
      r = list[fr];
      if (key + fr !== cur.key) { cur.key = key + fr; el.innerHTML = ''; el.style.cssText = r ? D2.E.uiSprite(r, 1) : ''; el.dataset.k = key; }
      // buysell neo ở góc trên trái như bàn tay; số oy của khung này đo theo đáy nên không dùng
      var ox = r ? r[4] : 0, oy = r && key !== 'buysell' ? r[5] : 0;
      el.style.left = (cur.x - ox) + 'px'; el.style.top = (cur.y - oy) + 'px';
    } else {
      if (cur.key !== 'item' || cur.it !== it) {
        cur.key = 'item'; cur.it = it; el.style.cssText = 'transform:scale(' + PK + ');transform-origin:0 0'; el.innerHTML = ''; el.dataset.k = 'item';
        var ie = itemEl(it, CELL); ie.style.cssText += ';position:absolute;left:0;top:0;background:none'; el.appendChild(ie);
        cur.iw = (it.w || 1) * CELL; cur.ih = (it.h || 1) * CELL;
      }
      el.style.left = (cur.x - cur.iw * PK / 2) + 'px'; el.style.top = (cur.y - cur.ih * PK / 2) + 'px';
    }
    if (!moveOnly && it) UI.tip(null);
  }
  UI.cursorTick = function () { drawCursor(); };

  // ảnh UI nằm trong nhóm m/ui nạp sau UI.init, nên HUD được dựng lại khi nhóm đó tới
  UI.rebuildHud = function () {
    var old = UI.hud;
    buildHud(UI.root);
    UI.root.insertBefore(UI.hud, old); UI.root.removeChild(old);
  };
  /* Nút ảnh D2 có khung thả/nhấn: frameOf(down) trả rect; bấm xong (nhả chuột trên nút) thì gọi fn. */
  function pressBtn(e, frameOf, fn) {
    function paint(dn) { var r0 = frameOf(dn); if (r0) e.style.cssText = e.style.cssText.replace(/background[^;]*;?/g, '') + ';' + D2.E.uiSprite(r0, 1); }
    e._paint = paint; paint(false);
    e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); paint(true); D2.E.sfx(['cursor_button_click'], 0.4); });
    e.addEventListener('pointerup', function (ev) { ev.stopPropagation(); fn(); paint(false); });
    e.addEventListener('pointerleave', function () { paint(false); });
  }
  function buildHud(r) {
    var hud = UI.hud = h('div', 'hud', '', r); hud.style.display = 'none';
    var A = UA(), L = A.layout || {}, HL = L.hud || {}, bar = UI.bar = h('div', 'hbar', '', hud);
    function at(cls, x, y, w, hh, html, parent) { return box(parent || bar, cls, x, y - BAR_TOP, w, hh, html); }
    frames(bar, PN('ctrlpanel'), 0, BAR_TOP);
    // quả cầu: ảnh cầu đầy được cắt từ đáy theo phần trăm (xem UI.update); kính overlap.dc6 vẽ đè lên trên
    var G0 = (A.panels && A.panels.globes) || {};
    UI._glob = { hp: G0.hp && G0.hp.r, mp: G0.mp && G0.mp.r, poison: G0.poison && G0.poison.r };
    UI.lifeOrb = at('orb life', G0.hp ? G0.hp.x : 29, G0.hp ? G0.hp.y : 507, 80, 80, '<div class="fill"></div><div class="lab"></div>');
    UI.manaOrb = at('orb mana', G0.mp ? G0.mp.x : 689, G0.mp ? G0.mp.y : 507, 80, 80, '<div class="fill"></div><div class="lab"></div>');
    ['hp', 'mp'].forEach(function (k) {
      var f = $('.fill', k === 'hp' ? UI.lifeOrb : UI.manaOrb), r0 = UI._glob[k];
      if (r0) f.style.cssText = D2.E.uiSprite(r0, 1) + 'left:0;bottom:0;top:auto;';
    });
    if (G0.hpFrame) frames(bar, [G0.hpFrame, G0.mpFrame], 0, BAR_TOP);
    // layout.hud.exp/stamina/belt tính theo màn 640 nên lệch +80 so với thanh 800
    var ex = HL.exp || [176, 561, 119, 2], sm = HL.stamina || [193, 573, 102, 18];
    ex = [ex[0] + 80, ex[1], ex[2], ex[3]]; sm = [sm[0] + 80, sm[1], sm[2], sm[3]];
    UI.xpBar = at('xpbar', ex[0], ex[1] - 1, ex[2], 4, '<i></i>');
    UI.stamBar = at('stam', sm[0], sm[1], sm[2], sm[3], '<i></i>');
    var BU = (A.panels && A.panels.buttons) || {};
    // nút chạy/đi bộ (runbutton.dc6): khung 0 đi bộ, 2 chạy, +1 khi đang nhấn
    var RB = BU.run || [];
    if (RB[0]) {
      UI.runBtn = at('hbtn run', RB[0].x + 80 - (RB[0].r[4] || 0), RB[0].y - (RB[0].r[5] || 0), RB[0].r[2], RB[0].r[3], '');
      UI.runBtn.title = 'Chạy / đi bộ (R)';
      pressBtn(UI.runBtn, function (dn) { var f = RB[(S().runOn ? 2 : 0) + (dn ? 1 : 0)]; return f && f.r; }, function () { S().runOn = !S().runOn; });
    }
    UI.belt = at('belt', 423, 562, 124, 30, '');
    UI.beltPop = at('beltpop', 423, 527, 125, 32, ''); UI.beltPop.style.display = 'none';
    var ls = HL.leftSkill || [117, 552], rs = HL.rightSkill || [635, 552];
    UI.lskill = at('skbtn left', ls[0], ls[1], 48, 48, ''); UI.rskill = at('skbtn right', rs[0], rs[1], 48, 48, '');
    UI.lskill.title = 'Kỹ năng chuột trái'; UI.rskill.title = 'Kỹ năng chuột phải';
    UI.lskill.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skillPopup('left'); });
    UI.rskill.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skillPopup('right'); });
    // mini panel (minipanel_s.dc6): ẩn mặc định, nút menubutton bật/tắt. Nút k dùng khung 2k (thả) / 2k+1 (nhấn)
    // theo thứ tự minipanelbtn: nhân vật 0, túi 1, cây kỹ năng 2, (party 3), bản đồ 4, tin nhắn 5, nhiệm vụ 6, menu 7.
    var mp = (A.panels && A.panels.minipanel && A.panels.minipanel.single);
    UI.miniX = mp ? mp.x : 322;
    UI.hudBtns = at('hudbtns', UI.miniX, mp ? mp.y : 527, mp ? mp.r[2] : 152, 25, ''); UI.hudBtns.style.display = 'none';
    if (mp) { var st = h('div', 'sp', '', UI.hudBtns); st.style.cssText = 'left:0;top:0;' + D2.E.uiSprite(mp.r, 1); }
    var MB = BU.minipanel || [];
    [['Nhân vật (C)', 'char', 0], ['Túi đồ (I)', 'inv', 1], ['Cây kỹ năng (T)', 'skill', 2], ['Bản đồ (Tab)', 'map', 4], ['Tin nhắn', 'log', 5], ['Nhiệm vụ (Q)', 'quest', 6], ['Menu (Esc)', 'menu', 7]].forEach(function (b, i) {
      var e = h('button', 'hb', '', UI.hudBtns); e.title = b[0];
      e.style.left = (3 + i * 21) + 'px'; e.style.top = '3px';
      pressBtn(e, function (dn) { var f = MB[2 * b[2] + (dn ? 1 : 0)]; return f && f.r; }, function () {
        if (b[1] === 'menu') UI.toggleMenu(); else if (b[1] === 'log') UI.toggleLog(); else UI.toggle(b[1]);
      });
    });
    var MN = BU.menu || [];
    if (MN[0]) {
      UI.miniBtn = at('hbtn mini', MN[0].x + 80 - (MN[0].r[4] || 0), MN[0].y - (MN[0].r[5] || 0), MN[0].r[2], MN[0].r[3], '');
      UI.miniBtn.title = 'Mini panel';
      pressBtn(UI.miniBtn, function (dn) { var f = MN[(UI.miniOn ? 2 : 0) + (dn ? 1 : 0)]; return f && f.r; }, function () { UI.miniOn = !UI.miniOn; });
    }
    // nút +chỉ số / +kỹ năng nhấp nháy khi còn điểm
    function lvlBtn(def, id, title, key) {
      var e = at('lvlbtn', def[0].x, def[0].y, def[0].r[2], def[0].r[3], ''); e.title = title; e.style.display = 'none';
      e.style.cssText += ';' + D2.E.uiSprite(def[0].r, 1);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.toggle(key); });
      return e;
    }
    UI.statBtn = BU.statup ? lvlBtn(BU.statup, 'stat', 'Có điểm chỉ số', 'char') : null;
    UI.skillBtn = BU.skillup ? lvlBtn(BU.skillup, 'skill', 'Có điểm kỹ năng', 'skill') : null;
    UI.mon = h('div', 'monbar', '<i></i><span></span>', hud);
    // chân dung lính đánh thuê góc trên trái (ui/hireables theo act) với thanh máu bên dưới
    UI.mercEl = h('div', 'merc', '<div class="mpic"></div><i class="mbar"><b></b></i>', hud); UI.mercEl.style.display = 'none';
    UI._last = {};
  }

  /* ----------------------------------------------------------- HUD mỗi khung */
  UI.showHud = function (on) { UI.hud.style.display = on ? 'block' : 'none'; if (!on) UI._last.area = null; };
  function setGlobe(orb, r, pct) {
    var f = $('.fill', orb); if (!r) return;
    var hh = Math.round(r[3] * pct / 100);
    f.style.height = hh + 'px'; f.style.backgroundPosition = '-' + r[0] + 'px -' + (r[1] + r[3] - hh) + 'px';
  }
  UI.update = function (t) {
    var s = S(); if (!s || !s.char) return;
    var c = s.char, d = s.d || {}, L = UI._last;
    var mh = Math.max(1, d.maxHp || c.hp), mm = Math.max(1, d.maxMp || c.mp);
    var lp = Math.round(Math.max(0, c.hp) / mh * 100), mp = Math.round(Math.max(0, c.mp) / mm * 100);
    var pois = !!(s.hero && s.hero.poisonUntil > s.time && UI._glob.poison), lk = lp + (pois ? 'p' : '');
    if (L.lp !== lk) { L.lp = lk; setGlobe(UI.lifeOrb, pois ? UI._glob.poison : UI._glob.hp, lp); }
    if (L.mp !== mp) { L.mp = mp; setGlobe(UI.manaOrb, UI._glob.mp, mp); }
    var lt = Math.ceil(c.hp) + '/' + mh, mt = Math.ceil(c.mp) + '/' + mm;
    if (L.lt !== lt) { L.lt = lt; $('.lab', UI.lifeOrb).textContent = lt; }
    if (L.mt !== mt) { L.mt = mt; $('.lab', UI.manaOrb).textContent = mt; }
    var xp = DA().xpFor(c.lvl), xn = DA().xpFor(c.lvl + 1), xpp = Math.round(Math.max(0, Math.min(1, (c.xp - xp) / Math.max(1, xn - xp))) * 1000) / 10;
    if (L.xp !== xpp) { L.xp = xpp; $('i', UI.xpBar).style.width = xpp + '%'; UI.xpBar.title = 'Kinh nghiệm ' + c.xp + ' / ' + xn; }
    var sp = Math.round((s.stamina / Math.max(1, s.stamMax)) * 100);
    if (L.sp !== sp) { L.sp = sp; $('i', UI.stamBar).style.width = sp + '%'; UI.stamBar.classList.toggle('low', sp < 25); }
    var pk = c.statPts + '/' + c.skillPts;
    if (L.pk !== pk) {
      L.pk = pk;
      if (UI.statBtn) UI.statBtn.style.display = c.statPts > 0 ? 'block' : 'none';
      if (UI.skillBtn) UI.skillBtn.style.display = c.skillPts > 0 ? 'block' : 'none';
    }
    var sig = c.hp > 0 ? [s.leftSkill, s.rightSkill, c.belt.map(function (b) { return b ? b.name || b.base : '-'; }).join(), JSON.stringify(s.fkeys), c.lvl, c.equip.belt ? c.equip.belt.base : ''].join('|') : L.sig;
    if (L.sig !== sig) { L.sig = sig; UI.refreshSkillIcons(); UI.refreshBelt(); }
    // hai bên bảng: khung nhìn dịch về nửa còn trống, mini panel dịch theo và ẩn khi mở cả hai bên (OD mini_panel)
    var lo = UI.sideOpen('left'), ro = UI.sideOpen('right'), side = (lo ? 'L' : '') + (ro ? 'R' : '') + (UI.miniOn ? 'm' : '') + (s.runOn ? 'r' : '');
    if (L.side !== side) {
      L.side = side;
      D2.E.viewOffX = lo && !ro ? 152 : ro && !lo ? -152 : 0;
      UI.hudBtns.style.display = UI.miniOn && !(lo && ro) ? 'block' : 'none';
      UI.hudBtns.style.left = (UI.miniX + (lo && !ro ? 130 : ro && !lo ? -130 : 0)) + 'px';
      if (UI.miniBtn) UI.miniBtn._paint(false);
      if (UI.runBtn) UI.runBtn._paint(false);
    }
    // "Entering ..." giữa phía trên màn hình mỗi lần đổi khu, mờ dần sau ~3 giây (zoneChangeText của OD hud)
    if (L.area !== s.areaId && s.areaId && s.areaName) { L.area = s.areaId; UI.zone = { text: 'Entering ' + s.areaName, t: performance.now() }; }
    // quái đang trỏ: tên ở giữa phía trên trên nền thanh máu (champion xanh, unique vàng kim)
    var m = s.hover && s.hover.kind === 'mon' ? s.hover : s.target && s.target.kind === 'mon' && s.target.st !== 'dead' ? s.target : null;
    if (m && m.st !== 'dead' && m.inst) {
      UI.mon.style.display = 'block';
      var mk = m.inst.name + '|' + m.rank;
      if (UI.mon._k !== mk) { UI.mon._k = mk; $('span', UI.mon).innerHTML = T(m.inst.name, 'font16', m.rank === 'champion' ? 'blue' : /unique/.test(m.rank || '') ? 'gold' : 'white'); }
      $('i', UI.mon).style.width = Math.max(0, m.hp / m.maxHp * 100) + '%';
      UI.mon.className = 'monbar ' + (m.rank || 'normal');
    } else UI.mon.style.display = 'none';
    var me = s.merc, mi = me && !me.removed && me.hp > 0 && c.merc ? c.merc.act + ':' + Math.ceil(me.hp / me.maxHp * 46) : '';
    if (L.merc !== mi) {
      L.merc = mi; UI.mercEl.style.display = mi ? 'block' : 'none';
      if (mi) {
        var mr = ((UA().panels || {}).extra || {}).merc || {}, pr = me.hp / me.maxHp;
        $('.mpic', UI.mercEl).style.cssText = D2.E.uiSprite(mr[c.merc.act] || mr[1], 1);
        var bar = $('b', UI.mercEl); bar.style.width = Math.round(pr * 100) + '%';
        bar.style.background = pr > 0.5 ? '#18b818' : pr > 0.25 ? '#d8b818' : '#d81818';
        UI.mercEl.title = c.merc.name + ' (' + Math.ceil(me.hp) + '/' + me.maxHp + ')';
      }
    }
    drawCursor();
    if (t - UI.dirtyAt > 150) {
      UI.dirtyAt = t;
      if (UI.dirty) { UI.dirty = false; UI.renderOpen(); }
      if (UI.open.map) UI.drawMap();
    }
  };

  // Lớp chữ vẽ thẳng lên canvas sau thế giới (game.js render gọi): "Entering X" bằng Font30 ở (W/2, H/4), giữ 3 giây
  // rồi mờ trong 1 giây.
  UI.drawOver = function (c) {
    var z = UI.zone; if (!z) return;
    var a = 1 - Math.max(0, (performance.now() - z.t - 3000) / 1000);
    if (a <= 0) { UI.zone = null; return; }
    c.globalAlpha = a; D2.E.text(z.text, 'font30', 480, 135 - D2.E.textHeight('font30') / 2, 'white', 'center'); c.globalAlpha = 1;
  };

  function skIconHtml(id, size) {
    var sk = DA().skill(id), gen = (UA().skillIcons || {}).GEN;
    // đánh thường: ô 2 của skillicon.dc6 chung (GEN), như icon Attack của D2
    var ic = sk ? DA().skillIcon(id) : gen && gen[2], st = ic ? D2.E.uiSprite(ic, size / ic[2]) : '';
    return '<div class="ico" style="width:' + size + 'px;height:' + size + 'px;' + st + '">' + (st ? '' : !sk ? '&#9876;' : '<span class="sn">' + esc(sk.name) + '</span>') + '</div>';
  }
  UI.skIconHtml = skIconHtml;

  UI.refreshSkillIcons = function () {
    var s = S(); if (!s) return;
    var l = DA().skill(s.leftSkill) || { name: 'Đánh thường' }, r = DA().skill(s.rightSkill) || { name: 'Đánh thường' };
    UI.lskill.innerHTML = skIconHtml(s.leftSkill, 46) + '<small>' + esc(l.name) + '</small>'; UI.lskill.title = 'Chuột trái: ' + l.name;
    UI.rskill.innerHTML = skIconHtml(s.rightSkill, 46) + '<small>' + esc(r.name) + '</small>'; UI.rskill.title = 'Chuột phải: ' + r.name;
    for (var i = 0; i < 4; i++) {
      var id = s.fkeys[i], sk = id && DA().skill(id);
      var ti = sk && DA().skillIcon(id);
      D2.Input.setTouchSkill(i, sk ? sk.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 3) : '', ti ? D2.E.uiSprite(ti, 58 / ti[2]) : '');
    }
    var ab = D2.Input.touchBtns && D2.Input.touchBtns.atk; if (ab) ab.textContent = 'Đánh';
  };
  // ô đai: chuột trái cầm bình lên (hoặc đặt bình đang cầm), chuột phải uống
  function beltSlot(parent, i, x, y) {
    var c = S().char, it = c.belt[i];
    var slot = h('div', 'bslot', i < 4 ? '<small>' + (i + 1) + '</small>' : '', parent);
    slot.style.left = x + 'px'; slot.style.top = y + 'px';
    if (it) { slot.appendChild(itemEl(it, 28, false)); hoverTip(slot, function () { return itemTipHtml(it); }, true); }
    slot.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      if (c.hand) G().putBelt(i);
      else if (e.button === 2) G().drinkBelt(i);
      else if (c.belt[i]) G().pickUp(c.belt[i]);
      UI.tip(null);
    });
  }
  UI.refreshBelt = function () {
    var s = S(), c = s.char; UI.belt.innerHTML = '';
    for (var i = 0; i < 4; i++) beltSlot(UI.belt, i, i * 31, 0);
    // đai to (~): các hàng trên theo numboxes của belts.txt, vẽ bằng ctrlpnl_popbelt
    var rows = Math.max(1, G().beltCap() / 4), pop = UI.beltPop, pb = PN('popbelt')[0];
    pop.innerHTML = '';
    pop.style.display = UI.beltOpen && rows > 1 ? 'block' : 'none';
    pop.style.left = '421px'; pop.style.top = (527 - BAR_TOP - (rows - 2) * 32) + 'px'; pop.style.height = ((rows - 1) * 32) + 'px';
    for (var r = 1; r < rows; r++) {
      var y = (rows - 1 - r) * 32;
      if (pb) { var bg = h('div', 'sp', '', pop); bg.style.cssText = 'left:0;top:' + y + 'px;' + D2.E.uiSprite(pb.r, 1); }
      for (var k = 0; k < 4; k++) beltSlot(pop, r * 4 + k, 2 + k * 31, y + 1);
    }
    var p1 = D2.Input.touchBtns && D2.Input.touchBtns.p1, p2 = D2.Input.touchBtns && D2.Input.touchBtns.p2;
    if (p1) p1.textContent = c.belt[0] ? 'Bình 1' : '-'; if (p2) p2.textContent = c.belt[1] ? 'Bình 2' : '-';
  };
  UI.toggleBelt = function () { UI.beltOpen = !UI.beltOpen; UI.refreshBelt(); };

  /* ------------------------------------------------------------- phần tử đồ */
  function itemEl(it, cell, abs) {
    var w = (it.w || 1), hgt = (it.h || 1);
    var e = h('div', 'item q-' + (it.q || 'normal'));
    e.style.width = (abs === false ? cell : w * cell) + 'px'; e.style.height = (abs === false ? cell : hgt * cell) + 'px';
    fillItem(e, it, (abs === false ? 1 : w) * cell, (abs === false ? 1 : hgt) * cell);
    return e;
  }
  function fillItem(e, it, bw, bh) {
    var lootSt = DA().iconBox(it, bw - 2, bh - 2);
    if (lootSt) {
      var li = h('div', 'iimg', '', e); li.style.cssText = lootSt + 'left:50%;top:50%;margin:0;transform:translate(-50%,-50%);';
    } else {
      e.textContent = DA().itemName(it).replace(/[^A-Za-zÀ-ỹ ]/g, '').split(' ').map(function (x) { return x[0]; }).join('').slice(0, 3);
    }
    e.style.color = UI.qcol(it.q);
    if (QBG[it.q]) e.style.backgroundColor = QBG[it.q];
  }
  /* Đồ vừa khít một ô có kích thước bw x bh (ô trang bị). */
  function itemFit(it, bw, bh) {
    var e = h('div', 'item q-' + (it.q || 'normal')); e.style.width = bw + 'px'; e.style.height = bh + 'px';
    fillItem(e, it, bw, bh); return e;
  }
  UI.itemEl = itemEl;

  /* Chú thích đồ như D2: mọi dòng căn giữa, tên theo màu phẩm chất (xám nếu đồ thường có lỗ cắm hoặc ethereal),
   * số gốc trắng, affix xanh, yêu cầu chưa đủ đỏ. Bình thuốc chỉ có tên. extra: dòng thêm (giá) màu trắng. */
  function itemTipHtml(it, extra) {
    var c = S() && S().char, q = it.q || 'normal';
    var sock = (it.affixes || []).some(function (a) { return a.stat === 'sock'; });
    var ncol = (q === 'normal' || q === 'superior') && (sock || it.eth) ? 'grey' : UI.qname(q);
    var out = DA().itemName(it).split('\n').map(function (l, i) { return '<div' + (i ? '' : ' class="tname"') + '>' + T(l, 'font16', ncol) + '</div>'; });
    var lines = DA().potionInfo(it) || !window.D2R ? [] : D2R.itemStats(it);
    lines.forEach(function (l) {
      var col = l.kind === 'mod' ? 'blue' : 'white';
      if (l.kind === 'req' && c && Object.keys(l.need).some(function (k) { return (c[k] || 0) < l.need[k]; })) col = 'red';
      out.push('<div data-k="' + l.kind + '">' + T(l.text, 'font16', col) + '</div>');
    });
    (extra || []).forEach(function (l) { out.push('<div>' + T(l, 'font16', 'white') + '</div>'); });
    return out.join('');
  }
  UI.itemTipHtml = itemTipHtml;

  // khung của phần tử theo toạ độ logic 960x540 (stage co giãn bằng transform)
  function logicalRect(el) {
    var s = UI.root.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / 960;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  // at: {x, y} con trỏ (chú thích kỹ năng, lệch phải-dưới) hoặc khung món đồ {x, y, w, h} (đặt giữa, ngay phía trên;
  // không đủ chỗ thì xuống dưới)
  UI.tip = function (html, at, item) {
    var el = UI.tipEl;
    if (!html || (S() && S().char && S().char.hand)) { el.style.display = 'none'; return; }
    el.className = item ? 'tip itip' : 'tip';
    el.innerHTML = html; el.style.display = 'block';
    var w = el.offsetWidth, hh = el.offsetHeight, x, y;
    if (item) { x = at.x + at.w / 2 - w / 2; y = at.y - hh; if (y < 0) y = at.y + at.h; }
    else { x = at.x + 14; y = at.y + 14; }
    el.style.left = Math.round(Math.max(0, Math.min(960 - w, x))) + 'px';
    el.style.top = Math.round(Math.max(0, Math.min(540 - hh, y))) + 'px';
  };
  function hoverTip(el, htmlFn, item) {
    function show(e) { if (e.pointerType === 'touch') return; UI.tip(htmlFn(), item ? logicalRect(el) : D2.Input.logical(e), item); }
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointermove', show);
    el.addEventListener('pointerleave', function () { UI.tip(null); });
    el.__tipFn = htmlFn;
  }
  UI.hoverTip = hoverTip;

  UI.msgs = [];
  UI.msg = function (text, color) {
    UI.msgs.push({ text: String(text), color: color }); if (UI.msgs.length > 20) UI.msgs.shift();
    if (UI.open.log) UI.toggleLog(true);
    var e = h('div', 'toast', esc(text), UI.toasts); if (color) e.style.color = color;
    setTimeout(function () { e.classList.add('out'); }, 2600);
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 3300);
    while (UI.toasts.children.length > 5) UI.toasts.removeChild(UI.toasts.firstChild);
  };

  /* --------------------------------------------------------------- bảng */
  // Bảng trái: nhân vật, nhiệm vụ, kho, cửa hàng, waypoint. Bảng phải: túi đồ, cây kỹ năng (OD game_controls).
  // Mở một bảng chỉ đóng bảng cùng bên.
  UI.sideOpen = function (side) {
    if (side === 'right') return RIGHT.some(function (k) { return UI.open[k]; });
    return LEFT.some(function (k) { return UI.open[k]; }) || !!UI.shop || !!UI.open.wp;
  };
  function closeSide(side, keep) {
    (side === 'right' ? RIGHT : LEFT).forEach(function (k) { if (k !== keep) { UI.open[k] = false; UI.panels[k].style.display = 'none'; } });
    if (side === 'left') { if (keep !== 'shop' && UI.shop) UI.closeShop(); if (keep !== 'wp') UI.closeWaypoints(); }
  }
  UI.toggle = function (id) {
    if (id === 'map') { UI.open.map = !UI.open.map; UI.mapEl.style.display = UI.open.map ? 'block' : 'none'; return; }
    var willOpen = !UI.open[id];
    if (willOpen) closeSide(RIGHT.indexOf(id) >= 0 ? 'right' : 'left', id);
    UI.open[id] = willOpen; UI.panels[id].style.display = willOpen ? 'block' : 'none';
    UI.tip(null);
    if (willOpen) UI.renderPanel(id);
    D2.E.sfx(['cursor_button_click'], 0.4);
  };
  UI.closeAll = function () {
    closeSide('left'); closeSide('right');
    UI.open.map = false; UI.mapEl.style.display = 'none';
    UI.closeDialog(); UI.popup.style.display = 'none'; UI.popHover = undefined; UI.tip(null);
    UI.open.help = false; UI.helpEl.style.display = 'none';
    if (UI.goldEl) UI.goldEl.style.display = 'none';
    if (UI.beltOpen) UI.toggleBelt();
  };
  UI.anyOpen = function () { return UI.sideOpen('left') || UI.sideOpen('right') || UI.open.menu || UI.open.help || !!UI.dlg; };
  UI.renderOpen = function () { ['inv', 'char', 'skill', 'quest', 'stash'].forEach(function (k) { if (UI.open[k]) UI.renderPanel(k); }); if (UI.shop) UI.renderShop(); };
  UI.renderPanel = function (id) {
    if (id === 'inv') renderInv(); else if (id === 'char') renderChar(); else if (id === 'skill') renderSkill(); else if (id === 'quest') renderQuest(); else if (id === 'stash') renderStash();
  };
  UI.closePanelOf = function (p) {
    Object.keys(UI.panels).forEach(function (k) { if (UI.panels[k] === p) { UI.open[k] = false; p.style.display = 'none'; } });
    if (p === UI.shopEl) UI.closeShop();
    UI.tip(null);
  };

  /* -------------------------------------------------------- bảng nhân vật */
  function renderChar() {
    var p = UI.panels.char, s = S(), c = s.char, d = s.d || {};
    var q = pin(p, PN('character'), 80, 60);
    var nm = DA().className(c.cls);
    box(q, 'fld', 10, 8, 172, 18, T(c.name));
    box(q, 'fld', 192, 8, 118, 18, T(nm));
    box(q, 'fld two', 10, 31, 42, 35, '<small>Cấp</small>' + T(c.lvl));
    box(q, 'fld two', 63, 31, 120, 35, '<small>Kinh nghiệm</small>' + T(c.xp));
    box(q, 'fld two', 192, 31, 118, 35, '<small>Cấp tiếp theo</small>' + T(DA().xpFor(c.lvl + 1)));
    var groups = [
      { key: 'str', lab: 'Sức mạnh', y: 81, rows: [['Sát thương', Math.round(d.dmgMin || 0) + '-' + Math.round(d.dmgMax || 0)], ['Chính xác', Math.round(d.ar || 0)]] },
      { key: 'dex', lab: 'Nhanh nhẹn', y: 143, rows: [['Phòng thủ', Math.round(d.def || 0)], ['Tốc đánh', (d.atkFrames || 0) + ' khung'], ['Vàng', c.gold]] },
      { key: 'vit', lab: 'Sinh lực', y: 231, rows: [['Sinh lực', Math.ceil(c.hp) + '/' + (d.maxHp || 0)], ['Thể lực', Math.round(s.stamina || 0) + '/' + Math.round(s.stamMax || 0)]] },
      { key: 'ene', lab: 'Năng lượng', y: 293, rows: [['Mana', Math.ceil(c.mp) + '/' + (d.maxMp || 0)]] }
    ];
    var statupR = (((UA().panels || {}).buttons || {}).statup || [{}])[0].r;
    groups.forEach(function (g) {
      box(q, 'fld lv', 10, g.y, 38 + 70, 22, '<span>' + g.lab + '</span><b>' + T(c[g.key]) + '</b>');
      g.rows.forEach(function (r, i) { box(q, 'fld lv', 161, g.y + i * 23.5, 150, 22, '<span>' + r[0] + '</span><b>' + T(r[1]) + '</b>'); });
      if (c.statPts > 0) {
        var bt = box(q, 'plus', 125, g.y - 4, 30, 29, '+'); bt.style.cssText += ';' + D2.E.uiSprite(statupR, 1);
        bt.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().statUp(g.key); });
      }
    });
    box(q, 'fld lv', 3, 341, 135, 22, '<span>Chỉ số ' + T(c.statPts) + '</span><b>Kỹ năng ' + T(c.skillPts) + '</b>');
    var res = d.res || {};
    [['Kháng lửa', res.fire, '#f55', 'red'], ['Kháng lạnh', res.cold, '#6cf', 'blue'], ['Kháng sét', res.light, '#ff6', 'yellow'], ['Kháng độc', res.poison, '#7d7', 'green']].forEach(function (r, i) {
      box(q, 'fld lv', 174, 331 + i * 23, 137, 21, '<span style="color:' + r[2] + '">' + r[0] + '</span><b>' + T(r[1] || 0, 'font16', r[3]) + '</b>');
    });
    closeBtn(q, p, 128, 388);
  }

  /* ------------------------------------------------------------- túi đồ */
  function slotRect(name) {
    var f = PN('inventory')[SLOT_IDX[name]]; if (!f || !f.r) return null;
    return { x: f.x - (f.r[4] || 0) - 400, y: f.y - (f.r[5] || 0) - 60, w: f.r[2], h: f.r[3] };
  }
  /* Lưới đồ (túi 10x4, kho 6x8). Bấm: tay trống thì cầm món dưới con trỏ lên, đang cầm thì đặt món đó sao cho
   * tâm món ở con trỏ (đè đúng một món thì đổi chỗ). Chuột phải uống bình, Shift+trái đưa bình vào đai. */
  function itemGrid(q, where, list, gx, gy, cols, rows) {
    var grid = box(q, 'grid', gx, gy, cols * CELL, rows * CELL, '');
    grid.dataset.grid = where;
    var rect = h('div', 'gridbg', '', grid);
    rect.style.gridTemplateColumns = 'repeat(' + cols + ',' + CELL + 'px)'; rect.style.gridTemplateRows = 'repeat(' + rows + ',' + CELL + 'px)';
    for (var i = 0; i < cols * rows; i++) h('i', '', '', rect);
    list.forEach(function (it) {
      var e = itemEl(it, CELL); e.style.cssText += ';position:absolute;left:' + (it.ix * CELL) + 'px;top:' + (it.iy * CELL) + 'px';
      grid.appendChild(e);
      hoverTip(e, function () { return itemTipHtml(it, UI.shop && where === 'inv' ? ['Bán: ' + DA().sellPrice(it)] : null); }, true);
    });
    grid.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      var b = grid.getBoundingClientRect(), lx = (ev.clientX - b.left) / b.width * cols, ly = (ev.clientY - b.top) / b.height * rows;
      var c = S().char, hand = c.hand;
      if (hand) {
        var w = hand.w || 1, hh = hand.h || 1;
        G().putGrid(where, Math.max(0, Math.min(cols - w, Math.round(lx - w / 2))), Math.max(0, Math.min(rows - hh, Math.round(ly - hh / 2))));
      } else {
        var cx = Math.floor(lx), cy = Math.floor(ly);
        var it = list.filter(function (o) { return cx >= o.ix && cx < o.ix + (o.w || 1) && cy >= o.iy && cy < o.iy + (o.h || 1); })[0];
        if (!it) return;
        if (ev.button === 2) { if (where === 'inv' && DA().potionInfo(it)) G().useItem(it); }
        else if (ev.shiftKey && where === 'inv' && DA().potionInfo(it)) G().toBelt(it);
        else if (UI.shop && UI.shopMode === 'sell' && where === 'inv') G().sellItem(it);
        else G().pickUp(it);
      }
      UI.tip(null); UI.dirty = false; UI.renderOpen(); drawCursor();
    });
    return grid;
  }
  function renderInv() {
    var p = UI.panels.inv, s = S(), c = s.char;
    var q = pin(p, PN('inventory'), 400, 60), L = (UA().layout || {}).inventory || {}, gr = L.grid || [19, 255, 10, 4];
    Object.keys(SLOT_IDX).forEach(function (id) {
      var rc = slotRect(id); if (!rc) return;
      var cell = box(q, 'eslot', rc.x - 2, rc.y - 2, rc.w + 4, rc.h + 4, ''); cell.title = SLOT_NAME[id]; cell.dataset.slot = id;
      var it = c.equip[id];
      if (it) {
        var e = itemFit(it, rc.w, rc.h); e.style.cssText += ';position:absolute;left:2px;top:2px';
        cell.appendChild(e);
        hoverTip(cell, function () { return itemTipHtml(it); }, true);
      }
      cell.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation(); if (ev.button === 2) return;
        if (S().char.hand) G().putEquip(id); else if (c.equip[id]) G().pickUp(c.equip[id]);
        UI.tip(null); UI.dirty = false; UI.renderOpen(); drawCursor();
      });
    });
    itemGrid(q, 'inv', c.inv, gr[0], gr[1], gr[2], gr[3]);
    var gp = L.gold || [84, 391];
    box(q, 'gold', gp[0] + 4, gp[1] + 1, 112, 18, 'Vàng: ' + T(c.gold));
    // nút đồng vàng (goldcoinbtn) cạnh ô vàng: mở hộp thả vàng
    var GB = (((UA().panels || {}).buttons) || {}).gold || [], gb = box(q, 'hbtn goldbtn', gp[0] - 22, gp[1] + 1, 20, 18, '');
    gb.title = 'Thả vàng';
    pressBtn(gb, function (dn) { var f = GB[dn ? 1 : 0]; return f && f.r; }, function () { if (S().char.gold > 0) UI.goldDialog(); });
    // tab I/II trên hai ô vũ khí (đã vẽ sẵn trong tranh túi đồ): bấm hoặc phím W đổi bộ; tab đang tắt phủ tối
    ['rhand', 'lhand'].forEach(function (sl) {
      var rc = slotRect(sl); if (!rc) return;
      [0, 1].forEach(function (k) {
        var t = box(q, 'wtab' + ((c.weaponSet || 0) === k ? ' on' : ''), rc.x - 2 + k * (rc.w / 2 + 2), rc.y - 25, rc.w / 2 + 2, 21, '');
        t.title = 'Bộ vũ khí ' + (k ? 'II' : 'I') + ' (W)'; t.dataset.set = k;
        t.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); if ((S().char.weaponSet || 0) !== k) { G().swapWeapons(); renderInv(); } });
      });
    });
    closeBtn(q, p, (L.close || [18, 384])[0], (L.close || [18, 384])[1]);
  }

  // Hộp thả vàng như D2: tranh dialogbackground (dải nhập số + hai hốc), goldbtn ✓ / ✗ trong hai hốc.
  UI.goldDialog = function () {
    var X = ((UA().panels || {}).extra) || {}, el = UI.goldEl;
    if (!el) { el = UI.goldEl = h('div', 'golddlg', '', UI.root); el.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); }); }
    el.innerHTML = ''; el.style.cssText = 'display:block;' + D2.E.uiSprite(X.goldDialog, 1);
    box(el, 'fhead', 0, 14, 210, 40, T('Thả bao nhiêu vàng?', 'font16'));
    var inp = h('input', 'gamt', '', el); inp.type = 'number'; inp.min = 0; inp.max = S().char.gold; inp.value = S().char.gold;
    function close() { el.style.display = 'none'; }
    function btn(k, x, fn) {
      var e = box(el, 'hbtn', x, 124, 15, 14, ''); e.title = k ? 'Huỷ' : 'Thả';
      pressBtn(e, function (dn) { var r = (X.goldBtn || [])[k * 2 + (dn ? 1 : 0)]; return r; }, fn);
    }
    btn(0, 43, function () { G().dropGold(+inp.value); close(); });
    btn(1, 151, close);
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { G().dropGold(+inp.value); close(); } else if (ev.key === 'Escape') close(); });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  };

  /* ------------------------------------------------------- kho đồ (6x8) và waypoint */
  UI.openStash = function () {
    if (!UI.open.stash) UI.toggle('stash');
    if (!UI.open.inv) UI.toggle('inv');
  };
  function renderStash() {
    // tranh kho lớn của D2R là 10x10; chỉ 6x8 đầu dùng được, phần còn lại phủ tối
    var p = UI.panels.stash, c = S().char, CW = D2.Game.stashCols, RW = D2.Game.stashRows;
    var q = pin(p, PN('stash_big'), 80, 60), gx = 16, gy = 63;
    box(q, 'gold', 18, 358, 180, 18, 'Vàng: ' + T(c.gold));
    for (var gyi = 0; gyi < 10; gyi++) for (var gxi = 0; gxi < 10; gxi++) {
      if (gxi >= CW || gyi >= RW) box(q, 'lockcell', gx + gxi * CELL, gy + gyi * CELL, CELL, CELL, '');
    }
    c.stash = c.stash || [];
    itemGrid(q, 'stash', c.stash, gx, gy, CW, RW);
    closeBtn(q, p, 275, 383);
  }

  // Tab act I-V của bảng waypoint / nhiệm vụ: expwaygatetabs + expquesttabs của LoD (63x31, act k: 2k sáng, 2k+1 tối),
  // không có trong atlas UI nên nằm ở ảnh riêng (_tools/build_exptabs.py).
  var EXPTABS = 'assets/img/g/exptabs.webp';
  function actTabs(q, row, act, mx, onPick) {
    for (var a = 1; a <= 5; a++) (function (a) {
      var t = box(q, 'acttab' + (a === act ? ' on' : '') + (a > mx ? ' off' : ''), 2 + (a - 1) * 63, 2, 63, 31, '');
      t.style.backgroundImage = 'url(' + EXPTABS + (D2.E.ver ? '?v=' + D2.E.ver : '') + ')';
      t.style.backgroundPosition = '-' + ((2 * (a - 1) + (a === act ? 0 : 1)) * 63) + 'px -' + (row * 31) + 'px';
      t.title = 'Act ' + a; t.dataset.act = a;
      if (a <= mx) t.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); onPick(a); });
    })(a);
  }
  function maxAct() { var c = S().char; return 1 + Object.keys(c.actAccess || {}).filter(function (k) { return /^\d$/.test(k); }).length; }
  function curAct() { return (S().def && S().def.act) || 1; }

  /* Waypoint: mọi waypoint của act đang xem; cái chưa chạm thì xám, không bấm được (như D2). */
  UI.openWaypoints = function (act) {
    var m = UI.wpEl, c = S().char, w = c.waypoints || {}, here = S().areaId, A = D2DATA.areas, mx = maxAct();
    if (!UI.open.wp) { closeSide('left', 'wp'); act = act || curAct(); }
    act = Math.min(act || UI.wpAct || curAct(), mx);
    UI.wpAct = act;
    UI.open.wp = true; m.style.display = 'block';
    var q = pin(m, PN('waypoint'), 80, 60);
    actTabs(q, 0, act, mx, function (a) { UI.openWaypoints(a); });
    var ICO = (((UA().panels || {}).buttons || {}).waygate_icons) || [];
    var lst = box(q, 'wplist', 22, 59, 284, 330, '');
    Object.keys(A).filter(function (k) { return A[k].waypoint && !A[k].unused && A[k].act === act; })
      .sort(function (a, b) { return A[a].d2id - A[b].d2id; })
      .forEach(function (k) {
        var on = !!(A[k].town || w[k]), b = h('button', 'wpb' + (k === here ? ' here' : '') + (on ? '' : ' off'), T(A[k].name, 'font16', k === here ? 'gold' : on ? 'white' : 'grey'), lst);
        b.dataset.area = k;
        var fi = h('i', 'wpico', '', b), fr = ICO[k === here ? 2 : on ? 0 : 3];
        if (fr) fi.style.cssText = D2.E.uiSprite(fr.r, 1);
        if (!on) { b.disabled = true; return; }
        b.addEventListener('pointerenter', function () { var f1 = ICO[k === here ? 2 : 1]; if (f1) fi.style.cssText = D2.E.uiSprite(f1.r, 1); });
        b.addEventListener('pointerleave', function () { if (fr) fi.style.cssText = D2.E.uiSprite(fr.r, 1); });
        b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); G().travelWaypoint(k); });
      });
    var x = h('button', 'wpb xb', 'Đóng', q); x.style.cssText = 'position:absolute;left:278px;top:390px;width:36px;height:36px;padding:0';
    x.innerHTML = '&#10005;'; x.title = 'Đóng';
    x.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.closeWaypoints(); });
  };
  UI.closeWaypoints = function () { UI.open.wp = false; if (UI.wpEl) UI.wpEl.style.display = 'none'; };

  /* ------------------------------------------------------- cây kỹ năng */
  function skillState(sk) {
    var s = S(), c = s.char, lv = c.skills[sk.id] || 0;
    var cl = D2R.canLearn(c, sk.id);
    return { lv: lv, can: !!cl.ok, why: cl.why };
  }
  // Ô kỹ năng: tâm cột/hàng đo trên tranh cây kỹ năng D2 (toạ độ trong bảng, gốc phải 400,60).
  var SK_X0 = 38, SK_DX = 71, SK_Y0 = 40, SK_DY = 69;
  var SK_TABS = [[232, 112, 86, 98], [232, 218, 86, 104], [232, 328, 86, 100]];
  function renderSkill() {
    var p = UI.panels.skill, s = S(), c = s.char;
    var cd = D2DATA.classes && D2DATA.classes[c.cls], code = String((cd && cd.code) || '').toLowerCase();
    // nền chung của lớp, rồi phần riêng của trang đang chọn đè lên
    var q = pin(p, PN('skilltree_' + code).concat(PN('skilltree_' + code + '_p' + (UI.skTab + 1))), 400, 60);
    var tabs = DA().tabNames(c.cls), tb = h('div', 'tabs', '', q);
    tabs.forEach(function (n, i) {
      var r = SK_TABS[i] || SK_TABS[0];
      var b = h('button', i === UI.skTab ? 'on' : '', esc(n), tb);
      b.style.cssText = 'left:' + r[0] + 'px;top:' + r[1] + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px';
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skTab = i; renderSkill(); });
    });
    box(q, 'skpts', 232, 6, 86, 96, '<small>Điểm kỹ năng</small><b>' + T(c.skillPts, 'font30') + '</b>');
    var tree = h('div', 'tree', '', q);
    var list = DA().skillsOf(c.cls).filter(function (k) { return k.tab === UI.skTab; });
    // bấm một lần vào kỹ năng học được là cộng một điểm, như D2; gán kỹ năng qua nút kỹ năng trên HUD (hoặc S)
    list.forEach(function (k) {
      var st = skillState(k), e = h('div', 'sknode' + (st.lv > 0 ? ' on' : '') + (st.can ? ' can' : ''), '', tree);
      e.style.left = (SK_X0 + k.col * SK_DX - 24) + 'px'; e.style.top = (SK_Y0 + k.row * SK_DY - 24) + 'px';
      e.dataset.skill = k.id;
      e.innerHTML = skIconHtml(k.id, 44) + '<b>' + T(st.lv) + '</b>';
      hoverTip(e, function () { return skillTip(k); });
      e.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        if (st.can) { G().skillUp(k.id); renderSkill(); UI.tip(skillTip(k), D2.Input.logical(ev)); }
      });
    });
    closeBtn(q, p, 172, 383);
  }
  function skillTip(k) {
    var s = S(), st = skillState(k), c = s.char, fx = null;
    try { fx = D2R.skillEffect(k.id, Math.max(1, st.lv), c); } catch (e) {}
    var txt = '<b>' + esc(k.name) + '</b> (cấp ' + st.lv + ')<br>Yêu cầu cấp ' + k.req;
    if (k.prereq.length) txt += '<br>Cần: ' + k.prereq.map(function (q) { var d = DA().skill(q); return esc(d ? d.name : q); }).join(', ');
    if (fx && fx.mana) txt += '<br>Mana: ' + Math.round(fx.mana);
    if (fx && fx.dmg && fx.dmg.max) txt += '<br>Sát thương: ' + Math.round(fx.dmg.min) + '-' + Math.round(fx.dmg.max) + (fx.dmg.elem ? ' (' + fx.dmg.elem + ')' : '');
    if (k.desc) txt += '<br><i>' + esc(k.desc) + '</i>';
    return txt;
  }

  /* ------------------------------------------------------------ nhật ký */
  // Nhật ký nhiệm vụ như D2: tab act, 6 ô nhiệm vụ (a<act>q<n>.dc6 trên questsockets), bấm ô để đọc.
  // Khung icon theo OpenDiablo2 quest_log: 24 xong, 25 đang làm, 26 chưa nhận.
  function questsOf(act) {
    var Q = D2DATA.quests;
    return Object.keys(Q).map(function (k) { var m = /a(\d)q(\d)/.exec(Q[k].strKey || ''); return m && +m[1] === act ? { q: Q[k], n: +m[2] } : null; })
      .filter(Boolean).sort(function (a, b) { return a.n - b.n; });
  }
  function npcName(id) { var n = id && D2DATA.npcs[id]; return n ? n.name : (id || ''); }
  function goalText(q) {
    var g = q.goal || {}, A = D2DATA.areas, an = g.area && A[g.area] ? A[g.area].name : '';
    function mon(id) { var su = D2DATA.superuniques && D2DATA.superuniques[id], m = D2DATA.monsters && D2DATA.monsters[id]; return (su && su.name) || (m && m.name) || id; }
    if (g.type === 'clear_area') return 'Dọn sạch quái ở ' + an + '.';
    if (g.type === 'reach') return 'Tìm đường tới ' + an + '.';
    if (g.type === 'kill') return 'Tiêu diệt ' + (g.superuniques ? g.superuniques.map(mon).join(', ') : mon(g.superunique || g.monster)) + '.';
    if (g.type === 'collect') return 'Tìm ' + (g.items || []).join(', ') + '.';
    if (g.type === 'destroy') return 'Phá huỷ ' + g.object + '.';
    if (g.type === 'rescue') return g.npc ? 'Giải cứu ' + npcName(g.npc) + (an ? ' ở ' + an : '') + '.' : 'Giải cứu ' + (g.count || '') + ' người lính.';
    return '';
  }
  function renderQuest() {
    var p = UI.panels.quest, s = S(), c = s.char, mx = maxAct();
    var act = Math.min(UI.qAct || curAct(), mx);
    var q0 = pin(p, PN('quest'), 80, 60), B = ((UA().panels || {}).buttons) || {}, SOCK = B.quest_sockets || [];
    actTabs(q0, 1, act, mx, function (a) { UI.qAct = a; UI.qSel = null; renderQuest(); });
    var list = questsOf(act);
    if (!list.some(function (x) { return x.q.id === UI.qSel; })) {
      var open = list.filter(function (x) { var st = c.quests[x.q.id]; return st && st !== 'done'; })[0] || list[0];
      UI.qSel = open ? open.q.id : null;
    }
    list.forEach(function (x, i) {
      var st = c.quests[x.q.id], fr = st === 'done' ? 24 : st ? 25 : 26, sel = UI.qSel === x.q.id;
      var col = i % 3, row = (i / 3) | 0, sx = 22 + col * 95, sy = 44 + row * 100;
      var cell = box(q0, 'qcell' + (sel ? ' sel' : ''), sx, sy, 78, 94, ''); cell.dataset.quest = x.q.id;
      var sk = SOCK[sel ? 1 : 0]; if (sk) h('div', 'sp', '', cell).style.cssText = 'left:0;top:0;' + D2.E.uiSprite(sk.r, 1);
      var ic = (B['quest_a' + act + 'q' + x.n] || [])[fr]; if (ic) h('div', 'sp', '', cell).style.cssText = 'left:3px;top:4px;' + D2.E.uiSprite(ic.r, 1);
      cell.title = x.q.name;
      cell.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.qSel = x.q.id; renderQuest(); });
    });
    var cur = list.filter(function (x) { return x.q.id === UI.qSel; })[0];
    var txt = box(q0, 'qdesc', 14, 252, 292, 130, '');
    if (cur) {
      var q = cur.q, st = c.quests[q.id], back = npcName(q.turnIn || q.giver), body;
      if (!st) body = 'Chưa nhận. ' + (q.giver ? 'Hãy nói chuyện với ' + npcName(q.giver) + '.' : '');
      else if (st === 'active') body = goalText(q) + (q.goal && q.goal.type === 'clear_area' && s.areaId === q.goal.area && s.denLeft != null ? ' Còn <b>' + s.denLeft + '</b> con.' : '');
      else if (st === 'cleared') body = 'Đã xong mục tiêu.' + (q.turnIn ? ' Quay về gặp ' + back + ' để nhận thưởng.' : '');
      else body = 'Hoàn thành.';
      txt.innerHTML = '<b>' + T(q.name, 'font16', 'gold') + '</b><br>' + body;
    }
    closeBtn(q0, p, 278, 390);
  }

  /* ---------------------------------------------------- NPC & cửa hàng */
  // Khung hộp từ boxpieces.dc6 (12x12): 0 trên-trái, 1 trên-phải, 2-7 cạnh trên, 8 dưới-trái, 9 dưới-phải,
  // 10-12 cạnh trái, 13-15 cạnh phải, 16-21 cạnh dưới. Hộp được nới tới bội của 12 để các mảnh khít.
  function boxFrame(el) {
    var P = PN('dialog'); if (P.length < 22) return;
    var W = Math.ceil(el.offsetWidth / 12) * 12, H = Math.ceil(el.offsetHeight / 12) * 12, k, x, y;
    el.style.width = W + 'px'; el.style.height = H + 'px';
    var fr = h('div', 'bframe', '', el);
    function put(i, px, py) { h('div', 'sp', '', fr).style.cssText = spStyle(P[i].r, px, py); }
    put(0, 0, 0); put(1, W - 12, 0); put(8, 0, H - 12); put(9, W - 12, H - 12);
    for (k = 0, x = 12; x < W - 12; x += 12, k++) { put(2 + k % 6, x, 0); put(16 + k % 6, x, H - 12); }
    for (k = 0, y = 12; y < H - 12; y += 12, k++) { put(10 + k % 3, 0, y); put(13 + k % 3, W - 12, y); }
  }
  // Hộp thoại NPC như D2: hộp boxpieces, tên NPC, lời chào, các lựa chọn chữ trắng căn giữa, cuối cùng là Đóng.
  UI.openDialog = function (npc, def) {
    UI.dlg = npc; var el = UI.dlgEl; el.style.cssText = 'display:block'; el.innerHTML = '';
    h('div', 'dname', T(def.name, 'font16', 'gold'), el);
    h('div', 'dtext', def.text, el);
    var bar = h('div', 'dbtns', '', el);
    def.buttons.forEach(function (b) {
      var e = h('button', 'dopt', T(b.label), bar);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); b.fn(); });
    });
    var x = h('button', 'dopt dclose', T('Đóng'), bar); x.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.closeDialog(); });
    boxFrame(el);
  };
  UI.closeDialog = function () { UI.dlg = null; UI.dlgEl.style.display = 'none'; UI.closeShop(); };
  UI.openShop = function (stock) {
    closeSide('left', 'shop');
    UI.shop = stock; UI.shopMode = 'buy'; UI.shopTab = null; UI.shopEl.style.display = 'block'; UI.dlgEl.style.display = 'none';
    if (!UI.open.inv) UI.toggle('inv');
    UI.renderShop();
  };
  UI.closeShop = function () { UI.shop = null; UI.shopEl.style.display = 'none'; UI.tip(null); };
  // Mua: bấm vào hàng của NPC. Bán: cầm đồ trong túi lên rồi thả vào bảng cửa hàng, hoặc bật nút Bán rồi bấm món trong
  // túi (như D2). Tab buyselltabs chia hàng theo loại (khung k sáng, 4+k tối); giá nằm trong chú thích.
  var SHOP_TABS = [['weapon', 'Vũ khí'], ['armor', 'Giáp'], ['misc', 'Khác']];
  function shopKind(it) { var b = DA().base(it), k = b && b.kind; return k === 'weapon' || k === 'armor' ? k : 'misc'; }
  UI.renderShop = function () {
    var p = UI.shopEl, c = S().char, B = ((UA().panels || {}).buttons) || {}, TL = (UA().layout || {}).npc_trade || {};
    var q = pin(p, PN('npc_trade'), 80, 60);
    q.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); if (S().char.hand) { G().sellHand(); UI.renderOpen(); drawCursor(); } });
    var tabs = SHOP_TABS.filter(function (t) { return UI.shop.some(function (it) { return shopKind(it) === t[0]; }); });
    if (!tabs.some(function (t) { return t[0] === UI.shopTab; })) UI.shopTab = tabs.length ? tabs[0][0] : null;
    tabs.forEach(function (t, i) {
      var on = t[0] === UI.shopTab, fr = (B.tabs_trade || [])[on ? i : 4 + i];
      var e = box(q, 'stab' + (on ? ' on' : ''), 2 + i * 79, 1, 79, 31, T(t[1], 'font16', on ? 'white' : 'grey'));
      if (fr) e.style.cssText += ';' + D2.E.uiSprite(fr.r, 1);
      e.dataset.tab = t[0];
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.shopTab = t[0]; UI.renderShop(); });
    });
    box(q, 'fld', 16, 359, 186, 18, 'Vàng: ' + T(c.gold));
    // nút Mua / Bán (buysellbtn khung 2-3, 4-5): chọn chế độ, nút đang bật vẽ khung nhấn
    [['buy', 2, 'Mua'], ['sell', 4, 'Bán']].forEach(function (m) {
      var pos = TL[m[0]] || [116, 385], on = (UI.shopMode || 'buy') === m[0], fr = (B.buysell || [])[m[1] + (on ? 1 : 0)];
      var e = box(q, 'sbtn', pos[0], pos[1], 32, 32, ''); e.title = m[2]; e.dataset.mode = m[0];
      if (fr) e.style.cssText += ';' + D2.E.uiSprite(fr.r, 1);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.shopMode = m[0]; UI.renderShop(); });
    });
    var grid = box(q, 'grid', 16, 63, 10 * CELL, 10 * CELL, ''), occ = [];
    function fits(x, y, w, hh) {
      if (x + w > 10 || y + hh > 10) return false;
      for (var j = 0; j < hh; j++) for (var i = 0; i < w; i++) if (occ[(y + j) * 10 + x + i]) return false;
      return true;
    }
    UI.shop.forEach(function (it) {
      if (UI.shopTab && shopKind(it) !== UI.shopTab) return;
      var w = it.w || 1, hh = it.h || 1, px = -1, py = -1, x, y;
      for (y = 0; y < 10 && py < 0; y++) for (x = 0; x < 10; x++) if (fits(x, y, w, hh)) { px = x; py = y; break; }
      if (py < 0) return;
      for (var j = 0; j < hh; j++) for (var i = 0; i < w; i++) occ[(py + j) * 10 + px + i] = 1;
      var row = h('div', 'shoprow', '', grid);
      row.style.cssText = 'left:' + (px * CELL) + 'px;top:' + (py * CELL) + 'px;width:' + (w * CELL) + 'px;height:' + (hh * CELL) + 'px';
      var ie = itemEl(it, CELL); ie.style.cssText += ';position:absolute;left:0;top:0'; row.appendChild(ie);
      var price = DA().buyPrice(it);
      row.dataset.price = price;
      row.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        if (S().char.hand) G().sellHand(); else G().buyItem(it);
        UI.tip(null); UI.renderOpen(); drawCursor();
      });
      hoverTip(row, function () { return itemTipHtml(it, ['Giá: ' + price]); }, true);
    });
    var cl = (B.buysell || [])[10], cp = TL.close || [272, 385], x = box(q, 'sbtn', cp[0], cp[1], 32, 32, ''); x.title = 'Đóng';
    if (cl) x.style.cssText += ';' + D2.E.uiSprite(cl.r, 1);
    x.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.closePanelOf(p); });
  };

  /* -------------------------------------------------------- popup kỹ năng */
  // Bảng chọn kỹ năng: bấm để gán vào tay; rê lên một kỹ năng rồi bấm F1-F8 để gán phím (như D2).
  UI.skillPopup = function (which) {
    var pop = UI.popup;
    if (pop.style.display === 'block' && pop.dataset.w === which) { pop.style.display = 'none'; UI.popHover = undefined; return; }
    pop.dataset.w = which; pop.style.display = 'block';
    pop.style[which === 'left' ? 'left' : 'right'] = '150px'; pop.style[which === 'left' ? 'right' : 'left'] = 'auto';
    UI.renderPopup();
  };
  UI.renderPopup = function () {
    var s = S(), c = s.char, pop = UI.popup, which = pop.dataset.w;
    if (pop.style.display !== 'block') return;
    pop.innerHTML = '';
    var ids = [null].concat(DA().skillsOf(c.cls).filter(function (k) { return (c.skills[k.id] || 0) > 0 && !k.passive; }).map(function (k) { return k.id; }));
    ids.forEach(function (id) {
      var fk = id ? s.fkeys.indexOf(id) : -1;
      var e = h('div', 'pk', skIconHtml(id, 40) + (fk >= 0 ? '<i class="fk">F' + (fk + 1) + '</i>' : '') + '<small>' + esc(id ? DA().skill(id).name : 'Đánh thường') + '</small>', pop);
      e.addEventListener('pointerenter', function () { UI.popHover = id; });
      e.addEventListener('pointerleave', function () { if (UI.popHover === id) UI.popHover = undefined; });
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); G().assignSkill(which, id); pop.style.display = 'none'; UI.popHover = undefined; });
    });
  };

  /* ------------------------------------------------- tin nhắn, trợ giúp */
  UI.toggleLog = function (keep) {
    UI.open.log = keep === true || !UI.open.log;
    UI.logEl.style.display = UI.open.log ? 'block' : 'none';
    UI.logEl.innerHTML = UI.msgs.map(function (m) { return '<div' + (m.color ? ' style="color:' + m.color + '"' : '') + '>' + esc(m.text) + '</div>'; }).join('');
  };
  UI.toggleHelp = function () {
    UI.open.help = !UI.open.help; UI.helpEl.style.display = UI.open.help ? 'block' : 'none';
    if (!UI.open.help) return;
    UI.helpEl.innerHTML = '<h3>Trợ giúp</h3><dl>' + [
      ['Chuột trái', 'Đi, đánh, nhặt đồ, nói chuyện. Giữ để lặp'], ['Chuột phải', 'Dùng kỹ năng tay phải. Giữ để lặp'],
      ['Shift + trái', 'Đánh tại chỗ'], ['Alt', 'Hiện tên đồ dưới đất'], ['C / A', 'Nhân vật'], ['I / B', 'Túi đồ'],
      ['T', 'Cây kỹ năng'], ['S', 'Chọn kỹ năng tay phải'], ['Q', 'Nhiệm vụ'], ['Tab', 'Bản đồ'], ['R', 'Chạy / đi bộ'],
      ['1-4', 'Uống bình trong đai'], ['~', 'Mở đai'], ['F1-F8', 'Kỹ năng đã gán (rê lên kỹ năng trong bảng chọn rồi bấm để gán)'],
      ['Lăn chuột', 'Đổi kỹ năng đã gán phím F'], ['Space', 'Đóng mọi bảng'], ['H', 'Trợ giúp'], ['Esc', 'Menu']
    ].map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>';
  };

  /* ---------------------------------------------------------- menu Esc */
  // Như D2: phủ tối cả màn, các mục chữ Font42 căn giữa, ngôi sao pentspin quay hai bên mục đang trỏ.
  UI.toggleMenu = function () {
    if (UI.open.menu) { UI.open.menu = false; UI.menuEl.style.display = 'none'; clearInterval(UI._pentT); return; }
    if (UI.anyOpen() && !UI.open.menu) { UI.closeAll(); return; }
    UI.open.menu = true; UI.menuEl.style.display = 'block';
    menuPage([
      ['Tuỳ chọn', function () {
        menuPage([
          [D2.E.muted ? 'Âm thanh: tắt' : 'Âm thanh: bật', function () { D2.E.muted = !D2.E.muted; D2.E.music(null); if (!D2.E.muted) G().playAreaMusic(); UI.open.menu = false; UI.toggleMenu(); }],
          ['Trở về', function () { UI.open.menu = false; UI.toggleMenu(); }]
        ]);
      }],
      ['Lưu và thoát', function () { G().save(); UI.toggleMenu(); G().toTitle(); }],
      ['Trở lại trò chơi', function () { UI.toggleMenu(); }]
    ]);
  };
  function menuPage(items) {
    var m = UI.menuEl, H = 50, y0 = Math.round(270 - items.length * H / 2), sel = 0, pf = 0;
    var P = (UA().cursor || {}).pentspin || [];
    m.innerHTML = '';
    var pl = h('div', 'pent', '', m), pr = h('div', 'pent', '', m), els = [];
    function place() {
      var e = els[sel], r = P[pf % P.length]; if (!e || !r) return;
      // tâm ngôi sao lệch (+25, -26) so với điểm neo của khung pentspin
      var cy = y0 + sel * H + H / 2, w = e.firstChild.offsetWidth;
      pl.style.cssText = spStyle(r, 480 - w / 2 - 40 - 25, cy + 26);
      pr.style.cssText = spStyle(r, 480 + w / 2 + 40 - 25, cy + 26);
    }
    items.forEach(function (it, i) {
      var e = box(m, 'mitem', 0, y0 + i * H, 960, H, T(it[0], 'font42'));
      e.addEventListener('pointerenter', function () { sel = i; place(); });
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); D2.E.sfx(['cursor_button_click'], 0.4); it[1](); });
      els.push(e);
    });
    clearInterval(UI._pentT);
    UI._pentT = setInterval(function () { if (!UI.open.menu) return clearInterval(UI._pentT); pf++; place(); }, 50);
    place();
  }

  /* ---------------------------------------------------------- bản đồ */
  // Như D2: mỗi tile đã thấy vẽ một cel nét mảnh của maximap.dc6 (nhóm m/automap, _tools/build_automap.py) ở đỉnh
  // trên của hình thoi tile, tile 160x80 thành 16x8 (D2 chia toạ độ cho 10). s.grid là D2G.World: mỗi khu có
  // seenT/seenQ riêng (markSeen trong game.js) và vẽ theo lệch (ox, oy) của khu nên bản đồ liền qua mép khu.
  // Cel của khu vẽ dần vào một canvas riêng của khu khi tile mới vào hàng đợi; mỗi lần mở chỉ dán canvas đó.
  // Không vẽ quái. Thị trấn Act II/IV/V D2 vẽ bằng tranh nguyên khối (Act2Map...) nên còn vẽ điểm ảnh của tường.
  var AMK = 1.6;
  function AMG() { var g = window.D2_GROUPS && D2_GROUPS.automap; return g && g.automap; }
  UI.mapStats = { cels: 0, units: 0, pixelLevels: 0 };
  UI.drawMap = function () {
    var s = S(), W = s.grid, cv = UI.mapEl, c = cv.getContext('2d'), E = D2.E, AM = AMG();
    c.clearRect(0, 0, 960, 540); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, 0, 960, 540);
    if (!AM && E.index && E.index.automap && !UI._amLoad) UI._amLoad = E.loadGroup(E.index.automap);
    if (!W || !W.list || !s.hero) return;
    var hx = s.hero.x, hy = s.hero.y, st = UI.mapStats;
    st.cels = 0; st.units = 0; st.pixelLevels = 0;
    function P(x, y) { return [480 + ((x - hx) - (y - hy)) * AMK, 270 + ((x - hx) + (y - hy)) * AMK * 0.5]; }
    function seenAt(x, y) { var L = W.levelAt(x, y); return !!(L && L.seen && L.seen[((y | 0) - L.oy) * L.lv.w + ((x | 0) - L.ox)]); }
    function sheet(act) {
      var A = AM && AM.acts[act]; if (!A) return null;
      var imgs = A.pages.map(function (p) { return E.img(p); });
      return imgs.every(function (r) { return r.ok; }) ? { A: A, imgs: imgs } : null;
    }
    function put(ctx, sh, r, x, y) { if (r && r.length) ctx.drawImage(sh.imgs[r[6]].img, r[0], r[1], r[2], r[3], Math.round(x - r[4]), Math.round(y - r[5]), r[2], r[3]); }
    c.imageSmoothingEnabled = false;
    W.list.forEach(function (L) {
      var g = L.lv, def = L.def || {}, tab = AM && AM.lt[def.levelTypeId], sh = tab && sheet(def.act || W.act);
      if (!L.seen) return;
      if (tab && sh) drawCels(L, g, tab, sh);
      else if (!tab) drawPixels(L, g);
    });
    function drawCels(L, g, tab, sh) {
      var tw = g.tw, th = g.th, m = L._am;
      if (!m) {
        m = L._am = { cv: document.createElement('canvas'), n: 0, q: 0 };
        m.cv.width = (tw + th) * 8; m.cv.height = (tw + th) * 4 + 32; m.ctx = m.cv.getContext('2d');
      }
      var Q = L.seenQ || [], li, cels;
      for (; m.q < Q.length; m.q++) {
        var i = Q[m.q], tx = i % tw, ty = (i - tx) / tw, x = (tx - ty) * 8 + th * 8, y = (tx + ty) * 4 + 24;
        // D2 bốc ngẫu nhiên một trong Cel1..Cel4; ở đây băm theo toạ độ thế giới để mở lại vẫn y nguyên
        var hsh = ((tx + L.tx) * 73856093 ^ (ty + L.ty) * 19349663) >>> 0;
        for (li = 0; li < g.floors.length; li++) {
          var f = g.floors[li][i];
          if (f && (cels = tab['0_' + ((f >> 8) & 255) + '_' + (f & 255)])) { put(m.ctx, sh, sh.A.cels[cels[(hsh + li) % cels.length]], x, y); m.n++; }
        }
        for (li = 0; li < g.walls.length; li++) {
          var t = g.walls[li].t[i];
          if (t && (cels = tab[g.walls[li].o[i] + '_' + ((t >> 8) & 255) + '_' + (t & 255)])) { put(m.ctx, sh, sh.A.cels[cels[(hsh + li + 7) % cels.length]], x, y); m.n++; }
        }
      }
      var o = P(L.ox, L.oy);
      c.drawImage(m.cv, Math.round(o[0] - th * 8), Math.round(o[1] - 24));
      st.cels += m.n;
      // vật có ô AutoMap trong objects.txt (đền, giếng, rương nhiệm vụ, ấn Diablo...)
      g.objects.forEach(function (ob) {
        var pr = E.objPresets['act' + (ob.act || L.def.act || W.act) + ':' + ob.id], cel = pr && AM.obj[pr.cls];
        if (!cel || !seenAt(ob.x, ob.y)) return;
        var p = P(ob.x + 0.5, ob.y + 0.5); put(c, sh, sh.A.cels[cel], p[0], p[1] - 4); st.cels++;
      });
    }
    function drawPixels(L, g) {
      // lưới 200x200: ô mới thấy ghi vào một ảnh 1 px/ô, vẽ bằng một phép biến đổi iso; chỉ tường như nét của D2
      var seen = L.seen, mc = L._mapCv;
      if (!mc) {
        mc = L._mapCv = document.createElement('canvas'); mc.width = g.w; mc.height = g.h;
        L._mapCtx = mc.getContext('2d'); L._mapDone = new Uint8Array(g.w * g.h);
      }
      var mx = L._mapCtx, done = L._mapDone, n = g.w * g.h, i;
      mx.fillStyle = 'rgba(200,200,200,.8)';
      for (i = 0; i < n; i++) {
        if (!seen[i] || done[i]) continue;
        done[i] = 1;
        if (g.col[i] === 1) mx.fillRect(i % g.w, (i / g.w) | 0, 1, 1);
      }
      var ox = L.ox - hx, oy = L.oy - hy;
      c.save(); c.setTransform(AMK, AMK * 0.5, -AMK, AMK * 0.5, 480 + AMK * (ox - oy), 270 + AMK * 0.5 * (ox + oy));
      c.drawImage(mc, 0, 0); c.restore();
      st.pixelLevels++;
    }
    var hs = sheet((s.def && s.def.act) || W.act);
    if (hs) {
      // NPC trong thị trấn: dấu chữ thập của units.dc6 như người chơi, màu khác [ĐOÁN]
      if (s.def && s.def.town) s.ents.forEach(function (e) {
        if (e.kind !== 'npc' || !seenAt(e.x, e.y)) return;
        var p = P(e.x, e.y); put(c, hs, hs.A.units[1], p[0], p[1]); st.units++;
      });
      put(c, hs, hs.A.units[6], 480, 270); st.units++;
    } else {
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(474, 270); c.lineTo(486, 270); c.moveTo(480, 264); c.lineTo(480, 276); c.stroke();
    }
    if (s.areaName) E.text(s.areaName, 'font16', 944, 12, 'gold', 'right', c);
  };

  /* ------------------------------------------------------ màn hình đầu */
  // Tranh D2 800x600 (nhóm m/front, _tools/build_ui.py build_front) vẽ lên một canvas .fcv trong .screen, co 0.9 cho vừa
  // chiều cao và căn giữa. Nút, ô tên, vùng bấm lớp là DOM trong .fpin, cũng theo toạ độ 800x600 rồi co cùng hệ số.
  var FK = 0.9, FX = (960 - 800 * FK) / 2, FPS = 25;
  var F = UI.front = { mode: null, under: null, t0: 0, cls: {}, hover: null, picked: null };
  function FG() { var g = window.D2_GROUPS && D2_GROUPS.front; return g && g.front; }
  function ensureFront() {
    if (F.ready) return F.ready;
    var gname = D2.E.index && D2.E.index.front;
    return (F.ready = (gname ? D2.E.loadGroup(gname) : Promise.resolve(false)).then(function () {
      var g = FG(); if (!g) return false;
      return Promise.all(g.pages.map(function (pg) {
        return new Promise(function (res) { var r = D2.E.img(pg); if (r.ok || r.fail) res(); else r.cbs.push(res); });
      }));
    }));
  }
  UI.ensureFront = ensureFront;
  function fdraw(c, r, x, y) {
    var g = FG(); if (!g || !r || !r.length) return;
    var rec = D2.E.img(g.pages[r[6]]); if (!rec.ok) return;
    c.drawImage(rec.img, r[0], r[1], r[2], r[3], x - r[4], y - r[5], r[2], r[3]);
  }
  function fsprite(r) {
    var g = FG(); if (!g || !r || !r.length) return '';
    return 'background-image:url(' + g.pages[r[6]] + (D2.E.ver ? '?v=' + D2.E.ver : '') + ');background-repeat:no-repeat;background-position:-' + r[0] + 'px -' + r[1] + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px;';
  }
  function frontCanvas(el) { var c = h('canvas', 'fcv', '', el); c.width = 960; c.height = 540; return c; }
  function fpin(el) { var q = h('div', 'fpin', '', el); q.style.cssText = 'left:' + FX + 'px;transform:scale(' + FK + ')'; return q; }
  // nút ảnh D2 (widebuttonblank / mediumbuttonblank: khung 0 thả, 1 nhấn), chữ Exocet căn giữa
  function fbtn(parent, kind, x, y, label, fn, id) {
    var g = FG(), fr = g ? g.btn[kind] : null, e = h('button', 'fbtn ' + kind, T(label, 'fontexocet10', 'white'), parent);
    if (id) e.id = id;
    function paint(dn) { var r = fr && fr[dn ? 1 : 0]; e.style.cssText = 'left:' + (x - (r ? r[4] : 0)) + 'px;top:' + (y - (r ? r[5] : 0)) + 'px;' + fsprite(r); }
    paint(false);
    e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); paint(true); D2.E.audioUnlock(); D2.E.sfx(['cursor_button_click'], 0.4); fn(); });
    e.addEventListener('pointerup', function () { paint(false); });
    e.addEventListener('pointerleave', function () { paint(false); });
    return e;
  }
  // khung hoạt ảnh theo thời gian: len (ms) là cả lượt, 0 thì 25 khung/giây
  function fframe(list, t, len, loop) {
    var n = list.length, k = Math.floor(t / ((len || n * 1000 / FPS) / n));
    return loop ? k % n : Math.min(n - 1, k);
  }
  function frontLoop() {
    if (!F.mode) { F.loop = false; return; }
    requestAnimationFrame(frontLoop);
    var g = FG(), cv = F.mode === 'load' ? UI.loadCv : UI.titleCv; if (!g || !cv) return;
    var c = cv.getContext('2d'), now = performance.now(), t = now - F.t0;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, 960, 540);
    c.setTransform(FK, 0, 0, FK, FX, 0); c.imageSmoothingEnabled = true;
    if (F.mode === 'title') {
      g.title.bg.forEach(function (b) { fdraw(c, b.r, b.x, b.y); });
      var L = g.title.logo, k = Math.floor(t * FPS / 1000);
      fdraw(c, L.blackL, L.x, L.y); fdraw(c, L.blackR, L.x, L.y);
      c.globalCompositeOperation = 'lighter';
      fdraw(c, L.fireL[k % L.fireL.length], L.x, L.y); fdraw(c, L.fireR[k % L.fireR.length], L.x, L.y);
      c.globalCompositeOperation = 'source-over';
    } else if (F.mode === 'create') {
      g.create.bg.forEach(function (b) { fdraw(c, b.r, b.x, b.y); });
      // lớp đứng yên vẽ trước, lớp đang đi/được chọn vẽ sau, lửa trại sau cùng (OD select_hero_class)
      var later = [];
      Object.keys(g.cls).forEach(function (nm) { if (!F.cls[nm] || F.cls[nm].st === 'idle') drawHero(c, nm, now); else later.push(nm); });
      later.forEach(function (nm) { drawHero(c, nm, now); });
      var fi = g.create.fire;
      c.globalCompositeOperation = 'lighter'; fdraw(c, fi.f[Math.floor(t * FPS / 1000) % fi.f.length], fi.x, fi.y); c.globalCompositeOperation = 'source-over';
    } else if (F.mode === 'load') {
      // khung 256x256 đặt giữa màn; cửa mở dần trong lúc tải
      var ld = g.load, f = ld.f[Math.min(ld.f.length - 1, Math.floor(t / 120))];
      fdraw(c, f, ld.x - f[2] / 2 + f[4], ld.y - f[3] / 2 + f[5]);
    }
  }
  // Mỗi lớp: idle (nu1) -> fw (bước tới lửa) -> sel (nu3) -> bw (lùi về) -> idle. F.cls[lớp].f là khung đang vẽ.
  function drawHero(c, nm, now) {
    var d = FG().cls[nm], s = F.cls[nm] || (F.cls[nm] = { st: 'idle', t: now, f: 0 }), t, list, ov, len;
    if (s.st === 'fw' && now - s.t >= d.len[1]) { s.st = 'sel'; s.t = now; }
    if (s.st === 'bw' && now - s.t >= d.len[2]) { s.st = 'idle'; s.t = now; }
    t = now - s.t;
    if (s.st === 'idle') { list = d.nu1; len = d.len[0]; }
    else if (s.st === 'fw') { list = d.fw; ov = d.fws; len = d.len[1]; }
    else if (s.st === 'bw') { list = d.bw; ov = d.bws; len = d.len[2]; }
    else { list = d.nu3; ov = d.nu3s; len = 0; }
    var loop = s.st === 'idle' || s.st === 'sel';
    s.f = fframe(list, t, len, loop);
    // D2 thay nu1 bằng nu2 (sáng hơn) khi rê chuột; nu2 trùng ảnh nu1 nên làm sáng bằng filter
    if (s.st === 'idle' && F.hover === nm) c.filter = 'brightness(1.6)';
    fdraw(c, list[s.f], d.x, d.y); c.filter = 'none';
    if (ov && ov.length) {
      if (d.blend) c.globalCompositeOperation = 'lighter';
      fdraw(c, ov[fframe(ov, t, len, loop)], d.x, d.y); c.globalCompositeOperation = 'source-over';
    }
  }
  function setFront(mode) {
    F.mode = mode; F.t0 = performance.now();
    // lớp nút cảm ứng (#touch) nằm trên .ui: ẩn nó khi đang ở màn đầu/màn tải kẻo che nút Bắt đầu
    document.body.classList.toggle('front', !!mode);
    if (mode && !F.loop) { F.loop = true; requestAnimationFrame(frontLoop); }
  }

  UI.showLoad = function (on, text) {
    UI.loadEl.style.display = on ? 'flex' : 'none'; if (text) $('.lt', UI.loadEl).textContent = text;
    if (on) { if (!UI.loadCv) UI.loadCv = frontCanvas(UI.loadEl); setFront('load'); }
    else setFront(UI.titleEl.style.display !== 'none' ? F.under : null);
  };
  UI.showTitle = function (hasSave) {
    D2.E.textPreload();
    var el = UI.titleEl; el.style.display = 'flex'; el.innerHTML = '';
    // chờ nhóm m/front (tranh, nút) một lần; nhóm hỏng thì vẫn hiện menu, chỉ thiếu tranh
    if (!FG() && !F.tried) { F.tried = true; ensureFront().then(function () { if (UI.titleEl.style.display !== 'none') UI.showTitle(hasSave); }); return; }
    UI.titleCv = frontCanvas(el); F.under = 'title'; setFront('title');
    h('h1', 'sr', 'ÁC QUỶ II', el);
    var q = fpin(el), m = h('div', 'tmenu', '', q), y = 290;
    function b(label, fn) { var e = fbtn(m, 'wide', 264, y, label, fn); y += 40; return e; }
    var diffs = hasSave ? G().diffs() : [];
    if (diffs.length > 1) diffs.forEach(function (d) { b('Tiếp tục · ' + d.name, function () { UI.hideTitle(); G().continueGame(d.id); }); });
    else if (hasSave) b('Tiếp tục', function () { UI.hideTitle(); G().continueGame(); });
    b('Trò chơi mới', function () { UI.showClassSelect(); });
    h('div', 'credit', 'Hình, tiếng, bản đồ và số liệu: Diablo II (Blizzard Entertainment), bóc từ bản cài trên máy.', el);
  };
  UI.hideTitle = function () { UI.titleEl.style.display = 'none'; F.under = null; setFront(null); };
  // Chọn lớp: cảnh lửa trại của D2, bảy nhân vật đứng quanh lửa. Bấm một người thì người đó bước tới (fw), người đang
  // được chọn lùi về (bw). Vùng bấm .ccard theo khung chọn của OD.
  UI.showClassSelect = function () {
    var el = UI.titleEl; el.innerHTML = '';
    UI.titleCv = frontCanvas(el); F.under = 'create'; F.cls = {}; F.picked = null; setFront('create');
    var q = fpin(el), g = FG(), picked = null;
    box(q, 'fhead', 0, 17, 800, 30, T('Chọn lớp nhân vật', 'font30'));
    var cname = box(q, 'fhead', 0, 65, 800, 30, ''), info = box(q, 'fhead', 150, 100, 500, 48, '');
    DA().classList().forEach(function (cl) {
      var d = g && g.cls[cl.id], bx = d ? d.box : [0, 0, 0, 0];
      var e = box(q, 'ccard' + (cl.locked ? ' locked' : ''), bx[0], bx[1], bx[2], bx[3], '');
      e.dataset.cls = cl.id; e.title = cl.name;
      e.addEventListener('pointerenter', function () { F.hover = cl.id; });
      e.addEventListener('pointerleave', function () { if (F.hover === cl.id) F.hover = null; });
      e.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation(); D2.E.audioUnlock();
        if (cl.locked) { info.innerHTML = T(cl.name + ' bị khoá trong bản này.'); return; }
        if (picked === cl.id) return;
        var now = performance.now();
        if (picked) F.cls[picked] = { st: 'bw', t: now, f: 0 };
        picked = F.picked = cl.id; F.cls[cl.id] = { st: 'fw', t: now, f: 0 };
        [].forEach.call(q.querySelectorAll('.ccard'), function (x) { x.classList.remove('on'); }); e.classList.add('on');
        cname.innerHTML = T(cl.name, 'font30');
        info.innerHTML = T(cl.blurb || '', 'font16');
        var inp = q.querySelector('#pname'); inp.value = inp.value || cl.name;
        q.querySelector('#pgo').classList.remove('off');
      });
    });
    box(q, 'flabel', 321, 475, 200, 16, T('Tên nhân vật', 'font16', 'gold'));
    var tb = box(q, 'ftext', 318, 493, 169, 26, '<input id="pname" maxlength="15" autocomplete="off">');
    if (g) tb.style.cssText += ';' + fsprite(g.btn.textbox) + 'left:318px;top:493px';
    fbtn(q, 'medium', 33, 537, 'Quay lại', function () { UI.showTitle(G().hasSave()); });
    fbtn(q, 'medium', 630, 537, 'Bắt đầu', function () {
      if (!picked) return;
      var nm = (q.querySelector('#pname').value || '').trim() || picked;
      UI.hideTitle(); G().newGame(picked, nm);
    }, 'pgo').classList.add('off');
  };
  UI.showDead = function (on, cb) {
    var el = UI.deadEl; el.style.display = on ? 'flex' : 'none'; if (!on) return;
    el.innerHTML = '<div class="logo2" style="color:#c33">Bạn đã chết</div>';
    var b = h('button', 'go', 'Hồi sinh ở Rogue Encampment', el);
    b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); el.style.display = 'none'; cb(); });
  };
})();
