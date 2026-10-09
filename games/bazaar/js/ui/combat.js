/* Chợ Phiên — phát lại trận của run trên chính sân khấu xem trận (BZView + BZReplay, pha 1b).
   Reducer đã chạy trận (lệnh `fight`) và lưu boards + simOpts trong pha fightResult; ở đây chạy lại
   BZSim.run(Object.assign({boards}, simOpts)) có khung hình (frames) — cùng seed nên cùng kết quả — rồi phát lại.
   Không bao giờ đổi trạng thái run: xong trận chỉ gọi onDone để màn kết quả hiện ra. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; }, RP = function () { return root.BZReplay; };
  var C = U.combat = {};
  var cur = null; // {res, info, onDone, notified, expect}
  var dock = null, hovered = null;
  var SPEED_LS = 'bz.fightSpeed';

  C.active = function () { return !!(cur && cur.playing); };
  // tên hiển thị của đối thủ: bóng → "Bóng ma của <tên>"
  U.oppName = function (opp) {
    if (!opp) return '';
    if (opp.kind === 'ghost') return 'Bóng ma của ' + String(opp.name || '').replace(/^Ghost of /, '');
    return opp.name || '';
  };
  function monById(id) { return (root.BZ_MONSTERS || []).filter(function (m) { return m.Id === id; })[0] || null; }
  // Bóng PvP từ bộ dữ liệu (opp.source 'dataset', opp.hero): chân dung của hero đó; bóng dựng từ quái: ảnh quái
  C.opponentArt = function (opp) {
    var H = opp.hero && U.HEROES[opp.hero];
    if (opp.source === 'dataset' && H) return { bg: null, char: H.portrait, store: H.store, hero: opp.hero };
    var encId = opp.combatId || null;
    if (!encId && opp.monsterId) { var m = monById(opp.monsterId); encId = m && m.Encounters && m.Encounters[0] && m.Encounters[0].Id; }
    return { bg: U.art(encId + '_bg'), char: U.art(encId + '_char') };
  };
  var KIND_OF = { TActionPlayerDamage: 'damage', TActionPlayerBurnApply: 'burn', TActionPlayerPoisonApply: 'poison', TActionPlayerHeal: 'heal',
    TActionPlayerShieldApply: 'shield', TActionPlayerRegenApply: 'regen', TActionCardFreeze: 'freeze', TActionCardSlow: 'slow', TActionCardHaste: 'haste' };
  function primaryKind(tpl, tier) {
    var blk = root.BZSim.tierBlock(tpl, tier), ids = blk.AbilityIds || [];
    for (var i = 0; i < ids.length; i++) { var a = tpl.Abilities && tpl.Abilities[ids[i]]; var k = a && a.Action && KIND_OF[a.Action.$type]; if (k) return k; }
    return 'damage';
  }

  // start(run, onDone): run.phase là fightResult
  C.start = function (run, onDone) {
    var ph = run.phase, BZ = root.BZSim;
    var res = BZ.run(Object.assign({ boards: R().clone(ph.boards) }, ph.simOpts));
    var gotWinner = res.winner === 0 ? 'player' : res.winner === 1 ? 'opponent' : 'draw';
    if (gotWinner !== ph.winner) console.warn('replay winner ' + gotWinner + ' differs from run result ' + ph.winner);
    var boards = ph.boards, info = { cards: {}, sandstorm: true, sides: [] }, lists = [[], []], skills = [[], []];
    V().clearCards(); root.BZTooltip.hide();
    res.cards.forEach(function (c) {
      var tpl = BZ.tpl(c.id); if (!tpl) return;
      var ci = { uid: c.uid, id: c.id, tier: c.tier, ench: c.ench, socket: c.socket, size: c.size, section: c.section };
      var attrs = {}, lines = [];
      try { attrs = BZ.attrs(ci, { boards: boards }); } catch (e) { attrs = {}; }
      try { lines = BZ.cardText(ci, { boards: boards }); } catch (e) { lines = []; }
      var type = U.typeOf(tpl);
      var rec = info.cards[c.uid] = {
        inst: { uid: c.uid, id: c.id, tier: c.tier, size: c.size, ench: c.ench, type: type }, attrs0: attrs, attrs: Object.assign({}, attrs),
        tier0: c.tier, ench0: c.ench, side: c.owner, section: c.section, kind: primaryKind(tpl, c.tier),
        tip: { name: R().title(tpl), tier: c.tier, size: tpl.Size, type: type, tags: tpl.Tags || [], lines: lines,
          cooldown: type === 'Skill' ? 0 : (attrs.CooldownEffective || 0), ammoMax: attrs.AmmoMax || 0, crit: attrs.CritChance || 0, multicast: attrs.Multicast || 1, ench: c.ench }
      };
      if (c.section === 'hand') {
        var el = root.BZCard.create(rec.inst, { h: V().BOARD.cardH, attrs: attrs, side: c.owner });
        rec.el = el; lists[c.owner].push({ uid: c.uid, el: el, size: c.size, socket: c.socket });
      } else if (c.section === 'skills') skills[c.owner].push({ uid: c.uid, id: c.id, tier: c.tier, art: U.art(c.id) });
    });
    var M = U.HEROES[run.hero] || {}, opp = ph.opponent, oa = C.opponentArt(opp), oname = U.oppName(opp);
    V().setupHero(0, { name: run.hero, level: run.level, tier: 'Gold', char: M.portrait, skills: skills[0], hpMax: res.players[0].healthMax,
      rewards: ph.combatType === 'PVE' ? { gold: 0, xp: 0 } : {} });
    var h0 = V().hero(0); if (h0) h0.art.classList.add('hero-art');
    V().setupHero(1, { name: oname, level: (boards[1] && boards[1].level) || 1, tier: (ph.opponent.tier) || 'Silver', char: oa.char, bg: oa.bg, skills: skills[1],
      rewards: ph.rewards || {}, hpMax: res.players[1].healthMax });
    var h1 = V().hero(1); if (h1) h1.art.classList.toggle('hero-art', !!oa.hero);
    V().layoutBoard(0, lists[0]); V().layoutBoard(1, lists[1]);
    // ô phải của phe ta: vàng + thu nhập hiện tại (thay ô phần thưởng của trang xem trận)
    V().refs.sides[0].r.innerHTML = '<div class="bz-sublabel">Túi vàng</div><div class="bz-reward"><img alt="" src="' + U.url(U.ICON.coin) + '"><span>' + run.gold + '</span></div>' +
      '<div class="bz-sublabel" style="margin-top:4px">+' + run.income + ' mỗi ngày · ' + res.players[0].healthMax + ' máu</div>';
    res.players[0].name = run.hero; res.players[1].name = oname;
    info.sides = [{ name: run.hero }, { name: oname }];
    U.cards.show(false); U.hud.show(false);
    V().refs.stage.classList.add('m-fight');
    root.BZFX.clear();
    RP().load(res, info);
    var sp = 1; try { sp = +root.localStorage.getItem(SPEED_LS) || 1; } catch (e) { sp = 1; }
    RP().setSpeed(Math.max(1, Math.min(3, sp)));
    RP().pause(false);
    cur = { res: res, info: info, onDone: onDone, notified: false, playing: true, expect: ph.winner, got: gotWinner };
    var A = root.BZAudio; if (A) A.music(ph.combatType === 'PVP' ? 'music.battle.' + String(run.hero).toLowerCase() : 'music.pve', 1);
    U.sfx('trans.combat');
    buildDock(); dock.style.display = '';
    refreshDock();
  };
  C.step = function (dt, now) {
    if (!cur) return;
    RP().step(dt, now);
    var S = RP().state();
    if (S && S.done && !cur.notified) { cur.notified = true; refreshDock(); if (cur.onDone) cur.onDone(); }
  };
  C.restart = function () { if (cur) { cur.notified = false; RP().restart(); } };
  C.skip = function () { if (cur && cur.playing) RP().skip(); };
  // stop(): dỡ trận, trả sân cho run
  C.stop = function () {
    if (!cur) return;
    cur.playing = false; cur = null;
    V().clearCards(); root.BZFX.clear(); root.BZTooltip.hide();
    V().hideBanner(true); [0, 1].forEach(function (s) { V().setDead(s, false); V().crown(s, false); }); V().sand(false);
    V().refs.stage.classList.remove('m-fight');
    if (dock) dock.style.display = 'none';
    U.cards.show(true); U.hud.show(true);
    U.hud.mountHero(U.state.run, true);
  };
  C.info = function () {
    var S = RP().state();
    return { active: C.active(), t: S ? S.t : 0, endMs: S ? S.endMs : 0, done: S ? S.done : false, got: cur ? cur.got : null, expect: cur ? cur.expect : null };
  };

  function buildDock() {
    if (dock) return;
    dock = U.el('div', 'rs-fightdock', V().refs.overlay);
    [1, 2, 3].forEach(function (x) {
      var b = U.button(dock, 'sp', x + '×', 'Tốc độ ' + x + '×', function () { RP().setSpeed(x); RP().pause(false); try { root.localStorage.setItem(SPEED_LS, x); } catch (e) { /* bỏ qua */ } refreshDock(); });
      b.dataset.sp = x;
    });
    U.button(dock, 'skip', '<svg viewBox="0 0 24 24"><path d="M4 5v14l9-7zM13 5v14l9-7z"/></svg><span>Tới kết quả</span>', 'Bỏ qua tới kết quả', function () { C.skip(); });
    // hover thẻ trong trận: tooltip như trang xem trận
    var layer = V().refs.cardLayer;
    layer.addEventListener('pointermove', function (ev) {
      if (!cur || ev.pointerType === 'touch') return;
      var el = ev.target.closest && ev.target.closest('.bz-card'); setHov(el);
    });
    layer.addEventListener('pointerleave', function () { setHov(null); });
    layer.addEventListener('pointerdown', function (ev) {
      if (!cur || ev.pointerType !== 'touch') return;
      var el = ev.target.closest && ev.target.closest('.bz-card'); setHov(el === hovered ? null : el);
    });
  }
  function setHov(el) {
    var now = U.now();
    if (hovered && hovered !== el) { root.BZCard.setHover(hovered, false, now); root.BZTooltip.hide(); }
    hovered = el || null;
    if (!el || !cur) return;
    root.BZCard.setHover(el, true, now);
    var ci = cur.info.cards[el.dataset.uid];
    if (ci) root.BZTooltip.show(ci.tip, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) - 10, w: el._bz.w, h: el._bz.h });
  }
  function refreshDock() {
    var S = RP().state(); if (!dock || !S) return;
    Array.prototype.forEach.call(dock.querySelectorAll('.sp'), function (b) { b.classList.toggle('on', +b.dataset.sp === S.speed); });
  }
})(window);
