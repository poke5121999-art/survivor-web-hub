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
  // Quả cầu mở màn: rê chuột (hoặc chạm lần 1) hiện bảng "Bắt đầu với" + tooltip thẻ thật nếu lựa chọn là một thẻ; lựa chọn kỹ năng
  // theo bước "(Start Skill)" của hero hiện mô tả của bước (INTERACT-15). Cảm ứng: chạm lần 2 mới chọn (INTERACT-11).
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
        : c.card ? (c.key === 'item' ? 'Một vật phẩm nhỏ yểm bùa:<br>' : 'Một kỹ năng:<br>') + cardLine(c.card)
        : c.desc ? root.BZTooltip.format(c.desc).html : (c.key === 'skill' ? 'Một kỹ năng khởi đầu của ' + U.esc(run.hero) : '');
      function show(touch) {
        var r = U.rectOf(o);
        U.panelTip(r, 'Bắt đầu với', body + (touch ? '<br><span class="o">Chạm lần nữa để chọn</span>' : ''));
        // lựa chọn là một thẻ: tooltip đầy đủ của thẻ (chỉ số, chữ) ở phía bên kia quả cầu
        if (c.card) { var info = U.tipInfo(c.card, U.looseAttrs(c.card), null); if (info) root.BZTooltip.show(info, { x: r.x, y: r.y - 10, w: r.w, h: r.h }); }
      }
      function hide() { U.panelTip(null); root.BZTooltip.hide(); }
      var lastPt = 'mouse';
      o.addEventListener('pointerdown', function (e) { lastPt = e.pointerType; });
      o.addEventListener('pointerenter', function (e) { if (e.pointerType === 'touch') return; U.sfx('ui.hover', { vol: 0.5 }); show(false); });
      o.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hide(); });
      o.addEventListener('click', function () {
        if (U.state.busy) return;
        if (lastPt === 'touch' && !o.classList.contains('armed')) {
          Array.prototype.forEach.call(row.querySelectorAll('.rs-orb.armed'), function (b) { b.classList.remove('armed'); });
          o.classList.add('armed'); U.sfx('ui.hover', { vol: 0.5 }); show(true); return;
        }
        hide(); U.sfx('spell.select'); o.classList.add('chosen'); U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(o) });
      });
    });
  }
  function choiceArt(c) {
    if (c.kind === 'step') return U.art(c.id);
    if (c.kind === 'event' || c.kind === 'merchant') return U.art(c.id + '_char') || U.art(c.id + '_bg');
    if (c.kind === 'combat') return U.art(c.id + '_char') || U.art(c.id + '_bg');
    if (c.card) return U.art(c.card.id);
    if (c.kind === 'generic') return c.key === 'gold' ? U.ICON.coins : c.key === 'xp' ? U.ICON.xpBig : U.ICON.chest;
    return null;
  }

  U.SCREENS.event = {
    enter: function (run, prev) {
      var ph = run.phase;
      if (ph.eventId === 'start') { this._eid = 'start|'; U.top.base(run, {}); U.sfx('board.pickerAppear'); return; }
      U.top.base(run, { hero: true, sides: true, board: true, lane: 'event' });
      this._eid = ph.eventId + '|' + (ph.stepId || '');
      // bước dẫn tiếp (Then: chuỗi Gumball, ba điều ước của Rit): eventId null, stepId = bước vừa chọn → ảnh + bậc của bước
      var E = root.BZ_ENCOUNTERS, e = (ph.eventId && E.events[ph.eventId]) || (ph.stepId && E.steps[ph.stepId]) || {};
      var art = ph.eventId ? U.top.artOf({ type: 'event', id: ph.eventId }) : { bg: U.art(ph.stepId), char: null };
      var side = U.top.portrait(ph.name, e.StartingTier || 'Bronze', art, U.top.nameBlock(ph.eventId ? 'Sự kiện' : 'Tiếp theo', ph.name, ph.desc));
      if (ph.canExit) U.bigButton(side.r, 'brown', 'Rời đi', 'Bỏ qua sự kiện', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      else U.el('div', 'rs-side-note', side.r, 'Chọn một');
      var mon = (ph.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (prev) U.sfx('vo.monster.' + mon, { gap: 4000, vol: 0.7 });
    },
    render: function (run) {
      var ph = run.phase;
      // sự kiện → sự kiện (chuỗi Then, sự kiện con): cùng màn nên go() không gọi enter; dựng lại chân dung ở đây
      if (ph.eventId !== 'start' && this._eid != null && this._eid !== ph.eventId + '|' + (ph.stepId || '')) { U.top.clear(); this._key = null; this.enter(run, null); }
      U.cards.render(run);
      var key = ph.eventId + ':' + (ph.stepId || '') + ':' + JSON.stringify(ph.choices);
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
        // chữ dài: thu ảnh + cỡ chữ để không bị cắt (INTERACT-16; bản gốc TMP auto-size 18-39)
        var len = String(c.name || '').length + String(c.desc || '').length;
        if (len > 150) t.classList.add('xlong'); else if (len > 80) t.classList.add('long');
        t.addEventListener('pointerenter', function () { U.sfx('ui.hover', { vol: 0.5 }); });
        t.addEventListener('click', function () { if (U.state.busy) return; U.sfx('spell.select'); t.classList.add('chosen'); U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(t) }); });
      });
    },
    exit: function () { this._key = null; this._eid = null; U.top.clear(); },
    boardFull: function () {
      if (!U.top.layer().querySelector('.rs-hint')) U.top.layer().appendChild(U.el('div', 'rs-hint', null, ''));
      U.boardFullHint();
    }
  };

  // ---------- loot: chọn 1 (hoặc nhiều) thẻ miễn phí ----------
  U.SCREENS.loot = {
    enter: function (run) {
      var ph = run.phase, src = ph.source, enc = root.BZ_ENCOUNTERS;
      U.top.base(run, { hero: !!src, sides: true, board: true, lane: 'loot' });
      var name = 'Phần thưởng', tier = 'Gold', art = { bg: null, char: null };
      if (src && enc.combats[src]) { name = enc.combats[src].Title; tier = enc.combats[src].StartingTier; art = U.top.artOf({ type: 'combat', id: src }); }
      else if (src && enc.events[src]) { name = enc.events[src].Title; tier = enc.events[src].StartingTier; art = U.top.artOf({ type: 'event', id: src }); }
      else if (src && enc.steps[src]) { name = enc.steps[src].Title; tier = enc.steps[src].StartingTier; art = { bg: U.art(src) }; }
      var side = U.top.portrait(name, tier, art, U.top.nameBlock('Chiến lợi phẩm', name, ''));
      this._note = U.el('div', 'rs-side-note', side.r, '');
      U.bigButton(side.r, 'brown', 'Bỏ qua', 'Không lấy gì, đi tiếp', function () { U.skipReward(); }).classList.add('leave');
      U.top.layer().appendChild(U.el('div', 'rs-hint', null, U.rewardHint()));
      U.sfx('card.revealLiftStandard');
    },
    boardFull: function () { U.boardFullHint(); },
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

  // gợi ý ở dải phần thưởng (loot, rương): chuột "bấm hoặc kéo", cảm ứng "chạm xem, chạm lần nữa để lấy" (MOBILE-4)
  U.rewardHint = function () {
    var c = false; try { c = root.matchMedia('(pointer: coarse)').matches; } catch (e) { c = false; }
    return c ? 'Chạm một thẻ để xem, chạm lần nữa (hoặc kéo xuống bàn) để lấy · miễn phí' : 'Bấm hoặc kéo một thẻ xuống bàn để lấy (miễn phí)';
  };
  // phần thưởng bị từ chối vì hết chỗ (core.js U.reject → screen.boardFull): gợi ý bán ngay trên dải (FLOW-9)
  U.boardFullHint = function () {
    var h = U.top.layer().querySelector('.rs-hint');
    if (h) { h.textContent = 'Hết chỗ — kéo một món của bạn lên dải này để bán, rồi lấy phần thưởng'; h.classList.add('warn'); }
  };
  // "Bỏ qua" khi còn phần thưởng chưa lấy = mất phần thưởng: hỏi lại (FLOW-9, INTERACT-13)
  U.skipReward = function () {
    var ph = U.state.run && U.state.run.phase, left = ph ? (ph.take || 1) - (ph.taken || 0) : 0;
    if (!ph || left <= 0) { U.dispatch({ t: 'leave' }); return; }
    U.confirm({ title: 'Bỏ phần thưởng?', body: 'Còn ' + left + ' phần thưởng chưa lấy. Bỏ qua thì mất luôn.' + (U.state.sellOpen ? '<br>Có thể bán một món để lấy chỗ.' : ''), yes: 'Bỏ qua', no: 'Ở lại', danger: true },
      function () { U.dispatch({ t: 'leave' }); });
  };

  // ---------- bệ: kéo vật phẩm của mình lên bệ (lệnh commit, CommitToPedestalCommand) hoặc bấm vật phẩm đang sáng ----------
  U.SCREENS.pedestal = {
    enter: function (run) {
      var ph = run.phase, e = root.BZ_ENCOUNTERS.pedestals[ph.pedestalId] || {};
      U.top.base(run, { hero: true, sides: true, board: true, lane: 'pedestal' });
      var side = U.top.portrait(ph.name, e.StartingTier || 'Gold', U.top.artOf({ type: 'pedestal', id: ph.pedestalId }), U.top.nameBlock('Bệ thờ', ph.name, ph.desc));
      U.bigButton(side.r, 'brown', 'Rời đi', 'Không dùng bệ', function () { U.dispatch({ t: 'leave' }); }).classList.add('leave');
      var msg = ph.eligible.length ? (ph.behavior.type === 'upgrade' ? 'Kéo một vật phẩm đang sáng lên bệ (hoặc bấm vào nó) để nâng bậc' : 'Kéo một vật phẩm đang sáng lên bệ (hoặc bấm vào nó) để yểm bùa' + (ph.behavior.ench ? ' ' + ph.behavior.ench : ''))
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
      if (ph.eligible.indexOf(el._rs.uid) < 0) { U.reject('not eligible for this pedestal'); return true; }
      U.sfx('pedestal.item_enchant_start');
      U.dispatch({ t: 'commit', uid: el._rs.uid });
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
          // tối nền sân (sau các lớp của run: khung lựa chọn, thẻ, HUD vẫn sáng)
          this._dim = U.el('div', 'rs-fates-dim'); this._dim.style.zIndex = 'auto';
          V().refs.world.insertBefore(this._dim, V().refs.runSockets);
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
        U.top.frames(ch, function (i) { U.dispatch({ t: 'choose', i: i }); }, { pennant: function () { return o.dramatic ? 'pedestal' : 'levelup'; }, dy: 20, kicker: o.dramatic ? 'Ân huệ' : 'Phần thưởng lên cấp' });
      },
      boardFull: function () {
        if (U.top.layer().querySelector('.rs-hint')) U.boardFullHint();
        else { U.top.layer().appendChild(U.el('div', 'rs-hint', null, '')); U.boardFullHint(); }
      },
      exit: function () { this._key = null; if (this._dim) { this._dim.remove(); this._dim = null; } U.top.clear(); }
    };
  }
  U.SCREENS.levelUp = choiceScreen({ title: function (ph) { return 'Lên cấp ' + ph.level + '!'; }, sub: function () { return 'Chọn một phần thưởng lên cấp'; } });
  U.SCREENS.fates = choiceScreen({ dramatic: true, title: function () { return 'Số phận'; }, sub: function () { return 'Uy tín cạn — chọn một ân huệ để chơi tiếp'; } });
})(window);
