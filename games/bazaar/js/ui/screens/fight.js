/* Chợ Phiên — trước trận (phase 'fight') và sau trận (phase 'fightResult').
   Trước trận: đối thủ hiện ở nửa trên (chân dung, thanh máu, bàn thẻ) như lúc đánh; PvP có băng-rôn "Bóng ma" (PVP_Transition).
   Bấm "Chiến đấu!" → lệnh fight (reducer chạy trận ngay) → màn kết quả phát lại trận đó trên sân (BZUI.combat), xong thì hiện
   bảng kết quả: thắng/thua, vàng + XP (PvE), +1 ô chiến thắng hoặc mất uy tín (PvP). "Tiếp tục" → lệnh next
   (ANIM: vàng bay về túi, XP, cung chiến thắng, thanh vương miện; sau đó chọn loot nếu thắng quái). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };

  // Tự bắt đầu trận ~3 s sau khi vào cảnh (REF-run-flow fight-start: tiếng đầu tiên ~3000 ms sau lúc chọn); nút vẫn là "bắt đầu ngay"
  // Pha 4: pha fight nhận sell/move/swap (xếp lại sau khi xem bàn đối thủ). Người chơi chạm vào bàn (kéo / bán / xếp) thì thôi tự
  // đánh: trận chỉ bắt đầu khi bấm "Chiến đấu!" (hoặc Enter).
  var AUTO_MS = 3000, autoT = 0, manual = false;
  function armAuto(ms) {
    clearTimeout(autoT);
    if (manual) return;
    autoT = setTimeout(function () {
      autoT = 0; var r = U.state && U.state.run;
      if (manual || !r || !r.phase || r.phase.kind !== 'fight') return;
      if (U.drag && U.drag.active()) { armAuto(800); return; }
      U.dispatch({ t: 'fight' });
    }, ms);
  }
  function goManual() {
    if (manual) return;
    manual = true; clearTimeout(autoT); autoT = 0;
    var h = document.querySelector('.rs-fightgo .note'); if (h) h.textContent = 'Xếp lại xong thì bấm Chiến đấu!';
  }
  U.SCREENS.fight = {
    enter: function (run, prev) {
      var ph = run.phase, opp = ph.opponent, b = opp.board;
      U.top.base(run, { hero: true, hp: true, sides: true, board: true });
      var skills = b.cards.filter(function (c) { return c.section === 'skills'; }).map(function (c) { return { uid: 'ops' + c.uid, id: c.id, tier: c.tier, art: U.art(c.id) }; });
      manual = false;
      var oart = U.combat.opponentArt(opp), oname = U.oppName(opp);
      var kick = ph.combatType === 'PVP' ? (opp.source === 'dataset' && opp.hero ? 'Bóng ma · ' + ((root.BZ_HEROES && root.BZ_HEROES.heroes[opp.hero] || {}).title || opp.hero) + (opp.wins ? ' · ' + opp.wins + ' thắng' : '') : 'Đấu người chơi (bóng)') : 'Quái vật';
      var side = U.top.portrait(oname, opp.tier || 'Silver', oart, U.top.nameBlock(kick, oname, ''),
        { hpMax: b.healthMax, skills: skills, level: b.level || 1 });
      var h1 = V().hero(1); if (h1) h1.art.classList.toggle('hero-art', !!oart.hero);
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
      U.bigButton(go, 'red', 'Chiến đấu!', 'Bắt đầu ngay (tự bắt đầu sau 3 giây nếu không xếp lại bàn)', function () { clearTimeout(autoT); U.dispatch({ t: 'fight' }); }).classList.add('play');
      U.el('div', 'note', go, 'Kéo đồ để xếp lại hoặc bán trước khi đánh');
      if (ph.combatType === 'PVP') {
        // chớp trắng → màn VS → thẻ của bóng úp rồi lật (clip https://youtu.be/wUzq6Q4u9Jc?t=702 .. ?t=710)
        go.classList.add('wait');
        U.transitions.facedown(els);
        U.transitions.vsScreen(run, opp, function () {
          U.heroVo('pvpintro');
          U.transitions.flipAll(els, function () { go.classList.remove('wait'); armAuto(AUTO_MS); });
        });
      } else {
        U.sfx('trans.pvpSwords', { vol: 0.6 });
        armAuto(AUTO_MS);
        U.sfx('vo.monster.' + String(opp.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''), { gap: 3000, vol: 0.8 });
      }
    },
    render: function (run) { U.cards.render(run); },
    exit: function () { clearTimeout(autoT); autoT = 0; U.transitions.cancelVs(); U.top.clear(); },
    canDrag: function (el) { if (el._rs.kind !== 'own') return false; goManual(); return true; },
    onCardClick: function (el) { if (el._rs.kind === 'own') goManual(); return false; },
    key: function (e) { if (e.key === 'Enter') { clearTimeout(autoT); U.dispatch({ t: 'fight' }); return true; } }
  };

  var panel = null, panelT = 0;
  // Kết quả (clip fight-result): băng-rôn "Victory!" cuộn vào 0,6 s, giữ 1,4 s, ra 0,4 s (do trang xem trận vẽ); vàng bay về túi;
  // sau đó ô góc phải trên (chỗ phần thưởng của đối thủ) đổi thành nút Continue + hai biểu tượng (xem lại, chi tiết). Không còn hộp giữa màn.
  function resultText(run) {
    var ph = run.phase, won = ph.won, pvp = ph.combatType === 'PVP';
    if (pvp) return won ? '+1 chiến thắng (' + (run.wins + 1) + '/10)' : '−' + run.day + ' uy tín (còn ' + Math.max(0, run.prestige - run.day) + ')';
    if (won) return '+' + (ph.rewards.gold || 0) + ' vàng · +' + (ph.rewards.xp || 0) + ' XP · 1 món của quái';
    return 'Thua quái không mất gì. Xếp lại bàn rồi đi tiếp.';
  }
  function showResult(run, live) {
    var ph = run.phase, won = ph.won, pvp = ph.combatType === 'PVP';
    if (panel) panel.remove();
    clearTimeout(panelT);
    var S = V().refs.sides[1], h = won ? 'Chiến thắng' : (ph.winner === 'draw' ? 'Hết giờ — thua' : 'Thất bại');
    S.r.innerHTML = ''; // ô phải của đối thủ chỉ còn Continue + 2 biểu tượng (clip)
    panel = U.el('div', 'rs-result ' + (won ? 'win' : 'lose'), S.r);
    panel.innerHTML = '<div class="ic"></div><div class="go"></div>';
    var ic = panel.querySelector('.ic'), go = panel.querySelector('.go');
    var rp = U.button(ic, 'sq', '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>', 'Xem lại trận', function () {
      var p = panel; panel = null; if (p) p.remove();
      if (live) U.combat.restart(); else startReplay(U.state.run);
    });
    var det = U.button(ic, 'sq', '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>', 'Chi tiết kết quả', function () { /* tooltip bằng hover */ });
    det.addEventListener('pointerenter', function () {
      var b = det.getBoundingClientRect(), q = V().toStage(b.left, b.top);
      U.panelTip({ x: q.x, y: q.y, w: b.width / V().scale, h: b.height / V().scale }, h, U.esc(ph.opponent.name) + ' · ' + (ph.endMs / 1000).toFixed(1) + ' giây<br>' + resultText(run));
    });
    det.addEventListener('pointerleave', function () { U.panelTip(null); });
    U.bigButton(go, 'blue', 'Tiếp tục', 'Nhận kết quả, đi tiếp', function () { U.dispatch({ t: 'next' }); }).classList.add('play');
    // giữ ô chờ băng-rôn: hiện sau ~2 s (0,6 + 1,4) khi vừa phát xong trận
    panel.classList.add('wait');
    panelT = setTimeout(function () { if (panel) panel.classList.remove('wait'); }, live ? 2000 : 0);
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
      clearTimeout(panelT); if (panel) { panel.remove(); panel = null; }
      U.combat.stop();
      U.musicKey = null; // trận đổi nhạc: màn sau đặt lại nhạc của hero
    },
    key: function (e) {
      if (e.key === 'End' && U.combat.active()) { U.combat.skip(); return true; }
      if (e.key === 'Enter' && panel && !panel.classList.contains('wait')) { U.dispatch({ t: 'next' }); return true; }
    }
  };
})(window);
