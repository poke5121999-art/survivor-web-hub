// Tủ đồ trên thuyền (REPO: tủ ở xe tải, mở bằng E khi đứng cạnh). Bảng gỗ ElvGames của games/repo2d/tu-do.css:
// lưới đồ trong tủ (ca.stash) + 3 ô trên tay (BDL.hand.slots). Bấm một món trong tủ → lên ô tay trống đầu tiên; bấm ô tay (hoặc ×) → về tủ.
// Chỉ mở được khi Dave đứng trên boong (hệ thuyền gọi BDL.locker.open()); đang mở thì Dave đứng yên (js/ship.js hỏi isOpen).
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  var HX = window.HX;
  var G = null, root = null, open = false;
  var MIN_CELLS = 8, PER_ROW = 4;

  function $(sel) { return root.querySelector(sel); }
  function defOf(key) { return BDL.ITEM_BY_KEY && BDL.ITEM_BY_KEY[key] || null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sfx(k, vol) { if (window.HX_ASSETS.audio[k] && G) G.audio.play(k, { vol: vol || 0.5 }); }

  function picOf(df) {
    if (/\.(png|jpe?g|webp|svg)(\?|$)/i.test(df.icon || '')) return '<img src="' + esc(df.icon) + '" alt="">';
    return '<span class="lk-emoji">' + esc(df.icon || '📦') + '</span>';
  }
  function usesText(e, df) {
    if (df.uses === 0) return '∞';
    return '×' + e.uses + (e.uses <= 0 && df.ammo ? ' · hết đạn' : '');
  }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'locker';
    root.className = 'veil stash';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Tủ đồ trên thuyền');
    root.innerHTML =
      '<div id="veilExtra">' +
        '<div class="lk-head"><h2>Tủ đồ trên thuyền</h2><button type="button" class="lk-x" aria-label="Đóng tủ">✕</button></div>' +
        '<div class="wallet"></div>' +
        '<div class="seg lk-seg-hand">Trên tay</div>' +
        '<div class="handrow"></div>' +
        '<div class="handhint">Mỗi lần chỉ cầm được một món: lăn chuột / phím 1-3 để đổi tay. Súng và đồ cận chiến nạp lại khi sang chuyến mới; bom, bình O₂, dụng cụ hết là hết.</div>' +
        '<div class="seg lk-seg-bag">Trong tủ</div>' +
        '<div class="bag"></div>' +
        '<div class="baginfo">Bấm một món để cầm lên tay.</div>' +
        '<div class="lk-acts"><button type="button" class="btn lk-close">Đóng tủ</button></div>' +
      '</div>';
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var t = e.target;
      if (t === root || t.closest('.lk-x') || t.closest('.lk-close')) return close();
      var x = t.closest('[data-back]');
      if (x) { BDL.items.unequip(+x.getAttribute('data-back')); sfx('ui_click'); return render(); }
      var h = t.closest('[data-hand]');
      if (h && h.classList.contains('empty')) return;
      if (h) { BDL.items.unequip(+h.getAttribute('data-hand')); sfx('ui_click'); return render(); }
      var b = t.closest('[data-stash]');
      if (b) { if (BDL.items.equip(+b.getAttribute('data-stash'))) sfx('ui_click'); return render(); }
    });
    root.addEventListener('mouseover', function (e) {
      var c = e.target.closest('[data-stash],[data-hand]');
      var info = $('.baginfo'), ca = BDL.run && BDL.run.ca, ent = null;
      if (c && c.hasAttribute('data-stash')) ent = ca && ca.stash[+c.getAttribute('data-stash')];
      else if (c && c.hasAttribute('data-hand')) ent = BDL.hand.slots[+c.getAttribute('data-hand')];
      var df = ent && defOf(ent.key);
      info.innerHTML = df ? '<b>' + esc(df.name) + '</b> · ' + esc(BDL.content && BDL.content.KIND_NAME[df.kind] || '') + ' — ' + esc(df.desc) : 'Bấm một món để cầm lên tay.';
    });
    // Esc / E / F đóng tủ. Bắt ở pha capture để Esc không bật màn tạm dừng và E không mở lại tủ ngay.
    addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyF') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) close();
      }
    }, true);
  }

  function render() {
    var ca = BDL.run && BDL.run.ca, stash = ca ? ca.stash : [], hand = BDL.hand;
    $('.wallet').textContent = 'Ví ca: ' + (BDL.fmt ? BDL.fmt(ca ? ca.wallet : 0) : (ca ? ca.wallet : 0));
    var full = hand.slots.every(function (e) { return e; });
    $('.lk-seg-hand').textContent = 'Trên tay' + (full ? ' — ĐÃ ĐẦY' : '');
    $('.lk-seg-bag').textContent = 'Trong tủ (' + stash.length + ')';
    $('.handrow').innerHTML = [0, 1, 2].map(function (i) {
      var e = hand.slots[i], df = e && defOf(e.key);
      if (!df) return '<div class="hcell empty" data-hand="' + i + '"><div class="hpic"></div><div class="hname">trống</div><div class="hnum"></div></div>';
      return '<div class="hcell' + (hand.active === i + 1 ? ' on' : '') + '" data-hand="' + i + '" title="' + esc(df.name) + ' — ' + esc(df.desc) + '">' +
        '<div class="hpic">' + picOf(df) + '</div><div class="hname">' + esc(df.name) + '</div><div class="hnum">' + usesText(e, df) + '</div>' +
        '<button type="button" class="hx" data-back="' + i + '" title="Trả về tủ">×</button></div>';
    }).join('');
    var cells = stash.map(function (e, i) {
      var df = defOf(e.key);
      if (!df) return '<div class="bcell bad" data-stash="' + i + '"><div class="bpic">?</div><div class="bname">Món lạ</div><div class="bnum">—</div></div>';
      return '<div class="bcell" data-stash="' + i + '" title="' + esc(df.name) + ' — ' + esc(df.desc) + '">' +
        '<div class="bpic">' + picOf(df) + '</div><div class="bname">' + esc(df.name) + '</div><div class="bnum' + (df.uses > 0 && e.uses <= 0 ? ' het' : '') + '">' + usesText(e, df) + '</div></div>';
    });
    var total = Math.max(MIN_CELLS, Math.ceil((cells.length + 1) / PER_ROW) * PER_ROW);
    while (cells.length < total) cells.push('<div class="bcell blank"></div>');
    $('.bag').innerHTML = cells.join('');
  }

  function openLocker() {
    if (open || !G || G.phase !== 'dive') return false;
    build();
    render();
    root.hidden = false;
    open = true;
    document.body.classList.add('locker-open');
    sfx('ui_click', 0.6);
    return true;
  }
  function close() {
    if (!open) return false;
    open = false;
    root.hidden = true;
    document.body.classList.remove('locker-open');
    sfx('ui_click', 0.4);
    return true;
  }

  BDL.locker = { open: openLocker, close: close, isOpen: function () { return open; }, render: function () { if (open) render(); } };

  BDL.systems.push({
    name: 'locker',
    build: function (g) {
      G = g;
      build();
      window.BDL_DEBUG = window.BDL_DEBUG || {};
      window.BDL_DEBUG.locker = { open: openLocker, close: close, isOpen: function () { return open; } };
    },
    update: function () {
      // rời boong (nhảy xuống nước, bị dời đi) thì đóng tủ
      if (open && !(G.deck && G.deck.on)) close();
    },
    teardown: function () { if (open) close(); G = null; },
  });
})(window.BDL);
