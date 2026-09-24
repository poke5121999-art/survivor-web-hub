// Pha prep (khung tạm): sắm trang bị, súng, nâng quán rồi ra khơi. Mọi dòng dựng từ bảng HX_META, mua qua HX_META.buy.
(function (HX) {
  'use strict';
  var M = window.HX_META;
  var TABS = [
    { id: 'gear', name: 'Trang bị', table: M.GEAR },
    { id: 'guns', name: 'Súng' },
    { id: 'bar', name: 'Quán', table: M.BAR },
  ];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmt(v, unit) { return (unit === '×' ? '×' + v : v + ' ' + unit); }

  var root = null, tab = 'gear', msg = '';

  function commitResult(r) {
    if (r.ok) { HX.save.commit(function () { return r.save; }); msg = ''; } else msg = 'Không mua được: ' + r.reason;
    render();
  }

  function upgradeRow(key, t) {
    var s = HX.save.get(), lv = M.level(s, key), cost = M.nextCost(s, key);
    var row = el('div', 'pr-row');
    row.dataset.key = key;
    var txt = el('div', 'pr-txt');
    txt.appendChild(el('b', null, t.name));
    txt.appendChild(el('small', null, t.desc));
    row.appendChild(txt);
    row.appendChild(el('div', 'pr-lv', 'Cấp ' + lv + '/' + M.maxLevel(key)));
    row.appendChild(el('div', 'pr-val', fmt(M.stat(s, key), t.unit) + (cost === null ? '' : ' → ' + fmt(t.levels[lv + 1].value, t.unit))));
    var b = el('button', 'pr-buy', cost === null ? 'Tối đa' : 'Nâng · ' + cost);
    b.disabled = cost === null;
    b.classList.toggle('poor', cost !== null && s.gold < cost);
    b.addEventListener('click', function () { commitResult(M.buy(HX.save.get(), key)); });
    row.appendChild(b);
    return row;
  }

  function gunRow(id) {
    var s = HX.save.get(), g = M.GUNS[id], owned = s.guns.owned.indexOf(id) >= 0, on = s.guns.equipped === id;
    var row = el('div', 'pr-row' + (on ? ' on' : ''));
    row.dataset.key = id;
    var txt = el('div', 'pr-txt');
    txt.appendChild(el('b', null, g.name));
    txt.appendChild(el('small', null, g.desc));
    row.appendChild(txt);
    row.appendChild(el('div', 'pr-lv', g.dmg ? g.dmg + ' st' + (g.pellets > 1 ? ' ×' + g.pellets : '') : '—'));
    row.appendChild(el('div', 'pr-val', g.ammo + ' viên'));
    var b = el('button', 'pr-buy', !owned ? 'Mua · ' + g.cost : on ? 'Bỏ chọn' : 'Chọn');
    b.classList.toggle('poor', !owned && s.gold < g.cost);
    b.addEventListener('click', function () {
      var cur = HX.save.get();
      commitResult(!owned ? M.buyGun(cur, id) : M.equipGun(cur, on ? null : id));
    });
    row.appendChild(b);
    return row;
  }

  function render() {
    var s = HX.save.get();
    root.innerHTML = '';
    var p = el('div', 'panel pr-panel');
    var head = el('div', 'pr-head');
    head.appendChild(el('h2', null, 'Ngày ' + s.day));
    head.appendChild(el('div', 'pr-gold', s.gold + ' vàng'));
    p.appendChild(head);
    var tabs = el('div', 'pr-tabs');
    TABS.forEach(function (t) {
      var b = el('button', 'pr-tab' + (t.id === tab ? ' on' : ''), t.name);
      b.dataset.tab = t.id;
      b.addEventListener('click', function () { tab = t.id; msg = ''; render(); });
      tabs.appendChild(b);
    });
    p.appendChild(tabs);
    var list = el('div', 'pr-list');
    var cur = TABS.filter(function (t) { return t.id === tab; })[0];
    if (cur.table) Object.keys(cur.table).forEach(function (k) { list.appendChild(upgradeRow(k, cur.table[k])); });
    else Object.keys(M.GUNS).forEach(function (id) { list.appendChild(gunRow(id)); });
    p.appendChild(list);
    var foot = el('div', 'pr-foot');
    foot.appendChild(el('div', 'pr-msg', msg));
    var go = el('button', 'btn-main', 'Ra khơi');
    go.id = 'prep-go';
    go.addEventListener('click', function () { HX.game.go('boat', { dir: 'out' }); });
    foot.appendChild(go);
    p.appendChild(foot);
    root.appendChild(p);
  }

  HX.phases = HX.phases || {};
  HX.phases.prep = {
    surface: 'dom',
    enter: function () {
      root = HX.game.screen('prep');
      msg = '';
      render();
    },
  };
})(window.HX = window.HX || {});
