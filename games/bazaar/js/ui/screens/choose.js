/* Chợ Phiên — màn chọn gặp gỡ của giờ (phase 'choose', hour0-day1-1.png / pve-choice-1.png): ba khung trên giấy bản đồ,
   bàn người chơi vẫn ở dưới (xếp lại / bán được). Giờ PvE: ba quái (Đồng, Bạc, Vàng+), rê chuột xem trước bàn quái và
   phần thưởng (monster-preview-1.png). Lệnh: {t:'pick', i}. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var prev = null;
  function monsterOf(combatId) {
    var c = root.BZ_ENCOUNTERS.combats[combatId]; if (!c) return null;
    return (root.BZ_MONSTERS || []).filter(function (m) { return m.Id === c.Monster; })[0] || null;
  }
  // bảng xem trước quái: tên + cấp lục giác + phần thưởng + bàn thu nhỏ
  function preview(o, box) {
    hidePreview();
    var p = prev = U.el('div', 'rs-preview', U.top.layer());
    var m = monsterOf(o.id);
    p.innerHTML = '<div class="hd"><h3>' + U.esc(o.name) + '</h3><b class="lv">' + (o.level || 1) + '</b></div>' +
      '<div class="rw"><span>Phần thưởng</span><div class="it"><i style="background-image:' + U.bg(U.ICON.coins) + '"></i><b>' + (o.gold || 0) + '</b></div>' +
      '<div class="it xp"><i style="background-image:' + U.bg(U.ICON.xpBig) + '"></i><b>' + (o.xp || 0) + '</b></div>' +
      '<div class="it"><i style="background-image:' + U.bg(U.ICON.chest) + '"></i><b>1</b></div></div>' +
      '<div class="hp"><i style="background-image:' + U.bg(U.ICON.health) + '"></i>' + (o.health || 0) + ' máu</div><div class="mini"></div>';
    var mini = p.querySelector('.mini');
    if (m) {
      var b = root.BZSim.boardFromMonster(m, 'pv'), x = 0;
      b.cards.filter(function (c) { return c.section === 'hand'; }).sort(function (a, c) { return a.socket - c.socket; }).forEach(function (c) {
        var el = root.BZCard.create({ uid: c.uid, id: c.id, tier: c.tier, size: c.size, ench: c.ench, type: 'Item' }, { h: 120, attrs: U.looseAttrs(c) });
        el.style.left = x + 'px'; el.style.top = '0px'; mini.appendChild(el); x += el._bz.w - 2;
      });
      mini.style.width = x + 'px';
      var sk = b.cards.filter(function (c) { return c.section === 'skills'; });
      if (sk.length) { var sr = U.el('div', 'skills', p); sk.forEach(function (c) { var a = U.art(c.id); U.el('i', '', sr).style.backgroundImage = a ? U.bg(a) : ''; }); }
    }
    // ngoài hàng khung: khung đầu → bên trái hàng, khung khác → bên phải khung cuối (không che khung bên cạnh, MOBILE-25).
    // Đo trong vùng đang thấy V.vis (điện thoại: camera cắt hai bên, P3-5): bên ưu tiên không đủ chỗ thì sang bên kia;
    // hai bên đều hẹp thì thu bảng vừa bên rộng hơn (không dưới 0,6), rồi kẹp vào khung nhìn.
    var r = U.rectOf(box), all = U.top.layer().querySelectorAll('.rs-enc'), isFirst = all[0] === box;
    var first = U.rectOf(all[0]) || r, last = U.rectOf(all[all.length - 1]) || r;
    var v = V().vis || { x0: 0, y0: 0, x1: 1920, y1: 1080 }, w = p.offsetWidth || 560, h = p.offsetHeight || 400, M = 12, G = 16;
    var spL = first.x - G - (v.x0 + M), spR = (v.x1 - M) - (last.x + last.w + G);
    var side = isFirst && all.length > 1 ? 'L' : 'R';
    if ((side === 'L' ? spL : spR) < w) side = (side === 'L' ? spR : spL) >= w ? (side === 'L' ? 'R' : 'L') : (spL > spR ? 'L' : 'R');
    var sp = side === 'L' ? spL : spR, k = sp >= w ? 1 : Math.max(0.6, sp / w), ww = w * k, hh = h * k;
    var left = side === 'L' ? first.x - G - ww : last.x + last.w + G;
    left = Math.max(v.x0 + M, Math.min(v.x1 - M - ww, left));
    var top = Math.max(v.y0 + M, Math.min(v.y1 - M - hh, Math.max(80, r.y)));
    p.style.transformOrigin = '0 0'; if (k < 1) p.style.scale = k.toFixed(3);
    p.style.left = left.toFixed(1) + 'px'; p.style.top = top.toFixed(1) + 'px';
    var mon = (o.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    U.sfx('vo.monster.' + mon, { gap: 4000, vol: 0.7 });
  }
  function hidePreview() { if (prev) { prev.remove(); prev = null; } }
  // nạp sẵn art thẻ + kỹ năng của ba quái ngay khi màn PvE hiện: bảng xem trước mở ra là có ảnh, không còn thẻ đen chờ mạng (P3-5)
  var warm = {};
  function prefetch(options) {
    options.forEach(function (o) {
      var m = monsterOf(o.id); if (!m) return;
      var b; try { b = root.BZSim.boardFromMonster(m, 'pv'); } catch (e) { return; }
      b.cards.forEach(function (c) {
        var src = c.section === 'skills' ? U.art(c.id) : root.BZCard.artSrc(c.id);
        if (!src || warm[src]) return;
        warm[src] = new Image(); warm[src].src = U.url(src);
      });
    });
  }

  U.SCREENS.choose = {
    enter: function (run) {
      U.top.base(run, {});
      U.sfx('board.pickerAppear', { vol: 0.7 });
    },
    render: function (run) {
      var ph = run.phase, pve = run.hour === R().TUNING.PVE_HOUR;
      U.cards.render(run);
      var key = run.day + ':' + run.hour + ':' + JSON.stringify(ph.options);
      if (key === this._key && U.top.layer().children.length) return; // bán / xếp đồ: giữ nguyên khung
      this._key = key;
      U.top.clear(); hidePreview();
      // bản gốc không có tiêu đề / dòng hướng dẫn ở màn chọn giờ (ref/hour-choice/24.jpg): giờ và ngày chỉ hiện ở đồng hồ
      U.top.map('', '');
      var special = -1;
      if (!pve) { ph.options.forEach(function (o, i) { if (special < 0 && o.type === 'merchant' && R().tierIndex(o.tier) >= 1) special = i; }); }
      else { special = 1; prefetch(ph.options); }
      U.top.frames(ph.options, function (i) { U.dispatch({ t: 'pick', i: i }); }, {
        special: special,
        onHover: pve ? preview : null, onLeave: pve ? hidePreview : null
      });
    },
    exit: function () { this._key = null; hidePreview(); U.top.clear(); }
  };
  U.choosePreviewHide = hidePreview;
})(window);
