/* Chợ Phiên — trước trận (phase 'fight') và sau trận (phase 'fightResult').
   Trước trận: đối thủ hiện ở nửa trên (chân dung, thanh máu, bàn thẻ) như lúc đánh; PvP có băng-rôn "Bóng ma" (PVP_Transition).
   Bấm "Chiến đấu!" → lệnh fight (reducer chạy trận ngay) → màn kết quả phát lại trận đó trên sân (BZUI.combat), xong thì hiện
   bảng kết quả: thắng/thua, vàng + XP (PvE), +1 ô chiến thắng hoặc mất uy tín (PvP). "Tiếp tục" → lệnh next
   (ANIM: vàng bay về túi, XP, cung chiến thắng, thanh vương miện; sau đó chọn loot nếu thắng quái). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };

  U.SCREENS.fight = {
    enter: function (run, prev) {
      var ph = run.phase, opp = ph.opponent, b = opp.board;
      U.top.base(run, { hero: true, hp: true, sides: true, board: true });
      var skills = b.cards.filter(function (c) { return c.section === 'skills'; }).map(function (c) { return { uid: 'ops' + c.uid, id: c.id, tier: c.tier, art: U.art(c.id) }; });
      var side = U.top.portrait(opp.name, opp.tier || 'Silver', U.combat.opponentArt(opp),
        U.top.nameBlock(ph.combatType === 'PVP' ? 'Đấu người chơi (bóng)' : 'Quái vật', opp.name, ''),
        { hpMax: b.healthMax, skills: skills, level: b.level || 1 });
      var rw = opp.rewards || {};
      if (ph.combatType === 'PVE') {
        side.r.innerHTML = '<div class="rs-side-name"><small>Phần thưởng</small></div><div class="rs-rw"><i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + (rw.gold || 0) +
          '</b><i style="background-image:' + U.bg(U.ICON.xp) + '"></i><b class="xp">' + (rw.xp || 0) + '</b></div><div class="rs-side-note">' + b.healthMax + ' máu</div>';
      } else {
        side.r.innerHTML = '<div class="rs-side-name"><small>Đặt cược</small></div><div class="rs-side-note">Thắng: +1 chiến thắng<br>Thua: −' + run.day + ' uy tín</div>';
      }
      var list = b.cards.filter(function (c) { return c.section === 'hand'; }).map(function (c, i) {
        return { key: 'opp:' + c.uid, card: { id: c.id, tier: c.tier, ench: c.ench }, kind: 'preview', i: i };
      });
      var els = U.cards.setTop(list, { gap: 0 });
      var go = U.el('div', 'rs-fightgo', U.top.layer());
      U.bigButton(go, 'red', 'Chiến đấu!', 'Bắt đầu trận', function () { U.dispatch({ t: 'fight' }); }).classList.add('play');
      if (ph.combatType === 'PVP') {
        // chớp trắng → màn VS → thẻ của bóng úp rồi lật (clip https://youtu.be/wUzq6Q4u9Jc?t=702 .. ?t=710)
        go.classList.add('wait');
        U.transitions.facedown(els);
        U.transitions.vsScreen(run, opp, function () {
          U.heroVo('pvpintro');
          U.transitions.flipAll(els, function () { go.classList.remove('wait'); });
        });
      } else {
        U.sfx('trans.pvpSwords', { vol: 0.6 });
        U.sfx('vo.monster.' + String(opp.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''), { gap: 3000, vol: 0.8 });
      }
    },
    render: function (run) { U.cards.render(run); },
    exit: function () { U.transitions.cancelVs(); U.top.clear(); },
    canDrag: function () { return false; }, // pha fight chỉ nhận lệnh fight (reducer): xếp lại bàn trước khi tới giờ đánh
    key: function (e) { if (e.key === 'Enter') { U.dispatch({ t: 'fight' }); return true; } }
  };

  var panel = null;
  function showResult(run, live) {
    var ph = run.phase, won = ph.won, pvp = ph.combatType === 'PVP';
    if (panel) panel.remove();
    panel = U.el('div', 'rs-result ' + (won ? 'win' : 'lose'), V().refs.overlay);
    var h = won ? 'Chiến thắng' : (ph.winner === 'draw' ? 'Hết giờ — thua' : 'Thất bại');
    var body = '';
    if (pvp) body = won ? '<div class="it"><i style="background-image:' + U.bg('art/ui/clock/UI_VictoriesIcon_T_Temp.webp') + '"></i><b>+1</b><span>chiến thắng (' + (run.wins + 1) + '/10)</span></div>'
      : '<div class="it neg"><i style="background-image:' + U.bg('art/ui/clock/UI_PrestigeIcon_T_Temp.webp') + '"></i><b>−' + run.day + '</b><span>uy tín (còn ' + Math.max(0, run.prestige - run.day) + ')</span></div>';
    else if (won) body = '<div class="it"><i style="background-image:' + U.bg(U.ICON.coins) + '"></i><b>+' + (ph.rewards.gold || 0) + '</b><span>vàng</span></div>' +
      '<div class="it xp"><i style="background-image:' + U.bg(U.ICON.xpBig) + '"></i><b>+' + (ph.rewards.xp || 0) + '</b><span>XP</span></div>' +
      '<div class="it"><i style="background-image:' + U.bg(U.ICON.chest) + '"></i><b>1</b><span>món của quái</span></div>';
    else body = '<p>Thua quái không mất gì. Xếp lại bàn rồi đi tiếp.</p>';
    panel.innerHTML = '<div class="box"><h2>' + h + '</h2><div class="sub">' + U.esc(ph.opponent.name) + ' · ' + (ph.endMs / 1000).toFixed(1) + ' giây</div><div class="rw">' + body + '</div><div class="btns"></div></div>';
    var btns = panel.querySelector('.btns');
    U.bigButton(btns, 'yellow', 'Tiếp tục', 'Nhận kết quả, đi tiếp', function () { U.dispatch({ t: 'next' }); }).classList.add('play');
    if (!live) U.bigButton(btns, 'brown', 'Xem lại trận', 'Phát lại trận vừa đánh', function () { panel.remove(); panel = null; startReplay(U.state.run); });
    else U.bigButton(btns, 'brown', 'Xem lại', 'Phát lại từ đầu', function () { panel.remove(); panel = null; U.combat.restart(); });
    if (live) U.heroVo(pvp ? (won ? 'pvpvictory' : 'pvpdefeat') : (won ? 'pvevictory' : 'pvedefeat'));
  }
  function startReplay(run) {
    U.top.clear();
    U.combat.start(run, function () { showResult(U.state.run, true); });
  }
  U.SCREENS.fightResult = {
    enter: function (run, prev) {
      U.top.base(run, { hero: true, hp: true, sides: true, board: true });
      if (prev && prev.phase.kind === 'fight') startReplay(run);
      else {
        // nạp lại giữa chừng: không tự phát, hiện bảng kết quả trên bàn của run
        var ph = run.phase, opp = ph.opponent;
        U.top.portrait(opp.name, 'Silver', U.combat.opponentArt(opp), U.top.nameBlock('Vừa đấu', opp.name, ''));
        showResult(run, false);
      }
    },
    render: function (run) { if (!U.combat.active()) U.cards.render(run); },
    canDrag: function () { return false; },
    exit: function () {
      if (panel) { panel.remove(); panel = null; }
      U.combat.stop();
      U.musicKey = null; // trận đổi nhạc: màn sau đặt lại nhạc của hero
    },
    key: function (e) {
      if (e.key === 'End' && U.combat.active()) { U.combat.skip(); return true; }
      if (e.key === 'Enter' && panel) { U.dispatch({ t: 'next' }); return true; }
    }
  };
})(window);
