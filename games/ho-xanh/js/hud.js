// Lớp DOM phủ trên cảnh: đồng hồ dưỡng khí, độ sâu, túi cá, súng phụ và số đạn, thẻ bắt cá, thanh giằng co, màn kết quả.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING;
  var $ = function (id) { return document.getElementById(id); };

  function stars(rank) {
    var n = Math.max(1, Math.min(5, rank));
    return '★'.repeat(n);
  }

  var seen = {};
  try { seen = JSON.parse(localStorage.getItem('hx.seen') || '{}') || {}; } catch (e) { seen = {}; }
  function markSeen(id) {
    var isNew = !seen[id];
    seen[id] = 1;
    try { localStorage.setItem('hx.seen', JSON.stringify(seen)); } catch (e) { /* trình duyệt chặn lưu thì thôi */ }
    return isNew;
  }

  var Hud = {
    // max: dưỡng khí tối đa của bình đang đeo (G.loadout.o2)
    o2: function (v, max) {
      var k = Math.max(0, Math.min(1, v / max));
      $('o2-num').textContent = Math.ceil(v);
      $('o2-pie').style.setProperty('--k', (k * 360).toFixed(1) + 'deg');
      var low = v < T.o2.lowAt;
      document.body.classList.toggle('low-o2', low);
      $('vignette').style.opacity = low ? (0.45 + 0.35 * (1 - v / T.o2.lowAt)).toFixed(2) : '0';
    },
    depth: function (m) { $('depth').textContent = Math.max(0, Math.round(m)) + ' m'; },
    count: function (n, cap) {
      $('catch-n').textContent = n + '/' + cap;
      $('catch').classList.toggle('full', n >= cap);
    },
    // Xuống quá độ sâu an toàn của đồ lặn.
    suitWarn: function (on) {
      if (Hud._suit === on) return;
      Hud._suit = on;
      document.body.classList.toggle('too-deep', on);
    },
    hint: function (s) { $('hint-line').textContent = s; },

    // Súng phụ đang mang: icon gốc + số đạn còn lại; không mang súng thì ẩn cả ô và nút Súng.
    gun: function (id, icon, ammo, max) {
      var on = !!id;
      document.body.classList.toggle('has-gun', on);
      if (!on) { Hud._gun = null; return; }
      if (Hud._gun !== id) {
        Hud._gun = id;
        $('gun-icon').src = icon;
        $('gunbox').dataset.gun = id;
      }
      $('gun-ammo').textContent = ammo + '/' + max;
      $('gunbox').classList.toggle('empty', ammo <= 0);
    },

    flash: function () {
      var el = $('hurt');
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    },

    podHint: function (on) { $('pod-hint').classList.toggle('show', on); },

    area: function (title, sub) {
      $('area-t').textContent = title; $('area-s').textContent = sub;
      var el = $('area');
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    },

    toast: function (s) {
      var el = $('toast');
      el.textContent = s;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    },

    catchCard: function (sp, icon) {
      var isNew = markSeen(sp.id);
      var el = $('catch-card');
      $('cc-icon').src = icon;
      $('cc-name').textContent = HX.fish.displayName(sp);
      $('cc-en').textContent = HX.fish.englishName(sp);
      $('cc-meta').textContent = sp.cm + ' cm · ' + stars(sp.rank);
      $('cc-new').hidden = !isNew;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(Hud._ccT);
      Hud._ccT = setTimeout(function () { el.classList.remove('show'); }, 2600);
    },

    tug: function (on, gauge, time) {
      var el = $('tug');
      el.hidden = !on;
      if (!on) return;
      $('tug-fill').style.height = (gauge * 100).toFixed(1) + '%';
      $('tug-time').style.width = (Math.max(0, time) * 100).toFixed(1) + '%';
    },
    tugAt: function (x, y) {
      var el = $('tug');
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    },
    tugTap: function () {
      var el = $('tug');
      el.classList.remove('tap'); void el.offsetWidth; el.classList.add('tap');
    },
    qteResult: function (ok, perfect) {
      Hud.toast(ok ? (perfect ? 'Hoàn hảo!' : 'Kéo được rồi!') : 'Cá giật đứt ra mất…');
    },

    reticle: function (show, x, y, gun, gx, gy, ang) {
      var r = $('reticle'), g = $('aimgun');
      r.hidden = !show;
      if (show) r.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      g.hidden = !gun;
      if (gun) g.style.transform = 'translate(' + Math.round(gx) + 'px,' + Math.round(gy) + 'px) rotate(' + (-ang).toFixed(3) + 'rad)';
    },

    result: function (outcome, kept, all, onAgain, maxDepth) {
      var el = $('result');
      $('r-title').textContent = outcome === 'dead' ? 'Bạn ngất đi…' : outcome === 'pod' ? 'Khoang cứu hộ đưa bạn lên!' : 'Lên bờ rồi!';
      $('r-sub').textContent = outcome === 'dead'
        ? (all.length ? 'Thợ lặn kéo bạn lên thuyền. Chỉ giữ lại được 1 con trong ' + all.length + ' con đã bắt.' : 'Thợ lặn kéo bạn lên thuyền. Lần này tay trắng.')
        : (all.length ? 'Mang về ' + all.length + ' con cá.' : 'Chuyến này chưa xiên được con nào.');
      if (maxDepth) $('r-sub').textContent += ' Sâu nhất ' + Math.round(maxDepth) + ' m.';
      var groups = {}, order = [];
      kept.forEach(function (id) { if (!groups[id]) { groups[id] = 0; order.push(id); } groups[id]++; });
      order.sort(function (a, b) { return HX.fish.BY_ID[b].rank - HX.fish.BY_ID[a].rank; });
      var grid = $('r-grid');
      grid.innerHTML = '';
      order.forEach(function (id) {
        var sp = HX.fish.BY_ID[id], div = document.createElement('div');
        div.className = 'r-fish' + (sp.rank >= 3 ? ' rare' : '');
        div.dataset.id = id;
        var img = document.createElement('img'); img.src = HX.fish.iconFor(HX.game.gfx, sp); img.alt = '';
        var b = document.createElement('b'); b.textContent = HX.fish.displayName(sp);
        var i = document.createElement('i'); i.textContent = HX.fish.englishName(sp);
        var s = document.createElement('small'); s.textContent = stars(sp.rank) + '  ×' + groups[id];
        div.appendChild(img); div.appendChild(b); div.appendChild(i); div.appendChild(s);
        grid.appendChild(div);
      });
      grid.hidden = !order.length;
      $('r-total').textContent = kept.length ? 'Tổng: ' + kept.length + ' con · ' + order.length + ' loài' : '';
      el.hidden = false;
      $('r-again').onclick = onAgain;
      setTimeout(function () { $('r-again').focus(); }, 50);
    },
    hideResult: function () { $('result').hidden = true; },

    loading: function (k, label) {
      $('load-fill').style.width = (k * 100).toFixed(1) + '%';
      if (label) $('load-label').textContent = label;
    },
  };

  HX.hud = Hud;
})(window.HX = window.HX || {});
