/* rng.js — số ngẫu nhiên CÓ HẠT GIỐNG.
 *
 * Cùng một hạt phải ra cùng một hang, nếu không thì không tra được lỗi sinh map
 * và cũng không làm được "chơi lại đúng ải đó". Math.random() không làm được việc
 * này nên toàn bộ phần sinh thế giới dùng DC.Rng, còn hiệu ứng vặt thì thoải mái.
 */
(function (G) {
  'use strict';

  function Rng(seed) {
    this.s = (seed >>> 0) || 1;
  }

  Rng.prototype.next = function () {           // mulberry32
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.f = function (a, b) {          // thực trong [a,b)
    if (b === undefined) { b = a; a = 0; }
    return a + this.next() * (b - a);
  };
  Rng.prototype.i = function (a, b) {          // nguyên trong [a,b]
    if (b === undefined) { b = a; a = 0; }
    return a + Math.floor(this.next() * (b - a + 1));
  };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  /* Chọn theo trọng số: list là [{w:..}, ...] hoặc [[w, val], ...] */
  Rng.prototype.weighted = function (list, wkey) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += wkey ? (list[i][wkey] || 0) : list[i][0];
    var r = this.next() * total;
    for (i = 0; i < list.length; i++) {
      r -= wkey ? (list[i][wkey] || 0) : list[i][0];
      if (r <= 0) return wkey ? list[i] : list[i][1];
    }
    return wkey ? list[list.length - 1] : list[list.length - 1][1];
  };

  /* Băm ổn định 2 số nguyên -> [0,1). Dùng chọn biến thể ô gạch: cùng một ô
   * luôn ra cùng một biến thể dù vẽ lại bao nhiêu lần. */
  function hash2(x, y) {
    var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  G.Rng = Rng;
  G.hash2 = hash2;
})(window.DC = window.DC || {});
