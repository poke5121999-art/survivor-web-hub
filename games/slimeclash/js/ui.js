/*
 * SlimeClash — render và thao tác chạm.
 *
 * Thao tác giữ đúng cơ chế nhặt–thả của Clash of Heroes (KHÔNG đổi sang swap-2-ô kiểu
 * match-3 thường — xem _research/00-tong-hop-thiet-ke.md mục 3.3):
 *   chạm quân rảnh  -> nhấc lên
 *   chạm cột        -> thả xuống, tốn 1 bước
 *   chạm lại quân   -> bỏ nhấc, KHÔNG tốn bước
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
    // Thanh điều hướng ẩn khi đang đánh — bản gốc cũng che NavigatorBar trong GamePlayLayer.
    var nav = $('navbar');
    nav.style.display = (id === 's-battle') ? 'none' : '';
    var btns = nav.querySelectorAll('.nav');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].dataset.nav === id);
    }
    document.body.classList.toggle('in-battle', id === 's-battle');
    window.scrollTo(0, 0);
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

  UI.renderTop = function (s) {
    $('pl-level').textContent = 'Lv.' + s.heroLevel;
    $('pl-power').textContent = '⚔ ' + UI.battlePower(s);
    var lead = (s.deck && s.deck[0]) || DATA.starterIds[0];
    var art = root.Atlas && root.Atlas.unit(lead);
    $('pl-avatar').style.backgroundImage = art ? 'url(' + JSON.stringify(art) + ')' : '';
    $('r-gold').textContent = s.gold;
    $('r-gem').textContent = s.gem;
    $('r-shard').textContent = s.shards;
    $('r-ticket').textContent = s.tickets;
  };

  // ---------------------------------------------------------------- bàn cờ

  function cellEl(u, r, c, mine) {
    var d = document.createElement('div');
    d.className = 'cell' + (u ? ' u-' + u.color : ' empty');
    d.dataset.r = r; d.dataset.c = c;
    if (u) {
      if (u.kind === 'charging') { d.classList.add('charging'); d.dataset.charge = u.charge; }
      if (u.kind === 'wall') d.classList.add('wall');
      if (u.klass === 'elite') d.classList.add('elite');
      if (u.klass === 'champion') d.classList.add('champion');

      // Chân dung nằm TRONG ô, chừa viền để lộ màu của ô. Màu mới là thứ người chơi
      // ghép, nên nó phải luôn đọc được kể cả khi ảnh chiếm gần hết ô.
      var art = root.Atlas && root.Atlas.unit(u.heroId);
      if (art) {
        var im = document.createElement('i');
        im.className = 'art';
        im.style.backgroundImage = 'url("' + art + '")';
        d.appendChild(im);
        d.classList.add('has-art');
      }
      var n = document.createElement('b');
      n.className = 'num';
      n.textContent = u.kind === 'wall' ? u.hp : u.power;
      d.appendChild(n);
      d.title = u.name + ' · ' + u.klass + ' · máu ' + u.hp + ' · lực ' + u.power;
    }
    return d;
  }

  /*
   * Bàn địch được render LẬT NGƯỢC: hàng r=rows-1 (giáp mặt ta) vẽ ở DƯỚI CÙNG của
   * khối địch, sát đường giữa. Nhờ vậy hai chồng quân "đối mặt" nhau đúng như bản DS.
   */
  UI.renderBoards = function (battle) {
    var mine = $('board-mine'), foe = $('board-foe');
    mine.innerHTML = ''; foe.innerHTML = '';

    var r, c;
    for (r = 0; r < battle.enemy.rows; r++) {
      for (c = 0; c < battle.enemy.cols; c++) {
        foe.appendChild(cellEl(battle.enemy.get(r, c), r, c, false));
      }
    }
    // ta: hàng sau (r=0) ở TRÊN, hàng trước (r=rows-1) ở DƯỚI -> vẽ thuận
    for (r = battle.player.rows - 1; r >= 0; r--) {
      for (c = 0; c < battle.player.cols; c++) {
        var el = cellEl(battle.player.get(r, c), r, c, true);
        if (battle.player.isFree(r, c)) el.classList.add('hint');
        mine.appendChild(el);
      }
    }

    var bar = $('dropbar');
    bar.innerHTML = '';
    for (c = 0; c < battle.player.cols; c++) {
      var b = document.createElement('button');
      b.textContent = '▼';
      b.dataset.col = c;
      b.className = battle.pickedUp ? 'on' : '';
      bar.appendChild(b);
    }
  };

  UI.renderBattle = function (battle) {
    UI.renderBoards(battle);

    var fp = Math.max(0, battle.enemyHp) / battle.enemyHpMax * 100;
    var mp = Math.max(0, battle.playerHp) / battle.playerHpMax * 100;
    $('foe-hp').style.width = fp + '%';
    $('me-hp').style.width = mp + '%';
    $('foe-hp-txt').textContent = Math.max(0, battle.enemyHp) + ' / ' + battle.enemyHpMax;
    $('me-hp-txt').textContent = Math.max(0, battle.playerHp) + ' / ' + battle.playerHpMax;
    $('foe-name').textContent = battle.isBoss ? '☠ BOSS' : 'Địch';

    // Top: STEP và DAY, đúng hai ô ImageSwapBg / ImageDayBg của bản gốc
    $('hud-step').textContent = battle.movesLeft;
    $('box-step').classList.toggle('low', battle.movesLeft === 0);
    $('hud-day').textContent = battle.day;

    // EnergyBar của LordNode: ở đây là tiến độ lượt trong ngân sách
    $('me-energy').style.width = Math.min(100, battle.turn / battle.maxTurns * 100) + '%';

    UI.renderDayRail(battle.day, battle.turn, battle.maxTurns);
    UI.renderLordButtons(battle);

    $('mid-note').textContent = battle.pickedUp
      ? 'thả vào một cột'
      : 'kéo quân sang cột khác · đòn bay theo cột';

    var bw = $('boss-warn');
    if (battle.isBoss) {
      bw.innerHTML = '<div class="bosswarn">☠ <b>BOSS</b> — đòn lớn sau <b>' +
        battle.bossCountdown + '</b> bước. Mỗi thao tác của bạn làm nó tới gần hơn.</div>';
    } else bw.innerHTML = '';

    $('skill-n').textContent = battle.skills.length;
    $('btn-skills').classList.toggle('primary', battle.skills.length > 0);
  };

  // RetainSkillsLayer của bản gốc: kỹ năng có layer riêng chứ không nằm trên HUD chính.
  UI.skillsHtml = function (battle) {
    if (!battle.skills.length) {
      return '<h3>Kỹ năng</h3><p class="sub">Chưa có. Ghép 3+ ô để nhận — giữ tối đa ' +
        CFG.retainSkillLimit + '.</p><button class="btn primary" data-close>Đóng</button>';
    }
    var html = '<h3>Kỹ năng (' + battle.skills.length + '/' + CFG.retainSkillLimit + ')</h3><div class="list">';
    battle.skills.forEach(function (key, i) {
      var def = DATA.SKILLS[key] || { icon: '?', name: key, desc: '' };
      html += '<div class="item"><div class="grow"><div class="name">' + def.icon + ' ' + def.name +
              '</div><div class="meta">' + def.desc + '</div></div>' +
              '<button class="btn small primary" data-useskill="' + i + '">Dùng</button></div>';
    });
    return html + '</div><button class="btn ghost" data-close>Đóng</button>';
  };

  UI.logHtml = function (battle) {
    return '<div class="log">' + (battle.log.slice(-14).reverse().join('<br>') || 'chưa có gì') + '</div>';
  };

  // Ray ngày — DayItem trong TopDay của bản gốc. Ngày boss có dấu ☠ [APK] bossDays.
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

  // Hai nút kỹ năng hai bên thanh máu — LordSkillBtnL / LordSkillBtnR của bản gốc.
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

  /* ---------------------------------------------------------------- kéo thả
   * Yêu cầu: kéo quân đi như game ghép ô, thay vì chạm-quân rồi chạm-cột.
   * Chạm ngắn (< 8px) vẫn giữ hành vi cũ để không mất đường thao tác dự phòng.
   *
   * Vùng thả CỐ Ý rộng: cả bàn của mình cộng thanh ▼ bên dưới, và chỉ xét toạ độ X
   * để suy ra cột. Thả trượt vài chục pixel vẫn vào đúng cột — trên màn cảm ứng thì
   * bắt người chơi thả trúng đúng một ô là quá khắt khe.
   */
  UI.initDrag = function (getBattle, onChange) {
    var mine = $('board-mine');
    var st = null;

    function columnFromPoint(x, y) {
      var b = mine.getBoundingClientRect();
      var d = $('dropbar').getBoundingClientRect();
      if (y < b.top - 44 || y > d.bottom + 24) return null;
      var rel = (x - b.left) / b.width;
      if (rel < -0.06 || rel > 1.06) return null;
      return Math.max(0, Math.min(CFG.board.cols - 1, Math.floor(rel * CFG.board.cols)));
    }

    function makeGhost(unit) {
      var g = document.createElement('div');
      g.className = 'drag-ghost u-' + unit.color;
      var art = root.Atlas && root.Atlas.unit(unit.heroId);
      if (art) {
        var i = document.createElement('i');
        i.className = 'art';
        i.style.backgroundImage = 'url(' + JSON.stringify(art) + ')';
        g.appendChild(i);
      }
      document.body.appendChild(g);
      return g;
    }

    function highlight(col) {
      var btns = $('dropbar').children;
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('target', i === col);
      }
    }

    function cleanup() {
      if (st && st.ghost && st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost);
      highlight(-1);
      st = null;
    }

    mine.addEventListener('pointerdown', function (e) {
      var battle = getBattle();
      if (!battle || battle.over) return;
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var r = parseInt(cell.dataset.r, 10), c = parseInt(cell.dataset.c, 10);
      st = { r: r, c: c, x: e.clientX, y: e.clientY, dragging: false, id: e.pointerId };
      try { mine.setPointerCapture(e.pointerId); } catch (err) { }
    });

    mine.addEventListener('pointermove', function (e) {
      if (!st) return;
      var battle = getBattle();
      if (!battle || battle.over) { cleanup(); return; }

      if (!st.dragging) {
        var dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (dx * dx + dy * dy < 64) return;              // ngưỡng 8px
        if (!battle.canAct()) { UI.toast('Hết bước — kết thúc lượt'); cleanup(); return; }
        var u = battle.player.get(st.r, st.c);
        if (!u || !battle.player.isFree(st.r, st.c)) {
          UI.toast('Quân này đang trong đội hình hoặc là tường');
          cleanup(); return;
        }
        if (!battle.pickUp(st.r, st.c)) { cleanup(); return; }
        st.dragging = true;
        st.ghost = makeGhost(u);
        onChange();
      }
      st.ghost.style.left = e.clientX + 'px';
      st.ghost.style.top = e.clientY + 'px';
      highlight(columnFromPoint(e.clientX, e.clientY));
      e.preventDefault();
    });

    function finish(e) {
      if (!st) return;
      var battle = getBattle();
      if (st.dragging && battle && !battle.over) {
        var col = columnFromPoint(e.clientX, e.clientY);
        if (col == null) battle.cancelPick();        // thả ra ngoài -> không tốn bước
        else battle.dropAt(col);
        cleanup();
        onChange();
        return;
      }
      // chạm ngắn: giữ hành vi cũ
      var r = st.r, c = st.c;
      cleanup();
      if (!battle || battle.over) return;
      if (battle.pickedUp) { battle.cancelPick(); onChange(); return; }
      if (!battle.canAct()) { UI.toast('Hết bước — kết thúc lượt'); return; }
      if (!battle.pickUp(r, c)) UI.toast('Quân này đang trong đội hình hoặc là tường');
      onChange();
    }

    mine.addEventListener('pointerup', finish);
    mine.addEventListener('pointercancel', function () {
      var battle = getBattle();
      if (st && st.dragging && battle) battle.cancelPick();
      cleanup();
      onChange();
    });
  };

  // ---------------------------------------------------------------- nhà

  UI.renderHome = function (s, eco) {
    $('home-title').textContent = 'Chương ' + s.chapter + ' · Ngày ' + s.day;
    var boss = CFG.isBossDay(s.day);
    $('home-sub').innerHTML =
      (boss ? '☠ <b>Ngày BOSS.</b> ' : '') +
      'Máu địch ×' + CFG.hpRatio(s.chapter, s.day).toFixed(2) +
      ' · ngân sách <b>' + CFG.turnsFor(s.day) + ' lượt</b>' +
      ' · sức mạnh run ×' + CFG.runPowerMul(s.day).toFixed(2);
    $('home-prog').style.width = ((s.day - 1) / CFG.chapter.daysPerChapter * 100) + '%';
    $('home-cap-gold').textContent = 'Vàng chương: ' + (s.chapterGold || 0) + '/' + CFG.coinMaxFor(s.chapter);
    $('home-cap-card').textContent = 'Mảnh chương: ' + (s.chapterCards || 0) + '/' + CFG.cardMaxFor(s.chapter);
    $('btn-winbox').disabled = !eco.canWinBox();
    $('btn-winbox').textContent = 'Rương thắng trận (' +
      (CFG.economy.winBoxPerDay - (s.winBoxToday || 0)) + ' lần hôm nay)';

    var offer = eco.triggeredOffer();
    $('home-offer').innerHTML = offer
      ? '<div class="offer"><b>' + offer.name + '</b><div class="meta" style="font-size:12px;color:var(--dim);margin:4px 0 8px">' +
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
      var el = document.createElement('div');
      el.className = 'item';
      var art = root.Atlas && root.Atlas.unit(h.id);
      el.innerHTML =
        (art ? '<i class="thumb u-' + h.color + '" style="background-image:url(' +
               JSON.stringify(art) + ')"></i>' : '') +
        '<div class="grow"><div class="name">' + h.name +
        (h.named ? '' : '<span title="tên suy từ slug trong APK, chưa xác nhận">*</span>') +
        '<span class="tag ' + h.rarity + '">' + (DATA.RARITY_VI[h.rarity] || h.rarity) + '</span></div>' +
        '<div class="meta">' + h.klass + ' · ' + DATA.COLOR_VI[h.color] +
        ' · cấp ' + own.level + ' · máu ' + st.hp + ' · lực ' + st.power +
        ' · nạp ' + h.charge + ' lượt</div></div>' +
        '<button class="btn small' + (inDeck ? '' : ' primary') + '" data-deck="' + id + '">' +
        (inDeck ? 'Bỏ ra' : 'Mang') + '</button>';
      list.appendChild(el);
    });
  };

  // ---------------------------------------------------------------- nâng cấp

  UI.heroUpCost = function (level) { return 120 * level * level; };
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
      var el = document.createElement('div');
      el.className = 'item';
      el.innerHTML =
        '<div class="grow"><div class="name">' + h.name + '</div>' +
        '<div class="meta">cấp ' + own.level + '/5 · máu ' + st.hp + ' · lực ' + st.power + '</div></div>' +
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
