/* Chợ Phiên — màn sự kiện (phase 'event'): chân dung + các lựa chọn (bước sự kiện có ảnh Reward_*, phần thưởng chung).
   Sự kiện mở màn (eventId 'start', start-income-1.png): ba quả cầu sáng xanh trên thảm, rê chuột hiện bảng "Bắt đầu với".
   Kết quả (vàng / XP / thẻ mới / yểm bùa / nâng bậc) do ANIM diễn theo sự kiện reducer. Lệnh: choose {i}, leave. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var START_ART = { income: 'art/ui/rewards/Reward_PersonalTest_GoldStart_D.webp', item: 'art/ui/rewards/Reward_PersonalTest_EnchantedStart_D.webp',
    skill: 'art/ui/rewards/Reward_PersonalTest_SkillStart_D.webp' };

  function cardLine(c) {
    var tpl = R().tpl(c.id);
    return '<b class="w">' + U.esc(R().title(tpl)) + '</b> <span class="o">(' + (U.TIER_VI[c.tier] || c.tier) + (c.ench ? ', ' + U.esc(c.ench) : '') + ')</span>';
  }
  function startScreen(run) {
    var ph = run.phase, layer = U.top.layer();
    var m = U.top.map('Bắt đầu với', 'Chọn một khởi đầu cho ' + run.hero);
    m.classList.add('carpet'); m.style.backgroundImage = 'none';
    var row = U.el('div', 'rs-orbs', layer);
    ph.choices.forEach(function (c, i) {
      var o = U.el('button', 'rs-orb', row); o.type = 'button';
      o.style.animationDelay = (i * 120) + 'ms';
      var img = U.el('div', 'img', o); img.style.backgroundImage = U.bg(START_ART[c.key] || START_ART.income);
      U.el('div', 'shine', o);
      U.el('div', 'nm', o, U.esc(c.name));
      var body = c.key === 'income' ? '+<i class="ci" style="background-image:' + U.bg(U.ICON.coin) + '"></i><b class="g">' + c.gold + '</b> Vàng<br>+<i class="ci" style="background-image:' + U.bg(U.ICON.coin) + '"></i><b class="g">' + c.income + '</b> Thu nhập'
        : c.card ? (c.key === 'item' ? 'Một vật phẩm nhỏ yểm bùa:<br>' : 'Một kỹ năng:<br>') + cardLine(c.card) : '';
      o.addEventListener('pointerenter', function () { U.sfx('ui.hover', { vol: 0.5 }); U.panelTip(U.rectOf(o), 'Bắt đầu với', body); if (c.card) { var info = U.tipInfo(c.card, U.looseAttrs(c.card), null); } });
      o.addEventListener('pointerleave', function () { U.panelTip(null); });
      o.addEventListener('click', function () { if (U.state.busy) return; U.panelTip(null); U.sfx('spell.select'); o.classList.add('chosen'); U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(o) }); });
    });
  }
  function choiceArt(c) {
    if (c.kind === 'step') return U.art(c.id);
    if (c.kind === 'generic') return c.key === 'gold' ? U.ICON.coins : c.key === 'xp' ? U.ICON.xpBig : U.ICON.chest;
    return null;
  }

  U.SCREENS.event = {
    enter: function (run, prev) {
      var ph = run.phase;
      if (ph.eventId === 'start') { U.top.base(run, {}); U.sfx('board.pickerAppear'); return; }
      U.top.base(run, { hero: true, sides: true, board: true });
      var e = root.BZ_ENCOUNTERS.events[ph.eventId] || {};
      var side = U.top.portrait(ph.name, e.StartingTier || 'Bronze', U.top.artOf({ type: 'event', id: ph.eventId }), U.top.nameBlock('Sự kiện', ph.name, ph.desc));
      if (ph.canExit) U.bigButton(side.r, 'brown', 'Rời đi', 'Bỏ qua sự kiện', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      else U.el('div', 'rs-side-note', side.r, 'Chọn một');
      var mon = (ph.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (prev) U.sfx('vo.monster.' + mon, { gap: 4000, vol: 0.7 });
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      var key = ph.eventId + ':' + JSON.stringify(ph.choices);
      if (key === this._key && U.top.layer().children.length) return;
      this._key = key;
      if (ph.eventId === 'start') { U.top.clear(); startScreen(run); return; }
      Array.prototype.forEach.call(U.top.layer().querySelectorAll('.rs-choices'), function (n) { n.remove(); });
      var row = U.el('div', 'rs-choices n' + ph.choices.length, U.top.layer());
      ph.choices.forEach(function (c, i) {
        var t = U.el('button', 'rs-choice k-' + c.kind, row); t.type = 'button';
        t.style.animationDelay = (i * 90) + 'ms';
        var a = choiceArt(c), img = U.el('div', 'img', t);
        if (a) img.style.backgroundImage = U.bg(a);
        U.el('h4', '', t, U.esc(c.name));
        U.el('p', '', t, root.BZTooltip.format(c.desc || '').html);
        t.addEventListener('pointerenter', function () { U.sfx('ui.hover', { vol: 0.5 }); });
        t.addEventListener('click', function () { if (U.state.busy) return; U.sfx('spell.select'); t.classList.add('chosen'); U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(t) }); });
      });
    },
    exit: function () { this._key = null; U.top.clear(); }
  };

  // ---------- loot: chọn 1 (hoặc nhiều) thẻ miễn phí ----------
  U.SCREENS.loot = {
    enter: function (run) {
      var ph = run.phase, src = ph.source, enc = root.BZ_ENCOUNTERS;
      U.top.base(run, { hero: !!src, sides: true, board: true });
      var name = 'Phần thưởng', tier = 'Gold', art = { bg: null, char: null };
      if (src && enc.combats[src]) { name = enc.combats[src].Title; tier = enc.combats[src].StartingTier; art = U.top.artOf({ type: 'combat', id: src }); }
      else if (src && enc.events[src]) { name = enc.events[src].Title; tier = enc.events[src].StartingTier; art = U.top.artOf({ type: 'event', id: src }); }
      else if (src && enc.steps[src]) { name = enc.steps[src].Title; tier = enc.steps[src].StartingTier; art = { bg: U.art(src) }; }
      var side = U.top.portrait(name, tier, art, U.top.nameBlock('Chiến lợi phẩm', name, ''));
      this._note = U.el('div', 'rs-side-note', side.r, '');
      U.bigButton(side.r, 'brown', 'Bỏ qua', 'Không lấy gì, đi tiếp', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      U.top.layer().appendChild(U.el('div', 'rs-hint', null, 'Bấm hoặc kéo một thẻ xuống bàn để lấy (miễn phí)'));
      U.sfx('card.revealLiftStandard');
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      U.cards.setTop(ph.picks.map(function (p, i) { return { key: 'loot:' + (ph.source || '') + ':' + p.card.id + ':' + p.card.tier, card: p.card, kind: 'loot', i: i }; }));
      if (this._note) this._note.innerHTML = 'Lấy <b>' + (ph.take - ph.taken) + '</b> trong ' + ph.picks.length;
    },
    exit: function () { this._note = null; U.top.clear(); },
    canDrag: function (el) { return el._rs.kind === 'own' || el._rs.kind === 'loot'; },
    onCardClick: function (el, touch) {
      if (el._rs.kind !== 'loot') return false;
      if (touch && U.cards.tapTip(el)) return true;
      U.cards.clearTap();
      U.dispatch({ t: 'choose', i: el._rs.i }, { fromRect: U.rectOf(el) });
      return true;
    }
  };

  // ---------- bệ: chọn vật phẩm của mình để yểm / nâng bậc ----------
  U.SCREENS.pedestal = {
    enter: function (run) {
      var ph = run.phase, e = root.BZ_ENCOUNTERS.pedestals[ph.pedestalId] || {};
      U.top.base(run, { hero: true, sides: true, board: true });
      var side = U.top.portrait(ph.name, e.StartingTier || 'Gold', U.top.artOf({ type: 'pedestal', id: ph.pedestalId }), U.top.nameBlock('Bệ thờ', ph.name, ph.desc));
      U.bigButton(side.r, 'brown', 'Rời đi', 'Không dùng bệ', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      var msg = ph.eligible.length ? (ph.behavior.type === 'upgrade' ? 'Bấm một vật phẩm đang sáng để nâng bậc' : 'Bấm một vật phẩm đang sáng để yểm bùa' + (ph.behavior.ench ? ' ' + ph.behavior.ench : ''))
        : 'Bạn không có vật phẩm nào hợp với bệ này';
      var pl = U.el('div', 'rs-pedestal', U.top.layer(), '<div class="orb"></div><p>' + U.esc(msg) + '</p>');
      U.sfx('pedestal.lightpulse');
      if (ph.eligible.length && !U.cards.trayIsOpen() && ph.eligible.every(function (u) { var c = R().findCard(run, u); return c && c.section === 'stash'; })) U.cards.toggleStash(true);
    },
    render: function (run) {
      var el = {}; run.phase.eligible.forEach(function (u) { el[u] = true; });
      U.cards.render(run, { eligible: el });
    },
    exit: function () { U.top.clear(); },
    onCardClick: function (el) {
      var ph = U.state.run.phase;
      if (el._rs.kind !== 'own') return false;
      var i = ph.eligible.indexOf(el._rs.uid);
      if (i < 0) { U.sfx('ui.noSpace'); return true; }
      U.sfx('pedestal.item_enchant_start');
      U.dispatch({ t: 'choose', i: i });
      return true;
    }
  };

  // ---------- lên cấp: ba phần thưởng dạng khung gặp gỡ ----------
  // Số phận (phase 'fates', luật do js/run thêm): choices CÙNG DẠNG với levelUp, lệnh {t:'choose', i}. Dùng lại màn lên cấp
  // với tiêu đề khác; vào màn thì tối sân khấu + thanh vương miện đầy lại về 1. Không có phase này thì màn không bao giờ chạy.
  function choiceScreen(o) {
    return {
      enter: function (run) {
        U.top.base(run, {});
        if (o.dramatic) {
          var st = V().refs.stage;
          this._dim = U.el('div', 'rs-fates-dim', st);
          U.sfx('trans.defeatIn', { vol: 0.5 });
          setTimeout(function () { if (U.hud && U.hud.refillCrown) U.hud.refillCrown(); }, 500);
        }
      },
      render: function (run) {
        var ph = run.phase, ch = ph.choices || [];
        U.cards.render(run);
        var key = ph.kind + ':' + (ph.level || 0) + ':' + JSON.stringify(ch);
        if (key === this._key && U.top.layer().children.length) return;
        this._key = key;
        U.top.clear();
        var m = U.top.map(o.title(ph), o.sub(ph));
        m.classList.add(o.dramatic ? 'fates' : 'levelup');
        U.top.frames(ch, function (i) { U.dispatch({ t: 'choose', i: i }); }, { pennant: function () { return o.dramatic ? 'pedestal' : 'levelup'; }, dy: 20 });
      },
      exit: function () { this._key = null; if (this._dim) { this._dim.remove(); this._dim = null; } U.top.clear(); }
    };
  }
  U.SCREENS.levelUp = choiceScreen({ title: function (ph) { return 'Lên cấp ' + ph.level + '!'; }, sub: function () { return 'Chọn một phần thưởng lên cấp'; } });
  U.SCREENS.fates = choiceScreen({ dramatic: true, title: function () { return 'Số phận'; }, sub: function () { return 'Uy tín cạn — chọn một ân huệ để chơi tiếp'; } });
})(window);
