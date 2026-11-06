// RNG tất định (mulberry32). TD.RNG(seed) → { next() ∈ [0,1), range(a,b), int(n), pick(arr) }.
(function (G) {
  var TD = G.TD = G.TD || {};
  TD.RNG = function (seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    var r = {
      next: function () {
        a = (a + 0x6d2b79f5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range: function (lo, hi) { return lo + (hi - lo) * r.next(); },
      int: function (n) { return Math.floor(r.next() * n); },
      pick: function (arr) { return arr[r.int(arr.length)]; },
    };
    return r;
  };
})(typeof window !== 'undefined' ? window : globalThis);
