/* Chợ Phiên — thẻ của run: bàn tay 10 ô (S=1, M=2, L=3 ô; ô khoá theo cấp hiện ổ khoá), khay kho 10 ô trượt lên từ đáy,
   và hàng thẻ vùng trên (hàng thương nhân, loot, bàn quái xem trước). Phần tử thẻ = BZCard (js/view/card.js) để giữ nguyên
   khung, gem, tag cooldown, art 100%×100% (bẫy art bị ép vuông, brain/plans/bazaar-web.md).
   Đồng bộ theo `run`: thẻ mới tạo, thẻ còn thì trượt về ô (150 ms OutBack — VISUAL §2 movementDuration/OutBounce),
   thẻ mất thì tan (CardDespawn). Hover: nhấc + nghiêng ±6° (VISUAL §1) và tooltip gốc (BZTooltip). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; }, BC = function () { return root.BZCard; };
  var C = U.cards = {};
  var G = C.G = {
    hand: { x0: 412, pitch: 109.6, top: 553, h: 232 },
    tray: { left: 392, top: 800, w: 1136, hgt: 248, x0: 68, pitch: 100, y: 34, h: 202 },
    topRow: { cx: 960, top: 305, h: 232, pitch: 109.6, gap: 16 }
  };
  var own = {};      // uid → el
  var top = {};      // key → el
  var sockEls = [], traySock = [], trayOpen = false;
  var hovered = null, touchTip = null;

  C.build = function () {
    var Rf = V().refs;
    for (var s = 0; s < 10; s++) {
      var d = U.el('div', 'rs-sock', Rf.runSockets);
      d.style.left = (G.hand.x0 + s * G.hand.pitch + 3) + 'px'; d.style.top = (G.hand.top - 2) + 'px';
      d.style.width = (G.hand.pitch - 6) + 'px'; d.style.height = (G.hand.h + 4) + 'px';
      U.el('i', 'lock', d);
      sockEls.push(d);
    }
    var tr = Rf.tray;
    tr.style.left = G.tray.left + 'px'; tr.style.top = G.tray.top + 'px'; tr.style.width = G.tray.w + 'px'; tr.style.height = G.tray.hgt + 'px';
    var head = U.el('div', 'head', tr, '<span>Kho đồ</span>');
    U.button(head, 'x', '✕', 'Đóng kho (Space)', function () { C.toggleStash(false); });
    for (var k = 0; k < 10; k++) {
      var t = U.el('div', 'rs-sock tray', tr);
      t.style.left = (G.tray.x0 + k * G.tray.pitch + 3) + 'px'; t.style.top = (G.tray.y - 2) + 'px';
      t.style.width = (G.tray.pitch - 6) + 'px'; t.style.height = (G.tray.h + 4) + 'px';
      traySock.push(t);
    }
    C.trayCards = U.el('div', 'cards', tr);
    bindHover(Rf.runCards); bindHover(tr);
  };

  // ---------- hình học ----------
  C.handLeft = function (socket, size, w) { return G.hand.x0 + socket * G.hand.pitch + (size * G.hand.pitch - w) / 2; };
  C.trayLeft = function (socket, size, w) { return G.tray.x0 + socket * G.tray.pitch + (size * G.tray.pitch - w) / 2; };
  // ô trên sân khấu (toạ độ 1920×1080)
  C.socketStageRect = function (section, s) {
    if (section === 'hand') return { x: G.hand.x0 + s * G.hand.pitch, y: G.hand.top, w: G.hand.pitch, h: G.hand.h };
    return { x: G.tray.left + G.tray.x0 + s * G.tray.pitch, y: G.tray.top + G.tray.y, w: G.tray.pitch, h: G.tray.h };
  };
  C.socketClientRect = function (section, s) {
    var r = C.socketStageRect(section, s), st = V().refs.stage.getBoundingClientRect(), k = V().scale;
    return { x: st.left + r.x * k, y: st.top + r.y * k, w: r.w * k, h: r.h * k, cx: st.left + (r.x + r.w / 2) * k, cy: st.top + (r.y + r.h / 2) * k };
  };
  C.trayIsOpen = function () { return trayOpen; };

  // ---------- thẻ người chơi ----------
  function makeOwn(c, attrs, h) {
    var tpl = R().tpl(c.id);
    var el = BC().create({ uid: c.uid, id: c.id, tier: c.tier, size: c.size, ench: c.ench, type: U.typeOf(tpl) }, { h: h, attrs: attrs, side: 0 });
    el._rs = { kind: 'own', uid: c.uid };
    el.dataset.drag = '1';
    return el;
  }
  C.ownEl = function (uid) { return own[uid] || null; };
  C.allOwn = function () { return own; };
  // render(run, opts): opts.eligible = {uid:true} (bệ), opts.locked = true (không kéo được, vd trận đấu)
  C.render = function (run, opts) {
    opts = opts || {};
    var info = U.boardInfo(run), seen = {}, lock = R().unlockedSockets(run.level);
    sockEls.forEach(function (d, i) { d.classList.toggle('locked', !lock[i]); });
    var occ = {}; run.board.stash.forEach(function (c) { for (var k = 0; k < c.size; k++) occ[c.socket + k] = 1; });
    traySock.forEach(function (d, i) { d.classList.toggle('used', !!occ[i]); });
    ['hand', 'stash'].forEach(function (sec) {
      run.board[sec].forEach(function (c) {
        seen[c.uid] = 1;
        var h = sec === 'hand' ? G.hand.h : G.tray.h, el = own[c.uid], a = (info[c.uid] || {}).attrs || {};
        if (el && (el._bz.h !== h || el._bz.inst.tier !== c.tier || el._bz.inst.ench !== (c.ench || null))) {
          // đổi khay (cao khác) hoặc nâng bậc/yểm: dựng lại tại chỗ cũ
          var old = el; el = makeOwn(c, a, h); el.style.left = old.style.left; el.style.top = old.style.top;
          if (old.parentNode) old.parentNode.replaceChild(el, old);
          own[c.uid] = el; el._moved = sec;
        }
        if (!el) { el = own[c.uid] = makeOwn(c, a, h); el.classList.add('fresh'); }
        else BC().setAttrs(el, a, false);
        el._rs.section = sec; el._rs.socket = c.socket; el._rs.size = c.size;
        var parent = sec === 'hand' ? V().refs.runCards : C.trayCards;
        var left = sec === 'hand' ? C.handLeft(c.socket, c.size, el._bz.w) : C.trayLeft(c.socket, c.size, el._bz.w);
        var tp = sec === 'hand' ? G.hand.top : G.tray.y;
        if (el.parentNode !== parent) {
          // đổi lớp: giữ vị trí nhìn thấy (toạ độ khay là tương đối) rồi trượt về ô
          var was = el.parentNode ? U.rectOf(el) : null;
          parent.appendChild(el);
          if (was) {
            var off = parent === C.trayCards ? { x: G.tray.left, y: G.tray.top } : { x: 0, y: 0 };
            el.classList.add('nomove'); el.style.left = (was.x - off.x) + 'px'; el.style.top = (was.y - off.y) + 'px'; void el.offsetWidth; el.classList.remove('nomove');
          }
        }
        if (el.classList.contains('fresh')) { el.style.left = left + 'px'; el.style.top = tp + 'px'; }
        else { el.style.left = left.toFixed(1) + 'px'; el.style.top = tp + 'px'; }
        el.classList.toggle('eligible', !!(opts.eligible && opts.eligible[c.uid]));
        el.classList.toggle('dim', !!(opts.eligible && !opts.eligible[c.uid]));
        el._tip = null;
      });
    });
    Object.keys(own).forEach(function (uid) {
      if (seen[uid]) return;
      var el = own[uid]; delete own[uid];
      if (el === hovered) setHovered(null);
      if (el._keep) return; // hoạt ảnh (bán) tự gỡ
      el.classList.add('despawn'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    });
    // thẻ vừa tạo: bỏ cờ sau một khung (để hoạt ảnh FLIP đọc được)
    requestAnimationFrame(function () { Object.keys(own).forEach(function (u) { own[u].classList.remove('fresh'); }); });
  };
  C.clearOwn = function () { Object.keys(own).forEach(function (u) { var e = own[u]; if (e.parentNode) e.parentNode.removeChild(e); }); own = {}; };
  C.show = function (on) {
    var Rf = V().refs;
    Rf.runCards.style.display = on ? '' : 'none'; Rf.runSockets.style.display = on ? '' : 'none'; Rf.tray.style.display = on ? '' : 'none';
    if (!on) setHovered(null);
  };

  // ---------- hàng vùng trên ----------
  // setTop(list) — list: [{key, card:{id,tier,ench}, price, discount, kind:'stock'|'loot'|'preview', i, h}]
  C.setTop = function (list, opts) {
    opts = opts || {};
    var layer = V().refs.runCards, seen = {}, els = [];
    list.forEach(function (it, n) {
      seen[it.key] = 1;
      var el = top[it.key];
      if (!el) {
        var tpl = R().tpl(it.card.id), sz = R().isSkill(tpl) ? 1 : (R().SIZE[tpl.Size] || 1);
        el = BC().create({ uid: 'top:' + it.key, id: it.card.id, tier: it.card.tier, size: sz, ench: it.card.ench || null, type: U.typeOf(tpl) },
          { h: it.h || G.topRow.h, attrs: U.looseAttrs(it.card), side: 1 });
        el._rs = { kind: it.kind, i: it.i, key: it.key, size: sz, card: it.card };
        if (it.kind !== 'preview') el.dataset.drag = '1';
        if (R().isSkill(tpl)) el.classList.add('is-skill');
        el.classList.add('top', 'deal');
        el.style.animationDelay = ((C.dealDelay || 0) + n * 70) + 'ms';
        layer.appendChild(el);
        top[it.key] = el;
        if (it.kind === 'stock') U.sfx('card.revealFlipBronze', { vol: 0.5, gap: 60 });
      }
      el._rs.i = it.i; el._rs.price = it.price; el._rs.card = it.card;
      var pt = el.querySelector('.rs-price');
      if (it.price != null) {
        if (!pt) pt = U.el('div', 'rs-price', el._bz.cb);
        pt.innerHTML = '<i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + it.price + '</b>' + (it.discount ? '<s>' + Math.round(it.price / 0.75) + '</s>' : '');
        pt.classList.toggle('disc', !!it.discount);
        pt.classList.toggle('poor', it.price > (U.state.run ? U.state.run.gold : 0));
      } else if (pt) pt.remove();
      els.push(el);
    });
    Object.keys(top).forEach(function (k) {
      if (seen[k]) return;
      var el = top[k]; delete top[k];
      if (el === hovered) setHovered(null);
      if (el._keep) return;
      el.classList.add('despawn'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    });
    // xếp giữa vùng trên
    var P = G.topRow, gap = opts.gap == null ? P.gap : opts.gap, total = 0;
    els.forEach(function (el) { total += el._rs.size * P.pitch * ((el._bz.h) / P.h); });
    total += gap * Math.max(0, els.length - 1);
    var x = (opts.cx || P.cx) - total / 2, y = opts.top == null ? P.top : opts.top;
    els.forEach(function (el) {
      var span = el._rs.size * P.pitch * (el._bz.h / P.h);
      el.style.left = (x + (span - el._bz.w) / 2).toFixed(1) + 'px';
      el.style.top = (y + (P.h - el._bz.h) / 2) + 'px';
      x += span + gap;
    });
    return els;
  };
  C.topEl = function (key) { return top[key] || null; };
  C.topEls = function () { return top; };
  C.clearTop = function (instant) {
    Object.keys(top).forEach(function (k) {
      var el = top[k];
      if (instant) { if (el.parentNode) el.parentNode.removeChild(el); }
      else { el.classList.add('despawn'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420); }
    });
    top = {};
  };

  // ---------- kho ----------
  C.toggleStash = function (on) {
    if (on == null) on = !trayOpen;
    if (on === trayOpen) return;
    trayOpen = on;
    V().refs.tray.classList.toggle('open', on);
    V().refs.stage.classList.toggle('stash-open', on);
    U.sfx('board.stashFlip');
  };

  // ---------- đánh dấu ô khi kéo ----------
  C.markSockets = function (section, from, n, ok) {
    sockEls.concat(traySock).forEach(function (d) { d.classList.remove('hint', 'bad'); });
    if (section == null) return;
    var arr = section === 'hand' ? sockEls : traySock;
    for (var k = from; k < from + n && k < arr.length; k++) if (k >= 0) arr[k].classList.add(ok ? 'hint' : 'bad');
  };
  C.dragging = function (on) { V().refs.stage.classList.toggle('dragging', !!on); if (on) setHovered(null); };

  // ---------- hover + tooltip ----------
  function bindHover(layer) {
    layer.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'touch' || (U.drag && U.drag.active())) return;
      var el = ev.target.closest && ev.target.closest('.bz-card');
      setHovered(el, ev);
    });
    layer.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') setHovered(null); });
  }
  C.tipFor = function (el) {
    if (el._tip) return el._tip;
    var rs = el._rs, run = U.state.run;
    if (rs.kind === 'own') {
      var c = R().findCard(run, rs.uid); if (!c) return null;
      var bi = U.boardInfo(run)[c.uid] || {};
      el._tip = U.tipInfo(c, bi.attrs || {}, bi.boards);
    } else el._tip = U.tipInfo(rs.card, U.looseAttrs(rs.card), null);
    return el._tip;
  };
  function setHovered(el, ev) {
    var now = U.now();
    if (hovered && hovered !== el) { BC().setHover(hovered, false, now); U.sfx('card.lower', { vol: 0.4 }); root.BZTooltip.hide(); }
    if (el && hovered !== el) U.sfx('card.raise', { vol: 0.5 });
    hovered = el || null;
    if (!el) return;
    BC().setHover(el, true, now);
    if (ev && ev.clientX != null) {
      var b = el.getBoundingClientRect();
      BC().pointer(el, ((ev.clientX - b.left) / b.width - 0.5) * 2, ((ev.clientY - b.top) / b.height - 0.5) * 2);
    }
    C.showTip(el);
  }
  C.showTip = function (el) {
    var info = C.tipFor(el); if (!info) return;
    var r = U.rectOf(el);
    root.BZTooltip.show(info, { x: r.x, y: r.y - 10, w: r.w, h: r.h });
    // giá bán ở chân tooltip ("Sells for")
    var box = root.BZTooltip.el();
    if (box && el._rs.kind === 'own' && U.state.run) {
      var sp = R().sellPrice(U.state.run, el._rs.uid), f = box.querySelector('.rs-sellfor');
      if (!f) f = U.el('div', 'rs-sellfor', box);
      f.innerHTML = 'Bán được <i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + sp + '</b>';
    }
  };
  C.hideTip = function () { setHovered(null); root.BZTooltip.hide(); };
  // chạm (điện thoại): chạm một lần mở tooltip, chạm lần nữa đóng
  C.tapTip = function (el) {
    if (touchTip === el) { touchTip = null; root.BZTooltip.hide(); BC().setHover(el, false, U.now()); return false; }
    if (touchTip) BC().setHover(touchTip, false, U.now());
    touchTip = el; BC().setHover(el, true, U.now()); C.showTip(el);
    return true;
  };
  C.clearTap = function () { if (touchTip) BC().setHover(touchTip, false, U.now()); touchTip = null; root.BZTooltip.hide(); };

  C.tick = function (now, dt) {
    var f = function (el) { var B = el._bz; if (B && (B.dirty || B.hoverTo || B.hover > 0.001)) BC().tick(el, now, now, dt); };
    for (var u in own) f(own[u]);
    for (var k in top) f(top[k]);
  };
})(window);
