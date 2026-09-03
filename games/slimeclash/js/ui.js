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

  UI.renderTop = function (s) {
    $('r-gold').textContent = s.gold;
    $('r-gem').textContent = s.gem;
    $('r-shard').textContent = s.shards;
    $('r-ticket').textContent = s.tickets;
    $('r-progress').textContent = 'C' + s.chapter + ' · N' + s.day;
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

    $('turn-no').textContent = battle.turn;
    $('turn-max').textContent = battle.maxTurns;
    for (var i = 0; i < 3; i++) {
      $('d' + i).classList.toggle('on', i < battle.movesLeft);
    }

    $('mid-note').textContent = battle.pickedUp
      ? 'đang cầm quân — chạm ▼ để thả'
      : 'đòn bay theo cột';

    var bw = $('boss-warn');
    if (battle.isBoss) {
      bw.innerHTML = '<div class="bosswarn">☠ <b>BOSS</b> — đòn lớn sau <b>' +
        battle.bossCountdown + '</b> bước. Mỗi thao tác của bạn làm nó tới gần hơn.</div>';
    } else bw.innerHTML = '';

    var sk = $('skills');
    sk.innerHTML = '';
    battle.skills.forEach(function (key, i) {
      var def = DATA.SKILLS[key];
      var b = document.createElement('button');
      b.className = 'skill';
      b.dataset.skill = i;
      b.innerHTML = (def ? def.icon + ' ' + def.name : key);
      b.title = def ? def.desc : '';
      sk.appendChild(b);
    });
    if (!battle.skills.length) {
      sk.innerHTML = '<span style="color:var(--dim);font-size:12px">Ghép 3+ ô để nhận kỹ năng (giữ tối đa ' +
        CFG.retainSkillLimit + ')</span>';
    }

    $('log').innerHTML = battle.log.slice(-12).reverse().join('<br>');
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
