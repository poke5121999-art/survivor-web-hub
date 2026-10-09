/*
 * Ụ tàu: màn "Upgrades" (UpgradeWindow) và việc áp nâng cấp vào thuyền (UpgradeManager).
 * Số đo, sprite, khoá chữ, màu và giá vật liệu đọc từ data/upgrade_ui.js (tools/upgrade_ui.py) + data/upgrades.js:
 *   - Cửa sổ: Scrim đen 0,88; Window 1680x820 giữa màn (FullPanel); Header 60 (Tab_Selected) + chữ upgrades.header.description 30;
 *     Title 300x80 nhô lên 35 (TitleBackground, "Upgrades" 49,65); Nodes: cột nút nhỏ 120x64 và nút "New Hull" 140x128,
 *     đường nối 4 px (sprite square). Vị trí cột/nút do HorizontalLayoutGroup của Nodes tính (spacing 30, MiddleCenter),
 *     BỎ QUA con đang tắt: bản cơ bản tắt hullTier5Content nên cả cây dồn vào giữa (UpgradeWindow.Show, UpgradeDestination.allowHullTier5Content).
 *   - Trạng thái nút (UpgradeNodeUI.RefreshUI): đã sở hữu POSITIVE, đủ điều kiện tiên quyết NEUTRAL, còn lại DISABLED.
 *     Đường nối PreLine/T*StartLine theo "điều kiện tiên quyết đủ", PostLine/nhánh phải theo "nút này đã sở hữu".
 *   - Tooltip (TooltipUI.ConstructUpgradeTooltip): tiêu đề + mô tả + "Cost:" + giá tiền + ô vật liệu "có/cần"; chưa sở hữu mới có giá.
 * Màu: DredgeColorTypeEnum không có bảng riêng, = GameConfigData.colors[SettingsSaveDataTemplate.color<T>] (tools/upgrade_ui.py).
 *
 *   DRUpgrade.open({ dest, onClose })   mở cửa sổ; dest = điểm đến (id để tra allowHullTier5Content)
 *   DRUpgrade.close()  isOpen()  owned(id)  list()  state(id)  cost(id)  have(item)
 *   DRUpgrade.applyUpgrade(id)          SU-03: đánh dấu đã sở hữu + áp vào thuyền (UpgradeManager.OnUpgradesChanged), KHÔNG trừ tiền
 *   DRUpgrade.purchase(id)              trừ tiền + vật liệu trong khoang rồi applyUpgrade (ĐƯỜNG NỐI, xem chú thích hàm)
 *   DRUpgrade.reapplyOwned()            ApplyOwnedSlotUpgrades: áp lại ô của nâng cấp ô đã có ở bậc hull hiện tại
 *   Sự kiện: DR.emit('upgrade', { id, kind: 'hull'|'slot', tier, hullTier }) = GameEvents.OnUpgradesChanged
 * Trạng thái lưu: DR.s.upgrades = mảng id đã sở hữu (SaveData.upgradeIdsOwned, khởi tạo lười vì state.js do root giữ),
 *   DR.s.vars['upgrade-bought'] (SaveData.UpgradeBought: Shipwright_DryDock_Root dùng để bỏ lời chào).
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  if (!document.querySelector('link[href*="upgrade.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = new URL('../css/upgrade.css' + ver, (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }
  const UI = root.DR_UPGRADE_UI, U = root.DR_UPGRADES, G = root.DRGrid;
  if (!UI || !U || !G) { console.warn('[upgrade] data/upgrade_ui.js, data/upgrades.js or js/grid.js missing'); return; }
  const COLOR = UI.colors;
  const MIN_KT = 0.62;                 // [ĐỀ XUẤT] hệ số nhỏ nhất của tooltip để chữ còn đọc được trên điện thoại (như cargo.js)
  const MAX_MIGRATE = 100;             // GridManager.maxMigrateAttempts
  const ROTS = [0, 90, 180, 270];
  const T = G.TYPE, SB = G.SUB;
  const STATE_COLOR = { positive: 'POSITIVE', neutral: 'NEUTRAL', disabled: 'DISABLED' };

  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const STR = k => (root.DR_STR && DR_STR[k]) || '';
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* tiếng là phần phụ */ } };
  const toast = t => { if (t && root.DRHud && DRHud.toast) DRHud.toast(t); };
  const artUrl = rel => 'url(' + new URL('../' + rel, (me && me.src) || location.href).href + ')';
  // Smart String của Unity Localization: {0}, {0:Space|Spaces} (số nhiều tiếng Anh: đúng 1 → dạng đầu)
  const fmt = (t, args) => String(t || '').replace(/\{(\d+)(?::([^}|]*)\|([^}]*))?\}/g, (m, i, one, many) =>
    one !== undefined ? (Number(args[+i]) === 1 ? one : many) : args[+i]);
  const n2 = v => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });   // ToString("n2")
  const money = v => '$' + n2(v);
  const rgba = c => c[3] >= 0.999 ? 'rgb(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ')'
    : 'rgba(' + c.slice(0, 3).map(v => Math.round(v * 255)).join(',') + ',' + c[3] + ')';

  // ================================================================ trạng thái nâng cấp (SaveData)
  const ownedIds = () => (DR.s.upgrades = DR.s.upgrades || []);
  const owned = id => !!(root.DR && DR.s) && ownedIds().includes(id);
  const prereqMet = u => (u.prerequisiteUpgrades || []).every(owned);
  const isHull = u => u.cls === 'HullUpgradeData';
  // UpgradeData.GetNewCellCount
  const newCells = u => isHull(u) ? u.newCellCount : (u.cellGroupConfigs || []).reduce((n, g) => n + g.cells.length, 0);
  function state(id) {
    const u = U[id];
    if (!u) return null;
    return owned(id) ? 'positive' : prereqMet(u) ? 'neutral' : 'disabled';      // UpgradeNodeUI.RefreshUI
  }
  const list = () => Object.keys(U);
  // Giá thật = completeConditions của QuestGridConfig (UpgradeData.GetItemCost); upgradeCost của data.py cũ ở tier-5-hull
  function cost(id) {
    const u = U[id], c = UI.costs && UI.costs[id];
    const items = c ? c.items.map(x => ({ item: x.item, count: x.count })) : (u.upgradeCost || []).map(x => ({ item: x.itemData, count: x.num }));
    return { money: u.monetaryCost, items };
  }
  // ĐƯỜNG NỐI [vòng 3]: bản gốc đếm vật liệu trong lưới nhiệm vụ đã lưu của nâng cấp (TooltipSectionUpgradeCost: uc.CountItems(grid)).
  // Vòng này chưa có lưới "Materials Required" nên đếm trong khoang (INVENTORY); khi có lưới, đổi hàm này sang đếm lưới đó.
  function have(item) {
    return DR.grid('INVENTORY').items.reduce((n, i) => n + (i.id === item ? 1 : 0), 0);
  }
  const titleOf = u => fmt(u.titleKey, isHull(u) ? [u.tier] : [newCells(u)]);                    // TooltipSectionHeader.Init(UpgradeData)
  const descOf = u => fmt(u.descriptionKey, isHull(u) ? [u.tier, newCells(u)] : [newCells(u)]);   // TooltipSectionDescription.Init(UpgradeData)

  // ================================================================ áp nâng cấp (UpgradeManager.OnUpgradesChanged)
  const shuffle = (a, rnd) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; } return b; };
  function put(g, inst, def, spot) {
    inst.x = spot.x; inst.y = spot.y; inst.rot = spot.rot;
    inst.cells = G.footprint(def, spot.x, spot.y, spot.rot);
    inst.uid = g.seq++;
    g.items.push(inst);
  }
  // GridManager.AddBulkItemInstancesToGrid: lần đầu xếp theo thứ tự với prioritizeRotation; vướng một món thì bỏ lần xếp, xáo thứ tự,
  // tắt prioritizeRotation, thử lại tới 100 lần với góc xuất phát ngẫu nhiên; vẫn không vừa thì từng món sang lưới dự phòng (Storage),
  // rồi kho tràn, rồi bán lấy tiền (món cuối cùng của bản gốc). res gom: moved (vào Storage), overflow, sold, tries.
  function addBulk(items, prio, dest, backup, res) {
    const rnd = DRUpgrade.rng;
    let order = items.slice(), tries = 0, ok = order.length === 0;
    while (!ok && tries < MAX_MIGRATE) {
      tries++;
      const added = [];
      let all = true;
      for (const inst of order) {
        const def = DR.item(inst.id);
        const spot = prio ? G.findSpot(dest, def, inst.rot || 0, true) : G.findSpot(dest, def, ROTS[Math.floor(rnd() * 4)], false);
        if (!spot) {
          all = false; prio = false;
          for (const a of added) G.remove(dest, a);
          order = shuffle(order, rnd);
          break;
        }
        put(dest, inst, def, spot); added.push(inst);
      }
      ok = all;
    }
    res.tries += tries;
    if (ok) return;
    const ovKey = DR.s.grids.OVERFLOW_STORAGE ? 'OVERFLOW_STORAGE' : DR.s.grids.OVERFLOW ? 'OVERFLOW' : null;
    for (const inst of order) {
      const def = DR.item(inst.id);
      let spot = G.findSpot(dest, def, inst.rot || 0, false);
      if (spot) { put(dest, inst, def, spot); continue; }
      spot = backup && G.findSpot(backup, def, inst.rot || 0, prio);
      if (spot) { put(backup, inst, def, spot); res.moved.push(inst); continue; }
      const og = ovKey && DR.grid(ovKey);
      spot = og && G.findSpot(og, def, inst.rot || 0, prio);
      if (spot) { put(og, inst, def, spot); res.overflow.push(inst); continue; }
      DR.addFunds(root.DRRules.sellPrice(root.DR_CONFIG, def, inst, 1, 1));
      res.sold.push(inst);
    }
  }

  function applyHull(u) {
    const old = DR.s.hullTier, cfgName = root.DR_CONFIG.hullTierGridConfigs[u.tier - 1];
    if (!cfgName) throw new Error('hull grid config not found for tier ' + u.tier);
    const items = DR.grid('INVENTORY').items.slice();
    const sub = i => G.subOf(DR.item(i.id)), typ = i => G.typeOf(DR.item(i.id)), size = i => DR.item(i.id).dims.length;
    const big = (a, b) => size(b) - size(a);     // OrderByDescending(dimensions.Count): sort ổn định
    const equip = i => typ(i) === T.EQUIPMENT;
    const dredge = items.filter(i => equip(i) && sub(i) === SB.DREDGE).sort(big);
    const gear = items.filter(i => equip(i) && sub(i) !== SB.DREDGE && sub(i) !== SB.POT).sort(big);
    const general = items.filter(i => !equip(i) && sub(i) !== SB.FISH).sort(big);
    const pots = items.filter(i => equip(i) && sub(i) === SB.POT).sort(big);
    const fish = items.filter(i => !equip(i) && sub(i) === SB.FISH).sort(big);
    const res = { from: old, to: u.tier, cfg: cfgName, moved: [], overflow: [], sold: [], tries: 0 };
    // Inventory.Init(gridConfig, clear: true): lưới mới, vết hỏng mất (bản gốc không cho nâng thân khi còn ô hỏng)
    DR.resetGrid('INVENTORY', cfgName, []);
    const inv = DR.grid('INVENTORY'), storage = DR.s.grids.STORAGE ? DR.grid('STORAGE') : null;
    for (const group of [dredge, gear, general, pots, fish]) addBulk(group, true, inv, storage, res);   // dredge → thiết bị → đồ thường → bẫy → cá
    DR.s.hullTier = u.tier;                                                        // SaveData.HullTier; ngưỡng hỏng = DRRules.damageThreshold(hullTier)
    if (root.DRBoat && DRBoat.setTier) DRBoat.setTier(u.tier);                     // Player.AdjustHullToTier: chọn mô hình BoatN
    // PlayerEngineAudio.OnUpgradesChanged: một AudioSource đổi clip; boat.js gọi boat.engine.<bậc> theo bậc mới, nên tắt vòng của bậc cũ
    if (root.DRAudio && DRAudio.stopLoop && old !== u.tier) DRAudio.stopLoop('boat.engine.' + old);
    reapplyOwned();
    if (res.overflow.length) toast(STR('notification.upgrade.items-sent-to-overflow'));
    return res;
  }

  // SerializableGrid.ApplyCellGroupConfig
  function applyGroups(g, groups) {
    for (const grp of groups) for (const c of grp.cells) {
      const x = Array.isArray(c) ? c[0] : c.x, y = Array.isArray(c) ? c[1] : c.y;
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue;                   // ô ngoài lưới hiện tại (nâng cấp của bậc thân khác): bỏ qua, không tràn sang hàng kế
      const cell = g.cells[y * g.cols + x];
      if (!cell) continue;
      cell.type = G.mask(grp.itemType, T); cell.sub = G.mask(grp.itemSubtype, SB);
      cell.hidden = !!grp.isHidden; cell.immune = !!grp.damageImmune; cell.only = null;
    }
  }
  const applySlot = u => { applyGroups(DR.grid('INVENTORY'), u.cellGroupConfigs || []); return { cells: newCells(u) }; };
  // UpgradeManager.ApplyOwnedSlotUpgrades: nâng cấp ô đã có của đúng bậc hull hiện tại (lưới dựng lại khi nạp ván hoặc nâng thân)
  function reapplyOwned() {
    if (!root.DR || !DR.s || !DR.s.grids || !DR.s.grids.INVENTORY) return 0;
    let n = 0;
    for (const id of ownedIds()) {
      const u = U[id];
      if (u && !isHull(u) && u.tier === DR.s.hullTier) { applyGroups(DR.grid('INVENTORY'), u.cellGroupConfigs || []); n++; }
    }
    return n;
  }

  function applyUpgrade(id) {
    const u = U[id];
    if (!u) throw new Error('upgrade not found: ' + id);
    if (!owned(id)) ownedIds().push(id);                                           // SaveData.SetUpgradeOwned
    const res = isHull(u) ? applyHull(u) : applySlot(u);
    DR.emit('cargo', 'INVENTORY', null);
    if (res.moved && res.moved.length) DR.emit('cargo', 'STORAGE', null);
    DR.emit('upgrade', { id, kind: isHull(u) ? 'hull' : 'slot', tier: u.tier, hullTier: DR.s.hullTier });   // GameEvents.TriggerUpgradesChanged
    return res;
  }

  // ================================================================ mua nâng cấp
  // ĐƯỜNG NỐI [vòng 3]: bản gốc bấm nút mở bảng "Materials Required" (UpgradeGridPanel), kéo vật liệu vào lưới đã lưu rồi bấm
  // "Purchase Upgrade [$X]" (UpgradeGridPanel.OnPurchaseButtonClicked → UpgradeManager.AddUpgrade(free: false)). Vòng này mua thẳng:
  // kiểm vật liệu trong khoang + tiền, trừ cả hai, rồi applyUpgrade. Vòng sau thay thân hàm bằng lưới vật liệu trên đường nối cargo
  // (giữ thứ tự kiểm: thân hỏng, kho tràn, tiền; vật liệu do lưới báo COMPLETE; have() đếm trong lưới đó).
  function purchase(id) {
    const u = U[id], fail = (why, msg) => { play('ui.error'); toast(msg); return { ok: false, why }; };
    if (!u) return fail('unknown');
    if (owned(id)) return fail('owned');
    if (!prereqMet(u)) return fail('locked');
    if (isHull(u) && DR.grid('INVENTORY').damage.length > 0) return fail('hull-damaged', STR('notification.upgrade-hull-damaged'));
    const of = DR.s.grids.OVERFLOW_STORAGE || DR.s.grids.OVERFLOW;
    if (isHull(u) && of && of.items.length > 0) return fail('overflow', STR('notification.upgrade.items-in-overflow'));
    const c = cost(id);
    if (DR.s.funds < c.money) return fail('funds', 'Không đủ tiền cho nâng cấp này');
    const miss = c.items.filter(x => have(x.item) < x.count);
    if (miss.length) return fail('materials', 'Thiếu vật liệu trong khoang: ' + miss.map(x => (x.count - have(x.item)) + ' ' + DR.item(x.item).name).join(', '));
    const inv = DR.grid('INVENTORY');
    for (const x of c.items) for (let k = 0; k < x.count; k++) G.remove(inv, inv.items.find(i => i.id === x.item));
    DR.addFunds(-c.money);                                                          // UpgradeManager.AddUpgrade: AddFunds(-MonetaryCost)
    const res = applyUpgrade(id);
    DR.s.vars['upgrade-bought'] = true;                                            // SaveData.UpgradeBought
    play('ui.upgrade.complete');                                                   // UpgradeGridPanel.upgradeCompleteSFX
    toast(titleOf(u) + ' — ' + STR('notification.upgrade-added.subtitle'));        // BannerUI.ShowUpgrade: tên + "Additional slots configured."
    DR.save();
    return { ok: true, result: res };
  }

  // ================================================================ giao diện
  let host = null, S = null, tipEl = null, cardEl = null, FM = null;
  const px = n => 'calc(var(--s)*' + (Math.round(n * 1000) / 1000) + 'px)';
  const lin = (pct, n) => !pct ? px(n) : !n ? pct + '%' : 'calc(' + (Math.round(pct * 1000) / 1000) + '% + var(--s)*' + (Math.round(n * 1000) / 1000) + 'px)';
  // RectTransform → CSS tuyệt đối: trái = ax0·P + ap − pivot·w ; trên = (1−ay1)·P − ap_y − (1−pivot_y)·h (Unity y hướng lên)
  function cssRect(rt) {
    const [ax0, ay0] = rt.amin, [ax1, ay1] = rt.amax, [pvx, pvy] = rt.piv, [apx, apy] = rt.ap, [w, h] = rt.sd;
    return { left: lin(ax0 * 100, apx - pvx * w), top: lin((1 - ay1) * 100, -apy - (1 - pvy) * h), width: lin((ax1 - ax0) * 100, w), height: lin((ay1 - ay0) * 100, h) };
  }
  // kích thước theo đơn vị canvas khi biết (neo điểm: sizeDelta; neo kéo: cần cỡ của cha)
  function sizeOf(rt, p) {
    const d = i => rt.amax[i] === rt.amin[i] ? rt.sd[i] : p ? (rt.amax[i] - rt.amin[i]) * p[i] + rt.sd[i] : null;
    const w = d(0), h = d(1);
    return w == null || h == null ? null : [w, h];
  }
  const active = (n, allow) => !!n.on && !(n.t5 && !allow);

  // HorizontalLayoutGroup (UnityEngine.UI): con không bị điều khiển cỡ (ChildControl* = 0), bỏ con đang tắt, căn theo TextAnchor
  function hLayout(lg, kids, pw, ph) {
    const [pl, pr, pt, pb] = lg.pad || [0, 0, 0, 0];
    const ax = (lg.al % 3) * 0.5, ay = Math.floor(lg.al / 3) * 0.5;
    const total = kids.reduce((s, k) => s + k.rt.sd[0], 0) + lg.sp * Math.max(0, kids.length - 1);
    let x = pl + (pw - pl - pr - total) * ax;
    const inner = ph - pt - pb;
    return kids.map(k => {
      const w = k.rt.sd[0], h = k.rt.sd[1];
      const req = lg.fh ? Math.max(h, Math.min(inner, ph)) : h;                    // Clamp(innerSize, min, flexible>0 ? size : preferred)
      const r = { x, y: pt + (ph - (req + pt + pb)) * ay + (req - h) * ay, w, h };
      x += w + lg.sp;
      return r;
    });
  }

  // Unity Image.GetAdjustedBorders: viền (ppu/100) co lại khi khung nhỏ hơn tổng viền
  function borders(sp, w, h) {
    const k = 100 / sp.ppu;
    let [l, b, r, t] = sp.b.map(v => v * k);
    if (w != null && l + r > w && l + r) { const q = w / (l + r); l *= q; r *= q; }
    if (h != null && b + t > h && b + t) { const q = h / (b + t); b *= q; t *= q; }
    return { l, b, r, t, slice: [sp.b[3], sp.b[2], sp.b[1], sp.b[0]] };
  }

  // Image → phần tử .up-bg. dyn = màu đặt lúc chạy (Image.color nhân với sprite): nền màu + ::before nhân ảnh.
  function paintImage(bg, n, size, dyn) {
    const im = n.img, sp = im.s && UI.sprites[im.s];
    if (!sp || im.s === 'square') { bg.classList.add('solid'); bg.style.setProperty('--c', rgba(im.c)); return; }
    const url = artUrl(sp.f);
    bg.style.setProperty('--sp', url);
    if (im.t === 1) {                                  // Sliced
      const b = borders(sp, size && size[0], size && size[1]);
      const bw = px(b.t) + ' ' + px(b.r) + ' ' + px(b.b) + ' ' + px(b.l);
      bg.style.setProperty('--bw', bw);
      bg.style.setProperty('--bi', url + ' ' + b.slice.join(' ') + (im.fc ? ' fill' : '') + ' / ' + bw + ' stretch');
      bg.classList.add(dyn ? 'mul' : 'sl');
    } else {
      bg.classList.add(dyn ? 'mulm' : 'si');
      if (im.pa) bg.classList.add('pa');
    }
    if (dyn) bg.style.setProperty('--c', rgba(im.c));
  }

  // chữ TMP: khung theo RectTransform; đường cơ sở đặt theo chế độ căn dọc (Capline/Middle/Geometry) bằng số đo của font gốc
  function buildText(box, n, over) {
    const tx = n.tx;
    box.classList.add('up-t');
    const s = el('span', 'up-tx', box);
    const i = el('i', '', s, over != null ? over : (tx.k && STR(tx.k)) || tx.t);
    s.style.color = rgba(tx.c);
    s.style.textAlign = tx.h === 1 ? 'left' : tx.h === 4 ? 'right' : 'center';
    box._tx = { n, i, s };
  }
  let _B = null, _cv = null;
  const FONT = '"Front Page Neue","Signika",sans-serif';
  function baseline() {          // đường cơ sở cách đỉnh dòng bao nhiêu em khi line-height = 1 (đo một lần, sau khi font nạp xong)
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
    let below;                                                                       // đường cơ sở nằm dưới tâm khung bao nhiêu em
    if (tx.v === 8192) below = FM.cap / pt / 2;                                      // Capline: giữa đường cơ sở và đường mũ chữ
    else if (tx.v === 512) below = (FM.ascent + FM.descent) / pt / 2;                // Middle: giữa đường lên và đường xuống (descent âm)
    else if (tx.v === 4096) { const m = measure(i.textContent); below = (m.asc - m.desc) / 2; }   // Geometry: giữa hình học thật của chữ
    else below = (FM.ascent + FM.descent) / pt / 2;                                  // Top/Bottom/Baseline không có trong cây này: coi như Middle
    let size = tx.s;
    s.style.fontSize = px(size);
    if (tx.au) {                                                                     // enableAutoSizing: thu nhỏ tới khi vừa chiều rộng khung (tối thiểu mn)
      const cw = box.clientWidth / S.scale, tw = i.getBoundingClientRect().width / S.scale;
      if (cw > 0 && tw > cw) size = Math.max(tx.mn, Math.floor(size * cw / tw * 100) / 100);
      s.style.fontSize = px(size);
    }
    box._tx.size = size;                                                             // cỡ chữ đơn vị canvas (style.fontSize là calc(), không đọc ngược được)
    s.style.top = 'calc(50% + var(--s)*' + ((below - baseline()) * size) + 'px)';
  }

  function ensureDom() {
    if (host) return;
    host = el('div', 'dr-ui', document.body); host.id = 'dr-upg';
    host.addEventListener('contextmenu', e => e.preventDefault());
    host.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    root.addEventListener('resize', () => { if (S) fit(); });
    root.addEventListener('pointermove', e => { if (S) { S.ptr = { x: e.clientX, y: e.clientY }; if (S.hover) placeTip(); } });
    FM = Object.values(UI.font)[0];
  }

  const scale = () => Math.min(root.innerHeight / UI.canvas.h, root.innerWidth / UI.canvas.w);
  function fit() {
    S.scale = scale();
    host.style.setProperty('--s', S.scale.toFixed(5));
    host.style.setProperty('--kt', Math.max(S.scale, MIN_KT).toFixed(4));
    host.style.setProperty('--kc', Math.max(S.scale * 1.15, 0.7).toFixed(4));
    for (const b of S.texts) placeText(b);
    if (S.hover) placeTip();
  }

  // dựng cây: mọi GameObject đang bật thành một .up-n; con của Nodes xếp bằng hLayout
  function build() {
    S.nodes = []; S.byPath = {}; S.texts = [];
    host.innerHTML = '';
    host.style.setProperty('--pbi', artUrl(UI.sprites.PopupBackground.f) + ' 64 fill');
    // phần tử đổi màu lúc chạy: nền nút, đường nối, hình thoi Tier0 (UpgradeNodeUI.linesToColor*)
    const dyn = new Set();
    for (const nd of UI.nodes) { nd.pre.forEach(p => dyn.add(p)); nd.post.forEach(p => dyn.add(p)); }
    const mk = (n, parent, rel, psize, pos, upParent) => {
      const box = el('div', 'up-n', parent);
      box.dataset.n = n.n;
      if (rel != null) { box.dataset.p = rel; S.byPath[rel] = box; }
      if (pos) Object.assign(box.style, { left: px(pos.x), top: px(pos.y), width: px(pos.w), height: px(pos.h) });
      else Object.assign(box.style, cssRect(n.rt));
      const size = pos ? [pos.w, pos.h] : sizeOf(n.rt, psize);
      const up = n.up && U[n.up];
      if (n.img) {
        const bg = el('i', 'up-bg', box);
        paintImage(bg, n, size, !!up || dyn.has(rel));
        box._bg = bg;
        if (n.n === 'Icon' && upParent) bg.style.setProperty('--sp', artUrl(upParent.sprite));   // UpgradeNodeUI.RefreshUI: iconImage.sprite = upgradeData.sprite
      }
      if (n.tx) {
        buildText(box, n, n.n === 'TitleText' && upParent ? '+' + newCells(upParent) : null);    // titleText.text = "+N"
        S.texts.push(box);
      }
      if (up) { box.classList.add('up-nd'); box.dataset.id = n.up; }
      if (/Line\d?$/.test(n.n) || n.n === 'StartingNode') box.classList.add('np');
      if (n.n === 'CoverScrim') box.classList.add('up-cover');      // UpgradeWindow.coverScrimCanvasGroup: alpha 0 cho tới khi mở bảng vật liệu
      const kids = (n.k || []).filter(k => active(k, S.allowT5));
      const lay = n.lg && n.lg.t === 'H' && size ? hLayout(n.lg, kids, size[0], size[1]) : null;
      kids.forEach((k, idx) => {
        const kr = rel == null ? (k.n === 'Window' ? '' : null) : (rel ? rel + '/' + k.n : k.n);
        mk(k, box, kr, size, lay ? lay[idx] : null, up || upParent);
      });
      return box;
    };
    const rootBox = mk(UI.tree, host, null, null, null, null);
    rootBox.classList.add('up-root'); rootBox.style.cssText = 'position:absolute;inset:0';
    // nút → đối tượng đã dựng
    for (const nd of UI.nodes) {
      const box = S.byPath[nd.path];
      if (!box) continue;
      const e = { id: nd.id, u: U[nd.id], box, bg: box._bg, pre: nd.pre.map(p => S.byPath[p]).filter(Boolean), post: nd.post.map(p => S.byPath[p]).filter(Boolean) };
      S.nodes.push(e);
      box.addEventListener('pointerenter', ev => onEnter(e, ev));
      box.addEventListener('pointerleave', () => onLeave(e));
      box.addEventListener('click', () => onClick(e));
    }
    // phím nhắc "Back" (PopupWindow.backAction)
    const back = el('button', 'up-back', host);
    el('span', '', back, STR('prompt.back') || 'Back'); el('b', '', back, 'X');
    back.onclick = () => goBack();
    // thẻ chi tiết + tooltip (nằm trên CoverScrim của cây)
    cardEl = el('div', 'up-card', host);
    tipEl = el('div', 'up-tip', host);
    paint();
  }

  // UpgradeNodeUI.RefreshUI cho cả cây
  function setColor(box, col) { if (box && box._bg) box._bg.style.setProperty('--c', col); }
  function paint() {
    for (const e of S.nodes) {
      const st = state(e.id), pre = prereqMet(e.u), own = owned(e.id);
      e.box.dataset.state = st;
      setColor(e.box, COLOR[STATE_COLOR[st]]);
      for (const b of e.pre) setColor(b, COLOR[pre ? 'POSITIVE' : 'DISABLED']);
      for (const b of e.post) setColor(b, COLOR[own ? 'POSITIVE' : 'DISABLED']);
    }
  }

  // ---------------------------------------------------------------- tooltip và thẻ chi tiết
  function itemIcon(id) { const d = DR.item(id); return d.itemTypeIcon || d.sprite; }
  // mode: 'tip' (tooltip khi rê) hoặc 'card' (thẻ xác nhận mua)
  function fillCard(box, u, mode) {
    const own = owned(u.id), clickable = state(u.id) === 'neutral';
    box.innerHTML = '';
    if (mode === 'card') el('div', 'title', box, STR('quest-grid.upgrades'));            // "Materials Required"
    const hd = el('div', 'hd', box);
    const ic = el('img', 'ic', hd); ic.src = new URL('../' + u.sprite, (me && me.src) || location.href).href; ic.alt = '';
    el('span', 'nm', hd, titleOf(u)); el('i', 'ln', hd);
    el('p', 'ds', box, descOf(u));
    if (own) return;                                   // ConstructUpgradeTooltip: đã sở hữu thì không có mục giá
    const c = cost(u.id), enough = DR.s.funds >= c.money;
    const cb = el('div', 'cost', box);
    el('div', 'lb', cb, STR('tooltip.upgrade-cost-label'));
    const mv = el('div', 'mv', cb, money(c.money));
    mv.style.color = enough ? COLOR.NEUTRAL : COLOR.NEGATIVE;
    const ci = el('div', 'ci', cb);
    for (const x of c.items) {                         // TooltipUpgradeCostIcon.Init: "có/cần", NEUTRAL khi đủ, NEGATIVE khi thiếu
      const h = have(x.item), cell = el('div', 'c', ci);
      cell.dataset.item = x.item; cell.dataset.have = h; cell.dataset.need = x.count;
      const col = h >= x.count ? COLOR.NEUTRAL : COLOR.NEGATIVE;
      const im = el('i', 'im', cell); im.style.setProperty('--sp', artUrl(itemIcon(x.item))); im.style.setProperty('--c', col);
      el('b', '', cell, h + '/' + x.count).style.setProperty('--c', col);
    }
    if (mode === 'tip') {
      if (clickable) {                                 // enterAction "prompt.show-details" chỉ có khi nút bấm được (UpgradeWindow.OnEntryHovered)
        const pr = el('div', 'prompts', box), p = el('div', 'pr', pr);
        el('b', '', p, 'Click'); el('span', '', p, STR('prompt.show-details'));
      }
      return;
    }
    const btns = el('div', 'btns', box);
    const ok = enough && c.items.every(x => have(x.item) >= x.count);
    const buy = el('button', 'up-btn', btns); buy.dataset.act = 'purchase'; buy.disabled = !ok;
    const label = fmt(STR('button.purchase-upgrade'), ['\u0000']).split('\u0000');   // "Purchase Upgrade [$X]" với giá đỏ khi thiếu tiền
    buy.append(label[0]);
    el('span', enough ? '' : 'short', buy, money(c.money));
    buy.append(label[1] || '');
    buy.onclick = () => {
      const r = purchase(u.id);
      if (r.ok) { closeCard(); paint(); }
      else refreshCard();
    };
    const bk = el('button', 'up-btn dark', btns, STR('prompt.back')); bk.dataset.act = 'back';
    bk.onclick = () => { play('ui.button.back'); closeCard(); };
  }

  function onEnter(e) {
    if (!S || S.stage !== 'tree') return;
    play('ui.button.select');
    S.hover = e;
    fillCard(tipEl, e.u, 'tip');
    tipEl.classList.add('on');
    placeTip();
  }
  function onLeave(e) { if (S && S.hover === e) hideTip(); }
  function hideTip() { if (S) S.hover = null; if (tipEl) tipEl.classList.remove('on'); }
  // TooltipUI.LateUpdate: con trỏ ở nửa trái → tooltip bên phải con trỏ, ngược lại bên trái; kẹp trong màn
  function placeTip() {
    if (!S || !S.hover) return;
    const W = root.innerWidth, H = root.innerHeight, w = tipEl.offsetWidth, h = tipEl.offsetHeight, gap = 25 * Math.max(S.scale, MIN_KT);
    let x = S.ptr.x < W / 2 ? S.ptr.x + gap : S.ptr.x - gap - w;
    x = Math.max(0, Math.min(W - w, x));
    const y = Math.max(0, Math.min(H - h, S.ptr.y - gap));
    tipEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  function onClick(e) {
    if (!S || S.stage !== 'tree') return;
    if (state(e.id) !== 'neutral') return;             // UpgradeNodeUI.OnClick: chỉ khi đủ điều kiện tiên quyết và chưa sở hữu
    play('ui.button.submit');
    hideTip();
    openCard(e);
  }
  // ĐƯỜNG NỐI [vòng 3]: thẻ này thay tạm bảng UpgradeGridPanel ("Materials Required" + nút "Purchase Upgrade [$X]"); bảng thật
  // mở ở bên trái cùng khoang (ToggleInventoryAdHoc) và lớp CoverScrim phủ cửa sổ 0,35 giây.
  function openCard(e) {
    S.stage = 'card'; S.sel = e;
    e.box.classList.add('sel');
    fillCard(cardEl, e.u, 'card');
    host.classList.add('cover');
  }
  function refreshCard() { if (S && S.stage === 'card') fillCard(cardEl, S.sel.u, 'card'); }
  function closeCard() {
    if (!S) return;
    if (S.sel) S.sel.box.classList.remove('sel');
    S.stage = 'tree'; S.sel = null;
    host.classList.remove('cover');
  }
  function goBack() {
    if (!S) return;
    if (S.stage === 'card') { play('ui.button.back'); closeCard(); return; }
    play('ui.button.back');
    close();
  }

  // ---------------------------------------------------------------- mở / đóng
  function open(opts) {
    if (!root.DR || !DR.s) return false;
    if (S) close(true);
    ensureDom();
    const dest = opts && opts.dest;
    S = { dest, onClose: opts && opts.onClose, allowT5: !!(dest && UI.destinations[dest.id] && UI.destinations[dest.id].allowHullTier5Content),
      stage: 'tree', hover: null, sel: null, scale: scale(), ptr: { x: root.innerWidth / 2, y: root.innerHeight / 2 }, texts: [] };
    host.classList.add('on');
    host.classList.remove('cover', 'show');
    document.body.classList.add('up-open');            // UpgradeWindow.Show: TriggerTopUIToggleRequest(false) ẩn giao diện phía trên
    build();
    fit();
    // phông Front Page Neue nạp muộn thì đo lại đường cơ sở (cửa sổ đang mờ dần nên không thấy nhảy)
    if (document.fonts && document.fonts.load) document.fonts.load('50px "Front Page Neue"').then(() => { _B = null; if (S) fit(); }).catch(() => {});
    requestAnimationFrame(() => { if (S) host.classList.add('show'); });
    return true;
  }
  function close(silent) {
    if (!S) return false;
    const s = S; S = null;
    host.classList.remove('on', 'show', 'cover');
    document.body.classList.remove('up-open');
    hideTipRaw();
    if (!silent && s.onClose) s.onClose();
    return true;
  }
  function hideTipRaw() { if (tipEl) tipEl.classList.remove('on'); }

  root.addEventListener('keydown', e => {
    if (!S) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.code;
    if (k === 'Escape' || k === 'KeyX') { if (!e.repeat) goBack(); }
    else if (k === 'Tab' || k === 'KeyI' || k === 'Space' || k === 'KeyL' || k === 'KeyJ' || k === 'KeyM') { /* không rò xuống khoang/tương tác khi cửa sổ mở */ }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  const DRUpgrade = { rng: Math.random, open, close: () => close(), isOpen: () => !!S, owned, list, state, cost, have, applyUpgrade, purchase, reapplyOwned, titleOf, descOf, newCells };
  DRUpgrade._debug = () => {
    if (!S) return null;
    const r = b => { const q = b.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
    const nodes = {};
    for (const e of S.nodes) nodes[e.id] = Object.assign(r(e.box), { state: e.box.dataset.state, color: e.bg && getComputedStyle(e.bg).getPropertyValue('--c').trim(), text: (e.box.querySelector('.up-tx') || {}).textContent });
    const lines = {};                                                                // chỉ đường nối của cây (Header/HeaderBottomLine là viền trang trí)
    for (const p of Object.keys(S.byPath)) { const b = S.byPath[p]; if (/^Nodes\//.test(p) && (/Line\d?$/.test(p) || /StartingNode$/.test(p))) lines[p] = Object.assign(r(b), { color: b._bg && b._bg.style.getPropertyValue('--c') }); }
    return { stage: S.stage, scale: S.scale, allowT5: S.allowT5, win: r(S.byPath[''] || host), nodes, lines,
      tip: tipEl.classList.contains('on') ? tipEl.textContent : null, texts: S.texts.map(b => ({ n: b.dataset.p, t: b._tx.i.textContent, size: b._tx.size })) };
  };
  root.DRUpgrade = DRUpgrade;

  if (root.DR && DR.on) {
    DR.on('load', () => reapplyOwned());                                           // SaveData.Load → ApplyOwnedSlotUpgrades
    DR.on('mode', m => { if (S && (m === 'sail' || m === 'title' || m === 'over' || m === 'harvest')) close(true); });
    const again = () => { if (S) { paint(); if (S.hover) fillCard(tipEl, S.hover.u, 'tip'); refreshCard(); } };
    DR.on('funds', again); DR.on('cargo', again); DR.on('upgrade', again);
  }
})(window);
