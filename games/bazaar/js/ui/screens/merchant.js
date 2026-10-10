/* Chợ Phiên — màn thương nhân (phase 'merchant', VISUAL §11, WIKI §1.4): chân dung + hàng bày trên bàn trên có thẻ giá,
   kéo hàng thả vào ô trống của bàn tay / kho (hoặc lên rương) để mua; bấm (hoặc chạm) một món = chọn + xem, bấm lần nữa = mua vào
   chỗ trống đầu tiên (INTERACT-14: một cú nhấp lạc tay không mua mất). Kéo thẻ của mình lên dải trên để bán (chỉ ở màn này),
   hoặc rê chuột lên thẻ rồi bấm S. Nút đổi hàng (Btn_Reroll + thẻ giá Container_PriceTagReroll; hết lượt / thiếu vàng vẫn bấm được
   để nghe lý do) và "Rời đi". Esc mở bảng tạm nghỉ, không rời thương nhân (INTERACT-2). Lời chào của thương nhân (vo.merchant.*.enter).
   Lệnh: buy {i, section?, socket?}, reroll, sell, move, leave. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var side = null;
  var HINT = 'Kéo hàng xuống để mua · kéo đồ lên đây để bán';

  function voKey(name) { return 'vo.merchant.' + String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function stockList(run) {
    var ph = run.phase, seen = {};
    return ph.stock.map(function (s, i) {
      var k = s.card.id; seen[k] = (seen[k] || 0) + 1; // không gồm bậc: hàng lên bậc tại chỗ (sự kiện stock) giữ phần tử, cards.setTop dựng lại
      return { key: ph.merchantId + ':' + ph.rerolls + ':' + k + ':' + seen[k], card: s.card, price: s.price, discount: !!s.discount, kind: 'stock', i: i };
    });
  }
  function coarse() { try { return root.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }

  U.SCREENS.merchant = {
    enter: function (run, prev) {
      var ph = run.phase;
      U.top.base(run, { hero: true, sides: true, board: true, lane: 'merchant' });
      var e = root.BZ_ENCOUNTERS.events[ph.merchantId] || {};
      side = U.top.portrait(ph.name, e.StartingTier || 'Bronze', U.top.artOf({ type: 'merchant', id: ph.merchantId }),
        U.top.nameBlock('Thương nhân', ph.name, ph.desc));
      var r = side.r;
      var rb = U.el('div', 'rs-merchant-ctl', r);
      var rr = U.button(rb, 'rs-reroll', '<i class="ic"></i><span class="tag"><i></i><b></b></span><small></small>', 'Đổi hàng (R)', function () {
        // hết lượt / thiếu vàng: nút vẫn nhận bấm để nói lý do (INTERACT-22)
        if (rr.classList.contains('off')) { var p = U.state.run.phase; U.reject(p.rerolls > 0 ? 'not enough gold' : 'no rerolls'); return; }
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
      U.top.layer().appendChild(U.el('div', 'rs-hint', null, HINT));
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      U.cards.setTop(stockList(run));
      var rr = this._rr; if (!rr) return;
      var can = ph.rerolls > 0, off = !can || run.gold < ph.rerollCost;
      rr.classList.toggle('off', off); rr.setAttribute('aria-disabled', off ? 'true' : 'false');
      rr.classList.toggle('none', !can);
      rr.querySelector('.ic').style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/' + (off ? 'Btn_Reroll_Disabled_TUI.webp' : 'Btn_Reroll_Active_TUI.webp'));
      rr.querySelector('.tag b').textContent = ph.rerollCost;
      rr.querySelector('small').textContent = can ? 'Đổi hàng · còn ' + ph.rerolls + ' lượt' : 'Không đổi hàng';
      rr.querySelector('.ic').dataset.left = '×' + ph.rerolls; // màn nhỏ: số lượt còn hiện thành huy hiệu trên nút (css .rs-small)
      // gợi ý theo hàng hiện có: đổi hàng xong có hàng lại thì về câu "kéo để mua" (FLOW-5)
      var h = U.top.layer().querySelector('.rs-hint');
      if (h) h.textContent = ph.stock.length ? HINT : 'Hết hàng · bấm "Rời đi" để sang giờ kế';
    },
    exit: function () { this._rr = null; U.top.clear(); },
    canDrag: function (el) { return el._rs.kind === 'own' || el._rs.kind === 'stock'; },
    onCardClick: function (el, touch) {
      if (el._rs.kind !== 'stock') return false;
      // lần 1: chọn + tooltip có dòng nhắc giá; lần 2 trên cùng thẻ: mua
      var verb = touch || coarse() ? 'Chạm' : 'Bấm';
      if (U.cards.tapTip(el, verb + ' lần nữa để mua · ' + el._rs.price + ' vàng')) { U.sfx('card.raise', { vol: 0.5 }); return true; }
      U.cards.clearTap();
      el._keep = false;
      U.dispatch({ t: 'buy', i: el._rs.i }, { fromRect: U.rectOf(el) });
      return true;
    },
    key: function (e) {
      if (e.key === 'r' || e.key === 'R') { if (this._rr) this._rr.click(); return true; }
      // S = bán thẻ của mình đang rê chuột lên (WIKI §2.5: bản gốc có phím bán)
      if (e.key === 's' || e.key === 'S') {
        var hv = document.querySelector('.rs-cards .bz-card:hover, .rs-tray .bz-card:hover');
        if (hv && hv._rs && hv._rs.kind === 'own') {
          var r = U.rectOf(hv); hv._keep = true;
          var res = U.dispatch({ t: 'sell', uid: hv._rs.uid }, { dropAt: r });
          if (res.ok) { U.cards.hideTip(); hv.classList.add('despawn'); setTimeout(function () { if (hv.parentNode) hv.parentNode.removeChild(hv); }, 420); }
          else hv._keep = false;
        }
        return true;
      }
    }
  };
})(window);
