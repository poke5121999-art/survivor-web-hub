/* Chợ Phiên — các màn toàn màn hình: tiêu đề ('title'), chọn hero (phase heroSelect, hero-select-1.jpg: cột lục giác,
   hero đang chọn to hơn có bảng tên và quầng sáng), hết run (phase end: thống kê + bàn cuối + "Chơi lại").
   Kèm nút bánh răng trong run (âm lượng, về menu, bỏ run). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; }, AU = function () { return root.BZAudio; };
  var M = U.menu = {};
  var ov = null, gearBtn = null, panel = null;

  M.overlayOn = function (cls) {
    ov = V().refs.overlay;
    var scr = ov.querySelector('.rs-screen');
    if (scr) scr.remove();
    var s = U.el('div', 'rs-screen ' + (cls || ''), ov);
    V().refs.stage.classList.add('ov-full');
    U.cards.show(false); U.hud.show(false);
    M.gear(false);
    return s;
  };
  M.overlayOff = function () {
    var o = V().refs.overlay, scr = o.querySelector('.rs-screen');
    if (scr) scr.remove();
    V().refs.stage.classList.remove('ov-full');
  };

  // ---------- âm thanh (dùng ở tiêu đề và bánh răng) ----------
  function soundRow(parent) {
    var row = U.el('div', 'rs-sound', parent);
    var A = AU();
    var mute = U.button(row, 'mute', '', 'Bật/tắt tiếng (M)', function () { A.toggleMute(); M.refreshSound(); });
    var vol = U.el('input', '', row); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = Math.round((A ? A.getVolume() : 0.7) * 100);
    vol.setAttribute('aria-label', 'Âm lượng');
    vol.addEventListener('input', function () { A.setVolume(vol.value / 100); M.refreshSound(); });
    vol.addEventListener('change', function () { U.sfx('ui.click'); });
    row._mute = mute; row._vol = vol;
    M._rows = (M._rows || []).filter(function (r) { return document.body.contains(r); }).concat([row]);
    M.refreshSound();
    return row;
  }
  M.refreshSound = function () {
    var A = AU(); if (!A) return;
    (M._rows || []).forEach(function (r) {
      r._mute.innerHTML = A.isMuted() ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9.4l1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7l1.4 1.4a7 7 0 0 0 0-9.8zM18.8 5.7a9 9 0 0 1 0 12.6l1.4 1.4a11 11 0 0 0 0-15.4z"/></svg>';
      r._vol.value = Math.round(A.getVolume() * 100);
    });
  };

  // ---------- bánh răng trong run ----------
  M.gear = function (on) {
    if (!gearBtn) {
      gearBtn = U.button(V().refs.stage, 'rs-gear', '<i></i>', 'Cài đặt', function () { M.openPanel(); });
      gearBtn.querySelector('i').style.backgroundImage = U.bg('art/ui/ui_gameplay/Icon_InGameMenu_Settings_TUI.webp');
    }
    gearBtn.style.display = on ? '' : 'none';
  };
  M.openPanel = function () {
    if (panel) { panel.remove(); panel = null; return; }
    panel = U.el('div', 'rs-panel', V().refs.stage);
    var box = U.el('div', 'box', panel);
    U.el('h2', '', box, 'Tạm nghỉ');
    U.el('p', 'sub', box, 'Run tự lưu sau mỗi nước đi.');
    soundRow(box);
    var b = U.el('div', 'btns', box);
    U.bigButton(b, 'yellow', 'Chơi tiếp', 'Đóng bảng', function () { M.closePanel(); });
    U.bigButton(b, 'brown', 'Về menu chính', 'Về màn tiêu đề (run vẫn được lưu)', function () { M.closePanel(); if (U.combat) U.combat.stop(); U.go('title'); });
    U.bigButton(b, 'red', 'Bỏ run này', 'Xoá run đang chơi', function () {
      M.closePanel(); if (U.combat) U.combat.stop(); U.clearSaved(); U.state.run = null; U.go('title');
    });
    panel.addEventListener('pointerdown', function (e) { if (e.target === panel) M.closePanel(); });
    U.sfx('ui.panelOpenClose.open');
  };
  M.closePanel = function () { if (panel) { panel.remove(); panel = null; U.sfx('ui.panelOpenClose.close'); } };

  // ---------- tiêu đề ----------
  U.SCREENS.title = {
    enter: function () {
      U.music('music.mainMenu', 1.5);
      var s = M.overlayOn('title');
      var saved = U.state.run && U.state.run.phase.kind !== 'end' ? U.state.run : U.loadSaved();
      var hs = U.el('div', 'heroes', s);
      ['Pygmalien', 'Vanessa', 'Dooley'].forEach(function (h, i) { var d = U.el('div', 'h h' + i, hs); d.style.backgroundImage = U.bg(U.HEROES[h].store); });
      var logo = U.el('div', 'logo', s, '<h1>Chợ Phiên</h1><p>Đấu thẻ bài tự động kiểu The Bazaar · 10 ngày, 6 giờ mỗi ngày</p>');
      var col = U.el('div', 'menu', s);
      if (saved && saved.hero) {
        var info = U.el('div', 'saved', col, '<b>' + U.esc(saved.hero) + '</b> · Ngày ' + saved.day + ', giờ ' + saved.hour + ' · ' + saved.wins + ' thắng · uy tín ' + saved.prestige);
        U.bigButton(col, 'yellow', 'Chơi tiếp', 'Tiếp tục run đã lưu', function () { U.resume(saved); }).classList.add('play');
        U.bigButton(col, 'brown', 'Chơi mới', 'Bỏ run cũ, bắt đầu run mới', function () { U.newRun(); });
      } else {
        U.bigButton(col, 'yellow', 'Chơi', 'Bắt đầu run mới', function () { U.newRun(); }).classList.add('play');
      }
      U.bigButton(col, 'blue', 'Đấu thử', 'Xem hai quái đấu nhau (trang xem trận)', function () { root.location.href = 'index.html?view=1'; });
      var snd = U.el('div', 'sndbox', col, '<span>Âm thanh</span>'); soundRow(snd);
      U.el('div', 'foot', s, 'Hình, tiếng và dữ liệu thẻ lấy từ bản demo The Bazaar (Tempo Storm). Bản web làm để học, không bán.');
      logo.style.animationDelay = '80ms';
    },
    exit: function () { M.overlayOff(); }
  };

  // ---------- chọn hero ----------
  var selHero = 'Vanessa';
  var HEX_POS = [[56, 330], [236, 300], [130, 560], [310, 540]]; // hai cột so le như sảnh gốc (hero-select: lục giác ở góc trái trên)
  U.SCREENS.heroSelect = {
    enter: function () {
      U.music('music.mainMenu', 1.5);
      var s = M.overlayOn('herosel');
      var bg = U.el('div', 'bgart', s);
      var col = U.el('div', 'col', s), big = U.el('div', 'big', s), info = U.el('div', 'info', s);
      var list = R().HEROES_PLAYABLE;
      var btns = {};
      function pick(h, silent) {
        selHero = h;
        var Hh = U.HEROES[h];
        Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('sel', k === h); });
        big.style.backgroundImage = U.bg(Hh.store); big.classList.remove('in'); void big.offsetWidth; big.classList.add('in');
        bg.style.background = 'radial-gradient(ellipse 60% 70% at 62% 45%, ' + Hh.color + '66, transparent 70%)';
        info.innerHTML = '<h2>' + U.esc(h) + '</h2><div class="tag">' + U.esc(Hh.tag) + '</div><p>' + U.esc(Hh.desc) + '</p>';
        if (!silent) U.sfx('vo.' + h.toLowerCase() + '.idle', { gap: 1500 }) || U.sfx('ui.equip');
      }
      list.forEach(function (h) {
        var b = U.el('button', 'hex', col); b.type = 'button';
        b.setAttribute('aria-label', h); b.title = h; b.dataset.hero = h;
        U.el('i', 'glow', b).style.backgroundImage = U.bg('art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/UI_HeroSelected.webp');
        U.el('i', 'art', b).style.backgroundImage = U.bg(U.HEROES[h].btn);
        U.el('span', 'plate', b, U.esc(h.toUpperCase()));
        b.addEventListener('click', function () { U.sfx('ui.click'); pick(h); });
        b.addEventListener('pointerenter', function () { U.sfx('ui.hover', { vol: 0.5 }); });
        var hp = HEX_POS[list.indexOf(h)] || HEX_POS[0]; b.style.left = hp[0] + 'px'; b.style.top = hp[1] + 'px';
        btns[h] = b;
      });
      // thanh dưới của sảnh (clip hero-select): nút Quay lại tròn, nút Ready xanh giữa, hai thẻ XẾP HẠNG / THƯỜNG hai bên
      var bar = U.el('div', 'bar', s);
      U.el('div', 'mode l', bar, '<b>XẾP HẠNG</b><small>Có giải thưởng</small>');
      U.el('div', 'mode r on', bar, '<b>THƯỜNG</b><small>Chơi tự do</small>');
      U.bigButton(bar, 'blue', 'Sẵn sàng', 'Bắt đầu run với hero đang chọn', function () {
        U.state.run = U.state.run && U.state.run.phase.kind === 'heroSelect' ? U.state.run : R().newRun({ seed: 1 + Math.floor(Math.random() * 2147483000) });
        U.dispatch({ t: 'pickHero', hero: selHero });
      }).classList.add('play');
      U.button(s, 'back', '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8 2-2-6-6 6-6z"/></svg>', 'Về màn tiêu đề', function () { U.go('title'); }).classList.add('rs-back');
      U.el('div', 'title', s, '<small>Sảnh</small><h1>Chọn nhân vật</h1>');
      pick(list.indexOf(selHero) >= 0 ? selHero : list[0], true);
    },
    exit: function () { M.overlayOff(); },
    key: function (e) { if (e.key === 'Enter') { var b = document.querySelector('.herosel .play'); if (b) b.click(); return true; } }
  };

  // ---------- hết run ----------
  U.SCREENS.end = {
    enter: function (run) {
      var reason = run.phase.reason, win = reason === 'victory';
      U.music(win ? 'music.endrun.win' : 'music.endrun.lose', 1);
      U.clearSaved();
      setTimeout(function () { U.heroVo(win ? (run.prestige >= 20 ? 'runperfect' : 'runvictory') : 'rundefeat'); }, 900);
      var s = M.overlayOn('endrun ' + (win ? 'win' : 'lose'));
      // clip run-end: tối dần ~2 s, huy chương cúp xoay 1,3 s (bạc → vàng), loé sáng, rồi thẻ tổng kết hiện (băng-rôn, bàn cuối, thống kê, CONTINUE)
      var pre = win ? 3300 : 1500;
      s.style.setProperty('--pre', pre + 'ms');
      var pr = U.el('div', 'pre', s, win ? '<i class="medal"></i><i class="burst"></i>' : '');
      if (win) pr.querySelector('.medal').style.backgroundImage = U.bg('art/ui/clock/UI_VictoriesIcon_T_Temp.webp');
      var title = win ? (run.prestige >= 20 ? 'Chiến thắng hoàn hảo' : 'Chiến thắng') : reason === 'prestige' ? 'Hết uy tín' : 'Hết 10 ngày';
      var rib = U.el('div', 'rib', s, '<b>' + run.wins + '</b><span>THẮNG<em>' + U.esc(title) + '</em></span>');
      var hero = U.el('div', 'hero', s); hero.style.backgroundImage = U.bg((U.HEROES[run.hero] || {}).store);
      U.el('div', 'who', s, '<small>' + U.esc(U.HEROES[run.hero] ? U.HEROES[run.hero].tag : '') + '</small><b>' + U.esc(run.hero) + '</b>');
      var st = U.el('div', 'stats', s);
      [['Máu tối đa', String(run.healthMax), U.ICON.health, 'hp'], ['Uy tín', String(run.prestige), U.ICON.prestige, 'pr'], ['Cấp', String(run.level), U.ICON.xp, 'lv'], ['Thu nhập', String(run.income), U.ICON.coin, 'in'], ['Vàng', String(run.gold), U.ICON.coin, 'go']]
        .forEach(function (x) { U.el('div', 'st ' + x[3], st, '<span>' + x[0] + '</span><b><i style="background-image:' + U.bg(x[2]) + '"></i>' + x[1] + '</b>'); });
      var chests = U.el('div', 'chests', s);
      [4, 7, 10].forEach(function (n, i) { U.el('div', 'ch' + (run.wins >= n ? ' on' : ''), chests, '<i style="background-image:' + U.bg(U.ICON.prize) + '"></i><b>+' + [2, 4, 6][i] + '</b><span>' + n + ' thắng</span>'); });
      var bd = U.el('div', 'board', s);
      var info = U.boardInfo(run), n = run.board.hand.length, ch = n > 8 ? 150 : 190;
      run.board.hand.slice().sort(function (a, b) { return a.socket - b.socket; }).forEach(function (c) {
        var el = root.BZCard.create({ uid: 'end' + c.uid, id: c.id, tier: c.tier, size: c.size, ench: c.ench, type: 'Item' }, { h: ch, attrs: (info[c.uid] || {}).attrs || {} });
        el.style.position = 'relative'; bd.appendChild(el);
      });
      if (!run.board.hand.length) U.el('p', 'empty', bd, 'Bàn trống');
      var b = U.el('div', 'btns', s);
      U.bigButton(b, 'brown', 'Về menu', 'Về màn tiêu đề', function () { U.state.run = null; U.go('title'); });
      U.bigButton(b, 'blue', 'Chơi lại', 'Bắt đầu run mới', function () { U.newRun(); }).classList.add('play');
      U.sfx(win ? 'trans.victoryIn' : 'trans.defeatIn');
    },
    exit: function () { M.overlayOff(); }
  };
})(window);
