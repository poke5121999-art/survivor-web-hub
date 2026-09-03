/*
 * SlimeClash — nối mọi thứ lại.
 *
 * Vòng lặp: NHÀ -> TRẬN (một "ngày") -> thưởng -> ngày kế; hết 10 ngày là qua chương.
 * Nhịp này lấy nguyên của Slime Legion ([APK] pass_day = 10, boss ở ngày 5 và 10),
 * chỉ thay pha thủ thành auto-battle bằng trận lưới của Clash of Heroes.
 */
(function () {
  'use strict';

  var CFG = window.CFG, DATA = window.DATA, UI = window.SlimeUI;
  var ENG = window.SlimeEngine, ECON = window.SlimeEconomy, SAVE = window.SlimeSave;
  var $ = function (id) { return document.getElementById(id); };

  var S = null;        // state
  var eco = null;
  var battle = null;
  var eraseMode = false;

  function persist() { SAVE.save(S); }

  function refreshHome() {
    UI.renderTop(S);
    UI.renderHome(S, eco);
  }

  // ------------------------------------------------------------------ trận

  function deckForBattle() {
    return S.deck.map(function (id) {
      return { hero: DATA.BY_ID[id], level: (S.owned[id] && S.owned[id].level) || 1 };
    }).filter(function (d) { return d.hero; });
  }

  // Địch dùng bộ quân của chính người chơi làm khuôn — sức mạnh chênh lệch nằm ở
  // hệ số theo chương, không nằm ở việc địch có quân "xịn hơn".
  function enemyDeck() {
    var pool = DATA.HEROES.filter(function (h) { return h.klass === 'core'; });
    var picked = [pool[S.chapter % pool.length], pool[(S.chapter * 3 + 1) % pool.length],
                  pool[(S.chapter * 7 + 2) % pool.length]];
    var elites = DATA.HEROES.filter(function (h) { return h.klass === 'elite'; });
    picked.push(elites[S.chapter % elites.length]);
    return picked.map(function (h) { return { hero: h, level: Math.min(5, 1 + Math.floor(S.chapter / 2)) }; });
  }

  function startBattle() {
    var deck = deckForBattle();
    var cores = deck.filter(function (d) { return d.hero.klass === 'core'; });
    if (cores.length < 2) {
      UI.toast('Cần ít nhất 2 loại quân core trong đội hình');
      return;
    }
    battle = new ENG.Battle({
      chapter: S.chapter, day: S.day,
      seed: (S.chapter * 7919 + S.day * 104729 + (S.stats.battles || 0)) >>> 0,
      deck: deck, enemyDeck: enemyDeck(), heroLevel: S.heroLevel
    });
    eraseMode = false;
    $('btn-erase').textContent = 'Xoá quân';
    UI.show('s-battle');
    UI.renderBattle(battle);
  }

  function afterBattle() {
    S.stats.battles++;
    var won = battle.won;
    if (won) {
      S.stats.wins++;
      S.lossStreak = 0;
      S.failPackClaimed = false;
    } else {
      S.lossStreak = (S.lossStreak || 0) + 1;
    }

    var got = eco.battleReward(S.day, won);
    var lines = [];
    if (got.gold) lines.push('🪙 ' + got.gold);
    if (got.gem) lines.push('💎 ' + got.gem);
    if (got.shard) lines.push('🧩 ' + got.shard);
    var capNote = got.capped.length
      ? '<div class="note">Đã chạm trần chương với: ' + got.capped.join(', ') +
        '. Phần vượt bị cắt — đây là cơ chế cố ý, xem README.</div>'
      : '';

    if (won) {
      if (S.day >= CFG.chapter.daysPerChapter) {
        eco.enterChapter(S.chapter + 1);
        S.day = 1;
        UI.dialog('<h3>Qua chương!</h3><p class="sub">Chương ' + (S.chapter - 1) +
          ' hoàn tất. Trần vàng và mảnh đã reset cho chương mới.</p>' +
          '<p class="sub">' + lines.join(' · ') + '</p>' + capNote +
          '<button class="btn primary" data-close>Tiếp</button>');
      } else {
        S.day++;
        UI.dialog('<h3>Thắng</h3><p class="sub">Ngày ' + (S.day - 1) + ' xong. ' +
          lines.join(' · ') + '</p>' + capNote +
          '<button class="btn primary" data-close>Tiếp</button>');
      }
    } else {
      var why = battle.turn > battle.maxTurns
        ? 'Hết ngân sách lượt mà chưa hạ được địch.'
        : 'Hero của bạn gục.';
      UI.dialog('<h3>Thua</h3><p class="sub">' + why +
        '</p><p class="sub">' + (lines.join(' · ') || 'Không nhận được gì đáng kể.') + '</p>' +
        (S.lossStreak >= CFG.economy.failPackAfterLosses
          ? '<p class="sub">Thua ' + S.lossStreak + ' lần liên tiếp — có gói trợ giúp miễn phí ở màn hình chính.</p>'
          : '') +
        '<button class="btn primary" data-close>Về nhà</button>');
    }

    battle = null;
    persist();
    UI.show('s-home');
    refreshHome();
  }

  // Vẽ lại + tự kết thúc lượt nếu bật AUTO và đã dùng hết bước.
  function afterMove() {
    if (!battle) return;
    UI.renderBattle(battle);
    if (S.autoEnd && !battle.over && battle.movesLeft === 0 && !battle.pickedUp) {
      setTimeout(function () {
        if (battle && !battle.over && battle.movesLeft === 0) doEndTurn();
      }, 260);
    }
  }

  function doEndTurn() {
    if (!battle || battle.over) return;
    battle.endTurn();
    UI.renderBattle(battle);
    if (battle.over) setTimeout(afterBattle, 350);
  }

  // Chạm vào thanh ▼ hoặc ô kỹ năng (kéo thả xử lý riêng trong UI.initDrag)
  function onBattleTap(e) {
    if (!battle || battle.over) return;
    var drop = e.target.closest('#dropbar button');
    var skill = e.target.closest('[data-skill]');

    if (skill && skill.dataset.skill !== '') {
      battle.useSkill(parseInt(skill.dataset.skill, 10));
      UI.renderBattle(battle);
      return;
    }
    if (drop) {
      if (!battle.pickedUp) { UI.toast('Kéo một quân của bạn sang cột khác'); return; }
      battle.dropAt(parseInt(drop.dataset.col, 10));
      afterMove();
    }
  }

  // ------------------------------------------------------------------ wiring

  function bind() {
    $('btn-fight').addEventListener('click', startBattle);
    // NavigatorBar
    $('navbar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-nav]');
      if (!b) return;
      var id = b.dataset.nav;
      if (id === 's-deck') UI.renderDeck(S);
      if (id === 's-upgrade') UI.renderUpgrade(S);
      if (id === 's-shop') UI.renderShop(S, eco);
      if (id === 's-home') refreshHome();
      UI.show(id);
    });

    $('btn-winbox').addEventListener('click', function () {
      var r = eco.claimWinBox();
      if (!r.ok) { UI.toast('Hết lượt rương hôm nay'); return; }
      UI.toast('Nhận 🪙' + r.got.gold + ' 💎' + r.got.gem +
        (r.got.capped.length ? ' (chạm trần: ' + r.got.capped.join(', ') + ')' : ''));
      persist(); refreshHome();
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { UI.show('s-home'); refreshHome(); return; }
      if (e.target.closest('[data-close]')) { UI.closeDialog(); return; }

      var offer = e.target.closest('#btn-offer');
      if (offer) {
        var r = eco.claimOffer();
        if (!r.ok) { UI.toast(r.reason || 'Không nhận được'); return; }
        UI.toast('Đã nhận ' + r.offer.name);
        persist(); refreshHome();
        return;
      }

      var pack = e.target.closest('[data-pack]');
      if (pack) {
        var res = eco.buyPack(pack.dataset.pack);
        if (!res.ok) { UI.toast(res.reason || 'Không mở được'); return; }
        var g = res.got;
        UI.toast('Nhận 🪙' + g.gold + ' 💎' + g.gem + ' 🧩' + g.shard +
          (g.capped.length ? ' — chạm trần: ' + g.capped.join(', ') : ''));
        persist(); UI.renderTop(S); UI.renderShop(S, eco);
        return;
      }

      var dk = e.target.closest('[data-deck]');
      if (dk) {
        var id = parseInt(dk.dataset.deck, 10);
        var i = S.deck.indexOf(id);
        if (i >= 0) S.deck.splice(i, 1);
        else if (S.deck.length >= CFG.deck.size) UI.toast('Tối đa ' + CFG.deck.size + ' loại');
        else S.deck.push(id);
        persist(); UI.renderDeck(S);
        return;
      }

      if (e.target.closest('#btn-hero-up')) {
        var cost = UI.heroUpCost(S.heroLevel);
        if (S.heroLevel >= CFG.hero.maxLevel) return;
        if (S.gold < cost) { UI.toast('Không đủ vàng'); return; }
        S.gold -= cost; S.heroLevel++;
        persist(); UI.renderTop(S); UI.renderUpgrade(S);
        UI.toast('Hero lên cấp ' + S.heroLevel);
        return;
      }

      var uu = e.target.closest('[data-unitup]');
      if (uu) {
        var uid = parseInt(uu.dataset.unitup, 10);
        var own = S.owned[uid];
        if (!own || own.level >= 5) return;
        var c2 = UI.unitUpCost(own.level);
        if (S.gold < c2) { UI.toast('Không đủ vàng'); return; }
        S.gold -= c2; own.level++;
        persist(); UI.renderTop(S); UI.renderUpgrade(S);
        return;
      }
    });

    $('dropbar').addEventListener('click', onBattleTap);
    $('skill-l').addEventListener('click', onBattleTap);
    $('skill-r').addEventListener('click', onBattleTap);

    // Kéo thả là đường thao tác CHÍNH; chạm ngắn vẫn chạy như cũ (dự phòng).
    UI.initDrag(function () { return battle; }, afterMove);

    $('btn-erase').addEventListener('click', function () {
      eraseMode = !eraseMode;
      this.textContent = eraseMode ? 'Chạm quân để xoá…' : 'Xoá quân';
      if (eraseMode) UI.toast('Chạm một quân rảnh để xoá (tốn 1 bước)');
    });

    // Chế độ xoá: dùng chạm, nên bắt riêng ở tầng click.
    $('board-mine').addEventListener('click', function (e) {
      if (!eraseMode || !battle || battle.over || battle.pickedUp) return;
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var r = parseInt(cell.dataset.r, 10), c = parseInt(cell.dataset.c, 10);
      if (battle.deleteAt(r, c)) {
        eraseMode = false;
        $('btn-erase').textContent = 'Xoá quân';
        afterMove();
      } else UI.toast('Quân này đang trong đội hình');
    });

    $('btn-end').addEventListener('click', doEndTurn);

    $('btn-skills').addEventListener('click', function () {
      if (!battle || battle.over) return;
      UI.dialog(UI.skillsHtml(battle));
    });

    // ButtonAccelerate của bản gốc là tua nhanh pha auto-battle. Ở đây trận theo lượt
    // nên không có gì để tua — chuyển thành AUTO: hết bước thì tự sang lượt.
    $('btn-speed').addEventListener('click', function () {
      S.autoEnd = !S.autoEnd;
      $('speed-x').textContent = S.autoEnd ? 'AUTO' : 'TAY';
      persist();
      UI.toast(S.autoEnd ? 'Hết bước sẽ tự sang lượt' : 'Tự sang lượt: tắt');
    });

    // ButtonPause -> GamePauseLayer của bản gốc
    $('btn-pause').addEventListener('click', function () {
      if (!battle || battle.over) return;
      UI.dialog('<h3>Tạm dừng</h3>' +
        '<p class="sub">Chương ' + S.chapter + ' · Ngày ' + S.day +
        ' · lượt ' + battle.turn + '/' + battle.maxTurns + '</p>' +
        UI.logHtml(battle) +
        '<button class="btn primary" data-close>Chơi tiếp</button>' +
        '<button class="btn ghost" id="btn-flee2">Bỏ trận</button>');
    });

    document.addEventListener('click', function (e) {
      var us = e.target.closest && e.target.closest('[data-useskill]');
      if (us && battle && !battle.over) {
        battle.useSkill(parseInt(us.dataset.useskill, 10));
        UI.closeDialog();
        UI.renderBattle(battle);
        return;
      }
      if (e.target && e.target.id === 'btn-flee2') {
        UI.closeDialog();
        if (battle) { battle.over = true; battle.won = false; afterBattle(); }
      }
    });

    $('overlay').addEventListener('click', function (e) {
      if (e.target === this) UI.closeDialog();
    });
  }

  // ------------------------------------------------------------------ boot

  SAVE.load().then(function (state) {
    S = state;
    eco = new ECON.Economy(S);
    if (eco.rollDaily()) persist();
    // vá save cũ thiếu trường
    if (!S.stats) S.stats = { battles: 0, wins: 0 };
    if (!S.deck || !S.deck.length) S.deck = DATA.starterIds.slice(0, CFG.deck.size);
    if (typeof S.autoEnd !== 'boolean') S.autoEnd = true;
    bind();
    $('speed-x').textContent = S.autoEnd ? 'AUTO' : 'TAY';
    refreshHome();
  }).catch(function (err) {
    document.body.innerHTML =
      '<pre style="color:#f88;padding:20px;white-space:pre-wrap">Lỗi khởi động: ' +
      (err && err.message ? err.message : err) + '</pre>';
  });
})();
