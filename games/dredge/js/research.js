/*
 * Cửa sổ Research (ResearchWindow / ResearchDestinationUI / ResearchableEntry / ResearchHelper): tiêu linh kiện nghiên cứu để mở thiết bị
 * bán ở cửa hàng. Số đo, sprite, màu và 25 mục đọc từ data/research_ui.js (tools/research_ui.py); điều kiện tiên quyết và số chấm của từng
 * món nằm ở data/items.js (researchPrerequisites, itemOwnPrerequisites, researchPointsRequired).
 *   - Cửa sổ: Scrim 0,882; Window 1640x820 (FullPanel); TopBar 50 với 4 tab 150 rộng (Rods/Engines/Pots/Nets) + phím Q/E (TabbedPanelContainer);
 *     mỗi tab là một ResearchPanel: Header 60 (chữ research.header.description) + ô Researchables nơi mỗi mục đặt theo anchoredPosition,
 *     đường nối 2 px (Lines) và cột "Research Parts x N" góc trái (ResearchItemCountContainer 200x150).
 *   - Mục (ResearchableEntry.RefreshUI, js: paint): xong = POSITIVE; tiên quyết đủ thì hiện ảnh món, chưa đủ thì bóng trắng (silhouetteMaterial);
 *     viền ô (Border) POSITIVE khi xong, DISABLED nếu không; đường "tiên quyết" POSITIVE khi mọi tiên quyết NGHIÊN CỨU đã xong (không tính
 *     tiên quyết SỞ HỮU), đường "đã xong" POSITIVE khi món này xong; chấm tiến độ ẩn khi xong, nhãn "For Sale" hiện khi xong.
 *     Tooltip: RESEARCH_PREVIEW khi mở được, MYSTERY (tên "???") khi chưa.
 *   - Bấm: ResearchWindow.researchAction = DredgePlayerActionHold("prompt.research", Confirm, 0,5 s) → giữ chuột trái/Enter 0,5 s trên mục
 *     đủ tiên quyết và chưa xong mới tiêu 1 linh kiện (OnResearchableEntryClicked). Hết linh kiện: nháy số đỏ + tiếng lỗi.
 *   - ResearchHelper.SpendResearchItem: lấy từ khoang (không tính ô hỏng), hết mới lấy từ Kho; TotalPartCount = khoang + kho.
 *   - SaveData.AdjustResearchProgress: intVariables["research-progress-<id>"] += 1, "has-spent-research" = true; đủ researchPointsRequired thì
 *     itemIdsResearched.Add(id) + GameEvents.OnResearchCompleted (DR.emit('researchCompleted', id): js/shop.js:414 đặt lại hàng chợ).
 *
 *   DRResearch.open({ dest, onClose })  close()  isOpen()  list()  isResearched(id)  progress(id)  required(id)  prereqs(id)  canResearch(id)
 *   DRResearch.partCount()  spend()  research(id)   [research = bấm xong, bỏ qua thao tác giữ]  selectTab(i)
 *   Sổ lưu: DR.s.itemIdsResearched (mảng id), DR.s.vars['research-progress-<id>'], DR.s.vars['has-spent-research'].
 *   Đăng ký với ụ: DRDock.registerDest('ResearchDestination', ...) (W0).
 * Chữ giao diện tiếng Việt (bản gốc tiếng Anh ghi ở chú thích); tên món giữ nguyên.
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  if (!document.querySelector('link[href*="research.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = new URL('../css/research.css' + ver, (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }
  const UI = root.DR_RESEARCH_UI, G = root.DRGrid;
  if (!UI || !UI.tree || !G) { console.warn('[research] data/research_ui.js (tools/research_ui.py) or js/grid.js missing'); return; }
  const COLOR = UI.colors;
  const ITEM = UI.researchItem;                // ResearchHelper.researchItemData = "research-item"
  const HOLD_MS = 500;                         // DredgePlayerActionHold("prompt.research", Confirm, 0.5f)
  const MIN_KT = 0.62;                         // [ĐỀ XUẤT] hệ số nhỏ nhất của tooltip để chữ còn đọc được trên điện thoại (như upgrade.js)

  // chữ giao diện: khoá chuỗi gốc → tiếng Việt
  const VN = {
    'research.header': 'Nghiên cứu',                                                                                   // "Research"
    'research.header.description': 'Dùng linh kiện để nghiên cứu thiết bị mới. Thiết bị đã nghiên cứu sẽ được bán ở cửa hàng.',   // "Use parts to research new equipment. ..."
    'tab.research.rods': 'Cần câu', 'tab.research.engines': 'Động cơ', 'tab.research.pots': 'Bẫy', 'tab.research.nets': 'Lưới',
    'research.part-count': 'Linh kiện nghiên cứu',                                                                    // "Research Parts"
    'research.for-sale': 'Đang bán'                                                                                    // "For Sale"
  };
  const T = {
    back: 'Quay lại', spend: 'Chi', hold: 'Giữ chuột',
    doneTitle: 'Nghiên cứu hoàn tất', doneSub: '{0} đã có bán ở cửa hàng.',                                            // notification.research-complete.*
    speed: 'Tốc độ câu:', aber: 'Thưởng dị biến:', engine: 'Tốc độ:', perDay: 'Bắt được:', perDayUnit: 'mỗi ngày'
  };

  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* tiếng là phần phụ */ } };
  const toast = t => { if (t && root.DRHud && DRHud.toast) DRHud.toast(t); };
  const artUrl = rel => 'url(' + new URL('../' + rel, (me && me.src) || location.href).href + ')';
  const fmt = (t, args) => String(t || '').replace(/\{(\d+)\}/g, (m, i) => args[+i]);
  const rgba = c => c[3] >= 0.999 ? 'rgb(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ')'
    : 'rgba(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ',' + c[3] + ')';
  const item = id => (root.DR_ITEMS || {})[id];

  // ================================================================ trạng thái nghiên cứu (SaveData)
  const ids = () => (DR.s.itemIdsResearched = DR.s.itemIdsResearched || []);
  const vars = () => (DR.s.vars = DR.s.vars || {});
  const isResearched = id => !!(root.DR && DR.s) && ids().includes(id);                    // SaveData.GetIsItemResearched
  const progress = id => (root.DR && DR.s && vars()['research-progress-' + id]) | 0;    // SaveData.GetResearchProgress
  const required = id => (item(id) && item(id).researchPointsRequired) | 0;             // SpatialItemData.ResearchPointsRequired
  // ResearchedItemResearchablePrerequisite.IsPrerequisiteMet / OwnedItemResearchablePrerequisite.IsPrerequisiteMet (historyOfItemsOwned)
  function prereqs(id) {
    const d = item(id) || {};
    const research = (d.researchPrerequisites || []).map(p => p.itemData), owned = (d.itemOwnPrerequisites || []).map(p => p.itemData);
    const rOk = research.every(isResearched), oOk = owned.every(x => ((DR.s.itemsOwned || []).includes(x)));
    return { research, owned, researchMet: rOk, ownedMet: oOk, met: rOk && oOk };
  }
  const canResearch = id => !isResearched(id) && prereqs(id).met;                          // ResearchableSelectable.CanBeResearched

  // ResearchHelper: TotalPartCount = khoang + kho
  const gridOf = key => (DR.s.grids && DR.s.grids[key]) ? DR.grid(key) : null;
  const countIn = key => { const g = gridOf(key); return g ? g.items.filter(i => i.id === ITEM).length : 0; };    // GetNumItemInGridById
  const partCount = () => (root.DR && DR.s ? countIn('INVENTORY') + countIn('STORAGE') : 0);
  // ResearchHelper.SpendResearchItem: khoang trước (allowDamaged false), rồi kho
  function spend() {
    for (const key of ['INVENTORY', 'STORAGE']) {
      const g = gridOf(key);
      if (!g) continue;
      const inst = g.items.find(i => i.id === ITEM && !(key === 'INVENTORY' && G.onDamaged(g, i)));
      if (!inst) continue;
      G.remove(g, inst);
      DR.emit('cargo', key, null);                                                           // TriggerItemInventoryChanged
      play(UI.sfx.ok);
      return true;
    }
    play(UI.sfx.fail);
    return false;
  }
  // ResearchableEntry.OnResearchableEntryClicked (sau khi giữ đủ): trả { ok, why, progress, done }
  function research(id) {
    if (!root.DR || !DR.s) return { ok: false, why: 'no-game' };
    if (!item(id) || !required(id)) return { ok: false, why: 'unknown' };
    if (isResearched(id)) return { ok: false, why: 'researched' };
    if (!prereqs(id).met) return { ok: false, why: 'locked' };
    if (!spend()) { flash(); return { ok: false, why: 'no-parts' }; }
    const n = vars()['research-progress-' + id] = progress(id) + 1;                      // AdjustResearchProgress
    vars()['has-spent-research'] = true;
    const done = n >= required(id);
    if (done) {
      ids().push(id);                                                                       // itemIdsResearched.Add
      play(UI.sfx.done);
      notify(T.doneTitle, fmt(T.doneSub, [item(id).name]));                                  // BannersUI.OnResearchCompleted (ResearchBannerListing)
      DR.emit('researchCompleted', id);                                                     // GameEvents.TriggerResearchCompleted
      DR.save();
    }
    if (S) { S.filled = { id, i: n - 1 }; paint(); S.filled = null; countText(); }
    return { ok: true, progress: n, done };
  }

  // Banner "Research Complete": trong cửa sổ thì vẽ ngay dưới khung (toast của HUD sẽ chồng lên thanh tab), ngoài cửa sổ thì dùng toast
  // [ĐỀ XUẤT] js/banner.js chưa có loại 'research' (tệp của đơn vị khác), nên không đi qua DRBanner
  function notify(title, sub) {
    if (!S || !host) { toast(title + ' — ' + sub); return; }
    const old = host.querySelector('.rs-note'); if (old) old.remove();
    const n = el('div', 'rs-note', host);
    el('b', '', n, title); el('span', '', n, sub);
    setTimeout(() => n.remove(), 4200);
  }

  // ================================================================ giao diện
  let host = null, S = null, tipEl = null, FM = null;
  const px = n => 'calc(var(--s)*' + (Math.round(n * 1000) / 1000) + 'px)';
  const lin = (pct, n) => !pct ? px(n) : !n ? pct + '%' : 'calc(' + (Math.round(pct * 1000) / 1000) + '% + var(--s)*' + (Math.round(n * 1000) / 1000) + 'px)';
  function cssRect(rt) {
    const [ax0, ay0] = rt.amin, [ax1, ay1] = rt.amax, [pvx, pvy] = rt.piv, [apx, apy] = rt.ap, [w, h] = rt.sd;
    return { left: lin(ax0 * 100, apx - pvx * w), top: lin((1 - ay1) * 100, -apy - (1 - pvy) * h), width: lin((ax1 - ax0) * 100, w), height: lin((ay1 - ay0) * 100, h) };
  }
  function sizeOf(rt, p) {
    const d = i => rt.amax[i] === rt.amin[i] ? rt.sd[i] : p ? (rt.amax[i] - rt.amin[i]) * p[i] + rt.sd[i] : null;
    const w = d(0), h = d(1);
    return w == null || h == null ? null : [w, h];
  }
  // HorizontalLayoutGroup: ChildControlWidth lấy bề rộng từ LayoutElement.preferredWidth (4 tab 150), căn theo TextAnchor
  function hLayout(lg, kids, pw, ph) {
    const [pl, pr, pt, pb] = lg.pad || [0, 0, 0, 0];
    const ax = (lg.al % 3) * 0.5, ay = Math.floor(lg.al / 3) * 0.5;
    const wOf = k => lg.cw && k.le && k.le.pw >= 0 ? k.le.pw : k.rt.sd[0];
    const total = kids.reduce((s, k) => s + wOf(k), 0) + lg.sp * Math.max(0, kids.length - 1);
    let x = pl + (pw - pl - pr - total) * ax;
    const inner = ph - pt - pb;
    return kids.map(k => {
      const w = wOf(k), h = k.rt.sd[1];
      const req = lg.fh ? Math.max(h, Math.min(inner, ph)) : h;
      const r = { x, y: pt + (ph - (req + pt + pb)) * ay + (req - h) * ay, w, h: lg.fh ? req : h };
      x += w + lg.sp;
      return r;
    });
  }
  // GridLayoutGroup của NotchContainer (cột đơn, hàng cố định 1, căn UpperCenter): các chấm 20x20 xếp ngang giữa ô 100x20
  function notchLayout(n, kids) {
    const c = n.lg.cell, m = kids.length;
    return kids.map((k, i) => ({ x: n.rt.sd[0] / 2 - c[0] / 2 + (i - (m - 1) / 2) * c[0], y: 0, w: c[0], h: c[1] }));
  }
  // Unity Image.GetAdjustedBorders: viền co theo ppu/100 (và PixelsPerUnitMultiplier), co lại khi khung nhỏ hơn tổng viền
  function borders(sp, w, h, ppm) {
    const k = 100 / (sp.ppu * (ppm || 1));
    let [l, b, r, t] = sp.b.map(v => v * k);
    if (w != null && l + r > w && l + r) { const q = w / (l + r); l *= q; r *= q; }
    if (h != null && b + t > h && b + t) { const q = h / (b + t); b *= q; t *= q; }
    return { l, b, r, t, slice: [sp.b[3], sp.b[2], sp.b[1], sp.b[0]] };
  }
  function paintImage(bg, n, size, mode) {
    const im = n.img, sp = im.s && UI.sprites[im.s];
    if (!sp || im.s === 'square') { bg.classList.add('solid'); bg.style.setProperty('--c', rgba(im.c)); return; }
    const url = artUrl(sp.f);
    bg.style.setProperty('--sp', url);
    if (im.t === 2) {                                                                // Tiled (ô lưới 75 px = 64 / ppm)
      bg.classList.add('tile'); bg.style.setProperty('--c', rgba(im.c));
      bg.style.setProperty('--tile', px(sp.w / (im.ppm || 1) * 100 / sp.ppu));
      return;
    }
    if (im.t === 1) {                                                                // Sliced
      const b = borders(sp, size && size[0], size && size[1], im.ppm);
      const bw = px(b.t) + ' ' + px(b.r) + ' ' + px(b.b) + ' ' + px(b.l);
      bg.style.setProperty('--bw', bw);
      bg.style.setProperty('--bi', url + ' ' + b.slice.join(' ') + (im.fc ? ' fill' : '') + ' / ' + bw + ' stretch');
      bg.classList.add('sl');
    } else {
      bg.classList.add(mode === 'mul' ? 'mulm' : 'si');
      if (im.pa) bg.classList.add('pa');
      if (mode === 'mul') bg.style.setProperty('--c', rgba(im.c));
    }
  }

  const textOf = n => { const tx = n.tx; return (tx.k && VN[tx.k]) || (tx.k && root.DR_STR && DR_STR[tx.k]) || tx.t; };
  function buildText(box, n, over) {
    const tx = n.tx;
    box.classList.add('rs-t');
    const s = el('span', 'rs-tx', box);
    const i = el('i', '', s, over != null ? over : textOf(n));
    s.style.color = rgba(tx.c);
    s.style.textAlign = tx.h === 1 ? 'left' : tx.h === 4 ? 'right' : 'center';
    box._tx = { n, i, s };
  }
  let _B = null, _cv = null;
  const FONT = '"Front Page Neue","Signika",sans-serif';
  function baseline() {
    if (_B != null) return _B;
    const d = el('div', '', document.body);
    d.style.cssText = 'position:absolute;left:-999px;top:0;font:100px/1 ' + FONT + ';visibility:hidden';
    d.innerHTML = 'Hx<i style="display:inline-block;width:0;height:0"></i>';
    _B = (d.querySelector('i').getBoundingClientRect().bottom - d.getBoundingClientRect().top) / 100;
    d.remove();
    return _B;
  }
  function measure(text) {
    _cv = _cv || document.createElement('canvas').getContext('2d');
    _cv.font = '100px ' + FONT;
    const m = _cv.measureText(text);
    return { asc: m.actualBoundingBoxAscent / 100, desc: m.actualBoundingBoxDescent / 100 };
  }
  function placeText(box) {
    const { n, i, s } = box._tx, tx = n.tx, pt = FM.pointSize;
    let below;
    if (tx.v === 8192) below = FM.cap / pt / 2;
    else if (tx.v === 4096) { const m = measure(i.textContent); below = (m.asc - m.desc) / 2; }
    else below = (FM.ascent + FM.descent) / pt / 2;                                  // Middle (512) và còn lại
    let size = tx.s;
    s.style.fontSize = px(size);
    if (tx.au) {                                                                     // enableAutoSizing: thu nhỏ tới khi vừa khung (tối thiểu mn)
      const cw = box.clientWidth / S.scale, tw = i.getBoundingClientRect().width / S.scale;
      if (cw > 0 && tw > cw) size = Math.max(tx.mn, Math.floor(size * cw / tw * 100) / 100);
      s.style.fontSize = px(size);
    }
    box._tx.size = size;
    s.style.top = 'calc(50% + var(--s)*' + ((below - baseline()) * size) + 'px)';
  }
  function ensureDom() {
    if (host) return;
    host = el('div', 'dr-ui', document.body); host.id = 'dr-rsch';
    host.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('resize', () => { if (S) fit(); });
    root.addEventListener('pointermove', e => { if (S) { S.ptr = { x: e.clientX, y: e.clientY }; if (S.hover) placeTip(); } });
    FM = Object.values(UI.font)[0];
  }
  const scale = () => Math.min(root.innerHeight / UI.canvas.h, root.innerWidth / UI.canvas.w);
  function fit() {
    S.scale = scale();
    host.style.setProperty('--s', S.scale.toFixed(5));
    host.style.setProperty('--kt', Math.max(S.scale, MIN_KT).toFixed(4));
    for (const b of S.texts) placeText(b);
    if (S.hover) placeTip();
  }

  // dựng cây: mọi GameObject thành một .rs-n; lưu mục / tab / tab-panel / đường nối để paint() đổi màu
  function build() {
    S.byPath = {}; S.texts = []; S.entries = []; S.tabs = []; S.panels = []; S.counts = [];
    host.innerHTML = '';
    host.style.setProperty('--pbi', artUrl(UI.sprites.PopupBackground.f) + ' 64 fill');
    const mk = (n, parent, rel, psize, pos, ctx) => {
      const box = el('div', 'rs-n', parent);
      box.dataset.n = n.n;
      if (rel != null) { box.dataset.p = rel; S.byPath[rel] = box; }
      if (pos) Object.assign(box.style, { left: px(pos.x), top: px(pos.y), width: px(pos.w), height: px(pos.h) });
      else Object.assign(box.style, cssRect(n.rt));
      const size = pos ? [pos.w, pos.h] : sizeOf(n.rt, psize);
      if (!n.on && rel !== '') box.classList.add('off');                               // Container gốc tắt trong cảnh, ResearchWindow.Show bật
      if (/Line\d?$|line\d?$/i.test(n.n) && n.img && n.img.s === 'square') box.classList.add('np');
      const c2 = Object.assign({}, ctx);
      if (n.re) {
        c2.entry = { id: n.re.item, node: n, box, notches: [], re: n.re };
        S.entries.push(c2.entry);
        box.classList.add('rs-en-root');
      }
      const e = c2.entry;
      if (n.img) {
        if (e && n.n === 'Image' && n.img.s == null) {                                  // ảnh món: sprite của chính món, hoặc bóng trắng (CSS)
          const im = el('i', 'rs-img', box);
          const d = item(e.id); if (d && d.sprite) im.style.setProperty('--sp', artUrl(d.sprite));
          e.imgEl = im;
        } else if (n.img.s || n.img.c[3] > 0) {
          const bg = el('i', 'rs-bg', box);
          const dyn = !!(e && (n.n === 'Border' || n.n === 'NotchFade' || n.n === 'ResearchNotch')) || !!(ctx.line);
          paintImage(bg, n, size, dyn ? 'mul' : null);
          box._bg = bg;
          if (e && n.n === 'Border') e.border = bg;
          if (n.n === 'NotchFade') { bg.classList.add('rs-nf'); bg.style.setProperty('--c', COLOR.POSITIVE); }
        }
      }
      if (n.tx) {
        let over = null;
        if (n.n === 'CountText' || n.n === 'CountTextCopy') { over = 'x' + partCount(); S.counts.push(box); }
        buildText(box, n, over);
        S.texts.push(box);
        if (n.n === 'TabTitleText') box.classList.add('up');
      }
      if (n.tab) { box.classList.add('rs-tab'); box._tab = n.tab; S.tabs.push({ box, n }); }
      if (n.n === 'TabButton') box.classList.add('rs-tbtn');
      if (/Copy$/.test(n.n)) { box.classList.remove('off'); box.classList.add('rs-flash'); }                // bản đỏ nháy khi hết linh kiện
      if (n.n === 'ResearchNotch') { box.classList.add('rs-notch'); if (e) e.notches.push(box); }
      if (e && n.n === 'ResearchableContainer') { e.hit = box; box.classList.add('rs-en'); }
      if (e && n.n === 'NotchContainer') e.notchBox = box;
      if (e && n.n === 'ForSaleContainer') e.sale = box;
      if (e && n.n === 'AttentionCallout') e.attn = box;
      if (n.panel) S.panels.push({ box, n });
      let kids = n.k || [];
      if (n.n === 'Disclaimer') kids = [];
      if (/^HoldAction/.test(n.n)) return box;                                          // vòng giữ phím của nút nhắc: dùng chip phím thay
      if (n.n === 'LeftControlPrompt' || n.n === 'RightControlPrompt') {
        el('span', 'rs-key', box, n.n[0] === 'L' ? 'Q' : 'E');
        return box;
      }
      const lay = n.lg && n.lg.t === 'H' && size ? hLayout(n.lg, kids, size[0], size[1])
        : n.lg && n.lg.t === 'G' && n.n === 'NotchContainer' ? notchLayout(n, kids) : null;
      kids.forEach((k, idx) => {
        const kr = rel == null ? null : (rel ? rel + '/' + k.n : k.n);
        const lineCtx = /Lines$/.test(n.n) || (e && /Line$/.test(k.n)) ? { line: true } : null;
        mk(k, box, kr, size, lay ? lay[idx] : null, lineCtx ? Object.assign({}, c2, lineCtx) : c2);
      });
      return box;
    };
    const rootBox = mk(UI.tree, host, '', null, null, {});
    rootBox.classList.add('rs-root'); rootBox.style.cssText = 'position:absolute;inset:0';
    // mục → đường nối đổi màu, ô trong cây; chấm theo số điểm yêu cầu
    for (const e of S.entries) {
      e.pre = e.re.pre.map(p => S.byPath[p]).filter(Boolean);
      e.post = e.re.post.map(p => S.byPath[p]).filter(Boolean);
      e.pre.concat(e.post).forEach(b => { if (b._bg) b._bg.classList.add('rs-line'); });
      e.panelKey = (e.box.dataset.p.match(/Panels\/([^/]+)\//) || [])[1];
      const hit = e.hit;
      hit.addEventListener('pointerenter', ev => onEnter(e, ev));
      hit.addEventListener('pointerleave', () => onLeave(e));
      hit.addEventListener('pointerdown', ev => { if (ev.button === 0 || ev.pointerType === 'touch') holdStart(e); });
      hit.addEventListener('pointerup', () => holdCancel());
      hit.addEventListener('pointercancel', () => holdCancel());
    }
    // tab: bấm đổi panel (TabbedPanelContainer)
    S.tabs.forEach((t, i) => t.box.addEventListener('click', () => { play('ui.button.select'); selectTab(i); }));
    const back = el('button', 'rs-back', host);
    el('span', '', back, T.back); el('b', '', back, 'X');
    back.onclick = () => goBack();
    tipEl = el('div', 'rs-tip', host);
    S.mapTab = S.panels.map(p => p);
    selectTab(S.tab || 0, true);
    paint();
  }

  // TabbedPanelContainer: tab đang chọn dùng Tab_Selected, còn lại Tab_Unselected; chỉ panel đang chọn hiện Container
  function selectTab(i, quiet) {
    if (!S) return;
    const n = S.tabs.length;
    i = (i % n + n) % n;
    S.tab = i;
    S.tabs.forEach((t, k) => {
      const tb = t.box.querySelector('.rs-tbtn'), spr = UI.sprites[k === i ? t.box._tab.sel : t.box._tab.unsel];
      if (!tb || !spr) return;
      const bg = tb.querySelector('.rs-bg') || el('i', 'rs-bg', tb);
      const w = t.box.offsetWidth ? t.box.offsetWidth / (S.scale || 1) : 150, h = 50;
      const b = borders(spr, w, h), url = artUrl(spr.f), bw = px(b.t) + ' ' + px(b.r) + ' ' + px(b.b) + ' ' + px(b.l);
      bg.classList.add('sl'); bg.style.setProperty('--bw', bw);
      bg.style.setProperty('--bi', url + ' ' + b.slice.join(' ') + ' fill / ' + bw + ' stretch');
      t.box.dataset.sel = k === i ? '1' : '0';
    });
    S.panels.forEach((p, k) => {
      const c = p.box.querySelector(':scope > .rs-n[data-n="Container"]');
      if (c) c.classList.toggle('off', k !== i);
    });
    hideTip(); holdCancel();
    if (!quiet) paint();
  }

  // ResearchableEntry.RefreshUI cho cả cây
  const setC = (b, col) => { if (b && b._bg) b._bg.style.setProperty('--c', col); };
  function paint() {
    if (!S) return;
    for (const e of S.entries) {
      const done = isResearched(e.id), pq = prereqs(e.id), all = pq.met, flag = done || all;
      e.done = done; e.can = !done && all; e.sil = !flag;
      e.hit.classList.toggle('can', e.can);
      e.box.dataset.state = done ? 'done' : all ? 'ready' : 'locked';
      if (e.imgEl) e.hit.classList.toggle('sil', !flag);
      if (e.border) e.border.style.setProperty('--c', done ? COLOR.POSITIVE : COLOR.DISABLED);         // backplateImage
      for (const b of e.pre) setC(b, pq.researchMet ? COLOR.POSITIVE : COLOR.DISABLED);                  // linesToColorWhenPrerequisitesAreMet
      for (const b of e.post) setC(b, done ? COLOR.POSITIVE : COLOR.DISABLED);                            // linesToColorWhenThisIsResearched
      if (e.notchBox) e.notchBox.classList.toggle('off', done);                                           // researchNotchContainer.SetActive(!isResearched)
      if (e.sale) e.sale.classList.toggle('off', !done);                                                  // researchCompleteContainer.SetActive(isResearched)
      const p = progress(e.id);
      e.notches.forEach((nb, i) => {
        const full = !done && i < p;
        nb.classList.toggle('full', full);
        nb.classList.toggle('pop', !!(S.filled && S.filled.id === e.id && S.filled.i === i));           // ResearchNotch.AnimateFill
      });
      if (e.attn) e.attn.classList.toggle('off', !highlight(e));                                          // attentionCallout
    }
    countText();
  }
  // HighlightCondition.ShouldHighlight (nhánh extraConditions: danh sách điều kiện phụ được bỏ qua = true, như extraConditions rỗng)
  function highlight(e) {
    const V = n => !!(root.DRYarn && DRYarn.visited && DRYarn.visited(n));
    return (e.re.hl || []).some(h => {
      if (h.always) return true;
      const unv = h.unvisited.length > 0 && h.unvisited.some(x => !V(x));
      return unv && h.visited.every(V);
    });
  }
  function countText() {
    if (!S) return;
    for (const b of S.counts) { b._tx.i.textContent = 'x' + partCount(); placeText(b); }
  }
  // ResearchWindow.FlashResearchItemCount (trigger "failure": bản đỏ của số linh kiện nháy)
  function flash() {
    if (!S) return;
    host.classList.remove('fail'); void host.offsetWidth; host.classList.add('fail');
  }

  // ---------------------------------------------------------------- tooltip
  function rowsFor(d) {
    const rows = [], rs = (root.DRBooks && DRBooks.mod) ? DRBooks.mod('FISHING_SPEED') : 0;
    const sub = d.subtype;
    if (sub === 'ROD') {
      if (d.fishingSpeedModifier) rows.push([T.speed, '+' + Math.round(d.fishingSpeedModifier * (1 + rs) * 100) + '%']);   // TooltipSectionRodDetails
      if (d.aberrationBonus > 0) rows.push([T.aber, '+' + (Math.round(d.aberrationBonus * 1000) / 10) + '%']);
    } else if (sub === 'ENGINE') {
      rows.push([T.engine, '+' + (Math.round((d.speedBonus || 0) * 10) / 10) + ' kn']);                                     // TooltipSectionEngineDetails
    } else if (sub === 'POT' || sub === 'NET') {
      const n = (1 / (d.timeBetweenCatchRolls || 1)) * (d.catchRate || 0);                                                  // TooltipSectionDeployableDetails
      if (d.catchRate) rows.push([T.perDay, (n % 1 > 0.1 ? Math.floor(n) + ' - ' + Math.ceil(n) : '~' + Math.round(n)) + ' ' + T.perDayUnit]);
    }
    return rows;
  }
  function fillTip(e) {
    const d = item(e.id) || {}, mystery = e.sil;
    tipEl.innerHTML = '';
    const hd = el('div', 'hd', tipEl);
    if (d.itemTypeIcon && !mystery) { const i = new Image(); i.src = new URL('../' + d.itemTypeIcon, (me && me.src) || location.href).href; i.className = 'ic'; hd.appendChild(i); }
    el('span', 'nm', hd, mystery ? '???' : d.name);                                          // TooltipSectionHeaderWithIcon.SetObscured
    el('i', 'ln', hd);
    if (!mystery) {
      for (const [l, v] of rowsFor(d)) { const r = el('div', 'row', tipEl); el('span', '', r, l); el('span', '', r, v); }
      if (d.desc) el('p', 'ds', tipEl, d.desc);                                              // TooltipSectionDescription
    }
    if (e.can) {                                                                             // ResearchableSelectable: nhắc "prompt.research" khi mở được
      const pr = el('div', 'prompts', tipEl), p = el('div', 'pr', pr);
      el('b', '', p, T.hold); el('span', '', p, T.spend + ' [1x '); el('i', '', p).style.setProperty('--sp', artUrl(UI.sprites['cog-icon'].f)); el('span', '', p, ']');
      const hl = el('div', 'holdline', tipEl); el('i', '', hl);
    }
  }
  function onEnter(e, ev) {
    if (!S) return;
    if (ev && ev.pointerType === 'touch') S.ptr = { x: ev.clientX, y: ev.clientY };
    S.hover = e;
    play('ui.button.select');
    fillTip(e);
    tipEl.classList.add('on');
    placeTip();
  }
  function onLeave(e) { if (S && S.hover === e) { hideTip(); holdCancel(); } }
  function hideTip() { if (S) S.hover = null; if (tipEl) tipEl.classList.remove('on'); }
  function placeTip() {
    if (!S || !S.hover) return;
    const W = root.innerWidth, H = root.innerHeight, w = tipEl.offsetWidth, h = tipEl.offsetHeight, gap = 25 * Math.max(S.scale, MIN_KT);
    let x = S.ptr.x < W / 2 ? S.ptr.x + gap : S.ptr.x - gap - w;
    x = Math.max(0, Math.min(W - w, x));
    const y = Math.max(0, Math.min(H - h, S.ptr.y - gap));
    tipEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  // ---------------------------------------------------------------- giữ để nghiên cứu (DredgePlayerActionHold 0,5 s)
  function holdStart(e) {
    if (!S || S.hold || !e.can) return;
    const h = S.hold = { e, t0: performance.now(), raf: 0 };
    e.hit.classList.add('hold');
    const bar = e.holdBar || (e.holdBar = el('i', 'rs-holdbar', e.hit));
    const tick = () => {
      if (!S || S.hold !== h) return;
      const p = Math.min(1, (performance.now() - h.t0) / HOLD_MS);
      bar.style.width = p * 100 + '%';
      const line = tipEl.querySelector('.holdline i'); if (line && S.hover === e) line.style.width = p * 100 + '%';
      if (p >= 1) { holdCancel(); research(e.id); if (S && S.hover === e) fillTip(e); return; }   // OnPressComplete += Reset
      h.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function holdCancel() {
    if (!S || !S.hold) return;
    const h = S.hold; S.hold = null;
    cancelAnimationFrame(h.raf);
    h.e.hit.classList.remove('hold');
    if (h.e.holdBar) h.e.holdBar.style.width = '0';
    const line = tipEl && tipEl.querySelector('.holdline i'); if (line) line.style.width = '0';
  }

  function goBack() { if (!S) return; play('ui.button.back'); close(); }

  // ---------------------------------------------------------------- mở / đóng
  function open(opts) {
    if (!root.DR || !DR.s) return false;
    if (S) close(true);
    ensureDom();
    S = { dest: opts && opts.dest, onClose: opts && opts.onClose, tab: 0, hover: null, hold: null, scale: scale(),
      ptr: { x: root.innerWidth / 2, y: root.innerHeight / 2 }, texts: [] };
    host.classList.add('on');
    host.classList.remove('show', 'fail');
    document.body.classList.add('rs-open');             // ResearchWindow.Show: toggleGameUI ẩn giao diện phía trên
    build();
    fit();
    selectTab(0, true);                                  // đo lại bề rộng tab sau khi đặt --s
    if (document.fonts && document.fonts.load) document.fonts.load('50px "Front Page Neue"').then(() => { _B = null; if (S) fit(); }).catch(() => {});
    requestAnimationFrame(() => { if (S) host.classList.add('show'); });
    return true;
  }
  function close(silent) {
    if (!S) return false;
    holdCancel();
    const s = S; S = null;
    host.classList.remove('on', 'show', 'fail');
    document.body.classList.remove('rs-open');
    if (tipEl) tipEl.classList.remove('on');
    if (!silent && s.onClose) s.onClose();
    return true;
  }

  root.addEventListener('keydown', e => {
    if (!S) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.code;
    if (k === 'Escape' || k === 'KeyX') { if (!e.repeat) goBack(); }
    else if (k === 'KeyQ') { if (!e.repeat) { play('ui.button.select'); selectTab(S.tab - 1); } }
    else if (k === 'KeyE') { if (!e.repeat) { play('ui.button.select'); selectTab(S.tab + 1); } }
    else if (k === 'Enter' || k === 'NumpadEnter') { if (!e.repeat && S.hover) holdStart(S.hover); }       // Confirm giữ 0,5 s trên mục đang trỏ
    else if (k === 'Tab' || k === 'KeyI' || k === 'Space' || k === 'KeyL' || k === 'KeyJ' || k === 'KeyM') { /* không rò xuống khoang/tương tác khi cửa sổ mở */ }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  root.addEventListener('keyup', e => { if (S && (e.code === 'Enter' || e.code === 'NumpadEnter')) holdCancel(); }, true);

  const list = () => {
    const out = [];
    (function w(n) { if (n.re) out.push(n.re.item); (n.k || []).forEach(w); })(UI.tree);
    return out;
  };
  const DRResearch = { open, close: () => close(), isOpen: () => !!S, list, isResearched, progress, required, prereqs, canResearch, partCount, spend, research, selectTab, HOLD_MS };
  DRResearch._debug = () => {
    if (!S) return null;
    const r = b => { const q = b.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
    const entries = {};
    for (const e of S.entries) entries[e.id] = Object.assign(r(e.hit), { state: e.box.dataset.state, can: e.can, silhouette: e.sil,
      visible: !!e.hit.offsetParent, progress: progress(e.id), notches: e.notches.length, filled: e.notches.filter(n => n.classList.contains('full')).length,
      border: e.border && e.border.style.getPropertyValue('--c'), pre: e.pre.map(b => b._bg && b._bg.style.getPropertyValue('--c')), post: e.post.map(b => b._bg && b._bg.style.getPropertyValue('--c')),
      sale: !!e.sale && !e.sale.classList.contains('off'), attn: !!e.attn && !e.attn.classList.contains('off') });
    return { scale: S.scale, tab: S.tab, win: r(S.byPath['Window'] || host), count: S.counts[0] && S.counts[0]._tx.i.textContent, entries,
      tabs: S.tabs.map(t => Object.assign(r(t.box), { text: t.box.textContent, sel: t.box.dataset.sel })),
      tip: tipEl.classList.contains('on') ? tipEl.textContent : null, texts: S.texts.map(b => ({ n: b.dataset.p, t: b._tx.i.textContent, size: b._tx.size })) };
  };
  root.DRResearch = DRResearch;

  // W0: giao diện điểm đến ResearchDestination (ResearchDestinationUI.ShowMainUI → ResearchWindow.Show; đóng cửa sổ = rời điểm đến)
  if (root.DRDock && DRDock.registerDest) {
    DRDock.registerDest('ResearchDestination', (d, ctx) => {
      ctx.close();
      open({ dest: d, onClose: () => { if (ctx.isCurrent()) ctx.leave(); } });
    });
  }
  if (root.DR && DR.on) {
    DR.on('mode', m => { if (S && (m === 'sail' || m === 'title' || m === 'over' || m === 'harvest')) close(true); });
    const again = () => { if (S) { paint(); if (S.hover) fillTip(S.hover); } };
    DR.on('cargo', again); DR.on('researchCompleted', again);
  }
})(window);
