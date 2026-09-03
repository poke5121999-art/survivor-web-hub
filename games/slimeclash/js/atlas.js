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
  var missing = {};

  var Atlas = {
    url: function (key) {
      var v = MAP[key];
      if (v) return v;
      if (!missing[key]) missing[key] = true;   // nhớ để báo cáo, không spam console
      return null;
    },
    unit: function (heroId) { return Atlas.url('unit.' + heroId); },
    has: function (key) { return !!MAP[key]; },
    // Danh sách khoá bị hỏi mà không có — tiện khi thêm hero mới mà quên thêm ảnh.
    missing: function () { return Object.keys(missing); },
    count: function () { return Object.keys(MAP).length; }
  };

  root.Atlas = Atlas;
  if (typeof module === 'object' && module.exports) module.exports = Atlas;
})(typeof window !== 'undefined' ? window : globalThis);
