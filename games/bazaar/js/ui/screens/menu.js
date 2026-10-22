/* Chợ Phiên — các màn toàn màn hình: SẢNH (màn tiêu đề và phase heroSelect dùng chung một sảnh như bản gốc, hero-select 12.jpg: hero lục giác
   cột trái, hero to giữa, bảng người chơi + ví kỷ lục, thẻ XẾP HẠNG | Sẵn sàng | THƯỜNG), hết run (phase end: huy chương, rương, thống kê,
   bàn cuối + "Chơi lại"). Kèm nút bánh răng trong run (âm lượng, toàn màn hình, về menu, bỏ run) — có cả trong trận (REF-run-flow "Settings
   cog bottom-right"); bảng mở thì trận dừng, phím của bàn phía sau bị chặn (INTERACT-3/8). Bỏ run / chơi mới phải xác nhận (INTERACT-13).
   Kiểu dáng ở css/lobby.css. */
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
  var pausedByPanel = false;
  M.panelOpen = function () { return !!panel; };
  function runLine(r) { return r && r.hero ? U.esc(r.hero) + ' · ngày ' + r.day + ', giờ ' + r.hour + ' · ' + r.wins + ' thắng · uy tín ' + r.prestige : ''; }
  function fsOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFs() {
    var d = document, el = d.documentElement;
    try {
      if (fsOn()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else {
        var p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (p && p.then) p.then(function () { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) { /* bỏ qua */ } }).catch(function () {});
      }
    } catch (e) { U.toast('Trình duyệt không cho toàn màn hình'); }
  }
  M.openPanel = function () {
    if (panel) { M.closePanel(); return; }
    if (U.drag) U.drag.cancel();
    // trận đang phát: dừng lại khi mở bảng, đóng bảng thì chạy tiếp (nếu bảng là thứ đã dừng nó)
    pausedByPanel = !!(U.combat && U.combat.active() && !U.combat.paused() && U.combat.pause(true));
    panel = U.el('div', 'rs-panel', V().refs.stage);
    var box = U.el('div', 'box', panel);
    U.el('h2', '', box, 'Tạm nghỉ');
    U.el('p', 'sub', box, (U.combat && U.combat.active() ? 'Trận đang tạm dừng. ' : '') + 'Run tự lưu sau mỗi nước đi.');
    soundRow(box);
    var b = U.el('div', 'btns', box);
    U.bigButton(b, 'yellow', 'Chơi tiếp', 'Đóng bảng (Esc)', function () { M.closePanel(); });
    var fs = U.bigButton(b, 'blue', fsOn() ? 'Thoát toàn màn hình' : 'Toàn màn hình', 'Phóng to trò chơi ra cả màn hình (điện thoại: xoay ngang)', function () { toggleFs(); M.closePanel(); });
    if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) fs.style.display = 'none';
    U.bigButton(b, 'brown', 'Về menu chính', 'Về màn tiêu đề (run vẫn được lưu)', function () { M.closePanel(true); if (U.combat) U.combat.stop(); U.go('title'); });
    U.bigButton(b, 'red', 'Bỏ run này', 'Xoá run đang chơi (hỏi lại trước)', function () {
      var r = U.state.run;
      U.confirm({ title: 'Bỏ run đang chơi?', body: runLine(r) + '<br>Run sẽ bị xoá, không lấy lại được.', yes: 'Bỏ run', no: 'Giữ lại', danger: true }, function () {
        M.closePanel(true); if (U.combat) U.combat.stop(); U.clearSaved(); U.state.run = null; U.go('title');
      });
    });
    panel.addEventListener('pointerdown', function (e) { if (e.target === panel) M.closePanel(); });
    U.sfx('ui.panelOpenClose.open');
  };
  // closePanel(leaving): leaving = rời run (về menu / bỏ run) → không chạy tiếp trận
  M.closePanel = function (leaving) {
    if (!panel) return;
    panel.remove(); panel = null; U.sfx('ui.panelOpenClose.close');
    if (pausedByPanel && leaving !== true && U.combat) U.combat.pause(false);
    pausedByPanel = false;
  };

  // ---------- hồ sơ người chơi + bậc (sảnh góc trái trên, màn VS, thẻ hết run) ----------
  // Bản demo không có tài khoản: hồ sơ = kỷ lục lưu trong trình duyệt (số thắng và vàng nhiều nhất của một run), gộp thêm run.best của run đang lưu.
  var PROF_KEY = 'bz_profile';
  // Chức danh bậc xếp hạng: máy chủ gốc cấp (không có trong GameData.db). Ba tên thấy trên clip (wUzq6Q4u9Jc ?t=708: APPRENTICE MERCHANT,
  // GRAND FOUNDER; hero-select/12.jpg: VANGUARD TRAILBLAZER); các bậc còn lại và ngưỡng thắng [ĐỀ XUẤT] để ánh xạ 0..10 thắng lên 7 bậc.
  var RANKS = [[0, 'Apprentice Merchant'], [1, 'Street Hawker'], [2, 'Vanguard Trailblazer'], [4, 'Master Trader'], [6, 'Market Baron'], [8, 'Guild Master'], [10, 'Grand Founder']];
  U.rankIndex = function (wins, prestige) {
    var i = 0; RANKS.forEach(function (r, k) { if ((wins || 0) >= r[0]) i = k; });
    if ((prestige || 0) >= 20 && i < RANKS.length - 1) i++; // uy tín đầy (20/20) lên một bậc [ĐỀ XUẤT]
    return i;
  };
  U.rankTitle = function (wins, prestige) { return RANKS[U.rankIndex(wins, prestige)][1]; };
  M.profile = function () {
    var p = { wins: 0, gold: 0, level: 0, runs: 0 };
    try { var s = JSON.parse(root.localStorage.getItem(PROF_KEY) || 'null'); if (s) { p.wins = +s.wins || 0; p.gold = +s.gold || 0; p.level = +s.level || 0; p.runs = +s.runs || 0; } } catch (e) { /* bỏ qua */ }
    return p;
  };
  // gộp kỷ lục của một run (run.best + trạng thái hiện tại)
  function mergeRun(p, run) {
    var b = (run && run.best) || {};
    p.wins = Math.max(p.wins, (run && run.wins) || 0, b.wins || 0); p.gold = Math.max(p.gold, (run && run.gold) || 0, b.gold || 0);
    p.level = Math.max(p.level, (run && run.level) || 0, b.level || 0);
    return p;
  }
  // ended: run vừa kết thúc → đếm thêm một run
  M.noteRun = function (run, ended) {
    if (!run || !run.hero) return;
    var p = mergeRun(M.profile(), run); if (ended) p.runs++;
    try { root.localStorage.setItem(PROF_KEY, JSON.stringify(p)); } catch (e) { /* chế độ riêng tư */ }
  };

  // ---------- sảnh (tiêu đề + chọn hero là MỘT màn như bản gốc) ----------
  U.SCREENS.title = {
    enter: function () { lobby('title'); },
    exit: function () { lobbyExit(); },
    key: function (e) { return lobbyKey(e); }
  };

  // ---------- chọn hero (sảnh, clip hero-select B ?t=28: lục giác hai cột so le góc trái, hero đang chọn to hơn có bảng tên) ----------
  // Đủ 8 hero theo BZ_HEROES.order; The Dragons playable:false → khoá, bấm vào thì hiện lý do. Bảng phải: tagline, cơ chế,
  // khởi đầu thật của hero (BZ_HEROES.heroes[h].start: vàng/thu nhập nền, ba lựa chọn mở màn, kỹ năng có sẵn, hiệu ứng), cỡ bể thẻ.
  // Giọng: chọn = vo.<hero>.idle, bấm lại hero đang chọn = vo.<hero>.multiclick, đứng yên 14 s = idle lần nữa.
  var selHero = 'Vanessa', idleT = 0;
  var START_ICON = { income: 'art/ui/rewards/Reward_PersonalTest_GoldStart_D.webp', item: 'art/ui/rewards/Reward_PersonalTest_EnchantedStart_D.webp',
    skill: 'art/ui/rewards/Reward_PersonalTest_SkillStart_D.webp' };
  // 4 hàng × 2 cột, hàng lẻ dịch phải nửa ô (sảnh gốc: Pyg/Mak, Vanessa/Jules, Dooley/Stelle; thêm Karnok/The Dragons)
  var HEX_ORDER = ['Pygmalien', 'Mak', 'Vanessa', 'Jules', 'Dooley', 'Stelle', 'Karnok', 'TheDragons'];
  function hexPos(i) { var r = Math.floor(i / 2), c = i % 2; return [40 + (r % 2) * 96 + c * 192, 150 + r * 172]; }
  M.heroList = function () {
    var H = root.BZ_HEROES, order = (H && H.order) || R().HEROES_ALL || [];
    var all = HEX_ORDER.filter(function (h) { return order.indexOf(h) >= 0; });
    order.forEach(function (h) { if (all.indexOf(h) < 0) all.push(h); });
    return all.map(function (h) {
      var d = (H && H.heroes && H.heroes[h]) || {};
      return { id: h, title: d.title || h, playable: R().HEROES_PLAYABLE.indexOf(h) >= 0, data: d, ui: U.HEROES[h] || {} };
    });
  };
  function effName(id) {
    var e = root.BZ_HEROES && root.BZ_HEROES.effects && root.BZ_HEROES.effects[id];
    var t = (e && e.Localization && e.Localization.Title && e.Localization.Title.Text) || (e && e.InternalName) || (R().tpl(id) && R().title(R().tpl(id)));
    return t || null;
  }
  function startHtml(h) {
    var st = h.data.start || {}, p = h.data.pool || {}, out = '';
    out += '<div class="sec"><small>Khởi đầu</small><div class="eco"><span><i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + (st.baseGold != null ? st.baseGold : 8) +
      '</b> vàng</span><span><i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>+' + (st.baseIncome != null ? st.baseIncome : 5) + '</b> thu nhập / ngày</span></div>';
    var opts = st.options || [];
    if (opts.length) {
      out += '<div class="opts">' + opts.map(function (o) {
        var lb = o.key === 'income' ? '+' + o.gold + ' vàng, +' + o.income + ' thu nhập' : o.key === 'item' ? 'Vật phẩm ' + (o.size === 'Small' ? 'nhỏ ' : '') + (U.TIER_VI[o.tier] || o.tier || '') + (o.enchanted ? ' yểm bùa' : '')
          : 'Kỹ năng ' + (U.TIER_VI[o.tier] || o.tier || '');
        return '<span class="o"><i style="background-image:' + U.bg(START_ICON[o.key] || START_ICON.income) + '"></i>' + U.esc(lb) + '</span>';
      }).join('') + '</div>';
    }
    out += '</div>';
    var innate = (st.fixedSkills || []).map(function (id) {
      var t = R().tpl(id); return t ? '<span class="sk"><i style="background-image:' + U.bg(U.art(id)) + '"></i>' + U.esc(R().title(t)) + '</span>' : '';
    }).join('');
    var eff = (st.playerEffects || []).concat(st.socketEffects || []).map(effName).filter(function (n, i, a) { return n && a.indexOf(n) === i; });
    if (innate || eff.length) out += '<div class="sec"><small>Có sẵn</small><div class="innate">' + innate + eff.map(function (n) { return '<span class="ef">' + U.esc(n) + '</span>'; }).join('') + '</div></div>';
    if (p.items) out += '<div class="pool">Bể thẻ: ' + p.items + ' vật phẩm · ' + p.skills + ' kỹ năng</div>';
    return out;
  }
  // ---------- sảnh (clip hero-select 12.jpg / 22.jpg): lục giác hero cột trái, hero to ở giữa, bảng người chơi trái trên, ví phải trên,
  // thanh dưới: thẻ XẾP HẠNG | Sẵn sàng | THƯỜNG. Hai thẻ chế độ chỉ là nhãn (bản web chưa có xếp hạng): cả hai bắt đầu cùng một run.
  var starting = false, mode = 'normal', lobbyIds = null;
  var SVG_BACK = '<svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8 2-2-6-6 6-6z"/></svg>';
  var SVG_GEAR = '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.4h-4L10.6 6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>';
  var SVG_SWORDS = '<svg viewBox="0 0 24 24"><path d="M3 3l7 1 9.5 9.5-2 2L8 6zM21 3l-7 1-2 2 3 3 5-4zM5 15l4 4-2 2-2.5-1L3 17.5zM15 14l5 5-1.5 2L14 17z"/></svg>';
  function rbtn(parent, cls, svg, title, fn) {
    return U.button(parent, 'lb-rnd ' + cls, '<i class="fr"></i><i class="ct"></i>' + svg, title, fn);
  }
  function lobby(kind) {
    U.music('music.mainMenu', 1.5);
    starting = false;
    var s = M.overlayOn('lobby ' + kind);
    // run lưu dở (chỉ ở màn tiêu đề; run trong bộ nhớ chưa có hero không thay được bản lưu)
    var saved = kind === 'title' ? (U.state.run && U.state.run.hero && U.state.run.phase.kind !== 'end' ? U.state.run : U.loadSaved()) : null;
    if (saved && !saved.hero) saved = null;
    U.el('div', 'lb-bg', s);
    var col = U.el('div', 'col', s), big = U.el('div', 'big', s), info = U.el('div', 'info', s);
    var list = M.heroList(), btns = {}, ready = null;
    // bảng người chơi: bậc theo kỷ lục thắng + kỷ lục của run đang lưu
    var prof = mergeRun(M.profile(), saved);
    var me = U.el('div', 'lb-me', s, '<i class="emb"></i><div><small>' + U.esc(U.rankTitle(prof.wins, 0)) + '</small><b>Thương nhân</b></div>');
    me.title = 'Bậc theo số trận PvP thắng nhiều nhất trong một run (' + prof.wins + ')';
    U.el('div', 'lb-wallet', s,
      '<div class="chip" title="Số trận thắng nhiều nhất trong một run"><i class="tr"></i><b>' + prof.wins + '</b></div>' +
      '<div class="chip" title="Vàng nhiều nhất trong một run"><i class="gd" style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + prof.gold + '</b></div>');
    function arm() { clearTimeout(idleT); idleT = setTimeout(function () { U.sfx('vo.' + U.voOf(selHero) + '.idle', { gap: 6000 }); arm(); }, 14000); }
    function pick(h, silent) {
      var again = h === selHero;
      selHero = h;
      var x = list.filter(function (y) { return y.id === h; })[0] || list[0], Hh = x.ui;
      Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('sel', k === h); });
      // ảnh tĩnh luôn là chỗ lùi; hero Spine (W-30) thay vào khi sẵn sàng, hero Spine cũ vẫn chạy tới lúc đó cho khỏi nháy
      var still = U.bg(Hh.store || Hh.portrait), SP = root.BZSpine;
      big.dataset.still = still;
      if (!(SP && x.playable && big.classList.contains('sp-on'))) big.style.backgroundImage = still;
      big.classList.remove('in'); void big.offsetWidth; big.classList.add('in');
      if (SP && x.playable && SP.supported(h)) {
        SP.show(big, h, function () { if (selHero === h) { big.classList.add('sp-on'); big.style.backgroundImage = 'none'; } },
          function () { big.classList.remove('sp-on'); big.style.backgroundImage = big.dataset.still; });
      } else if (SP) { SP.hide(); big.classList.remove('sp-on'); big.style.backgroundImage = still; }
      big.classList.toggle('locked', !x.playable);
      info.style.setProperty('--hc', Hh.color || '#ffd36b');
      info.innerHTML = '<h2>' + U.esc(x.title) + '</h2><div class="tag">' + U.esc(Hh.tag || '') + '</div><p>' + U.esc(Hh.desc || '') + '</p>' +
        (x.playable ? startHtml(x) : '<div class="lockmsg"><b>Chưa chơi được</b>' + U.esc(x.data.reason || 'Bản demo không có thẻ của hero này.') + '</div>');
      info.classList.remove('in'); void info.offsetWidth; info.classList.add('in');
      if (ready) { ready.classList.toggle('off', !x.playable && !saved); ready.title = saved ? 'Tiếp tục run đã lưu' : x.playable ? 'Bắt đầu run với ' + x.title : x.title + ' chưa chơi được'; }
      if (!silent) U.sfx('vo.' + U.voOf(h) + (again ? '.multiclick' : '.idle'), { gap: 900 }) || U.sfx('ui.equip');
      arm();
    }
    M.pickHero = pick;
    list.forEach(function (x, i) {
      var h = x.id, b = U.el('button', 'hex' + (x.ui.btn ? '' : ' made') + (x.playable ? '' : ' locked'), col); b.type = 'button';
      b.setAttribute('aria-label', x.title + (x.playable ? '' : ' (khoá)')); b.title = x.title; b.dataset.hero = h;
      U.el('i', 'glow', b).style.backgroundImage = U.bg('art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/UI_HeroSelected.webp');
      var art = U.el('i', 'art', b);
      if (x.ui.btn) art.style.backgroundImage = U.bg(x.ui.btn);
      else U.el('b', '', art).style.backgroundImage = U.bg(x.ui.portrait); // không có Btn_*_TUI: lục giác dựng bằng CSS quanh chân dung
      if (!x.playable) U.el('i', 'lk', b, '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>');
      U.el('span', 'plate', b, U.esc(x.title.toUpperCase()));
      b.addEventListener('click', function () { U.sfx('ui.click'); pick(h); });
      b.addEventListener('pointerenter', function () { U.sfx('ui.hover', { vol: 0.5 }); });
      var hp = hexPos(i); b.style.left = hp[0] + 'px'; b.style.top = hp[1] + 'px';
      b.style.animationDelay = (i * 45) + 'ms';
      btns[h] = b;
    });
    // thanh dưới: hai thẻ chế độ (nhãn) hai bên nút Sẵn sàng xanh
    var bar = U.el('div', 'bar', s);
    function pill(side, key, name, sub) {
      var p = U.el('button', 'mode ' + side + (mode === key ? ' on' : ''), bar, '<i class="fr"></i><i class="ct"></i><b>' + name + '</b><small>' + sub + '</small>');
      p.type = 'button'; p.dataset.mode = key; p.title = name + ': cả hai chế độ chơi cùng một run (bản web chưa tính hạng)';
      p.addEventListener('click', function () {
        mode = key; U.sfx('ui.click');
        Array.prototype.forEach.call(bar.querySelectorAll('.mode'), function (m) { m.classList.toggle('on', m.dataset.mode === mode); });
      });
      return p;
    }
    pill('l', 'ranked', 'XẾP HẠNG', 'Thắng lấy rương');
    pill('r', 'normal', 'THƯỜNG', 'Chơi tự do');
    function begin() {
      if (starting || U.state.pending) return;
      // điện thoại: vào run thì xin toàn màn hình (thanh địa chỉ ăn ~15% chiều cao màn ngang); bảng tạm nghỉ có nút thoát
      var de = document.documentElement;
      if (V().small && !fsOn() && (de.requestFullscreen || de.webkitRequestFullscreen) && root.matchMedia('(pointer: coarse)').matches) toggleFs();
      if (saved) { starting = true; U.resume(saved); return; }
      var x = list.filter(function (y) { return y.id === selHero; })[0];
      if (!x || !x.playable) { U.sfx('ui.noSpace'); U.toast((x ? x.title : selHero) + ' chưa chơi được trong bản demo'); return; }
      if (!(U.state.run && U.state.run.phase.kind === 'heroSelect')) {
        var q = +new URLSearchParams(root.location.search).get('seed');
        U.state.run = R().newRun({ seed: q > 0 ? q : 1 + Math.floor(Math.random() * 2147483000) });
      }
      starting = true;
      var r = U.dispatch({ t: 'pickHero', hero: selHero });
      if (r && r.ok === false) starting = false;
    }
    ready = U.button(bar, 'lb-ready play', '<i class="fr"></i><i class="ct"></i><span>' + (saved ? 'Chơi tiếp' : 'Sẵn sàng') + '</span>', 'Bắt đầu run với hero đang chọn', begin);
    if (saved) {
      var sv = U.el('div', 'lb-saved', s, '<b>' + U.esc(saved.hero) + '</b> · Ngày ' + saved.day + ', giờ ' + saved.hour + ' · ' + saved.wins + ' thắng · uy tín ' + saved.prestige);
      var nb = U.button(s, 'lb-newrun', 'Chơi mới', 'Bắt đầu run mới (run cũ chỉ bị thay khi bạn chọn hero)', function () {
        U.confirm({ title: 'Bắt đầu run mới?', body: 'Run đang lưu: ' + runLine(saved) + '<br>Chọn hero xong thì run cũ bị thay.', yes: 'Chơi mới', no: 'Thôi' }, function () {
          saved = null; ready.querySelector('span').textContent = 'Sẵn sàng'; nb.remove(); sv.remove(); pick(selHero, true); begin();
        });
      });
    }
    // nút tròn: quay lại (chỉ ở màn chọn hero sau một run), Đấu thử, cài đặt
    var bx = 58;
    if (kind === 'heroSelect') { rbtn(s, 'lb-back', SVG_BACK, 'Về màn tiêu đề', function () { U.go('title'); }).style.left = bx + 'px'; bx += 92; }
    rbtn(s, 'lb-view', SVG_SWORDS, 'Đấu thử: xem hai quái đấu nhau (trang xem trận)', function () { root.location.href = 'index.html?view=1'; }).style.left = bx + 'px';
    rbtn(s, 'lb-gear', SVG_GEAR, 'Cài đặt (âm lượng, toàn màn hình)', function () { M.openPanel(); });
    U.el('div', 'foot', s, 'Hình, tiếng và dữ liệu thẻ lấy từ bản demo The Bazaar (Tempo Storm). Bản web làm để học, không bán.');
    var ids = list.map(function (x) { return x.id; });
    var cur0 = saved && ids.indexOf(saved.hero) >= 0 ? saved.hero : selHero;
    pick(ids.indexOf(cur0) >= 0 ? cur0 : ids[0], true);
    lobbyIds = ids;
  }
  function lobbyExit() { clearTimeout(idleT); if (root.BZSpine) root.BZSpine.hide(); M.overlayOff(); }
  function lobbyKey(e) {
    if (e.key === 'Enter') { var b = document.querySelector('.lobby .play'); if (b) b.click(); return true; }
    if (e.key === 'Escape') { if (U.state.screen === 'heroSelect') U.go('title'); return true; }
    var d = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[e.key];
    if (d && lobbyIds) { var i = (lobbyIds.indexOf(selHero) + d + lobbyIds.length) % lobbyIds.length; U.sfx('ui.click'); M.pickHero(lobbyIds[i]); return true; }
  }
  U.SCREENS.heroSelect = {
    enter: function () { lobby('heroSelect'); },
    exit: function () { lobbyExit(); },
    key: function (e) { return lobbyKey(e); }
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
      // huy chương = cúp UI_Profile_Trophy_* theo mốc rương đạt được (10 Vàng, 7 Bạc, 4 Đồng; chưa đủ 4 thắng: cúp đồng xám)
      var CH = [{ w: 10, k: 'Gold', vi: 'Vàng', img: 3 }, { w: 7, k: 'Silver', vi: 'Bạc', img: 2 }, { w: 4, k: 'Bronze', vi: 'Đồng', img: 1 }];
      var earned = CH.filter(function (x) { return run.wins >= x.w; })[0] || null;
      var medalImg = 'art/ui/ui_sprite_atlas/UI_Profile_Trophy_' + (earned ? earned.k : 'Bronze') + '.webp';
      M.noteRun(run, true);
      root.BZTooltip.hide(); // tooltip của thẻ đang rê ở màn trước không được kẹt lại trên màn kết thúc
      var pre = win ? 3300 : 2400;
      s.style.setProperty('--pre', pre + 'ms');
      var pr = U.el('div', 'pre', s, '<i class="medal' + (earned ? '' : ' none') + '"></i><i class="burst"></i><i class="ring"></i>');
      pr.querySelector('.medal').style.backgroundImage = U.bg(medalImg);
      var title = win ? (run.prestige >= 20 ? 'Chiến thắng hoàn hảo' : 'Chiến thắng') : reason === 'prestige' ? 'Hết uy tín' : 'Hết 10 ngày';
      var rib = U.el('div', 'rib', s, '<i class="mdl' + (earned ? '' : ' none') + '"></i><b>' + run.wins + '</b><span>THẮNG<em>' + U.esc(title) + '</em></span>');
      rib.querySelector('.mdl').style.backgroundImage = U.bg(medalImg);
      var hero = U.el('div', 'hero', s); hero.style.backgroundImage = U.bg((U.HEROES[run.hero] || {}).store);
      U.el('div', 'who', s, '<small>' + U.esc(U.HEROES[run.hero] ? U.HEROES[run.hero].tag : '') + '</small><b>' + U.esc(run.hero) + '</b>');
      var st = U.el('div', 'stats', s);
      [['Máu tối đa', String(run.healthMax), U.ICON.health, 'hp'], ['Uy tín', String(run.prestige), U.ICON.prestige, 'pr'], ['Cấp', String(run.level), U.ICON.xp, 'lv'], ['Thu nhập', String(run.income), U.ICON.coin, 'in'], ['Vàng', String(run.gold), U.ICON.coin, 'go']]
        .forEach(function (x) { U.el('div', 'st ' + x[3], st, '<span>' + x[0] + '</span><b><i style="background-image:' + U.bg(x[2]) + '"></i>' + x[1] + '</b>'); });
      var chests = U.el('div', 'chests', s);
      // mốc rương (TUNING.CHESTS: 4 Đồng, 7 Bạc, 10 Vàng); rương cao nhất đã đạt được sáng và to
      CH.slice().reverse().forEach(function (x) {
        U.el('div', 'ch t-' + x.k + (run.wins >= x.w ? ' on' : '') + (earned === x ? ' top' : ''), chests,
          '<i style="background-image:' + U.bg('art/ui/purchases/Chest_Purchase_Artwork_' + x.img + '_TUI.webp') + '"></i><b>' + x.vi + '</b><span>' + x.w + ' thắng</span>');
      });
      U.el('div', 'chestnote', s, earned ? 'Rương ' + earned.vi + ' đã mở khoá' : 'Chưa đủ 4 thắng để nhận rương');
      // bàn tốt nhất của run (run.best: chụp lúc thắng PvP nhiều nhất / cấp cao nhất; chưa thắng thì bàn lúc hết run)
      var best = run.best || null, bb = best && best.board ? best : { board: run.board, level: run.level, wins: run.wins, day: run.day, healthMax: run.healthMax };
      var brun = Object.assign({}, run, { board: bb.board, level: bb.level || run.level, healthMax: bb.healthMax || run.healthMax });
      U.el('div', 'bestlbl', s, '<small>Bàn tốt nhất</small><b>' + (bb.wins || 0) + ' thắng · ngày ' + (bb.day || run.day) + ' · cấp ' + (bb.level || run.level) + '</b>');
      var bd = U.el('div', 'board', s);
      var info = U.boardInfo(brun), hand = bb.board.hand || [], n = 0;
      hand.forEach(function (c) { n += c.size || 1; });
      var ch = n > 8 ? 150 : 190;
      hand.slice().sort(function (a, b) { return a.socket - b.socket; }).forEach(function (c, i) {
        var el = root.BZCard.create({ uid: 'end' + c.uid, id: c.id, tier: c.tier, size: c.size, ench: c.ench, type: 'Item' }, { h: ch, attrs: (info[c.uid] || {}).attrs || {} });
        el.style.position = 'relative'; el.style.animationDelay = (pre + 400 + i * 90) + 'ms'; el.classList.add('endpop');
        el._rs = { kind: 'end', card: c, run: brun };
        bd.appendChild(el);
      });
      if (!hand.length) U.el('p', 'empty', bd, 'Bàn trống');
      var sks = U.el('div', 'skills', s);
      (bb.board.skills || []).forEach(function (c, i) {
        var t = R().tpl(c.id), m = U.el('i', 'sk t-' + c.tier, sks);
        m.style.backgroundImage = U.bg(U.art(c.id)); m.title = t ? R().title(t) : ''; m.style.animationDelay = (pre + 900 + i * 110) + 'ms';
      });
      // rê thẻ bàn tốt nhất: tooltip như trong run
      bd.addEventListener('pointerover', function (ev) {
        var el = ev.target.closest && ev.target.closest('.bz-card'); if (!el || !el._rs) return;
        var c = el._rs.card, bi = info[c.uid] || {}, tip = U.tipInfo(c, bi.attrs || {}, bi.boards);
        if (tip) { var r = U.rectOf(el); root.BZTooltip.show(tip, { x: r.x, y: r.y - 10, w: r.w, h: r.h }); }
      });
      bd.addEventListener('pointerout', function (ev) { if (!(ev.relatedTarget && bd.contains(ev.relatedTarget))) root.BZTooltip.hide(); });
      var b = U.el('div', 'btns', s);
      U.bigButton(b, 'brown', 'Về menu', 'Về màn tiêu đề', function () { U.state.run = null; U.go('title'); });
      U.bigButton(b, 'blue', 'Chơi lại', 'Bắt đầu run mới (Enter)', function () { U.newRun(); }).classList.add('play');
      U.sfx(win ? 'trans.victoryIn' : 'trans.defeatIn');
    },
    exit: function () { M.overlayOff(); },
    // Enter = nút chính "Chơi lại" (INTERACT-31); Esc = về menu
    key: function (e) {
      if (e.key === 'Enter') { var p = document.querySelector('.endrun .btns .play'); if (p) p.click(); return true; }
      if (e.key === 'Escape') { U.state.run = null; U.go('title'); return true; }
    }
  };
})(window);
