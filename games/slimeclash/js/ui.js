/*
 * SlimeClash — render và thao tác.
 *
 * Thao tác: KÉO một quân sang ô khác (ô trống thì dời, ô có quân thì đổi chỗ) — giống
 * game merge. Không còn "chạm quân rồi chạm cột", không còn bộ đếm lượt nạp trên đầu quân.
 *
 * Ô cờ vẽ ĐÚNG KHUNG THEO CẤP: dải sprite 6 khung, cấp k dùng khung k. Gộp lên cấp là
 * thấy con vật lột xác ngay — đó là phần thưởng thị giác của cả cơ chế gộp.
 */
(function (root) {
  'use strict';

  var CFG = root.CFG, DATA = root.DATA;
  var $ = function (id) { return document.getElementById(id); };

  var UI = {};

  UI.toast = function (msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(function () { t.classList.remove('on'); }, 1700);
  };

  UI.show = function (id) {
    ['s-home', 's-battle', 's-deck', 's-upgrade', 's-shop'].forEach(function (s) {
      $(s).classList.toggle('on', s === id);
    });
    var nav = $('navbar');
    nav.style.display = (id === 's-battle') ? 'none' : '';
    var btns = nav.querySelectorAll('.nav');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].dataset.nav === id);
    }
    document.body.classList.toggle('in-battle', id === 's-battle');
    window.scrollTo(0, 0);
  };

  UI.dialog = function (html, onClose) {
    $('dialog').innerHTML = html;
    $('overlay').classList.add('on');
    UI._onClose = onClose || null;
  };
  UI.closeDialog = function () {
    $('overlay').classList.remove('on');
    var f = UI._onClose; UI._onClose = null;
    if (f) f();
  };

  // Lực chiến — BattlePower trong TopViewMain của bản gốc.
  UI.battlePower = function (s) {
    var sum = 0;
    (s.deck || []).forEach(function (id) {
      var h = DATA.BY_ID[id];
      if (!h) return;
      var lv = (s.owned[id] && s.owned[id].level) || 1;
      var st = DATA.statAt(h, lv);
      sum += st.power * 3 + st.hp * 2;
    });
    return Math.round(sum * CFG.metaPowerMul(s.heroLevel));
  };

  UI.renderTop = function (s) {
    $('pl-level').textContent = 'Lv.' + s.heroLevel;
    $('pl-power').textContent = '⚔ ' + UI.battlePower(s);
    var lead = (s.deck && s.deck[0]) || DATA.starterIds[0];
    var head = root.Atlas && root.Atlas.head(lead);
    $('pl-avatar').style.backgroundImage = head ? 'url(' + JSON.stringify(head) + ')' : '';
    $('r-gold').textContent = s.gold;
    $('r-gem').textContent = s.gem;
    $('r-shard').textContent = s.shards;
    $('r-ticket').textContent = s.tickets;
  };

  // ---------------------------------------------------------------- bàn cờ

  function cellEl(u, r, c) {
    var d = document.createElement('div');
    d.className = 'cell' + (u ? ' u-' + u.color : ' empty');
    d.dataset.r = r; d.dataset.c = c;
    if (!u) return d;

    var style = root.Atlas && root.Atlas.unitStyle(u.heroId, u.grade);
    if (style) {
      var im = document.createElement('i');
      im.className = 'art';
      im.setAttribute('style', style);
      d.appendChild(im);
      d.classList.add('has-art');
    }
    if (u.grade > 1) {
      var g = document.createElement('u');
      g.className = 'grade';
      g.textContent = u.grade;
      d.appendChild(g);
    }
    var hpPct = Math.max(0, u.hp / u.maxHp);
    if (hpPct < 1) {
      var bar = document.createElement('s');
      bar.className = 'uhp';
      bar.style.width = (hpPct * 100) + '%';
      d.appendChild(bar);
    }
    d.title = u.name + ' · cấp ' + u.grade + ' · lực ' + u.power +
              ' · máu ' + u.hp + '/' + u.maxHp;
    return d;
  }

  UI.renderBoard = function (battle) {
    var mine = $('board-mine');
    mine.innerHTML = '';
    for (var r = 0; r < battle.board.rows; r++) {
      for (var c = 0; c < battle.board.cols; c++) {
        var el = cellEl(battle.board.get(r, c), r, c);
        if (c === battle.foe.targetCol) el.classList.add('threat');
        mine.appendChild(el);
      }
    }
    var tb = $('threatbar');
    tb.innerHTML = '';
    for (var i = 0; i < battle.board.cols; i++) {
      var s = document.createElement('span');
      s.className = 'tm' + (i === battle.foe.targetCol ? ' on' : '');
      s.textContent = i === battle.foe.targetCol ? '▼' : '';
      tb.appendChild(s);
    }
  };

  UI.renderBattle = function (battle) {
    UI.renderBoard(battle);

    var f = battle.foe;
    $('foe-hp').style.width = Math.max(0, f.hp) / f.hpMax * 100 + '%';
    $('foe-hp-txt').textContent = Math.max(0, f.hp) + ' / ' + f.hpMax;
    $('foe-name').textContent = (battle.isBoss ? '☠ ' : '') + f.name;
    $('foe-atk').textContent = '⚔ ' + f.atk;
    var art = f.art && root.Atlas && root.Atlas.foe(f.art);
    $('foe-art').style.backgroundImage = art ? 'url(' + JSON.stringify(art) + ')' : '';
    $('foe-art').classList.toggle('boss', !!battle.isBoss);

    $('foe-intent').innerHTML = f.countdown <= 0
      ? '<b class="now">Đánh ngay khi hết bước — cột ' + (f.targetCol + 1) + '</b>'
      : 'Đánh cột <b>' + (f.targetCol + 1) + '</b> sau <b>' + f.countdown + '</b> bước';

    $('hud-step').textContent = battle.movesLeft;
    $('box-step').classList.toggle('low', battle.movesLeft === 0);
    $('hud-day').textContent = battle.day;

    $('me-hp').style.width = Math.max(0, battle.playerHp) / battle.playerHpMax * 100 + '%';
    $('me-hp-txt').textContent = Math.max(0, battle.playerHp) + ' / ' + battle.playerHpMax;
    $('me-energy').style.width = Math.min(100, battle.turn / battle.maxTurns * 100) + '%';

    UI.renderDayRail(battle.day);
    UI.renderLordButtons(battle);

    $('mid-note').innerHTML = 'Lực trên sân: <b>' + battle.totalPower() +
      '</b> · lượt ' + battle.turn + '/' + battle.maxTurns;

    $('skill-n').textContent = battle.skills.length;
    $('btn-skills').classList.toggle('primary', battle.skills.length > 0);
    $('btn-end').textContent = battle.movesLeft > 0
      ? 'Đánh (còn ' + battle.movesLeft + ' bước)' : 'Đánh';
  };

  UI.renderDayRail = function (day) {
    var rail = $('dayrail');
    var html = '';
    for (var d = 1; d <= CFG.chapter.daysPerChapter; d++) {
      var cls = 'd';
      if (d < day) cls += ' done';
      if (d === day) cls += ' now';
      if (CFG.isBossDay(d)) cls += ' boss';
      html += '<span class="' + cls + '">' + d + '</span>';
    }
    rail.innerHTML = html;
    var now = rail.querySelector('.now');
    if (now && now.scrollIntoView) {
      try { now.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { }
    }
  };

  UI.renderLordButtons = function (battle) {
    [['skill-l', 0], ['skill-r', 1]].forEach(function (pair) {
      var el = $(pair[0]);
      var key = battle.skills[pair[1]];
      var def = key && DATA.SKILLS[key];
      el.textContent = def ? def.icon : '—';
      el.disabled = !def;
      el.classList.toggle('ready', !!def);
      el.title = def ? def.name + ' — ' + def.desc : 'chưa có kỹ năng';
      el.dataset.skill = def ? pair[1] : '';
    });
  };

  UI.skillsHtml = function (battle) {
    if (!battle.skills.length) {
      return '<h3>Kỹ năng</h3><p class="sub">Chưa có. Gộp quân để nhận — giữ tối đa ' +
        CFG.retainSkillLimit + '.</p><button class="btn primary" data-close>Đóng</button>';
    }
    var html = '<h3>Kỹ năng (' + battle.skills.length + '/' + CFG.retainSkillLimit +
               ')</h3><div class="list">';
    battle.skills.forEach(function (key, i) {
      var def = DATA.SKILLS[key] || { icon: '?', name: key, desc: '' };
      html += '<div class="item"><div class="grow"><div class="name">' + def.icon + ' ' + def.name +
              '</div><div class="meta">' + def.desc + '</div></div>' +
              '<button class="btn small primary" data-useskill="' + i + '">Dùng</button></div>';
    });
    return html + '</div><button class="btn ghost" data-close>Đóng</button>';
  };

  UI.logHtml = function (battle) {
    return '<div class="log">' +
      (battle.log.slice(-14).reverse().join('<br>') || 'chưa có gì') + '</div>';
  };

  /* ---------------------------------------------------------------- kéo thả
   * Kéo quân từ ô này sang ô khác. Ô trống -> dời; ô có quân -> đổi chỗ.
   * Vùng bắt CỐ Ý rộng: suy ô từ toạ độ trong bàn thay vì đòi thả trúng ô — trên màn
   * cảm ứng bắt thả chính xác từng ô là quá khắt khe.
   */
  UI.initDrag = function (getBattle, onChange, isErase) {
    var mine = $('board-mine');
    var st = null;

    function cellFromPoint(x, y) {
      var b = mine.getBoundingClientRect();
      if (x < b.left - 30 || x > b.right + 30 || y < b.top - 30 || y > b.bottom + 30) return null;
      var cols = CFG.board.cols, rows = CFG.board.rows;
      var c = Math.max(0, Math.min(cols - 1, Math.floor((x - b.left) / b.width * cols)));
      var r = Math.max(0, Math.min(rows - 1, Math.floor((y - b.top) / b.height * rows)));
      return { r: r, c: c };
    }

    function makeGhost(unit) {
      var g = document.createElement('div');
      g.className = 'drag-ghost u-' + unit.color;
      var style = root.Atlas && root.Atlas.unitStyle(unit.heroId, unit.grade);
      if (style) {
        var i = document.createElement('i');
        i.className = 'art';
        i.setAttribute('style', style);
        g.appendChild(i);
      }
      document.body.appendChild(g);
      return g;
    }

    function markTarget(p) {
      var cells = mine.children;
      for (var i = 0; i < cells.length; i++) cells[i].classList.remove('dropto');
      if (!p) return;
      var idx = p.r * CFG.board.cols + p.c;
      if (cells[idx]) cells[idx].classList.add('dropto');
    }

    function cleanup() {
      if (st && st.ghost && st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost);
      markTarget(null);
      var cells = mine.children;
      for (var i = 0; i < cells.length; i++) cells[i].classList.remove('dragging');
      st = null;
    }

    mine.addEventListener('pointerdown', function (e) {
      var battle = getBattle();
      if (!battle || battle.over) return;
      var cell = e.target.closest('.cell');
      if (!cell) return;
      st = {
        r: parseInt(cell.dataset.r, 10), c: parseInt(cell.dataset.c, 10),
        x: e.clientX, y: e.clientY, dragging: false, el: cell
      };
      try { mine.setPointerCapture(e.pointerId); } catch (err) { }
    });

    mine.addEventListener('pointermove', function (e) {
      if (!st) return;
      var battle = getBattle();
      if (!battle || battle.over) { cleanup(); return; }

      if (!st.dragging) {
        var dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (dx * dx + dy * dy < 64) return;               // ngưỡng 8px
        if (isErase && isErase()) return;                 // chế độ xoá dùng chạm
        if (!battle.canAct()) { UI.toast('Hết bước — bấm Đánh'); cleanup(); return; }
        var u = battle.board.get(st.r, st.c);
        if (!u) { cleanup(); return; }
        st.dragging = true;
        st.ghost = makeGhost(u);
        st.el.classList.add('dragging');
      }
      st.ghost.style.left = e.clientX + 'px';
      st.ghost.style.top = e.clientY + 'px';
      markTarget(cellFromPoint(e.clientX, e.clientY));
      e.preventDefault();
    });

    function finish(e) {
      if (!st) return;
      var battle = getBattle();
      var wasDrag = st.dragging, r = st.r, c = st.c;
      var p = wasDrag ? cellFromPoint(e.clientX, e.clientY) : null;
      cleanup();
      if (!battle || battle.over) return;
      if (wasDrag && p && !(p.r === r && p.c === c)) {
        battle.moveUnit(r, c, p.r, p.c);
        onChange();
      } else if (wasDrag) {
        onChange();          // thả lại chỗ cũ — không tốn bước
      }
    }

    mine.addEventListener('pointerup', finish);
    mine.addEventListener('pointercancel', function () { cleanup(); onChange(); });
  };

  // ---------------------------------------------------------------- nhà

  UI.renderHome = function (s, eco) {
    $('home-title').textContent = 'Chương ' + s.chapter + ' · Ngày ' + s.day;
    var boss = CFG.isBossDay(s.day);
    $('home-sub').innerHTML =
      (boss ? '☠ <b>Ngày BOSS.</b> ' : '') +
      'Máu quái ×' + CFG.hpRatio(s.chapter, s.day).toFixed(2) +
      ' · ngân sách <b>' + CFG.turnsFor(s.day) + ' lượt</b>' +
      ' · sức mạnh run ×' + CFG.runPowerMul(s.day).toFixed(2);
    $('home-prog').style.width = ((s.day - 1) / CFG.chapter.daysPerChapter * 100) + '%';
    $('home-cap-gold').textContent = 'Vàng chương: ' + (s.chapterGold || 0) +
      '/' + CFG.coinMaxFor(s.chapter);
    $('home-cap-card').textContent = 'Mảnh chương: ' + (s.chapterCards || 0) +
      '/' + CFG.cardMaxFor(s.chapter);
    $('btn-winbox').disabled = !eco.canWinBox();
    $('btn-winbox').textContent = 'Rương thắng trận (' +
      (CFG.economy.winBoxPerDay - (s.winBoxToday || 0)) + ' lần hôm nay)';

    var offer = eco.triggeredOffer();
    $('home-offer').innerHTML = offer
      ? '<div class="offer"><b>' + offer.name + '</b>' +
        '<div class="meta" style="font-size:12px;color:var(--dim);margin:4px 0 8px">' +
        offer.desc + '</div><button class="btn small primary" id="btn-offer">Nhận</button></div>'
      : '';
  };

  // ---------------------------------------------------------------- đội hình

  UI.renderDeck = function (s) {
    var list = $('deck-list');
    list.innerHTML = '';
    Object.keys(s.owned).forEach(function (idStr) {
      var id = parseInt(idStr, 10);
      var h = DATA.BY_ID[id];
      if (!h) return;
      var own = s.owned[id];
      var inDeck = s.deck.indexOf(id) >= 0;
      var st = DATA.statAt(h, own.level);
      var head = root.Atlas && root.Atlas.head(h.id);
      var el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        (head ? '<i class="thumb u-' + h.color + '" style="background-image:url(' +
                JSON.stringify(head) + ')"></i>' : '') +
        '<div class="grow"><div class="name">' + h.name +
        (h.named ? '' : '<span title="tên suy từ slug trong APK, chưa xác nhận">*</span>') +
        '<span class="tag ' + h.rarity + '">' + (DATA.RARITY_VI[h.rarity] || h.rarity) +
        '</span></div>' +
        '<div class="meta">' + DATA.COLOR_VI[h.color] + ' · cấp ' + own.level +
        ' · lực ' + st.power + ' · máu ' + st.hp + '</div></div>' +
        '<button class="btn small' + (inDeck ? '' : ' primary') + '" data-deck="' + id + '">' +
        (inDeck ? 'Bỏ ra' : 'Mang') + '</button>';
      list.appendChild(el);
    });
  };

  // ---------------------------------------------------------------- nâng cấp

  /* [TUNE] 60*L^2, KHÔNG phải 120*L^2 như bản đầu.
   * Vàng cả game bị chặn bởi coin_max mỗi chương [APK]: hết chương 2 người chơi mới
   * có tổng 460 vàng. Với giá cũ thì cấp 3 tốn 480 -> đứng nguyên cấp 2 suốt hai
   * chương đầu, và mô phỏng cho ra chương 2 chỉ 25% thắng trong khi chương 3 lại 100%.
   * Giá này cho nhịp ~1 cấp/chương ở đoạn đầu, khớp với enemyPowerChapterMul. */
  UI.heroUpCost = function (level) { return 60 * level * level; };
  UI.unitUpCost = function (level) { return 60 * level; };

  UI.renderUpgrade = function (s) {
    var cost = UI.heroUpCost(s.heroLevel);
    var maxed = s.heroLevel >= CFG.hero.maxLevel;
    $('up-hero').innerHTML =
      '<div class="name" style="font-size:15px;font-weight:600">Hero — cấp ' + s.heroLevel +
      ' / ' + CFG.hero.maxLevel + '</div>' +
      '<div class="meta" style="font-size:12px;color:var(--dim);margin:6px 0 10px">' +
      'Máu ' + CFG.playerMaxHp(s.heroLevel) + ' → ' +
      (maxed ? '—' : CFG.playerMaxHp(s.heroLevel + 1)) + ' · ' +
      'sức mạnh ×' + CFG.metaPowerMul(s.heroLevel).toFixed(2) + ' → ' +
      (maxed ? '—' : '×' + CFG.metaPowerMul(s.heroLevel + 1).toFixed(2)) + '</div>' +
      '<button class="btn small primary" id="btn-hero-up"' +
      (maxed || s.gold < cost ? ' disabled' : '') + '>' +
      (maxed ? 'Đã tối đa' : 'Nâng — 🪙' + cost) + '</button>';

    var list = $('up-units');
    list.innerHTML = '';
    s.deck.forEach(function (id) {
      var h = DATA.BY_ID[id], own = s.owned[id];
      if (!h || !own) return;
      var c = UI.unitUpCost(own.level);
      var full = own.level >= 5;
      var st = DATA.statAt(h, own.level);
      var head = root.Atlas && root.Atlas.head(h.id);
      var el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        (head ? '<i class="thumb u-' + h.color + '" style="background-image:url(' +
                JSON.stringify(head) + ')"></i>' : '') +
        '<div class="grow"><div class="name">' + h.name + '</div>' +
        '<div class="meta">cấp ' + own.level + '/5 · lực ' + st.power +
        ' · máu ' + st.hp + '</div></div>' +
        '<button class="btn small" data-unitup="' + id + '"' +
        (full || s.gold < c ? ' disabled' : '') + '>' +
        (full ? 'Tối đa' : '🪙' + c) + '</button>';
      list.appendChild(el);
    });
  };

  // ---------------------------------------------------------------- cửa hàng

  UI.renderShop = function (s, eco) {
    var list = $('shop-list');
    list.innerHTML = '';
    eco.packs().forEach(function (e) {
      var p = e.def, r = p.reward;
      var bits = [];
      if (r.gold) bits.push('🪙' + r.gold);
      if (r.gem) bits.push('💎' + r.gem);
      if (r.shard) bits.push('🧩' + r.shard);
      var el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        '<div class="grow"><div class="name">' + p.name +
        '<span class="price-old" style="margin-left:8px">$' + p.price.toFixed(2) + '</span>' +
        '<span class="price-free">MIỄN PHÍ</span></div>' +
        '<div class="meta">' + bits.join(' · ') +
        (p.ticket ? ' · tốn 1 🎫' : ' · không tốn phiếu') +
        (e.reason ? ' · <span style="color:var(--red)">' + e.reason + '</span>' : '') +
        '</div></div>' +
        '<button class="btn small primary" data-pack="' + p.id + '"' +
        (e.available ? '' : ' disabled') + '>Nhận</button>';
      list.appendChild(el);
    });
  };

  root.SlimeUI = UI;
})(window);
