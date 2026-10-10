/* Chợ Phiên — trang xem trận (pha 1b): chọn hai quái (BZ_MONSTERS, gom theo cấp) hoặc "trận ngẫu nhiên cân sức",
   chạy BZSim.run một lần rồi phát lại bằng BZReplay. Nối: BZView (sân), BZCard (thẻ), BZTooltip, BZFX (canvas), BZAudio.
   URL: ?a=<id quái bàn dưới>&b=<id quái bàn trên>&seed=N&speed=N (id đủ, 8 ký tự đầu, hoặc InternalName).
   Móc kiểm thử: window.BZ_DEBUG = {fight, fightBoards, seek, speed, state, perf}. */
(function (root) {
  'use strict';
  root.BZ_REV = root.BZ_REV || '20261010b';
  var BZ = root.BZSim, V = root.BZView, RP = root.BZReplay, AU = root.BZAudio;
  var cur = null; // {a, b, seed, res, boards, info}
  var MON = [];

  // ---------- quái ----------
  function monTitle(m) { var e = (m.Encounters || [])[0]; return (e && e.Title) || m.InternalName; }
  function monLevel(m) { return (m.Player && m.Player.Attributes && m.Player.Attributes.Level) || 1; }
  function buildMonsters() {
    MON = (root.BZ_MONSTERS || []).filter(function (m) { return (m.Encounters || []).length && ((m.Player.Hand || {}).Items || []).length; });
    MON.sort(function (a, b) { return monLevel(a) - monLevel(b) || monTitle(a).localeCompare(monTitle(b)); });
  }
  function findMon(q) {
    if (!q) return null;
    q = String(q);
    return MON.find(function (m) { return m.Id === q; }) || MON.find(function (m) { return m.Id.indexOf(q) === 0; }) ||
      MON.find(function (m) { return m.InternalName === q || monTitle(m) === q; }) || (root.BZ_MONSTERS || []).find(function (m) { return m.Id === q || m.Id.indexOf(q) === 0; }) || null;
  }
  function artOf(key) { var m = root.BZ_ART && root.BZ_ART.map; return (m && m[key]) || null; }
  function randomFair() {
    var byL = {};
    MON.forEach(function (m) { (byL[monLevel(m)] = byL[monLevel(m)] || []).push(m); });
    var Ls = Object.keys(byL).filter(function (l) { return byL[l].length >= 2; });
    var L = Ls[Math.floor(Math.random() * Ls.length)], arr = byL[L].slice();
    var i = Math.floor(Math.random() * arr.length), a = arr.splice(i, 1)[0], b = arr[Math.floor(Math.random() * arr.length)];
    return { a: a.Id, b: b.Id, seed: 1 + Math.floor(Math.random() * 99999) };
  }

  // ---------- dựng trận ----------
  function fight(aId, bId, seed, keepSpeed) {
    var A = findMon(aId), B = findMon(bId);
    if (!A || !B) throw new Error('monster not found: ' + (!A ? aId : bId));
    return fightWith(A, B, seed, keepSpeed, null);
  }
  // boards: null = dựng từ hai quái; hoặc hai bàn sim tuỳ ý (BZ_DEBUG.fightBoards) — A/B chỉ lo chân dung + tên
  function fightWith(A, B, seed, keepSpeed, custom) {
    seed = seed == null ? 1 : +seed;
    var boards = custom || [BZ.boardFromMonster(A, 'a'), BZ.boardFromMonster(B, 'b')];
    var res = BZ.run({ boards: boards, seed: seed, sandstorm: true });
    cur = { a: A.Id, b: B.Id, seed: seed, res: res, boards: boards, mons: [A, B] };
    buildView();
    RP.load(res, cur.info);
    if (!keepSpeed) RP.setSpeed(RP.state().speed || 1);
    RP.pause(false);
    if (AU) { AU.music('music.pve', 1.5); }
    updateUrl();
    refreshControls();
    return { winner: res.winner, endMs: res.endMs };
  }
  // thông tin tĩnh của từng thẻ (tính một lần, trước khi phát)
  function buildView() {
    var res = cur.res, boards = cur.boards;
    V.clearCards();
    root.BZTooltip.hide();
    var info = { cards: {}, sandstorm: true, sides: [] };
    var lists = [[], []], skills = [[], []];
    res.cards.forEach(function (c) {
      var tpl = BZ.tpl(c.id); if (!tpl) return;
      var ci = { uid: c.uid, id: c.id, tier: c.tier, ench: c.ench, socket: c.socket, size: c.size, section: c.section };
      var attrs = {}, lines = [];
      try { attrs = BZ.attrs(ci, { boards: boards }); } catch (e) { attrs = {}; }
      try { lines = BZ.cardText(ci, { boards: boards }); } catch (e) { lines = []; }
      var type = tpl.Type || (tpl.$type === 'TCardSkill' ? 'Skill' : 'Item');
      var kind = primaryKind(tpl, c.tier);
      var rec = info.cards[c.uid] = {
        inst: { uid: c.uid, id: c.id, tier: c.tier, size: c.size, ench: c.ench, type: type }, attrs0: attrs, attrs: Object.assign({}, attrs),
        tier0: c.tier, ench0: c.ench, side: c.owner, section: c.section, kind: kind,
        tip: { name: (tpl.Localization && tpl.Localization.Title && tpl.Localization.Title.Text) || tpl.InternalName, tier: c.tier, size: tpl.Size, type: type,
          tags: tpl.Tags || [], lines: lines, cooldown: type === 'Skill' ? 0 : (attrs.CooldownEffective || 0), ammoMax: attrs.AmmoMax || 0,
          crit: attrs.CritChance || 0, multicast: attrs.Multicast || 1, ench: c.ench }
      };
      if (c.section === 'hand') {
        var el = root.BZCard.create(rec.inst, { h: V.BOARD.cardH, attrs: attrs, side: c.owner });
        rec.el = el;
        lists[c.owner].push({ uid: c.uid, el: el, size: c.size, socket: c.socket });
      } else if (c.section === 'skills') {
        skills[c.owner].push({ uid: c.uid, id: c.id, tier: c.tier, art: artOf(c.id) });
      }
    });
    [0, 1].forEach(function (s) {
      var m = cur.mons[s], enc = (m.Encounters || [])[0] || {};
      V.setupHero(s, { name: monTitle(m), level: monLevel(m), tier: enc.StartingTier || 'Bronze', char: artOf(enc.Id + '_char'), bg: artOf(enc.Id + '_bg'),
        skills: skills[s], rewards: { gold: enc.RewardCombatGold || 0, xp: enc.RewardCombatXp || 0 }, hpMax: res.players[s].healthMax });
      V.layoutBoard(s, lists[s]);
      info.sides[s] = { name: monTitle(m) };
    });
    res.players.forEach(function (p, s) { p.name = monTitle(cur.mons[s]); });
    cur.info = info;
    var seedEl = document.getElementById('bz-seed');
    if (seedEl) seedEl.textContent = 'Hạt giống ' + cur.seed;
    var sub = document.getElementById('bz-sub');
    if (sub) sub.textContent = monTitle(cur.mons[0]) + ' (cấp ' + monLevel(cur.mons[0]) + ') đấu ' + monTitle(cur.mons[1]) + ' (cấp ' + monLevel(cur.mons[1]) + ')';
  }
  var KIND_OF = { TActionPlayerDamage: 'damage', TActionPlayerBurnApply: 'burn', TActionPlayerPoisonApply: 'poison', TActionPlayerHeal: 'heal',
    TActionPlayerShieldApply: 'shield', TActionPlayerRegenApply: 'regen', TActionCardFreeze: 'freeze', TActionCardSlow: 'slow', TActionCardHaste: 'haste' };
  function primaryKind(tpl, tier) {
    var blk = BZ.tierBlock(tpl, tier), ids = blk.AbilityIds || [];
    for (var i = 0; i < ids.length; i++) { var a = tpl.Abilities && tpl.Abilities[ids[i]]; var k = a && a.Action && KIND_OF[a.Action.$type]; if (k) return k; }
    return 'damage';
  }
  // khung tới muộn (data/frames.js): dựng lại khung thẻ + chân dung, giữ nguyên thời điểm
  function relayout() {
    if (!cur) return;
    var t = RP.state() ? RP.state().t : 0, sp = RP.state() ? RP.state().speed : 1, pa = RP.state() ? RP.state().paused : false;
    buildView();
    RP.load(cur.res, cur.info);
    RP.setSpeed(sp); RP.seek(t); RP.pause(pa);
  }

  function updateUrl() {
    try {
      var u = new URL(root.location.href);
      u.searchParams.set('a', cur.a.slice(0, 8)); u.searchParams.set('b', cur.b.slice(0, 8)); u.searchParams.set('seed', cur.seed);
      root.history.replaceState(null, '', u.toString());
    } catch (e) { /* file:// hoặc trình duyệt cũ */ }
  }

  // ---------- điều khiển ----------
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
    skip: '<svg viewBox="0 0 24 24"><path d="M4 5v14l9-7zM13 5v14l9-7z"/></svg>',
    again: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    snd: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7l1.4 1.4a7 7 0 0 0 0-9.8zM18.8 5.7a9 9 0 0 1 0 12.6l1.4 1.4a11 11 0 0 0 0-15.4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9.4l1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z"/></svg>',
    dice: '<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>'
  };
  var C = {};
  function btn(parent, cls, html, title, fn) {
    var b = V.el('button', 'bz-btn ' + (cls || ''), parent, html);
    b.type = 'button'; if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', function (e) { e.stopPropagation(); if (AU) AU.play('ui.click'); fn(); });
    b.addEventListener('pointerenter', function () { if (AU) AU.play('ui.hover', { vol: 0.5 }); });
    return b;
  }
  function buildControls() {
    var ui = V.refs.ui;
    var top = V.el('div', 'bz-topbar', ui, '<h1>Chợ Phiên</h1><p id="bz-sub">Xem trận</p>');
    var pick = btn(ui, 'bz-pick-btn', 'Chọn trận', 'Chọn hai quái để đấu', openPicker); pick.style.pointerEvents = 'auto';
    var home = btn(ui, 'bz-home-btn', 'Về chợ', 'Về màn tiêu đề của Chợ Phiên', function () { root.location.href = 'index.html'; }); home.style.pointerEvents = 'auto';
    var seed = V.el('div', 'bz-seed', ui); seed.id = 'bz-seed';
    var dock = V.el('div', 'bz-dock', ui); dock.style.pointerEvents = 'auto';
    var r1 = V.el('div', 'row', dock);
    C.play = btn(r1, '', ICON.pause, 'Tạm dừng / chạy tiếp (Space)', function () { if (RP.state().done) RP.restart(); else RP.pause(); });
    C.sp = [1, 2, 3].map(function (x) { var b = btn(r1, '', x + '×', 'Tốc độ ' + x + '× (phím ' + x + ')', function () { RP.setSpeed(x); RP.pause(false); }); b.dataset.sp = x; return b; });
    C.skip = btn(r1, '', ICON.skip, 'Tới kết quả (End)', function () { RP.skip(); });
    var r2 = V.el('div', 'row', dock);
    C.again = btn(r2, 'wide', ICON.again + '<span>Xem lại</span>', 'Phát lại từ đầu (R)', function () { RP.restart(); if (AU) AU.music('music.pve', 1); });
    C.rand = btn(r2, 'wide', ICON.dice + '<span>Ngẫu nhiên</span>', 'Trận ngẫu nhiên cân sức', function () { var r = randomFair(); fight(r.a, r.b, r.seed, true); });
    var tl = C.tl = V.el('div', 'bz-timeline', dock);
    C.tlFill = V.el('i', '', tl);
    C.tlStorm = V.el('b', '', tl);
    var seekAt = function (ev) { var r = tl.getBoundingClientRect(); var u = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); RP.seek(u * RP.state().duration); };
    var dragging = false;
    tl.addEventListener('pointerdown', function (ev) { dragging = true; try { tl.setPointerCapture(ev.pointerId); } catch (e) { /* bỏ qua */ } seekAt(ev); });
    tl.addEventListener('pointermove', function (ev) { if (dragging) seekAt(ev); });
    tl.addEventListener('pointerup', function () { dragging = false; });
    var vol = V.el('div', 'bz-vol', dock);
    C.mute = btn(vol, '', AU && AU.isMuted() ? ICON.mute : ICON.snd, 'Bật/tắt tiếng (M)', function () { AU.toggleMute(); refreshControls(); });
    C.mute.style.minWidth = '56px'; C.mute.style.height = '52px';
    C.vol = V.el('input', '', vol); C.vol.type = 'range'; C.vol.min = 0; C.vol.max = 100; C.vol.value = Math.round((AU ? AU.getVolume() : 0.7) * 100);
    C.vol.setAttribute('aria-label', 'Âm lượng');
    C.vol.addEventListener('input', function () { AU.setVolume(C.vol.value / 100); refreshControls(); });
    var coarse = false; try { coarse = root.matchMedia('(pointer: coarse)').matches; } catch (e) { /* bỏ qua */ }
    V.el('div', 'bz-hint', ui, coarse ? 'Chạm vào thẻ hoặc kỹ năng để xem chi tiết' : 'Rê chuột lên thẻ để xem chi tiết · Space tạm dừng · 1/2/3 tốc độ · End tới kết quả');
    RP.onChange = refreshControls;
  }
  function refreshControls() {
    var S = RP.state(); if (!S || !C.play) return;
    C.play.innerHTML = S.paused || S.done ? ICON.play : ICON.pause;
    C.sp.forEach(function (b) { b.classList.toggle('on', +b.dataset.sp === S.speed); });
    if (AU) { C.mute.innerHTML = AU.isMuted() ? ICON.mute : ICON.snd; }
    var cfg = BZ.SANDSTORM;
    C.tlStorm.style.left = ((cfg.countdownStart + cfg.countdown) / S.duration * 100).toFixed(2) + '%';
    C.tlStorm.style.display = cfg.countdownStart + cfg.countdown < S.endMs ? '' : 'none';
  }
  var lastTl = -1;
  function tickControls() {
    var S = RP.state(); if (!S || !C.tlFill) return;
    var u = Math.round(S.t / S.duration * 1000);
    if (u !== lastTl) { lastTl = u; C.tlFill.style.transform = 'scaleX(' + (u / 1000) + ')'; }
    var wantPlay = S.paused || S.done;
    if (C._wp !== wantPlay) { C._wp = wantPlay; C.play.innerHTML = wantPlay ? ICON.play : ICON.pause; }
  }

  // ---------- hover thẻ + tooltip ----------
  var hovered = null, touchTip = null;
  function cardInfo(uid) { return cur && cur.info.cards[uid]; }
  function bindHover() {
    var layer = V.refs.cardLayer;
    layer.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'touch') return;
      var el = ev.target.closest && ev.target.closest('.bz-card');
      setHovered(el, ev);
    });
    layer.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') setHovered(null); });
    layer.addEventListener('pointerdown', function (ev) { // chạm (điện thoại): chạm để mở/đóng tooltip
      if (ev.pointerType !== 'touch') return;
      var el = ev.target.closest && ev.target.closest('.bz-card');
      if (el && el === touchTip) { setHovered(null); touchTip = null; return; }
      touchTip = el; setHovered(el, ev);
    });
    V.refs.stage.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch' && !(ev.target.closest && (ev.target.closest('.bz-card') || ev.target.closest('.bz-skill')))) { setHovered(null); touchTip = null; }
    });
    // kỹ năng: tooltip khi rê/chạm
    V.refs.stage.addEventListener('pointerover', function (ev) {
      var sk = ev.target.closest && ev.target.closest('.bz-skill[data-uid]');
      if (!sk) return;
      var ci = cardInfo(sk.dataset.uid); if (!ci) return;
      var b = sk.getBoundingClientRect(), p = V.toStage(b.left, b.top);
      root.BZTooltip.show(ci.tip, { x: p.x, y: p.y, w: b.width / V.scale, h: b.height / V.scale });
    });
    V.refs.stage.addEventListener('pointerout', function (ev) {
      var sk = ev.target.closest && ev.target.closest('.bz-skill[data-uid]');
      if (sk && !(ev.relatedTarget && sk.contains(ev.relatedTarget))) root.BZTooltip.hide();
    });
  }
  function setHovered(el, ev) {
    var now = performance.now();
    if (hovered && hovered !== el) { root.BZCard.setHover(hovered, false, now); if (AU) AU.play('card.lower', { vol: 0.5 }); root.BZTooltip.hide(); }
    if (el && hovered !== el && AU) AU.play('card.raise', { vol: 0.6 });
    hovered = el || null;
    if (!el) return;
    root.BZCard.setHover(el, true, now);
    var uid = el.dataset.uid, rect = V.cardRect(uid), B = el._bz;
    if (ev && ev.clientX != null) {
      var p = V.toStage(ev.clientX, ev.clientY), left = parseFloat(el.style.left), top = parseFloat(el.style.top);
      root.BZCard.pointer(el, (p.x - left - B.w / 2) / (B.w / 2), (p.y - top - B.h / 2) / (B.h / 2));
    }
    var ci = cardInfo(uid);
    if (ci && rect) root.BZTooltip.show(ci.tip, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) - 10, w: B.w, h: B.h });
  }

  // ---------- chọn trận ----------
  var pk = null, sel = { a: null, b: null };
  function openPicker() {
    if (!pk) buildPicker();
    sel.a = cur ? cur.a : null; sel.b = cur ? cur.b : null;
    markSel();
    pk.el.classList.add('open');
    RP.pause(true);
  }
  function closePicker() { if (pk) pk.el.classList.remove('open'); }
  function buildPicker() {
    var el = V.el('div', 'bz-picker', V.refs.stage);
    el.innerHTML = '<div class="panel"><header><h2>Chọn trận đấu</h2></header><div class="cols">' +
      '<div class="col" data-side="b"><h3>Bàn trên (đối thủ) <span></span></h3><div class="list"></div></div>' +
      '<div class="col" data-side="a"><h3>Bàn dưới (phe ta) <span></span></h3><div class="list"></div></div></div>' +
      '<footer><label>Hạt giống <input type="number" min="1" max="999999" step="1"></label></footer></div>';
    var foot = el.querySelector('footer');
    pk = { el: el, seed: el.querySelector('footer input'), cols: {} };
    btn(foot, '', ICON.dice + '<span>Trận ngẫu nhiên cân sức</span>', 'Hai quái cùng cấp, hạt giống ngẫu nhiên', function () {
      var r = randomFair(); closePicker(); fight(r.a, r.b, r.seed, true);
    });
    btn(foot, '', 'Huỷ', 'Đóng', function () { closePicker(); RP.pause(false); });
    btn(foot, 'on', 'Đấu!', 'Bắt đầu trận', function () {
      if (!sel.a || !sel.b) return;
      closePicker(); fight(sel.a, sel.b, Math.max(1, Math.floor(+pk.seed.value || 1)), true);
    });
    el.addEventListener('pointerdown', function (e) { if (e.target === el) { closePicker(); RP.pause(false); } });
    ['a', 'b'].forEach(function (side) {
      var col = el.querySelector('.col[data-side="' + side + '"]'), list = col.querySelector('.list');
      pk.cols[side] = { col: col, list: list, name: col.querySelector('h3 span'), tiles: {} };
      var lv = null, grid = null;
      MON.forEach(function (m) {
        var L = monLevel(m);
        if (L !== lv) { lv = L; V.el('div', 'lv', list, 'Cấp ' + L); grid = V.el('div', 'grid', list); }
        var enc = m.Encounters[0];
        var t = V.el('button', 'bz-mon', grid);
        t.type = 'button';
        var bg = artOf(enc.Id + '_bg'), ch = artOf(enc.Id + '_char');
        if (bg) t.style.backgroundImage = 'url("' + bg + '?v=' + root.BZ_REV + '")';
        var c = V.el('div', 'ch', t); if (ch) c.style.backgroundImage = 'url("' + ch + '?v=' + root.BZ_REV + '")';
        V.el('div', 'hpv', t, String(m.Player.Attributes.HealthMax || 0));
        V.el('div', 'nm', t).textContent = monTitle(m);
        t.title = monTitle(m) + ' — cấp ' + L;
        t.addEventListener('click', function () { sel[side] = m.Id; markSel(); if (AU) AU.play('ui.click'); });
        pk.cols[side].tiles[m.Id] = t;
      });
    });
  }
  function markSel() {
    pk.seed.value = cur ? cur.seed : 1;
    ['a', 'b'].forEach(function (side) {
      var P = pk.cols[side];
      Object.keys(P.tiles).forEach(function (id) { P.tiles[id].classList.toggle('sel', id === sel[side]); });
      var m = findMon(sel[side]); P.name.textContent = m ? monTitle(m) : '—';
      var t = P.tiles[sel[side]]; if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest' });
    });
  }

  // ---------- vòng lặp ----------
  var lastNow = 0;
  function loop(now) {
    var dt = lastNow ? now - lastNow : 16; lastNow = now;
    if (RP.loaded()) RP.step(dt, now);
    tickControls();
    requestAnimationFrame(loop);
  }

  // khung 2D (data/frames.js) có thể chưa có: nạp động, 404 thì dùng khung CSS
  function loadFrames(cb) {
    var done = false, fin = function () { if (done) return; done = true; cb && cb(); };
    if (root.BZ_FRAMES) { fin(); return; }
    var s = document.createElement('script');
    s.src = 'data/frames.js?v=' + root.BZ_REV;
    s.onload = function () { if (done) { if (root.BZ_FRAMES) relayout(); } else fin(); };
    s.onerror = function () { console.info('data/frames.js missing: using CSS frames'); fin(); };
    document.head.appendChild(s);
    setTimeout(fin, 2500); // mạng chậm: dựng bằng khung CSS trước, khung thật tới thì dựng lại
  }

  function keys() {
    root.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (pk && pk.el.classList.contains('open')) { if (e.key === 'Escape') { closePicker(); RP.pause(false); } return; }
      if (e.code === 'Space') { e.preventDefault(); if (RP.state().done) RP.restart(); else RP.pause(); }
      else if (e.key === '1' || e.key === '2' || e.key === '3') { RP.setSpeed(+e.key); RP.pause(false); }
      else if (e.key === 'End') RP.skip();
      else if (e.key === 'r' || e.key === 'R') RP.restart();
      else if (e.key === 'm' || e.key === 'M') { AU.toggleMute(); refreshControls(); }
    });
  }

  function start() {
    buildMonsters();
    var host = document.getElementById('bz-root');
    V.build(host);
    root.BZFX.init(V.refs.fx);
    V.fit();
    buildControls();
    bindHover();
    keys();
    loadFrames(function () { begin(); });
    requestAnimationFrame(loop);
  }
  function begin() {
    var q = new URLSearchParams(root.location.search);
    var a = q.get('a'), b = q.get('b'), seed = q.get('seed'), sp = +q.get('speed');
    if (!(a && b && findMon(a) && findMon(b))) { var r = randomFair(); a = a && findMon(a) ? a : r.a; b = b && findMon(b) ? b : r.b; seed = seed || r.seed; }
    fight(a, b, seed == null ? 1 : +seed);
    if (sp >= 1 && sp <= 3) RP.setSpeed(sp);
    if (AU) AU.preload(['ui.hover', 'ui.click', 'card.raise', 'card.lower', 'board.crit', 'board.tickBurn', 'board.tickPoison', 'board.tickRegen', 'combat.general_shot',
      'combat.general_impact', 'combat.heal_shot', 'combat.shield_shot', 'combat.shield_impact', 'combat.hitStun', 'combat.fireball_shot', 'combat.poison_shot']);
    root.BZ_READY = true;
  }

  root.BZ_DEBUG = {
    fight: function (m0, m1, seed) { return fight(m0, m1, seed, true); },
    seek: function (ms) { RP.seek(ms); return RP.state().t; },
    speed: function (x) { RP.setSpeed(x); RP.pause(false); return x; },
    pause: function (on) { RP.pause(on); },
    state: function () {
      var S = RP.state(); if (!S) return null;
      return { t: S.t, endMs: S.endMs, duration: S.duration, winner: S.res.winner, speed: S.speed, paused: S.paused, done: S.done, seed: cur.seed, a: cur.a, b: cur.b,
        fx: Object.assign({}, root.BZFX.stats), dispatched: RP.stats.dispatched, byType: Object.assign({}, RP.stats.byType), frames: !!root.BZ_FRAMES,
        cards: Object.keys(cur.info.cards).length, audio: AU ? Object.assign({}, AU.stats) : null };
    },
    events: function () { var S = RP.state(); return S ? S.evs.map(function (e) { return { type: e.type, kind: e.kind, src: e.src, target: e.target, amt: e.amt, t: e.t }; }) : []; },
    // bàn sim tuỳ ý (test/bazaar-capture.js): b0 = bàn dưới, b1 = bàn trên, dạng {name, healthMax, level, cards:[{uid,id,tier,ench,socket,size,section,attrs}], attrs};
    // opts.mon = [id quái làm chân dung dưới, id quái làm chân dung trên]
    fightBoards: function (b0, b1, seed, opts) {
      opts = opts || {};
      var mon = opts.mon || [], A = findMon(mon[0]) || MON[0], B = findMon(mon[1]) || MON[1] || MON[0];
      return fightWith(A, B, seed, true, [b0, b1]);
    },
    perf: function () { return RP.perf(); },
    resetPerf: function () { RP.resetPerf(); },
    hover: function (uid) { var el = V.cardEl(uid); if (!el) return false; var r = el.getBoundingClientRect(); setHovered(el, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 3 }); return true; },
    cardUids: function () { return Object.keys(V.cards()); },
    monsters: function () { return MON.map(function (m) { return { id: m.Id, name: monTitle(m), level: monLevel(m) }; }); }
  };

  // khởi động do js/ui/core.js gọi khi URL có ?view hoặc ?a&b (trang xem trận / Đấu thử)
  root.BZViewer = { start: start };
})(window);
