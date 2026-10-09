/* Chợ Phiên — chuyển cảnh của vòng chơi, dựng theo clip thật (D:\bazaar-ref\notes\clips\wUzq6Q4u9Jc.md, bản Open Beta 1.0.4671):
   - Thẻ ngày: "Ngày N" lăn sang N+1 màu vàng (~3 s), rồi ba khung gặp gỡ bật ra có lấp lánh (~1 s). Bấm để bỏ qua.
   - Màn VS trước trận đấu người chơi: chớp trắng 0,5 s → VS (gốc giữ ~5,5 s, ta ~2,5 s) → thẻ của bóng úp rồi lật lần lượt.
   - Cổng xanh quét khi thương nhân bày hàng (~1 s).
   Mọi đồng hồ ở đây là setTimeout; cancel() gỡ sạch khi đổi sang màn khác (tiêu đề, hết run). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, FX = function () { return root.BZFX; };
  var T = U.transitions = { dayCards: 0, vsScreens: 0 };

  // thời gian (ms) — nguồn: https://youtu.be/wUzq6Q4u9Jc?t=1322 (thẻ ngày) và ?t=708 (VS)
  T.DAY = { in: 350, roll: 1300, out: 3000, end: 3450 };   // thẻ ngày: N hiện ~1,3 s rồi lăn sang N+1 (clip 1322 → 1324), cả thẻ ~3,2-3,5 s
  T.VS = { flash: 500, hold: 2500, flip: 400, stagger: 170 }; // chớp 0,5 s (clip 702,5); VS giữ 2,5 s (gốc 5,5 s, rút ngắn); lật mỗi thẻ 0,4 s
  T.PORTAL = 900;                                            // cổng xanh quét hàng thương nhân ~1 s (clip ?t=1344)

  var day = null, vs = null, timers = [];
  function later(ms, fn) { var id = setTimeout(function () { var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); fn(); }, ms); timers.push(id); return id; }
  function stage() { return V().refs.stage; }

  // ---------- thẻ ngày ----------
  T.dayCard = function (run, d) {
    T.cancelDay();
    var st = stage(), M = U.HEROES[run.hero] || {};
    var el = U.el('div', 'rs-daycard', st,
      '<div class="ring r1"></div><div class="ring r2"></div><div class="hero"></div>' +
      '<div class="txt"><span class="lbl">Ngày</span><span class="num"><b class="old">' + (d - 1) + '</b><b class="new">' + d + '</b></span></div>' +
      '<i class="orb o1"></i><i class="orb o2"></i><small>Bấm để tiếp tục</small>');
    if (M.store) el.querySelector('.hero').style.backgroundImage = U.bg(M.store);
    st.classList.add('card-hold');
    day = { el: el, ids: [], done: false };
    T.dayCards++;
    var close = function () {
      if (!day || day.done) return;
      day.done = true;
      el.classList.add('out');
      day.ids.push(setTimeout(function () { T.cancelDay(true); }, 380));
    };
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    day.close = close;
    day.ids.push(setTimeout(function () { if (day && !day.done) { el.classList.add('roll'); U.sfx('board.attrGold', { vol: 0.5 }); } }, T.DAY.roll));
    day.ids.push(setTimeout(close, T.DAY.out));
    return el;
  };
  // cancelDay(reveal): gỡ thẻ; reveal = true → hiện ba khung gặp gỡ kèm lấp lánh
  T.cancelDay = function (reveal) {
    if (!day) return;
    day.ids.forEach(clearTimeout);
    if (day.el.parentNode) day.el.parentNode.removeChild(day.el);
    day = null;
    var st = stage(); if (st) st.classList.remove('card-hold');
    if (reveal) T.revealChoices();
  };
  // ba thẻ bật ra từ trái sang phải kèm lấp lánh (clip ?t=63: xanh lam lấp lánh rồi thẻ nảy ra ~1 s)
  T.revealChoices = function () {
    var boxes = document.querySelectorAll('.rs-top .rs-enc');
    if (!boxes.length) return;
    U.sfx('board.pickerAppear', { vol: 0.7 });
    Array.prototype.forEach.call(boxes, function (b, i) {
      b.style.animationDelay = (i * 120) + 'ms';
      later(160 + i * 120, function () {
        var r = U.rectOf(b); if (!r) return;
        FX().burst('buff', r.x + r.w / 2, r.y + r.h * 0.45, { big: 1 });
        FX().burst('charge', r.x + r.w / 2, r.y + r.h * 0.4, { big: 0.6 });
      });
    });
  };
  T.dayActive = function () { return !!day; };

  // ---------- màn VS (PvP) ----------
  function swords() {
    return '<svg viewBox="0 0 120 120"><path d="M60 4 116 60 60 116 4 60z" fill="#3a1a0a" stroke="#ffd36b" stroke-width="5"/><path d="M60 14 106 60 60 106 14 60z" fill="none" stroke="#ffe9a8" stroke-width="1.5" opacity=".7"/>' +
      '<g stroke="#4a2a08" stroke-width="2.5" fill="#fff4cf"><path d="M30 28l6 0 34 36-5 5L30 34z"/><path d="M90 28l-6 0-34 36 5 5L90 34z"/></g>' +
      '<g fill="#ffd36b" stroke="#4a2a08" stroke-width="2"><rect x="32" y="66" width="18" height="6" transform="rotate(45 41 69)"/><rect x="70" y="66" width="18" height="6" transform="rotate(-45 79 69)"/></g></svg>';
  }
  // vsScreen(run, opp, done): chớp trắng → VS → done(). Trả về false nếu không dựng được.
  T.vsScreen = function (run, opp, done) {
    T.cancelVs();
    var st = stage(), M = U.HEROES[run.hero] || {}, art = U.combat.opponentArt(opp);
    var el = U.el('div', 'rs-vs', st,
      '<div class="shade"></div><div class="side l"><div class="img"></div></div><div class="side r"><div class="img"></div></div>' +
      '<div class="plate l"><small>Thương nhân tập sự</small><b></b></div><div class="plate r"><small>Bóng ma · ngày ' + run.day + '</small><b></b></div>' +
      '<div class="mid">' + swords() + '<span>VS</span></div><div class="flash"></div><small class="skip">Bấm để bỏ qua</small>');
    el.querySelector('.side.l .img').style.backgroundImage = U.bg(M.store || M.portrait);
    el.querySelector('.side.r .img').style.backgroundImage = U.bg(art.char || art.bg);
    el.querySelector('.plate.l b').textContent = run.hero;
    el.querySelector('.plate.r b').textContent = opp.name;
    vs = { el: el, ids: [], done: false, cb: done };
    T.vsScreens++;
    U.sfx('trans.pvp');
    var fin = function () {
      if (!vs || vs.done) return;
      vs.done = true;
      var cb = vs.cb; el.classList.add('out');
      vs.ids.push(setTimeout(function () { T.cancelVs(); if (cb) cb(); }, 260));
    };
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) { e.stopPropagation(); fin(); });
    vs.ids.push(setTimeout(function () { if (vs && !vs.done) { el.classList.add('show'); U.sfx('trans.pvpSwords', { vol: 0.7 }); } }, T.VS.flash * 0.6));
    vs.ids.push(setTimeout(fin, T.VS.flash + T.VS.hold));
    return true;
  };
  T.cancelVs = function () {
    if (!vs) return;
    vs.ids.forEach(clearTimeout);
    if (vs.el.parentNode) vs.el.parentNode.removeChild(vs.el);
    vs = null;
  };
  T.vsActive = function () { return !!vs; };

  // thẻ úp (lưng xanh có chevron, clip ?t=710) → lật lần lượt (0,4 s mỗi thẻ, so le)
  T.facedown = function (els) {
    els.forEach(function (el) { var b = U.el('div', 'rs-back', el); b.innerHTML = '<svg viewBox="0 0 60 80"><path d="M30 14 44 34H16z" fill="#ffd36b"/><path d="M30 34 52 62H8z" fill="none" stroke="#ffd36b" stroke-width="3"/></svg>'; });
  };
  T.flipAll = function (els, done) {
    els.forEach(function (el, i) {
      later(i * T.VS.stagger, function () {
        el.classList.add('flip');
        U.sfx('card.revealFlipBronze', { vol: 0.5, gap: 60 });
        later(T.VS.flip / 2, function () { var b = el.querySelector('.rs-back'); if (b) b.remove(); });
        later(T.VS.flip, function () {
          el.classList.remove('flip');
          var r = U.rectOf(el); if (r) FX().burst('buff', r.x + r.w / 2, r.y + r.h / 2, { big: 0.5 });
        });
      });
    });
    later((els.length - 1) * T.VS.stagger + T.VS.flip + 40, function () { if (done) done(); });
    if (!els.length && done) done();
  };

  // ---------- cổng xanh quét hàng của thương nhân ----------
  T.portal = function () {
    var layer = U.top.layer();
    var p = U.el('div', 'rs-portal', layer, '<i></i><i class="b"></i>');
    later(T.PORTAL, function () { if (p.parentNode) p.parentNode.removeChild(p); });
    later(180, function () { FX().burst('charge', 960, 420, { big: 1.2 }); FX().burst('buff', 960, 420, { big: 1 }); });
    U.sfx('trans.boardIn', { vol: 0.5 });
  };

  // bấm Enter / Space / Esc: bỏ qua thẻ ngày hoặc màn VS đang hiện; trả true nếu đã xử lý
  T.skipAny = function () {
    if (day) { day.close(); return true; }
    if (vs && vs.el) { vs.el.click(); return true; }
    return false;
  };
  // đổi sang màn ngoài vòng chơi: gỡ hết
  T.cancel = function () {
    T.cancelDay(false); T.cancelVs();
    timers.forEach(clearTimeout); timers = [];
  };
})(window);
