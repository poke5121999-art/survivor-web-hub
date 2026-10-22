/* Chợ Phiên — màn sự kiện (phase 'event'): chân dung + các lựa chọn (bước sự kiện có ảnh Reward_*, phần thưởng chung).
   Khung trên = quầy lều / xe (top.js T.stall, xe tắt khi CanExit false), làn = thảm của thẻ sự kiện, lựa chọn = orb / thẻ / chân dung
   trên lưới ổ (U.laneChoices). Sự kiện mở màn (eventId 'start'): cùng cách bày, rê chuột hiện bảng "Bắt đầu với".
   Kết quả (vàng / XP / thẻ mới / yểm bùa / nâng bậc) do ANIM diễn theo sự kiện reducer. Lệnh: choose {i}, leave. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var R = function () { return root.BZRun; };
  var START_ART = { income: 'art/ui/rewards/Reward_PersonalTest_GoldStart_D.webp', item: 'art/ui/rewards/Reward_PersonalTest_EnchantedStart_D.webp',
    skill: 'art/ui/rewards/Reward_PersonalTest_SkillStart_D.webp' };

  function cardLine(c) {
    var tpl = R().tpl(c.id);
    return '<b class="w">' + U.esc(R().title(tpl)) + '</b> <span class="o">(' + (U.TIER_VI[c.tier] || c.tier) + (c.ench ? ', ' + U.esc(c.ench) : '') + ')</span>';
  }
  // Lựa chọn mở màn (Start With): orb trên làn như mọi sự kiện, rê chuột (hoặc chạm lần 1) hiện bảng "Bắt đầu với" + tooltip thẻ thật
  // nếu lựa chọn là một thẻ; lựa chọn kỹ năng theo bước "(Start Skill)" của hero hiện mô tả của bước (INTERACT-15). Chạm lần 2 mới chọn.
  function startScreen(run) {
    var ph = run.phase;
    var list = ph.choices.map(function (c, i) {
      var body = c.key === 'income' ? '+<i class="ci" style="background-image:' + U.bg(U.ICON.coin) + '"></i><b class="g">' + c.gold + '</b> Vàng<br>+<i class="ci" style="background-image:' + U.bg(U.ICON.coin) + '"></i><b class="g">' + c.income + '</b> Thu nhập'
        : c.card ? (c.key === 'item' ? 'Một vật phẩm nhỏ yểm bùa:<br>' : 'Một kỹ năng:<br>') + cardLine(c.card)
        : c.desc ? root.BZTooltip.format(c.desc).html : (c.key === 'skill' ? 'Một kỹ năng khởi đầu của ' + U.esc(run.hero) : '');
      return { c: c, i: i, art: START_ART[c.key] || START_ART.income, title: 'Bắt đầu với', body: body, cls: 'rs-orb', tipCard: c.card || null };
    });
    U.laneChoices(list, { onPick: function (i, el) { U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(el) }); } });
  }
  function choiceArt(c) {
    if (c.kind === 'step') return U.art(c.id);
    if (c.kind === 'event' || c.kind === 'merchant') return U.art(c.id + '_char') || U.art(c.id + '_bg');
    if (c.kind === 'combat') return U.art(c.id + '_char') || U.art(c.id + '_bg');
    if (c.kind === 'pedestal') return U.art(c.id + '_bg') || U.art(c.id + '_char'); // Fate's Crossroads: hai bệ yểm bùa (RUN-04)
    if (c.card) return U.art(c.card.id);
    if (c.kind === 'generic') return c.key === 'gold' ? U.ICON.coins : c.key === 'xp' ? U.ICON.xpBig : U.ICON.chest;
    return null;
  }

  // ---------- lựa chọn trên làn (TCardEncounterEvent → các thẻ con, UI-CONFIG §B) ----------
  // Bước sự kiện (TCardEncounterStep) = ORB (RewardController): ảnh Reward_* tròn, quầng + vòng theo bậc (FX_Reward_Idle_<bậc>:
  // Backing = FX_SimpleBacking_01_M màu hạt, Detail = vòng FX_BubbleCircle_M; tools/stall.py → art/ui/stall/orb/), không chữ trên orb,
  // tên + mô tả trong tooltip bên phải (tooltipOffset x 1,7 u). Vật phẩm / kỹ năng = thẻ / orb token; thẻ gặp gỡ = khung chân dung.
  // Mỗi lựa chọn chiếm ổ theo cỡ (bước = Medium, 2 ổ; 4 orb → tâm -4,65 / -1,55 / 1,55 / 4,65 u), xếp theo GetAvailableSocketFromCenter.
  // Hiện lần lượt trái → phải (RewardBoardAnimationController.cs:11-17); chọn: các lựa chọn khác mờ (FX_Reward_Ignored), cái được chọn bay về HUD.
  // Bản demo không có ParentReward_Silver_PV: bậc Bạc dùng màu Đồng (tools/stall.py ghi colors.json).
  var ORB_FILE = { Bronze: 'bronze', Silver: 'bronze', Gold: 'gold', Diamond: 'diamond', Legendary: 'legendary' };
  var ORB_RING = { Bronze: 'rgba(233,177,122,1)', Silver: 'rgba(233,177,122,1)', Gold: 'rgba(250,229,168,.52)', Diamond: 'rgba(255,223,114,.7)', Legendary: 'rgba(194,47,37,.7)' };
  var ORB_D = Math.round(2.4 * 109.6 / 1.55); // orb ~2,4 u: clip dr-tinyfurry 2m12 đo 120/1280 khung = 180 px sân khấu, hộp bấm ParentReward 2,9 u
  function tierOf(c) {
    var E = root.BZ_ENCOUNTERS;
    if (c.kind === 'step') return (E.steps[c.id] || {}).StartingTier || 'Bronze';
    if (c.kind === 'event' || c.kind === 'merchant') return (E.events[c.id] || {}).StartingTier || 'Bronze';
    if (c.kind === 'combat') return (E.combats[c.id] || {}).StartingTier || 'Bronze';
    if (c.kind === 'pedestal') return (E.pedestals[c.id] || {}).StartingTier || c.tier || 'Gold';
    return c.tier || 'Bronze';
  }
  function shapeOf(c) {
    if (c.kind === 'event' || c.kind === 'merchant' || c.kind === 'combat' || c.kind === 'pedestal') return 'enc';
    if (c.card && c.kind !== 'start') return 'card';
    return 'orb';
  }
  // flyHud(el): bản sao bay về chân dung hero ở HUD (~800 ms, clip DRG 2m06-2m12)
  function flyHud(el) {
    var r = U.rectOf(el), ov = root.BZView.refs.overlay; if (!r || !ov) return;
    var cl = el.cloneNode(true); cl.classList.remove('faded'); cl.classList.add('fly');
    cl.style.left = r.x + 'px'; cl.style.top = r.y + 'px'; cl.style.width = r.w + 'px'; cl.style.height = r.h + 'px';
    ov.appendChild(cl);
    var dx = 960 - (r.x + r.w / 2), dy = 905 - (r.y + r.h / 2);
    var an = cl.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(0,-24px) scale(1.12)', opacity: 1, offset: 0.2 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.28)', opacity: 0.1 }], { duration: 800, easing: 'cubic-bezier(.5,0,.75,.4)' });
    an.onfinish = an.oncancel = function () { cl.remove(); };
  }
  // laneChoices(list, o): list = [{c, i, art, title, body, cls}], o.onPick(i, el), o.fly (bay về HUD khi chọn)
  U.laneChoices = function (list, o) {
    o = o || {};
    var layer = U.top.layer(), row = U.el('div', 'rs-choices rs-lanechoices n' + list.length, layer), born = U.now();
    var sizes = list.map(function (it) { var sh = shapeOf(it.c); return sh === 'card' ? U.cards.sockOf(it.c.card.id) : 2; });
    var pos = U.cards.dealSockets(sizes), els = [];
    list.forEach(function (it, n) {
      var c = it.c, sh = shapeOf(c), tier = tierOf(c), s = Math.max(0, pos[n]), cx = 412 + (s + sizes[n] / 2) * 109.6, cy = 422.5;
      var b = U.el('button', 'rs-choice sh-' + sh + ' k-' + c.kind + ' t-' + tier + (it.cls ? ' ' + it.cls : ''), row); b.type = 'button';
      b.setAttribute('aria-label', it.title + (c.slot && U.slotLabel(c.slot) ? ' · ' + U.slotLabel(c.slot) : ''));
      var w, h;
      if (sh === 'orb') {
        w = h = ORB_D;
        var gl = U.el('i', 'glow', b); gl.style.backgroundImage = U.bg('art/ui/stall/orb/' + ORB_FILE[tier] + '_glow.webp');
        var im = U.el('div', 'img', b); if (it.art) im.style.backgroundImage = U.bg(it.art);
        U.el('i', 'shade', b);
        // vòng FX_BubbleCircle: nét trắng gốc của texture (clip: viền trắng-xanh ở mọi bậc), thêm lớp màu hạt Detail của bậc ở dưới
        var rt = U.el('i', 'ring tint', b); rt.style.backgroundColor = ORB_RING[tier];
        rt.style.webkitMaskImage = rt.style.maskImage = U.bg('art/ui/stall/orb/ring.webp');
        U.el('i', 'ring', b).style.backgroundImage = U.bg('art/ui/stall/orb/ring.webp');
      } else if (sh === 'card') {
        var tpl = R().tpl(c.card.id), tok = R().isSkill(tpl);
        var ce = root.BZCard.create({ uid: 'ch:' + n, id: c.card.id, tier: c.card.tier, size: U.cards.sockOf(c.card.id), ench: c.card.ench || null, type: U.typeOf(tpl) },
          { h: tok ? U.cards.TOKEN_D : 226, attrs: U.looseAttrs(c.card), side: 1, token: tok });
        b.appendChild(ce); ce.style.left = '0px'; ce.style.top = '0px';
        w = ce._bz.w; h = ce._bz.h; b._card = ce;
      } else {
        // thẻ chân dung (EncounterController, Encounter_Frame_{tier}_PV 2,52 x 2,19 u) + nhãn banner dưới
        var F = root.BZ_FRAMES && root.BZ_FRAMES.encounter && (root.BZ_FRAMES.encounter[tier] || root.BZ_FRAMES.encounter.Bronze);
        h = Math.round(2.19 * 109.6 / 1.55); var k = F ? h / F.h : 1; w = F ? Math.round(F.w * k) : h;
        var fr = U.el('div', 'fr', b), win = U.el('div', 'img', fr), A = U.top.artOf({ type: c.kind, id: c.id });
        if (F) { var wn = F.window; win.style.cssText = 'left:' + wn.x * k + 'px;top:' + wn.y * k + 'px;width:' + wn.w * k + 'px;height:' + wn.h * k + 'px;border-radius:' + (wn.shape === 'arch' ? '46% 46% 6px 6px / 30% 30% 6px 6px' : (wn.r * k) + 'px'); }
        win.style.backgroundImage = [A.char, A.bg].filter(Boolean).map(U.bg).join(',');
        if (F) { var fi = U.el('img', 'frame', fr); fi.src = U.url(F.src); fi.alt = ''; fi.draggable = false; }
        var spr = U.top.bannerSprite(U.top.pennantType({ type: c.kind }));
        if (spr) { var bn = U.el('i', 'banner', b); bn.style.backgroundImage = U.bg(spr); }
        if (c.slot && U.slotLabel(c.slot)) U.el('small', 'slot', b, U.esc(U.slotLabel(c.slot))); // nhãn ô lên cấp: chỉ cho đọc màn hình (ẩn), chữ hiện trong tooltip
      }
      // tem cam trên đỉnh (giá hoặc số lượng, clip karnok-perk / ju-gumball): pha chưa có trường này → chỉ vẽ khi có c.stamp
      if (c.stamp != null) U.el('b', 'stamp', b, U.esc(c.stamp)).style.backgroundImage = U.bg((root.BZ_FRAMES && root.BZ_FRAMES.parts && root.BZ_FRAMES.parts.tag2 || {}).src || '');
      b.style.left = (cx - w / 2).toFixed(1) + 'px'; b.style.top = (cy - h / 2).toFixed(1) + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px';
      b.style.setProperty('--x', cx);
      els.push(b);
      function show(touch) {
        var r = U.rectOf(b);
        if (sh === 'card') { var info = U.tipInfo(c.card, U.looseAttrs(c.card), null); if (info) root.BZTooltip.show(info, { x: r.x, y: r.y - 10, w: r.w, h: r.h }); if (!it.body) return; }
        U.panelTip({ x: r.x, y: r.y, w: r.w, h: r.h }, U.esc(it.title), it.body + (touch ? '<br><span class="o">Chạm lần nữa để chọn</span>' : ''));
        if (it.tipCard) { var ti = U.tipInfo(it.tipCard, U.looseAttrs(it.tipCard), null); if (ti) root.BZTooltip.show(ti, { x: r.x, y: r.y - 10, w: r.w, h: r.h }); }
      }
      function hide() { U.panelTip(null); root.BZTooltip.hide(); }
      var lastPt = 'mouse';
      b.addEventListener('pointerdown', function (e) { lastPt = e.pointerType; });
      b.addEventListener('pointerenter', function (e) { if (e.pointerType === 'touch') return; U.sfx('ui.hover', { vol: 0.5 }); show(false); });
      b.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hide(); });
      b.addEventListener('click', function () {
        if (U.state.busy || U.now() - born < 350) return;
        if (lastPt === 'touch' && !b.classList.contains('armed')) {
          els.forEach(function (x) { x.classList.remove('armed'); });
          b.classList.add('armed'); U.sfx('ui.hover', { vol: 0.5 }); show(true); return;
        }
        hide(); U.sfx('spell.select');
        els.forEach(function (x) { if (x !== b) x.classList.add('faded'); });
        b.classList.add('chosen');
        if (o.fly !== false && sh === 'orb') flyHud(b);
        o.onPick(it.i, b);
      });
    });
    // hiện lần lượt theo x tăng dần
    els.slice().sort(function (a, b2) { return parseFloat(a.style.getPropertyValue('--x')) - parseFloat(b2.style.getPropertyValue('--x')); })
      .forEach(function (e, k) { e.style.animationDelay = (k * 160) + 'ms'; });
    return els;
  };

  U.SCREENS.event = {
    enter: function (run, prev) {
      var ph = run.phase;
      if (ph.eventId === 'start') {
        this._eid = 'start|';
        U.top.base(run, { hero: true, sides: false, board: true, lane: 'event', carpet: ph.startId || null });
        U.top.portrait(ph.name, 'Bronze', { bg: ph.artKey ? U.art(ph.artKey) || U.art(String(ph.artKey).replace(/\.png$/, '')) : null, char: null }, '');
        this._stall = U.top.stall({ name: ph.name, desc: ph.desc, canExit: false, reroll: null, leave: function () {} });
        U.sfx('board.pickerAppear'); return;
      }
      // bước dẫn tiếp (Then: chuỗi Gumball, ba điều ước của Rit): eventId null, stepId = bước vừa chọn → ảnh + bậc của bước, giữ thảm cũ
      U.top.base(run, { hero: true, sides: false, board: true, lane: 'event', carpet: ph.eventId || undefined });
      this._eid = ph.eventId + '|' + (ph.stepId || '');
      var E = root.BZ_ENCOUNTERS, e = (ph.eventId && E.events[ph.eventId]) || (ph.stepId && E.steps[ph.stepId]) || {};
      var art = ph.eventId ? U.top.artOf({ type: 'event', id: ph.eventId }) : { bg: U.art(ph.stepId), char: null };
      U.top.portrait(ph.name, e.StartingTier || 'Bronze', art, '');
      this._stall = U.top.stall({ name: ph.name, desc: ph.desc, canExit: !!ph.canExit, reroll: null, leave: function () { U.dispatch({ t: 'leave' }); } });
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
      U.laneChoices(ph.choices.map(function (c, i) {
        var lbl = c.slot && U.slotLabel(c.slot);
        return { c: c, i: i, art: choiceArt(c), title: c.card ? R().title(R().tpl(c.card.id)) : c.name,
          body: c.card ? '' : (lbl && lbl !== c.name ? '<b class="w">' + U.esc(lbl) + '</b><br>' : '') + root.BZTooltip.format(c.desc || '').html };
      }), { onPick: function (i, el) { U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(el) }); } });
    },
    exit: function () { this._key = null; this._eid = null; this._stall = null; U.top.clear(); },
    boardFull: function () {
      if (!U.top.layer().querySelector('.rs-hint')) U.top.layer().appendChild(U.el('div', 'rs-hint', null, ''));
      U.boardFullHint();
    }
  };

  // ---------- loot: chọn 1 (hoặc nhiều) thẻ miễn phí ----------
  U.SCREENS.loot = {
    enter: function (run) {
      var ph = run.phase, src = ph.source, enc = root.BZ_ENCOUNTERS;
      var name = 'Phần thưởng', tier = 'Gold', art = { bg: null, char: null }, desc = '';
      if (src && enc.combats[src]) { name = enc.combats[src].Title; tier = enc.combats[src].StartingTier; art = U.top.artOf({ type: 'combat', id: src }); }
      else if (src && enc.events[src]) { name = enc.events[src].Title; tier = enc.events[src].StartingTier; art = U.top.artOf({ type: 'event', id: src }); desc = enc.events[src].Desc || ''; }
      else if (src && enc.steps[src]) { name = enc.steps[src].Title; tier = enc.steps[src].StartingTier; art = { bg: U.art(src) }; desc = enc.steps[src].Desc || ''; }
      this._rr = null; this._stall = null; this._note = null;
      var reroll = !ph.redeal ? null : {
        tip: function () { var p = U.state.run.phase; return p.taken ? '<br><span class="o">Đã lấy thẻ, không đổi được nữa</span>' : p.rerolls > 0 ? '<br><span class="o">Còn ' + p.rerolls + ' lượt</span>' : '<br><span class="o">Hết lượt đổi</span>'; },
        act: function () { U.cards.dealDelay = 500; var r0 = U.dispatch({ t: 'reroll' }); U.cards.dealDelay = 0; if (r0.ok) U.transitions.sparkle(); }
      };
      if (src && !enc.combats[src]) {
        // chia từ thẻ gặp gỡ (thầy kỹ năng "Teaches ... skills", "Get a Silver-tier Weapon"): bản gốc là một gặp gỡ thường (SelectionIsFree):
        // quầy lều / xe ở khung trên, thảm của thẻ, thẻ / orb kỹ năng không giá. Xe = bỏ qua (hỏi lại khi còn phần thưởng).
        U.top.base(run, { hero: true, sides: false, board: true, lane: 'event', carpet: enc.events[src] ? src : undefined });
        U.top.portrait(name, tier, art, '');
        this._stall = U.top.stall({ name: name, desc: R().encText ? R().encText(run, enc.events[src] || enc.steps[src] || {}, desc) : desc, canExit: true, reroll: reroll, leave: function () { U.skipReward(); } });
        this._rr = this._stall.rr;
      } else {
        // loot sau trận: giữ nút riêng (Bỏ qua + đổi của thầy), khung vàng neon; bỏ bảng tên bên trái và dòng hướng dẫn
        U.top.base(run, { hero: !!src, sides: 'r', board: true, lane: 'loot' });
        var side = U.top.portrait(name, tier, art, '');
        this._note = U.el('div', 'rs-side-note', side.r, '');
        U.bigButton(side.r, 'brown', 'Bỏ qua', 'Không lấy gì, đi tiếp', function () { U.skipReward(); }).classList.add('leave');
        if (reroll) {
          var ctl = U.el('div', 'rs-merchant-ctl', U.top.layer());
          this._rr = U.top.rerollButton(ctl, { title: 'Đổi các thẻ (R)', tip: function () { return 'Chia lại các thẻ của thầy này.' + reroll.tip(); },
            act: function (rr) { reroll.act(); var b = rr.querySelector('.ic'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); } });
        }
      }
      U.sfx('card.revealLiftStandard');
    },
    key: function (e) { if ((e.key === 'r' || e.key === 'R') && this._rr) { this._rr.click(); return true; } },
    boardFull: function () { U.boardFullHint(); },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      var lock = ph.taken > 0 ? 'cannot reroll after taking a card' : null;
      if (this._stall) U.top.stallReroll(this._stall, ph.redeal ? ph : null, run, lock);
      else if (this._rr) U.top.rerollSync(this._rr, ph, run, lock);
      U.cards.setTop(ph.picks.map(function (p, i) { return { key: 'loot:' + (ph.source || '') + ':' + p.card.id + ':' + p.card.tier, card: p.card, kind: 'loot', i: i }; }));
      if (this._note) this._note.innerHTML = 'Lấy <b>' + (ph.take - ph.taken) + '</b> trong ' + ph.picks.length;
    },
    exit: function () { this._note = null; this._rr = null; this._stall = null; U.top.clear(); },
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
      U.top.base(run, { hero: true, sides: false, board: true, lane: 'pedestal', carpet: ph.pedestalId });
      U.top.portrait(ph.name, e.StartingTier || 'Gold', U.top.artOf({ type: 'pedestal', id: ph.pedestalId }), '');
      this._stall = U.top.stall({ name: ph.name, desc: ph.desc, canExit: true, reroll: null, leave: function () { U.dispatch({ t: 'leave' }); } });
      // vùng thả của bệ (PedestalDropArea): không chữ hướng dẫn; vật phẩm hợp lệ sáng lên khi kéo (PedestalRequirementMet)
      U.el('div', 'rs-pedestal', U.top.layer(), '<div class="orb"></div>');
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

  // ---------- chọn bùa (phase 'enchantPick', The Artist): thẻ đã chọn hiện một bản cho mỗi loại bùa, tooltip đúng chữ của bùa đó ----------
  // Mỗi ô là chính thẻ gốc mang bùa tương ứng (sprite + khung gốc, BZCard); bấm = choose {ench}; "Chọn thẻ khác" = back.
  U.SCREENS.enchantPick = {
    enter: function (run) {
      var ph = run.phase, e = root.BZ_ENCOUNTERS.pedestals[ph.pedestalId] || {};
      U.top.base(run, { hero: true, sides: true, board: true, lane: 'pedestal' });
      var side = U.top.portrait(ph.name, e.StartingTier || 'Gold', U.top.artOf({ type: 'pedestal', id: ph.pedestalId }), U.top.nameBlock('Chọn bùa', ph.name, ph.desc));
      U.bigButton(side.r, 'brown', 'Chọn thẻ khác', 'Quay lại bệ để chọn món khác', function () { U.dispatch({ t: 'back' }); }).classList.add('leave');
      U.sfx('pedestal.lightpulse');
    },
    render: function (run) {
      var ph = run.phase;
      U.cards.render(run);
      var els = U.cards.setTop(ph.options.map(function (k, i) {
        return { key: 'ench:' + ph.uid + ':' + k, card: { id: ph.cardId, tier: ph.tier, ench: k }, kind: 'loot', i: i };
      }), { gap: 14 });
      els.forEach(function (el, i) {
        el.dataset.drag = '';
        if (!el.querySelector('.rs-enchname')) U.el('div', 'rs-enchname' + (i % 2 ? ' alt' : ''), el, U.esc(ph.options[i])); // hai hàng so le: tên dài không đè nhau
      });
    },
    exit: function () { U.top.clear(); },
    canDrag: function () { return false; },
    onCardClick: function (el, touch) {
      if (el._rs.kind !== 'loot') return false;
      if (touch && U.cards.tapTip(el)) return true;
      U.cards.clearTap();
      U.dispatch({ t: 'choose', ench: el._rs.card.ench }, { fromRect: U.rectOf(el) });
      return true;
    }
  };

  // nhãn ô phần thưởng lên cấp, theo cách bản gốc gọi (clock.js R.LEVEL_REWARDS: `loại[:tham số]`); bản gốc: "Random Skill Trainer",
  // "Random Enchant Option", "The Artist", "Random Character Reward", "Get Bronze Item", "Upgrade a Bronze-tier Item" (wiki Level_Up)
  var SLOT_TIER = { Bronze: 'Đồng', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương', Any: 'bất kỳ' };
  function tierVi(arg) { return String(arg || '').split('|').map(function (t) { return SLOT_TIER[t] || t; }).join(' hoặc '); }
  var SLOT_LABEL = {
    pip: function () { return 'Thầy kỹ năng Đồng'; }, argenta: function () { return 'Thầy kỹ năng Bạc'; }, orlin: function () { return 'Thầy kỹ năng Vàng'; },
    adira: function () { return 'Thầy kỹ năng Kim cương'; },
    trainer: function () { return 'Thầy kỹ năng ngẫu nhiên'; }, heroTeacher: function () { return 'Thầy riêng của hero'; },
    heroReward: function () { return 'Phần thưởng riêng của hero'; },
    item: function (a) { return 'Nhận vật phẩm ' + tierVi(a); }, loot: function (a) { return 'Nhận phần thưởng ' + tierVi(a); },
    upgrade: function (a) { return 'Nâng bậc vật phẩm ' + tierVi(a); },
    enchantRandom: function () { return 'Địa điểm yểm bùa ngẫu nhiên'; }, artist: function () { return 'Họa sĩ: tự chọn bùa'; }
  };
  U.slotLabel = function (slot) {
    var kv = String(slot || '').split(':'), f = SLOT_LABEL[kv[0]];
    return f ? f(kv[1]) : '';
  };

  // ---------- lên cấp: một đến ba phần thưởng dạng khung gặp gỡ (khung lục giác vàng gốc) ----------
  // Màn Số phận (phase 'fates') nằm ở js/ui/screens/fight.js.
  U.SCREENS.levelUp = {
    enter: function (run) { U.top.base(run, { lane: 'loot' }); }, // dải khung vàng (UI-06)
    render: function (run) {
      var ph = run.phase, ch = ph.choices || [];
      U.cards.render(run);
      var key = ph.kind + ':' + (ph.level || 0) + ':' + JSON.stringify(ch);
      if (key === this._key && U.top.layer().children.length) return;
      this._key = key;
      U.top.clear();
      var m = U.top.map('Lên cấp', ''); // chuỗi cứng "Level Up" của LevelUpVisualController.GetLevelUpText, không dòng phụ
      m.classList.add('levelup');
      U.top.frames(ch, function (i) { U.dispatch({ t: 'choose', i: i }); }, { pennant: function () { return 'levelup'; }, y: 262, kicker: 'Phần thưởng lên cấp', label: function (o) { return U.slotLabel(o.slot); } });
      // khung lục giác vàng gốc (Tooltip_Reward_Level_Frame_*) thay khung mái vòm (ASSET-21)
      Array.prototype.forEach.call(U.top.layer().querySelectorAll('.rs-enc'), function (n) { n.classList.add('lvl'); });
    },
    boardFull: function () {
      if (U.top.layer().querySelector('.rs-hint')) U.boardFullHint();
      else { U.top.layer().appendChild(U.el('div', 'rs-hint', null, '')); U.boardFullHint(); }
    },
    exit: function () { this._key = null; U.top.clear(); }
  };
})(window);
