/*
 * SlimeClash — tra art theo KHOÁ, không theo tên file.
 *
 * Lý do tồn tại: trong toàn bộ code không được có một tên file ảnh nào. Code hỏi
 * `Atlas.unit(110)`, còn việc khoá đó trỏ vào file nào là chuyện của
 * `assets/asset-map.js`. Vẽ đè art mới = thay PNG + sửa map, không đụng code.
 *
 * Thiếu ảnh thì trả về null và ô cờ tự rơi về ô màu trơn — không vỡ, không log rác.
 */
(function (root) {
  'use strict';

  var MAP = root.SLIME_ART || {};
  var FRAMES = root.SLIME_ART_FRAMES || 6;
  var missing = {};

  function url(key) {
    var v = MAP[key];
    if (v) return v;
    if (!missing[key]) missing[key] = true;
    return null;
  }

  var Atlas = {
    frames: FRAMES,
    url: url,

    // Dải khung theo cấp. Trả về đủ thứ CSS cần để cắt đúng khung.
    //   background-image : url(sprite)
    //   background-size  : sizePct% 100%      (600% khi có 6 khung)
    //   background-position: posPct% 0
    unit: function (heroId, grade) {
      var u = url('unit.' + heroId);
      if (!u) return null;
      var g = Math.max(1, Math.min(FRAMES, grade || 1));
      return {
        url: u,
        sizePct: FRAMES * 100,
        posPct: FRAMES > 1 ? ((g - 1) / (FRAMES - 1)) * 100 : 0,
        grade: g
      };
    },

    // Kiểu CSS dựng sẵn — chỗ duy nhất biết cách cắt khung.
    unitStyle: function (heroId, grade) {
      var f = Atlas.unit(heroId, grade);
      if (!f) return null;
      return 'background-image:url(' + JSON.stringify(f.url) + ');' +
             'background-size:' + f.sizePct + '% 100%;' +
             'background-position:' + f.posPct + '% 0;';
    },

    head: function (heroId) { return url('head.' + heroId); },
    foe: function (slug) { return url('foe.' + slug); },
    foeSlugs: function () {
      return Object.keys(MAP).filter(function (k) { return k.indexOf('foe.') === 0; })
                             .map(function (k) { return k.slice(4); });
    },

    has: function (key) { return !!MAP[key]; },
    missing: function () { return Object.keys(missing); },
    count: function () { return Object.keys(MAP).length; }
  };

  root.Atlas = Atlas;
  if (typeof module === 'object' && module.exports) module.exports = Atlas;
})(typeof window !== 'undefined' ? window : globalThis);
