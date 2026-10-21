/* Chợ Phiên — vùng trên của bàn trong run (chỗ của đối thủ lúc đánh): giấy bản đồ + ba khung gặp gỡ (hour0-day1-1.png),
   chân dung thương nhân / sự kiện / quái (khung encounter theo bậc, dựng bằng BZView.setupHero bên 1), hai ô cạnh trên.
   Khung gặp gỡ: mái vòm theo bậc (BZ_FRAMES.encounter), cờ đuôi én dưới chân theo loại (vàng = thương nhân, xanh ngọc "?" =
   sự kiện, đỏ kiếm chéo = quái — màu đo từ ảnh wiki, WIKI §1.3), xếp so le; rê chuột: nhấc + nhịp 1 → 1,01 mỗi giây
   (EncounterController.cs:1157-1170, VISUAL §1), chọn: EncounterPortrait_Selection_A 0,85 s. */
(function (root) {
  'use strict';
  var U = root.BZUI = root.BZUI || {};
  var V = function () { return root.BZView; }, R = function () { return root.BZRun; };
  var T = U.top = {};

  // mode({hero, hp, sides, board}) — bật/tắt phần bên trên của sân khấu
  T.mode = function (o) {
    var st = V().refs.stage;
    st.classList.toggle('top-hero', !!o.hero);
    st.classList.toggle('top-hp', !!o.hp);
    st.classList.toggle('top-sides', !!o.sides);
    st.classList.toggle('top-sides-r', o.sides === 'r'); // loot: chỉ ô phải (nút), bản gốc không có bảng tên bên trái
    st.classList.toggle('top-board', !!o.board);
    // màu dải trên theo loại màn (clip: thương nhân = dải tím, sự kiện = băng-rôn kem, loot/kho = khung vàng, bệ = ngọc lam)
    ['merchant', 'event', 'loot', 'pedestal'].forEach(function (k) { st.classList.toggle('lane-' + k, o.lane === k); });
    T.carpet(o.lane && o.lane !== 'loot' ? o.carpet : null);
  };
  // Thảm làn (CarpetController): mỗi thẻ gặp gỡ chọn một thảm Carpet_*_TD (data/carpets.js, tools/stall.py), trải từ giữa ra hai bên
  // sau revealUnrollDelay 1,0 s (BoardManager.cs:1711-1720). Gặp gỡ không có trong bảng: thảm Green_01, thảm dùng nhiều nhất
  // (70 thẻ, carpet_by_encounter.tsv) [ĐỀ XUẤT]. Bước nối (eventId null) giữ thảm của gặp gỡ cha. Loot giữ khung vàng neon.
  T.CARPET_DEFAULT = 'Carpet_Green_01';
  T.carpetName = function (id) { var M = root.BZ_CARPETS || {}; return (id && M[id]) || null; };
  T.carpet = function (id) {
    var lane = V().refs.boards && V().refs.boards[1]; if (!lane) return;
    var el = lane.querySelector('.rs-carpet');
    if (id === null || id === false) { if (el) { el.classList.remove('show'); el.dataset.name = ''; } T._carpetId = null; V().refs.stage.classList.remove('has-carpet'); return; }
    if (id === undefined) id = T._carpetId; // giữ thảm đang trải
    var name = T.carpetName(id) || T.CARPET_DEFAULT;
    T._carpetId = id;
    if (!el) el = U.el('div', 'rs-carpet', lane);
    V().refs.stage.classList.add('has-carpet');
    if (el.dataset.name === name && el.classList.contains('show')) return;
    el.dataset.name = name;
    el.style.backgroundImage = U.bg('art/board/carpets/' + name + '.webp');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  };
  T.clear = function () { V().refs.runTop.innerHTML = ''; U.cards.clearTop(); U.panelTip(null); };
  T.layer = function () { return V().refs.runTop; };
  // nhạc: chỉ đổi khi khác bài đang phát
  U.music = function (key, fade) {
    if (U.musicKey === key) return;
    U.musicKey = key;
    var A = root.BZAudio; if (!A) return;
    if (key) A.music(key, fade || 1.5); else A.stopMusic(1);
  };
  // nhạc bàn của hero: đổi bài theo ngày trong danh sách của hero (music.<hero>.1..3, AUDIO.md) thay vì luôn bài 1 (FLOW-15, một phần:
  // phát tiếp từ chỗ dừng sau trận cần BZAudio.music nhận vị trí — xin nhánh VFX)
  T.boardTrack = function (run) {
    var h = run.hero.toLowerCase(), A = root.BZAudio, n = 1;
    while (A && A.has && A.has('music.' + h + '.' + (n + 1))) n++;
    return 'music.' + h + '.' + (1 + ((Math.max(1, run.day) - 1) % n));
  };
  // nền chung cho mọi màn trong run: tắt lớp phủ toàn màn, hiện HUD + bàn, nhạc của hero
  T.base = function (run, topMode) {
    var st = V().refs.stage;
    st.classList.remove('ov-full');
    U.menu && U.menu.overlayOff();
    U.cards.show(true); U.hud.show(true);
    T.clear();
    T.mode(topMode || {});
    if (run && run.hero) { U.hud.mountHero(run); U.hud.update(run); U.cards.render(run); U.music(T.boardTrack(run)); }
    if (U.menu) U.menu.gear(true);
  };
  // tooltip hai tầng cho một nút (rê chuột; chạm không mở)
  T.tipOn = function (btn, title, body) {
    btn.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'touch') return; var b = btn.getBoundingClientRect(), p0 = V().toStage(b.left, b.top);
      U.panelTip({ x: p0.x, y: p0.y, w: b.width / V().scale, h: b.height / V().scale }, U.esc(title), typeof body === 'function' ? body() : U.esc(body)); });
    btn.addEventListener('pointerleave', function () { U.panelTip(null); });
  };
  // nút tròn đổi hàng + thẻ giá Container_PriceTagReroll: dùng chung cho thương nhân và pha loot có RerollRules (W-02).
  // o = {title, tip: function () → html, act: function (rr)}; hết lượt / thiếu vàng / đã lấy thẻ: vẫn nhận bấm để nói lý do (INTERACT-22)
  T.rerollButton = function (parent, o) {
    var rr = U.button(parent, 'rs-rnd rs-reroll', '<i class="ic"></i><span class="tag"><i></i><b></b></span>', o.title || 'Đổi hàng (R)', function () {
      if (rr.classList.contains('off')) { U.reject(rr._why || 'no rerolls'); return; }
      o.act(rr);
    });
    rr.querySelector('.tag').style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/Container_PriceTagReroll_TUI.webp');
    rr.querySelector('.tag i').style.backgroundImage = U.bg(U.ICON.coin);
    T.tipOn(rr, 'Đổi hàng', o.tip);
    return rr;
  };
  // đồng bộ nút theo pha (rerolls, rerollCost); lock = lý do khoá thêm (loot: đã lấy thẻ thì không đổi nữa)
  T.rerollSync = function (rr, ph, run, lock) {
    var can = ph.rerolls > 0, off = !can || !!lock || run.gold < ph.rerollCost;
    rr._why = lock || (can ? 'not enough gold' : 'no rerolls');
    rr.classList.toggle('off', off); rr.setAttribute('aria-disabled', off ? 'true' : 'false');
    rr.classList.toggle('none', !can);
    rr.classList.toggle('dis', off);
    rr.querySelector('.tag b').textContent = ph.rerollCost;
    rr.querySelector('.ic').dataset.left = '×' + ph.rerolls; // màn nhỏ: số lượt còn hiện thành huy hiệu trên nút (css .rs-small)
  };
  // ---------- quầy khung trên (BoardButton_Merchant_Default_P): lều = đổi hàng (trái), xe = rời đi (phải) ----------
  // Bản gốc là vật thể 3D trên mặt bàn nên quy đổi đơn vị thế giới u ra px sân khấu: bước ổ 1,55 u = 109,6 px (70,7 px/u),
  // làn đối thủ tâm z 1,72 u = y 422,5 (UI-CONFIG §0). Hộp bao ảnh = số tools/stall.py in ra (STALL_LAYOUT, đơn vị u).
  var PXU = 109.6 / 1.55, LANE_Z = 1.72, LANE_Y = 422.5;
  T.wx = function (u) { return 960 + u * PXU; };
  T.wy = function (z) { return LANE_Y - (z - LANE_Z) * PXU; };
  var STALL = {
    platform_tent: [-8.484, 3.599, -1.994, 6.797], tent: [-8.261, 3.554, -2.489, 7.016],
    platform_cart: [2.002, 3.597, 8.557, 6.827], cart: [2.436, 3.526, 8.328, 7.081],
    // hộp bấm BoxCollider 6,5 x 3,29 u tâm (-5,27, 5,11) / (5,24, 5,11) (wt.py trên prefab nút); ảnh viền sáng phủ đúng hộp này
    hitReroll: [-8.52, 3.465, -2.02, 6.755], hitExit: [1.99, 3.465, 8.49, 6.755]
  };
  T.STALL = STALL;
  function boxPx(bb, hit) { // hộp u → {left, top, width, height} px, tương đối so với hộp bấm `hit` nếu có
    var x = T.wx(bb[0]), y = T.wy(bb[3]), w = (bb[2] - bb[0]) * PXU, h = (bb[3] - bb[1]) * PXU;
    if (hit) { x -= T.wx(hit[0]); y -= T.wy(hit[3]); }
    return 'left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px';
  }
  function cell(parent, cls, hit, plat, model, glow, label) {
    var b = U.button(parent, 'rs-cell ' + cls, '', null, null);
    b.setAttribute('aria-label', label);
    b.style.cssText = boxPx(hit);
    var base = 'art/ui/stall/';
    b.innerHTML = '<i class="pf on" style="' + boxPx(STALL[plat], hit) + ';background-image:' + U.bg(base + plat + '.webp') + '"></i>' +
      '<i class="pf off" style="' + boxPx(STALL[plat], hit) + ';background-image:' + U.bg(base + plat + '_off.webp') + '"></i>' +
      '<i class="glow" style="background-image:' + U.bg(base + glow + '.webp') + '"></i>' +
      '<i class="mdl" style="' + boxPx(STALL[model], hit) + ';background-image:' + U.bg(base + model + '.webp') + '"></i>';
    return b;
  }
  // stall(o): o.reroll = {tip(), act(btn)} hoặc null (gặp gỡ không có RerollRules: tấm đá tắt, không thẻ giá),
  // o.leave = fn, o.canExit (SelectionContextRules.CanExit, ExitButton.cs:21-33), o.name / o.desc cho tooltip chân dung.
  // Viền xanh chỉ sáng khi rê và nút dùng được (BoardButton.CanInteract); chữ tooltip = tooltips.json Reroll / Exit dịch Việt.
  T.stall = function (o) {
    var ctl = U.el('div', 'rs-merchant-ctl rs-stall', T.layer());
    var who = U.el('div', 'rs-who', ctl);
    who.addEventListener('pointerenter', function (ev) { if (ev.pointerType !== 'touch' && o.name) U.panelTip({ x: 855, y: 62, w: 210, h: 190 }, U.esc(o.name), U.esc(o.desc || '')); });
    who.addEventListener('pointerleave', function () { U.panelTip(null); });
    var rr = cell(ctl, 'rs-reroll', STALL.hitReroll, 'platform_tent', 'tent', 'glow_reroll', 'Đổi hàng (R)');
    // thẻ giá đổi hàng Tent_Merchant_RerollPriceTag (Container_PriceTagReroll_TUI + <sprite CoinReroll> + giá); vị trí theo clip
    // ref/merchant-enter/30.jpg, karnok-nufu 13m32: tâm ở 90 % bề ngang, 51 % bề cao ô lều [ĐO TRÊN CLIP]
    var tag = U.el('span', 'tag', rr, '<i></i><b></b>');
    tag.style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/Container_PriceTagReroll_TUI.webp');
    tag.querySelector('i').style.backgroundImage = U.bg('art/icons/CoinReroll.webp');
    rr.addEventListener('click', function () {
      if (!o.reroll || rr.classList.contains('off')) { U.reject(rr._why || 'no rerolls'); return; }
      rr.classList.remove('click'); void rr.offsetWidth; rr.classList.add('click');
      o.reroll.act(rr);
    });
    T.tipOn(rr, 'Đổi hàng', function () { return 'Đổi hàng của thương nhân này.' + (o.reroll && o.reroll.tip ? o.reroll.tip() : ''); });
    var ex = cell(ctl, 'rs-exit leave', STALL.hitExit, 'platform_cart', 'cart', 'glow_exit', 'Rời gặp gỡ');
    ex.addEventListener('click', function () {
      if (ex.classList.contains('off')) { U.reject('cannot exit'); return; }
      U.panelTip(null); ex.classList.add('click'); o.leave();
    });
    T.tipOn(ex, 'Rời gặp gỡ', 'Rời khỏi gặp gỡ này.');
    var api = { ctl: ctl, who: who, rr: rr, ex: ex };
    T.stallSync(api, { canExit: o.canExit !== false });
    if (!o.reroll) T.stallReroll(api, null);
    return api;
  };
  // đồng bộ nút đổi hàng theo pha: ph = {rerolls, rerollCost} hoặc null (không có đổi hàng); lock = lý do khoá thêm
  T.stallReroll = function (api, ph, run, lock) {
    var rr = api.rr, can = !!ph && ph.rerolls > 0, off = !can || !!lock || (run && run.gold < ph.rerollCost);
    rr._why = lock || (!ph ? 'no rerolls' : can ? 'not enough gold' : 'no rerolls');
    rr.classList.toggle('off', !!off); rr.setAttribute('aria-disabled', off ? 'true' : 'false');
    rr.classList.toggle('none', !can); // RerollsRemaining == 0: ẩn thẻ giá (RerollButton.cs:136-185)
    rr.querySelector('.tag b').textContent = ph ? ph.rerollCost : '';
  };
  T.stallSync = function (api, o) {
    var off = o.canExit === false;
    api.ex.classList.toggle('off', off); api.ex.setAttribute('aria-disabled', off ? 'true' : 'false');
  };

  // nút lớn kiểu gốc (Btn_Rct_*): màu 'brown' | 'blue' | 'yellow' | 'red' | 'purple'
  U.bigButton = function (parent, color, label, title, fn) {
    var b = U.button(parent, 'rs-big c-' + color, '<span>' + label + '</span>', title, fn);
    return b;
  };

  // ảnh của một tham chiếu gặp gỡ {type, id}
  T.FATE_ART = { bounty: 'art/ui/rewards/Reward_PileOfCoins_D.webp', crossroads: 'art/ui/rewards/Reward_DoorObsidian_D.webp',
    legacy: 'art/ui/rewards/Reward_Rewind_D.webp', fortunes: 'art/ui/rewards/Reward_Dice_D.webp' };
  T.artOf = function (r) {
    if (r.type === 'step') return { bg: U.art(r.id), char: null };
    if (r.card) return { bg: U.art(r.card.id), char: null }; // Số phận "Golden Gift", lựa chọn kèm thẻ
    // Số phận: bốn bước thật đều mang ArtKey Reward_Mind_D, nên mỗi id lấy ảnh phần thưởng gần nghĩa riêng [ĐỀ XUẤT: để người chơi phân biệt được]
    if (r.type === 'fate') return { bg: T.FATE_ART[r.id] || U.art(r.stepId) || U.ICON.chest, char: null };
    if (r.type === 'combat') return { bg: U.art(r.id + '_bg'), char: U.art(r.id + '_char') };
    return { bg: U.art(r.id + '_bg'), char: U.art(r.id + '_char') };
  };
  // chân dung bên trên + nội dung hai ô cạnh
  T.portrait = function (name, tier, art, leftHtml, opts) {
    opts = opts || {};
    V().setupHero(1, { name: name, level: opts.level || 1, tier: tier || 'Bronze', char: art.char, bg: art.bg, skills: opts.skills || [], rewards: opts.rewards || {}, hpMax: opts.hpMax || 0 });
    var h = V().hero(1);
    if (h) h.pf.classList.add('appear');
    if (opts.hpMax) V().updateHero(1, { health: opts.hpMax, healthMax: opts.hpMax }, U.now());
    var S = V().refs.sides[1];
    S.l.innerHTML = leftHtml || ''; S.r.innerHTML = '';
    U.sfx('board.portraitAppear', { vol: 0.6 });
    return { l: S.l, r: S.r };
  };
  T.nameBlock = function (kicker, name, desc) {
    return '<div class="rs-side-name"><small>' + U.esc(kicker) + '</small><h3>' + U.esc(name) + '</h3>' + (desc ? '<p>' + U.esc(desc) + '</p>' : '') + '</div>';
  };

  // ---------- giấy bản đồ + khung gặp gỡ ----------
  var ICONS = {
    merchant: '<svg viewBox="0 0 48 48"><rect x="9" y="12" width="20" height="28" rx="3" transform="rotate(-14 19 26)" fill="#fff4b8" stroke="#6b4a0c" stroke-width="2.5"/><rect x="19" y="9" width="20" height="28" rx="3" transform="rotate(10 29 23)" fill="#ffe36d" stroke="#6b4a0c" stroke-width="2.5"/><path d="M29 16l5 7-5 7-5-7z" transform="rotate(10 29 23)" fill="#e0662a" stroke="#6b4a0c" stroke-width="1.6"/></svg>',
    event: '<svg viewBox="0 0 48 48"><text x="24" y="37" text-anchor="middle" font-family="Noto Serif, Georgia, serif" font-weight="900" font-size="34" fill="#173b5a" stroke="#e8fbff" stroke-width="1.2">?</text></svg>',
    combat: '<svg viewBox="0 0 48 48"><g stroke="#4a0d04" stroke-width="2" fill="#ffe9d2"><path d="M8 8l4 0 20 22-3 3L8 12z"/><path d="M40 8l-4 0-20 22 3 3L40 12z"/></g><g fill="#4a0d04"><path d="M12 31l5 5-4 4-5-5z"/><path d="M36 31l-5 5 4 4 5-5z"/><rect x="14" y="28" width="9" height="3" transform="rotate(45 18 30)"/><rect x="25" y="28" width="9" height="3" transform="rotate(-45 30 30)"/></g></svg>',
    pedestal: '<svg viewBox="0 0 48 48"><path d="M24 5l5 12 13 2-10 8 3 13-11-7-11 7 3-13-10-8 13-2z" fill="#f7e8ff" stroke="#3a1458" stroke-width="2"/></svg>',
    levelup: '<svg viewBox="0 0 48 48"><path d="M24 6l14 16h-8v18H18V22h-8z" fill="#e6fbff" stroke="#0b3a55" stroke-width="2.5"/></svg>'
  };
  T.ICONS = ICONS;
  // Huy hiệu dưới khung: sprite gốc Encounter_Banner_<loại>_P (data2 bóc vào art/ui, khoá cùng tên trong BZ_ART.map); chưa có thì dùng SVG ở trên (W-06)
  var BANNER = { merchant: 'Merchant', combat: 'Monster', event: 'Quest', pedestal: 'Quest', skill: 'Skill' };
  T.bannerSprite = function (pt) { var k = BANNER[pt]; return k ? U.art('ui:Encounter_Banner_' + k + '_P') || U.art('Encounter_Banner_' + k + '_P') : null; };
  T.pennantType = function (r) { return r.type === 'combat' ? 'combat' : r.type === 'merchant' ? 'merchant' : r.type === 'pedestal' ? 'pedestal' : 'event'; };
  // map(title): nền giấy bản đồ phủ vùng trên
  T.map = function (title, sub) {
    var m = U.el('div', 'rs-map', T.layer());
    m.style.backgroundImage = U.bg('art/ui/ui_sprite_atlas/Atlas_Page_Common_BG_Tileable_TUI.webp');
    m.innerHTML = '<svg class="lines" viewBox="0 0 1164 470" preserveAspectRatio="none"><g fill="none" stroke="#6b4a22" stroke-width="2" opacity=".35">' +
      '<path d="M0 380 C140 340 220 420 360 360 S600 250 760 300 S1000 420 1164 330"/><path d="M80 0 C120 120 60 200 160 260 S300 470 260 470"/>' +
      '<path d="M900 0 C860 90 960 160 900 230 S760 360 820 470"/><rect x="420" y="40" width="90" height="60"/><rect x="530" y="60" width="50" height="70"/>' +
      '<rect x="640" y="380" width="110" height="50"/><rect x="980" y="60" width="70" height="90"/><rect x="180" y="300" width="80" height="60"/>' +
      '<path d="M300 120h80v40h-80zM700 150h60v60h-60zM1040 250h70v50h-70zM60 120h50v80H60z"/></g></svg><div class="ray"></div><div class="dust"></div>';
    if (title) U.el('div', 'rs-map-title', m, '<h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : ''));
    return m;
  };
  // frames(options, onPick, opts) — ba khung so le; options: [{type,id,name,tier,desc,kind,level,health,gold,xp}]
  // ref hour-choice (1024x576): khung giữa x 50 %, hai khung bên x 37 % / 63 %; đỉnh khung y 20 % / 26 % / 20 %; khung cao ~16 % màn [ĐO TRÊN CLIP]
  var XS = [713, 960, 1207], YS = [219, 285, 221], FH = 176;
  T.frames = function (options, onPick, opts) {
    opts = opts || {};
    var layer = T.layer(), out = [], born = U.now();
    var n = options.length, xs = n === 3 ? XS : n === 2 ? [830, 1090] : [960];
    options.forEach(function (o, i) {
      var tier = o.tier || 'Bronze', F = root.BZ_FRAMES && root.BZ_FRAMES.encounter && (root.BZ_FRAMES.encounter[tier] || root.BZ_FRAMES.encounter.Bronze);
      var H = FH, k = F ? H / F.h : 1, W = F ? F.w * k : 210;
      var box = U.el('div', 'rs-enc t-' + tier + (opts.special === i ? ' special' : ''), layer);
      box.style.left = (xs[i] - W / 2) + 'px'; box.style.top = (YS[i % 3] + (opts.dy || 0)) + 'px'; box.style.width = W + 'px'; box.style.height = (H + 90) + 'px';
      box.style.animationDelay = (i * 80) + 'ms'; box.style.setProperty('--d', (i * 80) + 'ms');
      var fr = U.el('div', 'fr', box); fr.style.height = H + 'px';
      var art = U.el('div', 'win', fr), A = T.artOf(o);
      if (F) {
        var wn = F.window;
        art.style.cssText = 'left:' + wn.x * k + 'px;top:' + wn.y * k + 'px;width:' + wn.w * k + 'px;height:' + wn.h * k + 'px;' +
          'border-radius:' + (wn.shape === 'arch' ? '46% 46% 6px 6px / 30% 30% 6px 6px' : (wn.r * k) + 'px');
      }
      var bg = U.el('div', 'bg', art), ch = U.el('div', 'ch', art);
      if (A.bg) bg.style.backgroundImage = U.bg(A.bg);
      if (A.char) ch.style.backgroundImage = U.bg(A.char); else ch.style.display = 'none';
      if (root.BZHires) { root.BZHires.apply(bg, A.bg, { zoom: opts.zoom }); root.BZHires.apply(ch, A.char, { zoom: opts.zoom }); }
      if (F) { var im = U.el('img', 'frame', fr); im.src = U.url(F.src); im.alt = ''; im.draggable = false; }
      U.el('i', 'gem', fr);
      var pt = opts.pennant ? opts.pennant(o) : T.pennantType(o);
      var pn = U.el('div', 'pennant p-' + pt, box, ICONS[pt] || ICONS.event); pn.style.top = (H - 8) + 'px'; box.classList.add('k-' + pt);
      var spr = T.bannerSprite(pt);
      if (spr) { pn.classList.add('spr'); pn.innerHTML = ''; pn.style.backgroundImage = U.bg(spr); } // url inline: tính theo trang, không theo css/
      U.el('div', 'nm', box, U.esc(o.name));
      var lbl = opts.label ? opts.label(o, i) : '';
      if (lbl) U.el('div', 'lbl', box, U.esc(lbl));
      // bảng giải thích đặt ngoài hàng khung (bên trái khung đầu / bên phải khung cuối) để không che khung bên cạnh (MOBILE-25);
      // màn lên cấp: tiêu đề bảng là nhãn chung, không lặp tên đã hiện trên khung (FLOW-25)
      function tip(extra) {
        var r = U.rectOf(fr), title = opts.kicker ? U.esc(opts.kicker) : U.esc(o.name), body = (opts.kicker ? '<b class="w">' + U.esc(o.name) + '</b><br>' : '') + U.esc(o.desc || '') + (extra || '');
        U.panelTip(anchor(i, r), title, body);
      }
      box.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'touch') return;
        U.sfx('board.portraitHover', { vol: 0.6 });
        if (opts.onHover) opts.onHover(o, box, e); else tip('');
      });
      box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'touch') return; U.sfx('board.portraitUnhover', { vol: 0.4 }); U.panelTip(null); if (opts.onLeave) opts.onLeave(); });
      var lastPt = 'mouse';
      box.addEventListener('pointerdown', function (e) { lastPt = e.pointerType; });
      box.addEventListener('click', function () {
        // khung vừa bật ra (< 0,45 s): bỏ qua cú bấm "xuyên" từ màn trước (bấm đúp quả cầu mở màn / nút Tiếp tục)
        if (U.state.busy || U.now() - born < 450) return;
        // chạm: lần 1 xem (tooltip / bàn quái), lần 2 chọn
        if (lastPt === 'touch' && !box.classList.contains('armed')) {
          Array.prototype.forEach.call(layer.querySelectorAll('.rs-enc.armed'), function (b) { b.classList.remove('armed'); });
          box.classList.add('armed');
          U.sfx('board.portraitHover', { vol: 0.6 });
          if (opts.onHover) opts.onHover(o, box); else tip('<br><span class="o">Chạm lần nữa để chọn</span>');
          return;
        }
        U.state.busy = true;
        U.panelTip(null); if (opts.onLeave) opts.onLeave();
        box.classList.add('chosen');
        Array.prototype.forEach.call(layer.querySelectorAll('.rs-enc'), function (b) { if (b !== box) b.classList.add('faded'); });
        U.sfx('board.encounterClick');
        setTimeout(function () { U.state.busy = false; onPick(i); }, opts.pickDelay != null ? opts.pickDelay : 800); // clip: các khung khác mờ 400 ms + viền vàng 400 ms rồi mới vào màn
      });
      out.push(box);
    });
    // điểm neo của bảng: khung trái → bảng nằm bên trái hàng; khung khác → bảng nằm bên phải khung cuối
    function anchor(i, r) {
      var first = U.rectOf(out[0].querySelector('.fr')), last = U.rectOf(out[out.length - 1].querySelector('.fr'));
      if (!first || !last || out.length < 2) return r;
      var row = { x0: first.x, x1: last.x + last.w, y1: Math.max(first.y + first.h, last.y + last.h, r.y + r.h) + 70 };
      var tw = V().refs.tip2.offsetWidth || 470;
      if (i === 0) return { x: first.x - tw - 36, y: r.y, w: 0, h: r.h, row: row };
      return { x: last.x, y: r.y, w: last.w, h: r.h, row: row };
    }
    return out;
  };
})(window);
