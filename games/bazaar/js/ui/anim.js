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
  A.gain = function (e, ctx) {
    var el = U.cards.ownEl(e.uid);
    if (!el) { V().skillPulse(0, e.uid); U.sfx('skill.reveal_land'); return; }
    var to = U.rectOf(el), from = ctx.dropAt || ctx.fromRect || null;
    if (!from) { from = { x: to.x, y: to.y - 260, w: to.w, h: to.h }; }
    var dx = from.x - to.x, dy = from.y - to.y, s = from.w && to.w ? from.w / to.w : 1;
    el.classList.add('nomove');
    el.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
    void el.offsetWidth;
    el.classList.remove('nomove'); el.classList.add('flyin');
    el.style.transform = '';
    var big = ctx.dropAt ? 0 : 1;
    setTimeout(function () {
      el.classList.remove('flyin');
      var r = U.rectOf(el); if (r) FX().burst('land', r.x + r.w / 2, r.y + r.h / 2, { w: r.w, h: r.h });
      U.sfx(e.section === 'stash' ? 'card.land.storage' : 'card.land.player');
      if (e.why === 'loot' || e.why === 'start' || e.why === 'generic' || e.why === 'event') { el.classList.add('reveal'); setTimeout(function () { el.classList.remove('reveal'); }, 900); }
    }, big ? 520 : 380);
  };
  A.sell = { before: function (e, ctx) { var el = U.cards.ownEl(e.uid); if (el && !ctx.dropAt) ctx.sellFrom = cardCenter(el); } };
  A.buy = function (e) {
    var ph = U.state.run.phase, name = (ph && ph.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    U.sfx('vo.merchant.' + name + '.buy', { gap: 3000 });
  };
  A.upgrade = function (e) {
    var el = U.cards.ownEl(e.uid); if (!el) return;
    setTimeout(function () {
      var e2 = U.cards.ownEl(e.uid) || el;
      root.BZCard.flash(e2, U.now(), '#b3e4e5'); root.BZCard.buffText(e2, 'Lên ' + (U.TIER_VI[e.to] || e.to) + '!', '#b3e4e5');
      var r = U.rectOf(e2); if (r) FX().burst('buff', r.x + r.w / 2, r.y + r.h / 2);
      U.sfx('card.upgrade.' + String(e.to).toLowerCase()); U.heroVo('upgrade');
    }, 120);
  };
  A.enchant = function (e) {
    var el = U.cards.ownEl(e.uid); if (!el) return;
    setTimeout(function () {
      var e2 = U.cards.ownEl(e.uid) || el, col = root.BZCard.ENCH_COL[e.ench] || '#be47ff';
      root.BZCard.flash(e2, U.now(), col); root.BZCard.buffText(e2, e.ench || 'Yểm bùa', col);
      e2.classList.add('enchanting'); setTimeout(function () { e2.classList.remove('enchanting'); }, 1400);
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
  A.day = function (e) { V().banner('Ngày ' + e.day, 'Thu nhập về túi, chợ mở hàng mới', 'day', 1600); U.sfx('trans.newDay'); };
  A.levelUp = function (e) {
    V().banner('Lên cấp ' + e.level + '!', '+' + e.health + ' máu tối đa', 'level', 1700);
    U.sfx('board.levelUp'); U.heroVo('levelup'); U.hud.pulse('level');
    var hr = V().heroRect(0); FX().burst('victory', hr.cx, hr.cy);
    setTimeout(function () { var socks = document.querySelectorAll('.rs-sockets .rs-sock:not(.locked)'); Array.prototype.forEach.call(socks, function (s) { s.classList.remove('unlock'); void s.offsetWidth; s.classList.add('unlock'); }); }, 300);
  };
  A.reroll = function () { U.sfx('board.reroll'); };
  A.win = function (e) {
    setTimeout(function () {
      var r = U.hud.arcRect(e.wins - 1); if (r) { FX().burst('victory', r.cx, r.cy, { big: 0.6 }); }
      U.hud.pulse('arc'); U.sfx('board.trophyGain');
    }, 300);
  };
  A.pick = function () { U.sfx('board.encounterClick'); };
})(window);
