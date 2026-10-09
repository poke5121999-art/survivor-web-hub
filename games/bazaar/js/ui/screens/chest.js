/* Chợ Phiên — rương mốc thắng (phase 'chest': {tier, wins, name, picks:[{card}], take, taken, gold, after}; luật ở js/run/enc-combat.js:
   4 thắng Đồng, 7 Bạc, 10 Vàng). Diễn theo các clip của ChestController (VISUAL §13):
     Chest_Base_Falling_A 0,333 s → rung máy quay theo bậc (ChestCameraShake Light 0,40 / Medium 0,567 / Heavy 0,733 s)
     → Chest_Base_Opening_A 3,4 s: nắp bật ở 2,317 s, nảy lại ở 2,68 / 2,95 / 3,25 s, đế rung tới 25° ở 2,4 s
     → ChestPrize_Reveal_A 0,667 s mỗi phần thưởng (scale 0 → 1,038 ở 250 ms → 1 ở 483 ms), nối nhau 120 ms [ĐỀ XUẤT khoảng cách].
   Bản demo chỉ có ảnh rương Chest_Purchase_Artwork_1 (một ảnh, không có nắp rời) nên "nắp bật" = rương nảy lên + loé + tia sáng
   [ĐỀ XUẤT]. Bậc tô màu bằng màu khung tooltip đo từ sprite (VISUAL §15). Bấm / Space / Enter để bỏ qua màn mở.
   Lấy thẻ: bấm hoặc kéo xuống bàn như loot (lệnh choose {i, section?, socket?}); "Bỏ qua" = leave. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; };
  var CH = U.CHEST = { fall: 333, burst: 2317, open: 3400, rebounds: [2680, 2950, 3250], prize: 667, stagger: 120,
    shake: { Bronze: 400, Silver: 567, Gold: 733, Diamond: 733, Legendary: 733 },
    art: 'art/ui/purchases/Chest_Purchase_Artwork_1_TUI.webp', burstArt: 'art/vfx/FX_ChestExplosion_01.webp' };
  var rev = null; // {el, ids, done}

  function later(ms, fn) { var id = setTimeout(fn, ms); rev.ids.push(id); return id; }
  function finishReveal(skip) {
    if (!rev || rev.done) return;
    rev.done = true;
    rev.ids.forEach(clearTimeout);
    rev.el.classList.add('opened', 'settled');
    if (skip) {
      rev.el.classList.add('skip');
      Array.prototype.forEach.call(document.querySelectorAll('.rs-cards .bz-card.top.prize'), function (c) { c.style.animationDelay = '0ms'; });
    }
    V().refs.stage.classList.remove('chest-hold');
  }
  function reveal(run) {
    var ph = run.phase, layer = U.top.layer(), tier = ph.tier || 'Bronze';
    var el = U.el('div', 'rs-chestrev t-' + tier, layer,
      '<div class="rays"></div><div class="glow"></div><div class="chest"><i></i></div><div class="boom"></div>' +
      '<div class="lbl"><small>' + ph.wins + ' trận thắng</small><b>Rương ' + U.esc(U.TIER_VI[tier] || tier) + '</b></div>' +
      (ph.gold ? '<div class="gold"><i style="background-image:' + U.bg(U.ICON.coin) + '"></i>+' + ph.gold + '</div>' : '') +
      '<small class="skip">Bấm để mở nhanh</small>');
    el.querySelector('.chest i').style.backgroundImage = U.bg(CH.art);
    el.querySelector('.boom').style.backgroundImage = U.bg(CH.burstArt);
    el.style.setProperty('--fall', CH.fall + 'ms'); el.style.setProperty('--burst', CH.burst + 'ms'); el.style.setProperty('--open', CH.open + 'ms');
    el.style.setProperty('--shake', CH.shake[tier] + 'ms');
    rev = { el: el, ids: [], done: false };
    V().refs.stage.classList.add('chest-hold');
    el.addEventListener('pointerdown', function (e) { if (!rev || rev.done) return; e.stopPropagation(); finishReveal(true); });
    U.sfx('card.spinChest', { vol: 0.9 });
    later(CH.fall, function () {
      U.sfx('card.drop'); U.sfx('board.material.wood', { vol: 0.7 });
      var w = V().refs.world; w.style.setProperty('--shake', CH.shake[tier] + 'ms');
      w.classList.remove('rs-shake'); void w.offsetWidth; w.classList.add('rs-shake');
      later(CH.shake[tier], function () { w.classList.remove('rs-shake'); });
      U.sfx('card.fuseSpinUp', { vol: 0.6 });
    });
    later(CH.burst, function () {
      el.classList.add('opened');
      U.sfx('card.revealFlip' + (tier === 'Bronze' ? 'Bronze' : tier === 'Silver' ? 'Silver' : 'Gold'));
      U.sfx('card.fuse.' + tier.toLowerCase(), { vol: 0.8 });
      var r = U.rectOf(el.querySelector('.chest'));
      if (r && root.BZFX) { root.BZFX.burst('victory', r.x + r.w / 2, r.y + r.h * 0.4, { big: tier === 'Gold' ? 1.2 : tier === 'Silver' ? 0.9 : 0.7 }); root.BZFX.burst('buff', r.x + r.w / 2, r.y + r.h * 0.4, { big: 1 }); }
      if (ph.gold) U.sfx('board.attrGold', { vol: 0.7 });
    });
    CH.rebounds.forEach(function (t) { later(t, function () { U.sfx('board.material.wood', { vol: 0.35, gap: 60 }); }); });
    (ph.picks || []).forEach(function (p, i) { later(CH.burst + i * CH.stagger, function () { U.sfx('card.revealLiftStandard', { vol: 0.6, gap: 50 }); }); });
    later(CH.open, function () { finishReveal(false); });
  }

  U.SCREENS.chest = {
    enter: function (run) {
      var ph = run.phase, tier = ph.tier || 'Bronze';
      U.top.base(run, { hero: true, sides: true, board: true, lane: 'loot' });
      var nm = 'Rương ' + (U.TIER_VI[tier] || tier);
      var side = U.top.portrait(nm, tier, { bg: CH.art, char: null }, U.top.nameBlock('Mốc ' + ph.wins + ' trận thắng', nm, ph.name || ''));
      this._note = U.el('div', 'rs-side-note', side.r, '');
      U.bigButton(side.r, 'brown', 'Bỏ qua', 'Không lấy gì, đi tiếp', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      U.top.layer().appendChild(U.el('div', 'rs-hint', null, 'Bấm hoặc kéo một thẻ xuống bàn để lấy (miễn phí)'));
      this._first = true;
      reveal(run);
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      var els = U.cards.setTop(ph.picks.map(function (p, i) { return { key: 'chest:' + ph.wins + ':' + p.card.id + ':' + p.card.tier, card: p.card, kind: 'loot', i: i }; }));
      if (this._first) {
        this._first = false;
        els.forEach(function (el, i) { el.classList.remove('deal'); el.classList.add('prize'); el.style.animationDelay = (CH.burst + i * CH.stagger) + 'ms'; });
      }
      if (this._note) this._note.innerHTML = 'Lấy <b>' + (ph.take - ph.taken) + '</b> trong ' + ph.picks.length;
    },
    exit: function () { if (rev) { rev.ids.forEach(clearTimeout); rev = null; } V().refs.stage.classList.remove('chest-hold'); V().refs.world.classList.remove('rs-shake'); this._note = null; U.top.clear(); },
    canDrag: function (el) { if (rev && !rev.done) return false; return el._rs.kind === 'own' || el._rs.kind === 'loot'; },
    onCardClick: function (el, touch) {
      if (rev && !rev.done) { finishReveal(true); return true; }
      if (el._rs.kind !== 'loot') return false;
      if (touch && U.cards.tapTip(el)) return true;
      U.cards.clearTap();
      U.dispatch({ t: 'choose', i: el._rs.i }, { fromRect: U.rectOf(el) });
      return true;
    },
    key: function (e) { if ((e.code === 'Space' || e.key === 'Enter') && rev && !rev.done) { finishReveal(true); return true; } },
    revealing: function () { return !!(rev && !rev.done); }
  };
})(window);
