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
    tray: { left: 392, top: 300, w: 1136, hgt: 242, x0: 20, pitch: 109.6, y: 5, h: 232 }, // kho nằm đúng chỗ dải trên (clip stash-open)
    topRow: { cx: 960, top: 305, h: 232, pitch: 109.6, gap: 16 }
  };
  var own = {};      // uid → el
  // hoạt ảnh chia bài / bày phần thưởng (rs-deal, rs-prize) chỉ chạy MỘT lần: xong thì bỏ lớp + độ trễ, để khi phần tử bị gắn lại
  // (nhấc lên lớp kéo, bay về chỗ cũ) trình duyệt không chạy lại hoạt ảnh — thẻ không tàng hình 0,9 s rồi lật lại (INTERACT-1)
  var ONCE = { 'rs-deal': 'deal', 'rs-prize': 'prize' };
  C.settle = function (el) { el.classList.remove('deal', 'prize'); el.style.animationDelay = ''; };
  function onceEnd(e) { var c = ONCE[e.animationName]; if (c && e.target === this) { this.classList.remove(c); this.style.animationDelay = ''; } }
  var top = {};      // key → el
  var sockEls = [], traySock = [], trayOpen = false;
  var hovered = null, touchTip = null, tapHint = null;

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
        C.questChip(el, run);
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
    // hàng dài (thương nhân 10 món, FLOW-6): thu nhỏ thẻ để cả hàng nằm gọn trong dải trên (392..1528, chừa lề 24 px mỗi bên)
    var P0 = G.topRow, gap0 = opts.gap == null ? P0.gap : opts.gap, span0 = 0;
    list.forEach(function (it) { var t = R().tpl(it.card.id); span0 += (R().isSkill(t) ? 1 : (R().SIZE[t.Size] || 1)) * P0.pitch * ((it.h || P0.h) / P0.h); });
    span0 += gap0 * Math.max(0, list.length - 1);
    var fitK = span0 > C.LANE_W ? C.LANE_W / span0 : 1;
    if (fitK < 1) list = list.map(function (it) { var o = {}, k; for (k in it) o[k] = it[k]; o.h = Math.floor((it.h || P0.h) * fitK); return o; });
    list.forEach(function (it, n) {
      seen[it.key] = 1;
      var el = top[it.key];
      // cùng ô hàng nhưng đổi bậc / yểm (sự kiện stock: Lucky Clover, Dreampearl): dựng lại tại chỗ, không chia lại
      if (el && (el._bz.inst.tier !== it.card.tier || (el._bz.inst.ench || null) !== (it.card.ench || null))) {
        var old = el, tpl0 = R().tpl(it.card.id), sz0 = old._rs.size;
        el = BC().create({ uid: 'top:' + it.key, id: it.card.id, tier: it.card.tier, size: sz0, ench: it.card.ench || null, type: U.typeOf(tpl0) },
          { h: old._bz.h, attrs: U.looseAttrs(it.card), side: 1 });
        el._rs = old._rs; if (old.dataset.drag) el.dataset.drag = '1';
        el.className = old.className.split(' ').filter(function (c) { return c !== 'deal'; }).join(' '); el.style.left = old.style.left; el.style.top = old.style.top;
        if (old === hovered) setHovered(null);
        if (old.parentNode) old.parentNode.replaceChild(el, old);
        top[it.key] = el;
      }
      if (!el) {
        var tpl = R().tpl(it.card.id), sz = R().isSkill(tpl) ? 1 : (R().SIZE[tpl.Size] || 1);
        el = BC().create({ uid: 'top:' + it.key, id: it.card.id, tier: it.card.tier, size: sz, ench: it.card.ench || null, type: U.typeOf(tpl) },
          { h: it.h || G.topRow.h, attrs: U.looseAttrs(it.card), side: 1 });
        el._rs = { kind: it.kind, i: it.i, key: it.key, size: sz, card: it.card };
        if (it.kind !== 'preview') el.dataset.drag = '1';
        if (R().isSkill(tpl)) el.classList.add('is-skill');
        el.classList.add('top', 'deal');
        el.style.animationDelay = ((C.dealDelay || 0) + n * 70) + 'ms';
        el.addEventListener('animationend', onceEnd);
        layer.appendChild(el);
        top[it.key] = el;
        if (it.kind === 'stock') U.sfx('card.revealFlipBronze', { vol: 0.5, gap: 60 });
      }
      el._rs.i = it.i; el._rs.price = it.price; el._rs.card = it.card;
      var pt = el.querySelector('.rs-price');
      if (it.price != null) {
        if (!pt) pt = U.el('div', 'rs-price', el._bz.cb);
        var base = it.kind === 'stock' ? R().price(it.card, it.card.tier).buy : it.price;
        pt.innerHTML = '<i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + it.price + '</b>' + (it.price < base ? '<s>' + base + '</s>' : it.discount ? '<s>' + Math.round(it.price / 0.75) + '</s>' : '');
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
    var P = G.topRow, gap = (opts.gap == null ? P.gap : opts.gap) * fitK, total = 0;
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
  C.LANE_W = 1088;
  C.topEl = function (key) { return top[key] || null; };
  C.stockEl = function (i) { for (var k in top) if (top[k]._rs.kind === 'stock' && top[k]._rs.i === i) return top[k]; return null; };

  // ---------- quest trên thẻ (BZRun.quests.status) ----------
  // chip trên đỉnh thẻ: biểu tượng cuộn giấy + "tiến độ/đích" + vạch đầy; xong hết thì chip vàng có dấu tích.
  // [ĐỀ XUẤT] bản demo không có prefab chip quest đọc được: dựng theo màu tooltip quest (vàng #ffd36b trên nền nâu).
  function questOf(c) { var Q = R().quests; return Q && Q.status ? Q.status(c) : []; }
  // chữ thưởng gốc có chỗ trống ({aura.q1}): đọc số thật từ mẫu dẫn xuất của chính mục đó (BZRun.questTplId + BZSim.cardText)
  var rwCache = {};
  C.questReward = function (c, key, raw) {
    if (!raw || raw.indexOf('{') < 0) return raw || '';
    var base = U.baseId(c.id), k = base + '|' + (c.tier || '') + '|' + key;
    if (k in rwCache) return rwCache[k];
    var out = raw;
    try {
      var did = R().questTplId({ id: base, qd: [key] });
      var lines = root.BZSim.cardText({ uid: 'x', id: did, tier: c.tier || 'Bronze', ench: null, socket: 0, size: 1, section: 'hand' }, null) || [];
      lines.forEach(function (l) { if (l && l.raw === raw && l.text) out = l.text; });
    } catch (e) { out = raw; }
    rwCache[k] = out;
    return out;
  };
  C.questChip = function (el, run, pulse) {
    var c = el._rs && el._rs.kind === 'own' && run ? R().findCard(run, el._rs.uid) : null;
    var st = c ? questOf(c) : [], chip = el.querySelector('.rs-quest');
    if (!st.length) { if (chip) chip.remove(); return; }
    var open = st.filter(function (q) { return !q.done && !q.closed; }), cur = open[0] || st.filter(function (q) { return q.done; }).pop() || st[0];
    var done = !open.length;
    if (!chip) chip = U.el('div', 'rs-quest', el._bz.cb, '<i></i><b></b><u><s></s></u>');
    chip.classList.toggle('done', done);
    chip.querySelector('b').textContent = done ? '✓' : cur.progress + '/' + cur.goal;
    chip.querySelector('s').style.width = (done ? 100 : Math.round(100 * cur.progress / Math.max(1, cur.goal))) + '%';
    chip.title = (cur.text || 'Nhiệm vụ') + (cur.reward ? ' → ' + C.questReward(c, cur.key, cur.reward) : '');
    if (pulse) { chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
  };
  // khối "Nhiệm vụ" ở chân tooltip: mỗi mục một dòng (chữ gốc + thưởng + vạch tiến độ)
  function questTip(box, c) {
    var old = box.querySelector('.rs-questtip'); if (old) old.remove();
    var st = questOf(c); if (!st.length) return;
    var F = root.BZTooltip.format, d = U.el('div', 'rs-questtip', box.querySelector('.box') || box, '<h5>Nhiệm vụ</h5>');
    st.forEach(function (q) {
      var row = U.el('div', 'q' + (q.done ? ' done' : '') + (q.closed ? ' closed' : ''), d);
      row.innerHTML = '<p>' + F(q.text || '').html + '</p>' + (q.reward ? '<p class="rw">' + F(C.questReward(c, q.key, q.reward)).html + '</p>' : '') +
        '<div class="bar"><s style="width:' + Math.round(100 * q.progress / Math.max(1, q.goal)) + '%"></s><b>' + (q.done ? 'Xong' : q.progress + '/' + q.goal) + '</b></div>';
    });
  }
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
  // toggleStash(on, opts): opts.silent = không tiếng (đóng tự động khi đổi màn)
  C.toggleStash = function (on, opts) {
    if (on == null) on = !trayOpen;
    if (on === trayOpen) return;
    trayOpen = on;
    if (opts && opts.silent) { V().refs.tray.classList.toggle('open', on); V().refs.stage.classList.toggle('stash-open', on); return; }
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
    if (hovered && hovered !== el) {
      BC().setHover(hovered, false, now); U.sfx('card.lower', { vol: 0.4 }); root.BZTooltip.hide();
      if (touchTip === hovered) { touchTip = null; tapHint = null; } // chuột rời thẻ đang chọn: bỏ chọn (lần bấm sau lại chỉ là chọn)
    }
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
      var oc = R().findCard(U.state.run, el._rs.uid);
      if (oc) questTip(box, oc);
      var sp = R().sellPrice(U.state.run, el._rs.uid), f = box.querySelector('.rs-sellfor');
      if (!f) f = U.el('div', 'rs-sellfor', box);
      else box.appendChild(f);
      f.innerHTML = 'Bán được <i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + sp + '</b>';
    } else if (box && el._rs.card) {
      questTip(box, { id: el._rs.card.id, tier: el._rs.card.tier, qp: {}, qd: [] });
      // hàng của thương nhân: "Bán lại được N" như dòng "Sells for N" của tooltip gốc (FLOW-4/19); kỹ năng không bán được
      var f2 = box.querySelector('.rs-sellfor');
      if (el._rs.kind === 'stock' && !el.classList.contains('is-skill')) {
        var sp2 = R().price(el._rs.card, el._rs.card.tier).sell || 0;
        if (!f2) f2 = U.el('div', 'rs-sellfor', box); else box.appendChild(f2);
        f2.innerHTML = 'Bán lại được <i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + sp2 + '</b>';
      } else if (f2) f2.remove();
    }
    // phần thêm làm tooltip cao hơn: đặt lại vị trí (cùng info → BZTooltip không vẽ lại nội dung)
    // thẻ đang được chọn (chạm / bấm lần 1): dòng nhắc "chạm lần nữa để mua" (MOBILE-4, INTERACT-14)
    var oldH = box && box.querySelector('.rs-taphint'); if (oldH) oldH.remove();
    if (box && touchTip === el && tapHint) U.el('div', 'rs-taphint', box.querySelector('.box') || box, tapHint);
    if (box && box.querySelector('.rs-questtip, .rs-sellfor, .rs-taphint')) root.BZTooltip.show(info, { x: r.x, y: r.y - 10, w: r.w, h: r.h });
  };
  C.hideTip = function () { setHovered(null); root.BZTooltip.hide(); };
  // chạm (điện thoại) / bấm (máy tính, hàng thương nhân): lần 1 chọn + mở tooltip (kèm dòng nhắc `hint`), lần 2 trên CÙNG thẻ trả false
  // (màn gọi lệnh: mua / lấy). Chạm chỗ khác (core.js tapAway) hoặc rời chuột khỏi thẻ thì bỏ chọn.
  C.tapTip = function (el, hint) {
    if (touchTip === el) { touchTip = null; tapHint = null; root.BZTooltip.hide(); BC().setHover(el, false, U.now()); return false; }
    if (touchTip && touchTip !== hovered) BC().setHover(touchTip, false, U.now());
    touchTip = el; tapHint = hint || null; BC().setHover(el, true, U.now()); C.showTip(el);
    return true;
  };
  C.armed = function () { return touchTip; };
  C.clearTap = function () { if (touchTip && touchTip !== hovered) BC().setHover(touchTip, false, U.now()); touchTip = null; tapHint = null; root.BZTooltip.hide(); };

  C.tick = function (now, dt) {
    var f = function (el) { var B = el._bz; if (B && (B.dirty || B.hoverTo || B.hover > 0.001)) BC().tick(el, now, now, dt); };
    for (var u in own) f(own[u]);
    for (var k in top) f(top[k]);
  };
})(window);
