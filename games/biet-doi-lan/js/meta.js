/*
 * Biệt Đội Lặn — tầng META của sảnh: ví, crew, biệt đội, gacha, cửa hàng, nhiệm vụ, đồ nghề, lưu game.
 *
 * Chép từ games/repo-squad/js/meta.js, bỏ trang bị / tiến hoá / lõi / vé đồ, và đổi sang số bản Unity
 * (xem data/content.js). Không đọc DOM, không biết engine: game trong ca chỉ gọi BDL.meta.runStart() lúc
 * ra khơi và BDL.meta.runFinish() lúc về.
 *
 * Khoá lưu: localStorage `bdl.meta.v1`. Lên đám mây qua HubSave.storeSave('biet-doi-lan', M) nếu có.
 */
(function (root) {
  'use strict';

  const BDL = root.BDL = root.BDL || {};
  const C = BDL.content;
  const SAVE_KEY = 'bdl.meta.v1';
  const SAVE_VER = 1;
  const CLOUD_ID = 'biet-doi-lan';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const dayIndex = () => Math.floor(Date.now() / 86400000);
  const weekIndex = () => Math.floor(Date.now() / (86400000 * 7));
  const num = (v, lo, hi) => { v = +v; return isFinite(v) ? clamp(v, lo, hi) : lo; };
  const money = n => Math.round(n).toLocaleString('vi-VN');

  const WALLET = C.wallet.keys;
  const U = C.upgrade;

  // ---------------------------------------------------------------------------
  // trạng thái mặc định
  // ---------------------------------------------------------------------------
  function freshState() {
    const ws = C.walletStart;
    const M = {
      v: SAVE_VER,
      gold: ws.gold, gem: ws.gem, ticketX: ws.ticketX,
      chars: {},                         // id -> { lv, shard }   (lv 0..maxLevel)
      squad: { lead: null, mates: [null, null, null, null] },
      tactics: {},                       // charId -> tacticId
      maps: {},                          // mapId -> { cleared, best }
      pity: {},                          // bannerId -> { c5, c4 }
      quests: { day: -1, week: -1, daily: [], weekly: [], claimed: {}, achClaimed: {} },
      shopLimit: { day: -1, used: {} },
      counters: { runs: 0, wins: 0, loot: 0, kills: 0, skills: 0, floors: 0, pulls: 0, upgrades: 0, spendVnd: 0 },
      week: { wins: 0, loot: 0, kills: 0, upgrades: 0 },
      day: { runs: 0, loot: 0, skills: 0, kills: 0, floors: 0, pulls: 0, upgrades: 0 },
      loadout: null                      // null | { key, paid } — MỘT món đồ nghề mua sẵn
    };
    C.maps.forEach(m => { M.maps[m.id] = { cleared: false, best: 0 }; });
    C.banners.forEach(b => { M.pity[b.id] = { c5: 0, c4: 0 }; });
    ws.crew.forEach(id => { if (C.crewById[id]) M.chars[id] = { lv: 0, shard: 0 }; });
    M.squad.lead = ws.crew[0] || null;
    return M;
  }

  let M = freshState();
  let runActive = false;          // đang trong ca: không bao giờ tráo save giữa ván

  // ---------------------------------------------------------------------------
  // lưu / đọc
  // ---------------------------------------------------------------------------
  let saveTimer = 0;
  function save(now) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(M)); } catch (e) { /* riêng tư / đầy */ }
    if (now) pushCloud();
    else { clearTimeout(saveTimer); saveTimer = setTimeout(pushCloud, 4000); }
  }
  function pushCloud() {
    try {
      if (root.HubSave && root.HubSave.storeSave) {
        if (root.HubSave.isAvailable && !root.HubSave.isAvailable()) return;
        root.HubSave.storeSave(CLOUD_ID, M, { version: M.v });
      }
    } catch (e) { /* không bao giờ chặn game */ }
  }

  // Bản lưu là chuỗi người dùng sửa được bằng devtools, và bản đám mây có thể do bản game khác viết:
  // bù khoá thiếu, vứt id lạ, siết số.
  function migrate(d) {
    const base = freshState();
    const out = Object.assign(base, d && typeof d === 'object' ? d : {});
    out.v = SAVE_VER;
    ['gold', 'gem', 'ticketX'].forEach(k => { out[k] = Math.round(num(out[k], 0, 1e12)); });

    const chars = {};
    if (out.chars && typeof out.chars === 'object') {
      Object.keys(out.chars).forEach(id => {
        const c = out.chars[id];
        if (!C.crewById[id] || !c || typeof c !== 'object') return;
        chars[id] = { lv: Math.round(num(c.lv, 0, U.maxLevel)), shard: Math.round(num(c.shard, 0, 1e6)) };
      });
    }
    out.chars = chars;

    const maps = {};
    C.maps.forEach(m => {
      const s = (d && d.maps && d.maps[m.id]) || {};
      maps[m.id] = { cleared: !!s.cleared, best: Math.round(num(s.best, 0, 1e12)) };
    });
    out.maps = maps;

    const pity = {};
    C.banners.forEach(b => {
      const p = (d && d.pity && d.pity[b.id]) || {};
      pity[b.id] = { c5: Math.round(num(p.c5, 0, b.hard)), c4: Math.round(num(p.c4, 0, b.pity4)) };
    });
    out.pity = pity;

    out.counters = Object.assign(base.counters, (d && d.counters) || {});
    out.day = Object.assign(freshState().day, (d && d.day) || {});
    out.week = Object.assign(freshState().week, (d && d.week) || {});
    if (!out.shopLimit || typeof out.shopLimit !== 'object' || !out.shopLimit.used) out.shopLimit = freshState().shopLimit;
    const q = out.quests;
    if (!q || typeof q !== 'object' || !Array.isArray(q.daily) || !Array.isArray(q.weekly) ||
        !q.claimed || typeof q.claimed !== 'object' || !q.achClaimed || typeof q.achClaimed !== 'object') {
      out.quests = freshState().quests;
    }
    out.tactics = (out.tactics && typeof out.tactics === 'object') ? out.tactics : {};
    Object.keys(out.tactics).forEach(cid => {
      if (!chars[cid] || !C.tacticById[out.tactics[cid]]) delete out.tactics[cid];
    });
    out.squad = (out.squad && typeof out.squad === 'object') ? out.squad : { lead: null, mates: [] };
    out.loadout = validLoadout(out.loadout);
    return out;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && d.v) M = migrate(d);
      } catch (e) { /* hỏng thì chơi lại từ đầu, không văng */ }
    }
    repairSquad();
    rollQuests();
    return M;
  }

  function hardReset() {
    M = freshState();
    repairSquad();
    rollQuests();
    save(true);
    return M;
  }

  // ---------------------------------------------------------------------------
  // ví
  // ---------------------------------------------------------------------------
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
    for (const k in r) if (WALLET.indexOf(k) >= 0) M[k] = (M[k] || 0) + r[k];
    save();
  }

  // ---------------------------------------------------------------------------
  // CREW: cấp, mảnh, chỉ số
  // Giá lên cấp lv -> lv+1 = goldBase x (lv+1) vàng + shard mảnh (upgrade.json). Crew mới ra ở cấp 0.
  // ---------------------------------------------------------------------------
  const levelCost = lv => ({ gold: U.goldBase * (lv + 1) });
  const levelMul = lv => 1 + lv * U.statPerLevel;
  const own = id => !!M.chars[id];

  function levelUp(id) {
    const c = M.chars[id];
    if (!c) return { ok: false, why: 'Chưa có crew này.' };
    if (c.lv >= U.maxLevel) return { ok: false, why: 'Đã cấp tối đa.' };
    if (c.shard < U.shard) return { ok: false, why: 'Thiếu mảnh crew.' };
    const cost = levelCost(c.lv);
    if (!can(cost)) return { ok: false, why: 'Thiếu vàng.' };
    c.shard -= U.shard;
    spend(cost);
    c.lv++;
    M.counters.upgrades++; M.day.upgrades++; M.week.upgrades++;
    save();
    return { ok: true, lv: c.lv, cost: cost.gold };
  }

  // Chỉ số của một crew: gốc x cấp (hp, atk) + giảm hồi chiêu ở cấp 5 + chiến thuật của bot.
  function charStats(id, tacticId) {
    const base = C.crewById[id];
    if (!base) return null;
    const lv = (M.chars[id] || { lv: 0 }).lv;
    const mul = levelMul(lv);
    const pct = { atk: 0, hp: 0, spd: 0, carry: 0, cd: 0, luck: 0, eye: 0, grit: 0 };
    pct.grit += base.grit || 0;
    if (lv >= U.cdAtLevel) pct.cd += U.cdReduce;
    const tac = tacticId && C.tacticById[tacticId];
    if (tac) for (const k in tac.bonus) pct[k] += tac.bonus[k];
    const out = {
      id: id, lv: lv, star: base.star,
      atk: base.atk * mul * (1 + pct.atk),
      hp: base.hp * mul * (1 + pct.hp),
      spd: base.spd * (1 + pct.spd),
      carry: base.carry * (1 + pct.carry),
      cd: clamp(pct.cd, 0, 0.6),
      grit: clamp(pct.grit, 0, 0.75),
      eye: 1 + pct.eye,
      luck: 1 + pct.luck,
      passiveOn: lv >= U.passiveAtLevel
    };
    out.power = Math.round(out.atk * 11 + out.hp * 1.3 + out.carry * 4 +
      (out.spd - 1) * 900 + out.cd * 900 + out.grit * 1100 + (out.eye - 1) * 380 + (out.luck - 1) * 460);
    return out;
  }

  // Danh sách 5 người: [0] là người lặn (tổ trưởng), còn lại là bot.
  function squadList() {
    const out = [];
    const lead = M.squad.lead;
    if (lead && M.chars[lead]) out.push({ id: lead, player: true, tactic: null, stats: charStats(lead, null) });
    M.squad.mates.forEach(id => {
      if (id && M.chars[id]) {
        const t = M.tactics[id] || 'loot';
        out.push({ id: id, player: false, tactic: t, stats: charStats(id, t) });
      }
    });
    return out;
  }
  const squadPower = () => squadList().reduce((n, m) => n + (m.stats ? m.stats.power : 0), 0);

  function setLead(id) {
    if (!M.chars[id]) return false;
    const i = M.squad.mates.indexOf(id);
    if (i >= 0) M.squad.mates[i] = M.squad.lead;   // đổi chỗ, không nhân bản
    M.squad.lead = id;
    save();
    return true;
  }
  function setMate(slot, id) {
    if (!(slot >= 0 && slot < M.squad.mates.length)) return false;
    if (id && !M.chars[id]) return false;
    const cur = M.squad.mates[slot];
    // Ô tổ trưởng chỉ được đổi chỗ, không bao giờ để trống.
    if (id && M.squad.lead === id) {
      if (!cur) return false;
      M.squad.lead = cur;
      M.squad.mates[slot] = id;
      if (!M.tactics[id]) M.tactics[id] = 'loot';
      save();
      return true;
    }
    const i = M.squad.mates.indexOf(id);
    if (id && i >= 0 && i !== slot) M.squad.mates[i] = cur;
    M.squad.mates[slot] = id;
    if (id && !M.tactics[id]) M.tactics[id] = 'loot';
    save();
    return true;
  }
  function autoFill() {
    let n = 0;
    const used = {};
    if (M.squad.lead) used[M.squad.lead] = 1;
    M.squad.mates.forEach(id => { if (id) used[id] = 1; });
    const free = C.crew.map(c => c.id).filter(id => M.chars[id] && !used[id]);
    for (let s = 0; s < M.squad.mates.length && free.length; s++) {
      if (M.squad.mates[s]) continue;
      const id = free.shift();
      M.squad.mates[s] = id;
      if (!M.tactics[id]) M.tactics[id] = 'loot';
      n++;
    }
    if (n) save();
    return n;
  }
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
      const i = mates.findIndex(x => x);
      if (i >= 0) { M.squad.lead = mates[i]; mates[i] = null; }
      else {
        const ids = C.crew.map(c => c.id).filter(id => M.chars[id]);
        if (ids.length) M.squad.lead = ids[0];
      }
    }
    M.squad.mates.forEach((id, i) => {
      if (id && !M.tactics[id]) M.tactics[id] = C.walletStart.mateTactics[i] || 'loot';
    });
  }
  function setTactic(id, tid) {
    if (!M.chars[id] || !C.tacticById[tid]) return false;
    M.tactics[id] = tid; save(); return true;
  }

  // ---------------------------------------------------------------------------
  // GACHA: ba băng, bảo hiểm riêng từng băng
  // ---------------------------------------------------------------------------
  // Mọi 5★ nằm trong `chars` của một băng giới hạn thì chỉ ra ở băng đó.
  const exclusive5 = {};
  C.banners.forEach(b => { (b.chars || []).forEach(id => { exclusive5[id] = b.id; }); });

  function poolFor(banner, star) {
    let list = C.crew.filter(c => c.star === star);
    if (star === 5) {
      list = banner.chars ? list.filter(c => banner.chars.indexOf(c.id) >= 0)
                          : list.filter(c => !exclusive5[c.id]);
    }
    return list;
  }

  function starFor(banner) {
    const st = M.pity[banner.id];
    st.c5++; st.c4++;
    let rate5 = banner.rate5;
    if (st.c5 > banner.soft) rate5 += (st.c5 - banner.soft) * C.gachaRules.softPityStep;
    if (st.c5 >= banner.hard || Math.random() < rate5) { st.c5 = 0; st.c4 = 0; return 5; }
    if (st.c4 >= banner.pity4 || Math.random() < banner.rate4) { st.c4 = 0; return 4; }
    return 3;
  }

  function pullOne(banner, star) {
    const c = pick(poolFor(banner, star));
    const have = M.chars[c.id];
    if (!have) {
      M.chars[c.id] = { lv: 0, shard: 0 };
      return { kind: 'char', id: c.id, star: star, isNew: true, shard: 0 };
    }
    have.shard += C.gachaRules.duplicateShard;
    return { kind: 'char', id: c.id, star: star, isNew: false, shard: C.gachaRules.duplicateShard };
  }

  function pull(bannerId, n, useTicket) {
    const b = C.bannerById[bannerId];
    if (!b) return { ok: false, why: 'Không có băng này.' };
    n = n === 10 ? 10 : 1;
    const cost = {};
    if (useTicket) cost[b.ticket] = n; else cost.gem = b.costGem * n;
    if (!spend(cost)) return { ok: false, why: useTicket ? 'Không đủ vé.' : 'Không đủ ngọc.' };
    const items = [];
    let got4 = false;
    for (let i = 0; i < n; i++) {
      let star = starFor(b);
      if (C.gachaRules.tenPullMin4Star && n === 10 && i === n - 1 && !got4 && star < 4) {
        star = 4; M.pity[b.id].c4 = 0;           // gói 10: lượt cuối bảo đảm ≥ 4★
      }
      if (star >= 4) got4 = true;
      items.push(pullOne(b, star));
    }
    M.counters.pulls += n; M.day.pulls += n;
    save(true);
    return { ok: true, items: items };
  }

  // ---------------------------------------------------------------------------
  // CỬA HÀNG — nạp GIẢ
  // ---------------------------------------------------------------------------
  function buyPack(packId) {
    const p = C.shopPacks.find(x => x.id === packId);
    if (!p) return { ok: false, why: 'Không có gói này.' };
    grant({ gem: p.gem + p.bonus });
    M.counters.spendVnd += p.vnd;
    save(true);
    return { ok: true, gem: p.gem + p.bonus };
  }
  function exchangeLeft(x) {
    if (M.shopLimit.day !== dayIndex()) { M.shopLimit.day = dayIndex(); M.shopLimit.used = {}; }
    return x.limit - (M.shopLimit.used[x.id] || 0);
  }
  function exchange(xid) {
    const x = C.shopExchange.find(e => e.id === xid);
    if (!x) return { ok: false, why: 'Không có hàng này.' };
    if (exchangeLeft(x) <= 0) return { ok: false, why: 'Hết lượt hôm nay.' };
    if (!spend({ gem: x.gem })) return { ok: false, why: 'Không đủ ngọc.' };
    grant(x.reward);
    M.shopLimit.used[x.id] = (M.shopLimit.used[x.id] || 0) + 1;
    save(true);
    return { ok: true, got: x.reward };
  }

  // ---------------------------------------------------------------------------
  // ĐỒ NGHỀ MANG VÀO CA: MỘT món, mang vào là mất. Mua đồ khác thì hoàn đủ món cũ.
  // ---------------------------------------------------------------------------
  function validLoadout(l) {
    if (!l || typeof l !== 'object') return null;
    const it = C.itemByKey[l.key];
    if (!it || !it.loadoutPrice) return null;
    return { key: l.key, paid: Math.round(num(l.paid, 0, it.loadoutPrice)) };
  }
  const loadoutItems = () => C.items.filter(it => it.loadoutPrice);
  function loadoutBuy(key) {
    const it = C.itemByKey[key];
    if (!it || !it.loadoutPrice) return { ok: false, why: 'Sảnh không bán món này.' };
    const old = validLoadout(M.loadout);
    if (old && old.key === key) return { ok: false, why: 'Đang mang món này rồi.' };
    const back = old ? old.paid : 0;
    if ((M.gold || 0) + back < it.loadoutPrice) return { ok: false, why: 'Không đủ vàng.' };
    M.gold += back - it.loadoutPrice;
    M.loadout = { key: key, paid: it.loadoutPrice };
    save();
    return { ok: true, item: it, swapped: !!old };
  }
  function loadoutRefund() {
    const old = validLoadout(M.loadout);
    if (!old) return { ok: false, why: 'Chưa mang gì.' };
    M.loadout = null;
    grant({ gold: old.paid });
    save();
    return { ok: true, gold: old.paid };
  }

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ
  // ---------------------------------------------------------------------------
  function rollQuests() {
    const d = dayIndex(), w = weekIndex();
    let changed = false;
    if (M.quests.day !== d) {
      changed = true;
      M.quests.day = d;
      const pool = C.quests.daily.slice();
      M.quests.daily = [];
      for (let i = 0; i < 5 && pool.length; i++) {
        M.quests.daily.push(pool.splice((Math.random() * pool.length) | 0, 1)[0].id);
      }
      M.day = freshState().day;
      Object.keys(M.quests.claimed).forEach(k => { if (k[0] === 'd') delete M.quests.claimed[k]; });
      M.shopLimit = { day: d, used: {} };
    }
    if (M.quests.week !== w) {
      changed = true;
      M.quests.week = w;
      M.quests.weekly = C.quests.weekly.map(q => q.id);     // tuần: lấy hết cả 4
      M.week = freshState().week;
      Object.keys(M.quests.claimed).forEach(k => { if (k[0] === 'w') delete M.quests.claimed[k]; });
    }
    if (changed) save();
  }

  function counterValue(scope, key) {
    if (scope === 'daily') return M.day[key] || 0;
    if (scope === 'weekly') return M.week[key] || 0;
    if (key === 'mapsDone') return C.maps.filter(m => M.maps[m.id] && M.maps[m.id].cleared).length;
    if (key === 'own5') return Object.keys(M.chars).filter(id => C.crewById[id] && C.crewById[id].star === 5).length;
    if (key === 'squadFull') return squadList().length;
    return M.counters[key] || 0;
  }
  function questList() {
    rollQuests();
    const out = { daily: [], weekly: [], ach: [] };
    const view = (q, scope) => {
      const cur = counterValue(scope, q.counter);
      const claimed = scope === 'ach' ? !!M.quests.achClaimed[q.id] : !!M.quests.claimed[q.id];
      return { id: q.id, text: q.text, need: q.need, cur: Math.min(cur, q.need),
               done: cur >= q.need, claimed: claimed, r: q.r, scope: scope };
    };
    M.quests.daily.forEach(id => { const q = C.quests.daily.find(x => x.id === id); if (q) out.daily.push(view(q, 'daily')); });
    M.quests.weekly.forEach(id => { const q = C.quests.weekly.find(x => x.id === id); if (q) out.weekly.push(view(q, 'weekly')); });
    C.quests.ach.forEach(q => out.ach.push(view(q, 'ach')));
    return out;
  }
  function claimQuest(id) {
    const all = questList();
    const q = all.daily.concat(all.weekly, all.ach).find(x => x.id === id);
    if (!q || !q.done || q.claimed) return { ok: false, why: 'Chưa xong.' };
    grant(q.r);
    if (q.scope === 'ach') M.quests.achClaimed[id] = 1; else M.quests.claimed[id] = 1;
    save(true);
    return { ok: true, r: q.r };
  }
  function claimAll() {
    const all = questList();
    const got = {};
    all.daily.concat(all.weekly, all.ach).forEach(q => {
      if (q.done && !q.claimed) {
        const r = claimQuest(q.id);
        if (r.ok) for (const k in q.r) got[k] = (got[k] || 0) + q.r[k];
      }
    });
    return got;
  }
  function questPending() {
    const q = questList();
    return q.daily.concat(q.weekly, q.ach).filter(x => x.done && !x.claimed).length;
  }

  // ---------------------------------------------------------------------------
  // RA KHƠI / VỀ BẾN — hai chỗ duy nhất game trong ca được phép chạm vào meta.
  // ---------------------------------------------------------------------------

  // Trả về những gì ca lặn cần: người lặn (tổ trưởng), bốn đồng đội (bot không lặn, chỉ cộng chỉ số
  // theo chiến thuật), và món đồ nghề đã mua.
  // XOÁ ĐỒ NGHỀ TRƯỚC KHI TRẢ: ghi save rồi mới trả thì một cú ngoặc ở giữa không thể nhân đôi món đồ.
  function runStart() {
    repairSquad();
    const leadId = M.squad.lead;
    const st = charStats(leadId, null);
    const def = C.crewById[leadId];
    const lv = st.lv;

    const mates = [];
    const teamBonus = { atk: 0, grit: 0, carry: 0, luck: 0, eye: 0, spd: 0, cd: 0 };
    M.squad.mates.forEach(id => {
      if (!id || !M.chars[id]) return;
      const t = M.tactics[id] || 'loot';
      mates.push({ id: id, tactic: t });
      const tac = C.tacticById[t];
      for (const k in tac.bonus) teamBonus[k] = (teamBonus[k] || 0) + tac.bonus[k];
    });

    const lo = validLoadout(M.loadout);
    M.loadout = null;
    save(true);
    runActive = true;

    const cdMul = 1 - st.cd;
    const skill = Object.assign({}, def.skill);
    skill.cd = def.skill.cd * cdMul;
    return {
      lead: {
        id: leadId, lv: lv, star: def.star,
        stats: {
          hpMul: st.hp / 105,                // 105 = hp gốc của Flare, mốc của O₂ tối đa
          atkMul: st.atk / 9,                // 9 = atk gốc của Flare
          spd: st.spd, carry: st.carry, grit: st.grit,
          cdMul: cdMul, luck: st.luck, eye: st.eye
        },
        skill: skill,
        passive: { id: leadId, active: st.passiveOn, name: C.passives[leadId].name, vals: C.passives[leadId].vals }
      },
      mates: mates,
      teamBonus: teamBonus,
      loadout: lo ? { key: lo.key, uses: C.itemByKey[lo.key].uses } : null
    };
  }

  // res: { delivered, mapsCleared (số chuyến đã qua, hoặc mảng id), win, kills, skills, floors, lootValue }
  // Vàng = round(delivered x 0,55) + thưởng mỗi chuyến đã qua; chuyến qua lần đầu thêm thưởng lần đầu.
  function runFinish(res) {
    res = res || {};
    runActive = false;
    const delivered = Math.round(num(res.delivered, 0, 1e9));
    const lootValue = res.lootValue == null ? delivered : Math.round(num(res.lootValue, 0, 1e9));
    const kills = Math.round(num(res.kills, 0, 1e6));
    const skills = Math.round(num(res.skills, 0, 1e6));
    const floors = Math.round(num(res.floors, 0, 1e4));
    const win = !!res.win;

    let ids = [];
    if (Array.isArray(res.mapsCleared)) ids = res.mapsCleared.filter(id => C.mapById[id]);
    else ids = C.maps.slice(0, Math.round(num(res.mapsCleared, 0, C.maps.length))).map(m => m.id);
    if (win) ids = C.maps.map(m => m.id);                     // thắng ca = qua đủ năm chuyến
    ids = ids.filter((id, i) => ids.indexOf(id) === i);

    const c = M.counters;
    c.runs++; M.day.runs++;
    c.loot += lootValue; M.day.loot += lootValue; M.week.loot += lootValue;
    c.kills += kills; M.day.kills += kills; M.week.kills += kills;
    c.skills += skills; M.day.skills += skills;
    c.floors += floors; M.day.floors += floors;
    if (win) { c.wins++; M.week.wins++; }

    const base = Math.round(delivered * C.runReward.lootGoldRate);
    const reward = { delivered: delivered, base: base, gold: base, gem: 0, win: win,
                     cleared: ids.slice(), firstClear: [], clearGold: 0, clearGem: 0, firstGold: 0, firstGem: 0 };
    ids.forEach(id => {
      const m = C.mapById[id];
      const st = M.maps[id];
      reward.clearGold += m.clear.gold; reward.clearGem += m.clear.gem;
      if (!st.cleared) {
        st.cleared = true;
        reward.firstClear.push(id);
        reward.firstGold += m.first.gold; reward.firstGem += m.first.gem;
      }
      st.best = Math.max(st.best || 0, delivered);
    });
    reward.gold += reward.clearGold + reward.firstGold;
    reward.gem += reward.clearGem + reward.firstGem;
    grant({ gold: reward.gold, gem: reward.gem });
    save(true);
    return reward;
  }

  // ---------------------------------------------------------------------------
  // Đồng bộ hub (không bắt buộc, không được chặn gì)
  // ---------------------------------------------------------------------------
  async function syncFromHub() {
    try {
      if (!(root.HubSave && root.HubSave.loadSave)) return { ok: false, reason: 'no-account' };
      if (root.HubSave.isAvailable && !root.HubSave.isAvailable()) return { ok: false, reason: 'no-account' };
      const r = await root.HubSave.loadSave(CLOUD_ID);
      if (r && r.ok && r.found && r.payload && r.payload.counters) {
        if (runActive) return { ok: true, took: 'local-in-run' };      // không bao giờ tráo save giữa ván
        const cs = (r.payload.counters.runs || 0) + (r.payload.counters.pulls || 0);
        const ls = (M.counters.runs || 0) + (M.counters.pulls || 0);
        if (cs > ls) { M = migrate(r.payload); repairSquad(); rollQuests(); save(); return { ok: true, took: 'cloud' }; }
      }
      return { ok: true, took: 'local' };
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  const meta = BDL.meta = {
    load, save, hardReset, syncFromHub,
    can, spend, grant, money,
    own, levelCost, levelMul, levelUp, charStats,
    squadList, squadPower, setLead, setMate, autoFill, setTactic, repairSquad,
    pull, poolFor, buyPack, exchange, exchangeLeft,
    loadoutItems, loadoutBuy, loadoutRefund, loadout: () => (M.loadout = validLoadout(M.loadout)),
    rollQuests, questList, claimQuest, claimAll, questPending,
    runStart, runFinish,
    isRunning: () => runActive
  };
  Object.defineProperty(meta, 'M', { get: function () { return M; }, enumerable: true });
  Object.defineProperty(BDL, 'M', { get: function () { return M; }, configurable: true });

})(window);
