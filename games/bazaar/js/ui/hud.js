/* Chợ Phiên — HUD bền của run quanh bàn người chơi (bố cục dooley-friends-1.jpg, WIKI §2.1):
   khối hero dưới (chân dung, 12 ô kỹ năng, thanh máu — dựng bằng BZView.setupHero), thẻ cấp + 8 ô XP lục giác (xp-bar-1.png),
   ô trái = rương kho, ô phải = vàng + thu nhập, cột trái = đồng hồ ngày/giờ (6 đèn giờ, kim chỉ giờ, số ngày trên đuôi kim)
   với cung 10 ô chiến thắng phía trên và thanh vương miện uy tín phía dưới (prestige-1.png).
   Đồng hồ: kim quay 360/6·giờ trong 2 s Linear, đèn giờ sáng dần (ClockViewController.cs:166-182, VISUAL §12).
   Số vàng chạy dần tới giá trị mới (tick), chớp đỏ khi thiếu vàng. Cũng dựng các lớp sân khấu riêng của run (U.layers). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  U.SCREENS = U.SCREENS || {}; U.ANIM = U.ANIM || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var H = U.hud = {};
  var E = {};             // phần tử
  var shown = { gold: 0, goldT: 0 };
  var heroKey = null;

  // ---------- lớp sân khấu của run ----------
  U.layers = {
    build: function () {
      var Rf = V().refs, wd = Rf.world, before = Rf.fx;
      function L(cls) { var e = U.el('div', cls); wd.insertBefore(e, before); return e; }
      Rf.runSockets = L('rs-sockets');
      Rf.runTop = L('rs-top');            // nội dung vùng trên (giấy bản đồ, khung gặp gỡ, quầy hàng...)
      Rf.runCards = L('rs-cards');        // thẻ bàn tay + thẻ vùng trên
      Rf.runHud = L('rs-hud');
      Rf.tray = L('rs-tray');
      Rf.dragLayer = U.el('div', 'rs-drag', Rf.stage);
      Rf.overlay = U.el('div', 'rs-overlay', Rf.stage);
      Rf.tip2 = U.el('div', 'rs-tip2', Rf.stage);
    }
  };

  // bảng tooltip hai dải (prestige-1.png): tiêu đề serif + thân chữ
  U.panelTip = function (rect, title, body) {
    var t = V().refs.tip2;
    if (!rect) { t.classList.remove('show'); return; }
    t.innerHTML = '<h4>' + title + '</h4><div class="b">' + body + '</div>';
    t.style.display = 'block';
    var w = t.offsetWidth, h = t.offsetHeight, x = rect.x + rect.w + 18;
    if (x + w > 1908) x = rect.x - w - 18;
    var y = Math.max(10, Math.min(1070 - h, rect.y + rect.h / 2 - h / 2));
    t.style.left = Math.round(x) + 'px'; t.style.top = Math.round(y) + 'px';
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  };
  function hoverTip(el, fn) {
    el.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      var b = el.getBoundingClientRect(), p = V().toStage(b.left, b.top), r = fn();
      U.panelTip({ x: p.x, y: p.y, w: b.width / V().scale, h: b.height / V().scale }, r[0], r[1]);
      if (r[2]) U.sfx(r[2], { vol: 0.6 });
    });
    el.addEventListener('pointerleave', function () { U.panelTip(null); });
  }

  H.build = function () {
    var hud = V().refs.runHud;
    // ----- đồng hồ (cột trái) -----
    var c = E.clock = U.el('div', 'rs-clock', hud);
    c.style.backgroundImage = U.bg('art/ui/clock/Clock_Encounter_Background_TUI.webp');
    E.trophy = U.el('div', 'trophy', c); E.trophy.style.backgroundImage = U.bg('art/ui/clock/UI_VictoriesIcon_T_Temp.webp');
    E.wins = []; var arc = U.el('div', 'arc', c);
    for (var i = 0; i < 10; i++) { var s = U.el('i', '', arc); s.style.setProperty('--i', i); E.wins.push(s); }
    var face = E.face = U.el('div', 'face', c);
    var gear = U.el('div', 'gear', face); gear.style.backgroundImage = U.bg('art/ui/clock/ClockEncounter_Empty_TD.webp');
    E.gear = gear;
    var ring = U.el('div', 'ring', face); ring.style.backgroundImage = U.bg('art/ui/clock/ClockEncounter_Empty_TD.webp');
    E.fill = U.el('div', 'hourfill', face); E.fill.style.backgroundImage = U.bg('art/ui/clock/Clock_Encounter_HourFill_TUI.webp');
    E.hand = U.el('div', 'hand', face,
      '<svg viewBox="0 0 40 120"><defs><linearGradient id="rsNd" x1="0" x2="1"><stop offset="0" stop-color="#fff6dc"/><stop offset=".5" stop-color="#d9c79e"/><stop offset="1" stop-color="#9c8458"/></linearGradient></defs>' +
      '<path d="M20 1 L31 30 L24.5 34 L24.5 92 L29 100 L20 116 L11 100 L15.5 92 L15.5 34 L9 30 Z" fill="url(#rsNd)" stroke="#4a3418" stroke-width="1.8"/>' +
      '<circle cx="20" cy="60" r="0" fill="none"/></svg><b class="day">1</b>');
    E.day = E.hand.querySelector('.day');
    U.el('div', 'pin', face);
    E.crown = U.el('div', 'crownbar', c);
    E.prest = U.el('i', '', E.crown);
    E.prestTxt = U.el('b', '', E.crown);
    hoverTip(face, function () { var r = U.state.run; return ['Giờ / Ngày', '<span class="o">Bây giờ là</span> giờ ' + (r ? r.hour : 0) + ' <span class="o">của</span> ngày ' + (r ? r.day : 1) + '.', 'board.hoverClock']; });
    hoverTip(arc, function () { var r = U.state.run; return ['Chiến thắng: <em>' + (r ? r.wins : 0) + '</em>/10', 'Thắng đủ 10 trận đấu người chơi để hoàn thành run. Mốc rương ở 4, 7 và 10 trận thắng.']; });
    hoverTip(E.crown, function () { var r = U.state.run; return ['Uy tín: <em>' + (r ? r.prestige : 20) + '</em>/20', 'Thua trận đấu người chơi mất uy tín bằng số ngày. Uy tín về 0 thì run kết thúc.']; });

    // ----- cấp + XP dưới chân dung -----
    E.lvl = U.el('div', 'rs-level', hud, '<b>1</b>');
    E.lvl.style.backgroundImage = U.bg('art/ui/board_ui/Experience_LevelBanner_TUI.webp');
    E.lvlN = E.lvl.firstChild;
    E.xp = U.el('div', 'rs-xp', hud); E.xp.style.backgroundImage = U.bg('art/ui/board_ui/Experience_LevelBackdrop_TUI.webp');
    E.pips = [];
    for (var k = 0; k < 8; k++) { var p = U.el('i', '', E.xp); p.style.backgroundImage = U.bg('art/ui/board_ui/Experience_Pip_TUI.webp'); E.pips.push(p); }
    hoverTip(E.xp, function () { var r = U.state.run, per = R().mode().ExperiencePerLevel; return ['Kinh nghiệm', 'Cấp ' + r.level + ' · ' + (r.xp - (r.level - 1) * per) + '/' + per + ' XP tới cấp kế. Mỗi giờ trôi qua +1 XP; thắng quái được thêm XP.']; });
    // tooltip kỹ năng (huy chương quanh chân dung)
    var heroEl = V().refs.heroes[0];
    heroEl.addEventListener('pointerover', function (ev) {
      var sk = ev.target.closest && ev.target.closest('.bz-skill[data-uid]'); if (!sk || !U.state.run || V().refs.stage.classList.contains('m-fight')) return;
      var c = R().findCard(U.state.run, sk.dataset.uid); if (!c) return;
      var bi = U.boardInfo(U.state.run)[c.uid] || {}, info = U.tipInfo(c, bi.attrs || {}, bi.boards); if (!info) return;
      var r = U.rectOf(sk); root.BZTooltip.show(info, { x: r.x, y: r.y, w: r.w, h: r.h }); U.sfx('skill.hover', { vol: 0.5 });
    });
    heroEl.addEventListener('pointerout', function (ev) { var sk = ev.target.closest && ev.target.closest('.bz-skill[data-uid]'); if (sk && !(ev.relatedTarget && sk.contains(ev.relatedTarget)) && !V().refs.stage.classList.contains('m-fight')) root.BZTooltip.hide(); });
    U.tickers.push(H.tick);
  };

  // ---------- khối hero + hai ô cạnh (gọi lại khi kỹ năng / máu đổi, và sau mỗi trận) ----------
  function skillList(run) {
    return run.board.skills.map(function (s) { return { uid: s.uid, id: s.id, tier: s.tier, art: U.art(s.id) }; });
  }
  H.mountHero = function (run, force) {
    var key = run.hero + '|' + run.healthMax + '|' + run.level + '|' + run.board.skills.map(function (s) { return s.uid + s.tier; }).join(',');
    if (!force && key === heroKey) return;
    heroKey = key;
    var M = U.HEROES[run.hero] || {};
    V().setupHero(0, { name: run.hero, level: run.level, tier: 'Gold', char: M.portrait, bg: null, skills: skillList(run), hpMax: run.healthMax });
    var h = V().hero(0);
    if (h) { h.art.classList.add('hero-art'); }
    V().updateHero(0, { health: run.healthMax, healthMax: run.healthMax }, U.now());
    var S = V().refs.sides[0];
    // ô trái: rương kho
    S.l.innerHTML = '';
    var ch = E.chest = U.el('div', 'rs-chest', S.l);
    ch.innerHTML = '<div class="bar"></div><div class="ico"></div><div class="lb">Kho <b></b></div>';
    ch.querySelector('.ico').style.backgroundImage = U.bg(U.ICON.stash);
    E.chestBar = ch.querySelector('.bar'); E.chestN = ch.querySelector('.lb b');
    for (var i = 0; i < 10; i++) U.el('i', '', E.chestBar);
    ch.addEventListener('click', function () { if (U.cards) U.cards.toggleStash(); });
    hoverTip(ch, function () { return ['Kho đồ', 'Bấm (hoặc phím Space) để mở kho. Kéo thẻ thả vào rương để cất. Đồ trong kho không đánh nhưng hiệu ứng ngoài trận vẫn chạy.', 'board.hoverChest']; });
    // ô phải: vàng + thu nhập
    S.r.innerHTML = '';
    var g = E.goldPanel = U.el('div', 'rs-gold', S.r);
    g.innerHTML = '<div class="row"><span class="inc">+<b></b></span><span class="gd"><i></i><b></b></span></div><div class="pile"></div>';
    g.querySelector('.pile').style.backgroundImage = U.bg(U.ICON.coins);
    g.querySelector('.gd i').style.backgroundImage = U.bg(U.ICON.coin);
    E.inc = g.querySelector('.inc b'); E.gold = g.querySelector('.gd b');
    hoverTip(g, function () { var r = U.state.run; return ['Vàng: <em>' + r.gold + '</em>', 'Thu nhập <span class="o">+' + r.income + '</span> vàng mỗi đầu ngày. Bán đồ để lấy lại vàng.']; });
    shown.gold = run.gold; E.gold.textContent = run.gold;
    H.update(run);
  };
  H.goldRect = function () { return rectOf(E.goldPanel && E.goldPanel.querySelector('.gd i')) || { x: 1400, y: 840, w: 40, h: 40, cx: 1420, cy: 860 }; };
  H.xpRect = function () { return rectOf(E.xp) || { cx: 960, cy: 1020 }; };
  H.chestRect = function () { return rectOf(E.chest) || { cx: 494, cy: 900 }; };
  H.clockRect = function () { return rectOf(E.clock); };
  H.crownRect = function () { return rectOf(E.crown); };
  H.arcRect = function (i) { return rectOf(E.wins[Math.max(0, Math.min(9, i))]); };
  function rectOf(el) {
    if (!el) return null;
    var b = el.getBoundingClientRect(), p = V().toStage(b.left, b.top), s = V().scale;
    return { x: p.x, y: p.y, w: b.width / s, h: b.height / s, cx: p.x + b.width / s / 2, cy: p.y + b.height / s / 2 };
  }
  U.rectOf = rectOf;

  // ---------- cập nhật số ----------
  var clockSt = { hour: -1, day: -1 };
  H.update = function (run, ctx) {
    if (!run || !E.gold) return;
    if (run.hero) H.mountHero(run);
    E.inc.textContent = run.income;
    if (shown.goldTarget !== run.gold) { shown.goldFrom = shown.gold; shown.goldTarget = run.gold; shown.goldT = U.now() + ((ctx && ctx.goldDelay) || 0); }
    E.lvlN.textContent = run.level;
    var per = R().mode().ExperiencePerLevel, inLvl = Math.max(0, Math.min(per, run.xp - (run.level - 1) * per));
    E.pips.forEach(function (p, i) { var on = i < inLvl; if (p._on !== on) { p._on = on; p.classList.toggle('on', on); if (on && ctx) { p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); } } });
    var used = 0; run.board.stash.forEach(function (c) { used += c.size; });
    E.chestN.textContent = run.board.stash.length + '';
    Array.prototype.forEach.call(E.chestBar.children, function (b, i) { b.classList.toggle('on', i < used); });
    // đồng hồ
    if (clockSt.hour !== run.hour || clockSt.day !== run.day) {
      var turns = (run.day - 1) * 6 + run.hour;
      E.hand.style.transform = 'rotate(' + (turns * 60) + 'deg)';
      E.day.style.transform = 'rotate(' + (-turns * 60) + 'deg)';
      E.gear.style.transform = 'rotate(' + (-turns * 30) + 'deg)';
      var frac = run.hour / 6;
      E.fill.style.setProperty('--f', (frac * 360 + 28).toFixed(1) + 'deg');
      E.fill.classList.toggle('none', run.hour === 0);
      E.day.textContent = run.day;
      if (clockSt.hour >= 0 && ctx) U.sfx('board.dayTick');
      clockSt.hour = run.hour; clockSt.day = run.day;
    }
    E.wins.forEach(function (w, i) { w.classList.toggle('on', i < run.wins); });
    var pm = R().mode().Prestige.PrestigeMax;
    E.prest.style.transform = 'scaleX(' + Math.max(0, run.prestige / pm).toFixed(3) + ')';
    E.prestTxt.textContent = run.prestige;
  };
  H.tick = function (now) {
    if (!E.gold || shown.goldTarget == null) return;
    var d = now - shown.goldT;
    if (d < 0) return;
    var u = Math.min(1, d / 450), v = Math.round(shown.goldFrom + (shown.goldTarget - shown.goldFrom) * (1 - Math.pow(1 - u, 2)));
    if (v !== shown.gold) { shown.gold = v; E.gold.textContent = v; E.goldPanel.classList.remove('tick'); void E.goldPanel.offsetWidth; E.goldPanel.classList.add('tick'); }
  };
  H.flashGold = function () { if (!E.goldPanel) return; E.goldPanel.classList.remove('deny'); void E.goldPanel.offsetWidth; E.goldPanel.classList.add('deny'); };
  H.pulse = function (which) {
    var e = which === 'crown' ? E.crown : which === 'arc' ? E.clock : which === 'xp' ? E.xp : which === 'level' ? E.lvl : which === 'clock' ? E.face : null;
    if (!e) return; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse');
  };
  H.show = function (on) { V().refs.runHud.style.display = on ? '' : 'none'; };
  H.reset = function () { heroKey = null; clockSt = { hour: -1, day: -1 }; shown = { gold: 0, goldT: 0 }; };
})(window);
