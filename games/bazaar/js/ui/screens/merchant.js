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

  function voKey(name) { return 'vo.merchant.' + String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  // Lời của thương nhân (W-05): khoá theo tên tệp âm của chính thẻ gặp gỡ (BZ_AUDIO_CARDS[id].voice → BZ_AUDIO_VOICE[<Tên>AudioSO][loại]),
  // không có thì khoá theo tên gọi; loại: enter | idle | multiclick | reroll | buyitem | sellitem | sellsized | exit | buyexit.
  // Thử lần lượt từng loại trong `kinds`; thương nhân không có lời đó thì im (không báo lỗi).
  U.merchantVoice = function (ph, kinds, o) {
    var AC = root.BZ_AUDIO_CARDS || {}, AV = root.BZ_AUDIO_VOICE || {}, so = AC[ph.merchantId] && AC[ph.merchantId].voice, tab = (so && AV[so]) || {};
    if (typeof kinds === 'string') kinds = [kinds];
    for (var i = 0; i < kinds.length; i++) if (U.sfx(tab[kinds[i]] || (voKey(ph.name) + '.' + kinds[i]), o || { gap: 2000 })) return kinds[i];
    return null;
  };
  // nhắc khi để yên lâu: [ĐỀ XUẤT] 20 s không bấm gì thì nói một câu "idle", rồi đếm lại (bản gốc không đo được khoảng này)
  U.MERCHANT_IDLE_MS = 20000;
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
      // bản gốc: không bảng tên, không chữ hướng dẫn; khung trên là quầy lều (đổi hàng) + xe (rời đi), tên + mô tả hiện khi rê chân dung
      U.top.base(run, { hero: true, sides: false, board: true, lane: 'merchant', carpet: ph.merchantId });
      var e = root.BZ_ENCOUNTERS.events[ph.merchantId] || {};
      side = U.top.portrait(ph.name, e.StartingTier || 'Bronze', U.top.artOf({ type: 'merchant', id: ph.merchantId }), '');
      var st = this._stall = U.top.stall({
        name: ph.name, desc: ph.desc, canExit: true,
        leave: function () { U.dispatch({ t: 'leave' }); },
        reroll: {
          tip: function () { var p = U.state.run.phase; return p.rerolls > 0 ? '<br><span class="o">Còn ' + p.rerolls + ' lượt</span>' : '<br><span class="o">Hết lượt đổi</span>'; },
          act: function () {
            // clip reroll: chớp vàng 200 ms, lấp lánh xanh 500 ms, rồi hàng mới bật ra 500 ms (~1,3 s)
            U.cards.dealDelay = 500; var r0 = U.dispatch({ t: 'reroll' }); U.cards.dealDelay = 0;
            if (r0.ok) U.transitions.sparkle();
          }
        }
      });
      var rr = st.rr, who = st.who;
      this._rr = rr;
      // lời thương nhân: bấm liên tiếp ≥ 3 lần lên chân dung → multiclick; để yên lâu → idle
      var self = this, clicks = [];
      this._bought = false;
      who.addEventListener('click', function () {
        var t = U.now(); clicks.push(t); clicks = clicks.filter(function (x) { return t - x < 1500; });
        if (clicks.length >= 3) { clicks = []; U.merchantVoice(U.state.run.phase, 'multiclick', { gap: 4000 }); }
      });
      function armIdle() {
        clearTimeout(self._idleT);
        self._idleT = setTimeout(function () { if (U.state.screen === 'merchant' && !U.confirmBox) U.merchantVoice(U.state.run.phase, 'idle', { gap: 4000 }); armIdle(); }, U.MERCHANT_IDLE_MS);
      }
      this._armIdle = armIdle; armIdle();
      // sau viền vàng + lấp lánh xanh, hàng bật ra (clip merchant-enter: tổng ~2,6 s)
      if (prev) { U.cards.dealDelay = 900; setTimeout(function () { U.cards.dealDelay = 0; }, 0); U.transitions.portal(); U.merchantVoice(ph, ['enter', 'idle']); U.sfx('trans.boardIn', { vol: 0.6 }); }
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      U.cards.setTop(stockList(run));
      if (this._stall) U.top.stallReroll(this._stall, ph, run);
    },
    exit: function () { this._rr = null; this._stall = null; clearTimeout(this._idleT); U.top.clear(); },
    // lệnh vừa được nhận (trước khi đổi màn): lời thương nhân theo việc người chơi làm (W-05)
    onCommand: function (cmd, ev, prev) {
      var ph = prev.phase;
      if (this._armIdle) this._armIdle();
      if (cmd.t === 'buy') { this._bought = true; U.merchantVoice(ph, 'buyitem', { gap: 1500 }); }
      else if (cmd.t === 'sell') {
        var c = R().findCard(prev, cmd.uid), sz = c && (R().SIZE[(R().tpl(c.id) || {}).Size] || 1);
        U.merchantVoice(ph, sz > 1 ? ['sellsized', 'sellitem'] : 'sellitem', { gap: 1500 });
      }
      else if (cmd.t === 'reroll') U.merchantVoice(ph, 'reroll', { gap: 1500 });
      else if (cmd.t === 'leave') U.merchantVoice(ph, this._bought ? ['buyexit', 'exit'] : 'exit', { gap: 1500 });
    },
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
