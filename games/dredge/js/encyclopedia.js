/*
 * Bách khoa (Encyclopedia / EncyclopediaWindow, phím L; "Encyclopedia [L]" trong khoang): sách hai trang, mỗi trang một loài cá.
 * Cây RectTransform, sprite, màu và thứ tự cá (Encyclopedia.allFish) lấy từ data/encyclopedia.js (tools/book_ui.py), dựng bằng js/book_kit.js.
 *   DREncyclopedia.open(opts?)  .close()  .isOpen()  ._debug()  ._go(id)
 * Logic theo Encyclopedia.cs / EncyclopediaPage.cs:
 *   - Trang trái = currentIndex (chẵn), trang phải = +1; "PAGE n/m" = ceil((i + 1) / 2) / ceil(đếm / 2); "Discovered: x/y" = số loài đã bắt trong danh sách lọc.
 *   - Q / E (TabLeft / TabRight) lật trang; nút loại (trái, COASTAL...): bấm = lọc theo loại như OnHarvestTypeButtonClicked
 *     (đang đủ loại thì bấm một loại = chỉ loại đó; bấm lại loại đang chọn = bỏ; hết loại thì trở về đủ); nút vùng (phải): nhảy tới con cá đầu tiên của vùng
 *     (OnZoneButtonClicked); Exotic = locationHiddenUntilCaught, Aberrations = isAberration. Nút vùng của cá trên trang to ra 250 (zoneButtonWidthSelected).
 *   - Chưa bắt (SaveData.GetCaughtCountById = 0): tên "???", ảnh là bóng đen mờ + vòng "?" đỏ, mô tả "???", cỡ "-", giá "???" tới khi bán một con.
 *   - Giá, kích thước lớn nhất: bán / bắt lưu trong DR.s.vars ('enc-sold-<id>', 'enc-largest-<id>' = kích thước chuẩn hoá 0..1 như SaveData.GetLargestFishRecordById);
 *     web trước đây không ghi hai số này nên bản lưu cũ hiện "-" cho cỡ tới lần bắt sau.
 *   - Bóng huy chương aberration: AberrationInfoUI (ảnh bóng mờ + "?" xanh khi chưa bắt); bấm = nhảy tới trang của nó (PageLinkRequest).
 * Chữ lấy từ DR_STR (khoá gốc): tiếng Anh gốc như các cửa sổ gốc khác; phông Front Page Neue không có dấu tiếng Việt.
 */
