/*
 * Trạng thái ván chơi, sổ lưu và máy trạng thái chế độ.
 *
 * Một ván là một object thuần (DR.s) để lưu thẳng ra localStorage:
 *   time      số thực: phần nguyên = ngày, phần lẻ = giờ trong ngày (0 = nửa đêm), như TimeController gốc
 *   funds, sanity (1 = tỉnh táo), hullTier, worldPhase
 *   boat      { x, z, yaw, vx, vz, w }  toạ độ three.js (đã đổi dấu Z so với Unity)
 *   dock      id bến đang neo (DockData.id) hoặc null
 *   grids     { INVENTORY: {cfg, items, damage}, STORAGE: ... }  cfg = tên GridConfiguration trong DR_GRIDS
 *   spots     { <POI id>: { stock, lastUpdate, special } }
 *   vars      các biến kiểu SaveData gốc: "gm-repayments", "aberration-spawn-modifier", "rod-fish-caught"...
 *   caught    { <fish id>: số con } (caughtFishCounts)
 *   abilities { lights: true, ... }; lightsOn
 *
 * Sổ lưu theo ô (SaveManager.cs: activeSaveSlot, GetFilePath(slot)): DR.slot = ô đang dùng (mặc định 0).
 *   DR.saveKey(slot)  khoá localStorage của ô; ô 0 giữ khoá cũ 'dredge.save.v1' để sổ đã có vẫn đọc được, ô n > 0 là 'dredge.save.v1.s<n>'.
 *   DR.save(slot) / DR.load(slot) / DR.hasSave(slot) / DR.wipe(slot)  bỏ slot = DR.slot.
 *   DR.s.forbidSave   SaveData.ForbidSave (DoFinalePreparations đặt true, DredgeDialogueRunner.cs:795): DR.save() trả false, không ghi
 *                     (SaveManager.cs:186). Cờ không bao giờ vào sổ vì từ lúc bật thì chẳng lần lưu nào chạy nữa.
 *
 * Chế độ (DR.mode) là máy trạng thái, mỗi lúc đúng một:
 *   title → sail ⇄ harvest ; sail ⇄ dock ; sail|dock ⇄ cargo ; * → over
 * Đổi chế độ chỉ qua DR.setMode để mọi module nghe được sự kiện 'mode'.
 */
