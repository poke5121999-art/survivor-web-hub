// Pha boat (khung tạm): cano chạy một thanh tiến độ rồi sang pha kế. args.dir: 'out' → loading, 'home' → kitchen.
(function (HX) {
  'use strict';
  var M = window.HX_META;
  var BASE_TIME = 2;   // [ĐỀ XUẤT] giây, khung tạm; động cơ nâng cấp chia bớt

  var st = null;

  function done() {
    if (!st || st.done) return;
    st.done = true;
    HX.game.go(st.dir === 'out' ? 'loading' : 'kitchen');
  }

  HX.phases = HX.phases || {};
  HX.phases.boat = {
    surface: 'dom',
    enter: function (args) {
      var dir = args.dir === 'home' ? 'home' : 'out';
      st = { dir: dir, t: 0, dur: BASE_TIME / M.stat(HX.save.get(), 'engine'), done: false };
      var root = HX.game.screen('boat');
      root.innerHTML =
        '<div class="panel bt-panel">' +
        '<h2></h2><div class="bar"><div class="bt-fill"></div></div>' +
        '<button class="ghost bt-skip" id="boat-skip">Bỏ qua</button></div>';
      root.querySelector('h2').textContent = dir === 'out' ? 'Cano đang chạy ra Hố Xanh…' : 'Cano đang chạy về quán…';
      st.fill = root.querySelector('.bt-fill');
      root.querySelector('#boat-skip').onclick = done;
    },
    update: function (dt) {
      if (!st || st.done) return;
      st.t += dt;
      st.fill.style.width = Math.min(100, st.t / st.dur * 100).toFixed(1) + '%';
      if (st.t >= st.dur) done();
    },
    exit: function () { if (st) st.done = true; },
  };
})(window.HX = window.HX || {});
