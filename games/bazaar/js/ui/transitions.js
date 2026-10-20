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

  // thời gian (ms) — bản hiện tại (1.0.8161), clip https://youtu.be/kacCuk6ZOuo?t=494 (thẻ ngày) và ?t=2094 (VS) [ĐO TRÊN CLIP]
  // thẻ ngày: quét vàng 800 → thẻ hiện 500 → "Day N" giữ 2600 → lăn sang N+1 600 → giữ 900 → tan thành bụi 1000 (tổng ~6,4 s kể cả quét)
  T.DAY = { wipe: 800, in: 500, hold: 2600, roll: 600, hold2: 900, dissolve: 1000 };
  T.VS = { flash: 500, hold: 4400, flip: 400, stagger: 170 }; // chớp trắng 0,8 s; VS giữ ~4,4 s; lật mỗi thẻ 0,4 s
  T.PORTAL = 900;                                            // lấp lánh xanh quét hàng thương nhân (clip merchant-enter: 500 + bật hàng 600)

  var day = null, timers = [];
  function later(ms, fn) { var id = setTimeout(function () { var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); fn(); }, ms); timers.push(id); return id; }
  function stage() { return V().refs.stage; }

  // ---------- thẻ ngày ----------
  T.dayCard = function (run, d) {
    T.cancelDay();
    var st = stage(), M = U.HEROES[run.hero] || {}, D = T.DAY;
    var wipe = U.el('div', 'rs-daywipe', st, '<i></i>');
    var el = U.el('div', 'rs-daycard', st,
      '<div class="ring r2"></div><div class="ring r1"></div><div class="hero"></div>' +
      '<div class="txt"><span class="lbl">Ngày</span><span class="num"><b class="old">' + (d - 1) + '</b><b class="new">' + d + '</b></span></div>' +
      '<i class="orb o1"></i><i class="orb o2"></i><small class="skip">Bấm (hoặc Space) để tiếp tục</small>');
    if (M.store) el.querySelector('.hero').style.backgroundImage = U.bg(M.store);
    el.style.animationDelay = D.wipe + 'ms';
    st.classList.add('card-hold');
    day = { el: el, wipe: wipe, ids: [], done: false };
    T.dayCards++;
    var close = function (fast) {
      if (!day || day.done) return;
      day.done = true;
      el.classList.add('out'); if (fast) el.classList.add('fast');
      day.ids.push(setTimeout(function () { T.cancelDay(true); }, fast ? 380 : D.dissolve));
    };
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) { e.stopPropagation(); close(true); });
    day.close = function () { close(true); };
    var tRoll = D.wipe + D.in + D.hold;
    day.ids.push(setTimeout(function () { wipe.remove(); }, D.wipe + 50));
    day.ids.push(setTimeout(function () { if (day && !day.done) { el.classList.add('roll'); U.sfx('board.attrGold', { vol: 0.5 }); } }, tRoll));
    day.ids.push(setTimeout(function () { close(false); }, tRoll + D.roll + D.hold2));
    return el;
  };
  // cancelDay(reveal): gỡ thẻ; reveal = true → hiện ba khung gặp gỡ kèm lấp lánh
  T.cancelDay = function (reveal) {
    if (!day) return;
    day.ids.forEach(clearTimeout);
    if (day.el.parentNode) day.el.parentNode.removeChild(day.el);
    if (day.wipe && day.wipe.parentNode) day.wipe.parentNode.removeChild(day.wipe);
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
  // vsScreen / cancelVs / vsActive do js/ui/screens/fight.js định nghĩa (bảng tên sprite gốc); T.VS ở trên là bảng thời gian dùng chung.

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

  // lấp lánh xanh trên hàng thương nhân (đổi hàng: clip reroll 500 ms)
  T.sparkle = function () {
    later(0, function () { FX().burst('charge', 960, 420, { big: 1 }); FX().burst('buff', 800, 420, { big: 0.7 }); FX().burst('buff', 1120, 420, { big: 0.7 }); });
  };

  // bấm Enter / Space / Esc: bỏ qua thẻ ngày đang hiện; trả true nếu đã xử lý
  T.skipAny = function () {
    if (day) { day.close(); return true; }
    return false;
  };
  // đổi sang màn ngoài vòng chơi: gỡ hết
  T.cancel = function () {
    T.cancelDay(false); if (T.cancelVs) T.cancelVs();
    timers.forEach(clearTimeout); timers = [];
  };
})(window);
