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
  T.GHOST_MS = 1200;                                         // thẻ bóng ma giữa dải trước VS (ref pvp-vs giữ ~3,2 s; rút ngắn) [ĐỀ XUẤT]

  var day = null, vs = null, timers = [];
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
  // hai thanh kiếm cong trắng bắt chéo trong khung lục giác vàng đôi (clip ?t=2094)
  function swords() {
    return '<svg viewBox="0 0 240 240"><g fill="none" stroke="#ffd36b" stroke-width="3"><path d="M120 6 226 70 226 170 120 234 14 170 14 70z"/><path d="M120 26 208 78 208 162 120 214 32 162 32 78z" opacity=".6"/></g>' +
      '<g fill="#fff" stroke="#fff3c8" stroke-width="2"><path d="M42 48C100 88 152 140 198 190L186 198C140 160 88 122 38 66z"/><path d="M198 48C140 88 88 140 42 190L54 198C100 160 152 122 202 66z"/></g>' +
      '<g fill="#fff" opacity=".9"><path d="M30 176l22 8-6 12-22-8z" transform="rotate(10 40 186)"/><path d="M210 176l-22 8 6 12 22-8z" transform="rotate(-10 200 186)"/></g></svg>';
  }
  // khung lục giác vàng hai bên màn VS
  function edge(cls) {
    return '<svg class="edge ' + cls + '" viewBox="0 0 240 1080" preserveAspectRatio="none"><g fill="none" stroke="#ffd36b" stroke-width="3" opacity=".85">' +
      '<path d="M30 110 130 30 130 330 30 410 30 640 130 720 130 1050"/><path d="M60 130 160 50 160 330 60 410 60 640 160 720 160 1030" opacity=".5"/></g></svg>';
  }
  // vsScreen(run, opp, done): chớp trắng → VS → done(). Trả về false nếu không dựng được.
  T.vsScreen = function (run, opp, done) {
    T.cancelVs();
    var st = stage(), M = U.HEROES[run.hero] || {}, art = U.combat.opponentArt(opp);
    // nền: phố chợ mờ (ảnh sảnh herosel_bg) + gradient đỏ đáy; cả hai hero đủ màu; thanh tên có huy hiệu + số trận thắng (FLOW-11/28)
    var el = U.el('div', 'rs-vs', st,
      '<div class="sky"></div><div class="shade"></div>' + edge('l') + edge('r') + '<div class="side l"><div class="img"></div></div><div class="side r"><div class="img"></div></div>' +
      '<div class="plate l"><i class="crest"></i><small></small><b></b></div><div class="plate r"><i class="crest"></i><small></small><b></b></div>' +
      '<div class="mid">' + swords() + '<span>VS</span></div><div class="flash"></div><small class="skip">Bấm (hoặc Space) để bỏ qua</small>');
    el.querySelector('.sky').style.backgroundImage = U.bg('art/ui/herosel_bg.webp');
    el.querySelector('.plate.l small').textContent = 'Ngày ' + run.day + ' · ' + run.wins + ' thắng';
    el.querySelectorAll('.crest').forEach(function (c) { c.style.backgroundImage = U.bg('art/ui/clock/UI_VictoriesIcon_T_Temp.webp'); });
    el.querySelector('.side.l .img').style.backgroundImage = U.bg(M.store || M.portrait);
    // bóng từ bộ dữ liệu: ảnh lớn của hero của bóng (BZ_GHOSTS: name, hero), như màn VS gốc (hero trái, bóng phải)
    el.querySelector('.side.r .img').style.backgroundImage = U.bg(art.store || art.char || art.bg);
    if (art.hero) el.querySelector('.side.r').classList.add('hero');
    var HH = root.BZ_HEROES && root.BZ_HEROES.heroes, oname = U.oppName(opp);
    el.querySelector('.plate.l b').textContent = (HH && HH[run.hero] && HH[run.hero].title) || run.hero;
    el.querySelector('.plate.r b').textContent = oname;
    el.querySelector('.plate.r small').textContent = (opp.hero ? ((HH && HH[opp.hero] && HH[opp.hero].title) || opp.hero) + ' · ' : 'Bóng ma · ') + (opp.wins || 0) + ' thắng';
    if (oname.length > 14) el.querySelector('.plate.r b').classList.add('long');
    if (String(run.hero).length > 14) el.querySelector('.plate.l b').classList.add('long');
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

  // lấp lánh xanh trên hàng thương nhân (đổi hàng: clip reroll 500 ms)
  T.sparkle = function () {
    later(0, function () { FX().burst('charge', 960, 420, { big: 1 }); FX().burst('buff', 800, 420, { big: 0.7 }); FX().burst('buff', 1120, 420, { big: 0.7 }); });
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
