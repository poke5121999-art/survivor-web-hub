/* Chợ Phiên — nạp thẻ hero. Trang nạp sẵn data/cards-common.js + data/heroes.js; màn tải (js/ui/core.js bootPreload) gọi loadAll(null)
   để nạp thẻ cả 7 hero (BZ_HEROES.cardFiles) + data/ghosts.js trước khi vào sảnh. Thứ tự chạy cố định: common → BZ_HEROES.order
   (script async=false chạy đúng thứ tự chèn), nên bể thẻ (BZRun.pool duyệt BZ_CARDS theo thứ tự nạp) giống nhau mọi lần mở trang.
   Cổng: lệnh có thể chia thẻ hoặc dựng bàn đối thủ chỉ chạy khi U.data.ready(); trang xem trận (không qua màn tải) vẫn có thể phải chờ,
   khi đó BZUI.dispatch hoãn lệnh và hiện chip "Đang tải". */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var L = U.data = {};
  var jobs = {}, settled = {};

  function H() { return root.BZ_HEROES || { order: [], cardFiles: {}, heroes: {} }; }
  // data/cards-mak.js → "mak" (khoá trong BZ_CARDS_PARTS do chính tệp ghi)
  function partOf(file) { var m = /cards-([\w-]+)\.js$/.exec(file || ''); return m ? m[1] : null; }

  // nạp một script (một lần); 404 không làm hỏng trang: resolve(false)
  L.script = function (src) {
    if (jobs[src]) return jobs[src];
    jobs[src] = new Promise(function (res) {
      var s = document.createElement('script');
      s.src = src + '?v=' + (root.BZ_REV || '');
      s.async = false;
      s.onload = function () { settled[src] = true; res(true); L.refresh(); };
      s.onerror = function () { settled[src] = true; console.info(src + ' missing: continuing without it'); res(false); L.refresh(); };
      document.head.appendChild(s);
    });
    return jobs[src];
  };
  L.heroes = function () { var h = H(); return (h.order || Object.keys(h.heroes || {})).filter(function (k) { return h.cardFiles && h.cardFiles[k]; }); };
  L.heroLoaded = function (hero) {
    var f = H().cardFiles && H().cardFiles[hero], P = root.BZ_CARDS_PARTS || {};
    return !f || P[partOf(f)] != null;
  };
  L.loadHero = function (hero) {
    var f = H().cardFiles && H().cardFiles[hero];
    if (!f || L.heroLoaded(hero)) return Promise.resolve(true);
    return L.script(f);
  };
  L.ghostsSettled = function () { return !!root.BZ_GHOSTS || !!settled['data/ghosts.js']; };
  // tất cả thẻ hero + bộ bóng PvP (opts.ghosts === false: bỏ bóng, dùng cho trang xem trận)
  L.loadAll = function (first, opts) {
    var list = L.heroes();
    if (first && list.indexOf(first) >= 0) list = [first].concat(list.filter(function (h) { return h !== first; }));
    var ps = list.map(L.loadHero);
    if (!(opts && opts.ghosts === false) && !root.BZ_GHOSTS) ps.push(L.script('data/ghosts.js'));
    return Promise.all(ps);
  };
  L.ready = function () { return L.heroes().every(L.heroLoaded) && L.ghostsSettled(); };
  L.progress = function () { var a = L.heroes(), n = a.filter(L.heroLoaded).length; return { loaded: n, total: a.length, ghosts: L.ghostsSettled() }; };

  // ---------- chip "đang tải" ----------
  // P2-7 / P3-6: lệnh của người chơi bị hoãn (chọn mở màn khi thẻ các hero chưa về) → chip to giữa dải trên kèm tiến độ "3/7 hero",
  // bấm thêm lần nữa thì chip nảy (L.nudge) thay vì im lặng; điện thoại: chip góc trên dời vào vùng đang thấy (--vt, run.css).
  var chip = null, waiters = 0, baseText = '', big = 0;
  function progressText() {
    if (!/các hero/.test(baseText)) return baseText;
    var p = L.progress(); return baseText + ' ' + p.loaded + '/' + p.total + (p.loaded >= p.total && !p.ghosts ? ' · bóng PvP' : '');
  }
  L.refresh = function () { if (chip && waiters > 0) chip.querySelector('span').textContent = progressText(); };
  L.busy = function (on, text, opts) {
    var st = root.BZView && root.BZView.refs && root.BZView.refs.stage;
    if (!st) return;
    waiters = Math.max(0, waiters + (on ? 1 : -1));
    if (opts && opts.big) big = Math.max(0, big + (on ? 1 : -1));
    if (!waiters) big = 0;
    if (!chip) { chip = U.el('div', 'rs-loading', st, '<i></i><span></span>'); }
    if (on && text) baseText = text;
    L.refresh();
    chip.classList.toggle('show', waiters > 0);
    chip.classList.toggle('big', big > 0);
  };
  L.nudge = function () { if (!chip || !waiters) return; chip.classList.remove('nudge'); void chip.offsetWidth; chip.classList.add('nudge'); };
  // chạy fn khi promise xong, chip hiện trong lúc chờ (opts.big: lệnh người chơi đang chờ → chip to, giữa dải trên)
  L.wait = function (promise, text, fn, opts) {
    L.busy(true, text || 'Đang tải thẻ…', opts);
    return promise.then(function (x) { L.busy(false, null, opts); if (fn) fn(x); return x; }, function (e) { L.busy(false, null, opts); console.error(e); });
  };
})(window);
