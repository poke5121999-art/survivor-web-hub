// Season Mode: vật phẩm, balô, kho, hộp an toàn, trọng lượng, độ no (SK.SEASON.inv, SK.SEASON.items, SK.SEASON.loot).
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;
  const SS = SK.SEASON = SK.SEASON || {};
  const DATA = window.SK_SEASON_ITEMS || { items: {}, order: [], atlas: null, maps: {} };
  const KEY = 'sk.season.v1';

  // ---------------------------------------------------------------- trang atlas riêng (icon vật phẩm + escape_ui_texture)
  // Gắn thêm một trang vào SK_ATLAS trước khi SK.boot() tải ảnh, để SK.draw vẽ được 'sitem/Item_20', 'sui/lock'...
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

  // Vũ khí thật của SK thành vật phẩm 'w_<id>'. Cân/giá không có trên wiki [ƯỚC LƯỢNG].
  const W_KG = { gun: 1.5, staff: 1, melee: 2, bow: 1, laser: 2, launcher: 4 };
  const W_VALUE = { White: 300, Green: 800, Blue: 2000, Purple: 5000, Orange: 12000, Red: 30000 };
  const RAR = { White: 0, Green: 1, Blue: 2, Purple: 3, Orange: 4, Red: 5 };
  SS.itemDef = function (id) {
    if (items[id]) return items[id];
    if (typeof id === 'string' && id.startsWith('w_')) {
      const wid = id.slice(2), d = DS.weapons[wid];
      if (!d) return null;
      const starter = Object.values(DS.heroes).some(h => h.weapon === wid);
      items[id] = {
        id, weaponId: wid, name: d.name, nameEn: d.nameEn || d.name, type: 'weapon', icon: d.sprite,
        rarityIdx: RAR[d.rarity] != null ? RAR[d.rarity] : 0, weight: W_KG[d.kind] || 1.5, stack: 1,
        value: starter ? 0 : (W_VALUE[d.rarity] || 300),
        desc: 'Vũ khí' + (d.dmg != null ? ' · sát thương ' + d.dmg : '') + (d.cost ? ' · năng lượng ' + d.cost : '') +
          (starter ? ' · vũ khí khởi đầu, không bán được' : '')
      };
      return items[id];
    }
    return null;
  };
  const def = id => SS.itemDef(id);
  const RARITY = ['white', 'green', 'blue', 'purple', 'orange', 'red'];
  SS.rarityName = i => RARITY[i] || 'white';

  // ---------------------------------------------------------------- luật [WIKI trừ chỗ ghi khác]
  const RULES = SS.RULES = {
    baseSlots: 15, baseKg: 40, warehouseSlots: 64, secureSlots: 1, amuletSlots: 4, amuletOpen: 1,
    hungerMax: 100, starveEvery: 2,
    // % tải: <25 / 25-75 / 75-100 / 100-120 / >120
    tiers: [[25, 1.1, 8], [75, 1.0, 7], [100, 0.7, 6], [120, 0.5, 5], [Infinity, 0.1, 4]],
    baseSpeed: 1.15,       // "chạy nhanh hơn chút trong căn cứ" [WIKI], hệ số [ƯỚC LƯỢNG]
    buffTime: { kg: 180, speed: 60, immune: 120 },   // thời lượng thuốc [ƯỚC LƯỢNG]
    sellRate: 1, buyRate: 2                         // máy bán hàng 200% giá trị [WIKI]
  };

  // ---------------------------------------------------------------- trạng thái
  function fresh() {
    return {
      v: 1,
      equip: { backpack: null, armor: null, weapon1: null, weapon2: null, amulets: [null, null, null, null] },
      backpack: new Array(RULES.baseSlots).fill(null),
      secure: null,
      warehouse: new Array(RULES.warehouseSlots).fill(null),
      warehouseLv: 1,
      coins: 0,
      hunger: RULES.hungerMax,
      quick: [null, null, null],
      stats: { kills: 0, extracts: 0, deaths: 0, runs: 0 },
      quests: null,
      hero: null
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
    if (st && st.v === 1) {
      for (const k in f) if (st[k] == null) st[k] = f[k];
      st.equip = Object.assign(f.equip, st.equip);
      if (!Array.isArray(st.equip.amulets)) st.equip.amulets = f.equip.amulets;
    } else st = f;
    S = inv.state = st;
    resizeBackpack();
    resizeWarehouse();
    return S;
  };
  inv.reset = function () { S = inv.state = fresh(); inv.buffs = {}; inv.save(); return S; };

  // ---------------------------------------------------------------- sức chứa / trọng lượng
  const round1 = v => Math.round(v * 100) / 100;
  inv.slots = () => RULES.baseSlots + ((S.equip.backpack && def(S.equip.backpack.id).slots) || 0);
  inv.capacity = function () {
    let kg = RULES.baseKg + ((S.equip.backpack && def(S.equip.backpack.id).kg) || 0);
    if (inv.buffs.kg > 0) kg += 20;
    return kg;
  };
  const stackKg = s => s ? (def(s.id) ? def(s.id).weight * s.n : 0) : 0;
  inv.weight = function () {
    let w = 0;
    for (const s of S.backpack) w += stackKg(s);
    const e = S.equip;
    w += stackKg(e.backpack) + stackKg(e.armor) + stackKg(e.weapon1) + stackKg(e.weapon2) + stackKg(S.secure);
    for (const a of e.amulets) w += stackKg(a);
    return round1(w);
  };
  inv.tier = function () {
    const pct = inv.weight() / inv.capacity() * 100;
    for (let i = 0; i < RULES.tiers.length; i++) {
      const t = RULES.tiers[i];
      if (i === 0 ? pct < t[0] : pct <= t[0]) return { i, pct, speed: t[1], period: t[2] };
    }
    const t = RULES.tiers[RULES.tiers.length - 1];
    return { i: RULES.tiers.length - 1, pct, speed: t[1], period: t[2] };
  };

  function resizeBackpack() {
    const n = inv.slots();
    while (S.backpack.length < n) S.backpack.push(null);
    if (S.backpack.length > n) {
      const tail = S.backpack.splice(n).filter(Boolean);
      for (const t of tail) { const i = S.backpack.indexOf(null); if (i >= 0) S.backpack[i] = t; else putWarehouseOrLose(t); }
    }
  }
  function whSlots() { return RULES.warehouseSlots + (S.warehouseLv - 1) * 32; }   // +32 ô / cấp [WIKI]
  function resizeWarehouse() { while (S.warehouse.length < whSlots()) S.warehouse.push(null); }
  function putWarehouseOrLose(st) { const i = S.warehouse.indexOf(null); if (i >= 0) S.warehouse[i] = st; }

  // ---------------------------------------------------------------- thêm / bớt
  function makeStack(id, n) {
    const d = def(id), s = { id, n };
    if (d && d.type === 'armor') s.dur = d.durability;
    return s;
  }
  function addTo(list, id, n) {
    const d = def(id); if (!d) return n;
    const cap = d.stack || 1;
    for (const s of list) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < cap) { const k = Math.min(cap - s.n, n); s.n += k; n -= k; }
    }
    for (let i = 0; i < list.length && n > 0; i++) {
      if (!list[i]) { const k = Math.min(cap, n); list[i] = makeStack(id, k); n -= k; }
    }
    return n;
  }
  // Vào balô trước; vũ khí thì vào ô vũ khí trống trước, balô/giáp đeo luôn nếu ô trống.
  inv.add = function (id, n) {
    n = n == null ? 1 : n;
    const d = def(id); if (!d || n <= 0) return n;
    if (d.type === 'currency') { S.coins += n; changed(); return 0; }
    const e = S.equip;
    while (n > 0 && d.type === 'weapon' && (!e.weapon1 || !e.weapon2)) { e[!e.weapon1 ? 'weapon1' : 'weapon2'] = makeStack(id, 1); n--; }
    if (n > 0 && d.type === 'armor' && !e.armor) { e.armor = makeStack(id, 1); n--; }
    if (n > 0 && d.type === 'backpack' && !e.backpack) { e.backpack = makeStack(id, 1); n--; resizeBackpack(); }
    const left = addTo(S.backpack, id, n);
    if (left < n && (d.type === 'potion' || d.type === 'food') && S.quick.indexOf(id) < 0) {
      const q = S.quick.indexOf(null); if (q >= 0) S.quick[q] = id;
    }
    changed();
    return left;
  };
  // world.js: nhặt vũ khí dưới đất. Ô vũ khí trống -> cầm luôn; không thì vào balô; balô đầy -> false (world đổi với
  // súng đang cầm như ải thường, tick() kéo thay đổi đó vào ô trang bị).
  inv.pickWeapon = function (wid) {
    const id = 'w_' + wid, e = S.equip, p = SK.G && SK.G.player;
    if (!def(id)) return false;
    if (!e.weapon1 || !e.weapon2) {
      const k = !e.weapon1 ? 'weapon1' : 'weapon2';
      e[k] = makeStack(id, 1);
      if (p) { syncWeaponsToPlayer(p); p.cur = Math.max(0, p.weapons.findIndex(w => w && w.id === wid)); }
      changed();
      return true;
    }
    if (inv.firstFree('bag')) { S.backpack[S.backpack.indexOf(null)] = makeStack(id, 1); changed(); if (SK.G && SK.G.toast) SK.G.toast('Vũ khí vào balô'); return true; }
    return false;
  };
  inv.addTo = function (where, id, n) {
    const left = addTo(where === 'warehouse' ? S.warehouse : S.backpack, id, n == null ? 1 : n);
    changed(); return left;
  };
  inv.count = function (id, where) {
    const lists = where === 'warehouse' ? [S.warehouse] : where === 'all' ? [S.backpack, S.warehouse] : [S.backpack];
    let c = 0;
    for (const l of lists) for (const s of l) if (s && s.id === id) c += s.n;
    if (where === 'all' || !where) {
      const e = S.equip;
      for (const s of [e.backpack, e.armor, e.weapon1, e.weapon2, S.secure].concat(e.amulets)) if (s && s.id === id) c += s.n;
    }
    if (id === 'iron_coin') c = S.coins;
    return c;
  };
  inv.has = (id, n) => inv.count(id, 'all') >= (n == null ? 1 : n);
  inv.remove = function (id, n) {
    n = n == null ? 1 : n;
    if (id === 'iron_coin') { if (S.coins < n) return false; S.coins -= n; changed(); return true; }
    if (!inv.has(id, n)) return false;
    const takeFrom = list => {
      for (let i = list.length - 1; i >= 0 && n > 0; i--) {
        const s = list[i];
        if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) list[i] = null; }
      }
    };
    takeFrom(S.backpack); takeFrom(S.warehouse);
    const e = S.equip;
    for (const k of ['weapon2', 'weapon1', 'armor', 'backpack']) if (n > 0 && e[k] && e[k].id === id) { e[k] = null; n--; }
    if (n > 0 && S.secure && S.secure.id === id) { const k = Math.min(S.secure.n, n); S.secure.n -= k; n -= k; if (!S.secure.n) S.secure = null; }
    resizeBackpack();
    changed();
    return true;
  };

  // ---------------------------------------------------------------- ô (địa chỉ chung cho kéo-thả)
  // ref: {c:'bag'|'wh'|'secure'|'equip', i?, k?}; equip k: backpack|armor|weapon1|weapon2|amulet0..3
  function get(ref) {
    if (ref.c === 'bag') return S.backpack[ref.i];
    if (ref.c === 'wh') return S.warehouse[ref.i];
    if (ref.c === 'secure') return S.secure;
    if (ref.c === 'equip') return ref.k.startsWith('amulet') ? S.equip.amulets[+ref.k.slice(6)] : S.equip[ref.k];
    return null;
  }
  function set(ref, v) {
    if (ref.c === 'bag') S.backpack[ref.i] = v;
    else if (ref.c === 'wh') S.warehouse[ref.i] = v;
    else if (ref.c === 'secure') S.secure = v;
    else if (ref.c === 'equip') { if (ref.k.startsWith('amulet')) S.equip.amulets[+ref.k.slice(6)] = v; else S.equip[ref.k] = v; }
  }
  inv.get = get;
  inv.amuletOpen = () => RULES.amuletOpen;
  // null = được; chuỗi = lý do (hiện cho người chơi).
  function accepts(ref, st) {
    if (!st) return null;
    const d = def(st.id);
    if (ref.c !== 'equip') return null;
    const k = ref.k;
    if (k.startsWith('amulet')) {
      if (+k.slice(6) >= RULES.amuletOpen) return 'Ô bùa chưa mở (nâng cấp ở Khu huấn luyện)';
      return d.type === 'amulet' ? null : 'Chỉ đeo được bùa';
    }
    if (k === 'weapon1' || k === 'weapon2') return d.type === 'weapon' ? null : 'Chỉ đặt được vũ khí';
    if (k === 'armor') return d.type === 'armor' ? null : 'Chỉ mặc được giáp';
    if (k === 'backpack') return d.type === 'backpack' ? null : 'Chỉ đeo được balô';
    return 'Không đặt được';
  }
  inv.accepts = accepts;
  // Chuyển / gộp / đổi chỗ giữa hai ô. -> null nếu xong, chuỗi lý do nếu không.
  inv.move = function (from, to) {
    if (from.c === to.c && from.i === to.i && from.k === to.k) return null;
    if ((from.c === 'wh' || to.c === 'wh') && !inv.atWarehouse) return 'Phải đứng ở Kho mới lấy/cất được';
    const a = get(from), b = get(to);
    if (!a) return null;
    let why = accepts(to, a) || (b ? accepts(from, b) : null);
    if (why) return why;
    if (b && b.id === a.id && (def(a.id).stack || 1) > 1) {
      const cap = def(a.id).stack, k = Math.min(cap - b.n, a.n);
      if (k <= 0) { set(from, b); set(to, a); } else { b.n += k; a.n -= k; if (!a.n) set(from, null); }
    } else { set(from, b || null); set(to, a); }
    if ((from.c === 'equip' && from.k === 'backpack') || (to.c === 'equip' && to.k === 'backpack')) {
      const need = RULES.baseSlots + ((S.equip.backpack && def(S.equip.backpack.id).slots) || 0);
      const used = S.backpack.filter(Boolean).length;
      if (used > need) { set(to, b || null); set(from, a); return 'Balô đang chứa quá nhiều đồ'; }
      compactBackpack(need);
      resizeBackpack();
    }
    changed();
    return null;
  };
  function compactBackpack(n) {
    const tail = S.backpack.slice(n).filter(Boolean);
    for (let i = n; i < S.backpack.length; i++) S.backpack[i] = null;
    for (const t of tail) { const i = S.backpack.indexOf(null); if (i >= 0 && i < n) S.backpack[i] = t; }
  }
  // Nhấp nhanh: balô -> đeo (nếu hợp) / kho (nếu đang ở kho); đồ đang đeo -> balô; kho -> balô.
  inv.quickMove = function (ref) {
    const st = get(ref); if (!st) return null;
    const d = def(st.id);
    if (ref.c === 'bag') {
      if (inv.atWarehouse) return firstFree('wh') ? inv.move(ref, firstFree('wh')) : 'Kho đã đầy';
      const k = d.type === 'weapon' ? (!S.equip.weapon1 ? 'weapon1' : !S.equip.weapon2 ? 'weapon2' : 'weapon1')
        : d.type === 'armor' ? 'armor' : d.type === 'backpack' ? 'backpack'
          : d.type === 'amulet' ? 'amulet' + Math.max(0, S.equip.amulets.slice(0, RULES.amuletOpen).indexOf(null)) : null;
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
    set(ref, null);
    if (ref.c === 'equip' && ref.k === 'backpack') resizeBackpack();
    changed();
    SK.emit('seasonDrop', SK.G, st);   // world có thể thả xuống đất
    return st;
  };

  // Sắp: theo loại rồi độ hiếm giảm dần, gộp chồng lẻ.
  const TYPE_ORDER = ['weapon', 'armor', 'backpack', 'amulet', 'potion', 'food', 'valuable', 'material', 'quest'];
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
  // Cất hết balô vào kho (chỉ khi đứng ở kho).
  inv.storeAll = function () {
    if (!inv.atWarehouse) return 'Phải đứng ở Kho mới cất được';
    let moved = 0;
    for (let i = 0; i < S.backpack.length; i++) {
      const s = S.backpack[i]; if (!s) continue;
      const left = addTo(S.warehouse, s.id, s.n);
      if (left < s.n) moved++;
      if (left) s.n = left; else S.backpack[i] = null;
    }
    changed();
    return moved ? null : 'Không có gì để cất';
  };

  // ---------------------------------------------------------------- dùng đồ tiêu hao
  inv.inBase = function () {
    const f = SS.inBase;
    if (typeof f === 'function') return !!f();
    if (f != null) return !!f;
    const w = SS.world;
    if (w && typeof w.inBase === 'function') return !!w.inBase();
    if (w && w.zone != null) return w.zone === 'base';
    return false;
  };
  inv.usable = id => { const d = def(id); return !!d && (d.type === 'potion' || d.type === 'food' || /treasure_map/.test(id)); };
  inv.use = function (G, id) {
    const d = def(id);
    if (!d || !inv.usable(id)) return 'Món này không dùng được';
    if (inv.inBase()) return 'Không dùng đồ tiêu hao trong căn cứ';
    if (inv.count(id) < 1) return 'Hết ' + d.name;
    const p = G && G.player;
    if (!p || p.st === 'dead') return 'Không dùng được lúc này';
    const e = d.effect || {};
    inv.remove(id, 1);
    if (e.hp) { p.hp = Math.min(p.hpMax, p.hp + e.hp); SK.num(G, p.x, p.y - 26, '+' + e.hp, '#ff6b6b'); }
    if (e.energy) { p.energy = Math.min(p.energyMax, p.energy + e.energy); SK.num(G, p.x + 8, p.y - 20, '+' + e.energy, '#6ab8ff'); }
    if (e.satiety) S.hunger = Math.min(RULES.hungerMax, S.hunger + e.satiety);
    if (e.damage) selfDamage(G, e.damage);
    if (e.kg) inv.buffs.kg = RULES.buffTime.kg;
    if (e.speed) inv.buffs.speed = RULES.buffTime.speed;
    if (e.immune) inv.buffs['immune_' + e.immune] = RULES.buffTime.immune;
    if (/treasure_map/.test(id) && SS.world && SS.world.revealTreasure) SS.world.revealTreasure(G, id);
    SK.emit('seasonUse', G, id);
    changed();
    return null;
  };
  inv.useQuick = function (G, i) {
    const id = S.quick[i];
    if (!id) return 'Ô tiêu hao trống';
    return inv.use(G, id);
  };

  // Sát thương "tự gây" (đói, que cay): bỏ qua giáp và thời gian bất tử như game gốc [ƯỚC LƯỢNG].
  function selfDamage(G, n) {
    const p = G.player; if (!p || p.st === 'dead' || p.god) return;
    if (p.hp > n) {
      p.hp -= n; p.flash = 0.1; G.hurtT = Math.max(G.hurtT || 0, 0.25);
      SK.num(G, p.x, p.y - 26, n, '#ff4a4a');
      SK.emit('playerHurt', G, p, n);
    } else {
      p.armor = 0; p.invulT = 0; p.hp = 1;
      SK.hurtPlayer(G, 1);
    }
  }
  inv.selfDamage = selfDamage;

  // ---------------------------------------------------------------- người chơi <-> kho đồ
  function weaponIds() { return [S.equip.weapon1, S.equip.weapon2].map(s => s ? s.id.slice(2) : null); }
  function heroOf(p) { return DS.heroes[p.hero] || p.h; }
  // Chỉ số mode mùa [WIKI]: máu = máu gốc + 2 x giáp gốc; giáp chỉ đến từ áo giáp đang mặc.
  inv.applyPlayer = function (p, full) {
    const h = heroOf(p);
    p.hpMax = h.hp + 2 * (h.armor || 0);
    if (full || p.hp > p.hpMax) p.hp = p.hpMax;
    const a = S.equip.armor, ad = a && def(a.id);
    p.armorMax = ad ? (a.dur > 0 ? ad.armor : 0) : 0;
    p.armor = full ? p.armorMax : Math.min(p.armor, p.armorMax);
    if (!S.equip.weapon1 && !S.equip.weapon2 && h.weapon) S.equip.weapon1 = makeStack('w_' + h.weapon, 1);
    syncWeaponsToPlayer(p);
    track.player = p; track.armor = p.armor;
  };
  const track = { player: null, armor: 0, eqSig: '', plSig: '', hungerT: 0, starveT: 0, moveF: 1, saveT: 0 };
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
  // Nhặt/đổi vũ khí ngoài đất (world đổi p.weapons trực tiếp) thì kho đồ theo.
  function syncWeaponsFromPlayer(p) {
    const ws = p.weapons.filter(Boolean).map(w => w.id);
    S.equip.weapon1 = ws[0] ? makeStack('w_' + ws[0], 1) : null;
    S.equip.weapon2 = ws[1] ? makeStack('w_' + ws[1], 1) : null;
    track.eqSig = weaponIds().join(',');
    track.plSig = p.weapons.map(w => w ? w.id : '').join(',');
  }

  // Gọi mỗi bước (ui.update gọi): độ no, chết đói, tốc độ theo tải, độ bền giáp, đồng bộ vũ khí.
  inv.tick = function (G, dt) {
    const p = G && G.player;
    if (!p) return;
    if (track.player !== p) inv.applyPlayer(p, true);
    for (const k in inv.buffs) if ((inv.buffs[k] -= dt) <= 0) delete inv.buffs[k];
    const base = inv.inBase();
    const tier = inv.tier();
    // tốc độ: nhân vào p.moveMul và chỉ gỡ phần mình đã nhân (giống holdMove ở actors.js)
    const f = tier.speed * (base ? RULES.baseSpeed : 1) * (inv.buffs.speed > 0 ? 1.2 : 1);
    const cur = p.moveMul == null ? 1 : p.moveMul;
    if (f !== track.moveF || p._invMove !== f) {
      p.moveMul = Math.round(cur / (p._invMove || 1) * f * 1e6) / 1e6;
      p._invMove = f; track.moveF = f;
    }
    if (p.st !== 'dead' && !base) {
      track.hungerT += dt;
      if (track.hungerT >= tier.period) { track.hungerT -= tier.period; S.hunger = Math.max(0, S.hunger - 1); }
      if (S.hunger <= 0) {
        track.starveT += dt;
        if (track.starveT >= RULES.starveEvery) { track.starveT -= RULES.starveEvery; selfDamage(G, 1); }
      } else track.starveT = 0;
    }
    // giáp hồi 1 điểm tốn 1 độ bền [WIKI]; hết bền thì không hồi nữa
    const a = S.equip.armor;
    if (p.armor > track.armor && a) {
      a.dur = Math.max(0, a.dur - (p.armor - track.armor));
      if (a.dur <= 0) p.armorMax = p.armor;
      changed(true);
    }
    const ad = a && def(a.id);
    const want = ad ? (a.dur > 0 ? ad.armor : Math.min(p.armor, ad.armor)) : 0;
    if (p.armorMax !== want && !(a && a.dur <= 0)) { p.armorMax = want; p.armor = Math.min(p.armor, want); }
    if (!a && p.armorMax) { p.armorMax = 0; p.armor = 0; }
    track.armor = p.armor;
    // vũ khí
    const eq = weaponIds().join(','), pl = p.weapons.map(w => w ? w.id : '').join(',');
    if (eq !== track.eqSig) syncWeaponsToPlayer(p);
    else if (pl !== track.plSig) syncWeaponsFromPlayer(p);
    track.saveT += dt;
    if (dirty && track.saveT > 2) { track.saveT = 0; dirty = false; inv.save(); }
  };

  let dirty = false;
  function changed(quiet) { dirty = true; if (!quiet) SK.emit('seasonInv', SK.G); }

  // ---------------------------------------------------------------- chết / sơ tán
  // Chết: mất hết balô + đồ đang đeo; giữ Hộp an toàn + Kho [ĐOÁN, wiki không ghi — xem season brief].
  inv.onDeath = function () {
    const lost = S.backpack.filter(Boolean).length + ['backpack', 'armor', 'weapon1', 'weapon2'].filter(k => S.equip[k]).length +
      S.equip.amulets.filter(Boolean).length;
    S.backpack = new Array(RULES.baseSlots).fill(null);
    S.equip = { backpack: null, armor: null, weapon1: null, weapon2: null, amulets: [null, null, null, null] };
    const p = SK.G && SK.G.player, h = p ? heroOf(p) : DS.heroes[S.hero || 'knight'];
    if (h && h.weapon) S.equip.weapon1 = makeStack('w_' + h.weapon, 1);
    S.hunger = RULES.hungerMax;
    S.stats.deaths++;
    inv.buffs = {};
    track.player = null;
    changed(); inv.save();
    return lost;
  };
  inv.onExtract = function () {
    S.stats.extracts++;
    inv.buffs = {};
    track.player = null;
    changed(); inv.save();
    return S.backpack.filter(Boolean).length;
  };
  inv.onDeploy = function () { S.stats.runs++; changed(); inv.save(); };

  // ---------------------------------------------------------------- cửa hàng căn cứ [WIKI: Store]
  // Máy bán hàng: vài món cơ bản, giá 200% giá trị.
  SS.VENDING = ['healing_potion_s', 'energy_potion_s', 'healing_potion_m', 'energy_potion_m', 'salted_dried_fish',
    'potato_chip', 'canned_beans', 'hardtack_rations', 'roughspun_garb', 'plastic_bag'];
  inv.buyPrice = id => Math.round(def(id).value * RULES.buyRate);
  inv.sellPrice = st => { const d = def(st.id); return Math.round(d.value * RULES.sellRate * st.n * (d.type === 'armor' ? Math.max(0.2, st.dur / d.durability) : 1)); };
  inv.buy = function (id) {
    const pr = inv.buyPrice(id);
    if (S.coins < pr) return 'Không đủ xu sắt';
    if (!inv.firstFree('bag') && !S.backpack.some(s => s && s.id === id && s.n < def(id).stack)) return 'Balô đã đầy';
    S.coins -= pr;
    inv.add(id, 1);
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
  // Sửa giáp: đầy độ bền, nhưng độ bền tối đa giảm theo độ hiếm [WIKI], mức giảm và giá [ƯỚC LƯỢNG].
  inv.repairCost = st => { const d = def(st.id); return Math.round((d.durability - st.dur) / d.durability * d.value * 0.3); };
  inv.repair = function (ref) {
    const st = get(ref), d = st && def(st.id);
    if (!d || d.type !== 'armor') return 'Chỉ sửa được giáp';
    const max = st.max || d.durability;
    if (st.dur >= max) return 'Giáp còn nguyên';
    const c = inv.repairCost(st);
    if (S.coins < c) return 'Không đủ xu sắt';
    S.coins -= c;
    st.max = Math.max(1, max - (1 + d.rarityIdx));
    st.dur = st.max;
    changed();
    return null;
  };

  // Kho Lv2+ [WIKI: Base's upgrades] — bản web nâng ngay ở kho vì chưa có Bàn thiết kế.
  const WH_UP = [null, null, [1000, [['wooden_crate_s', 1]]], [5000, [['wooden_crate_s', 2]]],
    [10000, [['wooden_crate_s', 1], ['wooden_crate_m', 1]]], [16000, [['wooden_crate_s', 2], ['wooden_crate_m', 1]]],
    [28000, [['wooden_crate_m', 2]]], [40000, [['wooden_crate_m', 1], ['wooden_crate_l', 1]]],
    [60000, [['wooden_crate_m', 2], ['wooden_crate_l', 1]]], [100000, [['wooden_crate_s', 1], ['wooden_crate_m', 2], ['wooden_crate_l', 1]]]];
  inv.warehouseUpgrade = () => WH_UP[S.warehouseLv + 1] || null;
  inv.upgradeWarehouse = function () {
    const up = inv.warehouseUpgrade(); if (!up) return 'Kho đã tối đa';
    if (S.coins < up[0]) return 'Không đủ xu sắt';
    for (const [id, n] of up[1]) if (!inv.has(id, n)) return 'Thiếu ' + def(id).name + ' x' + n;
    S.coins -= up[0];
    for (const [id, n] of up[1]) inv.remove(id, n);
    S.warehouseLv++;
    resizeWarehouse();
    changed();
    SK.emit('seasonUpgrade', SK.G, 'warehouse', S.warehouseLv);
    return null;
  };
  inv.whSlots = whSlots;

  // ---------------------------------------------------------------- bảng rơi đồ
  // Thùng [WIKI: Crates & Items]: resource = vải/kim loại/đá/gỗ; food = đồ ăn + nguyên liệu; medical = thuốc;
  // supply = giáp/balô; misc = thỏi kim loại/thùng gỗ/đồ lặt vặt/bản đồ kho báu, đôi khi rỗng; monster = vũ khí
  // quái cầm + năng lượng tím (Trace thường, Shard tinh anh, Crystal trùm) + Ấn buff (trùm). Mọi trọng số: [ƯỚC LƯỢNG].
  const bySection = sec => SS.itemOrder.filter(id => items[id].section === sec);
  const POOLS = {
    resource: ['Fabric', 'Metal', 'Stone', 'Wood'].reduce((a, s) => a.concat(bySection(s)), []),
    food: bySection('Foods'), ingredient: bySection('Ingredients'),
    medical: bySection('Potions'),
    supply: bySection('Armors').concat(bySection('Backpacks')),
    misc: bySection('Misc').concat(bySection('Crates')), ingot: bySection('Ingots'),
    treasure: bySection('Treasure')
  };
  // Trọng số theo độ hiếm (trắng..đỏ) ở cấp vùng 1; vùng cao dịch dần lên hiếm hơn.
  const RARITY_W = [60, 28, 9, 2.5, 0.5, 0.05];
  function rarityWeight(r, level) { return RARITY_W[r] * Math.pow(1 + 0.8 * (level - 1), r); }
  function pickW(pool, level, extra) {
    let tot = 0;
    const ws = pool.map(id => { const w = rarityWeight(items[id].rarityIdx, level) * (extra ? extra(id) : 1); tot += w; return w; });
    let r = SK.rand() * tot;
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  const stackRoll = id => Math.min(items[id].stack || 1, items[id].stack > 1 ? SK.randi(1, 2) : 1);
  const MEDICAL_BIAS = id => /\((s|m)\)/i.test(items[id].nameEn) ? 3 : 1;
  const SUPPLY_BIAS = id => items[id].nameEn.includes('Legend') ? 0.2 : 1;
  SS.loot = function (type, level, o) {
    level = Math.max(1, level || 1);
    const out = [];
    const push = (id, n) => { if (!id) return; const e = out.find(x => x.id === id); if (e) e.n += n; else out.push({ id, n }); };
    if (type === 'resource') {
      const k = SK.randi(1, 3);
      for (let i = 0; i < k; i++) { const id = pickW(POOLS.resource, level); push(id, stackRoll(id)); }
    } else if (type === 'food') {
      const k = SK.randi(1, 2);
      for (let i = 0; i < k; i++) push(pickW(POOLS.food, level), 1);
      const g = SK.randi(0, 2);
      for (let i = 0; i < g; i++) { const id = pickW(POOLS.ingredient, level); push(id, stackRoll(id)); }
    } else if (type === 'medical') {
      const k = SK.chance(0.35) ? 2 : 1;
      for (let i = 0; i < k; i++) push(pickW(POOLS.medical, level, MEDICAL_BIAS), 1);
    } else if (type === 'supply') {
      push(pickW(POOLS.supply, level, SUPPLY_BIAS), 1);
    } else if (type === 'misc') {
      if (SK.chance(0.3)) return out;   // "Sometimes they are empty" [WIKI]
      const r = SK.rand();
      const pool = r < 0.55 ? POOLS.misc : r < 0.9 ? POOLS.ingot : POOLS.treasure;
      push(pickW(pool, level), 1);
    } else if (type === 'monster') {
      const tier = o && o.boss ? 2 : o && o.elite ? 1 : 0;
      if (o && o.weapon && DS.weapons[o.weapon]) push('w_' + o.weapon, 1), def('w_' + o.weapon);
      push(['violet_energy_trace', 'violet_energy_shard', 'violet_energy_crystal'][tier], tier ? 1 : SK.randi(1, 3));
      if (tier === 2) push('faded_buff_sigil', 1);
      if (SK.chance(0.25)) push('iron_coin', SK.randi(20, 80) * level);
    }
    // "Misc. items can appear in any crate" [WIKI]
    if (type !== 'misc' && type !== 'monster' && SK.chance(0.12)) push(pickW(POOLS.misc, level), 1);
    return out;
  };
  SS.lootPools = POOLS;

  inv.load();
})();
