// Hồ sơ người chơi dùng chung giữa lượt lặn và sảnh: ví tiền, kho, nhân vật đã mở, campaign đã qua,
// bộ nhớ Lua theo quest id (Get/SetString... của LuaApi), cấp/EXP uy tín, đồ thất lạc, nghịch lý.
// Là một object JSON thuần, lưu trong VD.save dưới khoá `profile` (các khoá khác của file lưu giữ nguyên).
(function (VD) {
  'use strict';

  function C(name, d) { return VD.combatDB ? VD.combatDB().c(name, d) : d; }

  function fresh() {
    return {
      v: 1,
      // Const.DefaultGold = 1500 (vốn khởi điểm). Coin = "Đồng xu cõi khác (đã đăng ký)" — GiveCoin/RemoveCoin.
      wallet: { gold: C('DefaultGold', 1500), coin: 0 },
      stash: [],                 // [{type:'Item'|'Equipment', id, count, dur?}]
      safe: [],                  // khe an toàn (Const.SafeInventorySlotBaseCount) — giữ khi chết
      quick: [0, 0, 0, 0, 0, 0], // id Item gán vào 6 ô nhanh
      unlockedChars: [100001],
      character: 100001,
      clears: {},                // campaignId → số lần qua
      quest: {},                 // questId → { s:{}, i:{}, b:{}, f:{}, step, state }
      loungeQuest: {},           // loungeQuestId → ELoungeQuestState (số)
      userLevel: 1, userExp: 0,
      isTutorial: true,
      paradox: [],               // Paradox.Id đang có
      lostGoods: [],             // [{goods, price, exitsLeft}] — Const.LostGoods*
      dives: 0,
      // ---- sảnh (js/lounge.js, js/npc.js, js/ui/*) ----
      // Túi mang vào lượt lặn kế tiếp (chuyển qua lại với kho ở NPC Stash). Bản mới: Item.DefaultCount của đồ tiêu hao
      // (số mang theo mặc định, cùng quy ước main.js cũ). [SUY LUẬN]
      pack: defaultPack(),
      storage: [],               // hộp "Nhận thưởng" của Duster (NpcFunction Storage): LuaApi GiveItemToStorage/GiveEquipmentToStorage
      lootRolls: {},             // ShopProduct.Id → xuất hiện đợt này (AppearProbability, lăn lại sau mỗi lượt lặn)
      activeCampaign: null,      // { id, difficulty } — campaign đã nhận ở Elara (NpcFunction Campaign), lặn qua bốt điện thoại
      difficulty: 'Normal',      // Difficulty.csv, NpcFunction DangerLevel
      loadouts: {},              // characterId → { SkillOne, SkillTwo, SkillThree, SkillFour } (chỉ số trong ActiveSkillIds)
      equip: {},                 // characterId → { weapon: Equipment.Id|0, acc: [..3], art: [..2] }
      talents: {},               // Talent.Id → true
      lqTask: {},                // LoungeQuestTask.Id → tiến độ (LuaProgress / đếm)
      itemUsed: {},              // Item.Id → true (RegisterItemUsed; điều kiện ItemUsed)
      npcLevel: {},              // NpcId → cấp (InteriorShop "NpcLevel:…")
      areaUnlocked: {},          // Area.Id → true (Area.DefaultUnlocked hoặc mua ở Interior)
      decoration: {},            // AreaDecoration.GroupId → Id đang đặt
      shopBought: {},            // ShopProduct.Id → số đã mua (StockCount)
      loungeBgm: 1001,           // LoungeBgm.Id
      restCount: 0,              // số lần nghỉ (Const.RestCost × RestCostMultiplier^n) [SUY LUẬN]
      paradoxLocked: [],         // Paradox.Id đã cố định (ParadoxLock)
      employees: [],             // Tycoon: [{ id, level, exp, stress }]
      sales: [],                 // Tycoon: [{ slot, goods, employee, t0, need }]
      sound: true,
      dialogs: [],               // LuaApi.AddDialog: [{ npc, LuaKey, FunctionName, Purpose, Priority, Type, Title }] (dùng chung với dive.js)
    };
  }
  function defaultPack() {
    const T = VD.T || {};
    return (T.Item || []).filter(i => i.DefaultCount > 0 && i.GoodsType === 'Consumable').map(i => ({ type: 'Item', id: i.Id, count: i.DefaultCount }));
  }

  const P = { data: null };

  P.load = function () {
    const all = (VD.save && VD.save.load()) || {};
    const d = all.profile && all.profile.v === 1 ? all.profile : fresh();
    // Trường thêm sau: bù mặc định để bản lưu cũ vẫn chạy.
    const f = fresh();
    for (const k of Object.keys(f)) if (d[k] === undefined) d[k] = f[k];
    P.data = d;
    return d;
  };
  P.get = function () { return P.data || P.load(); };
  P.save = function () {
    if (!VD.save) return;
    const all = VD.save.load() || {};
    all.profile = P.get();
    VD.save.write(all);
  };
  P.reset = function () { P.data = fresh(); P.save(); return P.data; };

  // ---------------------------------------------------------------- ví
  P.gold = () => P.get().wallet.gold;
  P.coin = () => P.get().wallet.coin;
  P.giveGold = n => { P.get().wallet.gold += Math.max(0, n | 0); P.save(); };
  P.removeGold = n => { const w = P.get().wallet; if (w.gold < n) return false; w.gold -= n; P.save(); return true; };
  P.giveCoin = n => { P.get().wallet.coin += Math.max(0, n | 0); P.save(); };
  P.removeCoin = n => { const w = P.get().wallet; if (w.coin < n) return false; w.coin -= n; P.save(); return true; };

  // ---------------------------------------------------------------- bộ nhớ Lua theo quest
  function q(id) {
    const all = P.get().quest;
    const k = String(id);
    return all[k] || (all[k] = { s: {}, i: {}, b: {}, f: {}, step: 0, state: 0 });
  }
  P.quest = q;
  P.qget = (id, kind, key) => { const v = q(id)[kind][key]; return v === undefined ? null : v; };
  P.qset = (id, kind, key, val) => { q(id)[kind][key] = val; P.save(); };

  // ---------------------------------------------------------------- campaign, cấp
  P.cleared = id => (P.get().clears[id] || 0) > 0;
  P.markCleared = id => { const c = P.get().clears; c[id] = (c[id] || 0) + 1; P.save(); };
  // Level.csv: NeedExp cộng dồn; lên cấp phải trả Coin tại NPC LevelUp (sảnh lo), ở đây chỉ cộng EXP.
  P.addExp = n => { P.get().userExp += Math.max(0, Math.round(n)); P.save(); };
  // Level.csv: hàng Level = L có NeedExp (EXP cộng dồn để lên L) và ConsumeGoodsData (phí xác nhận). Const.LevelMax = 7.
  P.levelRow = lv => (VD.T.Level || []).find(r => r.Level === lv) || null;
  P.levelMax = () => C('LevelMax', 7);
  P.nextLevel = () => { const d = P.get(); return d.userLevel >= P.levelMax() ? null : P.levelRow(d.userLevel + 1); };
  P.canLevelUp = () => { const n = P.nextLevel(); return !!n && P.get().userExp >= n.NeedExp; };

  // ---------------------------------------------------------------- hàng hoá: ví + kho
  // GoodsData gốc: "Loại:Id:SốLượng" hoặc [Loại, Id, SốLượng]; Loại ∈ Gold | Coin | Item | Equipment | Bag | None.
  const parse = g => (VD.goods ? VD.goods.parse(g) : null);
  P.parse = parse;
  const stackMax = g => (VD.goods ? VD.goods.stackMax(g) : 1);
  // Số ô kho: Const.StashSlotCount + Talent StashSlotCount. [ĐO: Const 60, Talent Effects StashSlotCount]
  P.stashSlots = () => C('StashSlotCount', 60) + P.talentSum('StashSlotCount');
  P.talentSum = type => {
    let n = 0;
    for (const t of VD.T.Talent || []) if (P.get().talents[t.Id]) for (const e of t.Effects || []) if (e[0] === type) n += +e[1] || 0;
    return n;
  };
  P.count = function (type, id) {
    const d = P.get();
    if (type === 'Gold') return d.wallet.gold;
    if (type === 'Coin') return d.wallet.coin;
    let n = 0;
    for (const s of d.stash) if (s.type === type && +s.id === +id) n += s.count || 1;
    return n;
  };
  P.has = list => {
    const need = {};
    for (const x of list || []) { const g = parse(x); if (!g || g.type === 'None' || !(g.count > 0)) continue; const k = g.type + ':' + (g.type === 'Gold' || g.type === 'Coin' ? 0 : g.id); need[k] = (need[k] || 0) + g.count; }
    return Object.keys(need).every(k => { const [t, i] = k.split(':'); return P.count(t, +i) >= need[k]; });
  };
  // Lấy khỏi kho n món (Item gộp nhiều ô; Equipment từng chiếc). Trả mảng hàng đã lấy.
  P.takeStash = function (type, id, n) {
    const d = P.get(), out = [];
    for (let i = d.stash.length - 1; i >= 0 && n > 0; i--) {
      const s = d.stash[i];
      if (s.type !== type || +s.id !== +id) continue;
      const k = Math.min(n, s.count || 1);
      out.push(Object.assign({}, s, { count: k }));
      s.count = (s.count || 1) - k; n -= k;
      if (s.count <= 0) d.stash.splice(i, 1);
    }
    return out;
  };
  P.pay = function (list) {
    if (!P.has(list)) return false;
    const d = P.get();
    for (const x of list || []) {
      const g = parse(x);
      if (!g || g.type === 'None' || !(g.count > 0)) continue;
      if (g.type === 'Gold') d.wallet.gold -= g.count;
      else if (g.type === 'Coin') d.wallet.coin -= g.count;
      else P.takeStash(g.type, g.id, g.count);
    }
    P.save();
    return true;
  };
  // Cất vào kho: Item gộp tới Item.InventoryCountMax mỗi ô; Equipment/Bag mỗi chiếc một ô. Trả false nếu kho đầy.
  P.stashFree = () => P.stashSlots() - P.get().stash.length;
  P.give = function (x, opts) {
    const g = parse(x);
    if (!g || g.type === 'None' || !(g.count > 0)) return true;
    const d = P.get();
    if (g.type === 'Gold') { d.wallet.gold += g.count; if (!(opts && opts.noSave)) P.save(); return true; }
    if (g.type === 'Coin') { d.wallet.coin += g.count; if (!(opts && opts.noSave)) P.save(); return true; }
    let left = g.count;
    if (g.type === 'Item') {
      const max = stackMax(g);
      for (const s of d.stash) if (left > 0 && s.type === 'Item' && +s.id === g.id && (s.count || 1) < max) { const k = Math.min(left, max - s.count); s.count += k; left -= k; }
      while (left > 0) { const k = Math.min(left, max); d.stash.push({ type: 'Item', id: g.id, count: k }); left -= k; }
    } else {
      for (let i = 0; i < left; i++) d.stash.push(Object.assign({}, g, { count: 1 }));
    }
    if (!(opts && opts.noSave)) P.save();
    return true;
  };
  P.giveAll = list => { for (const x of list || []) P.give(x, { noSave: true }); P.save(); };

  // ---------------------------------------------------------------- điều kiện gốc (EventCondition [Loại, Giá trị, (Giá trị 2)])
  // UserLevel, CampaignCleared, LoungeQuestCleared, NpcLevel, Talent, ItemUsed, AreaUnlocked, None. [ĐO: loại có trong bảng]
  const COND = {
    None: () => true,
    UserLevel: c => P.get().userLevel >= +c[1],
    CampaignCleared: c => P.cleared(+c[1]),
    LoungeQuestCleared: c => (P.get().loungeQuest[c[1]] | 0) === 4,
    NpcLevel: c => (P.get().npcLevel[c[1]] | 0) >= +(c[2] == null ? 1 : c[2]),
    Talent: c => !!P.get().talents[c[1]],
    ItemUsed: c => !!P.get().itemUsed[c[1]],
    AreaUnlocked: c => P.areaOpen(+c[1]),
  };
  P.condOk = function (c) {
    if (!c) return true;
    const arr = Array.isArray(c) ? c : String(c).split(':');
    const f = COND[arr[0]];
    if (!f) { if (!P._warnCond) P._warnCond = new Set(); if (!P._warnCond.has(arr[0])) { P._warnCond.add(arr[0]); console.warn('[profile] điều kiện chưa làm: ' + arr[0]); } return false; }
    return f(arr);
  };
  P.condsOk = list => (list || []).every(P.condOk);
  P.areaOpen = id => { const r = (VD.T.Area || []).find(a => a.Id === id); return !!(r && r.DefaultUnlocked) || !!P.get().areaUnlocked[id]; };

  // ---------------------------------------------------------------- nhân vật, loadout, talent
  P.loadout = function (charId) {
    const d = P.get();
    if (!d.loadouts[charId]) {
      const row = (VD.T.Character || []).find(c => c.Id === charId);
      d.loadouts[charId] = row && VD.stage ? VD.stage.defaultLoadout({ row }) : { SkillOne: 0, SkillTwo: 1, SkillThree: -1, SkillFour: -1 };
    }
    return d.loadouts[charId];
  };
  // Talent AddSkill → passive gắn lúc vào lượt lặn (makeUnit spec.talents). SkillSlotCount → mở ô skill.
  P.talentSkills = () => {
    const out = [];
    for (const t of VD.T.Talent || []) if (P.get().talents[t.Id]) for (const e of t.Effects || []) if (e[0] === 'AddSkill') out.push(+e[1]);
    return out;
  };

  VD.profile = P;
})(window.VD = window.VD || {});
