/*
 * Ca Trực Đêm: Biệt Đội — tầng META: ví tiền, xác đang sở hữu, trang bị, tiến hoá,
 * gacha, cửa hàng, nhiệm vụ, và lưu game.
 *
 * WHY: mọi thứ ở đây TỒN TẠI GIỮA CÁC VÁN. Tách hẳn khỏi mô phỏng trong nhà (sim.js)
 *      để một ván chơi hỏng không bao giờ làm hỏng tài sản người chơi.
 * ROOT-CAUSE: ở bản Survivor gốc, tiền thưởng và trạng thái trận nằm chung một chỗ,
 *      nên một lần thoát giữa chừng có thể ăn mất phần thưởng đã cộng.
 * SEE: docs/proposals/repo-squad.md
 */
(function (root) {
  'use strict';

  const SQ = root.SQ;
  const SAVE_KEY = 'repo_squad_save_v1';
  const SAVE_VER = 1;

  // ---------------------------------------------------------------------------
  // tiện ích
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const dayIndex = () => Math.floor(Date.now() / 86400000);
  const weekIndex = () => Math.floor(Date.now() / (86400000 * 7));
  SQ.clamp = clamp;
  SQ.money = n => Math.round(n).toLocaleString('vi-VN');

  let nextId = 1;
  const newId = () => 'i' + (nextId++);

  // ---------------------------------------------------------------------------
  // trạng thái mặc định
  // ---------------------------------------------------------------------------
  function freshState() {
    const M = {
      v: SAVE_VER,
      gold: 5000, gem: 1200, core: 40, ticketX: 3, ticketE: 5,
      chars: {},                 // id -> { lv, shard, equip:{slot:instId} }
      inv: [],                   // trang bị đang có
      squad: { lead: null, mates: [null, null, null, null] },
      tactics: {},               // charId -> tacticId
      evol: {},                  // evolId -> level
      maps: {},                  // mapId -> { floor, cleared, best }
      pity: { char: { c5: 0, c4: 0 }, equip: { c5: 0, c4: 0 } },
      quests: { day: -1, week: -1, daily: [], weekly: [], claimed: {}, achClaimed: {} },
      shopLimit: { day: -1, used: {} },
      counters: { runs: 0, wins: 0, loot: 0, kills: 0, skills: 0, floors: 0,
                  pulls: 0, revives: 0, upgrades: 0, spendVnd: 0 },
      week: { runs: 0, wins: 0, loot: 0, kills: 0, upgrades: 0 },
      day: { runs: 0, loot: 0, skills: 0, kills: 0, floors: 0, pulls: 0, revives: 0 },
      seenIntro: false
    };
    SQ.EVOL.forEach(e => { M.evol[e.id] = 0; });
    SQ.MAPS.forEach(m => { M.maps[m.id] = { floor: 0, cleared: false, best: 0 }; });
    SQ.STARTER_CHARS.forEach(id => { M.chars[id] = { lv: 1, shard: 0, equip: {} }; });
    M.squad.lead = SQ.STARTER_CHARS[0];
    // Bốn ô bot để trống: quay được xác nào thì xếp xác đó vào. Chiến thuật mặc định
    // do setMate()/autoFill() gán khi xác thật sự vào tổ.
    M.squad.mates = SQ.STARTER_CHARS.slice(1, 5);
    while (M.squad.mates.length < 4) M.squad.mates.push(null);
    M.squad.mates.forEach((id, i) => { if (id) M.tactics[id] = ['loot', 'thu', 'soi', 'baoke'][i]; });
    return M;
  }

  let M = SQ.M = freshState();

  // ---------------------------------------------------------------------------
  // lưu / đọc. localStorage là chủ; hub chỉ là lớp đồng bộ bên trên.
  // WHY: BRIDGE.md — "Cloud save is an optional layer UNDER the local save".
  // ---------------------------------------------------------------------------
  let saveTimer = 0;
  function save(now) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(M)); } catch (e) { /* riêng tư/đầy */ }
    if (now) pushCloud(); else {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(pushCloud, 4000);
    }
  }
  function pushCloud() {
    try {
      if (root.HubSave && root.HubSave.isAvailable && root.HubSave.isAvailable()) {
        root.HubSave.storeSave('repo-squad', M, { version: M.v });
      }
    } catch (e) { /* không bao giờ chặn game */ }
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && d.v) M = SQ.M = migrate(d);
      } catch (e) { /* hỏng thì chơi lại từ đầu, không văng */ }
    }
    // id kế tiếp phải nhảy qua mọi id đã lưu, nếu không hai món trùng id.
    M.inv.forEach(it => {
      const n = parseInt(String(it.id).slice(1), 10);
      if (n >= nextId) nextId = n + 1;
    });
    repairSquad();
    rollQuests();
    return M;
  }
  // Bảng nội dung có thể DÀI RA sau khi người chơi đã lưu — và cũng có thể NGẮN LẠI, hoặc đổi
  // tên khoá. Bù phần thiếu thì bản cũ đã làm; vứt phần THỪA thì chưa, và đó mới là phần giết
  // người: một id mà bản game này không biết nằm lại trong save là mọi màn menu đọc trúng nó
  // đều ném lỗi, mà save thì sống qua mọi lần tải lại trang.
  // Đường vào không hề xa vời: syncFromHub() dưới đây lấy nguyên payload đám mây nhét thẳng
  // vào hàm này — một bản lưu viết bởi bản game mới hơn, hoặc bởi chính bản này trong lúc
  // GitHub Pages còn phục vụ một tệp js cũ, là đủ.
  function migrate(d) {
    const base = freshState();
    const out = Object.assign(base, d);
    // các bảng nội dung có thể dài ra sau khi người chơi đã lưu: bù khoá thiếu.
    SQ.EVOL.forEach(e => { if (out.evol[e.id] == null) out.evol[e.id] = 0; });
    SQ.MAPS.forEach(m => { if (!out.maps[m.id]) out.maps[m.id] = { floor: 0, cleared: false, best: 0 }; });
    out.counters = Object.assign(base.counters, out.counters || {});
    out.day = Object.assign(base.day, out.day || {});
    out.week = Object.assign(base.week, out.week || {});
    return scrub(out);
  }

  // Vứt mọi thứ trỏ tới một id không còn tồn tại. Thà mất một món đồ lạ còn hơn mất cả cái menu.
  function scrub(o) {
    const known = (tbl, id) => !!(tbl && tbl[id]);
    if (o.chars && typeof o.chars === 'object') {
      Object.keys(o.chars).forEach(id => { if (!known(SQ.CHAR_BY_ID, id)) delete o.chars[id]; });
    } else o.chars = {};
    if (!Array.isArray(o.inv)) o.inv = [];
    o.inv = o.inv.filter(it => it && known(SQ.SLOT_BY_ID, it.slot) && SQ.STATS[it.main] &&
                               known(SQ.SET_BY_ID, it.set) && it.star >= 1 && it.star <= 6);
    o.inv.forEach(it => { if (!Array.isArray(it.subs)) it.subs = [];
                          it.subs = it.subs.filter(x => x && SQ.STATS[x.k]); });
    const invIds = {};
    o.inv.forEach(it => { invIds[it.id] = 1; });
    if (o.equip && typeof o.equip === 'object') {
      Object.keys(o.equip).forEach(cid => {
        if (!known(SQ.CHAR_BY_ID, cid)) { delete o.equip[cid]; return; }
        const e = o.equip[cid];
        if (!e || typeof e !== 'object') { delete o.equip[cid]; return; }
        Object.keys(e).forEach(sl => { if (!known(SQ.SLOT_BY_ID, sl) || !invIds[e[sl]]) delete e[sl]; });
      });
    } else o.equip = {};
    if (o.evol && typeof o.evol === 'object') {
      Object.keys(o.evol).forEach(id => { if (!SQ.EVOL.some(e => e.id === id)) delete o.evol[id]; });
    }
    if (o.maps && typeof o.maps === 'object') {
      Object.keys(o.maps).forEach(id => { if (!SQ.MAP_BY_ID[id]) delete o.maps[id]; });
    }
    if (o.squad && typeof o.squad === 'object') {
      if (o.squad.lead && !known(SQ.CHAR_BY_ID, o.squad.lead)) o.squad.lead = null;
      if (Array.isArray(o.squad.slots)) {
        o.squad.slots = o.squad.slots.map(id => known(SQ.CHAR_BY_ID, id) ? id : null);
      }
    }
    if (o.tactics && typeof o.tactics === 'object') {
      Object.keys(o.tactics).forEach(cid => {
        if (!known(SQ.CHAR_BY_ID, cid) || !SQ.TACTIC_BY_ID[o.tactics[cid]]) delete o.tactics[cid];
      });
    }
    // Bộ nhiệm vụ: migrate() cũ không bao giờ sửa nó, mà questPending() thì đọc nó ở MỌI màn.
    const q = o.quests;
    if (!q || typeof q !== 'object' || !Array.isArray(q.daily) || !Array.isArray(q.weekly) ||
        !q.claimed || typeof q.claimed !== 'object' || !q.achClaimed || typeof q.achClaimed !== 'object') {
      o.quests = freshState().quests;
    }
    return o;
  }
  SQ.save = save; SQ.load = load;

  SQ.hardReset = function () {
    M = SQ.M = freshState();
    rollQuests();
    save(true);
    return M;
  };

  // ---------------------------------------------------------------------------
  // tiền
  // ---------------------------------------------------------------------------
  const WALLET_KEYS = ['gold', 'gem', 'core', 'ticketX', 'ticketE'];
  SQ.WALLET_KEYS = WALLET_KEYS;
  SQ.WALLET_LABEL = { gold: 'Vàng', gem: 'Ngọc', core: 'Lõi', ticketX: 'Vé Xác', ticketE: 'Vé Đồ' };
  SQ.WALLET_ICON = { gold: '🪙', gem: '💎', core: '⚙️', ticketX: '🎫', ticketE: '🎟️' };

  function can(cost) {
    for (const k in cost) if ((M[k] || 0) < cost[k]) return false;
    return true;
  }
  function spend(cost) {
    if (!can(cost)) return false;
    for (const k in cost) M[k] -= cost[k];
    save();
    return true;
  }
  function grant(r) {
    if (!r) return;
    for (const k in r) {
      if (WALLET_KEYS.indexOf(k) >= 0) M[k] = (M[k] || 0) + r[k];
    }
    save();
  }
  SQ.can = can; SQ.spend = spend; SQ.grant = grant;

  // ---------------------------------------------------------------------------
  // XÁC: cấp, mảnh, chỉ số
  // ---------------------------------------------------------------------------
  SQ.CHAR_MAX_LV = 30;
  SQ.charLevelCost = function (lv) {                 // giá lên cấp lv -> lv+1
    return { gold: Math.round(220 * lv * (1 + lv * 0.06)) };
  };
  SQ.charShardCost = function (lv) { return 1 + Math.floor(lv / 3); };

  SQ.own = id => !!M.chars[id];
  SQ.charLevelMul = lv => 1 + (lv - 1) * 0.038;      // +3,8% chỉ số gốc mỗi cấp

  SQ.levelUpChar = function (id) {
    const c = M.chars[id];
    if (!c || c.lv >= SQ.CHAR_MAX_LV) return { ok: false, why: 'Đã cấp tối đa.' };
    const needShard = SQ.charShardCost(c.lv);
    const cost = SQ.charLevelCost(c.lv);
    if (c.shard < needShard) return { ok: false, why: 'Thiếu mảnh xác.' };
    if (!can(cost)) return { ok: false, why: 'Thiếu vàng.' };
    c.shard -= needShard;
    spend(cost);
    c.lv++;
    save();
    return { ok: true, lv: c.lv };
  };

  // Cộng dồn chỉ số của một xác: gốc × cấp + tiến hoá + trang bị + bộ + chiến thuật.
  SQ.charStats = function (id, tacticId) {
    const base = SQ.CHAR_BY_ID[id];
    if (!base) return null;
    const own = M.chars[id] || { lv: 1, equip: {} };
    const mul = SQ.charLevelMul(own.lv);

    const flat = { atk: base.atk * mul, hp: base.hp * mul };
    const pct = { atk: 0, hp: 0, spd: 0, carry: 0, cd: 0, luck: 0, eye: 0, grit: 0 };
    pct.grit += base.grit || 0;

    // tiến hoá — CẢ TỔ, đây là chỗ nó vào
    SQ.EVOL.forEach(e => {
      const lv = M.evol[e.id] || 0;
      if (!lv) return;
      if (e.stat === 'hp' || e.stat === 'atk') flat[e.stat] += e.per * lv;
      else if (e.stat !== 'iq') pct[e.stat] += e.per * lv;
    });

    // trang bị
    const setCount = {};
    SQ.SLOTS.forEach(s => {
      const instId = own.equip && own.equip[s.id];
      if (!instId) return;
      const it = SQ.itemById(instId);
      if (!it) return;
      setCount[it.set] = (setCount[it.set] || 0) + 1;
      const m = SQ.mainValue(it);
      if (it.main === 'atk' || it.main === 'hp') flat[it.main] += m; else pct[it.main] += m;
      it.subs.forEach(sub => {
        if (!sub.on) return;
        if (sub.k === 'atk' || sub.k === 'hp') flat[sub.k] += sub.v; else pct[sub.k] += sub.v;
      });
    });
    // bộ đồ
    const sets = [];
    for (const sid in setCount) {
      const s = SQ.SET_BY_ID[sid];
      if (!s) continue;
      if (setCount[sid] >= 2) { sets.push({ id: sid, n: 2 }); for (const k in s.p2) pct[k] += s.p2[k]; }
      if (setCount[sid] >= 4) { sets.push({ id: sid, n: 4 }); for (const k in s.p4) pct[k] += s.p4[k]; }
    }
    // chiến thuật của bot
    const tac = tacticId && SQ.TACTIC_BY_ID[tacticId];
    if (tac) for (const k in tac.bonus) pct[k] += tac.bonus[k];

    const out = {
      id: id,
      atk: (flat.atk) * (1 + pct.atk),
      hp: (flat.hp) * (1 + pct.hp),
      spd: base.spd * (1 + pct.spd),
      carry: base.carry * (1 + pct.carry),
      cd: clamp(pct.cd, 0, 0.6),
      grit: clamp(pct.grit, 0, 0.75),
      eye: 1 + pct.eye,
      luck: 1 + pct.luck,
      atkR: base.atkR, atkCd: base.atkCd,
      lv: own.lv, star: base.star, sets: sets
    };
    out.power = SQ.powerOf(out);
    return out;
  };

  SQ.powerOf = function (s) {
    return Math.round(s.atk * 11 + s.hp * 1.3 + s.carry * 4 +
      (s.spd - 1) * 900 + s.cd * 900 + s.grit * 1100 + (s.eye - 1) * 380 + (s.luck - 1) * 460);
  };

  // Lực chiến của cả tổ — con số P2W người chơi nhìn để biết "đủ sức vào map chưa".
  SQ.squadPower = function () {
    return SQ.squadList().reduce((n, m) => n + (m.stats ? m.stats.power : 0), 0);
  };

  // Danh sách 5 người: [0] là người chơi điều khiển, còn lại là bot.
  SQ.squadList = function () {
    const out = [];
    const lead = M.squad.lead;
    if (lead && M.chars[lead]) out.push({ id: lead, player: true, tactic: null, stats: SQ.charStats(lead, null) });
    M.squad.mates.forEach(id => {
      if (id && M.chars[id]) {
        const t = M.tactics[id] || 'loot';
        out.push({ id: id, player: false, tactic: t, stats: SQ.charStats(id, t) });
      }
    });
    return out;
  };

  SQ.setLead = function (id) {
    if (!M.chars[id]) return false;
    const i = M.squad.mates.indexOf(id);
    if (i >= 0) M.squad.mates[i] = M.squad.lead;   // đổi chỗ, không nhân bản
    M.squad.lead = id;
    save();
    return true;
  };
  SQ.setMate = function (slot, id) {
    if (!(slot >= 0 && slot < M.squad.mates.length)) return false;
    if (id && !M.chars[id]) return false;
    const cur = M.squad.mates[slot];
    // ROOT-CAUSE: bản cũ cho phép hạ chính xác ĐANG CẦM xuống một ô bot TRỐNG.
    //   Khi đó lead nhận giá trị của ô trống (null) và cả tổ mất người điều khiển:
    //   squadList() còn đúng một người, và màn Trang Bị lấy lead = null nên vỡ.
    //   Ô BẠN CẦM giờ chỉ được ĐỔI CHỖ, không bao giờ được để trống.
    if (id && M.squad.lead === id) {
      if (!cur) return false;
      M.squad.lead = cur;
      M.squad.mates[slot] = id;
      if (!M.tactics[id]) M.tactics[id] = 'loot';
      save();
      return true;
    }
    const i = M.squad.mates.indexOf(id);
    if (id && i >= 0 && i !== slot) M.squad.mates[i] = cur;   // đổi chỗ, không nhân bản
    M.squad.mates[slot] = id;
    if (id && !M.tactics[id]) M.tactics[id] = 'loot';
    save();
    return true;
  };

  // Xếp nốt những xác đang rảnh vào các ô bot còn trống. Trả về số ô vừa lấp.
  SQ.autoFill = function () {
    let n = 0;
    const used = {};
    if (M.squad.lead) used[M.squad.lead] = 1;
    M.squad.mates.forEach(id => { if (id) used[id] = 1; });
    const free = SQ.CHARS.map(c => c.id).filter(id => M.chars[id] && !used[id]);
    for (let s = 0; s < M.squad.mates.length && free.length; s++) {
      if (M.squad.mates[s]) continue;
      const id = free.shift();
      M.squad.mates[s] = id;
      if (!M.tactics[id]) M.tactics[id] = 'loot';
      n++;
    }
    if (n) save();
    return n;
  };

  // Dọn lại đội hình sau khi đọc save: bỏ id không còn sở hữu, bỏ trùng lặp,
  // và bảo đảm ô BẠN CẦM luôn có người khi vẫn còn ít nhất một xác.
  // WHY: những save tạo ra trước bản vá setMate ở trên có thể đang mang lead = null.
  function repairSquad() {
    if (!M.squad || typeof M.squad !== 'object') M.squad = { lead: null, mates: [null, null, null, null] };
    const src = Array.isArray(M.squad.mates) ? M.squad.mates : [];
    const mates = [null, null, null, null];
    const seen = {};
    if (M.squad.lead && !M.chars[M.squad.lead]) M.squad.lead = null;
    if (M.squad.lead) seen[M.squad.lead] = 1;
    for (let i = 0; i < 4; i++) {
      const id = src[i];
      if (!id || !M.chars[id] || seen[id]) continue;
      seen[id] = 1;
      mates[i] = id;
    }
    M.squad.mates = mates;
    if (!M.squad.lead) {
      // Save này do lỗi cũ làm rỗng ô BẠN CẦM. Dựng lại đội hình đầy đủ luôn,
      // vì người chơi không cố ý ra trận một mình.
      const i = mates.findIndex(x => x);
      if (i >= 0) { M.squad.lead = mates[i]; mates[i] = null; }
      else {
        const own = SQ.CHARS.map(c => c.id).filter(id => M.chars[id]);
        if (own.length) M.squad.lead = own[0];
      }
      if (M.squad.lead) SQ.autoFill();
    }
    M.squad.mates.forEach(id => { if (id && !M.tactics[id]) M.tactics[id] = 'loot'; });
  }
  SQ.repairSquad = repairSquad;
  SQ.setTactic = function (id, tid) {
    if (!M.chars[id] || !SQ.TACTIC_BY_ID[tid]) return false;
    M.tactics[id] = tid; save(); return true;
  };

  // ---------------------------------------------------------------------------
  // TRANG BỊ
  // ---------------------------------------------------------------------------
  SQ.itemById = id => M.inv.find(i => i.id === id) || null;

  SQ.mainValue = function (it) {
    const cur = SQ.MAIN_CURVE[it.main][it.star];
    const t = it.lv / SQ.EQUIP_MAX_LV;
    return cur[0] + (cur[1] - cur[0]) * t;
  };
  SQ.fmtStat = function (k, v) {
    const st = SQ.STATS[k];
    if (!st) return String(v);
    return st.fmt === 'pct' ? '+' + (v * 100).toFixed(1) + '%' : '+' + Math.round(v);
  };

  SQ.rollItem = function (star, slotId) {
    const slot = slotId ? SQ.SLOT_BY_ID[slotId] : pick(SQ.SLOTS);
    const main = pick(slot.mains);
    const set = pick(SQ.SETS);
    const nSub = star === 5 ? 2 : star === 4 ? 1 : 1;
    const pool = SQ.STAT_KEYS.filter(k => k !== main);
    const subs = [];
    for (let i = 0; i < 4; i++) {
      const k = pool.splice((Math.random() * pool.length) | 0, 1)[0];
      const r = SQ.SUB_ROLL[k];
      subs.push({ k: k, v: rnd(r[0], r[1]), on: i < nSub });
    }
    const names = SQ.EQUIP_NAMES[slot.id][star];
    return {
      id: newId(), slot: slot.id, star: star, main: main, set: set.id,
      lv: 0, subs: subs, lock: false,
      name: names[(Math.random() * names.length) | 0]
    };
  };

  SQ.addItem = function (it) { M.inv.push(it); save(); return it; };

  SQ.equipItem = function (charId, instId) {
    const c = M.chars[charId], it = SQ.itemById(instId);
    if (!c || !it) return { ok: false, why: 'Không tìm thấy.' };
    // gỡ khỏi xác đang đeo nó, nếu có — một món chỉ ở đúng một chỗ.
    for (const cid in M.chars) {
      const e = M.chars[cid].equip || {};
      for (const s in e) if (e[s] === instId) delete e[s];
    }
    c.equip = c.equip || {};
    c.equip[it.slot] = instId;
    save();
    return { ok: true };
  };
  SQ.unequip = function (charId, slotId) {
    const c = M.chars[charId];
    if (c && c.equip) delete c.equip[slotId];
    save();
  };
  SQ.equippedBy = function (instId) {
    for (const cid in M.chars) {
      const e = M.chars[cid].equip || {};
      for (const s in e) if (e[s] === instId) return cid;
    }
    return null;
  };

  SQ.upgradeCost = function (it) {
    const lv = it.lv;
    return { gold: Math.round((120 + lv * 95) * it.star * 0.8), core: 1 + Math.floor(lv / 4) };
  };
  SQ.upgradeItem = function (instId) {
    const it = SQ.itemById(instId);
    if (!it) return { ok: false, why: 'Không tìm thấy.' };
    if (it.lv >= SQ.EQUIP_MAX_LV) return { ok: false, why: 'Đã cấp tối đa.' };
    const cost = SQ.upgradeCost(it);
    if (!spend(cost)) return { ok: false, why: 'Thiếu vàng hoặc lõi.' };
    it.lv++;
    let unlocked = null;
    if (SQ.SUB_UNLOCK_AT.indexOf(it.lv) >= 0) {
      const off = it.subs.find(s => !s.on);
      if (off) { off.on = true; unlocked = off; }
      else {                                   // đủ 4 dòng rồi thì nâng một dòng có sẵn
        const s = pick(it.subs);
        const r = SQ.SUB_ROLL[s.k];
        s.v += rnd(r[0], r[1]) * 0.8;
        unlocked = s;
      }
    }
    M.counters.upgrades++; M.week.upgrades++;
    save();
    return { ok: true, lv: it.lv, unlocked: unlocked, maxed: it.lv >= SQ.EQUIP_MAX_LV };
  };
  SQ.dismantle = function (instId) {
    const i = M.inv.findIndex(x => x.id === instId);
    if (i < 0) return { ok: false };
    const it = M.inv[i];
    if (it.lock) return { ok: false, why: 'Món này đang khoá.' };
    if (SQ.equippedBy(instId)) return { ok: false, why: 'Đang đeo trên người.' };
    const core = (it.star - 2) * 2 + it.lv;
    const gold = (it.star - 2) * 120 + it.lv * 60;
    M.inv.splice(i, 1);
    grant({ core: core, gold: gold });
    return { ok: true, core: core, gold: gold };
  };

  // ---------------------------------------------------------------------------
  // TIẾN HOÁ (nâng cho cả tổ)
  // ---------------------------------------------------------------------------
  SQ.evolCost = function (e) {
    const lv = M.evol[e.id] || 0;
    return { gold: Math.round(e.base * (1 + lv * e.step)) };
  };
  SQ.evolUp = function (id) {
    const e = SQ.EVOL.find(x => x.id === id);
    if (!e) return { ok: false };
    const lv = M.evol[id] || 0;
    if (lv >= e.max) return { ok: false, why: 'Đã cấp tối đa.' };
    if (!spend(SQ.evolCost(e))) return { ok: false, why: 'Thiếu vàng.' };
    M.evol[id] = lv + 1;
    save();
    return { ok: true, lv: lv + 1 };
  };
  SQ.evolTotal = () => SQ.EVOL.reduce((n, e) => n + (M.evol[e.id] || 0), 0);
  SQ.botIQ = () => 1 + (M.evol.iq || 0) * 0.06;

  // ---------------------------------------------------------------------------
  // GACHA
  // ---------------------------------------------------------------------------
  function starFor(banner, p) {
    const st = M.pity[banner.id];
    st.c5++; st.c4++;
    let rate5 = banner.rate5;
    if (st.c5 > banner.soft) rate5 += (st.c5 - banner.soft) * 0.06;   // dốc bảo hiểm
    if (st.c5 >= banner.hard) { st.c5 = 0; st.c4 = 0; return 5; }
    if (Math.random() < rate5) { st.c5 = 0; st.c4 = 0; return 5; }
    if (st.c4 >= banner.pity4 || Math.random() < banner.rate4) { st.c4 = 0; return 4; }
    return 3;
  }

  SQ.pull = function (bannerId, n, useTicket) {
    const b = SQ.GACHA[bannerId];
    if (!b) return { ok: false };
    n = n || 1;
    const cost = {};
    if (useTicket) cost[b.ticket] = n; else cost.gem = b.costGem * n;
    if (!spend(cost)) return { ok: false, why: useTicket ? 'Không đủ vé.' : 'Không đủ ngọc.' };

    const out = [];
    let got4 = false;
    for (let i = 0; i < n; i++) {
      let star = starFor(b, i);
      // gói 10: đảm bảo ít nhất một món 4★
      if (n === 10 && i === n - 1 && !got4 && star < 4) { star = 4; M.pity[b.id].c4 = 0; }
      if (star >= 4) got4 = true;
      out.push(bannerId === 'char' ? pullChar(star) : pullEquip(star));
    }
    M.counters.pulls += n; M.day.pulls += n;
    save(true);
    return { ok: true, items: out };
  };

  function pullChar(star) {
    const pool = SQ.CHARS.filter(c => c.star === star);
    const c = pick(pool);
    const owned = M.chars[c.id];
    if (!owned) {
      M.chars[c.id] = { lv: 1, shard: 0, equip: {} };
      return { kind: 'char', id: c.id, star: star, isNew: true, char: c };
    }
    const sh = star === 5 ? 20 : star === 4 ? 10 : 5;
    owned.shard += sh;
    return { kind: 'char', id: c.id, star: star, isNew: false, shard: sh, char: c };
  }
  function pullEquip(star) {
    const it = SQ.rollItem(star);
    M.inv.push(it);
    return { kind: 'equip', item: it, star: star, isNew: true };
  }

  // ---------------------------------------------------------------------------
  // CỬA HÀNG — nạp GIẢ, không có cổng thanh toán thật ở đây.
  // ---------------------------------------------------------------------------
  SQ.buyPack = function (packId) {
    const p = SQ.PACKS.find(x => x.id === packId);
    if (!p) return { ok: false };
    grant({ gem: p.gem + p.bonus });
    M.counters.spendVnd += p.vnd;
    save(true);
    return { ok: true, gem: p.gem + p.bonus };
  };
  SQ.exchangeLeft = function (x) {
    if (M.shopLimit.day !== dayIndex()) { M.shopLimit.day = dayIndex(); M.shopLimit.used = {}; }
    return x.limit - (M.shopLimit.used[x.id] || 0);
  };
  SQ.exchange = function (xid) {
    const x = SQ.EXCHANGE.find(e => e.id === xid);
    if (!x) return { ok: false };
    if (SQ.exchangeLeft(x) <= 0) return { ok: false, why: 'Hết lượt hôm nay.' };
    if (!spend({ gem: x.gem })) return { ok: false, why: 'Không đủ ngọc.' };
    const r = {};
    ['gold', 'core', 'ticketX', 'ticketE'].forEach(k => { if (x[k]) r[k] = x[k]; });
    grant(r);
    M.shopLimit.used[x.id] = (M.shopLimit.used[x.id] || 0) + 1;
    save(true);
    return { ok: true, got: r };
  };

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ
  // ---------------------------------------------------------------------------
  function rollQuests() {
    const d = dayIndex(), w = weekIndex();
    if (M.quests.day !== d) {
      M.quests.day = d;
      const pool = SQ.QUEST_POOL.daily.slice();
      M.quests.daily = [];
      for (let i = 0; i < 5 && pool.length; i++) {
        M.quests.daily.push(pool.splice((Math.random() * pool.length) | 0, 1)[0].id);
      }
      M.day = { runs: 0, loot: 0, skills: 0, kills: 0, floors: 0, pulls: 0, revives: 0 };
      Object.keys(M.quests.claimed).forEach(k => { if (k[0] === 'd') delete M.quests.claimed[k]; });
      M.shopLimit = { day: d, used: {} };
    }
    if (M.quests.week !== w) {
      M.quests.week = w;
      M.quests.weekly = SQ.QUEST_POOL.weekly.map(q => q.id);
      M.week = { runs: 0, wins: 0, loot: 0, kills: 0, upgrades: 0 };
      Object.keys(M.quests.claimed).forEach(k => { if (k[0] === 'w') delete M.quests.claimed[k]; });
    }
    save();
  }
  SQ.rollQuests = rollQuests;

  function counterValue(scope, key) {
    if (scope === 'daily') return M.day[key] || 0;
    if (scope === 'weekly') return M.week[key] || 0;
    // thành tựu đọc bộ đếm đời
    if (key === 'mapsDone') return SQ.MAPS.filter(m => M.maps[m.id] && M.maps[m.id].cleared).length;
    if (key === 'own5') return Object.keys(M.chars)
      .filter(id => SQ.CHAR_BY_ID[id] && SQ.CHAR_BY_ID[id].star === 5).length;
    if (key === 'squadFull') return SQ.squadList().length;
    if (key === 'eqMax') return M.inv.filter(i => i.lv >= SQ.EQUIP_MAX_LV).length;
    if (key === 'evolLv') return SQ.evolTotal();
    return M.counters[key] || 0;
  }

  SQ.questList = function () {
    rollQuests();
    const out = { daily: [], weekly: [], ach: [] };
    M.quests.daily.forEach(id => {
      const q = SQ.QUEST_POOL.daily.find(x => x.id === id);
      if (q) out.daily.push(view(q, 'daily'));
    });
    M.quests.weekly.forEach(id => {
      const q = SQ.QUEST_POOL.weekly.find(x => x.id === id);
      if (q) out.weekly.push(view(q, 'weekly'));
    });
    SQ.ACHIEVEMENTS.forEach(q => out.ach.push(view(q, 'ach')));
    return out;

    function view(q, scope) {
      const cur = counterValue(scope, q.counter);
      const claimed = scope === 'ach' ? !!M.quests.achClaimed[q.id] : !!M.quests.claimed[q.id];
      return { id: q.id, text: q.text, need: q.need, cur: Math.min(cur, q.need),
               done: cur >= q.need, claimed: claimed, r: q.r, scope: scope };
    }
  };

  SQ.claimQuest = function (id) {
    const all = SQ.questList();
    const q = all.daily.concat(all.weekly, all.ach).find(x => x.id === id);
    if (!q || !q.done || q.claimed) return { ok: false };
    grant(q.r);
    if (q.scope === 'ach') M.quests.achClaimed[id] = 1; else M.quests.claimed[id] = 1;
    save(true);
    return { ok: true, r: q.r };
  };
  SQ.claimAll = function () {
    const all = SQ.questList();
    const got = {};
    all.daily.concat(all.weekly, all.ach).forEach(q => {
      if (q.done && !q.claimed) {
        const r = SQ.claimQuest(q.id);
        if (r.ok) for (const k in q.r) got[k] = (got[k] || 0) + q.r[k];
      }
    });
    return got;
  };

  // ---------------------------------------------------------------------------
  // KẾT QUẢ MỘT VÁN — chỗ duy nhất sim.js được phép chạm vào ví.
  // ---------------------------------------------------------------------------
  SQ.finishRun = function (res) {
    // res: { mapId, floorsDone, won, lootValue, kills, skills, revives }
    const map = SQ.MAP_BY_ID[res.mapId];
    const st = M.maps[res.mapId];
    const c = M.counters;
    c.runs++; M.day.runs++; M.week.runs++;
    c.loot += res.lootValue; M.day.loot += res.lootValue; M.week.loot += res.lootValue;
    c.kills += res.kills; M.day.kills += res.kills; M.week.kills += res.kills;
    c.skills += res.skills; M.day.skills += res.skills;
    c.floors += res.floorsDone; M.day.floors += res.floorsDone;
    c.revives += res.revives || 0; M.day.revives += res.revives || 0;

    // Vàng = giá trị đồ đã giao. Ngọc chỉ đến từ mốc tầng và lần phá đảo đầu.
    const reward = { gold: Math.round(res.lootValue * 0.55), gem: 0, core: 0 };
    reward.core = Math.round(res.floorsDone * (1 + map.tier * 0.6));
    if (res.won) {
      reward.gold += map.clear.gold;
      reward.gem += map.clear.gem;
      c.wins++; M.week.wins++;
      if (!st.cleared) {
        st.cleared = true;
        reward.first = map.first;
        for (const k in map.first) reward[k] = (reward[k] || 0) + map.first[k];
      }
      st.floor = map.floors;
    } else {
      st.floor = Math.max(st.floor, res.floorsDone);
    }
    st.best = Math.max(st.best || 0, res.lootValue);

    const give = {};
    WALLET_KEYS.forEach(k => { if (reward[k]) give[k] = reward[k]; });
    grant(give);
    save(true);
    return reward;
  };

  // Map đã mở? Map đầu luôn mở; map sau cần map trước đã phá đảo.
  SQ.mapUnlocked = function (mapId) {
    const i = SQ.MAPS.findIndex(m => m.id === mapId);
    if (i <= 0) return true;
    const prev = SQ.MAPS[i - 1];
    return !!(M.maps[prev.id] && M.maps[prev.id].cleared);
  };

  // ---------------------------------------------------------------------------
  // Đồng bộ hub (không bắt buộc, không được chặn gì)
  // ---------------------------------------------------------------------------
  SQ.syncFromHub = async function () {
    try {
      if (!(root.HubSave && root.HubSave.isAvailable && root.HubSave.isAvailable())) return { ok: false, reason: 'no-account' };
      const r = await root.HubSave.loadSave('repo-squad');
      if (r && r.ok && r.found && r.payload && r.payload.counters) {
        const cloud = r.payload, local = M;
        const cloudScore = (cloud.counters.runs || 0) + (cloud.counters.pulls || 0);
        const localScore = (local.counters.runs || 0) + (local.counters.pulls || 0);
        // KHÔNG BAO GIỜ tráo bản lưu ở GIỮA MỘT VÁN. Lời gọi này là bất đồng bộ và trên mạng
        // chậm nó về SAU khi người chơi đã bấm ĐI CA — lúc đó H.onLevelClear và finishRun()
        // đang đọc M.maps của ván đang chơi, và tráo nó ra dưới chân chúng là một undefined
        // ném ra ngay trong vòng vẽ của bộ máy.
        if (root.SQ && SQ.squad && SQ.squad.run && SQ.squad.run()) return { ok: true, took: 'local-in-run' };
        if (cloudScore > localScore) {
          // Đường nạp từ ổ cứng gọi repairSquad()+rollQuests() sau migrate(); đường đám mây
          // trước đây không gọi cái nào. Cùng một dữ liệu, hai mức kiểm tra khác nhau.
          M = SQ.M = migrate(cloud);
          repairSquad(); rollQuests();
          save(); return { ok: true, took: 'cloud' };
        }
      }
      return { ok: true, took: 'local' };
    } catch (e) { return { ok: false, reason: 'error' }; }
  };

})(window);
