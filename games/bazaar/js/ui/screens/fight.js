/* Chợ Phiên — trước trận (phase 'fight') và sau trận (phase 'fightResult').
   Trước trận: đối thủ hiện ở nửa trên (chân dung, thanh máu, bàn thẻ) như lúc đánh; PvP: thẻ bóng ma hiện giữa dải trên (tên, hero,
   số trận thắng) giữ tới khi người chơi bấm rồi chớp sang màn VS (ref pvp-vs: "ghost card in the lane ... then VS", FLOW-11, W-07).
   Nút "Chiến đấu!" nằm ở ô góc phải trên (chỗ phần thưởng / đặt cược), không che hàng thẻ của người chơi (FLOW-18).
   Bấm "Chiến đấu!" → lệnh fight (reducer chạy trận ngay) → màn kết quả phát lại trận đó trên sân (BZUI.combat), xong thì hiện
   bảng kết quả: thắng/thua, vàng + XP (PvE), +1 ô chiến thắng hoặc mất uy tín (PvP). "Tiếp tục" → lệnh next
   (ANIM: vàng bay về túi, XP, cung chiến thắng, thanh vương miện; sau đó chọn loot nếu thắng quái). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };

  // Tự bắt đầu trận ~3 s sau khi vào cảnh (REF-run-flow fight-start: tiếng đầu tiên ~3000 ms sau lúc chọn); nút vẫn là "bắt đầu ngay".
  // Pha 4: pha fight nhận move/swap (xếp lại sau khi xem bàn đối thủ). Người chơi chạm vào bàn (kéo / xếp) thì thôi tự đánh: trận chỉ
  // bắt đầu khi bấm "Chiến đấu!" (hoặc Enter). Điện thoại: chờ 6 s (MOBILE-22); bảng tạm nghỉ / hộp xác nhận / máy dọc: hoãn.
  var AUTO_MS = 3000, AUTO_TOUCH_MS = 6000, autoT = 0, manual = false;
  function coarse() { try { return root.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  function armAuto(ms) {
    clearTimeout(autoT);
    if (manual) return;
    autoT = setTimeout(function () {
      autoT = 0; var r = U.state && U.state.run;
      if (manual || !r || !r.phase || r.phase.kind !== 'fight') return;
      if ((U.drag && U.drag.active()) || (U.menu && U.menu.panelOpen()) || U.confirmBox || (U.portrait && U.portrait())) { armAuto(800); return; }
      U.dispatch({ t: 'fight' });
    }, ms);
  }
  function goManual() {
    if (manual) return;
    manual = true; clearTimeout(autoT); autoT = 0;
    var h = document.querySelector('.rs-fightnote'); if (h) h.textContent = 'Xếp xong thì bấm Chiến đấu!';
  }
  // thẻ bóng ma giữa dải trên (pvp-vs: tên + hero + số thắng), trước màn VS
  function ghostCard(run, opp) {
    var H = U.HEROES[opp.hero] || {}, art = U.combat.opponentArt(opp), HH = root.BZ_HEROES && root.BZ_HEROES.heroes;
    var g = U.el('div', 'rs-ghostpick', U.top.layer(),
      '<div class="pf"><i></i></div><b></b><small></small><div class="bars"><i class="hp"></i><i class="wn"></i></div><em class="tap">Bấm để vào trận</em>');
    g.querySelector('.pf i').style.backgroundImage = U.bg(art.char || H.portrait || art.bg);
    g.querySelector('b').textContent = String(opp.name || '').replace(/^Ghost of /, '');
    g.querySelector('small').textContent = (opp.hero ? ((HH && HH[opp.hero] && HH[opp.hero].title) || opp.hero) + ' · ' : '') + (opp.wins || 0) + ' thắng · cấp ' + ((opp.board && opp.board.level) || 1);
    g.querySelector('.hp').style.setProperty('--f', Math.min(1, ((opp.board && opp.board.healthMax) || 0) / Math.max(1, run.healthMax * 1.5)).toFixed(2));
    g.querySelector('.wn').style.setProperty('--f', Math.min(1, (opp.wins || 0) / 10).toFixed(2));
    U.sfx('board.portraitAppear', { vol: 0.7 });
    return g;
  }
  // ---------- màn VS (UI-11 / ASSET-25) ----------
  // Thay T.vsScreen của js/ui/transitions.js (file đó thuộc nhánh khác; fight.js nạp sau nên ghi đè được): bảng tên dùng sprite gốc
  // (Btn_Tab_Frame_TUI làm nền tối viền vàng, Gem_256_* làm huy hiệu bậc), tên bậc nằm trên tên người chơi như clip pvp-vs/25.jpg
  // ("GRAND FOUNDER / Tate"), xoáy vàng quay sau hai thanh kiếm, chớp trắng rồi VS. Bậc lấy từ số thắng / uy tín (U.rankTitle ở menu.js).
  var TV = U.transitions, vsS = null;
  var GEMS = ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Diamond', 'Legendary'];
  function vsSwords() {
    return '<svg viewBox="0 0 240 240"><g fill="none" stroke="#ffd36b" stroke-width="3"><path d="M120 6 226 70 226 170 120 234 14 170 14 70z"/><path d="M120 26 208 78 208 162 120 214 32 162 32 78z" opacity=".6"/></g>' +
      '<g fill="#fff" stroke="#fff3c8" stroke-width="2"><path d="M42 48C100 88 152 140 198 190L186 198C140 160 88 122 38 66z"/><path d="M198 48C140 88 88 140 42 190L54 198C100 160 152 122 202 66z"/></g></svg>';
  }
  function vsEdge(cls) {
    return '<svg class="edge ' + cls + '" viewBox="0 0 240 1080" preserveAspectRatio="none"><g fill="none" stroke="#ffd36b" stroke-width="3" opacity=".85">' +
      '<path d="M30 110 130 30 130 330 30 410 30 640 130 720 130 1050"/><path d="M60 130 160 50 160 330 60 410 60 640 160 720 160 1030" opacity=".5"/></g></svg>';
  }
  function plateHtml(side) { return '<div class="plate ' + side + '"><i class="crest"></i><small></small><b></b><em></em></div>'; }
  function fillPlate(el, side, rank, name, line) {
    var p = el.querySelector('.plate.' + side);
    p.querySelector('small').textContent = U.rankTitle(rank.wins, rank.prestige);
    p.querySelector('b').textContent = name;
    p.querySelector('em').textContent = line;
    p.querySelector('.crest').style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/Gem_256_' + GEMS[U.rankIndex(rank.wins, rank.prestige)] + '_TUI.webp');
    if (name.length > 14) p.querySelector('b').classList.add('long');
  }
  TV.vsScreen = function (run, opp, done) {
    TV.cancelVs();
    var st = V().refs.stage, M = U.HEROES[run.hero] || {}, art = U.combat.opponentArt(opp), HH = root.BZ_HEROES && root.BZ_HEROES.heroes;
    var el = U.el('div', 'rs-vs', st,
      '<div class="sky"></div><div class="shade"></div><div class="swirl"></div>' + vsEdge('l') + vsEdge('r') +
      '<div class="side l"><div class="img"></div></div><div class="side r"><div class="img"></div></div>' + plateHtml('l') + plateHtml('r') +
      '<div class="mid">' + vsSwords() + '<span>VS</span></div><div class="flash"></div><small class="skip">Bấm (hoặc Space) để bỏ qua</small>');
    el.querySelector('.sky').style.backgroundImage = U.bg('art/ui/herosel_bg.webp');
    el.querySelector('.side.l .img').style.backgroundImage = U.bg(M.store || M.portrait);
    el.querySelector('.side.r .img').style.backgroundImage = U.bg(art.store || art.char || art.bg);
    if (art.hero) el.querySelector('.side.r').classList.add('hero');
    var htitle = function (h) { return (HH && HH[h] && HH[h].title) || h; };
    fillPlate(el, 'l', { wins: run.wins, prestige: run.prestige }, htitle(run.hero), 'Ngày ' + run.day + ' · ' + run.wins + ' thắng');
    fillPlate(el, 'r', { wins: opp.wins || 0, prestige: 0 }, U.oppName(opp), (opp.hero ? htitle(opp.hero) + ' · ' : 'Bóng ma · ') + (opp.wins || 0) + ' thắng');
    var S = vsS = { el: el, ids: [], done: false, cb: done };
    TV.vsScreens++;
    U.sfx('trans.pvp');
    var fin = function () {
      if (!vsS || S.done) return;
      S.done = true;
      var cb = S.cb; el.classList.add('out');
      S.ids.push(setTimeout(function () { TV.cancelVs(); if (cb) cb(); }, 260));
    };
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) { e.stopPropagation(); fin(); });
    S.ids.push(setTimeout(function () { if (vsS === S && !S.done) { el.classList.add('show'); U.sfx('trans.pvpSwords', { vol: 0.7 }); } }, TV.VS.flash * 0.6));
    S.ids.push(setTimeout(fin, TV.VS.flash + TV.VS.hold));
    return true;
  };
  TV.cancelVs = function () {
    if (!vsS) return;
    vsS.ids.forEach(clearTimeout);
    if (vsS.el.parentNode) vsS.el.parentNode.removeChild(vsS.el);
    vsS = null;
  };
  TV.vsActive = function () { return !!vsS; };

  // ---------- màn Số phận (UI-05 / ASSET-24) ----------
  // Thay màn dùng chung với lên cấp trong js/ui/screens/event.js (không sửa file đó; nạp sau nên ghi đè được). Vẽ THEO DỮ LIỆU: mỗi phần tử
  // của phase.choices thành một quả cầu tím, tên + mô tả lấy từ c.name / c.desc, không có tên cứng. Không thẻ ngày chặn đầu màn: thẻ ngày
  // do anim.js dựng khi sang ngày mới bị gỡ ngay lúc vào màn. Clip PSP75k4R4Pk ?t=83 và wiki fates-crossroads-1.png: chân dung thầy bói
  // trên dải trên, ba cầu tím dưới, bảng giải thích hai tầng, lưới chỉ hồng phủ sân.
  var FATE_TELLER = 'art/encounters/Event_Statia_QuestData_char.webp'; // thẻ Futura (Fates) trỏ tới art của encounter Statia (cards.json ArtKey, tools/uiextra.py)
  var fateEls = null;
  function threadsSvg() {
    // lưới chỉ: các đoạn cong toả từ vài nút, sinh theo hạt cố định để lần nào cũng như nhau
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var nodes = [], i, d = '', dots = '';
    for (i = 0; i < 9; i++) nodes.push([rnd() * 1920, rnd() * 1080]);
    nodes.forEach(function (a, k) {
      var b = nodes[(k + 1 + Math.floor(rnd() * 3)) % nodes.length], c = nodes[(k + 4) % nodes.length];
      d += '<path d="M' + a[0].toFixed(0) + ' ' + a[1].toFixed(0) + ' Q' + ((a[0] + b[0]) / 2 + (rnd() - .5) * 240).toFixed(0) + ' ' + ((a[1] + b[1]) / 2 + (rnd() - .5) * 240).toFixed(0) + ' ' + b[0].toFixed(0) + ' ' + b[1].toFixed(0) + '"/>' +
        '<path d="M' + a[0].toFixed(0) + ' ' + a[1].toFixed(0) + ' L' + c[0].toFixed(0) + ' ' + c[1].toFixed(0) + '" opacity=".5"/>';
      dots += '<circle cx="' + a[0].toFixed(0) + '" cy="' + a[1].toFixed(0) + '" r="5"/>';
    });
    return '<svg viewBox="0 0 1920 1080" preserveAspectRatio="none"><g fill="none" stroke="#ff9a6a" stroke-width="2">' + d + '</g><g fill="#ffd2b0">' + dots + '</g></svg>';
  }
  function fateClear() {
    if (fateEls) { fateEls.forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e); }); fateEls = null; }
  }
  U.SCREENS.fates = {
    enter: function (run) {
      U.top.base(run, {});
      var killDay = function () { if (U.state.screen === 'fates' && TV.dayActive()) TV.cancelDay(false); };
      killDay(); this._dayT = [setTimeout(killDay, 60), setTimeout(killDay, 400), setTimeout(killDay, 1200)];
      var veil = U.el('div', 'rs-fate-veil'); veil.innerHTML = threadsSvg();
      V().refs.world.insertBefore(veil, V().refs.runSockets);
      fateEls = [veil];
      U.sfx('trans.defeatIn', { vol: 0.5 });
      setTimeout(function () { if (U.hud && U.hud.refillCrown) U.hud.refillCrown(); }, 500);
    },
    render: function (run) {
      var ph = run.phase, ch = ph.choices || [];
      U.cards.render(run);
      var key = ph.kind + ':' + (ph.level || 0) + ':' + JSON.stringify(ch);
      if (key === this._key && U.top.layer().children.length) return;
      this._key = key;
      U.top.clear();
      var lay = U.top.layer();
      // chân dung thầy bói (khung gặp gỡ Huyền thoại) ở giữa dải trên
      var pt = U.top.frames([{ type: 'event', id: 'Fates', name: 'Thầy bói Số phận', tier: 'Legendary', desc: '' }], function () {}, { dy: -140, pennant: function () { return 'pedestal'; } })[0];
      pt.classList.add('rs-fate-teller'); pt.style.pointerEvents = 'none';
      var bgEl = pt.querySelector('.win .bg'), chEl = pt.querySelector('.win .ch');
      if (bgEl) bgEl.style.backgroundImage = U.bg(FATE_TELLER);
      if (chEl) chEl.style.display = 'none';
      var row = U.el('div', 'rs-fate-orbs', lay);
      ch.forEach(function (c, i) {
        var o = U.el('button', 'rs-fate-orb', row); o.type = 'button'; o.dataset.i = i;
        o.style.animationDelay = (i * 140) + 'ms'; o.style.setProperty('--ph', (i * 1.3) + 's');
        o.setAttribute('aria-label', c.name || 'Số phận');
        U.el('i', 'halo', o); U.el('i', 'core', o);
        var ico = U.el('i', 'ico', o), fa = U.top.artOf(c).bg; // ảnh theo id: bounty / crossroads / legacy / fortunes (W-04)
        if (fa) { ico.style.backgroundImage = U.bg(fa); ico.dataset.fate = c.id; }
        U.el('i', 'spark', o);
        function show(touch) {
          var r = U.rectOf(o);
          U.panelTip(r, U.esc(c.name || 'Số phận'), (root.BZTooltip.format(c.desc || '').html) + (touch ? '<br><span class="o">Chạm lần nữa để chọn</span>' : ''));
        }
        var lastPt = 'mouse';
        o.addEventListener('pointerdown', function (e) { lastPt = e.pointerType; });
        o.addEventListener('pointerenter', function (e) { if (e.pointerType === 'touch') return; U.sfx('ui.hover', { vol: 0.5 }); show(false); });
        o.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') U.panelTip(null); });
        o.addEventListener('click', function () {
          if (U.state.busy) return;
          if (lastPt === 'touch' && !o.classList.contains('armed')) {
            Array.prototype.forEach.call(row.querySelectorAll('.rs-fate-orb.armed'), function (b) { b.classList.remove('armed'); });
            o.classList.add('armed'); show(true); return;
          }
          U.panelTip(null); U.sfx('spell.select'); o.classList.add('chosen');
          U.dispatch({ t: 'choose', i: i }, { fromRect: U.rectOf(o) });
        });
      });
    },
    boardFull: function () {
      if (!U.top.layer().querySelector('.rs-hint')) U.top.layer().appendChild(U.el('div', 'rs-hint', null, ''));
      U.boardFullHint();
    },
    exit: function () { this._key = null; (this._dayT || []).forEach(clearTimeout); fateClear(); U.panelTip(null); U.top.clear(); }
  };

  U.SCREENS.fight = {
    enter: function (run, prev) {
      var ph = run.phase, opp = ph.opponent, b = opp.board;
      U.top.base(run, { hero: true, hp: true, sides: true, board: true });
      if (U.preloadCombat) U.preloadCombat(run);
      var skills = b.cards.filter(function (c) { return c.section === 'skills'; }).map(function (c) { return { uid: 'ops' + c.uid, id: c.id, tier: c.tier, art: U.art(c.id) }; });
      manual = false;
      var oart = U.combat.opponentArt(opp), oname = U.oppName(opp);
      var kick = ph.combatType === 'PVP' ? (opp.source === 'dataset' && opp.hero ? 'Bóng ma · ' + ((root.BZ_HEROES && root.BZ_HEROES.heroes[opp.hero] || {}).title || opp.hero) + (opp.wins ? ' · ' + opp.wins + ' thắng' : '') : 'Đấu người chơi (bóng)') : 'Quái vật';
      var side = U.top.portrait(oname, opp.tier || 'Silver', oart, U.top.nameBlock(kick, oname, b.healthMax + ' máu'),
        { hpMax: b.healthMax, skills: skills, level: b.level || 1 });
      var h1 = V().hero(1); if (h1) h1.art.classList.toggle('hero-art', !!oart.hero);
      var rw = opp.rewards || {};
      if (ph.combatType === 'PVE') {
        side.r.innerHTML = '<div class="rs-side-name"><small>Phần thưởng</small></div><div class="rs-rw"><i style="background-image:' + U.bg(U.ICON.coin) + '"></i><b>' + (rw.gold || 0) +
          '</b><i style="background-image:' + U.bg(U.ICON.xp) + '"></i><b class="xp">' + (rw.xp || 0) + '</b></div>';
      } else {
        side.r.innerHTML = '<div class="rs-side-name"><small>Đặt cược</small></div><div class="rs-side-note">Thắng: +1 chiến thắng<br>Thua: −' + run.day + ' uy tín</div>';
      }
      var list = b.cards.filter(function (c) { return c.section === 'hand'; }).map(function (c, i) {
        return { key: 'opp:' + c.uid, card: { id: c.id, tier: c.tier, ench: c.ench }, kind: 'preview', i: i };
      });
      var els = U.cards.setTop(list, { gap: 0 });
      var go = U.el('div', 'rs-fightgo', side.r);
      U.bigButton(go, 'red', 'Chiến đấu!', 'Bắt đầu ngay (Enter) — tự bắt đầu sau vài giây nếu không xếp lại bàn', function () { clearTimeout(autoT); U.dispatch({ t: 'fight' }); }).classList.add('play');
      var note = U.el('div', 'rs-fightnote', side.r, coarse() ? 'Kéo đồ để xếp lại' : 'Kéo đồ để xếp lại · Enter đánh ngay');
      var autoMs = coarse() ? AUTO_TOUCH_MS : AUTO_MS;
      if (ph.combatType === 'PVP') {
        // thẻ bóng ma 1,2 s → chớp trắng → VS → thẻ của bóng úp rồi lật (clip https://youtu.be/wUzq6Q4u9Jc?t=702 .. ?t=710)
        go.classList.add('wait'); note.classList.add('wait');
        U.transitions.facedown(els);
        // thẻ bóng ma giữ nguyên tới khi người chơi bấm (FLOW-11, W-07: bản gốc chờ cú bấm ở giờ 5 rồi mới sang VS); Enter / Space cũng được
        var gc = ghostCard(run, opp), self = this;
        this._ghostGo = function () {
          if (!self._ghostGo) return;
          self._ghostGo = null; gc.classList.add('out');
          U.transitions.vsScreen(run, opp, function () {
            if (gc.parentNode) gc.remove();
            U.heroVo('pvpintro');
            U.transitions.flipAll(els, function () { go.classList.remove('wait'); note.classList.remove('wait'); armAuto(autoMs); });
          });
        };
        gc.addEventListener('click', function () { U.sfx('board.encounterClick'); if (self._ghostGo) self._ghostGo(); });
      } else {
        U.sfx('trans.pvpSwords', { vol: 0.6 });
        armAuto(autoMs);
        U.sfx('vo.monster.' + String(opp.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''), { gap: 3000, vol: 0.8 });
      }
    },
    render: function (run) { U.cards.render(run); },
    exit: function () { clearTimeout(autoT); autoT = 0; this._ghostGo = null; U.transitions.cancelVs(); U.top.clear(); },
    canDrag: function (el) { if (el._rs.kind !== 'own') return false; goManual(); return true; },
    onCardClick: function (el) { if (el._rs.kind === 'own') goManual(); return false; },
    key: function (e) {
      if ((e.key === 'Enter' || e.code === 'Space') && this._ghostGo) { this._ghostGo(); return true; }
      if (e.key === 'Enter') { var g = document.querySelector('.rs-fightgo'); if (g && g.classList.contains('wait')) return true; clearTimeout(autoT); U.dispatch({ t: 'fight' }); return true; }
    }
  };

  var panel = null, panelT = 0;
  // Kết quả (clip fight-result): băng-rôn "Victory!" do trang xem trận vẽ và đã rời màn khi phát lại báo xong (replay END_HOLD), nên
  // Continue hiện NGAY (VFX-15, INTERACT-23: trước đây chờ thêm 2 s tĩnh). Ô góc phải trên (chỗ phần thưởng của đối thủ) đổi thành
  // nút Continue + hai biểu tượng (xem lại, chi tiết). Không còn hộp giữa màn.
  function resultText(run) {
    var ph = run.phase, won = ph.won, pvp = ph.combatType === 'PVP';
    if (pvp) return won ? '+1 chiến thắng (' + (run.wins + 1) + '/10)' : '−' + run.day + ' uy tín (còn ' + Math.max(0, run.prestige - run.day) + ')';
    if (won) return '+' + (ph.rewards.gold || 0) + ' vàng · +' + (ph.rewards.xp || 0) + ' XP · 1 món của quái';
    return 'Thua quái không mất gì. Xếp lại bàn rồi đi tiếp.';
  }
  function showResult(run, live) {
    var ph = run.phase, won = ph.won, pvp = ph.combatType === 'PVP';
    if (panel) panel.remove();
    clearTimeout(panelT);
    var S = V().refs.sides[1], h = won ? 'Chiến thắng' : (ph.winner === 'draw' ? 'Hết giờ — thua' : 'Thất bại');
    S.r.innerHTML = ''; // ô phải của đối thủ chỉ còn Continue + 2 biểu tượng (clip)
    panel = U.el('div', 'rs-result ' + (won ? 'win' : 'lose'), S.r);
    panel.innerHTML = '<div class="ic"></div><div class="go"></div>';
    var ic = panel.querySelector('.ic'), go = panel.querySelector('.go');
    U.button(ic, 'sq', '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>', 'Xem lại trận', function () {
      var p = panel; panel = null; if (p) p.remove(); U.panelTip(null);
      if (live) U.combat.restart(); else startReplay(U.state.run);
    });
    var det = U.button(ic, 'sq', '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>', 'Chi tiết kết quả', function () {
      // bấm / chạm: bật tắt bảng chi tiết (MOBILE-6: trước đây chỉ hiện lúc rê chuột, chạm thì loé rồi tắt)
      if (V().refs.tip2.classList.contains('show') && det._open) { det._open = false; U.panelTip(null); } else { det._open = true; openDet(); }
    });
    det.classList.add('rs-tipsrc');
    function openDet() {
      var b = det.getBoundingClientRect(), q = V().toStage(b.left, b.top);
      U.panelTip({ x: q.x, y: q.y, w: b.width / V().scale, h: b.height / V().scale }, h, U.esc(U.oppName(ph.opponent)) + ' · ' + (ph.endMs / 1000).toFixed(1) + ' giây<br>' + resultText(run));
    }
    det.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') openDet(); });
    det.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') { det._open = false; U.panelTip(null); } });
    U.bigButton(go, 'blue', 'Tiếp tục', 'Nhận kết quả, đi tiếp (Enter)', function () { U.dispatch({ t: 'next' }); }).classList.add('play');
    if (live) U.heroVo(pvp ? (won ? 'pvpvictory' : 'pvpdefeat') : (won ? 'pvevictory' : 'pvedefeat'));
  }
  function startReplay(run) {
    U.top.clear();
    U.combat.start(run, function () { showResult(U.state.run, true); });
  }
  U.SCREENS.fightResult = {
    enter: function (run, prev) {
      U.top.base(run, { hero: true, hp: true, sides: true, board: true });
      if (prev && prev.phase.kind === 'fight') startReplay(run);
      else {
        // nạp lại giữa chừng: không tự phát; hiện bàn + máu của đối thủ như lúc vào trận, bảng kết quả, nút xem lại (INTERACT-24)
        var ph = run.phase, opp = ph.opponent, ob = (ph.boards && ph.boards[1]) || { cards: [], healthMax: 0 };
        var skills = (ob.cards || []).filter(function (c) { return c.section === 'skills'; }).map(function (c) { return { uid: 'ops' + c.uid, id: c.id, tier: c.tier, art: U.art(c.id) }; });
        U.top.portrait(U.oppName(opp), 'Silver', U.combat.opponentArt(opp), U.top.nameBlock('Vừa đấu', U.oppName(opp), (ph.won ? 'Bạn thắng' : 'Bạn thua') + ' · ' + (ph.endMs / 1000).toFixed(1) + ' giây'),
          { hpMax: ob.healthMax || 0, skills: skills, level: ob.level || 1 });
        if (ob.healthMax) V().updateHero(1, { health: ph.won ? 0 : ob.healthMax, healthMax: ob.healthMax }, U.now());
        U.cards.setTop((ob.cards || []).filter(function (c) { return c.section === 'hand'; }).map(function (c, i) {
          return { key: 'opp:' + c.uid, card: { id: c.id, tier: c.tier, ench: c.ench }, kind: 'preview', i: i };
        }), { gap: 0 });
        showResult(run, false);
      }
    },
    render: function (run) { if (!U.combat.active()) U.cards.render(run); },
    canDrag: function () { return false; },
    exit: function () {
      clearTimeout(panelT); if (panel) { panel.remove(); panel = null; }
      U.combat.stop();
      U.musicKey = null; // trận đổi nhạc: màn sau đặt lại nhạc của hero
    },
    key: function (e) {
      if (e.key === 'End' && U.combat.active()) { U.combat.skip(); return true; }
      if (e.key === 'Enter' && panel) { U.dispatch({ t: 'next' }); return true; }
    }
  };
})(window);
