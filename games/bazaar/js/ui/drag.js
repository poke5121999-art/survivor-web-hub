/* Chợ Phiên — bộ kéo-thả dùng chung cho hàng thương nhân, loot, bàn tay và kho (VISUAL §2).
   Nhấc: xoá xoay, tắt hover, tiếng card.pickup; thẻ bám con trỏ trực tiếp (không làm mượt) với độ lệch lúc nhấc.
   Ô đích: ô gần nhất theo tâm thẻ, cỡ S/M/L chiếm 1/2/3 ô; sáng xanh nếu đặt được, đỏ nếu không (khoá / đè / thiếu vàng).
   Rê qua rương (ô trái) thì mở kho (OpenStorageToy), kéo về bàn tay thì kho đóng lại; thả lên rương = cất vào ô trống đầu của kho.
   Bán: CHỈ ở màn thương nhân (VISUAL §2 "Sell zone", WIKI §2.5) — con trỏ phải nằm hẳn trong dải trên, dải sáng vàng + giá bán,
   hàng của thương nhân mờ đi để thấy rõ (INTERACT-5/20). Màn loot / rương / lên cấp chỉ mở vùng bán sau khi phần thưởng bị từ chối
   vì hết chỗ (U.state.sellOpen, FLOW-9). Màn bệ: thả lên dải trên = đưa thẻ lên bệ (lệnh commit, INTERACT-4), không bao giờ bán.
   Thẻ bám con trỏ thẳng đứng, không nghiêng, không phóng (VISUAL §2 "Follow"); cảm ứng: thẻ nhấc cao hơn ngón tay (MOBILE-12).
   Thả lên ô đã có thẻ (pha 4): lệnh move của reducer tự đẩy thẻ chắn sang bên hoặc đổi chỗ; lúc rê, chạy thử lệnh đó
   (BZRun.apply trên bản sao, không đổi run) để biết đặt được không và thẻ nào sẽ dịch: các thẻ đó nhích 0,25 ô về phía ô mới
   trong 50 ms (HoveredMove, VISUAL §2: HoveredOffset 0.25, HoveredMoveDuration 0.05), rời đi thì về chỗ trong 35 ms (MoveBack).
   Thả: lệnh đi qua BZUI.dispatch → thẻ trượt vào ô 150 ms có nảy; thả hỏng → bay về chỗ cũ (ItemMoveCancelled).
   Chuột và cảm ứng dùng chung Pointer Events (thẻ có touch-action:none). Nhấp/chạm không kéo → screen.onCardClick. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var D = U.drag = {};
  var st = null;          // {el, src, x0, y0, started, off, origin, target}
  var sellZone = null, sellLbl = null;
  var THRESH = 7;

  D.active = function () { return !!(st && st.started); };
  // huỷ kéo (Esc, đổi màn): thẻ bay về chỗ cũ, không gửi lệnh nào (ItemMoveCancelled)
  D.cancel = function () { if (st && st.started) { finish(st, null, null); return true; } st = null; return false; };
  D.build = function () {
    var Rf = V().refs;
    sellZone = U.el('div', 'rs-sellzone', Rf.runHud, '<div class="lbl">Thả vào đây để bán<b></b></div>');
    sellLbl = sellZone.querySelector('b');
    [Rf.runCards, Rf.tray].forEach(function (layer) { layer.addEventListener('pointerdown', down); });
    root.addEventListener('pointermove', move, { passive: false });
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', cancel);
  };

  function stagePt(ev) { return V().toStage(ev.clientX, ev.clientY); }
  function down(ev) {
    if (ev.button != null && ev.button !== 0) return;
    if (st && st.started) return; // ngón thứ hai trong lúc đang kéo
    var el = ev.target.closest && ev.target.closest('.bz-card');
    if (!el || !el._rs) return;
    if (U.combat && U.combat.active()) return;
    var p = stagePt(ev);
    st = { el: el, x0: p.x, y0: p.y, cx0: ev.clientX, cy0: ev.clientY, started: false, touch: ev.pointerType === 'touch', id: ev.pointerId };
    if (ev.pointerType === 'touch') ev.preventDefault();
  }
  function canDrag(el) {
    var sc = U.SCREENS[U.state.screen];
    if (sc && sc.canDrag) return sc.canDrag(el);
    return el._rs.kind === 'own';
  }
  function begin(ev) {
    var el = st.el;
    if (!el.dataset.drag || !canDrag(el)) { st.noDrag = true; return; }
    st.started = true;
    U.cards.settle(el); // đang chia bài dở: hiện ngay, không chạy lại hoạt ảnh khi gắn sang lớp kéo (INTERACT-1)
    var r = U.rectOf(el), p = stagePt(ev);
    st.origin = { parent: el.parentNode, left: el.style.left, top: el.style.top, rect: r };
    st.off = { x: p.x - r.x, y: p.y - r.y };
    // cảm ứng: đáy thẻ nằm trên đầu ngón 12 px màn hình (tâm thẻ cao hơn ngón ~50 px) để ngón không che thẻ, giá và ô đích (MOBILE-12)
    if (st.touch) { st.lift = r.h + 12 / (V().scale || 1) - st.off.y; st.off.y += st.lift; }
    st.w = r.w; st.h = r.h;
    root.BZCard.setHover(el, false, U.now());
    U.cards.hideTip(); U.cards.clearTap();
    U.cards.dragging(true);
    V().refs.dragLayer.appendChild(el);
    el.classList.add('dragging');
    el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
    U.sfx('card.pickup');
    var rs = el._rs, run = U.state.run;
    if (rs.kind === 'own' && run && sellAllowed()) {
      sellZone.classList.add('show');
      sellLbl.innerHTML = '<i style="background-image:' + U.bg(U.ICON.coin) + '"></i>+' + R().sellPrice(run, rs.uid);
      st.sell = R().sellPrice(run, rs.uid);
      V().refs.stage.classList.add('selling');
      // giá bán đi theo thẻ (nhãn giữa dải hay bị chính thẻ đang kéo che, MOBILE-12 / INTERACT-20)
      st.chip = U.el('div', 'rs-sellchip', el, '<i style="background-image:' + U.bg(U.ICON.coin) + '"></i>+' + st.sell);
    }
    if (rs.kind === 'own' && U.state.screen === 'pedestal') { st.ped = true; V().refs.stage.classList.add('ped-drag'); }
  }
  // bán chỉ ở thương nhân; nơi khác chỉ khi vừa bị từ chối phần thưởng vì hết chỗ (U.state.sellOpen, đặt ở core.js U.reject)
  function sellAllowed() { var k = U.state.screen; return k === 'merchant' || (!!U.state.sellOpen && k !== 'pedestal' && k !== 'fightResult' && k !== 'end'); }
  D.sellAllowed = sellAllowed;
  // dải trên (toạ độ sân khấu): con trỏ phải ở trong dải, cách mép dưới (545) 20 px
  var LANE = { x0: 392, x1: 1528, y0: 240, y1: 525 };
  function inLane(p) { return p.x > LANE.x0 && p.x < LANE.x1 && p.y > LANE.y0 && p.y < LANE.y1; }

  function move(ev) {
    if (!st || (st.id != null && ev.pointerId !== st.id)) return;
    var p = stagePt(ev);
    if (!st.started && !st.noDrag) {
      if (Math.abs(ev.clientX - st.cx0) + Math.abs(ev.clientY - st.cy0) < THRESH) return;
      begin(ev);
      if (!st.started) return;
    }
    if (!st.started) return;
    if (ev.cancelable) ev.preventDefault();
    var el = st.el, x = p.x - st.off.x, y = p.y - st.off.y;
    el.style.left = x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px';
    var t = targetAt(p, x, y);
    if (!same(t, st.target)) {
      st.target = t;
      nudge(t && t.plan);
      U.cards.markSockets(t && (t.type === 'hand' || t.type === 'stash') ? t.type : null, t ? t.socket : 0, t ? t.n : 0, t && t.ok);
      sellZone.classList.toggle('hot', !!(t && t.type === 'sell'));
      st.el.classList.toggle('sell-hot', !!(t && t.type === 'sell'));
      V().refs.stage.classList.toggle('ped-hot', !!(t && t.type === 'pedestal' && t.ok));
      var chEl = U.hud.chestEl && U.hud.chestEl(); if (chEl) chEl.classList.toggle('drop-hot', !!(t && t.type === 'chest' && t.ok));
      if (t && (t.type === 'hand' || t.type === 'stash') && t.ok) U.sfx('card.slide', { vol: 0.35, gap: 80 });
    }
  }
  function same(a, b) { return (!a && !b) || (a && b && a.type === b.type && a.socket === b.socket && a.ok === b.ok && a.plan === b.plan); }

  // đích thả ở điểm p (sân khấu), góc trái-trên thẻ (x,y)
  function targetAt(p0, x, y) {
    var rs = st.el._rs, run = U.state.run, size = rs.kind === 'own' ? rs.size : rs.size, cx = x + st.w / 2, G = U.cards.G;
    if (!run) return null;
    // điểm ngắm: chuột = con trỏ; cảm ứng = tâm thẻ đang nhấc (ngón nằm dưới thẻ). Rương vẫn theo đầu ngón (p0).
    var p = st.touch ? { x: cx, y: y + st.h / 2 } : p0;
    var tpl = R().tpl(rs.kind === 'own' ? R().findCard(run, rs.uid).id : rs.card.id), isSkill = R().isSkill(tpl);
    // rương: rê qua thì mở kho (OpenStorageToy); thả ngay trên rương = cất vào ô trống đầu tiên của kho (INTERACT-6)
    var ch = U.hud.chestRect();
    if (ch && p0.x >= ch.x && p0.x <= ch.x + ch.w && p0.y >= ch.y && p0.y <= ch.y + ch.h) {
      if (!U.cards.trayIsOpen()) { U.cards.toggleStash(true); st.openedTray = true; }
      if (isSkill) return null;
      var own0 = rs.kind === 'own' ? R().findCard(run, rs.uid) : null;
      if (own0 && own0.section === 'stash') return null;
      var ff = R().firstFit(run, 'stash', size);
      return { type: 'chest', socket: ff, n: size, ok: ff >= 0 && affordable(rs) };
    }
    // kho mở vì rê qua rương: kéo về bàn tay thì đóng lại (VISUAL §2 "leaving closes it", INTERACT-19)
    if (st.openedTray && U.cards.trayIsOpen() && p.y > G.hand.top + 20 && p0.y < 790) { U.cards.toggleStash(false); st.openedTray = false; }
    var T = G.tray, inTray = U.cards.trayIsOpen() && p.y >= T.top - 20 && p.y <= T.top + T.hgt - 12 && p.x >= T.left && p.x <= T.left + T.w;
    if (inTray && !isSkill) {
      var s2 = clampS(Math.round((cx - (T.left + T.x0)) / T.pitch - size / 2), size);
      return withPlan({ type: 'stash', socket: s2, n: size, ok: placeOk('stash', s2, size) });
    }
    if (st.ped && inLane(p)) return { type: 'pedestal', ok: run.phase.kind === 'pedestal' && run.phase.eligible.indexOf(rs.uid) >= 0 };
    if (rs.kind === 'own' && st.sell != null && inLane(p)) return { type: 'sell', ok: true };
    if (isSkill) {
      // kỹ năng: thả đâu trên bàn cũng được, tự vào ô kỹ năng
      if (p.y > 520 && rs.kind !== 'own') return { type: 'auto', ok: affordable(rs), n: 0 };
      return null;
    }
    if (p.y >= 520 && p.y <= 800 && p.x >= 380 && p.x <= 1540) {
      var s = clampS(Math.round((cx - G.hand.x0) / G.hand.pitch - size / 2), size);
      return withPlan({ type: 'hand', socket: s, n: size, ok: placeOk('hand', s, size) });
    }
    return null;
  }
  function withPlan(t) {
    var rs = st.el._rs, run = U.state.run;
    if (t.ok && rs.kind === 'own') { var c = R().findCard(run, rs.uid); if (!(c.section === t.type && c.socket === t.socket)) t.plan = ownPlan(run, c, t.type, t.socket); }
    return t;
  }
  function clampS(s, size) { return Math.max(0, Math.min(10 - size, s)); }
  function affordable(rs) { return rs.kind !== 'stock' || (U.state.run.gold >= (rs.price || 0)); }
  function placeOk(section, s, size) {
    var rs = st.el._rs, run = U.state.run;
    if (rs.kind === 'own') {
      var c = R().findCard(run, rs.uid);
      if (c.section === section && c.socket === s) return true;
      return !!ownPlan(run, c, section, s);
    }
    if (!affordable(rs)) return false;
    if (R().fuseTarget(run, rs.card.id, rs.card.tier)) return true;
    return R().canPlace(run, section, s, size);
  }
  // Lệnh cho thẻ của mình thả ở (section, s): chạy thử move (ô trống / đẩy / đổi chỗ trong reducer), hỏng mà ô đích chắn đúng
  // một thẻ thì thử swap. Trả về {cmd, moves:[{uid, from, to}] (thẻ khác bị dịch)} hoặc null. Nhớ theo trạng thái run.
  var planMemo = { run: null, map: {} };
  function ownPlan(run, c, section, s) {
    if (planMemo.run !== run) planMemo = { run: run, map: {} };
    var k = c.uid + '|' + section + '|' + s;
    if (k in planMemo.map) return planMemo.map[k];
    var cmds = [{ t: 'move', uid: c.uid, section: section, socket: s }];
    var hit = run.board[section].filter(function (o) { return o.uid !== c.uid && o.socket < s + c.size && o.socket + o.size > s; });
    if (hit.length === 1) cmds.push({ t: 'swap', a: c.uid, b: hit[0].uid });
    var out = null;
    for (var i = 0; i < cmds.length && !out; i++) {
      var r = R().apply(run, cmds[i]);
      if (r.ok) out = { cmd: cmds[i], moves: r.events.filter(function (e) { return e.type === 'move' && e.uid !== c.uid; }) };
    }
    planMemo.map[k] = out;
    return out;
  }
  // HoveredMove: thẻ sắp bị đẩy nhích về phía ô mới (cùng khu: ngang 0,25 ô; sang khu khác: nhấc lên), còn lại về chỗ
  var nudged = [];
  function nudge(plan) {
    var want = {};
    ((plan && plan.moves) || []).forEach(function (m) {
      var el = U.cards.ownEl(m.uid); if (!el) return;
      var dx = 0, dy = 0;
      if (m.from.section === m.to.section) dx = (m.to.socket > m.from.socket ? 1 : -1) * U.cards.G.hand.pitch * 0.25;
      else dy = m.to.section === 'stash' ? -18 : 18;
      want[m.uid] = 1;
      el.classList.add('nudged'); el.style.translate = dx.toFixed(1) + 'px ' + dy + 'px';
    });
    nudged.forEach(function (uid) { if (want[uid]) return; var el = U.cards.ownEl(uid); if (el) { el.classList.remove('nudged'); el.style.translate = ''; } });
    var had = nudged.length;
    nudged = Object.keys(want);
    if (nudged.length && !had) U.sfx('card.slide', { vol: 0.3, gap: 80 });
  }

  function up(ev) {
    if (!st || (st.id != null && ev.pointerId !== st.id)) return;
    var s = st;
    if (!s.started) { st = null; click(s.el, s.touch); return; }
    var p = stagePt(ev), x = p.x - s.off.x, y = p.y - s.off.y;
    var t = targetAt(p, x, y);
    finish(s, t, { x: x, y: y, w: s.w, h: s.h });
  }
  function cancel() { if (st && st.started) finish(st, null, null); st = null; }

  function finish(s, t, rect) {
    st = null;
    var el = s.el, rs = el._rs, run = U.state.run, ok = false, cmds = null;
    sellZone.classList.remove('show', 'hot');
    if (s.chip) s.chip.remove();
    el.classList.remove('sell-hot');
    V().refs.stage.classList.remove('selling', 'ped-drag', 'ped-hot');
    var chEl = U.hud.chestEl && U.hud.chestEl(); if (chEl) chEl.classList.remove('drop-hot');
    nudge(null);
    U.cards.markSockets(null);
    U.cards.dragging(false);
    el.classList.remove('dragging'); el._bz.cb.style.transform = ''; el._bz.dirty = true;
    var ctx = { dropAt: rect, fromEl: el };
    // kho do kéo mở ra mà thẻ không vào kho: đóng lại khi thả / huỷ
    if (s.openedTray && !(t && t.ok && (t.type === 'stash' || t.type === 'chest'))) U.cards.toggleStash(false);
    if (t && t.ok) {
      if (t.type === 'sell') cmds = [{ t: 'sell', uid: rs.uid }];
      else if (t.type === 'pedestal') cmds = [{ t: 'commit', uid: rs.uid }];
      else if (rs.kind === 'own') {
        var c = R().findCard(run, rs.uid);
        var sec = t.type === 'chest' ? 'stash' : t.type, sock = t.socket;
        if (c.section === sec && c.socket === sock) cmds = [];
        else { var pl = ownPlan(run, c, sec, sock); cmds = pl ? [pl.cmd] : null; }
      } else if (rs.kind === 'stock') cmds = [t.type === 'auto' ? { t: 'buy', i: rs.i } : { t: 'buy', i: rs.i, section: t.type === 'chest' ? 'stash' : t.type, socket: t.socket }];
      else if (rs.kind === 'loot') cmds = [t.type === 'auto' ? { t: 'choose', i: rs.i } : { t: 'choose', i: rs.i, section: t.type === 'chest' ? 'stash' : t.type, socket: t.socket }];
    }
    if (cmds && cmds.length) {
      if (rs.kind !== 'own' || t.type === 'sell') el._keep = true;
      ok = true;
      for (var k = 0; k < cmds.length && ok; k++) ok = U.dispatch(cmds[k], ctx).ok;
      if (ok && el._keep) { if (el.parentNode) el.parentNode.removeChild(el); return; }
      el._keep = false;
      if (ok) { U.sfx(cmds[0].section === 'stash' ? 'card.land.storage' : 'card.land.player'); return; }
    } else if (cmds && !cmds.length) ok = false;
    // không hợp lệ / không đổi: bay về chỗ cũ, kèm lý do (INTERACT-21)
    if (t && !t.ok) U.reject(badReason(rs, t, run), null);
    returnHome(el, s.origin);
  }
  function badReason(rs, t, run) {
    if (rs.kind === 'stock' && !affordable(rs)) return 'not enough gold';
    if (t.type === 'pedestal') return 'not eligible for this pedestal';
    if (t.type === 'chest') return 'stash full';
    if (t.type === 'hand') {
      var lock = R().unlockedSockets(run.level);
      for (var k = t.socket; k < t.socket + (t.n || 1); k++) if (!lock[k]) return 'locked socket';
    }
    return 'locked or occupied';
  }
  function returnHome(el, o) {
    if (!o) return;
    el.classList.add('returning');
    el.style.left = o.rect.x + 'px'; el.style.top = o.rect.y + 'px';
    setTimeout(function () {
      el.classList.remove('returning');
      if (el.parentNode === V().refs.dragLayer) {
        el.classList.add('nomove');
        o.parent.appendChild(el); el.style.left = o.left; el.style.top = o.top;
        void el.offsetWidth; el.classList.remove('nomove');
      }
      U.sfx('card.land.player', { vol: 0.6 });
    }, 170);
  }

  function click(el, touch) {
    var sc = U.SCREENS[U.state.screen];
    if (sc && sc.onCardClick && sc.onCardClick(el, touch) === true) return;
    if (touch) U.cards.tapTip(el);
  }
})(window);
