/*
 * Màn hình khoang thuyền, dựng lại theo UI gốc của DREDGE (Game.unity: PlayerSlidePanel/InventoryGrid, GridCell.prefab,
 * GridObject.prefab, TooltipUI; mã: GridManager, GridUI, GridCell, GridObject, DefaultActionHandler, TooltipUI, CursorProxy).
 *
 *   DRCargo.open({ keys:['INVENTORY'] | ['INVENTORY','STORAGE'], title, holding, onClose })
 *   holding = instance đồ vừa kiếm được chưa có chỗ ({id, size, fresh...}); phải đặt hoặc vứt thì mới đóng được.
 *   Tab / I bật tắt khi đang lái (DR.setMode('cargo') rồi trả lại chế độ trước).
 *
 * Bảng khoang là bảng trượt bên PHẢI màn hình (650x935 đơn vị trên canvas 1920x1080, CanvasScaler khớp theo chiều cao),
 * thế giới 3D vẫn hiện bên trái. Lưới kho (STORAGE) là bảng đối xứng bên trái.
 * Điều khiển PC (DredgeControlBindings.cs:304-344):
 *   chuột trái = nhặt / đặt (bấm-bấm, đồ dính theo con trỏ, tâm đồ nằm đúng con trỏ; kéo-thả cũng được cho cảm ứng);
 *   chuột phải = xoay 90 độ THUẬN chiều kim đồng hồ (RotateClockwise);
 *   giữ Z 0,75 giây = vứt (DefaultActionHandler.defaultDiscardHoldTimeSec; discardHoldTimeOverride của từng món);
 *   chuột giữa = chuyển nhanh khoang <-> kho (QuickMove); Tab đóng; Esc / X = Back.
 * Đặt lên đúng một món di chuyển được thì ĐỔI CHỖ: món kia dính vào con trỏ (GridUI.TryPlaceObject nhánh 2).
 * Không có R, không có lăn chuột: bản gốc không có. Nút Xoay / Vứt trên màn hình chỉ cho cảm ứng [ĐỀ XUẤT].
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  const cssUrl = f => new URL('../css/' + f + ver, (me && me.src) || location.href).href;
  if (!document.querySelector('link[href*="ui.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = cssUrl('ui.css'); document.head.appendChild(l);
  }
  if (!document.querySelector('link[href*="cargo.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = cssUrl('cargo.css'); document.head.appendChild(l);
  }
  const G = root.DRGrid;
  const ART = f => new URL('../art/ui/cargo/' + f + '.webp', (me && me.src) || location.href).href;

  // GameConfigDataProd.asset: colors[0..7] = NEUTRAL, EMPHASIS, POSITIVE, NEGATIVE, CRITICAL, WARNING, VALUABLE, DISABLED
  const COLOR = {
    NEUTRAL: '#ffffff', EMPHASIS: '#3b9795', POSITIVE: '#74d27a', NEGATIVE: '#dc2c38',
    CRITICAL: '#871d58', WARNING: '#ff9a3b', VALUABLE: '#ffd104', DISABLED: '#6b6b6b'
  };
  const FRESH_VN = { fresh: 'Tươi', stale: 'Hơi ươn', rotting: 'Ươn' };
  const FRESH_COL = { fresh: COLOR.POSITIVE, stale: COLOR.NEUTRAL, rotting: COLOR.NEGATIVE };
  // GridCell.GetSpriteForItemType: ENGINE, NET, ROD, LIGHT theo thứ tự đó, còn lại là ô vuông thường
  const SLOT_ICON = [[G.SUB.ENGINE, 'EngineEquipmentIcon'], [G.SUB.NET, 'TrawlEquipmentIcon'], [G.SUB.ROD, 'FishingEquipmentIcon'], [G.SUB.LIGHT, 'LightEquipmentIcon']];
  const DISCARD_HOLD = 0.75;            // DefaultActionHandler.defaultDiscardHoldTimeSec
  const SQUISH_FORCE = 25, SQUISH_DAMP = 15, ROT_SPEED = 25; // GridObject.prefab: squishForce, squishDamping, rotationSpeed
  const TICK = 0.02;                    // FixedUpdate của Unity
  const MIN_K = 0.46;                   // [ĐỀ XUẤT] hệ số tỉ lệ nhỏ nhất để chữ còn đọc được trên điện thoại

  let host = null, held = null, tip = null, ring = null, acts = null, cursor = null;
  let S = null;
  let lastPtr = null, lastType = '', raf = 0, lastT = 0;

  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* tiếng là phần phụ */ } };
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  const isFish = def => !!(G.subOf(def) & G.SUB.FISH);
  const defOf = inst => DR.item(inst.id);
  const cfg = () => root.DR_CONFIG || {};
  const sizeCm = (def, inst) => def.minSizeCentimeters != null && inst.size != null
    ? def.minSizeCentimeters + (def.maxSizeCentimeters - def.minSizeCentimeters) * inst.size : null;
  const freshKey = inst => DRRules.freshLabel(cfg(), inst.fresh == null ? cfg().maxFreshness : inst.fresh);
  const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mul = (c, f) => 'rgb(' + hex(c).map(v => Math.round(v * f)).join(',') + ')';

  function bbox(def, rot) {
    const fp = G.footprint(def, 0, 0, rot);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of fp) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { minX: x0, minY: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  const cellsBox = cells => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  // SpatialItemData.GetCanBeMoved: FREE luôn được; INSTALL chỉ khi cập bến (Player.CanMoveInstalledItems); NONE không bao giờ
  function canMoveInstalled() { return DR.mode === 'dock' || (S && S.prevMode === 'dock'); }
  function lockedFor(def) { return def.moveMode === 'NONE' || (def.moveMode === 'INSTALL' && !canMoveInstalled()); }
  // GridCell.ShouldShowItemTypes: biểu tượng ô thiết bị chỉ hiện khi được phép dời đồ lắp
  const showSlotIcons = () => canMoveInstalled();

  function ensureDom() {
    if (host) return;
    host = el('div', 'cg-root dr-ui', document.body); host.id = 'dr-cargo';
    held = el('div', 'cg-held dr-ui', document.body);
    cursor = el('div', 'cg-cursor', document.body);
    tip = el('div', 'cg-tip dr-ui', document.body);
    ring = el('div', 'cg-ring', document.body);
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('contextmenu', e => e.preventDefault());
    host.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('resize', () => { if (S) render(); });
  }

  // ---------------------------------------------------------------- bố cục (đơn vị canvas 1920x1080 nhân hệ số k)
  function metrics() {
    const W = root.innerWidth, H = root.innerHeight;
    const k = Math.max(H / 1080, MIN_K);
    const cols = Math.max.apply(null, S.grids.map(g => g.g.cols));
    const hasInv = S.grids.some(g => g.key === 'INVENTORY');
    const side = S.grids.filter(g => g.key !== 'INVENTORY');
    const top = H < 500 ? 6 : 65 * k;                 // PlayerSlidePanel: y = -65
    const panelH = Math.min(935 * k, H - top - 6);
    const panelW = Math.min(650 * k, W * (side.length && hasInv ? 0.4 : 0.62));
    const zoneW = panelW - 100 * k;                     // InventoryGrid: size.x = -100
    const fit = stats => {
      let cs = 60 * k;
      for (const gr of S.grids) {
        const inv = gr.key === 'INVENTORY';
        // INVENTORY dịch xuống nửa ô: originPos.y dùng (rows - 1)
        const zoneH = panelH - 30 * k - (inv ? (100 + (stats ? 145 : 0)) * k : 50 * k);
        cs = Math.min(cs, zoneH / (gr.g.rows + (inv ? 1 : 0)), zoneW / gr.g.cols);
      }
      return cs;
    };
    let showStats = hasInv && H >= 520;
    let cs = fit(showStats);
    const want = Math.max(Math.min(60 * k, 34), H < 520 ? 32 : 0);
    if (showStats && cs < want) { showStats = false; cs = fit(false); }
    // điện thoại: ép ô tối thiểu để chạm được; lưới không vừa thì cuộn
    cs = Math.max(26, Math.floor(cs));
    return { W, H, k, cs, top, panelH, panelW, zoneW, showStats, hasInv, cols };
  }

  // ---------------------------------------------------------------- dựng DOM
  function render() {
    if (!S) return;
    const M = S.M = metrics();
    host.style.setProperty('--k', M.k.toFixed(4));
    host.style.setProperty('--kt', Math.max(M.k, 0.62).toFixed(4));
    host.style.setProperty('--cs', M.cs + 'px');
    held.style.setProperty('--kt', Math.max(M.k, 0.62).toFixed(4));
    tip.style.setProperty('--kt', Math.max(M.k, 0.62).toFixed(4));
    host.innerHTML = '';
    S.statEls = null;
    const inv = S.grids.find(g => g.key === 'INVENTORY'), side = S.grids.filter(g => g.key !== 'INVENTORY');
    if (side.length) buildSidePanel(M, side);
    if (inv) buildPlayerPanel(M, inv);
    refreshHeld();
    updateCursor();
    updatePreview();
    // chuột đứng yên sau khi dựng lại: tooltip phải theo ô đang nằm dưới con trỏ (cảm ứng không có rê nên bỏ qua)
    S.hover = !S.held && lastType === 'mouse' ? hoverAt(S.ptr.x, S.ptr.y) : null;
    refreshTip();
  }

  function panelBox(cls, M) {
    const p = el('div', 'cg-panel ' + cls + (S.shown ? ' on' : ''), host);
    p.style.cssText = 'top:' + M.top + 'px;width:' + M.panelW + 'px;height:' + M.panelH + 'px';
    el('div', 'cg-bg', p);
    return p;
  }

  function buildPlayerPanel(M, inv) {
    const p = panelBox('cg-right', M);
    // tay nắm trượt (SlidePanelTab) cũng là nút đóng cho cảm ứng
    const hd = el('button', 'cg-handle', p); hd.title = 'Đóng (Tab)';
    el('i', '', hd);
    hd.onclick = () => close();
    const tabs = el('div', 'cg-tabs', p);
    const defs = [['Khoang', 'sel'], ['Phòng', 'off'], ['Kho', S.grids.some(g => g.key === 'STORAGE') ? 'un' : 'off']];
    for (const [name, st] of defs) {
      const t = el('button', 'cg-tab ' + st, tabs, name);
      if (st === 'off') { t.disabled = true; t.title = name === 'Phòng' ? 'Chưa có trong Biển Mù' : 'Chỉ mở được ở bến'; }
      if (st === 'un') t.onclick = () => flash('.cg-left');
    }
    if (M.showStats) buildStats(p);
    const hp = el('div', 'cg-health', p);
    el('span', 'lab', hp, 'Hư hại:');
    const notches = el('span', 'notches', hp);
    const lim = DRRules.damageThreshold(cfg(), DR.s.hullTier), bad = inv.g.damage.length;
    for (let i = 0; i < lim; i++) el('i', i < bad ? 'full' : '', notches);
    hp.style.top = (50 + (M.showStats ? 145 : 0) - 2) * M.k + 'px';
    buildZone(p, inv, M, true);
  }

  function buildStats(p) {
    const box = el('div', 'cg-stats', p), st = liveStats();
    const left = el('div', 'cg-st-l', box);
    S.statEls = {};
    for (const [k, label] of [['speed', 'Tốc độ thuyền:'], ['fishing', 'Tốc độ câu:'], ['light', 'Đèn:'], ['ab', 'Thưởng dị biến:']]) {
      const d = el('div', '', left, label + ' ');
      S.statEls[k] = { v: el('b', '', d), pj: el('span', 'pj', d) };
    }
    refreshStats();
    const right = el('div', 'cg-st-r', box);
    el('div', 'hd', right, 'Loại cá câu được:');
    const tags = el('div', 'tags', right);
    const types = Array.from(st.harvestTypes);
    for (const t of types) tags.appendChild(typeTag(t, st.advancedTypes.has(t)));
    if (!types.length) el('span', 'none', tags, 'Chưa có cần câu');
  }

  // PlayerStats tính trên khoang KHÔNG có món đang cầm (OnItemPickedUp báo đổi kho đồ)
  function liveStats() {
    const inv = DR.grid('INVENTORY'), h = S && S.held;
    const view = h ? { cols: inv.cols, rows: inv.rows, cells: inv.cells, damage: inv.damage, items: inv.items.filter(i => i !== h.inst) } : inv;
    return DRRules.stats(cfg(), view, root.DR_ITEMS);
  }
  // PlayerStatsUI.RefreshUI: số hiện có + (thay đổi dự kiến) màu xanh/đỏ khi đang cầm thiết bị rê lên ô lắp được
  function refreshStats() {
    if (!S || !S.statEls) return;
    const st = liveStats(), c = cfg(), E = S.statEls;
    const fmt = (n, d) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString();
    E.speed.v.textContent = fmt(st.speed / (c.baseMovementSpeedModifier || 1), 1) + ' kn';
    E.fishing.v.textContent = Math.round(st.fishing * 100) + '%';
    E.light.v.textContent = Math.round(st.lumens) + ' lm';
    E.ab.v.textContent = fmt(st.aberrationBonus * 100, 3) + '%';
    const pj = projected();
    const put = (e, n, unit, d) => {
      e.textContent = n ? ' (' + (n > 0 ? '+' : '') + fmt(n, d) + unit + ')' : '';
      e.style.color = n > 0 ? COLOR.POSITIVE : COLOR.NEGATIVE;
    };
    put(E.speed.pj, pj.speed, ' kn', 1); put(E.fishing.pj, pj.fishing * 100, '%', 0);
    put(E.light.pj, pj.light, ' lm', 0); put(E.ab.pj, pj.ab * 100, '%', 3);
  }
  // GridManager.ColorAffectedCells + PlayerStatsUI.OnCanInstallHoveredItemChanged
  function projected() {
    const z = { speed: 0, fishing: 0, light: 0, ab: 0 };
    const c = S && S.cand, h = S && S.held;
    if (!c || !h || c.state === 'bad') return z;
    const add = (def, sign, clean) => {
      const sub = G.subOf(def);
      if (clean) {
        if (sub === G.SUB.ENGINE) z.speed += sign * (def.speedBonus || 0);
        else if (sub === G.SUB.ROD) z.fishing += sign * (def.fishingSpeedModifier || 0);
        else if (sub === G.SUB.LIGHT) z.light += sign * (def.lumens || 0);
      }
      if (def.aberrationBonus) z.ab += sign * def.aberrationBonus;
    };
    if (!(G.typeOf(h.def) & G.TYPE.EQUIPMENT)) return z;
    const clean = !c.fp.some(([x, y]) => G.isDamaged(c.gr.g, x, y));
    add(h.def, 1, clean);
    if (c.objs[0]) add(defOf(c.objs[0]), -1, !G.onDamaged(c.gr.g, c.objs[0]));
    return z;
  }

  function typeTag(type, adv) {
    const cf = ((root.DR_WORLD || {}).HarvestTypeTagConfig || {}).HarvestTypeTagConfig || {};
    const c = (cf.colorLookup || {})[type] || [0.65, 0.54, 0.38, 1];
    const key = (cf.stringLookup || {})[type];
    const t = el('span', 'cg-tag', null, (root.DR_STR && DR_STR[key]) || type.charAt(0) + type.slice(1).toLowerCase());
    t.style.setProperty('--c', 'rgb(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ')');
    if (adv) t.classList.add('adv');
    return t;
  }

  function buildSidePanel(M, side) {
    const p = panelBox('cg-left', M);
    el('div', 'cg-title', p, S.title || 'Kho của tôi');
    for (const gr of side) buildZone(p, gr, M, false);
  }

  function buildZone(p, gr, M, isInv) {
    const g = gr.g, cs = M.cs;
    const zone = el('div', 'cg-zone' + (isInv ? ' inv' : ''), p);
    zone.style.top = (isInv ? 100 + (M.showStats ? 145 : 0) : 50) * M.k + 'px';
    if (isInv) el('div', 'cg-zonebg', zone);
    const box = el('div', 'cg-grid', zone);
    box.dataset.key = gr.key;
    box.style.width = g.cols * cs + 'px'; box.style.height = g.rows * cs + 'px';
    gr.el = box; gr.zone = zone;
    gr.cells = new Array(g.cols * g.rows);
    const icons = showSlotIcons();
    const heldInst = S.held && S.held.inst;
    const hs = heldInst ? G.subOf(S.held.def) : 0;
    const hiSub = (hs === G.SUB.LIGHT || hs === G.SUB.ROD || hs === G.SUB.ENGINE || hs === G.SUB.NET) && icons ? hs : 0;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      if (!G.usable(g, x, y)) continue;
      const cell = g.cells[y * g.cols + x], c = el('div', 'cg-c', box);
      c.style.cssText = 'left:' + x * cs + 'px;top:' + y * cs + 'px;width:' + cs + 'px;height:' + cs + 'px';
      el('i', 'b', c); const o = el('i', 'o', c); el('i', 'f', c);
      const occ = G.itemAt(g, x, y), real = occ && occ !== heldInst ? occ : null;
      if (real) {
        const def = defOf(real);
        o.style.background = occupationColor(def, real);
        c.classList.add('occ');
        if (real.infected) c.classList.add('inf');
      }
      // GridCell.RefreshAcceptedItemTypeImage: ô thiết bị rỗng hiện biểu tượng loại nó nhận, màu mờ
      if (cell.type !== G.TYPE.ALL && icons) {
        const ic = SLOT_ICON.find(s => cell.sub & s[0]);
        const i = el('i', 'ic', c);
        i.style.setProperty('--m', 'url(' + ART(ic ? ic[1] : 'CargoGrid_Default') + ')');
        // GridCell.OnItemPickedUp: cầm đèn/cần/động cơ/lưới thì biểu tượng ô nhận nó sáng trắng, kể cả khi ô đang có đồ
        if (hiSub && (cell.sub & hiSub)) i.classList.add('hi');
        else if (real) i.style.display = 'none';
      }
      gr.cells[y * g.cols + x] = c;
    }
    // ô hỏng nằm dưới đồ (underlay)
    for (const [x, y] of g.damage) {
      const d = el('i', 'cg-dmg', box);
      d.style.cssText = 'left:' + x * cs + 'px;top:' + y * cs + 'px;width:' + cs + 'px;height:' + cs + 'px';
    }
    for (const inst of g.items) {
      if (S.held && S.held.inst === inst) continue;
      const def = defOf(inst), bb = cellsBox(inst.cells);
      const it = el('div', 'cg-item', box);
      it.style.cssText = 'left:' + bb.x * cs + 'px;top:' + bb.y * cs + 'px;width:' + bb.w * cs + 'px;height:' + bb.h * cs + 'px';
      if (G.onDamaged(g, inst) && def.damageMode === 'OPERATION') it.classList.add('grey');
      it.appendChild(itemImg(def, inst.rot, cs));
      if (S.settled === inst) { it.classList.add('settle'); S.settled = null; }
    }
    // người chơi chỉ nhìn ô nằm trong hull: để lưới tự cân giữa vùng (InventoryGrid: nửa ô thấp hơn tâm)
    const zw = M.zoneW, zh = M.panelH - parseFloat(zone.style.top) - 30 * M.k;
    const zx = isInv ? 50 * M.k : (M.panelW - g.cols * cs) / 2;
    zone.style.left = zx + 'px'; zone.style.width = (isInv ? zw : g.cols * cs) + 'px'; zone.style.height = zh + 'px';
    box.style.left = (isInv ? (zw - g.cols * cs) / 2 : 0) + 'px';
    box.style.top = (zh / 2 - (g.rows - (isInv ? 1 : 0)) * cs / 2) + 'px';
    if (!isInv) box.style.top = Math.max(0, (zh - g.rows * cs) / 2) + 'px';
  }

  function occupationColor(def, inst) {
    if (isFish(def)) {
      if (def.isAberration) return COLOR.CRITICAL;
      if (inst.size != null && inst.size >= (cfg().trophyMaxSize || 1.01)) return mul(COLOR.VALUABLE, 0.65); // trophyBackgroundMultiplier
    }
    return def.color || '#444';
  }

  function itemImg(def, rot, cs) {
    const im = new Image();
    im.src = def.sprite; im.draggable = false;
    im.style.width = def.w * cs + 'px'; im.style.height = def.h * cs + 'px';
    im.style.transform = 'translate(-50%,-50%) rotate(' + (-rot) + 'deg)';
    im.onerror = () => { im.style.visibility = 'hidden'; };
    return im;
  }

  function flash(sel) {
    const p = host.querySelector(sel);
    if (!p) return;
    p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');
  }

  // ---------------------------------------------------------------- hình học: ô dưới con trỏ, vị trí đặt
  function gridAt(x, y, pad) {
    for (const gr of S.grids) {
      const r = gr.el.getBoundingClientRect();
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return { gr, r };
    }
    return null;
  }

  // Tâm đồ nằm đúng con trỏ; mỗi ô của đồ rơi vào ô lưới chứa tâm ô đó (GridObjectCell.DoHitTest).
  function candidate() {
    const h = S.held, def = h.def, cs = S.M.cs, bb = bbox(def, h.rot);
    const hit = gridAt(S.ptr.x, S.ptr.y, cs / 2);
    if (!hit) return null;
    const bx = Math.round((S.ptr.x - hit.r.left) / cs - bb.w / 2), by = Math.round((S.ptr.y - hit.r.top) / cs - bb.h / 2);
    const rx = bx - bb.minX, ry = by - bb.minY;
    const ev = evaluate(hit.gr.g, def, rx, ry, h.rot, h.inst);
    return Object.assign({ gr: hit.gr, rx, ry, def }, ev);
  }

  // GridObject.GetPlacementResult + GridManager.ColorAffectedCellsForCurrentObject
  function evaluate(g, def, rx, ry, rot, ignore) {
    const fp = G.footprint(def, rx, ry, rot);
    let inside = 0, accepts = true, clean = true;
    const objs = [];
    for (const [x, y] of fp) {
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue;
      const cell = g.cells[y * g.cols + x];
      if (!G.usable(g, x, y)) continue;
      inside++;
      const o = G.itemAt(g, x, y);
      if (o && o !== ignore && objs.indexOf(o) < 0) objs.push(o);
      if (G.isDamaged(g, x, y)) clean = false;
      if (!G.accepts(cell, def)) accepts = false;
    }
    const valid = inside === fp.length;
    const okDamage = clean || def.ignoreDamageWhenPlacing;
    let state = 'bad';
    if (valid && accepts && okDamage) {
      if (!objs.length) state = 'ok';
      else if (objs.length === 1 && !lockedFor(defOf(objs[0]))) state = 'semi';
    }
    return { fp, state, objs };
  }

  function updatePreview() {
    if (!S) return;
    for (const gr of S.grids) if (gr.lit) { for (const c of gr.lit) c.querySelector('.f').classList.remove('ok', 'bad', 'semi'); gr.lit = null; }
    const c = S.cand = S.held ? candidate() : null;
    if (c) {
      c.gr.lit = [];
      for (const [x, y] of c.fp) {
        const cell = c.gr.cells[y * c.gr.g.cols + x];
        if (x < 0 || y < 0 || x >= c.gr.g.cols || y >= c.gr.g.rows || !cell) continue;
        cell.querySelector('.f').classList.add(c.state);
        c.gr.lit.push(cell);
      }
    }
    refreshStats();
  }

  // ---------------------------------------------------------------- đồ đang cầm
  function refreshHeld() {
    held.style.display = 'none';
    if (!S || !S.held) { cursor.style.display = 'none'; hideActs(); return; }
    const h = S.held, def = h.def, cs = S.M.cs;
    held.innerHTML = '';
    held.style.display = 'block';
    held.style.width = def.w * cs + 'px'; held.style.height = def.h * cs + 'px';
    const im = itemImg(def, 0, cs);
    im.style.transform = 'translate(-50%,-50%) rotate(' + h.angle + 'deg)';
    held.appendChild(im); h.img = im;
    showActs();
    startLoop();
  }

  function startLoop() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }

  // Mô phỏng GridObject.FixedUpdate: lò xo kéo "vị trí ảo" theo con trỏ; vận tốc làm méo ảnh (shader Squishy_Mat).
  // Shader thật chỉ là bản thay thế rỗng trong bản xuất nên hình méo là [ĐỀ XUẤT]: kéo giãn dọc theo vận tốc.
  function loop(now) {
    raf = 0;
    if (!S || !S.held) { updateRing(); return; }
    const h = S.held, dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    h.acc = (h.acc || 0) + dt;
    while (h.acc >= TICK) {
      h.acc -= TICK;
      const dx = S.ptr.x - h.vx, dy = S.ptr.y - h.vy, d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const f = d * TICK * SQUISH_FORCE;
        h.sx += dx / d * f; h.sy += dy / d * f;
      }
      const damp = Math.min(1, TICK * SQUISH_DAMP);
      h.sx -= h.sx * damp; h.sy -= h.sy * damp;
      h.vx += h.sx; h.vy += h.sy;
    }
    // góc ảnh nội suy về góc đích (rotationSpeed 25)
    h.angle += (h.target - h.angle) * Math.min(1, dt * ROT_SPEED);
    if (Math.abs(h.target - h.angle) < 0.05) h.angle = h.target;
    const sf = h.def.squishFactor || 0;
    let tf = '';
    if (sf > 0) {
      const v = Math.hypot(h.sx, h.sy), m = Math.min(v, 20) / 20, a = m * 0.32 * sf;
      const th = Math.atan2(h.sy, h.sx) * 180 / Math.PI;
      tf = ' rotate(' + th.toFixed(1) + 'deg) scale(' + (1 + a).toFixed(3) + ',' + (1 / (1 + a * 0.7)).toFixed(3) + ') rotate(' + (-th).toFixed(1) + 'deg)';
    }
    const w = parseFloat(held.style.width), hh = parseFloat(held.style.height);
    held.style.transform = 'translate(' + (S.ptr.x - w / 2).toFixed(1) + 'px,' + (S.ptr.y - hh / 2).toFixed(1) + 'px)' + tf;
    if (h.img) h.img.style.transform = 'translate(-50%,-50%) rotate(' + h.angle.toFixed(2) + 'deg)';
    // khung góc con trỏ (CursorProxy.cursorBorderImage) bao quanh đồ đang cầm
    const bb = bbox(h.def, h.rot), cs = S.M.cs;
    cursor.style.display = 'block';
    cursor.style.width = bb.w * cs + 'px'; cursor.style.height = bb.h * cs + 'px';
    cursor.style.transform = 'translate(' + (S.ptr.x - bb.w * cs / 2) + 'px,' + (S.ptr.y - bb.h * cs / 2) + 'px)';
    updateRing();
    raf = requestAnimationFrame(loop);
  }

  function updateCursor() { if (S && !S.held) cursor.style.display = 'none'; }

  function rotate() {
    if (!S || !S.held) return;
    const h = S.held;
    h.rot = (h.rot + 270) % 360;      // chuột phải = RotateClockwise: Unity z giảm 90
    h.target += 90;                   // CSS: dương = xuôi chiều kim đồng hồ
    if ((h.def.squishFactor || 0) > 0) { h.sx += 60; }   // SetRotation(instant:false): velocity = (60,0,0)
    play('ui.grid.rotate');
    updatePreview();
    refreshTip();
    startLoop();
  }

  // ---------------------------------------------------------------- nhặt / đặt / vứt
  function makeHeld(inst, src, ptr) {
    const def = defOf(inst);
    return {
      inst, def, src, rot: inst.rot || 0, angle: -(inst.rot || 0), target: -(inst.rot || 0),
      vx: ptr.x, vy: ptr.y, sx: 0, sy: 0, acc: 0, img: null
    };
  }

  function pickUp(gr, inst, e) {
    const def = defOf(inst);
    if (lockedFor(def)) {
      play('ui.grid.error');
      toast(def.moveMode === 'NONE' ? 'Không dời được món này' : 'Cần cập bến mới tháo lắp được thiết bị');
      return;
    }
    S.held = makeHeld(inst, gr.key, { x: e.clientX, y: e.clientY });
    S.held.dragging = true; S.held.down = { x: e.clientX, y: e.clientY }; S.held.moved = false;
    play(isFish(def) ? 'ui.grid.pick.organic' : 'ui.grid.pick.inorganic');
    hideTip();
    render();
    startLoop();
  }

  function tryPlace(fromDrag) {
    const h = S.held, c = S.cand = candidate();
    if (!c || c.state === 'bad') {
      if (fromDrag && h.src !== 'new' && h.src !== 'swap') { cancelHold(); return false; }
      play('ui.grid.error');
      return false;
    }
    const inst = h.inst, def = h.def, g = c.gr.g;
    const srcG = h.src !== 'new' && h.src !== 'swap' ? DR.grid(h.src) : null;
    let next = null;
    if (c.state === 'semi') {
      // đổi chỗ: món bị đè bị nhấc khỏi lưới và dính vào con trỏ
      const occ = c.objs[0];
      G.remove(g, occ);
      next = makeHeld(occ, 'swap', S.ptr);
      next.rot = occ.rot || 0;
    }
    if (srcG === g) G.move(g, inst, def, c.rx, c.ry, h.rot);
    else {
      if (srcG) G.remove(srcG, inst);
      inst.uid = g.seq++; inst.x = c.rx; inst.y = c.ry; inst.rot = h.rot; inst.cells = G.footprint(def, c.rx, c.ry, h.rot);
      g.items.push(inst);
    }
    if (srcG !== g && root.DR && DR.emit) DR.emit('cargo', c.gr.key, inst);
    play(isFish(def) ? 'ui.grid.place.organic' : 'ui.grid.place.inorganic');
    if (h.src === 'new') S.result = 'placed';
    S.settled = inst;
    S.held = next;
    if (next) { next.dragging = false; play(isFish(defOf(next.inst)) ? 'ui.grid.pick.organic' : 'ui.grid.pick.inorganic'); }
    render();
    return true;
  }

  function cancelHold() {
    if (!S.held || S.held.src === 'new' || S.held.src === 'swap') return;
    S.held = null;
    render();
  }

  function canDiscard(def, src) {
    return def.canBeDiscardedByPlayer !== false || src === 'new';
  }

  function discard(target) {
    if (!S) return;
    if (target.held) {
      const h = S.held;
      if (!h || !canDiscard(h.def, h.src)) { play('ui.grid.error'); toast('Món này không vứt được'); return; }
      if (h.src === 'new') S.result = 'discarded';
      else if (h.src !== 'swap') G.remove(DR.grid(h.src), h.inst);
      play('ui.grid.discard.trinket');
      S.held = null;
    } else {
      const { gr, inst } = target;
      if (!canDiscard(defOf(inst), gr.key)) { play('ui.grid.error'); return; }
      G.remove(gr.g, inst);
      play('ui.grid.discard.trinket');
      S.hover = null;
    }
    hideTip();
    render();
  }

  function quickMove(gr, inst) {
    const def = defOf(inst);
    if (!S.grids.some(g => g.key === 'STORAGE')) return;
    if (gr.key === 'INVENTORY' && lockedFor(def)) { play('ui.grid.error'); return; }
    if (gr.key === 'INVENTORY' && def.moveMode === 'INSTALL') { play('ui.grid.error'); return; }  // StorageModeActionHandler.CanUseQuickMoveAction
    const dst = S.grids.find(g => g.key === (gr.key === 'INVENTORY' ? 'STORAGE' : 'INVENTORY'));
    if (!dst) return;
    const spot = G.findSpot(dst.g, def, 0, false);
    if (!spot) { play('ui.grid.error'); toast(gr.key === 'INVENTORY' ? 'Kho đã đầy' : 'Khoang đã đầy'); return; }
    G.remove(gr.g, inst);
    inst.uid = dst.g.seq++; inst.x = spot.x; inst.y = spot.y; inst.rot = spot.rot; inst.cells = G.footprint(def, spot.x, spot.y, spot.rot);
    dst.g.items.push(inst);
    if (root.DR && DR.emit) DR.emit('cargo', dst.key, inst);
    play(isFish(def) ? 'ui.grid.place.organic' : 'ui.grid.place.inorganic');
    S.hover = null; hideTip();
    render();
  }

  // ---------------------------------------------------------------- ô đang rê chuột
  function hoverAt(x, y) {
    const hit = gridAt(x, y, 0);
    if (!hit) return null;
    const cs = S.M.cs, cx = Math.floor((x - hit.r.left) / cs), cy = Math.floor((y - hit.r.top) / cs);
    if (cx < 0 || cy < 0 || cx >= hit.gr.g.cols || cy >= hit.gr.g.rows) return null;
    const inst = G.itemAt(hit.gr.g, cx, cy);
    if (!inst || (S.held && S.held.inst === inst)) return null;
    return { gr: hit.gr, inst, cx, cy };
  }

  // ---------------------------------------------------------------- tooltip (TooltipUI.ConstructSpatialItemTooltip)
  function tipRow(parent, label, value, color) {
    const r = el('div', 'row', parent);
    el('span', 'l', r, label);
    const v = el('span', 'v', r);
    if (value instanceof Node) v.appendChild(value); else v.textContent = value;
    if (color) v.style.color = color;
    return r;
  }
  function chip(parent, key, txt) {
    const r = el('div', 'pr', parent);
    el('b', '', r, key); el('span', '', r, txt);
  }

  function buildTip(inst, def, mode) {
    tip.innerHTML = '';
    const hd = el('div', 'hd', tip);
    if (def.itemTypeIcon) { const i = new Image(); i.src = def.itemTypeIcon; i.className = 'ic'; hd.appendChild(i); }
    el('span', 'nm', hd, def.name);
    el('i', 'ln', hd);
    if (mode === 'HOVER') {
      const g = inst && S.hover ? S.hover.gr.g : DR.grid('INVENTORY');
      if (isFish(def)) {
        const cm = sizeCm(def, inst), fk = inst.infected ? 'inf' : freshKey(inst);
        const trophy = inst.size != null && inst.size >= (cfg().trophyMaxSize || 1.01);
        if (cm != null) tipRow(tip, 'Kích thước:', (trophy ? '★ ' : '') + (cm > 100 ? (cm / 100).toFixed(2) + ' m' : cm.toFixed(1) + ' cm'), trophy ? COLOR.VALUABLE : null);
        tipRow(tip, 'Tình trạng:', fk === 'inf' ? 'Nhiễm bệnh' : FRESH_VN[fk], fk === 'inf' ? COLOR.CRITICAL : FRESH_COL[fk]);
        if (def.harvestableType && def.harvestableType !== 'NONE') tipRow(tip, 'Loại:', typeTag(def.harvestableType, def.requiresAdvancedEquipment));
      }
      const equip = (G.typeOf(def) & G.TYPE.EQUIPMENT) && !(G.subOf(def) & G.SUB.POT);
      if (equip) {
        const hours = (cfg().equipmentInstallTimePerSquare || 0) * def.dims.length;
        tipRow(tip, 'Thời gian lắp:', (Math.round(hours * 10) / 10) + 'h');
        if (def.damageMode === 'OPERATION' && inst) {
          const bad = G.onDamaged(g, inst);
          tipRow(tip, 'Tình trạng:', bad ? 'Hư hỏng' : 'Hoạt động', bad ? COLOR.NEGATIVE : null);
        }
      }
      const sub = G.subOf(def), on = !(inst && S.hover && G.onDamaged(S.hover.gr.g, inst));
      if (sub & G.SUB.ROD) {
        tipRow(tip, 'Tốc độ câu:', on ? '+' + Math.round((def.fishingSpeedModifier || 0) * 100) + '%' : '0%', on ? null : COLOR.NEGATIVE);
        if (def.aberrationBonus) tipRow(tip, 'Thưởng dị biến:', '+' + Math.round(def.aberrationBonus * 1000) / 10 + '%');
        const tg = el('span', 'tags');
        for (const t of def.harvestableTypes || []) tg.appendChild(typeTag(t, def.isAdvancedEquipment));
        if (tg.children.length) tipRow(tip, 'Câu được:', tg);
      }
      if (sub & G.SUB.ENGINE) tipRow(tip, 'Tốc độ:', on ? '+' + (Math.round((def.speedBonus || 0) * 10) / 10) + ' kn' : '0 kn', on ? null : COLOR.NEGATIVE);
      if (sub & G.SUB.LIGHT) {
        tipRow(tip, 'Độ sáng:', on ? '+' + Math.round(def.lumens || 0) + ' lm' : '0 lm', on ? null : COLOR.NEGATIVE);
        tipRow(tip, 'Tầm chiếu:', on ? Math.round(def.range || 0) + ' m' : '0 m', on ? null : COLOR.NEGATIVE);
      }
      if (def.maxDurabilityDays && inst) {
        const f = inst.dur != null ? Math.max(0, Math.min(1, inst.dur / def.maxDurabilityDays)) : 1;
        const bar = el('span', 'bar'); const fill = el('i', '', bar); fill.style.width = f * 100 + '%';
        el('em', '', bar, Math.round(f * 100) + ' %');
        tipRow(tip, 'Độ bền:', bar);
      }
      if (def.desc) el('p', 'ds', tip, def.desc);
    }
    const pr = el('div', 'prompts', tip);
    const h = S.held;
    if (h) {
      chip(pr, 'Chuột trái', 'Đặt'); chip(pr, 'Chuột phải', 'Xoay');
      if (canDiscard(h.def, h.src)) chip(pr, 'Giữ Z', 'Vứt');
    } else if (S.hover) {
      if (!lockedFor(def)) chip(pr, 'Chuột trái', 'Nhặt');
      if (canDiscard(def, S.hover.gr.key) && (G.typeOf(def) & G.TYPE.EQUIPMENT) === 0) chip(pr, 'Giữ Z', 'Vứt');
      if (S.grids.some(g => g.key === 'STORAGE') && !(S.hover.gr.key === 'INVENTORY' && def.moveMode === 'INSTALL')) chip(pr, 'Chuột giữa', S.hover.gr.key === 'INVENTORY' ? 'Vào kho' : 'Về khoang');
    }
  }

  function refreshTip() {
    if (!S) return;
    if (S.held) showTip(S.held.inst, S.held.def, 'HOLD');
    else if (S.hover) showTip(S.hover.inst, defOf(S.hover.inst), 'HOVER');
    else hideTip();
  }
  function showTip(inst, def, mode) {
    buildTip(inst, def, mode);
    tip.classList.add('on');
    placeTip();
  }
  function hideTip() { if (tip) tip.classList.remove('on'); }

  // TooltipUI.LateUpdate: con trỏ ở nửa trái -> tooltip bên phải con trỏ, ngược lại bên trái; kẹp trong vùng trống giữa hai bảng
  function placeTip() {
    if (!S || !tip.classList.contains('on')) return;
    const M = S.M, w = tip.offsetWidth, h = tip.offsetHeight, gap = 25 * M.k;
    const hasSide = S.grids.some(g => g.key !== 'INVENTORY'), hasInv = M.hasInv;
    const areaL = hasSide ? M.panelW : 0, areaR = hasInv ? M.W - M.panelW : M.W;
    let x = S.ptr.x < M.W / 2 ? S.ptr.x + gap : S.ptr.x - gap - w;
    x = Math.max(areaL, Math.min(areaR - w, x));
    let y = S.ptr.y - gap;
    y = Math.max(0, Math.min(M.H - h, y));
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  // ---------------------------------------------------------------- nút trên màn hình (cảm ứng) + vòng giữ phím vứt
  function showActs() {
    if (!acts) {
      acts = el('div', 'cg-acts dr-ui', document.body);
      const r = el('button', 'cg-act', acts, 'Xoay'); r.dataset.act = 'rotate';
      r.onclick = e => { e.stopPropagation(); rotate(); };
      const d = el('button', 'cg-act', acts, 'Vứt (giữ)'); d.dataset.act = 'discard';
      d.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); startDiscard(); });
      d.addEventListener('pointerup', e => { e.stopPropagation(); stopDiscard(); });
      d.addEventListener('pointerleave', () => stopDiscard());
      acts.addEventListener('pointerdown', e => e.stopPropagation());
    }
    acts.style.display = 'flex';
  }
  function hideActs() { if (acts) acts.style.display = 'none'; }

  function startDiscard() {
    if (!S || S.disc) return;
    let target = null, def = null;
    if (S.held) { target = { held: true }; def = S.held.def; if (!canDiscard(def, S.held.src)) { play('ui.grid.error'); toast('Món này không vứt được'); return; } }
    else if (S.hover) {
      def = defOf(S.hover.inst);
      if (!canDiscard(def, S.hover.gr.key) || (G.typeOf(def) & G.TYPE.EQUIPMENT)) return;
      target = { gr: S.hover.gr, inst: S.hover.inst };
    }
    if (!target) return;
    const sec = def.discardHoldTimeOverride ? def.discardHoldTimeSec : DISCARD_HOLD;
    S.disc = { t0: performance.now(), sec, target, warn: !!def.showAlertOnDiscardHold };
    startLoop();
    discTick();
  }
  function discTick() {
    if (!S || !S.disc) return;
    const p = (performance.now() - S.disc.t0) / 1000 / S.disc.sec;
    if (p >= 1) { const t = S.disc.target; S.disc = null; updateRing(); discard(t); return; }
    updateRing();
    requestAnimationFrame(discTick);
  }
  function stopDiscard() { if (S && S.disc) { S.disc = null; updateRing(); } }
  function updateRing() {
    if (!S || !S.disc) { ring.style.display = 'none'; return; }
    const p = Math.min(1, (performance.now() - S.disc.t0) / 1000 / S.disc.sec);
    ring.style.display = 'block';
    ring.style.setProperty('--p', (p * 360).toFixed(1) + 'deg');
    ring.style.setProperty('--c', S.disc.warn ? COLOR.NEGATIVE : COLOR.NEUTRAL);
    ring.style.transform = 'translate(' + (S.ptr.x + 18) + 'px,' + (S.ptr.y + 18) + 'px)';
  }

  // ---------------------------------------------------------------- con trỏ
  function onDown(e) {
    if (!S || e.target.closest('button') || e.target.closest('.cg-acts')) return;
    S.ptr = { x: e.clientX, y: e.clientY }; lastPtr = S.ptr; lastType = e.pointerType;
    // dựng lại DOM khi nhặt/đặt làm mất phần tử đích: giữ con trỏ ở host để cảm ứng không mất sự kiện kéo
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* trình duyệt cũ */ }
    if (e.button === 2) { if (S.held) rotate(); return; }          // RotateClockwise = chuột phải
    if (e.button === 1) {                                             // QuickMove = chuột giữa
      e.preventDefault();
      const h = hoverAt(e.clientX, e.clientY);
      if (h && !S.held) quickMove(h.gr, h.inst);
      return;
    }
    if (e.button !== 0) return;
    if (S.held) { if (!S.held.dragging) tryPlace(false); return; }
    const h = hoverAt(e.clientX, e.clientY);
    if (h) pickUp(h.gr, h.inst, e);
  }

  function onMove(e) {
    lastPtr = { x: e.clientX, y: e.clientY }; lastType = e.pointerType;
    if (!S) return;
    S.ptr = lastPtr;
    if (S.held) {
      const h = S.held;
      if (h.dragging && !h.moved && h.down && Math.hypot(e.clientX - h.down.x, e.clientY - h.down.y) > 8) h.moved = true;
      updatePreview();
      placeTip();
      startLoop();
      return;
    }
    const h = hoverAt(e.clientX, e.clientY);
    const same = h && S.hover && h.inst === S.hover.inst;
    S.hover = h;
    if (!h) { hideTip(); return; }
    if (!same) refreshTip(); else placeTip();
  }

  function onUp() {
    if (!S) return;
    if (!S.held || !S.held.dragging) return;
    if (S.held.moved) { S.held.dragging = false; tryPlace(true); }
    else { S.held.dragging = false; refreshTip(); }   // chạm không kéo = nhấc đồ lên, bấm ô khác để đặt
  }

  // ---------------------------------------------------------------- mở / đóng
  function open(opts) {
    if (!root.DR || !DR.s) return false;
    if (S) close(true);
    ensureDom();
    const keys = (opts && opts.keys && opts.keys.length ? opts.keys : ['INVENTORY']).filter(k => DR.s.grids[k]);
    const start = lastPtr || { x: root.innerWidth * 0.75, y: root.innerHeight * 0.5 };
    S = {
      keys, title: opts && opts.title, onClose: opts && opts.onClose, ptr: start,
      grids: keys.map(k => ({ key: k, g: DR.grid(k) })), held: null, changed: false, prevMode: DR.mode, result: null,
      shown: false, hover: null, disc: null
    };
    if (DR.mode === 'sail') S.changed = DR.setMode('cargo');
    if (opts && opts.holding) {
      const inst = opts.holding;
      inst.rot = inst.rot || 0;
      S.held = makeHeld(inst, 'new', start);
      S.held.dragging = false;
    }
    host.classList.add('on');
    play('ui.grid.open');
    render();
    // trượt vào: thêm lớp .on sau một khung để chạy transition (SlidePanel: 0,5 giây, OutExpo)
    requestAnimationFrame(() => { if (S) { S.shown = true; host.querySelectorAll('.cg-panel').forEach(p => p.classList.add('on')); } });
    return true;
  }

  function close(force) {
    if (!S) return;
    // GridManager: không đóng được khi đang cầm đồ vừa kiếm / vừa đổi chỗ
    if (S.held && (S.held.src === 'new' || S.held.src === 'swap') && !force) {
      play('ui.grid.error'); toast('Hãy đặt hoặc vứt món đang cầm trước khi đóng'); return false;
    }
    const s = S; S = null;
    host.classList.remove('on');
    held.style.display = 'none'; cursor.style.display = 'none'; ring.style.display = 'none'; hideTip(); hideActs();
    if (s.changed && DR.mode === 'cargo') DR.setMode(s.prevMode === 'cargo' ? 'sail' : s.prevMode);
    play('ui.journal.close');
    if (s.onClose) s.onClose({ holding: s.result });
    return true;
  }

  root.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (root.DRMinigame && DRMinigame.isOpen()) return;
    if (S) {
      const k = e.code;
      if (k === 'KeyZ') { if (!e.repeat) startDiscard(); }
      else if (k === 'Escape' || k === 'KeyX') {
        if (S.held && S.held.src !== 'new' && S.held.src !== 'swap') cancelHold(); else close();
      } else if (k === 'Tab' || k === 'KeyI') { if (S.held && S.held.src === 'new') close(); else if (S.changed) close(); }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if ((e.code === 'Tab' || e.code === 'KeyI') && root.DR && DR.s && DR.mode === 'sail' && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation();
      open({ keys: ['INVENTORY'], title: 'Khoang thuyền' });
    }
  }, true);
  root.addEventListener('keyup', e => { if (S && e.code === 'KeyZ') stopDiscard(); }, true);
  root.addEventListener('blur', () => stopDiscard());

  if (root.DR && DR.on) DR.on('mode', m => { if (S && m !== 'cargo' && m !== 'dock' && S.changed) { S.changed = false; close(true); } });

  root.DRCargo = {
    open, close: () => close(), isOpen: () => !!S,
    _debug: () => S && {
      cs: S.M.cs, k: S.M.k, ptr: S.ptr, showStats: S.M.showStats,
      held: S.held && { id: S.held.inst.id, rot: S.held.rot, src: S.held.src, dragging: S.held.dragging, angle: S.held.angle },
      hover: S.hover && { id: S.hover.inst.id, key: S.hover.gr.key },
      tip: tip.classList.contains('on') ? tip.textContent : null, disc: !!S.disc, cand: S.cand && { state: S.cand.state, x: S.cand.rx, y: S.cand.ry },
      grids: S.grids.map(gr => { const r = gr.el.getBoundingClientRect(); return { key: gr.key, cols: gr.g.cols, rows: gr.g.rows, x: r.left, y: r.top, w: r.width, h: r.height }; })
    }
  };
})(window);
