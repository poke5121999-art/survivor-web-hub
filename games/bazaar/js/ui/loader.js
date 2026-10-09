/* Chợ Phiên — nạp thẻ theo hero (pha 4). Trang chỉ nạp sẵn data/cards-common.js + data/heroes.js; thẻ riêng của hero đang chọn
   (BZ_HEROES.cardFiles[hero]) nạp lúc bấm "Sẵn sàng", các hero còn lại + data/ghosts.js nạp ngầm ngay sau khi run bắt đầu.
   Thứ tự chạy cố định: common → hero đang chơi → các hero khác theo BZ_HEROES.order (script async=false chạy đúng thứ tự chèn),
   nên bể thẻ (BZRun.pool duyệt BZ_CARDS theo thứ tự nạp) giống nhau giữa các lần mở trang của cùng một run.
   Cổng: lệnh có thể chia thẻ hoặc dựng bàn đối thủ (thương nhân "from any Hero", rương, bóng PvP của hero khác — enc-combat
   bỏ thẻ chưa nạp) chỉ chạy khi U.data.ready(); chưa xong thì BZUI.dispatch hoãn lệnh và hiện chip "Đang tải". */
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
      s.onload = function () { settled[src] = true; res(true); };
      s.onerror = function () { settled[src] = true; console.info(src + ' missing: continuing without it'); res(false); };
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
  var chip = null, waiters = 0;
  L.busy = function (on, text) {
    var st = root.BZView && root.BZView.refs && root.BZView.refs.stage;
    if (!st) return;
    waiters = Math.max(0, waiters + (on ? 1 : -1));
    if (!chip) { chip = U.el('div', 'rs-loading', st, '<i></i><span></span>'); }
    if (on && text) chip.querySelector('span').textContent = text;
    chip.classList.toggle('show', waiters > 0);
  };
  // chạy fn khi promise xong, chip hiện trong lúc chờ
  L.wait = function (promise, text, fn) {
    L.busy(true, text || 'Đang tải thẻ…');
    return promise.then(function (x) { L.busy(false); if (fn) fn(x); return x; }, function (e) { L.busy(false); console.error(e); });
  };
})(window);
