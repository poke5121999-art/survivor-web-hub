// Ngẫu nhiên có hạt giống cho mô phỏng (mulberry32). Trong trận chỉ dùng m.rng, không dùng Math.random.
(function (VS) {
  'use strict';
  VS.rng = function (seed) {
    var a = seed >>> 0;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.range = function (lo, hi) { return lo + (hi - lo) * next(); };
    next.int = function (lo, hi) { return lo + Math.floor((hi - lo + 1) * next()); };
    next.pick = function (arr) { return arr[Math.floor(next() * arr.length)]; };
    next.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    return next;
  };
})(window.VS = window.VS || {});
