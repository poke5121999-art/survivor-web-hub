/* Chợ Phiên — lõi giao diện vòng chơi (pha 2b). Mọi thay đổi trạng thái đi qua BZRun.apply(run, cmd): giao diện chỉ vẽ `run`
   rồi diễn hoạt `events`. Hai sổ đăng ký:
   - SCREENS[kind] = {enter(run, prev), render(run), exit(next)} — một màn cho mỗi run.phase.kind (+ 'title' ngoài run);
   - ANIM[event.type](e, ctx) — diễn một sự kiện của reducer (vàng bay, thẻ lật, lên cấp...). Loại lạ: bỏ qua.
   Lưu run vào localStorage sau MỖI lệnh (try/catch: không có bộ nhớ vẫn chơi được), nạp lại thì chơi tiếp đúng chỗ.
   Móc kiểm thử: window.BZ_DEBUG = {run, cmd, legal, serialize, screen, ...} (test/bazaar-play.js). */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var R = function () { return root.BZRun; }, V = function () { return root.BZView; }, AU = function () { return root.BZAudio; };
  U.SCREENS = U.SCREENS || {}; U.ANIM = U.ANIM || {};
  U.LS_RUN = 'bz.run.v1';
  var S = U.state = { screen: null, run: null, busy: false, log: [] };

  // ---------- tiện ích ----------
  U.REV = function () { return '?v=' + (root.BZ_REV || ''); };
  U.url = function (p) { return p ? (/^data:/.test(p) ? p : p + U.REV()) : ''; };
  U.bg = function (p) { return p ? "url('" + U.url(p) + "')" : ''; }; // nháy đơn: dùng được cả trong style="..." của chuỗi HTML
  U.el = function (tag, cls, parent, html) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e;
  };
  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // id thẻ đã xong quest `<id>~q0.0` (BZRun.questTplId) dùng art / tên của thẻ gốc
  U.baseId = function (id) { return R() && R().baseId ? R().baseId(id) : String(id || ''); };
  U.art = function (key) { var m = root.BZ_ARTMAP || (root.BZ_ART && root.BZ_ART.map); if (!m || !key) return null; return m[key] || m[U.baseId(key)] || null; };
  U.sfx = function (key, o) { var A = AU(); if (A) return A.play(key, o); return false; };
  U.TIER_VI = { Bronze: 'Đồng', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương', Legendary: 'Huyền thoại' };
  U.UI = 'art/ui/';
  U.ICON = {
    coin: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2214%22 fill=%22%23f5c518%22 stroke=%22%237a4a00%22 stroke-width=%222.5%22/%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2210.5%22 fill=%22none%22 stroke=%22%23fff3a0%22 stroke-width=%221.4%22 opacity=%22.8%22/%3E%3Cpath d=%22M16 7.5l6.2 8.5-6.2 8.5-6.2-8.5z%22 fill=%22%237a4a00%22/%3E%3Cpath d=%22M16 11l3.6 5-3.6 5-3.6-5z%22 fill=%22%23ffe36d%22/%3E%3C/svg%3E', // đồng xu kim cương (Icon_Tooltip_Coins_TUI chưa bóc) [ĐỀ XUẤT]
    coinBag: 'art/ui/ui_sprite_atlas/Icon_Stat_Coins_TUI.webp', xp: 'art/ui/ui_sprite_atlas/Icon_Stat_XP_TUI.webp',
    health: 'art/ui/ui_sprite_atlas/Icon_Stat_Health_TUI.webp', prestige: 'art/ui/ui_sprite_atlas/Icon_Stat_Prestige_TUI.webp',
    coins: 'art/ui/ui_sprite_atlas/Tooltip_Reward_Icon_Coins_TUI.webp', xpBig: 'art/ui/ui_sprite_atlas/Tooltip_Reward_Icon_XP_TUI.webp',
    chest: 'art/ui/ui_sprite_atlas/Tooltip_Reward_Icon_Chest_TUI.webp', stash: 'art/encounters/Event_TreasureChest_QuestData_char.webp',
    prize: 'art/ui/purchases/Chest_Purchase_Artwork_1_TUI.webp', carpet: 'art/ui/ui_sprite_atlas/Tooltip_Reward_Icon_Carpet_TUI1.webp'
  };
  // Hero của sảnh (BZ_HEROES.order: 7 chơi được + The Dragons khoá). Tagline gốc tiếng Anh (WIKI §4: Mobalytics/Game8),
  // màu nhấn HeroColorSO (WIKI §2.4), mô tả tiếng Việt theo cơ chế riêng của hero (WIKI §3-4).
  U.HEROES = {
    Vanessa: { code: 'VAN', vo: 'vanessa', color: '#c02121', tag: 'Seafaring Rogue', portrait: 'art/heroes/skin_van_01/Skin_VAN_01a_Portrait.webp',
      store: 'art/heroes/skin_van_01/Skin_VAN_01a_StoreImage.webp', btn: 'art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/Btn_VAN_TUI.webp',
      desc: 'Nữ hải tặc sống bằng sát thương: dàn Vũ khí bắn liên hồi hoặc một khẩu súng thật lớn; khống chế đối thủ bằng Làm chậm, Độc và đồ dưới nước.' },
    Pygmalien: { code: 'PYG', vo: 'pygmalien', color: '#2767c0', tag: 'Entre-Pig-Neur', portrait: 'art/heroes/skin_pyg_01/Skin_PYG_01a_Portrait.webp',
      store: 'art/heroes/skin_pyg_01/Skin_PYG_01a_StoreImage.webp', btn: 'art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/Btn_PYG_TUI.webp',
      desc: 'Ông chủ heo trâu bò: Hồi máu và Khiên dày cộp, máu tối đa tăng dần; làm giàu bằng Thu nhập, Vàng và bất động sản.' },
    Dooley: { code: 'DOO', vo: 'dooley', color: '#e19a08', tag: 'Cute AI-Liberating Robot', portrait: 'art/heroes/skin_doo_01/Skin_DOO_01a_Portrait.webp',
      store: 'art/heroes/skin_doo_01/Skin_DOO_01a_StoreImage.webp', btn: 'art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/Btn_DOO_TUI.webp',
      desc: 'Robot nhỏ giải phóng AI: các Lõi tạo phản ứng dây chuyền, thẻ bên trái sạc cho thẻ bên phải; mạnh dần nhờ Bạn bè và Công nghệ.' },
    Mak: { code: 'MAK', vo: 'mak', color: '#bee65b', tag: 'Alchemical Immortalist', portrait: 'art/heroes/skin_mak_01/Skin_MAK_01a_Portrait.webp',
      store: 'art/heroes/skin_mak_01/Skin_MAK_01a_StoreImage.webp', btn: 'art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/Btn_MAK_TUI.webp',
      desc: 'Nhà giả kim bất tử: Thuốc và Nguyên liệu, Bỏng, Độc, Hồi phục; Chất xúc tác biến đổi nguyên liệu, thuốc ít đạn phải Nạp lại; đồ chơi gọi Bão cát sớm.' },
    Stelle: { code: 'STE', vo: 'stelle', color: '#ffeb18', tag: 'Bright Aeronaut', portrait: 'art/heroes/skin_ste_01/Skin_STE_01a_Portrait.webp',
      store: 'art/heroes/skin_ste_01/Skin_STE_01a_StoreImage_TUI.webp', btn: 'art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/Btn_STE_TUI.webp',
      desc: 'Nữ phi công rạng rỡ: phương tiện và đồ Bay. Món đang Bay chỉ chịu một nửa thời gian Làm chậm và Đóng băng.' },
    Jules: { code: 'JUL', vo: 'jules', color: '#b434ec', tag: 'Chef of the Deeps', portrait: 'art/heroes/skin_jul_01/Skin_JUL_01a_Portrait.webp',
      store: 'art/heroes/skin_jul_01/Skin_JUL_01a_StoreImage.webp', btn: 'art/ui/ui_buttons_assets_assets_thebazaar_art_ui_buttons_heroes/Btn_JUL_TUI.webp',
      desc: 'Đầu bếp dưới đáy biển: Đồ ăn tăng sức cho mình và hại đối thủ; ô bếp Nóng và Lạnh làm món đặt lên đó đổi tính.' },
    Karnok: { code: 'KAR', vo: 'karnok', color: '#3b889c', tag: 'Monstrous Hunter', portrait: 'art/heroes/skin_kar_01/Skin_KAR_01a_Portrait.webp',
      store: 'art/heroes/skin_kar_01/Skin_KAR_01a_StoreImage.webp', btn: null,
      desc: 'Thợ săn quái vật: mỗi lần dùng đồ tích Cuồng nộ, đủ 100 thì Nổi điên, xoá Làm chậm và Đóng băng, giảm 10% hồi chiêu trong 5 giây.' },
    TheDragons: { code: 'DRA', vo: 'dragons', color: '#9db7f3', tag: 'Roughtown Rockstars', portrait: 'art/heroes/skin_dra_01/Skin_DRA_01a_Portrait.webp',
      store: 'art/heroes/skin_dra_01/Skin_DRA_01a_StoreImage_TUI.webp', btn: null,
      desc: 'Ban nhạc rock của Roughtown: nhạc cụ, nốt C-G-A-B và tài nguyên Nhịp.' }
  };
  U.voOf = function (hero) { var h = U.HEROES[hero]; return h ? h.vo : String(hero || '').toLowerCase(); };
  U.heroVo = function (kind) { var r = S.run; if (!r || !r.hero) return false; return U.sfx('vo.' + U.voOf(r.hero) + '.' + kind, { gap: 2500 }); };
  U.now = function () { return performance.now(); };
  U.wait = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
  U.after = function (ms, fn) { return setTimeout(fn, ms); };
  U.fmtSec = function (ms) { var s = ms / 1000; return (Math.round(s * 10) / 10).toString(); };

  // nút có tiếng
  U.button = function (parent, cls, html, title, fn) {
    var b = U.el('button', 'rs-btn ' + (cls || ''), parent, html);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', function (e) { e.stopPropagation(); if (b.disabled) return; U.sfx('ui.click'); fn && fn(e); });
    b.addEventListener('pointerenter', function () { if (!b.disabled) U.sfx('ui.hover', { vol: 0.5 }); });
    return b;
  };

  // ---------- thông tin thẻ (thuộc tính đã tính + chữ tooltip) ----------
  var infoCache = { key: null, map: {} };
  function emptyBoard() { return { name: 'opp', healthMax: 100, cards: [] }; }
  // attrs của mọi thẻ người chơi trong MỘT trạng thái sim (aura giữa các thẻ tính đúng như lúc vào trận)
  U.boardInfo = function (run) {
    var key = run.uidN + ':' + JSON.stringify(run.board) + ':' + run.level + ':' + run.gold;
    if (infoCache.key === key) return infoCache.map;
    var BZ = root.BZSim, map = {};
    try {
      var boards = [R().playerBoard(run), emptyBoard()];
      var St = BZ.makeState({ boards: boards, seed: 1, sandstorm: false });
      BZ.initState(St);
      St.cards.forEach(function (C) {
        if (C.owner !== 0) return;
        var a = {}, k; for (k in C.attrs) a[k] = C.attrs[k]; for (k in C.rt) a[k] = C.rt[k];
        a.CooldownEffective = BZ.effCooldown(St, C);
        map[C.uid] = { attrs: a, boards: boards };
      });
    } catch (e) { console.warn('board info failed', e); }
    infoCache = { key: key, map: map };
    return map;
  };
  U.typeOf = function (tpl) { return tpl.Type || (tpl.$type === 'TCardSkill' ? 'Skill' : 'Item'); };
  // thẻ rời (hàng của thương nhân, loot): {id, tier, ench}
  var looseCache = {};
  U.looseAttrs = function (c) {
    var k = c.id + '|' + c.tier + '|' + (c.ench || '');
    if (looseCache[k]) return looseCache[k];
    var tpl = R().tpl(c.id), ci = { uid: 'x', id: c.id, tier: c.tier, ench: c.ench || null, socket: 0, size: R().isSkill(tpl) ? 1 : (R().SIZE[tpl.Size] || 1), section: R().isSkill(tpl) ? 'skills' : 'hand' };
    var a = {}; try { a = root.BZSim.attrs(ci, null); } catch (e) { a = {}; }
    looseCache[k] = a;
    return a;
  };
  // tooltip info cho BZTooltip.show
  U.tipInfo = function (c, attrs, boards, extra) {
    var BZ = root.BZSim, tpl = R().tpl(c.id); if (!tpl) return null;
    var ci = c.uid && boards ? R().simCard(c) : { uid: 'x', id: c.id, tier: c.tier, ench: c.ench || null, socket: 0, size: R().SIZE[tpl.Size] || 1, section: 'hand' };
    var lines = []; try { lines = BZ.cardText(ci, boards ? { boards: boards } : null); } catch (e) { lines = []; }
    var type = U.typeOf(tpl);
    var info = { name: R().title(tpl), tier: c.tier, size: tpl.Size, type: type, tags: tpl.Tags || [], lines: lines,
      cooldown: type === 'Skill' ? 0 : (attrs.CooldownEffective || 0), ammoMax: attrs.AmmoMax || 0, crit: attrs.CritChance || 0,
      multicast: attrs.Multicast || 1, ench: c.ench || null };
    if (extra) for (var k in extra) info[k] = extra[k];
    return info;
  };

  // ---------- lưu / nạp ----------
  U.save = function () {
    try {
      if (S.run && S.run.phase.kind !== 'end') root.localStorage.setItem(U.LS_RUN, R().serialize(S.run));
      else root.localStorage.removeItem(U.LS_RUN);
    } catch (e) { /* chế độ riêng tư / hết chỗ: chơi tiếp không lưu */ }
  };
  U.loadSaved = function () {
    try {
      var s = root.localStorage.getItem(U.LS_RUN);
      if (!s) return null;
      var run = R().deserialize(s);
      if (!run.phase || !R().PHASES[run.phase.kind]) return null;
      return run;
    } catch (e) { console.info('saved run ignored: ' + e.message); return null; }
  };
  U.clearSaved = function () { try { root.localStorage.removeItem(U.LS_RUN); } catch (e) { /* bỏ qua */ } };

  // ---------- màn ----------
  // go(name, prev): đổi màn (exit màn cũ, enter màn mới). name = phase.kind hoặc 'title'.
  U.go = function (name, prev) {
    var cur = S.screen && U.SCREENS[S.screen];
    if (cur && cur.exit) { try { cur.exit(name); } catch (e) { console.error(e); } }
    S.screen = name;
    if (U.transitions && (name === 'title' || name === 'heroSelect' || name === 'end')) U.transitions.cancel();
    var stg = V().refs.stage;
    stg.dataset.screen = name;
    var sc = U.SCREENS[name];
    if (!sc) { console.warn('screen "' + name + '" has no module'); return; }
    if (sc.enter) sc.enter(S.run, prev);
    if (sc.render) sc.render(S.run);
  };
  U.render = function () {
    var sc = U.SCREENS[S.screen];
    if (sc && sc.render) sc.render(S.run);
  };

  // ---------- lệnh ----------
  // dispatch(cmd, ctx) → {ok, reason}. ctx: gợi ý cho hoạt ảnh (dropAt: {x,y} toạ độ sân khấu nơi thả thẻ, from: rect nguồn...)
  // Lệnh có thể chia thẻ / dựng bàn đối thủ: chờ đủ thẻ mọi hero + bóng PvP (js/ui/loader.js)
  var GATED = { pick: 1, choose: 1, next: 1, leave: 1, reroll: 1 };
  function gate(run, cmd) {
    var D = U.data; if (!D) return null;
    if (cmd.t === 'pickHero' && !D.heroLoaded(cmd.hero)) return D.loadHero(cmd.hero);
    if (GATED[cmd.t] && !D.ready()) return D.loadAll(run.hero);
    return null;
  }
  U.dispatch = function (cmd, ctx) {
    var run = S.run;
    if (!run) return { ok: false, reason: 'no run' };
    var wait = gate(run, cmd);
    if (wait) {
      if (S.pending) return { ok: false, reason: 'loading', pending: true };
      S.pending = cmd;
      U.data.wait(wait, cmd.t === 'pickHero' ? 'Đang tải thẻ của ' + cmd.hero + '…' : 'Đang tải thẻ các hero…', function () {
        S.pending = null;
        if (S.run === run) U.dispatch(cmd, ctx);
      });
      return { ok: false, reason: 'loading', pending: true };
    }
    if (U.transitions && U.transitions.dayActive()) U.transitions.cancelDay(true); // lệnh mới = người chơi đã đi tiếp: bỏ thẻ ngày đang chạy (thẻ gốc kéo dài ~6 s)
    var r = R().apply(run, cmd);
    if (!r.ok) {
      var reason = r.events[0] && r.events[0].reason;
      S.log.push({ cmd: cmd, reason: reason });
      U.reject(reason, cmd);
      return { ok: false, reason: reason };
    }
    var prev = run;
    S.run = r.run;
    U.save();
    if (cmd.t === 'pickHero' && U.data) U.data.loadAll(cmd.hero); // các hero còn lại + bóng: nạp ngầm ngay khi run bắt đầu
    ctx = ctx || {};
    ctx.prev = prev; ctx.cmd = cmd; ctx.events = r.events;
    var pk = prev.phase.kind, nk = S.run.phase.kind;
    // trước khi vẽ: hoạt ảnh cần đọc vị trí cũ (thẻ hàng sắp mất, thẻ sắp bán)
    r.events.forEach(function (e) { var a = U.ANIM[e.type]; if (a && a.before) { try { a.before(e, ctx); } catch (err) { console.warn('ANIM.before ' + e.type, err); } } });
    if (pk !== nk) U.go(nk, prev); else U.render();
    if (U.hud) U.hud.update(S.run, ctx);
    var t = 0;
    r.events.forEach(function (e) {
      var a = U.ANIM[e.type];
      if (!a) return;
      var fn = typeof a === 'function' ? a : a.run; if (!fn) return;
      try { var d = fn(e, ctx, t); if (typeof d === 'number') t += d; } catch (err) { console.warn('ANIM ' + e.type, err); }
    });
    return { ok: true, events: r.events };
  };
  U.reject = function (reason, cmd) {
    reason = reason || '';
    if (/not enough gold/.test(reason)) { U.sfx('ui.noGold'); U.heroVo('nobuygold'); if (U.hud) U.hud.flashGold(); U.toast('Không đủ vàng'); }
    else if (/no space|locked or occupied/.test(reason)) { U.sfx('ui.noSpace'); if (/no space/.test(reason)) { U.heroVo('nobuyspace'); U.toast('Hết chỗ trống'); } }
    else if (/no rerolls/.test(reason)) { U.sfx('ui.noGold'); U.toast('Hết lượt đổi hàng'); }
    else U.sfx('ui.noSpace');
  };
  var toastT = null;
  U.toast = function (text) {
    var t = V().refs.toast; if (!t) return;
    t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1500);
  };

  // ---------- run mới / chơi tiếp ----------
  U.newRun = function (seed) {
    if (seed == null) { var q = +new URLSearchParams(root.location.search).get('seed'); seed = q > 0 ? q : 1 + Math.floor(Math.random() * 2147483000); }
    S.run = R().newRun({ seed: seed });
    U.save();
    U.go('heroSelect');
  };
  // chơi tiếp run đã lưu: nạp đủ thẻ trước (bàn đã đấu / bóng / hàng có thể là thẻ của hero khác), rồi đọc lại để
  // đăng ký mẫu thẻ đã xong quest (BZRun.deserialize)
  U.resume = function (run) {
    S.run = run;
    var go = function () { try { S.run = R().deserialize(R().serialize(S.run)); } catch (e) { console.warn(e); } U.go(S.run.phase.kind); };
    if (!U.data || U.data.ready()) { go(); return Promise.resolve(); }
    return U.data.wait(U.data.loadAll(run.hero), 'Đang tải thẻ…', go);
  };

  // ---------- vòng lặp ----------
  var last = 0;
  U.tickers = [];
  function loop(now) {
    var dt = last ? Math.min(100, now - last) : 16; last = now;
    if (U.combat && U.combat.active()) U.combat.step(dt, now);
    else {
      V().tick(now, dt);
      if (U.cards) U.cards.tick(now, dt);
      if (root.BZFX) root.BZFX.frame(now, dt);
    }
    for (var i = 0; i < U.tickers.length; i++) { try { U.tickers[i](now, dt); } catch (e) { /* bỏ qua một khung */ } }
    requestAnimationFrame(loop);
  }

  // ---------- khởi động ----------
  function loadFrames(cb) {
    var done = false, fin = function () { if (done) return; done = true; cb && cb(); };
    if (root.BZ_FRAMES) { fin(); return; }
    var s = document.createElement('script');
    s.src = 'data/frames.js?v=' + root.BZ_REV;
    s.onload = fin; s.onerror = function () { console.info('data/frames.js missing: using CSS frames'); fin(); };
    document.head.appendChild(s);
    setTimeout(fin, 2500);
  }
  function viewerMode() {
    var q = new URLSearchParams(root.location.search);
    return q.has('view') || (q.has('a') && q.has('b'));
  }
  U.start = function () {
    patchArt();
    // trang xem trận giữ BZ_DEBUG riêng của nó (test/bazaar-view.js); bàn quái chỉ cần thẻ chung nhưng bàn tuỳ ý có thể có thẻ hero
    if (viewerMode()) { (U.data ? U.data.loadAll(null, { ghosts: false }) : Promise.resolve()).then(function () { root.BZViewer.start(); }); return; }
    root.BZ_DEBUG = DEBUG;
    var host = document.getElementById('bz-root');
    V().build(host);
    root.BZFX.init(V().refs.fx);
    V().fit();
    var st = V().refs.stage;
    st.classList.add('m-run');
    V().refs.toast = U.el('div', 'rs-toast', st);
    if (U.layers) U.layers.build();
    if (U.hud) U.hud.build();
    if (U.cards) U.cards.build();
    if (U.drag) U.drag.build();
    loadFrames(function () {
      var saved = U.loadSaved(), q = new URLSearchParams(root.location.search);
      if (q.has('new')) saved = null;
      var fin = function () { root.BZ_READY = true; };
      if (saved && saved.phase.kind !== 'heroSelect') U.resume(saved).then(fin);
      else { U.go('title'); fin(); }
      if (AU()) AU().preload(['ui.hover', 'ui.click', 'card.raise', 'card.lower', 'card.pickup', 'card.land.player', 'card.land.storage', 'card.drop',
        'board.attrGold', 'board.reroll', 'board.encounterClick', 'board.portraitHover', 'board.levelUp', 'card.revealFlipBronze', 'board.stashFlip']);
    });
    requestAnimationFrame(loop);
    keys();
  };
  // art thẻ trong js/view/card.js tra BZ_ART theo id: id dẫn xuất của quest → id gốc
  function patchArt() {
    var C = root.BZCard; if (!C || C._baseArt) return;
    var orig = C.artSrc; C._baseArt = true;
    C.artSrc = function (id) { return orig(id) || orig(U.baseId(id)); };
  }
  function keys() {
    root.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if ((e.code === 'Space' || e.key === 'Enter' || e.key === 'Escape') && U.transitions && U.transitions.skipAny()) { e.preventDefault(); return; }
      var sc = U.SCREENS[S.screen];
      if (sc && sc.key && sc.key(e) === true) { e.preventDefault(); return; }
      if (e.code === 'Space' && S.run && U.cards && S.screen !== 'title' && S.screen !== 'heroSelect' && S.screen !== 'end') { e.preventDefault(); U.cards.toggleStash(); }
      else if (e.key === 'm' || e.key === 'M') { if (AU()) AU().toggleMute(); if (U.menu) U.menu.refreshSound(); }
    });
  }

  // ---------- móc kiểm thử ----------
  var DEBUG = {
    run: function () { return S.run ? JSON.parse(JSON.stringify(S.run)) : null; },
    cmd: function (c) { var r = U.dispatch(c); return { ok: r.ok, reason: r.reason || null, phase: S.run && S.run.phase.kind }; },
    legal: function () { return S.run ? R().legal(S.run) : []; },
    serialize: function () { return S.run ? R().serialize(S.run) : null; },
    saved: function () { try { return root.localStorage.getItem(U.LS_RUN); } catch (e) { return null; } },
    screen: function () { return S.screen; },
    rejects: function () { return S.log.slice(); },
    // toạ độ client (px của cửa sổ) để test kéo bằng chuột thật
    rect: function (sel) { var e = document.querySelector(sel); if (!e) return null; var b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; },
    socketRect: function (section, s) { return U.cards ? U.cards.socketClientRect(section, s) : null; },
    combat: function () { return U.combat ? U.combat.info() : null; },
    cardsReady: function () { return !!(U.data && U.data.ready()); },
    cardsProgress: function () { return U.data ? U.data.progress() : null; },
    pending: function () { return S.pending || null; },
    // nạp một trạng thái run tuỳ ý (test: rương, quest...) rồi vẽ màn của phase
    load: function (run) { var r = R().deserialize(JSON.parse(JSON.stringify(run))); S.run = r; U.save(); U.go(r.phase.kind); return r.phase.kind; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', U.start); else U.start();
})(window);