(function (root) {
  'use strict';
  const G = root.DRGrid;
  const KEY = 'dredge.save.v1';
  const MODES = {
    title: ['sail', 'dock'],
    sail: ['harvest', 'dock', 'cargo', 'over', 'title'],
    harvest: ['sail', 'over'],
    dock: ['sail', 'cargo', 'title'],
    cargo: ['sail', 'dock'],
    over: ['title', 'dock']
  };

  const bus = {};
  const DR = root.DR = root.DR || {};
  DR.on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); };
  DR.emit = (ev, a, b) => { for (const fn of bus[ev] || []) fn(a, b); };

  DR.mode = 'title';
  DR.setMode = function (next, info) {
    if (next === DR.mode) return true;
    if (!(MODES[DR.mode] || []).includes(next)) {
      console.warn('[DR] mode change refused:', DR.mode, '→', next);
      return false;
    }
    const prev = DR.mode;
    DR.mode = next;
    DR.emit('mode', next, Object.assign({ prev }, info || {}));
    return true;
  };

  // Lưới runtime = DRGrid dựng từ cấu hình + đồ đã lưu. Cấu hình không vào sổ lưu.
  function gridCfg(name) {
    const c = root.DR_GRIDS && root.DR_GRIDS[name];
    if (!c) throw new Error('grid config not found: ' + name);
    return c;
  }
  DR.grid = function (key) {
    const s = DR.s, rec = s.grids[key];
    if (!rec) return null;
    if (!rec._rt) {
      const g = G.create(gridCfg(rec.cfg), rec.extra);
      g.damage = rec.damage;
      for (const it of rec.items) {
        it.cells = G.footprint(DR.item(it.id), it.x, it.y, it.rot);
        g.items.push(it);
        g.seq = Math.max(g.seq, (it.uid || 0) + 1);
      }
      rec.items = g.items;
      Object.defineProperty(rec, '_rt', { value: g, enumerable: false, writable: true });
    }
    return rec._rt;
  };
  DR.resetGrid = function (key, cfgName, extra) {
    const old = DR.s.grids[key];
    DR.s.grids[key] = { cfg: cfgName, items: [], damage: [], extra: extra || [] };
    return { old: old ? old.items : [], grid: DR.grid(key) };
  };

  DR.item = id => {
    const d = root.DR_ITEMS[id];
    if (!d) throw new Error('item not found: ' + id);
    return d;
  };

  DR.newGame = function () {
    const tpl = root.DR_CONFIG.saveDataTemplate;
    const cfg = root.DR_CONFIG;
    DR.s = {
      v: 1,
      time: tpl.floatVariables.time,
      funds: tpl.decimalVariables.funds || 0,
      sanity: tpl.floatVariables.sanity,
      hullTier: tpl.intVariables['hull-tier'],
      worldPhase: tpl.intVariables['world-phase'],
      boat: { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, w: 0 },
      dock: tpl.dockId,
      grids: {},
      spots: {},
      vars: {
        'aberration-spawn-modifier': tpl.decimalVariables['aberration-spawn-modifier'] || 0,
        'gm-debt': cfg.greaterMarrowDebt, 'gm-repayments': 0,
        'rod-fish-caught': 0, 'fish-before-next-trophy-notch': 0
      },
      caught: {},
      abilities: Object.fromEntries((tpl.unlockedAbilities || []).map(a => [a, true])),
      lightsOn: false,
      weather: tpl.stringVariables.weather || 'fine'
    };
    const hull = cfg.hullTierGridConfigs[DR.s.hullTier - 1];
    DR.s.grids.INVENTORY = { cfg: hull, items: [], damage: [], extra: [] };
    DR.s.grids.STORAGE = { cfg: 'Storage', items: [], damage: [], extra: [] };
    const inv = DR.grid('INVENTORY');
    for (const it of tpl.grids.INVENTORY.spatialItems) {
      G.place(inv, DR.item(it.id), it.x, it.y, it.z, it.durability ? { dur: it.durability } : null);
    }
    DR.emit('newgame');
    return DR.s;
  };

  // W0: ô lưu (SaveManager.activeSaveSlot); ô 0 = khoá cũ
  DR.slot = 0;
  DR.saveKey = slot => { const n = slot == null ? DR.slot : slot | 0; return n === 0 ? KEY : KEY + '.s' + n; };
  DR.save = function (slot) {
    if (!DR.s) return false;
    if (DR.s.forbidSave) { console.info('[DR] save skipped: forbidSave is set (finale voyage)'); return false; }   // SaveManager.cs:186
    try { localStorage.setItem(DR.saveKey(slot), JSON.stringify(DR.s, (k, v) => k === 'cells' || k === 'forbidSave' ? undefined : v)); return true; }
    catch (e) { console.warn('[DR] save failed:', e.message); return false; }
  };
  DR.hasSave = slot => { try { return !!localStorage.getItem(DR.saveKey(slot)); } catch (e) { return false; } };
  DR.load = function (slot) {
    let raw = null;
    try { raw = localStorage.getItem(DR.saveKey(slot)); } catch (e) { /* private mode */ }
    if (!raw) return null;
    try { DR.s = JSON.parse(raw); }
    catch (e) { console.warn('[DR] save unreadable, starting fresh:', e.message); return null; }
    if (DR.s.v !== 1) { console.warn('[DR] save version mismatch:', DR.s.v); return null; }
    DR.emit('load');
    return DR.s;
  };
  DR.wipe = slot => { try { localStorage.removeItem(DR.saveKey(slot)); } catch (e) { /* ignore */ } };

  // Thêm đồ vào khoang theo FindPositionForObject; trả về instance hoặc null khi đầy.
  DR.give = function (id, extra, key) {
    const g = DR.grid(key || 'INVENTORY');
    const inst = G.autoPlace(g, DR.item(id), extra);
    if (inst) DR.emit('cargo', key || 'INVENTORY', inst);
    return inst;
  };
  DR.addFunds = function (v) {
    DR.s.funds = Math.round((DR.s.funds + v) * 100) / 100;
    DR.emit('funds', DR.s.funds, v);
  };
})(typeof window !== 'undefined' ? window : globalThis);
