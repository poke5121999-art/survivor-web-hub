// Sảnh chọn nhân vật + chọn chế độ + cửa hàng đá quý (mua bằng tiền thật là GIẢ LẬP): thay SK.lobby,
// gọi SK.startRun(heroId). Màn chọn nhân vật là prefab uGUI gốc 8.6 (common.ab › ui_choose_hero.prefab, lớp
// ChooseHeroView) dựng lại bằng SK.ugui trên canvas #hs-ui; chọn chế độ và các hộp thoại vẫn là DOM.
(function () {
  'use strict';
  const SK = window.SK, G = SK.G, D = SK.D, DS = SK.DS;
  const $ = id => document.getElementById(id);
  const ART = 'art/lobby/';
  const LA = () => window.SK_LOBBY_ART || {};
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fmt = n => Math.round(n).toLocaleString('vi-VN');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Chữ Việt + bảng biểu tượng kỹ năng sinh bởi art/lobby/build_lobby_art.py; nạp bằng thẻ script để chạy được từ file://.
  let built = false;
  (function () {
    const s = document.createElement('script');
    s.src = ART + 'lobby-art.js?v=20260929b';
    s.onload = () => { if (built) refresh(); };
    s.onerror = () => SK.warnOnce('lobbyart', 'lobby art not loaded');
    document.head.appendChild(s);
  })();

  // ---------------------------------------------------------------- hồ sơ người chơi (localStorage)
  const KEY = 'sk.profile.v1';
  function loadProfile() {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }
  const P = Object.assign({ gems: 0, unlocked: ['knight'], selected: 'knight', skills: {}, slot: {}, level: {}, view: 'art', demo: true, won: {} },
    loadProfile() || {});
  if (!Array.isArray(P.unlocked)) P.unlocked = [];
  if (P.unlocked.indexOf('knight') < 0) P.unlocked.push('knight');
  if (!DS.heroes[P.selected]) P.selected = 'knight';
  if (!P.won || typeof P.won !== 'object') P.won = {};
  P.gems = Math.max(0, Math.floor(+P.gems || 0));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) { /* chế độ riêng tư: chơi tiếp, không lưu */ } }

  const HEROES = Object.keys(DS.heroes).filter(id => D.heroes && D.heroes[id])
    .sort((a, b) => D.heroes[a].s0.index - D.heroes[b].s0.index);

  SK.profile = {
    get gems() { return P.gems; },
    get unlocked() { return P.unlocked.slice(); },
    get selected() { return P.selected; },
    addGems(n) { P.gems = Math.max(0, P.gems + Math.floor(n)); save(); if (built) refresh(); return P.gems; },
    spend(n) { if (P.gems < n) return false; P.gems -= n; save(); return true; },
    isUnlocked: id => P.unlocked.indexOf(id) >= 0,
    unlock(id) { if (DS.heroes[id] && P.unlocked.indexOf(id) < 0) { P.unlocked.push(id); save(); if (built) refresh(); } return !!DS.heroes[id]; },
    select(id) { return select(id); },
    isSkillUnlocked: (id, slot) => slot === 0 || ((P.skills[id] || []).indexOf(slot) >= 0),
    unlockSkill(id, slot) { const a = P.skills[id] = P.skills[id] || []; if (a.indexOf(slot) < 0) a.push(slot); save(); if (built) refresh(); },
    skillSlot: id => P.slot[id] || 0,
    level: id => P.level[id] || 0,
    reset() { try { localStorage.removeItem(KEY); } catch (_) { /* bỏ qua */ } }
  };
  const isUnlocked = SK.profile.isUnlocked;

  // ---------------------------------------------------------------- giá
  const FAKE_HERO_GEMS = 10000;   // nhân vật mở bằng thành tựu / nguyên liệu → đổi đá quý [ƯỚC LƯỢNG]
  const FAKE_SKILL_GEMS = 8000;   // kỹ năng mở ở Bàn thiết kế → đổi đá quý [ƯỚC LƯỢNG]
  const KIND_VI = { achievement: 'hoàn thành thành tựu', materials: 'nộp nguyên liệu', other: 'vật phẩm sự kiện',
    design_table: 'chế ở Bàn thiết kế' };
  function heroPrice(id) {
    const u = DS.heroes[id].unlock || {};
    if (u.kind === 'free' || u.kind === 'default') return { kind: 'free' };
    if (u.kind === 'gems' && u.amount) return { kind: 'gems', amount: u.amount };
    if (u.kind === 'real_money' && u.amount) return { kind: 'money', amount: u.amount };
    return { kind: 'gems', amount: FAKE_HERO_GEMS, orig: (KIND_VI[u.kind] || 'cách khác') + (u.text ? ' (' + u.text + ')' : '') };
  }
  function skillPrice(id, slot) {
    const byName = LA().skillUnlockByName || {};
    const u = (byName[DS.heroes[id].nameEn] || [])[slot];
    if (!u || u.kind === 'default') return slot === 0 ? { kind: 'free' } : { kind: 'gems', amount: FAKE_SKILL_GEMS, orig: 'không rõ' };
    if (u.kind === 'gems' && u.amount) return { kind: 'gems', amount: u.amount };
    if (u.kind === 'real_money' && u.amount) return { kind: 'money', amount: u.amount };
    return { kind: 'gems', amount: FAKE_SKILL_GEMS, orig: KIND_VI[u.kind] || u.kind };
  }

  // ---------------------------------------------------------------- chữ hiển thị
  const tr = id => (LA().tr || {})[id] || {};
  const heroName = id => tr(id).name || DS.heroes[id].name;
  function skillList(id) {
    const h = DS.heroes[id], vi = tr(id).skills || [];
    return (h.skills || [h.skill]).map((s, i) => ({ name: (vi[i] && vi[i].name) || s.name, desc: (vi[i] && vi[i].desc) || s.desc || '',
      cd: s.cd, en: s.name, icon: ((LA().skills || {})[id] || [])[i] }));
  }
  function weaponName(id) {
    const h = DS.heroes[id];
    return h.weapon === 'bad_pistol' ? DS.weapons.bad_pistol.name : (tr(id).weapon || DS.weapons[h.weapon].name);
  }
  const UP_VI = [[/^\+(\d+) Health/i, '+$1 Máu'], [/^\+(\d+) Armor/i, '+$1 Giáp'], [/^\+(\d+) Energy/i, '+$1 Năng lượng'],
    [/^-(\d+)s Skill Cooldown/i, 'Hồi chiêu −$1 giây'], [/Skill Cooldown/i, 'Giảm hồi chiêu'], [/Skill Upgrade/i, 'Nâng cấp kỹ năng'],
    [/Passive Buff/i, 'Tăng nội tại'], [/Enhance Starting Weapon/i, 'Cường hoá vũ khí khởi đầu'], [/Valued Badge/i, 'Huy hiệu quý (bộ đàm)']];
  function upVi(s) { for (const [re, v] of UP_VI) if (re.test(s)) return s.replace(re, v).replace(/\s*\(.*\)$/, ''); return s; }
  // Chỉ máu / giáp / năng lượng có hiệu lực ở bản web; phần còn lại là đổi kỹ năng/nội tại chưa làm.
  function upgradeBonus(id) {
    const b = { hp: 0, armor: 0, energy: 0 }, lv = P.level[id] || 0;
    for (const u of (DS.heroes[id].upgrades || []).slice(0, lv)) {
      let m;
      if ((m = /^\+(\d+) Health/i.exec(u.upgrade))) b.hp += +m[1];
      else if ((m = /^\+(\d+) Armor/i.exec(u.upgrade))) b.armor += +m[1];
      else if ((m = /^\+(\d+) Energy/i.exec(u.upgrade))) b.energy += +m[1];
    }
    return b;
  }
  const upgradeLive = s => /^\+\d+ (Health|Armor|Energy)/i.test(s);
  function heroStats(id) {
    const h = DS.heroes[id], b = upgradeBonus(id);
    return { hp: h.hp + b.hp, armor: h.armor + b.armor, energy: h.energy + b.energy, crit: h.crit || 0 };
  }

  // ---------------------------------------------------------------- vẽ khung atlas
  const heroAnim = (id, kind) => D.heroes[id] && D.heroes[id].s0 && D.heroes[id].s0[kind];
  const heroFrame0 = id => { const a = SK.anim(heroAnim(id, 'idle')); return a && a.f[0]; };
  function drawFit(cv, name, o) {
    const ctx = cv.getContext('2d'), f = SK.frame(name);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!f) return;
    const k = Math.max(1, Math.floor(Math.min((cv.width - 2) / f[3], (cv.height - 2) / f[4], (o && o.max) || 9)));
    if (o && o.feet) SK.draw(ctx, name, cv.width / 2, cv.height - 2, { sx: k, sy: k });
    else SK.draw(ctx, name, Math.round(cv.width / 2 - f[3] * k / 2 + f[5] * k), Math.round(cv.height / 2 - f[4] * k / 2 + f[6] * k), { sx: k, sy: k });
  }
  // Khung atlas game (nhân vật, súng) vừa khít rect R của một nút uGUI.
  function fitSprite(ctx, name, R, fill) {
    const f = SK.frame(name);
    if (!f) return;
    const sc = Math.min(R.w / f[3], R.h / f[4]) * (fill || 1);
    SK.draw(ctx, name, R.x + R.w / 2 - (f[3] / 2 - f[5]) * sc, R.y + R.h / 2 - (f[4] / 2 - f[6]) * sc, { sx: sc, sy: sc });
  }
  const skillSheet = new Image();
  skillSheet.src = ART + 'skills.png';
  function drawSkillIcon(ctx, idx, R) {
    if (idx == null || idx < 0 || !skillSheet.complete || !skillSheet.naturalWidth) return;
    ctx.drawImage(skillSheet, (idx % 16) * 32, Math.floor(idx / 16) * 32, 32, 32, R.x, R.y, R.w, R.h);
  }
  const portraits = {};
  function portrait(id) {
    if (!(LA().portraits || {})[id]) return null;
    let im = portraits[id];
    if (!im) { im = portraits[id] = new Image(); im.src = ART + 'portrait/' + id + '.png'; }
    return im.complete && im.naturalWidth ? im : null;
  }

  // ---------------------------------------------------------------- prefab ChooseHeroView
  const U = window.SK_UI;
  const TERM = k => (U && U.terms && U.terms[k]) || k;
  const VIEW = U && U.prefabs.choose_hero && U.prefabs.choose_hero.mbd ? U.prefabs.choose_hero.mbd.ChooseHeroView : {};
  const SCROLL = U && U.prefabs.choose_hero ? (U.prefabs.choose_hero.k.find(n => n.n === 'mask_down').k
    .find(n => n.n === 'skin_scroll_view').mbd || {}) : {};
  const CELL = U && U.prefabs.skin_cell;
  const ATTR = 'ui_left/panel/hero_attributes/';
  const SKP = 'ui_right/skill_panel/';
  const CAR = 'mask_down/skin_scroll_view/viewport/content';
  const CUR = 'mask_up/show_currency_group_widget/';
  // Nút mã gốc chỉ bật theo sự kiện / chế độ khác (nhiều người, mùa giải, dùng thử, hướng dẫn lần đầu) nên tắt.
  const HIDE = ['bubbles', 'upgrade_hero_popup_window', 'count_down', 'btn_group/btn_reward', 'btn_group/btn_shop',
    'btn_group/btn_multi_room_info', 'btn_group/vertical_bar', 'btn_group/btn_hero_list', 'btn_group/btn_home',
    'btn_group/show_currency_group_widget/show_currency_widget/Bg/TextChangeAnim',
    'mask_up/ticket', 'mask_up/wave_energy', 'mask_up/layout/text_name/background',
    'ui_left/ui_choose_jewelry', 'ui_left/mech_panel', ATTR + 'level_panel/super_star', ATTR + 'upgraded_detail_button/upgrade_tip',
    ATTR + 'detail_arrow', ATTR + 'detail_bg', SKP + 'skill_detail_super_hero', SKP + 'skill_demo_tip',
    SKP + 'skill_detail/icon_bg/trial', SKP + 'skill_detail/btn_unlock_skill', SKP + 'skill_detail/fragment_tips',
    'mask_down/super_hero_scroll_view', 'mask_down/switch_to_season_equipments_button', 'mask_down/fullLevelTipText',
    'mask_down/ui_left_button/redPoint', 'mask_down/ui_right_button/redPoint',
    'mask_down/btn_ok/try', 'mask_down/btn_ok/try_skin', 'mask_down/btn_ok/try_skin_active', 'mask_down/btn_ok/use_item',
    'mask_down/center_buttons/btn_upgrade', 'mask_down/center_buttons/btn_unlock/Image', 'mask_down/center_buttons/btn_unlock/limit_sale',
    'mask_down/center_buttons/btn_upgrade_activity', 'mask_down/center_buttons/unlock_way', 'mask_down/center_buttons/unlock_hero_first',
    'mask_down/center_buttons/unlock_by_activity', 'mask_down/center_buttons/btn_unlock_season_irontide',
    'mask_down/center_buttons/unlock_skin_first', 'ui_choose_hero_drawing_buttons/left_btn_customization'];
  // [ĐO] ChooseHeroView..cctor: HideEndValues = (0,180), (0,-300), (-550,0), (550,0) cho mask_up, mask_down, ui_left,
  // ui_right; ShowOrHideView gọi DOTween.To tới ShowEndValues (0,0) trong AnimationDuration = 0,25 s.
  // [SUY] Ease mặc định của DOTween (OutQuad): mã gốc không gọi SetEase.
  const SLIDE = [['mask_up', [0, 180]], ['mask_down', [0, -300]], ['ui_left', [-550, 0]], ['ui_right', [550, 0]]];
  const SLIDE_T = 0.25;
  // [ĐO] ChooseHeroView.AttributesMaxNum = {12, 10, 320, 10}; RefreshHeroAttributes: Image.sizeDelta =
  // (min(giá trị / max × 248, 248), 28), ImageAddition cùng cỡ, Text = giá trị.
  const ATTR_MAX = [12, 10, 320, 10], BAR_W = 248, BAR_H = 28;
  // [ĐO] ChooseHeroView.SkillsPosition[ô đang dùng] = y của skill_1..3; bảng chi tiết (skill_detail) thay chỗ ô đang dùng.
  const SKILL_Y = [[245, -95, -190], [200, 150, -190], [200, 105, 55]];
  // [ĐO] RefreshSkills: ô khoá → icon GrayColor (0,7), tên (147,148,150), chữ phụ (136,137,139); ô mở → tên (206,206,207),
  // chữ phụ (187,188,189); vạch trái blueLine khi đang dùng, grayLine khi không. RefreshSkillDetail: "In Use" màu (60,143,245).
  const C255 = (r, g, b, a) => [r / 255, g / 255, b / 255, a == null ? 1 : a];
  const SK_COL = { lockIcon: [0.7, 0.7, 0.7, 0.7], lockName: C255(147, 148, 150), lockSub: C255(136, 137, 139),
    name: C255(206, 206, 207), sub: C255(187, 188, 189), inUse: C255(60, 143, 245) };
  // [ĐO] FoldPanel / UnfoldPanel: detail_arrow + detail_bg bật khi mở, nút "Cách tăng cấp" ở y -200 (gập) / -275 (mở),
  // panel/bg sizeDelta.y 0 → 80; mũi tên đặt ở (x ô được bấm, -130).
  const FOLD_Y = -200, UNFOLD_Y = -275, UNFOLD_GROW = 80;
  // [ĐO] SkinScrollView: cellInterval 0,2, scrollOffset 0,5, loop; Scroller: scrollSensitivity 5, snap 0,3 s Easing 24
  // (InOutCubic); vị trí ô = (chỉ số − vị trí cuộn) × 0,2 + 0,5, clip skin_item_scroll của ô xếp x/scale/alpha theo nó.
  const CELL_IV = SCROLL.SkinScrollView ? SCROLL.SkinScrollView.cellInterval : 0.2;
  const CELL_OFF = SCROLL.SkinScrollView ? SCROLL.SkinScrollView.scrollOffset : 0.5;
  const SNAP_T = SCROLL.Scroller ? SCROLL.Scroller.snap.Duration : 0.3;
  const SENS = SCROLL.Scroller ? SCROLL.Scroller.scrollSensitivity : 5;
  const VIEWPORT_W = 550;
  // [SUY] Tranh nhân vật: mã gốc nạp prefab tranh vào cảnh; đo trên ảnh chụp 8.6 thì tranh ~1,1 đơn vị canvas mỗi điểm ảnh,
  // tâm cao ~345 đơn vị tính từ đỉnh.
  const DRAW_SCALE = 1.1, DRAW_CY = 345;
  // [SUY] Ô đá quý góc trên phải: ảnh chụp 8.6 đặt nó ngang hàng tên nhân vật (tâm y ≈ 49, mép phải cách 48).
  const CURRENCY_P = [-48, -19];

  let UI = null, cv = null, cx2 = null, slideAt = 0, detail = null;
  const car = { pos: 0, from: 0, to: 0, t0: 0, anim: false, drag: null };
  const now = () => performance.now() / 1000;
  const easeInOutCubic = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const easeOutQuad = x => 1 - (1 - x) * (1 - x);
  const sfx = name => { if (name && SK.sfx && SK.sfx.play) SK.sfx.play(name, { poly: 2, gap: 0.05, vol: 0.7 }); };

  function ui() {
    if (UI || !SK.ugui || !SK.ugui.ok || !U.prefabs.choose_hero) return UI;
    UI = SK.ugui.inst('choose_hero');
    for (const p of HIDE) { const n = UI.q(p); if (n) n.off = 1; }
    // Ô tiền tệ của btn_group bị dải đen mask_up (vẽ sau) che mất; ở bản gốc nó nằm trên canvas riêng phía trên.
    // Chuyển nó thành con cuối của mask_up (cùng neo góc trên phải màn hình) để vẽ đè lên dải đen.
    const grp = UI.q('btn_group'), cur = grp.k.find(n => n.n === 'show_currency_group_widget');
    grp.k = grp.k.filter(n => n !== cur);
    UI.q('mask_up').k.push(cur);
    cur.p = CURRENCY_P.slice();
    UI.reindex();
    // [SUY] Icon đá quý: ui_102 (viên đá xanh của nút cửa hàng gốc); prefab để ui_361 (đồng vàng) làm chỗ giữ.
    UI.q(CUR + 'show_currency_widget/Bg/Image/Icon').img.sp = 'ui_102';
    UI.q(ATTR + 'level_panel/hero_icon').draw = (ctx, R) => fitSprite(ctx, heroFrame0(P.selected), R);
    UI.q(ATTR + 'weapon/icon').draw = (ctx, R) => {
      const w = DS.weapons[DS.heroes[P.selected].weapon];
      fitSprite(ctx, w && w.sprite, { x: R.x - R.w * 0.2, y: R.y - R.h * 0.2, w: R.w * 1.4, h: R.h * 1.4 });
    };
    UI.q(SKP + 'skill_detail/icon_bg/icon').draw = (ctx, R) => drawSkillIcon(ctx, (skillList(P.selected)[curSlot()] || {}).icon, R);
    const price = UI.q('mask_down/center_buttons/btn_unlock/Layout/Text2');
    price.sc = [1, 1]; price.sz = [260, 50];
    price.draw = drawPrice;
    UI.q('mask_down/center_buttons/btn_unlock/Layout/Text1').txt.s = TERM('UNLOCK');
    UI.q(SKP + 'skill_detail/content').txt.s = TERM('multi_room_skin_ui_using');
    UI.q(SKP + 'skill_detail/content').txt.c = SK_COL.inUse;
    // [ĐO] ChooseHeroView.<FixedSkillDescriptionSize>d__244.MoveNext: scroll_view.sizeDelta = (310, 190),
    // anchoredPosition = (-13, -18) khi không có nút mở kỹ năng (22 khi có) — prefab lưu (310, 112) ở y 22.
    const sv = UI.q(SKP + 'skill_detail/scroll_view');
    sv.p = [-13, -18]; sv.sz = [310, 190];
    for (let i = 1; i <= 3; i++) {
      const b = SKP + 'skill_' + i + '/up/';
      UI.q(b + 'icon_bg/trial').off = 1;
      UI.q(b + 'icon_bg/icon').draw = (ctx, R) => {
        const n = UI.q(b + 'icon_bg/icon');
        const a = ctx.globalAlpha;
        ctx.globalAlpha *= n.img.c[3];
        if (n.gray) ctx.filter = 'grayscale(1) brightness(0.7)';
        drawSkillIcon(ctx, (skillList(P.selected)[i - 1] || {}).icon, R);
        ctx.globalAlpha = a;
      };
    }
    return UI;
  }

  // Giá trên nút "Mở khóa" giữa màn: font số bitmap `number` của bản gốc ("g500": g = viên đá) không xuất được,
  // vẽ icon đá quý gốc ui_102 + số bằng pixel_bold.
  function drawPrice(ctx, R) {
    const pr = heroPrice(P.selected), gem = pr.kind === 'gems';
    const s = pr.kind === 'money' ? '$' + pr.amount.toFixed(2) : String(pr.amount || 0);
    ctx.font = '40px "skui_pixel_bold", "skui_BeVietnamPro-Regular", monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const tw = ctx.measureText(s).width, iw = gem ? 40 : 0, gap = gem ? 8 : 0, x0 = R.x + (R.w - tw - iw - gap) / 2, cy = R.y + R.h / 2;
    if (gem) SK.ugui.drawFrame(ctx, 'ui_102', { x: x0, y: cy - 18, w: 40, h: 36 });
    ctx.fillStyle = '#000'; ctx.fillText(s, x0 + iw + gap + 3, cy + 3);
    ctx.fillStyle = '#fff'; ctx.fillText(s, x0 + iw + gap, cy);
  }

  const curSlot = () => { const n = skillList(P.selected).length; return Math.min(P.slot[P.selected] || 0, n - 1); };

  // ---------------------------------------------------------------- bơm dữ liệu vào prefab
  function refresh() {
    if (!built) return;
    const id = P.selected, h = DS.heroes[id], lv = P.level[id] || 0, open = isUnlocked(id), vals = heroStats(id);
    $('sk-hero-line').textContent = heroName(id) + ' — Máu ' + vals.hp + ' · Giáp ' + vals.armor + ' · Năng lượng ' + vals.energy;
    if (!ui()) return;
    UI.q('mask_up/layout/text_name').txt.s = heroName(id);
    UI.q(CUR + 'show_currency_widget/Bg/Text').txt.s = String(P.gems);
    // Thanh chỉ số
    [vals.hp, vals.armor, vals.energy, vals.crit].forEach((v, i) => {
      const b = ATTR + 'value' + (i + 1) + '/', w = Math.min(v / ATTR_MAX[i] * BAR_W, BAR_W);
      UI.q(b + 'Text').txt.s = String(v);
      UI.q(b + 'Image').sz = [w, BAR_H];
      UI.q(b + 'ImageAddition').sz = [w, BAR_H];
    });
    // Sao cấp: hàng sao đen = số cấp tối đa, hàng sao sáng = cấp đã nâng.
    const nUp = Math.min(8, (h.upgrades || []).length || 7);
    UI.q(ATTR + 'level_panel/stars/bg').k.forEach((s, i) => { if (i < nUp) delete s.off; else s.off = 1; });
    UI.q(ATTR + 'level_panel/stars/layout').k.forEach((s, i) => { if (i < Math.min(lv, nUp)) delete s.off; else s.off = 1; });
    if (lv >= 8) delete UI.q(ATTR + 'level_panel/super_star').off; else UI.q(ATTR + 'level_panel/super_star').off = 1;
    if (open) UI.q(ATTR + 'buff/lock').off = 1; else delete UI.q(ATTR + 'buff/lock').off;
    refreshDetail();
    refreshSkills();
    // Ô tick "Trình diễn kỹ năng": sprite checkboxSelected / checkboxUnselected của ChooseHeroView.
    UI.q('mask_down/skill_demo_checkbox/checkbox').img.sp = P.demo !== false ? (VIEW.checkboxSelected || 'ui_255') : (VIEW.checkboxUnselected || 'ui_254');
    // Nhân vật khoá: nút "Bắt đầu" xám (RefreshConfirmButton gán RGMaterial/ui_gray.mat), hiện nút "Mở khóa" + giá giữa màn.
    UI.q('mask_down/btn_ok').gray = !open;
    const unlock = UI.q('mask_down/center_buttons/btn_unlock');
    if (open) unlock.off = 1; else { delete unlock.off; unlock.p = [0, 120]; }
    // Nút lưu tranh chỉ hiện khi nhân vật có tranh (ảnh chụp 8.6: tranh pixel của Cassandra không có nút này).
    const saveBtn = UI.q('ui_choose_hero_drawing_buttons/save_drawing_button');
    if ((LA().portraits || {})[id]) delete saveBtn.off; else saveBtn.off = 1;
  }

  function refreshSkills() {
    const id = P.selected, list = skillList(id), cur = curSlot(), ys = SKILL_Y[cur] || SKILL_Y[0];
    for (let i = 0; i < 3; i++) {
      const n = UI.q(SKP + 'skill_' + (i + 1)), s = list[i];
      if (!s || i === cur) { n.off = 1; continue; }
      delete n.off;
      n.p = [0, ys[i]];
      const b = SKP + 'skill_' + (i + 1) + '/', open = SK.profile.isSkillUnlocked(id, i) && isUnlocked(id);
      const pr = skillPrice(id, i);
      UI.q(b + 'up/name').txt.s = s.name;
      UI.q(b + 'up/name').txt.c = open ? SK_COL.name : SK_COL.lockName;
      const sub = UI.q(b + 'up/mask/content');
      sub.txt.s = open ? TERM('tips/skill_' + (i + 1)) : pr.kind === 'gems' ? TERM('tips/gem_unlock') : TERM('tips/iap_unlock');
      sub.txt.c = open ? SK_COL.sub : SK_COL.lockSub;
      const icon = UI.q(b + 'up/icon_bg/icon');
      icon.img.c = open ? [1, 1, 1, 1] : SK_COL.lockIcon;
      icon.gray = !open;
      if (open) UI.q(b + 'up/icon_bg/lock').off = 1; else delete UI.q(b + 'up/icon_bg/lock').off;
      UI.q(b + 'line').img.sp = VIEW.grayLine || 'ui_262';
    }
    const d = UI.q(SKP + 'skill_detail'), s = list[cur];
    d.p = [d.p[0], ys[cur]];
    UI.q(SKP + 'skill_detail/name').txt.s = s.name;
    if (isUnlocked(id)) UI.q(SKP + 'skill_detail/icon_bg/lock').off = 1; else delete UI.q(SKP + 'skill_detail/icon_bg/lock').off;
    // [ĐO] GetSkillDetailDescription ghép mô tả với dòng "skill_cd_description" trong thẻ <color=#cececf>.
    const cd = s.cd ? '\n<color=#cececf>' + TERM('skill_cd_description').replace('{0}', String(s.cd).replace('.', ',')) + '</color>' : '';
    const desc = UI.q(SKP + 'skill_detail/scroll_view/viewport/content/description');
    if (desc.txt.s !== s.desc + cd) { desc.txt.s = s.desc + cd; descScroll = 0; }
  }

  // Ô mô tả kỹ năng cuộn được (ScrollRect gốc): con lăn / kéo.
  let descScroll = 0;
  function descLayout() {
    const desc = UI.q(SKP + 'skill_detail/scroll_view/viewport/content/description');
    const view = UI.q(SKP + 'skill_detail/scroll_view'), h = SK.ugui.textSize(desc.txt, desc.sz[0]).h + 4;
    const maxS = Math.max(0, h - view.sz[1]);
    descScroll = Math.max(0, Math.min(maxS, descScroll));
    UI.q(SKP + 'skill_detail/scroll_view/viewport/content').p = [-140, descScroll];
    const size = Math.min(1, view.sz[1] / h), v = maxS > 0 ? 1 - descScroll / maxS : 1, lo = v * (1 - size);
    UI.q(SKP + 'skill_detail/scroll_view/scrollbar/Sliding Area/Handle').a = [0, lo, 1, lo + size];
  }

  function refreshDetail() {
    const b = ATTR, arrow = UI.q(b + 'detail_arrow'), bg = UI.q(b + 'detail_bg'), btn = UI.q(b + 'upgraded_detail_button');
    const panelBg = UI.q('ui_left/panel/bg');
    if (!detail) {
      arrow.off = 1; bg.off = 1; btn.p = [btn.p[0], FOLD_Y]; panelBg.sz = [0, 0];
      return;
    }
    delete arrow.off; delete bg.off; btn.p = [btn.p[0], UNFOLD_Y]; panelBg.sz = [0, UNFOLD_GROW];
    arrow.p = [UI.q(b + detail).p[0], -130];
    const id = P.selected, text = UI.q(b + 'detail_bg/text'), wi = UI.q(b + 'detail_bg/weapon_info');
    if (detail === 'buff') {
      delete text.off; wi.off = 1;
      text.txt.s = tr(id).passive || DS.heroes[id].passive || '—';
      text.txt.f = 'pixel_bold'; text.txt.fs = 22;
    } else {
      text.off = 1; delete wi.off;
      const w = DS.weapons[DS.heroes[id].weapon] || {};
      UI.q(b + 'detail_bg/weapon_info/atk/text').txt.s = String(w.dmg || 0);
      UI.q(b + 'detail_bg/weapon_info/consume/text').txt.s = String(w.cost || 0);
      UI.q(b + 'detail_bg/weapon_info/critic/text').txt.s = String(w.crit || 0);
      UI.q(b + 'detail_bg/weapon_info/accurate/text').txt.s = String(w.spread || 0);
    }
  }

  // ---------------------------------------------------------------- thanh trượt nhân vật (SkinScrollView + skin_cell)
  const mod = (a, n) => ((a % n) + n) % n;
  const cells = {};
  function cellOf(id) {
    let c = cells[id];
    if (!c) {
      c = cells[id] = SK.ugui.clone(CELL);
      c.n = 'hero:' + id;
      for (const k of c.k) if (k.n === 'redPoint' || k.n === 'trial' || k.n === 'skin_trial') k.off = 1;
      const img = c.k.find(k => k.n === 'img');
      img.draw = (ctx, R) => fitSprite(ctx, heroFrame0(id), R);
    }
    return c;
  }
  function carouselTick() {
    const N = HEROES.length, t = now();
    if (car.anim) {
      const u = Math.min(1, (t - car.t0) / SNAP_T);
      car.pos = car.from + (car.to - car.from) * easeInOutCubic(u);
      if (u >= 1) car.anim = false;
    }
    const content = UI.q(CAR), clip = CELL.an.skin_item_scroll, mb = CELL.mbd.SkinCell, base = Math.round(car.pos);
    content.k = [];
    for (let o = -3; o <= 3; o++) {
      const idx = base + o, pos = (idx - car.pos) * CELL_IV + CELL_OFF;
      if (pos < -0.001 || pos > 1.001) continue;
      const id = HEROES[mod(idx, N)], c = cellOf(id), sel = id === P.selected, open = isUnlocked(id);
      SK.ugui.pose(c, clip, pos);
      const part = n => c.k.find(k => k.n === n);
      part('bg').img.sp = sel ? mb.lightBackground : mb.darkBackground;
      part('img').gray = !open;
      if (open) part('lock').off = 1; else delete part('lock').off;
      // Khung + sao dưới ô = đã phá đảo bằng nhân vật này (PassGameLevel); bản web ghi khi thắng một lượt.
      for (const k of ['frame', 'star']) { if (P.won[id]) delete part(k).off; else part(k).off = 1; }
      content.k.push(c);
    }
  }
  function nearestIdx(heroIdx) {
    const N = HEROES.length, base = Math.round(car.pos);
    let best = base, bd = 1e9;
    for (let o = -N; o <= N; o++) { const i = base + o; if (mod(i, N) === heroIdx && Math.abs(i - car.pos) < bd) { bd = Math.abs(i - car.pos); best = i; } }
    return best;
  }
  function scrollTo(id, instant) {
    const target = nearestIdx(HEROES.indexOf(id));
    if (instant) { car.pos = car.to = target; car.anim = false; return; }
    Object.assign(car, { from: car.pos, to: target, t0: now(), anim: true });
  }

  function select(id, instant) {
    if (!DS.heroes[id] || !(D.heroes && D.heroes[id])) return false;
    P.selected = id; save();
    demoT = 0; detail = null;
    scrollTo(id, instant || !UI);
    refresh();
    return true;
  }
  function step(d) {
    const i = HEROES.indexOf(P.selected);
    select(HEROES[(i + d + HEROES.length) % HEROES.length]);
  }

  // ---------------------------------------------------------------- vẽ + bấm
  function canvasSize() {
    const dpr = SK.view.dpr || 1, W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  function drawUI() {
    if (!cv || !ui()) return;
    canvasSize();
    const u = Math.min(1, (now() - slideAt) / SLIDE_T), e = easeOutQuad(u);
    for (const [path, hide] of SLIDE) UI.q(path).p = [hide[0] * (1 - e), hide[1] * (1 - e)];
    carouselTick();
    descLayout();
    cx2.setTransform(1, 0, 0, 1, 0, 0);
    cx2.clearRect(0, 0, cv.width, cv.height);
    if (P.view !== 'pix') drawPortrait();
    UI.draw(cx2, cv.width, cv.height);
    const r = rect('mask_down/btn_ok'), b = $('sk-start').style;
    if (r) { b.left = r.x + 'px'; b.top = r.y + 'px'; b.width = r.w + 'px'; b.height = r.h + 'px'; }
  }
  function drawPortrait() {
    const im = portrait(P.selected);
    if (!im) return;
    const k = cv.height / 720, w = im.naturalWidth * DRAW_SCALE * k, h = im.naturalHeight * DRAW_SCALE * k;
    cx2.imageSmoothingEnabled = false;
    cx2.drawImage(im, Math.round(cv.width / 2 - w / 2), Math.round(DRAW_CY * k - h / 2), Math.round(w), Math.round(h));
  }

  function rectPx(path) { return UI && UI.rectOf(path, cv.width, cv.height); }
  // Rect CSS px của một nút prefab ('hero:<id>' = ô nhân vật trên thanh trượt, 'skill:<i>' = ô kỹ năng i).
  function rect(path) {
    if (!ui()) return null;
    if (path.startsWith('hero:')) path = CAR + '/' + path + '/bg';
    else if (path.startsWith('skill:')) {
      const i = +path.slice(6);
      path = i === curSlot() ? SKP + 'skill_detail' : SKP + 'skill_' + (i + 1) + '/bg';
    }
    const r = rectPx(path), d = SK.view.dpr || 1;
    return r && { x: r.x / d, y: r.y / d, w: r.w / d, h: r.h / d };
  }
  const busy = () => !$('hs-modal').hidden || !$('hs-modes').hidden;

  function click(x, y) {
    const inR = p => { const r = rect(p); return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
    const tap = () => sfx(VIEW.tapClip);
    if (inR('mask_down/center_buttons/btn_unlock')) { tap(); buyHero(); return; }
    if (inR('mask_up/btn_back')) { tap(); if (SK.QUICK || !SK.hall) openModes(); else SK.hall.enter('select'); return; }
    if (inR(CUR + 'show_currency_widget')) { tap(); openShop(); return; }
    if (inR('mask_down/ui_left_button/button')) { tap(); step(-1); return; }
    if (inR('mask_down/ui_right_button/button')) { tap(); step(1); return; }
    if (inR('mask_down/skill_demo_checkbox')) { tap(); P.demo = P.demo === false; save(); refresh(); return; }
    if (inR(ATTR + 'upgraded_detail_button')) { tap(); openPath(); return; }
    for (const k of ['buff', 'weapon']) {
      if (inR(ATTR + k)) { tap(); detail = detail === k ? null : k; refreshDetail(); return; }
    }
    if (inR(ATTR + 'jewelry')) { tap(); info('Trang sức', '<p>Chưa đeo trang sức.</p><p class="hs-note">Trang sức chưa có ở bản web.</p>'); return; }
    const db = 'ui_choose_hero_drawing_buttons/';
    if (inR(db + 'change_button')) { tap(); P.view = P.view === 'pix' ? 'art' : 'pix'; save(); refresh(); return; }
    if (inR(db + 'save_drawing_button')) { tap(); saveDrawing(); return; }
    if (inR(db + 'customization_button')) { tap(); info('Tuỳ chỉnh', '<p class="hs-note">Tuỳ chỉnh ngoại hình chưa có ở bản web.</p>'); return; }
    for (let i = 0; i < 3; i++) {
      if (i !== curSlot() && inR('skill:' + i)) { clickSkill(i); return; }
    }
    for (const id of HEROES) {
      if (inR('hero:' + id)) { if (id !== P.selected) { tap(); select(id); } return; }
    }
    if (detail && !inR('ui_left/panel')) { detail = null; refreshDetail(); }
  }
  function saveDrawing() {
    const id = P.selected;
    const a = document.createElement('a');
    a.href = ART + 'portrait/' + id + '.png'; a.download = id + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function bindCanvas() {
    let down = null;
    const toCss = e => [e.clientX, e.clientY];
    cv.addEventListener('pointerdown', e => {
      if (G.state !== 'lobby' || busy()) return;
      const [x, y] = toCss(e), inR = p => { const r = rect(p); return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
      down = { x, y, moved: false, car: inR('mask_down/skin_scroll_view'), desc: inR(SKP + 'skill_detail/scroll_view'), pos: car.pos, scroll: descScroll };
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* đã nhả */ }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (!down) return;
      const [x, y] = toCss(e), k = (SK.view.dpr || 1) * 720 / cv.height;
      if (Math.hypot(x - down.x, y - down.y) > 8) down.moved = true;
      if (!down.moved) return;
      // [ĐO] Scroller.OnDrag: vị trí = bắt đầu − Δx / bề ngang viewport × scrollSensitivity.
      if (down.car) { car.anim = false; car.pos = down.pos - (x - down.x) * k / VIEWPORT_W * SENS; }
      else if (down.desc) descScroll = down.scroll - (y - down.y) * k;
    });
    const up = e => {
      if (!down) return;
      const d = down; down = null;
      if (!d.moved) { click(d.x, d.y); return; }
      if (d.car) {
        const idx = Math.round(car.pos), id = HEROES[mod(idx, HEROES.length)];
        Object.assign(car, { from: car.pos, to: idx, t0: now(), anim: true });
        if (id !== P.selected) { P.selected = id; save(); detail = null; demoT = 0; refresh(); sfx(VIEW.tapClip); }
      }
      void e;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { down = null; });
    cv.addEventListener('wheel', e => {
      if (G.state !== 'lobby' || busy()) return;
      const x = e.clientX, y = e.clientY, r = rect(SKP + 'skill_detail/scroll_view');
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { descScroll += e.deltaY * 0.5; e.preventDefault(); }
    }, { passive: false });
  }

  function build() {
    if (built) return;
    built = true;
    cv = $('hs-ui'); cx2 = cv.getContext('2d');
    bindCanvas();
    $('hs-mode-close').onclick = () => { $('hs-modes').hidden = true; };
    $('hs-modal').onclick = e => { if (e.target === $('hs-modal')) closeDialog(); };
  }

  function clickSkill(slot) {
    const id = P.selected;
    if (SK.profile.isSkillUnlocked(id, slot) && isUnlocked(id)) { sfx(VIEW.selectSkillClip); P.slot[id] = slot; save(); refresh(); return; }
    sfx(VIEW.tapClip);
    const s = skillList(id)[slot];
    if (!isUnlocked(id)) { info('Kỹ năng ' + (slot + 1), '<p>' + esc(TERM('tips/unlock_character_first')) + ' (' + esc(heroName(id)) + ').</p>'); return; }
    buy({ title: 'Mở kỹ năng: ' + s.name, price: skillPrice(id, slot), done() { SK.profile.unlockSkill(id, slot); P.slot[id] = slot; save(); refresh(); } });
  }

  // ---------------------------------------------------------------- hộp thoại
  function dialog(html, buttons) {
    const dlg = $('hs-dlg');
    dlg.innerHTML = html + '<div class="hs-btns">' + buttons.map((b, i) => '<button class="hs-btn' + (b.cls ? ' ' + b.cls : '') + '" data-i="' + i + '"' +
      (b.id ? ' id="' + b.id + '"' : '') + (b.disabled ? ' disabled' : '') + '>' + esc(b.label) + '</button>').join('') + '</div>';
    for (const el of dlg.querySelectorAll('.hs-btns button')) el.onclick = () => { const b = buttons[+el.dataset.i]; (b.fn || closeDialog)(); };
    $('hs-modal').hidden = false;
  }
  function closeDialog() { $('hs-modal').hidden = true; }
  const info = (title, body) => dialog('<h3>' + esc(title) + '</h3>' + body, [{ label: 'Đóng', id: 'hs-close' }]);
  const gemImg = '<img src="' + ART + 'ui/gem.png" alt="">';

  // Mua một món: đá quý thì trừ ngay (không đủ thì chặn), tiền thật thì qua hộp thanh toán giả.
  function buy(item) {
    const pr = item.price;
    if (pr.kind === 'free') { item.done(); return; }
    if (pr.kind === 'money') { fakePay(item.title, pr.amount, () => { item.done(); toastDlg('Đã mở khoá!', item.title); }); return; }
    const enough = P.gems >= pr.amount;
    dialog('<h3>' + esc(item.title) + '</h3><p class="hs-price">' + gemImg + ' ' + fmt(pr.amount) + '</p>' +
      '<p>Bạn đang có ' + fmt(P.gems) + ' đá quý.</p>' +
      (pr.orig ? '<p class="hs-note">Game gốc: ' + esc(pr.orig) + '. Bản web cho đổi bằng đá quý (giá ước lượng).</p>' : '') +
      (enough ? '' : '<p class="hs-bad" id="hs-short">Không đủ đá quý — thiếu ' + fmt(pr.amount - P.gems) + '.</p>'),
    enough
      ? [{ id: 'hs-buy', label: 'Mua', cls: 'ok', fn() { if (SK.profile.spend(pr.amount)) { item.done(); toastDlg('Đã mở khoá!', item.title); } } }, { label: 'Huỷ' }]
      : [{ id: 'hs-buy', label: 'Mua', disabled: true }, { id: 'hs-to-shop', label: 'Cửa hàng', cls: 'ok', fn: openShop }, { label: 'Huỷ' }]);
  }
  function fakePay(title, usd, done) {
    dialog('<h3 class="hs-fake">Thanh toán giả lập — không trừ tiền thật</h3><p>' + esc(title) + '</p>' +
      '<p class="hs-price">$' + usd.toFixed(2) + '</p>' +
      '<p class="hs-note">Bản web làm lại: không nối cổng thanh toán nào, bấm mua là nhận ngay.</p>',
    [{ id: 'hs-pay-ok', label: 'Xác nhận mua', cls: 'ok', fn: done }, { label: 'Huỷ' }]);
  }
  function toastDlg(title, body) { dialog('<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>', [{ label: 'OK', id: 'hs-close', cls: 'ok' }]); }

  // Gói đá quý [ƯỚC LƯỢNG] theo giá cửa hàng SK.
  const PACKS = [[0.99, 500], [1.99, 1100], [4.99, 3000], [9.99, 6500], [19.99, 14000], [49.99, 38000]];
  function openShop() {
    dialog('<h3>Cửa hàng đá quý</h3><p class="hs-note">Mọi gói đều mua giả lập — không trừ tiền thật.</p><div class="hs-packs">' +
      PACKS.map(([usd, g], i) => '<button class="hs-pack" data-pack="' + i + '">' + gemImg + '<b>' + fmt(g) + '</b><span>$' + usd.toFixed(2) + '</span></button>').join('') +
      '</div>', [{ label: 'Đóng', id: 'hs-close' }]);
    for (const el of document.querySelectorAll('.hs-pack')) {
      el.onclick = () => {
        const [usd, g] = PACKS[+el.dataset.pack];
        fakePay(fmt(g) + ' đá quý', usd, () => { SK.profile.addGems(g); toastDlg('Đã nhận ' + fmt(g) + ' đá quý', 'Số dư: ' + fmt(P.gems)); });
      };
    }
  }

  function openPath() {
    const id = P.selected, ups = DS.heroes[id].upgrades || [], lv = P.level[id] || 0, nx = ups[lv];
    const rows = ups.map((u, i) => '<li class="' + (i < lv ? 'done' : '') + '"><span>Cấp ' + u.level + ' · ' + esc(upVi(u.upgrade)) +
      (upgradeLive(u.upgrade) ? '' : ' <small>(chưa có hiệu lực ở bản web)</small>') + '</span><span>' + (i < lv ? 'Xong' : gemImg.replace('alt=""', 'alt="" style="width:1em;vertical-align:-.15em"') + ' ' + fmt(u.cost)) + '</span></li>').join('');
    const btn = !isUnlocked(id) ? [{ label: 'Mở khoá nhân vật trước', disabled: true }]
      : nx ? [{ id: 'hs-up', label: 'Nâng lên cấp ' + nx.level + ' (' + fmt(nx.cost) + ')', cls: 'ok', disabled: P.gems < nx.cost,
        fn() { if (SK.profile.spend(nx.cost)) { P.level[id] = lv + 1; save(); sfx(VIEW.upgradeClip); refresh(); openPath(); } } }] : [];
    dialog('<h3>Lộ trình nâng cấp — ' + esc(heroName(id)) + '</h3><ul class="hs-ups">' + rows + '</ul>', btn.concat([{ label: 'Đóng', id: 'hs-close' }]));
  }

  // ---------------------------------------------------------------- chọn chế độ (ảnh i)
  const MODES = [
    { id: 'level', name: 'Chế độ màn chơi', img: 'mode_level.png', ok: true,
      start: () => { if (SK.G.state === 'hall') launch(P.selected); },
      desc: 'Ba tầng, mỗi tầng một vùng đất ngẫu nhiên (Rừng Rậm, Băng Nguyên, Lâu Đài, Núi Lửa...), 5 màn, trùm ở màn cuối. Chơi một mình.' },
    { id: 'season', name: 'Chế độ mùa giải', img: 'mode_season.png', isNew: true, ok: true,
      desc: 'Thoát khỏi Monkia: căn cứ giữa rừng thông, qua cổng xoáy ra Ngoại ô căn cứ, đánh khỉ, mở thùng, về điểm rút lui mang đồ về.',
      start: () => SK.SEASON && SK.SEASON.start && SK.SEASON.start(SK.profile.selected || 'knight') },
    { id: 'warfront', name: 'Tiền tuyến cổ đại', img: 'mode_warfront.png', desc: 'Sắp ra mắt.' }
  ];
  let modeSel = 'level';
  function openModes() {
    $('hs-mode-list').innerHTML = MODES.map(m => '<button class="hs-mode' + (m.id === modeSel ? ' sel' : '') + '" data-mode="' + m.id +
      '" style="background-image:url(' + ART + m.img + ')">' + (m.isNew ? '<i class="hs-new">MỚI!</i>' : '') +
      (m.ok ? '' : '<i class="hs-soon">Sắp ra mắt</i>') + '<span>' + m.name + '</span></button>').join('');
    for (const el of document.querySelectorAll('.hs-mode')) el.onclick = () => { modeSel = el.dataset.mode; openModes(); };
    const m = MODES.find(x => x.id === modeSel);
    $('hs-mode-title').textContent = m.name;
    $('hs-mode-name').textContent = m.name;
    $('hs-mode-img').src = ART + m.img;
    $('hs-mode-desc').textContent = m.desc;
    const go = $('hs-mode-go');
    go.disabled = !m.ok;
    go.textContent = m.ok ? 'Bắt đầu' : 'Sắp ra mắt';
    go.onclick = () => { if (m.ok) { $('hs-modes').hidden = true; if (m.start) m.start(); } };
    const f = heroFrame0(P.selected);
    if (f) drawFit($('hs-mode-face'), f, { feet: true });
    $('hs-modes').hidden = false;
  }

  // ---------------------------------------------------------------- vào trận / kết quả
  function applySkillSlot(id) {
    const h = DS.heroes[id];
    if (!h._skill0) h._skill0 = h.skill;
    const slot = P.slot[id] || 0, sk = (h.skills || [])[slot];
    // Kỹ năng 2/3 chỉ dùng khi mô-đun kỹ năng đã có; chưa có thì giữ kỹ năng 1 (actors.js sẽ rơi về Song Thủ).
    h.skill = slot > 0 && sk && SK.SKILLS && SK.SKILLS[slug(sk.name)]
      ? Object.assign({}, h._skill0, { id: slug(sk.name), name: sk.name, cd: sk.cd || h._skill0.cd, dur: 0 })
      : h._skill0;
  }
  function buyHero() {
    const id = P.selected;
    buy({ title: 'Mở khoá ' + heroName(id), price: heroPrice(id), done() { SK.profile.unlock(id); refresh(); } });
  }
  // Bấm chuột vào #sk-start thì sfx.js đã phát fx_btn_start; phím Enter thì tự phát startClip của ChooseHeroView.
  function onStart(e) {
    if (!$('hs-modes').hidden) return;
    const id = P.selected, key = !e;
    if (!isUnlocked(id)) { if (key) sfx(VIEW.tapClip); buyHero(); return; }
    if (key) sfx(VIEW.startClip);
    closeDialog();
    // Bản gốc: chọn xong thì điều khiển nhân vật trong sảnh, đi vào cửa mới ra bảng chế độ. ?quick=1 vào hầm luôn.
    if (SK.QUICK || !SK.hall) launch(id); else SK.hall.enter('walk', id);
  }
  function launch(id) { applySkillSlot(id); SK.startRun(id); }

  SK.on('runStart', G2 => {
    const p = G2.player; if (!p) return;
    const b = upgradeBonus(p.hero);
    p.hpMax += b.hp; p.hp += b.hp; p.armorMax += b.armor; p.armor += b.armor; p.energyMax += b.energy; p.energy += b.energy;
  });

  // Đá quý cuối lượt: theo số quái hạ + số màn đã qua [ƯỚC LƯỢNG]; SK gốc cũng trả theo quái hạ + tầng đạt được.
  let pending = null;
  SK.on('runEnd', (G2, r) => {
    const cleared = r.won ? SK.STAGES.length : G2.stageIdx;
    const gems = Math.round(r.kills + cleared * 10 + (r.won ? 100 : 0));
    const hero = G2.player ? G2.player.hero : P.selected;
    P.gems += gems;
    if (r.won) P.won[hero] = 1;
    save();
    pending = { hero, stage: r.stage, kills: r.kills, gold: r.gold, won: r.won, cleared, gems };
  });
  function showSummary() {
    const s = pending; pending = null;
    dialog('<h3>' + (s.won ? 'Chiến thắng!' : 'Kết quả lượt chơi') + '</h3>' +
      '<p>' + esc(heroName(s.hero)) + ' · tới màn ' + esc(s.stage) + ' · qua ' + s.cleared + ' màn</p>' +
      '<p>Hạ ' + s.kills + ' quái · ' + s.gold + ' vàng</p>' +
      '<p class="hs-price">+' + fmt(s.gems) + ' ' + gemImg + '</p>' +
      '<p class="hs-note">Đá quý = số quái hạ + 10 mỗi màn qua (+100 khi thắng) — công thức ước lượng.</p>',
    [{ label: 'Nhận', id: 'hs-claim', cls: 'ok' }]);
  }

  // ---------------------------------------------------------------- nền sảnh + nhân vật pixel trên canvas chính
  const hall = new Image();
  hall.src = ART + 'hall.png';
  const CIRCLE = [215, 297];   // tâm vòng phép trong hall.png (đo trên ảnh)
  let t = 0, demoT = 0;

  function drawPixelHero(ctx, id, x, y, tt) {
    const moving = P.demo !== false && Math.abs(Math.cos(tt * 0.9)) > 0.3;
    const face = P.demo !== false ? (Math.cos(tt * 0.9) >= 0 ? 1 : -1) : 1;
    const key = moving ? heroAnim(id, 'run') : heroAnim(id, 'idle');
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    SK.draw(ctx, SK.animFrame(key, tt), x, y, { flip: face < 0 });
    const w = DS.weapons[DS.heroes[id].weapon];
    const hand = DS.heroes[id].hand || [3, 6];
    if (w && SK.drawGun) SK.drawGun(ctx, w.sprite, x + hand[0] * face, y - hand[1], face > 0 ? 0 : Math.PI, null, {});
  }

  SK.lobby = {
    enter() {
      G.state = 'lobby'; G.player = null; G.map = null;
      SK.setOverlay('sk-lobby');
      $('sk-lobby').classList.remove('only-modes');
      build();
      $('hs-modes').hidden = true;
      closeDialog();
      $('sk-start').onclick = onStart;
      detail = null;
      slideAt = now();
      scrollTo(P.selected, true);
      refresh();
      if (pending) showSummary();
    },
    update(dt) {
      t += dt; demoT += dt;
      const I = SK.input;
      const ae = document.activeElement, onBtn = ae && ae.tagName === 'BUTTON' && ae.id !== 'sk-start';
      if (I.hit('confirm') && !busy() && !onBtn) onStart();
      if (!busy()) { if (I.hit('left')) step(-1); if (I.hit('right')) step(1); }
    },
    render(ctx) {
      const v = SK.view, pix = P.view === 'pix', id = P.selected;
      ctx.fillStyle = '#07090d'; ctx.fillRect(0, 0, v.w, v.h);
      const z = pix ? Math.max(2, Math.round(v.h / 64)) : 1;
      const cx = Math.round(v.w / 2), cy = Math.round(v.h * (pix ? 0.6 : 0.5));
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(z, z);
      const ox = pix ? CIRCLE[0] : hall.width / 2, oy = pix ? CIRCLE[1] : hall.height / 2;
      if (hall.complete && hall.naturalWidth) ctx.drawImage(hall, -Math.round(ox), -Math.round(oy));
      if (pix) {
        const x = P.demo !== false ? Math.round(Math.sin(demoT * 0.9) * 22) : 0;
        drawPixelHero(ctx, id, x, 2, demoT);
      }
      ctx.restore();
      if (!pix) { ctx.fillStyle = 'rgba(4,10,18,0.6)'; ctx.fillRect(0, 0, v.w, v.h); }
      drawUI();
    },
    select, openModes, openShop, refresh, launch,
    // Móc kiểm thử: rect CSS px của nút prefab, chữ đang hiện trên nút, và trạng thái màn.
    rect,
    text: path => { const n = ui() && UI.q(path); return n && n.txt ? String(n.txt.s) : null; },
    state: () => ({ ready: !!ui(), selected: P.selected, name: UI && UI.q('mask_up/layout/text_name').txt.s,
      startGray: !!(UI && UI.q('mask_down/btn_ok').gray), unlockShown: !!(UI && !UI.q('mask_down/center_buttons/btn_unlock').off),
      view: P.view, demo: P.demo !== false, detail, slot: curSlot(), carousel: car.pos,
      cells: UI ? UI.q(CAR).k.map(c => c.n.slice(5)) : [], heroes: HEROES.slice(), skills: skillList(P.selected).length })
  };
})();
