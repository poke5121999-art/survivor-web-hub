/* Chợ Phiên — ANIM[event.type]: diễn sự kiện của BZRun.apply (chỉ trang trí, không đổi trạng thái).
   Vàng: đạn xu bay giữa người chơi và thương nhân (CoinVFXController: mua player→merchant, bán ngược lại, 600 ms tuyến tính,
   VISUAL §11) rồi số vàng chạy dần. Thẻ mới: bay từ chỗ thả / chỗ hàng vào ô rồi nảy (Card_Purchase_ToBoard_A 0,53 s),
   tia CardBumps khi chạm bàn. Nâng bậc / yểm bùa: chớp khung + tiếng card.upgrade.* / card.enchant.*.
   Lên cấp: băng-rôn + ô vừa mở sáng lên. Thắng PvP: ô cung chiến thắng sáng; thua: thanh uy tín tụt. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, FX = function () { return root.BZFX; };
  var A = U.ANIM = U.ANIM || {};

  function center(r) { return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 960, y: 540 }; }
  U.float = function (x, y, html, cls) {
    var f = U.el('div', 'rs-float ' + (cls || ''), V().refs.overlay, html);
    f.style.left = x + 'px'; f.style.top = y + 'px';
    setTimeout(function () { f.remove(); }, 1300);
    return f;
  };
  // n đồng xu bay from → to (toạ độ sân khấu)
  U.coins = function (from, to, n, delay) {
    var now = U.now() + (delay || 0), fx = FX();
    n = Math.max(1, Math.min(6, n || 1));
    for (var i = 0; i < n; i++) {
      (function (k) {
        var t0 = now + k * 70;
        fx.projectile({ from: { x: from.x + (Math.random() - 0.5) * 30, y: from.y + (Math.random() - 0.5) * 30 }, to: to, kind: 'shield', t0: t0, travel: 600, count: false });
        fx.at(t0 + 600, function () { fx.burst('shield', to.x, to.y, { big: 0.4 }); if (k === 0) U.sfx('board.material.coin', { vol: 0.7 }); });
      })(i);
    }
    return 600 + n * 70;
  };
  function cardCenter(el) { return center(U.rectOf(el)); }

  // ---------- khoảnh khắc lớn (lên cấp, nâng bậc, yểm bùa): dài như clip gốc, bấm bất kỳ đâu để bỏ qua (FX-11) ----------
  var moments = [];
  function finishMoment(m) {
    if (m.done) return; m.done = true; clearTimeout(m.t);
    var i = moments.indexOf(m); if (i >= 0) moments.splice(i, 1);
    try { if (m.end) m.end(); } catch (e) { console.error(e); }
  }
  // moment(ms, end): chạy end() sau ms, hoặc ngay khi người chơi bấm; trả về điều khiển {done, finish}
  U.moment = function (ms, end) {
    var m = { done: false, end: end, finish: function () { finishMoment(m); } };
    m.t = setTimeout(m.finish, ms); moments.push(m); return m;
  };
  U.skipMoments = function () { moments.slice().forEach(finishMoment); };
  U.momentsActive = function () { return moments.length; };
  document.addEventListener('pointerdown', function () { if (moments.length) U.skipMoments(); }, true);
  // độ dài theo bậc, clip FusionToField_Fused_{Bronze..Legendary} (VISUAL §11): 2,267 / 2,633 / 3,167 / 3,4 / 3,9 s
  var UPG_MS = { Bronze: 2267, Silver: 2633, Gold: 3167, Diamond: 3400, Legendary: 3900 };
  U.UPG_MS = UPG_MS; U.ENCH_MS = 3500; // FX_Enchant_Main_A 3,5 s
  U.LEVELUP_MS = 4200;                 // FX_LevelUp_Animation dài 8,18 s; phần cần chờ ≈ nửa đầu, nửa sau trùng lúc chọn thưởng [ĐỀ XUẤT]

  // ---------- vàng / XP / thu nhập ----------
  A.gold = function (e, ctx) {
    var g = U.hud.goldRect(), gc = { x: g.cx, y: g.cy }, n = Math.ceil(Math.abs(e.delta) / 3);
    if (e.why === 'sell') {
      var from = ctx.dropAt ? center(ctx.dropAt) : ctx.sellFrom || { x: 960, y: 300 };
      U.coins(from, gc, n); U.sfx('ui.sell');
    } else if (e.why === 'buy') {
      var mp = V().heroRect(1);
      U.coins(gc, { x: mp.cx, y: mp.cy }, n);
      U.sfx('ui.purchase', { vol: 0.8 });
    } else if (e.why === 'reroll') {
      var rr = U.rectOf(document.querySelector('.rs-reroll')); if (rr) U.coins(gc, center(rr), 1);
    } else if (e.delta > 0) {
      var src = e.why === 'income' ? { x: gc.x, y: gc.y - 160 } : e.why === 'combat' ? { x: 960, y: 200 } : { x: 960, y: 420 };
      U.coins(src, gc, n); U.sfx('board.attrGold');
    }
    U.float(gc.x, gc.y - 60, (e.delta > 0 ? '+' : '') + e.delta, 'gold' + (e.delta < 0 ? ' neg' : ''));
  };
  A.income = function (e) { var g = U.hud.goldRect(); U.float(g.cx - 70, g.cy - 50, '+' + e.delta + ' thu nhập', 'gold small'); U.sfx('board.attrGold'); };
  A.xp = function (e) {
    var r = U.hud.xpRect(); U.float(r.cx, r.cy - 40, '+' + e.delta + ' XP', 'xp');
    if (e.why !== 'hour') U.sfx('board.attrExp', { vol: 0.7 });
    U.hud.pulse('xp');
  };
  A.healthMax = function (e) { var h = V().hpRect(0); U.float(h.x + h.w / 2, h.y - 20, (e.delta > 0 ? '+' : '') + e.delta + ' máu tối đa', 'hp'); U.sfx('board.attrMaxHp'); };
  A.prestige = function (e) {
    var r = U.hud.crownRect(); U.float(r.cx, r.cy - 30, e.delta + ' uy tín', 'neg');
    U.hud.pulse('crown'); if (e.delta < 0) U.sfx('board.losePrestige');
  };

  // ---------- thẻ ----------
  // Card_Purchase_ToBoard_A 0,533 s: bay từ chỗ mua, nhấc cao, lật đúng một vòng 360°, nảy hai nhịp rồi nằm yên (FX-10)
  var BUY_MS = 533, STASH_MS = 600;
  function buyFly(el, dx, dy, k) {
    var P = 'perspective(900px) ', lift = Math.max(80, Math.min(240, Math.abs(dy) * 0.3 + 100));
    function T(x, y, sc, ry) { return P + 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ') rotateY(' + ry + 'deg)'; }
    el.classList.add('buyfly');
    var an = el.animate([
      { transform: T(dx, dy, k, 0), offset: 0 },
      { transform: T(dx * 0.5, dy * 0.5 - lift, 1.1, 150), offset: 0.38 },
      { transform: T(dx * 0.1, dy * 0.1 - lift * 0.35, 1.08, 300), offset: 0.62 },
      { transform: T(0, -16, 1.03, 360), offset: 0.76 },
      { transform: T(0, 0, 1, 360), offset: 0.87 },
      { transform: T(0, -5, 1, 360), offset: 0.94 },
      { transform: 'none', offset: 1 }
    ], { duration: BUY_MS, easing: 'ease-out' });
    an.onfinish = an.oncancel = function () { el.classList.remove('buyfly'); };
    return an;
  }
  // Card_Purchase_ToStash_A 0,6 s: thẻ co lại chui vào rương (kho đóng thì dùng bản sao bay tới rương)
  function toChest(el, from) {
    var ch = U.hud.chestRect(), cl = el.cloneNode(true), ov = V().refs.overlay;
    cl.classList.remove('nomove', 'flyin', 'fresh'); cl.style.cssText = el.style.cssText; cl.style.position = 'absolute'; cl.style.visibility = 'visible';
    cl.style.left = from.x + 'px'; cl.style.top = from.y + 'px'; cl.style.pointerEvents = 'none'; cl.style.zIndex = 85;
    ov.appendChild(cl);
    var w = from.w || el.offsetWidth, h = from.h || el.offsetHeight;
    var dx = ch.cx - (from.x + w / 2), dy = ch.cy - (from.y + h / 2);
    var an = cl.animate([
      { transform: 'none', opacity: 1, offset: 0 },
      { transform: 'translate(' + (dx * 0.15).toFixed(1) + 'px,' + (dy * 0.15 - 40).toFixed(1) + 'px) scale(1.06)', opacity: 1, offset: 0.25 },
      { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.12)', opacity: 0.2, offset: 1 }
    ], { duration: STASH_MS, easing: 'cubic-bezier(.5,0,.8,.5)' });
    an.onfinish = an.oncancel = function () { cl.remove(); var ce = U.hud.chestEl && U.hud.chestEl(); if (ce) { ce.classList.remove('pulse'); void ce.offsetWidth; ce.classList.add('pulse'); } };
  }
  A.gain = function (e, ctx) {
    var el = U.cards.ownEl(e.uid);
    if (!el) { V().skillPulse(0, e.uid); U.sfx('skill.reveal_land'); return; }
    var to = U.rectOf(el), from = ctx.dropAt || ctx.fromRect || null;
    if (!from) { from = { x: to.x, y: to.y - 260, w: to.w, h: to.h }; }
    var dx = from.x - to.x, dy = from.y - to.y, s = from.w && to.w ? from.w / to.w : 1;
    var inStash = e.section === 'stash' && !U.cards.trayIsOpen();
    if (inStash) toChest(el, from); else buyFly(el, dx, dy, s);
    var ms = inStash ? STASH_MS : BUY_MS;
    setTimeout(function () {
      var r = U.rectOf(el); if (r && !inStash) FX().burst('land', r.x + r.w / 2, r.y + r.h / 2, { w: r.w, h: r.h });
      U.sfx(e.section === 'stash' ? 'card.land.storage' : 'card.land.player');
      if (e.why === 'loot' || e.why === 'start' || e.why === 'generic' || e.why === 'event') { el.classList.add('reveal'); setTimeout(function () { el.classList.remove('reveal'); }, 900); }
    }, ms - 20);
  };
  A.sell = { before: function (e, ctx) { var el = U.cards.ownEl(e.uid); if (el && !ctx.dropAt) ctx.sellFrom = cardCenter(el); } };
  A.buy = function (e) {
    var ph = U.state.run.phase, name = (ph && ph.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    U.sfx('vo.merchant.' + name + '.buy', { gap: 3000 });
  };
  // khoảnh khắc: thẻ nhấc lên, quay, toả sáng rồi hạ xuống theo độ dài clip của bậc; bấm để bỏ qua (FX-11)
  function cardMoment(el, cls, ms) {
    el.style.setProperty('--mom', ms + 'ms'); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    U.moment(ms, function () { el.classList.remove(cls); });
  }
  A.upgrade = function (e) {
    var el = U.cards.ownEl(e.uid); if (!el) return;
    setTimeout(function () {
      var e2 = U.cards.ownEl(e.uid) || el, ms = UPG_MS[e.to] || UPG_MS.Silver;
      root.BZCard.flash(e2, U.now(), '#b3e4e5'); root.BZCard.buffText(e2, 'Lên ' + (U.TIER_VI[e.to] || e.to) + '!', '#b3e4e5');
      var r = U.rectOf(e2); if (r) FX().burst('buff', r.x + r.w / 2, r.y + r.h / 2);
      cardMoment(e2, 'upgrading', ms);
      setTimeout(function () { var r2 = U.rectOf(e2); if (r2 && e2.classList.contains('upgrading')) FX().burst('victory', r2.x + r2.w / 2, r2.y + r2.h / 2, { big: 0.5 }); }, ms * 0.4);
      U.sfx('card.upgrade.' + String(e.to).toLowerCase()); U.heroVo('upgrade');
    }, 120);
  };
  A.enchant = function (e) {
    var el = U.cards.ownEl(e.uid); if (!el) return;
    setTimeout(function () {
      var e2 = U.cards.ownEl(e.uid) || el, col = root.BZCard.ENCH_COL[e.ench] || '#be47ff';
      root.BZCard.flash(e2, U.now(), col); root.BZCard.buffText(e2, e.ench || 'Yểm bùa', col);
      cardMoment(e2, 'enchanting', U.ENCH_MS);
      var r = U.rectOf(e2); if (r) FX().burst('charge', r.x + r.w / 2, r.y + r.h / 2);
      U.sfx('card.enchant.' + String(e.ench || 'tiny').toLowerCase());
    }, 120);
  };
  A.cardAttr = function (e) {
    var el = U.cards.ownEl(e.uid); if (!el) return;
    root.BZCard.buffText(el, (e.delta > 0 ? '+' : '') + (/Cooldown/.test(e.attr) ? U.fmtSec(e.delta) + 's' : e.delta) + ' ' + attrVi(e.attr), e.delta > 0 ? '#b6ff7a' : '#ff8a7a');
    U.sfx('card.statBuff', { gap: 120 });
  };
  function attrVi(a) {
    return { DamageAmount: 'sát thương', ShieldApplyAmount: 'khiên', HealAmount: 'hồi máu', BurnApplyAmount: 'bỏng', PoisonApplyAmount: 'độc', SellPrice: 'giá trị',
      CooldownMax: 'hồi chiêu', CritChance: '% chí mạng', Multicast: 'lần dùng', AmmoMax: 'đạn', RegenApplyAmount: 'hồi phục' }[a] || a;
  }

  // ---------- giờ, ngày, cấp ----------
  A.hour = function () { U.hud.pulse('clock'); };
  // thẻ ngày lăn N-1 → N màu vàng ~3 s rồi ba khung bật ra (clip https://youtu.be/wUzq6Q4u9Jc?t=1322, ?t=63)
  A.day = function (e) { U.transitions.dayCard(U.state.run, e.day); U.sfx('trans.newDay'); };
  A.levelUp = function (e) {
    // chặng 1 (0 s): băng-rôn rơi + tia; chặng 2 (0,9 s): tia lớn lần hai; chặng 3 (2 s): ô vừa mở sáng; hạ băng-rôn ở LEVELUP_MS hoặc khi bấm (FX-11)
    V().banner('Lên cấp ' + e.level + '!', '+' + e.health + ' máu tối đa', 'level', 0);
    U.sfx('board.levelUp'); U.heroVo('levelup'); U.hud.pulse('level');
    var hr = V().heroRect(0); FX().burst('victory', hr.cx, hr.cy);
    var m = U.moment(U.LEVELUP_MS, function () { V().hideBanner(); });
    setTimeout(function () { if (!m.done) FX().burst('victory', hr.cx, hr.cy, { big: 1.4 }); }, 900);
    setTimeout(function () { if (m.done) return; var socks = document.querySelectorAll('.rs-sockets .rs-sock:not(.locked)'); Array.prototype.forEach.call(socks, function (s) { s.classList.remove('unlock'); void s.offsetWidth; s.classList.add('unlock'); }); }, 2000);
  };
  A.reroll = function () { U.sfx('board.reroll'); };
  // thẻ sinh ra ("Get 5 Gumballs", Candy Stash...) mà bàn + kho đã đầy: reducer bỏ thẻ và phát {type:'lost', why:'noSpace'} (js/run/ooc.js).
  // Trước đây giao diện im lặng (P1-4 / P2-3 / P3-7) — giờ gộp các thẻ mất của một lệnh thành một lời báo rõ, kèm tiếng hết chỗ.
  A.lost = function (e, ctx) {
    var L = ctx.lost = ctx.lost || { n: 0, ids: {} };
    L.n++; L.ids[e.id] = 1;
    if (L.n > 1) return;
    setTimeout(function () {
      var ids = Object.keys(L.ids), R = root.BZRun, nm = '';
      if (ids.length === 1 && R) { var t = R.tpl(ids[0]); nm = t ? R.title(t) : ''; }
      U.sfx('ui.noSpace'); U.heroVo('nobuyspace');
      U.toast('Hết chỗ (tay + kho đầy): mất ' + L.n + (nm ? ' × ' + nm : ' món') + '. Bán bớt trước khi nhận.', 3600);
    }, 0);
  };
  A.win = function (e) {
    setTimeout(function () {
      var r = U.hud.arcRect(e.wins - 1); if (r) { FX().burst('victory', r.cx, r.cy, { big: 0.6 }); }
      U.hud.pulse('arc'); U.sfx('board.trophyGain');
    }, 300);
  };
  A.pick = function () { U.sfx('board.encounterClick'); };

  // ---------- pha 4: xếp chỗ, quest, hàng đổi giá, rương, bàn tốt nhất ----------
  // move: thẻ tự trượt về ô mới (cards.render, 160 ms nảy); thẻ BỊ ĐẨY thêm tia CardBumps khi chạm ô + tiếng card.socket
  A.move = function (e, ctx) {
    if (!e.pushed) return;
    setTimeout(function () {
      var el = U.cards.ownEl(e.uid); if (!el) return;
      var r = U.rectOf(el); if (r) FX().burst('land', r.x + r.w / 2, r.y + r.h / 2, { w: r.w, h: r.h });
      U.sfx(e.to.section === 'stash' ? 'card.land.storage' : 'card.socket', { vol: 0.6, gap: 60 });
    }, 170);
  };
  A.swap = function (e) {
    U.sfx('card.slide', { vol: 0.5 });
    [e.a, e.b].forEach(function (uid, i) {
      setTimeout(function () { var el = U.cards.ownEl(uid); if (el) { root.BZCard.flash(el, U.now(), '#9be8ff'); el.classList.remove('swapped'); void el.offsetWidth; el.classList.add('swapped'); } }, 150 + i * 60);
    });
  };
  // quest: chip tiến độ trên thẻ nảy + số "+n"; xong: loé vàng, chữ "Hoàn thành!", tia thưởng (combat.questcomplete_shot)
  A.quest = function (e) {
    var el = U.cards.ownEl(e.uid); if (!el) return;
    U.cards.questChip(el, U.state.run, true);
    var r = U.rectOf(el); if (r) U.float(r.x + r.w / 2, r.y + 18, e.progress + '/' + e.goal, 'quest');
  };
  A.questDone = function (e) {
    setTimeout(function () {
      var el = U.cards.ownEl(e.uid); if (!el) return;
      root.BZCard.flash(el, U.now(), '#ffd36b'); root.BZCard.buffText(el, 'Hoàn thành nhiệm vụ!', '#ffd36b');
      el.classList.remove('questdone'); void el.offsetWidth; el.classList.add('questdone');
      var r = U.rectOf(el); if (r) { FX().burst('victory', r.x + r.w / 2, r.y + r.h / 2, { big: 0.7 }); FX().burst('buff', r.x + r.w / 2, r.y + r.h / 2); }
      U.sfx('combat.questcomplete_shot'); U.sfx('board.trophyGain', { vol: 0.5 });
      var ci = U.state.run && root.BZRun.findCard(U.state.run, e.uid);
      if (e.reward) U.toast('Nhiệm vụ xong: ' + root.BZTooltip.format(ci ? U.cards.questReward(ci, e.key, e.reward) : e.reward).html.replace(/<[^>]+>/g, ''));
    }, 260);
  };
  // stock: hàng đang bày đổi giá / lên bậc / được yểm (Lucky Clover, Coupon, Galactic Translator, Dreampearl...)
  A.stock = function (e, ctx) {
    var entering = !ctx.prev || ctx.prev.phase.kind !== 'merchant' || (ctx.cmd && ctx.cmd.t === 'reroll');
    setTimeout(function () {
      var el = U.cards.stockEl(e.i); if (!el) return;
      var r = U.rectOf(el), cx = r ? r.x + r.w / 2 : 960, cy = r ? r.y + r.h / 2 : 420;
      if (e.why === 'price') {
        var pt = el.querySelector('.rs-price'); if (pt) { pt.classList.remove('bump'); void pt.offsetWidth; pt.classList.add('bump'); }
        U.sfx('board.priceTagChange'); FX().burst('shield', cx, r ? r.y + r.h - 20 : cy, { big: 0.4 });
      } else if (e.why === 'upgrade') {
        root.BZCard.flash(el, U.now(), '#b3e4e5'); root.BZCard.buffText(el, 'Lên ' + (U.TIER_VI[e.card.tier] || e.card.tier) + '!', '#b3e4e5');
        FX().burst('buff', cx, cy); U.sfx('card.upgrade.' + String(e.card.tier).toLowerCase());
      } else if (e.why === 'enchant') {
        var col = root.BZCard.ENCH_COL[e.card.ench] || '#be47ff';
        root.BZCard.flash(el, U.now(), col); root.BZCard.buffText(el, e.card.ench, col);
        cardMoment(el, 'enchanting', U.ENCH_MS);
        FX().burst('charge', cx, cy); U.sfx('card.enchant.' + String(e.card.ench || 'tiny').toLowerCase());
      }
    }, entering ? 1500 + e.i * 120 : 120);
  };
  A.best = function () { /* màn hết run đọc run.best; không diễn gì giữa run */ };
  A.chest = function () { /* màn rương (screens/chest.js) tự diễn rơi → rung → mở */ };
  A.fates = function () { U.sfx('fates.appear_build'); setTimeout(function () { U.sfx('fates.appear_impact'); }, 700); };
})(window);
