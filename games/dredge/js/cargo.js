/*
 * Màn hình khoang thuyền và mọi lưới chứa đồ hiện cùng nó, dựng lại theo UI gốc của DREDGE (Game.unity: PlayerSlidePanel/InventoryGrid,
 * StorageSlidePanel, QuestGridSlidePanel, UpgradeGridSlidePanel, HarvestMinigameView/StorageTray; GridCell.prefab, GridObject.prefab,
 * InfectedObjectCell.prefab, TooltipUI; mã: GridManager, GridUI, GridCell, GridObject, GridObjectAudio, BaseGridModeActionHandler và
 * các lớp con Default/Storage/Equipment, QuestGridPanel, UpgradeGridPanel, TooltipUI + các TooltipSection*, PlayerStatsUI, CursorProxy).
 *
 * Mối nối dùng chung (đợt chuẩn gốc 2). Một món cầm duy nhất đi qua mọi lưới, như GridManager.CurrentlyHeldObject:
 *
 *   DRCargo.open({
 *     right: { tabs: ['INVENTORY', 'STORAGE'] },             // bảng người chơi bên PHẢI; tab đầu đang chọn; chỉ vẽ tab được đưa vào (C11)
 *     left: null | { kind: 'storage'|'shop'|'quest'|'tray',   // bảng bên TRÁI (StorageSlidePanel / ShopPanel / QuestGridSlidePanel / StorageTray)
 *                    title, tabs: [{ key, icon, title, locked, grid }], subtitle,
 *                    quest: <QuestGridConfig> (kind 'quest'; vd DR_UPGRADES['tier-1-engines-1'].questGrid),
 *                    footer: { buttons: [{ label, hold, enabled(), run() }], help },
 *                    handler, onExit(complete) },
 *     docked: false | true,                                  // true = không che màn, không đổi DR.mode, Esc/Tab không đóng (câu cá: mở cạnh bảng câu)
 *     holding: null | { inst, src: 'harvest'|'buy'|..., onPlaced(inst, key), onDiscarded(inst) },
 *     mode: 'default' | 'equip' | 'repair',                  // equip = Player.CanMoveInstalledItems (cập bến); mặc định suy từ DR.mode
 *     onClose(result)
 *   }) -> { close(), refresh(), held(), setLeft(left), hold(holding) }
 *   hold(holding): đặt món lên con trỏ của bảng ĐANG mở (GridManager.AddItemOfTypeToCursor; vd. cá vừa câu khi khoang docked đã mở sẵn)
 *
 *   handler = { canPick(item, key), canPlace(item, key, x, y, rot), onPick(item, key), onPlace(item, key, fromKey), onDiscard(item, key),
 *               prompts(ctx) -> [{ id, label, price, hold, enabled, run(), bind, area }] }   // ctx = { hovered, held, cand, mode }
 *   bind: 'lmb' (chuột trái = PickUpPlace), 'rmb' (RotateItem), 'mmb' (QuickMove), 'KeyZ' (DiscardItem) hoặc 'btn' (nút bấm);
 *   area: 'tip' (mục Control Prompts trong tooltip, mặc định) | 'control' (vùng điều khiển góc dưới phải) | 'footer' (chân bảng trái).
 *   hold > 0 = giữ chừng ấy giây mới chạy (DredgePlayerActionHold: vòng tiến độ, tiếng "Hold - Active" lặp, "Hold - Complete" khi xong).
 *   Handler dựng sẵn: Default (C08), Storage (C07), Harvest (BEING_HARVESTED luôn vứt được), Equipment (C05: giữ 0,6 s tháo/lắp,
 *   rồi DR.emit('passTime', giờ, 'INSTALL')), QuestDeliver (bóng mờ SILHOUETTE, completeConditions mỗi lần đổi, REVISITABLE lưu DR.s.grids),
 *   Tray (STORAGE_TRAY 6x3, huỷ và tính là vứt khi đóng). Buy/Sell/Repair do chủ cửa hàng viết đợt sau bằng chính `handler` này.
 *
 *   Tương thích cũ: open({ keys:['INVENTORY','STORAGE'], title, holding: <inst>, onClose }) vẫn chạy (spots.js, dock.js, hud.js, main.js).
 *   DRCargo.tickFreshness()  gọi mỗi khung từ main.js/sky.js: cá mất tươi theo FreshnessCoroutine, về 0 thành Rot (C10).
 *   DRCargo.sfxFor(ev, def, state)  chọn clip như GridObjectAudio.cs:70-149 (ev = 'pick'|'place'|'drop'|'rotate'|'error').
 *
 * Bảng khoang là bảng trượt bên PHẢI màn hình (650x935 đơn vị trên canvas 1920x1080, CanvasScaler khớp theo chiều cao),
 * thế giới 3D vẫn hiện bên trái. Điều khiển PC (DredgeControlBindings.cs:304-344):
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
  // tooltip.gadget.effect.* (strings.js) -> tiếng Việt
  const GADGET_VN = { TURN_SPEED: 'Tốc độ rẽ', REVERSE_SPEED: 'Tốc độ lùi', DREDGE_SPEED: 'Tốc độ vét', FISHING_SPEED: 'Tốc độ câu', HEAT_SINK: 'Hút nhiệt', TRAWL_CATCH_RATE: 'Tỉ lệ lưới kéo' };
  const DISCARD_HOLD = 0.75;            // DefaultActionHandler.defaultDiscardHoldTimeSec
  const INSTALL_HOLD = 0.6;             // EquipmentModeActionHandler.cs:22,32 (tháo / lắp đều 0,6 s)
  const SQUISH_FORCE = 25, SQUISH_DAMP = 15, ROT_SPEED = 25; // GridObject.prefab: squishForce, squishDamping, rotationSpeed
  const TICK = 0.02;                    // FixedUpdate của Unity
  const MIN_K = 0.46;                   // [ĐỀ XUẤT] hệ số tỉ lệ nhỏ nhất để chữ còn đọc được trên điện thoại
  const FADED = 0.196;                  // GridObject.maintenanceModeFadedColor: đồ không có độ bền mờ đi trong chế độ sửa

  // Trạng thái lưới theo GridObjectState của bản gốc, suy từ khoá lưới
  const stateOf = key => key === 'INVENTORY' ? 'IN_INVENTORY' : key === 'STORAGE' ? 'IN_STORAGE' : key === 'STORAGE_TRAY' ? 'IN_TRAY'
    : /^Shop_/.test(key) ? 'IN_SHOP' : 'IN_QUEST_GRID';

  let host = null, held = null, tip = null, ring = null, acts = null, cursor = null, ctl = null;
  let S = null;
  let lastPtr = null, lastType = '', raf = 0, lastT = 0;
  let bubble = null;                     // ảnh InfectionBubble cho hạt nhiễm bệnh

  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* tiếng là phần phụ */ } };
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  const isFish = def => G.subOf(def) === G.SUB.FISH;                  // GridObjectAudio.IsOrganic: đúng FISH (Rot là override)
  const defOf = inst => DR.item(inst.id);
  const cfg = () => root.DR_CONFIG || {};
  const str = k => (root.DR_STR && DR_STR[k]) || k;
  const sizeCm = (def, inst) => def.minSizeCentimeters != null && inst.size != null
    ? def.minSizeCentimeters + (def.maxSizeCentimeters - def.minSizeCentimeters) * inst.size : null;
  const freshKey = inst => DRRules.freshLabel(cfg(), inst.fresh == null ? cfg().maxFreshness : inst.fresh);
  const hex = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mul = (c, f) => 'rgb(' + hex(c).map(v => Math.round(v * f)).join(',') + ')';
  const fmt = (n, d) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString();
  const money = v => '$' + Number(v).toFixed(2);
  const isEquip = def => (G.typeOf(def) & G.TYPE.EQUIPMENT) !== 0;
  const isInstall = def => isEquip(def) && def.moveMode === 'INSTALL';
  const inMinigame = () => !!(root.DRMinigame && DRMinigame.isOpen && DRMinigame.isOpen());   // GameEvents.OnActivelyHarvestingChanged
  // QuestManager.IsIntroQuestCompleted: vứt thiết bị chỉ khi xong nhiệm vụ mở đầu (DefaultActionHandler.cs:113)
  const introDone = () => !!(root.DRQuests && DRQuests.state && DRQuests.state('Quest_Intro') === 'COMPLETED');
  // Player.IsBelowInsaneTooltipThreshold: sanity <= insaneTooltipThreshold (1 = tỉnh táo)
  const insane = () => !!(DR.s && cfg().insaneTooltipThreshold != null && DR.s.sanity <= cfg().insaneTooltipThreshold);
  // ItemManager.GetInstallTimeForItem: equipmentInstallTimePerSquare x số ô
  const installHours = def => (cfg().equipmentInstallTimePerSquare || 0) * (def.dims || []).length;
  const hoursStr = h => { const s = fmt(h, 1); return s.replace('.', ','); };   // ToString(".#") rồi dấu phẩy thập phân tiếng Việt

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

  // ---------------------------------------------------------------- tiếng (GridObjectAudio.cs:70-149, nguyên văn)
  // 15 override của Game.unity &124503 (GridObjectAudio.objectAudioOverrides), giải GUID qua work-sfx/guids.json + Data/SpatialItemData/*.meta.
  // Tên là tên clip gốc; DRAudio.resolve tra qua trường orig của data/audio.js, clip chưa bóc thì chủ tiếng bổ sung theo đúng tên.
  const PERSON = { pick: ['Person - Pickup'], place: ['Person - Place'] };
  const OVERRIDE = {
    'quest-dog': { pick: ['Dog - Pick Up 1', 'Dog - Pick Up 2', 'Dog - Pick Up 3'], place: ['Dog - Pick Up 1', 'Dog - Pick Up 2', 'Dog - Pick Up 3'] },
    rot: { pick: ['Organic Item - Pick up'], place: ['Organic Item - Place'], drop: ['Organic Item - Drop'] },
    'quest-hermit': PERSON, 'quest-castaway': PERSON, 'quest-builder': PERSON,
    relic1: { pick: ['Relic Key Pickup'], place: ['Relic Key Place'] },
    relic2: { pick: ['Relic Musicbox Pickup'], place: ['Relic Musicbox Place'] },
    relic3: { pick: ['Relic Ring Pickup'], place: ['Relic Ring Place'] },
    relic4: { pick: ['Relic Necklace Pickup'], place: ['Relic Necklance Place'] },   // "Necklance": tên clip gốc viết sai chính tả
    relic5: { pick: ['Relic Pocketwatch Pickup'], place: ['Relic Pocketwatch Place'] },
    'quest-ice-stone': { pick: ['Ice Stone - Pick up'], place: ['Ice Stone - Place'] },
    'dark-splash': { pick: ['Dark Splash-001'], place: ['Dark Splash-002'], drop: ['Dark Splash-003'] },
    'repair-boat': { drop: ['Repair Kit'] }, 'repair-panic': { drop: ['Sanity Kit'] }, 'repair-pot': { drop: ['Crabpot Kit'] }
  };
  const pickRandom = a => a[Math.floor(Math.random() * a.length)];
  // ev: 'pick' (OnItemPickedUp) | 'place' (OnItemPlaceComplete success) | 'drop' (OnItemDestroyed playerDestroyed) | 'rotate' | 'error'
  // state: GridObjectState của món lúc nhấc (IsEquipment(GridObject) cần IN_INVENTORY); lúc vứt không xét trạng thái.
  function sfxFor(ev, def, state) {
    if (ev === 'rotate') return 'ui.grid.rotate';
    if (ev === 'error') return 'ui.grid.error';
    const ov = OVERRIDE[def.id], o = ov && ov[ev];
    if (o && o.length) return pickRandom(o);
    const trinket = G.subOf(def) === G.SUB.TRINKET;
    if (ev === 'pick') {
      if (def.isAberration) return 'ui.grid.pick.aberration';
      if (isFish(def)) return 'ui.grid.pick.organic';
      if (isInstall(def) && state === 'IN_INVENTORY') return 'ui.grid.equip.uninstall';
      return trinket ? 'ui.grid.pick.trinket' : 'ui.grid.pick.inorganic';
    }
    if (ev === 'place') {
      if (isFish(def)) return 'ui.grid.place.organic';
      if (isInstall(def) && state === 'IN_INVENTORY') return 'ui.grid.equip.install';
      return trinket ? 'ui.grid.place.trinket' : 'ui.grid.place.inorganic';
    }
    if (isFish(def)) return 'ui.grid.drop.organic';
    if (isInstall(def)) return 'ui.grid.equip.uninstall';
    return trinket ? 'ui.grid.discard.trinket' : 'ui.grid.drop.inorganic';
  }
  const sfx = (ev, def, state) => play(sfxFor(ev, def, state));

  // ---------------------------------------------------------------- quyền (SpatialItemData.GetCanBeMoved, GridCell.ShouldShowItemTypes)
  const canMoveInstalled = () => !!S && S.mode === 'equip';
  function lockedFor(def) { return def.moveMode === 'NONE' || (def.moveMode === 'INSTALL' && !canMoveInstalled()); }
  const showSlotIcons = () => canMoveInstalled();
  const gridOf = key => S.grids.find(g => g.key === key) || null;
  const visibleGrids = () => S.grids.filter(g => g.el);

  function ensureDom() {
    if (host) return;
    host = el('div', 'cg-root dr-ui', document.body); host.id = 'dr-cargo';
    held = el('div', 'cg-held dr-ui', document.body);
    cursor = el('div', 'cg-cursor', document.body);
    tip = el('div', 'cg-tip dr-ui', document.body);
    ring = el('div', 'cg-ring', document.body);
    ctl = el('div', 'cg-ctl dr-ui', document.body);
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('contextmenu', e => e.preventDefault());
    host.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    tip.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('resize', () => { if (S) render(); });
    bubble = new Image(); bubble.src = ART('InfectionBubble');
  }

  // ---------------------------------------------------------------- bố cục (đơn vị canvas 1920x1080 nhân hệ số k)
  // Bảng trái theo loại: StorageSlidePanel 650x800 (y -40); QuestGridSlidePanel 650 x (300 + hàng x 60) (QuestGridPanel.cs:242-248,
  // baseHeight = 550 - 450/60... đo trong Game.unity: QuestGrid 450x450 trong bảng 550 -> baseHeight 100; UpgradeGrid 420x360 trong 600 -> 240);
  // StorageTray 460x245 treo dưới bảng câu (HarvestMinigameView Container 720x320 neo giữa trái).
  function leftSpec() {
    const L = S.left;
    if (!L) return null;
    if (L.spec) return L.spec;            // r2shop: bảng trái tự đưa số đo (js/shop.js tính từ ShipyardSlidePanel / MarketSlidePanel)
    const gr = curLeftGrid();
    const rows = gr ? gr.g.rows : 3, cols = gr ? gr.g.cols : 6;
    if (L.kind === 'tray') return { w: 460, h: 245, x: 130, y: 540 + 160, gridW: 360, gridH: 180, gridX: 50, gridY: 107.5 - 90, title: false };
    if (L.kind === 'quest') {
      const up = !!(L.footer && L.footer.buttons && L.footer.buttons.length);
      const base = L.quest && L.quest.gridHeightOverride ? L.quest.gridHeightOverride : (up ? 240 : 100);
      const h = base + rows * 60;
      // vùng lưới rộng như UpgradeGrid/QuestGrid gốc, cao đúng số hàng để phụ đề (y -90) và nút Mua (đáy +90) không đè lên
      const gw = Math.max(cols * 60, up ? 420 : 450), gh = rows * 60;
      const off = L.subtitle ? 20 : 0;
      return { w: 650, h, x: 0, y: null, gridW: gw, gridH: gh, gridX: (650 - gw) / 2, gridY: (h - gh) / 2 + off - (up ? 20 : 0), title: true };
    }
    // storage / shop: 650x800, lưới inset -22 x -82/-44 (StorageGrid / ShopGrid)
    return { w: 650, h: 800, x: 0, y: null, dy: L.kind === 'storage' ? 40 : 0, gridW: 650 - 100, gridH: 800 - 130, gridX: 50, gridY: L.kind === 'shop' ? 100 : 70, title: true };
  }
  function metrics() {
    const W = root.innerWidth, H = root.innerHeight;
    const k = Math.max(H / 1080, MIN_K);
    const inv = curRightGrid();
    const side = curLeftGrid();
    const top = H < 500 ? 6 : 65 * k;                 // PlayerSlidePanel: y = -65
    const panelH = Math.min(935 * k, H - top - 6);
    const panelW = Math.min(650 * k, W * (side ? 0.4 : 0.62));
    const zoneW = panelW - 100 * k;                     // InventoryGrid: size.x = -100
    const ls = leftSpec();
    const fit = stats => {
      let cs = 60 * k;
      if (inv) {
        const isInv = inv.key === 'INVENTORY';
        const zoneH = panelH - 30 * k - (isInv ? (100 + (stats ? 145 : 0)) * k : 50 * k);
        cs = Math.min(cs, zoneH / (inv.g.rows + (isInv ? 1 : 0)), zoneW / inv.g.cols);
      }
      if (side && ls) {
        const lw = Math.min(ls.w * k, W * 0.4), sc = lw / (ls.w * k);
        cs = Math.min(cs, ls.gridW * k * sc / side.g.cols, Math.min(ls.gridH * k * sc, H - 12) / side.g.rows);
      }
      return cs;
    };
    let showStats = !!inv && inv.key === 'INVENTORY' && H >= 520;
    let cs = fit(showStats);
    const want = Math.max(Math.min(60 * k, 34), H < 520 ? 32 : 0);
    if (showStats && cs < want) { showStats = false; cs = fit(false); }
    // điện thoại: ép ô tối thiểu để chạm được; lưới không vừa thì cuộn
    cs = Math.max(26, Math.floor(cs));
    return { W, H, k, cs, top, panelH, panelW, zoneW, showStats, hasInv: !!inv || S.right.cur === 'CABIN', ls };
  }
  const curRightGrid = () => gridOf(S.right.cur);
  const curLeftGrid = () => S.left && S.left.cur ? gridOf(S.left.cur) : null;

  // ---------------------------------------------------------------- dựng DOM
  function render() {
    if (!S) return;
    const M = S.M = metrics();
    host.style.setProperty('--k', M.k.toFixed(4));
    host.style.setProperty('--kt', Math.max(M.k, 0.62).toFixed(4));
    host.style.setProperty('--cs', M.cs + 'px');
    held.style.setProperty('--kt', Math.max(M.k, 0.62).toFixed(4));
    tip.style.setProperty('--kt', Math.max(M.k, 0.62).toFixed(4));
    ctl.style.setProperty('--k', M.k.toFixed(4));
    host.innerHTML = '';
    host.classList.toggle('docked', !!S.docked);
    host.classList.toggle('repair', S.mode === 'repair');
    S.statEls = null;
    for (const gr of S.grids) { gr.el = null; gr.zone = null; gr.cells = null; gr.lit = null; }
    S.motes = [];
    if (S.left) buildLeftPanel(M);
    const inv = curRightGrid();
    if (inv || S.right.cur === 'CABIN') buildPlayerPanel(M, inv);
    refreshHeld();
    updateCursor();
    updatePreview();
    // chuột đứng yên sau khi dựng lại: tooltip phải theo ô đang nằm dưới con trỏ (cảm ứng không có rê nên bỏ qua)
    S.hover = !S.held && lastType === 'mouse' ? hoverAt(S.ptr.x, S.ptr.y) : null;
    refreshPrompts();
    refreshTip();
    if (S.motes.length) startLoop();
  }

  function panelBox(cls, M, w, h, top) {
    const p = el('div', 'cg-panel ' + cls + (S.shown && !(S.entering && S.entering[cls.split(' ')[0]]) ? ' on' : ''), host);   // entering: setLeft trượt vào
    p.style.cssText = 'top:' + top + 'px;width:' + w + 'px;height:' + h + 'px';
    el('div', 'cg-bg', p);
    return p;
  }

  function buildPlayerPanel(M, inv) {
    const p = panelBox('cg-right', M, M.panelW, M.panelH, M.top);
    // tay nắm trượt (SlidePanelTab) cũng là nút đóng cho cảm ứng
    const hd = el('button', 'cg-handle', p); hd.title = 'Đóng (Tab)';
    el('i', '', hd);
    hd.onclick = () => close();
    if (S.docked) hd.style.display = 'none';
    const tabs = el('div', 'cg-tabs', p);
    // PlayerTabbedPanel: chỉ vẽ tab được mở (C11); CABIN (tab 2) chỉ có khi mở khoang ở biển (S.cabin, w2cabin)
    const NAMES = { INVENTORY: 'Khoang', STORAGE: 'Kho', CABIN: 'Phòng' };   // "Cargo" / "Storage" / "Cabin" (tab.cargo, tab.storage, tab.cabin)
    NAMES.TRAWL_NET = 'Lưới kéo';                                 // r2deploy: tab lưới kéo (SaveData.TrawlNet)
    const tabKeys = rightTabKeys();
    for (const key of tabKeys) {
      const sel = key === S.right.cur;
      const t = el('button', 'cg-tab ' + (sel ? 'sel' : 'un'), tabs, NAMES[key] || key);
      t.dataset.tab = key;
      if (!sel) t.onclick = () => switchTab(key);                 // PlayerTabbedPanel.ShowNewPanel
    }
    if (qeTabs()) for (const [side, k] of [['l', 'Q'], ['r', 'E']]) el('b', 'cg-qe ' + side, p, k);   // phím Q / E chuyển tab (video t=2190: ô phím trắng hai đầu thanh tab)
    if (!inv) { buildCabin(p, M); return; }
    const isInv = inv.key === 'INVENTORY';
    if (M.showStats) buildStats(p);
    if (isInv) {
      const hp = el('div', 'cg-health', p);
      el('span', 'lab', hp, 'Hư hại:');
      const notches = el('span', 'notches', hp);
      const lim = DRRules.damageThreshold(cfg(), DR.s.hullTier), bad = inv.g.damage.length;
      for (let i = 0; i < lim; i++) el('i', i < bad ? 'full' : '', notches);
      hp.style.top = (50 + (M.showStats ? 145 : 0) - 2) * M.k + 'px';
    }
    const zoneTop = (isInv ? 100 + (M.showStats ? 145 : 0) : 50) * M.k;
    const zh = M.panelH - zoneTop - 30 * M.k;
    buildZone(p, inv, M, { x: 50 * M.k, y: zoneTop, w: M.zoneW, h: zh, inv: isInv });
    if (S.mode === 'repair') { const b = el('div', 'cg-mode', p, 'CHẾ ĐỘ SỬA CHỮA'); b.style.top = zoneTop - 26 * M.k + 'px'; }
  }

  // ---------------------------------------------------------------- tab CABIN (CabinPanel + CabinItemContainer, w2cabin)
  // Thanh tab: các lưới bên phải + CABIN (nếu mở ở biển). Q / E đổi tab khi có từ 2 tab và bảng trái không tự dùng Q / E cho tab của nó (cửa hàng).
  const rightTabKeys = () => S.right.tabs.concat(S.cabin ? ['CABIN'] : []);
  const qeTabs = () => rightTabKeys().length > 1 && !(S.left && S.left.tabs);
  function switchTab(key, dir) {
    if (!S) return false;
    const ks = rightTabKeys();
    if (key == null) key = ks[(ks.indexOf(S.right.cur) + dir + ks.length) % ks.length];
    if (key === S.right.cur) return false;
    if (S.held) { play('ui.grid.error'); toast('Hãy đặt món đang cầm xuống trước khi đổi tab'); return false; }
    S.right.cur = key; S.hover = null; hideTip();
    render();
    return true;
  }
  // CabinPanel.OnJournalButtonClicked / OnMapButtonClicked / OnMessagesButtonClicked / OnEncyclopediaButtonClicked: mở cửa sổ, đóng xong thì về lại tab CABIN
  // (InventoryPanelTab.Unsubscribe / Subscribe). Bản web đóng bảng khoang rồi mở lại: các cửa sổ kia chỉ mở được khi DR.mode là 'sail'.
  const CABIN_BTN = {
    JournalButton: { vi: 'Sổ nhiệm vụ', key: 'J', open: () => { if (!root.DRHud) return false; DRHud.journal(true); return DRHud.journalOpen(); }, isOpen: () => root.DRHud && DRHud.journalOpen() },
    MapButton: { vi: 'Bản đồ', key: 'M', open: () => root.DRBook && DRBook.openMap(), isOpen: () => root.DRBook && DRBook.isOpen() },
    MessagesButton: { vi: 'Thư tín', key: 'I', open: () => root.DRMessages && DRMessages.open(), isOpen: () => root.DRMessages && DRMessages.isOpen() },   // w3msg: js/messages.js
    EncyclopediaButton: { vi: 'Bách khoa', key: 'L', open: () => root.DRBook && DRBook.openEncyclopedia(), isOpen: () => root.DRBook && DRBook.isOpen() }
  };
  function cabinGo(b) {
    if (!S || !b.open) return;
    const reopen = S.cabin && !S.docked;
    close(true);
    if (!b.open()) return;
    if (!reopen) return;
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const dr = root.DR;
      if (S || !dr || n > 36000) { clearInterval(iv); return; }
      if (b.isOpen()) return;
      clearInterval(iv);
      if (dr.mode === 'sail' && !(root.DRBook && DRBook.busy())) open({ keys: ['INVENTORY'], title: 'Khoang thuyền', tab: 'CABIN' });
    }, 100);
  }
  // CabinItemContainer.PopulateGrid: sách (ResearchableItemInstance) đang đọc lên đầu, rồi món mới, rồi tiến độ giảm dần, sách xong cuối cùng
  function bookshelf() {
    const s = DR.s; if (!s || !Array.isArray(s.ownedNonSpatial)) return [];
    const out = [];
    for (const e of s.ownedNonSpatial) { const d = root.DR_ITEMS[e.id]; if (d && d.cls === 'ResearchableItemData' && d.showInCabin) out.push({ e, d }); }
    const prog = x => (x.e.progress || 0) >= 1 ? -1 : (x.e.progress || 0);
    return out.map((x, i) => [x, i]).sort((a, b) => (!!b[0].e.isActive - !!a[0].e.isActive) || (!!b[0].e.isNew - !!a[0].e.isNew) || (prog(b[0]) - prog(a[0])) || a[1] - b[1]).map(a => a[0]);
  }
  // ResearchableGridEntryUI.RefreshUI: màu = POSITIVE (xong) / WARNING (đang đọc) / NEUTRAL (trên kệ); chuỗi trạng thái + mô tả theo từng trạng thái
  function bookStatus(x) {
    const pct = Math.floor((x.e.progress || 0) * 100);
    if ((x.e.progress || 0) >= 1) return { color: COLOR.POSITIVE, st: '(Đã đọc xong)', ds: x.d.completedDescriptionKey || '' };      // researchable.status-complete
    if (x.e.isActive) return { color: COLOR.WARNING, st: '(Đang đọc - ' + pct + '% xong)', ds: 'Sách đang đọc, hãy trôi thời gian để đọc' };  // status-in-progress / description-hidden-active
    return { color: COLOR.NEUTRAL, st: '(Trên kệ - ' + pct + '% xong)', ds: 'Đọc để mở khoá' };                                                  // status-inactive / description-hidden-inactive
  }
  function buildBookshelf(shelf) {
    const box = el('div', 'cg-books', shelf);
    const paint = () => {
      box.innerHTML = '';
      const list = bookshelf();
      S.cabinBooks = list.map(x => x.e.id);
      for (const x of list) {
        const st = bookStatus(x), row = el('div', 'cg-book' + (x.e.isActive && !((x.e.progress || 0) >= 1) ? ' act' : ''), box);
        row.dataset.id = x.e.id; row.style.setProperty('--bc', st.color);
        const hd = el('div', 'hd', row);
        el('i', 'ic', hd); el('span', 'nm', hd, x.d.name || x.e.id);
        el('div', 'sts', row, st.st);
        const ds = el('div', 'ds', row); el('i', 'dm', ds); el('span', '', ds, st.ds);
        x.e.isNew = false;                                                                                     // MarkNonSpatialItemAsSeen
        row.onclick = () => {                                                                                  // OnEntrySubmitted: chỉ sách chưa đọc xong mới thành sách đang đọc (SetActiveResearchableItem)
          if ((x.e.progress || 0) >= 1) return;
          for (const o of DR.s.ownedNonSpatial) o.isActive = o === x.e;
          play('ui.button.select'); paint();
        };
      }
      if (!box.children.length) el('div', 'none', box, 'Chưa có cuốn sách nào');
    };
    paint();
  }
  const BTN_TINT = [0.04, 0.03, 0.03, 1];                                                    // [ĐỀ XUẤT] màu nền nút đo từ video t=2190 (gần đen); prefab nút không nằm trong dữ liệu bóc
  function buildCabin(p, M) {
    const K = root.DRBookKit, B = root.DR_BOOK;
    const box = el('div', 'cg-cabin', p);
    box.style.cssText = 'left:' + 4 * M.k + 'px;right:0;top:' + 54 * M.k + 'px;bottom:' + 30 * M.k + 'px';   // cùng chỗ với StatsBackplate của tab khoang
    if (!K || !B || !B.cabin) { el('div', 'none', box, 'Phòng thuyền chưa nạp được dữ liệu'); return; }
    const tree = Object.assign({}, B.cabin.tree.k[0], { on: 1 });                          // Container tắt sẵn trong scene; TabbedPanel bật khi chọn tab
    const ctx = K.mount(tree, box, {
      skip: (n, path) => /ControlPromptIcon[^/]*\//.test(path) || n.n === 'UnseenItemIcon' || n.n === 'NonSpatialItemGrid',
      tint: n => /Button$/.test(n.n),                                                       // Selectable.colors.normalColor của nút nhân lên Button_White
      on: (n, b, path) => {
        const m = /^ButtonContainer\/(\w+)$/.exec(path);
        if (m && CABIN_BTN[m[1]]) {
          K.setTint(b, BTN_TINT);
          const cb = CABIN_BTN[m[1]]; b.classList.add('cg-cbtn'); b.dataset.btn = m[1];
          if (cb.open) b.onclick = () => cabinGo(cb); else { b.classList.add('off'); b.title = cb.why; }
        }
        if (/^ControlPromptIcon/.test(n.n)) { const cb = CABIN_BTN[path.split('/')[1]]; if (cb) el('b', 'cg-cbk', b, cb.key); }
      }
    });
    for (const [nm, cb] of Object.entries(CABIN_BTN)) K.setText(ctx.byPath['ButtonContainer/' + nm + '/Text (TMP)'], cb.vi);
    K.setText(ctx.byPath['BookshelfHeader/Label'], 'Giá sách');                              // cabin.bookshelf.title "Bookshelf"
    const sc = ctx.byPath['ItemScroller'];
    if (sc) { sc.classList.add('cg-shelf'); buildBookshelf(sc); }
    const fit = () => K.fit(ctx, box, 1920 * M.k, 1080 * M.k);
    fit();
    if (document.fonts && document.fonts.load) document.fonts.load('50px "Front Page Neue"').then(() => { if (S && box.isConnected) fit(); }).catch(() => {});
  }

  function buildStats(p) {
    const box = el('div', 'cg-stats', p), st = liveStats();
    const left = el('div', 'cg-st-l', box);
    S.statEls = {};
    for (const [k, label] of [['speed', 'Tốc độ thuyền:'], ['fishing', 'Tốc độ câu:'], ['light', 'Đèn:'], ['ab', 'Thưởng dị biến:']]) {
      const d = el('div', '', left, label + ' ');
      S.statEls[k] = { row: d, v: el('b', '', d), pj: el('span', 'pj', d) };
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
  // PlayerStatsUI.RefreshUI: số hiện có + (thay đổi dự kiến) màu xanh/đỏ; tốc độ câu = FishingSpeedModifier x 100 (GR-08: fishingDisplay khi có);
  // đèn có dấu phân nhóm nghìn ("1,800 lm", ToString("n0")); dòng dị biến ẩn khi bằng 0 và không có dự kiến (PlayerStatsUI.cs:232)
  function refreshStats() {
    if (!S || !S.statEls) return;
    const st = liveStats(), c = cfg(), E = S.statEls;
    const fishing = st.fishingDisplay != null ? st.fishingDisplay : st.fishing;
    E.speed.v.textContent = fmt(st.speed / (c.baseMovementSpeedModifier || 1), 1) + ' kn';
    E.fishing.v.textContent = Math.round(fishing * 100) + '%';
    E.light.v.textContent = Math.round(st.lumens).toLocaleString('en-US') + ' lm';
    E.ab.v.textContent = fmt(st.aberrationBonus * 100, 5) + '%';
    const pj = projected();
    const put = (e, n, unit, d) => {
      e.textContent = n ? ' (' + (n > 0 ? '+' : '') + fmt(n, d) + unit + ')' : '';
      e.style.color = n > 0 ? COLOR.POSITIVE : COLOR.NEGATIVE;
    };
    put(E.speed.pj, pj.speed, ' kn', 1); put(E.fishing.pj, pj.fishing * 100, '%', 0);
    put(E.light.pj, pj.light, ' lm', 0); put(E.ab.pj, pj.ab * 100, '%', 5);
    E.ab.row.style.display = st.aberrationBonus !== 0 || pj.ab !== 0 ? '' : 'none';
  }
  // PlayerStatsUI.OnCanInstallHoveredItemChanged: chỉ khi chế độ lắp (EquipmentModeActionHandler.cs:204 mới phát sự kiện), món INSTALL
  // rê lên ô khoang lắp được. Thưởng dị biến của món bị thay vẫn CỘNG (PlayerStatsUI.cs:122, quirk gốc).
  function projected() {
    const z = { speed: 0, fishing: 0, light: 0, ab: 0 };
    const c = S && S.cand, h = S && S.held;
    if (!c || !h || !canMoveInstalled() || !isInstall(h.def) || c.gr.key !== 'INVENTORY' || !installable(c)) return z;
    const clean = !c.fp.some(([x, y]) => G.isDamaged(c.gr.g, x, y));
    const sub = G.subOf(h.def);
    if (clean) {
      if (sub === G.SUB.ENGINE) z.speed += h.def.speedBonus || 0;
      else if (sub === G.SUB.ROD) z.fishing += h.def.fishingSpeedModifier || 0;
      else if (sub === G.SUB.LIGHT) z.light += h.def.lumens || 0;
    }
    if (h.def.aberrationBonus != null) z.ab += h.def.aberrationBonus;
    const o = c.objs[0];
    if (o) {
      const d = defOf(o), s2 = G.subOf(d), on = !G.onDamaged(c.gr.g, o);
      if (s2 === G.SUB.ENGINE && on) z.speed -= d.speedBonus || 0;
      else if (s2 === G.SUB.ROD && on) z.fishing -= d.fishingSpeedModifier || 0;
      else if (s2 === G.SUB.LIGHT && on) z.light -= d.lumens || 0;
      if (d.aberrationBonus != null) z.ab += d.aberrationBonus;
    }
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

  // ---------------------------------------------------------------- bảng trái
  function buildLeftPanel(M) {
    const L = S.left, ls = M.ls, gr = curLeftGrid();
    if (!ls) return;
    let lw = Math.min(ls.w * M.k, M.W * 0.4), sc = lw / (ls.w * M.k);     // điện thoại: bảng co theo bề ngang, mọi số đo nhân sc
    // r2fish: khay là con của Container bảng câu (js/minigame.js tỉ lệ riêng): treo đúng đáy bảng, căn giữa, máy thấp thì co cho vừa
    const mg = L.kind === 'tray' && root.DRMinigame && DRMinigame.isShown() ? DRMinigame.nodeRect('') : null;
    if (mg && mg.height > 0) { const f = (M.H - mg.bottom - 2) / (ls.h * M.k); if (f < sc) { sc = Math.max(f, 0.1); lw = ls.w * M.k * sc; } }
    const u = v => v * M.k * sc;
    const h = Math.min(u(ls.h), M.H - 12);
    let top = ls.y != null ? u(ls.y) : (M.H - h) / 2 + u(ls.dy || 0);
    if (L.kind === 'tray') top = mg && mg.height > 0 ? mg.bottom : Math.min(top, M.H - h - 40 * M.k);
    const p = panelBox('cg-left cg-' + L.kind, M, lw, h, Math.max(0, top));
    p.style.setProperty('--sc', sc.toFixed(4));
    p.style.left = (mg && mg.height > 0 ? mg.left + (mg.width - lw) / 2 : u(ls.x)) + 'px';
    if (L.kind === 'tray') {
      // StorageTray: không có khung SidePanel, chỉ Backplate tối; lưới + dòng nhắc "Đồ để lại đây sẽ mất." khi còn đồ
      p.querySelector('.cg-bg').className = 'cg-traybg';
      const help = el('div', 'cg-help cg-trayhelp' + (gr && gr.g.items.length ? ' on' : ''), p);
      el('span', 'tx', help, 'Đồ để lại đây sẽ mất.');
    } else if (L.kind === 'quest') {
      const nb = el('div', 'cg-name', p, L.title || 'Nộp đồ');
      void nb;
      if (L.subtitle) el('div', 'cg-sub', p, L.subtitle);
    } else {
      el('div', 'cg-title', p, L.title || (L.kind === 'storage' ? 'Kho của tôi' : 'Cửa hàng'));
    }
    if (L.tabs && L.tabs.length > 1) {
      const tabs = el('div', 'cg-ltabs', p);
      for (const t of L.tabs) {
        const b = el('button', 'cg-tab ' + (t.key === L.cur ? 'sel' : t.locked ? 'off' : 'un'), tabs);
        b.dataset.tab = t.key; b.title = t.title || t.key;
        if (t.icon) { const i = new Image(); i.src = t.icon; i.className = 'ic'; b.appendChild(i); } else b.textContent = t.title || t.key;
        if (t.locked) b.disabled = true;
        else if (t.key !== L.cur) b.onclick = () => { if (!S) return; S.left.cur = t.key; render(); };
      }
    }
    if (gr) buildZone(p, gr, M, { x: u(ls.gridX), y: u(ls.gridY), w: u(ls.gridW), h: u(ls.gridH), bg: L.kind !== 'tray' && L.kind !== 'storage', cell: L.kind === 'tray' ? 'tray' : '' });
    // hàng giúp đỡ + nút Xong của QuestGridPanel (HelpContainer treo dưới bảng, trượt xuống 0,75 s OutExpo sau 1 s) và nút Mua của UpgradeGridPanel
    if (L.kind === 'quest' || (L.footer && (L.footer.help || (L.footer.buttons && L.footer.buttons.length)))) {
      const F = L.footer || {};
      if (F.buttons && F.buttons.length) {
        const fb = el('div', 'cg-foot', p);
        for (const b of F.buttons) {
          const btn = el('button', 'cg-btn', fb);
          fillLabel(btn, b);
          btn.dataset.act = b.id || b.label;
          const ok = typeof b.enabled === 'function' ? !!b.enabled(ctx()) : b.enabled !== false;
          btn.disabled = !ok;
          if (b.hold) wireHoldButton(btn, b); else btn.onclick = e => { e.stopPropagation(); if (!btn.disabled) runPrompt(b); };
        }
      }
      const help = el('div', 'cg-help' + (S.shown ? ' on' : ''), p);
      const exitMode = L.quest ? L.quest.questGridExitMode : 'REVISITABLE';
      const txt = F.help != null ? F.help : (L.quest && L.quest.helpStringOverride) || HELP_VN[exitMode] || HELP_VN.REVISITABLE;
      const tx = el('span', 'tx', help, txt);
      if (exitMode === 'RISK_ITEM_LOSS' || exitMode === 'ITEM_DELIVER') tx.style.color = COLOR.NEGATIVE;
      if (exitMode !== 'CANNOT_EXIT_MANUALLY') {
        const done = el('button', 'cg-btn cg-done', help, (L.quest && L.quest.exitPromptOverride) || 'Xong');
        done.dataset.act = 'done';
        done.onclick = e => { e.stopPropagation(); exitLeft(); };
      }
      if (!S.shown) setTimeout(() => { if (S) host.querySelectorAll('.cg-help').forEach(x => x.classList.add('on')); }, 1000);
    }
  }
  const HELP_VN = { REVISITABLE: 'Bạn có thể quay lại lấy những món này sau.', CANNOT_EXIT_MANUALLY: 'Bạn phải lấy những món này.', RISK_ITEM_LOSS: 'Đồ để lại đây sẽ mất.', ITEM_DELIVER: 'Đồ để lại đây sẽ mất.' };
  const labelOf = b => typeof b.label === 'function' ? b.label(ctx()) : b.label;

  // QuestGridPanel.OnManualExitPressComplete: không thoát khi đang cầm đồ hay thời gian đang bị ép trôi
  function exitLeft() {
    if (!S || S.held || (root.DRSky && DRSky.forced)) { play('ui.grid.error'); return; }
    const L = S.left;
    const done = !!(L && L.complete);
    if (L && L.onExit) L.onExit(done ? 1 : 0);
    close(true, { complete: done });
  }

  // ---------------------------------------------------------------- vùng lưới
  // box = { x, y, w, h } trong bảng (px); inv: lưới khoang (nền PlayerInventoryBackground, dịch nửa ô); bg: nền FishmongerInventoryBackground
  function buildZone(p, gr, M, box) {
    const g = gr.g, cs = M.cs, isInv = !!box.inv;
    const zone = el('div', 'cg-zone' + (isInv ? ' inv' : ''), p);
    zone.style.cssText = 'left:' + box.x + 'px;top:' + box.y + 'px;width:' + box.w + 'px;height:' + box.h + 'px';
    if (isInv) el('div', 'cg-zonebg', zone);
    else if (box.bg) el('div', 'cg-zonebg2', zone);
    const gbox = el('div', 'cg-grid', zone);
    gbox.dataset.key = gr.key;
    gbox.style.width = g.cols * cs + 'px'; gbox.style.height = g.rows * cs + 'px';
    gr.el = gbox; gr.zone = zone;
    gr.cells = new Array(g.cols * g.rows);
    const icons = showSlotIcons() && gr.key === 'INVENTORY';
    const heldInst = S.held && S.held.inst;
    // GridCell.OnItemPickedUp / OnItemHoveredChanged (GridCell.cs:110-164): chỉ ô ENGINE/ROD/LIGHT có bộ nghe; cầm hoặc RÊ (không cầm,
    // món không nằm trong khoang) đèn/cần/động cơ/lưới thì ô nhận nó sáng trắng. Ô chỉ nhận NET không bao giờ sáng.
    const hiSub = icons ? hiSubNow() : 0;
    if (icons) S.hiSub = hiSub;
    const LISTEN = G.SUB.ENGINE | G.SUB.ROD | G.SUB.LIGHT;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      if (!G.usable(g, x, y)) continue;
      const cell = g.cells[y * g.cols + x], c = el('div', 'cg-c' + (box.cell ? ' ' + box.cell : ''), gbox);
      c.style.cssText = 'left:' + x * cs + 'px;top:' + y * cs + 'px;width:' + cs + 'px;height:' + cs + 'px';
      el('i', 'b', c); const o = el('i', 'o', c); el('i', 'f', c);
      const occ = G.itemAt(g, x, y), real = occ && occ !== heldInst ? occ : null;
      if (real) {
        const def = defOf(real);
        o.style.background = occupationColor(def, real);
        c.classList.add('occ');
      }
      // GridCell.RefreshAcceptedItemTypeImage: ô thiết bị rỗng hiện biểu tượng loại nó nhận, màu mờ
      if (cell.type !== G.TYPE.ALL && icons) {
        const ic = SLOT_ICON.find(s => cell.sub & s[0]);
        const i = el('i', 'ic', c);
        i.style.setProperty('--m', 'url(' + ART(ic ? ic[1] : 'CargoGrid_Default') + ')');
        if (hiSub && (cell.sub & LISTEN) && (cell.sub & hiSub)) i.classList.add('hi');
        else if (real) i.style.display = 'none';
      }
      gr.cells[y * g.cols + x] = c;
    }
    // ô hỏng nằm dưới đồ (underlay)
    for (const [x, y] of g.damage) {
      const d = el('i', 'cg-dmg', gbox);
      d.style.cssText = 'left:' + x * cs + 'px;top:' + y * cs + 'px;width:' + cs + 'px;height:' + cs + 'px';
    }
    // bóng mờ gợi ý của lưới nộp đồ (GridUI.ShowGridHints, presetGridMode SILHOUETTE/MYSTERY): chỉ vẽ ở ô còn trống
    for (const hint of gr.hints || []) {
      const def = root.DR_ITEMS[hint.id];
      if (!def) continue;
      const fp = G.footprint(def, hint.x, hint.y, hint.z || 0);
      if (fp.some(([x, y]) => G.itemAt(g, x, y))) continue;
      const bb = cellsBox(fp), it = el('div', 'cg-item cg-hint', gbox);
      it.style.cssText = 'left:' + bb.x * cs + 'px;top:' + bb.y * cs + 'px;width:' + bb.w * cs + 'px;height:' + bb.h * cs + 'px';
      it.appendChild(itemImg(def, hint.z || 0, cs));
    }
    for (const inst of g.items) {
      if (S.held && S.held.inst === inst) continue;
      const def = defOf(inst), bb = cellsBox(inst.cells);
      const it = el('div', 'cg-item', gbox);
      it.style.cssText = 'left:' + bb.x * cs + 'px;top:' + bb.y * cs + 'px;width:' + bb.w * cs + 'px;height:' + bb.h * cs + 'px';
      if (G.onDamaged(g, inst) && def.damageMode === 'OPERATION') it.classList.add('grey');
      // GridObject.cs:193-209: chế độ sửa làm mờ (alpha 0,196) mọi món không có độ bền
      if (S.mode === 'repair' && def.damageMode !== 'DURABILITY' && !def.isUnderlayItem) it.style.opacity = FADED;
      it.appendChild(itemImg(def, inst.rot, cs));
      if (inst.infected) addInfection(it, def, inst, cs);
    }
    gbox.style.left = (box.w - g.cols * cs) / 2 + 'px';
    // người chơi chỉ nhìn ô nằm trong hull: để lưới tự cân giữa vùng (InventoryGrid: nửa ô thấp hơn tâm)
    if (isInv) gbox.style.top = (box.h / 2 - (g.rows - 1) * cs / 2) + 'px';
    else gbox.style.top = Math.max(0, (box.h - g.rows * cs) / 2) + 'px';
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

  // ---------------------------------------------------------------- hạt nhiễm bệnh (GridObject.AddInfectionVFX, InfectedObjectCell.prefab)
  // Mỗi ô của con cá (trừ cellsExcludedFromDisplayingInfection, toạ độ trong dims) có một hệ hạt riêng: tối đa 3 hạt, sống 8-12 s,
  // cỡ 15-30 đơn vị canvas, nở ra theo đường cong cỡ, phát 1-3 hạt mỗi chu kỳ 1 s, sinh trong vòng tròn r 0,4x40, nhiễu kéo dọc.
  // Số liệu ở art/ui/cargo/cargo_fx.js (tools/cargo_ui.py đọc prefab). Vẽ bằng canvas 2D phủ lên món; rAF chung với món đang cầm.
  function addInfection(it, def, inst, cs) {
    const FX = root.DR_CARGO_FX && DR_CARGO_FX.infection;
    if (!FX) return;
    const ex = def.cellsExcludedFromDisplayingInfection || [];
    const cv = el('canvas', 'cg-inf', it);
    const w = parseFloat(it.style.width), h = parseFloat(it.style.height);
    cv.width = Math.ceil(w); cv.height = Math.ceil(h);
    const bb = cellsBox(inst.cells), u = cs / 60;
    const cells = [];
    for (const d of def.dims) {
      const ox = d[0] !== undefined ? d[0] : d.x, oy = d[1] !== undefined ? d[1] : d.y;
      if (ex.some(e => (e[0] !== undefined ? e[0] : e.x) === ox && (e[1] !== undefined ? e[1] : e.y) === oy)) continue;
      // ô (ox,oy) của dims xoay theo inst.rot rồi trừ gốc hộp bao -> tâm ô trong canvas
      const [cx, cy] = G.footprint({ dims: [[ox, oy]] }, inst.x, inst.y, inst.rot || 0)[0];
      cells.push({ x: (cx - bb.x + 0.5) * cs, y: (cy - bb.y + 0.5) * cs, ps: [], cycle: Math.random() });
    }
    const m = { cv, ctx: cv.getContext('2d'), cells, u, FX, t: performance.now() / 1000 };
    // prewarm: coi như đã chạy một lúc
    for (const c of cells) for (let i = 0; i < FX.maxParticles; i++) spawnMote(m, c, Math.random() * 8);
    S.motes.push(m);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function spawnMote(m, c, age) {
    const FX = m.FX, r = FX.shape.radius * FX.shape.scale * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const col = FX.color, t = Math.random();
    c.ps.push({
      x: c.x + Math.cos(a) * r * m.u, y: c.y + Math.sin(a) * r * m.u, life: rnd(FX.lifetime[0], FX.lifetime[1]), age: age || 0,
      size: rnd(FX.size[0], FX.size[1]), rot: rnd(FX.rotation[0], FX.rotation[1]), ph: Math.random() * 100,
      rgb: [0, 1, 2].map(i => Math.round(255 * (col[0][i] + (col[1][i] - col[0][i]) * t)))
    });
  }
  function sizeCurve(FX, t) {
    const k = FX.sizeCurve;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    return k[k.length - 1][1];
  }
  function tickMotes(now) {
    if (!S || !S.motes.length) return false;
    const t = now / 1000;
    for (const m of S.motes) {
      const dt = Math.min(0.1, t - m.t); m.t = t;
      const FX = m.FX, ctx2 = m.ctx;
      ctx2.clearRect(0, 0, m.cv.width, m.cv.height);
      for (const c of m.cells) {
        c.cycle += dt;
        if (c.cycle >= FX.lengthSec) {                                  // burst đầu mỗi chu kỳ: 1-3 hạt, không quá maxParticles
          c.cycle -= FX.lengthSec;
          const n = Math.round(rnd(FX.burst[0], FX.burst[1]));
          for (let i = 0; i < n && c.ps.length < FX.maxParticles; i++) spawnMote(m, c, 0);
        }
        for (let i = c.ps.length - 1; i >= 0; i--) {
          const p = c.ps[i];
          p.age += dt;
          if (p.age >= p.life) { c.ps.splice(i, 1); continue; }
          // NoiseModule: strength 0,1 ngang, 5 dọc, tần số 3 -> xấp xỉ bằng sin lệch pha [ĐỀ XUẤT]
          const f = FX.noise.frequency * 0.35, n1 = Math.sin(t * f + p.ph) * 0.6 + Math.sin(t * f * 2.3 + p.ph * 1.7) * 0.4;
          p.x += FX.noise.strength * n1 * m.u * dt * 10;
          p.y -= FX.noise.strengthY * (0.5 + 0.5 * n1) * m.u * dt;
          const s = p.size * sizeCurve(FX, p.age / p.life) * (1 + FX.noise.sizeAmount * 0.25 * n1) * m.u;
          if (s < 0.5) continue;
          ctx2.save();
          ctx2.translate(p.x, p.y); ctx2.rotate(p.rot);
          ctx2.globalAlpha = 0.9;
          if (bubble && bubble.complete && bubble.naturalWidth) ctx2.drawImage(bubble, -s / 2, -s * 127 / 118 / 2, s, s * 127 / 118);
          else { ctx2.fillStyle = 'rgb(' + p.rgb.join(',') + ')'; ctx2.beginPath(); ctx2.arc(0, 0, s / 2, 0, Math.PI * 2); ctx2.fill(); }
          ctx2.restore();
        }
      }
    }
    return true;
  }

  function flash(sel) {
    const p = host.querySelector(sel);
    if (!p) return;
    p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');
  }

  // ---------------------------------------------------------------- hình học: ô dưới con trỏ, vị trí đặt
  function gridAt(x, y, pad) {
    for (const gr of visibleGrids()) {
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
    const ev = evaluate(hit.gr, def, rx, ry, h.rot, h.inst);
    return Object.assign({ gr: hit.gr, rx, ry, def }, ev);
  }

  // GridObject.GetPlacementResult + GridManager.ColorAffectedCellsForCurrentObject (GridManager.cs:898-930)
  function evaluate(gr, def, rx, ry, rot, ignore) {
    const g = gr.g, fp = G.footprint(def, rx, ry, rot);
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
    if (gr.st === 'IN_TRAY' && def.forbidStorageTray) state = 'bad';     // placementCellsAreInStorageTray && ForbidStorageTray
    if (state !== 'bad' && !placeAllowed(gr, def)) state = 'bad';
    return { fp, state, objs, clean, valid, accepts };
  }
  // EquipmentModeActionHandler.DoHitTest: lắp được khi ô nhận, nằm trong lưới, <= 1 món bên dưới, không hỏng (hoặc ignoreDamageWhenPlacing)
  const installable = c => !!c && (c.state === 'ok' || c.state === 'semi');

  // DefaultActionHandler.TryAddPlaceAction (:84-95) + EquipmentModeActionHandler.CanAddPlaceAction: lưới đích có nhận món đang cầm không
  function placeAllowed(gr, def) {
    const h = S.held, dst = gr.st, src = h ? h.st : '';
    if (dst === 'IN_STORAGE') return true;
    if (dst === 'IN_QUEST_GRID') return !!(gr.cfg && gr.cfg.canAddItemsInQuestMode) || src === 'IN_QUEST_GRID';
    if (dst === 'IN_TRAY') return !def.forbidStorageTray;
    if (dst === 'IN_INVENTORY') return def.moveMode === 'FREE' || (isInstall(def) && canMoveInstalled());
    if (dst === 'IN_SHOP') return false;                                   // r2shop: DefaultActionHandler.TryAddPlaceAction không có IN_SHOP; hoàn tiền là phím Bán
    return false;
  }

  function updatePreview() {
    if (!S) return;
    for (const gr of S.grids) if (gr.lit) { for (const c of gr.lit) c.querySelector('.f').classList.remove('ok', 'bad', 'semi'); gr.lit = null; }
    const c = S.cand = S.held ? candidate() : null;
    if (c && c.gr.cells) {
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
    const motes = tickMotes(now);
    if (!S || !S.held) { updateRing(); if (motes) raf = requestAnimationFrame(loop); return; }
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
    sfx('rotate', h.def);
    updatePreview();
    refreshPrompts();
    refreshTip();
    startLoop();
  }

  // ---------------------------------------------------------------- nhặt / đặt / vứt
  // src: khoá lưới gốc, hoặc 'harvest' (BEING_HARVESTED), 'buy' (JUST_PURCHASED), 'swap' (món bị đổi chỗ); st = GridObjectState lúc nhấc
  function makeHeld(inst, src, ptr, st) {
    const def = defOf(inst);
    return {
      inst, def, src, st: st || (src === 'harvest' ? 'BEING_HARVESTED' : src === 'buy' ? 'JUST_PURCHASED' : stateOf(src)),
      rot: inst.rot || 0, angle: -(inst.rot || 0), target: -(inst.rot || 0),
      vx: ptr.x, vy: ptr.y, sx: 0, sy: 0, acc: 0, img: null
    };
  }
  const hasHome = h => !!h && h.src !== 'harvest' && h.src !== 'buy' && h.src !== 'swap' && h.src !== 'new';

  function pickUp(gr, inst, e) {
    const def = defOf(inst);
    if (lockedFor(def)) {
      sfx('error', def);
      toast(def.moveMode === 'NONE' ? 'Không dời được món này' : 'Cần cập bến mới tháo lắp được thiết bị');
      return false;
    }
    for (const h of S.handlers) if (h.canPick && h.canPick(def, gr.key, inst) === false) { sfx('error', def); return false; }
    S.held = makeHeld(inst, gr.key, e ? { x: e.clientX, y: e.clientY } : S.ptr, gr.st);
    S.held.dragging = !!e; S.held.down = e ? { x: e.clientX, y: e.clientY } : null; S.held.moved = false;
    sfx('pick', def, gr.st);
    for (const h of S.handlers) if (h.onPick) h.onPick(inst, gr.key);
    hideTip();
    render();
    startLoop();
    return true;
  }

  function tryPlace(fromDrag) {
    const h = S.held, c = S.cand = candidate();
    if (!c || c.state === 'bad') {
      if (fromDrag && hasHome(h)) { cancelHold(); return false; }
      sfx('error', h.def);
      return false;
    }
    const inst = h.inst, def = h.def, g = c.gr.g;
    for (const hd of S.handlers) if (hd.canPlace && hd.canPlace(def, c.gr.key, c.rx, c.ry, h.rot) === false) { sfx('error', def); return false; }
    const srcG = hasHome(h) ? DR.grid(h.src) || (gridOf(h.src) || {}).g : null;
    let next = null;
    if (c.state === 'semi') {
      // đổi chỗ: món bị đè bị nhấc khỏi lưới và dính vào con trỏ
      const occ = c.objs[0];
      G.remove(g, occ);
      next = makeHeld(occ, 'swap', S.ptr, c.gr.st);
      next.rot = occ.rot || 0;
    }
    if (srcG === g) G.move(g, inst, def, c.rx, c.ry, h.rot);
    else {
      if (srcG) G.remove(srcG, inst);
      inst.uid = g.seq++; inst.x = c.rx; inst.y = c.ry; inst.rot = h.rot; inst.cells = G.footprint(def, c.rx, c.ry, h.rot);
      g.items.push(inst);
    }
    if (root.DR && DR.emit) DR.emit('cargo', c.gr.key, inst);        // sự kiện kho đổi (quests.js, boat.js nghe)
    sfx('place', def, c.gr.st);
    const fromKey = h.src;
    if (h.src === 'harvest' || h.src === 'new') { S.result = 'placed'; if (S.holding && S.holding.onPlaced) S.holding.onPlaced(inst, c.gr.key); }
    if (h.src === 'buy' && S.holding && S.holding.onPlaced) S.holding.onPlaced(inst, c.gr.key);
    S.held = next;
    if (next) { next.dragging = false; sfx('pick', defOf(next.inst), c.gr.st); }
    for (const hd of S.handlers) if (hd.onPlace) hd.onPlace(inst, c.gr.key, fromKey);
    // EquipmentModeActionHandler.OnItemPlaceComplete: món INSTALL đặt vào khoang -> ép thời gian trôi theo giờ lắp (C05)
    if (isInstall(def) && c.gr.st === 'IN_INVENTORY' && canMoveInstalled() && root.DR && DR.emit) {
      DR.emit('passTime', installHours(def), 'INSTALL');              // sky.js nghe 'passTime' (TimePassageMode.INSTALL)
    }
    afterChange();
    render();
    return true;
  }

  function cancelHold() {
    if (!S.held || !hasHome(S.held)) return;
    S.held = null;
    afterChange();
    render();
  }

  // DefaultActionHandler.TryAddDiscardAction (:106-134): trạng thái cho phép, không sửa chữa, không đang câu, lưới nhiệm vụ cần
  // canBeDiscardedDuringQuestPickup, (canBeDiscardedByPlayer hoặc vừa bắt), thiết bị chỉ sau nhiệm vụ mở đầu.
  function canDiscard(def, st) {
    if (S.mode === 'repair' || inMinigame()) return false;
    if (S.left && S.left.kind === 'quest' && def.canBeDiscardedDuringQuestPickup === false) return false;
    if (!['BEING_HARVESTED', 'IN_INVENTORY', 'IN_STORAGE', 'IN_QUEST_GRID', 'IN_TRAY'].includes(st)) return false;
    if (!(def.canBeDiscardedByPlayer !== false || st === 'BEING_HARVESTED')) return false;
    if (isEquip(def) && !introDone()) return false;
    return true;
  }
  const discardSec = def => def.discardHoldTimeOverride ? def.discardHoldTimeSec : DISCARD_HOLD;
  const discardLabel = def => def.hasSpecialDiscardAction && def.discardPromptOverride ? (DISCARD_VN[def.discardPromptOverride] || str(def.discardPromptOverride)) : 'Vứt';
  const DISCARD_VN = { 'prompt.use': 'Dùng', 'prompt.throw-overboard': 'Ném xuống biển', 'prompt.release': 'Thả', 'prompt.discard': 'Vứt' };

  // GridManager.DiscardCurrentObject (:956-973): đếm cá vứt, tiếng huỷ do người chơi, hành động đặc biệt (bộ sửa, neo...)
  function discard(target) {
    if (!S) return;
    let def, inst, key;
    if (target.held) {
      const h = S.held;
      if (!h || !canDiscard(h.def, h.st)) { sfx('error', h ? h.def : {}); toast('Món này không vứt được'); return; }
      def = h.def; inst = h.inst; key = hasHome(h) ? h.src : null;
      if (h.src === 'harvest' || h.src === 'new') { S.result = 'discarded'; if (S.holding && S.holding.onDiscarded) S.holding.onDiscarded(inst); }
      else if (hasHome(h)) G.remove(DR.grid(h.src) || gridOf(h.src).g, inst);
      S.held = null;
    } else {
      const { gr } = target; inst = target.inst; def = defOf(inst); key = gr.key;
      if (!canDiscard(def, gr.st)) { sfx('error', def); return; }
      G.remove(gr.g, inst);
      S.hover = null;
    }
    if (isFish(def)) DR.s.vars['fish-discard-count'] = (DR.s.vars['fish-discard-count'] || 0) + 1;   // SaveData.FishDiscardCount
    sfx('drop', def);                                                      // TriggerItemDestroyed(playerDestroyed: true)
    for (const hd of S.handlers) if (hd.onDiscard) hd.onDiscard(inst, key);
    if (def.hasSpecialDiscardAction && root.DR && DR.emit) DR.emit('specialItem', def, inst);   // TriggerSpecialItemHandlerRequest
    if (root.DR && DR.emit) DR.emit('cargo', key || 'INVENTORY', null);
    afterChange();
    hideTip();
    render();
  }

  // StorageModeActionHandler.OnQuickTransferPressed (:150-180): không có chỗ, hoặc món INSTALL về khoang -> nhấc lên con trỏ,
  // chuyển sang bảng đích, báo "quick-move-failed" khi không có chỗ (C07)
  function quickMove(gr, inst) {
    const def = defOf(inst);
    const toStorage = gr.st === 'IN_INVENTORY' || gr.st === 'JUST_PURCHASED' || gr.st === 'IN_QUEST_GRID';
    const dstKey = toStorage ? 'STORAGE' : 'INVENTORY';
    const dst = gridOf(dstKey) || (DR.s.grids[dstKey] ? { key: dstKey, g: DR.grid(dstKey), st: stateOf(dstKey) } : null);
    if (!dst) return;
    const spot = G.findSpot(dst.g, def, 0, false);
    if (!spot || (dstKey === 'INVENTORY' && def.moveMode === 'INSTALL')) {
      // món bị nhấc nhưng vẫn thuộc lưới cũ trong DR.s cho tới khi đặt (Esc trả về); trạng thái đổi sang lưới đích trước khi nhấc
      S.held = makeHeld(inst, gr.key, S.ptr, dstKey === 'STORAGE' ? 'IN_STORAGE' : 'IN_INVENTORY');
      S.held.dragging = false;
      sfx('pick', def, S.held.st);
      if (!S.right.tabs.includes(dstKey) || S.right.cur === dstKey) { /* lưới đích đang hiện */ }
      else S.right.cur = dstKey;                                           // PlayerTabbedPanel.ShowNewPanel(1 | 3, showImmediate)
      if (!spot) toast('Không tìm được chỗ cho món này');                  // notification.quick-move-failed
      hideTip();
      render();
      return;
    }
    G.remove(gr.g, inst);
    inst.uid = dst.g.seq++; inst.x = spot.x; inst.y = spot.y; inst.rot = spot.rot; inst.cells = G.footprint(def, spot.x, spot.y, spot.rot);
    dst.g.items.push(inst);
    if (root.DR && DR.emit) DR.emit('cargo', dst.key, inst);
    sfx('place', def, dst.st);                                             // OnItemQuickMoved -> OnItemPlaceComplete(success)
    for (const hd of S.handlers) if (hd.onPlace) hd.onPlace(inst, dst.key, gr.key);
    afterChange();
    S.hover = null; hideTip();
    render();
  }

  // QuestGridPanel.OnStateChanged: tính lại điều kiện hoàn thành sau mỗi lần nhặt/đặt/vứt
  function afterChange() {
    if (!S) return;
    const L = S.left;
    if (L && L.kind === 'quest' && L.quest) {
      const gr = gridOf(L.cur);
      L.complete = !!gr && G.complete(L.quest.completeConditions, gr.g, root.DR_ITEMS);
      if (L.complete && L.exitOnComplete && !S.held) { setTimeout(() => { if (S && S.left === L) exitLeft(); }, 0); }
    }
    if (root.DR && DR.save && !S.docked) { /* sổ lưu do root/dock gọi; không lưu ở đây để khỏi ghi dở */ }
  }

  // ---------------------------------------------------------------- ô đang rê chuột
  function hoverAt(x, y) {
    const hit = gridAt(x, y, 0);
    if (!hit) return null;
    const cs = S.M.cs, cx = Math.floor((x - hit.r.left) / cs), cy = Math.floor((y - hit.r.top) / cs);
    if (cx < 0 || cy < 0 || cx >= hit.gr.g.cols || cy >= hit.gr.g.rows) return null;
    const inst = G.itemAt(hit.gr.g, cx, cy);
    if (inst && S.held && S.held.inst === inst) return null;
    if (!inst) {
      if (S.mode === 'repair' && G.isDamaged(hit.gr.g, cx, cy)) return { gr: hit.gr, inst: null, cx, cy, damaged: true };
      return null;
    }
    return { gr: hit.gr, inst, cx, cy, damaged: G.isDamaged(hit.gr.g, cx, cy) };
  }

  // ---------------------------------------------------------------- prompt (BaseGridModeActionHandler + các lớp con)
  function ctx() {
    const hv = S.hover ? { gr: S.hover.gr, key: S.hover.gr.key, st: S.hover.gr.st, inst: S.hover.inst, def: S.hover.inst ? defOf(S.hover.inst) : null, cell: [S.hover.cx, S.hover.cy], damaged: !!S.hover.damaged } : null;
    return {
      hovered: hv, held: S.held, cand: S.cand, mode: S.mode, left: S.left, funds: DR.s ? DR.s.funds : 0,
      tab: S.right.cur, setMode,                                            // r2shop: tab khoang đang mở + bật/tắt chế độ sửa (GridManager.ToggleRepairMode)
      grid: key => { const g = gridOf(key); return g ? g.g : null; },
      // handler đưa món lên con trỏ (BuyModeActionHandler: mua xong món dính con trỏ, src 'buy' -> JUST_PURCHASED)
      take: (inst, src, st) => { if (!S) return; inst.rot = inst.rot || 0; S.held = makeHeld(inst, src || 'buy', S.ptr, st); S.held.dragging = false; sfx('pick', defOf(inst), S.held.st); hideTip(); render(); },
      drop: () => { if (S && S.held) { S.held = null; afterChange(); render(); } }
    };
  }
  function builtinPrompts(c) {
    const out = [], h = c.held, hv = c.hovered;
    const equip = canMoveInstalled();
    if (h) {
      const dstGr = c.cand && c.cand.gr;
      if (dstGr && placeAllowed(dstGr, h.def)) {
        if (isInstall(h.def) && dstGr.st === 'IN_INVENTORY') {
          // EquipmentModeActionHandler.placeAction: giữ 0,6 s, nhãn "Install [x.xh]", chỉ bật khi lắp được (DoHitTest)
          out.push({ id: 'install', label: 'Lắp [' + hoursStr(installHours(h.def)) + 'h]', bind: 'lmb', hold: INSTALL_HOLD, enabled: installable(c.cand), run: () => tryPlace(false) });
        } else out.push({ id: 'place', label: 'Đặt', bind: 'lmb', hold: 0, enabled: true, run: () => tryPlace(false) });
      }
      out.push({ id: 'rotate', label: 'Xoay', bind: 'rmb', hold: 0, enabled: true, run: rotate });
      if (canDiscard(h.def, h.st)) out.push({ id: 'discard', label: discardLabel(h.def), bind: 'KeyZ', hold: discardSec(h.def), warn: !!h.def.showAlertOnDiscardHold, enabled: true, run: () => discard({ held: true }) });
    } else if (hv && hv.inst) {
      const def = hv.def, st = hv.st;
      const states = ['IN_INVENTORY', 'IN_STORAGE', 'BEING_HARVESTED', 'IN_QUEST_GRID', 'IN_TRAY'];
      if (S.mode !== 'repair' && !inMinigame() && states.includes(st)) {
        if (def.moveMode === 'FREE') out.push({ id: 'pickup', label: 'Nhặt', bind: 'lmb', hold: 0, enabled: true, run: () => pickUp(hv.gr, hv.inst, null) });
        else if (isInstall(def) && equip && st === 'IN_INVENTORY') out.push({ id: 'uninstall', label: 'Tháo', bind: 'lmb', hold: INSTALL_HOLD, enabled: true, run: () => pickUp(hv.gr, hv.inst, null) });
        else if (isInstall(def) && equip && (st === 'IN_STORAGE' || st === 'IN_QUEST_GRID')) out.push({ id: 'pickup', label: 'Nhặt', bind: 'lmb', hold: 0, enabled: true, run: () => pickUp(hv.gr, hv.inst, null) });
      }
      if (canDiscard(def, st)) out.push({ id: 'discard', label: discardLabel(def), bind: 'KeyZ', hold: discardSec(def), warn: !!def.showAlertOnDiscardHold, enabled: true, run: () => discard({ gr: hv.gr, inst: hv.inst }) });
      // StorageModeActionHandler.CanUseQuickMoveAction: có kho trong phiên; INSTALL trong khoang, đồ nền, chế độ sửa thì không
      const storage = S.hasStorage && S.mode !== 'repair' && !def.isUnderlayItem;
      if (storage && (st === 'IN_INVENTORY' || st === 'JUST_PURCHASED' || st === 'IN_QUEST_GRID') && !(st === 'IN_INVENTORY' && def.moveMode === 'INSTALL'))
        out.push({ id: 'to-storage', label: 'Vào kho', bind: 'mmb', hold: 0, enabled: true, run: () => quickMove(hv.gr, hv.inst) });
      else if (storage && st === 'IN_STORAGE') out.push({ id: 'to-cargo', label: 'Về khoang', bind: 'mmb', hold: 0, enabled: true, run: () => quickMove(hv.gr, hv.inst) });
    }
    return out;
  }
  function refreshPrompts() {
    if (!S) return;
    const c = ctx();
    let list = builtinPrompts(c);
    for (const p of list) p.builtin = true;
    for (const h of S.handlers) if (h.prompts) {
      const extra = h.prompts(c) || [];
      for (const p of extra) { list = list.filter(q => q.bind !== p.bind || q.id === p.id || p.bind === 'btn'); list.push(p); }   // handler đè prompt cùng phím
    }
    S.prompts = list;
    renderControl();
    refreshFooter();
  }
  const promptFor = bind => (S.prompts || []).find(p => p.bind === bind && p.enabled !== false) || null;
  function runPrompt(p) {
    if (!S || !p || p.enabled === false) return;
    if (p.hold > 0) return;                                                // giữ: qua startHold
    p.run(ctx());
    ranPrompt(p);
  }
  // prompt dựng sẵn tự dựng lại phần cần; prompt của handler (mua/bán/sửa...) có thể đổi lưới nên dựng lại cả màn
  function ranPrompt(p) {
    if (!S) return;
    if (p.builtin) { refreshPrompts(); refreshTip(); }
    else { afterChange(); render(); }
  }
  const promptLabel = p => labelOf(p) + (p.price != null ? ' [' + money(p.price) + ']' : '');
  // r2shop: giá trong prompt tô màu như "<color=#..>$X</color>" của BuyModeActionHandler / SellModeActionHandler (priceColor)
  function fillLabel(e, p) {
    if (p.price == null || !p.priceColor) { e.textContent = promptLabel(p); return; }   // không tô màu: một nút chữ như cũ
    e.textContent = labelOf(p);
    e.appendChild(document.createTextNode(' ['));
    const s = el('span', 'price', e, money(p.price));
    if (p.priceColor) s.style.color = p.priceColor;
    e.appendChild(document.createTextNode(']'));
  }
  const BIND_VN = { lmb: 'Chuột trái', rmb: 'Chuột phải', mmb: 'Chuột giữa', KeyZ: 'Z', KeyF: 'F', KeyR: 'R', KeyT: 'T' };

  // vùng điều khiển góc dưới phải (ControlPanel / "Leave B" của bản gốc): prompt có area 'control'
  function renderControl() {
    const list = (S.prompts || []).filter(p => p.area === 'control');
    // chỉ dựng lại khi danh sách đổi, để nút đang được giữ không bị thay giữa chừng
    const sig = list.map(p => p.id + '|' + promptLabel(p) + '|' + (p.enabled !== false) + '|' + (p.priceColor || '')).join(';');
    if (sig === S.ctlSig) return;
    S.ctlSig = sig;
    ctl.innerHTML = '';
    ctl.style.display = list.length ? 'flex' : 'none';
    for (const p of list) {
      const b = el('button', 'cg-btn cg-cbtn', ctl);
      fillLabel(b, p);
      b.dataset.act = p.id;
      b.disabled = p.enabled === false;
      if (p.hold > 0) wireHoldButton(b, p); else b.onclick = e => { e.stopPropagation(); runPrompt(p); };
    }
  }
  function refreshFooter() {
    if (!S || !S.left || !S.left.footer || !host) return;
    for (const b of S.left.footer.buttons || []) {
      const btn = host.querySelector('.cg-foot [data-act="' + (b.id || b.label) + '"]');
      if (!btn) continue;
      fillLabel(btn, b);
      if (b.hold) el('span', 'hint', btn, '(giữ)');
      btn.disabled = !(typeof b.enabled === 'function' ? b.enabled(ctx()) : b.enabled !== false);
    }
  }
  function wireHoldButton(btn, p) {
    btn.classList.add('hold');
    el('span', 'hint', btn, '(giữ)');
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (!btn.disabled) startHold(p, 'btn'); });
    btn.addEventListener('pointerup', e => { e.stopPropagation(); stopHold(); });
    btn.addEventListener('pointerleave', () => stopHold());
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
  // ControlPromptEntryUI: glyph phím + nhãn ("Giữ" khi là hành động giữ); chỉ là gợi ý, không bấm được (tooltip đi theo con trỏ)
  function chip(parent, p) {
    const r = el('div', 'pr' + (p.enabled === false ? ' off' : ''), parent);
    r.dataset.act = p.id;
    el('b', '', r, (p.hold > 0 ? 'Giữ ' : '') + (BIND_VN[p.bind] || 'Bấm'));
    fillLabel(el('span', '', r), p);
    return r;
  }
  // LanguageManager.FormatTimeStringForDurability (:142-170): <= 0 "Cần sửa"; làm tròn ngày, < 1 ngày thì tính giờ, ít nhất 1
  function durTime(cur) {
    if (cur <= 0) return 'Cần sửa';
    const d = Math.round(cur), h = Math.round(cur * 24);
    return d < 1 ? Math.max(h, 1) + ' giờ' : Math.max(d, 1) + ' ngày';
  }
  function durBar(parent, label, cur, max, text) {
    const f = Math.max(0, Math.min(1, cur / max));
    const bar = el('span', 'bar'); const fill = el('i', '', bar); fill.style.width = f * 100 + '%';
    el('em', '', bar, text);
    return tipRow(parent, label, bar);
  }
  const tagsOf = (types, adv) => { const tg = el('span', 'tags'); for (const t of types || []) tg.appendChild(typeTag(t, adv)); return tg; };
  // HarvestableItemData.GetDepthString: dải độ sâu x depthModifier, "a - b" / "a +" / "- b" (đơn vị m)
  function depthStr(def) {
    const bands = cfg().depthBands || {}, mod = cfg().depthModifier || 1;
    const a = bands[def.minDepth] || [0, 0], b = bands[def.maxDepth] || [0, 0];
    const f = v => Math.round(v * mod) + ' m';
    if (def.hasMinDepth && def.hasMaxDepth) return f(a[0]) + ' - ' + f(b[1]);
    if (def.hasMinDepth) return f(a[0]) + ' +';
    if (def.hasMaxDepth) return '- ' + f(b[1]);
    return '';
  }

  function buildTip(inst, def, mode) {
    tip.innerHTML = '';
    const hd = el('div', 'hd', tip);
    if (def.itemTypeIcon) { const i = new Image(); i.src = def.itemTypeIcon; i.className = 'ic'; hd.appendChild(i); }
    // TooltipSectionHeader.RefreshString: tên điên loạn khi sanity dưới ngưỡng
    el('span', 'nm', hd, insane() && def.itemInsaneTitle ? def.itemInsaneTitle : def.name);
    el('i', 'ln', hd);
    const g = inst && S.hover ? S.hover.gr.g : DR.grid('INVENTORY');
    const onDamagedCell = !!(inst && S.hover && G.onDamaged(S.hover.gr.g, inst));
    const sub = G.subOf(def);
    if (mode === 'HOVER') {
      if (sub === G.SUB.FISH) {
        // TooltipSectionFishDetails: cỡ (cá cúp: sprite TrophyIcon tô #FFD104), tình trạng, loại hoặc độ sâu khi harvestableType NONE
        const cm = sizeCm(def, inst), fk = inst.infected ? 'inf' : freshKey(inst);
        const trophy = inst.size != null && inst.size >= (cfg().trophyMaxSize || 1.01);
        if (cm != null) {
          const v = el('span', 'sz');
          if (trophy) { const t = el('i', 'trophy', v); t.style.setProperty('--m', 'url(' + ART('TrophyIcon') + ')'); }
          el('span', '', v, cm > 100 ? (cm / 100).toFixed(2) + ' m' : cm.toFixed(1) + ' cm');
          tipRow(tip, 'Kích thước:', v, trophy ? COLOR.VALUABLE : null);
        }
        tipRow(tip, 'Tình trạng:', fk === 'inf' ? 'Nhiễm bệnh' : FRESH_VN[fk], fk === 'inf' ? COLOR.CRITICAL : FRESH_COL[fk]);
        if (def.harvestableType && def.harvestableType !== 'NONE') tipRow(tip, 'Loại:', typeTag(def.harvestableType, def.requiresAdvancedEquipment));
        else tipRow(tip, 'Độ sâu:', depthStr(def));
      }
      if (isEquip(def) && sub !== G.SUB.POT) {
        // TooltipSectionEquipmentDetails: giờ lắp (ẩn với GADGET), trạng thái: DURABILITY hết bền hoặc OPERATION trên ô hỏng = "Hư hỏng"
        if (sub !== G.SUB.GADGET) tipRow(tip, 'Thời gian lắp:', hoursStr(installHours(def)) + 'h');
        let bad = false;
        if (def.damageMode === 'DURABILITY') bad = inst && inst.dur != null && inst.dur <= 0;
        else if (def.damageMode === 'OPERATION') bad = onDamagedCell;
        tipRow(tip, 'Tình trạng:', bad ? 'Hư hỏng' : 'Hoạt động', bad ? COLOR.NEGATIVE : null);
      }
    }
    if (mode === 'HOVER' || mode === 'RESEARCH_PREVIEW') {
      const on = !onDamagedCell;
      if (sub === G.SUB.ROD) {
        if (def.fishingSpeedModifier) tipRow(tip, 'Tốc độ câu:', on ? '+' + Math.round((def.fishingSpeedModifier || 0) * 100) + '%' : '0%', on ? null : COLOR.NEGATIVE);
        if (def.aberrationBonus > 0) tipRow(tip, 'Thưởng dị biến:', '+' + fmt(def.aberrationBonus * 100, 1) + '%');
        if ((def.harvestableTypes || []).length) tipRow(tip, 'Câu được:', tagsOf(def.harvestableTypes, def.isAdvancedEquipment));
      }
      if (sub === G.SUB.DREDGE) tipRow(tip, 'Vét được:', typeTag('DREDGE', false));          // TooltipSectionDredgeDetails
      if (sub === G.SUB.ENGINE) tipRow(tip, 'Tốc độ:', on ? '+' + fmt(def.speedBonus || 0, 1) + ' kn' : '0 kn', on ? null : COLOR.NEGATIVE);
      if (sub === G.SUB.LIGHT) {
        tipRow(tip, 'Độ sáng:', on ? '+' + Math.round(def.lumens || 0) + ' lm' : '0 lm', on ? null : COLOR.NEGATIVE);
        tipRow(tip, 'Tầm chiếu:', on ? Math.round(def.range || 0) + ' m' : '0 m', on ? null : COLOR.NEGATIVE);
      }
      if (sub === G.SUB.POT || sub === G.SUB.NET) {
        // TooltipSectionDeployableDetails (:91-140): bền theo thời gian, "Bắt được" ~N hoặc a - b mỗi ngày, sức chứa lưới, thưởng dị biến, loại
        const max = def.maxDurabilityDays || 1, cur = inst && inst.dur != null ? inst.dur : max;
        durBar(tip, 'Dùng được:', cur, max, durTime(cur));
        if (def.id !== 'tir-net1') {
          const n = (1 / (def.timeBetweenCatchRolls || 1)) * (def.catchRate || 0);
          tipRow(tip, 'Bắt được:', (n % 1 > 0.1 ? Math.floor(n) + ' - ' + Math.ceil(n) : '~' + Math.round(n)) + ' mỗi ngày');
          const gc = root.DR_GRIDS && def.gridConfig && DR_GRIDS[def.gridConfig];
          if (gc) tipRow(tip, 'Sức chứa:', gc.columns + 'x' + gc.rows);
          if (def.aberrationBonus > 0) tipRow(tip, 'Thưởng dị biến:', '+' + fmt(def.aberrationBonus * 100, 1) + '%');
        }
        if ((def.harvestableTypes || []).length) tipRow(tip, 'Bắt loại:', tagsOf(def.harvestableTypes, def.isAdvancedEquipment));
      }
      if (def.cls === 'DurableItemData' && def.maxDurabilityDays) {
        // TooltipSectionDurabilityDetails: phần trăm khi displayDurabilityAsPercentage, còn lại theo thời gian
        const max = def.maxDurabilityDays, cur = inst && inst.dur != null ? inst.dur : max;
        if (def.displayDurabilityAsPercentage) durBar(tip, 'Độ bền:', cur, max, Math.round(cur / max * 100) + ' %');
        else durBar(tip, 'Dùng được:', cur, max, durTime(cur));
      }
      if (def.cls === 'GadgetItemData') {
        // TooltipSectionGadgetDetails: tên hiệu ứng, +X% (0% đỏ trên ô hỏng), "Tổng hiện có" khi tổng lớn hơn
        const mag = onDamagedCell ? 0 : (def.effectMagnitude || 0) * 100;
        tipRow(tip, GADGET_VN[def.effectType] || def.effectType || 'Hiệu ứng', '+' + Math.trunc(mag) + '%', onDamagedCell ? COLOR.NEGATIVE : null);
        const inv = DR.grid('INVENTORY');
        const total = inv.items.reduce((s, i) => { const d = defOf(i); return d.cls === 'GadgetItemData' && d.effectType === def.effectType && !G.onDamaged(inv, i) ? s + (d.effectMagnitude || 0) : s; }, 0) * 100;
        if (total > mag) tipRow(tip, 'Tổng hiện có:', '+' + Math.trunc(total) + '%');
      }
      // TooltipSectionDescription: mô tả điên loạn (insaneTextColor), mô tả sau khi đã xem node hội thoại, hoặc mô tả thường theo tooltipTextColor
      let desc = def.desc, col = def.tooltipTextColor && def.tooltipTextColor !== '#00000000' ? def.tooltipTextColor.slice(0, 7) : null;
      if (insane() && def.itemInsaneDescription) { desc = def.itemInsaneDescription; col = COLOR.CRITICAL; }   // [ĐỀ XUẤT] insaneTextColor không xuất được, lấy CRITICAL
      else if (def.linkedDialogueNode && root.DRYarn && DRYarn.visited && DRYarn.visited(def.linkedDialogueNode) && def.dialogueNodeSpecificDescription) desc = def.dialogueNodeSpecificDescription;
      if (desc) { const p = el('p', 'ds', tip, desc); if (col) p.style.color = col; }
      if (def.hasAdditionalNote && def.additionalNote) { const p = el('p', 'ds note', tip, def.additionalNote); if (def.tooltipNotesColor) p.style.color = def.tooltipNotesColor.slice(0, 7); }
    }
    // TooltipSectionControlPrompts: mọi prompt showInTooltip
    const pr = el('div', 'prompts', tip);
    for (const p of S.prompts || []) if (!p.area || p.area === 'tip') chip(pr, p);
  }

  function refreshTip() {
    if (!S) return;
    // TooltipUI.LateUpdate (:279-283, :299): ẩn khi đang câu; chế độ sửa chỉ hiện món có độ bền
    if (inMinigame()) { hideTip(); return; }
    if (S.held) showTip(S.held.inst, S.held.def, 'HOLD');
    // r2shop: chế độ sửa rê lên ô hỏng (món "dmg" nằm dưới) thì tooltip của vết hỏng mang prompt Sửa (RepairActionHandler.repairAction.showInTooltip)
    else if (S.mode === 'repair' && S.hover && S.hover.damaged && (!S.hover.inst || defOf(S.hover.inst).damageMode !== 'DURABILITY') && root.DR_ITEMS.dmg) showTip(null, root.DR_ITEMS.dmg, 'DAMAGE');
    else if (S.hover && S.hover.inst) {
      const def = defOf(S.hover.inst);
      if (S.mode === 'repair' && !def.isUnderlayItem && def.damageMode !== 'DURABILITY') { hideTip(); return; }
      showTip(S.hover.inst, def, 'HOVER');
    } else hideTip();
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
    const lp = host.querySelector('.cg-left'), areaL = lp && S.left && S.left.kind !== 'tray' ? lp.getBoundingClientRect().right : 0;
    const areaR = M.hasInv ? M.W - M.panelW : M.W;
    let x = S.ptr.x < M.W / 2 ? S.ptr.x + gap : S.ptr.x - gap - w;
    x = Math.max(areaL, Math.min(areaR - w, x));
    let y = S.ptr.y - gap;
    y = Math.max(0, Math.min(M.H - h, y));
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  // ---------------------------------------------------------------- nút trên màn hình (cảm ứng) + vòng giữ phím
  function showActs() {
    if (!acts) {
      acts = el('div', 'cg-acts dr-ui', document.body);
      const r = el('button', 'cg-act', acts, 'Xoay'); r.dataset.act = 'rotate';
      r.onclick = e => { e.stopPropagation(); rotate(); };
      const d = el('button', 'cg-act', acts, 'Vứt (giữ)'); d.dataset.act = 'discard';
      d.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); const p = promptFor('KeyZ'); if (p) startHold(p, 'btn'); else { play('ui.grid.error'); toast('Món này không vứt được'); } });
      d.addEventListener('pointerup', e => { e.stopPropagation(); stopHold(); });
      d.addEventListener('pointerleave', () => stopHold());
      acts.addEventListener('pointerdown', e => e.stopPropagation());
    }
    acts.style.display = 'flex';
  }
  function hideActs() { if (acts) acts.style.display = 'none'; }

  // DredgePlayerActionHold: giữ đủ holdTimeRequiredSec thì chạy; nhả sớm thì huỷ. usesHoldSFX: "Hold - Active" lặp khi giữ,
  // "Hold - Complete" khi xong (AudioPlayer.SetIsButtonHeld / OnHoldActionComplete, ManagerAudio.prefab) (C16)
  function startHold(p, how) {
    if (!S || S.hold || !p || p.enabled === false) return;
    S.hold = { t0: performance.now(), sec: p.hold, p, how, warn: !!p.warn };
    try { root.DRAudio && DRAudio.loop('ui.hold.active', 1); } catch (e) { /* tiếng là phần phụ */ }
    startLoop();
    holdTick();
  }
  function holdTick() {
    if (!S || !S.hold) return;
    const H = S.hold, pr = (performance.now() - H.t0) / 1000 / H.sec;
    if (pr >= 1) {
      S.hold = null; updateRing();
      try { root.DRAudio && DRAudio.stopLoop('ui.hold.active'); } catch (e) { /* */ }
      play('ui.hold.complete');
      H.p.run(ctx());
      ranPrompt(H.p);
      return;
    }
    updateRing();
    requestAnimationFrame(holdTick);
  }
  function stopHold() {
    if (!S || !S.hold) return;
    S.hold = null; updateRing();
    try { root.DRAudio && DRAudio.stopLoop('ui.hold.active'); } catch (e) { /* */ }
  }
  function updateRing() {
    if (!S || !S.hold) { ring.style.display = 'none'; return; }
    const p = Math.min(1, (performance.now() - S.hold.t0) / 1000 / S.hold.sec);
    ring.style.display = 'block';
    ring.style.setProperty('--p', (p * 360).toFixed(1) + 'deg');
    ring.style.setProperty('--c', S.hold.warn ? COLOR.NEGATIVE : COLOR.NEUTRAL);
    ring.style.transform = 'translate(' + (S.ptr.x + 18) + 'px,' + (S.ptr.y + 18) + 'px)';
  }

  // ---------------------------------------------------------------- con trỏ
  function onDown(e) {
    if (!S || e.target.closest('button') || e.target.closest('.cg-acts') || e.target.closest('.cg-cabin')) return;
    S.ptr = { x: e.clientX, y: e.clientY }; lastPtr = S.ptr; lastType = e.pointerType;
    // dựng lại DOM khi nhặt/đặt làm mất phần tử đích: giữ con trỏ ở host để cảm ứng không mất sự kiện kéo
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* trình duyệt cũ */ }
    if (e.button === 2) { const p = promptFor('rmb'); if (p) runPrompt(p); return; }          // RotateClockwise = chuột phải
    if (e.button === 1) { e.preventDefault(); if (!S.held) { S.hover = hoverAt(e.clientX, e.clientY); refreshPrompts(); const p = promptFor('mmb'); if (p) runPrompt(p); } return; }   // QuickMove
    if (e.button !== 0) return;
    if (S.held) {
      if (S.held.dragging) return;
      updatePreview(); refreshPrompts();
      const p = promptFor('lmb');
      if (!p) { if (S.cand && S.cand.state === 'bad') sfx('error', S.held.def); else sfx('error', S.held.def); return; }
      if (p.hold > 0) { S.ptrHold = true; startHold(p, 'pointer'); } else runPrompt(p);
      return;
    }
    S.hover = hoverAt(e.clientX, e.clientY);
    refreshPrompts();
    if (S.hover && !S.hover.inst && S.hover.damaged) { const pr = promptFor('lmb'); if (pr) runPrompt(pr); return; }   // r2shop: ô hỏng trống trong chế độ sửa (RepairItem = chuột trái)
    if (!S.hover || !S.hover.inst) return;
    const p = promptFor('lmb');
    if (!p) { const def = defOf(S.hover.inst); if (lockedFor(def)) pickUp(S.hover.gr, S.hover.inst, e); else sfx('error', def); return; }
    if (p.hold > 0) { S.ptrHold = true; startHold(p, 'pointer'); return; }
    if (p.id === 'pickup') pickUp(S.hover.gr, S.hover.inst, e); else runPrompt(p);
  }

  function onMove(e) {
    lastPtr = { x: e.clientX, y: e.clientY }; lastType = e.pointerType;
    if (!S) return;
    S.ptr = lastPtr;
    if (S.held) {
      const h = S.held;
      if (h.dragging && !h.moved && h.down && Math.hypot(e.clientX - h.down.x, e.clientY - h.down.y) > 8) h.moved = true;
      const before = S.cand && S.cand.gr.key + ':' + S.cand.rx + ':' + S.cand.ry + ':' + S.cand.state;
      updatePreview();
      const after = S.cand && S.cand.gr.key + ':' + S.cand.rx + ':' + S.cand.ry + ':' + S.cand.state;
      if (before !== after) { if (S.hold && S.hold.how === 'pointer') stopHold(); refreshPrompts(); refreshTip(); }   // OnFocusedGridCellChanged
      placeTip();
      startLoop();
      return;
    }
    const h = hoverAt(e.clientX, e.clientY);
    const same = h && S.hover && h.inst === S.hover.inst && h.gr === S.hover.gr && (h.inst || (h.cx === S.hover.cx && h.cy === S.hover.cy));
    S.hover = h;
    if (!same) { if (S.hold && S.hold.how === 'pointer') stopHold(); refreshPrompts(); }
    updateHi();
    if (!h) { hideTip(); return; }
    if (!same) refreshTip(); else placeTip();
  }

  // GridCell.OnItemHoveredChanged (C15): không cầm gì, rê lên đèn/cần/động cơ/lưới nằm NGOÀI khoang thì ô khoang nhận nó sáng trắng
  function hiSubNow() {
    if (!S || !showSlotIcons()) return 0;
    const hs = S.held ? G.subOf(S.held.def) : (S.hover && S.hover.inst && S.hover.gr.key !== 'INVENTORY' ? G.subOf(defOf(S.hover.inst)) : 0);
    return hs === G.SUB.LIGHT || hs === G.SUB.ROD || hs === G.SUB.ENGINE || hs === G.SUB.NET ? hs : 0;
  }
  function updateHi() {
    const inv = gridOf('INVENTORY');
    if (!inv || !inv.cells) return;
    const hs = hiSubNow();
    if (hs === S.hiSub) return;
    S.hiSub = hs;
    const g = inv.g, LISTEN = G.SUB.ENGINE | G.SUB.ROD | G.SUB.LIGHT;
    for (let i = 0; i < inv.cells.length; i++) {
      const c = inv.cells[i]; if (!c) continue;
      const ic = c.querySelector('.ic'); if (!ic) continue;
      const cell = g.cells[i], hi = !!(hs && (cell.sub & LISTEN) && (cell.sub & hs));
      ic.classList.toggle('hi', hi);
      ic.style.display = hi || !c.classList.contains('occ') ? '' : 'none';
    }
  }

  function onUp() {
    if (!S) return;
    if (S.ptrHold) { S.ptrHold = false; stopHold(); }
    if (!S.held || !S.held.dragging) return;
    if (S.held.moved) { S.held.dragging = false; tryPlace(true); }
    else { S.held.dragging = false; refreshPrompts(); refreshTip(); }   // chạm không kéo = nhấc đồ lên, bấm ô khác để đặt
  }

  // ---------------------------------------------------------------- handler dựng sẵn
  // Default/Storage/Equipment/Harvest nằm trong builtinPrompts; đây là phần gắn thêm theo bảng trái
  function trayHandler() {
    return {
      name: 'tray',
      // ResetStorageTray: đồ còn trong khay bị huỷ, cá tính là vứt, TriggerItemDestroyed(playerDestroyed:false) nên không có tiếng
      onClose() {
        const gr = gridOf('STORAGE_TRAY');
        if (!gr) return;
        for (const i of gr.g.items.slice()) {
          const d = defOf(i);
          if (isFish(d)) DR.s.vars['fish-discard-count'] = (DR.s.vars['fish-discard-count'] || 0) + 1;
          if (root.DR && DR.emit) DR.emit('itemDestroyed', d, i, false);
        }
        gr.g.items.length = 0;
      }
    };
  }

  // Lưới của bảng trái: kho (DR.s.grids.STORAGE), cửa hàng (khoá trong DR.s.grids hoặc DR_GRIDS tạm), nhiệm vụ (QuestGridPanel.Show), khay
  function leftGrids(L) {
    const out = [];
    const mk = (key, g, cfgObj) => ({ key, g, st: stateOf(key), cfg: cfgObj || null, hints: null });
    if (!L) return out;
    if (L.kind === 'storage') { if (DR.s.grids.STORAGE) out.push(mk('STORAGE', DR.grid('STORAGE'), root.DR_GRIDS.Storage)); L.cur = 'STORAGE'; }
    else if (L.kind === 'tray') {
      const c = root.DR_GRIDS.StorageTray;
      out.push(mk('STORAGE_TRAY', G.create(c), c)); L.cur = 'STORAGE_TRAY';
    } else if (L.kind === 'quest' && L.quest) {
      const q = L.quest, c = root.DR_GRIDS[q.gridConfiguration];
      if (!c) throw new Error('grid config not found: ' + q.gridConfiguration);
      const key = q.gridKey && q.gridKey !== 'NONE' ? q.gridKey : 'QUEST_' + (q.asset || 'grid');
      let g;
      if (q.isSaved) {
        if (!DR.s.grids[key] || (q.createItemsIfEmpty && !DR.s.grids[key].items.length)) DR.s.grids[key] = { cfg: q.gridConfiguration, items: [], damage: [], extra: [] };
        g = DR.grid(key);
        if (q.presetGridMode === 'CREATE' && !g.items.length) fillPreset(g, q);
      } else { g = G.create(c); if (q.presetGridMode === 'CREATE') fillPreset(g, q); }
      const gr = mk(key, g, c);
      if (q.presetGridMode === 'SILHOUETTE' || q.presetGridMode === 'MYSTERY') gr.hints = (q.presetGrid && q.presetGrid.spatialItems) || [];
      out.push(gr); L.cur = key;
      L.title = L.title || q.titleString || 'Nộp đồ';
    } else if (L.tabs && L.tabs.length) {
      for (const t of L.tabs) {
        const g = t.grid || (DR.s.grids[t.key] ? DR.grid(t.key) : root.DR_GRIDS[t.key] ? G.create(root.DR_GRIDS[t.key]) : null);
        if (g) out.push(mk(t.key, g, root.DR_GRIDS[t.key]));
      }
      if (!L.cur || !out.some(g => g.key === L.cur)) L.cur = (L.tabs.find(t => !t.locked) || L.tabs[0]).key;
    }
    return out;
  }
  // QuestGridPanel.CreateGridWithConfig: PresetGridMode.CREATE chép presetGrid vào lưới (độ bền theo startingDurabilityProportion)
  function fillPreset(g, q) {
    for (const it of (q.presetGrid && q.presetGrid.spatialItems) || []) {
      const def = root.DR_ITEMS[it.id];
      if (!def) continue;
      const extra = {};
      if (q.createWithDurabilityValue && def.maxDurabilityDays) extra.dur = def.maxDurabilityDays * (q.startingDurabilityProportion == null ? 1 : q.startingDurabilityProportion);
      G.place(g, def, it.x, it.y, it.z || 0, extra);
    }
  }

  // ---------------------------------------------------------------- mở / đóng
  function open(opts) {
    if (!root.DR || !DR.s) return false;
    if (S) close(true);
    ensureDom();
    opts = opts || {};
    // tương thích: keys:['INVENTORY','STORAGE'] -> kho bên trái; holding: <inst> -> vừa bắt
    const keys = opts.keys && opts.keys.length ? opts.keys : null;
    const rightTabs = (opts.right && opts.right.tabs) || (keys ? keys.filter(k => k === 'INVENTORY') : ['INVENTORY']);
    let left = opts.left || null;
    if (!left && keys && keys.includes('STORAGE')) left = { kind: 'storage', title: opts.title };
    if (left && !left.kind) left.kind = left.quest ? 'quest' : left.tabs ? 'shop' : 'storage';
    let holding = opts.holding || null;
    if (holding && !holding.inst) holding = { inst: holding, src: 'harvest' };            // dạng cũ: instance trần
    const prevMode = DR.mode;
    // Player.CanMoveInstalledItems: cập bến (MarketDestinationUI.cs:113); lưới nhiệm vụ đặt lại theo allowEquipmentInstallation (QuestGridPanel.cs:329)
    const mode = opts.mode || (left && left.kind === 'quest' && left.quest ? (left.quest.allowEquipmentInstallation ? 'equip' : 'default') : prevMode === 'dock' ? 'equip' : 'default');
    const start = lastPtr || { x: root.innerWidth * 0.75, y: root.innerHeight * 0.5 };
    const handlers = [];
    if (left && left.handler) handlers.push(left.handler);
    if (opts.handler) handlers.push(opts.handler);
    if (left && left.kind === 'tray') handlers.push(trayHandler());
    S = {
      // r2shop: right.cur chọn tab mở sẵn
      right: { tabs: rightTabs.filter(k => DR.s.grids[k]), cur: (opts.right && opts.right.cur) || rightTabs[0] }, left, docked: !!opts.docked, mode, handlers,
      holding, onClose: opts.onClose, ptr: start, grids: [], held: null, changed: false, prevMode, openMode: prevMode, result: null,
      shown: false, hover: null, hold: null, prompts: [], motes: [], hasStorage: false,
      // w2cabin: tab CABIN chỉ khi mở khoang ở biển bằng Tab (không cập bến, không bảng trái, không do bên ngoài chọn tab, không có món vừa kiếm trên tay)
      cabin: !opts.docked && !left && !holding && prevMode === 'sail' && !(opts.right && opts.right.tabs) && !!(root.DR_BOOK && DR_BOOK.cabin)
    };
    if (!S.right.tabs.includes(S.right.cur)) S.right.cur = S.right.tabs[0] || null;
    if (S.cabin && opts.tab === 'CABIN') S.right.cur = 'CABIN';        // mở lại sau khi đóng Bản đồ / Sổ nhiệm vụ / Bách khoa (tab đang đứng)
    // r2deploy: PlayerTabbedPanel có tab lưới kéo khi đã lắp lưới; chỉ thêm khi người mở không tự chọn tab bên phải
    if (!(opts.right && opts.right.tabs) && S.right.tabs.includes('INVENTORY') && DR.s.grids.TRAWL_NET && !S.right.tabs.includes('TRAWL_NET')) S.right.tabs.push('TRAWL_NET');
    for (const k of S.right.tabs) S.grids.push({ key: k, g: DR.grid(k), st: stateOf(k), cfg: null, hints: null });
    for (const gr of leftGrids(left)) if (!S.grids.some(x => x.key === gr.key)) S.grids.push(gr);
    S.hasStorage = S.grids.some(g => g.key === 'STORAGE') || (left && left.kind === 'quest' && left.quest && left.quest.allowStorageAccess && !!DR.s.grids.STORAGE);
    if (left && left.kind === 'quest' && left.quest && left.quest.allowStorageAccess && !S.right.tabs.includes('STORAGE') && DR.s.grids.STORAGE) {
      S.right.tabs.push('STORAGE'); S.grids.push({ key: 'STORAGE', g: DR.grid('STORAGE'), st: 'IN_STORAGE', cfg: null, hints: null });
    }
    if (!S.docked && DR.mode === 'sail') S.changed = DR.setMode('cargo');
    if (holding) {
      const inst = holding.inst;
      inst.rot = inst.rot || 0;
      S.held = makeHeld(inst, holding.src || 'harvest', start);
      S.held.dragging = false;
    }
    host.classList.add('on');
    play('ui.grid.open');                                               // SlidePanel.openSFX "Generic Grid Open Sound"; không có tiếng đóng (C14)
    afterChange();
    render();
    // trượt vào: thêm lớp .on sau một khung để chạy transition (SlidePanel: 0,5 giây, OutExpo)
    requestAnimationFrame(() => { if (S) { S.shown = true; host.querySelectorAll('.cg-panel').forEach(p => p.classList.add('on')); } });
    return handle();
  }
  const handle = () => ({ close: () => close(), refresh: () => { if (S) { afterChange(); render(); } }, held: () => S && S.held ? S.held.inst : null, setLeft, hold });
  // r2fish: món mới lên con trỏ khi bảng đã mở (không mở lại bảng: mở lại sẽ đóng khay và chạy lại tiếng mở)
  function hold(h) {
    if (!S || !h || !h.inst || S.held) return false;
    S.holding = h;
    h.inst.rot = h.inst.rot || 0;
    S.held = makeHeld(h.inst, h.src || 'harvest', S.ptr);
    S.held.dragging = false;
    sfx('pick', S.held.def, S.held.st);                                // GridManager.ObjectPickedUp -> GridObjectAudio.OnItemPickedUp
    hideTip();
    render();
    startLoop();
    return true;
  }
  function setLeft(left) {
    if (!S) return;
    S.left = left || null;
    if (left && !left.kind) left.kind = left.quest ? 'quest' : left.tabs ? 'shop' : 'storage';
    S.grids = S.grids.filter(g => S.right.tabs.includes(g.key));
    S.handlers = S.handlers.filter(h => h.name !== 'tray' && !(h._left));
    if (left && left.handler) { left.handler._left = true; S.handlers.push(left.handler); }
    if (left && left.kind === 'tray') S.handlers.push(trayHandler());
    for (const gr of leftGrids(left)) if (!S.grids.some(x => x.key === gr.key)) S.grids.push(gr);
    S.hasStorage = S.grids.some(g => g.key === 'STORAGE');
    // r2fish: khay mở giữa phiên thì trượt xuống (ShowStorageTray: 0,75 s OutExpo), không hiện tức thì
    if (left && left.kind === 'tray' && S.shown) {
      S.entering = { 'cg-left': true };
      requestAnimationFrame(() => { if (!S || !S.entering) return; S.entering = null; host.querySelectorAll('.cg-left').forEach(p => { void p.offsetWidth; p.classList.add('on'); }); });
    }
    afterChange();
    render();
  }

  // r2shop: đổi chế độ lưới giữa phiên (RepairActionHandler.ToggleRepairMode); bỏ ô đang rê để prompt tính lại
  function setMode(m) { if (!S || !m) return; S.mode = m; S.hover = null; hideTip(); render(); }

  function close(force, extra) {
    if (!S) return false;
    // GridManager: không đóng được khi đang cầm đồ vừa kiếm / vừa mua / vừa đổi chỗ
    if (S.held && !hasHome(S.held) && !force) {
      play('ui.grid.error'); toast('Hãy đặt hoặc vứt món đang cầm trước khi đóng'); return false;
    }
    const s = S;
    if (s.held && hasHome(s.held)) { s.held = null; }                   // món đang cầm có chỗ cũ: vẫn nằm trong DR.s ở chỗ cũ
    for (const h of s.handlers) if (h.onClose) { try { h.onClose(); } catch (e) { console.warn('[cargo] handler onClose:', e.message); } }
    S = null;
    stopHoldSilent();
    host.classList.remove('on', 'docked', 'repair');
    held.style.display = 'none'; cursor.style.display = 'none'; ring.style.display = 'none'; ctl.style.display = 'none'; ctl.innerHTML = ''; hideTip(); hideActs();
    if (s.changed && DR.mode === 'cargo') DR.setMode(s.prevMode === 'cargo' ? 'sail' : s.prevMode);
    if (s.onClose) s.onClose(Object.assign({ holding: s.result, complete: !!(s.left && s.left.complete) }, extra || {}));
    return true;
  }
  function stopHoldSilent() { try { root.DRAudio && DRAudio.stopLoop('ui.hold.active'); } catch (e) { /* */ } }

  root.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (root.DRMinigame && DRMinigame.isOpen()) return;
    if (S) {
      const k = e.code;
      if (k === 'KeyZ') { if (!e.repeat) { refreshPrompts(); const p = promptFor('KeyZ'); if (p) startHold(p, 'key'); else if (S.held || (S.hover && S.hover.inst)) { play('ui.grid.error'); toast('Món này không vứt được'); } } }
      else if (k === 'Escape' || k === 'KeyX') {
        if (S.held && hasHome(S.held)) cancelHold();
        else if (S.left && S.left.kind === 'quest' && !S.docked) exitLeft();
        else if (!S.docked) close();
      } else if ((k === 'KeyQ' || k === 'KeyE') && qeTabs() && !S.hold) { if (!e.repeat) switchTab(null, k === 'KeyQ' ? -1 : 1); }   // PlayerTabbedPanel: Q / E đổi tab
      else if (k === 'Tab' || k === 'KeyI') { if (S.docked) { /* bảng câu giữ khoang mở */ } else if (S.held && !hasHome(S.held)) close(); else if (S.changed) close(); }
      else if (/^Key[A-Z]$/.test(k) && (refreshPrompts(), promptFor(k))) {   // r2shop: phím riêng của handler (F bán, R sửa hết, T chế độ sửa)
        if (!e.repeat) { const p = promptFor(k); if (p.hold > 0) { startHold(p, 'key'); if (S && S.hold) S.hold.key = k; } else runPrompt(p); }
      }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if (e.code === 'Tab' && root.DR && DR.s && DR.mode === 'sail' && !e.repeat) {   // w3msg: KeyI giờ mở Thư tín (OpenMessages, DredgeControlBindings.cs:371)
      e.preventDefault(); e.stopImmediatePropagation();
      open({ keys: ['INVENTORY'], title: 'Khoang thuyền' });
    }
  }, true);
  root.addEventListener('keyup', e => { if (S && S.hold && S.hold.how === 'key' && (e.code === 'KeyZ' || e.code === S.hold.key)) stopHold(); }, true);
  root.addEventListener('blur', () => stopHold());

  if (root.DR && DR.on) DR.on('mode', m => {
    if (!S) return;
    if (S.docked) { if (m !== S.openMode) close(true); return; }
    if (m !== 'cargo' && m !== 'dock' && S.changed) { S.changed = false; close(true); }
  });

  // ---------------------------------------------------------------- độ tươi (FreshnessCoroutine) — root gọi DRCargo.tickFreshness() mỗi khung
  let freshAt = null;
  function tickFreshness(dDays) {
    if (!root.DR || !DR.s) return null;
    if (dDays == null) { dDays = freshAt == null ? 0 : DR.s.time - freshAt; freshAt = DR.s.time; }
    if (!(dDays > 0)) return null;
    const out = { rotted: [], melted: [] };
    for (const key of ['INVENTORY', 'STORAGE']) {
      if (!DR.s.grids[key]) continue;
      const r = G.tickFreshness(cfg(), DR.grid(key), root.DR_ITEMS, dDays);
      out.rotted.push.apply(out.rotted, r.rotted); out.melted.push.apply(out.melted, r.melted);
      if (r.rotted.length || r.melted.length) DR.emit('cargo', key, null);
    }
    if (out.rotted.length) {
      if (root.DRHud && DRHud.toast) DRHud.toast('Một phần mẻ cá đã thối rữa.');   // notification.rot, màu CRITICAL
      if (S) render();
    }
    return out;
  }
  if (root.DR && DR.on) { DR.on('newgame', () => { freshAt = null; }); DR.on('load', () => { freshAt = null; }); }

  root.DRCargo = {
    open, close: () => close(), isOpen: () => !!S, held: () => S && S.held ? S.held.inst : null, setLeft, hold, tickFreshness, sfxFor,
    refresh: () => { if (S) { afterChange(); render(); } },
    _debug: () => S && {
      cs: S.M.cs, k: S.M.k, ptr: S.ptr, showStats: S.M.showStats, mode: S.mode, docked: S.docked, rightTab: S.right.cur, tabs: rightTabKeys(), leftKind: S.left && S.left.kind,
      held: S.held && { id: S.held.inst.id, rot: S.held.rot, src: S.held.src, st: S.held.st, dragging: S.held.dragging, angle: S.held.angle },
      hover: S.hover && { id: S.hover.inst && S.hover.inst.id, key: S.hover.gr.key, cell: [S.hover.cx, S.hover.cy] },
      tip: tip.classList.contains('on') ? tip.textContent : null, disc: !!S.hold, hold: S.hold && S.hold.p.id,
      prompts: (S.prompts || []).map(p => ({ id: p.id, bind: p.bind, hold: p.hold || 0, enabled: p.enabled !== false, label: promptLabel(p), area: p.area || 'tip' })),
      cand: S.cand && { state: S.cand.state, x: S.cand.rx, y: S.cand.ry, key: S.cand.gr.key },
      complete: !!(S.left && S.left.complete), motes: S.motes.reduce((n, m) => n + m.cells.reduce((k, c) => k + c.ps.length, 0), 0),
      grids: visibleGrids().map(gr => { const r = gr.el.getBoundingClientRect(); return { key: gr.key, st: gr.st, cols: gr.g.cols, rows: gr.g.rows, x: r.left, y: r.top, w: r.width, h: r.height, items: gr.g.items.map(i => ({ id: i.id, x: i.x, y: i.y, rot: i.rot })) }; })
    }
  };
})(window);
