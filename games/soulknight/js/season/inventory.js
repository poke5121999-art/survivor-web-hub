// Season Mode: vật phẩm, balô, kho, rương an toàn, trọng lượng, độ no, độ bền, rương/hộp chứa, chế tạo, xây dựng
// (SK.SEASON.inv, SK.SEASON.items, SK.SEASON.loot). Số liệu từ data/season-items.js (sinh từ bảng Luban 8.6.0).
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;
  const SS = SK.SEASON = SK.SEASON || {};
  const DATA = window.SK_SEASON_ITEMS || { items: {}, order: [], atlas: null, maps: {}, tables: {} };
  const T = SS.T = DATA.tables || {};
  const KEY = 'sk.season.v2';          // v1 (bản ước lượng) có id vật phẩm khác: bắt đầu lại

  // ---------------------------------------------------------------- trang atlas riêng (icon vật phẩm + escape_ui_texture)
  if (DATA.atlas && SK.A && SK.A.pages) {
    const pi = SK.A.pages.length;
    SK.A.pages.push(DATA.atlas.src);
    for (const k in DATA.atlas.f) SK.A.f[k] = [pi].concat(DATA.atlas.f[k]);
    SS.atlasPage = pi;
  }

  // ---------------------------------------------------------------- vật phẩm
  const items = SS.items = {};
  for (const id of DATA.order) items[id] = Object.assign({ id }, DATA.items[id]);
  SS.itemOrder = DATA.order.slice();
  // Vũ khí khởi đầu của nhân vật (không phải vật phẩm Monkia): chỉ để cầm khi tay không.
  SS.itemDef = function (id) {
    if (items[id]) return items[id];
    if (typeof id === 'string' && id.startsWith('w_')) {
      const wid = id.slice(2), d = DS.weapons[wid];
      if (!d) return null;
      items[id] = { id, weaponId: wid, name: d.name, nameEn: d.nameEn || d.name, type: 'weapon', icon: d.sprite, rarityIdx: 0,
        weight: 0, stack: 1, value: 0, starter: true, desc: 'Vũ khí khởi đầu của nhân vật, không bán được, không mất khi chết.' };
      return items[id];
    }
    return null;
  };
  const def = id => SS.itemDef(id);
  SS.itemByWeapon = function (wid) {
    for (const id of SS.itemOrder) if (items[id].weaponId === wid) return id;
    return def('w_' + wid) ? 'w_' + wid : null;
  };
  const RARITY = ['white', 'green', 'blue', 'purple', 'orange', 'red'];
  SS.rarityName = i => RARITY[i] || 'white';
  const L = SS.L = (k, d) => (T.loc && T.loc[k]) || d || k;

  // ---------------------------------------------------------------- luật [ĐO: T.rules lấy từ EscapePlayerCombatConfig + hằng IL2CPP]
  const R = T.rules || {};
  const RULES = SS.RULES = {
    baseSlots: R.bagSlots || 15, baseKg: R.kg || 40, secureSlots: R.secureSlots || 1, amuletSlots: 4,
    hungerMax: R.hungerMax || 100, hungerPerSec: R.hungerPerSec || 0.14, starvePerSec: R.starvePerSec || 0.5,
    tiers: R.tiers || [0.25, 0.75, 1, 1.2], tierSpeed: R.tierSpeed || [1.1, 1, 0.7, 0.5, 0],
    speedBase: R.speedBase || 6.8, speedOut: R.speedOut || 5.5,
    dodgeCd: R.dodgeCd || 5, dodgeInv: R.dodgeInv || 0.2,
    weaponDurSec: R.weaponDurSec || 2, buyRate: R.buyRate || 2, repairLoss: R.repairLoss || 0.3, repairCost: R.repairCost || 0.8,
    reveal: R.reveal || [0.5, 0.8, 1.2, 1.8, 2.2, 2.5], warehouse: T.warehouse || [64]
  };

  // ---------------------------------------------------------------- trạng thái
  const BUILD0 = {};
  for (const b of T.buildings || []) BUILD0[b.id] = b.lv0;
  function fresh() {
    return {
      v: 2,
      equip: { backpack: null, armor: null, weapon1: null, weapon2: null, amulets: [null, null, null, null] },
      backpack: new Array(RULES.baseSlots).fill(null),
      secure: null,
      warehouse: new Array(RULES.warehouse[0]).fill(null),
      build: Object.assign({}, BUILD0),
      training: [],
      coins: 0,
      hunger: RULES.hungerMax,
      quick: [null, null, null],
      stats: { kills: 0, extracts: 0, deaths: 0, runs: 0 },
      quests: null,
      nodes: [],
      bridges: {},
      deathBox: null,
      hero: null,
      starter: false
    };
  }

  const inv = SS.inv = { state: fresh(), buffs: {} };
  let S = inv.state;

  inv.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (_) { return false; }
  };
  inv.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { raw = null; }
    let st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (_) { st = null; }
    const f = fresh();
    if (st && st.v === 2) {
      for (const k in f) if (st[k] == null) st[k] = f[k];
      st.equip = Object.assign(f.equip, st.equip);
      st.build = Object.assign(f.build, st.build);
      if (!Array.isArray(st.equip.amulets)) st.equip.amulets = f.equip.amulets;
    } else st = f;
    S = inv.state = st;
    // bộ khởi đầu = rương esc_chest_start_supply [ĐO: Chim Ưng Sa Mạc bền 103 + Bình Máu Nhỏ + Bình Năng Lượng Nhỏ + 1 đồ ăn]
    if (!S.starter) {
      S.starter = true;
      for (const st2 of SS.loot('start_supply')) placeStack(st2);
    }
    resizeBackpack();
    resizeWarehouse();
    return S;
  };
  inv.reset = function () { S = inv.state = fresh(); inv.buffs = {}; inv.load(); inv.save(); return S; };
  inv.node = k => S.nodes.indexOf(k) >= 0;
  inv.addNode = k => { if (!inv.node(k)) { S.nodes.push(k); changed(); } };

  // ---------------------------------------------------------------- nâng cấp Cơ sở huấn luyện [ĐO escape_tbescapeupgradeblueprintconfig]
  inv.grow = function (key) {
    let v = 0;
    for (const u of T.training || []) if (u.key === key && S.training.indexOf(u.id) >= 0) v += u.value;
    return v;
  };

  // ---------------------------------------------------------------- sức chứa / trọng lượng
  const round2 = v => Math.round(v * 100) / 100;
  inv.slots = () => RULES.baseSlots + ((S.equip.backpack && def(S.equip.backpack.id).slots) || 0) + inv.grow('bag_capacity');
  inv.capacity = function () {
    let kg = RULES.baseKg + ((S.equip.backpack && def(S.equip.backpack.id).kg) || 0) + inv.grow('weight');
    if (inv.buffs.kg) kg += inv.buffs.kg.v;
    return kg;
  };
  inv.amuletOpen = () => 1 + inv.grow('talisman_slots');
  const stackKg = s => s ? (def(s.id) ? def(s.id).weight * s.n : 0) : 0;
  inv.weight = function () {
    let w = 0;
    for (const s of S.backpack) w += stackKg(s);
    const e = S.equip;
    w += stackKg(e.backpack) + stackKg(e.armor) + stackKg(e.weapon1) + stackKg(e.weapon2) + stackKg(S.secure);
    for (const a of e.amulets) w += stackKg(a);
    return round2(w);
  };
  // [ĐO EscapePlayerCombatConfig.GetCarryWeightLevel] tỉ lệ >= 1.2 / 1.0 / 0.75 / 0.25 -> cấp 4/3/2/1
  inv.tier = function () {
    const r = inv.weight() / inv.capacity(), th = RULES.tiers;
    const i = r >= th[3] ? 4 : r >= th[2] ? 3 : r >= th[1] ? 2 : r >= th[0] ? 1 : 0;
    const speed = Math.max(0, Math.min(1.2, RULES.tierSpeed[i]));
    // [ĐO EscapeInventoryRuntime.GetHungerConsumeWeightFactor] = 2 - min(hệ số tốc, 1)
    return { i, pct: r * 100, speed, hunger: 2 - Math.min(speed, 1) };
  };

  function resizeBackpack() {
    const n = inv.slots();
    while (S.backpack.length < n) S.backpack.push(null);
    if (S.backpack.length > n) {
      const tail = S.backpack.splice(n).filter(Boolean);
      for (const t of tail) { const i = S.backpack.indexOf(null); if (i >= 0) S.backpack[i] = t; else putWarehouseOrLose(t); }
    }
  }
  function whSlots() { return RULES.warehouse[Math.max(0, Math.min(RULES.warehouse.length, S.build.Warehouse || 1) - 1)] || 64; }
  function resizeWarehouse() { while (S.warehouse.length < whSlots()) S.warehouse.push(null); }
  function putWarehouseOrLose(st) { const i = S.warehouse.indexOf(null); if (i >= 0) S.warehouse[i] = st; }
  inv.whSlots = whSlots;

  // ---------------------------------------------------------------- thêm / bớt
  function makeStack(id, n, dur) {
    const d = def(id), s = { id, n };
    if (d && d.dur) { s.max = d.dur; s.dur = dur != null ? Math.min(dur, d.dur) : d.dur; }   // [ĐO EscapeRuntimeItem.NormalizeDurability: kẹp về tối đa]
    return s;
  }
  inv.makeStack = makeStack;
  function addTo(list, id, n, dur) {
    const d = def(id); if (!d) return n;
    const cap = d.stack || 1;
    if (cap > 1) for (const s of list) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < cap) { const k = Math.min(cap - s.n, n); s.n += k; n -= k; }
    }
    for (let i = 0; i < list.length && n > 0; i++) {
      if (!list[i]) { const k = Math.min(cap, n); list[i] = makeStack(id, k, dur); n -= k; }
    }
    return n;
  }
  function addStackTo(list, st) {
    const d = def(st.id); if (!d) return false;
    if ((d.stack || 1) > 1) { const left = addTo(list, st.id, st.n); if (!left) return true; st.n = left; }
    const i = list.indexOf(null);
    if (i < 0) return false;
    list[i] = st;
    return true;
  }
  // Đặt một chồng: ô trang bị trống hợp -> balô -> kho (nếu ở căn cứ). Trả true nếu đặt hết.
  function placeStack(st, noWarehouse) {
    const d = def(st.id); if (!d) return false;
    if (d.type === 'currency') { S.coins += st.n; changed(); return true; }
    const e = S.equip;
    if (d.type === 'weapon' && (!e.weapon1 || !e.weapon2)) { e[!e.weapon1 ? 'weapon1' : 'weapon2'] = st; changed(); return true; }
    if (d.type === 'armor' && !e.armor) { e.armor = st; changed(); return true; }
    if (d.type === 'backpack' && !e.backpack) { e.backpack = st; resizeBackpack(); changed(); return true; }
    if (addStackTo(S.backpack, st)) { autoQuick(st.id); changed(); return true; }
    if (!noWarehouse && addStackTo(S.warehouse, st)) { changed(); return true; }
    changed();
    return false;
  }
  inv.placeStack = placeStack;
  function autoQuick(id) {
    const d = def(id);
    if (d && (d.type === 'potion' || d.type === 'food') && S.quick.indexOf(id) < 0) { const q = S.quick.indexOf(null); if (q >= 0) S.quick[q] = id; }
  }
  inv.add = function (id, n, dur) {
    n = n == null ? 1 : n;
    const d = def(id); if (!d || n <= 0) return n;
    if (d.type === 'currency') { S.coins += n; changed(); return 0; }
    let left = n;
    while (left > 0) {
      const k = Math.min(left, d.stack || 1), st = makeStack(id, k, dur);
      if (!placeStack(st, true)) break;
      left -= k;
    }
    changed();
    return left;
  };
  inv.addTo = function (where, id, n) {
    const left = addTo(where === 'warehouse' ? S.warehouse : S.backpack, id, n == null ? 1 : n);
    changed(); return left;
  };
  // Đếm: balô + trang bị + rương an toàn (+ kho khi where='all')
  inv.count = function (id, where) {
    if (id === 'iron_coin') return S.coins;
    const lists = where === 'warehouse' ? [S.warehouse] : where === 'all' ? [S.backpack, S.warehouse] : [S.backpack];
    let c = 0;
    for (const l of lists) for (const s of l) if (s && s.id === id) c += s.n;
    if (where !== 'warehouse') {
      const e = S.equip;
      for (const s of [e.backpack, e.armor, e.weapon1, e.weapon2, S.secure].concat(e.amulets)) if (s && s.id === id) c += s.n;
    }
    return c;
  };
  inv.has = (id, n, where) => inv.count(id, where || 'all') >= (n == null ? 1 : n);
  inv.remove = function (id, n, where) {
    n = n == null ? 1 : n;
    if (id === 'iron_coin') { if (S.coins < n) return false; S.coins -= n; changed(); return true; }
    if (!inv.has(id, n, where)) return false;
    const takeFrom = list => {
      for (let i = list.length - 1; i >= 0 && n > 0; i--) {
        const s = list[i];
        if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) list[i] = null; }
      }
    };
    takeFrom(S.backpack);
    if (where === 'all' || where === 'warehouse') takeFrom(S.warehouse);
    if (n > 0 && S.secure && S.secure.id === id) { const k = Math.min(S.secure.n, n); S.secure.n -= k; n -= k; if (!S.secure.n) S.secure = null; }
    const e = S.equip;
    for (const k of ['weapon2', 'weapon1', 'armor', 'backpack']) if (n > 0 && e[k] && e[k].id === id) { e[k] = null; n--; }
    resizeBackpack();
    changed();
    return true;
  };

  // ---------------------------------------------------------------- ô (địa chỉ chung cho kéo-thả)
  // ref: {c:'bag'|'wh'|'secure'|'equip'|'box', i?, k?}; equip k: backpack|armor|weapon1|weapon2|amulet0..3; box = hộp chứa đang mở
  inv.box = null;       // {name, slots:[stack|null], seen:[giây đã lục], kind}
  function get(ref) {
    if (ref.c === 'bag') return S.backpack[ref.i];
    if (ref.c === 'wh') return S.warehouse[ref.i];
    if (ref.c === 'secure') return S.secure;
    if (ref.c === 'box') return inv.box && inv.boxVisible(ref.i) ? inv.box.slots[ref.i] : null;
    if (ref.c === 'equip') return ref.k.startsWith('amulet') ? S.equip.amulets[+ref.k.slice(6)] : S.equip[ref.k];
    return null;
  }
  function set(ref, v) {
    if (ref.c === 'bag') S.backpack[ref.i] = v;
    else if (ref.c === 'wh') S.warehouse[ref.i] = v;
    else if (ref.c === 'secure') S.secure = v;
    else if (ref.c === 'box') { if (inv.box) inv.box.slots[ref.i] = v; }
    else if (ref.c === 'equip') { if (ref.k.startsWith('amulet')) S.equip.amulets[+ref.k.slice(6)] = v; else S.equip[ref.k] = v; }
  }
  inv.get = get;
  function accepts(ref, st) {
    if (!st) return null;
    const d = def(st.id);
    if (ref.c === 'box') return inv.box && inv.box.kind === 'temp' ? null : 'Không bỏ đồ vào rương này';
    if (ref.c === 'secure' || ref.c === 'wh') return d.starter ? 'Vũ khí khởi đầu không cất được' : null;
    if (ref.c !== 'equip') return null;
    const k = ref.k;
    if (k.startsWith('amulet')) {
      if (+k.slice(6) >= inv.amuletOpen()) return 'Ô bùa chưa mở (nâng cấp ở Cơ sở huấn luyện)';
      return d.type === 'amulet' ? null : 'Chỉ đeo được Bùa Hộ Mệnh';
    }
    if (k === 'weapon1' || k === 'weapon2') return d.type === 'weapon' ? null : 'Chỉ đặt được vũ khí';
    if (k === 'armor') return d.type === 'armor' ? null : 'Chỉ mặc được giáp';
    if (k === 'backpack') return d.type === 'backpack' ? null : 'Chỉ đeo được balô';
    return 'Không đặt được';
  }
  inv.accepts = accepts;
  inv.move = function (from, to) {
    if (from.c === to.c && from.i === to.i && from.k === to.k) return null;
    if ((from.c === 'wh' || to.c === 'wh') && !inv.atWarehouse) return 'Phải đứng ở Kho mới lấy/cất được';
    const a = get(from), b = get(to);
    if (!a) return null;
    if (to.c === 'box' && inv.box && !inv.boxVisible(to.i)) return 'Chưa lục xong';
    const why = accepts(to, a) || (b ? accepts(from, b) : null);
    if (why) return why;
    if (b && b.id === a.id && (def(a.id).stack || 1) > 1) {
      const cap = def(a.id).stack, k = Math.min(cap - b.n, a.n);
      if (k <= 0) { set(from, b); set(to, a); } else { b.n += k; a.n -= k; if (!a.n) set(from, null); }
    } else { set(from, b || null); set(to, a); }
    if ((from.c === 'equip' && from.k === 'backpack') || (to.c === 'equip' && to.k === 'backpack')) {
      const need = inv.slots(), used = S.backpack.filter(Boolean).length;
      if (used > need) { set(to, b || null); set(from, a); return 'Balô đang chứa quá nhiều đồ'; }
      compactBackpack(need);
      resizeBackpack();
    }
    if (from.c === 'box' || to.c === 'box') SK.emit('seasonBoxChanged', SK.G, inv.box);
    changed();
    return null;
  };
  function compactBackpack(n) {
    const tail = S.backpack.slice(n).filter(Boolean);
    for (let i = n; i < S.backpack.length; i++) S.backpack[i] = null;
    for (const t of tail) { const i = S.backpack.indexOf(null); if (i >= 0 && i < n) S.backpack[i] = t; }
  }
  inv.quickMove = function (ref) {
    const st = get(ref); if (!st) return null;
    const d = def(st.id);
    if (ref.c === 'box') {
      const e = S.equip;
      const k = d.type === 'weapon' && (!e.weapon1 || !e.weapon2) ? (!e.weapon1 ? 'weapon1' : 'weapon2')
        : d.type === 'armor' && !e.armor ? 'armor' : d.type === 'backpack' && !e.backpack ? 'backpack' : null;
      if (k) return inv.move(ref, { c: 'equip', k });
      if ((d.stack || 1) > 1) { const left = addTo(S.backpack, st.id, st.n); if (left < st.n) { if (left) st.n = left; else set(ref, null); autoQuick(st.id); changed(); SK.emit('seasonBoxChanged', SK.G, inv.box); return left ? 'Balô đã đầy' : null; } }
      const f = firstFree('bag');
      return f ? inv.move(ref, f) : 'Balô đã đầy';
    }
    if (ref.c === 'bag') {
      if (inv.atWarehouse) return firstFree('wh') ? inv.move(ref, firstFree('wh')) : 'Kho đã đầy';
      if (inv.box && inv.box.kind === 'temp') { const i = inv.box.slots.indexOf(null); return i >= 0 ? inv.move(ref, { c: 'box', i }) : 'Rương đầy'; }
      const k = d.type === 'weapon' ? (!S.equip.weapon1 ? 'weapon1' : !S.equip.weapon2 ? 'weapon2' : 'weapon1')
        : d.type === 'armor' ? 'armor' : d.type === 'backpack' ? 'backpack'
          : d.type === 'amulet' ? 'amulet' + Math.max(0, S.equip.amulets.slice(0, inv.amuletOpen()).indexOf(null)) : null;
      return k ? inv.move(ref, { c: 'equip', k }) : 'Món này không đeo được';
    }
    const f = firstFree('bag');
    return f ? inv.move(ref, f) : 'Balô đã đầy';
  };
  function firstFree(c) {
    const l = c === 'wh' ? S.warehouse : S.backpack, i = l.indexOf(null);
    return i < 0 ? null : { c, i };
  }
  inv.firstFree = firstFree;
  inv.drop = function (ref) {
    const st = get(ref); if (!st) return null;
    if (def(st.id).starter) return null;
    set(ref, null);
    if (ref.c === 'equip' && ref.k === 'backpack') resizeBackpack();
    changed();
    SK.emit('seasonDrop', SK.G, st);   // world tạo Rương Tạm Thời dưới chân
    return st;
  };
  const TYPE_ORDER = ['weapon', 'armor', 'backpack', 'amulet', 'potion', 'food', 'treasure_map', 'affix', 'valuable', 'material', 'quest'];
  inv.sort = function (where) {
    const list = where === 'wh' ? S.warehouse : S.backpack;
    const all = list.filter(Boolean), merged = [];
    for (const s of all) {
      const d = def(s.id), cap = d.stack || 1;
      let n = s.n;
      if (cap > 1) for (const m of merged) if (m.id === s.id && m.n < cap && n > 0) { const k = Math.min(cap - m.n, n); m.n += k; n -= k; }
      if (n > 0) merged.push(Object.assign({}, s, { n }));
    }
    merged.sort((a, b) => {
      const da = def(a.id), db = def(b.id);
      return (TYPE_ORDER.indexOf(da.type) - TYPE_ORDER.indexOf(db.type)) || (db.rarityIdx - da.rarityIdx) ||
        (SS.itemOrder.indexOf(a.id) - SS.itemOrder.indexOf(b.id)) || (b.n - a.n);
    });
    for (let i = 0; i < list.length; i++) list[i] = merged[i] || null;
    changed();
  };
  inv.storeAll = function () {
    if (!inv.atWarehouse) return 'Phải đứng ở Kho mới cất được';
    let moved = 0;
    for (let i = 0; i < S.backpack.length; i++) {
      const s = S.backpack[i]; if (!s) continue;
      if (addStackTo(S.warehouse, s)) { S.backpack[i] = null; moved++; }
    }
    changed();
    return moved ? null : 'Không có gì để cất';
  };

  // ---------------------------------------------------------------- hộp chứa (rương, rương quái, rương tử vong)
  // Lục rương: mỗi món hiện ra sau một khoảng theo độ hiếm [ĐO EscapePlayerCombatConfig.itemRevealDurationsByRarity].
  inv.openBox = function (box) {
    if (!box.seen) box.seen = box.slots.map(() => 0);
    inv.box = box;
    return box;
  };
  inv.closeBox = function () { inv.box = null; };
  inv.revealTime = st => st ? RULES.reveal[Math.min(RULES.reveal.length - 1, def(st.id).rarityIdx || 0)] : 0;
  inv.boxVisible = function (i) {
    const b = inv.box; if (!b) return false;
    if (b.kind === 'temp' || b.kind === 'death') return true;
    return (b.seen[i] || 0) >= inv.revealTime(b.slots[i]);
  };
  // Lục lần lượt từng ô có đồ (chỉ ô đầu chưa hiện chạy đồng hồ, như game gốc).
  inv.tickBox = function (dt) {
    const b = inv.box; if (!b || b.kind === 'temp' || b.kind === 'death') return;
    for (let i = 0; i < b.slots.length; i++) {
      if (!b.slots[i]) continue;
      const need = inv.revealTime(b.slots[i]);
      if ((b.seen[i] || 0) >= need) continue;
      b.seen[i] = (b.seen[i] || 0) + dt;
      return;
    }
  };
  inv.takeAll = function () {
    const b = inv.box; if (!b) return 'Không có rương';
    let got = 0, full = false;
    for (let i = 0; i < b.slots.length; i++) {
      if (!b.slots[i] || !inv.boxVisible(i)) continue;
      if (inv.quickMove({ c: 'box', i })) full = true; else got++;
    }
    return full ? 'Balô đã đầy' : got ? null : 'Chưa có gì để lấy';
  };

  // ---------------------------------------------------------------- bảng rơi [ĐO escape_tbescapechestconfig + escape_tbescapelootentryconfig]
  // Mỗi bể rút DrawCountMin..Max lần; mỗi lần chọn một dòng theo trọng số Probability (dòng __NO_DROP__ = không ra gì).
  function drawPool(pid) {
    const pool = (T.pools || {})[pid];
    if (!pool || !pool.length) return null;
    let tot = 0;
    for (const e of pool) tot += e[1];
    let r = SK.rand() * tot;
    for (const e of pool) { r -= e[1]; if (r <= 0) return e; }
    return pool[pool.length - 1];
  }
  SS.loot = function (chestId, o) {
    const out = [];
    const cfg = (T.chests || {})[chestId];
    if (!cfg) { SK.warnOnce('chest' + chestId, 'chest config missing: ' + chestId); return out; }
    for (const [pid, a, b] of cfg) {
      const n = SK.randi(a, b);
      for (let i = 0; i < n; i++) {
        const e = drawPool(pid);
        if (!e || e[0] === '__NO_DROP__' || !def(e[0])) continue;
        const cnt = SK.randi(e[2], e[3]);
        const dur = e.length > 5 ? SK.randi(e[4], e[5]) : null;
        const d = def(e[0]);
        if ((d.stack || 1) > 1) {
          const same = out.find(s => s.id === e[0] && s.n < d.stack);
          if (same) { same.n = Math.min(d.stack, same.n + cnt); continue; }
        }
        out.push(makeStack(e[0], Math.min(cnt, d.stack || 1), dur));
      }
    }
    if (o && o.weapon) {
      // Rương quái chứa đúng vũ khí con khỉ cầm [WIKI Monster crate]; độ bền 50-75% như bể weapon_lv1 [ĐOÁN]
      const d = def(o.weapon);
      if (d && d.dur) out.unshift(makeStack(o.weapon, 1, Math.round(d.dur * SK.randf(0.5, 0.75))));
    }
    return out;
  };

  // ---------------------------------------------------------------- dùng đồ tiêu hao
  inv.inBase = function () {
    const w = SS.world;
    if (w && typeof w.inBase === 'function') return !!w.inBase();
    return false;
  };
  inv.usable = id => { const d = def(id); return !!d && (d.type === 'potion' || d.type === 'food' || d.type === 'treasure_map'); };
  inv.using = null;    // {id, t, need}: đang dùng (thời gian dùng [ĐO Params[1]])
  inv.use = function (G, id) {
    const d = def(id);
    if (!d || !inv.usable(id)) return 'Món này không dùng được';
    if (inv.inBase()) return 'Không dùng đồ tiêu hao trong căn cứ';
    if (inv.count(id) < 1) return 'Hết ' + d.name;
    const p = G && G.player;
    if (!p || p.st === 'dead') return 'Không dùng được lúc này';
    if (inv.using) return 'Đang dùng ' + def(inv.using.id).name;
    if (d.type === 'treasure_map') {
      if (!SS.world || !SS.world.revealTreasure) return 'Chưa dùng được';
      const why = SS.world.revealTreasure(G, id);
      if (why) return why;
      inv.remove(id, 1);
      SK.emit('seasonUse', G, id);
      return null;
    }
    inv.using = { id, t: 0, need: d.useTime || 0 };
    if (!inv.using.need) finishUse(G);
    return null;
  };
  function finishUse(G) {
    const u = inv.using; inv.using = null;
    if (!u) return;
    const d = def(u.id), p = G.player;
    if (!inv.remove(u.id, 1)) return;
    const e = d.effect || {};
    if (e.hp > 0) { p.hp = Math.min(p.hpMax, p.hp + e.hp); SK.num(G, p.x, p.y - 26, '+' + e.hp, '#ff6b6b'); }
    if (e.hp < 0) selfDamage(G, -e.hp);
    if (e.energy) { p.energy = Math.min(p.energyMax, p.energy + e.energy); SK.num(G, p.x + 8, p.y - 20, '+' + e.energy, '#6ab8ff'); }
    if (e.satiety) S.hunger = Math.min(RULES.hungerMax + inv.grow('hunger'), S.hunger + e.satiety);
    if (e.armor) p.armor = Math.min(p.armorMax, p.armor + e.armor);
    const dur = e.time || 60;
    if (e.kg) inv.buffs.kg = { v: e.kg, t: dur };
    if (e.speed) inv.buffs.speed = { v: e.speed, t: dur };
    for (const k of ['poison', 'fire', 'ice']) if (e[k]) inv.buffs['immune_' + k] = { v: 1, t: dur };
    SK.emit('seasonUse', G, u.id);
    changed();
  }
  inv.useQuick = function (G, i) {
    const id = S.quick[i];
    if (!id) return 'Ô tiêu hao trống';
    return inv.use(G, id);
  };

  // Sát thương đói/que cay: bỏ qua giáp như game gốc [ĐOÁN]
  function selfDamage(G, n) {
    const p = G.player; if (!p || p.st === 'dead' || p.god) return;
    if (p.hp > n) {
      p.hp -= n; p.flash = 0.1; G.hurtT = Math.max(G.hurtT || 0, 0.25);
      SK.num(G, p.x, p.y - 26, n, '#ff4a4a');
      SK.emit('playerHurt', G, p, n);
    } else { p.armor = 0; p.invulT = 0; p.hp = 1; SK.hurtPlayer(G, 1); }
  }
  inv.selfDamage = selfDamage;

  // ---------------------------------------------------------------- người chơi <-> kho đồ
  const wOf = s => s && def(s.id) ? def(s.id).weaponId : null;
  function weaponIds() { return [S.equip.weapon1, S.equip.weapon2].map(wOf); }
  function heroOf(p) { return DS.heroes[p.hero] || p.h; }
  // [ĐO EscapeGameModeProcess.OnCharacterAttrSetup] máu tối đa = max_hp + 2 x MaxArmor + nâng cấp HP; giáp chỉ từ áo giáp
  inv.applyPlayer = function (p, full) {
    const h = heroOf(p);
    p.hpMax = Math.max(1, h.hp + 2 * (h.armor || 0) + inv.grow('health'));
    if (full || p.hp > p.hpMax) p.hp = p.hpMax;
    const a = S.equip.armor, ad = a && def(a.id);
    p.armorMax = ad ? ad.armor : 0;
    p.armor = full ? Math.min(p.armorMax, a ? a.dur : 0) : Math.min(p.armor, p.armorMax);
    syncWeaponsToPlayer(p);
    track.player = p; track.armor = p.armor;
  };
  const track = { player: null, armor: 0, eqSig: '', plSig: '', starve: 0, moveF: 1, saveT: 0, sess: null };
  function syncWeaponsToPlayer(p) {
    const ids = weaponIds();
    const cur = p.weapons[p.cur] && p.weapons[p.cur].id;
    p.weapons = ids.filter(Boolean).map(id => SK.makeWeapon(id));
    if (!p.weapons.length && heroOf(p).weapon) p.weapons = [SK.makeWeapon(heroOf(p).weapon)];
    if (p.weapons.length < 2) p.weapons.push(null);
    p.cur = Math.max(0, p.weapons.findIndex(w => w && w.id === cur));
    track.eqSig = ids.join(',');
    track.plSig = p.weapons.map(w => w ? w.id : '').join(',');
  }
  inv.syncWeapons = p => syncWeaponsToPlayer(p);
  // Ô vũ khí đang cầm -> chồng vật phẩm (để trừ độ bền)
  function curWeaponStack(p) {
    const w = p.weapons[p.cur]; if (!w) return null;
    for (const k of ['weapon1', 'weapon2']) { const s = S.equip[k]; if (s && wOf(s) === w.id) return s; }
    return null;
  }
  inv.curWeaponStack = () => SK.G && SK.G.player ? curWeaponStack(SK.G.player) : null;
  SK.on('fire', (G, p) => { if (G && G.state === 'season' && p === G.player && !track.sess) track.sess = { start: G.t || 0, billed: G.t || 0 }; });

  // Mỗi bước: độ no, chết đói, tốc độ theo tải, độ bền giáp/vũ khí, đồng bộ vũ khí, dùng đồ.
  inv.tick = function (G, dt) {
    const p = G && G.player;
    if (!p) return;
    if (track.player !== p) inv.applyPlayer(p, true);
    for (const k in inv.buffs) if ((inv.buffs[k].t -= dt) <= 0) delete inv.buffs[k];
    inv.tickBox(dt);
    if (inv.using) { inv.using.t += dt; if (p.st === 'dead') inv.using = null; else if (inv.using.t >= inv.using.need) finishUse(G); }
    const base = inv.inBase();
    const tier = inv.tier();
    // tốc độ: [ĐO] 6.8 trong căn cứ / 5.5 ngoài căn cứ thay tốc độ nhân vật, nhân hệ số tải; thuốc tốc độ +v%
    const h = heroOf(p);
    const f = (base ? RULES.speedBase : RULES.speedOut) / (h.speed || 6.5) * tier.speed * (inv.buffs.speed ? 1 + inv.buffs.speed.v / 100 : 1);
    const cur = p.moveMul == null ? 1 : p.moveMul;
    if (f !== track.moveF || p._invMove !== f) {
      p.moveMul = Math.round(cur / (p._invMove || 1) * f * 1e6) / 1e6;
      p._invMove = f; track.moveF = f;
    }
    if (p.st !== 'dead' && !base) {
      // [ĐO EscapeInventoryRuntime.TickHunger] mỗi giây -0.14 x (2 - min(hệ số tốc, 1)); hết no mất 0.5 máu/giây
      S.hunger = Math.max(0, S.hunger - RULES.hungerPerSec * tier.hunger * dt);
      if (S.hunger <= 0) {
        track.starve += RULES.starvePerSec * dt;
        if (track.starve >= 1) { track.starve -= 1; selfDamage(G, 1); }
      } else track.starve = 0;
    }
    // giáp: điểm giáp hồi lại tiêu độ bền 1:1 [WIKI Supply crate]; hết bền thì không hồi nữa
    const a = S.equip.armor;
    if (a && p.armor > track.armor) {
      a.dur = Math.max(0, a.dur - (p.armor - track.armor));
      changed(true);
    }
    if (a && a.dur <= 0 && p.armor > track.armor) p.armor = track.armor;
    const ad = a && def(a.id);
    const want = ad ? ad.armor : 0;
    if (p.armorMax !== want) { p.armorMax = want; p.armor = Math.min(p.armor, want); }
    track.armor = p.armor;
    // vũ khí [ĐO EscapeWeaponDurabilityTracker.BillUntil/GetBillingEndTime/AddBillableTime, esc_tips_2]:
    // phiên bắt đầu ở phát bắn đầu tiên; 0.35 s đầu miễn phí; giữ nút thì tính tới hiện tại, nhả nút thì tính tới
    // tối đa bắt đầu + 1.65 s; cứ đủ 2 s tính phí thì -1 độ bền (bộ đếm nằm trên từng món); hết bền thì không bắn được
    const ws = curWeaponStack(p), ss = track.sess;
    if (ss) {
      const held = SK.input && SK.input.down && SK.input.down('attack');
      const end = held ? G.t : Math.min(ss.start + 1.65, G.t), from = Math.max(ss.start + 0.35, ss.billed);
      ss.billed = G.t;
      if (ws && !base && p.st !== 'dead' && end > from) {
        ws.bill = (ws.bill || 0) + (end - from);
        while (ws.bill >= RULES.weaponDurSec && ws.dur > 0) { ws.bill -= RULES.weaponDurSec; ws.dur--; changed(true); }
      }
      if (!held && G.t >= ss.start + 1.65) track.sess = null;
    }
    for (const w of p.weapons) {
      if (!w) continue;
      const st = [S.equip.weapon1, S.equip.weapon2].find(s => s && wOf(s) === w.id);
      if (st && st.dur != null && st.dur <= 0) { w.cd = Math.max(w.cd || 0, 0.3); w.broken = true; }
    }
    const eq = weaponIds().join(','), pl = p.weapons.map(w => w ? w.id : '').join(',');
    if (eq !== track.eqSig) syncWeaponsToPlayer(p);
    else if (pl !== track.plSig) syncWeaponsToPlayer(p);
    track.saveT += dt;
    if (dirty && track.saveT > 2) { track.saveT = 0; dirty = false; inv.save(); }
  };

  let dirty = false;
  function changed(quiet) { dirty = true; if (!quiet) SK.emit('seasonInv', SK.G); }
  inv.changed = changed;

  // ---------------------------------------------------------------- chết / sơ tán
  // [ĐO esc_tips_4 + EscapeSeasonData.RecordDeathBox/ClearPlayerRuntimeItems] rút lui thất bại: balô + đồ đang mặc nằm lại
  // trong Rương Tử Vong ở chỗ chết, còn 1 lần để quay lại lấy (esc_result_recover_lost_items). Rương An Toàn + Kho giữ nguyên.
  inv.onDeath = function (G) {
    const lost = [];
    for (const s of S.backpack) if (s) lost.push(s);
    const e = S.equip;
    for (const k of ['backpack', 'armor', 'weapon1', 'weapon2']) if (e[k] && !def(e[k].id).starter) lost.push(e[k]);
    for (const a of e.amulets) if (a) lost.push(a);
    const p = G && G.player, map = G && G.season ? G.season.map : 's1';
    S.deathBox = lost.length && p && map !== 'base' ? { map, x: p.x, y: p.y, slots: lost, runs: 1 } : null;
    S.backpack = new Array(RULES.baseSlots).fill(null);
    S.equip = { backpack: null, armor: null, weapon1: null, weapon2: null, amulets: [null, null, null, null] };
    resizeBackpack();
    S.hunger = RULES.hungerMax + inv.grow('hunger');
    S.stats.deaths++;
    inv.buffs = {}; inv.using = null; inv.box = null;
    track.player = null;
    changed(); inv.save();
    return lost.length;
  };
  inv.onExtract = function () {
    S.stats.extracts++;
    inv.buffs = {}; inv.using = null; inv.box = null;
    track.player = null;
    changed(); inv.save();
    return S.backpack.filter(Boolean).length;
  };
  // Mỗi chuyến đi tiêu một "cơ hội" của Rương Tử Vong cũ.
  inv.onDeploy = function () {
    S.stats.runs++;
    if (S.deathBox) { S.deathBox.runs--; if (S.deathBox.runs < 0) S.deathBox = null; }
    changed(); inv.save();
  };

  // ---------------------------------------------------------------- cửa hàng [ĐO escape_tbescapeshopitemconfig; giá mua = Value x 2]
  SS.VENDING = (T.shop || []).filter(id => def(id));
  inv.buyPrice = id => Math.round(def(id).value * RULES.buyRate);
  // Giá bán = giá trị x số lượng x (độ bền / tối đa) — hằng sellPriceZeroDurabilityMultiplier 0 [ĐO]; nội suy tuyến tính [SUY]
  inv.sellPrice = st => {
    const d = def(st.id); if (d.starter) return 0;
    const k = st.max ? Math.max(0, st.dur / st.max) : 1;
    return Math.round(d.value * st.n * k);
  };
  inv.buy = function (id) {
    const pr = inv.buyPrice(id);
    if (S.coins < pr) return 'Không đủ Xu Sắt';
    const st = makeStack(id, 1);
    if (!addStackTo(S.backpack, st)) return 'Balô đã đầy';
    S.coins -= pr;
    autoQuick(id);
    changed();
    return null;
  };
  inv.sell = function (ref) {
    const st = get(ref); if (!st) return 'Ô trống';
    const pr = inv.sellPrice(st);
    if (pr <= 0) return 'Món này không bán được';
    set(ref, null);
    if (ref.c === 'equip' && ref.k === 'backpack') resizeBackpack();
    S.coins += pr;
    changed();
    return null;
  };
  // Sửa ở Bàn Chế Tạo: hồi đầy; độ bền tối đa mất 0.3 x phần đã hồi, giá 0.8 x giá trị x phần hỏng [hằng ĐO, công thức SUY]
  inv.repairCost = st => { const d = def(st.id); return st.max ? Math.round((st.max - st.dur) / st.max * d.value * RULES.repairCost) : 0; };
  inv.repair = function (ref) {
    const st = get(ref), d = st && def(st.id);
    if (!d || !st.max) return 'Món này không cần sửa';
    if (st.dur >= st.max) return 'Còn nguyên độ bền';
    if (!inv.atWorkshop) return 'Sửa ở Bàn Chế Tạo';
    const c = inv.repairCost(st);
    if (S.coins < c) return 'Không đủ Xu Sắt';
    S.coins -= c;
    const fix = st.max - st.dur;
    st.max = Math.max(1, Math.round(st.max - fix * RULES.repairLoss));
    st.dur = st.max;
    changed();
    return null;
  };

  // ---------------------------------------------------------------- vật liệu cho xây dựng / chế tạo: balô + kho + rương an toàn
  inv.canPay = function (coins, need) {
    if (S.coins < (coins || 0)) return 'Không đủ Xu Sắt';
    for (const [id, n] of need || []) if (!inv.has(id, n, 'all')) return 'Thiếu ' + (def(id) ? def(id).name : id) + ' x' + (n - inv.count(id, 'all'));
    return null;
  };
  inv.pay = function (coins, need) {
    const why = inv.canPay(coins, need); if (why) return why;
    S.coins -= coins || 0;
    for (const [id, n] of need || []) inv.remove(id, n, 'all');
    changed();
    return null;
  };

  // Bàn Thiết Kế [ĐO escape_tbescapedesigntableupgradeconfig]
  inv.buildLevel = id => S.build[id] || 0;
  inv.nextUpgrade = id => (T.upgrades || []).find(u => u.b === id && u.lv === inv.buildLevel(id) + 1) || null;
  inv.upgradeBlock = function (u) {
    if (!u) return 'Đã tối đa';
    for (const n of u.need || []) if (!inv.node(n)) return n.startsWith('rescued_') ? 'Cần giải cứu ' + n.slice(8) : 'Chưa mở khoá';
    return inv.canPay(u.coins, u.items);
  };
  inv.upgradeBuilding = function (id) {
    const u = inv.nextUpgrade(id), why = inv.upgradeBlock(u);
    if (why) return why;
    inv.pay(u.coins, u.items);
    S.build[id] = u.lv;
    if (id === 'Warehouse') resizeWarehouse();
    changed(); inv.save();
    SK.emit('seasonUpgrade', SK.G, id, u.lv);
    return null;
  };

  // Chế tạo ở Bàn Chế Tạo / Nhà Bếp / Trạm Y Tế [ĐO escape_tbescapecraftblueprintconfig]
  inv.recipes = at => (T.craft || []).filter(r => r.at === at);
  inv.craftBlock = r => inv.buildLevel(r.at) < r.lv ? 'Cần ' + L('esc_building_' + ({ Workshop: 'workshop', Kitchen: 'kitchen', Medical: 'medical_station' }[r.at] || r.at), r.at) + ' cấp ' + r.lv : inv.canPay(r.coins, r.in);
  inv.craft = function (r) {
    const why = inv.craftBlock(r); if (why) return why;
    inv.pay(r.coins, r.in);
    const st = makeStack(r.out[0], r.out[1]);
    // [ĐO esc_craft_result_*] thứ tự đặt: túi -> rương an toàn -> kho
    if (!addStackTo(S.backpack, st) && !(S.secure == null && (S.secure = st)) && !addStackTo(S.warehouse, st)) SK.emit('seasonDrop', SK.G, st);
    changed(); inv.save();
    SK.emit('seasonCraft', SK.G, r.out[0], r.out[1]);
    return null;
  };

  // Cơ sở huấn luyện [ĐO escape_tbescapeupgradeblueprintconfig, GameTimeSeconds 0 = xong ngay]
  inv.trainBlock = function (u) {
    if (S.training.indexOf(u.id) >= 0) return 'Đã nâng cấp';
    for (const pre of u.pre) if (S.training.indexOf(pre) < 0) return 'Cần hoàn thành ' + trainName(pre);
    return inv.canPay(u.coins, u.items);
  };
  function trainName(id) { const u = (T.training || []).find(x => x.id === id); return u ? u.name + ' ' + (+id.slice(-1)) : id; }
  inv.trainName = trainName;
  inv.train = function (u) {
    const why = inv.trainBlock(u); if (why) return why;
    inv.pay(u.coins, u.items);
    S.training.push(u.id);
    resizeBackpack();
    track.player = null;
    changed(); inv.save();
    SK.emit('seasonUpgrade', SK.G, u.key, S.training.length);
    return null;
  };

  inv.load();
})();
