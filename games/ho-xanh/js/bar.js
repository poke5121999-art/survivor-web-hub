// Pha kitchen → bar → ledger (khung tạm): bày cá trong tủ thành món, quán tự bán mỗi suất một nhịp, cuối ngày cộng sổ.
// Sổ lưu chỉ đổi một lần ở ledger, nên tải lại trang giữa chừng thì cá vẫn còn nguyên trong tủ.
(function (HX) {
  'use strict';
  var M = window.HX_META;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Thực đơn hôm nay: mỗi loài trong tủ một món, cá quý xếp trước.
  function buildMenu(fridge) {
    return Object.keys(fridge).map(function (id) {
      var sp = HX.fish.BY_ID[id], per = M.servingsOf(sp);
      return { id: id, sp: sp, dish: M.dishOf(sp, HX.fish.displayName(sp)), fish: fridge[id], per: per, servings: per * fridge[id], sold: 0 };
    }).sort(function (a, b) { return b.dish.price - a.dish.price; });
  }

  function iconInto(img, m) {
    if (m.dish.img) { img.src = m.dish.img; return; }
    HX.game.loaded.then(function () { img.src = HX.fish.iconFor(HX.game.gfx, m.sp); });
  }

  function dishRow(m, right) {
    var row = el('div', 'br-row');
    row.dataset.id = m.id;
    var img = el('img', 'br-icon');
    img.alt = '';
    iconInto(img, m);
    row.appendChild(img);
    var txt = el('div', 'br-txt');
    txt.appendChild(el('b', null, m.dish.name));
    txt.appendChild(el('small', null, m.fish + ' con · ' + m.per + ' suất mỗi con · ' + m.dish.price + ' vàng/suất'));
    row.appendChild(txt);
    row.appendChild(el('div', 'br-right', right));
    return row;
  }

  function panel(root, title) {
    root.innerHTML = '';
    var p = el('div', 'panel br-panel');
    p.appendChild(el('h2', null, title));
    root.appendChild(p);
    return p;
  }

  HX.phases = HX.phases || {};

  // ---------- bếp ----------
  var menu = null;
  HX.phases.kitchen = {
    surface: 'dom',
    enter: function () {
      var s = HX.save.get();
      menu = buildMenu(s.fridge);
      var p = panel(HX.game.screen('kitchen'), 'Bếp · ngày ' + s.day);
      var list = el('div', 'br-list');
      if (!menu.length) list.appendChild(el('p', 'br-empty', 'Tủ cá trống. Tối nay quán không có món nào để bán.'));
      menu.forEach(function (m) { list.appendChild(dishRow(m, m.servings + ' suất')); });
      p.appendChild(list);
      var total = menu.reduce(function (a, m) { return a + m.servings; }, 0);
      var foot = el('div', 'br-foot');
      foot.appendChild(el('div', 'br-note', total + ' suất sẵn sàng'));
      var b = el('button', 'btn-main', 'Mở quán');
      b.id = 'kitchen-open';
      b.addEventListener('click', function () { HX.game.go('bar', { menu: menu }); });
      foot.appendChild(b);
      p.appendChild(foot);
    },
  };

  // ---------- quán ----------
  var day = null;
  function sellOne() {
    var m = day.menu.filter(function (x) { return x.sold < x.servings; })[0];
    if (!m) return false;
    var s = HX.save.get();
    var tip = Math.round(m.dish.price * (M.stat(s, 'decor') - 1)), tea = M.stat(s, 'tea');
    m.sold++;
    day.served++;
    day.dishes += m.dish.price; day.tips += tip; day.tea += tea;
    day.log.unshift(m.dish.name + '  +' + (m.dish.price + tip + tea));
    day.log.length = Math.min(day.log.length, 4);
    return true;
  }
  function earned(d) { return d.dishes + d.tips + d.tea; }

  function drawBar() {
    var left = day.menu.reduce(function (a, m) { return a + m.servings - m.sold; }, 0);
    day.ui.gold.textContent = (HX.save.get().gold + earned(day)) + ' vàng';
    day.ui.served.textContent = day.served + ' suất đã bán · còn ' + left;
    day.ui.log.textContent = left ? day.log.join('\n') : 'Hết món. Đóng quán thôi.';
    day.menu.forEach(function (m, i) { day.ui.rows[i].textContent = (m.servings - m.sold) + ' suất'; });
  }

  HX.phases.bar = {
    surface: 'dom',
    enter: function (args) {
      var s = HX.save.get();
      day = { menu: args.menu || buildMenu(s.fridge), served: 0, dishes: 0, tips: 0, tea: 0, log: [], t: 0, ui: {} };
      var p = panel(HX.game.screen('bar'), 'Quán sushi · ' + M.stat(s, 'seats') + ' ghế');
      var head = el('div', 'br-head');
      day.ui.gold = head.appendChild(el('div', 'br-gold'));
      day.ui.served = head.appendChild(el('div', 'br-note'));
      p.appendChild(head);
      var list = el('div', 'br-list');
      day.ui.rows = day.menu.map(function (m) {
        var r = dishRow(m, '');
        list.appendChild(r);
        return r.querySelector('.br-right');
      });
      p.appendChild(list);
      day.ui.log = p.appendChild(el('pre', 'br-log'));
      var foot = el('div', 'br-foot');
      var b = el('button', 'btn-main', 'Đóng quán');
      b.id = 'bar-close';
      b.addEventListener('click', function () { HX.game.go('ledger', { day: day }); });
      foot.appendChild(b);
      p.appendChild(foot);
      drawBar();
    },
    update: function (dt) {
      // [ĐỀ XUẤT] khung tạm: mỗi giây bán một suất, đầu bếp nâng cấp thì nhanh hơn
      day.t += dt * M.stat(HX.save.get(), 'chef');
      var changed = false;
      while (day.t >= 1) { day.t -= 1; changed = sellOne() || changed; }
      if (changed) drawBar();
    },
  };

  // ---------- sổ cuối ngày ----------
  HX.phases.ledger = {
    surface: 'dom',
    enter: function (args) {
      var d = args.day || { menu: [], served: 0, dishes: 0, tips: 0, tea: 0 };
      var before = HX.save.get(), total = earned(d);
      // cộng sổ đúng một lần cho mỗi buổi bán
      if (!d.committed) {
        d.committed = true;
        HX.save.commit(function (s) {
          s.gold += total;
          s.stats.served += d.served;
          s.stats.earned += total;
          d.menu.forEach(function (m) {
            if (!m.sold) return;
            var left = (s.fridge[m.id] || 0) - Math.min(m.fish, Math.ceil(m.sold / m.per));
            if (left > 0) s.fridge[m.id] = left; else delete s.fridge[m.id];
          });
          s.day += 1;
          s.stage = 'prep';
        });
      }
      var after = HX.save.get();
      var p = panel(HX.game.screen('ledger'), 'Tổng kết ngày ' + before.day);
      var tbl = el('div', 'br-ledger');
      [['Suất đã bán', d.served], ['Tiền món', d.dishes], ['Tiền tip', d.tips], ['Tiền trà', d.tea], ['Tổng thu', total],
        ['Vàng', before.gold + ' → ' + after.gold]].forEach(function (r) {
        tbl.appendChild(el('span', null, r[0]));
        tbl.appendChild(el('b', null, String(r[1])));
      });
      tbl.dataset.earned = total;
      p.appendChild(tbl);
      var foot = el('div', 'br-foot');
      var b = el('button', 'btn-main', 'Sang ngày ' + after.day);
      b.id = 'ledger-next';
      b.addEventListener('click', function () { HX.game.go('prep'); });
      foot.appendChild(b);
      p.appendChild(foot);
    },
  };
})(window.HX = window.HX || {});