(function (root) {
  'use strict';
  const K = root.DRBookKit, B = root.DR_BOOK;
  if (!K || !B) return;
  const E = B.enc, EP = E.p;
  const STR = k => (root.DR_STR && DR_STR[k]) || '';
  const D = () => root.DR;
  const ITEMS = () => root.DR_ITEMS;
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; };
  const COL = Object.fromEntries(Object.entries(B.colors).map(([k, v]) => [k, hex(v)]));
  const HT = () => ((root.DR_WORLD || {}).HarvestTypeTagConfig || {}).HarvestTypeTagConfig || { colorLookup: {}, textColorLookup: {}, stringLookup: {} };
  const CFG = () => root.DR_CONFIG || {};
  const TYPES = ['COASTAL', 'SHALLOW', 'OCEANIC', 'ABYSSAL', 'HADAL', 'MANGROVE', 'VOLCANIC', 'CRAB'];       // Encyclopedia.harvestTypes (ICE cần DLC)
  const ZONES = ['THE_MARROWS', 'GALE_CLIFFS', 'STELLAR_BASIN', 'TWISTED_STRAND', 'DEVILS_SPINE', 'OPEN_OCEAN'];     // Encyclopedia.zones (PALE_REACH cần DLC)
  const ZONE_LABEL = { THE_MARROWS: 'label.the-marrows', GALE_CLIFFS: 'label.gale-cliffs', STELLAR_BASIN: 'label.stellar-basin', TWISTED_STRAND: 'label.twisted-strand',
    DEVILS_SPINE: 'label.devils-spine', OPEN_OCEAN: 'label.open-ocean' };
  const ZONE_BTN = ['EncyclopediaZoneTabButton', 'EncyclopediaZoneTabButton (1)', 'EncyclopediaZoneTabButton (2)', 'EncyclopediaZoneTabButton (3)',
    'EncyclopediaZoneTabButton (4)', 'EncyclopediaZoneTabButton (5)'];                                       // 0..5 = ZONES; (6) Exotic, (7) Aberrations; (8) Pale Reach (DLC, tắt)
  const EXOTIC = 'EncyclopediaZoneTabButton (6)', ABER = 'EncyclopediaZoneTabButton (7)';
  const KEEP_OFF = new Set(['UndiscoveredItemImage', 'AberrationInfo', 'AberrationInfo (1)', 'AberrationInfo (2)']);
  const PAGES = ['PageLeft', 'PageRight'];
  const C = 'Encyclopedia/';

  // trạng thái giữ giữa các lần mở (Encyclopedia là một component sống, giữ filteredTypes / currentIndex)
  const ST = { filter: new Set(TYPES), cur: 0 };
  let host = null, ctx = null, S = null, scale = 1, fadeT = 0;

  // ------------------------------------------------------------------ danh sách cá
  function allFish() {
    const I = ITEMS(), out = [];
    for (const id of E.fish) {
      const it = I[id];
      if (!it) continue;
      if ((it.entitlementsRequired || []).some(e => e === 'DLC_1' || e === 'DLC_2')) continue;      // Encyclopedia.Awake: RemoveAll theo entitlement (web không có DLC)
      out.push(it);
    }
    return out;
  }
  let ALL = null;
  const all = () => ALL || (ALL = allFish());
  const caught = id => { const s = D().s; return (s && s.caught && s.caught[id]) | 0; };
  const sold = id => { const s = D().s; return (s && s.vars && s.vars['enc-sold-' + id]) | 0; };
  const largest = id => { const s = D().s; const v = s && s.vars && s.vars['enc-largest-' + id]; return v == null ? null : v; };
  function filtered() { return ST.filter.size === TYPES.length ? all() : all().filter(f => ST.filter.has(f.harvestableType)); }

  // ------------------------------------------------------------------ định dạng (Unity ToString("n2"), GetFormattedFishSizeString, GetFormattedDepthString)
  const n2 = v => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function sizeStr(it, size01) {
    const cm = it.minSizeCentimeters + (it.maxSizeCentimeters - it.minSizeCentimeters) * size01;
    const imp = window.DRMenus && DRMenus.sizeImperial(cm); if (imp) return imp;   // W7: units = 1 (ft/in)
    return cm > 100 ? n2(cm / 100) + ' m' : n2(Math.round(cm * 10) / 10) + ' cm';
  }
  function depthStr(it) {
    const bands = CFG().depthBands || {}, mod = CFG().depthModifier || 1;
    const a = bands[it.minDepth] || [0, 0], b = bands[it.maxDepth] || [0, 0];
    const f = v => (window.DRMenus && DRMenus.depthFt(v * mod, '')) || (Math.round(v * mod * 10) / 10).toFixed(1) + 'm';   // W7: units
    if (it.hasMinDepth && it.hasMaxDepth) return f(a[0]) + ' - ' + f(b[1]);
    if (it.hasMinDepth) return f(a[0]) + ' +';
    if (it.hasMaxDepth) return '0 - ' + f(b[1]);
    return '';
  }
  const fmt = (t, a) => String(t || '').replace(/\{(\d+)\}/g, (m, i) => a[+i]);
  const at = (side, rel) => ctx.byPath[C + PAGES[side] + '/Contents/' + rel];
  const white = [1, 1, 1, 1], black = [0, 0, 0, 1];
  const mulc = (c, f) => [c[0] * f[0], c[1] * f[1], c[2] * f[2], c[3] * f[3]];

  // ------------------------------------------------------------------ dựng
  function build() {
    host.innerHTML = '';
    const tree = Object.assign({}, B.enc.tree, { on: 1 });
    ctx = K.mount(tree, host, {
      skip: n => /^(HoldActionBack|HoldActionFill|HoldDelegateAction)$/.test(n.n) || /^AdvancedType/.test(n.n),
      tint: n => /Icon$|Diamond$|^HarvestableTypeTagButton/.test(n.n) && n.n !== 'AdvancedTypeIcon',        // Image.color đổi lúc chạy: nhân với sprite
      keepOff: n => KEEP_OFF.has(n.n),
      multi: n => n.n === 'DescriptionText',
      on: (n, box, path) => { box.dataset.path = path; }
    });
    // chữ cố định
    K.setText(ctx.byPath['Title/Text'], STR('encyclopedia.header') || 'Encyclopedia');
    // nút lật trang: mũi tên + ô phím Q / E dưới mũi tên (ControlPromptIcon)
    const keyBox = (path, label) => {
      const b = ctx.byPath[path]; if (!b) return;
      const kb = K.el('div', 'bk-key', b); kb.textContent = label;
      kb.style.cssText = 'left:0;top:0;width:100%;height:100%;font-size:' + K.px(32);
    };
    keyBox(C + 'PageControlPrev/ControlPromptIconPrev', 'Q');
    keyBox(C + 'PageControlNext/ControlPromptIconNext', 'E');
    const click = (path, fn) => { const b = ctx.byPath[path]; if (b) { b.classList.add('bk-btn'); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); } };
    click(C + 'PageControlPrev/ArrowImage/ClickTarget', () => turn(-1));
    click(C + 'PageControlNext/ArrowImage/ClickTarget', () => turn(1));
    // nút loại (trái) và nút vùng (phải)
    S.typeBox = TYPES.map((t, i) => ctx.byPath[C + 'Types/' + (i ? 'HarvestableTypeTagButton (' + i + ')' : 'HarvestableTypeTagButton')]);
    S.typeBox.forEach((b, i) => {
      if (!b) return;
      b.classList.add('enc-type', 'bk-btn');
      K.setText(ctx.byPath[b.dataset.path + '/Text'], STR(HT().stringLookup[TYPES[i]]) || TYPES[i]);
      b.addEventListener('click', () => onType(TYPES[i]));
    });
    const zb = ZONE_BTN.concat([EXOTIC, ABER]);
    S.zoneBox = zb.map(n => ctx.byPath[C + 'Zones/' + n]);
    S.zoneBox.forEach((b, i) => {
      if (!b) return;
      b.classList.add('enc-zone', 'bk-btn');
      const t = ctx.byPath[b.dataset.path + '/Text (TMP)'];
      K.setText(t, STR(t._n.tx.k) || t._n.tx.t);
      b.addEventListener('click', () => onZone(i));
    });
    // nhắc phím "Back" (PopupWindow.backAction)
    const back = K.el('button', 'bk-back', host);
    K.el('span', '', back, STR('prompt.back') || 'Back'); K.el('b', '', back, 'Esc');
    back.onclick = () => close();
    host.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ------------------------------------------------------------------ điền một trang
  function fillPage(side, it) {
    const cont = ctx.byPath[C + PAGES[side] + '/Contents'];
    cont.style.visibility = it ? 'visible' : 'hidden';
    if (!it) return;
    const idx = all().indexOf(it), got = caught(it.id) > 0, ht = it.harvestableType;
    const hcol = HT().colorLookup[ht] || HT().colorLookup.NONE || [0.647, 0.537, 0.38, 1];
    const htxt = HT().textColorLookup[ht] || white;
    K.setText(at(side, 'TitleContainer/ItemTitle'), '#' + (idx + 1) + ' ' + (got ? it.name : '???'));
    // ảnh cá: vùng w*128 x h*128 đơn vị, giữa ô ảnh lệch (0,-5), co 0,65 (cây gốc: Border / Image 256x128 scale 0,65)
    const w = (it.w || 1) * 128, h = (it.h || 1) * 128;
    for (const nm of ['Border', 'Image']) {
      const b = at(side, 'TopTextContainer/ImageBackplate/' + nm);
      b.style.width = K.px(w); b.style.height = K.px(h);
      b.style.left = 'calc(50% + var(--s)*' + (-w / 2) + 'px)'; b.style.top = 'calc(50% + var(--s)*' + (5 - h / 2) + 'px)';
    }
    const bd = at(side, 'TopTextContainer/ImageBackplate/Border');
    bd._bg.className = 'bk-bg tile';
    bd._bg.style.setProperty('--sp', K.art(B.sprites.GridSquare.f)); bd._bg.style.setProperty('--tw', K.px(128)); bd._bg.style.setProperty('--th', K.px(128));
    bd._bg.style.opacity = '0.3137';                                                                 // Border: màu đen alpha 0,3137
    const im = at(side, 'TopTextContainer/ImageBackplate/Image');
    im._bg.className = 'bk-bg si pa';
    im._bg.style.setProperty('--sp', it.sprite ? K.art(it.sprite) : 'none');
    im._bg.style.filter = got ? '' : 'brightness(0)';
    im._bg.style.opacity = got ? '1' : String(EP.page.itemImageColorUnidentified[3]);              // itemImageColorUnidentified = đen alpha 0,294
    const un = at(side, 'TopTextContainer/ImageBackplate/UndiscoveredItemImage');
    un.style.display = got ? 'none' : 'block';
    K.setSprite(un, it.isAberration ? 'AberratedQuestionMark' : 'QuestionMark');
    K.setTint(un, it.isAberration ? COL.NEUTRAL : COL.NEGATIVE);
    // thẻ loại + đếm số con + mô tả
    const dc = 'TopTextContainer/DescriptionContainer/';
    K.setTint(at(side, dc + 'TypeTagContainer'), hcol);
    const tt = at(side, dc + 'TypeTagContainer/TypeText');
    K.setText(tt, ht === 'NONE' || ht === 'CRAB' ? fmt(STR('encyclopedia.depth'), [depthStr(it)]) : (STR(HT().stringLookup[ht]) || ht));
    tt._tx.s.style.color = K.rgba(htxt);
    const cc = caught(it.id), neg = COL.NEGATIVE;
    K.setTint(at(side, dc + 'CaughtCountContainer/CaughtCountDiamond'), cc > 0 ? black : neg);
    const ct = at(side, dc + 'CaughtCountContainer/CaughtCount');
    K.setText(ct, cc > 0 ? fmt(STR('encyclopedia.caught-some'), [cc]) : STR('encyclopedia.caught-none'));
    ct._tx.s.style.color = K.rgba(cc > 0 ? black : neg);
    K.setTint(at(side, dc + 'DescriptionBackplate'), hcol);
    const dt = at(side, dc + 'DescriptionBackplate/DescriptionText');
    K.setText(dt, got ? it.desc : '???');
    dt._tx.s.style.color = K.rgba(htxt);
    // vùng: danh sách các vùng, vùng của loài nổi bật (cây gốc có ZoneNameTitle + ảnh vùng; bản demo trong video vẽ danh sách)
    fillZones(side, it, hcol, htxt, got);
    // giá, kích thước lớn nhất
    K.setText(at(side, 'MidContainer/ValueContainer/ValueValue'), sold(it.id) > 0 ? n2(it.value) : '???');
    const lg = got ? largest(it.id) : null;
    K.setText(at(side, 'MidContainer/SizesContainer/SizeValue'), got && lg != null ? sizeStr(it, lg) : '-');
    const trophy = at(side, 'MidContainer/SizesContainer/TrophyIcon');
    const big = got && lg != null && lg > (CFG().trophyMaxSize || 0.85);
    K.setTint(trophy, big ? mulc(COL.VALUABLE, [EP.page.trophyIconColorMultiplier, EP.page.trophyIconColorMultiplier, EP.page.trophyIconColorMultiplier, 1]) : black);
    // ngày / đêm
    const tog = (path, on, idleIcon) => {
      const b = at(side, path); K.setTint(b, on ? hcol : [0.953, 0.902, 0.804, 1]);
      K.setTint(at(side, path + (path.indexOf('Day') >= 0 ? '/DayIcon' : '/NightIcon')), on ? htxt : idleIcon);
    };
    tog('MidContainer/DayNightContainer/DayNightIconContainer/DayContainer', it.day, black);
    tog('MidContainer/DayNightContainer/DayNightIconContainer/NightContainer', it.night, black);
    // cách bắt
    const eq = (nm, on) => {
      const b = at(side, 'MidContainer/AllEquipContainer/EquipList/' + nm + '/EquipBackplate');
      K.setTint(b, on ? hcol : [0.953, 0.902, 0.804, 1]);
      at(side, 'MidContainer/AllEquipContainer/EquipList/' + nm + '/EquipText')._tx.s.style.color = K.rgba(on ? htxt : [0.227, 0.227, 0.227, 1]);
    };
    eq('EquipContainerRod', it.canBeCaughtByRod); eq('EquipContainerTrawl', it.canBeCaughtByNet); eq('EquipContainerPot', it.canBeCaughtByPot);
    fillAberrations(side, it);
  }

  function fillZones(side, it, hcol, htxt, got) {
    const zc = at(side, 'MidContainer/ZonesContainer');
    let list = zc.querySelector('.enc-list');
    if (list) list.remove();
    const title = at(side, 'MidContainer/ZonesContainer/ZoneNameTitle');
    title.style.display = 'none';
    at(side, 'MidContainer/ZonesContainer/ZoneImageContainer').style.display = 'none';           // ảnh vùng của bản 1.5.3 thay bằng danh sách
    list = K.el('div', 'enc-list', zc);
    const hidden = it.locationHiddenUntilCaught && !got;                                              // LocationHiddenUntilCaught & chưa bắt: vùng "???"
    const zones = ZONES.slice();
    const n = zones.length, top = 4, pitch = Math.min(39, (200 - top) / n);                            // video: bước dòng ~39 đơn vị canvas (5 vùng trong khung 200)
    zones.forEach((z, i) => {
      const row = K.el('div', 'enc-zrow', list);
      const on = !hidden && (it.zonesFoundIn || []).indexOf(z) >= 0;
      row.style.top = K.px(top + i * pitch); row.style.height = K.px(Math.min(36, pitch));
      row.style.left = K.px(44); row.style.right = K.px(4);                                       // ZoneNameTitle: pos 20, size -48 trong khung 270 → x 44, rộng 222
      row.style.fontSize = K.px(24.95);
      row.textContent = hidden ? (i === 0 ? '???' : '') : STR(ZONE_LABEL[z]) || z;
      row.style.color = on ? K.rgba(htxt) : '#3a3a3a';
      if (on) row.style.background = K.rgba(hcol);
      row.style.paddingLeft = K.px(8);
    });
    list.style.fontFamily = '"Front Page Neue","Signika",sans-serif';
  }

  function fillAberrations(side, it) {
    const bc = at(side, 'BottomContainer');
    const items = it.isAberration ? (it.nonAberrationParent ? [ITEMS()[it.nonAberrationParent]] : []) : (it.aberrations || []).map(a => ITEMS()[a]).filter(x => x &&
      !(x.entitlementsRequired || []).some(e => e === 'DLC_1' || e === 'DLC_2'));
    bc.style.visibility = items.length ? 'visible' : 'hidden';
    K.setText(at(side, 'BottomContainer/BottomTitle'), (it.isAberration ? STR('encyclopedia.aberration-of') : STR('encyclopedia.aberrations')).toUpperCase());
    const names = ['AberrationInfo', 'AberrationInfo (1)', 'AberrationInfo (2)'];
    names.forEach((nm, i) => {
      const box = at(side, 'BottomContainer/BottomList/' + nm);
      const a = items[i];
      box.style.display = a ? 'block' : 'none';
      if (!a) return;
      const got = caught(a.id) > 0;
      const img = at(side, 'BottomContainer/BottomList/' + nm + '/AberrationImage');
      const q = at(side, 'BottomContainer/BottomList/' + nm + '/QuestionMarkImage');
      img._bg.className = 'bk-bg si pa';
      img._bg.style.setProperty('--sp', a.sprite ? K.art(a.sprite) : 'none');
      img._bg.style.filter = got ? '' : 'brightness(0)';
      img._bg.style.opacity = got ? '1' : String(EP.aberration.unidentified[3]);
      q.style.display = got ? 'none' : 'block';
      K.setSprite(q, a.isAberration ? 'AberratedQuestionMark' : 'QuestionMark');
      K.setTint(q, a.isAberration ? COL.NEUTRAL : COL.NEGATIVE);
      box.classList.add('enc-aber'); box.dataset.id = a.id;
      box.onclick = () => go(a.id);
    });
  }

  // ------------------------------------------------------------------ làm mới
  function refresh() {
    const list = filtered();
    const total = list.length;
    if (!total) { ST.filter = new Set(TYPES); return refresh(); }
    if (ST.cur % 2 === 1) ST.cur--;
    ST.cur = Math.max(0, Math.min(ST.cur, total - 1));
    const pages = Math.ceil(total / 2), page = Math.ceil((ST.cur + 1) / 2);
    const disc = list.filter(f => caught(f.id) > 0).length;
    K.setText(ctx.byPath[C + 'PageCounter/PageCountText'], fmt(STR('encyclopedia.page-counter'), [page, pages]).toUpperCase());
    K.setText(ctx.byPath[C + 'DiscoveryCounter/DiscoveryCountText'], fmt(STR('encyclopedia.discovery-counter'), [disc, total]));
    const L = list[ST.cur], R = list[ST.cur + 1] || null;
    fillPage(0, L); fillPage(1, R);
    // mũi tên lật trang (prevPageGroup / nextPageGroup)
    ctx.byPath[C + 'PageControlPrev'].style.display = ST.cur > 0 ? 'block' : 'none';
    ctx.byPath[C + 'PageControlNext'].style.display = ST.cur + 1 < total - 1 ? 'block' : 'none';
    // nút loại: màu loại, nhân khối màu active / inactive (đủ loại = tất cả sáng)
    S.typeBox.forEach((b, i) => {
      if (!b) return;
      const on = ST.filter.has(TYPES[i]);
      const base = HT().colorLookup[TYPES[i]] || white;
      K.setTint(b, mulc(base, on ? EP.typeActive.m_NormalColor : EP.typeInactive.m_NormalColor));
    });
    // nút vùng: nút của hai con cá trên trang to ra 250 (RefreshZoneButtonPopoutPosition)
    const zi = f => !f ? -1 : f.isAberration ? 7 : f.locationHiddenUntilCaught ? 6 : Math.max(-1, ZONES.findIndex(z => (f.zonesFoundIn || []).indexOf(z) >= 0));
    const sel = [zi(L), R ? zi(R) : zi(L)];
    S.zoneBox.forEach((b, i) => {
      if (!b) return;
      const wide = sel.indexOf(i) >= 0;
      b.style.width = K.px(wide ? EP.zoneButtonWidthSelected : EP.zoneButtonWidthIdle);
      b._wide = wide;
    });
    S.view = { page, pages, discovered: disc, total, left: L && L.id, right: R && R.id };
    for (const b of ctx.texts) K.placeText(b, scale);
  }

  // ------------------------------------------------------------------ điều khiển
  function sfx(k) { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* tiếng là phần phụ */ } }
  function turn(dir) {
    const total = filtered().length;
    if (dir < 0 && ST.cur <= 0) return false;
    if (dir > 0 && !(ST.cur + 1 < total - 1)) return false;
    ST.cur += dir * 2;
    sfx('ui.journal.page.' + (1 + Math.floor(Math.random() * 3)));        // [ĐỀ XUẤT] turnSFX của sách chưa bóc: dùng tiếng lật trang của sổ nhiệm vụ
    fade(); refresh();
    return true;
  }
  function fade() {
    for (const p of PAGES) { const c = ctx.byPath[C + p + '/Contents']; c.classList.add('enc-pg', 'fade'); }
    clearTimeout(fadeT);
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const p of PAGES) ctx.byPath[C + p + '/Contents'].classList.remove('fade'); }));
  }
  function onType(t) {
    if (ST.filter.size === TYPES.length) ST.filter = new Set();
    if (ST.filter.has(t)) ST.filter.delete(t); else ST.filter.add(t);
    if (!ST.filter.size) ST.filter = new Set(TYPES);
    const cur = filtered()[ST.cur]; ST.cur = Math.max(0, filtered().indexOf(cur));         // FilterFishList: giữ con cá đang xem nếu còn trong danh sách
    sfx('ui.button.select'); fade(); refresh();
  }
  function onZone(i) {
    const list = filtered();
    let k = -1;
    if (i <= 5) k = list.findIndex(f => (f.zonesFoundIn || []).indexOf(ZONES[i]) >= 0);
    else if (i === 6) k = list.findIndex(f => f.locationHiddenUntilCaught);
    else k = list.findIndex(f => f.isAberration);
    if (k >= 0) ST.cur = k;
    sfx('ui.button.select'); fade(); refresh();
  }
  function go(id) {                                                                         // PageLinkRequest: lên trang của loài (kể cả khi đang lọc loại khác)
    let k = filtered().findIndex(f => f.id === id);
    if (k < 0) { ST.filter = new Set(TYPES); k = filtered().findIndex(f => f.id === id); }
    if (k >= 0) { ST.cur = k; fade(); refresh(); }
    return k >= 0;
  }
  function onKey(e) {
    const k = e.code;
    if (k === 'KeyQ' || k === 'ArrowLeft') turn(-1);
    else if (k === 'KeyE' || k === 'ArrowRight') turn(1);
  }

  function fit() { if (S) { scale = K.fit(ctx, host, root.innerWidth, root.innerHeight); } }
  function open() {
    if (S) return true;
    if (root.DRBook && DRBook.busy()) return false;
    if (!host) { host = K.el('div', 'bk-host', document.body); host.id = 'dr-enc'; root.addEventListener('resize', fit); }
    S = {};
    ALL = null;
    // SaveData.LastUnseenCaughtSpecies: mở sách ở trang của loài vừa thấy lần đầu
    const s = D().s;
    const last = s && s.vars && s.vars['enc-last-unseen'];
    build();
    if (last) { ST.filter = new Set(TYPES); const k = filtered().findIndex(f => f.id === last); if (k >= 0) ST.cur = k; s.vars['enc-last-unseen'] = ''; }
    host.classList.add('on'); host.classList.remove('show');
    DRBook.modalOn('enc', close, onKey);
    fit(); refresh(); fit();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('50px "Front Page Neue"'), document.fonts.load('600 50px "Hahmlet"')]).then(() => { if (S) { K.resetMetrics(); fit(); refresh(); } }).catch(() => {});
    requestAnimationFrame(() => { if (S) host.classList.add('show'); });
    sfx('ui.journal.open');
    return true;
  }
  function close() {
    if (!S) return false;
    S = null;
    host.classList.remove('on', 'show');
    DRBook.modalOff('enc');
    sfx('ui.journal.close');
    return true;
  }

  // ------------------------------------------------------------------ ghi sổ (SaveData: caughtFishCounts, largestFishRecords, numItemsSold, LastUnseenCaughtSpecies)
  if (root.DR && DR.on) {
    DR.on('catch', ev => {
      const s = D().s; if (!s || !ev || !ev.item || String(ev.item.cls) !== 'FishItemData') return;
      s.vars = s.vars || {};
      if (ev.size != null) { const k = 'enc-largest-' + ev.id; if (!(s.vars[k] >= ev.size)) s.vars[k] = ev.size; }   // largestFishRecords: giữ số lớn nhất
      if (ev.isNew) s.vars['enc-last-unseen'] = ev.id;
    });
    DR.on('itemSold', id => { const s = D().s; if (!s || !id) return; s.vars = s.vars || {}; s.vars['enc-sold-' + id] = (s.vars['enc-sold-' + id] | 0) + 1; });
  }

  root.DREncyclopedia = { open, close, isOpen: () => !!S, _go: go, _turn: turn };
  root.DREncyclopedia._debug = () => {
    if (!S) return null;
    const q = p => ctx.byPath[p] ? K.rect(ctx.byPath[p]) : null;
    const tx = p => ctx.byPath[p] && ctx.byPath[p]._tx ? ctx.byPath[p]._tx.i.textContent : null;
    const page = i => ({ title: tx(C + PAGES[i] + '/Contents/TitleContainer/ItemTitle'), caught: tx(C + PAGES[i] + '/Contents/TopTextContainer/DescriptionContainer/CaughtCountContainer/CaughtCount'),
      desc: tx(C + PAGES[i] + '/Contents/TopTextContainer/DescriptionContainer/DescriptionBackplate/DescriptionText'), type: tx(C + PAGES[i] + '/Contents/TopTextContainer/DescriptionContainer/TypeTagContainer/TypeText'),
      value: tx(C + PAGES[i] + '/Contents/MidContainer/ValueContainer/ValueValue'), size: tx(C + PAGES[i] + '/Contents/MidContainer/SizesContainer/SizeValue'),
      aber: Array.from(ctx.byPath[C + PAGES[i] + '/Contents/BottomContainer/BottomList'].children).filter(c => c.style.display !== 'none').map(c => c.dataset.id), rect: q(C + PAGES[i]) });
    return { scale, view: S.view, filter: Array.from(ST.filter), cur: ST.cur, counter: tx(C + 'PageCounter/PageCountText'), discovered: tx(C + 'DiscoveryCounter/DiscoveryCountText'),
      pages: [page(0), page(1)], title: q('Title'), book: q(C.slice(0, -1)),
      types: S.typeBox.map((b, i) => b && ({ t: TYPES[i], text: tx(b.dataset.path + '/Text'), rect: K.rect(b), tint: b._bg && b._bg.style.getPropertyValue('--c') })),
      zones: S.zoneBox.map((b, i) => b && ({ i, text: tx(b.dataset.path + '/Text (TMP)'), rect: K.rect(b), wide: !!b._wide })),
      prev: ctx.byPath[C + 'PageControlPrev'].style.display !== 'none', next: ctx.byPath[C + 'PageControlNext'].style.display !== 'none' };
  };
})(window);
