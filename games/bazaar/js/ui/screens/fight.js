/* Chợ Phiên — trước trận (phase 'fight') và sau trận (phase 'fightResult').
   Trước trận: đối thủ hiện ở nửa trên (chân dung, thanh máu, bàn thẻ) như lúc đánh; PvP: thẻ bóng ma hiện giữa dải trên (tên, hero,
   số trận thắng) ~1,2 s rồi chớp sang màn VS (ref pvp-vs: "ghost card in the lane ... then VS", FLOW-11).
   Nút "Chiến đấu!" nằm ở ô góc phải trên (chỗ phần thưởng / đặt cược), không che hàng thẻ của người chơi (FLOW-18).
   Bấm "Chiến đấu!" → lệnh fight (reducer chạy trận ngay) → màn kết quả phát lại trận đó trên sân (BZUI.combat), xong thì hiện
   bảng kết quả: thắng/thua, vàng + XP (PvE), +1 ô chiến thắng hoặc mất uy tín (PvP). "Tiếp tục" → lệnh next
   (ANIM: vàng bay về túi, XP, cung chiến thắng, thanh vương miện; sau đó chọn loot nếu thắng quái). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };

  // Tự bắt đầu trận ~3 s sau khi vào cảnh (REF-run-flow fight-start: tiếng đầu tiên ~3000 ms sau lúc chọn); nút vẫn là "bắt đầu ngay".
  // Pha 4: pha fight nhận move/swap (xếp lại sau khi xem bàn đối thủ). Người chơi chạm vào bàn (kéo / xếp) thì thôi tự đánh: trận chỉ
  // bắt đầu khi bấm "Chiến đấu!" (hoặc Enter). Điện thoại: chờ 6 s (MOBILE-22); bảng tạm nghỉ / hộp xác nhận / máy dọc: hoãn.
  var AUTO_MS = 3000, AUTO_TOUCH_MS = 6000, autoT = 0, manual = false;
  function coarse() { try { return root.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  function armAuto(ms) {
    clearTimeout(autoT);
    if (manual) return;
    autoT = setTimeout(function () {
      autoT = 0; var r = U.state && U.state.run;
      if (manual || !r || !r.phase || r.phase.kind !== 'fight') return;
      if ((U.drag && U.drag.active()) || (U.menu && U.menu.panelOpen()) || U.confirmBox || (U.portrait && U.portrait())) { armAuto(800); return; }
      U.dispatch({ t: 'fight' });
    }, ms);
  }
  function goManual() {
    if (manual) return;
    manual = true; clearTimeout(autoT); autoT = 0;
    var h = document.querySelector('.rs-fightnote'); if (h) h.textContent = 'Xếp xong thì bấm Chiến đấu!';
  }
  // thẻ bóng ma giữa dải trên (pvp-vs: tên + hero + số thắng), trước màn VS
  function ghostCard(run, opp) {
    var H = U.HEROES[opp.hero] || {}, art = U.combat.opponentArt(opp), HH = root.BZ_HEROES && root.BZ_HEROES.heroes;
    var g = U.el('div', 'rs-ghostpick', U.top.layer(),
      '<div class="pf"><i></i></div><b></b><small></small><div class="bars"><i class="hp"></i><i class="wn"></i></div>');
    g.querySelector('.pf i').style.backgroundImage = U.bg(art.char || H.portrait || art.bg);
    g.querySelector('b').textContent = String(opp.name || '').replace(/^Ghost of /, '');
    g.querySelector('small').textContent = (opp.hero ? ((HH && HH[opp.hero] && HH[opp.hero].title) || opp.hero) + ' · ' : '') + (opp.wins || 0) + ' thắng · cấp ' + ((opp.board && opp.board.level) || 1);
    g.querySelector('.hp').style.setProperty('--f', Math.min(1, ((opp.board && opp.board.healthMax) || 0) / Math.max(1, run.healthMax * 1.5)).toFixed(2));
    g.querySelector('.wn').style.setProperty('--f', Math.min(1, (opp.wins || 0) / 10).toFixed(2));
    U.sfx('board.portraitAppear', { vol: 0.7 });
    return g;
  }
  U.SCREENS.fight = {
    enter: function (run, prev) {
      var ph = run.phase, opp = ph.opponent, b = opp.board;
      U.top.base(run, { hero: true, hp: true, sides: true, board: true });
      if (U.preloadCombat) U.preloadCombat(run);
      var skills = b.cards.filter(function (c) { return c.section === 'skills'; }).map(function (c) { return { uid: 'ops' + c.uid, id: c.id, tier: c.tier, art: U.art(c.id) }; });
      manual = false;
      var oart = U.combat.opponentArt(opp), oname = U.oppName(opp);
      var kick = ph.combatType === 'PVP' ? (opp.source === 'dataset' && opp.hero ? 'Bóng ma · ' + ((root.BZ_HEROES && root.BZ_HEROES.heroes[opp.hero] || {}).title || opp.hero) + (opp.wins ? ' · ' + opp.wins + ' thắng' : '') : 'Đấu người chơi (bóng)') : 'Quái vật';
      var side = U.top.portrait(oname, opp.tier || 'Silver', oart, U.top.nameBlock(kick, oname, b.healthMax + ' máu'),
        { hpMax: b.healthMax, skills: skills, level: b.level || 1 });
      var h1 = V().hero(1); if (h1) h1.art.classList.toggle('hero-art', !!oart.hero);
      var rw = opp.rewards || {};
      if (ph.combatType === 'PVE') {
        side.r.innerHTML = '<div class="rs-side-name"><small>Phần thưởng</small></div><div class="rs-rw"><i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + (rw.gold || 0) +
          '</b><i style="background-image:' + U.bg(U.ICON.xp) + '"></i><b class="xp">' + (rw.xp || 0) + '</b></div>';
      } else {
        side.r.innerHTML = '<div class="rs-side-name"><small>Đặt cược</small></div><div class="rs-side-note">Thắng: +1 chiến thắng<br>Thua: −' + run.day + ' uy tín</div>';
      }
      var list = b.cards.filter(function (c) { return c.section === 'hand'; }).map(function (c, i) {
        return { key: 'opp:' + c.uid, card: { id: c.id, tier: c.tier, ench: c.ench }, kind: 'preview', i: i };
      });
      var els = U.cards.setTop(list, { gap: 0 });
      var go = U.el('div', 'rs-fightgo', side.r);
      U.bigButton(go, 'red', 'Chiến đấu!', 'Bắt đầu ngay (Enter) — tự bắt đầu sau vài giây nếu không xếp lại bàn', function () { clearTimeout(autoT); U.dispatch({ t: 'fight' }); }).classList.add('play');
      var note = U.el('div', 'rs-fightnote', side.r, coarse() ? 'Kéo đồ để xếp lại' : 'Kéo đồ để xếp lại · Enter đánh ngay');
      var autoMs = coarse() ? AUTO_TOUCH_MS : AUTO_MS;
      if (ph.combatType === 'PVP') {
        // thẻ bóng ma 1,2 s → chớp trắng → VS → thẻ của bóng úp rồi lật (clip https://youtu.be/wUzq6Q4u9Jc?t=702 .. ?t=710)
        go.classList.add('wait'); note.classList.add('wait');
        U.transitions.facedown(els);
        var gc = ghostCard(run, opp);
        this._ghostT = setTimeout(function () {
          gc.classList.add('out');
          U.transitions.vsScreen(run, opp, function () {
            if (gc.parentNode) gc.remove();
            U.heroVo('pvpintro');
            U.transitions.flipAll(els, function () { go.classList.remove('wait'); note.classList.remove('wait'); armAuto(autoMs); });
          });
        }, U.transitions.GHOST_MS);
      } else {
        U.sfx('trans.pvpSwords', { vol: 0.6 });
        armAuto(autoMs);
        U.sfx('vo.monster.' + String(opp.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''), { gap: 3000, vol: 0.8 });
      }
    },
    render: function (run) { U.cards.render(run); },
    exit: function () { clearTimeout(autoT); autoT = 0; clearTimeout(this._ghostT); U.transitions.cancelVs(); U.top.clear(); },
    canDrag: function (el) { if (el._rs.kind !== 'own') return false; goManual(); return true; },
    onCardClick: function (el) { if (el._rs.kind === 'own') goManual(); return false; },
    key: function (e) {
      if (e.key === 'Enter') { var g = document.querySelector('.rs-fightgo'); if (g && g.classList.contains('wait')) return true; clearTimeout(autoT); U.dispatch({ t: 'fight' }); return true; }
    }
  };

  var panel = null, panelT = 0;
  // Kết quả (clip fight-result): băng-rôn "Victory!" do trang xem trận vẽ và đã rời màn khi phát lại báo xong (replay END_HOLD), nên
  // Continue hiện NGAY (VFX-15, INTERACT-23: trước đây chờ thêm 2 s tĩnh). Ô góc phải trên (chỗ phần thưởng của đối thủ) đổi thành
  // nút Continue + hai biểu tượng (xem lại, chi tiết). Không còn hộp giữa màn.
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
    U.button(ic, 'sq', '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>', 'Xem lại trận', function () {
      var p = panel; panel = null; if (p) p.remove(); U.panelTip(null);
      if (live) U.combat.restart(); else startReplay(U.state.run);
    });
    var det = U.button(ic, 'sq', '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>', 'Chi tiết kết quả', function () {
      // bấm / chạm: bật tắt bảng chi tiết (MOBILE-6: trước đây chỉ hiện lúc rê chuột, chạm thì loé rồi tắt)
      if (V().refs.tip2.classList.contains('show') && det._open) { det._open = false; U.panelTip(null); } else { det._open = true; openDet(); }
    });
    det.classList.add('rs-tipsrc');
    function openDet() {
      var b = det.getBoundingClientRect(), q = V().toStage(b.left, b.top);
      U.panelTip({ x: q.x, y: q.y, w: b.width / V().scale, h: b.height / V().scale }, h, U.esc(U.oppName(ph.opponent)) + ' · ' + (ph.endMs / 1000).toFixed(1) + ' giây<br>' + resultText(run));
    }
    det.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') openDet(); });
    det.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') { det._open = false; U.panelTip(null); } });
    U.bigButton(go, 'blue', 'Tiếp tục', 'Nhận kết quả, đi tiếp (Enter)', function () { U.dispatch({ t: 'next' }); }).classList.add('play');
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
        // nạp lại giữa chừng: không tự phát; hiện bàn + máu của đối thủ như lúc vào trận, bảng kết quả, nút xem lại (INTERACT-24)
        var ph = run.phase, opp = ph.opponent, ob = (ph.boards && ph.boards[1]) || { cards: [], healthMax: 0 };
        var skills = (ob.cards || []).filter(function (c) { return c.section === 'skills'; }).map(function (c) { return { uid: 'ops' + c.uid, id: c.id, tier: c.tier, art: U.art(c.id) }; });
        U.top.portrait(U.oppName(opp), 'Silver', U.combat.opponentArt(opp), U.top.nameBlock('Vừa đấu', U.oppName(opp), (ph.won ? 'Bạn thắng' : 'Bạn thua') + ' · ' + (ph.endMs / 1000).toFixed(1) + ' giây'),
          { hpMax: ob.healthMax || 0, skills: skills, level: ob.level || 1 });
        if (ob.healthMax) V().updateHero(1, { health: ph.won ? 0 : ob.healthMax, healthMax: ob.healthMax }, U.now());
        U.cards.setTop((ob.cards || []).filter(function (c) { return c.section === 'hand'; }).map(function (c, i) {
          return { key: 'opp:' + c.uid, card: { id: c.id, tier: c.tier, ench: c.ench }, kind: 'preview', i: i };
        }), { gap: 0 });
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
      if (e.key === 'Enter' && panel) { U.dispatch({ t: 'next' }); return true; }
    }
  };
})(window);
