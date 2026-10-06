/* Ác Quỷ II - ui.js
 * HUD và các bảng dựng từ ảnh giao diện gốc của Diablo II (D2_UI, nạp qua D2.E.UI): thanh điều khiển, hai quả cầu,
 * túi đồ, nhân vật, cây kỹ năng, kho, cửa hàng, waypoint, nhật ký. Chữ, hộp thoại, màn hình đầu vẫn là DOM.
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
  var QBG = { magic: 'rgba(40,40,150,.35)', rare: 'rgba(150,140,30,.3)', unique: 'rgba(120,100,50,.35)', set: 'rgba(30,120,30,.35)', crafted: 'rgba(150,80,20,.35)' };

  var CELL = 29;            // ô túi đồ của D2
  var PK = 0.95;            // hệ số co của bảng so với toạ độ D2: cao 432 -> 410, vừa phía trên thanh điều khiển
  var HK = 1.2;             // 800 -> 960 theo chiều ngang, không méo
  var PW = 320, PH = 432;
  var BAR_TOP = 496, BAR_H = 104;
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
    UI.panels.inv.classList.add('right'); ['char', 'skill', 'quest', 'stash'].forEach(function (k) { UI.panels[k].classList.add('left'); });
    UI.dlgEl = h('div', 'dialog', '', r); UI.dlgEl.style.display = 'none';
    UI.shopEl = h('div', 'panel d2 left shop', '', r); UI.shopEl.style.display = 'none';
    UI.wpEl = h('div', 'modal d2 wpmenu', '', r); UI.wpEl.style.display = 'none';
    UI.menuEl = h('div', 'modal menu', '', r); UI.menuEl.style.display = 'none';
    UI.popup = h('div', 'skpop', '', r); UI.popup.style.display = 'none';
    UI.tipEl = h('div', 'tip', '', r); UI.tipEl.style.display = 'none';
    UI.toasts = h('div', 'toasts', '', r);
    UI.mapEl = h('canvas', 'automap', '', r); UI.mapEl.width = 960; UI.mapEl.height = 540; UI.mapEl.style.display = 'none';
    UI.titleEl = h('div', 'screen title', '', r); UI.titleEl.style.display = 'none';
    UI.deadEl = h('div', 'screen dead', '', r); UI.deadEl.style.display = 'none';
    UI.loadEl = h('div', 'screen load', '<div class="lt">Đang tải...</div>', r); UI.loadEl.style.display = 'none';
    UI.rotate = h('div', 'rotate', '<div>Hãy xoay ngang điện thoại</div><small>xoay ngang để chơi</small>', r);
  };

  function buildHud(r) {
    var hud = UI.hud = h('div', 'hud', '', r); hud.style.display = 'none';
    var A = UA(), L = A.layout || {}, HL = L.hud || {}, bar = UI.bar = h('div', 'hbar', '', hud);
    function at(cls, x, y, w, hh, html, parent) { return box(parent || bar, cls, x, y - BAR_TOP, w, hh, html); }
    frames(bar, PN('ctrlpanel'), 0, BAR_TOP);
    // quả cầu: ảnh cầu đầy được cắt từ đáy theo phần trăm (xem UI.update)
    var G0 = (A.panels && A.panels.globes) || {};
    UI._glob = { hp: G0.hp && G0.hp.r, mp: G0.mp && G0.mp.r };
    if (G0.hpFrame) frames(bar, [G0.hpFrame, G0.mpFrame], 0, BAR_TOP);   // nền cầu rỗng, cầu đầy vẽ đè lên
    UI.lifeOrb = at('orb life', G0.hp ? G0.hp.x : 29, G0.hp ? G0.hp.y : 507, 80, 80, '<div class="fill"></div><div class="lab"></div>');
    UI.manaOrb = at('orb mana', G0.mp ? G0.mp.x : 689, G0.mp ? G0.mp.y : 507, 80, 80, '<div class="fill"></div><div class="lab"></div>');
    ['hp', 'mp'].forEach(function (k) {
      var f = $('.fill', k === 'hp' ? UI.lifeOrb : UI.manaOrb), r0 = UI._glob[k];
      if (r0) f.style.cssText = D2.E.uiSprite(r0, 1) + 'left:0;bottom:0;top:auto;';
    });
    // layout.hud.exp/stamina/belt tính theo màn 640 nên lệch +80 so với thanh 800
    var ex = HL.exp || [176, 561, 119, 2], sm = HL.stamina || [193, 573, 102, 18];
    ex = [ex[0] + 80, ex[1], ex[2], ex[3]]; sm = [sm[0] + 80, sm[1], sm[2], sm[3]];
    UI.xpBar = at('xpbar', ex[0], ex[1] - 1, ex[2], 4, '<i></i>');
    UI.stamBar = at('stam', sm[0], sm[1], sm[2], sm[3], '<i></i>');
    UI.belt = at('belt', 423, 562, 124, 30, '');
    var ls = HL.leftSkill || [117, 552], rs = HL.rightSkill || [635, 552];
    UI.lskill = at('skbtn left', ls[0], ls[1], 48, 48, ''); UI.rskill = at('skbtn right', rs[0], rs[1], 48, 48, '');
    UI.lskill.title = 'Kỹ năng chuột trái'; UI.rskill.title = 'Kỹ năng chuột phải';
    UI.lskill.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skillPopup('left'); });
    UI.rskill.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skillPopup('right'); });
    // dải nút nhỏ (mini panel): C, I, T, bản đồ, nhiệm vụ, menu
    var mp = (A.panels && A.panels.minipanel && A.panels.minipanel.single);
    UI.hudBtns = at('hudbtns', mp ? mp.x : 322, mp ? mp.y : 527, mp ? mp.r[2] : 152, 25, '');
    if (mp) { var st = h('div', 'sp', '', UI.hudBtns); st.style.cssText = 'left:0;top:0;' + D2.E.uiSprite(mp.r, 1); }
    var MB = (A.panels && A.panels.buttons && A.panels.buttons.minipanel) || [];
    [['C', 'Nhân vật (C)', 'char', 0], ['I', 'Túi đồ (I)', 'inv', 1], ['T', 'Kỹ năng (T)', 'skill', 2], ['Tab', 'Bản đồ (Tab)', 'map', 3], ['Q', 'Nhiệm vụ (Q)', 'quest', 5], ['Esc', 'Menu (Esc)', 'menu', 6]].forEach(function (b) {
      var e = h('button', 'hb', '', UI.hudBtns); e.title = b[1];
      var fr = MB[b[3]];
      e.style.left = (3 + b[3] * 21) + 'px'; e.style.top = '3px';
      if (fr) e.style.cssText += ';' + D2.E.uiSprite(fr.r, 1);
      e.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        if (b[2] === 'menu') UI.toggleMenu(); else UI.toggle(b[2]);
      });
    });
    // nút +chỉ số / +kỹ năng nhấp nháy khi còn điểm
    var BU = (A.panels && A.panels.buttons) || {};
    function lvlBtn(def, id, title, key) {
      var e = at('lvlbtn', def[0].x, def[0].y, def[0].r[2], def[0].r[3], ''); e.title = title; e.style.display = 'none';
      e.style.cssText += ';' + D2.E.uiSprite(def[0].r, 1);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.toggle(key); });
      return e;
    }
    UI.statBtn = BU.statup ? lvlBtn(BU.statup, 'stat', 'Có điểm chỉ số', 'char') : null;
    UI.skillBtn = BU.skillup ? lvlBtn(BU.skillup, 'skill', 'Có điểm kỹ năng', 'skill') : null;
    UI.lvlPts = h('div', 'ptsflag', '', hud);
    UI.lvlPts.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.toggle(S().char.statPts > 0 ? 'char' : 'skill'); });
    UI.mon = h('div', 'monbar', '<span></span><div><i></i></div>', hud);
    UI._last = {};
  }

  /* ----------------------------------------------------------- HUD mỗi khung */
  UI.showHud = function (on) { UI.hud.style.display = on ? 'block' : 'none'; };
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
    if (L.lp !== lp) { L.lp = lp; setGlobe(UI.lifeOrb, UI._glob.hp, lp); }
    if (L.mp !== mp) { L.mp = mp; setGlobe(UI.manaOrb, UI._glob.mp, mp); }
    var lt = Math.ceil(c.hp) + '/' + mh, mt = Math.ceil(c.mp) + '/' + mm;
    if (L.lt !== lt) { L.lt = lt; $('.lab', UI.lifeOrb).textContent = lt; }
    if (L.mt !== mt) { L.mt = mt; $('.lab', UI.manaOrb).textContent = mt; }
    var xp = DA().xpFor(c.lvl), xn = DA().xpFor(c.lvl + 1), xpp = Math.round(Math.max(0, Math.min(1, (c.xp - xp) / Math.max(1, xn - xp))) * 1000) / 10;
    if (L.xp !== xpp) { L.xp = xpp; $('i', UI.xpBar).style.width = xpp + '%'; UI.xpBar.title = 'Kinh nghiệm ' + c.xp + ' / ' + xn; }
    var sp = Math.round((s.stamina / Math.max(1, s.stamMax)) * 100);
    if (L.sp !== sp) { L.sp = sp; $('i', UI.stamBar).style.width = sp + '%'; }
    var pk = c.statPts + '/' + c.skillPts;
    if (L.pk !== pk) {
      L.pk = pk;
      UI.lvlPts.style.display = (c.statPts > 0 || c.skillPts > 0) ? 'block' : 'none';
      UI.lvlPts.textContent = (c.statPts > 0 ? '+' + c.statPts + ' chỉ số ' : '') + (c.skillPts > 0 ? '+' + c.skillPts + ' kỹ năng' : '');
      if (UI.statBtn) UI.statBtn.style.display = c.statPts > 0 ? 'block' : 'none';
      if (UI.skillBtn) UI.skillBtn.style.display = c.skillPts > 0 ? 'block' : 'none';
    }
    var sig = c.hp > 0 ? [s.leftSkill, s.rightSkill, c.belt.map(function (b) { return b ? b.name || b.base : '-'; }).join(), JSON.stringify(s.fkeys), c.lvl].join('|') : L.sig;
    if (L.sig !== sig) { L.sig = sig; UI.refreshSkillIcons(); UI.refreshBelt(); }
    // thanh máu quái đang trỏ
    var m = s.hover && s.hover.kind === 'mon' ? s.hover : s.target && s.target.kind === 'mon' && s.target.st !== 'dead' ? s.target : null;
    if (m && m.st !== 'dead' && m.inst) {
      UI.mon.style.display = 'block';
      $('span', UI.mon).textContent = m.inst.name + (m.rank && m.rank !== 'normal' ? ' (' + (m.rank === 'unique' ? 'Tinh anh' : 'Nhà vô địch') + ')' : '');
      $('i', UI.mon).style.width = Math.max(0, m.hp / m.maxHp * 100) + '%';
      UI.mon.className = 'monbar ' + (m.rank || 'normal');
    } else UI.mon.style.display = 'none';
    if (t - UI.dirtyAt > 150) {
      UI.dirtyAt = t;
      if (UI.dirty) { UI.dirty = false; UI.renderOpen(); }
      if (UI.open.map) UI.drawMap();
    }
  };

  function skIconHtml(id, size) {
    var sk = DA().skill(id);
    var ic = sk ? DA().skillIcon(id) : null, st = ic ? D2.E.uiSprite(ic, size / ic[2]) : '';
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
  UI.refreshBelt = function () {
    var s = S(), c = s.char; UI.belt.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      (function (i) {
        var slot = h('div', 'bslot', '<small>' + (i + 1) + '</small>', UI.belt), it = c.belt[i];
        slot.style.left = (i * 31) + 'px';
        if (it) { slot.appendChild(itemEl(it, 28, false)); slot.title = DA().itemName(it); }
        slot.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().drinkBelt(i); });
      })(i);
    }
    var p1 = D2.Input.touchBtns && D2.Input.touchBtns.p1, p2 = D2.Input.touchBtns && D2.Input.touchBtns.p2;
    if (p1) p1.textContent = c.belt[0] ? 'Bình 1' : '-'; if (p2) p2.textContent = c.belt[1] ? 'Bình 2' : '-';
  };

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

  function itemTipHtml(it) {
    var lines = DA().itemLines(it);
    return '<b style="color:' + UI.qcol(it.q) + '">' + esc(DA().itemName(it)).replace(/\n/g, '<br>') + '</b><br>' + lines.map(esc).join('<br>');
  }
  UI.itemTipHtml = itemTipHtml;

  UI.tip = function (html, x, y) {
    if (!html) { UI.tipEl.style.display = 'none'; return; }
    UI.tipEl.innerHTML = html; UI.tipEl.style.display = 'block';
    var w = UI.tipEl.offsetWidth, hh = UI.tipEl.offsetHeight;
    UI.tipEl.style.left = Math.max(2, Math.min(960 - w - 2, x + 14)) + 'px';
    UI.tipEl.style.top = Math.max(2, Math.min(540 - hh - 2, y + 14)) + 'px';
  };
  function hoverTip(el, htmlFn) {
    el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'touch') return; var p = D2.Input.logical(e); UI.tip(htmlFn(), p.x, p.y); });
    el.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') return; var p = D2.Input.logical(e); UI.tip(htmlFn(), p.x, p.y); });
    el.addEventListener('pointerleave', function () { UI.tip(null); });
    el.__tipFn = htmlFn;
  }
  UI.hoverTip = hoverTip;

  UI.msg = function (text, color) {
    var e = h('div', 'toast', esc(text), UI.toasts); if (color) e.style.color = color;
    setTimeout(function () { e.classList.add('out'); }, 2600);
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 3300);
    while (UI.toasts.children.length > 5) UI.toasts.removeChild(UI.toasts.firstChild);
  };

  /* --------------------------------------------------------------- bảng */
  UI.toggle = function (id) {
    if (id === 'map') { UI.open.map = !UI.open.map; UI.mapEl.style.display = UI.open.map ? 'block' : 'none'; return; }
    var willOpen = !UI.open[id];
    if (id === 'char' || id === 'skill' || id === 'quest' || id === 'stash') ['char', 'skill', 'quest', 'stash'].forEach(function (k) { UI.open[k] = false; UI.panels[k].style.display = 'none'; });
    UI.open[id] = willOpen; UI.panels[id].style.display = willOpen ? 'block' : 'none';
    UI.sel = null; UI.tip(null);
    if (willOpen) UI.renderPanel(id);
    D2.E.sfx(['button', 'click', 'menu'], 0.4);
  };
  UI.closeAll = function () {
    ['inv', 'char', 'skill', 'quest', 'stash'].forEach(function (k) { UI.open[k] = false; UI.panels[k].style.display = 'none'; });
    UI.closeWaypoints();
    UI.open.map = false; UI.mapEl.style.display = 'none';
    UI.closeDialog(); UI.popup.style.display = 'none'; UI.tip(null);
  };
  UI.anyOpen = function () { return UI.open.inv || UI.open.char || UI.open.skill || UI.open.quest || UI.open.stash || UI.open.menu || UI.open.wp || !!UI.dlg; };
  UI.renderOpen = function () { ['inv', 'char', 'skill', 'quest', 'stash'].forEach(function (k) { if (UI.open[k]) UI.renderPanel(k); }); if (UI.shop) UI.renderShop(); };
  UI.renderPanel = function (id) {
    if (id === 'inv') renderInv(); else if (id === 'char') renderChar(); else if (id === 'skill') renderSkill(); else if (id === 'quest') renderQuest(); else if (id === 'stash') renderStash();
  };
  UI.closePanelOf = function (p) {
    Object.keys(UI.panels).forEach(function (k) { if (UI.panels[k] === p) { UI.open[k] = false; p.style.display = 'none'; } });
    if (p === UI.shopEl) UI.closeShop();
    UI.tip(null);
  };
  /* Tiêu đề nằm trong dải trên cùng của bảng (chữ Exocet thay bằng Cinzel). */
  function title(q, text, x, y, w) { return box(q, 'ptitle', x, y, w, 24, esc(text)); }
  /* Khung chi tiết đồ/kỹ năng: nằm ngoài bảng, phía trong màn hình, nên không bị co theo bảng. */
  function detailBox(p) { return h('div', 'detail', '', p); }

  /* -------------------------------------------------------- bảng nhân vật */
  function renderChar() {
    var p = UI.panels.char, s = S(), c = s.char, d = s.d || {};
    var q = pin(p, PN('character'), 80, 60);
    var nm = DA().className(c.cls);
    box(q, 'fld', 10, 8, 172, 18, esc(c.name));
    box(q, 'fld', 192, 8, 118, 18, esc(nm));
    box(q, 'fld two', 10, 31, 42, 35, '<small>Cấp</small>' + c.lvl);
    box(q, 'fld two', 63, 31, 120, 35, '<small>Kinh nghiệm</small>' + c.xp);
    box(q, 'fld two', 192, 31, 118, 35, '<small>Cấp tiếp theo</small>' + DA().xpFor(c.lvl + 1));
    var groups = [
      { key: 'str', lab: 'Sức mạnh', y: 81, rows: [['Sát thương', Math.round(d.dmgMin || 0) + '-' + Math.round(d.dmgMax || 0)], ['Chính xác', Math.round(d.ar || 0)]] },
      { key: 'dex', lab: 'Nhanh nhẹn', y: 143, rows: [['Phòng thủ', Math.round(d.def || 0)], ['Tốc đánh', (d.atkFrames || 0) + ' khung'], ['Vàng', '<span style="color:#ffd24a">' + c.gold + '</span>']] },
      { key: 'vit', lab: 'Sinh lực', y: 231, rows: [['Sinh lực', Math.ceil(c.hp) + '/' + (d.maxHp || 0)], ['Thể lực', Math.round(s.stamina || 0) + '/' + Math.round(s.stamMax || 0)]] },
      { key: 'ene', lab: 'Năng lượng', y: 293, rows: [['Mana', Math.ceil(c.mp) + '/' + (d.maxMp || 0)]] }
    ];
    var statupR = (((UA().panels || {}).buttons || {}).statup || [{}])[0].r;
    groups.forEach(function (g) {
      box(q, 'fld lv', 10, g.y, 38 + 70, 22, '<span>' + g.lab + '</span><b>' + c[g.key] + '</b>');
      g.rows.forEach(function (r, i) { box(q, 'fld lv', 161, g.y + i * 23.5, 150, 22, '<span>' + r[0] + '</span><b>' + r[1] + '</b>'); });
      if (c.statPts > 0) {
        var bt = box(q, 'plus', 125, g.y - 4, 30, 29, '+'); bt.style.cssText += ';' + D2.E.uiSprite(statupR, 1);
        bt.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().statUp(g.key); });
      }
    });
    box(q, 'fld lv', 3, 341, 135, 22, '<span>Chỉ số ' + c.statPts + '</span><b>Kỹ năng ' + c.skillPts + '</b>');
    var res = d.res || {};
    [['Kháng lửa', res.fire, '#f55'], ['Kháng lạnh', res.cold, '#6cf'], ['Kháng sét', res.light, '#ff6'], ['Kháng độc', res.poison, '#7d7']].forEach(function (r, i) {
      box(q, 'fld lv', 174, 331 + i * 23, 137, 21, '<span style="color:' + r[2] + '">' + r[0] + '</span><b style="color:' + r[2] + '">' + (r[1] || 0) + '</b>');
    });
    closeBtn(q, p, 128, 388);
  }

  /* ------------------------------------------------------------- túi đồ */
  function slotRect(name) {
    var f = PN('inventory')[SLOT_IDX[name]]; if (!f || !f.r) return null;
    return { x: f.x - (f.r[4] || 0) - 400, y: f.y - (f.r[5] || 0) - 60, w: f.r[2], h: f.r[3] };
  }
  function renderInv() {
    var p = UI.panels.inv, s = S(), c = s.char;
    var q = pin(p, PN('inventory'), 400, 60), L = (UA().layout || {}).inventory || {}, gr = L.grid || [19, 255, 10, 4];
    Object.keys(SLOT_IDX).forEach(function (id) {
      var rc = slotRect(id); if (!rc) return;
      var cell = box(q, 'eslot', rc.x - 2, rc.y - 2, rc.w + 4, rc.h + 4, ''); cell.title = SLOT_NAME[id];
      var it = c.equip[id];
      if (it) {
        var e = itemFit(it, rc.w, rc.h); e.style.cssText += ';position:absolute;left:2px;top:2px';
        if (UI.sel && UI.sel.item === it) e.classList.add('sel');
        cell.appendChild(e);
        hoverTip(cell, function () { return itemTipHtml(it); });
        cell.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.select({ item: it, equipped: id }); });
      }
    });
    var grid = box(q, 'grid', gr[0], gr[1], gr[2] * CELL, gr[3] * CELL, '');
    var rect = h('div', 'gridbg', '', grid);
    rect.style.gridTemplateColumns = 'repeat(' + gr[2] + ',' + CELL + 'px)'; rect.style.gridTemplateRows = 'repeat(' + gr[3] + ',' + CELL + 'px)';
    for (var i = 0; i < gr[2] * gr[3]; i++) h('i', '', '', rect);
    c.inv.forEach(function (it) {
      var e = itemEl(it, CELL); e.style.cssText += ';position:absolute;left:' + (it.ix * CELL) + 'px;top:' + (it.iy * CELL) + 'px';
      if (UI.sel && UI.sel.item === it) e.classList.add('sel');
      grid.appendChild(e);
      hoverTip(e, function () { return itemTipHtml(it); });
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.select({ item: it }); });
    });
    var gp = L.gold || [84, 391];
    box(q, 'gold', gp[0] + 4, gp[1] + 1, 112, 18, 'Vàng: <b>' + c.gold + '</b>');
    closeBtn(q, p, (L.close || [18, 384])[0], (L.close || [18, 384])[1]);
    var det = detailBox(p);
    if (UI.sel && (UI.sel.item)) {
      var it = UI.sel.item;
      if (UI.sel.equipped ? c.equip[UI.sel.equipped] !== it : c.inv.indexOf(it) < 0 && c.belt.indexOf(it) < 0) UI.sel = null;
    }
    if (UI.sel && UI.sel.item) {
      var it2 = UI.sel.item;
      det.innerHTML = itemTipHtml(it2);
      var bar = h('div', 'acts', '', det);
      function act(label, fn) { var b = h('button', '', label, bar); b.addEventListener('pointerdown', function (e) { e.stopPropagation(); fn(); }); }
      if (UI.sel.equipped) act('Cởi ra', function () { G().unequip(UI.sel.equipped); UI.sel = null; });
      else {
        if (DA().potionInfo(it2)) { act('Dùng', function () { G().useItem(it2); }); act('Vào đai', function () { G().toBelt(it2); }); }
        else if (DA().isEquippable(it2)) act('Trang bị', function () { G().equipItem(it2); });
        if (UI.open.stash) act('Cất vào kho', function () { G().stashIn(it2); });
        if (UI.shop) act('Bán (' + DA().sellPrice(it2) + ')', function () { G().sellItem(it2); UI.sel = null; });
        act('Vứt', function () { G().dropItem(it2); UI.sel = null; });
      }
    } else det.innerHTML = '<span class="dim">Chạm vào đồ để xem và dùng. Giữ Alt để hiện tên đồ dưới đất.</span>';
  }
  UI.select = function (sel) { UI.sel = sel; UI.dirty = true; UI.dirtyAt = 0; renderInv(); };

  /* ------------------------------------------------------- kho đồ (6x8) và waypoint */
  UI.openStash = function () {
    UI.closeShop();
    if (!UI.open.stash) UI.toggle('stash');
    if (!UI.open.inv) UI.toggle('inv');
  };
  function renderStash() {
    // tranh kho lớn của D2R là 10x10; chỉ 6x8 đầu dùng được, phần còn lại phủ tối
    var p = UI.panels.stash, c = S().char, CW = D2.Game.stashCols, RW = D2.Game.stashRows;
    var q = pin(p, PN('stash_big'), 80, 60), gx = 16, gy = 63;
    box(q, 'gold', 18, 358, 180, 18, 'Vàng: <b>' + c.gold + '</b>');
    for (var gyi = 0; gyi < 10; gyi++) for (var gxi = 0; gxi < 10; gxi++) {
      if (gxi >= CW || gyi >= RW) box(q, 'lockcell', gx + gxi * CELL, gy + gyi * CELL, CELL, CELL, '');
    }
    var grid = box(q, 'grid', gx, gy, CW * CELL, RW * CELL, '');
    var rect = h('div', 'gridbg', '', grid); rect.style.gridTemplateColumns = 'repeat(' + CW + ',' + CELL + 'px)'; rect.style.gridTemplateRows = 'repeat(' + RW + ',' + CELL + 'px)';
    for (var i = 0; i < CW * RW; i++) h('i', '', '', rect);
    (c.stash || []).forEach(function (it) {
      var e = itemEl(it, CELL); e.style.cssText += ';position:absolute;left:' + (it.ix * CELL) + 'px;top:' + (it.iy * CELL) + 'px';
      if (UI.stSel === it) e.classList.add('sel');
      grid.appendChild(e);
      hoverTip(e, function () { return itemTipHtml(it); });
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.stSel = it; renderStash(); });
    });
    closeBtn(q, p, 275, 383);
    var det = detailBox(p);
    if (UI.stSel && (c.stash || []).indexOf(UI.stSel) < 0) UI.stSel = null;
    if (UI.stSel) {
      det.innerHTML = itemTipHtml(UI.stSel);
      var bar = h('div', 'acts', '', det), b = h('button', '', 'Lấy ra', bar);
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().stashOut(UI.stSel); });
    } else det.innerHTML = '<span class="dim">Chọn đồ trong túi rồi bấm "Cất vào kho".</span>';
  }
  UI.openWaypoints = function () {
    var m = UI.wpEl, list = G().visitedWaypoints(), here = S().areaId;
    UI.open.wp = true; m.style.display = 'block';
    var q = pin(m, PN('waypoint'), 80, 60);
    var tab = ((((UA().panels || {}).buttons || {}).waygate_tabs) || [])[1];
    if (tab) { var te = h('div', 'sp', '', q); te.style.cssText = spStyle(tab.r, 5, 3); }
    title(q, 'Waypoint - Act I', 0, 36, 320);
    var lst = box(q, 'wplist', 22, 59, 284, 330, '');
    list.forEach(function (w) {
      var b = h('button', 'wpb' + (w.id === here ? ' off' : ''), esc(w.name) + (w.id === here ? ' (đang ở đây)' : ''), lst);
      b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); G().travelWaypoint(w.id); });
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
    box(q, 'skpts', 232, 6, 86, 96, '<small>Điểm kỹ năng</small><b>' + c.skillPts + '</b>');
    var tree = h('div', 'tree', '', q);
    var list = DA().skillsOf(c.cls).filter(function (k) { return k.tab === UI.skTab; });
    list.forEach(function (k) {
      var st = skillState(k), e = h('div', 'sknode' + (st.lv > 0 ? ' on' : '') + (st.can ? ' can' : '') + (UI.sel && UI.sel.skill === k.id ? ' sel' : ''), '', tree);
      e.style.left = (SK_X0 + k.col * SK_DX - 24) + 'px'; e.style.top = (SK_Y0 + k.row * SK_DY - 24) + 'px';
      e.innerHTML = skIconHtml(k.id, 44) + '<b>' + st.lv + '</b>';
      hoverTip(e, function () { return skillTip(k); });
      e.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        if (UI.sel && UI.sel.skill === k.id && st.can) G().skillUp(k.id);
        UI.sel = { skill: k.id }; renderSkill();
      });
      if (st.can) {
        var pb = h('span', 'plus2', '+', e);
        pb.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); G().skillUp(k.id); });
      }
    });
    closeBtn(q, p, 172, 383);
    var det = detailBox(p);
    if (UI.sel && UI.sel.skill) {
      var k2 = DA().skill(UI.sel.skill); if (k2) {
        det.innerHTML = skillTip(k2);
        var bar = h('div', 'acts', '', det), st2 = skillState(k2);
        if (st2.can) { var b1 = h('button', '', 'Cộng điểm', bar); b1.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().skillUp(k2.id); }); }
        if (st2.lv > 0 && !k2.passive) {
          var b2 = h('button', '', 'Gán chuột phải', bar); b2.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().assignSkill('right', k2.id); });
          var b3 = h('button', '', 'Gán chuột trái', bar); b3.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().assignSkill('left', k2.id); });
          var b4 = h('button', '', 'Gán F-phím', bar); b4.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().bindFree(k2.id); });
        }
      }
    } else det.innerHTML = '<span class="dim">Chạm kỹ năng để xem. Chạm lần nữa (hoặc nút +) để cộng điểm.</span>';
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
  function renderQuest() {
    var p = UI.panels.quest, s = S(), c = s.char;
    var q0 = pin(p, PN('quest'), 80, 60);
    title(q0, 'Nhiệm vụ - Act I', 0, 3, 320);
    var q = c.quests.den_of_evil, txt;
    if (!q) txt = 'Chưa nhận. Hãy nói chuyện với Akara ở Rogue Encampment.';
    else if (q === 'active') txt = 'Akara nhờ bạn dọn sạch quái ở Den of Evil (hang ở Blood Moor). Còn <b>' + (s.denLeft == null ? '?' : s.denLeft) + '</b> con.';
    else if (q === 'cleared') txt = 'Den of Evil đã sạch. Quay về báo cho Akara để nhận 1 điểm kỹ năng.';
    else txt = 'Hoàn thành. Phần thưởng đã nhận: 1 điểm kỹ năng.';
    var list = box(q0, 'qlist', 10, 34, 300, 190, '');
    h('div', 'quest ' + (q === 'done' ? 'done' : ''), '<b>Den of Evil</b><br>' + txt, list);
    h('div', 'quest dim', '<b>Sisters\' Burial Grounds</b><br>Chưa mở khoá (sau MVP).', list);
    closeBtn(q0, p, 278, 390);
  }

  /* ---------------------------------------------------- NPC & cửa hàng */
  UI.openDialog = function (npc, def) {
    UI.dlg = npc; var el = UI.dlgEl; el.style.display = 'block'; el.innerHTML = '';
    h('div', 'dname', esc(def.name), el);
    h('div', 'dtext', def.text, el);
    var bar = h('div', 'dbtns', '', el);
    def.buttons.forEach(function (b) {
      var e = h('button', '', esc(b.label), bar);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); b.fn(); });
    });
    var x = h('button', 'dclose', 'Đóng', bar); x.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.closeDialog(); });
  };
  UI.closeDialog = function () { UI.dlg = null; UI.dlgEl.style.display = 'none'; UI.closeShop(); };
  UI.openShop = function (stock) {
    UI.shop = stock; UI.shopEl.style.display = 'block'; UI.dlgEl.style.display = 'none';
    if (!UI.open.inv) UI.toggle('inv');
    UI.renderShop();
  };
  UI.closeShop = function () { UI.shop = null; UI.shopEl.style.display = 'none'; UI.tip(null); };
  UI.renderShop = function () {
    var p = UI.shopEl, c = S().char;
    var q = pin(p, PN('npc_trade'), 80, 60);
    title(q, (UI.shopName || 'Cửa hàng') + ' - Vàng ' + c.gold, 0, 3, 320);
    var grid = box(q, 'grid', 16, 63, 10 * CELL, 10 * CELL, ''), occ = [];
    function fits(x, y, w, hh) {
      if (x + w > 10 || y + hh > 10) return false;
      for (var j = 0; j < hh; j++) for (var i = 0; i < w; i++) if (occ[(y + j) * 10 + x + i]) return false;
      return true;
    }
    UI.shop.forEach(function (it) {
      var w = it.w || 1, hh = it.h || 1, px = -1, py = -1, x, y;
      for (y = 0; y < 10 && py < 0; y++) for (x = 0; x < 10; x++) if (fits(x, y, w, hh)) { px = x; py = y; break; }
      if (py < 0) return;
      for (var j = 0; j < hh; j++) for (var i = 0; i < w; i++) occ[(py + j) * 10 + px + i] = 1;
      var row = h('div', 'shoprow', '', grid);
      row.style.cssText = 'left:' + (px * CELL) + 'px;top:' + (py * CELL) + 'px;width:' + (w * CELL) + 'px;height:' + (hh * CELL) + 'px';
      var ie = itemEl(it, CELL); ie.style.cssText += ';position:absolute;left:0;top:0'; row.appendChild(ie);
      var price = DA().buyPrice(it);
      var b = h('button', 'price' + (c.gold >= price ? '' : ' off'), String(price), row);
      b.title = esc(DA().itemName(it).replace(/\n/g, ' ')) + ' - ' + price + ' vàng';
      function buy(e) { e.stopPropagation(); G().buyItem(it); }
      b.addEventListener('pointerdown', buy); row.addEventListener('pointerdown', buy);
      hoverTip(row, function () { return itemTipHtml(it); });
    });
    box(q, 'hint', 16, 360, 186, 18, 'Chọn đồ trong túi bên phải, bấm "Bán".');
    closeBtn(q, p, 272, 385);
  };

  /* -------------------------------------------------------- popup kỹ năng */
  UI.skillPopup = function (which) {
    var s = S(), c = s.char, pop = UI.popup;
    if (pop.style.display === 'block' && pop.dataset.w === which) { pop.style.display = 'none'; return; }
    pop.dataset.w = which; pop.innerHTML = ''; pop.style.display = 'block';
    pop.style[which === 'left' ? 'left' : 'right'] = '150px'; pop.style[which === 'left' ? 'right' : 'left'] = 'auto';
    var ids = [null].concat(DA().skillsOf(c.cls).filter(function (k) { return (c.skills[k.id] || 0) > 0 && !k.passive; }).map(function (k) { return k.id; }));
    ids.forEach(function (id) {
      var e = h('div', 'pk', skIconHtml(id, 40) + '<small>' + esc(id ? DA().skill(id).name : 'Đánh thường') + '</small>', pop);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); G().assignSkill(which, id); pop.style.display = 'none'; });
    });
  };

  /* ---------------------------------------------------------- menu Esc */
  UI.toggleMenu = function () {
    if (UI.open.menu) { UI.open.menu = false; UI.menuEl.style.display = 'none'; return; }
    if (UI.anyOpen() && !UI.open.menu) { UI.closeAll(); return; }
    UI.open.menu = true; var m = UI.menuEl; m.style.display = 'block'; m.innerHTML = '<h3>Tạm dừng</h3>';
    function b(label, fn) { var e = h('button', '', label, m); e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); fn(); }); }
    b('Tiếp tục', function () { UI.toggleMenu(); });
    b('Lưu trò chơi', function () { G().save(); UI.msg('Đã lưu.'); UI.toggleMenu(); });
    b(D2.E.muted ? 'Bật âm thanh' : 'Tắt âm thanh', function () { D2.E.muted = !D2.E.muted; D2.E.music(null); if (!D2.E.muted) G().playAreaMusic(); UI.toggleMenu(); });
    b('Về màn hình chính', function () { UI.toggleMenu(); G().toTitle(); });
  };

  /* ---------------------------------------------------------- bản đồ */
  UI.drawMap = function () {
    var s = S(), g = s.grid, cv = UI.mapEl, c = cv.getContext('2d'), E = D2.E;
    c.clearRect(0, 0, 960, 540); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, 960, 540);
    if (!g || !s.hero) return;
    var k = g.w > 120 ? 2 : 3, hx = s.hero.x, hy = s.hero.y;
    function P(x, y) { return [480 + ((x - hx) - (y - hy)) * k, 270 + ((x - hx) + (y - hy)) * k * 0.5]; }
    var seen = g.seen;
    // lưới 200x200: không fillRect từng ô mỗi khung; ô mới thấy được ghi vào một ảnh 1 px/ô, vẽ bằng một phép biến đổi iso
    var mc = g._mapCv;
    if (!mc) {
      mc = g._mapCv = document.createElement('canvas'); mc.width = g.w; mc.height = g.h;
      g._mapCtx = mc.getContext('2d'); g._mapDone = new Uint8Array(g.w * g.h);
    }
    var mx = g._mapCtx, done = g._mapDone, n = g.w * g.h, i, x, y;
    for (i = 0; i < n; i++) {
      if (!seen[i] || done[i]) continue;
      done[i] = 1; x = i % g.w; y = (i - x) / g.w;
      var col = g.col[i];
      mx.fillStyle = col === 1 ? 'rgba(200,200,200,.8)' : col === 2 ? 'rgba(60,110,200,.6)' : 'rgba(120,90,40,.35)';
      mx.fillRect(x, y, 1, 1);
    }
    c.save(); c.imageSmoothingEnabled = false;
    c.setTransform(k, k * 0.5, -k, k * 0.5, 480 - k * (hx - hy), 270 - k * 0.5 * (hx + hy));
    c.drawImage(mc, 0, 0); c.restore();
    g.exits.forEach(function (e) { var p = P(e.x, e.y); c.fillStyle = '#4f4'; c.fillRect(p[0] - 3, p[1] - 3, 7, 7); });
    g.npcs.forEach(function (n) { var p = P(n.x, n.y); c.fillStyle = '#6cf'; c.fillRect(p[0] - 2, p[1] - 2, 5, 5); });
    s.ents.forEach(function (e) { if (e.kind === 'mon' && e.st !== 'dead' && e.st !== 'die' && seen[(e.y | 0) * g.w + (e.x | 0)]) { var p = P(e.x, e.y); c.fillStyle = '#f33'; c.fillRect(p[0] - 1, p[1] - 1, 3, 3); } });
    c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(474, 270); c.lineTo(486, 270); c.moveTo(480, 264); c.lineTo(480, 276); c.stroke();
    c.fillStyle = '#ddd'; c.font = '14px serif'; c.textAlign = 'left'; c.fillText(s.areaName || '', 16, 28);
  };

  /* ------------------------------------------------------ màn hình đầu */
  UI.showLoad = function (on, text) { UI.loadEl.style.display = on ? 'flex' : 'none'; if (text) $('.lt', UI.loadEl).textContent = text; };
  UI.showTitle = function (hasSave) {
    var el = UI.titleEl; el.style.display = 'flex'; el.innerHTML = '';
    h('div', 'logo', 'ÁC QUỶ II', el); h('div', 'logo2', 'Diablo II · Act I', el);
    var m = h('div', 'tmenu', '', el);
    function b(label, fn) { var e = h('button', '', label, m); e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); D2.E.audioUnlock(); fn(); }); return e; }
    if (hasSave) b('Tiếp tục', function () { el.style.display = 'none'; G().continueGame(); });
    b('Trò chơi mới', function () { UI.showClassSelect(); });
    h('div', 'credit', 'Art &amp; âm thanh: Flare (CC-BY-SA 3.0). Luật chơi theo số liệu Diablo II công khai.', el);
  };
  UI.hideTitle = function () { UI.titleEl.style.display = 'none'; };
  UI.showClassSelect = function () {
    var el = UI.titleEl; el.innerHTML = ''; h('div', 'logo2', 'Chọn nhân vật', el);
    var row = h('div', 'classes', '', el), picked = null;
    var info = h('div', 'cinfo', 'Chọn một nhân vật.', el);
    var nameRow = h('div', 'namerow', '<input id="pname" maxlength="15" placeholder="Tên nhân vật" autocomplete="off"><button id="pgo" class="go">Bắt đầu</button>', el);
    $('#pgo', nameRow).style.opacity = .5;
    DA().classList().forEach(function (cl) {
      var e = h('div', 'ccard' + (cl.locked ? ' locked' : ''), '<b>' + esc(cl.name) + '</b><small>' + (cl.locked ? 'Khoá' : esc(cl.blurb || '')) + '</small>', row);
      e.dataset.cls = cl.id;
      e.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation(); D2.E.audioUnlock();
        if (cl.locked) { info.textContent = cl.name + ' bị khoá trong bản này.'; return; }
        picked = cl.id; [].forEach.call(row.children, function (x) { x.classList.remove('on'); }); e.classList.add('on');
        info.textContent = cl.name + ': ' + (cl.blurb || ''); $('#pname', nameRow).value = $('#pname', nameRow).value || cl.name;
        $('#pgo', nameRow).style.opacity = 1;
      });
    });
    $('#pgo', nameRow).addEventListener('pointerdown', function (ev) {
      ev.stopPropagation(); if (!picked) return;
      var nm = ($('#pname', nameRow).value || '').trim() || picked;
      el.style.display = 'none'; G().newGame(picked, nm);
    });
    var back = h('button', 'back', 'Quay lại', el); back.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.showTitle(G().hasSave()); });
  };
  UI.showDead = function (on, cb) {
    var el = UI.deadEl; el.style.display = on ? 'flex' : 'none'; if (!on) return;
    el.innerHTML = '<div class="logo2" style="color:#c33">Bạn đã chết</div>';
    var b = h('button', 'go', 'Hồi sinh ở Rogue Encampment', el);
    b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); el.style.display = 'none'; cb(); });
  };
})();
