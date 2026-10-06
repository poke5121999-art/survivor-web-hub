/* Ác Quỷ II - ui.js
 * HUD kiểu D2 + các bảng (nhân vật, túi đồ, cây kỹ năng, NPC/cửa hàng, nhật ký, bản đồ, menu, màn hình đầu).
 * DOM phủ lên canvas, nằm trong #stage 960x540 nên co giãn cùng canvas.
 * UI chỉ ĐỌC trạng thái từ D2.Game.S và gọi hàm của D2.Game (statUp, skillUp, equipItem ...).
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

  var QCOL = { normal: '#e8e8e8', superior: '#d8d8d8', low: '#8a8a8a', magic: '#6e7bff', rare: '#ffe45a', unique: '#c7b377', set: '#2fd12f', crafted: '#ff9a2e' };
  UI.qcol = function (q) { return QCOL[q] || QCOL.normal; };

  var SLOTS = [
    { id: 'head', t: 'Mũ', x: 150, y: 6, w: 58, h: 58 }, { id: 'amulet', t: 'Dây chuyền', x: 222, y: 20, w: 30, h: 30 },
    { id: 'rhand', t: 'Tay phải', x: 14, y: 64, w: 58, h: 100 }, { id: 'body', t: 'Áo giáp', x: 150, y: 72, w: 58, h: 86 },
    { id: 'lhand', t: 'Tay trái', x: 286, y: 64, w: 58, h: 100 }, { id: 'gloves', t: 'Găng', x: 80, y: 172, w: 58, h: 52 },
    { id: 'belt', t: 'Đai', x: 150, y: 172, w: 58, h: 28 }, { id: 'boots', t: 'Giày', x: 220, y: 172, w: 58, h: 52 },
    { id: 'ring1', t: 'Nhẫn', x: 112, y: 202, w: 30, h: 30 }, { id: 'ring2', t: 'Nhẫn', x: 216, y: 202, w: 30, h: 30 }
  ];
  var CELL = 30;

  /* ------------------------------------------------------------------ dựng */
  UI.init = function (stage) {
    var r = UI.root = h('div', 'ui', null, stage);
    r.id = 'ui';
    buildHud(r);
    UI.panels = {};
    ['inv', 'char', 'skill', 'quest', 'stash'].forEach(function (id) {
      var p = h('div', 'panel ' + id, '', r); p.id = 'p-' + id; p.style.display = 'none';
      UI.panels[id] = p;
    });
    UI.panels.inv.classList.add('right'); ['char', 'skill', 'quest', 'stash'].forEach(function (k) { UI.panels[k].classList.add('left'); });
    UI.dlgEl = h('div', 'dialog', '', r); UI.dlgEl.style.display = 'none';
    UI.shopEl = h('div', 'panel left shop', '', r); UI.shopEl.style.display = 'none';
    UI.wpEl = h('div', 'modal wpmenu', '', r); UI.wpEl.style.display = 'none';
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
    UI.lifeOrb = h('div', 'orb life', '<div class="fill"></div><div class="lab"></div>', hud);
    UI.manaOrb = h('div', 'orb mana', '<div class="fill"></div><div class="lab"></div>', hud);
    UI.xpBar = h('div', 'xpbar', '<i></i>', hud);
    UI.stamBar = h('div', 'stam', '<i></i>', hud);
    UI.belt = h('div', 'belt', '', hud);
    UI.lskill = h('div', 'skbtn left', '', hud); UI.rskill = h('div', 'skbtn right', '', hud);
    UI.lskill.title = 'Kỹ năng chuột trái'; UI.rskill.title = 'Kỹ năng chuột phải';
    UI.lskill.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skillPopup('left'); });
    UI.rskill.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skillPopup('right'); });
    UI.hudBtns = h('div', 'hudbtns', '', hud);
    [['I', 'Túi', 'inv'], ['C', 'NV', 'char'], ['T', 'KN', 'skill'], ['Q', 'NVụ', 'quest']].forEach(function (b) {
      var e = h('button', 'hb', b[1] + '<small>' + b[0] + '</small>', UI.hudBtns);
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.toggle(b[2]); });
    });
    UI.lvlPts = h('div', 'ptsflag', '', hud);
    UI.lvlPts.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.toggle(S().char.statPts > 0 ? 'char' : 'skill'); });
    UI.mon = h('div', 'monbar', '<span></span><div><i></i></div>', hud);
    UI._last = {};
  }

  /* ----------------------------------------------------------- HUD mỗi khung */
  UI.showHud = function (on) { UI.hud.style.display = on ? 'block' : 'none'; };
  UI.update = function (t) {
    var s = S(); if (!s || !s.char) return;
    var c = s.char, d = s.d || {}, L = UI._last;
    var mh = Math.max(1, d.maxHp || c.hp), mm = Math.max(1, d.maxMp || c.mp);
    var lp = Math.round(Math.max(0, c.hp) / mh * 100), mp = Math.round(Math.max(0, c.mp) / mm * 100);
    if (L.lp !== lp) { L.lp = lp; $('.fill', UI.lifeOrb).style.height = lp + '%'; }
    if (L.mp !== mp) { L.mp = mp; $('.fill', UI.manaOrb).style.height = mp + '%'; }
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
    UI.lskill.innerHTML = skIconHtml(s.leftSkill, 44) + '<small>' + esc(l.name) + '</small>';
    UI.rskill.innerHTML = skIconHtml(s.rightSkill, 44) + '<small>' + esc(r.name) + '</small>';
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
        if (it) { slot.appendChild(itemEl(it, 30)); slot.title = DA().itemName(it); }
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
    var lootSt = DA().iconBox(it, (abs === false ? 1 : w) * cell - 2, (abs === false ? 1 : hgt) * cell - 2);
    if (lootSt) {
      var li = h('div', 'iimg', '', e); li.style.cssText = lootSt + 'left:50%;top:50%;margin:0;transform:translate(-50%,-50%);';
    } else {
      e.textContent = DA().itemName(it).replace(/[^A-Za-zÀ-ỹ ]/g, '').split(' ').map(function (x) { return x[0]; }).join('').slice(0, 3);
    }
    e.style.color = UI.qcol(it.q);
    e.style.borderColor = UI.qcol(it.q);
    return e;
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
  function head(p, title) {
    var hd = h('div', 'phead', esc(title) + '<button class="x">X</button>', p);
    $('.x', hd).addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.closePanelOf(p); });
  }
  UI.closePanelOf = function (p) {
    Object.keys(UI.panels).forEach(function (k) { if (UI.panels[k] === p) { UI.open[k] = false; p.style.display = 'none'; } });
    if (p === UI.shopEl) UI.closeShop();
  };

  /* -------------------------------------------------------- bảng nhân vật */
  function renderChar() {
    var p = UI.panels.char, s = S(), c = s.char, d = s.d; p.innerHTML = '';
    head(p, 'Nhân vật');
    var nm = DA().className(c.cls);
    h('div', 'sub', esc(c.name) + ' - ' + esc(nm) + ' - Cấp ' + c.lvl, p);
    h('div', 'row', 'Kinh nghiệm <b>' + c.xp + '</b> / ' + DA().xpFor(c.lvl + 1), p);
    h('div', 'row', 'Vàng <b style="color:#ffd24a">' + c.gold + '</b>', p);
    var t = h('table', 'stats', '', p);
    [['str', 'Sức mạnh'], ['dex', 'Nhanh nhẹn'], ['vit', 'Sinh lực'], ['ene', 'Năng lượng']].forEach(function (a) {
      var tr = h('tr', '', '<td>' + a[1] + '</td><td class="v">' + c[a[0]] + '</td><td></td>', t);
      if (c.statPts > 0) {
        var b = h('button', 'plus', '+', $('td:last-child', tr));
        b.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().statUp(a[0]); });
      }
    });
    h('div', 'row pts', 'Điểm chỉ số còn lại <b>' + c.statPts + '</b> &nbsp; Điểm kỹ năng <b>' + c.skillPts + '</b>', p);
    var res = d.res || {};
    h('div', 'derived', [
      'Sinh lực <b>' + Math.ceil(c.hp) + '/' + d.maxHp + '</b>', 'Mana <b>' + Math.ceil(c.mp) + '/' + d.maxMp + '</b>',
      'Sát thương <b>' + Math.round(d.dmgMin) + '-' + Math.round(d.dmgMax) + '</b>', 'Độ chính xác <b>' + Math.round(d.ar) + '</b>',
      'Phòng thủ <b>' + Math.round(d.def) + '</b>', 'Tốc đánh <b>' + d.atkFrames + ' khung</b>',
      'Kháng <span style="color:#f55">lửa ' + (res.fire || 0) + '</span> <span style="color:#6cf">lạnh ' + (res.cold || 0) +
      '</span> <span style="color:#ff6">sét ' + (res.light || 0) + '</span> <span style="color:#7d7">độc ' + (res.poison || 0) + '</span>'
    ].join('<br>'), p);
  }

  /* ------------------------------------------------------------- túi đồ */
  function renderInv() {
    var p = UI.panels.inv, s = S(), c = s.char; p.innerHTML = '';
    head(p, 'Túi đồ');
    var eq = h('div', 'equip', '', p);
    SLOTS.forEach(function (sl) {
      var cell = h('div', 'eslot', '<small>' + sl.t + '</small>', eq);
      cell.style.cssText = 'left:' + sl.x + 'px;top:' + sl.y + 'px;width:' + sl.w + 'px;height:' + sl.h + 'px';
      var it = c.equip[sl.id];
      if (it) {
        var e = itemEl(it, 28, false); e.style.cssText += ';position:absolute;inset:2px;width:auto;height:auto';
        cell.appendChild(e);
        hoverTip(cell, function () { return itemTipHtml(it); });
        cell.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.select({ item: it, equipped: sl.id }); });
      }
    });
    var grid = h('div', 'grid', '', p);
    grid.style.width = (10 * CELL) + 'px'; grid.style.height = (4 * CELL) + 'px';
    var rect = h('div', 'gridbg', '', grid);
    for (var i = 0; i < 40; i++) h('i', '', '', rect);
    c.inv.forEach(function (it) {
      var e = itemEl(it, CELL); e.style.cssText += ';position:absolute;left:' + (it.ix * CELL) + 'px;top:' + (it.iy * CELL) + 'px';
      if (UI.sel && UI.sel.item === it) e.classList.add('sel');
      grid.appendChild(e);
      hoverTip(e, function () { return itemTipHtml(it); });
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.select({ item: it }); });
    });
    h('div', 'gold', 'Vàng: <b>' + c.gold + '</b>', p);
    var det = h('div', 'detail', '', p);
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
    var p = UI.panels.stash, c = S().char, CW = D2.Game.stashCols, RW = D2.Game.stashRows; p.innerHTML = '';
    head(p, 'Kho đồ');
    var grid = h('div', 'grid', '', p);
    grid.style.width = (CW * CELL) + 'px'; grid.style.height = (RW * CELL) + 'px';
    var rect = h('div', 'gridbg', '', grid); rect.style.gridTemplateColumns = 'repeat(' + CW + ',' + CELL + 'px)'; rect.style.gridTemplateRows = 'repeat(' + RW + ',' + CELL + 'px)';
    for (var i = 0; i < CW * RW; i++) h('i', '', '', rect);
    (c.stash || []).forEach(function (it) {
      var e = itemEl(it, CELL); e.style.cssText += ';position:absolute;left:' + (it.ix * CELL) + 'px;top:' + (it.iy * CELL) + 'px';
      if (UI.stSel === it) e.classList.add('sel');
      grid.appendChild(e);
      hoverTip(e, function () { return itemTipHtml(it); });
      e.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.stSel = it; renderStash(); });
    });
    var det = h('div', 'detail', '', p); det.style.minHeight = '40px';
    if (UI.stSel && (c.stash || []).indexOf(UI.stSel) < 0) UI.stSel = null;
    if (UI.stSel) {
      det.innerHTML = itemTipHtml(UI.stSel);
      var bar = h('div', 'acts', '', det), b = h('button', '', 'Lấy ra', bar);
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().stashOut(UI.stSel); });
    } else det.innerHTML = '<span class="dim">Chọn đồ trong túi rồi bấm "Cất vào kho".</span>';
  }
  UI.openWaypoints = function () {
    var m = UI.wpEl, list = G().visitedWaypoints(), here = S().areaId;
    UI.open.wp = true; m.style.display = 'block'; m.innerHTML = '<h3>Waypoint</h3>';
    list.forEach(function (w) {
      var b = h('button', w.id === here ? 'off' : '', esc(w.name) + (w.id === here ? ' (đang ở đây)' : ''), m);
      b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); G().travelWaypoint(w.id); });
    });
    var x = h('button', '', 'Đóng', m); x.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); UI.closeWaypoints(); });
  };
  UI.closeWaypoints = function () { UI.open.wp = false; if (UI.wpEl) UI.wpEl.style.display = 'none'; };

  /* ------------------------------------------------------- cây kỹ năng */
  function skillState(sk) {
    var s = S(), c = s.char, lv = c.skills[sk.id] || 0;
    var cl = D2R.canLearn(c, sk.id);
    return { lv: lv, can: !!cl.ok, why: cl.why };
  }
  function renderSkill() {
    var p = UI.panels.skill, s = S(), c = s.char; p.innerHTML = '';
    head(p, 'Cây kỹ năng');
    var tabs = DA().tabNames(c.cls), tb = h('div', 'tabs', '', p);
    tabs.forEach(function (n, i) {
      var b = h('button', i === UI.skTab ? 'on' : '', esc(n), tb);
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); UI.skTab = i; renderSkill(); });
    });
    h('div', 'sub', 'Điểm kỹ năng: <b>' + c.skillPts + '</b>', p);
    var tree = h('div', 'tree', '', p);
    var list = DA().skillsOf(c.cls).filter(function (k) { return k.tab === UI.skTab; });
    var svg = '<svg width="340" height="270">', COLW = 112, ROWH = 44, pos = {};
    list.forEach(function (k) { pos[k.id] = { x: 14 + k.col * COLW + 21, y: 4 + k.row * ROWH + 21 }; });
    list.forEach(function (k) { k.prereq.forEach(function (q) { var a = pos[q], b = pos[k.id]; if (a && b) svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + ((c.skills[q] || 0) > 0 ? '#c9a24a' : '#554') + '" stroke-width="2"/>'; }); });
    tree.innerHTML = svg + '</svg>';
    list.forEach(function (k) {
      var st = skillState(k), e = h('div', 'sknode' + (st.lv > 0 ? ' on' : '') + (st.can ? ' can' : '') + (UI.sel && UI.sel.skill === k.id ? ' sel' : ''), '', tree);
      e.style.left = (14 + k.col * COLW) + 'px'; e.style.top = (4 + k.row * ROWH) + 'px';
      e.innerHTML = skIconHtml(k.id, 38) + '<b>' + st.lv + '</b>';
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
    var det = h('div', 'detail', '', p);
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
    var p = UI.panels.quest, s = S(), c = s.char; p.innerHTML = '';
    head(p, 'Nhiệm vụ - Act I');
    var q = c.quests.den_of_evil, txt;
    if (!q) txt = 'Chưa nhận. Hãy nói chuyện với Akara ở Rogue Encampment.';
    else if (q === 'active') txt = 'Akara nhờ bạn dọn sạch quái ở Den of Evil (hang ở Blood Moor). Còn <b>' + (s.denLeft == null ? '?' : s.denLeft) + '</b> con.';
    else if (q === 'cleared') txt = 'Den of Evil đã sạch. Quay về báo cho Akara để nhận 1 điểm kỹ năng.';
    else txt = 'Hoàn thành. Phần thưởng đã nhận: 1 điểm kỹ năng.';
    h('div', 'quest ' + (q === 'done' ? 'done' : ''), '<b>Den of Evil</b><br>' + txt, p);
    h('div', 'quest dim', '<b>Sisters\' Burial Grounds</b><br>Chưa mở khoá (sau MVP).', p);
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
    var p = UI.shopEl, c = S().char; p.innerHTML = '';
    head(p, (UI.shopName || 'Cửa hàng') + ' - Vàng ' + c.gold);
    var g = h('div', 'shoplist', '', p);
    UI.shop.forEach(function (it) {
      var row = h('div', 'shoprow', '', g);
      var ie = itemEl(it, 28, false); ie.style.cssText += ';position:relative;flex:none;width:34px;height:34px'; row.appendChild(ie);
      h('span', 'nm', esc(DA().itemName(it).replace(/\n/g, ' ')), row);
      var b = h('button', c.gold >= DA().buyPrice(it) ? '' : 'off', DA().buyPrice(it) + ' vàng', row);
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); G().buyItem(it); });
      hoverTip(row, function () { return itemTipHtml(it); });
    });
    h('div', 'dim', 'Chọn đồ trong túi bên phải rồi bấm "Bán".', p);
  };

  /* -------------------------------------------------------- popup kỹ năng */
  UI.skillPopup = function (which) {
    var s = S(), c = s.char, pop = UI.popup;
    if (pop.style.display === 'block' && pop.dataset.w === which) { pop.style.display = 'none'; return; }
    pop.dataset.w = which; pop.innerHTML = ''; pop.style.display = 'block';
    pop.style[which === 'left' ? 'left' : 'right'] = '60px'; pop.style[which === 'left' ? 'right' : 'left'] = 'auto';
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
