/* Chợ Phiên — màn thương nhân (phase 'merchant', VISUAL §11, WIKI §1.4): chân dung + hàng bày trên bàn trên có thẻ giá,
   kéo hàng thả vào ô trống của bàn tay / kho để mua (nhấp = mua vào chỗ trống đầu tiên), kéo thẻ của mình lên vùng trên để bán.
   Nút đổi hàng (Btn_Reroll + thẻ giá Container_PriceTagReroll) và "Rời đi". Lời chào của thương nhân (vo.merchant.*.enter).
   Lệnh: buy {i, section?, socket?}, reroll, sell, move, leave. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var side = null;

  function voKey(name) { return 'vo.merchant.' + String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function stockList(run) {
    var ph = run.phase, seen = {};
    return ph.stock.map(function (s, i) {
      var k = s.card.id + s.card.tier; seen[k] = (seen[k] || 0) + 1;
      return { key: ph.merchantId + ':' + ph.rerolls + ':' + k + ':' + seen[k], card: s.card, price: s.price, discount: !!s.discount, kind: 'stock', i: i };
    });
  }

  U.SCREENS.merchant = {
    enter: function (run, prev) {
      var ph = run.phase;
      U.top.base(run, { hero: true, sides: true, board: true, lane: 'merchant' });
      var e = root.BZ_ENCOUNTERS.events[ph.merchantId] || {};
      side = U.top.portrait(ph.name, e.StartingTier || 'Bronze', U.top.artOf({ type: 'merchant', id: ph.merchantId }),
        U.top.nameBlock('Thương nhân', ph.name, ph.desc));
      var r = side.r;
      var rb = U.el('div', 'rs-merchant-ctl', r);
      var rr = U.button(rb, 'rs-reroll', '<i class="ic"></i><span class="tag"><i></i><b></b></span><small></small>', 'Đổi hàng', function () {
        // clip reroll: chớp vàng 200 ms, lấp lánh xanh 500 ms, rồi hàng mới bật ra 500 ms (~1,3 s)
        U.cards.dealDelay = 500; var r0 = U.dispatch({ t: 'reroll' }); U.cards.dealDelay = 0;
        if (r0.ok) { var b = rr.querySelector('.ic'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); U.transitions.sparkle(); }
      });
      rr.querySelector('.ic').style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/Btn_Reroll_Active_TUI.webp');
      rr.querySelector('.tag').style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/Container_PriceTagReroll_TUI.webp');
      rr.querySelector('.tag i').style.backgroundImage = U.bg(U.ICON.coin);
      U.bigButton(rb, 'brown', 'Rời đi', 'Rời thương nhân (sang giờ kế)', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      this._rr = rr;
      // sau viền vàng + lấp lánh xanh, hàng bật ra (clip merchant-enter: tổng ~2,6 s)
      if (prev) { U.cards.dealDelay = 900; setTimeout(function () { U.cards.dealDelay = 0; }, 0); U.transitions.portal(); U.sfx(voKey(ph.name) + '.enter', { gap: 2000 }) || U.sfx(voKey(ph.name) + '.idle', { gap: 2000 }); U.sfx('trans.boardIn', { vol: 0.6 }); }
      U.top.layer().appendChild(U.el('div', 'rs-hint', null, 'Kéo hàng xuống bàn để mua · kéo đồ của bạn lên đây để bán'));
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      U.cards.setTop(stockList(run));
      var rr = this._rr; if (!rr) return;
      var can = ph.rerolls > 0;
      rr.disabled = !can || run.gold < ph.rerollCost;
      rr.classList.toggle('none', !can);
      rr.querySelector('.ic').style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/' + (rr.disabled ? 'Btn_Reroll_Disabled_TUI.webp' : 'Btn_Reroll_Active_TUI.webp'));
      rr.querySelector('.tag b').textContent = ph.rerollCost;
      rr.querySelector('small').textContent = can ? 'Đổi hàng · còn ' + ph.rerolls + ' lượt' : 'Không đổi hàng';
      if (!ph.stock.length) { var h = U.top.layer().querySelector('.rs-hint'); if (h) h.textContent = 'Hết hàng · bấm "Rời đi" để sang giờ kế'; }
    },
    exit: function () { this._rr = null; U.top.clear(); },
    canDrag: function (el) { return el._rs.kind === 'own' || el._rs.kind === 'stock'; },
    onCardClick: function (el, touch) {
      if (el._rs.kind !== 'stock') return false;
      if (touch && U.cards.tapTip(el)) return true; // chạm lần 1: xem; lần 2: mua
      U.cards.clearTap();
      el._keep = false;
      var r = U.dispatch({ t: 'buy', i: el._rs.i }, { fromRect: U.rectOf(el) });
      return true;
    },
    key: function (e) {
      if (e.key === 'r' || e.key === 'R') { if (this._rr && !this._rr.disabled) this._rr.click(); return true; }
      if (e.key === 'Escape') { U.dispatch({ t: 'leave' }); return true; }
    }
  };
})(window);
